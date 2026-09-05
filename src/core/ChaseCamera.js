import * as THREE from 'three';

// Smoothly follows behind a target object (the car).
// Uses exponential smoothing so the follow feel is framerate-independent.

const UP = new THREE.Vector3(0, 1, 0);

export class ChaseCamera {
  constructor(camera, options = {}) {
    this.camera = camera;
    this.offset = options.offset ?? new THREE.Vector3(0, 4.5, -9); // behind and above (car forward is +Z)
    this.lookOffset = options.lookOffset ?? new THREE.Vector3(0, 1.2, 5); // aim ahead of the car
    this.positionSmoothing = options.positionSmoothing ?? 4;
    this.lookSmoothing = options.lookSmoothing ?? 7;

    this._desiredPosition = new THREE.Vector3();
    this._desiredLook = new THREE.Vector3();
    this._currentLook = new THREE.Vector3();
    this._initialized = false;
  }

  update(dt, target) {
    const heading = target.rotation.y;

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
      const posT = 1 - Math.exp(-this.positionSmoothing * dt);
      const lookT = 1 - Math.exp(-this.lookSmoothing * dt);
      this.camera.position.lerp(this._desiredPosition, posT);
      this._currentLook.lerp(this._desiredLook, lookT);
    }

    this.camera.lookAt(this._currentLook);
  }
}
