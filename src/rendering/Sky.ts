// Day/night sky: keyframed sky/fog color, sun + moon quads on a celestial
// axis, stars at night, keyframed directional + hemisphere lighting, the
// sun's always-on vanilla shadow map, and a Vibrant-only additive sun halo.
// 24,000 ticks = one full cycle (20 minutes at 20 TPS).
import * as THREE from 'three';
import { mulberry32, hashSeed } from '../core/Rng';
import {
  SHADOW_INTENSITY,
  DAY_AMBIENT_MIN,
  SUNSET_AMBIENT_MIN,
  NIGHT_AMBIENT_MIN,
  DAY_SKY_INTENSITY,
  SUNSET_SKY_INTENSITY,
  NIGHT_SKY_INTENSITY,
  DAY_SUN_INTENSITY,
  SUNSET_SUN_INTENSITY,
  NIGHT_SUN_INTENSITY,
  VIBRANT_SUN_GAIN,
  VIBRANT_AMBIENT_GAIN,
  HEMISPHERE_GROUND,
} from './LightingProfile';

export const DAY_LENGTH = 24000;

// Shadow frustum half-extent around the player and map resolution. The
// camera is snapped to shadow-texel increments so edges don't shimmer, and
// the light angle advances in discrete steps (~0.15°) for the same reason.
const SHADOW_RADIUS = 90;
const SHADOW_MAP_SIZE = 2048;
const SHADOW_ANGLE_STEPS = 2400;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Keyframe {
  t: number; // tick of day
  sky: THREE.Color;
  cloud: THREE.Color;
}

const kf = (t: number, sky: number, cloud: number): Keyframe => ({
  t,
  sky: new THREE.Color(sky),
  cloud: new THREE.Color(cloud),
});

// Day 0–12000 → sunset 12000–13800 → night 13800–22200 → sunrise 22200–24000.
// These keyframes drive only COLOR (sky/fog/cloud). Light intensities are
// derived from the sun's elevation against the LightingProfile constants, so a
// readability floor is guaranteed and transitions never pop.
const KEYFRAMES: Keyframe[] = [
  kf(0, 0x88b4ff, 0xffffff),
  kf(11200, 0x88b4ff, 0xffffff),
  kf(12600, 0xea9a63, 0xffd2ac), // sunset orange
  kf(13200, 0x6a4a6e, 0xab95ad), // dusk purple
  kf(13800, 0x10162e, 0x434a5e), // night (dark but playable)
  kf(22200, 0x10162e, 0x434a5e),
  kf(22800, 0x9a5d7e, 0xc6a6b4), // sunrise pink
  kf(23400, 0xf0a878, 0xffdcbb),
  kf(24000, 0x88b4ff, 0xffffff),
];

