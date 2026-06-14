# Faithful Texture Pack Integration Audit

## Baseline
- Date: 2026-06-13
- Branch: `textures`
- Commit: `590e42d`
- Node version: v26.3.0
- npm install result: dependencies already present (`node_modules/` populated).
- npm run build result: **passes** (`tsc` + `vite build`, 56 modules, no errors). The
  pre-existing "chunk > 500 kB" advisory and the large favicon/logo PNGs are
  unrelated to this work.
- npm run dev result: not run for the baseline; the headless `scripts/` checks and
  a manual dev session are used for QA after implementation.
- Browser/runtime observations: existing game renders procedural 16×16 block
  textures packed into a 128×128 atlas with `NearestFilter`.

## Texture Pack Discovery
- Expected folder: `texturepack/`
- Detected pack root: **`texturepack/Faithful 64x - Release 13/`** (one nested root
  folder, with spaces and a hyphen, sits between `texturepack/` and `assets/`).
- pack.mcmeta found: **yes** — `{ "pack": { "description": "The go-to 64x texture
  pack for Minecraft. By HARYA_ and many others.", "min_format": 79, "max_format":
  100 } }`.
- `assets/minecraft/textures/block` found: **yes** — 1,207 PNGs.
- Faithful license file found: **yes** — `texturepack/Faithful 64x - Release
  13/LICENSE.txt` (FAITHFUL LICENSE Version 3, 20 Feb 2023).
- Faithful 64x detected: **yes** — sampled block PNGs are 64×64
  (`grass_block_top`, `dirt`, `stone`, `oak_log`, `glass`, `ice`, `snow`, …).
- Nested root detected: **yes** — see detected pack root above. Resolved by
  pointing the manifest paths at the `Faithful 64x - Release 13/` subfolder.

### Animated source notes
- `water_still.png` is **64×2048** (32 vertical 64×64 frames); `water_still.png.mcmeta`
  declares `frametime: 2`.
- `grass_block_side_overlay.png` is 64×64 (grayscale-tintable green fringe; the
  modern layout where `grass_block_side.png` is plain dirt).
- `oak_leaves.png` (and other leaves) ship a `.mcmeta` but are still single 64×64
  frames (the mcmeta only marks them tickable/tinted); used as static cutouts.

## License Compliance
- License: **Faithful License Version 3**. Permits using the textures provided
  (1) clear credit in an appropriate place, (2) a link back to
  https://faithfulpack.net/, (3) honest specificity about what is used, (4) **no
  monetization** of content containing the work (no paywall/marketplace/monetized
  download links; donations OK), (5) no implying the project is official, and (6)
  the **unmodified** LICENSE file is bundled with any distributed content.
- Faithful credit added: **planned** — README "Third-Party Assets" section +
  `CREDITS.md`.
- Faithful website link added: **planned** — https://faithfulpack.net/ in both.
- Faithful license file included: **planned** —
  `THIRD_PARTY_LICENSES/FAITHFUL_LICENSE.txt` copied verbatim from the pack.
- Monetization risk checked: **none**. The project `package.json` is `license:
  "ISC"`, has no payment/marketplace/paywall code, and is a free open repo. No
  monetization → compliant. (If the project is ever monetized, Faithful textures
  must be removed; recorded in DECISIONS.md.)
- Official/endorsement confusion avoided: **yes** — credit text states Claudecraft
  is not official and not associated with Mojang/Microsoft/Faithful.
- Required docs changed: `README.md`, `CREDITS.md`, `DECISIONS.md`,
  `THIRD_PARTY_LICENSES/FAITHFUL_LICENSE.txt`, this audit.

## Current Texture Pipeline
- Current texture atlas file: `src/rendering/TextureAtlas.ts`.
- Current procedural texture generator: per-tile `Painter` functions in the same
  file (+ `src/rendering/BiomeTexturePainters.ts`).
- Current tile size: **16 px**; atlas is an 8×8 grid → 128×128 px canvas texture.
- Current block registry: `src/world/Block.ts` (`BlockId` enum + `BlockDef` with
  per-face `TileName`s).
- Current block face mapping: `faces: { top, bottom, side }` per block, each a
  `TileName` key resolved to a `UvRect` via `atlas.uvRect(name)`.
- Current material system: `src/rendering/ChunkRenderer.ts` — `MeshLambertMaterial`
  for opaque (`vertexColors`), transparent (`transparent`, `alphaTest 0.08`),
  foliage (`alphaTest 0.45`, `FrontSide`), water (`transparent`, `opacity 0.72`,
  `DoubleSide`). All share `atlas.texture`.
- Current transparent pass: leaves/glass/ice in the transparent material; water in
  its own material; foliage in its own alpha-cutout material.
