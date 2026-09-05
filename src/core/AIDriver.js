import { CONFIG } from './config.js';

// Produces the same input object a keyboard would, so AI cars run through the
// exact same CarPhysics as the player — no teleports, no fake speed.
// Pure numeric logic: works on plain {x, z} track samples and physics numbers.

const NEUTRAL = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  handbrake: false,
};

export class AIDriver {
  // params: { maxSpeed (m/s), aggression (0..1), lateralOffset (m) } — the
  // per-car personality, randomized once at creation.
  constructor({ samples, params, roadWidth }) {
    this.samples = samples;
    this.n = samples.length;
    this.params = params;
    // Lane wandering spans the drivable width of whichever track is loaded.
    this.laneRange = roadWidth ? roadWidth / 2 - 4.5 : CONFIG.ai.lateralOffsetRange;

    let length = 0;
    for (let i = 0; i < this.n; i++) {
      const a = samples[i];
      const b = samples[(i + 1) % this.n];
      length += Math.hypot(b.x - a.x, b.z - a.z);
    }
    this.sampleSpacing = length / this.n;

    this.reset();
  }

  reset() {
    this._sampleIndex = 0;
    this._stuckTimer = 0;
    this._reverseTimer = 0;
    this._lane = this.params.lateralOffset;
    this._laneTarget = this.params.lateralOffset;
    this._laneTimer = 2 + Math.random() * 4;
  }

  // Full-track scan for the nearest sample. The per-frame windowed search can't
  // recover from teleport-scale jumps (grid resets, mode switches), so call
  // this after moving the car arbitrarily.
  resyncPosition(physics) {
    let bestDist = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < this.n; i++) {
      const s = this.samples[i];
      const d = (s.x - physics.x) ** 2 + (s.z - physics.z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    this._sampleIndex = bestIdx;
  }

  // context: { cars: [{id, x, z}], selfId, playerProgress, myProgress, raceRunning }
  getInput(physics, context, dt) {
    const cfg = CONFIG.ai;
    const speed = Math.hypot(physics.vx, physics.vz);

    // --- Stuck recovery: back up briefly, then resume ---
    if (this._reverseTimer > 0) {
      this._reverseTimer -= dt;
      return { ...NEUTRAL, backward: true };
    }
    if (context.raceRunning && speed < cfg.stuckSpeed) {
      this._stuckTimer += dt;
      if (this._stuckTimer >= cfg.stuckTime) {
        this._stuckTimer = 0;
        this._reverseTimer = cfg.reverseTime;
        return { ...NEUTRAL, backward: true };
      }
    } else {
      this._stuckTimer = 0;
    }

    this._trackNearestSample(physics);

    // Lane wandering: every few seconds pick a new preferred lane across the
    // wide road and drift toward it, so the pack doesn't ride the center line.
    this._laneTimer -= dt;
    if (this._laneTimer <= 0) {
      this._laneTimer = randRange(cfg.laneChangeInterval);
      this._laneTarget = (Math.random() * 2 - 1) * this.laneRange;
    }
    this._lane += (this._laneTarget - this._lane) * Math.min(1, cfg.laneChangeRate * dt);

    // --- Avoidance: cars directly ahead shift our target line and cut throttle ---
    const sinH = Math.sin(physics.heading);
    const cosH = Math.cos(physics.heading);
    let avoidOffset = 0;
    let throttleScale = 1;
    for (const other of context.cars) {
      if (other.id === context.selfId) continue;
      const rx = other.x - physics.x;
      const rz = other.z - physics.z;
      const ahead = rx * sinH + rz * cosH;
      const side = rx * cosH - rz * sinH;
      if (ahead > 0 && ahead < cfg.avoidDistance && Math.abs(side) < cfg.avoidWidth) {
        avoidOffset += side > 0 ? -cfg.avoidShift : cfg.avoidShift;
        throttleScale = Math.min(
          throttleScale,
          ahead < cfg.avoidBrakeDistance ? 0.3 : 0.75
        );
      }
    }

    // --- Look-ahead target on the spline, offset by the car's preferred line ---
    const lookMeters = cfg.lookAheadBase + speed * cfg.lookAheadPerSpeed;
    const aheadSamples = Math.max(2, Math.round(lookMeters / this.sampleSpacing));
    const ti = (this._sampleIndex + aheadSamples) % this.n;
    const target = this.samples[ti];
    const [tnx, tnz] = this._normalAt(ti);
    const offset = clamp(
      this._lane + avoidOffset,
      -this.laneRange - cfg.avoidShift,
      this.laneRange + cfg.avoidShift
    );
    const tx = target.x + tnx * offset;
    const tz = target.z + tnz * offset;

    // --- Steering: bang-bang toward the target; physics steering lerp smooths it ---
    const desiredHeading = Math.atan2(tx - physics.x, tz - physics.z);
    const headingError = normalizeAngle(desiredHeading - physics.heading);
    const left = headingError > cfg.steerDeadzone;
    const right = headingError < -cfg.steerDeadzone;

    // --- Target speed from upcoming curvature ---
    const cornerSamples = Math.round(cfg.cornerLookAhead / this.sampleSpacing);
    const h1 = this._headingAt(this._sampleIndex);
    const h2 = this._headingAt((this._sampleIndex + cornerSamples) % this.n);
    const turn = Math.abs(normalizeAngle(h2 - h1));
    const caution = 2 - this.params.aggression; // low aggression brakes earlier
    const severity = Math.min(1, (turn / cfg.cornerMaxAngle) * caution);
    let targetSpeed =
      this.params.maxSpeed - (this.params.maxSpeed - cfg.minCornerSpeed) * severity;

    // --- Rubber-banding: catch up when behind the player, ease off when
    // ahead. rubberScale comes from the difficulty setting. ---
    const gap = context.playerProgress - context.myProgress; // in laps
    const rb = cfg.rubberBand;
    const rubberScale = this.params.rubberScale ?? 1;
    targetSpeed *= 1 + clamp(gap * rb.strength * rubberScale, -rb.maxSlow, rb.maxBoost);

    targetSpeed *= throttleScale;

    const forwardSpeed = physics.vx * sinH + physics.vz * cosH;
    return {
      forward: forwardSpeed < targetSpeed,
      backward: forwardSpeed > targetSpeed + cfg.brakeMargin,
      left,
      right,
      handbrake: false,
    };
  }

  _trackNearestSample(physics) {
    const n = this.n;
    let bestDist = Infinity;
    let bestIdx = this._sampleIndex;
    for (let off = -20; off <= 20; off++) {
      const idx = (this._sampleIndex + off + n) % n;
      const s = this.samples[idx];
      const d = (s.x - physics.x) ** 2 + (s.z - physics.z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = idx;
      }
    }
    this._sampleIndex = bestIdx;
  }

  _headingAt(i) {
    const prev = this.samples[(i - 1 + this.n) % this.n];
    const next = this.samples[(i + 1) % this.n];
    return Math.atan2(next.x - prev.x, next.z - prev.z);
  }

  // Left-hand normal of the track direction, same convention as Track's meshes.
  _normalAt(i) {
    const prev = this.samples[(i - 1 + this.n) % this.n];
    const next = this.samples[(i + 1) % this.n];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    return [dz / len, -dx / len];
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function randRange([min, max]) {
  return min + Math.random() * (max - min);
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}
