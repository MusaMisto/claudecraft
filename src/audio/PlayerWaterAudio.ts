import { BlockId } from '../world/Block';
import type { World } from '../world/World';
import type { Player } from '../player/Player';
import type { AudioEngine } from './AudioEngine';
import { WaterSfx } from './WaterSfx';

export class PlayerWaterAudio {
  private readonly sfx: WaterSfx;
  private previousInWater = false;
  private swimDistance = 0;

  constructor(
    audio: AudioEngine,
    private readonly world: World,
  ) {
    this.sfx = new WaterSfx(audio);
  }

  tick(player: Player): void {
    const nowInWater = player.inWater;
    if (nowInWater && !this.previousInWater) {
      const descent = Math.max(0, player.prevPosition.y - player.position.y);
      this.sfx.enter(Math.min(1, 0.4 + descent * 5));
      this.swimDistance = 0;
    } else if (!nowInWater && this.previousInWater) {
      this.sfx.exit();
    }

    if (nowInWater) {
      this.swimDistance += player.position.distanceTo(player.prevPosition);
      if (this.swimDistance >= 1.4) {
        this.swimDistance = 0;
        this.sfx.stroke();
      }
      const headInWater =
        this.world.getBlock(
          Math.floor(player.position.x),
          Math.floor(player.position.y + player.eyeHeight),
          Math.floor(player.position.z),
        ) === BlockId.Water;
      this.sfx.setSubmerged(headInWater);
    } else {
      this.sfx.setSubmerged(false);
    }
    this.previousInWater = nowInWater;
  }

  pause(): void {
    this.sfx.setSubmerged(false);
  }

  dispose(): void {
    this.sfx.stopAll();
  }
}
