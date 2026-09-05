import { CONFIG } from './config.js';

// Arcade car physics with drift: pure numeric state, no Three.js imports.
// Velocity is a world-space vector split each step into forward/lateral
// components relative to the car's heading. Lateral velocity decays with
// "grip"; low grip (handbrake, sharp fast turns, sustained throttle in a
// slide) lets the car travel sideways = drifting.
// Convention: heading = 0 means facing +Z; forward = (sin(heading), cos(heading)).

const RAD_TO_DEG = 180 / Math.PI;

export class CarPhysics {
  constructor(options = {}) {
    this.cfg = { ...CONFIG.car, ...options.car };
    this.driftCfg = { ...CONFIG.drift, ...options.drift };

    this.reset();
  }

  reset(x = 0, z = 0, heading = 0) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.vx = 0; // world-space velocity, m/s
    this.vz = 0;
    this.steerAngle = 0;
    this.grip = this.driftCfg.gripNormal;
    this.isHandbraking = false;

    // External effect modifiers (items, obstacles, surfaces). Systems set these
    // each frame before update(); physics only reads them, so player and AI
    // respond identically.
    this.gripMultiplier = 1;
    this.speedMultiplier = 1;
    this.accelMultiplier = 1;
    this.spinOutTimer = 0; // seconds of forced spin-out remaining
    this._spinDirection = 1;

    // Vertical state. `groundHeight` is the surface directly under the kart —
    // 0 on flat ground, or the ramp surface when driving on one. Whoever owns
    // the surface (ObstacleManager) sets it each frame; physics only reads it.
    // While grounded the kart snaps to it; while airborne it is the landing
    // altitude. `surfacePitch` is the slope to tilt the body to.
    this.y = 0;
    this.vy = 0;
    this.groundHeight = 0;
    this.surfacePitch = 0;
    this.airborne = false;
    this.justLanded = false;
    this.landingImpact = 0; // downward speed at touchdown, for the squash

    this.slipAngle = 0; // signed radians between heading and velocity direction
    this.drifting = false;
    this.driftDuration = 0;
    this.driftScore = 0; // current run, unbanked
    this.totalScore = 0;
    this.combo = 1;
    this.lastDriftBank = 0;
    this.driftJustEnded = false;

