import * as THREE from 'three';

/**
 * Close third-person chase camera with a FIXED follow distance.
 *
 * The camera always sits exactly `distance` behind the car horizontally (plus a
 * fixed height), so accelerating never changes how far back it is — there is no
 * spring/lerp on the distance. Only the trailing *angle* eases toward the car's
 * heading, which keeps turns smooth while the radius stays constant.
 */
export class ChaseCamera {
  /**
   * @param {THREE.Camera} camera
   * @param {import('./Car.js').Car} car
   */
  constructor(camera, car) {
    this.camera = camera;
    this.car = car;

    const L = car.size.z || 22;
    const H = car.size.y || 5;

    // Close, fixed rig.
    this.distance = L * 1.5; // horizontal trail distance (constant)
    this.height = H * 1.7; // height above the car
    this.lookAhead = L * 0.6; // aim a little ahead of the car
    this.lookHeight = H * 0.8;
    this.headingEase = 6; // how fast the trailing angle catches turns

    this.followHeading = car.heading;
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._init = false;
  }

  update(dt) {
    const carPos = this.car.object3D.position;

    // Ease the trailing ANGLE toward the car's heading (smooth turns), but keep
    // the distance fixed so speed never changes the framing.
    if (!this._init) {
      this.followHeading = this.car.heading;
      this._init = true;
    } else {
      this.followHeading = dampAngle(
        this.followHeading,
        this.car.heading,
        1 - Math.exp(-this.headingEase * dt)
      );
    }

    // Position: exactly `distance` behind the trailing heading, at fixed height.
    const h = this.followHeading;
    this._pos.set(
      carPos.x - Math.sin(h) * this.distance,
      carPos.y + this.height,
      carPos.z - Math.cos(h) * this.distance
    );
    this.camera.position.copy(this._pos);

    // Look slightly ahead of the car using its actual heading.
    const ch = this.car.heading;
    this._look.set(
      carPos.x + Math.sin(ch) * this.lookAhead,
      carPos.y + this.lookHeight,
      carPos.z + Math.cos(ch) * this.lookAhead
    );
    this.camera.lookAt(this._look);
  }
}

/** Interpolate an angle toward a target along the shortest path. */
function dampAngle(current, target, t) {
  let d = target - current;
  d = Math.atan2(Math.sin(d), Math.cos(d)); // wrap to [-π, π]
  return current + d * t;
}
