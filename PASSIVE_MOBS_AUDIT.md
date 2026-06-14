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
- Base Entity: Implemented in `src/entities/Entity.ts` and
  `src/entities/EntityManager.ts`.
- Passive Mob: Implemented in `src/entities/PassiveMob.ts` and coordinated by
  `src/entities/PassiveMobSystem.ts`.
- Mob Physics: Implemented in `src/entities/MobPhysics.ts`.
- Mob Renderer: Implemented in `src/entities/MobRenderer.ts` with shared
  geometry/material caches.
- Mob AI: Implemented in `src/entities/PassiveMobAi.ts`.
- Mob Spawner: Implemented in `src/entities/MobSpawner.ts`.
- Animal Texture Resolver: Implemented in `src/entities/AnimalTextures.ts`;
  all 11 required Faithful adult textures load and validate.
- Animal SFX: Implemented in `src/audio/AnimalSfx.ts`.

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

## Final Verification
- `npm run build`: Pass.
- `scripts/passive-mobs-check.mjs`: Pass across three seeds; all four species,
  spawn caps, zero invalid spawns, variants and wool, movement, audio, debug
  counts, 120 FPS, and lifecycle checks verified.
- `scripts/phase4-check.mjs`: Pass.
- `scripts/phase12-check.mjs`: Pass.
- `scripts/phase14-check.mjs`: Pass at 120 FPS in Classic and Vibrant.
- `scripts/phase15-check.mjs`: Pass, including exact post-disposal resource
  counts of 486 geometries and 10 textures.
- `scripts/phase17-check.mjs`: Pass at approximately 104 FPS.
- Visual inspection: Cow, pig, sheep, and chicken silhouettes and mapped
  textures verified in close screenshots.
- Swimming fixture: Pass; the test mob entered `swimming`, remained buoyant,
  and moved from deep water toward nearby land over 5.3 seconds.
- 10-minute traversal soak: Pass with zero browser console errors, zero invalid
  mob states, total/near caps held at 60/35, shared textures bounded at 16,
  118.4 average FPS, and a 99.4 ms maximum frame gap during chunk traversal.

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
- [x] Cows spawn in suitable biomes
- [x] Pigs spawn in suitable biomes
- [x] Sheep spawn in suitable biomes
- [x] Chickens spawn in suitable biomes
- [x] Warm/cold/temperate variants work where textures exist
- [x] Sheep wool colors depend on biome category
- [x] Mobs wander/idly behave
- [x] Mobs collide with terrain
- [x] Mobs do not spawn inside blocks or water
- [x] Sounds are synthesized and unique per animal
- [x] Spawn caps prevent overpopulation
- [x] No console errors after 10 minutes