/** Additive radial glow billboarded around the sun (mie-haze stand-in). */
function makeHaloTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
  g.addColorStop(0, 'rgba(255, 240, 200, 0.85)');
  g.addColorStop(0.35, 'rgba(255, 220, 160, 0.30)');
  g.addColorStop(1, 'rgba(255, 200, 130, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

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
  /** Clear color after camera-medium effects such as underwater fog. */
  readonly viewColor = new THREE.Color();
  readonly cloudColor = new THREE.Color(0xffffff);
  private sun: THREE.Mesh;
  private moon: THREE.Mesh;
  private halo: THREE.Sprite;
  private haloMat: THREE.SpriteMaterial;
  private stars: THREE.Points;
  private starsMat: THREE.PointsMaterial;
  private sunLight: THREE.DirectionalLight;
  private ambient: THREE.HemisphereLight;
  /** Uniform, normal-independent readability floor (never lets faces go black). */
  private ambientFloor: THREE.AmbientLight;
  private fog: THREE.Fog;
  private celestial = new THREE.Group();
  private vibrant = true;
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

    // Additive halo sprite behind the sun quad (drawn first via renderOrder).
    this.haloMat = new THREE.SpriteMaterial({
      map: makeHaloTexture(),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.halo = new THREE.Sprite(this.haloMat);
    this.halo.scale.setScalar(220);
    this.halo.renderOrder = -1;
    this.disposables.push(this.haloMat.map!, this.haloMat);

    this.celestial.add(this.halo, this.sun, this.moon, this.stars);
    scene.add(this.celestial);

    this.sunLight = new THREE.DirectionalLight(0xffffff, DAY_SUN_INTENSITY);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    // Soft, non-binary shadows: a shadowed fragment keeps (1 − intensity) of
    // the sun, so cast shadows add depth without becoming black walls.
    this.sunLight.shadow.intensity = SHADOW_INTENSITY;
    const cam = this.sunLight.shadow.camera;
    cam.left = -SHADOW_RADIUS;
    cam.right = SHADOW_RADIUS;
    cam.top = SHADOW_RADIUS;
    cam.bottom = -SHADOW_RADIUS;
    cam.near = 1;
    cam.far = 420;
    this.sunLight.shadow.normalBias = 0.6; // suppress acne on unit cubes
    // Sky tint from above, earthy bounce from below (the directional ambient).
    this.ambient = new THREE.HemisphereLight(0xbcd4ff, HEMISPHERE_GROUND, DAY_SKY_INTENSITY);
    // Uniform floor so even fully sun-averted faces stay readable.
    this.ambientFloor = new THREE.AmbientLight(0xffffff, DAY_AMBIENT_MIN);
    scene.add(this.sunLight, this.sunLight.target, this.ambient, this.ambientFloor);

    this.fog = new THREE.Fog(0x79a6ff, renderDistanceBlocks * 0.55, renderDistanceBlocks * 0.98);
    scene.fog = this.fog;
  }

  setRenderDistance(blocks: number): void {
    this.fog.near = blocks * 0.55;
    this.fog.far = blocks * 0.98;
  }

  /** Apply or clear the current biome's underwater visibility profile. */
  setUnderwater(
    on: boolean,
    renderDistanceBlocks: number,
    fogColor = 0x050533,
    distanceScale = 1,
  ): void {
    if (on) {
      this.viewColor.setHex(fogColor);
      this.fog.color.setHex(fogColor);
      this.fog.near = 0.5;
      this.fog.far = Math.min(32, Math.max(20, renderDistanceBlocks * 0.14)) * distanceScale;
    } else {
      this.viewColor.copy(this.skyColor);
      this.fog.color.copy(this.skyColor);
      this.setRenderDistance(renderDistanceBlocks);
    }
  }

  /** Interpolate the color keyframes at a tick-of-day (may be fractional). */
  private sample(t: number, out: { sky: THREE.Color; cloud: THREE.Color }): void {
    const time = ((t % DAY_LENGTH) + DAY_LENGTH) % DAY_LENGTH;
    for (let i = 0; i < KEYFRAMES.length - 1; i++) {
      const a = KEYFRAMES[i];
      const b = KEYFRAMES[i + 1];
      if (time >= a.t && time <= b.t) {
        const f = b.t === a.t ? 0 : (time - a.t) / (b.t - a.t);
        out.sky.lerpColors(a.sky, b.sky, f);
        out.cloud.lerpColors(a.cloud, b.cloud, f);
        return;
      }
    }
  }

  private sampled = { sky: new THREE.Color(), cloud: new THREE.Color() };
  private sunDir = new THREE.Vector3();
  private lightDir = new THREE.Vector3();
  private lightRight = new THREE.Vector3();
  private lightUp = new THREE.Vector3();
  private snapped = new THREE.Vector3();

  /** Vibrant Visuals toggle: halo + enhanced lighting balance. */
  setVibrant(on: boolean): void {
    this.vibrant = on;
    this.halo.visible = on;
  }

  /** Update sky visuals for the given world time, centered on the player. */
  update(worldTime: number, center: THREE.Vector3): void {
    this.sample(worldTime, this.sampled);
    this.skyColor.copy(this.sampled.sky);
    this.viewColor.copy(this.sampled.sky);
    this.cloudColor.copy(this.sampled.cloud);
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

    // Halo hugs the sun; stronger and warmer when the sun is low.
    this.halo.position.copy(this.sunDir).multiplyScalar(400);
    const lowSun = THREE.MathUtils.clamp(1 - this.sunDir.y * 2.2, 0, 1);
    this.haloMat.opacity = this.sun.visible ? 0.45 + lowSun * 0.45 : 0;
    this.haloMat.color.setHSL(0.09, lowSun * 0.9, 1 - lowSun * 0.35);

    // Stars rotate with the celestial sphere and fade in at night.
    this.stars.rotation.z = theta;
    const nightness = THREE.MathUtils.clamp(-this.sunDir.y * 4 + 0.5, 0, 1);
    this.starsMat.opacity = nightness;

    // Directional light follows the sun by day, the moon by night, with the
    // angle quantized so shadow edges crawl in discrete steps, not shimmer.
    const sunUp = this.sunDir.y > 0;
    const qStep = (Math.PI * 2) / SHADOW_ANGLE_STEPS;
    const thetaQ = Math.round(theta / qStep) * qStep;
    this.lightDir.set(-Math.sin(thetaQ), Math.cos(thetaQ), 0);
    if (!sunUp) this.lightDir.negate();

    // Snap the shadow frustum center to texel increments in light space.
    const texel = (SHADOW_RADIUS * 2) / SHADOW_MAP_SIZE;
    this.lightRight.set(0, 0, 1); // light always lies in the XY plane
    this.lightUp.crossVectors(this.lightDir, this.lightRight).normalize();
    const cr = center.dot(this.lightRight);
    const cu = center.dot(this.lightUp);
    this.snapped
      .copy(center)
      .addScaledVector(this.lightRight, Math.round(cr / texel) * texel - cr)
      .addScaledVector(this.lightUp, Math.round(cu / texel) * texel - cu);

    this.sunLight.position.copy(this.snapped).addScaledVector(this.lightDir, 200);
    this.sunLight.target.position.copy(this.snapped);

    // Derive intensities from the sun's elevation against the LightingProfile.
    // `dayness` ramps in as the sun clears the horizon; `sunset` peaks while it
    // sits near the horizon. This keeps a guaranteed daytime readability floor
    // and makes day↔night transitions smooth (no popping).
    const elev = this.sunDir.y;
    const dayness = clamp01((elev + 0.06) / 0.3);
    const sunset = clamp01(1 - Math.abs(elev) / 0.28);
    const sunGain = this.vibrant ? VIBRANT_SUN_GAIN : 1;
    const ambGain = this.vibrant ? VIBRANT_AMBIENT_GAIN : 1;

    // Three-way blend: night → sunset → day, picked by dayness/sunset.
    const blend = (night: number, dusk: number, day: number) =>
      lerp(lerp(night, dusk, sunset), day, dayness);
    let sun = blend(NIGHT_SUN_INTENSITY, SUNSET_SUN_INTENSITY, DAY_SUN_INTENSITY);
    const sky = blend(NIGHT_SKY_INTENSITY, SUNSET_SKY_INTENSITY, DAY_SKY_INTENSITY);
    const floor = blend(NIGHT_AMBIENT_MIN, SUNSET_AMBIENT_MIN, DAY_AMBIENT_MIN);
    if (!sunUp) sun *= 0.35; // moonlight is dim but still casts faint shadows

    this.sunLight.intensity = sun * sunGain;
    // Warm the sun near the horizon (sunrise/sunset), cool moonlight at night.
    this.sunLight.color.setHex(sunUp ? (sunset > 0.4 ? 0xffd0a0 : 0xffffff) : 0x8a97c0);
    this.ambient.intensity = sky * ambGain;
    this.ambientFloor.intensity = floor * ambGain;
    // Hemisphere sky tint follows the sky color (kept bright enough to read).
    this.ambient.color.copy(this.sampled.sky).lerp(Sky.WHITE, 0.5);
  }

  private static readonly WHITE = new THREE.Color(0xffffff);

  dispose(): void {
    this.scene.remove(this.celestial, this.sunLight, this.sunLight.target, this.ambient, this.ambientFloor);
    this.scene.fog = null;
    this.sunLight.dispose(); // releases the shadow map render target
    for (const d of this.disposables) d.dispose();
  }
}
