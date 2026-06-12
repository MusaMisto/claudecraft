// Translates raw input into per-tick movement intent: WASD, jump, sprint
// (Ctrl or double-tap W), creative fly toggle (double-tap Space), mouse look.
import type { Input } from '../core/Input';
import type { Settings } from '../settings/Settings';
import type { Player } from './Player';

export interface MoveIntent {
  forward: number; // -1..1
  strafe: number; // -1..1 (positive = right)
  jump: boolean;
  flyUp: boolean;
  flyDown: boolean;
  sneak: boolean;
}

const DOUBLE_TAP_MS = 280;
const MAX_PITCH = Math.PI / 2 - 0.001;

/** Extra movement source for automated tests / debug. */
export interface DebugMove {
  forward?: number;
  strafe?: number;
  jump?: boolean;
  sprint?: boolean;
  flyUp?: boolean;
  flyDown?: boolean;
  sneak?: boolean;
}

export class PlayerController {
  debugMove: DebugMove = {};
  private sprintLatch = false;
  private lastWTap = -Infinity;
  private lastSpaceTap = -Infinity;
  private unsubscribe: () => void;

  constructor(
    private input: Input,
    private player: Player,
    private settings: Settings,
  ) {
    this.unsubscribe = input.onKeyDown((code) => this.onKeyDown(code));
  }

  private onKeyDown(code: string): void {
    const now = performance.now();
    if (code === 'KeyW') {
      if (now - this.lastWTap < DOUBLE_TAP_MS) this.sprintLatch = true;
      this.lastWTap = now;
    } else if (code === 'Space') {
      if (now - this.lastSpaceTap < DOUBLE_TAP_MS) {
        this.player.flying = !this.player.flying;
        if (this.player.flying) this.player.velocity.y = 0;
        this.lastSpaceTap = -Infinity; // require two fresh taps next time
        return;
      }
      this.lastSpaceTap = now;
    }
  }

  /** Apply accumulated mouse movement to look angles. Call once per frame. */
  updateLook(): void {
    const { dx, dy } = this.input.consumeMouseDelta();
    const radPerPixel = 0.0008 + this.settings.mouseSensitivity * 0.0028;
    this.player.yaw -= dx * radPerPixel;
    this.player.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.player.pitch - dy * radPerPixel));
  }

  /** Build this tick's movement intent and update sprint state. */
  intent(): MoveIntent {
    const dbg = this.debugMove;
    const forward =
      (this.input.isDown('KeyW') ? 1 : 0) - (this.input.isDown('KeyS') ? 1 : 0) + (dbg.forward ?? 0);
    const strafe =
      (this.input.isDown('KeyD') ? 1 : 0) - (this.input.isDown('KeyA') ? 1 : 0) + (dbg.strafe ?? 0);

    const shift = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const sneak = (shift && !this.player.flying) || !!dbg.sneak;

    const sprintKey = this.input.isDown('ControlLeft') || this.input.isDown('ControlRight') || !!dbg.sprint;
    if (sprintKey && forward > 0) this.sprintLatch = true;
    if (forward <= 0 || sneak) this.sprintLatch = false;
    this.player.sprinting = this.sprintLatch && forward > 0;

    return {
      forward,
      strafe,
      jump: this.input.isDown('Space') || !!dbg.jump,
      flyUp: this.input.isDown('Space') || !!dbg.flyUp,
      flyDown: (shift && this.player.flying) || !!dbg.flyDown,
      sneak,
    };
  }

  dispose(): void {
    this.unsubscribe();
  }
}
