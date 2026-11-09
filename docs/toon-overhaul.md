# Modern Toon Visual Overhaul — Audit & Plan

Status: **Phase 1 (audit) + Phase 2 (prototype) + Phase 3 (validation) in progress**
Scope: graphics only. Multiplayer, voice, rooms, chat, inventory, collisions and
protocols are untouched.

## 1. How the worlds are built today

| Concern | Current implementation |
| --- | --- |
| Engine | Three.js r186, vendored (`vendor/three-r186.min.js`), classic scripts in one global scope. |
| Scene | `assets/app-base.js` creates renderer/scene/camera, `assets/app-scene.js` builds a room, `assets/app-colony.js` adds the biome structures, `assets/app-life.js` adds fauna/weather. |
| Worlds | 6 biomes: `amazora`, `cerron`, `atlanthia`, `caatara`, `panthara`, `pamphora`. Each is a deterministic procedural variant of the same spatial layout (campfire + 4 logs + 3 stumps, lunar house north, garden, 2 solar satellites, 2 wind pairs, colony nuclei, outcrops, forest ring, mountains, sky). |
| Geometry | Procedural primitives (`box`, `cyl`, `ell`, cones, lathe). No GLB assets. |
| Materials | `MeshToonMaterial` with a 3-band gradient map (`TGS`), tinted per world. Flat colours plus a few canvas textures (ground, clearing, solar panels, sky). |
| Textures | Canvas-generated (`sTex`, `cv`, `descTex`, planet/cloud/glow textures). One ground texture per biome, repeated ~68×. |
| Lighting | Hemisphere + one shadowed directional + one unshadowed fill directional + one point light at the campfire. PCF 1024 shadow map, shadow camera follows the player. |
| Outlines | Inverted-hull outline for marked rocks/trees/bushes (`userData.ol`), merged by region. |
| Optimisation | Static meshes merged by material/cell (`mergeStatic`), shared geometries (`GC`), per-world texture disposal (`dropWorldTex`), contact-shadow atlas, low-poly spheres. |
| Interactions | `seats`, `obst`, `FOOT` (fauna avoidance), `WALK` (walkable radius), collision boxes and multiplayer references are independent of visual detail. |

### Measured baseline (headless Chrome + SwiftShader, 1280×720, 4 bots)

| World | Draw calls | Triangles |
| --- | ---: | ---: |
| amazora | 538 | 237 090 |
| cerron | 485 | 163 182 |
| atlanthia | 512 | 181 374 |
| caatara | 496 | 140 132 |
| panthara | 519 | 163 200 |
| pamphora | 496 | 161 154 |

Baseline screenshots: `tools/world-shots.js --out pasta` (before images kept outside
the repository for comparison).

### Visual bottlenecks found

1. **Ground** reads as flat noise: a single 256 px tile of soft blobs, then a hard
   fade to one average colour at distance. Grass has no blade direction, no clumps.
2. **Foliage** is made of smooth untextured spheres/cones. Silhouettes are correct
   but the surface is plastic and the crowns lack internal volume.
3. **Bark / wood / stone** are flat colours; logs, stumps, garden wood and rocks all
   look like painted plastic.
4. **Dirt clearing** is a uniform speckle with leaves; it lacks brush strokes and
   tonal depth.
5. **Buildings** (superadobe house, colony pods) have clean silhouettes but no
   surface treatment (no bag seams, no panel breakup).
6. **Lighting** is already stylised, but the key/fill balance is a little flat in
   the lush worlds.

## 2. Art direction constraints

- Keep every world's layout, coordinates, silhouettes, palette and props.
- Modern stylised toon (Wind Waker inspiration), not photorealism, not a redesign.
- Prefer procedural/hand-painted canvas textures over downloaded assets: no new
  third-party licences, no pipeline dependency, tiny VRAM cost.
- Outlines stay subtle and only on organic props that already use them.
- Reuse one texture per family (bark, leaf, ring, stone) and tint it with the
  existing material colours.

## 3. Prototype plan (Amazora)

The prototype is deliberately limited to **Amazora**, the representative lush
biome, and only changes materials/details — never positions or composition.

1. **Shared painted textures** (small, tinted by material colour):
   - bark (vertical hand-painted strokes + knots, tileable),
   - leaf dapple (soft painted blotches),
   - cut-wood rings,
   - stone mottling.
2. **Ground**: repaint the `moss` tile with directional grass blades, clumps and a
   few tiny flowers; keep the exact same palette. Other biomes keep their current
   tiles until their own phase.
3. **Clearing**: add hand-painted brush strokes and a darker organic edge to the
   Amazora dirt clearing; keep its shape and palette.
4. **Vegetation** (same species, same positions):
   - round/twisted crowns get 3–5 extra small lobes with palette variations and
     the leaf texture, adding volume without changing the silhouette;
   - trunks use the bark texture;
   - ferns get arched two-segment fronds; flowers and tufts get a few extra blades;
   - bushes get two small filler lobes.
5. **Campfire / logs / stumps**: bark texture, cut-wood ring caps, mottled stones,
   two extra flame tongues. Seats, radius and collision are unchanged.
6. **Garden**: wood grain on beds and lantern posts, stone tiles, textured tree and
   lanterns. Positions and sizes unchanged.
7. **House**: mottled superadobe surface on the existing lathe (no shape change).
8. **Lighting**: +5 % key, −3 % hemisphere, +10 % cool fill in Amazora only.
9. **Outlines**: unchanged.

### What is explicitly not changed

- Coordinates, radii, `WALK`, `seats`, `obst`, `FOOT`, `GARDEN`, `BUS`.
- Multiplayer/event code, collision, interactions, UI, avatars.
- Number/type of trees, tree kinds, seeds, colony kits, sky, planets, mountains.
- No new files served to the browser (textures are generated in code).

## 4. Validation method

- `npm test` (667 tests) before/after.
- `node tools/world-shots.js --out pasta --bots 4` before/after; compare draw calls,
  triangles and screenshots for all six worlds.
- Check: no console errors, no missing textures, leaf/bark maps present, collisions
  and interactions untouched (no code paths changed).
- Acceptance target: Amazora visibly richer; other five worlds unchanged; draw
  calls and triangles within ~10–15 % of baseline.

## 5. Expansion (after approval)

Apply the same material/detail language world by world, each with its own palette
and vegetation treatment:

1. Amazora (prototype) — lush broadleaf, moss, painted grass.
2. Atlanthia — humid Atlantic forest, ferns, teal moss.
3. Panthara — wetland, water reflections, marsh grass.
4. Pamphora — pampa, meadow flowers, soft wind.
5. Cerron — cerrado, dry grass, twisted trees, pebbles.
6. Caatara — caatinga, sand/stone, cacti, dust.

Each phase: capture, tune, measure, then move on. Do not standardise all worlds
into the same look; keep each biome's personality.
