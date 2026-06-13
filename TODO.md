# Claudecraft — TODO (Phased Task List)

### Phase 0 — Project Scaffolding
- [x] Initialize git repo; create Vite + TypeScript project; install `three` and `simplex-noise`.
- [x] Create `PLAN.md` (spec copy), `TODO.md` (this list), empty `DECISIONS.md`.
- [x] Set up the folder structure from Section 6 with stub modules.
- [x] Render a blank Three.js scene (sky-blue clear color) with an FPS readout in the corner.
- **Acceptance:** `npm run dev` opens a stable blue scene at 60 FPS with no console errors.

### Phase 1 — Texture Atlas
- [x] Implement seeded RNG utility and `TextureAtlas.ts`: generate all Section 7 textures on canvas tiles, pack into one atlas, compute per-tile UV rects.
- [x] Implement `Block.ts`: `BlockId` enum, registry mapping each block to per-face texture tiles, solidity, transparency, and sound material.
- [x] Build a temporary debug scene showing one cube of each block type using the atlas.
- **Acceptance:** All 10 block types render with crisp (non-blurry) original textures; grass shows distinct top/side/bottom faces.

### Phase 2 — Chunk Data & Meshing
- [x] Implement `Chunk.ts` (flat `Uint8Array`, index math) and `World.ts` (chunk map keyed by chunk coords, world-space `getBlock`/`setBlock`, dirty marking).
- [x] Implement `ChunkMesher.ts`: face culling against neighbors (including cross-chunk lookups), opaque + transparent groups, per-face UVs from the atlas, simple per-face brightness (top 1.0, sides 0.8/0.6, bottom 0.5) baked as vertex colors.
- [x] Implement `ChunkRenderer.ts`: build/rebuild/dispose chunk meshes; rebuild neighbors on border edits.
- [x] Test with a hand-filled flat 3×3-chunk world.
- **Acceptance:** A 3×3-chunk flat world renders with no interior faces (verify with wireframe toggle); editing a border block via console updates both chunks correctly.

### Phase 3 — Terrain Generation
- [x] Implement `TerrainGenerator.ts`: seeded 2D simplex heightmap, 3–4 octaves (e.g., base wavelength ~200 blocks, persistence ~0.5), height range roughly y 50–90 centered near sea level 62.
- [x] Layering: grass on the surface column top (sand instead when at/below y 63 near water), 3 blocks of dirt beneath, stone to y=0; fill air below y=62 with water.
- [x] Chunk streaming: generate/load chunks within render distance of the player position; unload beyond distance + 1; spread mesh builds across frames (budget ~2 per frame) to avoid hitches.
- **Acceptance:** Flying the (temporary free-fly) camera across the world shows endless rolling terrain with beaches and water, ≥ 60 FPS at render distance 6, no visible chunk seams.

### Phase 4 — Player Physics & Controls
- [x] Implement `GameLoop.ts` fixed 20 Hz tick with render interpolation (Section 6 pattern).
- [x] Implement `Input.ts` + pointer lock: WASD, Space (jump), Ctrl or double-tap-W (sprint), mouse look with sensitivity setting; Esc releases pointer lock (pause comes in Phase 9).
- [x] Implement `PlayerPhysics.ts`: per-tick gravity 0.08, vertical drag ×0.98, jump 0.42; horizontal model converging to 4.317 / 5.612 m/s; per-axis swept AABB collision (Section 6); `onGround` detection.
- [x] Spawn the player atop the terrain at world origin; camera at eye height 1.62 with sprint FOV easing.
- [x] Creative flight: double-tap Space toggles fly (gravity off, Space/Shift for up/down, ~10.89 m/s horizontal); landing on ground while flying turns it off.
- **Acceptance (measure with a temporary on-screen debug readout):** walking 100 blocks takes ≈ 23.2 s; sprinting 100 blocks ≈ 17.8 s; jump apex ≈ 1.25 blocks; player cannot clip through blocks even when sprint-jumping into walls or corners; can jump up exactly-1-block steps but not 2.

### Phase 5 — Block Interaction & Hotbar
- [x] Implement DDA raycast (max 5 blocks) with face normals; render a thin black wireframe box around the targeted block.
- [x] Left click: instantly break targeted block (set to air, remesh). Right click: place the selected hotbar block on the adjacent face, rejected if it would intersect the player.
- [x] Hotbar HUD: 9 slots rendered in HTML/CSS at bottom center with block icons (draw each icon from its atlas tile, or render tiny cube thumbnails to offscreen canvases); selection via keys 1–9 and mouse wheel; visible selected-slot frame.
- **Acceptance:** Breaking and placing feel instant; placement never traps the player inside a block; you can build a pillar under yourself by jump-placing; selection UI matches the placed block.

