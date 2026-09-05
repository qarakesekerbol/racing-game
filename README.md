# 🏁 Frost Rush GP

**A browser-based 3D arcade kart racer — drift through a snowy pine forest or a desert canyon, grab power-ups, and fight seven AI opponents to the line.** No engine, no asset packs: every kart, track and effect is generated procedurally with Three.js.

**▶️ [Live demo](#)** ← _replace this link once deployed_

![Gameplay](docs/screenshots/hero.png)
<!-- Suggested: a wide landscape shot mid-race — the player kart mid-pack on Frostpine
     with several colored karts ahead, HUD visible. This is the first thing people see,
     so pick the frame that best sells the art style. -->

---

## Features

- **Drift mechanics** — velocity is split into forward/lateral components with a grip model, so you can flick the kart sideways with the handbrake, hold the slide on the throttle, and counter-steer out. Long drifts bank points and give an exit speed boost.
- **Power-ups** — nitro, shield, oil slick, homing rocket and a slowdown field, collected from floating glass item spheres. Every effect runs through the same physics modifiers, so the AI uses them exactly as you do.
- **Seven AI opponents** — each with its own top speed, cornering aggression and preferred racing line, plus lane changes, overtake avoidance, stuck recovery and mild rubber-banding to keep races close.
- **Day / sunset / night cycle** — press `N` to cycle. Cross-fades over two seconds: sun colour, ambient, fog, sky gradient, stars, headlights and street lamps all shift together.
- **Two tracks, three difficulty tiers** — Frostpine Loop (Easy), Pinecrest Sprint (Medium) and Canyon Run (Hard). Tier changes road width, corner severity, hazard density *and* how fast and aggressive the AI field is.
- **Four kart body styles** — Racer, Buggy, Classic and Stealth, each a distinct procedural low-poly model, plus six colours.
- **Live minimap** — top-down track outline with every kart as a heading arrow in its own colour.
- **Ramps and boost pads** — proper heightfield ramps you drive up and launch from, with airborne physics and a landing squash.
- **Full HUD** — speedometer, lap and split timers, live position, drift score, item slot and race results with championship points.
- **Procedural audio** — engine note tracking RPM, tyre screech, item effects and a chiptune soundtrack that speeds up on the final lap. All synthesised with the Web Audio API; no audio files.
- **Persistent records** — best lap and best total per track, top finishes and best drift score, saved to `localStorage`.
- **Keyboard, touch and gamepad** — all three feed one abstract input state and hot-swap automatically.

![Drift](docs/screenshots/drift.png)
<!-- Suggested: the kart mid-drift at a sharp angle with tyre smoke and skid marks
     behind it, and the orange DRIFT score counter visible at the top of the screen.
     A GIF works even better here than a still. -->

![Night mode](docs/screenshots/night.png)
<!-- Suggested: night on Frostpine — headlight pools on the road, glowing street
     lamps, stars overhead and moonlit blue snow. Best shot from just behind the kart
     on a curve so the light falloff is visible. -->

---

## Tech stack

| | |
|---|---|
| **Rendering** | [Three.js](https://threejs.org) r169 — WebGL, instanced meshes, custom GLSL shaders |
| **Build** | [Vite](https://vitejs.dev) 5 |
| **Language** | Vanilla JavaScript (ES modules) — no framework, no TypeScript |
| **Audio** | Web Audio API (fully procedural) |
| **Storage** | `localStorage` for records and settings |

Everything you see is generated at runtime: kart models from primitives and extrusions, tracks from Catmull-Rom splines, textures painted to canvas, and post-processing via `EffectComposer` (bloom + colour grade).

---

## Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Accelerate | `W` / `↑` | `RT` or `A` | **GAS** button |
| Brake / reverse | `S` / `↓` | `LT` or `X` | **BRAKE** button |
| Steer | `A` `D` / `←` `→` | Left stick or D-pad | Virtual joystick |
| Drift (handbrake) | `Space` | `RB` | **DRIFT** button |
| Use item | `Shift` / `E` | `LB` or `Y` | **ITEM** button |
| Pause | `Esc` | `Start` | — |
| Restart race | `R` | `B` | — |
| Cycle time of day | `N` | — | — |
| Debug panel (fps, draw calls) | `F` | — | — |

Steering and throttle are **analog** on gamepad and touch — a half-pulled trigger really does accelerate at half rate, and a small joystick nudge gives a small correction.

Input methods hot-swap: touch controls appear when you touch the screen and hide the moment you press a key. A badge in the corner shows what's currently driving.

---

## Running locally

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
git clone https://github.com/qarakesekerbol/racing-game.git
cd racing-game
npm install
npm run dev
```

Vite prints a local URL (usually `http://localhost:5173`) and opens it automatically.

```bash
npm run build     # production build into dist/
npm run preview   # serve the production build locally
```

![Track select](docs/screenshots/track-select.png)
<!-- Suggested: the track select screen with the difficulty tabs visible and one
     tier selected, showing a track card with its generated spline thumbnail and
     star rating. Good for showing the UI polish rather than just the 3D. -->

---

## Project structure

```
src/
  core/       Game loop, physics, input, AI, race logic, audio, config
  entities/   Karts, pickups, obstacles, particles, ramps
  world/      Tracks, themes, lighting, scenery, sky
    tracks/   One data file per track — add a file, list it, done
  ui/         HUD, menus, minimap, touch controls
```

A track is **data, not code**: spline control points, theme name, road width and item placement live in `src/world/tracks/trackN.js`. Adding a track means adding one file and listing it in `tracks/index.js` — no system outside those files contains track-specific logic.

All tuning values live in `src/core/config.js` and are read every frame, so you can edit them live from the browser console via `window.CONFIG`.

---

## Performance

Targets 60 fps at medium quality. Three quality presets (`low` / `medium` / `high`) scale shadow resolution, bloom, and the real-light budget. Techniques used:

- InstancedMesh for trees, rocks, crowd, tyre walls, curbs and snow banks — the whole environment is a handful of draw calls
- A fixed pool of point lights re-parented to the nearest street lamps, removed from the scene entirely in daylight
- Shadow casting limited to karts, with the sun's shadow frustum following the player
- A custom fresnel shader for the glass pickups instead of `transmission`, which would force a second full scene render

Press `F` in-game for live draw call, triangle and light counts.

---

## License

MIT
