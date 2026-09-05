import * as THREE from 'three';
import { CarPhysics } from '../core/CarPhysics.js';
import { CarLights } from './CarLights.js';
import { buildKart, repaintKart, deriveAccent } from './CarModel.js';
import { CONFIG } from '../core/config.js';

// A drivable car: CarPhysics for movement, a procedural kart (CarModel) for
// looks, CarLights for head/tail lights. Owns nothing but visuals + physics
// sync; all gameplay values live in the physics component.

export class Car {
  constructor({ color = '#d1263a', accent, style = 'racer', isPlayer = false } = {}) {
    this.physics = new CarPhysics();
    this.color = color;
    this.style = style;
    this.isPlayer = isPlayer;
    this._roll = 0; // smoothed body roll, radians
    this._braking = false;

    this._buildModel(color, accent ?? deriveAccent(color), style);
    this.lights = new CarLights({ carMesh: this.mesh, isPlayer });
  }

  _buildModel(color, accent, style) {
    const kart = buildKart({ bodyColor: color, accentColor: accent, style });
    this.mesh = kart.group;
    this._kart = kart;
    this._bodyGroup = kart.bodyGroup;
    this.wheels = kart.wheels;
    this.wheelRadius = kart.wheelRadius;
    this._blob = kart.blobMesh;
  }

  // Live recolor (kart preview in the setup screen).
  setColor(color, accent) {
    this.color = color;
    repaintKart(this._kart, color, accent ?? deriveAccent(color));
  }

  // Swap to a different body style in place. Rebuilds the model and re-parents
  // the lights, keeping physics and the scene node the caller holds.
  setStyle(style, scene) {
    if (style === this.style) return;
    this.style = style;
    const oldMesh = this.mesh;
    const parent = oldMesh.parent ?? scene;
    oldMesh.removeFromParent();

    this._buildModel(this.color, deriveAccent(this.color), style);
    this.lights = new CarLights({ carMesh: this.mesh, isPlayer: this.isPlayer });
    parent?.add(this.mesh);
    this.syncTransform();
  }

  // on: headlights active; intensity: 0..1 fade during a time-of-day transition
  updateLights(on, intensity) {
    this.lights.update(on, this._braking, intensity);
  }

  reset(x, z, heading) {
    this.physics.reset(x, z, heading);
    this.syncTransform();
  }

  update(dt, input) {
    this.physics.update(dt, input);
    const state = this.physics.getState();

    // Brake lights: pressing back while still rolling forward, or handbrake.
    this._braking = (input.backward && state.speed > 0.5) || input.handbrake;

    this.syncTransform();

    this.wheels.frontLeft.rotation.y = state.steerAngle;
    this.wheels.frontRight.rotation.y = state.steerAngle;

    const spinDelta = (state.speed / this.wheelRadius) * dt;
    for (const wheel of Object.values(this.wheels)) {
      wheel.userData.spinMesh.rotation.x += spinDelta;
    }

    this._updateBodyRoll(dt, state);
    this._updateSquash(dt, state);
    this._updateGroundBlob();
  }

  // The blob is a child of the kart, so cancel the kart's altitude to pin it
  // to the ground, and fade/shrink it as the kart climbs.
  _updateGroundBlob() {
    if (!this._blob) return;
    const y = this.physics.y;
    this._blob.position.y = 0.025 - y;
    const fade = Math.max(0, 1 - y / 4);
    this._blob.material.opacity = fade;
    this._blob.visible = fade > 0.02;
    const spread = 1 + y * 0.12;
    this._blob.scale.set(spread, 1, spread);
  }

  // Landing squash: compress on touchdown, spring back. Also pitches the nose
  // up slightly while airborne so a jump reads as a jump.
  _updateSquash(dt, state) {
    if (state.justLanded) {
      this._squash = Math.min(0.45, state.landingImpact * 0.055);
    }
    this._squash = (this._squash ?? 0) * Math.max(0, 1 - dt * 7);

    this._bodyGroup.scale.set(
      1 + this._squash * 0.5,
      1 - this._squash,
      1 + this._squash * 0.5
    );

    // Airborne tilt follows the actual velocity vector: nose up on the way
    // out of the ramp, level at apex, nose down on the way in. Negative pitch
    // is nose-up because the kart's forward axis is +Z.
    const horizontal = Math.max(4, Math.hypot(this.physics.vx, this.physics.vz));
    const targetPitch = state.airborne
      ? -Math.atan2(this.physics.vy, horizontal) * 0.85
      : state.surfacePitch; // sitting on a slope (ramp) or flat ground
    this._pitch = (this._pitch ?? 0) + (targetPitch - (this._pitch ?? 0)) * Math.min(1, dt * 9);
    this.mesh.rotation.x = this._pitch;
  }

  // Mesh follows physics. Called from update() and again after collision
  // resolution, which mutates physics positions after the entity update.
  syncTransform() {
    this.mesh.position.set(this.physics.x, this.physics.y, this.physics.z);
    this.mesh.rotation.y = this.physics.heading;
  }

  _updateBodyRoll(dt, state) {
    const cfg = CONFIG.bodyRoll;
    const driftFactor = state.drifting ? 1 : 0.35;
    const targetRoll = THREE.MathUtils.clamp(
      state.slipAngle * cfg.perSlipRad * driftFactor +
        state.steerAngle * cfg.perSteerRad * Math.min(1, Math.abs(state.speed) / 15),
      -cfg.max,
      cfg.max
    );
    this._roll += (targetRoll - this._roll) * Math.min(1, cfg.lerpSpeed * dt);
    this._bodyGroup.rotation.z = this._roll;
  }

  // World positions of the rear wheel contact points, for skid marks and smoke.
  getRearWheelWorldPositions(outLeft, outRight) {
    this.wheels.rearLeft.getWorldPosition(outLeft);
    this.wheels.rearRight.getWorldPosition(outRight);
    outLeft.y = 0;
    outRight.y = 0;
    return [outLeft, outRight];
  }
}
