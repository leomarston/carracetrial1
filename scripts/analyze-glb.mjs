/**
 * Headless GLB inspector: measures the *world-space* bounding box (after the
 * scene's node transforms, e.g. Sketchfab's baked root matrix) and prints the
 * node/mesh/material names — so we can pick targetWidth/flip and find wheels.
 *
 * Pure parse of the GLB container + accessor min/max (no renderer needed).
 *   node scripts/analyze-glb.mjs public/models/lamborghini.glb
 */
import { readFileSync } from 'node:fs';
import { Matrix4, Vector3, Quaternion, Box3 } from 'three';

const path = process.argv[2];
if (!path) { console.error('usage: analyze-glb.mjs <file.glb>'); process.exit(1); }
const excludeRe = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;

const buf = readFileSync(path);
// --- GLB container: 12-byte header, then chunks (JSON, then BIN) ---
const magic = buf.readUInt32LE(0);
if (magic !== 0x46546c67) throw new Error('not a GLB');
let off = 12;
let json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off);
  const type = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(data));
  else if (type === 0x004e4942) bin = data;
  off += 8 + len;
}

const g = json;
const scene = g.scenes[g.scene ?? 0];

function nodeMatrix(n) {
  const m = new Matrix4();
  if (n.matrix) { m.fromArray(n.matrix); return m; }
  const t = n.translation ? new Vector3().fromArray(n.translation) : new Vector3();
  const q = n.rotation ? new Quaternion().fromArray(n.rotation) : new Quaternion();
  const s = n.scale ? new Vector3().fromArray(n.scale) : new Vector3(1, 1, 1);
  return m.compose(t, q, s);
}

const world = new Box3();
world.makeEmpty();
const meshes = []; // { name, worldBox, parent }
const allNodeNames = [];

function walk(idx, parentMat) {
  const n = g.nodes[idx];
  const m = new Matrix4().multiplyMatrices(parentMat, nodeMatrix(n));
  if (n.name) allNodeNames.push(n.name);
  if (n.mesh != null && !(excludeRe && excludeRe.test(n.name || ''))) {
    const mesh = g.meshes[n.mesh];
    const mb = new Box3(); mb.makeEmpty();
    for (const prim of mesh.primitives) {
      const acc = g.accessors[prim.attributes.POSITION];
      if (!acc || !acc.min || !acc.max) continue;
      const local = new Box3(new Vector3().fromArray(acc.min), new Vector3().fromArray(acc.max));
      const wb = local.clone().applyMatrix4(m);
      mb.union(wb);
      world.union(wb);
    }
    meshes.push({ name: n.name || mesh.name || `mesh${n.mesh}`, box: mb });
  }
  for (const c of n.children ?? []) walk(c, m);
}
for (const r of scene.nodes) walk(r, new Matrix4());

const size = world.getSize(new Vector3());
const center = world.getCenter(new Vector3());
console.log('=== WORLD bounds (after node transforms) ===');
console.log('size  ', [size.x, size.y, size.z].map((v) => v.toFixed(3)).join(' , '));
console.log('center', [center.x, center.y, center.z].map((v) => v.toFixed(3)).join(' , '));
console.log('min   ', [world.min.x, world.min.y, world.min.z].map((v) => v.toFixed(3)).join(' , '));
console.log('max   ', [world.max.x, world.max.y, world.max.z].map((v) => v.toFixed(3)).join(' , '));

console.log(`\n=== ${g.meshes.length} meshes, ${g.nodes.length} nodes, ${(g.materials||[]).length} materials ===`);
console.log('\nMaterials:', (g.materials || []).map((m) => m.name).join(', '));

console.log('\nMesh world boxes (name : center z | z-range | size x,y,z):');
for (const m of meshes) {
  const s = m.box.getSize(new Vector3());
  const c = m.box.getCenter(new Vector3());
  console.log(`  ${m.name.padEnd(40)} cz=${c.z.toFixed(2).padStart(6)}  z[${m.box.min.z.toFixed(2)},${m.box.max.z.toFixed(2)}]  size ${[s.x, s.y, s.z].map((v) => v.toFixed(2)).join(',')}`);
}

// Wheel centres (world) to determine front/back along Z and the body track.
console.log('\nWheel tyre centres (world x,y,z):');
for (const m of meshes) {
  if (!/_tires_/i.test(m.name)) continue;
  const c = m.box.getCenter(new Vector3());
  console.log(`  ${m.name.padEnd(28)} ${[c.x, c.y, c.z].map((v) => v.toFixed(3)).join(' , ')}`);
}

// Heuristic: candidate wheel nodes/meshes by name.
const wheelish = allNodeNames.filter((n) => /wheel|tyre|tire|rim|caliper/i.test(n));
console.log('\nWheel-ish node names:', wheelish.join(', '));
