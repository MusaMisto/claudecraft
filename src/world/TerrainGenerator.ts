// Seeded climate + terrain generation: broad deterministic Overworld biomes,
// smooth cross-biome relief, layered surfaces, water/ice, and vegetation.
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32, hashSeed } from '../core/Rng';
import { BlockId } from './Block';
import { BiomeId, biomeDef, type TreeKind } from './Biome';
import { Chunk, CHUNK_SIZE, WORLD_HEIGHT } from './Chunk';
import { selectFoliage, type FoliageKind } from './Foliage';

export const SEA_LEVEL = 62;

const OCTAVES = 4;
const BASE_WAVELENGTH = 200;
const CLIMATE_WAVELENGTH = 720;
// Continentalness / erosion / weirdness are broad, low-frequency climate
// signals (clean-room approximations of Minecraft's multi-noise concepts).
// They span hundreds–thousands of blocks so regions stay coherent.
const CONTINENTAL_WAVELENGTH = 2048;
const EROSION_WAVELENGTH = 900;
const WEIRDNESS_WAVELENGTH = 460;
// Biome-identity transition dither: a medium-frequency wobble added to the
// climate used for biome *identity only* (not terrain height, which stays
// smooth). It frays surface borders — grass↔sand, forest↔plains — into a few
// blocks of natural interleave instead of a straight cut, without checkerboards
// (the wavelength is far larger than one block) and without letting extreme
// biomes touch (the amplitude is small vs. the threshold gaps).
const BIOME_TRANSITION_NOISE_SCALE = 42;
const BIOME_TRANSITION_DITHER = 0.16;
const TREE_MARGIN = 3;
const CACTUS_CHANCE = 1 / 70;

// Effective-temperature cooling with altitude: ~0 until well above sea level,
// then a gentle ramp so tall terrain can read colder WITHOUT sprinkling snow
// into warm lowland deserts (the elevation only matters near peaks).
const COOL_START = SEA_LEVEL + 10;
const COOL_PER_BLOCK = 0.016;
// A coast is only a sand beach when it is at least this warm; colder shores
// keep their biome surface (snow / grass), so sand never abuts snow.
const COLD_BEACH_TEMP = -0.15;
// A dry column is a sand beach only within this many blocks of real water, so
// sand never appears as an inland patch in forests/plains far from any shore.
const BEACH_RADIUS = 4;

export interface Climate {
  temperature: number;
  humidity: number;
  continentalness: number;
  erosion: number;
  weirdness: number;
}

