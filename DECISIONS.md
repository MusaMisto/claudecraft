# Claudecraft — Decisions & Deviations

## 2026-06-12 — `EventBus.ts` exists but is unused

The Section 6 layout includes a tiny event bus. In practice plain callback
properties (`onPauseRequested`, `onClose`, …) covered every cross-module
signal, so nothing was routed through the bus. The module is kept because the
spec's file layout lists it, but no code depends on it.

## 2026-06-12 — `window`-exposed debug hooks kept after Phase 10 cleanup

`Game.debugHooks()` and `window.app` expose the running session to the
headless acceptance scripts in `scripts/`. They are required to re-run the
phase verifications, cost nothing at runtime, and are documented here instead
of being removed with the temporary debug scenes.

## 2026-06-12 — Colon in repository path breaks npm/Vite defaults

The repo lives under `…/Side:Fun Projects/claudecraft`. The `:` is the PATH
delimiter, so npm cannot prepend `node_modules/.bin` to PATH for run-scripts,
and Vite's `server.fs` allow-list path matching rejects the project root.

**Workarounds (no behavior change for a fresh clone in a normal path):**
- `package.json` scripts call binaries by explicit path (`./node_modules/.bin/vite`).
- `vite.config.ts` sets `server.fs.strict = false` (dev server only).

## 2026-06-12 — Added `src/Game.ts` to the Section 6 layout

`main.ts` is the menu → game lifecycle bootstrap per the spec; the running
world session itself (scene, player, HUD, audio hooks, dispose) lives in a
dedicated `Game.ts` class so `main.ts` stays small and a session can be torn
down cleanly on "Quit to Title". This is an addition to the file layout, not
a behavioral deviation.

## 2026-06-12 — Dev-only dependency: `puppeteer-core`

Added `puppeteer-core` as a devDependency, plus `scripts/browser-check.mjs`,
to satisfy the workflow rule that each phase's acceptance criteria be verified
by running the game in a real browser. It drives the locally installed Brave
(Chromium) headlessly to capture console errors, FPS, and screenshots. It is
not part of the game build and ships no assets.

## 2026-06-13 — Water physics uses the classic (pre-1.13) Minecraft model

Phase 12's "behave exactly as in Minecraft" water request is implemented with
the classic per-tick fluid model (drag ×0.8, gravity 0.02, jump impulse 0.04,
climb-out boost 0.3), as documented for beta-era Java Edition. Modern 1.13+
"sprint-swimming" (horizontal swim pose, fluid push vectors) is out of scope;
the classic model matches this game's era and delivers the requested
sink / bob / float / swim behavior with exact emergent speeds.

## 2026-06-13 — First-person arm is visible while holding a block

Vanilla Minecraft hides the arm when a block occupies the hand (the block
alone is drawn). The user explicitly asked for the arm to be visible with the
item on it, so Claudecraft draws a code-generated boxy right arm beneath the
0.4-scale block. The block's scale/pose matches the vanilla
`firstperson_righthand` transform; the visible arm is a deliberate deviation.

## 2026-06-13 — Vibrant Visuals is re-derived for a forward renderer, not ported

Mojang's Vibrant Visuals (researched at minecraft.wiki/w/Vibrant_Visuals) is
a deferred HDR pipeline. Recreating it verbatim architecturally (deferred
lighting, screen-space reflections, Henyey-Greenstein volumetric fog, TAAU,
per-biome color grading, MERS material maps) is out of proportion for a
forward three.js voxel engine with one biome, so each feature is replaced by
the cheapest technique that produces the same on-screen result:
- **SSR water reflections → fresnel sky-color reflection + Blinn-Phong sun
  glint** (Cook-Torrance stand-in) + animated procedural normal map.
- **Volumetric fog/light shafts → additive sun-halo sprite + bloom** around
  the sun; uniform scene fog keyframed warmer at sunset.
- **Mojang's custom filmic tone curve → ACESFilmicToneMapping**, the closest
  built-in filmic curve.
- **TAAU → MSAA ×4** on the composer's render target (no temporal history
  needed at our geometry density).
