import { describe, it, expect } from "vitest";
import { PracticeClock } from "./session";
describe("practice session", () => {
  it("counts step waiting and loop time but excludes pauses with no fabricated feedback", () => {
    const clock = new PracticeClock();
    clock.start("demo", "曲目", "track", "step", 1000);
    expect(clock.activeMs(6000)).toBe(5000);
    clock.pause(6000);
    expect(clock.activeMs(9000)).toBe(5000);
    clock.start("demo", "曲目", "track", "step", 10000);
    expect(clock.activeMs(12000)).toBe(7000);
    expect(clock.finish(12000)).toMatchObject({
      mode: "step",
      activeMs: 7000,
      matched: null,
      attempted: null,
    });
    expect(clock.finish(13000)).toBeNull();
  });
  it("excludes pauses and finalizes exactly once", () => {
    const clock = new PracticeClock();
    clock.start("demo", "曲目", "track", "practice", 1000);
    clock.pause(3000);
    clock.start("demo", "曲目", "track", "practice", 9000);
    const result = clock.finish(12000);
    expect(result?.activeMs).toBe(5000);
    expect(result?.matched).toBeNull();
    expect(clock.finish(15000)).toBeNull();
  });
  it("does not create records for listening or empty sessions", () => {
    const clock = new PracticeClock();
    expect(clock.finish()).toBeNull();
    clock.start("demo", "曲目", null, "practice", 1000);
    expect(clock.finish(1000)).toBeNull();
  });
  it("does not restart a running clock on repeated play clicks", () => {
    const clock = new PracticeClock();
    clock.start("demo", "曲目", null, "practice", 1000);
    clock.start("demo", "曲目", null, "practice", 2000);
    expect(clock.finish(3000)?.activeMs).toBe(2000);
  });
});
