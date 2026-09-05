import * as THREE from 'three';
import { CarPhysics } from '../core/CarPhysics.js';
import { CONFIG } from '../core/config.js';

// Visual representation of the car built from primitives.
// Owns a CarPhysics instance and syncs the mesh from its numeric state each frame.

const BODY_WIDTH = 1.8;
const BODY_HEIGHT = 0.6;
const BODY_LENGTH = 4.2;
const WHEEL_RADIUS = 0.35;
const WHEEL_WIDTH = 0.3;

export class Car {
  constructor() {
    this.physics = new CarPhysics();
    this.mesh = new THREE.Group();
    this._roll = 0; // smoothed body roll, radians
    this._buildMesh();
  }

  _buildMesh() {
    // Body + cabin live in their own group so they can roll into turns
    // without tilting the wheels.
    this._bodyGroup = new THREE.Group();
    this.mesh.add(this._bodyGroup);

    const bodyGeometry = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_LENGTH);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xd1263a,
      metalness: 0.3,
      roughness: 0.5,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = WHEEL_RADIUS + BODY_HEIGHT / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    this._bodyGroup.add(body);

    const cabinHeight = BODY_HEIGHT * 0.75;
    const cabinGeometry = new THREE.BoxGeometry(
      BODY_WIDTH * 0.75,
      cabinHeight,
      BODY_LENGTH * 0.42
    );
    const cabinMaterial = new THREE.MeshStandardMaterial({
      color: 0x1b1f24,
      metalness: 0.1,
      roughness: 0.6,
    });
    const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
    cabin.position.set(
      0,
      body.position.y + BODY_HEIGHT / 2 + cabinHeight / 2 - 0.05,
      -BODY_LENGTH * 0.06
    );
    cabin.castShadow = true;
    this._bodyGroup.add(cabin);

    // Bake the cylinder orientation into the geometry so the wheel's local X axis
    // is its rolling axle; mesh.rotation.x can then be used purely for spin.
    const wheelGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 20);
    wheelGeometry.rotateZ(Math.PI / 2);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

    const offsetX = BODY_WIDTH / 2 + WHEEL_WIDTH / 2 - 0.08;
    const offsetZ = BODY_LENGTH / 2 - WHEEL_RADIUS - 0.25;

    this.wheels = {
      frontLeft: this._createWheel(wheelGeometry, wheelMaterial, offsetX, offsetZ),
      frontRight: this._createWheel(wheelGeometry, wheelMaterial, -offsetX, offsetZ),
      rearLeft: this._createWheel(wheelGeometry, wheelMaterial, offsetX, -offsetZ),
      rearRight: this._createWheel(wheelGeometry, wheelMaterial, -offsetX, -offsetZ),
    };
  }

  _createWheel(geometry, material, x, z) {
    // Pivot group handles steering (Y rotation); inner mesh handles spin (X rotation).
    const pivot = new THREE.Group();
    pivot.position.set(x, WHEEL_RADIUS, z);

    const wheelMesh = new THREE.Mesh(geometry, material);
    wheelMesh.castShadow = true;
    wheelMesh.receiveShadow = true;
    pivot.add(wheelMesh);

    this.mesh.add(pivot);
    pivot.userData.spinMesh = wheelMesh;
    return pivot;
  }

  reset(x, z, heading) {
    this.physics.reset(x, z, heading);
    const state = this.physics.getState();
    this.mesh.position.set(state.x, 0, state.z);
    this.mesh.rotation.y = state.heading;
  }

  update(dt, input) {
    this.physics.update(dt, input);
    const state = this.physics.getState();

    this.mesh.position.set(state.x, 0, state.z);
    this.mesh.rotation.y = state.heading;

    this.wheels.frontLeft.rotation.y = state.steerAngle;
    this.wheels.frontRight.rotation.y = state.steerAngle;

    const spinDelta = (state.speed / WHEEL_RADIUS) * dt;
    for (const wheel of Object.values(this.wheels)) {
      wheel.userData.spinMesh.rotation.x += spinDelta;
    }

    this._updateBodyRoll(dt, state);
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
