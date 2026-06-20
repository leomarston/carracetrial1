import * as THREE from 'three';

/**
 * Close third-person chase camera with a FIXED follow distance, plus driving
 * "feel" dynamics: speed-based FOV, look-into-corner, shake when slipping/over
 * rough ground, and a small dip under braking. Distance never changes with speed.
 */
export class ChaseCamera {
  /**
   * @param {THREE.Camera} camera
   * @param {import('./Vehicle.js').Vehicle} car
   */
  constructor(camera, car) {
    this.camera = camera;
    this.car = car;

    const L = car.size.z || 8;
    const H = car.size.y || 1.6;

    this.distance = L * 1.0; // constant horizontal trail distance (a bit behind)
    this.height = H * 1.9; // low, just above the roof
    this.lookAhead = L * 0.85;
    this.lookHeight = H * 0.8;
    this.headingEase = 6;

    // FOV: widens with speed for a sense of speed.
    this.baseFov = 60;
    this.maxFov = 78;
    this.fovRefSpeed = 60; // m/s at which FOV is maxed
    this.fov = this.baseFov;

    this.followHeading = car.heading;
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._shake = new THREE.Vector3();
    this._init = false;
  }

  update(dt) {
    const car = this.car;
    const carPos = car.object3D.position;
    const speed = Math.abs(car.speed);

    // Ease trailing angle toward heading; keep distance fixed.
    if (!this._init) { this.followHeading = car.heading; this._init = true; }
    else this.followHeading = dampAngle(this.followHeading, car.heading, 1 - Math.exp(-this.headingEase * dt));

    const h = this.followHeading;
    this._pos.set(
      carPos.x - Math.sin(h) * this.distance,
      carPos.y + this.height,
      carPos.z - Math.cos(h) * this.distance
    );

    // Speed-based FOV (eased).
    const targetFov = this.baseFov + (this.maxFov - this.baseFov) * Math.min(1, speed / this.fovRefSpeed);
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 3);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    // Camera shake: from sideways slip and from losing wheel contact (bumps),
    // scaled up with speed so it only kicks in when it should feel rough.
    const contactLoss = 1 - (car.wheelsInContact ?? 4) / 4;
    const shakeAmt = (car.lateralSlip * 0.5 + contactLoss * 0.8) * Math.min(1, speed / 25);
    if (shakeAmt > 0.001) {
      const a = shakeAmt * 0.25;
      this._shake.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
      this._pos.add(this._shake);
    }

    this.camera.position.copy(this._pos);

    // Look a bit ahead, and INTO the corner (offset toward steering direction).
    const ch = car.heading;
    this._right.set(Math.cos(ch), 0, -Math.sin(ch)); // car's right in world
    const cornerLook = (car.steer ?? 0) * 6; // metres of lateral look offset
    this._look.set(
      carPos.x + Math.sin(ch) * this.lookAhead - this._right.x * cornerLook,
      carPos.y + this.lookHeight,
      carPos.z + Math.cos(ch) * this.lookAhead - this._right.z * cornerLook
    );
    this.camera.lookAt(this._look);
  }
}

function dampAngle(current, target, t) {
  let d = target - current;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return current + d * t;
}
