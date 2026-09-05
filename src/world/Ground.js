import * as THREE from 'three';

// Large flat grass plane with a subtle grid overlay for a sense of speed.

const GROUND_SIZE = 1000;

export class Ground {
  constructor() {
    const geometry = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
    const material = new THREE.MeshStandardMaterial({ color: 0x3f7a38, roughness: 1 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;

    this.grid = new THREE.GridHelper(GROUND_SIZE, GROUND_SIZE / 10, 0x2f5c2a, 0x2f5c2a);
    this.grid.position.y = 0.01;
  }

  addTo(scene) {
    scene.add(this.mesh);
    scene.add(this.grid);
  }
}
