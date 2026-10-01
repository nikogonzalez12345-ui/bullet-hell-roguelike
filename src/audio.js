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
      this.musicBus.connect(this.master);
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
// Music: a small step sequencer playing one procedural track per stage.
// Notes are scale degrees over a 4-bar chord progression; the scheduler
// queues ~0.15s ahead so timing stays tight even if a frame hitches.
// ---------------------------------------------------------------------------

const MUSIC_TRACKS = {
  menu:   { bpm: 92,  root: 57, scale: [0, 2, 3, 5, 7, 8, 10], chords: [0, 5, 3, 4], drums: "soft",   bass: "pulse",  arp: "up",     pad: 0.06, lead: false },
  sunset: { bpm: 104, root: 57, scale: [0, 2, 3, 5, 7, 8, 10], chords: [0, 5, 3, 4], drums: "groove", bass: "pulse",  arp: "up",     pad: 0.05, lead: true },
  night:  { bpm: 82,  root: 50, scale: [0, 2, 3, 5, 7, 9, 10], chords: [0, 3, 6, 4], drums: "sparse", bass: "long",   arp: "sparse", pad: 0.06, lead: true },
  cave:   { bpm: 66,  root: 45, scale: [0, 2, 3, 5, 7, 8, 10], chords: [0, 0, 5, 5], drums: "pulse",  bass: "drone",  arp: "drips",  pad: 0.08, lead: false },
  hell:   { bpm: 140, root: 40, scale: [0, 1, 3, 5, 7, 8, 10], chords: [0, 1, 0, 6], drums: "drive",  bass: "driven", arp: "stabs",  pad: 0.04, lead: true },
};

class MusicPlayer {
  constructor(engine) {
    this.e = engine;
    this.track = null;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.intensity = 0; // 1 while a boss is alive: busier drums
  }

  play(name) {
    if (this.trackName === name) return;
    this.trackName = name;
    this.track = MUSIC_TRACKS[name] || null;
    this.step = 0;
    this.nextTime = 0;
    this.start();
  }

  // Begin scheduling (no-op until the AudioContext exists).
  start() {
    const c = this.e.ctx;
    if (!c) return;
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
      this.step = (this.step + 1) % 64; // 4 bars
    }
  }

  // Scale degree (can exceed the scale length) -> MIDI note.
  note(deg, octave = 0) {
    const s = this.track.scale;
    const o = Math.floor(deg / s.length);
    const i = ((deg % s.length) + s.length) % s.length;
    return this.track.root + s[i] + 12 * (o + octave);
  }

  playStep(step, when, sd) {
    const tr = this.track;
    const e = this.e;
    const out = e.musicBus;
    const bar = Math.floor(step / 16), s = step % 16;
    const chord = tr.chords[bar];
    const T = (o) => e.tone({ out, ...o, when }), N = (o) => e.noise({ out, ...o, when });
    const busy = this.intensity > 0;

    // Pad: a sustained triad at the start of each bar.
    if (s === 0 && tr.pad) {
      [0, 2, 4].forEach((d, k) => T({ type: "sawtooth", f: midiToFreq(this.note(chord + d, 0)), dur: sd * 16, vol: tr.pad, attack: sd * 4, filter: { f: 900 }, detune: k * 6 - 6 }));
    }

    // Bass
    const root = midiToFreq(this.note(chord, -1));
    if (tr.bass === "pulse" && (s % 4 === 0)) T({ type: "square", f: root, dur: sd * 3, vol: 0.12, filter: { f: 500 } });
    if (tr.bass === "long" && (s === 0 || s === 10)) T({ type: "triangle", f: root, dur: sd * 8, vol: 0.18 });
    if (tr.bass === "drone" && s === 0 && bar % 2 === 0) T({ type: "sawtooth", f: root / 2, dur: sd * 32, vol: 0.1, attack: sd * 8, filter: { f: 300 } });
    if (tr.bass === "driven" && s % 2 === 0) T({ type: "sawtooth", f: root, dur: sd * 1.6, vol: 0.13, filter: { f: 700 } });

    // Arp / texture
    if (tr.arp === "up" && s % 2 === 0) {
      const d = [0, 2, 4, 7][(s / 2) % 4];
      e.tone({ type: "triangle", f: midiToFreq(this.note(chord + d, 1)), dur: sd * 1.5, vol: 0.05, when, out: e.delay });
    }
    if (tr.arp === "sparse" && (s === 2 || s === 7 || s === 11) && Math.random() < 0.8) {
      e.tone({ type: "triangle", f: midiToFreq(this.note(chord + [0, 2, 4, 6][Math.floor(Math.random() * 4)], 1)), dur: sd * 4, vol: 0.06, when, out: e.delay });
    }
    if (tr.arp === "drips" && Math.random() < 0.12) {
      e.tone({ type: "sine", f: midiToFreq(this.note(chord + Math.floor(Math.random() * 7), 2)), dur: 0.25, vol: 0.06, when, out: e.delay });
    }
    if (tr.arp === "stabs" && (s === 0 || s === 3 || s === 6 || s === 10)) {
      [0, 2, 4].forEach((d) => T({ type: "square", f: midiToFreq(this.note(chord + d, 0)), dur: sd * 1.2, vol: 0.035, filter: { f: 1600 } }));
    }

    // Lead: a short motif every other bar.
    if (tr.lead && bar % 2 === 1 && s % 4 === 0) {
      const motif = [4, 2, 3, 1];
      e.tone({ type: "square", f: midiToFreq(this.note(chord + motif[s / 4], 1)), dur: sd * 3, vol: 0.04, when, filter: { f: 2200 }, out: e.delay });
    }

    // Drums
    const kick = () => T({ type: "sine", f: 130, f2: 42, dur: 0.22, vol: 0.32 });
    const snare = () => { N({ dur: 0.14, vol: 0.12, f: 1800, q: 0.8 }); T({ type: "triangle", f: 190, dur: 0.07, vol: 0.06 }); };
    const hat = (v = 0.035) => N({ dur: 0.035, vol: v, type: "highpass", f: 7000 });
    switch (tr.drums) {
      case "soft":   if (s === 0 || s === 8) kick(); if (s % 4 === 2) hat(0.02); break;
      case "groove": if (s === 0 || s === 8 || s === 11) kick(); if (s === 4 || s === 12) snare(); if (s % 2 === 0) hat(); break;
      case "sparse": if (s === 0 || s === 10) kick(); if (s % 4 === 2) hat(0.025); if (s === 12) N({ dur: 0.05, vol: 0.06, f: 3000, q: 2 }); break;
      case "pulse":  if (s === 0) kick(); if (s === 8 && bar % 2 === 1) N({ dur: 0.3, vol: 0.05, type: "lowpass", f: 400 }); break;
      case "drive":  if (s % 4 === 0) kick(); if (s === 4 || s === 12) snare(); hat(s % 2 ? 0.02 : 0.035); break;
    }
    if (busy && s % 2 === 1) hat(0.03);
    if (busy && (s === 6 || s === 14)) kick();
  }
}

const SOUND = new SoundEngine();
