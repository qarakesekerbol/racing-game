import * as THREE from 'three';
import { CONFIG } from './config.js';

// Smoothly follows behind a target object (the car).
// Uses exponential smoothing so the follow feel is framerate-independent.
// While drifting: FOV widens slightly and the follow lags more for a sense of speed.

const UP = new THREE.Vector3(0, 1, 0);

export class ChaseCamera {
  constructor(camera, options = {}) {
    this.camera = camera;
    this.cfg = { ...CONFIG.camera, ...options };
    this.offset = options.offset ?? new THREE.Vector3(0, 4.5, -9); // behind and above (car forward is +Z)
    this.lookOffset = options.lookOffset ?? new THREE.Vector3(0, 1.2, 5); // aim ahead of the car

    this._desiredPosition = new THREE.Vector3();
    this._desiredLook = new THREE.Vector3();
    this._currentLook = new THREE.Vector3();
    this._initialized = false;
  }

  // Add a burst of camera shake (collisions, hard landings). Amount is 0..1.
  addShake(amount) {
    this._shake = Math.min(1, (this._shake ?? 0) + amount);
  }

  // A downward camera lurch, used when a jump lands. Amount is 0..1.
  addDip(amount) {
    this._dip = Math.min(1, (this._dip ?? 0) + amount);
  }

  // extraFov: additive boost from effects (nitro/boost pads), in degrees
  update(dt, target, driftState = null, extraFov = 0) {
    const heading = target.rotation.y;
    const drifting = driftState ? driftState.drifting : false;
    this._extraFov = extraFov;

    // FOV also opens up with raw speed, so fast feels fast.
    const speedRatio = driftState
      ? Math.min(1, Math.abs(driftState.speed) / CONFIG.car.maxSpeed)
      : 0;
    this._speedFov = speedRatio * this.cfg.speedFovBoost;

    this._desiredPosition
      .copy(this.offset)
      .applyAxisAngle(UP, heading)
      .add(target.position);

    this._desiredLook
      .copy(this.lookOffset)
      .applyAxisAngle(UP, heading)
      .add(target.position);

    if (!this._initialized) {
      this.camera.position.copy(this._desiredPosition);
      this._currentLook.copy(this._desiredLook);
      this._initialized = true;
    } else {
      const positionSmoothing = drifting
        ? this.cfg.driftPositionSmoothing
        : this.cfg.positionSmoothing;
      const posT = 1 - Math.exp(-positionSmoothing * dt);
      const lookT = 1 - Math.exp(-this.cfg.lookSmoothing * dt);
      this.camera.position.lerp(this._desiredPosition, posT);
      this._currentLook.lerp(this._desiredLook, lookT);
    }

    // Shake displaces the camera after the follow solve, so it never fights
    // the smoothing (which would turn a jolt into a slow drift).
    this._shake = (this._shake ?? 0) * Math.max(0, 1 - this.cfg.shakeDecay * dt);
    if (this._shake > 0.001) {
      const a = this._shake * this.cfg.shakeAmplitude;
      this.camera.position.x += (Math.random() * 2 - 1) * a;
      this.camera.position.y += (Math.random() * 2 - 1) * a;
      this.camera.position.z += (Math.random() * 2 - 1) * a;
    }

    // Landing dip: a smooth drop that springs back, not random jitter.
    this._dip = (this._dip ?? 0) * Math.max(0, 1 - this.cfg.dipDecay * dt);
    if (this._dip > 0.001) {
      this.camera.position.y -= this._dip * this.cfg.dipAmount;
    }

    this.camera.lookAt(this._currentLook);
    this._updateFov(dt, drifting);
  }

  _updateFov(dt, drifting) {
    const targetFov =
      this.cfg.baseFov +
      (drifting ? this.cfg.driftFovBoost : 0) +
      (this._extraFov ?? 0) +
      (this._speedFov ?? 0);
    const t = 1 - Math.exp(-this.cfg.fovLerpSpeed * dt);
    const newFov = this.camera.fov + (targetFov - this.camera.fov) * t;
    if (Math.abs(newFov - this.camera.fov) > 0.01) {
      this.camera.fov = newFov;
      this.camera.updateProjectionMatrix();
    }
  }
}
