import * as THREE from 'three';

// Closed-loop track built from a CatmullRomCurve3 spline.
// The road is a flat triangle-strip ribbon; barriers are thin vertical walls
// along both edges. The curve itself is exposed for future features (minimap, AI).

const ROAD_WIDTH = 11;
const BARRIER_HEIGHT = 0.7;
const BARRIER_OFFSET = 0.4; // gap between road edge and barrier
const SEGMENTS = 240;

const UP = new THREE.Vector3(0, 1, 0);

export class Track {
  constructor() {
    this.curve = this._buildCurve();
    this.roadMesh = this._buildRoadMesh();
    this.barriers = this._buildBarriers();
    this.centerLine = this._buildCenterLine();
  }

  _buildCurve() {
    const controlPoints = [
      new THREE.Vector3(0, 0, 45),
      new THREE.Vector3(45, 0, 60),
      new THREE.Vector3(85, 0, 35),
      new THREE.Vector3(95, 0, -10),
      new THREE.Vector3(65, 0, -55),
      new THREE.Vector3(15, 0, -70),
      new THREE.Vector3(-35, 0, -55),
      new THREE.Vector3(-55, 0, -15),
      new THREE.Vector3(-80, 0, 15),
      new THREE.Vector3(-55, 0, 50),
      new THREE.Vector3(-25, 0, 40),
    ];
    return new THREE.CatmullRomCurve3(controlPoints, true, 'catmullrom', 0.5);
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
      const left = this._edgePoint(t, ROAD_WIDTH / 2);
      const right = this._edgePoint(t, -ROAD_WIDTH / 2);

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
      color: 0x3b3b40,
      roughness: 0.95,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  _buildBarriers() {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: 0xdedede,
      roughness: 0.5,
      side: THREE.DoubleSide,
    });

    for (const side of [1, -1]) {
      const positions = [];
      const indices = [];
      const sideOffset = side * (ROAD_WIDTH / 2 + BARRIER_OFFSET);

      for (let i = 0; i <= SEGMENTS; i++) {
        const t = i / SEGMENTS === 1 ? 0 : i / SEGMENTS;
        const edge = this._edgePoint(t, sideOffset);

        positions.push(edge.x, 0, edge.z, edge.x, BARRIER_HEIGHT, edge.z);

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

      const wall = new THREE.Mesh(geometry, material);
      wall.castShadow = true;
      wall.receiveShadow = true;
      group.add(wall);
    }

    return group;
  }

  _buildCenterLine() {
    const points = this.curve.getPoints(SEGMENTS).map((p) => new THREE.Vector3(p.x, 0.04, p.z));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
      color: 0xffffff,
      dashSize: 2.5,
      gapSize: 2.5,
    });
    const line = new THREE.LineLoop(geometry, material);
    line.computeLineDistances();
    return line;
  }

  addTo(scene) {
    scene.add(this.roadMesh);
    scene.add(this.barriers);
    scene.add(this.centerLine);
  }

  // Position and heading at the start of the loop, for spawning the car on the road.
  getStartTransform() {
    const point = this.curve.getPointAt(0);
    const tangent = this.curve.getTangentAt(0);
    const heading = Math.atan2(tangent.x, tangent.z);
    return { x: point.x, z: point.z, heading };
  }
}
