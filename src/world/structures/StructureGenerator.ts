import { mulberry32, type Rng } from '../../core/Rng';
import type { Chunk } from '../Chunk';
import { applyStructureBlocksToChunk } from './StructureApplication';
import { StructureBuilder } from './StructureBuilder';
import { StructurePlacementPlanner, type StructureTerrain } from './StructurePlacement';
import type { StructureBlock, StructureId, StructurePlacement } from './Structure';

export type StructureFactory = (builder: StructureBuilder, rng: Rng) => void;

export class StructureGenerator {
  readonly planner: StructurePlacementPlanner;
  private readonly activeIds: ReadonlySet<StructureId>;
  private readonly blockCache = new Map<string, StructureBlock[]>();

  constructor(
    seed: string | number,
    private readonly terrain: StructureTerrain,
    private readonly factories: ReadonlyMap<StructureId, StructureFactory>,
  ) {
    this.planner = new StructurePlacementPlanner(seed, terrain);
    this.activeIds = new Set(factories.keys());
  }

  get cachedBlueprintCount(): number {
    return this.blockCache.size;
  }

  placementsOverlappingChunk(cx: number, cz: number): StructurePlacement[] {
    return this.planner.placementsOverlappingChunk(cx, cz, this.activeIds);
  }

  nearest(x: number, z: number, radius = 1024) {
    return this.planner.nearest(x, z, radius, this.activeIds);
  }

  applyToChunk(chunk: Chunk): number {
    let applied = 0;
    for (const placement of this.placementsOverlappingChunk(chunk.cx, chunk.cz)) {
      applied += applyStructureBlocksToChunk(chunk, this.blocksFor(placement));
    }
    return applied;
  }

  private blocksFor(placement: StructurePlacement): StructureBlock[] {
    const key = `${placement.id}:${placement.originX},${placement.originZ}`;
    const cached = this.blockCache.get(key);
    if (cached) return cached;
    const factory = this.factories.get(placement.id);
    if (!factory) return [];
    const builder = new StructureBuilder(placement, this.terrain);
    factory(builder, mulberry32(placement.seed));
    const blocks = builder.result();
    this.blockCache.set(key, blocks);
    return blocks;
  }
}
