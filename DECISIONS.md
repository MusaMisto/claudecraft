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

## 2026-06-13 — Vibrant Visuals rebalanced for readability; water returned to vanilla

A review of the user's Phases 14–17 found the Vibrant path crushed non-sun-facing
surfaces to black (~54% of a noon frame below luma 12) and rendered water as a
realistic phong/wave-normal/fresnel/glint surface. Both are corrected:

**Lighting (clean-room, not Mojang code).** New `LightingProfile.ts` holds named
tunables. The model now guarantees a daytime readability floor:
- A uniform `AmbientLight` floor (normal-independent) is added beneath the
  hemisphere sky/ground fill, so even fully sun-averted faces keep light.
- Shadows are non-binary: `PCFSoftShadowMap` + `DirectionalLight.shadow.intensity
  = 0.55`, so shadowed faces keep 45% of direct light (soft depth, never black).
- Light intensities derive from the sun's elevation (smooth night→sunset→day
  blend) rather than fixed values, removing transition popping.
- Vibrant tone mapping changed ACES Filmic → `NeutralToneMapping`, which preserves
  saturation and does not crush darks — matching the soft, pastel reference look.
Measured: noon near-black dropped 54% → ~1%, shadow ratio ~0.88 (depth, readable),
night still dark but playable.

**Water.** The realistic `WaterMaterial` (animated wave normal map, fresnel sky
reflection, Blinn-Phong sun glint) was removed. Water is now one restrained vanilla
material in BOTH profiles: the blocky procedural water atlas tile, semi-transparent
(opacity 0.72), double-sided, tinted per-vertex by the biome water color (so the
exact Java 26.1.2 RGB values still live in the geometry vertex colors). Vibrant now
enhances only the surrounding atmosphere (tone mapping, bloom, halo, cloud shadows,
fog), not the water surface itself. This keeps water readable, pixel-consistent, and
unlike a realistic shader, per the user's directive.

`scripts/phase13-check.mjs` (which asserted the retired ACES + glint-water contract)
was removed; `phase14-check` now encodes the current pipeline contract
(NeutralToneMapping, soft shadow ratio 0.45..0.92). Phases 15 and 17 read the single
unified water material. The Vibrant toggle remains cosmetic only — it changes no
collision, reach, tick rate, terrain, or placement behavior.


---

## 2026-06-13 — Terrain, water, biome & audio polish pass

A targeted pass driven by screenshot feedback (harsh biome cutoffs, inland sand
with no water, gloomy/generic water, no water sounds). See
`TERRAIN_WATER_BIOME_POLISH_AUDIT.md` for the baseline audit. Notable decisions:

**Inland sand fixed at the rule level.** Beaches were placed by elevation alone
(`height <= SEA_LEVEL + 1`), so any dry column near sea level became sand even
far from water. Beaches now require real water adjacency (`isNearWater`, radius
4) and only apply to dry shoreline columns (1–2 blocks above the waterline).
Desert sand and genuine underwater beds are unaffected.

**Biome transition dither.** Terrain height was already continuous across biomes
(relief is driven by smooth climate fields, not per-biome branches). The
remaining hard edge was the surface-material line, so a medium-frequency dither
(`BIOME_TRANSITION_NOISE_SCALE = 42`, amplitude `0.16`) is added to biome
*identity only* (not height) to fray grass↔sand / forest↔plains borders over a
few blocks. Amplitude stays well below the threshold gaps, so extreme biomes
still never touch.

**Gravel added; hotbar left at 9.** New `BlockId.Gravel` with an original
procedural pebble-cluster texture and a stone sound. The hotbar is a fixed
9-slot bar keyed 1–9; per the spec's fallback, Gravel is added to the registry
and world generation but NOT the default hotbar (it would need a hotbar/CSS
expansion out of scope here). Gravel is encountered on lake/ocean/river beds.

