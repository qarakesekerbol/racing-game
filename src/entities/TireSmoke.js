import * as THREE from 'three';
import { CONFIG } from '../core/config.js';

// Tire smoke: a fixed-size particle pool rendered as THREE.Points with a tiny
// shader for per-particle fade and growth (PointsMaterial can't fade per point).
// Dead particles just render with alpha 0 — pool is small enough not to matter.

export class TireSmoke {
  constructor() {
    const cfg = CONFIG.smoke;
    this.max = cfg.maxParticles;

    this._positions = new Float32Array(this.max * 3);
    this._progress = new Float32Array(this.max); // 1 = just born, 0 = dead
    this._sizes = new Float32Array(this.max);
    this._velocities = new Float32Array(this.max * 3);
    this._life = new Float32Array(this.max); // seconds remaining
    this._maxLife = new Float32Array(this.max);
    this._cursor = 0;
    this._spawnDebt = 0;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
    geometry.setAttribute('aProgress', new THREE.BufferAttribute(this._progress, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this._sizes, 1));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uOpacity: { value: cfg.opacity },
      },
      vertexShader: /* glsl */ `
        attribute float aProgress;
        attribute float aSize;
        varying float vProgress;
        void main() {
          vProgress = aProgress;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          // Puffs grow as they age.
          float growth = 1.0 + (1.0 - aProgress) * 1.6;
          gl_PointSize = aSize * growth * (18.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying float vProgress;
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          float alpha = smoothstep(0.5, 0.12, dist) * vProgress * uOpacity;
          gl_FragColor = vec4(vec3(0.88), alpha);
        }
      `,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
  }

  // Emit particles at a world position; intensity (0..1) scales the rate.
  spawnAt(position, dt, intensity = 1) {
    const cfg = CONFIG.smoke;
    this._spawnDebt += cfg.ratePerWheel * intensity * dt;

    while (this._spawnDebt >= 1) {
      this._spawnDebt -= 1;
      const i = this._cursor;
      this._cursor = (this._cursor + 1) % this.max;

      this._positions[i * 3] = position.x + rand(-0.15, 0.15);
      this._positions[i * 3 + 1] = 0.2;
      this._positions[i * 3 + 2] = position.z + rand(-0.15, 0.15);

      this._velocities[i * 3] = rand(-cfg.spread, cfg.spread);
      this._velocities[i * 3 + 1] = rand(cfg.rise[0], cfg.rise[1]);
      this._velocities[i * 3 + 2] = rand(-cfg.spread, cfg.spread);

      const life = rand(cfg.life[0], cfg.life[1]);
      this._life[i] = life;
      this._maxLife[i] = life;
      this._sizes[i] = rand(cfg.size[0], cfg.size[1]);
      this._progress[i] = 1;
    }
  }

  update(dt) {
    const damping = Math.exp(-2.2 * dt); // horizontal drift slows down over time
    let anyAlive = false;

    for (let i = 0; i < this.max; i++) {
      if (this._life[i] <= 0) continue;
      anyAlive = true;

      this._life[i] -= dt;
      if (this._life[i] <= 0) {
        this._progress[i] = 0;
        continue;
      }

      this._positions[i * 3] += this._velocities[i * 3] * dt;
      this._positions[i * 3 + 1] += this._velocities[i * 3 + 1] * dt;
      this._positions[i * 3 + 2] += this._velocities[i * 3 + 2] * dt;
      this._velocities[i * 3] *= damping;
      this._velocities[i * 3 + 2] *= damping;

      this._progress[i] = this._life[i] / this._maxLife[i];
    }

    if (anyAlive) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.aProgress.needsUpdate = true;
      this.points.geometry.attributes.aSize.needsUpdate = true;
    }
  }

  addTo(scene) {
    scene.add(this.points);
  }
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}
