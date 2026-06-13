import { hashSeed, mulberry32 } from '../../core/Rng';
import { BiomeId } from '../Biome';
import { CHUNK_SIZE } from '../Chunk';
import { SEA_LEVEL } from '../WorldConstants';
import {
  MAX_STRUCTURE_RADIUS,
  STRUCTURE_REGISTRY,
  type StructureDefinition,
} from './StructureRegistry';
import {
  aabbIntersects,
  distanceToAabb2D,
  type StructureAabb,
  type StructurePlacement,
  type StructureRotation,
} from './Structure';

export interface StructureTerrain {
  height(x: number, z: number): number;
  biomeAt(x: number, z: number): BiomeId;
  landBiomeAt(x: number, z: number): BiomeId;
  isNearWater(x: number, z: number, radius?: number): boolean;
}

interface TerrainProfile {
  average: number;
  min: number;
  max: number;
  wetSamples: number;
  samples: number;
}

const SIZE_PRIORITY = { micro: 0, small: 1, medium: 2, large: 3 } as const;
const COLLISION_PADDING = 6;

export class StructurePlacementPlanner {
  private readonly placementCache = new Map<string, StructurePlacement | null>();

  constructor(
    private readonly seed: string | number,
    private readonly terrain: StructureTerrain,
  ) {}

  get cachedRegionCount(): number {
    return this.placementCache.size;
  }

  placementsOverlappingChunk(
    cx: number,
    cz: number,
    ids?: ReadonlySet<StructurePlacement['id']>,
  ): StructurePlacement[] {
    const minX = cx * CHUNK_SIZE;
    const minZ = cz * CHUNK_SIZE;
    return this.placementsInBounds({
      minX,
      minY: 0,
      minZ,
      maxX: minX + CHUNK_SIZE - 1,
      maxY: 127,
      maxZ: minZ + CHUNK_SIZE - 1,
    }, ids);
  }

  placementsInBounds(
    bounds: StructureAabb,
    ids?: ReadonlySet<StructurePlacement['id']>,
  ): StructurePlacement[] {
    const search = {
      minX: bounds.minX - MAX_STRUCTURE_RADIUS - COLLISION_PADDING,
      minY: 0,
      minZ: bounds.minZ - MAX_STRUCTURE_RADIUS - COLLISION_PADDING,
      maxX: bounds.maxX + MAX_STRUCTURE_RADIUS + COLLISION_PADDING,
      maxY: 127,
      maxZ: bounds.maxZ + MAX_STRUCTURE_RADIUS + COLLISION_PADDING,
    };
    const candidates: StructurePlacement[] = [];

    for (const definition of STRUCTURE_REGISTRY) {
      if (ids && !ids.has(definition.id)) continue;
      const regionSize = definition.regionChunks * CHUNK_SIZE;
      const minRx = Math.floor(search.minX / regionSize);
      const maxRx = Math.floor(search.maxX / regionSize);
      const minRz = Math.floor(search.minZ / regionSize);
      const maxRz = Math.floor(search.maxZ / regionSize);
      for (let rz = minRz; rz <= maxRz; rz++) {
        for (let rx = minRx; rx <= maxRx; rx++) {
          const placement = this.resolve(definition, rx, rz);
          if (placement && aabbIntersects(placement.boundingBox, search)) candidates.push(placement);
        }
      }
    }

    candidates.sort((a, b) => {
      const ad = STRUCTURE_REGISTRY.find((definition) => definition.id === a.id)!;
      const bd = STRUCTURE_REGISTRY.find((definition) => definition.id === b.id)!;
      return SIZE_PRIORITY[bd.size] - SIZE_PRIORITY[ad.size] || a.seed - b.seed;
    });

    const accepted: StructurePlacement[] = [];
    for (const candidate of candidates) {
      if (accepted.some((other) => aabbIntersects(candidate.boundingBox, other.boundingBox, COLLISION_PADDING))) {
        continue;
      }
      accepted.push(candidate);
    }
    return accepted.filter((placement) => aabbIntersects(placement.boundingBox, bounds));
  }

