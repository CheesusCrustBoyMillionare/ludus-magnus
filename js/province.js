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
  let ctx = cv.getContext('2d'), solid = false;
  const R = (x, y, w, h, c) => { if (solid && c[0] !== '#') return; ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  // What stands up tall enough to walk behind or under: an arch, the aqueduct, a tower, a great tree. Each is kept
  // with the line it stands on, so that the map can paint it again over a man who is north of that line
  // (drawProvince). Painted again it leaves out its shadow and anything else that is only a stain on the ground.
  const overs = [];
  prov.overs = overs;
  prov.paintOver = (c2, d) => { const keep = ctx; ctx = c2; solid = true; try { d(); } finally { ctx = keep; solid = false; } };
  const TALL = ['The great oak', 'The old arch', 'The beacon', 'The unfinished columns', 'The watchtower', 'The needle', 'The gallows', 'The broken aqueduct', 'The wolf stone', "The giant's table", 'The mill', 'The white temple'];
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
  const inTown = (tx, ty, m) => tx * 10 + 5 > WILD.TOWN.x - 48 - (m || 0) && tx * 10 + 5 < WILD.TOWN.x + 23 + (m || 0) && ty * 10 + 5 > WILD.TOWN.y - 32 - (m || 0) && ty * 10 + 5 < WILD.TOWN.y + 17 + (m || 0);      // the ground the town stands on
  const farm = (tx, ty) => { const d = Math.hypot(tx - tx0, ty - ty0); if (d < 3 || d > 10.5 || inTown(tx, ty, 4)) return 0; const f = h(Math.floor(tx / 4), Math.floor(ty / 3), 70); return f > 0.4 ? (f > 0.72 ? 2 : 1) : 0; };
  // every crossing is one of four kinds, and all the tiles of one crossing agree on which
  const span = {}, crossings = [];
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    if (at(tx, ty) !== T_BRIDGE || span[ty * TW + tx]) continue;
    const todo = [[tx, ty]], got = []; let x0 = tx, x1 = tx, y0 = ty, y1 = ty;
    while (todo.length) { const [cx, cy] = todo.pop(), key = cy * TW + cx; if (span[key] || at(cx, cy) !== T_BRIDGE) continue; span[key] = 1; got.push(key); x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) todo.push([cx + dx, cy + dy]); }
    const info = { style: Math.floor(h(x0, y0, 600) * 4), across: x1 - x0 >= y1 - y0 };
    if (info.style === 3 && got.length > 5) info.style = got.length > 12 ? 0 : 1;      // nobody fords a lake: a long crossing is built
    for (const key of got) span[key] = info;
    info.tiles = got.map(key => [key % TW, (key - key % TW) / TW]); crossings.push(info);
  }
  // what is grown on each plot, and what divides it from the next
  const crop = (tx, ty) => Math.floor(h(Math.floor(tx / 4), Math.floor(ty / 3), 71) * 11), walled = (tx, ty) => h(Math.floor(tx / 4), Math.floor(ty / 3), 72) > 0.6;
  // Each region's grass, meadow and woodland floor has a colour of its own; where two regions meet the line between
  // them is ragged, so that one country runs into the next instead of stopping at a fence.
  const REG_NAMES = WILD_REGIONS.map(q => q.name), regT = new Uint8Array(TW * TH);
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) regT[ty * TW + tx] = REG_NAMES.indexOf(wildRegion(tx * 10 + 5 + (wildNoise(tx / 6, ty / 6, 801) - 0.5) * 220 + (wildNoise(tx / 2, ty / 2, 803) - 0.5) * 70 + (h(tx, ty, 805) - 0.5) * 50, ty * 10 + 5 + (wildNoise(tx / 6, ty / 6, 802) - 0.5) * 220 + (wildNoise(tx / 2, ty / 2, 804) - 0.5) * 70 + (h(ty, tx, 806) - 0.5) * 50));
  const GROUND = {
    'The Home Fields': ['#84a04e', '#8caa54', '#5d7f3f', '#8c9854'], 'The Long Meadows': ['#7aa64e', '#84b056', '#588040', '#869a52'], 'The Salt Shore': ['#909a52', '#9aa45a', '#647a40', '#9a965c'],
    'Greywood': ['#74905a', '#7e9a62', '#52705a', '#88925f'], 'The Quarry Hills': ['#8c9a50', '#96a458', '#627a3e', '#9b9865'], 'The High Fells': ['#7c9462', '#869e6a', '#4f7448', '#868e61'],
    'The Barrow Downs': ['#6c9246', '#769c4e', '#4c7238', '#819253'], 'Blackmere': ['#6a8a52', '#74945a', '#4a6a48', '#848e59'],
  };
  const ground = (k, tx, ty) => { const g = GROUND[REG_NAMES[regT[Math.max(0, Math.min(TH - 1, ty)) * TW + Math.max(0, Math.min(TW - 1, tx))]]]; return !g ? TILE_COL[k] : k === T_GRASS ? g[0] : k === T_MEADOW ? g[1] : k === T_FOREST ? g[2] : k === T_HILL ? g[3] : TILE_COL[k]; };
  const col = (k, tx, ty) => k === T_WATER ? (deep(tx, ty) ? '#3f7dab' : '#5a9cc6') : k === T_BRIDGE ? '#5a9cc6' : tint(ground(k === T_ROAD ? T_GRASS : k, tx, ty), tone(tx, ty));

  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const k = at(tx, ty), x = tx * 10, y = ty * 10, base = col(k, tx, ty);
    R(x, y, 10, 10, base);
    for (let i = 0; i < 3; i++) R(x + Math.floor(h(tx, ty, i) * 9), y + Math.floor(h(tx, ty, i + 5) * 10), 2, 1, tint(base, i % 2 ? 0.9 : 1.1));
    // a ragged edge where one kind of ground meets another
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy], n) => {
      const o = at(tx + dx, ty + dy);
      if (o === T_ROAD || o === T_BRIDGE || k === T_ROAD || k === T_BRIDGE) return;
      const oc = col(o, tx + dx, ty + dy);
      if (o === k) {                             // the same ground in another shade: the two run together
        if (oc === base || k === T_WATER) return;
        for (let i = 0; i < 7; i++) { const q = Math.floor(h(tx + i, ty, 840 + n) * 9), inn = Math.floor(h(tx, ty + i, 844 + n) * h(tx + i, ty + n, 848) * 7), sw = 1 + Math.floor(h(tx + i, ty + i, 852 + n) * 3); R(dx ? x + (dx > 0 ? 9 - inn - (sw > 1 ? 1 : 0) : inn) : x + q, dy ? y + (dy > 0 ? 9 - inn : inn) : y + q, dx ? (sw > 1 ? 2 : 1) : sw, dx ? (sw > 2 ? 2 : 1) : 1, oc); }
        return;
      }
      // the neighbour's ground comes a little way in, further in some places than others, so that no border is a ruled line
      for (let i = 0; i < 11; i++) { const q = Math.floor(h(tx, ty, 20 + n * 5 + i) * 9), inn = Math.floor(h(tx + i, ty + n, 810) * h(tx, ty + i, 811) * 8); R(dx ? x + (dx > 0 ? 8 - inn : inn) : x + q, dy ? y + (dy > 0 ? 8 - inn : inn) : y + q, 2, 2, oc); }
    });
  }
  // The small things lying about are made, not stamped: a stone is one of eight builds in the rock of its country, a
  // log one of eight, a bush one of seven, and each takes its size and place from the spot it lies in.
  const rockPal = reg => reg === 'The Quarry Hills' ? ['#d2cbb6', '#b3ac98', '#8f8876'] : reg === 'The High Fells' ? ['#a2aab4', '#7d8692', '#646c78'] : reg === 'The Barrow Downs' ? ['#b8b4a0', '#8c8676', '#5f5a4c'] : reg === 'Blackmere' ? ['#8a8a7a', '#6a6a5c', '#4a4a40'] : reg === 'The Salt Shore' ? ['#c8c0a8', '#a39a8a', '#7d7668'] : ['#bdb8ac', '#9a958a', '#6b665c'];
  const rocks = (x, y, tx, ty, reg) => {
    const v = q => h(tx, ty, 1200 + q), [lt, md, dk] = rockPal(reg), form = Math.floor(v(0) * 8), w = 3 + Math.floor(v(1) * 4), cx = x + 1 + Math.floor(v(2) * (8 - w)), by = y + 6 + Math.floor(v(3) * 3);
    R(cx - 1, by, w + 2, 1, 'rgba(0,0,0,.18)');
    if (form === 0) { const hh = Math.max(2, Math.round(w * 0.7)); for (let i = 0; i < hh; i++) { const ww = Math.max(1, Math.round(w * Math.sqrt(1 - Math.pow((hh - 1 - i) / hh, 2)))), ox = cx + ((w - ww) >> 1); R(ox, by - hh + i, ww, 1, i === hh - 1 ? dk : md); R(ox, by - hh + i, Math.max(1, ww >> 1), 1, lt); } }      // a boulder
    else if (form === 1) { R(cx, by - 2, w + 1, 2, md); R(cx, by - 2, w, 1, lt); R(cx + w, by - 1, 1, 1, dk); }                                                                                              // a flat slab
    else if (form === 2) { const a2 = Math.max(1, w >> 1); R(cx, by - 3, a2, 3, md); R(cx, by - 3, a2, 1, lt); R(cx + a2 + 1, by - 2, w - a2, 2, md); R(cx + a2 + 1, by - 2, w - a2, 1, lt); R(cx + a2, by - 2, 1, 2, dk); }      // one split by frost
    else if (form === 3) for (let q = 0; q < 3; q++) { const sx = cx + q * 2, sy = by - 2 - (q % 2); R(sx, sy, 2, 2, q % 2 ? md : dk); R(sx, sy, 1, 1, lt); }                                                // three small ones
    else if (form === 4) { const hh = 4 + Math.floor(v(4) * 3); R(cx + 1, by - hh, 2, hh, md); R(cx + 1, by - hh, 1, hh, lt); R(cx + 1 + (v(5) > 0.5 ? 1 : 0), by - hh - 1, 1, 1, md); }                      // one standing on end
    else if (form === 5) { R(cx, by - 3, w, 3, md); R(cx + 1, by - 4, Math.max(1, w - 2), 1, md); R(cx, by - 3, Math.max(1, w >> 1), 1, lt); R(cx + (w >> 1), by - 4, Math.max(1, w >> 1), 2, '#6f8a4a'); R(cx + w - 1, by - 2, 1, 2, dk); }      // under moss
    else if (form === 6) { R(cx, by - 3, w, 3, md); R(cx + 1, by - 4, Math.max(1, w - 2), 1, lt); R(cx + w - 1, by - 3, 1, 3, dk); for (let q = 0; q < 2; q++) R(cx + 1 + Math.floor(v(6 + q) * (w - 1)), by - 3 + q, 1, 1, q ? '#d8a040' : '#d0d0a8'); }      // spotted with lichen
    else { R(cx, by - 2, w, 2, md); R(cx, by - 2, w - 1, 1, lt); R(cx + 1, by - 3, 2, 1, md); R(cx + w + 1, by - 1, 1, 1, dk); R(cx - 1, by - 1, 1, 1, md); }                                                 // broken small
  };
  const logs = (x, y, tx, ty, pal) => {
    const v = q => h(tx, ty, 1220 + q), [bk, lt, ct] = pal, form = Math.floor(v(0) * 8), len = 4 + Math.floor(v(1) * 5), lx = x + Math.floor(v(2) * (10 - len)), ly = y + 5 + Math.floor(v(3) * 3), end = v(4) > 0.5 ? len - 1 : 0;
    if (form === 1) { for (let q = 0; q < len; q++) R(lx + q, ly - Math.floor(q / 2), 1, 2, q % 3 ? bk : lt); R(lx, ly + 2, len, 1, 'rgba(0,0,0,.14)'); return; }                 // lying aslant
    if (form === 7) { R(lx, ly, len, 2, bk); R(lx, ly, len, 1, lt); for (let q = 0; q < 5; q++) R(lx + 1 + q, ly - 2 + q, 1, 2, q % 2 ? bk : lt); return; }                         // two, one across the other
    R(lx, ly + 2, len + 1, 1, 'rgba(0,0,0,.16)'); R(lx, ly, len, 2, bk); R(lx, ly, len, 1, lt); R(lx + end, ly, 1, 2, ct);
    if (form === 2) { R(lx + 2, ly - 2, 1, 2, bk); if (len > 5) R(lx + len - 3, ly - 1, 1, 1, bk); }                                                                                 // the stubs of its boughs still on it
    else if (form === 3) R(lx + end, ly, 1, 2, '#2a1c14');                                                                                                                             // hollow
    else if (form === 4) R(lx + 1, ly, Math.max(2, len - 3), 1, '#6f8a4a');                                                                                                           // mossed over
    else if (form === 5) for (let q = 0; q < 3; q++) R(lx + 1 + q * 2, ly + 1, 1, 1, q % 2 ? '#e8b060' : '#d8742a');                                                               // brackets of fungus along it
    else if (form === 6) { const sx = lx + len + 3 > x + 10 ? lx - 3 : lx + len + 1; R(sx, ly - 1, 2, 3, bk); R(sx, ly - 1, 2, 1, ct); }                                              // and the stump it came off
  };
  const shrub = (x, y, tx, ty) => {
    const v = q => h(tx, ty, 1240 + q), form = Math.floor(v(0) * 7), w = 3 + Math.floor(v(1) * 4), hh = 2 + Math.floor(v(2) * 3), bx = x + Math.floor(v(3) * (9 - w)), by = y + 8, ci = Math.floor(v(4) * 5);
    const dk = ['#4c7f38', '#3f6f45', '#5f7f2f', '#4a6a3a', '#3a6a4a'][ci], lt = ['#69a04a', '#58905c', '#7fa040', '#62884c', '#52886a'][ci];
    R(bx, by, w + 1, 1, 'rgba(0,0,0,.18)');
    if (form === 5) { R(bx + (w >> 1), by - hh - 1, 1, hh + 1, '#5a4a3a'); for (let q = 0; q < 3; q++) R(bx + q * 2 - (q % 2), by - 1 - q, 2, 1, '#5a4a3a'); return; }                 // a thorn, bare
    if (form === 6) { R(bx + 1, by - hh - 3, Math.max(2, w - 2), hh + 3, dk); R(bx + 1, by - hh - 3, 1, hh + 2, lt); R(bx + 2, by - hh - 4, 1, 1, dk); return; }                        // a tall one, grown up narrow
    R(bx, by - hh, w, hh, dk); R(bx + 1, by - hh - 1, Math.max(1, w - 2), 1, lt); R(bx, by - hh, Math.max(1, w >> 1), 1, lt);
    if (form === 1) for (let q = 0; q < 3; q++) R(bx + Math.floor(v(5 + q) * w), by - 1 - Math.floor(v(8 + q) * hh), 1, 1, '#c23b2e');                                               // in berry
    else if (form === 2) for (let q = 0; q < 3; q++) R(bx + Math.floor(v(5 + q) * w), by - 1 - Math.floor(v(8 + q) * hh), 1, 1, '#f2e6a0');                                          // broom in flower
    else if (form === 3) for (let q = 0; q < 4; q++) R(bx + Math.floor(v(5 + q) * w), by - 1 - Math.floor(v(9 + q) * hh), 1, 1, q % 2 ? '#f8f8f4' : '#f4d0d8');                      // in blossom
    else if (form === 4) { R(bx + w - 1, by - hh + 1, 3, Math.max(1, hh - 1), dk); R(bx + w, by - hh, 2, 1, lt); }                                                                     // two grown together
  };
  // A hill: a rounded body lit from the north-west. The light is worked out along each row of it, so that the
  // brow is bright, the flank falls through two middle tones into shade on the south-east, and the foot is dark;
  // the lines between the tones are broken, not ruled. It throws a soft shadow down and to the right, and has
  // no outline: its foot runs out into the ground. sh is its build: dome 0, ridge 1, cone 2, tor 3, table 4, scarp 5.
  const hillMound = (cx, cy, rx, ry, sh, pal, rk, t, gc) => {
    // its colours are the ground's own, lifted where the light falls and lowered where it does not, with only a little of the hill country's hue: a hill is the same turf as the land it rises from
    const body = gc ? mixHex(tint(pal[0], t), gc, 0.42) : tint(pal[0], t), hi = tint(body, 1.18), lt = tint(body, 1.09), md = body, sd = tint(body, 0.86), dk = tint(body, 0.76), seed = cx * 7 + cy * 13;
    const sry = Math.max(2, Math.round(ry * 0.4));
    for (let dy = -sry; dy <= sry; dy++) { const w = Math.round(rx * 0.95 * Math.sqrt(1 - (dy * dy) / (sry * sry + 0.5))); if (w > 0) R(cx + Math.round(rx * 0.42) - w + Math.round(dy * 0.5), cy + 1 + dy, w * 2, 1, 'rgba(24,34,14,.09)'); }      // the shadow it throws
    for (let dy = -ry; dy <= 0; dy++) {
      const fr = (dy + ry) / Math.max(1, ry), dome = Math.sqrt(1 - (dy * dy) / (ry * ry + 0.5)), prof = sh === 2 ? 0.45 * dome + 0.55 * Math.pow(fr * 0.9 + 0.1, 0.8) : sh === 4 ? 0.7 + 0.3 * fr : dome;
      const w = Math.max(1, Math.round(rx * prof + (h(seed + dy, cy, 121) - 0.5) * 1.4)), up = (1 - fr) * 0.55, j = q => (h(seed + dy, q, 1350) - 0.5) * 0.14;
      const xa = cx - w, xb = cx + w, at2 = u => Math.max(xa, Math.min(xb, Math.round(cx + u * w)));
      const x1 = at2((up - 0.5) / 0.62 + j(1)), x2 = at2((up - 0.12) / 0.62 + j(2)), x3 = at2((up + 0.34) / 0.62 + j(3)), x4 = fr > 0.72 ? at2(0.45 + (1 - fr) * 1.6 + j(4)) : xb;
      R(xa, cy + dy, xb - xa, 1, md);
      if (x1 > xa) R(xa, cy + dy, x1 - xa, 1, hi);
      if (x2 > x1) R(x1, cy + dy, x2 - x1, 1, lt);
      if (xb > x3) R(x3, cy + dy, xb - x3, 1, sd);
      if (xb > x4) R(Math.max(x3, x4), cy + dy, xb - Math.max(x3, x4), 1, dk);
      if (dy < 0 && dy > -ry) { if (x2 > xa + 1 && (dy + seed) % 2) R(x2, cy + dy, 1, 1, lt); if (x3 < xb - 1 && (dy + seed) % 2 === 0) R(x3 - 1, cy + dy, 1, 1, sd); }      // the tones broken into each other
      if (gc && fr > 0.62) { const thin = (fr - 0.62) / 0.38 * 0.5; for (let px = xa; px < xb; px += 2) if (h(px, cy + dy, 1354) < thin) R(px, cy + dy, 2, 1, gc); }      // the lower slopes thin out into the ground they stand on
      if (gc && fr > 0.25) { const eg = 1 + Math.round(fr * 2); if (h(seed, dy, 1355) > 0.4) R(xa, cy + dy, eg, 1, gc); if (h(dy, seed, 1356) > 0.4) R(xb - eg, cy + dy, eg, 1, gc); }                    // and its sides are bitten into, not cut clean
      if (dy === -ry || (dy === -ry + 1 && w > 3)) R(xa, cy + dy, Math.max(1, Math.round((xb - xa) * 0.6)), 1, hi);                                                              // the brow catching the light
      if (rk && sh === 4 && dy + ry >= 1 && dy + ry <= (ry > 5 ? 3 : 2)) { R(xa, cy + dy, w, 1, rk[0]); R(cx, cy + dy, w, 1, rk[1]); if (h(cx, dy, 913) > 0.5) R(xa + 1 + Math.floor(h(dy, cx, 914) * w), cy + dy, 1, 1, rk[1]); }
      if (rk && sh === 5 && fr > 0.45 && dy < 0) { const fw = Math.max(1, Math.round(w * (0.5 + h(cx, dy, 915) * 0.45))); R(xb - fw, cy + dy, fw, 1, (dy + cx) % 3 ? rk[1] : rk[0]); if (h(dy, cx, 916) > 0.7) R(xb - fw, cy + dy, 1, 1, rk[0]); }
    }
    for (let q = 0, n = Math.floor(rx * ry / 12); q < n; q++) { const fy = -Math.floor(h(seed, q, 1351) * ry * 0.85), fw = Math.round(rx * Math.sqrt(1 - (fy * fy) / (ry * ry + 0.5)) * 0.8), fx = cx - fw + Math.floor(h(q, seed, 1352) * fw * 2); R(fx, cy + fy, 1 + (q % 3 === 0 ? 1 : 0), 1, fx < cx ? 'rgba(255,255,220,.13)' : 'rgba(20,30,10,.13)'); }      // turf: flecks lighter on the lit side, darker on the other
    for (let q = -rx - 2; q < rx + 3; q += 2) { const hq = h(seed, q, 1353); if (hq > 0.55) R(cx + q, cy + 1 + (hq > 0.85 ? 1 : 0), 1 + (q % 4 === 0 ? 1 : 0), 1, q > rx * 0.2 ? sd : md); }                                                                                                                                  // the foot, ragged, running out into the ground
    if (rk && sh === 3) { const tw = Math.max(3, Math.min(7, rx >> 1)); R(cx - (tw >> 1), cy - ry - 1, tw, 2, rk[1]); R(cx - (tw >> 1), cy - ry - 1, tw >> 1, 2, rk[0]); R(cx - (tw >> 1) + 1, cy - ry - 3, Math.max(2, tw - 2), 2, rk[1]); R(cx - (tw >> 1) + 1, cy - ry - 3, 1, 2, rk[0]); if (tw > 4) R(cx, cy - ry - 5, 2, 2, rk[0]); }
  };
  const hillDepth = (tx, ty) => { for (let r = 1; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) { const o = at(tx + dx, ty + dy); if (o !== T_HILL && o !== T_PEAK) return r; } return 4; };      // how far into the high ground
  const lone = [];
  const shoreD = new Uint8Array(TW * TH).fill(255);
  { let cur = []; for (let i = 0; i < TW * TH; i++) if (L.t[i] !== T_WATER && L.t[i] !== T_BRIDGE) { shoreD[i] = 0; cur.push(i); }
    for (let d = 1; d < 10 && cur.length; d++) { const nx = []; for (const i of cur) { const cx = i % TW, cy = (i - cx) / TW; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ax = cx + dx, ay = cy + dy; if (ax < 0 || ay < 0 || ax >= TW || ay >= TH) continue; const j = ay * TW + ax; if (shoreD[j] === 255) { shoreD[j] = d; nx.push(j); } } } cur = nx; } }
  // which water is the sea: whatever open water can be reached from the western edge of the map without going up a river
  const seaM = new Uint8Array(TW * TH);
  { let cur = []; for (let ty = 0; ty < TH; ty++) if (L.t[ty * TW] === T_WATER) { seaM[ty * TW] = 1; cur.push(ty * TW); }
    while (cur.length) { const nx = []; for (const i of cur) { const cx = i % TW, cy = (i - cx) / TW; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ax = cx + dx, ay = cy + dy; if (ax < 0 || ay < 0 || ax >= TW || ay >= TH) continue; const j = ay * TW + ax; if (!seaM[j] && L.t[j] === T_WATER && shoreD[j] >= 2) { seaM[j] = 1; nx.push(j); } } } cur = nx; } }
  const zq = (v, n) => Math.min(n - 1, Math.max(0, Math.floor(((v - 0.5) * 2.4 + 0.5) * n)));      // which of n kinds a stretch of country is
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const k = at(tx, ty), x = tx * 10, y = ty * 10, a = h(tx, ty, 40), b = h(tx, ty, 41);
    if (k === T_ROAD || k === T_BRIDGE) {
      const dTown = Math.hypot(tx - tx0, ty - ty0), paved = k === T_ROAD && dTown < 9;
      const rreg = REG_NAMES[regT[ty * TW + tx]], RC = { 'The Quarry Hills': '#d0c8b0', 'The High Fells': '#a89c88', 'Blackmere': '#8a7350', 'The Salt Shore': '#dcc890', 'Greywood': '#9a8058', 'The Long Meadows': '#c2a674', 'The Barrow Downs': '#c4b890' };
      const road = k === T_ROAD ? (paved ? '#c4bca6' : RC[rreg] ? tint(RC[rreg], 0.97 + h(tx, ty, 1081) * 0.06) : dTown > 70 ? '#c2a674' : '#cdae78') : '#8a6a3a';
      if (k === T_BRIDGE) {                    // under a crossing the water runs on, and the bank comes raggedly down to it; the bridge itself is laid afterwards, in one piece
        for (let q = 0; q < 3; q++) R(x + Math.floor(h(tx, ty, 312 + q) * 7), y + 1 + Math.floor(h(tx, ty, 316 + q) * 8), 2 + Math.floor(h(tx, ty, 320 + q) * 3), 1, '#8fc3e0');
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy], sd) => {
          const o = at(tx + dx, ty + dy); if (o === T_WATER || o === T_BRIDGE) return;
          const oc = col(o === T_ROAD ? T_GRASS : o, tx + dx, ty + dy);
          for (let q = 0; q < 5; q++) { const at0 = q * 2, dep = 1 + Math.floor(h(tx, ty, 1520 + sd * 8 + q) * 3); if (dx) R(dx > 0 ? x + 10 - dep : x, y + at0, dep, 2, q % 3 === 2 ? '#bfae78' : oc); else R(x + at0, dy > 0 ? y + 10 - dep : y, 2, dep, q % 3 === 2 ? '#bfae78' : oc); }
        });
      } else {
      R(x + 2, y + 2, 6, 6, road);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const o = at(tx + dx, ty + dy); if (o === T_ROAD || o === T_BRIDGE) R(dx ? x + (dx > 0 ? 8 : 0) : x + 2, dy ? y + (dy > 0 ? 8 : 0) : y + 2, dx ? 2 : 6, dy ? 2 : 6, road); }
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const o = at(tx + dx, ty + dy); if (o === T_ROAD || o === T_BRIDGE) R(x + (dx > 0 ? 7 : 0), y + (dy > 0 ? 7 : 0), 3, 3, road); }
      }
      if (k === T_BRIDGE) { }
      else if (paved) { R(x + 2 + ((tx + ty) % 2) * 3, y + 2, 1, 6, '#a89f8a'); R(x + 2, y + 4 + ((tx * 3 + ty) % 2), 6, 1, '#a89f8a'); if (a > 0.8) R(x + 3 + Math.floor(b * 3), y + 3, 2, 2, '#d6cfbc'); }      // dressed stone, close to the gate
      else {
        const vert = at(tx, ty - 1) === T_ROAD || at(tx, ty + 1) === T_ROAD || at(tx, ty - 1) === T_BRIDGE || at(tx, ty + 1) === T_BRIDGE, r1 = h(tx, ty, 1082), r2 = h(tx, ty, 1083);
        if (rreg === 'Blackmere') { for (let i = 0; i < 6; i += 2) { if (vert) R(x + 1, y + 2 + i, 8, 1, i % 4 ? '#6b5236' : '#7d6242'); else R(x + 2 + i, y + 1, 1, 8, i % 4 ? '#6b5236' : '#7d6242'); } if (r1 > 0.8) R(x + 3 + Math.floor(r2 * 3), y + 3 + Math.floor(r1 * 10) % 3, 2, 2, '#3d5a52'); }      // logs laid side by side over the wet, one or two gone under
        else if (rreg === 'The High Fells') { for (let q = 0; q < 2 + Math.floor(r1 * 2); q++) { const sx = x + 2 + Math.floor(h(tx, ty, 1084 + q) * 5), sy = y + 2 + Math.floor(h(tx, ty, 1088 + q) * 5); R(sx, sy, 2, 1, '#c4c8cc'); R(sx, sy + 1, 2, 1, '#7a7e84'); } }                                                                                          // a track over bare rock
        else if (rreg === 'The Long Meadows') { for (let i = 0; i < 10; i += 2) if (h(tx + i, ty, 1092) > 0.3) { if (vert) R(x + 4 + (i % 4 ? 1 : 0), y + i, 1, 2, '#8aa652'); else R(x + i, y + 4 + (i % 4 ? 1 : 0), 2, 1, '#8aa652'); } }                                                                              // two ruts, and grass down the middle
        else if (rreg === 'Greywood') { for (let q = 0; q < 3; q++) R(x + 2 + Math.floor(h(tx, ty, 1084 + q) * 6), y + 2 + Math.floor(h(tx, ty, 1088 + q) * 6), 1, 1, ['#b45f2c', '#d4a43a', '#6b4f2c'][q]); if (r1 > 0.85) R(x + 2, y + 4 + Math.floor(r2 * 2), 5, 1, '#5a4326'); }                                              // leaves down on it, and a root across
        else if (rreg === 'The Salt Shore') { R(x + 2 + Math.floor(r1 * 3), y + 3 + Math.floor(r2 * 4), 3, 1, '#ead8a4'); if (r1 > 0.7) R(x + 3 + Math.floor(r2 * 4), y + 5, 1, 1, '#f4ece0'); }                                                                                                                              // sand, and a shell trodden in
        else if (rreg === 'The Quarry Hills') { for (let q = 0; q < 3; q++) R(x + 2 + Math.floor(h(tx, ty, 1084 + q) * 6), y + 2 + Math.floor(h(tx, ty, 1088 + q) * 6), 1, 1, '#f2eee2'); if (vert) { R(x + 3, y, 1, 10, '#b0a88e'); R(x + 6, y, 1, 10, '#b0a88e'); } else { R(x, y + 3, 10, 1, '#b0a88e'); R(x, y + 6, 10, 1, '#b0a88e'); } }      // chippings, and the ruts the stone carts cut
        else if (rreg === 'The Barrow Downs') { if (r1 > 0.5) { R(x + 2 + Math.floor(r2 * 3), y + 3 + Math.floor(r1 * 10) % 3, 3, 2, '#e6e2d2'); } }                                                                                                                                                                      // the chalk showing through
        if (a > 0.6) R(x + 3 + Math.floor(b * 4), y + 3 + Math.floor(a * 3), 2, 1, tint(road, 0.9)); if (a < 0.2) R(x + 4, y + 5, 1, 2, tint(road, 1.1));       // ruts
        const e = h(tx, ty, 45);
        if (e > 0.94) { R(x + 3, y + 4, 4, 2, '#8fa8b8'); R(x + 4, y + 4, 2, 1, '#b8ccd8'); }                                                           // a puddle
        else if (e > 0.88 && dTown > 40) { R(x + 4, y + 2 + Math.floor(b * 4), 1, 2, '#8a9a4a'); R(x + 5, y + 4 + Math.floor(a * 3), 1, 2, '#93a85c'); }      // grass coming up the middle, far from anywhere
        else if (e > 0.85) { R(x + 2 + Math.floor(b * 4), y + 3 + Math.floor(a * 3), 2, 1, '#a39a8a'); R(x + 5, y + 6, 1, 1, '#8f8676'); }                 // stones kicked loose
        if (h(tx, ty, 44) > 0.975) {            // a milestone: tall or stubby, square or round-topped, leaning, mossed, or down
          const m1 = h(tx, ty, 615), m2 = h(tx, ty, 616), mh = 3 + Math.floor(m1 * 3), side = m2 > 0.5 ? 8 : 0;
          if (m1 > 0.9) { R(x + side - (side ? 2 : 0), y + 5, 4, 2, '#c9c3ae'); R(x + side - (side ? 2 : 0), y + 5, 4, 1, '#e4dfcd'); }
          else { R(x + side, y + 6 - mh, 2, mh, '#c9c3ae'); R(x + side, y + 6 - mh, 1, mh, '#e4dfcd'); if (m2 > 0.75 || m2 < 0.25) R(x + side, y + 5 - mh, 2, 1, '#b5af9b'); if (m1 < 0.3) R(x + side, y + 5, 2, 1, '#6f8a4a'); if (m1 > 0.6) R(x + side + 1, y + 7 - mh, 1, 1, '#8f8876'); }
        }
        else if (h(tx, ty, 46) > 0.992) {       // a wayside altar: its own roof, its own god, something left on it
          const m1 = h(tx, ty, 617), m2 = h(tx, ty, 618), roof = m1 > 0.66 ? '#b8553a' : m1 > 0.33 ? '#8a6a3a' : '#c9c3ae';
          R(x, y + 2, 3, 5, '#d8d2c0'); R(x - 1, y + 1, 5, 1, roof); if (m1 > 0.5) R(x, y, 3, 1, roof);
          R(x + 1, y + 4, 1, 2, m2 > 0.6 ? '#e2702a' : m2 > 0.3 ? '#c9a21e' : '#5a8a46'); if (m2 > 0.5) R(x + 3, y + 6, 1, 1, '#c23b2e');
        }
      }
    } else if (k === T_WATER) {
      const dp = deep(tx, ty), nz = wildNoise(tx / 6, ty / 6, 311), reg = wildRegion(x + 5, y + 5), sea = tx < 16 || reg === 'The Salt Shore' || !!seaM[ty * TW + tx];
      const sd = Math.min(9, shoreD[ty * TW + tx]);
      let sdA = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const ax = Math.max(0, Math.min(TW - 1, tx + dx)), ay = Math.max(0, Math.min(TH - 1, ty + dy)); sdA += Math.min(9, shoreD[ay * TW + ax]); }
      sdA = sdA / 25 + (wildNoise(tx / 4, ty / 4, 1030) - 0.5) * 1.6;      // the depth, smoothed, so that it shelves and does not step
      if (sd >= 2) { const dt = Math.max(0, Math.min(1, (sdA - 1.7) / 2.4)); R(x, y, 10, 10, `rgb(${Math.round(90 - 27 * dt)},${Math.round(156 - 31 * dt)},${Math.round(198 - 27 * dt)})`); }
      R(x, y, 10, 10, nz > 0.5 ? `rgba(255,255,255,${((nz - 0.5) * 0.14).toFixed(3)})` : `rgba(0,20,60,${((0.5 - nz) * 0.14).toFixed(3)})`);      // light and dark, so that no reach of it is one flat blue
      for (let q = 0, n = 1 + Math.floor(a * 3); q < n; q++) R(x + Math.floor(h(tx, ty, 312 + q) * 7), y + 1 + Math.floor(h(tx, ty, 316 + q) * 8), 2 + Math.floor(h(tx, ty, 320 + q) * 4), 1, dp ? '#5a9cc6' : '#8fc3e0');
      if (reg === 'Blackmere') R(x, y, 10, 10, 'rgba(58,62,28,.32)');                                                      // peat water, brown as tea
      else if (!sea && (reg === 'The High Fells' || reg === 'The Barrow Downs' || reg === 'The Quarry Hills')) R(x, y, 10, 10, 'rgba(214,228,242,.14)');      // cold water off the high ground
      if (sdA < 1.6 && reg !== 'Blackmere') { R(x, y, 10, 10, `rgba(${sea ? '130,228,206' : '170,218,200'},${(Math.min(1, (1.6 - sdA) / 1.2) * (sea ? 0.22 : 0.14)).toFixed(3)})`); for (let q = 0; q < 3; q++) R(x + Math.floor(h(tx, ty, 987 + q) * 8), y + Math.floor(h(tx, ty, 990 + q) * 9), 2, 1, sea ? 'rgba(226,210,150,.3)' : 'rgba(190,200,150,.25)'); }      // the bottom showing through the shallows
      else if (sdA > 2.6) { R(x, y, 10, 10, `rgba(8,24,70,${Math.min(0.26, (sdA - 2.6) * 0.05).toFixed(3)})`); for (let q = 0; q < 4; q++) R(x + Math.floor(h(tx, ty, 993 + q) * 8), y + Math.floor(h(tx, ty, 997 + q) * 9), 3, 2, q % 2 ? 'rgba(8,24,70,.05)' : 'rgba(120,170,210,.05)'); }      // and going dark over the deeps
      if (b > 0.8) R(x + 5, y + 7, 3, 1, '#35709c');
      const e = h(tx, ty, 324), narrow = !sea && ((!wet(at(tx - 2, ty)) && !wet(at(tx + 2, ty))) || (!wet(at(tx, ty - 2)) && !wet(at(tx, ty + 2))));
      if (narrow && e > 0.9 && e <= 0.972) { for (let q = 0; q < 4; q++) R(x + 1 + Math.floor(h(tx, ty, 620 + q) * 6), y + 1 + q * 2 + Math.floor(h(tx, ty, 624 + q) * 2), 2 + Math.floor(h(tx, ty, 628 + q) * 3), 1, '#e6f3fa'); R(x + 3, y + 5, 2, 2, '#7d7a72'); }      // white water over stones
      else if (narrow && e < 0.05) { const bw = 4 + Math.floor(b * 4); R(x + 1, y + 4, bw, 3, '#d2c08a'); R(x + 2, y + 3, Math.max(1, bw - 2), 1, '#e0d09c'); R(x + 2, y + 5, 1, 1, '#a39a8a'); }                                                                              // a bar of gravel
      else if (!dp && e > 0.972) { const rw = 3 + Math.floor(b * 3); R(x + 2, y + 4, rw, 3, '#7d7a72'); R(x + 2, y + 4, rw - 1, 1, '#a8a498'); R(x + 1, y + 7, rw + 2, 1, '#e6f3fa'); }      // a rock breaking the surface
      else if (!dp && !sea && e > 0.9) { for (let q = 0; q < 3; q++) R(x + 2 + q * 3, y + 2 + ((q * 5 + tx) % 4), 1, 4, q % 2 ? '#8a9a4a' : '#9aaa5a'); R(x + 5, y + 1 + ((5 + tx) % 4), 1, 2, '#6b4a2a'); }      // reeds standing in the shallows
      else if (!sea && e > 0.82 && e < 0.9 && (reg === 'Blackmere' || !dp)) { R(x + 2 + Math.floor(b * 5), y + 3 + Math.floor(a * 4), 3, 2, '#5f8f4a'); R(x + 3 + Math.floor(b * 5), y + 3 + Math.floor(a * 4), 1, 1, e > 0.86 ? '#f4d0d8' : '#f4f4f0'); }      // lily pads
      else if (sea && dp && e > 0.965) { R(x + 1, y + 2, 7, 5, 'rgba(20,50,40,.28)'); R(x + 3, y + 1, 4, 7, 'rgba(20,50,40,.22)'); }                                                                             // weed on the sea bed
      else if (sea && e < 0.012) { R(x + 2, y + 4, 4, 1, '#e6f3fa'); R(x + 5, y + 3, 2, 1, '#e6f3fa'); R(x + 1, y + 5, 2, 1, '#e6f3fa'); }                                                                       // a breaking wave
      // each reach of open water is of one sort: a swell running, a bed of kelp, skerries, a shoal, or flat calm;
      // a lake has wind lanes, fish, an islet; a river shows which way it runs
      const e2 = h(tx, ty, 981), wz = zq(wildNoise(tx / 8, ty / 8, 980), 5), w1 = h(tx, ty, 982), w2 = h(tx, ty, 983);
      if (sea && sd >= 3) {
        if (wz === 0 && e2 < 0.3) { const sx = x + Math.floor(w1 * 4), sy = y + 1 + Math.floor(w2 * 7), sw = 5 + Math.floor(w1 * 20) % 5; R(sx, sy, sw, 1, 'rgba(232,246,252,.34)'); R(sx + 1, sy + 1, sw - 2, 1, 'rgba(10,40,90,.22)'); }
        else if (wz === 1 && e2 < 0.24) { for (let q = 0; q < 3; q++) { const kx = x + 1 + Math.floor(h(tx, ty, 984 + q) * 7), ky = y + Math.floor(h(tx, ty, 1001 + q) * 5); R(kx, ky, 1, 4 + (q % 2), 'rgba(28,66,38,.5)'); R(kx + 1, ky + 1, 1, 2, 'rgba(28,66,38,.4)'); } if (w1 > 0.6) R(x + 4, y + 2, 1, 1, '#b89a4a'); }
        else if (wz === 2 && e2 < 0.04) { const rw = 3 + Math.floor(w1 * 5), rx0 = x + Math.floor(w2 * (9 - rw)); R(rx0 - 1, y + 6, rw + 2, 2, '#e6f3fa'); R(rx0, y + 4, rw, 3, '#6e6a62'); R(rx0, y + 4, Math.max(1, rw - 2), 1, '#a8a498'); R(rx0 + 1, y + 3, Math.max(1, rw - 3), 1, '#8a867c'); if (w1 > 0.55 && rw > 4) { R(rx0 + 1, y + 3, 3, 1, '#3a342e'); R(rx0 + 3, y + 2, 1, 1, '#3a342e'); } }      // a skerry, and a seal hauled out on it
        else if (wz === 3 && e2 < 0.42) { const bw = 5 + Math.floor(w1 * 5); R(x + Math.floor(w2 * (10 - bw)), y + 2 + Math.floor(w1 * 20) % 5, bw, 2 + (w2 > 0.5 ? 1 : 0), 'rgba(226,206,140,.26)'); }
        else if (wz === 4 && e2 < 0.03) { R(x + 3, y + 4, 2, 1, '#f4f4f0'); R(x + 6 + Math.floor(w1 * 2), y + 6, 2, 1, '#f4f4f0'); R(x + 4, y + 5, 1, 1, 'rgba(10,40,90,.3)'); }      // gulls sat on the water
      } else if (!sea && !narrow && sd >= 2) {
        if (wz <= 1 && e2 < 0.26) R(x, y + 1 + Math.floor(w1 * 8), 10, 1, 'rgba(255,255,255,.1)');
        else if (wz === 2 && e2 < 0.07) for (let q = 0; q < 4; q++) R(x + 1 + q * 2 + Math.floor(w1 * 2), y + 3 + ((q * 3 + tx) % 4), 2, 1, 'rgba(16,36,56,.42)');      // a shoal, dark under the surface
        else if (wz === 3 && e2 < 0.02 && sd >= 3) { R(x, y + 5, 10, 4, '#e6f3fa'); R(x + 1, y + 4, 8, 4, '#d2c08a'); R(x + 2, y + 3, 6, 3, col(T_GRASS, tx, ty)); R(x + 3, y + 1, 3, 3, '#4c7f38'); R(x + 3, y + 1, 2, 1, '#69a04a'); R(x + 7, y + 3, 1, 3, '#8a9a4a'); }      // an islet
        else if (wz === 4 && e2 < 0.012) { R(x + 2, y + 5, 6, 2, '#6b4f2c'); R(x + 3, y + 4, 4, 1, '#8a6a3a'); R(x + 5, y + 2, 1, 3, '#3a2a1c'); R(x + 1, y + 7, 8, 1, 'rgba(0,20,40,.3)'); }      // a punt, and a man fishing from it
      } else if (narrow && e2 < 0.55) {
        if (wet(at(tx - 1, ty)) && wet(at(tx + 1, ty))) R(x + Math.floor(w1 * 5), y + 2 + Math.floor(w2 * 6), 4 + Math.floor(w1 * 20) % 3, 1, 'rgba(224,242,252,.3)');
        else R(x + 2 + Math.floor(w2 * 6), y + Math.floor(w1 * 5), 1, 4 + Math.floor(w1 * 20) % 3, 'rgba(224,242,252,.3)');
      }
      // surf along the shore
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy], n) => {
        if (tx + dx < 0 || ty + dy < 0 || tx + dx >= TW || ty + dy >= TH) return;      // the sea runs off the edge of the map: no surf there
        const o = at(tx + dx, ty + dy);
        if (wet(o) || o === T_BRIDGE) return;
        // white where the sea breaks; on a river or a mere only the water lying a little paler against the bank
        // (nor in a creek or among islets, where land is on more than one side: there the white made a scribble)
        const open = sea && [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([ex, ey]) => { const o2 = at(tx + ex, ty + ey); return !wet(o2) && o2 !== T_BRIDGE; }).length === 1;
        for (let i = 0; i < (open ? 2 : 1); i++) { const q = 1 + Math.floor(h(tx, ty, 50 + n * 2 + i) * 6); R(dx ? x + (dx > 0 ? 7 : 2) : x + q, dy ? y + (dy > 0 ? 7 : 2) : y + q, dx ? 1 : 3, dx ? 3 : 1, open ? '#e6f3fa' : 'rgba(190,224,240,.4)'); }
      });
    }
    else if (k === T_SAND) {
      const v = h(tx, ty, 330);
      if (a > 0.6) R(x + Math.floor(b * 8), y + Math.floor(a * 8), 2, 1, '#c2ad72');
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(tx + dx, ty + dy) === T_WATER)) { R(x, y, 10, 10, 'rgba(110,85,40,.16)'); R(x + Math.floor(b * 5), y + 2 + Math.floor(a * 6), 4, 1, 'rgba(255,255,255,.28)'); }      // wet from the last wave
      if (v > 0.93) { const dw = 5 + Math.floor(b * 4), dx = x + Math.floor(a * (10 - dw)), dy = y + 4 + Math.floor(h(tx, ty, 331) * 3); R(dx, dy, dw, 2, '#e8d8a4'); R(dx + 1, dy - 1, dw - 2, 1, '#f0e2b4'); R(dx, dy + 2, dw + 1, 1, '#c2ad72'); if (b > 0.4) { R(dx + 2, dy - 3, 1, 2, '#9aa860'); R(dx + 4, dy - 2, 1, 1, '#9aa860'); } }      // a dune, with marram on it
      else if (v > 0.86) for (let q = 0; q < 2 + Math.floor(b * 3); q++) { const gx = x + 1 + Math.floor(h(tx, ty, 332 + q) * 8), gy = y + 3 + Math.floor(h(tx, ty, 336 + q) * 5); R(gx, gy, 1, 3, '#9aa860'); R(gx + (q % 2 ? 1 : -1), gy - 1, 1, 1, '#aab870'); }      // marram grass
      else if (v > 0.8) { const wy = y + 2 + Math.floor(b * 6); for (let q = 0; q < 10; q += 2) if (h(tx + q, ty, 340) > 0.3) R(x + q, wy + ((q >> 1) % 2), 2, 1, q % 4 ? '#6b6a3a' : '#57562e'); }      // wrack left by the tide
      else if (v > 0.76) for (let q = 0; q < 3; q++) R(x + 1 + Math.floor(h(tx, ty, 341 + q) * 8), y + 1 + Math.floor(h(tx, ty, 344 + q) * 8), 1, 1, q % 2 ? '#f1ead8' : '#f4d0d8');                          // shells
      else if (v > 0.73) logs(x, y, tx, ty, ['#a89878', '#c0b090', '#8a7a5c']);      // driftwood, no two pieces alike
      else if (v > 0.718) { R(x + 4, y + 5, 2, 1, '#c2503a'); R(x + 3, y + 6, 1, 1, '#c2503a'); R(x + 6, y + 6, 1, 1, '#c2503a'); }                                                                             // a crab
      else if (v < 0.04) for (let q = 0; q < 3; q++) R(x + 1 + Math.floor(h(tx, ty, 347 + q) * 7), y + 2 + Math.floor(h(tx, ty, 350 + q) * 6), 2, 1, q % 2 ? '#a39a8a' : '#b5ad9c');                          // shingle
      else if (v < 0.07) { R(x + 4, y + 5, 2, 1, '#f1ead8'); R(x + 5, y + 4, 1, 1, '#f1ead8'); }
      else {
        const bz = zq(wildNoise(tx / 6, ty / 6, 985), 5), s2 = h(tx, ty, 986), s3 = h(tx, ty, 1005);
        if (s2 > 0.988) { R(x + 1, y + 7, 9, 1, 'rgba(0,0,0,.18)'); R(x + 1, y + 4, 8, 3, '#6b4f2c'); R(x + 2, y + 3, 6, 1, '#7a5a34'); R(x + 1, y + 5, 8, 1, '#4a3320'); R(x + 4, y + 3, 1, 4, '#8a6a3a'); }      // a boat drawn up and turned over
        else if (s2 > 0.975) { R(x + 1, y + 2, 1, 6, '#6b4f2c'); R(x + 8, y + 2, 1, 6, '#6b4f2c'); R(x + 1, y + 3, 8, 1, '#8a7a5c'); for (let q = 0; q < 3; q++) R(x + 2 + q * 2, y + 4, 1, 2, q % 2 ? '#b8c0c8' : '#98a4b0'); }      // fish hung to dry
        else if (s2 > 0.96) for (let q = 0; q < 4; q++) R(x + 1 + q * 2, y + 2 + q * 2 + (q % 2), 1, 1, '#b39c60');                                                                // somebody walked here
        else if (bz === 0 && s2 < 0.6) for (let q = 0; q < 3; q++) { R(x + (q % 2) * 2 + Math.floor(s3 * 2), y + 1 + q * 3, 4, 1, '#c6b176'); R(x + 5 + (q % 2), y + 2 + q * 3, 3, 1, '#c6b176'); }      // sand in ripples
        else if (bz === 1 && s2 < 0.75) { R(x, y, 10, 10, 'rgba(120,120,116,.14)'); for (let q = 0; q < 6; q++) R(x + Math.floor(h(tx, ty, 1006 + q) * 9), y + Math.floor(h(tx, ty, 1012 + q) * 9), 1 + (q % 2), 1, ['#a39a8a', '#e4dfcd', '#8a8478'][q % 3]); }      // a beach of shingle
        else if (bz === 2 && s2 < 0.32) { const dw = 7 + Math.floor(s3 * 3), dx0 = x + Math.floor(s3 * 30) % 3; R(dx0 + 1, y + 7, dw + 1, 1, '#bfa868'); R(dx0, y + 4, dw, 3, '#ecdca8'); R(dx0 + 1, y + 3, dw - 3, 1, '#f4e6b8'); R(dx0 + dw - 3, y + 4, 3, 3, '#d2be86'); if (s3 > 0.4) { R(dx0 + 2, y + 1, 1, 3, '#9aa860'); R(dx0 + 3, y + 2, 1, 1, '#aab870'); R(dx0 + 5, y + 2, 1, 2, '#9aa860'); } }      // a high dune
        else if (bz === 3 && s2 < 0.4) { const pw = 5 + Math.floor(s3 * 4), px = x + Math.floor(s3 * 30) % (10 - pw + 1); R(px, y + 3, pw, 4, '#efe9d8'); R(px + 1, y + 2, pw - 2, 1, '#efe9d8'); R(px + 1, y + 7, pw - 3, 1, '#efe9d8'); R(px + 2, y + 4, 1, 2, '#d6ceb6'); R(px + 3, y + 5, pw - 4, 1, '#d6ceb6'); }      // salt, dried white in a pan
        else if (bz === 4 && s2 < 0.14) { const pw = 4 + Math.floor(s3 * 3), px = x + 1 + Math.floor(s3 * 30) % 3; R(px - 1, y + 3, pw + 2, 5, '#b8a26a'); R(px, y + 4, pw, 3, '#5fa8b8'); R(px + 1, y + 4, pw - 2, 1, '#8fd0d8'); if (s3 > 0.5) R(px + pw - 2, y + 6, 1, 1, '#d8603a'); else R(px + 1, y + 6, 2, 1, '#3f7a5a'); }      // a pool the tide left
      }
    }
    else if (k === T_MEADOW) {
      const z = wildNoise(tx / 3.5, ty / 3.5, 401), zc = z < 0.32 ? ['#c23b2e', '#e06a5a'] : z < 0.5 ? ['#f2e6a0', '#e8d060'] : z < 0.68 ? ['#f4f4f0', '#f2e6a0'] : ['#b9a0e0', '#e8a0c0'];
      for (let q = 0, n = 1 + Math.floor(h(tx, ty, 402) * 5); q < n; q++) R(x + Math.floor(h(tx, ty, 403 + q) * 10), y + Math.floor(h(tx, ty, 409 + q) * 10), 1, 1, zc[q % 2]);
      if (a > 0.9) { const lean = b > 0.5 ? 1 : -1; for (let q = 0; q < 3; q++) { const gx = x + 1 + Math.floor(h(tx, ty, 415 + q) * 8), gy = y + 3 + Math.floor(h(tx, ty, 418 + q) * 5); R(gx, gy, 1, 3, '#93b055'); R(gx + lean, gy - 1, 1, 1, '#a8c468'); } }      // long grass
      else if (a > 0.84) { R(x + 1 + Math.floor(b * 5), y + 4, 4, 3, '#6f9a48'); R(x + 2 + Math.floor(b * 5), y + 3, 2, 1, '#6f9a48'); R(x + 2 + Math.floor(b * 5), y + 5, 1, 1, '#f4f4f0'); }      // clover
      else if (a < 0.02) { R(x + 4, y + 3, 1, 1, '#f4f4f0'); R(x + 6, y + 3, 1, 1, '#f4f4f0'); R(x + 5, y + 4, 1, 1, '#2a1c14'); }                                                              // a butterfly
      else if (a < 0.035) rocks(x, y, tx, ty, wildRegion(x + 5, y + 5));
      else if (!farm(tx, ty)) {
        // A meadow is hay ground mown in swathes, a field of poppies, a stand of tall spires, a lawn of daisies and
        // buttercups, bee pasture, or rough ground gone to teasel.
        const dz = zq(wildNoise(tx / 8, ty / 8, 1050), 6), d1 = h(tx, ty, 1051), d2 = h(tx, ty, 1052), d3 = h(tx, ty, 1053), base = col(k, tx, ty);
        if (d1 > 0.994) { R(x + 2, y + 7, 7, 1, 'rgba(0,0,0,.18)'); R(x + 3, y + 3, 4, 4, '#c9a763'); R(x + 4, y + 2, 2, 1, '#c9a763'); R(x + 3, y + 4, 4, 1, '#a8853f'); R(x + 3, y + 6, 4, 1, '#a8853f'); R(x + 4, y + 6, 1, 1, '#2a1c14'); }      // a skep of bees
        else if (d1 > 0.988) { R(x + 3, y + 4, 4, 3, '#4f86ae'); R(x + 4, y + 3, 2, 1, '#4f86ae'); R(x + 4, y + 4, 2, 1, '#8fc0de'); R(x + 6, y + 6, 1, 4, '#4f86ae'); R(x + 2, y + 3, 1, 2, '#8a9a4a'); R(x + 3, y + 7, 2, 1, '#a39a8a'); }                        // a spring, and the trickle running off
        else if (dz === 0 && d1 < 0.7) { const mown = wildNoise(tx / 3, ty / 3, 1054) > 0.5; if (mown) { R(x, y + 1 + (ty % 2) * 2, 10, 1, tint(base, 0.9)); R(x, y + 6 + (ty % 2), 10, 1, tint(base, 0.9)); R(x + Math.floor(d2 * 6), y + 2 + (ty % 2) * 2, 4, 1, '#cdb866'); R(x + Math.floor(d3 * 6), y + 7 + (ty % 2), 3, 1, '#cdb866'); if (d2 > 0.86) { R(x + 3, y + 3, 4, 3, '#d9c070'); R(x + 4, y + 2, 2, 1, '#e6d088'); R(x + 3, y + 6, 5, 1, 'rgba(0,0,0,.16)'); } } else for (let q = 0; q < 5; q++) { const gx = x + q * 2 + Math.floor(d2 * 2), gy = y + 2 + Math.floor(h(tx, ty, 1055 + q) * 5); R(gx, gy, 1, 4, tint(base, q % 2 ? 0.86 : 1.1)); R(gx, gy - 1, 1, 1, '#d8c880'); } }      // hay: cut and lying in rows, or standing ready
        else if (dz === 1 && d1 < 0.75) for (let q = 0, n = 5 + Math.floor(d2 * 6); q < n; q++) { const fx = x + Math.floor(h(tx, ty, 1060 + q) * 10), fy = y + Math.floor(h(tx, ty, 1071 + q) * 10); R(fx, fy, 1 + (q % 3 === 0 ? 1 : 0), 1, q % 4 ? '#d0382a' : '#e8604a'); if (q % 3 === 0) R(fx, fy + 1, 1, 1, '#4f7a3a'); }                                                    // poppies, thick as a carpet
        else if (dz === 2 && d1 < 0.6) for (let q = 0, n = 2 + Math.floor(d2 * 4); q < n; q++) { const fx = x + 1 + Math.floor(h(tx, ty, 1060 + q) * 8), fy = y + 2 + Math.floor(h(tx, ty, 1071 + q) * 5), sp = [['#b070c0', '#d098dc'], ['#e07898', '#f0a8bc'], ['#6f80d8', '#98a8f0'], ['#f0e070', '#f8f0a0']][Math.floor(wildNoise(tx / 2.5, ty / 2.5, 1056) * 3.999)]; R(fx, fy + 3, 1, 2, '#4f7a3a'); R(fx, fy, 1, 3, sp[0]); R(fx, fy, 1, 1, sp[1]); }      // foxglove, lupin, mullein: tall spires, each colour in its own stand
        else if (dz === 3 && d1 < 0.7) { R(x + Math.floor(d2 * 4), y + 1 + Math.floor(d3 * 4), 6, 5, tint(base, 1.06)); for (let q = 0; q < 8; q++) R(x + Math.floor(h(tx, ty, 1060 + q) * 10), y + Math.floor(h(tx, ty, 1071 + q) * 10), 1, 1, q % 3 ? '#f8f8f4' : '#f0d840'); }      // daisies and buttercups, on short turf
        else if (dz === 4 && d1 < 0.4) { const bx = x + 1 + Math.floor(d2 * 5), by = y + 3 + Math.floor(d3 * 3), bc = d2 > 0.5 ? ['#b9a0e0', '#d8c8f0'] : ['#e8a0c0', '#f4d0e0']; R(bx, by + 3, 5, 1, 'rgba(0,0,0,.14)'); R(bx, by, 4, 3, '#5f8a4a'); R(bx + 1, by - 1, 2, 1, '#5f8a4a'); for (let q = 0; q < 4; q++) R(bx + (q % 2) * 2 + Math.floor(d3 * 2), by - 1 + q, 1, 1, bc[q % 2]); if (d3 > 0.7) R(bx + 5, by - 2, 1, 1, '#2a1c14'); }      // bee pasture: lavender and thyme in clumps, and a bee over them
        else if (dz === 5 && d1 < 0.45) for (let q = 0, n = 1 + Math.floor(d2 * 3); q < n; q++) { const fx = x + 1 + Math.floor(h(tx, ty, 1060 + q) * 8), fy = y + 2 + Math.floor(h(tx, ty, 1071 + q) * 4); R(fx, fy + 1, 1, 5, '#7a7a4a'); R(fx - 1, fy + 3, 1, 1, '#7a7a4a'); R(fx + 1, fy + 2, 1, 1, '#7a7a4a'); R(fx, fy, 1, 2, q % 2 ? '#8a6a4a' : '#a070b0'); }      // teasel and thistle, head high
      }
    }
    else if (k === T_MARSH) {
      const v = h(tx, ty, 220), mreg = wildRegion(x + 5, y + 5), salt = mreg === 'The Salt Shore' || tx < 30, mz = salt ? 6 : zq(wildNoise(tx / 7, ty / 7, 1040), 6), m1 = h(tx, ty, 1041), m2 = h(tx, ty, 1042), m3 = h(tx, ty, 1043);
      const pw0 = mreg === 'Blackmere' ? ['#34504a', '#44665e', '#6a8a82'] : ['#3d5a52', '#4f7470', '#7a9a98'];
      // A marsh is a mere of open water, a reedbed, a mudflat with a creek through it, a carr of stunted alder, a
      // sedge moor white with cotton-grass, a quaking bog of red and green moss, or by the sea a salting.
      if (m1 < 0.7) {
        if (mz === 0) { const mere = (ax, ay) => at(ax, ay) === T_WATER || (at(ax, ay) === T_MARSH && ax >= 30 && zq(wildNoise(ax / 7, ay / 7, 1040), 6) === 0 && h(ax, ay, 1041) < 0.7); const iw = mere(tx - 1, ty) ? 0 : 1 + Math.floor(m2 * 2), ie = mere(tx + 1, ty) ? 0 : 1 + Math.floor(m3 * 2), inn = mere(tx, ty - 1) ? 0 : 1 + Math.floor(m3 * 2), is = mere(tx, ty + 1) ? 0 : 1 + Math.floor(m2 * 2); R(x + iw, y + inn + (inn ? 1 : 0), 10 - iw - ie, 10 - inn - is - (inn ? 1 : 0) - (is ? 1 : 0), pw0[0]); R(x + iw + (iw ? 1 : 0), y + inn, 10 - iw - ie - (iw ? 1 : 0) - (ie ? 1 : 0), 10 - inn - is, pw0[0]); R(x + (iw ? iw + 1 : 0), y + (inn ? inn + 1 : 0), 10 - (iw ? iw + 1 : 0) - (ie ? ie + 1 : 0), 10 - (inn ? inn + 1 : 0) - (is ? is + 1 : 0), pw0[1]); R(x + 2 + Math.floor(m2 * 4), y + 3 + Math.floor(m3 * 3), 3, 1, pw0[2]); if (m3 > 0.8) { R(x + 5, y + 6, 3, 2, '#5f8f4a'); R(x + 6, y + 6, 1, 1, m2 > 0.5 ? '#f4d0d8' : '#f4f4f0'); } else if (m3 < 0.1) { R(x + 3, y + 5, 2, 1, '#6a5a3a'); R(x + 5, y + 5, 1, 1, '#2f6a3a'); R(x + 6, y + 6, 1, 1, '#6a5a3a'); } }      // open water, lilies on it, a duck and her young
        else if (mz === 1) for (let q = 0, n = 6 + Math.floor(m2 * 4); q < n; q++) { const rx0 = x + Math.floor(h(tx, ty, 1044 + q) * 10), ry0 = y + Math.floor(h(tx, ty, 1061 + q) * 4), hh = 4 + Math.floor(h(tx, ty, 1072 + q) * 4); R(rx0, ry0, 1, hh, ['#b8a85a', '#9aaa5a', '#c8b870'][q % 3]); if (q % 2) R(rx0, ry0 - 1, 1, 2, '#7a5a34'); }      // reeds, taller than a man, gone to gold
        else if (mz === 2) { R(x, y, 10, 10, 'rgba(96,84,58,.5)'); let gx = x + 3 + Math.floor(wildNoise(tx / 2, ty / 2, 1045) * 4); for (let q = 0; q < 10; q++) { gx += h(tx + q, ty, 1046) > 0.62 ? 1 : h(tx, ty + q, 1047) > 0.62 ? -1 : 0; R(gx, y + q, 2, 1, pw0[1]); if (q % 4 === 0) R(gx, y + q, 1, 1, pw0[2]); } if (m2 > 0.6) for (let q = 0; q < 3; q++) { R(x + 1 + q * 2, y + 2 + q + Math.floor(m3 * 4), 1, 1, '#4a4030'); } }      // mud, a creek winding through it, and where a bird has walked
        else if (mz === 3) { R(x, y, 10, 10, 'rgba(84,122,58,.22)'); if (m2 < 0.6) { const ax = x + 2 + Math.floor(m3 * 5), ay = y + 6 + Math.floor(m2 * 4); R(ax - 2, ay + 1, 6, 1, 'rgba(0,0,0,.2)'); R(ax, ay - 3, 1, 4, '#3a3028'); R(ax + 1, ay - 2, 1, 2, '#3a3028'); R(ax - 2, ay - 6, 5, 3, '#44663a'); R(ax - 1, ay - 7, 3, 1, '#44663a'); R(ax - 2, ay - 6, 2, 1, '#5c8250'); } else { R(x + 2 + Math.floor(m3 * 4), y + 5, 4, 2, pw0[0]); R(x + 1 + Math.floor(m3 * 4), y + 4, 2, 1, '#6f9a48'); } }      // a carr: alder standing in the wet, moss between
        else if (mz === 4) for (let q = 0, n = 2 + Math.floor(m2 * 3); q < n; q++) { const sx = x + 1 + Math.floor(h(tx, ty, 1044 + q) * 7), sy = y + 3 + Math.floor(h(tx, ty, 1061 + q) * 5); if (q % 2) { R(sx, sy, 3, 2, '#8a9a5a'); R(sx + 1, sy - 1, 1, 1, '#a4b472'); } else { R(sx, sy - 1, 1, 3, '#8a9a5a'); R(sx, sy - 2, 1, 1, '#f6f6f2'); R(sx + 1, sy - 2, 1, 1, '#e4e4dc'); } }      // sedge, and cotton-grass in its white tufts
        else if (mz === 5) { for (let q = 0; q < 4; q++) R(x + Math.floor(h(tx, ty, 1044 + q) * 7), y + Math.floor(h(tx, ty, 1061 + q) * 8), 3, 2, ['#8a4a3a', '#7a9a3a', '#b8a03a', '#a05a44'][q]); if (m2 > 0.7) { R(x + 3, y + 4, 4, 2, '#1e2622'); R(x + 4, y + 4, 2, 1, '#3a4a44'); } }      // a quaking bog: moss in red and green and yellow, and a black eye of water
        else { for (let q = 0, n = 3 + Math.floor(m2 * 5); q < n; q++) R(x + Math.floor(h(tx, ty, 1044 + q) * 10), y + Math.floor(h(tx, ty, 1061 + q) * 10), 1, 1, q % 3 ? '#a888c8' : '#c8b0e0'); if (m3 > 0.5) { let gx = x + 4 + Math.floor(m2 * 3); for (let q = 0; q < 10; q++) { gx += h(tx + q, ty, 1046) > 0.6 ? 1 : h(tx, ty + q, 1047) > 0.6 ? -1 : 0; R(gx, y + q, 1, 1, '#6fa8c8'); } } if (m3 < 0.15) { R(x + 2, y + 5, 5, 2, '#e8e2d0'); R(x + 3, y + 5, 3, 1, '#f6f2e6'); } }      // a salting: sea-lavender, a tidal creek, a crust of salt
        if (m3 > 0.994) { for (let q = 0; q < 3; q++) R(x + q * 3, y + 4 + (q % 2), 4, 2, q % 2 ? '#8a6a3a' : '#77592e'); }                                                                         // planks laid over the worst of it
        else if (m3 > 0.988) { for (let q = 0; q < 4; q++) R(x + 1 + q * 2, y + 3 + (q % 2), 1, 4, '#4a4030'); R(x + 1, y + 4, 7, 1, '#6a5a44'); }                                                    // stakes of an eel weir
      } else {
      if (v > 0.5) {                           // standing water: a pool with its own outline
        const rx = 2 + Math.floor(h(tx, ty, 221) * 5), ry = 1 + Math.floor(h(tx, ty, 222) * 3), cx = x + 2 + Math.floor(a * 6), cy = y + 3 + Math.floor(b * 5);
        for (let dy = -ry; dy <= ry; dy++) { const w = Math.max(1, Math.round(rx * Math.sqrt(1 - (dy * dy) / (ry * ry + 0.4)) + (h(cx, cy + dy, 223) - 0.5) * 1.5)); R(cx - w, cy + dy, w * 2 + 1, 1, dy === -ry ? '#34504a' : '#3d5a52'); }
        R(cx - Math.max(1, rx - 2), cy, Math.max(2, rx), 1, '#587a78');
        if (h(tx, ty, 224) > 0.6) { R(cx + 1, cy - 1, 2, 1, '#5f8f4a'); if (h(tx, ty, 225) > 0.5) R(cx + 1, cy - 1, 1, 1, '#f4f4f0'); }
      }
      else if (v > 0.38) { const mw = 3 + Math.floor(b * 4); R(x + Math.floor(a * (10 - mw)), y + 4 + Math.floor(h(tx, ty, 226) * 4), mw, 2, '#5a5038'); R(x + 1 + Math.floor(a * (9 - mw)), y + 4 + Math.floor(h(tx, ty, 226) * 4), Math.max(1, mw - 2), 1, '#6b6046'); }      // bare mud
      else if (v > 0.2) { const tw = 3 + Math.floor(b * 3), txx = x + Math.floor(a * (10 - tw)), tyy = y + 4 + Math.floor(h(tx, ty, 227) * 4); R(txx, tyy, tw, 2, '#7a925a'); R(txx + 1, tyy - 1, Math.max(1, tw - 2), 1, '#96ae6e'); R(txx, tyy + 2, tw, 1, 'rgba(0,0,0,.15)'); }      // a tussock to stand on
      for (let q = 0, n = Math.floor(h(tx, ty, 228) * 4); q < n; q++) {      // reeds, in clumps of every size, some in seed
        const rx0 = x + Math.floor(h(tx, ty, 229 + q) * 10), ry0 = y + 1 + Math.floor(h(tx, ty, 233 + q) * 5), hh = 3 + Math.floor(h(tx, ty, 237 + q) * 3);
        R(rx0, ry0, 1, hh, q % 2 ? '#8a9a4a' : '#9aaa5a'); if (h(tx, ty, 241 + q) > 0.55) R(rx0, ry0 - 1, 1, 2, '#6b4a2a');
      }
      if (v < 0.01) { R(x + 4, y + 1, 1, 5, '#f1ead8'); R(x + 5, y, 2, 1, '#f1ead8'); R(x + 7, y, 1, 1, '#e3b04a'); R(x + 4, y + 6, 1, 3, '#b89a5a'); R(x + 3, y + 3, 1, 2, '#d8d2c0'); }      // a heron, fishing
      else if (v < 0.03) logs(x, y, tx, ty, ['#4a4038', '#5e5448', '#3a3028']);      // a trunk going back into the bog
      }
    }
    else if (k === T_HILL) {
      // each stretch of high ground has its own colour, and each mound its own size and shape
      const reg = wildRegion(x + 5, y + 5), t = tone(tx, ty) * (0.94 + h(tx, ty, 120) * 0.12);
      const pal = reg === 'The Quarry Hills' ? ['#b9b083', '#cfc79c', '#8d8660', '#77704e'] : reg === 'The High Fells' ? ['#8f9a78', '#a6b08e', '#6c765a', '#5a634a'] : reg === 'The Barrow Downs' ? ['#86a05a', '#9ab56c', '#64803f', '#52692f'] : ['#a3a866', '#b9be7c', '#7f8548', '#6b703a'];
      const hillN = (at(tx - 1, ty) === T_HILL) + (at(tx + 1, ty) === T_HILL) + (at(tx, ty - 1) === T_HILL) + (at(tx, ty + 1) === T_HILL);
      const rk = reg === 'The Quarry Hills' ? ['#d2cbb6', '#8f8876'] : reg === 'The High Fells' ? ['#a2aab4', '#646c78'] : reg === 'The Barrow Downs' ? ['#e6e2d2', '#b4b09c'] : ['#aaa496', '#6b665c'];
      // a hill is a dome (0), a long ridge (1), a steep cone (2), a tor with rock on its crown (3), a flat-topped
      // table with a band of rock under the rim (4), or a scarp with a broken face to the south-east (5)
      const gcol = col(k, tx, ty), mound = (cx, cy, rx, ry, sh) => hillMound(cx, cy, rx, ry, sh, pal, rk, t, gcol);
      const hd = hillDepth(tx, ty), quiet = h(tx, ty, 1360) > 0.5;
      if (a > (hd === 1 ? 0.6 : hd === 2 ? 0.66 : hd === 3 ? 0.72 : 0.76)) {
        const form = h(tx, ty, 911) < 0.6 ? zq(wildNoise(tx / 8, ty / 8, 910), 6) : Math.floor(h(tx, ty, 912) * 6);
        let rx = hd === 1 ? 5 + Math.floor(b * 4) : hd === 2 ? 8 + Math.floor(b * 5) : hd === 3 ? 11 + Math.floor(b * 7) : 14 + Math.floor(b * 9), ry = Math.max(3, Math.round(rx * (0.5 + h(tx, ty, 122) * 0.28)));
        if (form === 1) { rx = Math.round(rx * 1.5); ry = Math.max(3, Math.round(rx * 0.3)); }
        else if (form === 2) ry = Math.round(rx * (0.8 + h(tx, ty, 122) * 0.3));
        else if (form === 4) ry = Math.max(3, Math.round(rx * 0.62));
        const cx = x + Math.floor(h(tx, ty, 123) * 10), cy = y + 2 + Math.floor(h(tx, ty, 124) * 10);
        if (h(tx, ty, 125) > 0.55) { const sdir = h(tx, ty, 1361) > 0.5 ? 1 : -1; mound(cx + sdir * Math.round(rx * 0.75), cy - 1 - Math.round(ry * 0.15), Math.max(3, Math.round(rx * 0.68)), Math.max(2, Math.round(ry * 0.72)), form === 1 ? 1 : 0); }      // a shoulder behind it, to one side or the other
        mound(cx, cy, rx, ry, form);
        const e = h(tx, ty, 126), top = cy - ry;
        if (e > 0.03 && e < 0.09) for (let q = 0, n = 1 + Math.floor(b * 3); q < n; q++) { const px = cx - 3 + q * 3, py = top + 1 + (q % 2); R(px, py, 1, 2, '#4a3320'); R(px - 1, py - 2, 3, 2, '#2c5230'); R(px, py - 4, 1, 2, '#2c5230'); R(px - 1, py - 2, 1, 1, '#437046'); }      // pines along the crown
        else if (e < 0.2 && form !== 4) { const hc = reg === 'The Quarry Hills' ? ['#b89a5a', '#cdb47a'] : ['#96689e', '#b488bc']; for (let q = 0; q < 4 + Math.floor(rx / 2); q++) { const hx = cx - Math.round(rx * 0.7) + Math.floor(h(tx + q, ty, 917) * rx * 1.2), hy = cy - 1 - Math.floor(h(tx, ty + q, 918) * ry * 0.7); R(hx, hy, 1 + (q % 2), 1, hc[q % 2]); } }      // heather in flower; on the dry hills, thorn
        else if (e < 0.26) for (let q = 0; q < rx; q++) R(cx - Math.round(rx * 0.6) + q, cy - 1 - Math.round(q * ry * 0.6 / rx), 1, 1, tint(pal[1], t * 1.12));      // a sheep track going up it
        else if (e < 0.3 && form !== 3) { R(cx - 1, top - 1, 3, 2, rk[1]); R(cx, top - 3, 1, 2, rk[0]); R(cx - 1, top - 1, 1, 1, rk[0]); }                              // a cairn
        else if (e < 0.34) for (let q = 0; q < 5; q++) R(cx + Math.floor(h(tx + q, ty, 919) * rx * 0.7), cy - 1 - Math.floor(h(tx, ty + q, 920) * ry * 0.5), 2, 1, q % 2 ? '#9a6a34' : '#b4803e');      // bracken, gone brown
        else if (e < 0.4 && reg === 'The Barrow Downs') { const sw = Math.max(2, rx >> 1); R(cx - sw + 1, cy - Math.round(ry * 0.5), sw, 2, '#eeeade'); R(cx - sw + 2, cy - Math.round(ry * 0.5) + 2, Math.max(1, sw - 1), 1, '#eeeade'); R(cx - sw + 1, cy - Math.round(ry * 0.5), 1, 1, '#cfcab8'); }      // a scar of chalk
        if (e > 0.93) { R(cx - 1, cy - ry - 1, 3, 2, '#9a958a'); R(cx - 1, cy - ry - 1, 2, 1, '#c4bfb2'); }                                            // a rock on the crown
        else if (e > 0.86) { R(cx - 3, cy - 2, 2, 1, '#55703a'); R(cx + 1, cy - 3, 2, 1, '#55703a'); R(cx - 1, cy - 1, 1, 1, '#6f8a4a'); }              // scrub
        else if (e > 0.82) for (let q = 0; q < 3; q++) R(cx - rx + 2 + q * 2, cy - 1 - q, rx - q * 2, 1, tint(pal[2], t));                              // terraces cut into it
        else if (e < 0.03) { R(cx, cy - ry - 5, 1, 5, '#4a3320'); R(cx - 2, cy - ry - 7, 5, 3, '#3f6a2c'); R(cx - 1, cy - ry - 8, 3, 1, '#57863a'); }  // a lone tree
      } else if (quiet) {                          // half of what lies between the hills is left as open turf
        if (b > 0.6) for (let q = 0; q < 2; q++) R(x + 1 + Math.floor(h(tx, ty, 1362 + q) * 8), y + 2 + Math.floor(h(tx, ty, 1364 + q) * 6), 2, 1, tint(pal[q ? 2 : 1], t));
      } else if (a < 0.1) {                        // bare ground between: stones, a goat track
        rocks(x, y, tx, ty, reg);
      } else if (a < 0.2) for (let q = 0; q < 5; q++) R(x + q * 2 + Math.floor(b * 2), y + 3 + Math.floor(h(tx + q, ty, 136) * 4), 2, 1, tint(pal[3], t));
      else if (a < 0.3) { const n = 2 + Math.floor(b * 3), gc = tint(pal[2], t); for (let q = 0; q < n; q++) { const gx = x + 1 + Math.floor(h(tx, ty, 137 + q) * 8), gy = y + 3 + Math.floor(h(tx, ty, 141 + q) * 5); R(gx, gy, 1, 2, gc); R(gx + 1, gy - 1, 1, 1, gc); } }      // heather and rough grass
      else if (a < 0.34) { R(x + 2 + Math.floor(b * 4), y + 5, 3, 2, '#55703a'); R(x + 3 + Math.floor(b * 4), y + 4, 2, 1, '#6f8a4a'); if (b > 0.5) R(x + 3 + Math.floor(b * 4), y + 5, 1, 1, '#e8d040'); }      // gorse
      else if (a < 0.346 && hillN === 4) { const pw = 5 + Math.floor(b * 4), px = x + Math.floor(h(tx, ty, 921) * (10 - pw)); R(px, y + 4, pw, 3, '#3f6f96'); R(px + 1, y + 3, pw - 2, 1, '#3f6f96'); R(px + 1, y + 7, pw - 2, 1, '#3f6f96'); R(px + 1, y + 4, pw - 3, 1, '#7fb0d0'); R(px, y + 7, pw, 1, 'rgba(0,0,0,.15)'); if (b > 0.6) { R(px + pw, y + 3, 1, 3, '#8a9a4a'); R(px + pw, y + 2, 1, 1, '#6b4a2a'); } }      // a tarn
      else if (a < 0.41) { for (let q = 0, n = 3 + Math.floor(b * 4); q < n; q++) { const sx = x + Math.floor(h(tx, ty, 922 + q) * 9), sy = y + 1 + Math.floor(h(tx, ty, 929 + q) * 8), sw = 1 + Math.floor(h(tx, ty, 936 + q) * 3); R(sx, sy, sw, 1 + (sw > 2 ? 1 : 0), q % 2 ? rk[1] : rk[0]); } }      // a field of broken rock
      else if (a < 0.44) { const sx = x + 1 + Math.floor(b * 3), sw = 5 + Math.floor(h(tx, ty, 943) * 4); R(sx, y + 5, sw, 2, rk[1]); R(sx, y + 4, sw - 1, 1, rk[0]); R(sx + 1, y + 3, Math.max(1, sw - 3), 1, rk[0]); R(sx, y + 7, sw + 1, 1, 'rgba(0,0,0,.18)'); if (b > 0.5) R(sx + 1, y + 4, 2, 1, '#6f8a4a'); }      // a slab of rock breaking the turf
      else if (a < 0.48) { let gx = x + 3 + Math.floor(b * 4); for (let q = 0; q < 10; q++) { gx += h(tx + q, ty, 944) > 0.6 ? 1 : h(tx, ty + q, 945) > 0.6 ? -1 : 0; R(gx, y + q, 1, 1, tint(pal[3], t * 0.9)); if (q % 3 === 0) R(gx + 1, y + q, 1, 1, '#7fb0d0'); } }      // a gully, water in the bottom of it
      else if (a < 0.52) { for (let q = 0, n = 2 + Math.floor(b * 3); q < n; q++) { const gx = x + 1 + Math.floor(h(tx, ty, 946 + q) * 8), gy = y + 3 + Math.floor(h(tx, ty, 951 + q) * 5); R(gx, gy, 1, 3, '#7a8a4a'); R(gx - 1, gy, 1, 1, '#7a8a4a'); R(gx + 1, gy + 1, 1, 1, '#7a8a4a'); if (q === 0) R(gx, gy - 1, 1, 1, '#b070c0'); } }      // thistles
    }
    else if (k === T_GRASS) {
      const f = farm(tx, ty);
      if (f) {                                 // a plot under one of seven crops
        const c = crop(tx, ty), mid = tx % 4 === 2 && ty % 3 === 1, pl = h(Math.floor(tx / 4), Math.floor(ty / 3), 73);
        if (c === 0) { R(x, y, 10, 10, '#c9b25a'); for (let q = 1; q < 10; q += 3) R(x, y + q, 10, 1, '#b39a44'); if (a > 0.9) { R(x + 4, y + 3, 3, 4, '#e0c868'); R(x + 5, y + 2, 1, 1, '#e0c868'); R(x + 4, y + 7, 3, 1, '#8f7a30'); } }      // wheat, and a stook
        else if (c === 1) { R(x, y, 10, 10, '#8fae52'); for (let q = 1; q < 10; q += 3) R(x, y + q, 10, 1, '#7b9a44'); }                                    // green corn
        else if (c === 2) { R(x, y, 10, 10, '#8a6a44'); for (let q = 0; q < 10; q += 2) R(x, y + q, 10, 1, '#74583a'); if (a > 0.92) { R(x + 3, y + 4, 2, 1, '#1c1310'); R(x + 6, y + 6, 2, 1, '#1c1310'); R(x + 4, y + 3, 1, 1, '#1c1310'); } }      // fallow, and crows on it
        else if (c === 3) { R(x, y, 10, 10, '#7f9a52'); for (let qy = 1; qy < 10; qy += 3) for (let qx = 1; qx < 10; qx += 3) { R(x + qx, y + qy, 2, 2, '#4f7a3a'); R(x + qx, y + qy, 1, 1, '#8fb865'); } }                                        // cabbages
        else if (c === 4) { R(x, y, 10, 10, '#86a45a'); for (let q = 0; q < 6; q++) R(x + Math.floor(h(tx, ty, 180 + q) * 10), y + Math.floor(h(tx, ty, 186 + q) * 10), 1, 1, q % 3 ? '#7fa0e0' : '#a8c0f0'); }                                // flax in flower
        else if (c === 5) { R(x, y, 10, 10, '#8aa052'); for (let q = 1; q < 10; q += 3) { R(x + q, y + 1, 1, 8, '#6b4f2c'); R(x + q - 1, y + 2, 3, 2, '#55803a'); R(x + q - 1, y + 5, 3, 2, '#55803a'); } }                                        // beans on their poles
        else if (c === 6) { R(x, y, 10, 10, '#d8c880'); for (let q = 0; q < 10; q += 2) R(x + ((q + ty) % 3), y + q, 8, 1, '#c2b068'); }
        else if (c === 7) { R(x, y, 10, 10, '#8a7a52'); for (let q = 1; q < 10; q += 4) { R(x, y + q + 1, 10, 1, '#6b4f2c'); for (let i = 0; i < 10; i += 3) { R(x + i, y + q - 1, 2, 2, '#4f7a3a'); if (h(tx + i, ty + q, 1100) > 0.5) R(x + i + 1, y + q + 1, 1, 1, '#6a3a7a'); } } }      // vines on their wires, the grapes dark
        else if (c === 8) { R(x, y, 10, 10, '#86a45a'); const ox = x + 2 + (ty % 2) * 3, oy = y + 6; R(ox - 1, oy + 1, 5, 1, 'rgba(0,0,0,.18)'); R(ox + 1, oy - 2, 1, 3, '#5a3f26'); R(ox - 1, oy - 5, 5, 3, '#4c7f38'); R(ox, oy - 6, 3, 1, '#4c7f38'); R(ox - 1, oy - 5, 2, 1, '#69a04a'); R(ox + (tx % 3), oy - 4, 1, 1, h(Math.floor(tx / 4), Math.floor(ty / 3), 1101) > 0.5 ? '#d8382a' : '#e8c040'); }      // an orchard: apples, or pears
        else if (c === 9) { R(x, y, 10, 10, '#7f8f4a'); for (let q = 0; q < 3; q++) { const gx = x + 1 + Math.floor(h(tx, ty, 1102 + q) * 7), gy = y + 1 + Math.floor(h(tx, ty, 1105 + q) * 7); R(gx, gy, 2, 2, '#d8802a'); R(gx, gy, 1, 1, '#f0a040'); R(gx + 2, gy + 1, 2, 1, '#55803a'); } }      // gourds lying among their leaves
        else { R(x, y, 10, 10, '#8fb05a'); if (a > 0.7) { R(x + 2 + Math.floor(b * 5), y + 4, 1, 3, '#7a9a48'); R(x + 3 + Math.floor(b * 5), y + 3, 1, 2, '#a8c468'); } if (mid) { R(x + 2, y + 5, 6, 2, '#6b4f2c'); R(x + 3, y + 5, 4, 1, '#6fa8c8'); } }      // a paddock kept for grazing, and the trough in it                                 // barley, bending
        // the bounds of the plot: a hedge, or a wall of field stones with a gap for the gate
        if (tx % 4 === 0) { if (walled(tx, ty)) { R(x, y, 1, 10, '#b5aa94'); R(x, y + 3, 1, 1, '#8f8676'); R(x, y + 7, 1, 1, '#8f8676'); } else R(x, y, 1, 10, a > 0.5 ? '#4f7038' : '#5f7f3f'); }
        if (ty % 3 === 0) { if (walled(tx, ty)) { R(x, y, 10, 1, '#b5aa94'); R(x + 4, y, 1, 1, '#8f8676'); if (tx % 4 === 2) R(x + 3, y, 4, 1, '#8a6a44'); } else R(x, y, 10, 1, b > 0.5 ? '#4f7038' : '#5f7f3f'); }
        if (mid && pl > 0.84) { R(x + 4, y + 1, 1, 7, '#6b4f2c'); R(x + 2, y + 3, 5, 1, '#6b4f2c'); R(x + 3, y, 3, 2, '#c9b890'); R(x + 3, y + 3, 3, 3, '#8a4a3a'); }      // a scarecrow
        else if (mid && pl < 0.12) { R(x + 2, y + 3, 6, 4, '#d9c070'); R(x + 3, y + 2, 4, 1, '#e6d088'); R(x + 2, y + 7, 6, 1, '#b89a4a'); R(x + 1, y + 8, 8, 1, 'rgba(0,0,0,.18)'); }      // a rick
      }
      else if (a > 0.94) shrub(x, y, tx, ty);      // a bush, grown to its own shape
      else if (a > 0.86) {                     // long grass, bending one way or the other
        const n = 2 + Math.floor(b * 3), lean = h(tx, ty, 144) > 0.5 ? 1 : -1, gc = b > 0.5 ? '#6b8f3e' : '#93b055';
        for (let q = 0; q < n; q++) { const gx = x + 1 + Math.floor(h(tx, ty, 145 + q) * 8), gy = y + 3 + Math.floor(h(tx, ty, 150 + q) * 5); R(gx, gy, 1, 3, gc); R(gx + lean, gy - 1, 1, 1, gc); }
      }
      else if (a > 0.82) {                     // a drift of flowers, in the colours of that part of the country
        const reg = wildRegion(x + 5, y + 5), fc = reg === 'The Long Meadows' ? ['#f2e6a0', '#f4f4f0'] : reg === 'The Home Fields' ? ['#c23b2e', '#f2e6a0'] : reg === 'Greywood' ? ['#b9a0e0', '#f4f4f0'] : reg === 'The Salt Shore' ? ['#e8a0c0', '#f4f4f0'] : ['#e8a0a0', '#b9a0e0'];
        for (let q = 0; q < 4 + Math.floor(b * 4); q++) R(x + Math.floor(h(tx, ty, 155 + q) * 9), y + Math.floor(h(tx, ty, 163 + q) * 9), 1, 1, fc[q % 2]);
      }
      else if (a < 0.012) {                    // a tree standing by itself
        lone.push([tx, ty]);
      }
      else if (a < 0.04) {                     // stones, singly or in a scatter
        rocks(x, y, tx, ty, wildRegion(x + 5, y + 5));
      }
      else if (a < 0.05) logs(x, y, tx, ty, ['#6b4f2c', '#8a6a3a', '#c9a763']);      // a fallen trunk
      else {
        // What is left is plain grass, and plain grass is of many sorts. Each stretch is one of them: a sea of long
        // grass, clover, dry ground, thistle and dock, mole-heaved turf, a damp hollow, or rabbit ground.
        const zone = zq(wildNoise(tx / 7, ty / 7, 960), 7), dense = wildNoise(tx / 3, ty / 3, 961), g1 = h(tx, ty, 962), g2 = h(tx, ty, 963), base = col(k, tx, ty);
        if (g1 < 0.06 + dense * 0.36) {
          if (zone === 0) { const lean = wildNoise(tx / 10, ty / 10, 964) > 0.5 ? 1 : -1; for (let q = 0, n = 3 + Math.floor(g2 * 4); q < n; q++) { const gx = x + Math.floor(h(tx, ty, 965 + q) * 9), gy = y + 1 + Math.floor(h(tx, ty, 972 + q) * 7); R(gx, gy, 1, 3, tint(base, q % 2 ? 0.84 : 1.14)); R(gx + lean, gy - 1, 1, 1, tint(base, 1.2)); if (q === 0 && g2 > 0.6) R(gx + lean, gy - 2, 1, 1, '#d8c880'); } }                    // long grass, all bent by one wind, some of it in seed
          else if (zone === 1) { R(x + 1 + Math.floor(g2 * 4), y + 2 + Math.floor(g1 * 20) % 5, 5, 4, tint(base, 0.96)); for (let q = 0; q < 5; q++) R(x + Math.floor(h(tx, ty, 965 + q) * 10), y + Math.floor(h(tx, ty, 972 + q) * 10), 1, 1, q % 3 ? '#f0ece0' : '#e0a0b8'); }                    // clover
          else if (zone === 2) { const pw = 4 + Math.floor(g2 * 5), px = x + Math.floor(h(tx, ty, 965) * (10 - pw)), py = y + 2 + Math.floor(h(tx, ty, 966) * 4); R(px, py, pw, 3, '#a89a62'); R(px + 1, py - 1, Math.max(1, pw - 2), 1, '#a89a62'); R(px + 1, py + 3, Math.max(1, pw - 3), 1, '#a89a62'); R(px + 1, py + 1, Math.max(1, pw - 3), 1, '#8f8250'); if (g2 > 0.5) R(px + pw - 2, py, 1, 2, '#8f8250'); }      // the turf worn through to dry earth
          else if (zone === 3) { for (let q = 0, n = 1 + Math.floor(g2 * 3); q < n; q++) { const gx = x + 1 + Math.floor(h(tx, ty, 965 + q) * 8), gy = y + 3 + Math.floor(h(tx, ty, 972 + q) * 5); if (q % 2) { R(gx - 1, gy + 1, 3, 2, '#55803a'); R(gx, gy - 2, 1, 3, '#8a5a3a'); } else { R(gx, gy, 1, 3, '#6a8a4a'); R(gx - 1, gy + 1, 1, 1, '#6a8a4a'); R(gx + 1, gy, 1, 1, '#6a8a4a'); R(gx, gy - 1, 1, 1, '#b070c0'); } } }      // dock and thistle
          else if ((zone === 4 || zone === 6) && h(tx, ty, 979) > 0.18) { for (let q = 0, n = 1 + Math.floor(g2 * 2); q < n; q++) { const gx = x + 1 + Math.floor(h(tx, ty, 965 + q) * 8), gy = y + 3 + Math.floor(h(tx, ty, 972 + q) * 5); R(gx, gy, 1, 2, tint(base, q % 2 ? 0.86 : 1.12)); R(gx + (q % 2 ? 1 : -1), gy - 1, 1, 1, tint(base, 1.16)); } }      // mostly it is only rougher grass
          else if (zone === 4) { for (let q = 0, n = 1 + Math.floor(g2 * 1.4); q < n; q++) { const mx = x + 1 + Math.floor(h(tx, ty, 965 + q) * 7), my = y + 2 + Math.floor(h(tx, ty, 972 + q) * 6); R(mx, my, 3, 2, '#7a5a3a'); R(mx + 1, my - 1, 1, 1, '#7a5a3a'); R(mx, my, 2, 1, '#94704a'); R(mx, my + 2, 4, 1, 'rgba(0,0,0,.14)'); } }      // molehills
          else if (zone === 5) { if (g2 > 0.7) { const pw = 4 + Math.floor(g1 * 20) % 4, px = x + 1 + Math.floor(h(tx, ty, 965) * (8 - pw)); R(px, y + 4, pw, 2, '#4f86ae'); R(px + 1, y + 3, Math.max(1, pw - 2), 1, '#4f86ae'); R(px + 1, y + 4, Math.max(1, pw - 3), 1, '#8fc0de'); } for (let q = 0, n = 2 + Math.floor(g2 * 3); q < n; q++) { const rx0 = x + Math.floor(h(tx, ty, 967 + q) * 10), ry0 = y + 1 + Math.floor(h(tx, ty, 973 + q) * 6); R(rx0, ry0, 1, 3, q % 2 ? '#5f8a4a' : '#4f7a44'); if (q === 0) R(rx0, ry0 - 1, 1, 1, '#6b4a2a'); } }      // a damp hollow: rushes, and standing water
          else { for (let q = 0, n = 1 + Math.floor(g2 * 1.4); q < n; q++) { const bx = x + 1 + Math.floor(h(tx, ty, 965 + q) * 7), by = y + 3 + Math.floor(h(tx, ty, 972 + q) * 5); R(bx, by, 2, 1, '#3a2a1c'); R(bx - 1, by + 1, 4, 1, '#94805a'); } if (g2 > 0.8) { const bx = x + 2 + Math.floor(g1 * 30) % 5; R(bx, y + 1, 2, 1, '#b8a888'); R(bx + 2, y, 1, 1, '#b8a888'); R(bx, y, 1, 1, '#f4f4f0'); } }      // rabbit ground: burrows, spoil at their mouths, and one out
        }
      }
    }
  }
  // ---- the fields lie in the land: each plot takes some of the colour of the ground it was cut from, and where
  // it ends against open ground the edge is ragged, the turf coming in and the crop straggling out ----
  const fray = (tx, ty, same) => {
    const x = tx * 10, y = ty * 10;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy], sd) => {
      const o = at(tx + dx, ty + dy);
      if ((o !== T_GRASS && o !== T_MEADOW) || same(tx + dx, ty + dy) || inTown(tx + dx, ty + dy, 4)) return;
      const oc = col(o, tx + dx, ty + dy);
      for (let q = 0; q < 4; q++) {            // turf, in over the edge
        const at0 = Math.floor(h(tx, ty, 1300 + sd * 8 + q) * 9), len = Math.min(10 - at0, 1 + Math.floor(h(tx, ty, 1340 + sd * 8 + q) * 3)), dep = 1 + Math.floor(h(tx, ty, 1380 + sd * 8 + q) * 2);
        if (dx) R(dx > 0 ? x + 10 - dep : x, y + at0, dep, len, oc); else R(x + at0, dy > 0 ? y + 10 - dep : y, len, dep, oc);
      }
      for (let q = 0; q < 3; q++) {            // and rank grass and weeds along the outside of it
        const at0 = Math.floor(h(tx, ty, 1420 + sd * 8 + q) * 9), out = Math.floor(h(tx, ty, 1460 + sd * 8 + q) * 3), wc = q === 0 ? tint(oc, 0.86) : q === 1 ? tint(oc, 1.08) : tint(oc, 0.93);
        if (dx) R(dx > 0 ? x + 10 + out : x - 1 - out, y + at0, 1, 2, wc); else R(x + at0, dy > 0 ? y + 10 + out : y - 2 - out, 2, 1 + (q === 0 ? 1 : 0), wc);
      }
    });
  };
  // what is planted on a tile out beyond the fields: 0 nothing, 1 olives, 2 vines, 3 an orchard
  const grove = (tx, ty) => { if (at(tx, ty) !== T_GRASS || wildRegion(tx * 10, ty * 10) !== 'The Home Fields' || farm(tx, ty) || Math.hypot(tx - tx0, ty - ty0) < 3 || inTown(tx, ty, 4)) return 0; const d = Math.hypot(tx - tx0, ty - ty0), plot = h(Math.floor(tx / 3), Math.floor(ty / 3), 93); return d > 10.5 && d < 17 && plot > 0.7 ? (plot > 0.9 ? 1 : plot > 0.78 ? 2 : 3) : 0; };
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    if (at(tx, ty) !== T_GRASS || !farm(tx, ty)) continue;
    const x = tx * 10, y = ty * 10, gn = parseInt(col(T_GRASS, tx, ty).slice(1), 16), tn = tone(tx, ty);
    R(x, y, 10, 10, `rgba(${gn >> 16},${(gn >> 8) & 255},${gn & 255},.24)`);
    R(x, y, 10, 10, tn < 1 ? `rgba(20,30,10,${((1 - tn) * 0.9).toFixed(3)})` : `rgba(255,250,210,${((tn - 1) * 0.9).toFixed(3)})`);
    fray(tx, ty, farm);
  }
  // ---- depth: high ground throws its shade to the south and east, and the shore has a strand ----
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const k = at(tx, ty), x = tx * 10, y = ty * 10;
    if (k === T_PEAK) continue;
    const n = at(tx, ty - 1), w = at(tx - 1, ty), nw = at(tx - 1, ty - 1);
    if (!wet(k) && (n === T_PEAK || w === T_PEAK || nw === T_PEAK)) R(x, y, 10, 10, 'rgba(18,20,40,.17)');
    else if ((k === T_GRASS || k === T_MEADOW || k === T_SAND || k === T_ROAD) && (n === T_HILL || w === T_HILL)) { R(x, y, 10, 5, 'rgba(18,20,40,.07)'); R(x, y, 5, 10, 'rgba(18,20,40,.05)'); }
    else if ((k === T_GRASS || k === T_MEADOW || k === T_ROAD) && (n === T_FOREST || w === T_FOREST)) { if (n === T_FOREST) R(x, y, 10, 4, 'rgba(10,30,10,.12)'); if (w === T_FOREST) R(x, y, 3, 10, 'rgba(10,30,10,.09)'); }
    if (k === T_GRASS || k === T_MEADOW || k === T_HILL) {          // a strand of sand or shingle wherever the land meets water
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy], q) => {
        if (!wet(at(tx + dx, ty + dy))) return;
        for (let i = 0; i < 10; i += 2) { if (h(tx * 3 + i, ty * 3 + q, 80) < 0.22) continue; const d = 1 + Math.floor(h(tx + i, ty + q, 81) * 2); R(dx ? x + (dx > 0 ? 10 - d - 1 : 1) : x + i, dy ? y + (dy > 0 ? 10 - d - 1 : 1) : y + i, dx ? d : 2, dy ? d : 2, i % 4 ? '#d2c08a' : '#bfae78'); }
      });
    }
  }
  // ---- each part of the country has its own look ----
  const farmland = (tx, ty) => farm(tx, ty) || Math.hypot(tx - tx0, ty - ty0) < 3 || inTown(tx, ty, 4);
  prov.boats = [];
  prov.smokes = [];
  prov.lights = [];
  // flocks and herds: each has a home with room to wander, and is drawn live, moving (see drawHerds)
  prov.herds = [];
  const roomFor = (tx, ty, kinds, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!kinds.includes(at(tx + dx, ty + dy))) return false; return true; };
  const herd = (kind, tx, ty, n, kinds, far, room) => {
    const x = tx * 10 + 5, y = ty * 10 + 5;
    if (!roomFor(tx, ty, kinds, room || 3) || Math.hypot(tx - tx0, ty - ty0) < 12 || prov.herds.some(q => Math.hypot(q.x - x, q.y - y) < far)) return;
    prov.herds.push({ kind, x, y, n, seed: tx * 977 + ty * 131 });
  };
  for (let ty = 1; ty < TH - 1; ty++) for (let tx = 1; tx < TW - 1; tx++) {
    const k = at(tx, ty), x = tx * 10, y = ty * 10, a = h(tx, ty, 90), b = h(tx, ty, 91), reg = wildRegion(x + 5, y + 5);
    const sh = (sx, sy, sw) => R(sx, sy, sw, 1, 'rgba(0,0,0,.2)');
    const v1 = h(tx, ty, 440), v2 = h(tx, ty, 441), v3 = h(tx, ty, 442), v4 = h(tx, ty, 443);
    if (reg === 'The Barrow Downs' && (k === T_GRASS || k === T_HILL || k === T_MEADOW)) {
      if (a > 0.965) {                         // standing stones: tall, short, leaning on a neighbour, or long since fallen
        const hh = 4 + Math.floor(b * 5);
        if (v1 > 0.85) { sh(x + 1, y + 8, 8); R(x + 1, y + 6, 7, 2, '#a8a290'); R(x + 1, y + 6, 7, 1, '#c9c3ae'); R(x + 2, y + 5, 2, 1, '#6f8a4a'); }
        else {
          sh(x + 3, y + 8, v2 > 0.6 ? 8 : 5); R(x + 4, y + 8 - hh, 2 + (b > 0.6 ? 1 : 0), hh, '#a8a290'); R(x + 4, y + 8 - hh, 1, hh, '#c9c3ae');
          if (v2 > 0.6) { R(x + 8, y + 10 - hh, 2, hh - 2, '#9a9484'); R(x + 8, y + 10 - hh, 1, hh - 2, '#bdb8a8'); if (v3 > 0.6) R(x + 4, y + 7 - hh, 6, 1, '#b5af9b'); }
          if (v4 > 0.7) R(x + 4, y + 8 - hh, 2, 1, '#6f8a4a');
        }
      }
      else if (a > 0.945) {                    // barrows: great and small, some with a door, a kerb of stones, a marker on top
        const rx = 4 + Math.floor(b * 4), ry = 2 + Math.floor(v1 * 3), cx = x + 5, cy = y + 8;
        sh(cx - rx, cy, rx * 2 + 1);
        for (let dy = -ry; dy <= 0; dy++) { const w = Math.round(rx * Math.sqrt(1 - (dy * dy) / (ry * ry + 0.5))); R(cx - w, cy + dy, w * 2, 1, dy < -ry * 0.5 ? '#8aa862' : '#6f8f48'); R(cx + w - 2, cy + dy, 2, 1, '#5a7a3a'); }
        if (v2 > 0.4) R(cx, cy - 1, 1, 2, '#2a1d12');
        if (v3 > 0.6) { R(cx - rx - 1, cy, 1, 1, '#c9c3ae'); R(cx + rx, cy, 1, 1, '#c9c3ae'); R(cx - 2, cy + 1, 1, 1, '#c9c3ae'); R(cx + 2, cy + 1, 1, 1, '#c9c3ae'); }
        if (v4 > 0.8) R(cx, cy - ry - 2, 1, 2, '#a8a290');
      }
    } else if (reg === 'Blackmere') {
      if (k === T_MARSH || wet(k)) R(x, y, 10, 10, 'rgba(14,26,30,.16)');                    // black water
      if (k === T_MARSH && a > 0.86) {         // drowned trees, each with its own branches
        const hh = 5 + Math.floor(b * 5), t1 = x + 2 + Math.floor(v1 * 5);
        sh(t1 - 1, y + 9, 4); R(t1, y + 9 - hh, 1, hh, '#4a4038');
        for (let q = 0, n = 2 + Math.floor(v2 * 3); q < n; q++) { const by = y + 10 - hh + q * 2, dir = (q + (v3 > 0.5 ? 1 : 0)) % 2 ? 1 : -1, len = 1 + Math.floor(h(tx + q, ty, 444) * 3); R(dir > 0 ? t1 + 1 : t1 - len, by, len, 1, '#4a4038'); R(dir > 0 ? t1 + len : t1 - len, by - 1, 1, 1, '#4a4038'); }
        if (v4 > 0.8) R(t1 - 1, y + 8 - hh, 2, 1, '#1c1310');
      }
    } else if (reg === 'The Quarry Hills' && k === T_HILL) {
      if (a > 0.972) {                         // cut blocks, left where they were dressed: one, or a stack
        sh(x + 1, y + 9, 9);
        for (let q = 0, n = 1 + Math.floor(v1 * 4); q < n; q++) { const bw = 3 + Math.floor(h(tx, ty, 445 + q) * 3), bx = x + Math.floor(h(tx, ty, 449 + q) * (10 - bw)), by = y + 6 - (q % 2) * 3 - Math.floor(q / 2); R(bx, by, bw, 3, q % 2 ? '#d8d4c6' : '#e8e4d8'); R(bx, by, bw, 1, '#f8f6ee'); R(bx + bw - 1, by + 1, 1, 2, '#b8b2a0'); }
      }
      else if (a > 0.955) {                    // a working in the hillside: a face cut back in a step or two, its floor white with dust, the turf hanging over it
        const cw = 7 + Math.floor(b * 6), cx = x + Math.floor(v1 * 3) - 1, deepc = v2 > 0.45;
        R(cx - 1, y + 9, cw + 3, 1, 'rgba(0,0,0,.16)'); R(cx - 2, y + 6, cw + 4, 4, 'rgba(232,226,208,.4)');
        R(cx, y, cw, 4, '#cfc5a8'); R(cx, y, cw, 1, '#f1ead6'); R(cx, y + 3, cw, 1, '#9c9278'); R(cx + cw - 3, y + 1, 3, 2, '#b9ae90');
        for (let q = 2 + Math.floor(v3 * 2); q < cw - 1; q += 3) R(cx + q, y + 1, 1, 2, '#9c9278');
        if (deepc) { R(cx + 1, y + 4, cw - 2, 3, '#b9ae90'); R(cx + 1, y + 4, cw - 2, 1, '#e2d9c0'); R(cx + 1, y + 6, cw - 2, 1, '#7f775f'); R(cx + 1, y + 7, cw - 2, 2, '#ddd5bd'); }
        else R(cx, y + 4, cw, 4, '#ddd5bd');
        R(cx - 1, y - 1, cw + 2, 1, '#a9a070'); R(cx - 1, y, 1, 6, '#b9ae90'); R(cx + cw, y, 1, 6, '#7f775f');
        R(cx + 2, y + 6, 3, 2, '#f1ead6'); R(cx + 2, y + 6, 3, 1, '#ffffff'); if (cw > 9) { R(cx + 6, y + 7, 3, 2, '#e2d9c0'); R(cx + 6, y + 7, 3, 1, '#f8f6ee'); }
        if (v2 > 0.5) { R(cx + cw - 3, y - 1, 1, 8, '#6b4f2c'); R(cx + cw - 1, y - 1, 1, 8, '#6b4f2c'); for (let q = 0; q < 3; q++) R(cx + cw - 3, y + 1 + q * 2, 3, 1, '#8a6a3a'); }      // a ladder left against it
        else if (v3 > 0.6) { R(cx + cw - 2, y - 6, 1, 7, '#6b4f2c'); R(cx + cw - 5, y - 6, 4, 1, '#7a5a34'); R(cx + cw - 5, y - 5, 1, 3, '#c9b890'); }                        // or a sheer-legs to lift with
      }
      else if (a > 0.94) {                     // a spoil heap: broken stone tipped in a mound, the newest of it still white
        const mw = 6 + Math.floor(b * 4), mx0 = x + Math.floor(v1 * (10 - mw));
        R(mx0 - 1, y + 8, mw + 2, 1, 'rgba(0,0,0,.16)');
        for (let i = 0; i < 4; i++) R(mx0 + 3 - i, y + 4 + i, mw - 6 + i * 2, 1, i === 0 ? '#e2d9c0' : i % 2 ? '#cfc5a8' : '#b9ae90');
        for (let q = 0; q < 5; q++) R(mx0 + Math.floor(h(tx, ty, 453 + q) * mw), y + 5 + Math.floor(h(tx, ty, 458 + q) * 3), 1, 1, q % 2 ? '#f8f6ee' : '#9c9278');
        R(mx0 + mw - 2, y + 6, 2, 2, '#9c9278');
      }
    } else if (reg === 'The Salt Shore' && k === T_SAND) {
      if (a > 0.9) {                           // salt pans: a single pan, or a run of them
        const cols = 1 + Math.floor(v1 * 2), rows = 1 + Math.floor(v2 * 2), pw = Math.floor(8 / cols), ph = Math.floor(6 / rows);
        R(x + 1, y + 2, 8, 6, '#a39a7a');
        for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) { const dry = h(tx + cx, ty + cy, 463) > 0.5; R(x + 1 + cx * pw + 1, y + 2 + cy * ph + 1, pw - 1, ph - 1, dry ? '#ffffff' : '#cfe0e8'); }
        if (v3 > 0.6) { R(x + 8, y, 2, 2, '#ffffff'); R(x + 7, y + 1, 4, 1, '#eef0ee'); }
      }
      else if (a > 0.86) { const rl = 4 + Math.floor(b * 4), rx0 = x + 1; sh(rx0, y + 8, rl + 1); R(rx0, y + 3, 1, 5, '#6b4f2c'); R(rx0 + rl, y + 3, 1, 5, '#6b4f2c'); R(rx0, y + 3, rl + 1, 1, '#6b4f2c'); for (let q = 1; q < rl; q += 2) R(rx0 + q, y + 4, 1, 2 + Math.floor(h(tx + q, ty, 464) * 2), '#c9c3ae'); }      // fish drying on a rack
      else if (a > 0.83) { sh(x + 1, y + 8, 9); R(x + 1, y + 5, 8, 3, v1 > 0.5 ? '#7a5a34' : '#5e6a7a'); R(x + 2, y + 4, 6, 1, v1 > 0.5 ? '#94703f' : '#7a8696'); R(x + 1, y + 7, 8, 1, '#3a2a1c'); }      // a boat turned over above the tide
      else if (a > 0.81) { R(x + 1, y + 2, 1, 7, '#6b4f2c'); R(x + 8, y + 2, 1, 7, '#6b4f2c'); for (let q = 0; q < 4; q++) R(x + 2, y + 3 + q, 6, 1, q % 2 ? '#a39a84' : 'rgba(163,154,132,.5)'); }      // a net between two poles
    } else if (reg === 'The Long Meadows' && (k === T_MEADOW || k === T_GRASS) && !farmland(tx, ty)) {
      if (a > 0.972) { const w = 4 + Math.floor(b * 3), hh = 3 + Math.floor(v1 * 3), hx = x + 2; sh(hx - 1, y + 8, w + 2); R(hx, y + 8 - hh, w, hh, '#d9c070'); R(hx + 1, y + 7 - hh, w - 2, 1, '#e6d088'); R(hx, y + 7, w, 1, '#b89a4a'); if (v2 > 0.6) R(hx + (w >> 1), y + 5 - hh, 1, 3, '#6b4f2c'); }      // a haycock, some round a pole
      else if (a > 0.94) herd('sheep', tx, ty, 3 + Math.floor(v1 * 5), [T_GRASS, T_MEADOW], 70);                       // a flock of sheep makes its home here
      else if (a > 0.925) herd('cattle', tx, ty, 2 + Math.floor(v1 * 3), [T_GRASS, T_MEADOW], 90);                     // or a few head of cattle
    } else if (reg === 'The High Fells' && k === T_HILL) {
      if (a > 0.9) { for (let q = 0, n = 2 + Math.floor(v1 * 2); q < n; q++) { const sw = 3 + Math.floor(h(tx, ty, 494 + q) * 5), sx = x + Math.floor(h(tx, ty, 497 + q) * (10 - sw)), sy = y + 2 + q * 2; R(sx, sy, sw, 2, '#f2efe6'); R(sx + 1, sy + 2, Math.max(1, sw - 2), 1, '#d8d4c8'); } }       // snow lying in the hollows
      else if (a > 0.84) { const bw = 3 + Math.floor(b * 4), bh = 2 + Math.floor(v1 * 3), bx = x + 1 + Math.floor(v2 * (8 - bw)); sh(bx, y + 8, bw + 1); R(bx, y + 8 - bh, bw, bh, '#8a8478'); R(bx + 1, y + 7 - bh, Math.max(1, bw - 2), 1, '#a39c88'); R(bx, y + 8 - bh, Math.max(1, bw >> 1), 1, '#bdb8ac'); if (v3 > 0.7) R(bx + 1, y + 6 - bh, 2, 1, '#6f8a5a'); }      // a boulder, some with moss
      else if (a > 0.82) { sh(x + 3, y + 8, 5); R(x + 3, y + 6, 5, 2, '#9a958a'); R(x + 4, y + 4, 3, 2, '#a8a398'); R(x + 5, y + 2, 1, 2, '#bdb8ac'); }      // a cairn, to mark the way
    } else if (reg === 'The Home Fields' && k === T_GRASS && !farmland(tx, ty)) {
      const d = Math.hypot(tx - tx0, ty - ty0), px = Math.floor(tx / 3), py = Math.floor(ty / 3), plot = h(px, py, 93), pv = h(px, py, 94);
      if (d > 10.5 && d < 17 && plot > 0.7) {                         // vineyards, olive groves and orchards beyond the fields
        if (plot > 0.9) {                      // olives: old trees, each where it happened to grow
          R(x, y, 10, 10, pv > 0.5 ? 'rgba(150,150,96,.38)' : 'rgba(170,170,120,.38)'); fray(tx, ty, (ax, ay) => grove(ax, ay) === 1);
          for (let q = 0, n = 2 + Math.floor(v1 * 3); q < n; q++) { const ox = 1 + Math.floor(h(tx, ty, 500 + q) * 7), oy = 2 + Math.floor(h(tx, ty, 504 + q) * 6), r = 1 + Math.floor(h(tx, ty, 508 + q) * 2); R(x + ox - r, y + oy, r * 2 + 1, 2, '#6f8a5a'); R(x + ox - r, y + oy - 1, r + 1, 1, '#9ab284'); R(x + ox, y + oy + 2, 1, 1, '#4a3320'); }
        } else if (plot > 0.78) {              // vines: the rows run one way on one plot and the other way on the next
          R(x, y, 10, 10, 'rgba(138,116,66,.72)'); const grape = pv > 0.6 ? '#7a3a6a' : pv > 0.3 ? '#9aa83a' : '#5a2a4a';
          if (pv * 7 % 1 > 0.5) for (let q = 1; q < 10; q += 3) { R(x, y + q, 10, 2, '#557a36'); for (let u = 1 + (q % 2); u < 10; u += 3) R(x + u, y + q, 1, 1, grape); R(x + (tx % 3 === 0 ? 0 : 9), y + q - 1, 1, 3, '#6b4f2c'); }
          else for (let q = 1; q < 10; q += 3) { R(x + q, y, 2, 10, '#557a36'); for (let u = 1 + (q % 2); u < 10; u += 3) R(x + q, y + u, 1, 1, grape); }
          fray(tx, ty, (ax, ay) => grove(ax, ay) === 2);
        } else {                               // an orchard, in blossom or in fruit
          R(x, y, 10, 10, 'rgba(120,160,70,.3)');
          for (let q = 0, n = 1 + Math.floor(v1 * 2); q < n; q++) { const ox = 2 + Math.floor(h(tx, ty, 512 + q) * 6), oy = 3 + q * 4; R(x + ox - 2, y + oy - 2, 5, 3, '#4c7f38'); R(x + ox - 1, y + oy - 3, 3, 1, '#69a04a'); R(x + ox, y + oy + 1, 1, 2, '#4a3320'); R(x + ox - 1 + Math.floor(v2 * 3), y + oy - 2, 1, 1, pv > 0.5 ? '#f4d0d8' : '#c23b2e'); R(x + ox + 1, y + oy - 1, 1, 1, pv > 0.5 ? '#ffffff' : '#e3b04a'); }
        }
      }
    }
    if (reg === 'The Home Fields' && k === T_GRASS && !farmland(tx, ty) && a > 0.985) herd('sheep', tx, ty, 3 + Math.floor(v1 * 3), [T_GRASS, T_MEADOW], 110);
    else if ((reg === 'The High Fells' || reg === 'The Quarry Hills') && k === T_HILL && a < 0.012) herd('goats', tx, ty, 2 + Math.floor(v1 * 4), [T_HILL, T_GRASS], 110);
    else if ((reg === 'Greywood' || reg === 'The Barrow Downs' || reg === 'The Long Meadows') && (k === T_GRASS || k === T_MEADOW) && a < 0.05 && [3, 4].some(q => at(tx - q, ty) === T_FOREST || at(tx + q, ty) === T_FOREST || at(tx, ty - q) === T_FOREST || at(tx, ty + q) === T_FOREST)) herd('deer', tx, ty, 2 + Math.floor(v1 * 3), [T_GRASS, T_MEADOW], 150, 2);
    else { const c1 = h(tx, ty, 1260), nearWood = [2, 3].some(q => at(tx - q, ty) === T_FOREST || at(tx + q, ty) === T_FOREST || at(tx, ty - q) === T_FOREST || at(tx, ty + q) === T_FOREST), nearWater = [2, 3].some(q => wet(at(tx - q, ty)) || wet(at(tx + q, ty)) || wet(at(tx, ty - q)) || wet(at(tx, ty + q)));
      if ((reg === 'The Long Meadows' || reg === 'The Home Fields' || reg === 'The Barrow Downs') && (k === T_MEADOW || k === T_GRASS) && !farmland(tx, ty) && c1 < 0.012) herd('horses', tx, ty, 2 + Math.floor(v1 * 4), [T_GRASS, T_MEADOW], 170);                 // horses running loose
      else if ((k === T_GRASS || k === T_MEADOW) && nearWood && !farmland(tx, ty) && c1 > 0.975 && reg !== 'The High Fells') herd('pigs', tx, ty, 3 + Math.floor(v1 * 4), [T_GRASS, T_MEADOW], 170, 1);                                                            // pigs put out under the trees
      else if ((k === T_GRASS || k === T_MEADOW) && nearWater && c1 > 0.94 && c1 <= 0.975) herd('geese', tx, ty, 3 + Math.floor(v1 * 5), [T_GRASS, T_MEADOW, T_SAND], 150, 1);                                                                                   // geese by the water
      else if (k === T_MARSH && c1 < 0.03) herd('cranes', tx, ty, 2 + Math.floor(v1 * 3), [T_MARSH], 140, 1);                                                                                                                                              // cranes standing in the marsh
    }
    // poplars along the roads near the town: a tall one, a short one, sometimes two together
    if (k === T_GRASS && !farmland(tx, ty) && b > 0.86 && Math.hypot(tx - tx0, ty - ty0) < 30 && (at(tx, ty + 1) === T_ROAD || at(tx, ty - 1) === T_ROAD || at(tx + 1, ty) === T_ROAD || at(tx - 1, ty) === T_ROAD)) {
      const poplar = (px, hh, c1, c2) => { sh(px - 1, y + 9, 5); R(px, y + 6, 1, 3, '#4a3320'); for (let q = 0; q < hh; q++) { const w2 = q < 2 || q > hh - 3 ? 1 : 2; R(px - (w2 >> 1), y + 6 - hh + q, w2 + 1, 1, q % 3 ? c1 : c2); } };
      poplar(x + 3 + Math.floor(v1 * 3), 6 + Math.floor(v2 * 6), '#3f6a2c', '#57863a');
      if (v3 > 0.7) poplar(x + 8, 5 + Math.floor(v4 * 4), '#356026', '#4c7a34');
    }
    // fishing boats lie off the Salt Shore (they are drawn live, bobbing): open water, a little way out
    if (reg === 'The Salt Shore' && wet(k) && a > 0.992 && wet(at(tx + 1, ty)) && wet(at(tx - 1, ty)) && prov.boats.filter(q => !q[2]).length < 9) prov.boats.push([x + 5, y + 5]);
    if (wet(k)) {                              // galleys and a warship out at sea, punts and rafts on the lakes, coracles on the mere
      const sdv = shoreD[ty * TW + tx], seaT = tx < 16 || reg === 'The Salt Shore' || !!seaM[ty * TW + tx], c2 = h(tx, ty, 1270), c3 = h(tx, ty, 1271), clear = r => !prov.boats.some(q => Math.hypot(q[0] - x, q[1] - y) < r), count = kd => prov.boats.filter(q => q[2] === kd).length;
      if (seaT && sdv >= 6 && c2 > 0.985 && count('galley') < 3 && clear(140)) prov.boats.push([x + 5, y + 5, 'galley']);
      else if (seaT && sdv >= 7 && c2 < 0.01 && count('warship') < 1 && clear(140)) prov.boats.push([x + 5, y + 5, 'warship']);
      else if (!seaT && sdv >= 2 && sdv < 250 && c2 > 0.9 && clear(70)) { const kd = reg === 'Blackmere' ? 'coracle' : c3 > 0.5 ? 'raft' : 'punt'; if (count(kd) < 4) prov.boats.push([x + 5, y + 5, kd]); }
    }
  }
  // farmsteads among the fields: five families, five ways of building
  const STEADS = [
    (x, y) => { R(x - 1, y + 8, 13, 2, 'rgba(0,0,0,.22)'); R(x, y + 2, 11, 7, '#e2d2a8'); R(x - 1, y - 2, 13, 4, '#a8482a'); R(x, y - 3, 11, 1, '#c2603a'); R(x + 4, y + 5, 3, 4, '#3a2416'); R(x + 13, y + 4, 4, 5, '#8a6a3a'); R(x + 13, y + 3, 4, 1, '#c9b25a'); },      // a tiled house and its rick
    (x, y) => { R(x - 1, y + 8, 21, 2, 'rgba(0,0,0,.22)'); R(x, y + 3, 18, 6, '#cdbd94'); R(x - 1, y - 1, 20, 4, '#9a7a42'); R(x, y - 2, 18, 1, '#b8964e'); for (let q = 0; q < 20; q += 4) R(x - 1 + q, y - 1, 1, 4, '#7a5e30'); R(x + 3, y + 5, 3, 4, '#3a2416'); R(x + 11, y + 5, 5, 4, '#5a4326');
      for (let q = 0; q < 12; q += 3) R(x + 20 + q, y + 4, 1, 5, '#6b4f2c'); R(x + 20, y + 5, 12, 1, '#6b4f2c'); R(x + 24, y + 7, 4, 2, '#e0a8a0'); },                                                                                                                 // a long thatched house with its byre, and a pig in the yard
    (x, y) => { R(x - 1, y + 8, 22, 2, 'rgba(0,0,0,.22)'); R(x, y + 1, 10, 8, '#f0e8d6'); R(x - 1, y - 3, 12, 4, '#b5522e'); R(x + 10, y + 4, 9, 5, '#e8dcc0'); R(x + 10, y + 1, 10, 3, '#a8482a'); R(x + 3, y + 5, 3, 4, '#3a2416'); R(x + 13, y + 6, 2, 3, '#3a2416'); R(x + 2, y + 2, 2, 2, '#3a2a1c');
      R(x + 22, y + 5, 5, 4, '#b8ab94'); R(x + 22, y + 5, 5, 1, '#d8cdb6'); R(x + 23, y + 6, 3, 2, '#4f8fb8'); R(x + 24, y + 1, 1, 4, '#6b4f2c'); R(x + 22, y + 1, 5, 1, '#6b4f2c'); },                                                                              // two wings, whitewashed, and a well
    (x, y) => { R(x - 1, y + 8, 20, 2, 'rgba(0,0,0,.22)'); R(x, y - 6, 7, 15, '#d8cdb6'); R(x, y - 6, 1, 15, '#f0e8d6'); R(x - 1, y - 9, 9, 3, '#b5522e'); for (let q = 0; q < 3; q++) { R(x + 2, y - 4 + q * 4, 1, 1, '#3a2a1c'); R(x + 4, y - 2 + q * 4, 1, 1, '#3a2a1c'); } R(x + 2, y + 5, 3, 4, '#3a2416');
      R(x + 9, y + 2, 10, 7, '#8a6a3a'); R(x + 8, y - 1, 12, 3, '#6b4f2c'); R(x + 12, y + 4, 4, 5, '#3a2416'); R(x + 3, y - 12, 2, 1, '#f1ead8'); },                                                                                                                   // a dovecote tower and a barn
    (x, y) => { R(x - 2, y + 8, 26, 2, 'rgba(0,0,0,.22)'); R(x - 2, y + 4, 26, 5, '#c9bca8'); R(x - 2, y + 4, 26, 1, '#e0d6c4'); R(x + 9, y + 5, 4, 4, '#5a4326'); R(x + 1, y - 2, 9, 7, '#e2d2a8'); R(x, y - 5, 11, 3, '#a8482a'); R(x + 14, y - 1, 8, 6, '#e8dcc0'); R(x + 13, y - 4, 10, 3, '#b5522e');
      R(x + 24, y - 2, 1, 10, '#4a3320'); R(x + 22, y - 6, 5, 5, '#35602b'); R(x + 23, y - 7, 3, 1, '#4c7f38'); },                                                                                                                                                         // a walled yard with two houses, and a tree at the gate
  ];
  [[-6, -5], [7, 6], [-8, 4], [6, -7], [-3, 8]].forEach(([dx, dy], n) => {
    const tx = tx0 + dx, ty = ty0 + dy, k = at(tx, ty);
    if (k !== T_GRASS && k !== T_MEADOW) return;
    STEADS[n](tx * 10, ty * 10);
    if (n !== 3) prov.smokes.push({ x: tx * 10 + 3, y: ty * 10 - 5 });
  });
  // what stands up from the ground is gathered first and drawn from the back of the picture to the front, so that
  // each thing overlaps what is behind it. Nothing is stamped: every tree and every mountain is made for its own spot.
  const feats = [];
  // ---- the crossings: each is one bridge, laid straight from the road on one bank to the road on the other ----
  for (const B of crossings) {
    const ends = []; for (const [bx, by] of B.tiles) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(bx + dx, by + dy) === T_ROAD && !ends.some(e => e[0] === bx + dx && e[1] === by + dy)) ends.push([bx + dx, by + dy]);
    let A = null, Z = null, far = -1;
    for (const e1 of ends) for (const e2 of ends) { const d = Math.hypot(e1[0] - e2[0], e1[1] - e2[1]); if (d > far) { far = d; A = e1; Z = e2; } }
    if (!A || far < 1) { const xs = B.tiles.map(q => q[0]), ys = B.tiles.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); if (B.across) { A = [x0 - 1, (y0 + y1) >> 1]; Z = [x1 + 1, (y0 + y1) >> 1]; } else { A = [(x0 + x1) >> 1, y0 - 1]; Z = [(x0 + x1) >> 1, y1 + 1]; } }
    const legs = [[A, Z]]; for (const e of ends) if (e !== A && e !== Z && Math.min(Math.hypot(e[0] - A[0], e[1] - A[1]), Math.hypot(e[0] - Z[0], e[1] - Z[1])) > 2) legs.push([e, [Math.round((A[0] + Z[0]) / 2), Math.round((A[1] + Z[1]) / 2)]]);      // a third road coming onto it: a spur to the middle
    const ST = [{ deck: '#8a6a3a', line: '#77592e', rail: '#5f4622', lit: '#a8834a', post: '#4a3620' }, { deck: '#b5ad9c', line: '#a39a8a', rail: '#8f8676', lit: '#cfc8b6', post: '#7d7566' }, { deck: '#6b4f2c', line: '#5a4326', rail: '#3a2a1c', lit: '#7a5a34', post: '#3a2a1c' }][B.style] || null;
    for (const [P, Q] of legs) {
      // from the edge of the one road tile to the edge of the other, so that it stands on both banks
      const ax = P[0] * 10 + 5, ay = P[1] * 10 + 5, zx = Q[0] * 10 + 5, zy = Q[1] * 10 + 5, wide = Math.abs(zx - ax) >= Math.abs(zy - ay), n = Math.max(Math.abs(zx - ax), Math.abs(zy - ay)), sx = Math.sign(zx - ax), sy = Math.sign(zy - ay);
      feats.push({ y: Math.min(ay, zy) - 6, d: () => {
        for (let i = 3; i <= n - 3; i++) {
          const u = wide ? ax + sx * i : Math.round(ax + (zx - ax) * i / n), v = wide ? Math.round(ay + (zy - ay) * i / n) : ay + sy * i, over = wet(at(Math.floor(u / 10), Math.floor(v / 10))) || at(Math.floor(u / 10), Math.floor(v / 10)) === T_BRIDGE;
          if (!ST) {                           // a ford: flat stones set in the shallows, one after another
            if (!over) continue;
            if (i % 4 === 0) { const off = Math.floor(h(u, v, 601) * 5) - 2, sw = 3 + Math.floor(h(u, v, 609) * 2), px = wide ? u : u + off - 1, py = wide ? v + off - 1 : v; R(px - 1, py + 2, sw + 2, 2, 'rgba(230,243,250,.45)'); R(px, py, sw, 3, i % 8 ? '#a39a8a' : '#b5ad9c'); R(px, py, sw, 1, '#d0c8b6'); R(px, py + 3, sw, 1, 'rgba(0,30,60,.3)'); }
            else if (i % 4 === 2) R(wide ? u : u + 3, wide ? v + 3 : v, 2, 1, 'rgba(230,243,250,.5)');
            continue;
          }
          const plank = B.style === 2 ? (i % 2 ? ST.line : ST.lit) : i % 3 === 0 ? ST.line : ST.deck;
          if (wide) {
            if (over) R(u, v + 5, 1, 2, 'rgba(0,20,40,.28)');
            if (over && i % 10 === 5) R(u, v + 4, 2, 3, ST.post);                                              // a trestle, or a pier, standing in the water
            R(u, v - 4, 1, 9, plank); R(u, v - 4, 1, 1, ST.rail); R(u, v + 4, 1, 1, ST.rail); if (B.style === 1) R(u, v - 3, 1, 1, ST.lit);
            if (i % 10 === 5) { R(u, v - 5, 1, 2, ST.post); R(u, v + 3, 1, 2, ST.post); }                        // the posts of the rail
          } else {
            if (over) R(u + 5, v, 2, 1, 'rgba(0,20,40,.28)');
            R(u - 4, v, 9, 1, plank); R(u - 4, v, 1, 1, ST.rail); R(u + 4, v, 1, 1, ST.rail); if (B.style === 1) R(u - 3, v, 1, 1, ST.lit);
            if (i % 10 === 5) { R(u - 5, v, 2, 1, ST.post); R(u + 4, v, 2, 1, ST.post); }
          }
        }
        if (ST && B.style === 0 && n > 30) { const i = Math.floor(n * 0.6), u = wide ? ax + sx * i : Math.round(ax + (zx - ax) * i / n), v = wide ? Math.round(ay + (zy - ay) * i / n) : ay + sy * i; R(u - 1, v - 1, 2, 2, '#4a3620'); }      // a plank gone
      } });
    }
  }
  const WOOD = { blight: 0.14, thin: 0.72, old: 0.64, young: 0.28, turn: 0.885 };
  prov.wood = WOOD;
  const peakDepth = (tx, ty) => { for (let r = 1; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && at(tx + dx, ty + dy) !== T_PEAK) return r; return 5; };
  // a tree: its kind, its size, and a shade of its own
  const LEAF = { oak: ['#35602b', '#4c7f38', '#69a04a'], beech: ['#3f7032', '#5f9a46', '#7fb85a'], chestnut: ['#4a6a2a', '#7a9a3a', '#69a04a'], blossom: ['#4c7f38', '#69a04a', '#69a04a'],
    olive: ['#557a50', '#74986a', '#90b084'], yew: ['#21402a', '#2d5236', '#3a6442'], gold: ['#b0842a', '#d4a43a', '#ecc85c'], russet: ['#8f4422', '#b45f2c', '#cf8040'] };
  const tree = (cx, cy, kind, sz, f) => {
    const C = c => tint(c, f);
    R(cx - sz - 1, cy + 1, sz * 2 + 3, 2, 'rgba(0,0,0,.2)');
    if (kind === 'pine' || kind === 'fir' || kind === 'larch') {
      const dk = kind === 'fir' ? '#27483a' : kind === 'larch' ? '#5a7a34' : '#2c5230', lt = kind === 'fir' ? '#3c6450' : kind === 'larch' ? '#84a04c' : '#437046', tiers = 2 + Math.floor(sz / 2);
      R(cx, cy - 1, 1, 3, '#4a3320');
      for (let q = 0; q < tiers; q++) { const w = sz - Math.round(q * sz / (tiers + 0.5)), y0 = cy - 2 - q * 2; R(cx - w, y0, w * 2 + 1, 2, C(dk)); R(cx - w, y0, Math.max(1, w), 1, C(lt)); }
      R(cx, cy - 2 - tiers * 2, 1, 2, C(dk));
    } else if (kind === 'stone') {               // the umbrella pine of the coast: a long bare trunk and a flat crown
      R(cx, cy - sz - 3, 1, sz + 5, '#5a3f26'); R(cx + 1, cy - sz - 1, 1, 2, '#5a3f26');
      R(cx - sz - 1, cy - sz - 5, sz * 2 + 3, 3, C('#35602b')); R(cx - sz, cy - sz - 6, sz * 2 + 1, 1, C('#35602b')); R(cx - sz - 1, cy - sz - 5, sz + 1, 1, C('#5a8a46'));
    } else if (kind === 'birch') {
      R(cx, cy - sz - 2, 1, sz + 4, '#e8e4d8'); R(cx, cy - 1, 1, 1, '#5a5448'); R(cx, cy - sz, 1, 1, '#5a5448');
      R(cx - sz + 1, cy - sz - 5, sz * 2 - 1, sz, C('#6f9a48')); R(cx - sz + 2, cy - sz - 6, Math.max(1, sz * 2 - 3), 1, C('#6f9a48')); R(cx - sz + 1, cy - sz - 5, sz - 1, Math.max(1, sz - 2), C('#93b866'));
    } else if (kind === 'cypress' || kind === 'poplar') {      // a dark spire, or the tall pale one that stands by water and road
      const pop = kind === 'poplar', top = sz * 2 + (pop ? 6 : 3);
      R(cx, cy - 1, 1, 3, '#4a3320');
      for (let q = 0; q < top; q++) { const w = q < 2 || q > top - 3 ? 0 : 1; R(cx - w, cy - 2 - q, w * 2 + 1, 1, C(pop ? (q % 3 ? '#4f8a3a' : '#74ac50') : (q % 3 ? '#2f5234' : '#3f6844'))); if (pop && w && q % 2) R(cx - 1, cy - 2 - q, 1, 1, C('#8cc062')); }
    } else if (kind === 'willow') {              // over water: a low wide head, and the withies hanging
      R(cx, cy - 2, 1, 4, '#4a4030');
      R(cx - sz - 1, cy - sz - 3, sz * 2 + 3, sz, C('#5f7f4a')); R(cx - sz, cy - sz - 4, sz * 2 + 1, 1, C('#5f7f4a')); R(cx - sz - 1, cy - sz - 3, sz + 1, 1, C('#7f9f62'));
      for (let q = -sz - 1; q <= sz + 1; q += 2) R(cx + q, cy - 3, 1, 2 + (Math.abs(q) % 3), C('#6f8f56'));
    } else if (kind === 'dead' || kind === 'burnt') {
      const dc = kind === 'burnt' ? '#2e2824' : '#5a5046';
      R(cx, cy - sz - 3, 1, sz + 5, dc); R(cx - 2, cy - sz - 1, 2, 1, dc); R(cx - 3, cy - sz - 2, 1, 1, dc); R(cx + 1, cy - sz, 2, 1, dc); R(cx + 3, cy - sz - 1, 1, 1, dc); R(cx + 1, cy - sz - 4, 1, 2, dc);
    } else {                                     // broadleaf: a crown built of two or three lobes, so that no two have one outline
      const [dk, lt, hi] = LEAF[kind] || LEAF.oak;
      R(cx, cy - 2, 1, 4, kind === 'olive' ? '#6a5a44' : '#4a3320'); if (kind === 'olive') R(cx - 1, cy, 1, 2, '#6a5a44');
      const lobes = 2 + Math.floor(h(cx, cy, 190) * 2);
      for (let q = 0; q < lobes; q++) { const ox = Math.round((h(cx + q, cy, 191) - 0.5) * sz * 1.4), oy = -Math.round(h(cx, cy + q, 192) * sz * 0.8), r = Math.max(2, sz - q);
        R(cx + ox - r, cy - 3 - r + oy, r * 2 + 1, r + 1, C(dk)); R(cx + ox - r + 1, cy - 4 - r + oy, Math.max(1, r * 2 - 1), 1, C(dk)); R(cx + ox - r, cy - 3 - r + oy, r, Math.max(1, r - 1), C(lt)); R(cx + ox - r + 1, cy - 4 - r + oy, Math.max(1, r - 1), 1, C(hi)); }
      if (kind === 'blossom') for (let q = 0; q < 4; q++) R(cx - sz + Math.floor(h(cx, cy, 193 + q) * sz * 2), cy - 3 - Math.floor(h(cx, cy, 197 + q) * sz), 1, 1, q % 2 ? '#f4d0d8' : '#ffffff');
    }
  };
  // which trees grow where
  const species = (tx, ty, reg, r) => {
    const nn = north(tx, ty) + (r - 0.5) * 0.24;
    if (reg === 'Greywood') return r < 0.1 ? 'dead' : r < 0.4 ? 'fir' : r < 0.68 ? 'oak' : r < 0.84 ? 'birch' : 'yew';
    if (reg === 'Blackmere') return r < 0.25 ? 'dead' : r < 0.7 ? 'willow' : 'fir';
    if (reg === 'The Salt Shore') return r < 0.4 ? 'stone' : r < 0.58 ? 'cypress' : r < 0.84 ? 'olive' : 'oak';
    if (reg === 'The Quarry Hills') return r < 0.28 ? 'cypress' : r < 0.55 ? 'pine' : r < 0.8 ? 'olive' : 'oak';
    if (reg === 'The High Fells' || reg === 'The Barrow Downs') return r < 0.48 ? 'pine' : r < 0.68 ? 'fir' : r < 0.86 ? 'larch' : 'birch';
    if (reg === 'The Home Fields') return r < 0.15 ? 'blossom' : r < 0.45 ? 'beech' : r < 0.74 ? 'oak' : r < 0.88 ? 'chestnut' : 'poplar';
    if (nn > 0.6) return r < 0.52 ? 'pine' : r < 0.76 ? 'larch' : 'birch';
    return r < 0.34 ? 'oak' : r < 0.6 ? 'beech' : r < 0.78 ? 'chestnut' : r < 0.9 ? 'birch' : 'poplar';
  };
  // Places there is only one of. Each is set down where it belongs: on ground of the right kind, in its own part of
  // the country, clear of the town, of the places you can visit, and of each other. They are scenery: nothing is
  // found at them, and the column walks past.
  const marks = [];
  const siteTiles = L.sites.map(q => [q.tx, q.ty]).concat(WILD_FIXED.map(q => [q.tx, q.ty]));
  const sh2 = (sx, sy, sw) => R(sx, sy, sw, 2, 'rgba(0,0,0,.2)');
  const on = (kinds, reg) => (tx, ty) => kinds.includes(at(tx, ty)) && kinds.includes(at(tx + 1, ty)) && kinds.includes(at(tx + 2, ty)) && kinds.includes(at(tx + 1, ty - 1)) && (!reg || wildRegion(tx * 10 + 5, ty * 10 + 5) === reg);
  const byRoad = (tx, ty) => [[0, 1], [0, -1], [1, 0], [-1, 0], [0, 2], [0, -2]].some(([dx, dy]) => at(tx + dx, ty + dy) === T_ROAD);
  const byWater = (tx, ty) => [[0, 1], [0, -1], [1, 0], [-1, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dy]) => wet(at(tx + dx, ty + dy)));
  // A landmark does not sit on untouched grass. The ground about it is trodden, paved, strewn or scorched according
  // to what it is, and where a road passes near, feet have worn a path across to it.
  const APRON = { 'The great oak': 'worn', 'The old arch': 'worn', 'The wine press': 'worn', 'The mill': 'worn', 'The bee garden': 'worn', "The shepherds' fold": 'worn', 'The gallows': 'worn', 'The needle': 'worn', "The giant's table": 'worn',
    'A villa in its garden': 'paved', 'The beacon': 'paved', 'The watchtower': 'paved', 'The great quarry': 'rubble', 'The unfinished columns': 'rubble', 'The broken aqueduct': 'rubble', 'The fallen colossus': 'rubble', 'The lime kiln': 'rubble',
    'A burnt village': 'scorch', 'The ring of stones': 'ring', 'The sacred grove': 'worn', 'The white temple': 'paved', 'The fort': 'worn', 'The old arena': 'rubble', 'The ferry': 'worn', 'The barrow of kings': 'worn' };
  const apron = (x, y, r, name, tx, ty) => {
    const kind = APRON[name], cx = x + r, cy = y + 8, v = q => wildHash(tx * 31 + ty, q, 1320);
    if (kind) {
      const rx = r + 7, ry = kind === 'ring' ? 12 : 6, c = kind === 'paved' ? 'rgba(196,188,166,.6)' : kind === 'rubble' ? 'rgba(190,184,164,.35)' : kind === 'scorch' ? 'rgba(40,34,28,.3)' : kind === 'ring' ? 'rgba(90,120,60,.3)' : 'rgba(150,126,82,.32)';
      for (let dy = -ry; dy <= ry; dy++) { const w = Math.round(rx * Math.sqrt(1 - (dy * dy) / (ry * ry + 0.5)) + (v(dy + 20) - 0.5) * 4); if (w > 0) R(cx - w + Math.round((v(dy + 60) - 0.5) * 3), cy + dy - (kind === 'ring' ? 5 : 0), w * 2, 1, c); }
      if (kind === 'paved') for (let q = 0; q < 10; q++) { const fx = cx - rx + 3 + Math.floor(v(q) * (rx * 2 - 8)), fy = cy - 3 + Math.floor(v(q + 10) * 6); R(fx, fy, 3 + Math.floor(v(q + 30) * 3), 2, q % 2 ? 'rgba(226,220,200,.6)' : 'rgba(150,142,122,.5)'); }
      else if (kind === 'rubble') for (let q = 0; q < 12; q++) R(cx - rx + 2 + Math.floor(v(q) * (rx * 2 - 4)), cy - 4 + Math.floor(v(q + 12) * 9), 1 + (q % 3 === 0 ? 1 : 0), 1, q % 2 ? '#f0ece0' : '#b8b2a0');
      else if (kind === 'worn') for (let q = 0; q < 5; q++) R(cx - rx + 3 + Math.floor(v(q) * (rx * 2 - 6)), cy - 3 + Math.floor(v(q + 12) * 7), 2, 1, q % 2 ? 'rgba(120,98,60,.5)' : 'rgba(190,170,120,.5)');
      else if (kind === 'scorch') for (let q = 0; q < 8; q++) R(cx - rx + 3 + Math.floor(v(q) * (rx * 2 - 6)), cy - 4 + Math.floor(v(q + 12) * 8), 2, 1, q % 3 ? '#1c1814' : '#8a8478');
      else if (kind === 'ring') for (let an = 0; an < Math.PI * 2; an += 0.09) { R(Math.round(cx + Math.cos(an) * (rx + 3)), Math.round(cy - 5 + Math.sin(an) * (ry + 1)), 2, 1, Math.sin(an) > 0 ? 'rgba(40,60,30,.35)' : 'rgba(190,210,140,.3)'); }      // the bank and ditch thrown up round it
    }
    // the path: to the nearest road within reach, across open ground only
    let best = null, bd = 1e9;
    for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 12; dx++) if (at(tx + dx, ty + dy) === T_ROAD) { const d = Math.hypot(dx - 1, dy - 1); if (d < bd) { bd = d; best = [(tx + dx) * 10 + 5, (ty + dy) * 10 + 5]; } }
    if (best && bd > 1.5) { const n = Math.ceil(Math.hypot(best[0] - cx, best[1] - (cy + 2)) / 2); let wob = 0; for (let q = 0; q <= n; q++) { const f = q / n, px = cx + (best[0] - cx) * f, py = cy + 2 + (best[1] - cy - 2) * f, k2 = at(Math.floor(px / 10), Math.floor(py / 10)); wob += (v(q + 100) - 0.5) * 1.2; wob *= 0.9; if (k2 !== T_GRASS && k2 !== T_MEADOW && k2 !== T_HILL && k2 !== T_SAND) continue; if (v(q + 300) > 0.12) R(Math.round(px + wob * 3 * Math.sin(f * Math.PI)), Math.round(py), 2, 2, q % 3 ? 'rgba(158,134,88,.5)' : 'rgba(184,160,112,.5)'); } }
  };
  // ---- every landmark, dressed: what lies under it (u: a shadow thrown, the ground worn or stained) and what was
  // added over it (o: the light and dark of its form, what it is made of, and what stands about it). The thing
  // itself is drawn between the two, where it always was, so whatever moves on it still sits where it should. ----
  const lmV = (q, k2) => wildHash(q, k2, 2000);
  const lmDab = (x0, y0, w, hh, n, cols, sd) => { for (let q = 0; q < n; q++) R(x0 + Math.floor(lmV(q, sd) * w), y0 + Math.floor(lmV(q, sd + 1) * hh), 1 + Math.floor(lmV(q, sd + 2) * 2), 1, cols[q % cols.length]); };
  const lmSoft = (cx, cy, rx, ry, c, sd) => { for (let dy = -ry; dy <= ry; dy++) { const w = Math.round(rx * Math.sqrt(1 - (dy * dy) / (ry * ry + 0.5)) + (lmV(dy + 40, sd || 3) - 0.5) * 3); if (w > 0) R(cx - w + Math.round((lmV(dy + 80, sd || 3) - 0.5) * 2), cy + dy, w * 2, 1, c); } };
  const lmSdw = (x0, y0, w, n) => { for (let i = 0; i < n; i++) R(x0 + i * 2, y0 + i, w, 1, 'rgba(0,0,0,.09)'); };      // a shadow lying away to the south and east
  const DRESS = {
    'The great oak': {
      u: (x, y) => { lmSoft(x + 18, y + 10, 21, 4, 'rgba(20,40,10,.16)', 5); lmDab(x - 2, y + 7, 36, 6, 9, ['#8a6a3a', '#b89040', '#6b4f2c'], 6); },
      o: (x, y) => {
        lmDab(x + 4, y - 24, 20, 14, 16, ['#4c7f38', '#274a20', '#69a04a', '#2d5524'], 7); R(x + 4, y - 7, 22, 1, '#274a20'); R(x + 2, y - 21, 1, 8, '#69a04a'); R(x + 9, y - 28, 6, 1, '#86b860');
        R(x + 21, y - 22, 6, 12, 'rgba(10,30,10,.18)'); R(x + 10, y + 9, 3, 1, '#4a3320'); R(x + 18, y + 9, 4, 1, '#3a2818'); R(x + 14, y + 1, 1, 6, '#3a2818'); R(x + 15, y - 4, 2, 2, '#2a1c14');      // roots, the grain of the bark, a hollow
        R(x + 12, y - 5, 2, 4, '#4a3320'); R(x + 17, y - 6, 3, 2, '#4a3320'); R(x + 19, y - 8, 2, 2, '#4a3320');                                                                                   // the boughs going up into it
        R(x + 4, y + 6, 8, 1, '#a8834a'); R(x + 4, y + 7, 1, 2, '#6b4f2c'); R(x + 11, y + 7, 1, 2, '#6b4f2c');                                                                                      // a bench in its shade
      } },
    'A villa in its garden': {
      u: (x, y) => { lmSoft(x + 19, y + 13, 26, 4, 'rgba(214,204,176,.55)', 8); lmSdw(x + 38, y - 4, 5, 6);
        for (const bx of [-12, 43]) { R(x + bx, y + 1, 7, 8, '#4f7f38'); R(x + bx, y + 1, 7, 1, '#69a04a'); lmDab(x + bx, y + 2, 6, 6, 5, ['#c23b2e', '#f2e6a0', '#e8a0c0'], bx + 30); } },      // gravel before the door, and a bed of flowers at either end
      o: (x, y) => {
        R(x + 26, y - 13, 14, 7, 'rgba(60,20,10,.16)'); R(x - 2, y - 7, 42, 1, '#7a3018'); R(x, y - 5, 38, 1, 'rgba(60,40,20,.25)'); R(x + 30, y - 4, 8, 14, 'rgba(60,40,20,.10)');
        R(x + 14, y - 2, 10, 2, '#d6ccb8'); R(x + 16, y - 4, 6, 2, '#d6ccb8'); R(x + 18, y - 5, 2, 1, '#d6ccb8'); R(x + 13, y + 10, 12, 1, '#f0e8d6'); R(x + 18, y + 2, 1, 8, '#5a3a22');      // a pediment over the door, the step, the two leaves of it
        for (const wx of [4, 28]) { R(x + wx - 1, y - 2, 1, 5, '#5a8a6a'); R(x + wx + 5, y - 2, 1, 5, '#5a8a6a'); R(x + wx - 1, y + 3, 7, 1, '#d6ccb8'); }                                  // shutters
        for (const px of [10, 26]) { R(x + px, y + 8, 2, 2, '#b5522e'); R(x + px - 1, y + 5, 4, 3, '#4c7f38'); R(x + px, y + 4, 2, 1, '#69a04a'); }                                          // bay trees in pots
        R(x + 33, y - 17, 3, 5, '#d8cdb6'); R(x + 33, y - 17, 3, 1, '#8f8676'); for (let q = -10; q < 50; q += 6) R(x + q, y + 9, 1, 2, '#8f8676');                                            // a chimney, and the posts of the garden wall
      } },
    'The old arch': {
      u: (x, y) => { R(x + 3, y + 8, 18, 4, 'rgba(196,188,166,.55)'); lmSdw(x + 23, y + 2, 6, 8); lmSdw(x + 6, y + 9, 4, 3); },
      o: (x, y) => {
        R(x - 2, y - 22, 27, 1, '#f8f4ea'); R(x - 1, y - 15, 25, 1, '#b5aa94'); R(x + 4, y - 20, 15, 4, '#cfc8b4'); for (let q = 0; q < 6; q++) R(x + 5 + q * 2 + (q > 2 ? 1 : 0), y - 19 + (q % 2), 1, 2, '#8f8876');      // the cornice, and what is left of the words cut under it
        for (const px of [0, 17]) { R(x + px - 1, y + 8, 8, 2, '#c9c2ae'); R(x + px - 1, y + 8, 8, 1, '#e8e2d2'); R(x + px - 1, y - 15, 8, 1, '#f0e8d6'); R(x + px + 2, y - 9, 2, 6, '#c2baa4'); R(x + px + 2, y - 9, 1, 6, '#e8e2d2'); for (let q = -10; q < 8; q += 5) R(x + px, y + q, 6, 1, '#c2baa4'); }
        R(x + 6, y - 12, 11, 1, '#9a9280'); R(x + 6, y - 11, 1, 3, '#b5aa94'); R(x + 16, y - 11, 1, 3, '#9a9280'); R(x + 7, y - 12, 1, 1, '#d8d2c0'); R(x + 15, y - 12, 1, 1, '#d8d2c0');      // the soffit in shade, and the spring of the vault
        R(x + 21, y - 4, 2, 9, '#5f8f3a'); R(x + 22, y - 9, 1, 5, '#5f8f3a'); R(x + 20, y + 2, 1, 3, '#7aa84a'); R(x + 23, y - 13, 1, 4, '#4f7a30'); R(x + 3, y - 2, 1, 4, '#8f8876'); R(x + 2, y + 1, 1, 2, '#8f8876');      // ivy up one pier, a crack down the other
        R(x + 8, y - 26, 2, 1, '#8a6420'); R(x + 13, y - 26, 2, 1, '#8a6420'); R(x - 3, y + 9, 2, 1, '#6f9a48'); R(x + 24, y + 9, 3, 1, '#6f9a48');
      } },
    'The wine press': {
      u: (x, y) => { lmSoft(x + 14, y + 10, 22, 3, 'rgba(120,60,90,.16)', 9); for (let q = 0; q < 5; q++) { R(x - 8 + q * 9, y - 12, 1, 6, '#6b4f2c'); R(x - 10 + q * 9, y - 13, 6, 3, '#557a36'); R(x - 9 + q * 9, y - 11, 1, 1, '#6a3a7a'); R(x - 6 + q * 9, y - 12, 1, 1, '#6a3a7a'); } },      // the vines it serves, behind
      o: (x, y) => {
        R(x - 2, y - 8, 2, 18, '#6b4f2c'); R(x - 2, y - 8, 1, 18, '#8a6a3a'); R(x + 18, y - 8, 2, 11, '#5a4326'); R(x - 2, y - 9, 22, 1, '#94703f'); for (let q = 0; q < 5; q++) R(x + 8, y - 6 + q * 2, 2, 1, '#94703f');      // the frame, and the thread of the screw
        for (let q = 4; q < 16; q += 4) R(x + q, y + 3, 1, 7, '#9a8f7a'); R(x + 2, y + 9, 14, 1, '#8f8676'); R(x + 5, y + 4, 8, 1, '#9a3a5a'); R(x + 16, y + 8, 3, 1, '#7a2a4a'); R(x + 14, y + 2, 2, 8, 'rgba(0,0,0,.14)');      // the stones of the vat, the must in it, and where it runs out
        for (const bx of [20, 26]) { R(x + bx, y + 3, 5, 1, '#94703f'); R(x + bx + 4, y + 4, 1, 6, '#5e4426'); R(x + bx + 2, y + 6, 1, 1, '#2a1c14'); }
        for (const gx of [-9, -15]) { R(x + gx, y + 6, 5, 4, '#a8834a'); R(x + gx, y + 6, 5, 1, '#c9a763'); R(x + gx + 1, y + 5, 3, 1, '#5a2a4a'); R(x + gx + 2, y + 4, 1, 1, '#7a3a6a'); }      // baskets of grapes waiting
        R(x + 36, y + 5, 3, 5, '#b8703c'); R(x + 37, y + 3, 1, 2, '#b8703c'); R(x + 36, y + 5, 3, 1, '#d08a54'); lmDab(x + 2, y + 10, 18, 2, 5, ['#7a2a4a', '#5a2a4a'], 10);
      } },
    'The fallen colossus': {
      u: (x, y) => { lmSoft(x + 20, y + 10, 30, 3, 'rgba(0,0,0,.14)', 11); R(x + 42, y - 2, 14, 10, '#b5af9b'); R(x + 42, y - 2, 14, 1, '#e4dfcd'); R(x + 54, y - 1, 2, 9, '#8f8a78'); R(x + 41, y + 8, 16, 2, '#a8a290');      // the plinth it stood on
        R(x + 44, y - 8, 4, 6, '#c9c3ae'); R(x + 50, y - 6, 4, 4, '#c9c3ae'); R(x + 44, y - 8, 1, 6, '#e4dfcd'); R(x + 50, y - 6, 1, 4, '#e4dfcd'); R(x + 44, y - 9, 4, 1, '#8f8a78'); },      // and its feet, still on it
      o: (x, y) => {
        R(x, y - 4, 10, 2, '#b5af9b'); for (let q = 0; q < 5; q++) R(x + q * 2, y - 5 + (q % 2), 2, 1, '#d8d2c0');                                              // the curls of its hair
        R(x + 2, y + 1, 5, 1, '#8f8a78'); R(x + 5, y + 2, 1, 3, '#b5af9b'); R(x + 4, y + 5, 2, 1, '#8f8a78'); R(x + 3, y + 7, 4, 1, '#6d6858'); R(x + 10, y + 1, 2, 8, 'rgba(0,0,0,.14)');      // brow, nose, the line of the mouth
        R(x + 7, y - 1, 1, 5, '#6d6858'); R(x + 8, y + 3, 1, 3, '#6d6858'); R(x + 22, y + 5, 8, 1, '#a8a290'); R(x + 24, y + 4, 1, 4, '#8f8a78'); R(x + 20, y + 8, 12, 1, '#8f8a78');          // a crack through the face, and the folds of the robe
        R(x + 16, y - 2, 4, 4, '#c9c3ae'); R(x + 16, y - 2, 4, 1, '#e4dfcd'); R(x + 36, y + 7, 6, 3, '#b5af9b'); R(x + 36, y + 7, 6, 1, '#d8d2c0');
        lmDab(x, y - 2, 32, 11, 7, ['#9aa85a', '#c9b860', '#7a8a4a'], 12); R(x + 13, y + 9, 5, 1, '#6f9a48'); R(x + 30, y + 9, 5, 1, '#6f9a48'); R(x + 46, y + 9, 3, 1, '#6f9a48');
      } },
    'An old battlefield': {
      u: (x, y) => { lmSoft(x + 18, y + 6, 26, 6, 'rgba(90,70,40,.16)', 13); lmSoft(x + 20, y - 8, 12, 4, '#7fa850', 14); R(x + 12, y - 5, 16, 1, 'rgba(0,0,0,.16)'); for (let q = 0; q < 4; q++) R(x + 17 + q * 2 - (q > 1 ? 1 : 0), y - 13 + (q % 2), 3, 2, q % 2 ? '#a8a290' : '#b8b2a0'); },      // the mound where they were buried, and the cairn on it
      o: (x, y) => {
        R(x - 6, y - 12, 1, 22, '#5a4326'); R(x - 5, y - 12, 5, 4, '#8a2a20'); R(x - 5, y - 8, 3, 2, '#8a2a20'); R(x - 2, y - 9, 2, 1, '#6a1c16'); R(x - 6, y - 13, 1, 1, '#b98a34');      // a standard, what is left of it
        R(x + 38, y + 3, 6, 6, '#6b4f2c'); R(x + 39, y + 4, 4, 4, '#8f7a5a'); R(x + 40, y + 5, 2, 2, '#3a2a1c'); R(x + 41, y + 3, 1, 6, '#6b4f2c'); R(x + 38, y + 6, 6, 1, '#6b4f2c');      // a chariot wheel, sunk to the axle
        lmDab(x, y + 4, 36, 7, 8, ['#e8e2d2', '#c1c7cc', '#f1ead8'], 15); R(x + 16, y + 9, 2, 1, '#b98a34'); R(x + 8, y + 9, 3, 1, '#8f8a84'); R(x + 29, y + 4, 1, 3, '#8f8a84');
        lmDab(x - 4, y - 2, 44, 13, 12, ['#c23b2e', '#d8382a'], 16);                                                                                                                           // poppies
      } },
    'The bee garden': {
      u: (x, y) => { lmSoft(x + 15, y + 6, 24, 9, 'rgba(160,190,90,.22)', 17); lmDab(x - 8, y - 4, 46, 20, 26, ['#b9a0e0', '#f2e6a0', '#e8a0c0', '#f4f4f0', '#9a7ad0'], 18);
        for (let q = -6; q < 38; q += 4) { R(x + q, y - 5, 1, 6, '#8a6a3a'); } R(x - 6, y - 4, 44, 1, '#a8834a'); R(x - 6, y - 1, 44, 1, '#94703f'); },      // a wattle fence against the wind
      o: (x, y) => {
        for (let q = 0; q < 5; q++) { const hx = x + 1 + q * 6; R(hx + 1, y, 3, 1, '#c9a050'); R(hx + 2, y - 1, 1, 1, '#b89040'); R(hx, y + 2, 1, 5, '#e6c478'); R(hx + 4, y + 2, 1, 5, '#a88030'); R(hx, y + 4, 5, 1, '#c9a050'); }      // each skep bound in its rings of straw
        R(x, y + 7, 30, 1, '#94703f'); R(x + 34, y - 1, 9, 9, '#cdbd94'); R(x + 34, y - 1, 2, 9, '#e0d2ac'); R(x + 33, y - 5, 11, 4, '#9a7a42'); R(x + 33, y - 5, 11, 1, '#b8964e'); R(x + 37, y + 3, 3, 5, '#3a2416');      // the bee-man's hut
        for (let q = 0; q < 7; q++) { R(x - 4 + q * 6, y + 12, 4, 2, '#6f8a5a'); R(x - 3 + q * 6, y + 11, 2, 1, '#9a7ad0'); R(x - 4 + q * 6, y + 12, 1, 1, '#b9a0e0'); }                    // lavender, in a row before them
        R(x - 9, y + 5, 3, 4, '#b8703c'); R(x - 9, y + 5, 3, 1, '#d08a54');
      } },
    'The mill': {
      u: (x, y) => { for (let q = 0; q < 16; q++) { R(x - 18 + q, y + 10 - Math.round(q * 0.1), 1, 3, q % 3 ? '#5a9cc6' : '#8fc3e0'); } R(x - 18, y + 8, 16, 1, '#b5aa94'); R(x - 18, y + 12, 16, 1, '#8f8676'); lmSdw(x + 28, y - 4, 5, 7); },      // the race that brings the water to the wheel
      o: (x, y) => {
        for (let q = 9; q < 30; q += 3) R(x + q, y - 11, 1, 5, '#6f4424'); R(x + 8, y - 7, 22, 1, '#5e3a1e'); R(x + 24, y - 12, 6, 6, 'rgba(40,20,10,.18)'); R(x + 24, y - 16, 3, 5, '#b5aa94'); R(x + 24, y - 16, 3, 1, '#8f8676');      // the roof in its courses, and a chimney
        lmDab(x + 11, y - 4, 16, 13, 9, ['#c9b88c', '#e6d8b0', '#b8a67c'], 19); R(x + 24, y - 5, 4, 15, 'rgba(60,40,20,.12)'); R(x + 22, y - 3, 5, 1, '#8a6a3a'); R(x + 16, y + 1, 7, 1, '#8a6a3a');
        R(x - 2, y - 2, 12, 1, '#7a5a34'); R(x - 2, y + 9, 12, 1, '#3a2a1c'); for (const [px, py] of [[-3, 0], [9, 0], [-3, 7], [9, 7]]) R(x + px, y + py, 2, 2, '#94703f');                                                              // the paddles of the wheel
        R(x - 6, y + 10, 8, 2, '#e6f3fa'); R(x - 9, y + 12, 6, 1, '#cfe6f2');                                                                                                                                                             // white water off the tail of it
        for (const [sx, sy] of [[29, 6], [32, 7], [30, 3]]) { R(x + sx, y + sy, 4, 3, '#d8c9a0'); R(x + sx, y + sy, 4, 1, '#efe2bc'); R(x + sx + 1, y + sy - 1, 2, 1, '#b8a67c'); }                                                       // sacks of flour by the door
        R(x + 36, y + 4, 2, 6, '#b5ad9c'); R(x + 35, y + 5, 4, 4, '#b5ad9c'); R(x + 36, y + 6, 2, 2, '#6d6858'); R(x + 35, y + 5, 1, 4, '#d6cfbc');                                                                                      // a worn stone, leaned against the wall
      } },
    'A wreck on the strand': {
      u: (x, y) => { lmSoft(x + 15, y + 8, 22, 4, 'rgba(150,130,90,.3)', 20); R(x - 6, y + 10, 8, 2, '#8fc3e0'); R(x - 5, y + 10, 5, 1, '#cfe6f2'); },      // wet sand under her, and a pool the tide left
      o: (x, y) => {
        for (let q = 0; q < 3; q++) { R(x + 2, y + 3 - q * 2, 12 - q * 2, 1, q % 2 ? '#7a5a34' : '#6b4f2c'); R(x + 18 + q, y + 4 - q, 10 - q * 2, 1, '#5a4326'); }                    // what planking is still on her
        R(x - 2, y + 7, 10, 2, '#e2d2a0'); R(x + 20, y + 8, 12, 1, '#e2d2a0'); R(x - 2, y + 7, 10, 1, '#f0e2b4');                                                                    // sand drifted against the hull
        lmDab(x + 2, y - 3, 28, 9, 8, ['#5f7a4a', '#3d5a3a', '#8a9a6a'], 21); R(x + 6, y - 6, 1, 1, '#f4f4f0'); R(x + 14, y - 6, 1, 1, '#f4f4f0'); R(x + 22, y - 9, 1, 1, '#f4f4f0');      // weed on her timbers, gulls on her ribs
        R(x + 28, y - 4, 4, 1, '#a39a84'); R(x + 30, y - 3, 3, 3, '#b5ad9c');
        R(x - 8, y + 2, 1, 6, '#3a3a3a'); R(x - 10, y + 7, 5, 1, '#3a3a3a'); R(x - 10, y + 6, 1, 1, '#3a3a3a'); R(x - 6, y + 6, 1, 1, '#3a3a3a'); R(x - 9, y + 1, 3, 1, '#3a3a3a');      // her anchor, in the sand where it was let go
        for (const [ax, ay] of [[34, 6], [38, 8], [36, 3]]) { R(x + ax, y + ay, 2, 3, '#b8703c'); R(x + ax, y + ay, 2, 1, '#d08a54'); } R(x + 41, y + 6, 4, 3, '#7a5a34'); R(x + 41, y + 6, 4, 1, '#94703f');      // what she carried
      } },
    'The beacon': {
      u: (x, y) => { lmSdw(x + 14, y - 2, 6, 10); for (const [rx0, ry0, rw] of [[-4, 8, 5], [16, 9, 4], [-1, 10, 3]]) { R(x + rx0, y + ry0, rw, 2, '#8f8a80'); R(x + rx0, y + ry0, rw, 1, '#b5ad9c'); } },
      o: (x, y) => {
        for (let q = -21; q < 6; q += 4) { R(x + 5, y + q, 6, 1, '#d8d2c0'); R(x + 5 + ((q + 21) % 8 ? 2 : 4), y + q - 2, 1, 2, '#d8d2c0'); }                                         // the courses of the stone
        R(x + 4, y - 14, 9, 1, '#c25a3e'); R(x + 4, y - 4, 9, 1, '#c25a3e'); R(x + 11, y - 14, 2, 3, '#8a3622'); R(x + 11, y - 4, 2, 3, '#8a3622'); R(x + 7, y - 19, 2, 3, '#3a2a1c'); R(x + 7, y - 9, 2, 3, '#3a2a1c');
        R(x + 1, y - 28, 15, 1, '#a8834a'); for (let q = 1; q < 16; q += 2) R(x + q, y - 30, 1, 2, '#6b4f2c'); R(x + 1, y - 31, 15, 1, '#6b4f2c'); R(x + 3, y - 25, 11, 1, '#5e4426');      // the gallery round the lamp, and its rail
        R(x + 6, y, 5, 1, '#c9c2ae'); R(x + 2, y + 9, 14, 1, '#6d6860'); R(x + 5, y + 10, 8, 1, '#b5ad9c');
        R(x + 18, y + 1, 10, 9, '#e8e2d2'); R(x + 18, y + 1, 2, 9, '#f8f4ea'); R(x + 17, y - 3, 12, 4, '#b5522e'); R(x + 17, y - 3, 12, 1, '#d06a3e'); R(x + 21, y + 5, 3, 5, '#3a2416'); R(x + 25, y + 3, 2, 2, '#3a2a1c');      // the keeper's house
        for (let q = 0; q < 3; q++) R(x + 30, y + 8 - q * 2, 5 - q, 2, q % 2 ? '#7a5a34' : '#6b4f2c');                                                                                // and the wood he burns
      } },
    'The bones of a whale': {
      u: (x, y) => { for (let q = 0; q < 6; q++) { const hh = 6 + Math.round(Math.sin((q + 0.5) / 6 * Math.PI) * 6); for (let i = 0; i < hh; i += 2) R(x + 6 + q * 4 + i, y + 7 + Math.round(i * 0.4), 2, 1, 'rgba(60,40,10,.14)'); R(x + 6 + q * 4, y + 6 - hh + 2, 1, hh - 2, '#d8d0bc'); } },      // the far ribs, and the shadow of the near ones on the sand
      o: (x, y) => {
        for (let q = 0; q < 10; q++) R(x + 1 + q * 3, y + 4, 2, 1, '#ffffff'); for (const [tx2, ty2, tw] of [[30, 5, 4], [35, 6, 3], [39, 6, 2], [42, 7, 2]]) { R(x + tx2, y + ty2, tw, 2, '#e8e2d2'); R(x + tx2, y + ty2, tw, 1, '#ffffff'); }      // the knuckles of the spine, running out to the tail
        R(x - 12, y + 7, 12, 1, '#f1ead8'); R(x - 13, y + 6, 3, 1, '#f1ead8'); R(x - 11, y + 9, 10, 1, '#e0d8c4'); R(x - 3, y + 2, 2, 2, '#8f8676'); R(x - 6, y + 6, 6, 1, '#d8d0bc'); R(x + 1, y + 2, 1, 4, '#d8d0bc');      // the long jaws, and the socket of the eye
        for (let q = 0; q < 6; q++) R(x + 5 + q * 4, y + 5 - (6 + Math.round(Math.sin((q + 0.5) / 6 * Math.PI) * 6)), 1, 3, '#ffffff');
        R(x + 12, y + 8, 6, 1, '#e2d2a0'); R(x + 24, y + 8, 5, 1, '#e2d2a0'); R(x + 20, y + 9, 2, 1, '#c23b2e'); R(x + 8, y - 8, 2, 1, '#f4f4f0'); R(x + 9, y - 7, 1, 1, '#e3b04a');      // sand blown over it, a crab, a gull
      } },
    "The fishers' huts": {
      u: (x, y) => { lmSoft(x + 18, y + 10, 26, 3, 'rgba(120,100,60,.2)', 22); R(x - 14, y + 8, 12, 3, '#5e4426'); R(x - 14, y + 8, 12, 1, '#8a6a3a'); R(x - 15, y + 9, 1, 1, '#5e4426'); R(x - 2, y + 9, 1, 1, '#5e4426'); R(x - 12, y + 6, 8, 1, '#c9b890'); R(x - 13, y + 11, 12, 1, 'rgba(0,0,0,.2)'); },      // a second boat, hauled out, her oars laid across
      o: (x, y) => {
        for (const hx of [0, 13]) { for (let q = 0; q < 12; q += 2) R(x + hx - 1 + q, y - 2 + (q % 4 ? 0 : 1), 1, 3, '#7a5e30'); R(x + hx - 1, y + 1, 12, 1, '#6b5028'); R(x + hx + 7, y + 2, 3, 8, 'rgba(60,40,20,.14)'); R(x + hx + 1, y + 4, 2, 2, '#3a2a1c'); R(x + hx, y + 2, 1, 8, '#e6d8b0'); }      // thatch, and the shade down one side of each
        R(x + 27, y + 7, 10, 1, '#94703f'); R(x + 29, y + 5, 2, 1, '#d8d2c0'); R(x + 33, y + 5, 3, 1, '#8a6a3a'); R(x + 31, y - 3, 3, 2, '#c9c0aa');
        for (const px of [42, 52]) R(x + px, y - 2, 1, 12, '#6b4f2c'); R(x + 42, y - 1, 11, 1, '#8a6a3a'); R(x + 42, y + 3, 11, 1, '#8a6a3a'); for (let q = 0; q < 5; q++) { R(x + 43 + q * 2, y, 1, 2, q % 2 ? '#c1c7cc' : '#e8e2d2'); R(x + 44 + q * 2 - (q > 3 ? 2 : 0), y + 4, 1, 2, '#c1c7cc'); }      // fish, split and hung to dry
        for (const [bx, by] of [[9, 8], [24, 9], [38, 8]]) { R(x + bx, y + by, 3, 2, '#a8834a'); R(x + bx, y + by, 3, 1, '#c9a763'); } lmDab(x + 24, y + 10, 14, 2, 5, ['#c9a21e', '#c23b2e'], 23);      // baskets, and the floats of a net
      } },
    'The charcoal burners': {
      u: (x, y) => { lmSoft(x + 10, y + 7, 20, 6, 'rgba(30,26,22,.3)', 24); for (const [lx, ly] of [[-12, 3], [-12, 7]]) { R(x + lx, y + ly, 10, 3, '#7a5a34'); R(x + lx, y + ly, 10, 1, '#94703f'); for (let q = 0; q < 10; q += 3) R(x + lx + q, y + ly + 1, 2, 2, '#c9a763'); } },      // black ground, and the cordwood stacked ready
      o: (x, y) => {
        lmDab(x + 3, y, 14, 9, 9, ['#4a443a', '#2a2620', '#5a6a3a'], 25); R(x + 2, y + 2, 2, 8, '#4a443a'); R(x + 15, y + 3, 3, 7, '#241f1a'); R(x + 7, y - 3, 6, 1, '#5a5348');      // the turf it is clamped under
        for (const [vx, vy] of [[5, 7], [10, 8], [14, 6], [8, 3]]) { R(x + vx, y + vy, 1, 1, '#e2702a'); } R(x + 9, y - 3, 2, 1, '#8a8478');                                    // the vents, with the fire showing in them
        R(x + 21, y - 4, 8, 1, '#7a6a52'); R(x + 23, y + 5, 3, 5, '#2a1c14'); R(x + 27, y + 4, 1, 6, '#5e4426');
        for (const [sx, sy] of [[30, 6], [33, 7], [31, 3]]) { R(x + sx, y + sy, 3, 3, '#2a2620'); R(x + sx, y + sy, 3, 1, '#4a443a'); }                                          // sacks of what they make
        R(x - 4, y - 4, 4, 3, '#8a6a3a'); R(x - 4, y - 4, 4, 1, '#c9a763'); R(x - 2, y - 8, 1, 4, '#6b4f2c'); R(x - 3, y - 9, 3, 1, '#8f8a84'); R(x + 36, y + 2, 1, 8, '#6b4f2c'); R(x + 35, y + 1, 3, 1, '#8f8a84');      // an axe in a stump, a rake
      } },
    "The hunters' lodge": {
      u: (x, y) => { lmSoft(x + 12, y + 10, 22, 3, 'rgba(150,126,82,.4)', 26); lmSdw(x + 24, y - 4, 4, 6); },
      o: (x, y) => {
        for (const cx of [2, 21]) for (let q = -1; q < 10; q += 3) { R(x + cx - 1, y + q, 2, 2, '#94703f'); R(x + cx - 1, y + q, 2, 1, '#b8904f'); }                              // the ends of the logs at each corner
        for (let q = 1; q < 24; q += 3) R(x + q, y - 7, 1, 5, '#4a3c2e'); R(x, y - 3, 24, 1, '#3a2e22'); R(x + 16, y - 8, 8, 6, 'rgba(20,10,0,.16)'); R(x + 18, y - 12, 3, 1, '#b5aea4');
        R(x + 16, y + 1, 4, 4, '#2a1c14'); R(x + 17, y + 1, 1, 4, '#8a6a3a'); R(x + 15, y + 5, 6, 1, '#94703f'); R(x + 9, y + 2, 1, 8, '#4a3320'); R(x + 6, y - 3, 2, 1, '#e8e2d2'); R(x + 15, y - 3, 2, 1, '#e8e2d2');      // a window, and the spread of the antlers
        R(x - 10, y - 2, 1, 12, '#6b4f2c'); R(x - 3, y - 2, 1, 12, '#6b4f2c'); R(x - 10, y - 2, 8, 1, '#6b4f2c'); R(x - 8, y, 4, 7, '#b8905a'); R(x - 8, y, 4, 1, '#d0a870'); R(x - 7, y + 2, 2, 3, '#a07848');                 // a hide stretched on a frame
        R(x + 30, y - 6, 1, 16, '#6b4f2c'); R(x + 30, y - 6, 8, 1, '#6b4f2c'); R(x + 33, y - 5, 2, 5, '#8a6a4a'); R(x + 36, y - 5, 2, 4, '#b8a890'); R(x + 33, y, 2, 1, '#5e4426');                                         // game hung up out of reach
        R(x + 4, y + 9, 3, 2, '#7a6a52'); R(x + 3, y + 8, 2, 2, '#7a6a52'); R(x + 6, y + 10, 1, 1, '#3a2a1c');                                                                                                         // a dog asleep by the door
      } },
    'A burnt village': {
      u: (x, y) => { lmSoft(x + 18, y + 6, 28, 7, 'rgba(40,34,28,.22)', 27); lmDab(x - 4, y, 46, 12, 12, ['#8a8478', '#b5aea4', '#5a544c'], 28); },      // ash, lying where it fell
      o: (x, y) => {
        for (const [bx, by, l, d] of [[2, 2, 8, 1], [16, 0, 9, -1], [30, 3, 6, 1], [20, 5, 7, 1]]) for (let q = 0; q < l; q++) R(x + bx + q, y + by + Math.round(q * 0.5) * d + (d < 0 ? 4 : 0), 1, 2, '#1c1612');      // roof timbers, come down across the rooms
        R(x + 20, y - 9, 3, 12, '#6a645c'); R(x + 20, y - 9, 1, 12, '#8a8478'); R(x + 19, y - 10, 5, 1, '#5a544c'); R(x + 21, y + 1, 2, 2, '#120c0a');                                                              // one hearth and its chimney, still standing
        for (const [hx, hw] of [[0, 9], [13, 11], [28, 8]]) { R(x + hx, y + 9, hw, 1, '#4a443a'); R(x + hx + 1, y + 4, 1, 3, '#4a443a'); }
        R(x + 40, y + 3, 6, 5, '#8f8a80'); R(x + 40, y + 3, 6, 1, '#b5aea4'); R(x + 41, y + 4, 4, 3, '#1c2a30'); R(x + 39, y - 3, 1, 7, '#2a241e'); R(x + 46, y - 3, 1, 7, '#2a241e'); R(x + 39, y - 3, 8, 1, '#2a241e');      // the well
        R(x - 8, y - 8, 2, 18, '#1c1612'); R(x - 11, y - 6, 3, 1, '#1c1612'); R(x - 6, y - 10, 4, 1, '#1c1612'); R(x - 10, y - 2, 2, 1, '#1c1612');                                                                  // a tree that burned with it
        for (const [gx, gy] of [[5, 10], [18, 11], [33, 10], [-4, 9], [26, 11]]) { R(x + gx, y + gy, 1, 2, '#6f9a48'); R(x + gx + 1, y + gy, 1, 1, '#8ab04a'); }                                                    // and green coming up through it
      } },
    'The lime kiln': {
      u: (x, y) => { lmSoft(x + 12, y + 9, 24, 4, 'rgba(240,236,224,.4)', 29); for (let i = 0; i < 10; i++) R(x - 10 + i, y + 9 - i, 12 - i, 1, i % 2 ? '#a89a78' : '#b8a888'); R(x - 10, y + 10, 12, 1, 'rgba(0,0,0,.2)'); },      // lime dust on everything, and the ramp they charge it from
      o: (x, y) => {
        for (let q = -2; q < 10; q += 3) { R(x + 4, y + q, 14, 1, '#a39a84'); R(x + 6 + ((q + 2) % 6 ? 3 : 7), y + q - 2, 1, 2, '#a39a84'); } R(x + 15, y - 4, 3, 14, 'rgba(40,30,20,.16)'); R(x + 2, y + 1, 16, 1, '#5a5a5a'); R(x + 2, y - 4, 16, 1, '#d8cdb6');      // its courses, and an iron band round its belly
        R(x + 6, y + 2, 8, 1, '#8f8676'); R(x + 6, y + 3, 1, 7, '#8f8676'); R(x + 13, y + 3, 1, 7, '#8f8676'); R(x + 5, y - 12, 10, 1, '#6d6658'); R(x + 7, y - 11, 6, 1, '#2a1c14');                                                                            // the arch of the draw-hole, and the black of its throat
        for (const [cx, cy, cw] of [[-12, 4, 4], [-8, 6, 3], [-13, 7, 5]]) { R(x + cx, y + cy, cw, 3, '#d8d4c6'); R(x + cx, y + cy, cw, 1, '#f0ece0'); }                                                                                                    // stone waiting to be burned
        R(x + 20, y + 4, 4, 1, '#ffffff'); R(x + 26, y + 8, 5, 2, '#f0ece0'); R(x + 28, y + 5, 3, 4, '#8a6a3a'); R(x + 28, y + 5, 3, 1, '#a8834a'); R(x + 31, y + 6, 4, 1, '#6b4f2c'); R(x + 28, y + 9, 2, 2, '#3a2a1c');                                    // and a barrow for what comes out
      } },
    'The unfinished columns': {
      u: (x, y) => { lmSoft(x + 16, y + 9, 26, 3, 'rgba(232,226,208,.4)', 30); R(x - 10, y - 8, 22, 7, '#cfc5a8'); R(x - 10, y - 8, 22, 1, '#f1ead6'); R(x - 10, y - 2, 22, 1, '#9c9278'); R(x - 6, y - 6, 14, 3, '#e2d9c0'); R(x - 6, y - 6, 14, 1, '#ffffff'); for (let q = -4; q < 8; q += 4) R(x + q, y - 6, 1, 3, '#b9ae90'); lmSdw(x + 34, y - 2, 4, 8); },      // the bed of rock, with one still lying in it uncut
      o: (x, y) => {
        for (const [cx, cy, l] of [[0, 4, 22], [6, 8, 26], [14, 0, 18]]) { R(x + cx, y + cy + 1, l, 1, '#d8d4c6'); R(x + cx, y + cy + 2, l, 1, '#b8b2a0'); R(x + cx - 1, y + cy, 1, 3, '#c4bfae'); R(x + cx, y + cy + 3, l, 1, 'rgba(60,54,40,.25)'); }      // each drum round, with the light along the top of it
        R(x + 31, y - 9, 1, 18, '#d8d4c6'); R(x + 33, y - 10, 1, 20, '#b8b2a0'); R(x + 29, y - 13, 6, 3, '#e8e4d8'); R(x + 29, y - 13, 6, 1, '#ffffff'); R(x + 34, y - 13, 1, 3, '#b8b2a0'); R(x + 29, y + 8, 6, 2, '#d8d4c6'); R(x + 29, y + 8, 6, 1, '#f8f6ee');      // the one they stood up: its flutes, and the block left rough for the capital
        for (const lx of [8, 16, 24]) { R(x + lx, y + 11, 3, 1, '#6b4f2c'); R(x + lx, y + 11, 1, 1, '#94703f'); }                                                                                                                                               // the rollers it was moving on
        R(x + 38, y + 5, 5, 4, '#e8e4d8'); R(x + 38, y + 5, 5, 1, '#ffffff'); R(x + 42, y + 6, 1, 3, '#b8b2a0'); R(x + 37, y + 3, 1, 3, '#5a5a5a'); R(x + 36, y + 2, 3, 1, '#8f8a84'); lmDab(x - 4, y + 9, 40, 3, 8, ['#f8f6ee', '#c4bfae'], 31);                      // a mallet left on a block, and chips
      } },
    'The watchtower': {
      u: (x, y) => { lmSdw(x + 16, y - 6, 6, 14); for (let q = -8; q < 30; q += 4) if (q < 2 || q > 16) { R(x + q, y + 8, 3, 3, '#8f8a80'); R(x + q, y + 8, 3, 1, '#b5aea4'); } },      // a ring of wall round its foot
      o: (x, y) => {
        for (let q = -14; q < 10; q += 5) { R(x + 6 + ((q + 14) % 10 ? 2 : 5), y + q - 2, 1, 2, '#85817a'); R(x + 6 + ((q + 14) % 10 ? 6 : 1), y + q + 1, 1, 2, '#85817a'); } R(x + 12, y - 18, 2, 28, 'rgba(0,0,0,.10)');
        R(x + 3, y - 18, 14, 1, '#77736a'); R(x + 3, y - 19, 14, 1, '#bdb8ac'); R(x + 7, y - 21, 2, 2, '#77736a'); R(x + 12, y - 21, 1, 3, '#77736a');                                                            // the string course under the battlements
        R(x + 9, y - 3, 2, 3, '#2a241e'); R(x + 6, y - 12, 1, 3, '#2a241e'); R(x + 8, y + 2, 4, 1, '#bdb8ac'); R(x + 7, y + 3, 1, 7, '#85817a'); R(x + 12, y + 3, 1, 7, '#5a564e');                                  // more slits, and the frame of the door
        R(x + 14, y - 23, 3, 2, '#3a3a3a'); R(x + 15, y - 21, 1, 3, '#3a3a3a'); R(x + 14, y - 24, 3, 1, '#e2702a');                                                                                                  // the iron basket they light at night
        R(x + 18, y + 1, 10, 8, '#7a5a34'); R(x + 17, y - 2, 12, 3, '#5a4a3a'); R(x + 17, y - 2, 12, 1, '#7a6a52'); R(x + 20, y + 3, 6, 6, '#2a1c14'); R(x + 21, y + 5, 3, 2, '#8a6a4a'); R(x + 23, y + 4, 2, 2, '#8a6a4a');      // a lean-to for the horse
        R(x - 6, y + 2, 1, 7, '#5a4326'); R(x - 5, y + 2, 4, 1, '#5a4326'); R(x - 4, y + 3, 2, 3, '#c1c7cc');
      } },
    'The hot spring': {
      u: (x, y) => { lmSoft(x + 14, y + 7, 24, 6, 'rgba(236,232,220,.5)', 32); },
      o: (x, y) => {
        R(x, y + 2, 2, 8, '#fbfaf4'); R(x + 20, y + 4, 2, 6, '#d8d4c8'); lmDab(x, y, 22, 3, 6, ['#e0b070', '#c9d8a0', '#e8c890'], 33); R(x + 3, y + 8, 16, 1, '#4aa49c'); R(x + 8, y + 4, 5, 1, '#c8f0ea');      // the crust of it, stained by what is in the water
        for (const [px, py, pw] of [[22, 6, 7], [27, 9, 8], [33, 11, 6]]) { R(x + px - 1, y + py, pw + 2, 3, '#f2efe6'); R(x + px, y + py, pw, 2, '#7fd0c8'); R(x + px, y + py, pw - 2, 1, '#a8e4dc'); R(x + px - 1, y + py + 3, pw + 2, 1, '#d8d4c8'); }      // it runs off down the slope from basin to basin
        for (const [sx, sy] of [[-5, 7], [-2, 10], [24, 2]]) { R(x + sx, y + sy, 4, 3, '#a2aab4'); R(x + sx, y + sy, 4, 1, '#c8ced6'); }
        R(x - 8, y + 2, 1, 6, '#6b4f2c'); R(x - 8, y + 2, 5, 1, '#6b4f2c'); R(x - 7, y + 3, 3, 3, '#f1ead8'); R(x - 3, y + 2, 1, 6, '#6b4f2c');                                                                  // somebody's linen, on a rail
      } },
    'The eagle rock': {
      u: (x, y) => { lmSdw(x + 14, y - 2, 6, 12); for (let q = 0; q < 16; q++) { const w = 1 + Math.round(q * 0.3); R(x + 20 - w, y - 6 + q, w, 1, '#a2aab4'); R(x + 20, y - 6 + q, w + 1, 1, '#646c78'); } },      // a lesser crag beside the great one
      o: (x, y) => {
        for (let q = 4; q < 28; q += 5) { const w = 2 + Math.round(q * 0.22); R(x + 8 - w, y - 20 + q, Math.max(1, w - 2), 1, '#c8ced6'); R(x + 9, y - 19 + q, Math.max(1, w - 1), 1, '#4a515c'); }      // ledges in the light, and the cracks between them
        R(x + 7, y - 20, 1, 7, '#e8e2d2'); R(x + 6, y - 15, 1, 3, '#e8e2d2'); R(x + 4, y - 22, 9, 1, '#5e4426'); R(x + 3, y - 23, 2, 1, '#8a6a3a'); R(x + 12, y - 23, 2, 1, '#8a6a3a');                            // the white below the nest, and the sticks of it
        R(x + 2, y - 4, 4, 3, '#2d5236'); R(x + 3, y - 6, 2, 2, '#3a6442'); R(x + 4, y - 1, 1, 2, '#4a3320'); R(x + 13, y + 2, 3, 2, '#2d5236'); R(x + 14, y, 1, 2, '#3a6442');                                // a pine or two, holding on
        lmDab(x - 4, y + 7, 30, 4, 9, ['#a2aab4', '#7d8692', '#c8ced6'], 34); R(x + 1, y + 9, 3, 1, '#efe8d8'); R(x + 3, y + 8, 1, 1, '#efe8d8');                                                                  // scree, and what the eagles dropped
      } },
    'The ring of stones': {
      u: (x, y) => { lmSoft(x + 16, y + 3, 12, 5, 'rgba(160,150,100,.25)', 35); for (let an = 0; an < Math.PI * 2; an += 0.5) R(Math.round(x + 16 + Math.cos(an) * 9), Math.round(y + 4 + Math.sin(an) * 4), 1, 1, an % 1 ? '#f4f4f0' : '#c9a21e'); R(x + 36, y + 8, 9, 3, '#a8a290'); R(x + 36, y + 8, 9, 1, '#c9c3ae'); R(x + 36, y + 11, 10, 1, 'rgba(0,0,0,.2)'); },      // the ground trodden inside it, a ring of pale caps in the grass, and one stone long fallen
      o: (x, y) => {
        const cx = x + 16, cy = y + 3;
        for (let q = 0; q < 9; q++) { const an = q / 9 * Math.PI * 2 + 0.3, sx = Math.round(cx + Math.cos(an) * 15), sy = Math.round(cy + Math.sin(an) * 7), hh = 6 + (q * 3) % 4; R(sx + 1, sy - hh + 1, 1, hh, '#8a8474'); if (q % 2) R(sx - 1, sy - hh, 2, 1, '#8aa04a'); if (q % 3 === 0) R(sx, sy - hh + 3, 1, 2, '#6d6858'); for (let i = 0; i < 4; i++) R(sx + 2 + i, sy + 1 + Math.round(i * 0.4), 2, 1, 'rgba(0,0,0,.10)'); }
        R(cx + 11, cy - 14, 8, 1, '#c9c3ae'); R(cx + 11, cy - 11, 8, 1, '#6d6858'); R(cx - 4, cy + 2, 8, 1, '#6d6858'); R(cx - 2, cy - 1, 2, 1, '#c23b2e'); R(cx + 1, cy - 1, 2, 1, '#f2e6a0'); R(cx - 1, cy - 2, 1, 1, '#6f9a48');      // the lintel, and what was left on the altar this morning
      } },
    "The giant's table": {
      u: (x, y) => { lmSdw(x + 24, y - 8, 6, 10); for (let an = 0; an < Math.PI * 2; an += 0.45) { const sx = Math.round(x + 12 + Math.cos(an) * 22), sy = Math.round(y + 7 + Math.sin(an) * 5); R(sx, sy, 3, 2, an % 0.9 < 0.45 ? '#9a9484' : '#857f70'); R(sx, sy, 3, 1, '#bdb8a8'); } },      // the kerb of the cairn that once covered it
      o: (x, y) => {
        R(x + 7, y - 5, 9, 15, 'rgba(0,0,0,.3)'); R(x + 6, y - 6, 1, 16, '#6d6858'); R(x + 16, y - 5, 1, 15, '#a8a290'); R(x + 20, y - 5, 1, 15, '#5f5a4c');      // the dark of the chamber between the uprights
        R(x - 2, y - 7, 28, 1, '#8a8474'); R(x + 22, y - 11, 4, 6, 'rgba(0,0,0,.14)'); lmDab(x - 1, y - 11, 26, 4, 8, ['#c9a23a', '#8aa04a', '#d8d2c0', '#e0b050'], 36); R(x + 4, y - 12, 4, 1, '#6f9a48'); R(x + 19, y - 12, 3, 1, '#86b058');      // lichen, gold and grey, on the capstone
        R(x + 10, y - 9, 1, 1, '#6d6858'); R(x + 14, y - 8, 1, 1, '#6d6858'); R(x + 3, y + 2, 2, 1, '#bdb8a8'); R(x + 17, y + 4, 2, 1, '#6d6858'); lmDab(x - 8, y + 6, 40, 6, 12, ['#b070c0', '#9a5aa8', '#c890d0'], 37);                          // cups cut in it, and heather all round
      } },
    'The needle': {
      u: (x, y) => { for (let i = 0; i < 20; i++) R(x + 8 + i * 2, y + 9 + Math.round(i * 0.35), 3, 1, 'rgba(0,0,0,.10)'); R(x - 2, y + 7, 15, 4, '#8f8876'); R(x - 2, y + 7, 15, 1, '#b5af9b'); R(x, y + 5, 11, 2, '#a8a290'); R(x, y + 5, 11, 1, '#cfc9b6'); R(x + 9, y + 5, 2, 6, '#6d6858'); },      // its long shadow, and the steps it stands on
      o: (x, y) => {
        R(x + 5, y - 25, 1, 1, '#e8b545'); R(x + 4, y - 24, 3, 1, '#c9a23a'); R(x + 5, y - 21, 1, 30, '#b8b2a0'); R(x + 6, y - 21, 1, 26, '#8f8876');
        for (let q = 0; q < 5; q++) R(x + 4, y - 20 + q * 5, 1, 2, '#857f70'); lmDab(x + 3, y - 10, 4, 14, 4, ['#8aa04a', '#c9a23a'], 38);                              // more of what is cut on it, and lichen low down
        R(x + 2, y - 3, 7, 1, '#c23b2e'); R(x + 8, y - 2, 1, 4, '#c23b2e'); R(x + 2, y - 7, 7, 1, '#f1ead8'); R(x + 2, y - 6, 1, 3, '#f1ead8');                            // ribbons tied round it by those who came asking
        R(x - 1, y + 9, 3, 2, '#b8703c'); R(x - 1, y + 9, 3, 1, '#d08a54'); R(x + 10, y + 9, 2, 1, '#c23b2e'); R(x + 4, y + 10, 2, 1, '#f2e6a0'); R(x + 7, y + 10, 1, 1, '#e8a0c0');
      } },
    'The drowned temple': {
      u: (x, y) => { lmSoft(x + 15, y + 8, 26, 6, '#2e4842', 39); lmSoft(x + 15, y + 8, 20, 4, '#28403a', 40); },
      o: (x, y) => {
        for (const [px, hh] of [[1, 16], [9, 11], [18, 18], [26, 8]]) { for (let q = 0; q < Math.min(5, hh >> 1); q++) R(x + px + (q % 2), y + 7 + q, 3, 1, 'rgba(216,210,192,.28)'); R(x + px + 1, y + 7 - hh, 1, hh - 1, '#c2baa4'); R(x + px - 1, y + 6 - hh, 6, 1, '#a8a290'); R(x + px, y + 2, 4, 1, '#7a8a5a'); }      // each column again in the water, the flutes down it, and the green line where the water stands
        R(x + 16, y - 12, 14, 1, '#a8a290'); R(x + 20, y - 14, 1, 2, '#a8a290'); R(x + 25, y - 14, 1, 2, '#a8a290'); R(x + 9, y - 6, 4, 1, '#e8e2d2');
        R(x + 2, y + 10, 26, 1, '#587a78'); R(x + 5, y + 12, 20, 1, '#48686a'); R(x + 13, y + 7, 5, 2, '#b5aa94'); R(x + 13, y + 7, 5, 1, '#d8d2c0'); R(x + 32, y + 4, 6, 3, '#c9c2ae'); R(x + 32, y + 4, 6, 1, '#e8e2d2'); R(x + 33, y + 7, 5, 1, '#587a78');      // its steps, under water, and what has fallen
        for (const [rx0, ry0] of [[-4, 3], [-2, 5], [30, 8], [36, 9], [34, 1]]) { R(x + rx0, y + ry0 - 4, 1, 5, '#8a9a4a'); R(x + rx0 + 1, y + ry0 - 3, 1, 4, '#6a7a3a'); R(x + rx0, y + ry0 - 5, 1, 1, '#5a4326'); }                                              // reeds
        R(x + 6, y + 11, 3, 1, '#5f8f4a'); R(x + 21, y + 9, 3, 1, '#5f8f4a'); R(x + 22, y + 9, 1, 1, '#f4d0d8'); R(x + 34, y - 4, 1, 4, '#f4f4f0'); R(x + 35, y - 5, 2, 1, '#f4f4f0'); R(x + 34, y, 1, 3, '#3a3a3a');                                                // lilies, and a heron fishing off the fallen stone
      } },
    'The causeway': {
      u: (x, y) => { lmSoft(x + 16, y + 9, 24, 4, '#2e4842', 41); for (let q = 0; q < 9; q++) R(x + q * 4, y + 8 + Math.round(Math.sin(q * 0.9) * 2), 3, 1, 'rgba(0,0,0,.25)'); },
      o: (x, y) => {
        for (let q = 0; q < 9; q += 2) { const px = x + q * 4, py = y + 4 + Math.round(Math.sin(q * 0.9) * 2); R(px + 1, py - 5, 1, 5, '#4a4038'); R(px + 1, py - 6, 1, 1, '#7a6a52'); } for (let q = 0; q < 34; q += 2) R(x + 1 + q, y - 2 + Math.round(Math.sin(q * 0.22) * 2) + (q % 8 < 4 ? 1 : 0), 2, 1, '#8a7a5a');      // posts, and the rope from one to the next
        for (let q = 0; q < 9; q++) { const px = x + q * 4, py = y + 4 + Math.round(Math.sin(q * 0.9) * 2); R(px + 1, py + 1, 1, 1, '#7a6a4a'); R(px, py + 2, 3, 1, '#7a6a4a'); }
        R(x + 6, y + 12, 10, 2, '#3a322a'); R(x + 6, y + 12, 10, 1, '#5a4a3a'); R(x + 5, y + 12, 1, 1, '#3a322a'); R(x + 16, y + 11, 1, 2, '#3a322a'); R(x + 9, y + 10, 1, 2, '#8a7a5a');                                                                                // a punt tied under it
        for (const [rx0, ry0] of [[-6, 6], [-4, 9], [38, 8], [40, 5], [22, 13]]) { R(x + rx0, y + ry0 - 4, 1, 5, '#8a9a4a'); R(x + rx0 + 1, y + ry0 - 3, 1, 4, '#6a7a3a'); R(x + rx0, y + ry0 - 5, 1, 1, '#5a4326'); }
        R(x + 33, y - 8, 3, 1, '#4a4038'); R(x - 4, y - 5, 3, 2, '#7a2a20');
      } },
    'The bog oak': {
      u: (x, y) => { lmSoft(x + 14, y + 9, 20, 4, '#2e4842', 42); lmDab(x - 2, y + 7, 32, 5, 9, ['#5a7a3a', '#4a6a34', '#7a8a4a'], 43); },      // black water standing round its foot, and the green on it
      o: (x, y) => {
        for (const [rx0, rl, d] of [[9, 6, -1], [18, 7, 1], [12, 4, -1]]) for (let q = 0; q < rl; q++) R(x + rx0 + d * q, y + 9 + Math.round(q * 0.3), 1, 1, '#3a322a');                                                      // its roots, going out into the wet
        R(x + 14, y - 14, 1, 22, '#241e18'); R(x + 13, y - 2, 1, 4, '#57493c'); R(x + 15, y + 2, 1, 4, '#57493c');
        for (const [mx, my, ml] of [[6, -15, 4], [22, -18, 5], [8, -7, 3], [21, -11, 4], [10, -20, 3], [19, -22, 3]]) { R(x + mx, y + my, 1, ml, '#7a8a6a'); R(x + mx + 1, y + my, 1, ml - 1, '#5f6f52'); }            // grey moss hanging from every bough
        R(x + 4, y - 17, 1, 3, '#7a2a20'); R(x + 24, y - 20, 1, 3, '#d8d2c0'); R(x + 17, y - 12, 1, 3, '#c9a21e'); R(x + 11, y + 6, 2, 2, '#efe8d8'); R(x + 12, y + 7, 1, 1, '#2a1c14');                              // rags tied on it, and a skull set in the roots
      } },
    'The huts on stilts': {
      u: (x, y) => { lmSoft(x + 18, y + 9, 26, 5, '#2e4842', 44); for (const [hx, hy] of [[0, 0], [14, -3], [26, 1]]) for (let q = 0; q < 3; q++) R(x + hx + 1 + (q % 2), y + hy + 11 + q, 7, 1, 'rgba(138,122,90,.22)'); },      // the water under them, and the huts again in it
      o: (x, y) => {
        for (const [hx, hy] of [[0, 0], [14, -3], [26, 1]]) { for (let q = 0; q < 11; q += 2) R(x + hx - 1 + q, y + hy - 6 + (q % 4 ? 0 : 1), 1, 2, '#544628'); R(x + hx + 6, y + hy - 3, 3, 6, 'rgba(40,30,10,.16)'); R(x + hx, y + hy - 3, 1, 6, '#a39270'); R(x + hx + 4, y + hy + 4, 1, 7, '#3a322a'); R(x + hx - 1, y + hy + 4, 11, 1, '#8a7a5a'); }
        for (let q = 0; q < 6; q++) R(x + 10, y + 4 + q, 3, 1, q % 2 ? '#6b5a44' : '#8a7a5a'); R(x + 9, y + 4, 1, 7, '#4a4038'); R(x + 13, y + 4, 1, 7, '#4a4038');                                                // a ladder down to the water
        R(x + 9, y, 6, 1, '#8a7a5a'); R(x + 23, y + 1, 4, 1, '#8a7a5a'); for (let q = 0; q < 4; q++) R(x + 10 + q * 4 - (q > 1 ? 2 : 0), y - 1 + (q % 2), 1, 3, q % 2 ? '#c1c7cc' : '#e8e2d2');                    // a rail along the walk, and fish hung from it
        R(x + 38, y + 5, 4, 5, '#8a7a52'); R(x + 38, y + 5, 4, 1, '#a89a70'); R(x + 39, y + 7, 2, 1, '#544628'); R(x + 4, y + 10, 8, 1, '#8a7a5a'); R(x + 7, y + 7, 1, 3, '#a39270');                              // a trap of withies, and the pole of the canoe
        for (const [rx0, ry0] of [[-6, 8], [-3, 11], [40, 12], [44, 9]]) { R(x + rx0, y + ry0 - 4, 1, 5, '#8a9a4a'); R(x + rx0 + 1, y + ry0 - 3, 1, 4, '#6a7a3a'); }
      } },
    'The wolf stone': {
      u: (x, y) => { lmSdw(x + 14, y + 2, 5, 8); for (let an = 0; an < Math.PI * 2; an += 0.6) { const sx = Math.round(x + 9 + Math.cos(an) * 14), sy = Math.round(y + 8 + Math.sin(an) * 4); R(sx, sy, 2, 2, '#8a8a86'); R(sx, sy, 2, 1, '#a8a8a2'); } },      // small stones set round it by somebody
      o: (x, y) => {
        R(x + 5, y - 9, 8, 1, '#a8a8a2'); R(x + 11, y - 6, 2, 16, 'rgba(0,0,0,.14)'); R(x + 12, y - 13, 1, 4, '#66665f'); R(x + 5, y - 12, 1, 3, '#a8a8a2');
        R(x + 6, y - 1, 7, 1, '#66665f'); R(x + 7, y + 2, 1, 1, '#efe8d8'); R(x + 9, y + 2, 1, 1, '#efe8d8'); R(x + 11, y + 2, 1, 1, '#efe8d8'); R(x + 8, y - 2, 3, 1, '#4a4a46'); R(x + 9, y - 1, 1, 2, '#2a241e');      // the muzzle, and the teeth
        for (const [cx, cy] of [[4, 4], [5, 6], [4, 8]]) R(x + cx, y + cy, 3, 1, '#66665f'); for (let q = 0; q < 3; q++) R(x + 12 + (q % 2), y + 4 + q * 2, 2, 1, '#a8a8a2');                                                // old marks cut down its flanks
        lmDab(x + 3, y - 10, 11, 18, 6, ['#6f8a5a', '#8aa06a', '#5a7248'], 45); R(x + 1, y + 9, 4, 1, '#efe8d8'); R(x + 16, y + 9, 3, 1, '#efe8d8'); R(x + 18, y + 8, 1, 1, '#efe8d8'); R(x + 20, y + 6, 2, 3, '#7a2a20');      // moss, bones, and a rag on a stick
      } },
    "The shepherds' fold": {
      u: (x, y) => { R(x + 1, y - 2, 24, 10, 'rgba(150,126,82,.4)'); lmDab(x + 2, y - 1, 22, 8, 8, ['#8a6a3a', '#c9a763', '#6b4f2c'], 46); },      // the ground inside, trodden bare
      o: (x, y) => {
        for (let q = 0; q < 26; q += 2) { R(x + q, y + 7 + (q % 4 ? 1 : 0), 2, 1, '#d6ccb8'); R(x + q, y + 10, 2, 1, '#7d7566'); R(x + q, y - 5 + (q % 4 ? 0 : 1), 2, 1, '#d6ccb8'); } for (let q = -4; q < 10; q += 2) R(x - 2, y + q, 1, 2, '#d6ccb8');      // the wall, stone on stone, with the light along its top
        R(x + 25, y + 1, 1, 5, '#6b4f2c'); R(x + 25, y + 2, 2, 1, '#8a6a3a'); R(x + 25, y + 4, 2, 1, '#8a6a3a');                                                                                                                                          // a hurdle across the gap
        R(x + 2, y - 3, 6, 2, '#d9c070'); R(x + 2, y - 3, 6, 1, '#e6d088'); R(x + 3, y - 1, 1, 2, '#6b4f2c'); R(x + 6, y - 1, 1, 2, '#6b4f2c'); R(x + 18, y + 6, 5, 2, '#6b4f2c'); R(x + 19, y + 6, 3, 1, '#6fa8c8');                                      // a rack of hay, and the trough
        for (let q = 27; q < 35; q += 2) R(x + q, y - 8, 1, 2, '#7a5e30'); R(x + 27, y - 6, 8, 1, '#6b5028'); R(x + 32, y - 5, 2, 7, 'rgba(60,40,20,.14)'); R(x + 28, y - 6, 1, 8, '#e0d2ac');
        R(x + 36, y + 6, 4, 2, '#3a322c'); R(x + 39, y + 5, 2, 2, '#3a322c'); R(x + 40, y + 4, 1, 1, '#3a322c'); R(x + 36, y + 8, 1, 1, '#2a1c14'); R(x + 38, y + 8, 1, 1, '#2a1c14'); R(x + 35, y - 4, 1, 12, '#8a6a3a'); R(x + 35, y - 5, 2, 1, '#8a6a3a');      // the dog, and a crook leaned by the door
      } },
    'The gallows': {
      u: (x, y) => { lmSoft(x + 9, y + 9, 16, 3, 'rgba(110,90,60,.4)', 47); lmSdw(x + 6, y + 6, 14, 5); },
      o: (x, y) => {
        R(x - 2, y + 5, 16, 5, '#6b4f2c'); R(x - 2, y + 5, 16, 1, '#94703f'); for (let q = 0; q < 16; q += 4) R(x - 2 + q, y + 6, 1, 4, '#4a3620'); R(x - 2, y + 9, 16, 1, '#3a2a1c'); R(x + 14, y + 7, 3, 3, '#5a4326'); R(x + 17, y + 9, 3, 1, '#5a4326');      // the scaffold under it, and the steps up
        R(x + 4, y - 18, 1, 23, '#7a5a34'); R(x + 4, y - 19, 15, 1, '#7a5a34'); R(x + 18, y - 18, 1, 3, '#5a4326'); for (let q = 0; q < 4; q++) R(x + 3 - q, y + 1 + q, 1, 2, '#5a4326');                                                                    // a second brace, on the other side
        R(x + 15, y - 9, 3, 1, '#8a7a5a'); R(x + 15, y - 7, 3, 1, '#8a7a5a'); R(x + 14, y - 9, 1, 4, '#8a7a5a'); R(x + 18, y - 9, 1, 4, '#8a7a5a');                                                                                                          // the cage
        R(x + 22, y - 4, 1, 14, '#5a4326'); R(x + 20, y - 4, 6, 4, '#d8c9a0'); R(x + 21, y - 3, 4, 1, '#8a6a3a'); R(x + 21, y - 1, 3, 1, '#8a6a3a');                                                                                                        // a board, with what he did written on it
        R(x + 8, y + 10, 2, 1, '#efe8d8'); R(x + 11, y + 11, 3, 1, '#efe8d8'); R(x - 4, y + 10, 2, 2, '#efe8d8'); R(x - 4, y + 11, 1, 1, '#2a1c14');
      } },
    'The broken aqueduct': {
      u: (x, y) => { lmSdw(x + 28, y - 8, 5, 10); lmDab(x + 26, y + 5, 22, 6, 12, ['#c9c2ae', '#b5ad9c', '#e4dfcd'], 48); },
      o: (x, y) => {
        for (const [px, top] of [[0, -16], [12, -16], [24, -16], [36, -4]]) { for (let q = top + 4; q < 9; q += 4) R(x + px, y + q, 4, 1, '#b5ad9c'); R(x + px - 1, y + 9, 6, 1, '#b5ad9c'); if (top < -10) R(x + px - 1, y - 13, 6, 1, '#e4dfcd'); }      // the courses of each pier, its footing and its impost
        for (const ax of [4, 16]) { R(x + ax, y - 16, 8, 1, '#8f8676'); R(x + ax + 1, y - 15, 6, 1, '#b5ad9c'); R(x + ax + 2, y - 14, 4, 1, '#9a9280'); }                                                                                              // the arches, in shade underneath
        R(x + 1, y - 19, 27, 1, '#6fa8c8'); R(x + 3, y - 19, 3, 1, '#9ccbe8'); R(x + 14, y - 19, 4, 1, '#9ccbe8'); R(x, y - 21, 28, 1, '#f8f4ea'); R(x + 28, y - 20, 2, 1, '#6fa8c8');                                                                   // water still running in what is left of the channel
        for (const [bx, by, bw] of [[31, 3, 5], [35, 6, 6], [42, 5, 4], [45, 8, 5], [30, 8, 3]]) { R(x + bx, y + by, bw, 3, '#c9c2ae'); R(x + bx, y + by, bw, 1, '#e4dfcd'); R(x + bx + bw - 1, y + by + 1, 1, 2, '#a39a84'); }                           // where the rest of it lies
        R(x + 25, y - 12, 2, 9, '#5f8f3a'); R(x + 26, y - 16, 1, 4, '#5f8f3a'); R(x + 37, y - 6, 2, 3, '#7aa84a'); R(x + 1, y - 2, 1, 6, '#5f8f3a'); R(x + 28, y + 9, 6, 2, '#5a9cc6'); R(x + 29, y + 9, 3, 1, '#b4d6ea');                              // ivy, and the pool the leak has made
      } },
    'The salt pans': {
      u: (x, y) => { lmSoft(x + 22, y + 3, 30, 11, 'rgba(184,162,106,.5)', 49); R(x - 12, y - 1, 12, 2, '#6fa8c8'); R(x - 12, y - 1, 12, 1, '#b4d6ea'); R(x - 12, y - 2, 12, 1, '#a08a52'); R(x - 12, y + 1, 12, 1, '#a08a52'); },      // the channel that lets the sea in
      o: (x, y) => {
        for (let q = 1; q < 4; q++) { R(x + q * 11 - 1, y - 2, 1, 3, '#6b4f2c'); R(x + q * 11 - 1, y + 6, 1, 3, '#6b4f2c'); } R(x, y + 2, 43, 1, '#a08a52'); R(x - 1, y - 6, 44, 1, '#cdb87e'); R(x - 1, y + 10, 44, 1, '#94804a');      // the banks between the pans, and the sluices in them
        lmDab(x, y - 5, 43, 15, 14, ['#ffffff', '#f8f8f4', '#dfeaea'], 50); for (let q = 0; q < 4; q++) R(x + q * 11 + 1, y - 4 + (q % 2) * 8, 3, 1, 'rgba(255,255,255,.5)');                                                              // salt coming out white along the edges
        R(x - 8, y - 8, 7, 7, '#6b4f2c'); R(x - 7, y - 7, 5, 5, '#3a6a80'); R(x - 5, y - 8, 1, 7, '#8a6a3a'); R(x - 8, y - 5, 7, 1, '#8a6a3a'); R(x - 9, y - 1, 9, 1, '#5e4426');                                                           // the wheel that lifts the water
        R(x + 46, y - 4, 2, 3, '#e0d2ac'); R(x + 45, y - 11, 11, 1, '#d0c070'); R(x + 53, y - 8, 2, 7, 'rgba(60,40,20,.14)'); for (const [sx, sy] of [[57, -3], [60, -2], [58, -6]]) { R(x + sx, y + sy, 4, 3, '#d8c9a0'); R(x + sx, y + sy, 4, 1, '#efe2bc'); }      // sacks of it by the store
        R(x + 30, y + 11, 1, 5, '#8a6a3a'); R(x + 28, y + 11, 5, 1, '#8a6a3a'); R(x + 12, y + 11, 6, 1, '#8a6a3a'); R(x + 12, y + 12, 1, 2, '#6b4f2c');                                                                                      // a rake, and a board to scrape with
      } },
    'The sacred grove': {
      u: (x, y) => { lmSoft(x + 19, y + 6, 14, 5, 'rgba(196,188,166,.4)', 51); for (const [sx, sy] of [[17, 11], [20, 13], [17, 15], [21, 17]]) { R(x + sx, y + sy, 4, 2, '#b8b0a0'); R(x + sx, y + sy, 4, 1, '#d8d2c0'); } },      // the way in, stone by stone
      o: (x, y) => {
        R(x + 14, y + 4, 11, 1, '#8f8676'); R(x + 15, y + 5, 2, 3, '#a39a84'); R(x + 21, y + 5, 2, 3, '#a39a84'); R(x + 13, y + 9, 13, 1, '#8f8676'); for (let q = 0; q < 6; q++) R(x + 14 + q * 2, y + 2 + (q % 2), 1, 1, q % 2 ? '#c23b2e' : '#5f8f3a');      // the altar carved, and a garland laid along it
        R(x + 19, y - 8, 3, 9, '#d8d2c0'); R(x + 19, y - 8, 1, 9, '#f0e8d6'); R(x + 21, y - 8, 1, 9, '#a39a84'); R(x + 18, y - 11, 5, 3, '#d8d2c0'); R(x + 18, y - 11, 5, 1, '#f0e8d6'); R(x + 19, y - 10, 1, 1, '#6d6858'); R(x + 21, y - 10, 1, 1, '#6d6858'); R(x + 18, y - 12, 5, 1, '#5f8f3a');      // the god of the place, on his post, crowned with leaves
        for (const [bx, by] of [[11, 8], [27, 8]]) { R(x + bx, y + by, 3, 2, '#b8703c'); R(x + bx, y + by, 3, 1, '#d08a54'); R(x + bx + 1, y + by - 1, 1, 1, '#f1ead8'); }                                                                                    // bowls of milk
        lmDab(x + 2, y + 4, 36, 8, 8, ['#f4f4f0', '#c9a21e', '#b9a0e0'], 52); R(x + 6, y + 9, 2, 1, '#f4f4f0'); R(x + 7, y + 8, 1, 1, '#f4f4f0'); R(x + 31, y + 10, 2, 1, '#f4f4f0'); R(x + 5, y + 10, 1, 1, '#b5522e'); R(x + 33, y + 10, 1, 1, '#b5522e');      // flowers, and two white doves
      } },
    'The white temple': {
      u: (x, y) => { lmSoft(x + 18, y + 10, 30, 4, 'rgba(240,236,224,.5)', 53); lmSdw(x + 34, y - 10, 6, 12); },
      o: (x, y) => {
        R(x + 30, y - 12, 2, 16, 'rgba(60,54,40,.14)'); R(x + 8, y - 10, 20, 2, 'rgba(60,54,40,.22)'); R(x + 16, y - 6, 5, 1, '#b98a34'); R(x + 18, y - 5, 1, 9, '#5a3a22'); R(x + 17, y - 2, 1, 1, '#e8b545'); R(x + 19, y - 2, 1, 1, '#e8b545');      // the porch in shade behind its columns, and the bronze doors
        for (let q = 0; q < 6; q++) { const cxq = x + 4 + q * 5 + (q > 2 ? 1 : 0); R(cxq - 1, y + 3, 5, 1, '#e0dccf'); R(cxq + 1, y - 11, 1, 14, '#e0dccf'); }                                                                                    // each column on its base, with its flutes
        R(x + 12, y - 21, 12, 2, '#e8e4d8'); R(x + 16, y - 22, 4, 1, '#e8e4d8'); R(x + 14, y - 20, 2, 1, '#c4bfae'); R(x + 18, y - 21, 1, 2, '#c4bfae'); R(x + 21, y - 20, 2, 1, '#c4bfae'); R(x + 2, y - 14, 32, 1, '#c4bfae');                      // figures in the gable
        for (const sx of [-4, 37]) { R(x + sx, y + 4, 4, 6, '#e0dccf'); R(x + sx, y + 4, 4, 1, '#ffffff'); R(x + sx + 1, y - 3, 2, 7, '#f0ece0'); R(x + sx + 1, y - 5, 2, 2, '#f8f6ee'); R(x + sx + 3, y - 2, 1, 4, '#c4bfae'); }                    // a figure on a plinth to either side of the steps
        for (let q = 0; q < 3; q++) R(x + 14 + q, y + 4 + q * 2, 8 - q * 2, 1, '#c4bfae'); R(x + 14, y + 13, 8, 1, 'rgba(60,54,40,.25)'); R(x + 16, y + 9, 4, 1, '#7a2a20');
      } },
    'The barrow of kings': {
      u: (x, y) => { lmSoft(x + 24, y + 9, 34, 5, 'rgba(40,60,20,.22)', 54); lmSoft(x + 24, y + 13, 12, 3, 'rgba(196,188,166,.45)', 55); },      // the ditch round it, and the forecourt worn pale
      o: (x, y) => {
        for (let dy = -15; dy <= -2; dy++) { const w = Math.round(25 * Math.sqrt(1 - (dy * dy) / 232)); if (dy % 3 === 0) R(x + 24 - w + 3, y + 9 + dy, Math.max(1, w * 2 - 8), 1, 'rgba(40,70,20,.14)'); } lmDab(x + 4, y - 4, 40, 11, 14, ['#86ac58', '#4f7434', '#f4f4f0', '#f2e6a0', '#98bc68'], 56);      // the mound in its bands, with daisies on it
        R(x + 23, y - 12, 3, 7, '#a8a290'); R(x + 23, y - 12, 1, 7, '#cfc9b6'); R(x + 25, y - 11, 1, 6, '#6d6858');                                                                                                                                         // one stone set up on the crown of it
        R(x + 19, y, 1, 1, '#6d6858'); R(x + 19, y + 3, 1, 1, '#6d6858'); R(x + 29, y + 1, 1, 1, '#5f5a4c'); R(x + 29, y + 4, 1, 1, '#5f5a4c'); R(x + 20, y - 5, 2, 1, '#6d6858'); R(x + 24, y - 5, 2, 1, '#6d6858'); R(x + 28, y - 5, 2, 1, '#6d6858'); R(x + 16, y - 3, 17, 1, '#8f8876');      // what is cut on the door-stones and the lintel
        R(x + 22, y - 2, 5, 11, 'rgba(0,0,0,.35)'); R(x + 9, y - 5, 1, 14, '#8f8876'); R(x + 40, y - 3, 1, 12, '#6d6858');
        for (const [sx, sy] of [[20, 11], [25, 12], [22, 14], [27, 15]]) { R(x + sx, y + sy, 4, 2, '#b8b2a0'); R(x + sx, y + sy, 4, 1, '#d8d2c0'); } R(x + 17, y + 9, 2, 2, '#b8703c'); R(x + 30, y + 9, 2, 2, '#b8703c');                                    // flags laid up to the door, and jars left there
      } },
    'The fort': {
      u: (x, y) => { lmSoft(x + 24, y - 1, 34, 16, 'rgba(70,60,30,.22)', 57); lmSoft(x + 24, y - 1, 30, 14, 'rgba(110,96,60,.2)', 58); },      // the ditch dug round it
      o: (x, y) => {
        for (const [tx2, ty2] of [[-4, -22], [44, -22], [-4, 2], [44, 2]]) { R(x + tx2, y + ty2, 8, 9, '#7a5a34'); R(x + tx2, y + ty2, 8, 1, '#94703f'); R(x + tx2 + 6, y + ty2 + 1, 2, 8, '#5a4326'); for (let q = 0; q < 8; q += 2) R(x + tx2 + q, y + ty2 - 2, 1, 2, '#6b4f2c'); R(x + tx2 + 2, y + ty2 + 3, 3, 3, '#2a1c14'); }      // a tower at every corner
        for (let r0 = 0; r0 < 2; r0++) for (let q = 0; q < 4; q++) { const tx3 = x + 5 + q * 10, ty3 = y - 8 + r0 * 8; R(tx3 + 4, ty3 + 1, 3, 3, 'rgba(40,30,10,.18)'); R(tx3, ty3 + 4, 7, 1, 'rgba(0,0,0,.18)'); }                                                                                          // each tent with a dark side
        R(x + 22, y - 2, 4, 2, '#3a342c'); R(x + 23, y - 3, 2, 1, '#e2702a'); R(x + 20, y - 1, 1, 1, '#8f8a84'); R(x + 27, y - 1, 1, 1, '#8f8a84'); for (const sx of [8, 12, 36, 40]) { R(x + sx, y + 3, 2, 3, sx % 8 ? '#a8261c' : '#c9a21e'); R(x + sx, y + 3, 2, 1, '#e8e2d2'); }                          // the cook-fire, and shields stacked by the gate
        R(x + 17, y - 5, 15, 1, '#94703f'); R(x + 21, y + 1, 7, 9, '#5a4326'); R(x + 24, y + 1, 1, 9, '#3a2a1c'); for (let q = 2; q < 9; q += 3) R(x + 21, y + q, 7, 1, '#3a2a1c');                                                                                                                           // the gate itself, shut
        for (const [hx, c] of [[52, '#8a6a4a'], [59, '#6f5a48'], [55, '#b8a890']]) { const hy = hx === 55 ? 9 : 5; R(x + hx, y + hy + 4, 6, 1, 'rgba(0,0,0,.2)'); R(x + hx, y + hy, 5, 3, c); R(x + hx + 4, y + hy - 2, 2, 3, c); R(x + hx + 1, y + hy + 3, 1, 1, '#3a2a1c'); R(x + hx + 3, y + hy + 3, 1, 1, '#3a2a1c'); } R(x + 51, y + 3, 14, 1, '#6b4f2c');      // horses on a picket line outside
      } },
    'The old arena': {
      u: (x, y) => { lmSoft(x + 22, y + 2, 30, 13, 'rgba(120,110,70,.2)', 59); },
      o: (x, y) => {
        const cx = x + 22, cy = y;
        for (const [rr, ry, c] of [[19, 8.6, '#b5ad9c'], [17, 7.6, '#c9c2ae'], [16, 7, '#a39a84']]) for (let an = Math.PI * 1.08; an < Math.PI * 1.92; an += 0.07) { if (wildHash(Math.floor(an * 5), 3, 1342) < 0.28) continue; R(Math.round(cx + Math.cos(an) * rr), Math.round(cy + Math.sin(an) * ry), 2, 1, c); }      // the tiers of seats, where they still stand
        for (let an = 0.25; an < Math.PI - 0.2; an += 0.35) { if (wildHash(Math.floor(an * 5), 3, 1342) < 0.28) continue; R(Math.round(cx + Math.cos(an) * 22), Math.round(cy + Math.sin(an) * 10) - 1, 1, 2, '#3a342c'); }                                                                                     // the arches of the outer wall, each a dark mouth
        R(cx - 3, cy + 9, 7, 4, '#c9c2ae'); R(cx - 3, cy + 9, 7, 1, '#f0e8d6'); R(cx - 1, cy + 10, 3, 3, '#2a241e'); R(cx - 4, cy + 8, 9, 1, '#d8d2c0');                                                                                                                                                       // the gate the men came in by
        lmDab(cx - 13, cy - 5, 26, 10, 10, ['#c8bc8c', '#98905c', '#6f9a48'], 60); R(cx - 6, cy - 1, 1, 4, '#8a6a3a'); R(cx - 7, cy - 1, 3, 1, '#8a6a3a'); R(cx + 3, cy + 2, 5, 2, '#f1ead8'); R(cx + 7, cy + 1, 2, 2, '#f1ead8'); R(cx + 3, cy + 4, 1, 1, '#2a1c14'); R(cx + 6, cy + 4, 1, 1, '#2a1c14');      // a post still in the sand, and a sheep grazing where men died
        for (const [bx, by] of [[-8, 11], [44, 6], [47, 9], [-6, -6]]) { R(x + bx, y + by, 4, 3, '#c9c2ae'); R(x + bx, y + by, 4, 1, '#e8e2d2'); } R(x + 12, y - 12, 3, 1, '#6f9a48'); R(x + 36, y - 9, 2, 3, '#5f8f3a');
      } },
    'The ferry': {
      u: (x, y) => { lmSoft(x + 8, y + 10, 16, 3, 'rgba(150,126,82,.4)', 61); lmSdw(x + 14, y, 4, 6); for (let q = 0; q < 9; q++) R(x + 23 + q * 2, y + 11, 2, 1, 'rgba(0,20,40,.25)'); },
      o: (x, y) => {
        for (let q = 0; q < 16; q += 3) R(x - 1 + q, y - 7, 1, 5, '#6f4424'); R(x - 1, y - 3, 16, 1, '#5e3a1e'); R(x + 10, y - 2, 4, 12, 'rgba(60,40,20,.12)'); R(x, y - 2, 1, 12, '#efe2bc'); R(x + 9, y - 1, 5, 1, '#8a6a3a'); R(x + 4, y + 3, 6, 1, '#8a6a3a'); R(x + 11, y - 12, 3, 5, '#b5aa94'); R(x + 11, y - 12, 3, 1, '#8f8676');      // the roof, the shade, a chimney
        R(x + 22, y + 5, 18, 1, '#c9a763'); for (const px of [22, 30, 39]) { R(x + px, y + 2, 1, 4, '#5a4326'); R(x + px, y + 1, 1, 1, '#8a6a3a'); } R(x + 22, y + 3, 18, 1, '#8a7a5a'); R(x + 39, y - 2, 1, 4, '#5a4326'); R(x + 38, y - 4, 3, 2, '#f5c04a');      // a rail along the jetty, and a lamp at the end of it
        for (const [bx, by] of [[24, 3], [27, 4]]) { R(x + bx, y + by, 3, 3, '#7a5a34'); R(x + bx, y + by, 3, 1, '#94703f'); R(x + bx, y + by + 1, 3, 1, '#3a2a1c'); } R(x - 6, y + 6, 6, 1, '#a8834a'); R(x - 6, y + 7, 1, 3, '#6b4f2c'); R(x - 1, y + 7, 1, 3, '#6b4f2c');      // casks waiting to cross, and a bench for those who are
        for (const [rx0, ry0] of [[16, 12], [20, 13], [14, 14]]) { R(x + rx0, y + ry0 - 4, 1, 5, '#8a9a4a'); R(x + rx0 + 1, y + ry0 - 3, 1, 4, '#6a7a3a'); R(x + rx0, y + ry0 - 5, 1, 1, '#5a4326'); } R(x + 17, y - 9, 3, 1, '#5a4326');
      } },
  };

  // ---- the ones that were still slight for what they are, made greater: more of the same thing behind and about
  // the first of it, so that a crag is a crag and a ring of stones a ring you could lose a cart in ----
  const lmRock = (cx, top, base, w0, grow, lit, dark, mid, sd) => { for (let i = 0; i < base - top; i++) { const w = Math.max(1, Math.round(w0 + i * grow + (lmV(i, sd) - 0.5) * 3)), sh = Math.round((lmV(i >> 2, sd + 1) - 0.5) * 2); R(cx - w + sh, top + i, w, 1, i % 6 === 5 ? mid : lit); R(cx + sh, top + i, w + 1, 1, i % 5 === 3 ? tint(dark, 0.86) : dark); if (lmV(i, sd + 2) > 0.7) R(cx - w + sh + 1, top + i, 2, 1, tint(lit, 1.12)); } };
  const GREATER = {
    'The eagle rock': {
      u: (x, y) => { R(x - 14, y + 10, 46, 2, 'rgba(0,0,0,.2)'); lmRock(x + 16, y - 16, y + 11, 3, 0.42, '#a2aab4', '#646c78', '#8a929c', 70); lmRock(x - 5, y - 6, y + 11, 2, 0.5, '#a2aab4', '#646c78', '#8a929c', 73); lmRock(x + 8, y - 12, y + 11, 6, 0.4, '#98a0aa', '#5a626e', '#8a929c', 76); },      // the whole outcrop the pinnacle stands on
      o: (x, y) => { for (const [gx, gy, gw] of [[-8, 0, 4], [18, -9, 5], [10, 5, 4], [22, 3, 3]]) { R(x + gx, y + gy, gw, 1, '#7c9462'); R(x + gx + 1, y + gy - 1, gw - 2, 1, '#96ae78'); } R(x + 19, y - 15, 4, 1, '#f4f6fa'); R(x - 6, y - 5, 3, 1, '#f4f6fa'); R(x - 10, y + 9, 6, 2, '#7d8692'); R(x - 10, y + 9, 6, 1, '#a2aab4'); R(x + 26, y + 8, 5, 3, '#7d8692'); R(x + 26, y + 8, 5, 1, '#a2aab4'); },      // turf on its ledges, a little snow, and what has fallen from it
    },
    'The ring of stones': {
      u: (x, y) => { const cx = x + 16, cy = y + 3; lmSoft(cx, cy + 1, 26, 12, 'rgba(90,120,60,.18)', 79);
        for (let q = 0; q < 14; q++) { const an = q / 14 * Math.PI * 2 + 0.1; if (Math.sin(an) >= 0.15) continue; const sx = Math.round(cx + Math.cos(an) * 24), sy = Math.round(cy + Math.sin(an) * 11), hh = 10 + (q * 5) % 4; R(sx - 2, sy + 1, 6, 1, 'rgba(0,0,0,.25)'); R(sx - 2, sy - hh, 4, hh + 1, '#a8a290'); R(sx - 2, sy - hh, 1, hh + 1, '#c9c3ae'); R(sx + 1, sy - hh + 1, 1, hh, '#8a8474'); if (q % 3 === 0) R(sx - 2, sy - hh, 3, 1, '#8aa04a'); }
        const a1 = 10 / 14 * Math.PI * 2 + 0.1, a2 = 11 / 14 * Math.PI * 2 + 0.1; R(Math.round(cx + Math.cos(a1) * 24) - 3, Math.round(cy + Math.sin(a1) * 11) - 15, Math.round(Math.cos(a2) * 24 - Math.cos(a1) * 24) + 6, 3, '#b8b2a0'); R(Math.round(cx + Math.cos(a1) * 24) - 3, Math.round(cy + Math.sin(a1) * 11) - 15, Math.round(Math.cos(a2) * 24 - Math.cos(a1) * 24) + 6, 1, '#d8d2c0'); },      // an outer ring of greater stones, the far half of it, and one lintel still up
      o: (x, y) => { const cx = x + 16, cy = y + 3; for (let q = 0; q < 14; q++) { const an = q / 14 * Math.PI * 2 + 0.1; if (Math.sin(an) < 0.15) continue; if (q === 2) continue; const sx = Math.round(cx + Math.cos(an) * 24), sy = Math.round(cy + Math.sin(an) * 11), hh = 9 + (q * 5) % 4; for (let i = 0; i < 5; i++) R(sx + 2 + i, sy + 1 + Math.round(i * 0.4), 3, 1, 'rgba(0,0,0,.10)'); R(sx - 2, sy - hh, 4, hh + 1, '#b0aa98'); R(sx - 2, sy - hh, 1, hh + 1, '#d0cab6'); R(sx + 1, sy - hh + 1, 1, hh, '#8a8474'); R(sx - 1, sy - hh + 3, 1, 2, '#8f8876'); if (q % 2) R(sx - 2, sy - hh, 2, 1, '#8aa04a'); } },      // and the near half, in front of everything
    },
    'The barrow of kings': {
      u: (x, y) => { R(x - 12, y + 9, 72, 3, 'rgba(0,0,0,.18)'); for (let dy = -24; dy <= 0; dy++) { const w = Math.round(34 * Math.sqrt(1 - (dy * dy) / 590)); R(x + 24 - w, y + 9 + dy, w * 2, 1, dy % 4 === 0 ? '#648a40' : '#6c9246'); if (dy < -6) R(x + 24 - w + 2, y + 9 + dy, Math.round(w * 0.8), 1, '#86ac58'); R(x + 24 + w - Math.max(1, Math.round(w * 0.3)), y + 9 + dy, Math.max(1, Math.round(w * 0.3)), 1, '#4f7434'); } lmDab(x - 4, y - 12, 56, 18, 16, ['#98bc68', '#4f7434', '#f4f4f0', '#f2e6a0'], 82); },      // the whole hill of it, of which the chamber is only the door
      o: (x, y) => { for (let q = -2; q < 15; q++) if (q < 0 || q > 12) { R(x + q * 4, y + 8, 3, 2, q % 2 ? '#a8a290' : '#b8b2a0'); R(x + q * 4, y + 8, 3, 1, '#cfc9b6'); } R(x + 22, y - 18, 5, 8, '#a8a290'); R(x + 22, y - 18, 1, 8, '#cfc9b6'); R(x + 26, y - 17, 1, 7, '#6d6858'); R(x + 23, y - 19, 3, 1, '#8aa04a'); },
    },
    'The wolf stone': {
      u: (x, y) => { R(x + 14, y - 3, 9, 13, '#8a8a86'); R(x + 14, y - 3, 9, 1, '#a8a8a2'); R(x + 21, y - 1, 2, 11, '#66665f'); R(x + 23, y + 2, 4, 8, '#7a7a76'); R(x + 23, y + 2, 4, 1, '#a8a8a2'); R(x + 26, y + 4, 1, 6, '#66665f'); R(x + 27, y + 6, 4, 2, '#7a7a76'); R(x + 30, y + 4, 1, 3, '#7a7a76'); R(x, y + 10, 32, 2, 'rgba(0,0,0,.2)'); },      // the body of the beast behind its head: back, haunch and tail
      o: (x, y) => { R(x - 1, y - 2, 4, 5, '#8a8a86'); R(x - 1, y - 2, 4, 1, '#a8a8a2'); R(x - 2, y, 1, 2, '#2a241e'); R(x - 1, y + 3, 4, 1, '#66665f'); R(x, y + 2, 1, 1, '#efe8d8'); R(x + 2, y + 2, 1, 1, '#efe8d8'); R(x + 8, y + 4, 1, 6, '#66665f'); R(x + 4, y + 9, 4, 1, '#a8a8a2'); R(x + 9, y + 9, 4, 1, '#a8a8a2'); for (let q = 0; q < 4; q++) R(x + 16 + q * 2, y - 2 + (q % 2), 1, 2, '#66665f'); },      // the muzzle thrust out, the forelegs, and hackles cut along the back
    },
    'The old arena': {
      u: (x, y) => { const cx = x + 22, cy = y; for (let an = Math.PI * 1.02; an < Math.PI * 1.98; an += 0.05) { if (wildHash(Math.floor(an * 3), 6, 1346) < 0.42) continue; const ex = Math.round(cx + Math.cos(an) * 24), ey = Math.round(cy + Math.sin(an) * 11), hh = 11 + Math.floor(wildHash(Math.floor(an * 7), 7, 1347) * 5); R(ex - 1, ey - hh, 3, hh + 1, '#cfc8b4'); R(ex - 1, ey - hh, 1, hh + 1, '#ece6d4'); R(ex - 1, ey - hh, 3, 1, '#f0e8d6'); if (Math.floor(an * 20) % 3 === 0) { R(ex, ey - hh + 2, 1, 3, '#3a342c'); R(ex, ey - hh + 7, 1, 3, '#3a342c'); } } R(x - 6, y + 11, 58, 2, 'rgba(0,0,0,.16)'); },      // the outer wall, two storeys of arches where it has not come down
      o: (x, y) => { const cx = x + 22, cy = y; for (const [bx, by, bw] of [[-10, 6, 5], [-13, 9, 4], [48, 2, 5], [51, 6, 4], [20, -16, 4]]) { R(x + bx, y + by, bw, 3, '#cfc8b4'); R(x + bx, y + by, bw, 1, '#ece6d4'); R(x + bx + bw - 1, y + by + 1, 1, 2, '#a39a84'); } R(cx - 9, cy - 3, 18, 1, 'rgba(120,100,60,.25)'); R(cx - 12, cy + 1, 24, 1, 'rgba(120,100,60,.2)'); R(x + 8, y - 13, 1, 5, '#5f8f3a'); R(x + 34, y - 15, 2, 4, '#5f8f3a'); },
    },
    'An old battlefield': {
      u: (x, y) => { for (let dy = -9; dy <= 0; dy++) { const w = Math.round(17 * Math.sqrt(1 - (dy * dy) / 86)); R(x + 20 - w, y - 4 + dy, w * 2, 1, dy % 3 === 0 ? '#6a9a44' : '#74a44c'); if (dy < -3) R(x + 20 - w + 2, y - 4 + dy, Math.round(w * 0.8), 1, '#8aba5c'); R(x + 20 + w - Math.max(1, Math.round(w * 0.3)), y - 4 + dy, Math.max(1, Math.round(w * 0.3)), 1, '#557f38'); } R(x + 3, y - 4, 36, 1, 'rgba(0,0,0,.2)'); },      // the mound they were all put under
      o: (x, y) => { for (let q = 0; q < 5; q++) R(x + 16 + q * 2 - (q > 2 ? 1 : 0), y - 15 + (q % 2), 3, 3, q % 2 ? '#a8a290' : '#b8b2a0'); R(x + 19, y - 22, 2, 8, '#a8a290'); R(x + 19, y - 22, 1, 8, '#cfc9b6'); R(x + 17, y - 20, 6, 1, '#a8a290'); lmDab(x + 6, y - 11, 28, 6, 8, ['#c23b2e', '#f4f4f0', '#8aba5c'], 85); R(x - 12, y + 6, 8, 3, '#6b4f2c'); R(x - 12, y + 6, 8, 1, '#8a6a3a'); R(x - 9, y + 4, 2, 2, '#b98a34'); R(x + 44, y - 2, 1, 10, '#6b4f2c'); R(x + 44, y - 3, 1, 2, '#c1c7cc'); },      // a cairn and a marker on it, a broken shield wall, one spear still upright
    },
    "The giant's table": {
      u: (x, y) => { R(x + 1, y - 17, 22, 5, '#8a8474'); R(x + 1, y - 17, 22, 1, '#b8b2a0'); R(x + 20, y - 16, 3, 4, '#6d6858'); R(x + 4, y - 12, 3, 6, '#857f70'); R(x + 17, y - 12, 3, 6, '#77716a'); R(x - 6, y + 10, 38, 2, 'rgba(0,0,0,.18)'); },      // a second chamber behind the first, its capstone still on
      o: (x, y) => { for (const [ux, uy, uh] of [[-5, 1, 9], [24, 2, 8], [-1, 5, 5], [21, 6, 4]]) { R(x + ux, y + uy, 4, uh, '#9a9484'); R(x + ux, y + uy, 1, uh, '#bdb8a8'); R(x + ux + 3, y + uy + 1, 1, uh - 1, '#6d6858'); R(x + ux, y + uy, 4, 1, '#cfc9b6'); } R(x + 8, y + 9, 7, 1, '#b8b2a0'); R(x + 8, y + 10, 7, 1, '#8a8474'); },      // the uprights of the passage that led in to it, and its threshold
    },
    'The causeway': {
      u: (x, y) => { lmSoft(x + 16, y + 9, 40, 5, '#2e4842', 88); for (const q of [-5, -4, -3, -2, -1, 9, 10, 11, 12, 13]) { const px = x + q * 4, py = y + 4 + Math.round(Math.sin(q * 0.9) * 2); R(px, py + 4, 3, 1, 'rgba(0,0,0,.25)'); R(px, py, 3, 3, q % 3 ? '#9a8866' : '#a89878'); R(px, py, 3, 1, '#c4b490'); R(px + 1, py + 3, 1, 4, '#4a4038'); if (q % 2) { R(px + 1, py - 5, 1, 5, '#4a4038'); } } R(x - 26, y + 4, 6, 6, '#6a8a52'); R(x - 26, y + 4, 6, 1, '#84a468'); R(x + 56, y + 3, 6, 6, '#6a8a52'); R(x + 56, y + 3, 6, 1, '#84a468'); },      // it runs on, bank to bank
    },
  };
  const setDown = (seed, ok, r, name, draw) => {
    const tryAt = (tx, ty) => {
      if (!ok(tx, ty) || Math.hypot(tx - tx0, ty - ty0) < 13) return false;
      if (siteTiles.some(([sx, sy]) => Math.hypot(sx - tx, sy - ty) < 5)) return false;
      const x = tx * 10, y = ty * 10;
      if (marks.some(m => Math.hypot(m.x - x, m.y - y) < 110)) return false;
      marks.push({ x, y, r, name });
      feats.push({ y: y - 60, d: () => apron(x, y, r, name, tx, ty) });
      const dr = DRESS[name] || {}, d2 = GREATER[name] || {}, whole = () => { if (d2.u) d2.u(x, y); if (dr.u) dr.u(x, y); draw(x, y); if (dr.o) dr.o(x, y); if (d2.o) d2.o(x, y); };      // what lies under it, the thing itself, and what was added to it since
      feats.push({ y: y + 10, d: whole });
      if (TALL.includes(name)) overs.push({ x0: x - 12, x1: x + 56, y0: y - 34, base: y + 10, d: whole });
      return true;
    };
    for (let n = 0; n < 9000; n++) if (tryAt(4 + Math.floor(wildHash(n, seed, 700) * (TW - 9)), 4 + Math.floor(wildHash(seed, n, 701) * (TH - 8)))) return true;
    for (let ty = 4; ty < TH - 4; ty++) for (let tx = 4; tx < TW - 5; tx++) if (tryAt(tx, ty)) return true;      // a rare kind of spot: look everywhere before giving up
    return false;
  };
  const GR = [T_GRASS, T_MEADOW], HL = [T_HILL], SD = [T_SAND], MS = [T_MARSH], FO = [T_FOREST];
  // -- the Home Fields --
  setDown(1, on(GR, 'The Home Fields'), 20, 'The great oak', (x, y) => {
    sh2(x - 1, y + 10, 32); R(x + 13, y - 2, 4, 12, '#4a3320'); R(x + 11, y + 8, 8, 2, '#4a3320'); R(x + 13, y - 2, 1, 12, '#6b4f2c');
    R(x + 2, y - 22, 26, 16, '#35602b'); R(x + 5, y - 26, 20, 4, '#35602b'); R(x, y - 18, 30, 9, '#35602b'); R(x + 8, y - 28, 12, 2, '#35602b');
    R(x + 4, y - 24, 11, 7, '#4c7f38'); R(x + 1, y - 18, 9, 5, '#4c7f38'); R(x + 8, y - 27, 7, 2, '#69a04a'); R(x + 5, y - 23, 5, 2, '#69a04a'); R(x + 20, y - 12, 8, 3, '#274a20');
    R(x + 24, y - 6, 1, 9, '#c9b890'); R(x + 27, y - 6, 1, 9, '#c9b890'); R(x + 24, y + 3, 4, 1, '#6b4f2c');      // a swing
  });
  setDown(2, on(GR, 'The Home Fields'), 22, 'A villa in its garden', (x, y) => {
    sh2(x - 2, y + 10, 42); R(x, y - 6, 38, 16, '#e8dcc0'); R(x, y - 6, 38, 1, '#f8f0dc'); R(x - 2, y - 13, 42, 7, '#b5522e'); R(x - 2, y - 13, 42, 1, '#d06a3e'); for (let q = 0; q < 42; q += 5) R(x - 2 + q, y - 13, 1, 7, '#963f22');
    R(x + 15, y, 8, 10, '#3a2416'); for (const wx of [4, 28]) { R(x + wx, y - 2, 5, 5, '#3a2a1c'); R(x + wx + 2, y - 2, 1, 5, '#8a6a3a'); }
    for (const cxx of [12, 24]) { R(x + cxx, y - 3, 2, 13, '#f0e8d6'); R(x + cxx - 1, y - 4, 4, 1, '#d6ccb8'); }
    tree(x - 6, y + 9, 'cypress', 4, 1); tree(x + 44, y + 9, 'cypress', 5, 1.05); R(x - 10, y + 10, 60, 1, '#b5aa94');
  });
  setDown(3, (tx, ty) => on(GR, 'The Home Fields')(tx, ty) && byRoad(tx, ty), 16, 'The old arch', (x, y) => {
    sh2(x - 1, y + 10, 26); for (const px of [0, 17]) { R(x + px, y - 14, 6, 24, '#d8d2c0'); R(x + px, y - 14, 1, 24, '#f0e8d6'); R(x + px + 5, y - 14, 1, 24, '#b5aa94'); }
    R(x - 1, y - 21, 25, 7, '#d8d2c0'); R(x - 1, y - 21, 25, 1, '#f0e8d6'); R(x + 3, y - 18, 17, 1, '#8f8876'); R(x + 6, y - 14, 11, 2, '#c9c2ae'); R(x + 9, y - 25, 5, 4, '#b98a34'); R(x + 10, y - 27, 3, 2, '#dcae48');
  });
  setDown(4, on(GR, 'The Home Fields'), 16, 'The wine press', (x, y) => {
    sh2(x, y + 10, 30); R(x + 2, y + 2, 14, 8, '#b8ab94'); R(x + 2, y + 2, 14, 1, '#d8cdb6'); R(x + 4, y + 4, 10, 4, '#7a2a4a'); R(x + 8, y - 8, 2, 12, '#6b4f2c'); R(x - 2, y - 8, 22, 2, '#7a5a34');
    for (const bx of [20, 26]) { R(x + bx, y + 3, 5, 7, '#7a5a34'); R(x + bx, y + 4, 5, 1, '#3a2a1c'); R(x + bx, y + 8, 5, 1, '#3a2a1c'); } R(x + 32, y + 4, 3, 6, '#b8703c'); R(x + 33, y + 2, 1, 2, '#b8703c');
  });
  // -- the Long Meadows --
  setDown(5, on(GR, 'The Long Meadows'), 22, 'The fallen colossus', (x, y) => {
    sh2(x - 1, y + 10, 40); R(x, y - 2, 14, 12, '#c9c3ae'); R(x, y - 2, 14, 2, '#e4dfcd'); R(x + 12, y, 3, 8, '#b5af9b'); R(x + 3, y + 2, 2, 1, '#6d6858'); R(x + 3, y + 6, 2, 1, '#6d6858'); R(x + 6, y + 3, 1, 4, '#8f8a78'); R(x + 9, y + 2, 1, 6, '#8f8a78'); R(x - 1, y - 3, 6, 2, '#a8a290');
    R(x + 20, y + 3, 12, 6, '#c9c3ae'); R(x + 20, y + 3, 12, 1, '#e4dfcd'); for (let q = 0; q < 4; q++) R(x + 32, y + 3 + q * 2 - (q === 0 ? 1 : 0), 4, 1, '#b5af9b'); R(x + 16, y + 8, 3, 2, '#b5af9b');
    R(x + 2, y + 8, 3, 2, '#6f9a48'); R(x + 24, y + 7, 4, 2, '#6f9a48'); R(x + 10, y - 3, 2, 1, '#6f9a48');      // the grass coming over it
  });
  setDown(6, on(GR, 'The Long Meadows'), 22, 'An old battlefield', (x, y) => {
    R(x - 2, y + 2, 40, 9, 'rgba(90,70,40,.14)');
    for (const [sx, sy, l] of [[2, 8, 9], [9, 9, 12], [18, 7, 8], [27, 9, 11], [34, 8, 7]]) { for (let q = 0; q < l; q++) R(x + sx + Math.round(q * 0.3), y + sy - q, 1, 1, '#6b4f2c'); R(x + sx + Math.round(l * 0.3), y + sy - l - 1, 1, 2, '#c1c7cc'); }
    R(x + 5, y + 6, 4, 4, '#8a2a20'); R(x + 6, y + 7, 2, 2, '#c9a21e'); R(x + 22, y + 5, 4, 4, '#2f5a8a'); R(x + 23, y + 6, 2, 2, '#c9c2ae'); R(x + 14, y + 8, 3, 2, '#b98a34'); R(x + 30, y + 7, 4, 1, '#e8e2d2'); R(x + 12, y + 5, 3, 1, '#e8e2d2');
    R(x + 9, y - 4, 2, 1, '#1c1310'); R(x + 27, y - 3, 2, 1, '#1c1310'); R(x + 20, y + 3, 2, 1, '#1c1310');      // crows
  });
  setDown(7, on([T_MEADOW], 'The Long Meadows'), 14, 'The bee garden', (x, y) => {
    sh2(x, y + 10, 30); R(x, y + 7, 30, 2, '#7a5a34'); for (const px of [1, 13, 27]) R(x + px, y + 9, 2, 2, '#5e4426');
    for (let q = 0; q < 5; q++) { const hx = x + 1 + q * 6; R(hx, y + 2, 5, 5, '#d9b060'); R(hx + 1, y + 1, 3, 1, '#e6c478'); R(hx, y + 3, 5, 1, '#b89040'); R(hx, y + 5, 5, 1, '#b89040'); R(hx + 2, y + 6, 1, 1, '#2a1c14'); }
    for (let q = 0; q < 6; q++) R(x + 2 + q * 5, y - 2 - (q % 3), 1, 1, '#2a1c14');
  });
  setDown(8, (tx, ty) => on(GR)(tx, ty) && byWater(tx, ty) && !['The Salt Shore', 'Blackmere'].includes(wildRegion(tx * 10, ty * 10)), 18, 'The mill', (x, y) => {
    sh2(x - 1, y + 10, 32); R(x + 10, y - 6, 18, 16, '#d9c9a0'); R(x + 10, y - 6, 18, 1, '#efe2bc'); R(x + 8, y - 12, 22, 6, '#8a5a32'); R(x + 8, y - 12, 22, 1, '#a8703c'); R(x + 17, y + 2, 5, 8, '#3a2416'); R(x + 23, y - 2, 3, 3, '#3a2a1c');
    R(x - 2, y - 2, 12, 12, '#5e4426'); R(x, y, 8, 8, '#3d6d92'); R(x + 3, y - 2, 2, 12, '#7a5a34'); R(x - 2, y + 3, 12, 2, '#7a5a34'); R(x + 3, y + 3, 2, 2, '#c9a763'); R(x - 3, y + 10, 14, 1, '#8fc3e0');
  });
  // -- the Salt Shore --
  setDown(9, on(SD, 'The Salt Shore'), 18, 'A wreck on the strand', (x, y) => {
    sh2(x, y + 9, 32); R(x, y + 6, 30, 2, '#5a4326'); for (let q = 0; q < 8; q++) { const hh = 4 + Math.round(Math.sin(q / 7 * Math.PI) * 7); R(x + 2 + q * 4, y + 6 - hh, 1, hh, '#6b4f2c'); R(x + 3 + q * 4, y + 6 - hh, 1, 1, '#8a6a3a'); }
    R(x + 4, y + 2, 12, 1, '#7a5a34'); R(x + 14, y - 1, 12, 1, '#7a5a34'); for (let q = 0; q < 12; q++) R(x + 18 + q, y + 5 - q, 1, 2, '#5a4326'); R(x + 28, y - 7, 5, 3, '#c9c0aa');
  });
  setDown(10, (tx, ty) => on([T_SAND, T_GRASS], 'The Salt Shore')(tx, ty) && byWater(tx, ty), 14, 'The beacon', (x, y) => {
    sh2(x, y + 10, 18); R(x + 2, y + 6, 14, 4, '#8f8a80'); R(x + 2, y + 6, 14, 1, '#b5ad9c'); R(x + 4, y - 24, 9, 30, '#e8e2d2'); R(x + 11, y - 24, 2, 30, '#c9c2ae'); R(x + 4, y - 24, 1, 30, '#f8f4ea');
    R(x + 4, y - 14, 9, 3, '#a8452e'); R(x + 4, y - 4, 9, 3, '#a8452e'); R(x + 7, y + 1, 3, 5, '#3a2416'); R(x + 2, y - 27, 13, 3, '#8a6a3a'); R(x + 6, y - 32, 5, 5, '#f5c04a'); R(x + 7, y - 34, 3, 3, '#fff0b0');
  });
  setDown(11, on(SD, 'The Salt Shore'), 16, 'The bones of a whale', (x, y) => {
    R(x, y + 5, 30, 2, '#e8e2d2'); R(x - 6, y + 1, 8, 6, '#f1ead8'); R(x - 6, y + 1, 8, 1, '#ffffff'); R(x - 4, y + 4, 2, 2, '#b5ad9c');
    for (let q = 0; q < 6; q++) { const hh = 6 + Math.round(Math.sin((q + 0.5) / 6 * Math.PI) * 6); R(x + 4 + q * 4, y + 5 - hh, 1, hh, '#f1ead8'); R(x + 5 + q * 4, y + 5 - hh, 2, 1, '#f1ead8'); } R(x + 1, y + 7, 28, 1, 'rgba(0,0,0,.16)');
  });
  setDown(12, on(SD, 'The Salt Shore'), 16, 'The fishers\' huts', (x, y) => {
    sh2(x, y + 10, 36); for (const [hx, c] of [[0, '#d9c9a0'], [13, '#cdbd94']]) { R(x + hx, y + 2, 10, 8, c); R(x + hx - 1, y - 3, 12, 5, '#9a7a42'); R(x + hx, y - 4, 10, 1, '#b8964e'); R(x + hx + 4, y + 5, 3, 5, '#3a2416'); }
    R(x + 26, y + 6, 12, 3, '#7a5a34'); R(x + 26, y + 6, 12, 1, '#f1ead8'); R(x + 27, y + 9, 10, 1, '#5e4426'); R(x + 31, y - 2, 1, 8, '#6b4f2c');
    for (let q = 0; q < 4; q++) R(x + 24 + q * 2, y - 3 + q, 8 - q * 2, 1, '#a39a84');      // a net hung to dry
  });
  // -- Greywood --
  setDown(13, on(FO, 'Greywood'), 18, 'The charcoal burners', (x, y) => {
    R(x - 4, y, 34, 11, 'rgba(110,110,80,.5)'); R(x - 1, y - 3, 28, 3, 'rgba(110,110,80,.4)'); sh2(x, y + 10, 26); R(x + 2, y + 2, 16, 8, '#3a342c'); R(x + 4, y, 12, 2, '#3a342c'); R(x + 6, y - 2, 8, 2, '#4a443a'); R(x + 4, y + 4, 12, 1, '#2a2620');
    for (let q = 0; q < 4; q++) R(x + 9 + q * 2, y - 5 - q * 3, 3 + q, 2, `rgba(200,200,200,${(0.5 - q * 0.1).toFixed(2)})`);
    R(x + 20, y + 4, 8, 6, '#6b4f2c'); for (let q = 0; q < 3; q++) R(x + 20, y + 4 + q * 2, 8, 1, '#8a6a3a'); R(x + 22, y - 2, 6, 6, '#7a6a4a'); R(x + 21, y - 4, 8, 2, '#5e4c3a');
  });
  setDown(14, on(FO, 'Greywood'), 16, 'The hunters\' lodge', (x, y) => {
    R(x - 4, y, 32, 12, 'rgba(120,140,90,.5)'); R(x - 1, y - 4, 26, 4, 'rgba(120,140,90,.4)'); sh2(x, y + 10, 26); R(x + 2, y - 2, 20, 12, '#7a5a34'); for (let q = 0; q < 12; q += 3) R(x + 2, y - 2 + q, 20, 1, '#5e4426'); R(x, y - 8, 24, 6, '#5a4a3a'); R(x, y - 8, 24, 1, '#7a6a52');
    R(x + 9, y + 2, 5, 8, '#2a1c14'); R(x + 8, y - 1, 1, 2, '#e8e2d2'); R(x + 14, y - 1, 1, 2, '#e8e2d2'); R(x + 9, y, 5, 1, '#e8e2d2'); R(x + 18, y - 12, 3, 4, '#8f8a84');
    for (let q = 0; q < 3; q++) R(x + 23 + q, y + 6 - q * 2, 6 - q, 2, '#6b4f2c');
  });
  setDown(15, (tx, ty) => on(GR, 'Greywood')(tx, ty), 18, 'A burnt village', (x, y) => {
    R(x - 3, y - 2, 42, 14, 'rgba(60,56,50,.35)');
    for (const [hx, hw] of [[0, 9], [13, 11], [28, 8]]) { R(x + hx, y + 3, hw, 7, '#2a241e'); R(x + hx, y + 1, 2, 2, '#2a241e'); R(x + hx + hw - 2, y - 1, 2, 4, '#2a241e'); R(x + hx + 3, y + 6, 3, 4, '#120c0a'); for (let q = 0; q < hw; q += 3) R(x + hx + q, y - 2 + (q % 2) * 2, 1, 5, '#3a322c'); }
    R(x + 10, y + 9, 2, 1, '#8f8a84'); R(x + 24, y + 8, 3, 1, '#8f8a84');
  });
  // -- the Quarry Hills --
  setDown(16, on(HL, 'The Quarry Hills'), 20, 'The great quarry', (x, y) => {
    // A hill with its side taken out: three benches cut back into it one above another, the walls coming forward
    // either side, a floor of white dust with the cut stone standing on it, and everything needed to get it away.
    const v = (q, k2) => wildHash(q, 16, 1800 + k2), W0 = '#f1ead6', W1 = '#e2d9c0', W2 = '#cfc5a8', W3 = '#b9ae90', W4 = '#9c9278', W5 = '#7f775f', TURF = ['#a9a070', '#c3ba8c', '#7c7550'];
    // the dust of it lies on the ground all round, and has killed the grass
    for (let dy = -10; dy <= 10; dy++) { const w = Math.round(40 * Math.sqrt(1 - (dy * dy) / 110) + (v(dy + 20, 1) - 0.5) * 6); R(x + 21 - w + Math.round((v(dy + 20, 2) - 0.5) * 4), y + 7 + dy, w * 2, 1, 'rgba(232,226,208,.34)'); }
    // the hill it was cut from, standing behind and to either side
    R(x - 26, y + 9, 96, 2, 'rgba(0,0,0,.16)');
    for (let i = 0; i < 56; i++) { const fr = (i + 1) / 56, hw = Math.round(47 * Math.pow(fr, 0.42) + (v(i, 3) - 0.5) * 3), cx = x + 21 + Math.round((v(i >> 2, 4) - 0.5) * 2), lit = Math.round(hw * 0.75);
      R(cx - hw, y - 46 + i, hw + lit, 1, i < 3 ? TURF[1] : TURF[0]); R(cx + lit, y - 46 + i, hw - lit, 1, TURF[2]); if (i > 40) R(cx - hw, y - 46 + i, hw * 2, 1, 'rgba(60,54,30,.10)');
      if (i % 3 === 1) R(cx - hw + Math.floor(v(i, 5) * hw * 1.5), y - 46 + i, 3 + Math.floor(v(i, 6) * 5), 1, v(i, 7) > 0.5 ? TURF[1] : TURF[2]); }
    for (let q = 0; q < 8; q++) { const bx = x - 22 + Math.floor(v(q, 40) * 88), by = y - 30 + Math.floor(v(q, 41) * 34); if (bx > x - 12 && bx < x + 54) continue; R(bx, by, 3, 2, q % 2 ? '#d2cbb6' : '#b3ac98'); R(bx, by, 2, 1, '#e8e4d8'); }      // rock breaking through the turf of its flanks
    // the benches, from the top one down: each a face of cut stone and the shelf at its foot
    const tiers = [[-10, 62, -30], [-6, 54, -21], [-2, 46, -12]];
    tiers.forEach(([ox, w, top], k) => {
      const fx = x + ox, fy = y + top;
      R(fx, fy, w, 7, k === 0 ? W1 : k === 1 ? W2 : W3); R(fx, fy, w, 1, k === 2 ? W1 : W0); R(fx, fy + 6, w, 1, k === 2 ? W5 : W4); R(fx + w - 12, fy + 1, 12, 5, k === 0 ? W2 : k === 1 ? W3 : W4);      // each lower than the last and further from the light, and the east end of each in the shade of the wall
      for (let c = 3 + Math.floor(v(k, 8) * 4); c < w - 2; c += 4 + Math.floor(v(c + k * 40, 9) * 5)) { R(fx + c, fy + 1, 1, 5, k === 2 ? W5 : W4); if (v(c, 10 + k) > 0.6) R(fx + c + 1, fy + 2 + Math.floor(v(c, 11) * 2), 2, 1, W2); }      // the joints where each block came away
      for (let q = 0; q < 6; q++) R(fx + 2 + Math.floor(v(q + k * 9, 12) * (w - 6)), fy + 2 + Math.floor(v(q + k * 9, 13) * 3), 3, 1, q % 2 ? W0 : W3);                                                              // tool marks, and the beds of the rock
      if (k === 0) for (let q = 0; q < 4; q++) R(fx + 6 + Math.floor(v(q, 14) * (w - 14)), fy + 1, 1, 4 + Math.floor(v(q, 15) * 2), '#b89a6a');                                                                    // rust running down from the top
      R(fx + 2, fy + 7, w - 4, 2, k === 2 ? W1 : W2); R(fx + 2, fy + 7, w - 4, 1, W0);                                                                                                                              // the shelf
      // the walls coming forward at either end: the west one in the light, the east in shade
      R(fx, fy + 7, 4, y + 6 - fy - 7 + k, W2); R(fx, fy + 7, 1, y + 6 - fy - 7 + k, W1); R(fx + w - 4, fy + 7, 4, y + 6 - fy - 7 + k, W5); R(fx + w - 1, fy + 7, 1, y + 6 - fy - 7 + k, '#6f6a5c');
      for (let q = fy + 9; q < y + 4 + k; q += 3) { R(fx + 1, q, 3, 1, W3); R(fx + w - 4, q + 1, 3, 1, '#7d7868'); }
    });
    // turf hanging over the lip of the topmost cut, and bushes holding on above it
    R(x - 11, y - 32, 64, 2, TURF[0]); R(x - 11, y - 32, 64, 1, TURF[1]); R(x - 10, y - 30, 62, 1, '#6a6444'); for (let c = -10; c < 52; c += 3) if (v(c + 30, 16) > 0.45) R(x + c, y - 30, 1 + Math.floor(v(c + 30, 17) * 2), 2, TURF[2]);
    for (const [bx, by] of [[-4, -36], [14, -38], [33, -37], [47, -35]]) { R(x + bx, y + by, 4, 3, '#627a3e'); R(x + bx, y + by, 2, 1, '#86a05a'); R(x + bx + 1, y + by + 3, 1, 1, '#4a3320'); }
    // the floor: white dust, trodden and rutted, running out raggedly in front
    R(x + 2, y - 3, 38, 12, '#ddd5bd'); R(x + 30, y - 3, 10, 9, '#cfc7ae'); for (let c = 0; c < 38; c += 2) { const d = Math.floor(v(c, 18) * 4); R(x + 2 + c, y + 9, 2, d, '#ddd5bd'); if (d < 2) R(x + 2 + c, y + 9 + d, 2, 1, 'rgba(232,226,208,.6)'); }
    for (let q = 0; q < 14; q++) R(x + 4 + Math.floor(v(q, 19) * 33), y - 2 + Math.floor(v(q, 20) * 11), 2 + Math.floor(v(q, 21) * 3), 1, q % 3 === 0 ? W0 : q % 3 === 1 ? W2 : W3);
    R(x + 14, y + 4, 22, 1, W3); R(x + 16, y + 7, 22, 1, W3);                                                                   // the ruts of the sledge
    // a block half cut out of the lowest face, the wedges still in it, and the hole where the last one came from
    R(x + 8, y - 11, 9, 5, W0); R(x + 8, y - 11, 9, 1, '#ffffff'); R(x + 8, y - 7, 9, 1, W3); R(x + 7, y - 11, 1, 6, W5); R(x + 17, y - 11, 1, 6, W5); for (let q = 0; q < 3; q++) R(x + 9 + q * 3, y - 12, 1, 2, '#5a5a5a');
    R(x + 22, y - 10, 8, 5, W5); R(x + 22, y - 10, 8, 1, '#6f6a5c'); R(x + 23, y - 6, 6, 1, W4);
    // water standing in the lowest corner, the colour it only is in a quarry
    R(x + 3, y + 4, 9, 4, '#4fa6a0'); R(x + 4, y + 3, 7, 1, '#4fa6a0'); R(x + 4, y + 4, 5, 1, '#9fd8d0'); R(x + 5, y + 6, 4, 1, '#3a8a86'); R(x + 3, y + 8, 9, 1, W3);
    // cut stone waiting to go: squared blocks in their rows, and one column drum
    for (let r0 = 0; r0 < 2; r0++) for (let c = 0; c < 3; c++) { const bx = x + 20 + c * 6, by = y - 1 + r0 * 4; if (r0 === 1 && c === 2) continue; R(bx, by + 3, 6, 1, 'rgba(60,54,40,.3)'); R(bx, by, 5, 3, c % 2 ? W1 : W0); R(bx, by, 5, 1, '#ffffff'); R(bx + 4, by + 1, 1, 2, W3); }
    R(x + 24, y - 4, 5, 3, W0); R(x + 24, y - 4, 5, 1, '#ffffff'); R(x + 28, y - 3, 1, 2, W3);                                   // one stacked on the others
    R(x + 33, y + 3, 5, 5, W1); R(x + 33, y + 3, 5, 1, '#ffffff'); R(x + 34, y + 4, 3, 3, W2); R(x + 37, y + 4, 1, 4, W3); R(x + 33, y + 8, 6, 1, 'rgba(60,54,40,.3)');
    // the spoil: everything that broke, tipped down the slope to the west
    for (let i = 0; i < 10; i++) { const hw = 2 + i; R(x - 18 - Math.floor(i / 2) + (i > 6 ? 1 : 0), y + 1 + i, hw + 6, 1, i % 3 === 0 ? W1 : i % 3 === 1 ? W2 : W3); }
    for (let q = 0; q < 12; q++) R(x - 20 + Math.floor(v(q, 22) * 16), y + 3 + Math.floor(v(q, 23) * 9), 1 + Math.floor(v(q, 24) * 2), 1, q % 2 ? W0 : W4);
    R(x - 22, y + 11, 20, 1, 'rgba(60,54,40,.22)');
    // ladders from shelf to shelf, and a ramp of rubble up to the first of them
    for (const [lx, ly] of [[40, -21], [2, -12]]) { R(x + lx, y + ly - 1, 1, 10, '#6b4f2c'); R(x + lx + 2, y + ly - 1, 1, 10, '#6b4f2c'); for (let q = 0; q < 4; q++) R(x + lx, y + ly + 1 + q * 2, 3, 1, '#8a6a3a'); }
    for (let i = 0; i < 6; i++) R(x + 36 + i, y - 4 + i, 6 - i, 1, i % 2 ? W3 : W2);
    // the crane on the middle shelf: a mast, a jib braced off it, and the treadwheel that two men walk in
    R(x + 30, y - 40, 2, 21, '#6b4f2c'); R(x + 30, y - 40, 1, 21, '#8a6a3a'); for (let q = 0; q < 13; q++) R(x + 30 - q, y - 40 - Math.round(q * 0.45), 2, 1, '#7a5a34'); for (let q = 0; q < 8; q++) R(x + 31 - q, y - 30 - q, 1, 1, '#5a4326');
    R(x + 33, y - 40, 1, 14, '#c9b890');                                                                                         // the rope down to the wheel
    R(x + 33, y - 28, 7, 7, '#7a5a34'); R(x + 34, y - 27, 5, 5, '#4a3620'); R(x + 36, y - 28, 1, 7, '#8a6a3a'); R(x + 33, y - 25, 7, 1, '#8a6a3a'); R(x + 34, y - 21, 6, 1, 'rgba(60,54,40,.35)');
    // the masons' shed against the east wall, and the smith's hearth beside it for the tools
    R(x + 53, y - 2, 13, 9, '#cdbd94'); R(x + 53, y - 2, 2, 9, '#e0d2ac'); R(x + 52, y - 6, 15, 2, '#d06a3e'); R(x + 52, y - 4, 15, 2, '#b5522e'); R(x + 52, y - 6, 15, 1, '#e08a5e'); R(x + 57, y + 2, 3, 5, '#3a2416'); R(x + 62, y + 1, 2, 2, '#3a2a1c'); R(x + 52, y + 7, 15, 1, 'rgba(60,54,40,.3)');
    R(x + 68, y + 3, 4, 4, '#8f8a78'); R(x + 68, y + 3, 4, 1, '#b8b2a0'); R(x + 69, y + 2, 2, 1, '#e2702a');
    // the sledge at the mouth, loaded, and the oxen that will draw it down to the road
    R(x + 40, y + 12, 12, 1, 'rgba(60,54,40,.3)'); R(x + 40, y + 10, 11, 2, '#6b4f2c'); R(x + 41, y + 6, 8, 4, W0); R(x + 41, y + 6, 8, 1, '#ffffff'); R(x + 48, y + 7, 1, 3, W3);
    for (const oxn of [54, 62]) { R(x + oxn, y + 12, 7, 1, 'rgba(60,54,40,.3)'); R(x + oxn, y + 7, 6, 4, oxn === 54 ? '#c9b890' : '#a8834a'); R(x + oxn + 5, y + 6, 3, 3, oxn === 54 ? '#c9b890' : '#a8834a'); R(x + oxn + 7, y + 5, 1, 1, '#f0ece0'); R(x + oxn + 1, y + 11, 1, 1, '#3a2a1c'); R(x + oxn + 4, y + 11, 1, 1, '#3a2a1c'); }
    R(x + 51, y + 9, 3, 1, '#3a2a1c');
  });
  setDown(27, on(HL, 'The Quarry Hills'), 16, 'The lime kiln', (x, y) => {
    sh2(x, y + 10, 22); R(x + 2, y - 4, 16, 14, '#b8ab94'); R(x + 4, y - 8, 12, 4, '#a39a84'); R(x + 6, y - 11, 8, 3, '#8f8676'); R(x + 2, y - 4, 2, 14, '#d8cdb6'); R(x + 7, y + 3, 6, 7, '#2a1c14'); R(x + 8, y + 6, 4, 4, '#e2702a'); R(x + 9, y + 7, 2, 2, '#f5c04a');
    for (let q = 0; q < 4; q++) R(x + 8 + q * 2, y - 15 - q * 3, 3 + q, 2, `rgba(230,230,225,${(0.55 - q * 0.11).toFixed(2)})`); R(x + 20, y + 6, 6, 4, '#f0ece0'); R(x + 21, y + 5, 4, 1, '#ffffff');
  });
  setDown(28, on(HL, 'The Quarry Hills'), 20, 'The unfinished columns', (x, y) => {
    sh2(x - 1, y + 10, 38); for (const [cx, cy, l] of [[0, 4, 22], [6, 8, 26], [14, 0, 18]]) { R(x + cx, y + cy, l, 3, '#e8e4d8'); R(x + cx, y + cy, l, 1, '#f8f6ee'); for (let q = 3; q < l; q += 5) R(x + cx + q, y + cy, 1, 3, '#b8b2a0'); R(x + cx + l - 1, y + cy, 1, 3, '#c4bfae'); }
    R(x + 30, y - 10, 4, 20, '#e8e4d8'); R(x + 30, y - 10, 1, 20, '#f8f6ee'); R(x + 29, y - 11, 6, 1, '#d8d4c6'); for (let q = 0; q < 6; q++) R(x - 2 + q * 3, y + 9 - (q % 2), 2, 1, '#e0dccf');
  });
  // -- the High Fells --
  setDown(17, on(HL, 'The High Fells'), 16, 'The watchtower', (x, y) => {
    sh2(x + 2, y + 10, 18); R(x + 4, y - 18, 12, 28, '#9a958a'); R(x + 4, y - 18, 2, 28, '#bdb8ac'); R(x + 14, y - 18, 2, 28, '#77736a'); for (let q = 0; q < 28; q += 5) R(x + 6, y - 16 + q, 8, 1, '#85817a');
    R(x + 4, y - 21, 3, 3, '#9a958a'); R(x + 9, y - 21, 3, 3, '#9a958a'); R(x + 13, y - 20, 3, 2, '#77736a'); R(x + 8, y + 3, 4, 7, '#2a241e'); R(x + 9, y - 10, 2, 3, '#2a241e');
    R(x - 2, y + 7, 4, 3, '#9a958a'); R(x + 18, y + 8, 3, 2, '#85817a');
  });
  setDown(18, on(HL, 'The High Fells'), 14, 'The hot spring', (x, y) => {
    R(x, y + 2, 22, 8, '#f2efe6'); R(x + 2, y, 18, 2, '#f2efe6'); R(x + 2, y + 3, 18, 6, '#7fd0c8'); R(x + 4, y + 2, 14, 1, '#a8e4dc'); R(x + 6, y + 5, 8, 2, '#5fb8b0'); R(x - 1, y + 10, 24, 1, '#d8d4c8');
    for (let q = 0; q < 5; q++) R(x + 4 + q * 3, y - 3 - (q % 3) * 3, 2 + (q % 2), 2, `rgba(255,255,255,${(0.5 - (q % 3) * 0.12).toFixed(2)})`);
  });
  setDown(19, on(HL, 'The High Fells'), 14, 'The eagle rock', (x, y) => {
    sh2(x, y + 10, 18); for (let q = 0; q < 30; q++) { const w = 2 + Math.round(q * 0.22 + (wildHash(q, 5, 702) - 0.5) * 2); R(x + 8 - w, y - 20 + q, w, 1, q % 6 === 5 ? '#8a929c' : '#a2aab4'); R(x + 8, y - 20 + q, w + 1, 1, '#646c78'); }
    R(x + 5, y - 22, 7, 2, '#6b4f2c'); R(x + 6, y - 23, 5, 1, '#8a6a3a'); R(x + 8, y - 26, 2, 3, '#e8e2d2'); R(x + 10, y - 25, 2, 1, '#e3b04a');
  });
  // -- the Barrow Downs --
  setDown(20, on([T_GRASS, T_HILL, T_MEADOW], 'The Barrow Downs'), 20, 'The ring of stones', (x, y) => {
    const cx = x + 16, cy = y + 3;
    for (let q = 0; q < 9; q++) { const an = q / 9 * Math.PI * 2 + 0.3, sx = Math.round(cx + Math.cos(an) * 15), sy = Math.round(cy + Math.sin(an) * 7), hh = 6 + (q * 3) % 4; R(sx - 1, sy + 1, 4, 1, 'rgba(0,0,0,.25)'); R(sx - 1, sy - hh, 3, hh + 1, '#a8a290'); R(sx - 1, sy - hh, 1, hh + 1, '#c9c3ae'); }
    R(cx - 4, cy, 8, 3, '#8f8876'); R(cx - 4, cy, 8, 1, '#b5af9b'); R(cx + 11, cy - 13, 8, 2, '#a8a290');
  });
  setDown(21, on([T_GRASS, T_HILL, T_MEADOW], 'The Barrow Downs'), 16, 'The giant\'s table', (x, y) => {
    sh2(x - 1, y + 10, 26); R(x + 2, y - 6, 5, 16, '#9a9484'); R(x + 2, y - 6, 1, 16, '#bdb8a8'); R(x + 16, y - 5, 5, 15, '#8a8474'); R(x + 9, y - 2, 4, 12, '#857f70');
    R(x - 2, y - 11, 28, 6, '#a8a290'); R(x - 2, y - 11, 28, 1, '#cfc9b6'); R(x - 1, y - 6, 26, 1, '#6d6858'); R(x + 6, y - 12, 12, 1, '#6f9a48');
  });
  setDown(22, on([T_GRASS, T_HILL, T_MEADOW], 'The Barrow Downs'), 12, 'The needle', (x, y) => {
    sh2(x + 1, y + 10, 10); R(x + 3, y - 22, 5, 32, '#a8a290'); R(x + 3, y - 22, 1, 32, '#cfc9b6'); R(x + 7, y - 22, 1, 32, '#6d6858'); R(x + 4, y - 24, 3, 2, '#a8a290');
    for (let q = 0; q < 5; q++) { R(x + 4 + (q % 2), y - 18 + q * 5, 2, 1, '#6d6858'); R(x + 5, y - 16 + q * 5, 1, 1, '#6d6858'); } R(x, y + 8, 3, 2, '#b8703c'); R(x + 9, y + 9, 2, 1, '#c23b2e');
  });
  // -- Blackmere --
  setDown(23, on(MS, 'Blackmere'), 18, 'The drowned temple', (x, y) => {
    R(x - 2, y + 4, 34, 7, '#2e4842'); R(x, y + 3, 30, 1, '#3d5a52');
    for (const [px, hh] of [[1, 16], [9, 11], [18, 18], [26, 8]]) { R(x + px, y + 6 - hh, 4, hh, '#d8d2c0'); R(x + px, y + 6 - hh, 1, hh, '#f0e8d6'); R(x + px + 3, y + 6 - hh, 1, hh, '#a8a290'); R(x + px - 1, y + 5 - hh, 6, 1, '#c9c2ae'); R(x + px - 1, y + 6, 6, 1, '#587a78'); }
    R(x + 16, y - 15, 14, 3, '#c9c2ae'); R(x + 16, y - 15, 14, 1, '#e8e2d2'); R(x + 6, y + 8, 6, 2, '#b5aa94'); R(x + 13, y - 2, 1, 5, '#8a9a4a'); R(x + 23, y, 1, 4, '#9aaa5a');
  });
  setDown(24, on(MS, 'Blackmere'), 14, 'The causeway', (x, y) => {
    for (let q = 0; q < 9; q++) { const px = x + q * 4, py = y + 4 + Math.round(Math.sin(q * 0.9) * 2); R(px, py, 3, 3, q % 3 ? '#9a8866' : '#a89878'); R(px, py, 3, 1, '#c4b490'); R(px + 1, py + 3, 1, 4, '#4a4038'); }
    R(x + 34, y - 6, 1, 12, '#4a4038'); R(x + 33, y - 7, 3, 2, '#c9c0aa'); R(x - 3, y - 4, 1, 10, '#4a4038');
  });
  setDown(29, on(MS, 'Blackmere'), 18, 'The bog oak', (x, y) => {
    sh2(x + 4, y + 10, 22); R(x + 12, y - 16, 4, 26, '#3a322a'); R(x + 12, y - 16, 1, 26, '#57493c'); R(x + 9, y + 8, 10, 2, '#3a322a');
    for (const [bx, by, l, d] of [[12, -12, 9, -1], [16, -14, 10, 1], [12, -4, 7, -1], [16, -8, 8, 1], [13, -18, 5, -1], [15, -20, 6, 1]]) for (let q = 0; q < l; q++) R(x + bx + d * q, y + by - Math.round(q * 0.6), 1, q < l - 2 ? 2 : 1, '#3a322a');
    R(x + 1, y - 18, 2, 1, '#1c1310'); R(x + 24, y - 21, 2, 1, '#1c1310'); R(x + 13, y - 6, 2, 3, '#1c1410');
  });
  setDown(30, (tx, ty) => on(MS, 'Blackmere')(tx, ty) && byWater(tx, ty), 18, 'The huts on stilts', (x, y) => {
    for (const [hx, hy] of [[0, 0], [14, -3], [26, 1]]) { for (const lx of [1, 7]) R(x + hx + lx, y + hy + 4, 1, 7, '#4a4038'); R(x + hx - 1, y + hy + 3, 11, 2, '#6b5a44'); R(x + hx, y + hy - 3, 9, 6, '#8a7a5a'); R(x + hx - 1, y + hy - 6, 11, 3, '#6a5a3a'); R(x + hx, y + hy - 7, 9, 1, '#8a7a52'); R(x + hx + 3, y + hy, 3, 3, '#2a241e'); }
    R(x + 9, y + 3, 6, 1, '#6b5a44'); R(x + 23, y + 3, 4, 1, '#6b5a44'); R(x + 4, y + 9, 8, 2, '#5a4a34'); R(x + 5, y + 9, 6, 1, '#7a6a52');
  });
  setDown(31, on([T_GRASS, T_FOREST], 'Greywood'), 14, 'The wolf stone', (x, y) => {
    R(x - 3, y + 2, 26, 10, 'rgba(110,110,90,.35)'); sh2(x + 1, y + 10, 18); R(x + 3, y - 6, 12, 16, '#8a8a86'); R(x + 5, y - 10, 9, 4, '#8a8a86'); R(x + 3, y - 6, 2, 16, '#a8a8a2'); R(x + 13, y - 6, 2, 16, '#66665f');
    R(x + 12, y - 13, 3, 4, '#8a8a86'); R(x + 5, y - 12, 2, 3, '#8a8a86'); R(x + 7, y - 4, 2, 2, '#2a241e'); R(x + 10, y - 4, 2, 2, '#2a241e'); R(x + 7, y + 1, 5, 1, '#2a241e'); R(x + 6, y - 8, 3, 1, '#6f8a5a'); R(x - 2, y + 8, 3, 2, '#efe8d8');
  });
  setDown(32, on(GR, 'The Long Meadows'), 16, 'The shepherds\' fold', (x, y) => {
    for (let q = 0; q < 26; q += 2) { R(x + q, y - 4 + (q % 4 ? 0 : 1), 2, 2, '#b5aa94'); R(x + q, y + 8 + (q % 4 ? 1 : 0), 2, 2, '#a39a84'); } for (let q = -4; q < 10; q += 2) { R(x - 1, y + q, 2, 2, '#b5aa94'); if (q < 2 || q > 5) R(x + 25, y + q, 2, 2, '#a39a84'); }
    for (const [sx, sy] of [[4, 0], [10, 3], [16, -1], [7, 5], [19, 4], [13, 1]]) { R(x + sx, y + sy, 3, 2, sx === 16 ? '#3a322c' : '#f1ead8'); R(x + sx + 3, y + sy, 1, 1, '#2a1c14'); }
    R(x + 28, y - 6, 6, 8, '#cdbd94'); R(x + 27, y - 9, 8, 3, '#9a7a42'); R(x + 30, y - 2, 2, 4, '#3a2416');
  });
  // -- anywhere there is a road, far from the town --
  setDown(25, (tx, ty) => on(GR)(tx, ty) && byRoad(tx, ty) && Math.hypot(tx - tx0, ty - ty0) > 45, 14, 'The gallows', (x, y) => {
    sh2(x + 2, y + 10, 18); R(x + 4, y - 18, 2, 28, '#5a4326'); R(x + 4, y - 18, 15, 2, '#5a4326'); for (let q = 0; q < 5; q++) R(x + 6 + q, y - 12 + q, 1, 2, '#6b4f2c'); R(x + 16, y - 16, 1, 7, '#c9b890'); R(x + 15, y - 9, 3, 3, '#c9b890'); R(x + 16, y - 8, 1, 1, '#d9b877');
    R(x + 8, y - 20, 2, 1, '#1c1310'); R(x + 12, y - 20, 2, 1, '#1c1310'); R(x + 1, y + 8, 8, 2, '#6f8a4a');
  });
  setDown(26, (tx, ty) => on(GR)(tx, ty) && !['The Home Fields'].includes(wildRegion(tx * 10, ty * 10)), 22, 'The broken aqueduct', (x, y) => {
    sh2(x - 1, y + 10, 44); for (const [px, top] of [[0, -16], [12, -16], [24, -16], [36, -4]]) { R(x + px, y + top, 4, 10 - top, '#c9c2ae'); R(x + px, y + top, 1, 10 - top, '#e4dfcd'); R(x + px + 3, y + top, 1, 10 - top, '#a39a84'); }
    R(x, y - 20, 28, 4, '#d8d2c0'); R(x, y - 20, 28, 1, '#f0e8d6'); R(x, y - 16, 28, 1, '#a39a84'); for (const ax of [4, 16]) { R(x + ax, y - 15, 8, 2, '#c9c2ae'); R(x + ax, y - 13, 1, 2, '#c9c2ae'); R(x + ax + 7, y - 13, 1, 2, '#c9c2ae'); }
    R(x + 28, y - 19, 3, 2, '#c9c2ae'); R(x + 30, y + 6, 4, 3, '#c9c2ae'); R(x + 40, y + 8, 3, 2, '#b5ad9c'); R(x + 2, y - 21, 3, 1, '#6f9a48'); R(x + 20, y - 21, 4, 1, '#6f9a48'); R(x + 13, y - 6, 2, 4, '#6f9a48');
  });
  // -- eight great ones, one to a country --
  setDown(41, (tx, ty) => on(HL, 'The High Fells')(tx, ty) && on(HL)(tx, ty - 1), 22, 'The great waterfall', (x, y) => {
    // a mountain of its own, greater than any round it, with the water coming out of a cleft under the snow and down its face in two leaps
    const LIT = '#a2aab4', MID = '#7d8692', DARK = '#646c78', DEEP = '#4a515c', jg = (i, k) => wildHash(i, 41, k);
    const mass = (cx, by, mw, mh, lean, sr, k, pw) => {
      R(cx - (mw >> 1) - 1, by, mw + 5, 2, 'rgba(0,0,0,.22)');
      for (let i = 0; i < mh; i++) {
        const fr = (i + 1) / mh, half = Math.max(1, Math.round((mw / 2) * Math.pow(fr, pw) + (jg(i, k) - 0.5) * (2 + fr * 5))), px = Math.round(cx + lean * mw * (1 - fr)), yy = by - mh + i;
        const snL = i < sr + Math.round((jg(i, k + 1) - 0.5) * 4), snR = i < sr * 0.72 + Math.round((jg(i, k + 2) - 0.5) * 4);
        R(px - half, yy, half, 1, snL ? '#f4f6fa' : LIT); R(px, yy, half + 1, 1, snR ? '#c9d2de' : DARK);
        for (let q = 0; q < 3; q++) { if (!snL && jg(i * 7 + q, k + 8) > 0.45) R(px - half + Math.floor(jg(i * 5 + q, k + 9) * Math.max(1, half - 4)), yy, 2 + Math.floor(jg(i + q, k + 10) * 4), 1, MID); if (!snR && jg(i * 3 + q, k + 11) > 0.5) R(px + 1 + Math.floor(jg(i * 9 + q, k + 12) * Math.max(1, half - 4)), yy, 2 + Math.floor(jg(i + q, k + 13) * 4), 1, DEEP); }      // the beds of the rock, broken
        if (!snL && fr > 0.3 && jg(i, k + 3) > 0.6) R(px - Math.round(half * (0.25 + jg(i, k + 4) * 0.6)), yy, 2, 1, '#b8c0c8');      // ledges catching the light
        if (!snR && fr > 0.3 && jg(i, k + 5) > 0.6) R(px + Math.round(half * (0.25 + jg(i, k + 6) * 0.6)), yy, 2, 1, DEEP);           // gullies
        if (snL && !snR && jg(i, k + 7) > 0.5) R(px, yy, 2, 1, '#e2e8f0');
      }
    };
    mass(x + 44, y + 7, 44, 42, -0.1, 12, 10, 1.25);                    // the shoulder behind, to the east
    mass(x - 14, y + 8, 34, 30, 0.12, 6, 20, 1.2);                    // and a spur to the west
    mass(x + 15, y + 10, 78, 72, 0.04, 26, 30, 1.3);                  // the mountain itself
    mass(x + 37, y + 10, 30, 30, -0.15, 0, 40, 0.9); mass(x - 9, y + 10, 26, 22, 0.15, 0, 50, 0.9);      // its knees, either side of the fall
    // snow lying in the high gullies below the cap, and a streak of it down the lit face
    for (const [sx, sy, sw] of [[4, -30, 4], [1, -27, 3], [7, -33, 3], [25, -31, 3], [28, -27, 2], [-3, -20, 3]]) R(x + sx, y + sy, sw, 1, sx > 15 ? '#c9d2de' : '#f4f6fa');
    // the cleft the water has cut: dark rock either side of it, all the way down
    for (let q = 0; q < 34; q++) { const wd = 10 + (q > 17 ? 2 : 0) + (q % 6 === 0 ? 1 : 0); R(x + 15 - (wd >> 1), y - 29 + q, wd, 1, q % 4 === 1 ? DARK : DEEP); }
    R(x + 9, y - 30, 12, 1, '#2f343c'); R(x + 11, y - 31, 8, 1, '#2f343c');
    // the upper leap, narrow, out of the cleft's mouth; a shelf; then the lower leap, broader
    R(x + 14, y - 29, 4, 18, '#9ccbe8'); R(x + 15, y - 29, 2, 18, '#d8ecf6'); R(x + 17, y - 28, 1, 16, '#7fb6d8');
    R(x + 7, y - 11, 8, 2, '#b8c0c8'); R(x + 7, y - 9, 10, 1, DEEP); R(x + 18, y - 10, 4, 2, DARK); R(x + 12, y - 12, 7, 2, '#e6f3fa'); R(x + 13, y - 13, 4, 1, '#ffffff');
    R(x + 10, y - 10, 8, 15, '#9ccbe8'); R(x + 11, y - 10, 3, 15, '#d8ecf6'); R(x + 17, y - 9, 1, 13, '#7fb6d8');
    // a thread of meltwater high on the lit face
    for (let q = 0; q < 10; q++) R(x + 3 + Math.floor(q / 4), y - 40 + q, 1, 1, '#b4d6ea');
    // pines on the lower slopes, and scree
    for (const [px2, py2] of [[-14, 2], [-9, 5], [-4, -2], [1, 3], [29, 1], [34, 5], [38, -1], [43, 4], [-19, 6], [24, -4]]) { R(x + px2, y + py2 - 5, 1, 1, '#2d5236'); R(x + px2 - 1, y + py2 - 4, 3, 2, '#2d5236'); R(x + px2 - 2, y + py2 - 2, 5, 2, '#21402a'); R(x + px2 - 1, y + py2 - 4, 1, 2, '#3a6442'); R(x + px2, y + py2, 1, 2, '#3a2416'); }
    for (const [sx, sy] of [[-6, 8], [3, 9], [27, 9], [36, 8], [47, 9], [-16, 9]]) { R(x + sx, y + sy, 3, 2, MID); R(x + sx, y + sy, 3, 1, LIT); }
    // the pool it has dug at the foot, the rocks round it, and where it runs away
    R(x + 1, y + 4, 28, 7, '#4f86ae'); R(x + 3, y + 3, 24, 1, '#4f86ae'); R(x + 4, y + 11, 22, 1, '#3f7298'); R(x + 6, y + 7, 18, 2, '#8fc3e0'); R(x + 8, y + 4, 14, 3, '#e6f3fa'); R(x + 10, y + 3, 10, 1, '#ffffff');
    R(x - 3, y + 7, 6, 4, DARK); R(x - 3, y + 7, 6, 1, LIT); R(x + 27, y + 6, 6, 5, MID); R(x + 27, y + 6, 6, 1, LIT); R(x + 12, y + 12, 6, 3, '#4f86ae'); R(x + 13, y + 15, 5, 2, '#5a9cc6');
  });
  setDown(42, on(SD, 'The Salt Shore'), 21, 'The salt pans', (x, y) => {
    R(x - 1, y - 6, 44, 17, '#b8a26a'); for (let r0 = 0; r0 < 2; r0++) for (let q = 0; q < 4; q++) { const c = ['#9ec4c8', '#cfe0e0', '#e8f0ee', '#f8f8f4'][(q + r0 * 2) % 4]; R(x + q * 11, y - 5 + r0 * 8, 10, 7, c); R(x + q * 11, y - 5 + r0 * 8, 10, 1, shade(c, 1.08)); if ((q + r0) % 2) R(x + q * 11 + 2, y - 3 + r0 * 8, 5, 1, '#ffffff'); }
    for (const [hx, hh] of [[46, 6], [52, 4], [57, 7]]) for (let q = 0; q < hh; q++) R(x + hx - Math.floor((q + 1) / 2), y + 10 - hh + q, 1 + q, 1, q % 2 ? '#f0f0ec' : '#ffffff');
    R(x + 44, y + 10, 18, 1, 'rgba(0,0,0,.16)'); R(x + 46, y - 8, 9, 7, '#cdbd94'); R(x + 45, y - 11, 11, 3, '#b8a85a'); R(x + 49, y - 4, 2, 3, '#3a2416'); R(x - 4, y + 2, 3, 1, '#6fa8c8'); R(x - 6, y + 3, 3, 1, '#6fa8c8');
  });
  setDown(43, on(FO, 'Greywood'), 20, 'The sacred grove', (x, y) => {
    R(x - 4, y - 8, 46, 20, 'rgba(120,140,90,.55)'); R(x, y - 12, 38, 4, 'rgba(120,140,90,.45)');
    for (const [ox, oy, sz] of [[0, 2, 6], [36, 0, 6], [8, -8, 5], [28, -9, 6], [18, -12, 5]]) tree(x + ox, y + oy, 'oak', sz, 0.92 + (ox % 7) * 0.02);
    sh2(x + 13, y + 9, 13); R(x + 14, y + 3, 11, 6, '#b8b0a0'); R(x + 14, y + 3, 11, 1, '#d8d2c0'); R(x + 13, y + 2, 13, 1, '#a39a84'); R(x + 23, y + 3, 2, 6, '#8f8676'); R(x + 17, y, 2, 2, '#b5522e'); R(x + 21, y + 1, 2, 1, '#c9a21e'); R(x + 19, y + 5, 2, 2, '#7a2a20');
    for (const [rx0, ry0, c] of [[3, -6, '#c23b2e'], [33, -8, '#f1ead8'], [11, -14, '#c9a21e'], [26, -15, '#c23b2e'], [20, -18, '#f1ead8']]) R(x + rx0, y + ry0, 1, 3, c);
    for (const lx of [9, 29]) { R(x + lx, y + 1, 1, 9, '#5a4326'); R(x + lx - 1, y - 1, 3, 2, '#3a2a1c'); }
  });
  setDown(44, on(HL, 'The Quarry Hills'), 20, 'The white temple', (x, y) => {
    sh2(x - 2, y + 10, 44); for (let q = 0; q < 3; q++) { R(x - 2 + q * 2, y + 8 - q * 2, 40 - q * 4, 2, q % 2 ? '#e0dccf' : '#f0ece0'); R(x - 2 + q * 2, y + 8 - q * 2, 40 - q * 4, 1, '#ffffff'); }
    R(x + 4, y - 12, 28, 16, '#e8e4d8'); R(x + 8, y - 10, 20, 14, '#cfc9b8'); R(x + 16, y - 6, 5, 10, '#3a2a1c'); for (let q = 0; q < 6; q++) { R(x + 4 + q * 5 + (q > 2 ? 1 : 0), y - 12, 3, 16, '#f8f6ee'); R(x + 6 + q * 5 + (q > 2 ? 1 : 0), y - 12, 1, 16, '#c4bfae'); R(x + 3 + q * 5 + (q > 2 ? 1 : 0), y - 13, 5, 1, '#e0dccf'); }
    R(x + 2, y - 16, 32, 3, '#f0ece0'); R(x + 2, y - 16, 32, 1, '#ffffff'); for (let q = 0; q < 7; q++) R(x + 4 + q * 2, y - 17 - q, 28 - q * 4, 1, q === 0 ? '#e0dccf' : q < 5 ? '#b5522e' : '#f0ece0'); R(x + 6, y - 18, 24, 1, '#f0ece0'); R(x + 17, y - 25, 2, 2, '#e8b545'); R(x + 2, y - 18, 2, 2, '#e8b545'); R(x + 32, y - 18, 2, 2, '#e8b545');
    R(x + 15, y + 10, 6, 3, '#d8d4c6'); R(x + 15, y + 10, 6, 1, '#f8f6ee'); tree(x - 6, y + 9, 'cypress', 4, 1); tree(x + 42, y + 9, 'cypress', 4, 0.96);
  });
  setDown(45, on([T_GRASS, T_HILL, T_MEADOW], 'The Barrow Downs'), 24, 'The barrow of kings', (x, y) => {
    R(x - 3, y + 9, 54, 3, 'rgba(0,0,0,.2)'); for (let dy = -15; dy <= 0; dy++) { const w = Math.round(25 * Math.sqrt(1 - (dy * dy) / 232)); R(x + 24 - w, y + 9 + dy, w * 2, 1, '#6c9246'); if (dy < -4) R(x + 24 - w + 2, y + 9 + dy, Math.round(w * 0.9), 1, '#86ac58'); R(x + 24 + w - Math.max(1, Math.round(w * 0.25)), y + 9 + dy, Math.max(1, Math.round(w * 0.25)), 1, '#4f7434'); }
    for (let q = 0; q < 13; q++) { R(x + q * 4, y + 8, 3, 2, q % 2 ? '#a8a290' : '#b8b2a0'); R(x + q * 4, y + 8, 3, 1, '#cfc9b6'); }
    R(x + 18, y - 3, 3, 12, '#a8a290'); R(x + 18, y - 3, 1, 12, '#cfc9b6'); R(x + 28, y - 3, 3, 12, '#8f8876'); R(x + 16, y - 6, 17, 3, '#b8b2a0'); R(x + 16, y - 6, 17, 1, '#d8d2c0'); R(x + 21, y - 3, 7, 12, '#120c0a');
    R(x + 8, y - 6, 3, 15, '#a8a290'); R(x + 8, y - 6, 1, 15, '#cfc9b6'); R(x + 38, y - 4, 3, 13, '#a8a290'); R(x + 38, y - 4, 1, 13, '#cfc9b6'); R(x + 22, y - 9, 6, 1, '#6f8a4a'); R(x + 12, y - 5, 2, 1, '#f2e6a0'); R(x + 34, y - 8, 2, 1, '#f2e6a0');
  });
  setDown(46, (tx, ty) => on(GR)(tx, ty) && on(GR)(tx + 2, ty) && byRoad(tx, ty + 1) && Math.hypot(tx - tx0, ty - ty0) > 32, 24, 'The fort', (x, y) => {
    R(x - 2, y + 10, 52, 2, 'rgba(0,0,0,.22)'); R(x, y - 14, 48, 24, '#b8a47a'); for (let q = 0; q < 14; q++) R(x + 2 + Math.floor(wildHash(q, 9, 1340) * 44), y - 11 + Math.floor(wildHash(9, q, 1341) * 19), 2, 1, q % 2 ? '#a8946a' : '#c8b48a');
    for (let q = 0; q < 48; q += 2) { R(x + q, y - 17, 2, 4, q % 4 ? '#7a5a34' : '#6b4f2c'); R(x + q, y - 18, 1, 1, '#8a6a3a'); }
    for (let r0 = 0; r0 < 2; r0++) for (let q = 0; q < 4; q++) { const tx2 = x + 5 + q * 10, ty2 = y - 8 + r0 * 8; for (let i = 0; i < 4; i++) R(tx2 + 3 - i, ty2 + i, i * 2 + 1, 1, i % 2 ? '#8a6a4a' : '#9a7a56'); R(tx2 + 3, ty2 + 2, 1, 2, '#2a1d12'); }
    R(x + 23, y - 12, 1, 12, '#5a4326'); R(x + 22, y - 14, 3, 2, '#e8b545'); R(x + 24, y - 11, 4, 3, '#a8261c');
    R(x - 1, y - 16, 2, 28, '#6b4f2c'); R(x + 47, y - 16, 2, 28, '#5a4326'); for (let q = 0; q < 48; q += 2) if (q < 20 || q > 27) { R(x + q, y + 6, 2, 5, q % 4 ? '#7a5a34' : '#6b4f2c'); R(x + q, y + 5, 1, 1, '#8a6a3a'); }
    for (const gx2 of [17, 28]) { R(x + gx2, y, 4, 11, '#6b4f2c'); R(x + gx2, y, 1, 11, '#8a6a3a'); R(x + gx2 - 1, y - 2, 6, 2, '#5a4326'); } R(x + 17, y - 4, 15, 2, '#7a5a34');
  });
  setDown(47, on(GR, 'The Long Meadows'), 22, 'The old arena', (x, y) => {
    const cx = x + 22, cy = y;
    for (let an = 0; an < Math.PI * 2; an += 0.05) { const gap = wildHash(Math.floor(an * 5), 3, 1342) < 0.28; if (gap) continue; const ex = Math.round(cx + Math.cos(an) * 22), ey = Math.round(cy + Math.sin(an) * 10), back = Math.sin(an) < 0, hh = back ? 5 + Math.floor(wildHash(Math.floor(an * 9), 4, 1343) * 4) : 3; R(ex - 1, ey - hh, 3, hh + 1, back ? '#d8d2c0' : '#c9c2ae'); R(ex - 1, ey - hh, 1, hh + 1, '#f0e8d6'); if (back && Math.floor(an * 20) % 4 === 0) R(ex, ey - hh + 2, 1, 3, '#6d6858'); }
    for (let dy = -6; dy <= 6; dy++) { const w = Math.round(15 * Math.sqrt(1 - (dy * dy) / 40)); R(cx - w, cy + dy, w * 2, 1, dy % 3 ? '#b8ac7c' : '#a89c6c'); }
    for (let q = 0; q < 7; q++) R(cx - 12 + Math.floor(wildHash(q, 5, 1344) * 24), cy - 4 + Math.floor(wildHash(5, q, 1345) * 8), 2, 1, q % 2 ? '#6f9a48' : '#8ab04a');
    R(x + 2, y + 9, 5, 3, '#c9c2ae'); R(x + 2, y + 9, 5, 1, '#e8e2d2'); R(x + 38, y + 10, 4, 2, '#b5ad9c'); R(x + 30, y - 12, 4, 1, '#6f9a48'); tree(cx + 9, cy + 3, 'birch', 3, 1);
  });
  setDown(48, (tx, ty) => on(GR)(tx, ty) && wet(at(tx + 3, ty)) && wet(at(tx + 4, ty)) && wet(at(tx + 5, ty)) && wildRegion(tx * 10, ty * 10) !== 'Blackmere', 16, 'The ferry', (x, y) => {
    sh2(x - 1, y + 10, 20); R(x, y - 2, 14, 12, '#d9c9a0'); R(x, y - 2, 14, 1, '#efe2bc'); R(x - 1, y - 8, 16, 6, '#8a5a32'); R(x - 1, y - 8, 16, 1, '#a8703c'); R(x + 5, y + 4, 4, 6, '#3a2416'); R(x + 10, y, 3, 3, '#3a2a1c');
    R(x + 18, y - 8, 1, 18, '#5a4326'); R(x + 18, y - 8, 5, 1, '#5a4326'); R(x + 21, y - 7, 2, 3, '#c9a21e'); R(x + 21, y - 4, 2, 1, '#8a6a1e');
    for (let q = 0; q < 9; q++) { R(x + 22 + q * 2, y + 6, 2, 4, q % 2 ? '#7a5a34' : '#8a6a3a'); if (q % 3 === 0) R(x + 22 + q * 2, y + 10, 1, 3, '#3a2a1c'); } R(x + 22, y + 6, 18, 1, '#a8834a');
  });
  // Where people live and work, out in the country. Every one is built up from parts for its own spot: its walls,
  // its roof, its size, which way it faces and what stands in its yard, so that no two are the same building.
  const dwell = (seed, ok, name, draw) => {
    for (let n = 0; n < 5000; n++) {
      const tx = 4 + Math.floor(wildHash(n, seed, 1110) * (TW - 9)), ty = 4 + Math.floor(wildHash(seed, n, 1111) * (TH - 8));
      if (!ok(tx, ty) || Math.hypot(tx - tx0, ty - ty0) < 13) continue;
      if (siteTiles.some(([sx, sy]) => Math.hypot(sx - tx, sy - ty) < 5)) continue;
      const x = tx * 10, y = ty * 10;
      if (marks.some(m => Math.hypot(m.x - x, m.y - y) < 78)) continue;
      marks.push({ x, y, r: 12, name, dw: true });
      const flip = wildHash(seed, 3, 1112) > 0.5, P = (px, py, w, hh, c) => R(flip ? 2 * x + 24 - px - w : px, py, w, hh, c), v = q => wildHash(seed, q, 1113);
      P.at = px => flip ? 2 * x + 24 - px : px;
      feats.push({ y: y - 60, d: () => apron(x, y, 12, name, tx, ty) });      // a path worn from its door to the nearest road
      const YARD = [
        (ax, ay) => { R(ax - 1, ay + 2, 7, 1, 'rgba(0,0,0,.2)'); R(ax, ay - 1, 5, 3, '#b8ab94'); R(ax, ay - 1, 5, 1, '#d8cdb6'); R(ax + 1, ay, 3, 1, '#4f8fb8'); R(ax, ay - 6, 1, 5, '#6b4f2c'); R(ax + 4, ay - 6, 1, 5, '#6b4f2c'); R(ax, ay - 7, 5, 1, '#8a6a3a'); R(ax + 2, ay - 6, 1, 3, '#c9b890'); },      // a well under its windlass
        (ax, ay) => { R(ax - 1, ay + 2, 8, 1, 'rgba(0,0,0,.2)'); for (let q = 0; q < 3; q++) { R(ax + (q % 2), ay - q * 2, 6 - q, 2, q % 2 ? '#7a5a34' : '#6b4f2c'); for (let i = 0; i < 6 - q; i += 2) R(ax + (q % 2) + i, ay - q * 2, 1, 1, '#c9a763'); } },                                                  // wood cut and stacked
        (ax, ay) => { R(ax - 1, ay + 2, 8, 1, 'rgba(0,0,0,.2)'); for (let i = 0; i < 6; i++) { const w = 1 + i; R(ax + 3 - (w >> 1), ay - 4 + i, w, 1, i % 2 ? '#d9c070' : '#e6d088'); } R(ax + 3, ay - 6, 1, 2, '#6b4f2c'); },                                                                                  // a rick, round its pole
        (ax, ay) => { R(ax, ay - 6, 1, 8, '#6b4f2c'); R(ax + 8, ay - 6, 1, 8, '#6b4f2c'); R(ax, ay - 5, 9, 1, '#c9b890'); R(ax + 1, ay - 4, 2, 3, '#f1ead8'); R(ax + 4, ay - 4, 2, 4, '#8fa8c8'); R(ax + 7, ay - 4, 1, 2, '#c23b2e'); },                                                                         // washing on a line
        (ax, ay) => { for (let q = 0; q < 3; q++) { R(ax, ay - 3 + q * 2, 8, 1, '#6b4f2c'); for (let i = 0; i < 8; i += 2) R(ax + i + (q % 2), ay - 4 + q * 2, 1, 1, i % 4 ? '#5f9a4a' : '#7fbf6a'); } R(ax + 2, ay - 4, 1, 1, '#c23b2e'); R(ax + 6, ay, 1, 1, '#e8c040'); },                                    // a kitchen garden, in rows
        (ax, ay) => { R(ax - 1, ay + 2, 9, 1, 'rgba(0,0,0,.2)'); R(ax, ay - 2, 7, 3, '#8a6a3a'); R(ax, ay - 3, 7, 1, '#a8834a'); R(ax + 1, ay + 1, 2, 2, '#3a2a1c'); R(ax + 5, ay + 1, 2, 2, '#3a2a1c'); R(ax - 3, ay - 1, 3, 1, '#6b4f2c'); R(ax + 1, ay - 5, 5, 2, '#d9c070'); },                              // a cart, loaded
        (ax, ay) => { for (let q = 0; q < 3; q++) { R(ax + q * 3, ay - 2, 2, 4, '#d9b060'); R(ax + q * 3, ay - 1, 2, 1, '#b89040'); R(ax + q * 3, ay - 3, 2, 1, '#e6c478'); } R(ax - 1, ay + 2, 10, 1, '#7a5a34'); },                                                                                         // skeps on a bench
        (ax, ay) => { R(ax, ay - 1, 7, 3, '#6b4f2c'); R(ax + 1, ay - 1, 5, 1, '#6fa8c8'); R(ax, ay + 2, 1, 1, '#4a3620'); R(ax + 6, ay + 2, 1, 1, '#4a3620'); },                                                                                                                                      // a trough
        (ax, ay) => { for (let q = 0; q < 9; q += 2) R(ax + q, ay - 3, 1, 5, '#6b4f2c'); R(ax, ay - 2, 9, 1, '#8a6a3a'); R(ax, ay, 9, 1, '#8a6a3a'); R(ax + 2, ay - 1, 3, 2, '#e8c8b8'); R(ax + 5, ay - 1, 1, 1, '#e8c8b8'); },                                                                             // a sty, with a pig in it
      ];
      const y1 = Math.floor(v(70) * YARD.length), y2 = (y1 + 1 + Math.floor(v(71) * (YARD.length - 1))) % YARD.length, plot = v(72) > 0.45 && !/clamp|kiln|cell|mill|peat|fisher/.test(name) && !['Blackmere', 'The Salt Shore', 'The High Fells'].includes(wildRegion(x, y)) && at(tx, ty) !== T_HILL;
      feats.push({ y: y + 10, d: () => { lmSoft(x + 12, y + 9, 17, 4, 'rgba(150,126,82,.34)', 90 + (seed % 7));
        if (plot) { const fx = P.at ? (flip ? x + 30 : x - 22) : x - 22, fy = y - 3; R(fx + 1, fy, 14, 9, 'rgba(120,96,56,.3)'); R(fx, fy + 1, 16, 7, 'rgba(120,96,56,.2)'); for (let q = 0; q < 9; q += 2) { R(fx + (q % 4 ? 0 : 1), fy + q, 15, 1, 'rgba(104,80,48,.75)'); for (let i = 0; i < 16; i += 2) R(fx + i + (q % 4 ? 1 : 0), fy + q - 1, 1, 1, i % 4 ? '#5f9a4a' : '#7fb060'); } for (let q = 0; q < 5; q++) R(fx - 1 + Math.floor(v(80 + q) * 18), fy - 2 + (q % 2) * 11, 2, 1, '#6b8f3e'); R(fx - 1, fy - 1, 1, 11, '#6b4f2c'); R(fx + 16, fy + 2, 1, 8, '#6b4f2c'); }      // a plot of its own, tilled in rows, with a post at each corner
        YARD[y1](flip ? x + 27 : x - 11, y + 8); for (let q = 0; q < 6; q++) R(x - 3 + Math.floor(v(40 + q) * 30), y + 6 + Math.floor(v(46 + q) * 6), 2, 1, q % 2 ? 'rgba(110,90,56,.5)' : 'rgba(196,176,128,.5)'); draw(x, y, P, v); YARD[y2](x + 4 + Math.floor(v(73) * 10), y + 15); for (let q = 0; q < 4; q++) { const gx = x - 4 + Math.floor(v(52 + q) * 32), gy = y + 11 + Math.floor(v(56 + q) * 3); R(gx, gy, 1, 2, '#6b8f3e'); R(gx + 1, gy, 1, 1, '#8aa85a'); } } });      // the yard it stands in, trodden; then the place itself; then the grass coming back at its edges
      return;
    }
  };
  const WALLS = ['#e2d2a8', '#f0e8d6', '#cdbd94', '#b8ab94', '#a89c88', '#d8c4a0'], ROOFS = { tile: ['#a8482a', '#c2603a'], thatch: ['#9a7a42', '#b8964e'], turf: ['#5f7a3f', '#7a9a52'], slate: ['#5a606c', '#7a8290'], shingle: ['#6b4f2c', '#8a6a3a'], reed: ['#b8a85a', '#d0c070'] };
  const cot = (P, v, x, y, o) => {
    const w = o.w || 7 + Math.floor(v(11) * 5), hh = o.h || 5 + Math.floor(v(12) * 2), rh = 3 + Math.floor(v(13) * 2), wall = o.wall || WALLS[Math.floor(v(14) * WALLS.length)], roof = ROOFS[o.roof || ['tile', 'thatch', 'slate', 'shingle'][Math.floor(v(15) * 4)]];
    for (let i = 0; i < 4; i++) P(x + w + i, y + 1 + i, 2, hh - 1, 'rgba(0,0,0,.08)');      // its shadow, thrown to the east
    P(x - 1, y + hh, w + 3, 2, 'rgba(0,0,0,.22)'); P(x, y, w, hh, wall); P(x, y, 1, hh, tint(wall, 1.08)); P(x + w - 1, y, 1, hh, tint(wall, 0.84));
    P(x + Math.round(w * 0.66), y, w - Math.round(w * 0.66), hh, 'rgba(40,26,10,.10)'); P(x, y + hh - 1, w, 1, tint(wall, 0.8));      // the east end of the wall in shade, and the footing
    for (let i = 0; i < 3; i++) P(x + 1 + Math.floor(v(30 + i) * Math.max(1, w - 3)), y + 1 + Math.floor(v(33 + i) * Math.max(1, hh - 2)), 2, 1, tint(wall, i % 2 ? 0.92 : 1.06));      // what it is built of, showing
    if (v(16) > 0.45) { for (let i = 0; i < rh; i++) { P(x - 1 + i, y - 1 - i, w + 2 - i * 2, 1, i === rh - 1 ? roof[1] : i % 2 ? tint(roof[0], 0.92) : roof[0]); P(x - 1 + i + Math.round((w + 2 - i * 2) * 0.6), y - 1 - i, (w + 2 - i * 2) - Math.round((w + 2 - i * 2) * 0.6), 1, 'rgba(30,16,6,.16)'); } }
    else { P(x - 1, y - rh, w + 2, rh, roof[0]); P(x, y - rh - 1, w, 1, roof[1]); P(x - 1, y - 1, w + 2, 1, tint(roof[0], 0.82)); for (let q = 1; q < w + 1; q += 3) P(x - 1 + q, y - rh + 1, 1, rh - 2, tint(roof[0], 0.88)); P(x - 1 + Math.round((w + 2) * 0.62), y - rh, (w + 2) - Math.round((w + 2) * 0.62), rh, 'rgba(30,16,6,.16)'); }
    P(x, y, w, 1, 'rgba(30,16,6,.22)');      // the eaves, and their shade on the wall
    { const rg = wildRegion(x, y); if (rg === 'The High Fells') { P(x, y - rh - 1, w, 1, '#f4f6fa'); for (let q = 0; q < 3; q++) P(x + Math.floor(v(36 + q) * Math.max(1, w - 2)), y - rh + Math.floor(v(39 + q) * Math.max(1, rh - 1)), 2, 1, '#e8eef6'); P(x - 1, y + hh, 3, 1, '#f4f6fa'); }      // snow on the ridge and against the wall
      else if (rg === 'Blackmere' || rg === 'Greywood') for (let q = 0; q < 3; q++) P(x + Math.floor(v(36 + q) * Math.max(1, w - 2)), y - rh + Math.floor(v(39 + q) * Math.max(1, rh)), 2, 1, q % 2 ? '#6f8a5a' : '#5a7248');      // moss on the roof
      else if (rg === 'The Salt Shore') P(x, y + hh - 1, w, 1, '#e2d2a0'); }      // sand drifted along the foot of the wall
    const dx = x + 1 + Math.floor(v(17) * (w - 3)); P(dx, y + hh - 3, 2, 3, '#3a2416'); P(dx, y + hh - 4, 2, 1, tint(wall, 0.78)); P(dx, y + hh, 2, 1, tint(wall, 1.1));      // the door, its lintel and its step
    if (w > 8) { const wx2 = dx > x + w / 2 ? x + 1 : x + w - 3; P(wx2, y + 1, 2, 2, '#3a2a1c'); P(wx2, y + 3, 2, 1, tint(wall, 0.8)); }
    else if (w > 5 && hh > 4) { const wx2 = dx > x + w / 2 ? x + 1 : x + w - 2; P(wx2, y + 2, 1, 1, '#3a2a1c'); }
    if (P.at && o.smoke !== false) prov.lights.push({ x: P.at(dx + 1), y: y + hh - 2 });
    if (o.smoke !== false && v(18) > 0.4) { const ch = x + 1 + Math.floor(v(19) * (w - 3)); P(ch, y - rh - 2, 2, 3, '#8a8478'); if (P.at) prov.smokes.push({ x: P.at(ch + 1), y: y - rh - 3 }); }
    return { w, hh, rh };
  };
  const inReg = (kinds, regs) => (tx, ty) => on(kinds)(tx, ty) && regs.includes(wildRegion(tx * 10 + 5, ty * 10 + 5));
  const edgeOfWood = (tx, ty) => on(GR)(tx, ty) && [[0, -1], [0, -2], [-1, 0], [3, 0], [1, -2]].some(([dx, dy]) => at(tx + dx, ty + dy) === T_FOREST);
  const DWELL = [
    [5, "A shepherd's hut", (tx, ty) => on([T_HILL, T_GRASS])(tx, ty) && at(tx, ty) === T_HILL, (x, y, P, v) => { cot(P, v, x + 1, y + 3, { w: 5 + Math.floor(v(1) * 2), h: 4, roof: 'turf', wall: '#a89c88' }); const pw = 8 + Math.floor(v(2) * 4); P(x + 10, y + 2, pw, 1, '#a8a090'); P(x + 10, y + 9, pw, 1, '#a8a090'); P(x + 10, y + 2, 1, 8, '#c8c2b2'); P(x + 9 + pw, y + 2, 1, 4 + Math.floor(v(3) * 2), '#a8a090'); for (let q = 0; q < 1 + Math.floor(v(4) * 3); q++) { P(x + 12 + q * 2, y + 5 + (q % 2) * 2, 2, 1, '#f1ead8'); P(x + 12 + q * 2, y + 5 + (q % 2) * 2, 1, 1, '#3a2a1c'); } }],
    [5, "A woodcutter's cabin", edgeOfWood, (x, y, P, v) => { const c = cot(P, v, x + 2, y + 3, { wall: '#7a5a34', roof: v(1) > 0.5 ? 'shingle' : 'turf' }); for (let q = 1; q < c.hh; q += 2) P(x + 3, y + 3 + q, c.w - 2, 1, '#5a4326'); const px = x + 5 + c.w; P(px, y + 6, 5 + Math.floor(v(2) * 3), 3, '#8a6a3a'); for (let q = 0; q < 3; q++) P(px + 1 + q * 2, y + 7, 1, 1, '#c9a763'); P(px + 2, y + 10, 2, 2, '#6b4f2c'); P(px + 2, y + 10, 2, 1, '#c9a763'); if (v(3) > 0.5) { P(px + 4, y + 8, 1, 3, '#8a6a3a'); P(px + 4, y + 8, 2, 1, '#b8c0c8'); } }],
    [3, "A charcoal burner's clamp", (tx, ty) => on(FO)(tx, ty) || edgeOfWood(tx, ty), (x, y, P, v) => { const rw = 5 + Math.floor(v(1) * 2); P(x + 3 - 1, y + 9, rw * 2 + 3, 2, 'rgba(0,0,0,.25)'); for (let i = 0; i < 6; i++) { const w = Math.round(rw * Math.sqrt(1 - (i * i) / 40)); P(x + 3 + rw - w, y + 8 - i, w * 2, 1, i % 3 === 2 ? '#4a4038' : '#3a322c'); } P(x + 3 + rw - 1, y + 8, 2, 1, '#d8742a'); prov.smokes.push({ x: P.at(x + 3 + rw), y: y + 2 }); P(x + 6 + rw * 2, y + 6, 6, 3, '#6b4f2c'); P(x + 6 + rw * 2, y + 6, 6, 1, '#8a6a3a'); if (v(2) > 0.4) cot(P, v, x + 14 + rw, y + 1, { w: 5, h: 3, roof: 'turf', wall: '#7a5a34', smoke: false }); }],
    [4, "A fisherman's hut", (tx, ty) => on([T_SAND, T_GRASS])(tx, ty) && at(tx, ty) === T_SAND, (x, y, P, v) => { const c = cot(P, v, x + 2, y, { w: 6 + Math.floor(v(1) * 2), h: 4, roof: 'reed', wall: '#b89a6a', smoke: false }); P(x + 2, y + 4, 1, 4, '#5a4326'); P(x + 1 + c.w, y + 4, 1, 4, '#5a4326'); P(x + 4, y + 4, 1, 3, '#5a4326'); const nx = x + 5 + c.w; P(nx, y + 2, 1, 7, '#6b4f2c'); P(nx + 7, y + 2, 1, 7, '#6b4f2c'); for (let q = 0; q < 3; q++) P(nx + 1, y + 3 + q * 2, 6, 1, 'rgba(232,226,208,.7)'); for (let q = 0; q < 3; q++) P(nx + 2 + q * 2, y + 3, 1, 5, 'rgba(232,226,208,.5)'); if (v(2) > 0.4) { P(x + 3, y + 10, 8, 2, '#6b4f2c'); P(x + 4, y + 9, 6, 1, '#8a6a3a'); } }],
    [3, 'A mill on the water', (tx, ty) => on(GR)(tx, ty) && wet(at(tx + 3, ty)) && !wet(at(tx + 3, ty - 3)), (x, y, P, v) => { const c = cot(P, v, x + 2, y, { w: 10 + Math.floor(v(1) * 3), h: 7 }); const wx = x + 3 + c.w; P(wx, y, 8, 8, '#5a4326'); P(wx + 1, y + 1, 6, 6, '#6fa8c8'); P(wx + 3, y, 2, 8, '#7a5a34'); P(wx, y + 3, 8, 2, '#7a5a34'); P(wx + 3, y + 3, 2, 2, '#3a2a1c'); P(wx, y + 8, 8, 1, '#e6f3fa'); if (v(2) > 0.5) { P(x - 2, y + 6, 4, 3, '#e8dcc0'); P(x - 2, y + 6, 4, 1, '#f4ecd8'); } }],
    [3, 'A windmill', (tx, ty) => on([T_HILL, T_GRASS])(tx, ty) && [[0, 1], [1, 1], [-1, 0], [3, 0]].some(([dx, dy]) => at(tx + dx, ty + dy) === T_HILL), (x, y, P, v) => { const tw = v(1) > 0.5 ? '#d8cdb6' : '#b8ab94'; P(x + 3, y + 9, 12, 2, 'rgba(0,0,0,.22)'); for (let i = 0; i < 15; i++) { const w = 5 + Math.floor(i / 5); P(x + 9 - w + (w >> 1), y - 6 + i, w, 1, tw); P(x + 9 - w + (w >> 1), y - 6 + i, 1, 1, tint(tw, 1.1)); } P(x + 6, y - 9, 6, 3, v(2) > 0.5 ? '#a8482a' : '#6b4f2c'); P(x + 8, y + 6, 2, 3, '#3a2416'); const hx = x + 8, hy = y - 5, plus = v(3) > 0.5; for (let i = 1; i < 8; i++) { if (plus) { P(hx + i, hy, 1, 1, '#6b4f2c'); P(hx - i, hy, 1, 1, '#6b4f2c'); P(hx, hy + i, 1, 1, '#6b4f2c'); P(hx, hy - i, 1, 1, '#6b4f2c'); if (i > 2) { P(hx + i, hy + 1, 1, 1, '#f1ead8'); P(hx - i, hy - 1, 1, 1, '#f1ead8'); P(hx + 1, hy - i, 1, 1, '#f1ead8'); P(hx - 1, hy + i, 1, 1, '#f1ead8'); } } else { P(hx + i, hy - i, 1, 1, '#6b4f2c'); P(hx - i, hy + i, 1, 1, '#6b4f2c'); P(hx + i, hy + i, 1, 1, '#6b4f2c'); P(hx - i, hy - i, 1, 1, '#6b4f2c'); if (i > 2) { P(hx + i, hy - i + 1, 1, 1, '#f1ead8'); P(hx - i, hy + i - 1, 1, 1, '#f1ead8'); P(hx + i - 1, hy + i, 1, 1, '#f1ead8'); P(hx - i + 1, hy - i, 1, 1, '#f1ead8'); } } } P(hx, hy, 1, 1, '#3a2a1c'); }],
    [4, 'A field barn', inReg(GR, ['The Long Meadows', 'The Home Fields', 'The Barrow Downs']), (x, y, P, v) => { const c = cot(P, v, x + 1, y + 1, { w: 12 + Math.floor(v(1) * 4), h: 6, roof: v(2) > 0.5 ? 'thatch' : 'shingle', wall: v(3) > 0.5 ? '#8a6a3a' : '#b8ab94', smoke: false }); P(x + 4, y + 3, 4, 4, '#3a2416'); P(x + 5, y + 3, 1, 4, '#5a4326'); const rx = x + 4 + c.w; if (v(4) > 0.5) { P(rx, y + 3, 6, 5, '#d9c070'); P(rx + 1, y + 2, 4, 1, '#e6d088'); P(rx, y + 8, 7, 1, 'rgba(0,0,0,.18)'); } else { P(rx, y + 5, 7, 2, '#8a6a3a'); P(rx + 7, y + 6, 3, 1, '#6b4f2c'); P(rx + 1, y + 7, 2, 2, '#3a2a1c'); P(rx + 4, y + 7, 2, 2, '#3a2a1c'); P(rx + 1, y + 3, 5, 2, '#d9c070'); } }],
    [3, "A peat cutter's hut", inReg(MS, ['Blackmere']), (x, y, P, v) => { cot(P, v, x + 1, y + 2, { w: 6, h: 4, roof: 'turf', wall: '#6a5a44' }); const px = x + 10; P(px, y + 6, 9 + Math.floor(v(1) * 4), 3, '#241c16'); P(px + 1, y + 7, 6, 1, '#3d5a52'); for (let q = 0; q < 2 + Math.floor(v(2) * 3); q++) { P(px + q * 4, y + 1, 3, 4, '#3a2e24'); P(px + q * 4, y + 1, 3, 1, '#5a4a3a'); P(px + q * 4, y + 3, 3, 1, '#2a2018'); } }],
    [3, 'A lime kiln', inReg(HL, ['The Quarry Hills']), (x, y, P, v) => { P(x + 1, y + 9, 12, 2, 'rgba(0,0,0,.22)'); P(x + 2, y - 1, 9, 10, '#b8b0a0'); P(x + 2, y - 1, 2, 10, '#d0c8b8'); P(x + 3, y - 2, 7, 1, '#8f8876'); P(x + 5, y + 5, 3, 4, '#2a1c14'); P(x + 5, y + 7, 3, 2, '#e2702a'); P(x + 6, y + 6, 1, 1, '#f0c040'); prov.smokes.push({ x: P.at(x + 6), y: y - 3 }); for (let q = 0; q < 2 + Math.floor(v(1) * 3); q++) { P(x + 13 + q * 3, y + 6 - (q % 2) * 2, 3, 3, '#f0ece0'); P(x + 13 + q * 3, y + 8 - (q % 2) * 2, 3, 1, '#c8c2b2'); } if (v(2) > 0.5) cot(P, v, x + 14, y - 4, { w: 6, h: 4, roof: 'slate', wall: '#b8ab94', smoke: false }); }],
    [4, 'A wayside inn', (tx, ty) => on(GR)(tx, ty) && byRoad(tx, ty), (x, y, P, v) => { const c = cot(P, v, x + 1, y - 2, { w: 10 + Math.floor(v(1) * 4), h: 9, roof: v(2) > 0.5 ? 'tile' : 'slate' }); P(x + 3, y, 2, 2, '#3a2a1c'); P(x + 7, y, 2, 2, '#e8c060'); const sx = x + 3 + c.w; P(sx, y - 3, 1, 10, '#5a4326'); P(sx, y - 3, 5, 1, '#5a4326'); P(sx + 2, y - 2, 3, 3, ['#c23b2e', '#3a6ea8', '#c9a21e', '#35602b'][Math.floor(v(3) * 4)]); P(sx + 3, y - 1, 1, 1, '#f1ead8'); P(sx + 2, y + 6, 6, 2, '#6b4f2c'); P(sx + 3, y + 6, 4, 1, '#6fa8c8'); if (v(4) > 0.5) { P(sx + 9, y + 3, 5, 3, '#7a5234'); P(sx + 13, y + 1, 2, 3, '#7a5234'); P(sx + 9, y + 6, 1, 2, '#5a3a24'); P(sx + 13, y + 6, 1, 2, '#5a3a24'); } }],
    [2, "A hermit's cell", (tx, ty) => on([T_HILL, T_GRASS])(tx, ty) && [[0, -2], [1, -2], [2, -2], [1, -3]].some(([dx, dy]) => at(tx + dx, ty + dy) === T_PEAK) && ![1, 2, 3, 4].some(dy => [-2, -1, 0, 1, 2, 3, 4].some(dx => at(tx + dx, ty + dy) === T_PEAK)), (x, y, P, v) => { const c = cot(P, v, x + 3, y + 3, { w: 5, h: 4, roof: 'slate', wall: '#a8a090', smoke: false }); P(x + 5, y - 3 - c.rh + 3, 1, 3, '#d8d2c0'); P(x + 4, y - 2 - c.rh + 3, 3, 1, '#d8d2c0'); P(x + 10, y + 5, 6, 4, '#6a5a3a'); for (let q = 0; q < 3; q++) P(x + 11 + q * 2, y + 6 + (q % 2), 1, 2, '#55803a'); P(x + 17, y + 7, 2, 2, '#8a8478'); }],
    [3, "A beekeeper's cottage", (tx, ty) => on([T_MEADOW, T_GRASS])(tx, ty) && at(tx, ty) === T_MEADOW, (x, y, P, v) => { const c = cot(P, v, x + 1, y + 1, { roof: 'thatch' }); const bx = x + 4 + c.w; for (let q = 0; q < 3 + Math.floor(v(1) * 3); q++) { P(bx + q * 4, y + 5, 3, 4, '#c9a763'); P(bx + q * 4 + 1, y + 4, 1, 1, '#c9a763'); P(bx + q * 4, y + 6, 3, 1, '#a8853f'); P(bx + q * 4 + 1, y + 8, 1, 1, '#2a1c14'); } P(bx, y + 9, 16, 1, '#8a6a3a'); for (let q = 0; q < 4; q++) P(bx + Math.floor(v(5 + q) * 14), y + Math.floor(v(9 + q) * 4), 1, 1, '#2a1c14'); }],
    [3, 'A vineyard house', inReg(GR, ['The Salt Shore', 'The Quarry Hills', 'The Home Fields']), (x, y, P, v) => { const c = cot(P, v, x + 1, y, { roof: 'tile', wall: '#f0e8d6' }); const vx = x + 4 + c.w; for (let r0 = 0; r0 < 3; r0++) { P(vx, y + 1 + r0 * 4, 14, 1, '#6b4f2c'); for (let q = 0; q < 14; q += 3) { P(vx + q, y - 1 + r0 * 4, 2, 2, '#4f7a3a'); if (v(q + r0 * 5) > 0.5) P(vx + q + 1, y + 1 + r0 * 4, 1, 1, '#6a3a7a'); } } if (v(2) > 0.5) { P(x + 2, y + 8, 4, 3, '#8a5a34'); P(x + 2, y + 9, 4, 1, '#5a3a24'); } }],
    [4, 'A house fallen in', on(GR), (x, y, P, v) => { const w = 9 + Math.floor(v(1) * 5), wc = v(2) > 0.5 ? '#b8ab94' : '#cdbd94'; P(x + 1, y + 8, w + 2, 2, 'rgba(0,0,0,.2)'); P(x + 2, y + 2 + Math.floor(v(3) * 3), 1, 7, wc); P(x + 1 + w, y + 4 + Math.floor(v(4) * 3), 1, 5, wc); P(x + 2, y + 8, w, 1, wc); for (let q = 0; q < w; q += 2) if (v(5 + q) > 0.35) P(x + 2 + q, y + 2 + Math.floor(v(20 + q) * 4), 2, 6 - Math.floor(v(20 + q) * 4), tint(wc, 0.9)); P(x + 4, y + 6, 2, 3, '#2a1d12'); for (let q = 0; q < 4; q++) P(x + 2 + Math.floor(v(30 + q) * w), y + 3 + Math.floor(v(34 + q) * 4), 2, 2, '#4c7f38'); for (let q = 0; q < 3; q++) P(x + 4 + w + q * 2, y + 8 - (q % 2), 2, 1, '#a39a8a'); if (v(6) > 0.5) { P(x + 3 + (w >> 1), y - 2, 1, 5, '#5a5046'); P(x + 4 + (w >> 1), y - 1, 2, 1, '#5a5046'); } }],
  ];
  DWELL.forEach(([count, name, ok, draw], kn) => { for (let q = 0; q < count; q++) dwell(4000 + kn * 37 + q * 11, ok, name, draw); });
  // The aqueduct that waters the town. It takes its water where the river comes out of the mountains, far to the
  // north-east, and brings it the whole way on arches: straight across the country, over road and river, through the
  // woods, to the town's north wall.
  { const ax = WILD.TOWN.x - 36, top = WILD.TOWN.y - 30;
    let src = null, bd = 1e9;                    // the nearest place where the river runs between peaks
    for (let ty = 2; ty < TH - 2; ty++) for (let tx = 2; tx < TW - 2; tx++) {
      if (at(tx, ty) !== T_WATER) continue;
      let pk = 0, wt = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const k = at(tx + dx, ty + dy); if (k === T_PEAK) pk++; else if (k === T_WATER) wt++; }
      const d = Math.hypot(tx * 10 - WILD.TOWN.x, ty * 10 - WILD.TOWN.y);
      if (pk >= 3 && wt <= 12 && d < bd) { bd = d; src = [tx * 10 + 5, ty * 10 + 5]; }
    }
    const pts = [[ax + 2, top - 6], [ax + 2, top - 84]]; if (src) pts.push(src);      // north out of the town, then straight for the source
    let run = 0;
    for (let q = 0; q < pts.length - 1; q++) {
      const [x0, y0] = pts[q], [x1, y1] = pts[q + 1], len = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(len);
      for (let i2 = 0; i2 < n; i2++, run++) {
        const px = Math.round(x0 + (x1 - x0) * i2 / n), py = Math.round(y0 + (y1 - y0) * i2 / n), k = at(Math.floor(px / 10), Math.floor(py / 10)), pier = run % 9 === 0, open = k === T_WATER || k === T_ROAD || k === T_BRIDGE, r2 = run;
        const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0) * 1.5;      // a stretch running north and south is seen end on: its deck, and its shadow thrown to the east
        const slice = () => {
          if (pier && !open) { R(px - 2, py + 6, 8, 2, 'rgba(0,0,0,.2)'); R(px - 2, py - 6, 4, 12, '#c9c2ae'); R(px - 2, py - 6, 1, 12, '#e4dfcd'); R(px + 1, py - 6, 1, 12, '#a39a84'); R(px - 2, py + 5, 4, 1, '#8f8876'); }
          else if (steep) R(px + 3, py + 2, 4, 1, 'rgba(0,0,0,.13)');
          else if (r2 % 3 === 0) R(px - 1, py + 1, 3, 1, 'rgba(0,0,0,.10)');                                                  // the shadow of the channel across the ground
          // the channel: its far wall, the bed, its near wall with the light on the coping, and the face of the stone below
          R(px - 2, py - 11, 4, 1, '#f0e8d6'); R(px - 2, py - 10, 4, 1, '#b8b09a'); R(px - 2, py - 9, 4, 1, '#e4dfcd'); R(px - 2, py - 8, 4, 1, r2 % 5 === 2 ? '#c2baa4' : '#cdc6b2'); R(px - 2, py - 7, 4, 1, '#a39a84');
          R(px - 2, py - 11, 1, 5, '#e9e3d0'); R(px + 1, py - 11, 1, 5, '#a8a08a');                                            // and its two walls, where it runs away from you
          if (!pier && r2 % 9 >= 3 && r2 % 9 <= 5) R(px - 2, py - 6, 4, 1, 'rgba(60,50,40,.45)');                              // the head of each arch, in shade
          if (!pier && (r2 % 9 === 1 || r2 % 9 === 8)) R(px - 2, py - 6, 4, 2, '#b8b09a');                                     // the spring of the arch off its pier
          if (open && pier) { R(px - 2, py - 6, 4, 3, '#c9c2ae'); }                                                            // a longer span where it crosses a road or the river
          if (r2 % 61 === 30 && !open) { R(px - 2, py - 3, 1, 5, '#7f8a6a'); R(px - 1, py - 1, 1, 3, '#7f8a6a'); }             // a stain where it leaks
        };
        // the water in it, laid after the stone of the stretch beyond so that it shows the whole way along
        const water = () => { R(px - 1, py - 10, 2, 1, r2 % 7 < 3 ? '#5a9cc6' : '#6fa8c8'); if (r2 % 11 === 4) R(px - 1, py - 10, 1, 1, '#9ccbe8'); };
        feats.push({ y: py + 6, d: slice }); feats.push({ y: py + 11.5, d: water }); overs.push({ x0: px - 2, x1: px + 2, y0: py - 11, base: py + 6, d: slice }); overs.push({ x0: px - 2, x1: px + 2, y0: py - 11, base: py + 11.5, d: water, wet: true });
      }
    }
    if (src) feats.push({ y: src[1] + 8, d: () => { const [sx, sy] = src; R(sx - 7, sy + 5, 16, 2, 'rgba(0,0,0,.22)'); R(sx - 6, sy - 8, 13, 13, '#d8d2c0'); R(sx - 6, sy - 8, 13, 1, '#f0e8d6'); R(sx - 6, sy - 8, 1, 13, '#e4dfcd'); R(sx + 6, sy - 8, 1, 13, '#a39a84'); R(sx - 4, sy - 6, 9, 6, '#4f86ae'); R(sx - 3, sy - 6, 6, 1, '#b4d6ea'); R(sx - 2, sy + 1, 5, 4, '#3a2a1c'); R(sx - 7, sy - 10, 15, 2, '#b5522e'); R(sx - 7, sy - 10, 15, 1, '#d06a3e'); } });      // the water-house at the source: a tank under a tiled roof, and the sluice
    prov.aqueduct = src; prov.aqLine = pts;
  }
  const OUT = [
    (x, y, P, v) => cot(P, v, x + 1, y + 4, { w: 5 + Math.floor(v(1) * 3), h: 4 }),
    (x, y, P, v) => { const c = [['#c23b2e', '#f1ead8'], ['#3a6ea8', '#f1ead8'], ['#c9a21e', '#8a4a2a'], ['#35602b', '#e8d8a0'], ['#8a4a8a', '#f1ead8']][Math.floor(v(1) * 5)]; P(x + 1, y + 9, 9, 1, 'rgba(0,0,0,.2)'); P(x + 1, y + 2, 1, 7, '#5a4326'); P(x + 8, y + 2, 1, 7, '#5a4326'); for (let i = 0; i < 8; i += 2) { P(x + 1 + i, y + 1, 2, 2, c[(i >> 1) % 2]); P(x + 1 + i, y + 3, 2, 1, tint(c[(i >> 1) % 2], 0.8)); } P(x + 1, y + 6, 8, 2, '#8a6a3a'); for (let q = 0; q < 3; q++) P(x + 2 + q * 2, y + 5, 1, 1, ['#d8382a', '#e8c040', '#55803a', '#b5522e'][Math.floor(v(2 + q) * 4)]); },      // a stall under its awning
    (x, y, P, v) => { const c = ['#e8dcc0', '#c9b890', '#b89a6a', '#d8c4a0'][Math.floor(v(1) * 4)]; P(x, y + 9, 10, 1, 'rgba(0,0,0,.2)'); for (let i = 0; i < 6; i++) P(x + 4 - i, y + 3 + i, i * 2 + 2, 1, i % 3 === 2 ? tint(c, 0.86) : c); P(x + 4, y + 6, 2, 3, '#2a1d12'); P(x + 4, y + 1, 1, 2, '#5a4326'); },      // a tent
    (x, y, P, v) => { P(x + 1, y + 9, 8, 1, 'rgba(0,0,0,.2)'); for (let i = 0; i < 5; i++) { const w = 2 + Math.min(2, i); P(x + 4 - w, y + 4 + i, w * 2, 1, i % 2 ? '#a8482a' : '#b5522e'); } P(x + 3, y + 7, 2, 2, '#2a1c14'); P(x + 3, y + 8, 2, 1, '#e2702a'); P(x + 4, y + 2, 1, 1, 'rgba(216,212,204,.7)'); for (let q = 0; q < 2 + Math.floor(v(1) * 2); q++) { P(x + 8 + q * 2, y + 7, 1, 2, '#b5522e'); P(x + 8 + q * 2, y + 6, 1, 1, '#8a3a22'); } },      // a potter's kiln, and what came out of it
    (x, y, P, v) => { P(x + 2, y + 9, 7, 1, 'rgba(0,0,0,.2)'); P(x + 2, y + 6, 6, 3, '#b8ab94'); P(x + 2, y + 6, 6, 1, '#d8cdb6'); P(x + 3, y + 7, 4, 1, '#4f8fb8'); P(x + 2, y + 2, 1, 4, '#6b4f2c'); P(x + 7, y + 2, 1, 4, '#6b4f2c'); P(x + 1, y + 1, 8, 1, v(1) > 0.5 ? '#a8482a' : '#6b4f2c'); P(x + 5, y + 2, 1, 3, '#8a7a5c'); },      // a well
    (x, y, P, v) => { P(x + 1, y + 9, 9, 1, 'rgba(0,0,0,.2)'); P(x + 1, y + 5, 7, 2, '#8a6a3a'); P(x + 8, y + 6, 3, 1, '#6b4f2c'); P(x + 2, y + 7, 2, 2, '#3a2a1c'); P(x + 5, y + 7, 2, 2, '#3a2a1c'); if (v(1) > 0.5) { P(x + 1, y + 2, 7, 3, '#d9c070'); P(x + 2, y + 1, 5, 1, '#e6d088'); } else for (let q = 0; q < 3; q++) { P(x + 2 + q * 2, y + 2, 1, 3, '#b5522e'); P(x + 2 + q * 2, y + 1, 1, 1, '#8a3a22'); } },      // a cart, loaded
    (x, y, P, v) => { P(x, y + 3, 10, 1, '#8a6a3a'); P(x, y + 9, 10, 1, '#8a6a3a'); for (let i = 0; i < 10; i += 3) { P(x + i, y + 2, 1, 3, '#6b4f2c'); P(x + i, y + 8, 1, 3, '#6b4f2c'); } P(x, y + 3, 1, 7, '#8a6a3a'); P(x + 9, y + 3, 1, 7, '#8a6a3a'); for (let q = 0; q < 1 + Math.floor(v(1) * 3); q++) { const pg = v(2) > 0.5; P(x + 2 + q * 2, y + 5 + (q % 2) * 2, 3, 2, pg ? '#e0a8a0' : '#f1ead8'); P(x + 2 + q * 2, y + 5 + (q % 2) * 2, 1, 1, pg ? '#c88880' : '#3a2a1c'); } },      // a pen, pigs or goats in it
    (x, y, P, v) => { P(x + 1, y + 2, 1, 8, '#6b4f2c'); P(x + 9, y + 2, 1, 8, '#6b4f2c'); P(x + 1, y + 3, 9, 1, '#c8c0a8'); for (let q = 0; q < 3; q++) P(x + 2 + q * 2 + Math.floor(v(1) * 2), y + 4, 2, 2 + Math.floor(v(2 + q) * 2), ['#f1ead8', '#c23b2e', '#3a6ea8', '#c9a21e', '#e8d8a0'][Math.floor(v(5 + q) * 5)]); },      // washing out to dry
    (x, y, P, v) => { P(x + 1, y + 2, 9, 7, '#7a6a48'); for (let r0 = 0; r0 < 3; r0++) for (let q = 0; q < 4; q++) { P(x + 2 + q * 2, y + 3 + r0 * 2, 1, 1, r0 === Math.floor(v(1) * 3) ? '#8fb865' : '#4f7a3a'); } P(x + 1, y + 2, 9, 1, '#6b4f2c'); P(x + 1, y + 2, 1, 7, '#6b4f2c'); if (v(2) > 0.5) P(x + 8, y + 4, 1, 3, '#d8382a'); },      // a kitchen garden
    (x, y, P, v) => { P(x + 1, y + 9, 9, 1, 'rgba(0,0,0,.2)'); for (let q = 0; q < 3 + Math.floor(v(1) * 3); q++) { const ax = x + 1 + (q % 3) * 3, ay = y + 6 - Math.floor(q / 3) * 3; P(ax, ay, 2, 3, q % 2 ? '#b5522e' : '#a8482a'); P(ax, ay - 1, 2, 1, '#8a3a22'); P(ax, ay + 1, 1, 1, '#c8683e'); } },      // jars stacked for the wine ships
    (x, y, P, v) => { P(x, y + 9, 10, 1, 'rgba(0,0,0,.2)'); P(x + 1, y + 3, 1, 6, '#5a4326'); P(x + 8, y + 3, 1, 6, '#5a4326'); P(x, y + 2, 10, 2, '#3a322c'); P(x, y + 2, 10, 1, '#5a5046'); P(x + 2, y + 6, 3, 3, '#6e6a62'); P(x + 3, y + 7, 1, 1, '#e2702a'); P(x + 6, y + 7, 2, 1, '#3a3a40'); P(x + 6, y + 8, 1, 1, '#3a3a40'); },      // a smithy under a lean-to
    (x, y, P, v) => { P(x + 2, y + 9, 6, 1, 'rgba(0,0,0,.2)'); P(x + 3, y + 4, 4, 5, '#e8e2d2'); P(x + 6, y + 4, 1, 5, '#c9c2ae'); P(x + 2, y + 3, 6, 1, '#d8d2c0'); P(x + 2, y + 8, 6, 1, '#d8d2c0'); P(x + 4, y + 2, 2, 1, v(1) > 0.5 ? '#e2702a' : '#5a8a46'); P(x + 4, y + 6, 1, 1, '#c23b2e'); },      // an altar by the way in
  ];
  for (let dy = -7; dy <= 6; dy++) for (let dx = -9; dx <= 6; dx++) {
    const tx = tx0 + dx, ty = ty0 + dy, k = at(tx, ty);
    if (inTown(tx, ty, 5) || !inTown(tx, ty, 30) || (k !== T_GRASS && k !== T_MEADOW) || farm(tx, ty) || h(tx, ty, 1150) > 0.62) continue;
    if (Math.abs(tx * 10 + 5 - STABLES.x) < 30 && Math.abs(ty * 10 + 5 - STABLES.y) < 18) continue;      // the school's stables stand here
    const kind = Math.floor(h(tx, ty, 1151) * OUT.length), x = tx * 10, y = ty * 10, flip = h(tx, ty, 1152) > 0.5, P = (px, py, w, hh, c) => R(flip ? 2 * x + 10 - px - w : px, py, w, hh, c), v = q => h(tx, ty, 1153 + q);
    P.at = px => flip ? 2 * x + 10 - px : px;
    feats.push({ y: y + 9, d: () => OUT[kind](x, y, P, v) });
  }
  prov.marks = marks;
  // each road, as the run of its own tiles from one end to the other, so that travellers keep to it
  prov.ways = WILD_ROADS.filter(q => q.length >= 3).map(poly => {
    const pts = [];
    for (let i = 0; i + 1 < poly.length; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[i + 1], n = Math.max(1, Math.abs(bx - ax), Math.abs(by - ay));
      for (let q = 0; q <= n; q++) {
        const tx = Math.round(ax + (bx - ax) * q / n), ty = Math.round(ay + (by - ay) * q / n);
        let best = null, bd = 9;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const o = at(tx + dx, ty + dy); if ((o === T_ROAD || o === T_BRIDGE) && dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = [tx + dx, ty + dy]; } }
        if (!best) continue;
        const pt = [best[0] * 10 + 5, best[1] * 10 + 5], last = pts[pts.length - 1];
        if (!last || last[0] !== pt[0] || last[1] !== pt[1]) pts.push(pt);
      }
    }
    return pts;
  }).filter(w => w.length > 12);
  prov.birds = [];
  for (const m of marks) {
    if (m.name === 'An old battlefield' || m.name === 'The gallows') prov.birds.push({ x: m.x + m.r, y: m.y - 14, kind: 'crow', n: 3, r: 16 });
    else if (m.name === 'The eagle rock') prov.birds.push({ x: m.x + 8, y: m.y - 30, kind: 'eagle', n: 1, r: 34 });
    else if (m.name === 'The beacon' || m.name === 'A wreck on the strand' || m.name === 'The fishers\' huts') prov.birds.push({ x: m.x + m.r, y: m.y - 18, kind: 'gull', n: 3, r: 20 });
    else if (m.name === 'The drowned temple' || m.name === 'The bog oak') prov.birds.push({ x: m.x + m.r, y: m.y - 16, kind: 'crow', n: 2, r: 12 });
  }
  prov.boats.filter(q => !q[2]).slice(0, 5).forEach(([bx, by]) => prov.birds.push({ x: bx, y: by - 16, kind: 'gull', n: 2, r: 14 }));
  for (let ty = 3; ty < TH - 3; ty++) for (let tx = 3; tx < TW - 3; tx++) {      // a hawk hanging over the hills, swallows over the water, starlings over the fields, duck on the lakes, a heron in the marsh
    const c1 = h(tx, ty, 1280); if (c1 < 0.9965) continue;
    const k = at(tx, ty), x = tx * 10 + 5, y = ty * 10 + 5, c2 = h(tx, ty, 1281), sdv = shoreD[ty * TW + tx];
    if (prov.birds.length > 60 || prov.birds.some(q => Math.hypot(q.x - x, q.y - y) < 130)) continue;
    if (k === T_HILL) { if (c2 > 0.55) prov.birds.push({ x, y: y - 22, kind: 'kestrel', n: 1, r: 30 }); }
    else if (k === T_WATER && sdv <= 2) prov.birds.push({ x, y: y - 6, kind: 'swallow', n: 2 + Math.floor(c2 * 3), r: 18 });
    else if (k === T_WATER && sdv >= 3 && tx > 16 && !seaM[ty * TW + tx]) prov.birds.push({ x, y: y - 14, kind: 'duck', n: 3 + Math.floor(c2 * 4), r: 40 });
    else if (k === T_MEADOW || k === T_GRASS) { if (c2 > 0.72) prov.birds.push({ x, y: y - 26, kind: 'starling', n: 10 + Math.floor(c2 * 10), r: 34 }); }
    else if (k === T_MARSH) prov.birds.push({ x, y: y - 16, kind: 'heron', n: 1, r: 36 });
  }
  const nearMark = (cx, cy) => marks.some(m => cx > m.x - 6 && cx < m.x + m.r * 2 + 4 && cy > m.y - m.r * 1.6 && cy < m.y + 16);

  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const k = at(tx, ty), x = tx * 10, y = ty * 10, a = h(tx, ty, 60), b = h(tx, ty, 61);
    if (k === T_FOREST) {
      const reg = wildRegion(x + 5, y + 5), edge = at(tx - 1, ty) !== T_FOREST || at(tx + 1, ty) !== T_FOREST || at(tx, ty - 1) !== T_FOREST || at(tx, ty + 1) !== T_FOREST;
      const glade = !edge && wildNoise(tx / 4, ty / 4, 77) < 0.13;
      if (glade) {                               // a clearing: stumps, a log, toadstools, sun on the grass
        feats.push({ y: y + 5, d: () => {
          if (a > 0.86) { R(x + 3, y + 5, 3, 2, '#6b4f2c'); R(x + 3, y + 5, 3, 1, '#c9a763'); }                                         // a stump
          else if (a > 0.74) logs(x, y, tx, ty, ['#5a4326', '#7a5a34', '#c9a763']);          // a log
          else if (a > 0.68) { R(x + 4, y + 6, 1, 2, '#f1ead8'); R(x + 3, y + 5, 3, 1, '#c23b2e'); }                                     // a toadstool
          else if (a > 0.4) for (let q = 0; q < 3; q++) R(x + Math.floor(h(tx, ty, 78 + q) * 9), y + Math.floor(h(tx, ty, 82 + q) * 9), 1, 1, q % 2 ? '#f2e6a0' : '#f4f4f0');      // flowers in the sun
        } });
        continue;
      }
      // A wood is not one thing all through. It grows in stands, each led by one kind of tree; here it is old and
      // the trees are few and great, there it is a thicket; in places the leaf has turned, the canopy opens over
      // fern and bluebell, or a patch has burned, blown down or drowned.
      const stand = Math.max(0, Math.min(0.999, (wildNoise(tx / 9, ty / 9, 871) - 0.5) * 2.4 + 0.5)), lead = species(tx, ty, reg, (Math.floor(stand * 7) + 0.5) / 7);
      const age = wildNoise(tx / 7, ty / 7, 872), turn = wildNoise(tx / 11, ty / 11, 873), blight = wildNoise(tx / 5, ty / 5, 874), thin = wildNoise(tx / 6, ty / 6, 875);
      if (!edge && blight < WOOD.blight) {
        const what = reg === 'Blackmere' ? 'drowned' : wildNoise(tx / 22, ty / 22, 877) > 0.5 ? 'burnt' : 'blown', c1 = h(tx, ty, 886), c2 = h(tx, ty, 887);
        feats.push({ y: y - 14, d: () => {
          if (what === 'burnt') { R(x, y, 10, 10, 'rgba(34,26,20,.42)'); for (let q = 0; q < 3; q++) R(x + Math.floor(h(tx, ty, 888 + q) * 9), y + Math.floor(h(tx, ty, 891 + q) * 9), 2, 1, q % 2 ? '#1e1a16' : '#8a8478'); }
          else if (what === 'drowned') { R(x, y, 10, 10, '#3d5a52'); R(x + 1 + Math.floor(c1 * 3), y + 2 + Math.floor(c2 * 4), 5 + Math.floor(c2 * 3), 3, '#4f7470'); R(x + 2 + Math.floor(c1 * 4), y + 3 + Math.floor(c2 * 4), 3, 1, '#7a9a98'); }
          else R(x, y, 10, 10, 'rgba(120,110,60,.18)');
        } });
        const cx = x + 2 + Math.floor(c1 * 6), cy = y + 4 + Math.floor(c2 * 5);
        if (what === 'burnt') {
          if (a < 0.4) feats.push({ y: cy, d: () => tree(cx, cy, 'burnt', 2 + Math.floor(b * 4), 1) });
          else if (a < 0.62) feats.push({ y: cy, d: () => { R(cx, cy - 2, 2, 3, '#2a2420'); R(cx, cy - 2, 2, 1, '#4a4038'); } });                                 // a charred stump
          else if (a < 0.78) feats.push({ y: cy, d: () => { R(cx - 3, cy, 7, 2, '#241f1b'); R(cx - 3, cy, 7, 1, '#3a322c'); if (b > 0.5) R(cx + 1, cy - 1, 1, 1, '#d8742a'); } });   // a fallen trunk, an ember in it yet
          else if (a > 0.9) feats.push({ y: cy, d: () => { for (let q = 0; q < 3; q++) { R(cx - 3 + q * 3, cy - 2 - (q % 2), 1, 3, '#5f9a46'); R(cx - 3 + q * 3, cy - 3 - (q % 2), 1, 1, '#d070a0'); } } });      // fireweed, first to come back
        } else if (what === 'drowned') {
          if (a < 0.5) feats.push({ y: cy, d: () => { tree(cx, cy, 'dead', 2 + Math.floor(b * 4), 1); R(cx - 2, cy + 1, 5, 1, '#7a9a98'); } });
          else if (a < 0.75) feats.push({ y: cy, d: () => { for (let q = 0; q < 3; q++) R(cx - 3 + q * 2 + Math.floor(b * 2), cy - 3 - (q % 2), 1, 4 + (q % 2), q % 2 ? '#8a9a4a' : '#9aaa5a'); R(cx - 3 + Math.floor(b * 2), cy - 4, 1, 2, '#6b4a2a'); } });
          else if (a > 0.9) feats.push({ y: cy, d: () => { R(cx - 3, cy, 7, 2, '#4a4030'); R(cx - 3, cy, 7, 1, '#6f8a4a'); } });                                    // a trunk gone over, green with moss
        } else {                                 // blown down: the trunks all lie one way, root plates in the air
          const dir = wildNoise(tx / 22, ty / 22, 879) > 0.5 ? 1 : -1;
          if (a < 0.55) feats.push({ y: cy, d: () => { const len = 6 + Math.floor(b * 5); for (let q = 0; q < len; q++) R(cx + dir * q, cy - Math.floor(q / 4), 1, 2, q % 4 === 3 ? '#5a4326' : '#7a5a34'); R(cx - dir, cy - 3, 2, 5, '#4a3320'); R(cx - dir * 2, cy - 2, 1, 3, '#6b4f2c'); for (let q = 0; q < 3; q++) R(cx + dir * (len - 1 + q), cy - 3 - Math.floor(len / 4) + q * 2, 2, 2, '#4c7f38'); } });
          else if (a < 0.72) feats.push({ y: cy, d: () => tree(cx, cy, lead === 'dead' ? 'oak' : lead, 2, 1.05) });                                                   // what came up in the light
          else if (a < 0.84) feats.push({ y: cy, d: () => { R(cx, cy - 4, 2, 5, '#6b4f2c'); R(cx, cy - 5, 1, 1, '#c9a763'); R(cx + 1, cy - 6, 1, 2, '#c9a763'); } });      // a trunk snapped off short
        }
        continue;
      }
      const open = !edge && thin > WOOD.thin, old = !edge && !open && age > WOOD.old, young = !open && age < WOOD.young, fall = turn > WOOD.turn;
      if (open) {                                // light on the floor of the wood
        const fl = wildNoise(tx / 3, ty / 3, 878), c1 = h(tx, ty, 894), c2 = h(tx, ty, 895);
        feats.push({ y: y - 14, d: () => {
          R(x, y, 10, 10, 'rgba(240,240,170,.07)');
          if (a > 0.93) { const bx = x + 2 + Math.floor(c1 * 4), by = y + 4 + Math.floor(c2 * 3); R(bx - 1, by + 2, 6, 1, 'rgba(0,0,0,.2)'); R(bx, by, 4, 2, '#8a8478'); R(bx + 1, by - 1, 2, 1, '#a39a8a'); R(bx, by - 1 + (c1 > 0.5 ? 1 : 0), 2 + Math.floor(c2 * 2), 1, '#6f8a4a'); }      // a boulder under moss
          else if (a > 0.86) { const lx = x + Math.floor(c1 * 3); R(lx, y + 6, 7, 2, '#5a4326'); R(lx, y + 6, 3 + Math.floor(c2 * 4), 1, '#6f8a4a'); R(lx + 6, y + 6, 1, 2, '#c9a763'); }                                                 // a mossed log
          else if (a > 0.8) { const mx = x + 5, my = y + 5; for (let q = 0; q < 6; q++) R(mx + Math.round(Math.cos(q * 1.05 + c1) * 3), my + Math.round(Math.sin(q * 1.05 + c1) * 2), 1, 1, q % 2 ? '#e8dcc0' : '#c8a878'); }          // a ring of mushrooms
          else if (fall) for (let q = 0; q < 5; q++) R(x + Math.floor(h(tx, ty, 896 + q) * 9), y + Math.floor(h(tx, ty, 901 + q) * 9), 1 + (q % 2), 1, ['#b45f2c', '#d4a43a', '#8f4422'][q % 3]);                                      // leaves down
          else if (fl > 0.56) for (let q = 0; q < 6; q++) R(x + Math.floor(h(tx, ty, 896 + q) * 10), y + Math.floor(h(tx, ty, 901 + q) * 10), 1, 1, reg === 'Greywood' ? (q % 2 ? '#e8e4f0' : '#c8c0e0') : q % 3 ? '#7a8ad8' : '#a0acf0');   // bluebells; in the old wood, windflowers
          else if (fl < 0.44) for (let q = 0; q < 3; q++) { const fx = x + 1 + Math.floor(h(tx, ty, 896 + q) * 7), fy = y + 3 + Math.floor(h(tx, ty, 901 + q) * 6); R(fx, fy, 1, 2, '#4f8a3a'); R(fx - 1, fy - 1, 1, 1, '#6faa4e'); R(fx + 1, fy - 1, 1, 1, '#6faa4e'); if (q % 2) R(fx + 2, fy, 1, 1, '#4f8a3a'); }      // fern
          else if (a < 0.3) { const bx = x + 1 + Math.floor(c1 * 4); R(bx, y + 5, 5, 3, '#3f6a34'); R(bx + 1, y + 4, 3, 1, '#4c7f38'); R(bx + 1 + Math.floor(c2 * 3), y + 5, 1, 1, '#7a2a4a'); R(bx + Math.floor(c1 * 4), y + 7, 1, 1, '#2a1a3a'); }                                // bramble, in fruit
        } });
      }
      const n = open ? (b > 0.6 ? 1 : 0) : edge ? (young ? 2 : 1) + (b > 0.6 ? 1 : 0) : old ? 1 + (b > 0.78 ? 1 : 0) : young ? 3 + (b > 0.5 ? 1 : 0) : 1 + (b > 0.35 ? 1 : 0) + (b > 0.8 ? 1 : 0);
      for (let q = 0; q < n; q++) {
        const cx = x + 1 + Math.floor(h(tx, ty, 63 + q) * 9), cy = y + 2 + Math.floor(h(tx, ty, 66 + q) * 8), f = 0.86 + h(tx, ty, 75 + q) * 0.26;
        let kind = h(tx, ty, 860 + q) < 0.66 ? lead : species(tx, ty, reg, h(tx, ty, 69 + q));
        if (fall && ['oak', 'beech', 'chestnut', 'birch', 'poplar', 'blossom'].includes(kind) && h(tx, ty, 864 + q) < 0.6) kind = h(tx, ty, 868 + q) > 0.5 ? 'gold' : 'russet';
        const sz = edge ? 2 + Math.floor(h(tx, ty, 72 + q) * 2) : old ? 5 + Math.floor(h(tx, ty, 72 + q) * 3) : young ? 2 + Math.floor(h(tx, ty, 72 + q) * 2) : 3 + Math.floor(h(tx, ty, 72 + q) * 3);
        if (!nearMark(cx, cy)) feats.push({ y: cy, d: () => tree(cx, cy, kind, sz, f) });
      }
      if (edge && a > 0.45) {                    // along the wood's edge: bramble, fern, a felled strip, thorn in blossom, flowers at its foot, or plain brush
        const ez = zq(wildNoise(tx / 6, ty / 6, 1130), 6), e1 = h(tx, ty, 1131), e2 = h(tx, ty, 1132), bx = x + 1 + Math.floor(b * 5);
        feats.push({ y: y + 9, d: () => {
          if (ez === 0) { R(bx - 1, y + 9, 7, 1, 'rgba(0,0,0,.16)'); R(bx - 1, y + 6, 6, 3, '#35542c'); R(bx, y + 5, 4, 1, '#3f6a34'); R(bx - 1, y + 6, 2, 1, '#4c7f38'); for (let q = 0; q < 3; q++) R(bx + Math.floor(h(tx, ty, 1133 + q) * 5), y + 6 + (q % 2), 1, 1, q % 2 ? '#2a1a3a' : '#7a2a4a'); }
          else if (ez === 1) for (let q = 0; q < 3 + Math.floor(e1 * 3); q++) { const fx = x + Math.floor(h(tx, ty, 1133 + q) * 9), fy = y + 5 + Math.floor(h(tx, ty, 1139 + q) * 4); R(fx, fy, 1, 2, '#4f8a3a'); R(fx - 1, fy - 1, 1, 1, '#6faa4e'); R(fx + 1, fy - 1, 1, 1, '#6faa4e'); }
          else if (ez === 2) { if (e1 > 0.5) { R(bx, y + 6, 2, 3, '#6b4f2c'); R(bx, y + 6, 2, 1, '#c9a763'); if (e2 > 0.5) { R(bx + 4, y + 7, 2, 2, '#6b4f2c'); R(bx + 4, y + 7, 2, 1, '#c9a763'); } } else { R(bx - 1, y + 7, 7, 2, '#7a5a34'); R(bx, y + 5, 5, 2, '#8a6a3a'); for (let q = 0; q < 3; q++) R(bx + q * 2, y + 7, 1, 1, '#c9a763'); R(bx - 1, y + 9, 8, 1, 'rgba(0,0,0,.16)'); } }
          else if (ez === 3) { R(bx - 1, y + 9, 6, 1, 'rgba(0,0,0,.16)'); R(bx + 1, y + 6, 1, 3, '#4a3320'); R(bx - 1, y + 3, 5, 4, '#4c7f38'); R(bx, y + 2, 3, 1, '#4c7f38'); for (let q = 0; q < 5; q++) R(bx - 1 + Math.floor(h(tx, ty, 1133 + q) * 5), y + 2 + Math.floor(h(tx, ty, 1139 + q) * 4), 1, 1, e2 > 0.3 ? '#f8f8f4' : '#f4d0d8'); }
          else if (ez === 4) for (let q = 0; q < 3 + Math.floor(e1 * 4); q++) { const fx = x + Math.floor(h(tx, ty, 1133 + q) * 10), fy = y + 5 + Math.floor(h(tx, ty, 1139 + q) * 4), tall = q % 2 === 0; if (tall) { R(fx, fy, 1, 3, '#4f7a3a'); R(fx, fy - 2, 1, 2, wildNoise(tx / 3, ty / 3, 1145) > 0.5 ? '#b070c0' : '#e07898'); } else R(fx, fy + 1, 1, 1, '#7a8ad8'); }
          else { R(bx, y + 7, 4, 2, '#4c7f38'); R(bx + 1, y + 6, 2, 1, '#69a04a'); }
        } });
      }
    } else if (k === T_PEAK) {
      const d = peakDepth(tx, ty), reg = wildRegion(x + 5, y + 5), r = h(tx, ty, 80);
      const rock = reg === 'The High Fells' ? ['#a2aab4', '#646c78', '#7d8692'] : reg === 'The Quarry Hills' ? ['#d2cbb6', '#8f8876', '#b3ac98'] : reg === 'The Barrow Downs' ? ['#8c8676', '#4f4a3c', '#6d6858'] : ['#aaa496', '#6b665c', '#8a8478'];
      // scree and broken rock on the ground between
      feats.push({ y: y, d: () => {
        for (let q = 0; q < 3; q++) R(x + Math.floor(h(tx, ty, 81 + q) * 8), y + Math.floor(h(tx, ty, 84 + q) * 8), 2 + (q % 2), 1, q % 2 ? rock[1] : rock[0]);
        if (d >= 2) {                           // the high valleys: snow lying, a tarn, pines, a great boulder
          const g = h(tx, ty, 1025), g2 = h(tx, ty, 1026), cold = reg === 'The High Fells' || north(tx, ty) > 0.62;
          if (cold && g < 0.34) { const sw = 5 + Math.floor(g2 * 6); R(x + Math.floor(g2 * 30) % 4, y + 3, sw, 4, '#eef2f8'); R(x + 1 + Math.floor(g2 * 30) % 4, y + 2, Math.max(1, sw - 3), 1, '#eef2f8'); R(x + 1 + Math.floor(g2 * 30) % 4, y + 7, Math.max(1, sw - 2), 1, '#c9d2de'); if (g2 > 0.7) R(x + 3, y + 4, 2, 1, '#a8c8e4'); }
          else if (g < 0.4) { R(x + 2, y + 4, 6, 3, cold ? '#6f9fc0' : '#4f86ae'); R(x + 3, y + 3, 4, 1, cold ? '#6f9fc0' : '#4f86ae'); R(x + 3, y + 4, 3, 1, '#b4d6ea'); R(x + 2, y + 7, 6, 1, 'rgba(0,0,0,.2)'); }
          else if (g < 0.5) for (let q = 0, n = 1 + Math.floor(g2 * 3); q < n; q++) { const px = x + 2 + q * 3, py = y + 5 + (q % 2) * 2; R(px, py, 1, 2, '#4a3320'); R(px - 1, py - 2, 3, 2, '#27483a'); R(px, py - 4, 1, 2, '#27483a'); R(px - 1, py - 2, 1, 1, '#3c6450'); }
          else if (g < 0.56) { const bw = 4 + Math.floor(g2 * 4); R(x + 1, y + 7, bw + 2, 1, 'rgba(0,0,0,.22)'); R(x + 2, y + 3, bw, 4, rock[1]); R(x + 2, y + 3, bw >> 1, 4, rock[0]); R(x + 3, y + 2, Math.max(1, bw - 2), 1, rock[0]); }
        }
        if (d === 1) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const o = at(tx + dx, ty + dy);
          if (o === T_PEAK || wet(o)) continue;
          const oc = col(o, tx + dx, ty + dy);
          for (let q = 0; q < 9; q++) { const along = Math.floor(h(tx + q, ty + dx, 106 + dy) * 9), inn = Math.floor(h(tx, ty + q, 108 + dx) * h(tx + q, ty, 109) * 8); R(dx ? x + (dx > 0 ? 8 - inn : inn) : x + along, dy ? y + (dy > 0 ? 8 - inn : inn) : y + along, 2, 2, oc); }
        }
      } });
      // the deeper into the range, the greater the mountain; along its edge, crags
      const p = d >= 4 ? 0.2 : d === 3 ? 0.3 : d === 2 ? 0.48 : 0.75;
      if (r > p) continue;
      const w = d >= 4 ? 26 + Math.floor(a * 20) : d === 3 ? 18 + Math.floor(a * 12) : d === 2 ? 12 + Math.floor(a * 9) : 7 + Math.floor(a * 6);
      const hgt = Math.round(w * (d === 1 ? 0.55 + b * 0.4 : 0.75 + b * 0.6)), cx = x + Math.floor(h(tx, ty, 87) * 10), by = y + 6 + Math.floor(h(tx, ty, 88) * 4), lean = (h(tx, ty, 89) - 0.5) * 0.6;
      const snowRows = (hgt > 16 || north(tx, ty) > 0.6 || reg === 'The High Fells') ? Math.round(hgt * (reg === 'The High Fells' ? 0.42 : 0.26) * (0.6 + h(tx, ty, 90) * 0.8)) : 0;
      // A mountain is built a column at a time from the line of its crest: flanks that hollow as they rise, a shoulder
      // or two standing off the summit, and the whole line broken, so that no two are alike and none is a pyramid. Its
      // light side and its dark side meet along a ridge that wanders down from the top, and spurs run off that.
      const mountain = (mx, mby, mw, mh, ml, sr, seed, shp) => {
        const hw = Math.max(2, Math.round(mw / 2) + 1), hv = (q, k2) => h(seed + q, seed * 3 + k2, 91), tops = [];
        const s1 = (hv(1, 1) > 0.5 ? 1 : -1) * (0.32 + hv(2, 1) * 0.3), s1h = 0.45 + hv(3, 1) * 0.3, s2 = -Math.sign(s1) * (0.45 + hv(4, 1) * 0.3), s2h = 0.25 + hv(5, 1) * 0.3, peakAt = clamp(ml * 0.9, -0.45, 0.45);
        let best = 0, cs = 0;
        for (let c = -hw; c <= hw; c++) {
          const t = c / hw, tt = (t - peakAt) / (t < peakAt ? 1 + peakAt : 1 - peakAt), d0 = Math.max(0, 1 - Math.abs(tt));
          let e = shp === 3 ? Math.min(1, d0 * 2.4) * (0.94 + hv(c >> 1, 2) * 0.06) : shp === 2 ? Math.pow(Math.max(0, 1 - tt * tt), 0.8) : shp === 1 ? Math.pow(d0, 2.1) : Math.pow(d0, 1.45);
          if (shp !== 3) { e = Math.max(e, s1h * Math.pow(Math.max(0, 1 - Math.abs(t - s1) / 0.5), 1.3), s2h * Math.pow(Math.max(0, 1 - Math.abs(t - s2) / 0.42), 1.3)); e = Math.max(e, 0.16 * Math.sqrt(Math.max(0, 1 - Math.abs(t)))); }      // the shoulders, and the swell of its foot
          e *= 0.9 + wildNoise((c + seed % 97) / 3.2, seed % 53, 1700) * 0.2;                                                    // the crest is not a ruled line
          const top = Math.max(Math.abs(t) > 0.97 ? 0 : 1, Math.round(mh * Math.min(1, e))); tops.push(top); if (top > best) { best = top; cs = c; }
        }
        R(mx - hw, mby, hw * 2 + 3, 2, 'rgba(0,0,0,.22)');
        const lit = rock[0], dark = rock[1], mid = rock[2], lit2 = tint(rock[0], 1.1), dark2 = tint(rock[1], 0.84), spurL = cs - Math.round(hw * (0.25 + hv(6, 1) * 0.2)), spurR = cs + Math.round(hw * (0.22 + hv(7, 1) * 0.2));
        let ridge = cs;
        for (let i = 0; i < best; i++) {                       // row by row from the summit down, in runs of one colour
          const yy = mby - best + i, lvl = best - i, fr = i / best;
          if (i > 0 && hv(i, 3) > 0.45) ridge += hv(i, 4) > 0.5 ? 1 : -1; ridge = clamp(ridge, cs - Math.round(hw * 0.3), cs + Math.round(hw * 0.3));
          const lx = spurL - Math.round(i * 0.45) + (hv(i, 5) > 0.6 ? 1 : 0), rx = spurR + Math.round(i * 0.4) - (hv(i, 6) > 0.6 ? 1 : 0), sw = 1 + Math.round(fr * 3);
          let run = null, rc = '';
          for (let c = -hw; c <= hw + 1; c++) {
            let colr = '';
            if (c <= hw && tops[c + hw] >= lvl) {
              const depth = i - (best - tops[c + hw]), isLit = c < ridge, snowy = depth < sr * (isLit ? 1 : 0.7) * (0.55 + hv(c >> 1, 7) * 0.9) + (hv(c, 8) > 0.8 ? 2 : 0) && i < sr * 1.5 + hv(c >> 1, 17) * 4;
              if (snowy) colr = isLit ? (c >= ridge - 2 && depth > 1 ? '#e2e8f0' : '#f4f6fa') : (depth < 1 ? '#dfe5ee' : '#c9d2de');
              else if (isLit) colr = fr > 0.25 && c > lx && c <= lx + sw ? mid : depth < 1 ? lit2 : hv(i, 9) > 0.55 && hv(c >> 2, 10 + i) > 0.35 ? mid : lit;      // a spur throwing its own small shade, the crest catching the light, and the beds of the rock
              else colr = fr > 0.2 && c >= rx - sw && c < rx ? mid : hv(i, 11) > 0.6 && hv(c >> 2, 12 + i) > 0.4 ? dark2 : dark;
              if (!snowy && lvl <= 2 && hv(c, 13) > 0.5) colr = isLit ? mid : dark2;                                                // scree along the foot
            }
            if (colr !== rc) { if (rc) R(mx + run, yy, c - run, 1, rc); run = c; rc = colr; }
          }
        }
        for (let q = 0, n = 2 + Math.floor(mw / 9); q < n; q++) { const c = Math.round((hv(q, 14) - 0.5) * 2 * hw), tp = tops[clamp(c + hw, 0, tops.length - 1)], dn = 2 + Math.floor(hv(q, 15) * Math.max(1, tp * 0.5)); if (tp > 6 && dn < tp - 2) R(mx + c, mby - tp + dn + Math.round(sr), 1, 2 + Math.floor(hv(q, 16) * 3), c < cs ? tint(lit, 0.86) : dark2); }      // gullies
      };
      const seed = tx * 131 + ty * 17;
      // a mountain is a plain peak (0), a horn (1), a dome (2), a table with its top cut off (3), or twin summits (4)
      const shp = d === 1 ? (h(tx, ty, 1021) > 0.7 ? 1 : 0) : h(tx, ty, 1022) < 0.6 ? zq(wildNoise(tx / 7, ty / 7, 1020), 5) : Math.floor(h(tx, ty, 1023) * 5);
      const hg = Math.round(hgt * (shp === 1 ? 1.25 : shp === 2 ? 0.78 : shp === 3 ? 0.8 : 1));
      feats.push({ y: by, d: () => {
        if (w > 14 && h(tx, ty, 98) > 0.45) { const side = h(tx, ty, 99) > 0.5 ? 1 : -1; mountain(cx + side * Math.round(w * 0.42), by - 1, Math.round(w * 0.62), Math.round(hg * 0.62), -lean, Math.round(snowRows * 0.4), seed + 7, shp === 4 ? 0 : shp); }      // a shoulder
        if (shp === 4) mountain(cx + Math.round(w * 0.36), by, Math.round(w * 0.85), Math.round(hg * 0.86), lean, Math.round(snowRows * 0.8), seed + 3, 0);
        mountain(cx, by, w, hg, lean, snowRows, seed, shp === 4 ? 0 : shp);
        const m1 = h(tx, ty, 1024);
        if (w > 14 && m1 > 0.93) { const fx = cx + Math.round(w * 0.12), fh = Math.round(hg * 0.5); for (let i = 0; i < fh; i++) R(fx + (i > fh * 0.6 ? 1 : 0), by - fh + i, 1, 1, i % 3 ? '#e4f2fb' : '#a4d0ea'); R(fx - 1, by, 4, 1, '#7fb6d8'); R(fx, by - 1, 2, 1, '#e4f2fb'); }      // water coming down it
        else if (w > 11 && m1 < 0.06) { const kx = cx - Math.round(w * 0.15); R(kx, by - 3, 3, 3, '#1c1814'); R(kx + 1, by - 4, 1, 1, '#1c1814'); R(kx - 1, by, 5, 1, rock[2]); }                                                                    // the mouth of a cave
        else if (shp === 3 && hg > 9) for (let i = 3; i < hg - 1; i += 4) R(cx - Math.round(w * (0.1 + h(i, seed, 1027) * 0.3)), by - hg + i, Math.round(w * (0.2 + h(seed, i, 1028) * 0.3)), 1, tint(rock[2], 0.95));                                                                                    // the beds of rock showing
        if (w > 20 && h(tx, ty, 100) > 0.6) { const px = cx - Math.round(w * 0.3); for (let q = 0; q < 3; q++) R(px + q * 2, by - 2 - q * 2, 2, 2, '#35543a'); }                                                              // pines at its foot
      } });
    }
  }
  // ---- the trees of the woods, out over the whole country: the same kinds that make each region's forest, standing
  // singly and in twos and threes on open ground, thicker in some stretches than others and nowhere thick ----
  for (let ty = 2; ty < TH - 2; ty++) for (let tx = 2; tx < TW - 2; tx++) {
    const k = at(tx, ty);
    if (k !== T_GRASS && k !== T_MEADOW && k !== T_HILL) continue;
    const x = tx * 10, y = ty * 10, r0 = h(tx, ty, 1601), drift = wildNoise(tx / 8, ty / 8, 1600), want = k === T_HILL ? 0.02 + Math.max(0, drift - 0.45) * 0.14 : 0.03 + Math.max(0, drift - 0.45) * 0.22;
    if (r0 > want) continue;
    if (farm(tx, ty) || grove(tx, ty) || inTown(tx, ty, 6) || nearMark(x + 5, y + 7) || siteTiles.some(([sx, sy]) => Math.hypot(sx - tx, sy - ty) < 3)) continue;
    if (Math.abs(x + 5 - STABLES.x) < 30 && Math.abs(y + 5 - STABLES.y) < 20) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const o = at(tx + dx, ty + dy); return o === T_ROAD || o === T_BRIDGE; })) continue;      // not on the verge of a road
    const reg = wildRegion(x + 5, y + 5), n = h(tx, ty, 1602) > 0.72 ? 2 : 1;
    for (let q = 0; q < n; q++) {
      let kind = species(tx, ty, reg, h(tx, ty, 1603 + q)); if (kind === 'dead' && h(tx, ty, 1606 + q) > 0.25) kind = reg === 'Blackmere' ? 'willow' : 'oak';
      const sz = (k === T_HILL ? 2 : 3) + Math.floor(h(tx, ty, 1609 + q) * 3), f = 0.88 + h(tx, ty, 1612 + q) * 0.24, cx = x + 2 + Math.floor(h(tx, ty, 1615 + q) * 6) + q * 5, cy = y + 6 + Math.floor(h(tx, ty, 1618 + q) * 3) - q * 2;
      feats.push({ y: cy, d: () => tree(cx, cy, kind, sz, f) });
    }
  }
  for (const [tx, ty] of lone) {
    const x = tx * 10, y = ty * 10, reg = wildRegion(x + 5, y + 5), kind = species(tx, ty, reg, h(tx, ty, 101)), sz = 2 + Math.floor(h(tx, ty, 102) * 3), f = 0.88 + h(tx, ty, 103) * 0.24, cx = x + 2 + Math.floor(h(tx, ty, 104) * 6), cy = y + 7;
    feats.push({ y: cy, d: () => tree(cx, cy, kind === 'dead' && h(tx, ty, 105) > 0.3 ? 'oak' : kind, sz, f) });
  }
  // No kind of ground stops dead at the edge of its tile. Saplings and brush stand out from a wood, foothills run
  // down from high ground, reeds and standing water creep out of a marsh, boulders lie below a range, and sand
  // blows inland. Only what is drawn: the ground underfoot is what it was.
  const nearKind = (tx, ty, kind) => { for (let r = 1; r <= 2; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && at(tx + dx, ty + dy) === kind) return r; return 0; };
  for (let ty = 2; ty < TH - 2; ty++) for (let tx = 2; tx < TW - 2; tx++) {
    const k = at(tx, ty);
    if (k !== T_GRASS && k !== T_MEADOW && k !== T_HILL) continue;
    if (k !== T_HILL && farmland(tx, ty)) continue;
    const x = tx * 10, y = ty * 10, e1 = h(tx, ty, 820), e2 = h(tx, ty, 821), e3 = h(tx, ty, 822), reg = wildRegion(x + 5, y + 5);
    if (nearMark(x + 5, y + 5)) continue;
    const dPeak = nearKind(tx, ty, T_PEAK);
    if (dPeak && e1 < (dPeak === 1 ? 0.5 : 0.22)) {              // rock come down off the range
      const rock = reg === 'The High Fells' ? ['#a2aab4', '#646c78'] : reg === 'The Quarry Hills' ? ['#d2cbb6', '#8f8876'] : reg === 'The Barrow Downs' ? ['#8c8676', '#4f4a3c'] : ['#aaa496', '#6b665c'];
      const w = 3 + Math.floor(e2 * 5), hh = 2 + Math.floor(e3 * (dPeak === 1 ? 6 : 3)), cx = x + 1 + Math.floor(e3 * (9 - w)), cy = y + 5 + Math.floor(e2 * 4);
      feats.push({ y: cy, d: () => { R(cx - 1, cy, w + 2, 1, 'rgba(0,0,0,.2)'); for (let q = 0; q < hh; q++) { const ww = Math.max(1, Math.round(w * (q + 1) / hh)); R(cx + ((w - ww) >> 1), cy - hh + q, Math.ceil(ww / 2), 1, rock[0]); R(cx + ((w - ww) >> 1) + Math.ceil(ww / 2), cy - hh + q, Math.floor(ww / 2), 1, rock[1]); } } });
      continue;
    }
    if (k === T_HILL) continue;
    // A road has something beside it for a stretch, then something else: an avenue of trees, a hedge, a wall of
    // field stones, a ditch, a flowering verge, a fence of posts and rails; or nothing.
    const side = at(tx, ty - 1) === T_ROAD ? 'n' : at(tx, ty + 1) === T_ROAD ? 's' : at(tx - 1, ty) === T_ROAD ? 'w' : at(tx + 1, ty) === T_ROAD ? 'e' : '';
    if (side && Math.hypot(tx - tx0, ty - ty0) < 17) {
      // No one is buried inside the walls; the tombs stand along the roads, each family's of its own making.
      const t1 = h(tx, ty, 1140), t2 = h(tx, ty, 1141), t3 = h(tx, ty, 1142), t4 = h(tx, ty, 1143);
      if (t1 < 0.5) {
        const st = ['#d8d2c0', '#e8e2d2', '#c9c3ae', '#b8b0a0'][Math.floor(t3 * 4)], sd = tint(st, 0.8), cx = x + (side === 'w' ? 2 : side === 'e' ? 5 : 2 + Math.floor(t4 * 5)), by = y + (side === 'n' ? 6 : side === 's' ? 9 : 5 + Math.floor(t4 * 4));
        feats.push({ y: by, d: () => {
          R(cx - 1, by, 6, 1, 'rgba(0,0,0,.2)');
          if (t2 < 0.24) { const hh = 4 + Math.floor(t4 * 3); R(cx, by - hh, 3, hh, st); R(cx + 2, by - hh, 1, hh, sd); R(cx + 1, by - hh - 1, 1, 1, st); R(cx, by - hh + 2, 2, 1, sd); if (t4 > 0.6) R(cx, by - 1, 1, 1, '#c23b2e'); }                                              // a slab set upright, a wreath left at it
          else if (t2 < 0.44) { R(cx - 1, by - 3, 6, 3, st); R(cx + 3, by - 3, 2, 3, sd); R(cx - 2, by - 4, 8, 1, tint(st, 1.06)); R(cx, by - 2, 3, 1, sd); if (t4 > 0.5) { R(cx + 1, by - 6, 2, 2, '#b5522e'); R(cx + 1, by - 6, 1, 1, '#d8742a'); } }                                    // a chest tomb, a jar on its lid
          else if (t2 < 0.6) { R(cx - 2, by - 6, 8, 6, st); R(cx + 4, by - 6, 2, 6, sd); for (let i = 0; i < 3; i++) R(cx - 2 + i, by - 7 - i, 8 - i * 2, 1, tint(st, 1.05)); R(cx + 1, by - 4, 2, 4, '#3a2a1c'); R(cx - 1, by - 6, 1, 6, tint(st, 1.1)); R(cx + 4, by - 6, 1, 6, tint(st, 1.1)); }      // a house for the dead, with its own door
          else if (t2 < 0.74) { const hh = 7 + Math.floor(t4 * 3); R(cx, by - 1, 4, 1, st); R(cx + 1, by - hh, 2, hh, st); R(cx + 2, by - hh, 1, hh, sd); R(cx, by - hh - 1, 4, 1, st); R(cx + 1, by - hh - 3, 2, 2, t4 > 0.5 ? '#b5522e' : st); }                                         // a column, an urn on it
          else if (t2 < 0.88) { R(cx + 3, by - 2, 3, 2, st); R(cx + 5, by - 2, 1, 2, sd); tree(cx, by, 'cypress', 2 + Math.floor(t4 * 2), 0.95); }                                                                                                                                  // a plain stone, and a cypress planted by it
          else { R(cx, by - 3, 2, 3, sd); R(cx + 2, by - 1, 4, 1, st); R(cx + 3, by - 2, 2, 1, st); R(cx, by - 4, 1, 1, '#4c7f38'); R(cx + 1, by - 3, 1, 2, '#4c7f38'); }                                                                                                             // an old one, broken and under ivy
        } });
      }
      continue;
    }
    if (side) {
      const rz = zq(wildNoise(tx / 9, ty / 9, 1090), 7), r1 = h(tx, ty, 1091), r2 = h(tx, ty, 1092), along = side === 'n' || side === 's';
      const band = (th, d) => { const o = side === 'n' || side === 'w' ? 1 : 9 - th; if (along) d(x, y + o, 10, th); else d(x + o, y, th, 10); };      // a strip along the road's side of the tile
      if (rz === 0) { if ((tx + ty) % 2 === 0) { const kind = reg === 'The Home Fields' || reg === 'The Long Meadows' ? 'poplar' : reg === 'The Salt Shore' || reg === 'The Quarry Hills' ? 'cypress' : species(tx, ty, reg, r2), cx = x + (side === 'w' ? 2 : side === 'e' ? 7 : 4 + Math.floor(r1 * 2)), cy = y + (side === 'n' ? 4 : side === 's' ? 8 : 5 + Math.floor(r1 * 2)); feats.push({ y: cy, d: () => tree(cx, cy, kind === 'dead' ? 'oak' : kind, 3, 0.94 + r1 * 0.14) }); } continue; }
      if (rz === 1 && r1 > 0.12) { feats.push({ y: y + (side === 's' ? 9 : 3), d: () => band(3, (bx, by, bw, bh) => { R(bx, by, bw, bh, r2 > 0.5 ? '#4f7038' : '#5a7a3c'); if (along) { R(bx, by, bw, 1, '#6f9648'); R(bx, by + bh, bw, 1, 'rgba(0,0,0,.16)'); R(bx + Math.floor(r1 * 8), by + 1, 1, 1, r2 > 0.6 ? '#f4f4f0' : '#c23b2e'); } else { R(bx, by, 1, bh, '#6f9648'); R(bx + 1, by + Math.floor(r1 * 8), 1, 1, r2 > 0.6 ? '#f4f4f0' : '#c23b2e'); } }) }); continue; }      // a hedge, in flower or in berry, with a gap now and then
      if (rz === 2 && r1 > 0.1) { feats.push({ y: y + (side === 's' ? 9 : 3), d: () => band(2, (bx, by, bw, bh) => { R(bx, by, bw, bh, '#a8a090'); if (along) { R(bx, by, bw, 1, '#c8c2b2'); for (let i = 1; i < 10; i += 3) R(bx + i + (ty % 2), by + 1, 1, 1, '#7d7668'); R(bx, by + bh, bw, 1, 'rgba(0,0,0,.18)'); } else { R(bx, by, 1, bh, '#c8c2b2'); for (let i = 1; i < 10; i += 3) R(bx + 1, by + i + (tx % 2), 1, 1, '#7d7668'); } if (r1 < 0.2) R(bx + (along ? 4 : -1), by + (along ? 2 : 4), 2, 1, '#a8a090'); }) }); continue; }      // a wall of field stones, a stone or two fallen from it
      if (rz === 3) { feats.push({ y: y, d: () => band(2, (bx, by, bw, bh) => { R(bx, by, bw, bh, 'rgba(40,60,50,.35)'); if (along) R(bx + Math.floor(r1 * 5), by, 4, 1, '#6fa8c8'); else R(bx, by + Math.floor(r1 * 5), 1, 4, '#6fa8c8'); if (r2 > 0.6) { R(bx + (along ? Math.floor(r2 * 9) : 0), by + (along ? -2 : Math.floor(r2 * 7)), 1, 3, '#8a9a4a'); } }) }); continue; }      // a ditch, water standing in it
      if (rz === 4) { const fc = reg === 'The Long Meadows' ? ['#f2e6a0', '#f4f4f0'] : reg === 'Greywood' ? ['#b9a0e0', '#f4f4f0'] : reg === 'The Salt Shore' ? ['#e8a0c0', '#f4f4f0'] : ['#c23b2e', '#6f80d8']; feats.push({ y: y, d: () => band(4, (bx, by, bw, bh) => { for (let q = 0; q < 6; q++) R(bx + Math.floor(h(tx, ty, 1093 + q) * bw), by + Math.floor(h(tx, ty, 1099 + q) * bh), 1, 1, fc[q % 2]); R(bx + Math.floor(r1 * (bw - 1)), by + Math.floor(r2 * (bh - 2)), 1, 2, '#93b055'); }) }); continue; }      // a verge left to flower
      if (rz === 5) { feats.push({ y: y + (side === 's' ? 9 : 3), d: () => band(3, (bx, by, bw, bh) => { if (along) { R(bx, by + 1, bw, 1, '#8a6a3a'); for (let i = 1; i < 10; i += 4) { R(bx + i, by, 1, 3, '#6b4f2c'); } if (r1 < 0.15) R(bx + 3, by + 1, 4, 1, col(k, tx, ty)); } else { R(bx + 1, by, 1, bh, '#8a6a3a'); for (let i = 1; i < 10; i += 4) R(bx, by + i, 3, 1, '#6b4f2c'); } }) }); continue; }      // posts and a rail, a rail down here and there
    }
    const dFor = nearKind(tx, ty, T_FOREST), dHill = nearKind(tx, ty, T_HILL), dMarsh = nearKind(tx, ty, T_MARSH), dSand = nearKind(tx, ty, T_SAND);
    if (dFor && e1 < (dFor === 1 ? 0.6 : 0.26)) {                // the wood's outliers: young trees, and brush
      const cx = x + 1 + Math.floor(e2 * 8), cy = y + 3 + Math.floor(e3 * 6);
      if (e2 < 0.6) { const kind = species(tx, ty, reg, h(tx, ty, 823)), f = 0.9 + h(tx, ty, 824) * 0.22; feats.push({ y: cy, d: () => tree(cx, cy, kind === 'dead' ? 'oak' : kind, dFor === 1 && e3 > 0.5 ? 3 : 2, f) }); }
      else feats.push({ y: cy, d: () => { R(cx - 2, cy + 1, 5, 1, 'rgba(0,0,0,.18)'); R(cx - 2, cy - 2, 4 + Math.floor(e3 * 2), 3, '#4c7f38'); R(cx - 1, cy - 3, 2, 1, '#69a04a'); } });
    } else if (dHill && e1 < (dHill === 1 ? 0.5 : 0.2)) {        // foothills
      const pal = reg === 'The Quarry Hills' ? ['#b9b083', '#cfc79c', '#8d8660'] : reg === 'The High Fells' ? ['#8f9a78', '#a6b08e', '#6c765a'] : reg === 'The Barrow Downs' ? ['#86a05a', '#9ab56c', '#64803f'] : ['#a3a866', '#b9be7c', '#7f8548'];
      const rx = 3 + Math.floor(e2 * (dHill === 1 ? 5 : 3)), ry = Math.max(2, Math.round(rx * 0.55)), cx = x + Math.floor(e3 * 10), cy = y + 3 + Math.floor(e2 * 7), t = tone(tx, ty);
      const gcol = col(k, tx, ty);
      feats.push({ y: cy - 6, d: () => hillMound(cx, cy, rx + 1, ry + 1, 0, pal, null, t, gcol) });
    } else if (dMarsh && e1 < (dMarsh === 1 ? 0.55 : 0.2)) {     // wet ground at the marsh's edge
      feats.push({ y: y, d: () => {
        if (e2 > 0.5) { const pw = 3 + Math.floor(e3 * 4), px = x + Math.floor(e2 * (10 - pw)); R(px, y + 5, pw, 2, '#3d5a52'); R(px + 1, y + 4, Math.max(1, pw - 2), 1, '#3d5a52'); R(px + 1, y + 5, Math.max(1, pw - 2), 1, '#587a78'); }
        for (let q = 0, n = 1 + Math.floor(e3 * 3); q < n; q++) { const rx0 = x + Math.floor(h(tx, ty, 825 + q) * 10), ry0 = y + 1 + Math.floor(h(tx, ty, 828 + q) * 5); R(rx0, ry0, 1, 3 + (q % 2), q % 2 ? '#8a9a4a' : '#9aaa5a'); if (q === 0) R(rx0, ry0 - 1, 1, 2, '#6b4a2a'); }
      } });
    } else if (dSand === 1 && e1 < 0.5) {                        // sand blown in over the grass
      feats.push({ y: y, d: () => { for (let q = 0, n = 2 + Math.floor(e2 * 3); q < n; q++) { const sw = 2 + Math.floor(h(tx, ty, 831 + q) * 4); R(x + Math.floor(h(tx, ty, 834 + q) * (10 - sw)), y + 1 + Math.floor(h(tx, ty, 837 + q) * 8), sw, 1 + (q % 2), q % 2 ? '#d8c48a' : '#cdb97e'); } if (e3 > 0.6) { R(x + 4, y + 3, 1, 3, '#9aa860'); R(x + 5, y + 2, 1, 1, '#aab870'); } } });
    }
  }
  feats.sort((p1, p2) => p1.y - p2.y);
  for (const ft of feats) ft.d();
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) if (at(tx, ty) === T_FOREST && wildRegion(tx * 10 + 5, ty * 10 + 5) === 'Greywood') R(tx * 10, ty * 10 - 4, 10, 12, 'rgba(128,132,136,.16)');      // an old wood, gone grey
  return (prov.land = cv);
}

// ---------- flocks, herds and birds: alive on the map ----------
// A herd wanders round its home, slowly, by a path that is the same for everyone and for every time it is looked at:
// where it stands is worked out from the clock, not remembered. Sheep graze and drift, with a shepherd and his dog
// to some of them; cattle hardly move; goats keep to the hills; deer run from the column.
function drawHerds(ctx, T, R, inView) {
  const F = G.field;
  for (const H of (prov.herds || [])) {
    if (!inView(H.x, H.y, 60) || !wildSeen(H.x, H.y)) continue;
    const hv = n => wildHash(H.seed, n, 670), K = H.kind, roam = K === 'cattle' ? 12 : K === 'deer' ? 22 : K === 'horses' ? 36 : K === 'pigs' ? 14 : K === 'geese' ? 13 : K === 'cranes' ? 8 : 28, pace = K === 'cattle' ? 0.8 : K === 'goats' ? 2.4 : K === 'deer' ? 1.6 : K === 'horses' ? 2 : K === 'pigs' ? 1.2 : K === 'geese' ? 1.6 : K === 'cranes' ? 0.5 : 2.4;
    const w1 = (0.035 + hv(1) * 0.02) * pace, w2 = (0.061 + hv(2) * 0.03) * pace, p1 = hv(3) * 9, p2 = hv(4) * 9;
    let cx = H.x + roam * (Math.sin(T * w1 + p1) * 0.65 + Math.sin(T * w2 + p2) * 0.35), cy = H.y + roam * 0.7 * (Math.cos(T * w1 * 0.9 + p2) * 0.65 + Math.cos(T * w2 * 1.1 + p1) * 0.35);
    const vx = roam * (Math.cos(T * w1 + p1) * 0.65 * w1 + Math.cos(T * w2 + p2) * 0.35 * w2);      // which way the herd as a whole is drifting
    let bolt = 0;
    if (K === 'deer' && F) { const d = Math.hypot(F.x - cx, F.y - cy); if (d < 70) { bolt = (70 - d) / 70; cx += (cx - F.x) / (d || 1) * bolt * 46; cy += (cy - F.y) / (d || 1) * bolt * 46; } }
    const beasts = [];
    for (let i = 0; i < H.n; i++) {
      const b1 = hv(10 + i), b2 = hv(30 + i), b3 = hv(50 + i), spread = K === 'cattle' ? 12 : 9;
      const x = cx + (b1 - 0.5) * 2 * spread + Math.sin(T * (0.22 + b3 * 0.16) + b1 * 20) * 5, y = cy + (b2 - 0.5) * 2 * spread * 0.7 + Math.cos(T * (0.19 + b1 * 0.14) + b2 * 20) * 3.5;
      const own = Math.cos(T * (0.22 + b3 * 0.16) + b1 * 20), moving = bolt > 0.1 || Math.abs(vx) > 1.1 || Math.abs(own) > 0.6;
      const right = bolt > 0.1 ? (F ? cx > F.x : true) : Math.abs(vx) > 1.1 ? vx > 0 : own > 0;
      const graze = !moving && Math.sin(T * 0.45 + b2 * 30) > 0.1, step = moving && Math.sin(T * 9 + i * 2) > 0 ? 1 : 0;
      beasts.push({ x: Math.round(x), y: Math.round(y), right, graze, step, moving, b1, b2, b3, i });
    }
    beasts.sort((p, q) => p.y - q.y);
    for (const B of beasts) {
      const { x, y, right, graze, step, moving } = B, d = right ? 1 : -1;
      if (K === 'sheep') {
        const black = B.b3 > 0.88, lamb = B.b3 < 0.16, wool = black ? '#3a322c' : B.b1 > 0.5 ? '#f1ead8' : '#e6dcc4', w = lamb ? 3 : 5, hh = lamb ? 2 : 3, lying = !moving && B.b2 > 0.82;
        R(x - (w >> 1), y + 1, w + 1, 1, 'rgba(0,0,0,.2)'); R(x - (w >> 1), y - hh, w, hh, wool); R(x - (w >> 1) + 1, y - hh - 1, w - 2, 1, wool);
        R(right ? x + (w >> 1) + 1 : x - (w >> 1) - 2, y - hh + (graze ? 2 : 0), 2, 2, black ? '#1c1614' : '#2a1c14');
        if (!lying) { R(x - (w >> 1) + (step && !lamb ? 1 : 0), y, 1, 1, '#2a1c14'); R(x + (w >> 1) - (step ? 1 : 0), y, 1, 1, '#2a1c14'); }
      } else if (K === 'cattle') {
        const c = B.b1 > 0.6 ? '#8a5a32' : B.b1 > 0.3 ? '#e8e2d2' : '#3a2a22', patch = c === '#e8e2d2' ? '#3a2a22' : '#e8e2d2';
        R(x - 4, y + 1, 9, 1, 'rgba(0,0,0,.22)'); R(x - 4, y - 5, 8, 4, c); R(x - 2 + (B.b2 > 0.5 ? 2 : 0), y - 5, 2, 2, patch); R(x - 3, y - 2, 2, 1, patch);
        R(right ? x + 4 : x - 6, y - 5 + (graze ? 2 : 0), 2, 3, c); R(right ? x + 4 : x - 6, y - 6 + (graze ? 2 : 0), 1, 1, '#e8e2d2'); R(right ? x + 5 : x - 5, y - 6 + (graze ? 2 : 0), 1, 1, '#e8e2d2');
        R(x - 3 + step, y - 1, 1, 2, '#2a1c14'); R(x + 2 - step, y - 1, 1, 2, '#2a1c14'); R(right ? x - 5 : x + 4, y - 4, 1, 3, shade(c, 0.8));
      } else if (K === 'goats') {
        const c = B.b1 > 0.5 ? '#c9c2ae' : B.b1 > 0.25 ? '#8a7a66' : '#e8e2d2', hop = moving && Math.sin(T * 6 + B.i) > 0.6 ? 1 : 0;
        R(x - 2, y + 1, 5, 1, 'rgba(0,0,0,.2)'); R(x - 2, y - 3 - hop, 4, 2, c); R(right ? x + 2 : x - 3, y - 4 - hop + (graze ? 1 : 0), 2, 2, c); R(right ? x + 2 : x - 2, y - 5 - hop + (graze ? 1 : 0), 1, 1, '#5a4a3a'); R(right ? x + 3 : x - 4, y - 3 - hop + (graze ? 1 : 0), 1, 1, c);
        R(x - 2 + step, y - 1 - hop, 1, 2, '#3a2a22'); R(x + 1 - step, y - 1 - hop, 1, 2, '#3a2a22');
      } else if (K === 'horses') {
        const c = ['#7a4a2a', '#2a2220', '#c9c2ae', '#a8642e', '#c8a868'][Math.floor(B.b1 * 5)], dk = shade(c, 0.6), foal = B.b3 < 0.2, w = foal ? 5 : 8, bh = foal ? 3 : 4, lg = foal ? 2 : 3, hw = w >> 1, hx = right ? x + hw - 1 : x - hw - 1, trot = moving && Math.sin(T * 8 + B.i) > 0 ? 1 : 0;
        R(x - hw, y + 1, w + 1, 1, 'rgba(0,0,0,.22)'); R(x - hw, y - lg - bh - trot, w, bh, c); if (B.b2 > 0.7 && c !== '#c9c2ae') R(x - 1, y - lg - bh - trot, 2, 2, '#e8e2d2');
        if (graze) { R(hx, y - lg - bh + 1, 2, bh, c); R(right ? hx + 1 : hx - 1, y - lg, 2, 2, c); } else { R(hx, y - lg - bh - 3 - trot, 2, 4, c); R(right ? hx + 1 : hx - 2, y - lg - bh - 3 - trot, 3, 2, c); R(right ? hx - 1 : hx + 2, y - lg - bh - 2 - trot, 1, 3, dk); }
        R(right ? x - hw - 1 : x + hw, y - lg - bh + 1 - trot, 1, 3, dk); R(x - hw + step, y - lg, 1, lg, dk); R(x + hw - 1 - step, y - lg, 1, lg, dk);
      } else if (K === 'pigs') {
        const c = B.b1 > 0.6 ? '#e0a8a0' : B.b1 > 0.3 ? '#5a4a44' : '#c8907c', piglet = B.b3 < 0.25, w = piglet ? 3 : 5;
        R(x - (w >> 1), y + 1, w + 1, 1, 'rgba(0,0,0,.2)'); R(x - (w >> 1), y - 3, w, 3, c); if (B.b2 > 0.6 && !piglet) R(x - 1, y - 3, 2, 2, c === '#5a4a44' ? '#e0a8a0' : '#5a4a44');
        R(right ? x + (w >> 1) + 1 : x - (w >> 1) - 2, y - 3 + (graze ? 1 : 0), 2, 2, c); R(right ? x + (w >> 1) + 3 : x - (w >> 1) - 3, y - 2 + (graze ? 1 : 0), 1, 1, shade(c, 0.8)); R(right ? x - (w >> 1) - 1 : x + (w >> 1) + 1, y - 3, 1, 1, c);
        R(x - (w >> 1) + step, y, 1, 1, '#3a2a22'); R(x + (w >> 1) - step, y, 1, 1, '#3a2a22');
      } else if (K === 'geese') {
        const c = B.b1 > 0.3 ? '#f4f4f0' : '#a8a498', up = !graze, wad = moving && Math.sin(T * 10 + B.i) > 0 ? 1 : 0;
        R(x - 1, y + 1, 4, 1, 'rgba(0,0,0,.18)'); R(x - 1, y - 2, 3, 2, c); R(right ? x - 2 : x + 2, y - 2, 1, 1, c);
        if (up) { R(right ? x + 2 : x - 2, y - 4, 1, 3, c); R(right ? x + 3 : x - 3, y - 4, 1, 1, '#e8902a'); } else { R(right ? x + 2 : x - 2, y - 1, 1, 2, c); R(right ? x + 3 : x - 3, y, 1, 1, '#e8902a'); }
        R(x - 1 + wad, y, 1, 1, '#e8902a'); R(x + 1 - wad, y, 1, 1, '#e8902a');
      } else if (K === 'cranes') {
        const c = B.b1 > 0.5 ? '#c8ccd0' : '#e8e8e4', down = graze;
        R(x - 2, y + 1, 5, 1, 'rgba(0,0,0,.16)'); R(x - 1, y - 4, 1, 4, '#3a3a40'); R(x + 1, y - 4 + (moving && step ? 1 : 0), 1, 4 - (moving && step ? 1 : 0), '#3a3a40'); R(x - 2, y - 6, 5, 2, c); R(right ? x - 3 : x + 3, y - 5, 1, 2, '#3a3a40');
        if (down) { R(right ? x + 3 : x - 3, y - 5, 1, 4, c); R(right ? x + 4 : x - 5, y - 2, 2, 1, '#c8a040'); } else { R(right ? x + 3 : x - 3, y - 10, 1, 5, c); R(right ? x + 3 : x - 3, y - 11, 1, 1, '#c23b2e'); R(right ? x + 4 : x - 5, y - 10, 2, 1, '#c8a040'); }
      } else {                                   // deer
        const stag = B.i === 0, c = B.b1 > 0.5 ? '#a8764a' : '#96683e', up = !graze || bolt > 0.1, leap = bolt > 0.1 && Math.sin(T * 10 + B.i) > 0 ? 2 : 0;
        R(x - 3, y + 1, 7, 1, 'rgba(0,0,0,.2)'); R(x - 3, y - 5 - leap, 6, 3, c); R(right ? x - 4 : x + 3, y - 5 - leap, 1, 2, '#f1ead8');
        R(right ? x + 3 : x - 4, y - (up ? 8 : 4) - leap, 1, up ? 3 : 2, c); R(right ? x + 3 : x - 5, y - (up ? 9 : 3) - leap, 2, 2, c);
        if (stag && up) { R(right ? x + 3 : x - 5, y - 12 - leap, 1, 3, '#d8c9a2'); R(right ? x + 5 : x - 3, y - 12 - leap, 1, 3, '#d8c9a2'); R(right ? x + 2 : x - 6, y - 11 - leap, 1, 1, '#d8c9a2'); R(right ? x + 6 : x - 2, y - 11 - leap, 1, 1, '#d8c9a2'); }
        R(x - 2 + step, y - 2 - leap, 1, 3, '#5a3f26'); R(x + 1 - step, y - 2 - leap, 1, 3, '#5a3f26');
      }
    }
    // the shepherd and his dog, with the larger flocks
    if ((K === 'sheep' || K === 'pigs' || K === 'geese') && hv(5) > 0.45 && H.n >= 4) {
      const sx = Math.round(cx - (vx >= 0 ? 16 : -16)), sy = Math.round(cy + 6), mv = Math.abs(vx) > 0.9;
      vilPerson(ctx, sx, sy, { face: vx >= 0 ? 'right' : 'left', walk: T * 6, moving: mv, tunic: ['#8a6a4a', '#6a5a3a', '#7a4a3a'][Math.floor(hv(6) * 3)], hair: hv(7) > 0.5 ? '#8a8a8a' : '#2a1c14' });
      R(sx + (vx >= 0 ? 5 : -5), sy - 16, 1, 16, '#6b4f2c'); R(sx + (vx >= 0 ? 5 : -6), sy - 17, 2, 1, '#6b4f2c');      // his crook
      if (K === 'sheep' && hv(8) > 0.35) { const an = T * 0.5 + hv(9) * 6, dx = Math.round(cx + Math.cos(an) * 15), dy = Math.round(cy + Math.sin(an) * 9), dr = -Math.sin(an) > 0; R(dx - 2, dy + 1, 5, 1, 'rgba(0,0,0,.2)'); R(dx - 2, dy - 2, 4, 2, '#2a241e'); R(dr ? dx + 2 : dx - 3, dy - 3, 2, 2, '#2a241e'); R(dr ? dx - 3 : dx + 2, dy - 3, 1, 1, '#f1ead8'); R(dx - 2 + (Math.sin(T * 12) > 0 ? 1 : 0), dy, 1, 1, '#1c1614'); R(dx + 1, dy, 1, 1, '#1c1614'); }
    }
    for (const B of beasts) provUnder(ctx, B.x, B.y, 6);      // whichever of them are behind an arch or under the aqueduct
  }
  { const span = WILD.W + 400, run = T * 16, lap = Math.floor(run / span), gx = (run % span) - 200, gy = 150 + wildHash(lap, 7, 694) * (WILD.H - 300) + Math.sin(T * 0.2) * 20;      // wild geese going over, high up, from one side of the province to the other
    if (inView(gx, gy, 60)) for (let i = 0; i < 9; i++) { const k2 = Math.abs(i - 4), x = Math.round(gx - k2 * 5), y = Math.round(gy + (i - 4) * 4), fl = Math.sin(T * 6 + i) > 0 ? 1 : 0; if (!wildSeen(Math.max(5, Math.min(WILD.W - 5, x)), Math.max(5, Math.min(WILD.H - 5, y)))) continue; R(x - 2, y - fl, 2, 1, '#8a8478'); R(x + 1, y - fl, 2, 1, '#8a8478'); R(x, y, 2, 1, '#5a544a'); R(x + 2, y, 1, 1, '#3a342e'); R(x - 1, y + 34, 3, 1, 'rgba(0,0,0,.08)'); } }
  // birds on the wing over the places that draw them
  for (const Bd of (prov.birds || [])) {
    if (!inView(Bd.x, Bd.y, 60) || !wildSeen(Bd.x, Bd.y)) continue;
    if (Bd.kind === 'kestrel') {                 // it hangs on the wind, slides a little way, hangs again; now and then it drops
      const cyc = (T * 0.12 + Bd.x) % 3, slide = Math.floor(T * 0.12 + Bd.x), hx = Math.round(Bd.x + (wildHash(slide, Bd.y, 692) - 0.5) * Bd.r * 2), stoop = cyc > 2.7 ? (cyc - 2.7) / 0.3 : 0, hy = Math.round(Bd.y + (wildHash(Bd.x, slide, 693) - 0.5) * 12 + stoop * 20), fl = stoop ? 0 : Math.sin(T * 22) > 0 ? 1 : 0;
      R(hx - 2, hy - fl, 2, 1, '#a8643a'); R(hx + 1, hy - fl, 2, 1, '#a8643a'); R(hx, hy, 1, 2, '#8a4a2a'); R(hx, hy + 2, 1, 1, '#3a2a22'); R(hx - 1, hy + 22 - stoop * 20, 3, 1, 'rgba(0,0,0,.12)');
      continue;
    }
    if (Bd.kind === 'starling') {                // a flock that moves as one thing, stretching and folding
      const cx = Bd.x + Math.cos(T * 0.23 + Bd.y) * Bd.r, cy = Bd.y + Math.sin(T * 0.31 + Bd.x) * Bd.r * 0.5, sq = 0.6 + 0.4 * Math.sin(T * 0.5 + Bd.x);
      for (let i = 0; i < Bd.n; i++) { const an = T * 1.1 + i * 0.7, x = Math.round(cx + Math.cos(an + Math.sin(T * 0.4 + i) * 0.8) * (5 + (i % 5) * 2.4) * (1.6 - sq)), y = Math.round(cy + Math.sin(an * 1.3 + i) * (3 + (i % 4) * 1.6) * sq); R(x, y, 1, 1, '#1c1614'); if (i % 3 === 0) R(x + 1, y, 1, 1, '#1c1614'); }
      R(Math.round(cx) - 4, Math.round(cy) + 24, 9, 2, 'rgba(0,0,0,.07)');
      continue;
    }
    if (Bd.kind === 'duck') {                    // a skein in a line or a V, down the lake and back
      const ph = T * 0.11 + Bd.x, cx = Bd.x + Math.sin(ph) * Bd.r, d = Math.cos(ph) > 0 ? 1 : -1, mid = (Bd.n - 1) / 2;
      for (let i = 0; i < Bd.n; i++) { const x = Math.round(cx - d * Math.abs(i - mid) * 4), y = Math.round(Bd.y + (i - mid) * 3 + Math.sin(T * 0.7 + i) * 1), fl = Math.sin(T * 12 + i * 1.3) > 0 ? 1 : 0; R(x - 1, y - fl, 1, 1, '#5a4a3a'); R(x + 1, y - fl, 1, 1, '#5a4a3a'); R(x, y, 1, 1, '#3a2a22'); R(x + d, y, 1, 1, '#2f6a3a'); R(x, y + 12, 2, 1, 'rgba(0,20,40,.12)'); }
      continue;
    }
    for (let i = 0; i < Bd.n; i++) {
      const sp = Bd.kind === 'eagle' ? 0.25 : Bd.kind === 'gull' ? 0.6 : Bd.kind === 'swallow' ? 1.7 : Bd.kind === 'heron' ? 0.14 : 0.8, an = T * sp * (i % 2 ? -1 : 1) + i * 2.1 + Bd.x, r = Bd.r * (0.7 + (i % 3) * 0.2);
      const x = Math.round(Bd.x + Math.cos(an) * r), y = Math.round(Bd.y + Math.sin(an) * r * 0.5), flap = Math.sin(T * (Bd.kind === 'eagle' ? 2 : Bd.kind === 'heron' ? 3 : Bd.kind === 'swallow' ? 14 : 7) + i) > 0 ? 1 : 0, c = Bd.kind === 'gull' ? '#f4f4f0' : Bd.kind === 'eagle' ? '#4a3a2a' : Bd.kind === 'swallow' ? '#2a3a5a' : Bd.kind === 'heron' ? '#c8ccd0' : '#1c1614', w = Bd.kind === 'eagle' || Bd.kind === 'heron' ? 4 : 2;
      R(x - w, y - flap, w, 1, c); R(x + 1, y - flap, w, 1, c); R(x, y, 1, 1, c); if (Bd.kind === 'eagle') { R(x - w - 1, y - flap - 1, 1, 1, c); R(x + w + 1, y - flap - 1, 1, 1, c); R(x, y - 1, 1, 1, '#e8e2d2'); }
      R(x - 1, y + 14, 3, 1, 'rgba(0,0,0,.12)');
    }
  }
}

// The town. It is drawn live, because it grows: the arena gets bigger as the school's name does. A wall with towers
// and a gate wherever a road comes in; inside, two great streets crossing at the forum, the temple on its podium,
// the baths, houses in rows, the amphitheatre, and in the south-west corner your own school under its red flag.
// The school's stables: outside the east wall, by the road, where the column forms up. An empty paddock until they
// are built; then a shed and a mule, then stalls and a cart, then a tiled range with a wagon and a team.
const STABLES = { x: WILD.TOWN.x + 50, y: WILD.TOWN.y + 12 };
function drawStables(ctx, T, R, night) {
  const l = (G.fac && G.fac.stables) | 0, x = STABLES.x, y = STABLES.y, v = q => wildHash(q, 77, 1900);
  // the yard: trodden earth, ragged at its edges
  for (let dy = -9; dy <= 7; dy++) { const w = Math.round(21 * Math.sqrt(1 - (dy * dy) / 90) + (v(dy + 20) - 0.5) * 4); R(x - w + Math.round((v(dy + 50) - 0.5) * 3), y + dy, w * 2, 1, dy % 3 === 0 ? '#b59a64' : '#c2a674'); }
  for (let q = 0; q < 10; q++) R(x - 16 + Math.floor(v(q) * 32), y - 6 + Math.floor(v(q + 10) * 12), 2, 1, q % 2 ? '#a8894f' : '#d2b884');
  // the paddock rail round it, with a gap on the town side
  for (let q = -20; q <= 20; q += 5) { R(x + q, y + 6, 1, 3, '#6b4f2c'); if (q > -20) R(x + q - 5, y + 7, 5, 1, '#8a6a3a'); }
  for (let q = -6; q <= 6; q += 4) R(x + 20, y + q, 1, 3, '#6b4f2c'); R(x + 20, y - 5, 1, 12, '#8a6a3a');
  R(x - 10, y + 2, 7, 3, '#6b4f2c'); R(x - 9, y + 2, 5, 1, '#6fa8c8');                                           // the trough
  if (!l) { R(x + 6, y - 10, 1, 9, '#5a4326'); R(x + 3, y - 10, 7, 4, '#d8c9a0'); R(x + 4, y - 9, 5, 1, '#8a6a3a'); R(x + 4, y - 7, 4, 1, '#8a6a3a'); return; }      // nothing built: a board on a post says whose ground it is
  const w = 14 + l * 7, bx = x - 18, by = y - 2;
  R(bx + 1, by, w + 2, 2, 'rgba(0,0,0,.22)');
  R(bx, by - 10, w, 10, l >= 3 ? '#dccba0' : l === 2 ? '#a8834a' : '#8a6a3a'); R(bx, by - 10, 1, 10, l >= 3 ? '#efe2bc' : '#a8834a'); R(bx + w - 1, by - 10, 1, 10, l >= 3 ? '#b8a67c' : '#6b4f2c');
  for (let q = 2; q < w - 4; q += 7) { R(bx + q, by - 8, 5, 8, '#2a1c14'); R(bx + q, by - 4, 5, 1, '#6b4f2c'); }                                              // the stalls, each with its half door
  if (l >= 3) { for (let q = 0; q < 5; q++) R(bx - 1, by - 15 + q, w + 2, 1, q === 0 ? '#e08a5e' : q % 2 ? '#b5522e' : '#d06a3e'); for (let q = 1; q < w; q += 3) R(bx + q, by - 14, 1, 4, '#a8482a'); }
  else { R(bx - 1, by - 13, w + 2, 3, '#9a7a42'); R(bx - 1, by - 13, w + 2, 1, '#b8964e'); for (let q = 1; q < w; q += 4) R(bx + q, by - 12, 1, 2, '#7a5a2a'); }
  // a mule looking out over its door, flicking an ear
  const ear = Math.sin(T * 0.8) > 0.7 ? 1 : 0; R(bx + 3, by - 6, 4, 2, '#8a6a4a'); R(bx + 6, by - 7, 2, 2, '#8a6a4a'); R(bx + 6 + ear, by - 8, 1, 1, '#6f5a48');
  if (l >= 2) {                                // a cart in the yard; at the last, a wagon with its hoops, and the team beside it
    const cx = x + 6, cy = y + 3; R(cx - 1, cy + 3, l >= 3 ? 15 : 11, 1, 'rgba(0,0,0,.2)'); R(cx, cy - 2, l >= 3 ? 13 : 9, 4, '#8a6a3a'); R(cx, cy - 3, l >= 3 ? 13 : 9, 1, '#a8834a'); R(cx + 1, cy + 1, 3, 3, '#3a2a1c'); R(cx + (l >= 3 ? 9 : 5), cy + 1, 3, 3, '#3a2a1c'); R(cx - 4, cy, 4, 1, '#6b4f2c');
    if (l >= 3) { R(cx + 1, cy - 7, 11, 4, '#e8dcc0'); R(cx + 1, cy - 7, 11, 1, '#f8f0dc'); R(cx + 4, cy - 7, 1, 4, '#c9b890'); R(cx + 8, cy - 7, 1, 4, '#c9b890'); }
  }
  if (l >= 3) { const tail = Math.sin(T * 3) > 0.6 ? 1 : 0; for (const [mx, c] of [[-4, '#8a6a4a'], [-13, '#6f5a48']]) { R(x + mx, y + 5, 7, 1, 'rgba(0,0,0,.2)'); R(x + mx, y, 6, 4, c); R(x + mx + 5, y - 2, 3, 3, c); R(x + mx + 7, y - 3, 1, 1, c); R(x + mx - 1, y + tail, 1, 2, '#3a2a1c'); R(x + mx + 1, y + 4, 1, 1, '#3a2a1c'); R(x + mx + 4, y + 4, 1, 1, '#3a2a1c'); }
    R(x - 22, y - 1, 6, 5, '#d9c070'); R(x - 21, y - 2, 4, 1, '#e6d088'); R(x - 22, y + 2, 6, 1, '#b89a4a'); }      // the team, and hay for it
  if (night > 0.35) { const fl = Math.sin(T * 11) > 0 ? 1 : 0; R(bx + w, by - 9 - fl, 1, 2 + fl, '#f5c04a'); }      // a lamp at the corner after dark
}
function drawTown(ctx, T, R, tx, ty, tr, night) {
  const X0 = tx - 44, X1 = tx + 19, Y0 = ty - 26, Y1 = ty + 12, W = X1 - X0, gx = Math.floor(tx / 10) * 10 + 5, hv = q => wildHash(q, 77, 1400), lit = night > 0.3;
  const wall = '#b8ab94', wl = '#d8cdb6', wd = '#8f846e', road = k => k === T_ROAD || k === T_BRIDGE;
  const flag = (fx, fy, c) => { const wv = Math.sin(T * 5 + fx) > 0 ? 1 : 0; R(fx, fy - 7, 1, 7, '#5a4326'); R(fx + 1, fy - 7 + wv, 3, 3, c); R(fx + 4, fy - 6 - wv + 1, 2, 2, shade(c, 0.85)); };
  const tower = (x, y) => { R(x, y, 7, 11, '#c9bca8'); R(x, y, 2, 11, '#e0d6c4'); R(x + 5, y, 2, 11, '#a89c88'); for (let q = 0; q < 7; q += 2) R(x + q, y - 2, 1, 2, '#c9bca8'); R(x + 3, y + 4, 1, 3, lit ? '#f5c04a' : '#3a2a1c'); R(x, y + 11, 7, 1, wd); };
  const house = (x, y, w, i) => { const wc = ['#e2d2a8', '#f0e8d6', '#d8c9a2', '#e8dcc0'][Math.floor(hv(i) * 4)], rc = ['#a8482a', '#b5522e', '#9a4228', '#b8603a', '#8a6a3a'][Math.floor(hv(i + 40) * 5)]; R(x, y, w, 4, wc); R(x + w - 1, y, 1, 4, shade(wc, 0.85)); R(x - 1, y - 2, w + 2, 2, rc); R(x, y - 3, w, 1, shade(rc, 1.2)); R(x + 1 + Math.floor(hv(i + 80) * (w - 3)), y + 2, 1, 2, '#3a2416'); if (w > 5) R(x + w - 3, y + 1, 1, 1, lit && hv(i + 120) > 0.35 ? '#f5c04a' : '#3a2a1c'); };
  R(X0 - 2, Y1 + 3, W + 5, 3, 'rgba(0,0,0,.25)');
  // the ground inside, the north wall behind everything, and the streets
  R(X0, Y0, W, Y1 - Y0, '#cdbfa0'); for (let q = 0; q < 26; q++) R(X0 + 2 + Math.floor(hv(q + 200) * (W - 5)), Y0 + 4 + Math.floor(hv(q + 230) * (Y1 - Y0 - 8)), 2, 1, q % 2 ? '#bfb192' : '#d8cbae');
  R(X0 - 2, Y0 - 3, W + 4, 5, wall); R(X0 - 2, Y0 - 3, W + 4, 1, wl); R(X0 - 2, Y0 + 1, W + 4, 1, wd); for (let q = 0; q < W + 4; q += 4) R(X0 - 2 + q, Y0 - 5, 2, 2, wl);
  R(X0, ty - 1, W, 3, '#b3a688'); R(gx - 1, Y0 + 2, 3, Y1 - Y0 - 3, '#b3a688'); for (let q = 0; q < W; q += 5) R(X0 + q, ty, 2, 1, '#a39678'); for (let q = 3; q < Y1 - Y0 - 3; q += 5) R(gx, Y0 + q, 1, 2, '#a39678');
  { const ax = tx - 36, p2 = (T * 1.2) % 1; R(ax, Y0 - 5, 4, 6, '#c9c2ae'); R(ax + 1, Y0 - 5, 2, 6, '#6fa8c8'); R(ax + 1, Y0 + 1, 2, 5, '#9ccbe8'); R(ax + 1, Y0 + 1 + Math.round(p2 * 4), 1, 1, '#e6f3fa'); R(ax - 1, Y0 + 6, 6, 3, '#b8ab94'); R(ax, Y0 + 6, 4, 2, '#5a9cc6'); R(ax + 1, Y0 + 6, 2, 1, '#b4d6ea'); }      // where the aqueduct comes over the wall and falls to a basin
  // houses along the north wall and in the south quarters
  for (let q = 0; q < 3; q++) house(tx - 14 + q * 6 - (q === 2 ? 1 : 0), Y0 + 6, 5, q);
  for (let q = 0; q < 4; q++) house(tx - 23 + q * 7, ty + 6, 5 + (q % 2), 10 + q);
  // the amphitheatre: a ring that grows with your fame
  { const rx = Math.min(13, 7 + tr), ry = Math.min(8, 4 + Math.floor(tr / 2)), ax = tx - 29, ay = ty - 13;
    for (let dy = -ry; dy <= ry; dy++) { const w = Math.round(rx * Math.sqrt(1 - (dy * dy) / (ry * ry + 0.4))); R(ax - w, ay + dy, w * 2 + 1, 1, dy < 0 ? '#e0d6c4' : '#c9bca8'); if (Math.abs(dy) < ry - 1) { R(ax - w + 2, ay + dy, w * 2 - 3, 1, '#b8a888'); if (Math.abs(dy) < ry - 2) R(ax - w + 3, ay + dy, w * 2 - 5, 1, '#d9b877'); } }
    R(ax - rx, ay + ry + 1, rx * 2 + 1, 2, '#a89c88'); for (let q = -rx + 1; q < rx; q += 2) R(ax + q, ay + ry + 1, 1, 2, '#5a4a3a'); R(ax - rx, ay + ry + 3, rx * 2 + 1, 1, 'rgba(0,0,0,.25)');
    if (tr >= 2) { flag(ax - rx + 1, ay - ry + 2, '#c9a21e'); flag(ax + rx - 2, ay - ry + 2, '#c9a21e'); }
    if (tr >= 3) for (let q = -rx + 3; q < rx - 2; q += 4) R(ax + q, ay - ry + 1, 2, 1, '#c23b2e'); }
  // the forum: a square with a colonnade along its back, a column in the middle, stalls under awnings, a fountain
  { const fx = tx - 13, fy = ty - 10; R(fx, fy, 15, 8, '#dccfae'); R(fx, fy, 15, 1, '#b8ab94'); for (let q = 0; q < 15; q += 2) R(fx + q, fy + 1, 1, 3, '#f0e8d6'); R(fx, fy - 2, 15, 2, '#b5522e'); R(fx, fy - 2, 15, 1, '#d06a3e');
    R(fx + 7, fy + 2, 1, 5, '#e8e2d2'); R(fx + 6, fy + 6, 3, 1, '#c9c2ae'); R(fx + 7, fy + 1, 1, 1, tr >= 3 ? '#e8b545' : '#b98a34');
    for (let q = 0; q < 3; q++) { R(fx + 1 + q * 2 + (q === 2 ? 7 : 0), fy + 5, 2, 2, ['#b93a2e', '#f1ead8', '#3a6ea8'][q]); R(fx + 1 + q * 2 + (q === 2 ? 7 : 0), fy + 7, 2, 1, '#8a6a3a'); }
    const sp = Math.sin(T * 6) > 0 ? 1 : 0; R(fx + 10, fy + 3, 3, 2, '#8f8676'); R(fx + 11, fy + 3, 1, 1, '#6fa8c8'); R(fx + 11, fy + 1 + sp, 1, 2 - sp, '#cfe6f2'); }
  // the temple on its podium, gold at the gable
  { const px = tx + 8, py = ty - 20; R(px - 1, py + 10, 12, 2, '#c9c2ae'); R(px, py + 3, 10, 7, '#e8e2d2'); for (let q = 0; q < 5; q++) R(px + q * 2 + (q > 2 ? 1 : 0), py + 4, 1, 6, '#c9c2ae'); for (let q = 0; q < 3; q++) R(px + q, py + 2 - q, 10 - q * 2, 1, q === 0 ? '#d8d2c0' : '#e8e2d2'); R(px + 4, py - 1, 2, 1, '#e8b545'); R(px + 4, py + 7, 2, 3, '#3a2416'); R(px + 2, py + 12, 6, 1, '#b5ad9c'); if (lit) R(px + 4, py + 8, 2, 1, '#f5c04a'); }
  // the baths, under a dome, the hot room steaming
  { const bx = tx + 8, by = ty + 3; R(bx, by + 2, 9, 5, '#e2d6b8'); R(bx + 8, by + 2, 1, 5, '#c4b898'); for (let q = 0; q < 3; q++) R(bx + 1 + q, by + 1 - q, 7 - q * 2, 1, q ? '#c8683e' : '#b5522e'); R(bx + 2, by + 4, 1, 2, '#3a2a1c'); R(bx + 5, by + 4, 1, 2, lit ? '#f5c04a' : '#3a2a1c'); R(bx, by + 7, 9, 1, '#a89c88'); }
  // a block of flats, a granary, and trees in a garden
  R(tx + 8, ty - 6, 5, 4, '#d8c9a2'); R(tx + 8, ty - 9, 5, 3, '#c9b890'); R(tx + 7, ty - 10, 7, 1, '#a8482a'); for (let q = 0; q < 2; q++) { R(tx + 9 + q * 2, ty - 8, 1, 1, lit ? '#f5c04a' : '#3a2a1c'); R(tx + 9 + q * 2, ty - 5, 1, 1, '#3a2a1c'); }
  R(tx + 14, ty - 6, 4, 4, '#b8ab94'); R(tx + 14, ty - 7, 4, 1, '#8a6a3a'); for (let q = 0; q < 4; q += 2) R(tx + 14 + q, ty - 5, 1, 3, '#8f846e');
  for (const [cxx, cyy] of [[-40, -22], [-37, -21], [-16, -14], [1, 8]]) { R(tx + cxx, ty + cyy + 3, 1, 2, '#4a3320'); R(tx + cxx - 1, ty + cyy, 3, 3, '#35602b'); R(tx + cxx - 1, ty + cyy, 1, 1, '#4c7f38'); }
  // your own school: a yard walled about, the barracks along two sides, and the red flag over the gate
  { const lx = tx - 42, ly = ty + 2; R(lx, ly, 15, 9, '#d9c79c'); R(lx, ly, 15, 2, '#a8452e'); R(lx, ly, 15, 1, '#c25a3a'); R(lx, ly + 2, 3, 7, '#d2bf98'); R(lx, ly + 2, 1, 7, '#a8452e'); R(lx + 4, ly + 3, 10, 5, '#d9b877'); R(lx + 14, ly + 2, 1, 7, '#b8ab94'); R(lx, ly + 8, 15, 1, '#b8ab94');
    R(lx + 8, ly + 5, 1, 2, '#6b4f2c'); R(lx + 7, ly + 5, 3, 1, '#6b4f2c'); const sw = Math.sin(T * 3) > 0 ? 1 : 0; R(lx + 5 + sw, ly + 5, 1, 2, '#d9a57c'); R(lx + 11 - sw, ly + 5, 1, 2, '#d9a57c'); R(lx + 5 + sw, ly + 6, 1, 1, '#8a2a20'); R(lx + 11 - sw, ly + 6, 1, 1, '#2f5a8a');
    const men = Math.min(5, Math.max(0, ((G.roster || []).filter(g => !g.away).length) - 2)); for (let q = 0; q < men; q++) { R(lx + 4 + q * 2, ly + 3, 1, 1, '#d9a57c'); R(lx + 4 + q * 2, ly + 4, 1, 1, ['#8a6a4a', '#7a4a3a', '#6a5a3a'][q % 3]); }      // the rest of your men, lined along the wall watching
    flag(lx + 13, ly + 1, '#c23b2e'); }
  // people about in the streets
  for (let q = 0; q < 5; q++) { const along = q < 3, ph = (T * (0.05 + hv(q + 300) * 0.04) + hv(q + 310)) % 1, back = Math.floor(T * 0.05 + q) % 2, f = back ? 1 - ph : ph, px = along ? X0 + 3 + f * (W - 8) : gx + (q % 2 ? 1 : -1), py = along ? ty + (q % 2 ? 1 : -1) : Y0 + 5 + f * (Y1 - Y0 - 12); R(Math.round(px), Math.round(py) - 2, 1, 1, '#d9a57c'); R(Math.round(px), Math.round(py) - 1, 1, 2, ['#8a4a3a', '#e8e2d2', '#4a6a8a', '#7a7a3a', '#8a2a6a'][q]); }
  // the side walls, the south wall in front of it all, the towers, and a gate wherever a road comes in
  R(X0 - 2, Y0 - 3, 3, Y1 - Y0 + 5, wall); R(X0 - 2, Y0 - 3, 1, Y1 - Y0 + 5, wl); R(X1 - 1, Y0 - 3, 3, Y1 - Y0 + 5, wall); R(X1 + 1, Y0 - 3, 1, Y1 - Y0 + 5, wd);
  R(X0 - 2, Y1 - 2, W + 4, 6, '#b0a48c'); R(X0 - 2, Y1 - 2, W + 4, 1, wl); R(X0 - 2, Y1 + 3, W + 4, 1, wd); for (let q = 0; q < W + 4; q += 6) { R(X0 - 2 + q, Y1, 1, 3, '#a09478'); R(X0 + 1 + q, Y1 + 1, 1, 2, '#a09478'); } for (let q = 0; q < W + 4; q += 4) R(X0 - 2 + q, Y1 - 4, 2, 2, wl);
  tower(X0 - 4, Y0 - 5); tower(X1 - 2, Y0 - 5); tower(X0 - 4, Y1 - 7); tower(X1 - 2, Y1 - 7); tower(tx - 16, Y1 - 7);
  flag(X1 + 1, Y0 - 6, '#a02d22'); flag(X0 - 1, Y1 - 8, '#a02d22');
  const fl = Math.sin(T * 11) > 0 ? 1 : 0, torch = (qx, qy) => { if (lit) { R(qx, qy - 1 - fl, 1, 2 + fl, '#f5c04a'); R(qx, qy - 2 - fl, 1, 1, '#fff0b0'); } };
  R(X1 - 3, ty - 6, 6, 10, wd); R(X1 - 3, ty - 7, 6, 1, wl); R(X1 - 2, ty - 2, 5, 6, '#3a2416'); R(X1 - 2, ty - 3, 5, 1, '#5a4326'); for (let q = 0; q < 6; q += 2) R(X1 - 3 + q, ty - 9, 1, 2, wl); torch(X1 + 3, ty - 3); torch(X1 + 3, ty + 4); for (const gy of [-4, 6]) { R(X1 + 4, ty + gy - 4, 1, 1, '#d9a57c'); R(X1 + 4, ty + gy - 3, 1, 3, '#a8261c'); R(X1 + 4, ty + gy - 5, 1, 1, '#c1c7cc'); R(X1 + 5, ty + gy - 7, 1, 7, '#6b4f2c'); R(X1 + 5, ty + gy - 8, 1, 1, '#c1c7cc'); }      // the east gate, and the two men on it
  if (road(wildTile(gx, Y1 + 8))) { R(gx - 4, Y1 - 5, 9, 9, wd); R(gx - 4, Y1 - 6, 9, 1, wl); R(gx - 2, Y1 - 1, 5, 5, '#3a2416'); R(gx - 2, Y1 - 2, 5, 1, '#5a4326'); R(gx - 1, Y1 - 3, 3, 1, '#5a4326'); for (let q = 0; q < 9; q += 2) R(gx - 4 + q, Y1 - 8, 1, 2, wl); torch(gx - 4, Y1 + 1); torch(gx + 4, Y1 + 1); }      // the south gate
  if (road(wildTile(gx, Y0 - 9))) { R(gx - 3, Y0 - 5, 7, 7, wd); R(gx - 2, Y0 - 2, 5, 4, '#3a2416'); for (let q = 0; q < 7; q += 2) R(gx - 3 + q, Y0 - 7, 1, 2, wl); }                                                                                                             // the north gate
  if (road(wildTile(X0 - 8, ty))) { R(X0 - 3, ty - 6, 5, 10, wd); R(X0 - 3, ty - 7, 5, 1, wl); R(X0 - 3, ty - 2, 4, 6, '#3a2416'); for (let q = 0; q < 5; q += 2) R(X0 - 3 + q, ty - 9, 1, 2, wl); torch(X0 - 4, ty - 3); }                                                           // the west gate
}

// What moves at the landmarks. The land is painted once; these are drawn over it each frame: the beacon's fire, the
// mill wheel going round, steam off the hot spring, a flag on the watchtower, men at their work. After dark the
// windows of every house out in the country show a light.
function drawMarks(ctx, T, R, inView, night, smoke) {
  const lit = night > 0.3, fl = Math.sin(T * 11) > 0 ? 1 : 0, glow = (gx, gy, r, c, a) => { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(${c},${a})`; for (let q = 0; q < 3; q++) { const rr = r - q * (r / 3.5); ctx.fillRect(Math.round(gx - rr), Math.round(gy - rr * 0.7), Math.round(rr * 2), Math.round(rr * 1.4)); } ctx.globalCompositeOperation = 'source-over'; };
  const man = (mx, my, o) => vilPerson(ctx, mx, my, Object.assign({ face: 'right', walk: T * 6, moving: true, tunic: '#8a6a4a', hair: '#3a2a1c' }, o));
  const pace = (x0, x1, sp, ph) => { const u = (T * sp + ph) % 2, f = u < 1 ? u : 2 - u; return { x: Math.round(x0 + (x1 - x0) * f), face: (u < 1) === (x1 > x0) ? 'right' : 'left' }; };
  // more that moves, and what is lit after dark, for the landmarks that had little of either
  const beast = (bx, by, c, d) => { R(bx - 1, by + 3, 6, 1, 'rgba(0,0,0,.2)'); R(bx, by, 5, 3, c); R(d > 0 ? bx + 4 : bx - 2, by - 1 + (Math.sin(T * 1.7 + bx) > 0.3 ? 2 : 0), 3, 2, c); R(bx + 1, by + 3, 1, 1, '#2a1c14'); R(bx + 3, by + 3, 1, 1, '#2a1c14'); };
  const win = (wx, wy, w, hh) => { if (!lit) return; R(wx, wy, w, hh, '#f5c04a'); glow(wx + 1, wy + 1, 9, '255,180,90', 0.06); };
  const MORE = {
    'The fallen colossus': (x, y) => { const pc = pace(x + 8, x + 34, 0.03, 0.2); beast(pc.x, y + 13, '#f1ead8', pc.face === 'right' ? 1 : -1); beast(x + 44, y + 12, '#e8e0cc', -1); const dz = Math.floor(T * 0.4) % 3; R(x + 3 + dz * 4, y - 3, 2, 1, '#5f8f3a'); R(x + 5 + dz * 4, y - 3, 1, 1, '#7aa84a'); for (let q = 0; q < 2; q++) { const an = T * 1.6 + q * 3; R(x + 24 + Math.cos(an) * 6, y + Math.sin(an * 1.4) * 4, 1, 1, q ? '#f4f4f0' : '#e8c040'); } },      // sheep grazing round it, a lizard on its brow, butterflies
    'The bones of a whale': (x, y) => { const rib = Math.floor(T * 0.35) % 6, hh = 6 + Math.round(Math.sin((rib + 0.5) / 6 * Math.PI) * 6), hop = Math.sin(T * 6) > 0.7 ? 1 : 0; R(x + 4 + rib * 4, y + 3 - hh - hop, 2, 2, '#f4f4f0'); R(x + 6 + rib * 4, y + 3 - hh - hop, 1, 1, '#e3b04a'); const pc = pace(x + 2, x + 30, 0.06, 0.4); R(pc.x, y + 9, 2, 1, '#c23b2e'); R(pc.x - 1, y + 9 + (Math.floor(T * 8) % 2), 1, 1, '#c23b2e'); R(pc.x + 2, y + 9 + (Math.floor(T * 8 + 1) % 2), 1, 1, '#c23b2e'); },      // a gull going from rib to rib, and a crab
    "The fishers' huts": (x, y) => { smoke(x + 5, y - 5, 3); const sw = Math.sin(T * 1.2) > 0 ? 1 : 0; R(x + 24 + sw, y + 2, 6, 1, '#b5ad9c'); const pc = pace(x + 26, x + 38, 0.05, 0.1); man(pc.x, y + 15, { face: pc.face, tunic: '#4a6a8a' }); win(x + 1, y + 4, 2, 2); win(x + 14, y + 4, 2, 2); for (let q = 0; q < 2; q++) { const an = T * 0.5 + q * 3; R(x + 30 + Math.cos(an) * 16, y - 14 + Math.sin(an) * 5, 3, 1, '#f4f4f0'); } },      // smoke, a net stirring, a man at his boat, gulls over it
    "The hunters' lodge": (x, y) => { smoke(x + 19, y - 13, 3); const tw = Math.sin(T * 7) > 0 ? 1 : 0; R(x + 2 - tw, y + 8, 1, 1, '#7a6a52'); const sg = Math.round(Math.sin(T * 0.9) * 1); R(x + 33 + sg, y, 2, 1, '#5e4426'); win(x + 16, y + 1, 4, 4); const pc = pace(x + 26, x + 40, 0.04, 0.6); man(pc.x, y + 14, { face: pc.face, tunic: '#5a6a3a' }); },      // smoke, the dog's tail, a hunter about the yard
    'The unfinished columns': (x, y) => { const hit = Math.sin(T * 4.4) > 0.3; man(x + 46, y + 12, { face: 'left', moving: false, tunic: '#7a6a4a' }); R(x + 41, y + (hit ? 5 : 2), 3, 1, '#6b4f2c'); R(x + 40, y + (hit ? 4 : 1), 2, 2, '#8f8a84'); if (hit) { R(x + 38, y + 3, 1, 1, '#ffffff'); R(x + 36, y + 5, 1, 1, '#f0ece0'); } for (let q = 0; q < 2; q++) { const p2 = (T * 0.2 + q / 2) % 1; ctx.globalAlpha = 0.3 * (1 - p2); R(x + 34 + q * 4 + Math.sin(p2 * 4) * 2, y + 4 - p2 * 8, 3, 2, '#f4f0e4'); } ctx.globalAlpha = 1; },      // one mason still at it
    "The giant's table": (x, y) => { const u = (T * 0.08) % 1; if (u < 0.8) { const hp = Math.floor(T * 0.7) % 4; R(x + 4 + hp * 5, y - 13 - (Math.sin(T * 5) > 0.8 ? 1 : 0), 2, 1, '#1c1310'); R(x + 6 + hp * 5, y - 13, 1, 1, '#1c1310'); } else { const f = (u - 0.8) / 0.2; R(x + 12 + f * 30, y - 14 - f * 22, 3, 1, '#1c1310'); R(x + 13 + f * 30, y - 15 - f * 22 + (Math.sin(T * 14) > 0 ? 1 : 0), 1, 1, '#1c1310'); } if (lit) { glow(x + 11, y + 2, 9, '150,180,255', 0.035 + 0.02 * Math.sin(T * 1.3)); } },      // a crow on the capstone, that goes; and something in the chamber after dark
    'The needle': (x, y) => { const wv = Math.sin(T * 4) > 0 ? 1 : 0; R(x + 8, y - 3, 2 + wv, 1, '#c23b2e'); R(x + 9 + wv, y - 2, 1, 2 + wv, '#c23b2e'); R(x, y - 7 + wv, 2, 1, '#f1ead8'); R(x + 5, y + 4 - fl, 1, 1 + fl, lit ? '#f5c04a' : '#c9a21e'); if (lit) glow(x + 5, y + 5, 8, '255,190,100', 0.05); const pc = pace(x + 14, x + 26, 0.03, 0.8); man(pc.x, y + 14, { face: pc.face, tunic: '#d8c9a0', hair: '#8a8a8a' }); },      // the ribbons in the wind, a lamp at its foot, an old man who has come to ask
    "The shepherds' fold": (x, y) => { for (const [sx, sy, ph] of [[4, 0, 0], [10, 3, 2], [7, 5, 4], [19, 4, 1]]) { const dn = Math.sin(T * 0.9 + ph) > 0.2 ? 1 : 0; R(x + sx + 3, y + sy + dn, 1, 1, '#2a1c14'); } const tw = Math.sin(T * 8) > 0 ? 1 : 0; R(x + 35, y + 5 + tw, 1, 1, '#3a322c'); smoke(x + 31, y - 10, 2); win(x + 30, y - 4, 2, 2); const pc = pace(x + 38, x + 50, 0.03, 0.4); man(pc.x, y + 13, { face: pc.face, tunic: '#8a7a5a', hair: '#c9c2b2' }); R(pc.x + (pc.face === 'right' ? 3 : -3), y + 1, 1, 12, '#8a6a3a'); },      // the sheep with their heads down, the dog, the shepherd with his crook
    'The beacon': (x, y) => { win(x + 25, y + 3, 2, 2); smoke(x + 26, y - 4, 2); },
    'The fort': (x, y) => { R(x + 23, y - 3 - fl, 2, 1 + fl, '#f5c04a'); smoke(x + 24, y - 5, 2); if (lit) glow(x + 24, y - 2, 12, '255,160,80', 0.07); for (const [hx, ph] of [[52, 0], [59, 2]]) R(x + hx - 1, y + 6 + (Math.sin(T * 3 + ph) > 0.5 ? 1 : 0), 1, 2, '#3a2a1c'); const pc = pace(x - 2, x + 6, 0.08, 0.3); R(pc.x, y - 25, 1, 1, '#d9a57c'); R(pc.x, y - 24, 1, 2, '#a8261c'); R(pc.x + 1, y - 27, 1, 4, '#c1c7cc'); },      // the cook-fire, the horses, a sentry on the corner tower
    'The ferry': (x, y) => { R(x + 38, y - 4 - (lit ? fl : 0), 3, 2 + (lit ? fl : 0), lit ? '#fff0b0' : '#f5c04a'); if (lit) glow(x + 39, y - 3, 12, '255,190,100', 0.07); win(x + 10, y, 3, 3); smoke(x + 12, y - 13, 2); },
    'The watchtower': (x, y) => { if (lit) { R(x + 14, y - 26 - fl, 3, 2 + fl, '#f5c04a'); R(x + 15, y - 27 - fl, 1, 1, '#fff0b0'); glow(x + 15, y - 25, 16, '255,160,80', 0.08); } const tl = Math.sin(T * 3) > 0.5 ? 1 : 0; R(x + 20, y + 6 + tl, 1, 2, '#3a2a1c'); },
    'The salt pans': (x, y) => { const ph = Math.floor(T * 2) % 2; R(x - 7, y - 7, 5, 5, '#3a6a80'); if (ph) { R(x - 5, y - 8, 1, 7, '#8a6a3a'); R(x - 8, y - 5, 7, 1, '#8a6a3a'); } else { for (let q = 0; q < 6; q++) { R(x - 8 + q, y - 8 + q, 1, 1, '#8a6a3a'); R(x - 3 - q + 1, y - 8 + q, 1, 1, '#8a6a3a'); } } const p2 = (T * 1.2) % 1; R(x - 2, y - 2 + p2 * 3, 1, 1, '#e6f3fa'); win(x + 49, y - 6, 2, 2); },      // the wheel turning, and water falling from it
    'The drowned temple': (x, y) => { const dip = Math.sin(T * 0.6) > 0.85 ? 2 : 0; R(x + 34, y - 4 + dip, 1, 4 - dip, '#f4f4f0'); R(x + 35, y - 5 + dip, 2, 1, '#f4f4f0'); R(x + 37, y - 5 + dip, 1, 1, '#e3b04a'); for (let q = 0; q < 2; q++) { const rp = (T * 0.4 + q * 0.5) % 1; ctx.globalAlpha = 0.4 * (1 - rp); R(x + 10 + q * 12 - rp * 4, y + 9 + q * 2, 3 + Math.round(rp * 8), 1, '#9ab8b4'); } ctx.globalAlpha = 1; },      // the heron striking, and rings going out on the water
    'The white temple': (x, y) => { const pc = pace(x + 4, x + 32, 0.03, 0.7); man(pc.x, y + 16, { face: pc.face, tunic: '#f1ead8', hair: '#8a8a8a' }); if (lit) glow(x + 18, y + 6, 18, '255,200,120', 0.05); },
    'The lime kiln': (x, y) => { const pc = pace(x + 22, x + 34, 0.06, 0.2); man(pc.x, y + 14, { face: pc.face, tunic: '#d8d4c6' }); },
    'A villa in its garden': (x, y) => { win(x + 5, y - 1, 3, 3); win(x + 29, y - 1, 3, 3); smoke(x + 34, y - 18, 2); },
    'The bee garden': (x, y) => { win(x + 38, y + 1, 2, 2); },
    'The great oak': (x, y) => { const sq = (T * 0.15) % 1, up = sq < 0.5; R(x + 17, y + 6 - Math.round((up ? sq : 1 - sq) * 20), 2, 1, '#a8703c'); R(x + 18, y + 5 - Math.round((up ? sq : 1 - sq) * 20), 1, 1, '#a8703c'); },      // a squirrel, up the trunk and down again
  };
  for (const m of (prov.marks || [])) {
    if (!inView(m.x, m.y, 70) || !wildSeen(m.x + m.r, m.y)) continue;
    if (m.dw) {                                // somebody about the yard, or the hens, or the dog: each dwelling has its own
      const dv = wildHash(m.x, m.y, 1950), d2 = wildHash(m.y, m.x, 1951);
      if (dv < 0.4 && !lit) { const pc = pace(m.x - 4, m.x + 26, 0.03 + d2 * 0.03, d2); man(pc.x, m.y + 15, { face: pc.face, tunic: ['#8a6a4a', '#7a6a4a', '#5a6a8a', '#8a4a3a', '#b8a888'][Math.floor(d2 * 5)], hair: d2 > 0.6 ? '#c9c2b2' : '#3a2a1c' }); }
      else if (dv < 0.7) { for (let q = 0; q < 3; q++) { const pk = Math.sin(T * 5 + q * 2 + dv * 9) > 0 ? 1 : 0, hx = m.x + 2 + q * 5 + Math.round(Math.sin(T * 0.2 + q) * 2); R(hx, m.y + 12 + (q % 2), 2, 2, q % 2 ? '#8a5a32' : '#f1ead8'); R(hx + 2, m.y + 12 + (q % 2) + pk, 1, 1, '#c23b2e'); } }
      else if (dv < 0.88) { const tw = Math.sin(T * 8) > 0 ? 1 : 0, gx = m.x + 20; R(gx - 1, m.y + 14, 6, 1, 'rgba(0,0,0,.2)'); R(gx, m.y + 11, 4, 3, '#7a6a52'); R(gx + 4, m.y + 10, 2, 2, '#7a6a52'); R(gx - 1, m.y + 10 + tw, 1, 2, '#7a6a52'); }
      continue;
    }
    const x = m.x, y = m.y, n = m.name;
    if (MORE[n]) MORE[n](x, y);
    if (n === 'The beacon') { R(x + 6, y - 33 - fl, 5, 5 + fl, '#f5c04a'); R(x + 7, y - 35 - fl, 3, 3, '#fff0b0'); R(x + 8 - fl, y - 37, 1, 2, '#e2702a'); if (lit) { glow(x + 8, y - 31, 30, '255,190,90', 0.08); const an = T * 0.6; ctx.fillStyle = 'rgba(255,230,160,.10)'; for (let q = 4; q < 60; q += 3) ctx.fillRect(Math.round(x + 8 + Math.cos(an) * q), Math.round(y - 31 + Math.sin(an) * q * 0.5), 3 + (q >> 3), 2 + (q >> 4)); } }
    else if (n === 'The mill') { const ph = Math.floor(T * 3) % 4, cx = x + 4, cy = y + 4; R(x, y, 8, 8, '#3d6d92'); for (let q = 0; q < 4; q++) { const an = (q + ph / 4) * Math.PI / 2 + 0.2; for (let rr = 1; rr < 6; rr++) R(Math.round(cx + Math.cos(an) * rr), Math.round(cy + Math.sin(an) * rr), 1, 1, rr === 5 ? '#c9a763' : '#7a5a34'); } R(cx, cy, 1, 1, '#c9a763'); for (let q = 0; q < 3; q++) { const p2 = (T * 1.5 + q * 0.33) % 1; R(x - 3 + q * 5 + p2 * 3, y + 10 - Math.sin(p2 * Math.PI) * 3, 2, 1, '#e6f3fa'); } if (lit) R(x + 23, y - 2, 3, 3, '#f5c04a'); smoke(x + 26, y - 13, 3); }
    else if (n === 'The hot spring') { for (let q = 0; q < 6; q++) { const p2 = (T * 0.25 + q * 0.17) % 1; ctx.globalAlpha = 0.55 * (1 - p2); R(x + 4 + q * 3 + Math.sin(p2 * 6 + q) * 2, y + 2 - p2 * 16, 2 + Math.round(p2 * 3), 2, '#ffffff'); } ctx.globalAlpha = 1; if (Math.sin(T * 2) > 0.6) R(x + 8 + Math.floor(T) % 5, y + 5, 1, 1, '#d8f4f0'); }
    else if (n === 'The lime kiln') { R(x + 8, y + 6 - fl, 4, 4 + fl, '#e2702a'); R(x + 9, y + 7, 2, 2, fl ? '#fff0b0' : '#f5c04a'); smoke(x + 10, y - 12, 4); if (lit) glow(x + 10, y + 8, 14, '255,150,70', 0.09); }
    else if (n === 'The charcoal burners') { smoke(x + 10, y - 3, 4); if (lit) { R(x + 9, y + 9, 2, 1, '#e2702a'); glow(x + 10, y + 6, 12, '255,130,60', 0.06); } const pc = pace(x + 20, x + 30, 0.12, 0.3); man(pc.x, y + 12, { face: pc.face, tunic: '#5a4a3a' }); }
    else if (n === 'The watchtower') { const wv = Math.sin(T * 5) > 0 ? 1 : 0; R(x + 10, y - 30, 1, 10, '#5a4326'); R(x + 11, y - 30 + wv, 4, 3, '#a8261c'); R(x + 15, y - 29 - wv + 1, 2, 2, '#8a2018'); if (lit) { R(x + 9, y - 10, 2, 3, '#f5c04a'); R(x + 6, y - 22 - fl, 1, 2 + fl, '#f5c04a'); glow(x + 6, y - 22, 12, '255,180,90', 0.07); } const pc = pace(x + 5, x + 13, 0.1, 0); R(pc.x, y - 22, 1, 1, '#d9a57c'); R(pc.x, y - 21, 1, 2, '#a8261c'); R(pc.x + (pc.face === 'right' ? 1 : -1), y - 24, 1, 4, '#c1c7cc'); }
    else if (n === 'The bee garden') { for (let q = 0; q < 8; q++) { const an = T * (2 + q % 3) + q * 1.7; R(x + 3 + q * 3.4 + Math.cos(an) * 3, y - 1 + Math.sin(an * 1.3) * 3, 1, 1, q % 3 ? '#2a1c14' : '#e8c040'); } const pc = pace(x - 4, x + 32, 0.05, 0.5); man(pc.x, y + 14, { face: pc.face, tunic: '#e8e2d2', hair: '#c9c2b2' }); }
    else if (n === 'The great oak') { for (let q = 0; q < 2; q++) { const p2 = (T * 0.14 + q * 0.5) % 1.5; if (p2 < 1) R(x + 6 + q * 14 + Math.sin(p2 * 9) * 4, y - 12 + p2 * 22, Math.sin(p2 * 18) > 0 ? 2 : 1, 1, q ? '#8ab04a' : '#b8a040'); } const sw = Math.round(Math.sin(T * 1.6) * 2); R(x + 24 + sw, y + 2, 4, 2, '#8a4a3a'); R(x + 25 + sw, y, 2, 2, '#d9a57c'); }      // somebody on the swing
    else if (n === 'A villa in its garden') { const sp = Math.sin(T * 6) > 0 ? 1 : 0; R(x + 17, y + 13, 5, 2, '#b8ab94'); R(x + 18, y + 13, 3, 1, '#6fa8c8'); R(x + 19, y + 10 + sp, 1, 3 - sp, '#cfe6f2'); R(x + 18 - sp, y + 11, 1, 1, '#cfe6f2'); R(x + 20 + sp, y + 11, 1, 1, '#cfe6f2'); if (lit) { for (const wx of [4, 28]) R(x + wx, y - 2, 5, 5, '#f5c04a'); glow(x + 19, y, 26, '255,200,110', 0.05); } smoke(x + 32, y - 15, 3); const pc = pace(x - 2, x + 12, 0.08, 0.2); man(pc.x, y + 16, { face: pc.face, tunic: '#6a5a3a' }); }
    else if (n === 'The wine press') { const st = Math.sin(T * 4) > 0 ? 1 : 0; R(x + 6, y - 2 - st, 2, 2, '#d9a57c'); R(x + 6, y - st, 2, 4, '#8a6a4a'); R(x + 10, y - 2 - (1 - st), 2, 2, '#d9a57c'); R(x + 10, y - (1 - st), 2, 4, '#6a5a3a'); if (Math.sin(T * 3) > 0.5) R(x + 16, y + 6, 1, 3, '#7a2a4a'); }      // two men treading the grapes
    else if (n === 'The great quarry') {
      // the crane taking a block up off the top shelf, the wheel going round under the men's feet
      const up = (Math.sin(T * 0.5) + 1) / 2, by = y - 40 + Math.round(up * 9), tip = x + 18;
      R(tip, y - 45, 1, by - (y - 45), '#c9b890'); R(tip - 2, by, 5, 4, '#f0ece0'); R(tip - 2, by, 5, 1, '#ffffff'); R(tip + 2, by + 1, 1, 3, '#c4bfae');
      const sp = Math.floor(T * 3) % 2; R(x + 34, y - 27, 5, 5, '#4a3620'); if (sp) { R(x + 34, y - 27, 1, 1, '#8a6a3a'); R(x + 38, y - 23, 1, 1, '#8a6a3a'); R(x + 36, y - 25, 1, 1, '#8a6a3a'); } else { R(x + 38, y - 27, 1, 1, '#8a6a3a'); R(x + 34, y - 23, 1, 1, '#8a6a3a'); R(x + 36, y - 25, 1, 1, '#8a6a3a'); }
      R(x + 35, y - 26 + sp, 2, 3, '#7a6a4a'); R(x + 35, y - 27 + sp, 2, 1, '#d9a57c');
      // a mason at the half-cut block, driving the wedges; another dressing a block on the floor
      const hit = Math.sin(T * 5) > 0.3, hit2 = Math.sin(T * 4.1 + 2) > 0.4;
      man(x + 13, y + 1, { face: 'up', moving: false, tunic: '#7a6a4a' }); R(x + 12, y - (hit ? 12 : 15), 2, 2, '#8f8a84'); R(x + 13, y - (hit ? 10 : 13), 1, 3, '#6b4f2c'); if (hit) { R(x + 10, y - 14, 1, 1, '#ffffff'); R(x + 15, y - 15, 1, 1, '#ffffff'); }
      man(x + 17, y + 8, { face: 'right', moving: false, tunic: '#8a5a3a' }); R(x + 20, y + (hit2 ? 1 : -2), 2, 1, '#6b4f2c'); R(x + 21, y + (hit2 ? 0 : -3), 2, 2, '#8f8a84'); if (hit2) { R(x + 23, y - 2, 1, 1, '#ffffff'); R(x + 25, y - 1, 1, 1, '#f0ece0'); }
      // dust hanging over the floor, an ox shaking its head, and light on the standing water
      for (let q = 0; q < 3; q++) { const p2 = (T * 0.22 + q / 3) % 1; ctx.globalAlpha = 0.35 * (1 - p2); R(x + 12 + q * 8 + Math.sin(p2 * 4 + q) * 3, y - 2 - p2 * 10, 4 + Math.round(p2 * 3), 2, '#f4f0e4'); } ctx.globalAlpha = 1;
      if (Math.sin(T * 1.3) > 0.8) R(x + 69, y + 5, 1, 1, '#f0ece0');
      R(x + 5 + Math.floor((T * 2) % 5), y + 5, 2, 1, '#cfeee8');
      if (lit) { R(x + 54, y - 8, 1, 2 + fl, '#f5c04a'); glow(x + 58, y, 16, '255,190,100', 0.05); }
    }
    else if (n === "The fishers' huts") { smoke(x + 5, y - 5, 3); if (lit) { R(x + 4, y + 5, 3, 5, '#f5c04a'); R(x + 17, y + 5, 3, 5, '#e8a040'); glow(x + 12, y + 6, 18, '255,190,100', 0.05); } const sw = Math.sin(T * 1.2) > 0 ? 1 : 0; R(x + 24 + sw, y + 1, 2, 1, '#c8c0a8'); }
    else if (n === 'The huts on stilts') { smoke(x + 18, y - 10, 3); if (lit) { for (const [hx, hy] of [[0, 0], [14, -3], [26, 1]]) R(x + hx + 3, y + hy, 3, 3, '#f5c04a'); glow(x + 16, y, 22, '255,190,100', 0.05); for (const [hx, hy] of [[0, 0], [14, -3], [26, 1]]) R(x + hx + 3, y + hy + 12, 3, 1, 'rgba(245,192,74,.35)'); } }
    else if (n === "The hunters' lodge") { smoke(x + 19, y - 14, 3); if (lit) { R(x + 9, y + 2, 5, 8, '#e8a040'); glow(x + 11, y + 6, 14, '255,170,90', 0.06); } }
    else if (n === 'A burnt village') { for (let q = 0; q < 3; q++) { const p2 = (T * 0.12 + q * 0.33) % 1; ctx.globalAlpha = 0.3 * (1 - p2); R(x + 4 + q * 13 + Math.sin(p2 * 5 + q) * 3, y - p2 * 20, 2, 2, '#b8b4ac'); } ctx.globalAlpha = 1; if (lit) for (let q = 0; q < 4; q++) if (Math.sin(T * 3 + q * 2.2) > 0.2) R(x + 3 + q * 9, y + 7 + (q % 2), 1, 1, '#e2702a'); }
    else if (n === 'The drowned temple') { if (lit) for (let q = 0; q < 3; q++) { const wx = x + 6 + q * 9 + Math.sin(T * 0.4 + q * 2) * 6, wy = y - 2 + Math.cos(T * 0.3 + q) * 4; if (Math.sin(T * 1.7 + q * 2.4) > -0.2) { R(wx, wy, 2, 2, '#b8f0d8'); glow(wx + 1, wy + 1, 7, '150,240,200', 0.07); } } else { const p2 = (T * 0.4) % 1; ctx.globalAlpha = 0.5 * (1 - p2); R(x + 10 - p2 * 4, y + 7, 4 + Math.round(p2 * 8), 1, '#7a9a98'); ctx.globalAlpha = 1; } }
    else if (n === 'The ring of stones') { if (lit) { glow(x + 16, y + 3, 18, '170,190,255', 0.045); if (Math.sin(T * 0.8) > 0.3) R(x + 15, y + 1, 2, 1, '#d8e0ff'); } }
    else if (n === 'The wolf stone') { if (lit) { R(x + 7, y - 4, 2, 2, '#e23a2a'); R(x + 10, y - 4, 2, 2, '#e23a2a'); glow(x + 9, y - 3, 8, '255,70,50', 0.08); } }
    else if (n === "The shepherds' fold") { smoke(x + 31, y - 10, 3); if (lit) R(x + 30, y - 2, 2, 4, '#f5c04a'); for (let q = 0; q < 3; q++) { const bob = Math.sin(T * 1.3 + q * 2) > 0.5 ? 1 : 0; R(x + [4, 10, 19][q] + 3, y + [0, 3, 4][q] + bob, 1, 1, '#2a1c14'); } }
    else if (n === 'The causeway') { if (lit) { R(x + 33, y - 7 - fl, 3, 2 + fl, '#f5c04a'); glow(x + 34, y - 6, 12, '255,190,100', 0.07); } }
    else if (n === 'The broken aqueduct') { for (let q = 0; q < 4; q++) { const p2 = (T * 0.9 + q * 0.25) % 1; R(x + 29, y - 17 + p2 * 24, 1, 2, '#9ccbe8'); } R(x + 26, y + 8, 7, 2, '#5a9cc6'); R(x + 27, y + 8, 4, 1, '#b4d6ea'); const sp = Math.sin(T * 9) > 0 ? 1 : 0; R(x + 28 - sp, y + 7, 1, 1, '#e6f3fa'); R(x + 30 + sp, y + 7, 1, 1, '#e6f3fa'); }
    else if (n === 'A wreck on the strand') { const p2 = (T * 0.3) % 1; ctx.globalAlpha = 0.6 * Math.sin(p2 * Math.PI); R(x - 4 + p2 * 4, y + 11, 36, 1, '#e6f3fa'); ctx.globalAlpha = 1; const sw = Math.sin(T * 2) > 0 ? 1 : 0; R(x + 28 + sw, y - 7, 5, 3, '#c9c0aa'); }
    else if (n === 'An old battlefield') { for (const [bx, by, ph] of [[9, -4, 0], [27, -3, 2], [20, 3, 4]]) { const peck = Math.sin(T * 3 + ph) > 0.4 ? 1 : 0; R(x + bx + 2, y + by + peck, 1, 1, '#1c1310'); } const wv = Math.sin(T * 4) > 0 ? 1 : 0; R(x + 11 + wv, y - 3, 3, 2, '#8a2a20'); }
    else if (n === 'The gallows') { const sw = Math.round(Math.sin(T * 1.1) * 1); R(x + 15 + sw, y - 9, 3, 3, '#c9b890'); R(x + 16 + sw, y - 6, 1, 3, '#8a7a5c'); }
    else if (n === 'The old arch') { if (lit) { for (const px of [-2, 24]) { R(x + px, y + 2 - fl, 1, 2 + fl, '#f5c04a'); R(x + px, y + 4, 1, 5, '#5a4326'); } glow(x + 11, y + 2, 20, '255,190,100', 0.04); } const pc = pace(x - 14, x + 36, 0.03, 0.7); if (Math.floor(T * 0.03 + 0.7) % 3 === 0) man(pc.x, y + 12, { face: pc.face, tunic: '#9a9a8a' }); }
    else if (n === 'The great waterfall') { for (let q = 0; q < 8; q++) { const p2 = (T * 1.3 + q / 8) % 1; R(x + 11 + (q * 3) % 7, y - 26 + p2 * 30, 1, 3, q % 2 ? '#ffffff' : '#d8ecf6'); } for (let q = 0; q < 5; q++) { const p2 = (T * 0.5 + q * 0.2) % 1; ctx.globalAlpha = 0.5 * (1 - p2); R(x + 8 + q * 3 + Math.sin(p2 * 5 + q) * 2, y + 4 - p2 * 9, 3, 2, '#ffffff'); } ctx.globalAlpha = 1; const rp = (T * 0.6) % 1; ctx.globalAlpha = 0.5 * (1 - rp); R(x + 9 - rp * 5, y + 8, 12 + Math.round(rp * 10), 1, '#e6f3fa'); ctx.globalAlpha = 1; }
    else if (n === 'The salt pans') { const pc = pace(x + 2, x + 38, 0.04, 0.1); man(pc.x, y + 14, { face: pc.face, tunic: '#e8e2d2' }); R(pc.x + (pc.face === 'right' ? 4 : -6), y + 8, 3, 1, '#8a6a3a'); for (let q = 0; q < 4; q++) if (Math.sin(T * 2.3 + q * 1.9) > 0.8) R(x + 4 + q * 11, y - 2 + (q % 2) * 8, 1, 1, '#ffffff'); smoke(x + 50, y - 12, 3); }
    else if (n === 'The sacred grove') { for (const lx of [9, 29]) { R(x + lx, y - 3 - fl, 1, 2 + fl, '#f5c04a'); if (lit) glow(x + lx, y - 2, 11, '255,190,100', 0.07); } const pc = pace(x + 4, x + 34, 0.035, 0.6); man(pc.x, y + 15, { face: pc.face, tunic: '#f4f0e4', hair: '#c9c2b2' }); for (let q = 0; q < 3; q++) { const p2 = (T * 0.13 + q * 0.4) % 1.4; if (p2 < 1) R(x + 6 + q * 12 + Math.sin(p2 * 8) * 4, y - 14 + p2 * 24, 1, 1, q % 2 ? '#b45f2c' : '#d4a43a'); } for (const [rx0, ry0] of [[3, -6], [33, -8], [20, -18]]) if (Math.sin(T * 2 + rx0) > 0) R(x + rx0 + 1, y + ry0 + 1, 1, 2, '#f1ead8'); }
    else if (n === 'The white temple') { R(x + 17, y + 8 - fl, 2, 2 + fl, '#f5c04a'); R(x + 17, y + 7 - fl, 1, 1, '#fff0b0'); smoke(x + 18, y + 5, 2); if (lit) { R(x + 16, y - 6, 5, 10, '#e8a040'); glow(x + 18, y - 1, 24, '255,200,120', 0.05); } }
    else if (n === 'The barrow of kings') { if (lit) { const pu = 0.5 + 0.5 * Math.sin(T * 1.2); ctx.globalAlpha = 0.35 + pu * 0.4; R(x + 22, y - 1, 5, 9, '#a8c8ff'); ctx.globalAlpha = 1; glow(x + 24, y + 3, 14, '150,190,255', (0.04 + pu * 0.04).toFixed(3)); } }
    else if (n === 'The fort') { const wv = Math.sin(T * 5) > 0 ? 1 : 0; R(x + 24, y - 11 + wv, 4, 3, '#a8261c'); R(x + 28, y - 10 - wv + 1, 2, 2, '#8a2018'); R(x + 36, y - 2 - fl, 2, 2 + fl, '#e2702a'); R(x + 36, y - 3 - fl, 1, 1, '#f5c04a'); smoke(x + 37, y - 4, 2); if (lit) glow(x + 37, y - 1, 12, '255,160,80', 0.07);
      for (let q = 0; q < 2; q++) { const pc = pace(x + 2 + q * 30, x + 14 + q * 30, 0.09, q * 0.5); man(pc.x, y + 16, { face: pc.face, tunic: '#a8261c', hair: '#2a1c14' }); R(pc.x + (pc.face === 'right' ? 4 : -4), y - 2, 1, 14, '#6b4f2c'); R(pc.x + (pc.face === 'right' ? 4 : -4), y - 4, 1, 2, '#c1c7cc'); } }
    else if (n === 'The old arena') { for (let q = 0; q < 3; q++) { const an = T * 0.5 + q * 2.1, bx = x + 22 + Math.cos(an) * 16, by = y - 14 + Math.sin(an) * 5, f2 = Math.sin(T * 9 + q) > 0 ? 1 : 0; R(bx - 1, by - f2, 1, 1, '#c8ccd0'); R(bx, by, 1, 1, '#8a8e94'); R(bx + 1, by - f2, 1, 1, '#c8ccd0'); } }
    else if (n === 'The ferry') { const bob = Math.sin(T * 1.4) > 0 ? 1 : 0, u = (T * 0.03) % 2, f = u < 1 ? u : 2 - u, fx = x + 42 + Math.round(f * 14); R(fx - 6, y + 9 + bob, 13, 1, 'rgba(20,40,60,.3)'); R(fx - 6, y + 6 + bob, 12, 3, '#6b4f2c'); R(fx - 6, y + 6 + bob, 12, 1, '#8a6a3a'); R(fx - 1, y + 1 + bob, 2, 2, '#d9a57c'); R(fx - 1, y + 3 + bob, 2, 3, '#6a5a3a'); R(fx + 2, y - 2 + bob, 1, 10, '#8a7a5c'); R(fx - 5, y + 3 + bob, 3, 3, '#c9b890'); const sw = Math.round(Math.sin(T * 2.2)); R(x + 21 + sw, y - 4, 2, 1, '#e8c040'); smoke(x + 11, y - 9, 3); if (lit) { R(x + 10, y, 3, 3, '#f5c04a'); R(x + 19, y - 9 - fl, 1, 2, '#f5c04a'); } }
    else if (n === 'The eagle rock') { if (Math.sin(T * 0.7) > 0.6) R(x + 7, y - 26, 4, 1, '#e8e2d2'); }
    else if (n === 'The bog oak') { if (lit && Math.sin(T * 0.9) > 0) { R(x + 13, y - 6, 1, 1, '#e8d040'); R(x + 14, y - 5, 1, 1, '#e8d040'); } }
  }
  if (lit) {                                     // lights in the windows, out in the country
    const la = Math.min(1, (night - 0.3) * 3);
    for (const l of (prov.lights || [])) { if (!inView(l.x, l.y, 20) || !wildSeen(l.x, l.y) || wildHash(l.x, l.y, 1330) < 0.2) continue; ctx.globalAlpha = la; R(l.x - 1, l.y - 1, 2, 2, wildHash(l.y, l.x, 1331) > 0.5 ? '#f5c04a' : '#e8a040'); ctx.globalAlpha = 1; glow(l.x, l.y, 9, '255,180,90', (0.05 * la).toFixed(3)); }
  }
}

// What passes overhead. The shadows of clouds cross the whole province on the wind, each cloud its own shape, more
// of them and darker when the sky is heavy. When rain stops there is a rainbow for a while; in heavy rain, lightning.
function drawSky(ctx, T, camX, camY, sky, wx) {
  if (sky.night < 0.6) {
    const N = wx.over > 0.3 ? 11 : 6, alpha = (0.045 + 0.06 * wx.over) * (1 - sky.night);
    ctx.fillStyle = `rgba(14,20,40,${alpha.toFixed(3)})`;
    for (let i = 0; i < N; i++) {
      const cv = q => wildHash(i, q, 1300), sp = 5 + cv(1) * 6, spanX = WILD.W + 700, cx = ((cv(2) * spanX + T * sp) % spanX) - 350, cy = cv(3) * WILD.H + Math.sin(T * 0.02 + i) * 40 + T * sp * 0.12 % 1;
      const big = 50 + cv(4) * 70;
      if (cx + big * 2.2 < camX || cx - big * 2.2 > camX + PROV.VW || cy + big * 1.2 < camY || cy - big * 1.2 > camY + PROV.VH) continue;
      for (let l = 0, n = 3 + Math.floor(cv(5) * 4); l < n; l++) {
        const ox = (cv(10 + l) - 0.5) * big * 2.2, oy = (cv(20 + l) - 0.5) * big * 0.7, rx = big * (0.45 + cv(30 + l) * 0.5), ry = rx * (0.4 + cv(40 + l) * 0.25);
        for (let dy = -ry; dy <= ry; dy += 4) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))) / 4) * 4; if (w > 0) ctx.fillRect(Math.round((cx + ox - w) / 2) * 2, Math.round((cy + oy + dy) / 4) * 4, w * 2, 4); }
      }
    }
  }
  if (wx.wet > 0.15 && wx.rain < 0.25 && sky.night < 0.2) {          // the bow, in the quarter of the sky away from the sun
    const cx = camX + PROV.VW * 0.72, cy = camY + PROV.VH * 0.95, a0 = Math.min(0.3, wx.wet * 0.3), bands = ['220,60,50', '236,150,50', '240,220,80', '90,180,90', '70,130,210', '130,90,190'];
    bands.forEach((c, bi) => { ctx.fillStyle = `rgba(${c},${a0.toFixed(3)})`; const r = PROV.VH * 0.78 - bi * 2; for (let an = Math.PI * 1.08; an < Math.PI * 1.92; an += 0.012) ctx.fillRect(Math.round(cx + Math.cos(an) * r), Math.round(cy + Math.sin(an) * r), 2, 2); });
  }
  if (wx.rain > 0.7) {                                               // lightning: the whole country white for an instant, and the stroke itself
    const tick = Math.floor(T * 8), hit = wildHash(tick, 3, 1310) > 0.975, after = wildHash(tick - 1, 3, 1310) > 0.975;
    if (hit || after) { ctx.fillStyle = `rgba(236,240,255,${hit ? 0.22 : 0.08})`; ctx.fillRect(camX, camY, PROV.VW, PROV.VH); }
    if (hit) { const seed = tick; let bx = camX + 30 + wildHash(seed, 4, 1311) * (PROV.VW - 60), by = camY; ctx.fillStyle = '#f4f6ff'; for (let q = 0; q < 26 && by < camY + PROV.VH * (0.35 + wildHash(seed, 5, 1312) * 0.4); q++) { const st = 3 + Math.floor(wildHash(seed, q, 1313) * 5), dx = Math.round((wildHash(q, seed, 1314) - 0.5) * 10); ctx.fillRect(Math.round(Math.min(bx, bx + dx)), Math.round(by), Math.abs(dx) + 1, 1); bx += dx; ctx.fillRect(Math.round(bx), Math.round(by), 1, st); by += st; } }
  }
}

// The small life of the country, each kind where it belongs: butterflies over the meadows, mist lying on the mere,
// fish rising, snow blowing off the high peaks, a bird crossing a wood. After dark, fireflies in the woods and
// over the marsh. Each has its own spot in the world and stays near it; nothing is remembered.
function drawAmbient(ctx, T, R, camX, camY, night) {
  const G0 = 40;
  for (let gy = Math.floor(camY / G0) * G0 - G0; gy < camY + PROV.VH + G0; gy += G0) for (let gx = Math.floor(camX / G0) * G0 - G0; gx < camX + PROV.VW + G0; gx += G0) {
    const a = wildHash(gx, gy, 690), b = wildHash(gy, gx, 691), x0 = gx + a * 30, y0 = gy + b * 30;
    if (x0 < 5 || y0 < 5 || x0 > WILD.W - 5 || y0 > WILD.H - 5 || !wildSeen(x0, y0)) continue;
    const k = wildTile(x0, y0);
    if (night) {
      if ((k === T_FOREST || k === T_MARSH) && a > 0.35) for (let q = 0; q < 3; q++) {      // fireflies
        const ph = a * 20 + q * 2.3, fx = x0 + Math.sin(T * 0.5 + ph) * 12 + q * 5, fy = y0 + Math.cos(T * 0.37 + ph) * 8 - q * 3;
        if (Math.sin(T * 2.1 + ph * 3) > 0.2) { R(fx, fy, 1, 1, '#f8f0a0'); ctx.fillStyle = 'rgba(248,240,160,.25)'; ctx.fillRect(Math.round(fx) - 1, Math.round(fy) - 1, 3, 3); }
      }
      continue;
    }
    const reg = wildRegion(x0, y0);
    if (reg === 'The High Fells' && (k === T_PEAK || k === T_HILL) && b > 0.35) {      // snow in the air over the fells, whatever the weather below
      for (let q = 0; q < 4; q++) { const p2 = (T * 0.22 + a * 7 + q * 0.27) % 1; ctx.fillStyle = `rgba(246,248,252,${(0.75 * Math.sin(p2 * Math.PI)).toFixed(2)})`; ctx.fillRect(Math.round(x0 + q * 9 - p2 * 14 + Math.sin(T * 1.3 + q) * 2), Math.round(y0 - 20 + p2 * 34), 1, 1); }
    } else if (reg === 'Greywood' && k === T_FOREST && b > 0.6) {                        // a leaf coming down through the old wood
      const p2 = (T * 0.16 + a * 9) % 1.6; if (p2 < 1) { ctx.fillStyle = ['#b45f2c', '#d4a43a', '#8f4422'][Math.floor(b * 30) % 3]; ctx.fillRect(Math.round(x0 + Math.sin(p2 * 9) * 4), Math.round(y0 - 16 + p2 * 22), Math.sin(p2 * 18) > 0 ? 2 : 1, 1); }
    } else if (reg === 'The Long Meadows' && k === T_MEADOW && b > 0.7) {                // seed on the wind
      for (let q = 0; q < 3; q++) { const p2 = (T * 0.12 + a * 5 + q * 0.33) % 1; ctx.fillStyle = `rgba(250,250,244,${(0.7 * Math.sin(p2 * Math.PI)).toFixed(2)})`; ctx.fillRect(Math.round(x0 + p2 * 40 + q * 6), Math.round(y0 - 4 - p2 * 14 + Math.sin(T * 0.9 + q * 2) * 3), 1, 1); }
    } else if (reg === 'The Quarry Hills' && k === T_HILL && b > 0.9) {                  // a dust devil crossing the dry hills
      const cyc = (T * 0.1 + a * 6) % 3; if (cyc < 1) { const dx0 = x0 - 20 + cyc * 40; for (let q = 0; q < 7; q++) { const an = T * 7 + q * 0.9, rr = 1 + q * 0.7; ctx.fillStyle = `rgba(214,200,160,${(0.55 * Math.sin(cyc * Math.PI) * (1 - q / 9)).toFixed(2)})`; ctx.fillRect(Math.round(dx0 + Math.cos(an) * rr), Math.round(y0 - q * 3), 2, 1); } }
    } else if (reg === 'The Barrow Downs' && (k === T_GRASS || k === T_HILL || k === T_MEADOW) && b > 0.55) {      // fog lying in the hollows of the downs, thick at either end of the day
      const thick = 0.05 + Math.min(0.12, Math.abs(dayPart() - 0.5) * 0.3), mx = x0 + Math.sin(T * 0.07 + a * 9) * 24, w = 26 + Math.floor(a * 30);
      ctx.fillStyle = `rgba(232,236,236,${thick.toFixed(3)})`; ctx.fillRect(Math.round(mx - w / 2), Math.round(y0), w, 4); ctx.fillRect(Math.round(mx - w / 2 + 6), Math.round(y0 - 2), w - 12, 2); ctx.fillRect(Math.round(mx - w / 2 + 4), Math.round(y0 + 4), w - 10, 2);
    } else if (reg === 'The Salt Shore' && k === T_SAND && b > 0.5 && wildTile(x0 - 10, y0) === T_WATER) {      // spray thrown up where the sea comes in
      const p2 = (T * 0.5 + a * 4) % 1; for (let q = 0; q < 4; q++) { ctx.fillStyle = `rgba(240,248,252,${(0.8 * (1 - p2)).toFixed(2)})`; ctx.fillRect(Math.round(x0 - 6 + q * 2 + p2 * 3), Math.round(y0 + q * 3 - Math.sin(p2 * Math.PI) * (4 + q)), 1, 1); }
    }
    if (k === T_MEADOW && a > 0.45) {                // a butterfly, going from flower to flower
      const ph = a * 30, bx = x0 + Math.sin(T * 0.8 + ph) * 12 + Math.sin(T * 2.7 + ph) * 3, by = y0 + Math.cos(T * 0.6 + ph) * 8 + Math.sin(T * 3.3 + ph) * 2, open = Math.sin(T * 14 + ph) > 0, c = ['#f4f4f0', '#f2d060', '#e8a0c0', '#a8c0f0'][Math.floor(b * 4)];
      R(bx, by, 1, 1, '#2a1c14'); if (open) { R(bx - 1, by - 1, 1, 2, c); R(bx + 1, by - 1, 1, 2, c); } else R(bx, by - 1, 1, 1, c);
    } else if (k === T_MARSH && a > 0.3) {           // mist lying low and moving
      const mx = x0 + Math.sin(T * 0.12 + a * 9) * 18, w = 18 + Math.floor(b * 22);
      ctx.fillStyle = 'rgba(220,230,225,.10)'; ctx.fillRect(Math.round(mx - w / 2), Math.round(y0), w, 3); ctx.fillRect(Math.round(mx - w / 2 + 5), Math.round(y0 - 2), w - 10, 2); ctx.fillRect(Math.round(mx - w / 2 + 3), Math.round(y0 + 3), w - 8, 1);
    } else if (k === T_WATER && a > 0.55) {          // a fish rising: a ring that widens and is gone
      const cyc = (T * 0.35 + a * 7) % 4;
      if (cyc < 1) { const r = 1 + Math.floor(cyc * 4); ctx.fillStyle = `rgba(230,243,250,${(0.7 * (1 - cyc)).toFixed(2)})`; ctx.fillRect(Math.round(x0 - r), Math.round(y0), r * 2 + 1, 1); ctx.fillRect(Math.round(x0 - r + 1), Math.round(y0 - 1), Math.max(1, r * 2 - 1), 1); if (cyc < 0.2) { ctx.fillStyle = '#c9d2de'; ctx.fillRect(Math.round(x0), Math.round(y0 - 2), 1, 2); } }
    } else if (k === T_PEAK && a > 0.5) {            // snow blowing off the tops
      for (let q = 0; q < 4; q++) { const p2 = (T * 0.5 + a * 5 + q * 0.25) % 1; ctx.fillStyle = `rgba(244,246,250,${(0.6 * (1 - p2)).toFixed(2)})`; ctx.fillRect(Math.round(x0 + p2 * 26 + q * 3), Math.round(y0 - 14 - q * 4 + p2 * 6), 2, 1); }
    } else if (k === T_FOREST && a > 0.7) {          // a bird going over the trees
      const cyc = (T * 0.2 + a * 11) % 6;
      if (cyc < 1) { const bx = x0 - 30 + cyc * 60, by = y0 - 10 - Math.sin(cyc * Math.PI) * 8, fl = Math.sin(T * 16 + a * 9) > 0 ? 1 : 0, c = b > 0.5 ? '#3a2a22' : '#5a6a8a'; R(bx - 1, by - fl, 1, 1, c); R(bx, by, 1, 1, c); R(bx + 1, by - fl, 1, 1, c); }
    } else if (k === T_SAND && a > 0.75) {           // sandpipers, running at the water's edge
      const run = Math.sin(T * 0.9 + a * 12) * 14;
      for (let q = 0; q < 2 + Math.floor(b * 2); q++) { const sx = x0 + run + q * 4, sy = y0 + (q % 2) * 2; R(sx, sy, 2, 1, '#e8e2d2'); R(sx + (Math.cos(T * 0.9 + a * 12) > 0 ? 2 : -1), sy, 1, 1, '#3a2a22'); R(sx + (Math.sin(T * 18 + q) > 0 ? 0 : 1), sy + 1, 1, 1, '#3a2a22'); }
    } else if ((k === T_GRASS || k === T_HILL) && a > 0.93) {      // a hare, sitting up, then off
      const cyc = (T * 0.15 + a * 13) % 5, mv = cyc > 4, hx = x0 + (mv ? (cyc - 4) * 40 * (b > 0.5 ? 1 : -1) : 0), hop = mv && Math.sin(T * 14) > 0 ? 1 : 0;
      R(hx, y0 - 2 - hop, 3, 2, '#9a8466'); R(hx + (b > 0.5 ? 3 : -1), y0 - 3 - hop, 1, 2, '#9a8466'); R(hx + (b > 0.5 ? 3 : -1), y0 - 5 - hop, 1, 2, '#8a7456'); R(hx + (b > 0.5 ? -1 : 3), y0 - 1 - hop, 1, 1, '#e8e2d2');
    }
  }
}

// Those who use the roads: carters, pilgrims, a file of soldiers, a merchant with his donkey, a man in a hurry on a
// horse. Each keeps to one road and goes up and down it for ever; where he is comes from the clock, like the herds.
const TRAVELLERS = ['cart', 'pilgrim', 'soldiers', 'merchant', 'rider', 'herdsman', 'litter', 'mules', 'woodman', 'oxwagon', 'runner', 'family'];
// Whatever stands tall (an arch, the aqueduct: see overs in provLand) is painted again over anybody who has just
// been drawn north of the line it stands on, so that travellers, herds and roaming bands pass behind and under it
// as the column does.
function provUnder(ctx, x, y, w) {
  if (!prov.overs || !prov.paintOver) return;
  let hit = null;
  for (const o of prov.overs) if (y < o.base && y > o.y0 - 2 && x + w > o.x0 && x - w < o.x1) (hit = hit || []).push(o);
  if (hit) hit.sort((a, b) => a.base - b.base).forEach(o => prov.paintOver(ctx, o.d));
}
function drawTraffic(ctx, T, R, inView) {
  (prov.ways || []).forEach((way, wi) => {
    const len = way.length - 1, n = len > 60 ? 3 : 2;
    for (let j = 0; j < n; j++) {
      const hv = q => wildHash(wi * 17 + j, q, 680), kind = TRAVELLERS[Math.floor(hv(1) * TRAVELLERS.length)];
      const speed = kind === 'rider' ? 3.4 : kind === 'runner' ? 2.8 : kind === 'cart' ? 1.1 : kind === 'oxwagon' ? 0.8 : kind === 'litter' ? 1.2 : kind === 'soldiers' ? 1.8 : 1.4;      // road tiles a second
      const sraw = (T * speed + hv(2) * len * 2) % (len * 2), idx = sraw <= len ? sraw : len * 2 - sraw, dir = sraw <= len ? 1 : -1;
      const i0 = Math.min(len - 1, Math.floor(idx)), fr = idx - i0, a = way[i0], b = way[i0 + 1], x = Math.round(a[0] + (b[0] - a[0]) * fr), y = Math.round(a[1] + (b[1] - a[1]) * fr);
      if (!inView(x, y, 30) || !wildSeen(x, y) || (x > WILD.TOWN.x - 50 && x < WILD.TOWN.x + 24 && y > WILD.TOWN.y - 32 && y < WILD.TOWN.y + 18)) continue;
      const dx = (b[0] - a[0]) * dir, dy = (b[1] - a[1]) * dir, face = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up'), d = face === 'left' ? -1 : 1, walk = T * 9 + j * 3, step = Math.sin(walk) > 0 ? 1 : 0;
      const man = (ox, oy, tunic, hair, extra) => vilPerson(ctx, x + ox, y + oy, Object.assign({ face, walk: walk + ox, moving: true, tunic, hair: hair || '#3a2a1c' }, extra));
      const beast = (bx, by, c, big) => { const w = big ? 9 : 7; R(bx - (w >> 1), by + 1, w + 1, 1, 'rgba(0,0,0,.22)'); R(bx - (w >> 1), by - (big ? 6 : 5), w, big ? 4 : 3, c); R(d > 0 ? bx + (w >> 1) : bx - (w >> 1) - 2, by - (big ? 9 : 7), 2, 4, c); R(d > 0 ? bx + (w >> 1) + 1 : bx - (w >> 1) - 3, by - (big ? 9 : 7), 2, 2, c); R(d > 0 ? bx + (w >> 1) : bx - (w >> 1) - 1, by - (big ? 11 : 9), 1, 2, shade(c, 0.7)); R(bx - (w >> 1) + step, by - 2, 1, 3, shade(c, 0.6)); R(bx + (w >> 1) - 1 - step, by - 2, 1, 3, shade(c, 0.6)); R(d > 0 ? bx - (w >> 1) - 1 : bx + (w >> 1) + 1, by - (big ? 5 : 4), 1, 3, shade(c, 0.6)); };
      if (kind === 'cart') {
        const cx = x - d * 12; R(cx - 6, y + 1, 13, 2, 'rgba(0,0,0,.25)'); R(cx - 5, y - 6, 10, 5, '#8a6a3a'); R(cx - 5, y - 7, 10, 1, '#a8834a'); R(cx - 4, y - 10, 8, 3, hv(3) > 0.5 ? '#d9c9a0' : '#b8703c'); R(cx - 4, y - 2, 4, 4, '#3a2a1c'); R(cx - 3, y - 1, 2, 2, '#8a6a3a'); R(cx + 1, y - 2, 4, 4, '#3a2a1c'); R(cx + 2, y - 1, 2, 2, '#8a6a3a');
        beast(x, y, hv(4) > 0.5 ? '#8a6a4a' : '#6f5a48'); man(d * 8, 1, hv(5) > 0.5 ? '#7a6a4a' : '#8a4a3a');
      } else if (kind === 'pilgrim') { man(0, 0, hv(3) > 0.5 ? '#e8e2d2' : '#9a9a8a', hv(4) > 0.5 ? '#c9c2b2' : '#3a2a1c'); R(x + d * 5, y - 18, 1, 18, '#6b4f2c'); if (hv(5) > 0.5) man(-d * 8, 2, '#b8b0a0', '#8a8a8a'); }
      else if (kind === 'soldiers') { for (let q = 0; q < 2 + Math.floor(hv(3) * 2); q++) { man(-d * q * 8, (q % 2) * 2, '#a8261c', '#2a1c14'); R(x - d * q * 8 + d * 4, y + (q % 2) * 2 - 20, 1, 16, '#6b4f2c'); R(x - d * q * 8 + d * 4, y + (q % 2) * 2 - 22, 1, 2, '#c1c7cc'); R(x - d * q * 8 - d * 4, y + (q % 2) * 2 - 12, 3, 6, '#8a2a20'); R(x - d * q * 8 - d * 4 + 1, y + (q % 2) * 2 - 10, 1, 2, '#c9a21e'); } }
      else if (kind === 'merchant') { beast(x - d * 10, y, '#9a8a72'); R(x - d * 10 - 3, y - 9, 7, 4, hv(3) > 0.5 ? '#b93a2e' : '#2f6db8'); R(x - d * 10 - 3, y - 9, 7, 1, '#f1ead8'); man(0, 0, hv(4) > 0.5 ? '#7a2a8a' : '#3f7a5a'); }
      else if (kind === 'rider') { beast(x, y, hv(3) > 0.5 ? '#5a3a26' : '#c9c2ae', true); R(x - 1, y - 12, 3, 6, hv(4) > 0.5 ? '#a8261c' : '#4a6a8a'); R(x - 1, y - 15, 3, 3, '#d9a57c'); R(x - 1, y - 16, 3, 1, '#3a2a1c'); R(x - d * 2, y - 11, 2, 3, '#7a2a20'); }
      else if (kind === 'litter') { const lc = ['#8a2a6a', '#a8261c', '#2f6db8', '#c9a21e'][Math.floor(hv(3) * 4)]; man(d * 9, 0, '#8a6a4a'); man(-d * 9, 0, '#8a6a4a'); R(x - 11, y - 9, 23, 1, '#5a4326'); R(x - 6, y - 15, 13, 7, lc); R(x - 6, y - 16, 13, 1, shade(lc, 1.25)); R(x - 4, y - 13, 4, 4, '#f1ead8'); R(x - 3, y - 12, 2, 2, '#d9a57c'); R(x + 2, y - 15, 1, 7, shade(lc, 0.75)); if (hv(4) > 0.5) man(-d * 17, 2, '#e8e2d2'); }      // somebody of account, carried
      else if (kind === 'mules') { for (let q = 0, n2 = 2 + Math.floor(hv(3) * 2); q < n2; q++) { const mx = x - d * (10 + q * 11); beast(mx, y + (q % 2), ['#9a8a72', '#6f5a48', '#b8a888'][q % 3]); R(mx - 3, y - 9 + (q % 2), 7, 4, ['#b93a2e', '#c9b25a', '#5a6a4a', '#8a6a3a'][Math.floor(hv(5 + q) * 4)]); R(mx - 3, y - 9 + (q % 2), 7, 1, '#3a2a1c'); } man(0, 0, hv(4) > 0.5 ? '#6a5a3a' : '#7a4a3a'); }      // a string of pack mules
      else if (kind === 'woodman') { man(0, 0, '#6a5a3a', hv(3) > 0.5 ? '#8a8a8a' : '#3a2a1c'); R(x - d * 4 - 1, y - 17, 4, 7, '#6b4f2c'); R(x - d * 4 - 2, y - 18, 6, 1, '#8a6a3a'); R(x - d * 4, y - 16, 1, 6, '#8a6a3a'); R(x - d * 4 - 1, y - 14, 4, 1, '#c8b890'); if (hv(4) > 0.5) { R(x + d * 5, y - 9, 1, 6, '#6b4f2c'); R(x + d * 5, y - 10, 2, 2, '#b8c0c8'); } }      // a man under a load of sticks
      else if (kind === 'oxwagon') { const wx = x - d * 20, load = hv(3); R(wx - 9, y + 1, 19, 2, 'rgba(0,0,0,.25)'); R(wx - 8, y - 6, 16, 5, '#7a5a34'); R(wx - 8, y - 7, 16, 1, '#a8834a'); if (load > 0.6) { R(wx - 6, y - 12, 12, 5, '#d8d2c0'); R(wx - 6, y - 12, 12, 1, '#f0ece0'); R(wx + 4, y - 12, 2, 5, '#b8b0a0'); } else if (load > 0.3) for (let q = 0; q < 3; q++) { R(wx - 6 + q * 4, y - 11, 3, 4, '#8a5a34'); R(wx - 6 + q * 4, y - 10, 3, 1, '#3a2a1c'); } else { R(wx - 7, y - 11, 14, 4, '#d9c070'); R(wx - 5, y - 12, 10, 1, '#e6d088'); } for (const o of [-6, 3]) { R(wx + o, y - 2, 4, 4, '#3a2a1c'); R(wx + o + 1, y - 1, 2, 2, '#8a6a3a'); } beast(x - d * 6, y, '#e8e2d2', true); beast(x + d * 4, y + 1, hv(4) > 0.5 ? '#8a6a4a' : '#d8d0b8', true); man(d * 12, 1, '#7a6a4a'); }      // oxen, and a wagon of stone, wine or hay
      else if (kind === 'runner') { man(0, 0, hv(3) > 0.5 ? '#e8e2d2' : '#c9a21e', '#2a1c14'); R(x - d * 3, y - 10, 3, 3, '#6b4f2c'); R(x - d * 2, y - 13, 1, 3, '#6b4f2c'); }      // a runner with a satchel of letters
      else if (kind === 'family') { man(0, 0, ['#7a6a4a', '#5a6a8a', '#8a4a3a'][Math.floor(hv(3) * 3)]); man(-d * 8, 1, ['#b8703c', '#8a2a6a', '#3f7a5a', '#c9b25a'][Math.floor(hv(4) * 4)], hv(5) > 0.5 ? '#6a4a2a' : '#2a1c14'); R(x - d * 8 - 2, y - 21, 5, 3, '#c9a763'); const dg = x - d * 16; R(dg - 2, y + 3, 5, 1, 'rgba(0,0,0,.2)'); R(dg - 2, y, 4, 2, hv(6) > 0.5 ? '#8a6a4a' : '#e8e2d2'); R(d > 0 ? dg + 2 : dg - 3, y - 1, 2, 2, hv(6) > 0.5 ? '#8a6a4a' : '#e8e2d2'); R(dg - 2 + step, y + 2, 1, 1, '#2a1c14'); R(dg + 1, y + 2, 1, 1, '#2a1c14'); }      // a man and a woman with a basket on her head, and their dog
      else { man(0, 0, '#8a6a4a', '#6a4a2a'); R(x + d * 5, y - 14, 1, 14, '#6b4f2c'); for (let q = 0; q < 3; q++) { const gx = x + d * (9 + q * 5), gy = y + (q % 2) * 3; R(gx - 2, gy + 1, 5, 1, 'rgba(0,0,0,.2)'); R(gx - 2, gy - 3, 4, 2, q === 1 ? '#8a7a66' : '#e8e2d2'); R(d > 0 ? gx + 2 : gx - 3, gy - 4, 2, 2, q === 1 ? '#8a7a66' : '#e8e2d2'); R(gx - 2 + step, gy - 1, 1, 2, '#3a2a22'); R(gx + 1 - step, gy - 1, 1, 2, '#3a2a22'); } }      // a herdsman driving goats to market
      provUnder(ctx, x, y, 26);
    }
  });
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
  // the stables: walk to the yard gate, and deal with the stable boy when you get there
  const st = !prov.big && Math.abs(x - STABLES.x) < 24 && y > STABLES.y - 22 && y < STABLES.y + 10;
  if (st && Math.hypot(G.field.x - STABLES.x, G.field.y - (STABLES.y + 9)) < 10) { prov.path = null; stablesModal(); return; }
  const p = st ? provPath(G.field.x, G.field.y, STABLES.x, STABLES.y + 9) : provPath(G.field.x, G.field.y, x, y);
  if (p) { prov.path = p; prov.dest = st ? 'stables' : null; prov.big = false; } else prov.hint = performance.now() + 1600;
}

function provStep(dt) {
  const F = G.field, k = vil.keys, kx = (k.r ? 1 : 0) - (k.l ? 1 : 0), ky = (k.d ? 1 : 0) - (k.u ? 1 : 0);
  const camped = performance.now() - (prov.night || -1e9) < 1500;                    // night has fallen: nobody walks until it lifts
  const x0 = F.x, y0 = F.y, sp = camped ? 0 : PROV.SPEED * wildPace(F.x, F.y) * dt;
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
    if (!prov.path.length) { prov.path = null; if (prov.dest === 'stables') { prov.dest = null; villageStill(); stablesModal(); } }
  }
  const moved = Math.hypot(F.x - x0, F.y - y0);
  prov.moving = moved > 0.01;
  if (moved > 0 && wildMarched(moved, wildPace(F.x, F.y))) {            // a day's march done: night, and tomorrow they go on
    prov.night = performance.now(); SFX.ui('camp'); save();
    fieldDayDone();
    if (!G.field) return;
    if (G.pendingEvent || !document.getElementById('modal').hidden) { prov.path = null; villageStill(); }
  }
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
  vil.x = 566; vil.y = 83; vil.at = null; vil.path = null; vil.face = 'left';
  SFX.music('ludus');
  render();
  if (G.pendingEvent) showEvent();
}

// What is said of each landmark, and of the kinds of place where people live.
const LORE = {
  'The great oak': 'Older than the town. Children still swing from it.', 'A villa in its garden': 'A senator comes here for the summer.', 'The old arch': 'Raised for a victory nobody now remembers.', 'The wine press': 'The whole valley treads its grapes here.',
  'The fallen colossus': 'An emperor, some say. The face is gone.', 'An old battlefield': 'The plough still turns up iron.', 'The bee garden': 'Honey for the governor. The keeper is never stung.', 'The mill': 'It has ground this country its bread for a hundred years.',
  'A wreck on the strand': 'A grain ship, driven in by a winter gale.', 'The beacon': 'Lit every night for the ships.', 'The bones of a whale': 'It came ashore in the year of the great storm.', "The fishers' huts": 'They sell at the town gate before dawn.',
  'The charcoal burners': 'They watch the clamp day and night.', "The hunters' lodge": 'Boar on the wall, and room for a dozen.', 'A burnt village': 'Raiders came. Nobody has gone back.', 'The great quarry': 'Half the town was cut from this hill.',
  'The lime kiln': 'Its fire has not been let go out in years.', 'The unfinished columns': 'Ordered for a temple that was never paid for.', 'The watchtower': 'Two men, a fire, and a long view north.', 'The hot spring': 'The water comes up warm and smells of eggs.',
  'The eagle rock': 'A pair nests here every spring.', 'The ring of stones': 'Raised before the legions came. Nobody knows why.', "The giant's table": 'Three stones and a roof. A grave, once.', 'The needle': 'Travellers leave a coin at its foot.',
  'The drowned temple': 'The marsh took it. Lights are seen there.', 'The causeway': 'Keep to the stones. Men have not.', 'The bog oak': 'Black as iron, and as hard.', 'The huts on stilts': 'Marsh folk. They trade eels for salt.',
  'The wolf stone': 'Carved by no one living. It is avoided after dark.', "The shepherds' fold": 'The flocks are counted in here at night.', 'The gallows': 'The governor sets his justice by the road.', 'The broken aqueduct': 'It ran to the town once. Now it only drips.',
  'The great waterfall': 'It can be heard a mile off.', 'The salt pans': 'Sea water in, salt out: the oldest trade on the shore.', 'The sacred grove': 'No axe is laid to these trees.', 'The white temple': 'Built of the hill it stands on.',
  'The barrow of kings': 'Whoever lies here was buried with his horses.', 'The fort': 'A cohort keeps the road from here.', 'The old arena': 'Men fought here before your school was thought of.', 'The ferry': 'Ring the bell and wait.',
  "A shepherd's hut": 'One man, one dog, a summer of sheep.', "A woodcutter's cabin": 'He sells by the cartload at the town.', "A charcoal burner's clamp": 'Wood goes in. A week later, charcoal.', "A fisherman's hut": 'Nets out to dry, and a boat drawn up.',
  'A mill on the water': 'The stream does the work.', 'A windmill': 'Up where the wind never drops.', 'A field barn': 'Hay under cover till winter.', "A peat cutter's hut": 'He cuts the bog into bricks to burn.', 'A lime kiln': 'Stone burnt to lime for the builders.',
  'A wayside inn': 'A bed, a stable, and watered wine.', "A hermit's cell": 'He wants nothing and is brought bread.', "A beekeeper's cottage": 'A row of skeps along the wall.', 'A vineyard house': 'The rows run right up to the door.', 'A house fallen in': 'Whoever lived here is long gone.',
};

// ---------- what is known of a place ----------
const SITE_WHAT = {
  bounty: 'The Magistrate pays for this. A fight.', lair: 'Beasts live here. A fight.', camp: 'Outlaws. A fight, and what they have stolen.', ruin: 'Old stones. There may be something left, or something waiting.',
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
const daysWord = n => n < 0 ? 'no way there' : n === 0 ? 'there today' : `${n} day${n === 1 ? "'s" : "s'"} march`;
// Roughly how long to somewhere, and which way: as the crow flies, so the road may prove longer.
const wayTo = (x, y) => { const F = G.field, d = Math.hypot(x - F.x, y - F.y), n = marchDays(d); return d < 40 ? 'close by' : `${n === 0 ? 'today' : `about ${n} day${n === 1 ? '' : 's'}`} ${COMPASS[Math.round(Math.atan2(y - F.y, x - F.x) / (Math.PI / 4) + 8) % 8]}`; };
// ---------- the hour, out in the country ----------
// Out here the day is as long as the day's march: dawn when the column sets out fresh, dusk as the march runs out,
// night when it is spent. dayPart is 0 at dawn and 1 at nightfall.
const dayPart = () => clamp(((G.field && G.field.march) || 0) / marchDay(), 0, 1);
const HOURS = [[0.1, 'DAWN'], [0.38, 'MORNING'], [0.6, 'MIDDAY'], [0.86, 'AFTERNOON'], [2, 'DUSK']];
const hourWord = () => HOURS.find(h => dayPart() < h[0])[1];
// The light for that hour, from the same sky as the yard's (its day runs dawn to dusk over the first 0.7 of its clock).
// How dark it is out there, 0 to 1. The day on the march runs dawn to dusk, so lamps are lit as dusk comes on, and
// again in the short night when camp is made.
function provDark() { const nk = (performance.now() - (prov.night || -1e9)) / 1700; return Math.max(provSky().night * 2.4, nk >= 0 && nk < 1 ? Math.sin(nk * Math.PI) : 0); }
function provSky() { return yardSky((((0.05 + dayPart() * 0.6) - 0.2 + 1) % 1) * YARD_DAY); }
// The dial: the sun on its arc from dawn to dusk, the hour in a word, the day, and what is left of today's march.
function provDial(ctx, x, y) {
  const p = dayPart(), camped = performance.now() - (prov.night || -1e9) < 1500;
  ctx.fillStyle = 'rgba(24,16,10,.82)'; ctx.fillRect(x, y, 96, 27);
  ctx.fillStyle = '#e0aa3e'; ctx.fillRect(x, y, 96, 0.5);
  // the sky's arc, with the ground under it
  const cx = x + 20, cy = y + 20, r = 14;
  ctx.fillStyle = '#6b5f50'; ctx.fillRect(x + 4, cy, 32, 1);
  for (let k = 0; k <= 12; k++) { const a = Math.PI * (1 - k / 12); ctx.fillStyle = k / 12 <= p ? '#8a7a55' : '#4a4034'; ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy - Math.sin(a) * r), 1, 1); }
  const a = Math.PI * (1 - p), sx = Math.round(cx + Math.cos(a) * r), sy = Math.round(cy - Math.sin(a) * r);
  if (camped) { ctx.fillStyle = '#cfd8e8'; ctx.fillRect(cx - 2, cy - 12, 5, 5); ctx.fillStyle = 'rgba(24,16,10,.82)'; ctx.fillRect(cx, cy - 12, 3, 4); }      // a moon, while they sleep
  else { ctx.fillStyle = p > 0.86 ? '#f08a4a' : '#ffd24a'; ctx.fillRect(sx - 2, sy - 2, 5, 5); ctx.fillStyle = '#fff0b0'; ctx.fillRect(sx - 1, sy - 1, 3, 3); }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 7px Consolas, monospace'; ctx.fillStyle = p > 0.86 ? '#f0a070' : '#f2e6cc'; ctx.fillText(camped ? 'NIGHT' : hourWord(), x + 40, y + 9);
  ctx.font = 'bold 5px Consolas, monospace'; ctx.fillStyle = '#a8947a'; ctx.fillText(`DAY ${G.day}`, x + 40, y + 16);
  ctx.fillStyle = '#c9b9a0'; ctx.fillText('MARCH', x + 40, y + 23.5);
  ctx.fillStyle = '#2a2418'; ctx.fillRect(x + 60, y + 19, 32, 5); ctx.fillStyle = p > 0.86 ? '#e2695c' : '#e0aa3e'; ctx.fillRect(x + 60, y + 19, Math.round(32 * (1 - p)), 5);
}

// What the march to wherever the mouse is would take, by the way the column would really go. Worked out a few times a second.
function provPeek() {
  const m = prov.mouse, F = G.field;
  if (!m || !F) { prov.peek = null; return null; }
  const now = performance.now();
  if (!prov.peek || now - prov.peek.at > 220 || prov.peek.big !== prov.big) {
    const x = prov.big ? m.u * WILD.W : prov.camX + m.u * PROV.VW, y = prov.big ? m.v * WILD.H : prov.camY + m.v * PROV.VH;
    const path = provPath(F.x, F.y, x, y);
    prov.peek = { at: now, big: prov.big, days: path ? marchDays(pathCost(F.x, F.y, path)) : -1 };
  }
  return prov.peek;
}
// The word on the march now under way: where to, how long, and whether the games will be missed.
function marchWord() {
  const F = G.field;
  if (!prov.path || !prov.path.length) return null;
  const n = marchDays(pathCost(F.x, F.y, prov.path)), miss = daysToGames() <= n && n > 0;
  return { text: `${(prov.dest || 'YOUR MARK').toUpperCase()}: ${n === 0 ? 'THERE TODAY' : `${n} DAY${n === 1 ? '' : 'S'} TO GO, ARRIVING DAY ${G.day + n}`}${miss ? '  -  THE GAMES WILL BE HELD WITHOUT YOU' : ''}`, miss };
}
// Whatever the mouse is resting on: a known place, the town, or nothing.
function provHover() {
  const m = prov.mouse, F = G.field;
  if (!m || !F) return null;
  const x = prov.big ? m.u * WILD.W : prov.camX + m.u * PROV.VW, y = prov.big ? m.v * WILD.H : prov.camY + m.v * PROV.VH, reach = prov.big ? 46 : 15;
  let best = null, bd = reach;
  for (const st of wildSites()) { if (!siteKnown(st)) continue; const d = Math.hypot(st.x - x, st.y - y); if (d < bd) { bd = d; best = st; } }
  if (!best && !prov.big && Math.abs(x - STABLES.x) < 24 && y > STABLES.y - 22 && y < STABLES.y + 10) return { stables: true, x: STABLES.x, y: STABLES.y };
  if (!best && (Math.hypot(WILD.TOWN.x - x, WILD.TOWN.y - y) < reach + 8 || (x > WILD.TOWN.x - 46 && x < WILD.TOWN.x + 21 && y > WILD.TOWN.y - 30 && y < WILD.TOWN.y + 14))) return { home: true, x: WILD.TOWN.x, y: WILD.TOWN.y };
  if (!best && !prov.big) {                     // a landmark, once it has been seen
    const m = (prov.marks || []).find(q => x > q.x - 4 && x < q.x + q.r * 2 + 4 && y > q.y - q.r * 1.6 && y < q.y + 14 && wildSeen(q.x + q.r, q.y));
    if (m) return { landmark: true, name: m.name, dw: m.dw, x: m.x + m.r, y: m.y - 6 };
  }
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
  if (hv.stables) { const l = G.fac.stables | 0; return [[['YOUR STABLES', '#f5d584'], [FACILITIES.stables.effect(l) + '.', '#f2e6cc'], [l < 3 ? 'CLICK TO WALK THERE AND IMPROVE THEM: ' + FAC_COST[l] + ' DENARII' : 'FULLY BUILT', '#a8947a']], 0]; }
  if (hv.landmark) return [[[hv.name.toUpperCase(), '#f2e6cc']].concat(LORE[hv.name] ? [[LORE[hv.name], '#f2e6cc']] : [], [[(hv.dw ? 'It stands in ' : 'A landmark of ') + wildRegion(hv.x, hv.y) + '.', '#d8c8a8']]), 0];
  const done = siteDone(hv), mark = wildMap().marks[hv.id] && !done, dz = siteDanger(hv);
  const lines = [[hv.name.toUpperCase(), mark ? '#f5d584' : '#f2e6cc']];
  if (done) lines.push(['Dealt with.', '#a8947a']);
  else { lines.push([SITE_WHAT[hv.kind] || '', '#d8c8a8']); if (mark) lines.push(['Marked: something sent you here.', '#f5d584']); if (!dz) lines.push(['No danger known.', '#9fce86']); }
  lines.push([wayTo(hv.x, hv.y).toUpperCase() + '  -  CLICK TO MARCH THERE', '#a8947a']);
  return [lines, done ? 0 : dz];
}

// ---------- drawing ----------
function provIcon(ctx, s, T, done) {
  // each place has a number of its own, from its name: it decides which way the picture faces and how it is tinted
  const sd0 = [...String(s.id || s.kind)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7), flip = !['cache', 'herb', 'bounty'].includes(s.kind) && sd0 % 2 === 1, hue = 0.9 + (sd0 % 9) * 0.025;
  const R = (x, y, w, h, c) => { ctx.fillStyle = done ? shade('#8a8478', 0.6 + ((x + y) % 3) * 0.12) : c[0] === '#' ? shade(c, hue) : c; ctx.fillRect(Math.round(s.x + (flip ? -x - w : x)), Math.round(s.y + y), w, h); };
  const hut = (ox, oy) => { R(ox - 4, oy - 3, 8, 5, '#d9c9a0'); R(ox - 4, oy - 3, 1, 5, '#eadcb6'); R(ox + 2, oy - 3, 2, 5, '#b8a67c'); R(ox - 4, oy + 1, 8, 1, '#b8a67c'); R(ox - 5, oy - 6, 10, 3, '#8a5a32'); R(ox - 4, oy - 7, 8, 1, '#a8703c'); R(ox + 1, oy - 6, 4, 3, '#6f4424'); R(ox - 5, oy - 3, 10, 1, '#5e3a1e'); R(ox - 1, oy - 1, 2, 3, '#3a2416'); R(ox - 1, oy - 2, 2, 1, '#8a6a3a'); R(ox - 3, oy - 1, 1, 1, '#3a2a1c'); R(ox + 2, oy - 9, 2, 3, '#8a8478'); R(ox + 2, oy - 9, 2, 1, '#a39c88'); };      // a wall with a light and a dark end, a roof with a ridge, a door under its lintel, a window, a chimney
  const tent = (ox, oy, c) => { for (let i = 0; i < 6; i++) { R(ox - i, oy - 6 + i, i * 2 + 1, 1, i % 4 < 2 ? c : shade(c, 0.9)); if (i) R(ox + 1, oy - 6 + i, i, 1, shade(c, 0.76)); } R(ox, oy - 8, 1, 2, '#3a2a1c'); R(ox - 1, oy - 2, 2, 3, '#2a1d12'); R(ox - 2, oy - 2, 1, 3, shade(c, 1.15)); R(ox - 7, oy, 1, 1, '#c9b890'); R(ox + 7, oy, 1, 1, '#c9b890'); };      // the pole through its peak, one side in shade, the flap tied back, and its pegs
  if (!done) { const kk = s.kind, gc = kk === 'camp' || kk === 'slavers' || kk === 'chief' || kk === 'bounty' ? '120,96,60' : kk === 'lair' ? '70,58,34' : kk === 'ruin' || kk === 'battlefield' || kk === 'shrine' || kk === 'vow' ? '200,192,170' : kk === 'quarry' ? '232,226,208' : '150,126,82';
    const rg0 = wildRegion(s.x, s.y), gc2 = rg0 === 'The Salt Shore' ? '226,208,156' : rg0 === 'The High Fells' ? '226,230,238' : rg0 === 'Blackmere' ? '52,76,66' : rg0 === 'The Quarry Hills' && gc === '150,126,82' ? '206,196,168' : gc;
    if (!['cache', 'herb'].includes(kk) && !kk.startsWith('errand')) for (let dy = -6; dy <= 6; dy++) { const w = Math.round(20 * Math.sqrt(1 - (dy * dy) / 43)); R(-w, 3 + dy, w * 2, 1, `rgba(${gc2},.16)`); }
    if (!['cache', 'herb'].includes(kk) && !kk.startsWith('errand')) for (let dy = -5; dy <= 5; dy++) { const w = Math.round(17 * Math.sqrt(1 - (dy * dy) / 30)) + (((sd0 >> (dy + 5)) & 1) ? 1 : -1); R(-w, 3 + dy, w * 2, 1, `rgba(${gc},.3)`); }      // the ground about it: trodden, fouled, paved or white with dust
    for (let i = 0; i < 5; i++) R(-6 + i * 2, 4 + i, 15, 1, 'rgba(0,0,0,.09)'); }      // and its shadow, lying away to the south-east
  R(-7, 3, 15, 2, 'rgba(0,0,0,.22)');
  const k = s.kind, tr = s.tier || 1;
  // a number from the place's own name, so that two of a kind are still not two of a picture
  const sd = [...String(s.id || s.kind)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7), v = n => ((sd * (n * 2 + 3) * 7919) % 1000) / 1000;
  const pick = (n, list) => list[Math.floor(v(n) * list.length) % list.length];
  if (k.startsWith('errand')) { const wv = Math.sin(T * 5) > 0 ? 1 : 0; R(-1, -12, 1, 16, '#5a4326'); R(0, -12 + wv, 6, 4, '#e8b545'); R(0, -12 + wv, 6, 1, '#fff0b0'); R(2, -11 + wv, 2, 2, '#a8261c'); R(6, -11 - wv + 1, 2, 2, '#c9952e'); R(-3, 3, 5, 2, '#8f8a80'); }      // a gold pennon set up where somebody's errand lies
  else if (k === 'bounty') { tent(-3, 4, '#8a3a2a'); R(4, -8, 1, 12, '#5a4326'); R(5, -8, 5, 4, '#c23b2e'); R(6, -7, 2, 2, '#f1ead8'); R(-8, 2, 3, 2, '#efe8d8'); R(-7, 1, 1, 1, '#efe8d8'); }
  else if (k === 'lair') {
    if (tr === 1) { R(-7, -2, 14, 6, '#7a6a4a'); R(-5, -4, 10, 2, '#8a7a56'); R(-2, -1, 5, 5, '#1a1410'); R(-1, -2, 3, 1, '#1a1410'); R(5, 3, 2, 1, '#efe8d8'); R(-7, 3, 1, 1, '#efe8d8'); R(v(1) > 0.5 ? -6 : 3, -5, 3, 1, '#6f8a4a'); }                       // a den dug into a bank
    else if (tr === 2) { R(-8, -1, 16, 6, '#5a4a34'); R(-6, 0, 12, 4, '#3d3426'); R(-3, 1, 6, 2, '#57492f'); R(-9, -4, 1, 4, '#8a9a4a'); R(7, -5, 1, 5, '#8a9a4a'); R(-7, -5, 1, 4, '#9aaa5a'); R(3, 3, 3, 2, '#efe8d8'); R(6, 3, 1, 1, '#efe8d8'); }                 // a wallow, churned to mud
    else if (tr === 3) { R(-8, -6, 16, 11, '#77705f'); R(-7, -8, 13, 2, '#8f8a78'); R(-5, -10, 8, 2, '#8f8a78'); R(-3, -3, 7, 8, '#1a1410'); R(-2, -4, 5, 1, '#1a1410'); R(5, 3, 2, 1, '#efe8d8'); R(-8, 2, 2, 3, '#6a6352'); R(6, -6, 2, 2, '#a39c88'); }               // a cave in the rock
    else if (tr === 4) { R(-9, 0, 18, 5, '#8f8a78'); R(-7, -3, 12, 3, '#a39c88'); R(-9, 0, 18, 1, '#b5ae9a'); R(-3, -6, 7, 3, '#c9a05a'); R(3, -7, 3, 3, '#c9a05a'); R(-4, -7, 3, 2, '#a8803c'); R(-5, -5, 2, 1, '#c9a05a'); R(6, 2, 2, 1, '#efe8d8'); R(-6, 3, 3, 1, '#efe8d8'); }      // a ridge, and what lies sunning on it
    else { R(-8, 0, 16, 5, 'rgba(120,30,20,.35)'); for (let q = 0; q < 5; q++) R(-6 + q * 3, -5 + Math.abs(q - 2), 1, 6 - Math.abs(q - 2), '#efe8d8'); R(-7, 1, 14, 1, '#e0d8c4'); R(-9, -1, 3, 3, '#efe8d8'); R(-8, 0, 1, 1, '#1a1410'); R(6, 2, 3, 2, '#efe8d8'); R(3, 4, 4, 1, '#efe8d8'); }      // a killing ground: what is left of everything that came here
  }
  else if (k === 'camp') {
    const c1 = pick(1, ['#b8a880', '#a89868', '#9a8a70', '#b09a7a']), c2 = pick(2, ['#a89868', '#8a7a5a', '#b8a880']);
    if (tr === 1) { R(-6, -3, 7, 1, '#6b4f2c'); for (let q = 0; q < 5; q++) R(-6 + q, -2 + q, 7 - q, 1, c1); R(2, 2, 2, 2, '#e2702a'); R(2, 1, 1, 1, '#f5c04a'); R(5, 3, 4, 1, '#5a4326'); R(-8, 4, 2, 1, '#8f8a84'); }                                                // a fire and a lean-to
    else if (tr === 2) { tent(-4, 3, c1); tent(4, 4, c2); R(0, 2, 2, 2, '#e2702a'); R(0, 1, 1, 1, '#f5c04a'); if (v(3) > 0.5) { R(8, -2, 1, 6, '#5a4326'); R(6, -1, 5, 1, '#5a4326'); } }                                                                           // two tents round a fire
    else if (tr === 3) { for (let q = -9; q <= 8; q += 2) { R(q, -3 + (q % 4 ? 0 : -1), 2, 7, '#6b4f2c'); R(q, -4 + (q % 4 ? 0 : -1), 2, 1, '#8a6a3a'); } R(-2, -1, 4, 5, '#2a1d12'); tent(-5, 1, c1); R(4, -8, 1, 6, '#3a2a1c'); R(5, -8, 4, 3, '#5a5a4a'); }          // a stockade
    else if (tr === 4) { R(-9, -5, 18, 10, '#8a7a5a'); R(-9, -5, 18, 2, '#a8966e'); for (let q = -9; q < 9; q += 4) R(q, -7, 2, 2, '#8a7a5a'); R(-2, 0, 4, 5, '#2a1d12'); R(-7, -2, 3, 3, '#6a5a44'); R(4, -2, 3, 3, '#6a5a44'); R(0, -13, 1, 7, '#3a2a1c'); R(1, -13, 5, 3, '#8a2a20'); R(2, -12, 2, 1, '#c9a21e'); }      // a fort, under a stolen standard
    else { R(-10, -2, 20, 7, '#5e4c3a'); for (let q = -10; q < 10; q += 3) R(q, -4, 2, 3, '#6b4f2c'); R(-4, -12, 8, 12, '#6a6052'); R(-4, -12, 2, 12, '#857a68'); R(-5, -14, 10, 2, '#4a4038'); R(-1, -5, 2, 5, '#1a1410'); R(-2, -9, 1, 2, '#1a1410'); R(1, -9, 1, 2, '#1a1410');
      for (const px of [-9, 8]) { R(px, -9, 1, 7, '#3a2a1c'); R(px - 1, -11, 3, 2, '#efe8d8'); } }                                                                                                                                                                  // a hold: a tower, a palisade, and skulls on poles
  }
  else if (k === 'slavers') { tent(-4, 3, '#a05a48'); tent(4, 4, '#8a4a3a'); R(0, 2, 2, 2, '#e2702a'); R(0, 1, 1, 1, '#f5c04a'); R(7, -8, 1, 8, '#3a2a1c'); R(8, -8, 4, 3, '#8a2a20'); for (let q = 0; q < 4; q++) R(-10 + q * 2, -2, 1, 6, '#3a2a1c'); R(-10, -2, 7, 1, '#3a2a1c'); }
  else if (k === 'chief') { for (let i = -8; i <= 7; i += 3) { R(i, -4 + ((i + 8) % 6 ? 0 : -1), 2, 8, '#6b4f2c'); R(i, -5 + ((i + 8) % 6 ? 0 : -1), 2, 1, '#8a6a3a'); } R(-3, -1, 6, 5, '#2a1d12'); R(-1, -11, 1, 7, '#3a2a1c'); R(0, -11, 5, 3, '#8a2a20'); }
  else if (k === 'ruin') {
    if (tr === 1) { R(-5, 1, 10, 3, '#b5af9b'); R(-3, -5, 2, 6, '#c9c3ae'); R(-4, -6, 4, 1, '#e4dfcd'); R(2, -1, 5, 2, '#c9c3ae'); R(2, -1, 5, 1, '#e4dfcd'); R(-7, 3, 2, 1, '#a39c88'); R(5, 3, 3, 1, '#a39c88'); R(-1, 0, 2, 1, '#6f8a4a'); }                           // a wayside shrine, its column down
    else if (tr === 2) { R(-8, -4, 16, 8, '#8f8676'); R(-8, -4, 2, 8, '#c9bca8'); R(-8, -7, 3, 3, '#c9bca8'); R(5, -6, 3, 2, '#b5aa94'); R(-5, -2, 10, 6, '#2a241e'); R(-3, -5, 1, 4, '#3a322c'); R(1, -6, 1, 5, '#3a322c'); R(-6, 4, 12, 1, '#57504a'); R(3, 1, 2, 3, '#120c0a'); }      // a villa, burnt out
    else if (tr === 3) { R(-6, -5, 12, 9, '#c9c3ae'); R(-6, -5, 2, 9, '#e4dfcd'); R(-7, -7, 14, 2, '#b5af9b'); R(-4, -9, 8, 2, '#c9c3ae'); R(-2, -2, 4, 6, '#1a1410'); R(3, 2, 3, 2, '#b5af9b'); R(4, 1, 2, 1, '#d9d2bd'); R(-8, 3, 2, 1, '#a39c88'); }                 // a tomb, its door broken in
    else if (tr === 4) { R(-7, -5, 14, 9, '#d9d2bd'); R(-7, -5, 2, 9, '#f0ead8'); R(5, -5, 2, 9, '#b5af9b'); R(-8, -7, 16, 2, '#c9c3ae'); for (let q = 0; q < 4; q++) R(-6 + q, -8 - q, 12 - q * 2, 1, '#d9d2bd'); R(-2, -2, 4, 6, '#a39c88'); R(-2, -2, 4, 1, '#c9c3ae'); R(-1, 0, 2, 1, '#8a2a20'); }      // a tomb still sealed
    else { for (let q = 0; q < 5; q++) R(-10 + q * 2, 2 - q * 3, 20 - q * 4, 3, q % 2 ? '#a39c88' : '#b5af9b'); R(-10, 2, 20, 1, '#c9c3ae'); R(-2, -1, 4, 4, '#1a1410'); R(-3, -2, 6, 1, '#d9d2bd'); R(-1, -13, 2, 3, '#b98a34'); for (const px of [-11, 10]) { R(px, -3, 1, 8, '#5a4326'); R(px - 1, -5, 3, 2, '#8a2a20'); } }      // a warlord's tomb, stepped, with his trophies
  }
  else if (k === 'battlefield') { R(-6, -6, 3, 9, '#c9c3ae'); R(-7, -7, 5, 1, '#e4dfcd'); R(1, -2, 3, 5, '#c9c3ae'); R(5, -4, 3, 7, '#b5af9b'); R(-2, 2, 6, 2, '#b5af9b'); R(-1, -10, 1, 9, '#5a4326'); R(0, -10, 4, 3, '#7e241c'); R(-5, 4, 3, 1, '#efe8d8'); }
  else if (k === 'barrow') { for (let i = 0; i < 6; i++) R(-9 + i, -1 - i, 18 - i * 2, 1, i < 2 ? '#5f7f3f' : '#6f8f48'); R(-9, 0, 18, 3, '#5f7f3f'); R(-2, -1, 4, 4, '#1a1410'); R(-3, -2, 6, 1, '#c9c3ae'); for (const ox of [-11, -7, 7, 10]) R(ox, 1, 2, 4, '#a8a290'); }
  else if (k === 'shrine' || k === 'vow') {
    const fl = pick(1, ['#e2702a', '#f0e0a0', '#7fd0c8']), cols = v(2) > 0.5 ? [-4, 2] : [-5, -1, 3];
    R(-6, 1, 12, 3, '#d6d0bd'); for (const cx of cols) { R(cx, -5, 2, 6, '#f1ecdc'); R(cx, -5, 1, 6, '#ffffff'); } R(-6, -7, 12, 2, '#d9d2bd'); if (v(3) > 0.5) for (let q = 0; q < 3; q++) R(-4 + q, -8 - q, 8 - q * 2, 1, '#d9d2bd');
    R(-1, -1, 2, 2, fl); R(-1, -2, 1, 1, '#f5c04a'); if (k === 'vow') R(5, -1, 2, 2, '#8a2a20');
  }
  else if (k === 'hamlet') {
    const roofs = ['#8a5a32', '#9a7a42', '#a8482a', '#7a6a4a'], cot = (ox, oy, n) => { R(ox - 4, oy - 3, 8, 5, pick(n, ['#d9c9a0', '#cdbd94', '#e2d2a8'])); R(ox - 5, oy - 6, 10, 3, roofs[Math.floor(v(n + 4) * 4)]); R(ox - 4, oy - 7, 8, 1, '#a8703c'); R(ox - 1, oy - 1, 2, 3, '#3a2416'); };
    cot(-5, 2, 1); cot(5, 3, 2); if (v(3) > 0.35) cot(0, -3, 3); if (v(7) > 0.5) { R(9, -2, 1, 6, '#6b4f2c'); R(-10, 1, 1, 4, '#6b4f2c'); R(-10, 2, 5, 1, '#6b4f2c'); } else { R(-9, 3, 3, 2, '#d9c070'); R(-8, 2, 1, 1, '#e6d088'); }
  }
  else if (k === 'merchant') { const awn = pick(1, ['#c9a25a', '#b93a2e', '#2f6db8', '#7a2a8a']); R(-6, -2, 7, 4, '#8a6a4a'); R(-7, -4, 3, 3, '#8a6a4a'); R(-5, 2, 1, 2, '#5a4326'); R(-1, 2, 1, 2, '#5a4326'); R(-4, -5, 5, 3, awn); R(3, -5, 3, 6, pick(2, ['#7a2a8a', '#3f7a5a', '#a8763a'])); R(3, -8, 3, 3, '#d9a57c'); if (v(3) > 0.5) { R(7, 0, 3, 3, '#b8703c'); R(8, -1, 1, 1, '#b8703c'); } }
  else if (k === 'quarry') {                 // a quarry worked by chained men: the cut face in two steps, blocks on the floor, a hoist, and the overseer's post
    R(-10, 5, 21, 2, 'rgba(0,0,0,.2)'); R(-10, 1, 20, 5, 'rgba(232,226,208,.5)');
    R(-9, -9, 18, 5, '#cfc5a8'); R(-9, -9, 18, 1, '#f1ead6'); R(-9, -5, 18, 1, '#9c9278'); R(3, -8, 6, 3, '#b9ae90'); for (const c of [-5, -1, 4]) R(c, -8, 1, 3, '#9c9278');
    R(-7, -4, 14, 4, '#b9ae90'); R(-7, -4, 14, 1, '#e2d9c0'); R(-7, -1, 14, 1, '#7f775f'); R(-10, -10, 20, 1, '#a9a070');
    R(-9, -4, 2, 8, '#cfc5a8'); R(7, -4, 2, 8, '#7f775f'); R(-7, 0, 14, 5, '#ddd5bd');
    R(-5, 1, 4, 3, '#f1ead6'); R(-5, 1, 4, 1, '#ffffff'); R(0, 2, 3, 2, '#e2d9c0'); R(0, 2, 3, 1, '#f8f6ee');
    R(5, -13, 1, 13, '#6b4f2c'); R(1, -13, 5, 1, '#7a5a34'); R(1, -12, 1, 4, '#c9b890'); R(0, -8, 3, 2, '#f1ead6');
    R(-13, -6, 1, 11, '#3a2a1c'); R(-12, -6, 3, 2, '#7a2a20');
  }
  else if (k === 'cache') { for (let i = -4; i <= 4; i++) { R(i, i, 2, 2, '#8a2a20'); R(i, -i, 2, 2, '#8a2a20'); } }
  else if (k === 'herb') { R(-1, -2, 2, 6, '#3f6a2a'); R(-4, -5, 3, 3, '#7fbf6a'); R(1, -6, 3, 3, '#7fbf6a'); R(-1, -8, 2, 2, '#c9e8a0'); }
  else if (k === 'healer') { hut(0, 2); for (let q = 0; q < 4; q++) R(-9 + q * 2, 3 + (q % 2), 1, 2, q % 2 ? '#7fbf6a' : '#5f9a4a'); R(6, 1, 1, 4, '#6b4f2c'); R(5, 0, 3, 1, '#7fbf6a'); R(7, 2, 1, 1, '#c9e8a0'); for (let q = 0; q < 3; q++) R(2 + q, -9 - q * 2, 2, 1, 'rgba(230,230,225,.6)'); }      // herbs in rows, a bunch hung to dry, smoke from the roof
  else if (k === 'hermit') { R(-6, -3, 12, 7, '#8a8478'); R(-5, -5, 9, 2, '#a39c88'); R(-2, -1, 4, 5, '#1a1410'); R(6, -6, 1, 10, '#6b4f2c'); R(5, -4, 3, 1, '#6b4f2c'); R(-8, 3, 2, 1, '#efe8d8'); }      // a cell in the rock, and his staff outside it
  else if (k === 'deserter') { hut(0, 2); R(6, -4, 1, 8, '#6b4f2c'); R(7, -4, 3, 2, '#8a2a20'); R(-8, 1, 3, 3, '#6b4f2c'); R(-8, 1, 3, 1, '#8a6a3a'); }      // an old soldier's hut: a faded pennant, and wood split and stacked
  else if (k === 'master') { hut(0, 2); for (let q = 0; q < 3; q++) { R(6 + q * 3, 1, 2, 3, '#d9b060'); R(6 + q * 3, 2, 2, 1, '#b89040'); } R(-8, 3, 4, 1, '#6f9a48'); }      // the beekeeper's: skeps by the door
  else hut(0, 2);
  {
    const hostile = k === 'camp' || k === 'slavers' || k === 'chief' || k === 'bounty', wild = k === 'lair', old = k === 'ruin' || k === 'battlefield' || k === 'barrow', skip = k === 'cache' || k === 'herb';
    const P = hostile ? [
      (x, y) => { R(x, y - 4, 1, 6, '#6b4f2c'); R(x + 3, y - 4, 1, 6, '#6b4f2c'); R(x, y - 3, 4, 1, '#6b4f2c'); R(x + 1, y - 6, 1, 6, '#c1c7cc'); R(x + 2, y - 5, 1, 5, '#c1c7cc'); },      // a rack of spears
      (x, y) => { R(x + 1, y - 6, 1, 8, '#3a2a1c'); R(x, y - 8, 3, 2, '#efe8d8'); },                                                                                                  // a skull on a pole
      (x, y) => { R(x, y - 1, 4, 3, '#2e2a28'); R(x - 1, y - 2, 6, 1, '#4a4440'); R(x + 1, y - 4, 1, 1, 'rgba(230,230,225,.6)'); },                                                   // a pot on the boil
      (x, y) => { R(x, y - 3, 3, 5, '#7a5a34'); R(x, y - 2, 3, 1, '#3a2a1c'); R(x, y + 1, 3, 1, '#3a2a1c'); },                                                                        // a barrel
      (x, y) => { R(x - 1, y - 3, 6, 3, '#6f5a48'); R(x + 4, y - 5, 2, 3, '#6f5a48'); R(x, y, 1, 2, '#3a2a22'); R(x + 3, y, 1, 2, '#3a2a22'); },                                    // a tethered horse
      (x, y) => { for (let q = 0; q < 3; q++) R(x + q % 2, y - q * 2, 5 - q, 2, q % 2 ? '#7a5a34' : '#6b4f2c'); },                                                                  // split wood
      (x, y) => { R(x + 1, y - 9, 1, 11, '#5a4326'); R(x, y - 9, 3, 1, '#5a4326'); R(x - 1, y - 12, 5, 3, '#6b4f2c'); },                                                             // a lookout's perch
      (x, y) => { R(x, y - 2, 5, 4, '#6b4526'); R(x, y - 2, 5, 1, '#b98a34'); R(x + 2, y - 1, 1, 1, '#e8b545'); },                                                                   // a chest of what they took
    ] : wild ? [
      (x, y) => { R(x, y, 4, 1, '#efe8d8'); R(x + 1, y - 1, 1, 3, '#efe8d8'); R(x + 3, y + 1, 2, 1, '#efe8d8'); },                                                                    // bones
      (x, y) => { R(x + 1, y - 7, 1, 9, '#4a4038'); R(x - 1, y - 5, 2, 1, '#4a4038'); R(x + 2, y - 6, 2, 1, '#4a4038'); },                                                            // a dead tree
      (x, y) => { R(x, y - 2, 5, 4, '#8a8478'); R(x + 1, y - 3, 3, 1, '#a39c88'); },                                                                                                  // a boulder
      (x, y) => { R(x, y - 2, 3, 4, '#6b4f2c'); R(x, y - 2, 3, 1, '#c9a763'); R(x + 1, y, 1, 1, '#efe8d8'); },                                                                        // a stump, clawed
      (x, y) => { R(x - 1, y - 1, 6, 3, '#7a4a3a'); R(x, y - 2, 3, 1, '#8a2a20'); R(x + 4, y + 1, 2, 1, '#efe8d8'); },                                                                // what it killed last
      (x, y) => { R(x, y - 7, 2, 1, '#1c1310'); R(x + 3, y - 5, 2, 1, '#1c1310'); R(x + 1, y, 3, 1, '#1c1310'); },                                                                    // crows waiting
      (x, y) => { for (let q = 0; q < 3; q++) R(x + q * 2, y - 3 + q, 1, 3, '#6b8f3e'); },                                                                                          // rank grass
      (x, y) => { R(x, y, 2, 1, '#3d3426'); R(x + 3, y - 2, 2, 1, '#3d3426'); R(x + 1, y + 2, 2, 1, '#3d3426'); },                                                                    // tracks
    ] : old ? [
      (x, y) => { R(x - 1, y, 7, 2, '#c9c3ae'); R(x - 1, y, 7, 1, '#e4dfcd'); R(x + 1, y, 1, 2, '#a39c88'); R(x + 4, y, 1, 2, '#a39c88'); },                                          // a column, down
      (x, y) => { R(x, y - 3, 4, 5, '#4f7a3a'); R(x + 1, y - 4, 2, 1, '#6f9a48'); },                                                                                                  // ivy
      (x, y) => { R(x + 1, y - 3, 3, 4, '#b8703c'); R(x + 1, y - 4, 1, 1, '#b8703c'); R(x + 3, y - 3, 1, 2, '#1a1410'); },                                                            // a broken urn
      (x, y) => { R(x, y, 6, 2, '#b5af9b'); R(x + 2, y, 1, 2, '#8f8876'); R(x + 4, y + 1, 2, 1, '#8f8876'); },                                                                        // old paving
      (x, y) => { R(x + 1, y - 8, 1, 10, '#4a3320'); for (let q = 0; q < 7; q++) R(x + (q < 1 || q > 5 ? 1 : 0), y - 9 + q, q < 1 || q > 5 ? 1 : 3, 1, q % 3 ? '#2f5234' : '#3f6844'); },      // a cypress, planted when it was new
      (x, y) => { R(x, y, 3, 2, '#a39c88'); R(x + 3, y + 1, 2, 1, '#b5af9b'); R(x + 1, y - 1, 1, 1, '#c9c3ae'); },                                                                    // rubble
      (x, y) => { R(x, y - 2, 4, 4, '#d9d2bd'); R(x, y - 2, 4, 1, '#f0ead8'); R(x + 1, y - 4, 2, 2, '#d9d2bd'); },                                                                    // a plinth, its statue gone
      (x, y) => { for (let q = 0; q < 3; q++) R(x + q * 2, y - 2 + (q % 2), 1, 3, '#7a9a4b'); R(x + 2, y - 3, 1, 1, '#e8a0a0'); },                                                    // weeds in flower
    ] : [
      (x, y) => { R(x, y - 1, 4, 3, '#b8ab94'); R(x + 1, y, 2, 1, '#4f8fb8'); R(x + 1, y - 5, 1, 4, '#6b4f2c'); R(x, y - 5, 4, 1, '#6b4f2c'); },                                      // a well
      (x, y) => { for (let q = 0; q < 6; q += 2) R(x + q, y - 2, 1, 4, '#6b4f2c'); R(x, y - 1, 6, 1, '#6b4f2c'); },                                                                  // a fence
      (x, y) => { R(x, y - 2, 4, 4, '#d9c070'); R(x + 1, y - 3, 2, 1, '#e6d088'); },                                                                                                  // a rick
      (x, y) => { R(x, y - 6, 1, 8, '#6b4f2c'); R(x + 5, y - 6, 1, 8, '#6b4f2c'); R(x, y - 5, 6, 1, '#c9b890'); R(x + 1, y - 4, 2, 2, '#f1ead8'); R(x + 3, y - 4, 2, 3, '#8fa8c8'); },      // washing on a line
      (x, y) => { R(x, y, 2, 2, '#f1ead8'); R(x + 3, y + 1, 2, 2, '#8a5a32'); R(x, y - 1, 1, 1, '#c23b2e'); R(x + 4, y, 1, 1, '#c23b2e'); },                                          // hens
      (x, y) => { for (let q = 0; q < 3; q++) { R(x, y - 2 + q * 2, 6, 1, '#6b4f2c'); R(x + 1 + q, y - 3 + q * 2, 1, 1, '#5f9a4a'); R(x + 4 - q, y - 3 + q * 2, 1, 1, '#7fbf6a'); } },      // a kitchen garden
      (x, y) => { R(x, y - 2, 6, 3, '#8a6a3a'); R(x, y - 3, 6, 1, '#a8834a'); R(x + 1, y + 1, 2, 2, '#3a2a1c'); R(x + 4, y + 1, 2, 2, '#3a2a1c'); },                                  // a handcart
      (x, y) => { R(x + 1, y - 6, 1, 8, '#4a3320'); R(x - 1, y - 9, 5, 4, '#4c7f38'); R(x, y - 10, 3, 1, '#69a04a'); R(x, y - 7, 1, 1, '#c23b2e'); },                                // an apple tree
    ];
    if (!skip) { const a = Math.floor(v(11) * P.length) % P.length, b = (a + 1 + Math.floor(v(12) * (P.length - 1))) % P.length; P[a](-15, 2); if (v(13) > 0.25) P[b](11, 3); }
  }
  if (!done) {                                 // ---- what was added to each since: the light and dark of it, what it is made of, and what moves there ----
    const fl = Math.sin(T * 11 + sd) > 0 ? 1 : 0, wv = Math.sin(T * 5 + sd) > 0 ? 1 : 0;
    const puff = (ox, oy, n) => { for (let i = 0; i < n; i++) { const q = (T * 0.28 + i / n + sd * 0.01) % 1; ctx.globalAlpha = 0.5 * (1 - q); R(ox + Math.round(Math.sin(q * 5 + i) * 2 + q * 4), oy - Math.round(q * 12), 2 + Math.round(q * 2), 2, '#d8d4cc'); } ctx.globalAlpha = 1; };
    const fire = (ox, oy) => { R(ox - 1, oy, 4, 1, '#3a342c'); R(ox, oy - 1 - fl, 2, 2 + fl, '#e2702a'); R(ox + fl, oy - 2 - fl, 1, 1, '#f5c04a'); };
    const eyes = (ox, oy) => { if (Math.sin(T * 0.8 + sd) > -0.3) { R(ox, oy, 1, 1, '#e8c040'); R(ox + 2, oy, 1, 1, '#e8c040'); } };
    const flag = (ox, oy, c) => { R(ox, oy + wv, 3, 3, c); R(ox + 3, oy + 1 - wv, 2, 2, shade(c, 0.85)); };
    // ---- what every site of a kind has in common: how dangerous it is, the country it lies in, the hour, who is there ----
    const reg = wildRegion(s.x, s.y), nightNow = typeof provDark === 'function' ? provDark() : 0, lit2 = nightNow > 0.3;
    const hostile2 = k === 'camp' || k === 'slavers' || k === 'chief' || k === 'bounty', homely2 = ['hamlet', 'healer', 'deserter', 'master', 'merchant'].includes(k) || !['lair', 'camp', 'slavers', 'chief', 'bounty', 'ruin', 'battlefield', 'barrow', 'shrine', 'vow', 'quarry', 'cache', 'herb', 'hermit'].includes(k) && !k.startsWith('errand');
    const glowAt = (ox, oy, r) => { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,170,80,.07)'; for (let q = 0; q < 3; q++) { const rr = r - q * (r / 3.5); ctx.fillRect(Math.round(s.x + (flip ? -ox : ox) - rr), Math.round(s.y + oy - rr * 0.7), Math.round(rr * 2), Math.round(rr * 1.4)); } ctx.globalCompositeOperation = 'source-over'; };
    const fig = (ox, oy, tunic, spear) => { R(ox, oy + 1, 3, 1, 'rgba(0,0,0,.22)'); R(ox, oy - 5, 2, 2, '#d9a57c'); R(ox, oy - 6, 2, 1, '#3a2a1c'); R(ox, oy - 3, 2, 3, tunic); R(ox, oy, 1, 1, '#3a2a1c'); R(ox + 1, oy, 1, 1, '#3a2a1c'); if (spear) { R(ox + 2, oy - 8, 1, 9, '#6b4f2c'); R(ox + 2, oy - 9, 1, 1, '#c1c7cc'); } };
    const beat = (x0, x1, sp) => { const u = (T * sp + sd * 0.13) % 2; return Math.round(x0 + (x1 - x0) * (u < 1 ? u : 2 - u)); };
    // the way in: a track worn to it from the south
    if (!['cache', 'herb'].includes(k) && !k.startsWith('errand')) for (let q = 0; q < 4; q++) R(-1 + Math.round(Math.sin(q * 1.3 + sd) * 2), 6 + q * 2, 3, 1, q % 2 ? 'rgba(170,148,100,.55)' : 'rgba(128,106,66,.5)');
    if (hostile2) {
      // the more dangerous the place, the more it is dug in: a ditch, then stakes set in it, then heads on poles and a second fire
      if (tr >= 2) for (let q = -14; q <= 13; q += 2) R(q, 7 + Math.round(Math.abs(q) * 0.12), 2, 1, 'rgba(40,30,16,.4)');
      if (tr >= 3) for (let q = -13; q <= 12; q += 3) { R(q, 5 + Math.round(Math.abs(q) * 0.12), 1, 3, '#5a4326'); R(q, 5 + Math.round(Math.abs(q) * 0.12), 1, 1, '#94703f'); }
      if (tr >= 4) { for (const px of [-15, 14]) { R(px, -2, 1, 8, '#3a2a1c'); R(px - 1, -4, 3, 2, '#efe8d8'); R(px, -3, 1, 1, '#2a1c14'); } fire(-11, 4); }
      if (tr >= 5) { R(-17, 1, 1, 6, '#3a2a1c'); R(-17, 0, 3, 1, '#3a2a1c'); R(-16, 1, 1, 3, '#8a7a66'); R(16, 0, 1, 7, '#3a2a1c'); R(15, -1, 3, 1, '#3a2a1c'); R(16, 0, 1, 3, '#8a7a66'); }      // and a man hung up at either end, to say whose ground it is
      // a sentry walking his beat in front of it, and at night the fires show a long way
      fig(beat(-12, 9, 0.07), 6, tr >= 4 ? '#7a2a20' : '#6a5a3a', true); if (tr >= 3) fig(beat(10, -10, 0.05), 8, '#5a4a3a', true);
      if (lit2) { glowAt(k === 'bounty' ? -8 : k === 'camp' && tr === 1 ? 2 : k === 'camp' && tr >= 3 ? 6 : k === 'chief' ? 6 : 0, 2, 13); if (tr >= 4) glowAt(-11, 3, 10); }
    } else if (k === 'lair') {
      // the worse the beast, the more it has killed: bones, a carcass, the ground torn
      for (let q = 0; q < tr * 2; q++) R(-13 + Math.floor(v(20 + q) * 26), 4 + Math.floor(v(30 + q) * 4), 1 + Math.floor(v(40 + q) * 2), 1, q % 3 ? '#efe8d8' : '#d8d0bc');
      if (tr >= 3) { R(9, 3, 5, 2, '#7a4a3a'); R(9, 3, 5, 1, '#9a5a4a'); R(13, 2, 2, 1, '#efe8d8'); R(10, 5, 1, 1, '#8a2a20'); for (let q = 0; q < 3; q++) R(-13 + q, 1 + q * 2, 1, 2, '#3d3426'); }
      if (tr >= 4) { R(-14, 4, 3, 2, '#efe8d8'); R(-13, 3, 1, 1, '#efe8d8'); R(-14, 4, 1, 1, '#2a1c14'); const cw = Math.floor(T * 0.5 + sd) % 2; R(11 + cw, 1, 2, 1, '#1c1310'); }
      if (lit2 && (tr === 1 || tr === 3)) { R(-1, tr === 1 ? 1 : 0, 1, 1, '#fff0a0'); R(1, tr === 1 ? 1 : 0, 1, 1, '#fff0a0'); }
    } else if (k === 'ruin' || k === 'battlefield' || k === 'barrow') {
      for (let q = 0; q < 1 + tr; q++) { const fx = -14 + Math.floor(v(50 + q) * 28), fy = 4 + Math.floor(v(60 + q) * 4); R(fx, fy, 3, 2, q % 2 ? '#b5af9b' : '#c9c3ae'); R(fx, fy, 3, 1, '#e4dfcd'); }      // the greater it was, the further its stones lie
      if (tr >= 4) { R(-14, -3, 2, 7, '#c9c3ae'); R(-14, -3, 1, 7, '#e4dfcd'); R(-15, -4, 4, 1, '#d9d2bd'); R(12, -1, 2, 5, '#b5af9b'); R(11, -2, 4, 1, '#c9c3ae'); }
      if (lit2 && k !== 'battlefield' && v(70) > 0.5) { ctx.globalAlpha = 0.5 + 0.3 * Math.sin(T * 1.4 + sd); R(-1, 0, 2, 2, '#b8d8ff'); ctx.globalAlpha = 1; }                                             // and after dark, sometimes, a light in it that is not a lamp
    } else if (k === 'shrine' || k === 'vow') {
      if (Math.floor(T * 0.03 + v(71) * 4) % 3 === 0) fig(beat(-10, -5, 0.04), 5, '#f1ead8');      // a priest, some of the time
      if (lit2) glowAt(0, 0, 11);
      for (let q = -9; q <= 8; q += 5) R(q, 6, 3, 1, '#c9c3ae');
    } else if (k === 'quarry') {
      fig(-11, 5, '#7a2a20', true); fig(beat(2, 7, 0.06), 6, '#8a7a66'); for (let q = 0; q < 5; q++) R(-12 + q * 5, 7 + (q % 2), 2, 1, q % 2 ? '#f1ead6' : '#cfc5a8');      // the overseer, a man carrying, and chips everywhere
    } else if (k === 'hermit') {
      R(8, 2, 2, 2, '#d9a57c'); R(8, 4, 3, 2, '#8a7a66'); R(8, 1, 2, 1, '#c9c2b2'); for (let q = 0; q < 3; q++) R(-11 + q * 2, 4 + (q % 2), 1, 2, '#5f9a4a'); if (lit2) glowAt(-1, 1, 8);      // the man himself, sat outside; a few herbs he grows
    } else if (homely2) {
      // people who live there: a fence round the back of it, somebody about by day, the window lit at night
      for (const px of [-14, -12, -10, 10, 12, 14]) R(px, -3 + Math.abs(Math.abs(px) - 12), 1, 4, '#6b4f2c'); R(-14, -1, 5, 1, '#8a6a3a'); R(10, -1, 5, 1, '#8a6a3a');
      if (!lit2) { fig(beat(-11, -5, 0.05), 7, ['#8a6a4a', '#5a6a8a', '#8a4a3a', '#b8a888'][Math.floor(v(72) * 4)]); if (k === 'hamlet') fig(beat(11, 6, 0.04), 8, '#b8703c'); }
      else { R(k === 'hamlet' ? -8 : -3, k === 'hamlet' ? 1 : 1, 1, 1, '#f5c04a'); if (k === 'hamlet') R(2, 2, 1, 1, '#f5c04a'); glowAt(k === 'hamlet' ? -5 : 0, 1, 9); }
      if (k === 'merchant') { fig(-9, 5, '#7a2a8a'); R(2, 3, 2, 2, '#c9a21e'); R(5, 4, 2, 1, '#b93a2e'); }
    }
    // the country it lies in shows on it
    if (reg === 'The High Fells') { for (let q = 0; q < 6; q++) R(-9 + Math.floor(v(80 + q) * 18), -9 + Math.floor(v(86 + q) * 3), 2 + Math.floor(v(92 + q) * 2), 1, '#f4f6fa'); R(-13, 5, 4, 1, '#f4f6fa'); R(9, 6, 5, 1, '#e2e8f0'); }                 // snow lying on it
    else if (reg === 'Blackmere') { R(-15, 5, 6, 2, '#2e4842'); R(-14, 5, 4, 1, '#48686a'); R(10, 6, 5, 2, '#2e4842'); for (const rx of [-16, -12, 13, 16]) { R(rx, 1, 1, 5, '#8a9a4a'); R(rx, 0, 1, 1, '#5a4326'); } }                                  // standing water and reeds
    else if (reg === 'The Salt Shore') { for (let q = 0; q < 4; q++) R(-13 + Math.floor(v(98 + q) * 26), 5 + Math.floor(v(102 + q) * 3), 2, 1, q % 2 ? '#f0e2b4' : '#f8f4ea'); R(12, 3, 1, 4, '#6f8a4a'); R(11, 2, 3, 1, '#8aa85a'); }                  // sand blown against it, sea-grass
    else if (reg === 'Greywood') { for (let q = 0; q < 5; q++) R(-9 + Math.floor(v(106 + q) * 18), -6 + Math.floor(v(111 + q) * 9), 2, 1, q % 2 ? '#6f8a5a' : '#5a7248'); R(-13, 4, 1, 2, '#4f8a3a'); R(-14, 3, 1, 1, '#6faa4e'); R(12, 5, 1, 2, '#4f8a3a'); }      // moss on it, fern at its foot
    else if (reg === 'The Quarry Hills') { for (let q = 0; q < 5; q++) R(-13 + Math.floor(v(116 + q) * 26), 5 + Math.floor(v(121 + q) * 3), 2, 1, q % 2 ? '#e2d9c0' : '#b9ae90'); }
    else if (reg === 'The Barrow Downs') { for (let q = 0; q < 6; q++) R(-14 + Math.floor(v(126 + q) * 28), 4 + Math.floor(v(132 + q) * 4), 1, 1, q % 2 ? '#b070c0' : '#c890d0'); }
    else if (reg === 'The Long Meadows') { for (let q = 0; q < 6; q++) R(-14 + Math.floor(v(138 + q) * 28), 4 + Math.floor(v(144 + q) * 4), 1, 1, ['#f2e6a0', '#f4f4f0', '#e8a0c0'][q % 3]); }
    if (k === 'lair') {
      if (tr === 1) { R(-7, -2, 14, 1, '#a39468'); R(3, -1, 4, 5, 'rgba(0,0,0,.16)'); R(-3, -2, 1, 3, '#5a4a34'); R(1, -2, 1, 2, '#5a4a34'); eyes(-1, 1); R(-9, 2, 3, 2, '#6f8a4a'); R(-8, 1, 1, 1, '#8aa85a'); R(7, 1, 3, 2, '#5f7a3e'); }      // roots over the mouth of it, and something looking out
      else if (tr === 2) { R(-6, 0, 12, 1, '#4a3f2c'); R(-2, 2, 4, 1, '#6a5a3a'); for (const rx of [-9, -7, 7]) R(rx + wv, -6, 1, 2, '#aaba6a'); R(-4, 1, 2, 1, '#7a5a3a'); R(0, 2, 3, 1, '#3a2e20'); R(5, 0, 2, 1, '#8a9a4a'); }                // the wallow churned, and the rushes moving
      else if (tr === 3) { R(-8, -6, 2, 11, '#928a76'); R(4, -6, 4, 11, 'rgba(0,0,0,.2)'); R(-7, -8, 13, 1, '#a8a290'); R(-5, -10, 8, 1, '#a8a290'); R(-6, -5, 3, 1, '#6f8a4a'); R(2, -9, 3, 1, '#6f8a4a'); eyes(-1, 0); R(-4, 4, 8, 1, '#3a342c'); R(7, 3, 2, 2, '#8f8a78'); }      // a cave: the dark side of the rock, moss, and eyes in it
      else if (tr === 4) { R(-9, 4, 18, 1, '#77705f'); R(4, -3, 5, 3, 'rgba(0,0,0,.14)'); R(-7, -3, 12, 1, '#c2bba6'); R(-6 - wv, -5, 2, 1, '#a8803c'); R(4, -6, 1, 1, '#2a1c14'); R(-8, 1, 3, 1, '#6f8a4a'); R(1, 2, 4, 1, '#8a2a20'); }           // the ledge in the sun, the tail flicking, and what was eaten there
      else { R(-8, 1, 16, 1, 'rgba(60,10,10,.3)'); const hp = Math.floor(T * 0.6 + sd) % 3; R(-5 + hp * 4, -7, 2, 1, '#1c1310'); R(-3 + hp * 4, -7, 1, 1, '#1c1310'); R(-9, 3, 4, 1, '#e0d8c4'); R(4, 4, 5, 1, '#e0d8c4'); R(-1, -6, 1, 2, '#ffffff'); }      // crows going from rib to rib
    }
    else if (k === 'camp') {
      if (tr === 1) { fire(2, 3); puff(2, 0, 2); R(-7, 3, 5, 1, '#8a7a5a'); R(-6, -3, 1, 6, '#5a4326'); R(6, 2, 2, 2, '#7a5a34'); }
      else if (tr === 2) { fire(0, 3); puff(0, 0, 2); R(-1, 0, 2, 4, 'rgba(0,0,0,.14)'); R(7, 1, 2, 4, 'rgba(0,0,0,.14)'); R(-9, 3, 3, 2, '#7a5a34'); R(-9, 3, 3, 1, '#94703f'); }
      else if (tr === 3) { for (let q = -9; q <= 8; q += 4) R(q + 1, -2, 1, 6, '#4a3620'); R(-9, 3, 18, 1, '#4a3620'); flag(5, -8, '#7a2a20'); R(-3, -2, 6, 1, '#8a6a3a'); fire(6, 2); puff(-5, -6, 2); }                                             // the stakes of the stockade, the bar over its gate, their colours
      else if (tr === 4) { R(5, -5, 4, 10, 'rgba(0,0,0,.16)'); for (let q = -8; q < 9; q += 3) R(q, -1, 2, 1, '#77684a'); R(-9, 4, 18, 1, '#5e5038'); flag(1, -13, '#8a2a20'); R(-4, 1, 1, 2 + fl, '#f5c04a'); R(3, 1, 1, 2 + fl, '#f5c04a'); puff(5, -4, 2); }      // a stone hold: its courses, torches by the gate
      else { R(1, -12, 3, 12, 'rgba(0,0,0,.18)'); R(-4, -8, 8, 1, '#857a68'); R(-4, -4, 8, 1, '#4a4038'); R(-2, -9, 1, 2, fl ? '#f5c04a' : '#e2702a'); R(1, -9, 1, 2, '#f5c04a'); flag(-1, -18, '#1c1310'); R(-1, -18, 1, 5, '#3a2a1c'); for (let q = -10; q < 10; q += 3) R(q, -1, 2, 1, '#4a3c2e'); puff(-7, -4, 2); }      // the keep: lit windows, a black flag
    }
    else if (k === 'slavers') { fire(0, 3); puff(0, 0, 2); flag(8, -8, '#8a2a20'); R(-10, -3, 7, 1, '#3a2a1c'); R(-10, 3, 7, 1, '#3a2a1c'); for (const [hx, hy] of [[-9, 0], [-7, 1], [-5, 0]]) { R(hx, hy, 1, 1, '#d9a57c'); R(hx, hy + 1, 1, 2, '#8a7a66'); } R(-1, 0, 2, 4, 'rgba(0,0,0,.14)'); }      // the pen, with people in it
    else if (k === 'chief') { for (let i = -8; i <= 7; i += 3) R(i + 1, -3, 1, 7, '#4a3620'); R(-8, 3, 17, 1, '#4a3620'); flag(0, -11, '#8a2a20'); R(-4, -2, 8, 1, '#8a6a3a'); R(-10, -6, 1, 8, '#3a2a1c'); R(-11, -8, 3, 2, '#efe8d8'); R(9, -6, 1, 8, '#3a2a1c'); R(8, -8, 3, 2, '#efe8d8'); fire(6, 3); puff(-5, -6, 2); }      // skulls on poles either side of his gate
    else if (k === 'bounty') { flag(5, -8, '#c23b2e'); fire(-8, 4); R(-4, 0, 2, 4, 'rgba(0,0,0,.14)'); }
    else if (k === 'ruin') {
      R(3, -5, 4, 9, 'rgba(0,0,0,.12)'); R(-9, 3, 4, 1, '#b5af9b'); R(6, 4, 4, 1, '#a39c88'); R(-8, 1, 2, 2, '#5f8f3a'); R(-7, 0, 1, 1, '#7aa84a');
      if (tr >= 3) { R(-6, -3, 1, 6, '#b5af9b'); R(4, -3, 1, 6, '#8f8876'); R(-5, 1, 2, 1, '#6f8a4a'); R(-3, -4, 6, 1, '#8f8876'); }
      if (tr >= 4) { R(-9, 4, 18, 1, '#b5af9b'); R(-8, 5, 16, 1, '#8f8876'); R(-1, -1, 1, 1, '#e8b545'); }
      const bat = (T * 0.5 + sd) % 6; if (bat < 1) R(-2 + Math.round(bat * 14), -9 - Math.round(Math.sin(bat * 9) * 2), 2, 1, '#1c1310');      // something flying out of it now and then
    }
    else if (k === 'battlefield') { flag(0, -10, '#7e241c'); R(-8, 3, 4, 1, '#efe8d8'); R(4, 4, 3, 1, '#c1c7cc'); R(-3, 3, 1, 2, '#5a4326'); const hp = Math.floor(T * 0.5 + sd) % 2; R(6 + hp * 2, -5, 2, 1, '#1c1310'); R(-6, -8, 2, 1, '#1c1310'); }
    else if (k === 'barrow') { for (let i = 1; i < 6; i += 2) R(-7 + i, -1 - i, 6, 1, '#86a85a'); R(4, -4, 4, 4, 'rgba(0,0,0,.14)'); R(-3, -1, 1, 4, '#c9c3ae'); R(2, -1, 1, 4, '#8f8876'); R(-5, -4, 1, 1, '#f4f4f0'); R(5, -2, 1, 1, '#f2e6a0'); R(-1, -8, 2, 3, '#a8a290'); R(-1, -8, 1, 3, '#cfc9b6'); }
    else if (k === 'shrine' || k === 'vow') { R(-7, 3, 14, 1, '#b5af9b'); R(-6, -7, 12, 1, '#f0ead8'); R(3, -5, 3, 6, 'rgba(0,0,0,.10)'); R(-1, -1 - fl, 2, 1 + fl, '#f5c04a'); R(-8, 1, 2, 3, '#b8703c'); R(-8, 1, 2, 1, '#d08a54'); R(7, 2, 2, 2, '#b8703c'); R(-4, 4, 2, 1, '#c23b2e'); R(2, 4, 2, 1, '#f2e6a0'); }      // the lamp alight, jars and flowers left on the step
    else if (k === 'hamlet') { puff(-5, -6, 2); R(-2, -1, 2, 4, 'rgba(0,0,0,.12)'); R(8, 0, 2, 4, 'rgba(0,0,0,.12)'); const pk = Math.sin(T * 6 + sd) > 0 ? 1 : 0; R(-1, 5 + pk, 1, 1, '#f1ead8'); R(2, 5 + (1 - pk), 1, 1, '#8a5a32'); R(-1, 4, 1, 1, '#c23b2e'); R(-9, 4, 4, 1, '#6f9a48'); R(6, 5, 4, 1, '#6f9a48'); }      // a hearth lit, hens in the lane
    else if (k === 'merchant') { R(-4, -5, 1, 3, '#f1ead8'); R(-2, -5, 1, 3, '#f1ead8'); R(0, -5, 1, 3, '#f1ead8'); R(-7 + wv, -5, 1, 1, '#6f5a48'); flag(6, -9, '#c9a21e'); R(6, -9, 1, 10, '#5a4326'); R(-1, 3, 3, 2, '#b8703c'); R(3, 3, 2, 2, '#7a5a34'); }      // the awning in stripes, the mule's ear, his pennant
    else if (k === 'quarry') { const hit = Math.sin(T * 4.5 + sd) > 0.3; R(-4, hit ? 0 : -2, 1, 2, '#8f8a84'); if (hit) R(-2, -1, 1, 1, '#ffffff'); for (let i = 0; i < 2; i++) { const q = (T * 0.2 + i / 2) % 1; ctx.globalAlpha = 0.3 * (1 - q); R(-3 + i * 5, 0 - Math.round(q * 8), 3, 2, '#f4f0e4'); } ctx.globalAlpha = 1; }
    else if (k === 'cache') { R(-5, 3, 10, 2, '#7a5a34'); R(-5, 3, 10, 1, '#94703f'); R(-2, 1, 4, 2, '#8a8478'); R(-2, 1, 4, 1, '#a39c88'); R(6, -4, 1, 8, '#6b4f2c'); R(5, 3, 3, 2, '#8f8a84'); }      // turned earth, a stone set on it, and a spade left standing
    else if (k === 'herb') { R(-5 + wv, -6, 2, 1, '#9fd88a'); R(2 - wv, -7, 2, 1, '#9fd88a'); R(-6, 3, 3, 2, '#5f9a4a'); R(4, 2, 3, 2, '#5f9a4a'); R(-5, 2, 1, 1, '#e8a0c0'); R(5, 1, 1, 1, '#f2e6a0'); R(-1, -9, 2, 1, '#e8f4c8'); }
    else if (k === 'hermit') { R(3, -3, 3, 7, 'rgba(0,0,0,.16)'); R(-5, -5, 9, 1, '#b5ae9a'); R(-1, 1, 1, 1 + fl, '#f5c04a'); R(-7, -4, 2, 1, '#6f8a4a'); R(7, -7, 2, 1, '#1c1310'); R(-9, 4, 3, 1, '#6f9a48'); }      // a light in the cell, a bird on his staff
    else if (k === 'deserter') { puff(1, -6, 2); flag(7, -4, '#8a2a20'); R(2, -1, 2, 4, 'rgba(0,0,0,.12)'); R(-8, 2, 3, 1, '#c9a763'); }
    else if (k === 'master') { puff(1, -6, 2); for (let q = 0; q < 4; q++) { const an = T * (2 + q % 3) + q * 1.7 + sd; R(9 + Math.round(Math.cos(an) * 4), -1 + Math.round(Math.sin(an * 1.3) * 3), 1, 1, q % 2 ? '#2a1c14' : '#e8c040'); } R(2, -1, 2, 4, 'rgba(0,0,0,.12)'); }
    else if (k === 'healer') { R(2, -1, 2, 4, 'rgba(0,0,0,.12)'); R(-3, -8, 1, 3, '#7fbf6a'); R(-1, -8, 1, 2, '#c9e8a0'); R(1, -8, 1, 3, '#5f9a4a'); R(-10, 2, 9, 1, '#6b4f2c'); }      // bundles hung under the eaves to dry
    else if (!k.startsWith('errand')) { puff(1, -6, 2); R(2, -1, 2, 4, 'rgba(0,0,0,.12)'); }
  }
  if (done) {                                  // dealt with: nobody there, the fire cold, and the grass already coming up through it
    const G2 = (ox, oy, w, hh, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(s.x + (flip ? -ox - w : ox)), Math.round(s.y + oy), w, hh); };
    for (let q = 0; q < 7; q++) { const gx = -12 + Math.floor(v(150 + q) * 24), gy = -2 + Math.floor(v(157 + q) * 8); G2(gx, gy, 1, 2, '#6b8f3e'); G2(gx + 1, gy, 1, 1, '#8aa85a'); }
    G2(-9, 4, 2, 1, '#f2e6a0'); G2(7, 3, 1, 1, '#e8a0c0'); G2(1, 3, 3, 1, '#3a342c'); G2(2, 2, 1, 1, '#6a645c');
    const cw = Math.floor(T * 0.4 + sd) % 3; G2(-5 + cw * 4, -8, 2, 1, '#1c1310'); G2(-3 + cw * 4, -8, 1, 1, '#1c1310');
  }
}

function drawProvince(cv, T) {
  if (prov.big) return drawOverview(cv, T);
  const F = G.field, ctx = cv.getContext('2d'), S = PROV.S = cv.width / PROV.VW;      // a whole number, chosen for the screen (see fitScenes in main.js)
  const camX = prov.camX = clamp(Math.round(F.x - PROV.VW / 2), 0, WILD.W - PROV.VW), camY = prov.camY = clamp(Math.round(F.y - PROV.VH / 2), 0, WILD.H - PROV.VH);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(provLand(), camX, camY, PROV.VW, PROV.VH, 0, 0, PROV.VW * S, PROV.VH * S);
  ctx.setTransform(S, 0, 0, S, -camX * S, -camY * S);
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const inView = (x, y, m) => x > camX - m && x < camX + PROV.VW + m && y > camY - m && y < camY + PROV.VH + m;
  const M = wildMap();

  // boats off the Salt Shore, riding the swell: each its own hull and sail, some under oars, one or two with a net out
  for (const [bx0, by0, bk] of (prov.boats || [])) {
    if (!inView(bx0, by0, 60) || !wildSeen(bx0, by0)) continue;
    if (bk) {
      const sd = wildHash(bx0, by0, 660), s2 = wildHash(by0, bx0, 661), bob = Math.sin(T * 1.4 + bx0) > 0 ? 1 : 0;
      if (bk === 'galley' || bk === 'warship') {            // a ship under oar and sail, beating up and down the coast
        const war = bk === 'warship', ph = T * 0.05 + sd * 9, bx = bx0 + Math.round(Math.sin(ph * 0.7) * 8), by = by0 + Math.round(Math.sin(ph) * 30) + bob, d = Math.cos(ph) > 0 ? 1 : -1, len = war ? 26 : 20 + Math.floor(s2 * 5), half = len >> 1;
        const hull = war ? '#3a2a22' : ['#6b4f2c', '#5a3a2a', '#7a5a34'][Math.floor(sd * 3)], sail = war ? '#a8261c' : ['#e8dcc0', '#d8b860', '#b85a48', '#e8dcc0'][Math.floor(s2 * 4)], F = (px, py, w, hh, c) => R(d > 0 ? px : 2 * bx - px - w, py, w, hh, c);
        F(bx - half, by + 2, len + 2, 1, 'rgba(20,40,60,.3)'); F(bx - half, by - 3, len, 4, hull); F(bx - half + 1, by + 1, len - 2, 1, shade(hull, 0.7)); F(bx - half, by - 3, len, 1, shade(hull, 1.3));
        F(bx - half - 1, by - 6, 2, 4, hull); F(bx - half - 2, by - 7, 2, 1, hull); F(bx + half, by - 4, 2, 3, hull);                                   // the stern curling up, and the stem
        if (war) { F(bx + half + 2, by, 3, 1, '#c1c7cc'); for (let q = 0; q < 6; q++) F(bx - half + 3 + q * 3, by - 2, 2, 2, q % 2 ? '#c9a21e' : '#a8261c'); }      // a ram at the bow, and shields along the rail
        const pull = Math.sin(T * 2.4 + sd * 6) > 0 ? 1 : 0; for (let q = 0; q < (war ? 8 : 6); q++) F(bx - half + 3 + q * 3 - pull, by + 1, 1, 2 + pull, '#c9b890');      // the oars, all together
        F(bx, by - 15, 1, 12, '#3a2a1c'); F(bx - 5, by - 14 + bob, 11, 8, sail); F(bx - 5, by - 14 + bob, 11, 1, shade(sail, 1.2)); F(bx - 5, by - 7 + bob, 11, 1, shade(sail, 0.8));
        if (war) { F(bx - 1, by - 12 + bob, 3, 4, '#c9a21e'); F(bx, by - 11 + bob, 1, 2, '#a8261c'); } else if (s2 > 0.4) { F(bx - 2, by - 14 + bob, 2, 8, shade(sail, 0.8)); F(bx + 2, by - 14 + bob, 2, 8, shade(sail, 0.8)); }
        F(bx - half + 2, by - 6, 2, 3, '#d9a57c'); F(bx - half + 2, by - 5, 2, 2, war ? '#a8261c' : '#4a6a8a');                                           // the steersman
        for (let q = 0; q < 3; q++) { const wq = (T * 0.8 + q * 0.33) % 1; ctx.globalAlpha = 0.5 * (1 - wq); F(bx - half - 3 - wq * 10, by + 1 + q % 2, 3, 1, '#e6f3fa'); } ctx.globalAlpha = 1;      // her wake
      } else {
        const bx = bx0 + Math.round(Math.sin(T * 0.06 + sd * 9) * 6), by = by0 + bob, d = Math.cos(T * 0.06 + sd * 9) > 0 ? 1 : -1, tun = ['#8a4a3a', '#4a6a8a', '#7a7a3a', '#6a5a3a'][Math.floor(s2 * 4)];
        if (bk === 'punt') { R(bx - 4, by + 1, 9, 1, 'rgba(20,40,60,.3)'); R(bx - 4, by - 1, 8, 2, '#6b4f2c'); R(bx - 4, by - 1, 8, 1, '#8a6a3a'); R(bx + d * 2, by - 7, 2, 3, '#d9a57c'); R(bx + d * 2, by - 4, 2, 3, tun); const dip = Math.sin(T * 1.1 + sd * 5) > 0 ? 1 : 0; R(bx + d * 4 + (d > 0 ? 0 : -1), by - 9 + dip, 1, 11, '#8a7a5c'); if (s2 > 0.5) R(bx - d * 3, by - 3, 2, 2, '#c9a763'); }      // a punt, poled along
        else if (bk === 'raft') { R(bx - 5, by + 1, 11, 1, 'rgba(20,40,60,.3)'); for (let q = 0; q < 5; q++) R(bx - 5 + q * 2, by - 1, 2, 2, q % 2 ? '#7a5a34' : '#8a6a3a'); R(bx - 5, by - 1, 10, 1, '#a8834a'); R(bx - 1, by - 7, 2, 3, '#d9a57c'); R(bx - 1, by - 4, 2, 3, tun); R(bx + 2, by - 4, 3, 3, s2 > 0.5 ? '#8a5a34' : '#c9b890'); R(bx - 4, by - 8, 1, 8, '#6b4f2c'); if (sd > 0.5) R(bx - 3, by - 8, 3, 2, ['#c23b2e', '#e8dcc0'][Math.floor(s2 * 2)]); }      // a raft of logs, a load on it
        else { R(bx - 3, by + 1, 6, 1, 'rgba(20,40,60,.3)'); R(bx - 2, by - 1, 5, 2, '#3a2e24'); R(bx - 3, by - 1, 1, 1, '#3a2e24'); R(bx + 3, by - 1, 1, 1, '#3a2e24'); R(bx - 2, by - 1, 5, 1, '#5a4a3a'); R(bx, by - 6, 2, 3, '#d9a57c'); R(bx, by - 3, 2, 2, tun); const side = Math.sin(T * 1.6 + sd * 5) > 0 ? 1 : -1; R(bx + side * 3, by - 3, 1, 5, '#8a7a5c'); R(bx + side * 3, by + 1, 2, 1, '#8a7a5c'); }      // a coracle of hide, paddled from one side then the other
      }
      continue;
    }
    const sd = wildHash(bx0, by0, 660), s2 = wildHash(by0, bx0, 661), bx = bx0 + Math.round(Math.sin(T * 0.07 + sd * 9) * 5), by = by0 + Math.round(Math.sin(T * 1.6 + bx0) * 1), tilt = Math.sin(T * 1.6 + bx0) > 0 ? 1 : 0;
    const hull = ['#6b4f2c', '#5a3a2a', '#4a5a6a', '#7a6a4a'][Math.floor(sd * 4)], len = 8 + Math.floor(s2 * 5), half = len >> 1;
    R(bx - half, by + 1, len + 1, 1, 'rgba(20,40,60,.3)'); R(bx - half, by - 2, len, 3, hull); R(bx - half + 1, by + 1, len - 2, 1, shade(hull, 0.7)); R(bx - half, by - 2, len, 1, shade(hull, 1.25)); R(bx + half, by - 3, 1, 2, hull);
    R(bx - 2, by - 4, 2, 2, '#d9a57c'); R(bx - 2, by - 3, 2, 2, ['#8a4a3a', '#4a6a8a', '#7a7a3a'][Math.floor(s2 * 3)]);      // the man in it
    if (sd > 0.3) { const sail = ['#e8dcc0', '#b85a48', '#d8b860', '#e8dcc0'][Math.floor(s2 * 4)]; R(bx, by - 10, 1, 8, '#3a2a1c'); R(bx + 1, by - 9 + tilt, 5, 6, sail); R(bx + 1, by - 9 + tilt, 5, 1, shade(sail, 1.2)); R(bx + 5, by - 7 + tilt, 1, 3, shade(sail, 0.8)); if (s2 > 0.6) R(bx + 2, by - 6 + tilt, 3, 1, shade(sail, 0.75)); }
    else { const pull = Math.sin(T * 2.2 + sd * 6) > 0 ? 1 : 0; R(bx - 4 - pull, by, 3, 1, '#c9b890'); R(bx + 2 + pull, by, 3, 1, '#c9b890'); }      // under oars
    if (s2 < 0.3) for (let q = 0; q < 4; q++) R(bx - half - 2 - q * 2, by + 1 + (q % 2), 1, 1, '#d8d2c0');                                              // the floats of a net astern
  }
  drawHerds(ctx, T, R, inView);
  drawTraffic(ctx, T, R, inView);
  drawAmbient(ctx, T, R, camX, camY, false);
  // the wind going over the meadows: a lighter streak that travels
  for (let i = 0; i < 14; i++) {
    const wx2 = camX + ((i * 71 + T * 26) % (PROV.VW + 40)) - 20, wy2 = camY + (i * 47 + Math.floor(T * 0.5 + i) * 13) % PROV.VH, kk = wildTile(wx2, wy2);
    if (kk === T_MEADOW || kk === T_GRASS) { R(wx2, wy2, 7, 1, 'rgba(255,255,220,.16)'); R(wx2 + 2, wy2 + 2, 5, 1, 'rgba(255,255,220,.10)'); }
  }
  // water moves a little
  for (let i = 0; i < 40; i++) { const x = camX + ((i * 97 + Math.floor(T * 8)) % PROV.VW), y = camY + (i * 53) % PROV.VH; if (wildTile(x, y) === T_WATER) R(x, y, 3, 1, 'rgba(214,236,248,.55)'); }

  // the town, with its gate facing you
  const tx = WILD.TOWN.x, ty = WILD.TOWN.y;
  if (inView(tx, ty, 70)) drawTown(ctx, T, R, tx, ty, tier(), provDark());
  if (inView(STABLES.x, STABLES.y, 40)) drawStables(ctx, T, R, provDark());
  // places: the ones you have come upon, and anything a clue has marked
  const sites = wildSites();
  for (const s of sites) { if (!inView(s.x, s.y, 30) || !siteShown(s) || !wildSeen(s.x, s.y)) continue; provIcon(ctx, s, T, siteDone(s)); }
  // roaming bands
  for (const p of F.packs) {
    if (!inView(p.x, p.y, 20) || !wildSeen(p.x, p.y)) continue;
    const pv = n => wildHash(p.id, n, 640), spots = [[0, 0], [-7, 3], [6, 4], [-2, 7], [10, -2]];
    if (p.kind === 'wolves') {                 // two to five of them, grey, black or brown, one bigger than the rest
      const n = 2 + Math.floor(pv(1) * 4), coats = [['#77777a', '#8a8a8e', '#55555a'], ['#3a3a40', '#4a4a52', '#26262a'], ['#7a6a52', '#8f7e62', '#57493a'], ['#9a9a9e', '#b0b0b4', '#6a6a70']];
      for (let q = 0; q < n; q++) { const [ox, oy] = spots[q], c = coats[Math.floor(pv(10 + q) * (q ? 4 : 3))], big = q === 0 ? 1 : 0, b = Math.sin((p.walk || 0) + ox) > 0 ? 1 : 0;
        R(p.x + ox - 4, p.y + oy - 1, 8 + big, 2, 'rgba(0,0,0,.25)'); R(p.x + ox - 4, p.y + oy - 5 - big, 7 + big, 3 + big, c[0]); R(p.x + ox + (p.face === 'left' ? -6 : 3 + big), p.y + oy - 6 - big, 3, 3, c[1]); R(p.x + ox + (p.face === 'left' ? 3 + big : -5), p.y + oy - 5 - big, 2, 1, c[2]);
        R(p.x + ox - 3, p.y + oy - 2, 1, 2 - b, c[2]); R(p.x + ox + 2, p.y + oy - 2, 1, 1 + b, c[2]); }
    } else {                                   // two to four men, each in what he stole, and one carrying their rag of a banner
      const n = 2 + Math.floor(pv(2) * 3), tun = ['#6a3a2a', '#4a4a3a', '#5a3a3a', '#3a4a5a', '#6a5a2a', '#4a3a4a'], hair = ['#2a1c14', '#6a4a2a', '#8a8a8a', '#1c1c1c'];
      for (let q = 0; q < n; q++) { const [ox, oy] = spots[q]; vilPerson(ctx, p.x + ox, p.y + oy, { face: p.face || 'down', walk: (p.walk || 0) + ox, moving: true, tunic: tun[Math.floor(pv(20 + q) * 6)], hair: hair[Math.floor(pv(30 + q) * 4)] }); }
      if (pv(3) > 0.4) { const [ox, oy] = spots[n - 1]; R(p.x + ox + 4, p.y + oy - 20, 1, 14, '#3a2a1c'); R(p.x + ox + 5, p.y + oy - 20, 5, 3, ['#5a5a4a', '#7a2a20', '#2a3a5a'][Math.floor(pv(4) * 3)]); R(p.x + ox + 5, p.y + oy - 17, 2, 1, '#3a2a1c'); }
    }
    R(p.x - 1, p.y - 22, 3, 3, '#c23b2e'); R(p.x, p.y - 18, 1, 1, '#c23b2e');
    provUnder(ctx, p.x, p.y + 7, 14);
  }
  // the column: the men strung out behind, the mule cart last, you in front
  const men = G.roster.filter(g => !g.away).slice(0, 4), tr = prov.trail;
  const cart = tr[Math.min(tr.length - 1, 4 + men.length * 2)] || { x: F.x - 14, y: F.y };
  const folk = [];
  if (tr.length > 3) folk.push({ x: cart.x, y: cart.y, wide: 8, draw: () => { R(cart.x - 6, cart.y + 1, 13, 2, 'rgba(0,0,0,.25)'); R(cart.x - 5, cart.y - 6, 10, 5, '#8a6a3a'); R(cart.x - 5, cart.y - 7, 10, 1, '#a8834a'); R(cart.x - 4, cart.y - 10, 8, 3, '#d9c9a0'); R(cart.x - 5, cart.y - 1, 3, 3, '#3a2a1c'); R(cart.x + 2, cart.y - 1, 3, 3, '#3a2a1c'); } });
  men.forEach((g, i) => { const p = tr[Math.min(tr.length - 1, 2 + i * 2)]; if (p) folk.push({ x: p.x + (i % 2 ? 3 : -3), y: p.y, draw: () => vilPerson(ctx, p.x + (i % 2 ? 3 : -3), p.y, { face: prov.face, walk: prov.walk + i * 1.7, moving: prov.moving, tunic: g.injury > 0 ? '#8a8a8a' : '#c23b2e', hair: g.look.hair, skin: g.look.skin }) }); });
  folk.push({ x: F.x, y: F.y + 0.1, draw: () => vilPerson(ctx, F.x, F.y, { face: prov.face, walk: prov.walk, moving: prov.moving, tunic: '#f1ead8', stripe: '#7a2a8a', hair: '#4a3320', laurel: true }) });
  // whatever stands tall near them is painted again in its turn, so that a man north of an arch or under the
  // aqueduct is behind it, and a man south of it is in front
  if (prov.overs) { const who = folk.slice(); for (const o of prov.overs) if (who.some(m => m.y < o.base && m.y > o.y0 - 2 && m.x + (m.wide || 5) > o.x0 && m.x - (m.wide || 5) < o.x1)) folk.push({ y: o.base, draw: () => prov.paintOver(ctx, o.d) }); }
  folk.sort((a, b) => a.y - b.y).forEach(f => f.draw());
  if (prov.path && prov.path.length) {         // the way he means to go, dotted, and a mark where it ends
    const e = prov.path[prov.path.length - 1];
    for (let i = 1; i < prov.path.length - 1; i += 2) R(prov.path[i].x - 1, prov.path[i].y - 1, 2, 2, 'rgba(245,213,132,.75)');
    ctx.globalAlpha = 0.5 + 0.4 * Math.sin(T * 6); R(e.x - 3, e.y - 1, 7, 2, '#f5d584'); R(e.x - 1, e.y - 3, 2, 7, '#f5d584'); ctx.globalAlpha = 1;
  }
  // smoke from the town's hearths, and from any camp you can see
  const smoke = (sx, sy, n) => { for (let i = 0; i < n; i++) { const q = (T * 0.28 + i / n) % 1; ctx.globalAlpha = 0.5 * (1 - q); R(sx + Math.sin(q * 5 + i) * 3 + q * 6, sy - q * 22, 3 + Math.round(q * 3), 2 + Math.round(q * 2), '#d8d4cc'); } ctx.globalAlpha = 1; };
  if (inView(tx, ty, 70)) { smoke(tx + 12, ty + 1, 4); smoke(tx - 18, ty + 2, 3); smoke(tx - 6, ty - 22, 3); }
  // the water running in the aqueduct, down from the hills to the town: light travelling along the channel
  if (prov.aqLine) { const L2 = prov.aqLine, lens = []; let tot = 0; for (let q = 0; q < L2.length - 1; q++) { lens.push(Math.hypot(L2[q + 1][0] - L2[q][0], L2[q + 1][1] - L2[q][1])); tot += lens[q]; }
    const n = Math.max(1, Math.floor(tot / 13));
    for (let q = 0; q < n; q++) {
      let d = tot - ((T * 22 + q * 13 + wildHash(q, 7, 1500) * 6) % tot), sg = 0; while (sg < lens.length - 1 && d > lens[sg]) { d -= lens[sg]; sg++; }
      const f = d / lens[sg], gx = Math.round(L2[sg][0] + (L2[sg + 1][0] - L2[sg][0]) * f), gy = Math.round(L2[sg][1] + (L2[sg + 1][1] - L2[sg][1]) * f);
      if (!inView(gx, gy, 6) || !wildSeen(gx, gy)) continue;
      const steep = Math.abs(L2[sg + 1][1] - L2[sg][1]) > Math.abs(L2[sg + 1][0] - L2[sg][0]) * 1.5;
      R(gx - 1, gy - 10, steep ? 1 : 2, steep ? 2 : 1, q % 3 ? '#b4d6ea' : '#e6f3fa'); if (q % 4 === 0) R(steep ? gx : gx + 2, steep ? gy - 8 : gy - 10, 1, 1, '#9ccbe8');
    }
  }
  drawMarks(ctx, T, R, inView, provDark(), smoke);
  for (const sm of (prov.smokes || [])) if (inView(sm.x, sm.y, 30) && wildSeen(sm.x, sm.y)) smoke(sm.x, sm.y, 3);      // every hearth out in the country
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

  // the same hour and the same weather as over the town: the colour of the light, a brand in the dark, rain
  const sky = provSky(), wx = yardWeather(sceneClock());
  drawSky(ctx, T, camX, camY, sky, wx);
  if (sky.tint !== '#ffffff') { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = sky.tint; ctx.fillRect(camX, camY, PROV.VW, PROV.VH); ctx.globalCompositeOperation = 'source-over'; }
  if (wx.over > 0) { ctx.fillStyle = `rgba(40,45,60,${(0.12 * wx.over).toFixed(3)})`; ctx.fillRect(camX, camY, PROV.VW, PROV.VH); }
  if (provDark() > 0.3) drawAmbient(ctx, T, (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }, camX, camY, true);      // what shows only in the dark
  if (sky.night > 0.25) {
    const la = Math.min(1, (sky.night - 0.25) * 2), fl = Math.sin(T * 11) > 0 ? 1 : 0;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) { const r = 26 - i * 5; ctx.fillStyle = `rgba(255,170,80,${(0.07 * la).toFixed(3)})`; ctx.fillRect(Math.round(F.x - r), Math.round(F.y - 8 - r * 0.7), r * 2, Math.round(r * 1.4)); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = la; R(F.x + (prov.face === 'left' ? -5 : 5), F.y - 13 - fl, 2, 3 + fl, '#e2702a'); R(F.x + (prov.face === 'left' ? -5 : 5), F.y - 10, 1, 4, '#3a2a1c'); ctx.globalAlpha = 1;
  }
  ctx.save(); ctx.translate(camX, camY); sceneRain(ctx, PROV.VW, PROV.VH, T, wx.rain, 110); sceneVignette(ctx, PROV.VW, PROV.VH, 0.26); ctx.restore();

  // names, and marks that show even through the fog
  ctx.font = 'bold 6px Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  // a name on the map, with a red pip for each skull of danger
  const tag = (x, y, text, col, bg, pips) => { const tw = Math.ceil(ctx.measureText(text).width), w = tw + 6 + (pips ? pips * 5 + 2 : 0); R(x - w / 2, y - 7, w, 9, bg || 'rgba(24,16,10,.82)'); ctx.textAlign = 'left'; ctx.fillStyle = col || '#f2e6cc'; ctx.fillText(text, x - w / 2 + 3, y); ctx.textAlign = 'center'; for (let i = 0; i < (pips || 0); i++) { R(x - w / 2 + tw + 6 + i * 5, y - 5, 4, 4, '#e2695c'); R(x - w / 2 + tw + 7 + i * 5, y - 2, 2, 2, '#e2695c'); R(x - w / 2 + tw + 7 + i * 5, y - 4, 1, 1, '#2a1a0c'); R(x - w / 2 + tw + 9 + i * 5, y - 4, 1, 1, '#2a1a0c'); } };
  if (inView(tx, ty, 70)) tag(tx - 12, ty - 38, 'HOME', '#2a1a0c', '#f5d584');
  if (inView(STABLES.x, STABLES.y, 40)) tag(STABLES.x, STABLES.y - 20, 'STABLES', '#2a1a0c', (G.fac.stables | 0) < 3 && G.denarii >= FAC_COST[G.fac.stables | 0] ? '#f5d584' : '#d8c8a8');
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
  provDial(ctx, 4, 18);
  ctx.font = 'bold 7px Consolas, monospace'; ctx.textAlign = 'left';
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
  const mw = marchWord(), pk = !hv && !mw ? provPeek() : (hv ? provPeek() : null);
  if (mw) { const w = Math.ceil(ctx.measureText(mw.text).width) + 12; ctx.fillStyle = 'rgba(24,16,10,.88)'; ctx.fillRect(PROV.VW / 2 - w / 2, PROV.VH - 32, w, 12); ctx.fillStyle = mw.miss ? '#f08a7c' : '#f5d584'; ctx.fillText(mw.text, PROV.VW / 2, PROV.VH - 23); }
  if (pk && prov.mouse) {                    // by the mouse: what the march there would take
    const t = daysWord(pk.days).toUpperCase(), w = Math.ceil(ctx.measureText(t).width) + 8, mx = clamp(prov.mouse.u * PROV.VW + 8, 2, PROV.VW - w - 2), my = clamp(prov.mouse.v * PROV.VH + (hv ? 16 : 10), 12, PROV.VH - 36);
    ctx.fillStyle = 'rgba(24,16,10,.88)'; ctx.fillRect(mx, my, w, 10); ctx.textAlign = 'left'; ctx.fillStyle = pk.days < 0 ? '#f08a7c' : pk.days === 0 ? '#9fce86' : '#f5d584'; ctx.fillText(t, mx + 4, my + 7.5); ctx.textAlign = 'center';
  }
  const tip = prov.hint > performance.now() ? 'YOU CANNOT WALK THERE' : town(F) < 60 ? 'W A S D OR CLICK TO WALK  -  M FOR THE WHOLE MAP  -  R TO GO HOME' : '';
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
    else { ctx.save(); ctx.translate(s.x, s.y); ctx.scale(4, 4); provIcon(ctx, { x: 0, y: 0, kind: s.kind, tier: s.tier, id: s.id }, T, siteDone(s)); ctx.restore(); }
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
  const U = cv.width / 960;
  ctx.setTransform(U, 0, 0, U, 0, 0);
  ctx.save(); ctx.translate(960 - 196, 8); ctx.scale(2, 2); provDial(ctx, 0, 0); ctx.restore();
  // the key to the map
  const key = [['#7a2a8a', 'YOU'], ['#f5d584', 'MARKED FOR YOU'], ['#c23b2e', 'A ROAMING BAND'], ['#8a8478', 'DEALT WITH'], ['rgba(120,40,30,.9)', 'SKULLS: HOW HARD THE COUNTRY IS']];
  ctx.font = 'bold 11px Consolas, monospace'; ctx.textAlign = 'left';
  const kw = Math.max(...key.map(q => ctx.measureText(q[1]).width)) + 34;
  ctx.fillStyle = 'rgba(24,16,10,.85)'; ctx.fillRect(8, 8, kw, key.length * 16 + 10);
  key.forEach(([c, t], n) => { ctx.fillStyle = c; ctx.fillRect(16, 15 + n * 16, 10, 10); ctx.fillStyle = '#f2e6cc'; ctx.fillText(t, 32, 24 + n * 16); });
  if (hv) { const [lines, sk] = hoverLines(hv); provCard(ctx, hv.x * k / U, hv.y * k / U - 14, lines, sk, 2, 960, 720); }
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px Consolas, monospace';
  const mw2 = marchWord(), pk2 = provPeek();
  const msg = prov.hint > performance.now() ? 'YOU CANNOT WALK THERE' : mw2 ? mw2.text : pk2 && prov.mouse ? `${daysWord(pk2.days).toUpperCase()}  -  CLICK TO SET OUT  -  M TO CLOSE` : 'THE PROVINCE  -  CLICK ANYWHERE TO SET OUT FOR IT  -  M TO CLOSE', w = ctx.measureText(msg).width + 24;
  ctx.fillStyle = 'rgba(24,16,10,.85)'; ctx.fillRect(960 / 2 - w / 2, 720 - 34, w, 24);
  ctx.fillStyle = '#f5d584'; ctx.fillText(msg, 960 / 2, 720 - 17);
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
  const show = F.note && F.note.day === G.day ? 4 : 5;
  return all.slice(0, show).map(({ st, mark }) => st.errand ? (q => row(st.id, `Quest: ${st.name}`, `<b class="gold num">${q.pay}</b> &middot; ${Math.max(0, q.until - G.day)}d left &middot; ${wayTo(st.x, st.y)}`, siteDanger(st), true))(errandById(st.errand)) : st.kind === 'bounty' ? row(st.id, `Bounty: ${st.name}`, `<b class="gold num">${G.bounty.pay}</b> &middot; ${G.bounty.until - G.day}d left &middot; ${wayTo(st.x, st.y)}`, siteDanger(st), true) : row(st.id, st.name, `${mark ? 'marked &middot; ' : ''}${wayTo(st.x, st.y)}`, siteDanger(st), mark)).join('')
    + row('home', 'Home', wayTo(WILD.TOWN.x, WILD.TOWN.y), 0, false)
    + (all.length > show ? `<div class="listnote">and ${all.length - show} more on the whole map</div>` : '');
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
  return `<div class="lrow grow-row ${g.injury > 0 || g.fatigue > 75 ? 'hurt' : g.perkPending > 0 ? 'perk' : ''}" data-act="campsel" data-v="${g.id}"${tip(`${g.name}, ${CLASSES[g.cls].name}, power ${rating(g)}.${g.injury > 0 ? ` Wounded for ${g.injury} more day${g.injury === 1 ? '' : 's'}.` : g.fatigue > 75 ? ' Exhausted.' : g.perkPending > 0 ? ' Has a perk to choose.' : ''} Click for his dossier.`)}>
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
      <div class="row camprow" style="margin:8px 0 4px"><button class="primary" data-act="makecamp"${tip('makecamp')} style="flex:1.3">Make camp<span class="key">E</span></button>
        <button data-act="scout" style="flex:1"${tip(`Spend the day on the high ground: the fog lifts for a long way round${staffLvl('scout') ? ', further for your scout' : '; a scout would see further'}. The men get some rest.`)}>Scout</button></div>
      <div class="row camprow" style="margin:0 0 8px"><button data-act="wildgo" data-v="home" style="flex:1"${tip('Sets the column on the road back to the town gate, by the shortest way it can walk. It goes in when it gets there. You can still steer away, or click elsewhere, to change your mind.')}>Go home<span class="key">R</span></button><button data-act="bigmap"${tip('bigmap')}>${prov.big ? 'Close map' : 'Whole map'}<span class="key">M</span></button><button data-act="help" style="padding-left:9px;padding-right:9px"${tip('The keys, and the rules of the trade in a page. Key: H')}>?</button></div>
      ${F.note && F.note.day === G.day ? `<div class="dealmsg ${F.note.ok ? '' : 'bad'}" style="margin:0 0 6px">${F.note.text}</div>` : ''}
      ${lead ? `<div class="lead"${tip('eagle')}><b class="gold">The eagle of the Seventeenth.</b> ${lead}</div>` : ''}
      ${journeys ? `<div class="lead"><b class="gold">Promised.</b>${journeys}</div>` : ''}
      <div class="pane" data-pane="camp"><h2>Places known <small>click to walk there</small></h2><div class="panel list" id="placeList">${placesHtml()}</div>
      <h2>The school <small>${fieldParty().length} fit of ${men.length}</small></h2>
      <div class="panel list ${men.length > 5 ? 'twoup dense' : ''}">${men.map(campRow).join('') || '<div class="listnote">Nobody is with you.</div>'}</div>
      <div class="listnote"${tip('fieldrules')}>${Math.round(wildExplored() * 100)}% walked &middot; ${M.cleared} places dealt with &middot; <span class="${safeRegions().length ? 'gold' : ''}"${tip(`A region is safe when every lair and outlaw camp in it has been dealt with. Each safe region pays ${SAFE_TOLL} denarii a day, at home or away, and the family keeps it.\n${Object.entries(regionTally()).map(([r, t]) => `${r}: ${t.done} of ${t.n}${t.done >= t.n ? ' - safe' : ''}`).join('\n')}`)}>${safeRegions().length} of ${Object.keys(regionTally()).length} regions safe${safeRegions().length ? ` (+${SAFE_TOLL * safeRegions().length} a day)` : ''}</span>${M.bounties ? ` &middot; ${M.bounties} bount${M.bounties === 1 ? 'y' : 'ies'} taken` : ''}</div></div>`;
  $('#camp').innerHTML = head + body;
  if (!prov.raf) { prov.last = 0; prov.prev = 0; prov.raf = requestAnimationFrame(provFrame); }
  const m = document.getElementById('wildMini'); if (m) drawMini(m);
  paintPortraits();
}
