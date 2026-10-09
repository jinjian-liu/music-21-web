import { useMemo, useRef } from "react";
import { buildJianpu, drumLabel } from "../midi/jianpu";
import type { JianpuPitch, KeyMode, ParsedSong } from "../midi/types";

interface ScoreTimelineProps {
  song: ParsedSong;
  trackIds: string[];
  positionSeconds: number;
  keyMode: KeyMode;
  tonic: string;
  onSeek?: (seconds: number) => void;
  stepTarget?: {
    trackId: string | null;
    startTick: number | null;
    hits: Set<number>;
  };
}

function Pitch({ pitch, hit = false }: { pitch: JianpuPitch; hit?: boolean }) {
  return (
    <span className={`jianpu-pitch${hit ? " step-hit" : ""}`}>
      <i>{pitch.octave > 0 ? "•".repeat(Math.min(2, pitch.octave)) : ""}</i>
      <b>
        {pitch.accidental === 1 ? "♯" : pitch.accidental === -1 ? "♭" : ""}
        {pitch.degree}
      </b>
      <i>{pitch.octave < 0 ? "•".repeat(Math.min(2, -pitch.octave)) : ""}</i>
    </span>
  );
}

export function ScoreTimeline({
  song,
  trackIds,
  positionSeconds,
  keyMode,
  tonic,
  onSeek,
  stepTarget,
}: ScoreTimelineProps) {
  const drag = useRef<{ x: number; time: number } | null>(null);
  const tracks = song.tracks.filter((track) => trackIds.includes(track.id));
  const tokenMap = useMemo(
    () =>
      new Map(
        tracks.map((track) => [
          track.id,
          buildJianpu(song, track, keyMode, tonic),
        ]),
      ),
    [song, tracks.map((track) => track.id).join("|"), keyMode, tonic],
  );
  const pixelsPerSecond = 105;
  return (
    <div
      className="score-viewport"
      aria-label="随播放流动的分轨简谱，可左右拖动定位"
      style={{ touchAction: "pan-y" }}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, time: positionSeconds };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current && Math.abs(e.clientX - drag.current.x) > 5)
          onSeek?.(
            Math.max(
              0,
              Math.min(
                song.durationSeconds,
                drag.current.time -
                  (e.clientX - drag.current.x) / pixelsPerSecond,
              ),
            ),
          );
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <div className="score-playhead">
        <span />
      </div>
      {tracks.map((track) => (
        <div
          className={`score-lane${track.percussion ? " percussion" : ""}${stepTarget && track.id !== stepTarget.trackId ? " reference-lane" : ""}`}
          style={
            stepTarget && !track.percussion
              ? {
                  height: Math.max(
                    110,
                    ...(tokenMap.get(track.id) || [])
                      .filter(
                        (token) =>
                          Math.abs(token.startSeconds - positionSeconds) < 7,
                      )
                      .map((token) => token.pitches.length * 32 + 65),
                  ),
                }
              : undefined
          }
          key={track.id}
        >
          <strong className="score-track-name">{track.name}</strong>
          {track.percussion
            ? track.notes
                .filter(
                  (note) => Math.abs(note.startSeconds - positionSeconds) < 7,
                )
                .map((note) => {
                  const delta = note.startSeconds - positionSeconds;
                  const current =
                    !stepTarget &&
                    positionSeconds >= note.startSeconds &&
                    positionSeconds <=
                      note.startSeconds + Math.max(0.1, note.durationSeconds);
                  return (
                    <span
                      className={current ? "drum-token current" : "drum-token"}
                      key={note.id}
                      style={{
                        left: `calc(50% + ${delta * pixelsPerSecond}px)`,
                      }}
                      title={drumLabel(note.midi)}
                    >
                      {drumLabel(note.midi).slice(0, 1)}
                    </span>
                  );
                })
            : (tokenMap.get(track.id) || [])
                .filter(
                  (token) =>
                    Math.abs(token.startSeconds - positionSeconds) < 7 ||
                    (stepTarget?.trackId === track.id &&
                      stepTarget.startTick === token.startTick),
                )
                .map((token) => {
                  const delta = token.startSeconds - positionSeconds;
                  const current = stepTarget
                    ? track.id === stepTarget.trackId &&
                      !token.rest &&
                      token.startTick === stepTarget.startTick
                    : positionSeconds >= token.startSeconds &&
                      positionSeconds <
                        token.startSeconds +
                          Math.max(0.08, token.durationSeconds);
                  return (
                    <span
                      className={`jianpu-token ${token.durationKind}${current ? " current" : ""}${token.rest ? " rest" : ""}`}
                      key={token.id}
                      style={{
                        left: `calc(50% + ${delta * pixelsPerSecond}px)`,
                      }}
                    >
                      {token.beat === 1 && <em>{token.measure}</em>}
                      {token.rest ? (
                        <b>0</b>
                      ) : (
                        token.pitches.map((pitch) => (
                          <Pitch
                            key={pitch.midi}
                            pitch={pitch}
                            hit={
                              !!stepTarget &&
                              current &&
                              stepTarget.hits.has(pitch.midi)
                            }
                          />
                        ))
                      )}
                    </span>
                  );
                })}
        </div>
      ))}
      {tracks.length === 0 && (
        <div className="score-empty">请至少选择一条音轨</div>
      )}
    </div>
  );
}
