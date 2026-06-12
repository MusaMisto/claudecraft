// Generative ambient music loop, composed and synthesized in code.
// Four-chord progression (~10 s per chord) of soft triangle/sine voices with
// long attack/release, a gentle low-pass, a feedback-delay space effect, and
// sparse pentatonic melody notes drifting on top.
import { mulberry32, hashSeed, type Rng } from '../core/Rng';
import type { AudioEngine } from './AudioEngine';

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

// Original progression in D minor: Dm9 → B♭maj7 → Fmaj7 → Cadd9.
const CHORDS: number[][] = [
  [50, 57, 60, 64], // D3 A3 C4 E4
  [46, 53, 57, 60], // B♭2 F3 A3 C4
  [41, 53, 57, 64], // F2 F3 A3 E4
  [48, 55, 62, 64], // C3 G3 D4 E4
];
const CHORD_SECONDS = 10;
// D minor pentatonic for the sparse melody.
const MELODY_NOTES = [62, 65, 67, 69, 72, 74];

export class Music {
  private timer: number | null = null;
  private chordIndex = 0;
  private nextChordTime = 0;
  private nextMelodyTime = 0;
  private out: GainNode | null = null;
  private rng: Rng = mulberry32(hashSeed('claudecraft-music'));

  constructor(private engine: AudioEngine) {}

  get playing(): boolean {
    return this.timer !== null;
  }

  /** Seconds of music scheduled ahead of the clock (test/debug). */
  get scheduledAhead(): number {
    if (!this.engine.ctx || this.timer === null) return 0;
    return this.nextChordTime - this.engine.ctx.currentTime;
  }

  start(): void {
    const engine = this.engine;
    if (this.timer !== null || !engine.ctx || !engine.musicGain) return;
    const ctx = engine.ctx;

    // Shared voice bus: low-pass → (dry + feedback delay) → music bus.
    this.out = ctx.createGain();
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 900;
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.52;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.out.connect(lowpass);
    lowpass.connect(engine.musicGain);
    lowpass.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(engine.musicGain);

    this.chordIndex = 0;
    this.nextChordTime = ctx.currentTime + 0.1;
    this.nextMelodyTime = ctx.currentTime + 6;
    // Lookahead scheduler: keep ~2 s of audio queued.
    this.timer = window.setInterval(() => this.schedule(), 500);
    this.schedule();
  }

  private schedule(): void {
    const ctx = this.engine.ctx;
    if (!ctx || !this.out) return;
    while (this.nextChordTime < ctx.currentTime + 2) {
      this.playChord(CHORDS[this.chordIndex % CHORDS.length], this.nextChordTime);
      this.chordIndex++;
      this.nextChordTime += CHORD_SECONDS;
    }
    while (this.nextMelodyTime < ctx.currentTime + 2) {
      this.playMelodyNote(this.nextMelodyTime);
      this.nextMelodyTime += 3 + this.rng() * 6;
    }
  }

  private playChord(notes: number[], when: number): void {
    const ctx = this.engine.ctx!;
    for (const [i, midi] of notes.entries()) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.value = midiHz(midi);
      osc.detune.value = (this.rng() * 2 - 1) * 6;
      const env = ctx.createGain();
      const peak = i === 0 ? 0.16 : 0.09;
      env.gain.setValueAtTime(0.0001, when);
      env.gain.linearRampToValueAtTime(peak, when + 3.2);
      env.gain.setValueAtTime(peak, when + CHORD_SECONDS - 3.5);
      env.gain.linearRampToValueAtTime(0.0001, when + CHORD_SECONDS + 1.5);
      osc.connect(env).connect(this.out!);
      osc.start(when);
      osc.stop(when + CHORD_SECONDS + 2);
    }
  }

  private playMelodyNote(when: number): void {
    const ctx = this.engine.ctx!;
    const midi = MELODY_NOTES[Math.floor(this.rng() * MELODY_NOTES.length)];
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = midiHz(midi);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(0.07, when + 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 3);
    osc.connect(env).connect(this.out!);
    osc.start(when);
    osc.stop(when + 3.2);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Fade the bus out; scheduled oscillators stop on their own.
    const ctx = this.engine.ctx;
    if (ctx && this.out) {
      this.out.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      const out = this.out;
      window.setTimeout(() => out.disconnect(), 2000);
    }
    this.out = null;
  }
}
