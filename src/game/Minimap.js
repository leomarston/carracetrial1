import * as THREE from 'three';

/**
 * Top-down minimap. The road triangles are rasterised once into an offscreen
 * canvas (clean track outline); each frame we draw that, the start/finish
 * marker, and the car (a heading triangle).
 */
export class Minimap {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {THREE.Object3D[]} roadMeshes
   * @param {object} track
   */
  constructor(canvas, roadMeshes, track) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.track = track;
    const b = track.roadBounds;
    this.minX = b.minX; this.minZ = b.minZ;
    const worldW = b.maxX - b.minX, worldH = b.maxZ - b.minZ;
    const pad = 8;
    const maxW = 150, maxH = 210;
    this.scale = Math.min(maxW / worldW, maxH / worldH);
    this.w = worldW * this.scale;
    this.h = worldH * this.scale;
    canvas.width = this.w + pad * 2;
    canvas.height = this.h + pad * 2;
    this.pad = pad;

    this._buildRoad(roadMeshes);
  }

  mx(x) { return this.pad + (x - this.minX) * this.scale; }
  my(z) { return this.pad + (z - this.minZ) * this.scale; }

  _buildRoad(roadMeshes) {
    const off = document.createElement('canvas');
    off.width = this.canvas.width; off.height = this.canvas.height;
    const c = off.getContext('2d');
    c.fillStyle = 'rgba(255,255,255,0.85)';
    const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
    for (const mesh of roadMeshes) {
      const g = mesh.geometry; const pos = g?.attributes?.position; if (!pos) continue;
      mesh.updateWorldMatrix(true, false); const m = mesh.matrixWorld;
      const idx = g.index ? g.index.array : null;
      const tris = idx ? idx.length / 3 : pos.count / 3;
      for (let t = 0; t < tris; t++) {
        const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(m);
        b.fromBufferAttribute(pos, i1).applyMatrix4(m);
        d.fromBufferAttribute(pos, i2).applyMatrix4(m);
        c.beginPath();
        c.moveTo(this.mx(a.x), this.my(a.z));
        c.lineTo(this.mx(b.x), this.my(b.z));
        c.lineTo(this.mx(d.x), this.my(d.z));
        c.closePath();
        c.fill();
      }
    }
    this.roadCanvas = off;
  }

  update(car, race) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.roadCanvas, 0, 0);

    // start/finish marker
    const sl = this.track.startLine;
    const sx = this.mx(sl.x), sy = this.my(sl.z);
    ctx.strokeStyle = (race && race.finished) ? '#46d36a' : '#ff3b30';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(sx - 6, sy); ctx.lineTo(sx + 6, sy); ctx.stroke();

    // car (triangle pointing along heading)
    const p = car.object3D.position;
    const cx = this.mx(p.x), cy = this.my(p.z);
    const h = car.heading;
    const fx = Math.sin(h), fz = Math.cos(h); // forward in world (x,z)
    const rx = fz, rz = -fx; // right
    const L = 5, Wd = 3;
    ctx.fillStyle = '#39c5ff';
    ctx.beginPath();
    ctx.moveTo(cx + fx * L * this.scale * 0 + fx * 6, cy + fz * 6);
    ctx.lineTo(cx - fx * 4 + rx * 3.2, cy - fz * 4 + rz * 3.2);
    ctx.lineTo(cx - fx * 4 - rx * 3.2, cy - fz * 4 - rz * 3.2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0a2b3a'; ctx.lineWidth = 1; ctx.stroke();
  }
}
