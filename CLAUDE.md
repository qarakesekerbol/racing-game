# CLAUDE.md

Project conventions for this repository. Read this before making changes.

## Project

A browser-based 3D arcade racing game built with **Three.js** and **Vite**.
Plain JavaScript (ES modules), no TypeScript, no frameworks (no React/Vue/etc).

## Folder structure

```
src/
  core/       # Engine-level systems: game loop, input, camera, physics, asset loading
  entities/   # Concrete game objects: Car, (future) Obstacle, PowerUp, etc.
  world/      # Scene/world building: Track, Ground, Lighting, Skybox
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

## Planned extension points (design with these in mind, don't build yet)

- Drift mechanics (handbrake is already wired as a placeholder input)
- Minimap
- Night mode (lighting/skybox swap)
- Obstacles and power-ups (new files under `src/entities/`)

## Running

```
npm run dev      # start Vite dev server
npm run build     # production build
```
