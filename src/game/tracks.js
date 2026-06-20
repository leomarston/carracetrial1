/**
 * Track definitions. Each track ties together: the car spawn, the start/finish
 * line (for lap detection + the gantry asset), the loop centre (for angular lap
 * validation) and the road bounds (for the minimap). Adding a track = a new entry.
 */
export const TRACKS = {
  highway: {
    id: 'highway',
    name: 'Highway Battle',
    laps: 2,

    // Where the car starts: just behind the start line, facing down the straight (-Z).
    spawn: { x: 2310, z: 15, y: 0.8, heading: -Math.PI },

    // Start/finish line: a plane across the road. forward = travel direction (-Z).
    // A lap is only counted crossing forward AND after a full loop of progress.
    startLine: {
      x: 2306, z: 0, // a point on the line (road centre)
      nx: 0, nz: -1, // forward normal (direction of travel through the line)
      halfWidth: 26, // half the road span the line covers (along X)
    },

    // The start/finish gantry asset (an arch you drive under), placed on the line.
    gantry: {
      url: 'models/start_finish_line.glb',
      x: 2306, z: 0,
      rotationY: Math.PI / 2, // rotate so its span goes across the road (world X)
      span: 44, // desired world width across the road (drives the scale)
    },

    // Loop centre, inside the circuit, for angular lap-progress validation.
    loopCenter: { x: 378, z: -337 },

    // Road extent (world XZ) for the minimap framing.
    roadBounds: { minX: -1571, maxX: 2327, minZ: -3253, maxZ: 2580 },
  },
};
