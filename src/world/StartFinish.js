import * as THREE from 'three';
import { makeCheckerTexture } from './Track.js';

// The start/finish complex: checkered arch with a START/FINISH sign and light
// panels, grandstands with an instanced blocky crowd on both sides, flags along
// the straights, and two big screens that display the live lap counter.

const SKIN_TONES = ['#f0c3a0', '#d9a377', '#b57a52', '#8a563a', '#f6d9bd'];

const CROWD_COLORS = ['#e04444', '#3a72d8', '#f2c230', '#36b24a', '#e84393', '#f0f0f0', '#e67e22'];

function makeTextTexture(text, { width = 512, height = 128, bg = '#101418', fg = '#ffd75e', font = 'bold 72px sans-serif' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);
  return new THREE.CanvasTexture(canvas);
}

export class StartFinish {
  constructor({ track }) {
    this.group = new THREE.Group();
    this.track = track;
    // Everything scales off the track's road width so the arch and stands fit
    // whatever circuit is loaded.
    this.halfWidth = track.roadWidth / 2;

    const start = track.getStartTransform();
    this._root = new THREE.Group();
    this._root.position.set(start.x, 0, start.z);
    this._root.rotation.y = start.heading;
    this.group.add(this._root);

    this._buildArch();
    this._buildGrandstands();
    this._buildScreens();
    this._buildFlags();
  }

  _buildArch() {
    const metal = new THREE.MeshStandardMaterial({ color: 0xd8dde5, metalness: 0.5, roughness: 0.4 });
    const pillarGeometry = new THREE.CylinderGeometry(0.4, 0.5, 8, 8);

    for (const side of [1, -1]) {
      const pillar = new THREE.Mesh(pillarGeometry, metal);
      pillar.position.set(side * (this.halfWidth + 1.8), 4, 0);
      pillar.castShadow = false; // perf: only karts cast shadows
      this._root.add(pillar);
    }

    // Checkered banner across the top.
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(this.track.roadWidth + 4.6, 1.7, 0.35),
      new THREE.MeshStandardMaterial({ map: makeCheckerTexture(20, 2), roughness: 0.7 })
    );
    banner.position.set(0, 8.4, 0);
    banner.castShadow = false; // perf: only karts cast shadows
    this._root.add(banner);

    // START / FINISH sign under the banner: two single-sided planes back to
    // back, so the text reads correctly from both directions (a DoubleSide
    // plane mirrors the text on the reverse face).
    const signGeometry = new THREE.PlaneGeometry(12, 1.4);
    const signMaterial = new THREE.MeshBasicMaterial({
      map: makeTextTexture('START / FINISH', { fg: '#ffffff', font: 'bold 58px sans-serif' }),
    });
    for (const facing of [0, Math.PI]) {
      const sign = new THREE.Mesh(signGeometry, signMaterial);
      sign.position.set(0, 7.1, facing === 0 ? 0.2 : -0.2);
      sign.rotation.y = facing;
      this._root.add(sign);
    }

