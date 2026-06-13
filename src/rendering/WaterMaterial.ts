// Vibrant Visuals water (PLAN.md §9.4): deep-blue Blinn-Phong surface with a
// code-generated tiling wave normal map scrolled over time (the chunk mesher
// emits world-space UVs for it), a strong specular sun glint, and a fresnel
// mix toward the live sky color standing in for screen-space reflections.
import * as THREE from 'three';
import { createNoise4D } from 'simplex-noise';
import { mulberry32, hashSeed } from '../core/Rng';

const NORMAL_MAP_SIZE = 64;
// Slow diagonal drift plus a sinusoidal cross-current wobble, so the waves
// never read as a uniform conveyor belt.
const DRIFT = new THREE.Vector2(0.011, 0.008);
const WOBBLE = 0.012;

/**
 * Tileable wave height field sampled on a torus (4D noise), converted to a
 * tangent-space normal map by wrapped finite differences. All in code — the
 * originality rule applies to this texture like any other.
 */
function buildWaveNormalMap(): THREE.DataTexture {
  const n = NORMAL_MAP_SIZE;
  const noise = createNoise4D(mulberry32(hashSeed('claudecraft-waves')));
  const height = new Float32Array(n * n);
  const r1 = 1.1;
  const r2 = 0.7;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const a = (x / n) * Math.PI * 2;
      const b = (y / n) * Math.PI * 2;
      const nx = Math.cos(a) * r1;
      const ny = Math.sin(a) * r1;
      const nz = Math.cos(b) * r2;
      const nw = Math.sin(b) * r2;
      // Two octaves of torus-sampled noise → tileable ripples.
      height[y * n + x] = noise(nx, ny, nz, nw) + 0.5 * noise(nx * 2, ny * 2, nz * 2, nw * 2);
    }
  }
  const data = new Uint8Array(n * n * 4);
  const strength = 1.6;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const hl = height[y * n + ((x + n - 1) % n)];
      const hr = height[y * n + ((x + 1) % n)];
      const hd = height[((y + n - 1) % n) * n + x];
      const hu = height[((y + 1) % n) * n + x];
      const v = new THREE.Vector3((hl - hr) * strength, (hd - hu) * strength, 1).normalize();
      const i = (y * n + x) * 4;
      data[i] = ((v.x * 0.5 + 0.5) * 255) | 0;
      data[i + 1] = ((v.y * 0.5 + 0.5) * 255) | 0;
      data[i + 2] = ((v.z * 0.5 + 0.5) * 255) | 0;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export class WaterMaterial extends THREE.MeshPhongMaterial {
  /** Updated every frame from the sky so reflections track the cycle. */
  readonly skyColor = new THREE.Color(0x79a6ff);
  private normalMapTex: THREE.DataTexture;
  private time = 0;

  constructor() {
    const normalMap = buildWaveNormalMap();
    super({
      color: 0xffffff, // biome water RGB arrives through vertex colors
      specular: 0x668899, // dim enough that noon seas don't turn to glitter
      shininess: 180, // tight Blinn-Phong lobe → sun glint
      normalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      transparent: true,
      opacity: 0.78,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    this.normalMapTex = normalMap;

    this.onBeforeCompile = (shader) => {
      shader.uniforms.uSkyColor = { value: this.skyColor };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform vec3 uSkyColor;',
        )
        .replace(
          '#include <opaque_fragment>',
          // Fresnel: grazing angles reflect the sky (color + opacity rise),
          // head-on stays deep transmission blue — the SSR/IBL stand-in.
          'float fres = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 3.0);\n' +
            'outgoingLight = mix(outgoingLight, uSkyColor, fres * 0.85);\n' +
            'diffuseColor.a = mix(diffuseColor.a, 0.95, fres);\n' +
            '#include <opaque_fragment>',
        );
    };
  }

  /** Scroll the wave normal map (call once per frame with elapsed seconds). */
  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    this.normalMapTex.offset.set(
      t * DRIFT.x + Math.sin(t * 0.23) * WOBBLE,
      t * DRIFT.y + Math.cos(t * 0.19) * WOBBLE,
    );
  }

  /** Current scroll offset (exposed for the headless animation check). */
  get waveOffset(): THREE.Vector2 {
    return this.normalMapTex.offset;
  }

  dispose(): void {
    this.normalMapTex.dispose();
    super.dispose();
  }
}
