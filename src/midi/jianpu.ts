import type {
  JianpuPitch,
  JianpuToken,
  KeyMode,
  MeterEvent,
  ParsedSong,
  ParsedTrack,
} from "./types";

const TONICS: Record<string, number> = {
  C: 0,
  "C#": 1,
  "C♯": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  "E♭": 3,
  E: 4,
  F: 5,
  "F#": 6,
  "F♯": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  "A♭": 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  "B♭": 10,
  B: 11,
};
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

function pitchToJianpu(
  midi: number,
  tonic: number,
  mode: "major" | "minor",
): JianpuPitch {
  const scale = mode === "major" ? MAJOR : MINOR;
  const relative = (midi - tonic + 120) % 12;
  let choice = { degree: 1, accidental: 0, distance: 99 };
  scale.forEach((pitch, index) => {
    let distance = relative - pitch;
    if (distance > 6) distance -= 12;
    if (distance < -6) distance += 12;
    if (Math.abs(distance) < Math.abs(choice.distance))
      choice = { degree: index + 1, accidental: distance, distance };
  });
  const baseMidi = 60 + tonic;
  return {
    midi,
    degree: choice.degree,
    accidental: Math.max(-1, Math.min(1, choice.accidental)) as -1 | 0 | 1,
    octave: Math.floor((midi - baseMidi) / 12),
  };
}

function durationKind(ticks: number, ppq: number): JianpuToken["durationKind"] {
  const beats = ticks / ppq;
  const candidates: Array<[number, JianpuToken["durationKind"]]> = [
    [4, "whole"],
    [2, "half"],
    [1, "quarter"],
    [0.5, "eighth"],
    [1 / 3, "triplet"],
    [0.25, "sixteenth"],
    [1 / 6, "sextuplet"],
  ];
  return candidates.reduce(
    (best, candidate) =>
      Math.abs(candidate[0] - beats) < Math.abs(best[0] - beats)
        ? candidate
        : best,
    [0, "short"] as [number, JianpuToken["durationKind"]],
  )[1];
}

function locateTick(
  tick: number,
  meters: MeterEvent[],
  ppq: number,
): { measure: number; beat: number } {
  const sorted = [...meters].sort((a, b) => a.ticks - b.ticks);
  let measureOffset = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const meter = sorted[index];
    const next = sorted[index + 1];
    const measureTicks = (ppq * meter.numerator * 4) / meter.denominator;
    if (!next || tick < next.ticks) {
      const local = Math.max(0, tick - meter.ticks);
      return {
        measure: measureOffset + Math.floor(local / measureTicks) + 1,
        beat: (local % measureTicks) / ppq + 1,
      };
    }
    measureOffset += Math.max(
      0,
      Math.round((next.ticks - meter.ticks) / measureTicks),
    );
  }
  return { measure: 1, beat: 1 };
}

export function buildJianpu(
  song: ParsedSong,
  track: ParsedTrack,
  keyMode: KeyMode,
  tonicOverride?: string,
): JianpuToken[] {
  if (track.percussion) return [];
  const tonic =
    keyMode === "fixed" ? 0 : (TONICS[tonicOverride || song.inferredKey] ?? 0);
  const mode = keyMode === "fixed" ? "major" : song.inferredMode;
  const groups = new Map<number, typeof track.notes>();
  track.notes.forEach((note) =>
    groups.set(note.startTick, [...(groups.get(note.startTick) || []), note]),
  );
  const tokens: JianpuToken[] = [];
  let cursor = 0;
  [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .forEach(([startTick, notes], groupIndex) => {
      if (startTick - cursor >= song.ppq / 2) {
        const location = locateTick(cursor, song.meters, song.ppq);
        tokens.push({
          id: `${track.id}-rest-${groupIndex}`,
          trackId: track.id,
          startTick: cursor,
          endTick: startTick,
          startSeconds:
            notes[0].startSeconds -
            Math.max(0, ((startTick - cursor) / song.ppq) * 0.5),
          durationSeconds: Math.max(
            0,
            notes[0].startSeconds - (tokens.at(-1)?.startSeconds || 0),
          ),
          measure: location.measure,
          beat: location.beat,
          durationKind: durationKind(startTick - cursor, song.ppq),
          rest: true,
          pitches: [],
        });
      }
      const endTick = Math.max(...notes.map((note) => note.endTick));
      const location = locateTick(startTick, song.meters, song.ppq);
      tokens.push({
        id: `${track.id}-group-${groupIndex}`,
        trackId: track.id,
        startTick,
        endTick,
        startSeconds: Math.min(...notes.map((note) => note.startSeconds)),
        durationSeconds: Math.max(...notes.map((note) => note.durationSeconds)),
        measure: location.measure,
        beat: location.beat,
        durationKind: durationKind(endTick - startTick, song.ppq),
        rest: false,
        pitches: [...new Set(notes.map((note) => note.midi))]
          .map((midi) => pitchToJianpu(midi, tonic, mode))
          .sort((a, b) => b.midi - a.midi),
      });
      cursor = Math.max(cursor, endTick);
    });
  return tokens;
}

const DRUM_LABELS: Record<number, string> = {
  35: "底鼓",
  36: "底鼓",
  38: "军鼓",
  40: "军鼓",
  42: "闭镲",
  44: "踏镲",
  46: "开镲",
  49: "吊镲",
  51: "叠音镲",
};
export function drumLabel(midi: number): string {
  return DRUM_LABELS[midi] || (midi < 42 ? "鼓" : midi < 47 ? "镲" : "打击");
}
