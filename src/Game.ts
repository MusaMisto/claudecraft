// One running world session: scene, player, HUD, sky, clouds, audio hooks.
// Created by main.ts when Singleplayer starts; disposed on Quit to Title.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GameLoop } from './core/GameLoop';
import { Input } from './core/Input';
import { TextureAtlas } from './rendering/TextureAtlas';
import { ChunkRenderer } from './rendering/ChunkRenderer';
import { Sky, DAY_LENGTH } from './rendering/Sky';
import { Clouds } from './rendering/Clouds';
import { BlockParticles } from './rendering/Particles';
import { HeldBlock } from './rendering/HeldBlock';
import { UnderwaterOverlay } from './rendering/UnderwaterOverlay';
import { VIBRANT_TONE_MAPPING, VIBRANT_EXPOSURE } from './rendering/LightingProfile';
import { World } from './world/World';
import { TerrainGenerator } from './world/TerrainGenerator';
import { BlockId, blockDef } from './world/Block';
import { BIOMES, BiomeId, biomeDef } from './world/Biome';
import { Player } from './player/Player';
import { PlayerPhysics } from './player/PlayerPhysics';
import { PlayerController } from './player/PlayerController';
import { BlockInteraction } from './player/BlockInteraction';
import { Hud } from './ui/Hud';
import type { Settings } from './settings/Settings';
import type { AudioEngine } from './audio/AudioEngine';
import type { Sfx } from './audio/Sfx';
import type { SkinManager } from './player/SkinManager';
import { WaterSfx } from './audio/WaterSfx';
import { EntityManager } from './entities/EntityManager';

// Water tile repaints every N ticks (20 TPS → ≈6.7 Hz): smooth but slow drift.
const WATER_FRAME_TICKS = 3;

export class Game {
  /** Fired when pointer lock is lost while playing (→ show pause menu). */
  onPauseRequested: (() => void) | null = null;
  readonly player = new Player();
  readonly world: World;
  worldTime = 1000; // early morning
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private generator: TerrainGenerator;
  private chunkRenderer: ChunkRenderer;
  private sky: Sky;
  private clouds: Clouds;
  private particles: BlockParticles;
  private heldBlock: HeldBlock;
  private underwaterOverlay = new UnderwaterOverlay();
  private entities: EntityManager;
  private atlas: TextureAtlas;
  private walkPhase = 0;
  private input: Input;
  private physics: PlayerPhysics;
  private controller: PlayerController;
  private interaction: BlockInteraction;
  private hud: Hud;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private outputPass: OutputPass;
  private loop: GameLoop;
  private debugEl: HTMLElement;
  private strideDistance = 0;
  private waterSfx: WaterSfx;
  private prevInWater = false;
  private swimDistance = 0;
  private spawnX = 0.5;
  private spawnY = 0;
  private spawnZ = 0.5;
  private currentFov: number;
  private lastFrameDt = 1 / 60;
  private interpolatedPos = new THREE.Vector3();
  private disposers: Array<() => void> = [];
  private disposed = false;