  nearest(
    x: number,
    z: number,
    radius = 1024,
    ids?: ReadonlySet<StructurePlacement['id']>,
  ): { placement: StructurePlacement; distance: number } | null {
    const placements = this.placementsInBounds({
      minX: x - radius,
      minY: 0,
      minZ: z - radius,
      maxX: x + radius,
      maxY: 127,
      maxZ: z + radius,
    }, ids);
    let nearest: { placement: StructurePlacement; distance: number } | null = null;
    for (const placement of placements) {
      const distance = distanceToAabb2D(x, z, placement.boundingBox);
      if (!nearest || distance < nearest.distance) nearest = { placement, distance };
    }
    return nearest;
  }

  private resolve(definition: StructureDefinition, rx: number, rz: number): StructurePlacement | null {
    const key = `${definition.id}:${rx},${rz}`;
    if (this.placementCache.has(key)) return this.placementCache.get(key) ?? null;

    const seed = hashSeed(`${this.seed}:structure:${key}`);
    const rng = mulberry32(seed);
    if (rng() >= definition.chance) {
      this.placementCache.set(key, null);
      return null;
    }

    const regionSize = definition.regionChunks * CHUNK_SIZE;
    const margin = Math.min(definition.radius + 2, Math.floor(regionSize / 4));
    for (let attempt = 0; attempt < definition.attempts; attempt++) {
      const x = rx * regionSize + margin + Math.floor(rng() * (regionSize - margin * 2));
      const z = rz * regionSize + margin + Math.floor(rng() * (regionSize - margin * 2));
      if (Math.hypot(x, z) < definition.minSpawnChunks * CHUNK_SIZE) continue;
      const profile = this.profile(x, z, definition.radius);
      if (!this.validTerrain(definition, x, z, profile)) continue;
      const biome = this.terrain.landBiomeAt(x, z);
      if (definition.allowedBiomes !== 'land' && !definition.allowedBiomes.includes(biome)) continue;

      const originY = Math.round(profile.average) + 1;
      const rotation = ([0, 90, 180, 270] as const)[Math.floor(rng() * 4)] as StructureRotation;
      const placement: StructurePlacement = {
        id: definition.id,
        originX: x,
        originY,
        originZ: z,
        rotation,
        seed: hashSeed(`${seed}:${attempt}`),
        biome,
        regionX: rx,
        regionZ: rz,
        boundingBox: {
          minX: x - definition.radius,
          minY: originY - definition.below,
          minZ: z - definition.radius,
          maxX: x + definition.radius,
          maxY: originY + definition.above,
          maxZ: z + definition.radius,
        },
      };
      this.placementCache.set(key, placement);
      return placement;
    }

    this.placementCache.set(key, null);
    return null;
  }

  private profile(x: number, z: number, radius: number): TerrainProfile {
    const step = Math.max(2, Math.floor(radius / 3));
    let total = 0;
    let samples = 0;
    let wetSamples = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let dz = -radius; dz <= radius; dz += step) {
      for (let dx = -radius; dx <= radius; dx += step) {
        const height = this.terrain.height(x + dx, z + dz);
        total += height;
        samples++;
        if (height <= SEA_LEVEL) wetSamples++;
        min = Math.min(min, height);
        max = Math.max(max, height);
      }
    }
    return { average: total / samples, min, max, wetSamples, samples };
  }

  private validTerrain(
    definition: StructureDefinition,
    x: number,
    z: number,
    profile: TerrainProfile,
  ): boolean {
    if (profile.average < definition.minElevation || profile.average > definition.maxElevation) return false;
    if (profile.max - profile.min > definition.maxSlope) return false;
    if (definition.waterRule === 'dry' && profile.wetSamples > 0) return false;
    if (definition.waterRule === 'coastal') {
      const centerHeight = this.terrain.height(x, z);
      return centerHeight > SEA_LEVEL && centerHeight <= SEA_LEVEL + 5 && this.terrain.isNearWater(x, z, 10);
    }
    return true;
  }
}
