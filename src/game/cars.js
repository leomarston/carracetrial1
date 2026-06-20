/**
 * Car catalog. Each car is defined by rating stats out of 10 — those ratings
 * directly drive the physics tuning (see statsToTuning), so adding a new car is
 * just a new entry here plus its model. The same ratings are shown in the HUD.
 *
 * Stats (0–10):
 *   speed        – top speed
 *   acceleration – how hard it pulls
 *   grip         – tyre grip / "yol tutuşu" (road holding)
 *   braking      – stopping power
 *   handling     – steering response & stability (higher = more planted)
 */

// Every car is scaled to this fixed body width (metres) so they're all a
// consistent size on track — the car's length/height then follow its own model.
export const CAR_WIDTH = 2.77;

export const CARS = {
  // Player 1's car. "Mercedes-Benz Silver Lightning" (Sketchfab, CC-BY-4.0).
  // Real-world metres, nose points +Z (no flip); the emissive "_glows" billboard
  // planes are hidden so they don't float or skew sizing.
  mercedes: {
    id: 'mercedes',
    name: 'Mercedes Silver Lightning',
    url: 'models/mercedes.glb',
    targetWidth: CAR_WIDTH,
    flip: false,
    mass: 950,
    paintColor: 0xc9ced2, // silver
    // Fast and eager, a touch looser than the Koenigsegg.
    stats: { speed: 10, acceleration: 9, grip: 6, braking: 8, handling: 6 },
    hideMeshes: /glows/i,
    // Each wheel is a group node (wheel_FL/FR/BL/BR) holding its rim + details.
    wheelGroupRe: /^wheel_(FL|FR|BL|BR)$/i,
  },

  // Player 2's car. The asset (lamborghini.glb) is actually a Koenigsegg CC850
  // by amogusstrikesback2 (CC-BY-4.0). It's already in real-world metres and its
  // nose points +Z, so no flip; the emissive "_glows" billboard planes (one juts
  // ~1.9 m past the nose) are hidden so they don't float or skew sizing.
  lambo: {
    id: 'lambo',
    name: 'Koenigsegg CC850',
    url: 'models/lamborghini.glb',
    targetWidth: CAR_WIDTH * 1.15, // a little bigger than Player 1's car
    flip: false,
    mass: 1200,
    paintColor: 0x189e74, // emerald
    // Grippy and planted (a Koenigsegg): carries corner speed cleanly. The
    // Mercedes is faster on top end but twitchier — a fair head-to-head.
    stats: { speed: 9, acceleration: 8, grip: 8, braking: 8, handling: 8 },
    hideMeshes: /glows/i,
    // Each wheel is a group node (wheelFL/FR/BL/BR) holding its rim + tyre.
    wheelGroupRe: /^wheel(FL|FR|BL|BR)$/i,
  },

  // --- AI bots (same Sketchfab rig family: real-world metres, nose +Z, "_glows"
  //     planes hidden, wheel groups wheel(FL/FR/BL/BR)). Scaled to CAR_WIDTH. ---
  mclaren: {
    id: 'mclaren', name: 'McLaren Artura', url: 'models/mclaren.glb',
    targetWidth: CAR_WIDTH, flip: false, mass: 1400, paintColor: 0xff5a00, // papaya orange
    stats: { speed: 10, acceleration: 9, grip: 8, braking: 8, handling: 8 },
    hideMeshes: /glows/i, wheelGroupRe: /^wheel(FL|FR|BL|BR)$/i,
  },
  audi: {
    id: 'audi', name: 'Audi R8 e-tron', url: 'models/audi.glb',
    targetWidth: CAR_WIDTH, flip: false, mass: 1600, paintColor: 0x1846a0, // blue
    stats: { speed: 9, acceleration: 9, grip: 8, braking: 8, handling: 7 },
    hideMeshes: /glows/i, wheelGroupRe: /^wheel(FL|FR|BL|BR)$/i,
  },
  dezir: {
    id: 'dezir', name: 'Renault DeZir', url: 'models/dezir.glb',
    targetWidth: CAR_WIDTH, flip: false, mass: 1300, paintColor: 0xc01526, // red
    stats: { speed: 8, acceleration: 8, grip: 7, braking: 7, handling: 8 },
    hideMeshes: /glows/i, wheelGroupRe: /^wheel(FL|FR|BL|BR)$/i,
  },
  rs01: {
    id: 'rs01', name: 'Renault Sport R.S. 01', url: 'models/rs01.glb',
    targetWidth: CAR_WIDTH, flip: false, mass: 1100, paintColor: 0xf4c20a, // yellow
    stats: { speed: 9, acceleration: 9, grip: 9, braking: 9, handling: 9 },
    hideMeshes: /glows/i, wheelGroupRe: /^wheel(FL|FR|BL|BR)$/i,
  },
  honda: {
    id: 'honda', name: 'Honda Civic Type R', url: 'models/honda.glb',
    targetWidth: CAR_WIDTH, flip: false, mass: 1400, paintColor: 0xe9ecee, // championship white
    stats: { speed: 7, acceleration: 7, grip: 7, braking: 7, handling: 8 },
    hideMeshes: /glows/i, wheelGroupRe: /^wheel(FL|FR|BL|BR)$/i,
  },
};

const lerp = (v, a, b) => a + (b - a) * (Math.max(0, Math.min(10, v)) / 10);

/**
 * Map a car's 0–10 ratings to concrete physics parameters (SI-ish units).
 * Tuned so a top car is genuinely fast and demanding but still controllable.
 */
export function statsToTuning(stats) {
  // Steep convex curves: the TOP (10) stays grippy/easy while the BOTTOM (0) is
  // dragged way down to near-undrivable — so the 0→10 gap is huge and a low
  // rating like 3 is genuinely hard.
  const gc = Math.pow(stats.grip / 10, 2.2); // grip collapses as the rating drops
  const hc = Math.pow(stats.handling / 10, 2.5); // stability collapses even faster
  return {
    topSpeed: lerp(stats.speed, 45, 96), // m/s  (≈162 – 346 km/h)
    maxEngineForce: lerp(stats.acceleration, 10000, 22000), // N
    maxBrakeForce: lerp(stats.braking, 5000, 12000), // N
    frictionSlip: 0.4 + 2.5 * gc, // ~0.4 (almost none) .. 2.9 (glued down)
    sideFriction: 0.06 + 1.36 * gc, // lateral grip: ~0.06 .. 1.42
    steerSpeed: lerp(stats.handling, 2.8, 5.0), // steering response (lower = heavier)
    angularDamping: 0.02 + 1.22 * hc, // yaw stability: ~0.02 (spins freely) .. 1.24 (planted)
  };
}

/** Six gear top-speeds (km/h) spanning a car's top speed, for the tach/gears. */
export function gearTopSpeeds(topSpeedMs) {
  const top = topSpeedMs * 3.6;
  return [0.18, 0.33, 0.5, 0.66, 0.83, 1.0].map((f) => Math.round(top * f));
}
