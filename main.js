import { Game } from './src/core/Game.js';

const canvas = document.getElementById('app');
const game = new Game(canvas);
window.game = game; // console access for debugging

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
