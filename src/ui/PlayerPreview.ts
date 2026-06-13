// Right-side 3D player preview for the main menu. Renders the shared PlayerModel
// through the existing WebGL renderer into a scissored viewport aligned to an
// HTML "stage" element, so no extra WebGL context is created. Idles with a
// gentle sway and always shows the currently selected skin.
import * as THREE from 'three';
import { PlayerModel } from '../rendering/PlayerModel';
import type { SkinManager } from '../player/SkinManager';

export class PlayerPreview {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  private model: PlayerModel;
  private unsubscribe: () => void;
  private t = 0;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private stage: HTMLElement,
    skins: SkinManager,
  ) {
    this.model = new PlayerModel();
    // Model spans y 0..32 (skin px); recentre so the body straddles the origin.
    this.model.group.position.y = -16;
    this.scene.add(this.model.group);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x6b6b78, 1.15);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(0.5, 1.1, 1.4);
    this.scene.add(key);

    // Pull back far enough that the full 32-tall body fits with head/foot margin
    // at the 32° vertical FOV (visible height ≈ 2·dist·tan(16°) ≈ 36 units).
    this.camera.position.set(0, 0, 64);
    this.camera.lookAt(0, 0, 0);

    this.unsubscribe = skins.subscribe((s) => this.model.setSkin(s.texture));
  }

  /** Render the preview into the stage element's screen rectangle. */
  frame(dt: number): void {
    this.t += dt;
    // Gentle idle sway plus a slow turn so all sides catch light over time.
    this.model.group.rotation.y = Math.sin(this.t * 0.5) * 0.5;

    const rect = this.stage.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    const r = this.renderer;
    const fullW = window.innerWidth;
    const fullH = window.innerHeight;
    const x = rect.left;
    const y = fullH - rect.bottom; // GL viewport origin is bottom-left

    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();

    const autoClear = r.autoClear;
    r.autoClear = false;
    r.setViewport(x, y, rect.width, rect.height);
    r.setScissor(x, y, rect.width, rect.height);
    r.setScissorTest(true);
    r.clearDepth();
    r.render(this.scene, this.camera);
    // Restore full-frame viewport so the next panorama frame fills the screen.
    r.setScissorTest(false);
    r.setViewport(0, 0, fullW, fullH);
    r.autoClear = autoClear;
  }

  dispose(): void {
    this.unsubscribe();
    this.model.dispose();
    this.scene.clear();
  }
}
