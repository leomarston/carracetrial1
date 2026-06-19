/**
 * Keyboard input for driving. Supports both WASD and arrow keys.
 *
 *   throttle: +1 forward (W / ArrowUp), -1 reverse (S / ArrowDown)
 *   steer:    +1 left    (A / ArrowLeft), -1 right  (D / ArrowRight)
 *
 * (steer is positive-left so it maps directly to a +Y yaw rotation.)
 */
export class Controls {
  constructor(target = window) {
    this.keys = new Set();
    this._onDown = (e) => {
      const k = e.key.toLowerCase();
      if (DRIVE_KEYS.has(k)) e.preventDefault();
      this.keys.add(k);
    };
    this._onUp = (e) => this.keys.delete(e.key.toLowerCase());
    target.addEventListener('keydown', this._onDown);
    target.addEventListener('keyup', this._onUp);
    // Release everything if the tab loses focus (avoids "stuck" keys).
    window.addEventListener('blur', () => this.keys.clear());
  }

  get throttle() {
    let v = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) v += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) v -= 1;
    return v;
  }

  get steer() {
    let v = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) v += 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) v -= 1;
    return v;
  }

  get handbrake() {
    return this.keys.has(' ');
  }
}

const DRIVE_KEYS = new Set([
  'w', 'a', 's', 'd',
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ',
]);
