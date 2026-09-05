import { CONFIG } from '../core/config.js';

// DOM-based HUD: speedometer, lap/timer boxes, position badge, drift indicator,
// countdown and finish overlays. The only place where seconds/m/s become display text.

const SPEEDO_CIRCUMFERENCE = 263.9; // 2 * PI * r=42, must match style.css
const SPEEDO_SPAN = 0.75; // 270-degree arc

export class HUD {
  constructor() {
    this.speedElement = document.getElementById('speed-value');
    this.speedoArc = document.getElementById('speedo-arc');
    this.fpsElement = document.getElementById('fps-value');
    this.totalElement = document.getElementById('total-value');
    this.lapElement = document.getElementById('lap-value');
    this.timeElement = document.getElementById('time-value');
    this.bestElement = document.getElementById('best-value');
    this.driftElement = document.getElementById('hud-drift');
    this.driftScoreElement = document.getElementById('drift-score');
    this.driftComboElement = document.getElementById('drift-combo');
    this.bankElement = document.getElementById('drift-bank');
    this.countdownElement = document.getElementById('countdown');
    this.finishOverlay = document.getElementById('finish-overlay');
    this.finishTimeElement = document.getElementById('finish-time');
    this.finishBestElement = document.getElementById('finish-best');

    this.onRestart = null;
    document.getElementById('restart-button').addEventListener('click', () => {
      if (this.onRestart) this.onRestart();
    });

    this._maxKmh = CONFIG.car.maxSpeed * 3.6 * CONFIG.drift.boostMaxSpeedFactor;
    this._bankTimeout = 0;
    this._lastCountdown = null;
    this._lastRank = 0;
  }

  setSpeedKmh(kmh) {
    const abs = Math.abs(kmh);
    this.speedElement.textContent = Math.round(abs);
    const fraction = Math.min(1, abs / this._maxKmh);
    this.speedoArc.style.strokeDashoffset =
      SPEEDO_CIRCUMFERENCE * (1 - SPEEDO_SPAN * fraction);
  }

  setFps(fps) {
    this.fpsElement.textContent = fps;
  }

  setLap(current, total) {
    this.lapElement.textContent = `${current}/${total}`;
  }

  setRaceTime(seconds) {
    this.timeElement.textContent = formatTime(seconds);
  }

  setBestLap(seconds) {
    this.bestElement.textContent = seconds === null ? '--:--.---' : formatTime(seconds);
  }

  setPosition(rank) {
    if (rank === this._lastRank) return;
    this._lastRank = rank;
    document.getElementById('position-value').textContent = rank;
    document.getElementById('position-suffix').textContent = ordinalSuffix(rank);
  }

  // display: '3' | '2' | '1' | 'GO!' | null
  setCountdown(display) {
    if (display === this._lastCountdown) return;
    this._lastCountdown = display;

    const el = this.countdownElement;
    if (display === null) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.textContent = display;
    // Restart the pop animation on every value change.
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  showFinish(totalSeconds, bestLapSeconds) {
    this.finishTimeElement.textContent = formatTime(totalSeconds);
    this.finishBestElement.textContent =
      bestLapSeconds === null ? '--:--.---' : formatTime(bestLapSeconds);
    this.finishOverlay.hidden = false;
  }

  // standings: [{ rank, name, color, isPlayer, finished, finishTime, lap, totalLaps }]
  updateStandings(standings) {
    const container = document.getElementById('finish-standings');
    container.replaceChildren();
    for (const entry of standings) {
      const row = document.createElement('div');
      row.className = entry.isPlayer ? 'standing-row player' : 'standing-row';

      const rank = document.createElement('span');
      rank.className = 'standing-rank';
      rank.textContent = `${entry.rank}.`;

      const name = document.createElement('span');
      name.className = 'standing-name';
      const dot = document.createElement('span');
      dot.className = 'standing-dot';
      dot.style.background = entry.color;
      name.append(dot, entry.name);

      const time = document.createElement('span');
      time.className = 'standing-time';
      time.textContent = entry.finished
        ? formatTime(entry.finishTime)
        : `Lap ${entry.lap}/${entry.totalLaps}`;

      row.append(rank, name, time);
      container.append(row);
    }
  }

  hideFinish() {
    this.finishOverlay.hidden = true;
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

  resetDriftDisplay() {
    this.totalElement.textContent = '0';
    this.driftElement.hidden = true;
    this.bankElement.hidden = true;
  }

  _showBank(points) {
    const el = this.bankElement;
    el.textContent = `+${points}`;
    el.hidden = false;

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

function ordinalSuffix(n) {
  const ones = n % 10;
  const tens = n % 100;
  if (ones === 1 && tens !== 11) return 'st';
  if (ones === 2 && tens !== 12) return 'nd';
  if (ones === 3 && tens !== 13) return 'rd';
  return 'th';
}

function formatTime(seconds) {
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  const millis = Math.floor((total % 1) * 1000);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}
