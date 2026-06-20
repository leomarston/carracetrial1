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
    // Kinematic cars are moved along a path (the AI opponent) instead of being
    // driven by raycast-vehicle physics; they still collide with/nudge the player.
    this.kinematic = carConfig.kinematic ?? false;
    this.kinematicSpeed = 0;

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
    this.revving = false; // held at the line, blipping the throttle (pre-start)
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

    // Drop decorative meshes (e.g. emissive glow billboards) before measuring so
    // they neither float around the car nor inflate the bounding box / wheelbase.
    if (this.config.hideMeshes) {
      const re = this.config.hideMeshes;
      const drop = [];
      model.traverse((o) => { if (o.isMesh && re.test(o.name)) drop.push(o); });
      for (const m of drop) m.removeFromParent();
    }

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

    this._applyPaint();
    this._setupWheelsAndLights();
    this._createChassis(spawn);
    if (!this.kinematic) this._addWheels();
    return this;
  }

  /**
   * Tint the bodywork. These models ship a white/grayscale paint texture (just
   * baked shading) with a white base colour, so the car renders white/grey; we
   * multiply the "carpaint" meshes by the car's colour to give it its livery
   * while keeping the shading. Chrome/glass/black-trim/calipers are left alone.
   */
  _applyPaint() {
    const hex = this.config.paintColor;
    if (hex == null) return;
    const re = this.config.paintMeshRe || /carpaint/i;
    const skip = /black|decal|caliper/i;
    const color = new THREE.Color(hex);
    this.model.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      if (!re.test(o.name) || skip.test(o.name)) return;
      const m = o.material.clone();
      m.color = color.clone();
      o.material = m;
    });
  }

  /** Find the 4 wheels (to spin/steer) and the brake-light materials. */
  _setupWheelsAndLights() {
    this.object3D.updateWorldMatrix(true, true);

    // Brake lights (config-driven). We clone the matched materials so lighting
    // them up doesn't tint any body mesh that shares the same material. A matcher
    // may cap vertex count to avoid a big shell that reuses a light's material.
    this._brakeMats = [];
    const matchers = this.config.brakeLights || [];
    if (matchers.length) {
      this.model.traverse((o) => {
        if (!o.isMesh || Array.isArray(o.material)) return;
        const name = o.material.name;
        const verts = o.geometry.attributes.position.count;
        const ok = matchers.some((m) => m.mat === name && (m.maxVerts == null || verts < m.maxVerts));
        if (!ok) return;
        const mat = o.material.clone();
        if (!mat.emissive) mat.emissive = new THREE.Color(0x000000);
        mat.emissiveIntensity = 0;
        o.material = mat;
        this._brakeMats.push(mat);
      });
    }

    // Wheels: prefer named group nodes (each holds a rim + tyre, e.g. the
    // Koenigsegg's wheelFL/FR/BL/BR) so rim and tyre spin together; otherwise
    // fall back to individual tyre meshes (the F1's WheelFront00x meshes).
    const roots = [];
    if (this.config.wheelGroupRe) {
      const re = this.config.wheelGroupRe;
      this.model.traverse((o) => { if (re.test(o.name)) roots.push(o); });
    } else if (this.config.wheelMeshRe) {
      const re = this.config.wheelMeshRe;
      this.model.traverse((o) => { if (o.isMesh && re.test(o.name)) roots.push(o); });
    }
    if (roots.length !== 4) return; // degrade gracefully (no wheel animation)

    const objQuat = this.object3D.getWorldQuaternion(new THREE.Quaternion());
    const lateralWorld = new THREE.Vector3(1, 0, 0).applyQuaternion(objQuat);
    const upWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(objQuat);
    const objInv = this.object3D.matrixWorld.clone().invert();
    const wc = new THREE.Vector3();

    for (const root of roots) {
      // World centre of the wheel → front/rear by local z sign.
      new THREE.Box3().setFromObject(root).getCenter(wc);
      const isFront = wc.clone().applyMatrix4(objInv).z > 0;
      // Pivot at the wheel centre so spin/steer rotate it in place.
      const P = root.parent;
      const centerInP = wc.clone().applyMatrix4(P.matrixWorld.clone().invert());
      const pivot = new THREE.Group();
      pivot.position.copy(centerInP);
      P.add(pivot);
      pivot.attach(root); // keep world transform, reparent under pivot
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

    // Kinematic chassis (AI): moved along the path; pushes the player but is never
    // pushed itself, so it can't be knocked off the racing line.
    if (this.kinematic) {
      const startY = (spawn.y ?? 0) + s.y / 2;
      const kDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(spawn.x, startY, spawn.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      this.chassis = this.world.createRigidBody(kDesc);
      const hx = s.x * 0.45, hy = s.y * 0.34, hz = s.z * 0.47;
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.6), this.chassis);
      return;
    }

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

  /** Move a kinematic car to a pose on the racing line (AI opponent). */
  setKinematicPose(pose) {
    if (!this.chassis) return;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.heading);
    this.chassis.setNextKinematicTranslation({ x: pose.x, y: (pose.y ?? 0) + this.size.y / 2, z: pose.z });
    this.chassis.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    this.kinematicSpeed = pose.speed ?? 0;
    if (pose.steer != null) this._steerAngle = pose.steer;
  }

  /** Sync the visual model + wheels + lights from the chassis (each render frame). */
  syncVisual(dt = 1 / 60) {
    if (!this.chassis) return;
    const t = this.chassis.translation();
    const r = this.chassis.rotation();
    this.object3D.position.set(t.x, t.y, t.z);
    this.object3D.quaternion.set(r.x, r.y, r.z, r.w);

    this._fwd.set(0, 0, 1).applyQuaternion(this.object3D.quaternion);
    this.heading = Math.atan2(this._fwd.x, this._fwd.z);

    if (this.kinematic) {
      // Path-driven: speed/steer come from the follower; no slip/contact concept.
      this.speed = this.kinematicSpeed;
      this.steer = this._steerAngle;
      this.lateralSlip = 0;
      this.wheelsInContact = 4;
    } else {
      this.speed = this._forwardSpeed();
      this.steer = this._steerAngle;
      const lv = this.chassis.linvel();
      const right = this._tmpV.set(1, 0, 0).applyQuaternion(this.object3D.quaternion);
      const lateralVel = lv.x * right.x + lv.y * right.y + lv.z * right.z;
      this.lateralSlip = Math.min(1, Math.abs(lateralVel) / 7);
      let contact = 0;
      for (let i = 0; i < this.wheels.length; i++) if (this.controller.wheelIsInContact(i)) contact++;
      this.wheelsInContact = contact;
    }

    this._updateDrivetrain();
    this._animateWheels(dt);
    this._updateBrakeLights();
  }

  _updateDrivetrain() {
    if (this.revving) {
      // Held at the line before GO: sit on the limiter-ish for an engine note.
      this.gear = 1;
      this.rpm = this.engine.idle + 0.6 * (this.engine.redline - this.engine.idle);
      return;
    }
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
    if (this.kinematic) {
      const pos = { x, y: y + this.size.y / 2, z };
      this.chassis.setTranslation(pos, true);
      this.chassis.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      this.chassis.setNextKinematicTranslation(pos);
      this.chassis.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      this.kinematicSpeed = 0;
      return;
    }
    this.chassis.setTranslation({ x, y: y + this.size.y / 2 + 0.4, z }, true);
    this.chassis.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
}
