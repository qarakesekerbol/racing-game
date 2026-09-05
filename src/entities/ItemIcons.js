import * as THREE from 'three';

// One visual language for item types, in both 3D (floating inside a pickup
// sphere) and 2D (the HUD slot). Geometries and materials are built once and
// shared by every pickup — a pickup swaps the geometry on a single mesh rather
// than owning five of them.

export const ITEM_TYPES = ['nitro', 'shield', 'oil', 'rocket', 'slowdown'];

export const ITEM_COLORS = {
  nitro: '#4fc3ff',
  shield: '#6ec7ff',
  oil: '#b08cf2',
  rocket: '#ff6b57',
  slowdown: '#7ce7a8',
};

export const ITEM_NAMES = {
  nitro: 'Nitro',
  shield: 'Shield',
  oil: 'Oil Slick',
  rocket: 'Rocket',
  slowdown: 'Slowdown',
};

let geometries = null;
let materials = null;

function extrude(shape, depth = 0.3) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.035,
    bevelSegments: 1,
  });
  g.center();
  return g;
}

function boltShape() {
  const s = new THREE.Shape();
  s.moveTo(0.12, 0.55);
  s.lineTo(-0.28, 0.02);
  s.lineTo(-0.02, 0.02);
  s.lineTo(-0.14, -0.55);
  s.lineTo(0.3, 0.06);
  s.lineTo(0.04, 0.06);
  s.closePath();
  return s;
}

function shieldShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.52);
  s.lineTo(0.38, 0.3);
  s.lineTo(0.38, -0.1);
  // taper to a point at the bottom
  s.quadraticCurveTo(0.3, -0.4, 0, -0.55);
  s.quadraticCurveTo(-0.3, -0.4, -0.38, -0.1);
  s.lineTo(-0.38, 0.3);
  s.closePath();
  return s;
}

function buildGeometries() {
  if (geometries) return geometries;

  // Droplet: lathe a teardrop profile (pointed top, round belly).
  const dropPoints = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const y = 0.55 - t * 1.05;
    // radius swells toward the bottom then closes off
    const r = Math.sin(t * Math.PI * 0.92) * 0.36 * (0.35 + t * 0.75);
    dropPoints.push(new THREE.Vector2(Math.max(0.001, r), y));
  }
  const droplet = new THREE.LatheGeometry(dropPoints, 12);
  droplet.center();

  // Rocket: lathe a nose-cone + body profile.
  const rocketPoints = [
    new THREE.Vector2(0.001, 0.6),
    new THREE.Vector2(0.12, 0.34),
    new THREE.Vector2(0.19, 0.05),
    new THREE.Vector2(0.19, -0.3),
    new THREE.Vector2(0.26, -0.42),
    new THREE.Vector2(0.12, -0.5),
    new THREE.Vector2(0.001, -0.52),
  ];
  const rocket = new THREE.LatheGeometry(rocketPoints, 12);
  rocket.center();

  // Slowdown: a clock ring; the hands are a second small mesh (see buildIcon).
  const clock = new THREE.TorusGeometry(0.4, 0.09, 8, 18);
  clock.center();

  geometries = {
    nitro: extrude(boltShape(), 0.32),
    shield: extrude(shieldShape(), 0.28),
    oil: droplet,
    rocket,
    slowdown: clock,
    // Clock hands, shown only for the slowdown icon.
    hands: (() => {
      const group = new THREE.BufferGeometry();
      const long = new THREE.BoxGeometry(0.07, 0.34, 0.07);
      long.translate(0, 0.17, 0);
      const short = new THREE.BoxGeometry(0.07, 0.22, 0.07);
      short.rotateZ(-Math.PI / 2);
      short.translate(0.11, 0, 0);
      // Merge the two hands into one buffer so the icon stays 2 draw calls.
      return mergeGeometries([long, short]) ?? group;
    })(),
  };
  return geometries;
}

