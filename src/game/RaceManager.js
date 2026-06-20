/**
 * Race state machine for a circuit: a standing start (3-2-1-GO), lap timing,
 * and finish.
 *
 * Phases:
 *   'countdown' – car is held at the line; lights count down; clock not running.
 *   'racing'    – clock runs; laps are counted.
 *   'finished'  – all laps done.
 *
 * A lap counts only when the car crosses the start/finish line in the forward
 * direction AND has accumulated ~360° of angular progress around the loop centre
 * since the last crossing — robust, no hand-placed checkpoints, can't be cheated
 * by reversing or re-crossing. The launch crossing right after GO has ~0°
 * progress so it is naturally ignored.
 *
 * Pure state (no DOM); the HUD, lights and car-hold read these fields.
 */
const COUNTDOWN_SECS = 3.2; // 3 … 2 … 1 … GO
const GO_FLASH_SECS = 1.1;

export class RaceManager {
  constructor(car, track) {
    this.car = car;
    this.track = track;
    this.totalLaps = track.laps;
    this.center = track.loopCenter;
    this.line = track.startLine;
    this.reset();
  }

  reset() {
    this.phase = 'countdown';
    this.countdown = COUNTDOWN_SECS;
    this.goFlash = 0;
    this.finished = false;
    this.lapsDone = 0;
    this.raceTime = 0;
    this.lapStart = 0;
    this.lapTime = 0;
    this.lastLap = 0;
    this.bestLap = 0;
    this.lapTimes = [];
    this._cum = 0;
    this._lastTheta = null;
    this._prevS = null;
    this.justCrossed = 0;
  }

  get started() { return this.phase === 'racing' || this.finished; }
  get currentLap() { return Math.min(this.lapsDone + 1, this.totalLaps); }

  /** HUD text for the countdown ("3"/"2"/"1"/"GO!") or '' when racing. */
  get countdownText() {
    if (this.phase === 'countdown') return String(Math.max(1, Math.ceil(this.countdown)));
    if (this.goFlash > 0) return 'GO!';
    return '';
  }

  /** Start-light state: how many reds are lit, and whether the green (GO) is on. */
  startLights() {
    if (this.phase === 'countdown') {
      return { red: Math.min(3, 4 - Math.ceil(this.countdown)), green: false, on: true };
    }
    if (this.goFlash > 0) return { red: 0, green: true, on: true };
    return { red: 0, green: false, on: false };
  }

  update(dt) {
    if (this.goFlash > 0) this.goFlash = Math.max(0, this.goFlash - dt);
    if (this.justCrossed > 0) this.justCrossed -= dt;

    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = 'racing';
        this.goFlash = GO_FLASH_SECS;
        this.raceTime = 0;
        this.lapStart = 0;
        this._cum = 0;
        this._lastTheta = null;
        this._prevS = null;
      }
      return;
    }
    if (this.finished) return;

    const p = this.car.object3D.position;

    // angular progress around the loop centre (unwrapped)
    const th = Math.atan2(p.z - this.center.z, p.x - this.center.x);
    if (this._lastTheta !== null) {
      let d = th - this._lastTheta;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this._cum += d;
    }
    this._lastTheta = th;

    // signed distance to the line plane (forward normal) + lateral bound
    const L = this.line;
    const s = (p.x - L.x) * L.nx + (p.z - L.z) * L.nz;
    const lateral = (p.x - L.x) * -L.nz + (p.z - L.z) * L.nx;
    const within = Math.abs(lateral) <= L.halfWidth;

    if (this._prevS !== null && this._prevS < 0 && s >= 0 && within && Math.abs(this._cum) > Math.PI * 1.8) {
      const lt = this.raceTime - this.lapStart;
      this.lapTimes.push(lt);
      this.lastLap = lt;
      this.bestLap = this.bestLap ? Math.min(this.bestLap, lt) : lt;
      this.lapStart = this.raceTime;
      this._cum = 0;
      this.lapsDone++;
      this.justCrossed = 2;
      if (this.lapsDone >= this.totalLaps) this.finished = true;
    }
    this._prevS = s;

    if (!this.finished) this.raceTime += dt;
    this.lapTime = this.raceTime - this.lapStart;
  }
}

/** Format seconds as m:ss.mm (or ss.mms under a minute). */
export function formatTime(t) {
  if (t == null) return '--:--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  if (m > 0) return `${m}:${s.toFixed(2).padStart(5, '0')}`;
  return `${s.toFixed(2)}s`;
}
