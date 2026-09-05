// Central tuning config. All gameplay/visual "feel" numbers live here.
// Ranges are [min, max] pairs picked randomly per particle.

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
};
