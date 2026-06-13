import * as THREE from 'three';
import type {
  AnimalKind,
  ClimateVariant,
  PassiveMobState,
  SheepWoolColor,
} from './AnimalTypes';
import type { AnimalTextureLayer } from './AnimalTextures';
import { AnimalTextureLibrary } from './AnimalTextures';
import { createCuboidGeometry, unfoldedCuboidUv } from './CuboidGeometry';

const BASE_COLORS: Record<AnimalKind, Record<ClimateVariant, number>> = {
  cow: { temperate: 0x76503a, warm: 0xa45f34, cold: 0x4f443e },
  pig: { temperate: 0xe79591, warm: 0xc98768, cold: 0xb87882 },
  sheep: { temperate: 0xe6dfcf, warm: 0xe6dfcf, cold: 0xe6dfcf },
  chicken: { temperate: 0xf2eee0, warm: 0xc99352, cold: 0xaab7c4 },
};

const WOOL_COLORS: Record<SheepWoolColor, number> = {
  white: 0xf1eee4,
  black: 0x292729,
  gray: 0x68656a,
  light_gray: 0xaaa7a2,
  brown: 0x72503a,
  pink: 0xe7a7b5,
};

interface PartSpec {
  name: string;
  size: [number, number, number];
  position: [number, number, number];
  material: 'base' | 'dark' | 'light' | 'wool' | 'beak' | 'accent';
  pivot?: 'head' | 'legA' | 'legB' | 'wingA' | 'wingB';
  texture?: AnimalTextureLayer;
  uv?: [number, number, number, number, number, number, number];
}

export class MobVisual {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly legs: THREE.Group[] = [];
  private readonly wings: THREE.Group[] = [];

  constructor(
    readonly kind: AnimalKind,
    parts: PartSpec[],
    makeMesh: (part: PartSpec) => THREE.Mesh,
  ) {
    this.root.add(this.body);
    this.body.add(this.head);
    const headPart = parts.find((part) => part.name === 'head');
    if (headPart) {
      this.head.position.set(
        headPart.position[0],
        headPart.position[1],
        headPart.position[2] + headPart.size[2] * 0.5,
      );
    }
    for (const part of parts) {
      const mesh = makeMesh(part);
      if (part.pivot === 'head') {
        mesh.position.set(
          part.position[0] - this.head.position.x,
          part.position[1] - this.head.position.y,
          part.position[2] - this.head.position.z,
        );
        this.head.add(mesh);
        continue;
      }
      if (part.pivot?.startsWith('leg')) {
        const pivot = new THREE.Group();
        pivot.position.set(part.position[0], part.position[1], part.position[2]);
        mesh.position.y = -part.size[1] * 0.5;
        pivot.add(mesh);
        this.root.add(pivot);
        this.legs.push(pivot);
        continue;
      }
      if (part.pivot?.startsWith('wing')) {
        const pivot = new THREE.Group();
        pivot.position.set(part.position[0], part.position[1], part.position[2]);
        pivot.add(mesh);
        this.body.add(pivot);
        this.wings.push(pivot);
        continue;
      }
      mesh.position.set(part.position[0], part.position[1], part.position[2]);
      this.body.add(mesh);
    }
  }

  animate(ageTicks: number, speed: number, headYaw: number, state: PassiveMobState): void {
    const walking = Math.min(1, speed / 0.07);
    const phase = ageTicks * (0.38 + walking * 0.2);
    const swing = Math.sin(phase) * 0.55 * walking;
    for (let i = 0; i < this.legs.length; i++) {
      this.legs[i].rotation.x = swing * (i % 2 === 0 ? 1 : -1);
    }
    this.head.rotation.y = THREE.MathUtils.clamp(headYaw, -0.7, 0.7);
    this.head.rotation.x = state === 'looking' ? Math.sin(ageTicks * 0.08) * 0.08 : 0;
    this.body.position.y = Math.abs(Math.sin(phase)) * 0.025 * walking;

    const flutter = this.kind === 'chicken' &&
      (walking > 0.25 || (state === 'looking' && ageTicks % 100 < 18));
    for (let i = 0; i < this.wings.length; i++) {
      this.wings[i].rotation.z = flutter
        ? Math.sin(ageTicks * 0.9) * 0.7 * (i === 0 ? 1 : -1)
        : 0;
    }
  }
}

export class MobRenderer {
  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private readonly materials = new Map<string, THREE.MeshLambertMaterial>();

  constructor(private readonly textures: AnimalTextureLibrary) {}

  create(
    kind: AnimalKind,
    variant: ClimateVariant,
    woolColor: SheepWoolColor = 'white',
  ): MobVisual {
    const parts = modelParts(kind);
    return new MobVisual(kind, parts, (part) => {
      const geoKey = `${kind}:${part.name}:${part.size.join(',')}:${part.uv?.join(',') ?? 'full'}`;
      let geometry = this.geometries.get(geoKey);
      if (!geometry) {
        const uv = part.uv
          ? unfoldedCuboidUv(...part.uv)
          : undefined;
        geometry = createCuboidGeometry(...part.size, uv);
        this.geometries.set(geoKey, geometry);
      }
      const material = this.material(
        kind,
        variant,
        woolColor,
        part.material,
        part.texture,
      );
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    });
  }

