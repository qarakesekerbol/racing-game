// Top-down minimap on a 2D canvas. The track outline is rasterized once into an
// offscreen layer; per-frame work is just a blit plus one arrow per car.
// update() accepts an array of cars so AI opponents can be drawn later.

const PADDING = 14;
const DPR = 2; // canvas backing scale for crisp lines

export class Minimap {
  constructor(canvas, trackSamples) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.samples = trackSamples;

    this.width = canvas.width / DPR;
    this.height = canvas.height / DPR;
    this.ctx.scale(DPR, DPR);

    this._computeTransform();
    this._trackLayer = this._renderTrackLayer();
  }

  _computeTransform() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of this.samples) {
      if (s.x < minX) minX = s.x;
      if (s.x > maxX) maxX = s.x;
      if (s.z < minZ) minZ = s.z;
      if (s.z > maxZ) maxZ = s.z;
    }
    this._midX = (minX + maxX) / 2;
    this._midZ = (minZ + maxZ) / 2;
    this._scale = Math.min(
      (this.width - PADDING * 2) / (maxX - minX),
      (this.height - PADDING * 2) / (maxZ - minZ)
    );
  }

  // World XZ -> canvas XY. Z is flipped so "up" on the map is +Z in the world.
  _toMap(x, z) {
    return [
      this.width / 2 + (x - this._midX) * this._scale,
      this.height / 2 - (z - this._midZ) * this._scale,
    ];
  }

  _renderTrackLayer() {
    const layer = document.createElement('canvas');
    layer.width = this.canvas.width;
    layer.height = this.canvas.height;
    const ctx = layer.getContext('2d');
    ctx.scale(DPR, DPR);

    ctx.beginPath();
    const [x0, y0] = this._toMap(this.samples[0].x, this.samples[0].z);
    ctx.moveTo(x0, y0);
    for (let i = 1; i < this.samples.length; i++) {
      const [x, y] = this._toMap(this.samples[i].x, this.samples[i].z);
      ctx.lineTo(x, y);
    }
    ctx.closePath();

    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // start/finish tick
    const [sx, sy] = this._toMap(this.samples[0].x, this.samples[0].z);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx - 2.5, sy - 2.5, 5, 5);

    return layer;
  }

  // cars: [{ x, z, heading, color, isPlayer }]
  update(cars) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.drawImage(this._trackLayer, 0, 0, this.width, this.height);

    // AI cars as small dots first, player triangle on top.
    for (const car of cars) {
      if (car.isPlayer) continue;
      const [x, y] = this._toMap(car.x, car.z);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = car.color;
      ctx.fill();
    }

    for (const car of cars) {
      if (!car.isPlayer) continue;
      const [x, y] = this._toMap(car.x, car.z);
      // Screen-space direction of the car's forward vector (sin h, cos h),
      // with Z flipped to match _toMap.
      const angle = Math.atan2(-Math.cos(car.heading), Math.sin(car.heading));
      const size = 6;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.6, size * 0.55);
      ctx.lineTo(-size * 0.6, -size * 0.55);
      ctx.closePath();
      ctx.fillStyle = car.color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }
  }
}
