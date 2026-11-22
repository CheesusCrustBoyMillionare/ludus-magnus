'use strict';
// The village: a small town seen from above, and the only way to get from one screen of the game to another.
// You walk the lanista about it with W A S D, or click a building and he walks there himself. Stepping onto a
// building's doorstep opens its screen. Drawn on the same 590x190 grid as the yard, at 2 canvas pixels per unit.

const VILLAGE = { W: 590, H: 190, S: 2, CELL: 5, SPEED: 190 };
// Each place: its screen, its name on the map, and the ground it stands on (x, y, w, h). The door is in the
// middle of the bottom edge, and the doorstep a little below it.
const PLACES = [
  { key: 'facilities', name: 'Household',  x: 10,  y: 24,  w: 78,  h: 46, kind: 'villa' },
  { key: 'ludus',      name: 'Ludus',      x: 108, y: 22,  w: 98,  h: 48, kind: 'ludus' },
  { key: 'arena',      name: 'Arena',      x: 212, y: 0,   w: 168, h: 72, kind: 'arena' },
  { key: 'patrons',    name: 'Patrons',    x: 388, y: 22,  w: 74,  h: 48, kind: 'temple' },
  { key: 'chronicle',  name: 'Chronicle',  x: 492, y: 26,  w: 76,  h: 44, kind: 'archive' },
  { key: 'market',     name: 'Market',     x: 38,  y: 104, w: 98,  h: 44, kind: 'market' },
  { key: 'smith',      name: 'Blacksmith', x: 168, y: 102, w: 66,  h: 46, kind: 'forge' },
  { key: 'contracts',  name: 'Contracts',  x: 358, y: 102, w: 100, h: 46, kind: 'forum' },
  { key: 'rivals',     name: 'Rivals',     x: 488, y: 102, w: 72,  h: 46, kind: 'tavern' },
];
PLACES.forEach(p => { p.dx = Math.round(p.x + p.w / 2); p.dy = p.y + p.h + 6; });
const placeOf = key => PLACES.find(p => p.key === key) || PLACES[1];
// The arena's oval: its centre and its two radii, for painting it, for walking round it and for what moves on it.
const arenaGeom = () => { const p = PLACES.find(q => q.kind === 'arena'); return { p, cx: p.x + p.w / 2, cy: p.y + 35, RX: p.w / 2 - 1, RY: 33 }; };
// Things in the way that are not buildings: the fountain, trees, the well.
const VIL_TREES = [[98, 21], [477, 24], [580, 52], [6, 102], [140, 120], [248, 108], [342, 108], [482, 124], [584, 98], [20, 168], [300, 182], [440, 180], [150, 182], [560, 178]];
const VIL_BLOCKS = [{ x: 286, y: 112, w: 20, h: 16 }, { x: 148, y: 158, w: 8, h: 6 }, { x: 366, y: 173, w: 30, h: 9 }].concat(VIL_TREES.map(([x, y]) => ({ x: x - 1, y: y - 2, w: 3, h: 3 })));      // a tree stops you at its trunk, not its shade

const vil = {
  x: 0, y: 0, face: 'down', walk: 0, moving: false, at: null,      // the lanista, and whose doorstep he stands on
  path: null, then: null, keys: {}, npcs: [], raf: 0, last: 0, prev: 0, layer: null, grid: null,
  hover: null, puffs: [], puffT: 0, flock: 0,          // where the mouse is over the map; dust from his feet; when the pigeons last took fright
};
// What each place is, said when the mouse rests on it.
const PLACE_INFO = {
  facilities: 'YOUR HOUSE: STAFF, RATIONS AND THE STORES', ludus: 'YOUR SCHOOL: THE MEN, THEIR TRAINING AND ITS BUILDINGS', arena: 'THE ARENA: BOUTS ON GAMES DAYS',
  patrons: 'THE TEMPLE: THE PATRONS WHOSE FAVOUR YOU NEED', chronicle: 'THE RECORD HOUSE: THE CHRONICLE OF YOUR HOUSE', market: 'THE MARKET: FIGHTERS FOR SALE',
  smith: 'THE BLACKSMITH: WEAPONS AND ARMOUR', contracts: 'THE FORUM: PAID WORK FOR YOUR MEN', rivals: 'THE TAVERN: NEWS OF THE RIVAL HOUSES',
};

// ---------- the ground: where a man can walk, and how to get somewhere ----------

