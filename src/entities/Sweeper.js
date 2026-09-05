import * as THREE from 'three';
import { CONFIG } from '../core/config.js';

// A slow "road sweeper" that circulates the track and must be overtaken.
// It follows the spline on rails (it is scenery, not a competitor), but it
// exposes x/z/heading so the normal collision path can push cars off it.

export class Sweeper {
  constructor({ samples, startT, lateralOffset }) {
    const cfg = CONFIG.obstacles.sweepers;
    this.samples = samples;
    this.n = samples.length;
    this.startT = startT;
    this.lateralOffset = lateralOffset;
    this.radius = cfg.radius;
    this.t = startT;

    this.mesh = new THREE.Group();

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: cfg.color,
      roughness: 0.75,
      metalness: 0.2,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 4.6), bodyMaterial);
    body.position.y = 1.05;
    body.castShadow = true;
    body.receiveShadow = true;
    this.mesh.add(body);

    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.9, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.6 })
    );
    cab.position.set(0, 2.05, 0.8);
    cab.castShadow = true;
    this.mesh.add(cab);

    // Amber beacon so it reads as a slow works vehicle.
    this.beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffb020 })
    );
    this.beacon.position.set(0, 2.6, 0.8);
    this.mesh.add(this.beacon);

    this._updateTransform();
  }

  reset() {
    this.t = this.startT;
    this._updateTransform();
  }

  update(dt, elapsed) {
    const cfg = CONFIG.obstacles.sweepers;
    // Advance by arc length so speed stays constant regardless of spline spacing.
    const spacing = this._sampleSpacing();
    this.t = (this.t + (cfg.speed * dt) / (spacing * this.n)) % 1;
    this._updateTransform();

    const pulse = 0.7 + Math.sin(elapsed * 8) * 0.3;
    this.beacon.scale.setScalar(pulse);
  }

  _sampleSpacing() {
    if (this._spacing) return this._spacing;
    let length = 0;
    for (let i = 0; i < this.n; i++) {
      const a = this.samples[i];
      const b = this.samples[(i + 1) % this.n];
      length += Math.hypot(b.x - a.x, b.z - a.z);
    }
    this._spacing = length / this.n;
    return this._spacing;
  }

  _updateTransform() {
    const idx = Math.floor(this.t * this.n) % this.n;
    const s = this.samples[idx];
    const next = this.samples[(idx + 1) % this.n];
    const prev = this.samples[(idx - 1 + this.n) % this.n];

    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dz / len;
    const nz = -dx / len;

    this.x = s.x + nx * this.lateralOffset;
    this.z = s.z + nz * this.lateralOffset;
    this.heading = Math.atan2(dx, dz);

    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }
}
