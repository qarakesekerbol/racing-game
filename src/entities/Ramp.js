import * as THREE from 'three';
import { CONFIG } from '../core/config.js';

// A jump ramp: a wedge rising along the driving direction, plus a warning sign
// placed up the road so you can see it coming.
//
// Local frame: +Z is the driving direction, X is across the road. The wedge
// starts flat at -length/2 and rises to `height` at +length/2. The launch angle
// the physics uses is atan(height / length), so geometry and feel agree.

// Diagonal hazard stripes, drawn once and shared.
function makeStripeTexture() {
  const w = 128;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1c1c22';
  ctx.lineWidth = 0;
  for (let i = -h; i < w + h; i += 36) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 18, 0);
    ctx.lineTo(i + 18 - h, h);
    ctx.lineTo(i - h, h);
    ctx.closePath();
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function makeSignTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#1c1c22';
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#1c1c22';
  ctx.strokeRect(6, 6, size - 12, size - 12);
  // A kart launching off a wedge.
  ctx.beginPath();
  ctx.moveTo(22, 96);
  ctx.lineTo(74, 96);
  ctx.lineTo(74, 62);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(74, 52);
  ctx.quadraticCurveTo(96, 30, 112, 34);
  ctx.lineWidth = 6;
  ctx.setLineDash([8, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillRect(84, 26, 20, 11);
  ctx.beginPath();
  ctx.arc(88, 40, 5, 0, Math.PI * 2);
  ctx.arc(101, 40, 5, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

let shared = null;
function getShared() {
  if (shared) return shared;
  shared = { stripe: makeStripeTexture(), sign: makeSignTexture() };
  return shared;
}

export class Ramp {
  constructor(position, heading) {
    const cfg = CONFIG.obstacles.ramp;
    const res = getShared();

    this.position = { ...position };
    this.heading = heading;
    this.length = cfg.length;
    this.width = cfg.width;
    this.height = cfg.height;
    // The launch angle the physics uses — kept in sync with the visible slope.
    this.angle = Math.atan2(cfg.height, cfg.length);

    this.mesh = new THREE.Group();
    this.mesh.position.set(position.x, 0, position.z);
    this.mesh.rotation.y = heading;

    // Wedge profile in the ZY plane, extruded across the road (X).
    const half = cfg.length / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-half, 0);
    shape.lineTo(half, 0);
    shape.lineTo(half, cfg.height);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: cfg.width,
      bevelEnabled: false,
    });
    // Shape X is the driving direction and extrude depth is across the road:
    // rotate so driving runs along +Z, then center the width on X.
    geometry.rotateY(-Math.PI / 2);
    geometry.translate(cfg.width / 2, 0, 0);

    const body = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0x2f8fe0, roughness: 0.55, metalness: 0.15 })
    );
    body.receiveShadow = true;
    this.mesh.add(body);

    // Hazard stripes down both sides of the wedge.
    const stripeMaterial = new THREE.MeshStandardMaterial({
      map: res.stripe.clone(),
      roughness: 0.6,
    });
    stripeMaterial.map.repeat.set(3, 1);
    stripeMaterial.map.needsUpdate = true;
    for (const side of [1, -1]) {
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(cfg.length, cfg.height * 0.85),
        stripeMaterial
      );
      // Lay the panel along the slope face on each flank.
      panel.position.set(side * (cfg.width / 2 + 0.02), cfg.height * 0.32, 0);
      panel.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      panel.rotation.x = 0;
      this.mesh.add(panel);
    }

    // Striped lip across the top edge, so the takeoff point reads clearly.
    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.width, 0.28, 0.7),
      stripeMaterial
    );
    lip.position.set(0, cfg.height, half - 0.2);
    this.mesh.add(lip);

    // Chevrons up the ramp surface pointing at the lip.
    const chevronMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    for (let i = 0; i < 3; i++) {
      const z = -half + cfg.length * (0.25 + i * 0.22);
      const chevron = new THREE.Mesh(
        new THREE.PlaneGeometry(cfg.width * 0.5, 0.5),
        chevronMaterial
      );
      chevron.position.set(0, (z + half) * Math.tan(this.angle) + 0.04, z);
      chevron.rotation.x = -Math.PI / 2 + this.angle;
      this.mesh.add(chevron);
    }

    this.sign = this._buildSign(res);
  }

  // Heightfield sample at a world XZ. The ramp is a tilted plane between the
  // back edge (height 0) and the lip (height `height`), clamped to the
  // footprint. Returns null when the point is not over the ramp.
  //
  //   along  — distance along the driving direction, -length/2 .. +length/2
  //   past   — true when the point has gone off the *top* edge (the lip),
  //            which is what triggers a launch
  sample(x, z) {
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    const sin = Math.sin(this.heading);
    const cos = Math.cos(this.heading);
    const along = dx * sin + dz * cos;
    const across = dx * cos - dz * sin;

    if (Math.abs(across) > this.width / 2) return null;

    const half = this.length / 2;
    if (along > half) {
      // Off the lip: no surface, but report it so the caller can launch.
      return { onRamp: false, past: true, along, across, height: this.height, angle: this.angle };
    }
    if (along < -half) return null;

    const climb = (along + half) / this.length; // 0 at the back, 1 at the lip
    return {
      onRamp: true,
      past: false,
      along,
      across,
      height: climb * this.height,
      angle: this.angle,
    };
  }

  // Warning sign on a post, placed up the road before the ramp.
  _buildSign(res) {
    const group = new THREE.Group();
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 3, 6),
      new THREE.MeshStandardMaterial({ color: 0x6a7280, roughness: 0.7 })
    );
    post.position.y = 1.5;
    group.add(post);

    const boardMaterial = new THREE.MeshStandardMaterial({
      map: res.sign,
      roughness: 0.6,
    });
    // Two back-to-back faces so the sign reads from either approach.
    for (const facing of [0, Math.PI]) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), boardMaterial);
      board.position.set(0, 3.4, facing === 0 ? 0.04 : -0.04);
      board.rotation.y = facing;
      group.add(board);
    }
    return group;
  }

  // Places the warning sign `signDistance` meters back along the spline.
  placeSign(track) {
    const cfg = CONFIG.obstacles.ramp;
    const length = track.curve.getLength();
    const rampT = this._t ?? 0;
    const t = ((rampT - cfg.signDistance / length) % 1 + 1) % 1;
    const point = track.curve.getPointAt(t);
    const tangent = track.curve.getTangentAt(t);
    // Just outside the road edge on the left.
    const offset = track.roadWidth / 2 + 1.6;
    this.sign.position.set(
      point.x + tangent.z * offset,
      0,
      point.z - tangent.x * offset
    );
    // Angle the board in toward the road so it faces an approaching driver
    // rather than sitting edge-on to them.
    this.sign.rotation.y = Math.atan2(tangent.x, tangent.z) + 0.55;
  }

  addTo(scene) {
    scene.add(this.mesh);
    scene.add(this.sign);
  }

  removeFrom(scene) {
    scene.remove(this.mesh);
    scene.remove(this.sign);
  }
}
