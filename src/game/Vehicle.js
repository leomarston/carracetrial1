import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { statsToTuning, gearTopSpeeds } from './cars.js';

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
   * @param {object} carConfig  entry from cars.js (url, targetWidth, flip, mass, stats)
   */
  constructor(physics, carConfig = {}) {
    this.physics = physics;
    this.world = physics.world;
    this.config = carConfig;
    this.name = carConfig.name ?? 'Car';
    this.stats = carConfig.stats ?? { speed: 6, acceleration: 6, grip: 6, braking: 6, handling: 6 };
    this.targetWidth = carConfig.targetWidth ?? 2.8;
    this.flip = carConfig.flip ?? false;
    this.mass = carConfig.mass ?? 850;

    // Visual root, synced from the chassis each frame (origin = chassis centre).
    this.object3D = new THREE.Group();
    this.object3D.name = 'Vehicle';

    this.size = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0; // signed forward speed (m/s)

    // Input (set each frame from Controls), consumed in the fixed step.
    this.input = { throttle: 0, steer: 0, handbrake: false };
    this._steerAngle = 0; // smoothed current steering angle (rad)

    // --- Physics tuning derived from the car's 0–10 ratings ---
    const t = statsToTuning(this.stats);
    this.maxEngineForce = t.maxEngineForce;
    this.maxBrakeForce = t.maxBrakeForce;
    this.topSpeed = t.topSpeed; // m/s soft cap via engine-force falloff
    this.steerSpeed = t.steerSpeed;
    this.angularDamping = t.angularDamping;
    this.maxSteerAngle = 0.55; // rad lock at low speed
    this.drivenWheels = 'rear'; // RWD → power oversteer

    this.suspension = {
      stiffness: 34,
      compression: 1.8,
      relaxation: 2.6,
      restLength: 0.0,
      maxTravel: 0.0,
      maxForce: 30000,
      frictionSlip: t.frictionSlip, // grip; higher = more traction
      sideFriction: t.sideFriction,
    };

    this._tmpV = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this.wheels = []; // { isFront, isLeft, radius }

    // --- Feel signals (updated each frame, consumed by camera/audio/effects/HUD) ---
    this.rpm = 1100;
    this.gear = 1; // 0 = reverse
    this.lateralSlip = 0; // 0..1 sideways sliding
    this.wheelSlip = 0; // 0..1 traction loss (spin/lock)
    this.steer = 0; // current visual steering angle (rad)
    this.braking = false;
    this.wheelsInContact = 0;
    this.engine = { idle: 1200, redline: 8200, gearTopKmh: gearTopSpeeds(this.topSpeed) };

    // Wheel + light animation state
    this._spinAngle = 0;
    this._wheelPivots = []; // { pivot, spinAxis, upAxis, isFront }
    this._brakeMats = [];
    this._q1 = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
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

    this._setupWheelsAndLights();
    this._createChassis(spawn);
    this._addWheels();
    return this;
  }

  /** Find the 4 tyre meshes (to spin/steer) and the brake-light materials. */
  _setupWheelsAndLights() {
    this.object3D.updateWorldMatrix(true, true);

    // Brake lights. NOTE: the big body shell uses the (misnamed) 'BackLight'
    // material, so we must NOT emit on it. Only the small rear-light meshes
    // (tiny 'BackLight' meshes) and the red 'glossyorange' accent should glow —
    // and we clone their materials so emitting doesn't tint the shared body.
    this._brakeMats = [];
    this.model.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      const name = o.material.name;
      const verts = o.geometry.attributes.position.count;
      const isLight = (name === 'BackLight' && verts < 100) || name === 'glossyorange';
      if (!isLight) return;
      const mat = o.material.clone();
      if (!mat.emissive) mat.emissive = new THREE.Color(0x000000);
      mat.emissiveIntensity = 0;
      o.material = mat;
      this._brakeMats.push(mat);
    });

    // The 4 tyres are the *_black_0 meshes under WheelFront000..003.
    const tyres = [];
    this.model.traverse((o) => { if (o.isMesh && /^WheelFront00[0-3]_black/.test(o.name)) tyres.push(o); });
    if (tyres.length !== 4) return; // degrade gracefully (no wheel animation)

    const objQuat = this.object3D.getWorldQuaternion(new THREE.Quaternion());
    const lateralWorld = new THREE.Vector3(1, 0, 0).applyQuaternion(objQuat);
    const upWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(objQuat);
    const objInv = this.object3D.matrixWorld.clone().invert();

    for (const W of tyres) {
      W.geometry.computeBoundingBox();
      const centerMesh = W.geometry.boundingBox.getCenter(new THREE.Vector3());
      const P = W.parent;
      // Wheel centre in object-local space → front/rear by z sign.
      const wWorld = centerMesh.clone().applyMatrix4(W.matrixWorld);
      const isFront = wWorld.clone().applyMatrix4(objInv).z > 0;
      // Pivot at the wheel centre so spin/steer rotate it in place.
      const centerInP = centerMesh.clone().applyMatrix4(W.matrix);
      const pivot = new THREE.Group();
      pivot.position.copy(centerInP);
      P.add(pivot);
      pivot.attach(W); // keep world transform, reparent under pivot
      const pInv = P.getWorldQuaternion(new THREE.Quaternion()).invert();
      this._wheelPivots.push({
        pivot,
        spinAxis: lateralWorld.clone().applyQuaternion(pInv).normalize(),
        upAxis: upWorld.clone().applyQuaternion(pInv).normalize(),
        isFront,
      });
    }
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
      .setLinearDamping(0.04) // low drag → high top speed
      .setAngularDamping(this.angularDamping)
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

    // Near-neutral, slight understeer safety: the car slides/washes out when
    // pushed (slippery, momentum-y) but stays catchable on a keyboard.
    this.frontSide = sus.sideFriction * 0.97;
    this.rearSide = sus.sideFriction * 1.05;

    this.wheels = [];
    defs.forEach((d, i) => {
      this.controller.addWheel({ x: d.x, y: connY, z: d.z }, dir, axle, sus.restLength, wheelRadius);
      this.controller.setWheelSuspensionStiffness(i, sus.stiffness);
      this.controller.setWheelSuspensionCompression(i, sus.compression);
      this.controller.setWheelSuspensionRelaxation(i, sus.relaxation);
      this.controller.setWheelMaxSuspensionTravel(i, sus.maxTravel);
      this.controller.setWheelMaxSuspensionForce(i, sus.maxForce);
      this.controller.setWheelFrictionSlip(i, sus.frictionSlip);
      this.controller.setWheelSideFrictionStiffness(i, d.isFront ? this.frontSide : this.rearSide);
      this.wheels.push({ ...d, radius: wheelRadius });
    });
  }

  setInput(input) { this.input = input; }

  /** Runs once per FIXED physics step (before world.step). */
  fixedUpdate(h) {
    if (!this.controller) return;
    const fwdSpeed = this._forwardSpeed();
    const speedMs = Math.abs(fwdSpeed);

    // --- Steering: ease toward target. Lock falls off with speed so holding the
    //     key at speed gives a controllable drift instead of a snap-spin. ---
    const speedFactor = Math.max(0.18, 1 - speedMs / (this.topSpeed * 0.8));
    const target = this.input.steer * this.maxSteerAngle * speedFactor;
    this._steerAngle += (target - this._steerAngle) * Math.min(1, this.steerSpeed * h);

    // --- Throttle / brake / reverse ---
    const throttle = this.input.throttle;
    let engineForce = 0;
    let brake = 0;
    if (throttle > 0) {
      engineForce = throttle * this.maxEngineForce * Math.max(0, 1 - Math.max(0, fwdSpeed) / this.topSpeed);
    } else if (throttle < 0) {
      if (fwdSpeed > 0.5) brake = this.maxBrakeForce; // braking
      else engineForce = throttle * this.maxEngineForce * 0.45 * Math.max(0, 1 - speedMs / (this.topSpeed * 0.4)); // reverse
    }
    if (this.input.handbrake) brake = Math.max(brake, this.maxBrakeForce * 1.2);

    // Power oversteer: hard throttle (esp. at lower speed) breaks rear traction.
    const powerSlip = throttle > 0.55 && speedMs < this.topSpeed * 0.45
      ? (throttle - 0.55) * (1 - speedMs / (this.topSpeed * 0.45))
      : 0;
    const rearGrip = this.suspension.frictionSlip * (1 - 0.1 * Math.min(1, powerSlip));

    const driveAll = this.drivenWheels === 'all';
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      this.controller.setWheelSteering(i, w.isFront ? this._steerAngle : 0);
      const driven = driveAll || !w.isFront;
      this.controller.setWheelEngineForce(i, driven ? engineForce / (driveAll ? 4 : 2) : 0);
      if (!w.isFront) this.controller.setWheelFrictionSlip(i, rearGrip);
      let b = brake * (w.isFront ? 0.6 : 0.4);
      if (this.input.handbrake) b = w.isFront ? 0 : this.maxBrakeForce;
      this.controller.setWheelBrake(i, b);
    }

    // Feel flags for lights / effects / audio.
    this.braking = throttle < 0 || this.input.handbrake;
    this.wheelSlip = this.input.handbrake ? 1 : Math.min(1, powerSlip);

    this.controller.updateVehicle(h);
  }

  /** Sync the visual model + wheels + lights from the chassis (each render frame). */
  syncVisual(dt = 1 / 60) {
    if (!this.chassis) return;
    const t = this.chassis.translation();
    const r = this.chassis.rotation();
    this.object3D.position.set(t.x, t.y, t.z);
    this.object3D.quaternion.set(r.x, r.y, r.z, r.w);

    // Derived state for camera / HUD / audio.
    this._fwd.set(0, 0, 1).applyQuaternion(this.object3D.quaternion);
    this.heading = Math.atan2(this._fwd.x, this._fwd.z);
    this.speed = this._forwardSpeed();
    this.steer = this._steerAngle;

    const lv = this.chassis.linvel();
    const right = this._tmpV.set(1, 0, 0).applyQuaternion(this.object3D.quaternion);
    const lateralVel = lv.x * right.x + lv.y * right.y + lv.z * right.z;
    this.lateralSlip = Math.min(1, Math.abs(lateralVel) / 7);

    let contact = 0;
    for (let i = 0; i < this.wheels.length; i++) if (this.controller.wheelIsInContact(i)) contact++;
    this.wheelsInContact = contact;

    this._updateDrivetrain();
    this._animateWheels(dt);
    this._updateBrakeLights();
  }

  _updateDrivetrain() {
    const kmh = Math.abs(this.speed) * 3.6;
    const tops = this.engine.gearTopKmh;
    let g = 0;
    while (g < tops.length - 1 && kmh > tops[g]) g++;
    const lower = g > 0 ? tops[g - 1] : 0;
    const frac = Math.min(1, (kmh - lower) / Math.max(1, tops[g] - lower));
    let rpm = this.engine.idle + frac * (this.engine.redline - this.engine.idle);
    if (kmh < 3) rpm = this.engine.idle + Math.max(0, this.input.throttle) * 3200;
    this.rpm = rpm;
    this.gear = this.speed < -0.5 ? 0 : g + 1;
  }

  _animateWheels(dt) {
    if (!this._wheelPivots.length) return;
    const radius = this.size.y * 0.35;
    this._spinAngle += (this.speed / radius) * dt;
    for (const w of this._wheelPivots) {
      const spinQ = this._q1.setFromAxisAngle(w.spinAxis, this._spinAngle);
      if (w.isFront) {
        const steerQ = this._q2.setFromAxisAngle(w.upAxis, this.steer);
        w.pivot.quaternion.copy(steerQ).multiply(spinQ);
      } else {
        w.pivot.quaternion.copy(spinQ);
      }
    }
  }

  _updateBrakeLights() {
    const on = this.braking;
    for (const m of this._brakeMats) {
      m.emissive.setHex(on ? 0xff2200 : 0x000000);
      m.emissiveIntensity = on ? 2.5 : 0;
    }
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
