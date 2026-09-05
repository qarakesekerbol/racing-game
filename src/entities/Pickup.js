import * as THREE from 'three';
import { CONFIG } from '../core/config.js';

// A floating item box: iridescent rotating cube with a glow shell, bobbing in
// place. Geometry/materials are shared across every box on the track.

let shared = null;

function getShared() {
  if (shared) return shared;
  const size = CONFIG.pickups.size;

  // Hue cycles with world position and time in the shader, so each box shimmers
  // without needing a texture or per-box material.
  const boxMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBoost: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uBoost;
      varying vec3 vNormal;
      varying vec3 vPos;

      vec3 hue2rgb(float h) {
        return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      }

      void main() {
        float h = fract(uTime * 0.25 + vPos.y * 0.35 + vPos.x * 0.15);
        vec3 base = hue2rgb(h);
        // cheap rim light so the cube reads as 3D without a lit material
        float rim = pow(1.0 - abs(vNormal.z), 2.0);
        vec3 color = mix(base, vec3(1.0), rim * 0.5);
        // uBoost lifts the box above the bloom threshold at night.
        gl_FragColor = vec4(color * uBoost, 0.92);
      }
    `,
    transparent: true,
  });

  shared = {
    boxGeometry: new THREE.BoxGeometry(size, size, size),
    boxMaterial,
    glowGeometry: new THREE.SphereGeometry(size * 0.95, 16, 12),
    glowMaterial: new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      side: THREE.BackSide,
    }),
  };
  return shared;
}

export class Pickup {
  constructor(position) {
    const cfg = CONFIG.pickups;
    const res = getShared();

    this.position = position; // { x, z }
    this.active = true;
    this.respawnTimer = 0;
    this._bobPhase = Math.random() * Math.PI * 2;

    this.mesh = new THREE.Group();
    this.mesh.position.set(position.x, cfg.hoverHeight, position.z);

    this._box = new THREE.Mesh(res.boxGeometry, res.boxMaterial);
    this._box.castShadow = true;
    this.mesh.add(this._box);

    this.mesh.add(new THREE.Mesh(res.glowGeometry, res.glowMaterial));
  }

  static updateSharedTime(elapsed) {
    getShared().boxMaterial.uniforms.uTime.value = elapsed;
  }

  static setEmissiveBoost(boost) {
    // Damped: the raw night boost drives these fully into bloom clipping and
    // they read as white blobs instead of colored boxes.
    getShared().boxMaterial.uniforms.uBoost.value = 1 + (boost - 1) * 0.35;
  }

  update(dt, elapsed) {
    const cfg = CONFIG.pickups;

    if (!this.active) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.active = true;
        this.mesh.visible = true;
      }
      return;
    }

    this._box.rotation.y += cfg.spinSpeed * dt;
    this._box.rotation.x += cfg.spinSpeed * 0.4 * dt;
    this.mesh.position.y =
      cfg.hoverHeight + Math.sin(elapsed * cfg.bobSpeed + this._bobPhase) * cfg.bobAmplitude;
  }

  collect() {
    this.active = false;
    this.mesh.visible = false;
    this.respawnTimer = CONFIG.pickups.respawnTime;
  }

  reset() {
    this.active = true;
    this.mesh.visible = true;
    this.respawnTimer = 0;
  }
}
