# Terrain, Water, and Biome Polish Audit

## Baseline
- Date: 2026-06-13
- Branch: test-gpt
- Commit: a1444d2
- Node version: v26.3.0
- npm install result: dependencies already present (`simplex-noise`, `three`).
- npm run build result: **passes** (tsc + vite, ~617 kB bundle, only the pre-existing
  chunk-size advisory).
- npm run dev result: serves on `http://localhost:5173` (Vite 8).
- Browser/runtime observations: prior commits already landed vibrant lighting,
  vanilla water material, climate signals, and cold-coast beach gating. The
  remaining defects below were confirmed by reading the generation code.

## Screenshot-Driven Issues
- **Harsh biome cutoff:** mostly mitigated already — relief is driven by smooth
  climate fields, not per-biome branches, so terrain height is continuous across
  borders. The remaining hard edge is *surface material* (grass↔sand↔snow flips
  on a single column threshold) with no transition band.
- **Invalid sand patches:** CONFIRMED root cause. `generate()` marks a column a
  beach purely by elevation: `height <= SEA_LEVEL + 1`. A forest/plains column
  that happens to plateau one block above sea level becomes dry sand even with
  no water anywhere nearby → the "riverbed with no water" look.
- **Gloomy atmosphere:** already addressed (warm keyframes in `Sky.ts`, vibrant
  lighting profile). Treated as done; only minor verification this pass.
- **Generic water bodies:** CONFIRMED. Water is a flat fill from `height+1` to
  `SEA_LEVEL`. `continentalness`/`erosion`/`weirdness` are sampled in
  `climateAt` but **never used in `height()`**, so there is no bathymetry, no
  deep ocean, no varied shoreline — every body is a shallow ≤13-block pool.
- **Missing water audio:** CONFIRMED. `Sfx.ts` has footstep/break/place/click
  only. No splash, swim, or submerged ambience. `PlayerPhysics` exposes
  `p.inWater` but nothing consumes it for audio.

## Current Worldgen Architecture
- Terrain generator: `src/world/TerrainGenerator.ts` (height, climate, biome,
  surface layering, water fill, foliage, trees).
- Biome source: `src/world/Biome.ts` (registry, water/grass tints, surface kind).
- Surface builder: inline in `TerrainGenerator.generate()`.
- Water generation: inline in `generate()` (fill `height+1..SEA_LEVEL`).
- Block registry: `src/world/Block.ts` (Dirt exists; **no Gravel**).
- Texture atlas: `src/rendering/TextureAtlas.ts` (16×16 painters, 8×8 grid).
- Audio: `src/audio/AudioEngine.ts`, `Sfx.ts`, `Music.ts`.
- Sky/lighting: `src/rendering/Sky.ts`, `LightingProfile.ts`.
- Player water detection: `src/player/PlayerPhysics.ts` (`isInWater`,
  `waterAtHead`, sets `Player.inWater`).
- Meshing: `src/rendering/ChunkMesher.ts` (separate opaque/transparent/water/
  foliage builders); `ChunkRenderer.ts` (materials, streaming).

## Biome Transition Logic
- Current algorithm: per-column climate (`temperature`, `humidity`,
  `continentalness`, `erosion`, `weirdness`) from warped low-frequency simplex;
  `landBiomeAt` is a threshold cascade; `height()` blends relief from smooth
  climate fields so elevation never steps at a biome edge.
- Why transitions are harsh: only the *surface block* (grass/sand/snow) flips on
  a hard threshold; there is no dithered transition band between, e.g., plains
  grass and desert sand.
- Chunk seam risks: none in height (pure world-space functions). New transition
  noise must also be world-space + deterministic.
- Proposed fix: add a deterministic low-frequency transition dither so the
  grass↔sand desert edge interleaves over a few blocks instead of a straight
  line. Keep it conservative (no checkerboards, no inland speckle).

