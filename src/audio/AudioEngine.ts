// Web Audio engine: lazy AudioContext (created on first user gesture) with
// master → music / sfx gain buses driven live by the settings sliders.
import type { Settings } from '../settings/Settings';

export class AudioEngine {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  musicGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  /** Music plays quieter in-game than on the menu. */
  musicDuck = 1;

  constructor(private settings: Settings) {}

  get started(): boolean {
    return this.ctx !== null;
  }

  /** Create/resume the AudioContext. Must be called from a user gesture. */
  ensureStarted(): boolean {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return false;
      }
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.masterGain);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.masterGain);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx.state !== 'closed';
  }

  /** Push current settings volumes into the buses (cheap; call any time). */
  applyVolumes(): void {
    if (!this.ctx || !this.musicGain || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(this.settings.musicVolume * this.musicDuck * 0.5, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.settings.sfxVolume, t, 0.05);
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.masterGain = this.musicGain = this.sfxGain = null;
  }
}
