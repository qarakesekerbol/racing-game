import { CONFIG } from './config.js';
import { Cone, TireStack, SlipperyPatch } from '../entities/Obstacle.js';
import { Sweeper } from '../entities/Sweeper.js';

// Places every obstacle from config along the track and resolves car contact:
// cones get knocked away, tire stacks and sweepers push the car back with a
// speed penalty, slippery patches lower gripMultiplier while a car is on them.

export class ObstacleManager {
  constructor({ track, samples }) {
    this.samples = samples;
    const cfg = CONFIG.obstacles;

    this.cones = cfg.cones.spots.map(([t, offset]) =>
      new Cone(pointAt(track, t, offset))
    );
    this.tireStacks = cfg.tireStacks.spots.map(([t, offset]) =>
      new TireStack(pointAt(track, t, offset))
    );
    this.slippery = cfg.slippery.spots.map(([t, offset, radius]) =>
      new SlipperyPatch(pointAt(track, t, offset), radius)
    );
    this.sweepers = [];
    for (let i = 0; i < cfg.sweepers.count; i++) {
      this.sweepers.push(
        new Sweeper({
          samples,
          startT: cfg.sweepers.startOffsets[i % cfg.sweepers.startOffsets.length],
          lateralOffset: cfg.sweepers.lateralOffset[i % cfg.sweepers.lateralOffset.length],
        })
      );
    }
  }

  addTo(scene) {
    for (const cone of this.cones) scene.add(cone.mesh);
    for (const stack of this.tireStacks) scene.add(stack.mesh);
    for (const patch of this.slippery) scene.add(patch.mesh);
    for (const sweeper of this.sweepers) scene.add(sweeper.mesh);
  }

  reset() {
    for (const cone of this.cones) cone.reset();
    for (const sweeper of this.sweepers) sweeper.reset();
  }

  // cars: [{ id, physics }]
  update(dt, elapsed, cars) {
    const events = [];

    for (const cone of this.cones) cone.update(dt);
    for (const sweeper of this.sweepers) sweeper.update(dt, elapsed);

    for (const car of cars) {
      this._resolveCones(car, events);
      this._resolveSolids(car, this.tireStacks, CONFIG.obstacles.tireStacks, events, 'tires');
      this._resolveSolids(car, this.sweepers, CONFIG.obstacles.sweepers, events, 'sweeper');
      this._applySlippery(car);
    }

    return events;
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

  // Shared handling for immovable round things (tire stacks, sweepers).
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

function pointAt(track, t, lateralOffset) {
  const point = track.curve.getPointAt(t);
  const tangent = track.curve.getTangentAt(t);
  // left-hand normal, matching Track's road/barrier convention
  return {
    x: point.x + tangent.z * lateralOffset,
    z: point.z - tangent.x * lateralOffset,
  };
}
