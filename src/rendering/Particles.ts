// Block-break particles: short-lived camera-facing quads textured with
// random sub-regions of the broken block's tile.
import * as THREE from 'three';
import { ATLAS_TILE as TILE, type TextureAtlas, type UvRect } from './TextureAtlas';

// Particle debris samples a quarter-tile sub-square (chunky regardless of the
// atlas tile resolution).
const SUB = TILE / 4;

const PER_BURST = 12;
const GRAVITY = 18; // m/s²

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  size: number;
  life: number;
  age: number;
}

interface Burst {
  particles: Particle[];
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
}

export class BlockParticles {
  readonly group = new THREE.Group();
  private bursts: Burst[] = [];
  private material: THREE.MeshBasicMaterial;

  constructor(atlas: TextureAtlas) {
    this.material = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      color: 0xcccccc, // slightly darkened, like shaded debris
    });
  }

  /** Spawn a burst at the center of the broken block. */
  spawn(blockX: number, blockY: number, blockZ: number, tile: UvRect): void {
    const particles: Particle[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const tileW = tile.u1 - tile.u0;

    for (let i = 0; i < PER_BURST; i++) {
      particles.push({
        pos: new THREE.Vector3(
          blockX + 0.2 + Math.random() * 0.6,
          blockY + 0.2 + Math.random() * 0.6,
          blockZ + 0.2 + Math.random() * 0.6,
        ),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 4.5,
          Math.random() * 4.5 + 1,
          (Math.random() - 0.5) * 4.5,
        ),
        size: 0.06 + Math.random() * 0.07,
        life: 0.45 + Math.random() * 0.35,
        age: 0,
      });

      // Random quarter-tile sub-square of the tile.
      const u = tile.u0 + (Math.floor(Math.random() * (TILE - SUB)) / TILE) * tileW;
      const v = tile.v0 + (Math.floor(Math.random() * (TILE - SUB)) / TILE) * tileW;
      const s = (SUB / TILE) * tileW;
      uv.push(u, v + s, u + s, v + s, u + s, v, u, v);
      const b = i * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(PER_BURST * 12), 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(idx);
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.bursts.push({ particles, mesh, geometry });
  }

  /** Integrate particles and rebuild camera-facing quads. */
  update(dt: number, camera: THREE.Camera): void {
    if (this.bursts.length === 0) return;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);

    for (let bi = this.bursts.length - 1; bi >= 0; bi--) {
      const burst = this.bursts[bi];
      const pos = burst.geometry.getAttribute('position') as THREE.BufferAttribute;
      let alive = 0;
      for (let i = 0; i < burst.particles.length; i++) {
        const p = burst.particles[i];
        p.age += dt;
        const dead = p.age >= p.life;
        if (!dead) {
          alive++;
          p.vel.y -= GRAVITY * dt;
          p.pos.addScaledVector(p.vel, dt);
        }
        // Shrink out near end of life; collapse to zero when dead.
        const t = Math.min(1, p.age / p.life);
        const s = dead ? 0 : p.size * (t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1);
        const o = i * 12;
        const corners = [
          [-s, -s],
          [s, -s],
          [s, s],
          [-s, s],
        ];
        for (let c = 0; c < 4; c++) {
          pos.array[o + c * 3] = p.pos.x + right.x * corners[c][0] + up.x * corners[c][1];
          pos.array[o + c * 3 + 1] = p.pos.y + right.y * corners[c][0] + up.y * corners[c][1];
          pos.array[o + c * 3 + 2] = p.pos.z + right.z * corners[c][0] + up.z * corners[c][1];
        }
      }
      pos.needsUpdate = true;
      if (alive === 0) {
        this.group.remove(burst.mesh);
        burst.geometry.dispose();
        this.bursts.splice(bi, 1);
      }
    }
  }

  dispose(): void {
    for (const b of this.bursts) {
      this.group.remove(b.mesh);
      b.geometry.dispose();
    }
    this.bursts = [];
    this.material.dispose();
  }
}
