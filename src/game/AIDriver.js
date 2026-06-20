import { nearestIndex } from './trackPath.js';

/**
 * A simple but robust racing AI: it chases a precomputed centerline.
 *
 *  - Steering: pure-pursuit toward a look-ahead point on the line (the faster it
 *    goes, the further ahead it aims → smooth, stable cornering).
 *  - Speed: every waypoint has a curvature-derived speed limit; the AI looks
 *    ahead over its braking distance, targets the slowest limit it can see, and
 *    throttles or brakes to hit it. So it slows for corners and floors the
 *    straights.
 *  - Recovery: if it gets stuck (wall, spin), it reverses and re-aims.
 *
 * It only reads the vehicle's public state and emits {throttle, steer, handbrake}
 * exactly like the keyboard Controls, so the rest of the game treats it the same.
 */
export class AIDriver {
  /**
   * @param {import('./Vehicle.js').Vehicle} vehicle
   * @param {{x:number,z:number}[]} waypoints ordered loop in the driving direction
   * @param {object} [opts]
   */
  constructor(vehicle, waypoints, opts = {}) {
    this.car = vehicle;
    this.wps = waypoints;
    this.n = waypoints.length;

    // Skill knobs (0..1-ish). Lower = slower/easier opponent.
    this.skill = opts.skill ?? 1;
    this.vmax = opts.vmax ?? vehicle.topSpeed * 0.55; // m/s the AI will chase on straights
    this.vmin = opts.vmin ?? 12; // m/s floor through the tightest corner
    this.lookBase = opts.lookBase ?? 16; // m look-ahead at rest
    this.lookSpeed = opts.lookSpeed ?? 1.0; // + this * speed (m per m/s)
    this.latAccel = opts.latAccel ?? 3.2; // m/s² lateral grip the AI assumes for corners
    this.headGain = opts.headGain ?? 1.0; // weight on the path-heading term
    this.crossGain = opts.crossGain ?? 1.2; // how hard it pulls back onto the line
    this.crossSign = opts.crossSign ?? -1; // sign so the cross-track term steers toward the line
    this.crossSoft = opts.crossSoft ?? 7; // speed-softening so it isn't violent at low speed
    this.crossCap = opts.crossCap ?? 0.7; // rad: cross-track term alone can't hit full lock
    this.steerSmooth = opts.steerSmooth ?? 0.25; // steer low-pass (per 1/60 s)

    this.i = nearestIndex(waypoints, vehicle.object3D.position.x, vehicle.object3D.position.z);
    this._stuck = 0;
    this._recover = 0;
    this._caution = 0;
    this._steer = 0;
    this.stuckTime = 0;
    this.airTime = 0;

    this._cornerSpeed = this._computeCornerSpeeds();
  }