### Phase 6 — Day/Night Cycle
- [x] Implement world time (24,000-tick cycle, starting at tick 1,000 — early morning).
- [x] `Sky.ts`: sky color from a keyframed gradient over the cycle (bright blue day → orange/pink sunset → very dark blue night → sunrise); matching fog color/density; sun and moon as quads orbiting the player on a fixed celestial axis; stars (random point sprites on the celestial sphere) fading in at night.
- [x] Lighting: one directional light tracking the sun (moon at night, much dimmer) + ambient light, both intensity-keyframed over the cycle so night is dark but playable.
- **Acceptance:** A full cycle takes 20 real minutes with proportions per Section 4; sunset/sunrise transitions are smooth (no popping); shadows of brightness change direction plausibly with the sun.

### Phase 7 — 3D Clouds
- [x] `Clouds.ts`: threshold a low-frequency 2D noise field into a boolean cloud map; instance 12×12×4 m soft-white translucent boxes at y=128 on cells where the map is true (merge adjacent cells into larger boxes if simple to do).
- [x] Drift the whole cloud field slowly westward (−X), wrapping/regenerating tiles so clouds never run out; clouds follow the player horizontally at large scale so they're always overhead.
- [x] Tint cloud color with the time of day (white at noon, warm at sunset, dark gray at night).
- **Acceptance:** Looking up shows scattered 3D clouds drifting slowly and consistently; you can fly up through a cloud; no popping at the horizon.

### Phase 8 — Audio
- [x] `AudioEngine.ts`: lazy-init `AudioContext` on first user gesture; master, music, and SFX gain buses wired to the volume settings.
- [x] `Sfx.ts`: synthesize footstep (4 material variants), break, place, and UI click per Section 7; hook footsteps to the stride accumulator (ground only), break/place to interactions, clicks to all buttons.
- [x] `Music.ts`: generative ambient loop per Section 7; plays on the menu, continues quieter in-game; respects the music volume slider live.
- **Acceptance:** Walking on grass vs. stone vs. sand vs. wood sounds clearly different; breaking/placing always produces a sound; music loops seamlessly with no clicks; volume sliders work in real time.

### Phase 9 — Main Menu, Options & Pause
- [x] `MainMenu.ts`: full-screen overlay with pixel-styled CLAUDECRAFT wordmark, rotating yellow splash text (write ~10 original quips), and buttons: *Singleplayer*, *Options*. Background: a live slowly rotating camera panorama of a small pre-generated world (reuse the engine at low render distance).
- [x] `OptionsMenu.ts`: sliders/selectors for music volume, SFX volume, mouse sensitivity, FOV, render distance — all applied live.
- [x] `PauseMenu.ts`: Esc pauses the simulation (tick loop halts, pointer lock released) with *Back to Game*, *Options*, *Quit to Title*; quitting tears the world down cleanly and returns to the menu without leaks (verify by starting several worlds in a row).
- **Acceptance:** Menu → game → pause → options → quit → menu → new game all work repeatedly; music behaves correctly across transitions; no WebGL context or memory leaks after 5 world restarts.

### Phase 10 — Polish & QA Hardening
- [x] Crosshair, smooth chunk-load fade-in (optional), and a debug overlay toggle (F3): FPS, coords, facing, time of day.
- [x] Performance pass: confirm ≥ 60 FPS at render distance 6 on a mid-range laptop profile; ensure chunk remeshing on block edits stays under ~4 ms.
- [x] Edge cases: falling out of the world respawns the player at spawn; placing/breaking at chunk borders; alt-tab/pointer-lock loss pauses gracefully; window resize keeps aspect correct.
- [x] Code cleanup: remove debug scenes, dead code; final pass over `DECISIONS.md`; update `README.md` with controls and a screenshot.
- **Acceptance:** 10-minute free-play session with constant building/breaking/sprinting/flying produces zero console errors and no frame-time degradation.

### Phase 11 — Stretch Goals (only if all above is complete and stable)
- [x] Simple oak trees scattered on grass during terrain generation (trunk 4–6 logs + leaf blob), density ~1 per 60 surface blocks.
- [x] Sneaking (Shift when not flying): 1.295 m/s, eye height lowers to ~1.5 m, prevents walking off edges.
- [x] Block-break particles (small textured quads bursting from the broken block).
- [x] Held-block rendering in the bottom-right corner of the viewport, with a small swing animation on click.

