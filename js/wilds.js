'use strict';
// The province beyond the town gate: its land, the places hidden in it, and what happens at each.
// Rules only; the map screen that shows it is province.js.
//
// The whole school travels together. Marching takes time: a day passes for every day's march (MARCH_DAY,
// further on a road, less through forest, hill and marsh). Going into a place costs a day, and so does making camp. Nothing here is fought twice: a place dealt with stays dealt with, even for an heir.
//
// G.dynasty.map  what the family knows: fog lifted, places seen and done, clues, the hunt for the eagle
// G.field        where the school is while outside the walls (null in town)

const WILD = {
  TILE: 10, TW: 240, TH: 180, W: 2400, H: 1800,       // the land, in tiles and in map units
  FOG: 20, FW: 120, FH: 90, SEE: 100,                  // fog is kept in squares of 20; you see 100 around you
  TOWN: { x: 765, y: 1015 }, LAND_SEED: 17,
  PARTY: 9,
};
// Kinds of ground. Everything below T_WATER can be walked on; water and bare rock cannot.
const T_GRASS = 0, T_FOREST = 1, T_HILL = 2, T_MARSH = 3, T_SAND = 4, T_ROAD = 5, T_BRIDGE = 6, T_MEADOW = 7, T_WATER = 8, T_PEAK = 9;

// ---------- numbers that always come out the same ----------
function wildRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const wildHash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function wildNoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = wildHash(xi, yi, s), b = wildHash(xi + 1, yi, s), c = wildHash(xi, yi + 1, s), d = wildHash(xi + 1, yi + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ---------- the land: laid out once, the same for every house ----------
// Sea to the west and south-west, a river from the north-east fells to the bay, forest to the north,
// marsh to the south-east, mountains in the far north-east. Roads run out from the town.
const WILD_ROADS = [
  [[76, 101], [100, 100], [120, 98], [150, 96], [178, 88], [200, 70], [214, 48], [226, 26], [230, 13]],     // the east road, up into the fells
  [[76, 101], [78, 80], [84, 58], [96, 40], [110, 23]],                                                    // north, to the quarry hills
  [[76, 101], [70, 125], [64, 150], [60, 153]],                                                            // south, along the shore
  [[150, 96], [160, 120], [172, 141], [200, 156], [206, 151]],                                             // south-east, into the mere
  [[84, 58], [96, 62]], [[150, 96], [146, 75]], [[200, 70], [186, 64]], [[100, 100], [112, 118], [122, 140]],
];
// The mill road: on from where the south road used to end, over the river, to the water-mill and the barns.
const WILD_BYROAD = [[119, 134], [118, 137], [115, 140], [111, 141], [106, 141], [101, 143], [101, 149], [94, 150], [89, 150], [86, 143], [86, 138]];
const WILD_RIVER = [[205, 18], [182, 44], [152, 60], [128, 86], [116, 108], [112, 132], [104, 156], [98, 179]];
const WILD_REGIONS = [
  { name: 'The Salt Shore', x: 300, y: 1300 }, { name: 'Greywood', x: 900, y: 420 }, { name: 'The Quarry Hills', x: 1080, y: 170 },
  { name: 'Blackmere', x: 1800, y: 1480 }, { name: 'The High Fells', x: 2000, y: 420 }, { name: 'The Home Fields', x: 760, y: 900 },
  { name: 'The Barrow Downs', x: 2200, y: 110 }, { name: 'The Long Meadows', x: 1400, y: 1050 },
];
// Places that are always where they are. Journeys of your fighters, and the trail of the eagle.
const WILD_FIXED = [
  { id: 'quarry', kind: 'quarry', tx: 110, ty: 22, name: 'The stone quarries' },
  { id: 'slavers', kind: 'slavers', tx: 172, ty: 141, name: 'The slavers\' camp' },
  { id: 'vow', kind: 'vow', tx: 60, ty: 153, name: 'The shrine on the shore' },
  { id: 'master', kind: 'master', tx: 96, ty: 62, name: 'The beekeeper\'s hut' },
  { id: 'deserter', kind: 'deserter', tx: 146, ty: 74, name: 'An old soldier\'s hut' },
  { id: 'battlefield', kind: 'battlefield', tx: 186, ty: 64, name: 'The field of the Seventeenth' },
  { id: 'chief', kind: 'chief', tx: 206, ty: 151, name: 'One-Eye\'s stockade' },
  { id: 'barrow', kind: 'barrow', tx: 230, ty: 12, name: 'The hill-king\'s barrow' },
  { id: 'cacheA', kind: 'cache', tx: 40, ty: 62, name: 'A place marked on the robber\'s map' },
  { id: 'cacheB', kind: 'cache', tx: 122, ty: 141, name: 'Where the outlaw said to dig' },
  { id: 'herb', kind: 'herb', tx: 188, ty: 128, name: 'Mereswort, growing in the black water' },
];

let wildLandCache = null;
function wildLand() {
  if (wildLandCache) return wildLandCache;
  const { TW, TH, LAND_SEED: S } = WILD, t = new Uint8Array(TW * TH);
  const coast = ty => 20 + 9 * Math.sin(ty * 0.045) + 7 * wildNoise(0.3, ty / 9, S + 1) + (ty > 150 ? (ty - 150) * 0.5 : 0);
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const i = ty * TW + tx, c = coast(ty), south = 168 + 5 * Math.sin(tx * 0.07) + 4 * wildNoise(tx / 8, 0.7, S + 2);
    if (tx < c || (ty > south && tx < 118) || tx <= 0 || ty <= 0 || tx >= TW - 1 || ty >= TH - 1) { t[i] = tx < c || ty > south ? T_WATER : T_PEAK; continue; }
    if (tx < c + 2 || (ty > south - 2 && tx < 118)) { t[i] = T_SAND; continue; }
    const ne = (tx / TW + (1 - ty / TH)) / 2, e = wildNoise(tx / 26, ty / 26, S + 3) * 0.6 + wildNoise(tx / 9, ty / 9, S + 4) * 0.25 + ne * 0.72;
    const m = wildNoise(tx / 17 + 40, ty / 17 + 40, S + 5) + (ty < 70 && tx > 60 && tx < 140 ? 0.16 : 0);
    const mere = tx > 150 && ty > 118 ? wildNoise(tx / 11, ty / 11, S + 6) : 0;
    if (e > 1.13) t[i] = T_PEAK;
    else if (mere > 0.72) t[i] = T_WATER;
    else if (mere > 0.42) t[i] = T_MARSH;
    else if (e > 0.95) t[i] = T_HILL;
    else if (m > 0.6) t[i] = T_FOREST;
    else t[i] = wildNoise(tx / 6, ty / 6, S + 7) > 0.68 ? T_MEADOW : T_GRASS;
  }
  // no single rock or puddle standing alone in open ground: anything that blocks the way should be plain to see
  for (let ty = 1; ty < TH - 1; ty++) for (let tx = 1; tx < TW - 1; tx++) {
    const i = ty * TW + tx, k = t[i];
    if (k !== T_WATER && k !== T_PEAK) continue;
    let same = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && t[i + dy * TW + dx] === k) same++;
    if (same <= 2) t[i] = k === T_WATER ? T_MARSH : T_HILL;
  }
  const line = (pts, fn) => { for (let k = 0; k + 1 < pts.length; k++) { const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2; for (let j = 0; j <= n; j++) fn(Math.round(x0 + (x1 - x0) * j / n), Math.round(y0 + (y1 - y0) * j / n), j / n + k); } };
  const put = (x, y, v) => { if (x > 0 && y > 0 && x < TW - 1 && y < TH - 1) t[y * TW + x] = v; };
  line(WILD_RIVER, (x, y, k) => { const w = Math.round(wildNoise(k * 2, 0.5, S + 8)); for (let d = -1; d <= w; d++) if (t[y * TW + x + d] !== T_PEAK || true) put(x + d, y, T_WATER); });
  for (const r of WILD_ROADS) line(r, (x, y) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const i = (y + dy) * TW + x + dx; if (t[i] === T_PEAK) put(x + dx, y + dy, T_HILL); }     // a pass through the rock
    put(x, y, t[y * TW + x] === T_WATER || t[y * TW + x] === T_BRIDGE ? T_BRIDGE : T_ROAD);
    if (t[y * TW + x + 1] === T_WATER) put(x + 1, y, T_BRIDGE);
  });
  // open ground round the town, and under every fixed place
  const clear = (cx, cy, r, v) => { for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) { const i = y * TW + x; if (x > 0 && y > 0 && x < TW - 1 && y < TH - 1 && t[i] !== T_ROAD && t[i] !== T_BRIDGE && (t[i] === T_WATER || t[i] === T_PEAK || v !== undefined)) t[i] = v === undefined ? (t[i] === T_WATER ? T_MARSH : T_HILL) : v; } };
  clear(Math.floor(WILD.TOWN.x / 10), Math.floor(WILD.TOWN.y / 10), 4, T_GRASS);
  for (const f of WILD_FIXED) clear(f.tx, f.ty, 1);
  // what can be reached on foot from the town
  const reach = new Uint8Array(TW * TH), start = Math.floor(WILD.TOWN.y / 10) * TW + Math.floor(WILD.TOWN.x / 10), q = [start];
  reach[start] = 1;
  for (let k = 0; k < q.length; k++) { const c = q[k]; for (const n of [c - 1, c + 1, c - TW, c + TW]) if (!reach[n] && t[n] < T_WATER) { reach[n] = 1; q.push(n); } }
  // sites for the shuffled places: spread out, reachable, clear of the town and of each other
  const rnd = wildRng(S * 7919), spots = WILD_FIXED.map(f => ({ tx: f.tx, ty: f.ty })), sites = [];
  for (let tries = 0; sites.length < 40 && tries < 60000; tries++) {
    const tx = 4 + Math.floor(rnd() * (TW - 8)), ty = 4 + Math.floor(rnd() * (TH - 8)), i = ty * TW + tx;
    if (!reach[i] || t[i] === T_ROAD || t[i] === T_BRIDGE) continue;
    if (Math.hypot(tx * 10 - WILD.TOWN.x, ty * 10 - WILD.TOWN.y) < 150) continue;
    if (spots.some(s => Math.hypot(s.tx - tx, s.ty - ty) < 15)) continue;
    spots.push({ tx, ty }); sites.push({ tx, ty });
  }
  // The aqueduct: north out of the town, then straight for the place where the river comes out between the peaks. Its
  // line is settled here, with the land, so that nothing is set down under it.
  const aqueduct = (() => {
    const ax = WILD.TOWN.x - 36, top = WILD.TOWN.y - 30; let src = null, bd = 1e9;
    for (let ty = 2; ty < TH - 2; ty++) for (let tx = 2; tx < TW - 2; tx++) {
      if (t[ty * TW + tx] !== T_WATER) continue;
      let pk = 0, wt = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const k = t[(ty + dy) * TW + tx + dx]; if (k === T_PEAK) pk++; else if (k === T_WATER) wt++; }
      const d = Math.hypot(tx * 10 - WILD.TOWN.x, ty * 10 - WILD.TOWN.y);
      if (pk >= 3 && wt <= 12 && d < bd) { bd = d; src = [tx * 10 + 5, ty * 10 + 5]; }
    }
    const pts = [[ax + 2, top - 6], [ax + 2, top - 84]]; if (src) pts.push(src);
    return pts;
  })();
  const aqDist = (x, y) => { let d = 1e9; for (let i = 0; i + 1 < aqueduct.length; i++) { const a = aqueduct[i], b = aqueduct[i + 1], vx = b[0] - a[0], vy = b[1] - a[1], k = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / (vx * vx + vy * vy || 1))); d = Math.min(d, Math.hypot(x - a[0] - vx * k, y - a[1] - vy * k)); } return d; };
  // A place that fell under the arches is moved out from under them, to the nearest open ground that is clear of
  // every other place. (Only such a place moves; the rest stand where they always stood.)
  for (let n = 0; n < sites.length; n++) {
    const st = sites[n]; if (aqDist(st.tx * 10 + 5, st.ty * 10 + 1) >= 32) continue;
    const sp = spots.find(q => q.tx === st.tx && q.ty === st.ty); let best = null, bd = 1e9;
    for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) {
      const tx = st.tx + dx, ty = st.ty + dy, i = ty * TW + tx, d = Math.hypot(dx, dy);
      if (tx < 4 || ty < 4 || tx > TW - 5 || ty > TH - 5 || d >= bd || !reach[i] || t[i] >= T_WATER || t[i] === T_ROAD || t[i] === T_BRIDGE) continue;
      if (aqDist(tx * 10 + 5, ty * 10 + 1) < 46 || Math.hypot(tx * 10 - WILD.TOWN.x, ty * 10 - WILD.TOWN.y) < 150) continue;
      if (spots.some(q => q !== sp && Math.hypot(q.tx - tx, q.ty - ty) < 11)) continue;
      best = [tx, ty]; bd = d;
    }
    if (best) { st.tx = best[0]; st.ty = best[1]; if (sp) { sp.tx = best[0]; sp.ty = best[1]; } }
  }
  // Bridges run straight: across the water from west to east, or from north to south, never aslant. A road that came
  // to the water at a slant is turned along the bank to the foot of its bridge. (Done after the places are settled, and
  // keeping clear of them, so that nothing else on the map moves on a bridge's account.)
  {
    const inMap = (x, y) => x > 1 && y > 1 && x < TW - 2 && y < TH - 2, wetK = k => k === T_WATER || k === T_BRIDGE;
    const taken = (x, y) => spots.some(sp => sp.tx === x && sp.ty === y);      // a place's own ground is never built on, nor flooded
    const seenB = new Uint8Array(TW * TH), comps = [];
    for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
      if (t[ty * TW + tx] !== T_BRIDGE || seenB[ty * TW + tx]) continue;
      const todo = [[tx, ty]], comp = [];
      while (todo.length) { const [cx, cy] = todo.pop(), key = cy * TW + cx; if (cx < 0 || cy < 0 || cx >= TW || cy >= TH || seenB[key] || t[key] !== T_BRIDGE) continue; seenB[key] = 1; comp.push([cx, cy]); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) todo.push([cx + dx, cy + dy]); }
      comps.push(comp);
    }
    for (const comp of comps) {
      const xs = comp.map(q => q[0]), ys = comp.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      if (x0 === x1 || y0 === y1) continue;                     // straight already
      // the roads that came to this crossing, told apart by which bank they are on: with the old bridge taken up,
      // every stretch of road that touched it is followed out, and each separate stretch is one bank's road
      const before = comp.map(([x, y]) => [y * TW + x, t[y * TW + x]]);
      for (const [x, y] of comp) t[y * TW + x] = taken(x, y) ? T_ROAD : T_WATER;      // where a place stands at the end of a causeway, the causeway's end is its doorstep
      // a tile of the old crossing with dry ground on three sides of it is no water worth bridging: it is road
      for (const [x, y] of comp) { const k = y * TW + x; if (t[k] === T_WATER && [k - 1, k + 1, k - TW, k + TW].filter(n => t[n] < T_WATER).length >= 3) t[k] = T_ROAD; }
      const lab = new Map(); let labels = 0;
      for (const [bx, by] of comp) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const sk = (by + dy) * TW + bx + dx; if (t[sk] !== T_ROAD || lab.has(sk)) continue;
        labels++; const todo = [sk];
        while (todo.length) { const k = todo.pop(); if (lab.has(k) || (t[k] !== T_ROAD && t[k] !== T_BRIDGE)) continue; lab.set(k, labels); const kx = k % TW, ky = (k - kx) / TW; for (let ey = -1; ey <= 1; ey++) for (let ex = -1; ex <= 1; ex++) if ((ex || ey) && inMap(kx + ex, ky + ey)) todo.push((ky + ey) * TW + kx + ex); }
      }
      // every line through it, both ways, shortest stretch of water first
      const lines = [];
      const tryLine = (horiz, c) => {
        const on = comp.filter(([x, y]) => (horiz ? y : x) === c).map(([x, y]) => (horiz ? x : y)).sort((u, v) => u - v);
        const wetAt = v => { const x = horiz ? v : c, y = horiz ? c : v; return inMap(x, y) && wetK(t[y * TW + x]); }, dry = ([x, y]) => inMap(x, y) && t[y * TW + x] < T_WATER;
        let past = -1;
        for (const m of on) {
          if (m <= past) continue;
          let p = m, q = m; while (wetAt(p - 1)) p--; while (wetAt(q + 1)) q++;
          past = q;
          const e1 = horiz ? [p - 1, c] : [c, p - 1], e2 = horiz ? [q + 1, c] : [c, q + 1];
          if (!dry(e1) || !dry(e2)) continue;
          lines.push({ horiz, c, a: p, b: q, e1, e2, len: q - p + 1, off: Math.abs(c - (horiz ? (y0 + y1) / 2 : (x0 + x1) / 2)) + (horiz === (x1 - x0 >= y1 - y0) ? 0 : 0.25) });
        }
      };
      for (let r = y0; r <= y1; r++) tryLine(true, r);
      for (let c = x0; c <= x1; c++) tryLine(false, c);
      lines.sort((u, v) => u.len - v.len || u.off - v.off);
      // from the foot of a bridge to the road on its bank, over dry ground: the way, and which road it came to
      const wayToRoad = ([sx, sy]) => {
        const s0 = sy * TW + sx;
        if (t[s0] === T_ROAD) return { path: [], lab: lab.get(s0) || 0, goal: s0 };
        const from = new Map([[s0, -1]]), q = [s0];
        for (let k = 0; k < q.length && k < 1500; k++) {
          const cur = q[k], cx = cur % TW, cy = (cur - cx) / TW;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy, n = ny * TW + nx;
            if (!inMap(nx, ny) || from.has(n) || t[n] >= T_WATER || t[n] === T_BRIDGE || taken(nx, ny)) continue;
            from.set(n, cur);
            if (t[n] === T_ROAD) { const path = []; for (let p = cur; p !== -1; p = from.get(p)) path.push(p); return path.length > 24 ? null : { path, lab: lab.get(n) || 0, goal: n }; }
            q.push(n);
          }
        }
        return null;
      };
      // The ground the old crossing joined: every piece of dry land that touched it, told apart by whether one can be
      // walked to from another now that it is taken up. (A causeway out to an island touched two: the shore and the island.)
      const land = new Map(); let lands = 0;
      for (const [bx, by] of comp) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const sk = (by + dy) * TW + bx + dx; if (!inMap(bx + dx, by + dy) || t[sk] >= T_WATER || land.has(sk)) continue;
        lands++; const todo = [sk];
        while (todo.length) { const k = todo.pop(); if (land.has(k) || t[k] >= T_WATER) continue; land.set(k, lands); for (const n of [k - 1, k + 1, k - TW, k + TW]) if (!land.has(n) && t[n] < T_WATER) todo.push(n); }
      }
      // Bridges are laid shortest first, each one only if it joins two pieces of ground, or two stretches of road, not
      // yet joined: until every bank the old crossing touched can be walked to from every other, and no road is left
      // ending at the water with its other half on the far side.
      const mk = n => { const h = []; for (let i = 0; i <= n; i++) h.push(i); return h; }, find = (h, i) => { while (h[i] !== i) i = h[i]; return i; };
      const hl = mk(lands), hr = mk(labels);
      let landParts = lands, roadParts = labels; const changed = [], feet = [];
      const put2 = (key, v) => { changed.push([key, t[key]]); t[key] = v; };
      for (const Ln of lines) {
        if (landParts <= 1 && roadParts <= 1) break;
        const keys = []; let open = true;
        for (let v = Ln.a; v <= Ln.b; v++) { const key = Ln.horiz ? v + Ln.c * TW : Ln.c + v * TW; keys.push(key); if (t[key] !== T_WATER) open = false; }
        if (!open) continue;                                     // it would run into a bridge already laid
        const k1 = Ln.e1[1] * TW + Ln.e1[0], k2 = Ln.e2[1] * TW + Ln.e2[0], g1 = land.get(k1) || 0, g2 = land.get(k2) || 0;
        const mark = changed.length; for (const key of keys) put2(key, T_BRIDGE);
        const w1 = wayToRoad(Ln.e1), w2 = wayToRoad(Ln.e2);
        const joinsLand = !!(g1 && g2 && find(hl, g1) !== find(hl, g2)), joinsRoad = !!(w1 && w2 && w1.lab && w2.lab && find(hr, w1.lab) !== find(hr, w2.lab));
        if (!joinsLand && !joinsRoad) { while (changed.length > mark) { const [key, was] = changed.pop(); t[key] = was; } continue; }
        for (const [w, e] of [[w1, Ln.e1], [w2, Ln.e2]]) {
          const l = w && w.lab ? w.lab : 0;
          for (const key of (w ? w.path : [])) { put2(key, T_ROAD); if (l) lab.set(key, l); }
          const ek = e[1] * TW + e[0]; if (t[ek] < T_WATER && t[ek] !== T_ROAD) { put2(ek, T_ROAD); if (l) lab.set(ek, l); }
        }
        for (const [w, e] of [[w1, Ln.e1], [w2, Ln.e2]]) if (w && w.lab) feet.push({ e, path: w.path.slice(), goal: w.goal, horiz: Ln.horiz });
        if (joinsLand) { hl[find(hl, g1)] = find(hl, g2); landParts--; }
        if (joinsRoad) { hr[find(hr, w1.lab)] = find(hr, w2.lab); roadParts--; }
      }
      const done = landParts <= 1;                               // every bank is joined: that is what must hold
      if (!done) { while (changed.length) { const [key, was] = changed.pop(); t[key] = was; } }
      else {
        // what is left of the old approach, running down to the water where the bridge used to be and stopping there,
        // is taken up again: a road that leads nowhere is grass by the next summer
        const mine = new Set(changed.map(c => c[0])), near = k => comp.some(([x, y]) => Math.abs(x - k % TW) <= 6 && Math.abs(y - Math.floor(k / TW)) <= 6);
        for (let pass = 0; pass < 10; pass++) {
          let cut = 0;
          for (const k of lab.keys()) {
            if (t[k] !== T_ROAD || mine.has(k) || !near(k) || taken(k % TW, Math.floor(k / TW))) continue;
            const kx = k % TW, ky = (k - kx) / TW; let roads = 0, wet = false; const ground = [];
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const o = t[(ky + dy) * TW + kx + dx]; if (o === T_ROAD || o === T_BRIDGE) roads++; else if (o < T_WATER) ground.push(o); if (o === T_WATER) wet = true; }
            if (roads > 1 || (pass === 0 && !wet)) continue;      // only an end, and the first to go must be at the water's edge
            t[k] = ground.length ? ground.sort((u, v) => ground.filter(g => g === v).length - ground.filter(g => g === u).length)[0] : T_GRASS; cut++;
          }
          if (!cut) break;
        }
        // A road does not run down to the water and then turn along the bank to its bridge: it makes for the bridge
        // from some way back. So on each bank the last stretch of the old road is taken up, with the piece along the
        // bank, and laid again in one line from where it left off to the foot of the bridge.
        const BACK = 9, ground = k => { const kx = k % TW, ky = (k - kx) / TW, seen = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const o = t[(ky + dy) * TW + kx + dx]; if ((dx || dy) && o < T_WATER && o !== T_ROAD && o !== T_BRIDGE) seen.push(o); } return seen.length ? seen.sort((u, v) => seen.filter(g => g === v).length - seen.filter(g => g === u).length)[0] : T_GRASS; };
        for (const F of feet) {
          const ek = F.e[1] * TW + F.e[0], along = new Set(F.path.concat(ek)), chain = [F.goal], seen = new Set([F.goal]);
          along.delete(F.goal);                                 // where the foot of the bridge is itself the old road's end
          for (let step = 0; step < BACK; step++) {
            const cur = chain[chain.length - 1], cx = cur % TW, cy = (cur - cx) / TW, near = [], far = [];
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const n = (cy + dy) * TW + cx + dx; if (t[n] !== T_ROAD || seen.has(n) || along.has(n)) continue; (dx && dy ? far : near).push(n); }
            // on along the road, away from the bridge: of the tiles that carry it on, the one furthest from the foot.
            // (A road climbing a slant lies in steps, so two or three tiles ahead may touch this one; four is a fork.)
            const cand = near.concat(far), away = k => Math.hypot(k % TW - F.e[0], Math.floor(k / TW) - F.e[1]);
            const next = cand.length && cand.length <= 3 ? cand.slice().sort((u, v) => away(v) - away(u))[0] : -1;
            if (next < 0 || taken(next % TW, Math.floor(next / TW))) break;      // the road forks here, or ends, or a place stands on it: no further back
            for (const n of near.concat(far)) seen.add(n);
            chain.push(next);
          }
          if (chain.length < 4) continue;
          const A = chain[chain.length - 1], ax = A % TW, ay = (A - ax) / TW, cells = [];
          line([[ax, ay], [F.e[0], F.e[1]]], (x, y) => { const k = y * TW + x; if (!cells.includes(k)) cells.push(k); });
          const old = new Set(chain.slice(0, -1).concat(F.path));
          if (!cells.every(k => inMap(k % TW, Math.floor(k / TW)) && !taken(k % TW, Math.floor(k / TW)) && (t[k] < T_WATER && t[k] !== T_BRIDGE))) continue;      // the straight way is under water, or over a place: it stays as it was
          for (const k of old) if (k !== ek && !cells.includes(k) && t[k] === T_ROAD) t[k] = ground(k);
          for (const k of cells) t[k] = T_ROAD;
          // and any odd tile of the old stretch left standing by itself beside the new one goes too
          for (let pass = 0; pass < 2; pass++) for (const k of seen) {
            if (k === A || k === ek || cells.includes(k) || t[k] !== T_ROAD || taken(k % TW, Math.floor(k / TW))) continue;
            const kx = k % TW, ky = (k - kx) / TW; let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && (t[(ky + dy) * TW + kx + dx] === T_ROAD || t[(ky + dy) * TW + kx + dx] === T_BRIDGE) && !cells.includes((ky + dy) * TW + kx + dx)) n++;
            if (n <= 1) t[k] = ground(k);
          }
        }
      }
      if (!done) for (const [key, was] of before) t[key] = was;      // no straight way joins them: that crossing stays as it was
    }
    // and what can be reached on foot is reckoned again, now that the crossings have moved
    reach.fill(0); reach[start] = 1; const q2 = [start];
    for (let k = 0; k < q2.length; k++) { const c = q2[k]; for (const n of [c - 1, c + 1, c - TW, c + TW]) if (!reach[n] && t[n] < T_WATER) { reach[n] = 1; q2.push(n); } }
  }
  // Lanes: a place that stands within a short walk of a road has a track worn to it. They are road like any other to
  // march on, only narrower to look at; none crosses water, and none is longer than a dozen tiles. (Laid last of the
  // roads, from places already settled, so nothing moves on their account.)
  const lane = new Uint8Array(TW * TH);
  {
    const LANE_MAX = 12, spot = (x, y) => spots.some(sp => sp.tx === x && sp.ty === y);
    for (const sp of spots) {
      const s0 = sp.ty * TW + sp.tx; if (t[s0] === T_ROAD || t[s0] === T_BRIDGE || !reach[s0]) continue;
      const from = new Map([[s0, -1]]), q = [s0]; let hit = -1;
      for (let k = 0; k < q.length && hit < 0; k++) {
        const cur = q[k], cx = cur % TW, cy = (cur - cx) / TW; let d = 0; for (let p = cur; p !== -1; p = from.get(p)) d++;
        if (d > LANE_MAX) break;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy, n = ny * TW + nx;
          if (nx < 2 || ny < 2 || nx > TW - 3 || ny > TH - 3 || from.has(n) || t[n] >= T_WATER || t[n] === T_BRIDGE || spot(nx, ny)) continue;
          from.set(n, cur);
          if (t[n] === T_ROAD) { hit = cur; break; }
          q.push(n);
        }
      }
      if (hit < 0) continue;
      let steps = 0; for (let p = hit; p !== -1 && p !== s0; p = from.get(p)) steps++;
      if (steps < 2) continue;                                  // it stands by the road already
      for (let p = hit; p !== -1 && p !== s0; p = from.get(p)) { t[p] = T_ROAD; lane[p] = 1; }
    }
  }
  // The mill road. The road south of the river crossing used to stop in a field. It goes on now: past the mill on the
  // east bank, over the river by a bridge of its own, round behind the water-mill on the far side, and along to the two
  // barns, where it ends. (Laid last of all the roads, after the places and the lanes are settled and clear of every one of them; and what lay
  // under it is remembered, so that the landmarks can be set out as if it were not there and none of them moves for it.)
  const under = new Map();
  {
    // the last of the old road, which ran on south-east past where the new one turns west and stopped there, is taken
    // up: left in, it made the turn a hairpin
    for (let y = 135; y <= 141; y++) for (let x = 119; x <= 124; x++) { const k = y * TW + x; if (t[k] === T_ROAD && !lane[k] && !spots.some(sp => sp.tx === x && sp.ty === y)) { under.set(k, T_ROAD); t[k] = T_GRASS; } }
    line(WILD_BYROAD, (x, y) => {
      const k = y * TW + x; if (x < 2 || y < 2 || x > TW - 3 || y > TH - 3 || spots.some(sp => sp.tx === x && sp.ty === y)) return;
      if (t[k] === T_ROAD || t[k] === T_BRIDGE || t[k] === T_PEAK) return;
      if (!under.has(k)) under.set(k, t[k]); t[k] = t[k] === T_WATER ? T_BRIDGE : T_ROAD;
    });
    reach.fill(0); reach[start] = 1; const q3 = [start];
    for (let k = 0; k < q3.length; k++) { const c = q3[k]; for (const n of [c - 1, c + 1, c - TW, c + TW]) if (!reach[n] && t[n] < T_WATER) { reach[n] = 1; q3.push(n); } }
  }
  // glades: here and there, deep in a wood, a patch of open grass with the trees standing all round it. (They are
  // cut after everything else is settled, so that no road, place or landmark moves on their account.)
  const glades = [];
  for (let ty = 5; ty < TH - 5; ty++) for (let tx = 5; tx < TW - 5; tx++) {
    if (glades.some(g => Math.hypot(g.tx - tx, g.ty - ty) < 14) || wildHash(tx, ty, 771) > 0.35) continue;
    let deep = true;
    for (let dy = -3; dy <= 3 && deep; dy++) for (let dx = -3; dx <= 3; dx++) if (t[(ty + dy) * TW + tx + dx] !== T_FOREST) { deep = false; break; }
    if (!deep || !reach[ty * TW + tx] || spots.some(sp => Math.hypot(sp.tx - tx, sp.ty - ty) < 6)) continue;
    glades.push({ tx, ty });
  }
  for (const g of glades) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!(dx && dy) || wildHash(g.tx + dx, g.ty + dy, 772) > 0.5) t[(g.ty + dy) * TW + g.tx + dx] = T_MEADOW;
  return (wildLandCache = { t, reach, sites, glades, lane, aqueduct, under });
}
const wildTile = (x, y) => { const tx = Math.floor(x / 10), ty = Math.floor(y / 10); return tx < 0 || ty < 0 || tx >= WILD.TW || ty >= WILD.TH ? T_PEAK : wildLand().t[ty * WILD.TW + tx]; };
const wildWalk = (x, y) => wildTile(x, y) < T_WATER;
// Which way the river runs past each stretch of it: from the fells in the north-east down to the bay. For every tile of
// river water (not the sea, not the mere) the direction of the current there, as a unit vector, by the tile's index.
let wildFlowCache = null;
function wildFlow() {
  if (wildFlowCache) return wildFlowCache;
  const L = wildLand(), { TW, TH } = WILD, flow = new Map();
  for (let ty = 1; ty < TH - 1; ty++) for (let tx = 1; tx < TW - 1; tx++) {
    if (L.t[ty * TW + tx] !== T_WATER) continue;
    let best = 1e9, dir = null, along = 0;
    for (let i = 0; i + 1 < WILD_RIVER.length; i++) {
      const [ax, ay] = WILD_RIVER[i], [bx, by] = WILD_RIVER[i + 1], vx = bx - ax, vy = by - ay, len = Math.hypot(vx, vy);
      const k = Math.max(0, Math.min(1, ((tx - ax) * vx + (ty - ay) * vy) / (len * len))), d = Math.hypot(tx - ax - vx * k, ty - ay - vy * k);
      if (d < best) { best = d; dir = [vx / len, vy / len]; along = i + k; }
    }
    // the river is two or three tiles wide; and where it comes to the bay the sea begins
    if (best <= 3.2 && along < WILD_RIVER.length - 1.15) flow.set(ty * TW + tx, dir);
  }
  return (wildFlowCache = flow);
}
// Clearings in the woods: open grass with the trees close all round. (Where the rainbow comes down.)
const wildClearings = () => wildLand().glades.map(g => ({ x: g.tx * 10 + 5, y: g.ty * 10 + 5 }));
const wildPace = (x, y) => { const k = wildTile(x, y); return k === T_ROAD || k === T_BRIDGE ? 1.25 : k === T_FOREST || k === T_HILL ? 0.7 : k === T_MARSH ? 0.55 : 1; };
// A column that finds itself standing where nobody can stand (a save made on a bridge that has since been moved) is
// set down on the nearest ground that can be walked from the town.
function wildUnstick() {
  const F = G.field; if (!F) return false;
  const L = wildLand(), ok = (x, y) => wildWalk(x, y) && L.reach[Math.floor(y / 10) * WILD.TW + Math.floor(x / 10)];
  if (ok(F.x, F.y)) return false;
  const tx0 = Math.floor(F.x / 10), ty0 = Math.floor(F.y / 10);
  for (let r = 1; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = (tx0 + dx) * 10 + 5, y = (ty0 + dy) * 10 + 5;
    if (ok(x, y)) { F.x = x; F.y = y; return true; }
  }
  return false;
}
// How dangerous the country is here: one skull by the town, five in the far corners.
function wildTier(x, y) { const d = Math.hypot(x - WILD.TOWN.x, y - WILD.TOWN.y); return d < 330 ? 1 : d < 600 ? 2 : d < 900 ? 3 : d < 1250 ? 4 : 5; }
function wildRegion(x, y) { let best = WILD_REGIONS[0], bd = 1e9; for (const r of WILD_REGIONS) { const d = Math.hypot(r.x - x, r.y - y); if (d < bd) { bd = d; best = r; } } return best.name; }

// ---------- what the family knows of it ----------
function wildMap() {
  const D = G.dynasty;
  if (!D.map) D.map = { seed: 1 + Math.floor(Math.random() * 1e9), fog: [], done: {}, seen: {}, marks: {}, story: 0, chain: {}, relics: [], cleared: 0 };
  const M = D.map;
  if (M.fog.length !== Math.ceil(WILD.FW * WILD.FH / 8)) M.fog = new Array(Math.ceil(WILD.FW * WILD.FH / 8)).fill(0);
  return M;
}
const fogAt = (fx, fy) => { if (fx < 0 || fy < 0 || fx >= WILD.FW || fy >= WILD.FH) return false; const i = fy * WILD.FW + fx; return (wildMap().fog[i >> 3] & (1 << (i & 7))) !== 0; };
const wildSeen = (x, y) => fogAt(Math.floor(x / WILD.FOG), Math.floor(y / WILD.FOG));

