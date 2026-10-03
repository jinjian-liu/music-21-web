import { mapMediaError } from "./capabilities";
import type { CapabilityResult, PitchFrame } from "../domain/audio";
export class PracticeEngine {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private generation = 0;
  async start(onFrame: (frame: PitchFrame) => void): Promise<CapabilityResult> {
    this.stop();
    const generation = this.generation;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return { state: "indeterminate", reason: "unknown" };
      }
      this.stream = stream;
      const Context =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Context) {
        this.stop();
        return { state: "unsupported", reason: "media-api-missing" };
      }
      const context = new Context({ latencyHint: "interactive" });
      this.context = context;
      if (!context.audioWorklet) {
        this.stop();
        return { state: "degraded", reason: "audio-worklet-missing" };
      }
      await context.resume();
      await context.audioWorklet.addModule("/worklets/pitch-processor.js");
      if (generation !== this.generation)
        return { state: "indeterminate", reason: "unknown" };
      this.source = context.createMediaStreamSource(stream);
      this.worklet = new AudioWorkletNode(context, "pitch-processor");
      this.worklet.port.onmessage = (event: MessageEvent<PitchFrame>) => {
        if (generation === this.generation) onFrame(event.data);
      };
      this.source.connect(this.worklet);
      this.worklet.connect(context.destination);
      return {
        state: "scorable",
        reason: "ready",
        sampleRate: context.sampleRate,
      };
    } catch (error) {
      if (generation === this.generation) this.stop();
      return mapMediaError(error);
    }
  }
  stop() {
    this.generation++;
    if (this.worklet) {
      this.worklet.port.onmessage = null;
      this.worklet.disconnect();
    }
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.context && this.context.state !== "closed")
      void this.context.close().catch(() => undefined);
    this.worklet = null;
    this.source = null;
    this.stream = null;
    this.context = null;
  }
}
