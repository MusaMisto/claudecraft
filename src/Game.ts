// One running world session: scene, player, HUD, sky, clouds, audio hooks.
// Created by main.ts when Singleplayer starts; disposed on Quit to Title.
import * as THREE from 'three';
import { GameLoop } from './core/GameLoop';
import { Input } from './core/Input';
import { TextureAtlas } from './rendering/TextureAtlas';
import { ChunkRenderer } from './rendering/ChunkRenderer';
import { Sky, DAY_LENGTH } from './rendering/Sky';
import { Clouds } from './rendering/Clouds';
import { BlockParticles } from './rendering/Particles';
import { HeldBlock } from './rendering/HeldBlock';
import { World } from './world/World';
import { TerrainGenerator } from './world/TerrainGenerator';
import { BlockId, blockDef } from './world/Block';
import { Player } from './player/Player';
import { PlayerPhysics } from './player/PlayerPhysics';
import { PlayerController } from './player/PlayerController';
import { BlockInteraction } from './player/BlockInteraction';
import { Hud } from './ui/Hud';
import type { Settings } from './settings/Settings';
import type { AudioEngine } from './audio/AudioEngine';
import type { Sfx } from './audio/Sfx';

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
  private atlas: TextureAtlas;
  private walkPhase = 0;
  private input: Input;
  private physics: PlayerPhysics;
  private controller: PlayerController;
  private interaction: BlockInteraction;
  private hud: Hud;
  private loop: GameLoop;
  private debugEl: HTMLElement;
  private strideDistance = 0;
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
    this.chunkRenderer = new ChunkRenderer(this.world, atlas);
    this.scene.add(this.chunkRenderer.group);
    this.sky = new Sky(this.scene, settings.renderDistance * 16);
    this.clouds = new Clouds();
    this.scene.add(this.clouds.group);
    this.atlas = atlas;
    this.particles = new BlockParticles(atlas);
    this.scene.add(this.particles.group);
    this.heldBlock = new HeldBlock(atlas);

    this.input = new Input(renderer.domElement);
    this.physics = new PlayerPhysics(this.world, this.player);
    this.controller = new PlayerController(this.input, this.player, settings);
    this.interaction = new BlockInteraction(this.world, this.player);
    this.scene.add(this.interaction.highlight);
    this.hud = new Hud(container, atlas);

    this.world.ensureChunk(0, 0);
    this.player.teleport(0.5, this.generator.height(0, 0) + 1, 0.5);

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
    this.worldTime++;

    // Falling out of the world respawns at the spawn point.
    if (this.player.position.y < -16) {
      this.player.teleport(0.5, this.generator.height(0, 0) + 1, 0.5);
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
  }

  private render(alpha: number, frameDtMs: number): void {
    this.lastFrameDt = frameDtMs / 1000;
    if (!this.loop.paused) {
      this.controller.updateLook();
      this.hud.scroll(this.input.consumeWheel());
    }
    this.interaction.updateTarget();

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

    this.chunkRenderer.stream(p.position.x, p.position.z, this.settings.renderDistance);
    this.chunkRenderer.update(2);

    this.sky.setRenderDistance(this.settings.renderDistance * 16);
    this.sky.update(this.worldTime + alpha, this.camera.position);
    this.clouds.update(this.lastFrameDt, p.position.x, p.position.z, this.sky.cloudColor);
    if (!this.loop.paused) this.particles.update(this.lastFrameDt, this.camera);
    this.audio.applyVolumes();

    this.renderer.setClearColor(this.sky.skyColor);
    this.renderer.render(this.scene, this.camera);

    // Held-block overlay pass (bobs while walking on the ground).
    if (!this.loop.paused) {
      if (p.onGround && !p.flying) this.walkPhase += p.horizontalSpeed * this.lastFrameDt * 1.8;
      this.heldBlock.setBlock(this.hud.selectedBlock);
      this.heldBlock.render(this.renderer, this.lastFrameDt, this.walkPhase);
    }
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
    this.debugEl.textContent =
      `${this.fpsValue} fps\n` +
      `xyz ${p.position.x.toFixed(2)} / ${p.position.y.toFixed(2)} / ${p.position.z.toFixed(2)}\n` +
      `facing ${facing} (${deg.toFixed(0)}°)\n` +
      `speed ${p.horizontalSpeed.toFixed(2)} m/s  ground ${p.onGround}  fly ${p.flying}  sprint ${p.sprinting}\n` +
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
      setBlock: (x: number, y: number, z: number, id: number) => this.world.setBlock(x, y, z, id),
      setTime: (t: number) => {
        this.worldTime = t;
      },
      getTime: () => this.worldTime,
    };
  }

  dispose(): void {
    this.disposed = true;
    this.input.exitPointerLock();
    for (const d of this.disposers) d();
    this.input.dispose();
    this.controller.dispose();
    this.chunkRenderer.dispose();
    this.sky.dispose();
    this.clouds.dispose();
    this.particles.dispose();
    this.heldBlock.dispose();
    this.interaction.dispose();
    this.hud.dispose();
    this.debugEl.remove();
    this.scene.clear();
  }
}