// Minimal geometry merge (avoids pulling in the BufferGeometryUtils addon for
// two boxes). Both inputs are non-indexed-safe simple box geometries.
function mergeGeometries(list) {
  const positions = [];
  const normals = [];
  for (const g of list) {
    const nonIndexed = g.index ? g.toNonIndexed() : g;
    positions.push(...nonIndexed.attributes.position.array);
    normals.push(...nonIndexed.attributes.normal.array);
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return merged;
}

function buildMaterials() {
  if (materials) return materials;
  materials = {};
  for (const type of ITEM_TYPES) {
    materials[type] = new THREE.MeshStandardMaterial({
      color: ITEM_COLORS[type],
      emissive: new THREE.Color(ITEM_COLORS[type]),
      emissiveIntensity: 1.5,
      roughness: 0.35,
      metalness: 0.1,
    });
  }
  return materials;
}

// A small group holding the icon mesh (plus clock hands when relevant).
// setIconType() swaps geometry/material in place — no rebuild, no new draws.
export function buildIcon(type = 'nitro') {
  const geo = buildGeometries();
  const mats = buildMaterials();

  const group = new THREE.Group();
  const main = new THREE.Mesh(geo[type], mats[type]);
  group.add(main);

  const hands = new THREE.Mesh(geo.hands, mats.slowdown);
  hands.visible = type === 'slowdown';
  group.add(hands);

  group.userData.main = main;
  group.userData.hands = hands;
  return group;
}

export function setIconType(iconGroup, type) {
  const geo = buildGeometries();
  const mats = buildMaterials();
  const main = iconGroup.userData.main;
  main.geometry = geo[type];
  main.material = mats[type];
  iconGroup.userData.hands.visible = type === 'slowdown';
}

export function setIconEmissive(intensity) {
  const mats = buildMaterials();
  for (const type of ITEM_TYPES) mats[type].emissiveIntensity = intensity;
}

// --- 2D versions for the HUD slot -----------------------------------------
// Same silhouettes as the 3D icons so the HUD reads as the same object.

const svg = (body) =>
  `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

export const ITEM_SVG = {
  nitro: svg(
    `<path d="M13.4 2 6.6 12.4h4.2L9.9 22l7.3-11h-4.6z" fill="${ITEM_COLORS.nitro}"/>`
  ),
  shield: svg(
    `<path d="M12 2l8 3.2v6.1c0 5-3.3 8.6-8 10.7-4.7-2.1-8-5.7-8-10.7V5.2z" fill="${ITEM_COLORS.shield}"/>` +
      `<path d="M12 4.4l5.8 2.3v4.6c0 3.7-2.4 6.5-5.8 8.2z" fill="#ffffff" opacity="0.32"/>`
  ),
  oil: svg(
    `<path d="M12 2.5c3.4 4.6 6 7.9 6 11a6 6 0 0 1-12 0c0-3.1 2.6-6.4 6-11z" fill="${ITEM_COLORS.oil}"/>` +
      `<ellipse cx="9.6" cy="14.2" rx="1.5" ry="2.2" fill="#ffffff" opacity="0.35"/>`
  ),
  rocket: svg(
    `<path d="M12 1.8c3 2.6 4.5 6.2 4.5 9.9 0 1.7-.3 3.3-.9 4.7h-7.2c-.6-1.4-.9-3-.9-4.7 0-3.7 1.5-7.3 4.5-9.9z" fill="${ITEM_COLORS.rocket}"/>` +
      `<circle cx="12" cy="9.4" r="2" fill="#cfe8ff"/>` +
      `<path d="M7.6 15.8 5 19.4l3.4-.9zM16.4 15.8 19 19.4l-3.4-.9z" fill="#c94a37"/>` +
      `<path d="M10.6 18.6h2.8L12 22.4z" fill="#ffd75e"/>`
  ),
  slowdown: svg(
    `<circle cx="12" cy="12" r="8.6" fill="none" stroke="${ITEM_COLORS.slowdown}" stroke-width="2.6"/>` +
      `<path d="M12 6.6V12l3.6 2.2" fill="none" stroke="${ITEM_COLORS.slowdown}" stroke-width="2.2" stroke-linecap="round"/>`
  ),
};
