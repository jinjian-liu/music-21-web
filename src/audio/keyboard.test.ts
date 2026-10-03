import { describe, expect, it } from "vitest";
import {
  blackKeyboardNotes,
  displayPerformanceKey,
  midiToName,
  noteForKeyboardEvent,
  performanceKeyFromCode,
  whiteKeyboardNotes,
} from "./keyboard";

describe("AutoPiano-style computer keyboard mapping", () => {
  it("covers 36 white notes from C2 through C7", () => {
    expect(whiteKeyboardNotes).toHaveLength(36);
    expect(noteForKeyboardEvent("1", false)?.name).toBe("C2");
    expect(noteForKeyboardEvent("t", false)?.name).toBe("C4");
    expect(noteForKeyboardEvent("m", false)?.name).toBe("C7");
  });

  it("uses Shift or Alt state to select a black note", () => {
    const note = noteForKeyboardEvent("T", true);
    expect(note).toMatchObject({ name: "C♯4", accidental: true });
    expect(displayPerformanceKey(note!)).toBe("⇧T");
    expect(blackKeyboardNotes).toHaveLength(25);
    expect(
      noteForKeyboardEvent(performanceKeyFromCode("Digit1", "!"), true)?.name,
    ).toBe("C♯2");
  });

  it("does not invent black keys between E–F or B–C", () => {
    expect(noteForKeyboardEvent("0", true)).toBeUndefined();
    expect(noteForKeyboardEvent("r", true)).toBeUndefined();
    expect(midiToName(76)).toBe("E5");
  });
});
