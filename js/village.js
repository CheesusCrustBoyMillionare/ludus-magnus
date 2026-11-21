'use strict';
// The village: a small town seen from above, and the only way to get from one screen of the game to another.
// You walk the lanista about it with W A S D, or click a building and he walks there himself. Stepping onto a
// building's doorstep opens its screen. Drawn on the same 590x190 grid as the yard, at 2 canvas pixels per unit.

const VILLAGE = { W: 590, H: 190, S: 2, CELL: 5, SPEED: 95 };
// Each place: its screen, its name on the map, and the ground it stands on (x, y, w, h). The door is in the
// middle of the bottom edge, and the doorstep a little below it.
const PLACES = [
  { key: 'facilities', name: 'Household',  x: 14,  y: 14,  w: 78,  h: 46, kind: 'villa' },
  { key: 'ludus',      name: 'Ludus',      x: 112, y: 12,  w: 98,  h: 48, kind: 'ludus' },
  { key: 'arena',      name: 'Arena',      x: 232, y: 4,   w: 126, h: 58, kind: 'arena' },
  { key: 'patrons',    name: 'Patrons',    x: 384, y: 12,  w: 74,  h: 48, kind: 'temple' },
  { key: 'chronicle',  name: 'Chronicle',  x: 484, y: 16,  w: 76,  h: 44, kind: 'archive' },
  { key: 'market',     name: 'Market',     x: 38,  y: 104, w: 98,  h: 44, kind: 'market' },
  { key: 'smith',      name: 'Blacksmith', x: 168, y: 102, w: 66,  h: 46, kind: 'forge' },
  { key: 'contracts',  name: 'Contracts',  x: 358, y: 102, w: 100, h: 46, kind: 'forum' },
  { key: 'rivals',     name: 'Rivals',     x: 488, y: 102, w: 72,  h: 46, kind: 'tavern' },
];
PLACES.forEach(p => { p.dx = Math.round(p.x + p.w / 2); p.dy = p.y + p.h + 6; });
const placeOf = key => PLACES.find(p => p.key === key) || PLACES[1];
// Things in the way that are not buildings: the fountain, trees, the well.
const VIL_TREES = [[224, 26], [370, 30], [470, 34], [572, 40], [6, 84], [140, 120], [248, 108], [342, 108], [482, 124], [584, 98], [20, 168], [300, 182], [440, 180], [150, 182], [560, 178]];
const VIL_BLOCKS = [{ x: 286, y: 112, w: 20, h: 16 }, { x: 148, y: 158, w: 8, h: 6 }].concat(VIL_TREES.map(([x, y]) => ({ x: x - 4, y: y - 3, w: 8, h: 5 })));

const vil = {
  x: 0, y: 0, face: 'down', walk: 0, moving: false, at: null,      // the lanista, and whose doorstep he stands on
  path: null, then: null, keys: {}, npcs: [], raf: 0, last: 0, prev: 0, layer: null, grid: null,
};

// ---------- the ground: where a man can walk, and how to get somewhere ----------

function vilGrid() {
  if (vil.grid) return vil.grid;
  const C = VILLAGE.CELL, w = Math.ceil(VILLAGE.W / C), h = Math.ceil(VILLAGE.H / C), g = new Uint8Array(w * h);
  const block = r => { for (let cy = Math.floor(r.y / C); cy <= Math.floor((r.y + r.h - 1) / C); cy++) for (let cx = Math.floor(r.x / C); cx <= Math.floor((r.x + r.w - 1) / C); cx++) if (cx >= 0 && cy >= 0 && cx < w && cy < h) g[cy * w + cx] = 1; };
  PLACES.forEach(block); VIL_BLOCKS.forEach(block);
  for (let cx = 0; cx < w; cx++) { g[cx] = 1; g[(h - 1) * w + cx] = 1; }               // the map's edge
  for (let cy = 0; cy < h; cy++) { g[cy * w] = 1; g[cy * w + w - 1] = 1; }
  return (vil.grid = { g, w, h });
}
function vilBlocked(x, y) {
  const { g, w, h } = vilGrid(), cx = Math.floor(x / VILLAGE.CELL), cy = Math.floor(y / VILLAGE.CELL);
  return cx < 0 || cy < 0 || cx >= w || cy >= h || g[cy * w + cx] === 1;
}
// The shortest way from one spot to another, as a list of points, going round whatever is in the way.
function vilPath(x0, y0, x1, y1) {
  const { g, w, h } = vilGrid(), C = VILLAGE.CELL;
  const a = Math.floor(y0 / C) * w + Math.floor(x0 / C), b = Math.floor(y1 / C) * w + Math.floor(x1 / C);
  const from = new Int32Array(w * h).fill(-1), q = [a];
  from[a] = a;
  for (let i = 0; i < q.length && from[b] < 0; i++) {
    const c = q[i], cx = c % w, cy = (c - cx) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx, ny = cy + dy, n = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || g[n] || from[n] >= 0) continue;
      if (dx && dy && (g[cy * w + nx] || g[ny * w + cx])) continue;                  // no squeezing between two corners
      from[n] = c; q.push(n);
    }
  }
  if (from[b] < 0) return [{ x: x1, y: y1 }];
  const pts = [{ x: x1, y: y1 }];
  for (let c = from[b]; c !== a; c = from[c]) pts.push({ x: (c % w) * C + C / 2, y: Math.floor(c / w) * C + C / 2 });
  return pts.reverse();
}

