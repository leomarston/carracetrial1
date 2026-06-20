/**
 * Offline validator for the AI racing line. Extracts the map's road triangles
 * from the GLB, runs the SAME buildCenterline() the game uses, and renders a
 * top-down PNG (road = grey, centerline = red dots, spawn = green, centre = +)
 * so we can eyeball that the line stays on one carriageway around the loop.
 *
 *   node scripts/gen-centerline.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Matrix4, Vector3, Quaternion } from 'three';
import { buildCenterline, subdivTriangle } from '../src/game/trackPath.js';
import { TRACKS } from '../src/game/tracks.js';

const TRACK = TRACKS.highway;
const buf = readFileSync('public/models/carracemap1.glb');

// --- GLB parse ---
let off = 12, json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(data));
  else if (type === 0x004e4942) bin = data;
  off += 8 + len;
}
const g = json;

function accessor(i) {
  const a = g.accessors[i];
  const bv = g.bufferViews[a.bufferView];
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const compSize = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
  const numComp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
  const stride = bv.byteStride || compSize * numComp;
  const out = new Array(a.count * numComp);
  for (let e = 0; e < a.count; e++) {
    const base = start + e * stride;
    for (let c = 0; c < numComp; c++) {
      const o = base + c * compSize;
      let v;
      switch (a.componentType) {
        case 5126: v = bin.readFloatLE(o); break;
        case 5125: v = bin.readUInt32LE(o); break;
        case 5123: v = bin.readUInt16LE(o); break;
        case 5121: v = bin.readUInt8(o); break;
        default: v = bin.readUInt16LE(o);
      }
      out[e * numComp + c] = v;
    }
  }
  return out;
}

function nodeMatrix(n) {
  const m = new Matrix4();
  if (n.matrix) return m.fromArray(n.matrix);
  const t = n.translation ? new Vector3().fromArray(n.translation) : new Vector3();
  const q = n.rotation ? new Quaternion().fromArray(n.rotation) : new Quaternion();
  const s = n.scale ? new Vector3().fromArray(n.scale) : new Vector3(1, 1, 1);
  return m.compose(t, q, s);
}

const pts = [];
const scene = g.scenes[g.scene ?? 0];
const v = new Vector3();
function walk(idx, parent) {
  const n = g.nodes[idx];
  const m = new Matrix4().multiplyMatrices(parent, nodeMatrix(n));
  if (n.mesh != null && /Road2/i.test(n.name || '')) {
    for (const prim of g.meshes[n.mesh].primitives) {
      const pos = accessor(prim.attributes.POSITION);
      const idxArr = prim.indices != null ? accessor(prim.indices) : null;
      const tris = idxArr ? idxArr.length / 3 : pos.length / 3 / 3;
      for (let t = 0; t < tris; t++) {
        const tv = [];
        for (let k = 0; k < 3; k++) {
          const vi = idxArr ? idxArr[t * 3 + k] : t * 3 + k;
          v.set(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]).applyMatrix4(m);
          tv.push({ x: v.x, y: v.y, z: v.z });
        }
        const [A, B, C] = tv;
        subdivTriangle(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z, (x, y, z) => pts.push({ x, y, z }));
      }
    }
  }
  for (const c of n.children ?? []) walk(c, m);
}
for (const r of scene.nodes) walk(r, new Matrix4());
console.log(`road triangles: ${pts.length}`);

// --- centerline ---
const center = TRACK.loopCenter;
const spawn = TRACK.spawn;
const seedRadius = Math.hypot(spawn.x - center.x, spawn.z - center.z);
const seedAngle = Math.atan2(spawn.z - center.z, spawn.x - center.x);
const wps = buildCenterline(pts, { center, seedRadius, seedAngle, bins: TRACK.path?.bins ?? 240, gap: TRACK.path?.gap, dir: TRACK.path?.dir ?? -1, laneOffset: TRACK.path?.laneOffset });
console.log(`waypoints: ${wps.length}, seedR=${seedRadius.toFixed(0)} seedA=${seedAngle.toFixed(2)}`);
writeFileSync('scripts/centerline.json', JSON.stringify(wps));

// --- render PNG ---
const b = TRACK.roadBounds;
const W = 900, H = Math.round(W * (b.maxZ - b.minZ) / (b.maxX - b.minX));
const sx = (x) => Math.round((x - b.minX) / (b.maxX - b.minX) * (W - 1));
const sy = (z) => Math.round((z - b.minZ) / (b.maxZ - b.minZ) * (H - 1));
const img = Buffer.alloc(W * H * 3, 12); // dark bg
const px = (x, y, r, gr, bl) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 3; img[o] = r; img[o + 1] = gr; img[o + 2] = bl;
};
const dot = (x, y, r, gr, bl, rad = 0) => {
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) px(x + dx, y + dy, r, gr, bl);
};
for (const p of pts) px(sx(p.x), sy(p.z), 90, 90, 95); // road grey
wps.forEach((p, i) => dot(sx(p.x), sy(p.z), i === 0 ? 80 : 255, i === 0 ? 255 : 40, 40, 2)); // line red, wp0 green
dot(sx(center.x), sy(center.z), 80, 160, 255, 4); // centre blue
dot(sx(spawn.x), sy(spawn.z), 60, 255, 90, 4); // spawn green

// PNG encode (RGB, no filter)
function png(buf3, w, h) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; buf3.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const idat = deflateSync(raw);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8); return c ^ 0xffffffff; }

writeFileSync('scripts/centerline.png', png(img, W, H));
console.log(`wrote scripts/centerline.png (${W}x${H})`);
