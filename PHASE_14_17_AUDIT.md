# Phase 14–17 Audit

## Baseline
- **Date:** 2026-06-13
- **Branch:** `test-gpt`
- **Commit:** `9472f08` (phase-17: add overworld biomes and biome water)
- **Node version:** v26.3.0
- **npm install result:** dependencies already present; not re-run (no lockfile drift observed).
- **npm run build result:** ✅ passes (`tsc` clean, `vite build` succeeds). Only the
  pre-existing "chunk > 500 kB" size warning, which is informational.
- **npm run dev result:** ✅ serves on `http://localhost:5173/` (HTTP 200).
- **npm run lint / test:** none configured (`test` is a placeholder that exits 1; no lint script).
- **CLAUDE.md:** **does not exist** — it was deleted in commit `0720d1a "removed claude.md"`.
  The governing master prompt is `CLAUDECRAFT_AGENT_PROMPT.md`; `PLAN.md`, `TODO.md`,
  `DECISIONS.md`, `README.md` were read in its place. (Workflow rule "read CLAUDE.md first"
  is satisfied as far as possible.)
- **Browser/runtime observations (Vibrant Visuals ON, headless GL probes):**
  - Noon over a forest: **54.1% of frame pixels are near-black (luma < 12/255)**; the
    1st/5th-percentile luma is **0** and background trees render as solid black silhouettes.
    This reproduces the user's "non-sun-facing surfaces nearly black / harsh black shadow
    walls" report. Screenshot: `/tmp/audit-noon-vibrant.png`.
  - Water at low sun: animated wave-normal ripples + fresnel sky reflection + specular
    glint — the "too realistic" water. Screenshot: `/tmp/audit-water-vibrant.png`.
  - No console errors during a multi-minute session.

## Phase 14 — Vanilla Visual Baseline
- **Intended scope:** Promote vertex AO + smooth face lighting and texel-stabilized block
  shadows to an always-on base-renderer guarantee independent of the Vibrant toggle; request
  drawing-buffer AA; redefine Vibrant as an enhancement layer (ACES, bloom, reflective water,
  halo, cloud shadows) over that baseline.
- **Files touched:** `Game.ts` (`applyVisuals`, renderer flags), `Sky.ts` (hemisphere light,
  shadow map, legacy scaling), `main.ts` (`antialias: true`), `ChunkRenderer.ts`, docs.
- **Current behavior:** Shadows + AO are on in both profiles; AA is on; Vibrant adds ACES +
  bloom + water material + halo + cloud shadows.
- **Confirmed working:** AA requested; AO bakes correctly; shadow map renders; toggle recompiles
  materials; build is clean.
- **Confirmed issues:**
  1. **Black-crushed shadows (HIGH).** `Sky.ts` runs directional sun at intensity 2.2 against a
     hemisphere ambient of only 0.55 at noon. The shadow map is `THREE.BasicShadowMap` (binary:
     a shadowed fragment loses **100%** of the directional term). The baked vertex color already
     multiplies face-brightness (0.5–1.0) by AO (0.4–1.0); lighting multiplies again. Net: a
     shadowed or sun-averted face keeps only `~0.55 × faceShade × AO`, then ACES compresses the
     low end further → effectively black. This is the root cause of the user complaint.
  2. **Tone mapping choice (MEDIUM).** `ACESFilmicToneMapping` is contrasty and desaturating —
     the opposite of the pastel, soft target look. It deepens the crush.
- **Required fixes:** add an ambient/sky-light floor; make shadows non-binary (reduced
  `shadow.intensity` + soft PCF); switch Vibrant tone mapping to a gentler curve; expose all of
  it as named tunable constants. (Step 3.)
- **Risk level:** Medium — lighting touches every surface, but changes are parameter/-material
  level, not architectural.

## Phase 15 — Unified Clouds, Underwater Rendering & View Distance
- **Intended scope:** single face-culled cloud mesh; water visible from below + blue underwater
  fog/clear color while submerged; Vibrant default OFF; render distance 2–16 default 12.
- **Files touched:** `Clouds.ts`, `Sky.ts` (`setUnderwater`, `viewColor`), `Game.ts` (camera-in-
  water detection, `UnderwaterOverlay`), `Settings.ts`, `OptionsMenu.ts`.