// ---------- the lanista ----------

// Puts him on a doorstep without the walk: at the start, after loading, when the steward is summoned.
function villagePlace(key) {
  const p = placeOf(key);
  vil.x = p.dx; vil.y = p.dy; vil.at = p.key; vil.path = null; vil.then = null; vil.face = 'down'; vil.moving = false;
}
// Sends him to a door on his own feet. `then` runs when he gets there.
function villageWalkTo(key, then) {
  const p = placeOf(key);
  vil.then = then || null;
  if (vil.at === p.key && Math.hypot(vil.x - p.dx, vil.y - p.dy) < 7) { vil.path = null; const f = vil.then; vil.then = null; if (f) f(); return; }
  vil.path = vilPath(vil.x, vil.y, p.dx, p.dy);
}
// Which building a click landed on.
function villagePick(cv, e) {
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * VILLAGE.W, y = (e.clientY - r.top) / r.height * VILLAGE.H;
  const p = PLACES.find(b => x >= b.x - 3 && x <= b.x + b.w + 3 && y >= b.y - 9 && y <= b.y + b.h + 10);
  return p ? p.key : null;
}
function villageKey(e, down) {
  const k = { w: 'u', a: 'l', s: 'd', d: 'r' }[e.key.length === 1 ? e.key.toLowerCase() : ''];
  if (!k) return false;
  vil.keys[k] = down;
  return true;
}
const villageStill = () => { vil.keys = {}; };

function moveBy(o, dx, dy) {             // slide along whatever he walks into
  if (dx && !vilBlocked(o.x + dx, o.y)) o.x += dx;
  if (dy && !vilBlocked(o.x, o.y + dy)) o.y += dy;
}
const faceOf = (dx, dy, was) => Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01 ? was : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
// Follows a list of points; true when the last is reached.
function followPath(o, dt, speed) {
  let left = speed * dt;
  while (o.path && o.path.length && left > 0) {
    const t = o.path[0], dx = t.x - o.x, dy = t.y - o.y, d = Math.hypot(dx, dy);
    if (d <= left) { o.x = t.x; o.y = t.y; left -= d; o.path.shift(); o.face = faceOf(dx, dy, o.face); }
    else { o.x += dx / d * left; o.y += dy / d * left; o.face = faceOf(dx, dy, o.face); left = 0; }
  }
  return !o.path || !o.path.length;
}

