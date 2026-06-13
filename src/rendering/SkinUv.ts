// 64×64 Minecraft-Java skin layout: per-part, per-face source rectangles plus a
// reusable cuboid geometry builder that maps each face to its skin region.
// Classic 4px-arm layout. The data is grouped per part so a slim (3px-arm)
// layout can be added later as a parallel table without touching the builder.
import * as THREE from 'three';

export interface SkinRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The six faces of a cuboid, named by the body-part orientation they cover. */
export interface FaceRects {
  top: SkinRect;
  bottom: SkinRect;
  right: SkinRect;
  front: SkinRect;
  left: SkinRect;
  back: SkinRect;
}

export interface PartRects {
  base: FaceRects;
  overlay: FaceRects;
}

const r = (x: number, y: number, w: number, h: number): SkinRect => ({ x, y, w, h });

// --- Classic 64×64 base + overlay rectangles (PLAN §11.2–11.3 / spec). ---
export const CLASSIC: Record<'head' | 'body' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg', PartRects> = {
  head: {
    base: { top: r(8, 0, 8, 8), bottom: r(16, 0, 8, 8), right: r(0, 8, 8, 8), front: r(8, 8, 8, 8), left: r(16, 8, 8, 8), back: r(24, 8, 8, 8) },
    overlay: { top: r(40, 0, 8, 8), bottom: r(48, 0, 8, 8), right: r(32, 8, 8, 8), front: r(40, 8, 8, 8), left: r(48, 8, 8, 8), back: r(56, 8, 8, 8) },
  },
  body: {
    base: { top: r(20, 16, 8, 4), bottom: r(28, 16, 8, 4), right: r(16, 20, 4, 12), front: r(20, 20, 8, 12), left: r(28, 20, 4, 12), back: r(32, 20, 8, 12) },
    overlay: { top: r(20, 32, 8, 4), bottom: r(28, 32, 8, 4), right: r(16, 36, 4, 12), front: r(20, 36, 8, 12), left: r(28, 36, 4, 12), back: r(32, 36, 8, 12) },
  },
  rightArm: {
    base: { top: r(44, 16, 4, 4), bottom: r(48, 16, 4, 4), right: r(40, 20, 4, 12), front: r(44, 20, 4, 12), left: r(48, 20, 4, 12), back: r(52, 20, 4, 12) },
    overlay: { top: r(44, 32, 4, 4), bottom: r(48, 32, 4, 4), right: r(40, 36, 4, 12), front: r(44, 36, 4, 12), left: r(48, 36, 4, 12), back: r(52, 36, 4, 12) },
  },
  leftArm: {
    base: { top: r(36, 48, 4, 4), bottom: r(40, 48, 4, 4), right: r(32, 52, 4, 12), front: r(36, 52, 4, 12), left: r(40, 52, 4, 12), back: r(44, 52, 4, 12) },
    overlay: { top: r(52, 48, 4, 4), bottom: r(56, 48, 4, 4), right: r(48, 52, 4, 12), front: r(52, 52, 4, 12), left: r(56, 52, 4, 12), back: r(60, 52, 4, 12) },
  },
  rightLeg: {
    base: { top: r(4, 16, 4, 4), bottom: r(8, 16, 4, 4), right: r(0, 20, 4, 12), front: r(4, 20, 4, 12), left: r(8, 20, 4, 12), back: r(12, 20, 4, 12) },
    overlay: { top: r(4, 32, 4, 4), bottom: r(8, 32, 4, 4), right: r(0, 36, 4, 12), front: r(4, 36, 4, 12), left: r(8, 36, 4, 12), back: r(12, 36, 4, 12) },
  },
  leftLeg: {
    base: { top: r(20, 48, 4, 4), bottom: r(24, 48, 4, 4), right: r(16, 52, 4, 12), front: r(20, 52, 4, 12), left: r(24, 52, 4, 12), back: r(28, 52, 4, 12) },
    overlay: { top: r(4, 48, 4, 4), bottom: r(8, 48, 4, 4), right: r(0, 52, 4, 12), front: r(4, 52, 4, 12), left: r(8, 52, 4, 12), back: r(12, 52, 4, 12) },
  },
};

// Tiny inset (texture pixels) so nearest sampling never lands on a region edge
// and bleeds into a neighbouring part. Small enough to preserve every skin texel.
const INSET = 0.01;

/** front=+Z up=+Y right(model)=−X. Corner order per face: TL, TR, BR, BL in
 *  texture space (u0v0, u1v0, u1v1, u0v1), each paired with a 3D position. */
type Corner = [number, number, number];
function faceCorners(face: keyof FaceRects, hx: number, hy: number, hz: number): [Corner, Corner, Corner, Corner] {
  switch (face) {
    case 'front': // +Z
      return [[-hx, hy, hz], [hx, hy, hz], [hx, -hy, hz], [-hx, -hy, hz]];
    case 'back': // −Z
      return [[hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, -hz], [hx, -hy, -hz]];
    case 'right': // −X (the model's right side)
      return [[-hx, hy, -hz], [-hx, hy, hz], [-hx, -hy, hz], [-hx, -hy, -hz]];
    case 'left': // +X
      return [[hx, hy, hz], [hx, hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]];
    case 'top': // +Y
      return [[-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz]];
    case 'bottom': // −Y
      return [[-hx, -hy, hz], [hx, -hy, hz], [hx, -hy, -hz], [-hx, -hy, -hz]];
  }
}

const FACE_ORDER: Array<keyof FaceRects> = ['front', 'back', 'right', 'left', 'top', 'bottom'];

/**
 * Build a centred cuboid (dimensions in skin pixels) whose six faces sample the
 * given skin rectangles. Returns geometry with position + uv; share one skin
 * material across all parts. `size` is the skin texture size (64).
 */
export function buildSkinBox(w: number, h: number, d: number, faces: FaceRects, size = 64): THREE.BufferGeometry {
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const face of FACE_ORDER) {
    const rect = faces[face];
    const u0 = (rect.x + INSET) / size;
    const u1 = (rect.x + rect.w - INSET) / size;
    const v0 = (rect.y + INSET) / size;
    const v1 = (rect.y + rect.h - INSET) / size;
    const uvc = [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ];
    const corners = faceCorners(face, hx, hy, hz);
    const base = pos.length / 3;
    corners.forEach((c, i) => {
      pos.push(c[0], c[1], c[2]);
      uv.push(uvc[i][0], uvc[i][1]);
    });
    // Counter-clockwise as seen from outside the box, so face normals point
    // outward — required for correct lighting and FrontSide back-face culling
    // (the reverse winding renders the model inside-out / see-through).
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
