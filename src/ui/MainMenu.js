import { CONFIG } from '../core/config.js';
import { TRACKS } from '../world/tracks/index.js';

// All menu screens (main / setup / settings / records / pause) as one DOM
// overlay. Owns the persisted settings; gameplay decisions flow out through
// the callbacks the Game provides.

const SETTINGS_KEY = 'frostrush.settings';

const DEFAULT_SETTINGS = {
  masterVolume: 0.8,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  quality: 'medium',
  bloom: true,
  minimap: true,
  touchControls: false, // force on for desktop testing
};

const KEY_BINDINGS = [
  ['W / ↑', 'Accelerate'],
  ['S / ↓', 'Brake / Reverse'],
  ['A D / ← →', 'Steer'],
  ['Space', 'Handbrake (drift)'],
  ['Shift / E', 'Use item'],
  ['N', 'Time of day'],
  ['R', 'Restart race'],
  ['Esc', 'Pause'],
  ['F', 'Debug panel'],
  ['Stick / D-pad', 'Steer (gamepad)'],
  ['RT / A', 'Accelerate (gamepad)'],
  ['LT / X', 'Brake (gamepad)'],
  ['RB', 'Drift (gamepad)'],
  ['LB / Y', 'Use item (gamepad)'],
];

export class MainMenu {
  // callbacks: { onPlay(setup), onResume, onRestart, onQuitToMenu,
  //              onSettingsChange(settings), onPreviewColor(color),
  //              getRecords(), onAnyClick() }
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.settings = this._loadSettings();
    this.setup = {
      trackId: TRACKS[0].id,
      color: CONFIG.playerColors[0],
      kartStyle: CONFIG.kartStyles[0].id,
      laps: 3,
      timeOfDay: 'day',
      difficulty: 'normal',
    };
    this._settingsReturnTo = 'main';
    this._tierFilter = TRACKS[0].tier;

