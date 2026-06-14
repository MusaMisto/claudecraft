import * as THREE from 'three';
import type { Settings } from '../settings/Settings';
import type { TerrainGenerator } from '../world/TerrainGenerator';
import type { World } from '../world/World';
import type { AnimalTextureLibrary } from './AnimalTextures';
import { EntityManager } from './EntityManager';
import { MobRenderer } from './MobRenderer';
import { MobSpawner } from './MobSpawner';
import { PassiveMob } from './PassiveMob';
import type { AnimalKind } from './AnimalTypes';
import type { AudioEngine } from '../audio/AudioEngine';
import { AnimalSfx } from '../audio/AnimalSfx';

export class PassiveMobSystem {
  readonly entities: EntityManager;
  readonly renderer: MobRenderer;
  readonly spawner: MobSpawner;
  readonly sfx: AnimalSfx;

  constructor(
    scene: THREE.Scene,
    world: World,
    generator: TerrainGenerator,
    textures: AnimalTextureLibrary,
    settings: Settings,
    seed: string,
    audio: AudioEngine,
    playerPosition: THREE.Vector3,
  ) {
    this.entities = new EntityManager(scene);
    this.renderer = new MobRenderer(textures);
    this.sfx = new AnimalSfx(audio);
    this.spawner = new MobSpawner(
      this.entities,
      world,
      generator,
      this.renderer,
      settings,
      seed,
      (kind, position) => this.sfx.play(kind, position, playerPosition),
    );
  }

  tick(playerPosition: THREE.Vector3): void {
    this.spawner.tick(playerPosition);
    this.entities.tick();
    this.spawner.enforceNearPlayerCap(playerPosition);
  }

  render(alpha: number): void {
    this.entities.render(alpha);
  }

  counts(): Record<AnimalKind | 'total', number> {
    const counts = { total: 0, cow: 0, pig: 0, sheep: 0, chicken: 0 };
    for (const entity of this.entities.values()) {
      if (!(entity instanceof PassiveMob)) continue;
      counts.total++;
      counts[entity.kind]++;
    }
    return counts;
  }

  dispose(): void {
    this.entities.dispose();
    this.renderer.dispose();
    this.sfx.dispose();
  }
}
