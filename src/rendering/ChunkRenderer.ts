// Chunk mesh lifecycle: build, rebuild dirty chunks, dispose. One opaque and
// one transparent Mesh per chunk, positioned at the chunk's world origin.
import * as THREE from 'three';
import { CHUNK_SIZE } from '../world/Chunk';
import { World, chunkKey } from '../world/World';
import { meshChunk } from './ChunkMesher';
import type { TextureAtlas } from './TextureAtlas';

interface ChunkMeshes {
  opaque: THREE.Mesh | null;
  transparent: THREE.Mesh | null;
}

export class ChunkRenderer {
  readonly group = new THREE.Group();
  private meshes = new Map<string, ChunkMeshes>();
  private opaqueMat: THREE.MeshBasicMaterial;
  private transparentMat: THREE.MeshBasicMaterial;

  constructor(
    private world: World,
    private atlas: TextureAtlas,
  ) {
    this.opaqueMat = new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true });
    this.transparentMat = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      transparent: true,
      alphaTest: 0.08,
    });
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
    const entry: ChunkMeshes = { opaque: null, transparent: null };
    if (geo.opaque) {
      entry.opaque = new THREE.Mesh(geo.opaque, this.opaqueMat);
    }
    if (geo.transparent) {
      entry.transparent = new THREE.Mesh(geo.transparent, this.transparentMat);
    }
    for (const mesh of [entry.opaque, entry.transparent]) {
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
    for (const mesh of [entry.opaque, entry.transparent]) {
      if (!mesh) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes.delete(key);
  }

  hasChunkMesh(cx: number, cz: number): boolean {
    return this.meshes.has(chunkKey(cx, cz));
  }

  get loadedMeshKeys(): IterableIterator<string> {
    return this.meshes.keys();
  }

  setWireframe(on: boolean): void {
    this.opaqueMat.wireframe = on;
    this.transparentMat.wireframe = on;
  }

  dispose(): void {
    for (const key of [...this.meshes.keys()]) {
      const [cx, cz] = key.split(',').map(Number);
      this.disposeChunk(cx, cz);
    }
    this.opaqueMat.dispose();
    this.transparentMat.dispose();
  }
}
