import * as THREE from 'three';
import { CONFIG } from '../core/config.js';

// Renders everything ItemManager tracks: shield bubbles around cars, oil slick
// decals, rocket meshes. It reads ItemManager state each frame and mirrors it
// into the scene — no gameplay logic lives here.

export class ItemVisuals {
  constructor({ scene, particles }) {
    this.scene = scene;
    this.particles = particles;

    this._shieldGeometry = new THREE.SphereGeometry(CONFIG.items.shield.radius, 20, 14);
    this._shieldMaterial = new THREE.MeshBasicMaterial({
      color: 0x6ec7ff,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const slickGeometry = new THREE.CircleGeometry(CONFIG.items.oil.visualRadius, 24);
    slickGeometry.rotateX(-Math.PI / 2);
    this._slickGeometry = slickGeometry;
    this._slickMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0a0c,
      roughness: 0.1,
      metalness: 0.7,
      transparent: true,
      opacity: 0.85,
    });

    this._rocketGeometry = new THREE.ConeGeometry(0.28, 1.1, 10);
    this._rocketGeometry.rotateX(Math.PI / 2); // point along +Z
    this._rocketMaterial = new THREE.MeshStandardMaterial({
      color: 0xff4d4d,
      emissive: 0x882222,
      roughness: 0.4,
    });

    this._shields = new Map(); // carId -> mesh
    this._slicks = new Map(); // slick object -> mesh
    this._rockets = new Map(); // rocket id -> mesh
  }

  // Shield bubbles read as faint in daylight and should glow at night.
  setEmissiveBoost(boost) {
    this._emissiveBoost = boost;
  }

  // cars: [{ id, physics }]
  update(dt, elapsed, itemManager, cars) {
    this._updateShields(elapsed, itemManager, cars);
    this._updateSlicks(itemManager);
    this._updateRockets(dt, itemManager);
    this._updateNitroFlames(dt, itemManager, cars);
  }

  _updateShields(elapsed, itemManager, cars) {
    for (const car of cars) {
      const state = itemManager.getCarItems(car.id);
      const active = state && state.shieldTimer > 0;
      let mesh = this._shields.get(car.id);

      if (active && !mesh) {
        mesh = new THREE.Mesh(this._shieldGeometry, this._shieldMaterial.clone());
        this.scene.add(mesh);
        this._shields.set(car.id, mesh);
      } else if (!active && mesh) {
        this.scene.remove(mesh);
        this._shields.delete(car.id);
        continue;
      }
      if (!mesh) continue;

      mesh.position.set(car.physics.x, 0.9, car.physics.z);
      const pulse = 1 + Math.sin(elapsed * 5) * 0.04;
      mesh.scale.setScalar(pulse);
      // Flash faster as it runs out.
      const remaining = state.shieldTimer;
      const boost = this._emissiveBoost ?? 1;
      mesh.material.opacity =
        (remaining < 2 ? 0.1 + Math.abs(Math.sin(elapsed * 12)) * 0.22 : 0.22) *
        Math.min(2, boost);
    }
  }

  _updateSlicks(itemManager) {
    for (const slick of itemManager.slicks) {
      if (this._slicks.has(slick)) continue;
      const mesh = new THREE.Mesh(this._slickGeometry, this._slickMaterial);
      mesh.position.set(slick.x, 0.05, slick.z);
      this.scene.add(mesh);
      this._slicks.set(slick, mesh);
    }
    // Remove visuals for slicks that expired.
    for (const [slick, mesh] of this._slicks) {
      if (!itemManager.slicks.includes(slick)) {
        this.scene.remove(mesh);
        this._slicks.delete(slick);
      }
    }
  }

  _updateRockets(dt, itemManager) {
    const cfg = CONFIG.items.rocket;

    for (const rocket of itemManager.rockets) {
      let mesh = this._rockets.get(rocket.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this._rocketGeometry, this._rocketMaterial);
        this.scene.add(mesh);
        this._rockets.set(rocket.id, mesh);
      }
      mesh.position.set(rocket.x, 0.8, rocket.z);
      mesh.rotation.y = rocket.heading;

      this.particles.emit(cfg.trailRate, dt, () => ({
        position: { x: rocket.x, y: 0.8, z: rocket.z },
        color: Math.random() < 0.5 ? '#ffb347' : '#ff5722',
        size: 16,
        life: 0.35,
        spread: 0.6,
      }));
    }

    const liveIds = new Set(itemManager.rockets.map((r) => r.id));
    for (const [id, mesh] of this._rockets) {
      if (!liveIds.has(id)) {
        this.scene.remove(mesh);
        this._rockets.delete(id);
      }
    }
  }

  _updateNitroFlames(dt, itemManager, cars) {
    const cfg = CONFIG.items.nitro;
    for (const car of cars) {
      const state = itemManager.getCarItems(car.id);
      if (!state || state.nitroTimer <= 0) continue;

      const p = car.physics;
      // Emit from just behind the rear bumper, pushed backwards.
      const bx = p.x - Math.sin(p.heading) * 2.3;
      const bz = p.z - Math.cos(p.heading) * 2.3;
      this.particles.emit(cfg.flameRate, dt, () => ({
        position: { x: bx, y: 0.45, z: bz },
        color: Math.random() < 0.6 ? '#4fc3ff' : '#b3e5ff',
        size: 20,
        life: 0.3,
        velocity: {
          x: -Math.sin(p.heading) * 6,
          y: 0.4,
          z: -Math.cos(p.heading) * 6,
        },
        spread: 1.1,
      }));
    }
  }

  // Visual reactions to gameplay events from ItemManager / PickupManager.
  handleEvents(events, cars) {
    const cfg = CONFIG.pickups;
    for (const event of events) {
      if (event.type === 'pickup') {
        this.particles.burst(cfg.burstParticles, () => ({
          position: { x: event.position.x, y: CONFIG.pickups.hoverHeight, z: event.position.z },
          color: `hsl(${Math.floor(Math.random() * 360)}, 90%, 65%)`,
          size: 22,
          life: cfg.burstLife,
          spread: cfg.burstSpeed,
          gravity: 6,
        }));
      } else if (event.type === 'rocket-hit' || event.type === 'shield-broken') {
        const car = cars.find((c) => c.id === event.carId);
        const position = event.rocket
          ? { x: event.rocket.x, z: event.rocket.z }
          : car
            ? { x: car.physics.x, z: car.physics.z }
            : null;
        if (!position) continue;
        this.particles.burst(20, () => ({
          position: { x: position.x, y: 0.8, z: position.z },
          color: event.type === 'shield-broken' ? '#6ec7ff' : '#ff7043',
          size: 26,
          life: 0.5,
          spread: 7,
          gravity: 4,
        }));
      } else if (event.type === 'cone-hit') {
        this.particles.burst(6, () => ({
          position: { x: event.position.x, y: 0.4, z: event.position.z },
          color: '#ff8c42',
          size: 14,
          life: 0.35,
          spread: 3,
          gravity: 8,
        }));
      }
    }
  }

  reset() {
    for (const mesh of this._shields.values()) this.scene.remove(mesh);
    for (const mesh of this._slicks.values()) this.scene.remove(mesh);
    for (const mesh of this._rockets.values()) this.scene.remove(mesh);
    this._shields.clear();
    this._slicks.clear();
    this._rockets.clear();
  }
}
