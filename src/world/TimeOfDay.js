import * as THREE from 'three';
import { CONFIG } from '../core/config.js';

// Drives every lighting/atmosphere value from a named mode (day/sunset/night).
// Switching modes cross-fades all values over transitionSeconds instead of
// snapping; consumers read the blended state via getState() each frame.

const MODE_ORDER = ['day', 'sunset', 'night'];

export class TimeOfDay {
  constructor({ scene, lighting, sky }) {
    this.scene = scene;
    this.lighting = lighting;
    this.sky = sky;

    this.modeIndex = Math.max(0, MODE_ORDER.indexOf(CONFIG.timeOfDay.startMode));
    this._from = resolveMode(MODE_ORDER[this.modeIndex]);
    this._to = this._from;
    this._blend = 1; // 1 = fully at _to
    this._autoTimer = 0;

    this.current = cloneState(this._from);
    this._apply();
  }

  get modeName() {
    return MODE_ORDER[this.modeIndex];
  }

  get label() {
    return CONFIG.timeOfDay.modes[this.modeName].label;
  }

  cycle() {
    this.setMode(MODE_ORDER[(this.modeIndex + 1) % MODE_ORDER.length]);
    return this.label;
  }

  setMode(name) {
    const index = MODE_ORDER.indexOf(name);
    if (index === -1 || index === this.modeIndex) return;
    // Start the new blend from wherever the current cross-fade actually is,
    // so rapid toggles never pop.
    this._from = cloneState(this.current);
    this.modeIndex = index;
    this._to = resolveMode(name);
    this._blend = 0;
    this._autoTimer = 0;
  }

  update(dt) {
    const cfg = CONFIG.timeOfDay;

    if (this._blend < 1) {
      this._blend = Math.min(1, this._blend + dt / cfg.transitionSeconds);
      // smoothstep for an ease-in-out fade
      const t = this._blend * this._blend * (3 - 2 * this._blend);
      lerpState(this.current, this._from, this._to, t);
      this._apply();
    } else if (cfg.autoCycle) {
      this._autoTimer += dt;
      if (this._autoTimer >= cfg.autoCycleSeconds) this.cycle();
    }
  }

  _apply() {
    const s = this.current;

    this.lighting.sun.color.copy(s.sunColor);
    this.lighting.sun.intensity = s.sunIntensity;
    // Sun position is owned by Lighting.follow() — it keeps the tight shadow
    // frustum over the player. Here we only publish the direction.
    this.lighting.setDirection(s.sunDirection);
    this.lighting.ambient.color.copy(s.ambientColor);
    this.lighting.ambient.intensity = s.ambientIntensity;

    this.scene.fog.color.copy(s.fogColor);
    this.scene.fog.near = s.fogNear;
    this.scene.fog.far = s.fogFar;
    this.scene.background.copy(s.fogColor);

    this.sky.applyMode(s);
  }

  // Values other systems react to (headlights, emissive boost, bloom).
  getState() {
    return this.current;
  }
}

function resolveMode(name) {
  const raw = CONFIG.timeOfDay.modes[name];
  return {
    sunDirection: new THREE.Vector3(...raw.sunDirection),
    sunColor: new THREE.Color(raw.sunColor),
    sunIntensity: raw.sunIntensity,
    ambientColor: new THREE.Color(raw.ambientColor),
    ambientIntensity: raw.ambientIntensity,
    skyTop: new THREE.Color(raw.skyTop),
    skyBottom: new THREE.Color(raw.skyBottom),
    fogColor: new THREE.Color(raw.fogColor),
    fogNear: raw.fogNear,
    fogFar: raw.fogFar,
    shadowOpacity: raw.shadowOpacity,
    starOpacity: raw.starOpacity,
    // Booleans can't lerp; cross the threshold at the halfway point.
    headlights: raw.headlights,
    emissiveBoost: raw.emissiveBoost,
  };
}

function cloneState(s) {
  return {
    sunDirection: s.sunDirection.clone(),
    sunColor: s.sunColor.clone(),
    sunIntensity: s.sunIntensity,
    ambientColor: s.ambientColor.clone(),
    ambientIntensity: s.ambientIntensity,
    skyTop: s.skyTop.clone(),
    skyBottom: s.skyBottom.clone(),
    fogColor: s.fogColor.clone(),
    fogNear: s.fogNear,
    fogFar: s.fogFar,
    shadowOpacity: s.shadowOpacity,
    starOpacity: s.starOpacity,
    headlights: s.headlights,
    emissiveBoost: s.emissiveBoost,
  };
}

function lerpState(out, a, b, t) {
  out.sunDirection.lerpVectors(a.sunDirection, b.sunDirection, t);
  out.sunColor.copy(a.sunColor).lerp(b.sunColor, t);
  out.sunIntensity = lerp(a.sunIntensity, b.sunIntensity, t);
  out.ambientColor.copy(a.ambientColor).lerp(b.ambientColor, t);
  out.ambientIntensity = lerp(a.ambientIntensity, b.ambientIntensity, t);
  out.skyTop.copy(a.skyTop).lerp(b.skyTop, t);
  out.skyBottom.copy(a.skyBottom).lerp(b.skyBottom, t);
  out.fogColor.copy(a.fogColor).lerp(b.fogColor, t);
  out.fogNear = lerp(a.fogNear, b.fogNear, t);
  out.fogFar = lerp(a.fogFar, b.fogFar, t);
  out.shadowOpacity = lerp(a.shadowOpacity, b.shadowOpacity, t);
  out.starOpacity = lerp(a.starOpacity, b.starOpacity, t);
  out.emissiveBoost = lerp(a.emissiveBoost, b.emissiveBoost, t);
  out.headlights = t < 0.5 ? a.headlights : b.headlights;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
