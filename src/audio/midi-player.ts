const SAMPLE_ROOTS = [33, 45, 57, 69, 81, 93];

export class MidiPlaybackEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private room: ConvolverNode | null = null;
  private buffers = new Map<number, AudioBuffer>();
  private noise: AudioBuffer | null = null;
  private sources = new Set<AudioScheduledSourceNode>();
  private preparing: Promise<void> | null = null;

  private ensureContext(): AudioContext {
    if (!this.context) {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass) throw new Error("当前浏览器不支持 Web Audio");
      this.context = new AudioContextClass({ latencyHint: "interactive" });
      this.master = this.context.createGain();
      const compressor = this.context.createDynamicsCompressor();
      this.room = this.context.createConvolver();
      const wet = this.context.createGain();
      const impulse = this.context.createBuffer(
        2,
        this.context.sampleRate * 2,
        this.context.sampleRate,
      );
      for (let channel = 0; channel < 2; channel += 1) {
        const data = impulse.getChannelData(channel);
        for (let index = 0; index < data.length; index += 1)
          data[index] =
            (Math.random() * 2 - 1) * (1 - index / data.length) ** 3;
      }
      this.room.buffer = impulse;
      wet.gain.value = 0.16;
      this.master.gain.value = 0.62;
      this.master.connect(compressor).connect(this.context.destination);
      this.room.connect(wet).connect(this.master);
    }
    return this.context;
  }

  async prepare(): Promise<void> {
    const context = this.ensureContext();
    if (context.state === "suspended") await context.resume();
    if (this.buffers.size === SAMPLE_ROOTS.length) return;
    this.preparing ??= Promise.all(
      SAMPLE_ROOTS.map(async (midi, index) => {
        const response = await fetch(`/samples/piano/A${index + 1}.mp3`);
        if (!response.ok) throw new Error("钢琴采样加载失败");
        this.buffers.set(
          midi,
          await context.decodeAudioData(await response.arrayBuffer()),
        );
      }),
    )
      .then(() => undefined)
      .finally(() => {
        this.preparing = null;
      });
    await this.preparing;
  }

  get currentTime(): number {
    return this.context?.currentTime || 0;
  }

  private track(source: AudioScheduledSourceNode): void {
    this.sources.add(source);
    source.addEventListener("ended", () => this.sources.delete(source), {
      once: true,
    });
  }

  scheduleNote(
    midi: number,
    delaySeconds: number,
    durationSeconds: number,
    velocity: number,
  ): void {
    const context = this.ensureContext();
    const start = context.currentTime + Math.max(0, delaySeconds);
    const root = SAMPLE_ROOTS.reduce(
      (best, candidate) =>
        Math.abs(candidate - midi) < Math.abs(best - midi) ? candidate : best,
      SAMPLE_ROOTS[0],
    );
    const source = context.createBufferSource();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    source.buffer = this.buffers.get(root) || null;
    source.playbackRate.value = 2 ** ((midi - root) / 12);
    filter.type = "lowpass";
    filter.frequency.value = 14_000;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.08, velocity * 0.72),
      start + 0.008,
    );
    gain.gain.setValueAtTime(
      Math.max(0.05, velocity * 0.54),
      start + Math.max(0.02, durationSeconds),
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + durationSeconds + 1.1,
    );
    source.connect(gain).connect(filter).connect(this.master!);
    filter.connect(this.room!);
    source.start(start);
    source.stop(start + durationSeconds + 1.15);
    this.track(source);
  }

  private noiseBuffer(): AudioBuffer {
    const context = this.ensureContext();
    if (!this.noise) {
      this.noise = context.createBuffer(
        1,
        context.sampleRate,
        context.sampleRate,
      );
      const data = this.noise.getChannelData(0);
      for (let index = 0; index < data.length; index += 1)
        data[index] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  scheduleDrum(midi: number, delaySeconds: number, velocity: number): void {
    const context = this.ensureContext();
    const start = context.currentTime + Math.max(0, delaySeconds);
    if (midi === 35 || midi === 36) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.setValueAtTime(130, start);
      oscillator.frequency.exponentialRampToValueAtTime(46, start + 0.16);
      gain.gain.setValueAtTime(Math.max(0.1, velocity * 0.8), start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      oscillator.connect(gain).connect(this.master!);
      oscillator.start(start);
      oscillator.stop(start + 0.3);
      this.track(oscillator);
      return;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.noiseBuffer();
    filter.type = midi === 38 || midi === 40 ? "bandpass" : "highpass";
    filter.frequency.value = midi === 38 || midi === 40 ? 1800 : 6500;
    gain.gain.setValueAtTime(Math.max(0.04, velocity * 0.35), start);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + (midi === 46 ? 0.42 : 0.13),
    );
    source.connect(filter).connect(gain).connect(this.master!);
    source.start(start);
    source.stop(start + (midi === 46 ? 0.45 : 0.15));
    this.track(source);
  }

  stopAll(): void {
    this.sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    });
    this.sources.clear();
  }

  dispose(): void {
    this.stopAll();
    void this.context?.close();
    this.context = null;
    this.buffers.clear();
  }
}
