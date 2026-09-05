import * as THREE from 'three';

// Four distinct low-poly kart bodies. Each style builds its own geometry —
// they differ in silhouette, ride height, wheel size and detail, not just
// color. All of them return the same rig so Car.js doesn't care which is used:
//
//   { group, bodyGroup, wheels, bodyMeshes, accentMeshes, wheelRadius }
//
// bodyGroup rolls into turns and squashes on landing; wheels are steering
// pivots each holding a spin group.

const materialCache = new Map();

function getMaterials(bodyColor, accentColor) {
  const key = `${bodyColor}|${accentColor}`;
  if (materialCache.has(key)) return materialCache.get(key);
  const mats = {
    body: new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.28, roughness: 0.45 }),
    accent: new THREE.MeshStandardMaterial({ color: accentColor, metalness: 0.3, roughness: 0.4 }),
    dark: shared('dark', () => new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.75 })),
    tire: shared('tire', () => new THREE.MeshStandardMaterial({ color: 0x141417, roughness: 0.95 })),
    metal: shared('metal', () => new THREE.MeshStandardMaterial({ color: 0x9aa2ad, metalness: 0.85, roughness: 0.35 })),
    glass: shared('glass', () => new THREE.MeshStandardMaterial({
      color: 0x8fd8ff, metalness: 0.4, roughness: 0.15, transparent: true, opacity: 0.55,
    })),
  };
  materialCache.set(key, mats);
  return mats;
}

const sharedCache = new Map();
function shared(key, make) {
  if (!sharedCache.has(key)) sharedCache.set(key, make());
  return sharedCache.get(key);
}

// Wheel geometry is shared per radius/width combination.
function wheelGeometry(radius, width) {
  return shared(`wheel-${radius}-${width}`, () => {
    const g = new THREE.CylinderGeometry(radius, radius, width, 14);
    g.rotateZ(Math.PI / 2); // axle along X; rotation.x is the rolling spin
    return g;
  });
}

function treadGeometry(radius, width) {
  // Chunky offroad tread: a torus band around the tire.
  return shared(`tread-${radius}-${width}`, () => {
    const g = new THREE.TorusGeometry(radius * 0.92, radius * 0.16, 5, 10);
    g.rotateY(Math.PI / 2);
    return g;
  });
}

function hubGeometry(radius, width) {
  return shared(`hub-${radius}-${width}`, () => {
    const g = new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, width + 0.05, 8);
    g.rotateZ(Math.PI / 2);
    return g;
  });
}

// Soft contact shadow under the kart, so it reads as grounded on bright snow.
function blobGeometry(w, l) {
  return shared(`blob-${w}-${l}`, () => {
    const g = new THREE.PlaneGeometry(w, l);
    g.rotateX(-Math.PI / 2);
    return g;
  });
}

function blobMaterial() {
  return shared('blob-mat', () => {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(10,12,18,0.42)');
    g.addColorStop(1, 'rgba(10,12,18,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
    });
  });
}

