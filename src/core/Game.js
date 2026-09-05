import * as THREE from 'three';
import { InputManager } from './InputManager.js';
import { ChaseCamera } from './ChaseCamera.js';
import { RaceManager } from './RaceManager.js';
import { AIDriver } from './AIDriver.js';
import { Collisions } from './Collisions.js';
import { ItemManager } from './ItemManager.js';
import { PickupManager } from './PickupManager.js';
import { ObstacleManager } from './ObstacleManager.js';
import { CONFIG, getQuality } from './config.js';
import { Car } from '../entities/Car.js';
import { randomStyle } from '../entities/CarModel.js';
import { AICar } from '../entities/AICar.js';
import { ParticleField } from '../entities/ParticleField.js';
import { Pickup } from '../entities/Pickup.js';
import { ItemVisuals } from '../entities/ItemVisuals.js';
import { SkidMarks } from '../entities/SkidMarks.js';
import { TireSmoke } from '../entities/TireSmoke.js';
import { PostProcessing } from './PostProcessing.js';
import { AudioManager } from './AudioManager.js';
import { Records } from './Records.js';
import { Lighting } from '../world/Lighting.js';
import { Sky } from '../world/Sky.js';
import { TimeOfDay } from '../world/TimeOfDay.js';
import { TrackManager } from '../world/TrackManager.js';
import { TRACKS } from '../world/tracks/index.js';
import { HUD } from '../ui/HUD.js';
import { Minimap } from '../ui/Minimap.js';
import { MainMenu } from '../ui/MainMenu.js';
import { KartPreview } from '../ui/KartPreview.js';

// Owns the renderer, scene graph, and the requestAnimationFrame loop.
// Each tick: read input -> update physics/entities -> race logic -> camera -> render -> HUD.

const SKY_COLOR = 0x8fc7ff;
const MAX_DELTA = 0.1; // clamp dt after tab switches / long stalls
const TRACK_SAMPLE_COUNT = 240;
const PLAYER_ID = 'player';
const PLAYER_MINIMAP_COLOR = '#ff4757';