// The places of this house's province: the fixed ones, and forty shuffled over the sites.
const SITE_DECK = ['ruin', 'ruin', 'ruin', 'ruin', 'ruin', 'ruin', 'ruin', 'ruin', 'ruin', 'ruin', 'ruin', 'lair', 'lair', 'lair', 'lair', 'lair', 'lair', 'lair', 'lair', 'lair', 'lair',
  'camp', 'camp', 'camp', 'camp', 'camp', 'camp', 'camp', 'camp', 'camp', 'shrine', 'shrine', 'hermit', 'hermit', 'hamlet', 'hamlet', 'healer', 'healer', 'merchant', 'merchant'];
const SITE_NAMES = {
  ruin: ['A fallen wayside shrine', 'A burnt-out villa', 'A tomb, robbed long ago', 'A sealed tomb', 'A warlord\'s tomb'],
  lair: ['A wolf den', 'A boar wallow', 'A bear\'s cave', 'The lions\' ridge', 'The killing ground'],
  camp: ['A footpads\' fire', 'A robbers\' camp', 'An outlaw stockade', 'A deserters\' fort', 'The reavers\' hold'],
  shrine: 'A shrine in the wild', hermit: 'A hermit\'s cell', hamlet: 'A hidden hamlet', healer: 'A wise-woman\'s hut', merchant: 'A wandering merchant',
};
let wildSiteCache = null;
function wildSites() {
  const M = wildMap();
  if (wildSiteCache && wildSiteCache.seed === M.seed) return (bountyLive() ? wildSiteCache.list.concat(bountySite()) : wildSiteCache.list).concat(errandSites());
  const rnd = wildRng(M.seed), deck = SITE_DECK.slice();
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const list = wildLand().sites.map((s, i) => {
    const x = s.tx * 10 + 5, y = s.ty * 10 + 5, tier = wildTier(x, y), kind = deck[i % deck.length], n = SITE_NAMES[kind];
    return { id: 's' + i, kind, x, y, tier, name: Array.isArray(n) ? n[tier - 1] : n };
  });
  for (const f of WILD_FIXED) list.push({ id: f.id, kind: f.kind, x: f.tx * 10 + 5, y: f.ty * 10 + 5, tier: wildTier(f.tx * 10, f.ty * 10), name: f.name, fixed: true });
  wildSiteCache = { seed: M.seed, list };
  return (bountyLive() ? list.concat(bountySite()) : list).concat(errandSites());
}
// ---------- bounties: the Magistrate pays for a head, or a hide ----------
const BOUNTY_NAMES = {
  outlaws: ['Brennos the Flayer', 'The Widow-Maker\'s band', 'Old Three-Fingers', 'The Marsh Wolves', 'Dumnorix the Red', 'The tax-collector\'s murderers', 'The Ferrymen'],
  beast: ['The grey bear of the fells', 'A man-eating lion', 'The great boar of the downs', 'The pack that took the shepherds'],
};
const bountyLive = () => !!G.bounty && G.bounty.until >= G.day;
const bountySite = () => ({ id: 'bounty', kind: 'bounty', x: G.bounty.x, y: G.bounty.y, tier: G.bounty.tier, name: G.bounty.name, fixed: true });
// A new bounty, somewhere a little beyond what the school has faced. Posted on games days; one stands at a time.
function postBounty(force) {
  if (bountyLive() && !force) return null;
  delete wildMap().marks.bounty;
  G.bounty = null;
  if (!force && !gateOpen()) return null;
  const L = wildLand(), want = clamp(tier() + 1 + (chance(0.4) ? 1 : 0), 1, 5), sites = wildSites();
  let spot = null;
  for (let tries = 0; tries < 4000 && !spot; tries++) {
    const tx = 3 + Math.floor(Math.random() * (WILD.TW - 6)), ty = 3 + Math.floor(Math.random() * (WILD.TH - 6)), x = tx * 10 + 5, y = ty * 10 + 5;
    if (!L.reach[ty * WILD.TW + tx] || (tries < 3000 && wildTier(x, y) !== want)) continue;
    if (Math.hypot(x - WILD.TOWN.x, y - WILD.TOWN.y) < 220 || sites.some(q => Math.hypot(q.x - x, q.y - y) < 40)) continue;
    spot = { x, y };
  }
  if (!spot) return null;
  const kind = chance(0.6) ? 'outlaws' : 'beast', bt = wildTier(spot.x, spot.y);
  G.bounty = { kind, name: pick(BOUNTY_NAMES[kind]), x: spot.x, y: spot.y, tier: bt, pay: round5(40 * bt + PURSE[tier()] * 0.6), until: G.day + 20, region: wildRegion(spot.x, spot.y) };
  wildMark('bounty', 'bounty');
  log(`The Magistrate posts a bounty: ${G.bounty.pay} denarii for ${G.bounty.name}, last seen in ${G.bounty.region}. It stands for twenty days.`, 'gold');
  return G.bounty;
}
function bountyFoes(b) {
  if (b.kind === 'beast') return wildBeasts(b.tier, [['wolf'], ['boar'], ['bear'], ['lion'], ['bear']][b.tier - 1]);
  const men = wildMen(b.tier, Math.max(2, wildCount(b.tier) - 1), 3);
  men[0].name = b.name.replace(/^The |^A |'s band$/g, '').split(' ')[0];
  return men;
}

// ---------- the country made safe ----------
// A region is safe when every lair and outlaw camp in it has been dealt with. The carters pay for safe roads.
const HOSTILE_SITES = ['lair', 'camp'];
function regionTally() {
  const out = {};
  for (const q of wildSites()) { if (!HOSTILE_SITES.includes(q.kind)) continue; const r = wildRegion(q.x, q.y), o = out[r] = out[r] || { n: 0, done: 0 }; o.n++; if (siteDone(q)) o.done++; }
  return out;
}
const safeRegions = () => Object.keys((G.dynasty && G.dynasty.map && G.dynasty.map.safe) || {});
const SAFE_TOLL = 3;

// ---------- a day in camp, spent on something other than rest ----------
// Foraging: the men hunt and gather instead of resting. Coin for the purse, little rest, and now and then a hurt.
function campForage() {
  const F = G.field; if (!F) return null;
  const men = fieldParty(), t = wildTier(F.x, F.y);
  if (!men.length) { F.note = { day: G.day, ok: false, text: 'Nobody is fit to send out.' }; return null; }
  F.march = 0; fieldDay('forage');
  if (!G.field) return null;
  const coin = round5((6 + 3 * men.length) * t * rand(0.7, 1.3));
  G.denarii += coin;
  let text = `The men come back with game, hides and what the hedgerows give: worth <b class="gold num">${coin}</b> denarii.`, ok = true;
  if (t >= 3 && chance(0.15)) { const g = pick(men.filter(x => G.roster.includes(x))); if (g) { g.injury = rint(1, 2); g.hp = Math.max(1, g.hp - maxHp(g) * 0.2); text += ` <span class="bad">${g.name} met something with teeth, and is hurt for ${g.injury} day${g.injury === 1 ? '' : 's'}.</span>`; ok = false; } }
  else if (chance(0.12)) { G.roster.filter(x => !x.away).forEach(x => { x.hp = Math.min(maxHp(x), x.hp + maxHp(x) * 0.1); }); text += ' And herbs for the pot: every man is a little better for it.'; }
  G.field.note = { day: G.day, ok, text };
  save();
  return coin;
}
// Scouting: the day is spent looking at the country. The fog lifts for a long way round, further with a scout.
function campScout() {
  const F = G.field; if (!F) return null;
  F.march = 0; fieldDay('scout');
  if (!G.field) return null;
  const M = wildMap(), r = 300 + 100 * staffLvl('scout'), before = Object.keys(M.seen).length;
  for (let dy = -r; dy <= r; dy += 60) for (let dx = -r; dx <= r; dx += 60) if (Math.hypot(dx, dy) <= r) wildReveal(G.field.x + dx, G.field.y + dy);
  const found = Object.keys(M.seen).length - before;
  G.field.note = { day: G.day, ok: true, text: found ? `From the high ground the country opens out. <b class="gold">${found} new place${found === 1 ? '' : 's'}</b> on the map.` : 'From the high ground the country opens out. Nothing new in it, but you know the lie of it now.' };
  save();
  return found;
}
const siteById = id => wildSites().find(s => s.id === id) || null;
const siteDone = s => !!wildMap().done[s.id];
// Is there anything to do here now? The fixed places wait for their moment: a fighter's journey, a clue followed.
function siteLive(s) {
  if (siteDone(s)) return false;
  const M = wildMap();
  if (QUEST_SITE[s.kind] || s.journey) return !!questAt(s);
  if (s.kind === 'deserter') return M.story === 1;
  if (s.kind === 'battlefield') return M.story === 2;
  if (s.kind === 'chief') return M.story === 3;
  if (s.kind === 'barrow') return M.story === 4;
  if (s.id === 'cacheA') return M.chain.map === 1;
  if (s.id === 'cacheB') return M.chain.word === 1;
  if (s.kind === 'herb') return M.chain.herb === 1;
  if (s.kind === 'hermit' && M.chain.herb === 2 && M.chain.hermit === s.id) return true;
  return true;
}
// Shown on the map: places you have come near, and anything a clue has marked, even through the fog.
const siteShown = s => !!wildMap().marks[s.id] || (!!wildMap().seen[s.id] && (!s.fixed || siteLive(s) || siteDone(s)));
function wildMark(id, label) { wildMap().marks[id] = label || 1; }

// Lifts the fog round a spot and notes any place now in sight. Returns true if anything new was uncovered.
function wildReveal(x, y) {
  const M = wildMap(), F = WILD.FOG, r = WILD.SEE * (1 + 0.2 * facLvl('eagle'));      // an eagle up sees further than a man on a mule
  let changed = false;
  for (let fy = Math.floor((y - r) / F); fy <= Math.floor((y + r) / F); fy++) for (let fx = Math.floor((x - r) / F); fx <= Math.floor((x + r) / F); fx++) {
    if (fx < 0 || fy < 0 || fx >= WILD.FW || fy >= WILD.FH) continue;
    if (Math.hypot(fx * F + F / 2 - x, fy * F + F / 2 - y) > r) continue;
    const i = fy * WILD.FW + fx;
    if (!(M.fog[i >> 3] & (1 << (i & 7)))) { M.fog[i >> 3] |= 1 << (i & 7); changed = true; }
  }
  if (changed) for (const s of wildSites()) if (!M.seen[s.id] && Math.hypot(s.x - x, s.y - y) < r) M.seen[s.id] = 1;
  return changed;
}
const wildExplored = () => { const f = wildMap().fog; let n = 0; for (const b of f) for (let k = 0; k < 8; k++) if (b & (1 << k)) n++; return n / (WILD.FW * WILD.FH); };

// ---------- going out and coming home ----------
const gateOpen = () => G.day > GAMES_EVERY || G.tally.wins + G.tally.losses > 0;
const fieldParty = () => G.roster.filter(g => !g.away && g.injury <= 0).sort((a, b) => power(b) - power(a)).slice(0, WILD.PARTY);
function wildEnter() {
  if (G.field) return true;
  if (!gateOpen() || !G.roster.some(g => !g.away)) return false;
  wildMap();
  G.field = { x: WILD.TOWN.x + 26, y: WILD.TOWN.y, armed: false, walked: 0, next: 500 + Math.random() * 400, at: null, fight: null, days: 0, packs: [] };
  wildPacks();
  wildReveal(G.field.x, G.field.y);
  log('The school marches out through the east gate.');
  save();
  return true;
}
function wildLeave() {
  if (!G.field) return;
  const days = G.field.days;
  G.field = null;
  log(days ? `The school comes home through the east gate after ${days} day${days === 1 ? '' : 's'} in the country.` : 'The school comes back in through the east gate.');
  if (wildMap().story === 5) raiseEvent('eagleHome', {});
  save();
}
// Wolves and outlaw patrols that roam where you can see them. A new lot each time you march out.
function wildPacks() {
  const L = wildLand(), rnd = Math.random, out = [];
  for (let tries = 0; out.length < 14 && tries < 4000; tries++) {
    const tx = 3 + Math.floor(rnd() * (WILD.TW - 6)), ty = 3 + Math.floor(rnd() * (WILD.TH - 6));
    if (!L.reach[ty * WILD.TW + tx]) continue;
    const x = tx * 10 + 5, y = ty * 10 + 5;
    if (Math.hypot(x - WILD.TOWN.x, y - WILD.TOWN.y) < 260 || out.some(p => Math.hypot(p.x - x, p.y - y) < 160)) continue;
    out.push({ id: ++G.nextId, kind: rnd() < 0.55 ? 'wolves' : 'patrol', x, y, hx: x, hy: y, tx: x, ty: y, wait: 0, tier: wildTier(x, y) });
  }
  G.field.packs = out;
}

// A day passes in the country. `how`: 'march' (a place visited: everyone is the wearier for it) or 'camp' (rest).
// ---------- the day's march ----------
const MARCH_DAY = 450;       // how far the column goes in a day over open ground, in map units
const marchDay = () => MARCH_DAY * (1 + 0.12 * facLvl('stables'));      // further with mules and a wagon
// What a stretch of walking costs, in open-ground units: roads are quicker, rough ground slower.
const marchCost = (x0, y0, x1, y1) => Math.hypot(x1 - x0, y1 - y0) / wildPace((x0 + x1) / 2, (y0 + y1) / 2);
// The way the column would take from one spot to another: not the shortest line, but the one a man leading mules
// would choose. It keeps to a road where there is one, goes round a wood or a bog sooner than through it, and never
// tries the water. What each kind of ground costs to cross, a tile: a road is cheaper than its speed alone would make
// it, so that the column will go some way round to stay on one.
const ROUTE_COST = (() => { const c = []; c[T_GRASS] = 1; c[T_MEADOW] = 1; c[T_SAND] = 1.05; c[T_FOREST] = 1.45; c[T_HILL] = 1.45; c[T_MARSH] = 1.85; c[T_ROAD] = 0.6; c[T_BRIDGE] = 0.6; return c; })();
function wildRoute(x0, y0, x1, y1, cost) {
  cost = cost || ROUTE_COST;
  const L = wildLand(), w = WILD.TW, hgt = WILD.TH, a = Math.floor(y0 / 10) * w + Math.floor(x0 / 10), b = Math.floor(y1 / 10) * w + Math.floor(x1 / 10);
  if (L.t[b] >= T_WATER || a === b) return a === b ? [{ x: x1, y: y1 }] : null;
  const dist = new Float32Array(w * hgt).fill(Infinity), from = new Int32Array(w * hgt).fill(-1), done = new Uint8Array(w * hgt);
  // a small heap of [cost, tile]
  const heap = [], push = (c, n) => { let i = heap.length; heap.push([c, n]); while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  dist[a] = 0; from[a] = a; push(0, a);
  while (heap.length) {
    const [d, c] = pop(); if (done[c]) continue; done[c] = 1; if (c === b) break;
    const cx = c % w, cy = (c - cx) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx, ny = cy + dy, n = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= hgt || done[n] || L.t[n] >= T_WATER) continue;
      if (dx && dy && (L.t[cy * w + nx] >= T_WATER || L.t[ny * w + cx] >= T_WATER)) continue;      // not across the corner of a pond
      const nd = d + (dx && dy ? 1.414 : 1) * (cost[L.t[n]] || 1);
      if (nd < dist[n]) { dist[n] = nd; from[n] = c; push(nd, n); }
    }
  }
  if (from[b] < 0) return null;
  const pts = [{ x: x1, y: y1 }];
  for (let c = from[b]; c !== a; c = from[c]) pts.push({ x: (c % w) * 10 + 5, y: Math.floor(c / w) * 10 + 5 });
  return pts.reverse();
}
function pathCost(x, y, path) { let c = 0; for (const p of path) { c += marchCost(x, y, p.x, p.y); x = p.x; y = p.y; } return c; }
// How many nights will pass on the way, given what is left of today's march.
function marchDays(cost) { const left = marchDay() - ((G.field && G.field.march) || 0); return cost <= left ? 0 : Math.ceil((cost - left) / marchDay()); }
// The column has walked d units over ground of this pace. True when that ended the day: night falls, and a day passes.
function wildMarched(d, pace) {
  const F = G.field;
  if (!F) return false;
  F.march = (F.march || 0) + d / (pace || 1);
  if (F.march < marchDay()) return false;
  F.march -= marchDay();
  fieldDay('march');
  return true;
}

function fieldDay(how) {
  if (!G.field) return;
  G.field.mode = how; G.field.days++;
  endDay();
  if (G.field) G.field.mode = null;
}
// What a day outside the walls does to one man. No yard, no baths, no infirmary: nothing is learned, and wounds mend slowly.
function wildDayFor(g) {
  const camp = G.field.mode === 'camp', mh = maxHp(g);
  if (g.injury > 0) { g.injury -= 1; if (g.injury <= 0) { g.injury = 0; log(`${g.name} is fit to fight again.`); } }
  if (camp) { g.fatigue -= 24; g.hp += mh * (0.14 + 0.04 * staffLvl('cook')); g.morale += 1; }
  else if (G.field.mode === 'forage') { g.fatigue -= 6; g.hp += mh * 0.05; }
  else if (G.field.mode === 'scout') { g.fatigue -= 14; g.hp += mh * 0.08; }
  else { g.fatigue += 11 - statSum(g) * 0.06; g.hp += mh * 0.04; }
  const target = Math.min(100, moraleBase(G.ration) - 6);
  g.morale += clamp(target - g.morale, -3, 3);
  g.fatigue = clamp(g.fatigue, 0, 100);
  g.morale = clamp(g.morale, g.traits.includes('atpeace') ? 60 : g.traits.includes('steady') ? 50 : 0, 100);
  g.hp = clamp(g.hp, 1, mh);
}

// ---------- who is waiting out there ----------
const WILD_BUDGET = [16, 22, 30, 39, 48];
const beastKinds = (tier, extra) => [['wolf', 'wolf'], ['boar', 'boar', 'wolf'], ['bear', 'bear', 'wolf'], ['lion', 'lion', 'lion'], ['lion', 'lion', 'lion', 'bear', 'bear']][tier - 1].concat(extra || []);
function wildBeasts(tier, extra) {
  return beastKinds(tier, extra).map(k => makeBeast(k, WILD_BUDGET[tier - 1]));
}
function wildMen(tier, n, boost) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const g = makeEnemy(WILD_BUDGET[tier - 1] + (boost || 0), clamp(tier - 1, 0, 4));
    g.gear = null; g.outlaw = true;
    out.push(g);
  }
  return out;
}
const wildCount = tier => [2, 3, 5, 6, 8][tier - 1];
// A band that roams the map (see wildPacks): what its beasts are, or how many men it has; how many that makes, which is
// how many of them are drawn on the map; and the band itself, made ready to fight.
const packBeasts = p => beastKinds(Math.min(p.tier, 2), p.tier > 2 ? ['wolf', 'wolf'] : []);
const packSize = p => p.kind === 'wolves' ? packBeasts(p).length : Math.max(2, wildCount(p.tier) - 2);
const packFoes = p => p.kind === 'wolves' ? packBeasts(p).map(k => makeBeast(k, WILD_BUDGET[Math.min(p.tier, 2) - 1])) : wildMen(p.tier, packSize(p));
// Sets a fight waiting; the map screen starts it. `win` names what victory brings (see WILD_WINS).
// How likely the school is to learn what it faces before it commits: a scout counts heads, and an eagle sees over walls.
const seeOdds = () => clamp(0.5 + 0.1 * staffLvl('scout') + 0.15 * facLvl('eagle'), 0, 0.95);
// Whoever is waiting at a place is settled the moment the school looks at it, so that what is counted is what is fought.
// Says, in a sentence, how the two sides stand; or, if they could not be counted, only how strong the school is.
function sizeUp(c, make) {
  c = c || {};
  if (!c._foes) { c._foes = make(); c._see = chance(seeOdds()); }
  const mine = yours(), th = Math.round(c._foes.reduce((n, e) => n + power(e), 0)), n = c._foes.length;
  if (!c._see) return ` Your fit men come to strength <b class="num">${mine}</b>. How strong they are cannot be told from here${facLvl('eagle') ? '' : '; a bird overhead would see more'}.`;
  const word = th > mine * 1.25 ? 'They are much the stronger' : th > mine * 1.05 ? 'They are the stronger' : th < mine * 0.6 ? 'They are no match for you' : th < mine * 0.9 ? 'You are the stronger' : 'It is an even thing';
  return ` ${facLvl('eagle') ? 'The eagle has been over them' : 'They can be counted'}: ${n === 1 ? 'one' : n}, of strength <b class="num ${th > mine ? 'bad' : 'good'}">${th}</b> against your <b class="num">${mine}</b>. ${word}.`;
}
const chiefFoes = () => { const foes = wildMen(4, 7, 4), boss = makeEnemy(58, 4); boss.name = 'Crixos One-Eye'; boss.gear = null; boss.outlaw = true; boss.traits = ['brute', 'ironhide', 'killer', 'lionheart']; boss.hp = maxHp(boss); return foes.concat(boss); };
const barrowFoes = () => { const foes = wildMen(5, 6, 6); foes.forEach(f => { f.traits = [...new Set(f.traits.concat('lionheart'))]; }); return foes.concat(wildBeasts(5).slice(0, 3)); };
function wildFight(title, foes, backdrop, win, o) {
  { const pe = G.pendingEvent, held = pe && pe.c && pe.c._foes; if (held && held.length) { foes = held; delete pe.c._foes; } }      // those who were counted are those who are met
  G.field.fight = Object.assign({ title, foes, backdrop, win, sid: null, day: false, beasts: foes.every(f => f.beast) }, o || {});
  return 'To arms.';
}

// ---------- spoils ----------
const RELICS = {
  crest:   { name: 'The centurion\'s crest', slot: 'head', r: 5, note: 'Worn by the last officer of the Seventeenth. Telling blows against him are a further 15% less likely.', add: z => { z.critRes += 0.15; } },
  cuirass: { name: 'A legate\'s cuirass', slot: 'chest', r: 6, note: 'Silvered scale, made for a man who expected to be looked at. Takes a further 1.5 off every blow.', add: z => { z.armor += 1.5; } },
  pelt:    { name: 'Pelt of the fell lion', slot: 'shoulders', r: 5, note: 'Lighter than any pauldron. He dodges 4% more.', add: z => { z.dodge += 0.046; } },
  greaves: { name: 'The runner\'s greaves', slot: 'legs', r: 5, note: 'Bronze beaten thin as a leaf. He moves a further 6% faster.', add: z => { z.speed += 0.06; } },
  vambrace:{ name: 'The hill-king\'s arm-ring', slot: 'arms', r: 6, note: 'Gold over iron. A further 6% block with a shield.', add: z => { z.block += 0.06; } },
};
function wildRelic(key) {
  const M = wildMap(), k = key || Object.keys(RELICS).find(r => !M.relics.includes(r) && r !== 'crest' && r !== 'vambrace' && !RELICS[r].quest);      // the pieces people send you for are not found by chance
  if (!k) return null;
  const it = makeItem(RELICS[k].slot, RELICS[k].r);
  it.relic = k; M.relics.push(k); G.armoury.push(it);
  return it;
}
// A piece better than the smith would sell this far out.
function wildGear(tier) {
  const slot = pick(SLOTS), r = clamp(tier + rint(1, 2), 1, 6), cls = G.roster.length ? pick(G.roster).cls : pick(Object.keys(CLASSES));
  const it = makeItem(slot, r, cls);
  G.armoury.push(it);
  return it;
}
const coinFor = (base, tier) => round5(base * tier * rand(0.8, 1.25) * (G.roster.some(g => !g.away && g.traits.includes('gravewise')) && base >= 40 ? 1.5 : 1));
function learn(trait, p, lines) {
  for (const g of fieldParty()) if (!g.traits.includes(trait) && chance(p)) { g.traits.push(trait); addStory(g, `Learned: ${TRAITS[trait].name}.`); lines.push(`<span class="gold"><b>${g.name}</b> has learned something out here: ${TRAITS[trait].name}.</span>`); return; }
}
function siteFinish(sid) {
  const M = wildMap();
  if (!sid || M.done[sid]) return;
  M.done[sid] = G.day; M.cleared++; delete M.marks[sid];
  const q = siteById(sid);
  if (q && HOSTILE_SITES.includes(q.kind)) {                 // the last of them in this country: its roads are safe
    const r = wildRegion(q.x, q.y), t = regionTally()[r];
    M.safe = M.safe || {};
    if (t && t.done >= t.n && !M.safe[r]) { M.safe[r] = G.day; M.justSafe = r; G.fame += 10; favor('guild', 5); log(`${r} is made safe: no lair or outlaw camp is left in it. The carters will pay ${SAFE_TOLL} denarii a day for the roads.`, 'gold'); }
  }
}
// The line for the report when a region has just been made safe.
function safeLine(lines) { const M = wildMap(); if (M.justSafe) { lines.push(`<span class="gold"><b>${M.justSafe}</b> is safe: nothing that bites or robs is left in it. The carters' guild will pay you <b class="num">${SAFE_TOLL}</b> denarii a day for the roads, and it is worth <b class="num">+10</b> fame.</span>`); delete M.justSafe; } }

// What winning a fight in the wild brings. Each returns the lines of the report.
const WILD_WINS = {
  lair(F) {
    const s = siteById(F.sid), c = coinFor(22, s.tier), f = 2 * s.tier, lines = [`The hides and teeth will fetch <b class="gold num">${c}</b> denarii. Word of it is worth <b class="num">+${f}</b> fame.`];
    G.denarii += c; G.fame += f; learn('beastslayer', 0.35, lines); siteFinish(s.id); safeLine(lines);
    return lines;
  },
  camp(F) {
    const s = siteById(F.sid), c = coinFor(55, s.tier), lines = [`Their plunder comes to <b class="gold num">${c}</b> denarii. The Magistrate pays for outlaws' heads, and the Guild's carters will sleep easier.`];
    G.denarii += c; favor('magistrate', 2 + s.tier); favor('guild', 2); G.fame += 3 * s.tier;
    if (chance(0.3 + 0.1 * s.tier)) { const it = wildGear(s.tier); lines.push(`In the leader's tent: ${itemName(it)}, now in your armoury.`); }
    learn('reaver', 0.3, lines); siteFinish(s.id); safeLine(lines);
    const M = wildMap();
    if (!M.chain.word && s.tier >= 2) { M.chain.word = 1; wildMark('cacheB', 'dig'); lines.push('<span class="gold">One of them, dying, buys a drink of water with a secret: where the band buried its strongbox, by the lower river road. It is marked on your map.</span>'); }
    return lines;
  },
  guardians(F) {                         // whatever was woken in a tomb
    const s = siteById(F.sid), lines = ruinLoot(s, 1.6);
    siteFinish(s.id);
    return lines;
  },
  bounty(F) {
    const b = G.bounty, M = wildMap();
    if (!b) return ['The ground is yours.'];
    const f = 4 * b.tier, lines = [`Proof enough for any magistrate. The bounty is <b class="gold num">${b.pay}</b> denarii, and the town will hear of it: <b class="num">+${f}</b> fame.`];
    G.denarii += b.pay; G.fame += f; favor('magistrate', 3 + b.tier); M.bounties = (M.bounties || 0) + 1;
    if (b.kind === 'outlaws' && chance(0.35)) { const it = wildGear(b.tier); lines.push(`Among their things: ${itemName(it)}, now in your armoury.`); }
    learn(b.kind === 'beast' ? 'beastslayer' : 'reaver', 0.3, lines);
    delete M.marks.bounty; G.bounty = null;
    return lines;
  },
  // men who stopped the column and lost by it: what they carried is yours. (Two things on the road name their fight
  // this way; with no answer for it here, winning one stopped the game dead on the last screen of the fight.)
  ambush(F) { return WILD_WINS.pack(F); },
  pack(F) { const c = coinFor(8, F.tier || 1), lines = [F.beasts ? `Pelts worth <b class="gold num">${c}</b> denarii.` : `Their purses hold <b class="gold num">${c}</b> denarii.`]; G.denarii += c; G.fame += F.tier || 1; return lines; },
  slavers(F) {
    const g = byId(F.g); siteFinish('slavers');
    if (g && g.quest) raiseEvent('questVillage', { g: g.id, cost: journeyCost(g) });
    return ['The camp is ash.'];
  },
  // a journey that ended in a fight at a landmark: now the choice
  journey(F) {
    const g = byId(F.g), Q = questDef(g);
    if (!Q) return ['It is done, though the man it was done for is not here to see it.'];
    raiseEvent(Q.finale, { g: g.id, cost: F.cost || journeyCost(g) });
    return [Q.won ? Q.won(g) : 'It is done.'];
  },
  battlefield() {
    const M = wildMap(); M.story = 3; siteFinish('battlefield'); wildMark('chief', 'eagle');
    return ['Among the scavengers\' loot is a centurion\'s helmet, stripped of its crest. One of them, to save his neck, says who wears that crest now: <b>Crixos One-Eye</b>, who keeps a stockade in the Blackmere and calls himself a legate.', '<span class="gold">One-Eye\'s stockade is marked on your map.</span>'];
  },
  chief() {
    const M = wildMap(), it = wildRelic('crest'); M.story = 4; siteFinish('chief'); wildMark('barrow', 'eagle');
    G.denarii += 400; favor('magistrate', 10); G.fame += 20;
    return ['One-Eye is dead, and <b>the centurion\'s crest</b> is in your armoury with 400 denarii of his hoard.', 'Nailed over his chair was the eagle\'s bare staff. A prisoner in his cellar, once a standard-bearer\'s boy, says the tribes carried the eagle itself north as a grave-gift, to <b>the hill-king\'s barrow</b> at the end of the fell road.', '<span class="gold">The barrow is marked on your map. Nothing in this province is guarded harder.</span>'];
  },
  barrow() {
    const M = wildMap(), it = wildRelic('vambrace'); M.story = 5; siteFinish('barrow'); G.fame += 40;
    return ['Behind the last door, on the breast of a king dead forty years, lies <b>the eagle of the Seventeenth</b>: gilt gone green, one wing bent, the thunderbolt still in its claws.', 'The <b>hill-king\'s arm-ring</b> is in your armoury.', '<span class="gold">Carry the eagle home. What becomes of it is for you to say.</span>'];
  },
};
// What a ruin or tomb gives up. `rich` is more for the bold.
function ruinLoot(s, rich) {
  const M = wildMap(), c = coinFor(40 * rich, s.tier), lines = [`Grave goods and old silver: <b class="gold num">${c}</b> denarii.`];
  G.denarii += c;
  if (chance(0.25 + 0.1 * s.tier * rich)) { const it = wildGear(s.tier); lines.push(`And ${itemName(it)}, in better state than it has any right to be. It is in your armoury.`); }
  if (s.tier >= 3 && chance(0.3 * rich)) { const it = wildRelic(); if (it) lines.push(`<span class="gold">Wrapped in oiled cloth: <b>${itemName(it)}</b>.</span> <span class="dim">${RELICS[it.relic].note}</span>`); }
  if (M.story === 0 && (s.tier >= 2 || M.cleared >= 3)) {
    M.story = 1; wildMark('deserter', 'eagle');
    lines.push('<span class="gold">Under the grave goods is a soldier\'s wax tablet, forty years old: a letter never sent, from a man of the Seventeenth Legion. It speaks of the legion\'s last march into the fells, and of a comrade "who ran, and lives yet by the Greywood road, and will not speak of the eagle."</span>', '<span class="gold">An old soldier\'s hut is marked on your map.</span>');
  } else if (!M.chain.map && chance(0.4)) {
    M.chain.map = 1; wildMark('cacheA', 'dig');
    lines.push('<span class="gold">Scratched inside the lid is a map, in a robber\'s hand, of a place on the northern shore. It is marked on yours.</span>');
  }
  learn('gravewise', 0.25, lines);
  return lines;
}

// After a fight in the wild: who lived, who did not, and what it earned. Returns { win, lines }.
function applyWildResult(B) {
  const F = G.field.fight, mine = B.fighters.filter(f => f.team === 0), foes = B.fighters.filter(f => f.team === 1), win = B.winner === 0, lines = [], dead = [];
  for (const f of foes) if (f.fate === 'dead' && f.downedBy && f.downedBy.team === 0) { f.downedBy.g.kills++; f.downedBy.g.xp++; }
  for (const f of mine) {
    const g = f.g;
    g.fatigue = clamp(g.fatigue + 18, 0, 100);
    STATS.forEach(s => addProg(g, s, win ? 0.8 : 0.5));
    g.xp += win ? 3 : 1;
    if (f.fate === 'dead') { dead.push(g); lines.push(`<span class="bad"><b>${g.name}</b> dies out here, a long way from the sand.</span>`); continue; }
    if (f.fate) {
      g.hp = Math.max(1, Math.round(maxHp(g) * 0.12));
      g.injury = Math.round(rint(3, 6) * (g.traits.includes('frail') ? 1.5 : 1)); addScar(g, F.beasts ? 'claw' : 'deep');
      lines.push(`<b>${g.name}</b> is carried from the field alive. Wounded for ${g.injury} days.`);
    } else {
      g.hp = Math.max(1, Math.round(f.hp));
      if (f.hamstrung || f.armWound) { g.injury = rint(1, 2); addScar(g, f.armWound ? 'arm' : 'cut'); lines.push(`<b>${g.name}</b> carries a wound away. Resting for ${g.injury} day${g.injury === 1 ? '' : 's'}.`); }
    }
    g.morale = clamp(g.morale + (win ? 6 : -8), 0, 100);
    addStory(g, win ? `Fought in the wild: ${F.title.toLowerCase()}.` : `Was beaten in the wild: ${F.title.toLowerCase()}.`);
  }
  for (const g of dead) {
    G.roster = G.roster.filter(x => x !== g); departed(g, 'dead');
    G.fallen.push({ name: g.name, cls: g.cls, wins: g.wins, day: G.day, by: F.beasts ? 'beasts in the wild' : 'outlaws in the wild' });
    log(`${g.name} the ${CLASSES[g.cls].name} died in the wild (${g.wins} victories).`, 'bad');
  }
  if (dead.length) G.roster.forEach(g => { g.morale = clamp(g.morale - 8, 0, 100); });
  for (const f of mine) if (G.roster.includes(f.g) && checkRank(f.g)) { addStory(f.g, `Rose to the rank of ${RANKS[f.g.rank].name}.`); lines.push(`<span class="gold"><b>${f.g.name}</b> rises to the rank of ${RANKS[f.g.rank].name} and may learn a perk.</span>`); }
  if (win) {
    F.res = { time: B.time, down: mine.filter(f => f.fate).length, n: mine.length };      // how it went: some things are paid for by how well they were done
    lines.push(...(WILD_WINS[F.win] || WILD_WINS.pack)(F));      // a fight is never left without an ending, whatever it was called
    // a beaten outlaw who lived may be worth keeping
    const live = foes.find(f => f.fate === 'spared' && f.g.outlaw);
    if (live && F.win === 'camp' && G.roster.length < capacity()) raiseEvent('wCaptive', { g: live.g });
    log(`Victory in the wild: ${F.title.toLowerCase()}.`, 'good');
  } else {
    lines.push('<span class="dim">You are driven off. Whatever is here will still be here when you come back stronger.</span>');
    log(`Driven off in the wild: ${F.title.toLowerCase()}.`, 'bad');
  }
  if (F.pack) {                          // a roaming band, met in the open: win or lose, it is gone afterwards
    G.field.packs = G.field.packs.filter(p => p.id !== F.pack);
    if (!win && !F.beasts) { const loss = Math.min(Math.max(0, G.denarii), round5(Math.max(0, G.denarii) * 0.1)); G.denarii -= loss; if (loss) lines.push(`They go through the baggage and take <b class="bad num">${loss}</b> denarii.`); }
  }
  const day = F.day;
  G.field.fight = null;
  if (houseEmpty()) G.over = 'empty';
  if (day && !G.over) fieldDay('march');
  save();
  return { win, lines };
}

