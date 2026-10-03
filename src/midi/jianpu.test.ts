import { describe, expect, it } from "vitest";
import { createDemoSong } from "./demo-song";
import { buildJianpu, drumLabel } from "./jianpu";

describe("numbered notation translation", () => {
  it("translates C major melody into scale degrees", () => {
    const song = createDemoSong();
    const tokens = buildJianpu(song, song.tracks[0], "movable", "C").filter(
      (token) => !token.rest,
    );
    expect(tokens.slice(0, 4).map((token) => token.pitches[0].degree)).toEqual([
      1, 1, 5, 5,
    ]);
    expect(tokens[6].durationKind).toBe("half");
  });

  it("keeps simultaneous notes in a vertical pitch cluster", () => {
    const song = createDemoSong();
    song.tracks[0].notes.push({
      ...song.tracks[0].notes[0],
      id: "chord",
      midi: 64,
    });
    const first = buildJianpu(song, song.tracks[0], "fixed")[0];
    expect(first.pitches.map((pitch) => pitch.degree)).toEqual([3, 1]);
  });

  it("labels GM percussion without treating it as pitch notation", () => {
    expect(drumLabel(36)).toBe("底鼓");
    expect(
      buildJianpu(createDemoSong(), createDemoSong().tracks[2], "movable"),
    ).toEqual([]);
  });
});
