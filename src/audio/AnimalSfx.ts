import * as THREE from 'three';
import type { AnimalKind } from '../entities/AnimalTypes';
import type { AudioEngine } from './AudioEngine';

const MAX_DISTANCE = 36;
const MAX_ACTIVE_VOICES = 4;
const GLOBAL_COOLDOWN = 0.18;

export class AnimalSfx {
  /** Debug/acceptance counter for successfully scheduled animal calls. */
  playedCount = 0;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly nodes = new Set<AudioScheduledSourceNode>();
  private activeVoices = 0;
  private lastVoiceAt = -Infinity;
  private disposed = false;

  constructor(private readonly engine: AudioEngine) {}

  play(kind: AnimalKind, source: THREE.Vector3, listener: THREE.Vector3): boolean {
    const { ctx, sfxGain } = this.engine;
    if (this.disposed || !ctx || !sfxGain) return false;
    const distance = source.distanceTo(listener);
    if (
      distance > MAX_DISTANCE ||
      this.activeVoices >= MAX_ACTIVE_VOICES ||
      ctx.currentTime - this.lastVoiceAt < GLOBAL_COOLDOWN
    ) {
      return false;
    }

    const attenuation = (1 - distance / MAX_DISTANCE) ** 2;
    const gain = ctx.createGain();
    gain.gain.value = attenuation * 0.42;
    const pan = ctx.createStereoPanner();
    pan.pan.value = THREE.MathUtils.clamp((source.x - listener.x) / 24, -0.8, 0.8);
    gain.connect(pan).connect(sfxGain);

    this.activeVoices++;
    this.playedCount++;
    this.lastVoiceAt = ctx.currentTime;
    const anchor = kind === 'cow'
      ? this.cow(ctx, gain)
      : kind === 'sheep'
        ? this.sheep(ctx, gain)
        : kind === 'pig'
          ? this.pig(ctx, gain)
          : this.chicken(ctx, gain);
    this.track(anchor, true);
    return true;
  }

  private cow(ctx: AudioContext, output: AudioNode): AudioScheduledSourceNode {
    const t = ctx.currentTime;
    const env = envelope(ctx, output, t, 0.02, 0.68, 0.8);
    const low = this.oscillator(ctx, env, 'sine', 112, 82, t, 0.7);
    this.oscillator(ctx, env, 'triangle', 158, 116, t, 0.62);
    this.noiseVoice(ctx, env, 'lowpass', 420, 0.24, t, 0.55);
    return low;
  }

  private sheep(ctx: AudioContext, output: AudioNode): AudioScheduledSourceNode {
    const t = ctx.currentTime;
    const env = envelope(ctx, output, t, 0.012, 0.48, 0.65);
    const voice = this.oscillator(ctx, env, 'triangle', 245, 184, t, 0.5);
    const vibrato = ctx.createOscillator();
    const depth = ctx.createGain();
    vibrato.frequency.value = 7.2;
    depth.gain.value = 13;
    vibrato.connect(depth).connect(voice.frequency);
    vibrato.start(t);
    vibrato.stop(t + 0.5);
    this.track(vibrato);
    this.noiseVoice(ctx, env, 'bandpass', 1150, 0.18, t, 0.42);
    return voice;
  }

  private pig(ctx: AudioContext, output: AudioNode): AudioScheduledSourceNode {
    const t = ctx.currentTime;
    const env = envelope(ctx, output, t, 0.006, 0.27, 0.72);
    const voice = this.oscillator(ctx, env, 'square', 196, 132, t, 0.29);
    this.oscillator(ctx, env, 'triangle', 285, 165, t, 0.23);
    this.noiseVoice(ctx, env, 'bandpass', 760, 0.28, t, 0.2);
    return voice;
  }

  private chicken(ctx: AudioContext, output: AudioNode): AudioScheduledSourceNode {
    const t = ctx.currentTime;
    const env = envelope(ctx, output, t, 0.003, 0.23, 0.58);
    this.oscillator(ctx, env, 'square', 610, 360, t, 0.1);
    const anchor = this.oscillator(ctx, env, 'square', 720, 430, t + 0.105, 0.12);
    this.noiseVoice(ctx, env, 'highpass', 2100, 0.16, t, 0.19);
    return anchor;
  }

  private oscillator(
    ctx: AudioContext,
    output: AudioNode,
    type: OscillatorType,
    startHz: number,
    endHz: number,
    start: number,
    duration: number,
  ): OscillatorNode {
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startHz * randomPitch(), start);
    oscillator.frequency.exponentialRampToValueAtTime(endHz * randomPitch(), start + duration);
    oscillator.connect(output);
    oscillator.start(start);
    oscillator.stop(start + duration);
    this.track(oscillator);
    return oscillator;
  }

  private noiseVoice(
    ctx: AudioContext,
    output: AudioNode,
    filterType: BiquadFilterType,
    frequency: number,
    level: number,
    start: number,
    duration: number,
  ): void {
    const source = ctx.createBufferSource();
    source.buffer = this.noise(ctx);
    source.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency * randomPitch();
    filter.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter).connect(gain).connect(output);
    source.start(start, Math.random() * 0.5, duration);
    source.stop(start + duration);
    this.track(source);
  }

  private noise(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer) {
      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const channel = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }

  private track(node: AudioScheduledSourceNode, endsVoice = false): void {
    this.nodes.add(node);
    node.addEventListener('ended', () => {
      this.nodes.delete(node);
      if (endsVoice) this.activeVoices = Math.max(0, this.activeVoices - 1);
    }, { once: true });
  }

  dispose(): void {
    this.disposed = true;
    for (const node of this.nodes) {
      try {
        node.stop();
      } catch {
        // Already stopped.
      }
    }
    this.nodes.clear();
    this.activeVoices = 0;
  }
}

function envelope(
  ctx: AudioContext,
  output: AudioNode,
  start: number,
  attack: number,
  duration: number,
  peak: number,
): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  gain.connect(output);
  return gain;
}

function randomPitch(): number {
  return 0.94 + Math.random() * 0.12;
}
