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
export const CARS = {
  f1: {
    id: 'f1',
    name: 'Scuderia F1',
    url: 'models/f1car.glb',
    targetWidth: 2.77,
    flip: true,
    mass: 800,
    stats: { speed: 10, acceleration: 9, grip: 3, braking: 9, handling: 3 },
    // Visual rig: which meshes are the tyres (spun/steered) and the brake lights.
    wheelMeshRe: /^WheelFront00[0-3]_black/,
    brakeLights: [{ mat: 'glossyorange' }, { mat: 'BackLight', maxVerts: 100 }],
  },

  // The AI opponent. The asset (lamborghini.glb) is actually a Koenigsegg CC850
  // by amogusstrikesback2 (CC-BY-4.0). It's already in real-world metres and its
  // nose points +Z, so no flip; the emissive "_glows" billboard planes (one juts
  // ~1.9 m past the nose) are hidden so they don't float or skew sizing.
  lambo: {
    id: 'lambo',
    name: 'Koenigsegg CC850',
    url: 'models/lamborghini.glb',
    targetWidth: 2.5,
    flip: false,
    mass: 1200,
    // Grippy and planted (a Koenigsegg): the AI can carry corner speed cleanly.
    // The player's F1 is faster on top end but twitchy — a fair, beatable race.
    stats: { speed: 9, acceleration: 8, grip: 8, braking: 8, handling: 8 },
    hideMeshes: /glows/i,
    // Each wheel is a group node (wheelFL/FR/BL/BR) holding its rim + tyre.
    wheelGroupRe: /^wheel(FL|FR|BL|BR)$/i,
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
