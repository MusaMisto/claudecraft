# Passive Mobs Audit

## Baseline
- Date: 2026-06-13
- Branch: `mobs`
- Commit: `362eb215783b70101a39bf66bbe2a6b09c2e4ba6`
- Node version: `v26.3.0`
- npm install result: Pass; dependencies already current, 0 vulnerabilities.
- npm run build result: Pass; TypeScript strict check and Vite production build complete.
- npm run dev result: Pass; Vite ready at `http://127.0.0.1:5173/`.
- Browser/runtime observations: Headless Brave loaded the menu for 5 seconds at
  1280x800 with no console errors or warnings. The menu panorama rendered at
  approximately 120 FPS. The package `test` script is a placeholder that exits
  with "no test specified"; there is no lint script. Existing browser scripts
  are the project's executable regression suite.

## Existing Architecture
- Entity system exists: No.
- Mob system exists: No.
- Game loop / tick files: `src/core/GameLoop.ts`, integrated by `src/Game.ts`;
  fixed 20 Hz ticks with interpolated rendering.
- Physics/collision files: `src/player/PlayerPhysics.ts`,
  `src/player/BlockInteraction.ts`, and block solidity in `src/world/Block.ts`.
- World/chunk files: `src/world/World.ts`, `src/world/Chunk.ts`,
  `src/world/TerrainGenerator.ts`, `src/rendering/ChunkRenderer.ts`.
- Biome files: `src/world/Biome.ts`, runtime sampling in
  `src/world/TerrainGenerator.ts`.
- Texture-pack resolver files: `src/rendering/FaithfulTextures.ts`,
  `src/rendering/TextureAtlas.ts`.
- Audio files: `src/audio/AudioEngine.ts`, `src/audio/Sfx.ts`,
  `src/audio/WaterSfx.ts`, `src/audio/Music.ts`.
- Renderer files: `src/Game.ts`, `src/rendering/ChunkRenderer.ts`,
  `src/rendering/ChunkMesher.ts`.
- Save/load behavior: World and entities are not persisted. Only settings-like
  UI data (skin and username) uses local storage.

## Biome Data Available
- Current biome IDs: Plains, Forest, Birch Forest, Taiga, Snowy Plains,
  Desert, Savanna, Swamp, Ocean, Warm Ocean, Frozen Ocean.
- Current climate categories: Runtime temperature, humidity,
  continentalness, erosion, weirdness, effective altitude-adjusted temperature,
  land-biome identity, and ocean identity.
- Surface block access: Loaded blocks are available through
  `World.getBlock`; deterministic surface height and biome are available from
  `TerrainGenerator`.
- Spawnable surface detection: Not implemented as a reusable helper. It must
  reject water, ice, sand where unsuitable, glass, leaves, cactus, tree canopy,
  occupied headroom, and unsafe drops.
- Chunk load/unload hooks: No event hooks. `ChunkRenderer.stream` owns
  generation, mesh creation, and distance unloading; a mob manager must track
  active chunk coordinates independently and reconcile after streaming.

## Texture Pack State
- texturepack root: `texturepack/Faithful 64x - Release 13/`
- entity texture folder found:
  `assets/minecraft/textures/entity/`
- cow textures found: Adult temperate, warm, and cold, all 256x256.
- pig textures found: Adult temperate, warm, and cold, all 256x256.
- sheep textures found: Adult base, wool, and wool undercoat, all 256x128.
- chicken textures found: Adult temperate, warm, and cold, all 256x128.
- warm/cold/temperate variants found: Cow, pig, and chicken provide all three
  requested adult variants. Sheep uses base plus tintable wool layers.
- missing textures: None for the required adult set. Generated textures are
  still required as a resilient load/validation fallback.

## License Compliance
- README Faithful credit updated: Yes; selected block and entity textures are
  named.
- CREDITS.md updated: Yes; required passive-mob files and fallback behavior are
  listed.
- Faithful license file present: Yes,
  `THIRD_PARTY_LICENSES/FAITHFUL_LICENSE.txt`.
- Entity texture usage mentioned: Yes, in README, CREDITS, and DECISIONS.
- Monetization risk checked: Pass. README and CREDITS explicitly state the
  project is not monetized, and no paywall, marketplace, sponsorship, donation,
  purchase, or monetized-download integration was found.

## Required Systems
- Base Entity: Missing.
- Passive Mob: Missing.
- Mob Physics: Missing; player collision is tightly coupled to `Player`.
- Mob Renderer: Missing.
- Mob AI: Missing.
- Mob Spawner: Missing.
- Animal Texture Resolver: Missing; current Faithful resolver handles atlas
  block and foliage textures only.
- Animal SFX: Missing; existing audio buses support procedural additions.

## Risks
- Performance: One group per animal is acceptable under a 60-mob cap, but
  geometry and materials must be shared and AI must remain fixed-tick and
  lightweight.
- Spawn overpopulation: Chunk remeshing and reloads cannot be treated as spawn
  events. Deterministic chunk population and an active-chunk registry are
  required.
- Chunk lifecycle: The world exposes no callbacks; unloaded chunk data reads as
  air, so mobs beyond the active radius must be removed before physics treats
  missing terrain as empty space.
- Collision: Player collision cannot be reused directly without duplicating
  player-specific water, flight, jump, and sneak behavior. A small mob AABB
  solver should share block-solid rules instead.
- Texture UV accuracy: Faithful entity images use per-part layouts and different
  dimensions (256x256 cow/pig, 256x128 sheep/chicken). Each cuboid needs explicit
  UV rectangles or a visually safe fallback.
- Missing Faithful textures: Required adult files exist, but load failures,
  invalid dimensions, or future pack changes must not prevent startup.
- Audio spam: Idle calls need per-mob randomized cooldowns, distance gating, and
  a global concurrent/nearby limiter.
- Browser memory: Shared geometries, texture/material caches, audio-node
  self-cleanup, and manager disposal are required across repeated world starts.

## Fix Plan
1. Update Faithful attribution and document the clean-room entity exception.
2. Add minimal entity types, manager, shared mob physics, and fixed-tick hookup.
3. Add blocky animal models with shared geometry/material resources.
4. Add static Faithful entity URLs, per-part UV mapping, and generated fallback
   textures.
5. Add climate variants, deterministic sheep wool weighting, and chunk-seeded
   valid-surface group spawning with caps.
6. Add idle/look/wander/swim/stuck states, animation, distance cleanup, and
   debug counts.
7. Add distance-attenuated procedural animal voices and run build/browser
   regression, lifecycle, biome, and soak checks.

## Acceptance Checklist
- [x] Build passes
- [x] Dev server runs
- [ ] Cows spawn in suitable biomes
- [ ] Pigs spawn in suitable biomes
- [ ] Sheep spawn in suitable biomes
- [ ] Chickens spawn in suitable biomes
- [ ] Warm/cold/temperate variants work where textures exist
- [ ] Sheep wool colors depend on biome category
- [ ] Mobs wander/idly behave
- [ ] Mobs collide with terrain
- [ ] Mobs do not spawn inside blocks or water
- [ ] Sounds are synthesized and unique per animal
- [ ] Spawn caps prevent overpopulation
- [ ] No console errors after 10 minutes
