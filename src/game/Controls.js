/**
 * Keyboard input for one driver, mapped by physical key code (so two players can
 * share the keyboard without layout clashes and left/right modifiers are distinct).
 *
 *   throttle: +1 forward (up), -1 reverse (down)
 *   steer:    +1 left, -1 right   (positive-left → maps directly to +Y yaw)
 */
export class Controls {
  /** @param {{up:string[],down:string[],left:string[],right:string[],handbrake:string[]}} map */
  constructor(map) {
    this.map = map;
    this.codes = new Set();
    const all = new Set([...map.up, ...map.down, ...map.left, ...map.right, ...map.handbrake, ...(map.boost ?? [])]);
    this._onDown = (e) => { if (all.has(e.code)) { e.preventDefault(); this.codes.add(e.code); } };
    this._onUp = (e) => this.codes.delete(e.code);
    window.addEventListener('keydown', this._onDown);
    window.addEventListener('keyup', this._onUp);
    window.addEventListener('blur', () => this.codes.clear()); // avoid stuck keys
  }

  _any(list) { for (const c of list) if (this.codes.has(c)) return true; return false; }

  get throttle() { return (this._any(this.map.up) ? 1 : 0) + (this._any(this.map.down) ? -1 : 0); }
  get steer() { return (this._any(this.map.left) ? 1 : 0) + (this._any(this.map.right) ? -1 : 0); }
  get handbrake() { return this._any(this.map.handbrake); }
  get boost() { return this._any(this.map.boost ?? []); }
}

/** Player 1: WASD + Space (handbrake) + Left-Shift (nitro). */
export const P1_KEYS = {
  up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
  handbrake: ['Space'], boost: ['ShiftLeft'],
};

/** Player 2: arrow keys + Right-Shift / Right-Ctrl (handbrake) + Numpad-0 / "/" (nitro). */
export const P2_KEYS = {
  up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
  handbrake: ['ShiftRight', 'ControlRight'], boost: ['Numpad0', 'Slash'],
};
