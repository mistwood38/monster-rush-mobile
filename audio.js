export class BattleAudio {
  constructor(music = 0.55, sfx = 0.75) {
    this.context = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.timer = 0;
    this.step = 0;
    this.nextTime = 0;
    this.noise = null;
    this.enabled = false;
    this.boss = false;
    this.lastImpact = -1;
  }
  async start() {
    if (!this.context) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.context = new AC();
      this.master = this.context.createDynamicsCompressor();
      this.master.threshold.value = -12;
      this.master.ratio.value = 4;
      this.musicGain = this.context.createGain();
      this.sfxGain = this.context.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.sfxGain.gain.value = this.sfxVolume;
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.master.connect(this.context.destination);
      const n = this.context.createBuffer(
          1,
          this.context.sampleRate * 2,
          this.context.sampleRate,
        ),
        d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = n;
    }
    await this.context.resume();
    this.enabled = true;
    if (!this.timer) {
      this.step = 0;
      this.nextTime = this.context.currentTime + 0.06;
      this.schedule();
    }
    return true;
  }
  schedule() {
    if (!this.enabled || !this.context) return;
    const c = this.context;
    const bpm = this.boss ? 142 : 124,
      dt = 60 / bpm / 4;
    while (this.nextTime < c.currentTime + 0.19) {
      this.musicStep(this.step, this.nextTime, bpm);
      this.step = (this.step + 1) % 64;
      this.nextTime += dt;
    }
    this.timer = setTimeout(() => {
      this.timer = 0;
      this.schedule();
    }, 25);
  }
  musicStep(s, t, bpm) {
    const c = this.context;
    const bar = Math.floor(s / 16) % 4,
      k = s % 16;
    const roots = [55, 49, 65.41, 58.27];
    const root = roots[bar];
    if (k === 0 || k === 8) this.kick(t, k === 0 ? 0.76 : 0.6);
    if (k === 4 || k === 12) this.snare(t);
    if (k % 2 === 0) this.hat(t, k % 4 === 0 ? 0.22 : 0.12);
    const bassSeq = [0, 0, 7, 12, 7, 0, 10, 7, 0, 0, 12, 15, 7, 5, 10, 7];
    if (k % 2 === 0) {
      const sem = bassSeq[k],
        freq = root * Math.pow(2, sem / 12);
      this.osc(
        freq,
        t,
        0.18,
        k === 0 ? 0.095 : 0.065,
        "sawtooth",
        this.musicGain,
      );
    }
    if (k === 0) {
      const chords = [
        [0, 7, 12, 16],
        [0, 7, 12, 15],
        [0, 7, 12, 16],
        [0, 7, 10, 14],
      ][bar];
      for (const sem of chords) {
        const f = root * 2 * Math.pow(2, sem / 12);
        this.osc(f, t, 1.65, 0.018, "triangle", this.musicGain);
      }
    }
    const lead = [
      12, 19, 24, 19, 15, 19, 22, 19, 12, 19, 24, 27, 24, 19, 15, 19,
    ];
    if (k === 2 || k === 6 || k === 10 || k === 14) {
      const f = root * 4 * Math.pow(2, lead[k] / 12);
      this.osc(
        f,
        t,
        0.105,
        this.boss ? 0.032 : 0.022,
        "triangle",
        this.musicGain,
      );
    }
  }
  env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  osc(freq, t, dur, vol, wave = "sine", out = this.sfxGain, endFreq = null) {
    const c = this.context;
    if (!c || !this.enabled) return;
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(Math.max(20, freq), t);
    if (endFreq)
      o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    g.gain.setValueAtTime(Math.max(0.0001, vol), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  noiseHit(t, dur, vol, filter = 5000, out = this.sfxGain) {
    const c = this.context;
    if (!c || !this.enabled) return;
    const src = c.createBufferSource(),
      f = c.createBiquadFilter(),
      g = c.createGain();
    src.buffer = this.noise;
    f.type = "lowpass";
    f.frequency.value = filter;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t);
    src.stop(t + dur);
  }
  kick(t, vol) {
    this.osc(118, t, 0.2, vol, "sine", this.musicGain, 42);
  }
  snare(t) {
    this.noiseHit(t, 0.16, 0.19, 3400, this.musicGain);
    this.osc(185, t, 0.12, 0.085, "triangle", this.musicGain, 115);
  }
  hat(t, v) {
    this.noiseHit(t, 0.045, v, 9200, this.musicGain);
  }
  shoot(kind = "rifle") {
    if (!this.enabled || !this.context) return;
    const t = this.context.currentTime + 0.002;
    switch (kind) {
      case "machine":
        this.noiseHit(t, 0.055, 0.22, 2400);
        this.osc(145, t, 0.07, 0.17, "sawtooth", this.sfxGain, 65);
        break;
      case "shotgun":
        this.noiseHit(t, 0.2, 0.62, 1500);
        this.osc(82, t, 0.22, 0.4, "triangle", this.sfxGain, 38);
        break;
      case "plasma":
        this.osc(520, t, 0.3, 0.28, "sawtooth", this.sfxGain, 85);
        this.osc(180, t, 0.36, 0.22, "sine", this.sfxGain, 40);
        break;
      case "laser":
        this.osc(1150, t, 0.12, 0.1, "sawtooth", this.sfxGain, 480);
        this.osc(840, t, 0.17, 0.08, "sine", this.sfxGain, 260);
        break;
      default:
        this.noiseHit(t, 0.065, 0.36, 3200);
        this.osc(210, t, 0.09, 0.26, "triangle", this.sfxGain, 80);
    }
  }
  impact(heavy = false) {
    if (!this.enabled || !this.context) return;
    const t = this.context.currentTime;
    if (t - this.lastImpact < (heavy ? 0.065 : 0.045)) return;
    this.lastImpact = t;
    this.noiseHit(
      t,
      heavy ? 0.22 : 0.09,
      heavy ? 0.42 : 0.18,
      heavy ? 1000 : 4600,
    );
    this.osc(
      heavy ? 92 : 420,
      t,
      heavy ? 0.22 : 0.055,
      heavy ? 0.23 : 0.08,
      heavy ? "sawtooth" : "triangle",
      this.sfxGain,
      heavy ? 35 : 160,
    );
  }
  pickup() {
    if (!this.enabled || !this.context) return;
    const t = this.context.currentTime;
    [523, 659, 784, 1046].forEach((f, i) =>
      this.osc(f, t + i * 0.055, 0.21, 0.1, "sine", this.sfxGain),
    );
  }
  bossAlert() {
    if (!this.enabled || !this.context) return;
    const t = this.context.currentTime;
    this.osc(110, t, 0.9, 0.3, "sawtooth", this.sfxGain, 45);
    this.osc(165, t + 0.18, 0.7, 0.18, "triangle", this.sfxGain, 55);
    this.noiseHit(t, 0.55, 0.22, 600);
  }
  explosion() {
    if (!this.enabled || !this.context) return;
    const t = this.context.currentTime;
    this.noiseHit(t, 0.48, 0.55, 900);
    this.osc(68, t, 0.42, 0.4, "sine", this.sfxGain, 25);
  }
  setMusic(v) {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.musicGain && this.context)
      this.musicGain.gain.setTargetAtTime(
        this.musicVolume,
        this.context.currentTime,
        0.04,
      );
  }
  setSfx(v) {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxGain && this.context)
      this.sfxGain.gain.setTargetAtTime(
        this.sfxVolume,
        this.context.currentTime,
        0.04,
      );
  }
  setBoss(on) {
    if (this.boss === on) return;
    this.boss = on;
    this.step = Math.ceil(this.step / 16) * 16;
  }
  async pause() {
    this.enabled = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = 0;
    }
    if (this.context?.state === "running") await this.context.suspend();
  }
  async resume() {
    if (!this.context) return;
    await this.context.resume();
    this.enabled = true;
    this.nextTime = this.context.currentTime + 0.05;
    this.schedule();
  }
  stop() {
    this.enabled = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = 0;
    this.context?.close();
    this.context = null;
  }
  status() {
    return {
      initialized: !!this.context,
      playing: this.enabled,
      music: this.musicVolume,
      sfx: this.sfxVolume,
      bossTrack: this.boss,
    };
  }
}
