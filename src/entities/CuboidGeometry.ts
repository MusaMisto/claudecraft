import * as THREE from 'three';

export interface PixelRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface CuboidUv {
  east: PixelRect;
  west: PixelRect;
  up: PixelRect;
  down: PixelRect;
  north: PixelRect;
  south: PixelRect;
}

const FULL: PixelRect = { u0: 0, v0: 0, u1: 1, v1: 1 };

/**
 * Build a six-face cuboid centered at the origin. UV rectangles use a top-left
 * texture origin to match the project's `flipY = false` canvas textures.
 */
export function createCuboidGeometry(
  width: number,
  height: number,
  depth: number,
  uv?: CuboidUv,
): THREE.BufferGeometry {
  const hx = width * 0.5;
  const hy = height * 0.5;
  const hz = depth * 0.5;
  const faces = [
    { key: 'east', normal: [1, 0, 0], corners: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
    { key: 'west', normal: [-1, 0, 0], corners: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
    { key: 'up', normal: [0, 1, 0], corners: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
    { key: 'down', normal: [0, -1, 0], corners: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
    { key: 'south', normal: [0, 0, 1], corners: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
    { key: 'north', normal: [0, 0, -1], corners: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
  ] as const;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const face of faces) {
    const base = positions.length / 3;
    const rect = uv?.[face.key] ?? FULL;
    for (const corner of face.corners) {
      positions.push(...corner);
      normals.push(...face.normal);
    }
    uvs.push(
      rect.u0, rect.v1,
      rect.u1, rect.v1,
      rect.u1, rect.v0,
      rect.u0, rect.v0,
    );
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * General unfolded-box UV layout. `boxWidth/Height/Depth` and offsets are in
 * reference texture pixels, independent of the cuboid's world-space size.
 */
export function unfoldedCuboidUv(
  offsetU: number,
  offsetV: number,
  boxWidth: number,
  boxHeight: number,
  boxDepth: number,
  textureWidth: number,
  textureHeight: number,
): CuboidUv {
  const rect = (x: number, y: number, w: number, h: number): PixelRect => ({
    u0: x / textureWidth,
    v0: y / textureHeight,
    u1: (x + w) / textureWidth,
    v1: (y + h) / textureHeight,
  });
  const sideY = offsetV + boxDepth;
  return {
    up: rect(offsetU + boxDepth, offsetV, boxWidth, boxDepth),
    down: rect(offsetU + boxDepth + boxWidth, offsetV, boxWidth, boxDepth),
    east: rect(offsetU, sideY, boxDepth, boxHeight),
    north: rect(offsetU + boxDepth, sideY, boxWidth, boxHeight),
    west: rect(offsetU + boxDepth + boxWidth, sideY, boxDepth, boxHeight),
    south: rect(offsetU + boxDepth * 2 + boxWidth, sideY, boxWidth, boxHeight),
  };
}
