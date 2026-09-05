import * as THREE from 'three';
import { buildKartStyle, repaintKartStyle, KART_STYLE_IDS } from './kartStyles.js';

// Thin facade over the kart style builders. Car.js talks to this so it never
// needs to know which body style is in use; kartStyles.js owns the geometry.

export { KART_STYLE_IDS };

export function buildKart({ bodyColor, accentColor, style }) {
  return buildKartStyle({ style, bodyColor, accentColor });
}

export function repaintKart(kart, bodyColor, accentColor) {
  repaintKartStyle(kart, bodyColor, accentColor);
}

// Accent color derived from the body color when none is given: hue-shifted and
// brighter, so every variant automatically gets a readable two-tone scheme.
export function deriveAccent(bodyColor) {
  const c = new THREE.Color(bodyColor);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL((hsl.h + 0.08) % 1, Math.min(1, hsl.s * 1.1 + 0.1), Math.min(0.85, hsl.l + 0.25));
  return `#${c.getHexString()}`;
}

export function randomStyle() {
  return KART_STYLE_IDS[Math.floor(Math.random() * KART_STYLE_IDS.length)];
}
