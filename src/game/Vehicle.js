import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Physics-driven car built on Rapier's DynamicRayCastVehicleController
 * (a bullet-style raycast vehicle): a dynamic chassis rigid-body with four
 * ray-cast wheels providing suspension, grip and weight transfer.
 *
 * Units are metres / kilograms / Newtons (1 world unit = 1 m).
 */
export class Vehicle {
  /**
   * @param {import('../physics/PhysicsWorld.js').PhysicsWorld} physics
   * @param {object} [opts] { targetWidth, flip }
   */
  constructor(physics, opts = {}) {
    this.physics = physics;
    this.world = physics.world;
    this.targetWidth = opts.targetWidth ?? 2.8;
    this.flip = opts.flip ?? false;

    // Visual root, synced from the chassis each frame (origin = chassis centre).
    this.object3D = new THREE.Group();
    this.object3D.name = 'Vehicle';

    this.size = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0; // signed forward speed (m/s)

    // Input (set each frame from Controls), consumed in the fixed step.
    this.input = { throttle: 0, steer: 0, handbrake: false };
    this._steerAngle = 0; // smoothed current steering angle (rad)

    // --- Tuning (simcade) ---
    this.mass = 850; // kg
    this.maxEngineForce = 9000; // N (total, split across driven wheels)
    this.maxBrakeForce = 5000;
    this.maxSteerAngle = 0.5; // rad (~29°) at low speed
    this.steerSpeed = 4.0; // how fast steering eases to target
    this.topSpeed = 75; // m/s soft cap (~270 km/h) via engine-force falloff
    this.drivenWheels = 'rear'; // 'rear' | 'all'

    // Suspension / tyre (set per wheel in _addWheels)
    this.suspension = {
      stiffness: 36,
      compression: 1.8,
      relaxation: 2.6,
      restLength: 0.0, // set from geometry
      maxTravel: 0.0, // set from geometry
      maxForce: 30000,
      frictionSlip: 2.2, // grip; higher = more
      sideFriction: 1.0,
    };

    this._tmpV = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this.wheels = []; // { mesh? , isFront, isLeft }
  }

