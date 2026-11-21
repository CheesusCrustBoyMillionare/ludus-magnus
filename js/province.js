'use strict';
// The map of the province, shown over the whole window while the school is outside the walls.
// The rules of what is out there are in wilds.js; this file draws it and walks the column about it.
// The map is 2400 by 1800 units; the window shows 480 by 360 of it, at 2 canvas pixels per unit.

const PROV = { VW: 480, VH: 360, S: 2, SPEED: 88 };
const prov = { land: null, raf: 0, last: 0, prev: 0, path: null, trail: [], face: 'down', walk: 0, moving: false, mini: 0, saved: 0, camX: 0, camY: 0, hint: 0, big: false, night: -1e9 };

// ---------- the country, painted once ----------
const TILE_COL = ['#7e9a4b', '#5d7f3f', '#93985c', '#5f7a4c', '#d8c48a', '#cdae78', '#8a6a3a', '#86a250', '#4f8fb8', '#8a8478'];      // in the order of the T_ kinds in wilds.js
function provLand() {
  if (prov.land) return prov.land;
  const L = wildLand(), TW = WILD.TW, TH = WILD.TH, cv = document.createElement('canvas');
  cv.width = WILD.W; cv.height = WILD.H;
  const ctx = cv.getContext('2d'), R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const h = (x, y, k) => wildHash(x, y, 91 + k), at = (x, y) => (x < 0 || y < 0 || x >= TW || y >= TH ? T_PEAK : L.t[y * TW + x]);
  const wet = k => k === T_WATER;
  // broad light and dark across the country, so that no stretch of it is one flat colour
  // (in nine steps, so that a tint can be tinted again and the colours stay few)
  const tone = (tx, ty) => 0.92 + Math.round(wildNoise(tx / 13, ty / 13, 501) * 8) * 0.02;
  const tint = (hex, f) => {
    const n = parseInt(hex.slice(1), 16), ch = v => { v = f <= 1 ? v * f : v + (255 - v) * (f - 1); return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); };
    return '#' + ch(n >> 16) + ch((n >> 8) & 255) + ch(n & 255);
  };
  const north = (tx, ty) => (tx / TW + (1 - ty / TH)) / 2;
  const deep = (tx, ty) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!wet(at(tx + dx, ty + dy)) && at(tx + dx, ty + dy) !== T_BRIDGE) return false; return true; };
  const tx0 = Math.floor(WILD.TOWN.x / 10), ty0 = Math.floor(WILD.TOWN.y / 10);
  // farmland round the town: strips of wheat and green, cut into fields
  const farm = (tx, ty) => { const d = Math.hypot(tx - tx0, ty - ty0); if (d < 3 || d > 10.5) return 0; const f = h(Math.floor(tx / 4), Math.floor(ty / 3), 70); return f > 0.4 ? (f > 0.72 ? 2 : 1) : 0; };
  const col = (k, tx, ty) => k === T_WATER ? (deep(tx, ty) ? '#3f7dab' : '#5a9cc6') : tint(TILE_COL[k === T_ROAD || k === T_BRIDGE ? T_GRASS : k], tone(tx, ty));

  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const k = at(tx, ty), x = tx * 10, y = ty * 10, base = col(k, tx, ty);
    R(x, y, 10, 10, base);
    for (let i = 0; i < 3; i++) R(x + Math.floor(h(tx, ty, i) * 9), y + Math.floor(h(tx, ty, i + 5) * 10), 2, 1, tint(base, i % 2 ? 0.9 : 1.1));
    // a ragged edge where one kind of ground meets another
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy], n) => {
      const o = at(tx + dx, ty + dy);
      if (o === k || o === T_ROAD || o === T_BRIDGE || k === T_ROAD || k === T_BRIDGE) return;
      const oc = col(o, tx + dx, ty + dy);
      for (let i = 0; i < 5; i++) { const q = Math.floor(h(tx, ty, 20 + n * 5 + i) * 9); R(dx ? x + (dx > 0 ? 8 + (i % 2) : 1 - (i % 2)) : x + q, dy ? y + (dy > 0 ? 8 + (i % 2) : 1 - (i % 2)) : y + q, 2, 2, oc); }
    });
  }
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const k = at(tx, ty), x = tx * 10, y = ty * 10, a = h(tx, ty, 40), b = h(tx, ty, 41);
    if (k === T_ROAD || k === T_BRIDGE) {
      const road = k === T_ROAD ? '#cdae78' : '#8a6a3a';
      R(x + 2, y + 2, 6, 6, road);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const o = at(tx + dx, ty + dy); if (o === T_ROAD || o === T_BRIDGE) R(dx ? x + (dx > 0 ? 8 : 0) : x + 2, dy ? y + (dy > 0 ? 8 : 0) : y + 2, dx ? 2 : 6, dy ? 2 : 6, road); }
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const o = at(tx + dx, ty + dy); if (o === T_ROAD || o === T_BRIDGE) R(x + (dx > 0 ? 7 : 0), y + (dy > 0 ? 7 : 0), 3, 3, road); }
      if (k === T_BRIDGE) { R(x, y + 1, 10, 1, '#5f4622'); R(x, y + 8, 10, 1, '#5f4622'); for (let i = 1; i < 10; i += 3) R(x + i, y + 2, 1, 6, '#77592e'); }
      else { if (a > 0.6) R(x + 3 + Math.floor(b * 4), y + 3 + Math.floor(a * 3), 2, 1, '#b8955f'); if (a < 0.2) R(x + 4, y + 5, 1, 2, '#dcc396'); if (h(tx, ty, 44) > 0.975) { R(x + 8, y + 1, 2, 4, '#c9c3ae'); R(x + 8, y + 1, 2, 1, '#e4dfcd'); } }       // ruts, and now and then a milestone
    } else if (k === T_WATER) {
      if (a > 0.45) R(x + Math.floor(b * 6), y + 2 + Math.floor(a * 6), 4, 1, deep(tx, ty) ? '#5a9cc6' : '#8fc3e0');
      if (b > 0.8) R(x + 5, y + 7, 3, 1, '#35709c');
      // surf along the shore
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy], n) => {
        const o = at(tx + dx, ty + dy);
        if (wet(o) || o === T_BRIDGE) return;
        for (let i = 0; i < 2; i++) { const q = 1 + Math.floor(h(tx, ty, 50 + n * 2 + i) * 6); R(dx ? x + (dx > 0 ? 7 : 2) : x + q, dy ? y + (dy > 0 ? 7 : 2) : y + q, dx ? 1 : 3, dx ? 3 : 1, '#e6f3fa'); }
      });
    }
    else if (k === T_SAND) { if (a > 0.6) R(x + Math.floor(b * 8), y + Math.floor(a * 8), 2, 1, '#c2ad72'); if (a < 0.06) { R(x + 4, y + 5, 2, 1, '#f1ead8'); R(x + 5, y + 4, 1, 1, '#f1ead8'); } }
    else if (k === T_MEADOW) { R(x + Math.floor(a * 8), y + Math.floor(b * 8), 1, 1, '#f2e6a0'); R(x + Math.floor(b * 8), y + Math.floor(a * 8), 1, 1, a > 0.5 ? '#e8a0a0' : '#f4f4f0'); if (b > 0.6) R(x + 2 + Math.floor(a * 5), y + 7, 1, 1, '#b9a0e0'); }
    else if (k === T_MARSH) {
      R(x + 1 + Math.floor(a * 4), y + 5, 5, 3, '#3d5a52'); R(x + 2 + Math.floor(a * 4), y + 6, 3, 1, '#587a78');
      R(x + 7, y + 1 + Math.floor(b * 3), 1, 4, '#8a9a4a'); R(x + 2, y + 1, 1, 3, '#8a9a4a'); if (a > 0.5) { R(x + 8, y + 1 + Math.floor(b * 3), 1, 1, '#6b4a2a'); R(x + 5, y + 2, 1, 3, '#9aaa5a'); }
    }
    else if (k === T_HILL) {
      const t = tone(tx, ty);
      if (a > 0.5) { R(x - 1, y + 4, 12, 4, tint('#a3a866', t)); R(x + 1, y + 2, 8, 2, tint('#b4b978', t)); R(x + 3, y + 1, 4, 1, tint('#c2c688', t)); R(x - 1, y + 8, 12, 1, tint('#70763f', t)); R(x + 8, y + 4, 3, 4, tint('#7f8548', t)); }
      else if (a > 0.36) { R(x + 2, y + 5, 6, 3, tint('#a3a866', t)); R(x + 3, y + 4, 3, 1, tint('#b4b978', t)); R(x + 2, y + 8, 6, 1, tint('#70763f', t)); }
      else if (a < 0.1) { R(x + 3, y + 5, 4, 3, '#9a958a'); R(x + 3, y + 5, 4, 1, '#bdb8ac'); R(x + 3, y + 8, 5, 1, 'rgba(0,0,0,.2)'); }
    }
    else if (k === T_GRASS) {
      const f = farm(tx, ty);
      if (f) {                                 // a ploughed strip, or one in green
        const c1 = f === 2 ? '#c9b25a' : '#8fae52', c2 = f === 2 ? '#b39a44' : '#7b9a44';
        R(x, y, 10, 10, c1); for (let i = 1; i < 10; i += 3) R(x, y + i, 10, 1, c2);
        if (tx % 4 === 0) R(x, y, 1, 10, '#5f7f3f'); if (ty % 3 === 0) R(x, y, 10, 1, '#5f7f3f');
      }
      else if (a > 0.94) { R(x + 3, y + 5, 5, 3, '#4c7f38'); R(x + 4, y + 4, 3, 1, '#69a04a'); R(x + 3, y + 8, 5, 1, 'rgba(0,0,0,.18)'); }       // a bush
      else if (a < 0.02) { R(x + 4, y + 5, 3, 2, '#9a958a'); R(x + 4, y + 5, 3, 1, '#bdb8ac'); }                                                   // a stone
    }
  }
  // farmsteads among the fields
  for (const [dx, dy] of [[-6, -5], [7, 6], [-8, 4], [6, -7], [-3, 8]]) {
    const tx = tx0 + dx, ty = ty0 + dy, k = at(tx, ty);
    if (k !== T_GRASS && k !== T_MEADOW) continue;
    const x = tx * 10, y = ty * 10;
    R(x - 1, y + 8, 13, 2, 'rgba(0,0,0,.22)'); R(x, y + 2, 11, 7, '#e2d2a8'); R(x - 1, y - 2, 13, 4, '#a8482a'); R(x, y - 3, 11, 1, '#c2603a'); R(x + 4, y + 5, 3, 4, '#3a2416'); R(x + 13, y + 4, 4, 5, '#8a6a3a'); R(x + 13, y + 3, 4, 1, '#c9b25a');
  }
  // what stands up from the ground is drawn last, row by row, so that it overlaps what is behind it
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const k = at(tx, ty), x = tx * 10, y = ty * 10, a = h(tx, ty, 60), b = h(tx, ty, 61);
    if (k === T_FOREST) {
      const pine = north(tx, ty) + (h(tx, ty, 62) - 0.5) * 0.2 > 0.56;
      const tree = (cx, cy, small) => {
        R(cx - 4, cy + 4, 9, 2, 'rgba(0,0,0,.2)'); R(cx, cy + 1, 1, 4, '#4a3320');
        if (pine) { R(cx - 3, cy, 7, 2, '#2c5230'); R(cx - 2, cy - 2, 5, 2, '#2c5230'); R(cx - 1, cy - 4, 3, 2, '#2c5230'); R(cx, cy - 6, 1, 2, '#2c5230'); R(cx - 3, cy, 3, 1, '#437046'); R(cx - 2, cy - 2, 2, 1, '#437046'); R(cx - 1, cy - 4, 1, 1, '#5a8a58'); }
        else if (small) { R(cx - 2, cy - 3, 5, 4, '#3a6a2e'); R(cx - 2, cy - 3, 3, 2, '#55893e'); }
        else { R(cx - 3, cy - 4, 7, 6, '#35602b'); R(cx - 4, cy - 3, 9, 4, '#35602b'); R(cx - 2, cy - 5, 5, 1, '#35602b'); R(cx - 3, cy - 4, 4, 3, '#4c7f38'); R(cx - 2, cy - 5, 2, 1, '#69a04a'); }
      };
      if (b > 0.55) tree(x + 8 - Math.floor(a * 3), y + 1 + Math.floor(b * 2), true);
      tree(x + 3 + Math.floor(a * 4), y + 3 + Math.floor(b * 4), false);
    } else if (k === T_PEAK) {
      const px = x + Math.floor(a * 3), hgt = 8 + Math.floor(b * 6), snow = hgt > 11 || north(tx, ty) > 0.62;
      for (let i = 0; i < hgt; i++) { const half = Math.ceil(i * 0.55); R(px + 4 - half, y + 7 - hgt + i, half, 1, i % 4 === 3 ? '#9a9486' : '#aaa496'); R(px + 4, y + 7 - hgt + i, half + 1, 1, i % 3 === 2 ? '#5d584e' : '#6b665c'); }
      if (snow) { R(px + 3, y + 7 - hgt, 2, 2, '#f2efe6'); R(px + 2, y + 9 - hgt, 2, 1, '#f2efe6'); R(px + 4, y + 9 - hgt, 2, 1, '#d8d4c8'); }
    }
  }
  return (prov.land = cv);
}

