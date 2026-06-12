// Synthesized sound effects: filtered noise bursts + pitched oscillators.
// All audio is generated in code — no samples.
import type { AudioEngine } from './AudioEngine';
import type { SoundMaterial } from '../world/Block';

interface MaterialVoice {
  filterType: BiquadFilterType;
  freq: number; // filter center/cutoff
  q: number;
  duration: number; // seconds
  gain: number;
  tone?: { freq: number; type: OscillatorType; gain: number }; // extra pitched body
}

// Footstep character per material: grass soft/high rustle, stone sharp click,
// sand muffled, wood mid knock with a tonal body.
const FOOTSTEPS: Record<Exclude<SoundMaterial, 'none'>, MaterialVoice> = {
  grass: { filterType: 'bandpass', freq: 2600, q: 0.9, duration: 0.07, gain: 0.5 },
  stone: { filterType: 'bandpass', freq: 1300, q: 2.2, duration: 0.05, gain: 0.62 },
  sand: { filterType: 'lowpass', freq: 600, q: 0.6, duration: 0.09, gain: 0.7 },
  wood: { filterType: 'bandpass', freq: 480, q: 1.6, duration: 0.07, gain: 0.6, tone: { freq: 190, type: 'triangle', gain: 0.25 } },
  glass: { filterType: 'bandpass', freq: 3400, q: 3.5, duration: 0.05, gain: 0.45 },
};

export class Sfx {
  private noiseBuffer: AudioBuffer | null = null;
  /** Test/debug counter: number of effects actually played. */
  playedCount = 0;

  constructor(private engine: AudioEngine) {}

  private noise(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer) {
      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }

  /** Filtered noise burst with an exponential-decay envelope. */
  private burst(voice: MaterialVoice, pitchJitter: number, gainScale: number, freqScale = 1): void {
    const engine = this.engine;
    if (!engine.ctx || !engine.sfxGain) return;
    const ctx = engine.ctx;
    const t = ctx.currentTime;
    const jitter = 1 + (Math.random() * 2 - 1) * pitchJitter;

    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx);
    src.playbackRate.value = jitter;

    const filter = ctx.createBiquadFilter();
    filter.type = voice.filterType;
    filter.frequency.value = voice.freq * jitter * freqScale;
    filter.Q.value = voice.q;

    const env = ctx.createGain();
    env.gain.setValueAtTime(voice.gain * gainScale, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + voice.duration);

    src.connect(filter).connect(env).connect(engine.sfxGain);
    src.start(t, Math.random() * 0.5, voice.duration + 0.05);
    src.stop(t + voice.duration + 0.05);

    if (voice.tone) {
      const osc = ctx.createOscillator();
      osc.type = voice.tone.type;
      osc.frequency.value = voice.tone.freq * jitter * freqScale;
      const oenv = ctx.createGain();
      oenv.gain.setValueAtTime(voice.tone.gain * gainScale, t);
      oenv.gain.exponentialRampToValueAtTime(0.001, t + voice.duration * 1.4);
      osc.connect(oenv).connect(engine.sfxGain);
      osc.start(t);
      osc.stop(t + voice.duration * 1.5);
    }
    this.playedCount++;
  }

  footstep(material: SoundMaterial): void {
    if (material === 'none') return;
    this.burst(FOOTSTEPS[material], 0.12, 1);
  }

  /** Punchy break: louder, longer noise burst + downward pitch sweep. */
  blockBreak(material: SoundMaterial): void {
    if (material === 'none') return;
    const voice = FOOTSTEPS[material];
    this.burst({ ...voice, duration: voice.duration * 2.2, gain: voice.gain * 1.4 }, 0.08, 1, 0.8);
    const engine = this.engine;
    if (!engine.ctx || !engine.sfxGain) return;
    const ctx = engine.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(360, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.12);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.3, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(env).connect(engine.sfxGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  /** Softer, shorter placement thunk. */
  blockPlace(material: SoundMaterial): void {
    if (material === 'none') return;
    const voice = FOOTSTEPS[material];
    this.burst({ ...voice, duration: voice.duration * 1.2, gain: voice.gain * 0.8 }, 0.08, 1, 0.7);
  }

  /** Short UI click for menu buttons. */
  click(): void {
    this.burst({ filterType: 'bandpass', freq: 2100, q: 4, duration: 0.035, gain: 0.4 }, 0.03, 1);
  }
}