- Current water texture handling: a procedural `water` tile repainted on a tick
  cadence by `TextureAtlas.animateWater(frame)` (one ~128² re-upload, no remesh).
  Biome water color is applied per-vertex in the mesher; opacity from the material.

## Current Blocks
| BlockId | Name | top / bottom / side tile keys | transparent | leafy |
|---|---|---|---|---|
| Grass | Grass | grass_top / dirt / grass_side | no | |
| Dirt | Dirt | dirt / dirt / dirt | no | |
| Stone | Stone | stone | no | |
| Cobblestone | Cobblestone | cobblestone | no | |
| Planks | Oak Planks | planks | no | |
| Log | Oak Log | log_top / log_top / log_side | no | |
| Leaves | Leaves | leaves | yes | yes |
| Sand | Sand | sand | no | |
| Gravel | Gravel | gravel | no | |
| Glass | Glass | glass | yes | |
| Water | Water | water | yes | |
| Snow | Snow | snow | no | |
| Ice | Ice | ice | yes | |
| Cactus | Cactus | cactus_top / cactus_top / cactus_side | no | |
| BirchLog | Birch Log | birch_log_top / · / birch_log_side | no | |
| BirchLeaves | Birch Leaves | birch_leaves | yes | yes |
| SpruceLog | Spruce Log | spruce_log_top / · / spruce_log_side | no | |
| SpruceLeaves | Spruce Leaves | spruce_leaves | yes | yes |
| AcaciaLog | Acacia Log | acacia_log_top / · / acacia_log_side | no | |
| AcaciaLeaves | Acacia Leaves | acacia_leaves | yes | yes |

Foliage tiles (derived decoration, not blocks): short_grass, tall_grass, fern,
bush, dandelion, poppy, cornflower, oxeye_daisy, wildflowers, dry_grass, dead_bush.

## Faithful Mapping Plan
Block-face tile key → Faithful `block/<file>.png`. "Exists?" verified against the
detected pack root. Fallback is always the existing procedural painter for that
tile key (kept and used if the file is missing/invalid).

| Tile key | Face usage | Faithful candidate | Exists? | Fallback |
|---|---|---|---|---|
| grass_top | Grass top | grass_block_top.png | yes | procedural grass_top |
| grass_side | Grass side | grass_block_side.png + grass_block_side_overlay.png (composited) | yes | procedural grass_side |
| dirt | Dirt/Grass bottom | dirt.png | yes | procedural dirt |
| stone | Stone | stone.png | yes | procedural stone |
| cobblestone | Cobblestone | cobblestone.png | yes | procedural cobblestone |
| planks | Oak Planks | oak_planks.png | yes | procedural planks |
| log_side | Oak Log side | oak_log.png | yes | procedural log_side |
| log_top | Oak Log top/bottom | oak_log_top.png | yes | procedural log_top |
| leaves | Leaves | oak_leaves.png | yes | procedural leaves |
| sand | Sand | sand.png | yes | procedural sand |
| gravel | Gravel | gravel.png | yes | procedural gravel |
| glass | Glass | glass.png | yes | procedural glass |
| water | Water | water_still.png (32 × 64×64 frames, animated) | yes | procedural water |
| snow | Snow | snow.png | yes | procedural snow |
| ice | Ice | ice.png | yes | procedural ice |
| cactus_side | Cactus side | cactus_side.png | yes | procedural cactus_side |
| cactus_top | Cactus top/bottom | cactus_top.png | yes | procedural cactus_top |
| birch_log_side | Birch Log side | birch_log.png | yes | procedural |
| birch_log_top | Birch Log top | birch_log_top.png | yes | procedural |
| birch_leaves | Birch Leaves | birch_leaves.png | yes | procedural |
| spruce_log_side | Spruce Log side | spruce_log.png | yes | procedural |
| spruce_log_top | Spruce Log top | spruce_log_top.png | yes | procedural |
| spruce_leaves | Spruce Leaves | spruce_leaves.png | yes | procedural |
| acacia_log_side | Acacia Log side | acacia_log.png | yes | procedural |
| acacia_log_top | Acacia Log top | acacia_log_top.png | yes | procedural |
| acacia_leaves | Acacia Leaves | acacia_leaves.png | yes | procedural |

Foliage/plant cutouts are also mapped to Faithful (added after the initial
block pass): short_grass→`short_grass`, tall_grass→`tall_grass_bottom`,
fern→`fern`, bush→`bush`, dandelion→`dandelion`, poppy→`poppy`,
cornflower→`cornflower`, oxeye_daisy→`oxeye_daisy`, wildflowers→`wildflowers`,
dry_grass→`short_dry_grass`, dead_bush→`dead_bush`. Grass/fern/bush are grayscale
(baked green + biome-tinted); flowers and dry/dead plants keep their own color
untinted. Each falls back to its procedural painter if the file is missing.
Total mapped textures: **37** (26 blocks + 11 plants).

