/**
 * World Map / map-selection screen — shown after RACE, before car select. A
 * vertical stage list on the left, a map preview in the centre and an event-info
 * panel on the right. You can scroll onto any stage; locked ones display
 * "Coming soon" and can't be selected.
 *
 *   Up / Down (or W / S) move between stages, Enter selects, Esc/Backspace = back.
 *
 * runMapSelect resolves with the chosen map id, or 'back' to return to the menu.
 *
 * @param {{root: HTMLElement, maps: object[]}} opts
 * @returns {Promise<string>}  map id | 'back'
 */
export function runMapSelect({ root, maps }) {
  if (!instance) instance = new MapSelect(root, maps);
  return instance.open();
}

let instance;

// Locked-stage placeholder preview (dim street grid + padlock).
const LOCKED_PREVIEW = `
<svg viewBox="0 0 420 320" preserveAspectRatio="xMidYMid meet">
  <g fill="none" stroke="#5d6f6e" stroke-width="2" opacity="0.35">
    <path d="M50 80 H370 M50 140 H370 M50 200 H370 M50 260 H370"/>
    <path d="M110 50 V300 M180 50 V300 M250 50 V300 M320 50 V300"/>
  </g>
  <g transform="translate(210,160)" fill="#8ba09e" opacity="0.7">
    <rect x="-26" y="-4" width="52" height="38" rx="6"/>
    <path d="M-15 -4 v-11 a15 15 0 0 1 30 0 v11" fill="none" stroke="#8ba09e" stroke-width="6"/>
  </g>
</svg>`;

class MapSelect {
  constructor(root, maps) {
    this.root = root;
    this.maps = maps;
    this.index = 0;
    this.active = false;
    this.resolve = null;
    this.els = {
      stage: root.querySelector('#ms-stage'),
      preview: root.querySelector('#ms-preview'),
      previewImg: root.querySelector('#ms-preview-img'),
      status: root.querySelector('#ms-status'),
      type: root.querySelector('#ms-type'),
      dist: root.querySelector('#ms-dist'),
      best: root.querySelector('#ms-best'),
      select: root.querySelector('[data-ms-select]'),
      toast: root.querySelector('#ms-toast'),
    };
    this._buildDots();
    this._bind();
  }

  open() {
    this.active = true;
    this.index = this.maps.findIndex((m) => m.available); // start on the first playable
    if (this.index < 0) this.index = 0;
    this.root.style.display = 'block';
    this.root.classList.remove('hidden');
    this._render();
    return new Promise((res) => { this.resolve = res; });
  }

  _buildDots() {
    const wrap = this.root.querySelector('#ms-dots');
    wrap.innerHTML = '';
    this.dots = this.maps.map((m, i) => {
      const d = document.createElement('button');
      d.className = 'ms-dot' + (m.available ? '' : ' locked');
      d.addEventListener('click', () => { if (this.active) { this.index = i; this._render(); } });
      wrap.appendChild(d);
      return d;
    });
  }

  _bind() {
    window.addEventListener('keydown', (e) => this._key(e), true);
    this.root.querySelectorAll('[data-ms-nav]').forEach((el) =>
      el.addEventListener('click', () => { if (this.active) this._move(+el.dataset.msNav); }));
    this.els.select.addEventListener('click', () => { if (this.active) this._select(); });
    this.root.querySelectorAll('[data-ms-back]').forEach((el) =>
      el.addEventListener('click', () => { if (this.active) this._back(); }));
    this.root.querySelector('[data-ms-quit]').addEventListener('click',
      () => { if (this.active) this._deny(this.root.querySelector('[data-ms-quit]')); });
  }

  _key(e) {
    if (!this.active) return;
    switch (e.code) {
      case 'ArrowUp': case 'KeyW': e.preventDefault(); this._move(-1); break;
      case 'ArrowDown': case 'KeyS': e.preventDefault(); this._move(1); break;
      case 'Enter': case 'Space': case 'NumpadEnter': e.preventDefault(); this._select(); break;
      case 'Escape': case 'Backspace': e.preventDefault(); this._back(); break;
      default: break;
    }
  }

  _move(d) {
    const n = this.maps.length;
    this.index = Math.max(0, Math.min(n - 1, this.index + d));
    this._render();
  }

  _render() {
    const m = this.maps[this.index];
    this.dots.forEach((d, i) => d.classList.toggle('is-sel', i === this.index));
    this.els.stage.textContent = m.stage || m.name;
    this.els.previewImg.innerHTML = m.available ? (m.preview || '') : LOCKED_PREVIEW;
    this.els.preview.classList.toggle('is-locked', !m.available);
    this.els.status.textContent = m.available ? 'Open' : 'Coming Soon';
    this.els.status.classList.toggle('ok', m.available);
    this.els.status.classList.toggle('soon', !m.available);
    this.els.type.textContent = m.raceType || '—';
    this.els.dist.textContent = m.distance || '—';
    this.els.best.textContent = m.bestLap || '—';
    this.els.select.classList.toggle('is-disabled', !m.available);
  }

  _select() {
    const m = this.maps[this.index];
    if (!m.available) { this._toast('COMING SOON'); this._deny(this.els.select); return; }
    this._finish(m.id);
  }

  _back() { this._finish('back'); }

  _finish(result) {
    this.active = false;
    this.root.classList.add('hidden');
    const r = this.resolve; this.resolve = null;
    setTimeout(() => { this.root.style.display = 'none'; r && r(result); }, 400);
  }

  _toast(msg) {
    const t = this.els.toast;
    t.textContent = msg;
    t.classList.remove('show');
    void t.offsetWidth; // restart the animation
    t.classList.add('show');
  }

  _deny(el) {
    if (!el) return;
    el.classList.remove('ms-deny');
    void el.offsetWidth;
    el.classList.add('ms-deny');
  }
}
