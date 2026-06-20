/**
 * Lap / timing logic for a circuit.
 *
 * A lap is counted only when BOTH hold:
 *   1) the car crosses the start/finish line plane in the forward direction
 *      (and within the road span), and
 *   2) it has accumulated ~360° of angular progress around the loop centre since
 *      the last crossing — so you can't cheat by reversing or re-crossing.
 *
 * Pure state (no DOM) so it's easy to test; the HUD reads these fields.
 */
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
    this.started = false;
    this.finished = false;
    this.lapsDone = 0;
    this.raceTime = 0;
    this.lapStart = 0;
    this.lapTime = 0;
    this.lastLap = 0;
    this.bestLap = 0;
    this.lapTimes = [];
    this._cum = 0; // accumulated angle since last crossing (radians)
    this._lastTheta = null;
    this._prevS = null;
    this.justCrossed = 0; // >0 for a few frames after a valid lap (for HUD flash)
  }

  get currentLap() {
    if (!this.started) return 1;
    return Math.min(this.lapsDone + 1, this.totalLaps);
  }

  _pos() { return this.car.object3D.position; }

  update(dt) {
    if (this.justCrossed > 0) this.justCrossed -= dt;
    if (this.finished) return;

    const p = this._pos();

    // 1) angular progress around the loop centre (unwrapped).
    const th = Math.atan2(p.z - this.center.z, p.x - this.center.x);
    if (this._lastTheta !== null) {
      let d = th - this._lastTheta;
      d = Math.atan2(Math.sin(d), Math.cos(d)); // wrap to [-π, π]
      this._cum += d;
    }
    this._lastTheta = th;

    // 2) signed distance to the line plane along the forward normal.
    const L = this.line;
    const s = (p.x - L.x) * L.nx + (p.z - L.z) * L.nz;
    // lateral coordinate along the line (perpendicular to the normal) to bound it.
    const lateral = (p.x - L.x) * -L.nz + (p.z - L.z) * L.nx;
    const within = Math.abs(lateral) <= L.halfWidth;

    if (this._prevS !== null && this._prevS < 0 && s >= 0 && within) {
      // forward crossing of the line
      if (!this.started) {
        this.started = true;
        this.raceTime = 0;
        this.lapStart = 0;
        this._cum = 0;
      } else if (Math.abs(this._cum) > Math.PI * 1.8) {
        // a genuine full lap
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
    }
    this._prevS = s;

    if (this.started && !this.finished) this.raceTime += dt;
    this.lapTime = this.started ? this.raceTime - this.lapStart : 0;
  }
}

/** Format seconds as m:ss.mmm (or ss.mmm under a minute). */
export function formatTime(t) {
  if (t == null) return '--:--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const ss = s.toFixed(2).padStart(5, '0');
  return m > 0 ? `${m}:${ss.padStart(5, '0')}` : `${s.toFixed(2)}s`;
}