// ---------- journeys of your fighters, now places to walk to ----------
const QUEST_SITE = { quarry: 'brother', slavers: 'village', vow: 'shrine', master: 'master' };
const questPlace = q => Object.keys(QUEST_SITE).find(k => QUEST_SITE[k] === q);
// The fighter whose journey ends at this place, if he is with the school.
const questAt = s => G.roster.find(g => g.quest && !g.away && (s.journey ? g.id === s.journey : g.quest.id === QUEST_SITE[s.kind])) || null;
const journeyFight = c => { const g = byId(c.g), Q = questDef(g); return site(c).kind === 'slavers' || !!(Q && Q.marks && Q.foes); };
const journeyCost = g => round5((80 + tier() * 70) * (g.quest && g.quest.heard ? 0.75 : 1));      // a lanista who has listened knows what he is walking into

// ---------- what you find when you walk up to a place ----------
const site = c => siteById(c.sid) || { name: 'this place', tier: 1, kind: '' };
const skulls = t => '☠'.repeat(t);
const canFightNow = () => fieldParty().length > 0;
const aDay = () => { fieldDay('march'); };
const leaveIt = { label: () => 'Leave it for now', run: () => 'You leave it alone and march on. You can come back another time.' };
const wildCan = kind => () => !!G.field && wildSites().some(s => s.kind === kind);
const wildMake = kind => () => ({ sid: wildSites().find(s => s.kind === kind).id });
const strength = foes => Math.round(foes.reduce((n, f) => n + power(f), 0));
const yours = () => Math.round(fieldParty().reduce((n, g) => n + power(g), 0));

const WILD_EVENTS = {
  wLair: {
    title: 'A den of wild beasts', can: wildCan('lair'), make: wildMake('lair'),
    text: c => `<b>${site(c).name}</b> <span class="bad">${skulls(site(c).tier)}</span>. Dangerous animals live here. They have been killing sheep, and lately people too. If you attack, every fit man you have fights together.${sizeUp(c, () => wildBeasts(site(c).tier))} The fight will take the rest of the day.`,
    opts: [
      { label: () => 'Attack the beasts', ok: canFightNow, run: c => { const s = site(c); return wildFight(s.name, wildBeasts(s.tier), s.tier >= 3 ? 'rock' : 'forest', 'lair', { sid: s.id, day: true }); } },
      leaveIt,
    ],
  },
  wCamp: {
    title: 'An outlaw camp', can: wildCan('camp'), make: wildMake('camp'),
    text: c => `<b>${site(c).name}</b> <span class="bad">${skulls(site(c).tier)}</span>. About ${['two', 'three', 'five', 'six', 'eight'][site(c).tier - 1]} armed outlaws are camped here. Their lookout has already seen you, and they will not talk.${sizeUp(c, () => wildMen(site(c).tier, wildCount(site(c).tier)))} The fight will take the rest of the day.`,
    opts: [
      { label: () => 'Attack the camp', ok: canFightNow, run: c => { const s = site(c); return wildFight(s.name, wildMen(s.tier, wildCount(s.tier)), 'camp', 'camp', { sid: s.id, day: true }); } },
      leaveIt,
    ],
  },
  wBounty: {
    title: 'The bounty target', can: () => !!G.field, make: () => { if (!bountyLive()) postBounty(true); return {}; },
    text: c => { const b = G.bounty; return `<b>${b.name}</b> <span class="bad">${skulls(b.tier)}</span>. ${b.kind === 'beast' ? 'You have found the beast the Magistrate wants killed. It has been killing animals and people.' : 'You have found the outlaws the Magistrate wants dead. They have seen you, and they know why you have come.'} The Magistrate will pay <b class="gold num">${b.pay}</b> denarii when you bring proof.${sizeUp(c, () => bountyFoes(G.bounty))} The fight will take the rest of the day.`; },
    opts: [
      { label: () => 'Fight for the bounty', ok: canFightNow, run: () => { const b = G.bounty; return wildFight(b.name, bountyFoes(b), b.kind === 'beast' ? 'forest' : 'camp', 'bounty', { tier: b.tier, day: true }); } },
      leaveIt,
    ],
  },
  wRuin: {
    title: 'An old ruin', can: wildCan('ruin'), make: wildMake('ruin'),
    text: c => `<b>${site(c).name}</b> <span class="bad">${skulls(site(c).tier)}</span>. Nobody has been here for a long time, and there may be valuables inside. Searching it will take the rest of the day.`,
    opts: [
      { label: () => 'Search carefully (safe)', run: c => { const s = site(c), lines = ruinLoot(s, 1); siteFinish(s.id); aDay(); return lines.join(' '); } },
      { label: () => 'Break in by force (more loot; risk of a fight or an injury)', run: c => {
        const s = site(c);
        if (chance(0.25 + 0.08 * s.tier) && canFightNow()) return wildFight(s.name, s.tier >= 3 ? wildMen(s.tier, wildCount(s.tier) - 1) : wildBeasts(s.tier), 'ruin', 'guardians', { sid: s.id, day: true });
        const lines = ruinLoot(s, 1.6);
        if (chance(0.3)) { const g = pick(G.roster.filter(x => !x.away)); if (g) { g.injury = Math.max(g.injury, rint(2, 4)); addScar(g, 'cut'); lines.push(`Part of the ruin collapses on <b>${g.name}</b>. He is injured, and will be out for ${g.injury} days.`); } }
        siteFinish(s.id); aDay();
        return lines.join(' ');
      } },
      leaveIt,
    ],
  },
  wShrine: {
    title: 'A forgotten shrine', can: wildCan('shrine'), make: () => Object.assign(wildMake('shrine')(), { cost: 30 + 15 * wildTier(G.field.x, G.field.y) }),
    text: c => `<b>${site(c).name}</b>. An old altar stands beside a spring, and nobody looks after it any more. Your men have gone quiet. You could make an offering of ${c.cost} denarii here. Stopping will take the rest of the day.`,
    opts: [
      { label: c => `Make the offering (${c.cost} denarii; morale +15, one man blessed)`, ok: c => G.denarii >= c.cost, run: c => {
        const s = site(c), men = G.roster.filter(g => !g.away), g = men.slice().sort((a, b) => a.morale - b.morale)[0];
        G.denarii -= c.cost; men.forEach(x => { x.morale = clamp(x.morale + 15, 0, 100); });
        if (g && !g.traits.includes('blessed')) { g.traits.push('blessed'); addStory(g, 'Was blessed at a shrine in the wild.'); }
        siteFinish(s.id); aDay();
        return `You make the offering. Every man with you gains 15 morale. ${g ? `<b>${g.name}</b>, whose morale was lowest, gains the trait ${TRAITS.blessed.name}: the crowd will spare him more often when he falls.` : ''}`;
      } },
      { label: () => 'Let the men pray, but give nothing (morale +6)', run: c => { const s = site(c); G.roster.forEach(x => { if (!x.away) x.morale = clamp(x.morale + 6, 0, 100); }); siteFinish(s.id); aDay(); return 'Your men pray at the shrine, and you give nothing. Every man with you gains 6 morale.'; } },
      leaveIt,
    ],
  },
  wHermit: {
    title: 'An old fighter living alone', can: wildCan('hermit'), make: wildMake('hermit'),
    text: c => {
      const M = wildMap();
      if (M.chain.herb === 2 && M.chain.hermit === c.sid) return `You give the old man the mereswort he asked for. He smells it, and for the first time he looks pleased. "Good," he says. "Now I will train your men properly."`;
      return `<b>${site(c).name}</b>. A thin old man lives here alone. He fought in arenas for thirty years, and he thinks your men's footwork is poor. He offers to train them for a day, for nothing. He says he would teach them much more if you brought him <b>mereswort</b>, a herb from the Blackmere marsh, for his aching joints.`;
    },
    opts: [
      { label: () => 'Let him train your men (takes the day)', run: c => {
        const s = site(c), M = wildMap(), men = G.roster.filter(g => !g.away && g.injury <= 0);
        if (M.chain.herb === 2 && M.chain.hermit === s.id) {
          men.forEach(g => { const k = STATS.slice().sort((a, b) => g.stats[a] - g.stats[b])[0]; if (g.stats[k] < 20) g.stats[k]++; });
          M.chain.herb = 3; siteFinish(s.id); aDay();
          return 'He trains your men harder than they have ever been trained. <b>Every fit man gains a point in his weakest stat.</b>';
        }
        men.forEach(g => STATS.forEach(k => addProg(g, k, 0.9 * g.pot[k])));
        if (!M.chain.herb) { M.chain.herb = 1; M.chain.hermit = s.id; wildMark('herb', 'herb'); wildMark(s.id, 'hermit'); aDay(); return 'He trains your men hard for the day, and every fit man gets practice in all his stats. <span class="gold">The place where mereswort grows is now marked on your map. Bring some back to him, and he will teach them more.</span>'; }
        siteFinish(s.id); aDay();
        return 'He trains your men hard for the day, and every fit man gets practice in all his stats.';
      } },
      leaveIt,
    ],
  },
  wHamlet: {
    title: 'A hidden village of runaways', can: () => wildCan('hamlet')() && true, make: () => Object.assign(wildMake('hamlet')(), { g: makeGladiator(WILD_BUDGET[wildTier(G.field.x, G.field.y) - 1] + 8), fee: 40 + 40 * wildTier(G.field.x, G.field.y) }),
    text: c => `<b>${site(c).name}</b>. Runaway slaves and their children are living here in secret, hidden from the authorities. They are afraid of you. One of them is not: <b>${c.g.name}</b> of ${c.g.origin} offers to join your school as a ${CLASSES[c.g.cls].name}, if you pay ${c.fee} denarii to his people. Dealing with them will take the rest of the day.`,
    opts: [
      { label: c => `Pay, and take him into your school (${c.fee} denarii)`, ok: c => G.denarii >= c.fee && G.roster.length < capacity(), run: c => { const s = site(c); G.denarii -= c.fee; welcome(c.g); c.g.morale = 80; G.roster.push(c.g); addStory(c.g, 'Came out of a hidden hamlet in the hills to swear the oath.'); siteFinish(s.id); aDay(); return `You pay his people. ${c.g.name} says goodbye to his mother and joins your school.`; } },
      { label: () => 'Report them to the Magistrate (60 denarii, favour +8, morale -8)', run: c => { const s = site(c); favor('magistrate', 8); G.denarii += 60; G.roster.forEach(x => { if (!x.away) x.morale = clamp(x.morale - 8, 0, 100); }); siteFinish(s.id); aDay(); return 'You send word to the Magistrate, who will have the runaways rounded up. You are paid 60 denarii: Magistrate favour +8. Your men, who were all slaves once themselves, are disgusted: morale -8.'; } },
      { label: () => 'Leave them in peace (morale +5)', run: c => { const s = site(c); G.roster.forEach(x => { if (!x.away) x.morale = clamp(x.morale + 5, 0, 100); }); siteFinish(s.id); return 'You leave the village alone and tell nobody about it. Your men approve: morale +5.'; } },
    ],
  },
  wHealer: {
    title: 'A country healer', can: wildCan('healer'), make: () => Object.assign(wildMake('healer')(), { cost: 25 + 15 * wildTier(G.field.x, G.field.y) }),
    text: c => `<b>${site(c).name}</b>. A woman who heals with herbs lives here. For ${c.cost} denarii she will treat every wound and injury among your men. It will take the rest of the day.`,
    opts: [
      { label: c => `Pay her (${c.cost} denarii; everyone fully healed)`, ok: c => G.denarii >= c.cost, run: c => { const s = site(c); G.denarii -= c.cost; G.roster.forEach(g => { if (!g.away) { g.injury = 0; g.hp = maxHp(g); g.fatigue = Math.max(0, g.fatigue - 40); } }); siteFinish(s.id); fieldDay('camp'); return 'She treats every man. By morning all injuries are healed, everyone is at full health, and they are much less tired.'; } },
      leaveIt,
    ],
  },
  wMerchant: {
    title: 'A travelling merchant', can: wildCan('merchant'), make: () => { const s = wildSites().find(x => x.kind === 'merchant'), t = clamp(s.tier + 2, 2, 6), slot = pick(SLOTS); return { sid: s.id, slot, r: t, cls: G.roster.length ? pick(G.roster).cls : 'murmillo', cost: Math.round(ITEM_PRICE[t] * SLOT_INFO[slot].price * 0.8 / 5) * 5 }; },
    text: c => `<b>${site(c).name}</b> sells equipment out here, away from the town's smiths. He has one piece to offer: <b>${MATERIAL[c.r]} ${c.slot === 'weapon' ? WEAPON_NAMES[c.cls] : SLOT_INFO[c.slot].piece}</b>, grade ${RARITY[c.r]}, for ${c.cost} denarii. He will be gone tomorrow.`,
    opts: [
      { label: c => `Buy it (${c.cost} denarii)`, ok: c => G.denarii >= c.cost, run: c => { const s = site(c); G.denarii -= c.cost; const it = makeItem(c.slot, c.r, c.cls); G.armoury.push(it); siteFinish(s.id); return `You buy it. ${itemName(it)} is now in your armoury.`; } },
      { label: () => 'Buy nothing', run: c => { siteFinish(site(c).id); return 'You buy nothing, and he travels on.'; } },
    ],
  },
  wCache: {
    title: 'The buried treasure', can: wildCan('cache'), make: wildMake('cache'),
    text: c => `<b>${site(c).name}</b>. This is the place your clue pointed to: a pile of stones that somebody built on purpose. Digging here will take the rest of the day.`,
    opts: [
      { label: () => 'Dig', run: c => {
        const s = site(c), M = wildMap(), big = s.id === 'cacheA', coin = round5((big ? 350 : 500) * rand(0.9, 1.2));
        G.denarii += coin; M.chain[big ? 'map' : 'word'] = 2; siteFinish(s.id);
        const it = big ? wildRelic() : null;
        aDay();
        return `A little way down you find a buried chest. Inside are <b class="gold">${coin} denarii</b>${it ? `, and under the coins a rare piece of equipment: <b>${itemName(it)}</b>. ${RELICS[it.relic].note}` : ' in old coins.'}`;
      } },
      leaveIt,
    ],
  },
  wHerb: {
    title: 'Where the mereswort grows', can: wildCan('herb'), make: wildMake('herb'),
    text: () => 'You have found the mereswort the old fighter asked for. It grows out in the middle of the marsh, in dark water. Gathering it will take the rest of the day, and will tire your men a little.',
    opts: [
      { label: () => 'Wade in and gather it', run: c => { const M = wildMap(); M.chain.herb = 2; siteFinish('herb'); G.roster.forEach(g => { if (!g.away) g.fatigue = clamp(g.fatigue + 8, 0, 100); }); aDay(); return 'Your men wade in and gather a sackful. They are a little more tired. <span class="gold">Now take it back to the old fighter.</span>'; } },
      leaveIt,
    ],
  },
  // ---- the eagle of the Seventeenth ----
  wDeserter: {
    title: 'An old soldier who was there', can: wildCan('deserter'), make: wildMake('deserter'),
    text: () => 'A man of seventy is chopping wood outside a hut. He stands like a soldier, and he has an army brand on his arm that he has tried to burn off. When you mention the lost Seventeenth legion, he stops working. At last he says he will tell you what happened to it, if you sit and eat with him. Listening will take the rest of the day.',
    opts: [
      { label: () => 'Sit down and listen to his story', run: () => {
        const M = wildMap(); M.story = 2; siteFinish('deserter'); wildMark('battlefield', 'eagle'); aDay();
        return 'He tells you that the legion marched into the hills after cattle thieves, and was trapped and destroyed in a valley with only one way out. He was sixteen, and he ran away. "I saw the man carrying the legion\'s eagle fall, by the standing stone. The tribesmen took the eagle from him." <span class="gold">He draws you a map of the valley. The battlefield of the Seventeenth is now marked on your map.</span>';
      } },
      leaveIt,
    ],
  },
  wBattlefield: {
    title: 'The battlefield of the Seventeenth', can: wildCan('battlefield'), make: wildMake('battlefield'),
    text: c => `This is the valley where the legion died. The long grass is full of old bones. A band of about six scavengers <span class="bad">${skulls(site(c).tier)}</span> is still digging here for what the dead soldiers carried, and they will fight to keep you away.${sizeUp(c, () => wildMen(4, 6))} The fight will take the rest of the day.`,
    opts: [
      { label: () => 'Attack the scavengers', ok: canFightNow, run: c => wildFight('The field of the Seventeenth', wildMen(4, 6), 'ruin', 'battlefield', { sid: 'battlefield', day: true }) },
      leaveIt,
    ],
  },
  wChief: {
    title: 'The fort of Crixos One-Eye', can: wildCan('chief'), make: wildMake('chief'),
    text: c => `A wooden fort stands on an island in the marsh, reached by a single raised path. On the gate tower is a big man wearing a Roman officer's helmet: the outlaw chief, Crixos One-Eye. He has eight men with him. <span class="bad">${skulls(5)}</span>${sizeUp(c, chiefFoes)} The fight will take the rest of the day.`,
    opts: [
      { label: () => 'Attack the fort', ok: canFightNow, run: () => {
        const foes = wildMen(4, 7, 4), boss = makeEnemy(58, 4); boss.name = 'Crixos One-Eye'; boss.gear = null; boss.outlaw = true; boss.traits = ['brute', 'ironhide', 'killer', 'lionheart']; boss.hp = maxHp(boss);
        return wildFight('One-Eye\'s stockade', foes.concat(boss), 'camp', 'chief', { sid: 'chief', day: true });
      } },
      leaveIt,
    ],
  },
  wBarrow: {
    title: 'The tomb of the hill-king', can: wildCan('barrow'), make: wildMake('barrow'),
    text: c => `At the end of the hill road stands a great burial mound, as big as a temple, ringed with standing stones. It is the tomb of the hill-king. His grandsons have guarded its door all their lives, with fierce beasts they keep for the purpose: nine enemies in all. <span class="bad">${skulls(5)}</span>${sizeUp(c, barrowFoes)} This is the hardest fight in the province. It will take the rest of the day.`,
    opts: [
      { label: () => 'Attack the guards of the tomb', ok: canFightNow, run: () => {
        const foes = wildMen(5, 6, 6); foes.forEach(f => { f.traits = [...new Set(f.traits.concat('lionheart'))]; });
        return wildFight('The hill-king\'s barrow', foes.concat(wildBeasts(5).slice(0, 3)), 'rock', 'barrow', { sid: 'barrow', day: true });
      } },
      leaveIt,
    ],
  },
  eagleHome: {
    title: 'What to do with the legion\'s eagle', auto: true, can: () => wildMap().story === 5, make: () => ({}),
    text: () => 'You have brought home the lost eagle of the Seventeenth legion, and the whole town knows it. The Magistrate wants it returned to Rome. A dealer from Rome has offered to buy it. And your own men keep coming to look at it. You must decide what to do with it.',
    opts: [
      { label: () => 'Return it to Rome (fame +250, 1,500 denarii, full Magistrate favour)', run: () => { const M = wildMap(); M.story = 6; M.eagle = 'rome'; G.fame += 250; G.denarii += 1500; favor('magistrate', 100); log('The eagle of the Seventeenth is returned to Rome. +250 fame.', 'gold'); return 'You hand the eagle to the Magistrate, and it is sent to Rome with your name. The Senate thanks you, and the Magistrate, who shares the credit, is now your firm friend. <b>Fame +250, 1,500 denarii, and the Magistrate\'s favour is as high as it can go.</b>'; } },
      { label: () => 'Keep it over your gate (fame +80, every fighter Eagle-sworn, Magistrate favour -25)', run: () => { const M = wildMap(); M.story = 6; M.eagle = 'kept'; G.fame += 80; favor('magistrate', -25); G.roster.forEach(g => { g.morale = 100; if (!g.traits.includes('eaglesworn')) g.traits.push('eaglesworn'); }); log('The eagle of the Seventeenth is set over the gate of the ludus.', 'gold'); return 'You set the eagle over the gate of your school. The Magistrate is furious, but can prove nothing: favour -25. Your men are fiercely proud of it. <b>Fame +80. Every fighter you have now, and every one who joins later, gains the trait Eagle-sworn: +5% damage, and he trains 5% faster.</b>'; } },
      { label: () => 'Sell it to the dealer (4,000 denarii; favour and morale fall)', run: () => { const M = wildMap(); M.story = 6; M.eagle = 'sold'; G.denarii += 4000; favor('magistrate', -30); favor('temple', -20); G.roster.forEach(g => { g.morale = clamp(g.morale - 15, 0, 100); }); log('The eagle of the Seventeenth is sold to a dealer from Rome for 4,000 denarii.', 'gold'); return 'You sell the eagle to the dealer for 4,000 denarii. Your men are ashamed of it: morale -15 for everyone. Magistrate favour -30, Temple favour -20.'; } },
    ],
  },
  // ---- your fighters' own journeys ----
  wJourney: {
    title: 'The end of his journey', can: () => !!G.field && wildSites().some(s => (QUEST_SITE[s.kind] || s.journey) && questAt(s)),
    make: () => { const s = wildSites().find(x => (QUEST_SITE[x.kind] || x.journey) && questAt(x)); return { sid: s.id, g: questAt(s).id }; },
    text: c => {
      const g = byId(c.g), k = site(c).kind;
      if (!g) return 'There is nothing here for you now.';
      const Q = questDef(g);
      if (Q && Q.marks) return Q.at(g) + (Q.foes ? ` <span class="bad">${skulls(site(c).tier)}</span>${sizeUp(c, () => Q.foes(g, clamp(site(c).tier || g.quest.tier || 1, 1, 5)))}` : '') + ' It will take the rest of the day.';
      return {
        quarry: `You have reached the stone quarries, where gangs of slaves work under overseers with whips. <b>${g.name}</b>'s brother is somewhere inside. It will take the rest of the day to find him and learn what the overseer wants for him.`,
        slavers: `You have found the slavers' camp. The captain who burned <b>${g.name}</b>'s village is here, sitting by his fire, with about five armed men <span class="bad">${skulls(3)}</span>. ${g.name} is ready to fight.${sizeUp(c, () => wildMen(3, 5))} The fight will take the rest of the day.`,
        vow: `You have reached the shrine of <b>${g.name}</b>'s people, on a cliff above the sea. He has come to keep the promise he made before his first fight. He will pray here through the night, which will take the rest of the day.`,
        master: `You have found the old champion, living among his beehives. He watches <b>${g.name}</b> walk up the path, and before anyone speaks he says, "Your weight is on the wrong foot." It will take the rest of the day to persuade him to teach.`,
      }[k];
    },
    opts: [
      { label: () => 'Go on with him', ok: c => !journeyFight(c) || canFightNow(), run: c => {
        const g = byId(c.g), s = site(c);
        if (!g || !g.quest) return 'He is not here to see it.';
        const cost = journeyCost(g), Q = questDef(g);
        if (Q && Q.marks) {
          if (Q.foes) return wildFight(Q.name, Q.foes(g, clamp(s.tier || g.quest.tier || 1, 1, 5)), Q.bg || 'forest', 'journey', { day: true, g: g.id, cost, tier: s.tier });
          aDay(); raiseEvent(Q.finale, { g: g.id, cost });
          return Q.after(g);
        }
        if (s.kind === 'slavers') return wildFight('The slavers\' camp', wildMen(3, 5), 'camp', 'slavers', { sid: s.id, day: true, g: g.id });
        siteFinish(s.id); aDay();
        raiseEvent(QUESTS[g.quest.id].finale, { g: g.id, cost });
        return { quarry: `${g.name} has found his brother, alive, among the quarry slaves. The overseer is waiting to hear what you will do.`, vow: `${g.name} prays all night at the altar. At dawn the priests ask what he will offer.`, master: `The old champion tests ${g.name} all day, knocking him down again and again. By evening he has agreed to teach, and has named his price.` }[s.kind];
      } },
      { label: () => 'Not yet', run: () => 'You march on without stopping. He says nothing, but he keeps looking back. You can return later.' },
    ],
  },
  // ---- on the road ----
  wAmbush: {
    title: 'An ambush on the road', can: () => !!G.field, make: () => ({ tier: wildTier(G.field.x, G.field.y), beasts: chance(0.4), toll: 20 + 20 * wildTier(G.field.x, G.field.y) }),
    text: c => c.beasts ? `Wild animals have been following your men through the bushes, and now they attack. <span class="bad">${skulls(c.tier)}</span>` : `Armed robbers step out on both sides of the road <span class="bad">${skulls(c.tier)}</span>. Their leader demands ${c.toll} denarii to let you pass.`,
    opts: [
      { label: () => 'Fight', ok: canFightNow, run: c => wildFight(c.beasts ? 'Beasts on the road' : 'An ambush on the road', c.beasts ? wildBeasts(c.tier) : wildMen(c.tier, Math.max(2, wildCount(c.tier) - 1)), 'forest', 'pack', { tier: c.tier }) },
      { label: c => c.beasts ? 'Run for it (a man may be hurt)' : `Pay them (${c.toll} denarii)`, run: c => {
        if (!c.beasts) { G.denarii -= c.toll; return `You pay the ${c.toll} denarii, and the robbers let you pass.`; }
        const g = pick(G.roster.filter(x => !x.away));
        if (g && chance(0.5)) { g.injury = Math.max(g.injury, rint(2, 3)); addScar(g, 'claw'); return `You get away, but one of the animals bites <b>${g.name}</b> in the leg. He is injured, and will be out for ${g.injury} days.`; }
        return 'You run for a mile, and the animals give up the chase. Nobody is hurt.';
      } },
    ],
  },
  wTraveller: {
    title: 'A travelling pedlar', can: () => !!G.field, make: () => ({ sid: (wildSites().filter(s => !siteDone(s) && !s.fixed && !wildMap().seen[s.id]).sort((a, b) => Math.hypot(a.x - G.field.x, a.y - G.field.y) - Math.hypot(b.x - G.field.x, b.y - G.field.y))[0] || { id: null }).id, cost: 15 }),
    text: c => `You meet a pedlar travelling the other way. He knows this country well. For ${c.cost} denarii he will tell you about a place nearby that is not yet on your map.`,
    opts: [
      { label: c => `Pay him (${c.cost} denarii; a new place on your map)`, ok: c => G.denarii >= c.cost, run: c => { const s = siteById(c.sid); G.denarii -= c.cost; if (!s) return 'You pay him, but he has nothing to tell you that you do not already know.'; wildMark(s.id, 'told'); return `He tells you where to find <b>${s.name.toLowerCase()}</b>, in ${wildRegion(s.x, s.y)}. It is now marked on your map.`; } },
      { label: () => 'Share a meal with him, and ask nothing (morale +2)', run: () => { G.roster.forEach(g => { if (!g.away) g.morale = clamp(g.morale + 2, 0, 100); }); return 'You share your food with him, and he sings for your men in return. They like him: morale +2.'; } },
    ],
  },
  wFind: {
    title: 'An abandoned cart', can: () => !!G.field, make: () => ({ coin: round5(12 * wildTier(G.field.x, G.field.y) * rand(0.8, 1.6)) }),
    text: () => 'An abandoned cart lies on its side in the ditch. Others have already searched it, but not carefully.',
    opts: [
      { label: () => 'Have your men search it', run: c => { G.denarii += c.coin; return `Your men find a hidden compartment under the floor of the cart, with <b class="gold">${c.coin} denarii</b> in it.`; } },
    ],
  },
  wCaptive: {
    title: 'One of the outlaws is still alive', auto: true, can: () => !!G.field, make: () => ({ g: wildMen(1, 1)[0] }),
    text: c => `After the fight, your men find one outlaw still alive: <b>${c.g.name}</b> of ${c.g.origin}. He is wounded, but he shows no fear. He fought as a ${CLASSES[c.g.cls].name} before he became an outlaw, and your men think he would make a good gladiator.`,
    opts: [
      { label: () => 'Take him into your school', ok: () => G.roster.length < capacity(), run: c => { const g = c.g; delete g.outlaw; g.gear = emptyGear(); g.weapon = 0; g.armor = 0; g.id = ++G.nextId; g.wins = g.losses = g.kills = 0; g.xp = 0; g.rank = 0; g.perkPending = 0; g.injury = 4; g.morale = 45; g.hp = Math.round(maxHp(g) * 0.4); g.story = []; g.scars = []; g.activity = 'rest'; welcome(g); G.roster.push(g); addStory(g, 'An outlaw taken alive in the wild, who chose the oath over the cross.'); return `${g.name} swears the gladiator's oath and joins your school. He is badly hurt and needs four days to heal, and his morale is low.`; } },
      { label: () => 'Hand him to the Magistrate (40 denarii, favour +3)', run: () => { G.denarii += 40; favor('magistrate', 3); return 'You hand him over to the Magistrate, who pays you 40 denarii and has him executed. Magistrate favour +3.'; } },
      { label: () => 'Let him go (morale +3)', run: () => { G.roster.forEach(g => { if (!g.away) g.morale = clamp(g.morale + 3, 0, 100); }); return 'You let him go free, to his great surprise. Your men approve: morale +3.'; } },
    ],
  },
};
// ---- the night before: he says what it is, if he is asked ----
const firesideMan = () => G.roster.find(g => questDef(g) && !g.away && !g.quest.talked) || null;
WILD_EVENTS.wFireside = {
  title: 'A fighter sits alone by the fire', can: () => !!G.field && !!firesideMan(), make: () => ({ g: firesideMan().id }),
  text: c => `Your men have made camp for the night. <b>${gn(c.g)}</b>, whose journey this is, has not eaten. He is sitting apart from the others, looking down the road you will take tomorrow.`,
  opts: [
    { label: () => 'Sit with him and ask what troubles him (his morale +8)', run: c => { const g = byId(c.g), Q = questDef(g); if (!Q) return 'He is asleep, or seems to be.'; g.quest.talked = true; g.quest.heard = true; evMor(g, 8); return `After a long silence, he tells you. ${Q.fire ? Q.fire(g) : '"It is nothing. It is just a thing I have to do."'} Now you know what is waiting at the end of his journey. His morale is +8.`; } },
    { label: () => 'Send him food and wine (his morale +4)', run: c => { const g = byId(c.g); if (!g || !g.quest) return 'He is asleep, or seems to be.'; g.quest.talked = true; evMor(g, 4); return `${g.name} eats, and later he joins the others by the fire. His morale is +4.`; } },
    { label: () => 'Leave him alone', run: c => { const g = byId(c.g); if (g && g.quest) g.quest.talked = true; return 'You leave him alone with his thoughts.'; } },
  ],
};
for (const id in WILD_EVENTS) Object.assign(WILD_EVENTS[id], { auto: true, wild: true });
Object.assign(EVENTS, WILD_EVENTS);

const SITE_EVENT = { bounty: 'wBounty', lair: 'wLair', camp: 'wCamp', ruin: 'wRuin', shrine: 'wShrine', hermit: 'wHermit', hamlet: 'wHamlet', healer: 'wHealer', merchant: 'wMerchant', cache: 'wCache', herb: 'wHerb',
  deserter: 'wDeserter', battlefield: 'wBattlefield', chief: 'wChief', barrow: 'wBarrow', quarry: 'wJourney', slavers: 'wJourney', vow: 'wJourney', master: 'wJourney', errand_journey: 'wJourney' };
// Raises whatever is found at a place. Called by the map when the school walks up to it.
function wildVisit(s) {
  if (!siteLive(s) || G.pendingEvent) return false;
  const id = SITE_EVENT[s.kind], c = EVENTS[id].make();
  c.sid = s.id;
  if (id === 'wJourney') c.g = questAt(s).id;
  if (id === 'wTale') c.tid = s.tale;
  raiseEvent(id, c);
  return true;
}
// Now and then something stops the column on the road. Called by the map with the ground just covered.
function wildWalked(d) {
  const F = G.field;
  F.walked += d;
  if (F.walked < F.next || G.pendingEvent) return false;
  F.walked = 0; F.next = 600 + Math.random() * 700;
  if (Math.hypot(F.x - WILD.TOWN.x, F.y - WILD.TOWN.y) < 220) return false;
  const id = roadEventId();
  raiseEvent(id, EVENTS[id].make());
  return true;
}
// Where the hunt for the eagle stands, in a line.
function eagleLead() {
  const M = wildMap();
  return ['', 'A dead man\'s letter speaks of a survivor of the Seventeenth. Find the old soldier\'s hut, east along the road, by the Greywood.',
    'The old soldier has drawn you the valley where the legion died. Find the field of the Seventeenth, in the fells.',
    'A centurion\'s crest is worn by Crixos One-Eye. Find his stockade, in the Blackmere.',
    'The eagle was buried with the hill-king. Find his barrow, at the end of the fell road.',
    'You have the eagle of the Seventeenth. Carry it home.',
    M.eagle === 'rome' ? 'The eagle of the Seventeenth went back to Rome by your hand.' : M.eagle === 'kept' ? 'The eagle of the Seventeenth stands over your gate.' : 'The eagle of the Seventeenth was sold.'][M.story];
}

// =====================================================================================================
// QUESTS FROM THE PEOPLE OF THE TOWN
// Some mornings somebody is waiting by the fountain with work that is not the Guild's or the Magistrate's:
// a shepherd with wolves in his fold, a widow whose husband's ring went down a hot spring, an old soldier
// who knows where a king was buried with his sword. Each sends the school to one of the landmarks of the
// province. G.asks are those waiting; G.errands are the ones you have taken on.
// =====================================================================================================
const LANDMARKS = ['The great oak', 'A villa in its garden', 'The old arch', 'The wine press', 'The fallen colossus', 'An old battlefield', 'The bee garden', 'The mill', 'A wreck on the strand', 'The beacon', 'The bones of a whale', "The fishers' huts", 'The charcoal burners', "The hunters' lodge", 'A burnt village', 'The great quarry', 'The lime kiln', 'The unfinished columns', 'The watchtower', 'The hot spring', 'The eagle rock', 'The ring of stones', "The giant's table", 'The needle', 'The drowned temple', 'The causeway', 'The bog oak', 'The huts on stilts', 'The wolf stone', "The shepherds' fold", 'The gallows', 'The broken aqueduct', 'The great waterfall', 'The salt pans', 'The sacred grove', 'The white temple', 'The barrow of kings', 'The fort', 'The old arena', 'The ferry'];
// Where each landmark stands, as a place the school can walk to. The map paints them (province.js); without the map
// (the tests) each is given a spot of its own from its name.
let landmarkCache = null;
function landmarkSpots() {
  if (landmarkCache) return landmarkCache;
  const L = wildLand(), out = {};
  const snap = (x, y) => {
    const tx0 = clamp(Math.floor(x / 10), 2, WILD.TW - 3), ty0 = clamp(Math.floor(y / 10), 2, WILD.TH - 3);
    for (let r = 0; r <= 10; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const tx = tx0 + dx, ty = ty0 + dy;
      if (tx > 1 && ty > 1 && tx < WILD.TW - 2 && ty < WILD.TH - 2 && L.reach[ty * WILD.TW + tx]) return { x: tx * 10 + 5, y: ty * 10 + 5 };
    }
    return null;
  };
  if (typeof provLand === 'function' && typeof prov !== 'undefined' && typeof document !== 'undefined') {
    try { if (!prov.marks) provLand(); for (const m of prov.marks || []) if (!m.dw) { const p = snap(m.x + m.r, m.y + 14); if (p) out[m.name] = p; } } catch (e) { /* no canvas: fall through */ }
  }
  LANDMARKS.forEach((n, i) => {
    if (out[n]) return;
    for (let t = 0; t < 4000; t++) { const p = snap(30 + wildHash(i, t, 991) * (WILD.W - 60), 30 + wildHash(t, i, 992) * (WILD.H - 60)); if (p && Math.hypot(p.x - WILD.TOWN.x, p.y - WILD.TOWN.y) > 160) { out[n] = p; break; } }
  });
  return (landmarkCache = out);
}
const landmarkAt = name => landmarkSpots()[name] || null;
const lower = s => s.charAt(0).toLowerCase() + s.slice(1);

