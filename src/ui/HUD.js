// Minimal DOM-based HUD: speed readout and FPS counter.
// This is the only place where m/s is converted for display.

export class HUD {
  constructor() {
    this.speedElement = document.getElementById('speed-value');
    this.fpsElement = document.getElementById('fps-value');
  }

  setSpeedKmh(kmh) {
    this.speedElement.textContent = Math.round(Math.abs(kmh));
  }

  setFps(fps) {
    this.fpsElement.textContent = fps;
  }
}
