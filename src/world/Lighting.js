import * as THREE from 'three';

// Sun (directional, shadow-casting) plus soft ambient fill.

export class Lighting {
  constructor() {
    this.ambient = new THREE.AmbientLight(0xffffff, 0.55);

    this.sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
    this.sun.position.set(60, 90, -40);
    this.sun.castShadow = true;

    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = -130;
    shadowCamera.right = 130;
    shadowCamera.top = 130;
    shadowCamera.bottom = -130;
    shadowCamera.near = 1;
    shadowCamera.far = 300;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
  }

  addTo(scene) {
    scene.add(this.ambient);
    scene.add(this.sun);
    scene.add(this.sun.target);
  }
}
