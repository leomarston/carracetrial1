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

  // ---- Map 2: a closed road circuit. Its road surface is baked across two
  //      ribbon meshes (C20-14 / C20-15) rather than named "Road" meshes, and
  //      the asphalt is part of the terrain (no clean edge geometry), so we keep
  //      players on track with the off-road respawn assist instead of walls.
  //      No AI bots on this map (no `path` / `botSpawns`). ----
  hyperdrive: {
    id: 'hyperdrive',
    name: 'Hyperdrive Circuit',
    laps: 2,
    roadRe: /C20-1[45]_/, // the drivable road-ribbon meshes in this asset
    walls: false, // road baked onto terrain → use the off-road respawn assist

    // Start/finish straight runs along world X at z≈1099 (road band y≈1). Both
    // cars start just behind the line, on the same band, facing -X (the lap dir).
    spawn: { x: 778, z: 1096, y: 1.5, heading: -Math.PI / 2 },
    p2Spawn: { x: 788, z: 1102, y: 1.5, heading: -Math.PI / 2 },

    startLine: {
      x: 760, z: 1099, // a point on the line, mid start-straight
      nx: -1, nz: 0, // forward normal = travel direction (-X)
      halfWidth: 20, // covers the road width across Z
    },

    gantry: {
      url: 'models/start_finish_line.glb',
      x: 760, z: 1099,
      rotationY: 0, // span runs across the road (world Z) for this travel axis
      span: 36,
    },

    // Loop centre (the enclosed infield), for angular lap-progress validation.
    loopCenter: { x: 724, z: 798 },

    // Road extent (world XZ) for the minimap framing.
    roadBounds: { minX: 185, maxX: 1263, minZ: 426, maxZ: 1170 },
  },

  // ---- Map 3: a snowy Moscow street scene. Authored at ~1/18 scale, so we scale
  //      it up. The drivable ground ("dibiao") is an open plaza bounded by baked
  //      barriers/buildings (no road-edge walls needed). No AI bots. ----
  moscow: {
    id: 'moscow',
    name: 'Moscow Streets',
    laps: 2,
    scale: 18, // tiny asset → scaled up so the cars are proportioned
    roadRe: /dibiao/i, // drivable ground tiles (for the minimap)
    walls: false, // barriers + buildings are baked colliders (natural walls)
    offRoad: false, // open, uneven city → keep only the flip respawn (no off-road resets)

    // Start on a verified-flat plaza, both cars facing +X into the street network.
    spawn: { x: -65, z: 12, y: 1.5, heading: Math.PI / 2 },
    p2Spawn: { x: -65, z: 18, y: 1.5, heading: Math.PI / 2 },

    startLine: { x: -52, z: 15, nx: 1, nz: 0, halfWidth: 16 },
    gantry: { url: 'models/start_finish_line.glb', x: -52, z: 15, rotationY: 0, span: 26 },

    // Loop centre inside the street network, for angular lap-progress validation.
    loopCenter: { x: -25, z: -25 },

    // Frame the minimap on the drivable street network (not the whole terrain).
    roadBounds: { minX: -100, maxX: 70, minZ: -100, maxZ: 100 },
  },
};
