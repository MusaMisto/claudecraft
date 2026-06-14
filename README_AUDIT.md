# README Audit

## Baseline

- Date: 2026-06-14
- Branch: `mobs`
- Commit: `f6946c214d69f714841c968c4bc810a62350c556`
- Node version: `v26.3.0`
- npm version: `11.16.0`
- npm install result: Pass. Dependencies were already current, 0 vulnerabilities.
  npm reported an informational pending install-script approval for optional
  `fsevents`.
- npm run build result: Pass. TypeScript and Vite completed successfully. Vite
  reported the existing advisory that the main JavaScript chunk exceeds 500 kB.
- npm run dev result: Pass at `http://127.0.0.1:5173/`. A six-second headless
  Brave run rendered the live menu panorama with no console errors or warnings.
- npm run lint result: No lint script is configured.
- npm run test result: At baseline, the configured script was a placeholder
  that exited with `Error: no test specified`; it was removed during this pass.
  Executable browser checks remain under `scripts/`.

## Current README

- Current sections: Project introduction, Running, Player skins, Controls,
  What's inside, Third-Party Assets, and Project docs.
- Missing sections: Overview, screenshot gallery, prerequisites, explicit tech
  stack, concise project structure, development command table, project
  status/roadmap, contribution guidance, license, and a standalone disclaimer.
- Outdated claims: The single screenshot path does not represent the current
  menu and feature set well. The project-doc list is incomplete, and the README
  does not mention the MIT project license. `package.json` reports ISC while the
  repository `LICENSE` is MIT.
- Bland/weak areas: The opening has no centered hero treatment or clear
  hierarchy. The long "What's inside" list is accurate but dense, mixing
  gameplay, rendering internals, implementation constants, and recent polish
  details without scan-friendly grouping.
- Broken links: No broken links found among the files currently linked.
- Missing screenshots: No main-menu gallery image, cinematic terrain image,
  water/biome image, passive-mob image, or structure image under a stable
  `docs/screenshots/` path.
- Missing credits: Faithful and Pixelify Sans are credited, but the README could
  link more clearly to `CREDITS.md`, the Faithful license, and the Pixelify Sans
  OFL file. Project-provided logo, favicon, and default skin ownership should be
  described without implying that every asset is generated at runtime.
- Missing license information: The MIT `LICENSE` file exists but is not
  documented in the README. Package metadata is inconsistent.
- Missing contribution guidance: `CONTRIBUTING.md` is absent.

## Verified Project Facts

- Game title: Claudecraft.
- Tech stack: TypeScript 6, Vite 8, Three.js 0.184, `simplex-noise`, HTML/CSS
  overlays, Canvas textures, and the Web Audio API.
- Main features implemented:
  - Single-player browser creative-mode voxel gameplay.
  - Fixed 20 Hz simulation, first-person movement, sprinting, sneaking,
    swimming, and creative flight.
  - Instant block breaking and placement with a fixed nine-slot hotbar.
  - Deterministic procedural terrain using continentalness, erosion,
    weirdness, temperature, and humidity fields.
  - Eleven biome IDs: Plains, Forest, Birch Forest, Taiga, Snowy Plains,
    Desert, Savanna, Swamp, Ocean, Warm Ocean, and Frozen Ocean.
  - Trees, cactus, flowers, grasses, biome tinting, animated water, underwater
    rendering, a 20-minute day/night cycle, sun, moon, stars, and 3D clouds.
  - Optional Vibrant Visuals rendering and optional Faithful 64x textures,
    both disabled by default.
  - Passive cows, pigs, sheep, and chickens with deterministic spawning,
    lightweight behavior, climate variants, and synthesized calls.
  - Ten generated structure types, including villages, temples, ruins,
    watchtowers, shrines, obelisks, archives, cairns, and ancient gates.
  - Cloudwright environmental lore through etched stones and structures.
  - Custom main menu, settings, pause UI, live world panorama, username field,
    3D player preview, and 64x64 PNG skin upload/persistence.
  - Procedurally synthesized music, footsteps, block sounds, water audio, UI
    sounds, and animal calls.
