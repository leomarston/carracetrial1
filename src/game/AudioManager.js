/**
 * Procedural driving audio via the Web Audio API:
 *  - engine: detuned saw oscillators whose pitch tracks RPM, through a lowpass
 *  - tyre screech: band-passed noise gated by slip
 *  - wind: low-passed noise that rises with speed
 *
 * The AudioContext is created suspended and resumed on the first user gesture
 * (browser autoplay policy).
 */
export class AudioManager {
  constructor(car) {
    this.car = car;
    this.enabled = false;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
    } catch {
      this.ctx = null;
      return;
    }
    this._build();

    const resume = () => {
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
      this.enabled = true;
    };
    window.addEventListener('keydown', resume, { once: false });
    window.addEventListener('pointerdown', resume, { once: false });
  }

  _noiseBuffer() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(ctx.destination);

    // --- Engine: two detuned sawtooth oscillators + lowpass ---
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 1600;
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square'; this.osc2.detune.value = -12;
    this.osc1.frequency.value = 60; this.osc2.frequency.value = 60;
    this.osc1.connect(this.engineFilter); this.osc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.master);
    this.osc1.start(); this.osc2.start();

    // --- Tyre screech: bandpassed noise, gated by slip ---
    this.screechSrc = ctx.createBufferSource();
    this.screechSrc.buffer = this._noiseBuffer(); this.screechSrc.loop = true;
    this.screechFilter = ctx.createBiquadFilter();
    this.screechFilter.type = 'bandpass'; this.screechFilter.frequency.value = 1100; this.screechFilter.Q.value = 6;
    this.screechGain = ctx.createGain(); this.screechGain.gain.value = 0;
    this.screechSrc.connect(this.screechFilter); this.screechFilter.connect(this.screechGain); this.screechGain.connect(this.master);
    this.screechSrc.start();

    // --- Wind: low-passed noise rising with speed ---
    this.windSrc = ctx.createBufferSource();
    this.windSrc.buffer = this._noiseBuffer(); this.windSrc.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass'; this.windFilter.frequency.value = 500;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    this.windSrc.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.master);
    this.windSrc.start();
  }

  update() {
    if (!this.ctx || !this.enabled) return;
    const car = this.car;
    const t = this.ctx.currentTime;

    // Engine pitch from RPM (idle ~1100 -> redline ~7800).
    const rpm = car.rpm || 1100;
    const freq = 40 + (rpm / 7800) * 220; // Hz fundamental
    this.osc1.frequency.setTargetAtTime(freq, t, 0.04);
    this.osc2.frequency.setTargetAtTime(freq * 0.5, t, 0.04);
    this.engineFilter.frequency.setTargetAtTime(700 + (rpm / 7800) * 4000, t, 0.05);
    const load = 0.18 + Math.max(0, car.input?.throttle || 0) * 0.22;
    this.engineGain.gain.setTargetAtTime(load, t, 0.05);

    // Tyre screech from slip.
    const slip = Math.max(car.lateralSlip || 0, car.wheelSlip || 0);
    const screech = slip > 0.35 && Math.abs(car.speed) > 2 ? Math.min(0.5, slip * 0.6) : 0;
    this.screechGain.gain.setTargetAtTime(screech, t, 0.05);

    // Wind from speed.
    const spd = Math.abs(car.speed || 0);
    this.windGain.gain.setTargetAtTime(Math.min(0.25, spd / 90 * 0.25), t, 0.1);
    this.windFilter.frequency.setTargetAtTime(400 + spd * 12, t, 0.1);
  }
}
