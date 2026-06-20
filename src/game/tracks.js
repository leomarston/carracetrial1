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

    // Where the car starts: on the grid just behind the line, facing down the straight (-Z).
    spawn: { x: 2310, z: 9, y: 0.8, heading: -Math.PI },

    // Player 2's grid slot: beside player 1 on the same (right) carriageway,
    // staggered back. The start straight is a divided highway — left lane
    // x∈[2286,2304], a ~4 m median, right lane x∈[2308,2327]; both start right.
    p2Spawn: { x: 2316, z: 18, y: 0.8, heading: -Math.PI },

    // AI bot grid slots: two columns further back on the right carriageway.
    botSpawns: [
      { x: 2311, z: 28, y: 0.8, heading: -Math.PI },
      { x: 2322, z: 28, y: 0.8, heading: -Math.PI },
      { x: 2311, z: 39, y: 0.8, heading: -Math.PI },
      { x: 2322, z: 39, y: 0.8, heading: -Math.PI },
      { x: 2316, z: 50, y: 0.8, heading: -Math.PI },
    ],

    // AI racing-line generation (radial centerline around loopCenter), shifted
    // onto the player's (right) carriageway. dir = -1: driving direction is
    // decreasing angle around the centre; gap splits the start-straight median.
    path: { bins: 260, dir: -1, gap: 14, laneOffset: 9 },

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