// ---------- unique pieces, each lying at one landmark until somebody is sent for it ----------
Object.assign(RELICS, {
  kingsblade: { quest: true, name: "The barrow-king's sword", slot: 'weapon', r: 5, note: 'Forty years in the dark and it took an edge at the first stroke of the stone. A further 1.5 on every blow.', add: z => { z.dmg += 1.5; } },
  tidemask:   { quest: true, name: "The drowned priest's mask", slot: 'head', r: 5, note: 'Bronze, green with the marsh, with no mouth. He is a further 20% harder to stun.', add: z => { z.stunRes += 0.2; } },
  wolfmantle: { quest: true, name: 'The wolf-stone mantle', slot: 'shoulders', r: 5, note: 'A grey pelt nobody remembers killing. He dodges 4% more and bleeds far less.', add: z => { z.dodge += 0.046; z.bleedRes += 0.25; } },
  colossus:   { quest: true, name: "The colossus's greaves", slot: 'legs', r: 6, note: 'Cast for a statue, not a man; they fit all the same. A further 1 off every blow, and he cannot be hamstrung.', add: z => { z.armor += 1; z.hamRes += 0.5; } },
  cutlass:    { quest: true, name: "The sea-captain's blade", slot: 'weapon', r: 4, note: 'Light, curved and quick in the hand. A further 1 on every blow, and he moves 4% faster.', add: z => { z.dmg += 1; z.speed += 0.04; } },
  oldhelm:    { quest: true, name: "The first champion's helm", slot: 'head', r: 6, note: 'The crest is gone; the dents are not. Telling blows against him are a further 14% less likely.', add: z => { z.critRes += 0.14; } },
  eaglecrest: { quest: true, name: 'The eagle-feather crest', slot: 'head', r: 4, note: 'Three feathers from the nest on the rock. He moves a further 6% faster.', add: z => { z.speed += 0.06; } },
  bracers:    { quest: true, name: "The quarry-master's bracers", slot: 'arms', r: 5, note: 'Iron bands made to turn a falling block. A further 6% block, and his sword arm cannot be numbed.', add: z => { z.block += 0.06; z.armRes += 0.4; } },
  bogiron:    { quest: true, name: 'The bog-iron cuirass', slot: 'chest', r: 5, note: 'Black, pitted, and harder than anything a smith has made since. Takes a further 1.3 off every blow.', add: z => { z.armor += 1.3; } },
  girdle:     { quest: true, name: 'The girdle of the grove', slot: 'chest', r: 4, note: 'Oak bark and silver wire, blessed over. He dodges 3% more and is 12% harder to stun.', add: z => { z.dodge += 0.036; z.stunRes += 0.12; } },
  gladius:    { quest: true, name: "A centurion's gladius", slot: 'weapon', r: 5, note: 'Given, not found: the fort does not forget. A further 1.2 on every blow.', add: z => { z.dmg += 1.2; } },
  vinestaff:  { quest: true, name: "The old doctore's greaves", slot: 'legs', r: 4, note: 'Worn by the man who trained the first school in this town. He moves a further 4% faster.', add: z => { z.speed += 0.04; } },
});

// ---------- who is waiting at the landmark ----------
// A quest is not a lair with another name. Whoever holds the place has a name, is a grade better than his country
// and has an edge of his own; and a great beast is half as strong again as its kind.
const QUEST_NAMES = {
  outlaw: ['Brennos Split-Lip', 'Tall Marcus', 'The Tanner', 'Cotta the Deserter', 'Red Ursus', 'One-Hand Varus', 'Gallio of the Marsh'],
  slaver: ['The Syrian', 'Milo the Rope', 'Old Scar-Back', 'Demos the Buyer'],
  champion: ['Aquila of Capua', 'Vintius the Thracian', 'Leontes, called the Lion', 'Iron Gallus', 'Corvus Twice-Crowned'],
  wolf: ['The old grey', 'Split-Ear', 'The black bitch'], boar: ['The great tusker', 'Old Ironside'], bear: ['The grey bear', 'Mother of the Fells', 'Scar-Shoulder'], lion: ['The man-eater', 'The pale lion', 'Old Yellow-Eye'],
};
function questBoss(tier, name, o) {
  const g = makeEnemy(WILD_BUDGET[tier - 1] + 5 + ((o && o.boost) || 0), clamp(tier, 0, 4), { cls: o && o.cls });
  g.name = name || pick(QUEST_NAMES.outlaw || ['Their leader']); g.outlaw = true; g.boss = true; g.gear = null;      // a quest taken before leaders had names still has one to fight
  for (const t of ((o && o.traits) || [])) if (TRAITS[t] && !g.traits.includes(t)) g.traits.push(t);
  g.tactic = (o && o.tactic) || 'aggressive'; g.morale = 90; g.hp = maxHp(g);
  return g;
}
function questBeast(kind, tier, name, mult) {
  const b = makeBeast(kind, WILD_BUDGET[tier - 1] * (mult || 1.5));
  b.name = name || pick(QUEST_NAMES.great || ['The great one']); b.boss = true; b.traits.push('ironhide'); b.hp = maxHp(b);
  return b;
}
const greatKind = tier => tier <= 1 ? 'boar' : tier === 2 ? 'boar' : tier === 3 ? 'bear' : 'lion';
const lesser = (kind, tier, n) => { const out = []; for (let i = 0; i < n; i++) out.push(makeBeast(kind, WILD_BUDGET[tier - 1] * 0.8)); return out; };
// How well it was done. Each returns [met, what is said].
const QUEST_GOALS = {
  swift: (q, res, secs) => [res.time <= secs, secs],
  clean: (q, res) => [res.down === 0, 0],
};

// ---------- who comes to the fountain ----------
const GIVERS = {
  shepherd:  { what: 'a shepherd', names: ['Old Tiro', 'Gaius the herd', 'Lame Marcus', 'Bodua'], tunic: '#8a6a4a', hair: '#8a8a8a', skin: '#c9966c' },
  widow:     { what: 'a widow', names: ['Aemilia', 'The widow Paulla', 'Old Fausta', 'Cornelia'], tunic: '#4a4a52', hair: '#3a2a1c', skin: '#d9a57c' },
  merchant:  { what: 'a merchant', names: ['Vibius the factor', 'Sextus Quarta', 'A Greek named Philon', 'Rufus the oil-seller'], tunic: '#3f7a5a', hair: '#2a1c14', skin: '#c9966c' },
  hunter:    { what: 'a hunter', names: ['Brocc', 'One-Ear', 'Vindex', 'The boar-man'], tunic: '#5a6a3a', hair: '#6a4a2a', skin: '#8a5a3a' },
  priest:    { what: 'a priest', names: ['The flamen Lucius', 'Brother Sabinus', 'The grey priest'], tunic: '#e8e2d2', hair: '#c9c2b2', skin: '#d9a57c' },
  veteran:   { what: 'an old soldier', names: ['Decimus, of the Ninth', 'Crooked Quintus', 'The standard-bearer', 'Old Varro'], tunic: '#a8261c', hair: '#b4bec8', skin: '#c9966c' },
  clerk:     { what: "the Magistrate's clerk", names: ['The clerk Hilarus', 'A man of the Magistrate', 'Scribe Nicias'], tunic: '#7a2a8a', hair: '#2a1c14', skin: '#e3b48f' },
  scholar:   { what: 'a scholar', names: ['Strabo the surveyor', 'A Greek with instruments', 'Master Pollio'], tunic: '#5a8a9a', hair: '#8a8a8a', skin: '#e3b48f' },
  physician: { what: 'a physician', names: ['Eudemos the Greek', 'The surgeon Kleon', 'Old Scribonius'], tunic: '#b8b0a0', hair: '#5a5a5a', skin: '#c9966c' },
  noble:     { what: 'a young noble', names: ['Young Flavius', 'The lady Sabina', 'Marcellus Minor'], tunic: '#c9a21e', hair: '#3a2a1c', skin: '#e3b48f' },
};

// ---------- what they ask ----------
// type: fight (go and beat something), fetch (find a thing), give (carry something there), rescue (a clue, then a fight).
const ERRANDS = {
  wolves: { type: 'fight', givers: ['shepherd'], marks: ["The shepherds' fold", 'The bee garden', 'The mill', 'The wine press', 'The great oak', 'The charcoal burners', "The hunters' lodge"], bg: 'forest',
    title: m => `Wolves at ${lower(m)}`, boss: 'wolf', next: 'wolfden', goal: { kind: 'clean', pay: 1.25, met: 'None of your men went down, so the shepherd pays extra.', miss: '' },
    foes: q => [questBeast('wolf', q.tier, q.boss, 1.35)].concat(lesser('wolf', q.tier, 2 + q.tier)),
    lead: q => `It is a big pack, led by one large wolf: <b>${q.boss}</b>.`,
    ask: q => `"Wolves come down to ${lower(q.mark)} every night. Last week they killed six of my sheep and my dog. Kill the pack and I will pay you ${q.pay} denarii."`,
    at: q => `You have reached ${lower(q.mark)}. The ground is torn up and there are bones in the grass. The wolves are here.`,
    won: q => `The pack is dead. ${q.mark} is safe again.`,
    twist: { title: 'Wolf cubs',
      text: q => `Behind the body of <b>${q.boss || 'the pack leader'}</b> your men find a den with four young cubs in it. You must decide what to do with them.`,
      opts: [
        { label: () => 'Sell them to the arena (coin)', run: q => { const n = coinFor(14, q.tier); G.denarii += n; return `You sell the cubs to the arena's beast-master for <b class="gold num">${n}</b> denarii.`; } },
        { label: () => 'Kill them too (more pay)', run: q => { q.owedPay = round5(q.owedPay * 1.1); return `You kill the cubs. ${q.giver.name} wanted every wolf dead, and raises the pay to <b class="num">${q.owedPay}</b> denarii.`; } },
        { label: () => 'Leave them alive (morale, Temple favour)', run: () => { favor('temple', 2); fieldParty().forEach(g => evMor(g, 3)); return 'You leave the cubs alive. Your men are glad of it: morale +3. The priests hold the wolf sacred to Mars, and approve: Temple favour +2.'; } },
      ] } },
  bandits: { type: 'fight', givers: ['merchant', 'clerk'], marks: ['The old arena', 'A burnt village', 'The gallows', 'The old arch', 'The unfinished columns', 'The broken aqueduct', 'The causeway'], bg: 'camp', fame: 1,
    title: m => `Robbers at ${lower(m)}`, boss: 'outlaw', next: 'paymaster', goal: { kind: 'swift', secs: q => 14 + q.tier * 1.5, loot: true, met: 'You beat them before any could run, so their plunder is still in the camp.', miss: 'Two of them escaped with the best of the plunder.' },
    foes: q => [questBoss(q.tier, q.boss, { traits: ['brute'], tactic: 'aggressive' })].concat(wildMen(q.tier, Math.max(1, wildCount(q.tier) - 2))),
    lead: q => `Their leader is <b>${q.boss}</b>, and he is much stronger than the rest. Win quickly, or some of them will run off with the plunder.`,
    ask: q => `"Robbers have taken three of my carts this month, and one of my drivers never came home. They are camped at ${lower(q.mark)}. Drive them out and I will pay ${q.pay} denarii. Keep my name out of it."`,
    at: q => `You have reached ${lower(q.mark)}. The robbers are sitting round a fire, and they grab their weapons when they see you.`,
    won: q => `The robbers are beaten. The road past ${lower(q.mark)} is safe again.`,
    twist: { title: 'Stolen goods',
      text: q => `In the robbers' camp you find three cartloads of stolen oil, cloth and tableware. Most of it still carries the seals of merchants from the town. Nobody but you knows it is here.`,
      opts: [
        { label: () => 'Return it to the merchants (Guild favour, fame)', run: q => { favor('guild', 5); q.owedFame += 2; return 'You load it on the robbers\' mules and take it back to its owners. The Guild is grateful: favour +5, and extra fame when you are paid.'; } },
        { label: () => 'Sell it quietly (coin, some risk)', run: q => { const n = coinFor(32, q.tier); G.denarii += n; if (chance(0.35)) { favor('guild', -4); return `You sell it at a farm for <b class="gold num">${n}</b> denarii. But somebody there recognised the seals and told the Guild: favour -4.`; } return `You sell it at a farm for <b class="gold num">${n}</b> denarii, and nobody asks where it came from.`; } },
        { label: () => 'Let your men keep it (morale)', run: () => { fieldParty().forEach(g => evMor(g, 10)); return 'Your men share out the cloth and the jars between them. Morale +10 for every man with you.'; } },
      ] } },
  beastking: { type: 'fight', givers: ['hunter'], marks: ['The eagle rock', 'The hot spring', 'The great waterfall', 'The wolf stone', "The giant's table"], bg: 'rock', fame: 3, pay: 1.3,
    title: m => `The beast of ${lower(m)}`, boss: 'great', trophy: true,
    foes: q => [questBeast(greatKind(q.tier), q.tier, q.boss, 1.7)].concat(q.tier >= 3 ? lesser(greatKind(q.tier), q.tier, q.tier - 2) : []),
    lead: q => `The hunters call it <b>${q.boss}</b>. It is far bigger and stronger than a normal animal of its kind.`,
    ask: q => `"There is a beast living at ${lower(q.mark)}. It killed my brother and both his dogs. I have hunted here for thirty years, and I am afraid to go back. Kill it and bring me its hide. I will pay ${q.pay} denarii, and every hunter in the province will hear what you did."`,
    at: q => `You have reached ${lower(q.mark)}. A very large animal lives here. It has killed men before, and it is not afraid of you.`,
    won: q => `The beast is dead. It takes four men to carry its hide, and the hunters will talk about this for years.` },
  champion: { type: 'fight', givers: ['noble'], marks: ['The ring of stones', 'The old arena', 'The needle'], bg: 'ruin', fame: 5, pay: 0.8,
    title: m => `A challenge at ${lower(m)}`, boss: 'champion', goal: { kind: 'clean', fame: 4, met: 'None of your men went down in front of the crowd. That earns you extra fame.', miss: '' },
    foes: q => [questBoss(q.tier, q.boss, { boost: 4, traits: ['duelist', 'quickhands', 'ironwill'], tactic: 'balanced' })].concat(wildMen(q.tier, 2, 2)),
    lead: q => `He is called <b>${q.boss}</b>, and two of his followers fight beside him. A crowd is watching: win without one of your men going down, and you earn extra fame.`,
    ask: q => `"A swordsman has set himself up at ${lower(q.mark)} with his followers. He claims to be the best fighter in the province, and he has insulted my family. Beat him in front of a crowd and I will pay ${q.pay} denarii."`,
    at: q => `You have reached ${lower(q.mark)}. The swordsman and his followers are armed and waiting, and a crowd from the nearby farms has come to watch. He greets you with respect. He is a good fighter.`,
    won: q => `You have beaten him in front of the crowd, and everyone there will tell the story.`,
    twist: { title: 'He asks to join you',
      text: q => `<b>${q.boss || 'Their leader'}</b> sits beaten, with his head bandaged. He says only one other man has ever beaten him. He would rather fight for your school than against it.`,
      opts: [
        { label: () => 'Take him into your school (half pay)', ok: () => G.roster.length < capacity(), run: q => {
          const g = makeGladiator(WILD_BUDGET[q.tier - 1] + 6); if (q.boss) g.name = q.boss; g.morale = 70; g.injury = 3; welcome(g); G.roster.push(g);
          addStory(g, `Called himself the best blade in the province, at ${lower(q.mark)}, until this house taught him otherwise.`);
          q.owedPay = round5(q.owedPay * 0.5);
          return `${g.name} swears the oath and joins your school. He needs three days to heal. ${q.giver.name} paid to see him shamed, not hired, and will pay only half.`; } },
        { label: () => 'Send him away in disgrace (fame)', run: q => { q.owedFame += 2; return `You break his sword and march him out past the crowd. That is what ${q.giver.name} paid for: extra fame when you are paid.`; } },
        { label: () => 'Let him go with honour (fame, morale, less pay)', run: q => { fieldParty().forEach(g => evMor(g, 5)); G.fame += 2; q.owedPay = round5(q.owedPay * 0.8); return `You hand back his sword and let him go. The crowd and your men like it: fame +2, morale +5. ${q.giver.name} wanted him shamed, and will pay less.`; } },
      ] } },
  heirloom: { type: 'fetch', givers: ['widow'], marks: ['The hot spring', 'A villa in its garden', 'The wine press', 'The salt pans', 'The bones of a whale', 'The great oak'], pay: 0.8,
    title: m => `Lost at ${lower(m)}`, thing: "her husband's ring",
    ask: q => `"My husband lost his ring at ${lower(q.mark)} the summer before he died. I am too old to go and look for it. Find it and bring it back to me, and I will pay ${q.pay} denarii."`,
    at: q => `You have reached ${lower(q.mark)}. The ring was lost somewhere here. Searching properly will take the whole day.`,
    won: q => `You find the ring. It is plain iron and worth nothing, but it is the one she wants.` },
  ledger: { type: 'fetch', guard: true, givers: ['merchant', 'clerk'], marks: ['The lime kiln', 'The great quarry', 'The mill', "The fishers' huts", 'The salt pans'], pay: 1.1,
    title: m => `The strongbox at ${lower(m)}`, thing: 'the strongbox',
    ask: q => `"My agent at ${lower(q.mark)} has died, and his strongbox is missing. It holds a year of my accounts. Find it and bring it back before anybody reads them. I will pay ${q.pay} denarii."`,
    at: q => `You have reached ${lower(q.mark)}. Someone has already searched the agent's hut, and they may still be close by.`,
    won: q => `You find the strongbox, hidden under the hearthstone.`,
    twist: { title: 'The box is open',
      text: q => `Whoever searched the hut broke the lock, but the tablets are still inside. Your steward reads them: ${q.giver.name} keeps two sets of accounts, and the Guild has only ever been shown one. ${q.giver.name} is expecting the box back unread.`,
      opts: [
        { label: () => 'Shut it and say nothing (more pay)', run: q => { q.owedPay = round5(q.owedPay * 1.15); workMove(3); return `You tie the box shut and bring it back unread. ${q.giver.name} is pleased, and raises the pay to <b class="num">${q.owedPay}</b> denarii. Your name as a school that can be trusted with paid work goes up.`; } },
        { label: () => 'Demand money to keep quiet (much more pay, fame -2)', run: q => { q.owedPay = round5(q.owedPay * 1.7); G.fame = Math.max(0, G.fame - 2); workMove(-4); return `You send word that you have read the tablets. ${q.giver.name} agrees to pay <b class="num">${q.owedPay}</b> denarii for your silence. But word of it gets round: fame -2, and people are less willing to trust you with paid work.`; } },
        { label: () => 'Give the tablets to the Guild (Guild favour, half pay)', run: q => { G.owed = owed().filter(o => o !== q); favor('guild', 9); const n = round5(q.owedPay * 0.5); G.denarii += n; return `You hand the tablets to the Guild, and its officers send for ${q.giver.name}. You will get nothing from ${q.giver.name} now, but the Guild rewards you: favour +9, and <b class="gold num">${n}</b> denarii.`; } },
      ] } },
  supplies: { type: 'give', ambush: true, givers: ['clerk', 'veteran'], marks: ['The watchtower', 'The beacon', 'The fort', 'The ferry', 'The huts on stilts', 'The charcoal burners'], favor: ['magistrate', 4],
    title: m => `Supplies for ${lower(m)}`,
    ask: q => `"The soldiers at ${lower(q.mark)} have had no pay and no supplies since the roads became unsafe. The last two cart drivers were robbed. Nobody would dare to rob your school. Carry it to them and I will pay ${q.pay} denarii, and the Magistrate will hear of it."`,
    at: q => `You have reached ${lower(q.mark)}. The soldiers saw you coming, and they are glad to see you.`,
    won: q => `The soldiers count their pay and sign for it. They have wine tonight for the first time in a month.`,
    twist: { title: 'An offer from the soldiers',
      text: q => `With the pay handed over, the officer at ${lower(q.mark)} makes your men an offer. They can spend a day training against his soldiers, who fight in a line. Or they can sit down and drink with them.`,
      opts: [
        { label: () => 'Train with the soldiers (experience, costs a day)', run: () => { aDay(); fieldParty().forEach(g => { g.xp += 2; g.fatigue = clamp(g.fatigue + 12, 0, 100); }); return 'Your men spend the day fighting against a shield wall. Every man with you gains experience, and is more tired for it. A day passes.'; } },
        { label: () => 'Drink with them (morale, rest)', run: () => { fieldParty().forEach(g => { evMor(g, 8); g.fatigue = clamp(g.fatigue - 8, 0, 100); }); return 'Your men spend the evening drinking and singing with the soldiers. Morale +8, and they are less tired.'; } },
        { label: () => 'Thank him and leave', run: () => 'You thank him and march on.' },
      ] } },
  offering: { type: 'give', cost: 40, givers: ['priest'], marks: ['The sacred grove', 'The white temple', 'The needle', 'The ring of stones'], favor: ['temple', 6], pay: 0.5,
    title: m => `An offering at ${lower(m)}`,
    ask: q => `"Years ago, in a plague, this town promised an offering at ${lower(q.mark)} and never made it. I am too old to travel. Carry the offering there for me, and add a gift of your own. I will pay ${q.pay} denarii, and the Temple will be grateful."`,
    at: q => `You have reached ${lower(q.mark)}. It is very quiet. You have the priest's offering with you, and by custom you add something of your own.`,
    won: q => `The offering is made. Your men mocked this errand on the way here, but they are quiet on the way back.`,
    after: (q, lines) => { fieldParty().forEach(g => { g.morale = clamp(g.morale + 10, 0, 100); }); lines.push('Every man with you is in better spirits: morale +10.'); } },
  survey: { type: 'give', day: true, givers: ['scholar'], marks: ['The great quarry', 'The broken aqueduct', 'The unfinished columns', 'The salt pans', 'The causeway', 'The fallen colossus'], pay: 0.9,
    title: m => `A survey of ${lower(m)}`,
    ask: q => `"The governor wants ${lower(q.mark)} measured and mapped. It is dangerous country, and I will not send my assistant there without guards. Take him with you. He needs one day there. I will pay ${q.pay} denarii."`,
    at: q => `You have reached ${lower(q.mark)}. The surveyor's assistant unpacks his measuring tools. He needs the whole day.`,
    won: q => `The assistant finishes his measurements. From here your men have had a good look at the country too.`,
    after: (q, lines) => { const before = Object.keys(wildMap().seen).length; for (let dy = -260; dy <= 260; dy += 60) for (let dx = -260; dx <= 260; dx += 60) if (Math.hypot(dx, dy) <= 260) wildReveal(q.x + dx, q.y + dy); const n = Object.keys(wildMap().seen).length - before; if (n) lines.push(`<span class="gold">${n} new place${n === 1 ? '' : 's'} on your map.</span>`); } },
  rescue: { type: 'rescue', givers: ['widow', 'shepherd', 'merchant'], marks: ["The fishers' huts", 'A burnt village', 'The ferry', "The shepherds' fold", 'The mill'], marks2: ['An old battlefield', 'The bog oak', 'The gallows', 'The causeway', 'The drowned temple', 'The old arena'], bg: 'camp', favor: ['guild', 4], fame: 3, pay: 1.4,
    title: m => `Taken near ${lower(m)}`, boss: 'slaver', next: 'slavemart', goal: { kind: 'swift', secs: q => 16 + q.tier * 1.5, pay: 1, missPay: 0.7, met: 'You reached the captives before the slavers could harm them. All of them go home alive.', miss: 'The slavers killed two of the captives before you could reach them.' },
    foes: q => [questBoss(q.tier, q.boss, { cls: CLASSES.retiarius ? 'retiarius' : undefined, traits: ['opener'], tactic: 'defensive' })].concat(wildMen(q.tier, Math.max(1, wildCount(q.tier) - 1))),
    lead: q => `Their leader is <b>${q.boss}</b>. Win quickly: if the fight drags on, he will start killing the captives.`,
    ask: q => `"My son went to ${lower(q.mark)} nine days ago with a cart. The cart was found, but he was not. Somebody there must have seen who took him. Find him and bring him home. I have ${q.pay} denarii, and I will find more."`,
    at: q => `You have reached ${lower(q.mark)}. At first nobody will talk. Then an old woman tells you what she saw.`,
    clue: q => `"Slavers took him. There were six or eight of them, with a line of prisoners tied at the neck. They went towards ${lower(q.mark2)}, and they were not hurrying."`,
    at2: q => `You have found the slavers. They are camped at ${lower(q.mark2)}, with their prisoners tied in a line beside the fire.`,
    won: q => `The boy is among the prisoners, thin but unhurt. You free him and eleven others, and they will all tell people which school saved them.`,
    twist: { title: 'The slaver is alive',
      text: q => `<b>${q.boss || 'Their leader'}</b> has been dragged out of his tent alive. He says he has silver buried nearby, and that only he can find it. The people he held prisoner are standing round him, and they want him dead.`,
      opts: [
        { label: () => 'Hand him to the Magistrate (coin, Magistrate favour)', run: () => { favor('magistrate', 6); G.denarii += 40; return 'You take him to town as a prisoner. The Magistrate pays 40 denarii for him and has him executed. Magistrate favour +6.'; } },
        { label: () => 'Let the prisoners deal with him (fame, morale)', run: q => { q.owedFame += 3; fieldParty().forEach(g => evMor(g, 4)); return 'You look away, and the people he held prisoner kill him. They will tell the story in every village: extra fame when you are paid, and morale +4.'; } },
        { label: () => 'Make him show you the silver (coin, less fame, morale -5)', run: q => { const n = coinFor(45, q.tier); G.denarii += n; q.owedFame = Math.max(0, q.owedFame - 2); fieldParty().forEach(g => evMor(g, -5)); return `He leads you to the silver: <b class="gold num">${n}</b> denarii. In return you let him go free. The people you rescued are disgusted, and so are your men: less fame when you are paid, and morale -5.`; } },
      ] } },
  // ---- more that is asked at the fountain ----
  pilgrims: { type: 'give', ambush: true, verb: 'Bring them to the door', ambWon: 'The robbers expected old women with purses. They met a school of gladiators instead.', givers: ['priest', 'widow'], marks: ['The white temple', 'The sacred grove', 'The ring of stones', 'The drowned temple'], favor: ['temple', 5], pay: 0.8,
    title: m => `Pilgrims for ${lower(m)}`,
    ask: q => `"Nine of us have promised to pray at ${lower(q.mark)} before the season ends, and the youngest of us is sixty. The last group that went was robbed on the road. Walk with us and guard us. We have collected ${q.pay} denarii to pay you, and the Temple will be grateful."`,
    at: q => `You have reached ${lower(q.mark)}. The pilgrims sang the whole way, and by now your men are singing with them.`,
    won: q => `The pilgrims go in to pray. One of them gives every fighter a small clay charm as thanks.`,
    after: (q, lines) => { fieldParty().forEach(g => evMor(g, 6)); lines.push('Your men are in better spirits for it: morale +6.'); } },
  simples: { type: 'fetch', givers: ['physician'], marks: ['The hot spring', 'The sacred grove', 'The bog oak', 'The bee garden', 'The great waterfall'], pay: 0.7, thing: 'the root',
    title: m => `A root that grows at ${lower(m)}`,
    ask: q => `"A healing root grows at ${lower(q.mark)}, and nowhere else near here. Boiled, it cures a wound fever in one night. I have none left, and the country is too dangerous for me to go myself. Bring me a sackful and I will pay ${q.pay} denarii. I will treat your own men with it first."`,
    at: q => `You have reached ${lower(q.mark)}. The physician drew you a picture of the plant: grey, with toothed leaves, growing close to the ground. It will take some finding.`,
    won: q => `You fill a sack with the root.`,
    after: (q, lines) => {
      const sick = G.roster.filter(g => g.injury > 0); sick.forEach(g => { g.injury = Math.max(0, g.injury - 2); });
      fieldParty().forEach(g => { g.hp = Math.min(maxHp(g), g.hp + maxHp(g) * 0.25); });
      lines.push(`<span class="gold">The physician boils some of the root for your men, and it works${sick.length ? `: ${namesOf(sick)} will recover two days sooner` : ''}. Every man with you gets back some health.</span>`); } },
  burial: { type: 'give', day: true, givers: ['veteran', 'priest'], marks: ['An old battlefield', 'The gallows', 'A burnt village', 'The causeway'], favor: ['temple', 4], fame: 1, pay: 0.7,
    title: m => `The unburied at ${lower(m)}`,
    ask: q => `"Dead men are lying unburied at ${lower(q.mark)}. I knew some of them, and I have dreamed of them every night this month. I am too old to dig. Go there and bury them properly. I can pay ${q.pay} denarii, which is all I have."`,
    at: q => `You have reached ${lower(q.mark)}. The bodies are easy to find.`,
    won: q => `By evening the dead are buried, each with a coin for the ferryman, and wine has been poured on the grave.`,
    after: (q, lines) => { fieldParty().forEach(g => evMor(g, 4)); lines.push('Your men feel better for having done it: morale +4.'); learn('gravewise', 0.3, lines); } },
  strayed: { type: 'rescue', givers: ['veteran'], marks: ['The fort', 'The watchtower', 'The ferry', 'The charcoal burners'], marks2: ['The old arena', 'The gallows', 'A burnt village', 'The unfinished columns', 'The broken aqueduct'], bg: 'camp', favor: ['magistrate', 3], fame: 2, pay: 1.2,
    title: m => `A boy gone from ${lower(m)}`, boss: 'outlaw', goal: { kind: 'clean', pay: 1.2, met: 'None of your men went down, and the boy was not hurt in the fight. The old soldier pays extra.', miss: '' },
    foes: q => [questBoss(q.tier, q.boss, { traits: ['killer'], tactic: 'aggressive' })].concat(wildMen(q.tier, Math.max(1, wildCount(q.tier) - 2))),
    lead: q => `The leader of the band is <b>${q.boss}</b>. He takes in runaway boys like this one, and gets them killed.`,
    ask: q => `"My sister's boy joined the army at sixteen, and deserted from ${lower(q.mark)} within the year. If the Magistrate's men catch him, he will be executed. Find out who he left with and bring him to me, not to them. I will pay ${q.pay} denarii, and I will owe you a favour."`,
    at: q => `You have reached ${lower(q.mark)}. Nobody admits to having seen a deserter, except a girl carrying water.`,
    clue: q => `"He left with the men who drink at the back. They told him there was easy money to be made at ${lower(q.mark2)}. He did not look as if he believed them."`,
    at2: q => `You have found them at ${lower(q.mark2)}: a band of outlaws round a fire. The boy is with them, still in his soldier's tunic, holding a spear he plainly does not know how to use.`,
    won: q => `The boy throws down his spear before anyone reaches him. You take him home hidden in the middle of your column.` },
};
// What comes after. These are never offered cold: only by somebody whose first errand you have done and come home from.
Object.assign(ERRANDS, {
  wolfden: { chain: true, type: 'fight', givers: ['shepherd'], marks: ['The eagle rock', "The giant's table", 'The wolf stone', 'The great waterfall', 'The hot spring'], bg: 'rock', fame: 4, pay: 1.5, boss: 'great', trophy: true, harder: 1,
    title: m => `What drove them down, at ${lower(m)}`, foes: q => [questBeast(greatKind(q.tier), q.tier, q.boss, 1.8)].concat(lesser('wolf', q.tier, 2)),
    ask: q => `"You killed the wolves, and I am grateful. But wolves do not come down to a sheepfold in summer unless something has driven them off their own ground. My grandfather used to talk about a creature at ${lower(q.mark)}. Kill it and I will pay ${q.pay} denarii. I have sold my wool early to raise the money."`,
    at: q => `You have reached ${lower(q.mark)}. Something here frightened the wolves away.`, lead: q => `The shepherd's grandfather was right. The creature is <b>${q.boss}</b>, and it has two wolves with it.`,
    won: q => `The creature is dead. It is the biggest any of your men has seen, and nothing will come down from the hills this year.` },
  paymaster: { chain: true, type: 'fight', givers: ['merchant', 'clerk'], marks: ['The old arch', 'A villa in its garden', 'The wine press', 'The mill', 'The lime kiln'], bg: 'camp', fame: 3, pay: 1.4, boss: 'outlaw', favor: ['magistrate', 6], harder: 1,
    title: m => `The man who paid them, at ${lower(m)}`, foes: q => [questBoss(q.tier, q.boss, { boost: 3, traits: ['duelist', 'ironwill'], tactic: 'defensive' })].concat(wildMen(q.tier, Math.max(2, wildCount(q.tier) - 1), 2)),
    ask: q => `"The robbers' leader was carrying a letter. Somebody at ${lower(q.mark)} was telling them which carts to rob, and taking a third of the plunder. I cannot accuse him to the Magistrate without the man himself. Capture him and I will pay ${q.pay} denarii."`,
    at: q => `You have reached ${lower(q.mark)}. It looks like a respectable house, but there are far too many armed men inside.`, lead: q => `The man you want has hired a captain to guard him: <b>${q.boss}</b>, a former soldier.`,
    won: q => `You capture him alive, along with his account books. The Magistrate will want to read them.` },
  slavemart: { chain: true, type: 'fight', givers: ['widow', 'shepherd', 'merchant'], marks: ['The ferry', 'The salt pans', 'A wreck on the strand', 'The beacon', 'The huts on stilts'], bg: 'camp', fame: 4, pay: 1.2, boss: 'slaver', favor: ['guild', 6], recruit: true, harder: 1,
    title: m => `Where they are sold, at ${lower(m)}`, foes: q => [questBoss(q.tier, q.boss, { boost: 4, traits: ['brute', 'ironhide'], tactic: 'aggressive' })].concat(wildMen(q.tier, wildCount(q.tier), 2)),
    ask: q => `"My boy says other prisoners were taken before him, and were gone by the time you came. They were sent on to ${lower(q.mark)}, where a ship comes to collect them. He cannot sleep for thinking about them. Free them. I have ${q.pay} denarii left, and it is yours."`,
    at: q => `You have reached ${lower(q.mark)}. There is a pen full of prisoners, and a ship's boat on the shore. The slavers are loading them tonight.`, lead: q => `The slave buyer is here in person: <b>${q.boss}</b>, with his crew.`,
    won: q => `You break open the pen and free thirty people. The slavers' boat is burned on the beach.` },
  buried: { chain: true, type: 'fetch', givers: ['widow'], marks: ['The needle', "The giant's table", 'The old arch', 'The ring of stones', 'The great oak'], fame: 2, pay: 2.2, hard: true,
    title: m => `What he buried at ${lower(m)}`, thing: 'what he buried',
    ask: q => `"There is writing inside the ring. It says: <i>under the north side of ${lower(q.mark)}, a hand deep</i>. My husband was a soldier for twenty years, and I never saw any of his pay. I think he buried it there. Dig it up and half is yours: I reckon your share at ${q.pay} denarii."`,
    at: q => `You have reached ${lower(q.mark)}. The ring says to dig a hand deep on the north side, but forty years have passed and the ground has changed.`,
    won: q => `You dig up a soldier's belt, rotted through. Inside it is twenty years of pay, in silver.` },
  siege: { chain: true, type: 'fight', givers: ['clerk', 'veteran'], marks: ['The fort', 'The watchtower', 'The beacon'], bg: 'camp', fame: 5, pay: 1.1, boss: 'outlaw', relic: 'gladius', favor: ['magistrate', 5], harder: 1,
    title: m => `The siege of ${lower(m)}`, foes: q => [questBoss(q.tier, q.boss, { boost: 4, traits: ['ironhide', 'finisher'], tactic: 'balanced' })].concat(wildMen(q.tier, wildCount(q.tier), 3)),
    ask: q => `"The pay you carried has caused trouble. Word spread that there was money at ${lower(q.mark)}, and a band of deserters has surrounded it. Eight soldiers are trapped inside. Your school is the nearest help the Magistrate has. Drive the deserters off and I will pay ${q.pay} denarii, and the centurion will be grateful."`,
    at: q => `You have reached ${lower(q.mark)}. The deserters are camped all round it, and they are building a battering ram.`, lead: q => `They are trained soldiers who deserted. Their leader is <b>${q.boss}</b>.`,
    won: q => `The deserters run, and the soldiers open the gate. The centurion gives you his own sword as thanks.` },
});
ERRANDS.heirloom.next = 'buried'; ERRANDS.supplies.next = 'siege';