    this.root = document.getElementById('menu-overlay');
    this._buildScreens();
    this.show('main');
  }

  _loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      // fall through to defaults
    }
    return { ...DEFAULT_SETTINGS };
  }

  _saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // storage unavailable — settings just won't persist
    }
  }

  get isOpen() {
    return !this.root.hidden;
  }

  show(screen) {
    this.root.hidden = false;
    this.current = screen;
    for (const el of this.root.querySelectorAll('.menu-screen')) {
      el.hidden = el.dataset.screen !== screen;
    }
    if (screen === 'records') this._renderRecords();
    if (screen === 'settings') this._syncSettingsInputs();
    if (screen === 'tracks') this._renderTrackCards();
    if (screen === 'setup') {
      this._updateKartStyleName();
      this.callbacks.onPreviewStyle?.(this.setup.kartStyle);
    }
    // The rotating kart preview only renders while the setup screen is up.
    this.callbacks.onPreviewActive?.(screen === 'setup');
  }

  hide() {
    this.root.hidden = true;
    this.callbacks.onPreviewActive?.(false);
  }

  _updateKartStyleName() {
    const style = CONFIG.kartStyles.find((k) => k.id === this.setup.kartStyle);
    const el = document.getElementById('kart-style-name');
    if (el && style) el.textContent = style.blurb;
  }

  _buildScreens() {
    const colors = CONFIG.playerColors;
    this.root.innerHTML = `
      <div class="menu-screen" data-screen="main">
        <h1 class="menu-title">${CONFIG.game.title}</h1>
        <div class="menu-subtitle">${CONFIG.game.subtitle}</div>
        <div class="menu-buttons">
          <button class="menu-btn primary" data-go="tracks">Play</button>
          <button class="menu-btn" data-go="settings" data-from="main">Settings</button>
          <button class="menu-btn" data-go="records">Records</button>
        </div>
      </div>

      <div class="menu-screen wide" data-screen="tracks" hidden>
        <h2 class="menu-heading">Select track</h2>
        <div class="tier-tabs">
          ${Object.entries(CONFIG.tiers)
            .map(
              ([id, t], i) =>
                `<button class="tier-tab${i === 0 ? ' selected' : ''}" data-tier="${id}"
                   style="--tier-color:${t.color}">
                   <span class="tier-stars">${'\u2605'.repeat(t.stars)}${'\u2606'.repeat(3 - t.stars)}</span>
                   <span class="tier-name">${t.label}</span>
                 </button>`
            )
            .join('')}
        </div>
        <div class="track-cards">
          ${TRACKS.map(
            (t, i) => `
            <button class="track-card theme-${t.theme} tier-${t.tier}${i === 0 ? ' selected' : ''}"
              data-track="${t.id}" data-card-tier="${t.tier}"
              style="--tier-color:${CONFIG.tiers[t.tier].color}">
              <span class="card-tier-badge">${CONFIG.tiers[t.tier].label} ${'\u2605'.repeat(CONFIG.tiers[t.tier].stars)}</span>
              <canvas class="track-thumb" width="260" height="160" data-thumb="${t.id}"></canvas>
              <div class="track-name">${t.name}</div>
              <div class="track-desc">${t.description}</div>
              <div class="track-meta">
                <span class="diff-badge" data-diff="${t.difficulty}"></span>
                <span class="track-best" data-best="${t.id}">--:--.---</span>
              </div>
            </button>`
          ).join('')}
        </div>
        <div class="menu-buttons row">
          <button class="menu-btn" data-go="main">Back</button>
          <button class="menu-btn primary" data-go="setup">Continue</button>
        </div>
      </div>

      <div class="menu-screen" data-screen="setup" hidden>
        <h2 class="menu-heading">Race setup</h2>
        <div class="kart-preview-wrap">
          <canvas id="kart-preview" width="420" height="200"></canvas>
          <div id="kart-style-name"></div>
        </div>
        <div class="setup-row"><span class="setup-label">Kart style</span>
          <div class="segmented" data-setup="kartStyle">
            ${CONFIG.kartStyles
              .map(
                (k, i) =>
                  `<button data-value="${k.id}"${i === 0 ? ' class="selected"' : ''}>${k.name}</button>`
              )
              .join('')}
          </div>
        </div>
        <div class="setup-row"><span class="setup-label">Kart color</span>
          <div class="swatches">${colors
            .map(
              (c, i) =>
                `<button class="swatch${i === 0 ? ' selected' : ''}" data-color="${c}" style="background:${c}"></button>`
            )
            .join('')}</div>
        </div>
        <div class="setup-row"><span class="setup-label">Laps</span>
          <div class="segmented" data-setup="laps">
            <button data-value="1">1</button><button data-value="3" class="selected">3</button><button data-value="5">5</button>
          </div>
        </div>
        <div class="setup-row"><span class="setup-label">Time of day</span>
          <div class="segmented" data-setup="timeOfDay">
            <button data-value="day" class="selected">Day</button><button data-value="sunset">Sunset</button><button data-value="night">Night</button><button data-value="auto">Auto</button>
          </div>
        </div>
        <div class="setup-row"><span class="setup-label">Difficulty</span>
          <div class="segmented" data-setup="difficulty">
            <button data-value="easy">Easy</button><button data-value="normal" class="selected">Normal</button><button data-value="hard">Hard</button>
          </div>
        </div>
        <div class="menu-buttons row">
          <button class="menu-btn" data-go="tracks">Back</button>
          <button class="menu-btn primary" data-action="race">Race!</button>
        </div>
      </div>

      <div class="menu-screen" data-screen="settings" hidden>
        <h2 class="menu-heading">Settings</h2>
        <div class="setup-row"><span class="setup-label">Master volume</span>
          <input type="range" min="0" max="1" step="0.05" data-setting="masterVolume" /></div>
        <div class="setup-row"><span class="setup-label">Music</span>
          <input type="range" min="0" max="1" step="0.05" data-setting="musicVolume" /></div>
        <div class="setup-row"><span class="setup-label">SFX</span>
          <input type="range" min="0" max="1" step="0.05" data-setting="sfxVolume" /></div>
        <div class="setup-row"><span class="setup-label">Quality</span>
          <div class="segmented" data-setting-seg="quality">
            <button data-value="low">Low</button><button data-value="medium">Medium</button><button data-value="high">High</button>
          </div>
        </div>
        <div class="setup-row"><span class="setup-label">Bloom</span>
          <label class="toggle"><input type="checkbox" data-setting="bloom" /><span></span></label></div>
        <div class="setup-row"><span class="setup-label">Minimap</span>
          <label class="toggle"><input type="checkbox" data-setting="minimap" /><span></span></label></div>
        <div class="setup-row"><span class="setup-label">Touch controls</span>
          <label class="toggle"><input type="checkbox" data-setting="touchControls" /><span></span></label></div>
        <details class="keys-details"><summary>Key bindings</summary>
          <div class="keys-list">${KEY_BINDINGS.map(
            ([k, d]) => `<div class="keys-row"><span class="keys-key">${k}</span><span>${d}</span></div>`
          ).join('')}</div>
        </details>
        <div class="menu-buttons row">
          <button class="menu-btn" data-action="settings-back">Back</button>
        </div>
      </div>

      <div class="menu-screen" data-screen="records" hidden>
        <h2 class="menu-heading">Records</h2>
        <div id="records-content"></div>
        <div class="menu-buttons row">
          <button class="menu-btn" data-go="main">Back</button>
        </div>
      </div>

      <div class="menu-screen" data-screen="pause" hidden>
        <h2 class="menu-heading">Paused</h2>
        <div class="menu-buttons">
          <button class="menu-btn primary" data-action="resume">Resume</button>
          <button class="menu-btn" data-action="restart">Restart</button>
          <button class="menu-btn" data-go="settings" data-from="pause">Settings</button>
          <button class="menu-btn" data-action="quit">Quit to menu</button>
        </div>
      </div>
    `;

    this.root.addEventListener('click', (event) => this._onClick(event));
    this.root.addEventListener('input', (event) => this._onInput(event));
  }

  _onClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    this.callbacks.onAnyClick?.();

    if (button.dataset.go) {
      if (button.dataset.go === 'settings') {
        this._settingsReturnTo = button.dataset.from ?? 'main';
      }
      this.show(button.dataset.go);
      return;
    }

    if (button.dataset.tier) {
      this._tierFilter = button.dataset.tier;
      this._applyTierFilter();
      return;
    }

    if (button.dataset.track) {
      for (const c of this.root.querySelectorAll('.track-card')) c.classList.remove('selected');
      button.classList.add('selected');
      this.setup.trackId = button.dataset.track;
      this._tierFilter = button.dataset.cardTier;
      this._syncTierTabs();
      this.callbacks.onPreviewTrack?.(button.dataset.track);
      return;
    }

    if (button.dataset.color) {
      for (const s of this.root.querySelectorAll('.swatch')) s.classList.remove('selected');
      button.classList.add('selected');
      this.setup.color = button.dataset.color;
      this.callbacks.onPreviewColor?.(button.dataset.color);
      return;
    }

    const segmented = button.closest('.segmented');
    if (segmented?.dataset.setup) {
      for (const b of segmented.querySelectorAll('button')) b.classList.remove('selected');
      button.classList.add('selected');
      const value = button.dataset.value;
      const key = segmented.dataset.setup;
      this.setup[key] = key === 'laps' ? Number(value) : value;
      if (key === 'kartStyle') {
        this.callbacks.onPreviewStyle?.(value);
        this._updateKartStyleName();
      }
      return;
    }
    if (segmented?.dataset.settingSeg) {
      for (const b of segmented.querySelectorAll('button')) b.classList.remove('selected');
      button.classList.add('selected');
      this.settings[segmented.dataset.settingSeg] = button.dataset.value;
      this._saveSettings();
      this.callbacks.onSettingsChange(this.settings);
      return;
    }

    switch (button.dataset.action) {
      case 'race':
        this.hide();
        this.callbacks.onPlay({ ...this.setup });
        break;
      case 'resume':
        this.hide();
        this.callbacks.onResume();
        break;
      case 'restart':
        this.hide();
        this.callbacks.onRestart();
        break;
      case 'quit':
        this.callbacks.onQuitToMenu();
        this.show('main');
        break;
      case 'settings-back':
        this.show(this._settingsReturnTo);
        break;
    }
  }

  _onInput(event) {
    const input = event.target;
    if (!input.dataset.setting) return;
    this.settings[input.dataset.setting] =
      input.type === 'checkbox' ? input.checked : Number(input.value);
    this._saveSettings();
    this.callbacks.onSettingsChange(this.settings);
  }

  _syncSettingsInputs() {
    for (const input of this.root.querySelectorAll('[data-setting]')) {
      const value = this.settings[input.dataset.setting];
      if (input.type === 'checkbox') input.checked = value;
      else input.value = value;
    }
    for (const seg of this.root.querySelectorAll('[data-setting-seg]')) {
      const value = this.settings[seg.dataset.settingSeg];
      for (const b of seg.querySelectorAll('button')) {
        b.classList.toggle('selected', b.dataset.value === value);
      }
    }
  }

  // Shows only the tracks in the active tier, and makes sure the selected
  // track is one of them (picking the tier's first track otherwise).
  _applyTierFilter() {
    this._syncTierTabs();
    let firstVisible = null;
    for (const card of this.root.querySelectorAll('.track-card')) {
      const match = card.dataset.cardTier === this._tierFilter;
      card.hidden = !match;
      if (match && !firstVisible) firstVisible = card;
    }

    const selected = this.root.querySelector('.track-card.selected');
    if ((!selected || selected.hidden) && firstVisible) {
      for (const c of this.root.querySelectorAll('.track-card')) c.classList.remove('selected');
      firstVisible.classList.add('selected');
      this.setup.trackId = firstVisible.dataset.track;
      this.callbacks.onPreviewTrack?.(this.setup.trackId);
    }
  }

  _syncTierTabs() {
    for (const tab of this.root.querySelectorAll('.tier-tab')) {
      tab.classList.toggle('selected', tab.dataset.tier === this._tierFilter);
    }
  }

  // Draws each track's spline into its card canvas and fills in the best lap.
  _renderTrackCards() {
    this._applyTierFilter();
    for (const track of TRACKS) {
      // Redrawn every time the screen opens rather than cached with a flag:
      // browsers may discard a 2D canvas backing store under memory pressure
      // (several canvases plus two WebGL contexts here), and a one-shot guard
      // would leave those cards permanently blank. Three small splines is
      // well under a millisecond.
      const canvas = this.root.querySelector(`[data-thumb="${track.id}"]`);
      if (canvas) drawTrackThumb(canvas, track);
      const best = this.callbacks.getTrackBest?.(track.id);
      const bestEl = this.root.querySelector(`[data-best="${track.id}"]`);
      if (bestEl) {
        bestEl.textContent = best ? `Best ${formatTime(best.time)}` : 'No time yet';
      }
    }
    for (const badge of this.root.querySelectorAll('.diff-badge')) {
      if (badge.dataset.built) continue;
      const n = Number(badge.dataset.diff);
      badge.replaceChildren();
      for (let i = 0; i < 3; i++) {
        const bar = document.createElement('span');
        bar.className = i < n ? 'diff-bar on' : 'diff-bar';
        badge.append(bar);
      }
      const label = document.createElement('span');
      label.className = 'diff-label';
      label.textContent = ['Easy', 'Medium', 'Hard'][n - 1] ?? '';
      badge.append(label);
      badge.dataset.built = '1';
    }
  }

  _renderRecords() {
    const data = this.callbacks.getRecords();
    const container = document.getElementById('records-content');

    let html = '';
    html += `<div class="record-row"><span>Best drift score</span><span>${
      data.bestDrift
        ? `${data.bestDrift.score} <em>${formatDate(data.bestDrift.date)}</em>`
        : '\u2014'
    }</span></div>`;

    let any = false;
    for (const track of TRACKS) {
      const rec = data.tracks?.[track.id];
      if (!rec || (!rec.bestLap && !rec.finishes.length)) continue;
      any = true;
      html += `<div class="record-section">${track.name}</div>`;
      html += `<div class="record-row"><span>Best lap</span><span>${
        rec.bestLap
          ? `${formatTime(rec.bestLap.time)} <em>${formatDate(rec.bestLap.date)}</em>`
          : '\u2014'
      }</span></div>`;
      for (const [key, entry] of Object.entries(rec.bestTotal ?? {})) {
        const [laps, diff] = key.split('|');
        html += `<div class="record-row"><span>${laps} laps \u00b7 ${diff}</span><span>${formatTime(
          entry.time
        )} <em>${formatDate(entry.date)}</em></span></div>`;
      }
      for (const f of rec.finishes.slice(0, 3)) {
        html += `<div class="record-row"><span>P${f.position} finish</span><span>${formatTime(
          f.totalTime
        )} <em>${formatDate(f.date)}</em></span></div>`;
      }
    }

    if (!any && !data.bestDrift) {
      html += '<div class="record-empty">No races finished yet \u2014 go set some times!</div>';
    }
    container.innerHTML = html;
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString();
}

