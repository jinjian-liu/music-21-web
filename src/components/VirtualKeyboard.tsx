import { useEffect, useRef, useState } from "react";
import {
  blackKeyboardNotes,
  displayPerformanceKey,
  keyboardNotes,
  noteForKeyboardEvent,
  performanceKeyFromCode,
  whiteKeyboardNotes,
  type KeyboardNote,
} from "../audio/keyboard";
import { PianoEngine, type PianoTone } from "../audio/synth";
import { localDB } from "../lib/local-db";
import { defaultAudio } from "../../shared/contracts";

interface VirtualKeyboardProps {
  activeNotes: Set<number>;
  highlightedNotes?: Set<number>;
  disabled?: boolean;
  onNoteOn: (note: KeyboardNote, source: "computer" | "pointer") => void;
  onNoteOff: (note: KeyboardNote) => void;
}

const tones: Array<{ id: PianoTone; label: string; detail: string }> = [
  { id: "grand", label: "原声钢琴", detail: "采样 · 均衡" },
  { id: "bright", label: "明亮钢琴", detail: "采样 · 清脆" },
  { id: "mellow", label: "柔和钢琴", detail: "采样 · 温暖" },
  { id: "electric", label: "电钢琴", detail: "合成 · 颗粒" },
];

export function VirtualKeyboard({
  activeNotes,
  highlightedNotes = new Set(),
  disabled = false,
  onNoteOn,
  onNoteOff,
}: VirtualKeyboardProps) {
  const engineRef = useRef<PianoEngine | null>(null);
  const heldKeys = useRef(new Map<string, KeyboardNote>());
  const sustainedNotes = useRef(new Map<number, KeyboardNote>());
  const sustainRef = useRef(false);
  const [tone, setTone] = useState<PianoTone>("grand");
  const [volume, setVolume] = useState(72);
  const [resonance, setResonance] = useState(34);
  const [sustain, setSustain] = useState(false);
  const [audioError, setAudioError] = useState("");

  useEffect(() => {
    let active = true;
    void localDB
      .setting("audio", defaultAudio)
      .then((value) => {
        if (active) {
          setTone(value.tone);
          setVolume(value.volume);
          setResonance(value.resonance);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  function engine(): PianoEngine {
    engineRef.current ??= new PianoEngine();
    return engineRef.current;
  }

  function attack(note: KeyboardNote, source: "computer" | "pointer") {
    if (disabled || activeNotes.has(note.midi)) return;
    sustainedNotes.current.delete(note.midi);
    const audio = engine();
    audio.setTone(tone);
    audio.setVolume(volume / 100);
    audio.setResonance(resonance / 100);
    void audio
      .attack(note.midi)
      .catch(() => setAudioError("无法播放声音，请检查浏览器音频权限后重试。"));
    onNoteOn(note, source);
  }

  function release(note: KeyboardNote) {
    if (sustainRef.current) {
      sustainedNotes.current.set(note.midi, note);
      return;
    }
    engineRef.current?.release(note.midi);
    onNoteOff(note);
  }

  function releaseSustain() {
    sustainRef.current = false;
    setSustain(false);
    sustainedNotes.current.forEach((note) => {
      engineRef.current?.release(note.midi);
      onNoteOff(note);
    });
    sustainedNotes.current.clear();
  }

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (disabled || event.ctrlKey || event.metaKey || event.isComposing)
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(
          "input,textarea,select,[contenteditable=true],dialog",
        )
      )
        return;
      if (
        event.code === "Space" &&
        event.target instanceof HTMLElement &&
        event.target.closest("button,a")
      )
        return;
      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat) {
          sustainRef.current = true;
          setSustain(true);
        }
        return;
      }
      const physicalKey = performanceKeyFromCode(event.code, event.key);
      const note = noteForKeyboardEvent(
        physicalKey,
        event.shiftKey || event.altKey,
      );
      if (!note || heldKeys.current.has(event.code)) return;
      event.preventDefault();
      heldKeys.current.set(event.code, note);
      attack(note, "computer");
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.code === "Space" && sustainRef.current) {
        event.preventDefault();
        releaseSustain();
        return;
      }
      const note = heldKeys.current.get(event.code);
      if (!note) return;
      heldKeys.current.delete(event.code);
      release(note);
    };
    const releaseEverything = () => {
      heldKeys.current.clear();
      sustainedNotes.current.clear();
      sustainRef.current = false;
      setSustain(false);
      engineRef.current?.releaseAll();
      activeNotes.forEach((midi) => {
        const note = keyboardNotes.find((item) => item.midi === midi);
        if (note) onNoteOff(note);
      });
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", releaseEverything);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", releaseEverything);
    };
  });

  useEffect(() => () => engineRef.current?.dispose(), []);
  useEffect(() => {
    if (disabled) {
      engineRef.current?.releaseAll();
      heldKeys.current.clear();
      sustainedNotes.current.clear();
      sustainRef.current = false;
      setSustain(false);
      activeNotes.forEach((midi) => {
        const note = keyboardNotes.find((n) => n.midi === midi);
        if (note) onNoteOff(note);
      });
    }
  }, [disabled]);

  return (
    <div className="keyboard-instrument">
      {audioError && (
        <p role="status" className="notice">
          {audioError}
        </p>
      )}
      <div className="keyboard-controls">
        <label>
          <span>音色</span>
          <select
            value={tone}
            onChange={(event) => {
              const nextTone = event.target.value as PianoTone;
              setTone(nextTone);
              engineRef.current?.setTone(nextTone);
            }}
          >
            {tones.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} · {item.detail}
              </option>
            ))}
          </select>
        </label>
        <label className="volume-control">
          <span>音量 {volume}%</span>
          <input
            aria-label="钢琴音量"
            max="100"
            min="0"
            onChange={(event) => {
              const nextVolume = Number(event.target.value);
              setVolume(nextVolume);
              engineRef.current?.setVolume(nextVolume / 100);
            }}
            type="range"
            value={volume}
          />
        </label>
        <label className="resonance-control">
          <span>共鸣 {resonance}%</span>
          <input
            aria-label="钢琴共鸣"
            max="65"
            min="0"
            onChange={(event) => {
              const nextResonance = Number(event.target.value);
              setResonance(nextResonance);
              engineRef.current?.setResonance(nextResonance / 100);
            }}
            type="range"
            value={resonance}
          />
        </label>
        <span className={sustain ? "pedal active" : "pedal"}>
          空格延音 {sustain ? "开启" : "关闭"}
        </span>
      </div>

      <div className="keyboard-map">
        <b>AutoPiano 标准键位</b>
        <span>1–0 · Q–P · A–L · Z–M 演奏白键</span>
        <span>按住 Shift / Alt 演奏黑键</span>
      </div>

      <div className="piano-frame">
        <div className="virtual-keyboard" aria-label="电脑键盘钢琴 C2 至 C7">
          <div className="white-keys">
            {whiteKeyboardNotes.map((note) => (
              <button
                aria-label={`${note.name}，键盘 ${note.key.toUpperCase()}`}
                className={`piano-key white${activeNotes.has(note.midi) ? " pressed" : ""}${highlightedNotes.has(note.midi) ? " guided" : ""}`}
                key={note.midi}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  attack(note, "pointer");
                }}
                onPointerUp={() => release(note)}
                onPointerCancel={() => release(note)}
                type="button"
              >
                <span>{note.key.toUpperCase()}</span>
                <small>{note.name}</small>
              </button>
            ))}
          </div>
          <div className="black-keys" aria-hidden="true">
            {blackKeyboardNotes.map((note) => (
              <button
                className={`piano-key black${activeNotes.has(note.midi) ? " pressed" : ""}${highlightedNotes.has(note.midi) ? " guided" : ""}`}
                key={note.midi}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  attack(note, "pointer");
                }}
                onPointerUp={() => release(note)}
                onPointerCancel={() => release(note)}
                style={{
                  left: `${((note.whiteIndex + 1) / whiteKeyboardNotes.length) * 100}%`,
                }}
                tabIndex={-1}
                type="button"
              >
                <span>{displayPerformanceKey(note)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
