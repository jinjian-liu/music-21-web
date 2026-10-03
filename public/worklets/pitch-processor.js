class PitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(2048);
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (let i = 0; i < input.length; i += 1) {
      this.buffer[this.offset++] = input[i];
      if (this.offset === this.buffer.length) {
        this.analyse();
        this.buffer.copyWithin(0, this.buffer.length / 2);
        this.offset = this.buffer.length / 2;
      }
    }
    return true;
  }

  analyse() {
    const values = this.buffer;
    let energy = 0;
    for (let i = 0; i < values.length; i += 1) energy += values[i] * values[i];
    const rms = Math.sqrt(energy / values.length);
    if (rms < 0.008) {
      this.port.postMessage({ frequency: null, clarity: 0, rms, capturedAt: currentTime * 1000 });
      return;
    }

    const minLag = Math.floor(sampleRate / 1200);
    const maxLag = Math.min(Math.floor(sampleRate / 55), values.length / 2);
    let bestLag = -1;
    let bestScore = -1;
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let correlation = 0;
      let leftEnergy = 0;
      let rightEnergy = 0;
      for (let i = 0; i < values.length - lag; i += 1) {
        correlation += values[i] * values[i + lag];
        leftEnergy += values[i] * values[i];
        rightEnergy += values[i + lag] * values[i + lag];
      }
      const score = correlation / Math.sqrt(leftEnergy * rightEnergy + 1e-12);
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }

    const frequency = bestLag > 0 && bestScore > 0.55 ? sampleRate / bestLag : null;
    this.port.postMessage({
      frequency,
      clarity: Math.max(0, bestScore),
      rms,
      capturedAt: currentTime * 1000,
    });
  }
}

registerProcessor("pitch-processor", PitchProcessor);