// Track thumbnail: the spline drawn to fit the card, with a start marker.
// Uses the same closed Catmull-Rom the 3D track does, so the shape matches.
function drawTrackThumb(canvas, track) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const pts = track.controlPoints;

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const pad = 18;
  const scale = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxZ - minZ));
  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;
  const toXY = ([x, z]) => [w / 2 + (x - midX) * scale, h / 2 - (z - midZ) * scale];

  // Themed background wash so an empty card never reads as a blank box.
  const desert = track.theme === 'desert';
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  if (desert) {
    bg.addColorStop(0, '#5a3a24');
    bg.addColorStop(1, '#2a1a12');
  } else {
    bg.addColorStop(0, '#1d3b5c');
    bg.addColorStop(1, '#0f1b2c');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.beginPath();
  const n = pts.length;
  const [sx, sy] = toXY(pts[0]);
  ctx.moveTo(sx, sy);
  for (let i = 0; i < n; i++) {
    const p0 = toXY(pts[(i - 1 + n) % n]);
    const p1 = toXY(pts[i]);
    const p2 = toXY(pts[(i + 1) % n]);
    const p3 = toXY(pts[(i + 2) % n]);
    for (let k = 1; k <= 12; k++) {
      const t = k / 12;
      const t2 = t * t;
      const t3 = t2 * t;
      const cx = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t +
        (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
        (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const cy = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      ctx.lineTo(cx, cy);
    }
  }
  ctx.closePath();

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = desert ? 'rgba(255, 186, 105, 0.9)' : 'rgba(150, 200, 255, 0.85)';
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.strokeStyle = desert ? 'rgba(52, 32, 20, 0.95)' : 'rgba(24, 28, 40, 0.95)';
  ctx.lineWidth = 6.5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 5]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#ffd75e';
  ctx.fillRect(sx - 3.5, sy - 3.5, 7, 7);
}
