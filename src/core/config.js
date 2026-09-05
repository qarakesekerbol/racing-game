// Central tuning config. All gameplay/visual "feel" numbers live here.
// Ranges are [min, max] pairs picked randomly per particle.

// Active quality preset. Read fresh each frame so changing
// CONFIG.quality.level at runtime takes effect immediately.
export function getQuality() {
  const q = CONFIG.quality;
  return q.levels[q.level] ?? q.levels.medium;
}

export const CONFIG = {
  game: {
    title: 'FROST RUSH GP',
    subtitle: 'winter kart racing',
  },

  // aiSpeedScale multiplies each AI's rolled maxSpeedFactor.
  difficulty: {
    easy: { label: 'Easy', aiSpeedScale: 0.88, rubberScale: 0.6 },
    normal: { label: 'Normal', aiSpeedScale: 1.0, rubberScale: 1.0 },
    hard: { label: 'Hard', aiSpeedScale: 1.12, rubberScale: 1.4 },
  },

  // Kart color choices offered in the setup screen.
  playerColors: ['#d1263a', '#2f7de1', '#36b24a', '#f2c230', '#8e44ad', '#1abcb4'],

  // Track difficulty tiers, shown as tabs on the track select screen.
  // A tier is not just a label: it scales the AI field and item pressure on
  // top of the player's chosen difficulty, so Hard tracks genuinely fight back.
  tiers: {
    easy: {
      label: 'Easy', color: '#4fd48a', stars: 1,
      aiSpeed: 0.9, aiAggression: 0.82, rubberScale: 0.6, aiItemDelay: [2.5, 6],
    },
    medium: {
      label: 'Medium', color: '#ffc247', stars: 2,
      aiSpeed: 1.0, aiAggression: 1.0, rubberScale: 1.0, aiItemDelay: [1.5, 4],
    },
    hard: {
      label: 'Hard', color: '#ff6b57', stars: 3,
      aiSpeed: 1.14, aiAggression: 1.2, rubberScale: 1.6, aiItemDelay: [0.6, 2],
    },
  },

  // Kart body styles. Each is a distinct low-poly model, not a recolor.
  kartStyles: [
    { id: 'racer', name: 'Racer', blurb: 'Low, sleek, quick to turn in.' },
    { id: 'buggy', name: 'Buggy', blurb: 'Rugged, roll cage, fat offroad tyres.' },
    { id: 'classic', name: 'Classic', blurb: 'Rounded retro shape with a big grille.' },
    { id: 'stealth', name: 'Stealth', blurb: 'Angular, futuristic, sharp edges.' },
  ],

  car: {
    maxSpeed: 42, // m/s (~151 km/h)
    maxReverseSpeed: 12, // m/s
    acceleration: 15, // m/s^2
    brakeDeceleration: 26, // m/s^2
    naturalDeceleration: 5, // rolling friction + drag, m/s^2
    handbrakeDeceleration: 18, // longitudinal slowdown from handbrake, m/s^2
    wheelBase: 2.6, // meters
    maxSteerAngle: 0.62, // radians
    steerLerpSpeed: 6, // steering response, 1/s
    steerAuthorityDrop: 0.55, // how much steering shrinks at top speed (0..1)
    maxYawRate: 1.5, // rad/s cap — raw bicycle-model yaw explodes at high speed
    spinOutRate: 9, // rad/s while spinning out from a hit
    airGravity: 24, // m/s^2 pulling an airborne kart back down
  },

  drift: {
    thresholdDeg: 15, // slip angle that counts as drifting
    minSpeedKmh: 30, // below this a slide is never "a drift"
    endGrace: 0.35, // seconds under threshold before the drift officially ends
    gripNormal: 9, // lateral velocity decay rate, 1/s (higher = grippier)
    gripHandbrake: 1.5, // grip while Space is held
    gripDrifting: 2.2, // grip while drifting with throttle held (keeps the slide alive)
    gripSharpTurn: 3.2, // grip when steering hard at high speed (drift initiation)
    gripDropRate: 14, // how fast grip falls to a lower target, 1/s
    gripRecoveryRate: 3.5, // how fast grip returns to normal (throttle released), 1/s
    sharpTurnSteerRatio: 0.75, // fraction of max steer that counts as "sharp"
    sharpTurnMinSpeedKmh: 60,
    driftSteerBoost: 1.35, // extra yaw authority while drifting (counter-steer control)
    scoreRate: 0.4, // points per (slip degree * m/s * second)
    minBankScore: 60, // drifts scoring less than this bank nothing
    comboWindow: 3.0, // seconds after a banked drift to chain the next one
    boostMinDuration: 1.2, // drifts shorter than this give no boost
    boostSpeed: 5, // m/s added to forward speed when a long drift ends
    boostMaxSpeedFactor: 1.12, // boost may push speed up to maxSpeed * this
  },

  skidMarks: {
    maxMarks: 500, // pool size (ring buffer, old marks get overwritten)
    spacing: 0.45, // min meters between consecutive marks per wheel
    width: 0.32,
    length: 0.62,
    opacity: 0.55,
    yOffset: 0.035, // above road surface to avoid z-fighting
  },

  smoke: {
    maxParticles: 300,
    ratePerWheel: 45, // particles per second per rear wheel at full intensity
    life: [0.4, 0.8], // seconds
    size: [12, 24], // base point size (screen-space, distance attenuated)
    rise: [1.0, 2.0], // upward velocity, m/s
    spread: 1.4, // horizontal random velocity, m/s
    opacity: 0.26,
  },

  camera: {
    baseFov: 65,
    driftFovBoost: 8, // degrees added to FOV while drifting
    speedFovBoost: 6, // degrees added at top speed (scales with speed)
    fovLerpSpeed: 4, // 1/s
    positionSmoothing: 4, // higher = snappier follow
    driftPositionSmoothing: 2.2, // extra lag while drifting
    lookSmoothing: 7,
    shakeDecay: 5, // 1/s — how fast collision shake settles
    shakeAmplitude: 0.55, // meters of jitter at full shake
    dipDecay: 6, // 1/s — landing dip recovery
    dipAmount: 1.1, // meters the camera drops on a full-force landing
  },

  bodyRoll: {
    perSlipRad: 0.45, // body roll per radian of slip angle
    perSteerRad: 0.12, // small lean from steering alone
    max: 0.2, // radians
    lerpSpeed: 6, // 1/s
  },

  ai: {
    count: 7,
    // hex string works for both THREE.Color and canvas fillStyle
    colors: [
      { hex: '#2f7de1', name: 'Blue' },
      { hex: '#36b24a', name: 'Green' },
      { hex: '#f2c230', name: 'Yellow' },
      { hex: '#8e44ad', name: 'Purple' },
      { hex: '#e67e22', name: 'Orange' },
      { hex: '#1abcb4', name: 'Cyan' },
      { hex: '#e84393', name: 'Pink' },
    ],
    // Per-car randomness ranges [min, max].
    // Calibrated against measured solo lap times: a first-try player laps in
    // ~28s, and this band spans ~31.5s (slowest) to ~25.4s (fastest), so the
    // field brackets the player instead of driving away from them.
    maxSpeedFactor: [0.68, 0.86], // of CONFIG.car.maxSpeed
    aggression: [0.7, 1.0], // 1 = brakes late, corners fast
    lateralOffsetRange: 8, // AI lane offsets spread across the wide road
    laneChangeInterval: [4, 10], // seconds between an AI picking a new lane
    laneChangeRate: 0.7, // how fast the offset drifts to the new lane, 1/s
    // driving
    lookAheadBase: 6, // meters
    lookAheadPerSpeed: 0.45, // extra look-ahead seconds worth of travel
    steerDeadzone: 0.05, // radians of heading error before steering kicks in
    cornerLookAhead: 26, // meters ahead to measure upcoming curvature
    cornerMaxAngle: 1.1, // radians of heading change that means "hairpin"
    minCornerSpeed: 11, // m/s floor in the tightest corners
    brakeMargin: 2.5, // m/s over target speed before actively braking
    // avoidance
    avoidDistance: 11, // meters ahead to start reacting to a car
    avoidBrakeDistance: 5.5, // closer than this = lift off hard
    avoidShift: 2.0, // sideways target shift, meters
    avoidWidth: 2.4, // lateral corridor that counts as "directly ahead"
    // stuck recovery
    stuckSpeed: 1.0, // below this counts as stuck, m/s
    stuckTime: 3.0, // seconds
    reverseTime: 1.2, // seconds of backing up
    // rubber-banding (mild by default)
    rubberBand: {
      strength: 0.5, // speed adjustment per full lap of gap to the player
      maxBoost: 0.1, // cap when far behind (+10% speed)
      maxSlow: 0.08, // cap when far ahead (-8% speed)
    },
  },

  collisions: {
    carRadius: 1.4, // bounding circle per car, meters
    restitution: 0.4, // bounciness of car-vs-car impacts
    carSpeedLoss: 0.96, // velocity multiplier applied on impact
    // barrier sits at ROAD_WIDTH/2 + BARRIER_OFFSET = 13.4m from the center line
    wallMaxLateral: 12.4, // max |lateral| for a car center before wall contact
    wallSpeedLoss: 0.9, // velocity multiplier on wall contact
    wallBounce: 0.25, // how much outward velocity reflects back
  },

  grid: {
    columns: 4, // 4 wide x 2 rows on the wide road
    firstRowDistance: 10, // meters behind the start line
    rowSpacing: 8,
    columnSpacing: 5.2, // meters between grid columns
  },

  pickups: {
    // fractions along the track spline where a row of boxes sits
    spots: [0.12, 0.37, 0.62, 0.85],
    // 6 across so a full 8-car pack doesn't strip a row before the back
    // markers arrive (a collected box is gone for respawnTime seconds).
    perRow: 6,
    rowSpacing: 3.6, // meters between boxes in a row
    size: 1.9,
    hoverHeight: 1.2,
    iconCycleSeconds: 0.9, // mystery-box icon shuffle rate
    iconSwaySpeed: 1.1, // rad/s of the icon's back-and-forth turn
    iconSwayRange: 0.95, // radians either side of facing
    // MeshPhysicalMaterial transmission looks best but costs a whole extra
    // scene pass; the fresnel shader is the shipped default.
    useTransmission: false,
    sparklesPer: 4, // orbiting sparkles per pickup (one shared Points cloud)
    sparkleRadius: 1.35,
    sparkleSize: 13,
    bobAmplitude: 0.18,
    bobSpeed: 2.2, // rad/s
    spinSpeed: 1.6, // rad/s
    pickupRadius: 2.2, // meters
    respawnTime: 5, // seconds
    burstParticles: 14,
    burstLife: 0.5,
    burstSpeed: 6,
  },

  items: {
    // relative weights for the random roll
    weights: { nitro: 30, shield: 22, oil: 20, rocket: 18, slowdown: 10 },
    nitro: {
      duration: 2.5,
      speedMultiplier: 1.35,
      accelMultiplier: 1.8,
      fovBoost: 12,
      flameRate: 90, // particles per second
    },
    shield: {
      duration: 8,
      radius: 2.1,
    },
    oil: {
      dropDistance: 5, // meters behind the dropping car
      radius: 2.4,
      life: 12, // seconds the slick stays on track
      gripMultiplier: 0.12,
      spinOutTime: 1.0,
      visualRadius: 2.4,
    },
    rocket: {
      speed: 46, // m/s along the track
      turnRate: 3.2, // rad/s homing authority
      life: 6, // seconds before it fizzles
      hitRadius: 2.4,
      spinOutTime: 0.9,
      trailRate: 70,
    },
    slowdown: {
      targets: 3, // cars behind the user
      duration: 3,
      speedMultiplier: 0.75,
    },
    // AI behavior
    aiUseDelay: [1, 4], // seconds before an AI fires its item
  },

  // Quality scales the three things that actually cost frames: shadow map
  // resolution, bloom, and how many real lights exist. Change `level` here or
  // at runtime via CONFIG.quality.level (read every frame).
  quality: {
    level: 'medium', // 'low' | 'medium' | 'high'
    levels: {
      low: {
        shadowMapSize: 1024,
        shadowRadius: 55, // half-size of the shadow frustum around the player
        maxLampLights: 0, // emissive lamp heads only
        bloom: false,
        bloomResolutionScale: 0.5,
        pixelRatioCap: 1,
      },
      medium: {
        shadowMapSize: 1536,
        shadowRadius: 70,
        maxLampLights: 4,
        bloom: true,
        bloomResolutionScale: 0.5, // half-res bloom: most of the look, half the cost
        pixelRatioCap: 1.5,
      },
      high: {
        shadowMapSize: 2048,
        shadowRadius: 90,
        maxLampLights: 6,
        bloom: true,
        bloomResolutionScale: 1,
        pixelRatioCap: 2,
      },
    },
  },

  timeOfDay: {
    startMode: 'day', // 'day' | 'sunset' | 'night'
    transitionSeconds: 2, // cross-fade time between modes
    autoCycle: false, // slowly advance modes during the race
    autoCycleSeconds: 45, // time spent in each mode when autoCycle is on
    // Winter palette: bright snow day, warm pink-orange alpenglow sunset,
    // moonlit blue night (ambient raised so snow/road edges stay readable).
    modes: {
      day: {
        label: 'Day',
        sunDirection: [60, 90, -40], // light position; direction is toward origin
        sunColor: 0xfff1d6,
        sunIntensity: 1.5,
        ambientColor: 0xeaf2ff,
        ambientIntensity: 0.62,
        skyTop: 0x4d92e8,
        skyBottom: 0xe6f1fc,
        fogColor: 0xd9e8f7,
        fogNear: 160,
        fogFar: 460,
        shadowOpacity: 1,
        starOpacity: 0,
        headlights: false,
        emissiveBoost: 1,
      },
      sunset: {
        label: 'Sunset',
        sunDirection: [110, 18, -30], // low sun = long shadows on the snow
        sunColor: 0xff9a4c,
        sunIntensity: 1.4,
        ambientColor: 0xffb08a,
        ambientIntensity: 0.42,
        skyTop: 0x35427f,
        skyBottom: 0xffa068,
        fogColor: 0xf5a878,
        fogNear: 100,
        fogFar: 350,
        shadowOpacity: 1,
        starOpacity: 0.15,
        headlights: true,
        emissiveBoost: 1.6,
      },
      night: {
        label: 'Night',
        sunDirection: [-50, 80, 40], // moon
        sunColor: 0xa8bcff,
        sunIntensity: 0.42, // snow bounces moonlight
        ambientColor: 0x46557f,
        ambientIntensity: 0.34, // raised so the road edges stay readable
        skyTop: 0x040812,
        skyBottom: 0x131d38,
        fogColor: 0x0c1424,
        fogNear: 55,
        fogFar: 210,
        shadowOpacity: 0.5,
        starOpacity: 1,
        headlights: true,
        emissiveBoost: 2.4,
      },
    },
  },

  lights: {
    headlights: {
      // Real SpotLights only for the player; every car (including the player)
      // also gets a cheap additive ground decal so beams read on the road.
      playerSpotIntensity: 30,
      distance: 38,
      angle: 0.34, // narrower cone, radians
      penumbra: 0.55,
      color: 0xfff0d0,
      offsetX: 0.5, // lamp position on the kart nose
      offsetY: 0.34, // bumper height, not roof height
      offsetZ: 1.65,
      // Ground light pool (fake beam on the road surface)
      decalLength: 15,
      decalWidth: 5.4,
      decalForward: 8, // meters ahead of the car
      decalOpacity: 0.38,
      decalOpacityAI: 0.26,
    },
    tailLights: {
      color: 0xff2020,
      idleIntensity: 0.35, // emissive strength when coasting
      brakeIntensity: 1.6,
      offsetX: 0.5,
      offsetY: 0.48,
      offsetZ: -1.62,
      size: 0.14,
    },
    streetLamps: {
      count: 20, // the widened track is ~40% longer
      side: 1, // 1 = left edge, -1 = right, alternates automatically
      alternateSides: true,
      lateralOffset: 15.6, // meters from center line (outside the barrier)
      poleHeight: 4.6, // shorter, less obtrusive
      poleRadius: 0.09,
      headColor: 0xffe6a8,
      // Pooled PointLights; the actual cap comes from the quality level.
      lightIntensity: 26,
      lightDistance: 26,
      lightHeight: 4.3,
      emissiveIntensity: 1.5,
    },
  },

  // Color grade pass (saturation boost + vignette). Skipped on low quality.
  postFX: {
    enabled: true,
    saturation: 1.14,
    vignette: 0.34, // edge darkening strength
    vignetteSoftness: 0.55,
  },

  // Winter scenery instance counts — the perf knobs for the environment.
  scenery: {
    treeCount: 320,
    rockCount: 60,
    snowBankSpacing: 2.6, // meters between bank blobs along the road edges
    snowBankOffset: 15.2, // lateral distance from the center line
    mountainRings: [
      { count: 22, radius: [320, 360], height: [22, 42], color: 0xbccbdf },
      { count: 18, radius: [430, 475], height: [45, 80], color: 0xd4dfec },
    ],
    cloudCount: 9,
    trackClearance: 20, // no trees/rocks closer than this to the spline
  },

  bloom: {
    enabled: true, // master switch; quality level can still disable it
    strength: 0.28, // mild: only the brightest cores should glow
    radius: 0.42,
    threshold: 0.88, // high threshold keeps lamps/pickups from blowing out
    nightStrength: 0.42,
    dayEnabled: false, // no bloom in daylight — nothing needs it there
  },

  obstacles: {
    cones: {
      // spots along the spline: [t, lateral offset in meters]
      spots: [
        [0.05, 10.4], [0.07, 10.8], [0.09, 10.5],
        [0.28, -10.6], [0.30, -11.0], [0.32, -10.4],
        [0.55, 10.8], [0.57, 10.4],
        [0.72, -10.8], [0.74, -10.4], [0.76, -11.0],
      ],
      radius: 0.5,
      knockSpeed: 9, // m/s a hit cone flies away at
      knockSpin: 7, // rad/s tumble
      settleTime: 4, // seconds before a knocked cone is restored
      carSpeedLoss: 0.97, // barely slows the car
    },
    tireStacks: {
      // Keep clear of t > 0.90: the starting grid occupies ~0.94-0.99.
      spots: [
        [0.18, 11.5], [0.20, 11.5],
        [0.45, -11.5], [0.47, -11.5],
        [0.66, 11.5],
        [0.82, -11.5], [0.84, -11.5],
      ],
      radius: 1.1,
      restitution: 0.35,
      carSpeedLoss: 0.6, // solid: hurts
    },
    slippery: {
      // [t, lateral offset, radius]
      spots: [
        [0.22, -4, 8],
        [0.5, 4, 7.5],
        [0.78, -3, 8],
      ],
      gripMultiplier: 0.25,
    },
    boostPads: {
      // [t, lateral offset]
      spots: [
        [0.15, 3],
        [0.42, -4],
        [0.68, 4],
      ],
      duration: 1.5,
      speedMultiplier: 1.32,
      accelMultiplier: 1.8,
      cooldown: 1.0, // per car, so sitting on a pad doesn't re-trigger
      // Visual strip size — also the trigger footprint.
      width: 6,
      length: 8,
    },
    // Ramp geometry drives the launch: vy = speed * sin(rampAngle), where
    // rampAngle = atan(height / length). Position is per-track.
    ramp: {
      length: 6.5, // run-up length along the road
      height: 2.3, // lip height
      width: 11, // wide enough to be a real feature
      launchBoost: 1.15, // slight arcade exaggeration over pure ballistics
      maxLaunch: 13,
      minSpeed: 9, // slower than this just rolls over it
      cooldown: 1.2,
      signDistance: 26, // warning sign this far before the ramp
    },
  },
};