// ---------- the column on the move ----------
function provPath(x0, y0, x1, y1) {
  const L = wildLand(), w = WILD.TW, hgt = WILD.TH, a = Math.floor(y0 / 10) * w + Math.floor(x0 / 10), b = Math.floor(y1 / 10) * w + Math.floor(x1 / 10);
  if (L.t[b] >= T_WATER || a === b) return a === b ? [{ x: x1, y: y1 }] : null;
  const from = new Int32Array(w * hgt).fill(-1), q = [a];
  from[a] = a;
  for (let i = 0; i < q.length && from[b] < 0; i++) {
    const c = q[i], cx = c % w, cy = (c - cx) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx, ny = cy + dy, n = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= hgt || L.t[n] >= T_WATER || from[n] >= 0) continue;
      if (dx && dy && (L.t[cy * w + nx] >= T_WATER || L.t[ny * w + cx] >= T_WATER)) continue;
      from[n] = c; q.push(n);
    }
  }
  if (from[b] < 0) return null;
  const pts = [{ x: x1, y: y1 }];
  for (let c = from[b]; c !== a; c = from[c]) pts.push({ x: (c % w) * 10 + 5, y: Math.floor(c / w) * 10 + 5 });
  return pts.reverse();
}
function provClick(cv, e) {
  if (!G.field) return;
  const r = cv.getBoundingClientRect(), u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
  const x = prov.big ? u * WILD.W : prov.camX + u * PROV.VW, y = prov.big ? v * WILD.H : prov.camY + v * PROV.VH;
  const p = provPath(G.field.x, G.field.y, x, y);
  if (p) { prov.path = p; prov.big = false; } else prov.hint = performance.now() + 1600;
}

