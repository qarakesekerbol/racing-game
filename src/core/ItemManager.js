import { CONFIG } from './config.js';

// Owns item slots, active effects, oil slicks and rockets for every car —
// player and AI alike. All outcomes are applied as CarPhysics modifiers
// (gripMultiplier / speedMultiplier / accelMultiplier / startSpinOut), so a
// nitro or a rocket hit behaves identically no matter who is driving.
//
// Pure numeric: visuals subscribe via the events array returned by update().

const ITEM_TYPES = ['nitro', 'shield', 'oil', 'rocket', 'slowdown'];

export class ItemManager {
  constructor({ samples, aiUseDelay }) {
    // Tier can tighten how fast AI fire what they pick up.
    this.aiUseDelay = aiUseDelay ?? CONFIG.items.aiUseDelay;
    this.samples = samples;
    this.n = samples.length;
    this.cars = new Map(); // id -> car item state
    this.slicks = [];
    this.rockets = [];
    this._nextRocketId = 0;
  }

  registerCar(id) {
    this.cars.set(id, {
      item: null,
      nitroTimer: 0,
      shieldTimer: 0,
      slowTimer: 0,
      aiUseTimer: 0,
    });
  }

  reset() {
    for (const id of this.cars.keys()) this.registerCar(id);
    this.slicks.length = 0;
    this.rockets.length = 0;
  }

  getCarItems(id) {
    return this.cars.get(id);
  }

  giveRandomItem(id) {
    const state = this.cars.get(id);
    if (!state || state.item) return null; // single slot: already holding one

    const weights = CONFIG.items.weights;
    const total = ITEM_TYPES.reduce((sum, t) => sum + weights[t], 0);
    let roll = Math.random() * total;
    let picked = ITEM_TYPES[0];
    for (const type of ITEM_TYPES) {
      roll -= weights[type];
      if (roll <= 0) {
        picked = type;
        break;
      }
    }

    state.item = picked;
    state.aiUseTimer = randRange(this.aiUseDelay);
    return picked;
  }

  // cars: [{ id, physics, rank, progress }] — rank 1 = leader.
  // Returns visual events: { type, ... } for the renderer to react to.
  update(dt, cars) {
    const events = [];
    const byId = new Map(cars.map((c) => [c.id, c]));

    for (const car of cars) {
      const state = this.cars.get(car.id);
      if (!state) continue;

      this._tickTimers(state, dt);
      this._applyModifiers(state, car.physics);
    }

    this._updateSlicks(dt, cars, events);
    this._updateRockets(dt, cars, byId, events);

    return events;
  }

  _tickTimers(state, dt) {
    if (state.nitroTimer > 0) state.nitroTimer -= dt;
    if (state.shieldTimer > 0) state.shieldTimer -= dt;
    if (state.slowTimer > 0) state.slowTimer -= dt;
  }

  _applyModifiers(state, physics) {
    const items = CONFIG.items;
    if (state.nitroTimer > 0) {
      physics.speedMultiplier *= items.nitro.speedMultiplier;
      physics.accelMultiplier *= items.nitro.accelMultiplier;
    }
    if (state.slowTimer > 0) {
      physics.speedMultiplier *= items.slowdown.speedMultiplier;
    }
  }

  // AI decision: fire after a random delay; never launch a rocket from 1st
  // (nothing ahead to hit).
  updateAIUsage(dt, cars) {
    const events = [];
    for (const car of cars) {
      if (car.isPlayer) continue;
      const state = this.cars.get(car.id);
      if (!state || !state.item) continue;

      state.aiUseTimer -= dt;
      if (state.aiUseTimer > 0) continue;

      if (state.item === 'rocket' && car.rank === 1) {
        state.aiUseTimer = 1; // hold it and re-check later
        continue;
      }
      const event = this.useItem(car.id, cars);
      if (event) events.push(event);
    }
    return events;
  }

