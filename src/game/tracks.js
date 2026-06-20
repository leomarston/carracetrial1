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

    // AI opponent's grid slot: beside the player on the same (right) carriageway,
    // staggered back. The start straight is a divided highway — left lane
    // x∈[2286,2304], a ~4 m median, right lane x∈[2308,2327]; the player races the
    // right lane, so the rival must too (don't spawn it across the median).
    aiSpawn: { x: 2316, z: 18, y: 0.8, heading: -Math.PI },

    // AI racing-line generation (radial centerline around loopCenter).
    // dir = -1: driving direction is decreasing angle around the centre.
    // The whole loop is a divided highway, so build the middle line (down the
    // median) then shift it ~9 m to the RIGHT of travel onto the player's
    // carriageway — robust even where the (bean-shaped) loop goes concave.
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
