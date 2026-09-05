// On-screen controls for touch devices.
//
// Steering is a virtual joystick rather than left/right buttons: it produces a
// continuous -1..1 value that maps straight onto the analog steer input, so a
// small thumb movement gives a small correction — buttons could only ever give
// full lock. Everything uses pointer events, so it also works with a mouse for
// testing in DevTools device mode.
//
// Emits the same abstract fields as the keyboard and gamepad sources.

// Fraction of the stick's radius the knob may travel. Derived from the
// rendered size so the joystick can be restyled without touching the JS.
const KNOB_TRAVEL = 0.68;

export class TouchControls {
  constructor({ onFirstTouch } = {}) {
    this.onFirstTouch = onFirstTouch;
    this.visible = false;

    this.state = {
      steer: 0,
      throttle: 0,
      brake: 0,
      drift: false,
      useItem: false,
    };

    this._buildDom();
    this._bind();
  }

  _buildDom() {
    const root = document.createElement('div');
    root.id = 'touch-controls';
    root.hidden = true;
    // Two thumb clusters. Drift sits above the joystick (left thumb) and item
    // above the brake (right thumb), so neither secondary button competes with
    // gas for the same reach.
    root.innerHTML = `
      <div id="touch-left">
        <div id="touch-stick" class="touch-zone">
          <div class="stick-base"></div>
          <div class="stick-knob"></div>
        </div>
      </div>
      <div id="touch-right">
        <button class="touch-btn secondary" data-touch="drift" aria-label="Drift">
          <span class="btn-glyph">⟳</span>
        </button>
        <button class="touch-btn secondary" data-touch="item" aria-label="Use item">
          <span class="btn-glyph">◆</span>
        </button>
        <button class="touch-btn brake" data-touch="brake" aria-label="Brake">
          <span class="btn-glyph">▼</span>
        </button>
        <button class="touch-btn gas" data-touch="gas" aria-label="Accelerate">
          <span class="btn-glyph">▲</span>
        </button>
      </div>
    `;
    document.body.append(root);
    this.root = root;

    this.stick = root.querySelector('#touch-stick');
    this.knob = root.querySelector('.stick-knob');

    // Rotate-your-device prompt: this game reads far better in landscape.
    const rotate = document.createElement('div');
    rotate.id = 'rotate-prompt';
    rotate.hidden = true;
    rotate.innerHTML = `
      <div class="rotate-inner">
        <div class="rotate-icon">▭</div>
        <div class="rotate-title">Rotate your device</div>
        <div class="rotate-text">This race plays best in landscape.</div>
      </div>
    `;
    document.body.append(rotate);
    this.rotatePrompt = rotate;
  }

  _bind() {
    // --- Virtual joystick ---
    let stickPointer = null;
    const stickRect = () => this.stick.getBoundingClientRect();

    const moveKnob = (clientX, clientY) => {
      const rect = stickRect();
      const radius = (rect.width / 2) * KNOB_TRAVEL;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) {
        dx = (dx / dist) * radius;
        dy = (dy / dist) * radius;
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      // Screen right should steer right, which is negative in game space.
      this.state.steer = -(dx / radius);
      this._touched();
    };

    const releaseStick = () => {
      stickPointer = null;
      this.knob.style.transform = 'translate(0px, 0px)';
      this.state.steer = 0;
      this.stick.classList.remove('active');
    };

    this.stick.addEventListener('pointerdown', (e) => {
      stickPointer = e.pointerId;
      // Capture keeps the drag alive outside the circle, but throws if the
      // pointer isn't active — it's an optimisation, never worth crashing on.
      try { this.stick.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      this.stick.classList.add('active');
      moveKnob(e.clientX, e.clientY);
      e.preventDefault();
    });
    this.stick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickPointer) return;
      moveKnob(e.clientX, e.clientY);
      e.preventDefault();
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
      this.stick.addEventListener(type, (e) => {
        if (e.pointerId !== stickPointer) return;
        releaseStick();
      });
    }

    // --- Buttons: held while the pointer is down ---
    for (const button of this.root.querySelectorAll('[data-touch]')) {
      const key = button.dataset.touch;
      const set = (down) => {
        button.classList.toggle('pressed', down);
        if (key === 'gas') this.state.throttle = down ? 1 : 0;
        else if (key === 'brake') this.state.brake = down ? 1 : 0;
        else if (key === 'drift') this.state.drift = down;
        else if (key === 'item') this.state.useItem = down;
        if (down) this._touched();
      };

      button.addEventListener('pointerdown', (e) => {
        try { button.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        set(true);
        e.preventDefault();
      });
      for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
        button.addEventListener(type, () => set(false));
      }
      // Stop the browser turning a long press into a selection/context menu.
      button.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    window.addEventListener('resize', () => this.updateOrientation());
    window.addEventListener('orientationchange', () => this.updateOrientation());
  }

  _touched() {
    this._usedThisFrame = true;
    this.onFirstTouch?.();
  }

  setVisible(visible) {
    this.visible = visible;
    this.root.hidden = !visible;
    // Lets the stylesheet move HUD pieces out of the thumbs' way whenever the
    // controls are up, at any screen size.
    document.body.classList.toggle('touch-active', visible);
    if (!visible) this.rotatePrompt.hidden = true;
    else this.updateOrientation();
  }

  // Portrait is playable but cramped; prompt for landscape while the controls
  // are on screen.
  updateOrientation() {
    if (!this.visible) {
      this.rotatePrompt.hidden = true;
      return;
    }
    const portrait = window.innerHeight > window.innerWidth;
    this.rotatePrompt.hidden = !portrait;
  }

  // Consumed once per frame by InputManager.
  getState() {
    const used = this._usedThisFrame;
    this._usedThisFrame = false;
    return { ...this.state, usedThisFrame: used || this.state.throttle > 0 };
  }
}