function provStep(dt) {
  const F = G.field, k = vil.keys, kx = (k.r ? 1 : 0) - (k.l ? 1 : 0), ky = (k.d ? 1 : 0) - (k.u ? 1 : 0);
  const x0 = F.x, y0 = F.y, sp = PROV.SPEED * wildPace(F.x, F.y) * dt;
  if (kx || ky) {
    prov.path = null;
    const n = Math.hypot(kx, ky), dx = kx / n * sp, dy = ky / n * sp;
    if (wildWalk(F.x + dx, F.y)) F.x += dx;
    if (wildWalk(F.x, F.y + dy)) F.y += dy;
    prov.face = faceOf(kx, ky, prov.face);
  } else if (prov.path) {
    let left = sp;
    while (prov.path.length && left > 0) {
      const t = prov.path[0], dx = t.x - F.x, dy = t.y - F.y, d = Math.hypot(dx, dy);
      prov.face = faceOf(dx, dy, prov.face);
      if (d <= left) { F.x = t.x; F.y = t.y; left -= d; prov.path.shift(); } else { F.x += dx / d * left; F.y += dy / d * left; left = 0; }
    }
    if (!prov.path.length) prov.path = null;
  }
  const moved = Math.hypot(F.x - x0, F.y - y0);
  prov.moving = moved > 0.01;
  if (prov.moving) {
    prov.walk += dt * 10;
    const last = prov.trail[0];
    if (!last || Math.hypot(last.x - F.x, last.y - F.y) > 5) { prov.trail.unshift({ x: F.x, y: F.y }); if (prov.trail.length > 16) prov.trail.pop(); }
    const knew = prov.known;
    wildReveal(F.x, F.y);
    prov.known = Object.keys(wildMap().seen).length;
    if (knew !== undefined && prov.known > knew) SFX.ui('discover');
    prov.stepT = (prov.stepT || 0) - dt; if (prov.stepT <= 0) { prov.stepT = 0.34; SFX.ui('march'); }
  }
  // roaming bands: they wander their own ground; outlaws come for you if you stray close
  for (const p of F.packs) {
    const near = Math.hypot(p.x - F.x, p.y - F.y);
    if (p.kind === 'patrol' && near < 95) { p.tx = F.x; p.ty = F.y; p.wait = 0; }
    else if (p.wait > 0) { p.wait -= dt; continue; }
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), s = (p.kind === 'wolves' ? 34 : near < 95 ? 52 : 24) * dt;
    if (d < 2) { p.tx = clamp(p.hx + rand(-70, 70), 20, WILD.W - 20); p.ty = clamp(p.hy + rand(-70, 70), 20, WILD.H - 20); p.wait = rand(1, 5); continue; }
    const nx = p.x + dx / d * Math.min(s, d), ny = p.y + dy / d * Math.min(s, d);
    if (wildWalk(nx, ny)) { p.x = nx; p.y = ny; p.face = faceOf(dx, dy, p.face || 'down'); p.walk = (p.walk || 0) + dt * 9; } else { p.tx = p.x; p.ty = p.y; }
  }
  if (G.pendingEvent || F.fight) return;
  const town = Math.hypot(F.x - WILD.TOWN.x, F.y - WILD.TOWN.y);
  if (town > 44) F.armed = true;
  if (town < 15 && F.armed) { provHome(); return; }
  const pack = F.packs.find(p => Math.hypot(p.x - F.x, p.y - F.y) < 12);
  if (pack && fieldParty().length) {
    wildFight(pack.kind === 'wolves' ? 'A wolf pack' : 'An outlaw patrol', pack.kind === 'wolves' ? wildBeasts(Math.min(pack.tier, 2), pack.tier > 2 ? ['wolf', 'wolf'] : []) : wildMen(pack.tier, Math.max(2, wildCount(pack.tier) - 2)), 'forest', 'pack', { tier: pack.tier, pack: pack.id });
    prov.path = null; villageStill(); startWildFight();
    return;
  }
  const here = wildSites().find(s => Math.hypot(s.x - F.x, s.y - F.y) < 13);
  if (here && F.at !== here.id) { F.at = here.id; if (wildVisit(here)) { prov.path = null; villageStill(); save(); showEvent(); return; } }
  else if (!here) F.at = null;
  if (moved && wildWalked(moved)) { prov.path = null; villageStill(); save(); showEvent(); }
}
// Back through the gate.
function provHome() {
  prov.path = null; prov.trail = []; villageStill();
  wildLeave();
  vil.x = 566; vil.y = 73; vil.at = null; vil.path = null; vil.face = 'left';
  SFX.music('ludus');
  render();
  if (G.pendingEvent) showEvent();
}

