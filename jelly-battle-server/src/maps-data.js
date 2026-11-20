// Pure map layouts. Colliders: circles {x,z,r} and axis-aligned boxes {x,z,hw,hd}.
// Fences are arcs of posts along the rim; gaps between arcs are where you can be knocked off.
const arcPosts = (R, a0, a1, step = 0.95) => {
  const out = []; const n = Math.max(2, Math.round(((a1 - a0) * R) / step));
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push({ x: Math.cos(a) * (R - 0.35), z: Math.sin(a) * (R - 0.35), r: 0.3, a }); }
  return out;
};
const D = Math.PI / 180;

// Simple, open arenas: one clear gimmick each, wide lanes, nothing a jelly can get stuck in.
const diag = (r, k, extra = {}) => [0, 1, 2, 3].map((i) => ({ x: Math.cos(Math.PI / 4 + (i * Math.PI) / 2) * r, z: Math.sin(Math.PI / 4 + (i * Math.PI) / 2) * r, ...extra, color: k[i] }));
export const MAPS = [
  {
    id: 'plaza', name: 'Pudding Plaza', R: 11,
    top: '#fff0cf', tile: '#f5ddb0', rim: '#6b3a1f', side: '#ffd27a', layer: '#ff8fb1', sea: '#41d6d8',
    pieces: [
      { kind: 'fountain', x: 0, z: 0, r: 1.15 },
      ...diag(7.3, ['#ff5a7a', '#5ab8ff', '#ffc93c', '#3ddcb0']).map((p) => ({ ...p, kind: 'gumdrop', r: 0.8 })),
    ],
    hazard: { type: 'sweeper', r0: 1.35, r1: 5.4, speed: 0.55 },
    pads: [],
    fences: [[15 * D, 75 * D], [105 * D, 165 * D], [195 * D, 255 * D], [285 * D, 345 * D]],
  },
  {
    id: 'fort', name: 'Bumper Bakery', R: 11,
    top: '#ffe7c2', tile: '#f0cf9a', rim: '#4a2a17', side: '#d99a5b', layer: '#fff2e2', sea: '#7fd0ff',
    pieces: [
      ...diag(5.0, ['#ff8fb1', '#9be7ff', '#ffe08a', '#b8f5c9']).map((p) => ({ ...p, kind: 'tower', r: 0.8, bumper: true })),
      { kind: 'cookieWall', x: 0, z: -6.9, hw: 1.4, hd: 0.45 },
      { kind: 'cookieWall', x: 0, z: 6.9, hw: 1.4, hd: 0.45 },
    ],
    pads: [{ x: -7.6, z: 0, dir: [1, 0] }, { x: 7.6, z: 0, dir: [-1, 0] }],
    fences: [[-30 * D, 30 * D], [60 * D, 120 * D], [150 * D, 210 * D], [240 * D, 300 * D]],
  },
  {
    id: 'garden', name: 'Gumball Garden', R: 11.5,
    top: '#e9ffd9', tile: '#d4f3c0', rim: '#2f6b3a', side: '#ffb3c7', layer: '#fff', sea: '#4fc3ff',
    pieces: [
      { kind: 'gumdrop', x: 0, z: 0, r: 0.95, color: '#ff8fb1' },
      ...[0, 1, 2].map((i) => ({ kind: 'bear', x: Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / 3) * 6.2, z: Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / 3) * 6.2, r: 0.75, color: ['#ff5a4e', '#ffc93c', '#8a6cff'][i] })),
    ],
    hazard: { type: 'roller', every: 6.5, r: 0.8, speed: 6 },
    pads: [],
    fences: [[20 * D, 70 * D], [110 * D, 160 * D], [200 * D, 250 * D], [290 * D, 340 * D]],
  },
  {
    id: 'trampoline', name: 'Jiggle Jump Park', R: 11.5,
    top: '#ffe3f1', tile: '#ffc8e2', rim: '#7a2a5a', side: '#ff8fc8', layer: '#fff6a8', sea: '#6fd8ff', wobble: true,
    pieces: [
      { kind: 'gumdrop', x: 0, z: 0, r: 1.0, color: '#7ad0ff' },
      ...diag(6.6, ['#ffc93c', '#3ddcb0', '#a66bff', '#ff5a7a']).map((p) => ({ ...p, kind: 'gumdrop', r: 0.7 })),
    ],
    pads: [{ x: 3.6, z: 0 }, { x: -3.6, z: 0 }, { x: 0, z: 3.6 }, { x: 0, z: -3.6 }, { x: 7.4, z: 3.2 }, { x: -7.4, z: -3.2 }],
    fences: [[10 * D, 80 * D], [100 * D, 170 * D], [190 * D, 260 * D], [280 * D, 350 * D]],
  },
  {
    id: 'volcano', name: 'Choco Volcano', R: 11.5,
    top: '#f3d2b0', tile: '#e2b48a', rim: '#3a1c0c', side: '#8a4a26', layer: '#ff6a3d', sea: '#ff9a4d',
    pieces: [
      { kind: 'cake', x: 0, z: 0, r: 1.3, color: '#5a2e14' },
      ...diag(6.4, ['#ffd27a', '#ff8fb1', '#ffd27a', '#ff8fb1']).map((p) => ({ ...p, kind: 'cone', r: 0.7 })),
    ],
    hazard: { type: 'geyser', every: 3.2, r: 1.5 },
    pads: [{ x: 0, z: 5.2 }, { x: 0, z: -5.2 }],
    fences: [[25 * D, 65 * D], [115 * D, 155 * D], [205 * D, 245 * D], [295 * D, 335 * D]],
  },
  {
    id: 'frost', name: 'Frosty Float', R: 11,
    top: '#eaf8ff', tile: '#cfeeff', rim: '#2a5a8a', side: '#9ad8ff', layer: '#ffffff', sea: '#3a7ad8', ice: true,
    pieces: [
      { kind: 'lolli', x: 0, z: 0, r: 0.9, color: '#7ad0ff' },
      ...[0, 1, 2].map((i) => ({ kind: 'cone', x: Math.cos(Math.PI / 6 + (i * 2 * Math.PI) / 3) * 5.8, z: Math.sin(Math.PI / 6 + (i * 2 * Math.PI) / 3) * 5.8, r: 0.7, color: ['#ffffff', '#b8e8ff', '#ffd6f2'][i] })),
    ],
    pads: [],
    fences: [[0 * D, 50 * D], [90 * D, 150 * D], [180 * D, 230 * D], [270 * D, 330 * D]],
  },
  {
    id: 'donut', name: 'Donut Derby', R: 11.5,
    top: '#fff4e0', tile: '#ffe2bb', rim: '#5a2e14', side: '#e8a868', layer: '#ff7ab8', sea: '#5ac8ff',
    pieces: [
      { kind: 'donut', x: 0, z: 0, r: 1.2, color: '#ff7ab8' },
      ...[0, 1, 2, 3, 4, 5].map((i) => ({ kind: i % 2 ? 'tower' : 'gumdrop', x: Math.cos((i * Math.PI) / 3) * 6.5, z: Math.sin((i * Math.PI) / 3) * 6.5, r: 0.65, bumper: i % 2 === 1, color: ['#ff5a7a', '#9be7ff', '#ffc93c', '#b8f5c9', '#a66bff', '#ffe08a'][i] })),
    ],
    hazard: { type: 'roller', every: 5.5, r: 0.75, speed: 6.5 },
    pads: [],
    fences: [[30 * D, 90 * D], [150 * D, 210 * D], [270 * D, 330 * D]],
  },
  {
    id: 'bubble', name: 'Bubblegum Pop', R: 11,
    top: '#f3e6ff', tile: '#e2ccff', rim: '#4a2a7a', side: '#c08aff', layer: '#ff9ad6', sea: '#ff9ad6', wobble: true,
    pieces: [
      ...diag(6.7, ['#ff9ad6', '#9be7ff', '#ffe08a', '#b8f5c9']).map((p) => ({ ...p, kind: 'tower', r: 0.75, bumper: true })),   // outside the sweeper's reach
      { kind: 'bear', x: 0, z: 0, r: 0.8, color: '#ff5ab8' },
    ],
    hazard: { type: 'sweeper', r0: 1.5, r1: 5.2, speed: -0.6 },
    pads: [{ x: 7.6, z: 0 }, { x: -7.6, z: 0 }],
    fences: [[20 * D, 70 * D], [110 * D, 160 * D], [200 * D, 250 * D], [290 * D, 340 * D]],
  },
];

