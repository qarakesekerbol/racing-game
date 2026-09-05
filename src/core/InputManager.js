import { InputController } from './InputController.js';
import { GamepadManager } from './GamepadManager.js';
import { TouchControls } from '../ui/TouchControls.js';

// Merges keyboard, gamepad and touch into one abstract input state so nothing
// downstream (CarPhysics especially) knows or cares which device is driving:
//
//   { steer: -1..1, throttle: 0..1, brake: 0..1, drift, useItem,
//     restart, pause, cycleTimeOfDay, toggleDebug,
//     forward, backward, left, right, handbrake }   <- legacy booleans
//
// The legacy booleans are derived from the analog values so existing callers
// (and the AI, which produces booleans) keep working unchanged.
//
// Whichever device was used most recently becomes the active method; touch
// controls show themselves on a touch and hide on a key press.

const NEUTRAL = {
  steer: 0,
  throttle: 0,
  brake: 0,
  drift: false,
  useItem: false,
  restart: false,
  pause: false,
  cycleTimeOfDay: false,
  toggleDebug: false,
};

export class InputManager {
  constructor({ onMethodChange, onGamepadConnected } = {}) {
    this.keyboard = new InputController();
    this.gamepad = new GamepadManager();
    this.touch = new TouchControls();

    this.method = 'keyboard';
    this.onMethodChange = onMethodChange;
    this.gamepad.onConnect = (name) => onGamepadConnected?.(name);

    // Touch capability is a hint, not a rule — the setting can force it on for
    // desktop testing, and a real key press hides it again.
    this.touchCapable =
      'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
    this.forceTouch = false;
    this._applyTouchVisibility(this.touchCapable);
  }

  setForceTouch(force) {
    this.forceTouch = force;
    this._applyTouchVisibility(force || this.touchCapable);
  }

  _applyTouchVisibility(visible) {
    this.touch.setVisible(visible);
  }

  _setMethod(method) {
    if (method === this.method) return;
    this.method = method;
    // Touch controls get out of the way for a physical input, and come back
    // the moment the screen is touched again.
    if (method === 'touch') this._applyTouchVisibility(true);
    else if (!this.forceTouch) this._applyTouchVisibility(false);
    this.onMethodChange?.(method);
  }

  // Called once per frame from the game loop.
  getState() {
    const keys = this.keyboard.getState();
    const pad = this.gamepad.poll();
    const touch = this.touch.getState();

    const keyboardUsed =
      keys.forward || keys.backward || keys.left || keys.right ||
      keys.handbrake || keys.useItem || keys.restart || keys.pause ||
      keys.cycleTimeOfDay || keys.toggleDebug;

    // Most recent wins, checked in priority order for the frame.
    if (keyboardUsed) this._setMethod('keyboard');
    else if (pad?.usedThisFrame) this._setMethod('gamepad');
    else if (touch.usedThisFrame) this._setMethod('touch');

    const merged = { ...NEUTRAL };

    // Keyboard is digital: full deflection.
    if (keys.left) merged.steer += 1;
    if (keys.right) merged.steer -= 1;
    if (keys.forward) merged.throttle = 1;
    if (keys.backward) merged.brake = 1;
    merged.drift = keys.handbrake;
    merged.useItem = keys.useItem;
    merged.restart = keys.restart;
    merged.pause = keys.pause;
    merged.cycleTimeOfDay = keys.cycleTimeOfDay;
    merged.toggleDebug = keys.toggleDebug;

    // Touch and gamepad contribute analog values; the strongest wins so two
    // devices held at once never cancel each other out.
    for (const source of [touch, pad]) {
      if (!source) continue;
      if (Math.abs(source.steer ?? 0) > Math.abs(merged.steer)) merged.steer = source.steer;
      merged.throttle = Math.max(merged.throttle, source.throttle ?? 0);
      merged.brake = Math.max(merged.brake, source.brake ?? 0);
      merged.drift = merged.drift || !!source.drift;
      merged.useItem = merged.useItem || !!source.useItem;
      merged.restart = merged.restart || !!source.restart;
      merged.pause = merged.pause || !!source.pause;
    }

    merged.steer = Math.max(-1, Math.min(1, merged.steer));

    // Legacy boolean view, so CarPhysics/AI callers are unaffected.
    merged.forward = merged.throttle > 0.05;
    merged.backward = merged.brake > 0.15;
    merged.left = merged.steer > 0.15;
    merged.right = merged.steer < -0.15;
    merged.handbrake = merged.drift;

    return merged;
  }
}
