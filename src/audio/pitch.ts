import type { NoteReading } from "../domain/audio";

const NOTE_NAMES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];

export function frequencyToMidi(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440);
}

export function frequencyToNote(frequency: number): NoteReading | null {
  if (!Number.isFinite(frequency) || frequency <= 0) return null;
  const preciseMidi = frequencyToMidi(frequency);
  const midi = Math.round(preciseMidi);
  const octave = Math.floor(midi / 12) - 1;
  return {
    name: `${NOTE_NAMES[((midi % 12) + 12) % 12]}${octave}`,
    midi,
    cents: Math.round((preciseMidi - midi) * 100),
    frequency,
  };
}

export function isMatchingNote(
  reading: NoteReading | null,
  targetMidi: number,
  toleranceCents = 50,
): boolean {
  if (!reading) return false;
  return (
    Math.abs((reading.midi - targetMidi) * 100 + reading.cents) <=
    toleranceCents
  );
}
