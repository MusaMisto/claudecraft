// First-person viewmodel: the player's right arm holding the selected hotbar
// block, drawn in the bottom-right corner via a second render pass with a
// short swing animation on click. The block uses Minecraft's vanilla
// `firstperson_righthand` transform (scale 0.4, 45° yaw); the visible arm is
// a deliberate addition (see DECISIONS.md). Arm skin is generated in code.
import * as THREE from 'three';
import { BlockId, blockDef } from '../world/Block';
import { mulberry32 } from '../core/Rng';
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

// Minecraft block-model firstperson_righthand display transform.
const BLOCK_SCALE = 0.4;
const BLOCK_YAW = -Math.PI / 4; // 45°

// Minecraft arm proportions: 4×12×4 skin pixels → 0.25 × 0.75 × 0.25 m.
const ARM_W = 0.25;
const ARM_LEN = 0.75;

export class HeldBlock {
  private scene = new THREE.Scene();
  // 70° matches the main camera's default FOV (Minecraft's hand camera).
  private camera = new THREE.PerspectiveCamera(70, 1, 0.05, 10);
  private hand = new THREE.Group(); // arm + block, animated together
  private blockMesh: THREE.Mesh | null = null;
  private armMesh: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;
  private armMaterial: THREE.MeshBasicMaterial;
  private armTexture: THREE.CanvasTexture;
  private currentBlock: BlockId | null = null;
  private swingT = 1; // 0 → 1 over the swing; ≥1 = idle

  constructor(private atlas: TextureAtlas) {
    this.material = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      alphaTest: 0.08,
      transparent: true,
    });

    this.armTexture = this.buildArmTexture();
    this.armMaterial = new THREE.MeshBasicMaterial({
      map: this.armTexture,
      vertexColors: true,
    });
    this.armMesh = this.buildArm();
    this.hand.add(this.armMesh);
    this.scene.add(this.hand);
  }

  /** Seeded skin-tone noise, bare arm (no Mojang assets). */
  private buildArmTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    const rand = mulberry32(0xa53);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const j = (rand() - 0.5) * 14;
        ctx.fillStyle = `rgb(${(204 + j) | 0},${(150 + j) | 0},${(112 + j) | 0})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Boxy right arm, long axis along local Y, hand at +Y. */
  private buildArm(): THREE.Mesh {
    const geo = new THREE.BoxGeometry(ARM_W, ARM_LEN, ARM_W);
    // Per-face brightness like block faces: +x,-x,+y,-y,+z,-z (4 verts each).
    const shades = [0.8, 0.8, 1.0, 0.5, 0.9, 0.6];
    const color: number[] = [];
    for (const s of shades) for (let i = 0; i < 4; i++) color.push(s, s, s);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
    const mesh = new THREE.Mesh(geo, this.armMaterial);
    // Reach in from the bottom-right corner toward the block's underside.
    mesh.position.set(0.85, -0.72, -0.88);
    mesh.rotation.set(-0.35, 0.15, 0.5);
    return mesh;
  }

  /** Trigger the click swing. */
  swing(): void {
    this.swingT = 0;
  }

  setBlock(id: BlockId): void {
    if (id === this.currentBlock) return;
    this.currentBlock = id;
    if (this.blockMesh) {
      this.hand.remove(this.blockMesh);
      this.blockMesh.geometry.dispose();
      this.blockMesh = null;
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
    this.blockMesh = new THREE.Mesh(geo, this.material);
    // Vanilla firstperson_righthand pose: upright, 45° yaw, scale 0.4,
    // bottom-right of the view (camera space; the group only animates).
    this.blockMesh.scale.setScalar(BLOCK_SCALE);
    this.blockMesh.rotation.set(0, BLOCK_YAW, 0);
    this.blockMesh.position.set(0.62, -0.45, -1.05);
    this.hand.add(this.blockMesh);
  }

  /** Render as an overlay pass; call after the main scene render. */
  render(renderer: THREE.WebGLRenderer, dt: number, walkPhase: number): void {
    if (!this.blockMesh) return;
    this.swingT = Math.min(1, this.swingT + dt / 0.27);

    // The group carries only the animation: walk bob plus the click swing.
    const bobX = Math.sin(walkPhase) * 0.015;
    const bobY = -Math.abs(Math.cos(walkPhase)) * 0.02;
    this.hand.position.set(bobX, bobY, 0);
    this.hand.rotation.set(0, 0, 0);

    // Swing: quick arc down-left and back (sin curve over the swing time).
    if (this.swingT < 1) {
      const s = Math.sin(this.swingT * Math.PI);
      this.hand.position.x -= s * 0.18;
      this.hand.position.y -= s * 0.16;
      this.hand.rotation.z += s * 0.25;
      this.hand.rotation.x -= s * 0.3;
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
    if (this.blockMesh) {
      this.hand.remove(this.blockMesh);
      this.blockMesh.geometry.dispose();
    }
    this.armMesh.geometry.dispose();
    this.armMaterial.dispose();
    this.armTexture.dispose();
    this.material.dispose();
  }
}