- **Current behavior:** Underwater detection samples the block at the camera eye and applies the
  biome fog color + short fog; `UnderwaterOverlay` adds a color wash; surfacing restores sky fog.
  Render distance default 12, slider max 16, stream budget scales 2→4.
- **Confirmed working:** build clean; underwater path present in both profiles; distance scaling
  present.
- **Suspected issues:** underwater detection uses a single eye-block sample (acceptable);
  `viewColor` vs `skyColor` split is sound. None confirmed broken.
- **Required fixes:** none functional. Underwater fog color constants will be revisited only so
  the new water tint stays consistent.
- **Risk level:** Low.

## Phase 16 — Seamless Sand & Temperate Foliage
- **Intended scope:** inset atlas UVs half a texel to kill sand grid seams; add code-generated
  cutout foliage (grass/fern/bush/flowers); deterministic foliage only over exposed grass; render
  as crossed double-sided quads in a dedicated alpha-tested material; non-solid, self-correcting.
- **Files touched:** `TextureAtlas.ts` (UV inset + `pixelOrigin`), `Foliage.ts`,
  `BiomeTexturePainters.ts`, `ChunkMesher.ts` (`addPlant`), `ChunkRenderer.ts` (`foliageMat`).
- **Current behavior:** foliage is derived at mesh time from a column hash, emitted as two crossed
  quads with explicit front/back triangles and top-biased (`0,1,0`) normals so vertical planes
  don't go black; not stored as blocks.
- **Confirmed working:** logic is deterministic and self-correcting by construction; normals are
  top-biased (good — avoids the black-plant problem); UV inset addresses seams.
- **Suspected issues:** foliage `castShadow` + alpha-tested shadows can look noisy under hard
  shadows; will improve automatically once shadows are softened in Step 3. Not a logic bug.
- **Required fixes:** none functional.
- **Risk level:** Low.

## Phase 17 — Overworld Biomes & Biome Water
- **Intended scope:** deterministic biome registry + broad climate sampler (8 land + 3 ocean);
  biome surfaces/trees/cactus/foliage; biome grass/leaf/water tint in the mesh; exact Java 26.1.2
  water/fog RGB; F3 biome readout.
- **Files touched:** `Biome.ts` (new), `TerrainGenerator.ts` (climate + biome selection + surface
  + features), `ChunkMesher.ts` (grass/leaf/water vertex tint), `Game.ts` (biome fog + F3).
- **Current behavior:** `climateAt` = two warped low-frequency simplex fields (temperature,
  humidity) at wavelength 720. `landBiomeAt` thresholds temperature first, then humidity.
  `biomeAt` overlays ocean variants below sea level. Surfaces: snow / sand / grass; **beaches
  (`height ≤ SEA_LEVEL+1`) force sand on every non-swamp coast.**
- **Confirmed working / NOT broken:** Measured over a 2400×2400-block grid (90,601 samples):
  **incompatible land adjacencies are exactly 0** — `desert|snowy_plains`, `desert|taiga`,
  `desert|frozen_ocean`, `savanna|snowy_plains`, `savanna|taiga` all count **0**. Because
  temperature is one smooth field, hot and frozen biomes are necessarily separated by
  taiga/plains/savanna transition bands. Biome IDs/heights are deterministic per coordinate.
- **Confirmed issues:**
  1. **Cold-coast sand beaches (HIGH — this is the real "sand beside snow").** The same scan
     found **1524 grid edges where a `sand` surface sits directly against a `snow` surface.**
     These are *not* desert↔snow biome borders (those are 0); they are **beaches and ocean
     floors**, whose surface is hard-coded to sand regardless of temperature, so a Snowy-Plains
     or Frozen-Ocean shore shows bare sand pressed against snow. This matches the user's report.
  2. **No continentalness/erosion/weirdness inputs (LOW/spec-gap).** The spec (Section 7) asks
     for these climate fields and a nearest-profile selector. The current temperature/humidity
     system is already a smooth climate system and already yields coherent regions, so a full
     multi-noise rewrite is not required to fix the reported bug — see Fix Plan + DECISIONS.
- **Required fixes:** gate beach/shore surface by effective temperature (cold shores stay
  snow/keep a frozen-beach treatment; only temperate/warm shores get sand); add a coast/inland
  (continentalness) signal and the requested F3 climate readout + `validateBiomeAdjacency` debug.
- **Risk level:** Medium (touches surface selection in terrain gen; deterministic and testable).

