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

export class PassiveMobSystem {
  readonly entities: EntityManager;
  readonly renderer: MobRenderer;
  readonly spawner: MobSpawner;

  constructor(
    scene: THREE.Scene,
    world: World,
    generator: TerrainGenerator,
    textures: AnimalTextureLibrary,
    settings: Settings,
    seed: string,
  ) {
    this.entities = new EntityManager(scene);
    this.renderer = new MobRenderer(textures);
    this.spawner = new MobSpawner(
      this.entities,
      world,
      generator,
      this.renderer,
      settings,
      seed,
    );
  }

  tick(playerPosition: THREE.Vector3): void {
    this.spawner.tick(playerPosition);
    this.entities.tick();
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
  }
}
