# Claudecraft Screenshots

Images in this directory are captured from the running Claudecraft game and are
used in the project README.

## Gallery

| File | Scene |
|---|---|
| `main-menu.png` | Live panorama main menu with logo and player preview |
| `world-sunrise.png` | Scenic world view with sky, terrain, and water |
| `world-terrain.png` | Long-distance terrain and biome depth |
| `water-and-biomes.png` | Shoreline, water, and biome transition |
| `passive-mobs.png` | Passive animals in generated terrain |
| `structures.png` | A deterministic generated structure |

## Capture Standards

- Capture the actual WebGL canvas and UI from a local game session.
- Use a 16:9 viewport at 1600x900 or larger.
- Keep browser chrome, the mouse cursor, and developer overlays out of frame.
- Hide the F3 overlay and other test diagnostics.
- Allow nearby chunks and entities to finish streaming before capture.
- Prefer bright, readable lighting and compositions that show depth.
- Keep stable lowercase filenames so README links do not change.

The browser verification hooks may set a deterministic seed, player position,
camera angle, time of day, and texture settings for repeatable captures. They do
not replace or composite game imagery.

The current gallery was captured at 1600x900 with Vibrant Visuals and the
optional Faithful 64x texture pack enabled:

```sh
npm run dev -- --host 127.0.0.1 --port 5173
node scripts/capture-readme-screenshots.mjs
```

The capture script uses the repository's existing `puppeteer-core` development
dependency and expects Brave Browser at its standard macOS application path.