  /** Per-waypoint speed limit from local curvature (smoothed, then forward-blurred). */
  _computeCornerSpeeds() {
    const n = this.n, wps = this.wps;

    // Average waypoint spacing → choose a curvature baseline (~75 m each side) so
    // long sweeping curves are detected, not just sharp single-waypoint kinks.
    let total = 0;
    for (let i = 0; i < n; i++) { const a = wps[i], b = wps[(i + 1) % n]; total += Math.hypot(b.x - a.x, b.z - a.z); }
    const spacing = total / n;
    this.loopLength = total;
    const W = Math.max(1, Math.round(75 / spacing));

    const latAccel = this.latAccel * (0.75 + 0.25 * this.skill);
    // Two baselines: short (W) catches tight kinks, long (3W) catches sustained
    // sweepers that read as "gentle" locally but drift the car off over their
    // length. Take the slower of the two so long bends are respected.
    const speedAt = (i, half) => {
      const a = wps[(i - half + n) % n], b = wps[i], c = wps[(i + half) % n];
      const ax = b.x - a.x, az = b.z - a.z;
      const bx = c.x - b.x, bz = c.z - b.z;
      const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
      let dot = (ax * bx + az * bz) / (la * lb);
      dot = Math.max(-1, Math.min(1, dot));
      const turn = Math.acos(dot);
      const arc = (la + lb) / 2;
      const radius = turn > 1e-3 ? arc / turn : 1e6;
      return Math.sqrt(latAccel * radius);
    };
    const raw = new Array(n);
    for (let i = 0; i < n; i++) {
      const v = Math.min(speedAt(i, W), speedAt(i, 3 * W));
      raw[i] = Math.max(this.vmin, Math.min(this.vmax, v));
    }
    // Min-smooth so a corner's limit applies a little before/after its apex.
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      let m = Infinity;
      for (let k = -W; k <= W; k++) m = Math.min(m, raw[(i + k + n) % n]);
      out[i] = m;
    }
    return out;
  }

  reset() {
    this.i = nearestIndex(this.wps, this.car.object3D.position.x, this.car.object3D.position.z);
    this._stuck = 0;
    this._recover = 0;
    this._caution = 0;
    this._steer = 0;
    this.stuckTime = 0;
    this.airTime = 0;
  }

  /** Pinned (low speed) OR fallen off (airborne) for too long → auto-rescue. */
  get isStuck() { return this.stuckTime > 4 || this.airTime > 1.5; }

  /** Where to drop the car for a rescue: on the line a couple of points AHEAD
   *  (so it skips past whatever trapped it), facing along the track. */
  rescueTarget() {
    const n = this.n, idx = (this.i + 2) % n, wp = this.wps[idx], aim = this.wps[(idx + 3) % n];
    return { x: wp.x, y: wp.y, z: wp.z, heading: Math.atan2(aim.x - wp.x, aim.z - wp.z) };
  }

  /** Called by the game after it has repositioned the car onto the line. */
  onRescued() {
    this.i = (this.i + 2) % this.n;
    this.stuckTime = 0; this.airTime = 0; this._stuck = 0; this._recover = 0; this._caution = 2.5; this._steer = 0;
  }

  /** @returns {{throttle:number, steer:number, handbrake:boolean}} */
  update(dt) {
    const car = this.car;
    const p = car.object3D.position;
    const speed = car.speed; // signed forward m/s
    const n = this.n, wps = this.wps;
    this.stuckTime = Math.abs(speed) < 2 ? this.stuckTime + dt : 0;
    this.airTime = car.wheelsInContact === 0 ? this.airTime + dt : 0;

    // Advance our index to the nearest waypoint within a local window. If we've
    // somehow desynced (big crash / spin) and the nearest is far, rescan fully.
    this.i = nearestIndex(wps, p.x, p.z, this.i, 16);
    const near = wps[this.i];
    if ((near.x - p.x) ** 2 + (near.z - p.z) ** 2 > 60 * 60) {
      this.i = nearestIndex(wps, p.x, p.z);
    }

    // --- Steering: a Stanley-style controller that converges to the line, so on
    //     a straight the steer returns to ~0 (no constant scrub). It blends a
    //     heading term (aim where the line is going, look-ahead so it anticipates
    //     corners) with a cross-track term (pull back onto the line). ---
    // Look-ahead point gives the path heading to aim at.
    const Ld = this.lookBase + this.lookSpeed * Math.max(0, speed);
    let acc = 0, j = this.i, prev = wps[this.i];
    while (acc < Ld) {
      const nx = wps[(j + 1) % n];
      acc += Math.hypot(nx.x - prev.x, nx.z - prev.z);
      prev = nx; j = (j + 1) % n;
    }
    const ahead = prev;
    const pathHeading = Math.atan2(ahead.x - p.x, ahead.z - p.z);
    let headErr = wrap(pathHeading - car.heading);

    // Cross-track: signed perpendicular offset from the line tangent at our index.
    const a0 = wps[this.i], b0 = wps[(this.i + 1) % n];
    const tx = b0.x - a0.x, tz = b0.z - a0.z;
    const tl = Math.hypot(tx, tz) || 1;
    const cross = ((p.x - a0.x) * tz - (p.z - a0.z) * tx) / tl; // + = one side, − = other
    let crossTerm = Math.atan2(this.crossGain * cross, this.crossSoft + Math.abs(speed));
    crossTerm = Math.max(-this.crossCap, Math.min(this.crossCap, crossTerm)); // never full-lock alone

    // steerAngle in radians → normalise to the car's lock; smooth to kill jitter.
    const steerAngle = headErr * this.headGain + crossTerm * this.crossSign;
    const rawSteer = Math.max(-1, Math.min(1, steerAngle / this.car.maxSteerAngle));
    this._steer += (rawSteer - this._steer) * Math.min(1, this.steerSmooth * dt * 60);
    if (Math.abs(this._steer) < 0.02) this._steer = 0; // deadzone → no idle scrub

    // --- Target speed: slowest corner limit within braking distance (brake early) ---
    const brakeDist = 16 + (speed * speed) / 6; // rough v²/2a look-ahead
    let limit = this._cornerSpeed[this.i % n];
    let d = 0, k = this.i;
    while (d < brakeDist) {
      limit = Math.min(limit, this._cornerSpeed[k % n]);
      const a = wps[k % n], b = wps[(k + 1) % n];
      d += Math.hypot(b.x - a.x, b.z - a.z);
      k++;
    }
    let targetSpeed = limit * (0.9 + 0.1 * this.skill);

    let throttle, handbrake = false;

    // --- Stuck / recovery: reverse-and-reaim, then crawl out. _recover is clamped
    //     at 0 so the stuck timer can always re-arm (a negative value reads as
    //     truthy and would wedge the car forever). After backing up we enter a
    //     brief "caution" so it eases past the trouble spot instead of flooring
    //     it back into the same wall. ---
    if (this._recover > 0) {
      this._recover = Math.max(0, this._recover - dt);
      this._steer = Math.max(-1, Math.min(1, -headErr)); // reverse → invert steer to re-aim
      if (this._recover === 0) this._caution = 3.5;
      return { throttle: -1, steer: this._steer, handbrake: false };
    }
    if (Math.abs(speed) < 1.5) this._stuck += dt; else this._stuck = 0;
    if (this._stuck > 1.2) { this._recover = 1.2; this._stuck = 0; }
    if (this._caution > 0) { this._caution = Math.max(0, this._caution - dt); targetSpeed = Math.min(targetSpeed, 13); }

    if (speed < targetSpeed) {
      throttle = 1;
    } else {
      // Over the limit: lift / brake proportional to the overshoot.
      const over = (speed - targetSpeed) / Math.max(6, targetSpeed);
      throttle = over > 0.12 ? -1 : 0;
    }
    // Ease throttle when cranking the wheel hard so it doesn't power-spin.
    if (throttle > 0 && Math.abs(this._steer) > 0.7) throttle = 0.6;

    // Running wide: if we're off the line (understeering toward a wall), lift and
    // then brake so the car scrubs speed and can turn back — this is what stops it
    // ploughing into the outside of corners in the narrow walled lanes.
    const off = Math.abs(cross);
    if (off > 4) throttle = Math.min(throttle, 0);
    if (off > 6 && speed > this.vmin) throttle = -1;

    return { throttle, steer: this._steer, handbrake };
  }
}

function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
