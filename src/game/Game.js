import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadMap } from './MapLoader.js';
import { Vehicle } from './Vehicle.js';
import { Controls } from './Controls.js';
import { ChaseCamera } from './ChaseCamera.js';
import { Effects } from './Effects.js';
import { AudioManager } from './AudioManager.js';
import { RaceManager } from './RaceManager.js';
import { Minimap } from './Minimap.js';
import { PhysicsWorld, buildTrimeshFromMeshes } from '../physics/PhysicsWorld.js';
import { buildRoadEdgeWalls } from '../physics/roadWalls.js';

const LIGHT_OFF = 0x2a1414;
const LIGHT_RED = 0xff2200;
const LIGHT_GREEN = 0x18ff44;

/**
 * Core game shell: renderer, scene, camera, lights, the Rapier physics world
 * and the render loop. The map becomes a static collider and the car is a
 * Rapier raycast vehicle driven in a fixed-timestep loop.
 */
export class Game {
  constructor(container) {
    this.container = container;
    this.timer = new THREE.Timer();
    this.updateables = []; // objects with an update(dt) method
    this.physics = new PhysicsWorld({ gravity: -20 });
    this.debugPhysics = false;

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

    // Cache the map's meshes, then bake them into one static physics collider
    // so the car collides with the road, terrain, buildings and barriers.
    this.mapMeshes = [];
    root.traverse((o) => { if (o.isMesh) this.mapMeshes.push(o); });
    const { vertices, indices } = buildTrimeshFromMeshes(this.mapMeshes);
    this.physics.addStaticTrimesh(vertices, indices);

    // Invisible barriers along the road edges so the car stays on the track.
    const roadMeshes = this.mapMeshes.filter((m) => /Road2/i.test(m.name));
    const walls = buildRoadEdgeWalls(roadMeshes, { weld: 0.3, height: 2.5 });
    if (walls.indices.length) {
      this.physics.addStaticTrimesh(walls.vertices, walls.indices);
      this.roadWallFaces = walls.faces;
      this.roadWallGeom = walls;
    }

    this._frameCameraTo(stats.bounds);
    this._configureLightsToBounds(stats.bounds);
    return stats;
  }

  /**
   * Load the player car as a physics vehicle and switch to a chase camera.
   * @param {object} carConfig  entry from cars.js (with a resolved `url`)
   * @param {{x:number, z:number, y?:number, heading?:number}} spawn
   */
  async addCar(carConfig, spawn) {
    const car = new Vehicle(this.physics, carConfig);
    await car.load(carConfig.url, spawn);
    this.scene.add(car.object3D);

    this.car = car;
    this.input = new Controls();
    this.chaseCam = new ChaseCamera(this.camera, car);
    this.effects = new Effects(this.scene, car);
    this.audio = new AudioManager(car);

    // Gameplay near/far. The map-overview framing left a huge near plane
    // (~7 units, from maxDim/1000); with the close chase camera that clipped the
    // road right under the camera and showed the sky background "through" it.
    this.camera.near = 0.3;
    this.camera.far = 12000;
    this.camera.updateProjectionMatrix();

    this.setDriving(true);

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'c') this.setDriving(!this.driving);
      if (k === 'r' && this.car) {
        this.car.resetTo(spawn.x, spawn.y ?? 0, spawn.z, spawn.heading ?? 0);
        if (this.race) this.race.reset();
      }
      if (k === 'p') { this.debugPhysics = !this.debugPhysics; this.physics.setDebug(this.scene, this.debugPhysics); }
    });
    return car;
  }

  setDriving(on) {
    this.driving = on;
    this.controls.enabled = !on;
    if (!on && this.car) {
      this.controls.target.copy(this.car.object3D.position);
      this.controls.update();
    }
  }

  /** Set up the race (lap logic) + minimap for a track. Call after addCar. */
  setupRace(track, minimapCanvas) {
    this.race = new RaceManager(this.car, track);
    if (minimapCanvas) {
      const roads = (this.mapMeshes ?? []).filter((m) => /Road2/i.test(m.name));
      this.minimap = new Minimap(minimapCanvas, roads, track);
    }
    return this.race;
  }

  /** Load the start/finish gantry asset and place it across the road on the line. */
  async addStartFinishGantry(cfg) {
    const gltf = await new Promise((res, rej) => new GLTFLoader().load(cfg.url, res, undefined, rej));
    const model = gltf.scene;
    model.updateWorldMatrix(true, true);
    let size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z); // the span axis
    model.scale.setScalar(cfg.span / longest);
    model.rotation.y = cfg.rotationY ?? 0;

    // Recenter horizontally and sit the base on the road.
    model.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });

    const wrapper = new THREE.Group();
    wrapper.name = 'StartFinishGantry';
    wrapper.add(model);
    const y = this._sampleGroundY(cfg.x, cfg.z) ?? 0.8;
    wrapper.position.set(cfg.x, y, cfg.z);
    this.scene.add(wrapper);
    this.startGantry = wrapper;
    this._createStartLights(wrapper);
    return wrapper;
  }

  /** Three start lights mounted on the gantry beam, facing the driver (+Z). */
  _createStartLights(gantry) {
    const box = new THREE.Box3().setFromObject(gantry);
    const cx = (box.min.x + box.max.x) / 2;
    const sizeY = box.max.y - box.min.y;
    const r = Math.max(0.55, sizeY * 0.06);
    const y = box.max.y - sizeY * 0.17;
    const z = box.max.z + r * 0.8; // driver-facing side
    const gap = r * 3;
    const geo = new THREE.SphereGeometry(r, 18, 12);
    this.startLights = [];
    for (let i = -1; i <= 1; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: LIGHT_OFF }));
      m.position.set(cx + i * gap, y, z);
      m.frustumCulled = false;
      this.scene.add(m);
      this.startLights.push(m);
    }
  }

  _updateStartLights(st) {
    if (!this.startLights) return;
    for (let i = 0; i < this.startLights.length; i++) {
      let c = LIGHT_OFF;
      if (st.green) c = LIGHT_GREEN;
      else if (st.on && i < st.red) c = LIGHT_RED;
      this.startLights[i].material.color.setHex(c);
    }
  }

  /** Downward raycast against the map to find the ground height at (x,z). */
  _sampleGroundY(x, z) {
    if (!this._ray) this._ray = new THREE.Raycaster();
    this._ray.set(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0));
    this._ray.far = 1000;
    const hit = this._ray.intersectObjects(this.mapMeshes ?? [], false)[0];
    return hit ? hit.point.y : null;
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

    if (this.car) {
      // Hold the car at the line during the countdown; otherwise drive normally.
      const holding = this.race && this.race.phase === 'countdown';
      this.car.revving = holding;
      this.car.setInput(holding
        ? { throttle: 0, steer: 0, handbrake: true }
        : { throttle: this.input.throttle, steer: this.input.steer, handbrake: this.input.handbrake });

      this.physics.step(dt, (h) => this.car.fixedUpdate(h));
      this.car.syncVisual(dt);
      this.effects.update(dt);
      this.audio.update();
      if (this.race) {
        this.race.update(dt);
        this._updateStartLights(this.race.startLights());
      }
      if (this.minimap) this.minimap.update(this.car, this.race);

      if (this.driving) this.chaseCam.update(dt);
      else if (this.controls.enabled) this.controls.update();
    } else if (this.controls.enabled) {
      this.controls.update();
    }

    if (this.debugPhysics) this.physics.updateDebug();
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