  async load(url, spawn) {
    const gltf = await new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, rej));
    const model = gltf.scene;

    // Scale by width (native.x), recenter so wheels sit at y=0 & centred, flip nose.
    model.updateWorldMatrix(true, true);
    const native = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    model.scale.setScalar(this.targetWidth / native.x);
    if (this.flip) model.rotateY(Math.PI);
    model.updateWorldMatrix(true, true);
    let box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z); // bottom at 0, centred
    model.updateWorldMatrix(true, true);
    this.size.copy(new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()));

    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });

    // Parent the model under object3D, shifted down so object3D origin = car centre.
    model.position.y -= this.size.y / 2;
    this.object3D.add(model);
    this.model = model;

    this._createChassis(spawn);
    this._addWheels();
    return this;
  }

  _createChassis(spawn) {
    const s = this.size;
    const heading = spawn.heading ?? 0;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);

    // Spawn a little above the ground so the suspension settles onto the road.
    const startY = (spawn.y ?? 0) + s.y / 2 + 0.4;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.x, startY, spawn.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinearDamping(0.1)
      .setAngularDamping(0.6)
      .setCcdEnabled(true) // don't tunnel through walls at speed
      .setCanSleep(false);
    this.chassis = this.world.createRigidBody(bodyDesc);

    // Chassis collider: a cuboid a bit smaller than the body, mass set explicitly.
    const hx = s.x * 0.45, hy = s.y * 0.34, hz = s.z * 0.47;
    const volume = (2 * hx) * (2 * hy) * (2 * hz);
    const colDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setDensity(this.mass / volume)
      .setFriction(0.6)
      .setRestitution(0.1);
    this.world.createCollider(colDesc, this.chassis);

    this.controller = this.world.createVehicleController(this.chassis);
    this.controller.indexUpAxis = 1; // Y up
    // NOTE: the JS binding's forward-axis setter is mis-named; assign to set it.
    this.controller.setIndexForwardAxis = 2; // Z forward
  }

  _addWheels() {
    const s = this.size;
    const sus = this.suspension;
    const wheelRadius = s.y * 0.35;
    sus.restLength = s.y * 0.28;
    sus.maxTravel = s.y * 0.22;

    const trackHalf = s.x * 0.42; // left/right offset
    const baseHalf = s.z * 0.36; // front/rear offset
    // Connection point height (chassis-local): so the wheel rests on the ground.
    const connY = -s.y / 2 + wheelRadius + sus.restLength;

    const dir = { x: 0, y: -1, z: 0 }; // suspension casts straight down
    const axle = { x: -1, y: 0, z: 0 }; // wheel spins about local X

    // +Z = front (nose). order: FL, FR, RL, RR
    const defs = [
      { x: +trackHalf, z: +baseHalf, isFront: true, isLeft: true },
      { x: -trackHalf, z: +baseHalf, isFront: true, isLeft: false },
      { x: +trackHalf, z: -baseHalf, isFront: false, isLeft: true },
      { x: -trackHalf, z: -baseHalf, isFront: false, isLeft: false },
    ];

    this.wheels = [];
    defs.forEach((d, i) => {
      this.controller.addWheel({ x: d.x, y: connY, z: d.z }, dir, axle, sus.restLength, wheelRadius);
      this.controller.setWheelSuspensionStiffness(i, sus.stiffness);
      this.controller.setWheelSuspensionCompression(i, sus.compression);
      this.controller.setWheelSuspensionRelaxation(i, sus.relaxation);
      this.controller.setWheelMaxSuspensionTravel(i, sus.maxTravel);
      this.controller.setWheelMaxSuspensionForce(i, sus.maxForce);
      this.controller.setWheelFrictionSlip(i, sus.frictionSlip);
      this.controller.setWheelSideFrictionStiffness(i, sus.sideFriction);
      this.wheels.push({ ...d, radius: wheelRadius });
    });
  }

  setInput(input) { this.input = input; }

  /** Runs once per FIXED physics step (before world.step). */
  fixedUpdate(h) {
    if (!this.controller) return;
    const fwdSpeed = this._forwardSpeed();

    // --- Steering: ease toward target, less lock at speed ---
    const speedFactor = 1 - Math.min(0.7, Math.abs(fwdSpeed) / this.topSpeed);
    const target = this.input.steer * this.maxSteerAngle * speedFactor;
    this._steerAngle += (target - this._steerAngle) * Math.min(1, this.steerSpeed * h);

    // --- Throttle / brake / reverse ---
    const throttle = this.input.throttle;
    let engineForce = 0;
    let brake = 0;
    if (throttle > 0) {
      // engine force tapers to 0 near top speed
      const taper = Math.max(0, 1 - Math.max(0, fwdSpeed) / this.topSpeed);
      engineForce = throttle * this.maxEngineForce * taper;
    } else if (throttle < 0) {
      if (fwdSpeed > 0.5) brake = this.maxBrakeForce; // braking
      else engineForce = throttle * this.maxEngineForce * 0.5; // reverse (slower)
    }
    if (this.input.handbrake) brake = Math.max(brake, this.maxBrakeForce * 1.2);

    const driveAll = this.drivenWheels === 'all';
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      // steering on front wheels
      this.controller.setWheelSteering(i, w.isFront ? this._steerAngle : 0);
      // engine on driven wheels
      const driven = driveAll || !w.isFront;
      this.controller.setWheelEngineForce(i, driven ? engineForce / (driveAll ? 4 : 2) : 0);
      // brakes: front-biased; handbrake mostly rear
      let b = brake * (w.isFront ? 0.6 : 0.4);
      if (this.input.handbrake) b = w.isFront ? 0 : this.maxBrakeForce;
      this.controller.setWheelBrake(i, b);
    }

    this.controller.updateVehicle(h);
  }

  /** Sync the visual model from the chassis (call each render frame). */
  syncVisual() {
    if (!this.chassis) return;
    const t = this.chassis.translation();
    const r = this.chassis.rotation();
    this.object3D.position.set(t.x, t.y, t.z);
    this.object3D.quaternion.set(r.x, r.y, r.z, r.w);

    // Derived state for camera / HUD.
    this._fwd.set(0, 0, 1).applyQuaternion(this.object3D.quaternion);
    this.heading = Math.atan2(this._fwd.x, this._fwd.z);
    this.speed = this._forwardSpeed();
  }

  _forwardSpeed() {
    const lv = this.chassis.linvel();
    const r = this.chassis.rotation();
    // forward = rotate (0,0,1) by chassis quaternion
    this._fwd.set(0, 0, 1).applyQuaternion(this._tmpQ(r));
    return lv.x * this._fwd.x + lv.y * this._fwd.y + lv.z * this._fwd.z;
  }

  _tmpQ(r) {
    this._q = this._q || new THREE.Quaternion();
    return this._q.set(r.x, r.y, r.z, r.w);
  }

  /** Reset the car upright at a position (e.g. respawn). */
  resetTo(x, y, z, heading = 0) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    this.chassis.setTranslation({ x, y: y + this.size.y / 2 + 0.4, z }, true);
    this.chassis.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
}
