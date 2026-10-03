import type { ParsedSong } from "./types";

export function createDemoSong(): ParsedSong {
  const melody = [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60];
  const durations = [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2];
  let tick = 0;
  let seconds = 0;
  const melodyNotes = melody.map((midi, index) => {
    const beats = durations[index];
    const note = {
      id: `demo-m-${index}`,
      midi,
      name: "",
      startTick: tick,
      endTick: tick + beats * 480,
      startSeconds: seconds,
      durationSeconds: beats * 0.5,
      velocity: 0.78,
    };
    tick += beats * 480;
    seconds += beats * 0.5;
    return note;
  });
  const bassNotes = Array.from({ length: 8 }, (_, index) => ({
    id: `demo-b-${index}`,
    midi: [48, 53, 55, 48][index % 4],
    name: "",
    startTick: index * 1920,
    endTick: index * 1920 + 1800,
    startSeconds: index * 2,
    durationSeconds: 1.88,
    velocity: 0.55,
  }));
  const drumNotes = Array.from({ length: 32 }, (_, index) => ({
    id: `demo-d-${index}`,
    midi: index % 4 === 0 ? 36 : index % 4 === 2 ? 38 : 42,
    name: "",
    startTick: index * 480,
    endTick: index * 480 + 60,
    startSeconds: index * 0.5,
    durationSeconds: 0.08,
    velocity: index % 2 ? 0.45 : 0.72,
  }));
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    title: "小星星 · MIDI 工作台示例",
    fileName: "demo.mid",
    status: "local",
    ppq: 480,
    durationTicks: 15_360,
    durationSeconds: 16,
    tempos: [{ ticks: 0, bpm: 120, time: 0 }],
    meters: [{ ticks: 0, numerator: 4, denominator: 4 }],
    declaredKey: "C major",
    inferredKey: "C",
    inferredMode: "major",
    tracks: [
      {
        id: "track-0",
        index: 0,
        name: "主旋律",
        channel: 0,
        program: 0,
        instrument: "acoustic grand piano",
        percussion: false,
        noteCount: melodyNotes.length,
        range: [60, 69],
        notes: melodyNotes,
      },
      {
        id: "track-1",
        index: 1,
        name: "低音伴奏",
        channel: 1,
        program: 32,
        instrument: "acoustic bass",
        percussion: false,
        noteCount: bassNotes.length,
        range: [48, 55],
        notes: bassNotes,
      },
      {
        id: "track-2",
        index: 2,
        name: "鼓组",
        channel: 9,
        program: 0,
        instrument: "drums",
        percussion: true,
        noteCount: drumNotes.length,
        range: [36, 42],
        notes: drumNotes,
      },
    ],
    createdAt: new Date().toISOString(),
  };
}
