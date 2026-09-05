// Canyon Run — a longer desert circuit.
//
// Layout notes: the control points around t≈0.30 pinch into a genuine hairpin
// (two near points with a tight reversal), while t≈0.60-0.75 is a long
// constant-radius sweeper taken near top speed. The canyon gap sits on the
// back straight where the bridge crosses it.

export const track2 = {
  id: 'canyon',
  name: 'Canyon Run',
  theme: 'desert',
  tier: 'hard',
  difficulty: 3,
  description: 'A long canyon circuit: one brutal hairpin, one flat-out sweeper.',

  roadWidth: 17, // noticeably tighter than Easy's 26m
  controlPoints: [
    [0, 80],
    [80, 104],
    [150, 74],
    [176, 16],
    // --- hairpin 1: tight reversal around the rock spur ---
    [150, -30],
    [100, -40],
    [86, -80],
    [128, -112],
    // --- long sweeping right-hander back across the canyon ---
    [96, -158],
    [16, -172],
    [-64, -150],
    // --- hairpin 2: a second, tighter reversal before the run home ---
    [-118, -108],
    [-96, -66],
    [-140, -34],
    [-152, 20],
    [-120, 60],
    [-58, 88],
  ],

  scenery: {
    treeCount: 150, // cacti are sparser than a pine forest
    rockCount: 120, // mesas and boulders carry this theme instead
    propCount: 0,
    trackClearance: 22,
    snowBankSpacing: 3.2, // sand berms
    snowBankOffset: 10.8,
  },

  streetLamps: { count: 16, lateralOffset: 11.2, poleHeight: 5.2 },

  tunnel: null, // no tunnel here — the bridge is this track's landmark

  // Wooden bridge spanning a canyon gap on the back straight.
  bridge: { from: 0.545, to: 0.605, deckColor: 0x9c6b3f, railColor: 0x7a5230 },

  // Fewer, narrower rows: contesting an item costs you the racing line.
  pickups: { spots: [0.16, 0.46, 0.8], perRow: 4, rowSpacing: 2.9 },

  obstacles: {
    // Dense hazards, several near the racing line through the technical bits.
    cones: [
      [0.24, 6.6], [0.26, 7.0], [0.28, 6.4], [0.30, 2.0],
      [0.42, -6.8], [0.44, -7.2], [0.46, -2.5],
      [0.60, 6.8], [0.62, 7.2],
      [0.72, -6.6], [0.74, -7.0], [0.76, -2.0],
      [0.88, 6.8], [0.90, 7.2],
    ],
    tireStacks: [
      [0.22, 7.6], [0.24, 7.6],
      [0.40, -7.6], [0.43, -7.6],
      [0.58, 7.6],
      [0.70, -7.6], [0.72, -7.6],
      [0.92, 7.6],
    ],
    // Ice through both hairpins and the sweeper exit.
    slippery: [
      [0.29, 0, 6.5],
      [0.5, 2.5, 6],
      [0.66, -2.5, 6],
      [0.78, 0, 6.5],
    ],
    boostPads: [
      [0.2, 0],
      [0.5, 3],
      [0.78, -3],
    ],
    // On the long opening straight, well before the hairpin.
    ramp: { t: 0.12, offset: 0 },
  },
};
