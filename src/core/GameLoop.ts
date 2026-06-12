// Fixed 20 Hz simulation tick with interpolated rendering.
// accumulator += frameDelta; while (accumulator >= 50ms) tick();
// then render with alpha = accumulator / 50ms.

export const TICK_MS = 50; // 20 ticks per second

export class GameLoop {
  paused = false;
  private accumulator = 0;
  private lastTime: number | null = null;

  constructor(
    private tickFn: () => void,
    private renderFn: (alpha: number, frameDtMs: number) => void,
  ) {}

  /** Call once per animation frame with performance.now(). */
  frame(now: number): void {
    if (this.lastTime === null) this.lastTime = now;
    // Clamp huge deltas (tab switches) so we don't spiral on catch-up ticks.
    const frameDt = Math.min(now - this.lastTime, 250);
    this.lastTime = now;

    if (this.paused) {
      this.renderFn(1, frameDt);
      return;
    }

    this.accumulator += frameDt;
    while (this.accumulator >= TICK_MS) {
      this.tickFn();
      this.accumulator -= TICK_MS;
    }
    this.renderFn(this.accumulator / TICK_MS, frameDt);
  }

  /** Reset timing (e.g., after unpausing) so no catch-up ticks fire. */
  resetTiming(): void {
    this.lastTime = null;
    this.accumulator = 0;
  }
}
