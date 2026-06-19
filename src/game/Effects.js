import * as THREE from 'three';

/**
 * Tyre feedback effects driven by the vehicle's slip state:
 *  - skid marks: dark decals stamped on the ground under the rear wheels while
 *    they slide (instanced + recycled, so they persist cheaply).
 *  - tyre smoke: a GPU point cloud puffing up from the sliding contact points.
 */
export class Effects {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./Vehicle.js').Vehicle} car
   */
  constructor(scene, car) {
    this.scene = scene;
    this.car = car;
    this._initSkid();
    this._initSmoke();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    this._scale = new THREE.Vector3();
    this._pos = new THREE.Vector3();
  }

  _initSkid() {
    this.skidMax = 1500;
    this.skidIndex = 0;
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x161210, transparent: true, opacity: 0.55,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
    });
    this.skid = new THREE.InstancedMesh(geo, mat, this.skidMax);
    this.skid.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.skid.count = this.skidMax;
    this.skid.frustumCulled = false;
    // Park all instances out of sight initially.
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.skidMax; i++) this.skid.setMatrixAt(i, m);
    this.skid.instanceMatrix.needsUpdate = true;
    this.scene.add(this.skid);
  }

  _initSmoke() {
    this.smokeMax = 280;
    this.smokeLifespan = 1.1; // seconds
    this._sPos = new Float32Array(this.smokeMax * 3);
    this._sLife = new Float32Array(this.smokeMax).fill(1); // 1 = dead
    this._sSeed = new Float32Array(this.smokeMax);
    this._sVel = new Float32Array(this.smokeMax * 3);
    this._sCursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this._sPos, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this._sLife, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(this._sSeed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uSize: { value: 90 * (window.devicePixelRatio || 1) } },
      vertexShader: `
        attribute float aLife; attribute float aSeed; varying float vLife;
        uniform float uSize;
        void main(){
          vLife = aLife; vec4 mv = modelViewMatrix * vec4(position,1.0);
          float grow = 1.0 + aLife * 2.5;
          gl_PointSize = uSize * grow / max(-mv.z, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vLife;
        void main(){
          if (vLife >= 1.0) discard;
          vec2 d = gl_PointCoord - 0.5; float r = length(d);
          if (r > 0.5) discard;
          float soft = smoothstep(0.5, 0.05, r);
          float alpha = soft * (1.0 - vLife) * 0.5;
          gl_FragColor = vec4(vec3(0.82), alpha);
        }`,
    });
    this.smoke = new THREE.Points(geo, mat);
    this.smoke.frustumCulled = false;
    this.scene.add(this.smoke);
  }

  _emitSkid(point, heading, width) {
    this._pos.set(point.x, point.y + 0.03, point.z);
    this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading).multiply(this._flat);
    this._scale.set(width, 0.9, 1);
    this._m.compose(this._pos, this._q, this._scale);
    this.skid.setMatrixAt(this.skidIndex, this._m);
    this.skidIndex = (this.skidIndex + 1) % this.skidMax;
    this.skid.instanceMatrix.needsUpdate = true;
  }

  _emitSmoke(point) {
    const i = this._sCursor;
    this._sPos[i * 3] = point.x;
    this._sPos[i * 3 + 1] = point.y + 0.2;
    this._sPos[i * 3 + 2] = point.z;
    this._sVel[i * 3] = (Math.random() - 0.5) * 1.5;
    this._sVel[i * 3 + 1] = 1.0 + Math.random() * 1.2;
    this._sVel[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
    this._sLife[i] = 0;
    this._sSeed[i] = Math.random();
    this._sCursor = (this._sCursor + 1) % this.smokeMax;
  }

  update(dt) {
    const car = this.car;
    const slip = Math.max(car.lateralSlip, car.wheelSlip, car.input.handbrake ? 1 : 0);
    const speed = Math.abs(car.speed);
    const sliding = slip > 0.35 && speed > 1.5 && car.wheelsInContact > 0;

    if (sliding && car.controller) {
      const intensity = Math.min(1, slip);
      // Rear wheels are indices 2 & 3 (FL, FR, RL, RR).
      for (const i of [2, 3]) {
        if (!car.controller.wheelIsInContact(i)) continue;
        const cp = car.controller.wheelContactPoint(i);
        if (!cp) continue;
        this._emitSkid(cp, car.heading, 0.35);
        if (Math.random() < intensity) this._emitSmoke(cp);
      }
    }

    // Advance smoke particles.
    let changed = false;
    for (let i = 0; i < this.smokeMax; i++) {
      if (this._sLife[i] >= 1) continue;
      this._sLife[i] += dt / this.smokeLifespan;
      this._sPos[i * 3] += this._sVel[i * 3] * dt;
      this._sPos[i * 3 + 1] += this._sVel[i * 3 + 1] * dt;
      this._sPos[i * 3 + 2] += this._sVel[i * 3 + 2] * dt;
      this._sVel[i * 3 + 1] += 0.6 * dt; // buoyancy
      changed = true;
    }
    if (changed || sliding) {
      this.smoke.geometry.attributes.position.needsUpdate = true;
      this.smoke.geometry.attributes.aLife.needsUpdate = true;
    }
  }
}