// Builder context shared by all styles: tracks which meshes take which color
// so repaintKart() can swap materials later without rebuilding geometry.
function makeRig({ wheelRadius, wheelWidth, offsetX, offsetZ, tread = false, blob = [2.8, 4.2] }) {
  const group = new THREE.Group();
  const bodyGroup = new THREE.Group();
  group.add(bodyGroup);

  const bodyMeshes = [];
  const accentMeshes = [];

  // Contact shadow. Kept as a child of the kart but counter-offset in Y each
  // frame (see Car._updateGroundBlob) so it stays on the ground during jumps
  // instead of flying up with the kart.
  const blobMesh = new THREE.Mesh(blobGeometry(blob[0], blob[1]), blobMaterial().clone());
  blobMesh.position.y = 0.025;
  blobMesh.renderOrder = 1;
  group.add(blobMesh);

  return {
    group,
    bodyGroup,
    bodyMeshes,
    accentMeshes,
    blobMesh,
    wheelRadius,
    // add(geometry, material, x, y, z, opts)
    add(geometry, material, x, y, z, opts = {}) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      if (opts.rot) mesh.rotation.set(opts.rot[0] ?? 0, opts.rot[1] ?? 0, opts.rot[2] ?? 0);
      if (opts.scale) mesh.scale.set(...opts.scale);
      mesh.castShadow = opts.castShadow ?? true;
      (opts.parent ?? bodyGroup).add(mesh);
      if (opts.tag === 'body') bodyMeshes.push(mesh);
      if (opts.tag === 'accent') accentMeshes.push(mesh);
      return mesh;
    },
    buildWheels(materials) {
      const wheels = {};
      const geo = wheelGeometry(wheelRadius, wheelWidth);
      const hub = hubGeometry(wheelRadius, wheelWidth);
      const tre = tread ? treadGeometry(wheelRadius, wheelWidth) : null;

      for (const [name, x, z] of [
        ['frontLeft', offsetX, offsetZ],
        ['frontRight', -offsetX, offsetZ],
        ['rearLeft', offsetX, -offsetZ],
        ['rearRight', -offsetX, -offsetZ],
      ]) {
        const pivot = new THREE.Group();
        pivot.position.set(x, wheelRadius, z);
        const spin = new THREE.Group();

        const tire = new THREE.Mesh(geo, materials.tire);
        tire.castShadow = true;
        spin.add(tire);
        if (tre) spin.add(new THREE.Mesh(tre, materials.dark));
        const hubMesh = new THREE.Mesh(hub, materials.accent);
        accentMeshes.push(hubMesh);
        spin.add(hubMesh);

        pivot.add(spin);
        pivot.userData.spinMesh = spin;
        group.add(pivot);
        wheels[name] = pivot;
      }
      return wheels;
    },
  };
}

// --- Racer: low, sleek, pointed nose, big rear wing -----------------------

function buildRacer(m) {
  const rig = makeRig({ wheelRadius: 0.3, wheelWidth: 0.32, offsetX: 0.95, offsetZ: 1.15 });
  const { add } = rig;

  // Flat wedge chassis with a pointed nose.
  const shape = new THREE.Shape();
  shape.moveTo(-0.82, -1.7);
  shape.lineTo(0.82, -1.7);
  shape.lineTo(0.68, 0.9);
  shape.lineTo(0.22, 1.85);
  shape.lineTo(-0.22, 1.85);
  shape.lineTo(-0.68, 0.9);
  shape.closePath();
  const chassis = new THREE.ExtrudeGeometry(shape, {
    depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1,
  });
  chassis.rotateX(-Math.PI / 2);
  add(chassis, m.body, 0, 0.2, 0, { tag: 'body' });

  // Raised engine cover and cockpit surround.
  add(new THREE.BoxGeometry(0.9, 0.34, 1.25), m.body, 0, 0.55, -0.75, { tag: 'body' });
  add(new THREE.BoxGeometry(0.72, 0.3, 0.62), m.dark, 0, 0.58, -0.05);
  add(new THREE.SphereGeometry(0.21, 12, 10), m.accent, 0, 0.86, -0.28, { tag: 'accent' });
  add(new THREE.BoxGeometry(0.3, 0.1, 0.09), m.dark, 0, 0.87, -0.09, { castShadow: false });

  // Side pods and a low front splitter.
  for (const side of [1, -1]) {
    add(new THREE.BoxGeometry(0.2, 0.22, 1.1), m.accent, side * 0.86, 0.32, -0.35, { tag: 'accent' });
  }
  add(new THREE.BoxGeometry(1.5, 0.07, 0.42), m.accent, 0, 0.16, 1.78, { tag: 'accent' });

  // Rear wing on twin pylons.
  add(new THREE.BoxGeometry(0.07, 0.3, 0.1), m.metal, 0.36, 0.6, -1.62, { castShadow: false });
  add(new THREE.BoxGeometry(0.07, 0.3, 0.1), m.metal, -0.36, 0.6, -1.62, { castShadow: false });
  add(new THREE.BoxGeometry(1.55, 0.07, 0.45), m.accent, 0, 0.8, -1.66, { tag: 'accent' });

  return rig;
}

