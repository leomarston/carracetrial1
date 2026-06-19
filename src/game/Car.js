import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Drivable car.
 *
 * Collision model (car vs. map):
 *   The car follows the map surface using downward raycasts (the map is a
 *   594-mesh, ~21k-tri static mesh, so a couple of rays per frame is cheap).
 *   Every frame we sample the ground under the car's *intended* next position:
 *     - no surface there  -> blocked (don't drive off the edge of the world)
 *     - surface too high   -> blocked (a wall / the side of a building)
 *     - otherwise          -> move, and snap the car's height to that surface
 *       and tilt it to the surface normal.
 *   This is "proper" collision against the actual map geometry, not a flat plane.
 *
 * Driving (arcade): throttle accelerates along the heading, steering rotates the
 * heading (more effective the faster you go), with drag + ground friction.
 */
export class Car {
  /**
   * @param {THREE.Object3D[]} collidables  meshes to drive on (the map).
   * @param {object} [opts]
   * @param {number} [opts.targetWidth] desired car width in world units (preferred:
   *   sized to the road). Falls back to targetLength when omitted.
   * @param {number} [opts.targetLength=80] desired car length in world units.
   * @param {boolean} [opts.flip=false] rotate model 180° if its nose points -Z.
   */
  constructor(collidables, opts = {}) {
    this.collidables = collidables;
    this.targetWidth = opts.targetWidth ?? null;
    this.targetLength = opts.targetLength ?? 80;
    this.flip = opts.flip ?? false;

    // Pivot that we actually move/steer; the model is parented under it with
    // its wheels at y=0 and centered in x/z.
    this.object3D = new THREE.Group();
    this.object3D.name = 'Car';

    // Kinematic state
    this.heading = 0; // yaw, radians (0 = +Z)
    this.speed = 0; // signed units/sec along heading
    this.size = new THREE.Vector3(); // world size after scaling

    // Driving tuning (units/sec). Tuned for this map's ~19-unit-wide roads.
    this.maxSpeed = 600;
    this.maxReverse = 180;
    this.accel = 420;
    this.brakeDecel = 800;
    this.dragCoeff = 0.7; // passive slow-down per second (fraction)
    this.rollFriction = 160; // units/sec^2 when coasting
    this.maxSteer = 1.7; // rad/sec at full effectiveness

    // Collision tuning (set from size once loaded)
    this.rayUp = 200;
    this.maxStepUp = 25;

    this._ray = new THREE.Raycaster();
    this._down = new THREE.Vector3(0, -1, 0);
    this._tmp = new THREE.Vector3();
    this._upQuat = new THREE.Quaternion();
    this.groundNormal = new THREE.Vector3(0, 1, 0);
  }

  async load(url) {
    const gltf = await new Promise((res, rej) =>
      new GLTFLoader().load(url, res, undefined, rej)
    );
    const model = gltf.scene;

    // Measure native size (the Sketchfab matrix already baked in its 100x scale).
    // native.x = width, native.y = height, native.z = length.
    model.updateWorldMatrix(true, true);
    let box = new THREE.Box3().setFromObject(model);
    const native = box.getSize(new THREE.Vector3());

    // Prefer sizing by width (the road is the constraint); else by longest axis.
    const scale = this.targetWidth
      ? this.targetWidth / native.x
      : this.targetLength / Math.max(native.x, native.y, native.z);
    model.scale.setScalar(scale);

    if (this.flip) model.rotateY(Math.PI);

    // Recenter: wheels on the ground (min.y -> 0), centered in x/z.
    model.updateWorldMatrix(true, true);
    box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);

    // Final size in world units.
    model.updateWorldMatrix(true, true);
    this.size.copy(new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()));

    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
      }
    });

    this.object3D.add(model);
    this.model = model;

    // Derive collision + physics scale from the actual car size.
    const L = this.size.z; // length
    const H = this.size.y; // height
    this.rayUp = Math.max(H * 4, 60);
    this.maxStepUp = H * 0.6; // can climb curbs/ramps, not walls
    return this;
  }

  /**
   * Place the car at (x,z); its height is snapped to the map surface.
   * If expectedY is given (e.g. the analysed road height), the surface nearest
   * that height is chosen — robust when a gantry/bridge sits above the spawn.
   */
  placeAt(x, z, headingRad = 0, expectedY = null) {
    this.heading = headingRad;
    const originY = (expectedY ?? this.object3D.position.y) + 2000;
    this._ray.set(this._tmp.set(x, originY, z), this._down);
    this._ray.far = 6000;
    const hits = this._ray.intersectObjects(this.collidables, false);
    let chosen = null;
    if (hits.length) {
      chosen = expectedY != null
        ? hits.reduce((a, b) =>
            Math.abs(b.point.y - expectedY) < Math.abs(a.point.y - expectedY) ? b : a)
        : hits[0];
    }
    const y = chosen ? chosen.point.y : (expectedY ?? 0);
    this.object3D.position.set(x, y, z);
    if (chosen) this.groundNormal.copy(this._normalOf(chosen));
    this._applyOrientation(1);
  }

  /** @param {{throttle:number, steer:number, handbrake:boolean}} input */
  update(dt, input) {
    if (!this.model || dt <= 0) return;
    dt = Math.min(dt, 0.05); // clamp huge frames so physics stays stable

    const throttle = input.throttle ?? 0;
    const steer = input.steer ?? 0;

    // --- Longitudinal dynamics ---
    if (throttle > 0) {
      this.speed += this.accel * throttle * dt;
    } else if (throttle < 0) {
      // braking if moving forward, otherwise reverse
      if (this.speed > 1) this.speed -= this.brakeDecel * dt;
      else this.speed += this.accel * throttle * dt; // throttle<0 -> reverse
    } else {
      // coasting: roll friction toward 0
      const f = this.rollFriction * dt;
      this.speed = Math.abs(this.speed) <= f ? 0 : this.speed - Math.sign(this.speed) * f;
    }
    if (input.handbrake) {
      const f = this.brakeDecel * 1.5 * dt;
      this.speed = Math.abs(this.speed) <= f ? 0 : this.speed - Math.sign(this.speed) * f;
    }
    this.speed *= 1 - this.dragCoeff * dt;
    this.speed = THREE.MathUtils.clamp(this.speed, -this.maxReverse, this.maxSpeed);

    // --- Steering (only meaningful while moving; scales with speed) ---
    if (Math.abs(this.speed) > 1) {
      const speedFactor = Math.min(1, Math.abs(this.speed) / (this.maxSpeed * 0.35));
      const dir = Math.sign(this.speed); // reverse inverts steering, like a real car
      this.heading += steer * this.maxSteer * speedFactor * dir * dt;
    }

    // --- Proposed move ---
    const fwd = this._tmp.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    const cur = this.object3D.position;
    const nx = cur.x + fwd.x * this.speed * dt;
    const nz = cur.z + fwd.z * this.speed * dt;

    // --- Collision vs. map: sample ground at the target position ---
    const g = this._sampleGround(nx, nz, cur.y);
    if (!g) {
      // Edge of the world / hole — stop here.
      this.speed = 0;
      this._applyOrientation(dt);
      return;
    }
    if (g.tooHigh) {
      // Wall / curb / building side too high to climb — block, bounce back.
      this.speed *= -0.1;
      this._applyOrientation(dt);
      return;
    }

    cur.set(nx, g.y, nz);
    this.groundNormal.copy(g.normal);
    this._applyOrientation(dt);
  }

  /**
   * Find the surface the car should rest on at (x,z). Casts straight down from
   * high above and returns the highest hit no more than `maxStepUp` above
   * `refY`, so overhead structures (the start gantry, tunnel ceilings, bridges
   * overhead) are ignored while still following the road up curbs/ramps.
   *   - {y, normal} : a drivable surface
   *   - {tooHigh:true} : only walls/curbs too high to climb here
   *   - null : nothing below at all (edge of the world)
   */
  _sampleGround(x, z, refY = this.object3D.position.y) {
    this._ray.set(this._tmp.set(x, refY + 2000, z), this._down);
    this._ray.far = 4000;
    const hits = this._ray.intersectObjects(this.collidables, false);
    if (!hits.length) return null;
    const ceil = refY + this.maxStepUp;
    // hits are ordered nearest-first (top-down, descending y)
    for (const h of hits) {
      if (h.point.y <= ceil) return { y: h.point.y, normal: this._normalOf(h) };
    }
    return { tooHigh: true };
  }

  _normalOf(hit) {
    return hit.face
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
      : new THREE.Vector3(0, 1, 0);
  }

  /** Yaw to heading + smoothly tilt the car onto the ground normal. */
  _applyOrientation(dt) {
    // Target orientation: up = ground normal, forward = heading projected.
    const up = this.groundNormal;
    const fwd = this._tmp.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    // Remove the up-component from forward so the basis is orthonormal.
    fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const m = new THREE.Matrix4().makeBasis(right, up, fwd);
    const targetQuat = this._upQuat.setFromRotationMatrix(m);

    // Smooth toward target (snappy yaw, gentle tilt).
    const t = dt > 0 ? Math.min(1, dt * 12) : 1;
    this.object3D.quaternion.slerp(targetQuat, t);
  }
}
