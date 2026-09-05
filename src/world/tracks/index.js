import { track1 } from './track1.js';
import { track2 } from './track2.js';
import { track3 } from './track3.js';

// Track registry. Adding a track = create its data file and list it here.
// Ordered easy -> hard so the select screen reads naturally.
export const TRACKS = [track1, track3, track2];

export function getTrack(id) {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}

export function tracksByTier(tier) {
  return TRACKS.filter((t) => t.tier === tier);
}
