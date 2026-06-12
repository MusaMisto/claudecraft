// Held-block viewmodel: the selected hotbar block drawn in the bottom-right
// corner via a second render pass, with a short swing animation on click.
import * as THREE from 'three';
import { BlockId, blockDef } from '../world/Block';
import { TextureAtlas, type UvRect } from './TextureAtlas';

type FaceKind = 'top' | 'bottom' | 'side';
const FACES: Array<{ corners: [number, number, number][]; kind: FaceKind; shade: number }> = [
  { corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], kind: 'side', shade: 0.8 }, // +X
  { corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], kind: 'side', shade: 0.8 }, // -X
  { corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], kind: 'top', shade: 1.0 },
  { corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], kind: 'bottom', shade: 0.5 },
  { corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], kind: 'side', shade: 0.6 }, // +Z
  { corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], kind: 'side', shade: 0.6 }, // -Z
];

export class HeldBlock {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 1, 0.1, 10);
  private mesh: THREE.Mesh | null = null;
  private material: THREE.MeshBasicMaterial;
  private currentBlock: BlockId | null = null;
  private swingT = 1; // 0 → 1 over the swing; ≥1 = idle

  constructor(private atlas: TextureAtlas) {
    this.material = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      alphaTest: 0.08,
      transparent: true,
    });
    this.camera.position.set(0, 0, 0);
  }

  /** Trigger the click swing. */
  swing(): void {
    this.swingT = 0;
  }

  setBlock(id: BlockId): void {
    if (id === this.currentBlock) return;
    this.currentBlock = id;
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    const def = blockDef(id);
    if (!def) return;

    const pos: number[] = [];
    const uv: number[] = [];
    const color: number[] = [];
    const idx: number[] = [];
    for (const face of FACES) {
      const rect: UvRect = this.atlas.uvRect(def.faces[face.kind]);
      const base = pos.length / 3;
      const uvc = [
        [rect.u0, rect.v1],
        [rect.u1, rect.v1],
        [rect.u1, rect.v0],
        [rect.u0, rect.v0],
      ];
      face.corners.forEach((c, i) => {
        pos.push(c[0] - 0.5, c[1] - 0.5, c[2] - 0.5);
        uv.push(uvc[i][0], uvc[i][1]);
        color.push(face.shade, face.shade, face.shade);
      });
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.scene.add(this.mesh);
  }

  /** Render as an overlay pass; call after the main scene render. */
  render(renderer: THREE.WebGLRenderer, dt: number, walkPhase: number): void {
    if (!this.mesh) return;
    this.swingT = Math.min(1, this.swingT + dt / 0.27);

    // Resting pose: bottom-right, slightly rotated like a held cube.
    const bobX = Math.sin(walkPhase) * 0.02;
    const bobY = -Math.abs(Math.cos(walkPhase)) * 0.025;
    this.mesh.position.set(0.62 + bobX, -0.58 + bobY, -1.35);
    this.mesh.rotation.set(0.16, -0.72, 0);

    // Swing: quick arc down-left and back (sin curve over the swing time).
    if (this.swingT < 1) {
      const s = Math.sin(this.swingT * Math.PI);
      this.mesh.position.x -= s * 0.25;
      this.mesh.position.y -= s * 0.18;
      this.mesh.rotation.z += s * 0.8;
      this.mesh.rotation.x += s * 0.5;
    }

    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    // Overlay pass: keep the world's color buffer, reset only depth.
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
  }

  dispose(): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    this.material.dispose();
  }
}
