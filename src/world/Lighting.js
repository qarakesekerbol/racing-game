import * as THREE from 'three';
import { CONFIG, getQuality } from '../core/config.js';

// The scene's only shadow-casting light: one directional sun/moon plus ambient
// fill. The shadow frustum is deliberately small and follows the player instead
// of covering the whole track — a tight frustum is both cheaper and sharper.

export class Lighting {
  constructor() {
    this.ambient = new THREE.AmbientLight(0xffffff, 0.55);

    this.sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
    this.sun.position.set(60, 90, -40);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;

    this._shadowMapSize = 0;
    this._shadowRadius = 0;
    this._direction = new THREE.Vector3(60, 90, -40);
    this.applyQuality();
  }

  // Reads the active quality level; safe to call every frame (it early-outs).
  applyQuality() {
    const q = getQuality();
    if (q.shadowMapSize !== this._shadowMapSize) {
      this._shadowMapSize = q.shadowMapSize;
      this.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      // Force the shadow map to be rebuilt at the new resolution.
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
    if (q.shadowRadius !== this._shadowRadius) {
      this._shadowRadius = q.shadowRadius;
      const cam = this.sun.shadow.camera;
      cam.left = -q.shadowRadius;
      cam.right = q.shadowRadius;
      cam.top = q.shadowRadius;
      cam.bottom = -q.shadowRadius;
      cam.near = 1;
      cam.far = q.shadowRadius * 4;
      cam.updateProjectionMatrix();
    }
  }

  // Keep the sun a fixed offset from the player so the small shadow frustum
  // always covers the action. `direction` is the mode's light position vector.
  setDirection(direction) {
    this._direction.copy(direction);
  }

  follow(targetPosition) {
    const distance = Math.max(this._shadowRadius * 1.6, 80);
    const dir = this._direction.clone().normalize().multiplyScalar(distance);
    this.sun.position.copy(targetPosition).add(dir);
    this.sun.target.position.copy(targetPosition);
    this.sun.target.updateMatrixWorld();
  }

  addTo(scene) {
    scene.add(this.ambient);
    scene.add(this.sun);
    scene.add(this.sun.target);
  }
}
