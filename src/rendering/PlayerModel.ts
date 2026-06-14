// Clean-room blocky humanoid built from Three.js cuboids in the classic 64×64
// skin layout (4px arms). Head/body/arms/legs each carry a base mesh and a
// slightly inflated transparent overlay mesh, all sharing one skin texture.
// Dimensions are in skin pixels (feet at y=0); the caller scales the group.
import * as THREE from 'three';
import { buildSkinBox, CLASSIC, type PartRects } from './SkinUv';

// Overlay inflation per the spec: head +0.5px/side, others +0.25px/side.
const HEAD_INFLATE = 1.0;
const LIMB_INFLATE = 0.5;

interface Part {
  group: THREE.Group;
  base: THREE.Mesh;
  overlay: THREE.Mesh;
}

export class PlayerModel {
  readonly group = new THREE.Group();
  /** Right arm group, exposed so a viewmodel could reuse the same proportions. */
  private parts: Part[] = [];
  private baseMaterial: THREE.MeshLambertMaterial;
  private overlayMaterial: THREE.MeshLambertMaterial;
  private geometries: THREE.BufferGeometry[] = [];

  constructor(texture?: THREE.Texture) {
    this.baseMaterial = new THREE.MeshLambertMaterial({ map: texture ?? null });
    this.overlayMaterial = new THREE.MeshLambertMaterial({
      map: texture ?? null,
      transparent: true,
      alphaTest: 0.5,
      depthWrite: true,
    });

    // part, dims (w,h,d) in skin px, center (x,y,z), overlay inflation
    this.addPart(CLASSIC.head, 8, 8, 8, 0, 28, 0, HEAD_INFLATE);
    this.addPart(CLASSIC.body, 8, 12, 4, 0, 18, 0, LIMB_INFLATE);
    this.addPart(CLASSIC.rightArm, 4, 12, 4, -6, 18, 0, LIMB_INFLATE);
    this.addPart(CLASSIC.leftArm, 4, 12, 4, 6, 18, 0, LIMB_INFLATE);
    this.addPart(CLASSIC.rightLeg, 4, 12, 4, -2, 6, 0, LIMB_INFLATE);
    this.addPart(CLASSIC.leftLeg, 4, 12, 4, 2, 6, 0, LIMB_INFLATE);
  }

  private addPart(rects: PartRects, w: number, h: number, d: number, cx: number, cy: number, cz: number, inflate: number): void {
    const baseGeo = buildSkinBox(w, h, d, rects.base);
    const overlayGeo = buildSkinBox(w + inflate, h + inflate, d + inflate, rects.overlay);
    this.geometries.push(baseGeo, overlayGeo);
    const base = new THREE.Mesh(baseGeo, this.baseMaterial);
    const overlay = new THREE.Mesh(overlayGeo, this.overlayMaterial);
    base.castShadow = overlay.castShadow = true;
    const group = new THREE.Group();
    group.position.set(cx, cy, cz);
    group.add(base, overlay);
    this.group.add(group);
    this.parts.push({ group, base, overlay });
  }

  setSkin(texture: THREE.Texture): void {
    this.baseMaterial.map = texture;
    this.overlayMaterial.map = texture;
    this.baseMaterial.needsUpdate = true;
    this.overlayMaterial.needsUpdate = true;
  }

  dispose(): void {
    for (const geo of this.geometries) geo.dispose();
    this.baseMaterial.dispose();
    this.overlayMaterial.dispose();
  }
}
