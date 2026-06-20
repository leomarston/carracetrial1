import * as THREE from 'three';

/**
 * Circular top-down minimap (racing-game style): a dark disc with the track
 * rasterised once into an offscreen canvas, then the start/finish marker and the
 * two cars (heading triangles) drawn each frame. The canvas is square so the
 * wrapper's border-radius makes a clean circle.
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

    const S = 150; // square → circular when clipped
    const pad = 16;
    canvas.width = S; canvas.height = S;
    this.size = S;

    const b = track.roadBounds;
    this.minX = b.minX; this.minZ = b.minZ;
    const worldW = b.maxX - b.minX, worldH = b.maxZ - b.minZ;
    this.scale = Math.min((S - pad * 2) / worldW, (S - pad * 2) / worldH);
    this.offX = (S - worldW * this.scale) / 2; // centre the track in the disc
    this.offZ = (S - worldH * this.scale) / 2;

    this._buildRoad(roadMeshes);
  }

  mx(x) { return this.offX + (x - this.minX) * this.scale; }
  my(z) { return this.offZ + (z - this.minZ) * this.scale; }

  _buildRoad(roadMeshes) {
    const off = document.createElement('canvas');
    off.width = this.canvas.width; off.height = this.canvas.height;
    const c = off.getContext('2d');
    c.fillStyle = 'rgba(196, 214, 232, 0.62)';
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

  update(car, race, car2) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.fillStyle = 'rgba(10, 14, 19, 0.9)'; // dark disc
    ctx.fillRect(0, 0, this.size, this.size);
    ctx.drawImage(this.roadCanvas, 0, 0);

    // start/finish marker
    const sl = this.track.startLine;
    const sx = this.mx(sl.x), sy = this.my(sl.z);
    ctx.strokeStyle = (race && race.finished) ? '#8dff3a' : '#ff3b30';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(sx - 6, sy); ctx.lineTo(sx + 6, sy); ctx.stroke();

    if (car2) this._drawCar(car2, '#eaf2ff', '#10202e'); // Player 2 = silver
    this._drawCar(car, '#ffb21a', '#3a2400'); // Player 1 = amber (on top)
  }

  /** Draw a car as a triangle pointing along its heading. */
  _drawCar(car, fill, stroke) {
    const ctx = this.ctx;
    const p = car.object3D.position;
    const cx = this.mx(p.x), cy = this.my(p.z);
    const h = car.heading;
    const fx = Math.sin(h), fz = Math.cos(h); // forward in world (x,z)
    const rx = fz, rz = -fx; // right
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(cx + fx * 6, cy + fz * 6);
    ctx.lineTo(cx - fx * 4 + rx * 3.2, cy - fz * 4 + rz * 3.2);
    ctx.lineTo(cx - fx * 4 - rx * 3.2, cy - fz * 4 - rz * 3.2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
  }
}
