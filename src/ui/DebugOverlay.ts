import type { AnimalKind } from '../entities/AnimalTypes';
import type { Player } from '../player/Player';
import type { Settings } from '../settings/Settings';
import { biomeDef } from '../world/Biome';
import type { TerrainGenerator } from '../world/TerrainGenerator';
import { DAY_LENGTH } from '../rendering/Sky';

type MobCounts = Record<AnimalKind | 'total', number>;

export class DebugOverlay {
  private readonly element: HTMLElement;
  private visible = false;
  private fpsFrames = 0;
  private fpsValue = 0;
  private fpsLastTime = performance.now();

  constructor(container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.id = 'debug-overlay';
    this.element.style.display = 'none';
    container.appendChild(this.element);
  }

  get fps(): number {
    return this.fpsValue;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.element.style.display = this.visible ? '' : 'none';
  }

  update(
    player: Player,
    worldTime: number,
    generator: TerrainGenerator,
    settings: Settings,
    mobs: MobCounts,
    mobChunks: number,
  ): void {
    this.fpsFrames++;
    const now = performance.now();
    if (now - this.fpsLastTime >= 500) {
      this.fpsValue = Math.round((this.fpsFrames * 1000) / (now - this.fpsLastTime));
      this.fpsFrames = 0;
      this.fpsLastTime = now;
    }
    if (!this.visible) return;

    const deg = ((-player.yaw * 180) / Math.PI + 360 * 100) % 360;
    const facing = ['north', 'east', 'south', 'west'][Math.round(deg / 90) % 4];
    const t = Math.floor(worldTime % DAY_LENGTH);
    const bx = Math.floor(player.position.x);
    const bz = Math.floor(player.position.z);
    const biome = biomeDef(generator.biomeAt(bx, bz));
    const climate = generator.climateAt(bx, bz);
    this.element.textContent =
      `${this.fpsValue} fps\n` +
      `xyz ${player.position.x.toFixed(2)} / ${player.position.y.toFixed(2)} / ${player.position.z.toFixed(2)}\n` +
      `biome ${biome.name}  height ${generator.height(bx, bz)}\n` +
      `temp ${climate.temperature.toFixed(2)}  humid ${climate.humidity.toFixed(2)}  cont ${climate.continentalness.toFixed(2)}  ero ${climate.erosion.toFixed(2)}  weird ${climate.weirdness.toFixed(2)}\n` +
      `graphics ${settings.vibrantVisuals ? 'Vibrant' : 'Classic'}\n` +
      `facing ${facing} (${deg.toFixed(0)}°)\n` +
      `speed ${player.horizontalSpeed.toFixed(2)} m/s  ground ${player.onGround}  fly ${player.flying}  sprint ${player.sprinting}  water ${player.inWater}\n` +
      `time ${t} (${timeLabel(t)})\n` +
      `passive mobs ${mobs.total}  cow ${mobs.cow}  pig ${mobs.pig}  sheep ${mobs.sheep}  chicken ${mobs.chicken}\n` +
      `mob chunks active ${mobChunks}`;
  }

  dispose(): void {
    this.element.remove();
  }
}

function timeLabel(tick: number): string {
  if (tick < 12000) return 'day';
  if (tick < 13800) return 'sunset';
  if (tick < 22200) return 'night';
  return 'sunrise';
}
