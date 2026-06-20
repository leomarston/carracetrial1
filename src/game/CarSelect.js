import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Pre-race CAR SELECT screen (NFS-style), split horizontally so both players
 * pick their own car at the same time. It runs its OWN little Three.js renderer
 * (separate from the Game's) to show each chosen car on a slow turntable, with
 * the HTML overlay (#car-select) drawing the racing UI on top.
 *
 * Returns a promise that resolves to `{ p1, p2 }` (car ids) once both players
 * press Ready; the renderer is then disposed so the Game can take the GPU.
 *
 *   P1: A / D change · W or Enter ready · S cancel
 *   P2: ← / → change · ↑ (or Right-Shift) ready · ↓ cancel
 *
 * @param {object} opts
 * @param {object} opts.cars     the CARS catalog
 * @param {string[]} opts.order  car ids, left-to-right browse order
 * @param {{p1:string,p2:string}} opts.defaults  starting selections
 * @param {string} opts.base     import.meta.env.BASE_URL (asset prefix)
 * @param {HTMLElement} opts.root  the #car-select overlay element
 */
export function runCarSelect(opts) {
  return new CarSelect(opts).run();
}

const SLOTS = { p1: new THREE.Vector3(0, 0, 0), p2: new THREE.Vector3(200, 0, 0) };

class CarSelect {
  constructor({ cars, order, defaults, base, root }) {
    this.cars = cars;
    this.order = order;
    this.base = base || '';
    this.root = root;
    this.sel = { p1: order.indexOf(defaults.p1), p2: order.indexOf(defaults.p2) };
    this.ready = { p1: false, p2: false };
    this.tok = { p1: 0, p2: 0 }; // guards against out-of-order async model loads
    this.cache = new Map(); // id -> { model (template), size }
    this.loader = new GLTFLoader();
    this.clock = new THREE.Clock();
    this.done = false;
  }

  run() {
    this._buildScene();
    this._collectDom();
    this._bindInput();
    this._updateDom('p1');
    this._updateDom('p2');
    this._show('p1', this.order[this.sel.p1]);
    this._show('p2', this.order[this.sel.p2]);
    this._loop = this._loop.bind(this);
    this.raf = requestAnimationFrame(this._loop);
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  // ---- 3D scene (its own renderer; disposed before the Game starts) ----
  _buildScene() {
    const canvas = this.root.querySelector('#cs-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = this._backdropTexture();

    // Showroom lighting (no shadows — the two stages sit far apart).
    this.scene.add(new THREE.HemisphereLight(0xa9c4e6, 0x14171d, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(6, 9, 8); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x88b4ff, 0.7); fill.position.set(-7, 4, -3); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0x40e0ff, 1.1); rim.position.set(0, 5, -10); this.scene.add(rim);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshStandardMaterial({ color: 0x0a0e15, roughness: 0.85, metalness: 0.1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // A turntable pivot + a cyan "spotlight pool" on the floor per stage.
    const poolTex = this._poolTexture();
    this.pivots = {};
    for (const p of ['p1', 'p2']) {
      const pivot = new THREE.Group(); pivot.position.copy(SLOTS[p]); this.scene.add(pivot);
      this.pivots[p] = pivot;
      const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(11, 11),
        new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      pool.rotation.x = -Math.PI / 2; pool.position.set(SLOTS[p].x, 0.02, SLOTS[p].z);
      this.scene.add(pool);
    }

    const aspect = window.innerWidth / (window.innerHeight / 2);
    this.cams = {
      p1: new THREE.PerspectiveCamera(34, aspect, 0.1, 5000),
      p2: new THREE.PerspectiveCamera(34, aspect, 0.1, 5000),
    };

    this._onResize = () => {
      const w = window.innerWidth, h = window.innerHeight, a = w / (h / 2);
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      for (const p of ['p1', 'p2']) { this.cams[p].aspect = a; this.cams[p].updateProjectionMatrix(); }
    };
    window.addEventListener('resize', this._onResize);
  }

  /** Vertical gradient (showroom dusk) used as the scene background. */
  _backdropTexture() {
    const c = document.createElement('canvas'); c.width = 16; c.height = 256;
    const g = c.getContext('2d').createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#0b1019'); g.addColorStop(0.55, '#0a1622'); g.addColorStop(1, '#05080d');
    const ctx = c.getContext('2d'); ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 256);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  }

  /** Radial cyan glow used as a floor spotlight under each car. */
  _poolTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    g.addColorStop(0, 'rgba(90,190,230,0.55)');
    g.addColorStop(0.5, 'rgba(50,120,170,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  }

  /** Load + prepare a car model once (scaled, recentred on the floor, painted). */
  async _getModel(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const cfg = this.cars[id];
    const gltf = await new Promise((res, rej) => this.loader.load(this.base + cfg.url, res, undefined, rej));
    const model = gltf.scene;

    if (cfg.hideMeshes) {
      const drop = [];
      model.traverse((o) => { if (o.isMesh && cfg.hideMeshes.test(o.name)) drop.push(o); });
      for (const m of drop) m.removeFromParent();
    }

    model.updateWorldMatrix(true, true);
    const native = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    model.scale.setScalar((cfg.targetWidth ?? 2.8) / native.x);
    model.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z); // centred, sitting on the floor
    const size = box.getSize(new THREE.Vector3());
    model.traverse((o) => { if (o.isMesh) o.castShadow = false; });

    this._applyPaint(model, cfg);
    const entry = { model, size };
    this.cache.set(id, entry);
    return entry;
  }

  /** Same livery tint the in-game Vehicle uses (white paint texture → colour). */
  _applyPaint(model, cfg) {
    if (cfg.paintColor == null) return;
    const re = cfg.paintMeshRe || /carpaint/i;
    const skip = /black|decal|caliper/i;
    const color = new THREE.Color(cfg.paintColor);
    model.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      if (!re.test(o.name) || skip.test(o.name)) return;
      const m = o.material.clone(); m.color = color.clone(); o.material = m;
    });
  }

  /** Swap the car shown on a player's stage (clone so both stages are independent). */
  async _show(player, id) {
    const tok = ++this.tok[player];
    this.root.querySelector(`#cs-${player}`).classList.add('cs-busy');
    let entry;
    try { entry = await this._getModel(id); } catch (e) { console.error('[carselect] load failed', id, e); return; }
    if (tok !== this.tok[player]) return; // a newer selection won the race
    const pivot = this.pivots[player];
    pivot.clear(); // drop the old clone (geometry/materials are shared with the template — don't dispose)
    pivot.rotation.y = -0.5;
    pivot.add(entry.model.clone(true));
    this._frameCamera(this.cams[player], SLOTS[player], entry.size);
    this.root.querySelector(`#cs-${player}`).classList.remove('cs-busy');
  }

  /** Frame a 3/4 view that fills the wide half-height viewport. */
  _frameCamera(cam, c, size) {
    const diag = Math.hypot(size.x, size.z);
    const d = diag * 0.62 + 1.6;
    cam.position.set(c.x + d * 0.5, c.y + size.y * 0.85 + 0.35, c.z + d);
    cam.lookAt(c.x, c.y + size.y * 0.42, c.z);
  }

  // ---- HTML overlay ----
  _collectDom() {
    const q = (p) => ({
      half: this.root.querySelector(`#cs-${p}`),
      brand: this.root.querySelector(`#cs-${p}-brand`),
      model: this.root.querySelector(`#cs-${p}-model`),
      klass: this.root.querySelector(`#cs-${p}-klass`),
      tier: this.root.querySelector(`#cs-${p}-tier`),
      value: this.root.querySelector(`#cs-${p}-value`),
      speed: this.root.querySelector(`#cs-${p}-speed`),
      accel: this.root.querySelector(`#cs-${p}-accel`),
      handling: this.root.querySelector(`#cs-${p}-handling`),
      ready: this.root.querySelector(`#cs-${p}-ready`),
    });
    this.els = { p1: q('p1'), p2: q('p2') };

    // Clickable arrows + ready pills (mouse parity with the keyboard).
    this.root.querySelectorAll('[data-cs-arrow]').forEach((el) => {
      el.addEventListener('click', () => this._change(el.dataset.csPlayer, +el.dataset.csArrow));
    });
    this.root.querySelectorAll('[data-cs-ready]').forEach((el) => {
      el.addEventListener('click', () => this._setReady(el.dataset.csPlayer, true));
    });
  }

  _updateDom(player) {
    const e = this.els[player];
    const c = this.cars[this.order[this.sel[player]]];
    e.brand.textContent = c.brand;
    e.model.textContent = c.model;
    e.klass.textContent = c.klass;
    e.tier.textContent = `TIER ${c.tier}`;
    e.value.textContent = c.value.toLocaleString('en-US');
    e.speed.style.width = `${c.stats.speed * 10}%`;
    e.accel.style.width = `${c.stats.acceleration * 10}%`;
    e.handling.style.width = `${c.stats.handling * 10}%`;
    this._updateReadyUi(player);
  }

  _updateReadyUi(player) {
    const e = this.els[player];
    e.half.classList.toggle('is-ready', this.ready[player]);
    e.ready.textContent = this.ready[player] ? 'READY ✓' : (player === 'p1' ? 'PRESS W' : 'PRESS ↑');
  }

  // ---- input ----
  _bindInput() {
    this._onKey = (ev) => {
      if (this.done) return;
      const c = ev.code;
      const nav = { KeyA: ['p1', -1], KeyD: ['p1', 1], ArrowLeft: ['p2', -1], ArrowRight: ['p2', 1] };
      const yes = { KeyW: 'p1', Enter: 'p1', ArrowUp: 'p2', ShiftRight: 'p2', NumpadEnter: 'p2' };
      const no = { KeyS: 'p1', ArrowDown: 'p2' };
      if (nav[c]) { ev.preventDefault(); if (!ev.repeat) this._change(...nav[c]); }
      else if (yes[c]) { ev.preventDefault(); if (!ev.repeat) this._setReady(yes[c], true); }
      else if (no[c]) { ev.preventDefault(); if (!ev.repeat) this._setReady(no[c], false); }
    };
    window.addEventListener('keydown', this._onKey, true);
  }

  _change(player, dir) {
    if (this.done) return;
    const n = this.order.length;
    this.sel[player] = (this.sel[player] + dir + n) % n;
    this.ready[player] = false; // changing car drops Ready
    this._updateDom(player);
    this._show(player, this.order[this.sel[player]]);
  }

  _setReady(player, val) {
    if (this.done) return;
    this.ready[player] = val;
    this._updateReadyUi(player);
    if (this.ready.p1 && this.ready.p2) this._finish();
  }

  _finish() {
    this.done = true;
    this.root.classList.add('cs-go'); // brief "GET READY!" flourish
    setTimeout(() => {
      this.root.classList.add('hidden');
      setTimeout(() => {
        this._teardown();
        this._resolve({ p1: this.order[this.sel.p1], p2: this.order[this.sel.p2] });
      }, 500);
    }, 650);
  }

  // ---- loop / teardown ----
  _loop() {
    if (this.done && !this.raf) return;
    this.raf = this.done ? 0 : requestAnimationFrame(this._loop);
    const dt = this.clock.getDelta();
    this.pivots.p1.rotation.y += dt * 0.45;
    this.pivots.p2.rotation.y += dt * 0.45;
    const w = window.innerWidth, h = window.innerHeight, half = h / 2, r = this.renderer;
    r.setScissorTest(true);
    r.setViewport(0, half, w, half); r.setScissor(0, half, w, half); r.render(this.scene, this.cams.p1);
    r.setViewport(0, 0, w, half); r.setScissor(0, 0, w, half); r.render(this.scene, this.cams.p2);
    r.setScissorTest(false);
  }

  _teardown() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('resize', this._onResize);
    this.scene.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m?.dispose?.();
      }
    });
    this.renderer.dispose();
    this.root.style.display = 'none';
  }
}