// ---------- what is known of a place ----------
const SITE_WHAT = {
  lair: 'Beasts live here. A fight.', camp: 'Outlaws. A fight, and what they have stolen.', ruin: 'Old stones. There may be something left, or something waiting.',
  shrine: 'A god keeps this place.', hermit: 'A man who lives alone, and knows the country.', hamlet: 'A few families who want no trouble.', healer: 'She mends what the road has done.',
  merchant: 'He buys and sells, far from any market.', quarry: 'Where men are worked to death.', slavers: 'Men who deal in people. A hard fight.', vow: 'A promise made is kept here.',
  master: 'An old fighter keeps bees here.', deserter: 'He served under the eagle.', battlefield: 'Where the Seventeenth died.', chief: 'The outlaw king\'s own hold. The hardest fight in the province.',
  barrow: 'A king lies here, and does not lie easy.', cache: 'Something is buried here.', herb: 'It grows nowhere else.',
};
const SITE_QUIET = ['shrine', 'hermit', 'hamlet', 'healer', 'merchant', 'cache', 'herb', 'deserter', 'quarry', 'vow', 'master'];
// Skulls of danger: nought for a place where nobody will fight you.
function siteDanger(s) {
  if (!siteLive(s) || SITE_QUIET.includes(s.kind)) return 0;
  return s.kind === 'chief' || s.kind === 'barrow' ? 5 : s.kind === 'slavers' ? 3 : s.kind === 'battlefield' ? 4 : s.tier;
}
const siteKnown = s => (!!wildMap().marks[s.id] && !siteDone(s)) || (!!wildMap().seen[s.id] && siteShown(s));
const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
const wayTo = (x, y) => { const F = G.field, d = Math.hypot(x - F.x, y - F.y); return d < 40 ? 'close by' : `${Math.max(1, Math.round(d / 100))} mile${Math.round(d / 100) > 1 ? 's' : ''} ${COMPASS[Math.round(Math.atan2(y - F.y, x - F.x) / (Math.PI / 4) + 8) % 8]}`; };
// Whatever the mouse is resting on: a known place, the town, or nothing.
function provHover() {
  const m = prov.mouse, F = G.field;
  if (!m || !F) return null;
  const x = prov.big ? m.u * WILD.W : prov.camX + m.u * PROV.VW, y = prov.big ? m.v * WILD.H : prov.camY + m.v * PROV.VH, reach = prov.big ? 46 : 15;
  let best = null, bd = reach;
  for (const st of wildSites()) { if (!siteKnown(st)) continue; const d = Math.hypot(st.x - x, st.y - y); if (d < bd) { bd = d; best = st; } }
  if (!best && Math.hypot(WILD.TOWN.x - x, WILD.TOWN.y - y) < reach + 8) return { home: true, x: WILD.TOWN.x, y: WILD.TOWN.y };
  return best;
}
// A small card by the mouse. u is the size of one unit of text (1 on the close view, 2 on the whole map).
function provCard(ctx, px, py, lines, skulls, u, W, H) {
  ctx.font = `bold ${6 * u}px Consolas, monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const w = Math.max(...lines.map(l => ctx.measureText(l[0]).width), skulls * 6 * u) + 8 * u, h = (lines.length * 8 + (skulls ? 8 : 0) + 4) * u;
  const x = Math.round(clamp(px + 10 * u, 2, W - w - 2)), y = Math.round(clamp(py - h - 6 * u, 2, H - h - 2));
  ctx.fillStyle = 'rgba(16,10,6,.92)'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#e0aa3e'; ctx.fillRect(x, y, w, u); ctx.fillRect(x, y + h - u, w, u);
  lines.forEach(([t, c], i) => { ctx.fillStyle = c; ctx.fillText(t, x + 4 * u, y + (8 + i * 8) * u); });
  for (let i = 0; i < skulls; i++) { const sx = x + 4 * u + i * 6 * u, sy = y + (lines.length * 8 + 3) * u; ctx.fillStyle = '#e2695c'; ctx.fillRect(sx, sy, 5 * u, 4 * u); ctx.fillRect(sx + u, sy + 4 * u, 3 * u, 2 * u); ctx.fillStyle = '#2a1a0c'; ctx.fillRect(sx + u, sy + u, u, u); ctx.fillRect(sx + 3 * u, sy + u, u, u); }
}
function hoverLines(hv) {
  if (hv.home) return [[['HOME', '#f5d584'], ['Walk in at the gate to go home.', '#f2e6cc'], [wayTo(hv.x, hv.y).toUpperCase(), '#a8947a']], 0];
  const done = siteDone(hv), mark = wildMap().marks[hv.id] && !done, dz = siteDanger(hv);
  const lines = [[hv.name.toUpperCase(), mark ? '#f5d584' : '#f2e6cc']];
  if (done) lines.push(['Dealt with.', '#a8947a']);
  else { lines.push([SITE_WHAT[hv.kind] || '', '#d8c8a8']); if (mark) lines.push(['Marked: something sent you here.', '#f5d584']); if (!dz) lines.push(['No danger known.', '#9fce86']); }
  lines.push([wayTo(hv.x, hv.y).toUpperCase() + '  -  CLICK TO WALK THERE', '#a8947a']);
  return [lines, done ? 0 : dz];
}

// ---------- drawing ----------
function provIcon(ctx, s, T, done) {
  const R = (x, y, w, h, c) => { ctx.fillStyle = done ? shade('#8a8478', 0.6 + ((x + y) % 3) * 0.12) : c; ctx.fillRect(Math.round(s.x + x), Math.round(s.y + y), w, h); };
  const hut = (ox, oy) => { R(ox - 4, oy - 3, 8, 5, '#d9c9a0'); R(ox - 5, oy - 6, 10, 3, '#8a5a32'); R(ox - 4, oy - 7, 8, 1, '#a8703c'); R(ox - 1, oy - 1, 2, 3, '#3a2416'); };
  const tent = (ox, oy, c) => { for (let i = 0; i < 6; i++) R(ox - i, oy - 6 + i, i * 2 + 1, 1, i % 4 < 2 ? c : shade(c, 0.85)); R(ox - 1, oy - 2, 2, 3, '#2a1d12'); };
  R(-7, 3, 15, 2, 'rgba(0,0,0,.22)');
  const k = s.kind;
  if (k === 'lair') { R(-7, -5, 14, 9, '#77705f'); R(-6, -7, 11, 2, '#8f8a78'); R(-3, -3, 7, 7, '#1a1410'); R(-2, -4, 5, 1, '#1a1410'); R(4, 2, 2, 1, '#efe8d8'); }
  else if (k === 'camp' || k === 'slavers') { tent(-4, 3, k === 'camp' ? '#b8a880' : '#a05a48'); tent(4, 4, k === 'camp' ? '#a89868' : '#8a4a3a'); R(0, 2, 2, 2, '#e2702a'); R(0, 1, 1, 1, '#f5c04a'); if (k === 'slavers') { R(7, -8, 1, 8, '#3a2a1c'); R(8, -8, 4, 3, '#8a2a20'); } }
  else if (k === 'chief') { for (let i = -8; i <= 7; i += 3) { R(i, -4 + ((i + 8) % 6 ? 0 : -1), 2, 8, '#6b4f2c'); R(i, -5 + ((i + 8) % 6 ? 0 : -1), 2, 1, '#8a6a3a'); } R(-3, -1, 6, 5, '#2a1d12'); R(-1, -11, 1, 7, '#3a2a1c'); R(0, -11, 5, 3, '#8a2a20'); }
  else if (k === 'ruin' || k === 'battlefield') { R(-6, -6, 3, 9, '#c9c3ae'); R(-7, -7, 5, 1, '#e4dfcd'); R(1, -2, 3, 5, '#c9c3ae'); R(5, -4, 3, 7, '#b5af9b'); R(-2, 2, 6, 2, '#b5af9b'); if (k === 'battlefield') { R(-1, -10, 1, 9, '#5a4326'); R(0, -10, 4, 3, '#7e241c'); R(-5, 4, 3, 1, '#efe8d8'); } }
  else if (k === 'barrow') { for (let i = 0; i < 6; i++) R(-9 + i, -1 - i, 18 - i * 2, 1, i < 2 ? '#5f7f3f' : '#6f8f48'); R(-9, 0, 18, 3, '#5f7f3f'); R(-2, -1, 4, 4, '#1a1410'); R(-3, -2, 6, 1, '#c9c3ae'); for (const ox of [-11, -7, 7, 10]) R(ox, 1, 2, 4, '#a8a290'); }
  else if (k === 'shrine' || k === 'vow') { R(-5, 1, 10, 3, '#d6d0bd'); R(-4, -5, 2, 6, '#f1ecdc'); R(2, -5, 2, 6, '#f1ecdc'); R(-5, -7, 10, 2, '#d9d2bd'); R(-1, -2, 2, 2, '#e2702a'); R(-1, -3, 1, 1, '#f5c04a'); }
  else if (k === 'hamlet') { hut(-5, 2); hut(5, 3); hut(0, -3); }
  else if (k === 'merchant') { R(-6, -2, 7, 4, '#8a6a4a'); R(-7, -4, 3, 3, '#8a6a4a'); R(-5, 2, 1, 2, '#5a4326'); R(-1, 2, 1, 2, '#5a4326'); R(-4, -5, 5, 3, '#c9a25a'); R(3, -5, 3, 6, '#7a2a8a'); R(3, -8, 3, 3, '#d9a57c'); }
  else if (k === 'quarry') { R(-8, -6, 16, 10, '#b8b2a0'); R(-6, -4, 12, 8, '#e8e4d8'); R(-6, 0, 12, 1, '#b8b2a0'); R(-2, -4, 1, 8, '#b8b2a0'); R(3, -1, 4, 3, '#f8f6ee'); }
  else if (k === 'cache') { for (let i = -4; i <= 4; i++) { R(i, i, 2, 2, '#8a2a20'); R(i, -i, 2, 2, '#8a2a20'); } }
  else if (k === 'herb') { R(-1, -2, 2, 6, '#3f6a2a'); R(-4, -5, 3, 3, '#7fbf6a'); R(1, -6, 3, 3, '#7fbf6a'); R(-1, -8, 2, 2, '#c9e8a0'); }
  else hut(0, 2);                                                         // hermit, healer, the old soldier, the beekeeper
  if (done) { ctx.fillStyle = '#2a1a0c'; ctx.fillRect(Math.round(s.x - 6), Math.round(s.y - 1), 13, 1); }
}

function drawProvince(cv, T) {
  if (prov.big) return drawOverview(cv, T);
  const F = G.field, ctx = cv.getContext('2d'), S = PROV.S;
  const camX = prov.camX = clamp(Math.round(F.x - PROV.VW / 2), 0, WILD.W - PROV.VW), camY = prov.camY = clamp(Math.round(F.y - PROV.VH / 2), 0, WILD.H - PROV.VH);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(provLand(), camX, camY, PROV.VW, PROV.VH, 0, 0, PROV.VW * S, PROV.VH * S);
  ctx.setTransform(S, 0, 0, S, -camX * S, -camY * S);
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const inView = (x, y, m) => x > camX - m && x < camX + PROV.VW + m && y > camY - m && y < camY + PROV.VH + m;
  const M = wildMap();

  // water moves a little
  for (let i = 0; i < 40; i++) { const x = camX + ((i * 97 + Math.floor(T * 8)) % PROV.VW), y = camY + (i * 53) % PROV.VH; if (wildTile(x, y) === T_WATER) R(x, y, 3, 1, 'rgba(214,236,248,.55)'); }

  // the town, with its gate facing you
  const tx = WILD.TOWN.x, ty = WILD.TOWN.y;
  if (inView(tx, ty, 40)) {
    R(tx - 17, ty + 8, 36, 3, 'rgba(0,0,0,.25)'); R(tx - 18, ty - 12, 36, 21, '#b8ab94'); R(tx - 18, ty - 12, 36, 2, '#d8cdb6'); R(tx - 18, ty + 7, 36, 2, '#8f846e');
    for (let i = -18; i < 18; i += 4) R(tx + i, ty - 14, 2, 2, '#d8cdb6');
    R(tx - 14, ty - 8, 9, 6, '#b5522e'); R(tx - 3, ty - 9, 10, 7, '#a8482a'); R(tx + 9, ty - 7, 6, 5, '#b5522e'); R(tx - 12, ty, 8, 5, '#d8c9a2'); R(tx + 2, ty, 9, 5, '#e2c98f');
    R(tx + 14, ty - 5, 5, 9, '#8f846e'); R(tx + 15, ty - 2, 4, 6, '#3a2416'); R(tx + 15, ty - 9, 1, 5, '#5a4326'); R(tx + 16, ty - 9, 4, 3, '#a02d22');
  }
  // places: the ones you have come upon, and anything a clue has marked
  const sites = wildSites();
  for (const s of sites) { if (!inView(s.x, s.y, 30) || !siteShown(s) || !wildSeen(s.x, s.y)) continue; provIcon(ctx, s, T, siteDone(s)); }
  // roaming bands
  for (const p of F.packs) {
    if (!inView(p.x, p.y, 20) || !wildSeen(p.x, p.y)) continue;
    if (p.kind === 'wolves') for (const [ox, oy] of [[0, 0], [-7, 3], [6, 4]]) { const b = Math.sin((p.walk || 0) + ox) > 0 ? 1 : 0; R(p.x + ox - 4, p.y + oy - 1, 8, 2, 'rgba(0,0,0,.25)'); R(p.x + ox - 4, p.y + oy - 5, 7, 3, '#77777a'); R(p.x + ox + (p.face === 'left' ? -6 : 3), p.y + oy - 6, 3, 3, '#8a8a8e'); R(p.x + ox - 3, p.y + oy - 2, 1, 2 - b, '#55555a'); R(p.x + ox + 2, p.y + oy - 2, 1, 1 + b, '#55555a'); }
    else for (const [ox, oy, c] of [[0, 0, '#6a3a2a'], [-7, 3, '#4a4a3a'], [7, 2, '#5a3a3a']]) vilPerson(ctx, p.x + ox, p.y + oy, { face: p.face || 'down', walk: (p.walk || 0) + ox, moving: true, tunic: c, hair: '#2a1c14' });
    R(p.x - 1, p.y - 22, 3, 3, '#c23b2e'); R(p.x, p.y - 18, 1, 1, '#c23b2e');
  }
  // the column: the men strung out behind, the mule cart last, you in front
  const men = G.roster.filter(g => !g.away).slice(0, 4), tr = prov.trail;
  const cart = tr[Math.min(tr.length - 1, 4 + men.length * 2)] || { x: F.x - 14, y: F.y };
  const folk = [];
  if (tr.length > 3) folk.push({ y: cart.y, draw: () => { R(cart.x - 6, cart.y + 1, 13, 2, 'rgba(0,0,0,.25)'); R(cart.x - 5, cart.y - 6, 10, 5, '#8a6a3a'); R(cart.x - 5, cart.y - 7, 10, 1, '#a8834a'); R(cart.x - 4, cart.y - 10, 8, 3, '#d9c9a0'); R(cart.x - 5, cart.y - 1, 3, 3, '#3a2a1c'); R(cart.x + 2, cart.y - 1, 3, 3, '#3a2a1c'); } });
  men.forEach((g, i) => { const p = tr[Math.min(tr.length - 1, 2 + i * 2)]; if (p) folk.push({ y: p.y, draw: () => vilPerson(ctx, p.x + (i % 2 ? 3 : -3), p.y, { face: prov.face, walk: prov.walk + i * 1.7, moving: prov.moving, tunic: g.injury > 0 ? '#8a8a8a' : '#c23b2e', hair: g.look.hair, skin: g.look.skin }) }); });
  folk.push({ y: F.y + 0.1, draw: () => vilPerson(ctx, F.x, F.y, { face: prov.face, walk: prov.walk, moving: prov.moving, tunic: '#f1ead8', stripe: '#7a2a8a', hair: '#4a3320', laurel: true }) });
  folk.sort((a, b) => a.y - b.y).forEach(f => f.draw());
  if (prov.path && prov.path.length) {         // the way he means to go, dotted, and a mark where it ends
    const e = prov.path[prov.path.length - 1];
    for (let i = 1; i < prov.path.length - 1; i += 2) R(prov.path[i].x - 1, prov.path[i].y - 1, 2, 2, 'rgba(245,213,132,.75)');
    ctx.globalAlpha = 0.5 + 0.4 * Math.sin(T * 6); R(e.x - 3, e.y - 1, 7, 2, '#f5d584'); R(e.x - 1, e.y - 3, 2, 7, '#f5d584'); ctx.globalAlpha = 1;
  }
  // smoke from the town's hearths, and from any camp you can see
  const smoke = (sx, sy, n) => { for (let i = 0; i < n; i++) { const q = (T * 0.28 + i / n) % 1; ctx.globalAlpha = 0.5 * (1 - q); R(sx + Math.sin(q * 5 + i) * 3 + q * 6, sy - q * 22, 3 + Math.round(q * 3), 2 + Math.round(q * 2), '#d8d4cc'); } ctx.globalAlpha = 1; };
  if (inView(tx, ty, 60)) { smoke(tx - 9, ty - 10, 4); smoke(tx + 6, ty - 11, 3); }
  for (const s of sites) if ((s.kind === 'camp' || s.kind === 'chief' || s.kind === 'slavers' || s.kind === 'hamlet') && inView(s.x, s.y, 40) && wildSeen(s.x, s.y) && siteShown(s) && !siteDone(s)) smoke(s.x, s.y - 4, 3);
  // birds over the country, and the shadows of clouds going by
  for (let i = 0; i < 5; i++) {
    const bx = ((i * 613 + T * (18 + i * 3)) % (WILD.W + 300)) - 150, by = (i * 397) % WILD.H + Math.sin(T * 0.7 + i) * 30;
    if (inView(bx, by, 20)) { const flap = Math.sin(T * 9 + i) > 0 ? 1 : 0; R(bx - 3, by - flap, 3, 1, '#2a2118'); R(bx + 1, by - flap, 3, 1, '#2a2118'); R(bx, by + 1 - flap, 1, 1, '#2a2118'); }
  }
  for (let i = 0; i < 7; i++) {
    const cx = ((i * 431 + T * 7) % (WILD.W + 600)) - 300, cy = (i * 271 + 90) % WILD.H, rx = 70 + (i % 3) * 30, ry = 26 + (i % 4) * 8;
    if (!inView(cx, cy, rx + 10)) continue;
    ctx.fillStyle = 'rgba(20,24,40,.075)';
    for (let yy = -ry; yy <= ry; yy += 3) { const hw = Math.round(rx * Math.sqrt(1 - (yy * yy) / (ry * ry))); ctx.fillRect(Math.round(cx - hw), Math.round(cy + yy), hw * 2, 3); }
  }

  // fog: parchment over whatever you have not walked, with a faint sketch of what the old maps say is there
  const Fg = WILD.FOG, L = wildLand(), ink = '#6b5334';
  for (let fy = Math.floor(camY / Fg); fy <= Math.floor((camY + PROV.VH) / Fg); fy++) for (let fx = Math.floor(camX / Fg); fx <= Math.floor((camX + PROV.VW) / Fg); fx++) {
    if (fogAt(fx, fy)) continue;
    const cl = fogAt(fx - 1, fy), cr = fogAt(fx + 1, fy), cu = fogAt(fx, fy - 1), cd = fogAt(fx, fy + 1), x = fx * Fg, y = fy * Fg, v = wildHash(fx, fy, 7);
    ctx.fillStyle = v > 0.66 ? '#d9c8a0' : v > 0.33 ? '#d7c59c' : '#d5c299';
    if (!(cl || cr || cu || cd)) {
      ctx.fillRect(x, y, Fg, Fg);
      if (v > 0.8) R(x + Math.floor(v * 97) % 14, y + Math.floor(v * 53) % 14, 5, 1, '#cdb98f');
      ctx.globalAlpha = 0.4;
      const k = L.t[Math.min(WILD.TH - 1, fy * 2 + 1) * WILD.TW + Math.min(WILD.TW - 1, fx * 2 + 1)];
      if (k === T_FOREST) { R(x + 9, y + 6, 1, 8, ink); R(x + 6, y + 7, 7, 1, ink); R(x + 7, y + 5, 5, 1, ink); R(x + 8, y + 9, 3, 1, ink); }
      else if (k === T_PEAK || k === T_HILL) { for (let i = 0; i < 5; i++) { R(x + 5 + i, y + 13 - i * (k === T_PEAK ? 2 : 1), 1, 1, ink); R(x + 14 - i, y + 13 - i * (k === T_PEAK ? 2 : 1), 1, 1, ink); } }
      else if (k === T_WATER) { R(x + 3, y + 8, 5, 1, ink); R(x + 8, y + 9, 5, 1, ink); R(x + 5, y + 13, 5, 1, ink); }
      else if (k === T_MARSH) { R(x + 4, y + 10, 4, 1, ink); R(x + 11, y + 12, 4, 1, ink); R(x + 6, y + 6, 1, 4, ink); }
      else if (k === T_ROAD) { R(x + 2, y + 9, 3, 1, ink); R(x + 8, y + 9, 3, 1, ink); R(x + 14, y + 9, 3, 1, ink); }
      ctx.globalAlpha = 1;
      continue;
    }
    // at the edge of what you have walked the parchment frays: each quarter of the square is whole, half or nearly gone
    for (let qy = 0; qy < 2; qy++) for (let qx = 0; qx < 2; qx++) {
      const open = (qx ? cr : cl ? 1 : 0) + (qy ? cd : cu ? 1 : 0), X = x + qx * 10, Y = y + qy * 10;
      if (!open) { ctx.fillRect(X, Y, 10, 10); continue; }
      for (let py = 0; py < 10; py += 2) for (let px = 0; px < 10; px += 2) {
        const near = Math.min(qx ? (cr ? 8 - px : 99) : (cl ? px : 99), qy ? (cd ? 8 - py : 99) : (cu ? py : 99));       // how far in from the open side
        if (wildHash(X + px, Y + py, 3) * 9 < near + (open > 1 ? -1 : 1.5)) ctx.fillRect(X + px, Y + py, 2, 2);
      }
    }
  }
  ctx.globalAlpha = 1;

  // names, and marks that show even through the fog
  ctx.font = 'bold 6px Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  // a name on the map, with a red pip for each skull of danger
  const tag = (x, y, text, col, bg, pips) => { const tw = Math.ceil(ctx.measureText(text).width), w = tw + 6 + (pips ? pips * 5 + 2 : 0); R(x - w / 2, y - 7, w, 9, bg || 'rgba(24,16,10,.82)'); ctx.textAlign = 'left'; ctx.fillStyle = col || '#f2e6cc'; ctx.fillText(text, x - w / 2 + 3, y); ctx.textAlign = 'center'; for (let i = 0; i < (pips || 0); i++) { R(x - w / 2 + tw + 6 + i * 5, y - 5, 4, 4, '#e2695c'); R(x - w / 2 + tw + 7 + i * 5, y - 2, 2, 2, '#e2695c'); R(x - w / 2 + tw + 7 + i * 5, y - 4, 1, 1, '#2a1a0c'); R(x - w / 2 + tw + 9 + i * 5, y - 4, 1, 1, '#2a1a0c'); } };
  if (inView(tx, ty, 60)) tag(tx, ty - 18, 'HOME', '#2a1a0c', '#f5d584');
  for (const s of sites) {
    if (!inView(s.x, s.y, 40)) continue;
    const seen = wildSeen(s.x, s.y), mark = M.marks[s.id] && !siteDone(s);
    if (mark) { const b = Math.round(Math.sin(T * 5) * 2); ctx.globalAlpha = 0.9; R(s.x - 1, s.y - 26 + b, 3, 7, '#f5d584'); R(s.x - 1, s.y - 17 + b, 3, 2, '#f5d584'); ctx.globalAlpha = 1; if (!seen) for (let i = -3; i <= 3; i++) { R(s.x + i, s.y + i, 2, 2, '#8a2a20'); R(s.x + i, s.y - i, 2, 2, '#8a2a20'); } }
    if (!(seen && siteShown(s)) && !mark) continue;
    const near = Math.hypot(s.x - F.x, s.y - F.y) < 90;
    if (siteDone(s)) { if (near) tag(s.x, s.y + 16, s.name.toUpperCase() + ' - DONE', '#a8947a'); continue; }
    if (near || mark) tag(s.x, s.y + 16, s.name.toUpperCase(), mark ? '#f5d584' : '#f2e6cc', null, siteDanger(s));
  }
  // the regions' names, written across the country in old ink
  ctx.font = 'bold 11px Cinzel, Georgia, serif'; ctx.fillStyle = 'rgba(70,48,24,.42)';
  for (const r of WILD_REGIONS) if (inView(r.x, r.y, 120)) ctx.fillText(r.name.toUpperCase(), r.x, r.y);

  // on the glass: where you are, and how to move
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.font = 'bold 7px Consolas, monospace'; ctx.textAlign = 'left';
  const where = wildRegion(F.x, F.y).toUpperCase(), ww = Math.ceil(ctx.measureText(where).width), danger = wildTier(F.x, F.y);
  ctx.fillStyle = 'rgba(24,16,10,.8)'; ctx.fillRect(4, 4, ww + 14 + danger * 6, 12);
  ctx.fillStyle = '#f2e6cc'; ctx.fillText(where, 9, 13);
  for (let i = 0; i < danger; i++) { ctx.fillStyle = '#e2695c'; ctx.fillRect(ww + 14 + i * 6, 7, 5, 4); ctx.fillRect(ww + 15 + i * 6, 11, 3, 2); ctx.fillStyle = '#2a1a0c'; ctx.fillRect(ww + 15 + i * 6, 8, 1, 1); ctx.fillRect(ww + 17 + i * 6, 8, 1, 1); }
  // at the edge of the view: which way home is, and which way to anything a clue has marked
  ctx.font = 'bold 6px Consolas, monospace'; ctx.textAlign = 'center';
  const point = (wx, wy, label, col, bg) => {
    if (wx > camX + 10 && wx < camX + PROV.VW - 10 && wy > camY + 10 && wy < camY + PROV.VH - 10) return;
    const cx = PROV.VW / 2, cy = PROV.VH / 2, dx = wx - (camX + cx), dy = wy - (camY + cy), k = Math.min((cx - 26) / Math.abs(dx || 0.01), (cy - 22) / Math.abs(dy || 0.01));
    const px = Math.round(cx + dx * k), py = Math.round(cy + dy * k), d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d, w = Math.ceil(ctx.measureText(label).width) + 6;
    ctx.fillStyle = bg; ctx.fillRect(px - w / 2, py - 5, w, 9);
    for (let i = 0; i < 5; i++) ctx.fillRect(Math.round(px + ux * (w / 2 + 1 + i) - (4 - i) * Math.abs(uy)), Math.round(py + uy * (6 + i) - (4 - i) * Math.abs(ux)), 1 + Math.round((4 - i) * 2 * Math.abs(uy)), 1 + Math.round((4 - i) * 2 * Math.abs(ux)));
    ctx.fillStyle = col; ctx.fillText(label, px, py + 2);
  };
  for (const s of sites) if (M.marks[s.id] && !siteDone(s) && siteLive(s)) point(s.x, s.y, s.kind === 'cache' ? 'DIG' : s.kind === 'herb' ? 'HERB' : QUEST_SITE[s.kind] ? 'JOURNEY' : ['deserter', 'battlefield', 'chief', 'barrow'].includes(s.kind) ? 'EAGLE' : 'MARKED', '#2a1a0c', '#f5d584');
  point(tx, ty, 'HOME', '#2a1a0c', '#f1ead8');
  // whatever the mouse is on says what it is
  const hv = provHover();
  if (hv) {
    const [lines, sk] = hoverLines(hv), hx = hv.x - camX, hy = hv.y - camY;
    ctx.strokeStyle = 'rgba(245,213,132,.8)'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(hx) - 11.5, Math.round(hy) - 12.5, 23, 20);
    provCard(ctx, hx, hy - 8, lines, sk, 1, PROV.VW, PROV.VH);
    ctx.font = 'bold 6px Consolas, monospace'; ctx.textAlign = 'center';
  }
  // night falls when camp is made, and lifts again
  const nk = (performance.now() - prov.night) / 1700;
  if (nk >= 0 && nk < 1) {
    const a = Math.sin(nk * Math.PI);
    ctx.fillStyle = `rgba(8,10,30,${(a * 0.86).toFixed(3)})`; ctx.fillRect(0, 0, PROV.VW, PROV.VH);
    const fx = F.x - camX + 10, fy = F.y - camY + 2, fl = Math.sin(T * 14) > 0 ? 1 : 0;
    ctx.globalAlpha = a;
    for (let i = 0; i < 5; i++) { ctx.fillStyle = `rgba(255,150,60,${(0.07).toFixed(3)})`; ctx.fillRect(fx - 26 + i * 4, fy - 20 + i * 3, 52 - i * 8, 34 - i * 6); }
    ctx.fillStyle = '#3a2a1c'; ctx.fillRect(fx - 4, fy, 8, 2); ctx.fillStyle = '#e2702a'; ctx.fillRect(fx - 2, fy - 5 - fl, 4, 5 + fl); ctx.fillStyle = '#f5c04a'; ctx.fillRect(fx - 1, fy - 3 - fl, 2, 3);
    ctx.font = 'bold 12px Cinzel, Georgia, serif'; ctx.fillStyle = '#e8dcc0'; ctx.fillText('NIGHT', PROV.VW / 2, 40);
    ctx.globalAlpha = 1; ctx.font = 'bold 7px Consolas, monospace';
  }
  ctx.textAlign = 'center'; ctx.font = 'bold 7px Consolas, monospace';
  const tip = prov.hint > performance.now() ? 'YOU CANNOT WALK THERE' : town(F) < 60 ? 'W A S D OR CLICK TO WALK  -  M FOR THE WHOLE MAP  -  WALK BACK INTO THE TOWN TO GO HOME' : '';
  if (tip) { const w = Math.ceil(ctx.measureText(tip).width) + 12; ctx.fillStyle = 'rgba(24,16,10,.8)'; ctx.fillRect(PROV.VW / 2 - w / 2, PROV.VH - 18, w, 12); ctx.fillStyle = '#f5d584'; ctx.fillText(tip, PROV.VW / 2, PROV.VH - 9); }
}
const town = F => Math.hypot(F.x - WILD.TOWN.x, F.y - WILD.TOWN.y);

// The whole province on the table: everything you have walked, everything marked, and a click to set out for it.
function drawOverview(cv, T) {
  const F = G.field, ctx = cv.getContext('2d'), M = wildMap(), k = cv.width / WILD.W, Fg = WILD.FOG;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true;
  ctx.drawImage(provLand(), 0, 0, WILD.W, WILD.H, 0, 0, cv.width, cv.height);
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  for (let fy = 0; fy < WILD.FH; fy++) for (let fx = 0; fx < WILD.FW; fx++) if (!fogAt(fx, fy)) R(fx * Fg, fy * Fg, Fg + 1, Fg + 1, wildHash(fx, fy, 7) > 0.5 ? '#d9c8a0' : '#d5c299');
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 34px Cinzel, Georgia, serif'; ctx.fillStyle = 'rgba(70,48,24,.5)';
  for (const r of WILD_REGIONS) ctx.fillText(r.name.toUpperCase(), r.x, r.y);
  if (prov.path) for (let i = 1; i < prov.path.length; i += 2) R(prov.path[i].x - 3, prov.path[i].y - 3, 6, 6, '#f5d584');
  const dot = (x, y, r, c) => { R(x - r - 3, y - r - 3, r * 2 + 6, r * 2 + 6, '#1a110c'); R(x - r, y - r, r * 2, r * 2, c); };
  // how far from home the country turns worse: a dotted ring for each skull
  const tx = WILD.TOWN.x, ty = WILD.TOWN.y;
  [330, 600, 900, 1250].forEach((rad, n) => {
    for (let a = 0; a < 360; a += rad < 500 ? 4 : 2) { const x = tx + Math.cos(a * Math.PI / 180) * rad, y = ty + Math.sin(a * Math.PI / 180) * rad; if (x > 0 && y > 0 && x < WILD.W && y < WILD.H) R(x - 2, y - 2, 5, 5, 'rgba(120,40,30,.5)'); }
    const lx = tx + rad * 0.72, ly = ty - rad * 0.72;
    if (lx < WILD.W - 60 && ly > 30) for (let q = 0; q <= n + 1; q++) { R(lx + q * 20 - 4, ly - 18, 16, 13, 'rgba(120,40,30,.75)'); R(lx + q * 20, ly - 5, 8, 5, 'rgba(120,40,30,.75)'); }
  });
  ctx.font = 'bold 20px Consolas, monospace';
  const name = (x, y, t, c) => { const w = ctx.measureText(t).width + 14; R(x - w / 2, y + 36, w, 26, 'rgba(24,16,10,.85)'); ctx.fillStyle = c; ctx.fillText(t, x, y + 55); };
  const hv = provHover();
  for (const s of wildSites()) {
    if (!siteKnown(s) && !(M.seen[s.id] && siteShown(s))) continue;
    const mark = M.marks[s.id] && !siteDone(s), unseen = mark && !M.seen[s.id];
    if (mark) { const b = Math.sin(T * 5) > 0 ? 3 : 0; ctx.strokeStyle = '#f5d584'; ctx.lineWidth = 5; ctx.strokeRect(s.x - 40 - b, s.y - 42 - b, 80 + b * 2, 74 + b * 2); }
    if (s === hv) { ctx.strokeStyle = '#fff6d8'; ctx.lineWidth = 3; ctx.strokeRect(s.x - 36, s.y - 38, 72, 66); }
    if (unseen) { for (let q = -14; q <= 14; q += 2) { R(s.x + q - 3, s.y + q - 3, 7, 7, '#8a2a20'); R(s.x + q - 3, s.y - q - 3, 7, 7, '#8a2a20'); } }
    else { ctx.save(); ctx.translate(s.x, s.y); ctx.scale(4, 4); provIcon(ctx, { x: 0, y: 0, kind: s.kind }, T, siteDone(s)); ctx.restore(); }
    if (mark) name(s.x, s.y, s.name.toUpperCase(), '#f5d584');
  }
  for (const pk of F.packs) if (wildSeen(pk.x, pk.y)) { dot(pk.x, pk.y, 5, '#c23b2e'); }
  ctx.save(); ctx.translate(tx, ty); ctx.scale(2.4, 2.4);
  R(-18, -12, 36, 21, '#b8ab94'); R(-18, -12, 36, 2, '#d8cdb6'); R(-14, -8, 9, 6, '#b5522e'); R(-3, -9, 10, 7, '#a8482a'); R(9, -7, 6, 5, '#b5522e'); R(-12, 0, 8, 5, '#d8c9a2'); R(2, 0, 9, 5, '#e2c98f'); R(14, -5, 5, 9, '#8f846e');
  ctx.restore();
  name(tx, ty, 'HOME', '#f1ead8');
  // you: a banner that stands over everything
  const fb = Math.floor(T * 2.5) % 2 ? 4 : 0;
  R(F.x - 3, F.y - 46 - fb, 6, 46 + fb, '#1a110c'); R(F.x - 1, F.y - 44 - fb, 2, 44 + fb, '#f1ead8'); R(F.x + 1, F.y - 46 - fb, 34, 22, '#1a110c'); R(F.x + 3, F.y - 44 - fb, 30, 18, '#7a2a8a'); R(F.x + 9, F.y - 39 - fb, 18, 8, '#f5d584');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // the key to the map
  const key = [['#7a2a8a', 'YOU'], ['#f5d584', 'MARKED FOR YOU'], ['#c23b2e', 'A ROAMING BAND'], ['#8a8478', 'DEALT WITH'], ['rgba(120,40,30,.9)', 'SKULLS: HOW HARD THE COUNTRY IS']];
  ctx.font = 'bold 11px Consolas, monospace'; ctx.textAlign = 'left';
  const kw = Math.max(...key.map(q => ctx.measureText(q[1]).width)) + 34;
  ctx.fillStyle = 'rgba(24,16,10,.85)'; ctx.fillRect(8, 8, kw, key.length * 16 + 10);
  key.forEach(([c, t], n) => { ctx.fillStyle = c; ctx.fillRect(16, 15 + n * 16, 10, 10); ctx.fillStyle = '#f2e6cc'; ctx.fillText(t, 32, 24 + n * 16); });
  if (hv) { const [lines, sk] = hoverLines(hv); provCard(ctx, hv.x * k, hv.y * k - 14, lines, sk, 2, cv.width, cv.height); }
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px Consolas, monospace';
  const msg = prov.hint > performance.now() ? 'YOU CANNOT WALK THERE' : 'THE PROVINCE  -  CLICK ANYWHERE TO SET OUT FOR IT  -  M TO CLOSE', w = ctx.measureText(msg).width + 24;
  ctx.fillStyle = 'rgba(24,16,10,.85)'; ctx.fillRect(cv.width / 2 - w / 2, cv.height - 34, w, 24);
  ctx.fillStyle = '#f5d584'; ctx.fillText(msg, cv.width / 2, cv.height - 17);
}

// The whole province on a hand's breadth: what you have walked, where you are, and what is marked.
function drawMini(cv) {
  const ctx = cv.getContext('2d'), L = wildLand(), M = wildMap(), F = G.field, s = 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#d7c59c'; ctx.fillRect(0, 0, cv.width, cv.height);
  for (let fy = 0; fy < WILD.FH; fy++) for (let fx = 0; fx < WILD.FW; fx++) {
    if (!fogAt(fx, fy)) continue;
    ctx.fillStyle = TILE_COL[L.t[Math.min(WILD.TH - 1, fy * 2 + 1) * WILD.TW + Math.min(WILD.TW - 1, fx * 2 + 1)]];
    ctx.fillRect(fx * s, fy * s, s, s);
  }
  const dot = (x, y, c, r) => { ctx.fillStyle = '#1a110c'; ctx.fillRect(x / 10 - r - 1, y / 10 - r - 1, r * 2 + 2, r * 2 + 2); ctx.fillStyle = c; ctx.fillRect(x / 10 - r, y / 10 - r, r * 2, r * 2); };
  for (const st of wildSites()) { if (siteDone(st)) continue; if (M.marks[st.id]) dot(st.x, st.y, '#f5d584', 2); else if (M.seen[st.id] && siteShown(st)) dot(st.x, st.y, '#c23b2e', 1); }
  dot(WILD.TOWN.x, WILD.TOWN.y, '#f1ead8', 2);
  ctx.strokeStyle = 'rgba(26,17,12,.75)'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(prov.camX / 10) + 0.5, Math.round(prov.camY / 10) + 0.5, PROV.VW / 10, PROV.VH / 10);
  if (Math.floor(performance.now() / 400) % 2) dot(F.x, F.y, '#7a2a8a', 2);
}

// The places you know of and have not dealt with, nearest first, to set out for with a click.
function placesHtml() {
  const F = G.field, M = wildMap();
  const all = wildSites().filter(st => siteKnown(st) && !siteDone(st)).map(st => ({ st, d: Math.hypot(st.x - F.x, st.y - F.y), mark: !!M.marks[st.id] })).sort((a, b) => (b.mark - a.mark) || a.d - b.d);
  const row = (id, nm, sub, dz, gold) => `<div class="lrow place" data-act="wildgo" data-v="${id}"><div class="grow"><span class="t ${gold ? 'gold' : ''}">${nm}</span><small>${sub}</small></div>${dz ? `<span class="skulls">${'<i></i>'.repeat(dz)}</span>` : ''}</div>`;
  return all.slice(0, 5).map(({ st, mark }) => row(st.id, st.name, `${mark ? 'marked &middot; ' : ''}${wayTo(st.x, st.y)}`, siteDanger(st), mark)).join('')
    + row('home', 'Home', wayTo(WILD.TOWN.x, WILD.TOWN.y), 0, false)
    + (all.length > 5 ? `<div class="listnote">and ${all.length - 5} more on the whole map</div>` : '');
}

function provFrame(ts) {
  const cv = document.getElementById('wildCanvas');
  if (!cv || !G || !G.field) { prov.raf = 0; return; }
  const arena = document.getElementById('arena'), modal = document.getElementById('modal');
  const busy = (arena && !arena.hidden) || (modal && !modal.hidden) || !!G.ruin;
  if (ts - prov.last > 15) {
    const T = ts / 1000, dt = Math.min(0.25, Math.max(0, T - (prov.prev || T)));
    prov.last = ts; prov.prev = T;
    try {
      if (busy || prov.big) villageStill(); else provStep(dt);
      if (G.field && !(arena && !arena.hidden)) {
        drawProvince(cv, T);
        if (ts - prov.mini > 400) {
          prov.mini = ts; const m = document.getElementById('wildMini'); if (m) drawMini(m);
          SFX.mood({ danger: wildTier(G.field.x, G.field.y) });
          if (!busy && G.tut && G.tut.hints && !G.tut.on && document.getElementById('tutor').hidden) renderTutor();
          const pl = document.getElementById('placeList'); if (pl) { const h = placesHtml(); if (pl.dataset.h !== String(h.length) + h.slice(0, 80)) { pl.innerHTML = h; pl.dataset.h = String(h.length) + h.slice(0, 80); } }
        }
        if (ts - prov.saved > 6000 && !busy) { prov.saved = ts; save(); }
      }
    } catch (e) { console.error(e); prov.raf = 0; return; }
  }
  prov.raf = requestAnimationFrame(provFrame);
}

// ---------- the camp: who is with you, and what can be done without going home ----------
function campRow(g) {
  const state = g.injury > 0 ? `<span class="chip red">Wounded ${g.injury}d</span>` : g.fatigue > 75 ? '<span class="chip red">Exhausted</span>' : g.perkPending > 0 ? '<span class="chip gold">Perk</span>' : '';
  return `<div class="lrow grow-row" data-act="campsel" data-v="${g.id}">
    <canvas width="48" height="56" style="width:25px;height:29px" data-portrait="${g.id}"></canvas>
    <div class="grow"><span class="t">${g.name} ${styleMark(g)}</span><small>${CLASSES[g.cls].name} &middot; power ${rating(g)}</small></div>
    <div class="chips">${state}</div>
    <div class="gauges"><div${tip('health')}>${bar('hp', g.hp, maxHp(g))}</div><div${tip('fatigue')}>${bar('fat', g.fatigue, 100)}</div><div${tip('morale')}>${bar('mor', g.morale, 100)}</div></div>
  </div>`;
}
function renderWilds() {
  const el = $('#wilds');
  if (!el) return;
  const out = !!(G && G.field && !G.ruin);
  el.hidden = !out;
  if (!out) return;
  const F = G.field, M = wildMap(), dg = daysToGames(), men = G.roster.filter(g => !g.away), sel = men.find(g => g.id === ui.campSel);
  const journeys = men.filter(g => g.quest && QUESTS[g.quest.id]).map(g => `<div><b>${g.name}</b>: ${QUESTS[g.quest.id].where}.</div>`).join('');
  const lead = eagleLead();
  const head = `<div class="camphead"><div class="title">THE PROVINCE</div>
      <div class="stat"${tip('day')}><b>${ic('day')}${G.day}</b><span>Day &middot; ${F.days} out</span></div>
      <div class="stat"${tip('denarii')}><b class="${G.denarii < 0 ? 'bad' : 'gold'}">${ic('coin')}${G.denarii}</b><span>${stipend() - upkeep() >= 0 ? '+' : ''}${stipend() - upkeep()} a day</span></div>
      <div class="stat games"${tip('awaygames')}><b>${ic('games')}${dg === 0 ? 'TODAY' : dg + (dg === 1 ? ' day' : ' days')}</b><span>${dg === 0 ? 'Games, without you' : 'Games in town'}</span></div></div>`;
  let body;
  if (sel) body = `<div class="row" style="margin:6px 0"><button data-act="campback">&laquo; Back to the camp</button></div>${gladDetail(sel)}`;
  else body = `<canvas id="wildMini" width="240" height="180" data-act="bigmap"${tip('minimap')} style="cursor:pointer"></canvas>
      <div class="row" style="margin:8px 0"><button class="primary" data-act="makecamp"${tip('makecamp')} style="flex:1">Make camp<span class="key">E</span></button><button data-act="bigmap"${tip('bigmap')}>${prov.big ? 'Close map' : 'Whole map'}<span class="key">M</span></button><button data-act="help" style="padding-left:9px;padding-right:9px"${tip('The keys, and the rules of the trade in a page. Key: H')}>?</button></div>
      ${lead ? `<div class="lead"${tip('eagle')}><b class="gold">The eagle of the Seventeenth.</b> ${lead}</div>` : ''}
      ${journeys ? `<div class="lead"><b class="gold">Promised.</b>${journeys}</div>` : ''}
      <div class="pane" data-pane="camp"><h2>Places known <small>click to walk there</small></h2><div class="panel list" id="placeList">${placesHtml()}</div>
      <h2>The school <small>${fieldParty().length} fit of ${men.length}</small></h2>
      <div class="panel list">${men.map(campRow).join('') || '<div class="listnote">Nobody is with you.</div>'}</div>
      <div class="listnote"${tip('fieldrules')}>${Math.round(wildExplored() * 100)}% of the province walked &middot; ${M.cleared} places dealt with</div></div>`;
  $('#camp').innerHTML = head + body;
  if (!prov.raf) { prov.last = 0; prov.prev = 0; prov.raf = requestAnimationFrame(provFrame); }
  const m = document.getElementById('wildMini'); if (m) drawMini(m);
  paintPortraits();
}
