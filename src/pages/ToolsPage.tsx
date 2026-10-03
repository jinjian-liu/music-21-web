import { useEffect, useRef, useState } from "react";
import { VirtualKeyboard } from "../components/VirtualKeyboard";
import { PracticeEngine } from "../audio/practice-engine";
import { frequencyToNote, isMatchingNote } from "../audio/pitch";
import { inspectBrowserCapability } from "../audio/capabilities";
import type { NoteReading } from "../domain/audio";
import { PageHeading, Notice } from "../components/ui";
import { PracticeClock } from "../features/practice/session";
import { localDB } from "../lib/local-db";
import { errorText } from "../lib/api";
export function ToolsPage() {
  const [tab, setTab] = useState("piano");
  return (
    <>
      <PageHeading
        eyebrow="A GOOD START SOUNDS RIGHT"
        title="练习工具"
        description="调准一个音，找到一个节拍，再开始今天的练习。"
      />
      <div className="segmented tool-tabs">
        {[
          ["piano", "虚拟钢琴"],
          ["tuner", "调音与检测"],
          ["metronome", "节拍器"],
          ["single", "单音练习"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="panel tool-panel">
        {tab === "piano" ? (
          <FreePiano />
        ) : tab === "metronome" ? (
          <Metronome />
        ) : (
          <PitchTool key={tab} practice={tab === "single"} />
        )}
      </div>
    </>
  );
}
function FreePiano() {
  const [notes, setNotes] = useState(new Set<number>());
  return (
    <>
      <h2>指尖上的钢琴</h2>
      <p className="muted">
        T 键是中央 C。也可以直接点击琴键，或在触屏上演奏。
      </p>
      <VirtualKeyboard
        activeNotes={notes}
        onNoteOn={(n) => setNotes((s) => new Set(s).add(n.midi))}
        onNoteOff={(n) =>
          setNotes((s) => {
            const next = new Set(s);
            next.delete(n.midi);
            return next;
          })
        }
      />
    </>
  );
}
function Metronome() {
  const [bpm, setBpm] = useState(80),
    [beats, setBeats] = useState(4),
    [running, setRunning] = useState(false),
    [beat, setBeat] = useState(0),
    [error, setError] = useState("");
  const context = useRef<AudioContext | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null);
  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    void context.current?.close();
    context.current = null;
    setRunning(false);
    setBeat(0);
  }
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      if (timer.current) clearInterval(timer.current);
      void context.current?.close();
    };
  }, []);
  async function start() {
    stop();
    try {
      const ctx = new AudioContext();
      context.current = ctx;
      await ctx.resume();
      if (context.current !== ctx) return;
      setRunning(true);
      let next = ctx.currentTime,
        index = 0;
      const tick = () => {
        while (next < ctx.currentTime + 0.08) {
          const oscillator = ctx.createOscillator(),
            gain = ctx.createGain();
          oscillator.frequency.value = index % beats === 0 ? 1100 : 750;
          gain.gain.setValueAtTime(0.16, next);
          gain.gain.exponentialRampToValueAtTime(0.001, next + 0.04);
          oscillator.connect(gain).connect(ctx.destination);
          oscillator.start(next);
          oscillator.stop(next + 0.05);
          setBeat(index % beats);
          index++;
          next += 60 / bpm;
        }
      };
      tick();
      timer.current = setInterval(tick, 25);
    } catch (e) {
      stop();
      setError(errorText(e));
    }
  }
  return (
    <div className="metronome">
      <p className="eyebrow">FIND YOUR TEMPO</p>
      <h2>稳稳地，跟上节奏</h2>
      <div className="tempo-number">
        {bpm}
        <small>BPM</small>
      </div>
      <label>
        速度
        <input
          type="range"
          aria-label="节拍器速度"
          min="30"
          max="240"
          value={bpm}
          onChange={(e) => {
            stop();
            setBpm(+e.target.value);
          }}
        />
      </label>
      <div className="beat-dots">
        {Array.from({ length: beats }, (_, i) => (
          <i key={i} className={running && i === beat ? "active" : ""} />
        ))}
      </div>
      <label>
        每小节拍数
        <select
          value={beats}
          onChange={(e) => {
            stop();
            setBeats(+e.target.value);
          }}
        >
          {[2, 3, 4, 6].map((n) => (
            <option key={n} value={n}>
              {n} 拍
            </option>
          ))}
        </select>
      </label>
      <button
        className="primary"
        onClick={() => (running ? stop() : void start())}
      >
        {running ? "停止" : "开始节拍"}
      </button>
      <Notice>{error}</Notice>
    </div>
  );
}
function PitchTool({ practice }: { practice: boolean }) {
  const engine = useRef<PracticeEngine | null>(null),
    clock = useRef(new PracticeClock()),
    stable = useRef(0),
    target = useRef(0);
  const [running, setRunning] = useState(false),
    [busy, setBusy] = useState(false),
    [reading, setReading] = useState<NoteReading | null>(null),
    [message, setMessage] = useState(""),
    [progress, setProgress] = useState(0);
  const notes = [60, 62, 64, 65, 67],
    names = ["C4", "D4", "E4", "F4", "G4"];
  async function save() {
    const session = clock.current.finish();
    if (session)
      try {
        await localDB.saveSession(session);
      } catch (e) {
        setMessage(errorText(e));
      }
  }
  function stop() {
    engine.current?.stop();
    engine.current = null;
    setRunning(false);
    setBusy(false);
    setReading(null);
    stable.current = 0;
    clock.current.pause();
  }
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      engine.current?.stop();
      const s = clock.current.finish();
      if (s) void localDB.saveSession(s).catch(console.error);
    };
  }, []);
  async function start() {
    if (busy) return;
    setBusy(true);
    const capability = inspectBrowserCapability();
    if (capability.state !== "scorable") {
      setMessage(
        "当前环境不支持实时音高检测。请使用 HTTPS 或本机地址，并允许麦克风；也可切换虚拟钢琴练习。",
      );
      setBusy(false);
      return;
    }
    if (progress === 5) {
      target.current = 0;
      setProgress(0);
    }
    const active = new PracticeEngine();
    engine.current = active;
    const result = await active.start((frame) => {
      if (!frame.frequency || frame.clarity < 0.68) {
        setReading(null);
        stable.current = 0;
        setMessage("输入较弱或不稳定，暂不判断。");
        return;
      }
      const note = frequencyToNote(frame.frequency);
      setReading(note);
      setMessage("正在检测稳定单音。");
      if (practice && isMatchingNote(note, notes[target.current], 45)) {
        if (++stable.current >= 3) {
          stable.current = 0;
          target.current++;
          setProgress(target.current);
          if (target.current === 5) {
            stop();
            void save();
            setMessage("五个目标音已完成，练习记录已保存。");
          }
        }
      } else stable.current = 0;
    });
    if (engine.current !== active) {
      active.stop();
      return;
    }
    setBusy(false);
    if (result.state === "scorable") {
      setRunning(true);
      if (practice)
        clock.current.start(
          "single-note",
          "C 大调五音练习",
          null,
          "single-note",
        );
    } else {
      stop();
      setMessage(
        "未能开启麦克风，请检查权限与输入设备。你仍可使用虚拟钢琴和节拍器。",
      );
    }
  }
  return (
    <>
      <p className="eyebrow">
        {practice ? "LISTEN · PLAY · REPEAT" : "LISTEN TO YOUR INSTRUMENT"}
      </p>
      <h2>{practice ? "C 大调 · 五音练习" : "调音器与音频检测"}</h2>
      <p className="muted">
        适用于钢琴或小提琴的单音输入。标准音 A4 = 440
        Hz；不确定的输入不会记作错误。
      </p>
      {practice && (
        <div className="sequence">
          {names.map((n, i) => (
            <span
              key={n}
              className={
                i < progress ? "done" : i === progress ? "current" : ""
              }
            >
              {n}
            </span>
          ))}
        </div>
      )}
      <div className="tuner-display">
        <span>{running ? "当前音高" : "等待开始"}</span>
        <strong>{reading?.name || "—"}</strong>
        <span>
          {reading
            ? reading.cents +
              " cents · " +
              Math.round(reading.frequency) +
              " Hz"
            : "请在安静环境演奏单音"}
        </span>
        <div className="tuner-meter">
          <i
            style={{
              left: 50 + Math.max(-50, Math.min(50, reading?.cents || 0)) + "%",
            }}
          />
        </div>
      </div>
      <div className="row-actions">
        <button
          className="primary"
          disabled={busy}
          onClick={() => (running ? stop() : void start())}
        >
          {busy ? "正在请求麦克风…" : running ? "暂停检测" : "检测并开始"}
        </button>
        {practice && (
          <button
            onClick={() => {
              stop();
              void save();
              setMessage("练习已结束");
            }}
          >
            结束并保存
          </button>
        )}
      </div>
      <Notice>{message}</Notice>
    </>
  );
}
