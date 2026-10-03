export interface KeyboardNote {
  key: string;
  midi: number;
  name: string;
  accidental: boolean;
  whiteIndex: number;
}

export const AUTO_PIANO_KEYS = "1234567890qwertyuiopasdfghjklzxcvbnm".split("");
const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
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

export function midiToName(midi: number): string {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

const whiteMidis = Array.from({ length: 61 }, (_, index) => index + 36).filter(
  (midi) => WHITE_PITCH_CLASSES.has(midi % 12),
);

export const whiteKeyboardNotes: KeyboardNote[] = AUTO_PIANO_KEYS.map(
  (key, whiteIndex) => {
    const midi = whiteMidis[whiteIndex];
    return { key, midi, name: midiToName(midi), accidental: false, whiteIndex };
  },
);

export const blackKeyboardNotes: KeyboardNote[] = whiteKeyboardNotes
  .filter(
    (note) => note.midi < 96 && !WHITE_PITCH_CLASSES.has((note.midi + 1) % 12),
  )
  .map((note) => ({
    ...note,
    midi: note.midi + 1,
    name: midiToName(note.midi + 1),
    accidental: true,
  }));

export const keyboardNotes = [
  ...whiteKeyboardNotes,
  ...blackKeyboardNotes,
].sort((a, b) => a.midi - b.midi);
export const whiteNoteByKey = new Map(
  whiteKeyboardNotes.map((note) => [note.key, note]),
);
export const blackNoteByKey = new Map(
  blackKeyboardNotes.map((note) => [note.key, note]),
);

export function normalizePerformanceKey(key: string): string {
  return key.toLowerCase();
}

export function performanceKeyFromCode(
  code: string,
  fallbackKey: string,
): string {
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  return normalizePerformanceKey(fallbackKey);
}

export function noteForKeyboardEvent(
  key: string,
  accidental: boolean,
): KeyboardNote | undefined {
  const normalized = normalizePerformanceKey(key);
  return (accidental ? blackNoteByKey : whiteNoteByKey).get(normalized);
}

export function displayPerformanceKey(note: KeyboardNote): string {
  return note.accidental
    ? `⇧${note.key.toUpperCase()}`
    : note.key.toUpperCase();
}
