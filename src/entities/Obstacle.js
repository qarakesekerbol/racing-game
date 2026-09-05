import * as THREE from 'three';
import { CONFIG } from '../core/config.js';

// Track obstacles. Three kinds share this file because they are variations of
// one concept (a thing on the track a car can hit); each is a small class with
// the same update/reset shape. Geometries and materials are shared per kind.

let shared = null;

function getShared() {
  if (shared) return shared;

  const coneGeometry = new THREE.ConeGeometry(0.32, 0.85, 12);
  coneGeometry.translate(0, 0.425, 0); // pivot at the base

  const tireGeometry = new THREE.TorusGeometry(0.55, 0.22, 8, 16);
  tireGeometry.rotateX(Math.PI / 2);

  shared = {
    coneGeometry,
    coneMaterial: new THREE.MeshStandardMaterial({ color: 0xff6b1a, roughness: 0.7 }),
    coneBandGeometry: new THREE.CylinderGeometry(0.24, 0.24, 0.14, 12),
    coneBandMaterial: new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6 }),
    tireGeometry,
    tireMaterial: new THREE.MeshStandardMaterial({ color: 0x1a1a1d, roughness: 0.95 }),
    slipperyGeometry: new THREE.CircleGeometry(1, 28),
    slipperyMaterial: new THREE.MeshStandardMaterial({
      color: 0x7fb8ff,
      roughness: 0.05,
      metalness: 0.85,
      transparent: true,
      opacity: 0.55,
    }),
  };
  return shared;
}

// A knock-away cone: barely slows the car, tumbles off, then resets.
export class Cone {
  constructor(position) {
    const res = getShared();
    this.home = { ...position };
    this.radius = CONFIG.obstacles.cones.radius;
    this.knocked = false;
    this._settleTimer = 0;
    this._velocity = { x: 0, y: 0, z: 0 };
    this._spin = { x: 0, z: 0 };

    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(res.coneGeometry, res.coneMaterial);
    body.castShadow = true;
    this.mesh.add(body);
    const band = new THREE.Mesh(res.coneBandGeometry, res.coneBandMaterial);
    band.position.y = 0.45;
    this.mesh.add(band);

    this.mesh.position.set(position.x, 0, position.z);
    this.mesh.rotation.y = Math.random() * Math.PI;
  }

  get position() {
    return this.mesh.position;
  }

  knock(dirX, dirZ, speed) {
    const cfg = CONFIG.obstacles.cones;
    this.knocked = true;
    this._settleTimer = cfg.settleTime;
    const push = Math.max(speed, 3);
    this._velocity.x = dirX * push;
    this._velocity.z = dirZ * push;
    this._velocity.y = 3.5;
    this._spin.x = (Math.random() - 0.5) * cfg.knockSpin * 2;
    this._spin.z = (Math.random() - 0.5) * cfg.knockSpin * 2;
  }

  update(dt) {
    if (!this.knocked) return;

    this._velocity.y -= 22 * dt; // gravity
    this.mesh.position.x += this._velocity.x * dt;
    this.mesh.position.y += this._velocity.y * dt;
    this.mesh.position.z += this._velocity.z * dt;

    if (this.mesh.position.y <= 0) {
      this.mesh.position.y = 0;
      this._velocity.y *= -0.35; // small bounce
      this._velocity.x *= 0.6;
      this._velocity.z *= 0.6;
      if (Math.abs(this._velocity.y) < 0.6) this._velocity.y = 0;
    }

    this.mesh.rotation.x += this._spin.x * dt;
    this.mesh.rotation.z += this._spin.z * dt;
    this._spin.x *= 0.96;
    this._spin.z *= 0.96;

    this._settleTimer -= dt;
    if (this._settleTimer <= 0) this.reset();
  }

  reset() {
    this.knocked = false;
    this._velocity = { x: 0, y: 0, z: 0 };
    this._spin = { x: 0, z: 0 };
    this.mesh.position.set(this.home.x, 0, this.home.z);
    this.mesh.rotation.set(0, Math.random() * Math.PI, 0);
  }
}

// A solid tire stack: does not move, costs a lot of speed.
export class TireStack {
  constructor(position) {
    const res = getShared();
    this.position = { ...position };
    this.radius = CONFIG.obstacles.tireStacks.radius;

    this.mesh = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const tire = new THREE.Mesh(res.tireGeometry, res.tireMaterial);
      tire.position.y = 0.22 + i * 0.4;
      tire.rotation.y = Math.random() * Math.PI;
      tire.castShadow = true;
      tire.receiveShadow = true;
      this.mesh.add(tire);
    }
    this.mesh.position.set(position.x, 0, position.z);
  }
}

// A shiny low-grip patch (puddle / ice) lying on the road.
export class SlipperyPatch {
  constructor(position, radius) {
    const res = getShared();
    this.position = { ...position };
    this.radius = radius;

    this.mesh = new THREE.Mesh(res.slipperyGeometry, res.slipperyMaterial);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.scale.setScalar(radius);
    this.mesh.position.set(position.x, 0.045, position.z);
    this.mesh.receiveShadow = false;
  }
}
