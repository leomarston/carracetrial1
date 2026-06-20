/** Headless GLB inspector: world-space bounds + node/material names + wheel hints. */
import { readFileSync } from 'node:fs';
import { Matrix4, Vector3, Quaternion, Box3 } from 'three';
const path = process.argv[2];
const excludeRe = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;
const buf = readFileSync(path);
let off = 12, json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(data));
  else if (type === 0x004e4942) bin = data;
  off += 8 + len;
}
const g = json, scene = g.scenes[g.scene ?? 0];
function nodeMatrix(n){const m=new Matrix4();if(n.matrix)return m.fromArray(n.matrix);
  const t=n.translation?new Vector3().fromArray(n.translation):new Vector3();
  const q=n.rotation?new Quaternion().fromArray(n.rotation):new Quaternion();
  const s=n.scale?new Vector3().fromArray(n.scale):new Vector3(1,1,1);return m.compose(t,q,s);}
const world=new Box3(); world.makeEmpty();
const meshes=[]; const nodeNames=[];
function walk(idx,parent){const n=g.nodes[idx];const m=new Matrix4().multiplyMatrices(parent,nodeMatrix(n));
  if(n.name)nodeNames.push(n.name);
  if(n.mesh!=null && !(excludeRe&&excludeRe.test(n.name||''))){
    const mesh=g.meshes[n.mesh]; const mb=new Box3();mb.makeEmpty();
    for(const prim of mesh.primitives){const acc=g.accessors[prim.attributes.POSITION];if(!acc||!acc.min||!acc.max)continue;
      const local=new Box3(new Vector3().fromArray(acc.min),new Vector3().fromArray(acc.max));
      const wb=local.clone().applyMatrix4(m);mb.union(wb);world.union(wb);}
    meshes.push({name:n.name||mesh.name||`mesh${n.mesh}`,box:mb});}
  for(const c of n.children??[])walk(c,m);}
for(const r of scene.nodes)walk(r,new Matrix4());
const size=world.getSize(new Vector3()),center=world.getCenter(new Vector3());
console.log('WORLD size  ',[size.x,size.y,size.z].map(v=>v.toFixed(3)).join(' , '));
console.log('WORLD center',[center.x,center.y,center.z].map(v=>v.toFixed(3)).join(' , '));
console.log('WORLD min   ',[world.min.x,world.min.y,world.min.z].map(v=>v.toFixed(2)).join(' , '));
console.log('WORLD max   ',[world.max.x,world.max.y,world.max.z].map(v=>v.toFixed(2)).join(' , '));
console.log(`\n${g.meshes.length} meshes, ${g.nodes.length} nodes, ${(g.materials||[]).length} materials`);
console.log('extensions:', (g.extensionsUsed||[]).join(', ')||'none');
console.log('materials:', (g.materials||[]).map(m=>m.name).join(', '));
console.log('\nmesh world boxes (name : center z | size):');
for(const m of meshes){const s=m.box.getSize(new Vector3()),c=m.box.getCenter(new Vector3());
  console.log(`  ${m.name.padEnd(34)} cz=${c.z.toFixed(2).padStart(7)} cx=${c.x.toFixed(2).padStart(7)} size ${[s.x,s.y,s.z].map(v=>v.toFixed(2)).join(',')}`);}
const wheelish=nodeNames.filter(n=>/wheel|tyre|tire|rim|brake|light|glow/i.test(n));
console.log('\nwheel/light-ish nodes:', wheelish.join(', '));
