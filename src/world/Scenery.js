import * as THREE from 'three';

// Themed scenery around a track: instanced vegetation, rocks/mesas, roadside
// banks, a ring of distant hills and optional props. Everything is driven by
// the theme plus the track's scenery block, so a new track or theme needs no
// code here. Heavy repetition goes through InstancedMesh — the whole world
// costs a handful of draw calls.

export class Scenery {
  constructor({ samples, theme, sceneryData }) {
    this.group = new THREE.Group();
    this.theme = theme;
    const cfg = sceneryData;

    // Random ground point that keeps clear of the track.
    const clearance2 = cfg.trackClearance * cfg.trackClearance;
    const randomSpot = (minR, maxR) => {
      for (let tries = 0; tries < 40; tries++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = minR + Math.random() * (maxR - minR);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        let ok = true;
        for (const s of samples) {
          const dx = s.x - x;
          const dz = s.z - z;
          if (dx * dx + dz * dz < clearance2) {
            ok = false;
            break;
          }
        }
        if (ok) return { x, z };
      }
      return null;
    };

    // Fill out to the extent of the track itself, not a fixed radius, so a
    // bigger circuit still gets a populated world around it.
    let maxRadius = 0;
    for (const s of samples) maxRadius = Math.max(maxRadius, Math.hypot(s.x, s.z));
    this._outer = maxRadius + 120;

    this._buildVegetation(cfg, randomSpot);
    this._buildRocks(cfg, randomSpot);
    this._buildBanks(cfg, samples);
    this._buildMountains();
    this._buildProps(cfg, randomSpot);
  }

  _add(mesh) {
    this.group.add(mesh);
    return mesh;
  }

  _buildVegetation(cfg, randomSpot) {
    const veg = this.theme.vegetation;
    const dummy = new THREE.Object3D();

    if (veg.kind === 'cactus') {
      // Saguaro: a trunk with two raised arms.
      const trunkGeometry = new THREE.CylinderGeometry(0.34, 0.42, 3.4, 7);
      trunkGeometry.translate(0, 1.7, 0);
      const armGeometry = new THREE.CylinderGeometry(0.2, 0.24, 1.5, 6);
      armGeometry.translate(0, 0.75, 0);
      const material = new THREE.MeshStandardMaterial({
        color: veg.trunkColor,
        roughness: 0.85,
      });

      const trunks = new THREE.InstancedMesh(trunkGeometry, material, cfg.treeCount);
      const armsL = new THREE.InstancedMesh(armGeometry, material, cfg.treeCount);
      const armsR = new THREE.InstancedMesh(armGeometry, material, cfg.treeCount);

      let placed = 0;
      for (let i = 0; i < cfg.treeCount; i++) {
        const spot = randomSpot(24, this._outer);
        if (!spot) continue;
        const scale = 0.75 + Math.random() * 0.9;
        dummy.position.set(spot.x, 0, spot.z);
        dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        trunks.setMatrixAt(placed, dummy.matrix);

        // Arms sit part-way up the trunk, angled outward.
        dummy.position.set(spot.x + 0.5 * scale, 1.5 * scale, spot.z);
        dummy.rotation.set(0, 0, 0.6);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        armsL.setMatrixAt(placed, dummy.matrix);

        dummy.position.set(spot.x - 0.5 * scale, 1.8 * scale, spot.z);
        dummy.rotation.set(0, 0, -0.6);
        dummy.updateMatrix();
        armsR.setMatrixAt(placed, dummy.matrix);
        placed++;
      }
      trunks.count = armsL.count = armsR.count = placed;
      this._add(trunks);
      this._add(armsL);
      this._add(armsR);
      return;
    }

    // Conifer with a snow cap.
    const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.2, 1, 6);
    trunkGeometry.translate(0, 0.5, 0);
    const foliageGeometry = new THREE.ConeGeometry(1, 2.4, 7);
    foliageGeometry.translate(0, 2.1, 0);
    const capGeometry = new THREE.ConeGeometry(0.55, 1.1, 7);
    capGeometry.translate(0, 3.1, 0);

