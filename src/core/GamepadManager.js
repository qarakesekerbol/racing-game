// Standard Gamepad API support. Polled every frame from the game loop rather
// than driven by events: Chrome never fires button events, and the connect
// event alone doesn't tell you what's being held.
//
// Produces the same abstract fields as every other input source:
//   { steer (-1..1), throttle (0..1), brake (0..1), drift, useItem, ... }

const DEADZONE = 0.18;
const TRIGGER_THRESHOLD = 0.06;

// Standard mapping button indices.
const BTN = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  START: 9,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
};

export class GamepadManager {
  constructor() {
    this.connected = false;
    this.name = '';
    this.onConnect = null;

    this._prev = {}; // edge detection for one-shot buttons
    this._activity = 0; // set when any control moves, for input-method switching

    window.addEventListener('gamepadconnected', (event) => {
      this.connected = true;
      // Fall back to polling for the id: the event always carries one in a
      // real browser, but never assume the shape of an event you didn't make.
      this.name = event.gamepad?.id ?? this._firstPad()?.id ?? 'Controller';
      this.onConnect?.(this.name);
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.connected = navigator.getGamepads?.().some((g) => g);
    });
  }

  _firstPad() {
    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) if (pad && pad.connected) return pad;
    return null;
  }

  // Returns null when no pad is present, otherwise a partial input state.
  // `usedThisFrame` is true only when the player actually moved something,
  // which is what drives "most recently used input method".
  poll() {
    const pad = this._firstPad();
    if (!pad) {
      this.connected = false;
      return null;
    }
    this.connected = true;

    const axis = (i) => {
      const v = pad.axes[i] ?? 0;
      return Math.abs(v) < DEADZONE ? 0 : (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE);
    };
    const pressed = (i) => !!pad.buttons[i]?.pressed;
    // Triggers report analog value on most pads, boolean pressed on others.
    const trigger = (i) => {
      const b = pad.buttons[i];
      if (!b) return 0;
      return b.value > 0 ? b.value : b.pressed ? 1 : 0;
    };

    // Steering: left stick, falling back to the D-pad.
    let steer = -axis(0); // stick right should steer right (negative in-game)
    if (steer === 0) {
      if (pressed(BTN.DPAD_LEFT)) steer = 1;
      else if (pressed(BTN.DPAD_RIGHT)) steer = -1;
    }

    // Throttle: right trigger, or A. Brake: left trigger, or X.
    const throttle = Math.max(trigger(BTN.RT), pressed(BTN.A) ? 1 : 0, pressed(BTN.DPAD_UP) ? 1 : 0);
    const brake = Math.max(trigger(BTN.LT), pressed(BTN.X) ? 1 : 0, pressed(BTN.DPAD_DOWN) ? 1 : 0);

    const state = {
      steer,
      throttle,
      brake,
      drift: pressed(BTN.RB),
      useItem: pressed(BTN.LB) || pressed(BTN.Y),
      pause: this._edge('start', pressed(BTN.START)),
      restart: pressed(BTN.B),
    };

    state.usedThisFrame =
      Math.abs(steer) > 0.02 ||
      throttle > TRIGGER_THRESHOLD ||
      brake > TRIGGER_THRESHOLD ||
      state.drift ||
      state.useItem ||
      state.pause ||
      state.restart;

    return state;
  }

  // True only on the frame a button goes down, so a held button doesn't repeat.
  _edge(key, down) {
    const was = this._prev[key] ?? false;
    this._prev[key] = down;
    return down && !was;
  }
}