**Underwater beds vary.** Submerged columns get coherent sand/dirt/gravel blobs
from a low-frequency floor noise (~26-block patches): shallow shores stay sandy,
deeper basins expose dirt and gravel. Sub-soil follows the bed material.

**Animated water via atlas-tile repaint.** Rather than a separate material or
per-frame remesh, the water atlas tile is repainted on a fixed tick cadence
(`WATER_FRAME_TICKS = 3`, ≈6.7 Hz) with drifting sinusoids + a moving ripple
crest, then `texture.needsUpdate` re-uploads the 128² atlas once. Zero chunk
rebuilds; the tile keeps the static mean color so per-biome tint/opacity are
unchanged. Stays blocky and vanilla — no wave normals/fresnel (consistent with
the 2026-06-13 water decision above).

**Water SFX.** New `WaterSfx` synthesizes an entry splash (loudness scaled by
descent speed), a softer exit, distance-paced swim strokes, and a low looped
submerged ambience — all on the `sfxGain` bus, so they follow the SFX slider.
`Game.tick` edge-detects water state and head submersion; ambience stops on
pause and on world teardown.

**Terrain & water-body variety.** `continentalness`/`erosion`/`weirdness` were
sampled but unused in `height()`; they now drive generation. Base elevation
follows a continentalness spline (deep ocean ~38 → shelf → coast → inland
plateau), relief amplitude is modulated by erosion (rugged↔flat) and calmed on
the sea floor, and occasional inland ridges come from extreme weirdness + low
erosion (peaks ~98–111). Measured across seeds: ~31–42% ocean, oceans 20–25
deep, zero biome-adjacency warnings. This is an intentional change to a core
function (justified: bathymetry/variety is impossible without it); biome
identity logic is untouched so climate coherence is preserved. Spawn now spirals
outward from the origin for dry land, since the origin can fall in deep ocean.

**Sky vibrancy unchanged.** The gloom complaint was already addressed by the
earlier 2026-06-13 lighting rebalance (warm keyframes, ambient readability
floor, Neutral tone mapping). Per "don't rewrite working systems," the lighting
was left as-is and re-verified visually this pass rather than re-tuned.

---

## 2026-06-13 — Menu, logo, player skin & first-person hand pass

A targeted pass (see `UI_SKIN_MENU_AUDIT.md` for the baseline) redesigning the
main and pause menus, integrating the user's custom logo, and adding a
Minecraft-Java-style 64×64 skin system rendered on a menu player preview and the
in-game first-person hand. Decisions:

**Custom logo replaces the code-drawn wordmark.** `docs/claudecraft-logo.png`
(2172×724) is now the title logo (`MainMenu` `<img>`). The old `drawWordmark`
bitmap-font code was removed. Because the file is a hi-res raster (not pixel
art), the logo uses `image-rendering: auto` and `width: min(56vw, 720px)` to
scale down crisply without blur; the wordmark is the only Mojang-free showpiece
changed.

**Assets resolved via `new URL(..., import.meta.url)`** (`src/assets/assets.ts`).
This makes Vite hash + copy the files into `dist` and serve them from the
project root in dev, without moving the user's `docs/` assets or adding a
`public/` dir. The logo exists and bundles normally. `docs/skin.png` is
user-supplied and currently absent, so Vite leaves an unresolved runtime URL and
prints one build warning ("…doesn't exist at build time…"); the build still
passes and the SkinManager falls back gracefully. The warning will disappear
once the user adds the file. The warning was intentionally NOT suppressed with
`/* @vite-ignore */`, because suppressing it would also stop Vite from bundling
the skin once it is added.

**Default-skin fallback is a generated clothed character.** `SkinManager` loads
`docs/skin.png` as the default. If it is missing, undecodable, or not exactly
64×64, it logs a non-blocking `console.warn` and uses a code-generated 64×64
skin (original palette: tan skin, brown hair + simple face, teal shirt, blue
legs) painted into the standard base-layer regions, so the menu still shows an
intentional character. No crash on any of these paths.

