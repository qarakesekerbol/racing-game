// Tracks raw keyboard state and exposes it as a simple input snapshot.
// No physics or rendering knowledge lives here.

const PREVENT_DEFAULT_CODES = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

export class InputController {
  constructor() {
    this.keys = new Set();

    this._onKeyDown = (event) => {
      this.keys.add(event.code);
      if (PREVENT_DEFAULT_CODES.has(event.code)) event.preventDefault();
    };
    this._onKeyUp = (event) => {
      this.keys.delete(event.code);
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  getState() {
    return {
      forward: this.keys.has('KeyW') || this.keys.has('ArrowUp'),
      backward: this.keys.has('KeyS') || this.keys.has('ArrowDown'),
      left: this.keys.has('KeyA') || this.keys.has('ArrowLeft'),
      right: this.keys.has('KeyD') || this.keys.has('ArrowRight'),
      handbrake: this.keys.has('Space'),
      restart: this.keys.has('KeyR'),
      useItem:
        this.keys.has('ShiftLeft') ||
        this.keys.has('ShiftRight') ||
        this.keys.has('KeyE'),
      cycleTimeOfDay: this.keys.has('KeyN'),
      toggleDebug: this.keys.has('KeyF'),
    };
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}
