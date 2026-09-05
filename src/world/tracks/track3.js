// Pinecrest Sprint — the Medium tier.
//
// Shorter than Frostpine and noticeably tighter: a moderate 21m road, two
// genuine direction changes and a closing S-bend, with more obstacles than
// Easy but none of Canyon's narrow technical sections.

export const track3 = {
  id: 'pinecrest',
  name: 'Pinecrest Sprint',
  theme: 'winter',
  tier: 'medium',
  difficulty: 2,
  description: 'A short, punchy circuit with two hairpins and a closing S-bend.',

  roadWidth: 21,
  controlPoints: [
    [0, 52],
    [52, 68],
    [96, 40],
    [102, -6],
    // first direction change, tighter than anything on Frostpine
    [70, -44],
    [22, -52],
    [-16, -30],
    // second, pinching back on itself
    [-30, 6],
    [-70, 22],
    [-58, 56],
    [-22, 44],
  ],

  scenery: {
    treeCount: 280,
    rockCount: 55,
    propCount: 3,
    trackClearance: 18,
    snowBankSpacing: 2.6,
    snowBankOffset: 12.6,
  },

  streetLamps: { count: 16, lateralOffset: 13.0, poleHeight: 4.6 },

  tunnel: { ts: [0.62, 0.635, 0.65], color: 0x2f8fe0 },

  pickups: { spots: [0.14, 0.4, 0.66, 0.88], perRow: 5, rowSpacing: 3.2 },

  obstacles: {
    cones: [
      [0.08, 8.4], [0.10, 8.8],
      [0.31, -8.6], [0.33, -8.2], [0.35, -8.9],
      [0.58, 8.6], [0.60, 8.2],
      [0.79, -8.6], [0.81, -8.9],
    ],
    tireStacks: [
      [0.22, 9.4], [0.24, 9.4],
      [0.47, -9.4],
      [0.71, 9.4], [0.73, 9.4],
    ],
    slippery: [
      [0.28, -3, 6],
      [0.69, 3, 6],
    ],
    boostPads: [
      [0.18, 0],
      [0.52, 3],
      [0.84, -3],
    ],
    // Early on the opening straight, with a clear run-up.
    ramp: { t: 0.05, offset: 0 },
  },
};
