// Synthesized water audio: entry/exit splashes, periodic swim strokes, and a
// low looped submerged ambience. All voices route through the engine's sfxGain
// bus, so they follow the SFX volume slider. No samples — filtered noise only.
import type { AudioEngine } from './AudioEngine';

export class WaterSfx {
  private noiseBuffer: AudioBuffer | null = null;
  private ambience: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private submerged = false;

  constructor(private engine: AudioEngine) {}

  private noise(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer) {
      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }

  /** Filtered noise burst with a falling cutoff and an attack/decay envelope. */
  private splash(gain: number, cutoffStart: number, cutoffEnd: number, duration: number): void {
    const { ctx, sfxGain } = this.engine;
    if (!ctx || !sfxGain) return;
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx);
    src.playbackRate.value = 0.85 + Math.random() * 0.3;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffStart, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoffEnd), t + duration);
    filter.Q.value = 0.7;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    src.connect(filter).connect(env).connect(sfxGain);
    src.start(t, Math.random() * 0.5, duration + 0.05);
    src.stop(t + duration + 0.05);
  }

  /** Plunging into water. `intensity` (0..1) scales loudness/brightness. */
  enter(intensity: number): void {
    const i = Math.max(0, Math.min(1, intensity));
    this.splash(0.35 + i * 0.35, 1500 + i * 1200, 380, 0.34);
  }

  /** Climbing out — softer and shorter than the entry. */
  exit(): void {
    this.splash(0.26, 1100, 320, 0.22);
  }

  /** One swimming stroke; called on a distance cadence, not every tick. */
  stroke(): void {
    this.splash(0.16 + Math.random() * 0.06, 700 + Math.random() * 300, 260, 0.2);
  }

  /** Fade the low submerged ambience loop in/out as the head enters/leaves water. */
  setSubmerged(on: boolean): void {
    if (on === this.submerged) return;
    this.submerged = on;
    const { ctx, sfxGain } = this.engine;
    if (!ctx || !sfxGain) return;
    const t = ctx.currentTime;
    if (on) {
      if (this.ambience) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noise(ctx);
      src.loop = true;
      src.playbackRate.value = 0.6;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 360;
      filter.Q.value = 0.5;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.4);
      src.connect(filter).connect(gain).connect(sfxGain);
      src.start(t);
      this.ambience = { src, gain };
    } else if (this.ambience) {
      const { src, gain } = this.ambience;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0.0001, t + 0.3);
      src.stop(t + 0.35);
      this.ambience = null;
    }
  }

  /** Stop the ambience immediately (pause / leave world). */
  stopAll(): void {
    if (this.ambience) {
      try {
        this.ambience.src.stop();
      } catch {
        /* already stopped */
      }
      this.ambience = null;
    }
    this.submerged = false;
  }
}