// --- Buggy: tall, rugged, roll cage, fat knobbly tyres ---------------------

function buildBuggy(m) {
  const rig = makeRig({
    wheelRadius: 0.46, wheelWidth: 0.42, offsetX: 1.02, offsetZ: 1.2, tread: true, blob: [3.1, 4.4],
  });
  const { add } = rig;

  // Boxy tub sitting high on the suspension.
  add(new THREE.BoxGeometry(1.55, 0.42, 3.0), m.body, 0, 0.62, 0, { tag: 'body' });
  add(new THREE.BoxGeometry(1.35, 0.3, 0.9), m.dark, 0, 0.95, -0.35);
  // Skid plate and chunky bumpers.
  add(new THREE.BoxGeometry(1.5, 0.14, 0.5), m.metal, 0, 0.38, 1.55, { castShadow: false });
  add(new THREE.BoxGeometry(1.5, 0.14, 0.5), m.metal, 0, 0.38, -1.55, { castShadow: false });

  // Roll cage: four uprights joined by a top frame.
  const bar = new THREE.CylinderGeometry(0.06, 0.06, 1, 6);
  for (const [x, z, h] of [[0.66, 0.35, 0.95], [-0.66, 0.35, 0.95], [0.66, -0.95, 1.15], [-0.66, -0.95, 1.15]]) {
    add(bar, m.metal, x, 0.83 + h / 2, z, { scale: [1, h, 1], castShadow: false });
  }
  add(new THREE.BoxGeometry(1.42, 0.08, 0.08), m.metal, 0, 1.78, 0.35, { castShadow: false });
  add(new THREE.BoxGeometry(1.42, 0.08, 0.08), m.metal, 0, 1.98, -0.95, { castShadow: false });
  for (const side of [1, -1]) {
    add(new THREE.BoxGeometry(0.08, 0.08, 1.35), m.metal, side * 0.66, 1.9, -0.3, { castShadow: false });
  }

  // Driver + light bar.
  add(new THREE.BoxGeometry(0.44, 0.42, 0.34), m.accent, 0, 1.05, -0.25, { tag: 'accent' });
  add(new THREE.SphereGeometry(0.23, 12, 10), m.body, 0, 1.42, -0.28, { tag: 'body' });
  add(new THREE.BoxGeometry(1.0, 0.16, 0.14), m.accent, 0, 1.86, 0.36, { tag: 'accent', castShadow: false });

  // Snorkel exhaust.
  add(new THREE.CylinderGeometry(0.07, 0.09, 0.8, 8), m.metal, 0.52, 1.15, -1.25, {
    rot: [0.25, 0, 0], castShadow: false,
  });

  return rig;
}

// --- Classic: rounded retro body, big grille, whitewall look ---------------

function buildClassic(m) {
  const rig = makeRig({ wheelRadius: 0.36, wheelWidth: 0.3, offsetX: 0.9, offsetZ: 1.1 });
  const { add } = rig;

  // Rounded hull: a squashed sphere reads far softer than a box.
  add(new THREE.SphereGeometry(1, 14, 10), m.body, 0, 0.6, -0.1, {
    scale: [0.92, 0.5, 1.7], tag: 'body',
  });
  // Bulbous nose and tail caps.
  add(new THREE.SphereGeometry(0.62, 12, 9), m.body, 0, 0.5, 1.35, { scale: [1, 0.72, 0.9], tag: 'body' });
  add(new THREE.SphereGeometry(0.66, 12, 9), m.body, 0, 0.52, -1.42, { scale: [1, 0.76, 0.85], tag: 'body' });

  // Chrome grille and round headlamps.
  add(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 10), m.metal, 0, 0.5, 1.78, { rot: [Math.PI / 2, 0, 0] });
  for (const side of [1, -1]) {
    add(new THREE.SphereGeometry(0.15, 10, 8), m.metal, side * 0.52, 0.62, 1.55, { castShadow: false });
  }
  // Chrome side strip.
  for (const side of [1, -1]) {
    add(new THREE.BoxGeometry(0.06, 0.09, 2.1), m.metal, side * 0.86, 0.5, -0.1, { castShadow: false });
  }

  // Open cockpit with a rounded windscreen.
  add(new THREE.BoxGeometry(0.78, 0.26, 0.7), m.dark, 0, 0.86, -0.45);
  add(new THREE.SphereGeometry(0.2, 12, 10), m.accent, 0, 1.05, -0.6, { tag: 'accent' });
  add(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 12, 1, false, 0, Math.PI), m.glass, 0, 1.0, -0.08, {
    rot: [Math.PI / 2.4, 0, 0], castShadow: false,
  });

  // Rear-mounted spare wheel.
  add(new THREE.TorusGeometry(0.26, 0.09, 6, 12), m.dark, 0, 0.72, -1.82, { castShadow: false });

  return rig;
}