  private material(
    kind: AnimalKind,
    variant: ClimateVariant,
    woolColor: SheepWoolColor,
    layer: PartSpec['material'],
    textureLayer?: AnimalTextureLayer,
  ): THREE.MeshLambertMaterial {
    const textured = textureLayer !== undefined;
    const key = `${kind}:${variant}:${woolColor}:${layer}:${textureLayer ?? 'none'}`;
    let material = this.materials.get(key);
    if (material) return material;
    const base = new THREE.Color(textured ? 0xffffff : BASE_COLORS[kind][variant]);
    if (!textured && layer === 'dark') base.multiplyScalar(0.62);
    if (!textured && layer === 'light') base.lerp(new THREE.Color(0xffffff), 0.35);
    if (layer === 'beak') base.setHex(0xe8ae3e);
    if (layer === 'accent') base.setHex(0xc94236);
    if (layer === 'wool') base.setHex(WOOL_COLORS[woolColor]);
    const map = textured
      ? this.textures.texture(kind, variant, textureLayer)
      : null;
    material = new THREE.MeshLambertMaterial({
      color: base,
      map,
      alphaTest: map ? 0.08 : 0,
    });
    this.materials.set(key, material);
    return material;
  }

  dispose(): void {
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.geometries.clear();
    this.materials.clear();
  }
}

function modelParts(kind: AnimalKind): PartSpec[] {
  if (kind === 'cow') return quadruped(0.9, 1.4, 0.63, 0.22, [0, 16, 4, 12, 4, 64, 64], [
    part('body', [0.9, 0.66, 1.4], [0, 0.91, 0], 'base', undefined, 'base', [18, 4, 12, 18, 10, 64, 64]),
    part('head', [0.64, 0.66, 0.55], [0, 1.03, -0.94], 'base', 'head', 'base', [0, 0, 8, 8, 6, 64, 64]),
    part('snout', [0.48, 0.24, 0.18], [0, 0.88, -1.3], 'base', 'head', 'base', [22, 0, 6, 3, 1, 64, 64]),
    part('hornL', [0.12, 0.18, 0.12], [-0.28, 1.4, -0.98], 'light', 'head'),
    part('hornR', [0.12, 0.18, 0.12], [0.28, 1.4, -0.98], 'light', 'head'),
  ]);
  if (kind === 'pig') return quadruped(0.82, 1.08, 0.42, 0.18, [0, 16, 4, 6, 4, 64, 64], [
    part('body', [0.82, 0.5, 1.08], [0, 0.62, 0], 'base', undefined, 'base', [28, 8, 10, 16, 8, 64, 64]),
    part('head', [0.68, 0.58, 0.55], [0, 0.7, -0.76], 'base', 'head', 'base', [0, 0, 8, 8, 8, 64, 64]),
    part('snout', [0.42, 0.24, 0.16], [0, 0.62, -1.1], 'base', 'head', 'base', [16, 16, 4, 3, 1, 64, 64]),
  ]);
  if (kind === 'sheep') return quadruped(0.82, 1.16, 0.5, 0.18, [0, 16, 4, 6, 4, 64, 32], [
    part('body', [0.84, 0.62, 1.18], [0, 0.76, 0], 'wool', undefined, 'wool', [28, 8, 8, 16, 6, 64, 32]),
    part('undercoat', [0.72, 0.5, 1.04], [0, 0.76, 0], 'base', undefined, 'base', [28, 8, 8, 16, 6, 64, 32]),
    part('head', [0.56, 0.62, 0.48], [0, 0.78, -0.78], 'base', 'head', 'base', [0, 0, 6, 6, 8, 64, 32]),
  ]);
  return [
    part('body', [0.38, 0.38, 0.42], [0, 0.39, 0], 'base', undefined, 'base', [0, 9, 6, 8, 6, 64, 32]),
    part('head', [0.3, 0.3, 0.3], [0, 0.63, -0.27], 'base', 'head', 'base', [0, 0, 4, 6, 3, 64, 32]),
    part('beak', [0.22, 0.14, 0.16], [0, 0.62, -0.5], 'base', 'head', 'base', [14, 0, 4, 2, 2, 64, 32]),
    part('wattle', [0.1, 0.14, 0.08], [0, 0.5, -0.48], 'base', 'head', 'base', [14, 4, 2, 2, 2, 64, 32]),
    part('legL', [0.08, 0.28, 0.08], [-0.11, 0.28, 0], 'base', 'legA', 'base', [26, 0, 2, 5, 2, 64, 32]),
    part('legR', [0.08, 0.28, 0.08], [0.11, 0.28, 0], 'base', 'legB', 'base', [26, 0, 2, 5, 2, 64, 32]),
    part('wingL', [0.08, 0.28, 0.34], [-0.23, 0.4, 0], 'base', 'wingA', 'base', [24, 13, 1, 4, 6, 64, 32]),
    part('wingR', [0.08, 0.28, 0.34], [0.23, 0.4, 0], 'base', 'wingB', 'base', [24, 13, 1, 4, 6, 64, 32]),
  ];
}

function quadruped(
  width: number,
  length: number,
  legHeight: number,
  legWidth: number,
  legUv: NonNullable<PartSpec['uv']>,
  bodyParts: PartSpec[],
): PartSpec[] {
  const x = width * 0.34;
  const z = length * 0.34;
  return [
    ...bodyParts,
    part('legFL', [legWidth, legHeight, legWidth], [-x, legHeight, -z], 'base', 'legA', 'base', legUv),
    part('legFR', [legWidth, legHeight, legWidth], [x, legHeight, -z], 'base', 'legB', 'base', legUv),
    part('legBL', [legWidth, legHeight, legWidth], [-x, legHeight, z], 'base', 'legB', 'base', legUv),
    part('legBR', [legWidth, legHeight, legWidth], [x, legHeight, z], 'base', 'legA', 'base', legUv),
  ];
}

function part(
  name: string,
  size: PartSpec['size'],
  position: PartSpec['position'],
  material: PartSpec['material'] = 'base',
  pivot?: PartSpec['pivot'],
  texture?: AnimalTextureLayer,
  uv?: PartSpec['uv'],
): PartSpec {
  return { name, size, position, material, pivot, texture, uv };
}
