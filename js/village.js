'use strict';
// The village: a small town seen from above, and the only way to get from one screen of the game to another.
// You walk the lanista about it with W A S D, or click a building and he walks there himself. Stepping onto a
// building's doorstep opens its screen. Drawn on the same 590x190 grid as the yard, at 2 canvas pixels per unit.

const VILLAGE = { W: 590, H: 190, S: 2, CELL: 5, SPEED: 190 };
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
    const cx = p.x + p.w / 2, cy = p.y + 30;
    for (let y = Math.floor(p.y / C); y <= Math.floor((p.y + p.h - 1) / C); y++) for (let x = Math.floor(p.x / C); x <= Math.floor((p.x + p.w - 1) / C); x++) {
      const dx = (x * C + C / 2 - cx) / 64, dy = (y * C + C / 2 - cy) / 29;
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
function villageWalkTo(key, then) {
  if (key === 'gate') { vil.then = null; vil.path = vilPath(vil.x, vil.y, 582, 73); return; }
  const p = placeOf(key);
  vil.then = then || null;
  if (vil.at === p.key && Math.hypot(vil.x - p.dx, vil.y - p.dy) < 7) { vil.path = null; const f = vil.then; vil.then = null; if (f) f(); return; }
  vil.path = vilPath(vil.x, vil.y, p.dx, p.dy);
}
// Which building a click landed on ('gate' for the way out of town).
function villageAt(x, y) {
  if (x > 566 && y > 48 && y < 92) return 'gate';
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
  if (vil.x > 578 && vil.y > 62 && vil.y < 84) { if (!vil.gated) { vil.gated = true; vil.path = null; villageStill(); if (typeof villageGate === 'function') villageGate(); } }
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
  if (vil.layer && vil.layer.width === VILLAGE.W * VILLAGE.S) return vil.layer;
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
  for (let x = 6; x < 584; x += 5) { const hgt = 3 + Math.round(rnd(x, 2)); R(x, 5, 6, hgt, x % 15 < 5 ? '#3f6a2c' : '#4a7a36'); R(x + 1, 5, 3, 1, '#63903f'); if (rnd(x + 9, 1) > 0.85) R(x + 2, 6, 1, 1, '#e8a0a0'); }
  for (let i = 0; i < 5; i++) { const ox = 240 + i * 13, oy = 180; ell(ox + 1, oy + 2, 5, 2, 'rgba(0,0,0,.2)'); R(ox, oy - 2, 1, 4, '#5a3c20'); ell(ox, oy - 5, 5, 4, '#4a7a36'); ell(ox - 1, oy - 6, 3, 2, '#63903f'); R(ox - 2, oy - 4, 1, 1, '#c23b2e'); R(ox + 2, oy - 6, 1, 1, '#c23b2e'); R(ox + 1, oy - 3, 1, 1, '#e3b04a'); }
  for (let i = 0; i < 3; i++) { const bx = 328 + i * 8; R(bx, 177, 5, 6, '#d9c070'); R(bx, 177, 5, 1, '#e6d088'); R(bx, 179, 5, 1, '#b89a4a'); R(bx, 181, 5, 1, '#b89a4a'); R(bx + 2, 182, 1, 1, '#3a2a1c'); }
  ell(381, 178, 16, 5, '#5f7f3f'); ell(381, 177, 15, 4, '#4f8fb8'); ell(379, 176, 11, 2, '#6fa8cc');
  for (const [rx, ry] of [[366, 176], [369, 180], [395, 175], [392, 181]]) { R(rx, ry - 4, 1, 5, '#6f8a3a'); R(rx + 1, ry - 3, 1, 4, '#8aa64a'); R(rx, ry - 5, 1, 1, '#7a5a2a'); }
  // the two streets and the lanes between them
  const road = (x, y, w, h) => { R(x - 1, y - 1, w + 2, h + 2, '#a98a58'); R(x, y, w, h, '#cdae78'); for (let i = 0; i < w * h / 26; i++) R(x + rnd(i + x, w - 2), y + rnd(i + y + 7, h - 1), 2, 1, i % 2 ? '#bf9f6a' : '#d9bd8a'); };
  road(4, 64, 582, 18); road(4, 152, 582, 16);
  for (const x of [14, 146, 464, 566]) road(x, 82, 12, 70);
  // the streets are kerbed with stone and rutted by carts
  for (const [ry, rh] of [[64, 18], [152, 16]]) {
    for (let x = 6; x < 584; x += 4) { R(x, ry - 1, 3, 1, x % 8 ? '#bdb39c' : '#a39a84'); R(x + 1, ry + rh, 3, 1, x % 8 ? '#a39a84' : '#bdb39c'); }
    for (let x = 6; x < 584; x += 3) { if (rnd(x + ry, 1) > 0.25) { R(x, ry + Math.round(rh * 0.36), 2, 1, 'rgba(120,85,40,.28)'); R(x, ry + Math.round(rh * 0.64), 2, 1, 'rgba(120,85,40,.28)'); } }
  }
  // the square, paved, with the fountain in it
  R(254, 82, 92, 70, '#b9b29c');
  for (let y = 82; y < 152; y += 7) for (let x = 254 + ((y / 7) % 2 ? 0 : 5); x < 346; x += 10) { R(x, y, 9, 6, (x + y) % 3 ? '#c9c3ae' : '#d4cfbc'); }
  R(254, 82, 92, 1, '#8f8872'); R(254, 151, 92, 1, '#8f8872');
  ell(296, 121, 11, 8, 'rgba(0,0,0,.25)'); ell(296, 119, 11, 8, '#a39d8a'); ell(296, 119, 9, 6, '#5d9ac2'); ell(296, 118, 7, 4, '#7fb6d8'); R(294, 112, 4, 8, '#bdb7a3'); R(293, 111, 6, 2, '#d4cfbc');
  // the square: a statue of some forgotten magistrate, and benches to argue on
  R(291, 88, 10, 4, '#a39d8a'); R(292, 87, 8, 1, '#d4cfbc'); R(294, 79, 4, 8, '#c9c3ae'); R(294, 76, 4, 3, '#d9d2bd'); R(293, 80, 1, 5, '#b5af9b'); R(298, 81, 2, 1, '#c9c3ae');
  for (const [bx, by] of [[262, 136], [322, 136], [262, 96], [322, 96]]) { R(bx, by, 12, 3, '#8a6a3a'); R(bx, by, 12, 1, '#a8834a'); R(bx + 1, by + 3, 1, 2, '#5a4326'); R(bx + 10, by + 3, 1, 2, '#5a4326'); }
  // flowers by the temple, barrels by the tavern, crates by the market, hay by the school, washing by the forge
  for (const fx of [374, 460]) { R(fx, 56, 8, 5, '#5a4326'); for (let k = 0; k < 4; k++) R(fx + k * 2, 56 + (k % 2), 2, 2, ['#e06a8a', '#f2e6a0', '#b9a0e0', '#e8a0a0'][k]); }
  for (const bx of [478, 562]) { R(bx, 142, 6, 7, '#7a5a2a'); R(bx, 142, 6, 1, '#3a2a1c'); R(bx, 145, 6, 1, '#3a2a1c'); R(bx + 1, 141, 4, 1, '#a8834a'); }
  R(138, 140, 7, 7, '#a8834a'); R(138, 140, 7, 1, '#c9a25a'); R(141, 135, 6, 6, '#a8834a'); R(141, 135, 6, 1, '#c9a25a');
  R(213, 52, 12, 8, '#c9a24a'); R(214, 50, 10, 2, '#d9bd6a'); R(213, 59, 12, 1, '#a8853a');
  R(238, 112, 1, 12, '#5a4326'); R(250, 112, 1, 12, '#5a4326'); R(238, 113, 13, 1, '#3a2a1c'); R(240, 114, 3, 4, '#e8e2d0'); R(244, 114, 2, 5, '#b85a48'); R(247, 114, 3, 3, '#8fa8c8');
  // a well, and a cart by the lower street
  R(148, 158, 8, 6, '#8f8872'); R(149, 159, 6, 4, '#2c3f52'); R(147, 154, 1, 5, '#6b4a2a'); R(156, 154, 1, 5, '#6b4a2a'); R(147, 153, 10, 1, '#6b4a2a');
  R(214, 172, 14, 5, '#8a6a3a'); R(214, 171, 14, 1, '#a8834a'); R(216, 176, 3, 3, '#3a2a1c'); R(223, 176, 3, 3, '#3a2a1c'); R(216, 168, 10, 3, '#d9c27a');

  // ----- buildings -----
  const tiles = (x, y, w, h, base) => { R(x, y, w, h, base); for (let yy = y + 2; yy < y + h; yy += 3) R(x, yy, w, 1, shade(base, 0.84)); for (let xx = x + 3; xx < x + w; xx += 6) R(xx, y, 1, h, shade(base, 0.92)); R(x, y, w, 1, shade(base, 1.18)); R(x, y + h - 1, w, 1, shade(base, 0.62)); };
  const wall = (x, y, w, h, c) => { R(x, y, w, h, c); R(x, y, w, 1, shade(c, 0.78)); R(x, y + h - 2, w, 2, shade(c, 0.84)); R(x, y, 1, h, shade(c, 0.88)); R(x + w - 1, y, 1, h, shade(c, 0.88)); };
  const door = (p, w, h, c) => { const x = p.dx - Math.floor(w / 2), y = p.y + p.h - h; R(x - 1, y - 1, w + 2, h + 1, '#5a4326'); R(x, y, w, h, c || '#3a2416'); R(p.dx - 5, p.y + p.h, 10, 2, '#b8a888'); };
  const win = (x, y) => { R(x, y, 3, 4, '#3a2e24'); R(x, y, 3, 1, '#8a7a5a'); };
  // every building throws its shade down and to the right, as the trees and the arena do
  const shadow = p => { R(p.x + 3, p.y + p.h, p.w, 4, 'rgba(0,0,0,.22)'); R(p.x + p.w, p.y + 5, 3, p.h - 1, 'rgba(0,0,0,.2)'); R(p.x + 5, p.y + p.h + 4, p.w - 2, 1, 'rgba(0,0,0,.1)'); };
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
  // the town wall, all the way round, with its battlements
  const stone = '#b8ab94', top = '#d8cdb6', dark = '#8f846e';
  R(0, 0, 590, 3, stone); R(0, 3, 590, 1, dark); R(0, 186, 590, 4, stone); R(0, 186, 590, 1, top);
  R(0, 0, 3, 190, stone); R(3, 0, 1, 190, dark); R(586, 0, 4, 52, stone); R(586, 94, 4, 96, stone); R(585, 0, 1, 52, dark); R(585, 94, 1, 96, dark);
  for (let x = 1; x < 590; x += 6) { R(x, 0, 3, 1, top); R(x, 189, 3, 1, dark); }
  for (let y = 4; y < 190; y += 6) { R(0, y, 1, 3, top); if (y < 50 || y > 96) R(589, y, 1, 3, top); }
  // a tower at each corner of the wall
  for (const [wx0, wy0] of [[0, 0], [580, 0], [0, 180], [580, 180]]) {
    R(wx0, wy0, 10, 10, stone); R(wx0, wy0, 10, 1, top); R(wx0, wy0, 1, 10, top); R(wx0 + 9, wy0, 1, 10, dark); R(wx0, wy0 + 9, 10, 1, dark);
    R(wx0 + 2, wy0 + 2, 6, 6, dark); R(wx0 + 3, wy0 + 3, 4, 4, '#a39a84'); for (let q = 0; q < 10; q += 3) { R(wx0 + q, wy0, 2, 1, '#f0e8d6'); R(wx0 + q, wy0 + 9, 2, 1, '#f0e8d6'); }
  }
  // trees: a round crown, lit from the upper left, over its own shadow
  for (const [tx, ty] of VIL_TREES) { ell(tx + 1, ty + 1, 7, 3, 'rgba(0,0,0,.25)'); R(tx - 1, ty - 4, 2, 5, '#5a3c20'); ell(tx, ty - 9, 7, 6, '#3f6a2c'); ell(tx - 1, ty - 10, 5, 4, '#57863a'); ell(tx - 2, ty - 11, 2, 2, '#77a64e'); }
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
  if (wx.wet > 0) { R(0, 0, 590, 190, `rgba(40,45,60,${(0.13 * wx.wet).toFixed(3)})`); for (let i = 0; i < 9; i++) { const px = (i * 67 + 20) % 560, py = i % 2 ? 70 + (i * 3) % 8 : 156 + (i * 5) % 8, w = Math.round((8 + (i % 3) * 4) * wx.wet); if (w > 3) { R(px, py, w, 2, 'rgba(160,190,215,.55)'); R(px + 1, py + 2, w - 2, 1, 'rgba(160,190,215,.4)'); } } }

  // the pond: two ducks about their business, and a ring where one has just dabbled
  for (let i = 0; i < 2; i++) {
    const a = T * 0.22 + i * 3.3, dx = 381 + Math.cos(a) * (9 - i * 3), dy = 177 + Math.sin(a) * 2.5, fwd = -Math.sin(a) > 0 ? 1 : -1, still = night > 0.6;
    const px = still ? 372 + i * 6 : dx, py = still ? 177 : dy;
    R(px - 2, py - 1, 4, 2, i ? '#8a6a4a' : '#f1ead8'); R(px + (fwd > 0 ? 2 : -3), py - 2, 2, 2, i ? '#3f6a4a' : '#f1ead8'); R(px + (fwd > 0 ? 4 : -4), py - 1, 1, 1, '#e3b04a');
    if (!still) { ctx.globalAlpha = 0.5; R(px - fwd * 4, py, 2, 1, '#bfe0f4'); R(px - fwd * 6, py + 1, 2, 1, '#bfe0f4'); ctx.globalAlpha = 1; }
  }
  { const q = (T * 0.25) % 1; ctx.globalAlpha = 0.6 * (1 - q); R(388 - q * 4, 178, 2 + Math.round(q * 8), 1, '#d6ecf8'); ctx.globalAlpha = 1; }
  // what moves on the buildings: water, smoke, the forge fire, flags
  for (let i = 0; i < 4; i++) { const a = T * 2 + i * 1.6; R(296 + Math.cos(a) * 5, 118 + Math.sin(a) * 3, 2, 1, '#d6ecf8'); }
  R(295, 109 - Math.abs(Math.sin(T * 3)) * 2, 2, 3, '#bfe0f4');
  const f = placeOf('smith'), glow = 0.55 + 0.45 * Math.sin(T * 7);
  R(f.dx - 5, f.y + 38, 10, 7, `rgba(255,${Math.round(120 + 70 * glow)},40,${(0.55 + 0.3 * glow).toFixed(2)})`); R(f.dx - 2, f.y + 41, 4, 3, '#ffe9a0');
  for (let i = 0; i < 4; i++) { const p = (T * 0.35 + i * 0.25) % 1; ctx.globalAlpha = 0.5 * (1 - p); R(f.x + f.w - 14 + Math.sin(p * 5 + i) * 3, f.y + 4 - p * 16, 4 + Math.round(p * 3), 3, '#d8d4cc'); }
  ctx.globalAlpha = 1;
  const a = placeOf('arena'), acx = a.x + a.w / 2;
  for (const [ox, col] of [[-50, '#8a2a20'], [-28, '#c9a21e'], [28, '#2f6db8'], [50, '#8a2a20']]) { const fy = a.y + 28 - Math.round(26 * Math.sqrt(1 - (ox * ox) / (63 * 63))) - 7; R(acx + ox, fy, 1, 8, '#5a4326'); R(acx + ox + 1, fy + (Math.sin(T * 4 + ox) > 0 ? 0 : 1), 5, 3, col); }

  const lost = (G.fallen || []).some(x => G.day - x.day <= 2), fest = G.festival && G.festival.day >= G.day && G.festival.day - G.day <= 3;
  if (lost) { const lu = placeOf('ludus'); R(lu.dx + 20, lu.y - 6, 1, 12, '#3a2a1c'); R(lu.dx + 21, lu.y - 6 + (Math.sin(T * 3) > 0 ? 0 : 1), 6, 4, '#16110e'); R(lu.dx + 21, lu.y - 2, 4, 2, '#16110e'); }
  if (fest) for (let i = 0; i <= 14; i++) {             // a festival is near: garlands over the square
    const bx = 257 + i * 6, by = 78 + Math.round(Math.sin(i / 14 * Math.PI) * 4);
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
  R(572, 52, 18, 12, '#b8ab94'); R(572, 82, 18, 12, '#b8ab94'); R(572, 52, 18, 2, '#d8cdb6'); R(572, 82, 18, 2, '#d8cdb6'); R(572, 62, 18, 2, '#8f846e'); R(572, 92, 18, 2, '#8f846e');
  for (let i = 572; i < 590; i += 4) { R(i, 50, 2, 2, '#d8cdb6'); R(i, 80, 2, 2, '#d8cdb6'); }
  R(576, 64, 12, 2, '#8f846e'); R(576, 80, 12, 2, '#6f6654');
  if (!open) { R(578, 66, 9, 14, '#5a3c20'); R(578, 66, 9, 1, '#7a5632'); R(582, 66, 1, 14, '#3a2416'); R(578, 72, 9, 2, '#3a2a1c'); }
  R(585, 44, 1, 8, '#5a4326'); R(586, 44 + (Math.sin(T * 4) > 0 ? 0 : 1), 4, 3, '#a02d22');
  if (ui.wayTo === 'gate') { const ay = 46 + Math.round(Math.sin(T * 6) * 2); R(579, ay, 3, 6, '#f5d584'); R(577, ay + 6, 7, 1, '#f5d584'); R(578, ay + 7, 5, 1, '#f5d584'); R(579, ay + 8, 3, 1, '#f5d584'); }
  // the doorstep of the screen now open, and of wherever the steward is sending you
  const cur = PLACES.find(p => p.key === ui.tab);
  if (cur) { ctx.globalAlpha = 0.5 + 0.3 * Math.sin(T * 4); R(cur.dx - 6, cur.dy - 4, 12, 5, '#f5d584'); ctx.globalAlpha = 1; }

  // people, the nearer drawn over the farther. By night most of the town is indoors.
  const folk = vil.npcs.filter((n, i) => !dark || i < 2).map(n => ({ y: n.y, draw: () => vilPerson(ctx, n.x, n.y, n) }));
  const still = (x, y, o) => folk.push({ y, draw: () => vilPerson(ctx, x, y, Object.assign({ face: 'down', walk: 0, moving: false }, o)) });
  const notes = [];                    // marks over the heads of people who are waiting for you: [x, y, colour]
  if (!dark) {                                   // a carter and his mule, coming along the upper street to the gate, every so often
    const cx = ((T * 13) % 900) - 60, cy = 75;
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
  for (const gy of [62, 96]) folk.push({ y: gy, draw: () => { vilPerson(ctx, 568, gy, { face: 'left', walk: 0, moving: false, tunic: '#a02d22', hair: '#b4bec8', skin: '#d9a57c' }); R(563, gy - 20, 1, 20, '#5a4326'); R(562, gy - 22, 3, 3, '#c9d1d9'); } });
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
    const glow = (gx, gy, r) => { ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 4; i++) { ctx.fillStyle = `rgba(255,170,80,${(0.07 * la).toFixed(3)})`; ctx.fillRect(Math.round(gx - r + i * r / 4), Math.round(gy - r * 0.7 + i * r / 6), Math.round((r - i * r / 4) * 2), Math.round((r * 0.7 - i * r / 6) * 2)); } ctx.globalCompositeOperation = 'source-over'; };
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

  sceneVignette(ctx, 590, 190, 0.3);

  // what the mouse is resting on: a gold line round it, and a word about it along the foot of the map
  const hov = vil.hover ? villageAt(vil.hover.x, vil.hover.y) : null, hp = hov && hov !== 'gate' ? placeOf(hov) : null;
  if (hp) { ctx.globalAlpha = 0.6 + 0.3 * Math.sin(T * 6); R(hp.x - 2, hp.y - 2, hp.w + 4, 1, '#f5d584'); R(hp.x - 2, hp.y + hp.h + 1, hp.w + 4, 1, '#f5d584'); R(hp.x - 2, hp.y - 2, 1, hp.h + 4, '#f5d584'); R(hp.x + hp.w + 1, hp.y - 2, 1, hp.h + 4, '#f5d584'); ctx.globalAlpha = 1; }

  // names over the doors, the open one in gold, and how many things wait inside
  const marks = typeof villageMarks === 'function' ? villageMarks() : {};
  ctx.font = 'bold 6px Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  { const w = Math.ceil(ctx.measureText('GATE').width) + 6; R(590 - w - 1, 96, w, 8, 'rgba(24,16,10,.82)'); ctx.fillStyle = open ? '#f5d584' : '#a8947a'; ctx.fillText('GATE', 590 - w / 2 - 1, 102); }
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
    const say = hov === 'gate' ? (open ? 'THE EAST GATE: OUT INTO THE PROVINCE' : 'THE EAST GATE: BARRED UNTIL YOUR FIRST GAMES') : hov ? PLACE_INFO[hov].split(':')[0] + ': ' + (typeof villageStatus === 'function' ? villageStatus(hov) : PLACE_INFO[hov].split(': ')[1]) + (hov === ui.tab ? '  -  OPEN NOW' : '  -  CLICK TO WALK THERE') : 'W A S D TO WALK  -  CLICK A BUILDING TO WALK THERE  -  STEP ON A DOORSTEP TO GO IN';
    const w = Math.ceil(ctx.measureText(say).width) + 10;
    R(295 - w / 2, 178, w, 10, 'rgba(24,16,10,.88)'); ctx.fillStyle = hov ? '#f5d584' : '#f2e6cc'; ctx.fillText(say, 295, 185);
  }
}

function villageFrame(ts) {
  const cv = document.getElementById('village');
  if (!cv || !G) { vil.raf = 0; return; }
  const arena = document.getElementById('arena');
  if (ts - vil.last > 15 && !(arena && !arena.hidden)) { vil.last = ts; try { drawVillage(cv, ts / 1000); } catch (e) { console.error(e); vil.raf = 0; return; } }
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