    // Light panels along the underside of the banner.
    const panelGeometry = new THREE.BoxGeometry(0.5, 0.16, 0.3);
    const panelMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      emissive: 0xfff3c0,
      emissiveIntensity: 1.1,
    });
    const panels = new THREE.InstancedMesh(panelGeometry, panelMaterial, 20);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 20; i++) {
      dummy.position.set(-14.2 + i * 1.5, 7.5, 0.2);
      dummy.updateMatrix();
      panels.setMatrixAt(i, dummy.matrix);
    }
    this._root.add(panels);
  }

  _buildGrandstands() {
    const standMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa4b2, roughness: 0.8 });
    const stepGeometry = new THREE.BoxGeometry(24, 0.8, 2.2);
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x3a72d8, roughness: 0.6 });
    // Low-poly spectator parts. Segment counts are deliberately tiny — these
    // are instanced thousands of times across both stands.
    // Minimal segment counts: these are instanced ~150 times per stand, so
    // every extra ring costs thousands of triangles for detail nobody sees
    // from the track.
    const crowdGeometry = new THREE.CapsuleGeometry(0.19, 0.3, 1, 5);
    const headGeometry = new THREE.SphereGeometry(0.15, 6, 4);
    const armGeometry = new THREE.CapsuleGeometry(0.06, 0.26, 1, 3);
    const crowdMaterial = new THREE.MeshStandardMaterial({ roughness: 0.85 });

    for (const side of [1, -1]) {
      const stand = new THREE.Group();
      stand.position.set(side * (this.halfWidth + 8.5), 0, -8);
      stand.rotation.y = side * -Math.PI / 2;

      // Three rising steps.
      for (let row = 0; row < 3; row++) {
        const step = new THREE.Mesh(stepGeometry, standMaterial);
        step.position.set(0, 0.4 + row * 0.85, -row * 2.1);
        step.castShadow = false; // perf: only karts cast shadows
        step.receiveShadow = true;
        stand.add(step);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(25, 0.25, 8.5), roofMaterial);
      roof.position.set(0, 4.6, -2.2);
      roof.castShadow = false; // perf: only karts cast shadows
      stand.add(roof);

      // Seated crowd: torso + head + arm hints, in a few poses. Each part is
      // its own InstancedMesh, so the whole grandstand is ~4 draw calls no
      // matter how many spectators there are.
      const perRow = 26;
      const seats = perRow * 3;
      const torsos = new THREE.InstancedMesh(crowdGeometry, crowdMaterial, seats);
      const heads = new THREE.InstancedMesh(headGeometry, crowdMaterial, seats);
      // Two arm meshes per spectator; unused ones are scaled to zero.
      const armsL = new THREE.InstancedMesh(armGeometry, crowdMaterial, seats);
      const armsR = new THREE.InstancedMesh(armGeometry, crowdMaterial, seats);

      const dummy = new THREE.Object3D();
      const color = new THREE.Color();
      const skin = new THREE.Color();
      let i = 0;
      for (let row = 0; row < 3; row++) {
        for (let c = 0; c < perRow; c++) {
          const x = -11.5 + c * 0.92 + Math.random() * 0.2;
          const y = 1.05 + row * 0.85;
          const z = -row * 2.1 + (Math.random() - 0.5) * 0.25;
          // 0 = arms down, 1 = arms up (cheering), 2 = leaning forward
          const pose = Math.random() < 0.35 ? 1 : Math.random() < 0.6 ? 0 : 2;
          const lean = pose === 2 ? 0.28 : 0;
          const yaw = (Math.random() - 0.5) * 0.4;
          const shirt = CROWD_COLORS[Math.floor(Math.random() * CROWD_COLORS.length)];

          dummy.position.set(x, y, z);
          dummy.rotation.set(lean, yaw, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          torsos.setMatrixAt(i, dummy.matrix);
          torsos.setColorAt(i, color.set(shirt));

          dummy.position.set(x, y + 0.42 - lean * 0.1, z + lean * 0.22);
          dummy.rotation.set(0, yaw, 0);
          dummy.updateMatrix();
          heads.setMatrixAt(i, dummy.matrix);
          heads.setColorAt(i, skin.set(SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)]));

          // Arms: raised overhead when cheering, otherwise tucked at the sides.
          for (const [mesh, side] of [[armsL, 1], [armsR, -1]]) {
            if (pose === 1) {
              dummy.position.set(x + side * 0.2, y + 0.4, z);
              dummy.rotation.set(0, yaw, side * 0.35);
            } else {
              dummy.position.set(x + side * 0.24, y + 0.02, z + lean * 0.12);
              dummy.rotation.set(lean, yaw, side * 0.12);
            }
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            mesh.setColorAt(i, color.set(shirt));
          }
          i++;
        }
      }
      for (const mesh of [torsos, heads, armsL, armsR]) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        stand.add(mesh);
      }
      this._root.add(stand);
    }
  }

  _buildScreens() {
    this._screenTextures = [];
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x444a55, roughness: 0.7 });

    for (const side of [1, -1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 6, 8), poleMaterial);
      pole.position.set(side * (this.halfWidth + 4.5), 3, 14);
      this._root.add(pole);

      const texture = makeTextTexture('LAP 1/3', { width: 512, height: 256, fg: '#ffd75e', font: 'bold 110px sans-serif' });
      this._screenTextures.push(texture);
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(6, 3),
        new THREE.MeshBasicMaterial({ map: texture })
      );
      screen.position.set(side * (this.halfWidth + 4.5), 6.6, 14);
      screen.rotation.y = Math.PI + side * 0.35;
      this._root.add(screen);
    }
  }

  // Colorful banner flags along the start straight.
  _buildFlags() {
    const count = 20;
    const poleGeometry = new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5);
    poleGeometry.translate(0, 1.3, 0);
    const flagGeometry = new THREE.PlaneGeometry(0.75, 0.5);
    flagGeometry.translate(0.4, 2.3, 0);

    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x666e7a, roughness: 0.7 });
    const flagMaterial = new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide });

    const poles = new THREE.InstancedMesh(poleGeometry, poleMaterial, count);
    const flags = new THREE.InstancedMesh(flagGeometry, flagMaterial, count);

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const curve = this.track.curve;
    const length = curve.getLength();
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const dist = 6 + Math.floor(i / 2) * 9;
      const t = ((1 - dist / length) % 1 + 1) % 1; // back along the start straight
      const p = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      const flagOffset = this.halfWidth + 1.9;
      dummy.position.set(p.x + tangent.z * side * flagOffset, 0, p.z - tangent.x * side * flagOffset);
      dummy.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      flags.setMatrixAt(i, dummy.matrix);
      flags.setColorAt(i, color.set(CROWD_COLORS[i % CROWD_COLORS.length]));
    }
    this.group.add(poles, flags);
  }

  setLap(current, total) {
    for (const texture of this._screenTextures) {
      const canvas = texture.image;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#101418';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffd75e';
      ctx.font = 'bold 110px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`LAP ${current}/${total}`, canvas.width / 2, canvas.height / 2);
      texture.needsUpdate = true;
    }
  }

  addTo(scene) {
    scene.add(this.group);
  }
}