### Phase 12 — Held-Item Scale & Water Physics (PLAN.md Section 8)
- [x] Held item at Minecraft first-person scale: block at scale 0.4 with the vanilla `firstperson_righthand` pose (45° Y rotation), repositioned to the lower-right like Minecraft's viewmodel.
- [x] Visible first-person arm: code-generated skin-toned boxy right arm (MC proportions 0.25×0.75×0.25 m) holding the block; arm and block bob while walking and swing together on click.
- [x] Water detection: `player.inWater` when the hitbox AABB overlaps water blocks; exposed to physics and debug overlay.
- [x] Classic water physics per Section 8.2: jump +0.04/tick, horizontal accel 0.02 (×1.3 sprint), then all velocity ×0.8 and vy −0.02 after the move; horizontal-collision climb-out boost vy = 0.3; flying unaffected.
- **Acceptance (headless, measured):** standing still in deep water sinks at ≈ 2.0 m/s terminal; holding Space underwater rises at ≈ 2.0 m/s and settles into a surface float with eyes at the water line; forward swim ≈ 2.0 m/s displacement (stored velocity 1.6 m/s); swimming against a 1-block bank climbs out; flying through water is unaffected; held block exactly 0.4 scale with skin-toned arm pixels visible bottom-right (GL-probed); phase-4 land-physics checks still pass unchanged.

### Phase 13 — Vibrant Visuals Overhaul (PLAN.md Section 9)
- [x] Vertex ambient occlusion + smooth lighting in the mesher (levels 0.4/0.6/0.8/1.0, quad diagonal flip), opaque + leaves.
- [x] Pixelated directional sun shadows: BasicShadowMap 2048², ortho frustum ~90 blocks texel-snapped to the player, normalBias tuned; terrain + leaves + clouds cast.
- [x] HDR pipeline: ACES filmic tone mapping, EffectComposer with MSAA ×4 HalfFloat target, UnrealBloomPass (high threshold), OutputPass; held-item overlay still on top.
- [x] Water overhaul: dedicated mesher pass with world-space UVs, animated code-generated normal map (waves), strong sun specular glint, fresnel mix toward the live sky color, deep-blue tint.
- [x] Atmosphere rebalance: HemisphereLight ambient, stronger sun vs. dimmer ambient, additive sun halo sprite, clouds lit by the sun and casting shadows, richer sky/fog keyframes.
- [x] Vibrant Visuals ON/OFF toggle in Options (default on), applied live; Phase 14 supersedes the original flat OFF profile with the vanilla visual baseline.
- **Acceptance (headless, measured):** AO darkens top-face vertices beside walls (< 0.85 vs 1.0 in the open); noon ground pixels behind a wall ≤ 0.7× sunlit neighbors (Phase 14 retains a softer shadow with the toggle off); composer target samples = 4 with ACES on / NoToneMapping off; bloom brightens pixels beside the sun disk vs toggle-off; water normal map scrolls over time and a low-sun glint cluster appears on water; ≥ 55 FPS at render distance 6; phase-4 and phase-12 checks pass unchanged.

### Phase 14 — Vanilla Visual Baseline (PLAN.md Section 10)
- [x] Promote classic voxel ambient occlusion and smooth face lighting to an explicit always-on base-renderer guarantee, independent of Vibrant Visuals.
- [x] Keep hard, texel-stabilized directional block shadows enabled in normal gameplay with Vibrant Visuals both ON and OFF; terrain and leaves cast/receive, water receives, while enhanced drifting cloud shadows remain Vibrant-only.
- [x] Request drawing-buffer anti-aliasing when the WebGL renderer is created so the direct vanilla render path and held-item overlay remain anti-aliased; retain the Phase-13 MSAA ×4 HDR target for Vibrant Visuals.
- [x] Redefine the Vibrant Visuals toggle as an enhancement layer only: ON adds ACES, bloom, animated reflective water, halo, stronger lighting contrast, and cloud shadows; OFF keeps AO, block shadows, and anti-aliasing with classic water and no HDR effects.
- [x] Add a headless Phase-14 acceptance script and update the Phase-13 regression check for the new baseline contract; document the renderer split in `DECISIONS.md` and `README.md`.
- **Acceptance (headless, measured):** with Vibrant Visuals OFF, AO corner vertices remain < 0.85 beside walls while open tops remain 1.0; block-shadow luminance is ≤ 0.82× adjacent sunlit ground; `shadowMap.enabled` and the sun light's `castShadow` remain true; the actual WebGL context reports anti-aliasing enabled; cloud shadow casting, ACES, bloom/composer rendering, halo, and vibrant water remain off. With Vibrant Visuals ON, the same baseline features remain active, composer samples stay 4, and enhanced features return. Both profiles sustain ≥ 55 FPS at render distance 6; phase-4, phase-12, and updated phase-13 checks pass unchanged.

