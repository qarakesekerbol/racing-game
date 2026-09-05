import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CONFIG, getQuality } from './config.js';

// Optional bloom. It is skipped entirely in daylight (nothing there needs to
// glow, and the composer costs a full-screen pass plus the bloom mip chain),
// and the bloom buffers run at a fraction of screen resolution on lower
// quality levels. When inactive, render() falls through to a direct render.

export class PostProcessing {
  constructor({ renderer, scene, camera }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = null;
    this.active = false;

    this._size = new THREE.Vector2();
    this._resolutionScale = 0;
    this._nightFactor = 0;
  }

  _build(scale) {
    this.composer?.dispose?.();
    this.renderer.getSize(this._size);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const cfg = CONFIG.bloom;
    const resolution = new THREE.Vector2(
      Math.max(64, Math.round(this._size.x * scale)),
      Math.max(64, Math.round(this._size.y * scale))
    );
    this.bloomPass = new UnrealBloomPass(resolution, cfg.strength, cfg.radius, cfg.threshold);
    this.composer.addPass(this.bloomPass);

    // Composer targets are linear; OutputPass applies tone mapping + sRGB.
    this.composer.addPass(new OutputPass());
    this.composer.setSize(this._size.x, this._size.y);
    this._resolutionScale = scale;
  }

  // nightFactor 0..1 decides whether bloom runs at all and how strong it is.
  setNightFactor(nightFactor) {
    this._nightFactor = nightFactor;
    const cfg = CONFIG.bloom;
    const quality = getQuality();

    const wanted =
      cfg.enabled &&
      quality.bloom &&
      (cfg.dayEnabled || nightFactor > 0.05);

    if (!wanted) {
      this.active = false;
      return;
    }

    if (!this.composer || this._resolutionScale !== quality.bloomResolutionScale) {
      this._build(quality.bloomResolutionScale);
    }
    this.active = true;

    this.bloomPass.strength =
      cfg.strength + (cfg.nightStrength - cfg.strength) * nightFactor;
    this.bloomPass.radius = cfg.radius;
    this.bloomPass.threshold = cfg.threshold;
  }

  render() {
    if (this.active && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  setSize(width, height) {
    this._size.set(width, height);
    if (!this.composer) return;
    this.composer.setSize(width, height);
    if (this.bloomPass) {
      this.bloomPass.resolution.set(
        Math.max(64, Math.round(width * this._resolutionScale)),
        Math.max(64, Math.round(height * this._resolutionScale))
      );
    }
  }
}