  constructor(
    private renderer: THREE.WebGLRenderer,
    container: HTMLElement,
    private settings: Settings,
    private audio: AudioEngine,
    private sfx: Sfx,
    atlas: TextureAtlas,
    skins: SkinManager,
    seed: string = `world-${Date.now()}`,
  ) {
    this.camera = new THREE.PerspectiveCamera(
      settings.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.camera.rotation.order = 'YXZ';
    this.currentFov = settings.fov;
    this.generator = new TerrainGenerator(seed);
    this.world = new World(this.generator);
    this.entities = new EntityManager(this.scene);
    this.chunkRenderer = new ChunkRenderer(this.world, atlas);
    this.scene.add(this.chunkRenderer.group);
    this.sky = new Sky(this.scene, settings.renderDistance * 16);
    this.clouds = new Clouds();
    this.scene.add(this.clouds.group);
    this.atlas = atlas;
    this.particles = new BlockParticles(atlas);
    this.scene.add(this.particles.group);
    this.heldBlock = new HeldBlock(atlas, skins);
    // Vibrant Visuals HDR pipeline (PLAN.md §9.3): render into a HalfFloat
    // MSAA ×4 target, bloom the highlights, then ACES tone map via OutputPass.
    const bufSize = renderer.getDrawingBufferSize(new THREE.Vector2());
    const hdrTarget = new THREE.WebGLRenderTarget(bufSize.x, bufSize.y, {
      samples: 4,
      type: THREE.HalfFloatType,
    });
    this.composer = new EffectComposer(renderer, hdrTarget);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(bufSize, 0.3, 0.4, 1.0);
    this.composer.addPass(this.bloomPass);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
    this.applyVisuals();

    this.input = new Input(renderer.domElement);
    this.waterSfx = new WaterSfx(audio);
    this.physics = new PlayerPhysics(this.world, this.player);
    this.controller = new PlayerController(this.input, this.player, settings);
    this.interaction = new BlockInteraction(this.world, this.player);
    this.scene.add(this.interaction.highlight);
    this.hud = new Hud(container, atlas);
    const spawn = this.generator.findSpawn();
    this.spawnX = spawn.x + 0.5;
    this.spawnZ = spawn.z + 0.5;
    this.spawnY = this.generator.height(spawn.x, spawn.z) + 1;
    this.world.ensureChunk(Math.floor(spawn.x / 16), Math.floor(spawn.z / 16));
    this.player.teleport(this.spawnX, this.spawnY, this.spawnZ);

    const lockOnClick = () => {
      if (!this.loop.paused) this.input.requestPointerLock();
    };
    renderer.domElement.addEventListener('click', lockOnClick);
    this.disposers.push(() => renderer.domElement.removeEventListener('click', lockOnClick));
    const onLockChange = () => {
      if (!this.input.pointerLocked && !this.loop.paused && !this.disposed) {
        this.onPauseRequested?.();
      }
    };
    document.addEventListener('pointerlockchange', onLockChange);
    this.disposers.push(() => document.removeEventListener('pointerlockchange', onLockChange));
    // Alt-tab / focus loss pauses gracefully.
    const onBlur = () => {
      if (!this.loop.paused && !this.disposed) this.onPauseRequested?.();
    };
    window.addEventListener('blur', onBlur);
    this.disposers.push(() => window.removeEventListener('blur', onBlur));

    this.disposers.push(
      this.input.onKeyDown((code) => {
        this.hud.handleKey(code);
        if (code === 'F3') this.toggleDebugOverlay();
      }),
      this.input.onMouseDown((button) => this.onMouseDown(button)),
    );

    this.debugEl = document.createElement('div');
    this.debugEl.id = 'debug-overlay';
    this.debugEl.style.display = 'none';
    container.appendChild(this.debugEl);

    this.loop = new GameLoop(
      () => this.tick(),
      (alpha, dt) => this.render(alpha, dt),
    );
  }

  get paused(): boolean {
    return this.loop.paused;
  }

  private debugVisible = false;
  private fpsFrames = 0;
  private fpsValue = 0;
  private fpsLastTime = performance.now();

  toggleDebugOverlay(): void {
    this.debugVisible = !this.debugVisible;
    this.debugEl.style.display = this.debugVisible ? '' : 'none';
  }

  pause(): void {
    this.loop.paused = true;
    this.input.exitPointerLock();
    this.waterSfx.setSubmerged(false);
  }

  resume(): void {
    this.loop.paused = false;
    this.loop.resetTiming();
    this.input.requestPointerLock();
  }

  frame(now: number): void {
    this.loop.frame(now);
    this.updateDebugReadout();
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
  }

  /**
   * Apply the Vibrant Visuals enhancement layer live. Vanilla AO, block
   * shadows, and drawing-buffer anti-aliasing stay active in both profiles.
   * Scene materials are recompiled because shadow and tone-mapping shader
   * chunks are baked into programs.
   */
  applyVisuals(): void {
    const vv = this.settings.vibrantVisuals;
    this.renderer.shadowMap.enabled = true;
    // Soft (PCF) shadows in both profiles — readable depth, not hard black edges.
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Vibrant uses a gentle filmic curve (Neutral preserves color and does not
    // crush darks like ACES); classic stays linear/flat.
    this.renderer.toneMapping = vv ? VIBRANT_TONE_MAPPING : THREE.NoToneMapping;
    this.renderer.toneMappingExposure = vv ? VIBRANT_EXPOSURE : 1.0;
    this.sky.setVibrant(vv);
    this.clouds.setVibrant(vv);
    this.heldBlock.refreshMaterials();
    this.scene.traverse((obj) => {
      const mat = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      for (const m of Array.isArray(mat) ? mat : [mat]) m.needsUpdate = true;
    });
  }

  private soundMaterialAt(x: number, y: number, z: number) {
    return blockDef(this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)))?.sound ?? 'none';
  }