### Phase 15 — Unified Clouds, Underwater Rendering & View Distance (PLAN.md Section 11)
- [x] Replace the instanced per-cell cloud boxes with one face-culled cloud mesh that omits faces between touching cells, preserving drift, wrapping, day/night tint, fly-through behavior, and Vibrant-only cloud shadows.
- [x] Make both classic and Vibrant water surfaces visible from below, and apply a Minecraft-like blue underwater clear color plus short-distance fog whenever the camera eye is inside water; restore normal sky/fog immediately on surfacing.
- [x] Change Vibrant Visuals to default OFF while retaining the live Options toggle and the always-on Phase-14 vanilla shading baseline.
- [x] Raise render-distance options to 2–16 chunks and set the default to 12, keeping chunk generation/meshing progressively budgeted so startup remains responsive.
- [x] Add a Phase-15 headless acceptance script, update affected documentation and regression expectations, and verify lifecycle resource cleanup at the larger default distance.
- **Acceptance (headless, measured):** cloud geometry contains no pair of faces on a shared cell boundary and uses fewer quads than six faces per occupied cell; clouds still drift west, retint across day/night, and toggle shadow casting with Vibrant Visuals. On a controlled water fixture, a camera below the surface sees blue water pixels and underwater fog/clear color, then normal sky fog returns after surfacing, in both visual profiles. Fresh settings report Vibrant Visuals OFF and render distance 12; the Options slider maximum is 16; selecting 16 causes chunks beyond the old 10-chunk limit to stream without a long blocking frame. Phase-9, phase-12, phase-14, and build checks pass.

### Phase 16 — Seamless Sand & Temperate Foliage (PLAN.md Section 12)
- [x] Inset every block-atlas UV rectangle by half a texel so nearest-filtered faces sample only their own 16×16 tile and flat sand fields no longer acquire dark grid lines from adjacent or empty atlas cells.
- [x] Add original code-generated alpha-cutout textures for short grass, tall grass, fern, bush, dandelion, poppy, cornflower, oxeye daisy, and clustered wildflowers, informed by the foliage variety present in current Minecraft releases without copying Mojang assets.
- [x] Generate deterministic foliage only above exposed natural grass, with grass as the common case and flowers/bushes as sparser accents; keep it non-solid, non-targetable, and automatically remove it when its supporting grass or open cell changes.
- [x] Render foliage as crossed, double-sided quads in a dedicated chunk geometry/material that participates in daylight and alpha-tested shadows without changing terrain collision, hotbar contents, or block storage.
- [x] Add a Phase-16 headless acceptance script, update documentation and decisions, and run build plus terrain, interaction, vanilla-visual, and Phase-15 regressions.
- **Acceptance (headless, measured):** the sand atlas rectangle is inset exactly half a texel on all sides and a controlled top-down sand field contains no dark seam pixels away from UI; generated foliage includes at least six distinct variants over a representative grass area, is deterministic for a fixed seed, appears only over exposed grass, leaves its world cell as non-solid air, and emits four crossed double-sided triangles per plant face pair through a dedicated alpha-tested material. Breaking or covering supporting grass removes the decoration after remeshing. Build, Phase-3 terrain, Phase-5 interaction, Phase-14 visuals, and Phase-15 checks pass.

