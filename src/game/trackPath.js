/**
 * Track centerline ("racing line") generation for the AI.
 *
 * The circuit is roughly star-shaped around the loop centre (the same property
 * that lets us validate laps by ~360° of angular progress). So we sample the
 * road surface, bucket the samples by angle around the loop centre, and at each
 * angle take the midpoint of the drivable band — walking the angles in the
 * driving direction and staying on ONE carriageway by following continuity from
 * the player's starting radius. The result is an ordered loop of waypoints the
 * AI can chase.
 *
 * The core `buildCenterline` is pure (takes plain {x,z} points) so it can run
 * both in the game and in the offline visualiser, guaranteeing they agree.
 */
import * as THREE from 'three';

/**
 * @param {{x:number,z:number}[]} points  road-surface samples (world XZ)
 * @param {object} opts
 * @param {{x:number,z:number}} opts.center   loop centre
 * @param {number} opts.seedRadius            player's starting radius (carriageway pick)
 * @param {number} opts.seedAngle             player's starting angle around centre
 * @param {number} [opts.bins=240]            angular resolution
 * @param {number} [opts.gap=14]              radial gap (m) that splits carriageways
 * @param {number} [opts.smooth=4]            circular moving-average half-window
 * @param {1|-1} [opts.dir=-1]               driving direction in θ (−1 = decreasing)
 * @returns {{x:number,z:number}[]} ordered waypoints in the driving direction
 */
export function buildCenterline(points, opts) {
  const { center, seedRadius, seedAngle = 0, bins = 240, gap = 14, smooth = 4, dir = -1 } = opts;
  const startBin = (((Math.floor(((seedAngle + Math.PI) / (2 * Math.PI)) * bins)) % bins) + bins) % bins;

  // Bucket sample radii by angle.
  const buckets = Array.from({ length: bins }, () => []);
  for (const p of points) {
    const dx = p.x - center.x, dz = p.z - center.z;
    const r = Math.hypot(dx, dz);
    const a = Math.atan2(dz, dx); // [-π, π]
    const bi = (Math.floor(((a + Math.PI) / (2 * Math.PI)) * bins) % bins + bins) % bins;
    buckets[bi].push(r);
  }

  // Per bin: contiguous radius clusters (split by gaps = separate carriageways).
  const clustersPerBin = buckets.map((rs) => {
    if (!rs.length) return [];
    rs.sort((a, b) => a - b);
    const clusters = [];
    let lo = rs[0], prev = rs[0];
    for (let i = 1; i < rs.length; i++) {
      if (rs[i] - prev > gap) { clusters.push({ lo, hi: prev }); lo = rs[i]; }
      prev = rs[i];
    }
    clusters.push({ lo, hi: prev });
    return clusters.map((c) => ({ mid: (c.lo + c.hi) / 2, width: c.hi - c.lo }));
  });

  // Find the start bin (nearest the seed angle is irrelevant — we loop fully —
  // but we must seed the radius, so start at any bin with data near seedRadius).
  // Walk all bins in the driving direction, choosing at each step the cluster
  // whose midpoint is closest to the previous radius (continuity → one lane),
  // gently biased toward the wider cluster. Empty bins carry the radius forward.
  const binAngle = (bi) => -Math.PI + (bi + 0.5) * (2 * Math.PI / bins);

  // Two passes: the first establishes a stable radius profile (the seed may be
  // off if we happen to start in a sparse bin), the second locks it in.
  let radius = new Array(bins).fill(null);
  let prevR = seedRadius;
  // Start the walk at the bin containing the seed angle so continuity begins
  // where we actually know the radius (the spawn).
  for (let pass = 0; pass < 2; pass++) {
    for (let step = 0; step < bins; step++) {
      const bi = ((startBin + dir * step) % bins + bins) % bins;
      const cs = clustersPerBin[bi];
      if (cs.length) {
        let best = cs[0], bestScore = Infinity;
        for (const c of cs) {
          const score = Math.abs(c.mid - prevR) - 0.15 * c.width; // prefer near + wide
          if (score < bestScore) { bestScore = score; best = c; }
        }
        radius[bi] = best.mid;
        prevR = best.mid;
      } else if (radius[bi] != null) {
        prevR = radius[bi];
      }
    }
  }
  // Fill any still-empty bins by interpolation from neighbours.
  fillGaps(radius);

  // Circular moving-average smooth.
  const smoothed = radius.map((_, bi) => {
    let sum = 0, n = 0;
    for (let k = -smooth; k <= smooth; k++) {
      const j = ((bi + k) % bins + bins) % bins;
      if (radius[j] != null) { sum += radius[j]; n++; }
    }
    return n ? sum / n : radius[bi];
  });

  // Emit waypoints in the driving direction.
  const wps = [];
  for (let step = 0; step < bins; step++) {
    const bi = ((startBin + dir * step) % bins + bins) % bins;
    const a = binAngle(bi);
    const r = smoothed[bi];
    if (r == null) continue;
    wps.push({ x: center.x + r * Math.cos(a), z: center.z + r * Math.sin(a) });
  }

  // Optionally shift the line off the geometric middle onto one carriageway. On a
  // divided highway the middle line runs down the median (walled); "right of the
  // travel direction" is locally consistent even where the loop is concave, so a
  // right offset reliably picks the player's lane — but it's CLAMPED to stay on
  // the road (with margin) so it never overshoots into a wall where the road is
  // narrow or diagonal.
  const line = opts.laneOffset ? offsetLane(wps, opts.laneOffset, points) : wps;
  attachHeight(line, points); // road Y per waypoint (for AI auto-rescue placement)
  return line;
}

