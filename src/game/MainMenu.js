import { Settings } from './settings.js';

/**
 * The very first screen: a racing-game style main menu over a full-screen
 * background (src/image2.png). A horizontal icon selector with three options —
 * RACE, SETTINGS, QUIT — navigated with the arrows/A-D and confirmed with Enter.
 *
 *   RACE     → resolves the promise ('race'); boot() then opens car select.
 *   SETTINGS → opens the Settings panel (Sound Effects volume, for now).
 *   QUIT     → no-op for now (just nudges, since a web page can't close itself).
 *
 * @param {{root: HTMLElement}} opts
 * @returns {Promise<'race'>}
 */
export function runMainMenu({ root }) {
  if (!instance) instance = new MainMenu(root);
  return instance.open();
}

let instance;

const OPTIONS = [
  { id: 'race', label: 'RACE' },
  { id: 'settings', label: 'SETTINGS' },
  { id: 'quit', label: 'QUIT' },
];

class MainMenu {
  constructor(root) {
    this.root = root;
    this.index = 0;
    this.mode = 'menu'; // 'menu' | 'settings'
    this.active = false;
    this.resolve = null;
    this.nodes = [...root.querySelectorAll('.mm-node')];
    this.labelEl = root.querySelector('#mm-sel-label');
    this.slider = root.querySelector('#mm-sfx');
    this.sfxVal = root.querySelector('#mm-sfx-val');
    this._bind(); // listeners are attached once; gated by this.active
  }

  // Show the menu (re-runnable; resolves with 'race' when the player starts).
  open() {
    this.active = true;
    this.index = 0;
    this.mode = 'menu';
    this.root.style.display = '';
    this.root.classList.remove('hidden', 'mm-settings-open');
    this._render();
    this.slider.value = Math.round(Settings.sfxVolume * 100);
    this._renderSfx();
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  _bind() {
    window.addEventListener('keydown', (e) => this._key(e), true);

    this.nodes.forEach((n, i) => {
      n.addEventListener('mouseenter', () => { if (this.active && this.mode === 'menu') { this.index = i; this._render(); } });
      n.addEventListener('click', () => { if (this.active) { this.index = i; this._render(); this._confirm(); } });
    });
    this.root.querySelectorAll('[data-mm-arrow]').forEach((el) => {
      el.addEventListener('click', () => { if (this.active && this.mode === 'menu') this._move(+el.dataset.mmArrow); });
    });

    this.slider.addEventListener('input', () => {
      Settings.setSfxVolume(this.slider.value / 100);
      this._renderSfx();
    });
    this.root.querySelector('#mm-settings-back').addEventListener('click', () => { if (this.active) this._closeSettings(); });
  }

  _key(e) {
    if (!this.active) return;
    if (this.mode === 'settings') {
      if (['Escape', 'Backspace', 'Enter', 'NumpadEnter'].includes(e.code)) { e.preventDefault(); this._closeSettings(); }
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); this._nudgeSfx(-5); }
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); this._nudgeSfx(5); }
      return;
    }
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': e.preventDefault(); this._move(-1); break;
      case 'ArrowRight': case 'KeyD': e.preventDefault(); this._move(1); break;
      case 'Enter': case 'Space': case 'NumpadEnter': e.preventDefault(); this._confirm(); break;
      default: break;
    }
  }

  _move(d) {
    const n = OPTIONS.length;
    this.index = (this.index + d + n) % n;
    this._render();
  }

  _render() {
    this.nodes.forEach((n, i) => n.classList.toggle('is-sel', i === this.index));
    this.labelEl.textContent = OPTIONS[this.index].label;
  }

  _confirm() {
    const id = OPTIONS[this.index].id;
    if (id === 'race') this._start();
    else if (id === 'settings') this._openSettings();
    else this._deny(this.nodes[this.index]); // quit: inert for now
  }

  _openSettings() { this.mode = 'settings'; this.root.classList.add('mm-settings-open'); }
  _closeSettings() { this.mode = 'menu'; this.root.classList.remove('mm-settings-open'); }

  _nudgeSfx(d) {
    this.slider.value = Math.max(0, Math.min(100, +this.slider.value + d));
    Settings.setSfxVolume(this.slider.value / 100);
    this._renderSfx();
  }

  _renderSfx() {
    this.sfxVal.textContent = `${Math.round(this.slider.value)}%`;
    this.slider.style.setProperty('--mm-fill', `${this.slider.value}%`);
  }

  _deny(node) {
    if (!node) return;
    node.classList.remove('mm-deny');
    void node.offsetWidth; // restart the animation
    node.classList.add('mm-deny');
  }

  _start() {
    this.active = false;
    this.root.classList.add('hidden');
    const r = this.resolve; this.resolve = null;
    setTimeout(() => { this.root.style.display = 'none'; r && r('race'); }, 450);
  }
}
