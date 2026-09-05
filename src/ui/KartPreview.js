import * as THREE from 'three';
import { buildKart, deriveAccent } from '../entities/CarModel.js';

// A small standalone 3D view of the chosen kart, rendered into its own canvas
// on the setup screen. Separate renderer/scene from the game so it can't
// disturb the race view; it only ticks while the setup screen is open.

export class KartPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.active = false;
    this._angle = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.width, canvas.height, false);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, canvas.width / canvas.height, 0.1, 60);
    this.camera.position.set(0, 2.4, 6.4);
    this.camera.lookAt(0, 0.55, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xfff2dd, 1.5);
    key.position.set(4, 6, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fc7ff, 0.7);
    rim.position.set(-5, 3, -4);
    this.scene.add(rim);

    this.turntable = new THREE.Group();
    this.scene.add(this.turntable);

    this._style = null;
    this._color = null;
  }

  setKart(style, color) {
    if (style === this._style && color === this._color) return;
    this._style = style;
    this._color = color;

    if (this._kart) {
      this.turntable.remove(this._kart.group);
      disposeGroup(this._kart.group);
    }
    this._kart = buildKart({
      bodyColor: color,
      accentColor: deriveAccent(color),
      style,
    });
    this.turntable.add(this._kart.group);
  }

  setActive(active) {
    this.active = active;
  }

  update(dt) {
    if (!this.active || !this._kart) return;
    this._angle += dt * 0.7;
    this.turntable.rotation.y = this._angle;
    // Gentle bob so the kart feels presented rather than parked.
    this.turntable.position.y = Math.sin(this._angle * 1.6) * 0.04;
    this.renderer.render(this.scene, this.camera);
  }
}

function disposeGroup(root) {
  root.traverse((o) => {
    if (o.isMesh) o.geometry?.dispose();
  });
}