function villageStep(dt, frozen) {
  const k = vil.keys, kx = (k.r ? 1 : 0) - (k.l ? 1 : 0), ky = (k.d ? 1 : 0) - (k.u ? 1 : 0);
  const x0 = vil.x, y0 = vil.y;
  if (!frozen && (kx || ky)) {                       // steering takes over from any walk he was sent on
    vil.path = null; vil.then = null;
    const n = Math.hypot(kx, ky), s = VILLAGE.SPEED * dt / n;
    moveBy(vil, kx * s, ky * s); vil.face = faceOf(kx, ky, vil.face);
  } else if (!frozen && vil.path) {
    if (followPath(vil, dt, VILLAGE.SPEED)) { vil.path = null; const f = vil.then; vil.then = null; if (f) f(); }
  }
  vil.moving = Math.hypot(vil.x - x0, vil.y - y0) > 0.01;
  if (vil.moving) vil.walk += dt * 11;
  const here = PLACES.find(p => Math.abs(vil.x - p.dx) < 7 && Math.abs(vil.y - p.dy) < 5);
  // a doorstep opens when you step onto it; a man sent somewhere walks past the doors on his way without looking in
  if (here && vil.at !== here.key && !vil.path) { vil.at = here.key; if (typeof villageEnter === 'function') villageEnter(here.key); }
  else if (!here) vil.at = null;

  // townsfolk, going from door to door about their own business
  if (!vil.npcs.length) {
    const tunics = ['#8a4a3a', '#4a6a8a', '#7a7a3a', '#6a4a7a', '#3f7a5a', '#a8763a', '#8a8a8a'];
    for (let i = 0; i < 7; i++) { const p = PLACES[(i * 4 + 2) % PLACES.length]; vil.npcs.push({ x: p.dx + (i % 3) * 6 - 6, y: p.dy + 6 + (i % 2) * 4, face: 'down', walk: i, wait: 1 + i * 0.9, path: null, tunic: tunics[i], hair: i % 2 ? '#2a1c14' : '#6a4a2a', skin: ['#d9a57c', '#c9966c', '#8a5a3a', '#e3b48f'][i % 4] }); }
  }
  for (const n of vil.npcs) {
    if (n.path) { n.moving = true; n.walk += dt * 8; if (followPath(n, dt, 38)) { n.path = null; n.moving = false; n.wait = 2 + Math.random() * 7; } continue; }
    n.wait -= dt;
    if (n.wait <= 0) { const p = PLACES[Math.floor(Math.random() * PLACES.length)]; n.path = vilPath(n.x, n.y, p.dx + Math.round(Math.random() * 16 - 8), p.dy + 5 + Math.round(Math.random() * 6)); }
  }
}

// ---------- drawing ----------

function vilPerson(ctx, X, Y, o) {
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(X + x), Math.round(Y + y), w, h); };
  const step = o.moving ? (Math.sin(o.walk) > 0 ? 1 : 0) : -1, f = o.face, skin = o.skin || '#d9a57c', hair = o.hair || '#3a2a1c', t = o.tunic, tD = shade(t, 0.72);
  R(-3, -1, 7, 2, 'rgba(0,0,0,.28)');
  R(-2, -4 + (step === 1 ? -1 : 0), 2, 3, skin); R(1, -4 + (step === 0 ? -1 : 0), 2, 3, skin);          // legs
  R(-3, -10, 7, 6, t); R(-3, -10, 1, 6, tD); R(3, -10, 1, 6, tD);                                       // body
  if (o.stripe) { R(f === 'left' ? -1 : 1, -10, 1, 6, o.stripe); }
  else R(-3, -6, 7, 1, tD);
  if (f === 'left' || f === 'right') R(f === 'left' ? -4 : 4, -9 + (step === 1 ? 1 : 0), 1, 3, skin); else { R(-4, -9, 1, 3, skin); R(4, -9, 1, 3, skin); }   // arms
  R(-2, -14, 5, 4, skin); R(-2, -15, 5, 2, hair);                                                       // head
  if (f === 'up') R(-2, -14, 5, 3, hair);
  else if (f === 'down') { R(-1, -12, 1, 1, '#1c1310'); R(1, -12, 1, 1, '#1c1310'); }
  else { R(f === 'left' ? -2 : 2, -12, 1, 1, '#1c1310'); R(f === 'left' ? 2 : -2, -14, 1, 3, hair); }
  if (o.laurel) { R(-2, -15, 5, 1, '#e3b04a'); }
}

