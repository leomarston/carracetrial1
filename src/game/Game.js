import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadMap } from './MapLoader.js';
import { Vehicle } from './Vehicle.js';
import { Controls, P1_KEYS, P2_KEYS } from './Controls.js';
import { ChaseCamera } from './ChaseCamera.js';
import { Effects } from './Effects.js';
import { AudioManager } from './AudioManager.js';
import { RaceManager } from './RaceManager.js';
import { Minimap } from './Minimap.js';
import { AIDriver } from './AIDriver.js';
import { buildCenterline, roadSamplesFromMeshes } from './trackPath.js';
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
    this.bots = []; // AI cars: { car, driver, spawn }
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
    // Two cameras for split-screen (top = P1, bottom = P2). Each viewport is the
    // full width but half the height, so the aspect is width / (height / 2).
    const aspect = window.innerWidth / (window.innerHeight / 2);
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 20000);
    this.camera.position.set(20, 20, 20);
    this.camera2 = new THREE.PerspectiveCamera(60, aspect, 0.3, 12000);
    this.camera2.position.set(20, 20, 20);
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
   * Player 1's car: a physics vehicle followed by the top-screen chase camera.
   * @param {object} carConfig  entry from cars.js (with a resolved `url`)
   * @param {{x:number, z:number, y?:number, heading?:number}} spawn
   */
  async addCar(carConfig, spawn) {
    const car = new Vehicle(this.physics, carConfig);
    await car.load(carConfig.url, spawn);
    this.scene.add(car.object3D);

    this.car = car;
    this.p1Spawn = spawn;
    this.input = new Controls(P1_KEYS);
    this.chaseCam = new ChaseCamera(this.camera, car);
    this.effects = new Effects(this.scene, car);
    this.audio = new AudioManager(car);

    // Gameplay near/far. The map-overview framing left a huge near plane
    // (~7 units, from maxDim/1000); with the close chase camera that clipped the
    // road right under the camera and showed the sky background "through" it.
    this.camera.near = 0.3;
    this.camera.far = 12000;
    this.camera.updateProjectionMatrix();
    this.controls.enabled = false; // drive with the chase camera, not free orbit

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'r') this._restart();
      if (k === 'p') { this.debugPhysics = !this.debugPhysics; this.physics.setDebug(this.scene, this.debugPhysics); }
    });
    return car;
  }

  /**
   * Player 2's car: a second physics vehicle followed by the bottom-screen chase
   * camera, driven from the arrow keys.
   * @param {object} carConfig  entry from cars.js (with a resolved `url`)
   * @param {{x:number, z:number, y?:number, heading?:number}} spawn
   */
  async addPlayer2(carConfig, spawn) {
    const car = new Vehicle(this.physics, carConfig);
    await car.load(carConfig.url, spawn);
    this.scene.add(car.object3D);

    this.car2 = car;
    this.p2Spawn = spawn;
    this.input2 = new Controls(P2_KEYS);
    this.chaseCam2 = new ChaseCamera(this.camera2, car);
    this.effects2 = new Effects(this.scene, car);
    return car;
  }

  /** Build the AI racing line (centerline shifted onto the players' carriageway). */
  _buildRacingLine(track) {
    if (this.botWaypoints) return this.botWaypoints;
    const roads = (this.mapMeshes ?? []).filter((m) => /Road2/i.test(m.name));
    const samples = roadSamplesFromMeshes(roads);
    const c = track.loopCenter;
    const seedRadius = Math.hypot(track.spawn.x - c.x, track.spawn.z - c.z);
    const seedAngle = Math.atan2(track.spawn.z - c.z, track.spawn.x - c.x);
    this.botWaypoints = buildCenterline(samples, {
      center: c, seedRadius, seedAngle,
      bins: track.path?.bins ?? 240, dir: track.path?.dir ?? -1,
      gap: track.path?.gap, laneOffset: track.path?.laneOffset,
    });
    return this.botWaypoints;
  }

  /**
   * Load AI bot cars that drive the racing line kinematically. Spreads them
   * across the lane (lateral offsets) and varies their pace a touch.
   * @param {object[]} carConfigs  entries from cars.js (with resolved urls)
   * @param {object} track
   */
  async addBots(carConfigs, track) {
    const waypoints = this._buildRacingLine(track);
    const spawns = track.botSpawns ?? [];
    const lanes = [0, -3.5, 3.5, -6.5, 6.5]; // sideways spread across the lane
    for (let i = 0; i < carConfigs.length; i++) {
      const spawn = spawns[i] ?? spawns[spawns.length - 1] ?? track.p2Spawn;
      const car = new Vehicle(this.physics, { ...carConfigs[i], kinematic: true });
      await car.load(carConfigs[i].url, spawn);
      this.scene.add(car.object3D);
      car.syncVisual(0); // place object3D at the spawn so the driver seeds its index
      const driver = new AIDriver(car, waypoints, {
        vmax: car.topSpeed * (0.78 + 0.04 * i), // slight pace variety
        lateralOffset: lanes[i % lanes.length],
      });
      this.bots.push({ car, driver, spawn });
    }
    return this.bots;
  }

  /** Reset all cars to their grid slots and restart the race (the `R` key). */
  _restart() {
    if (this.car && this.p1Spawn) {
      const s = this.p1Spawn;
      this.car.resetTo(s.x, s.y ?? 0, s.z, s.heading ?? 0);
    }
    if (this.car2 && this.p2Spawn) {
      const s = this.p2Spawn;
      this.car2.resetTo(s.x, s.y ?? 0, s.z, s.heading ?? 0);
    }
    for (const bot of this.bots) {
      const s = bot.spawn;
      bot.car.resetTo(s.x, s.y ?? 0, s.z, s.heading ?? 0);
      bot.driver.reset();
    }
    if (this.race) this.race.reset();
  }

  /** Set up the race (lap logic) + minimap for a track. Call after all cars. */
  setupRace(track, minimapCanvas) {
    const entries = [{ car: this.car, name: this.car.name, isPlayer: true }];
    if (this.car2) entries.push({ car: this.car2, name: this.car2.name, isPlayer: true });
    for (const bot of this.bots) entries.push({ car: bot.car, name: bot.car.name, isPlayer: false });
    this.race = new RaceManager(track, entries);
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
      // Hold both cars at the line during the countdown; otherwise drive normally.
      const holding = this.race && this.race.phase === 'countdown';
      const HOLD = { throttle: 0, steer: 0, handbrake: true };
      const read = (c) => ({ throttle: c.throttle, steer: c.steer, handbrake: c.handbrake });

      this.car.revving = holding;
      this.car.setInput(holding ? HOLD : read(this.input));
      if (this.car2) {
        this.car2.revving = holding;
        this.car2.setInput(holding ? HOLD : read(this.input2));
      }

      // Bots are kinematic: once racing they follow the line; held on the grid
      // during the countdown.
      if (this.race && this.race.phase !== 'countdown') {
        for (const bot of this.bots) bot.car.setKinematicPose(bot.driver.update(dt));
      }

      // Step the physics with the player vehicles inside each fixed step.
      this.physics.step(dt, (h) => {
        this.car.fixedUpdate(h);
        if (this.car2) this.car2.fixedUpdate(h);
      });
      this.car.syncVisual(dt);
      if (this.car2) this.car2.syncVisual(dt);
      for (const bot of this.bots) bot.car.syncVisual(dt);
      this.effects.update(dt);
      if (this.effects2) this.effects2.update(dt);
      this.audio.update();
      if (this.race) {
        this.race.update(dt);
        this._updateStartLights(this.race.startLights());
      }
      if (this.minimap) this.minimap.update(this.car, this.race, this.car2, this.bots);

      this.chaseCam.update(dt);
      if (this.chaseCam2) this.chaseCam2.update(dt);
    } else if (this.controls.enabled) {
      this.controls.update();
    }

    if (this.debugPhysics) this.physics.updateDebug();
    for (const e of this.updateables) e.update(dt);

    if (this.car2) this._renderSplit();
    else this.renderer.render(this.scene, this.camera);
  }

  /** Render the scene twice: top half = player 1, bottom half = player 2. */
  _renderSplit() {
    const w = window.innerWidth, h = window.innerHeight, half = h / 2;
    const r = this.renderer;
    r.setScissorTest(true);
    // Three's viewport origin is bottom-left, so the top half starts at y = half.
    r.setViewport(0, half, w, half);
    r.setScissor(0, half, w, half);
    r.render(this.scene, this.camera);
    r.setViewport(0, 0, w, half);
    r.setScissor(0, 0, w, half);
    r.render(this.scene, this.camera2);
    r.setScissorTest(false);
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / (h / 2); // each split viewport is half-height
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.camera2.aspect = aspect;
    this.camera2.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
}
