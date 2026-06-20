import { TRACKS } from './tracks.js';

/**
 * Map catalog for the World Map / map-selection screen. The first entry is the
 * real, playable map; the rest are placeholders shown as "Coming soon" until
 * their assets land (you can still scroll to them — they just can't be selected).
 *
 * Display fields (stage / raceType / distance / bestLap / preview) feed the
 * map-select UI; playable maps also carry `mapUrl` + `track` (from tracks.js).
 */

// Stylised top-down sketch of the highway loop (own art — drawn, not the asset).
const HIGHWAY_PREVIEW = `
<svg viewBox="0 0 420 320" preserveAspectRatio="xMidYMid meet">
  <g fill="none" stroke="#d2ecea" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" opacity="0.92">
    <path d="M120 58 C 78 70 56 112 70 152 C 82 190 58 214 92 244 C 124 272 206 272 256 250 C 304 229 332 250 352 208 C 369 172 348 138 318 118 C 286 96 300 68 250 56 C 206 46 160 48 120 58 Z"/>
    <path d="M120 152 L 256 150 M 182 88 L 182 252 M 256 150 L 318 118 M 120 152 L 92 244"/>
    <g stroke-width="1.5" opacity="0.65">
      <path d="M96 176 H 178 M96 196 H 178 M96 216 H 178"/>
      <path d="M112 166 V 236 M138 166 V 236 M164 166 V 236"/>
    </g>
  </g>
  <path fill="none" stroke="#9fdcff" stroke-width="3.2" stroke-linecap="round" opacity="0.85"
    d="M58 128 C 150 108 250 200 362 188"/>
</svg>`;

export const MAPS = [
  {
    id: 'highway',
    stage: 'Stage 1',
    name: 'Highway Battle',
    available: true,
    mapUrl: 'models/carracemap1.glb',
    track: TRACKS.highway,
    raceType: 'Circuit',
    distance: '4.1 km',
    bestLap: '—',
    preview: HIGHWAY_PREVIEW,
  },
  {
    id: 'downtown',
    stage: 'Stage 2',
    name: 'Downtown Loop',
    available: false,
    raceType: 'Sprint',
    distance: '—',
    bestLap: '—',
  },
  {
    id: 'coast',
    stage: 'Stage 3',
    name: 'Coastal Run',
    available: false,
    raceType: 'Circuit',
    distance: '—',
    bestLap: '—',
  },
];
