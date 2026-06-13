// First-person viewmodel: the player's right arm holding the selected hotbar
// block, drawn in the bottom-right corner via a second render pass with a
// short swing animation on click. The block uses Minecraft's vanilla
// `firstperson_righthand` transform (scale 0.4, 45° yaw); the visible arm is
// a deliberate addition (see DECISIONS.md). The arm uses the SAME selected skin
// texture as the menu preview, mapped with the classic right-arm UVs (base +
// sleeve overlay), and updates live when the skin changes.
import * as THREE from 'three';
import { BlockId, blockDef } from '../world/Block';
import { TextureAtlas, type UvRect } from './TextureAtlas';
import { buildSkinBox, CLASSIC } from './SkinUv';
import type { SkinManager } from '../player/SkinManager';

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
const PX = 0.25 / 4; // world units per skin pixel
const ARM_W = 4 * PX; // 0.25
const ARM_LEN = 12 * PX; // 0.75
const OVERLAY_INFLATE = 0.5 * PX; // sleeve: +0.25px per side, +0.5px total

export class HeldBlock {
  private scene = new THREE.Scene();
  // 70° matches the main camera's default FOV (Minecraft's hand camera).
  private camera = new THREE.PerspectiveCamera(70, 1, 0.05, 10);
  private hand = new THREE.Group(); // arm + block, animated together
  private blockMesh: THREE.Mesh | null = null;
  private armGroup: THREE.Group;
  private armGeometries: THREE.BufferGeometry[] = [];
  private material: THREE.MeshBasicMaterial;
  private skinMaterial: THREE.MeshBasicMaterial;
  private skinOverlayMaterial: THREE.MeshBasicMaterial;
  private unsubscribeSkin: () => void;
  private currentBlock: BlockId | null = null;
  private swingT = 1; // 0 → 1 over the swing; ≥1 = idle

  constructor(private atlas: TextureAtlas, skins: SkinManager) {
    this.material = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      alphaTest: 0.08,
      transparent: true,
    });

    // The arm shares the selected skin texture with the menu preview.
    this.skinMaterial = new THREE.MeshBasicMaterial({ map: skins.texture });
    this.skinOverlayMaterial = new THREE.MeshBasicMaterial({
      map: skins.texture,
      transparent: true,
      alphaTest: 0.5,
    });
    this.armGroup = this.buildArm();
    this.hand.add(this.armGroup);
    this.scene.add(this.hand);

    this.unsubscribeSkin = skins.subscribe((s) => {
      this.skinMaterial.map = s.texture;
      this.skinOverlayMaterial.map = s.texture;
      this.skinMaterial.needsUpdate = true;
      this.skinOverlayMaterial.needsUpdate = true;
    });
  }

  /** Boxy right arm with the classic right-arm skin UVs; long axis along Y. */
  private buildArm(): THREE.Group {
    const group = new THREE.Group();
    const baseGeo = buildSkinBox(ARM_W, ARM_LEN, ARM_W, CLASSIC.rightArm.base);
    const overlayGeo = buildSkinBox(
      ARM_W + OVERLAY_INFLATE,
      ARM_LEN + OVERLAY_INFLATE,
      ARM_W + OVERLAY_INFLATE,
      CLASSIC.rightArm.overlay,
    );
    this.armGeometries.push(baseGeo, overlayGeo);
    group.add(new THREE.Mesh(baseGeo, this.skinMaterial));
    group.add(new THREE.Mesh(overlayGeo, this.skinOverlayMaterial));
    // The skin lays the arm out shoulder(+Y) → hand(−Y). Flip 180° about Z so
    // the skin-tone wrist grips the block (top) while the sleeve runs down to
    // the screen corner (bottom-right); the front face stays toward the camera.
    group.position.set(0.85, -0.72, -0.88);
    group.rotation.set(-0.35, 0.15, 0.5 + Math.PI);
    return group;
  }

  /** Trigger the click swing. */
  swing(): void {
    this.swingT = 0;
  }

  /**
   * Recompile after a renderer tone-mapping change — this overlay renders
   * direct-to-screen, where tone mapping is baked into material programs.
   */
  refreshMaterials(): void {
    this.material.needsUpdate = true;
    this.skinMaterial.needsUpdate = true;
    this.skinOverlayMaterial.needsUpdate = true;
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
    this.unsubscribeSkin();
    if (this.blockMesh) {
      this.hand.remove(this.blockMesh);
      this.blockMesh.geometry.dispose();
    }
    for (const geo of this.armGeometries) geo.dispose();
    this.skinMaterial.dispose();
    this.skinOverlayMaterial.dispose();
    this.material.dispose();
  }
}