- **Depth-based AO approximation → classic voxel per-vertex AO** baked at
  mesh time (sharper and cheaper for cube worlds; it is also what Java
  Edition's smooth lighting does).
- **Subsurface scattering on leaves and auto-exposure: omitted** — minimal
  visual payoff here vs. a custom shading model; can be revisited.
The HDR atmosphere, bloom, enhanced water, halo, and cloud shadows ship
behind a Vibrant Visuals toggle (default on). Phase 14 promotes the vanilla
shading essentials out of that toggle.

## 2026-06-13 — Vertex AO stays on even with Vibrant Visuals off

Vanilla Java Minecraft has "smooth lighting" independent of Vibrant Visuals,
so the AO bake is treated as a base-engine improvement, not part of the
toggle. Phase 14 extends that base profile with the explicitly requested hard
block shadows and drawing-buffer anti-aliasing.

## 2026-06-13 — Vanilla baseline is rendering-technique faithful, not a shader copy

"Exactly like Minecraft" is interpreted as matching the recognizable vanilla
voxel cues while preserving the repository's originality rule. Claudecraft
does not copy Mojang textures, shaders, source code, palettes, or assets.
Classic per-vertex AO represents vanilla smooth lighting. Real-time
sun/moon-cast block shadows are not a literal vanilla Java rendering feature,
but the user requested shadows explicitly, so the existing hard
`BasicShadowMap` implementation is retained as a deliberate enhancement.

The baseline/enhancement boundary is:
- Always on in gameplay: voxel AO, directional face shading, hard block/leaf
  shadows, and drawing-buffer anti-aliasing.
- Vibrant-only: ACES, bloom/composer output, animated reflective water, sun
  halo, stronger lighting contrast, and cloud shadow casting.

WebGL context anti-aliasing is requested in `main.ts` because context
attributes cannot be changed after creation. The Vibrant world pass retains
its separate MSAA ×4 HalfFloat render target.

## 2026-06-13 — Post-processing passes require explicit disposal

`EffectComposer.dispose()` releases its ping-pong targets but does not dispose
the passes added to it. The Phase-9 five-restart check exposed an 11-texture
increase per restart from `UnrealBloomPass`. `Game.dispose()` now explicitly
disposes the bloom and output passes before disposing the composer; texture
counts remain flat across repeated sessions.

## 2026-06-13 — Clouds use a face-culled union mesh

Cloud occupancy is still sampled on the specified 12×12 m noise grid, but
each occupied cell is no longer an independent transparent box. `Clouds.ts`
builds one indexed mesh and omits every vertical face whose neighboring cell
is also occupied. This removes the overlapping internal transparency that
made continuous cloud masses look segmented while preserving their blocky
silhouette. Top and bottom faces remain per cell but are coplanar in one mesh,
so they render as a continuous surface without internal walls.

The field radius increased from 18 to 24 cells so clouds cover the horizon at
the new 16-chunk maximum view distance.

## 2026-06-13 — Underwater appearance is based on camera-eye immersion

Phase-12 `player.inWater` intentionally uses a deflated hitbox for physics and
is false during creative flight, so it is not the correct rendering signal.
Phase 15 samples the block containing the rendered camera eye instead.

Both water materials are double-sided so the surface is visible from below.
While the eye is underwater, the scene uses short blue fog, a matching clear
color, and a final transparent blue screen wash. The wash is rendered after
both the direct and HDR paths so nearby bright water cannot cancel the
underwater tint. Surfacing restores the live time-of-day sky and distance fog
in the same frame; water physics are unchanged.

## 2026-06-13 — Render distance 16 remains progressively streamed

The maximum render distance is 16 chunks and the default is 12. The existing
square Chebyshev radius is retained for behavioral compatibility, so the
largest setting can contain 1,089 visible chunk positions. Data generation
and mesh construction remain frame-budgeted; the stream budget scales from
2 to at most 4 chunks per frame with the selected distance. This fills the
larger radius quickly without a synchronous startup stall.

## 2026-06-13 — Atlas render UVs use texel centers

Block faces previously mapped to exact atlas tile boundaries. Even with
nearest filtering and mipmaps disabled, rasterization at those boundaries
could select an adjacent or unused atlas texel, producing dark outlines around
otherwise face-culled sand blocks.

Every render `UvRect` is now inset by half an atlas texel. HUD icons retain a
separate integer `pixelOrigin()` API, so canvas copies still read the full
16×16 source tile. The fix applies consistently to terrain, particles, and the
held block without changing the generated art.

## 2026-06-13 — Foliage is derived decoration, not block storage

Minecraft Java 26.1 (released March 24, 2026) is the current release. Its new
Golden Dandelion is crafted and player-placed rather than natural ground
cover. The latest broad foliage expansion remains Java 1.21.5 "Spring to
Life", which added Bushes and Wildflowers alongside biome-specific Firefly
Bushes, Leaf Litter, Dry Grass, and Cactus Flowers.

Claudecraft adapts the natural temperate subset suitable for its one
grass/beach terrain type: short/tall grass, fern, bush, four familiar flower
silhouettes, and wildflower clusters. Desert-only, swamp-specific, flat litter,
and crafted-only plants are omitted until matching biomes or placement systems
exist. All pixel art and palettes are original code-generated assets.

Plants are selected deterministically from the world seed during meshing and
are not stored as `BlockId`s. This keeps them non-solid and non-targetable,
preserves the fixed hotbar, and makes edits self-correcting: the decoration is
absent whenever its support is no longer grass or its air cell is occupied.
Each plant emits explicit front/back triangles for two crossed planes with
top-biased normals, avoiding dark back faces while retaining Lambert daylight
and alpha-tested shadows.

## 2026-06-13 — Biomes approximate Minecraft climate; water values are exact

Phase 17 supersedes the original single-biome world with eight representative
land biomes and three ocean variants. Mojang's full Overworld generator uses
far more inputs and routing than this compact browser engine can reasonably
mirror, so Claudecraft uses broad seeded temperature/humidity fields plus
smooth climate-dependent relief. Biome identity selects surfaces, vegetation,
and decoration, while terrain height remains continuous across borders.

The numeric reference is the official stable Minecraft Java 26.1.2 release
published April 9, 2026. Values were read from the biome JSON inside Mojang's
official server jar linked by the release article:
- Normal water `#3F76E4`; inherited Overworld underwater fog `#050533`.
- Swamp water `#617B64`, fog `#232317`, fog-distance multiplier `0.85`.
- Warm Ocean water `#43D5EE`, fog `#041F33`.
- Frozen Ocean water `#3938C9`, with inherited fog `#050533`.

Grass and foliage palettes, procedural block textures, biome boundaries,
terrain shapes, and feature layouts are original Claudecraft work. No Mojang
textures, shaders, source code, or other assets are included. Water vertices
average nearby biome samples to avoid square color seams, and camera fog uses
the current biome's registered color in both visual profiles.