    const trunks = new THREE.InstancedMesh(
      trunkGeometry,
      new THREE.MeshStandardMaterial({ color: veg.trunkColor, roughness: 0.9 }),
      cfg.treeCount
    );
    const foliage = new THREE.InstancedMesh(
      foliageGeometry,
      new THREE.MeshStandardMaterial({ color: veg.foliageColor, roughness: 0.85 }),
      cfg.treeCount
    );
    const caps = new THREE.InstancedMesh(
      capGeometry,
      new THREE.MeshStandardMaterial({ color: veg.capColor, roughness: 0.9 }),
      cfg.treeCount
    );

    let placed = 0;
    for (let i = 0; i < cfg.treeCount; i++) {
      const spot = randomSpot(24, this._outer);
      if (!spot) continue;
      dummy.position.set(spot.x, 0, spot.z);
      dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
      dummy.scale.setScalar(0.9 + Math.random() * 1.6);
      dummy.updateMatrix();
      trunks.setMatrixAt(placed, dummy.matrix);
      foliage.setMatrixAt(placed, dummy.matrix);
      caps.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    trunks.count = foliage.count = caps.count = placed;
    this._add(trunks);
    this._add(foliage);
    this._add(caps);
  }

  _buildRocks(cfg, randomSpot) {
    const rockCfg = this.theme.rocks;
    const dummy = new THREE.Object3D();

    if (rockCfg.style === 'mesa') {
      // Flat-topped buttes: low-segment cylinders, a few huge and many small.
      const geometry = new THREE.CylinderGeometry(0.75, 1, 1, 6);
      geometry.translate(0, 0.5, 0);
      const mesas = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: rockCfg.color, roughness: 1, flatShading: true }),
        cfg.rockCount
      );
      let placed = 0;
      for (let i = 0; i < cfg.rockCount; i++) {
        const spot = randomSpot(26, this._outer);
        if (!spot) continue;
        const big = Math.random() < 0.28;
        const s = big ? 6 + Math.random() * 12 : 0.7 + Math.random() * 2.2;
        const h = big ? s * (0.8 + Math.random() * 1.1) : s * (0.5 + Math.random() * 0.6);
        dummy.position.set(spot.x, 0, spot.z);
        dummy.rotation.set(0, Math.random() * Math.PI, 0);
        dummy.scale.set(s, h, s * (0.8 + Math.random() * 0.5));
        dummy.updateMatrix();
        mesas.setMatrixAt(placed++, dummy.matrix);
      }
      mesas.count = placed;
      this._add(mesas);
      return;
    }

    const rocks = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: rockCfg.color, roughness: 0.95, flatShading: true }),
      cfg.rockCount
    );
    let placed = 0;
    for (let i = 0; i < cfg.rockCount; i++) {
      const spot = randomSpot(20, this._outer);
      if (!spot) continue;
      const s = 0.4 + Math.random() * 1.4;
      dummy.position.set(spot.x, s * 0.25, spot.z);
      dummy.rotation.set(Math.random(), Math.random() * Math.PI, Math.random() * 0.4);
      dummy.scale.set(s, s * (0.6 + Math.random() * 0.5), s);
      dummy.updateMatrix();
      rocks.setMatrixAt(placed++, dummy.matrix);
    }
    rocks.count = placed;
    this._add(rocks);
  }

  // Rounded blobs hugging both road edges (snow drifts / sand berms).
  _buildBanks(cfg, samples) {
    const bankCfg = this.theme.banks;
    const n = samples.length;
    let trackLength = 0;
    for (let i = 0; i < n; i++) {
      const a = samples[i];
      const b = samples[(i + 1) % n];
      trackLength += Math.hypot(b.x - a.x, b.z - a.z);
    }

    const count = Math.floor((trackLength / cfg.snowBankSpacing) * 2);
    const banks = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshStandardMaterial({ color: bankCfg.color, roughness: 0.95 }),
      count
    );
    banks.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let placed = 0;
    for (const side of [1, -1]) {
      const steps = Math.floor(count / 2);
      for (let i = 0; i < steps; i++) {
        const idx = Math.floor((i / steps) * n) % n;
        const s = samples[idx];
        const next = samples[(idx + 1) % n];
        const dx = next.x - s.x;
        const dz = next.z - s.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = (dz / len) * side;
        const nz = (-dx / len) * side;
        const offset = cfg.snowBankOffset + Math.random() * 1.2;

        dummy.position.set(s.x + nx * offset, -0.25, s.z + nz * offset);
        dummy.rotation.set(0, Math.random() * Math.PI, 0);
        dummy.scale.set(
          bankCfg.scale[0] + Math.random() * bankCfg.jitter,
          bankCfg.scale[1] + Math.random() * 0.3,
          bankCfg.scale[2] + Math.random() * bankCfg.jitter
        );
        dummy.updateMatrix();
        banks.setMatrixAt(placed++, dummy.matrix);
      }
    }
    banks.count = placed;
    this._add(banks);
  }

  // Two rings of distant hills: nearer/smaller and farther/taller, the latter
  // sitting deep in the fog so the horizon reads as depth.
  _buildMountains() {
    const geometry = new THREE.ConeGeometry(1, 1, 5);
    geometry.translate(0, 0.5, 0);
    const dummy = new THREE.Object3D();
    // Scale the rings out to enclose the whole circuit.
    const scale = Math.max(1, this._outer / 320);

    for (const ring of this.theme.mountains) {
      const mountains = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: ring.color, roughness: 1, flatShading: true }),
        ring.count
      );
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2 + Math.random() * 0.25;
        const radius =
          (ring.radius[0] + Math.random() * (ring.radius[1] - ring.radius[0])) * scale;
        const height = ring.height[0] + Math.random() * (ring.height[1] - ring.height[0]);
        dummy.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        dummy.rotation.set(0, Math.random() * Math.PI, 0);
        dummy.scale.set(
          height * (1.4 + Math.random() * 0.9),
          height,
          height * (1.4 + Math.random() * 0.9)
        );
        dummy.updateMatrix();
        mountains.setMatrixAt(i, dummy.matrix);
      }
      this._add(mountains);
    }
  }

  _buildProps(cfg, randomSpot) {
    if (this.theme.props !== 'snowmen' || !cfg.propCount) return;

    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xf7f9fd, roughness: 0.9 });
    const noseMaterial = new THREE.MeshStandardMaterial({ color: 0xe8762a, roughness: 0.7 });
    const sphere = new THREE.SphereGeometry(1, 10, 8);
    const nose = new THREE.ConeGeometry(0.09, 0.4, 6);
    nose.rotateX(Math.PI / 2);

    for (let i = 0; i < cfg.propCount; i++) {
      const spot = randomSpot(20, 90);
      if (!spot) continue;
      const snowman = new THREE.Group();
      let y = 0;
      for (const [j, s] of [0.55, 0.4, 0.28].entries()) {
        y += s * (j === 0 ? 1 : 1.4);
        const ball = new THREE.Mesh(sphere, bodyMaterial);
        ball.scale.setScalar(s);
        ball.position.y = y;
        snowman.add(ball);
      }
      const carrot = new THREE.Mesh(nose, noseMaterial);
      carrot.position.set(0, y, 0.3);
      snowman.add(carrot);
      snowman.position.set(spot.x, 0, spot.z);
      snowman.rotation.y = Math.random() * Math.PI * 2;
      this._add(snowman);
    }
  }

  addTo(scene) {
    scene.add(this.group);
  }

  dispose() {
    disposeTree(this.group);
    this.group.removeFromParent();
  }
}

// Frees GPU resources for everything under an object, so switching tracks
// doesn't leak the previous world's geometry and materials.
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.isMesh || o.isInstancedMesh || o.isPoints || o.isLine) {
      o.geometry?.dispose();
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of materials) {
        if (!m) continue;
        m.map?.dispose();
        m.dispose();
      }
    }
  });
}