## Sand Placement Logic
- Current sand rules: `def.surface === 'sand'` (Desert/Ocean biomes) **or**
  `beach = height <= SEA_LEVEL + 1 && land !== Swamp && effTemp > COLD_BEACH_TEMP`.
- Why invalid sand appears: the beach test never checks for nearby water, so any
  low dry column becomes sand.
- Missing water masks: yes — there is no `distanceToWater` / `isNearWater`.
- Proposed fix: gate beaches on real water adjacency
  (`isNearWater(x, z, radius)` = some column within radius sits `<= SEA_LEVEL`).
  Desert sand and genuine underwater floors are unaffected.

## Water Generation Logic
- Current lake/ocean/river logic: none beyond "any column below sea level fills
  with water." No basins carved, no rivers.
- Current depth behavior: depth = `SEA_LEVEL - height`, capped ~13 by relief.
- Current water fill rules: `for y in height+1..SEA_LEVEL → Water` (Ice on the
  Frozen Ocean surface row).
- Proposed fix: drive base elevation from a continentalness spline (deep ocean →
  shelf → coast → inland), modulate relief amplitude by erosion, and add a
  modest ridge term for occasional mountains. This yields deep oceans, varied
  shorelines, and taller terrain, all within the existing `WORLD_HEIGHT` clamp.

## Texture and Material Logic
- Current water texture: static `paintWater` tile in the shared atlas; the water
  mesh samples it with normal atlas UVs (no animation).
- Current atlas animation support: none. The atlas is painted once at startup.
- Required changes: repaint just the water tile region of the atlas canvas on a
  fixed tick cadence and flag `texture.needsUpdate`. This animates every water
  mesh with zero remeshing and a single 128×128 re-upload per frame step.

## Audio Logic
- Current water detection: `PlayerPhysics.isInWater()` / `waterAtHead()` exist;
  `Player.inWater` is updated each tick.
- Current SFX support: `Sfx` (filtered noise bursts + oscillators) on a
  settings-driven `sfxGain` bus. No looping voices.
- Required changes: a `WaterSfx` module (enter splash, exit splash, periodic
  swim stroke, low looped submerged ambience) on the existing `sfxGain` bus, and
  per-tick water-state edges (entered/exited/submerged/swim distance) fed from
  `Game.tick`.

## Terrain Variation
- Current height/noise system: 4-octave fbm (`BASE_WAVELENGTH = 200`) plus
  climate relief; output `Math.round`, clamped `[1, WORLD_HEIGHT-10]`.
- Current max terrain range: roughly `SEA_LEVEL ± 13` → ~49–77.
- World height: `WORLD_HEIGHT = 128`, `SEA_LEVEL = 62`. Plenty of headroom for
  taller terrain.
- Proposed safe target range: deep ocean ~40, coasts ~60–64, plains ~64–72,
  hills ~75–95, rare ridges up to ~112 (margin below the 118 clamp).

## Fix Plan
1. Audit (this document).
2. Fix invalid inland sand: water-adjacency-gated beaches.
3. Biome transition dither for the grass↔sand surface edge.
4. Add Gravel block (registry + procedural texture + sound).
5. Underwater dirt/gravel/sand floor patches (coherent blobs).
6. Animated procedural water texture (atlas-tile repaint on a tick cadence).
7. Verify/limit sky warmth (already vibrant).
8. Water SFX (enter/exit/swim/submerged) + per-tick water state.
9. Continentalness/erosion/ridge terrain + water bathymetry.
10. Final QA: build, headless browser check, multi-seed fly-through.

## Acceptance Checklist
- [ ] Build passes
- [ ] Dev server runs
- [ ] Biome transitions are blended
- [ ] Invalid inland sand patches are removed
- [ ] Water texture animates
- [ ] Gravel exists and renders correctly
- [ ] Dirt/gravel generate underwater coherently
- [ ] Sky is warmer and more vibrant
- [ ] Water movement sounds work
- [ ] Water bodies vary in shape and depth
- [ ] Terrain has more height and interest
- [ ] No chunk seams
- [ ] No console errors after extended free play
