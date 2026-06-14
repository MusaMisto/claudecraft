import type * as THREE from 'three';
import type { Entity, EntityId, EntityType } from './Entity';

export class EntityManager {
  private readonly entities = new Map<EntityId, Entity>();
  private nextId = 1;

  constructor(private readonly scene: THREE.Scene) {}

  allocateId(): EntityId {
    return this.nextId++;
  }

  add<T extends Entity>(entity: T): T {
    if (this.entities.has(entity.id)) {
      throw new Error(`Entity id ${entity.id} is already active.`);
    }
    this.entities.set(entity.id, entity);
    this.scene.add(entity.root);
    return entity;
  }

  get(id: EntityId): Entity | undefined {
    return this.entities.get(id);
  }

  values(): IterableIterator<Entity> {
    return this.entities.values();
  }

  tick(dtTicks = 1): void {
    for (const entity of [...this.entities.values()]) {
      if (!entity.removed) entity.tick(dtTicks);
      if (entity.removed) this.remove(entity.id);
    }
  }

  render(alpha: number): void {
    for (const entity of this.entities.values()) entity.render(alpha);
  }

  remove(id: EntityId): void {
    const entity = this.entities.get(id);
    if (!entity) return;
    this.entities.delete(id);
    this.scene.remove(entity.root);
    entity.dispose();
  }

  removeWhere(predicate: (entity: Entity) => boolean): number {
    let removed = 0;
    for (const entity of [...this.entities.values()]) {
      if (!predicate(entity)) continue;
      this.remove(entity.id);
      removed++;
    }
    return removed;
  }

  count(type?: EntityType): number {
    if (!type) return this.entities.size;
    let total = 0;
    for (const entity of this.entities.values()) {
      if (entity.type === type) total++;
    }
    return total;
  }

  dispose(): void {
    for (const id of [...this.entities.keys()]) this.remove(id);
  }
}
