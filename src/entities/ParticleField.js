import * as THREE from 'three';

// General-purpose colored particle pool (THREE.Points + small shader), used for
// pickup bursts, nitro flames and rocket trails. One draw call for everything;
// dead particles render at alpha 0.

const TMP_COLOR = new THREE.Color();

export class ParticleField {
  constructor(maxParticles = 600) {
    this.max = maxParticles;

    this._positions = new Float32Array(this.max * 3);
    this._colors = new Float32Array(this.max * 3);
    this._progress = new Float32Array(this.max);
    this._sizes = new Float32Array(this.max);
    this._velocities = new Float32Array(this.max * 3);
    this._life = new Float32Array(this.max);
    this._maxLife = new Float32Array(this.max);
    this._gravity = new Float32Array(this.max);
    this._cursor = 0;
    this._debt = 0;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this._colors, 3));
    geometry.setAttribute('aProgress', new THREE.BufferAttribute(this._progress, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this._sizes, 1));

    this._material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uBoost: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aProgress;
        attribute float aSize;
        attribute vec3 aColor;
        varying float vProgress;
        varying vec3 vColor;
        void main() {
          vProgress = aProgress;
          vColor = aColor;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (18.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uBoost;
        varying float vProgress;
        varying vec3 vColor;
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          float alpha = smoothstep(0.5, 0.05, dist) * vProgress;
          // Brighter at night so effects read against a dark scene (and bloom).
          gl_FragColor = vec4(vColor * uBoost, alpha);
        }
      `,
    });

    this.points = new THREE.Points(geometry, this._material);
    this.points.frustumCulled = false;
  }

  // opts: { position:{x,y,z}, color, size, life, velocity:{x,y,z}, spread, gravity }
  spawn({ position, color, size = 20, life = 0.6, velocity, spread = 0, gravity = 0 }) {
    const i = this._cursor;
    this._cursor = (this._cursor + 1) % this.max;

    this._positions[i * 3] = position.x;
    this._positions[i * 3 + 1] = position.y;
    this._positions[i * 3 + 2] = position.z;

    this._velocities[i * 3] = (velocity?.x ?? 0) + rand(-spread, spread);
    this._velocities[i * 3 + 1] = (velocity?.y ?? 0) + rand(-spread, spread) * 0.5;
    this._velocities[i * 3 + 2] = (velocity?.z ?? 0) + rand(-spread, spread);

    TMP_COLOR.set(color);
    this._colors[i * 3] = TMP_COLOR.r;
    this._colors[i * 3 + 1] = TMP_COLOR.g;
    this._colors[i * 3 + 2] = TMP_COLOR.b;

    this._life[i] = life;
    this._maxLife[i] = life;
    this._sizes[i] = size;
    this._gravity[i] = gravity;
    this._progress[i] = 1;
  }

  // Rate-based emission with fractional carry-over, so emission is smooth
  // regardless of frame time.
  emit(rate, dt, options) {
    this._debt += rate * dt;
    while (this._debt >= 1) {
      this._debt -= 1;
      this.spawn(options());
    }
  }

  burst(count, options) {
    for (let i = 0; i < count; i++) this.spawn(options());
  }

  update(dt) {
    let anyAlive = false;
    for (let i = 0; i < this.max; i++) {
      if (this._life[i] <= 0) continue;
      anyAlive = true;

      this._life[i] -= dt;
      if (this._life[i] <= 0) {
        this._progress[i] = 0;
        continue;
      }

      this._velocities[i * 3 + 1] -= this._gravity[i] * dt;
      this._positions[i * 3] += this._velocities[i * 3] * dt;
      this._positions[i * 3 + 1] += this._velocities[i * 3 + 1] * dt;
      this._positions[i * 3 + 2] += this._velocities[i * 3 + 2] * dt;

      this._progress[i] = this._life[i] / this._maxLife[i];
    }

    if (anyAlive) {
      const attrs = this.points.geometry.attributes;
      attrs.position.needsUpdate = true;
      attrs.aProgress.needsUpdate = true;
      attrs.aSize.needsUpdate = true;
      attrs.aColor.needsUpdate = true;
    }
  }

  setEmissiveBoost(boost) {
    this._material.uniforms.uBoost.value = boost;
  }

  addTo(scene) {
    scene.add(this.points);
  }
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}
