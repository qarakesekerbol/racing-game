import { Game } from './src/core/Game.js';

const canvas = document.getElementById('app');
const game = new Game(canvas);
game.start();
