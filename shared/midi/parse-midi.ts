import * as MidiPackage from "@tonejs/midi";
import type { ParsedSong, ParsedTrack } from "./types";

// Vite resolves the ESM entry; Node resolves the package's UMD entry.
const Midi: typeof MidiPackage.Midi =
  MidiPackage.Midi || Reflect.get(MidiPackage, "default").Midi;

const MAJOR_PROFILE = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const MINOR_PROFILE = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];
const PITCH_NAMES = [
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
];

function inferKey(tracks: ParsedTrack[]): {
  key: string;
  mode: "major" | "minor";
} {
  const weights = Array.from({ length: 12 }, () => 0);
  tracks
    .filter((track) => !track.percussion)
    .forEach((track) => {
      track.notes.forEach((note) => {
        weights[note.midi % 12] +=
          Math.max(0.05, note.durationSeconds) * Math.max(0.2, note.velocity);
      });
    });
  let best: { score: number; tonic: number; mode: "major" | "minor" } = {
    score: Number.NEGATIVE_INFINITY,
    tonic: 0,
    mode: "major",
  };
  for (let tonic = 0; tonic < 12; tonic += 1) {
    (["major", "minor"] as const).forEach((mode) => {
      const profile = mode === "major" ? MAJOR_PROFILE : MINOR_PROFILE;
      const score = weights.reduce(
        (sum, weight, pitch) =>
          sum + weight * profile[(pitch - tonic + 12) % 12],
        0,
      );
      if (score > best.score) best = { score, tonic, mode };
    });
  }
  return { key: PITCH_NAMES[best.tonic], mode: best.mode };
}

export function parseMidiBuffer(
  buffer: ArrayBuffer,
  fileName: string,
): ParsedSong {
  if (
    buffer.byteLength < 14 ||
    new TextDecoder().decode(buffer.slice(0, 4)) !== "MThd"
  )
    throw new Error("文件不是有效的标准 MIDI");
  if (buffer.byteLength > 10 * 1024 * 1024)
    throw new Error("MIDI 文件不能超过 10MB");
  const midi = new Midi(buffer);
  const noteTotal = midi.tracks.reduce(
    (sum, track) => sum + track.notes.length,
    0,
  );
  if (!noteTotal) throw new Error("MIDI 中没有可演奏的音符");
  if (midi.tracks.length > 128) throw new Error("MIDI 轨道数超过 128 条");
  if (noteTotal > 250_000) throw new Error("MIDI 音符事件超过 250,000 个");
  if (midi.duration > 3600) throw new Error("MIDI 时长不能超过 60 分钟");

  const tracks: ParsedTrack[] = midi.tracks
    .map((track, index) => {
      const notes = track.notes.map((note, noteIndex) => ({
        id: `t${index}-n${noteIndex}`,
        midi: note.midi,
        name: note.name,
        startTick: note.ticks,
        endTick: note.ticks + note.durationTicks,
        startSeconds: note.time,
        durationSeconds: note.duration,
        velocity: note.velocity,
      }));
      const pitches = notes.map((note) => note.midi);
      return {
        id: `track-${index}`,
        index,
        name: track.name || track.instrument.name || `音轨 ${index + 1}`,
        channel: track.channel,
        program: track.instrument.number,
        instrument: track.instrument.name,
        percussion: track.instrument.percussion || track.channel === 9,
        noteCount: notes.length,
        range: pitches.length
          ? ([Math.min(...pitches), Math.max(...pitches)] as [number, number])
          : null,
        notes,
      };
    })
    .filter((track) => track.noteCount > 0);
  const inferred = inferKey(tracks);
  const keySignature = midi.header.keySignatures[0];
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    title: midi.name || fileName.replace(/\.midi?$/i, ""),
    fileName,
    status: "local",
    ppq: midi.header.ppq,
    durationTicks: midi.durationTicks,
    durationSeconds: midi.duration,
    tempos: midi.header.tempos.length
      ? midi.header.tempos.map((tempo) => ({
          ticks: tempo.ticks,
          bpm: tempo.bpm,
          time: tempo.time ?? midi.header.ticksToSeconds(tempo.ticks),
        }))
      : [{ ticks: 0, bpm: 120, time: 0 }],
    meters: midi.header.timeSignatures.length
      ? midi.header.timeSignatures.map((meter) => ({
          ticks: meter.ticks,
          numerator: meter.timeSignature[0],
          denominator: meter.timeSignature[1],
        }))
      : [{ ticks: 0, numerator: 4, denominator: 4 }],
    declaredKey: keySignature
      ? `${keySignature.key} ${keySignature.scale}`
      : null,
    inferredKey: keySignature?.key || inferred.key,
    inferredMode: keySignature?.scale === "minor" ? "minor" : inferred.mode,
    tracks,
    createdAt: new Date().toISOString(),
  };
}

export async function parseMidiFile(file: File): Promise<ParsedSong> {
  if (!/\.midi?$/i.test(file.name))
    throw new Error("请选择 .mid 或 .midi 文件");
  return parseMidiBuffer(await file.arrayBuffer(), file.name);
}
