# Structure Generation Audit

## Baseline
- Date: 2026-06-14 (Asia/Amman)
- Branch: `mobs`
- Commit: `7d222f99a8fe49ab406aa1e297f76aae2ebd051c`
- Node version: `v26.3.0`
- npm install result: Pass (`53` packages audited, `0` vulnerabilities)
- npm run build result: Pass (TypeScript strict check and Vite production build)
- npm run dev result: Pass at `http://127.0.0.1:5174/` (port `5173` was already occupied)
- Browser/runtime observations: Headless Brave loaded the title scene for three seconds with no console errors or warnings. Baseline screenshot: `/tmp/claudecraft-structures-baseline.png`.
- Lint result: No lint script is defined.
- Test result: The package `test` script is a placeholder that always exits with an error, so it is not a usable validation command. Existing `scripts/*.mjs` browser checks are the project test suite.
- Documentation note: `TODO.md` is referenced by the project documentation but is not present in the working tree.

## Current World Generation Pipeline
- Terrain generation file(s): `src/world/TerrainGenerator.ts`
- Biome generation file(s): `src/world/Biome.ts`, climate and biome selection in `src/world/TerrainGenerator.ts`
- Surface builder file(s): `TerrainGenerator.generate`; surface, subsoil, water, ice, beach, and underwater-bed blocks are written per column.
- Feature/tree generation file(s): `TerrainGenerator.plantFeatures`, `plantTree`, `plantSpruce`, `plantAcacia`, plus render-time foliage selection in `src/world/Foliage.ts`.
- Chunk generation entry point: `World.ensureChunk` creates a `Chunk`, calls `TerrainGenerator.generate`, then inserts it into `World.chunks`.
- Chunk meshing entry point: `ChunkRenderer.stream` generates data through render distance + 1, then `ChunkRenderer.buildChunk` calls `meshChunk` after all four cardinal neighbor chunks exist.
- Block placement API: Generation writes directly through `Chunk.set`. Runtime edits use `World.setBlock`, which writes only to an already loaded chunk and dirties its mesh plus loaded-border neighbors.
- Dirty chunk handling: `World.dirty` stores chunk keys. `ChunkRenderer.update` rebuilds dirty loaded chunks with a per-frame budget. Newly streamed chunks are built directly and removed from the dirty set.
- Storage: Each chunk is a `Uint8Array(16 * 16 * 128)`. `BlockId` values currently fit comfortably in one byte.
- Runtime edits: There is no save/load system. Unloaded chunks regenerate from the seed, and player edits are not persistent.

## Structure Integration Point
- Proposed generation stage: A `StructureGenerator` owned by `TerrainGenerator` resolves deterministic region placements and applies the blocks overlapping the current chunk.
- Runs before meshing: Yes.
- Runs after terrain: Yes.
- Runs after biome surface: Yes.
- Runs before decorations: No. Existing trees are generated inside the terrain generator. Structures should run after trees and use explicit replace rules to clear vegetation in occupied cells; this avoids a broad rewrite of the established feature pass.
- Cross-chunk support required: Yes.
- Cross-chunk approach: Query overlapping deterministic placements per chunk. Every chunk independently resolves nearby structure regions and applies only blocks whose world X/Z fall inside that chunk. No neighbor chunk needs to be loaded, and no deferred cross-chunk mutation queue is required.
- Placement cache: An optional per-generator region cache may retain immutable placement records. Correctness must not depend on cache state or chunk load order.
- Height/biome access: `TerrainGenerator.height`, `biomeAt`, `landBiomeAt`, `climateAt`, `effectiveTemperatureAt`, and `isNearWater` are deterministic world-space APIs suitable for placement validation.
- Terrain fitting: Placement validation samples footprint heights for min/max/average slope and water coverage. Structure pieces use column-local foundation fill or intentional burial rather than flattening large rectangles.
- Decoration clearing: Structural blocks may replace air, leaves, logs, cactus, and natural terrain according to a small replace-rule set. Paths only replace natural surface blocks.

## Existing Blocks Available
- Terrain blocks: Grass, Dirt, Stone, Cobblestone, Sand, Gravel, Snow, Ice.
- Wood blocks: Oak Planks, Oak Log, Birch Log, Spruce Log, Acacia Log.
- Stone blocks: Stone, Cobblestone, Gravel.
- Sand/desert blocks: Sand, Stone, Cobblestone, Gravel.
- Glass/transparent blocks: Glass, Leaves variants, Ice.
- Water blocks: Water.
- Decorative/lore blocks: None.
- Missing useful blocks: Doors, stairs, slabs, fences, path blocks, crops, chests, ladders, lights, and an etched lore marker.
- Proposed addition: One `EtchedStone` block with an original procedural texture. It can reuse stone sound and cube rendering, avoiding new mesh/model systems.

