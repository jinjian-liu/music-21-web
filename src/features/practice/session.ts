import type { PracticeSession } from "../../../shared/contracts";
export class PracticeClock {
  private activeAt: number | null = null;
  private elapsed = 0;
  private record: PracticeSession | null = null;
  start(
    pieceId: string,
    title: string,
    targetTrackId: string | null,
    mode: PracticeSession["mode"] = "practice",
    now = Date.now(),
  ) {
    this.record ??= {
      id: crypto.randomUUID(),
      pieceId,
      title,
      targetTrackId,
      mode,
      startedAt: new Date(now).toISOString(),
      endedAt: new Date(now).toISOString(),
      activeMs: 0,
      matched: null,
      attempted: null,
    };
    this.activeAt ??= now;
  }
  pause(now = Date.now()) {
    if (this.activeAt !== null) {
      this.elapsed += Math.max(0, now - this.activeAt);
      this.activeAt = null;
    }
  }
  finish(now = Date.now()): PracticeSession | null {
    this.pause(now);
    if (!this.record) return null;
    const result = {
      ...this.record,
      endedAt: new Date(now).toISOString(),
      activeMs: Math.round(this.elapsed),
    };
    this.record = null;
    this.elapsed = 0;
    return result.activeMs > 0 ? result : null;
  }
  get started() {
    return this.record !== null;
  }
}
