# UI, Skin, and Menu Audit

## Baseline
- Date: 2026-06-13
- Branch: test-gpt
- Commit: ceeac19 (qa: verify terrain water and biome polish)
- Node version: v26.3.0 / npm 11.16.0
- npm install result: already installed (node_modules present)
- npm run build result: **PASS** — `tsc` clean, `vite build` emits dist (JS 622 kB, CSS 3 kB, 51 modules). Only the >500 kB chunk-size advisory (pre-existing, three.js).
- npm run dev result: not re-run for the audit; dev server is the existing Vite config (see DECISIONS — colon-in-path workarounds).
- Browser/runtime observations: existing game boots to a code-drawn "CLAUDECRAFT" wordmark over a live rotating panorama; Singleplayer/Options buttons; pause menu on Esc; first-person arm+block viewmodel bottom-right.

## Current Menu Architecture
- Main menu files: `src/ui/MainMenu.ts` (201 lines) — owns a `Panorama` (own scene/world/ChunkRenderer/Sky/Clouds rendered through the shared `WebGLRenderer`), a code-drawn pixel wordmark (`drawWordmark` + `GLYPHS`), rotating splash text, and a vertical button column (`Singleplayer`, `Options`).
- Pause menu files: `src/ui/PauseMenu.ts` (54 lines) — centered `.menu-panel`, title `Game Paused`, buttons `Back to Game`, `Options`, `Quit to Title`.
- Options/settings files: `src/ui/OptionsMenu.ts` (117 lines), `src/settings/Settings.ts` (19 lines, in-memory only — no persistence layer).
- HUD files: `src/ui/Hud.ts` (105 lines) — crosshair + 9-slot hotbar, isometric block icons drawn from the atlas canvas.
- CSS files: `src/ui/styles.css` (237 lines) — `#main-menu/#pause-menu/#options-menu` overlays, `.mc-button`, `.logo`, `.splash`, `.menu-panel`, `.option-row`.
- Asset loading approach: **everything is generated in code** today. No image/file imports anywhere. `index.html` loads `/src/main.ts`; favicon is an inline SVG data URI. There is no `public/` directory. `docs/` holds `claudecraft-logo.png` (2172×724 RGBA) and `screenshot.png`; **`docs/skin.png` does not exist yet** (user will add it).
- Menu background approach: `Panorama` reuses engine modules at render distance 4 with a slowly advancing yaw + world time; drawn directly to the shared renderer each `frame()` before the HTML overlay.

## Current Logo Usage
- Current logo implementation: `drawWordmark('CLAUDECRAFT')` in `MainMenu.ts` paints a 5×7 bitmap font to a canvas, appended with class `.logo` (CSS `image-rendering: pixelated`, drop-shadow filter).
- Where it appears: main menu only.
- Replacement path: `docs/claudecraft-logo.png`.
- Risks: PNG is large (2172×724, 1.2 MB) — must be displayed scaled-down with `image-rendering` left at auto (it is a hi-res raster, not pixel art) to avoid blur; the code-drawn wordmark + `GLYPHS` table become dead code to remove.

## Current Player Rendering
- Player model exists: **No full humanoid model.** Only a first-person right arm exists.
- First-person hand exists: **Yes** — `src/rendering/HeldBlock.ts` (194 lines). A `BoxGeometry(0.25, 0.75, 0.25)` arm with a code-generated 16×16 skin-tone `CanvasTexture` (uniform noise, no UV layout), plus the held block at vanilla `firstperson_righthand` pose (scale 0.4, 45° yaw). Rendered as an overlay pass after the world (`render()` clears depth only).
- Current model files: `HeldBlock.ts` only.
- Current material/texture approach: `MeshBasicMaterial` with `vertexColors` for per-face shade; arm uses its own `CanvasTexture` (`buildArmTexture`). Block uses the shared block atlas texture.
- Missing pieces: no skinned humanoid; no 64×64 skin UV layout; arm texture is procedural noise, not a Minecraft-format skin; no menu player preview; no shared skin texture between menu and in-game.

## Current Skin Support
- Default skin support: none (procedural arm noise only).
- Upload support: none.
- Texture validation: none.
- Persistence: none (Settings is in-memory).
- UV mapping: none for skins; block UVs use a half-texel-inset atlas rect helper (`TextureAtlas.uvRect`).
- Missing pieces: everything — SkinManager, default-skin load, 64×64 validation, NearestFilter skin texture, UV rects for head/body/arms/legs base+overlay, persistence.