  private onMouseDown(button: number): void {
    if (!this.input.pointerLocked) return;
    this.heldBlock.swing();
    if (button === 0) {
      const target = this.interaction.target;
      const broken = this.interaction.breakBlock();
      if (broken !== null && target) {
        this.sfx.blockBreak(blockDef(broken)?.sound ?? 'none');
        this.particles.spawn(target.x, target.y, target.z, this.atlas.uvRect(blockDef(broken)!.faces.side));
      }
    } else if (button === 2) {
      if (this.interaction.placeBlock(this.hud.selectedBlock)) {
        this.sfx.blockPlace(blockDef(this.hud.selectedBlock)?.sound ?? 'none');
      }
    }
  }

  private tick(): void {
    this.physics.tick(this.controller.intent());
    this.entities.tick();
    this.worldTime++;

    // Tick-paced water animation (≈6.7 Hz) — one small atlas re-upload, no
    // chunk remeshing. Continues while standing still; freezes only when paused.
    if (this.worldTime % WATER_FRAME_TICKS === 0) {
      this.atlas.animateWater(this.worldTime / WATER_FRAME_TICKS);
    }

    // Falling out of the world respawns at the spawn point.
    if (this.player.position.y < -16) {
      this.player.teleport(this.spawnX, this.spawnY, this.spawnZ);
      this.player.flying = false;
    }

    const p = this.player;
    if (p.onGround && !p.flying) {
      this.strideDistance += Math.hypot(
        p.position.x - p.prevPosition.x,
        p.position.z - p.prevPosition.z,
      );
      if (this.strideDistance >= 1.5) {
        this.strideDistance = 0;
        this.sfx.footstep(this.soundMaterialAt(p.position.x, p.position.y - 0.01, p.position.z));
      }
    } else {
      this.strideDistance = 0;
    }

    this.updateWaterAudio(p);
  }

  /** Edge-triggered splashes, distance-paced swim strokes, submerged ambience. */
  private updateWaterAudio(p: Player): void {
    const nowInWater = p.inWater;
    if (nowInWater && !this.prevInWater) {
      // Splash loudness scales with how fast the player descended this tick.
      const descent = Math.max(0, p.prevPosition.y - p.position.y);
      this.waterSfx.enter(Math.min(1, 0.4 + descent * 5));
      this.swimDistance = 0;
    } else if (!nowInWater && this.prevInWater) {
      this.waterSfx.exit();
    }

    if (nowInWater) {
      this.swimDistance += Math.hypot(
        p.position.x - p.prevPosition.x,
        p.position.y - p.prevPosition.y,
        p.position.z - p.prevPosition.z,
      );
      if (this.swimDistance >= 1.4) {
        this.swimDistance = 0;
        this.waterSfx.stroke();
      }
      const headInWater =
        this.world.getBlock(
          Math.floor(p.position.x),
          Math.floor(p.position.y + p.eyeHeight),
          Math.floor(p.position.z),
        ) === BlockId.Water;
      this.waterSfx.setSubmerged(headInWater);
    } else {
      this.waterSfx.setSubmerged(false);
    }
    this.prevInWater = nowInWater;
  }

  private render(alpha: number, frameDtMs: number): void {
    this.lastFrameDt = frameDtMs / 1000;
    if (!this.loop.paused) {
      this.controller.updateLook();
      this.hud.scroll(this.input.consumeWheel());
    }
    this.interaction.updateTarget();
    this.entities.render(alpha);

    const p = this.player;
    p.interpolated(alpha, this.interpolatedPos);
    this.camera.position.set(
      this.interpolatedPos.x,
      this.interpolatedPos.y + p.eyeHeight,
      this.interpolatedPos.z,
    );
    this.camera.rotation.set(p.pitch, p.yaw, 0);

    const targetFov = this.settings.fov * (p.sprinting ? 1.1 : 1);
    this.currentFov += (targetFov - this.currentFov) * 0.2;
    if (Math.abs(this.camera.fov - this.currentFov) > 0.01) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    const streamBudget = Math.max(2, Math.min(4, Math.ceil(this.settings.renderDistance / 4)));
    this.chunkRenderer.stream(p.position.x, p.position.z, this.settings.renderDistance, streamBudget);
    this.chunkRenderer.update(2);

    const renderDistanceBlocks = this.settings.renderDistance * 16;
    this.sky.setRenderDistance(renderDistanceBlocks);
    this.sky.update(this.worldTime + alpha, this.camera.position);
    const cameraUnderwater =
      this.world.getBlock(
        Math.floor(this.camera.position.x),
        Math.floor(this.camera.position.y),
        Math.floor(this.camera.position.z),
      ) === BlockId.Water;
    const cameraBiome = biomeDef(
      this.generator.biomeAt(Math.floor(this.camera.position.x), Math.floor(this.camera.position.z)),
    );
    this.sky.setUnderwater(cameraUnderwater, renderDistanceBlocks, cameraBiome.waterFogColor, cameraBiome.waterFogDistance);
    this.clouds.update(this.lastFrameDt, p.position.x, p.position.z, this.sky.cloudColor);
    if (!this.loop.paused) this.particles.update(this.lastFrameDt, this.camera);
    this.audio.applyVolumes();

    this.renderer.setClearColor(this.sky.viewColor);
    if (this.settings.vibrantVisuals) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // Held-block overlay pass (bobs while walking on the ground).
    if (!this.loop.paused) {
      if (p.onGround && !p.flying) this.walkPhase += p.horizontalSpeed * this.lastFrameDt * 1.8;
      this.heldBlock.setBlock(this.hud.selectedBlock);
      this.heldBlock.render(this.renderer, this.lastFrameDt, this.walkPhase);
    }
    this.underwaterOverlay.render(this.renderer, cameraUnderwater, cameraBiome.waterFogColor);
  }

