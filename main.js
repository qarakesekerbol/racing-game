import { Game } from './src/core/Game.js';
import { CONFIG } from './src/core/config.js';

const canvas = document.getElementById('app');
const game = new Game(canvas);
// Console access for debugging and live tuning: most CONFIG values are read
// every frame, so editing them in the console takes effect immediately.
window.game = game;
window.CONFIG = CONFIG;

// Debug autopilot for visual testing without a keyboard: open /?demo
// Accelerates, then kicks into a handbrake drift and holds the slide.
if (new URLSearchParams(location.search).has('demo')) {
  const realGetState = game.input.getState.bind(game.input);
  let phase = 'accel';
  game.input.getState = () => {
    const state = game.car.physics.getState();
    if (phase === 'accel' && state.speedKmh > 90) phase = 'drift';
    const drifting = phase === 'drift';
    return {
      forward: true,
      backward: false,
      left: drifting,
      right: false,
      handbrake: drifting && state.slipDeg < 20,
      restart: realGetState().restart, // keep R working under autopilot
    };
  };
}

game.start();
