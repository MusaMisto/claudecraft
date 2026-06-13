// Chunk mesh lifecycle: build, rebuild dirty chunks, dispose. One opaque,
// one transparent, and one water Mesh per chunk at the chunk's world origin.
import * as THREE from 'three';
import { CHUNK_SIZE } from '../world/Chunk';
import { World, chunkKey } from '../world/World';
import { meshChunk } from './ChunkMesher';
import { WaterMaterial } from './WaterMaterial';
import type { TextureAtlas } from './TextureAtlas';

interface ChunkMeshes {
  opaque: THREE.Mesh | null;
  transparent: THREE.Mesh | null;
  water: THREE.Mesh | null;
  foliage: THREE.Mesh | null;
}

export class ChunkRenderer {
  readonly group = new THREE.Group();
  /** Vibrant water (waves/glint/fresnel); Game updates it per frame. */
  readonly waterMat = new WaterMaterial();
  private meshes = new Map<string, ChunkMeshes>();
  private opaqueMat: THREE.MeshLambertMaterial;
  private transparentMat: THREE.MeshLambertMaterial;
  private foliageMat: THREE.MeshLambertMaterial;
  /** Flat fallback used when Vibrant Visuals is off. */
  private classicWaterMat: THREE.MeshLambertMaterial;
  private vibrantWater = true;