## Current Biomes
- Plains: `BiomeId.Plains`; grass surface, sparse oak trees, mixed foliage.
- Forest: `BiomeId.Forest` and `BiomeId.BirchForest`; dense oak/birch trees.
- Desert: `BiomeId.Desert`; sand surface, cactus features.
- Savanna: `BiomeId.Savanna`; grass surface, acacia trees, dry foliage.
- Taiga: `BiomeId.Taiga`; spruce trees and cold foliage.
- Snowy: `BiomeId.SnowyPlains`; snow surface and sparse spruce.
- Mountains: No separate biome. High terrain is derived from continentalness, erosion, weirdness, and elevation; mountain structures must use elevation/slope predicates.
- Ocean/coast: `Ocean`, `WarmOcean`, `FrozenOcean`; coasts are inferred from dry columns close to water.
- Other: `BiomeId.Swamp`; shallow water, swamp oak, humid foliage.

## Proposed Structure Registry
| Structure | Size | Biomes | Frequency | Terrain Requirements | Notes |
|---|---|---|---|---|---|
| `stone_cairn` | Micro | Dry land biomes | Common | Gentle slope, above water | Repeated four-stone motif |
| `small_ruin` | Small | Plains, forest, taiga, savanna | Uncommon | Mild slope | Deterministically degraded wall/arch |
| `forest_waystone` | Small | Forest, birch forest, taiga | Uncommon | Dry, moderate slope | Wooden arch, etched marker |
| `cloudwright_obelisk` | Small | Any dry land biome | Uncommon | Slight elevation, moderate slope | Four corner stones and glass sky-current accent |
| `settler_village` | Medium | Plains, savanna, forest edge, taiga | Rare | Dry and relatively flat | 2-5 original houses, meeting well, paths, pen/farm patch |
| `desert_sun_temple` | Medium | Desert, savanna | Rare | Dry, moderate slope | Original open court, sun motif, buried chamber |
| `mountain_watchtower` | Medium | Any non-ocean highland | Rare | High elevation, stable foundation | Stone shaft and wooden lookout |
| `coastal_ruins` | Medium | Temperate/warm coast | Rare | Water nearby, low elevation | Broken walls and pier remains |
| `buried_archive` | Medium | Plains, forest, desert | Very rare | Dry, moderate slope | Surface marker and sealed lore room |
| `ancient_gate` | Large | Open dry terrain | Very rare | Gentle slope, far from spawn | Broken Cloudwright arch network node |

## Risks
- Chunk border cutoffs: Origin-chunk-only generation would cut structures. Mitigation: query nearby deterministic regions for every chunk and clip block application to current chunk bounds.
- Floating structures: A single origin height is insufficient on slopes. Mitigation: validate footprint height range and fill foundations per occupied foundation column.
- Buried structures: Terrain can intersect walls and interiors. Mitigation: explicit air-clearing blocks for rooms and entrances, slope limits, and structure-specific base heights.
- Terrain flattening artifacts: Villages and temples could create large pads. Mitigation: stepped foundations and narrow paths; no broad rectangular terrain replacement.
- Overwriting water: General structures must reject water-covered footprints and use `never_water` rules. Coastal ruins explicitly allow selected submerged blocks.
- Overwriting trees: Structures run after vegetation. Occupied volumes explicitly clear leaves/logs/cactus, while surrounding forest remains untouched.
- Performance: Re-evaluating many regions and materializing large templates per chunk could hitch. Mitigation: fixed region sizes, bounded neighbor search, cheap terrain samples, immutable placement cache, and chunk-clipped block iteration.
- Memory: Unbounded placement caches could grow during long flights. Mitigation: cache compact placement records only, expose cache count for QA, and use coarse regions. Add eviction only if measured growth is material.
- Missing block types: Full-block roofs and openings must substitute for stairs, slabs, doors, fences, and ladders.
- Lore UI complexity: Right-click currently places blocks immediately. Lore interaction should intercept a targeted `EtchedStone` before placement and show one short fading overlay; no inventory or dialogue system is needed.
- Player edits: Regenerated chunks lose edits today. Structure generation follows the same existing behavior and does not introduce late writes into loaded chunks.
- Structure overlap: Independent region scales can collide. Mitigation: deterministic priority and spacing checks against nearby equal/larger placements, plus conservative frequencies.

## Fix Plan
1. Add compact structure types, registry metadata, rotation helpers, AABBs, seeded region placement, terrain validation, and overlap queries.
2. Add chunk-local block application with explicit replace rules and per-column foundations.
3. Add micro landmarks and the required village, temple, shrine, watchtower, coastal ruin, and Cloudwright obelisk generators.
4. Add a rare ancient gate and buried archive if build/runtime checks remain stable.
5. Add one procedural `EtchedStone` block, short lore fragments, right-click interaction, and F3 nearest-structure data.
6. Add deterministic Node/browser QA hooks for five seeds, border overlap, biome rules, structure availability, and runtime console/performance checks.

## Acceptance Checklist
- [x] Build passes
- [x] Dev server runs
- [ ] Structure registry exists
- [ ] Deterministic placement works
- [ ] Villages generate
- [ ] Temples/shrines generate
- [ ] Small lore structures generate
- [ ] Large rare structures generate
- [ ] Structures respect biomes
- [ ] Structures do not cut off at chunk borders
- [ ] Structures fit terrain acceptably
- [ ] No console errors after exploration