// bigger lobbies get a bigger arena: radius and every prop position scale with sqrt(players / 4)
export function scaleMap(map, n) {
  const f = n <= 4 ? 1 : Math.sqrt(n / 4); if (f === 1) return map;
  const sc = (o) => ({ ...o, x: o.x * f, z: o.z * f });
  return { ...map, id: map.id, R: map.R * f, scale: f, pieces: map.pieces.map(sc), pads: (map.pads || []).map(sc),
    hazard: map.hazard ? { ...map.hazard, r0: map.hazard.r0 && map.hazard.r0 * f, r1: map.hazard.r1 && map.hazard.r1 * f } : map.hazard };
}
// friends-room lounge: small, fully fenced, a training sandbag in the middle
export const LOUNGE = { id: 'lounge', name: 'Jelly Lounge', R: 7.2, top: '#fff1f8', tile: '#ffd9ec', rim: '#5a2a7a', side: '#c08aff', layer: '#9be7ff', sea: '#7a5aff',
  pieces: [{ kind: 'gumdrop', x: -4.6, z: -3.2, r: 0.6, color: '#7ad0ff' }, { kind: 'gumdrop', x: 4.6, z: -3.2, r: 0.6, color: '#ffc93c' }], pads: [], fences: [[0, 2 * Math.PI]] };
export function buildColliders(map) {
  const circles = [], boxes = [];
  map.pieces.forEach((p, pi) => {
    if (p.hw) boxes.push({ x: p.x, z: p.z, hw: p.hw, hd: p.hd, pi });
    else circles.push({ x: p.x, z: p.z, r: p.r, bumper: !!p.bumper, pi });
  });
  const posts = [];
  for (const [a0, a1] of map.fences) for (const q of arcPosts(map.R, a0, a1)) { circles.push({ x: q.x, z: q.z, r: q.r, post: true }); posts.push(q); }
  return { circles, boxes, posts };
}

export function freeSpot(map, col, rr = 0.8, maxR = 0.8) {
  for (let k = 0; k < 60; k++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * map.R * maxR;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (col.circles.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + rr)) continue;
    if (col.boxes.some((b) => Math.abs(x - b.x) < b.hw + rr && Math.abs(z - b.z) < b.hd + rr)) continue;
    if (map.pads.some((p) => Math.hypot(p.x - x, p.z - z) < 1.2)) continue;
    return { x, z };
  }
  return { x: 0, z: 2 };
}
