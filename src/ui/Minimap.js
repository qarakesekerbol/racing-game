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
    // Reset first: a rebuild (track switch) reuses the same canvas, and
    // scale() compounds onto whatever transform is already there.
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
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
    ctx.lineCap = 'round';
    // Stylized: soft glow under a chunky road ribbon with a dashed center line.
    ctx.shadowColor = 'rgba(140, 190, 255, 0.55)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(235, 242, 252, 0.35)';
    ctx.lineWidth = 13;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(30, 36, 52, 0.9)';
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // start/finish tick
    const [sx, sy] = this._toMap(this.samples[0].x, this.samples[0].z);
    ctx.fillStyle = '#ffd75e';
    ctx.fillRect(sx - 3, sy - 3, 6, 6);

    return layer;
  }

  // cars: [{ x, z, heading, color, isPlayer }]
  update(cars) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.drawImage(this._trackLayer, 0, 0, this.width, this.height);

    // Every car uses the same heading arrow; the player's is larger and
    // outlined so it still stands out from the pack.
    const drawArrow = (car) => {
      const [x, y] = this._toMap(car.x, car.z);
      // Screen-space direction of the car's forward vector (sin h, cos h),
      // with Z flipped to match _toMap.
      const angle = Math.atan2(-Math.cos(car.heading), Math.sin(car.heading));
      const size = car.isPlayer ? 6.5 : 5;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.62, size * 0.58);
      ctx.lineTo(-size * 0.3, 0);
      ctx.lineTo(-size * 0.62, -size * 0.58);
      ctx.closePath();
      ctx.fillStyle = car.color;
      ctx.fill();
      ctx.strokeStyle = car.isPlayer ? '#ffffff' : 'rgba(0,0,0,0.55)';
      ctx.lineWidth = car.isPlayer ? 1.4 : 0.9;
      ctx.stroke();
      ctx.restore();
    };

    for (const car of cars) if (!car.isPlayer) drawArrow(car);
    for (const car of cars) if (car.isPlayer) drawArrow(car);
  }
}
