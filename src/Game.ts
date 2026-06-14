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
import { Sky } from './rendering/Sky';
import { Clouds } from './rendering/Clouds';
import { BlockParticles } from './rendering/Particles';
import { HeldBlock } from './rendering/HeldBlock';
import { UnderwaterOverlay } from './rendering/UnderwaterOverlay';
import { createEnvironmentLighting } from './rendering/EnvironmentLighting';
import { ViewBobbing } from './rendering/ViewBobbing';
import { VIBRANT_TONE_MAPPING, VIBRANT_EXPOSURE } from './rendering/LightingProfile';
import { World } from './world/World';
import { TerrainGenerator } from './world/TerrainGenerator';
import { BlockId, blockDef, isTransparent } from './world/Block';
import { WORLD_HEIGHT } from './world/Chunk';
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
import { PlayerWaterAudio } from './audio/PlayerWaterAudio';
import type { AnimalTextureLibrary } from './entities/AnimalTextures';
import { PassiveMobSystem } from './entities/PassiveMobSystem';
import { DebugOverlay } from './ui/DebugOverlay';
import { LoreOverlay } from './ui/LoreOverlay';
import { climateVariantFor, selectSheepWoolColor } from './entities/AnimalTypes';
import { loreFragmentAt } from './world/structures/Lore';

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
  private mobs: PassiveMobSystem;
  private atlas: TextureAtlas;
  private viewBobbing = new ViewBobbing();
  private environmentLighting = createEnvironmentLighting();
  private baseViewRotation = new THREE.Quaternion();
  private heldSkyExposure = 1;
  private heldLightCell = '';
  private heldLightSampleFrame = 0;
  private input: Input;
  private physics: PlayerPhysics;
  private controller: PlayerController;
  private interaction: BlockInteraction;
  private hud: Hud;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private outputPass: OutputPass;
  private loop: GameLoop;
  private debugOverlay: DebugOverlay;
  private loreOverlay: LoreOverlay;
  private strideDistance = 0;
  private waterAudio: PlayerWaterAudio;
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
    animalTextures: AnimalTextureLibrary,
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
    this.mobs = new PassiveMobSystem(
      this.scene,
      this.world,
      this.generator,
      animalTextures,
      settings,
      seed,
      audio,
      this.player.position,
    );
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
    this.waterAudio = new PlayerWaterAudio(audio, this.world);
    this.physics = new PlayerPhysics(this.world, this.player);
    this.controller = new PlayerController(this.input, this.player, settings);
    this.interaction = new BlockInteraction(this.world, this.player);
    this.scene.add(this.interaction.highlight);
    this.hud = new Hud(container, atlas);
    this.debugOverlay = new DebugOverlay(container);
    this.loreOverlay = new LoreOverlay(container);
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

    this.loop = new GameLoop(
      () => this.tick(),
      (alpha, dt) => this.render(alpha, dt),
    );
  }

  get paused(): boolean {
    return this.loop.paused;
  }

  get fpsValue(): number {
    return this.debugOverlay.fps;
  }

  toggleDebugOverlay(): void {
    this.debugOverlay.toggle();
  }

  pause(): void {
    this.loop.paused = true;
    this.input.exitPointerLock();
    this.waterAudio.pause();
  }

  resume(): void {
    this.loop.paused = false;
    this.loop.resetTiming();
    this.input.requestPointerLock();
  }

  frame(now: number): void {
    this.loop.frame(now);
    this.debugOverlay.update(
      this.player,
      this.worldTime,
      this.generator,
      this.settings,
      this.mobs.counts(),
      this.mobs.spawner.activeChunkCount,
      this.generator.structures,
    );
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

  /** Approximate local roof/cave shadowing for the separate hand render. */
  private sampleHeldSkyExposure(position: THREE.Vector3): number {
    const bx = Math.floor(position.x);
    const by = Math.floor(position.y);
    const bz = Math.floor(position.z);
    const cell = `${bx},${by},${bz}`;
    this.heldLightSampleFrame++;
    if (cell === this.heldLightCell && this.heldLightSampleFrame % 6 !== 0) {
      return this.heldSkyExposure;
    }
    this.heldLightCell = cell;

    const offsets = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]] as const;
    let exposure = 0;
    for (const [dx, dz] of offsets) {
      let transmission = 1;
      for (let y = by + 1; y < WORLD_HEIGHT; y++) {
        const id = this.world.getBlock(bx + dx, y, bz + dz);
        if (id === BlockId.Air || id === BlockId.Water) continue;
        const def = blockDef(id);
        if (!def) continue;
        if (!isTransparent(id)) {
          transmission = 0;
          break;
        }
        transmission *= def.leafy ? 0.58 : 0.82;
        if (transmission < 0.05) break;
      }
      exposure += transmission;
    }
    this.heldSkyExposure = exposure / offsets.length;
    return this.heldSkyExposure;
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
      if (this.tryReadTargetLore()) return;
      if (this.interaction.placeBlock(this.hud.selectedBlock)) {
        this.sfx.blockPlace(blockDef(this.hud.selectedBlock)?.sound ?? 'none');
      }
    }
  }

  private tryReadTargetLore(): boolean {
    const target = this.interaction.target;
    if (!target || this.world.getBlock(target.x, target.y, target.z) !== BlockId.EtchedStone) return false;
    this.loreOverlay.show(loreFragmentAt(target.x, target.y, target.z));
    this.sfx.click();
    return true;
  }

  private tick(): void {
    this.physics.tick(this.controller.intent());
    this.viewBobbing.tick(this.player);
    this.mobs.tick(this.player.position);
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

    this.waterAudio.tick(p);
  }

  private render(alpha: number, frameDtMs: number): void {
    this.lastFrameDt = frameDtMs / 1000;
    if (!this.loop.paused) {
      this.controller.updateLook();
      this.hud.scroll(this.input.consumeWheel());
    }
    this.interaction.updateTarget();
    this.mobs.render(alpha);

    const p = this.player;
    p.interpolated(alpha, this.interpolatedPos);
    this.camera.position.set(
      this.interpolatedPos.x,
      this.interpolatedPos.y + p.eyeHeight,
      this.interpolatedPos.z,
    );
    this.camera.rotation.set(p.pitch, p.yaw, 0);
    this.baseViewRotation.copy(this.camera.quaternion);
    const viewBob = this.viewBobbing.apply(this.camera, alpha);

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
    this.sky.copyEnvironmentLighting(this.environmentLighting);
    this.heldBlock.updateLighting(
      this.environmentLighting,
      this.baseViewRotation,
      this.sampleHeldSkyExposure(this.camera.position),
    );
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

    // Held-block overlay pass shares the camera's distance-driven stride.
    if (!this.loop.paused) {
      this.heldBlock.setBlock(this.hud.selectedBlock);
      this.heldBlock.render(
        this.renderer,
        this.lastFrameDt,
        viewBob.phase,
        viewBob.amplitude,
      );
    }
    this.underwaterOverlay.render(this.renderer, cameraUnderwater, cameraBiome.waterFogColor);
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
      viewBobbing: this.viewBobbing,
      heldBlock: this.heldBlock,
      chunkRenderer: this.chunkRenderer,
      entities: this.mobs.entities,
      mobs: this.mobs,
      generator: this.generator,
      applyVisuals: () => this.applyVisuals(),
      validateBiomeAdjacency: (cx: number, cz: number, r: number) =>
        this.generator.validateBiomeAdjacency(cx, cz, r),
      animalVariantAt: (x: number, z: number) => climateVariantFor(
        this.generator.biomeAt(x, z),
        this.generator.effectiveTemperatureAt(x, z),
      ),
      selectSheepWoolColor,
      loreFragmentAt,
      readTargetLore: () => this.tryReadTargetLore(),
    };
  }

  dispose(): void {
    this.disposed = true;
    this.waterAudio.dispose();
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
    this.mobs.dispose();
    this.chunkRenderer.dispose();
    this.sky.dispose();
    this.clouds.dispose();
    this.particles.dispose();
    this.heldBlock.dispose();
    this.underwaterOverlay.dispose();
    this.interaction.dispose();
    this.hud.dispose();
    this.loreOverlay.dispose();
    this.debugOverlay.dispose();
    this.scene.clear();
  }
}