const NEUTRAL_INPUT = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  handbrake: false,
};

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();

    this._initRenderer();
    this._initScene();
    this._initEntities();

    this.hud = new HUD();
    this.input = new InputManager({
      onMethodChange: (method) => this.hud.setInputMethod(method),
      onGamepadConnected: (name) => this.hud.showToast(`Gamepad connected — ${shortPadName(name)}`),
    });
    this.hud.onRestart = () => this._restartRace();
    this.hud.onBackToMenu = () => this.quitToMenu();

    this.audio = new AudioManager();
    this.records = new Records();

    this._buildTrackSystems();

    this.particles = new ParticleField();
    this.particles.addTo(this.scene);
    this.itemVisuals = new ItemVisuals({ scene: this.scene, particles: this.particles });

    this.postProcessing = new PostProcessing({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
    });

    this._elapsed = 0;
    this._useItemHeld = false;
    this._nightHeld = false;

    this.minimapCanvas = document.getElementById('minimap');
    this.minimap = new Minimap(this.minimapCanvas, this._trackSamples);

    this._placeCarsOnGrid();
    this.raceManager.primeCarPositions(this._collectCarsData());

    this._fpsTime = 0;
    this._fpsFrames = 0;
    this._finishShown = false;
    this._restartHeld = false;
    this._pauseHeld = false;
    this._standingsTimer = 0;
    this._lastCountdownSound = null;
    this._lastLapSound = 1;

    // 'menu' (attract mode) | 'racing' | 'paused'
    this.mode = 'menu';
    this._menuCameraAngle = 0;

    this.menu = new MainMenu({
      onPlay: (setup) => this.startRace(setup),
      onResume: () => this.resumeRace(),
      onRestart: () => {
        this._restartRace();
        this.mode = 'racing';
      },
      onQuitToMenu: () => this.quitToMenu(),
      onSettingsChange: (settings) => this._applySettings(settings),
      onPreviewColor: (color) => {
        this.car.setColor(color);
        this.kartPreview?.setKart(this.menu.setup.kartStyle, color);
      },
      onPreviewStyle: (style) => {
        this.car.setStyle(style, this.scene);
        this.kartPreview?.setKart(style, this.menu.setup.color);
      },
      onPreviewActive: (active) => this.kartPreview?.setActive(active),
      // Selecting a card loads that track live behind the menu, so the
      // attract camera previews the real thing.
      onPreviewTrack: (trackId) => this.switchTrack(trackId),
      getRecords: () => this.records.getAll(),
      getTrackBest: (trackId) => this.records.bestLapFor(trackId),
      onAnyClick: () => {
        this.audio.unlock();
        this.audio.play('click');
      },
    });
    this.kartPreview = new KartPreview(document.getElementById('kart-preview'));
    this.kartPreview.setKart(this.menu.setup.kartStyle, this.menu.setup.color);

    this._applySettings(this.menu.settings);
    this.car.setColor(this.menu.setup.color);
    this.hud.setVisible(false);

    // First interaction anywhere unlocks audio (browser autoplay rules).
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    this._onResize = () => this._handleResize();
    window.addEventListener('resize', this._onResize);
  }

  _applySettings(settings) {
    this._settings = settings;
    CONFIG.quality.level = settings.quality;
    CONFIG.bloom.enabled = settings.bloom;
    document.getElementById('minimap').style.display = settings.minimap ? '' : 'none';
    this.input?.setForceTouch(!!settings.touchControls);
    this.audio.setVolumes({
      master: settings.masterVolume,
      music: settings.musicVolume,
      sfx: settings.sfxVolume,
    });
  }

  // --- Mode transitions ---

  startRace({ trackId, color, kartStyle, laps, timeOfDay, difficulty }) {
    if (trackId) this.switchTrack(trackId);
    if (kartStyle) this.car.setStyle(kartStyle, this.scene);
    this.car.setColor(color);
    this.raceManager.totalLaps = laps;
    this._difficultyName = difficulty;

    CONFIG.timeOfDay.autoCycle = timeOfDay === 'auto';
    if (timeOfDay !== 'auto') this.timeOfDay.setMode(timeOfDay);

    // The AI field is shaped by the track's tier AND the player's difficulty
    // choice, multiplied together — a Hard track on Hard is the real test.
    const diff = CONFIG.difficulty[difficulty];
    const tier = CONFIG.tiers[this.world.data.tier] ?? CONFIG.tiers.medium;
    for (const aiCar of this.aiCars) {
      const d = aiCar.driver;
      d.params.maxSpeed = d.baseMaxSpeed * diff.aiSpeedScale * tier.aiSpeed;
      d.params.aggression = Math.min(1.35, (d.baseAggression ?? d.params.aggression) * tier.aiAggression);
      d.params.rubberScale = diff.rubberScale * tier.rubberScale;
    }

    this._restartRace();
    this.mode = 'racing';
    this.hud.setVisible(true);
    this.audio.setEngineActive(true);
    this.audio.setMusicFast(false);
  }

  pauseRace() {
    if (this.mode !== 'racing') return;
    this.mode = 'paused';
    this.audio.setEngineActive(false);
    this.menu.show('pause');
  }

  resumeRace() {
    if (this.mode !== 'paused') return;
    this.mode = 'racing';
    this.audio.setEngineActive(true);
  }

  quitToMenu() {
    this.mode = 'menu';
    this.hud.setVisible(false);
    this.hud.hideFinish();
    this.audio.setEngineActive(false);
    this.audio.setMusicFast(false);
    // Cars keep driving from wherever they are — attract mode takes over,
    // so every driver needs to know where its car actually is.
    this._attractDriver.resyncPosition(this.car.physics);
    for (const aiCar of this.aiCars) aiCar.driver.resyncPosition(aiCar.physics);
    this.menu.show('main');
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Manual reset so the debug panel can report totals across every pass
    // (the composer renders several passes per frame).
    this.renderer.info.autoReset = false;
    this._appliedPixelRatio = 0;
    this._applyPixelRatio();
  }

  _applyPixelRatio() {
    const cap = getQuality().pixelRatioCap;
    const ratio = Math.min(window.devicePixelRatio, cap);
    if (ratio === this._appliedPixelRatio) return;
    this._appliedPixelRatio = ratio;
    this.renderer.setPixelRatio(ratio);
    this.postProcessing?.setSize(window.innerWidth, window.innerHeight);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY_COLOR);
    this.scene.fog = new THREE.Fog(SKY_COLOR, 150, 450);

    this.camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      1200
    );

    this.lighting = new Lighting();
    this.lighting.addTo(this.scene);

    this.sky = new Sky();
    this.sky.addTo(this.scene);

    this.trackManager = new TrackManager({ scene: this.scene });
    this._loadTrackWorld(TRACKS[0].id);

    this.timeOfDay = new TimeOfDay({
      scene: this.scene,
      lighting: this.lighting,
      sky: this.sky,
      themeLighting: this.world.theme.lighting,
    });
  }

  // Builds (or rebuilds) everything tied to a specific track. Systems that
  // depend on the layout are recreated here; nothing else knows which track
  // is loaded.
  _loadTrackWorld(trackId) {
    this.world = this.trackManager.load(trackId);
    this.trackId = trackId;
    this.track = this.world.track;
    this.streetLamps = this.world.streetLamps;
    this.startFinish = this.world.startFinish;
    this.ground = this.world.ground;
    this.scenery = this.world.scenery;
    this._trackSamples = this.world.samples;
    this._lastLapShown = 0;
  }

  // Every system whose behavior depends on the track layout. Rebuilt whenever
  // a different track is loaded; nothing here knows *which* track it is.
  _buildTrackSystems() {
    const samples = this._trackSamples;
    const roadWidth = this.world.roadWidth;
    const data = this.world.data;

    this.raceManager = new RaceManager({ samples, playerId: PLAYER_ID });
    this.raceManager.registerCar(PLAYER_ID);
    for (const aiCar of this.aiCars) this.raceManager.registerCar(aiCar.id);

    this.collisions = new Collisions({ samples, roadWidth });

    this.itemManager = new ItemManager({
      samples,
      aiUseDelay: CONFIG.tiers[data.tier]?.aiItemDelay,
    });
    this.itemManager.registerCar(PLAYER_ID);
    for (const aiCar of this.aiCars) this.itemManager.registerCar(aiCar.id);

    this.pickupManager = new PickupManager({
      track: this.track,
      itemManager: this.itemManager,
      pickupData: data.pickups,
    });
    this.pickupManager.addTo(this.scene);

    this.obstacleManager = new ObstacleManager({
      track: this.track,
      samples,
      obstacleData: data.obstacles,
    });
    this.obstacleManager.addTo(this.scene);

    // AI and attract drivers path on the new spline. baseMaxSpeed carries
    // over: params.maxSpeed may already be difficulty-scaled.
    for (const aiCar of this.aiCars) {
      const base = aiCar.driver.baseMaxSpeed;
      const baseAgg = aiCar.driver.baseAggression;
      aiCar.driver = this._makeDriver(aiCar.driver.params, roadWidth);
      aiCar.driver.baseMaxSpeed = base;
      aiCar.driver.baseAggression = baseAgg;
    }
    this._attractDriver = this._makeDriver(
      { maxSpeed: CONFIG.car.maxSpeed * 0.8, aggression: 0.85, lateralOffset: 0.5 },
      roadWidth
    );

    if (this.minimapCanvas) {
      this.minimap = new Minimap(this.minimapCanvas, samples);
    }
  }

  _makeDriver(params, roadWidth) {
    const driver = new AIDriver({ samples: this._trackSamples, params, roadWidth });
    driver.baseMaxSpeed = params.maxSpeed;
    driver.baseAggression = params.aggression;
    return driver;
  }

  // Swap to a different track: tear the old world down, rebuild systems,
  // re-place the grid.
  switchTrack(trackId) {
    if (trackId === this.trackId) return;
    this.obstacleManager.removeFrom(this.scene);
    for (const pickup of this.pickupManager.pickups) pickup.mesh.removeFromParent();
    this.pickupManager.sparkles?.removeFromParent();

    this._loadTrackWorld(trackId);
    this.timeOfDay.setThemeLighting(this.world.theme.lighting);
    this._buildTrackSystems();
    this.itemVisuals?.reset();
    this.skidMarks?.endTrail();
    this._placeCarsOnGrid();
    this.raceManager.primeCarPositions(this._collectCarsData());
  }

  _initEntities() {
    this.car = new Car({ isPlayer: true, style: 'racer' });
    this.scene.add(this.car.mesh);

    this.aiCars = [];
    for (let i = 0; i < CONFIG.ai.count; i++) {
      const { hex, name } = CONFIG.ai.colors[i % CONFIG.ai.colors.length];
      const driver = new AIDriver({
        samples: this._trackSamples,
        roadWidth: this.world.roadWidth,
        params: {
          maxSpeed: CONFIG.car.maxSpeed * randRange(CONFIG.ai.maxSpeedFactor),
          aggression: randRange(CONFIG.ai.aggression),
          lateralOffset: (Math.random() * 2 - 1) * CONFIG.ai.lateralOffsetRange,
        },
      });
      driver.baseMaxSpeed = driver.params.maxSpeed; // difficulty/tier scale from these
      driver.baseAggression = driver.params.aggression;
      // AI get random body styles for variety in the pack.
      const aiCar = new AICar({ color: hex, name, driver, style: randomStyle() });
      aiCar.id = `ai-${i}`;
      this.aiCars.push(aiCar);
      this.scene.add(aiCar.mesh);
    }

    this.chaseCamera = new ChaseCamera(this.camera);

    this.skidMarks = new SkidMarks();
    this.skidMarks.addTo(this.scene);

    this.tireSmoke = new TireSmoke();
    this.tireSmoke.addTo(this.scene);

    this._rearLeft = new THREE.Vector3();
    this._rearRight = new THREE.Vector3();
  }

  _placeCarsOnGrid() {
    // Player takes the last slot, AI fill the rows ahead.
    const slots = this.track.getGridSlots(this.aiCars.length + 1);
    this.aiCars.forEach((aiCar, i) => aiCar.resetToGrid(slots[i]));
    const playerSlot = slots[slots.length - 1];
    this.car.reset(playerSlot.x, playerSlot.z, playerSlot.heading);
  }

  _collectCarsData() {
    const data = [{ id: PLAYER_ID, x: this.car.physics.x, z: this.car.physics.z }];
    for (const aiCar of this.aiCars) {
      data.push({ id: aiCar.id, x: aiCar.physics.x, z: aiCar.physics.z });
    }
    return data;
  }

  start() {
    this._boundTick = () => this._tick();
    requestAnimationFrame(this._boundTick);
  }

  _tick() {
    requestAnimationFrame(this._boundTick);

    const dt = Math.min(this.clock.getDelta(), MAX_DELTA);
    const rawInput = this.input.getState();

    // Esc toggles pause while racing.
    if (rawInput.pause && !this._pauseHeld) {
      if (this.mode === 'racing') this.pauseRace();
      else if (this.mode === 'paused') {
        this.menu.hide();
        this.resumeRace();
      }
    }
    this._pauseHeld = rawInput.pause;

    if (this.mode === 'paused') {
      // Truly paused: no physics, no timers — just keep presenting the frame.
      this.postProcessing.render();
      return;
    }

    if (this.mode === 'menu') {
      this._tickAttract(dt);
      return;
    }

    // Edge-detect R so holding the key doesn't restart every frame.
    if (rawInput.restart && !this._restartHeld) this._restartRace();
    this._restartHeld = rawInput.restart;

    // N cycles day -> sunset -> night.
    if (rawInput.cycleTimeOfDay && !this._nightHeld) {
      this.hud.showTimeOfDay(this.timeOfDay.cycle());
    }
    this._nightHeld = rawInput.cycleTimeOfDay;

    // F toggles the debug panel.
    if (rawInput.toggleDebug && !this._debugHeld) this.hud.toggleDebug();
    this._debugHeld = rawInput.toggleDebug;

    this.renderer.info.reset();
    this._applyPixelRatio();
    this.timeOfDay.update(dt);
    this._updateLighting(dt);

    this._elapsed += dt;

    // Controls are dead until "GO!" and after the finish line.
    // Only the pre-race countdown takes controls away. A player who has
    // finished can keep driving during the end-of-race window.
    const locked = this.raceManager.controlsLocked;
    const input = locked ? NEUTRAL_INPUT : rawInput;

    // Effects are re-applied from scratch every frame, so a modifier only lasts
    // as long as its source keeps setting it.
    const effectCars = this._collectEffectCars();
    for (const car of effectCars) car.physics.clearModifiers();

    const events = [];
    events.push(...this.pickupManager.update(dt, this._elapsed, effectCars));
    events.push(...this.obstacleManager.update(dt, this._elapsed, effectCars));

    // Player fires an item on the rising edge of Shift/E.
    if (!locked && rawInput.useItem && !this._useItemHeld) {
      const event = this.itemManager.useItem(PLAYER_ID, effectCars);
      if (event) events.push(event);
    }
    this._useItemHeld = rawInput.useItem;

    if (!locked) events.push(...this.itemManager.updateAIUsage(dt, effectCars));
    events.push(...this.itemManager.update(dt, effectCars));

    this.car.update(dt, input);

    // AI cars share position data and race progress for avoidance/rubber-banding.
    const carsData = this._collectCarsData();
    const playerProgress = this.raceManager.getCarState(PLAYER_ID).progress;
    const aiLocked = this.raceManager.controlsLocked;
    for (const aiCar of this.aiCars) {
      aiCar.updateAI(dt, {
        cars: carsData,
        selfId: aiCar.id,
        playerProgress,
        myProgress: this.raceManager.getCarState(aiCar.id).progress,
        raceRunning: !aiLocked,
        locked: aiLocked,
      });
    }

    // Ramp surfaces and collisions are both positional corrections applied
    // after the cars have moved; meshes re-sync below.
    events.push(...this.obstacleManager.resolveRamps(effectCars));
    this.collisions.resolve([
      this.car.physics,
      ...this.aiCars.map((aiCar) => aiCar.physics),
    ]);
    this.car.syncTransform();
    for (const aiCar of this.aiCars) aiCar.syncTransform();

    this.raceManager.update(dt, this._collectCarsData());

    this.itemVisuals.update(dt, this._elapsed, this.itemManager, effectCars);
    this.itemVisuals.handleEvents(events, effectCars);
    this.particles.update(dt);

    const state = this.car.physics.getState();
    this._updateDriftEffects(dt, state);
    this._updateAudio(dt, state, events);

    // Camera shake from anything that hits the player hard.
    for (const impact of this.collisions.impacts) {
      if (impact.a === this.car.physics || impact.b === this.car.physics) {
        this.chaseCamera.addShake(Math.min(0.7, impact.force / 14));
        break;
      }
    }
    for (const event of events) {
      if (event.carId !== PLAYER_ID) continue;
      if (event.type === 'tires-hit') this.chaseCamera.addShake(0.6);
      else if (event.type === 'spinout') this.chaseCamera.addShake(0.45);
    }
    if (state.justLanded) {
      const force = Math.min(1, state.landingImpact / 11);
      this.chaseCamera.addShake(force * 0.5);
      this.chaseCamera.addDip(force);
    }

    // Dust/snow kicked up wherever a kart touches down.
    for (const car of [this.car, ...this.aiCars]) {
      if (!car.physics.justLanded) continue;
      const p = car.physics;
      const tint = this.world.theme.name === 'desert' ? '#e8c48c' : '#eef4ff';
      this.particles.burst(16, () => ({
        position: { x: p.x, y: 0.25, z: p.z },
        color: tint,
        size: 26,
        life: 0.55,
        spread: 5.5,
        gravity: 5,
      }));
      if (car === this.car) this.audio.play('land');
    }

    const playerItems = this.itemManager.getCarItems(PLAYER_ID);
    const padState = this.obstacleManager.getBoostState(PLAYER_ID);
    const boosting = playerItems.nitroTimer > 0 || padState > 0;
    const nitroFov =
      (playerItems.nitroTimer > 0 ? CONFIG.items.nitro.fovBoost : 0) +
      (padState > 0 ? CONFIG.items.nitro.fovBoost * 0.7 : 0);
    this.hud.setSpeedLines(boosting);
    this.chaseCamera.update(dt, this.car.mesh, state, nitroFov);

    this.postProcessing.render();
    this._updateHud(dt, state);
  }

  _updateAudio(dt, state, events) {
    const audio = this.audio;

    // Engine: player pitch/volume from speed; the 3 nearest AI get quiet,
    // distance-attenuated voices.
    const maxSpeed = CONFIG.car.maxSpeed;
    const nearestAi = this.aiCars
      .map((aiCar) => ({
        distance: Math.hypot(
          aiCar.physics.x - state.x,
          aiCar.physics.z - state.z
        ),
        speedRatio: Math.min(
          1,
          Math.hypot(aiCar.physics.vx, aiCar.physics.vz) / maxSpeed
        ),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
    audio.updateEngine(
      Math.min(1, Math.abs(state.speed) / maxSpeed),
      this.input.getState().forward ? 1 : 0,
      nearestAi
    );
    audio.updateDrift(state.drifting, state.slipDeg);

    // Countdown beeps + GO.
    const countdown = this.raceManager.getCountdownDisplay();
    if (countdown !== this._lastCountdownSound) {
      this._lastCountdownSound = countdown;
      if (countdown === 'GO!') audio.play('go');
      else if (countdown !== null) audio.play('beep');
    }

    // Gameplay event sounds — same list the visuals consume.
    for (const event of events) {
      if (event.type === 'pickup' && event.carId === PLAYER_ID) audio.play('pickup');
      else if (event.type === 'nitro' && event.carId === PLAYER_ID) audio.play('nitro');
      else if (event.type === 'shield' && event.carId === PLAYER_ID) audio.play('shieldOn');
      else if (event.type === 'rocket') audio.play('rocket');
      else if (event.type === 'shield-broken') audio.play('shieldPop');
      else if (event.type === 'spinout' && event.carId === PLAYER_ID) audio.play('spinout');
      else if (event.type === 'boost-pad' && event.carId === PLAYER_ID) audio.play('boostPad');
      else if (event.type === 'ramp-launch' && event.carId === PLAYER_ID) audio.play('jump');
      else if (
        (event.type === 'tires-hit' || event.type === 'cone-hit') &&
        event.carId === PLAYER_ID
      ) {
        audio.play('collision', event.type === 'cone-hit' ? 0.4 : 1);
      }
    }

    // Car-vs-car thumps involving the player.
    for (const impact of this.collisions.impacts) {
      if ((impact.a === this.car.physics || impact.b === this.car.physics) && impact.force > 3) {
        audio.play('collision', Math.min(1, impact.force / 12));
        break;
      }
    }

    // Music speeds up on the final lap.
    const race = this.raceManager.getCarState(PLAYER_ID);
    audio.setMusicFast(
      race.lapsCompleted >= this.raceManager.totalLaps - 1 && !race.finished
    );
  }

  // Applies the current time-of-day state to everything that reacts to it:
  // car lights, street lamps, sky, emissive strength and bloom.
  _updateLighting(dt) {
    const state = this.timeOfDay.getState();

    // How "night-like" the current blend is, derived from ambient darkness so
    // it moves smoothly during a transition rather than flipping.
    const dayAmbient = CONFIG.timeOfDay.modes.day.ambientIntensity;
    const nightAmbient = CONFIG.timeOfDay.modes.night.ambientIntensity;
    const nightFactor = THREE.MathUtils.clamp(
      (dayAmbient - state.ambientIntensity) / (dayAmbient - nightAmbient),
      0,
      1
    );
    this._nightFactor = nightFactor;

    // Single shadow-casting light, with its small frustum kept over the player.
    this.lighting.applyQuality();
    this.lighting.setDirection(state.sunDirection);
    this.lighting.follow(this.car.mesh.position);

    this.car.updateLights(state.headlights, nightFactor);
    for (const aiCar of this.aiCars) aiCar.updateLights(state.headlights, nightFactor);

    this.ground.setNightFactor(nightFactor);
    this.streetLamps.update(this.camera.position, nightFactor);
    this.sky.update(dt, this._elapsed, this.camera.position);
    this.particles.setEmissiveBoost(state.emissiveBoost);
    Pickup.setEmissiveBoost(state.emissiveBoost);
    this.itemVisuals.setEmissiveBoost(state.emissiveBoost);
    this.postProcessing.setNightFactor(nightFactor);
  }

  // Shape shared by the pickup/obstacle/item systems: every car with its
  // physics, race rank and progress.
  _collectEffectCars() {
    const rankById = new Map();
    this.raceManager.getRankings().forEach((entry, i) => rankById.set(entry.id, i + 1));

    const cars = [
      {
        id: PLAYER_ID,
        physics: this.car.physics,
        isPlayer: true,
        rank: rankById.get(PLAYER_ID) ?? 1,
        progress: this.raceManager.getCarState(PLAYER_ID).progress,
      },
    ];
    for (const aiCar of this.aiCars) {
      cars.push({
        id: aiCar.id,
        physics: aiCar.physics,
        isPlayer: false,
        rank: rankById.get(aiCar.id) ?? 1,
        progress: this.raceManager.getCarState(aiCar.id).progress,
      });
    }
    return cars;
  }

  // Attract mode behind the main menu: every kart drives idle laps on AI,
  // the camera slowly orbits the track. No race logic, no HUD, no items.
  _tickAttract(dt) {
    this._elapsed += dt;
    this.renderer.info.reset();
    this._applyPixelRatio();
    this.timeOfDay.update(dt);
    this._updateLighting(dt);

    const carsData = this._collectCarsData();
    const context = (selfId, driver) => ({
      cars: carsData,
      selfId,
      playerProgress: 0,
      myProgress: 0,
      raceRunning: true,
    });

    this.car.update(dt, this._attractDriver.getInput(this.car.physics, context(PLAYER_ID), dt));
    for (const aiCar of this.aiCars) {
      aiCar.update(dt, aiCar.driver.getInput(aiCar.physics, context(aiCar.id), dt));
    }

    this.obstacleManager.resolveRamps(this._collectEffectCars());
    this.collisions.resolve([this.car.physics, ...this.aiCars.map((c) => c.physics)]);
    this.car.syncTransform();
    for (const aiCar of this.aiCars) aiCar.syncTransform();

    // Scenery keeps living: boxes rotate, particles fade.
    this.pickupManager.update(dt, this._elapsed, []);
    this.obstacleManager.update(dt, this._elapsed, []);
    this.particles.update(dt);
    this.tireSmoke.update(dt);

    this.kartPreview?.update(dt);

    this._menuCameraAngle += dt * 0.06;
    const radius = 135;
    this.camera.position.set(
      Math.cos(this._menuCameraAngle) * radius,
      58,
      Math.sin(this._menuCameraAngle) * radius
    );
    this.camera.lookAt(0, 0, -8);

    this.postProcessing.render();
  }

  _restartRace() {
    this._lastCountdownSound = null;
    this._lastLapShown = 0;
    this.audio.setEngineActive(true);
    this.raceManager.restart();
    this._placeCarsOnGrid();
    this.raceManager.primeCarPositions(this._collectCarsData());
    this.collisions.reset();
    this.itemManager.reset();
    this.pickupManager.reset();
    this.obstacleManager.reset();
    this.itemVisuals.reset();
    this.skidMarks.endTrail();
    this.hud.hideFinish();
    this.hud.resetDriftDisplay();
    this.hud.setItem(null);
    this._finishShown = false;
    this._useItemHeld = false;
  }

  _buildStandings() {
    const nameById = new Map([[PLAYER_ID, { name: 'You', color: this.car.color }]]);
    for (const aiCar of this.aiCars) {
      nameById.set(aiCar.id, { name: aiCar.name, color: aiCar.color });
    }

    // Once the race is classified, show the official result; before that,
    // show the live order.
    const source =
      this.raceManager.state === 'finished'
        ? this.raceManager.getResults()
        : this.raceManager.getRankings().map((r, i) => ({
            ...r,
            position: i + 1,
            points: null,
            dnf: false,
          }));

    return source.map((entry, i) => ({
      rank: entry.position ?? i + 1,
      name: nameById.get(entry.id).name,
      color: nameById.get(entry.id).color,
      isPlayer: entry.id === PLAYER_ID,
      finished: entry.finished,
      dnf: entry.dnf,
      points: entry.points,
      finishTime: entry.finishTime ?? entry.totalTime,
      lap: Math.min((entry.lapsCompleted ?? 0) + 1, this.raceManager.totalLaps),
      totalLaps: this.raceManager.totalLaps,
    }));
  }

  // Applies the current time-of-day state to everything that reacts to it:
  // car lights, street lamps, sky, emissive strength and bloom.
  _updateLighting(dt) {
    const state = this.timeOfDay.getState();

    // How "night-like" the current blend is, derived from ambient darkness so
    // it moves smoothly during a transition rather than flipping.
    const dayAmbient = CONFIG.timeOfDay.modes.day.ambientIntensity;
    const nightAmbient = CONFIG.timeOfDay.modes.night.ambientIntensity;
    const nightFactor = THREE.MathUtils.clamp(
      (dayAmbient - state.ambientIntensity) / (dayAmbient - nightAmbient),
      0,
      1
    );
    this._nightFactor = nightFactor;

    // Single shadow-casting light, with its small frustum kept over the player.
    this.lighting.applyQuality();
    this.lighting.setDirection(state.sunDirection);
    this.lighting.follow(this.car.mesh.position);

    this.car.updateLights(state.headlights, nightFactor);
    for (const aiCar of this.aiCars) aiCar.updateLights(state.headlights, nightFactor);

    this.ground.setNightFactor(nightFactor);
    this.streetLamps.update(this.camera.position, nightFactor);
    this.sky.update(dt, this._elapsed, this.camera.position);
    this.particles.setEmissiveBoost(state.emissiveBoost);
    Pickup.setEmissiveBoost(state.emissiveBoost);
    this.itemVisuals.setEmissiveBoost(state.emissiveBoost);
    this.postProcessing.setNightFactor(nightFactor);
  }

  // Shape shared by the pickup/obstacle/item systems: every car with its
  // physics, race rank and progress.
  _collectEffectCars() {
    const rankById = new Map();
    this.raceManager.getRankings().forEach((entry, i) => rankById.set(entry.id, i + 1));

    const cars = [
      {
        id: PLAYER_ID,
        physics: this.car.physics,
        isPlayer: true,
        rank: rankById.get(PLAYER_ID) ?? 1,
        progress: this.raceManager.getCarState(PLAYER_ID).progress,
      },
    ];
    for (const aiCar of this.aiCars) {
      cars.push({
        id: aiCar.id,
        physics: aiCar.physics,
        isPlayer: false,
        rank: rankById.get(aiCar.id) ?? 1,
        progress: this.raceManager.getCarState(aiCar.id).progress,
      });
    }
    return cars;
  }

  // Attract mode behind the main menu: every kart drives idle laps on AI,
  // the camera slowly orbits the track. No race logic, no HUD, no items.
  _tickAttract(dt) {
    this._elapsed += dt;
    this.renderer.info.reset();
    this._applyPixelRatio();
    this.timeOfDay.update(dt);
    this._updateLighting(dt);

    const carsData = this._collectCarsData();
    const context = (selfId, driver) => ({
      cars: carsData,
      selfId,
      playerProgress: 0,
      myProgress: 0,
      raceRunning: true,
    });

    this.car.update(dt, this._attractDriver.getInput(this.car.physics, context(PLAYER_ID), dt));
    for (const aiCar of this.aiCars) {
      aiCar.update(dt, aiCar.driver.getInput(aiCar.physics, context(aiCar.id), dt));
    }

    this.obstacleManager.resolveRamps(this._collectEffectCars());
    this.collisions.resolve([this.car.physics, ...this.aiCars.map((c) => c.physics)]);
    this.car.syncTransform();
    for (const aiCar of this.aiCars) aiCar.syncTransform();

    // Scenery keeps living: boxes rotate, particles fade.
    this.pickupManager.update(dt, this._elapsed, []);
    this.obstacleManager.update(dt, this._elapsed, []);
    this.particles.update(dt);
    this.tireSmoke.update(dt);

    this.kartPreview?.update(dt);

    this._menuCameraAngle += dt * 0.06;
    const radius = 135;
    this.camera.position.set(
      Math.cos(this._menuCameraAngle) * radius,
      58,
      Math.sin(this._menuCameraAngle) * radius
    );
    this.camera.lookAt(0, 0, -8);

    this.postProcessing.render();
  }

  _restartRace() {
    this._lastCountdownSound = null;
    this._lastLapShown = 0;
    this.audio.setEngineActive(true);
    this.raceManager.restart();
    this._placeCarsOnGrid();
    this.raceManager.primeCarPositions(this._collectCarsData());
    this.collisions.reset();
    this.itemManager.reset();
    this.pickupManager.reset();
    this.obstacleManager.reset();
    this.itemVisuals.reset();
    this.skidMarks.endTrail();
    this.hud.hideFinish();
    this.hud.resetDriftDisplay();
    this.hud.setItem(null);
    this._finishShown = false;
    this._useItemHeld = false;
  }

  _updateDriftEffects(dt, state) {
    if (state.drifting) {
      this.car.getRearWheelWorldPositions(this._rearLeft, this._rearRight);
      this.skidMarks.addMark('rearLeft', this._rearLeft, state.heading);
      this.skidMarks.addMark('rearRight', this._rearRight, state.heading);

      const intensity = Math.min(1, state.slipDeg / 35);
      this.tireSmoke.spawnAt(this._rearLeft, dt, intensity);
      this.tireSmoke.spawnAt(this._rearRight, dt, intensity);
    } else if (state.driftJustEnded) {
      this.skidMarks.endTrail();
    }

    this.tireSmoke.update(dt);
  }

  _updateHud(dt, state) {
    this.hud.setSpeedKmh(state.speedKmh);
    this.hud.updateDrift(state);
    this.hud.setCountdown(this.raceManager.getCountdownDisplay());
    this.hud.setItem(this.itemManager.getCarItems(PLAYER_ID).item);

    const race = this.raceManager.getCarState(PLAYER_ID);
    const lapShown = Math.min(race.lapsCompleted + 1, this.raceManager.totalLaps);
    this.hud.setLap(lapShown, this.raceManager.totalLaps);
    if (lapShown !== this._lastLapShown) {
      if (lapShown > this._lastLapShown && this._lastLapShown > 0) this.audio.play('lap');
      this._lastLapShown = lapShown;
      this.startFinish.setLap(lapShown, this.raceManager.totalLaps);
    }
    this.hud.setRaceTime(this.raceManager.raceTime);
    this.hud.setBestLap(race.bestLap);

    // Real position among all cars, updated every frame.
    const rankings = this.raceManager.getRankings();
    const playerRank = rankings.findIndex((entry) => entry.id === PLAYER_ID) + 1;
    this.hud.setPosition(playerRank);

    // The overlay appears when the RACE concludes (podium + end window), not
    // when the player personally crosses the line.
    if (this.raceManager.state === 'finished' && !this._finishShown) {
      this._finishShown = true;
      this.audio.play('finish');
      this.audio.setEngineActive(false);

      const results = this.raceManager.results ?? this.raceManager.getResults();
      const mine = results.find((r) => r.id === PLAYER_ID);
      const newRecords = this.records.submitRace({
        trackId: this.trackId,
        laps: this.raceManager.totalLaps,
        difficulty: this._difficultyName ?? 'normal',
        totalTime: race.finishTime,
        bestLap: race.bestLap,
        driftScore: state.totalScore,
        position: mine?.position ?? results.length,
      });
      this.hud.showFinish(race.finishTime, race.bestLap, {
        position: mine?.position,
        dnf: mine?.dnf,
        points: mine?.points,
        newRecords,
      });
      this.hud.updateStandings(this._buildStandings());
      this._standingsTimer = 0;
    }

    // Countdown shown while the last cars come home.
    this.hud.setEndgameTimer(this.raceManager.endgameRemaining);

    // Standings stay live while the overlay is up (AI keep finishing laps).
    if (this._finishShown) {
      this._standingsTimer += dt;
      if (this._standingsTimer >= 0.5) {
        this._standingsTimer = 0;
        this.hud.updateStandings(this._buildStandings());
      }
    }

    const minimapCars = [
      {
        x: state.x,
        z: state.z,
        heading: state.heading,
        color: PLAYER_MINIMAP_COLOR,
        isPlayer: true,
      },
    ];
    for (const aiCar of this.aiCars) {
      minimapCars.push({
        x: aiCar.physics.x,
        z: aiCar.physics.z,
        heading: aiCar.physics.heading,
        color: aiCar.color,
        isPlayer: false,
      });
    }
    this.minimap.update(minimapCars);

    this._fpsTime += dt;
    this._fpsFrames += 1;
    if (this._fpsTime >= 0.25) {
      this._lastFps = Math.round(this._fpsFrames / this._fpsTime);
      this._lastFrameMs = (this._fpsTime / this._fpsFrames) * 1000;
      this.hud.setFps(this._lastFps);
      this._fpsTime = 0;
      this._fpsFrames = 0;

      if (this.hud.debugVisible) {
        const info = this.renderer.info;
        let lights = 0;
        this.scene.traverse((o) => {
          if (o.isLight && o.visible) lights++;
        });
        this.hud.setDebugStats({
          fps: this._lastFps,
          frameMs: this._lastFrameMs,
          calls: info.render.calls,
          triangles: info.render.triangles,
          lights,
          programs: info.programs?.length ?? 0,
          quality: CONFIG.quality.level,
          bloom: this.postProcessing.active,
        });
      }
    }
  }

  _handleResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.postProcessing.setSize(window.innerWidth, window.innerHeight);
  }
}

// Gamepad ids are long vendor strings; keep the readable part for the toast.
function shortPadName(id = '') {
  const cleaned = id.replace(/\(.*?\)/g, '').trim();
  return (cleaned || 'Controller').slice(0, 28);
}

function randRange([min, max]) {
  return min + Math.random() * (max - min);
}
