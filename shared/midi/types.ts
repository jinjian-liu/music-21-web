export type PieceStatus =
  | "local"
  | "uploading"
  | "parsing"
  | "private"
  | "pending_review"
  | "published"
  | "rejected"
  | "removed"
  | "failed";
export type KeyMode = "movable" | "fixed";
export type PlaybackMode = "listen" | "practice";

export interface TempoEvent {
  ticks: number;
  bpm: number;
  time: number;
}

export interface MeterEvent {
  ticks: number;
  numerator: number;
  denominator: number;
}

export interface NoteEvent {
  id: string;
  midi: number;
  name: string;
  startTick: number;
  endTick: number;
  startSeconds: number;
  durationSeconds: number;
  velocity: number;
}

export interface ParsedTrack {
  id: string;
  index: number;
  name: string;
  channel: number;
  program: number;
  instrument: string;
  percussion: boolean;
  noteCount: number;
  range: [number, number] | null;
  notes: NoteEvent[];
}

export interface ParsedSong {
  schemaVersion: 1;
  id: string;
  title: string;
  fileName: string;
  status: PieceStatus;
  ppq: number;
  durationTicks: number;
  durationSeconds: number;
  tempos: TempoEvent[];
  meters: MeterEvent[];
  declaredKey: string | null;
  inferredKey: string;
  inferredMode: "major" | "minor";
  tracks: ParsedTrack[];
  createdAt: string;
}

export interface JianpuPitch {
  midi: number;
  degree: number;
  accidental: -1 | 0 | 1;
  octave: number;
}

export interface JianpuToken {
  id: string;
  trackId: string;
  startTick: number;
  endTick: number;
  startSeconds: number;
  durationSeconds: number;
  measure: number;
  beat: number;
  durationKind:
    | "whole"
    | "half"
    | "quarter"
    | "eighth"
    | "triplet"
    | "sixteenth"
    | "sextuplet"
    | "short";
  rest: boolean;
  pitches: JianpuPitch[];
}

export interface DrumToken {
  id: string;
  trackId: string;
  startTick: number;
  startSeconds: number;
  durationSeconds: number;
  midi: number;
  label: string;
}

export interface PlaybackState {
  playing: boolean;
  mode: PlaybackMode;
  positionSeconds: number;
  speed: number;
  selectedTrackIds: string[];
  soloTrackId: string | null;
  practiceTrackId: string | null;
  loop: { startSeconds: number; endSeconds: number } | null;
}
