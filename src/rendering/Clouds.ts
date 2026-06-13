// Procedural 3D cloud layer: a low-frequency noise field thresholded into
// 12×12×4 m boxes at y=128, drifting slowly westward (−X) and re-anchored
// around the player so the sky never runs out of clouds.
import * as THREE from 'three';
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32, hashSeed } from '../core/Rng';

export const CLOUD_ALTITUDE = 128;
const CELL = 12;
const THICKNESS = 4;
const GRID_RADIUS = 18; // cells in each direction around the player
const DRIFT_SPEED = 0.7; // m/s westward
const NOISE_FREQ = 0.09; // per cell
const THRESHOLD = 0.42;

export class Clouds {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private material: THREE.MeshLambertMaterial;
  private geometry: THREE.BoxGeometry;
  private noise2D: NoiseFunction2D;
  private driftOffset = 0;
  private centerCellX = Infinity;
  private centerCellZ = Infinity;

  constructor(seed = 'claudecraft-clouds') {
    this.noise2D = createNoise2D(mulberry32(hashSeed(seed)));
    this.geometry = new THREE.BoxGeometry(CELL, THICKNESS, CELL);
    this.material = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.82,
    });
    const maxInstances = (GRID_RADIUS * 2 + 1) ** 2;
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, maxInstances);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true; // drifting cloud shadows (Vibrant Visuals)
    this.group.add(this.mesh);
  }

  /** Advance drift and re-anchor the cloud field around the player. */
  update(dtSeconds: number, playerX: number, playerZ: number, tint: THREE.Color): void {
    this.driftOffset += DRIFT_SPEED * dtSeconds;
    this.material.color.copy(tint);

    // Pattern is fixed in "cloud space" (world + drift); cells re-instance
    // only when the player crosses into a new cell of that space.
    const ccx = Math.floor((playerX + this.driftOffset) / CELL);
    const ccz = Math.floor(playerZ / CELL);
    if (ccx !== this.centerCellX || ccz !== this.centerCellZ) {
      this.centerCellX = ccx;
      this.centerCellZ = ccz;
      this.rebuildInstances();
    }

    // World position of cloud-space origin drifts westward.
    this.group.position.set(-this.driftOffset, CLOUD_ALTITUDE + THICKNESS / 2, 0);
  }

  private rebuildInstances(): void {
    const m = new THREE.Matrix4();
    let count = 0;
    for (let dz = -GRID_RADIUS; dz <= GRID_RADIUS; dz++) {
      for (let dx = -GRID_RADIUS; dx <= GRID_RADIUS; dx++) {
        const i = this.centerCellX + dx;
        const j = this.centerCellZ + dz;
        if (this.noise2D(i * NOISE_FREQ, j * NOISE_FREQ) <= THRESHOLD) continue;
        m.makeTranslation(i * CELL + CELL / 2, 0, j * CELL + CELL / 2);
        this.mesh.setMatrixAt(count++, m);
      }
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
