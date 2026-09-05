import * as THREE from 'three';
import { CONFIG } from '../core/config.js';

// Headlights and tail lights for one car.
//
// The volumetric cone mesh was removed: from the chase camera it read as a flat
// white triangle floating over the roof. Instead every car projects an additive
// "light pool" decal onto the road ahead (one transparent quad, no light cost),
// and only the player additionally gets two real SpotLights.
//
// Tail lights are emissive boxes that brighten under braking.

let shared = null;

// Soft elongated glow for the road light pool, generated once.
// Written per-pixel so the falloff reaches zero on every edge — a plain
// canvas gradient leaves visible rectangular seams where the quad ends.
function makeBeamTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const v = y / (size - 1);
      // Beam widens toward the far end (v = 0) like a real headlight spill.
      const spread = 0.34 + (1 - v) * 0.46;
      const dx = (u - 0.5) / spread;
      const dy = (v - 0.82) / 0.85;
      const d = Math.sqrt(dx * dx + dy * dy);

      let alpha = Math.max(0, 1 - d);
      alpha *= alpha; // soften the core-to-edge ramp
      // Fade the very near edge so the pool doesn't cut off under the bumper.
      alpha *= Math.min(1, (1 - v) * 6);

      const i = (y * size + x) * 4;
      image.data[i] = 255;
      image.data[i + 1] = 244;
      image.data[i + 2] = 214;
      image.data[i + 3] = Math.round(Math.min(1, alpha) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function getShared() {
  if (shared) return shared;
  const head = CONFIG.lights.headlights;
  const tail = CONFIG.lights.tailLights;

  const decalGeometry = new THREE.PlaneGeometry(head.decalWidth, head.decalLength);
  decalGeometry.rotateX(-Math.PI / 2);

  shared = {
    lampGeometry: new THREE.BoxGeometry(0.3, 0.14, 0.08),
    lampMaterial: new THREE.MeshStandardMaterial({
      color: 0x222222,
      emissive: new THREE.Color(head.color),
      emissiveIntensity: 0,
      roughness: 0.4,
    }),
    decalGeometry,
    decalMaterial: new THREE.MeshBasicMaterial({
      map: makeBeamTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    }),
    tailGeometry: new THREE.BoxGeometry(tail.size * 2.2, tail.size, 0.1),
  };
  return shared;
}

export class CarLights {
  constructor({ carMesh, isPlayer }) {
    const res = getShared();
    const head = CONFIG.lights.headlights;
    const tail = CONFIG.lights.tailLights;

    this.isPlayer = isPlayer;

    // Per-car clones so each car fades independently.
    this.lampMaterial = res.lampMaterial.clone();
    this.decalMaterial = res.decalMaterial.clone();
    this.tailMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a0000,
      emissive: new THREE.Color(tail.color),
      emissiveIntensity: 0,
      roughness: 0.5,
    });

    this.group = new THREE.Group();
    carMesh.add(this.group);

    for (const side of [1, -1]) {
      const lamp = new THREE.Mesh(res.lampGeometry, this.lampMaterial);
      lamp.position.set(side * head.offsetX, head.offsetY, head.offsetZ);
      this.group.add(lamp);

      const tailLight = new THREE.Mesh(res.tailGeometry, this.tailMaterial);
      tailLight.position.set(side * tail.offsetX, tail.offsetY, tail.offsetZ);
      this.group.add(tailLight);
    }

    // Road light pool, flat on the ground just ahead of the car.
    this.decal = new THREE.Mesh(res.decalGeometry, this.decalMaterial);
    this.decal.position.set(0, 0.03 - 0, head.decalForward);
    this.decal.renderOrder = 2;
    this.group.add(this.decal);

    if (isPlayer) {
      this.spots = [];
      for (const side of [1, -1]) {
        const spot = new THREE.SpotLight(
          head.color,
          0,
          head.distance,
          head.angle,
          head.penumbra,
          1.5
        );
        spot.castShadow = false; // the sun is the only shadow caster
        spot.position.set(side * head.offsetX, head.offsetY, head.offsetZ);
        spot.target.position.set(side * head.offsetX * 0.5, -0.35, head.offsetZ + 16);
        this.group.add(spot);
        this.group.add(spot.target);
        this.spots.push(spot);
      }
    }
  }

  // on: headlights active (night/sunset); braking: tail lights bright;
  // intensity: 0..1 fade so lights come up smoothly during a transition.
  update(on, braking, intensity = 1) {
    const head = CONFIG.lights.headlights;
    const tail = CONFIG.lights.tailLights;
    const factor = on ? intensity : 0;

    this.lampMaterial.emissiveIntensity = factor * 2.2;

    // Squared so the road pool only appears in real darkness, not at sunset.
    const decalBase = this.isPlayer ? head.decalOpacity : head.decalOpacityAI;
    this.decalMaterial.opacity = factor * factor * decalBase;
    this.decal.visible = this.decalMaterial.opacity > 0.004;

    if (this.spots) {
      const spotIntensity = factor * head.playerSpotIntensity;
      for (const spot of this.spots) spot.intensity = spotIntensity;
      // Keep the light objects out of the shader's light list during the day.
      const visible = spotIntensity > 0.01;
      for (const spot of this.spots) spot.visible = visible;
    }

    const tailBase = tail.idleIntensity * factor;
    this.tailMaterial.emissiveIntensity = braking ? tail.brakeIntensity : tailBase;
  }
}
