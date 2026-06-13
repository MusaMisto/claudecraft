// Full-screen underwater color wash. Rendered after the world and held item
// so both the direct vanilla path and HDR composer retain the same blue cast.
import * as THREE from 'three';

export class UnderwaterOverlay {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private geometry = new THREE.PlaneGeometry(2, 2);
  private material = new THREE.MeshBasicMaterial({
    color: 0x0b4b73,
    transparent: true,
    opacity: 0.28,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  constructor() {
    this.scene.add(new THREE.Mesh(this.geometry, this.material));
  }

  render(renderer: THREE.WebGLRenderer, visible: boolean): void {
    if (!visible) return;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
