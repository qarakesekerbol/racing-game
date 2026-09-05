import { CONFIG } from '../core/config.js';
import { ITEM_SVG, ITEM_NAMES } from '../entities/ItemIcons.js';

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
    this.onBackToMenu = null;
    document.getElementById('restart-button').addEventListener('click', () => {
      if (this.onRestart) this.onRestart();
    });
    document.getElementById('menu-button').addEventListener('click', () => {
      if (this.onBackToMenu) this.onBackToMenu();
    });

    this.itemPanel = document.getElementById('hud-item');
    this.itemIcon = document.getElementById('item-icon');
    this.itemName = document.getElementById('item-name');
    this._lastItem = undefined;
    this._itemAnimTimeout = 0;

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
    const changed = this._lastRank !== 0;
    this._lastRank = rank;
    document.getElementById('position-value').textContent = rank;
    document.getElementById('position-suffix').textContent = ordinalSuffix(rank);

    if (changed) {
      const badge = document.getElementById('hud-position');
      badge.classList.remove('pos-change');
      void badge.offsetWidth; // restart the pop animation
      badge.classList.add('pos-change');
    }
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

  showFinish(totalSeconds, bestLapSeconds, { position, dnf, points, newRecords = [] } = {}) {
    this.finishTimeElement.textContent = formatTime(totalSeconds);
    this.finishBestElement.textContent =
      bestLapSeconds === null ? '--:--.---' : formatTime(bestLapSeconds);

    const positionElement = document.getElementById('finish-position');
    if (dnf) {
      positionElement.textContent = 'Did not finish';
      positionElement.style.color = '#ff8a7a';
    } else if (position) {
      const pts = points !== undefined ? ` — ${points} pts` : '';
      positionElement.textContent = `You finished ${position}${ordinalSuffix(position)}!${pts}`;
      positionElement.style.color = position === 1 ? '#ffd75e' : '#fff';
    } else {
      positionElement.textContent = '';
    }

    const banner = document.getElementById('record-banner');
    banner.hidden = newRecords.length === 0;
    if (newRecords.length) {
      banner.textContent = `★ New record! ${newRecords.join(' · ')}`;
    }

    if (position === 1 && !dnf) this._spawnConfetti();
    this.finishOverlay.hidden = false;
  }

  _spawnConfetti() {
    const container = document.getElementById('finish-confetti');
    container.replaceChildren();
    const colors = ['#ffd75e', '#e04444', '#3a72d8', '#36b24a', '#e84393', '#f0f0f0'];
    for (let i = 0; i < 90; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDuration = `${2.2 + Math.random() * 2.5}s`;
      piece.style.animationDelay = `${Math.random() * 1.5}s`;
      container.append(piece);
    }
    clearTimeout(this._confettiTimeout);
    this._confettiTimeout = setTimeout(() => container.replaceChildren(), 7000);
  }

  // seconds: number while the end-of-race window runs, null otherwise.
  setEndgameTimer(seconds) {
    const el = document.getElementById('endgame-timer');
    if (seconds === null || seconds === undefined) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    document.getElementById('endgame-seconds').textContent = Math.ceil(seconds);
    el.classList.toggle('urgent', seconds <= 5);
  }

  // Small corner badge showing which device is currently driving.
  setInputMethod(method) {
    const icons = { keyboard: '⌨', gamepad: '🎮', touch: '👆' };
    const el = document.getElementById('input-method-icon');
    if (el) el.textContent = icons[method] ?? icons.keyboard;
    const wrap = document.getElementById('input-method');
    if (wrap) {
      wrap.classList.remove('flash');
      void wrap.offsetWidth;
      wrap.classList.add('flash');
    }
  }

  showToast(text, duration = 2600) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      el.classList.remove('show');
      el.hidden = true;
    }, duration);
  }

  setSpeedLines(active) {
    if (active === this._speedLinesActive) return;
    this._speedLinesActive = active;
    document.getElementById('speed-lines').classList.toggle('active', active);
  }

  setVisible(visible) {
    document.getElementById('hud').style.display = visible ? '' : 'none';
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
      if (entry.dnf) {
        time.textContent = 'DNF';
        time.classList.add('dnf');
      } else if (entry.finished) {
        time.textContent = formatTime(entry.finishTime);
      } else {
        time.textContent = `Lap ${entry.lap}/${entry.totalLaps}`;
      }

      row.append(rank, name, time);

      if (entry.points !== null && entry.points !== undefined) {
        const points = document.createElement('span');
        points.className = 'standing-points';
        points.textContent = `${entry.points}`;
        row.append(points);
      }
      container.append(row);
    }
  }

  hideFinish() {
    this.finishOverlay.hidden = true;
    document.getElementById('finish-confetti').replaceChildren();
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

  toggleDebug() {
    const panel = document.getElementById('debug-panel');
    panel.hidden = !panel.hidden;
    return !panel.hidden;
  }

  get debugVisible() {
    return !document.getElementById('debug-panel').hidden;
  }

  setDebugStats({ fps, frameMs, calls, triangles, lights, programs, quality, bloom }) {
    document.getElementById('dbg-fps').textContent = fps;
    document.getElementById('dbg-frame').textContent = `${frameMs.toFixed(2)} ms`;
    document.getElementById('dbg-calls').textContent = calls;
    document.getElementById('dbg-tris').textContent = triangles.toLocaleString('en-US');
    document.getElementById('dbg-lights').textContent = lights;
    document.getElementById('dbg-programs').textContent = programs;
    document.getElementById('dbg-quality').textContent = quality;
    document.getElementById('dbg-bloom').textContent = bloom ? 'on' : 'off';
  }

  // Flash the new time-of-day mode in the middle of the screen.
  showTimeOfDay(label) {
    const el = document.getElementById('tod-indicator');
    document.getElementById('tod-label').textContent = label;
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth; // restart the fade
    el.style.animation = '';

    clearTimeout(this._todTimeout);
    this._todTimeout = setTimeout(() => {
      el.hidden = true;
    }, 1600);
  }

  // item: 'nitro' | 'shield' | 'oil' | 'rocket' | 'slowdown' | null
  setItem(item) {
    if (item === this._lastItem) return;
    const gained = item !== null && this._lastItem !== item;
    this._lastItem = item;

    const info = ITEM_DISPLAY[item] ?? { icon: '<span style="opacity:.5">—</span>', name: 'No item' };
    this.itemIcon.innerHTML = info.icon;
    this.itemName.textContent = info.name;
    this.itemPanel.classList.toggle('has-item', item !== null);

    if (gained) {
      this.itemPanel.classList.remove('item-received');
      void this.itemPanel.offsetWidth; // restart the animation
      this.itemPanel.classList.add('item-received');
      clearTimeout(this._itemAnimTimeout);
      this._itemAnimTimeout = setTimeout(
        () => this.itemPanel.classList.remove('item-received'),
        600
      );
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

// HUD icons come from ItemIcons so the 2D slot art matches the 3D icon that
// floats inside a pickup sphere.
const ITEM_DISPLAY = Object.fromEntries(
  Object.entries(ITEM_SVG).map(([type, icon]) => [type, { icon, name: ITEM_NAMES[type] }])
);

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
