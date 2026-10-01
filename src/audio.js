// Procedural audio: every sound effect and all music are synthesized at
// runtime with the Web Audio API — no sound files. The AudioContext can only
// start after a user gesture, so SOUND.unlock() is called on the first
// click/keypress (see main.js).

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.last = new Map(); // throttle timestamps per sound name
    this.music = new MusicPlayer(this);
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.connect(c.destination);
      this.sfxBus = c.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = c.createGain();
      // Glue the mix together (and stop the low end clipping).
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      comp.attack.value = 0.005;
      comp.release.value = 0.15;
      this.musicBus.connect(comp).connect(this.master);
      // Pads go through their own bus so kicks can duck them (side-chain).
      this.padBus = c.createGain();
      this.padBus.connect(this.musicBus);
      // Soft-clip drive for gritty basses and stabs.
      this.drive = c.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 3.2) * 0.8; }
      this.drive.curve = curve;
      this.drive.connect(this.musicBus);
      this.musicDuck = 1;
      // A simple echo for music plucks and some effects.
      this.delay = c.createDelay(1);
      this.delay.delayTime.value = 0.28;
      const fb = c.createGain();
      fb.gain.value = 0.32;
      const wet = c.createGain();
      wet.gain.value = 0.35;
      this.delay.connect(fb).connect(this.delay);
      this.delay.connect(wet).connect(this.musicBus);
      // Shared white-noise buffer for hats, snares, explosions, whooshes.
      const len = c.sampleRate;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  get ready() { return this.ctx && this.ctx.state === "running"; }

  applyVolumes() {
    if (!this.ctx) return;
    const s = SAVE.settings;
    this.master.gain.value = s.master;
    this.sfxBus.gain.value = s.sfx * 0.6;
    this.musicBus.gain.value = s.music * 0.5 * this.musicDuck;
  }

  // Quieter music behind menus/pauses.
  duck(on) {
    this.musicDuck = on ? 0.4 : 1;
    this.applyVolumes();
  }

  // Rate-limit noisy sounds (an SMG fires 16x a second).
  can(name, gap) {
    const now = performance.now();
    if (now - (this.last.get(name) || 0) < gap * 1000) return false;
    this.last.set(name, now);
    return true;
  }

  // ---- Synth primitives ---------------------------------------------------

  tone({ type = "square", f, f2, dur = 0.1, vol = 0.3, attack = 0.002, when = 0, out, filter, detune = 0 }) {
    const c = this.ctx;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o.connect(g);
    if (filter) {
      const bq = c.createBiquadFilter();
      bq.type = filter.type || "lowpass";
      bq.frequency.value = filter.f;
      node = node.connect(bq);
    }
    node.connect(out || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.1, vol = 0.3, type = "bandpass", f = 1000, f2, q = 1, when = 0, out, attack = 0.002 }) {
    const c = this.ctx;
    const t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const bq = c.createBiquadFilter();
    bq.type = type;
    bq.Q.value = q;
    bq.frequency.setValueAtTime(f, t);
    if (f2) bq.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bq).connect(g).connect(out || this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ---- Sound effects ------------------------------------------------------

  play(name, arg) {
    if (!this.ready) return;
    const T = (o) => this.tone(o), N = (o) => this.noise(o);
    switch (name) {
      case "shoot": this.shoot(arg); break;
      case "hit":
        if (this.can("hit", 0.03)) N({ dur: 0.03, vol: 0.12, f: 3500, q: 2 });
        break;
      case "kill":
        if (!this.can("kill", 0.035)) break;
        T({ type: "square", f: 320, f2: 90, dur: 0.12, vol: 0.12, filter: { f: 1800 } });
        N({ dur: 0.08, vol: 0.1, f: 900, q: 1 });
        break;
      case "explode":
        if (!this.can("explode", 0.06)) break;
        N({ dur: 0.45, vol: 0.45, type: "lowpass", f: 900, f2: 80, q: 0.7 });
        T({ type: "sine", f: 90, f2: 30, dur: 0.35, vol: 0.4 });
        break;
      case "zap":
        if (!this.can("zap", 0.05)) break;
        N({ dur: 0.07, vol: 0.18, type: "highpass", f: 3000 });
        N({ dur: 0.05, vol: 0.14, type: "highpass", f: 4500, when: 0.04 });
        break;
      case "hurt":
        T({ type: "sawtooth", f: 180, f2: 55, dur: 0.22, vol: 0.28, filter: { f: 900 } });
        N({ dur: 0.12, vol: 0.18, f: 500, q: 0.8 });
        break;
      case "jump": T({ type: "square", f: 280, f2: 620, dur: 0.1, vol: 0.09, filter: { f: 2200 } }); break;
      case "land": T({ type: "sine", f: 130, f2: 60, dur: 0.09, vol: 0.2 }); break;
      case "roll": N({ dur: 0.18, vol: 0.16, f: 400, f2: 1600, q: 1.5 }); break;
      case "gem":
        if (!this.can("gem", 0.035)) break;
        T({ type: "triangle", f: 1300 + Math.min(arg || 0, 12) * 70, dur: 0.07, vol: 0.1 });
        break;
      case "loot": {
        const base = 72 + (arg || 0) * 3;
        T({ type: "triangle", f: midiToFreq(base), dur: 0.18, vol: 0.16 });
        T({ type: "triangle", f: midiToFreq(base + 7), dur: 0.24, vol: 0.14, when: 0.07 });
        if (arg >= 3) T({ type: "triangle", f: midiToFreq(base + 12), dur: 0.35, vol: 0.14, when: 0.14 });
        break;
      }
      case "levelup":
        [0, 4, 7, 12, 16].forEach((n, i) => T({ type: "square", f: midiToFreq(72 + n), dur: 0.14, vol: 0.1, when: i * 0.06, filter: { f: 3000 } }));
        break;
      case "salvage": T({ type: "square", f: 520, f2: 240, dur: 0.09, vol: 0.08, filter: { f: 1500 } }); break;
      case "potion":
        [0, 0.07, 0.14].forEach((w, i) => T({ type: "sine", f: 420 + i * 180, f2: 900 + i * 200, dur: 0.08, vol: 0.14, when: w }));
        break;
      case "denied": T({ type: "square", f: 190, dur: 0.12, vol: 0.1, filter: { f: 800 } }); break;
      case "reaction": {
        if (!this.can("reaction", 0.08)) break;
        const root = { SHATTER: 79, BLAZE: 67, CONDUCT: 76, SUPERCONDUCT: 81, ECLIPSE: 72, PLAGUE: 64, DOOM: 60 }[arg] || 72;
        [0, 4, 7].forEach((n) => T({ type: "sine", f: midiToFreq(root + n), dur: 0.3, vol: 0.09 }));
        N({ dur: 0.12, vol: 0.12, type: "highpass", f: 2500 });
        break;
      }
      case "boss":
        T({ type: "sawtooth", f: 55, dur: 1.4, vol: 0.3, attack: 0.3, filter: { f: 400 } });
        T({ type: "sawtooth", f: 82.4, dur: 1.4, vol: 0.2, attack: 0.3, filter: { f: 400 }, detune: 8 });
        N({ dur: 1.2, vol: 0.12, type: "lowpass", f: 300, attack: 0.4 });
        break;
      case "slam":
        T({ type: "sine", f: 70, f2: 25, dur: 0.6, vol: 0.55 });
        N({ dur: 0.5, vol: 0.4, type: "lowpass", f: 600, f2: 60 });
        break;
      case "stage":
        N({ dur: 2.2, vol: 0.2, type: "bandpass", f: 200, f2: 2400, attack: 1.2, q: 0.7 });
        T({ type: "sawtooth", f: 110, dur: 2.4, vol: 0.12, attack: 1.0, filter: { f: 700 } });
        break;
      case "ui": T({ type: "triangle", f: 660, dur: 0.05, vol: 0.12 }); break;
    }
  }

  // Each weapon class gets its own voice.
  shoot(cls) {
    if (!this.can("shoot-" + cls, cls === "smg" ? 0.045 : 0.03)) return;
    const T = (o) => this.tone(o), N = (o) => this.noise(o);
    switch (cls) {
      case "pistol":   T({ type: "square", f: 900, f2: 300, dur: 0.07, vol: 0.09, filter: { f: 2500 } }); N({ dur: 0.04, vol: 0.06, f: 2000 }); break;
      case "ar":       T({ type: "square", f: 650, f2: 220, dur: 0.05, vol: 0.08, filter: { f: 2000 } }); N({ dur: 0.05, vol: 0.08, f: 1500 }); break;
      case "smg":      T({ type: "square", f: 1100, f2: 500, dur: 0.03, vol: 0.06, filter: { f: 3000 } }); break;
      case "shotgun":  N({ dur: 0.16, vol: 0.22, type: "lowpass", f: 1800, f2: 300 }); T({ type: "sine", f: 140, f2: 60, dur: 0.12, vol: 0.18 }); break;
      case "sniper":   T({ type: "sawtooth", f: 1500, f2: 150, dur: 0.22, vol: 0.12, filter: { f: 3500 } }); N({ dur: 0.1, vol: 0.12, f: 2500 }); break;
      case "melee":    N({ dur: 0.14, vol: 0.18, f: 500, f2: 2600, q: 2 }); break;
      case "throwing": T({ type: "triangle", f: 900, f2: 1600, dur: 0.09, vol: 0.09 }); break;
      case "launcher": N({ dur: 0.3, vol: 0.2, type: "lowpass", f: 500, f2: 120 }); T({ type: "sine", f: 90, f2: 50, dur: 0.2, vol: 0.2 }); break;
    }
  }
}

