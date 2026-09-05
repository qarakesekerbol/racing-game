// Race logic: checkpoints, laps, timers, progress ranking. Pure numeric state —
// works on plain {x, z} spline samples so it never touches Three.js, and any car
// entity (player or future AI) participates by id via update()'s carsData array.

// Championship-style points by finishing position; DNF scores nothing.
const POINTS = [15, 12, 10, 8, 6, 4, 2, 1];

export class RaceManager {
  constructor({
    samples,
    totalLaps = 3,
    checkpointCount = 10,
    checkpointRadius = 15, // covers the full half-width of the wide road
    countdownSeconds = 3,
    endgameAfter = 3, // podium places that trigger the end-of-race window
    endgameSeconds = 20,
    playerId = 'player',
  }) {
    this.samples = samples;
    this.totalLaps = totalLaps;
    this.checkpointRadius = checkpointRadius;
    this.countdownSeconds = countdownSeconds;
    this.endgameAfter = endgameAfter;
    this.endgameSeconds = endgameSeconds;
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
    // 'countdown' -> 'running' -> 'endgame' (top 3 home, timer ticking)
    // -> 'finished' (results ready)
    this.state = 'countdown';
    this.raceTime = 0;
    this.finishOrder = [];
    this.endTimer = 0;
    this.results = null;
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
      finishPosition: null,
      dnf: false,
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
    }

    // Once the podium is settled, everyone still out there gets a fixed
    // window to come home before the race is called.
    if (this.state === 'running' && this.finishOrder.length >= this.endgameAfter) {
      this.state = 'endgame';
      this.endTimer = this.endgameSeconds;
    }

    if (this.state === 'endgame') {
      // Everyone home early ends it immediately; no point waiting.
      if (this.finishOrder.length >= this.cars.size) {
        this._concludeRace(carsData);
        return;
      }
      this.endTimer -= dt;
      if (this.endTimer <= 0) {
        this.endTimer = 0;
        this._concludeRace(carsData);
      }
    }
  }

  // Called once when the race is over: anyone still running is classified by
  // how far they got, after every car that actually finished.
  _concludeRace(carsData) {
    const stragglers = [];
    for (const [id, car] of this.cars.entries()) {
      if (car.finished) continue;
      car.dnf = true;
      stragglers.push({ id, progress: car.progress });
    }
    stragglers.sort((a, b) => b.progress - a.progress);

    let position = this.finishOrder.length;
    for (const s of stragglers) {
      position += 1;
      this.cars.get(s.id).finishPosition = position;
    }

    this.state = 'finished';
    this.results = this.getResults();
  }

  // Final classification: finishers in the order they crossed the line, then
  // DNFs by distance covered. Points follow the position table in config.
  getResults() {
    const rows = [];
    for (const [id, car] of this.cars.entries()) {
      rows.push({
        id,
        position: car.finishPosition ?? Infinity,
        finished: car.finished,
        dnf: car.dnf,
        totalTime: car.finishTime,
        bestLap: car.bestLap,
        lapsCompleted: car.lapsCompleted,
        progress: car.progress,
      });
    }
    rows.sort((a, b) => a.position - b.position);
    return rows.map((row, i) => ({
      ...row,
      position: Number.isFinite(row.position) ? row.position : i + 1,
      points: row.dnf ? 0 : (POINTS[i] ?? 0),
    }));
  }

  // Seconds left in the end-of-race window, or null when not counting down.
  get endgameRemaining() {
    return this.state === 'endgame' ? Math.max(0, this.endTimer) : null;
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
      // Finishing order is the source of truth for position, and it is
      // recorded the same way for the player and every AI.
      const id = [...this.cars.entries()].find(([, c]) => c === car)?.[0];
      if (id && !this.finishOrder.includes(id)) {
        this.finishOrder.push(id);
        car.finishPosition = this.finishOrder.length;
      }
    }
  }
}