    this._driftEndTimer = 0;
    this._comboTimer = 0;
    this._pendingBoost = 0;
    this._speedForward = 0;
  }

  update(dt, input) {
    const c = this.cfg;
    const d = this.driftCfg;

    this.driftJustEnded = false;
    this.justLanded = false;
    this.isHandbraking = input.handbrake;

    // Inputs arrive either analog (touch stick, gamepad triggers) or as
    // booleans (keyboard, AI drivers). Normalise once here so the rest of the
    // step never has to care which device produced them.
    const throttle = typeof input.throttle === 'number'
      ? clamp(input.throttle, 0, 1)
      : (input.forward ? 1 : 0);
    const braking = typeof input.brake === 'number'
      ? input.brake > 0.15
      : !!input.backward;
    const wantsThrottle = throttle > 0.02;

    // --- Vertical: ballistic while airborne, otherwise sit on the surface ---
    if (this.airborne) {
      this.vy -= c.airGravity * dt;
      this.y += this.vy * dt;
      if (this.y <= this.groundHeight) {
        this.y = this.groundHeight;
        this.landingImpact = Math.abs(this.vy);
        this.vy = 0;
        this.airborne = false;
        this.justLanded = true;
      }
    } else {
      // Grounded: follow the surface under the wheels. Rising onto a ramp is
      // a smooth climb because groundHeight changes gradually with position.
      this.y = this.groundHeight;
    }

    // Effect-modified limits for this step. speedMultiplier > 1 (nitro) also
    // raises the ceiling; < 1 (slowdown zone) lowers it.
    const maxSpeed = c.maxSpeed * this.speedMultiplier;
    const acceleration = c.acceleration * this.accelMultiplier;

    // --- Decompose velocity into forward/lateral relative to heading ---
    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);
    let vF = this.vx * sinH + this.vz * cosH; // along heading
    let vL = this.vx * cosH - this.vz * sinH; // sideways

    // --- Longitudinal: throttle / brake / reverse / friction / drift boost ---
    if (this._pendingBoost > 0) {
      vF = Math.min(vF + this._pendingBoost, maxSpeed * d.boostMaxSpeedFactor);
      this._pendingBoost = 0;
    }

    if (wantsThrottle) {
      // Partial throttle gives partial acceleration (trigger / stick feel).
      if (vF < maxSpeed) vF = Math.min(vF + acceleration * throttle * dt, maxSpeed);
    } else if (braking) {
      if (vF > 0) {
        vF -= c.brakeDeceleration * dt;
      } else {
        vF = Math.max(vF - acceleration * dt, -c.maxReverseSpeed);
      }
    } else {
      vF = moveToward(vF, 0, c.naturalDeceleration * dt);
    }

    if (input.handbrake) {
      vF = moveToward(vF, 0, c.handbrakeDeceleration * dt);
    }

    // Overshoot above the current ceiling (boost, or a slowdown that just
    // started) bleeds off gradually instead of snapping.
    if (vF > maxSpeed) {
      vF = moveToward(vF, maxSpeed, c.naturalDeceleration * dt);
    }

    // --- Steering: authority shrinks with speed for stability ---
    let steerInput = 0;
    if (typeof input.steer === 'number') {
      steerInput = clamp(input.steer, -1, 1);
    } else {
      if (input.left) steerInput += 1;
      if (input.right) steerInput -= 1;
    }

    const speedRatio = clamp(Math.abs(vF) / c.maxSpeed, 0, 1);
    const steerAuthority = 1 - c.steerAuthorityDrop * speedRatio;
    const targetSteerAngle = steerInput * c.maxSteerAngle * steerAuthority;
    this.steerAngle = moveToward(
      this.steerAngle,
      targetSteerAngle,
      c.steerLerpSpeed * c.maxSteerAngle * dt
    );

    // --- Grip selection: what makes the tires let go ---
    const speedKmh = Math.abs(vF) * 3.6;
    const sharpTurn =
      Math.abs(this.steerAngle) > d.sharpTurnSteerRatio * c.maxSteerAngle &&
      speedKmh > d.sharpTurnMinSpeedKmh;

    let targetGrip = d.gripNormal;
    if (input.handbrake) {
      targetGrip = d.gripHandbrake;
    } else if (this.drifting && wantsThrottle) {
      targetGrip = d.gripDrifting; // throttle keeps the slide alive
    } else if (sharpTurn) {
      targetGrip = d.gripSharpTurn;
    }

    // Grip drops fast but recovers slowly (releasing throttle regains grip gradually).
    const gripRate = targetGrip < this.grip ? d.gripDropRate : d.gripRecoveryRate;
    this.grip += (targetGrip - this.grip) * Math.min(1, gripRate * dt);

    // --- Lateral friction: exponential decay of sideways velocity ---
    // gripMultiplier < 1 = slippery surface (ice, oil) for whoever is on it.
    // Airborne wheels grip nothing, so the kart keeps its sideways drift.
    if (!this.airborne) {
      vL *= Math.exp(-this.grip * this.gripMultiplier * dt);
    }

    // --- Yaw: kinematic bicycle model, boosted while drifting so
    // counter-steering has real authority over the slide ---
    if (this.airborne) {
      // No steering authority in the air — the kart holds its heading.
    } else if (this.spinOutTimer > 0) {
      // Forced spin: steering is overridden and the car rotates on its own.
      this.spinOutTimer -= dt;
      this.heading += this._spinDirection * c.spinOutRate * dt;
      if (this.spinOutTimer <= 0) this.spinOutTimer = 0;
    } else {
      const steerEffective = this.steerAngle * (this.drifting ? d.driftSteerBoost : 1);
      if (Math.abs(vF) > 0.1) {
        const yawCap = c.maxYawRate * (this.drifting ? d.driftSteerBoost : 1);
        const angularVelocity = clamp(
          (vF / c.wheelBase) * Math.tan(steerEffective),
          -yawCap,
          yawCap
        );
        this.heading += angularVelocity * dt;
      }
    }

    // --- Recompose world velocity using the pre-rotation axes: velocity does
    // not automatically follow the new heading — that difference IS the slide ---
    this.vx = sinH * vF + cosH * vL;
    this.vz = cosH * vF - sinH * vL;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this._speedForward = vF;

    // --- Drift state, scoring, combo ---
    this.slipAngle = Math.abs(vF) > 0.5 ? Math.atan2(vL, Math.abs(vF)) : 0;
    const slipDeg = Math.abs(this.slipAngle) * RAD_TO_DEG;
    const speed = Math.hypot(this.vx, this.vz);
    const isDriftingNow =
      slipDeg > d.thresholdDeg && speed * 3.6 > d.minSpeedKmh && vF > 0;

    if (isDriftingNow) {
      if (!this.drifting) this._startDrift();
      this._driftEndTimer = d.endGrace;
      this.driftDuration += dt;
      this.driftScore += slipDeg * speed * d.scoreRate * dt;
    } else if (this.drifting) {
      // Grace period so a brief grip-up mid-slide doesn't end the drift.
      this._driftEndTimer -= dt;
      this.driftDuration += dt;
      if (this._driftEndTimer <= 0) this._endDrift();
    }

    if (!this.drifting && this._comboTimer > 0) {
      this._comboTimer -= dt;
      if (this._comboTimer <= 0) this.combo = 1;
    }
  }

  _startDrift() {
    this.drifting = true;
    this.driftDuration = 0;
    this.driftScore = 0;
    if (this._comboTimer > 0) this.combo += 1;
  }

  _endDrift() {
    const d = this.driftCfg;
    this.drifting = false;
    this.driftJustEnded = true;

    const banked = this.driftScore >= d.minBankScore
      ? Math.round(this.driftScore) * this.combo
      : 0;
    this.lastDriftBank = banked;

    if (banked > 0) {
      this.totalScore += banked;
      this._comboTimer = d.comboWindow;
    } else {
      this.combo = 1;
      this._comboTimer = 0;
    }

    if (this.driftDuration >= d.boostMinDuration) {
      this._pendingBoost = d.boostSpeed;
    }
  }

  // Start a forced spin-out (rocket hit, oil slick). Direction alternates with
  // current slip so it looks like the car was knocked loose.
  startSpinOut(seconds) {
    this.spinOutTimer = Math.max(this.spinOutTimer, seconds);
    this._spinDirection = this.slipAngle >= 0 ? 1 : -1;
  }

  // Launch off a ramp with an upward velocity (m/s). Called at the moment the
  // kart leaves the lip, so it keeps the height it had there.
  launch(verticalSpeed) {
    if (this.airborne) return;
    this.airborne = true;
    this.vy = verticalSpeed;
    this.groundHeight = 0; // back to flat ground for the landing test
  }

  // Reset per-frame modifiers; effect systems re-apply them each tick.
  clearModifiers() {
    this.gripMultiplier = 1;
    this.speedMultiplier = 1;
    this.accelMultiplier = 1;
  }

  getState() {
    return {
      x: this.x,
      z: this.z,
      heading: this.heading,
      y: this.y,
      surfacePitch: this.surfacePitch,
      airborne: this.airborne,
      justLanded: this.justLanded,
      landingImpact: this.landingImpact,
      spinningOut: this.spinOutTimer > 0,
      speed: this._speedForward,
      speedKmh: Math.hypot(this.vx, this.vz) * 3.6 * Math.sign(this._speedForward || 1),
      steerAngle: this.steerAngle,
      isHandbraking: this.isHandbraking,
      slipAngle: this.slipAngle,
      slipDeg: Math.abs(this.slipAngle) * RAD_TO_DEG,
      drifting: this.drifting,
      driftDuration: this.driftDuration,
      driftScore: this.driftScore,
      totalScore: this.totalScore,
      combo: this.combo,
      driftJustEnded: this.driftJustEnded,
      lastDriftBank: this.lastDriftBank,
    };
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function moveToward(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}
