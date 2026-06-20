import { nearestIndex } from './trackPath.js';

/**
 * AI opponent driver — a smooth racing-line follower.
 *
 * Rather than fight raycast-vehicle physics (which spins out and beaches on this
 * big walled circuit), the AI car is moved *kinematically* along the precomputed
 * racing line: it advances by arc length at a speed that eases toward a
 * curvature-derived limit (slow for corners, fast on straights). This can never
 * spin, reverse by accident, or get stuck — it just drives the line. The car is a
 * kinematic rigid body, so it still collides with / nudges the player.
 *
 * `update(dt)` returns the pose to apply: { x, y, z, heading, speed, steer }.
 */
export class AIDriver {
  /**
   * @param {import('./Vehicle.js').Vehicle} vehicle
   * @param {{x:number,z:number,y?:number}[]} waypoints  ordered loop, driving dir
   * @param {object} [opts]
   */
  constructor(vehicle, waypoints, opts = {}) {
    this.car = vehicle;
    this.wps = waypoints;
    this.n = waypoints.length;

    // Cumulative arc length along the loop (for arc-length parameterisation).
    this.cum = new Array(this.n);
    let L = 0;
    for (let i = 0; i < this.n; i++) {
      this.cum[i] = L;
      const a = waypoints[i], b = waypoints[(i + 1) % this.n];
      L += Math.hypot(b.x - a.x, b.z - a.z);
    }
    this.total = L;

    this.skill = opts.skill ?? 1;
    this.vmax = opts.vmax ?? vehicle.topSpeed * 0.8; // m/s on the straights
    this.vmin = opts.vmin ?? 16; // m/s through the tightest corner
    this.latAccel = opts.latAccel ?? 12; // m/s² cornering budget (sets corner speeds)
    this.accel = opts.accel ?? 13; // m/s² pick-up
    this.decel = opts.decel ?? 24; // m/s² braking
    this.lateralOffset = opts.lateralOffset ?? 0; // m sideways from the line (spreads bots out)

    this._cornerSpeed = this._computeCornerSpeeds();
    this.startIndex = nearestIndex(waypoints, vehicle.object3D.position.x, vehicle.object3D.position.z);
    this.reset();
  }

  reset() {
    this.dist = this.cum[this.startIndex];
    this.speed = 0;
    this.steer = 0;
    this._idx = this.startIndex;
  }

  /** Per-waypoint speed limit from curvature, at two baselines (kink + sweeper). */
  _computeCornerSpeeds() {
    const n = this.n, wps = this.wps;
    const spacing = this.total / n;
    const W = Math.max(1, Math.round(70 / spacing));
    const lat = this.latAccel * (0.7 + 0.3 * this.skill);
    const speedAt = (i, half) => {
      const a = wps[(i - half + n) % n], b = wps[i], c = wps[(i + half) % n];
      const ax = b.x - a.x, az = b.z - a.z, bx = c.x - b.x, bz = c.z - b.z;
      const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
      let dot = (ax * bx + az * bz) / (la * lb);
      dot = Math.max(-1, Math.min(1, dot));
      const turn = Math.acos(dot);
      const radius = turn > 1e-3 ? ((la + lb) / 2) / turn : 1e6;
      return Math.sqrt(lat * radius);
    };
    const raw = new Array(n);
    for (let i = 0; i < n; i++) {
      raw[i] = Math.max(this.vmin, Math.min(this.vmax, Math.min(speedAt(i, W), speedAt(i, 3 * W))));
    }
    // Min-smooth so the limit applies a little before/after the apex.
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      let m = Infinity;
      for (let k = -W; k <= W; k++) m = Math.min(m, raw[(i + k + n) % n]);
      out[i] = m;
    }
    return out;
  }

  /** Waypoint index at arc-length d (advances the cached cursor). */
  _indexAt(d) {
    let i = this._idx;
    // step forward while the next waypoint is still behind d
    for (let s = 0; s < this.n; s++) {
      const next = (i + 1) % this.n;
      const cNext = next === 0 ? this.total : this.cum[next];
      if (d < cNext) break;
      i = next;
    }
    this._idx = i;
    return i;
  }

  /** Interpolated pose (x, y, z, heading) at arc-length d. */
  _poseAt(d) {
    const n = this.n, i = this._indexAt(d), j = (i + 1) % n;
    const a = this.wps[i], b = this.wps[j];
    const segLen = (j === 0 ? this.total : this.cum[j]) - this.cum[i] || 1;
    const f = Math.max(0, Math.min(1, (d - this.cum[i]) / segLen));
    const x = a.x + (b.x - a.x) * f;
    const z = a.z + (b.z - a.z) * f;
    const ay = a.y ?? 0, by = b.y ?? ay;
    const y = ay + (by - ay) * f;
    return { x, y, z, i };
  }

  /** @returns {{x,y,z,heading,speed,steer}} pose to apply to the kinematic car. */
  update(dt) {
    // Target speed: the slowest corner limit within our braking distance.
    const i = this._indexAt(this.dist);
    const brakeDist = 10 + (this.speed * this.speed) / (2 * this.decel);
    let target = this._cornerSpeed[i];
    let d = 0, k = i;
    while (d < brakeDist) {
      target = Math.min(target, this._cornerSpeed[k % this.n]);
      const a = this.wps[k % this.n], b = this.wps[(k + 1) % this.n];
      d += Math.hypot(b.x - a.x, b.z - a.z);
      k++;
    }

    // Ease speed toward the target (accel/brake limited) and advance along the line.
    if (this.speed < target) this.speed = Math.min(target, this.speed + this.accel * dt);
    else this.speed = Math.max(target, this.speed - this.decel * dt);
    this.dist = (this.dist + this.speed * dt) % this.total;

    // Pose now, and a look-ahead point to derive a smooth heading.
    const here = this._poseAt(this.dist);
    const ahead = this._poseAt((this.dist + Math.max(6, this.speed * 0.3)) % this.total);
    const heading = Math.atan2(ahead.x - here.x, ahead.z - here.z);

    // Visual steer: ease toward the heading change rate (just for the front wheels).
    let dh = heading - (this._lastHeading ?? heading);
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this._lastHeading = heading;
    const targetSteer = Math.max(-0.5, Math.min(0.5, dh / Math.max(dt, 1e-3) * 0.25));
    this.steer += (targetSteer - this.steer) * Math.min(1, 6 * dt);

    // Shift sideways from the line (so a pack of bots spreads across the lane).
    const offX = Math.cos(heading) * this.lateralOffset;
    const offZ = -Math.sin(heading) * this.lateralOffset;
    return { x: here.x + offX, y: here.y, z: here.z + offZ, heading, speed: this.speed, steer: this.steer };
  }
}
