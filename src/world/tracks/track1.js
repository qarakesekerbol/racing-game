// Frostpine Loop — the original winter circuit.
//
// A track is pure data: layout, theme name, and where every item/obstacle
// sits. All positions along the spline are given as `t` in 0..1, with a
// lateral offset in meters (positive = left of the driving direction), so the
// same numbers stay valid if the spline is rescaled.

export const track1 = {
  id: 'frostpine',
  name: 'Frostpine Loop',
  theme: 'winter',
  tier: 'easy',
  difficulty: 1, // 1-3, shown as stars on the track card
  description: 'Wide, flowing curves through a snowy pine forest. Room to breathe.',

  roadWidth: 26,
  controlPoints: [
    [0, 63],
    [63, 84],
    [119, 49],
    [133, -14],
    [91, -77],
    [21, -98],
    [-49, -77],
    [-77, -21],
    [-112, 21],
    [-77, 70],
  ],

  scenery: {
    treeCount: 320,
    rockCount: 60,
    propCount: 4,
    trackClearance: 20,
    snowBankSpacing: 2.6,
    snowBankOffset: 15.2,
  },

  streetLamps: { count: 20, lateralOffset: 15.6, poleHeight: 4.6 },

  // A short run of arch frames over the back stretch.
  tunnel: { ts: [0.5, 0.515, 0.53, 0.545], color: 0x3a72d8 },

  // Generous: five rows, six wide — you should rarely be without an item.
  pickups: { spots: [0.1, 0.28, 0.46, 0.64, 0.85], perRow: 6, rowSpacing: 3.6 },

  obstacles: {
    // Minimal hazards: a couple of cone clusters well off the racing line.
    cones: [
      [0.28, -11.0], [0.30, -11.4],
      [0.72, 11.0], [0.74, 11.4],
    ],
    tireStacks: [
      [0.45, -11.8],
      [0.82, 11.8],
    ],
    // One shallow patch only — Easy shouldn't punish a small mistake.
    slippery: [
      [0.5, 5, 6],
    ],
    boostPads: [
      [0.15, 3],
      [0.42, -4],
      [0.68, 4],
    ],
    // Mid back-straight: long clear runway so the ramp is visible early.
    ramp: { t: 0.34, offset: 0 },
  },
};
