import * as THREE from 'three';
import { CONFIG } from '../core/config.js';

// Tire skid marks: a fixed pool of dark quads managed as a ring buffer via
// InstancedMesh (one draw call). Oldest marks get overwritten, so the count
// stays bounded regardless of how long the player drifts.

export class SkidMarks {
  constructor() {
    const cfg = CONFIG.skidMarks;

    const geometry = new THREE.PlaneGeometry(cfg.width, cfg.length);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0x121212,
      transparent: true,
      opacity: cfg.opacity,
      depthWrite: false,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, cfg.maxMarks);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;

    this._cursor = 0;
    this._used = 0;
    this._dummy = new THREE.Object3D();
    this._lastMark = new Map(); // wheelKey -> last mark position
  }

  // Drop a mark at the wheel's contact point if it moved far enough since the last one.
  addMark(wheelKey, position, heading) {
    const cfg = CONFIG.skidMarks;
    const last = this._lastMark.get(wheelKey);
    if (last && last.distanceToSquared(position) < cfg.spacing * cfg.spacing) return;

    if (last) {
      last.copy(position);
    } else {
      this._lastMark.set(wheelKey, position.clone());
    }

    this._dummy.position.set(position.x, cfg.yOffset, position.z);
    this._dummy.rotation.set(0, heading, 0);
    this._dummy.updateMatrix();
    this.mesh.setMatrixAt(this._cursor, this._dummy.matrix);

    this._cursor = (this._cursor + 1) % cfg.maxMarks;
    this._used = Math.min(this._used + 1, cfg.maxMarks);
    this.mesh.count = this._used;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  // Call when a drift ends so the next drift starts a fresh trail
  // instead of interpolating spacing from the old one.
  endTrail() {
    this._lastMark.clear();
  }

  addTo(scene) {
    scene.add(this.mesh);
  }
}
