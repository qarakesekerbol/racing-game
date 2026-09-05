import * as THREE from 'three';

// Themed ground plane with a subtle procedural texture so the surface isn't
// flat color. Snow tints bluish at night (moonlight); sand tints violet.

const GROUND_SIZE = 1200;

// Mottled noise in the theme's own palette.
function makeGroundTexture(kind) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const palettes = {
    snow: { base: '#ffffff', blobs: 'rgba(190, 205, 228,', speck: 'rgba(255,255,255,' },
    sand: { base: '#ffffff', blobs: 'rgba(206, 158, 96,', speck: 'rgba(255, 236, 200,' },
  };
  const p = palettes[kind] ?? palettes.snow;

  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `${p.blobs} ${0.04 + Math.random() * 0.08})`;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 2 + Math.random() * 9, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sand gets directional ripples; snow gets sparkle specks.
  if (kind === 'sand') {
    for (let i = 0; i < 120; i++) {
      const y = Math.random() * size;
      ctx.strokeStyle = `rgba(190, 140, 84, ${0.05 + Math.random() * 0.08})`;
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.3, y + 8, size * 0.6, y - 8, size, y + 3);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 250; i++) {
      ctx.fillStyle = `${p.speck} ${0.05 + Math.random() * 0.1})`;
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(60, 60);
  return texture;
}

export class Ground {
  constructor(theme) {
    const cfg = theme.ground;
    const geometry = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
    this._material = new THREE.MeshStandardMaterial({
      color: cfg.color,
      map: makeGroundTexture(cfg.texture),
      roughness: 0.92,
      metalness: 0,
    });
    this._dayColor = new THREE.Color(cfg.color);
    this._nightColor = new THREE.Color(cfg.nightColor);

    this.mesh = new THREE.Mesh(geometry, this._material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;
  }

  // nightFactor 0..1 — the ground shifts to its night tint instead of staying
  // "lit daytime color" under a dark sky.
  setNightFactor(nightFactor) {
    this._material.color.copy(this._dayColor).lerp(this._nightColor, nightFactor);
  }

  addTo(scene) {
    scene.add(this.mesh);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this._material.map?.dispose();
    this._material.dispose();
  }
}
