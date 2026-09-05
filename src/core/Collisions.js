import { CONFIG } from './config.js';

// Arcade collision resolution, pure numeric (no Three.js):
// - car vs car: bounding circles, positional push-apart + velocity exchange
// - car vs barrier: clamp lateral distance from the track center line and kill
//   the outward velocity component, so cars slide along walls instead of sticking.
// Mutates CarPhysics objects (x, z, vx, vz) in place; callers re-sync meshes after.

// A kart is never legitimately this far from the nearest spline sample; a
// larger distance means the cached index is stale, not that the kart is lost.
const MAX_PLAUSIBLE_DIST_SQ = 60 * 60;

export class Collisions {
  // roadWidth comes from the loaded track; the wall sits just inside the
  // visual barrier line so karts stop before clipping through it.
  constructor({ samples, roadWidth }) {
    this.samples = samples;
    this.n = samples.length;
    this.wallMaxLateral = roadWidth / 2 - 0.6;
    this._sampleIndices = new Map(); // physics object -> cached nearest sample
  }

  reset() {
    this._sampleIndices.clear();
  }

  // cars: array of CarPhysics instances.
  // Fills this.impacts with { a, b, force } per car-car hit this frame,
  // so audio/effects can react without collision code knowing about them.
  resolve(cars) {
    this.impacts = [];
    this._resolveCarPairs(cars);
    for (const car of cars) this._resolveWall(car);
  }

  _resolveCarPairs(cars) {
    const cfg = CONFIG.collisions;
    const minDist = cfg.carRadius * 2;
    const minDist2 = minDist * minDist;

    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= minDist2) continue;

        const d = Math.sqrt(d2) || 0.001;
        const nx = dx / d;
        const nz = dz / d;

        // Split the positional correction between both cars.
        const overlap = (minDist - d) / 2;
        a.x -= nx * overlap;
        a.z -= nz * overlap;
        b.x += nx * overlap;
        b.z += nz * overlap;

        // Impulse only when approaching, so resting contact doesn't jitter.
        const relVelNormal = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (relVelNormal < 0) {
          this.impacts.push({ a, b, force: -relVelNormal });
          const impulse = (-(1 + cfg.restitution) * relVelNormal) / 2;
          a.vx -= impulse * nx;
          a.vz -= impulse * nz;
          b.vx += impulse * nx;
          b.vz += impulse * nz;

          a.vx *= cfg.carSpeedLoss;
          a.vz *= cfg.carSpeedLoss;
          b.vx *= cfg.carSpeedLoss;
          b.vz *= cfg.carSpeedLoss;
        }
      }
    }
  }

  _resolveWall(car) {
    const cfg = CONFIG.collisions;
    const idx = this._nearestSample(car);

    const prev = this.samples[(idx - 1 + this.n) % this.n];
    const next = this.samples[(idx + 1) % this.n];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const tlen = Math.hypot(tx, tz) || 1;
    tx /= tlen;
    tz /= tlen;
    // left-hand normal, same convention as Track meshes
    const nx = tz;
    const nz = -tx;

    const s = this.samples[idx];
    const lateral = (car.x - s.x) * nx + (car.z - s.z) * nz;
    if (Math.abs(lateral) <= this.wallMaxLateral) return;

    const side = Math.sign(lateral);
    const excess = Math.abs(lateral) - this.wallMaxLateral;
    car.x -= nx * side * excess;
    car.z -= nz * side * excess;

    // Remove (and slightly reflect) the outward velocity component; the
    // tangential component survives, so the car slides along the wall.
    const velOutward = car.vx * nx + car.vz * nz;
    if (velOutward * side > 0) {
      car.vx -= nx * velOutward * (1 + cfg.wallBounce);
      car.vz -= nz * velOutward * (1 + cfg.wallBounce);
      car.vx *= cfg.wallSpeedLoss;
      car.vz *= cfg.wallSpeedLoss;
    }
  }

  _nearestSample(car) {
    const cached = this._sampleIndices.get(car);
    let bestIdx = cached;
    let bestDist = Infinity;

    if (cached !== undefined) {
      for (let off = -20; off <= 20; off++) {
        const idx = (cached + off + this.n) % this.n;
        const s = this.samples[idx];
        const d = (s.x - car.x) ** 2 + (s.z - car.z) ** 2;
        if (d < bestDist) {
          bestDist = d;
          bestIdx = idx;
        }
      }
    }

    // Fall back to a full scan when there is no cache, or when the windowed
    // result is implausibly far away. A stale cache otherwise clamps the kart
    // against a completely unrelated stretch of track and flings it across the
    // map — which is what happens after any teleport-scale move.
    if (cached === undefined || bestDist > MAX_PLAUSIBLE_DIST_SQ) {
      bestDist = Infinity;
      for (let i = 0; i < this.n; i++) {
        const s = this.samples[i];
        const d = (s.x - car.x) ** 2 + (s.z - car.z) ** 2;
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
    }

    this._sampleIndices.set(car, bestIdx);
    return bestIdx;
  }
}