## Required UI Changes
- Main menu layout: keep panorama background; replace code wordmark with `docs/claudecraft-logo.png` centered near top; keep `Play` (renamed from Singleplayer for the reference feel) and `Settings` (renamed from Options) as the centered button stack; add a right-side 3D player preview with an `Upload Skin` button beneath it.
- Pause menu layout: restyle panel/buttons to match the new visual language; preserve all three actions.
- Removed sections: Marketplace, Sign In, bottle icon, Dressing Room (none of these exist today, so this is "do not add").
- Added sections: right-side player preview, Upload Skin button, hidden file input, transient skin status/error message.
- Responsive behavior: logo `width: min(56vw, 720px)`; preview anchored right with a width clamp; on narrow widths the preview must not overlap the centered buttons — use viewport-relative positioning and a min-width guard.

## Implementation Risks
- Asset path serving: no `public/`. Use `new URL('../../docs/xxx.png', import.meta.url)` so Vite copies/rewrites at build. The logo exists → bundled fine. `docs/skin.png` is missing → Vite leaves an unresolved runtime URL (warns, does not fail build); the `Image.onerror` path must produce a generated fallback. Verify build does not error with the missing file.
- Vite import behavior: confirm `new URL(...import.meta.url)` resolves in both dev (served from project root) and build (hashed asset copy).
- Texture filtering: skin textures MUST use `NearestFilter` mag+min, `generateMipmaps=false`, correct `flipY`. The skin UV rects below assume `flipY = false` to match the rest of the renderer (atlas uses `flipY=false`).
- UV accuracy: must inset by a small epsilon to avoid bleeding between adjacent skin regions at NearestFilter on a 64-px texture; map Three.js BoxGeometry face vertex order carefully (per-face winding) or build geometry manually.
- CSS scaling: hi-res logo must scale down without blur (`image-rendering:auto`), preserve aspect (`height:auto`).
- WebGL resource cleanup: the menu preview adds a second `THREE.Scene` rendered through the shared renderer (no new context). Dispose preview geometries/materials on menu dispose; the **shared skin texture is owned by SkinManager** and must NOT be disposed by the preview or the hand — only by SkinManager when replaced.
- File upload validation: check MIME (`image/png`) + `.png` extension fallback, decode via `Image`/`createImageBitmap`, assert exactly 64×64, handle decode errors. No crash on any input.
- Browser storage limits: a 64×64 PNG data URL is tiny (≈ few KB) — `localStorage` is safe for persistence.

## Fix Plan
1. **Assets** — add `src/assets/assets.ts` resolving `logoUrl` and `defaultSkinUrl` via `new URL(..., import.meta.url)`; verify build with the missing skin.
2. **SkinManager** — `src/player/SkinManager.ts`: load default skin (or generated fallback), validate uploads (64×64 PNG), build NearestFilter texture, persist to localStorage, subscribe/notify listeners, dispose old textures.
3. **Skin UVs + model** — `src/rendering/SkinUv.ts` (rect→UV helper + canonical 64×64 base/overlay rects, classic 4px arms) and `src/rendering/PlayerModel.ts` (cuboid head/body/arms/legs + inflated overlays from a shared skin texture).
4. **Player preview** — `src/ui/PlayerPreview.ts`: small Three.js scene with the PlayerModel, idle rotation, rendered through the shared renderer into the menu's right-side region.
5. **Main menu redesign** — swap logo, rename buttons to Play/Settings, mount preview + Upload Skin, wire file picker + status messages; CSS for new layout.
6. **First-person hand** — rebuild the `HeldBlock` arm to use the shared skin texture + right-arm UVs (base + sleeve overlay), subscribe to SkinManager.
7. **Pause menu restyle** — shared button/panel styling pass.
8. **QA + docs** — build, dev verify at the four resolutions, valid/invalid uploads, transitions; update DECISIONS.md + README.md.

## Acceptance Checklist
- [ ] Build passes
- [ ] Dev server runs
- [ ] Custom logo appears on main menu
- [ ] Main menu resembles provided Bedrock-style reference without banned sections
- [ ] Pause menu is redesigned consistently
- [ ] Default skin loads from docs/skin.png
- [ ] Upload Skin accepts valid 64x64 PNG skins
- [ ] Upload Skin rejects invalid files cleanly
- [ ] Player preview renders selected skin
- [ ] First-person hand renders selected skin
- [ ] Skin persists across menu/game transitions
- [ ] No console errors after repeated menu/game transitions
