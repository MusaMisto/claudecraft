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
- [ ] Implement `Chunk.ts` (flat `Uint8Array`, index math) and `World.ts` (chunk map keyed by chunk coords, world-space `getBlock`/`setBlock`, dirty marking).
- [ ] Implement `ChunkMesher.ts`: face culling against neighbors (including cross-chunk lookups), opaque + transparent groups, per-face UVs from the atlas, simple per-face brightness (top 1.0, sides 0.8/0.6, bottom 0.5) baked as vertex colors.
- [ ] Implement `ChunkRenderer.ts`: build/rebuild/dispose chunk meshes; rebuild neighbors on border edits.
- [ ] Test with a hand-filled flat 3×3-chunk world.
- **Acceptance:** A 3×3-chunk flat world renders with no interior faces (verify with wireframe toggle); editing a border block via console updates both chunks correctly.

### Phase 3 — Terrain Generation
- [ ] Implement `TerrainGenerator.ts`: seeded 2D simplex heightmap, 3–4 octaves (e.g., base wavelength ~200 blocks, persistence ~0.5), height range roughly y 50–90 centered near sea level 62.
- [ ] Layering: grass on the surface column top (sand instead when at/below y 63 near water), 3 blocks of dirt beneath, stone to y=0; fill air below y=62 with water.
- [ ] Chunk streaming: generate/load chunks within render distance of the player position; unload beyond distance + 1; spread mesh builds across frames (budget ~2 per frame) to avoid hitches.
- **Acceptance:** Flying the (temporary free-fly) camera across the world shows endless rolling terrain with beaches and water, ≥ 60 FPS at render distance 6, no visible chunk seams.

### Phase 4 — Player Physics & Controls
- [ ] Implement `GameLoop.ts` fixed 20 Hz tick with render interpolation (Section 6 pattern).
- [ ] Implement `Input.ts` + pointer lock: WASD, Space (jump), Ctrl or double-tap-W (sprint), mouse look with sensitivity setting; Esc releases pointer lock (pause comes in Phase 9).
- [ ] Implement `PlayerPhysics.ts`: per-tick gravity 0.08, vertical drag ×0.98, jump 0.42; horizontal model converging to 4.317 / 5.612 m/s; per-axis swept AABB collision (Section 6); `onGround` detection.
- [ ] Spawn the player atop the terrain at world origin; camera at eye height 1.62 with sprint FOV easing.
- [ ] Creative flight: double-tap Space toggles fly (gravity off, Space/Shift for up/down, ~10.89 m/s horizontal); landing on ground while flying turns it off.
- **Acceptance (measure with a temporary on-screen debug readout):** walking 100 blocks takes ≈ 23.2 s; sprinting 100 blocks ≈ 17.8 s; jump apex ≈ 1.25 blocks; player cannot clip through blocks even when sprint-jumping into walls or corners; can jump up exactly-1-block steps but not 2.

### Phase 5 — Block Interaction & Hotbar
- [ ] Implement DDA raycast (max 5 blocks) with face normals; render a thin black wireframe box around the targeted block.
- [ ] Left click: instantly break targeted block (set to air, remesh). Right click: place the selected hotbar block on the adjacent face, rejected if it would intersect the player.
- [ ] Hotbar HUD: 9 slots rendered in HTML/CSS at bottom center with block icons (draw each icon from its atlas tile, or render tiny cube thumbnails to offscreen canvases); selection via keys 1–9 and mouse wheel; visible selected-slot frame.
- **Acceptance:** Breaking and placing feel instant; placement never traps the player inside a block; you can build a pillar under yourself by jump-placing; selection UI matches the placed block.

### Phase 6 — Day/Night Cycle
- [ ] Implement world time (24,000-tick cycle, starting at tick 1,000 — early morning).
- [ ] `Sky.ts`: sky color from a keyframed gradient over the cycle (bright blue day → orange/pink sunset → very dark blue night → sunrise); matching fog color/density; sun and moon as quads orbiting the player on a fixed celestial axis; stars (random point sprites on the celestial sphere) fading in at night.
- [ ] Lighting: one directional light tracking the sun (moon at night, much dimmer) + ambient light, both intensity-keyframed over the cycle so night is dark but playable.
- **Acceptance:** A full cycle takes 20 real minutes with proportions per Section 4; sunset/sunrise transitions are smooth (no popping); shadows of brightness change direction plausibly with the sun.

