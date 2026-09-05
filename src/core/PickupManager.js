import { CONFIG } from './config.js';
import { Pickup } from '../entities/Pickup.js';

// Places rows of item boxes across the road and detects collection by any car.
// Collection itself is delegated to ItemManager so player and AI share one path.

export class PickupManager {
  constructor({ track, itemManager }) {
    this.itemManager = itemManager;
    this.pickups = [];

    const cfg = CONFIG.pickups;
    for (const t of cfg.spots) {
      const point = track.curve.getPointAt(t);
      const tangent = track.curve.getTangentAt(t);
      // left-hand normal, matching Track's road/barrier convention
      const nx = tangent.z;
      const nz = -tangent.x;
      const half = (cfg.perRow - 1) / 2;

      for (let i = 0; i < cfg.perRow; i++) {
        const offset = (i - half) * cfg.rowSpacing;
        this.pickups.push(
          new Pickup({ x: point.x + nx * offset, z: point.z + nz * offset })
        );
      }
    }
  }

  addTo(scene) {
    for (const pickup of this.pickups) scene.add(pickup.mesh);
  }

  // cars: [{ id, physics }] — returns events for burst visuals.
  update(dt, elapsed, cars) {
    Pickup.updateSharedTime(elapsed);
    const cfg = CONFIG.pickups;
    const events = [];

    for (const pickup of this.pickups) {
      pickup.update(dt, elapsed);
      if (!pickup.active) continue;

      for (const car of cars) {
        const dx = car.physics.x - pickup.position.x;
        const dz = car.physics.z - pickup.position.z;
        if (dx * dx + dz * dz > cfg.pickupRadius * cfg.pickupRadius) continue;

        const item = this.itemManager.giveRandomItem(car.id);
        if (item === null) continue; // slot full: box stays for someone else

        pickup.collect();
        events.push({ type: 'pickup', carId: car.id, item, position: pickup.position });
        break;
      }
    }

    return events;
  }

  reset() {
    for (const pickup of this.pickups) pickup.reset();
  }
}
