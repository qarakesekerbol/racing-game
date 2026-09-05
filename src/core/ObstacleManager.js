import { CONFIG } from './config.js';
import { Cone, TireStack, SlipperyPatch } from '../entities/Obstacle.js';
import { BoostPad } from '../entities/BoostPad.js';
import { Ramp } from '../entities/Ramp.js';

// Places every obstacle from config along the track and resolves car contact:
// cones get knocked away, tire stacks push the car back with a speed
// penalty, slippery patches lower gripMultiplier while a car is on them.

export class ObstacleManager {
  // obstacleData: the track's obstacle block (positions). Behaviour values
  // (radii, speed loss, boost strength) stay global in CONFIG.
  constructor({ track, samples, obstacleData }) {
    this.samples = samples;
    const data = obstacleData;

    this.cones = data.cones.map(([t, offset]) =>
      new Cone(pointAt(track, t, offset))
    );
    this.tireStacks = data.tireStacks.map(([t, offset]) =>
      new TireStack(pointAt(track, t, offset))
    );
    this.slippery = data.slippery.map(([t, offset, radius]) =>
      new SlipperyPatch(pointAt(track, t, offset), radius)
    );

    this.boostPads = data.boostPads.map(([t, offset]) =>
      new BoostPad(pointAt(track, t, offset), headingAt(track, t))
    );
    this.ramp = new Ramp(
      pointAt(track, data.ramp.t, data.ramp.offset),
      headingAt(track, data.ramp.t)
    );
    this.ramp._t = data.ramp.t;
    this.ramp.placeSign(track);

    // Per-car cooldowns keyed by id, so standing on a pad can't re-trigger it.
    this._padCooldowns = new Map();
    // Which cars were on the ramp surface last frame, for lip-crossing detection.
    this._onRamp = new Map();
  }

  addTo(scene) {
    this.scene = scene;
    for (const cone of this.cones) scene.add(cone.mesh);
    for (const stack of this.tireStacks) scene.add(stack.mesh);
    for (const patch of this.slippery) scene.add(patch.mesh);
    for (const pad of this.boostPads) pad.addTo(scene);
    this.ramp.addTo(scene);
  }

  reset() {
    for (const cone of this.cones) cone.reset();
    this._padCooldowns.clear();
    this._onRamp.clear();
  }

  // Remove every obstacle mesh from the scene (track switch).
  removeFrom(scene) {
    for (const cone of this.cones) scene.remove(cone.mesh);
    for (const stack of this.tireStacks) scene.remove(stack.mesh);
    for (const patch of this.slippery) scene.remove(patch.mesh);
    for (const pad of this.boostPads) scene.remove(pad.mesh);
    this.ramp.removeFrom(scene);
  }

  // cars: [{ id, physics }]
  update(dt, elapsed, cars) {
    const events = [];

    for (const cone of this.cones) cone.update(dt);
    for (const pad of this.boostPads) pad.update(dt);

    for (const car of cars) {
      this._resolveCones(car, events);
      this._resolveSolids(car, this.tireStacks, CONFIG.obstacles.tireStacks, events, 'tires');
      this._applySlippery(car);
      this._applyBoostPads(dt, car, events);
    }

    return events;
  }

  // Remaining boost-pad time for a car (0 when not boosting).
  getBoostState(carId) {
    return this._padCooldowns.get(carId)?.boostTimer ?? 0;
  }

  // Boost pads grant a timed speed/accel modifier through CarPhysics, so the
  // effect is identical for the player and the AI.
  _applyBoostPads(dt, car, events) {
    const cfg = CONFIG.obstacles.boostPads;
    const p = car.physics;

    let state = this._padCooldowns.get(car.id);
    if (!state) {
      state = { cooldown: 0, boostTimer: 0 };
      this._padCooldowns.set(car.id, state);
    }
    if (state.cooldown > 0) state.cooldown -= dt;

    if (state.boostTimer > 0) {
      // Clamp at 0: callers treat this as "boosting for N more seconds", so a
      // small negative residual would read as an active boost.
      state.boostTimer = Math.max(0, state.boostTimer - dt);
      p.speedMultiplier *= cfg.speedMultiplier;
      p.accelMultiplier *= cfg.accelMultiplier;
    }

    if (state.cooldown > 0) return;
    for (const pad of this.boostPads) {
      // Rectangle test in the pad's local frame so the trigger matches the
      // strip you can see — a circle either misses the corners or over-reaches.
      const dx = p.x - pad.position.x;
      const dz = p.z - pad.position.z;
      const sin = Math.sin(pad.heading);
      const cos = Math.cos(pad.heading);
      const along = dx * sin + dz * cos;
      const across = dx * cos - dz * sin;
      if (Math.abs(along) > cfg.length / 2 || Math.abs(across) > cfg.width / 2) continue;
      state.boostTimer = cfg.duration;
      state.cooldown = cfg.duration + cfg.cooldown;
      events.push({
        type: 'boost-pad',
        carId: car.id,
        position: { x: pad.position.x, z: pad.position.z },
      });
      break;
    }
  }