**Skin format: 64×64 PNG only, classic 4px arms.** Uploads are validated for
PNG (MIME or `.png`), decodability, and exact 64×64 dimensions, with explicit UI
messages for each failure ("Please upload a 64×64 PNG skin.", "This image is
W×H…", "Could not read this PNG file."). Legacy 64×32, slim 3px arms, HD/128²,
capes, and armor are out of scope. The UV tables (`SkinUv.ts`) and `SkinState`
carry a `modelType` field and are grouped per-part so a parallel slim table can
be added later without touching the box builder; auto-detection was deliberately
not added now because it is not reliable enough (per the spec's "only if
reliable" guidance), and the model is classic-first.

**Skin textures:** `NearestFilter` (mag+min), `generateMipmaps = false`,
`flipY = false`, `SRGBColorSpace` — matching the block atlas convention so the
`SkinUv` rectangles (origin top-left, v measured from the top) map correctly. UV
rects are inset 0.01 px to stop nearest sampling from bleeding between adjacent
skin regions while preserving every texel (a 0.5px atlas-style inset would erase
a quarter of a 4px arm face).

**One shared skin texture, owned by `SkinManager`.** The menu preview
(`PlayerPreview` + `PlayerModel`) and the first-person hand (`HeldBlock`) both
subscribe and swap their material `map` to the same texture object on change.
`SkinManager.apply` notifies listeners *before* disposing the previous texture,
so renderers never reference a freed texture; preview/hand never dispose the
shared texture themselves.

**Player preview shares the renderer, no new WebGL context.** `PlayerPreview`
renders its own small scene into a scissored viewport aligned to the menu's
`.preview-stage` element (read via `getBoundingClientRect` each frame), then
restores the full-frame viewport so the next panorama frame fills the screen.
It uses `MeshLambertMaterial` + its own hemisphere/directional lights for a
bright, evenly-lit character.

**First-person arm now samples the real skin.** The old uniform skin-tone noise
arm was replaced by a boxy right arm using the classic right-arm base + sleeve
overlay UVs on the shared skin texture (`MeshBasicMaterial`, unlit overlay
pass). The arm is flipped 180° about Z so the skin-tone wrist grips the block
(top) and the sleeve runs to the screen corner (bottom-right), which is both
more faithful and keeps the phase-12 viewmodel probe's "skin pixels visible
bottom-right" assertion valid now that arm color is skin-dependent. The held
block's 0.4 scale, 45° pose, bob, and click-swing are unchanged. This refines
the earlier "First-person arm is visible while holding a block" decision: the
arm is still a deliberate (non-vanilla) addition, but is now skinned.

**Persistence.** A validated upload is stored in `localStorage`
(`claudecraft.skin.v1`: data URL + name + modelType). On load the persisted
skin is preferred over `docs/skin.png`; storage failures degrade silently (the
selection just won't survive a reload). A 64×64 PNG data URL is a few KB, well
within storage limits.

**Removed Bedrock sections.** No Marketplace, Sign In, bottle/potion icon, or
Dressing Room — the reference's right-side character is kept and its button is
repurposed to **Upload Skin**. Main-menu buttons are **Play** / **Settings**;
the pause and settings panels were restyled to one shared visual language
(titled panel + divider, blocky buttons) and "Options" was renamed "Settings"
for consistency. No gameplay behavior changed.

## 2026-06-13 — Menu polish: pixel font, username, far panorama, favicon

A follow-up polish pass after user feedback:

**Bundled pixel UI font (one deliberate external asset).** The user asked for a
pixel/game font over the previous sans-serif. There is no system pixel font, and
the project's "all assets generated in code" rule covers textures/sounds/music —
not text rendering for arbitrary user input (usernames). So **Pixelify Sans**
(SIL OFL 1.1, variable weight TTF) is bundled at
`src/assets/fonts/PixelifySans.ttf` with its license at `PixelifySans-OFL.txt`,
referenced via `@font-face` and bundled by Vite (no runtime network fetch). It is
the single third-party asset in the project; the README's "all generated in code"
claim is narrowed to the procedural textures/audio accordingly. (An earlier
revision used Press Start 2P, but it read as a cramped near-default pixel face;
Pixelify Sans is a cleaner, more legible pixel font with normal metrics, so the
UI sizes are normal-font-sized.) The F3 debug overlay keeps a monospace font so
its multi-line columns stay aligned.

**Splash tracks the visible wordmark, not the image box.** `docs/claudecraft-logo.png`
has ~26% transparent padding below the glyphs (content bottom at 73.6% of the
image height, right edge at 98%). Anchoring the splash to the image box left it
floating well below the letters. It is now anchored in *percentages* of the logo
box (`right: 2%`, `bottom: 24%`, pivot at the right edge) so it sits just under
the final "T" at every logo size/aspect, like Minecraft's bottom-right splash.

**Username box made compact** (fixed 170px / 85% max width, centred) rather than
spanning the whole player panel.

**Favicon scaling note.** `docs/favicon.png` is the user's 1254² image; browsers
downscale it. Left as-is per "don't modify user assets"; a small 32–64² variant
would load faster but is cosmetic.

**Editable username (default "Claude").** The label above the menu character is
now a text `<input>` (`.username-input`, max 16 chars) instead of the skin name,
defaulting to "Claude" and persisted in `localStorage` (`claudecraft.username`).
It is a menu-side display/identity field; it does not yet appear in-game (no
nametag system) and changes no gameplay. Keydown events are stopped from
propagating so typing never reaches game input.

**Splash repositioned under the wordmark's final "T"** (`right: 4%`,
`bottom: -22px`, rotate −15° about the right edge), matching Minecraft's
bottom-right anchored splash so varying-length quips grow leftward from the T.

**Panorama renders far.** The menu panorama used a 4-chunk radius, so its fog sat
close and made the world look small. It now streams a **12-chunk** radius
(`PANORAMA_CHUNKS`) with a matching Sky fog distance and a slightly larger
per-frame stream/mesh budget. The camera is stationary (only yaw rotates), so the
wider radius fills once over a few seconds and then stays loaded; the extra
chunk meshes are a fixed menu cost (textures stay flat; phase-9 still passes).

## 2026-06-13 — Faithful 64x texture pack integration (third-party asset exception)

Claudecraft intentionally replaces its generated/procedural **block** textures
with selected **Faithful 64x Resource Pack** textures, a deliberate departure
from the "all assets generated in code" rule (which now applies to the
procedural *fallback* textures, foliage cutouts, audio, and UI). The local pack
is committed under `texturepack/Faithful 64x - Release 13/` and read at build
time only — no runtime downloads, no remote fetches.

**Why an exception is allowed.** The Faithful License (Version 3) permits reuse
with credit and a website link, forbids monetization, and requires the
unmodified license file to ship with any distributed content. Claudecraft is a
free, non-monetized open repository, so all conditions are met:
- visible README "Third-Party Assets" credit + `CREDITS.md` listing the exact
  files used,
- link back to https://faithfulpack.net/,
- the unmodified license at `THIRD_PARTY_LICENSES/FAITHFUL_LICENSE.txt`,
- explicit "not official / not associated with Mojang, Microsoft, or Faithful"
  disclaimer.
If the project is ever monetized (paywall, marketplace, monetized downloads),
the Faithful textures must be removed to stay compliant.

**Procedural generator kept as fallback.** `TextureAtlas` still paints every
tile procedurally first; Faithful images overpaint only the slots that load
successfully. A missing/invalid/wrong-size file (or a missing `texturepack/`
folder entirely) leaves that slot procedural, so the game always boots. The
resolver is a **static manifest** of `new URL(...)` entries (only the ~26 used
files are bundled, not all 1,207 in the pack), avoiding both runtime directory
enumeration and shipping the whole pack.

**Atlas refactored 16→64.** Tiles are now 64 px (8×8 grid → 512×512 atlas).
Procedural painters still draw at their native 16 px and are nearest-upscaled
into each slot; Faithful 64×64 images draw at full resolution. `NearestFilter`,
disabled mipmaps, and the existing half-texel UV inset are retained (no bleeding,
crisp pixels). The detected pack root is the nested
`texturepack/Faithful 64x - Release 13/` (folder name has spaces + a hyphen);
the manifest points there directly.

**Grass side uses the modern overlay layout.** Faithful `grass_block_side.png`
is plain dirt; the green fringe is `grass_block_side_overlay.png` (grayscale,
alpha). The `grass_side` slot is composited at load (dirt + overlay tinted with
the Plains grass color), and the mesher now tints only the grass **top** face
with the per-biome grass color (the side carries its own baked green so the dirt
isn't greened). This also improves the procedural path (its side no longer gets
double-greened). Per-biome side tinting is sacrificed (baked Plains green);
tops still tint per biome.

**Faithful animated water.** `water_still.png` is 64×2048 (32 frames,
`frametime 2`). The existing tick-paced `animateWater` mechanism is reused to
blit the next Faithful frame into the water slot (one small atlas re-upload, no
remesh), keeping the material's `opacity 0.72` and per-vertex biome water tint.
If Faithful water isn't loaded, the procedural ripple animation runs instead.

**Foliage uses Faithful too (procedural fallback kept).** The crossed-quad
plants now map to Faithful's plant cutouts: `short_grass`, `tall_grass`
(`tall_grass_bottom`), `fern`, `bush`, `dandelion`, `poppy`, `cornflower`,
`oxeye_daisy`, `wildflowers`, `dry_grass` (`short_dry_grass`), `dead_bush`.
Faithful's grass/fern/bush cutouts are grayscale, so they get the same baked
base green as the leaves and keep the per-vertex biome foliage tint; flowers and
dry/dead plants carry their own color and are now drawn **untinted** (matching
Minecraft, where flowers ignore biome coloring — previously every plant got the
pale foliage tint). As with blocks, a missing/invalid plant file leaves that
tile procedural.

## 2026-06-13 — Faithful passive mob textures

We extended the Faithful 64x texture-pack integration to passive mob/entity
textures for cows, pigs, sheep, and chickens where available. Cow, pig, and
chicken use the pack's adult temperate, warm, and cold variants; sheep uses its
base and tintable wool textures.

Procedural fallback textures remain available for missing or invalid entity
textures. The animal models, UV assembly, animation, AI, physics, spawning, and
sounds are clean-room Claudecraft code; no Mojang model, source, or audio asset
is copied.

Faithful license obligations remain handled through README attribution,
`CREDITS.md`, and included unmodified license text. The project remains
non-monetized; if that changes, the Faithful textures must be removed or
separately approved before distribution.

## 2026-06-14 — Faithful texture pack is opt-in

The `Faithful 64x Pack` Settings toggle defaults off, leaving Claudecraft's
procedural block, foliage, water, hotbar, and passive-mob textures active.
Faithful assets still decode in the background so enabling the toggle is
instant. Both texture sources repaint the existing shared canvas textures in
place, so loaded chunks, held blocks, menu panorama, hotbar icons, and existing
mobs update without remeshing or entity recreation. Disabling the toggle
restores the original procedural pixels and procedural water animation.

## 2026-06-14 — Procedural texture shading and exact clear sky

Claudecraft's original 16×16 textures now receive a deterministic,
material-aware shading pass after painting. It derives relief from each tile's
own luminance edges, adds broad clustered highlights and shadows, and bevels
transparent foliage edges. Wood and masonry receive stronger relief than soft
ground materials. Glass and animated water are excluded, and Faithful textures
are overpainted afterward, so the pass never modifies third-party art.

The clear daytime sky and above-water fog use `#78A7FF`, the exact
`minecraft:visual/sky_color` value in the official Minecraft Java 1.21.11
Plains biome data. Claudecraft's existing sunrise, sunset, dusk, night, cloud,
lighting, and weather-independent interpolation remain original rather than
copying Minecraft rendering code or assets.

## 2026-06-14 — Environment-lit hand, view bobbing, and responsive menus

The first-person block and skin arm now use Lambert materials in their separate
overlay scene. Each frame, `Sky` copies its live ambient floor, hemisphere
fill, sun/moon color, intensity, and direction into that scene. The direction
is transformed into camera space, so the held model follows both time-of-day
brightness and the current viewing direction without joining the world depth
buffer. A five-column sky-exposure probe attenuates direct and hemisphere light
beneath roofs, foliage, and cave ceilings, approximating the world shadow the
overlay cannot receive directly while retaining the ambient readability floor.

View bobbing uses horizontal distance traveled as its phase and a damped
grounded movement amplitude. The camera applies the Minecraft-style sequence
of lateral/vertical translation, Z roll, and X pitch. Its Java 1.21.11 values
are exact: distance scale `0.6`, amplitude cap `0.1`, easing `0.4`, translation
multipliers `0.5`/`1.0`, rotation multipliers `3°`/`5°`, and pitch phase offset
`0.2`. Sprinting cycles faster but does not exceed the same amplitude cap.
Flying, swimming, airborne movement, and standing still smoothly reduce the
amplitude to zero. Targeting remains based on the player's unbobbed look
direction, keeping the movement visual.

Settings and pause overlays remain mounted but inert while closed. Visibility,
panel scale/slide, and staggered Settings rows animate through CSS classes;
buttons use a short pressed translation and brightness response. A
`prefers-reduced-motion` rule removes meaningful transition time for users who
request it.

## 2026-06-13 — Passive mobs use deterministic chunk populations and local AI

**Minimal entity framework.** Passive mobs run through `EntityManager` on the
existing fixed 20 Hz tick and interpolate their transforms for rendering.
`PassiveMobSystem` owns spawning, shared render resources, procedural animal
audio, and cleanup so the game session still tears down as one unit.

**No persistence yet.** World saves do not exist, so animal populations are
derived from `world seed + chunk coordinate`. A chunk is evaluated once while
active and becomes eligible again after leaving the despawn radius. This avoids
remesh-driven duplication while recreating a similar population when the
player returns. Caps are 60 total, 35 within 64 blocks, and 4 per origin chunk.
The nearby cap is enforced again after physics so animals walking across the
64-block boundary cannot briefly exceed it.

**Loaded terrain takes precedence over despawn distance.** The nominal passive
despawn radius remains `renderDistance + 2`, but streamed block data extends
only to `renderDistance + 1`. A mob whose current chunk is no longer loaded is
removed before its physics tick, preventing unloaded columns from reading as
air and making the mob fall out of the world during fast player traversal.

**Spawn validation is stricter than movement.** Animals originate only on
loaded natural Grass or Snow columns with clear body space and safe neighboring
height changes. Water, leaves, glass, trees, cactus, sand, occupied space, and
steep drops are rejected. Once alive, animals may walk onto ordinary solid
terrain such as shoreline sand; that is movement, not an invalid spawn.

**Lightweight local behavior instead of pathfinding.** Each animal uses
idle/look/wander/swim/stuck states, short forward hazard probes, smooth yaw
turning, and the shared one-block step solver. There is no A*, herd simulation,
breeding, combat, drops, or persistence. This keeps 30–60 browser entities
cheap while preserving the requested passive sandbox feel.

**Faithful layouts are sampled through general cuboid UVs.** The models are
original Claudecraft proportions assembled from cuboids. A general unfolded-box
UV helper maps their parts into Faithful's adult entity sheets; no Mojang model
file or source code is used. Eleven required local textures validate in-browser.
Generated canvas textures remain live underneath so missing or invalid files
fall back without remeshing or a startup failure.

**Animal voices remain original synthesis.** Cow, sheep, pig, and chicken calls
use separate oscillator/noise/filter envelopes through the existing SFX bus.
Per-mob randomized cooldowns, a 36-block attenuation radius, stereo pan, a
four-voice concurrency cap, and global call spacing prevent audio spam.

**Lifecycle regression sampling.** The menu panorama progressively uploads
chunk geometry after returning to title, which can make delayed global
`renderer.info.memory.geometries` samples look like a game-session leak.
Phase 15 now captures memory synchronously after game disposal, before panorama
streaming resumes; the subsequent menu-resume value remains reported
separately.

## 2026-06-14 — Deterministic structures and Cloudwright environmental lore

**Structures are queried per chunk, not emitted from an origin chunk.** Each
structure type owns a seeded region grid. A region candidate is derived from
`world seed + structure id + region coordinate`, validated through the existing
world-space terrain/biome APIs, and represented by an immutable placement and
bounding box. When a chunk generates, it independently queries every placement
whose box overlaps that chunk and applies only its local blocks. This makes
cross-chunk structures independent of load order and avoids deferred neighbor
writes or requiring adjacent chunks to exist.

**Structures run after the existing vegetation pass.** Moving trees and foliage
into a new global feature pipeline would be a broad rewrite. Instead, structure
blocks use explicit replacement rules (`air_or_vegetation`, `natural`,
`foundation`, `path`, `never_water`, and `clear`) to remove only occupied
vegetation and terrain. Foundations fill per column, paths follow the queried
surface height, and only coastal pier pieces opt into replacing water.

**One original decorative block was added.** `BlockId.EtchedStone` uses a
procedural stone-and-line texture and the existing cube mesh and stone sound.
It is not added to the fixed nine-slot hotbar. Structure coordinates do not
need a separate metadata store: right-click text is selected deterministically
from the tablet's world coordinates, so lore remains stable across regeneration.

**Lore interaction intercepts right-click.** Targeting an etched stone shows one
short fading fragment and consumes the click; every other block keeps the
existing placement behavior. The Cloudwright story stays environmental through
four-stone motifs, glass sky-current accents, wells, hidden rooms, obelisks,
archives, and broken gates rather than dialogue or quest systems.

**Large content is intentionally bounded.** The rare Ancient Gate supplies the
large landmark for this pass. A still larger Cloudheart Ruin was deferred
because it would substantially increase blueprint size and visual QA scope
without adding a new architectural capability.

**Worldgen caches are bounded and disposable.** Region decisions are capped at
20,000 entries and generated block blueprints at 1,024. Oldest entries are
evicted and recomputed from the seed if revisited. The ten-minute 3,300-block
route used 15,551 placement entries and 532 blueprints before these caps, so
normal exploration stays below the limits while theoretically infinite travel
cannot create an unbounded retained-data leak.

## 2026-06-14 - Repository documentation and metadata alignment

The public README now uses reproducible in-game screenshots captured through the
existing headless-browser tooling. Captures use a deterministic seed and may set
camera position, time of day, visual profile, and texture-pack state, but they
are direct frames from the running game rather than mockups or composites.

The root `LICENSE` has always been MIT, while `package.json` incorrectly retained
the scaffolded ISC value. Package metadata now matches the authoritative MIT
license, and the placeholder `npm test` command was removed because it always
failed without running a test suite. Browser acceptance scripts remain under
`scripts/`, with supported commands documented in the README and contribution
guide.

`CONTRIBUTING.md` was added for public contribution expectations. A Code of
Conduct was not selected on the maintainer's behalf, and `SECURITY.md` was not
added without a private reporting address or an established vulnerability
reporting channel.