### Phase 17 — Overworld Biomes & Biome Water (PLAN.md Section 13)
- [x] Add a deterministic biome registry and broad climate sampler for Plains, Forest, Birch Forest, Taiga, Snowy Plains, Desert, Savanna, Swamp, Ocean, Warm Ocean, and Frozen Ocean, using smooth temperature/humidity-driven terrain relief so biome borders do not create generation seams.
- [x] Add original procedural snow, ice, cactus, birch, spruce, and acacia block textures/definitions; generate biome-faithful surfaces, tree species/densities, cactus patches, and foliage mixes while preserving the fixed player hotbar.
- [x] Tint biome-sensitive grass, leaves, and ground foliage by their current world biome in the chunk mesh, including player-placed grass/leaves as Minecraft does, with coherent cross-chunk results and no tint on unrelated blocks.
- [x] Use Mojang Java 26.1.2 biome registry values for water surfaces and underwater fog: normal `#3F76E4`, swamp `#617B64` / fog `#232317`, warm ocean `#43D5EE` / fog `#041F33`, and frozen ocean `#3938C9`; blend water vertices across nearby biome boundaries and update camera fog/overlay from the current biome.
- [x] Show the current biome in the F3 debug overlay; add a Phase-17 headless acceptance script, update affected prior checks/documentation, and run build, terrain, physics, lifecycle, visual, underwater, foliage, and distance regressions.
- **Acceptance (headless, measured):** a fixed seed produces all eight land biomes plus all three ocean variants within the scan fixture and returns identical biome IDs/heights across repeated calls; generated samples use sand in Desert, snow in Snowy Plains, ice over Frozen Ocean water, cactus in Desert, and the registered oak/birch/spruce/acacia tree blocks in their expected regions. Water geometry contains the exact stable 26.1.2 RGB values for normal, swamp, warm-ocean, and frozen-ocean water, with interpolated boundary vertices remaining within endpoint ranges. Submerging the camera in controlled water fixtures applies the biome's registered fog color and swamp visibility multiplier in both visual profiles, then restores sky fog on surfacing. Biome generation remains progressively streamed at ≥55 FPS at distance 6; Phase-4, Phase-9, Phase-14, Phase-15, and Phase-16 checks pass.

### Phase 18 — Menu Redesign, Custom Logo & Player Skins (see `UI_SKIN_MENU_AUDIT.md`)
- [x] Resolve `docs/claudecraft-logo.png` and `docs/skin.png` through Vite (`src/assets/assets.ts`); logo bundles, missing skin warns only and falls back gracefully.
- [x] `SkinManager`: load default `docs/skin.png`, validate 64×64 PNG uploads, generated fallback skin, nearest-filtered shared texture, `localStorage` persistence, subscribe/notify.
- [x] `SkinUv.ts` (classic 64×64 base + overlay rects + reusable cuboid builder) and `PlayerModel.ts` (head/body/arms/legs base + inflated overlays).
- [x] Redesign the main menu: custom logo, centered Play/Settings, right-side 3D `PlayerPreview` over the panorama, Upload Skin button + status; no Marketplace/Sign In/bottle/Dressing Room.
- [x] Upload flow: file picker → validation → clear success/error messages → live preview + persistence.
- [x] First-person hand (`HeldBlock`) renders the shared skin via right-arm base + sleeve overlay UVs, updating on skin change; held-block pose/swing unchanged.
- [x] Redesign the pause/settings panels to one shared visual language; rename Options → Settings.
- [x] Update `DECISIONS.md`, `README.md`, and run build + phase-9 (lifecycle) and phase-12 (water/viewmodel) regressions.
- **Acceptance (verified in-browser):** build passes; custom logo crisp at 1920/1600/1366/1280-wide with no button/panel overlap and no console errors; default skin loads from `docs/skin.png` (and falls back when absent); valid 64×64 uploads apply and persist, wrong-size and non-PNG files are rejected with messages; preview and first-person hand both show the selected skin (phase-12 probe: 11638 skin px, scale 0.4); 4–5 menu→game→pause→settings→quit cycles leak no textures and log no console errors; phase-9 lifecycle passes.

### Phase 19 — Passive Mobs (see `PASSIVE_MOBS_AUDIT.md`)
- [x] Add a fixed-tick entity manager, passive-mob state, shared voxel AABB physics, gravity, water buoyancy, and one-block step-up.
- [x] Add clean-room cuboid cow, pig, sheep, and chicken models with shared geometry/material resources and procedural animation.
- [x] Resolve local Faithful adult entity textures for climate variants and sheep wool, with validated generated fallbacks.
- [x] Add biome/climate variant selection and deterministic climate-weighted sheep wool colors.
- [x] Add chunk-seeded group spawning on valid grass/snow surfaces with total, near-player, and per-chunk caps plus distance cleanup.
- [x] Add idle, look, wander, swim, hazard avoidance, smooth turning, and stuck-recovery behavior.
- [x] Add unique synthesized cow, sheep, pig, and chicken calls with distance attenuation, cooldowns, concurrency limits, and teardown.
- [x] Add F3 passive-mob counts and headless three-seed/browser acceptance coverage.
- [x] Complete the 10-minute traversal soak with no console errors, cap violations, leaks, or frame degradation.
- **Acceptance (verified in-browser):** `npm run build`, passive-mob acceptance, movement, water, lifecycle, visual, underwater, and biome regressions pass; the 10-minute traversal soak completed at 118.4 FPS with zero console errors, invalid states, or cap violations.