- Controls implemented:
  - Mouse look with pointer lock.
  - `W`, `A`, `S`, `D` movement.
  - `Space` jump; double-tap `Space` toggles flight.
  - `Space`/`Shift` move vertically while flying.
  - `Shift` sneaks while grounded.
  - `Ctrl` or double-tap `W` sprints.
  - Left click breaks; right click places or reads an etched lore stone.
  - `1`-`9` and mouse wheel select hotbar slots.
  - `F3` toggles the debug overlay.
  - `Esc` releases pointer lock and opens the pause menu.
- Package scripts:
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
  - `npm run check:structures`
  - `npm run soak:structures`
  - `npm test` exists only as a failing placeholder.
- Asset folders:
  - `docs/` contains the logo, favicon, default skin, and one legacy screenshot.
  - `src/assets/fonts/` contains Pixelify Sans and its SIL OFL license.
  - `texturepack/Faithful 64x - Release 13/` contains the local resource pack.
  - `THIRD_PARTY_LICENSES/` contains the bundled Faithful license.
- Texture pack integration: Selected Faithful block, foliage, water, and passive
  mob textures are loaded from a static Vite manifest and remain opt-in. The
  original procedural textures are the default and the fallback.
- Passive mobs: Cow, pig, sheep, and chicken systems are implemented.
- Structures: Ten deterministic, biome-aware, cross-chunk structure types are
  registered and browser-tested.
- Skin upload: Implemented for classic-arm 64x64 PNG skins with validation and
  local persistence.
- Audio: Implemented with runtime Web Audio synthesis; no prerecorded game
  audio is bundled.
- Menu UI: Implemented with a live panorama, custom logo, Play and Settings
  actions, editable username, player preview, and skin upload.

## Features Not Verified

- Claims to avoid:
  - Multiplayer or network play.
  - Survival mode, health, hunger, combat, crafting, or a full inventory.
  - World save/load or persistent terrain edits.
  - Minecraft world, mod, resource-pack, or protocol compatibility.
  - Official affiliation with Minecraft, Mojang, Microsoft, or Faithful.
  - A hosted demo, release downloads, CI status, or coverage metrics.
  - `F1`, `F2`, or cinematic-camera controls; these are not implemented.
- Planned features only for roadmap:
  - The repository has no committed future roadmap. Potential directions should
    be labeled as non-committed ideas rather than promised features.
  - A larger Cloudheart Ruin was explicitly deferred in `DECISIONS.md`.
  - Persistence, survival systems, and multiplayer remain out of scope for the
    current build.

## Screenshot Plan

- Main menu screenshot: Capture the live panorama, custom logo, Play/Settings
  buttons, username, player preview, and Upload Skin action at 1600x900.
- Cinematic world screenshot 1: Capture a bright sunrise or early-day panorama
  with varied terrain, sky, clouds, and water.
- Cinematic world screenshot 2: Capture long-distance terrain/biome depth with
  foliage and atmospheric lighting.
- Structure screenshot: Locate and frame a deterministic generated landmark,
  preferably a village, temple, watchtower, obelisk, or ancient gate.
- Passive mobs screenshot: Frame multiple passive animals on natural terrain.
- Water/terrain screenshot: Capture a shoreline or lake showing animated water,
  beaches/underwater terrain, and a biome transition.
- Screenshot paths:
  - `docs/screenshots/main-menu.png`
  - `docs/screenshots/world-sunrise.png`
  - `docs/screenshots/world-terrain.png`
  - `docs/screenshots/water-and-biomes.png`
  - `docs/screenshots/passive-mobs.png`
  - `docs/screenshots/structures.png`

## Repository Health Files

