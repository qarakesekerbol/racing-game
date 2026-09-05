import * as THREE from 'three';
import { InputController } from './InputController.js';
import { ChaseCamera } from './ChaseCamera.js';
import { Car } from '../entities/Car.js';
import { Track } from '../world/Track.js';
import { Ground } from '../world/Ground.js';
import { Lighting } from '../world/Lighting.js';
import { HUD } from '../ui/HUD.js';

// Owns the renderer, scene graph, and the requestAnimationFrame loop.
// Each tick: read input -> update physics/entities -> update camera -> render -> update HUD.

const SKY_COLOR = 0x8fc7ff;
const MAX_DELTA = 0.1; // clamp dt after tab switches / long stalls

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();

    this._initRenderer();
    this._initScene();
    this._initEntities();

    this.input = new InputController();
    this.hud = new HUD();

    this._fpsTime = 0;
    this._fpsFrames = 0;

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
  }

  start() {
    this._boundTick = () => this._tick();
    requestAnimationFrame(this._boundTick);
  }

  _tick() {
    requestAnimationFrame(this._boundTick);

    const dt = Math.min(this.clock.getDelta(), MAX_DELTA);
    const input = this.input.getState();

    this.car.update(dt, input);
    this.chaseCamera.update(dt, this.car.mesh);

    this.renderer.render(this.scene, this.camera);
    this._updateHud(dt);
  }

  _updateHud(dt) {
    this.hud.setSpeedKmh(this.car.physics.getState().speedKmh);

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