### Phase 7 — 3D Clouds
- [ ] `Clouds.ts`: threshold a low-frequency 2D noise field into a boolean cloud map; instance 12×12×4 m soft-white translucent boxes at y=128 on cells where the map is true (merge adjacent cells into larger boxes if simple to do).
- [ ] Drift the whole cloud field slowly westward (−X), wrapping/regenerating tiles so clouds never run out; clouds follow the player horizontally at large scale so they're always overhead.
- [ ] Tint cloud color with the time of day (white at noon, warm at sunset, dark gray at night).
- **Acceptance:** Looking up shows scattered 3D clouds drifting slowly and consistently; you can fly up through a cloud; no popping at the horizon.

### Phase 8 — Audio
- [ ] `AudioEngine.ts`: lazy-init `AudioContext` on first user gesture; master, music, and SFX gain buses wired to the volume settings.
- [ ] `Sfx.ts`: synthesize footstep (4 material variants), break, place, and UI click per Section 7; hook footsteps to the stride accumulator (ground only), break/place to interactions, clicks to all buttons.
- [ ] `Music.ts`: generative ambient loop per Section 7; plays on the menu, continues quieter in-game; respects the music volume slider live.
- **Acceptance:** Walking on grass vs. stone vs. sand vs. wood sounds clearly different; breaking/placing always produces a sound; music loops seamlessly with no clicks; volume sliders work in real time.

### Phase 9 — Main Menu, Options & Pause
- [ ] `MainMenu.ts`: full-screen overlay with pixel-styled CLAUDECRAFT wordmark, rotating yellow splash text (write ~10 original quips), and buttons: *Singleplayer*, *Options*. Background: a live slowly rotating camera panorama of a small pre-generated world (reuse the engine at low render distance).
- [ ] `OptionsMenu.ts`: sliders/selectors for music volume, SFX volume, mouse sensitivity, FOV, render distance — all applied live.
- [ ] `PauseMenu.ts`: Esc pauses the simulation (tick loop halts, pointer lock released) with *Back to Game*, *Options*, *Quit to Title*; quitting tears the world down cleanly and returns to the menu without leaks (verify by starting several worlds in a row).
- **Acceptance:** Menu → game → pause → options → quit → menu → new game all work repeatedly; music behaves correctly across transitions; no WebGL context or memory leaks after 5 world restarts.

### Phase 10 — Polish & QA Hardening
- [ ] Crosshair, smooth chunk-load fade-in (optional), and a debug overlay toggle (F3): FPS, coords, facing, time of day.
- [ ] Performance pass: confirm ≥ 60 FPS at render distance 6 on a mid-range laptop profile; ensure chunk remeshing on block edits stays under ~4 ms.
- [ ] Edge cases: falling out of the world respawns the player at spawn; placing/breaking at chunk borders; alt-tab/pointer-lock loss pauses gracefully; window resize keeps aspect correct.
- [ ] Code cleanup: remove debug scenes, dead code; final pass over `DECISIONS.md`; update `README.md` with controls and a screenshot.
- **Acceptance:** 10-minute free-play session with constant building/breaking/sprinting/flying produces zero console errors and no frame-time degradation.

### Phase 11 — Stretch Goals (only if all above is complete and stable)
- [ ] Simple oak trees scattered on grass during terrain generation (trunk 4–6 logs + leaf blob), density ~1 per 60 surface blocks.
- [ ] Sneaking (Shift when not flying): 1.295 m/s, eye height lowers to ~1.5 m, prevents walking off edges.
- [ ] Block-break particles (small textured quads bursting from the broken block).
- [ ] Held-block rendering in the bottom-right corner of the viewport, with a small swing animation on click.
