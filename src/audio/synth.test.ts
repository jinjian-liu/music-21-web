import { afterEach, describe, expect, it, vi } from "vitest";
import { PianoEngine } from "./synth";

afterEach(() => vi.unstubAllGlobals());
function delayedAudio() {
  const starts: ReturnType<typeof vi.fn>[] = [];
  const param = () => ({
    value: 1,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
  });
  const node = () => ({
    gain: param(),
    threshold: param(),
    knee: param(),
    ratio: param(),
    attack: param(),
    release: param(),
    frequency: param(),
    Q: param(),
    playbackRate: param(),
    connect() {
      return this;
    },
    disconnect() {},
  });
  vi.stubGlobal(
    "AudioContext",
    class {
      sampleRate = 1;
      currentTime = 0;
      state = "running";
      destination = node();
      createGain = node;
      createDynamicsCompressor = node;
      createConvolver = node;
      createBiquadFilter = node;
      createBuffer() {
        return {
          numberOfChannels: 2,
          getChannelData: () => new Float32Array(2),
        };
      }
      createBufferSource() {
        const start = vi.fn();
        starts.push(start);
        return { ...node(), start, stop() {} };
      }
      async decodeAudioData() {
        return {};
      }
      async close() {}
    },
  );
  let resolve!: (response: unknown) => void;
  const response = new Promise((r) => {
    resolve = r;
  });
  vi.stubGlobal("fetch", () => response);
  return {
    starts,
    ready: () =>
      resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }),
  };
}

describe("piano pending voices", () => {
  it("rearticulates a freshly pressed note while the first press is still loading", async () => {
    const audio = delayedAudio();
    const engine = new PianoEngine();
    const first = engine.attack(60);
    await Promise.resolve();
    engine.release(60);
    const second = engine.attack(60);
    await Promise.resolve();
    audio.ready();
    await Promise.all([first, second]);
    expect(
      audio.starts.reduce((n, start) => n + start.mock.calls.length, 0),
    ).toBe(1);
    engine.dispose();
  });
  it("never starts a late sample after leaving or stopping", async () => {
    const audio = delayedAudio();
    const engine = new PianoEngine();
    const pending = engine.attack(60);
    await Promise.resolve();
    engine.dispose();
    audio.ready();
    await pending;
    expect(audio.starts.every((start) => start.mock.calls.length === 0)).toBe(
      true,
    );
  });
});
