import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadMap } from './MapLoader.js';
import { Car } from './Car.js';
import { Controls } from './Controls.js';
import { ChaseCamera } from './ChaseCamera.js';

/**
 * Core game shell: renderer, scene, camera, lights and the render loop.
 *
 * Stage 1 goal: load the highway-battle map and let you inspect it (orbit /
 * pan / zoom) to confirm it imported 100% correctly. The class is structured
 * so cars, physics and gameplay can be added later via `add()` and the public
 * `scene` / `camera` references.
 */
export class Game {
  constructor(container) {
    this.container = container;
    this.timer = new THREE.Timer();
    this.updateables = []; // objects with an update(dt) method (cars, etc. later)

    this._initRenderer();
    this._initScene();
    this._initCamera();
    this._initLights();
    this._initControls();

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Faithful reproduction of the (unlit, Sketchfab-baked) map:
    // sRGB output, no tone mapping so baked colors are shown exactly as authored.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;

    // Ready for future dynamic objects (cars) that should cast shadows.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.container.appendChild(this.renderer.domElement);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fb7e6); // daytime sky
  }

  _initCamera() {
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      20000
    );
    this.camera.position.set(20, 20, 20);
  }

  _initLights() {
    // Unlit map materials ignore lights, but these make any future PBR objects
    // (cars) look correct from the start.
    const hemi = new THREE.HemisphereLight(0xffffff, 0x404a55, 1.0);
    hemi.position.set(0, 200, 0);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(100, 200, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    this.sun = sun;
  }

  _initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = false;
    this.controls.maxPolarAngle = Math.PI * 0.495; // don't drop below the ground
  }

  /** Load and add the race map, then frame the camera around it. */
  async loadMap(url, onProgress) {
    const { root, stats } = await loadMap(url, onProgress);
    this.map = root;
    this.mapStats = stats;
    this.scene.add(root);

    // Cache the map's meshes so the car can raycast collisions against them.
    this.mapMeshes = [];
    root.traverse((o) => { if (o.isMesh) this.mapMeshes.push(o); });

    this._frameCameraTo(stats.bounds);
    this._configureLightsToBounds(stats.bounds);
    return stats;
  }

  /**
   * Load the player car, drop it onto the map and switch to a chase camera.
   * @param {string} url
   * @param {{x:number, z:number, heading?:number}} spawn
   * @param {object} [opts] forwarded to Car (targetLength, flip).
   */
  async addCar(url, spawn, opts = {}) {
    const car = new Car(this.mapMeshes ?? [], opts);
    await car.load(url);
    car.placeAt(spawn.x, spawn.z, spawn.heading ?? 0);
    this.scene.add(car.object3D);

    this.car = car;
    this.input = new Controls();
    this.chaseCam = new ChaseCamera(this.camera, car);
    this.setDriving(true);

    // 'C' toggles between driving (chase cam) and free-orbit inspection.
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'c') this.setDriving(!this.driving);
    });
    return car;
  }

  setDriving(on) {
    this.driving = on;
    this.controls.enabled = !on;
    if (!on && this.car) {
      // Hand the orbit camera a sensible target on the car.
      this.controls.target.copy(this.car.object3D.position);
      this.controls.update();
    }
  }

  /** Position camera + controls so the whole map is comfortably in view. */
  _frameCameraTo({ size, center }) {
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (this.camera.fov * Math.PI) / 180;
    let dist = maxDim / 2 / Math.tan(fov / 2);
    dist *= 1.4; // padding

    // Near/far tuned to the map size to avoid z-fighting and far-plane clipping.
    this.camera.near = Math.max(maxDim / 1000, 0.05);
    this.camera.far = maxDim * 50;
    this.camera.updateProjectionMatrix();

    const dir = new THREE.Vector3(0.6, 0.5, 0.9).normalize();
    this.camera.position.copy(center).add(dir.multiplyScalar(dist));

    this.controls.target.copy(center);
    this.controls.maxDistance = dist * 3;
    this.controls.minDistance = maxDim / 50;
    this.controls.update();
  }

  /** Scale the sun + its shadow frustum to the map so future shadows look right. */
  _configureLightsToBounds({ size, center }) {
    const maxDim = Math.max(size.x, size.y, size.z);
    this.sun.position.copy(center).add(new THREE.Vector3(maxDim * 0.5, maxDim, maxDim * 0.4));
    this.sun.target.position.copy(center);
    this.scene.add(this.sun.target);

    const cam = this.sun.shadow.camera;
    const r = maxDim * 0.6;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
    cam.near = 0.5; cam.far = maxDim * 3;
    cam.updateProjectionMatrix();
  }

  /** Register an object whose update(dt) should run each frame (e.g. a car). */
  add(entity) {
    if (entity.object3D) this.scene.add(entity.object3D);
    if (typeof entity.update === 'function') this.updateables.push(entity);
    return entity;
  }

  start() {
    this.renderer.setAnimationLoop(() => this._tick());
  }

  _tick() {
    this.timer.update();
    const dt = this.timer.getDelta();

    if (this.car && this.driving) {
      this.car.update(dt, {
        throttle: this.input.throttle,
        steer: this.input.steer,
        handbrake: this.input.handbrake,
      });
      this.chaseCam.update(dt);
    } else if (this.controls.enabled) {
      this.controls.update();
    }

    for (const e of this.updateables) e.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
}
