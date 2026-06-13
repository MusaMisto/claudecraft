import * as THREE from 'three';
import type {
  AnimalKind,
  ClimateVariant,
  PassiveMobState,
  SheepWoolColor,
} from './AnimalTypes';
import { createCuboidGeometry } from './CuboidGeometry';

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

  create(
    kind: AnimalKind,
    variant: ClimateVariant,
    woolColor: SheepWoolColor = 'white',
  ): MobVisual {
    const parts = modelParts(kind);
    return new MobVisual(kind, parts, (part) => {
      const geoKey = `${part.name}:${part.size.join(',')}`;
      let geometry = this.geometries.get(geoKey);
      if (!geometry) {
        geometry = createCuboidGeometry(...part.size);
        this.geometries.set(geoKey, geometry);
      }
      const material = this.material(kind, variant, woolColor, part.material);
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
  ): THREE.MeshLambertMaterial {
    const key = `${kind}:${variant}:${woolColor}:${layer}`;
    let material = this.materials.get(key);
    if (material) return material;
    const base = new THREE.Color(BASE_COLORS[kind][variant]);
    if (layer === 'dark') base.multiplyScalar(0.62);
    if (layer === 'light') base.lerp(new THREE.Color(0xffffff), 0.35);
    if (layer === 'beak') base.setHex(0xe8ae3e);
    if (layer === 'accent') base.setHex(0xc94236);
    if (layer === 'wool') base.setHex(WOOL_COLORS[woolColor]);
    material = new THREE.MeshLambertMaterial({ color: base });
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
  if (kind === 'cow') return quadruped(0.9, 0.66, 1.4, 0.63, 0.22, [
    part('body', [0.9, 0.66, 1.4], [0, 0.91, 0]),
    part('head', [0.64, 0.66, 0.55], [0, 1.03, -0.94], 'base', 'head'),
    part('snout', [0.48, 0.24, 0.18], [0, 0.88, -1.3], 'light', 'head'),
    part('hornL', [0.12, 0.18, 0.12], [-0.28, 1.4, -0.98], 'light', 'head'),
    part('hornR', [0.12, 0.18, 0.12], [0.28, 1.4, -0.98], 'light', 'head'),
  ]);
  if (kind === 'pig') return quadruped(0.82, 0.5, 1.08, 0.42, 0.18, [
    part('body', [0.82, 0.5, 1.08], [0, 0.62, 0]),
    part('head', [0.68, 0.58, 0.55], [0, 0.7, -0.76], 'base', 'head'),
    part('snout', [0.42, 0.24, 0.16], [0, 0.62, -1.1], 'light', 'head'),
  ]);
  if (kind === 'sheep') return quadruped(0.82, 0.58, 1.16, 0.5, 0.18, [
    part('body', [0.84, 0.62, 1.18], [0, 0.76, 0], 'wool'),
    part('undercoat', [0.72, 0.5, 1.04], [0, 0.76, 0], 'base'),
    part('head', [0.56, 0.62, 0.48], [0, 0.78, -0.78], 'dark', 'head'),
  ]);
  return [
    part('body', [0.38, 0.38, 0.42], [0, 0.39, 0]),
    part('head', [0.3, 0.3, 0.3], [0, 0.63, -0.27], 'base', 'head'),
    part('beak', [0.22, 0.14, 0.16], [0, 0.62, -0.5], 'beak', 'head'),
    part('wattle', [0.1, 0.14, 0.08], [0, 0.5, -0.48], 'accent', 'head'),
    part('legL', [0.08, 0.28, 0.08], [-0.11, 0.28, 0], 'accent', 'legA'),
    part('legR', [0.08, 0.28, 0.08], [0.11, 0.28, 0], 'accent', 'legB'),
    part('wingL', [0.08, 0.28, 0.34], [-0.23, 0.4, 0], 'light', 'wingA'),
    part('wingR', [0.08, 0.28, 0.34], [0.23, 0.4, 0], 'light', 'wingB'),
  ];
}

function quadruped(
  width: number,
  _bodyHeight: number,
  length: number,
  legHeight: number,
  legWidth: number,
  bodyParts: PartSpec[],
): PartSpec[] {
  const x = width * 0.34;
  const z = length * 0.34;
  return [
    ...bodyParts,
    part('legFL', [legWidth, legHeight, legWidth], [-x, legHeight, -z], 'dark', 'legA'),
    part('legFR', [legWidth, legHeight, legWidth], [x, legHeight, -z], 'dark', 'legB'),
    part('legBL', [legWidth, legHeight, legWidth], [-x, legHeight, z], 'dark', 'legB'),
    part('legBR', [legWidth, legHeight, legWidth], [x, legHeight, z], 'dark', 'legA'),
  ];
}

function part(
  name: string,
  size: PartSpec['size'],
  position: PartSpec['position'],
  material: PartSpec['material'] = 'base',
  pivot?: PartSpec['pivot'],
): PartSpec {
  return { name, size, position, material, pivot };
}
