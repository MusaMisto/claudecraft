import * as THREE from 'three';
import { hashSeed, mulberry32, type Rng } from '../core/Rng';
import type { Settings } from '../settings/Settings';
import { BlockId, isSolid } from '../world/Block';
import { BiomeId } from '../world/Biome';
import { CHUNK_SIZE } from '../world/Chunk';
import type { TerrainGenerator } from '../world/TerrainGenerator';
import type { World } from '../world/World';
import {
  ANIMAL_SPECS,
  climateVariantFor,
  selectSheepWoolColor,
  type AnimalKind,
} from './AnimalTypes';
import type { EntityManager } from './EntityManager';
import type { MobRenderer } from './MobRenderer';
import { PassiveMob } from './PassiveMob';

export const MAX_PASSIVE_MOBS_TOTAL = 60;
export const MAX_PASSIVE_MOBS_NEAR_PLAYER = 35;
export const MAX_MOBS_PER_CHUNK = 4;
const NEAR_RADIUS_BLOCKS = 64;
const SPAWN_INTERVAL_TICKS = 20;
const CHUNKS_PER_INTERVAL = 3;

const SPAWN_TABLE: Partial<Record<BiomeId, AnimalKind[]>> = {
  [BiomeId.Plains]: ['cow', 'pig', 'sheep', 'chicken'],
  [BiomeId.Forest]: ['pig', 'chicken', 'cow', 'sheep'],
  [BiomeId.BirchForest]: ['chicken', 'pig', 'sheep', 'cow'],
  [BiomeId.Taiga]: ['sheep', 'cow', 'pig', 'chicken'],
  [BiomeId.SnowyPlains]: ['sheep', 'cow', 'chicken', 'pig'],
  [BiomeId.Savanna]: ['cow', 'pig', 'sheep', 'chicken'],
  [BiomeId.Swamp]: ['pig', 'chicken'],
};

export class MobSpawner {
  private readonly evaluatedChunks = new Set<string>();
  private tickCount = 0;

  constructor(
    private readonly entities: EntityManager,
    private readonly world: World,
    private readonly generator: TerrainGenerator,
    private readonly renderer: MobRenderer,
    private readonly settings: Settings,
    private readonly worldSeed: string,
  ) {}

