import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Pickup } from '../entities/Pickup.js';

// Places rows of item boxes across the road and detects collection by any car.
// Collection itself is delegated to ItemManager so player and AI share one path.

export class PickupManager {
  constructor({ track, itemManager, pickupData }) {
    this.itemManager = itemManager;
    this.pickups = [];

    // Row placement comes from the track; behavior (respawn, radius, look)
    // stays global in CONFIG.
    const cfg = { ...CONFIG.pickups, ...pickupData };
    for (const t of cfg.spots) {
      const point = track.curve.getPointAt(t);
      const tangent = track.curve.getTangentAt(t);
      // left-hand normal, matching Track's road/barrier convention
      const nx = tangent.z;
      const nz = -tangent.x;
      const half = (cfg.perRow - 1) / 2;

      for (let i = 0; i < cfg.perRow; i++) {
        const offset = (i - half) * cfg.rowSpacing;
        this.pickups.push(
          new Pickup({ x: point.x + nx * offset, z: point.z + nz * offset })
        );
      }
    }
  }

  // One Points cloud carries the sparkles for every pickup, so the whole
  // effect is a single draw call regardless of pickup count.
  _buildSparkles() {
    const cfg = CONFIG.pickups;
    const count = this.pickups.length * cfg.sparklesPer;
    this._sparklePositions = new Float32Array(count * 3);
    this._sparklePhase = new Float32Array(count);
    for (let i = 0; i < count; i++) this._sparklePhase[i] = Math.random() * Math.PI * 2;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this._sparklePositions, 3));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uSize: { value: cfg.sparkleSize } },
      vertexShader: `
        uniform float uSize;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * (12.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          float a = smoothstep(0.5, 0.05, d) * 0.75;
          gl_FragColor = vec4(0.85, 0.95, 1.0, a);
        }
      `,
    });

    this.sparkles = new THREE.Points(geometry, material);
    this.sparkles.frustumCulled = false;
  }

  _updateSparkles(elapsed) {
    const cfg = CONFIG.pickups;
    const pos = this._sparklePositions;
    let i = 0;
    for (const pickup of this.pickups) {
      for (let k = 0; k < cfg.sparklesPer; k++) {
        const idx = i * 3;
        if (!pickup.active) {
          // Park collected pickups' sparkles far below the world.
          pos[idx + 1] = -999;
          i++;
          continue;
        }
        const phase = this._sparklePhase[i];
        const angle = elapsed * 1.4 + phase;
        const rise = Math.sin(elapsed * 2 + phase) * 0.45;
        pos[idx] = pickup.position.x + Math.cos(angle) * cfg.sparkleRadius;
        pos[idx + 1] = pickup.mesh.position.y + rise;
        pos[idx + 2] = pickup.position.z + Math.sin(angle) * cfg.sparkleRadius;
        i++;
      }
    }
    this.sparkles.geometry.attributes.position.needsUpdate = true;
  }

  addTo(scene) {
    for (const pickup of this.pickups) scene.add(pickup.mesh);
    if (!this.sparkles) this._buildSparkles();
    scene.add(this.sparkles);
  }

  // cars: [{ id, physics }] — returns events for burst visuals.
  update(dt, elapsed, cars) {
    const cfg = CONFIG.pickups;
    const events = [];

    for (const pickup of this.pickups) {
      pickup.update(dt, elapsed);
      if (!pickup.active) continue;

      for (const car of cars) {
        const dx = car.physics.x - pickup.position.x;
        const dz = car.physics.z - pickup.position.z;
        if (dx * dx + dz * dz > cfg.pickupRadius * cfg.pickupRadius) continue;

        const item = this.itemManager.giveRandomItem(car.id);
        if (item === null) continue; // slot full: box stays for someone else

        pickup.collect();
        events.push({ type: 'pickup', carId: car.id, item, position: pickup.position });
        break;
      }
    }

    this._updateSparkles(elapsed);
    return events;
  }

  reset() {
    for (const pickup of this.pickups) pickup.reset();
  }
}
