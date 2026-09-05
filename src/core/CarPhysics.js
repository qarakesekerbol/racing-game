// Arcade car physics: pure numeric state, no Three.js imports.
// Uses a simplified kinematic bicycle model on a flat XZ plane.
// Convention: heading = 0 means facing +Z; forward = (sin(heading), cos(heading)).

export class CarPhysics {
  constructor(options = {}) {
    this.maxSpeed = options.maxSpeed ?? 40; // m/s (~144 km/h)
    this.maxReverseSpeed = options.maxReverseSpeed ?? 12; // m/s
    this.acceleration = options.acceleration ?? 14; // m/s^2
    this.brakeDeceleration = options.brakeDeceleration ?? 26; // m/s^2
    this.naturalDeceleration = options.naturalDeceleration ?? 6; // rolling friction + drag, m/s^2
    this.handbrakeDeceleration = options.handbrakeDeceleration ?? 45; // m/s^2
    this.wheelBase = options.wheelBase ?? 2.6; // meters
    this.maxSteerAngle = options.maxSteerAngle ?? 0.6; // radians
    this.steerLerpSpeed = options.steerLerpSpeed ?? 6; // steering response, 1/s

    this.x = 0;
    this.z = 0;
    this.heading = 0; // radians
    this.speed = 0; // signed m/s, negative = reversing
    this.steerAngle = 0; // smoothed steering angle, radians
    this.isHandbraking = false; // exposed for future drift mechanics
  }

  reset(x = 0, z = 0, heading = 0) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steerAngle = 0;
    this.isHandbraking = false;
  }

  update(dt, input) {
    this.isHandbraking = input.handbrake;

    // --- Longitudinal: throttle / brake / reverse / friction ---
    if (input.handbrake) {
      this.speed = moveToward(this.speed, 0, this.handbrakeDeceleration * dt);
    } else if (input.forward) {
      this.speed += this.acceleration * dt;
    } else if (input.backward) {
      if (this.speed > 0) {
        this.speed -= this.brakeDeceleration * dt;
      } else {
        this.speed -= this.acceleration * dt;
      }
    } else {
      this.speed = moveToward(this.speed, 0, this.naturalDeceleration * dt);
    }

    this.speed = clamp(this.speed, -this.maxReverseSpeed, this.maxSpeed);

    // --- Steering: authority shrinks with speed for stability ---
    let steerInput = 0;
    if (input.left) steerInput += 1;
    if (input.right) steerInput -= 1;

    const speedRatio = clamp(Math.abs(this.speed) / this.maxSpeed, 0, 1);
    const steerAuthority = 1 - 0.6 * speedRatio;
    const targetSteerAngle = steerInput * this.maxSteerAngle * steerAuthority;

    this.steerAngle = moveToward(
      this.steerAngle,
      targetSteerAngle,
      this.steerLerpSpeed * this.maxSteerAngle * dt
    );

    // --- Integrate heading and position (kinematic bicycle model) ---
    if (Math.abs(this.speed) > 0.01) {
      const angularVelocity = (this.speed / this.wheelBase) * Math.tan(this.steerAngle);
      this.heading += angularVelocity * dt;
    }

    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
  }

  getState() {
    return {
      x: this.x,
      z: this.z,
      heading: this.heading,
      speed: this.speed,
      speedKmh: this.speed * 3.6,
      steerAngle: this.steerAngle,
      isHandbraking: this.isHandbraking,
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
