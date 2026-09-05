import * as THREE from 'three';
import { CarPhysics } from '../core/CarPhysics.js';
import { CarLights } from './CarLights.js';
import { CONFIG } from '../core/config.js';

// Visual representation of a car built from primitives.
// Owns a CarPhysics instance and syncs the mesh from its numeric state each frame.
// Geometries and non-body materials are shared across all cars (player + AI);
// body materials are cached per color.

const BODY_WIDTH = 1.8;
const BODY_HEIGHT = 0.6;
const BODY_LENGTH = 4.2;
const WHEEL_RADIUS = 0.35;
const WHEEL_WIDTH = 0.3;

let shared = null;
const bodyMaterialCache = new Map();

function getShared() {
  if (shared) return shared;

  const wheelGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 20);
  // Bake the cylinder orientation so the wheel's local X axis is its rolling
  // axle; mesh.rotation.x can then be used purely for spin.
  wheelGeometry.rotateZ(Math.PI / 2);

  shared = {
    bodyGeometry: new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_LENGTH),
    cabinGeometry: new THREE.BoxGeometry(
      BODY_WIDTH * 0.75,
      BODY_HEIGHT * 0.75,
      BODY_LENGTH * 0.42
    ),
    wheelGeometry,
    cabinMaterial: new THREE.MeshStandardMaterial({
      color: 0x1b1f24,
      metalness: 0.1,
      roughness: 0.6,
    }),
    wheelMaterial: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
  };
  return shared;
}

function getBodyMaterial(color) {
  if (!bodyMaterialCache.has(color)) {
    bodyMaterialCache.set(
      color,
      new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 })
    );
  }
  return bodyMaterialCache.get(color);
}

export class Car {
  constructor({ color = '#d1263a', isPlayer = false } = {}) {
    this.physics = new CarPhysics();
    this.mesh = new THREE.Group();
    this.color = color;
    this.isPlayer = isPlayer;
    this._roll = 0; // smoothed body roll, radians
    this._braking = false;
    this._buildMesh();
    this.lights = new CarLights({ carMesh: this.mesh, isPlayer });
  }

  // on: headlights active; intensity: 0..1 fade during a time-of-day transition
  updateLights(on, intensity) {
    this.lights.update(on, this._braking, intensity);
  }

  _buildMesh() {
    const res = getShared();

    // Body + cabin live in their own group so they can roll into turns
    // without tilting the wheels.
    this._bodyGroup = new THREE.Group();
    this.mesh.add(this._bodyGroup);

    const body = new THREE.Mesh(res.bodyGeometry, getBodyMaterial(this.color));
    body.position.y = WHEEL_RADIUS + BODY_HEIGHT / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    this._bodyGroup.add(body);

    const cabinHeight = BODY_HEIGHT * 0.75;
    const cabin = new THREE.Mesh(res.cabinGeometry, res.cabinMaterial);
    cabin.position.set(
      0,
      body.position.y + BODY_HEIGHT / 2 + cabinHeight / 2 - 0.05,
      -BODY_LENGTH * 0.06
    );
    cabin.castShadow = true;
    this._bodyGroup.add(cabin);

    const offsetX = BODY_WIDTH / 2 + WHEEL_WIDTH / 2 - 0.08;
    const offsetZ = BODY_LENGTH / 2 - WHEEL_RADIUS - 0.25;

    this.wheels = {
      frontLeft: this._createWheel(res, offsetX, offsetZ),
      frontRight: this._createWheel(res, -offsetX, offsetZ),
      rearLeft: this._createWheel(res, offsetX, -offsetZ),
      rearRight: this._createWheel(res, -offsetX, -offsetZ),
    };
  }

  _createWheel(res, x, z) {
    // Pivot group handles steering (Y rotation); inner mesh handles spin (X rotation).
    const pivot = new THREE.Group();
    pivot.position.set(x, WHEEL_RADIUS, z);

    const wheelMesh = new THREE.Mesh(res.wheelGeometry, res.wheelMaterial);
    wheelMesh.castShadow = true;
    wheelMesh.receiveShadow = true;
    pivot.add(wheelMesh);

    this.mesh.add(pivot);
    pivot.userData.spinMesh = wheelMesh;
    return pivot;
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

    const spinDelta = (state.speed / WHEEL_RADIUS) * dt;
    for (const wheel of Object.values(this.wheels)) {
      wheel.userData.spinMesh.rotation.x += spinDelta;
    }

    this._updateBodyRoll(dt, state);
  }

  // Mesh follows physics. Called from update() and again after collision
  // resolution, which mutates physics positions after the entity update.
  syncTransform() {
    this.mesh.position.set(this.physics.x, 0, this.physics.z);
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
