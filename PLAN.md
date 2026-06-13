# Claudecraft — Plan (Spec Sections 3–7)

## 3. Project Specification

**Claudecraft** is a single-player, creative-mode voxel game running entirely in the browser. Feature scope:

- **Main menu**: Minecraft-style title screen with the "CLAUDECRAFT" logo, an animated 3D panorama background (a slowly rotating camera inside a generated world), background music, and buttons: *Singleplayer* (starts a new world), *Options*, and a rotating yellow "splash text" with original quips.
- **Options screen** (reachable from main menu and pause menu): music volume, SFX volume, mouse sensitivity, FOV (30–110, default 70), render distance (2–10 chunks, default 6).
- **Gameplay**: first-person creative mode. No inventory screen. A fixed **9-slot hotbar** with predefined blocks. The player can walk, sprint, jump, toggle creative flight, break blocks instantly, and place blocks.
- **World**: procedurally generated terrain (rolling hills built from a layered noise heightmap), water at sea level, optional simple trees (stretch goal).
- **Environment**: a 20-minute day/night cycle with sun, moon, stars, dynamic sky color and lighting; procedural **3D clouds** drifting across the sky.
- **Audio**: looping ambient background music (menu + in-game), footstep sounds that vary by block material, block break and place sounds. All synthesized via the Web Audio API.
- **HUD**: center crosshair, hotbar with selected-slot highlight and block icons, targeted-block wireframe outline, pause menu on Esc.

Out of scope (do not build): multiplayer, survival mechanics, health/hunger, mobs, inventory screen, crafting, saving/loading worlds, biomes beyond the single terrain type.

## 4. Non-Negotiable Minecraft-Faithful Constants

The simulation runs on a **fixed 20 Hz tick** (like Minecraft), with rendering interpolated between ticks. 1 block = 1 meter = 1 Three.js world unit.