  tick(player: THREE.Vector3): void {
    this.removeFarMobs(player);
    if (++this.tickCount % SPAWN_INTERVAL_TICKS !== 1) return;

    const pcx = Math.floor(player.x / CHUNK_SIZE);
    const pcz = Math.floor(player.z / CHUNK_SIZE);
    const spawnRadius = Math.max(2, this.settings.renderDistance - 1);
    const despawnRadius = this.settings.renderDistance + 2;
    for (const key of [...this.evaluatedChunks]) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > despawnRadius) {
        this.evaluatedChunks.delete(key);
      }
    }

    if (this.passiveMobs().length >= MAX_PASSIVE_MOBS_TOTAL) return;
    const candidates: Array<{ cx: number; cz: number; distance: number }> = [];
    for (let dz = -spawnRadius; dz <= spawnRadius; dz++) {
      for (let dx = -spawnRadius; dx <= spawnRadius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) < 1) continue;
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = `${cx},${cz}`;
        if (this.evaluatedChunks.has(key) || !this.world.getChunk(cx, cz)) continue;
        candidates.push({ cx, cz, distance: dx * dx + dz * dz });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    for (const candidate of candidates.slice(0, CHUNKS_PER_INTERVAL)) {
      this.evaluateChunk(candidate.cx, candidate.cz, player);
    }
  }

  get activeChunkCount(): number {
    return this.evaluatedChunks.size;
  }

  private evaluateChunk(cx: number, cz: number, player: THREE.Vector3): void {
    const key = `${cx},${cz}`;
    const rng = mulberry32(hashSeed(`${this.worldSeed}:passive:${key}`));
    this.evaluatedChunks.add(key);
    if (rng() > 0.58 || this.countInChunk(key) >= MAX_MOBS_PER_CHUNK) return;

    const centerX = cx * CHUNK_SIZE + Math.floor(rng() * CHUNK_SIZE);
    const centerZ = cz * CHUNK_SIZE + Math.floor(rng() * CHUNK_SIZE);
    const biome = this.generator.biomeAt(centerX, centerZ);
    const choices = SPAWN_TABLE[biome];
    if (!choices?.length) return;
    const kind = choices[Math.floor(rng() * choices.length)];
    const spec = ANIMAL_SPECS[kind];
    const requested = spec.groupMin + Math.floor(rng() * (spec.groupMax - spec.groupMin + 1));
    const groupSize = Math.min(requested, MAX_MOBS_PER_CHUNK);
    const variant = climateVariantFor(
      biome,
      this.generator.effectiveTemperatureAt(centerX, centerZ),
    );

    for (let i = 0; i < groupSize; i++) {
      if (!this.hasCapacity(player)) break;
      const point = this.findSpawnPoint(cx, cz, centerX, centerZ, spec.width, spec.height, player, rng);
      if (!point) continue;
      const woolColor = kind === 'sheep'
        ? selectSheepWoolColor(variant, rng())
        : 'white';
      const spawn = {
        id: this.entities.allocateId(),
        kind,
        variant,
        woolColor,
        position: point,
        yaw: rng() * Math.PI * 2,
        homeChunk: key,
        aiSeed: Math.floor(rng() * 0x100000000),
      };
      this.entities.add(new PassiveMob(spawn.id, this.world, this.renderer, spawn));
    }
  }

  private findSpawnPoint(
    cx: number,
    cz: number,
    centerX: number,
    centerZ: number,
    width: number,
    height: number,
    player: THREE.Vector3,
    rng: Rng,
  ): THREE.Vector3 | null {
    for (let attempt = 0; attempt < 18; attempt++) {
      const x = centerX + Math.floor((rng() - 0.5) * 9);
      const z = centerZ + Math.floor((rng() - 0.5) * 9);
      if (Math.floor(x / CHUNK_SIZE) !== cx || Math.floor(z / CHUNK_SIZE) !== cz) continue;
      const y = this.generator.height(x, z) + 1;
      const point = new THREE.Vector3(x + 0.5, y, z + 0.5);
      if (point.distanceToSquared(player) < 12 * 12) continue;
      if (this.validSpawn(point, width, height)) return point;
    }
    return null;
  }

  private validSpawn(position: THREE.Vector3, width: number, height: number): boolean {
    const x = Math.floor(position.x);
    const z = Math.floor(position.z);
    const groundY = Math.floor(position.y) - 1;
    const ground = this.world.getBlock(x, groundY, z);
    if (ground !== BlockId.Grass && ground !== BlockId.Snow) return false;
    if (this.world.getBlock(x, groundY + 1, z) === BlockId.Water) return false;

    const half = width * 0.5;
    for (let y = Math.floor(position.y); y <= Math.floor(position.y + height - 1e-6); y++) {
      for (let bz = Math.floor(position.z - half); bz <= Math.floor(position.z + half - 1e-6); bz++) {
        for (let bx = Math.floor(position.x - half); bx <= Math.floor(position.x + half - 1e-6); bx++) {
          const block = this.world.getBlock(bx, y, bz);
          if (isSolid(block) || block === BlockId.Water) return false;
        }
      }
    }
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      if (Math.abs(this.generator.height(x + dx, z + dz) - groundY) > 1) return false;
    }
    return true;
  }

  private hasCapacity(player: THREE.Vector3): boolean {
    const mobs = this.passiveMobs();
    if (mobs.length >= MAX_PASSIVE_MOBS_TOTAL) return false;
    let near = 0;
    for (const mob of mobs) {
      if (mob.position.distanceToSquared(player) <= NEAR_RADIUS_BLOCKS ** 2) near++;
    }
    return near < MAX_PASSIVE_MOBS_NEAR_PLAYER;
  }

  private countInChunk(key: string): number {
    return this.passiveMobs().filter((mob) => mob.homeChunk === key).length;
  }

  private removeFarMobs(player: THREE.Vector3): void {
    const maxChunks = this.settings.renderDistance + 2;
    const pcx = Math.floor(player.x / CHUNK_SIZE);
    const pcz = Math.floor(player.z / CHUNK_SIZE);
    for (const mob of this.passiveMobs()) {
      const cx = Math.floor(mob.position.x / CHUNK_SIZE);
      const cz = Math.floor(mob.position.z / CHUNK_SIZE);
      if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > maxChunks) {
        mob.removed = true;
      }
    }
  }

  private passiveMobs(): PassiveMob[] {
    const mobs: PassiveMob[] = [];
    for (const entity of this.entities.values()) {
      if (entity instanceof PassiveMob) mobs.push(entity);
    }
    return mobs;
  }
}
