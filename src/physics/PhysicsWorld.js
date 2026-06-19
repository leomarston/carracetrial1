import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

/**
 * Wraps a Rapier physics world with a FIXED-TIMESTEP loop.
 *
 * A fixed timestep is essential for stable vehicle dynamics: the simulation
 * advances in constant 1/60 s increments regardless of the render frame rate,
 * with an accumulator carrying the leftover time between frames.
 *
 * Call `await RAPIER.init()` once (in main) before constructing this.
 */
export class PhysicsWorld {
  constructor({ gravity = -20 } = {}) {
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: gravity, z: 0 });
    this.fixedDt = 1 / 60;
    this.world.timestep = this.fixedDt;
    this.accumulator = 0;
    this.maxSubSteps = 5;
    this.eventQueue = new RAPIER.EventQueue(true);

    this._debug = null; // THREE.LineSegments when enabled
  }

  /**
   * Build one static (fixed) trimesh collider from world-space geometry.
   * @param {Float32Array} vertices  flat [x,y,z, ...] in WORLD space
   * @param {Uint32Array} indices    flat triangle indices
   */
  addStaticTrimesh(vertices, indices) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const desc = RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(1.0);
    return this.world.createCollider(desc, body);
  }

  /**
   * Advance the simulation by `frameDt` seconds using fixed sub-steps.
   * `onFixedStep(h)` runs once before each world.step (where vehicle forces are set).
   */
  step(frameDt, onFixedStep) {
    this.accumulator += Math.min(frameDt, 0.1); // clamp long frames
    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < this.maxSubSteps) {
      if (onFixedStep) onFixedStep(this.fixedDt);
      this.world.step(this.eventQueue);
      this.accumulator -= this.fixedDt;
      steps++;
    }
    if (steps === this.maxSubSteps) this.accumulator = 0; // avoid spiral of death
  }

  /** Toggle a wireframe view of every collider (debugging). */
  setDebug(scene, on) {
    if (on && !this._debug) {
      const geom = new THREE.BufferGeometry();
      const mat = new THREE.LineBasicMaterial({ vertexColors: true });
      this._debug = new THREE.LineSegments(geom, mat);
      this._debug.frustumCulled = false;
      scene.add(this._debug);
    } else if (!on && this._debug) {
      scene.remove(this._debug);
      this._debug.geometry.dispose();
      this._debug = null;
    }
  }

  /** Refresh the debug wireframe (call each frame while enabled). */
  updateDebug() {
    if (!this._debug) return;
    const { vertices, colors } = this.world.debugRender();
    this._debug.geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    this._debug.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  }
}

/**
 * Merge an array of THREE meshes into one world-space {vertices, indices}
 * buffer suitable for a Rapier trimesh collider.
 */
export function buildTrimeshFromMeshes(meshes) {
  const positions = [];
  const indices = [];
  let vertexOffset = 0;
  const v = new THREE.Vector3();

  for (const mesh of meshes) {
    const geom = mesh.geometry;
    const pos = geom?.attributes?.position;
    if (!pos) continue;
    mesh.updateWorldMatrix(true, false);
    const mat = mesh.matrixWorld;

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mat);
      positions.push(v.x, v.y, v.z);
    }

    if (geom.index) {
      const idx = geom.index.array;
      for (let i = 0; i < idx.length; i++) indices.push(idx[i] + vertexOffset);
    } else {
      for (let i = 0; i < pos.count; i++) indices.push(i + vertexOffset);
    }
    vertexOffset += pos.count;
  }

  return {
    vertices: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}
