// Visual themes a track can pick. A theme owns everything about how the world
// *looks* (ground, vegetation, rocks, banks, lighting palette); a track data
// file owns the *layout* (spline, widths, item placement) and names a theme.
//
// Adding a theme means adding an entry here — no other file needs to change.

export const THEMES = {
  winter: {
    name: 'winter',
    ground: {
      color: 0xf3f6fb,
      nightColor: 0x8fa3cc, // snow reflects moonlight
      texture: 'snow',
    },
    // Roadside banks hugging both edges.
    banks: { color: 0xf0f4fa, scale: [1.5, 0.55, 1.5], jitter: 1.3 },
    vegetation: {
      kind: 'pine',
      trunkColor: 0x5a4030,
      foliageColor: 0x2d5a3d,
      capColor: 0xe8eef6, // snow cap
    },
    rocks: { color: 0x8b93a1, style: 'boulder' },
    mountains: [
      { count: 22, radius: [320, 360], height: [22, 42], color: 0xbccbdf },
      { count: 18, radius: [430, 475], height: [45, 80], color: 0xd4dfec },
    ],
    props: 'snowmen',
    // Per-time-of-day overrides merged over CONFIG.timeOfDay.modes.
    lighting: {},
  },

  desert: {
    name: 'desert',
    ground: {
      color: 0xd9a86a,
      nightColor: 0x5a4a5e,
      texture: 'sand',
    },
    banks: { color: 0xc8975f, scale: [1.8, 0.5, 1.8], jitter: 1.6 },
    vegetation: {
      kind: 'cactus',
      trunkColor: 0x4c7a3f,
      foliageColor: 0x3f6b35,
      capColor: 0xd7e8b0, // pale flowering tips
    },
    rocks: { color: 0xb2724a, style: 'mesa' },
    mountains: [
      { count: 20, radius: [330, 375], height: [30, 55], color: 0xc98a5c },
      { count: 16, radius: [440, 490], height: [55, 95], color: 0xd9a878 },
    ],
    props: 'none',
    // Sun-baked orange light and a warm haze instead of cold fog.
    lighting: {
      day: {
        sunColor: 0xfff0c4,
        sunIntensity: 1.75,
        ambientColor: 0xffe3bd,
        ambientIntensity: 0.6,
        skyTop: 0x3f8fd8,
        skyBottom: 0xf6d9a6,
        fogColor: 0xe8c48c, // haze
        fogNear: 110,
        fogFar: 400,
      },
      sunset: {
        sunColor: 0xff7a3c,
        ambientColor: 0xffa06a,
        skyTop: 0x54357a,
        skyBottom: 0xff8a4a,
        fogColor: 0xf09250,
        fogNear: 80,
        fogFar: 320,
      },
      night: {
        sunColor: 0x9fb0ff,
        ambientColor: 0x4a4568,
        skyTop: 0x05060f,
        skyBottom: 0x1a1526,
        fogColor: 0x140f1c,
        fogNear: 60,
        fogFar: 230,
      },
    },
  },
};

export function getTheme(name) {
  return THEMES[name] ?? THEMES.winter;
}