  // Ramp surface resolution. Runs AFTER the cars have moved (alongside
  // collision resolution) because it is a positional correction: it reads the
  // kart's new XZ, sits it on the ramp surface at that point, and launches it
  // the moment it crosses the lip.
  //
  // Applies to every car passed in, so AI ride and jump ramps exactly as the
  // player does.
  resolveRamps(cars) {
    const events = [];
    const ramp = this.ramp;
    if (!ramp) return events;

    for (const car of cars) {
      const p = car.physics;
      const sample = ramp.sample(p.x, p.z);
      const wasOn = this._onRamp.get(car.id) === true;

      if (sample?.onRamp) {
        // Sitting on the slope: the surface is the ground reference, so the
        // kart climbs the visible face instead of passing through it.
        this._onRamp.set(car.id, true);
        if (!p.airborne) {
          p.groundHeight = sample.height;
          // Set y directly too: this runs after the kart has moved, so waiting
          // for the next physics tick would leave it a frame below the slope.
          p.y = sample.height;
          p.surfacePitch = this._slopePitch(p, ramp);
        } else {
          // Airborne over the ramp: land on its surface, not the flat ground.
          p.groundHeight = sample.height;
        }
        continue;
      }

      this._onRamp.set(car.id, false);

      // Just crossed the lip while grounded -> launch along the exit angle.
      if (wasOn && sample?.past && !p.airborne) {
        const speed = Math.hypot(p.vx, p.vz);
        const forward = p.vx * Math.sin(ramp.heading) + p.vz * Math.cos(ramp.heading);
        // Only a forward exit over the lip launches; rolling off backwards or
        // creeping just drops back to the ground.
        if (forward > 0 && speed >= CONFIG.obstacles.ramp.minSpeed) {
          const vertical = Math.min(
            CONFIG.obstacles.ramp.maxLaunch,
            speed * Math.sin(ramp.angle) * CONFIG.obstacles.ramp.launchBoost
          );
          p.launch(vertical);
          events.push({ type: 'ramp-launch', carId: car.id, speed });
        } else {
          p.groundHeight = 0;
        }
        p.surfacePitch = 0;
        continue;
      }

      // Off the ramp entirely: normal flat ground.
      p.groundHeight = 0;
      p.surfacePitch = 0;
      // Left the side or back of the ramp above ground level: fall, don't snap.
      if (!p.airborne && p.y > 0.05) {
        p.airborne = true;
        p.vy = 0;
      }
    }

    return events;
  }

  // Pitch to sit the kart on the slope, accounting for the direction it is
  // actually facing: driving straight up gives the full ramp angle, crossing
  // it diagonally gives less, facing down-slope inverts it.
  _slopePitch(physics, ramp) {
    const headingDiff = physics.heading - ramp.heading;
    return -Math.atan(Math.tan(ramp.angle) * Math.cos(headingDiff));
  }

  _resolveCones(car, events) {
    const cfg = CONFIG.obstacles.cones;
    const p = car.physics;
    const reach = CONFIG.collisions.carRadius + cfg.radius;

    for (const cone of this.cones) {
      if (cone.knocked) continue;
      const dx = cone.position.x - p.x;
      const dz = cone.position.z - p.z;
      if (dx * dx + dz * dz > reach * reach) continue;

      const len = Math.hypot(dx, dz) || 1;
      const speed = Math.hypot(p.vx, p.vz);
      cone.knock(dx / len, dz / len, Math.min(speed, cfg.knockSpeed));
      p.vx *= cfg.carSpeedLoss;
      p.vz *= cfg.carSpeedLoss;
      events.push({ type: 'cone-hit', carId: car.id, position: { x: cone.position.x, z: cone.position.z } });
    }
  }

  // Shared handling for immovable round things (tire stacks).
  _resolveSolids(car, list, cfg, events, kind) {
    const p = car.physics;
    const reach = CONFIG.collisions.carRadius + cfg.radius;

    for (const solid of list) {
      const sx = solid.position ? solid.position.x : solid.x;
      const sz = solid.position ? solid.position.z : solid.z;
      const dx = p.x - sx;
      const dz = p.z - sz;
      const d2 = dx * dx + dz * dz;
      if (d2 > reach * reach) continue;

      const d = Math.sqrt(d2) || 0.001;
      const nx = dx / d;
      const nz = dz / d;

      // Push the car out and kill the velocity going into the obstacle.
      p.x = sx + nx * reach;
      p.z = sz + nz * reach;

      const into = p.vx * nx + p.vz * nz;
      if (into < 0) {
        p.vx -= nx * into * (1 + (cfg.restitution ?? 0.2));
        p.vz -= nz * into * (1 + (cfg.restitution ?? 0.2));
        p.vx *= cfg.carSpeedLoss;
        p.vz *= cfg.carSpeedLoss;
        events.push({ type: `${kind}-hit`, carId: car.id, position: { x: sx, z: sz } });
      }
    }
  }

  _applySlippery(car) {
    const cfg = CONFIG.obstacles.slippery;
    const p = car.physics;
    for (const patch of this.slippery) {
      const dx = p.x - patch.position.x;
      const dz = p.z - patch.position.z;
      if (dx * dx + dz * dz <= patch.radius * patch.radius) {
        p.gripMultiplier *= cfg.gripMultiplier;
        return; // one patch is enough
      }
    }
  }
}

function headingAt(track, t) {
  const tangent = track.curve.getTangentAt(t);
  return Math.atan2(tangent.x, tangent.z);
}

function pointAt(track, t, lateralOffset) {
  const point = track.curve.getPointAt(t);
  const tangent = track.curve.getTangentAt(t);
  // left-hand normal, matching Track's road/barrier convention
  return {
    x: point.x + tangent.z * lateralOffset,
    z: point.z - tangent.x * lateralOffset,
  };
}