| Property | Value |
|---|---|
| Simulation tick rate | 20 ticks/second (fixed timestep, accumulator pattern) |
| Block dimensions | 1 × 1 × 1 m |
| Player hitbox | 0.6 × 0.6 m footprint, 1.8 m tall |
| Player eye height | 1.62 m |
| Walking speed (steady state) | 4.317 m/s |
| Sprinting speed (steady state) | 5.612 m/s |
| Creative flying speed | ≈ 10.89 m/s horizontal (≈ 21.6 m/s while sprint-flying) |
| Jump initial velocity | 0.42 blocks/tick (upward) |
| Gravity | 0.08 blocks/tick², applied each tick |
| Vertical drag | velocity multiplied by 0.98 each tick (after gravity) |
| Resulting jump height | ≈ 1.25 blocks (emergent from the three values above — verify, don't hardcode) |
| Block reach (creative) | 5 blocks |
| Default FOV | 70° (slight FOV increase while sprinting, ~+10%, eased) |
| Day cycle length | 24,000 ticks = 20 real minutes |
| Day cycle segmentation | Day: ticks 0–12,000 (10 min) → Sunset: 12,000–13,800 → Night: 13,800–22,200 (~7 min) → Sunrise: 22,200–24,000 |
| Sea level | y = 62 |
| World height | y ∈ [0, 128) |
| Cloud layer altitude | y = 128 |
| Cloud cell size | 12 × 12 m footprint, 4 m thick, slow constant westward (−X) drift |
| Chunk size | 16 × 16 columns, full world height |

**Physics implementation note:** Replicate the *vertical* physics exactly per-tick (gravity 0.08, drag ×0.98, jump 0.42). For *horizontal* movement, you may use a simplified acceleration/friction model — but it must converge to the exact steady-state speeds in the table, and stopping must feel snappy (reach < 0.01 m/s within ~3 ticks of releasing keys on ground). The acceptance tests measure the steady-state speeds.

## 5. Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict mode) | Catches errors early; self-documenting for an agent workflow |
| Bundler/dev server | Vite | Instant HMR, zero-config TS |
| 3D rendering | Three.js (latest stable) | Full control over BufferGeometry for custom chunk meshing |
| Terrain noise | `simplex-noise` (npm) | Fast, seedable 2D/3D simplex |
| Physics | **Hand-rolled** per-axis swept AABB vs. voxel grid | Minecraft is tick-based; physics engines cannot reproduce its feel |
| Audio | Web Audio API (raw, no library) | Procedural synthesis = original assets + zero downloads |
| Textures | Procedural 16×16 pixel art drawn on `<canvas>` at startup, packed into one atlas texture | Original assets, crisp retro look with `NearestFilter` |
| UI (menus/HUD) | Plain HTML/CSS overlaid on the canvas | Simpler and more accessible than in-engine UI |
| State | Plain TS modules + a tiny event bus | No framework needed at this scale |

Dependencies allowed: `three`, `simplex-noise`, `vite`, `typescript` (+ types). Nothing else without a `DECISIONS.md` entry.

## 6. Architecture & File Layout

```
claudecraft/
├── index.html
├── PLAN.md  TODO.md  DECISIONS.md
├── src/
│   ├── main.ts                  # bootstrap: menu → game lifecycle
│   ├── core/
│   │   ├── GameLoop.ts          # fixed 20Hz tick + interpolated render loop
│   │   ├── Input.ts             # keyboard/mouse state, pointer lock
│   │   └── EventBus.ts
│   ├── world/
│   │   ├── Block.ts             # BlockId enum + registry (solidity, transparency, texture refs, sound material)
│   │   ├── Chunk.ts             # Uint8Array(16*16*128) storage, get/set
│   │   ├── World.ts             # chunk map, world-space get/setBlock, dirty-chunk tracking
│   │   └── TerrainGenerator.ts  # seeded simplex heightmap + layering
│   ├── rendering/
│   │   ├── TextureAtlas.ts      # procedural texture generation + atlas packing
│   │   ├── ChunkMesher.ts       # face-culled mesh building (opaque + transparent passes)
│   │   ├── ChunkRenderer.ts     # mesh lifecycle, load/unload radius around player
│   │   ├── Sky.ts               # sky dome color, sun, moon, stars, fog
│   │   └── Clouds.ts            # noise-driven 3D cloud field
│   ├── player/
│   │   ├── Player.ts            # position, velocity, flags (sprinting, flying, onGround)
│   │   ├── PlayerPhysics.ts     # per-tick integration + swept AABB collision
│   │   ├── PlayerController.ts  # input → intent (move, jump, fly toggle, sprint)
│   │   └── BlockInteraction.ts  # DDA raycast, highlight, break/place
│   ├── ui/
│   │   ├── MainMenu.ts  OptionsMenu.ts  PauseMenu.ts
│   │   ├── Hud.ts               # crosshair + hotbar
│   │   └── styles.css
│   ├── audio/
│   │   ├── AudioEngine.ts       # AudioContext, master/music/sfx gain buses
│   │   ├── Sfx.ts               # synthesized footsteps, break, place, click
│   │   └── Music.ts             # generative ambient loop
│   └── settings/Settings.ts     # options state (in-memory)
```

**Key algorithms (use these, do not improvise):**
- **Chunk meshing**: for each solid block, emit a quad only for faces adjacent to air or a transparent block (face culling). Two geometry groups per chunk: opaque and transparent (glass, leaves, water). One `Mesh` per group per chunk. Rebuild a chunk's mesh when any of its blocks change; if the edited block sits on a chunk border, also rebuild the touching neighbor chunk(s).
- **Collision**: each tick, integrate velocity then move the player's AABB **one axis at a time** (Y, then X, then Z), clamping against any solid block cells overlapped on that axis; zero the velocity component on contact; set `onGround` when clamped downward on Y.
- **Block targeting**: Amanatides & Woo voxel DDA traversal from the camera along the look vector, max distance 5; return hit block coords **and** the face normal (placement target = hit + normal). Reject placement if the new block's AABB intersects the player's AABB.
- **Game loop**: `accumulator += frameDelta; while (accumulator >= 50ms) { tick(); accumulator -= 50ms; }` then render with `alpha = accumulator / 50ms` interpolation of the player camera.

**Hotbar contents (fixed, slots 1–9):** Grass, Dirt, Stone, Cobblestone, Oak Planks, Oak Log, Leaves, Sand, Glass.

## 7. Asset Direction (all generated in code)

**Textures** — 16×16 px each, drawn on canvas with a seeded RNG for per-pixel value jitter, packed into a single power-of-two atlas. Use an **original palette** (do not sample Minecraft's colors; pick your own earthy greens, browns, and grays). Per block:
- *Grass*: green noisy top; dirt sides with a green fringe band at the top edge; dirt bottom.
- *Dirt*: brown speckled noise.
- *Stone*: gray noise with slightly darker blotches.
- *Cobblestone*: gray noise partitioned by darker mortar lines into irregular "stones".
- *Oak Planks*: horizontal plank bands with seam lines and wood-tone jitter.
- *Oak Log*: vertical bark striations on sides; concentric rings on top/bottom.
- *Leaves*: mid-green noise with scattered transparent pixels (render with alpha test).
- *Sand*: pale yellow speckle.
- *Glass*: mostly transparent with a light border frame and a couple of corner shine streaks.
- *Water*: semi-transparent blue (non-solid, not in hotbar; appears below sea level).
Set the atlas texture to `NearestFilter` (mag and min) so pixels stay crisp.

**Sound effects** — short synthesized buffers built from filtered white noise + pitched oscillators:
- Footsteps: ~80 ms noise bursts band-pass filtered; center frequency varies by material (grass soft/high, stone sharp/clicky, sand muffled, wood mid "knock"). Trigger on a stride-distance accumulator (~every 1.5 m walked), with slight random pitch variation.
- Block break: a punchy noise burst + a short downward pitch sweep, filtered per material.
- Block place: a shorter, softer "thunk" variant.
- UI click for menu buttons.

**Music** — a calm generative ambient loop: slow chord progression (e.g., 4 chords, ~10 s each) played by soft triangle/sine voices with long attack/release, gentle low-pass, and a feedback-delay "space" effect; occasional sparse pentatonic melody notes on top. Compose your own progression — peaceful, slightly nostalgic. Music starts on the menu (after the first user gesture, due to autoplay policy) and continues in-game at lower volume.

**UI style** — blocky pixel aesthetic: a chunky pixel-styled "CLAUDECRAFT" wordmark (render it yourself — CSS or canvas — no Minecraft font files), gray beveled buttons with hover highlight, dark translucent panels. Keep it disciplined: the panorama background and the wordmark are the showpieces; everything else stays quiet.

## 8. Post-1.0 Additions (user-requested, 2026-06-13)

### 8.1 First-person held item: Minecraft scale + visible arm

The held-block viewmodel must match Minecraft's first-person presentation:
- Block rendered at **scale 0.4** (per the vanilla block-model
  `firstperson_righthand` display transform: rotation `[0, 45°, 0]`,
  scale `[0.40, 0.40, 0.40]`), positioned in the lower-right of the view.
- The player's **right arm is visible** holding the block: a boxy arm in
  Minecraft's proportions (4×12×4 px on the skin → 0.25 × 0.75 × 0.25 m),
  skin-toned with a sleeve band, texture generated in code (originality rule
  applies — no Mojang skin assets). The arm extends from the bottom-right
  edge of the screen toward the block; bob and click-swing animate arm and
  block together.

### 8.2 Water physics (classic Minecraft model)

Water becomes a swimmable fluid using the classic (beta/pre-1.13) per-tick
player physics, replacing the normal gravity branch whenever the player's
AABB intersects water and they are not flying:

1. Jump held → `vy += 0.04` while the head region (feet + 1.4) is still
   submerged; once the head breaches the boost stops, so holding Space
   floats with eyes bobbing at the surface. A grounded jump in shallow
   water is a normal 0.42 hop, stunted by the ×0.8 water drag.
2. Horizontal: wish direction × **0.02** acceleration added to velocity
   (sprint adds ×1.3 to the acceleration, matching land sprint's boost).
3. Move with normal per-axis AABB collision.
4. After the move: **all** velocity components ×= **0.8** (water drag),
   then `vy -= 0.02` (water gravity).
5. Climb-out assist: if the player collided horizontally this tick and is
   in water, set `vy = 0.3` so swimming against a bank hops them out.

Emergent steady states (acceptance numbers; displacement is measured
before drag is applied, so it exceeds the stored velocity):
- Standing still → sinks at 0.1 blocks/tick (**−2.0 m/s**).
- Holding Space → rises at 0.1 blocks/tick (**+2.0 m/s**, stored vy 0.06 +
  the 0.04 boost at move time); the boost cuts out when the head breaches,
  so the player settles into a float with feet ≈ 1.4 below the surface —
  eyes right at the water line.
- Swimming forward → 0.1 blocks/tick (**≈ 2.0 m/s** displacement, stored
  velocity 0.08 b/t = 1.6 m/s).
- Entering water at any fall speed decelerates rapidly (×0.8/tick drag).
- Creative flight ignores water entirely (fly through it unchanged).

## 9. Vibrant Visuals Overhaul (user-requested, 2026-06-13)

A visual overhaul modeled on Mojang's **Vibrant Visuals** (Bedrock 1.21.90),
researched from minecraft.wiki/w/Vibrant_Visuals and the reference shots the
user provided. Mojang's version is a deferred HDR pipeline with screen-space
reflections, volumetric fog, and per-biome color grading; ours is a forward
three.js renderer with one biome, so each feature is re-derived to produce
the same on-screen result by the cheapest faithful means (deviations recorded
in DECISIONS.md). All textures remain code-generated (originality rule).

### 9.1 Smooth lighting & vertex ambient occlusion

Classic voxel AO baked into the mesher's existing vertex colors: for each
face vertex, test the two edge-adjacent neighbors (`side1`, `side2`) and the
diagonal (`corner`) in the face's plane; occlusion level
`side1 && side2 ? 0 : 3 − (side1 + side2 + corner)` maps to brightness
multipliers **[0.4, 0.6, 0.8, 1.0]** on top of the per-face directional
brightness. Quads flip their triangulation diagonal when
`ao00 + ao11 > ao10 + ao01` so interpolation follows the darker crease
(the standard fix for "wrong diagonal" artifacts). Applied to opaque blocks
and leaves; water/glass excluded. This is what reads as "soft corner
shading" in every modern Minecraft screenshot and is the single biggest
de-blanding change.

### 9.2 Pixelated directional shadows

Vibrant Visuals casts hard, pixel-grid-aligned shadows from every block that
track the sun. Implementation: the existing sun/moon `DirectionalLight`
gains a shadow map —
- `renderer.shadowMap.type = BasicShadowMap` (hard edges → the pixelated
  look; no PCF smoothing), map size **2048²**.
- Orthographic shadow camera spanning ~**90 blocks** around the player,
  near/far covering y 0–160 so clouds (y 128) can cast onto terrain.
- The camera position is snapped to shadow-texel increments each frame so
  shadow edges don't shimmer as the player moves.
- `normalBias ≈ 0.5` (half a block) to suppress acne on axis-aligned cubes.
- Opaque chunk meshes and leaves cast and receive; water receives only;
  clouds cast only. The moon light casts faint night shadows for free since
  it reuses the same light.

### 9.3 HDR pipeline: filmic tone mapping, bloom, anti-aliasing

Mojang renders HDR then maps to SDR with a custom filmic curve, with bloom
on high-luminance areas and TAAU anti-aliasing. Ours:
- `ACESFilmicToneMapping`, exposure ≈ 1.1, as the filmic curve analog —
  this alone supplies most of the "vibrant" color punch.
- `EffectComposer` rendering into a **HalfFloat, samples = 4 (MSAA)**
  target: `RenderPass → UnrealBloomPass → OutputPass`. MSAA is the
  anti-aliasing (WebGL2 multisampled renderbuffer); OutputPass applies tone
  mapping + sRGB at the end.
- Bloom thresholded high (≈ 0.85, strength ≈ 0.35) so only the sun disk,
  its halo, and water specular glints bleed — not the whole scene.
- The held-item viewmodel keeps rendering as a direct-to-screen overlay
  after the composer (it gets renderer tone mapping automatically).

### 9.4 Water: waves, sun glint, sky reflection

Mojang's water is SSR + image-based lighting + Cook-Torrance specular.
Forward-renderer equivalents:
- Water leaves the shared transparent material and becomes its **own mesher
  pass** with world-space UVs (x/z on tops, axis/y on sides) so a tiling
  detail map can scroll across it seamlessly.
- `MeshPhongMaterial`: deep-blue diffuse, **code-generated 64×64 tiling
  normal map** (simplex-noise ripples) scrolled in two directions over time
  → animated waves; high `shininess` + white specular → the moving sun
  glint (Blinn-Phong standing in for Cook-Torrance), which bloom then
  halos.
- `onBeforeCompile` fresnel: mix the water color toward the current **sky
  color uniform** by `pow(1 − N·V, 3)` and raise opacity at grazing angles
  — sky/horizon reflection without SSR. Scene fog still applies, matching
  the reference's fog-faded reflections.

### 9.5 Atmosphere & global lighting rebalance

- Replace `AmbientLight` with a **HemisphereLight** (sky tint from above,
  earthy ground bounce from below), keyframed over the day cycle. Ambient
  intensity drops and sun intensity rises so shadowed faces are clearly
  darker than sunlit ones (shadows need contrast to read).
- **Sun halo**: an additive radial-gradient sprite ~3× the sun quad,
  keyframed warm at sunrise/sunset — the cheap stand-in for mie-scatter
  haze around the sun; bloom widens it.
- Clouds stay Lambert so the new stronger sun shades their faces (lit tops,
  darker undersides per the reference) and they cast drifting shadows.
- Sky/fog keyframes nudged richer; sunset fog warms toward the horizon
  color.

### 9.6 Vibrant Visuals toggle

Like Bedrock, the overhaul is a switch: `settings.vibrantVisuals`
(default **on**) with an Options toggle row. Off = the pre-phase-13 look:
shadow maps disabled, composer bypassed (direct render, no bloom/MSAA),
`NoToneMapping`, classic flat Lambert water. Vertex AO stays on in both
modes (vanilla Minecraft has smooth lighting without Vibrant Visuals).
Applied live from the options menu.

### 9.7 Acceptance (headless, measured)

- AO: a top face beside a wall has interior vertex colors < 0.85 while
  open-ground faces stay 1.0; some face in a natural chunk shows
  non-uniform per-vertex color.
- Shadows: at noon, ground pixels behind a tall wall are ≤ 0.7× the
  brightness of adjacent sunlit ground (GL pixel probe); ratio ≈ 1 with
  the toggle off.
- Pipeline: composer target has `samples = 4`, tone mapping is ACES with
  the toggle on and None with it off; bloom brightens the region adjacent
  to the sun disk versus toggle-off.
- Water: the normal map offset advances over time; a low-sun view across
  water shows a specular glint (bright pixel cluster) absent with the
  toggle off; water pixels read blue-shifted versus the old flat texture.
- Performance: ≥ 55 FPS headless at render distance 6 with everything on.
- Regressions: phase-4 movement and phase-12 water/viewmodel checks pass
  unchanged.