// Everything that does not move, drawn once.
function villageLayer() {
  if (vil.layer) return vil.layer;
  const cv = document.createElement('canvas'); cv.width = VILLAGE.W * VILLAGE.S; cv.height = VILLAGE.H * VILLAGE.S;
  const ctx = cv.getContext('2d'); ctx.setTransform(VILLAGE.S, 0, 0, VILLAGE.S, 0, 0); ctx.imageSmoothingEnabled = false;
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const ell = (cx, cy, rx, ry, c) => { ctx.fillStyle = c; for (let y = -ry; y <= ry; y++) { const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)))); ctx.fillRect(Math.round(cx - hw), Math.round(cy + y), hw * 2, 1); } };
  const rnd = (i, m) => Math.abs(Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1 * m;

  // grass, with tufts and flowers
  R(0, 0, 590, 190, '#7e9a4b');
  for (let i = 0; i < 520; i++) R(rnd(i, 590), rnd(i + 900, 190), 2, 1, i % 3 ? '#718c42' : '#8eab58');
  for (let i = 0; i < 46; i++) R(rnd(i + 50, 590), rnd(i + 70, 190), 1, 1, ['#f2e6a0', '#e8a0a0', '#f4f4f0'][i % 3]);
  // the two streets and the lanes between them
  const road = (x, y, w, h) => { R(x - 1, y - 1, w + 2, h + 2, '#a98a58'); R(x, y, w, h, '#cdae78'); for (let i = 0; i < w * h / 26; i++) R(x + rnd(i + x, w - 2), y + rnd(i + y + 7, h - 1), 2, 1, i % 2 ? '#bf9f6a' : '#d9bd8a'); };
  road(4, 64, 582, 18); road(4, 152, 582, 16);
  for (const x of [14, 146, 464, 566]) road(x, 82, 12, 70);
  // the square, paved, with the fountain in it
  R(254, 82, 92, 70, '#b9b29c');
  for (let y = 82; y < 152; y += 7) for (let x = 254 + ((y / 7) % 2 ? 0 : 5); x < 346; x += 10) { R(x, y, 9, 6, (x + y) % 3 ? '#c9c3ae' : '#d4cfbc'); }
  R(254, 82, 92, 1, '#8f8872'); R(254, 151, 92, 1, '#8f8872');
  ell(296, 121, 11, 8, 'rgba(0,0,0,.25)'); ell(296, 119, 11, 8, '#a39d8a'); ell(296, 119, 9, 6, '#5d9ac2'); ell(296, 118, 7, 4, '#7fb6d8'); R(294, 112, 4, 8, '#bdb7a3'); R(293, 111, 6, 2, '#d4cfbc');
  // a well, and a cart by the lower street
  R(148, 158, 8, 6, '#8f8872'); R(149, 159, 6, 4, '#2c3f52'); R(147, 154, 1, 5, '#6b4a2a'); R(156, 154, 1, 5, '#6b4a2a'); R(147, 153, 10, 1, '#6b4a2a');
  R(214, 172, 14, 5, '#8a6a3a'); R(214, 171, 14, 1, '#a8834a'); R(216, 176, 3, 3, '#3a2a1c'); R(223, 176, 3, 3, '#3a2a1c'); R(216, 168, 10, 3, '#d9c27a');

  // ----- buildings -----
  const tiles = (x, y, w, h, base) => { R(x, y, w, h, base); for (let yy = y + 2; yy < y + h; yy += 3) R(x, yy, w, 1, shade(base, 0.84)); for (let xx = x + 3; xx < x + w; xx += 6) R(xx, y, 1, h, shade(base, 0.92)); R(x, y, w, 1, shade(base, 1.18)); R(x, y + h - 1, w, 1, shade(base, 0.62)); };
  const wall = (x, y, w, h, c) => { R(x, y, w, h, c); R(x, y, w, 1, shade(c, 0.78)); R(x, y + h - 2, w, 2, shade(c, 0.84)); R(x, y, 1, h, shade(c, 0.88)); R(x + w - 1, y, 1, h, shade(c, 0.88)); };
  const door = (p, w, h, c) => { const x = p.dx - Math.floor(w / 2), y = p.y + p.h - h; R(x - 1, y - 1, w + 2, h + 1, '#5a4326'); R(x, y, w, h, c || '#3a2416'); R(p.dx - 5, p.y + p.h, 10, 2, '#b8a888'); };
  const win = (x, y) => { R(x, y, 3, 4, '#3a2e24'); R(x, y, 3, 1, '#8a7a5a'); };
  const shadow = p => R(p.x + 2, p.y + p.h, p.w, 3, 'rgba(0,0,0,.22)');
  for (const p of PLACES) {
    const { x, y, w, h } = p;
    if (p.kind !== 'arena') shadow(p);
    if (p.kind === 'villa') {                 // your own house: tiled, with an open court and a garden in it
      tiles(x, y, w, 30, '#b5522e'); R(x + 26, y + 8, 26, 14, '#5a2a18'); R(x + 27, y + 9, 24, 12, '#6f9a4a'); R(x + 36, y + 13, 6, 4, '#6fb0d0'); R(x + 30, y + 11, 2, 2, '#3f6a2a'); R(x + 46, y + 17, 2, 2, '#3f6a2a');
      wall(x + 2, y + 30, w - 4, 16, '#ead9b4'); for (const cx of [x + 8, x + 18, x + w - 21, x + w - 11]) win(cx, y + 35);
      R(p.dx - 9, y + 31, 2, 15, '#f4ecd8'); R(p.dx + 7, y + 31, 2, 15, '#f4ecd8'); door(p, 8, 11);
    } else if (p.kind === 'ludus') {          // the school: barracks round a sanded yard
      tiles(x, y, w, 32, '#a8482a'); R(x + 16, y + 7, w - 32, 22, '#5a2a18'); R(x + 17, y + 8, w - 34, 20, '#e2c98f');
      for (let i = 0; i < 4; i++) { R(x + 26 + i * 15, y + 14, 2, 8, '#7a5a2a'); R(x + 25 + i * 15, y + 14, 4, 1, '#7a5a2a'); }
      for (let i = 0; i < 26; i++) R(x + 18 + rnd(i + 3, w - 38), y + 9 + rnd(i + 9, 17), 2, 1, '#d2b77c');
      wall(x + 2, y + 32, w - 4, 16, '#dccba0'); for (let cx = x + 8; cx < x + w - 8; cx += 11) if (Math.abs(cx + 1 - p.dx) > 9) win(cx, y + 37);
      door(p, 10, 12, '#4a2c18'); R(p.dx - 7, y + 33, 14, 2, '#7e241c'); R(x + 4, y + 24, 1, 9, '#5a4326'); R(x + 5, y + 24, 6, 4, '#a02d22');
    } else if (p.kind === 'arena') {          // an oval of stone seats round the sand
      const cx = x + w / 2, cy = y + 28;
      ell(cx + 2, cy + 6, 63, 27, 'rgba(0,0,0,.22)'); ell(cx, cy + 3, 63, 27, '#a89a78'); ell(cx, cy, 63, 26, '#d8c9a2');
      ell(cx, cy, 55, 21, '#c2b28a'); ell(cx, cy, 47, 17, '#d2c39c'); ell(cx, cy, 39, 13, '#b8a880'); ell(cx, cy, 33, 10, '#8a7a56'); ell(cx, cy, 31, 9, '#e2c98f');
      for (let i = 0; i < 80; i++) { const a = rnd(i, 6.283), rr = 0.66 + rnd(i + 40, 0.3); R(cx + Math.cos(a) * 55 * rr, cy + Math.sin(a) * 21 * rr, 1, 1, ['#8a2a20', '#2f6db8', '#e8dcc0', '#c9a21e', '#3a2a1c'][i % 5]); }
      for (let ax = -54; ax <= 54; ax += 9) { const yy = cy + 3 + Math.round(26 * Math.sqrt(Math.max(0, 1 - (ax * ax) / (63 * 63)))); if (Math.abs(ax) > 6) { R(cx + ax - 2, yy - 6, 4, 5, '#5a4a36'); R(cx + ax - 2, yy - 7, 4, 1, '#efe4c4'); } }
      R(cx - 6, y + h - 12, 12, 12, '#3a2416'); R(cx - 7, y + h - 13, 14, 1, '#efe4c4'); R(cx - 5, y + h, 10, 2, '#b8a888');
    } else if (p.kind === 'temple') {         // marble, a pediment, and columns across the front
      R(x, y, w, 30, '#d9d2bd'); for (let i = 0; i < 15; i++) R(x + 2 + i * 2.4, y + 14 - i, w - 4 - i * 4.8, 1, i % 2 ? '#ebe5d2' : '#e2dbc6'); R(x, y + 15, w, 15, '#cfc8b2'); for (let yy = y + 17; yy < y + 30; yy += 3) R(x, yy, w, 1, '#bdb6a0');
      R(p.dx - 1, y + 1, 2, 3, '#e3b04a'); R(x, y + 29, w, 1, '#9f987f');
      wall(x + 2, y + 30, w - 4, 14, '#b8b09a'); for (let cx = x + 5; cx < x + w - 6; cx += 9) { R(cx, y + 30, 4, 14, '#f1ecdc'); R(cx, y + 30, 1, 14, '#d8d2bf'); R(cx - 1, y + 30, 6, 1, '#f8f4e8'); }
      R(p.dx - 4, y + 33, 8, 11, '#3a2416'); R(x, y + 44, w, 2, '#e2dbc6'); R(x - 2, y + 46, w + 4, 2, '#d0c9b3'); R(p.dx - 5, y + h, 10, 2, '#b8a888');
    } else if (p.kind === 'archive') {        // the record house: grey stone under a dome
      R(x, y, w, 26, '#8f97a0'); for (let yy = y + 3; yy < y + 26; yy += 4) R(x, yy, w, 1, '#7d858e'); R(x, y, w, 1, '#aab2ba'); R(x, y + 25, w, 1, '#5d646c');
      ell(p.dx, y + 13, 13, 9, '#6f7780'); ell(p.dx, y + 12, 12, 8, '#a8b0b8'); ell(p.dx - 3, y + 10, 5, 3, '#c4ccd2'); R(p.dx - 1, y + 3, 2, 2, '#e3b04a');
      wall(x + 2, y + 26, w - 4, 18, '#d6d0c0'); for (const cx of [x + 9, x + 19, x + w - 22, x + w - 12]) { R(cx, y + 31, 4, 6, '#3a2e24'); R(cx + 1, y + 32, 2, 1, '#e8dcc0'); R(cx + 1, y + 34, 2, 1, '#e8dcc0'); }
      door(p, 8, 11);
    } else if (p.kind === 'market') {         // a boarded platform and three striped awnings
      R(x, y + 8, w, h - 8, '#8a6a3a'); for (let yy = y + 11; yy < y + h; yy += 4) R(x, yy, w, 1, '#77592e'); R(x, y + h - 2, w, 2, '#5f4622');
      [['#b93a2e', 2], ['#2f6db8', 35], ['#c9a21e', 68]].forEach(([c, ox]) => { for (let i = 0; i < 28; i += 4) { R(x + ox + i, y, 2, 14, c); R(x + ox + i + 2, y, 2, 14, '#efe6cf'); } R(x + ox, y + 13, 28, 2, shade(c, 0.7)); R(x + ox, y + 15, 1, 12, '#5a4326'); R(x + ox + 27, y + 15, 1, 12, '#5a4326'); R(x + ox + 4, y + 20, 20, 5, '#a8834a'); R(x + ox + 6, y + 18, 4, 2, '#d9642e'); R(x + ox + 13, y + 18, 4, 2, '#7fae4a'); R(x + ox + 19, y + 18, 3, 2, '#e8d27a'); });
      R(x + 6, y + 33, 7, 7, '#a8834a'); R(x + 6, y + 33, 7, 1, '#c9a25a'); R(x + w - 16, y + 32, 9, 8, '#a8834a'); R(x + w - 16, y + 32, 9, 1, '#c9a25a'); R(p.dx - 6, y + h - 6, 12, 6, '#6b5028'); R(p.dx - 5, y + h, 10, 2, '#b8a888');
    } else if (p.kind === 'forge') {          // dark slate, a chimney, and a fire you can see from the street
      tiles(x, y, w, 28, '#5d5864'); R(x + w - 18, y + 4, 10, 10, '#4a4650'); R(x + w - 17, y + 5, 8, 8, '#8f8a84'); R(x + w - 15, y + 7, 4, 4, '#1c1614');
      wall(x + 2, y + 28, w - 4, 18, '#b8ab94'); win(x + 9, y + 34); R(p.dx - 7, y + 33, 14, 13, '#2a1a12'); R(p.dx - 8, y + 32, 16, 1, '#5a4326'); R(p.dx - 5, y + h, 10, 2, '#b8a888');
      R(x + w - 16, y + 38, 8, 3, '#55504a'); R(x + w - 14, y + 41, 4, 5, '#3f3a36');
    } else if (p.kind === 'forum') {          // an open colonnade where notices are posted
      R(x, y, w, h, '#c9c2ad'); for (let yy = y + 2; yy < y + h; yy += 7) for (let xx = x + ((yy - y) % 14 ? 2 : 6); xx < x + w - 6; xx += 10) R(xx, yy, 9, 6, '#d6d0bd');
      R(x, y, w, 9, '#b5522e'); for (let xx = x + 3; xx < x + w; xx += 6) R(xx, y, 1, 9, '#a04628'); R(x, y + 8, w, 1, '#6f2e1a'); R(x, y, w, 1, '#d0673c');
      for (let cx = x + 4; cx < x + w - 4; cx += 13) { R(cx, y + 9, 4, 12, '#f1ecdc'); R(cx, y + 9, 1, 12, '#d8d2bf'); }
      for (const cx of [x + 2, x + w - 6]) for (let yy = y + 24; yy < y + h - 4; yy += 9) { R(cx, yy, 4, 6, '#f1ecdc'); R(cx, yy + 6, 4, 1, 'rgba(0,0,0,.25)'); }
      R(p.dx - 16, y + 27, 32, 12, '#6b4a2a'); R(p.dx - 15, y + 28, 30, 10, '#8a6a3a'); for (let i = 0; i < 5; i++) R(p.dx - 13 + i * 6, y + 29 + (i % 2) * 3, 4, 5, '#f2e9d2'); R(p.dx - 14, y + 39, 2, 5, '#5a4326'); R(p.dx + 12, y + 39, 2, 5, '#5a4326');
      R(x, y + h - 1, w, 1, '#8f8872'); R(p.dx - 5, y + h, 10, 2, '#b8a888');
    } else {                                   // the tavern where the other houses' men drink: timber and plaster
      tiles(x, y, w, 28, '#7a5232'); wall(x + 2, y + 28, w - 4, 18, '#e2d2a8');
      for (const cx of [x + 2, x + 20, x + w - 22, x + w - 4]) R(cx, y + 28, 2, 18, '#5a3c20'); R(x + 2, y + 36, w - 4, 1, '#5a3c20');
      win(x + 8, y + 31); win(x + w - 12, y + 31); door(p, 8, 11);
      R(p.dx + 8, y + 30, 1, 3, '#3a2a1c'); R(p.dx + 6, y + 33, 6, 6, '#8a2a20'); R(p.dx + 8, y + 35, 2, 2, '#e3b04a');
      R(x + 6, y + 40, 5, 6, '#7a5a2a'); R(x + 6, y + 40, 5, 1, '#3a2a1c'); R(x + 6, y + 43, 5, 1, '#3a2a1c');
    }
  }
  // trees: a round crown, lit from the upper left, over its own shadow
  for (const [tx, ty] of VIL_TREES) { ell(tx + 1, ty + 1, 7, 3, 'rgba(0,0,0,.25)'); R(tx - 1, ty - 4, 2, 5, '#5a3c20'); ell(tx, ty - 9, 7, 6, '#3f6a2c'); ell(tx - 1, ty - 10, 5, 4, '#57863a'); ell(tx - 2, ty - 11, 2, 2, '#77a64e'); }
  return (vil.layer = cv);
}