- LICENSE: Present, MIT. Inconsistent with the ISC value in `package.json`.
- CREDITS.md: Present and detailed for Faithful assets and Pixelify Sans.
- CONTRIBUTING.md: Missing.
- CODE_OF_CONDUCT.md: Missing. Do not add without maintainer confirmation.
- SECURITY.md: Missing. A useful policy requires a private reporting channel;
  do not invent contact information.
- docs folder: Present, but no `docs/screenshots/` gallery or capture notes.

## Proposed README Structure

1. Hero: logo, concise tagline, factual technology badges, main-menu screenshot.
2. Overview and current project status.
3. Screenshot gallery.
4. Features.
5. Quick Start.
6. Controls.
7. Gameplay Systems.
8. Tech Stack.
9. Project Structure.
10. Development commands and browser checks.
11. Current Limitations and Future Directions.
12. Credits and Third-Party Assets.
13. Contributing.
14. License and Disclaimer.

## Risks

- Inaccurate feature claims: The original plan contains superseded scope and
  defaults, so current code and recent decisions must take precedence.
- Missing screenshots: Real captures require deterministic camera placement and
  sufficient time for chunk streaming and mob spawning.
- Large image files: Six unoptimized 1600x900 PNGs could add several megabytes.
  Captures should be compressed with available system tools without reducing
  clarity.
- Broken badges: Use only static badges for technologies actually present. Do
  not add CI, coverage, release, download, or deployment badges.
- Missing license: A project license exists, but package metadata must be aligned
  with MIT before documenting it as authoritative.
- Faithful attribution: Keep the website link, Version 3 license link,
  non-monetization constraint, selected-file specificity, and opt-in behavior.
- Minecraft/Mojang disclaimer: State clearly that Claudecraft is independent and
  is not approved by or associated with Mojang, Microsoft, or Faithful.

## Acceptance Checklist

- [x] README rewritten
- [x] Screenshots added
- [x] Screenshots render in Markdown
- [x] Commands verified
- [x] Features verified
- [x] Faithful attribution present
- [x] License status accurate
- [x] No broken links
- [x] Build still passes

## Final Outcome

- Final branch: `mobs`
- Documentation commits:
  - `b834d08` - `audit: review readme and documentation`
  - `0e93c29` - `docs: prepare screenshot gallery structure`
  - `abebd85` - `docs: add game screenshots`
  - `43c26c1` - `docs: rewrite project readme`
  - `5e9201f` - `docs: improve repository health docs`
- README: Rewritten with a centered hero, factual badges, real screenshot
  gallery, overview, features, quick start, controls, gameplay systems, stack,
  project structure, development commands, project status, troubleshooting,
  credits, contribution guidance, license, and disclaimer.
- Screenshots: Six direct 1600x900 game captures are present under
  `docs/screenshots/`. The gallery includes the main menu, sunrise, terrain,
  warm-ocean water, passive mobs, and an Ancient Gate.
- Screenshot tooling: `scripts/capture-readme-screenshots.mjs` reproduces the
  gallery with the existing `puppeteer-core` dependency and a deterministic
  game seed.
- Repository health: `CONTRIBUTING.md` was added; `CREDITS.md` was corrected;
  package description and license metadata now match the project and MIT
  `LICENSE`; the intentionally failing placeholder test script was removed.
- Policies intentionally not added: No Code of Conduct was selected without
  maintainer confirmation. No `SECURITY.md` was created without a private
  reporting channel.
- Final QA:
  - `npm install --package-lock-only`: Pass, 0 vulnerabilities.
  - `npm run build`: Pass; only the existing Vite chunk-size advisory remains.
  - `node scripts/browser-check.mjs`: Pass, no console warnings or errors.
  - `node scripts/structure-check.mjs http://127.0.0.1:5173/`: Pass across five
    seeds with no placement, cross-chunk, or runtime failures.
  - `node scripts/passive-mobs-check.mjs`: Pass across three seeds with all four
    species, valid spawning, variants, audio, lifecycle, and performance checks.
  - Documentation link and image-path validation: Pass.
  - Screenshot metadata: All six gallery PNGs are 1600x900 RGB images.