/** Set each waypoint's `.y` to the nearest road sample's height. */
function attachHeight(wps, points) {
  const cell = 6;
  const grid = new Map();
  const key = (a, b) => a + ',' + b;
  for (const p of points) {
    const k = key(Math.floor(p.x / cell), Math.floor(p.z / cell));
    let arr = grid.get(k); if (!arr) grid.set(k, arr = []); arr.push(p);
  }
  for (const w of wps) {
    const cx = Math.floor(w.x / cell), cz = Math.floor(w.z / cell);
    let bestY = null, bd = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const arr = grid.get(key(cx + dx, cz + dz)); if (!arr) continue;
      for (const p of arr) { const ex = p.x - w.x, ez = p.z - w.z; const d = ex * ex + ez * ez; if (d < bd) { bd = d; bestY = p.y; } }
    }
    if (bestY != null) w.y = bestY;
  }
}

/**
 * Shift each waypoint to the right of travel by up to `offset`, scanning the road
 * samples so it stops just inside the right edge (never off the road). The median
 * gap is bridged (so it can hop the median onto the right carriageway) but the
 * outer edge keeps a safety margin for the car's width.
 */
function offsetLane(wps, offset, points) {
  const cell = 4;
  const grid = new Map();
  const key = (a, b) => a + ',' + b;
  for (const p of points) {
    const k = key(Math.floor(p.x / cell), Math.floor(p.z / cell));
    let arr = grid.get(k); if (!arr) grid.set(k, arr = []); arr.push(p);
  }
  const R = 3, R2 = R * R, MARGIN = 5, CAP = offset + 10; // R bridges the ~4 m median
  const onRoad = (x, z) => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const arr = grid.get(key(cx + dx, cz + dz)); if (!arr) continue;
      for (const p of arr) { const ex = p.x - x, ez = p.z - z; if (ex * ex + ez * ez <= R2) return true; }
    }
    return false;
  };
  const n = wps.length;
  const BASE = 3; // normal baseline (±BASE waypoints) → stable direction through curves
  const normals = [], ts = [];
  for (let i = 0; i < n; i++) {
    const a = wps[(i - BASE + n) % n], b = wps[(i + BASE) % n];
    const tx = b.x - a.x, tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    const nx = -tz / tl, nz = tx / tl; // right-of-travel normal
    normals.push([nx, nz]);
    // furthest contiguous on-road distance to the right of the middle line
    let hi = 0;
    for (let d = 0.5; d <= CAP; d += 0.5) {
      if (onRoad(wps[i].x + nx * d, wps[i].z + nz * d)) hi = d; else break;
    }
    ts.push(Math.min(offset, Math.max(0, hi - MARGIN))); // clamp inside the edge
  }
  // Heavily smooth the offset distance so the line can't jink across the median.
  const st = ts.map((_, i) => {
    let s = 0, c = 0; for (let k = -5; k <= 5; k++) { s += ts[(i + k + n) % n]; c++; }
    return s / c;
  });
  return wps.map((p, i) => ({ x: p.x + normals[i][0] * st[i], z: p.z + normals[i][1] * st[i] }));
}

function fillGaps(radius) {
  const n = radius.length;
  // forward-fill then backward-fill (circular) so no nulls remain.
  for (let i = 0; i < n * 2; i++) {
    const a = i % n, b = (i + 1) % n;
    if (radius[a] != null && radius[b] == null) radius[b] = radius[a];
  }
}

/**
 * Sample a triangle (XZ) into a dense point grid (~`step` m spacing). The road is
 * very low-poly — big triangles — so vertices/centroids alone leave huge holes in
 * the interior; a barycentric grid gives solid coverage for the on-road test.
 */
export function subdivTriangle(ax, ay, az, bx, by, bz, cx, cy, cz, push, step = 2.5) {
  const ab = Math.hypot(bx - ax, bz - az);
  const ac = Math.hypot(cx - ax, cz - az);
  const bc = Math.hypot(cx - bx, cz - bz);
  const n = Math.max(1, Math.min(20, Math.ceil(Math.max(ab, ac, bc) / step)));
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n - i; j++) {
      const a = i / n, b = j / n, c = 1 - a - b;
      push(ax * a + bx * b + cx * c, ay * a + by * b + cy * c, az * a + bz * b + cz * c);
    }
  }
}

/** Collect dense road-surface sample points (world X,Y,Z) from meshes. */
export function roadSamplesFromMeshes(roadMeshes) {
  const pts = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const push = (x, y, z) => pts.push({ x, y, z });
  for (const mesh of roadMeshes) {
    const g = mesh.geometry; const pos = g?.attributes?.position; if (!pos) continue;
    mesh.updateWorldMatrix(true, false); const m = mesh.matrixWorld;
    const idx = g.index ? g.index.array : null;
    const tris = idx ? idx.length / 3 : pos.count / 3;
    for (let t = 0; t < tris; t++) {
      const i0 = idx ? idx[t * 3] : t * 3;
      const i1 = idx ? idx[t * 3 + 1] : t * 3 + 1;
      const i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(m);
      b.fromBufferAttribute(pos, i1).applyMatrix4(m);
      c.fromBufferAttribute(pos, i2).applyMatrix4(m);
      subdivTriangle(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, push);
    }
  }
  return pts;
}

/** Nearest waypoint index to a position (linear scan; loops are small). */
export function nearestIndex(wps, x, z, from = 0, window = 0) {
  let best = from, bd = Infinity;
  const n = wps.length;
  const lo = window ? from - window : 0;
  const hi = window ? from + window : n;
  for (let k = lo; k < hi; k++) {
    const i = ((k % n) + n) % n;
    const dx = wps[i].x - x, dz = wps[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
