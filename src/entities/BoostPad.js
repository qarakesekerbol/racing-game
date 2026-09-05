import * as THREE from 'three';
import { CONFIG } from '../core/config.js';

// A glowing chevron strip on the road. Purely visual here — the speed boost is
// applied through CarPhysics modifiers by ObstacleManager, so player and AI
// get the identical effect.

let sharedGeometry = null;
let sharedMaterial = null;

// Three stacked chevrons that scroll forward, drawn once into a canvas texture.
function makeArrowTexture() {
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < 3; i++) {
    const y = 30 + i * 78;
    const alpha = 0.55 + i * 0.15;
    ctx.fillStyle = `rgba(90, 210, 255, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(w / 2, y);
    ctx.lineTo(w - 14, y + 46);
    ctx.lineTo(w - 14, y + 66);
    ctx.lineTo(w / 2, y + 20);
    ctx.lineTo(14, y + 66);
    ctx.lineTo(14, y + 46);
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function getShared() {
  if (sharedGeometry) return { geometry: sharedGeometry, material: sharedMaterial };
  const cfg = CONFIG.obstacles.boostPads;
  sharedGeometry = new THREE.PlaneGeometry(cfg.width, cfg.length);
  sharedGeometry.rotateX(-Math.PI / 2);
  sharedMaterial = new THREE.MeshBasicMaterial({
    map: makeArrowTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return { geometry: sharedGeometry, material: sharedMaterial };
}

export class BoostPad {
  constructor(position, heading) {
    const { geometry, material } = getShared();
    this.position = { ...position };
    this.heading = heading;
    this.radius = CONFIG.obstacles.boostPads.radius;
    // Per-pad clone so the arrows can scroll independently of each other.
    this.material = material.clone();
    this.material.map = material.map.clone();
    this.material.map.needsUpdate = true;

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.position.set(position.x, 0.05, position.z);
    this.mesh.rotation.y = heading;
    this.mesh.renderOrder = 2;
  }

  update(dt) {
    // Scroll the chevrons toward the driving direction.
    this.material.map.offset.y = (this.material.map.offset.y - dt * 0.9) % 1;
  }

  addTo(scene) {
    scene.add(this.mesh);
  }
}