## Cross-Cutting Issues
- **Rendering:** black crush (Phase 14) is the dominant defect; ACES too contrasty for the goal.
- **Water:** over-realistic phong waves/fresnel/glint (Phase 13/14) vs the required vanilla look.
- **Lighting:** ambient floor too low; binary shadows; no shared tunable lighting profile module.
- **Terrain:** sound and continuous across biome borders (no seams observed).
- **Biomes:** land selection coherent; only the coastal sand surface rule is wrong.
- **Performance:** ≥ 55 FPS headless; not a concern. Shadow softening adds negligible cost.
- **Memory/resource lifecycle:** `Game.dispose` releases composer passes, shadow map, materials,
  meshes; restarts looked clean in prior phases. No new leaks introduced.
- **Input/raycast/block interaction:** DDA raycast in `BlockInteraction.ts` was **not** modified
  by Phases 14–17 (those phases are rendering/worldgen). The user's "ray casting is messed up"
  refers to the *lighting/shadow* path (binary shadow → black), not the block-interaction DDA.
  To be verified explicitly in Step 5.
- **Type safety:** TS strict build passes; no `any`-laden additions seen.
- **File-size violations:** all touched files are < 400 lines (`Game.ts` is the largest at 399).

## Fix Plan
1. **Step 2 — Stabilize:** build already green; no blocking bug to fix. Record and proceed.
2. **Step 3 — Lighting (`fix-rendering: rebalance vibrant visuals lighting`):** add
   `LightingProfile.ts` with named day/sunset/night ambient floors + `SHADOW_INTENSITY`;
   raise hemisphere ambient, lower directional, set `sunLight.shadow.intensity` so shadows are
   soft and never remove all light; switch Vibrant tone mapping ACES → a gentler curve
   (Neutral/AgX) with tuned exposure; keep classic mode flat. Verify morning/noon/sunset/night.
3. **Step 4 — Water (`fix-rendering: restore vanilla-style water`):** replace the realistic
   `WaterMaterial` with a restrained vanilla water (atlas water tile, semi-transparent, biome
   vertex tint, gentle scroll only); use it in both modes; keep exact biome water RGB in vertex
   colors so the Phase-17 contract holds.
4. **Step 5 — Ray/shadow (`fix-rendering: correct shadow and ray behavior`):** confirm DDA reach=5
   + face normal + placement intact; confirm the softened shadow path no longer crushes.
5. **Step 6 — Biomes (`fix-worldgen: add climate-based biome source`):** add effective-temperature
   beach gating (no sand against snow), a continentalness signal for coast coherence, keep the
   coherent temp/humidity regions; document the targeted-vs-rewrite decision.
6. **Step 7 — Validation (`qa-worldgen: validate biome transitions`):** F3 climate readout +
   `validateBiomeAdjacency`; tune scales; multi-seed scan confirms 0 incompatible adjacencies and
   0 snow/sand touches.
7. **Step 8 — QA (`qa: verify visuals and biome generation`):** build/dev, multi-seed free-fly,
   classic+vibrant, regressions (phase 4/9/14/15/16/17), update DECISIONS/README.

## Acceptance Checklist
- [x] Build passes (`tsc` clean, `vite build` ok)
- [x] Dev server runs (HTTP 200, no blocking console errors)
- [x] Existing gameplay still works (phase-4 physics, phase-5 interaction, phase-9 lifecycle pass)
- [x] Vibrant Visuals no longer crushes shadows to black (noon near-black 54% → ~1%; soft shadows)
- [x] Water remains vanilla-style (blocky atlas tile, semi-transparent, biome-tinted; realistic
      WaterMaterial removed)
- [x] Biomes transition coherently (0 incompatible adjacencies, 0 sand|snow touches over 5 seeds)
- [x] No obvious chunk seams (phase-3 terrain streaming passes; height continuous across borders)
- [x] No console errors after extended play (phase-10 soak; see Step 8 QA)

## Outcome (2026-06-13)
All fixes implemented as targeted changes — no working system was rewritten
wholesale (justified in DECISIONS.md). Commits: `audit` → `fix-rendering`
(lighting) → `fix-rendering` (water) → `fix-worldgen` (climate/beaches) →
`qa-worldgen` (validation/F3) → `qa` (final). Required regressions
(phase 4/5/9/14/15/16/17) all pass; phase-13 retired (superseded contract).
