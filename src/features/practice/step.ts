import type { ParsedTrack } from "../../midi/types";

export interface StepGroup {
  startTick: number;
  startSeconds: number;
  pitches: number[];
}
export interface StepSnapshot {
  group: StepGroup | null;
  index: number;
  total: number;
  hits: Set<number>;
  matched: number;
  skipped: number;
  complete: boolean;
}

// Only fresh physical presses enter this state machine; time never advances it.
export class StepPractice {
  readonly groups: StepGroup[];
  private index = 0;
  private hits = new Set<number>();
  private matched = 0;
  private skipped = 0;

  constructor(track?: ParsedTrack) {
    const groups = new Map<number, StepGroup>();
    if (track && !track.percussion) {
      for (const note of track.notes) {
        const group = groups.get(note.startTick) || {
          startTick: note.startTick,
          startSeconds: note.startSeconds,
          pitches: [],
        };
        group.startSeconds = Math.min(group.startSeconds, note.startSeconds);
        if (!group.pitches.includes(note.midi)) group.pitches.push(note.midi);
        groups.set(note.startTick, group);
      }
    }
    this.groups = [...groups.values()].sort(
      (a, b) => a.startTick - b.startTick,
    );
    this.groups.forEach((group) => group.pitches.sort((a, b) => a - b));
  }

  get snapshot(): StepSnapshot {
    return {
      group: this.groups[this.index] || null,
      index: this.index,
      total: this.groups.length,
      hits: new Set(this.hits),
      matched: this.matched,
      skipped: this.skipped,
      complete: this.index >= this.groups.length,
    };
  }

  press(midi: number): "wrong" | "duplicate" | "hit" | "advanced" {
    const group = this.groups[this.index];
    if (!group || !group.pitches.includes(midi)) return "wrong";
    if (this.hits.has(midi)) return "duplicate";
    this.hits.add(midi);
    if (this.hits.size < group.pitches.length) return "hit";
    this.matched += 1;
    this.advance();
    return "advanced";
  }

  skip() {
    if (!this.groups[this.index]) return;
    this.skipped += 1;
    this.advance();
  }

  private advance() {
    this.index += 1;
    this.hits.clear();
  }

  // Seeking starts a fresh round at the first group at or after the requested time.
  seek(seconds: number) {
    const index = this.groups.findIndex(
      (group) => group.startSeconds >= seconds,
    );
    this.index = index < 0 ? this.groups.length : index;
    this.hits.clear();
    this.matched = 0;
    this.skipped = 0;
  }
}
