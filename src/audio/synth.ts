export type PianoTone = "grand" | "bright" | "mellow" | "electric";

interface Voice {
  sources: AudioScheduledSourceNode[];
  gain: GainNode;
  releaseSeconds: number;
}

const SAMPLE_ROOTS = [33, 45, 57, 69, 81, 93];
const SAMPLE_URLS = SAMPLE_ROOTS.map((midi, index) => ({
  midi,
  url: `/samples/piano/A${index + 1}.mp3`,
}));

export class PianoEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private room: ConvolverNode | null = null;
  private roomWet: GainNode | null = null;
  private buffers = new Map<number, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private voices = new Map<number, Voice>();
  private pending = new Set<number>();
  private canceled = new Set<number>();
  private tone: PianoTone = "grand";
  private volume = 0.72;
  private resonance = 0.34;

  private createRoomImpulse(context: AudioContext): AudioBuffer {
    const duration = 2.6;
    const length = Math.floor(context.sampleRate * duration);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let index = 0; index < length; index += 1) {
        const envelope = (1 - index / length) ** 3.1;
        data[index] = (Math.random() * 2 - 1) * envelope;
      }
    }
    return impulse;
  }

  private async ensureContext(): Promise<AudioContext> {
    if (!this.context) {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio is not supported");
      this.context = new AudioContextClass({ latencyHint: "interactive" });
      this.master = this.context.createGain();
      this.compressor = this.context.createDynamicsCompressor();
      this.room = this.context.createConvolver();
      this.roomWet = this.context.createGain();
      this.room.buffer = this.createRoomImpulse(this.context);
      this.roomWet.gain.value = this.resonance * 0.58;
      this.compressor.threshold.value = -10;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 2;
      this.compressor.attack.value = 0.008;
      this.compressor.release.value = 0.32;
      this.master.gain.value = this.volume;
      this.master.connect(this.compressor).connect(this.context.destination);
      this.room.connect(this.roomWet).connect(this.master);
    }
    if (this.context.state === "suspended") await this.context.resume();
    return this.context;
  }

  private async loadSamples(context: AudioContext): Promise<void> {
    if (this.buffers.size === SAMPLE_URLS.length) return;
    this.loading ??= Promise.all(
      SAMPLE_URLS.map(async ({ midi, url }) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Unable to load ${url}`);
        this.buffers.set(
          midi,
          await context.decodeAudioData(await response.arrayBuffer()),
        );
      }),
    )
      .then(() => undefined)
      .finally(() => {
        this.loading = null;
      });
    await this.loading;
  }

  setTone(tone: PianoTone): void {
    this.tone = tone;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(
        this.volume,
        this.context.currentTime,
        0.025,
      );
  }

  setResonance(resonance: number): void {
    this.resonance = Math.max(0, Math.min(1, resonance));
    if (this.roomWet && this.context) {
      this.roomWet.gain.setTargetAtTime(
        this.resonance * 0.58,
        this.context.currentTime,
        0.04,
      );
    }
  }

  private nearestSample(midi: number): number {
    return SAMPLE_ROOTS.reduce(
      (nearest, root) =>
        Math.abs(root - midi) < Math.abs(nearest - midi) ? root : nearest,
      SAMPLE_ROOTS[0],
    );
  }

  private createElectricVoice(
    context: AudioContext,
    midi: number,
    gain: GainNode,
  ): AudioScheduledSourceNode[] {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const carrier = context.createOscillator();
    const shimmer = context.createOscillator();
    const shimmerGain = context.createGain();
    carrier.type = "sine";
    carrier.frequency.value = frequency;
    shimmer.type = "sine";
    shimmer.frequency.value = frequency * 3.01;
    shimmerGain.gain.value = 0.18;
    carrier.connect(gain);
    shimmer.connect(shimmerGain).connect(gain);
    return [carrier, shimmer];
  }

  async attack(midi: number): Promise<void> {
    if (this.voices.has(midi) || this.pending.has(midi)) return;
    this.pending.add(midi);
    this.canceled.delete(midi);
    try {
      const context = await this.ensureContext();
      const selectedTone = this.tone;
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      const now = context.currentTime;
      filter.type = "lowpass";
      filter.frequency.value =
        selectedTone === "mellow"
          ? 5200
          : selectedTone === "grand"
            ? 13000
            : 19000;
      filter.Q.value = 0.25;
      gain.connect(filter).connect(this.master!);
      filter.connect(this.room!);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(
        selectedTone === "bright" ? 0.92 : 0.78,
        now + 0.008,
      );

      let sources: AudioScheduledSourceNode[];
      if (selectedTone === "electric") {
        sources = this.createElectricVoice(context, midi, gain);
        gain.gain.exponentialRampToValueAtTime(0.26, now + 1.4);
      } else {
        try {
          await this.loadSamples(context);
          const root = this.nearestSample(midi);
          const source = context.createBufferSource();
          source.buffer = this.buffers.get(root)!;
          source.playbackRate.value = 2 ** ((midi - root) / 12);
          source.connect(gain);
          sources = [source];
        } catch {
          sources = this.createElectricVoice(context, midi, gain);
        }
      }
      if (this.canceled.delete(midi)) return;
      sources.forEach((source) => source.start());
      const releaseSeconds =
        selectedTone === "mellow"
          ? 1.65
          : selectedTone === "bright"
            ? 0.9
            : selectedTone === "electric"
              ? 1.25
              : 1.35;
      this.voices.set(midi, { sources, gain, releaseSeconds });
    } finally {
      this.pending.delete(midi);
    }
  }

  release(midi: number, releaseSeconds?: number): void {
    const voice = this.voices.get(midi);
    if (!voice || !this.context) {
      if (this.pending.has(midi)) this.canceled.add(midi);
      return;
    }
    const now = this.context.currentTime;
    const duration = releaseSeconds ?? voice.releaseSeconds;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(
      Math.max(voice.gain.gain.value, 0.0001),
      now,
    );
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    voice.sources.forEach((source) => source.stop(now + duration + 0.04));
    this.voices.delete(midi);
  }

  releaseAll(): void {
    this.pending.forEach((midi) => this.canceled.add(midi));
    [...this.voices.keys()].forEach((midi) => this.release(midi, 0.16));
  }

  dispose(): void {
    this.releaseAll();
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.room = null;
    this.roomWet = null;
    this.buffers.clear();
  }
}
