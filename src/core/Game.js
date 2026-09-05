import * as THREE from 'three';
import { InputController } from './InputController.js';
import { ChaseCamera } from './ChaseCamera.js';
import { RaceManager } from './RaceManager.js';
import { AIDriver } from './AIDriver.js';
import { Collisions } from './Collisions.js';
import { ItemManager } from './ItemManager.js';
import { PickupManager } from './PickupManager.js';
import { ObstacleManager } from './ObstacleManager.js';
import { CONFIG } from './config.js';
import { Car } from '../entities/Car.js';
import { AICar } from '../entities/AICar.js';
import { ParticleField } from '../entities/ParticleField.js';
import { ItemVisuals } from '../entities/ItemVisuals.js';
import { SkidMarks } from '../entities/SkidMarks.js';
import { TireSmoke } from '../entities/TireSmoke.js';
import { Track } from '../world/Track.js';
import { Ground } from '../world/Ground.js';
import { Lighting } from '../world/Lighting.js';
import { HUD } from '../ui/HUD.js';
import { Minimap } from '../ui/Minimap.js';

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

    this.input = new InputController();
    this.hud = new HUD();
    this.hud.onRestart = () => this._restartRace();

    this.raceManager = new RaceManager({ samples: this._trackSamples, playerId: PLAYER_ID });
    this.raceManager.registerCar(PLAYER_ID);
    for (const aiCar of this.aiCars) this.raceManager.registerCar(aiCar.id);

    this.collisions = new Collisions({ samples: this._trackSamples });

    this.itemManager = new ItemManager({ samples: this._trackSamples });
    this.itemManager.registerCar(PLAYER_ID);
    for (const aiCar of this.aiCars) this.itemManager.registerCar(aiCar.id);

    this.pickupManager = new PickupManager({
      track: this.track,
      itemManager: this.itemManager,
    });
    this.pickupManager.addTo(this.scene);

    this.obstacleManager = new ObstacleManager({
      track: this.track,
      samples: this._trackSamples,
    });
    this.obstacleManager.addTo(this.scene);

    this.particles = new ParticleField();
    this.particles.addTo(this.scene);
    this.itemVisuals = new ItemVisuals({ scene: this.scene, particles: this.particles });

    this._elapsed = 0;
    this._useItemHeld = false;

    this.minimap = new Minimap(document.getElementById('minimap'), this._trackSamples);

    this._placeCarsOnGrid();
    this.raceManager.primeCarPositions(this._collectCarsData());

    this._fpsTime = 0;
    this._fpsFrames = 0;
    this._finishShown = false;
    this._restartHeld = false;
    this._standingsTimer = 0;

    this._onResize = () => this._handleResize();
    window.addEventListener('resize', this._onResize);
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY_COLOR);
    this.scene.fog = new THREE.Fog(SKY_COLOR, 150, 450);

    this.camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    this.lighting = new Lighting();
    this.lighting.addTo(this.scene);

    this.ground = new Ground();
    this.ground.addTo(this.scene);

    this.track = new Track();
    this.track.addTo(this.scene);

    // One shared sample array for race logic, AI drivers, collisions, minimap.
    this._trackSamples = this.track.getSampledPositions(TRACK_SAMPLE_COUNT);
  }

  _initEntities() {
    this.car = new Car();
    this.scene.add(this.car.mesh);

    this.aiCars = [];
    for (let i = 0; i < CONFIG.ai.count; i++) {
      const { hex, name } = CONFIG.ai.colors[i % CONFIG.ai.colors.length];
      const driver = new AIDriver({
        samples: this._trackSamples,
        params: {
          maxSpeed: CONFIG.car.maxSpeed * randRange(CONFIG.ai.maxSpeedFactor),
          aggression: randRange(CONFIG.ai.aggression),
          lateralOffset: (Math.random() * 2 - 1) * CONFIG.ai.lateralOffsetRange,
        },
      });
      const aiCar = new AICar({ color: hex, name, driver });
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

    // Edge-detect R so holding the key doesn't restart every frame.
    if (rawInput.restart && !this._restartHeld) this._restartRace();
    this._restartHeld = rawInput.restart;

    this._elapsed += dt;

    // Controls are dead until "GO!" and after the finish line.
    const locked = this.raceManager.controlsLocked || this.raceManager.state === 'finished';
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

    // Collisions mutate physics positions/velocities, so meshes re-sync after.
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

    const playerItems = this.itemManager.getCarItems(PLAYER_ID);
    const nitroFov = playerItems.nitroTimer > 0 ? CONFIG.items.nitro.fovBoost : 0;
    this.chaseCamera.update(dt, this.car.mesh, state, nitroFov);

    this.renderer.render(this.scene, this.camera);
    this._updateHud(dt, state);
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

  _restartRace() {
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
    const rankings = this.raceManager.getRankings();
    const nameById = new Map([[PLAYER_ID, { name: 'You', color: this.car.color }]]);
    for (const aiCar of this.aiCars) {
      nameById.set(aiCar.id, { name: aiCar.name, color: aiCar.color });
    }
    return rankings.map((entry, i) => ({
      rank: i + 1,
      name: nameById.get(entry.id).name,
      color: nameById.get(entry.id).color,
      isPlayer: entry.id === PLAYER_ID,
      finished: entry.finished,
      finishTime: entry.finishTime,
      lap: Math.min(entry.lapsCompleted + 1, this.raceManager.totalLaps),
      totalLaps: this.raceManager.totalLaps,
    }));
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
    this.hud.setLap(
      Math.min(race.lapsCompleted + 1, this.raceManager.totalLaps),
      this.raceManager.totalLaps
    );
    this.hud.setRaceTime(this.raceManager.raceTime);
    this.hud.setBestLap(race.bestLap);

    // Real position among all cars, updated every frame.
    const rankings = this.raceManager.getRankings();
    const playerRank = rankings.findIndex((entry) => entry.id === PLAYER_ID) + 1;
    this.hud.setPosition(playerRank);

    if (race.finished && !this._finishShown) {
      this._finishShown = true;
      this.hud.showFinish(race.finishTime, race.bestLap);
      this.hud.updateStandings(this._buildStandings());
      this._standingsTimer = 0;
    }

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
      this.hud.setFps(Math.round(this._fpsFrames / this._fpsTime));
      this._fpsTime = 0;
      this._fpsFrames = 0;
    }
  }

  _handleResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

function randRange([min, max]) {
  return min + Math.random() * (max - min);
}
