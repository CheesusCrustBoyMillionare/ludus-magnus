'use strict';
// The map of the province, shown over the whole window while the school is outside the walls.
// The rules of what is out there are in wilds.js; this file draws it and walks the column about it.
// The map is 2400 by 1800 units; the window shows 480 by 360 of it, at 2 canvas pixels per unit.

const PROV = { VW: 480, VH: 360, S: 2, SPEED: 88 };
const prov = { land: null, raf: 0, last: 0, prev: 0, path: null, trail: [], face: 'down', walk: 0, moving: false, mini: 0, saved: 0, camX: 0, camY: 0, hint: 0 };

// ---------- the country, painted once ----------
const TILE_COL = ['#7e9a4b', '#5d7f3f', '#93985c', '#5f7a4c', '#d8c48a', '#cdae78', '#8a6a3a', '#86a250', '#4f8fb8', '#8a8478'];      // in the order of the T_ kinds in wilds.js
function provLand() {
  if (prov.land) return prov.land;
  const L = wildLand(), TW = WILD.TW, TH = WILD.TH, cv = document.createElement('canvas');
  cv.width = WILD.W; cv.height = WILD.H;
  const ctx = cv.getContext('2d'), R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const h = (x, y, k) => wildHash(x, y, 91 + k), at = (x, y) => (x < 0 || y < 0 || x >= TW || y >= TH ? T_PEAK : L.t[y * TW + x]);
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const k = at(tx, ty), x = tx * 10, y = ty * 10, base = k === T_ROAD || k === T_BRIDGE ? TILE_COL[T_GRASS] : TILE_COL[k];
    R(x, y, 10, 10, base);
    for (let i = 0; i < 3; i++) R(x + Math.floor(h(tx, ty, i) * 9), y + Math.floor(h(tx, ty, i + 5) * 10), 2, 1, shade(base, i % 2 ? 0.9 : 1.1));
    // a ragged edge where one kind of ground meets another
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy], n) => {
      const o = at(tx + dx, ty + dy);
      if (o === k || o === T_ROAD || o === T_BRIDGE || k === T_ROAD || k === T_BRIDGE) return;
      for (let i = 0; i < 4; i++) { const p = Math.floor(h(tx, ty, 20 + n * 4 + i) * 9); R(dx ? x + (dx > 0 ? 8 + (i % 2) : 1 - (i % 2)) : x + p, dy ? y + (dy > 0 ? 8 + (i % 2) : 1 - (i % 2)) : y + p, 2, 2, TILE_COL[o]); }
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
      else if (a > 0.6) R(x + 3 + Math.floor(b * 4), y + 3 + Math.floor(a * 3), 2, 1, '#b8955f');
    } else if (k === T_WATER) { if (a > 0.45) R(x + Math.floor(b * 6), y + 2 + Math.floor(a * 6), 4, 1, '#7fb6d8'); if (b > 0.8) R(x + 5, y + 7, 3, 1, '#3f7ba3'); }
    else if (k === T_SAND) { if (a > 0.6) R(x + Math.floor(b * 8), y + Math.floor(a * 8), 2, 1, '#c2ad72'); }
    else if (k === T_MEADOW) { R(x + Math.floor(a * 8), y + Math.floor(b * 8), 1, 1, '#f2e6a0'); R(x + Math.floor(b * 8), y + Math.floor(a * 8), 1, 1, a > 0.5 ? '#e8a0a0' : '#f4f4f0'); }
    else if (k === T_MARSH) { R(x + 1 + Math.floor(a * 4), y + 5, 5, 3, '#3d5a52'); R(x + 2 + Math.floor(a * 4), y + 6, 3, 1, '#587a78'); R(x + 7, y + 1 + Math.floor(b * 3), 1, 4, '#8a9a4a'); R(x + 2, y + 1, 1, 3, '#8a9a4a'); }
    else if (k === T_HILL) { R(x + 1, y + 4, 8, 4, '#a3a866'); R(x + 2, y + 3, 5, 1, '#b4b978'); R(x + 1, y + 8, 8, 1, '#70763f'); R(x + 7, y + 5, 2, 3, '#7f8548'); }
  }
  // what stands up from the ground is drawn last, row by row, so that it overlaps what is behind it
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const k = at(tx, ty), x = tx * 10, y = ty * 10, a = h(tx, ty, 60), b = h(tx, ty, 61);
    if (k === T_FOREST) {
      const cx = x + 3 + Math.floor(a * 4), cy = y + 2 + Math.floor(b * 4);
      R(cx - 4, cy + 4, 9, 2, 'rgba(0,0,0,.2)'); R(cx, cy + 1, 1, 4, '#4a3320');
      R(cx - 3, cy - 4, 7, 6, '#35602b'); R(cx - 4, cy - 3, 9, 4, '#35602b'); R(cx - 2, cy - 5, 5, 1, '#35602b');
      R(cx - 3, cy - 4, 4, 3, '#4c7f38'); R(cx - 2, cy - 5, 2, 1, '#69a04a');
    } else if (k === T_PEAK) {
      const px = x + Math.floor(a * 3);
      for (let i = 0; i < 9; i++) { R(px + 4 - Math.ceil(i / 2), y - 3 + i, Math.ceil(i / 2), 1, '#a8a294'); R(px + 4, y - 3 + i, Math.floor(i / 2) + 1, 1, '#6b665c'); }
      R(px + 3, y - 3, 2, 2, '#eeeae0'); R(px + 3, y - 1, 1, 1, '#eeeae0');
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
  const r = cv.getBoundingClientRect(), x = prov.camX + (e.clientX - r.left) / r.width * PROV.VW, y = prov.camY + (e.clientY - r.top) / r.height * PROV.VH;
  const p = provPath(G.field.x, G.field.y, x, y);
  if (p) prov.path = p; else prov.hint = performance.now() + 1600;
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
    wildReveal(F.x, F.y);
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
  if (prov.path && prov.path.length) { const e = prov.path[prov.path.length - 1]; ctx.globalAlpha = 0.5 + 0.4 * Math.sin(T * 6); R(e.x - 3, e.y - 1, 7, 2, '#f5d584'); R(e.x - 1, e.y - 3, 2, 7, '#f5d584'); ctx.globalAlpha = 1; }

  // fog: parchment over whatever you have not walked, with a faint sketch of what the old maps say is there
  const Fg = WILD.FOG, L = wildLand();
  for (let fy = Math.floor(camY / Fg); fy <= Math.floor((camY + PROV.VH) / Fg); fy++) for (let fx = Math.floor(camX / Fg); fx <= Math.floor((camX + PROV.VW) / Fg); fx++) {
    if (fogAt(fx, fy)) continue;
    const edge = fogAt(fx + 1, fy) || fogAt(fx - 1, fy) || fogAt(fx, fy + 1) || fogAt(fx, fy - 1), x = fx * Fg, y = fy * Fg, v = wildHash(fx, fy, 7);
    ctx.globalAlpha = edge ? 0.72 : 1;
    R(x, y, Fg, Fg, v > 0.66 ? '#d9c8a0' : v > 0.33 ? '#d7c59c' : '#d5c299');
    if (v > 0.8) R(x + Math.floor(v * 97) % 14, y + Math.floor(v * 53) % 14, 5, 1, '#cdb98f');
    ctx.globalAlpha = edge ? 0.25 : 0.4;
    const k = L.t[Math.min(WILD.TH - 1, fy * 2 + 1) * WILD.TW + Math.min(WILD.TW - 1, fx * 2 + 1)], ink = '#6b5334';
    if (k === T_FOREST) { R(x + 9, y + 6, 1, 8, ink); R(x + 6, y + 7, 7, 1, ink); R(x + 7, y + 5, 5, 1, ink); R(x + 8, y + 9, 3, 1, ink); }
    else if (k === T_PEAK || k === T_HILL) { for (let i = 0; i < 5; i++) { R(x + 5 + i, y + 13 - i * (k === T_PEAK ? 2 : 1), 1, 1, ink); R(x + 14 - i, y + 13 - i * (k === T_PEAK ? 2 : 1), 1, 1, ink); } }
    else if (k === T_WATER) { R(x + 3, y + 8, 5, 1, ink); R(x + 8, y + 9, 5, 1, ink); R(x + 5, y + 13, 5, 1, ink); }
    else if (k === T_MARSH) { R(x + 4, y + 10, 4, 1, ink); R(x + 11, y + 12, 4, 1, ink); R(x + 6, y + 6, 1, 4, ink); }
    else if (k === T_ROAD) { R(x + 2, y + 9, 3, 1, ink); R(x + 8, y + 9, 3, 1, ink); R(x + 14, y + 9, 3, 1, ink); }
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
    const live = siteLive(s), near = Math.hypot(s.x - F.x, s.y - F.y) < 90;
    if (siteDone(s)) { if (near) tag(s.x, s.y + 16, s.name.toUpperCase() + ' - DONE', '#a8947a'); continue; }
    if (near || mark) tag(s.x, s.y + 16, s.name.toUpperCase(), mark ? '#f5d584' : '#f2e6cc', null, live && !['shrine', 'hermit', 'hamlet', 'healer', 'merchant', 'cache', 'herb', 'deserter', 'quarry', 'vow', 'master'].includes(s.kind) ? (s.kind === 'chief' || s.kind === 'barrow' ? 5 : s.kind === 'slavers' ? 3 : s.kind === 'battlefield' ? 4 : s.tier) : 0);
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
  ctx.textAlign = 'center';
  const tip = prov.hint > performance.now() ? 'YOU CANNOT WALK THERE' : town(F) < 60 ? 'W A S D OR CLICK TO WALK  -  WALK BACK INTO THE TOWN TO GO HOME' : '';
  if (tip) { const w = Math.ceil(ctx.measureText(tip).width) + 12; ctx.fillStyle = 'rgba(24,16,10,.8)'; ctx.fillRect(PROV.VW / 2 - w / 2, PROV.VH - 18, w, 12); ctx.fillStyle = '#f5d584'; ctx.fillText(tip, PROV.VW / 2, PROV.VH - 9); }
}
const town = F => Math.hypot(F.x - WILD.TOWN.x, F.y - WILD.TOWN.y);

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
  if (Math.floor(performance.now() / 400) % 2) dot(F.x, F.y, '#7a2a8a', 2);
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
      if (busy) villageStill(); else provStep(dt);
      if (G.field && !(arena && !arena.hidden)) {
        drawProvince(cv, T);
        if (ts - prov.mini > 400) { prov.mini = ts; const m = document.getElementById('wildMini'); if (m) drawMini(m); }
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
    <div class="grow"><span class="t">${g.name}</span><small>${CLASSES[g.cls].name} &middot; strength ${Math.round(power(g))}</small></div>
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
  else body = `<canvas id="wildMini" width="240" height="180"${tip('minimap')}></canvas>
      <div class="row" style="margin:8px 0"><button class="primary" data-act="makecamp"${tip('makecamp')} style="flex:1">Make camp<span class="key">E</span></button></div>
      ${lead ? `<div class="lead"${tip('eagle')}><b class="gold">The eagle of the Seventeenth.</b> ${lead}</div>` : ''}
      ${journeys ? `<div class="lead"><b class="gold">Promised.</b>${journeys}</div>` : ''}
      <h2>The school <small>${fieldParty().length} fit of ${men.length}</small></h2>
      <div class="pane" data-pane="camp"><div class="panel list">${men.map(campRow).join('') || '<div class="listnote">Nobody is with you.</div>'}</div>
      <div class="listnote"${tip('fieldrules')}>${Math.round(wildExplored() * 100)}% of the province walked &middot; ${M.cleared} places dealt with</div></div>`;
  $('#camp').innerHTML = head + body;
  if (!prov.raf) { prov.last = 0; prov.prev = 0; prov.raf = requestAnimationFrame(provFrame); }
  const m = document.getElementById('wildMini'); if (m) drawMini(m);
  paintPortraits();
}