  // cars: same shape as update(). Returns a visual event or null.
  useItem(id, cars) {
    const state = this.cars.get(id);
    if (!state || !state.item) return null;

    const type = state.item;
    state.item = null;
    const self = cars.find((c) => c.id === id);
    if (!self) return null;

    switch (type) {
      case 'nitro':
        state.nitroTimer = CONFIG.items.nitro.duration;
        return { type: 'nitro', carId: id };

      case 'shield':
        state.shieldTimer = CONFIG.items.shield.duration;
        return { type: 'shield', carId: id };

      case 'oil': {
        const cfg = CONFIG.items.oil;
        const p = self.physics;
        this.slicks.push({
          x: p.x - Math.sin(p.heading) * cfg.dropDistance,
          z: p.z - Math.cos(p.heading) * cfg.dropDistance,
          life: cfg.life,
          ownerId: id,
          ownerGrace: 1.0, // don't slip on your own fresh drop
        });
        return { type: 'oil', carId: id, slick: this.slicks[this.slicks.length - 1] };
      }

      case 'rocket': {
        const cfg = CONFIG.items.rocket;
        const target = this._findTargetAhead(self, cars);
        const p = self.physics;
        const rocket = {
          id: this._nextRocketId++,
          x: p.x + Math.sin(p.heading) * 3,
          z: p.z + Math.cos(p.heading) * 3,
          heading: p.heading,
          life: cfg.life,
          ownerId: id,
          targetId: target ? target.id : null,
        };
        this.rockets.push(rocket);
        return { type: 'rocket', carId: id, rocket };
      }

      case 'slowdown': {
        const cfg = CONFIG.items.slowdown;
        const behind = cars
          .filter((c) => c.id !== id && c.progress < self.progress)
          .sort((a, b) => b.progress - a.progress)
          .slice(0, cfg.targets);
        for (const victim of behind) {
          const victimState = this.cars.get(victim.id);
          if (!victimState) continue;
          if (victimState.shieldTimer > 0) continue;
          victimState.slowTimer = cfg.duration;
        }
        return { type: 'slowdown', carId: id, victims: behind.map((c) => c.id) };
      }

      default:
        return null;
    }
  }

  _findTargetAhead(self, cars) {
    let best = null;
    for (const car of cars) {
      if (car.id === self.id) continue;
      if (car.progress <= self.progress) continue;
      if (!best || car.progress < best.progress) best = car;
    }
    return best;
  }

  _updateSlicks(dt, cars, events) {
    const cfg = CONFIG.items.oil;
    for (let i = this.slicks.length - 1; i >= 0; i--) {
      const slick = this.slicks[i];
      slick.life -= dt;
      if (slick.ownerGrace > 0) slick.ownerGrace -= dt;
      if (slick.life <= 0) {
        events.push({ type: 'slick-expired', slick });
        this.slicks.splice(i, 1);
        continue;
      }

      for (const car of cars) {
        if (car.id === slick.ownerId && slick.ownerGrace > 0) continue;
        const dx = car.physics.x - slick.x;
        const dz = car.physics.z - slick.z;
        if (dx * dx + dz * dz > cfg.radius * cfg.radius) continue;

        const state = this.cars.get(car.id);
        if (state?.shieldTimer > 0) {
          state.shieldTimer = 0; // shield absorbs the slick
          events.push({ type: 'shield-broken', carId: car.id });
          continue;
        }
        car.physics.gripMultiplier *= cfg.gripMultiplier;
        if (car.physics.spinOutTimer <= 0) {
          car.physics.startSpinOut(cfg.spinOutTime);
          events.push({ type: 'spinout', carId: car.id });
        }
      }
    }
  }

  _updateRockets(dt, cars, byId, events) {
    const cfg = CONFIG.items.rocket;

    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const rocket = this.rockets[i];
      rocket.life -= dt;

      // Re-home on the current nearest car ahead if the original target is gone.
      const target = rocket.targetId ? byId.get(rocket.targetId) : null;
      if (target) {
        const desired = Math.atan2(
          target.physics.x - rocket.x,
          target.physics.z - rocket.z
        );
        let diff = normalizeAngle(desired - rocket.heading);
        const maxTurn = cfg.turnRate * dt;
        rocket.heading += Math.max(-maxTurn, Math.min(maxTurn, diff));
      }

      rocket.x += Math.sin(rocket.heading) * cfg.speed * dt;
      rocket.z += Math.cos(rocket.heading) * cfg.speed * dt;

      let hit = null;
      for (const car of cars) {
        if (car.id === rocket.ownerId) continue;
        const dx = car.physics.x - rocket.x;
        const dz = car.physics.z - rocket.z;
        if (dx * dx + dz * dz <= cfg.hitRadius * cfg.hitRadius) {
          hit = car;
          break;
        }
      }

      if (hit) {
        const state = this.cars.get(hit.id);
        if (state?.shieldTimer > 0) {
          state.shieldTimer = 0;
          events.push({ type: 'shield-broken', carId: hit.id });
        } else {
          hit.physics.startSpinOut(cfg.spinOutTime);
          events.push({ type: 'spinout', carId: hit.id });
        }
        events.push({ type: 'rocket-hit', rocket, carId: hit.id });
        this.rockets.splice(i, 1);
        continue;
      }

      if (rocket.life <= 0) {
        events.push({ type: 'rocket-expired', rocket });
        this.rockets.splice(i, 1);
      }
    }
  }
}

function randRange([min, max]) {
  return min + Math.random() * (max - min);
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}
