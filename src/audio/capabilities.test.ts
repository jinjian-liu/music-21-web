import { describe, expect, it } from "vitest";
import { classifyCapability } from "./capabilities";

describe("capability classification", () => {
  it("requires a secure context", () => {
    expect(
      classifyCapability({
        secure: false,
        hasMediaDevices: true,
        hasAudioContext: true,
        hasAudioWorklet: true,
      }),
    ).toMatchObject({ state: "unsupported", reason: "insecure-context" });
  });

  it("degrades when AudioWorklet is unavailable", () => {
    expect(
      classifyCapability({
        secure: true,
        hasMediaDevices: true,
        hasAudioContext: true,
        hasAudioWorklet: false,
      }),
    ).toMatchObject({ state: "degraded", reason: "audio-worklet-missing" });
  });

  it("enables scoring when all required capabilities exist", () => {
    expect(
      classifyCapability({
        secure: true,
        hasMediaDevices: true,
        hasAudioContext: true,
        hasAudioWorklet: true,
      }),
    ).toMatchObject({ state: "scorable", reason: "ready" });
  });
});
