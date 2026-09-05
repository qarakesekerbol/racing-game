import * as THREE from 'three';
import { InputController } from './InputController.js';
import { ChaseCamera } from './ChaseCamera.js';
import { RaceManager } from './RaceManager.js';
import { Car } from '../entities/Car.js';
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

    this._trackSamples = this.track.getSampledPositions(TRACK_SAMPLE_COUNT);
    this.raceManager = new RaceManager({ samples: this._trackSamples, playerId: PLAYER_ID });
    this.raceManager.registerCar(PLAYER_ID);

    this.minimap = new Minimap(document.getElementById('minimap'), this._trackSamples);

    this._fpsTime = 0;
    this._fpsFrames = 0;
    this._finishShown = false;
    this._restartHeld = false;

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
  }

  _initEntities() {
    this.car = new Car();
    this.scene.add(this.car.mesh);

    const start = this.track.getStartTransform();
    this.car.reset(start.x, start.z, start.heading);

    this.chaseCamera = new ChaseCamera(this.camera);

    this.skidMarks = new SkidMarks();
    this.skidMarks.addTo(this.scene);

    this.tireSmoke = new TireSmoke();
    this.tireSmoke.addTo(this.scene);

    this._rearLeft = new THREE.Vector3();
    this._rearRight = new THREE.Vector3();
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
    const state = this.car.physics.getState();

    this.raceManager.update(dt, [{ id: PLAYER_ID, x: state.x, z: state.z }]);

    this._updateDriftEffects(dt, state);
    this.chaseCamera.update(dt, this.car.mesh, state);

    this.renderer.render(this.scene, this.camera);
    this._updateHud(dt, state);
  }

  _restartRace() {
    this.raceManager.restart();
    const start = this.track.getStartTransform();
    this.car.reset(start.x, start.z, start.heading);
    this.skidMarks.endTrail();
    this.hud.hideFinish();
    this.hud.resetDriftDisplay();
    this._finishShown = false;
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

    if (race.finished && !this._finishShown) {
      this._finishShown = true;
      this.hud.showFinish(race.finishTime, race.bestLap);
    }

    this.minimap.update([
      {
        x: state.x,
        z: state.z,
        heading: state.heading,
        color: PLAYER_MINIMAP_COLOR,
        isPlayer: true,
      },
    ]);

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
