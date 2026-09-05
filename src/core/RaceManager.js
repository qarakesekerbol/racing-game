// Race logic: checkpoints, laps, timers, progress ranking. Pure numeric state —
// works on plain {x, z} spline samples so it never touches Three.js, and any car
// entity (player or future AI) participates by id via update()'s carsData array.

export class RaceManager {
  constructor({
    samples,
    totalLaps = 3,
    checkpointCount = 10,
    checkpointRadius = 9,
    countdownSeconds = 3,
    playerId = 'player',
  }) {
    this.samples = samples;
    this.totalLaps = totalLaps;
    this.checkpointRadius = checkpointRadius;
    this.countdownSeconds = countdownSeconds;
    this.playerId = playerId;

    // Invisible gates every 1/checkpointCount of the spline; index 0 is start/finish.
    const n = samples.length;
    this.checkpoints = [];
    for (let i = 0; i < checkpointCount; i++) {
      const idx = Math.round((i * n) / checkpointCount) % n;
      this.checkpoints.push({ x: samples[idx].x, z: samples[idx].z });
    }

    this.cars = new Map();
    this.restart();
  }

  registerCar(id) {
    this.cars.set(id, this._freshCarState());
  }

  restart() {
    this.state = 'countdown'; // 'countdown' | 'running' | 'finished'
    this.raceTime = 0;
    this._countdownRemaining = this.countdownSeconds;
    this._goTimer = 0;
    for (const id of this.cars.keys()) {
      this.cars.set(id, this._freshCarState());
    }
  }

  _freshCarState() {
    return {
      nextCheckpoint: 1, // gate 0 (start/finish) only counts after all others
      lapsCompleted: 0,
      lapStartTime: 0,
      currentLapTime: 0,
      lastLap: null,
      bestLap: null,
      finished: false,
      finishTime: null,
      progress: 0, // lapsCompleted + fraction of current lap, for ranking
      _sampleIndex: 0,
    };
  }

  get controlsLocked() {
    return this.state === 'countdown';
  }

  // '3' | '2' | '1' | 'GO!' | null
  getCountdownDisplay() {
    if (this.state === 'countdown') return String(Math.ceil(this._countdownRemaining));
    if (this.state === 'running' && this._goTimer > 0) return 'GO!';
    return null;
  }

  getCarState(id) {
    return this.cars.get(id);
  }

  // carsData: [{ id, x, z }]
  // Keeps updating after the player finishes (state 'finished') so AI cars can
  // complete their own laps and the standings stay live.
  update(dt, carsData) {
    if (this.state === 'countdown') {
      this._countdownRemaining -= dt;
      if (this._countdownRemaining <= 0) {
        this.state = 'running';
        this._goTimer = 0.9;
      }
      return;
    }

    if (this._goTimer > 0) this._goTimer -= dt;

    this.raceTime += dt;

    for (const data of carsData) {
      const car = this.cars.get(data.id);
      if (!car || car.finished) continue;
      this._updateCar(car, data);
      if (data.id === this.playerId && car.finished) {
        this.state = 'finished';
      }
    }
  }

  // Compute progress for all cars without gate logic — used right after grid
  // placement so rankings are correct during the countdown.
  primeCarPositions(carsData) {
    for (const data of carsData) {
      const car = this.cars.get(data.id);
      if (car) this._updateProgress(car, data);
    }
  }

  // Sorted best-to-worst: finished cars by finish time, then racing cars by progress.
  getRankings() {
    const rankings = [];
    for (const [id, car] of this.cars.entries()) {
      rankings.push({
        id,
        progress: car.progress,
        lapsCompleted: car.lapsCompleted,
        finished: car.finished,
        finishTime: car.finishTime,
        bestLap: car.bestLap,
      });
    }
    rankings.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    return rankings;
  }

  _updateProgress(car, data) {
    // Windowed nearest-sample search: cheap per frame, and immune to the car
    // briefly leaving the road (it snaps back to the nearby stretch of spline).
    const n = this.samples.length;
    let bestDist = Infinity;
    let bestIdx = car._sampleIndex;
    for (let off = -20; off <= 20; off++) {
      const idx = (car._sampleIndex + off + n) % n;
      const s = this.samples[idx];
      const d = (s.x - data.x) ** 2 + (s.z - data.z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = idx;
      }
    }
    car._sampleIndex = bestIdx;

    // A car that hasn't taken gate 1 yet but sits near the end of the spline is
    // behind the start line (grid, or backed over the line) — count it as
    // negative progress so it ranks below cars that have crossed.
    let progress = car.lapsCompleted + bestIdx / n;
    if (car.nextCheckpoint === 1 && bestIdx / n > 0.5) progress -= 1;
    car.progress = progress;
    car.currentLapTime = this.raceTime - car.lapStartTime;
  }

  _updateCar(car, data) {
    this._updateProgress(car, data);

    // Gates must be hit strictly in order — skipping one (or driving backwards)
    // means the lap can't complete until the car comes back for it.
    const gate = this.checkpoints[car.nextCheckpoint];
    const gateDist =
      (gate.x - data.x) ** 2 + (gate.z - data.z) ** 2;
    if (gateDist < this.checkpointRadius * this.checkpointRadius) {
      if (car.nextCheckpoint === 0) {
        this._completeLap(car);
        car.nextCheckpoint = 1;
      } else {
        car.nextCheckpoint = (car.nextCheckpoint + 1) % this.checkpoints.length;
      }
    }
  }

  _completeLap(car) {
    const lapTime = this.raceTime - car.lapStartTime;
    car.lastLap = lapTime;
    if (car.bestLap === null || lapTime < car.bestLap) car.bestLap = lapTime;
    car.lapStartTime = this.raceTime;
    car.lapsCompleted += 1;

    if (car.lapsCompleted >= this.totalLaps) {
      car.finished = true;
      car.finishTime = this.raceTime;
    }
  }
}
