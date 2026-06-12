// Face-culled chunk meshing: emits a quad only where a block face touches
// air or a transparent block. Produces separate opaque and transparent
// geometries with atlas UVs and per-face brightness baked as vertex colors.
import * as THREE from 'three';
import { BlockId, blockDef, isTransparent } from '../world/Block';
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

class GeometryBuilder {
  pos: number[] = [];
  uv: number[] = [];
  color: number[] = [];
  normal: number[] = [];
  idx: number[] = [];

  addFace(lx: number, y: number, lz: number, face: FaceSpec, rect: { u0: number; v0: number; u1: number; v1: number }): void {
    const base = this.pos.length / 3;
    const uvCorners = [
      [rect.u0, rect.v1],
      [rect.u1, rect.v1],
      [rect.u1, rect.v0],
      [rect.u0, rect.v0],
    ];
    for (let i = 0; i < 4; i++) {
      const c = face.corners[i];
      this.pos.push(lx + c[0], y + c[1], lz + c[2]);
      this.uv.push(uvCorners[i][0], uvCorners[i][1]);
      this.color.push(face.brightness, face.brightness, face.brightness);
      this.normal.push(face.dir[0], face.dir[1], face.dir[2]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
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
}

/**
 * Build geometry for one chunk. Neighbor lookups go through the world so
 * faces at chunk borders cull correctly against adjacent chunks.
 */
export function meshChunk(world: World, chunk: Chunk, atlas: TextureAtlas): ChunkGeometry {
  const opaque = new GeometryBuilder();
  const transparent = new GeometryBuilder();
  const ox = chunk.cx * CHUNK_SIZE;
  const oz = chunk.cz * CHUNK_SIZE;

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const id = chunk.get(lx, y, lz) as BlockId;
        if (id === BlockId.Air) continue;
        const def = blockDef(id)!;
        const builder = def.transparent ? transparent : opaque;

        for (const face of FACES) {
          const nx = lx + face.dir[0];
          const ny = y + face.dir[1];
          const nz = lz + face.dir[2];
          const neighbor =
            nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE
              ? chunk.get(nx, ny, nz)
              : world.getBlock(ox + nx, ny, oz + nz);
          if (!isTransparent(neighbor)) continue;
          // Cull faces between two blocks of the same transparent type
          // (water against water, glass against glass) — except leaves.
          if (neighbor === id && id !== BlockId.Leaves) continue;
          builder.addFace(lx, y, lz, face, atlas.uvRect(def.faces[face.kind]));
        }
      }
    }
  }

  return { opaque: opaque.build(), transparent: transparent.build() };
}
