import * as THREE from 'three';

// Large flat grass plane with a subtle grid overlay for a sense of speed.

const GROUND_SIZE = 1000;

const GRASS_COLOR = 0x3f7a38;
const NIGHT_TINT = 0x27384f; // dark blue-green, not lit grass

export class Ground {
  constructor() {
    const geometry = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
    const material = new THREE.MeshStandardMaterial({ color: GRASS_COLOR, roughness: 1 });
    this._material = material;
    this._dayColor = new THREE.Color(GRASS_COLOR);
    this._nightColor = new THREE.Color(GRASS_COLOR).multiply(new THREE.Color(NIGHT_TINT));
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;

    this.grid = new THREE.GridHelper(GROUND_SIZE, GROUND_SIZE / 10, 0x2f5c2a, 0x2f5c2a);
    this.grid.position.y = 0.01;
    // Grid lines are unlit, so they would stay fully bright at night unless
    // faded manually. Fog does not apply to LineBasicMaterial by default here.
    this.grid.material.transparent = true;
    this._gridBaseColor = this.grid.material.color.clone();
  }

  // nightFactor 0..1 — dims the grid and tints the grass toward dark blue-green.
  // Ambient light alone leaves the grass reading as "lit green" at night.
  setNightFactor(nightFactor) {
    const dim = 1 - nightFactor * 0.9;
    this.grid.material.color.copy(this._gridBaseColor).multiplyScalar(dim);
    this.grid.material.opacity = 1 - nightFactor * 0.7;

    this._material.color.copy(this._dayColor).lerp(this._nightColor, nightFactor);
  }

  addTo(scene) {
    scene.add(this.mesh);
    scene.add(this.grid);
  }
}
