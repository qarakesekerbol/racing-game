// Persistent records in localStorage: best lap, best total time per
// laps/difficulty combo, best drift score, and the top-5 finishes.
// All reads/writes are wrapped — storage can be unavailable (private mode).

const STORAGE_KEY = 'frostrush.records';

export class Records {
  constructor() {
    this.data = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // storage unavailable or corrupted — start fresh
    }
    // tracks: { [trackId]: { bestLap, bestTotal: {lapsxdifficulty}, finishes } }
    return { tracks: {}, bestDrift: null };
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // ignore: records just won't persist
    }
  }

  getAll() {
    return this.data;
  }

  // Called once when the player finishes a race. Returns the list of record
  // names that were beaten, for the "New record!" banner.
  submitRace({ trackId, laps, difficulty, totalTime, bestLap, driftScore, position }) {
    const date = new Date().toISOString();
    const beaten = [];
    const track = this.forTrack(trackId);

    if (bestLap != null && (!track.bestLap || bestLap < track.bestLap.time)) {
      track.bestLap = { time: bestLap, date };
      beaten.push('Best lap');
    }

    const totalKey = `${laps}|${difficulty}`;
    const prevTotal = track.bestTotal[totalKey];
    if (totalTime != null && (!prevTotal || totalTime < prevTotal.time)) {
      track.bestTotal[totalKey] = { time: totalTime, date };
      beaten.push('Best time');
    }

    // Drift score is a driving skill, not a track record — kept global.
    if (driftScore > 0 && (!this.data.bestDrift || driftScore > this.data.bestDrift.score)) {
      this.data.bestDrift = { score: driftScore, date };
      beaten.push('Best drift score');
    }

    track.finishes.push({ position, totalTime, bestLap, laps, difficulty, date });
    track.finishes.sort((a, b) => a.position - b.position || a.totalTime - b.totalTime);
    track.finishes = track.finishes.slice(0, 5);

    this._save();
    return beaten;
  }

  // Per-track record bucket, created on first use.
  forTrack(trackId) {
    if (!this.data.tracks[trackId]) {
      this.data.tracks[trackId] = { bestLap: null, bestTotal: {}, finishes: [] };
    }
    return this.data.tracks[trackId];
  }

  // Best lap on a track, or null — used by the track select cards.
  bestLapFor(trackId) {
    return this.data.tracks[trackId]?.bestLap ?? null;
  }
}