type PutBlock = (x: number, y: number, z: number, id: BlockId, keepExisting?: boolean) => void;

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export class TerrainGenerator {
  private terrainNoise: NoiseFunction2D;
  private temperatureNoise: NoiseFunction2D;
  private humidityNoise: NoiseFunction2D;
  private warpNoise: NoiseFunction2D;
  private continentalNoise: NoiseFunction2D;
  private erosionNoise: NoiseFunction2D;
  private weirdnessNoise: NoiseFunction2D;
  private transitionNoise: NoiseFunction2D;
  private floorNoise: NoiseFunction2D;
  private treeSalt: number;
  private foliageSalt: number;
  private cactusSalt: number;

  constructor(seed: string | number = 'claudecraft') {
    const noise = (suffix: string) => createNoise2D(mulberry32(hashSeed(`${seed}:${suffix}`)));
    this.terrainNoise = noise('terrain');
    this.temperatureNoise = noise('temperature');
    this.humidityNoise = noise('humidity');
    this.warpNoise = noise('climate-warp');
    this.continentalNoise = noise('continentalness');
    this.erosionNoise = noise('erosion');
    this.weirdnessNoise = noise('weirdness');
    this.transitionNoise = noise('biome-transition');
    this.floorNoise = noise('floor-patch');
    this.treeSalt = hashSeed(`${seed}:trees`);
    this.foliageSalt = hashSeed(`${seed}:foliage`);
    this.cactusSalt = hashSeed(`${seed}:cactus`);
  }

  /** Deterministic per-column hash in [0, 1) (murmur3-style finalizer). */
  private columnHash(x: number, z: number, salt: number): number {
    let h = salt;
    h = Math.imul(h ^ x, 0x01000193);
    h = Math.imul(h ^ z, 0x01000193);
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  climateAt(x: number, z: number): Climate {
    const warp = this.warpNoise(x / 1100, z / 1100) * 150;
    return {
      temperature: this.temperatureNoise((x + warp) / CLIMATE_WAVELENGTH, (z - warp) / CLIMATE_WAVELENGTH),
      humidity: this.humidityNoise((x - warp) / CLIMATE_WAVELENGTH, (z + warp) / CLIMATE_WAVELENGTH),
      continentalness: this.continentalNoise(x / CONTINENTAL_WAVELENGTH, z / CONTINENTAL_WAVELENGTH),
      erosion: this.erosionNoise(x / EROSION_WAVELENGTH, z / EROSION_WAVELENGTH),
      weirdness: this.weirdnessNoise(x / WEIRDNESS_WAVELENGTH, z / WEIRDNESS_WAVELENGTH),
    };
  }

  /** Temperature with gentle altitude cooling — colder on tall terrain only. */
  effectiveTemperatureAt(x: number, z: number, height = this.height(x, z)): number {
    return this.climateAt(x, z).temperature - Math.max(0, height - COOL_START) * COOL_PER_BLOCK;
  }

  /**
   * True if any column within `radius` blocks sits at or below sea level (i.e.
   * actually holds water). Used to gate dry sand beaches so sand only appears
   * beside real water, never as an inland patch. Deterministic / world-space,
   * so it is stable across chunk borders.
   */
  isNearWater(x: number, z: number, radius = BEACH_RADIUS): boolean {
    const r2 = radius * radius;
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if ((dx === 0 && dz === 0) || dx * dx + dz * dz > r2) continue;
        if (this.height(x + dx, z + dz) <= SEA_LEVEL) return true;
      }
    }
    return false;
  }

  /**
   * Bed material for a submerged column (height < SEA_LEVEL). Shallow shores
   * stay sandy; deeper basins expose coherent dirt and gravel blobs over a
   * sandy base. Patch shapes come from a low-frequency noise (≈26-block blobs),
   * so beds read as Minecraft-style disks rather than per-block speckle.
   */
  underwaterFloor(x: number, z: number, height: number): BlockId {
    const depth = SEA_LEVEL - height;
    const patch = this.floorNoise(x / 26, z / 26);
    const fine = this.floorNoise((x + 777) / 9, (z - 777) / 9);
    if (depth <= 2) return patch > 0.55 ? BlockId.Gravel : BlockId.Sand;
    if (patch > 0.2) return fine > 0 ? BlockId.Gravel : BlockId.Dirt;
    if (patch < -0.25) return BlockId.Dirt;
    return BlockId.Sand;
  }

  landBiomeAt(x: number, z: number): BiomeId {
    const climate = this.climateAt(x, z);
    const { weirdness } = climate;
    // Fray biome borders with a medium-frequency dither (identity only — height
    // stays smooth). Two decorrelated samples nudge temperature and humidity.
    const ts = BIOME_TRANSITION_NOISE_SCALE;
    const temperature =
      climate.temperature + this.transitionNoise(x / ts, z / ts) * BIOME_TRANSITION_DITHER;
    const humidity =
      climate.humidity + this.transitionNoise((x + 4096) / ts, (z - 4096) / ts) * BIOME_TRANSITION_DITHER;
    if (temperature < -0.42) return BiomeId.SnowyPlains;
    if (temperature < -0.08) return BiomeId.Taiga;
    if (temperature > 0.48 && humidity < -0.18) return BiomeId.Desert;
    if (temperature > 0.34 && humidity < 0.25) return BiomeId.Savanna;
    if (humidity > 0.54 && temperature > -0.05 && temperature < 0.68) return BiomeId.Swamp;
    if (humidity > 0.18) {
      // Weirdness picks the forest variant without breaking climate logic.
      return weirdness > 0.12 ? BiomeId.BirchForest : BiomeId.Forest;
    }
    return BiomeId.Plains;
  }

  /** Effective surface/water biome at a world column. */
  biomeAt(x: number, z: number): BiomeId {
    const land = this.landBiomeAt(x, z);
    if (this.height(x, z) > SEA_LEVEL || land === BiomeId.Swamp) return land;
    const temperature = this.climateAt(x, z).temperature;
    if (temperature > 0.42) return BiomeId.WarmOcean;
    if (temperature < -0.4) return BiomeId.FrozenOcean;
    return BiomeId.Ocean;
  }

  /** Surface height; climate changes relief continuously, not at biome edges. */
  height(x: number, z: number): number {
    let amplitude = 1;
    let frequency = 1 / BASE_WAVELENGTH;
    let sum = 0;
    let norm = 0;
    for (let octave = 0; octave < OCTAVES; octave++) {
      sum += this.terrainNoise(x * frequency, z * frequency) * amplitude;
      norm += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    const terrain = sum / norm;
    const { temperature, humidity, continentalness, erosion, weirdness } = this.climateAt(x, z);
    const cold = smoothstep(-0.05, -0.65, temperature);
    const hot = smoothstep(0.25, 0.7, temperature);
    const dry = smoothstep(0.15, -0.55, humidity);
    const wet = smoothstep(0.35, 0.8, humidity);
    const hotDry = hot * dry;
    const swampy = wet * smoothstep(-0.1, 0.35, temperature) * (1 - smoothstep(0.5, 0.85, temperature));

    // Continentalness sets the broad land/sea base: deep ocean basin → rising
    // shelf → coast (≈sea level) → inland plateau. `land` (0 sea … 1 inland)
    // also calms the sea floor and gates ridges.
    const land = smoothstep(-0.4, 0.0, continentalness);
    const shelf = smoothstep(-0.75, -0.4, continentalness);
    const oceanFloor = lerp(-22, -2, shelf);
    const inland = smoothstep(0.0, 0.5, continentalness);
    const contBase = lerp(oceanFloor, lerp(3, 14, inland), land);

    // Erosion modulates relief amplitude (low erosion = rugged, high = flat);
    // the sea floor stays gentler than land so basins are smooth, not spiky.
    const eroFactor = lerp(1.5, 0.55, smoothstep(-0.6, 0.6, erosion));
    const climateRelief = 13 + cold * 5 + Math.max(0, humidity) * 2 - hotDry * 5 - swampy * 8;
    const relief = climateRelief * eroFactor * lerp(0.4, 1, land);

    // Occasional inland mountain ridges: extreme weirdness + low erosion + land.
    const mountainous =
      smoothstep(0.32, 0.85, Math.abs(weirdness)) * (1 - smoothstep(-0.05, 0.55, erosion)) * land;
    const ridge = mountainous * (6 + Math.abs(terrain) * 22);

    let height = SEA_LEVEL + contBase + cold * 2 + hot * (1 - dry) * 2 + terrain * relief + ridge;
    // Land swamps flatten toward just below sea level (kept off the ocean floor).
    const swampLevel = SEA_LEVEL - 0.3 + terrain * 1.4;
    height += (swampLevel - height) * swampy * 0.9 * land;

    // Warm dry terrain gets a subtle plateau rhythm without hard biome seams.
    const terraced = Math.round(height / 3) * 3;
    height += (terraced - height) * hotDry * 0.4;
    return Math.max(1, Math.min(WORLD_HEIGHT - 10, Math.round(height)));
  }

  /**
   * A dry land spawn column near the origin. With continentalness-driven
   * oceans the origin can now fall in deep water, so spiral outward until a
   * column sits comfortably above sea level (and isn't swamp).
   */
  findSpawn(): { x: number; z: number } {
    for (let r = 0; r <= 512; r += 8) {
      for (let a = 0; a < 360; a += 30) {
        const x = Math.round(Math.cos((a * Math.PI) / 180) * r);
        const z = Math.round(Math.sin((a * Math.PI) / 180) * r);
        if (this.height(x, z) > SEA_LEVEL + 2 && this.landBiomeAt(x, z) !== BiomeId.Swamp) {
          return { x, z };
        }
      }
    }
    return { x: 0, z: 0 };
  }

  foliageAt(x: number, z: number): FoliageKind | null {
    const profile = biomeDef(this.landBiomeAt(x, z)).foliage;
    const density = this.columnHash(x, z, this.foliageSalt);
    const variant = this.columnHash(x, z, this.foliageSalt ^ 0x9e3779b9);
    const limit = { plains: 0.28, forest: 0.2, birch: 0.24, taiga: 0.24, savanna: 0.2, swamp: 0.3, none: 0 }[profile];
    if (density >= limit) return null;
    if (profile === 'taiga') return variant < 0.55 ? 'fern' : variant < 0.78 ? 'tall_grass' : 'short_grass';
    if (profile === 'savanna') return variant < 0.72 ? 'dry_grass' : variant < 0.9 ? 'short_grass' : 'dead_bush';
    if (profile === 'swamp') return variant < 0.36 ? 'fern' : variant < 0.62 ? 'bush' : variant < 0.84 ? 'tall_grass' : 'short_grass';
    if (profile === 'birch') return variant < 0.42 ? 'short_grass' : variant < 0.64 ? 'tall_grass' : variant < 0.78 ? 'fern' : 'wildflowers';
    if (profile === 'forest') return variant < 0.4 ? 'short_grass' : variant < 0.64 ? 'tall_grass' : variant < 0.82 ? 'fern' : 'bush';
    return selectFoliage(variant);
  }

  /**
   * Debug/QA: scan a square region and report climate-incoherent biome
   * placement. Lightweight (coarse step); intended for dev validation, not
   * per-frame use. Returns a list of human-readable warnings.
   */
  validateBiomeAdjacency(centerX: number, centerZ: number, radiusBlocks: number, step = 8): string[] {
    const warnings: string[] = [];
    const COLD = new Set<BiomeId>([BiomeId.SnowyPlains, BiomeId.FrozenOcean]);
    const HOT = new Set<BiomeId>([BiomeId.Desert, BiomeId.Savanna]);
    const isSand = (b: BiomeId) => biomeDef(b).surface === 'sand';
    for (let x = centerX - radiusBlocks; x <= centerX + radiusBlocks; x += step) {
      for (let z = centerZ - radiusBlocks; z <= centerZ + radiusBlocks; z += step) {
        const here = this.biomeAt(x, z);
        const land = this.landBiomeAt(x, z);
        const h = this.height(x, z);
        const c = this.climateAt(x, z);
        // Snow surface at high effective temperature.
        if (biomeDef(here).surface === 'snow' && this.effectiveTemperatureAt(x, z, h) > 0.2) {
          warnings.push(`snow at warm temp ${c.temperature.toFixed(2)} @ ${x},${z}`);
        }
        // Desert in a humid climate.
        if (land === BiomeId.Desert && c.humidity > 0.2) {
          warnings.push(`desert in humid climate ${c.humidity.toFixed(2)} @ ${x},${z}`);
        }
        // Ocean biome on a column that sits above sea level.
        if (biomeDef(here).ocean && h > SEA_LEVEL) {
          warnings.push(`ocean above sea level (h=${h}) @ ${x},${z}`);
        }
        // Visible land sand directly beside snow (the cold-coast defect).
        for (const [dx, dz] of [[step, 0], [0, step]] as const) {
          const nb = this.biomeAt(x + dx, z + dz);
          const aSand = isSand(here) && h > SEA_LEVEL;
          const nSnow = biomeDef(nb).surface === 'snow' && this.height(x + dx, z + dz) > SEA_LEVEL;
          const aSnow = biomeDef(here).surface === 'snow' && h > SEA_LEVEL;
          const nSand = isSand(nb) && this.height(x + dx, z + dz) > SEA_LEVEL;
          if ((aSand && nSnow) || (aSnow && nSand)) {
            warnings.push(`sand abuts snow @ ${x},${z}`);
          }
          // Extreme-temperature biomes touching directly.
          if ((COLD.has(here) && HOT.has(nb)) || (HOT.has(here) && COLD.has(nb))) {
            warnings.push(`extreme biomes adjacent ${here}|${nb} @ ${x},${z}`);
          }
        }
      }
    }
    return warnings;
  }

  /** Fill a chunk's block data in place. */
  generate(chunk: Chunk): void {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const height = this.height(wx, wz);
        const biome = this.biomeAt(wx, wz);
        const land = this.landBiomeAt(wx, wz);
        const def = biomeDef(biome);
        const effTemp = this.effectiveTemperatureAt(wx, wz, height);
        // Beaches are sand only on dry shoreline columns (1–2 blocks above the
        // waterline) that actually border water, and only on temperate/warm
        // shores. This removes inland sand patches (forest/plains columns that
        // merely plateau near sea level) while keeping real coasts; cold coasts
        // keep their biome surface (snow/grass), so sand never abuts snow.
        const beach =
          height > SEA_LEVEL &&
          height <= SEA_LEVEL + 2 &&
          land !== BiomeId.Swamp &&
          effTemp > COLD_BEACH_TEMP &&
          this.isNearWater(wx, wz);
        const surface =
          def.surface === 'sand' || beach
            ? BlockId.Sand
            : def.surface === 'snow' || effTemp < -0.42 // snowcaps on tall cold terrain
              ? BlockId.Snow
              : BlockId.Grass;
        // Submerged columns get a varied bed (sand/dirt/gravel patches); dry
        // columns keep their biome surface.
        const floorBlock = height < SEA_LEVEL ? this.underwaterFloor(wx, wz, height) : surface;
        const subSoil =
          floorBlock === BlockId.Sand
            ? BlockId.Sand
            : floorBlock === BlockId.Gravel
              ? BlockId.Gravel
              : BlockId.Dirt;
        const soilDepth = floorBlock === BlockId.Sand ? 5 : 3;

        for (let y = 0; y <= height; y++) {
          const id = y === height ? floorBlock : y >= height - soilDepth ? subSoil : BlockId.Stone;
          chunk.set(lx, y, lz, id);
        }
        for (let y = height + 1; y <= SEA_LEVEL; y++) {
          const frozenSurface = biome === BiomeId.FrozenOcean && y === SEA_LEVEL;
          chunk.set(lx, y, lz, frozenSurface ? BlockId.Ice : BlockId.Water);
        }
      }
    }
    this.plantFeatures(chunk, ox, oz);
  }

  private plantFeatures(chunk: Chunk, ox: number, oz: number): void {
    const put: PutBlock = (x, y, z, id, keepExisting = false) => {
      const lx = x - ox;
      const lz = z - oz;
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
      if (keepExisting && chunk.get(lx, y, lz) !== BlockId.Air) return;
      chunk.set(lx, y, lz, id);
    };

    for (let dz = -TREE_MARGIN; dz < CHUNK_SIZE + TREE_MARGIN; dz++) {
      for (let dx = -TREE_MARGIN; dx < CHUNK_SIZE + TREE_MARGIN; dx++) {
        const wx = ox + dx;
        const wz = oz + dz;
        const biome = this.landBiomeAt(wx, wz);
        const def = biomeDef(biome);
        if (def.tree === 'none') continue;
        const hash = this.columnHash(wx, wz, this.treeSalt);
        if (hash >= def.treeChance) continue;
        const height = this.height(wx, wz);
        if (height <= SEA_LEVEL + 1) continue;
        this.plantTree(put, wx, height, wz, def.tree, hash / def.treeChance);
      }
    }

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;
        if (this.landBiomeAt(wx, wz) !== BiomeId.Desert) continue;
        const hash = this.columnHash(wx, wz, this.cactusSalt);
        if (hash >= CACTUS_CHANCE) continue;
        const height = this.height(wx, wz);
        if (height <= SEA_LEVEL + 1) continue;
        const cactusHeight = 2 + Math.floor((hash / CACTUS_CHANCE) * 3);
        for (let y = 1; y <= cactusHeight; y++) put(wx, height + y, wz, BlockId.Cactus, true);
      }
    }
  }

  private plantTree(put: PutBlock, x: number, ground: number, z: number, kind: TreeKind, variant: number): void {
    if (kind === 'spruce') return this.plantSpruce(put, x, ground, z, variant);
    if (kind === 'acacia') return this.plantAcacia(put, x, ground, z, variant);
    const birch = kind === 'birch';
    const trunk = birch ? BlockId.BirchLog : BlockId.Log;
    const leaves = birch ? BlockId.BirchLeaves : BlockId.Leaves;
    const trunkHeight = (kind === 'swamp_oak' ? 4 : 5) + Math.floor(variant * (birch ? 3 : 2));
    const top = ground + trunkHeight;
    for (let y = top - 2; y <= top + 1; y++) {
      const radius = y === top + 1 ? 1 : 2;
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (radius === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2 && (dx + dz + y) % 2 === 0) continue;
          put(x + dx, y, z + dz, leaves, true);
        }
      }
    }
    for (let y = ground + 1; y <= top; y++) put(x, y, z, trunk);
  }

  private plantSpruce(put: PutBlock, x: number, ground: number, z: number, variant: number): void {
    const trunkHeight = 7 + Math.floor(variant * 3);
    const top = ground + trunkHeight;
    for (let layer = 0; layer < 6; layer++) {
      const y = top - layer;
      const radius = layer === 0 ? 0 : layer % 2 === 0 ? 2 : 1;
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > radius + 1) continue;
          put(x + dx, y, z + dz, BlockId.SpruceLeaves, true);
        }
      }
    }
    for (let y = ground + 1; y <= top; y++) put(x, y, z, BlockId.SpruceLog);
  }

  private plantAcacia(put: PutBlock, x: number, ground: number, z: number, variant: number): void {
    const trunkHeight = 5 + Math.floor(variant * 2);
    const dx = variant < 0.5 ? -1 : 1;
    const dz = variant > 0.25 && variant < 0.75 ? 1 : -1;
    let tx = x;
    let tz = z;
    for (let y = ground + 1; y <= ground + trunkHeight; y++) {
      if (y > ground + trunkHeight - 2) {
        tx += dx;
        tz += dz;
      }
      put(tx, y, tz, BlockId.AcaciaLog);
    }
    const top = ground + trunkHeight;
    for (let oz = -2; oz <= 2; oz++) {
      for (let ox = -2; ox <= 2; ox++) {
        if (Math.abs(ox) === 2 && Math.abs(oz) === 2) continue;
        put(tx + ox, top, tz + oz, BlockId.AcaciaLeaves, true);
      }
    }
    put(tx, top + 1, tz, BlockId.AcaciaLeaves, true);
  }
}
