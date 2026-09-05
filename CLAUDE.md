# CLAUDE.md

Project conventions for this repository. Read this before making changes.

## Project

A browser-based 3D arcade racing game built with **Three.js** and **Vite**.
Plain JavaScript (ES modules), no TypeScript, no frameworks (no React/Vue/etc).

## Folder structure

```
src/
  core/       # Engine-level systems: game loop, input, camera, physics, asset loading
              # config.js: all tunable gameplay/visual numbers live there, not inline
  entities/   # Concrete game objects: Car, (future) Obstacle, PowerUp, etc.
  world/      # Scene/world building: Track, Ground, Lighting, Skybox
              # tracks/*.js: one data file per track (spline, theme, item
              #   placement). TrackManager builds/tears down a track's world;
              #   themes.js holds the visual vocabulary each track picks from.
  ui/         # HUD and any DOM/CSS-driven UI overlays
main.js       # Entry point, wires everything together
index.html    # Vite entry HTML + HUD markup
style.css     # Global + HUD styles
```

## Conventions

- **ES modules only.** Use `import`/`export`, no CommonJS (`require`).
- **One class per file.** File name matches the class name (e.g. `Car.js` exports `class Car`).
- **Comments in English.** Only comment non-obvious logic (why, not what).
- **Keep physics separate from rendering.** Physics/movement state and integration
  (`src/core/CarPhysics.js`) must not touch `THREE.*` rendering objects directly.
  Entities (e.g. `src/entities/Car.js`) own the Three.js meshes and read plain
  numeric state (position, rotation, speed) from their physics component each frame
  to update the mesh transform.
- **No global state hacks.** Pass dependencies explicitly (constructor params / method args)
  instead of reaching into globals or singletons.
- **Fixed-ish update via deltaTime.** All per-frame motion must be scaled by `deltaTime`
  (seconds), never assume a fixed frame rate.
- **Units.** Distances in meters, speed stored internally in m/s, converted to km/h only
  at the HUD display boundary.

## Lighting

`src/world/TimeOfDay.js` owns all lighting/atmosphere values (day/sunset/night)
and cross-fades between them. Anything that reacts to lighting (car headlights,
street lamps, emissive boost, bloom strength) reads `timeOfDay.getState()` each
frame rather than checking a mode name, so transitions stay smooth.

Real lights are strictly budgeted: sun + ambient, two SpotLights for the player
only, and a fixed pool of street-lamp PointLights re-parented to the nearest
lamps. Everything else is emissive material plus bloom.

## Tracks

A track is **data, not code**: `src/world/tracks/trackN.js` holds the spline
control points, road width, theme name, scenery density and every item/obstacle
position (as spline `t` + lateral offset in meters). Adding a track means adding
a data file and listing it in `tracks/index.js` — nothing else changes.

No system outside those data files may contain track-specific logic. AI pathing,
checkpoints, collisions, minimap, grid and pickups all derive from the loaded
track's `samples` and `roadWidth`, which `TrackManager` publishes.

## Planned extension points (design with these in mind, don't build yet)

## Running

```
npm run dev      # start Vite dev server
npm run build     # production build
```