// A unique piece at a landmark: [relic, landmark, how it is won, the old soldier's tale, what is found there].
const RELIC_QUESTS = [
  ['kingsblade', 'The barrow of kings', 'men', 'The local tribes guard that burial mound, and will fight to keep it shut.', 'In the last chamber, on the knees of what was once a king', 'The barrow-warden'],
  ['tidemask', 'The drowned temple', 'beasts', 'Something lives in that marsh. People used to feed it, and it is still there.', 'Under the altar, in a foot of black water', 'The fed thing'],
  ['wolfmantle', 'The wolf stone', 'beasts', 'A wolf pack lives at that stone, and always has.', 'Folded in a hollow under the stone, dry as the day it was put there', 'The white wolf'],
  ['colossus', 'The fallen colossus', 'fetch', 'Nobody guards it, because nobody has thought to look inside the leg.', 'Inside the hollow bronze of the left shin'],
  ['cutlass', 'A wreck on the strand', 'men', 'Wreckers work that shore, and they think the wreck belongs to them.', "In the captain's locker, still shut", "The wreckers' captain"],
  ['oldhelm', 'The old arena', 'men', 'Fighters who call themselves his heirs train there. You will have to beat them first.', 'On a peg in the cell under the east gate', 'The best of his heirs'],
  ['eaglecrest', 'The eagle rock', 'fetch', 'It is a hard climb, and the eagles attack anyone who comes near.', 'In the nest itself, among the bones'],
  ['bracers', 'The great quarry', 'fetch', 'The old workings are flooded, and not safe.', 'On a skeleton pinned under a block in the lowest gallery'],
  ['bogiron', 'The bog oak', 'beasts', 'Some animal has its den in the roots of that tree.', 'Sunk in the peat between the roots', 'What lies in the roots'],
  ['girdle', 'The sacred grove', 'fetch', 'The priestess there will hand it over only to someone she thinks worthy.', 'From the hands of the priestess'],
  ['vinestaff', 'The great oak', 'fetch', 'He buried them under the tree himself, the day he was freed.', 'A hand deep, wrapped in oilcloth'],
];
RELIC_QUESTS.forEach(([k, mark, how, tale, where, keeper]) => {
  const R = RELICS[k];
  ERRANDS['relic_' + k] = { type: how === 'fetch' ? 'fetch' : 'fight', relic: k, givers: ['veteran', 'scholar'], marks: [mark], bg: how === 'beasts' ? 'forest' : 'ruin', fame: 4, pay: 0.4, thing: lower(R.name), hard: how === 'fetch',
    title: () => R.name, keeper: keeper || null,
    foes: q => how === 'beasts' ? [questBeast(k === 'wolfmantle' ? 'wolf' : greatKind(Math.max(3, q.tier)), q.tier, keeper, 1.6)].concat(lesser(k === 'wolfmantle' ? 'wolf' : 'boar', q.tier, 1 + Math.floor(q.tier / 2))) : [questBoss(q.tier, keeper, { boost: 3, traits: ['ironhide', 'finisher'], tactic: 'balanced' })].concat(wildMen(q.tier, Math.max(1, wildCount(q.tier) - 1), 2)),
    lead: q => keeper ? `It is guarded by <b>${keeper}</b>.` : '',
    ask: q => `"I will tell you this for free, because I am too old to use it myself. <b>${R.name}</b> is at ${lower(mark)}. ${tale} Send your men, and whatever you find there is yours. ${q.pay ? 'All I ask is that you come back and tell me how it went, and I will pay you ' + q.pay + ' denarii for the story' : 'I ask nothing for it'}."`,
    at: q => `You have reached ${lower(mark)}. ${tale}`,
    won: q => `${where}: <b>${R.name}</b>.` };
});

const asksNow = () => G.asks || (G.asks = []);
const errands = () => G.errands || (G.errands = []);
const errandById = id => errands().find(q => q.id === id) || null;
const errandOf = sid => errandById(+String(sid).slice(1));
const errandSites = () => errands().map(q => {
  const T = ERRANDS[q.tpl], second = T.type === 'rescue' && q.step === 1;
  return { id: 'e' + q.id, kind: 'errand_' + (T.type === 'rescue' ? (second ? 'fight' : 'clue') : T.type), x: second ? q.x2 : q.x, y: second ? q.y2 : q.y, tier: q.tier, name: T.title(second ? q.mark2 : q.mark), fixed: true, errand: q.id };
}).concat(journeySites()).concat(taleSites());      // and the landmarks where your own men's journeys end, and where a story of the place stands
// A new matter for the fountain, of about the right weight for the school as it stands. Null if nothing suits today.
function errandNew(only, giver) {
  const want = clamp(tier() + 1 + (chance(0.35) ? 1 : 0), 1, 5), taken = asksNow().concat(errands()).map(q => q.tpl), M = wildMap();
  const keys = Object.keys(ERRANDS).filter(k => (only ? k === only : !ERRANDS[k].chain) && !taken.includes(k) && !(ERRANDS[k].relic && (M.relics.includes(ERRANDS[k].relic) || G.armoury.some(it => it.relic === ERRANDS[k].relic))));
  // the unique pieces are spoken of less often than ordinary work, and only once the school can get there
  const pool = keys.filter(k => !ERRANDS[k].relic || only || (chance(0.3) && (landmarkAt(ERRANDS[k].marks[0]) ? wildTier(landmarkAt(ERRANDS[k].marks[0]).x, landmarkAt(ERRANDS[k].marks[0]).y) : 9) <= tier() + 3));
  if (!pool.length) return null;
  const tpl = pick(pool), T = ERRANDS[tpl];
  const spots = T.marks.map(m => ({ m, p: landmarkAt(m) })).filter(o => o.p).map(o => Object.assign(o, { t: wildTier(o.p.x, o.p.y) }));
  if (!spots.length) return null;
  const aim = clamp(want + (T.harder || 0), 1, 5), near = Math.min(...spots.map(o => Math.abs(o.t - aim))), spot = pick(spots.filter(o => Math.abs(o.t - aim) === near));
  const kind = giver ? giver.kind : pick(T.givers), Gv = GIVERS[kind], t = spot.t;
  // a quest far out costs a games day, so it is paid about what that day would have brought
  const q = { id: ++G.nextId, tpl, mark: spot.m, x: spot.p.x, y: spot.p.y, tier: t, giver: giver ? { kind: giver.kind, name: giver.name } : { kind, name: pick(Gv.names) }, step: 0,
    boss: T.keeper || (T.boss ? (L => { const free = L.filter(n => !G.roster.some(g => g.name === n)); return pick(free.length ? free : L); })(QUEST_NAMES[T.boss === 'great' ? greatKind(t) : T.boss]) : null),      // never the name of a man who has since sworn to you
    pay: round5(((80 + 60 * t) * rand(0.9, 1.2) + PURSE[tier()]) * (T.pay || 1)), fame: t + (T.fame || 0), leaves: G.day + 3, days: 10 + t * 3, relic: T.relic || null };
  if (T.type === 'rescue') { const s2 = T.marks2.map(m => ({ m, p: landmarkAt(m) })).filter(o => o.p && o.m !== q.mark); if (!s2.length) return null; const o = pick(s2); q.mark2 = o.m; q.x2 = o.p.x; q.y2 = o.p.y; q.tier = clamp(Math.max(t, wildTier(o.p.x, o.p.y) - 1), 1, 5); }
  return q;
}
// Each morning: those who have waited three days go home, and now and then somebody new is at the fountain.
function rollAsks(force) {
  const A = asksNow();
  G.asks = A.filter(q => q.leaves >= G.day);
  for (const q of errands().slice()) if (q.until < G.day) { G.errands = errands().filter(e => e !== q); delete wildMap().marks['e' + q.id]; G.fame = Math.max(0, G.fame - 1); log(`${q.giver.name} waited ${q.days} days for word of ${lower(ERRANDS[q.tpl].title(q.mark))}, and has gone elsewhere. It is talked of.`, 'bad'); }
  for (const q of owed().slice()) if (G.day - q.done > 30) { G.owed = owed().filter(o => o !== q); const n = round5(q.owedPay * 0.8); G.denarii += n; G.fame += q.owedFame; log(`${q.giver.name} could wait no longer, and left ${n} denarii with your steward.`, 'gold'); }
  if (!force && (!gateOpen() || G.asks.length >= 2 || !chance(0.4))) return null;
  const q = errandNew(typeof force === 'string' ? force : null);
  if (!q) return null;
  G.asks.push(q);
  log(`${q.giver.name}, ${GIVERS[q.giver.kind].what}, is waiting by the fountain in the square and asking for you.`, 'gold');
  return q;
}
function errandTake(id) {
  const q = asksNow().find(a => a.id === id);
  if (!q || errands().length >= 3) return null;
  G.asks = asksNow().filter(a => a !== q);
  q.until = G.day + q.days; q.taken = G.day;
  errands().push(q);
  wildMark('e' + q.id, 'quest');
  return q;
}
// Done, out there. What was found is yours at once; the pay is at the fountain, with whoever asked, when you are home.
// `res` is how the fight went, where there was one.
function errandDone(q, lines, res) {
  const T = ERRANDS[q.tpl];
  lines.push(T.won(q));
  let pay = q.pay, fame = q.fame;
  if (T.goal && res) {
    const secs = typeof T.goal.secs === 'function' ? T.goal.secs(q) : T.goal.secs, [met] = QUEST_GOALS[T.goal.kind](q, res, secs);
    if (met) { pay = round5(pay * (T.goal.pay || 1)); fame += T.goal.fame || 0; if (T.goal.loot) { const n = coinFor(30, q.tier); G.denarii += n; lines.push(`${T.goal.met} <b class="gold num">${n}</b> denarii of it.`); } else lines.push(`<span class="gold">${T.goal.met}</span>`); q.well = true; }
    else { pay = round5(pay * (T.goal.missPay || 1)); if (T.goal.miss) lines.push(`<span class="bad">${T.goal.miss}</span>`); }
  }
  if (T.trophy) { const it = wildGear(Math.min(5, q.tier + 1)); lines.push(`The hide and sinew of it are worth working: ${itemName(it)} is in your armoury.`); }
  if (q.relic && !wildMap().relics.includes(q.relic)) {
    const best = fieldParty()[0], it = makeItem(RELICS[q.relic].slot, RELICS[q.relic].r, best ? best.cls : Object.keys(CLASSES)[0]);
    it.relic = q.relic; wildMap().relics.push(q.relic); G.armoury.push(it);
    lines.push(`<span class="gold"><b>${RELICS[q.relic].name}</b> is in your armoury${it.slot === 'weapon' ? `, and it suits the hand of a ${CLASSES[it.cls].name.toLowerCase()}` : ''}.</span> <span class="dim">${RELICS[q.relic].note}</span>`);
  }
  if (T.recruit && G.roster.length < capacity()) { const g = makeGladiator(WILD_BUDGET[q.tier - 1] + 2); g.origin = 'a slaver\'s pen'; G.roster.push(g); lines.push(`<span class="gold">One of those freed was sold out of an arena in the east. <b>${g.name}</b>, ${CLASSES[g.cls].name.toLowerCase()}, asks to fight for the house that came for him.</span>`); }
  if (T.after) T.after(q, lines);
  G.errands = errands().filter(e => e !== q);
  delete wildMap().marks['e' + q.id];
  q.done = G.day; q.owedPay = pay; q.owedFame = fame;
  owed().push(q);
  lines.push(`<span class="gold">${q.giver.name} will be at the fountain when you are home, with <b class="num">${pay}</b> denarii.</span>`);
  G.questsDone = (G.questsDone || 0) + 1;
  log(`Done: ${lower(T.title(q.mark))}. ${q.giver.name} is owed the news.`, 'gold');
  if (T.twist && G.field && chance(0.7)) errandTwist(q);      // and often there is something more to settle before you leave
  return lines;
}
// What is found when the work is done: a choice of your own, which may change what is waiting at the fountain.
function errandTwist(q) { raiseEvent('wAfter_' + q.tpl, { o: q.id }); }
const goalHint = T => !T.goal ? '' : T.goal.kind === 'clean' ? 'best done without a man of yours going down' : 'best done quickly';
const owed = () => G.owed || (G.owed = []);
// A matter taken on and given up: word is sent that it will not be done. It costs what letting it lapse would.
function errandDrop(id) {
  const q = errandById(id); if (!q) return false;
  G.errands = errands().filter(e => e !== q); delete wildMap().marks['e' + q.id]; G.fame = Math.max(0, G.fame - 1);
  log(`You send word to ${q.giver.name} that ${lower(ERRANDS[q.tpl].title(q.mark))} will not be done. It is talked of.`, 'bad');
  return true;
}
// Home again: the purse, the thanks, and sometimes something more. Returns what is said.
function errandPay(id, refuse) {
  const q = owed().find(o => o.id === id); if (!q) return ['Whoever it was has gone.'];
  const T = ERRANDS[q.tpl], lines = [];
  G.owed = owed().filter(o => o !== q);
  if (refuse) { G.fame += q.owedFame + 2; G.roster.forEach(g => { g.morale = clamp(g.morale + 3, 0, 100); }); lines.push(`You refuse the money and tell ${q.giver.name} to keep it. The whole town hears of it by nightfall: <b class="num">+${q.owedFame + 2}</b> fame. Your own men respect you for it: morale +3.`); }
  else { G.denarii += q.owedPay; G.fame += q.owedFame; lines.push(`You are paid <b class="gold num">${q.owedPay}</b> denarii, and gain <b class="num">+${q.owedFame}</b> fame.`); }
  if (T.favor) { favor(T.favor[0], T.favor[1]); lines.push(`${PATRONS[T.favor[0]].name} hears of it: favour +${T.favor[1]}.`); }
  if (T.next && !asksNow().some(a => a.tpl === T.next) && !errands().some(e => e.tpl === T.next)) {      // and there is more
    const nx = errandNew(T.next, q.giver);
    if (nx) { if (nx.tier < q.tier) { nx.pay += 60 * (q.tier - nx.tier); nx.fame += q.tier - nx.tier; nx.tier = q.tier; }      // what follows is never easier than what came before, wherever it lies
      nx.leaves = G.day + 5; nx.from = q.tpl; asksNow().push(nx); lines.push(`<span class="gold">${q.giver.name} has another, harder quest for you. Ask at the fountain to hear it.</span>`); }
  }
  return lines;
}

Object.assign(SITE_EVENT, { errand_fight: 'wErrandFight', errand_fetch: 'wErrandFetch', errand_give: 'wErrandGive', errand_clue: 'wErrandClue' });
Object.assign(WILD_WINS, {
  errand(F) { const q = errandById(F.eid); return q ? errandDone(q, [], F.res) : ['Whoever asked for this is gone.']; },
  // the men who were waiting on the road are beaten: the delivery is made
  errandAmb(F) { const q = errandById(F.eid); return q ? errandDone(q, [ERRANDS[q.tpl].ambWon || 'The robbers expected a lone cart driver. They met a school of gladiators instead.']) : []; },
  // whatever was guarding it is dead: now it can be looked for in peace
  errandGuard(F) { const q = errandById(F.eid); if (!q) return []; q.clear = true; return [`Nothing else is going to come out of ${lower(q.mark)}. The men can search it properly now.`].concat(errandDone(q, [])); },
});
// For an event to be raised there must be such a matter in hand; if there is none, one is made (as the bounty is).
function errandEnsure(kind) {
  const find = () => errandSites().find(x => x.kind === 'errand_' + kind);
  if (!find()) { const key = Object.keys(ERRANDS).find(k => { const T = ERRANDS[k]; return !T.relic && !errands().some(q => q.tpl === k) && (kind === 'clue' ? T.type === 'rescue' : T.type === kind); }), q = key && errandNew(key); if (q) { q.until = G.day + q.days; errands().push(q); wildMark('e' + q.id, 'quest'); } }
  const st = find(); return st ? { sid: st.id } : {};
}
const errandC = c => errandOf(c.sid) || { tpl: 'wolves', mark: 'this place', mark2: 'that place', tier: 1, pay: 0, fame: 0, giver: { name: 'Nobody', kind: 'shepherd' }, gone: true };
const bestWits = () => Math.max(0, ...fieldParty().map(g => g.stats.skl + g.stats.agi));
const ERRAND_EVENTS = {
  wErrandFight: {
    title: 'You have reached your quest', can: () => !!G.field, make: () => errandEnsure('fight'),
    text: c => { const q = errandC(c), T = ERRANDS[q.tpl]; return `<b>${T.title(T.type === 'rescue' ? q.mark2 : q.mark)}</b> <span class="bad">${skulls(q.tier)}</span>. ${T.type === 'rescue' ? T.at2(q) : T.at(q)}${T.lead && q.boss ? ' ' + T.lead(q) : ''}${sizeUp(c, () => T.foes(q))} The fight will take the rest of the day.`; },
    opts: [
      { label: () => 'Fight', ok: c => canFightNow() && !errandC(c).gone, run: c => { const q = errandC(c), T = ERRANDS[q.tpl]; return wildFight(T.title(T.type === 'rescue' ? q.mark2 : q.mark), T.foes(q), T.bg || 'forest', 'errand', { eid: q.id, tier: q.tier, day: true }); } },
      { label: () => 'Not today', run: () => 'You pull back without fighting. You can return later, as long as the quest has not run out of time.' },
    ],
  },
  wErrandFetch: {
    title: 'The place you must search', can: () => !!G.field, make: () => errandEnsure('fetch'),
    text: c => { const q = errandC(c), T = ERRANDS[q.tpl]; return `<b>${T.title(q.mark)}</b>. ${T.at(q)}${q.tries ? ` You have already searched here ${q.tries === 1 ? 'once' : q.tries + ' times'} without success. Each search makes the next more likely to succeed.` : ''}`; },
    opts: [
      { label: () => 'Search carefully (takes the day; may find nothing)', ok: c => !errandC(c).gone, run: c => {
        const q = errandC(c), T = ERRANDS[q.tpl]; aDay();
        if (chance(clamp((T.hard ? 0.3 : 0.5) + bestWits() * 0.012 + (q.tries || 0) * 0.15, 0.2, 0.95))) return errandDone(q, []).join(' ');
        q.tries = (q.tries || 0) + 1; return `You search all day and find nothing. But you have ruled out a good part of ${lower(q.mark)}, so the next search is more likely to succeed.`; } },
      { label: () => 'Search fast and roughly (certain to find it; risk of a fight or an injury)', ok: c => !errandC(c).gone, run: c => {
        const q = errandC(c), T = ERRANDS[q.tpl];
        if (T.guard && !q.clear && chance(0.5) && canFightNow()) return wildFight(T.title(q.mark), wildMen(q.tier, Math.max(2, wildCount(q.tier) - 1)), 'ruin', 'errandGuard', { eid: q.id, tier: q.tier, day: true });
        const lines = [];
        if (chance(T.hard ? 0.5 : 0.25)) { const g = pick(fieldParty()); if (g) { g.injury = Math.max(g.injury, rint(1, 3)); addScar(g, 'cut'); lines.push(`You find it within the hour, but <b>${g.name}</b> is hurt in the rush, and will be out for ${g.injury} day${g.injury === 1 ? '' : 's'}.`); } }
        return lines.concat(errandDone(q, [])).join(' '); } },
      { label: () => 'Not today', run: () => 'You leave the search for another day.' },
    ],
  },
  wErrandGive: {
    title: 'You have arrived', can: () => !!G.field, make: () => errandEnsure('give'),
    text: c => { const q = errandC(c), T = ERRANDS[q.tpl]; return `<b>${T.title(q.mark)}</b>. ${T.at(q)}${T.cost ? ` Your own gift will cost <b class="num">${T.cost}</b> denarii.` : ''}${T.day ? ' It will take the rest of the day.' : ''}`; },
    opts: [
      { label: c => { const T = ERRANDS[errandC(c).tpl]; return T.cost ? `Make the offering (${T.cost} denarii)` : T.day ? 'Stay for the day and do it' : T.verb || 'Hand it over'; }, ok: c => !errandC(c).gone && G.denarii >= (ERRANDS[errandC(c).tpl].cost || 0), run: c => {
        const q = errandC(c), T = ERRANDS[q.tpl];
        if (T.ambush && !q.amb && chance(0.35) && canFightNow()) { q.amb = true; return wildFight('Men on the road', wildMen(q.tier, Math.max(2, wildCount(q.tier) - 1)), 'camp', 'errandAmb', { eid: q.id, tier: q.tier, day: true }); }
        if (T.cost) G.denarii -= T.cost;
        if (T.day) aDay();
        return errandDone(q, []).join(' '); } },
      { label: () => 'Not today', run: () => 'You do not finish the quest today. You can return later.' },
    ],
  },
  wErrandClue: {
    title: 'A witness tells you where to go', can: () => !!G.field, make: () => errandEnsure('clue'),
    text: c => { const q = errandC(c), T = ERRANDS[q.tpl]; return `<b>${T.title(q.mark)}</b>. ${T.at(q)} ${T.clue(q)}`; },
    opts: [
      { label: c => `Go after them, to ${lower(errandC(c).mark2)}`, ok: c => !errandC(c).gone, run: c => { const q = errandC(c); q.step = 1; wildMark('e' + q.id, 'quest'); return `<span class="gold">${q.mark2} is now marked on your map.</span> You have ${Math.max(0, q.until - G.day)} days left to finish this quest for ${q.giver.name}.`; } },
      { label: () => 'Not today', run: () => 'You do not follow the trail yet. You can come back and ask again.' },
    ],
  },
  // in town: the one at the fountain says what is wanted
  errandOffer: {
    title: 'Someone asks for your help', can: () => true, make: () => { const q = asksNow()[0] || rollAsks(true); return { a: q ? q.id : 0 }; },
    text: c => { const q = asksNow().find(a => a.id === c.a); if (!q) return 'Whoever it was has gone.'; const T = ERRANDS[q.tpl], p = { x: q.x, y: q.y };
      return `<b>${q.giver.name}</b>, ${GIVERS[q.giver.kind].what}, is waiting by the fountain to speak to you. ${T.ask(q)}<br><br><small style="color:#5a4326">The place is ${lower(q.mark)}, in ${wildRegion(p.x, p.y)}, reached through the east gate. Danger: <span class="bad">${skulls(q.tier)}</span>. ${q.relic ? `<b>${RELICS[q.relic].name}</b>: ${RELICS[q.relic].note} ` : ''}It must be done within ${q.days} days${goalHint(T) ? ', and ' + goalHint(T) : ''}. You have accepted ${errands().length} of the 3 quests you can hold at once.</small>`; },
    opts: [
      { label: () => 'Accept the quest', ok: c => errands().length < 3 && !!asksNow().find(a => a.id === c.a), run: c => { const q = errandTake(c.a); return q ? `You accept. The place is now marked on your map of the province: <b>${q.mark}</b>. You have ${q.days} days to do it.` : 'The quest could not be agreed.'; } },
      { label: () => 'Not today', run: c => { const q = asksNow().find(a => a.id === c.a); return q ? `You do not decide yet. ${q.giver.name} will wait at the fountain for ${Math.max(1, q.leaves - G.day + 1)} more day${q.leaves - G.day + 1 === 1 ? '' : 's'}, and will then ask somebody else.` : 'Nobody is there.'; } },
      { label: () => 'Refuse for good', run: c => { G.asks = asksNow().filter(a => a.id !== c.a); return 'You refuse. They leave to ask somebody else, and will not come back.'; } },
    ],
  },
};
ERRAND_EVENTS.errandThanks = {
  title: 'Your reward is waiting', can: () => true,
  make: () => { if (!owed().length) { const q = errandNew('wolves') || errandNew('bandits'); if (q) { q.done = G.day; q.owedPay = q.pay; q.owedFame = q.fame; owed().push(q); } } return { o: owed().length ? owed()[0].id : 0 }; },
  text: c => { const q = owed().find(o => o.id === c.o); if (!q) return 'Whoever it was has gone.'; const T = ERRANDS[q.tpl];
    return `<b>${q.giver.name}</b> has heard that the quest is done, and is waiting by the fountain to pay you. "${q.well ? 'They tell me it could not have been done better.' : 'So it is done.'} I promised <b class="num">${q.owedPay}</b> denarii, and here it is."${T.next ? ' But they seem to have something more to ask of you.' : ''}`; },
  opts: [
    { label: c => { const q = owed().find(o => o.id === c.o); return `Take the payment${q ? ' (+' + q.owedPay + ' denarii)' : ''}`; }, run: c => errandPay(c.o, false).join(' ') },
    { label: () => 'Refuse the payment (fame +2 extra, morale +3)', run: c => errandPay(c.o, true).join(' ') },
  ],
};
// Out there, with the work done: one such moment for each kind of quest that has one.
const owedById = id => owed().find(o => o.id === id) || null;
for (const k in ERRANDS) {
  const W = ERRANDS[k].twist; if (!W) continue;
  ERRAND_EVENTS['wAfter_' + k] = {
    title: W.title, can: () => !!G.field,
    make: () => { let q = owed().find(o => o.tpl === k); if (!q) { q = errandNew(k); if (q) { q.done = G.day; q.owedPay = q.pay; q.owedFame = q.fame; owed().push(q); } } return { o: q ? q.id : 0 }; },
    text: c => { const q = owedById(c.o); return q ? W.text(q) : 'The moment has passed.'; },
    opts: W.opts.map(o => ({
      label: c => { const q = owedById(c.o); return q ? o.label(q) : 'Go on'; },
      ok: c => { const q = owedById(c.o); return !q || !o.ok || o.ok(q); },
      run: c => { const q = owedById(c.o); return q ? o.run(q) : 'It is settled already.'; } })),
  };
}
for (const id in ERRAND_EVENTS) Object.assign(ERRAND_EVENTS[id], id === 'errandOffer' || id === 'errandThanks' ? { auto: true } : { auto: true, wild: true });
Object.assign(EVENTS, ERRAND_EVENTS);
// What is said first when the lanista walks up to the fountain: the next person waiting.
// i: which of those standing there (as fountainFolk lists them); with none named, whoever is first.
function fountainTalk(i) {
  if (G.pendingEvent) return false;
  const f = fountainFolk()[i || 0]; if (!f) return false;
  if (f.owed) raiseEvent('errandThanks', { o: f.q.id }); else raiseEvent('errandOffer', { a: f.q.id });
  return true;
}
const fountainFolk = () => owed().map(q => ({ q, owed: true })).concat(asksNow().map(q => ({ q, owed: false }))).slice(0, 3);

