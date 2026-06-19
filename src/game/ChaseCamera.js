import * as THREE from 'three';

/**
 * Third-person chase camera that trails behind the car and looks slightly ahead.
 * Positions are smoothed so it eases behind the car as it turns.
 */
export class ChaseCamera {
  /**
   * @param {THREE.Camera} camera
   * @param {import('./Car.js').Car} car
   */
  constructor(camera, car) {
    this.camera = camera;
    this.car = car;

    const L = car.size.z || 80;
    this.distance = L * 2.6; // behind
    this.height = (car.size.y || 20) * 3.2; // above
    this.lookAhead = L * 1.2;

    this._desired = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._initDone = false;
  }

  update(dt) {
    const car = this.car.object3D;
    const heading = this.car.heading;

    // Behind the car relative to its heading.
    const back = this._tmp.set(-Math.sin(heading), 0, -Math.cos(heading));
    this._desired
      .copy(car.position)
      .addScaledVector(back, this.distance)
      .add(new THREE.Vector3(0, this.height, 0));

    // Look a bit ahead of the car.
    const fwd = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    this._look
      .copy(car.position)
      .addScaledVector(fwd, this.lookAhead)
      .add(new THREE.Vector3(0, this.car.size.y * 0.6, 0));

    if (!this._initDone) {
      this.camera.position.copy(this._desired);
      this._initDone = true;
    } else {
      // Critically-damped-ish follow.
      const t = Math.min(1, dt * 5);
      this.camera.position.lerp(this._desired, t);
    }
    this.camera.lookAt(this._look);
  }
}
