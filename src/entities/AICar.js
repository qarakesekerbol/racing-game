import { Car } from './Car.js';

// An opponent car: identical visuals and physics to the player's Car, driven
// by an AIDriver that produces the same input object a keyboard would.

const NEUTRAL_INPUT = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  handbrake: false,
};

export class AICar extends Car {
  constructor({ color, name, driver }) {
    super({ color });
    this.name = name;
    this.driver = driver;
  }

  // context: see AIDriver.getInput; locked = countdown, controls dead
  updateAI(dt, context) {
    const input = context.locked
      ? NEUTRAL_INPUT
      : this.driver.getInput(this.physics, context, dt);
    this.update(dt, input);
  }

  resetToGrid(slot) {
    this.reset(slot.x, slot.z, slot.heading);
    this.driver.reset();
  }
}
