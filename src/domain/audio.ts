export type Instrument = "piano" | "violin" | "guitar" | "trumpet";

export type CapabilityState =
  "checking" | "scorable" | "indeterminate" | "degraded" | "unsupported";

export type CapabilityReason =
  | "ready"
  | "insecure-context"
  | "media-api-missing"
  | "audio-worklet-missing"
  | "permission-denied"
  | "device-missing"
  | "weak-input"
  | "unstable-performance"
  | "unknown";

export interface CapabilityResult {
  state: CapabilityState;
  reason: CapabilityReason;
  sampleRate?: number;
}

export interface PitchFrame {
  frequency: number | null;
  clarity: number;
  rms: number;
  capturedAt: number;
}

export interface NoteReading {
  name: string;
  midi: number;
  cents: number;
  frequency: number;
}