// ---------------------------------------------------------------------------
// Music: a drum & bass sequencer. 170-176 BPM breakbeats with ghost notes and
// swung hats, rolling reese / sub / wobble bass, side-chained 7th-chord pads,
// plucky arps and a seeded lead melody. Tracks run in 8-bar phrases with a
// snare-roll fill at the end of each, and every fourth phrase is a breakdown
// that builds (riser + snare roll) into a drop. A stage starts on a build.
// The scheduler queues ~0.15s ahead so timing stays tight through hitches.
// ---------------------------------------------------------------------------

const SCALES = {
  minor:    [0, 2, 3, 5, 7, 8, 10],
  dorian:   [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
};

// chords: scale-degree roots, each held for 2 bars of the 8-bar phrase.
const MUSIC_TRACKS = {
  menu:   { bpm: 170, root: 50, scale: "dorian",   chords: [0, 5, 2, 6], drums: "halftime", bass: "sub",    arp: "pluck",  pad: 0.045, lead: 0,     seed: 11 },
  sunset: { bpm: 172, root: 50, scale: "minor",    chords: [0, 5, 2, 6], drums: "twostep",  bass: "sub",    arp: "pluck",  pad: 0.038, lead: 0.03,  seed: 23 },
  night:  { bpm: 174, root: 45, scale: "dorian",   chords: [0, 3, 5, 4], drums: "rolling",  bass: "reese",  arp: "sparse", pad: 0.034, lead: 0.028, seed: 37 },
  cave:   { bpm: 172, root: 43, scale: "phrygian", chords: [0, 1, 0, 6], drums: "neuro",    bass: "reese",  arp: "drips",  pad: 0.03,  lead: 0,     seed: 41 },
  hell:   { bpm: 176, root: 40, scale: "harmonic", chords: [0, 1, 5, 4], drums: "jumpup",   bass: "wobble", arp: "stabs",  pad: 0.024, lead: 0.032, seed: 59 },
};

const PHRASE_STEPS = 128; // 8 bars of 16ths

class MusicPlayer {
  constructor(engine) {
    this.e = engine;
    this.track = null;
    this.step = 0;
    this.phrase = 0;
    this.nextTime = 0;
    this.timer = null;
    this.intensity = 0; // 1 while a boss is alive: busier drums, lead always on
  }

  play(name) {
    if (this.trackName === name) return;
    this.trackName = name;
    this.track = MUSIC_TRACKS[name] || null;
    this.step = 0;
    this.phrase = 0; // phrase 0 is a build, so every stage opens on a drop
    this.nextTime = 0;
    if (this.track) this.melody = this.makeMelody(this.track);
    this.start();
  }

  // Begin scheduling (no-op until the AudioContext exists).
  start() {
    const c = this.e.ctx;
    if (!c) return;
    if (this.track) this.e.delay.delayTime.setValueAtTime(3 * 60 / this.track.bpm / 4, c.currentTime); // dotted 8th
    this.nextTime = Math.max(this.nextTime, c.currentTime + 0.1);
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 40);
  }

  stop() {
    this.trackName = null;
    this.track = null;
  }

  // Avoid a burst of catch-up notes after the tab was in the background.
  resync() {
    const c = this.e.ctx;
    if (c && this.nextTime < c.currentTime) this.nextTime = c.currentTime + 0.05;
  }

  schedule() {
    const c = this.e.ctx;
    if (!c || !this.track || c.state !== "running") return;
    this.resync();
    const stepDur = 60 / this.track.bpm / 4; // 16th notes
    while (this.nextTime < c.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime - c.currentTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
      if (this.step >= PHRASE_STEPS) { this.step = 0; this.phrase++; }
    }
  }

  // Scale degree (can exceed the scale length) -> MIDI note.
  note(deg, octave = 0) {
    const s = SCALES[this.track.scale];
    const o = Math.floor(deg / s.length);
    const i = ((deg % s.length) + s.length) % s.length;
    return this.track.root + s[i] + 12 * (o + octave);
  }

  // A 2-bar hook per track, seeded so each stage keeps its own tune:
  // [step, degree offset from the chord, length in steps].
  makeMelody(tr) {
    const r = mulberry32(tr.seed);
    const rhythm = [0, 3, 6, 10, 12, 14, 16, 19, 22, 24, 28];
    const out = [];
    let deg = 4;
    for (const st of rhythm) {
      if (r() < 0.22 && st !== 0 && st !== 16) continue; // a few rests
      deg = clamp(deg + Math.floor(r() * 5) - 2, 0, 9);
      const len = st === 12 || st === 28 ? 4 : 2 + Math.floor(r() * 2);
      out.push([st, deg, len]);
    }
    return out;
  }

  // Multi-oscillator voice with a filter envelope — reese, pads, wobbles.
  voice({ when, f, dur, vol, oscs = [["sawtooth", 0]], attack = 0.005, release = 0.05, cut = 1200, cut2, cutCurve, q = 1, out, drive }) {
    const c = this.e.ctx;
    const t = c.currentTime + when;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const bq = c.createBiquadFilter();
    bq.type = "lowpass";
    bq.Q.value = q;
    bq.frequency.setValueAtTime(cut, t);
    if (cutCurve) {
      // [[time fraction, frequency], ...] — e.g. a wobble or a slow sweep
      for (const [fr, hz] of cutCurve) bq.frequency.linearRampToValueAtTime(hz, t + dur * fr);
    } else if (cut2) {
      bq.frequency.exponentialRampToValueAtTime(cut2, t + dur);
    }
    bq.connect(g);
    g.connect(drive ? this.e.drive : out || this.e.musicBus);
    for (const [type, detune, mul = 1] of oscs) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f * mul;
      o.detune.value = detune;
      o.connect(bq);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  // Duck the pads on each kick: the "pumping" side-chain of liquid DnB.
  pump(when) {
    const c = this.e.ctx;
    const t = c.currentTime + when;
    const g = this.e.padBus.gain;
    g.setValueAtTime(0.3, t);
    g.linearRampToValueAtTime(1, t + 0.22);
  }

  playStep(step, when, sd) {
    const tr = this.track;
    const e = this.e;
    const out = e.musicBus;
    const bar = Math.floor(step / 16), s = step % 16;
    const chord = tr.chords[Math.floor(bar / 2)];
    const T = (o) => e.tone({ out, ...o, when }), N = (o) => e.noise({ out, ...o, when });
    const busy = this.intensity > 0;
    // Phrase roles: 0 = the opening build; every 4th phrase breaks down.
    const breakdown = this.phrase === 0 || this.phrase % 4 === 3;
    const build = breakdown && bar >= 6;          // riser + snare roll into the drop
    const drumsOn = !breakdown || bar >= 6 || (bar >= 4 && s % 2 === 0);
    const fillBar = !breakdown && bar === 7;

    // ---- Drums ----
    const swing = s % 2 === 1 ? sd * 0.12 : 0; // lazy off-beat 16ths
    const kick = () => {
      T({ type: "sine", f: 150, f2: 44, dur: 0.24, vol: 0.42 });
      N({ dur: 0.012, vol: 0.12, type: "highpass", f: 3000 }); // beater click
      this.pump(when);
    };
    const snare = (v = 1) => {
      N({ dur: 0.16, vol: 0.16 * v, f: 1900, q: 0.7 });
      N({ dur: 0.06, vol: 0.08 * v, type: "highpass", f: 5000 });
      T({ type: "triangle", f: 220, f2: 170, dur: 0.08, vol: 0.09 * v });
    };
    const ghost = (v = 0.3) => N({ dur: 0.06, vol: 0.12 * v, f: 2200, q: 1, when: when + swing });
    const hat = (v = 0.03, open = false) => N({ dur: open ? 0.16 : 0.03, vol: v, type: "highpass", f: open ? 6500 : 8000, when: when + swing });
    const ride = (v = 0.022) => N({ dur: 0.25, vol: v, f: 5200, q: 6, when: when + swing });
    const metal = (v = 0.05) => N({ dur: 0.09, vol: v, f: 3400, q: 9 });

    if (drumsOn && !build) {
      switch (tr.drums) {
        case "halftime":
          if (s === 0 || (s === 10 && bar % 2 === 1)) kick();
          if (s === 8) snare();
          if (s % 2 === 0) hat(s % 4 === 2 ? 0.03 : 0.018);
          if (s === 14) hat(0.025, true);
          break;
        case "twostep":
          if (s === 0 || s === 10) kick();
          if (s === 4 || s === 12) snare();
          if ((s === 7 || s === 9 || s === 15) && Math.random() < 0.6) ghost();
          hat(s % 2 === 0 ? 0.03 : 0.014);
          if (s === 6 || s === 14) hat(0.022, true);
          break;
        case "rolling":
          if (s === 0 || s === 10 || (s === 7 && bar % 2 === 1)) kick();
          if (s === 4 || s === 12) snare();
          if ([2, 6, 9, 11, 14].includes(s) && Math.random() < 0.55) ghost(0.35);
          hat([2, 6, 10, 14].includes(s) ? 0.034 : 0.016);
          if (s % 2 === 0) ride(0.018);
          break;
        case "neuro":
          if (s === 0 || s === 7 || s === 10) kick();
          if (s === 4 || s === 12) snare();
          if (s === 3 || s === 11) metal();
          if (s % 4 === 2) hat(0.026);
          if (s === 15 && Math.random() < 0.5) ghost(0.4);
          break;
        case "jumpup":
          if (s === 0 || s === 10 || (s === 3 && bar % 2 === 0)) kick();
          if (s === 4 || s === 12) snare(1.1);
          if (s === 15) snare(0.45);
          if (s % 2 === 0) ride(0.026);
          hat(s % 2 ? 0.016 : 0.028);
          break;
      }
      // Fill: snare roll across the last beat of the phrase.
      if (fillBar && s >= 12) snare(0.4 + (s - 12) * 0.2);
      if (busy) {
        if (s % 2 === 1) hat(0.022);
        if (s === 14 && tr.drums !== "halftime") kick();
      }
    }
    // Crash on the first beat of every phrase (the drop after a breakdown).
    if (step === 0 && !(breakdown && this.phrase === 0)) N({ dur: 1.4, vol: 0.07, type: "highpass", f: 4500, attack: 0.004 });

    // Build: noise riser + accelerating snare roll, then silence before the drop.
    if (build) {
      const into = (bar - 6) * 16 + s; // 0..31
      if (s === 0 && bar === 6) N({ dur: sd * 30, vol: 0.06, type: "bandpass", f: 400, f2: 7000, q: 1.2, attack: sd * 28 });
      const every = into < 16 ? 4 : into < 24 ? 2 : 1;
      if (into < 30 && into % every === 0) snare(0.25 + into / 40);
    }

    // ---- Bass ----
    const root = midiToFreq(this.note(chord, -1));
    const bassOn = !breakdown || build;
    if (bassOn && !(build && bar === 7 && s >= 12)) {
      if (tr.bass === "sub") {
        if (s === 0) T({ type: "sine", f: root, dur: sd * 7, vol: 0.32 });
        if (s === 10) T({ type: "sine", f: root, dur: sd * 4, vol: 0.28 });
        if (s === 14) T({ type: "sine", f: root * 2, f2: root * 1.5, dur: sd * 2, vol: 0.18 });
        if (s === 0 || s === 10) this.voice({ when, f: root * 2, dur: sd * 3, vol: 0.05, oscs: [["sawtooth", -8], ["sawtooth", 8]], cut: 900, cut2: 250 });
      } else if (tr.bass === "reese") {
        if (s === 0 || s === 8) {
          const f = s === 8 && bar % 2 === 1 ? root * 1.5 : root; // fifth on the back half
          this.voice({ when, f, dur: sd * 8, vol: 0.11, oscs: [["sawtooth", -16], ["sawtooth", 14], ["sawtooth", 0, 0.5]],
            cut: 260, cutCurve: [[0.45, tr.drums === "neuro" ? 1800 : 1100], [1, 280]], q: tr.drums === "neuro" ? 6 : 2, release: 0.08 });
          T({ type: "sine", f: f / 2, dur: sd * 7.5, vol: 0.22 });
        }
      } else if (tr.bass === "wobble") {
        if (s % 2 === 0 && s !== 6 && s !== 14) {
          const f = s >= 8 && bar % 2 === 1 ? root * 1.19 : root; // minor-third lift
          const fast = s % 4 === 0;
          this.voice({ when, f, dur: sd * 1.9, vol: 0.075, oscs: [["sawtooth", -10], ["square", 10]], drive: true,
            cut: 220, cutCurve: fast ? [[0.25, 2400], [0.5, 300], [0.75, 2400], [1, 300]] : [[0.5, 1600], [1, 260]], q: 8 });
          T({ type: "sine", f: f / 2, dur: sd * 1.8, vol: 0.2 });
        }
      }
    }

    // ---- Pads: a 7th chord per chord change, ducked by the kick ----
    if (s === 0 && bar % 2 === 0 && tr.pad) {
      [0, 2, 4, 6].forEach((d, k) => this.voice({ when, f: midiToFreq(this.note(chord + d, 0)), dur: sd * 32,
        vol: tr.pad * (breakdown ? 1.4 : 1), oscs: [["sawtooth", -9 + k * 2], ["sawtooth", 7 - k * 2]], attack: sd * 6, release: sd * 8,
        cut: breakdown ? 700 : 1500, cut2: breakdown ? 2600 : 1100, out: e.padBus }));
    }

    // ---- Arps / texture ----
    const arpOut = e.delay;
    if (tr.arp === "pluck") {
      const mask = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0];
      if (mask[s]) {
        const seq = [0, 2, 4, 6, 7, 6, 4, 2];
        const d = seq[(step >> 1) % 8] + (s >= 8 ? 7 : 0);
        T({ type: "triangle", f: midiToFreq(this.note(chord + d, 1)), dur: 0.16, vol: 0.05, filter: { f: 3200 }, out: Math.random() < 0.5 ? arpOut : out });
      }
    }
    if (tr.arp === "sparse" && (s === 2 || s === 7 || s === 11) && Math.random() < 0.8) {
      e.tone({ type: "triangle", f: midiToFreq(this.note(chord + [0, 2, 4, 6][Math.floor(Math.random() * 4)], 2)), dur: sd * 3, vol: 0.05, when, out: arpOut });
    }
    if (tr.arp === "drips" && Math.random() < 0.14) {
      e.tone({ type: "sine", f: midiToFreq(this.note(chord + Math.floor(Math.random() * 7), 2)), dur: 0.22, vol: 0.06, when, out: arpOut });
    }
    if (tr.arp === "stabs" && !breakdown && (s === 2 || s === 11 || (s === 6 && bar % 2))) {
      [0, 2, 4].forEach((d) => this.voice({ when, f: midiToFreq(this.note(chord + d, 1)), dur: sd * 1.4, vol: 0.03,
        oscs: [["square", -6], ["sawtooth", 6]], cut: 2400, cut2: 600, drive: true }));
    }

    // ---- Lead hook: second half of each phrase (always during a boss) ----
    if (tr.lead && !breakdown && (bar >= 4 || busy)) {
      const local = step % 32;
      for (const [st, deg, len] of this.melody) {
        if (st !== local) continue;
        const f = midiToFreq(this.note(chord + deg, 1));
        this.voice({ when, f, dur: sd * len, vol: tr.lead, oscs: [["square", -5], ["sawtooth", 5]], cut: 3000, cut2: 1400, release: sd, out: arpOut });
        this.voice({ when, f, dur: sd * len, vol: tr.lead * 0.6, oscs: [["triangle", 0]], cut: 4000 });
      }
    }
  }
}

const SOUND = new SoundEngine();
