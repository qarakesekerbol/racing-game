import * as THREE from 'three';
import { CONFIG, getQuality } from '../core/config.js';

// Street lamps around the track. All poles/arms/heads are drawn as three
// InstancedMeshes (3 draw calls total, regardless of lamp count).
//
// Real PointLights are a small pool re-parented to the nearest lamps each
// frame. During the day the pool is removed from the scene entirely — a light
// with intensity 0 still occupies a slot in the shader's light array, so
// removing them is what actually saves the work.

export class StreetLamps {
  constructor({ track }) {
    const cfg = CONFIG.lights.streetLamps;
    this.group = new THREE.Group();
    this.bulbs = []; // world position of each lamp head

    const poleGeometry = new THREE.CylinderGeometry(
      cfg.poleRadius * 0.8,
      cfg.poleRadius,
      cfg.poleHeight,
      6
    );
    poleGeometry.translate(0, cfg.poleHeight / 2, 0);
    const armGeometry = new THREE.BoxGeometry(1.0, 0.1, 0.1);
    const headGeometry = new THREE.BoxGeometry(0.6, 0.16, 0.36);

    const poleMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a4048,
      roughness: 0.8,
      metalness: 0.4,
    });
    // The emissive head is what reads as "lamp is on" and what bloom catches.
    this.headMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      emissive: new THREE.Color(cfg.headColor),
      emissiveIntensity: 0,
      roughness: 0.5,
    });

    this.poles = new THREE.InstancedMesh(poleGeometry, poleMaterial, cfg.count);
    this.arms = new THREE.InstancedMesh(armGeometry, poleMaterial, cfg.count);
    this.heads = new THREE.InstancedMesh(headGeometry, this.headMaterial, cfg.count);
    for (const mesh of [this.poles, this.arms, this.heads]) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.group.add(mesh);
    }

    const dummy = new THREE.Object3D();
    for (let i = 0; i < cfg.count; i++) {
      const t = i / cfg.count;
      const point = track.curve.getPointAt(t);
      const tangent = track.curve.getTangentAt(t);
      const side = cfg.alternateSides ? (i % 2 === 0 ? 1 : -1) : cfg.side;
      const offset = side * cfg.lateralOffset;

      const x = point.x + tangent.z * offset;
      const z = point.z - tangent.x * offset;
      // Arm points from the pole toward the road.
      const yaw = Math.atan2(-tangent.z * side, tangent.x * side);
      const inwardX = -tangent.z * side;
      const inwardZ = tangent.x * side;

      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.updateMatrix();
      this.poles.setMatrixAt(i, dummy.matrix);

      dummy.position.set(
        x + inwardX * 0.5,
        cfg.poleHeight - 0.08,
        z + inwardZ * 0.5
      );
      dummy.updateMatrix();
      this.arms.setMatrixAt(i, dummy.matrix);

      const headX = x + inwardX * 0.95;
      const headZ = z + inwardZ * 0.95;
      dummy.position.set(headX, cfg.poleHeight - 0.2, headZ);
      dummy.updateMatrix();
      this.heads.setMatrixAt(i, dummy.matrix);

      this.bulbs.push(new THREE.Vector3(headX, cfg.lightHeight, headZ));
    }
    this.poles.instanceMatrix.needsUpdate = true;
    this.arms.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;

    this.lightPool = [];
    this._poolSize = -1;
    this._lightsInScene = false;
    this._distances = [];
  }

  _rebuildPool(size) {
    for (const light of this.lightPool) {
      this.group.remove(light);
      light.dispose?.();
    }
    this.lightPool.length = 0;

    const cfg = CONFIG.lights.streetLamps;
    for (let i = 0; i < size; i++) {
      const light = new THREE.PointLight(cfg.headColor, 0, cfg.lightDistance, 2);
      light.castShadow = false; // shadow-casting point lights are far too costly
      this.lightPool.push(light);
    }
    this._poolSize = size;
    this._lightsInScene = false;
  }

  _setLightsInScene(present) {
    if (present === this._lightsInScene) return;
    for (const light of this.lightPool) {
      if (present) this.group.add(light);
      else this.group.remove(light);
    }
    this._lightsInScene = present;
  }

  get activeLightCount() {
    return this._lightsInScene ? this.lightPool.length : 0;
  }

  // nightFactor: 0 = off (day), 1 = fully on (night)
  update(cameraPosition, nightFactor) {
    const cfg = CONFIG.lights.streetLamps;
    const maxLights = getQuality().maxLampLights;
    if (maxLights !== this._poolSize) this._rebuildPool(maxLights);

    this.headMaterial.emissiveIntensity = nightFactor * cfg.emissiveIntensity;

    // Below this the lamps contribute nothing visible, so drop the lights.
    if (nightFactor <= 0.05 || maxLights === 0) {
      this._setLightsInScene(false);
      return;
    }
    this._setLightsInScene(true);

    // Rank lamps by distance and move the pool onto the closest ones.
    this._distances.length = 0;
    for (let i = 0; i < this.bulbs.length; i++) {
      this._distances.push([i, this.bulbs[i].distanceToSquared(cameraPosition)]);
    }
    this._distances.sort((a, b) => a[1] - b[1]);

    for (let i = 0; i < this.lightPool.length; i++) {
      const light = this.lightPool[i];
      const entry = this._distances[i];
      if (!entry) {
        light.intensity = 0;
        continue;
      }
      light.position.copy(this.bulbs[entry[0]]);
      light.intensity = cfg.lightIntensity * nightFactor;
      light.distance = cfg.lightDistance;
    }
  }

  addTo(scene) {
    scene.add(this.group);
  }
}
