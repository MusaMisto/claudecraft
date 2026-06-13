// Procedural 3D cloud layer: a low-frequency noise field becomes one
// face-culled mesh, so touching 12×12×4 m cells form a continuous volume
// without transparent internal walls or visible box segmentation.
import * as THREE from 'three';
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32, hashSeed } from '../core/Rng';

export const CLOUD_ALTITUDE = 128;
const CELL = 12;
const THICKNESS = 4;
const GRID_RADIUS = 24; // covers the maximum 16-chunk render distance
const DRIFT_SPEED = 0.7; // m/s westward
const NOISE_FREQ = 0.09; // per cell
const THRESHOLD = 0.42;

export class Clouds {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh;
  private material: THREE.MeshLambertMaterial;
  private geometry = new THREE.BufferGeometry();
  private noise2D: NoiseFunction2D;
  private driftOffset = 0;
  private centerCellX = Infinity;
  private centerCellZ = Infinity;
  private occupiedCellCount = 0;
  private renderedQuadCount = 0;

  constructor(seed = 'claudecraft-clouds') {
    this.noise2D = createNoise2D(mulberry32(hashSeed(seed)));
    this.material = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.82,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.group.add(this.mesh);
  }

  /** Cloud shadows are atmospheric enhancement, not part of the vanilla base. */
  setVibrant(on: boolean): void {
    this.mesh.castShadow = on;
  }

  /** Advance drift and re-anchor the cloud field around the player. */
  update(dtSeconds: number, playerX: number, playerZ: number, tint: THREE.Color): void {
    this.driftOffset += DRIFT_SPEED * dtSeconds;
    this.material.color.copy(tint);

    const ccx = Math.floor((playerX + this.driftOffset) / CELL);
    const ccz = Math.floor(playerZ / CELL);
    if (ccx !== this.centerCellX || ccz !== this.centerCellZ) {
      this.centerCellX = ccx;
      this.centerCellZ = ccz;
      this.rebuildGeometry();
    }

    this.group.position.set(-this.driftOffset, CLOUD_ALTITUDE + THICKNESS / 2, 0);
  }

  /** Debug/acceptance statistics for the active unified cloud field. */
  get meshStats(): { occupiedCells: number; renderedQuads: number } {
    return {
      occupiedCells: this.occupiedCellCount,
      renderedQuads: this.renderedQuadCount,
    };
  }

  private rebuildGeometry(): void {
    const occupied = new Set<string>();
    for (let dz = -GRID_RADIUS; dz <= GRID_RADIUS; dz++) {
      for (let dx = -GRID_RADIUS; dx <= GRID_RADIUS; dx++) {
        const i = this.centerCellX + dx;
        const j = this.centerCellZ + dz;
        if (this.noise2D(i * NOISE_FREQ, j * NOISE_FREQ) > THRESHOLD) {
          occupied.add(`${i},${j}`);
        }
      }
    }

    const pos: number[] = [];
    const normal: number[] = [];
    const idx: number[] = [];
    const y0 = -THICKNESS / 2;
    const y1 = THICKNESS / 2;
    let quads = 0;

    const addQuad = (corners: number[][], nx: number, ny: number, nz: number) => {
      const base = pos.length / 3;
      for (const c of corners) {
        pos.push(c[0], c[1], c[2]);
        normal.push(nx, ny, nz);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      quads++;
    };

    for (const key of occupied) {
      const [i, j] = key.split(',').map(Number);
      const x0 = i * CELL;
      const x1 = x0 + CELL;
      const z0 = j * CELL;
      const z1 = z0 + CELL;

      addQuad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], 0, 1, 0);
      addQuad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0, -1, 0);
      if (!occupied.has(`${i + 1},${j}`)) {
        addQuad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], 1, 0, 0);
      }
      if (!occupied.has(`${i - 1},${j}`)) {
        addQuad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], -1, 0, 0);
      }
      if (!occupied.has(`${i},${j + 1}`)) {
        addQuad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 0, 0, 1);
      }
      if (!occupied.has(`${i},${j - 1}`)) {
        addQuad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], 0, 0, -1);
      }
    }

    const next = new THREE.BufferGeometry();
    next.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    next.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    next.setIndex(idx);
    next.computeBoundingSphere();
    this.geometry.dispose();
    this.geometry = next;
    this.mesh.geometry = next;
    this.occupiedCellCount = occupied.size;
    this.renderedQuadCount = quads;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