// --- Stealth: angular, faceted, futuristic ---------------------------------

function buildStealth(m) {
  const rig = makeRig({ wheelRadius: 0.32, wheelWidth: 0.36, offsetX: 0.98, offsetZ: 1.2 });
  const { add } = rig;

  // Sharp arrowhead plan-form, extruded thin.
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.95);
  shape.lineTo(0.95, 0.1);
  shape.lineTo(0.78, -1.5);
  shape.lineTo(0.36, -1.78);
  shape.lineTo(-0.36, -1.78);
  shape.lineTo(-0.78, -1.5);
  shape.lineTo(-0.95, 0.1);
  shape.closePath();
  const hull = new THREE.ExtrudeGeometry(shape, {
    depth: 0.3, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.09, bevelSegments: 1,
  });
  hull.rotateX(-Math.PI / 2);
  add(hull, m.body, 0, 0.24, 0, { tag: 'body' });

  // Faceted canopy: an octahedron reads as cut glass.
  add(new THREE.OctahedronGeometry(0.52, 0), m.glass, 0, 0.72, -0.3, {
    scale: [1, 0.62, 1.35], castShadow: false,
  });
  add(new THREE.SphereGeometry(0.2, 10, 8), m.dark, 0, 0.66, -0.42);

  // Angular shoulder blades over the rear wheels.
  for (const side of [1, -1]) {
    add(new THREE.BoxGeometry(0.34, 0.2, 1.0), m.accent, side * 0.82, 0.5, -0.85, {
      rot: [0, 0, side * 0.25], tag: 'accent',
    });
  }

  // Glowing thruster ring and a swept rear blade.
  add(new THREE.CylinderGeometry(0.26, 0.32, 0.3, 8), m.accent, 0, 0.42, -1.85, {
    rot: [Math.PI / 2, 0, 0], tag: 'accent',
  });
  add(new THREE.BoxGeometry(1.85, 0.06, 0.34), m.accent, 0, 0.72, -1.66, {
    rot: [0.12, 0, 0], tag: 'accent',
  });
  // Nose blade / splitter.
  add(new THREE.BoxGeometry(1.05, 0.05, 0.5), m.dark, 0, 0.16, 1.62, { castShadow: false });

  return rig;
}

const BUILDERS = {
  racer: buildRacer,
  buggy: buildBuggy,
  classic: buildClassic,
  stealth: buildStealth,
};

export const KART_STYLE_IDS = Object.keys(BUILDERS);

export function buildKartStyle({ style = 'racer', bodyColor, accentColor }) {
  const materials = getMaterials(bodyColor, accentColor);
  const build = BUILDERS[style] ?? BUILDERS.racer;
  const rig = build(materials);
  const wheels = rig.buildWheels(materials);

  return {
    group: rig.group,
    bodyGroup: rig.bodyGroup,
    wheels,
    bodyMeshes: rig.bodyMeshes,
    accentMeshes: rig.accentMeshes,
    wheelRadius: rig.wheelRadius,
    blobMesh: rig.blobMesh,
    style,
  };
}

export function repaintKartStyle(kart, bodyColor, accentColor) {
  const m = getMaterials(bodyColor, accentColor);
  for (const mesh of kart.bodyMeshes) mesh.material = m.body;
  for (const mesh of kart.accentMeshes) mesh.material = m.accent;
}
