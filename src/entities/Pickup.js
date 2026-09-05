import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { buildIcon, setIconType, setIconEmissive, ITEM_TYPES } from './ItemIcons.js';

// A floating item pickup: a glossy transparent sphere with an item icon
// hovering inside it, a soft glow halo, and a gentle bob/spin.
//
// The awarded item is decided by ItemManager at the moment of collection, so
// the sphere can't show "your" item ahead of time. Instead the icon cycles
// through the item types like a mystery box, and the HUD reveals the actual
// one you got using the same icon artwork in 2D.
//
// Glass: MeshPhysicalMaterial with `transmission` looks best but makes the
// renderer run a whole extra scene pass. The default here is a cheap custom
// fresnel shader that reads as glass for a fraction of the cost;
// CONFIG.pickups.useTransmission switches to the physical material.

let shared = null;

function buildGlassMaterial() {
  if (CONFIG.pickups.useTransmission) {
    return new THREE.MeshPhysicalMaterial({
      color: 0xdff2ff,
      metalness: 0,
      roughness: 0.08,
      transmission: 0.95,
      thickness: 0.6,
      ior: 1.4,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      transparent: true,
    });
  }

  // Fresnel glass: bright at grazing angles, near-clear head-on, so the icon
  // inside stays legible. Additive blending keeps it feeling lit from within.
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(0xbfe6ff) },
      uRim: { value: new THREE.Color(0xffffff) },
      uOpacity: { value: 0.5 },
      uBoost: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uRim;
      uniform float uOpacity;
      uniform float uBoost;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        float facing = abs(dot(normalize(vNormalW), normalize(vViewDir)));
        // Fresnel: thin in the middle, bright at the silhouette.
        float fresnel = pow(1.0 - facing, 2.6);
        vec3 color = mix(uColor * 0.5, uRim, fresnel);
        float alpha = (0.10 + fresnel * 0.9) * uOpacity;
        gl_FragColor = vec4(color * uBoost, alpha);
      }
    `,
  });
}

function getShared() {
  if (shared) return shared;
  const size = CONFIG.pickups.size;

  shared = {
    sphereGeometry: new THREE.SphereGeometry(size * 0.5, 20, 14),
    glassMaterial: buildGlassMaterial(),
    haloGeometry: new THREE.SphereGeometry(size * 0.64, 14, 10),
    haloMaterial: new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      uniforms: { uBoost: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uBoost;
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        void main() {
          float facing = abs(dot(normalize(vNormalW), normalize(vViewDir)));
          float glow = pow(1.0 - facing, 3.5) * 0.5;
          gl_FragColor = vec4(vec3(0.62, 0.86, 1.0) * uBoost, glow);
        }
      `,
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
    this._cycleTimer = Math.random() * cfg.iconCycleSeconds;
    this._iconIndex = Math.floor(Math.random() * ITEM_TYPES.length);

    this.mesh = new THREE.Group();
    this.mesh.position.set(position.x, cfg.hoverHeight, position.z);

    this._icon = buildIcon(ITEM_TYPES[this._iconIndex]);
    this._icon.scale.setScalar(cfg.size * 0.62);
    this.mesh.add(this._icon);

    // Sphere and halo draw after the icon so it shows through them.
    this._sphere = new THREE.Mesh(res.sphereGeometry, res.glassMaterial);
    this._sphere.renderOrder = 3;
    this.mesh.add(this._sphere);

    this._halo = new THREE.Mesh(res.haloGeometry, res.haloMaterial);
    this._halo.renderOrder = 2;
    this.mesh.add(this._halo);
  }

  static setEmissiveBoost(boost) {
    const res = getShared();
    // Damped: the raw night boost drives these into bloom clipping.
    const damped = 1 + (boost - 1) * 0.35;
    if (res.glassMaterial.uniforms?.uBoost) {
      res.glassMaterial.uniforms.uBoost.value = damped;
    }
    res.haloMaterial.uniforms.uBoost.value = damped;
    setIconEmissive(1.5 * damped);
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

    // Mystery-box shuffle: the icon rotates through the item types.
    this._cycleTimer -= dt;
    if (this._cycleTimer <= 0) {
      this._cycleTimer = cfg.iconCycleSeconds;
      this._iconIndex = (this._iconIndex + 1) % ITEM_TYPES.length;
      setIconType(this._icon, ITEM_TYPES[this._iconIndex]);
    }

    // Sway rather than spin: a flat extruded icon disappears edge-on for part
    // of a full rotation, so it swings within +/- ~55 degrees and stays legible
    // while still reading as "floating and turning".
    this._icon.rotation.y = Math.sin(elapsed * cfg.iconSwaySpeed + this._bobPhase) * cfg.iconSwayRange;
    this._icon.rotation.z = Math.sin(elapsed * cfg.iconSwaySpeed * 0.6 + this._bobPhase) * 0.12;
    this.mesh.position.y =
      cfg.hoverHeight + Math.sin(elapsed * cfg.bobSpeed + this._bobPhase) * cfg.bobAmplitude;

    const pulse = 1 + Math.sin(elapsed * 3 + this._bobPhase) * 0.05;
    this._sphere.scale.setScalar(pulse);
    this._halo.scale.setScalar(pulse);
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