function drawVillage(cv, T) {
  const dt = Math.min(0.25, Math.max(0, T - (vil.prev || T))); vil.prev = T;      // a slow frame still moves him its full distance
  const modal = document.getElementById('modal'), frozen = (modal && !modal.hidden) || !!G.ruin;
  if (frozen) villageStill();
  villageStep(dt, frozen);

  const ctx = cv.getContext('2d');
  ctx.setTransform(VILLAGE.S, 0, 0, VILLAGE.S, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(villageLayer(), 0, 0, VILLAGE.W, VILLAGE.H);
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };

  // what moves on the buildings: water, smoke, the forge fire, flags
  for (let i = 0; i < 4; i++) { const a = T * 2 + i * 1.6; R(296 + Math.cos(a) * 5, 118 + Math.sin(a) * 3, 2, 1, '#d6ecf8'); }
  R(295, 109 - Math.abs(Math.sin(T * 3)) * 2, 2, 3, '#bfe0f4');
  const f = placeOf('smith'), glow = 0.55 + 0.45 * Math.sin(T * 7);
  R(f.dx - 5, f.y + 38, 10, 7, `rgba(255,${Math.round(120 + 70 * glow)},40,${(0.55 + 0.3 * glow).toFixed(2)})`); R(f.dx - 2, f.y + 41, 4, 3, '#ffe9a0');
  for (let i = 0; i < 4; i++) { const p = (T * 0.35 + i * 0.25) % 1; ctx.globalAlpha = 0.5 * (1 - p); R(f.x + f.w - 14 + Math.sin(p * 5 + i) * 3, f.y + 4 - p * 16, 4 + Math.round(p * 3), 3, '#d8d4cc'); }
  ctx.globalAlpha = 1;
  const a = placeOf('arena'), acx = a.x + a.w / 2;
  for (const [ox, col] of [[-50, '#8a2a20'], [-28, '#c9a21e'], [28, '#2f6db8'], [50, '#8a2a20']]) { const fy = a.y + 28 - Math.round(26 * Math.sqrt(1 - (ox * ox) / (63 * 63))) - 7; R(acx + ox, fy, 1, 8, '#5a4326'); R(acx + ox + 1, fy + (Math.sin(T * 4 + ox) > 0 ? 0 : 1), 5, 3, col); }

  // the doorstep of the screen now open, and of wherever the steward is sending you
  const cur = PLACES.find(p => p.key === ui.tab);
  if (cur) { ctx.globalAlpha = 0.5 + 0.3 * Math.sin(T * 4); R(cur.dx - 6, cur.dy - 4, 12, 5, '#f5d584'); ctx.globalAlpha = 1; }

  // people, the nearer drawn over the farther
  const folk = vil.npcs.map(n => ({ y: n.y, draw: () => vilPerson(ctx, n.x, n.y, n) }));
  folk.push({ y: vil.y, draw: () => vilPerson(ctx, vil.x, vil.y, { face: vil.face, walk: vil.walk, moving: vil.moving, tunic: '#f1ead8', stripe: '#7a2a8a', hair: '#4a3320', laurel: true }) });
  folk.sort((p, q) => p.y - q.y).forEach(p => p.draw());
  const bob = Math.round(Math.sin(T * 5));                              // a mark over your own head, so you can find him
  R(vil.x - 2, vil.y - 21 + bob, 5, 1, '#f5d584'); R(vil.x - 1, vil.y - 20 + bob, 3, 1, '#f5d584'); R(vil.x, vil.y - 19 + bob, 1, 1, '#f5d584');

  // names over the doors, the open one in gold, and how many things wait inside
  const marks = typeof villageMarks === 'function' ? villageMarks() : {};
  ctx.font = 'bold 6px Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (const p of PLACES) {
    const on = p.key === ui.tab, w = Math.ceil(ctx.measureText(p.name.toUpperCase()).width) + 6, lx = p.dx - Math.floor(w / 2), ly = Math.max(1, p.y - 8);
    R(lx, ly, w, 8, on ? '#f5d584' : 'rgba(24,16,10,.82)'); R(lx, ly + 7, w, 1, on ? '#b6832c' : '#000');
    ctx.fillStyle = on ? '#2a1a0c' : '#f2e6cc'; ctx.fillText(p.name.toUpperCase(), p.dx, ly + 6);
    if (marks[p.key]) { R(lx + w + 1, ly, 8, 8, '#c23b2e'); ctx.fillStyle = '#fff'; ctx.fillText(String(marks[p.key]), lx + w + 5, ly + 6); }
    if (ui.wayTo === p.key && !on) {                                     // the steward's arrow
      const ay = p.dy - 20 + Math.round(Math.sin(T * 6) * 2);
      R(p.dx - 1, ay, 3, 6, '#f5d584'); R(p.dx - 3, ay + 6, 7, 1, '#f5d584'); R(p.dx - 2, ay + 7, 5, 1, '#f5d584'); R(p.dx - 1, ay + 8, 3, 1, '#f5d584'); R(p.dx, ay + 9, 1, 1, '#f5d584');
    }
  }
}

function villageFrame(ts) {
  const cv = document.getElementById('village');
  if (!cv || !G) { vil.raf = 0; return; }
  const arena = document.getElementById('arena');
  if (ts - vil.last > 15 && !(arena && !arena.hidden)) { vil.last = ts; try { drawVillage(cv, ts / 1000); } catch (e) { console.error(e); vil.raf = 0; return; } }
  else if (arena && !arena.hidden) { villageStill(); vil.prev = 0; }
  vil.raf = requestAnimationFrame(villageFrame);
}
function startVillage() {
  const cv = document.getElementById('village');
  if (!cv) return;
  if (!vil.x) villagePlace(ui.tab);
  if (!vil.raf) vil.raf = requestAnimationFrame(villageFrame);
}