  private updateDebugReadout(): void {
    this.fpsFrames++;
    const now = performance.now();
    if (now - this.fpsLastTime >= 500) {
      this.fpsValue = Math.round((this.fpsFrames * 1000) / (now - this.fpsLastTime));
      this.fpsFrames = 0;
      this.fpsLastTime = now;
    }
    if (!this.debugVisible) return;

    const p = this.player;
    // yaw 0 = −Z (north); compass quadrant from the wrapped angle.
    const deg = ((-p.yaw * 180) / Math.PI + 360 * 100) % 360;
    const facing = ['north', 'east', 'south', 'west'][Math.round(deg / 90) % 4];
    const t = Math.floor(this.worldTime % DAY_LENGTH);
    const bx = Math.floor(p.position.x);
    const bz = Math.floor(p.position.z);
    const biome = biomeDef(this.generator.biomeAt(bx, bz));
    const c = this.generator.climateAt(bx, bz);
    const colHeight = this.generator.height(bx, bz);
    this.debugEl.textContent =
      `${this.fpsValue} fps\n` +
      `xyz ${p.position.x.toFixed(2)} / ${p.position.y.toFixed(2)} / ${p.position.z.toFixed(2)}\n` +
      `biome ${biome.name}  height ${colHeight}\n` +
      `temp ${c.temperature.toFixed(2)}  humid ${c.humidity.toFixed(2)}  cont ${c.continentalness.toFixed(2)}  ero ${c.erosion.toFixed(2)}  weird ${c.weirdness.toFixed(2)}\n` +
      `graphics ${this.settings.vibrantVisuals ? 'Vibrant' : 'Classic'}\n` +
      `facing ${facing} (${deg.toFixed(0)}°)\n` +
      `speed ${p.horizontalSpeed.toFixed(2)} m/s  ground ${p.onGround}  fly ${p.flying}  sprint ${p.sprinting}  water ${p.inWater}\n` +
      `time ${t} (${t < 12000 ? 'day' : t < 13800 ? 'sunset' : t < 22200 ? 'night' : 'sunrise'})`;
  }

  /** Debug/test hooks (removed from the page when the game is disposed). */
  debugHooks(): Record<string, unknown> {
    return {
      game: this,
      player: this.player,
      world: this.world,
      controller: this.controller,
      interaction: this.interaction,
      hud: this.hud,
      BlockId,
      BiomeId,
      BIOMES,
      setBlock: (x: number, y: number, z: number, id: number) => this.world.setBlock(x, y, z, id),
      setTime: (t: number) => {
        this.worldTime = t;
      },
      getTime: () => this.worldTime,
      composer: this.composer,
      sky: this.sky,
      chunkRenderer: this.chunkRenderer,
      entities: this.entities,
      generator: this.generator,
      applyVisuals: () => this.applyVisuals(),
      validateBiomeAdjacency: (cx: number, cz: number, r: number) =>
        this.generator.validateBiomeAdjacency(cx, cz, r),
    };
  }

  dispose(): void {
    this.disposed = true;
    this.waterSfx.stopAll();
    this.input.exitPointerLock();
    for (const d of this.disposers) d();
    // Restore renderer defaults so the menu (and a future game) start clean.
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.NoToneMapping;
    // EffectComposer owns only its ping-pong targets; passes release their
    // own render targets and materials separately.
    this.bloomPass.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
    this.input.dispose();
    this.controller.dispose();
    this.entities.dispose();
    this.chunkRenderer.dispose();
    this.sky.dispose();
    this.clouds.dispose();
    this.particles.dispose();
    this.heldBlock.dispose();
    this.underwaterOverlay.dispose();
    this.interaction.dispose();
    this.hud.dispose();
    this.debugEl.remove();
    this.scene.clear();
  }
}