// =====================================================================================================
// MORE THAT CAN HAPPEN: on the road, and at home
// =====================================================================================================
const ROAD_EVENTS = {
  wPedlar: {
    title: 'A pedlar on the road', can: () => !!G.field, make: () => ({ cost: 25 + 15 * wildTier(G.field.x, G.field.y) }),
    text: c => `A pedlar with a loaded mule has stopped by the road to let you pass. He sells healing ointment and lucky charms.`,
    opts: [
      { label: c => `Buy ointment for every man (${c.cost} denarii; restores health)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; fieldParty().forEach(g => { g.hp = Math.min(maxHp(g), g.hp + maxHp(g) * 0.25); }); return 'The ointment smells terrible, but it works. Every man with you gets back a quarter of his health.'; } },
      { label: c => `Buy a lucky charm (${Math.round(c.cost / 2)} denarii; morale +6)`, ok: c => G.denarii >= Math.round(c.cost / 2), run: c => { G.denarii -= Math.round(c.cost / 2); fieldParty().forEach(g => evMor(g, 6)); return 'You buy a bronze charm for luck. The men pass it round, and feel better for it: morale +6.'; } },
      { label: () => 'Buy nothing', run: () => 'You buy nothing and march on.' },
    ],
  },
  wStorm: {
    title: 'A storm is coming', can: () => !!G.field, make: () => ({}),
    text: () => 'A heavy storm is coming in from the west, and hail has started to fall. There is a sheltered hollow nearby where your men could wait it out.',
    opts: [
      { label: () => 'Take shelter (loses the rest of the day; men rest)', run: () => { aDay(); fieldParty().forEach(g => { g.fatigue = clamp(g.fatigue - 10, 0, 100); }); return 'You wait out the storm under cover. The day is lost, but your men are rested: a little less tired.'; } },
      { label: () => 'March through it (no time lost; tiring, morale -3)', run: () => { fieldParty().forEach(g => { g.fatigue = clamp(g.fatigue + 14, 0, 100); evMor(g, -3); }); return 'You march on through the storm and lose no time. Every man is soaked and more tired: morale -3.'; } },
    ],
  },
  wShepherdBoy: {
    title: 'A boy offers to show you a short cut', can: () => !!G.field, make: () => ({}),
    text: () => 'A shepherd boy has been watching your men from the hillside. He comes down and says he knows a short cut that would save you half a day of marching. He will show you the way for five denarii.',
    opts: [
      { label: () => 'Pay him five denarii (usually saves half a day)', ok: () => G.denarii >= 5, run: () => { G.denarii -= 5; if (chance(0.8)) { G.field.march = Math.max(0, (G.field.march || 0) - marchDay() * 0.4); return 'The short cut is real, and better than the road. You have saved nearly half a day of marching.'; } fieldParty().forEach(g => { g.fatigue = clamp(g.fatigue + 8, 0, 100); }); return 'The path ends at a marsh, and the boy has run off with your five denarii. Your men are a little more tired from the wasted walk.'; } },
      { label: () => 'Stay on the road', run: () => 'You stay on the road, and the boy goes back to his sheep.' },
    ],
  },
  wDeadMule: {
    title: 'An abandoned cart with its load', can: () => !!G.field, make: () => ({ tier: wildTier(G.field.x, G.field.y) }),
    text: () => 'A cart stands in the road with its mule lying dead in front of it. The driver is nowhere to be seen, and the load is still tied down on the cart.',
    opts: [
      { label: () => 'Take the load (coin; it may be a trap)', run: c => { if (chance(0.3) && canFightNow()) return wildFight('The men who left the cart', wildMen(c.tier, Math.max(2, wildCount(c.tier) - 2)), 'camp', 'ambush', { tier: c.tier }); const n = coinFor(18, c.tier); G.denarii += n; return `The load is jars of oil. You sell them at the next farm for <b class="gold num">${n}</b> denarii.`; } },
      { label: () => 'Find the driver and bury him (morale +4, fame +1)', run: () => { fieldParty().forEach(g => evMor(g, 4)); G.fame += 1; return 'You find the driver dead in the ditch, and your men bury him. They feel better for doing it: morale +4. People nearby hear of it: fame +1.'; } },
      { label: () => 'Leave it alone', run: () => 'You leave the cart alone and march on.' },
    ],
  },
  wOldSoldier: {
    title: 'An old soldier offers advice', can: () => !!G.field && fieldParty().length > 0, make: () => ({ g: pick(fieldParty()).id }),
    text: c => `An old soldier is sitting by the road. He watches <b>${gn(c.g)}</b> walk past, and remarks that he drops his shoulder when he moves, which is a fault in a fighter. He could show him how to correct it.`,
    opts: [
      { label: () => 'Stop and let him teach (loses the rest of the day; skill practice)', run: c => { const g = byId(c.g); aDay(); if (g) addProg(g, 'skl', 2); return `The lesson takes the rest of the day. ${gn(c.g)} corrects the fault, and gets a good deal of skill practice from it.`; } },
      { label: () => 'Give him some bread and march on (morale +2)', run: () => { fieldParty().forEach(g => evMor(g, 2)); return 'You give the old man some bread and march on. Your men approve: morale +2.'; } },
    ],
  },
  wWedding: {
    title: 'A village wedding', can: () => !!G.field, make: () => ({}),
    text: () => 'A village on your road is celebrating a wedding. The villagers insist that your men stop and join the feast.',
    opts: [
      { label: () => 'Stay for the feast (loses the rest of the day; morale +10)', run: () => { aDay(); fieldParty().forEach(g => { evMor(g, 10); g.hp = Math.min(maxHp(g), g.hp + maxHp(g) * 0.1); }); return 'Your men eat, drink and dance for the rest of the day. Morale +10, and they get back a little health.'; } },
      { label: () => 'Have one drink and march on (morale +3)', run: () => { fieldParty().forEach(g => evMor(g, 3)); return 'Your men have one cup of wine each, and march on. The villagers cheer them: morale +3.'; } },
    ],
  },
  wSpring: {
    title: 'A spring of clean water', can: () => !!G.field, make: () => ({}),
    text: () => 'A spring of cold, clean water flows out of the rock here into an old stone basin.',
    opts: [
      { label: () => 'Stop to drink and wash (less tired, a little health)', run: () => { fieldParty().forEach(g => { g.fatigue = clamp(g.fatigue - 12, 0, 100); g.hp = Math.min(maxHp(g), g.hp + maxHp(g) * 0.08); }); return 'Your men stop to drink, wash and fill their water skins. They are less tired, and get back a little health. No time is lost.'; } },
      { label: () => 'March on without stopping', run: () => 'You take a quick drink and march on.' },
    ],
  },
  wToll: {
    title: 'Men demand a toll at a bridge', can: () => !!G.field, make: () => ({ toll: 15 + 10 * wildTier(G.field.x, G.field.y), tier: wildTier(G.field.x, G.field.y) }),
    text: c => `A chain has been stretched across the road at a bridge, and four men with clubs are guarding it. They say the landowner charges a toll here: <b class="num">${c.toll}</b> denarii for a group of your size.`,
    opts: [
      { label: c => `Pay the toll (${c.toll} denarii)`, ok: c => G.denarii >= c.toll, run: c => { G.denarii -= c.toll; return `You pay the ${c.toll} denarii, and they lower the chain.`; } },
      { label: () => 'Refuse, and threaten them (they may back down, or fight)', run: c => { if (chance(0.6)) { fieldParty().forEach(g => evMor(g, 4)); return 'The four men look at your gladiators and decide not to argue. They lower the chain, and you pay nothing. Your men enjoy it: morale +4.'; } return wildFight('The toll-men', wildMen(c.tier, Math.max(2, wildCount(c.tier) - 2)), 'camp', 'ambush', { tier: c.tier }); } },
    ],
  },
};
for (const id in ROAD_EVENTS) Object.assign(ROAD_EVENTS[id], { auto: true, wild: true });
Object.assign(EVENTS, ROAD_EVENTS);
// What stops the column on the road: one of eleven things, and never the same one twice running.
function roadEventId() {
  const all = ['wAmbush', 'wAmbush', 'wTraveller', 'wFind', 'wFireside', 'wFireside'].concat(Object.keys(ROAD_EVENTS)).filter(id => EVENTS[id] && EVENTS[id].can());
  const seen = G.field.roadSeen || (G.field.roadSeen = []), fresh = all.filter(id => !seen.includes(id));
  const id = pick(fresh.length ? fresh : all);
  seen.push(id); if (seen.length > 5) seen.shift();
  return id;
}

const TOWN_EVENTS = {
  wallName: {
    title: 'A fighter\'s name painted on a wall', can: () => G.roster.some(g => g.wins >= 2), make: () => ({ g: pick(G.roster.filter(g => g.wins >= 2)).id }),
    text: c => `Somebody has painted <b>${gn(c.g)}</b>'s name in huge letters on a wall in town, with a drawing of him beside it.`,
    opts: [
      { label: () => 'Leave it there (fame +1, his morale +8)', run: c => { evMor(byId(c.g), 8); G.fame += 1; return `You leave it there. ${gn(c.g)} is proud of it: morale +8. Fame +1.`; } },
      { label: () => 'Pay to have it painted bigger (15 denarii; fame +3, his morale +10)', ok: () => G.denarii >= 15, run: c => { G.denarii -= 15; evMor(byId(c.g), 10); G.fame += 3; return 'You pay to have it painted even bigger, so that the whole town can read it. Fame +3, and his morale is +10.'; } },
      { label: () => 'Have it cleaned off (his morale -5)', run: c => { evMor(byId(c.g), -5); return 'You have it cleaned off. He is disappointed: morale -5.'; } },
    ],
  },
  gateDog: {
    title: 'A stray dog at the gate', can: () => home().length > 0, make: () => ({}),
    text: () => 'A stray dog has been lying at the school gate for three days. The men have been secretly feeding it.',
    opts: [
      { label: () => 'Let it stay (morale +4)', run: () => { evAllMor(4); return 'You let the dog stay. The men give it a name and a place by the kitchen fire. Morale +4 for everyone.'; } },
      { label: () => 'Drive it away (morale -3)', run: () => { evAllMor(-3); return 'You have the dog driven away. The men are sorry: morale -3 for everyone.'; } },
    ],
  },
  lostBet: {
    title: 'Two fighters quarrel over a gambling debt', can: () => home().length >= 2, make: () => { const h = home().slice(), a = h.splice(Math.floor(Math.random() * h.length), 1)[0], b = pick(h); return { a: a.id, b: b.id }; },
    text: c => `<b>${gn(c.a)}</b> lost eleven denarii to <b>${gn(c.b)}</b> at dice, and refuses to pay, saying that the dice were rigged. The two men are close to fighting over it.`,
    opts: [
      { label: () => 'Pay the debt yourself (11 denarii; morale +4 each)', ok: () => G.denarii >= 11, run: c => { G.denarii -= 11; evMor(byId(c.a), 4); evMor(byId(c.b), 4); return 'You pay the eleven denarii yourself. Both men are satisfied: morale +4 each.'; } },
      { label: () => 'Let them fight it out with wooden swords (skill practice)', run: c => { const a = byId(c.a), b = byId(c.b), w = evPower(a) >= evPower(b) ? a : b, l = w === a ? b : a; addProg(w, 'skl', 1); addProg(l, 'skl', 1); evMor(w, 5); evMor(l, -4); return `${w.name} wins the practice fight. Both men get some skill practice. The winner's morale is +5, and the loser's is -4.`; } },
      { label: () => 'Ban dice in the barracks (morale -4)', run: () => { evAllMor(-4); return 'You ban dice in the barracks. The men resent it: morale -4 for everyone.'; } },
    ],
  },
  versifier: {
    title: 'A poet offers to praise your best fighter', can: () => G.roster.some(g => g.wins >= 3), make: () => ({ g: G.roster.slice().sort((a, b) => b.wins - a.wins)[0].id, cost: 40 + tier() * 30 }),
    text: c => `A Greek poet offers to write a poem about the victories of <b>${gn(c.g)}</b> and recite it in the town square. He wants ${c.cost} denarii and a meal.`,
    opts: [
      { label: c => `Pay him (${c.cost} denarii; fame, his morale +8)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; G.fame += 4 + tier() * 2; evMor(byId(c.g), 8); return `He recites the poem in the town square, and people enjoy it. Fame +${4 + tier() * 2}, and your fighter's morale is +8.`; } },
      { label: () => 'Give him a meal and send him away', run: () => 'You give him a meal and send him away. He eats a great deal and writes nothing.' },
    ],
  },
  ratCatcher: {
    title: 'Rats are eating your grain', can: () => true, make: () => ({ cost: 20 + tier() * 10 }),
    text: c => `The cook has found that rats are getting into the grain sacks. A rat-catcher with dogs will clear them out for ${c.cost} denarii.`,
    opts: [
      { label: c => `Hire the rat-catcher (${c.cost} denarii)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; return 'The rat-catcher and his dogs clear out the rats in an afternoon.'; } },
      { label: () => 'Have the men hunt them (morale +2, a little tiring)', run: () => { home().forEach(g => { g.fatigue = clamp(g.fatigue + 8, 0, 100); }); evAllMor(2); return 'The men make a game of hunting the rats, and kill most of them. They are a little more tired, and morale is +2.'; } },
      { label: () => `Do nothing (costs ${15 + tier() * 15} denarii in lost grain)`, run: () => { const n = 15 + tier() * 15; G.denarii -= Math.min(G.denarii, n); return `You do nothing, and the rats eat ${n} denarii worth of grain.`; } },
    ],
  },
  boyRuns: {
    title: 'A boy keeps coming to watch', can: () => G.roster.some(g => g.wins > 0), make: () => ({ g: pick(G.roster.filter(g => g.wins > 0)).id }),
    text: c => `The baker's son, who is about ten, has been caught in your training yard for the third time. He comes to copy <b>${gn(c.g)}</b>, using a stick for a sword.`,
    opts: [
      { label: () => 'Let him watch in the mornings (fame +1, the fighter\'s morale +6)', run: c => { evMor(byId(c.g), 6); G.fame += 1; return `You let the boy watch. ${gn(c.g)} enjoys having an admirer: morale +6. The baker is grateful, and people hear of it: fame +1.`; } },
      { label: () => 'Send him home', run: () => 'You send the boy home. He will probably be back.' },
    ],
  },
  physician: {
    title: 'A travelling physician', can: () => home().length > 0, make: () => ({ g: home().slice().sort((a, b) => (b.injury - a.injury) || (a.hp / maxHp(a) - b.hp / maxHp(b)))[0].id, cost: 50 + tier() * 30 }),
    text: c => `A skilled Greek physician is passing through town, and leaves tomorrow. For ${c.cost} denarii he will treat <b>${gn(c.g)}</b>, the man who needs it most.`,
    opts: [
      { label: c => `Pay him (${c.cost} denarii)`, ok: c => G.denarii >= c.cost, run: c => { const g = byId(c.g); G.denarii -= c.cost; if (!g) return 'The man he came to see is gone.'; if (g.injury > 0) { g.injury = Math.max(0, Math.ceil(g.injury / 2) - 1); return `The physician treats the injury far better than your own man could. ${g.name} will now be fit again in ${g.injury} day${g.injury === 1 ? '' : 's'}, less than half the time.`; } g.hp = maxHp(g); g.fatigue = clamp(g.fatigue - 20, 0, 100); return `The physician finds no injury, but he treats ${g.name} all the same. He is back at full health, and less tired.`; } },
      { label: () => 'Refuse', run: () => 'You refuse, and the physician travels on.' },
    ],
  },
  hotDay: {
    title: 'The hottest day of the year', can: () => fit().length > 0, make: () => ({}),
    text: () => 'It is the hottest day of the year. By mid-morning the sand of the training yard is too hot to stand on, and your trainer is still working the men.',
    opts: [
      { label: () => 'Train only at dawn and dusk (less tired, morale +3)', run: () => { fit().forEach(g => { g.fatigue = clamp(g.fatigue - 8, 0, 100); evMor(g, 3); }); return 'The men rest in the shade through the heat of the day. They are less tired, and morale is +3.'; } },
      { label: () => 'Train as usual (strength practice, tiring)', run: () => { fit().forEach(g => { g.fatigue = clamp(g.fatigue + 12, 0, 100); addProg(g, 'str', 1); }); return 'The men train through the heat. It builds their strength, but they are much more tired.'; } },
    ],
  },
  taxMan: {
    title: 'The tax collector calls', can: () => G.denarii >= 100, make: () => ({ tax: round5(G.denarii * 0.08), bribe: round5(G.denarii * 0.03) + 10 }),
    text: c => `A tax collector from the treasury has come to count what your school owns. He says you owe <b class="num">${c.tax}</b> denarii in tax.`,
    opts: [
      { label: c => `Pay the tax (${c.tax} denarii; Magistrate favour +2)`, run: c => { G.denarii -= c.tax; favor('magistrate', 2); return `You pay the ${c.tax} denarii. Magistrate favour +2.`; } },
      { label: c => `Bribe him instead (${c.bribe} denarii; risky)`, ok: c => G.denarii >= c.bribe, run: c => { G.denarii -= c.bribe; if (chance(0.75)) return `He takes the bribe of ${c.bribe} denarii, and decides that you owe no tax.`; G.denarii -= Math.min(G.denarii, c.tax); favor('magistrate', -4); return `He takes your bribe of ${c.bribe} denarii, makes you pay the tax of ${c.tax} as well, and reports you to the Magistrate. Magistrate favour -4.`; } },
    ],
  },
  songbird: {
    title: 'Children are singing about your school', can: () => G.tally.wins > 0 || G.roster.some(g => g.wins > 0), make: () => ({}),
    text: () => 'The children in the street have made up a song about you and your school. It is cheeky, and not very respectful.',
    opts: [
      { label: () => 'Laugh along with it (fame +2)', run: () => { G.fame += 2; return 'You laugh about it in public, and people like you the better for it. Fame +2.'; } },
      { label: () => 'Have them chased away (fame -1)', run: () => { G.fame = Math.max(0, G.fame - 1); return 'You have the children chased away. They make up a new verse mocking you for it. Fame -1.'; } },
    ],
  },
  wineGift: {
    title: 'A patron sends you wine', can: () => home().length > 0, make: () => ({ p: pick(Object.keys(G.patrons)) }),
    text: c => `A barrel of good wine has been delivered to your gate, as a gift from ${PATRONS[c.p].name}.`,
    opts: [
      { label: () => 'Give it to the men (morale +8, a little tiring)', run: () => { evAllMor(8); home().forEach(g => { g.fatigue = clamp(g.fatigue + 6, 0, 100); }); return 'The men drink the wine and have a good night. Morale +8 for everyone, and they are a little more tired in the morning.'; } },
      { label: () => 'Send a better gift in return (40 denarii; favour +5)', ok: () => G.denarii >= 40, run: c => { G.denarii -= 40; favor(c.p, 5); return `You send a finer gift back, costing 40 denarii. ${PATRONS[c.p].name}: favour +5.`; } },
      { label: () => 'Sell it (+35 denarii)', run: () => { G.denarii += 35; return 'You sell the wine for 35 denarii.'; } },
    ],
  },
  sleepless: {
    title: 'A fighter cannot sleep', can: () => home().some(g => g.wins > 0), make: () => ({ g: (home().filter(g => g.kills > 0)[0] || pick(home().filter(g => g.wins > 0))).id }),
    text: c => `<b>${gn(c.g)}</b> has not been sleeping since the last games. He walks the yard at night, and the others say he talks to someone who is not there. He is troubled by what he did in the arena.`,
    opts: [
      { label: () => 'Sit up with him (his morale +10)', run: c => { evMor(byId(c.g), 10); return 'You sit up with him through the night. You say little, but having company helps him: morale +10.'; } },
      { label: () => 'Pay for a temple offering for the dead (20 denarii; his morale +14, Temple favour +2)', ok: () => G.denarii >= 20, run: c => { G.denarii -= 20; evMor(byId(c.g), 14); favor('temple', 2); return 'You pay for an offering at the temple in the name of the man he killed. He comes to watch it, and that night he sleeps: morale +14. Temple favour +2.'; } },
      { label: () => 'Work him to exhaustion (strength practice; very tiring, his morale -4)', run: c => { const g = byId(c.g); if (g) { g.fatigue = clamp(g.fatigue + 25, 0, 100); evMor(g, -4); addProg(g, 'str', 1); } return 'You train him until he is too exhausted to stay awake. He gets some strength practice, but he is much more tired, and no happier: morale -4.'; } },
    ],
  },
  rivalOffer: {
    title: 'A rival offers to buy a fighter', can: () => G.roster.length > 2 && G.roster.some(g => g.wins >= 3 && !g.away), make: () => { const g = pick(G.roster.filter(x => x.wins >= 3 && !x.away)), H = pick(G.houses); return { g: g.id, h: H.id, pay: round5(value(g) * 1.4) }; },
    text: c => `${houseDef(c.h).name} has sent a man with an offer: <b class="gold num">${c.pay}</b> denarii for <b>${gn(c.g)}</b>, which is well above his worth. The offer is for today only, and the price is fixed.`,
    opts: [
      { label: c => `Sell him (+${c.pay} denarii; morale -5)`, run: c => { const g = byId(c.g); if (!g) return 'He is gone already.'; G.denarii += c.pay; G.roster = G.roster.filter(x => x !== g); evAllMor(-5); return `You sell ${g.name} for ${c.pay} denarii, and he leaves your school. The other men do not like seeing him sold: morale -5 for everyone.`; } },
      { label: () => 'Refuse (his morale +12, feud +3)', run: c => { evMor(byId(c.g), 12); feud(houseOf(c.h), 3); return `You refuse to sell. ${gn(c.g)} hears that you would not part with him, and is proud of it: morale +12. The rival school is offended: feud +3.`; } },
    ],
  },
  oldArmour: {
    title: 'An old chest found in the cellar', can: () => true, make: () => ({}),
    text: () => 'While clearing the cellar, your steward has found an old chest that nobody remembers. It is nailed shut, and marked with your father\'s seal.',
    opts: [
      { label: () => 'Open it (armour or coin)', run: () => { if (chance(0.6)) { const it = makeItem(pick(SLOTS.filter(s => s !== 'weapon')), clamp(tier() + rint(1, 2), 1, 5)); G.armoury.push(it); return `Inside is a well-kept piece of equipment: ${itemName(it)}. It is now in your armoury.`; } const n = 30 + tier() * 30; G.denarii += n; return `Inside are ${n} denarii in old coins, and a private letter of your father's.`; } },
      { label: () => 'Leave it shut (morale +2)', run: () => { evAllMor(2); return 'You leave the chest unopened, out of respect for your father. Your household approves: morale +2.'; } },
    ],
  },
  bathhouse: {
    title: 'Rich young men invite a fighter to the baths', can: () => fit().length > 0, make: () => ({ g: pick(fit()).id }),
    text: c => `Some of the town's rich young men have invited <b>${gn(c.g)}</b> to the public baths this afternoon. They want to meet a real gladiator and ask him questions.`,
    opts: [
      { label: () => 'Let him go (fame +2, his morale +6, less tired)', run: c => { const g = byId(c.g); G.fame += 2; if (g) { g.fatigue = clamp(g.fatigue - 10, 0, 100); evMor(g, 6); } return `${gn(c.g)} spends the afternoon at the baths being admired. He comes back rested and very pleased with himself: morale +6. Fame +2.`; } },
      { label: () => 'Keep him at training (skill practice)', run: c => { addProg(byId(c.g), 'skl', 1); return 'You keep him at his training, and he gets some skill practice from it.'; } },
    ],
  },
  cookQuits: {
    title: 'The cook threatens to leave', can: () => home().length > 0 && G.denarii >= 20, make: () => ({ cost: 20 + tier() * 15 }),
    text: c => `Your cook says he is not paid enough to feed so many men, and that the tavern has offered him a job. He will stay if you raise his wage by ${c.cost} denarii.`,
    opts: [
      { label: c => `Pay him more (${c.cost} denarii; morale +3)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; evAllMor(3); return 'You pay him more, and he stays. The food improves: morale +3 for everyone.'; } },
      { label: () => 'Let him go (morale -8)', run: () => { evAllMor(-8); return 'You let him go, and the men have to cook for themselves, badly: morale -8 for everyone. After three days the cook comes back at his old wage.'; } },
    ],
  },
  omenBirds: {
    title: 'A bad omen before the games', can: () => daysToGames() <= 3 && fit().length > 0, make: () => ({}),
    text: () => 'Twelve crows have settled on the barracks roof and will not leave. The games are only days away, and the men take it as a sign of bad luck.',
    opts: [
      { label: () => 'Pay a priest to explain it (25 denarii; morale +8)', ok: () => G.denarii >= 25, run: () => { G.denarii -= 25; evAllMor(8); return 'The priest watches the crows for an hour, and then declares that they are a good sign from the god Mars. The men believe him: morale +8 for everyone.'; } },
      { label: () => 'Tell them it means nothing (each man: morale +3 or -5)', run: () => { fit().forEach(g => evMor(g, chance(0.5) ? 3 : -5)); return 'You tell the men that crows are only birds. About half of them believe you and feel better (morale +3). The rest go on worrying (morale -5).'; } },
    ],
  },
  apprentice: {
    title: 'The blacksmith\'s apprentice asks for shelter', can: () => fit().length > 0, make: () => ({}),
    text: () => 'The blacksmith\'s apprentice has come to your gate with his bag of tools. He says his master beats him, and he asks for a place to sleep. In return he will repair your equipment.',
    opts: [
      { label: () => 'Take him in (morale +3, agility practice; Guild favour -2)', run: () => { fit().forEach(g => { evMor(g, 3); addProg(g, 'agi', 1); }); favor('guild', -2); return 'You take him in, and within a week he has repaired all the straps and buckles in the school. Your men move more easily in their gear: morale +3, and some agility practice for every fit man. The smiths\' Guild hears where he went: favour -2.'; } },
      { label: () => 'Send him back, and speak to his master (Guild favour +2)', run: () => { favor('guild', 2); return 'You send the boy back, and speak to the smith about how he treats him. The smith behaves better, for a while. Guild favour +2.'; } },
    ],
  },
};
Object.assign(EVENTS, TOWN_EVENTS);

// =====================================================================================================
// STORIES OF THE PLACES
// The landmarks are not only scenery and somewhere to be sent. At some of them somebody is waiting with a
// trouble of their own, and it never ends where it starts: the miller's wife wants her husband fetched home
// from the hot spring, and at the hot spring it turns out why he has not come. Each story is a few steps,
// each step at a landmark, each with three ways to answer; how it ends is remembered, and the place says so
// afterwards. wildMap().tales[id] = { step, end, done, wait, ...whatever the story itself keeps }.
// =====================================================================================================
const taleBook = () => { const M = wildMap(); return M.tales || (M.tales = {}); };
const taleOf = id => { const B = taleBook(); return B[id] || (B[id] = { step: 0 }); };
const taleTier = id => Math.max(1, ...TALES[id].steps.map(S => { const p = landmarkAt(S.mark); return p ? clamp(wildTier(p.x, p.y), 1, 5) : 1; }));
const taleCoin = (id, base) => { const n = coinFor(base, Math.max(2, taleTier(id))); G.denarii += n; return n; };
const taleTire = n => fieldParty().forEach(g => { g.fatigue = clamp(g.fatigue + n, 0, 100); });
const taleCheer = n => G.roster.forEach(g => { if (!g.away) evMor(g, n); });
const taleLead = () => fieldParty()[0] || G.roster.find(g => !g.away) || G.roster[0] || { name: 'Your man', fatigue: 0, morale: 50, xp: 0 };
// How good a man out of a story is: as good as the country he was found in makes him (cap), but measured against the
// school he joins: no more than `over` beyond its best man. (A giant worth eight hundred denarii, to be had for a walk
// in the first week, was the quickest way through the whole campaign: see tools/race.js, the plan giant50.)
const taleBudget = (cap, over) => clamp(Math.max(0, ...G.roster.map(statSum)) + over, 16, cap);
// A man who comes into the school out of a story, not out of the market.
function taleRecruit(name, budget, cls, how) {
  const g = makeGladiator(budget, cls ? { cls } : null);
  g.name = name; g.morale = 60; welcome(g); G.roster.push(g); addStory(g, how);
  return g;
}

const TALES = {
  // ---- the mill, and the hot spring ----
  miller: { name: "The miller's wife",
    lore: { stayed: { 'The mill': "The miller's wife runs the mill alone now, and the flour is better.", 'The hot spring': 'The miller is still here, sitting in the pool up to his chin.' },
      dragged: { 'The mill': 'The miller is home again. He will not talk about the hot spring.' }, home: { 'The mill': 'The miller is home again, and back at work.' } },
    steps: [
      { mark: 'The mill', who: "The miller's wife", title: 'The miller is missing',
        text: () => `A woman comes out of the mill, covered in flour and dragging a sack that is too heavy for her. She is <b>Varia</b>, the miller's wife. "My husband Gnaeus hurt his back. Three weeks ago he went up to the hot spring in the hills to soak it. He said he would be gone two days. I have run the mill alone ever since. Go to the hot spring and bring him home, and I will pay you well."`,
        opts: [
          { label: () => 'We will bring him home', run: () => 'She tells you the way to the hot spring, and what to say to her husband when you find him.' },
          { label: () => 'Carry her sacks in first, then go (tiring, better reward)', run: t => { t.kind = true; taleTire(6); return 'Your men carry the sacks in for her. It takes them an hour, and tires them a little. She is grateful, and promises to pay you extra when you come back.'; } },
          { label: () => 'Refuse', go: 'wait', run: () => 'She goes back to her work without another word.' },
        ] },
      { mark: 'The hot spring', title: 'The miller at the hot spring',
        text: () => `You find Gnaeus the miller sitting in the hot pool up to his chest. His back plainly no longer hurts, and he says he is staying. "I have met someone. Her name is <b>Thalna</b>. She lives in the water, and she never asks me when the flour will be ready." Something moves under the steam at the far side of the pool: grey-green hair and a pale shoulder. It looks like a woman, but the rest of her stays under the water. Your men have gone very quiet.`,
        opts: [
          { label: () => 'Drag him out and take him home', run: t => { t.end = 'dragged'; taleTire(4); return 'It takes two men to pull him out, and he cries all the way down the first hill. Whatever was in the pool sinks out of sight.'; } },
          { label: () => 'Speak to the woman in the water', run: (t, id) => { t.end = 'stayed'; const n = taleCoin(id, 34); return `She comes to the edge of the steam but no closer, and says nothing. She holds out her hand under the water and gives you a large, warm pearl. She is paying you to leave Gnaeus with her, and you accept. A jeweller will give <b class="gold num">${n}</b> denarii for it. Gnaeus waves as you leave.`; } },
          { label: () => "Give him his wife's message, word for word", run: t => {
            if (chance(0.55)) { t.end = 'home'; return 'You repeat everything Varia told you to say, and it takes a while. Near the end he climbs out of the water by himself and asks where his boots are. He is coming home, and he does not look back at the pool.'; }
            t.end = 'stayed'; return 'He listens to all of it and nods. Then he asks you to tell her that the mill wheel needs greasing, and sinks back into the water up to his chin. He is staying. All you can take back to Varia is his answer.'; } },
        ] },
      { mark: 'The mill', title: 'Back at the mill',
        text: t => t.end === 'stayed' ? `You tell Varia that her husband is staying at the hot spring, with a woman who lives in the water. "With a tail, I suppose," she says. She looks at the mill wheel for a while. Then she takes his apron off its nail, throws it out, and puts on her own. "Then the mill is mine now. I owe you for bringing me the news."`
          : t.end === 'dragged' ? `You put Gnaeus down in his own yard. Varia checks that he is unhurt, and sends him straight back to work. "Three weeks," she says to you. "I counted every day."`
          : `Gnaeus walks into his own yard and picks up a sack without being asked. Varia watches him. She was ready to shout at him, but now she says nothing.`,
        opts: [
          { label: () => 'Take her money', go: 'end', run: (t, id) => { const n = taleCoin(id, t.end === 'stayed' ? 22 : 34) + (t.kind ? 15 : 0); if (t.kind) G.denarii += 15; return `She pays you <b class="gold num">${n}</b> denarii out of her savings${t.kind ? ', including extra for carrying the sacks' : ''}.`; } },
          { label: () => 'Ask for bread instead (rest, morale)', go: 'end', run: () => { taleTire(-15); taleCheer(5); return 'She bakes for your men, and they eat fresh bread sitting beside the mill stream. They are less tired, and morale is +5.'; } },
          { label: () => 'Refuse payment (fame, Guild favour)', go: 'end', run: t => { G.fame += t.kind ? 3 : 2; favor('guild', 2); return `She does not argue. But she tells every cart driver who stops for flour that your school went into the hills for her and would not be paid. Fame +${t.kind ? 3 : 2}, Guild favour +2.`; } },
        ] },
    ] },

  // ---- the beacon, and the wreck on the strand ----
  beacon: { name: 'The cold beacon',
    lore: { lit: { 'The beacon': 'The beacon is lit every night now. The keeper tells people who brought back his oil.' }, dark: { 'The beacon': 'The beacon is dark, and the keeper has left.', 'A wreck on the strand': 'A second ship has been wrecked here since the beacon went dark.' } },
    steps: [
      { mark: 'The beacon', who: 'The beacon keeper', title: 'The beacon is out',
        text: () => `The fire on the beacon has been out for four nights. The keeper, <b>old Mettius</b>, has a split lip and a bandaged hand. "Men came in a boat and stole every jar of my oil. Without it I cannot light the beacon, and a grain ship is due to pass here soon. In the dark she will hit the rocks. That is what they want. They are wreckers. They are camped in the old wreck on the beach, waiting to rob the next ship that breaks up."`,
        opts: [
          { label: () => 'We will get his oil back', run: () => 'He shows you the path down to the beach, and where the wreckers keep their lookout.' },
          { label: () => 'Give him your own lamp oil (30 denarii, Guild favour)', ok: () => G.denarii >= 30, go: 'end', run: t => { G.denarii -= 30; t.end = 'lit'; favor('guild', 3); return 'You give him your own lamp oil. It is enough to light the beacon for a week, and by then the Guild can send more. The beacon is lit again by evening. Guild favour +3.'; } },
          { label: () => 'Refuse', go: 'wait', run: () => 'He nods as if he expected nothing else, and goes back to watching the sea.' },
        ] },
      { mark: 'A wreck on the strand', danger: true, title: 'The wreckers',
        text: (t, id, c) => `The stolen oil jars are stacked inside the old wreck, under a sail. The wreckers who took them are standing round them, armed with boat-hooks and long knives, and their captain is counting your men. <span class="bad">${skulls(taleTier(id))}</span>${sizeUp(c, () => { const tr = taleTier(id); return [questBoss(tr, 'The wreckers\' captain', { tactic: 'aggressive' })].concat(wildMen(tr, Math.max(1, wildCount(tr) - 2))); })}`,
        opts: [
          { label: () => 'Fight them for the oil', ok: canFightNow, run: (t, id) => { const tr = taleTier(id); return wildFight('The wreckers on the strand', [questBoss(tr, 'The wreckers\' captain', { tactic: 'aggressive' })].concat(wildMen(tr, Math.max(1, wildCount(tr) - 2))), 'rock', 'tale', { tier: tr, day: true }); },
            won: () => 'The wreckers who are left run off down the beach. You load the oil jars onto your mule.' },
          { label: (t, id) => `Buy the oil back (${25 * taleTier(id)} denarii)`, ok: (t, id) => G.denarii >= 25 * taleTier(id), run: (t, id) => { G.denarii -= 25 * taleTier(id); t.bought = true; return 'The captain sells you the keeper\'s own oil at twice its price, and laughs about it. He is happy to let it go: he expects to steal it again some other night.'; } },
          { label: () => 'Take a bribe to leave them alone (coin, Guild favour -6)', go: 'end', run: (t, id) => { t.end = 'dark'; const n = taleCoin(id, 40); favor('guild', -6); return `The wreckers pay you <b class="gold num">${n}</b> denarii to go away. Three nights later a grain ship hits the rocks in the dark and is lost. The Guild owned part of her, and it is asking who was on the beach that week. Guild favour -6.`; } },
        ] },
      { mark: 'The beacon', title: 'The beacon is lit',
        text: () => `Mettius fills the fire-pan himself, bandaged hand and all, and will not let anyone help. By dark the beacon can be seen from far out at sea.`,
        opts: [
          { label: () => 'Ask him to tell the Guild (Guild favour, fame)', go: 'end', run: t => { t.end = 'lit'; favor('guild', 7); G.fame += 2; return 'The keeper writes in his log which school brought back the oil. The Guild reads those logs. Guild favour +7, fame +2.'; } },
          { label: () => 'Ask the keeper for payment (coin)', go: 'end', run: (t, id) => { t.end = 'lit'; const n = taleCoin(id, t.bought ? 38 : 28); return `He has saved his pay, since there is nothing out here to spend it on. He gives you <b class="gold num">${n}</b> denarii.`; } },
          { label: () => 'Rest the night by his fire (rest, health, morale)', go: 'end', run: t => { t.end = 'lit'; taleTire(-22); taleCheer(6); fieldParty().forEach(g => { g.hp = Math.min(maxHp(g), g.hp + maxHp(g) * 0.15); }); return 'Your men sleep the night beside the beacon fire. They wake rested: much less tired, some health back, and morale +6.'; } },
        ] },
    ] },

  // ---- the great oak, and the sacred grove ----
  oak: { name: 'The girl and the oak',
    lore: { stands: { 'The great oak': 'The oak still stands. A girl called Senna ties a ribbon round it every spring.' }, felled: { 'The great oak': "Its biggest branch was cut off for the governor's roof. The priests of the grove have not forgiven it." } },
    steps: [
      { mark: 'The great oak', who: 'A girl chained to the oak', title: 'The girl and the oak',
        text: () => `A girl of about fifteen has chained herself to the great oak, and has been there for days. Four woodcutters with a big saw are sitting in the grass, waiting for her to give up. Their foreman has a document: the Magistrate's clerk has sold the oak's biggest branches for the governor's new roof, and cutting them will kill the tree. The girl, <b>Senna</b>, says the oak belongs to the sacred grove, and that the priestess there can prove it.`,
        opts: [
          { label: () => 'Go to the sacred grove and ask the priestess', run: () => 'You leave the girl your bread. The foreman watches, says nothing, and moves his men a little further away.' },
          { label: () => 'Help the woodcutters remove her (coin, Temple favour -5)', go: 'end', run: (t, id) => { t.end = 'felled'; const n = taleCoin(id, 18); favor('temple', -5); favor('magistrate', 2); return `One of your men holds her while another cuts the chain. The foreman pays you <b class="gold num">${n}</b> denarii. She does not cry, but she looks hard at each of your men, to remember their faces. The priests will hear of it: Temple favour -5, Magistrate favour +2.`; } },
          { label: () => 'Leave them to it', go: 'wait', run: () => 'You walk on. The girl shouts something after you, and the woodcutters laugh.' },
        ] },
      { mark: 'The sacred grove', title: 'The priestess of the grove',
        text: () => `The priestess is very old, and she already knows about the oak. "That oak grew from an acorn of this grove, planted the year the town was founded. I have a document that proves it, under a seal older than the Magistrate's office." She fetches it out of a hollow tree. "But the grove expects a gift from those it helps."`,
        opts: [
          { label: () => 'Give silver (40 denarii)', ok: () => G.denarii >= 40, run: t => { G.denarii -= 40; t.gift = true; return 'You leave the silver. She presses her thumb into the wax beside the old seal, to show that the grove stands behind the document, and then touches your forehead. The document now carries her fresh mark.'; } },
          { label: () => 'Leave a man to keep watch all night (tires him)', run: t => { t.gift = true; const g = taleLead(); g.fatigue = clamp(g.fatigue + 25, 0, 100); evMor(g, 10); return `<b>${g.name}</b> stands all night under the trees holding a bowl of water, and must not spill it. He does not. He is very tired in the morning but in good spirits, and the priestess adds her own mark to the document.`; } },
          { label: () => 'Take the document and give nothing', run: () => 'She gives you the document anyway, but without her mark on it. "The oak is not the one who will remember this," she says.' },
        ] },
      { mark: 'The great oak', title: 'The document and the saw',
        text: t => `The girl is still chained to the oak, and thinner. The foreman reads the document slowly. ${t.gift ? "Then he sees the priestess's fresh mark in the wax beside the old seal, and he stops being so sure of himself." : 'He says his own document is newer, and counts for more.'}`,
        opts: [
          { label: t => t.gift ? "Show him the priestess's mark" : 'Insist the document is good (may fail)', go: 'end', run: t => {
            if (t.gift || chance(0.45)) { t.end = 'stands'; favor('temple', 6); G.fame += 3; return 'He hands the document back. The woodcutters pick up their saw and leave. One of your men has to unfasten the chain for Senna. The oak is saved: Temple favour +6, fame +3.'; }
            t.end = 'felled'; favor('temple', -2); return 'He will not accept it, and you have nothing else to persuade him with. They wait until you have gone, and then you hear the saw start. Temple favour -2.'; } },
          { label: () => 'Buy his document from him (60 denarii)', ok: () => G.denarii >= 60, go: 'end', run: t => { G.denarii -= 60; t.end = 'stands'; favor('temple', 4); G.fame += 2; return 'For sixty denarii the foreman agrees to cut some other tree. He gives you his document, which makes you the owner of the branches, and you give it to the girl. The oak is saved: Temple favour +4, fame +2.'; } },
          { label: () => 'Drive them off by force (Magistrate favour -4)', ok: canFightNow, go: 'end', run: () => wildFight('Woodmen at the great oak', wildMen(1, 4), 'forest', 'tale', { tier: 1, day: true }),
            won: t => { t.end = 'stands'; favor('temple', 4); favor('magistrate', -4); return 'They are woodcutters, not fighters, and they run, leaving their saw behind. The oak is saved. But the clerk who sold the timber must now explain himself to the governor, and he blames you. Temple favour +4, Magistrate favour -4.'; } },
        ] },
    ] },

  // ---- the ferry, and the drowned temple ----
  ferry: { name: 'The bell under the water',
    lore: { silent: { 'The ferry': 'The ferry crosses at any hour now.', 'The drowned temple': 'The bell is gone. The old priest still pulls the empty rope.' },
      noon: { 'The ferry': 'The ferry runs from noon, once the bell has rung.', 'The drowned temple': 'The old priest rings the bell at noon now.' },
      kept: { 'The ferry': 'The ferry stops at dusk, while the bell rings.', 'The drowned temple': 'The old priest rings the bell at dusk, and says the names of the drowned first.' } },
    steps: [
      { mark: 'The ferry', who: 'The ferryman', title: 'The bell under the water',
        text: () => `The ferryman, <b>Charax</b>, will only take people across by day. "There is a bell in the drowned temple, out in the marsh. It has started ringing again at dusk. Twice now, when it rang, a passenger stood up in my boat in the middle of the river and stepped into the water, as if somebody had called him. Both drowned. Nobody will cross in the evening now, and I cannot feed my children on half a day's fares. Go to the temple and make the bell stop."`,
        opts: [
          { label: () => 'Go and see who is ringing it', run: () => 'He draws you a map of the safe paths through the marsh.' },
          { label: () => 'Ask what he is not telling you', run: t => { t.knows = true; return 'He looks at the water for a while. Then he tells you: the second man who drowned was his brother. He draws you a map of the safe paths through the marsh.'; } },
          { label: () => 'Refuse', go: 'wait', run: () => 'He shrugs, and holds out his hand for the fare.' },
        ] },
      { mark: 'The drowned temple', title: 'The man who rings the bell',
        text: t => `The temple stands in black marsh water. On its one dry step sits a very old, nearly blind man, holding a bell-rope. He was a boy priest here when the marsh flooded the temple. The other priests left, and he stayed. Every evening since, he has rung the bell for his god. He has no idea that anyone can hear it${t.knows ? ', or that men have drowned because of it' : ''}.`,
        opts: [
          { label: () => 'Cut the bell down and sell it (coin, Temple favour -4)', go: 'end', run: (t, id) => { t.end = 'silent'; const n = taleCoin(id, 26); favor('temple', -4); return `You cut the bronze out of the bell and sell it for <b class="gold num">${n}</b> denarii. The bell is silent, and the ferry can cross at any hour. People say the old man still pulls the rope every evening, and listens. Temple favour -4.`; } },
          { label: () => 'Ask him to ring it at noon instead (Temple favour, fame)', go: 'end', run: t => { t.end = 'noon'; favor('temple', 5); G.fame += 2; return 'He thinks about it for a long time. Then he says his god never minded what hour the bell rang; only the old high priest did. He will ring it at noon. Nobody drowns in daylight, and the ferryman is delighted. Temple favour +5, fame +2.'; } },
          { label: () => 'Stay for his evening prayers (morale, experience)', go: 'end', run: t => { t.end = 'kept'; taleCheer(8); const g = taleLead(); g.xp = (g.xp || 0) + 3; return `The prayers are long, and in a language none of you knows. Your men are quiet afterwards, and in better spirits: morale +8. The old man asks who has drowned on the river, and you tell him${t.knows ? ", starting with the ferryman's brother" : ''}. From then on he says their names before he rings, and nobody else steps out of the boat.`; } },
        ] },
    ] },

  // ---- the watchtower, and the burnt village ----
  watch: { name: 'One man on a two-man watch',
    lore: { back: { 'The watchtower': 'Two soldiers keep watch here again. One of them is Rufio.', 'A burnt village': 'One of the graves here has a stone on it. Rufio buried his family.' },
      gone: { 'The watchtower': 'Only one soldier keeps watch here now. Rufio never came back.' }, oath: { 'The watchtower': 'Only one soldier keeps watch here now. Rufio joined your school.', 'A burnt village': 'One of the graves here has a stone on it. Rufio buried his family.' } },
    steps: [
      { mark: 'The watchtower', who: 'A soldier at the watchtower', title: 'One man on a two-man watch',
        text: () => `A soldier calls down from the top of the watchtower. "There should be two of us up here. Tonight there is only me. My partner <b>Rufio</b> ran off in the night. The centurion inspects this tower in three days. If he finds Rufio gone, he will have him hunted down and hanged as a deserter. I think he has gone to the burnt village. He was born there. Find him and bring him back before the centurion comes."`,
        opts: [
          { label: () => 'We will find him', run: () => 'He throws down a wineskin for your journey, and goes back to keeping watch alone.' },
          { label: () => 'Ask what he will give you for it (more Magistrate favour)', run: t => { t.paid = true; return 'He has not been paid for four months and has no money. Instead he promises to speak well of your school to his officers. You agree, and set out.'; } },
          { label: () => 'Refuse', go: 'wait', run: () => 'He does not answer. He goes back to keeping watch alone.' },
        ] },
      { mark: 'A burnt village', title: 'Why Rufio left',
        text: () => `You find Rufio in the burnt village. He is not hiding. He is digging graves in the ashes of a house, and beside him lies a row of bodies wrapped in pieces of his cloak. "My mother and my sisters," he says, without stopping. "Nobody ever buried the dead here. I asked for leave to do it eleven times, and was refused every time."`,
        opts: [
          { label: () => 'Help him dig, then take him back (tiring; Magistrate favour, fame)', go: 'end', run: t => { t.end = 'back'; taleTire(10); taleCheer(4); favor('magistrate', t.paid ? 6 : 4); G.fame += 2; return `With your men helping, the graves are finished by dark. Rufio walks back to the tower with you of his own accord, and the centurion finds two men on watch. Your men are tired, but glad to have done it. Magistrate favour +${t.paid ? 6 : 4}, fame +2, morale +4.`; } },
          { label: () => 'Give him money and let him run (20 denarii)', ok: () => G.denarii >= 20, go: 'end', run: t => { G.denarii -= 20; t.end = 'gone'; taleCheer(6); favor('magistrate', -2); return 'He finishes the last grave, takes the money, and leaves by the north road. Your men approve: morale +6. But the army has lost a soldier, and the Magistrate hears you helped: favour -2.'; } },
          { label: () => 'Offer him a place in your school', ok: () => G.roster.length < capacity(), go: 'end', run: (t, id) => { t.end = 'oath'; const g = taleRecruit('Rufio', taleBudget(22 + taleTier(id) * 3, 0), 'murmillo', 'A soldier who left his post to bury his dead, and joined the school rather than hang.'); return `He thinks it over, leaning on his spade. If he goes back he may hang, and a gladiator at least lives. "Let me finish here first," he says. <b>${g.name}</b> joins your school that night. He has a soldier's training, and nothing else.`; } },
        ] },
    ] },

  // ---- the giant's table, and the ring of stones ----
  giant: { name: "Supper on the giant's table",
    lore: { fed: { "The giant's table": 'Old Brica leaves a supper here every night for Buccio, and he washes the bowl.' }, oath: { "The giant's table": 'Old Brica still leaves a supper here, but only the foxes eat it now.' }, taken: { "The giant's table": 'Nobody leaves a supper here any more.' } },
    steps: [
      { mark: "The giant's table", who: 'An old woman at the stones', title: "Supper on the giant's table",
        text: () => `An old woman is setting out a meal on the flat top of the giant's table: bread, cheese, an onion and a bowl of milk. "It is for the giant," says <b>old Brica</b>. "My mother left a supper here every night, and her mother before her. Only the foxes ever ate it. But since the spring it is all gone every morning, and the bowl has been washed. Somebody is eating it. Find out who."`,
        opts: [
          { label: () => 'Keep watch tonight (tiring)', run: () => { taleTire(8); return 'Just before dawn a huge man comes out of the dark. He eats the supper standing up, wipes the bowl clean, and sets it down neatly. Then he walks away to the east, towards the ring of stones.'; } },
          { label: () => 'Follow the tracks by daylight', run: () => 'You find footprints in the dew, far bigger than any of your men would make. They lead east, towards the ring of stones, along a path that has been walked every night for months.' },
          { label: () => 'Refuse', go: 'wait', run: () => 'She shakes her head at you, and goes on setting out the supper.' },
        ] },
      { mark: 'The ring of stones', danger: true, title: 'The giant',
        text: () => `The man is sitting against the tallest stone of the ring. He is the biggest man any of you has ever seen, and his arm carries the scars of a gladiator. Your older men know him: he is <b>Buccio the Ox</b>. Twelve years ago, in the old arena, the crowd made him kill his own friend. He picked up the body, walked out of the gate, and was never seen again. He has been hiding here ever since, a runaway. He looks at your men for a long time. "Did Brica send you," he says, "or a lanista?"`,
        opts: [
          { label: () => 'Tell him Brica sent you, and leave him in peace (fame, morale)', go: 'end', run: t => { t.end = 'fed'; taleCheer(8); G.fame += 2; return 'You tell him that the old woman only wants to know how much to bake. He roars with laughter. "Tell her twice the bread, and no onion." You leave him where he is. Your men tell the story for a month: fame +2, morale +8.'; } },
          { label: () => 'Offer him a place in your school', ok: () => G.roster.length < capacity(), go: 'end', run: (t, id) => { t.end = 'oath'; const g = taleRecruit('Buccio the Ox', taleBudget(30 + taleTier(id) * 4, 6), 'murmillo', 'Hid for twelve years at the ring of stones, after the old arena. Came back to the sand of his own will.'); if (!g.traits.includes('ironhide')) g.traits.push('ironhide'); g.hp = maxHp(g); return `He looks at his hands. "I am forty years old," he says, "and for a year I have lived on an old woman's bread, because I could not think what else to do." <b>${g.name}</b> joins your school and walks back with you.`; } },
          { label: () => 'Capture him for the reward on runaways (a hard fight)', ok: canFightNow, go: 'end', run: (t, id) => { const tr = taleTier(id); return wildFight('Buccio the Ox', [questBoss(tr, 'Buccio the Ox', { cls: 'murmillo', boost: 6, traits: ['ironhide'], tactic: 'balanced' })], 'rock', 'tale', { tier: tr, day: true }); },
            won: (t, id) => { t.end = 'taken'; const n = taleCoin(id, 55); favor('magistrate', 3); taleCheer(-5); return `He fights hard, but you take him. The Magistrate pays <b class="gold num">${n}</b> denarii for the runaway. Your men are ashamed of it: morale -5. Magistrate favour +3.`; } },
        ] },
    ] },

  // ---- the wine press, and the bee garden ----
  vintner: { name: 'Drunken bees',
    lore: { supper: { 'The wine press': 'The wine-maker and the beekeeper are courting, and still arguing.', 'The bee garden': 'The beekeeper sells her honey to the governor. The wine-maker comes to supper.' }, quits: { 'The wine press': 'The wine here tastes of honey. The wine-maker will not admit why.' } },
    steps: [
      { mark: 'The wine press', who: 'The vintner', title: 'Drunken bees',
        text: () => `The wine-maker, <b>Sergius</b>, shows you his pressing floor. It is covered in bees. "They are hers, from the bee garden. They drink my grape juice and drown in my vats, and I have paid a boy all month to fish them out. I want her to pay for the damage. You are going that way. Tell that woman she owes me forty denarii, or I will take her to the Magistrate."`,
        opts: [
          { label: () => 'Take his demand to the beekeeper', run: () => 'He makes you repeat the message, to be sure you have the amount right.' },
          { label: () => 'Taste his grape juice first', run: t => { t.tasted = true; taleCheer(2); return 'It is the best in the province, and it tastes of honey. The bees are plainly improving it. You say nothing, and take his demand to the beekeeper.'; } },
          { label: () => 'Refuse', go: 'wait', run: () => 'He goes back to shouting at the boy.' },
        ] },
      { mark: 'The bee garden', title: "The beekeeper's answer",
        text: t => `<b>Albia</b> the beekeeper listens to the demand without stopping her work. "Forty denarii? His wine was sour until my bees got into it${t.tasted ? ', as you know, since you have tasted it' : ''}. Tell him he owes me forty, for all the honey his vats have had from my bees these six years. And tell him" - she seems to be enjoying herself - "that he could come and say it to me himself, as he did last year, and the year before. Both times he stayed for supper."`,
        opts: [
          { label: () => 'Take her whole answer back to him (coin, morale)', go: 'end', run: (t, id) => { t.end = 'supper'; const n = taleCoin(id, 16); taleCheer(5); return `Sergius hears it, turns red, and calls for a clean tunic: he is going to supper. He gives you a jar of wine and <b class="gold num">${n}</b> denarii to keep quiet about it. Your men tell everybody: morale +5.`; } },
          { label: () => 'Rule that each owes the other forty (coin, Magistrate favour)', go: 'end', run: (t, id) => { t.end = 'quits'; const n = taleCoin(id, 20); favor('magistrate', 2); return `You rule that the two debts cancel out. It is fair, and both of them are furious. Together they pay you <b class="gold num">${n}</b> denarii to go away. The Magistrate is glad to be spared a court case about bees: favour +2.`; } },
          { label: () => 'Buy wine and honey from both (30 denarii; rest, morale)', ok: () => G.denarii >= 30, go: 'end', run: t => { G.denarii -= 30; t.end = 'supper'; taleTire(-12); taleCheer(8); return 'Your men eat honey on fresh bread and drink the wine. They are less tired, and morale is +8. As you leave, you see Sergius in a clean tunic, walking to the bee garden with a jar of wine.'; } },
        ] },
    ] },

  // ---- the fishers' huts, and the bones of a whale ----
  whale: { name: 'The jawbone',
    lore: { back: { 'The bones of a whale': 'The jawbone is back in its place. The fishers leave it the first fish of every catch.', "The fishers' huts": 'The fishing boats go out again.' },
      carted: { 'The bones of a whale': "Every bone has been taken away to the governor's garden. Only a hollow in the sand is left.", "The fishers' huts": 'Half the boats no longer go out.' },
      cast: { 'The bones of a whale': 'The jawbone is back in its place. The governor has a plaster copy.', "The fishers' huts": 'The fishing boats go out again.' } },
    steps: [
      { mark: "The fishers' huts", who: 'The fishers', title: 'The boats are not going out',
        text: () => `It is perfect fishing weather, but every boat is pulled up on the beach and the nets are dry. An old woman, <b>Mamma Tutia</b>, speaks for the whole village. "Somebody has taken the jawbone from the whale skeleton along the shore. We do not go out to sea unless the whale is whole. Do not ask me why: my grandmother did not know either. Go and see who took it."`,
        opts: [
          { label: () => 'Go and look at the whale', run: () => 'They give you dried fish for the journey. It is all they have until the boats go out again.' },
          { label: () => 'Ask why the whale matters', run: t => { t.asked = true; return 'She says the whale washed up in the year of the great storm, the only year the village lost no boats. Since then nobody has dared to fish without it. You go to look.'; } },
          { label: () => 'Refuse', go: 'wait', run: () => 'She spits on the ground and turns away.' },
        ] },
      { mark: 'The bones of a whale', title: 'The man who took the jawbone',
        text: t => `A cart stands among the whale's ribs, with the huge jawbone packed in straw on it. A Greek in a clean tunic is measuring the rest of the skeleton. He is <b>Master Pollio</b>, and he has a letter from the governor: the whole skeleton is to be taken away and set up in the governor's garden. When you tell him the fishers will not go to sea without it, he shrugs. "They are fishermen. They will fish${t.asked ? '. A storm is only weather. It has nothing to do with a whale' : ''}."`,
        opts: [
          { label: () => 'Put the jawbone back (fame; Magistrate favour -3)', go: 'end', run: t => { t.end = 'back'; favor('magistrate', -3); taleCheer(4); G.fame += 2; return 'Your men lift the jawbone out of his cart while he shouts and waves the governor\'s letter. They put it back where it lay. By the time you pass the huts again, the boats are going out. The governor will hear who stopped him: Magistrate favour -3, fame +2, morale +4.'; } },
          { label: () => 'Help him load the rest (coin, tiring)', go: 'end', run: (t, id) => { t.end = 'carted'; const n = taleCoin(id, 30); taleTire(8); return `Your men spend the day loading the rest of the skeleton onto his carts. He pays <b class="gold num">${n}</b> denarii. The fishers will not go to sea now. You go home by a road that does not pass their huts.`; } },
          { label: () => 'Offer him a plaster copy instead (may fail)', go: 'end', run: (t, id) => {
            if (chance(clamp(0.35 + bestWits() * 0.03, 0.35, 0.9))) { t.end = 'cast'; const n = taleCoin(id, 18); G.fame += 2; return `Your men suggest making a plaster copy of the skeleton for the governor. Pollio objects, until they point out that plaster does not rot or smell. He takes the copy and pays <b class="gold num">${n}</b> denarii for the idea. The jawbone goes back, and the boats go out. Fame +2.`; }
            t.end = 'back'; taleTire(6); return 'The plaster will not set in the damp sea air, and by evening there is only white mud. Pollio goes off to town to buy better plaster. While he is gone your men put the jawbone back, and the boats go out. He will not return before winter.'; } },
        ] },
    ] },

  // ---- the gallows, and the fort ----
  gallows: { name: 'The man on the barrel',
    lore: { freed: { 'The gallows': 'The gallows is empty. Naso the clerk went free.', 'The fort': 'The fort has a new quartermaster. The old one was caught stealing.' },
      cut: { 'The gallows': 'A cut rope hangs here. The clerk you cut down was never caught.' }, hanged: { 'The gallows': 'Naso the clerk was hanged here. He said to the end that he was no thief.' } },
    steps: [
      { mark: 'The gallows', who: 'A man with a rope round his neck', title: 'The man on the barrel',
        text: () => `A man is standing on a barrel under the gallows, with his hands tied and the rope already round his neck. The hangman has gone to eat and left him there. "Please do not kick the barrel," he says. "I am <b>Naso</b>, the pay-clerk at the fort. The pay for forty soldiers was stolen from the chest, and I am to hang for it at sunset tomorrow. I did not take it. The quartermaster did. Go to the fort and make him show you his account book. It will prove it."`,
        opts: [
          { label: () => 'Go to the fort and ask', run: () => 'He thanks you as well as he can with a rope round his neck. You leave him standing on his barrel.' },
          { label: () => 'Cut him down and let him run (Magistrate favour -5)', go: 'end', run: t => { t.end = 'cut'; favor('magistrate', -5); taleCheer(5); return 'You cut the rope, and he runs off into the bushes. Now nobody will ever know whether he stole the pay. Your men like it: morale +5. The Magistrate, whose prisoner he was, does not: favour -5.'; } },
          { label: () => 'Refuse', go: 'wait', run: () => 'He watches you until you are out of sight.' },
        ] },
      { mark: 'The fort', title: 'The quartermaster',
        text: () => `The quartermaster of the fort is a well-fed man called <b>Sulca</b>, wearing new boots. He is friendly, but he will not talk about the stolen pay, and he says his account book is locked away by order of the centurion. As you leave, he walks beside you and offers a bribe: the fort buys a lot of oil, leather and wine, and your school could have the contract, if you forget about the clerk.`,
        opts: [
          { label: () => 'Accuse him in front of the centurion (surer with more fame)', run: t => {
            if (chance(clamp(0.4 + G.fame / 400, 0.4, 0.85))) { t.proof = true; return 'The centurion does not like gladiators, but he likes being robbed even less, and the soldiers whose pay was stolen are listening. He has the strongbox opened. There are two account books in it, and they prove that Sulca took the money. Sulca is locked up, and you are given a sealed order telling the hangman to free Naso.'; }
            t.proof = false; return 'The centurion listens, and then has you shown out. But he has begun to doubt Sulca. A soldier catches up with you on the road, carrying a note for the hangman. It orders a delay of three days. It is not a pardon.'; } },
          { label: () => 'Steal the account book tonight (surer with a clever man)', run: t => {
            if (chance(clamp(0.3 + bestWits() * 0.035, 0.3, 0.9))) { t.proof = true; return `<b>${taleLead().name}</b> climbs in by the latrine window and finds the account book under Sulca's mattress. It shows, in Sulca's own handwriting, that he stole the pay a little at a time over two years. You have the proof.`; }
            t.proof = false; taleTire(10); return 'The window is too narrow. Your man is not caught, but he comes back with nothing, and by morning Sulca has doubled his guard. All you can take to the hangman is your own word.'; } },
          { label: () => 'Take the bribe and forget the clerk (coin, morale -4)', go: 'end', run: (t, id) => { t.end = 'hanged'; const n = taleCoin(id, 45); favor('magistrate', 2); taleCheer(-4); return `You accept the contract. Sulca pays <b class="gold num">${n}</b> denarii in advance, in coin that plainly came from the pay chest. Your men know what it was for: morale -4. At sunset the next day, Naso is hanged. Magistrate favour +2.`; } },
        ] },
      { mark: 'The gallows', title: 'Back at the gallows',
        text: t => t.proof ? `The hangman reads the order, grumbles about losing his fee, and takes the rope off. Naso sits down on the barrel, because his legs will not hold him. His wife and two brothers came to watch him die, and brought the money they had saved for his gravestone. They offer it to you instead.`
          : `The hangman reads what you have brought. It is not enough to free Naso, he says. But he is a poor man, and he could be paid to let him go. Naso is still on the barrel. His wife and two brothers are there, with the money they had saved for his gravestone.`,
        opts: [
          { label: t => t.proof ? "Take the family's money (coin)" : "Bribe the hangman with the family's money", go: 'end', run: (t, id) => { t.end = 'freed'; const n = t.proof ? taleCoin(id, 30) : 0; return t.proof ? `They give you <b class="gold num">${n}</b> denarii in small coins, and would be ashamed if you refused. Naso goes free.` : 'It takes all the family has. The hangman declares that the rope has rotted, and lets Naso go. By the time the fort finds out the truth about Sulca, Naso is far away.'; } },
          { label: t => t.proof ? 'Take nothing (fame, Temple favour)' : 'Bribe the hangman yourself (25 denarii; fame, Temple favour)', go: 'end', run: t => { t.end = 'freed'; if (!t.proof) G.denarii -= Math.min(G.denarii > 0 ? G.denarii : 0, 25); G.fame += 3; favor('temple', 2); return `${t.proof ? 'You let the family keep their money' : 'You pay the hangman twenty-five denarii yourself, and let the family keep their money'}. Naso goes free, and the story is all over town before you are home. Fame +3, Temple favour +2.`; } },
          { label: () => 'Take Naso into your school', ok: () => G.roster.length < capacity(), go: 'end', run: (t, id) => { t.end = 'freed'; const g = taleRecruit('Naso', taleBudget(18 + taleTier(id) * 2, -3), null, 'A pay-clerk taken down off the gallows barrel, who would not go back to the fort.'); g.morale = 85; return `Naso goes free, but he cannot go back to the fort: nobody there will forgive him for being right. <b>${g.name}</b> joins your school. He is no fighter yet, but he stood a day and a night on that barrel without falling, and that takes nerve.`; } },
        ] },
    ] },

  // ---- the lime kiln, and the great quarry ----
  kiln: { name: 'The fire that must not go out',
    lore: { round: { 'The great quarry': 'There is a face in the rock here. The quarrymen cut round it.', 'The lime kiln': 'The kiln fire has burned for years without going out. Once it nearly did.' },
      broken: { 'The great quarry': 'The face in the rock has been split. The quarrymen will not look at the place.', 'The lime kiln': 'The kiln fire has burned for years without going out.' },
      out: { 'The lime kiln': 'The kiln fire has gone out. They are waiting for a priest to light it again.', 'The great quarry': 'There is a face in the rock here. Nobody will cut near it.' } },
    steps: [
      { mark: 'The lime kiln', who: 'The lime burner', title: 'The fire that must not go out',
        text: () => `The lime burner, <b>Fuscus</b>, is burning his own fence rails to keep his kiln alight. "This fire has burned for nineteen years. My father lit it. If it goes out, the kiln is ruined, and I would have to build a new one. The quarry has sent me no stone for eight days, and no word why. I have two days of stone left, and I cannot leave the fire. Go to the quarry and find out what is wrong."`,
        opts: [
          { label: () => 'Go and ask at the quarry', run: () => 'He nods his thanks, without taking his eyes off the fire.' },
          { label: () => 'Leave two men to help him, and go (keeps the fire safer)', run: t => { t.help = true; taleTire(5); return 'He is not sure he trusts your men with his fire. Then he shows them exactly how to feed it. The rest of you go to the quarry.'; } },
          { label: () => 'Refuse', go: 'wait', run: () => 'He throws another rail on the fire.' },
        ] },
      { mark: 'The great quarry', title: 'The face in the rock',
        text: () => `Nobody is working at the quarry. The quarrymen are sitting and staring at the east wall, and the overseer, <b>Blaesus</b>, has shouted himself hoarse. Eight days ago a block of stone fell away and left the shape of a face in the rock behind it: closed eyes, a mouth, a beard, as tall as a door. Nobody carved it. The men think it is a god. The best stone in the quarry lies behind it, and they refuse to cut through it.`,
        opts: [
          { label: () => 'Tell them to cut round the face (Temple favour, fame)', go: 'end', run: t => { t.end = 'round'; favor('temple', 5); G.fame += 2; return 'Blaesus complains that it wastes forty feet of his best stone. But the men agree to it, and go back to work. The first cartload reaches the kiln with a day to spare, and the fire is saved. The priests send someone to look at the face. Temple favour +5, fame +2.'; } },
          { label: t => t.help ? 'Have your men carry stone to the kiln (coin, very tiring)' : 'Have your men carry stone to the kiln (coin, very tiring; may not be enough)', go: 'end', run: (t, id) => { t.end = t.help ? 'round' : 'out'; taleTire(14); const n = taleCoin(id, 26); return t.help ? `Your men carry loose stone on their backs, eight miles to the kiln. With your two men already helping there, it keeps the fire going for four more days. By then the quarrymen have agreed to cut somewhere else, and the fire is saved. Fuscus pays <b class="gold num">${n}</b> denarii.` : `Your men carry loose stone on their backs, eight miles to the kiln, and Fuscus pays <b class="gold num">${n}</b> denarii for it. But one load is not enough. The quarry is still idle when it is used up, and on the tenth night the fire goes out.`; } },
          { label: () => 'Split the face yourself (coin; Temple favour -5, morale -3)', go: 'end', run: (t, id) => { t.end = 'broken'; const n = taleCoin(id, 38); favor('temple', -5); taleCheer(-3); return `Blaesus pays you <b class="gold num">${n}</b> denarii to be the one who breaks the face. It splits along the mouth. The quarrymen go back to work, and the fire is saved, but they will not speak to you, and your own men are uneasy: morale -3. Temple favour -5.`; } },
        ] },
    ] },

  // ---- the huts on stilts, and the bog oak ----
  bog: { name: 'The bog man',
    lore: { buried: { 'The bog oak': "The man from the bog is buried here. A child's wooden horse lies on his grave." }, torc: { 'The bog oak': 'The peat here has been dug up and left open. The body is gone.' },
      kept: { 'The bog oak': 'The man from the bog still lies here in the peat. A child brings him milk.', 'The huts on stilts': 'The children here are not afraid of the marsh. Their mothers are.' } },
    steps: [
      { mark: 'The huts on stilts', who: 'The marsh people', title: 'The bog man',
        text: () => `The marsh people do not like strangers, but a woman comes straight to you in her boat. She is worried about her daughter, <b>Uisca</b>, who is seven. Every evening the girl goes out into the marsh and comes back at dawn, and will only say that she has been "looking after him". The other children say there is a man lying in the bog by the black oak, who never gets up. The men of the village are too afraid to go and see.`,
        opts: [
          { label: () => 'Go to the bog oak', run: () => 'She gives you a bundle of reeds to lay over the soft ground, so you can cross it safely.' },
          { label: () => 'Ask the child about him', run: t => { t.child = true; return 'Uisca looks you over and decides to trust you. "He is cold," she says. "He has been asleep a long time, and nobody tucked him in." She points the way, and tells you to be careful of his hair.'; } },
          { label: () => 'Refuse', go: 'wait', run: () => 'She goes back in her boat without a word.' },
        ] },
      { mark: 'The bog oak', title: 'The man in the bog',
        text: t => `Under the roots of the black oak, a dead man lies on his side in the peat. The bog has preserved him: he is dark and hard as wood, with every hair of his red beard still in place and a cord round his neck. He was killed here long before the town was built. The child has put a blanket over him and a bowl of milk by his head${t.child ? ', and has combed his hair' : ''}. On his arm is a thick ring, black with peat, but gold where the blanket has rubbed it.`,
        opts: [
          { label: () => 'Bury him properly (Temple favour, fame)', go: 'end', run: t => { t.end = 'buried'; taleTire(6); favor('temple', 4); G.fame += 2; return 'You bury him on dry ground near the oak, with the gold ring still on his arm and the blanket over him. Uisca asks whether he will be warm now, and you tell her yes. She leaves her wooden horse on the grave. That night the marsh people send food to your fire, which they have never done for strangers. Temple favour +4, fame +2.'; } },
          { label: () => 'Take the gold ring (coin; morale -6, Temple favour -3)', go: 'end', run: (t, id) => { t.end = 'torc'; const n = taleCoin(id, 60); taleCheer(-6); favor('temple', -3); return `The ring will not come off over his hand, so you have to cut it free. None of your men will do it, and you do it yourself. A goldsmith pays <b class="gold num">${n}</b> denarii for it. The child is told that he woke up and went home, and she does not believe it. Your men are uneasy: morale -6. Temple favour -3.`; } },
          { label: () => 'Leave him, and tell the village he is harmless (morale)', go: 'end', run: t => { t.end = 'kept'; taleCheer(5); const g = taleLead(); g.xp = (g.xp || 0) + 2; return `You cover him with peat again, leaving his face clear as the child had it, and tell the village he is only a dead man and can hurt nobody. They are less afraid. Your men are pleased with how it ended: morale +5, and <b>${g.name}</b> gains a little experience.`; } },
        ] },
    ] },

  // ---- the old arena, and the old arch ----
  sweeper: { name: 'The last games',
    lore: { held: { 'The old arena': 'Old Hirpus still sweeps it every morning. Its last games were finished at last, by your men.' }, quiet: { 'The old arena': 'Nobody sweeps it any more. Grass is growing through the sand.' } },
    steps: [
      { mark: 'The old arena', who: 'An old man with a broom', title: 'The man who sweeps the sand',
        text: () => `An old man is sweeping the sand of the old arena, as if there were games tomorrow. There have been no games here for forty years. His name is <b>Hirpus</b>, and he has worked here all his life. "The last games were never finished," he says. "The Magistrate's men broke them up during the seventh fight. The man who gave the games hid the winner's prizes, a palm branch and a purse of money, and buried them under the old arch. He died that winter. If I had the palm, I could finish the games properly. Dig it up and bring it to me."`,
        opts: [
          { label: () => 'Go and dig at the old arch', run: () => 'He tells you exactly where under the arch to dig, and then tells you again to be sure.' },
          { label: () => 'Ask who was winning the last fight', run: t => { t.asked = true; return 'A Thracian called Sagaris was fighting a murmillo whose name he has forgotten, which upsets him. Sagaris had the man down, but the fight was stopped before it was judged. He tells you exactly where under the arch to dig.'; } },
          { label: () => 'Refuse', go: 'wait', run: () => 'He goes back to his sweeping.' },
        ] },
      { mark: 'The old arch', title: 'Under the old arch',
        text: () => `Three feet down you find an old leather bag. Inside is a palm branch made of gilded bronze, as long as an arm, and under it a heavy purse of silver coins: the prize money from forty years ago. The old man asked only for the palm.`,
        opts: [
          { label: () => 'Take him the palm and the purse', run: t => { t.purse = 'his'; return 'You put everything back in the bag and carry it to the old arena.'; } },
          { label: () => 'Take him the palm, and keep the purse (coin)', run: (t, id) => { t.purse = 'yours'; const n = taleCoin(id, 40); return `You keep the purse: <b class="gold num">${n}</b> denarii in old coins. He asked only for the palm, and you carry that to the old arena.`; } },
          { label: () => 'Keep both and go home (coin, morale -3)', go: 'end', run: (t, id) => { t.end = 'quiet'; const n = taleCoin(id, 55); taleCheer(-3); return `You keep the purse and sell the bronze palm: <b class="gold num">${n}</b> denarii in all. The old man never gets his palm, and his games are never finished. Your men think less of it: morale -3.`; } },
        ] },
      { mark: 'The old arena', title: 'The last fight',
        text: t => `Hirpus takes the palm in both hands, and for a moment cannot speak. Then he explains what he needs. The seventh fight must be fought to the end before the games can be closed. He wants two of your men to fight it on his sand, with him as judge${t.asked ? ': one standing in for Sagaris, and one for the man whose name he has forgotten' : ''}. There will be no crowd, and he does not mind.`,
        opts: [
          { label: () => 'Two men fight it properly, with wooden swords (experience, fame)', go: 'end', run: t => { t.end = 'held'; const men = fieldParty().slice(0, 2); men.forEach(g => { g.xp = (g.xp || 0) + 4; g.fatigue = clamp(g.fatigue + 18, 0, 100); }); G.fame += 3; return `${men.length > 1 ? `<b>${men[0].name}</b> and <b>${men[1].name}</b>` : 'Your men'} fight as if the stands were full, and Hirpus judges it as if forty thousand people were watching. He awards the palm and declares the games closed. Both men gain experience, and are tired. The story spreads: fame +3.`; } },
          { label: () => 'Give him a full show with every man (morale, fame)', go: 'end', run: t => { t.end = 'held'; taleCheer(9); taleTire(8); G.fame += 2; return 'Your men put on a whole day of games for one old man: the parade, the salute, and every fight. They enjoy it enormously, and he weeps with happiness all through it. He closes the games at dusk. Morale +9, fame +2, and your men are a little tired.'; } },
          { label: t => t.purse === 'his' ? 'One fight, and he keeps the purse for the arena (most fame, Magistrate favour)' : 'One fight, and give him 30 denarii for the arena (most fame, Magistrate favour)', go: 'end', run: t => { t.end = 'held'; if (t.purse !== 'his') G.denarii -= Math.min(Math.max(0, G.denarii), 30); favor('magistrate', 3); G.fame += 4; return `The fight is fought and judged, and the games are closed. ${t.purse === 'his' ? 'He will not take the purse for himself, but he accepts it to look after the arena.' : 'You leave him thirty denarii to look after the arena.'} An arena that is cared for might hold games again one day, and the Magistrate sends a man to look at it. Fame +4, Magistrate favour +3.`; } },
        ] },
    ] },

  // ---- the shepherds' fold, and the wolf stone ----
  whitewolf: { name: 'The wolf that lies down with the sheep',
    lore: { dog: { "The shepherds' fold": 'An old white dog guards the flock here again.', 'The wolf stone': "Old Mato the shepherd is buried here. His dog visits the grave every evening." },
      left: { 'The wolf stone': "An old white dog lies here on his master's grave." }, killed: { 'The wolf stone': "A shepherd is buried here. His white dog was killed on the grave." } },
    steps: [
      { mark: "The shepherds' fold", who: 'The shepherds', title: 'The wolf that lies down with the sheep',
        text: () => `The shepherds have all gathered at the fold, and they are frightened. At last the youngest explains. Every night for a month, a white wolf has jumped the wall, walked in among the sheep, and lain down with them until dawn. It has never harmed one. When it leaves, the sheep follow it to the gate. "We understand wolves that kill," says the boy. "We do not understand this one. It goes back up to the wolf stone. Kill it for us, before we find out what it is."`,
        opts: [
          { label: () => 'Go up to the wolf stone', run: () => 'They give you a cheese for the journey, and watch you until you are out of sight.' },
          { label: () => 'Wait in the fold tonight and watch it (tiring)', run: t => { t.seen = true; taleTire(6); return 'It comes when the moon rises: a big white animal, lame in one back leg. It walks through the flock as if it were counting the sheep. When a shepherd coughs it turns its head, like an animal that is used to people. At dawn it goes back up the hill to the wolf stone, and you follow it.'; } },
          { label: () => 'Refuse', go: 'wait', run: () => 'They look at one another. They have no other plan.' },
        ] },
      { mark: 'The wolf stone', danger: true, title: 'At the wolf stone',
        text: t => `The animal is lying at the foot of the wolf stone, on a grave with a shepherd's crook stuck in it. It does not get up. It is not a wolf${t.seen ? ', as you had begun to suspect' : ''}. It is a dog: one of the big white sheepdogs, old now, with a ragged coat and a worn collar. An old shepherd called Mato, who kept the sheep on this hill, died in the spring and was buried here. His dog ran away that night. It has been guarding his grave by day and his sheep by night ever since.`,
        opts: [
          { label: () => 'Take the dog back to the shepherds (coin, morale)', go: 'end', run: (t, id) => { t.end = 'dog'; const n = taleCoin(id, 20); taleCheer(6); return `The dog comes with you once he sees you are going to the sheep. The shepherds are ashamed of having been afraid, and then delighted to have their best sheepdog back. They give you <b class="gold num">${n}</b> denarii. The dog still goes up to the grave every evening, and is back in time to guard the flock. Morale +6.`; } },
          { label: () => 'Leave the dog at the grave, and tell them (fame, Temple favour)', go: 'end', run: t => { t.end = 'left'; favor('temple', 3); G.fame += 2; return 'You leave the dog some bread and go back to tell the shepherds what he is. They listen in silence. That night they leave the gate of the fold open for him, with a bowl of food beside it. Fame +2, Temple favour +3.'; } },
          { label: () => 'Kill it anyway, as they asked (coin, morale -6)', ok: canFightNow, go: 'end', run: (t, id) => { const tr = Math.min(3, taleTier(id)); return wildFight('The white dog of the wolf stone', [questBeast('wolf', tr, 'The white dog', 1.5)], 'rock', 'tale', { tier: tr, day: true }); },
            won: (t, id) => { t.end = 'killed'; const n = taleCoin(id, 32); taleCheer(-6); return `The dog would not leave the grave, so you killed him there. The shepherds pay the <b class="gold num">${n}</b> denarii they promised. One of the older ones recognises the collar, and says nothing. Your men hated doing it: morale -6.`; } },
        ] },
    ] },

  // ---- the broken aqueduct, and the great waterfall ----
  surveyor: { name: "The surveyor's mark",
    lore: { found: { 'The broken aqueduct': 'It is marked out for repair. The governor has been asked to pay for it.', 'The great waterfall': 'Behind the waterfall is a mark cut by the men who built the aqueduct.' },
      guessed: { 'The broken aqueduct': 'It is marked out for repair, from a number that was only a guess.' }, shared: { 'The great waterfall': 'Smugglers use the cave behind the waterfall.' } },
    steps: [
      { mark: 'The broken aqueduct', who: 'A man with a levelling-staff', title: "The surveyor's mark",
        text: () => `A thin man is walking along the broken aqueduct with a measuring staff, muttering numbers. He is <b>Strabo the surveyor</b>, and he has spent a year here at his own expense. "It can be repaired. Only eleven arches are broken. But the governor will not pay unless I can prove the water will still run downhill all the way, and for that I need one number. The men who built the aqueduct cut it into the rock behind the great waterfall. I am fifty-eight and cannot swim. Go there and read it for me. It is at about eye height."`,
        opts: [
          { label: () => 'Go and read it for him', run: () => 'He writes down what the mark will look like, so that you will know it when you see it.' },
          { label: () => 'Ask what your school gains (more Guild favour)', run: t => { t.paid = true; return 'He had not thought about that. Then he has an answer: the repair work would go to the Guild\'s builders, and the Guild remembers who finds it work. He promises to tell them it was you. He writes down what the mark will look like.'; } },
          { label: () => 'Refuse', go: 'wait', run: () => 'He has gone back to his numbers before you have turned away.' },
        ] },
      { mark: 'The great waterfall', danger: true, title: 'Behind the waterfall',
        text: (t, id, c) => `Behind the waterfall there is a dry cave, as Strabo said. But it is in use. There is a fire in it, and bales and jars of untaxed goods, and the smugglers who own them. They carry goods up the river by night, and have hidden them here for years. The mark you need is cut into the back wall, behind their stores. <span class="bad">${skulls(taleTier(id))}</span>${sizeUp(c, () => { const tr = taleTier(id); return [questBoss(tr, 'The smugglers\' captain', { tactic: 'balanced' })].concat(wildMen(tr, Math.max(1, wildCount(tr) - 2))); })}`,
        opts: [
          { label: () => 'Fight the smugglers (coin, Guild and Magistrate favour)', ok: canFightNow, go: 'end', run: (t, id) => { const tr = taleTier(id); return wildFight('Smugglers behind the fall', [questBoss(tr, 'The smugglers\' captain', { tactic: 'balanced' })].concat(wildMen(tr, Math.max(1, wildCount(tr) - 2))), 'rock', 'tale', { tier: tr, day: true }); },
            won: (t, id) => { t.end = 'found'; const n = taleCoin(id, 40); favor('guild', t.paid ? 8 : 6); favor('magistrate', 3); return `With the smugglers beaten, you find the mark on the back wall: a line, a number, and the initials of the man who cut it. The goods the smugglers leave behind are worth <b class="gold num">${n}</b> denarii. Strabo has his number, and the aqueduct can be repaired. Guild favour +${t.paid ? 8 : 6}, Magistrate favour +3.`; } },
          { label: () => 'Pay the smugglers to let you read it (40 denarii; Guild favour)', ok: () => G.denarii >= 40, go: 'end', run: t => { G.denarii -= 40; t.end = 'found'; favor('guild', t.paid ? 7 : 5); G.fame += 1; return `The smugglers think it very funny that anyone would pay to read a number off a rock, but they take the money and even hold the torch for you. Strabo has his number, and the aqueduct can be repaired. Guild favour +${t.paid ? 7 : 5}, fame +1.`; } },
          { label: () => 'Go back and give him a guess (may fail)', go: 'end', run: (t, id) => {
            if (chance(clamp(0.3 + bestWits() * 0.03, 0.3, 0.8))) { t.end = 'guessed'; favor('guild', 3); return 'Your cleverest man measures the height of the waterfall by pacing it out, and works out a number. Strabo checks it three ways and finds that it agrees with his own figures. He accepts it. It may even be right. Guild favour +3.'; }
            t.end = 'shared'; favor('guild', -2); return 'He can tell at once that the number is a guess: after a year of measuring, he knows roughly what it should be. He thanks you politely and goes back to his work. The aqueduct stays broken. Guild favour -2.'; } },
        ] },
    ] },

  // ---- the villa, and the salt pans ----
  cook: { name: "The lady's cook",
    lore: { free: { 'A villa in its garden': 'The lady has a new cook, and buys her fish sauce from her old one.', 'The salt pans': 'Syrus, a free man now, makes the best fish sauce in the province here.' },
      taken: { 'A villa in its garden': 'Syrus the cook was brought back here by force. His cooking is not what it was.' }, jar: { 'The salt pans': 'Syrus the runaway cook makes fish sauce here, under another name.' } },
    steps: [
      { mark: 'A villa in its garden', who: 'The lady of the villa', title: "The lady's cook",
        text: () => `The lady of the villa, <b>Domitia</b>, speaks to you in her garden. The governor is coming to dinner in nine days, and she has no cook. "My cook Syrus worked in my kitchen for thirty years. A month ago he walked out, and took the recipe for his fish sauce with him. That sauce is the only reason important people dine here. I am told he is at the salt pans, making it for anyone who will pay. Go there and bring my cook back."`,
        opts: [
          { label: () => 'Go to the salt pans', run: () => 'She has your men given a meal before you go. It is cold, and not good.' },
          { label: () => 'Ask why he left', run: t => { t.asked = true; return '"I cannot imagine," she says, but she looks as if she knows very well. Your men are given a cold meal, and you set out.'; } },
          { label: () => 'Refuse', go: 'wait', run: () => 'She has already turned back to her roses.' },
        ] },
      { mark: 'The salt pans', title: 'The cook at the salt pans',
        text: t => `He is easy to find: a row of vats in the sun, and a strong smell of fish. <b>Syrus</b> is a small bald man, and he is perfectly happy here. "She set me free eleven years ago, in front of witnesses. But she has never given me the paper that proves it${t.asked ? ', and she knows that' : ''}. Without the paper I get no wages. I am a free man who is treated as a slave. Here I am paid for every jar. Tell her this: if she gives me my paper, I will supply her with sauce."`,
        opts: [
          { label: () => 'Take his terms to the lady (coin, Guild favour)', go: 'end', run: (t, id) => { t.end = 'free'; const n = taleCoin(id, 24); favor('guild', 3); return `It takes her a day to agree, but she signs the paper that makes Syrus legally free. She will not have him back in her house. But the governor gets his fish sauce, bought from Syrus at a fair price, and she pays you <b class="gold num">${n}</b> denarii for arranging it. Guild favour +3.`; } },
          { label: () => 'Take him back by force (more coin; morale -3, Magistrate favour -2)', go: 'end', run: (t, id) => { t.end = 'taken'; const n = taleCoin(id, 34); favor('magistrate', -2); taleCheer(-3); return `He does not resist. He packs his knives and comes. Domitia pays you <b class="gold num">${n}</b> denarii. But he cooks badly for her on purpose, and the governor's dinner is a disappointment. People also remember that she freed him in front of witnesses, and they talk. Your men dislike it: morale -3. Magistrate favour -2.`; } },
          { label: () => 'Buy her a jar, and say you could not find him (25 denarii; coin, morale)', ok: () => G.denarii >= 25, go: 'end', run: (t, id) => { G.denarii -= 25; t.end = 'jar'; const n = taleCoin(id, 26); taleCheer(4); return `You buy a jar of his sauce and tell Domitia that the cook could not be found. She does not believe you, but she tastes the sauce and decides not to argue. She pays <b class="gold num">${n}</b> denarii. Syrus gave you a second jar for nothing, and your men eat well all week: morale +4.`; } },
        ] },
    ] },
};

// The places where a story stands just now: somebody waiting, or the next place it leads.
function taleSites() {
  if (typeof G === 'undefined' || !G || !G.dynasty) return [];
  const B = taleBook(), out = [];
  for (const id in TALES) {
    const t = B[id] || { step: 0 };
    if (t.done || (t.wait && t.wait > G.day)) continue;
    const S = TALES[id].steps[t.step], p = S && landmarkAt(S.mark);
    if (!p) continue;
    out.push({ id: 't_' + id, kind: 'tale', x: p.x, y: p.y, tier: clamp(wildTier(p.x, p.y), 1, 5), name: t.step ? S.mark : S.who, fixed: true, tale: id, waiting: !t.step, danger: S.danger ? taleTier(id) : 0 });
  }
  return out;
}
// The stories in hand: begun, and not ended.
const talesOpen = () => Object.keys(TALES).filter(id => { const t = taleBook()[id]; return t && t.step > 0 && !t.done; });
// What a landmark has to say for itself once a story has ended there.
function taleLore(name) {
  if (typeof G === 'undefined' || !G || !G.dynasty) return '';
  const B = taleBook();
  for (const id in TALES) { const t = B[id], L = t && t.done && TALES[id].lore && TALES[id].lore[t.end]; if (L && L[name]) return L[name]; }
  return '';
}
// Moves a story on: to its next place, to its end, or aside for a few days if the school would not hear it.
function taleMove(id, go) {
  const t = taleOf(id), T = TALES[id], sid = 't_' + id, M = wildMap();
  if (go === 'wait') { t.wait = G.day + 6; delete M.marks[sid]; return ''; }
  if (go === 'end' || (typeof go !== 'number' && t.step + 1 >= T.steps.length)) {
    t.done = G.day; delete M.marks[sid]; delete M.seen[sid];
    log(`${T.name}: the matter is closed.`, 'gold');
    return '';
  }
  t.step = typeof go === 'number' ? go : t.step + 1; delete t.wait;
  M.seen[sid] = 1; wildMark(sid, 'tale');
  return ` <span class="gold">${T.steps[t.step].mark} is marked on your map.</span>`;
}
const taleCtx = c => { const id = c && TALES[c.tid] ? c.tid : Object.keys(TALES)[0], t = taleOf(id), T = TALES[id]; return { id, t, T, S: T.steps[Math.min(t.step, T.steps.length - 1)] }; };
let taleTitle = 'A story of the place';
const TALE_EVENT = {
  auto: true, wild: true, can: () => !!G.field,
  make: () => ({ tid: Object.keys(TALES).find(id => !taleOf(id).done) || Object.keys(TALES)[0] }),
  text: c => { const { id, t, S } = taleCtx(c); return S.text(t, id, c); },
  opts: [0, 1, 2].map(i => ({
    label: c => { const { id, t, S } = taleCtx(c); return S.opts[i].label(t, id); },
    ok: c => { const { id, t, S } = taleCtx(c), o = S.opts[i]; return !o.ok || !!o.ok(t, id); },
    run: c => {
      const { id, t, S } = taleCtx(c), o = S.opts[i]; c.was = S.title; const out = o.run(t, id);
      if (G.field && G.field.fight && G.field.fight.win === 'tale') { G.field.fight.tid = id; G.field.fight.opt = i; return out; }      // it comes to blows: the story moves on if the school wins
      return out + taleMove(id, o.go);
    },
  })),
};
Object.defineProperty(TALE_EVENT, 'title', { enumerable: true, get() { const pe = typeof G !== 'undefined' && G && G.pendingEvent; if (pe && pe.id === 'wTale') taleTitle = pe.c.was || taleCtx(pe.c).S.title; return taleTitle; } });
EVENTS.wTale = TALE_EVENT;
SITE_EVENT.tale = 'wTale';
WILD_WINS.tale = F => {
  if (!TALES[F.tid]) return ['It is done.'];
  const t = taleOf(F.tid), o = TALES[F.tid].steps[t.step].opts[F.opt || 0], lines = [o.won ? o.won(t, F.tid) : 'It is done.'], more = taleMove(F.tid, o.go);
  if (more) lines.push(more.trim());
  return lines;
};

// =====================================================================================================
// WHAT A PLACE IS GOOD FOR
// Every landmark has a use of its own, to be had by walking up to it: bread at the mill, a soak at the hot
// spring, a day's drill with the garrison at the fort, the long view from the eagle rock. Each can be had
// again after a while (cool, in days), some cost a few denarii, and some take the rest of the day (day: how
// the men spend it). How a story ended at a place changes what the place will do for you afterwards:
// alt['story.ending'] is laid over the use, and off says why there is nothing to be had there any more.
//   fx: rest (fatigue off), tire (fatigue on), heal (share of health), cheer (spirits), xp (each fit man),
//       mend (a day off one man's wound), coin [low, high], favor [patron, n], fame, see (how far the fog
//       lifts), bless (the temple's blessing, until the next games)
// =====================================================================================================
const taleEnd = id => { const t = (typeof G !== 'undefined' && G && G.dynasty && wildMap().tales || {})[id]; return t && t.done ? t.end || '' : ''; };
const LAND_USE = {
  'The great oak': { verb: 'Rest in its shade', what: 'An hour on your backs under the oldest tree in the province.', fx: { rest: 10, cheer: 2 },
    alt: { 'oak.stands': { what: 'An hour under the oak. Senna brings water from the spring, and will take nothing for it.', fx: { rest: 14, cheer: 5 } }, 'oak.felled': { what: 'There is less shade than there was, and the men look at the stump of the great limb.', fx: { rest: 6 } } } },
  'A villa in its garden': { verb: 'Dine in the yard', cost: 15, cool: 2, what: 'The lady does not have gladiators indoors, but her kitchen feeds them in the yard for a price.', fx: { rest: 8, cheer: 6, heal: 0.05 },
    alt: { 'cook.taken': { what: 'Syrus cooks it, without a word. It is correct in every particular.', fx: { rest: 8, cheer: 2, heal: 0.05 } }, 'cook.free': { cost: 20, what: 'The new cook is no Syrus, and the lady charges more to make up for the fish sauce she has to buy.', fx: { rest: 8, cheer: 4, heal: 0.05 } } } },
  'The old arch': { verb: 'Read the names cut in it', cool: 5, what: 'Legions, consuls, and under them forty years of gladiators who scratched their own.', fx: { cheer: 4 } },
  'The wine press': { verb: 'Buy wine for the men', cost: 12, cool: 2, what: 'New wine, from the vat, in whatever will hold it.', fx: { cheer: 8 },
    alt: { 'vintner.supper': { cost: 8, what: 'Sergius is in a generous temper these days. It tastes of thyme honey.', fx: { cheer: 10 } }, 'vintner.quits': { cost: 14, what: 'Sergius remembers who cost him forty denarii. He sells, at his price.', fx: { cheer: 8 } } } },
  'The fallen colossus': { verb: 'Train in its shadow', day: 'forage', cool: 6, what: 'A day of drill between the fingers of an emperor. It puts things in proportion.', fx: { xp: 2, tire: 10 } },
  'An old battlefield': { verb: 'Glean the field', day: 'forage', cool: 8, what: 'A day turning the furrows for what the plough has missed.', fx: { coin: [8, 26], cheer: -2 } },
  'The bee garden': { verb: 'Buy honey for the wounds', cost: 15, cool: 3, what: 'Nothing closes a cut like it. The keeper is never stung; your men are.', fx: { heal: 0.1, mend: 1 },
    alt: { 'vintner.supper': { cost: 10, what: 'Albia is in a generous temper these days.', fx: { heal: 0.12, mend: 1 } } } },
  'The mill': { verb: 'Buy bread', cost: 10, what: 'New bread from the mill oven, eaten on the mill-race wall.', fx: { rest: 12, cheer: 3 },
    alt: { 'miller.stayed': { cost: 5, what: 'Varia runs it alone now, and the bread is better. Half price, to the school that brought her the news.', fx: { rest: 15, cheer: 4 } },
      'miller.dragged': { cost: 5, what: 'Gnaeus serves you himself, at half price, and does not meet your eye.', fx: { rest: 12, cheer: 3 } }, 'miller.home': { cost: 5, what: 'Gnaeus serves you himself, at half price, and asks after nobody.', fx: { rest: 12, cheer: 4 } } } },
  'A wreck on the strand': { verb: 'Pick over the wreck', cool: 6, what: 'The sea brings something in on most tides.', fx: { coin: [3, 12] },
    alt: { 'beacon.dark': { what: 'There are two hulks now, and the second has hardly been touched.', fx: { coin: [10, 30], cheer: -3 } }, 'beacon.lit': { what: 'With the beacon lit, little comes ashore here any more.', fx: { coin: [1, 5] } } } },
  'The beacon': { verb: 'Warm yourselves at the keeper\'s fire', what: 'He is glad of anybody to talk to.', fx: { rest: 10 },
    alt: { 'beacon.lit': { what: 'Mettius will not hear of your passing without sitting down. There is no warmer place on the coast.', fx: { rest: 18, heal: 0.06, cheer: 3 } }, 'beacon.dark': { off: 'The beacon is cold, and the keeper has gone inland.' } } },
  'The bones of a whale': { verb: 'Take a sliver of bone for luck', cool: 5, what: 'Every fisherman on the coast carries one.', fx: { cheer: 4 },
    alt: { 'whale.carted': { off: 'There is nothing here now but a hollow in the sand.' }, 'whale.back': { what: 'The fishers have left the first fish of the catch between the ribs. They would want you to have it.', fx: { cheer: 5, heal: 0.04 } } } },
  "The fishers' huts": { verb: 'Buy fish', cost: 12, what: 'Off the boat, split and grilled on the shingle.', fx: { rest: 8, heal: 0.08 },
    alt: { 'whale.back': { cost: 6, what: 'The boats are out again, and they know whose doing that was.', fx: { rest: 10, heal: 0.1 } }, 'whale.cast': { cost: 6, what: 'The boats are out again, and they know whose doing that was.', fx: { rest: 10, heal: 0.1 } }, 'whale.carted': { cost: 18, what: 'Half the boats are drawn up for good. What fish there is, is dear.', fx: { rest: 8, heal: 0.06 } } } },
  'The charcoal burners': { verb: 'Sit at their fire', what: 'Black men, black dogs, and the best-kept fire in the forest.', fx: { rest: 8, cheer: 1 } },
  "The hunters' lodge": { verb: 'Buy game', cost: 15, cool: 2, what: 'Venison, hung a week. They will not sell the liver.', fx: { heal: 0.1, cheer: 4 } },
  'A burnt village': { verb: 'Search the ash', cool: 10, what: 'Somebody always buried something under the hearth.', fx: { coin: [4, 16], cheer: -3 },
    alt: { 'watch.back': { verb: 'Stand a moment at the grave', cool: 4, what: 'One grave in the ash has a stone on it. Your men put it there.', fx: { cheer: 4 } }, 'watch.oath': { verb: 'Stand a moment at the grave', cool: 4, what: 'One grave in the ash has a stone on it.', fx: { cheer: 4 } } } },
  'The great quarry': { verb: 'Lift stone with the quarrymen', day: 'forage', cool: 6, what: 'A day on the benches, paid by the block. It makes shoulders.', fx: { xp: 1, coin: [8, 18], tire: 16 },
    alt: { 'kiln.broken': { off: 'The quarrymen will not work beside the men who put the wedge in.' }, 'kiln.round': { what: 'A day on the benches, paid by the block, and the overseer adds something for old times.', fx: { xp: 1, coin: [12, 24], tire: 16 } } } },
  'The lime kiln': { verb: 'Dry out by the kiln', what: 'It has been alight for nineteen years, and it is warm for forty paces round.', fx: { rest: 10 },
    alt: { 'kiln.out': { off: 'The kiln is cold. They are waiting on a priest to light it again.' }, 'kiln.round': { what: 'Fuscus clears his own bench for you, and has bread sent for.', fx: { rest: 14, cheer: 3 } } } },
  'The unfinished columns': { verb: 'Wrestle among the columns', cool: 3, what: 'Flat drums of marble, the right height to throw a man over.', fx: { cheer: 5, tire: 5 } },
  'The watchtower': { verb: 'Ask what they have seen', cool: 4, what: 'Two men and a long view north: they know what has moved on every road for a week.', fx: { see: 320 },
    alt: { 'watch.back': { what: 'Rufio comes down the ladder himself, and tells you everything he has seen and a good deal he has guessed.', fx: { see: 460, cheer: 2 } }, 'watch.gone': { what: 'One man cannot watch every way at once. He tells you what he can.', fx: { see: 220 } }, 'watch.oath': { what: 'One man cannot watch every way at once. He tells you what he can.', fx: { see: 220 } } } },
  'The hot spring': { verb: 'Soak the road out of them', day: 'scout', cool: 3, what: 'The rest of the day in water as hot as a man can bear.', fx: { rest: 30, heal: 0.14, mend: 1 },
    alt: { 'miller.stayed': { what: 'The rest of the day in the hot water. Gnaeus the miller moves over to make room, and explains at length how happy he is.', fx: { rest: 30, heal: 0.14, mend: 1, cheer: 3 } } } },
  'The eagle rock': { verb: 'Climb it for the view', cool: 4, what: 'A hard hour up, and half the province laid out at the top.', fx: { see: 440, tire: 8 } },
  'The ring of stones': { verb: 'Sleep inside the ring', day: 'camp', cool: 4, what: 'Nothing has ever troubled anybody who slept inside it. The men sleep like the dead.', fx: { cheer: 5 },
    alt: { 'giant.taken': { what: 'The men would as soon not sleep here now. They do, and do not say much.', fx: { cheer: -2 } } } },
  "The giant's table": { verb: 'Leave something on the table', cost: 5, cool: 3, what: 'Bread, for the giant. Everybody does.', fx: { cheer: 4 },
    alt: { 'giant.fed': { cost: 0, verb: 'Eat with Brica', what: 'She bakes for three now: herself, the giant, and whoever is passing.', fx: { cheer: 5, heal: 0.05, rest: 6 } }, 'giant.taken': { off: 'Nobody sets a supper on it any more, and Brica will not speak to you.' } } },
  'The needle': { verb: 'Cut the school\'s mark on it', cool: 40, what: 'It is covered in them, to the height a man can reach. Yours goes higher.', fx: { fame: 1, cheer: 3 } },
  'The drowned temple': { verb: 'Throw a coin in the water', cost: 5, cool: 4, what: 'For whatever god it was.', fx: { cheer: 3 },
    alt: { 'ferry.silent': { off: 'The old priest pulls at a rope with nothing on it, and does not answer you.' }, 'ferry.noon': { cost: 0, verb: 'Hear the noon office', what: 'He rings at noon now, and is pleased to have a congregation.', fx: { cheer: 7 } }, 'ferry.kept': { cost: 0, verb: 'Hear the names read', what: 'He reads the names of the drowned at dusk, and yours stand to hear it.', fx: { cheer: 8 } } } },
  'The causeway': { verb: 'Set eel-lines from the causeway', cool: 2, what: 'The marsh is full of them, and they are better than they look.', fx: { heal: 0.06 } },
  'The bog oak': { verb: 'Cut peat for the fire', what: 'It burns slow and smells of the year it was laid down.', fx: { rest: 6 },
    alt: { 'bog.buried': { verb: 'Stand at the grave', cool: 4, what: 'A mound on the dry rise, with a wooden horse on it.', fx: { cheer: 5 } }, 'bog.torc': { off: 'The peat lies open where you dug. The men will not stop here.' } } },
  'The huts on stilts': { verb: 'Trade for smoked eel', cost: 10, what: 'They will not come out of their boats to do it.', fx: { heal: 0.08 },
    alt: { 'bog.buried': { cost: 4, what: 'They pole out to meet you now, and the price has come down to nearly nothing.', fx: { heal: 0.1, cheer: 2 } }, 'bog.torc': { off: 'The marsh people have taken up their ladders. Nobody will trade.' } } },
  'The wolf stone': { verb: 'Leave meat at the stone', cost: 8, cool: 6, what: 'For Mars, whose beast the wolf is. The priests hear who does.', fx: { favor: ['temple', 1], cheer: 2 },
    alt: { 'whitewolf.left': { what: 'The meat is for Mars. The old white dog on the grave gets it in the end, and nobody minds.', fx: { favor: ['temple', 1], cheer: 5 } }, 'whitewolf.killed': { what: 'The men leave more than they were told to.', fx: { favor: ['temple', 1] } } } },
  "The shepherds' fold": { verb: 'Buy a sheep for the pot', cost: 18, cool: 2, what: 'Mutton, and broth from the bones.', fx: { heal: 0.1, cheer: 5 },
    alt: { 'whitewolf.dog': { cost: 10, what: 'The old white dog counts you in at the gate. The shepherds take off nearly half.', fx: { heal: 0.1, cheer: 6 } }, 'whitewolf.left': { cost: 12, what: 'They leave the gate open for the dog at night, and are easier men for it.', fx: { heal: 0.1, cheer: 5 } } } },
  'The gallows': { verb: 'Read the notices', cool: 5, what: 'Who is wanted, and where they were last seen.', fx: { see: 200 },
    alt: { 'gallows.hanged': { off: 'Your men will not stop under it.' } } },
  'The broken aqueduct': { verb: 'Fill the skins at the leak', what: 'Mountain water, forty miles from the mountains.', fx: { rest: 6 },
    alt: { 'surveyor.found': { what: 'The masons have a cook-fire going under the fourth arch, and room at it for the men who found them the work.', fx: { rest: 12, cheer: 3 } } } },
  'The great waterfall': { verb: 'Stand under the fall', cool: 2, what: 'Cold enough to stop the breath. It takes a week off a man.', fx: { rest: 15, cheer: 4 } },
  'The salt pans': { verb: 'Buy salt meat', cost: 15, cool: 2, what: 'It keeps, which is the best that can be said for it.', fx: { heal: 0.06, rest: 8 },
    alt: { 'cook.free': { what: 'Salt meat, and Syrus throws in a ladle of the best garum in the province.', fx: { heal: 0.08, rest: 8, cheer: 6 } }, 'cook.jar': { what: 'Salt meat, and a man who is not called Syrus throws in a ladle of the best garum in the province.', fx: { heal: 0.08, rest: 8, cheer: 6 } } } },
  'The sacred grove': { verb: 'Make an offering', cost: 25, cool: 6, what: 'Silver on the stone, and no questions asked of the trees.', fx: { favor: ['temple', 2], cheer: 6 },
    alt: { 'oak.stands': { cost: 12, what: 'The priestess knows you. She takes less, and thumbs each man on the forehead.', fx: { favor: ['temple', 2], cheer: 8 } }, 'oak.felled': { off: 'The priestess looks through you. The grove does not want your silver.' } } },
  'The white temple': { verb: 'Have the priests bless the school', cost: 40, cool: 8, what: 'Fire and laurel. Until the next games the crowd will be slower to turn down its thumb on a man of yours.', fx: { bless: true, cheer: 8 } },
  'The barrow of kings': { verb: 'Pour wine for the kings', cost: 10, cool: 6, what: 'They were here before Rome. It does no harm to be civil.', fx: { cheer: 4 } },
  'The fort': { verb: 'Drill with the garrison', day: 'forage', cool: 6, what: 'A day on the parade ground under a centurion who does not like gladiators and means to prove why.', fx: { xp: 2, tire: 12 },
    alt: { 'gallows.freed': { what: 'A day on the parade ground. The men whose pay you found make sure yours are shown everything.', fx: { xp: 3, tire: 10, cheer: 3 } }, 'gallows.hanged': { verb: 'Collect on the quartermaster\'s contract', day: null, cool: 10, what: 'Oil, leather and wine. Sulca pays promptly, in coin out of the pay chest.', fx: { coin: [14, 22], cheer: -3 } } } },
  'The old arena': { verb: 'Train on the old sand', day: 'forage', cool: 6, what: 'A day of work where better men than yours once died.', fx: { xp: 2, tire: 10 },
    alt: { 'sweeper.held': { what: 'A day of work on sand swept that morning, with Hirpus in the editor\'s box calling the faults.', fx: { xp: 3, tire: 10, cheer: 3 } }, 'sweeper.quiet': { what: 'A day of work. The grass is coming up through the sand, and nobody sweeps it.', fx: { xp: 2, tire: 10, cheer: -2 } } } },
  'The ferry': { verb: 'Ask the ferryman for news', cost: 5, cool: 4, what: 'Everybody who crosses the river tells him something.', fx: { see: 300 } },
};
// The use of a place as it stands today, with whatever a story has done to it.
function landUse(name) {
  const base = LAND_USE[name]; if (!base) return null;
  if (base.alt) for (const k in base.alt) { const [tid, end] = k.split('.'); if (taleEnd(tid) === end) return Object.assign({ changed: true }, base, base.alt[k], { alt: null }); }
  return base;
}
// Can it be had now? { u, cost, wait, why }: why is empty when it can.
function landUseState(name) {
  const u = landUse(name); if (!u) return null;
  const M = wildMap(), last = (M.used || {})[name], cool = u.cool || 1, wait = last ? Math.max(0, last + cool - G.day) : 0, cost = u.cost || 0;
  const why = u.off ? u.off : wait ? `Again in ${wait} day${wait === 1 ? '' : 's'}.` : G.denarii < cost ? `You are ${cost - G.denarii} denarii short.` : u.fx.xp && !fieldParty().length ? 'Nobody is fit for it.' : '';
  return { u, cost, wait, why };
}
// What it does, in a few words: before (what it would do) or after (what it did, with the coin counted).
function landUseWords(u, got) {
  const f = u.fx || {}, out = [];
  if (f.rest) out.push(`fatigue -${f.rest}`);
  if (f.tire) out.push(`fatigue +${f.tire}`);
  if (f.heal) out.push(`health +${Math.round(f.heal * 100)}%`);
  if (f.mend) out.push('a day off one wound');
  if (f.cheer) out.push(`spirits ${f.cheer > 0 ? '+' : ''}${f.cheer}`);
  if (f.xp) out.push(`+${f.xp} experience for each fit man`);
  if (f.coin) out.push(got !== undefined ? `+${got} denarii` : 'a little silver');
  if (f.favor) out.push(`${PATRONS[f.favor[0]].name.replace(/^The /, '')} favour +${f.favor[1]}`);
  if (f.fame) out.push(`fame +${f.fame}`);
  if (f.see) out.push('the country round is made known');
  if (f.bless) out.push('blessed until the next games');
  if (u.day) out.push('takes the rest of the day');
  return out.join(', ');
}
// Has it. Returns what happened, in words, or null if it could not be had.
function landUseRun(name) {
  const st = landUseState(name); if (!st || st.why || !G.field) return null;
  const { u, cost } = st, f = u.fx || {}, M = wildMap(), men = G.roster.filter(g => !g.away), tier = (() => { const p = landmarkAt(name); return p ? clamp(wildTier(p.x, p.y), 1, 5) : 1; })();
  G.denarii -= cost; (M.used || (M.used = {}))[name] = G.day;
  let got;
  if (u.day) { G.field.march = 0; fieldDay(u.day); if (!G.field) return u.what; M.used[name] = G.day; }      // the day is spent first; what the place gives is had at the end of it
  const now = G.roster.filter(g => !g.away);
  if (f.rest) now.forEach(g => { g.fatigue = clamp(g.fatigue - f.rest, 0, 100); });
  if (f.tire) now.forEach(g => { g.fatigue = clamp(g.fatigue + f.tire, 0, 100); });
  if (f.heal) now.forEach(g => { g.hp = Math.min(maxHp(g), g.hp + maxHp(g) * f.heal); });
  if (f.cheer) now.forEach(g => evMor(g, f.cheer));
  if (f.mend) { const g = now.filter(x => x.injury > 0).sort((a, b) => b.injury - a.injury)[0]; if (g) g.injury = Math.max(0, g.injury - f.mend); }
  if (f.xp) fieldParty().forEach(g => { g.xp = (g.xp || 0) + f.xp; });
  if (f.coin) { got = Math.round(rand(f.coin[0], f.coin[1]) * (0.6 + 0.4 * tier)); G.denarii += got; }
  if (f.favor) favor(f.favor[0], f.favor[1]);
  if (f.fame) G.fame += f.fame;
  if (f.see) { const r = f.see; for (let dy = -r; dy <= r; dy += 60) for (let dx = -r; dx <= r; dx += 60) if (Math.hypot(dx, dy) <= r) wildReveal(G.field.x + dx, G.field.y + dy); }
  if (f.bless) G.blessed = nextGames();
  const words = landUseWords(u, got);
  log(`${name}: ${u.verb.toLowerCase()}.`);
  return `${u.what}${words ? ` <span class="dim">${words.charAt(0).toUpperCase() + words.slice(1)}.</span>` : ''}`;
}
// The landmark the column is standing at, if it is at one.
function landmarkHere() {
  const F = G.field; if (!F) return null;
  const S = landmarkSpots(); let best = null, bd = 24;
  for (const n in S) { const d = Math.hypot(S[n].x - F.x, S[n].y - F.y); if (d < bd) { bd = d; best = n; } }
  return best;
}
