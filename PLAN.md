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
