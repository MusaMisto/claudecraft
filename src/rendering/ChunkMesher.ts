// Face-culled chunk meshing: emits a quad only where a block face touches
// air or a transparent block. Produces separate opaque, transparent, and
// water geometries with atlas UVs and per-vertex brightness (per-face
// directional shade × classic voxel ambient occlusion) baked as colors.
import * as THREE from 'three';
import { BlockId, blockDef, isSolid, isTransparent } from '../world/Block';
import { Chunk, CHUNK_SIZE, WORLD_HEIGHT } from '../world/Chunk';
import type { World } from '../world/World';
import type { TextureAtlas } from './TextureAtlas';

type FaceKind = 'top' | 'bottom' | 'side';

interface FaceSpec {
  dir: [number, number, number];
  corners: [number, number, number][]; // CCW from outside; first two = bottom edge
  kind: FaceKind;
  brightness: number;
}

// Per-face brightness: top 1.0, X sides 0.8, Z sides 0.6, bottom 0.5.
const FACES: FaceSpec[] = [
  { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], kind: 'side', brightness: 0.8 },
  { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], kind: 'side', brightness: 0.8 },
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], kind: 'top', brightness: 1.0 },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], kind: 'bottom', brightness: 0.5 },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], kind: 'side', brightness: 0.6 },
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], kind: 'side', brightness: 0.6 },
];

type Shade4 = [number, number, number, number];

class GeometryBuilder {
  pos: number[] = [];
  uv: number[] = [];
  color: number[] = [];
  normal: number[] = [];
  idx: number[] = [];

  addFace(
    lx: number,
    y: number,
    lz: number,
    face: FaceSpec,
    uvCorners: number[][],
    shade: Shade4,
    flip = false,
  ): void {
    const base = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      const c = face.corners[i];
      this.pos.push(lx + c[0], y + c[1], lz + c[2]);
      this.uv.push(uvCorners[i][0], uvCorners[i][1]);
      this.color.push(shade[i], shade[i], shade[i]);
      this.normal.push(face.dir[0], face.dir[1], face.dir[2]);
    }
    // Flip the quad diagonal when AO is darker across the default one so
    // interpolation follows the crease (avoids the "wrong diagonal" artifact).
    if (flip) {
      this.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    } else {
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  build(): THREE.BufferGeometry | null {
    if (this.idx.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    geo.setIndex(this.idx);
    geo.computeBoundingSphere();
    return geo;
  }
}

export interface ChunkGeometry {
  opaque: THREE.BufferGeometry | null;
  transparent: THREE.BufferGeometry | null;
  water: THREE.BufferGeometry | null;
}

// Vertex AO brightness per occlusion level (0 = fully creased corner).
const AO_CURVE = [0.4, 0.6, 0.8, 1.0];
// World-space UV tiling for the scrolling water detail map (blocks per tile).
const WATER_UV_SCALE = 1 / 8;

/** Blocks that darken neighboring corners (leaves do; glass/water don't). */
function occludes(id: BlockId): boolean {
  return id === BlockId.Leaves || (isSolid(id) && !isTransparent(id));
}

/**
 * Build geometry for one chunk. Neighbor lookups go through the world so
 * faces at chunk borders cull correctly against adjacent chunks. Water gets
 * its own geometry (world-space UVs for the animated wave material).
 */
export function meshChunk(world: World, chunk: Chunk, atlas: TextureAtlas): ChunkGeometry {
  const opaque = new GeometryBuilder();
  const transparent = new GeometryBuilder();
  const water = new GeometryBuilder();
  const ox = chunk.cx * CHUNK_SIZE;
  const oz = chunk.cz * CHUNK_SIZE;

  const blockAt = (lx: number, y: number, lz: number): BlockId => {
    if (y < 0 || y >= WORLD_HEIGHT) return BlockId.Air;
    return lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE
      ? (chunk.get(lx, y, lz) as BlockId)
      : (world.getBlock(ox + lx, y, oz + lz) as BlockId);
  };

  // Classic voxel AO: for a face vertex, test the two edge neighbors and the
  // diagonal in the plane one step along the face normal. Both edges solid
  // → level 0; otherwise 3 − (side1 + side2 + corner).
  const cornerAO = (lx: number, y: number, lz: number, face: FaceSpec, corner: [number, number, number]): number => {
    const [dx, dy, dz] = face.dir;
    const bx = lx + dx;
    const by = y + dy;
    const bz = lz + dz;
    // Signs along the two tangent axes (the axes where the normal is 0).
    const sx = corner[0] === 1 ? 1 : -1;
    const sy = corner[1] === 1 ? 1 : -1;
    const sz = corner[2] === 1 ? 1 : -1;
    let s1: boolean;
    let s2: boolean;
    let c: boolean;
    if (dy !== 0) {
      s1 = occludes(blockAt(bx + sx, by, bz));
      s2 = occludes(blockAt(bx, by, bz + sz));
      c = occludes(blockAt(bx + sx, by, bz + sz));
    } else if (dx !== 0) {
      s1 = occludes(blockAt(bx, by + sy, bz));
      s2 = occludes(blockAt(bx, by, bz + sz));
      c = occludes(blockAt(bx, by + sy, bz + sz));
    } else {
      s1 = occludes(blockAt(bx + sx, by, bz));
      s2 = occludes(blockAt(bx, by + sy, bz));
      c = occludes(blockAt(bx + sx, by + sy, bz));
    }
    if (s1 && s2) return 0;
    return 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (c ? 1 : 0));
  };

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const id = chunk.get(lx, y, lz) as BlockId;
        if (id === BlockId.Air) continue;
        const def = blockDef(id)!;
        const isWater = id === BlockId.Water;
        const builder = isWater ? water : def.transparent ? transparent : opaque;

        for (const face of FACES) {
          const nx = lx + face.dir[0];
          const ny = y + face.dir[1];
          const nz = lz + face.dir[2];
          const neighbor = blockAt(nx, ny, nz);
          if (!isTransparent(neighbor)) continue;
          // Cull faces between two blocks of the same transparent type
          // (water against water, glass against glass) — except leaves.
          if (neighbor === id && id !== BlockId.Leaves) continue;

          if (isWater) {
            // World-space UVs so the wave normal map tiles seamlessly
            // across chunks: x/z on horizontal faces, axis/y on sides.
            const uvCorners = face.corners.map((c) => {
              const wx = (ox + lx + c[0]) * WATER_UV_SCALE;
              const wy = (y + c[1]) * WATER_UV_SCALE;
              const wz = (oz + lz + c[2]) * WATER_UV_SCALE;
              if (face.dir[1] !== 0) return [wx, wz];
              return [face.dir[0] !== 0 ? wz : wx, wy];
            });
            builder.addFace(lx, y, lz, face, uvCorners, [
              face.brightness,
              face.brightness,
              face.brightness,
              face.brightness,
            ]);
            continue;
          }

          const rect = atlas.uvRect(def.faces[face.kind]);
          const uvCorners = [
            [rect.u0, rect.v1],
            [rect.u1, rect.v1],
            [rect.u1, rect.v0],
            [rect.u0, rect.v0],
          ];
          const ao = face.corners.map((c) => cornerAO(lx, y, lz, face, c));
          const shade = ao.map((a) => face.brightness * AO_CURVE[a]) as Shade4;
          const flip = ao[0] + ao[2] > ao[1] + ao[3];
          builder.addFace(lx, y, lz, face, uvCorners, shade, flip);
        }
      }
    }
  }

  return { opaque: opaque.build(), transparent: transparent.build(), water: water.build() };
}
