import * as THREE from 'three';
import { InputController } from './InputController.js';
import { ChaseCamera } from './ChaseCamera.js';
import { RaceManager } from './RaceManager.js';
import { AIDriver } from './AIDriver.js';
import { Collisions } from './Collisions.js';
import { CONFIG } from './config.js';
import { Car } from '../entities/Car.js';
import { AICar } from '../entities/AICar.js';
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

    // Controls are dead until "GO!" and after the finish line.
    const locked = this.raceManager.controlsLocked || this.raceManager.state === 'finished';
    const input = locked ? NEUTRAL_INPUT : rawInput;

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

    const state = this.car.physics.getState();
    this._updateDriftEffects(dt, state);
    this.chaseCamera.update(dt, this.car.mesh, state);

    this.renderer.render(this.scene, this.camera);
    this._updateHud(dt, state);
  }

  _restartRace() {
    this.raceManager.restart();
    this._placeCarsOnGrid();
    this.raceManager.primeCarPositions(this._collectCarsData());
    this.collisions.reset();
    this.skidMarks.endTrail();
    this.hud.hideFinish();
    this.hud.resetDriftDisplay();
    this._finishShown = false;
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
