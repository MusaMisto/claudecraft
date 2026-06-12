// Day/night sky: keyframed sky/fog color, sun + moon quads on a celestial
// axis, stars at night, and keyframed directional + ambient lighting.
// 24,000 ticks = one full cycle (20 minutes at 20 TPS).
import * as THREE from 'three';
import { mulberry32, hashSeed } from '../core/Rng';

export const DAY_LENGTH = 24000;

interface Keyframe {
  t: number; // tick of day
  sky: THREE.Color;
  sunlight: number; // directional intensity
  ambient: number;
}

const kf = (t: number, sky: number, sunlight: number, ambient: number): Keyframe => ({
  t,
  sky: new THREE.Color(sky),
  sunlight,
  ambient,
});

// Day 0–12000 → sunset 12000–13800 → night 13800–22200 → sunrise 22200–24000.
const KEYFRAMES: Keyframe[] = [
  kf(0, 0x79a6ff, 1.6, 1.1),
  kf(11200, 0x79a6ff, 1.6, 1.1),
  kf(12600, 0xe78a52, 1.0, 0.8), // sunset orange
  kf(13200, 0x5c3a5e, 0.45, 0.55), // dusk purple
  kf(13800, 0x0a0e20, 0.16, 0.34), // night
  kf(22200, 0x0a0e20, 0.16, 0.34),
  kf(22800, 0x86496b, 0.5, 0.6), // sunrise pink
  kf(23400, 0xeb9a60, 1.0, 0.85),
  kf(24000, 0x79a6ff, 1.6, 1.1),
];

function makeSunTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff3c2';
  ctx.fillRect(4, 4, 24, 24);
  ctx.fillStyle = '#ffe27a';
  ctx.fillRect(8, 8, 16, 16);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function makeMoonTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#d9deea';
  ctx.fillRect(6, 6, 20, 20);
  ctx.fillStyle = '#b3bacc';
  const rng = mulberry32(hashSeed('claudecraft-moon'));
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(7 + Math.floor(rng() * 17), 7 + Math.floor(rng() * 17), 3, 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

export class Sky {
  readonly skyColor = new THREE.Color();
  private sun: THREE.Mesh;
  private moon: THREE.Mesh;
  private stars: THREE.Points;
  private starsMat: THREE.PointsMaterial;
  private sunLight: THREE.DirectionalLight;
  private ambient: THREE.AmbientLight;
  private fog: THREE.Fog;
  private celestial = new THREE.Group();
  private disposables: Array<{ dispose(): void }> = [];

  constructor(
    private scene: THREE.Scene,
    renderDistanceBlocks: number,
  ) {
    const sunTex = makeSunTexture();
    const moonTex = makeMoonTexture();
    const sunMat = new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, fog: false, depthWrite: false });
    const moonMat = new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, fog: false, depthWrite: false });
    const sunGeo = new THREE.PlaneGeometry(60, 60);
    const moonGeo = new THREE.PlaneGeometry(44, 44);
    this.sun = new THREE.Mesh(sunGeo, sunMat);
    this.moon = new THREE.Mesh(moonGeo, moonMat);
    this.disposables.push(sunTex, moonTex, sunMat, moonMat, sunGeo, moonGeo);

    // Stars: random directions on the celestial sphere, rotated with the sun.
    const rng = mulberry32(hashSeed('claudecraft-stars'));
    const starPos: number[] = [];
    for (let i = 0; i < 700; i++) {
      const u = rng() * 2 - 1;
      const phi = rng() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      starPos.push(Math.cos(phi) * r * 460, u * 460, Math.sin(phi) * r * 460);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.starsMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    });
    this.stars = new THREE.Points(starGeo, this.starsMat);
    this.disposables.push(starGeo, this.starsMat);

    this.celestial.add(this.sun, this.moon, this.stars);
    scene.add(this.celestial);

    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(this.sunLight, this.sunLight.target, this.ambient);

    this.fog = new THREE.Fog(0x79a6ff, renderDistanceBlocks * 0.55, renderDistanceBlocks * 0.98);
    scene.fog = this.fog;
  }

  setRenderDistance(blocks: number): void {
    this.fog.near = blocks * 0.55;
    this.fog.far = blocks * 0.98;
  }

  /** Interpolate keyframes at a tick-of-day (may be fractional). */
  private sample(t: number, out: { sky: THREE.Color; sunlight: number; ambient: number }): void {
    const time = ((t % DAY_LENGTH) + DAY_LENGTH) % DAY_LENGTH;
    for (let i = 0; i < KEYFRAMES.length - 1; i++) {
      const a = KEYFRAMES[i];
      const b = KEYFRAMES[i + 1];
      if (time >= a.t && time <= b.t) {
        const f = b.t === a.t ? 0 : (time - a.t) / (b.t - a.t);
        out.sky.lerpColors(a.sky, b.sky, f);
        out.sunlight = a.sunlight + (b.sunlight - a.sunlight) * f;
        out.ambient = a.ambient + (b.ambient - a.ambient) * f;
        return;
      }
    }
  }

  private sampled = { sky: new THREE.Color(), sunlight: 1, ambient: 0.8 };
  private sunDir = new THREE.Vector3();

  /** Update sky visuals for the given world time, centered on the player. */
  update(worldTime: number, center: THREE.Vector3): void {
    this.sample(worldTime, this.sampled);
    this.skyColor.copy(this.sampled.sky);
    this.fog.color.copy(this.sampled.sky);

    // Sun angle: noon (tick 6000) at zenith; sun rises +X, sets -X.
    const theta = ((worldTime % DAY_LENGTH) - 6000) / DAY_LENGTH * Math.PI * 2;
    this.sunDir.set(-Math.sin(theta), Math.cos(theta), 0);

    this.celestial.position.copy(center);
    this.sun.position.copy(this.sunDir).multiplyScalar(420);
    this.moon.position.copy(this.sunDir).multiplyScalar(-420);
    this.sun.lookAt(center);
    this.moon.lookAt(center);
    this.sun.visible = this.sunDir.y > -0.12;
    this.moon.visible = this.sunDir.y < 0.12;

    // Stars rotate with the celestial sphere and fade in at night.
    this.stars.rotation.z = theta;
    const nightness = THREE.MathUtils.clamp(-this.sunDir.y * 4 + 0.5, 0, 1);
    this.starsMat.opacity = nightness;

    // Directional light follows the sun by day, the moon by night.
    const sunUp = this.sunDir.y > 0;
    const lightDir = sunUp ? this.sunDir : this.sunDir.clone().negate();
    this.sunLight.position.copy(center).addScaledVector(lightDir, 200);
    this.sunLight.target.position.copy(center);
    this.sunLight.intensity = this.sampled.sunlight;
    this.sunLight.color.setHex(sunUp ? 0xffffff : 0x8a97c0);
    this.ambient.intensity = this.sampled.ambient;
  }

  dispose(): void {
    this.scene.remove(this.celestial, this.sunLight, this.sunLight.target, this.ambient);
    this.scene.fog = null;
    for (const d of this.disposables) d.dispose();
  }
}