## Missing Textures
- Missing Faithful files: none of the mapped block faces are missing — all 26 tile
  keys above resolve to existing 64×64 PNGs.
- Blocks using procedural fallback: none required at integration time (all mapped
  faces exist). Fallback remains wired so any future missing file degrades safely.
- Tiles intentionally left procedural: none. All 11 foliage tiles are now mapped
  to Faithful (see the Faithful Mapping Plan note), each with a procedural
  fallback.

## Risks
- Vite asset loading: nested root folder name contains spaces and a hyphen
  (`Faithful 64x - Release 13`). Mitigation: a **static manifest** of explicit
  `new URL('…/<file>.png', import.meta.url)` entries (only the ~26 used files are
  bundled, not all 1,207). Verified the build copies/serves them.
- Dynamic folder enumeration: avoided — no runtime directory listing; build-time
  manifest only.
- Atlas size: tile size 16 → 64; 8×8 grid → 512×512 atlas. Power-of-two, small.
- Texture bleeding: keep `NearestFilter` + mipmaps off + the existing half-texel
  UV inset (already prevents sand seams); inset recomputed for the 512² atlas.
- Transparency: leaves (alpha-cutout holes), glass (alpha), water (opacity) — all
  preserved by the existing materials; Faithful PNGs already carry matching alpha.
- Animated water: reuse `animateWater` to blit the next Faithful 64×64 frame into
  the water slot on the existing tick cadence (no remesh), falling back to the
  procedural ripple if Faithful water isn't loaded.
- Memory usage: 512×512 RGBA atlas ≈ 1 MB GPU; ~26 decoded source images freed
  after the atlas is painted (water keeps its frame strip for animation).
- Build output size: only mapped files are bundled (~26 small PNGs + the water
  strip), not the whole pack.
- License compliance: handled in Step 2 before any texture is shown.

## Fix Plan
1. **Docs/license first** — README + CREDITS + DECISIONS + bundled
   `THIRD_PARTY_LICENSES/FAITHFUL_LICENSE.txt`.
2. **Resolver/loader** — `src/rendering/FaithfulTextures.ts`: static manifest
   (`TileName → URL`), async `loadFaithfulTextures()` returning decoded 64×64
   images + water frame strip, with per-file validation, fallback, and a single
   dev-only summary log.
3. **Atlas to 64x** — `TextureAtlas` tile size 64; procedural base painted at 16
   and nearest-upscaled into each slot; Faithful images overpaint mapped slots;
   grass side composited (dirt + tinted overlay); `animateWater` uses Faithful
   frames when present. Update `Particles` (sub-tile sample = TILE/4) and confirm
   `Hud` icon copy still uses `TILE`.
4. **Mesher tint** — tint only the grass **top** face with the biome grass color
   (side carries its baked green so dirt isn't greened); improves both modes.
5. **Wire + QA** — load Faithful in `main.ts` (non-blocking; procedural shows until
   images decode, then overpaint + `needsUpdate`); build, dev session, fallback
   test by temporarily renaming `texturepack`.

## Acceptance Checklist
- [x] License requirements satisfied — README + CREDITS + bundled unmodified
  `THIRD_PARTY_LICENSES/FAITHFUL_LICENSE.txt` + DECISIONS entry; not monetized.
- [x] Build passes — `npm run build` (tsc + vite), 57 modules, no errors. Only
  the ~26 used files are bundled (small ones inlined, `water_still` emitted) —
  the full 1,207-file pack is not pulled in.
- [x] Dev server runs — `npm run dev`, loaded headlessly in Brave.
- [x] Faithful grass renders correctly — green top + dirt side with green fringe
  (composited overlay); top biome-tinted, side not greened.
- [x] Faithful dirt renders correctly.
- [x] Faithful stone / cobblestone / sand render correctly.
- [x] Faithful oak textures render correctly (planks/log/leaves; logs use
  side vs. top mapping).
- [x] Faithful leaves transparency works (alpha-cutout); glass + ice + water use
  the existing transparent/double-sided materials (alpha preserved by the
  clear-before-overpaint in the atlas repaint path).
- [x] Missing textures fallback safely — hiding `texturepack/` → "0 loaded, 26
  missing", game still boots at 120 FPS with no console errors (procedural).
- [x] No texture bleeding — `NearestFilter`, mipmaps off, half-texel UV inset on
  the 512² atlas.
- [x] No console errors after a play session — headless boot + world start +
  movement: 0 errors/warnings, 120 FPS.

QA harness: `scripts/faithful-check.mjs` (asserts the load summary + clean
console against the running dev server).
