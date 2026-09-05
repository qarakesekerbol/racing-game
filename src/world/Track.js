import * as THREE from 'three';
import { CONFIG } from '../core/config.js';

// Closed-loop track built from a CatmullRomCurve3 spline.
// The road is a flat triangle-strip ribbon with a procedural asphalt texture;
// barriers are instanced tire walls in alternating colors; corners get
// red/white curbs. The curve itself is exposed for other systems (minimap, AI).
// Barrier positions are purely visual — collision bounds live in Collisions.

const BARRIER_OFFSET = 0.4; // gap between road edge and the tire wall
const SEGMENTS = 240;

const UP = new THREE.Vector3(0, 1, 0);

// Dark asphalt with speckle noise, tiled along the road.
function makeAsphaltTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#7c7c84';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1600; i++) {
    const v = 90 + Math.floor(Math.random() * 80);
    ctx.fillStyle = `rgba(${v},${v},${v + 6},${0.25 + Math.random() * 0.3})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 34);
  return texture;
}

// Black/white checker used by the start line (and reusable for banners).
export function makeCheckerTexture(cols, rows) {
  const cell = 16;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f4f4f4' : '#131313';
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  return new THREE.CanvasTexture(canvas);
}

const TIRE_COLORS = ['#e04444', '#f0f0f0', '#3a72d8']; // alternating wall colors
const CURB_COLORS = ['#e03535', '#f5f5f5'];

export class Track {
  constructor(trackData) {
    this.data = trackData;
    this.roadWidth = trackData.roadWidth;
    this.curve = this._buildCurve();
    this.roadMesh = this._buildRoadMesh();
    this.barriers = this._buildTireWalls();
    this.curbs = this._buildCurbs();
    this.markings = this._buildRoadMarkings();
    this.startLine = this._buildStartLine();
    this.tunnel = this._buildTunnel();
    this.bridge = this._buildBridge();
  }

  // A wooden bridge over a canyon gap, if this track defines one. The canyon
  // is a dark recess under the road; the road ribbon itself is unchanged, so
  // driving physics over the bridge is identical to anywhere else.
  _buildBridge() {
    const group = new THREE.Group();
    const cfg = this.data.bridge;
    if (!cfg) return group;

    const deckMaterial = new THREE.MeshStandardMaterial({
      color: cfg.deckColor,
      roughness: 0.9,
    });
    const railMaterial = new THREE.MeshStandardMaterial({
      color: cfg.railColor,
      roughness: 0.85,
    });

    const span = cfg.to - cfg.from;
    const plankCount = Math.max(8, Math.round(span * this.curve.getLength() / 2.2));
    const plankGeometry = new THREE.BoxGeometry(this.roadWidth + 3, 0.35, 1.7);
    const planks = new THREE.InstancedMesh(plankGeometry, deckMaterial, plankCount);
    planks.receiveShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < plankCount; i++) {
      const t = cfg.from + (i / (plankCount - 1)) * span;
      const p = this.curve.getPointAt(t % 1);
      const tangent = this.curve.getTangentAt(t % 1);
      dummy.position.set(p.x, -0.2, p.z);
      dummy.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0);
      dummy.updateMatrix();
      planks.setMatrixAt(i, dummy.matrix);
    }
    planks.instanceMatrix.needsUpdate = true;
    group.add(planks);

    // Canyon: a dark plane well below the deck, plus walls framing the gap.
    const canyonMid = this.curve.getPointAt((cfg.from + cfg.to) / 2);
    const canyonLength = span * this.curve.getLength() * 1.5;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(canyonLength, canyonLength),
      new THREE.MeshStandardMaterial({ color: 0x4a2f22, roughness: 1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(canyonMid.x, -26, canyonMid.z);
    group.add(floor);

    // Railings and support posts along both edges of the deck.
    const railGeometry = new THREE.BoxGeometry(0.22, 1.1, 1.9);
    const postCount = Math.max(6, Math.round(plankCount / 2));
    const rails = new THREE.InstancedMesh(railGeometry, railMaterial, postCount * 2);
    let index = 0;
    for (const side of [1, -1]) {
      for (let i = 0; i < postCount; i++) {
        const t = cfg.from + (i / (postCount - 1)) * span;
        const p = this._edgePoint(t % 1, side * (this.roadWidth / 2 + 1.1));
        const tangent = this.curve.getTangentAt(t % 1);
        dummy.position.set(p.x, 0.55, p.z);
        dummy.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0);
        dummy.updateMatrix();
        rails.setMatrixAt(index++, dummy.matrix);
      }
    }
    rails.instanceMatrix.needsUpdate = true;
    group.add(rails);

    return group;
  }

  _buildCurve() {
    const points = this.data.controlPoints.map(
      ([x, z]) => new THREE.Vector3(x, 0, z)
    );
    return new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5);
  }

  _edgePoint(t, sideOffset) {
    const point = this.curve.getPointAt(t);
    const tangent = this.curve.getTangentAt(t);
    const normal = new THREE.Vector3().crossVectors(UP, tangent).normalize();
    return point.addScaledVector(normal, sideOffset);
  }

  _buildRoadMesh() {
    const positions = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS === 1 ? 0 : i / SEGMENTS;
      const left = this._edgePoint(t, this.roadWidth / 2);
      const right = this._edgePoint(t, -this.roadWidth / 2);

      // Slightly above ground to avoid z-fighting with the ground plane.
      positions.push(left.x, 0.02, left.z, right.x, 0.02, right.z);
      uvs.push(0, i / 4, 1, i / 4);

      if (i < SEGMENTS) {
        const a = i * 2;
        const b = i * 2 + 1;
        const c = i * 2 + 2;
        const d = i * 2 + 3;
        indices.push(a, b, c, b, d, c);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0x4a4a50,
      map: makeAsphaltTexture(),
      roughness: 0.95,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  // How strongly the road bends at t, and which side is the outside of the
  // bend. Uses the chord over ~±10m: the road bows away from the chord
  // midpoint, and the bow direction points at the inner side.
  _bendAt(t) {
    const p = this.curve.getPointAt(t);
    const ahead = this.curve.getPointAt((t + 0.02) % 1);
    const behind = this.curve.getPointAt((t + 0.98) % 1);
    const bowX = (ahead.x + behind.x) / 2 - p.x;
    const bowZ = (ahead.z + behind.z) / 2 - p.z;
    const tangent = this.curve.getTangentAt(t);
    const innerDot = bowX * tangent.z - bowZ * tangent.x; // dot with left normal
    return {
      strength: Math.hypot(bowX, bowZ),
      outerSide: innerDot > 0 ? -1 : 1,
    };
  }

  // Tire walls: small stacks of lying tires, only on the outer side of
  // corners (where a sliding kart would actually arrive). Straights get
  // sparse flag posts instead — the snow banks already line everything.
  // Visual only — collision is the lateral clamp in Collisions.
  _buildTireWalls() {
    const group = new THREE.Group();
    const spacing = 0.9;
    const length = this.curve.getLength();
    const steps = Math.floor(length / spacing);

    const tireEntries = [];
    const flagEntries = [];
    let sinceFlag = 0;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const bend = this._bendAt(t);
      // Thresholds retuned for the 1.4x-scaled spline (same chord fraction
      // spans more meters, so the same radius bows more).
      if (bend.strength > 1.05) {
        tireEntries.push([t, bend.outerSide]);
        sinceFlag = 0;
      } else if (bend.strength < 0.75 && ++sinceFlag >= 8) {
        // A flag post every ~7m of straight, alternating sides.
        sinceFlag = 0;
        flagEntries.push([t, flagEntries.length % 2 === 0 ? 1 : -1]);
      }
    }

    // Tires at 60% scale, pushed a little further off the road edge.
    const tireGeometry = new THREE.TorusGeometry(0.34, 0.15, 6, 12);
    tireGeometry.rotateX(Math.PI / 2);
    const tireMaterial = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    const tires = new THREE.InstancedMesh(tireGeometry, tireMaterial, tireEntries.length);
    // Shadow casting is capped to karts only (perf); props just receive.
    tires.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    tireEntries.forEach(([t, side], i) => {
      const p = this._edgePoint(t, side * (this.roadWidth / 2 + BARRIER_OFFSET + 0.9));
      dummy.position.set(p.x, 0.1, p.z);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      dummy.scale.setScalar(0.6);
      dummy.updateMatrix();
      tires.setMatrixAt(i, dummy.matrix);
      tires.setColorAt(i, color.set(TIRE_COLORS[i % TIRE_COLORS.length]));
    });
    tires.instanceMatrix.needsUpdate = true;
    if (tires.instanceColor) tires.instanceColor.needsUpdate = true;
    group.add(tires);

    // Flag posts along the straights.
    const poleGeometry = new THREE.CylinderGeometry(0.04, 0.05, 1.5, 5);
    poleGeometry.translate(0, 0.75, 0);
    const flagGeometry = new THREE.PlaneGeometry(0.55, 0.36);
    flagGeometry.translate(0.3, 1.3, 0);
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x6a7280, roughness: 0.7 });
    const flagMaterial = new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide });

    const poles = new THREE.InstancedMesh(poleGeometry, poleMaterial, flagEntries.length);
    const flags = new THREE.InstancedMesh(flagGeometry, flagMaterial, flagEntries.length);
    flagEntries.forEach(([t, side], i) => {
      const p = this._edgePoint(t, side * (this.roadWidth / 2 + 1.3));
      const tangent = this.curve.getTangentAt(t);
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      flags.setMatrixAt(i, dummy.matrix);
      flags.setColorAt(i, color.set(TIRE_COLORS[i % TIRE_COLORS.length]));
    });
    if (flags.instanceColor) flags.instanceColor.needsUpdate = true;
    group.add(poles, flags);

    return group;
  }

  // Red/white striped curbs where the spline bends hard.
  _buildCurbs() {
    const entries = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const h1 = this.curve.getTangentAt(t);
      const h2 = this.curve.getTangentAt((t + 4 / SEGMENTS) % 1);
      const turn = Math.abs(Math.atan2(h1.x, h1.z) - Math.atan2(h2.x, h2.z));
      const wrapped = turn > Math.PI ? Math.PI * 2 - turn : turn;
      // High threshold on purpose: this spline curves almost everywhere, and
      // curbs should mark only the genuinely hard corners.
      if (wrapped > 0.155) {
        for (const side of [1, -1]) entries.push([t, side]);
      }
    }

    const segLength = this.curve.getLength() / SEGMENTS;
    const geometry = new THREE.BoxGeometry(1.0, 0.09, segLength + 0.12);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    entries.forEach(([t, side], i) => {
      const p = this._edgePoint(t, side * (this.roadWidth / 2 - 0.45));
      const tangent = this.curve.getTangentAt(t);
      dummy.position.set(p.x, 0.045, p.z);
      dummy.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set(CURB_COLORS[Math.floor(t * SEGMENTS) % 2]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  // A short "tunnel" of arch frames, if this track defines one.
  _buildTunnel() {
    const group = new THREE.Group();
    if (!this.data.tunnel) return group;
    const material = new THREE.MeshStandardMaterial({
      color: this.data.tunnel.color,
      roughness: 0.5,
    });
    const pillarGeometry = new THREE.BoxGeometry(0.6, 4.4, 0.6);
    const beamGeometry = new THREE.BoxGeometry(this.roadWidth + 4, 0.7, 0.9);

    for (const t of this.data.tunnel.ts) {
      const p = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t);
      const heading = Math.atan2(tangent.x, tangent.z);
      const frame = new THREE.Group();
      frame.position.set(p.x, 0, p.z);
      frame.rotation.y = heading;

      for (const side of [1, -1]) {
        const pillar = new THREE.Mesh(pillarGeometry, material);
        pillar.position.set(side * (this.roadWidth / 2 + 1.6), 2.2, 0);
        frame.add(pillar);
      }
      const beam = new THREE.Mesh(beamGeometry, material);
      beam.position.set(0, 4.6, 0);
      frame.add(beam);
      group.add(frame);
    }
    return group;
  }

  // Road markings: one dashed center line plus a solid line down each edge.
  // Built as flat geometry sampled along the spline (not line primitives):
  // GL lines ignore linewidth, and straight segments between samples visibly
  // cut corners on a road this wide.
  _buildRoadMarkings() {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const length = this.curve.getLength();

    // --- Dashed center line: one quad per dash, oriented along the tangent ---
    const dashLength = 3.2;
    const gapLength = 3.2;
    const dashCount = Math.floor(length / (dashLength + gapLength));
    const dashGeometry = new THREE.PlaneGeometry(0.32, dashLength);
    dashGeometry.rotateX(-Math.PI / 2);
    const dashes = new THREE.InstancedMesh(dashGeometry, material, dashCount);
    dashes.renderOrder = 1;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < dashCount; i++) {
      const t = (i * (dashLength + gapLength)) / length;
      const p = this.curve.getPointAt(t % 1);
      const tangent = this.curve.getTangentAt(t % 1);
      dummy.position.set(p.x, 0.045, p.z);
      dummy.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0);
      dummy.updateMatrix();
      dashes.setMatrixAt(i, dummy.matrix);
    }
    dashes.instanceMatrix.needsUpdate = true;
    group.add(dashes);

    // --- Solid edge lines: continuous ribbons following the spline exactly ---
    const edgeInset = 0.75;
    const lineWidth = 0.28;
    for (const side of [1, -1]) {
      const positions = [];
      const indices = [];
      const center = side * (this.roadWidth / 2 - edgeInset);

      for (let i = 0; i <= SEGMENTS; i++) {
        const t = (i % SEGMENTS) / SEGMENTS;
        const inner = this._edgePoint(t, center - lineWidth / 2);
        const outer = this._edgePoint(t, center + lineWidth / 2);
        positions.push(inner.x, 0.045, inner.z, outer.x, 0.045, outer.z);

        if (i < SEGMENTS) {
          const a = i * 2;
          const b = i * 2 + 1;
          const c = i * 2 + 2;
          const d = i * 2 + 3;
          indices.push(a, b, c, b, d, c);
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const line = new THREE.Mesh(geometry, material);
      line.renderOrder = 1;
      group.add(line);
    }

    return group;
  }

  _buildStartLine() {
    const geometry = new THREE.PlaneGeometry(this.roadWidth, 2.2);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      map: makeCheckerTexture(16, 3),
      transparent: true,
      opacity: 0.92,
    });
    const line = new THREE.Mesh(geometry, material);
    const start = this.getStartTransform();
    line.position.set(start.x, 0.035, start.z);
    line.rotation.y = start.heading;
    return line;
  }

  addTo(scene) {
    scene.add(this.roadMesh);
    scene.add(this.barriers);
    scene.add(this.curbs);
    scene.add(this.markings);
    scene.add(this.startLine);
    scene.add(this.tunnel);
    scene.add(this.bridge);
  }

  // Every mesh this track owns, for disposal when switching tracks.
  get objects() {
    return [
      this.roadMesh,
      this.barriers,
      this.curbs,
      this.markings,
      this.startLine,
      this.tunnel,
      this.bridge,
    ];
  }

  // Position and heading at the start of the loop, for spawning the car on the road.
  getStartTransform() {
    const point = this.curve.getPointAt(0);
    const tangent = this.curve.getTangentAt(0);
    const heading = Math.atan2(tangent.x, tangent.z);
    return { x: point.x, z: point.z, heading };
  }

  // Starting grid: 4 columns x 2 rows across the wide road. Slot 0 is the
  // front row; the last slot is furthest back (traditionally the player's).
  getGridSlots(count) {
    const cfg = CONFIG.grid;
    const length = this.curve.getLength();
    const slots = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cfg.columns);
      const column = i % cfg.columns;
      const distanceBack = cfg.firstRowDistance + row * cfg.rowSpacing;
      const t = ((1 - distanceBack / length) % 1 + 1) % 1;
      const point = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t);
      const normal = new THREE.Vector3().crossVectors(UP, tangent).normalize();
      const lateral = (column - (cfg.columns - 1) / 2) * cfg.columnSpacing;
      slots.push({
        x: point.x + normal.x * lateral,
        z: point.z + normal.z * lateral,
        heading: Math.atan2(tangent.x, tangent.z),
      });
    }
    return slots;
  }

  // Plain {x, z} samples along the spline for race logic and the minimap —
  // consumers stay free of Three.js types.
  getSampledPositions(count) {
    const positions = [];
    for (let i = 0; i < count; i++) {
      const p = this.curve.getPointAt(i / count);
      positions.push({ x: p.x, z: p.z });
    }
    return positions;
  }
}
