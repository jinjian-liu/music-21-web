import { describe, it, expect, vi, afterEach } from "vitest";
import { PracticeEngine } from "./practice-engine";
afterEach(() => vi.unstubAllGlobals());
describe("microphone lifecycle", () => {
  it("releases a stream when permission resolves after leaving the page", async () => {
    let resolve!: (stream: MediaStream) => void;
    const stop = vi.fn();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: () =>
          new Promise<MediaStream>((r) => {
            resolve = r;
          }),
      },
    });
    const engine = new PracticeEngine();
    const task = engine.start(vi.fn());
    engine.stop();
    resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    expect((await task).state).toBe("indeterminate");
    expect(stop).toHaveBeenCalledOnce();
  });
  it("returns an explicit permission failure without throwing", async () => {
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: () =>
          Promise.reject(new DOMException("denied", "NotAllowedError")),
      },
    });
    const result = await new PracticeEngine().start(vi.fn());
    expect(result.reason).toBe("permission-denied");
  });
});
