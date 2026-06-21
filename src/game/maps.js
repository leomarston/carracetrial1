import { TRACKS } from './tracks.js';

/**
 * Map catalog for the World Map / map-selection screen. The first entry is the
 * real, playable map; the rest are placeholders shown as "Coming soon" until
 * their assets land (you can still scroll to them — they just can't be selected).
 *
 * Display fields (stage / raceType / distance / bestLap / preview) feed the
 * map-select UI; playable maps also carry `mapUrl` + `track` (from tracks.js).
 */

// Stylised top-down sketch of the Hyperdrive circuit (own art — drawn, not the asset).
const HYPERDRIVE_PREVIEW = `
<svg viewBox="0 0 420 320" preserveAspectRatio="xMidYMid meet">
  <g fill="none" stroke="#d2ecea" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round" opacity="0.92">
    <path d="M 80 212
      C 52 236 70 272 106 263
      C 137 255 152 271 188 268
      C 228 265 252 286 302 282
      C 348 278 376 248 362 210
      C 351 178 312 182 306 150
      C 299 115 332 95 313 69
      C 292 42 248 59 254 96
      C 259 126 227 131 209 153
      C 187 180 150 166 119 176
      C 90 185 100 193 80 212 Z"/>
  </g>
  <circle cx="245" cy="284" r="5" fill="#ffce3a" opacity="0.95"/>
</svg>`;

// Stylised top-down sketch of the Moscow street scene (own art — drawn, not the asset).
const MOSCOW_PREVIEW = `
<svg viewBox="0 0 420 320" preserveAspectRatio="xMidYMid meet">
  <g fill="none" stroke="#cfe0ea" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" opacity="0.9">
    <path d="M70 180 C 60 130 110 96 160 104 C 210 112 226 96 270 104
             C 320 112 360 140 352 186 C 345 226 300 236 262 230
             C 214 222 196 250 150 244 C 104 238 80 226 70 180 Z"/>
  </g>
  <g fill="#b9cdd8" opacity="0.55">
    <rect x="150" y="150" width="34" height="34" rx="3"/>
    <rect x="200" y="140" width="40" height="44" rx="3"/>
    <rect x="252" y="156" width="30" height="30" rx="3"/>
  </g>
  <g fill="none" stroke="#9fdcff" stroke-width="2" opacity="0.5">
    <path d="M120 250 L120 280 M300 250 L300 282 M210 250 L210 286"/>
  </g>
  <circle cx="156" cy="230" r="5" fill="#ffce3a" opacity="0.95"/>
</svg>`;

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
    id: 'hyperdrive',
    stage: 'Stage 2',
    name: 'Hyperdrive Circuit',
    available: true,
    mapUrl: 'models/carracemap2.glb',
    track: TRACKS.hyperdrive,
    raceType: 'Circuit',
    distance: '3.5 km',
    bestLap: '—',
    preview: HYPERDRIVE_PREVIEW,
  },
  {
    id: 'moscow',
    stage: 'Stage 3',
    name: 'Moscow Streets',
    available: true,
    mapUrl: 'models/carracemap3.glb',
    track: TRACKS.moscow,
    raceType: 'Street',
    distance: '2.6 km',
    bestLap: '—',
    preview: MOSCOW_PREVIEW,
  },
];
