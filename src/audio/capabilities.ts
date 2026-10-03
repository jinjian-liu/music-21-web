import type { CapabilityResult } from "../domain/audio";

interface CapabilityEnvironment {
  secure: boolean;
  hasMediaDevices: boolean;
  hasAudioContext: boolean;
  hasAudioWorklet: boolean;
}

export function classifyCapability(
  environment: CapabilityEnvironment,
): CapabilityResult {
  if (!environment.secure) {
    return { state: "unsupported", reason: "insecure-context" };
  }
  if (!environment.hasMediaDevices || !environment.hasAudioContext) {
    return { state: "unsupported", reason: "media-api-missing" };
  }
  if (!environment.hasAudioWorklet) {
    return { state: "degraded", reason: "audio-worklet-missing" };
  }
  return { state: "scorable", reason: "ready" };
}

export function inspectBrowserCapability(): CapabilityResult {
  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  return classifyCapability({
    secure: window.isSecureContext,
    hasMediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
    hasAudioContext: Boolean(AudioContextClass),
    hasAudioWorklet: Boolean(
      AudioContextClass && "audioWorklet" in AudioContextClass.prototype,
    ),
  });
}

export function mapMediaError(error: unknown): CapabilityResult {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return { state: "unsupported", reason: "permission-denied" };
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return { state: "unsupported", reason: "device-missing" };
  }
  return { state: "unsupported", reason: "unknown" };
}
