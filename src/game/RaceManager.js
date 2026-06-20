/**
 * Race state machine for a circuit with one or more cars (player + AI): a
 * standing start (3-2-1-GO), per-car lap timing, live positions and a finish.
 *
 * Phases:
 *   'countdown' – all cars held at the line; lights count down; clock stopped.
 *   'racing'    – clock runs; every car's laps are counted.
 *   'finished'  – the player has completed all laps.
 *
 * A lap counts for a car only when it crosses the start/finish line forward AND
 * has accumulated ~360° of angular progress around the loop centre since the last
 * crossing — robust, no hand-placed checkpoints, can't be cheated by reversing.
 *
 * Pure state (no DOM); the HUD, lights and car-hold read these fields. The
 * player-facing getters (currentLap, lapTime, …) report the player's entry.
 */
const COUNTDOWN_SECS = 3.2; // 3 … 2 … 1 … GO
const GO_FLASH_SECS = 1.1;
const TWO_PI = Math.PI * 2;

export class RaceManager {
  /**
   * @param {object} track
   * @param {{car:object, name:string, isPlayer?:boolean}[]} entries
   */
  constructor(track, entries) {
    this.track = track;
    this.totalLaps = track.laps;
    this.center = track.loopCenter;
    this.line = track.startLine;
    this.entries = entries.map((e) => ({ car: e.car, name: e.name, isPlayer: !!e.isPlayer, ...freshState() }));
    this.player = this.entries.find((e) => e.isPlayer) || this.entries[0];
    this.reset();
  }

  reset() {
    this.phase = 'countdown';
    this.countdown = COUNTDOWN_SECS;
    this.goFlash = 0;
    this.raceTime = 0;
    this.finishers = 0;
    this.justCrossed = 0;
    for (const e of this.entries) Object.assign(e, freshState());
    this._rank();
  }

  // ---- player-facing getters (keep the existing HUD working) ----
  get started() { return this.phase === 'racing' || this.player.finished; }
  get currentLap() { return Math.min(this.player.lapsDone + 1, this.totalLaps); }
  get lapTime() { return this.player.lapTime; }
  get bestLap() { return this.player.bestLap; }
  get finished() { return this.player.finished; }
  get position() { return this.player.position; }
  get totalCars() { return this.entries.length; }

  /** Live standings, best first. */
  get standings() {
    return [...this.entries]
      .sort((a, b) => a.position - b.position)
      .map((e) => ({ name: e.name, isPlayer: e.isPlayer, lapsDone: e.lapsDone, position: e.position, finished: e.finished }));
  }

  /** Did the player win (finished first)? Only meaningful once finished. */
  get playerWon() { return this.player.finishOrder === 1; }

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
        for (const e of this.entries) { e.lapStart = 0; e._cum = 0; e._lastTheta = null; e._prevS = null; }
      }
      return;
    }

    if (this.phase === 'racing') this.raceTime += dt;

    for (const e of this.entries) this._updateEntry(e, dt);
    this._rank();

    // The race (and banner) ends when the player finishes their laps.
    if (this.player.finished) this.phase = 'finished';
  }

  _updateEntry(e, dt) {
    const p = e.car.object3D.position;

    // angular progress around the loop centre (unwrapped)
    const th = Math.atan2(p.z - this.center.z, p.x - this.center.x);
    if (e._lastTheta !== null) {
      let d = th - e._lastTheta;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      e._cum += d;
    }
    e._lastTheta = th;
    e.progress = e.lapsDone + Math.min(1, Math.abs(e._cum) / TWO_PI);

    if (e.finished) return;

    // signed distance to the line plane (forward normal) + lateral bound
    const L = this.line;
    const s = (p.x - L.x) * L.nx + (p.z - L.z) * L.nz;
    const lateral = (p.x - L.x) * -L.nz + (p.z - L.z) * L.nx;
    const within = Math.abs(lateral) <= L.halfWidth;

    if (e._prevS !== null && e._prevS < 0 && s >= 0 && within && Math.abs(e._cum) > Math.PI * 1.8) {
      const lt = this.raceTime - e.lapStart;
      e.lapTimes.push(lt);
      e.lastLap = lt;
      e.bestLap = e.bestLap ? Math.min(e.bestLap, lt) : lt;
      e.lapStart = this.raceTime;
      e._cum = 0;
      e.lapsDone++;
      if (e.isPlayer) this.justCrossed = 2;
      if (e.lapsDone >= this.totalLaps) {
        e.finished = true;
        e.finishTime = this.raceTime;
        e.finishOrder = ++this.finishers;
      }
    }
    e._prevS = s;

    if (!e.finished) e.lapTime = this.raceTime - e.lapStart;
  }

  /** Rank entries by progress (laps + fraction of the current lap). */
  _rank() {
    const order = [...this.entries].sort((a, b) => {
      if (a.finished || b.finished) {
        if (a.finished && b.finished) return a.finishOrder - b.finishOrder;
        return a.finished ? -1 : 1;
      }
      return b.progress - a.progress;
    });
    order.forEach((e, i) => { e.position = i + 1; });
  }
}

function freshState() {
  return {
    lapsDone: 0, lapStart: 0, lapTime: 0, lastLap: 0, bestLap: 0, lapTimes: [],
    _cum: 0, _lastTheta: null, _prevS: null,
    finished: false, finishTime: 0, finishOrder: 0, progress: 0, position: 1,
  };
}

/** Format seconds as m:ss.mm (or ss.mms under a minute). */
export function formatTime(t) {
  if (t == null) return '--:--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  if (m > 0) return `${m}:${s.toFixed(2).padStart(5, '0')}`;
  return `${s.toFixed(2)}s`;
}
