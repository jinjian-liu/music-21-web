import MidiPackage from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { parseMidiBuffer } from "./parse-midi";

const { Midi } = MidiPackage;

function fixture(): ArrayBuffer {
  const midi = new Midi();
  midi.header.setTempo(96);
  const melody = midi.addTrack();
  melody.name = "Melody";
  melody.addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.8 });
  melody.addNote({ midi: 64, ticks: 480, durationTicks: 480, velocity: 0.75 });
  const chord = midi.addTrack();
  chord.name = "Chords";
  chord.addNote({ midi: 48, ticks: 0, durationTicks: 960 });
  chord.addNote({ midi: 55, ticks: 0, durationTicks: 960 });
  const bytes = midi.toArray();
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

describe("MIDI parser", () => {
  it("normalizes tracks, timing and polyphony", () => {
    const song = parseMidiBuffer(fixture(), "fixture.mid");
    expect(song.tracks).toHaveLength(2);
    expect(song.tracks[0]).toMatchObject({
      name: "Melody",
      noteCount: 2,
      range: [60, 64],
    });
    expect(song.tracks[1].notes[0].startTick).toBe(
      song.tracks[1].notes[1].startTick,
    );
    expect(song.tempos[0].bpm).toBe(96);
  });

  it("rejects non-MIDI data", () => {
    expect(() =>
      parseMidiBuffer(
        new TextEncoder().encode("not midi data").buffer,
        "bad.mid",
      ),
    ).toThrow(/有效/);
  });
});
