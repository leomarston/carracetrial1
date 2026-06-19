import * as THREE from 'three';

/**
 * Build invisible barrier walls along the OUTER (grass-facing) edge of the road.
 *
 * Approach: weld the road triangles and find boundary edges (used once). Every
 * boundary edge is either a true outer edge (grass beyond) or an internal one
 * (a segment seam, or the centre-median gap, with more road beyond). We tell
 * them apart by probing along the edge's OUTWARD normal: if road is found just
 * beyond the edge it's internal → dropped; otherwise it's an outer edge → walled.
 * Walls follow the actual mesh edges, so they're smooth (no stair-steps) and
 * never block driving along the road.
 *
 * @param {THREE.Object3D[]} roadMeshes
 * @param {object} [opts] { weld, height, drop, probes }
 * @returns {{vertices:Float32Array, indices:Uint32Array, faces:number}}
 */
export function buildRoadEdgeWalls(roadMeshes, opts = {}) {
  const weld = opts.weld ?? 0.3;
  const height = opts.height ?? 2.5;
  const drop = opts.drop ?? 0.6;
  const probes = opts.probes ?? [2, 4, 6.5];

  const verts = [];
  const vmap = new Map();
  const keyOf = (x, y, z) => `${Math.round(x / weld)},${Math.round(y / weld)},${Math.round(z / weld)}`;
  const vid = (p) => {
    const k = keyOf(p.x, p.y, p.z);
    let i = vmap.get(k);
    if (i === undefined) { i = verts.length; verts.push(p.clone()); vmap.set(k, i); }
    return i;
  };

  // edgeKey -> { count, a, b, third } (third = opposite vertex id of its triangle)
  const edges = new Map();
  const addEdge = (u, w, third) => {
    if (u === w) return;
    const k = u < w ? `${u}_${w}` : `${w}_${u}`;
    const e = edges.get(k);
    if (e) e.count++;
    else edges.set(k, { count: 1, a: u, b: w, third });
  };

  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const mesh of roadMeshes) {
    const g = mesh.geometry;
    const pos = g?.attributes?.position;
    if (!pos) continue;
    mesh.updateWorldMatrix(true, false);
    const m = mesh.matrixWorld;
    const index = g.index ? g.index.array : null;
    const triCount = index ? index.length / 3 : pos.count / 3;
    for (let t = 0; t < triCount; t++) {
      const i0 = index ? index[t * 3] : t * 3;
      const i1 = index ? index[t * 3 + 1] : t * 3 + 1;
      const i2 = index ? index[t * 3 + 2] : t * 3 + 2;
      const ia = vid(a.fromBufferAttribute(pos, i0).applyMatrix4(m));
      const ib = vid(b.fromBufferAttribute(pos, i1).applyMatrix4(m));
      const ic = vid(c.fromBufferAttribute(pos, i2).applyMatrix4(m));
      addEdge(ia, ib, ic);
      addEdge(ib, ic, ia);
      addEdge(ic, ia, ib);
    }
  }

  // Road-presence probe (downward raycast against the road meshes).
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const isRoadAt = (x, z, yRef) => {
    ray.set(new THREE.Vector3(x, yRef + 12, z), down);
    ray.far = 24;
    return ray.intersectObjects(roadMeshes, false).length > 0;
  };

  const V = [], I = [];
  let vo = 0, faces = 0;
  for (const e of edges.values()) {
    if (e.count !== 1) continue;
    const p0 = verts[e.a], p1 = verts[e.b], pt = verts[e.third];
    const dx = p1.x - p0.x, dz = p1.z - p0.z;
    const horiz = Math.hypot(dx, dz);
    const dy = Math.abs(p0.y - p1.y);
    if (horiz < 1e-3 || dy > horiz * 1.5) continue; // ignore near-vertical edges

    // Outward normal = away from the triangle (its third vertex), in the ground plane.
    const mx = (p0.x + p1.x) / 2, mz = (p0.z + p1.z) / 2, my = (p0.y + p1.y) / 2;
    let ox = mx - pt.x, oz = mz - pt.z;
    const ol = Math.hypot(ox, oz) || 1;
    ox /= ol; oz /= ol;

    // If road continues beyond this edge, it's a seam/median (internal) → skip.
    const roadBeyond = probes.some((d) => isRoadAt(mx + ox * d, mz + oz * d, my));
    if (roadBeyond) continue;

    const yb0 = p0.y - drop, yb1 = p1.y - drop;
    const yt0 = p0.y + height, yt1 = p1.y + height;
    V.push(p0.x, yb0, p0.z, p1.x, yb1, p1.z, p1.x, yt1, p1.z, p0.x, yt0, p0.z);
    I.push(vo, vo + 1, vo + 2, vo, vo + 2, vo + 3);
    vo += 4; faces++;
  }

  return { vertices: new Float32Array(V), indices: new Uint32Array(I), faces };
}
