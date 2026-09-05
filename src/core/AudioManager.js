// All audio generated with the Web Audio API — no external files.
// Nothing runs until unlock() is called from a user gesture (autoplay rules).
//
// Buses: master -> destination; music and sfx hang off master; the continuous
// engine/screech voices hang off sfx. Every knob the settings screen exposes
// maps to one GainNode here.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI note -> Hz

// A minor pentatonic-ish chiptune loop, 16 sixteenth steps per bar.
const BASS_STEPS = [45, null, 45, null, 48, null, 45, null, 43, null, 43, null, 40, null, 43, null];
const ARP_STEPS = [69, 72, 76, 72, 69, 72, 76, 79, 67, 71, 74, 71, 64, 67, 71, 74];

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this._volumes = { master: 0.8, music: 0.5, sfx: 0.8 };
    this._engineActive = false;
    this._musicFast = false;
  }

  unlock() {
    if (this.unlocked) {
      this.ctx?.resume();
      return;
    }
    this.unlocked = true;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;

    this.masterGain = ctx.createGain();
    this.masterGain.connect(ctx.destination);
    this.musicGain = ctx.createGain();
    this.musicGain.connect(this.masterGain);
    this.sfxGain = ctx.createGain();
    this.sfxGain.connect(this.masterGain);
    this.setVolumes(this._volumes);

    this._noiseBuffer = this._makeNoiseBuffer();
    this._buildEngineVoices();
    this._buildScreech();
    this._startMusic();
  }

  setVolumes({ master, music, sfx }) {
    this._volumes = { master, music, sfx };
    if (!this.ctx) return;
    this.masterGain.gain.value = master;
    this.musicGain.gain.value = music * 0.5; // music sits under the sfx
    this.sfxGain.gain.value = sfx;
  }

  _makeNoiseBuffer() {
    const length = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  _distortionCurve(amount) {
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = Math.tanh(x * amount);
    }
    return curve;
  }

  // --- Engine: one player voice + a small pool for the nearest AI karts ---

  _makeEngineVoice(baseGainConnect) {
    const ctx = this.ctx;
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    const shaper = ctx.createWaveShaper();
    shaper.curve = this._distortionCurve(6);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.Q.value = 1.5;
    const gain = ctx.createGain();
    gain.gain.value = 0;

    osc1.connect(shaper);
    osc2.connect(shaper);
    shaper.connect(filter);
    filter.connect(gain);
    gain.connect(baseGainConnect);
    osc1.start();
    osc2.start();
    return { osc1, osc2, gain, filter };
  }

  _buildEngineVoices() {
    this._playerEngine = this._makeEngineVoice(this.sfxGain);
    this._aiEngines = [
      this._makeEngineVoice(this.sfxGain),
      this._makeEngineVoice(this.sfxGain),
      this._makeEngineVoice(this.sfxGain),
    ];
  }

  setEngineActive(active) {
    this._engineActive = active;
    if (!this.ctx || active) return;
    const t = this.ctx.currentTime;
    this._playerEngine.gain.gain.setTargetAtTime(0, t, 0.1);
    for (const v of this._aiEngines) v.gain.gain.setTargetAtTime(0, t, 0.1);
    this._screechGain?.gain.setTargetAtTime(0, t, 0.05);
  }

  // speedRatio 0..1, throttle 0/1; aiList: [{ distance, speedRatio }] nearest-first
  updateEngine(speedRatio, throttle, aiList = []) {
    if (!this.ctx || !this._engineActive) return;
    const t = this.ctx.currentTime;

    const voice = this._playerEngine;
    const rpm = 0.25 + speedRatio * 0.75;
    const freq = 42 + rpm * 130 + Math.sin(t * 30) * 2; // slight wobble
    voice.osc1.frequency.setTargetAtTime(freq, t, 0.05);
    voice.osc2.frequency.setTargetAtTime(freq * 1.5 + 3, t, 0.05);
    voice.filter.frequency.setTargetAtTime(400 + rpm * 1300, t, 0.08);
    voice.gain.gain.setTargetAtTime(0.05 + rpm * 0.06 + (throttle ? 0.025 : 0), t, 0.08);

    for (let i = 0; i < this._aiEngines.length; i++) {
      const v = this._aiEngines[i];
      const ai = aiList[i];
      if (!ai) {
        v.gain.gain.setTargetAtTime(0, t, 0.1);
        continue;
      }
      const aiRpm = 0.25 + ai.speedRatio * 0.75;
      // Slightly different base pitch so the pack doesn't phase into one drone.
      v.osc1.frequency.setTargetAtTime(50 + aiRpm * 120 + i * 7, t, 0.06);
      v.osc2.frequency.setTargetAtTime((50 + aiRpm * 120 + i * 7) * 1.5, t, 0.06);
      const attenuation = Math.min(1, 9 / Math.max(3, ai.distance));
      v.gain.gain.setTargetAtTime(0.035 * attenuation, t, 0.1);
    }
  }

  // --- Tire screech: looped noise through a bandpass ---

  _buildScreech() {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this._noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1050;
    filter.Q.value = 2.5;
    this._screechGain = ctx.createGain();
    this._screechGain.gain.value = 0;
    source.connect(filter);
    filter.connect(this._screechGain);
    this._screechGain.connect(this.sfxGain);
    source.start();
  }

  updateDrift(drifting, slipDeg) {
    if (!this.ctx || !this._engineActive) return;
    const t = this.ctx.currentTime;
    const target = drifting ? Math.min(0.16, (slipDeg / 55) * 0.2) : 0;
    this._screechGain.gain.setTargetAtTime(target, t, drifting ? 0.06 : 0.15);
  }

  // --- One-shot SFX ---

  _tone({ freq, freqEnd, dur = 0.15, type = 'sine', gain = 0.2, delay = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise({ dur = 0.3, type = 'lowpass', freq = 800, freqEnd, q = 1, gain = 0.25, delay = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const source = this.ctx.createBufferSource();
    source.buffer = this._noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t);
    if (freqEnd) filter.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    source.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    source.start(t);
    source.stop(t + dur + 0.02);
  }

  play(name, intensity = 1) {
    if (!this.ctx) return;
    switch (name) {
      case 'click':
        this._tone({ freq: 700, dur: 0.06, type: 'square', gain: 0.12 });
        break;
      case 'pickup':
        this._tone({ freq: 880, dur: 0.09, type: 'triangle', gain: 0.2 });
        this._tone({ freq: 1320, dur: 0.14, type: 'triangle', gain: 0.2, delay: 0.07 });
        break;
      case 'nitro':
        this._noise({ dur: 0.7, type: 'bandpass', freq: 300, freqEnd: 2400, q: 1.2, gain: 0.3 });
        break;
      case 'rocket':
        this._noise({ dur: 0.5, type: 'lowpass', freq: 2500, freqEnd: 300, gain: 0.3 });
        this._tone({ freq: 200, freqEnd: 60, dur: 0.5, type: 'sawtooth', gain: 0.15 });
        break;
      case 'boostPad':
        // Rising whoosh plus a bright ping.
        this._noise({ dur: 0.45, type: 'bandpass', freq: 500, freqEnd: 3200, q: 1.4, gain: 0.26 });
        this._tone({ freq: NOTE(76), dur: 0.16, type: 'triangle', gain: 0.16 });
        this._tone({ freq: NOTE(83), dur: 0.22, type: 'triangle', gain: 0.14, delay: 0.08 });
        break;
      case 'land':
        this._noise({ dur: 0.28, type: 'lowpass', freq: 900, freqEnd: 180, gain: 0.3 });
        this._tone({ freq: 110, freqEnd: 55, dur: 0.2, type: 'sine', gain: 0.26 });
        break;
      case 'jump':
        this._tone({ freq: 320, freqEnd: 780, dur: 0.28, type: 'square', gain: 0.16 });
        break;
      case 'shieldPop':
        this._tone({ freq: 600, freqEnd: 180, dur: 0.22, type: 'sine', gain: 0.28 });
        break;
      case 'shieldOn':
        this._tone({ freq: 300, freqEnd: 700, dur: 0.25, type: 'sine', gain: 0.2 });
        break;
      case 'collision':
        this._noise({ dur: 0.14, type: 'lowpass', freq: 320, gain: 0.3 * intensity });
        this._tone({ freq: 85, freqEnd: 45, dur: 0.16, type: 'sine', gain: 0.3 * intensity });
        break;
      case 'spinout':
        this._noise({ dur: 0.5, type: 'bandpass', freq: 1300, freqEnd: 500, q: 3, gain: 0.2 });
        break;
      case 'beep':
        this._tone({ freq: 440, dur: 0.18, type: 'square', gain: 0.16 });
        break;
      case 'go':
        this._tone({ freq: 880, dur: 0.5, type: 'square', gain: 0.2 });
        break;
      case 'lap':
        for (const [i, n] of [72, 76, 79].entries()) {
          this._tone({ freq: NOTE(n), dur: 0.12, type: 'square', gain: 0.14, delay: i * 0.09 });
        }
        break;
      case 'finish':
        for (const [i, n] of [72, 76, 79, 84, 84].entries()) {
          this._tone({ freq: NOTE(n), dur: i >= 3 ? 0.4 : 0.15, type: 'square', gain: 0.16, delay: i * 0.14 });
        }
        break;
      default:
        break;
    }
  }

  // --- Music: chiptune loop, scheduled ahead in small chunks ---

  _startMusic() {
    this._musicStep = 0;
    this._nextNoteTime = this.ctx.currentTime + 0.2;
    this._musicTimer = setInterval(() => this._scheduleMusic(), 90);
  }

  setMusicFast(fast) {
    this._musicFast = fast;
  }

  _scheduleMusic() {
    if (!this.ctx) return;
    const bpm = this._musicFast ? 126 : 112;
    const stepDur = 60 / bpm / 4;
    while (this._nextNoteTime < this.ctx.currentTime + 0.25) {
      this._playMusicStep(this._musicStep % 16, this._nextNoteTime, stepDur);
      this._musicStep++;
      this._nextNoteTime += stepDur;
    }
  }

  _playMusicStep(step, when, stepDur) {
    const bass = BASS_STEPS[step];
    if (bass != null) {
      this._musicTone(NOTE(bass), when, stepDur * 1.8, 'square', 0.1);
    }
    const arp = ARP_STEPS[step];
    if (arp != null) {
      this._musicTone(NOTE(arp), when, stepDur * 0.9, 'triangle', 0.09);
    }
    if (step % 4 === 0) {
      // kick: fast sine drop
      const osc = this.ctx.createOscillator();
      osc.frequency.setValueAtTime(120, when);
      osc.frequency.exponentialRampToValueAtTime(45, when + 0.1);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.22, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.12);
      osc.connect(g);
      g.connect(this.musicGain);
      osc.start(when);
      osc.stop(when + 0.14);
    } else if (step % 4 === 2) {
      // hat: short highpassed noise
      const source = this.ctx.createBufferSource();
      source.buffer = this._noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 6000;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.05, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
      source.connect(filter);
      filter.connect(g);
      g.connect(this.musicGain);
      source.start(when);
      source.stop(when + 0.06);
    }
  }

  _musicTone(freq, when, dur, type, gain) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }
}
