import { describe, it, expect } from "vitest";
import { StepPractice } from "./step";
import { createDemoSong } from "../../midi/demo-song";

function track(notes: Array<[number, number]>) {
  const original = createDemoSong().tracks.find((t) => !t.percussion)!;
  return {
    ...original,
    notes: notes.map(([midi, startTick], i) => ({
      ...original.notes[0],
      id: String(i),
      midi,
      startTick,
      startSeconds: startTick / 480,
    })),
  };
}

describe("input driven practice", () => {
  it("groups exact ticks, deduplicates pitches, preserves octaves, and skips rests", () => {
    const engine = new StepPractice(
      track([
        [60, 960],
        [61, 0],
        [60, 960],
        [72, 960],
      ]),
    );
    expect(engine.snapshot.group?.pitches).toEqual([61]);
    expect(engine.press(60)).toBe("wrong");
    expect(engine.press(61)).toBe("advanced");
    expect(engine.snapshot.group?.startSeconds).toBe(2);
    expect(engine.snapshot.group?.pitches).toEqual([60, 72]);
    expect(engine.press(72)).toBe("hit");
    expect(engine.press(59)).toBe("wrong");
    expect(engine.press(72)).toBe("duplicate");
    expect(engine.snapshot.hits).toEqual(new Set([72]));
    expect(engine.press(60)).toBe("advanced");
    expect(engine.snapshot).toMatchObject({
      complete: true,
      matched: 2,
      skipped: 0,
    });
    expect(engine.press(60)).toBe("wrong");
  });
  it("updates the target synchronously and consumes one press per group", () => {
    const engine = new StepPractice(
      track([
        [60, 0],
        [60, 480],
        [62, 960],
      ]),
    );
    engine.press(60);
    expect(engine.snapshot.index).toBe(1);
    engine.press(60);
    engine.press(62);
    expect(engine.snapshot).toMatchObject({ complete: true, matched: 3 });
  });
  it("allows out of range skips, seeks forward, clears partial hits and restarts rounds", () => {
    const engine = new StepPractice(
      track([
        [30, 0],
        [60, 480],
        [64, 480],
        [98, 960],
      ]),
    );
    engine.skip();
    engine.press(60);
    expect(engine.snapshot).toMatchObject({ skipped: 1, matched: 0 });
    engine.seek(0.5);
    expect(engine.snapshot.index).toBe(1);
    expect(engine.snapshot.hits.size).toBe(0);
    engine.seek(1.5);
    expect(engine.snapshot.group?.pitches).toEqual([98]);
    engine.skip();
    engine.skip();
    expect(engine.snapshot.skipped).toBe(1);
    engine.seek(0);
    expect(engine.snapshot).toMatchObject({ index: 0, matched: 0, skipped: 0 });
    engine.seek(100);
    expect(engine.snapshot.complete).toBe(true);
  });
  it("has no target for percussion and empty tracks", () => {
    expect(new StepPractice().snapshot.total).toBe(0);
    expect(
      new StepPractice({ ...track([[60, 0]]), percussion: true }).snapshot
        .total,
    ).toBe(0);
  });
});
