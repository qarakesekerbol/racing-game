// Minimal DOM-based HUD: speed, FPS, total points, and the drift indicator.
// This is the only place where m/s is converted for display.

export class HUD {
  constructor() {
    this.speedElement = document.getElementById('speed-value');
    this.fpsElement = document.getElementById('fps-value');
    this.totalElement = document.getElementById('total-value');
    this.driftElement = document.getElementById('hud-drift');
    this.driftScoreElement = document.getElementById('drift-score');
    this.driftComboElement = document.getElementById('drift-combo');
    this.bankElement = document.getElementById('drift-bank');

    this._bankTimeout = 0;
  }

  setSpeedKmh(kmh) {
    this.speedElement.textContent = Math.round(Math.abs(kmh));
  }

  setFps(fps) {
    this.fpsElement.textContent = fps;
  }

  updateDrift(state) {
    this.driftElement.hidden = !state.drifting;

    if (state.drifting) {
      this.driftScoreElement.textContent = Math.round(state.driftScore);
      const showCombo = state.combo > 1;
      this.driftComboElement.hidden = !showCombo;
      if (showCombo) this.driftComboElement.textContent = `x${state.combo}`;
    }

    if (state.driftJustEnded && state.lastDriftBank > 0) {
      this._showBank(state.lastDriftBank);
      this.totalElement.textContent = state.totalScore;
    }
  }

  _showBank(points) {
    const el = this.bankElement;
    el.textContent = `+${points}`;
    el.hidden = false;

    // Restart the CSS animation even if one is already playing.
    el.classList.remove('bank-anim');
    void el.offsetWidth;
    el.classList.add('bank-anim');

    clearTimeout(this._bankTimeout);
    this._bankTimeout = setTimeout(() => {
      el.hidden = true;
      el.classList.remove('bank-anim');
    }, 1400);
  }
}
