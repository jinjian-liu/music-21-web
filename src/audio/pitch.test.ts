import { describe, expect, it } from "vitest";
import { frequencyToNote, isMatchingNote } from "./pitch";

describe("pitch conversion", () => {
  it("maps concert A to A4", () => {
    expect(frequencyToNote(440)).toMatchObject({
      name: "A4",
      midi: 69,
      cents: 0,
    });
  });

  it("rejects invalid frequencies", () => {
    expect(frequencyToNote(0)).toBeNull();
    expect(frequencyToNote(Number.NaN)).toBeNull();
  });

  it("matches within the configured cent tolerance", () => {
    expect(isMatchingNote(frequencyToNote(261.63), 60, 45)).toBe(true);
    expect(isMatchingNote(frequencyToNote(293.66), 60, 45)).toBe(false);
  });
});
