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
    stats: { speed: 10, acceleration: 9, grip: 7, braking: 9, handling: 6 },
  },
};

const lerp = (v, a, b) => a + (b - a) * (Math.max(0, Math.min(10, v)) / 10);

/**
 * Map a car's 0–10 ratings to concrete physics parameters (SI-ish units).
 * Tuned so a top car is genuinely fast and demanding but still controllable.
 */
export function statsToTuning(stats) {
  return {
    topSpeed: lerp(stats.speed, 45, 96), // m/s  (≈162 – 346 km/h)
    maxEngineForce: lerp(stats.acceleration, 10000, 22000), // N
    maxBrakeForce: lerp(stats.braking, 5000, 12000), // N
    frictionSlip: lerp(stats.grip, 0.9, 1.7), // tyre grip — lower = slidier
    sideFriction: lerp(stats.grip, 0.3, 0.7), // lateral grip multiplier
    steerSpeed: lerp(stats.handling, 2.5, 4.5), // how fast steering responds (lower = heavier/less darty)
    angularDamping: lerp(stats.handling, 0.08, 0.4), // yaw resistance — lower = freer to rotate/slide
  };
}

/** Six gear top-speeds (km/h) spanning a car's top speed, for the tach/gears. */
export function gearTopSpeeds(topSpeedMs) {
  const top = topSpeedMs * 3.6;
  return [0.18, 0.33, 0.5, 0.66, 0.83, 1.0].map((f) => Math.round(top * f));
}