function vilGrid() {
  if (vil.grid) return vil.grid;
  const C = VILLAGE.CELL, w = Math.ceil(VILLAGE.W / C), h = Math.ceil(VILLAGE.H / C), g = new Uint8Array(w * h);
  const block = r => { for (let cy = Math.floor(r.y / C); cy <= Math.floor((r.y + r.h - 1) / C); cy++) for (let cx = Math.floor(r.x / C); cx <= Math.floor((r.x + r.w - 1) / C); cx++) if (cx >= 0 && cy >= 0 && cx < w && cy < h) g[cy * w + cx] = 1; };
  PLACES.forEach(p => {
    if (p.kind !== 'arena') return block(p);
    // the arena is an oval: only the ground it really stands on is in the way, not the corners of the box round it
    const A = arenaGeom(), cx = A.cx, cy = A.cy + 3;
    for (let y = Math.floor(p.y / C); y <= Math.floor((p.y + p.h - 1) / C); y++) for (let x = Math.floor(p.x / C); x <= Math.floor((p.x + p.w - 1) / C); x++) {
      const dx = (x * C + C / 2 - cx) / (A.RX + 1), dy = (y * C + C / 2 - cy) / (A.RY + 3);
      if (dx * dx + dy * dy <= 1 && x >= 0 && y >= 0 && x < w && y < h) g[y * w + x] = 1;
    }
  });
  VIL_BLOCKS.forEach(block);
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
// Where those who have come with work stand in the square, and where the lanista stops to hear each of them.
const GIVER_AT = [[276, 138], [316, 140], [296, 146]], GIVER_STAND = [[286, 141], [306, 143], [296, 153]];
const giverOf = key => typeof key === 'string' && key.startsWith('giver') ? +key.slice(5) : -1;
function villageWalkTo(key, then) {
  if (giverOf(key) >= 0) {
    const i = giverOf(key), [sx, sy] = GIVER_STAND[i], talk = () => { vil.face = i === 2 ? 'up' : i === 1 ? 'right' : 'left'; if (typeof villageTalk === 'function') villageTalk(i); };
    if (Math.hypot(vil.x - sx, vil.y - sy) < 8) { vil.then = null; talk(); return; }
    vil.then = talk; vil.path = vilPath(vil.x, vil.y, sx, sy) || vilPath(vil.x, vil.y, 296, 142);
    return;
  }
  if (key === 'gate') { vil.then = null; vil.path = vilPath(vil.x, vil.y, 582, 83); return; }
  if (key === 'fountain') { vil.then = () => { if (typeof villageTalk === 'function') villageTalk(); }; if (Math.hypot(vil.x - 296, vil.y - 142) < 8) { const f = vil.then; vil.then = null; f(); return; } vil.path = vilPath(vil.x, vil.y, 296, 142); return; }
  const p = placeOf(key);
  vil.then = then || null;
  if (vil.at === p.key && Math.hypot(vil.x - p.dx, vil.y - p.dy) < 7) { vil.path = null; const f = vil.then; vil.then = null; if (f) f(); return; }
  vil.path = vilPath(vil.x, vil.y, p.dx, p.dy);
}
// Which building a click landed on ('gate' for the way out of town).
function villageAt(x, y) {
  if (x > 566 && y > 58 && y < 102) return 'gate';
  if (typeof fountainFolk === 'function') { const n = fountainFolk().length;      // whoever is waiting in the square with work: each can be picked out, the nearest to the eye first
    for (const i of [2, 1, 0]) if (i < n && Math.abs(x - GIVER_AT[i][0]) <= 7 && y >= GIVER_AT[i][1] - 25 && y <= GIVER_AT[i][1] + 4) return 'giver' + i; }
  const p = PLACES.find(b => x >= b.x - 3 && x <= b.x + b.w + 3 && y >= b.y - 9 && y <= b.y + b.h + 10);
  return p ? p.key : null;
}
function villagePick(cv, e) {
  const r = cv.getBoundingClientRect();
  return villageAt((e.clientX - r.left) / r.width * VILLAGE.W, (e.clientY - r.top) / r.height * VILLAGE.H);
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
  if (vil.moving) { vil.stepT = (vil.stepT || 0) - dt; if (vil.stepT <= 0) { vil.stepT = 0.18; if (typeof SFX !== 'undefined') SFX.ui('step'); } }
  if (vil.moving) { vil.walk += dt * 17; vil.puffT -= dt; if (vil.puffT <= 0) { vil.puffT = 0.16; vil.puffs.push({ x: vil.x + (Math.random() * 4 - 2), y: vil.y, t: 0 }); } }
  for (const q of vil.puffs) q.t += dt;
  if (vil.puffs.length && vil.puffs[0].t > 0.5) vil.puffs.shift();
  const here = PLACES.find(p => Math.abs(vil.x - p.dx) < 7 && Math.abs(vil.y - p.dy) < 5);
  // a doorstep opens when you step onto it; a man sent somewhere walks past the doors on his way without looking in
  if (here && vil.at !== here.key && !vil.path) { vil.at = here.key; if (typeof villageEnter === 'function') villageEnter(here.key); }
  else if (!here) vil.at = null;
  // the east gate: walk into it and the school marches out, if it is open
  if (vil.x > 578 && vil.y > 72 && vil.y < 94) { if (!vil.gated) { vil.gated = true; vil.path = null; villageStill(); if (typeof villageGate === 'function') villageGate(); } }
  else if (vil.x < 570) vil.gated = false;

  // townsfolk, going from door to door about their own business
  if (!vil.npcs.length) {
    const tunics = ['#8a4a3a', '#4a6a8a', '#7a7a3a', '#6a4a7a', '#3f7a5a', '#a8763a', '#8a8a8a', '#b06a8a', '#5a8a9a'];
    for (let i = 0; i < 9; i++) { const p = PLACES[(i * 4 + 2) % PLACES.length]; vil.npcs.push({ x: p.dx + (i % 3) * 6 - 6, y: p.dy + 6 + (i % 2) * 4, face: 'down', walk: i, wait: 1 + i * 0.9, path: null, tunic: tunics[i], hair: i % 2 ? '#2a1c14' : '#6a4a2a', skin: ['#d9a57c', '#c9966c', '#8a5a3a', '#e3b48f'][i % 4] }); }
  }
  for (const n of vil.npcs) {
    if (n.path) { n.moving = true; n.walk += dt * 8; if (followPath(n, dt, 38)) { n.path = null; n.moving = false; n.wait = 2 + Math.random() * 7; } continue; }
    n.wait -= dt;
    if (n.wait <= 0) {
      // most errands are to a door; some are only to the square, to sit or to talk
      const sq = Math.random() < 0.3, p = PLACES[Math.floor(Math.random() * PLACES.length)];
      n.path = sq ? vilPath(n.x, n.y, 262 + Math.round(Math.random() * 70), 132 + Math.round(Math.random() * 14)) : vilPath(n.x, n.y, p.dx + Math.round(Math.random() * 16 - 8), p.dy + 5 + Math.round(Math.random() * 6));
    }
  }
  // the pigeons in the square take fright when anyone walks through them
  if (Math.abs(vil.x - 296) < 34 && Math.abs(vil.y - 132) < 20 && vil.moving) vil.flock = 2.6;
  vil.flock = Math.max(0, vil.flock - dt);
}

// A child: half the size of a man and twice as quick.
function vilChild(ctx, X, Y, face, walk, tunic) {
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(X + x), Math.round(Y + y), w, h); }, st = Math.sin(walk) > 0 ? 1 : 0;
  R(-2, -1, 5, 1, 'rgba(0,0,0,.25)'); R(-1, -3 + st, 1, 2, '#d9a57c'); R(1, -3 + (1 - st), 1, 2, '#d9a57c');
  R(-2, -7, 4, 4, tunic); R(-1, -10, 3, 3, '#d9a57c'); R(-1, -11, 3, 1, '#3a2a1c');
  if (face !== 'up') R(face === 'left' ? -1 : 1, -9, 1, 1, '#1c1310');
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
  // What you have built shows on the map, so the map is painted again whenever a level changes.
  const F = (typeof G !== 'undefined' && G && G.fac) || {}, SM = (typeof G !== 'undefined' && G && G.smith) ? (G.smith.level | 0) : 0;
  const key = [F.barracks, F.ground, F.infirmary, F.baths, F.shrine, F.stores, F.stables, SM].map(v => v | 0).join('');
  if (vil.layer && vil.layer.width === VILLAGE.W * VILLAGE.S && vil.layerKey === key) return vil.layer;
  vil.layerKey = key;
  const cv = document.createElement('canvas'); cv.width = VILLAGE.W * VILLAGE.S; cv.height = VILLAGE.H * VILLAGE.S;
  const ctx = cv.getContext('2d'); ctx.setTransform(VILLAGE.S, 0, 0, VILLAGE.S, 0, 0); ctx.imageSmoothingEnabled = false;
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const ell = (cx, cy, rx, ry, c) => { ctx.fillStyle = c; for (let y = -ry; y <= ry; y++) { const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)))); ctx.fillRect(Math.round(cx - hw), Math.round(cy + y), hw * 2, 1); } };
  const rnd = (i, m) => Math.abs(Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1 * m;

  // grass, with tufts and flowers
  R(0, 0, 590, 190, '#7e9a4b');
  for (let i = 0; i < 520; i++) R(rnd(i, 590), rnd(i + 900, 190), 2, 1, i % 3 ? '#718c42' : '#8eab58');
  for (let i = 0; i < 46; i++) R(rnd(i + 50, 590), rnd(i + 70, 190), 1, 1, ['#f2e6a0', '#e8a0a0', '#f4f4f0'][i % 3]);
  // lighter and darker stretches, so the green is not one flat colour
  for (let y = 0; y < 190; y += 5) for (let x = 0; x < 590; x += 5) { const n = wildNoise(x / 55, y / 55, 77); if (n > 0.62) R(x, y, 5, 5, 'rgba(255,255,210,.07)'); else if (n < 0.36) R(x, y, 5, 5, 'rgba(0,30,0,.08)'); }
  // a kitchen garden and an orchard along the south wall
  for (let i = 0; i < 6; i++) { R(40 + i * 13, 176, 10, 9, '#6b5028'); for (let k = 0; k < 3; k++) R(41 + i * 13 + k * 3, 177 + (k % 2), 2, 6, i % 2 ? '#6f9a3a' : '#8ab04a'); }
  // a hedge under the north wall, an orchard and beehives along the south, and the duck pond
  for (let x = 6; x < 584; x += 5) { if (x > 206 && x < 384) continue; const hgt = 3 + Math.round(rnd(x, 2)); R(x, 5, 6, hgt, x % 15 < 5 ? '#3f6a2c' : '#4a7a36'); R(x + 1, 5, 3, 1, '#63903f'); if (rnd(x + 9, 1) > 0.85) R(x + 2, 6, 1, 1, '#e8a0a0'); }
  for (let i = 0; i < 5; i++) { const ox = 240 + i * 13, oy = 180; ell(ox + 1, oy + 2, 5, 2, 'rgba(0,0,0,.2)'); R(ox, oy - 2, 1, 4, '#5a3c20'); ell(ox, oy - 5, 5, 4, '#4a7a36'); ell(ox - 1, oy - 6, 3, 2, '#63903f'); R(ox - 2, oy - 4, 1, 1, '#c23b2e'); R(ox + 2, oy - 6, 1, 1, '#c23b2e'); R(ox + 1, oy - 3, 1, 1, '#e3b04a'); }
  for (let i = 0; i < 3; i++) { const bx = 328 + i * 8; R(bx, 177, 5, 6, '#d9c070'); R(bx, 177, 5, 1, '#e6d088'); R(bx, 179, 5, 1, '#b89a4a'); R(bx, 181, 5, 1, '#b89a4a'); R(bx + 2, 182, 1, 1, '#3a2a1c'); }
  ell(381, 178, 16, 5, '#5f7f3f'); ell(381, 177, 15, 4, '#4f8fb8'); ell(379, 176, 11, 2, '#6fa8cc');
  for (const [rx, ry] of [[366, 176], [369, 180], [395, 175], [392, 181]]) { R(rx, ry - 4, 1, 5, '#6f8a3a'); R(rx + 1, ry - 3, 1, 4, '#8aa64a'); R(rx, ry - 5, 1, 1, '#7a5a2a'); }
  // the two streets and the lanes between them
  const road = (x, y, w, h) => { R(x - 1, y - 1, w + 2, h + 2, '#a98a58'); R(x, y, w, h, '#cdae78'); for (let i = 0; i < w * h / 26; i++) R(x + rnd(i + x, w - 2), y + rnd(i + y + 7, h - 1), 2, 1, i % 2 ? '#bf9f6a' : '#d9bd8a'); };
  road(4, 74, 582, 18); road(4, 152, 582, 16);
  for (const x of [14, 146, 464, 566]) road(x, 92, 12, 60);
  for (const lx of [14, 146, 464, 566]) for (let y = 94; y < 150; y += 2) { if (rnd(lx + y, 1) > 0.55) R(lx - 1 + (rnd(y + 3, 1) > 0.5 ? 0 : 1), y, 1, 2, '#7e9a4b'); if (rnd(lx + y + 50, 1) > 0.55) R(lx + 11 - (rnd(y + 9, 1) > 0.5 ? 0 : 1), y, 1, 2, '#7e9a4b'); if (rnd(lx * 3 + y, 1) > 0.9) R(lx + 3 + rnd(y, 5), y, 2, 1, '#b8985f'); }
  for (let i = 0; i < 26; i++) {                 // bushes and clumps of wild flowers on the open ground, kept off the streets
    const bx = 8 + rnd(i * 17 + 5, 572), by = [14, 40, 58, 92, 110, 128, 146, 174][i % 8] + rnd(i * 3 + 1, 8);
    if ((by > 70 && by < 96) || (by > 148 && by < 172) || PLACES.some(p => bx > p.x - 6 && bx < p.x + p.w + 6 && by > p.y - 6 && by < p.y + p.h + 8) || (bx > 250 && bx < 350 && by > 88 && by < 156)) continue;
    if (i % 3 === 0) { ell(bx + 1, by + 1, 4, 2, 'rgba(0,0,0,.18)'); ell(bx, by - 1, 4, 3, '#4a7a36'); ell(bx - 1, by - 2, 2, 2, '#63903f'); if (i % 2) R(bx + 1, by - 1, 1, 1, '#e06a8a'); }
    else for (let q = 0; q < 5; q++) R(bx + rnd(i + q * 7, 7), by + rnd(i * 5 + q, 4), 1, 1, [['#f2e6a0', '#f4f4f0'], ['#e8a0a0', '#b9a0e0'], ['#f4f4f0', '#e06a8a']][i % 3][q % 2]);
  }
  // the streets are kerbed with stone and rutted by carts
  for (const [ry, rh] of [[74, 18], [152, 16]]) {
    for (let x = 6; x < 584; x += 4) { R(x, ry - 1, 3, 1, x % 8 ? '#bdb39c' : '#a39a84'); R(x + 1, ry + rh, 3, 1, x % 8 ? '#a39a84' : '#bdb39c'); }
    for (let x = 6; x < 584; x += 3) { if (rnd(x + ry, 1) > 0.25) { R(x, ry + Math.round(rh * 0.36), 2, 1, 'rgba(120,85,40,.28)'); R(x, ry + Math.round(rh * 0.64), 2, 1, 'rgba(120,85,40,.28)'); } }
  }
  // the square, paved, with the fountain in it
  R(254, 92, 92, 60, '#b9b29c');
  for (let y = 92; y < 150; y += 7) for (let x = 254 + (((y - 92) / 7) % 2 ? 0 : 5); x < 346; x += 10) { R(x, y, Math.min(9, 346 - x), 6, (x + y) % 3 ? '#c9c3ae' : '#d4cfbc'); }
  R(254, 92, 92, 1, '#8f8872'); R(254, 151, 92, 1, '#8f8872');
  ell(296, 121, 11, 8, 'rgba(0,0,0,.25)'); ell(296, 119, 11, 8, '#a39d8a'); ell(296, 119, 9, 6, '#5d9ac2'); ell(296, 118, 7, 4, '#7fb6d8'); R(294, 112, 4, 8, '#bdb7a3'); R(293, 111, 6, 2, '#d4cfbc');
  // the square: a statue of some forgotten magistrate, and benches to argue on
  R(291, 104, 10, 4, '#a39d8a'); R(292, 103, 8, 1, '#d4cfbc'); R(294, 95, 4, 8, '#c9c3ae'); R(294, 92, 4, 3, '#d9d2bd'); R(293, 96, 1, 5, '#b5af9b'); R(298, 97, 2, 1, '#c9c3ae');
  for (const [bx, by] of [[262, 138], [322, 138], [262, 104], [322, 104]]) { R(bx, by, 12, 3, '#8a6a3a'); R(bx, by, 12, 1, '#a8834a'); R(bx + 1, by + 3, 1, 2, '#5a4326'); R(bx + 10, by + 3, 1, 2, '#5a4326'); }
  // flowers by the temple, barrels by the tavern, crates by the market, hay by the school, washing by the forge
  for (const fx of ((F.shrine | 0) >= 1 ? [] : [468])) { R(fx, 66, 8, 5, '#5a4326'); for (let k = 0; k < 4; k++) R(fx + k * 2, 66 + (k % 2), 2, 2, ['#e06a8a', '#f2e6a0', '#b9a0e0', '#e8a0a0'][k]); }
  for (const bx of [478, 562]) { R(bx, 142, 6, 7, '#7a5a2a'); R(bx, 142, 6, 1, '#3a2a1c'); R(bx, 145, 6, 1, '#3a2a1c'); R(bx + 1, 141, 4, 1, '#a8834a'); }
  R(138, 140, 7, 7, '#a8834a'); R(138, 140, 7, 1, '#c9a25a'); R(141, 135, 6, 6, '#a8834a'); R(141, 135, 6, 1, '#c9a25a');
  R(238, 112, 1, 12, '#5a4326'); R(250, 112, 1, 12, '#5a4326'); R(238, 113, 13, 1, '#3a2a1c'); R(240, 114, 3, 4, '#e8e2d0'); R(244, 114, 2, 5, '#b85a48'); R(247, 114, 3, 3, '#8fa8c8');
  // a well, and a cart by the lower street
  R(148, 158, 8, 6, '#8f8872'); R(149, 159, 6, 4, '#2c3f52'); R(147, 154, 1, 5, '#6b4a2a'); R(156, 154, 1, 5, '#6b4a2a'); R(147, 153, 10, 1, '#6b4a2a');
  R(214, 172, 14, 5, '#8a6a3a'); R(214, 171, 14, 1, '#a8834a'); R(216, 176, 3, 3, '#3a2a1c'); R(223, 176, 3, 3, '#3a2a1c'); R(216, 168, 10, 3, '#d9c27a');

  // ----- buildings -----
  // a roof seen from above: the far slope catching the light, the near one in shade, a ridge between them, the tiles
  // in rows with their joints, a few gone dark with age and moss in a joint or two
  const tiles = (x, y, w, h, base) => {
    const mid = Math.floor(h / 2);
    R(x, y, w, mid, shade(base, 1.08)); R(x, y + mid, w, h - mid, shade(base, 0.93));
    for (let yy = y + 2; yy < y + h; yy += 3) R(x, yy, w, 1, shade(base, yy < y + mid ? 0.92 : 0.79));
    for (let xx = x + 3; xx < x + w; xx += 6) { R(xx, y, 1, h, shade(base, 0.84)); R(xx + 1, y, 1, mid, shade(base, 1.17)); }
    for (let q = 0, n = Math.floor(w * h / 200); q < n; q++) R(x + 2 + rnd(x + q * 7, w - 6), y + 1 + rnd(y + q * 13, h - 3), 2, 1, q % 4 ? shade(base, 0.7) : '#6f8a4a');
    R(x, y + mid - 1, w, 2, shade(base, 1.3)); R(x, y + mid + 1, w, 1, shade(base, 0.68));
    R(x, y, w, 1, shade(base, 1.2)); R(x, y + h - 1, w, 1, shade(base, 0.6)); R(x, y, 1, h, shade(base, 1.1)); R(x + w - 1, y, 1, h, shade(base, 0.72));
  };
  const wall = (x, y, w, h, c) => { R(x, y, w, h, c); for (let q = 0, n = Math.floor(w * h / 110); q < n; q++) R(x + 1 + rnd(x + q * 5, w - 6), y + 3 + rnd(y + q * 11, h - 6), 3 + (q % 3), 1 + (q % 2), q % 2 ? shade(c, 0.94) : shade(c, 1.05)); R(x, y, w, 1, shade(c, 0.74)); R(x, y + 1, w, 2, 'rgba(30,18,8,.16)'); R(x, y + h - 2, w, 2, shade(c, 0.84)); R(x, y + h - 3, w, 1, 'rgba(60,40,20,.12)'); R(x, y, 1, h, shade(c, 0.88)); R(x + w - 1, y, 1, h, shade(c, 0.88)); };      // plaster patched and faded, shade under the eaves, dirt at the foot
  const door = (p, w, h, c) => { const x = p.dx - Math.floor(w / 2), y = p.y + p.h - h; R(x - 1, y - 1, w + 2, h + 1, '#5a4326'); R(x, y, w, h, c || '#3a2416'); R(p.dx - 5, p.y + p.h, 10, 2, '#b8a888'); };
  const win = (x, y) => { R(x - 1, y, 1, 4, '#6f5140'); R(x + 3, y, 1, 4, '#6f5140'); R(x, y, 3, 4, '#3a2e24'); R(x, y, 3, 1, '#8a7a5a'); R(x - 1, y + 4, 5, 1, '#cfc4a8'); };      // shutters, and a sill
  // every building throws its shade down and to the right, as the trees and the arena do
  const shadow = p => { R(p.x + 3, p.y + p.h, p.w, 4, 'rgba(0,0,0,.22)'); R(p.x + p.w, p.y + 5, 3, p.h - 1, 'rgba(0,0,0,.2)'); R(p.x + 5, p.y + p.h + 4, p.w - 2, 1, 'rgba(0,0,0,.1)'); };
  for (const p of PLACES) {
    const { x, y, w, h } = p;
    if (p.kind !== 'arena') shadow(p);
    if (p.kind === 'villa') {                 // your own house: tiled, with an open court and a garden in it
      tiles(x, y, w, 30, '#b5522e'); R(x + 26, y + 8, 26, 14, '#5a2a18'); R(x + 27, y + 9, 24, 12, '#6f9a4a'); R(x + 36, y + 13, 6, 4, '#6fb0d0'); R(x + 30, y + 11, 2, 2, '#3f6a2a'); R(x + 46, y + 17, 2, 2, '#3f6a2a');
      wall(x + 2, y + 30, w - 4, 16, '#ead9b4'); for (const cx of [x + 8, x + 18, x + w - 21, x + w - 11]) win(cx, y + 35);
      R(p.dx - 9, y + 31, 2, 15, '#f4ecd8'); R(p.dx + 7, y + 31, 2, 15, '#f4ecd8'); door(p, 8, 11);
    } else if (p.kind === 'ludus') {          // the school: barracks round a sanded yard, and everything you have built there
      const bl = F.barracks | 0, gl = F.ground | 0, il = F.infirmary | 0, wl = F.baths | 0, ch = bl >= 2 ? 16 : 20;
      tiles(x, y, w, 32, bl >= 1 ? '#a8482a' : '#9a7a42');                               // thatch until the barracks are built up; tile after
      if (bl === 0) for (let q = 0; q < 60; q++) R(x + 1 + rnd(q + 500, w - 3), y + 1 + rnd(q + 560, 30), 1, 2, q % 2 ? '#c8a85a' : '#7a5e30');
      R(x + 16, y + 7, w - 32, ch + 2, '#5a2a18'); R(x + 17, y + 8, w - 34, ch, '#e2c98f');
      for (let q = 0; q < 26; q++) R(x + 18 + rnd(q + 3, w - 38), y + 9 + rnd(q + 9, ch - 3), 2, 1, '#d2b77c');
      // the training ground: a post for each level, then a chalked ring, then a rack of arms and a statue of some old champion
      for (let q = 0; q <= gl; q++) { const px = x + 24 + q * 13; R(px, y + 12, 2, 8, '#7a5a2a'); R(px - 1, y + 12, 4, 1, '#7a5a2a'); R(px, y + 20, 3, 1, 'rgba(0,0,0,.2)'); if (gl >= 2) { R(px, y + 14, 2, 2, '#a8452e'); } }
      if (gl >= 2) for (let q = 0; q < 26; q++) { const a2 = q / 26 * 6.283; R(x + w / 2 + Math.cos(a2) * 24, y + 8 + ch / 2 + Math.sin(a2) * (ch / 2 - 2), 2, 1, '#f6ecc8'); }
      if (gl >= 3) { const rx = x + 20; R(rx, y + 9, 1, 6, '#5e4426'); R(rx + 6, y + 9, 1, 6, '#5e4426'); R(rx, y + 10, 7, 1, '#7a5a2a'); for (let q = 0; q < 3; q++) R(rx + 1 + q * 2, y + 7, 1, 6, '#c1c7cc'); R(x + w - 44, y + 9, 4, 2, '#c9c0aa'); R(x + w - 43, y + 5, 2, 4, '#d6ccb8'); R(x + w - 43, y + 4, 2, 1, '#e8e2d2'); }
      // the baths: a trough, then a pool, then a larger one rimmed in white, then a dome over the hot room
      if (wl === 0) { R(x + w - 28, y + ch + 3, 6, 2, '#6b4f2c'); R(x + w - 27, y + ch + 3, 4, 1, '#5aa0d0'); }
      else { const pw = wl >= 2 ? 11 : 8, phh = wl >= 2 ? 6 : 5, px = x + w - 19 - pw, py = y + 8 + ch - phh - 1; R(px, py, pw, phh, wl >= 2 ? '#f4fafb' : '#b8ab94'); R(px + 1, py + 1, pw - 2, phh - 2, '#4f8fb8'); R(px + 2, py + 1, pw - 5, 1, '#8fc3e0'); }
      if (wl >= 3) { ell(x + w - 9, y + 15, 6, 5, '#7f97a4'); ell(x + w - 9, y + 14, 6, 4, '#a8c4d0'); ell(x + w - 11, y + 12, 3, 2, '#cfe2ea'); R(x + w - 10, y + 9, 2, 2, '#e3b04a'); }
      // the barracks' front: one floor, then two, then a colonnade along it
      const wy = bl >= 2 ? y + 26 : y + 32, wh = y + 48 - wy;
      wall(x + 2, wy, w - 4, wh, bl >= 2 ? '#e6d6ae' : '#dccba0');
      for (let cx = x + 8; cx < x + w - 8; cx += 11) { if (Math.abs(cx + 1 - p.dx) > 9) win(cx, y + 37); if (bl >= 2) win(cx, y + 29); }
      door(p, 10, 12, '#4a2c18'); R(p.dx - 7, y + 33, 14, 2, '#7e241c');
      if (bl >= 3) {
        // a colonnade stood out in front of the wall: the wall behind it lies in the shade of the roof it carries, deepest
        // under the beam; each column is lit down its left side, throws its own shadow on the wall, and stands on a step
        R(x + 2, wy + 1, w - 4, wh - 1, 'rgba(46,28,14,.3)'); R(x + 2, wy + 1, w - 4, 2, 'rgba(20,12,6,.3)'); R(x + 2, wy + 3, w - 4, 1, 'rgba(20,12,6,.14)');
        R(x + 1, y + 46, w - 2, 2, '#e4dcc8'); R(x + 1, y + 46, w - 2, 1, '#f6f0e0'); R(x + 2, y + 45, w - 4, 1, 'rgba(20,12,6,.3)');
        for (let cx = x + 4; cx < x + w - 5; cx += 12) if (Math.abs(cx + 1 - p.dx) > 7) {
          R(cx + 3, wy + 2, 2, wh - 4, 'rgba(20,12,6,.3)');                                             // its shadow, on the wall behind
          R(cx, wy + 1, 3, wh - 2, '#f4eedc'); R(cx, wy + 1, 1, wh - 2, '#fffaf0'); R(cx + 2, wy + 1, 1, wh - 2, '#cfc6b0');
          R(cx - 1, wy, 5, 2, '#fbf6ea'); R(cx - 1, wy + 1, 5, 1, '#ddd4be');                           // capital
          R(cx - 1, y + 45, 5, 2, '#fbf6ea'); R(cx - 1, y + 46, 5, 1, '#d6ccb6');                       // base
        }
        R(x + 1, wy - 1, w - 2, 1, '#f0e8d6'); for (let q = 0; q < 4; q++) R(p.dx - 8 + q * 2, wy - 2 - q, 16 - q * 4, 1, q === 3 ? '#e8b545' : '#f0e8d6'); }
      // the infirmary: a stretch of the front whitewashed, under a green cross, wider as it is improved, with a door of its own
      if (il >= 1) { const iw = 9 + il * 4; R(x + 2, wy, iw, wh, '#f6f1e4'); R(x + 2, wy, iw, 1, '#cfc8b4'); R(x + 2 + iw, wy, 1, wh, '#b8ab94'); R(x + 2, wy + wh - 2, iw, 2, '#ddd6c2'); const cxx = x + 2 + Math.floor(iw / 2); R(cxx, wy + 2, 1, 5, '#3f8a3a'); R(cxx - 2, wy + 4, 5, 1, '#3f8a3a'); if (il >= 2) { R(cxx - 2, y + 40, 4, 8, '#3a2416'); R(cxx - 3, y + 39, 6, 1, '#5a4326'); } if (il >= 3) { R(x + 1, wy - 2, iw + 2, 2, '#c2552e'); R(x + 1, wy - 2, iw + 2, 1, '#de7652'); } }
      R(x + w - 6, y + 22, 1, 11, '#5a4326'); R(x + w - 5, y + 22, 6, 4, '#a02d22'); R(x + w - 5, y + 22, 6, 1, '#c8483a');
    } else if (p.kind === 'arena') {          // the amphitheatre: the greatest thing in the town, built into its north wall
      const { cx, cy, RX, RY } = arenaGeom(), rd = Math.round;
      const ring = (rx, ry, far, near) => { for (let yy = -ry; yy <= ry; yy++) { const hw = rd(rx * Math.sqrt(Math.max(0, 1 - (yy * yy) / (ry * ry)))); ctx.fillStyle = yy < 0 ? far : near; ctx.fillRect(rd(cx - hw), rd(cy + yy), hw * 2, 1); } };
      const on = (a2, rr) => [cx + Math.cos(a2) * RX * rr, cy + Math.sin(a2) * RY * rr];
      // a paved forecourt before the gate
      R(cx - 36, y + h - 3, 72, 7, '#c9c3ae'); for (let q = 0; q < 72; q += 6) R(cx - 36 + q + ((q / 6) % 2 ? 0 : 3), y + h + 1, 5, 2, '#d4cfbc'); R(cx - 36, y + h + 3, 72, 1, '#8f8872');
      // the drum of the outer wall, its arcade and cornice
      ell(cx + 3, cy + 8, RX + 2, RY + 1, 'rgba(0,0,0,.22)');
      ell(cx, cy + 5, RX, RY, '#8f8264'); ell(cx, cy + 4, RX, RY, '#b4a682'); ell(cx, cy, RX, RY, '#f0e6c8'); ell(cx, cy, RX - 1, RY - 1, '#dccfac');
      for (let ax = -(RX - 3); ax <= RX - 3; ax += 5) { const edge = rd(RY * Math.sqrt(Math.max(0, 1 - (ax * ax) / (RX * RX)))), yy = cy + edge; if (Math.abs(ax) > 12 && edge > 4) { R(cx + ax - 1, yy + 1, 3, 3, '#4a3e2c'); R(cx + ax - 1, yy, 3, 1, '#efe6cc'); R(cx + ax + 2, yy, 1, 4, '#c9bc98'); } }
      for (let ax = -70; ax <= 70; ax += 4) { const edge = rd(RY * Math.sqrt(Math.max(0, 1 - (ax * ax) / (RX * RX)))), yy = cy - edge; R(cx + ax, yy - 1, 2, 2, '#f8f0d8'); R(cx + ax, yy + 1, 4, 1, '#c9bc98'); }      // battlements along its far wall, where it stands in for the town's
      // eight tiers of seats, the far half lit and the near half in its own shade
      for (let k = 0; k < 8; k++) ring(rd(RX * (0.945 - k * 0.047)), rd(RY * (0.93 - k * 0.056)), k % 2 ? '#e2d6b6' : '#d4c7a4', k % 2 ? '#c9bc9a' : '#b9ac88');
      for (let q = 0; q < 18; q++) { const a2 = q / 18 * 6.283 + 0.17; for (let rr = 0.6; rr < 0.95; rr += 0.026) { const [sx, sy] = on(a2, rr); R(sx, sy, 1, 1, Math.sin(a2) < 0 ? '#f6eed6' : '#9c8f6e'); } }      // stairs between the blocks
      for (let q = 0; q < 18; q++) { const a2 = q / 18 * 6.283 + 0.17 + 0.175, [sx, sy] = on(a2, 0.79); R(sx - 1, sy, 2, 2, '#3a3020'); R(sx - 1, sy - 1, 2, 1, '#f0e6c8'); }                                        // the passages people come up by
      for (let i2 = 0; i2 < 120; i2++) { const a2 = rnd(i2, 6.283), k = Math.floor(rnd(i2 + 40, 6.99)), [sx, sy] = on(a2, 0.61 + k * 0.047); R(sx, sy, 1, 1, ['#8a2a20', '#2f6db8', '#e8dcc0', '#c9a21e', '#3a2a1c'][i2 % 5]); }      // a few people about on any day
      // the wall round the sand, the sand raked in rings, a gate at either end, the posts, old stains
      ring(rd(RX * 0.56), rd(RY * 0.47), '#7a6c4c', '#8f8060'); ring(rd(RX * 0.545), rd(RY * 0.44), '#f0e6c8', '#d8cca8'); ring(rd(RX * 0.515), rd(RY * 0.4), '#6e6040', '#8a7c5a');
      const SX = rd(RX * 0.5), SY = rd(RY * 0.36);
      ell(cx, cy, SX, SY, '#e2c98f'); ell(cx, cy - 1, SX - 1, SY - 2, '#e8d29c'); ell(cx, cy, rd(SX * 0.76), rd(SY * 0.7), '#e0c68a'); ell(cx, cy, rd(SX * 0.5), rd(SY * 0.46), '#e8d29c'); ell(cx, cy, rd(SX * 0.24), rd(SY * 0.24), '#e0c68a');
      for (let i2 = 0; i2 < 70; i2++) { const a2 = rnd(i2 + 200, 6.283), rr = rnd(i2 + 260, 0.95); R(cx + Math.cos(a2) * (SX - 2) * rr, cy + Math.sin(a2) * (SY - 1) * rr, 2, 1, i2 % 3 ? '#d4ba7e' : '#f0dcaa'); }
      R(cx - 16, cy + 3, 3, 1, '#b8845a'); R(cx + 11, cy - 4, 2, 1, '#b8845a'); R(cx + 20, cy + 4, 2, 1, '#a8744e'); R(cx - 24, cy - 2, 2, 1, '#b8845a');
      for (const gx of [-SX - 1, SX - 1]) { R(cx + gx, cy - 2, 3, 5, '#2a2014'); R(cx + gx, cy - 3, 3, 1, '#f0e6c8'); }
      for (const px of [-7, 7]) { R(cx + px, cy - 4, 1, 4, '#6b4f2c'); R(cx + px, cy, 2, 1, 'rgba(0,0,0,.25)'); }
      ell(cx, cy + SY, SX - 1, 2, 'rgba(60,40,10,.22)');
      // masts for the awning, the awning drawn out over the far seats in nine panels, and the magistrate's box
      for (let q = 0; q < 26; q++) { const a2 = q / 26 * 6.283 + 0.12, [mx, my] = on(a2, 0.99); R(mx, my - 3, 1, 4, '#5a4326'); R(mx, my - 4, 1, 1, '#f0e6c8'); }
      for (let q = 0; q < 9; q++) { const a0 = Math.PI + 0.2 + q * 0.305, stripe = q % 2 ? '#efe6cf' : '#c9a05a';
        for (let t2 = 0; t2 < 0.24; t2 += 0.014) for (let rr = 0.72; rr < 0.98; rr += 0.034) { const [ax2, ay2] = on(a0 + t2, rr); R(ax2, ay2, 2, 1, Math.floor(t2 / 0.048) % 2 ? stripe : shade(stripe, 0.88)); }
        const [e1x, e1y] = on(a0, 0.72), [e2x] = on(a0 + 0.24, 0.72); R(e1x, e1y + 1, Math.max(2, rd(e2x - e1x)), 1, 'rgba(40,30,10,.25)'); }
      { const by = rd(cy - RY * 0.8); R(cx - 10, by, 20, 7, '#6a2a7a'); R(cx - 10, by, 20, 1, '#9a5aaa'); R(cx - 10, by + 6, 20, 1, '#e8b545'); R(cx - 11, by - 1, 1, 9, '#e8b545'); R(cx + 10, by - 1, 1, 9, '#e8b545'); R(cx - 8, by + 2, 16, 3, '#3a1a44'); R(cx - 1, by - 3, 2, 3, '#e8b545'); }
      // the great gate: an arch between pilasters under a gable, steps, and a statue either side
      R(cx - 12, y + h - 17, 24, 17, '#d8cca8'); R(cx - 12, y + h - 17, 2, 17, '#f0e6c8'); R(cx + 10, y + h - 17, 2, 17, '#b4a682'); for (let q = 0; q < 5; q++) R(cx - 12 + q * 2, y + h - 18 - q, 24 - q * 4, 1, q === 4 ? '#e8b545' : '#efe4c4');
      R(cx - 7, y + h - 12, 14, 12, '#3a2416'); R(cx - 6, y + h - 13, 12, 1, '#3a2416'); R(cx - 7, y + h - 12, 14, 1, '#5a4326'); R(cx - 1, y + h - 12, 1, 12, '#5a3c20'); R(cx - 8, y + h, 16, 2, '#b8a888'); R(cx - 10, y + h + 2, 20, 1, '#a39a84');
      for (const sx of [-24, 21]) { R(cx + sx, y + h - 2, 4, 3, '#a39d8a'); R(cx + sx, y + h - 3, 4, 1, '#d4cfbc'); R(cx + sx + 1, y + h - 10, 2, 7, '#d9d2bd'); R(cx + sx + 1, y + h - 12, 2, 2, '#e4ddc8'); R(cx + sx, y + h - 9, 1, 3, '#c9c3ae'); R(cx + sx + 3, y + h - 8, 1, 2, '#b5af9b'); }
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
    } else if (p.kind === 'forge') {          // the forge, as good as you have made it
      if (SM === 0) { tiles(x, y, w, 28, '#8a6a3a'); for (let q = 0; q < 50; q++) R(x + 1 + rnd(q + 700, w - 3), y + 1 + rnd(q + 760, 26), 1, 2, q % 2 ? '#b8964e' : '#6b4f2c'); }      // wooden shingles and straw
      else tiles(x, y, w, 28, SM >= 3 ? '#4f4a58' : '#5d5864');
      if (SM >= 1) { R(x + w - 18, y + 4, 10, 10, '#4a4650'); R(x + w - 17, y + 5, 8, 8, '#8f8a84'); R(x + w - 15, y + 7, 4, 4, '#1c1614'); }            // the chimney
      if (SM >= 2) { R(x + 8, y + 6, 8, 8, '#4a4650'); R(x + 9, y + 7, 6, 6, '#8f8a84'); R(x + 11, y + 9, 2, 2, '#1c1614'); }                                // a second hearth, a second chimney
      if (SM >= 3) { R(x, y + 13, w, 2, '#a8482a'); R(x, y + 13, w, 1, '#c9684a'); }                                                                          // the ridge capped in tile
      if (SM >= 4) { R(x, y + 13, w, 1, '#e8b545'); R(p.dx - 2, y + 9, 4, 4, '#e8b545'); R(p.dx - 4, y + 10, 2, 2, '#e8b545'); R(p.dx + 2, y + 10, 2, 2, '#e8b545'); }      // gilded, with the eagle on it
      wall(x + 2, y + 28, w - 4, 18, SM === 0 ? '#a89878' : SM >= 3 ? '#c4b8a2' : '#b8ab94');
      if (SM >= 3) for (const qx of [x + 2, x + w - 5]) for (let q = 0; q < 18; q += 4) R(qx, y + 28 + q, 3, 3, '#ddd4c0');                                 // dressed stone at the corners
      win(x + 9, y + 34); if (SM >= 2) win(x + 17, y + 34);
      R(p.dx - 7, y + 33, 14, 13, '#2a1a12'); R(p.dx - 8, y + 32, 16, 1, '#5a4326'); R(p.dx - 5, y + h, 10, 2, '#b8a888');
      if (SM >= 2) { for (let q = 0; q < 16; q += 4) { R(p.dx - 8 + q, y + 29, 2, 3, '#8a2a20'); R(p.dx - 6 + q, y + 29, 2, 3, '#e8dcc0'); } R(p.dx - 8, y + 32, 16, 1, '#5e1c16'); }      // an awning over the door
      R(x + w - 16, y + 38, 8, 3, '#55504a'); R(x + w - 14, y + 41, 4, 5, '#3f3a36');                                                                        // the anvil outside
      if (SM >= 1) { R(x + w - 9, y + 30, 1, 3, '#3a2a1c'); R(x + w - 11, y + 33, 5, 4, SM >= 3 ? '#e8b545' : '#8a8478'); R(x + w - 10, y + 34, 3, 2, '#3a2a1c'); }      // his sign: iron, then gold
      if (SM >= 2) { R(x + 22, y + 36, 1, 10, '#5e4426'); R(x + 30, y + 36, 1, 10, '#5e4426'); R(x + 22, y + 37, 9, 1, '#7a5a2a'); for (let q = 0; q < 3; q++) R(x + 24 + q * 2, y + 33, 1, 9, '#c1c7cc'); }      // a rack of blades for sale
      if (SM >= 4) { for (const qx of [p.dx - 11, p.dx + 9]) { R(qx, y + 30, 2, 16, '#f4ecd8'); R(qx + 1, y + 30, 1, 16, '#d8d0bc'); R(qx - 1, y + 29, 4, 1, '#fbf6ea'); } for (const qx of [x + 4, x + w - 8]) { R(qx, y + 29, 4, 9, '#a8261c'); R(qx, y + 29, 4, 1, '#e8b545'); R(qx + 1, y + 32, 2, 2, '#e8b545'); } }      // columns by the door and the emperor's colours
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
  // your shrine in the temple precinct: an altar, then a little house for the god, then a greater one with gold on it
  { const l = F.shrine | 0, sx = 466, sy = 70;
    if (l >= 1) { R(sx, sy, 18, 2, 'rgba(0,0,0,.2)');
      if (l === 1) { R(sx + 5, sy - 7, 7, 7, '#d8d2c0'); R(sx + 4, sy - 8, 9, 1, '#f0ebde'); R(sx + 4, sy - 1, 9, 1, '#b5ad98'); R(sx + 10, sy - 7, 2, 7, '#b5ad98'); R(sx + 7, sy - 10, 3, 2, '#e2702a'); R(sx + 8, sy - 11, 1, 1, '#f5c04a'); }
      else { const w2 = l === 2 ? 12 : 16, h2 = l === 2 ? 10 : 13, x0 = sx + ((18 - w2) >> 1);
        R(x0, sy - h2, w2, h2, '#e8e2d2'); R(x0 + 2, sy - h2 + 3, w2 - 4, h2 - 3, '#3a2a1c'); R(x0, sy - h2 + 3, 2, h2 - 3, '#f8f4ea'); R(x0 + w2 - 2, sy - h2 + 3, 2, h2 - 3, '#c9c2ae'); if (l === 3) { R(x0 + 5, sy - h2 + 3, 2, h2 - 3, '#f8f4ea'); R(x0 + w2 - 7, sy - h2 + 3, 2, h2 - 3, '#d8d2c0'); }
        for (let q = 0; q < 4; q++) R(x0 - 1 + q * 2, sy - h2 - q, w2 + 2 - q * 4, 1, q === 0 ? '#d8d2c0' : '#efe9da'); R(x0 + (w2 >> 1) - 1, sy - h2 - 5, 2, 2, l === 3 ? '#e8b545' : '#d8d2c0');
        R(x0 + (w2 >> 1) - 1, sy - 5, 2, 5, '#d8d2c0'); R(x0 + (w2 >> 1) - 1, sy - 7, 2, 2, '#e2702a'); R(x0 - 1, sy - 1, w2 + 2, 1, '#b5ad98'); if (l === 3) { R(x0 - 3, sy - 3, 2, 3, '#5d7f3f'); R(x0 + w2 + 1, sy - 3, 2, 3, '#5d7f3f'); R(x0, sy - h2, w2, 1, '#e8b545'); } } } }
  // the stables across the street from the forum: a shed and a mule, then stalls and a cart, then a tiled range, a wagon and hay
  { const l = 0, sx = 402, sy = 185;      // the stables stand outside the east wall now, on the map of the province (province.js): nothing is drawn here
    if (l >= 1) { const w2 = 12 + l * 6; R(sx + 2, sy, w2 + 2, 2, 'rgba(0,0,0,.2)');
      R(sx, sy - 9, w2, 9, l >= 3 ? '#dccba0' : '#8a6a3a'); for (let q = 3; q < w2; q += 6) { R(sx + q, sy - 7, 4, 7, '#2a1c14'); R(sx + q, sy - 3, 4, 1, '#6b4f2c'); }
      if (l >= 3) tiles(sx - 1, sy - 14, w2 + 2, 5, '#a8482a'); else { R(sx - 1, sy - 12, w2 + 2, 3, '#9a7a42'); R(sx - 1, sy - 12, w2 + 2, 1, '#b8964e'); }
      R(sx + 4, sy - 5, 4, 2, '#8a6a4a'); R(sx + 7, sy - 6, 2, 2, '#8a6a4a');                                      // a mule looking out
      if (l >= 2) { const cx2 = sx + w2 + 3; R(cx2, sy - 5, 9, 4, '#8a6a3a'); R(cx2, sy - 6, 9, 1, '#a8834a'); R(cx2 + 1, sy - 2, 3, 3, '#3a2a1c'); R(cx2 + 6, sy - 2, 3, 3, '#3a2a1c'); R(cx2 + 9, sy - 4, 4, 1, '#6b4f2c'); if (l >= 3) { R(cx2, sy - 9, 9, 3, '#d9c27a'); R(cx2 + 1, sy - 10, 7, 1, '#e6d088'); } }
      if (l >= 3) { R(sx - 8, sy - 5, 6, 5, '#d9c070'); R(sx - 7, sy - 6, 4, 1, '#e6d088'); R(sx - 8, sy - 3, 6, 1, '#b89a4a'); } } }
  // the granary and garden beside your house: beds and a pig, then a round store, then a great one with more beds
  { const l = F.stores | 0, gx = 90, gy = 70;
    if (l >= 1) {
      for (let q = 0; q < (l >= 3 ? 3 : 2); q++) { R(gx, gy - 6 - q * 6, 8, 5, '#6b5028'); for (let k = 0; k < 3; k++) R(gx + 1 + k * 2, gy - 5 - q * 6, 2, 3, (q + k) % 2 ? '#6f9a3a' : '#8ab04a'); }
      R(gx + 10, gy - 5, 6, 1, '#7a5a2a'); R(gx + 10, gy - 1, 6, 1, '#7a5a2a'); R(gx + 10, gy - 5, 1, 5, '#7a5a2a'); R(gx + 15, gy - 5, 1, 5, '#7a5a2a'); R(gx + 11, gy - 3, 3, 2, '#e0a8a0'); R(gx + 14, gy - 3, 1, 1, '#c88880');
      if (l >= 2) { const gr = l >= 3 ? 5 : 4; ell(gx + 13, gy - 9, gr + 2, 2, 'rgba(0,0,0,.2)'); R(gx + 13 - gr, gy - 16, gr * 2, 7, '#d8c9a2'); R(gx + 13 + gr - 2, gy - 16, 2, 7, '#bcae88'); ell(gx + 13, gy - 17, gr + 1, 3, l >= 3 ? '#a8482a' : '#9a7a42'); ell(gx + 12, gy - 18, gr - 1, 2, l >= 3 ? '#c9684a' : '#b8964e'); R(gx + 12, gy - 13, 2, 4, '#3a2416'); }
      if (l >= 3) { R(gx + 3, gy - 22, 4, 4, '#d9c070'); R(gx + 3, gy - 22, 4, 1, '#e6d088'); R(gx + 3, gy - 20, 4, 1, '#b89a4a'); } } }
  // the town wall, all the way round, with its battlements
  const stone = '#b8ab94', top = '#d8cdb6', dark = '#8f846e';
  const AG = arenaGeom(), g0 = Math.round(AG.cx - 40), g1 = Math.round(AG.cx + 40);
  R(0, 0, g0, 3, stone); R(0, 3, g0, 1, dark); R(g1, 0, 590 - g1, 3, stone); R(g1, 3, 590 - g1, 1, dark); R(0, 186, 590, 4, stone); R(0, 186, 590, 1, top);
  R(0, 0, 3, 190, stone); R(3, 0, 1, 190, dark); R(586, 0, 4, 62, stone); R(586, 104, 4, 86, stone); R(585, 0, 1, 62, dark); R(585, 104, 1, 86, dark);
  for (let x = 1; x < 590; x += 6) { if (x < g0 - 2 || x > g1) R(x, 0, 3, 1, top); R(x, 189, 3, 1, dark); }
  for (const jx of [g0 - 9, g1 - 1]) { R(jx, 0, 10, 13, stone); R(jx, 0, 10, 1, top); R(jx, 0, 1, 13, top); R(jx + 9, 0, 1, 13, dark); R(jx, 12, 10, 1, dark); R(jx + 2, 3, 6, 6, dark); R(jx + 3, 4, 4, 4, '#a39a84'); for (let q = 0; q < 10; q += 3) R(jx + q, 0, 2, 1, '#f0e8d6'); R(jx + 4, 9, 2, 3, '#3a2e24'); }      // a tower where the town wall meets the arena on either side
  for (let y = 4; y < 190; y += 6) { R(0, y, 1, 3, top); if (y < 60 || y > 106) R(589, y, 1, 3, top); }
  // a tower at each corner of the wall
  for (const [wx0, wy0] of [[0, 0], [580, 0], [0, 180], [580, 180]]) {
    R(wx0, wy0, 10, 10, stone); R(wx0, wy0, 10, 1, top); R(wx0, wy0, 1, 10, top); R(wx0 + 9, wy0, 1, 10, dark); R(wx0, wy0 + 9, 10, 1, dark);
    R(wx0 + 2, wy0 + 2, 6, 6, dark); R(wx0 + 3, wy0 + 3, 4, 4, '#a39a84'); for (let q = 0; q < 10; q += 3) { R(wx0 + q, wy0, 2, 1, '#f0e8d6'); R(wx0 + q, wy0 + 9, 2, 1, '#f0e8d6'); }
  }
  // trees: a round crown, lit from the upper left, over its own shadow
  VIL_TREES.forEach(([tx, ty], i) => {
    const kind = (i * 7 + 3) % 5;
    ell(tx + 2, ty + 1, kind === 2 ? 5 : 8, 3, 'rgba(0,0,0,.22)'); ell(tx + 1, ty + 1, kind === 2 ? 4 : 6, 2, 'rgba(0,0,0,.14)');
    if (kind === 2) {                            // a cypress: tall and dark
      R(tx - 1, ty - 3, 2, 4, '#4a3320'); ell(tx, ty - 11, 3, 9, '#2f5234'); ell(tx - 1, ty - 12, 2, 7, '#3f6844'); R(tx - 1, ty - 19, 1, 3, '#57806a'); R(tx + 2, ty - 10, 1, 6, '#213a26');
    } else {
      const r = 6 + (i % 3), dk = kind === 3 ? '#4c7f38' : kind === 4 ? '#4a6a2a' : '#3f6a2c', lt = kind === 3 ? '#69a04a' : kind === 4 ? '#7a9a3a' : '#57863a';
      R(tx - 1, ty - 4, 2, 5, '#5a3c20'); R(tx - 1, ty - 4, 1, 5, '#7a5630');
      ell(tx, ty - 3 - r, r, r - 1, dk); ell(tx + 2, ty - 2 - r, r - 2, r - 3, shade(dk, 0.86)); ell(tx - 1, ty - 4 - r, r - 2, r - 2, lt); ell(tx - 2, ty - 5 - r, Math.max(2, r - 4), Math.max(1, r - 5), shade(lt, 1.18));
      if (kind === 3) for (let q = 0; q < 6; q++) R(tx - r + 2 + rnd(i * 9 + q, r * 2 - 4), ty - 2 - r * 2 + 2 + rnd(i * 5 + q + 40, r * 1.4), 1, 1, q % 2 ? '#f8e0e8' : '#ffffff');      // in blossom
      else if (kind === 4) for (let q = 0; q < 4; q++) R(tx - r + 2 + rnd(i * 9 + q, r * 2 - 4), ty - 2 - r * 2 + 3 + rnd(i * 5 + q + 40, r * 1.3), 1, 1, q % 2 ? '#e8902a' : '#d8382a');   // in fruit
    }
  });
  return (vil.layer = cv);
}

function drawVillage(cv, T) {
  const dt = Math.min(0.25, Math.max(0, T - (vil.prev || T))); vil.prev = T;      // a slow frame still moves him its full distance
  const modal = document.getElementById('modal'), frozen = (modal && !modal.hidden) || !!G.ruin;
  if (frozen) villageStill();
  villageStep(dt, frozen || !!G.field);            // while the school is out in the province the same keys walk the column there, not him here

  const ctx = cv.getContext('2d');
  VILLAGE.S = cv.width / VILLAGE.W;           // a whole number, chosen for the screen (see fitScenes in main.js); the still layer is redrawn to match
  ctx.setTransform(VILLAGE.S, 0, 0, VILLAGE.S, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(villageLayer(), 0, 0, VILLAGE.W, VILLAGE.H);
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  // the same hour and the same weather as over the school next door
  const sky = typeof yardSky === 'function' ? yardSky(T) : { night: 0, tint: '#ffffff' }, wx = typeof yardWeather === 'function' ? yardWeather(T) : { rain: 0, gust: 0, wet: 0, over: 0 };
  const night = sky.night, dark = night > 0.6, games = typeof isGamesDay === 'function' && isGamesDay();
  if (typeof SFX !== 'undefined') { SFX.ambience(wx.rain, night); SFX.mood({ night: night > 0.6 }); }            // rain on the roofs, crickets after dark
  if (wx.wet > 0) { R(0, 0, 590, 190, `rgba(40,45,60,${(0.13 * wx.wet).toFixed(3)})`); for (let i = 0; i < 9; i++) { const px = (i * 67 + 20) % 560, py = i % 2 ? 80 + (i * 3) % 8 : 156 + (i * 5) % 8, w = Math.round((8 + (i % 3) * 4) * wx.wet); if (w > 3) { R(px, py, w, 2, 'rgba(160,190,215,.55)'); R(px + 1, py + 2, w - 2, 1, 'rgba(160,190,215,.4)'); } } }

  // the pond: two ducks about their business, and a ring where one has just dabbled
  for (let i = 0; i < 2; i++) {
    const a = T * 0.22 + i * 3.3, dx = 381 + Math.cos(a) * (9 - i * 3), dy = 177 + Math.sin(a) * 2.5, fwd = -Math.sin(a) > 0 ? 1 : -1, still = night > 0.6;
    const px = still ? 372 + i * 6 : dx, py = still ? 177 : dy;
    R(px - 2, py - 1, 4, 2, i ? '#8a6a4a' : '#f1ead8'); R(px + (fwd > 0 ? 2 : -3), py - 2, 2, 2, i ? '#3f6a4a' : '#f1ead8'); R(px + (fwd > 0 ? 4 : -4), py - 1, 1, 1, '#e3b04a');
    if (!still) { ctx.globalAlpha = 0.5; R(px - fwd * 4, py, 2, 1, '#bfe0f4'); R(px - fwd * 6, py + 1, 2, 1, '#bfe0f4'); ctx.globalAlpha = 1; }
  }
  { const q = (T * 0.25) % 1; ctx.globalAlpha = 0.6 * (1 - q); R(388 - q * 4, 178, 2 + Math.round(q * 8), 1, '#d6ecf8'); ctx.globalAlpha = 1; }
  // what you have built, alive: the flame on your shrine, steam off the bath, the school's flag
  { const F2 = G.fac || {}, lu = placeOf('ludus');
    if ((F2.shrine | 0) >= 1) { const fl2 = Math.sin(T * 11) > 0 ? 1 : 0; R(474, 61 - fl2 - ((F2.shrine | 0) > 1 ? 2 : -1), 2, 2 + fl2, '#f5c04a'); if (night > 0.3) sceneGlow(ctx, 475, 62, 10, '255,170,80', 0.3 * Math.min(1, (night - 0.3) * 2.5)); }
    if ((F2.baths | 0) >= 2 && night < 0.7) for (let q = 0; q < 2; q++) { const p2 = (T * 0.3 + q / 2) % 1; ctx.globalAlpha = 0.4 * (1 - p2); R(lu.x + lu.w - 26 + q * 4 + Math.sin(p2 * 5) * 2, lu.y + 20 - p2 * 9, 3, 2, '#eef6f8'); } ctx.globalAlpha = 1;
  }
  // what moves on the buildings: water, smoke, the forge fire, flags
  for (let i = 0; i < 4; i++) { const a = T * 2 + i * 1.6; R(296 + Math.cos(a) * 5, 118 + Math.sin(a) * 3, 2, 1, '#d6ecf8'); }
  R(295, 109 - Math.abs(Math.sin(T * 3)) * 2, 2, 3, '#bfe0f4');
  const f = placeOf('smith'), glow = 0.55 + 0.45 * Math.sin(T * 7);
  R(f.dx - 5, f.y + 38, 10, 7, `rgba(255,${Math.round(120 + 70 * glow)},40,${(0.55 + 0.3 * glow).toFixed(2)})`); R(f.dx - 2, f.y + 41, 4, 3, '#ffe9a0');
  for (let i = 0; i < 4; i++) { const p = (T * 0.35 + i * 0.25) % 1; ctx.globalAlpha = 0.5 * (1 - p); R(f.x + f.w - 14 + Math.sin(p * 5 + i) * 3, f.y + 4 - p * 16, 4 + Math.round(p * 3), 3, '#d8d4cc'); }
  ctx.globalAlpha = 1;
  const a = placeOf('arena'), acx = a.x + a.w / 2;

  const lost = (G.fallen || []).some(x => G.day - x.day <= 2), fest = G.festival && G.festival.day >= G.day && G.festival.day - G.day <= 3;
  if (lost) { const lu = placeOf('ludus'); R(lu.dx + 20, lu.y - 6, 1, 12, '#3a2a1c'); R(lu.dx + 21, lu.y - 6 + (Math.sin(T * 3) > 0 ? 0 : 1), 6, 4, '#16110e'); R(lu.dx + 21, lu.y - 2, 4, 2, '#16110e'); }
  if (fest) for (let i = 0; i <= 14; i++) {             // a festival is near: garlands over the square
    const bx = 257 + i * 6, by = 88 + Math.round(Math.sin(i / 14 * Math.PI) * 4);
    R(bx, by, 6, 1, '#4a6a2a'); R(bx + 2, by + 1, 2, 2, ['#e3b04a', '#c23b2e', '#f1ead8'][i % 3]);
  }
  if (games) {                                  // games today: bunting over the arena gate
    for (let i = 0; i < 13; i++) { const bx = acx - 36 + i * 6, by = a.y + a.h - 17 + Math.round(Math.sin(i / 12 * Math.PI) * 3); R(bx, by, 6, 1, '#3a2a1c'); R(bx + 1, by + 1, 4, 2 + (Math.sin(T * 5 + i) > 0 ? 1 : 0), ['#c23b2e', '#e3b04a', '#2f6db8'][i % 3]); }
  }
  for (const [key, ox] of [['rivals', 12], ['facilities', 62], ['chronicle', 8]]) {          // hearth smoke
    const pl = placeOf(key);
    R(pl.x + ox, pl.y - 3, 4, 5, '#8f8a84'); R(pl.x + ox, pl.y - 3, 4, 1, '#b5b0a8');
    for (let i = 0; i < 3; i++) { const q = (T * 0.3 + i / 3 + ox) % 1; ctx.globalAlpha = 0.45 * (1 - q); R(pl.x + ox + Math.sin(q * 5 + i) * 2 + q * (4 + wx.gust * 20), pl.y - 5 - q * 14, 3 + Math.round(q * 3), 2 + Math.round(q * 2), '#d8d4cc'); }
    ctx.globalAlpha = 1;
  }
  if (vil.path && vil.path.length) {             // the way he has been sent, dotted
    for (let i = 1; i < vil.path.length; i += 2) R(vil.path[i].x - 1, vil.path[i].y - 1, 2, 2, 'rgba(245,213,132,.8)');
    const e = vil.path[vil.path.length - 1]; ctx.globalAlpha = 0.5 + 0.4 * Math.sin(T * 6); R(e.x - 4, e.y - 1, 9, 2, '#f5d584'); ctx.globalAlpha = 1;
  }
  for (const q of vil.puffs) { ctx.globalAlpha = 0.5 * (1 - q.t / 0.5); R(q.x - 1, q.y - 1 - q.t * 6, 3, 2, '#e2cf9c'); }
  ctx.globalAlpha = 1;

  // the east gate: barred until the school has fought its first games
  const open = typeof gateOpen === 'function' && gateOpen();
  R(572, 62, 18, 12, '#b8ab94'); R(572, 92, 18, 12, '#b8ab94'); R(572, 62, 18, 2, '#d8cdb6'); R(572, 92, 18, 2, '#d8cdb6'); R(572, 72, 18, 2, '#8f846e'); R(572, 102, 18, 2, '#8f846e');
  for (let i = 572; i < 590; i += 4) { R(i, 60, 2, 2, '#d8cdb6'); R(i, 90, 2, 2, '#d8cdb6'); }
  R(576, 74, 12, 2, '#8f846e'); R(576, 90, 12, 2, '#6f6654');
  if (!open) { R(578, 76, 9, 14, '#5a3c20'); R(578, 76, 9, 1, '#7a5632'); R(582, 76, 1, 14, '#3a2416'); R(578, 82, 9, 2, '#3a2a1c'); }
  R(585, 54, 1, 8, '#5a4326'); R(586, 54 + (Math.sin(T * 4) > 0 ? 0 : 1), 4, 3, '#a02d22');
  if (ui.wayTo === 'gate') { const ay = 56 + Math.round(Math.sin(T * 6) * 2); R(579, ay, 3, 6, '#f5d584'); R(577, ay + 6, 7, 1, '#f5d584'); R(578, ay + 7, 5, 1, '#f5d584'); R(579, ay + 8, 3, 1, '#f5d584'); }
  // the doorstep of the screen now open, and of wherever the steward is sending you
  const cur = PLACES.find(p => p.key === ui.tab);
  if (cur) { ctx.globalAlpha = 0.5 + 0.3 * Math.sin(T * 4); R(cur.dx - 6, cur.dy - 4, 12, 5, '#f5d584'); ctx.globalAlpha = 1; }

  // people, the nearer drawn over the farther. By night most of the town is indoors.
  const folk = vil.npcs.filter((n, i) => !dark || i < 2).map(n => ({ y: n.y, draw: () => vilPerson(ctx, n.x, n.y, n) }));
  const still = (x, y, o) => folk.push({ y, draw: () => vilPerson(ctx, x, y, Object.assign({ face: 'down', walk: 0, moving: false }, o)) });
  const notes = [];                    // marks over the heads of people who are waiting for you: [x, y, colour]
  if (!dark) {                                   // a carter and his mule, coming along the upper street to the gate, every so often
    const cx = ((T * 13) % 900) - 60, cy = 85;
    if (cx > 8 && cx < 560) folk.push({ y: cy, draw: () => {
      const st = Math.sin(T * 9) > 0 ? 1 : 0;
      R(cx - 14, cy + 1, 30, 2, 'rgba(0,0,0,.2)');
      R(cx - 14, cy - 7, 13, 5, '#8a6a3a'); R(cx - 14, cy - 8, 13, 1, '#a8834a'); R(cx - 12, cy - 11, 9, 3, '#d9c27a'); R(cx - 12, cy - 12, 9, 1, '#e6d088');      // the cart and its load
      R(cx - 11, cy - 3, 5, 5, '#3a2a1c'); R(cx - 10, cy - 2, 3, 3, '#6b4f2c'); R(cx - 9 + st, cy - 1, 1, 1, '#3a2a1c');                                   // a wheel, turning
      R(cx - 1, cy - 5, 4, 1, '#5a4326');                                                                                                            // the shaft
      R(cx + 3, cy - 8, 10, 5, '#7a5e48'); R(cx + 3, cy - 8, 10, 1, '#94765c'); R(cx + 12, cy - 11, 4, 5, '#7a5e48'); R(cx + 12, cy - 13, 1, 3, '#5e4636'); R(cx + 15, cy - 9, 1, 1, '#1c1310');      // the mule
      R(cx + 4 + st, cy - 3, 1, 4, '#5e4636'); R(cx + 7 - st, cy - 3, 1, 4, '#5e4636'); R(cx + 10 + st, cy - 3, 1, 4, '#5e4636'); R(cx + 2, cy - 7, 1, 3, '#5e4636');
      R(cx - 6, cy - 14, 3, 3, '#d9a57c'); R(cx - 7, cy - 11, 4, 4, '#4a6a8a'); R(cx - 6, cy - 15, 3, 1, '#c9a763');                                      // the carter, in a straw hat
    } });
  }
  // two men on the gate, with spears
  // whoever has come to the fountain with something to ask of the school: they stand and wait, with a gold mark over them
  if (typeof fountainFolk === 'function') fountainFolk().forEach(({ q, owed }, i) => { const Gv = GIVERS[q.giver.kind], gx = [276, 316, 296][i], gy = [138, 140, 146][i]; folk.push({ y: gy, draw: () => { vilPerson(ctx, gx, gy, { face: i === 1 ? 'left' : 'right', walk: 0, moving: false, tunic: Gv.tunic, hair: Gv.hair, skin: Gv.skin }); if (owed) { R(gx + (i === 1 ? -6 : 4), gy - 12, 3, 4, '#8a6a3a'); R(gx + (i === 1 ? -6 : 4), gy - 12, 3, 1, '#e8b545'); } } }); notes.push([gx, gy - 22, owed ? '#7fb85a' : '#e8b545']); });      // green over one who has come to pay, gold over one who has come to ask
  for (const gy of [72, 106]) folk.push({ y: gy, draw: () => { vilPerson(ctx, 568, gy, { face: 'left', walk: 0, moving: false, tunic: '#a02d22', hair: '#b4bec8', skin: '#d9a57c' }); R(563, gy - 20, 1, 20, '#5a4326'); R(562, gy - 22, 3, 3, '#c9d1d9'); } });
  if (!dark) {
    const m = placeOf('market'), tp = placeOf('patrons');
    [[16, '#b93a2e'], [49, '#2f6db8'], [82, '#c9a21e']].forEach(([ox, c], i) => still(m.x + ox, m.y + 30 + (Math.sin(T * 1.5 + i * 2) > 0.6 ? -1 : 0), { tunic: c, hair: '#2a1c14', skin: i % 2 ? '#c9966c' : '#d9a57c' }));      // the stallholders
    still(tp.dx + 15 + Math.round(Math.sin(T * 0.25) * 4), tp.y + tp.h + 3, { tunic: '#f1ead8', hair: '#c9c2b2', skin: '#d9a57c', face: Math.sin(T * 0.25 + 1.5) > 0 ? 'right' : 'left', moving: true, walk: T * 3 });     // a priest on the temple steps
    // the town knows how your house stands, and shows it at the doors
    const hh = placeOf('facilities'), forum = placeOf('contracts'), tv = placeOf('rivals');
    if (G.denarii < 0) {                                                  // creditors at your own door
      still(hh.dx - 10, hh.dy + 3, { tunic: '#3a3a44', hair: '#2a1c14', face: 'up' }); still(hh.dx + 9, hh.dy + 4, { tunic: '#4a3a3a', hair: '#8a8a8a', face: 'up' });
      notes.push([hh.dx, hh.dy - 19, '#c23b2e']);
    }
    const asked = (G.contracts || []).find(c => c.asked);
    if (asked) {                                                          // a patron's man waiting at the forum with a message for you
      still(forum.dx + 13, forum.dy + 2, { tunic: asked.patron === 'temple' ? '#f1ead8' : asked.patron === 'guild' ? '#c9a21e' : '#7a2a8a', hair: '#2a1c14' });
      notes.push([forum.dx + 13, forum.dy - 20, '#e3b04a']);
    }
    const call = (G.bouts || []).find(b => b.grudge && !b.done);
    if (call) {                                                           // a rival's champion at the arena gate, calling you out
      const hd = call.houseId && typeof houseDef === 'function' ? houseDef(call.houseId) : null;
      still(a.dx - 24, a.dy + 6, { tunic: hd ? hd.col : '#55555a', hair: '#2a1c14', face: 'right' }); R(a.dx - 20, a.dy - 12, 1, 18, '#5a4326'); R(a.dx - 21, a.dy - 14, 3, 3, '#c9d1d9');
      notes.push([a.dx - 24, a.dy - 16, '#c23b2e']);
    }
    if (games) (G.market || []).slice(0, 4).forEach((g, i) => {           // games day: the dealer's new men, roped in a line by the stalls
      const x = m.x + m.w + 5 + i * 6, y = m.dy - 3 + (i % 2);
      still(x, y, { tunic: '#b8a888', hair: g.look ? g.look.hair : '#2a1c14', skin: g.look ? g.look.skin : '#c9966c', face: 'left' });
      if (i) folk.push({ y: y + 0.1, draw: () => R(x - 6, y - 9, 6, 1, '#6b5334') });
    });
    if (!G.field) G.roster.filter(g => !g.away && g.injury <= 0 && g.activity === 'rest').slice(0, 3).forEach((g, i) =>      // your own men at liberty, outside the tavern
      still(tv.dx - 17 - i * 7, tv.dy + 3 + (i % 2) * 3, { tunic: '#c23b2e', hair: g.look.hair, skin: g.look.skin, face: i % 2 ? 'right' : 'left' }));
    // children chasing each other round the fountain, and the dog that goes with them
    for (let i = 0; i < 2; i++) { const an = T * 1.3 + i * 0.8, cx = 296 + Math.cos(an) * 24, cy = 124 + Math.sin(an) * 14; folk.push({ y: cy, draw: () => vilChild(ctx, cx, cy, Math.sin(an) > 0 ? 'left' : 'right', T * 16 + i, i ? '#b06a8a' : '#5a8a9a') }); }
    { const an = T * 1.3 - 0.55, dx = 296 + Math.cos(an) * 26, dy = 125 + Math.sin(an) * 15, lf = Math.sin(an) > 0; folk.push({ y: dy, draw: () => { R(dx - 3, dy - 3, 6, 3, '#8a6a4a'); R(dx + (lf ? -5 : 3), dy - 5, 3, 3, '#8a6a4a'); R(dx - 3, dy, 1, 1 + (Math.sin(T * 18) > 0 ? 1 : 0), '#6a4a2a'); R(dx + 2, dy, 1, 1 + (Math.sin(T * 18) > 0 ? 0 : 1), '#6a4a2a'); R(dx + (lf ? 3 : -4), dy - 4, 1, 2, '#8a6a4a'); } }); }
    // a queue at the arena on games days
    if (games) for (let i = 0; i < 6; i++) still(a.dx + (i % 2 ? 1 : -1) * (12 + Math.floor(i / 2) * 8), a.dy + 4 + (i % 3), { tunic: ['#8a4a3a', '#4a6a8a', '#7a7a3a', '#6a4a7a', '#a8763a', '#3f7a5a'][i], hair: '#2a1c14', face: i % 2 ? 'left' : 'right', skin: i % 2 ? '#c9966c' : '#e3b48f' });
    // pigeons in the square: pecking, or up and away
    for (let i = 0; i < 7; i++) {
      const hx = 268 + (i * 37) % 56, hy = 134 + (i * 23) % 12;
      if (vil.flock > 0) { const q = 1 - vil.flock / 2.6, fx = hx + (i % 2 ? 1 : -1) * q * (30 + i * 6), fy = hy - q * (50 + i * 5), fl = Math.sin(T * 22 + i) > 0 ? 1 : 0; ctx.globalAlpha = 1 - q * 0.8; R(fx - 2, fy - fl, 2, 1, '#c9d1d9'); R(fx + 1, fy - fl, 2, 1, '#c9d1d9'); R(fx, fy, 1, 1, '#8f97a0'); ctx.globalAlpha = 1; }
      else { const peck = Math.sin(T * 5 + i * 1.7) > 0.5 ? 1 : 0; R(hx, hy - 2, 3, 2, i % 3 ? '#8f97a0' : '#c9d1d9'); R(hx + 2, hy - 3 + peck, 1, 1, '#6f7780'); }
    }
  }
  folk.push({ y: vil.y, draw: () => vilPerson(ctx, vil.x, vil.y, { face: vil.face, walk: vil.walk, moving: vil.moving, tunic: '#f1ead8', stripe: '#7a2a8a', hair: '#4a3320', laurel: true }) });
  folk.sort((p, q) => p.y - q.y).forEach(p => p.draw());
  // two who have stopped near each other have something to say
  for (let i = 0; i < vil.npcs.length; i++) for (let j = i + 1; j < vil.npcs.length; j++) {
    const p = vil.npcs[i], q = vil.npcs[j];
    if (dark || p.path || q.path || Math.hypot(p.x - q.x, p.y - q.y) > 18) continue;
    const who = Math.floor(T / 1.4) % 2 ? p : q, n = 1 + Math.floor(T * 3) % 3;
    R(who.x - 4, who.y - 24, 9, 6, '#f4ecd8'); R(who.x - 1, who.y - 18, 2, 2, '#f4ecd8'); for (let k = 0; k < n; k++) R(who.x - 3 + k * 3, who.y - 22, 1, 2, '#3a2a1c');
  }
  for (const [nx, ny, nc] of notes) {                                    // someone here wants a word
    const nb = Math.round(Math.sin(T * 6) * 1.5);
    R(nx - 3, ny - 5 + nb, 7, 9, '#1a110c'); R(nx - 2, ny - 4 + nb, 5, 7, nc); R(nx, ny - 3 + nb, 1, 3, '#fff6e0'); R(nx, ny + 1 + nb, 1, 1, '#fff6e0');
  }
  const bob = Math.round(Math.sin(T * 5));                              // a mark over your own head, so you can find him
  R(vil.x - 2, vil.y - 21 + bob, 5, 1, '#f5d584'); R(vil.x - 1, vil.y - 20 + bob, 3, 1, '#f5d584'); R(vil.x, vil.y - 19 + bob, 1, 1, '#f5d584');

  // small life: butterflies by day, a leaf coming down from a tree, sparrows on the roofs, light on the water, rings where rain falls
  if (night < 0.4 && wx.rain < 0.2) for (let i = 0; i < 6; i++) {
    const bx = 30 + ((i * 97) % 530) + Math.sin(T * 0.5 + i * 2) * 18 + Math.sin(T * 2.3 + i) * 3, by = [18, 44, 100, 132, 176, 120][i] + Math.cos(T * 0.4 + i) * 6 + Math.sin(T * 3.1 + i) * 2, open = Math.sin(T * 14 + i) > 0, c = ['#f4f4f0', '#f2d060', '#e8a0c0', '#a8c0f0'][i % 4];
    R(bx, by, 1, 1, '#2a1c14'); if (open) { R(bx - 1, by - 1, 1, 2, c); R(bx + 1, by - 1, 1, 2, c); } else R(bx, by - 1, 1, 1, c);
  }
  VIL_TREES.forEach(([tx, ty], i) => { const p2 = (T * 0.11 + i * 0.37) % (1.6 - wx.gust); if (p2 < 1 && (i % 3 === 0 || wx.gust > 0.3)) R(tx - 4 + Math.sin(p2 * 8 + i) * 4 + wx.gust * p2 * 20, ty - 12 + p2 * 13, Math.sin(p2 * 18) > 0 ? 2 : 1, 1, i % 2 ? '#8ab04a' : '#b8a040'); });
  if (night < 0.5 && wx.rain < 0.3) PLACES.forEach((p, i) => {
    if (p.kind === 'arena' || p.kind === 'market') return;
    for (let q = 0; q < 2; q++) { const cyc = (T * 0.07 + i * 0.31 + q * 0.5) % 1, away = cyc > 0.86, sx = p.x + 6 + ((i * 13 + q * 23 + Math.floor(T * 0.07 + i * 0.31 + q * 0.5) * 7) % Math.max(4, p.w - 12)), sy = p.y + 3 + q * 3, hop = Math.sin(T * 6 + i + q) > 0.7 ? 1 : 0;
      if (away) { const k = (cyc - 0.86) / 0.14; R(sx + k * 30, sy - k * 16, 2, 1, '#5a4a3a'); R(sx + k * 30 - 1, sy - k * 16 - (Math.sin(T * 20) > 0 ? 1 : 0), 1, 1, '#5a4a3a'); }
      else { R(sx, sy - hop, 2, 2, '#6a5a48'); R(sx + (q ? 2 : -1), sy - hop, 1, 1, '#4a3a2c'); R(sx, sy + 1 - hop, 1, 1, '#c8b898'); } }
  });
  for (let i = 0; i < 4; i++) if (Math.sin(T * 2.6 + i * 1.9) > 0.75) R(372 + i * 6, 176 + (i % 2) * 2, 1, 1, '#ffffff');      // the sun on the pond
  if (wx.rain > 0.05) for (let i = 0, n = Math.round(26 * wx.rain); i < n; i++) { const k = Math.floor(T * 8) + i * 17, sx = (k * 73) % 580 + 4, sy = (i % 2 ? 76 : 154) + (k * 29) % 14, rp = (T * 8) % 1; ctx.globalAlpha = 0.6 * (1 - rp); R(sx - rp * 2, sy, 2 + Math.round(rp * 4), 1, '#d6ecf8'); ctx.globalAlpha = 1; }
  // PASS 27. the shadows lengthen and swing with the sun: laid over the ones painted on the map
  if (typeof sceneLow !== 'undefined' && night < 0.6) {
    const low = sky.sun ? clamp((sky.shadow.len - 2) / 12, 0, 1) : 0, dir = sky.sun && sky.sun[0] > 295 ? -1 : 1, len = Math.round(low * 14);
    if (len > 1) { ctx.fillStyle = `rgba(20,14,6,${(0.1 + low * 0.08).toFixed(3)})`; for (const p of PLACES) { if (p.kind === 'arena') continue; ctx.beginPath(); ctx.moveTo(p.x, p.y + p.h); ctx.lineTo(p.x + p.w, p.y + p.h); ctx.lineTo(p.x + p.w + dir * len, p.y + p.h + 4 + (len >> 2)); ctx.lineTo(p.x + dir * len, p.y + p.h + 4 + (len >> 2)); ctx.closePath(); ctx.fill(); }
      for (const [tx, ty] of VIL_TREES) { ctx.beginPath(); ctx.moveTo(tx - 2, ty); ctx.lineTo(tx + 2, ty); ctx.lineTo(tx + dir * (len + 6) + 5, ty + 3); ctx.lineTo(tx + dir * (len + 6) - 5, ty + 3); ctx.closePath(); ctx.fill(); } }
  }
  // PASS 28. leaves turning in the light on every tree
  if (night < 0.6) VIL_TREES.forEach(([tx, ty], i) => { for (let q = 0; q < 2; q++) { const a = T * (1.1 + wx.gust * 3) + i * 1.7 + q * 2.4; if (Math.sin(a * 1.3) > 0.2) R(tx - 3 + Math.cos(a) * 3, ty - 10 + Math.sin(a * 0.7) * 3, 1, 1, 'rgba(200,236,150,.75)'); } });
  // The arena, alive. On a games day every seat is taken and the crowd rises in a wave that runs round the rings;
  // two men fight on the sand, the magistrate is in his box, and the awning stirs. On other days two men rake the
  // sand. At night torches burn round the rim. Its shadow swings out to one side as the sun gets low.
  { const { p: ar, cx, cy, RX, RY } = arenaGeom(), on = (a2, rr) => [cx + Math.cos(a2) * RX * rr, cy + Math.sin(a2) * RY * rr], hsh = (a2, b2) => { const v = Math.sin(a2 * 127.1 + b2 * 311.7) * 43758.5; return v - Math.floor(v); };
    if (night < 0.6) {
      const low = sky.sun ? clamp((sky.shadow.len - 2) / 12, 0, 1) : 0, dir = sky.sun && sky.sun[0] > 295 ? -1 : 1, len = Math.round(low * 16);
      if (len > 1) { ctx.fillStyle = `rgba(20,14,6,${(0.1 + low * 0.08).toFixed(3)})`; for (let yy = -RY + 6; yy <= RY + 5; yy += 1) { const hw = Math.round(RX * Math.sqrt(Math.max(0, 1 - ((yy - 4) * (yy - 4)) / ((RY + 1) * (RY + 1))))); if (hw > 0) ctx.fillRect(dir > 0 ? cx + hw : cx - hw - len, cy + yy, len, 1); } }
    }
    if (games) {
      for (let k = 0; k < 7; k++) { const rr = 0.61 + k * 0.047, n = 62 + k * 12;
        for (let q = 0; q < n; q++) { const a2 = q / n * 6.283 + k * 0.07; if (hsh(q, k) > 0.88) continue;
          if (rr > 0.72 && a2 > Math.PI + 0.2 && a2 < Math.PI + 0.2 + 9 * 0.305 && ((a2 - Math.PI - 0.2) % 0.305) < 0.24) continue;      // not through the awning
          const [sx, sy] = on(a2, rr), wave = Math.sin(a2 * 2 - T * 2.2) > 0.9, cheer = hsh(q + Math.floor(T * 3), k) > 0.93;
          R(sx, sy - (wave || cheer ? 1 : 0), 1, 1 + (wave ? 1 : 0), ['#c23b2e', '#3a6ea8', '#f1ead8', '#e8b545', '#7a5a8a', '#3f7a5a'][Math.floor(hsh(q + 7, k + 3) * 6)]); if (wave) R(sx, sy - 2, 1, 1, '#d9a57c'); } }
      // the bout: they circle, close, and break
      const ph = (T * 0.35) % 1, close = ph > 0.55 && ph < 0.8, an = T * 0.5, gap = close ? 3 : 8 + Math.sin(T * 1.3) * 2, ax = cx + Math.cos(an) * 8, ay = cy + Math.sin(an) * 3;
      for (const s2 of [-1, 1]) { const fx = Math.round(ax + s2 * gap * 0.5), fy = Math.round(ay); R(fx - 1, fy + 1, 4, 1, 'rgba(0,0,0,.25)'); R(fx, fy - 4, 2, 1, '#d9a57c'); R(fx, fy - 3, 2, 3, s2 < 0 ? '#a8261c' : '#2f5a8a'); R(fx + (s2 < 0 ? 2 : -1), fy - 3 - (close && Math.sin(T * 14) > 0 ? 1 : 0), 1, 2, '#d8dce0'); R(fx + (s2 < 0 ? -1 : 2), fy - 3, 1, 3, s2 < 0 ? '#c9a21e' : '#8a8478'); }
      if (close && Math.sin(T * 14) > 0.3) { R(Math.round(ax), Math.round(ay) - 4, 1, 1, '#fff0b0'); R(Math.round(ax) + (Math.sin(T * 30) > 0 ? 1 : -1), Math.round(ay) - 5, 1, 1, '#f5c04a'); }
      for (let q = 0; q < 3; q++) { const p2 = (T * 0.8 + q / 3) % 1; ctx.globalAlpha = 0.4 * (1 - p2); R(ax - 4 + q * 4 + Math.sin(p2 * 5 + q) * 2, ay + 1 - p2 * 3, 2, 1, '#f0dcaa'); } ctx.globalAlpha = 1;
      { const by = Math.round(cy - RY * 0.8); R(cx - 1, by + 1 - (close ? 1 : 0), 2, 1, '#d9a57c'); R(cx - 1, by + 2 - (close ? 1 : 0), 2, 3, '#f1ead8'); R(cx - 5, by + 2, 1, 3, '#c9a21e'); R(cx + 4, by + 2, 1, 3, '#c9a21e'); }
    } else if (night < 0.5) {
      for (let q = 0; q < 2; q++) { const a2 = T * 0.2 + q * 3.1, px = cx + Math.cos(a2) * RX * 0.34, py = cy + Math.sin(a2) * RY * 0.24; R(px, py - 4, 2, 1, '#d9a57c'); R(px, py - 3, 2, 3, '#8a6a4a'); R(px + (Math.cos(a2) > 0 ? 2 : -3), py - 1, 3, 1, '#6b4f2c'); R(px - Math.cos(a2) * 5, py, 4, 1, 'rgba(240,220,170,.6)'); }
    }
    for (let q = 0; q < 9; q++) { const a0 = Math.PI + 0.2 + q * 0.305 + 0.12, [ux, uy] = on(a0, 0.85); if (Math.sin(T * (1.4 + wx.gust * 3) + q * 1.1) > 0.3) R(ux - 3, uy, 6, 1, 'rgba(255,250,235,.5)'); }
    for (const q of [2, 6, 10, 15, 19, 23]) { const [mx, my] = on(q / 26 * 6.283 + 0.12, 0.99), wv = Math.sin(T * 5 + q) > 0 ? 1 : 0; R(mx + 1, my - 6 + wv, 4, 2, games ? '#c23b2e' : '#c9a21e'); R(mx + 4, my - 5 - wv + 1, 1, 1, games ? '#a02d22' : '#a8851a'); }
    if (night > 0.3) {
      const la2 = Math.min(1, (night - 0.3) * 2.5), fl2 = Math.sin(T * 11) > 0 ? 1 : 0;
      for (let q = 0; q < 14; q++) { const [tx2, ty2] = on(q / 14 * 6.283 + 0.3, 0.99); ctx.globalAlpha = la2; R(tx2, ty2 - 5 - fl2, 1, 2 + fl2, '#f5c04a'); ctx.globalAlpha = 1; sceneGlow(ctx, tx2, ty2 - 4, 8, '255,170,80', 0.28 * la2); }
      for (const gx of [-11, 11]) { ctx.globalAlpha = la2; R(cx + gx, ar.y + ar.h - 13 - fl2, 1, 2 + fl2, '#f5c04a'); ctx.globalAlpha = 1; sceneGlow(ctx, cx + gx, ar.y + ar.h - 11, 10, '255,170,80', 0.32 * la2); }
      sceneGlow(ctx, cx, cy, 40, '255,190,110', (games ? 0.16 : 0.05) * la2);
    }
  }
  // PASS 30. men on the north wall, walking their beat, and a flag on each of the lower towers
  for (let i = 0; i < 2; i++) { const u = (T * 0.012 + i * 0.5) % 2, f = u < 1 ? u : 2 - u, gx = 30 + f * 520 * (i ? 1 : 0.5) + (i ? 0 : 260 * 0); R(gx, 0, 1, 1, '#d9a57c'); R(gx, 1, 1, 2, '#a8261c'); R(gx + 1, 0, 1, 3, '#c1c7cc'); }
  for (const tx of [4, 584]) { const wv = Math.sin(T * 5 + tx) > 0 ? 1 : 0; R(tx, 172, 1, 9, '#5a4326'); R(tx + (tx < 295 ? 1 : -4), 172 + wv, 4, 3, '#a02d22'); }
  // the shadows of clouds going over the town, and now and then a flight of birds
  for (let i = 0; i < 3; i++) {
    const cx = ((i * 263 + T * 9) % 900) - 150, cy = 30 + i * 62, rx = 60 + i * 14, ry = 16 + i * 4;
    ctx.fillStyle = `rgba(20,24,40,${(0.07 * (1 - wx.over * 0.6)).toFixed(3)})`;
    for (let yy = -ry; yy <= ry; yy += 2) { const hw = Math.round(rx * Math.sqrt(1 - (yy * yy) / (ry * ry))); ctx.fillRect(Math.round(cx - hw), Math.round(cy + yy), hw * 2, 2); }
  }
  if (!dark && wx.rain < 0.2) { const q = (T % 37) / 9; if (q < 1) for (let i = 0; i < 6; i++) { const bx = -20 + q * 640 - Math.abs(i - 2.5) * 6, by = 40 + q * 30 + (i - 2.5) * 5, f = Math.floor(T * 8 + i) % 2 ? -1 : 1; R(bx + 2, by + 3, 3, 1, 'rgba(0,0,0,.15)'); R(bx, by, 2, 1, '#2a2a33'); R(bx - 2, by + f, 2, 1, '#2a2a33'); R(bx + 2, by + f, 2, 1, '#2a2a33'); } }

  // the colour of the hour over everything; then, after dark, the lamps
  if (sky.tint !== '#ffffff') { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = sky.tint; ctx.fillRect(0, 0, 590, 190); ctx.globalCompositeOperation = 'source-over'; }
  if (night > 0.25) {
    const la = Math.min(1, (night - 0.25) * 2), fl = Math.sin(T * 11) > 0 ? 1 : 0;
    const glow = (gx, gy, r) => sceneGlow(ctx, gx, gy, r * 1.25, '255,170,80', 0.4 * la);
    for (const p of PLACES) if (p.kind !== 'arena' && p.kind !== 'market') scenePool(ctx, p.dx, p.y + p.h + 3, 15, '255,185,100', 0.3 * la);      // light from every open door lying on the street
    for (const p of PLACES) if (p.kind !== 'arena' && p.kind !== 'market' && p.kind !== 'forum') { ctx.fillStyle = `rgba(170,190,255,${(0.22 * la).toFixed(3)})`; ctx.fillRect(p.x, p.y, p.w, 1); ctx.fillRect(p.x, p.y, 1, 14); ctx.fillStyle = `rgba(170,190,255,${(0.1 * la).toFixed(3)})`; ctx.fillRect(p.x, p.y + 1, p.w, 2); }      // PASS 31: the moon along the ridges and gable ends of the roofs
    ctx.globalAlpha = la;
    for (const pl of PLACES) {
      if (pl.kind === 'market' || pl.kind === 'arena') continue;
      const wy = pl.y + pl.h - 11;
      for (const wx2 of pl.kind === 'forum' ? [pl.dx] : [pl.x + 9, pl.x + pl.w - 12]) { R(wx2, wy, 3, 4, '#ffd98a'); R(wx2, wy, 3, 1, '#fff0c0'); }
      ctx.globalAlpha = 1; glow(pl.dx, pl.y + pl.h + 1, 16); ctx.globalAlpha = la;
    }
    for (const [lx, ly] of [[256, 84], [343, 84], [256, 150], [343, 150], [570, 58], [570, 90]]) {       // torches at the corners of the square, and on the gate
      R(lx, ly - 7, 1, 8, '#3a2a1c'); R(lx - 1, ly - 10 - fl, 3, 4 + fl, '#e2702a'); R(lx, ly - 9 - fl, 1, 2, '#f5c04a');
      ctx.globalAlpha = 1; glow(lx, ly - 2, 15); ctx.globalAlpha = la;
    }
    R(vil.x + (vil.face === 'left' ? -5 : 5), vil.y - 13 - fl, 2, 3 + fl, '#e2702a'); R(vil.x + (vil.face === 'left' ? -5 : 5), vil.y - 10, 1, 4, '#3a2a1c');     // he carries a brand
    ctx.globalAlpha = 1; glow(vil.x, vil.y - 6, 13);
  }
  if (wx.rain > 0) {
    ctx.fillStyle = `rgba(200,215,235,${(0.5 * wx.rain).toFixed(3)})`;
    for (let i = 0, n = Math.round(70 * wx.rain); i < n; i++) { const x = Math.floor(((i * 97.3 - T * 70) % 620 + 620) % 620 - 15), y = Math.floor((i * 61.7 + T * 340 + (i % 7) * 13) % 200 - 5); ctx.fillRect(x, y, 1, 4); ctx.fillRect(x - 1, y + 4, 1, 2); }
  }
  if (wx.gust > 0) { ctx.globalAlpha = wx.gust; for (let i = 0; i < 6; i++) R((i * 211 + T * 120) % 640 - 20, 20 + (i * 43) % 160 - Math.abs(Math.sin(T * 5 + i)) * 8, 2, 1, i % 2 ? '#6f8a3a' : '#a8722e'); ctx.globalAlpha = 1; }

  sceneGrade(ctx, sky, wx);
  sceneVignette(ctx, 590, 190, 0.3);

  // what the mouse is resting on: a gold line round it, and a word about it along the foot of the map
  const hov = vil.hover ? villageAt(vil.hover.x, vil.hover.y) : null, hg = giverOf(hov), hp = hov && hov !== 'gate' && hov !== 'fountain' && hg < 0 ? placeOf(hov) : null;
  if (hg >= 0) { const [gx, gy] = GIVER_AT[hg]; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(T * 6); R(gx - 7, gy - 19, 14, 1, '#f5d584'); R(gx - 7, gy + 3, 14, 1, '#f5d584'); R(gx - 7, gy - 19, 1, 23, '#f5d584'); R(gx + 6, gy - 19, 1, 23, '#f5d584'); ctx.globalAlpha = 1; }
  if (hp) { ctx.globalAlpha = 0.6 + 0.3 * Math.sin(T * 6); R(hp.x - 2, hp.y - 2, hp.w + 4, 1, '#f5d584'); R(hp.x - 2, hp.y + hp.h + 1, hp.w + 4, 1, '#f5d584'); R(hp.x - 2, hp.y - 2, 1, hp.h + 4, '#f5d584'); R(hp.x + hp.w + 1, hp.y - 2, 1, hp.h + 4, '#f5d584'); ctx.globalAlpha = 1; }

  // names over the doors, the open one in gold, and how many things wait inside
  const marks = typeof villageMarks === 'function' ? villageMarks() : {};
  ctx.font = 'bold 6px Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  { const w = Math.ceil(ctx.measureText('GATE').width) + 6; R(590 - w - 1, 106, w, 8, 'rgba(24,16,10,.82)'); ctx.fillStyle = open ? '#f5d584' : '#a8947a'; ctx.fillText('GATE', 590 - w / 2 - 1, 112); }
  for (const p of PLACES) {
    const label = p.key === 'arena' && typeof daysToGames === 'function' ? (games ? 'ARENA: GAMES TODAY' : `ARENA: GAMES IN ${daysToGames()} DAY${daysToGames() === 1 ? '' : 'S'}`) : p.name.toUpperCase();
    const on = p.key === ui.tab, w = Math.ceil(ctx.measureText(label).width) + 6, lx = p.dx - Math.floor(w / 2), ly = Math.max(1, p.y - 8);
    R(lx, ly, w, 8, on ? '#f5d584' : 'rgba(24,16,10,.82)'); R(lx, ly + 7, w, 1, on ? '#b6832c' : '#000');
    ctx.fillStyle = on ? '#2a1a0c' : p.key === 'arena' && games ? '#f5d584' : '#f2e6cc'; ctx.fillText(label, p.dx, ly + 6);
    if (marks[p.key]) { R(lx + w + 1, ly, 8, 8, '#c23b2e'); ctx.fillStyle = '#fff'; ctx.fillText(String(marks[p.key]), lx + w + 5, ly + 6); }
    if (ui.wayTo === p.key && !on) {                                     // the steward's arrow
      const ay = p.dy - 20 + Math.round(Math.sin(T * 6) * 2);
      R(p.dx - 1, ay, 3, 6, '#f5d584'); R(p.dx - 3, ay + 6, 7, 1, '#f5d584'); R(p.dx - 2, ay + 7, 5, 1, '#f5d584'); R(p.dx - 1, ay + 8, 3, 1, '#f5d584'); R(p.dx, ay + 9, 1, 1, '#f5d584');
    }
  }
  if (vil.hover) {
    const say = hov === 'gate' ? (open ? 'THE EAST GATE: OUT INTO THE PROVINCE' : 'THE EAST GATE: BARRED UNTIL YOUR FIRST GAMES') : hg >= 0 && fountainFolk()[hg] ? (fountainFolk()[hg].owed ? `${fountainFolk()[hg].q.giver.name.toUpperCase()}, ${GIVERS[fountainFolk()[hg].q.giver.kind].what.toUpperCase()}, HAS COME TO PAY WHAT IS OWED  -  CLICK TO GO OVER` : `${fountainFolk()[hg].q.giver.name.toUpperCase()}, ${GIVERS[fountainFolk()[hg].q.giver.kind].what.toUpperCase()}, HAS WORK FOR YOU  -  CLICK TO HEAR IT`) : hov ? PLACE_INFO[hov].split(':')[0] + ': ' + (typeof villageStatus === 'function' ? villageStatus(hov) : PLACE_INFO[hov].split(': ')[1]) + (hov === ui.tab ? '  -  OPEN NOW' : '  -  CLICK TO WALK THERE') : (fountainFolk().length ? 'CLICK ANYONE WAITING BY THE FOUNTAIN TO HEAR THEM  -  ' : '') + 'W A S D TO WALK  -  CLICK A BUILDING TO WALK THERE';
    const w = Math.ceil(ctx.measureText(say).width) + 10;
    R(295 - w / 2, 178, w, 10, 'rgba(24,16,10,.88)'); ctx.fillStyle = hov ? '#f5d584' : '#f2e6cc'; ctx.fillText(say, 295, 185);
  }
}

function villageFrame(ts) {
  const cv = document.getElementById('village');
  if (!cv || !G) { vil.raf = 0; return; }
  const arena = document.getElementById('arena');
  const wilds = document.getElementById('wilds');
  if (wilds && !wilds.hidden && !(arena && !arena.hidden)) { /* under the map of the province: not seen, so not painted */ }
  else if (ts - vil.last > 15 && !(arena && !arena.hidden)) { vil.last = ts; try { drawVillage(cv, ts / 1000); } catch (e) { console.error(e); vil.raf = 0; return; } }
  else if (arena && !arena.hidden) { villageStill(); vil.prev = 0; if (typeof SFX !== 'undefined') SFX.ambience(0, 0); }
  vil.raf = requestAnimationFrame(villageFrame);
}
function startVillage() {
  const cv = document.getElementById('village');
  if (!cv) return;
  if (!vil.x) villagePlace(ui.tab);
  if (!cv._watched) {                         // where the mouse is over the map, for the gold line and the word about it
    cv._watched = true;
    cv.addEventListener('mousemove', e => { const r = cv.getBoundingClientRect(); vil.hover = { x: (e.clientX - r.left) / r.width * VILLAGE.W, y: (e.clientY - r.top) / r.height * VILLAGE.H }; });
    cv.addEventListener('mouseleave', () => { vil.hover = null; });
  }
  if (!vil.raf) vil.raf = requestAnimationFrame(villageFrame);
}