  constructor(
    private world: World,
    private atlas: TextureAtlas,
  ) {
    this.opaqueMat = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true });
    this.transparentMat = new THREE.MeshLambertMaterial({
      map: atlas.texture,
      vertexColors: true,
      transparent: true,
      alphaTest: 0.08,
    });
    this.foliageMat = new THREE.MeshLambertMaterial({
      map: atlas.texture,
      vertexColors: true,
      alphaTest: 0.45,
      side: THREE.FrontSide,
    });
    this.classicWaterMat = new THREE.MeshLambertMaterial({
      color: 0x3355cc,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
    });
  }

  /** Swap every chunk's water mesh between vibrant and classic materials. */
  setVibrantWater(on: boolean): void {
    this.vibrantWater = on;
    const mat = on ? this.waterMat : this.classicWaterMat;
    for (const entry of this.meshes.values()) {
      if (entry.water) entry.water.material = mat;
    }
  }

  /** Rebuild up to `budget` dirty chunk meshes (loaded chunks only). */
  update(budget = Infinity): void {
    let built = 0;
    for (const key of this.world.dirty) {
      if (built >= budget) break;
      this.world.dirty.delete(key);
      const [cx, cz] = key.split(',').map(Number);
      const chunk = this.world.getChunk(cx, cz);
      if (!chunk) continue;
      this.buildChunk(cx, cz);
      built++;
    }
  }

  buildChunk(cx: number, cz: number): void {
    const chunk = this.world.getChunk(cx, cz);
    if (!chunk) return;
    this.disposeChunk(cx, cz);

    const geo = meshChunk(this.world, chunk, this.atlas);
    const entry: ChunkMeshes = { opaque: null, transparent: null, water: null, foliage: null };
    if (geo.opaque) {
      entry.opaque = new THREE.Mesh(geo.opaque, this.opaqueMat);
      entry.opaque.castShadow = true;
      entry.opaque.receiveShadow = true;
    }
    if (geo.transparent) {
      entry.transparent = new THREE.Mesh(geo.transparent, this.transparentMat);
      entry.transparent.castShadow = true; // leaf blobs shadow the ground
      entry.transparent.receiveShadow = true;
    }
    if (geo.water) {
      entry.water = new THREE.Mesh(geo.water, this.vibrantWater ? this.waterMat : this.classicWaterMat);
      entry.water.receiveShadow = true; // terrain shadows fall onto the surface
    }
    if (geo.foliage) {
      entry.foliage = new THREE.Mesh(geo.foliage, this.foliageMat);
      entry.foliage.castShadow = true;
      entry.foliage.receiveShadow = true;
    }
    for (const mesh of [entry.opaque, entry.transparent, entry.water, entry.foliage]) {
      if (!mesh) continue;
      mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
      this.group.add(mesh);
    }
    this.meshes.set(chunkKey(cx, cz), entry);
  }

  disposeChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const entry = this.meshes.get(key);
    if (!entry) return;
    for (const mesh of [entry.opaque, entry.transparent, entry.water, entry.foliage]) {
      if (!mesh) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes.delete(key);
  }

  hasChunkMesh(cx: number, cz: number): boolean {
    return this.meshes.has(chunkKey(cx, cz));
  }

  /**
   * Stream chunks around a world-space center: generate chunk data out to
   * renderDistance + 1, mesh out to renderDistance (nearest first, at most
   * `budget` new meshes per call), and unload everything beyond.
   */
  stream(centerX: number, centerZ: number, renderDistance: number, budget = 2): void {
    const ccx = Math.floor(centerX / CHUNK_SIZE);
    const ccz = Math.floor(centerZ / CHUNK_SIZE);

    // Unload meshes beyond renderDistance and chunk data beyond +1.
    for (const key of [...this.meshes.keys()]) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.max(Math.abs(cx - ccx), Math.abs(cz - ccz)) > renderDistance) {
        this.disposeChunk(cx, cz);
      }
    }
    for (const key of [...this.world.chunks.keys()]) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.max(Math.abs(cx - ccx), Math.abs(cz - ccz)) > renderDistance + 1) {
        this.world.removeChunk(cx, cz);
      }
    }

    // Generate data out to renderDistance + 1 so border faces cull correctly
    // (budgeted, nearest first, to avoid frame hitches on big jumps).
    const missingData: Array<{ cx: number; cz: number; d: number }> = [];
    for (let dz = -renderDistance - 1; dz <= renderDistance + 1; dz++) {
      for (let dx = -renderDistance - 1; dx <= renderDistance + 1; dx++) {
        if (!this.world.getChunk(ccx + dx, ccz + dz)) {
          missingData.push({ cx: ccx + dx, cz: ccz + dz, d: dx * dx + dz * dz });
        }
      }
    }
    missingData.sort((a, b) => a.d - b.d);
    for (const m of missingData.slice(0, budget * 3)) {
      this.world.ensureChunk(m.cx, m.cz);
    }

    // Mesh missing chunks nearest-first within the per-frame budget, only
    // once all four neighbors' data exists (so border culling is final).
    const missing: Array<{ cx: number; cz: number; d: number }> = [];
    for (let dz = -renderDistance; dz <= renderDistance; dz++) {
      for (let dx = -renderDistance; dx <= renderDistance; dx++) {
        const cx = ccx + dx;
        const cz = ccz + dz;
        if (this.hasChunkMesh(cx, cz) || !this.world.getChunk(cx, cz)) continue;
        const neighborsReady =
          this.world.getChunk(cx + 1, cz) &&
          this.world.getChunk(cx - 1, cz) &&
          this.world.getChunk(cx, cz + 1) &&
          this.world.getChunk(cx, cz - 1);
        if (neighborsReady) missing.push({ cx, cz, d: dx * dx + dz * dz });
      }
    }
    missing.sort((a, b) => a.d - b.d);
    for (const m of missing.slice(0, budget)) {
      this.buildChunk(m.cx, m.cz);
      this.world.dirty.delete(chunkKey(m.cx, m.cz));
    }
  }

  get loadedMeshKeys(): IterableIterator<string> {
    return this.meshes.keys();
  }

  setWireframe(on: boolean): void {
    this.opaqueMat.wireframe = on;
    this.transparentMat.wireframe = on;
    this.foliageMat.wireframe = on;
  }

  dispose(): void {
    for (const key of [...this.meshes.keys()]) {
      const [cx, cz] = key.split(',').map(Number);
      this.disposeChunk(cx, cz);
    }
    this.opaqueMat.dispose();
    this.transparentMat.dispose();
    this.foliageMat.dispose();
    this.waterMat.dispose();
    this.classicWaterMat.dispose();
  }
}
