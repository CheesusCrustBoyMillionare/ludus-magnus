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
  // every crossing is one of four kinds, and all the tiles of one crossing agree on which
  const span = {};
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    if (at(tx, ty) !== T_BRIDGE || span[ty * TW + tx]) continue;
    const todo = [[tx, ty]], got = []; let x0 = tx, x1 = tx, y0 = ty, y1 = ty;
    while (todo.length) { const [cx, cy] = todo.pop(), key = cy * TW + cx; if (span[key] || at(cx, cy) !== T_BRIDGE) continue; span[key] = 1; got.push(key); x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) todo.push([cx + dx, cy + dy]); }
    const info = { style: Math.floor(h(x0, y0, 600) * 4), across: x1 - x0 >= y1 - y0 };
    if (info.style === 3 && got.length > 5) info.style = got.length > 12 ? 0 : 1;      // nobody fords a lake: a long crossing is built
    for (const key of got) span[key] = info;
  }
  // what is grown on each plot, and what divides it from the next
  const crop = (tx, ty) => Math.floor(h(Math.floor(tx / 4), Math.floor(ty / 3), 71) * 7), walled = (tx, ty) => h(Math.floor(tx / 4), Math.floor(ty / 3), 72) > 0.6;
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
  const lone = [];
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const k = at(tx, ty), x = tx * 10, y = ty * 10, a = h(tx, ty, 40), b = h(tx, ty, 41);
    if (k === T_ROAD || k === T_BRIDGE) {
      const dTown = Math.hypot(tx - tx0, ty - ty0), paved = k === T_ROAD && dTown < 9;
      const road = k === T_ROAD ? (paved ? '#c4bca6' : dTown > 70 ? '#c2a674' : '#cdae78') : '#8a6a3a';
      R(x + 2, y + 2, 6, 6, road);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const o = at(tx + dx, ty + dy); if (o === T_ROAD || o === T_BRIDGE) R(dx ? x + (dx > 0 ? 8 : 0) : x + 2, dy ? y + (dy > 0 ? 8 : 0) : y + 2, dx ? 2 : 6, dy ? 2 : 6, road); }
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const o = at(tx + dx, ty + dy); if (o === T_ROAD || o === T_BRIDGE) R(x + (dx > 0 ? 7 : 0), y + (dy > 0 ? 7 : 0), 3, 3, road); }
      if (k === T_BRIDGE) {
        const B = span[ty * TW + tx] || { style: 0, across: true }, rail = (c) => { if (B.across) { R(x, y + 1, 10, 1, c); R(x, y + 8, 10, 1, c); } else { R(x + 1, y, 1, 10, c); R(x + 8, y, 1, 10, c); } };
        if (B.style === 1) {                   // dressed stone, with a parapet
          R(x + (B.across ? 0 : 1), y + (B.across ? 1 : 0), B.across ? 10 : 8, B.across ? 8 : 10, '#b5ad9c'); rail('#8f8676');
          for (let i = 1; i < 10; i += 3) { if (B.across) R(x + i + (ty % 2), y + 2, 1, 6, '#a39a8a'); else R(x + 2, y + i + (tx % 2), 6, 1, '#a39a8a'); }
          if (B.across) { R(x, y + 2, 10, 1, '#cfc8b6'); R(x, y + 9, 10, 1, 'rgba(0,20,40,.3)'); } else { R(x + 2, y, 1, 10, '#cfc8b6'); R(x + 9, y, 1, 10, 'rgba(0,20,40,.3)'); }
        } else if (B.style === 2) {            // tree trunks laid side by side, and a rope to hold
          R(x + (B.across ? 0 : 1), y + (B.across ? 1 : 0), B.across ? 10 : 8, B.across ? 8 : 10, '#6b4f2c');
          for (let i = 0; i < 10; i += 2) { if (B.across) { R(x + i, y + 1, 1, 8, i % 4 ? '#5a4326' : '#7a5a34'); } else R(x + 1, y + i, 8, 1, i % 4 ? '#5a4326' : '#7a5a34'); }
          if ((tx + ty) % 2 === 0) { R(x + (B.across ? 4 : 0), y + (B.across ? 0 : 4), 2, 2, '#3a2a1c'); R(x + (B.across ? 4 : 8), y + (B.across ? 8 : 4), 2, 2, '#3a2a1c'); }
        } else if (B.style === 3) {            // a ford: flat stones set in the shallows
          R(x, y, 10, 10, '#8fc3e0'); R(x, y, 10, 10, 'rgba(255,255,255,.08)');
          for (let q = 0; q < 4; q++) { const sx = x + 1 + Math.floor(h(tx, ty, 601 + q) * 6), sy = y + 1 + Math.floor(h(tx, ty, 605 + q) * 6), sw = 3 + Math.floor(h(tx, ty, 609 + q) * 2); R(sx, sy, sw, 3, q % 2 ? '#a39a8a' : '#b5ad9c'); R(sx, sy, sw, 1, '#d0c8b6'); R(sx, sy + 3, sw, 1, 'rgba(0,30,60,.25)'); }
        } else { rail('#5f4622'); for (let i = 1; i < 10; i += 3) { if (B.across) R(x + i, y + 2, 1, 6, '#77592e'); else R(x + 2, y + i, 6, 1, '#77592e'); } if (h(tx, ty, 613) > 0.7) R(x + 3 + Math.floor(h(tx, ty, 614) * 3), y + 3, 2, 2, '#5f4622'); }      // planks on trestles, one or two gone
      }
      else if (paved) { R(x + 2 + ((tx + ty) % 2) * 3, y + 2, 1, 6, '#a89f8a'); R(x + 2, y + 4 + ((tx * 3 + ty) % 2), 6, 1, '#a89f8a'); if (a > 0.8) R(x + 3 + Math.floor(b * 3), y + 3, 2, 2, '#d6cfbc'); }      // dressed stone, close to the gate
      else {
        if (a > 0.6) R(x + 3 + Math.floor(b * 4), y + 3 + Math.floor(a * 3), 2, 1, '#b8955f'); if (a < 0.2) R(x + 4, y + 5, 1, 2, '#dcc396');       // ruts
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
      const dp = deep(tx, ty), nz = wildNoise(tx / 6, ty / 6, 311), reg = wildRegion(x + 5, y + 5), sea = tx < 16 || reg === 'The Salt Shore';
      R(x, y, 10, 10, nz > 0.5 ? `rgba(255,255,255,${((nz - 0.5) * 0.14).toFixed(3)})` : `rgba(0,20,60,${((0.5 - nz) * 0.14).toFixed(3)})`);      // light and dark, so that no reach of it is one flat blue
      for (let q = 0, n = 1 + Math.floor(a * 3); q < n; q++) R(x + Math.floor(h(tx, ty, 312 + q) * 7), y + 1 + Math.floor(h(tx, ty, 316 + q) * 8), 2 + Math.floor(h(tx, ty, 320 + q) * 4), 1, dp ? '#5a9cc6' : '#8fc3e0');
      if (b > 0.8) R(x + 5, y + 7, 3, 1, '#35709c');
      const e = h(tx, ty, 324), narrow = !sea && ((!wet(at(tx - 2, ty)) && !wet(at(tx + 2, ty))) || (!wet(at(tx, ty - 2)) && !wet(at(tx, ty + 2))));
      if (narrow && e > 0.9 && e <= 0.972) { for (let q = 0; q < 4; q++) R(x + 1 + Math.floor(h(tx, ty, 620 + q) * 6), y + 1 + q * 2 + Math.floor(h(tx, ty, 624 + q) * 2), 2 + Math.floor(h(tx, ty, 628 + q) * 3), 1, '#e6f3fa'); R(x + 3, y + 5, 2, 2, '#7d7a72'); }      // white water over stones
      else if (narrow && e < 0.05) { const bw = 4 + Math.floor(b * 4); R(x + 1, y + 4, bw, 3, '#d2c08a'); R(x + 2, y + 3, Math.max(1, bw - 2), 1, '#e0d09c'); R(x + 2, y + 5, 1, 1, '#a39a8a'); }                                                                              // a bar of gravel
      else if (!dp && e > 0.972) { const rw = 3 + Math.floor(b * 3); R(x + 2, y + 4, rw, 3, '#7d7a72'); R(x + 2, y + 4, rw - 1, 1, '#a8a498'); R(x + 1, y + 7, rw + 2, 1, '#e6f3fa'); }      // a rock breaking the surface
      else if (!dp && !sea && e > 0.9) { for (let q = 0; q < 3; q++) R(x + 2 + q * 3, y + 2 + ((q * 5 + tx) % 4), 1, 4, q % 2 ? '#8a9a4a' : '#9aaa5a'); R(x + 5, y + 1 + ((5 + tx) % 4), 1, 2, '#6b4a2a'); }      // reeds standing in the shallows
      else if (!sea && e > 0.82 && e < 0.9 && (reg === 'Blackmere' || !dp)) { R(x + 2 + Math.floor(b * 5), y + 3 + Math.floor(a * 4), 3, 2, '#5f8f4a'); R(x + 3 + Math.floor(b * 5), y + 3 + Math.floor(a * 4), 1, 1, e > 0.86 ? '#f4d0d8' : '#f4f4f0'); }      // lily pads
      else if (sea && dp && e > 0.965) { R(x + 1, y + 2, 7, 5, 'rgba(20,50,40,.28)'); R(x + 3, y + 1, 4, 7, 'rgba(20,50,40,.22)'); }                                                                             // weed on the sea bed
      else if (sea && e < 0.012) { R(x + 2, y + 4, 4, 1, '#e6f3fa'); R(x + 5, y + 3, 2, 1, '#e6f3fa'); R(x + 1, y + 5, 2, 1, '#e6f3fa'); }                                                                       // a breaking wave
      // surf along the shore
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy], n) => {
        if (tx + dx < 0 || ty + dy < 0 || tx + dx >= TW || ty + dy >= TH) return;      // the sea runs off the edge of the map: no surf there
        const o = at(tx + dx, ty + dy);
        if (wet(o) || o === T_BRIDGE) return;
        for (let i = 0; i < 2; i++) { const q = 1 + Math.floor(h(tx, ty, 50 + n * 2 + i) * 6); R(dx ? x + (dx > 0 ? 7 : 2) : x + q, dy ? y + (dy > 0 ? 7 : 2) : y + q, dx ? 1 : 3, dx ? 3 : 1, '#e6f3fa'); }
      });
    }
    else if (k === T_SAND) {
      const v = h(tx, ty, 330);
      if (a > 0.6) R(x + Math.floor(b * 8), y + Math.floor(a * 8), 2, 1, '#c2ad72');
      if (v > 0.93) { const dw = 5 + Math.floor(b * 4), dx = x + Math.floor(a * (10 - dw)), dy = y + 4 + Math.floor(h(tx, ty, 331) * 3); R(dx, dy, dw, 2, '#e8d8a4'); R(dx + 1, dy - 1, dw - 2, 1, '#f0e2b4'); R(dx, dy + 2, dw + 1, 1, '#c2ad72'); if (b > 0.4) { R(dx + 2, dy - 3, 1, 2, '#9aa860'); R(dx + 4, dy - 2, 1, 1, '#9aa860'); } }      // a dune, with marram on it
      else if (v > 0.86) for (let q = 0; q < 2 + Math.floor(b * 3); q++) { const gx = x + 1 + Math.floor(h(tx, ty, 332 + q) * 8), gy = y + 3 + Math.floor(h(tx, ty, 336 + q) * 5); R(gx, gy, 1, 3, '#9aa860'); R(gx + (q % 2 ? 1 : -1), gy - 1, 1, 1, '#aab870'); }      // marram grass
      else if (v > 0.8) { const wy = y + 2 + Math.floor(b * 6); for (let q = 0; q < 10; q += 2) if (h(tx + q, ty, 340) > 0.3) R(x + q, wy + ((q >> 1) % 2), 2, 1, q % 4 ? '#6b6a3a' : '#57562e'); }      // wrack left by the tide
      else if (v > 0.76) for (let q = 0; q < 3; q++) R(x + 1 + Math.floor(h(tx, ty, 341 + q) * 8), y + 1 + Math.floor(h(tx, ty, 344 + q) * 8), 1, 1, q % 2 ? '#f1ead8' : '#f4d0d8');                          // shells
      else if (v > 0.73) { const lx = x + 1 + Math.floor(b * 4); R(lx, y + 5, 5, 1, '#a89878'); R(lx + 1, y + 4, 2, 1, '#a89878'); R(lx + 5, y + 5, 1, 1, '#8a7a5c'); }                                       // driftwood
      else if (v > 0.718) { R(x + 4, y + 5, 2, 1, '#c2503a'); R(x + 3, y + 6, 1, 1, '#c2503a'); R(x + 6, y + 6, 1, 1, '#c2503a'); }                                                                             // a crab
      else if (v < 0.04) for (let q = 0; q < 3; q++) R(x + 1 + Math.floor(h(tx, ty, 347 + q) * 7), y + 2 + Math.floor(h(tx, ty, 350 + q) * 6), 2, 1, q % 2 ? '#a39a8a' : '#b5ad9c');                          // shingle
      else if (v < 0.07) { R(x + 4, y + 5, 2, 1, '#f1ead8'); R(x + 5, y + 4, 1, 1, '#f1ead8'); }
    }
    else if (k === T_MEADOW) {
      const z = wildNoise(tx / 3.5, ty / 3.5, 401), zc = z < 0.32 ? ['#c23b2e', '#e06a5a'] : z < 0.5 ? ['#f2e6a0', '#e8d060'] : z < 0.68 ? ['#f4f4f0', '#f2e6a0'] : ['#b9a0e0', '#e8a0c0'];
      for (let q = 0, n = 1 + Math.floor(h(tx, ty, 402) * 5); q < n; q++) R(x + Math.floor(h(tx, ty, 403 + q) * 10), y + Math.floor(h(tx, ty, 409 + q) * 10), 1, 1, zc[q % 2]);
      if (a > 0.9) { const lean = b > 0.5 ? 1 : -1; for (let q = 0; q < 3; q++) { const gx = x + 1 + Math.floor(h(tx, ty, 415 + q) * 8), gy = y + 3 + Math.floor(h(tx, ty, 418 + q) * 5); R(gx, gy, 1, 3, '#93b055'); R(gx + lean, gy - 1, 1, 1, '#a8c468'); } }      // long grass
      else if (a > 0.84) { R(x + 1 + Math.floor(b * 5), y + 4, 4, 3, '#6f9a48'); R(x + 2 + Math.floor(b * 5), y + 3, 2, 1, '#6f9a48'); R(x + 2 + Math.floor(b * 5), y + 5, 1, 1, '#f4f4f0'); }      // clover
      else if (a < 0.02) { R(x + 4, y + 3, 1, 1, '#f4f4f0'); R(x + 6, y + 3, 1, 1, '#f4f4f0'); R(x + 5, y + 4, 1, 1, '#2a1c14'); }                                                              // a butterfly
      else if (a < 0.035) { R(x + 3, y + 5, 4, 2, '#9a958a'); R(x + 3, y + 5, 3, 1, '#bdb8ac'); }
    }
    else if (k === T_MARSH) {
      const v = h(tx, ty, 220);
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
      else if (v < 0.03) { const lx = x + 1 + Math.floor(b * 3); R(lx, y + 6, 6, 2, '#4a4038'); R(lx, y + 6, 6, 1, '#5e5448'); R(lx + 2, y + 4, 1, 2, '#4a4038'); }                             // a trunk going back into the bog
    }
    else if (k === T_HILL) {
      // each stretch of high ground has its own colour, and each mound its own size and shape
      const reg = wildRegion(x + 5, y + 5), t = tone(tx, ty) * (0.94 + h(tx, ty, 120) * 0.12);
      const pal = reg === 'The Quarry Hills' ? ['#b9b083', '#cfc79c', '#8d8660', '#77704e'] : reg === 'The High Fells' ? ['#8f9a78', '#a6b08e', '#6c765a', '#5a634a'] : reg === 'The Barrow Downs' ? ['#86a05a', '#9ab56c', '#64803f', '#52692f'] : ['#a3a866', '#b9be7c', '#7f8548', '#6b703a'];
      const hillN = (at(tx - 1, ty) === T_HILL) + (at(tx + 1, ty) === T_HILL) + (at(tx, ty - 1) === T_HILL) + (at(tx, ty + 1) === T_HILL);
      const mound = (cx, cy, rx, ry) => {
        R(cx - rx, cy + 1, rx * 2 + 2, 1, 'rgba(0,0,0,.16)');
        for (let dy = -ry; dy <= 0; dy++) {
          const w = Math.max(1, Math.round(rx * Math.sqrt(1 - (dy * dy) / (ry * ry + 0.5)) + (h(cx + dy, cy, 121) - 0.5) * 1.6));
          R(cx - w, cy + dy, w * 2, 1, tint(pal[0], t));
          if (dy < -ry * 0.25) R(cx - w + 1, cy + dy, Math.max(1, Math.round(w * (0.9 - (dy + ry) / (ry * 2.2)))), 1, tint(pal[1], t));      // the light, from the north-west
          R(cx + w - Math.max(1, Math.round(w * 0.3)), cy + dy, Math.max(1, Math.round(w * 0.3)), 1, tint(pal[2], t));                              // the far side, in shade
        }
        R(cx - rx + 1, cy, rx * 2 - 1, 1, tint(pal[3], t));
      };
      if (a > 0.58 || (hillN < 3 && a > 0.3)) {
        const big = hillN === 4 && a > 0.8, rx = big ? 10 + Math.floor(b * 8) : 4 + Math.floor(b * 6), ry = Math.max(3, Math.round(rx * (0.5 + h(tx, ty, 122) * 0.35)));
        const cx = x + Math.floor(h(tx, ty, 123) * 10), cy = y + 2 + Math.floor(h(tx, ty, 124) * 10);
        if (h(tx, ty, 125) > 0.7) mound(cx + rx - 2, cy - 1, Math.max(3, rx - 3), Math.max(2, ry - 1));      // a shoulder behind it
        mound(cx, cy, rx, ry);
        const e = h(tx, ty, 126);
        if (e > 0.93) { R(cx - 1, cy - ry - 1, 3, 2, '#9a958a'); R(cx - 1, cy - ry - 1, 2, 1, '#c4bfb2'); }                                            // a rock on the crown
        else if (e > 0.86) { R(cx - 3, cy - 2, 2, 1, '#55703a'); R(cx + 1, cy - 3, 2, 1, '#55703a'); R(cx - 1, cy - 1, 1, 1, '#6f8a4a'); }              // scrub
        else if (e > 0.82) for (let q = 0; q < 3; q++) R(cx - rx + 2 + q * 2, cy - 1 - q, rx - q * 2, 1, tint(pal[2], t));                              // terraces cut into it
        else if (e < 0.03) { R(cx, cy - ry - 5, 1, 5, '#4a3320'); R(cx - 2, cy - ry - 7, 5, 3, '#3f6a2c'); R(cx - 1, cy - ry - 8, 3, 1, '#57863a'); }  // a lone tree
      } else if (a < 0.1) {                        // bare ground between: stones, a goat track
        const n = 1 + Math.floor(b * 3);
        for (let q = 0; q < n; q++) { const sx = x + 1 + Math.floor(h(tx, ty, 127 + q) * 7), sy = y + 2 + Math.floor(h(tx, ty, 130 + q) * 6), sw = 2 + Math.floor(h(tx, ty, 133 + q) * 3); R(sx, sy, sw, 2, '#9a958a'); R(sx, sy, sw, 1, '#bdb8ac'); R(sx, sy + 2, sw + 1, 1, 'rgba(0,0,0,.18)'); }
      } else if (a < 0.2) for (let q = 0; q < 5; q++) R(x + q * 2 + Math.floor(b * 2), y + 3 + Math.floor(h(tx + q, ty, 136) * 4), 2, 1, tint(pal[3], t));
      else if (a < 0.3) { const n = 2 + Math.floor(b * 3), gc = tint(pal[2], t); for (let q = 0; q < n; q++) { const gx = x + 1 + Math.floor(h(tx, ty, 137 + q) * 8), gy = y + 3 + Math.floor(h(tx, ty, 141 + q) * 5); R(gx, gy, 1, 2, gc); R(gx + 1, gy - 1, 1, 1, gc); } }      // heather and rough grass
      else if (a < 0.34) { R(x + 2 + Math.floor(b * 4), y + 5, 3, 2, '#55703a'); R(x + 3 + Math.floor(b * 4), y + 4, 2, 1, '#6f8a4a'); }      // gorse
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
        else { R(x, y, 10, 10, '#d8c880'); for (let q = 0; q < 10; q += 2) R(x + ((q + ty) % 3), y + q, 8, 1, '#c2b068'); }                                 // barley, bending
        // the bounds of the plot: a hedge, or a wall of field stones with a gap for the gate
        if (tx % 4 === 0) { if (walled(tx, ty)) { R(x, y, 1, 10, '#b5aa94'); R(x, y + 3, 1, 1, '#8f8676'); R(x, y + 7, 1, 1, '#8f8676'); } else R(x, y, 1, 10, a > 0.5 ? '#4f7038' : '#5f7f3f'); }
        if (ty % 3 === 0) { if (walled(tx, ty)) { R(x, y, 10, 1, '#b5aa94'); R(x + 4, y, 1, 1, '#8f8676'); if (tx % 4 === 2) R(x + 3, y, 4, 1, '#8a6a44'); } else R(x, y, 10, 1, b > 0.5 ? '#4f7038' : '#5f7f3f'); }
        if (mid && pl > 0.84) { R(x + 4, y + 1, 1, 7, '#6b4f2c'); R(x + 2, y + 3, 5, 1, '#6b4f2c'); R(x + 3, y, 3, 2, '#c9b890'); R(x + 3, y + 3, 3, 3, '#8a4a3a'); }      // a scarecrow
        else if (mid && pl < 0.12) { R(x + 2, y + 3, 6, 4, '#d9c070'); R(x + 3, y + 2, 4, 1, '#e6d088'); R(x + 2, y + 7, 6, 1, '#b89a4a'); R(x + 1, y + 8, 8, 1, 'rgba(0,0,0,.18)'); }      // a rick
      }
      else if (a > 0.94) {                     // a bush: one of several kinds, never quite the same size
        const w = 3 + Math.floor(b * 4), hh = 2 + Math.floor(h(tx, ty, 140) * 2), bx = x + Math.floor(h(tx, ty, 141) * (9 - w)), by = y + 4 + Math.floor(h(tx, ty, 142) * 3), kind = Math.floor(h(tx, ty, 143) * 4);
        const dk = ['#4c7f38', '#3f6f45', '#5f7f2f', '#4a6a3a'][kind], lt = ['#69a04a', '#58905c', '#7fa040', '#62884c'][kind];
        R(bx, by + hh, w, 1, 'rgba(0,0,0,.18)'); R(bx, by, w, hh, dk); R(bx + 1, by - 1, Math.max(1, w - 2), 1, lt); R(bx, by, Math.max(1, w >> 1), 1, lt);
        if (kind === 0 && b > 0.5) { R(bx + 1, by, 1, 1, '#c23b2e'); R(bx + w - 2, by + 1, 1, 1, '#c23b2e'); }      // berries
        if (kind === 2) { R(bx + 1, by, 1, 1, '#f2e6a0'); R(bx + w - 1, by + 1, 1, 1, '#f2e6a0'); }                  // broom in flower
      }
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
        const n = 1 + Math.floor(b * 3);
        for (let q = 0; q < n; q++) { const sx = x + 1 + Math.floor(h(tx, ty, 172 + q) * 7), sy = y + 3 + Math.floor(h(tx, ty, 175 + q) * 5), sw = 2 + Math.floor(h(tx, ty, 178 + q) * 2); R(sx, sy, sw, 2, q % 2 ? '#8f8a80' : '#9a958a'); R(sx, sy, sw, 1, '#bdb8ac'); }
      }
      else if (a < 0.05) { const lx = x + 1 + Math.floor(b * 4); R(lx, y + 6, 6, 2, '#6b4f2c'); R(lx, y + 6, 6, 1, '#8a6a3a'); R(lx + 6, y + 6, 1, 2, '#c9a763'); R(lx, y + 8, 7, 1, 'rgba(0,0,0,.16)'); }      // a fallen trunk
    }
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
  const farmland = (tx, ty) => farm(tx, ty) || Math.hypot(tx - tx0, ty - ty0) < 3;
  prov.boats = [];
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
      else if (a > 0.955) { const cw = 4 + Math.floor(b * 4), cx = x + Math.floor(v1 * (10 - cw)); R(cx, y + 3, cw, 5, '#b8b2a0'); R(cx, y + 3, cw, 1, '#d8d4c6'); R(cx + 1, y + 5, cw - 2, 3, '#8f8a78'); if (v2 > 0.5) { R(cx + cw - 2, y + 1, 1, 7, '#6b4f2c'); for (let q = 0; q < 3; q++) R(cx + cw - 3, y + 2 + q * 2, 3, 1, '#8a6a3a'); } }      // a cutting in the hillside, some with a ladder left in it
      else if (a > 0.94) { for (let q = 0; q < 5; q++) R(x + 1 + Math.floor(h(tx, ty, 453 + q) * 7), y + 4 + Math.floor(h(tx, ty, 458 + q) * 4), 2, 1, q % 2 ? '#e0dccf' : '#c9c4b4'); R(x + 3, y + 3, 4, 2, '#d8d4c6'); }      // a spoil heap
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
      else if (a > 0.94) {                     // a flock: one sheep or five, a black one among them, some lying down
        for (let q = 0, n = 1 + Math.floor(v1 * 5); q < n; q++) { const sx = x + Math.floor(h(tx, ty, 465 + q) * 8), sy = y + 1 + Math.floor(h(tx, ty, 470 + q) * 7), black = h(tx, ty, 475 + q) > 0.88, lying = h(tx, ty, 480 + q) > 0.7, left = h(tx, ty, 485 + q) > 0.5;
          R(sx, sy, 3, 2, black ? '#3a322c' : '#f1ead8'); R(left ? sx - 1 : sx + 3, sy, 1, 1, '#2a1c14'); if (!lying) { R(sx, sy + 2, 1, 1, '#2a1c14'); R(sx + 2, sy + 2, 1, 1, '#2a1c14'); } }
        if (v2 > 0.9) { R(x + 8, y + 2, 2, 4, '#8a6a4a'); R(x + 8, y + 1, 2, 1, '#d9a57c'); R(x + 10, y, 1, 6, '#6b4f2c'); }      // and now and then the shepherd
      }
      else if (a > 0.925) for (let q = 0, n = 1 + Math.floor(v1 * 2); q < n; q++) { const cx = x + Math.floor(h(tx, ty, 490 + q) * 5), cy = y + 2 + q * 4, c = h(tx, ty, 492 + q) > 0.5 ? '#8a5a32' : '#e8e2d2'; R(cx, cy, 5, 3, c); R(cx + 1, cy, 2, 1, c === '#8a5a32' ? '#e8e2d2' : '#3a2a1c'); R(cx + 5, cy, 2, 2, c); R(cx, cy + 3, 1, 1, '#2a1c14'); R(cx + 4, cy + 3, 1, 1, '#2a1c14'); }      // cattle
    } else if (reg === 'The High Fells' && k === T_HILL) {
      if (a > 0.9) { for (let q = 0, n = 2 + Math.floor(v1 * 2); q < n; q++) { const sw = 3 + Math.floor(h(tx, ty, 494 + q) * 5), sx = x + Math.floor(h(tx, ty, 497 + q) * (10 - sw)), sy = y + 2 + q * 2; R(sx, sy, sw, 2, '#f2efe6'); R(sx + 1, sy + 2, Math.max(1, sw - 2), 1, '#d8d4c8'); } }       // snow lying in the hollows
      else if (a > 0.84) { const bw = 3 + Math.floor(b * 4), bh = 2 + Math.floor(v1 * 3), bx = x + 1 + Math.floor(v2 * (8 - bw)); sh(bx, y + 8, bw + 1); R(bx, y + 8 - bh, bw, bh, '#8a8478'); R(bx + 1, y + 7 - bh, Math.max(1, bw - 2), 1, '#a39c88'); R(bx, y + 8 - bh, Math.max(1, bw >> 1), 1, '#bdb8ac'); if (v3 > 0.7) R(bx + 1, y + 6 - bh, 2, 1, '#6f8a5a'); }      // a boulder, some with moss
      else if (a > 0.82) { sh(x + 3, y + 8, 5); R(x + 3, y + 6, 5, 2, '#9a958a'); R(x + 4, y + 4, 3, 2, '#a8a398'); R(x + 5, y + 2, 1, 2, '#bdb8ac'); }      // a cairn, to mark the way
    } else if (reg === 'The Home Fields' && k === T_GRASS && !farmland(tx, ty)) {
      const d = Math.hypot(tx - tx0, ty - ty0), px = Math.floor(tx / 3), py = Math.floor(ty / 3), plot = h(px, py, 93), pv = h(px, py, 94);
      if (d > 10.5 && d < 17 && plot > 0.7) {                         // vineyards, olive groves and orchards beyond the fields
        if (plot > 0.9) {                      // olives: old trees, each where it happened to grow
          R(x, y, 10, 10, pv > 0.5 ? '#8a9a5a' : '#96a468');
          for (let q = 0, n = 2 + Math.floor(v1 * 3); q < n; q++) { const ox = 1 + Math.floor(h(tx, ty, 500 + q) * 7), oy = 2 + Math.floor(h(tx, ty, 504 + q) * 6), r = 1 + Math.floor(h(tx, ty, 508 + q) * 2); R(x + ox - r, y + oy, r * 2 + 1, 2, '#6f8a5a'); R(x + ox - r, y + oy - 1, r + 1, 1, '#9ab284'); R(x + ox, y + oy + 2, 1, 1, '#4a3320'); }
        } else if (plot > 0.78) {              // vines: the rows run one way on one plot and the other way on the next
          R(x, y, 10, 10, '#8a7a4a'); const grape = pv > 0.6 ? '#7a3a6a' : pv > 0.3 ? '#9aa83a' : '#5a2a4a';
          if (pv * 7 % 1 > 0.5) for (let q = 1; q < 10; q += 3) { R(x, y + q, 10, 2, '#557a36'); for (let u = 1 + (q % 2); u < 10; u += 3) R(x + u, y + q, 1, 1, grape); R(x + (tx % 3 === 0 ? 0 : 9), y + q - 1, 1, 3, '#6b4f2c'); }
          else for (let q = 1; q < 10; q += 3) { R(x + q, y, 2, 10, '#557a36'); for (let u = 1 + (q % 2); u < 10; u += 3) R(x + q, y + u, 1, 1, grape); }
        } else {                               // an orchard, in blossom or in fruit
          R(x, y, 10, 10, '#84a052');
          for (let q = 0, n = 1 + Math.floor(v1 * 2); q < n; q++) { const ox = 2 + Math.floor(h(tx, ty, 512 + q) * 6), oy = 3 + q * 4; R(x + ox - 2, y + oy - 2, 5, 3, '#4c7f38'); R(x + ox - 1, y + oy - 3, 3, 1, '#69a04a'); R(x + ox, y + oy + 1, 1, 2, '#4a3320'); R(x + ox - 1 + Math.floor(v2 * 3), y + oy - 2, 1, 1, pv > 0.5 ? '#f4d0d8' : '#c23b2e'); R(x + ox + 1, y + oy - 1, 1, 1, pv > 0.5 ? '#ffffff' : '#e3b04a'); }
        }
      }
    }
    // poplars along the roads near the town: a tall one, a short one, sometimes two together
    if (k === T_GRASS && !farmland(tx, ty) && b > 0.86 && Math.hypot(tx - tx0, ty - ty0) < 30 && (at(tx, ty + 1) === T_ROAD || at(tx, ty - 1) === T_ROAD || at(tx + 1, ty) === T_ROAD || at(tx - 1, ty) === T_ROAD)) {
      const poplar = (px, hh, c1, c2) => { sh(px - 1, y + 9, 5); R(px, y + 6, 1, 3, '#4a3320'); for (let q = 0; q < hh; q++) { const w2 = q < 2 || q > hh - 3 ? 1 : 2; R(px - (w2 >> 1), y + 6 - hh + q, w2 + 1, 1, q % 3 ? c1 : c2); } };
      poplar(x + 3 + Math.floor(v1 * 3), 6 + Math.floor(v2 * 6), '#3f6a2c', '#57863a');
      if (v3 > 0.7) poplar(x + 8, 5 + Math.floor(v4 * 4), '#356026', '#4c7a34');
    }
    // fishing boats lie off the Salt Shore (they are drawn live, bobbing): open water, a little way out
    if (reg === 'The Salt Shore' && wet(k) && a > 0.992 && wet(at(tx + 1, ty)) && wet(at(tx - 1, ty)) && prov.boats.length < 9) prov.boats.push([x + 5, y + 5]);
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
  });
  // what stands up from the ground is gathered first and drawn from the back of the picture to the front, so that
  // each thing overlaps what is behind it. Nothing is stamped: every tree and every mountain is made for its own spot.
  const feats = [];
  const peakDepth = (tx, ty) => { for (let r = 1; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && at(tx + dx, ty + dy) !== T_PEAK) return r; return 5; };
  // a tree: its kind, its size, and a shade of its own
  const tree = (cx, cy, kind, sz, f) => {
    const C = c => tint(c, f);
    R(cx - sz - 1, cy + 1, sz * 2 + 3, 2, 'rgba(0,0,0,.2)');
    if (kind === 'pine' || kind === 'fir') {
      const dk = kind === 'fir' ? '#27483a' : '#2c5230', lt = kind === 'fir' ? '#3c6450' : '#437046', tiers = 2 + Math.floor(sz / 2);
      R(cx, cy - 1, 1, 3, '#4a3320');
      for (let q = 0; q < tiers; q++) { const w = sz - Math.round(q * sz / (tiers + 0.5)), y0 = cy - 2 - q * 2; R(cx - w, y0, w * 2 + 1, 2, C(dk)); R(cx - w, y0, Math.max(1, w), 1, C(lt)); }
      R(cx, cy - 2 - tiers * 2, 1, 2, C(dk));
    } else if (kind === 'stone') {               // the umbrella pine of the coast: a long bare trunk and a flat crown
      R(cx, cy - sz - 3, 1, sz + 5, '#5a3f26'); R(cx + 1, cy - sz - 1, 1, 2, '#5a3f26');
      R(cx - sz - 1, cy - sz - 5, sz * 2 + 3, 3, C('#35602b')); R(cx - sz, cy - sz - 6, sz * 2 + 1, 1, C('#35602b')); R(cx - sz - 1, cy - sz - 5, sz + 1, 1, C('#5a8a46'));
    } else if (kind === 'birch') {
      R(cx, cy - sz - 2, 1, sz + 4, '#e8e4d8'); R(cx, cy - 1, 1, 1, '#5a5448'); R(cx, cy - sz, 1, 1, '#5a5448');
      R(cx - sz + 1, cy - sz - 5, sz * 2 - 1, sz, C('#6f9a48')); R(cx - sz + 2, cy - sz - 6, Math.max(1, sz * 2 - 3), 1, C('#6f9a48')); R(cx - sz + 1, cy - sz - 5, sz - 1, Math.max(1, sz - 2), C('#93b866'));
    } else if (kind === 'cypress') {
      R(cx, cy - 1, 1, 3, '#4a3320');
      for (let q = 0; q < sz * 2 + 3; q++) { const w = q < 2 || q > sz * 2 ? 0 : 1; R(cx - w, cy - 2 - q, w * 2 + 1, 1, C(q % 3 ? '#2f5234' : '#3f6844')); }
    } else if (kind === 'willow') {              // over water: a low wide head, and the withies hanging
      R(cx, cy - 2, 1, 4, '#4a4030');
      R(cx - sz - 1, cy - sz - 3, sz * 2 + 3, sz, C('#5f7f4a')); R(cx - sz, cy - sz - 4, sz * 2 + 1, 1, C('#5f7f4a')); R(cx - sz - 1, cy - sz - 3, sz + 1, 1, C('#7f9f62'));
      for (let q = -sz - 1; q <= sz + 1; q += 2) R(cx + q, cy - 3, 1, 2 + (Math.abs(q) % 3), C('#6f8f56'));
    } else if (kind === 'dead') {
      R(cx, cy - sz - 3, 1, sz + 5, '#5a5046'); R(cx - 2, cy - sz - 1, 2, 1, '#5a5046'); R(cx - 3, cy - sz - 2, 1, 1, '#5a5046'); R(cx + 1, cy - sz, 2, 1, '#5a5046'); R(cx + 3, cy - sz - 1, 1, 1, '#5a5046'); R(cx + 1, cy - sz - 4, 1, 2, '#5a5046');
    } else {                                     // broadleaf: a crown built of two or three lobes, so that no two have one outline
      const dk = kind === 'beech' ? '#3f7032' : kind === 'chestnut' ? '#4a6a2a' : kind === 'blossom' ? '#4c7f38' : '#35602b', lt = kind === 'beech' ? '#5f9a46' : kind === 'chestnut' ? '#7a9a3a' : kind === 'blossom' ? '#69a04a' : '#4c7f38', hi = kind === 'beech' ? '#7fb85a' : '#69a04a';
      R(cx, cy - 2, 1, 4, '#4a3320');
      const lobes = 2 + Math.floor(h(cx, cy, 190) * 2);
      for (let q = 0; q < lobes; q++) { const ox = Math.round((h(cx + q, cy, 191) - 0.5) * sz * 1.4), oy = -Math.round(h(cx, cy + q, 192) * sz * 0.8), r = Math.max(2, sz - q);
        R(cx + ox - r, cy - 3 - r + oy, r * 2 + 1, r + 1, C(dk)); R(cx + ox - r + 1, cy - 4 - r + oy, Math.max(1, r * 2 - 1), 1, C(dk)); R(cx + ox - r, cy - 3 - r + oy, r, Math.max(1, r - 1), C(lt)); R(cx + ox - r + 1, cy - 4 - r + oy, Math.max(1, r - 1), 1, C(hi)); }
      if (kind === 'blossom') for (let q = 0; q < 4; q++) R(cx - sz + Math.floor(h(cx, cy, 193 + q) * sz * 2), cy - 3 - Math.floor(h(cx, cy, 197 + q) * sz), 1, 1, q % 2 ? '#f4d0d8' : '#ffffff');
    }
  };
  // which trees grow where
  const species = (tx, ty, reg, r) => {
    const nn = north(tx, ty) + (r - 0.5) * 0.24;
    if (reg === 'Greywood') return r < 0.1 ? 'dead' : r < 0.45 ? 'fir' : r < 0.8 ? 'oak' : 'birch';
    if (reg === 'Blackmere') return r < 0.25 ? 'dead' : r < 0.7 ? 'willow' : 'fir';
    if (reg === 'The Salt Shore') return r < 0.5 ? 'stone' : r < 0.75 ? 'cypress' : 'oak';
    if (reg === 'The Quarry Hills') return r < 0.35 ? 'cypress' : r < 0.7 ? 'pine' : 'oak';
    if (reg === 'The High Fells' || reg === 'The Barrow Downs') return r < 0.6 ? 'pine' : r < 0.85 ? 'fir' : 'birch';
    if (reg === 'The Home Fields') return r < 0.15 ? 'blossom' : r < 0.5 ? 'beech' : r < 0.85 ? 'oak' : 'chestnut';
    if (nn > 0.6) return r < 0.7 ? 'pine' : 'birch';
    return r < 0.4 ? 'oak' : r < 0.7 ? 'beech' : r < 0.9 ? 'chestnut' : 'birch';
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
  const setDown = (seed, ok, r, name, draw) => {
    for (let n = 0; n < 9000; n++) {
      const tx = 4 + Math.floor(wildHash(n, seed, 700) * (TW - 9)), ty = 4 + Math.floor(wildHash(seed, n, 701) * (TH - 8));
      if (!ok(tx, ty) || Math.hypot(tx - tx0, ty - ty0) < 13) continue;
      if (siteTiles.some(([sx, sy]) => Math.hypot(sx - tx, sy - ty) < 5)) continue;
      const x = tx * 10, y = ty * 10;
      if (marks.some(m => Math.hypot(m.x - x, m.y - y) < 110)) continue;
      marks.push({ x, y, r, name });
      feats.push({ y: y + 10, d: () => draw(x, y) });
      return true;
    }
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
    for (let q = 0; q < 4; q++) { R(x + q * 3, y - 6 + q * 4, 34 - q * 6, 4, ['#e8e4d8', '#d8d4c6', '#c4bfae', '#a8a290'][q]); R(x + q * 3, y - 6 + q * 4, 34 - q * 6, 1, '#f8f6ee'); }
    R(x + 28, y - 22, 2, 20, '#6b4f2c'); for (let q = 0; q < 12; q++) R(x + 28 - q, y - 22 + Math.round(q * 0.5), 1, 2, '#7a5a34'); R(x + 17, y - 16, 1, 10, '#c9b890'); R(x + 15, y - 6, 5, 4, '#f0ece0'); R(x + 15, y - 6, 5, 1, '#ffffff');
    R(x + 2, y + 6, 4, 3, '#f0ece0'); R(x + 8, y + 7, 3, 2, '#e0dccf');
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
  prov.marks = marks;
  const nearMark = (cx, cy) => marks.some(m => cx > m.x - 6 && cx < m.x + m.r * 2 + 4 && cy > m.y - m.r * 1.6 && cy < m.y + 16);

  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const k = at(tx, ty), x = tx * 10, y = ty * 10, a = h(tx, ty, 60), b = h(tx, ty, 61);
    if (k === T_FOREST) {
      const reg = wildRegion(x + 5, y + 5), edge = at(tx - 1, ty) !== T_FOREST || at(tx + 1, ty) !== T_FOREST || at(tx, ty - 1) !== T_FOREST || at(tx, ty + 1) !== T_FOREST;
      const glade = !edge && wildNoise(tx / 4, ty / 4, 77) < 0.13;
      if (glade) {                               // a clearing: stumps, a log, toadstools, sun on the grass
        feats.push({ y: y + 5, d: () => {
          if (a > 0.86) { R(x + 3, y + 5, 3, 2, '#6b4f2c'); R(x + 3, y + 5, 3, 1, '#c9a763'); }                                         // a stump
          else if (a > 0.74) { const lx = x + Math.floor(b * 3); R(lx, y + 6, 6, 2, '#5a4326'); R(lx, y + 6, 6, 1, '#7a5a34'); }          // a log
          else if (a > 0.68) { R(x + 4, y + 6, 1, 2, '#f1ead8'); R(x + 3, y + 5, 3, 1, '#c23b2e'); }                                     // a toadstool
          else if (a > 0.4) for (let q = 0; q < 3; q++) R(x + Math.floor(h(tx, ty, 78 + q) * 9), y + Math.floor(h(tx, ty, 82 + q) * 9), 1, 1, q % 2 ? '#f2e6a0' : '#f4f4f0');      // flowers in the sun
        } });
        continue;
      }
      const n = edge ? 1 + (b > 0.6 ? 1 : 0) : 1 + (b > 0.35 ? 1 : 0) + (b > 0.8 ? 1 : 0);
      for (let q = 0; q < n; q++) {
        const cx = x + 1 + Math.floor(h(tx, ty, 63 + q) * 9), cy = y + 2 + Math.floor(h(tx, ty, 66 + q) * 8), kind = species(tx, ty, reg, h(tx, ty, 69 + q)), sz = (edge ? 2 : 3) + Math.floor(h(tx, ty, 72 + q) * (edge ? 2 : 3)), f = 0.86 + h(tx, ty, 75 + q) * 0.26;
        if (!nearMark(cx, cy)) feats.push({ y: cy, d: () => tree(cx, cy, kind, sz, f) });
      }
      if (edge && a > 0.7) feats.push({ y: y + 9, d: () => { R(x + 1 + Math.floor(b * 5), y + 7, 4, 2, '#4c7f38'); R(x + 2 + Math.floor(b * 5), y + 6, 2, 1, '#69a04a'); } });      // brush along the wood's edge
    } else if (k === T_PEAK) {
      const d = peakDepth(tx, ty), reg = wildRegion(x + 5, y + 5), r = h(tx, ty, 80);
      const rock = reg === 'The High Fells' ? ['#a2aab4', '#646c78', '#7d8692'] : reg === 'The Quarry Hills' ? ['#d2cbb6', '#8f8876', '#b3ac98'] : reg === 'The Barrow Downs' ? ['#8c8676', '#4f4a3c', '#6d6858'] : ['#aaa496', '#6b665c', '#8a8478'];
      // scree and broken rock on the ground between
      feats.push({ y: y, d: () => {
        for (let q = 0; q < 3; q++) R(x + Math.floor(h(tx, ty, 81 + q) * 8), y + Math.floor(h(tx, ty, 84 + q) * 8), 2 + (q % 2), 1, q % 2 ? rock[1] : rock[0]);
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
      const mountain = (mx, mby, mw, mh, ml, sr, seed) => {
        R(mx - (mw >> 1), mby, mw + 3, 2, 'rgba(0,0,0,.22)');
        for (let i = 0; i < mh; i++) {
          const fr = (i + 1) / mh, half = Math.max(1, Math.round((mw / 2) * Math.pow(fr, 0.8) + (h(seed + i, seed, 91) - 0.5) * (1 + fr * 2)));
          const px = Math.round(mx + ml * mw * (1 - fr)), yy = mby - mh + i, snowL = i < sr + Math.round((h(seed, i, 92) - 0.5) * 3), snowR = i < sr * 0.7 + Math.round((h(i, seed, 93) - 0.5) * 3);
          R(px - half, yy, half, 1, snowL ? '#f4f6fa' : (i + (seed % 3)) % 5 === 4 ? rock[2] : rock[0]);
          R(px, yy, half + 1, 1, snowR ? '#c9d2de' : (i + (seed % 2)) % 4 === 3 ? tint(rock[1], 0.88) : rock[1]);
          if (!snowL && fr > 0.35 && h(seed, i, 94) > 0.72) R(px - Math.round(half * (0.3 + h(i, seed, 95) * 0.5)), yy, 1, 1, tint(rock[0], 1.12));       // a ledge catching the light
          if (fr > 0.3 && h(i, seed, 96) > 0.66) R(px + Math.round(half * (0.3 + h(seed, i, 97) * 0.5)), yy, 1, 1, tint(rock[1], 0.8));                    // a gully
        }
      };
      const seed = tx * 131 + ty * 17;
      feats.push({ y: by, d: () => {
        if (w > 14 && h(tx, ty, 98) > 0.45) { const side = h(tx, ty, 99) > 0.5 ? 1 : -1; mountain(cx + side * Math.round(w * 0.42), by - 1, Math.round(w * 0.62), Math.round(hgt * 0.62), -lean, Math.round(snowRows * 0.4), seed + 7); }      // a shoulder
        mountain(cx, by, w, hgt, lean, snowRows, seed);
        if (w > 20 && h(tx, ty, 100) > 0.6) { const px = cx - Math.round(w * 0.3); for (let q = 0; q < 3; q++) R(px + q * 2, by - 2 - q * 2, 2, 2, '#35543a'); }                                                              // pines at its foot
      } });
    }
  }
  for (const [tx, ty] of lone) {
    const x = tx * 10, y = ty * 10, reg = wildRegion(x + 5, y + 5), kind = species(tx, ty, reg, h(tx, ty, 101)), sz = 2 + Math.floor(h(tx, ty, 102) * 3), f = 0.88 + h(tx, ty, 103) * 0.24, cx = x + 2 + Math.floor(h(tx, ty, 104) * 6), cy = y + 7;
    feats.push({ y: cy, d: () => tree(cx, cy, kind === 'dead' && h(tx, ty, 105) > 0.3 ? 'oak' : kind, sz, f) });
  }
  feats.sort((p1, p2) => p1.y - p2.y);
  for (const ft of feats) ft.d();
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) if (at(tx, ty) === T_FOREST && wildRegion(tx * 10 + 5, ty * 10 + 5) === 'Greywood') R(tx * 10, ty * 10 - 4, 10, 12, 'rgba(128,132,136,.16)');      // an old wood, gone grey
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
  if (p) { prov.path = p; prov.dest = null; prov.big = false; } else prov.hint = performance.now() + 1600;
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
    if (!prov.path.length) prov.path = null;
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
  vil.x = 566; vil.y = 73; vil.at = null; vil.path = null; vil.face = 'left';
  SFX.music('ludus');
  render();
  if (G.pendingEvent) showEvent();
}

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
  if (!best && Math.hypot(WILD.TOWN.x - x, WILD.TOWN.y - y) < reach + 8) return { home: true, x: WILD.TOWN.x, y: WILD.TOWN.y };
  if (!best && !prov.big) {                     // a landmark, once it has been seen
    const m = (prov.marks || []).find(q => x > q.x - 4 && x < q.x + q.r * 2 + 4 && y > q.y - q.r * 1.6 && y < q.y + 14 && wildSeen(q.x + q.r, q.y));
    if (m) return { landmark: true, name: m.name, x: m.x + m.r, y: m.y - 6 };
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
  if (hv.landmark) return [[[hv.name.toUpperCase(), '#f2e6cc'], ['A landmark of ' + wildRegion(hv.x, hv.y) + '.', '#d8c8a8']], 0];
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
  const hut = (ox, oy) => { R(ox - 4, oy - 3, 8, 5, '#d9c9a0'); R(ox - 5, oy - 6, 10, 3, '#8a5a32'); R(ox - 4, oy - 7, 8, 1, '#a8703c'); R(ox - 1, oy - 1, 2, 3, '#3a2416'); };
  const tent = (ox, oy, c) => { for (let i = 0; i < 6; i++) R(ox - i, oy - 6 + i, i * 2 + 1, 1, i % 4 < 2 ? c : shade(c, 0.85)); R(ox - 1, oy - 2, 2, 3, '#2a1d12'); };
  R(-7, 3, 15, 2, 'rgba(0,0,0,.22)');
  const k = s.kind, tr = s.tier || 1;
  // a number from the place's own name, so that two of a kind are still not two of a picture
  const sd = [...String(s.id || s.kind)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7), v = n => ((sd * (n * 2 + 3) * 7919) % 1000) / 1000;
  const pick = (n, list) => list[Math.floor(v(n) * list.length) % list.length];
  if (k === 'bounty') { tent(-3, 4, '#8a3a2a'); R(4, -8, 1, 12, '#5a4326'); R(5, -8, 5, 4, '#c23b2e'); R(6, -7, 2, 2, '#f1ead8'); R(-8, 2, 3, 2, '#efe8d8'); R(-7, 1, 1, 1, '#efe8d8'); }
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
  else if (k === 'quarry') { R(-8, -6, 16, 10, '#b8b2a0'); R(-6, -4, 12, 8, '#e8e4d8'); R(-6, 0, 12, 1, '#b8b2a0'); R(-2, -4, 1, 8, '#b8b2a0'); R(3, -1, 4, 3, '#f8f6ee'); }
  else if (k === 'cache') { for (let i = -4; i <= 4; i++) { R(i, i, 2, 2, '#8a2a20'); R(i, -i, 2, 2, '#8a2a20'); } }
  else if (k === 'herb') { R(-1, -2, 2, 6, '#3f6a2a'); R(-4, -5, 3, 3, '#7fbf6a'); R(1, -6, 3, 3, '#7fbf6a'); R(-1, -8, 2, 2, '#c9e8a0'); }
  else if (k === 'healer') { hut(0, 2); for (let q = 0; q < 4; q++) R(-9 + q * 2, 3 + (q % 2), 1, 2, q % 2 ? '#7fbf6a' : '#5f9a4a'); R(6, 1, 1, 4, '#6b4f2c'); R(5, 0, 3, 1, '#7fbf6a'); R(7, 2, 1, 1, '#c9e8a0'); for (let q = 0; q < 3; q++) R(2 + q, -9 - q * 2, 2, 1, 'rgba(230,230,225,.6)'); }      // herbs in rows, a bunch hung to dry, smoke from the roof
  else if (k === 'hermit') { R(-6, -3, 12, 7, '#8a8478'); R(-5, -5, 9, 2, '#a39c88'); R(-2, -1, 4, 5, '#1a1410'); R(6, -6, 1, 10, '#6b4f2c'); R(5, -4, 3, 1, '#6b4f2c'); R(-8, 3, 2, 1, '#efe8d8'); }      // a cell in the rock, and his staff outside it
  else if (k === 'deserter') { hut(0, 2); R(6, -4, 1, 8, '#6b4f2c'); R(7, -4, 3, 2, '#8a2a20'); R(-8, 1, 3, 3, '#6b4f2c'); R(-8, 1, 3, 1, '#8a6a3a'); }      // an old soldier's hut: a faded pennant, and wood split and stacked
  else if (k === 'master') { hut(0, 2); for (let q = 0; q < 3; q++) { R(6 + q * 3, 1, 2, 3, '#d9b060'); R(6 + q * 3, 2, 2, 1, '#b89040'); } R(-8, 3, 4, 1, '#6f9a48'); }      // the beekeeper's: skeps by the door
  else hut(0, 2);
  if (done) { ctx.fillStyle = '#2a1a0c'; ctx.fillRect(Math.round(s.x - 6), Math.round(s.y - 1), 13, 1); }
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

  // boats off the Salt Shore, riding the swell
  for (const [bx, by0] of (prov.boats || [])) {
    if (!inView(bx, by0, 20) || !wildSeen(bx, by0)) continue;
    const by = by0 + Math.round(Math.sin(T * 1.6 + bx) * 1), tilt = Math.sin(T * 1.6 + bx) > 0 ? 1 : 0;
    R(bx - 5, by + 1, 11, 1, 'rgba(20,40,60,.3)'); R(bx - 5, by - 2, 10, 3, '#6b4f2c'); R(bx - 4, by + 1, 8, 1, '#4a3620'); R(bx - 5, by - 2, 10, 1, '#8a6a3a');
    R(bx, by - 10, 1, 8, '#3a2a1c'); R(bx + 1, by - 9 + tilt, 5, 6, '#e8dcc0'); R(bx + 1, by - 9 + tilt, 5, 1, '#f8f0dc'); R(bx + 5, by - 7 + tilt, 1, 3, '#c9bfa6');
  }
  // the wind going over the meadows: a lighter streak that travels
  for (let i = 0; i < 14; i++) {
    const wx2 = camX + ((i * 71 + T * 26) % (PROV.VW + 40)) - 20, wy2 = camY + (i * 47 + Math.floor(T * 0.5 + i) * 13) % PROV.VH, kk = wildTile(wx2, wy2);
    if (kk === T_MEADOW || kk === T_GRASS) { R(wx2, wy2, 7, 1, 'rgba(255,255,220,.16)'); R(wx2 + 2, wy2 + 2, 5, 1, 'rgba(255,255,220,.10)'); }
  }
  // water moves a little
  for (let i = 0; i < 40; i++) { const x = camX + ((i * 97 + Math.floor(T * 8)) % PROV.VW), y = camY + (i * 53) % PROV.VH; if (wildTile(x, y) === T_WATER) R(x, y, 3, 1, 'rgba(214,236,248,.55)'); }

  // the town, with its gate facing you
  const tx = WILD.TOWN.x, ty = WILD.TOWN.y;
  if (inView(tx, ty, 40)) {
    const tr = tier();
    R(tx - 19, ty + 9, 40, 3, 'rgba(0,0,0,.25)'); R(tx - 18, ty - 12, 36, 21, '#b8ab94'); R(tx - 18, ty - 12, 36, 2, '#d8cdb6'); R(tx - 18, ty + 7, 36, 2, '#8f846e');
    for (let i = -18; i < 18; i += 4) R(tx + i, ty - 14, 2, 2, '#d8cdb6');
    for (const [cx, cy] of [[-20, -15], [16, -15], [-20, 5]]) { R(tx + cx, ty + cy, 5, 7, '#c9bca8'); R(tx + cx, ty + cy, 5, 1, '#e0d6c4'); R(tx + cx, ty + cy - 2, 1, 2, '#c9bca8'); R(tx + cx + 2, ty + cy - 2, 1, 2, '#c9bca8'); R(tx + cx + 4, ty + cy - 2, 1, 2, '#c9bca8'); R(tx + cx + 2, ty + cy + 3, 1, 2, '#3a2a1c'); }      // towers at the corners
    // the arena: a ring that grows with your fame
    { const rx = 5 + tr, ry = 3 + Math.floor(tr / 2), ax = tx - 9, ay = ty - 4; for (let dy = -ry; dy <= ry; dy++) { const w = Math.round(rx * Math.sqrt(1 - (dy * dy) / (ry * ry + 0.4))); R(ax - w, ay + dy, w * 2 + 1, 1, dy < 0 ? '#e0d6c4' : '#c9bca8'); if (Math.abs(dy) < ry - 1) R(ax - w + 2, ay + dy, w * 2 - 3, 1, '#d9b877'); } R(ax - rx, ay + ry + 1, rx * 2 + 1, 1, '#8f846e'); }
    // the temple, the market and the houses
    R(tx + 2, ty - 9, 10, 6, '#e8e2d2'); for (let i = 0; i < 4; i++) R(tx + 3 + i * 3, ty - 8, 1, 5, '#c9c2ae'); for (let i = 0; i < 3; i++) R(tx + 3 + i, ty - 11 - i, 8 - i * 2, 1, '#d8d2c0'); R(tx + 6, ty - 13, 2, 1, '#e8b545');
    R(tx - 2, ty + 1, 7, 4, '#d8c9a2'); R(tx - 3, ty - 1, 9, 2, '#b5522e'); R(tx + 6, ty + 1, 6, 4, '#e2c98f'); R(tx + 5, ty, 8, 1, '#a8482a'); for (let i = 0; i < 4; i++) R(tx - 14 + i * 3, ty + 3, 2, 2, i % 2 ? '#b93a2e' : '#f1ead8');
    // your own ludus, under its red flag
    R(tx - 16, ty + 2, 8, 5, '#d2bf98'); R(tx - 17, ty, 10, 2, '#a8452e'); R(tx - 13, ty - 4, 1, 4, '#5a4326'); R(tx - 12, ty - 4, 3, 2, '#c23b2e');
    // the east gate
    R(tx + 14, ty - 5, 5, 9, '#8f846e'); R(tx + 15, ty - 2, 4, 6, '#3a2416'); R(tx + 15, ty - 9, 1, 5, '#5a4326'); R(tx + 16, ty - 9, 4, 3, '#a02d22'); R(tx + 14, ty - 6, 5, 1, '#d8cdb6');
  }
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

  // the same hour and the same weather as over the town: the colour of the light, a brand in the dark, rain
  const sky = provSky(), wx = yardWeather(sceneClock());
  if (sky.tint !== '#ffffff') { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = sky.tint; ctx.fillRect(camX, camY, PROV.VW, PROV.VH); ctx.globalCompositeOperation = 'source-over'; }
  if (wx.over > 0) { ctx.fillStyle = `rgba(40,45,60,${(0.12 * wx.over).toFixed(3)})`; ctx.fillRect(camX, camY, PROV.VW, PROV.VH); }
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
  return all.slice(0, show).map(({ st, mark }) => st.kind === 'bounty' ? row(st.id, `Bounty: ${st.name}`, `<b class="gold num">${G.bounty.pay}</b> &middot; ${G.bounty.until - G.day}d left &middot; ${wayTo(st.x, st.y)}`, siteDanger(st), true) : row(st.id, st.name, `${mark ? 'marked &middot; ' : ''}${wayTo(st.x, st.y)}`, siteDanger(st), mark)).join('')
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
        <button data-act="forage" style="flex:1"${tip(`Spend the day hunting and gathering instead of resting: about ${round5((6 + 3 * fieldParty().length) * wildTier(F.x, F.y))} denarii here, more in wilder country and with more fit men. The men get little rest, and far from home somebody may be hurt.`)}>Forage</button>
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
