import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CONFIG, getQuality } from './config.js';

// Cheap color grade: saturation boost + vignette in one fullscreen pass.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.14 },
    uVignette: { value: 0.34 },
    uVignetteSoftness: { value: 0.55 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uVignette;
    uniform float uVignetteSoftness;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.rgb = mix(vec3(luma), color.rgb, uSaturation);
      float d = distance(vUv, vec2(0.5));
      color.rgb *= 1.0 - uVignette * smoothstep(uVignetteSoftness - 0.25, 0.8, d);
      gl_FragColor = color;
    }
  `,
};

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

    this.gradePass = new ShaderPass(GradeShader);
    this.composer.addPass(this.gradePass);

    // Composer targets are linear; OutputPass applies tone mapping + sRGB.
    this.composer.addPass(new OutputPass());
    this.composer.setSize(this._size.x, this._size.y);
    this._resolutionScale = scale;
  }

  // nightFactor 0..1 decides whether bloom runs and how strong it is; the
  // grade pass (saturation + vignette) runs whenever the composer does.
  setNightFactor(nightFactor) {
    this._nightFactor = nightFactor;
    const cfg = CONFIG.bloom;
    const fx = CONFIG.postFX;
    const quality = getQuality();

    const bloomWanted =
      cfg.enabled && quality.bloom && (cfg.dayEnabled || nightFactor > 0.05);
    // Grade rides on the same quality gate as bloom so `low` skips the
    // composer entirely.
    const gradeWanted = fx.enabled && quality.bloom;

    if (!bloomWanted && !gradeWanted) {
      this.active = false;
      return;
    }

    if (!this.composer || this._resolutionScale !== quality.bloomResolutionScale) {
      this._build(quality.bloomResolutionScale);
    }
    this.active = true;

    this.bloomPass.enabled = bloomWanted;
    // Weight bloom toward real darkness: sunset (nightFactor ~0.7) gets much
    // less than night, instead of scaling linearly.
    const darkness = Math.max(0, (nightFactor - 0.5) / 0.5);
    this.bloomPass.strength =
      cfg.strength + (cfg.nightStrength - cfg.strength) * darkness;
    this.bloomPass.radius = cfg.radius;
    this.bloomPass.threshold = cfg.threshold;

    this.gradePass.enabled = gradeWanted;
    this.gradePass.uniforms.uSaturation.value = fx.saturation;
    this.gradePass.uniforms.uVignette.value = fx.vignette;
    this.gradePass.uniforms.uVignetteSoftness.value = fx.vignetteSoftness;
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
