// Central tuning config. All gameplay/visual "feel" numbers live here.
// Ranges are [min, max] pairs picked randomly per particle.

// Active quality preset. Read fresh each frame so changing
// CONFIG.quality.level at runtime takes effect immediately.
export function getQuality() {
  const q = CONFIG.quality;
  return q.levels[q.level] ?? q.levels.medium;
}

export const CONFIG = {
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
    fovLerpSpeed: 4, // 1/s
    positionSmoothing: 4, // higher = snappier follow
    driftPositionSmoothing: 2.2, // extra lag while drifting
    lookSmoothing: 7,
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
    // per-car randomness ranges [min, max]
    maxSpeedFactor: [0.86, 0.97], // of CONFIG.car.maxSpeed
    aggression: [0.7, 1.0], // 1 = brakes late, corners fast
    lateralOffsetRange: 2.2, // random preferred offset from center line, +/- meters
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
    // barrier sits at ROAD_WIDTH/2 + BARRIER_OFFSET = 5.9m from the center line
    wallMaxLateral: 4.85, // max |lateral| for a car center before wall contact
    wallSpeedLoss: 0.9, // velocity multiplier on wall contact
    wallBounce: 0.25, // how much outward velocity reflects back
  },

  grid: {
    firstRowDistance: 8, // meters behind the start line
    rowSpacing: 7,
    columnOffset: 2.3, // meters left/right of center line
  },

  pickups: {
    // fractions along the track spline where a row of boxes sits
    spots: [0.12, 0.37, 0.62, 0.85],
    // 5 across so a full 8-car pack doesn't strip a row before the back
    // markers arrive (a collected box is gone for respawnTime seconds).
    perRow: 5,
    rowSpacing: 2.3, // meters between boxes in a row
    size: 1.5,
    hoverHeight: 1.1,
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
    modes: {
      day: {
        label: 'Day',
        sunDirection: [60, 90, -40], // light position; direction is toward origin
        sunColor: 0xfff4e0,
        sunIntensity: 1.6,
        ambientColor: 0xffffff,
        ambientIntensity: 0.55,
        skyTop: 0x5aa0f0,
        skyBottom: 0xbfe0ff,
        fogColor: 0x8fc7ff,
        fogNear: 150,
        fogFar: 450,
        shadowOpacity: 1, // scales shadow darkness via light intensity split
        starOpacity: 0,
        headlights: false,
        emissiveBoost: 1,
      },
      sunset: {
        label: 'Sunset',
        sunDirection: [110, 18, -30], // low sun = long shadows
        sunColor: 0xff9a3c,
        sunIntensity: 1.5,
        ambientColor: 0xff9d6e,
        ambientIntensity: 0.38,
        skyTop: 0x2a3d7a,
        skyBottom: 0xff8c54,
        fogColor: 0xff9a5c,
        fogNear: 90,
        fogFar: 340,
        shadowOpacity: 1,
        starOpacity: 0.15,
        headlights: true,
        emissiveBoost: 1.6,
      },
      night: {
        label: 'Night',
        groundTint: 0x27384f, // multiplied into ground/grass so it reads dark blue-green
        sunDirection: [-50, 80, 40], // moon
        sunColor: 0x9fb4ff,
        sunIntensity: 0.32,
        ambientColor: 0x2a3560,
        ambientIntensity: 0.22,
        skyTop: 0x03060f,
        skyBottom: 0x0e1730,
        fogColor: 0x070b18,
        fogNear: 45,
        fogFar: 190, // strong fog
        shadowOpacity: 0.5,
        starOpacity: 1,
        headlights: true,
        emissiveBoost: 2.6,
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
      offsetX: 0.6, // lamp position on the car
      offsetY: 0.42, // bumper height, not roof height
      offsetZ: 2.1,
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
      offsetX: 0.62,
      offsetY: 0.62,
      offsetZ: -2.1,
      size: 0.16,
    },
    streetLamps: {
      count: 14, // sparser: they were visually noisy in daylight
      side: 1, // 1 = left edge, -1 = right, alternates automatically
      alternateSides: true,
      lateralOffset: 7.4, // meters from center line (outside the barrier)
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
        [0.05, 4.2], [0.07, 4.4], [0.09, 4.3],
        [0.28, -4.3], [0.30, -4.5], [0.32, -4.2],
        [0.55, 4.4], [0.57, 4.2],
        [0.72, -4.4], [0.74, -4.2], [0.76, -4.5],
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
        [0.18, 5.0], [0.20, 5.0],
        [0.45, -5.0], [0.47, -5.0],
        [0.66, 5.0],
        [0.82, -5.0], [0.84, -5.0],
      ],
      radius: 1.1,
      restitution: 0.35,
      carSpeedLoss: 0.6, // solid: hurts
    },
    sweepers: {
      count: 2,
      startOffsets: [0.5, 0.9], // spread around the track
      speed: 13, // m/s, slow enough to be an obstacle
      lateralOffset: [2.6, -2.6], // which side of the road each hugs
      radius: 1.6,
      carSpeedLoss: 0.45, // hitting one costs a lot of speed
      color: '#6b7280',
    },
    slippery: {
      // [t, lateral offset, radius]
      spots: [
        [0.22, 0, 5.5],
        [0.5, 1.5, 5.0],
        [0.78, -1.5, 5.5],
      ],
      gripMultiplier: 0.25,
    },
  },
};
