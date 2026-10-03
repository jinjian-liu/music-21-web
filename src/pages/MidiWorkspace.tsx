import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { MidiPlaybackEngine } from "../audio/midi-player";
import type { KeyboardNote } from "../audio/keyboard";
import { ScoreTimeline } from "../components/ScoreTimeline";
import { VirtualKeyboard } from "../components/VirtualKeyboard";
import { localDB, migrateLocal, type LocalPiece } from "../lib/local-db";
import { api, json, errorText } from "../lib/api";
import { saveToCloud } from "../lib/cloud";
import { PracticeClock } from "../features/practice/session";
import { Modal, Notice } from "../components/ui";
import { publicationLabels, type PieceSummary } from "../../shared/contracts";
import { createDemoSong } from "../midi/demo-song";
import type { KeyMode, PlaybackMode } from "../midi/types";

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${Math.floor(safe % 60)
    .toString()
    .padStart(2, "0")}`;
}

export function MidiWorkspace() {
  const { pieceId = "" } = useParams();
  const location = useLocation();
  const initialSong = useMemo(
    () => (pieceId === "demo" ? createDemoSong() : null),
    [pieceId],
  );
  const [song, setSong] = useState(initialSong);
  const [loading, setLoading] = useState(!initialSong);
  const [localPiece, setLocalPiece] = useState<LocalPiece | null>(null);
  const [metadata, setMetadata] = useState<PieceSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportEmail, setReportEmail] = useState("");
  const [reportDetail, setReportDetail] = useState("");
  const [reportReason, setReportReason] = useState("other");
  const [keyboardOpen, setKeyboardOpen] = useState(true);
  const [tracksOpen, setTracksOpen] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const clock = useRef(new PracticeClock());
  const alive = useRef(true);
  const preparing = useRef(false);
  const operation = useRef(0);
  const pendingSave = useRef<
    import("../../shared/contracts").PracticeSession | null
  >(null);
  const counted = useRef(false);
  const publicPiece = location.pathname.startsWith("/pieces/");
  const adminPreview = location.pathname.startsWith("/admin/preview/");
  const cloudId =
    localPiece?.cloudId ||
    (!localPiece && pieceId !== "demo" && !publicPiece ? pieceId : null);
  const [selectedTracks, setSelectedTracks] = useState<string[]>(
    () => song?.tracks.map((track) => track.id) || [],
  );
  const [soloTrack, setSoloTrack] = useState<string | null>(null);
  const [practiceTrack, setPracticeTrack] = useState<string | null>(
    () => song?.tracks.find((track) => !track.percussion)?.id || null,
  );
  const [mode, setMode] = useState<PlaybackMode>("listen");
  const [keyMode, setKeyMode] = useState<KeyMode>("movable");
  const [tonic, setTonic] = useState(song?.inferredKey || "C");
  const [speed, setSpeed] = useState(1);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [feedback, setFeedback] = useState(
    "选择音轨后开始播放；简谱会沿中央播放线流动。",
  );
  const [publishOpen, setPublishOpen] = useState(false);
  const [author, setAuthor] = useState("");
  const [rightsSource, setRightsSource] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [userNotes, setUserNotes] = useState(new Set<number>());
  const engineRef = useRef(new MidiPlaybackEngine());
  const anchorRef = useRef({ audioTime: 0, songTime: 0 });
  const noteIndices = useRef(new Map<string, number>());
  const positionRef = useRef(0);

  useEffect(() => {
    if (initialSong) return;
    let canceled = false;
    setLoading(true);
    void (async () => {
      let next: import("../midi/types").ParsedSong;
      if (publicPiece) {
        const payload = await api<{
          score: import("../midi/types").ParsedSong;
        }>(`/api/public/pieces/${pieceId}`);
        next = payload.score;
      } else if (adminPreview) {
        next = await api(`/api/admin/pieces/${pieceId}/score`);
      } else {
        await migrateLocal();
        const local = await localDB.get(pieceId);
        if (local) {
          next = local.song;
          if (!canceled) setLocalPiece(local);
        } else {
          next = await api(`/api/pieces/${pieceId}/score`);
          const meta = await api<PieceSummary>(`/api/pieces/${pieceId}/status`);
          if (!canceled) {
            setMetadata(meta);
            setAuthor(meta.author || "");
            setRightsSource(meta.rightsSource || "");
            setRightsConfirmed(meta.rightsConfirmed || false);
          }
        }
      }
      if (!canceled) setSong(next);
    })()
      .catch((error) => {
        if (!canceled) setFeedback(errorText(error));
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [initialSong, publicPiece, adminPreview, pieceId]);

  useEffect(() => {
    if (!cloudId || publicPiece || adminPreview) return;
    let active = true;
    const load = () => {
      void api<PieceSummary>(`/api/pieces/${cloudId}/status`)
        .then((data) => {
          if (active) setMetadata(data);
        })
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [cloudId, publicPiece, adminPreview]);

  useEffect(() => {
    if (!song) return;
    setSelectedTracks(song.tracks.map((track) => track.id));
    setPracticeTrack(
      song.tracks.find((track) => !track.percussion)?.id || null,
    );
    setTonic(song.inferredKey);
  }, [song?.id]);

  useEffect(() => {
    if (song && !adminPreview)
      void localDB
        .setSetting("last-workspace", {
          route: location.pathname,
          title: song.title,
          tracks: song.tracks.length,
        })
        .catch(() => undefined);
  }, [song?.id, song?.title, adminPreview, location.pathname]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current += 1;
      engineRef.current.dispose();
      const session = pendingSave.current || clock.current.finish();
      if (session) void localDB.saveSession(session).catch(console.error);
    };
  }, []);

  useEffect(() => {
    const hidden = () => {
      if (document.hidden) pausePlayback("页面已切到后台，练习暂停。");
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  });

  useEffect(() => {
    let active = true;
    void localDB
      .setting<any>("workspace:" + pieceId, null)
      .then((saved) => {
        if (!saved || !active) return;
        setSpeed(saved.speed || 1);
        setKeyMode(saved.keyMode || "movable");
        setLoop(Boolean(saved.loop));
        setKeyboardOpen(saved.keyboardOpen !== false);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [pieceId]);

  useEffect(() => {
    if (!song) return;
    const timer = setTimeout(() => {
      void localDB
        .setSetting("workspace:" + pieceId, {
          speed,
          keyMode,
          loop,
          keyboardOpen,
        })
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(timer);
  }, [song, pieceId, speed, keyMode, loop, keyboardOpen]);

  async function finishPractice() {
    pausePlayback();
    const session = pendingSave.current || clock.current.finish();
    setSessionStarted(false);
    if (!session) return;
    pendingSave.current = session;
    try {
      await localDB.saveSession(session);
      pendingSave.current = null;
      setFeedback(
        `本次练习 ${Math.floor(session.activeMs / 1000)} 秒，已保存在本机练习记录。`,
      );
    } catch (error) {
      setFeedback(errorText(error) + "，点击结束练习可重试保存。");
      setSessionStarted(true);
    }
  }

  const effectiveTracks = useMemo(() => {
    if (!song) return [];
    return song.tracks.filter(
      (track) =>
        selectedTracks.includes(track.id) &&
        (!soloTrack || track.id === soloTrack),
    );
  }, [song, selectedTracks, soloTrack]);

  const highlightedNotes = useMemo(() => {
    const notes = new Set<number>();
    effectiveTracks
      .filter((track) => !track.percussion)
      .forEach((track) =>
        track.notes.forEach((note) => {
          if (
            position >= note.startSeconds &&
            position < note.startSeconds + Math.max(0.06, note.durationSeconds)
          )
            notes.add(note.midi);
        }),
      );
    return notes;
  }, [effectiveTracks, position]);

  function currentPosition(): number {
    if (!playing) return positionRef.current;
    return (
      anchorRef.current.songTime +
      (engineRef.current.currentTime - anchorRef.current.audioTime) * speed
    );
  }

  function resetIndices(at: number) {
    if (!song) return;
    const next = new Map<string, number>();
    song.tracks.forEach((track) => {
      let low = 0;
      let high = track.notes.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (track.notes[middle].startSeconds < at - 0.02) low = middle + 1;
        else high = middle;
      }
      next.set(track.id, low);
    });
    noteIndices.current = next;
  }

  function pausePlayback(message = "已暂停，当前位置已保留。") {
    operation.current += 1;
    clock.current.pause();
    const nextPosition = Math.min(
      song?.durationSeconds || 0,
      currentPosition(),
    );
    positionRef.current = nextPosition;
    setPosition(nextPosition);
    setPlaying(false);
    setUserNotes(new Set());
    engineRef.current.stopAll();
    setFeedback(message);
  }

  async function startPlayback() {
    if (pendingSave.current) {
      setFeedback("上一段练习尚未保存，请先点击结束练习重试。");
      return;
    }
    if (preparing.current) return;
    if (!song || !effectiveTracks.length) {
      setFeedback("请至少选择一条音轨。");
      return;
    }
    try {
      preparing.current = true;
      const op = ++operation.current;
      await engineRef.current.prepare();
      if (!alive.current || op !== operation.current) {
        engineRef.current.stopAll();
        return;
      }
      const startAt = position >= song.durationSeconds - 0.05 ? 0 : position;
      positionRef.current = startAt;
      setPosition(startAt);
      resetIndices(startAt);
      anchorRef.current = {
        audioTime: engineRef.current.currentTime,
        songTime: startAt,
      };
      setPlaying(true);
      if (mode === "practice") {
        clock.current.start(pieceId, song.title, practiceTrack);
        setSessionStarted(true);
      }
      if (publicPiece && !counted.current) {
        counted.current = true;
        void api(`/api/public/pieces/${pieceId}/play`, {
          method: "POST",
        }).catch(() => undefined);
      }
      setFeedback(
        mode === "practice"
          ? "跟练开始：目标轨已静音，请跟随中央播放线演奏。"
          : "自动演奏中：可观察简谱和琴键同步流转。",
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "音频引擎启动失败");
    } finally {
      preparing.current = false;
    }
  }

  useEffect(() => {
    if (!playing || !song) return;
    let frame = 0;
    const schedule = () => {
      const nowPosition = currentPosition();
      const horizon = nowPosition + 0.12 * speed;
      effectiveTracks.forEach((track) => {
        if (mode === "practice" && track.id === practiceTrack) return;
        let index = noteIndices.current.get(track.id) || 0;
        while (
          index < track.notes.length &&
          track.notes[index].startSeconds <= horizon
        ) {
          const note = track.notes[index];
          if (note.startSeconds >= nowPosition - 0.025) {
            const delay = (note.startSeconds - nowPosition) / speed;
            if (track.percussion)
              engineRef.current.scheduleDrum(note.midi, delay, note.velocity);
            else
              engineRef.current.scheduleNote(
                note.midi,
                delay,
                note.durationSeconds / speed,
                note.velocity,
              );
          }
          index += 1;
        }
        noteIndices.current.set(track.id, index);
      });
    };
    const interval = window.setInterval(schedule, 25);
    schedule();
    const animate = () => {
      const next = currentPosition();
      if (next >= song.durationSeconds) {
        if (loop) {
          engineRef.current.stopAll();
          resetIndices(0);
          anchorRef.current = {
            audioTime: engineRef.current.currentTime,
            songTime: 0,
          };
          positionRef.current = 0;
          setPosition(0);
        } else {
          engineRef.current.stopAll();
          positionRef.current = song.durationSeconds;
          setPosition(song.durationSeconds);
          setPlaying(false);
          clock.current.pause();
          if (clock.current.started) void finishPractice();
          else setFeedback("播放完成。");
          return;
        }
      } else {
        positionRef.current = next;
        setPosition(next);
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      window.clearInterval(interval);
      cancelAnimationFrame(frame);
    };
  }, [playing, song, effectiveTracks, mode, practiceTrack, loop, speed]);

  function changeTransport(mutator: () => void) {
    if (playing) pausePlayback("设置已更新，点击播放从当前位置继续。");
    mutator();
  }

  function seek(next: number) {
    clock.current.pause();
    operation.current += 1;
    if (playing) engineRef.current.stopAll();
    setPlaying(false);
    positionRef.current = next;
    setPosition(next);
    resetIndices(next);
    setFeedback(`已定位到 ${formatTime(next)}。`);
  }

  function handlePracticeNote(note: KeyboardNote) {
    setUserNotes((items) => new Set(items).add(note.midi));
    if (mode !== "practice" || !playing || !song || !practiceTrack) return;
    const track = song.tracks.find((item) => item.id === practiceTrack);
    const candidates =
      track?.notes.filter(
        (target) => Math.abs(target.startSeconds - positionRef.current) <= 0.15,
      ) || [];
    const match = candidates.find((target) => target.midi === note.midi);
    if (match)
      setFeedback(
        `${note.name} 命中 · ${Math.round((positionRef.current - match.startSeconds) * 1000)}ms`,
      );
    else setFeedback(`${note.name} 不在当前目标音簇中`);
  }

  async function submitForReview() {
    if (!song || !cloudId || pieceId === "demo") {
      setFeedback("请先将本机曲目保存到私人云端，再提交公开审核。");
      return;
    }
    if (!rightsSource || !rightsConfirmed) {
      setFeedback("请填写权利来源并确认拥有公开发布权限。");
      return;
    }
    setBusy(true);
    try {
      const updated = await api<PieceSummary>(`/api/pieces/${cloudId}`, {
        method: "PATCH",
        body: json({
          title: song.title,
          author,
          rightsSource,
          rightsConfirmed,
        }),
      });
      if (updated.publicationStatus !== "pending_review")
        await api(`/api/pieces/${cloudId}/submit-review`, { method: "POST" });
      setFeedback("已提交审核，通过后会出现在发现曲目。");
      setPublishOpen(false);
      setMetadata(await api<PieceSummary>(`/api/pieces/${cloudId}/status`));
    } catch (error) {
      setFeedback(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function reportPiece() {
    setBusy(true);
    try {
      await api(`/api/public/pieces/${pieceId}/reports`, {
        method: "POST",
        body: json({
          email: reportEmail,
          reason: reportReason,
          detail: reportDetail,
        }),
      });
      setReportOpen(false);
      setFeedback("举报已提交，管理员会进行核查。");
    } catch (error) {
      setFeedback(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveCloud() {
    if (!localPiece) return;
    setBusy(true);
    try {
      await saveToCloud(localPiece);
      setLocalPiece((await localDB.get(localPiece.id)) || localPiece);
      setFeedback("已保存到私人云端。解析完成后可提交公开审核。");
    } catch (error) {
      setFeedback(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <main className="workspace-missing">
        <h1>正在准备曲谱…</h1>
      </main>
    );
  if (!song)
    return (
      <main className="workspace-missing">
        <h1>暂时无法打开曲目</h1>
        <p>{feedback}</p>
        <Link className="button" to="/library">
          返回曲库
        </Link>{" "}
        <Link className="button" to="/settings">
          账号设置
        </Link>
      </main>
    );

  return (
    <div className="midi-workspace">
      <header className="workspace-header">
        <Link
          to={adminPreview ? "/admin/reviews" : "/library"}
          className="workspace-back"
        >
          ← {adminPreview ? "返回审核" : "我的曲库"}
        </Link>
        <div>
          <p className="eyebrow">
            专注练习 ·{" "}
            {adminPreview
              ? "审核预览"
              : publicPiece
                ? "公开曲目"
                : pieceId === "demo"
                  ? "内置示例"
                  : metadata
                    ? publicationLabels[metadata.publicationStatus]
                    : "本机保存"}
          </p>
          <h1>{song.title}</h1>
          <span>
            {song.tracks.length} 条音轨 · {formatTime(song.durationSeconds)} ·{" "}
            {song.inferredKey} {song.inferredMode === "major" ? "大调" : "小调"}
          </span>
        </div>
        <div className="workspace-share">
          <Link to="/practice">练习记录</Link>
          {localPiece && (
            <button disabled={busy} onClick={() => void saveCloud()}>
              {busy ? "处理中…" : "保存到云端"}
            </button>
          )}
          {publicPiece ? (
            <button
              type="button"
              onClick={() => {
                pausePlayback();
                setReportOpen(true);
              }}
            >
              举报曲目
            </button>
          ) : (
            !adminPreview &&
            pieceId !== "demo" && (
              <button
                type="button"
                disabled={
                  busy ||
                  !cloudId ||
                  metadata?.parseStatus !== "ready" ||
                  metadata?.publicationStatus === "pending_review" ||
                  metadata?.publicationStatus === "removed"
                }
                onClick={() => {
                  pausePlayback();
                  setPublishOpen(true);
                }}
              >
                提交发布
              </button>
            )
          )}
        </div>
      </header>

      {publishOpen && (
        <Modal title="提交公开审核" onClose={() => setPublishOpen(false)}>
          <form
            className="publish-panel"
            onSubmit={(event) => {
              event.preventDefault();
              void submitForReview();
            }}
          >
            <strong>提交公开审核</strong>
            <input
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="作者或编曲者"
              value={author}
            />
            <input
              onChange={(event) => setRightsSource(event.target.value)}
              placeholder="权利来源、授权方式或原创说明"
              required
              value={rightsSource}
            />
            <label>
              <input
                checked={rightsConfirmed}
                onChange={(event) => setRightsConfirmed(event.target.checked)}
                type="checkbox"
              />
              我确认拥有公开发布该 MIDI 的权利
            </label>
            <button type="submit" disabled={busy}>
              提交审核
            </button>
            <Notice>{feedback}</Notice>
          </form>
        </Modal>
      )}
      {reportOpen && (
        <Modal title="举报曲目" onClose={() => setReportOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void reportPiece();
            }}
          >
            <label>
              联系邮箱
              <input
                type="email"
                required
                value={reportEmail}
                onChange={(e) => setReportEmail(e.target.value)}
              />
            </label>
            <label>
              问题类型
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
              >
                <option value="copyright">版权问题</option>
                <option value="incorrect">乐谱错误</option>
                <option value="abuse">滥用内容</option>
                <option value="other">其他</option>
              </select>
            </label>
            <label>
              详细说明
              <textarea
                required
                minLength={3}
                maxLength={2000}
                value={reportDetail}
                onChange={(e) => setReportDetail(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              提交举报
            </button>
            <Notice>{feedback}</Notice>
          </form>
        </Modal>
      )}
      <button
        className="mobile-tracks"
        onClick={() => setTracksOpen((v) => !v)}
      >
        {tracksOpen ? "收起音轨设置" : "音轨与唱名设置"}
      </button>

      <div className="workspace-body">
        <aside className={tracksOpen ? "track-panel open" : "track-panel"}>
          <div className="panel-heading">
            <p className="eyebrow">Tracks</p>
            <h2>音轨</h2>
            <span>
              {selectedTracks.length}/{song.tracks.length}
            </span>
          </div>
          {song.tracks.map((track) => (
            <div
              className={`track-row${soloTrack === track.id ? " solo" : ""}`}
              key={track.id}
            >
              <label>
                <input
                  checked={selectedTracks.includes(track.id)}
                  onChange={() =>
                    changeTransport(() =>
                      setSelectedTracks((items) =>
                        items.includes(track.id)
                          ? items.filter((id) => id !== track.id)
                          : [...items, track.id],
                      ),
                    )
                  }
                  type="checkbox"
                />
                <span>
                  <b>{track.name}</b>
                  <small>
                    {track.percussion
                      ? "打击乐节奏"
                      : `${track.instrument} · ${track.noteCount} 音`}
                  </small>
                </span>
              </label>
              <button
                className={soloTrack === track.id ? "active" : ""}
                onClick={() =>
                  changeTransport(() =>
                    setSoloTrack((current) =>
                      current === track.id ? null : track.id,
                    ),
                  )
                }
                type="button"
              >
                S
              </button>
              {!track.percussion && (
                <button
                  className={
                    practiceTrack === track.id ? "target active" : "target"
                  }
                  onClick={() => {
                    if (clock.current.started) void finishPractice();
                    changeTransport(() => setPracticeTrack(track.id));
                  }}
                  title="设为跟练目标"
                  type="button"
                >
                  练
                </button>
              )}
            </div>
          ))}
          <div className="notation-settings">
            <label>
              唱名
              <select
                value={keyMode}
                onChange={(event) => setKeyMode(event.target.value as KeyMode)}
              >
                <option value="movable">首调唱名</option>
                <option value="fixed">固定 C=1</option>
              </select>
            </label>
            <label>
              主音
              <select
                disabled={keyMode === "fixed"}
                value={tonic}
                onChange={(event) => setTonic(event.target.value)}
              >
                {[
                  "C",
                  "C♯",
                  "D",
                  "E♭",
                  "E",
                  "F",
                  "F♯",
                  "G",
                  "A♭",
                  "A",
                  "B♭",
                  "B",
                ].map((key) => (
                  <option key={key}>{key}</option>
                ))}
              </select>
            </label>
          </div>
        </aside>

        <main className="score-workspace">
          <div className="transport-bar">
            <button
              className="transport-play"
              aria-label={
                playing ? "暂停" : mode === "practice" ? "开始练习" : "开始播放"
              }
              onClick={() => (playing ? pausePlayback() : void startPlayback())}
              type="button"
            >
              {playing ? "Ⅱ" : "▶"}
            </button>
            <span>{formatTime(position)}</span>
            <input
              aria-label="播放进度"
              max={song.durationSeconds}
              min="0"
              onChange={(event) => seek(Number(event.target.value))}
              step="0.01"
              type="range"
              value={position}
            />
            <span>{formatTime(song.durationSeconds)}</span>
            <select
              aria-label="速度"
              value={speed}
              onChange={(event) =>
                changeTransport(() => setSpeed(Number(event.target.value)))
              }
            >
              {[0.5, 0.75, 1, 1.25, 1.5].map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
            <div className="mode-switch">
              <button
                className={mode === "listen" ? "active" : ""}
                onClick={() => {
                  if (clock.current.started) void finishPractice();
                  changeTransport(() => setMode("listen"));
                }}
                type="button"
              >
                自动演奏
              </button>
              <button
                className={mode === "practice" ? "active" : ""}
                onClick={() => changeTransport(() => setMode("practice"))}
                type="button"
              >
                伴奏跟练
              </button>
            </div>
            <label className="loop-toggle">
              <input
                checked={loop}
                onChange={(event) => setLoop(event.target.checked)}
                type="checkbox"
              />
              循环
            </label>
            {sessionStarted && (
              <button onClick={() => void finishPractice()}>结束练习</button>
            )}
          </div>

          <ScoreTimeline
            onSeek={seek}
            keyMode={keyMode}
            positionSeconds={position}
            song={song}
            tonic={tonic}
            trackIds={effectiveTracks.map((track) => track.id)}
          />

          <div className="workspace-feedback">
            <strong>{feedback}</strong>
            <span>中央竖线是当前节拍 · 绿色键为正在演奏或等待跟练的音</span>
          </div>

          <button
            className="keyboard-toggle"
            onClick={() => {
              setKeyboardOpen((v) => !v);
              setUserNotes(new Set());
            }}
          >
            {keyboardOpen ? "收起钢琴键盘" : "展开钢琴键盘"}
          </button>
          {keyboardOpen && (
            <VirtualKeyboard
              key={String(playing)}
              disabled={publishOpen || reportOpen}
              activeNotes={userNotes}
              highlightedNotes={highlightedNotes}
              onNoteOn={handlePracticeNote}
              onNoteOff={(note) =>
                setUserNotes((items) => {
                  const next = new Set(items);
                  next.delete(note.midi);
                  return next;
                })
              }
            />
          )}
        </main>
      </div>
    </div>
  );
}
