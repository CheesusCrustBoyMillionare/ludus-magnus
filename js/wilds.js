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
function wildRoute(x0, y0, x1, y1) {
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
      const nd = d + (dx && dy ? 1.414 : 1) * (ROUTE_COST[L.t[n]] || 1);
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
function wildBeasts(tier, extra) {
  const kinds = [['wolf', 'wolf'], ['boar', 'boar', 'wolf'], ['bear', 'bear', 'wolf'], ['lion', 'lion', 'lion'], ['lion', 'lion', 'lion', 'bear', 'bear']][tier - 1].concat(extra || []);
  return kinds.map(k => makeBeast(k, WILD_BUDGET[tier - 1]));
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
  if (!G.roster.length && G.denarii < Math.min(...G.market.map(m => m.price))) G.over = 'empty';
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
const leaveIt = { label: () => 'Leave it for now', run: () => 'You turn the school about and march on.' };
const wildCan = kind => () => !!G.field && wildSites().some(s => s.kind === kind);
const wildMake = kind => () => ({ sid: wildSites().find(s => s.kind === kind).id });
const strength = foes => Math.round(foes.reduce((n, f) => n + power(f), 0));
const yours = () => Math.round(fieldParty().reduce((n, g) => n + power(g), 0));

const WILD_EVENTS = {
  wLair: {
    title: 'Tracks, and a smell', can: wildCan('lair'), make: wildMake('lair'),
    text: c => `<b>${site(c).name}</b> <span class="bad">${skulls(site(c).tier)}</span>. The mules will not go nearer. Whatever lives here has been taking sheep, and lately shepherds. Every fit man you have would go in together.${sizeUp(c, () => wildBeasts(site(c).tier))} It will take the day.`,
    opts: [
      { label: () => 'Go in after them', ok: canFightNow, run: c => { const s = site(c); return wildFight(s.name, wildBeasts(s.tier), s.tier >= 3 ? 'rock' : 'forest', 'lair', { sid: s.id, day: true }); } },
      leaveIt,
    ],
  },
  wCamp: {
    title: 'Smoke over the trees', can: wildCan('camp'), make: wildMake('camp'),
    text: c => `<b>${site(c).name}</b> <span class="bad">${skulls(site(c).tier)}</span>. About ${['two', 'three', 'five', 'six', 'eight'][site(c).tier - 1]} armed men, a lookout who has already seen you, and no way to talk.${sizeUp(c, () => wildMen(site(c).tier, wildCount(site(c).tier)))} It will take the day.`,
    opts: [
      { label: () => 'Storm it', ok: canFightNow, run: c => { const s = site(c); return wildFight(s.name, wildMen(s.tier, wildCount(s.tier)), 'camp', 'camp', { sid: s.id, day: true }); } },
      leaveIt,
    ],
  },
  wBounty: {
    title: 'The bounty', can: () => !!G.field, make: () => { if (!bountyLive()) postBounty(true); return {}; },
    text: c => { const b = G.bounty; return `<b>${b.name}</b> <span class="bad">${skulls(b.tier)}</span>. ${b.kind === 'beast' ? 'The carcasses round its ground are fresh, and not all of them are sheep.' : 'They have seen you, and they know why you have come.'} The Magistrate pays <b class="gold num">${b.pay}</b> denarii for proof.${sizeUp(c, () => bountyFoes(G.bounty))} It will take the day.`; },
    opts: [
      { label: () => 'Take the bounty', ok: canFightNow, run: () => { const b = G.bounty; return wildFight(b.name, bountyFoes(b), b.kind === 'beast' ? 'forest' : 'camp', 'bounty', { tier: b.tier, day: true }); } },
      leaveIt,
    ],
  },
  wRuin: {
    title: 'Old stones', can: wildCan('ruin'), make: wildMake('ruin'),
    text: c => `<b>${site(c).name}</b> <span class="bad">${skulls(site(c).tier)}</span>. Nobody has been here in a long time, or nobody who came back to say so. Searching it will take the day.`,
    opts: [
      { label: () => 'Search with care', run: c => { const s = site(c), lines = ruinLoot(s, 1); siteFinish(s.id); aDay(); return lines.join(' '); } },
      { label: () => 'Break it open', run: c => {
        const s = site(c);
        if (chance(0.25 + 0.08 * s.tier) && canFightNow()) return wildFight(s.name, s.tier >= 3 ? wildMen(s.tier, wildCount(s.tier) - 1) : wildBeasts(s.tier), 'ruin', 'guardians', { sid: s.id, day: true });
        const lines = ruinLoot(s, 1.6);
        if (chance(0.3)) { const g = pick(G.roster.filter(x => !x.away)); if (g) { g.injury = Math.max(g.injury, rint(2, 4)); addScar(g, 'cut'); lines.push(`A lintel comes down on <b>${g.name}</b>. He will be laid up for ${g.injury} days.`); } }
        siteFinish(s.id); aDay();
        return lines.join(' ');
      } },
      leaveIt,
    ],
  },
  wShrine: {
    title: 'A god nobody tends', can: wildCan('shrine'), make: () => Object.assign(wildMake('shrine')(), { cost: 30 + 15 * wildTier(G.field.x, G.field.y) }),
    text: c => `<b>${site(c).name}</b>. A weathered altar, a spring, ribbons in the thorn. The men have gone quiet. An offering of ${c.cost} denarii would be seemly. It will take the day.`,
    opts: [
      { label: c => `Make the offering (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => {
        const s = site(c), men = G.roster.filter(g => !g.away), g = men.slice().sort((a, b) => a.morale - b.morale)[0];
        G.denarii -= c.cost; men.forEach(x => { x.morale = clamp(x.morale + 15, 0, 100); });
        if (g && !g.traits.includes('blessed')) { g.traits.push('blessed'); addStory(g, 'Was blessed at a shrine in the wild.'); }
        siteFinish(s.id); aDay();
        return `Wine on the stone, and silver in the spring. ${g ? `<b>${g.name}</b>, who needed it most, comes away changed: ${TRAITS.blessed.name}. ` : ''}Every man is the better for it.`;
      } },
      { label: () => 'Let the men pray, and give nothing', run: c => { const s = site(c); G.roster.forEach(x => { if (!x.away) x.morale = clamp(x.morale + 6, 0, 100); }); siteFinish(s.id); aDay(); return 'They pray. The god, unpaid, says nothing either way.'; } },
      leaveIt,
    ],
  },
  wHermit: {
    title: 'A cell in the rock', can: wildCan('hermit'), make: wildMake('hermit'),
    text: c => {
      const M = wildMap();
      if (M.chain.herb === 2 && M.chain.hermit === c.sid) return `The hermit takes the mereswort out of your hands without a word, smells it, and for the first time looks pleased. "Now," he says. "Sit them down."`;
      return `<b>${site(c).name}</b>. A lean old man who fought thirty years in arenas you have never heard of, and has opinions about your men's footwork. He will drill them for a day, for nothing. He would do more, he says, if someone would bring him <b>mereswort</b> from the Blackmere for his joints.`;
    },
    opts: [
      { label: () => 'Let him drill them', run: c => {
        const s = site(c), M = wildMap(), men = G.roster.filter(g => !g.away && g.injury <= 0);
        if (M.chain.herb === 2 && M.chain.hermit === s.id) {
          men.forEach(g => { const k = STATS.slice().sort((a, b) => g.stats[a] - g.stats[b])[0]; if (g.stats[k] < 20) g.stats[k]++; });
          M.chain.herb = 3; siteFinish(s.id); aDay();
          return 'A day none of them will forget, or forgive. <b>Every man gains a point in his weakest stat.</b>';
        }
        men.forEach(g => STATS.forEach(k => addProg(g, k, 0.9 * g.pot[k])));
        if (!M.chain.herb) { M.chain.herb = 1; M.chain.hermit = s.id; wildMark('herb', 'herb'); wildMark(s.id, 'hermit'); aDay(); return 'They are run ragged and are the better for it. <span class="gold">Where the mereswort grows is marked on your map; bring it back to him and he will do more.</span>'; }
        siteFinish(s.id); aDay();
        return 'They are run ragged and are the better for it.';
      } },
      leaveIt,
    ],
  },
  wHamlet: {
    title: 'Roofs where no roofs should be', can: () => wildCan('hamlet')() && true, make: () => Object.assign(wildMake('hamlet')(), { g: makeGladiator(WILD_BUDGET[wildTier(G.field.x, G.field.y) - 1] + 8), fee: 40 + 40 * wildTier(G.field.x, G.field.y) }),
    text: c => `<b>${site(c).name}</b>. Runaways and their children, in a fold of the hills the tax-men have not found. They are afraid of you. One of them is not: <b>${c.g.name}</b> of ${c.g.origin}, who would fight as a ${CLASSES[c.g.cls].name}, and asks ${c.fee} denarii for his people before he goes with you. Dealing with them will take the day.`,
    opts: [
      { label: c => `Pay, and take his oath (${c.fee})`, ok: c => G.denarii >= c.fee && G.roster.length < capacity(), run: c => { const s = site(c); G.denarii -= c.fee; welcome(c.g); c.g.morale = 80; G.roster.push(c.g); addStory(c.g, 'Came out of a hidden hamlet in the hills to swear the oath.'); siteFinish(s.id); aDay(); return `${c.g.name} kisses his mother, shoulders a bundle, and falls in at the back of the column.`; } },
      { label: () => 'Tell the Magistrate where they are', run: c => { const s = site(c); favor('magistrate', 8); G.denarii += 60; G.roster.forEach(x => { if (!x.away) x.morale = clamp(x.morale - 8, 0, 100); }); siteFinish(s.id); aDay(); return 'You send a rider. The reward is 60 denarii and the Magistrate\'s thanks. Your men, who were all bought or taken once, do not look at you that evening.'; } },
      { label: () => 'Leave them in peace', run: c => { const s = site(c); G.roster.forEach(x => { if (!x.away) x.morale = clamp(x.morale + 5, 0, 100); }); siteFinish(s.id); return 'You were never here. The men approve.'; } },
    ],
  },
  wHealer: {
    title: 'Herbs drying under the eaves', can: wildCan('healer'), make: () => Object.assign(wildMake('healer')(), { cost: 25 + 15 * wildTier(G.field.x, G.field.y) }),
    text: c => `<b>${site(c).name}</b>. She looks over your men the way a butcher looks at a carcass, and names a price: ${c.cost} denarii to see to every wound and ache among them. It will take the day.`,
    opts: [
      { label: c => `Pay her (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { const s = site(c); G.denarii -= c.cost; G.roster.forEach(g => { if (!g.away) { g.injury = 0; g.hp = maxHp(g); g.fatigue = Math.max(0, g.fatigue - 40); } }); siteFinish(s.id); fieldDay('camp'); return 'Poultices, bone-setting, and a draught that tastes like a ditch. By morning every man is whole.'; } },
      leaveIt,
    ],
  },
  wMerchant: {
    title: 'A mule train on the road', can: wildCan('merchant'), make: () => { const s = wildSites().find(x => x.kind === 'merchant'), t = clamp(s.tier + 2, 2, 6), slot = pick(SLOTS); return { sid: s.id, slot, r: t, cls: G.roster.length ? pick(G.roster).cls : 'murmillo', cost: Math.round(ITEM_PRICE[t] * SLOT_INFO[slot].price * 0.8 / 5) * 5 }; },
    text: c => `<b>${site(c).name}</b>, trading where the smiths' guild cannot see him. He unwraps one thing: <b>${MATERIAL[c.r]} ${c.slot === 'weapon' ? WEAPON_NAMES[c.cls] : SLOT_INFO[c.slot].piece}</b>, grade ${RARITY[c.r]}, for ${c.cost} denarii. He will not be here tomorrow.`,
    opts: [
      { label: c => `Buy it (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { const s = site(c); G.denarii -= c.cost; const it = makeItem(c.slot, c.r, c.cls); G.armoury.push(it); siteFinish(s.id); return `${itemName(it)} is in your armoury.`; } },
      { label: () => 'Send him on his way', run: c => { siteFinish(site(c).id); return 'He shrugs, and the mules go on.'; } },
    ],
  },
  wCache: {
    title: 'The place on the map', can: wildCan('cache'), make: wildMake('cache'),
    text: c => `<b>${site(c).name}</b>. A cairn that is too tidy to be chance. Digging will take the day.`,
    opts: [
      { label: () => 'Dig', run: c => {
        const s = site(c), M = wildMap(), big = s.id === 'cacheA', coin = round5((big ? 350 : 500) * rand(0.9, 1.2));
        G.denarii += coin; M.chain[big ? 'map' : 'word'] = 2; siteFinish(s.id);
        const it = big ? wildRelic() : null;
        aDay();
        return `An arm's length down, the spade rings on a lid. <b class="gold">${coin} denarii</b>${it ? `, and under the coin, wrapped in fleece: <b>${itemName(it)}</b>. ${RELICS[it.relic].note}` : ', in coin of three emperors.'}`;
      } },
      leaveIt,
    ],
  },
  wHerb: {
    title: 'Black water', can: wildCan('herb'), make: wildMake('herb'),
    text: () => 'The mereswort grows where the hermit said, out on a tussock in water the colour of tea. Getting it will take the day, and everyone will be wet to the waist.',
    opts: [
      { label: () => 'Wade in', run: c => { const M = wildMap(); M.chain.herb = 2; siteFinish('herb'); G.roster.forEach(g => { if (!g.away) g.fatigue = clamp(g.fatigue + 8, 0, 100); }); aDay(); return 'A sackful, and leeches to go with it. <span class="gold">Take it back to the hermit.</span>'; } },
      leaveIt,
    ],
  },
  // ---- the eagle of the Seventeenth ----
  wDeserter: {
    title: 'An old soldier', can: wildCan('deserter'), make: wildMake('deserter'),
    text: () => 'A man of seventy splitting kindling outside a hut, with a legionary\'s straight back and a brand on his forearm he has tried to burn off. When you say "the Seventeenth" the axe stops. He will talk, he says at last, if you will sit and eat with him; it is not a short story. It will take the day.',
    opts: [
      { label: () => 'Sit, and hear him out', run: () => {
        const M = wildMap(); M.story = 2; siteFinish('deserter'); wildMark('battlefield', 'eagle'); aDay();
        return 'Three cohorts marched into the fells after cattle-thieves and were cut to pieces in a valley with one way out. He was sixteen. He ran. "The eagle-bearer went down by the standing stone. I saw the tribesmen take it off him." <span class="gold">He draws the valley for you in the ashes: the field of the Seventeenth is marked on your map.</span>';
      } },
      leaveIt,
    ],
  },
  wBattlefield: {
    title: 'The field of the Seventeenth', can: wildCan('battlefield'), make: wildMake('battlefield'),
    text: c => `A valley full of long grass and, under the grass, bones. Somebody is still working it for what the dead carried: a band of scavengers, <span class="bad">${skulls(site(c).tier)}</span>, about six, who do not want company.${sizeUp(c, () => wildMen(4, 6))} It will take the day.`,
    opts: [
      { label: () => 'Drive them off the dead', ok: canFightNow, run: c => wildFight('The field of the Seventeenth', wildMen(4, 6), 'ruin', 'battlefield', { sid: 'battlefield', day: true }) },
      leaveIt,
    ],
  },
  wChief: {
    title: 'One-Eye\'s stockade', can: wildCan('chief'), make: wildMake('chief'),
    text: c => `A log wall on an island in the mere, a causeway, and on the gate-tower a big man in a centurion's transverse crest, watching you count his men. There are eight of them, and him. <span class="bad">${skulls(5)}</span>${sizeUp(c, chiefFoes)} It will take the day.`,
    opts: [
      { label: () => 'Take the causeway', ok: canFightNow, run: () => {
        const foes = wildMen(4, 7, 4), boss = makeEnemy(58, 4); boss.name = 'Crixos One-Eye'; boss.gear = null; boss.outlaw = true; boss.traits = ['brute', 'ironhide', 'killer', 'lionheart']; boss.hp = maxHp(boss);
        return wildFight('One-Eye\'s stockade', foes.concat(boss), 'camp', 'chief', { sid: 'chief', day: true });
      } },
      leaveIt,
    ],
  },
  wBarrow: {
    title: 'The hill-king\'s barrow', can: wildCan('barrow'), make: wildMake('barrow'),
    text: c => `A green mound the size of a temple at the end of the fell road, ringed with stones, and men among the stones: the hill-king's grandsons, who have guarded this door all their lives, and the beasts they keep for it. Nine in all. <span class="bad">${skulls(5)}</span>${sizeUp(c, barrowFoes)} Nothing in the province will be harder. It will take the day.`,
    opts: [
      { label: () => 'Break the ring', ok: canFightNow, run: () => {
        const foes = wildMen(5, 6, 6); foes.forEach(f => { f.traits = [...new Set(f.traits.concat('lionheart'))]; });
        return wildFight('The hill-king\'s barrow', foes.concat(wildBeasts(5).slice(0, 3)), 'rock', 'barrow', { sid: 'barrow', day: true });
      } },
      leaveIt,
    ],
  },
  eagleHome: {
    title: 'The eagle comes home', auto: true, can: () => wildMap().story === 5, make: () => ({}),
    text: () => 'The eagle of the Seventeenth lies on your table under a lamp, and by morning the whole town knows. The Magistrate has sent his secretary twice. A dealer from Rome, who heard of it somehow before you were through the gate, has named a figure. And your own men keep finding reasons to walk past the door.',
    opts: [
      { label: () => 'Give it back to Rome, by the Magistrate\'s hand', run: () => { const M = wildMap(); M.story = 6; M.eagle = 'rome'; G.fame += 250; G.denarii += 1500; favor('magistrate', 100); log('The eagle of the Seventeenth is returned to Rome. +250 fame.', 'gold'); return 'It goes to Rome in a cedar box with an escort of cavalry, and your name goes with it. The Senate votes thanks; the Magistrate, who will take the credit, is yours for life. <b>Fame +250, 1,500 denarii, and the Magistrate\'s favour is complete.</b>'; } },
      { label: () => 'Keep it over the gate of the ludus', run: () => { const M = wildMap(); M.story = 6; M.eagle = 'kept'; G.fame += 80; favor('magistrate', -25); G.roster.forEach(g => { g.morale = 100; if (!g.traits.includes('eaglesworn')) g.traits.push('eaglesworn'); }); log('The eagle of the Seventeenth is set over the gate of the ludus.', 'gold'); return 'You set it over your own gate, where a legion\'s eagle has no business being. The Magistrate is furious and can prove nothing. Every man who trains under it stands straighter. <b>Fame +80. Every fighter you have now, and every one who joins, is Eagle-sworn.</b>'; } },
      { label: () => 'Sell it to the dealer', run: () => { const M = wildMap(); M.story = 6; M.eagle = 'sold'; G.denarii += 4000; favor('magistrate', -30); favor('temple', -20); G.roster.forEach(g => { g.morale = clamp(g.morale - 15, 0, 100); }); log('The eagle of the Seventeenth is sold to a dealer from Rome for 4,000 denarii.', 'gold'); return 'Four thousand denarii, counted twice. The eagle leaves in a grain sack. Nobody in the yard says anything, and they go on not saying it for a week.'; } },
    ],
  },
  // ---- your fighters' own journeys ----
  wJourney: {
    title: 'What he came for', can: () => !!G.field && wildSites().some(s => (QUEST_SITE[s.kind] || s.journey) && questAt(s)),
    make: () => { const s = wildSites().find(x => (QUEST_SITE[x.kind] || x.journey) && questAt(x)); return { sid: s.id, g: questAt(s).id }; },
    text: c => {
      const g = byId(c.g), k = site(c).kind;
      if (!g) return 'There is nothing here for you now.';
      const Q = questDef(g);
      if (Q && Q.marks) return Q.at(g) + (Q.foes ? ` <span class="bad">${skulls(site(c).tier)}</span>${sizeUp(c, () => Q.foes(g, clamp(site(c).tier || g.quest.tier || 1, 1, 5)))}` : '') + ' It will take the day.';
      return {
        quarry: `The quarries: a white wound in the hill, gangs of grey men, overseers with whips. <b>${g.name}</b> has not taken his eyes off the gate since it came in sight. His brother is in there. It will take the day to find out the price.`,
        slavers: `The camp is where the trail said: a dozen tents, a horse line, and the captain who burned <b>${g.name}</b>'s village grown fat by his fire. There are about five of them under arms <span class="bad">${skulls(3)}</span>. ${g.name} is already loosening his sword.${sizeUp(c, () => wildMen(3, 5))} It will take the day.`,
        vow: `The shrine of <b>${g.name}</b>'s people, on a headland over the sea, smaller than he had been told. He has carried his offering from the day he first went onto the sand. The vigil will take the day.`,
        master: `Beehives, a patch of beans, and an old man who watches <b>${g.name}</b> walk up the path and says, before anyone has spoken, "Your weight is on the wrong foot." It will take the day to be let in the door.`,
      }[k];
    },
    opts: [
      { label: () => 'Go with him', ok: c => !journeyFight(c) || canFightNow(), run: c => {
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
        return { quarry: `${g.name} has seen his brother through the bars, grey with stone dust. The overseer is waiting for your answer.`, vow: `${g.name} stands the night before the altar. At dawn the priests ask what is to be given.`, master: `By evening ${g.name} has been knocked down a great many times, and the old man has named what he is owed.` }[s.kind];
      } },
      { label: () => 'Not yet', run: () => 'He says nothing, and keeps looking back as the column moves off.' },
    ],
  },
  // ---- on the road ----
  wAmbush: {
    title: 'An arrow in the cart', can: () => !!G.field, make: () => ({ tier: wildTier(G.field.x, G.field.y), beasts: chance(0.4), toll: 20 + 20 * wildTier(G.field.x, G.field.y) }),
    text: c => c.beasts ? `Something has been keeping pace with the column in the scrub, and now it is done waiting. <span class="bad">${skulls(c.tier)}</span>` : `Men rise out of the bracken on both sides of the track, <span class="bad">${skulls(c.tier)}</span>, and one of them names a toll: ${c.toll} denarii.`,
    opts: [
      { label: () => 'Fight', ok: canFightNow, run: c => wildFight(c.beasts ? 'Beasts on the road' : 'An ambush on the road', c.beasts ? wildBeasts(c.tier) : wildMen(c.tier, Math.max(2, wildCount(c.tier) - 1)), 'forest', 'pack', { tier: c.tier }) },
      { label: c => c.beasts ? 'Drive the mules on and hope' : `Pay the toll (${c.toll})`, run: c => {
        if (!c.beasts) { G.denarii -= c.toll; return 'They take the purse and melt back into the bracken.'; }
        const g = pick(G.roster.filter(x => !x.away));
        if (g && chance(0.5)) { g.injury = Math.max(g.injury, rint(2, 3)); addScar(g, 'claw'); return `You get clear, but not before something has <b>${g.name}</b> by the leg. He is laid up for ${g.injury} days.`; }
        return 'Whips, shouting, and a mile at a run. They do not follow.';
      } },
    ],
  },
  wTraveller: {
    title: 'A man who knows the country', can: () => !!G.field, make: () => ({ sid: (wildSites().filter(s => !siteDone(s) && !s.fixed && !wildMap().seen[s.id]).sort((a, b) => Math.hypot(a.x - G.field.x, a.y - G.field.y) - Math.hypot(b.x - G.field.x, b.y - G.field.y))[0] || { id: null }).id, cost: 15 }),
    text: c => `A pedlar going the other way, glad of armed company for the length of a meal. For ${c.cost} denarii he will tell you what lies ahead.`,
    opts: [
      { label: c => `Pay him (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { const s = siteById(c.sid); G.denarii -= c.cost; if (!s) return 'He has nothing to tell you that you do not know.'; wildMark(s.id, 'told'); return `He tells you of <b>${s.name.toLowerCase()}</b>, in ${wildRegion(s.x, s.y)}. It is marked on your map.`; } },
      { label: () => 'Share your bread and ask nothing', run: () => { G.roster.forEach(g => { if (!g.away) g.morale = clamp(g.morale + 2, 0, 100); }); return 'He sings for it. The men like him.'; } },
    ],
  },
  wFind: {
    title: 'By the side of the road', can: () => !!G.field, make: () => ({ coin: round5(12 * wildTier(G.field.x, G.field.y) * rand(0.8, 1.6)) }),
    text: () => 'A cart on its side in the ditch, long abandoned, the oxen gone. The load has been picked over, but not well.',
    opts: [
      { label: () => 'Have the men go through it', run: c => { G.denarii += c.coin; return `Under the false floor: <b class="gold">${c.coin} denarii</b> somebody meant to come back for.`; } },
    ],
  },
  wCaptive: {
    title: 'One of them lives', auto: true, can: () => !!G.field, make: () => ({ g: wildMen(1, 1)[0] }),
    text: c => `<b>${c.g.name}</b> of ${c.g.origin} was pulled out from under his dead friends with a broken collarbone and no fear in him at all. He fought as a ${CLASSES[c.g.cls].name} before he took to the hills. The men who beat him think he is worth feeding.`,
    opts: [
      { label: () => 'Put him to the oath', ok: () => G.roster.length < capacity(), run: c => { const g = c.g; delete g.outlaw; g.gear = emptyGear(); g.weapon = 0; g.armor = 0; g.id = ++G.nextId; g.wins = g.losses = g.kills = 0; g.xp = 0; g.rank = 0; g.perkPending = 0; g.injury = 4; g.morale = 45; g.hp = Math.round(maxHp(g) * 0.4); g.story = []; g.scars = []; g.activity = 'rest'; welcome(g); G.roster.push(g); addStory(g, 'An outlaw taken alive in the wild, who chose the oath over the cross.'); return `${g.name} swears. He will be a week mending, and longer than that learning to take orders.`; } },
      { label: () => 'Hand him to the Magistrate', run: () => { G.denarii += 40; favor('magistrate', 3); return 'Forty denarii for a live outlaw, and a cross at the crossroads.'; } },
      { label: () => 'Let him go', run: () => { G.roster.forEach(g => { if (!g.away) g.morale = clamp(g.morale + 3, 0, 100); }); return 'He looks at you as if you are mad, and goes.'; } },
    ],
  },
};
// ---- the night before: he says what it is, if he is asked ----
const firesideMan = () => G.roster.find(g => questDef(g) && !g.away && !g.quest.talked) || null;
WILD_EVENTS.wFireside = {
  title: 'By the fire', can: () => !!G.field && !!firesideMan(), make: () => ({ g: firesideMan().id }),
  text: c => `The column has made camp. <b>${gn(c.g)}</b> has not eaten, and sits a little way off from the others with his back to the fire, looking the way the road goes tomorrow.`,
  opts: [
    { label: () => 'Sit down by him, and ask', run: c => { const g = byId(c.g), Q = questDef(g); if (!Q) return 'He is asleep, or seems to be.'; g.quest.talked = true; g.quest.heard = true; evMor(g, 8); return `It is a long time before he answers. ${Q.fire ? Q.fire(g) : '"It is nothing. It is a thing I have to do."'} You know now what you are walking into, and what it will take to end it.`; } },
    { label: () => 'Send him his supper and a cup of wine', run: c => { const g = byId(c.g); if (!g || !g.quest) return 'He is asleep, or seems to be.'; g.quest.talked = true; evMor(g, 4); return `${g.name} eats it. Later he is heard laughing at something by the fire with the others.`; } },
    { label: () => 'Leave him to it', run: c => { const g = byId(c.g); if (g && g.quest) g.quest.talked = true; return 'A man is entitled to his own thoughts on a night like this.'; } },
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
    title: m => `Wolves at ${lower(m)}`, boss: 'wolf', next: 'wolfden', goal: { kind: 'clean', pay: 1.25, met: 'Not a man of yours was pulled down. The shepherd adds a ram to the price.', miss: '' },
    foes: q => [questBeast('wolf', q.tier, q.boss, 1.35)].concat(lesser('wolf', q.tier, 2 + q.tier)),
    lead: q => `It is a big pack, and it follows one animal: <b>${q.boss}</b>.`,
    ask: q => `"They come down every night now. Six ewes last week, and the dog. I have ${q.pay} denarii put by, and it is yours if your men will go out to ${lower(q.mark)} and make an end of them."`,
    at: q => `The grass is torn up all round ${lower(q.mark)}, and there are bones in it. Whatever has been coming here will come again tonight.`,
    won: q => `The carcasses are dragged out and burned. Nothing will trouble ${lower(q.mark)} for a good while.`,
    twist: { title: 'Under the rocks',
      text: q => `Behind where <b>${q.boss || 'the old one'}</b> lay there is a hole under the rocks, and in it four cubs with their eyes not long open. The men have stopped to look at them.`,
      opts: [
        { label: () => 'Sell them to the beast-master at the arena', run: q => { const n = coinFor(14, q.tier); G.denarii += n; return `They go into a grain sack, complaining. The beast-master pays <b class="gold num">${n}</b> denarii and does not ask where wolves come from.`; } },
        { label: () => 'Make an end of them too', run: q => { q.owedPay = round5(q.owedPay * 1.1); return `It is quick. ${q.giver.name} asked for an end of them, and will pay for a whole job: <b class="num">${q.owedPay}</b> denarii.`; } },
        { label: () => 'Leave them to the hill', run: () => { favor('temple', 2); fieldParty().forEach(g => evMor(g, 3)); return 'You leave them where they are. The men say nothing, and are easier for it; the priests, who hold the wolf sacred to Mars, will hear of it. Temple favour +2.'; } },
      ] } },
  bandits: { type: 'fight', givers: ['merchant', 'clerk'], marks: ['The old arena', 'A burnt village', 'The gallows', 'The old arch', 'The unfinished columns', 'The broken aqueduct', 'The causeway'], bg: 'camp', fame: 1,
    title: m => `Robbers at ${lower(m)}`, boss: 'outlaw', next: 'paymaster', goal: { kind: 'swift', secs: q => 14 + q.tier * 1.5, loot: true, met: 'It was over before one of them could run. What they had not yet sold is still in the camp.', miss: 'Two of them got away into the dark with the best of the plunder.' },
    foes: q => [questBoss(q.tier, q.boss, { traits: ['brute'], tactic: 'aggressive' })].concat(wildMen(q.tier, Math.max(1, wildCount(q.tier) - 2))),
    lead: q => `They answer to <b>${q.boss}</b>, who is worth two of the others. Break them quickly, before any can run with the plunder.`,
    ask: q => `"Three carts in a month, and the last carter did not come home. They sit at ${lower(q.mark)} as if they owned it. ${q.pay} denarii to whoever clears them out. Nobody need know I asked."`,
    at: q => `There is a fire burning at ${lower(q.mark)}, and men round it who reach for their weapons when they see you.`,
    won: q => `What they took is scattered through the camp. The road by ${lower(q.mark)} is open again.`,
    twist: { title: 'What they had not sold',
      text: q => `Behind the fire at ${lower(q.mark)} there are three carts' worth of oil, cloth and red tableware, most of it still under the seals of merchants in the town. Nobody but you knows it is here.`,
      opts: [
        { label: () => 'Carry it back to its owners', run: q => { favor('guild', 5); q.owedFame += 2; return 'It takes two of the robbers\' own mules. The Guild will hear whose school brought back what the road took: favour +5, and it will be told at the fountain.'; } },
        { label: () => 'Sell it at the next farm', run: q => { const n = coinFor(32, q.tier); G.denarii += n; if (chance(0.35)) { favor('guild', -4); return `<b class="gold num">${n}</b> denarii, and no questions. But a seal is a seal, and somebody at the farm could read: the Guild hears of it. Favour -4.`; } return `<b class="gold num">${n}</b> denarii, and no questions asked.`; } },
        { label: () => 'Let the men take what they can carry', run: () => { fieldParty().forEach(g => evMor(g, 10)); return 'By nightfall every man has a bolt of cloth on his shoulder and a jar under his arm. They have not been in such spirits since the last games.'; } },
      ] } },
  beastking: { type: 'fight', givers: ['hunter'], marks: ['The eagle rock', 'The hot spring', 'The great waterfall', 'The wolf stone', "The giant's table"], bg: 'rock', fame: 3, pay: 1.3,
    title: m => `The beast of ${lower(m)}`, boss: 'great', trophy: true,
    foes: q => [questBeast(greatKind(q.tier), q.tier, q.boss, 1.7)].concat(q.tier >= 3 ? lesser(greatKind(q.tier), q.tier, q.tier - 2) : []),
    lead: q => `The hunters have a name for it: <b>${q.boss}</b>. It is half as big again as any of its kind.`,
    ask: q => `"I have hunted these hills thirty years and I will not go near ${lower(q.mark)} again. It took my brother and both his dogs. Bring me its hide and you shall have ${q.pay} denarii and every hunter in the province will know who did it."`,
    at: q => `Something very large has made its ground at ${lower(q.mark)}. It is not afraid of men; it has eaten several.`,
    won: q => `It takes four men to carry the hide. The hunters will be telling this one for years.` },
  champion: { type: 'fight', givers: ['noble'], marks: ['The ring of stones', 'The old arena', 'The needle'], bg: 'ruin', fame: 5, pay: 0.8,
    title: m => `A challenge at ${lower(m)}`, boss: 'champion', goal: { kind: 'clean', fame: 4, met: 'Not one of your men went down in front of that crowd. It will be told that way.', miss: '' },
    foes: q => [questBoss(q.tier, q.boss, { boost: 4, traits: ['duelist', 'quickhands', 'ironwill'], tactic: 'balanced' })].concat(wildMen(q.tier, 2, 2)),
    lead: q => `His name is <b>${q.boss}</b>, and he has two seconds with him. The crowd wants to see whether your men can do it without one of them going down.`,
    ask: q => `"A man has set himself up at ${lower(q.mark)} with his followers and calls himself the best blade in the province. He has insulted my family. I will pay ${q.pay} denarii to see him taught otherwise, in front of witnesses."`,
    at: q => `They are waiting at ${lower(q.mark)}, oiled and armed, with a crowd from the farms round about. Their leader salutes you as an equal. He is good.`,
    won: q => `The crowd goes home with a story, and it is not his.`,
    twist: { title: 'He asks a word',
      text: q => `<b>${q.boss || 'Their leader'}</b> is sitting in the dust with his head bound up, and the crowd has not gone home. He says he has been beaten twice in his life, and that the first man is dead. He would rather fight for your house than against it.`,
      opts: [
        { label: () => 'Put him to the oath', ok: () => G.roster.length < capacity(), run: q => {
          const g = makeGladiator(WILD_BUDGET[q.tier - 1] + 6); if (q.boss) g.name = q.boss; g.morale = 70; g.injury = 3; welcome(g); G.roster.push(g);
          addStory(g, `Called himself the best blade in the province, at ${lower(q.mark)}, until this house taught him otherwise.`);
          q.owedPay = round5(q.owedPay * 0.5);
          return `${g.name} swears in front of the same crowd. He will be three days mending. ${q.giver.name}, who paid to see him shamed and not hired, will keep back half the purse.`; } },
        { label: () => 'Send him down the road in his shirt', run: q => { q.owedFame += 2; return `His sword is broken across a stone and he is walked out past the crowd. It is what ${q.giver.name} paid for, and it will be told.`; } },
        { label: () => 'Give him back his sword', run: q => { fieldParty().forEach(g => evMor(g, 5)); G.fame += 2; q.owedPay = round5(q.owedPay * 0.8); return `He takes it, salutes, and goes. The crowd likes it and so do your men: fame +2. ${q.giver.name} wanted more, and will pay less.`; } },
      ] } },
  heirloom: { type: 'fetch', givers: ['widow'], marks: ['The hot spring', 'A villa in its garden', 'The wine press', 'The salt pans', 'The bones of a whale', 'The great oak'], pay: 0.8,
    title: m => `Lost at ${lower(m)}`, thing: "her husband's ring",
    ask: q => `"My husband's ring. He lost it at ${lower(q.mark)} the summer before he died and never told me until the end. I am too old to go and look. I can give ${q.pay} denarii, and my thanks."`,
    at: q => `${q.mark}. Somewhere here, a dead man dropped a ring. It will take the day to look properly.`,
    won: q => `It is plain iron, worth nothing. She will know it.` },
  ledger: { type: 'fetch', guard: true, givers: ['merchant', 'clerk'], marks: ['The lime kiln', 'The great quarry', 'The mill', "The fishers' huts", 'The salt pans'], pay: 1.1,
    title: m => `The strongbox at ${lower(m)}`, thing: 'the strongbox',
    ask: q => `"My factor at ${lower(q.mark)} is dead, of a fever they say, and the strongbox with a year's accounts in it has not been seen since. I want it back before anybody reads it. ${q.pay} denarii."`,
    at: q => `${q.mark}. The factor's hut has been turned over once already, and whoever did it may not have gone far.`,
    won: q => `The box is under the hearthstone, where an honest man would never look.`,
    twist: { title: 'The box is not locked',
      text: q => `The lock was forced by whoever came here before you, and the tablets are all still in it. Your steward reads enough to whistle: two sets of figures, and the Guild has only ever been shown one. ${q.giver.name} is waiting in town for a box that nobody has read.`,
      opts: [
        { label: () => 'Tie it shut and carry it home', run: q => { q.owedPay = round5(q.owedPay * 1.15); workMove(3); return `It is tied with your own cord and nobody looks again. ${q.giver.name} will see that, and add to the purse: <b class="num">${q.owedPay}</b> denarii. A house that can keep its mouth shut is worth hiring.`; } },
        { label: () => 'Name a price for your silence', run: q => { q.owedPay = round5(q.owedPay * 1.7); G.fame = Math.max(0, G.fame - 2); workMove(-4); return `A message goes ahead of you, and the answer comes back within the day: <b class="num">${q.owedPay}</b> denarii, and not a word more. It will be paid. People who pay that way talk about it afterwards.`; } },
        { label: () => 'Take the tablets to the Guild', run: q => { G.owed = owed().filter(o => o !== q); favor('guild', 9); const n = round5(q.owedPay * 0.5); G.denarii += n; return `The Guild's syndics read for an hour without speaking, and then send for ${q.giver.name}. Nobody will be at the fountain for you now. Guild favour +9, and <b class="gold num">${n}</b> denarii as the informer's share.`; } },
      ] } },
  supplies: { type: 'give', ambush: true, givers: ['clerk', 'veteran'], marks: ['The watchtower', 'The beacon', 'The fort', 'The ferry', 'The huts on stilts', 'The charcoal burners'], favor: ['magistrate', 4],
    title: m => `Supplies for ${lower(m)}`,
    ask: q => `"The men at ${lower(q.mark)} have had no pay and no oil since the roads went bad, and the last two carters were robbed. Your school could carry it and nobody would stop you. ${q.pay} denarii, and the Magistrate will hear of it."`,
    at: q => `${q.mark}. They have seen you coming for a mile and somebody has put a pot on.`,
    won: q => `They count the coin twice and sign for it. Tonight there is wine at ${lower(q.mark)} for the first time in a month.`,
    twist: { title: 'The garrison at its ease',
      text: q => `With the pay counted, the optio at ${lower(q.mark)} looks your men over the way a soldier looks at gladiators, and makes an offer: a day on his drill ground against men who fight in a line, if your school is not afraid of it. The wine is already open.`,
      opts: [
        { label: () => 'A day at drill with the soldiers', run: () => { aDay(); fieldParty().forEach(g => { g.xp += 2; g.fatigue = clamp(g.fatigue + 12, 0, 100); }); return 'Shield wall against net and trident, until dark. Both sides learn something they did not expect to. Every man who was there is the better for it, and the wearier.'; } },
        { label: () => 'Sit down to the wine', run: () => { fieldParty().forEach(g => { evMor(g, 8); g.fatigue = clamp(g.fatigue - 8, 0, 100); }); return 'Soldiers\' wine, soldiers\' songs, and a long argument about whether a legionary could beat a secutor. Nobody wins it. The men sleep well.'; } },
        { label: () => 'Thank him and march', run: () => 'He shrugs. There is a road to cover.' },
      ] } },
  offering: { type: 'give', cost: 40, givers: ['priest'], marks: ['The sacred grove', 'The white temple', 'The needle', 'The ring of stones'], favor: ['temple', 6], pay: 0.5,
    title: m => `An offering at ${lower(m)}`,
    ask: q => `"There is a vow outstanding at ${lower(q.mark)}, made by this town in a plague year and never paid. I am too old for the road. Take the offering there, add something of your own, and the god and I will both be in your debt. ${q.pay} denarii for your trouble."`,
    at: q => `${q.mark}. It is very quiet. The priest's offering is in your pack; custom says the bearer adds to it.`,
    won: q => `The smoke goes straight up. The men, who mocked the errand all the way here, are silent on the way back.`,
    after: (q, lines) => { fieldParty().forEach(g => { g.morale = clamp(g.morale + 10, 0, 100); }); lines.push('Every man who stood there is in better heart: morale +10.'); } },
  survey: { type: 'give', day: true, givers: ['scholar'], marks: ['The great quarry', 'The broken aqueduct', 'The unfinished columns', 'The salt pans', 'The causeway', 'The fallen colossus'], pay: 0.9,
    title: m => `A survey of ${lower(m)}`,
    ask: q => `"The governor wants ${lower(q.mark)} measured and drawn, and I am not walking into that country without swords about me. Take my boy and the instruments; a day there is all he needs. ${q.pay} denarii."`,
    at: q => `${q.mark}. The surveyor's boy unpacks rods, cords and a bronze thing with four plumb-lines. He wants the whole day.`,
    won: q => `He fills four tablets. From up here the men have had a long look at the country too.`,
    after: (q, lines) => { const before = Object.keys(wildMap().seen).length; for (let dy = -260; dy <= 260; dy += 60) for (let dx = -260; dx <= 260; dx += 60) if (Math.hypot(dx, dy) <= 260) wildReveal(q.x + dx, q.y + dy); const n = Object.keys(wildMap().seen).length - before; if (n) lines.push(`<span class="gold">${n} new place${n === 1 ? '' : 's'} on your map.</span>`); } },
  rescue: { type: 'rescue', givers: ['widow', 'shepherd', 'merchant'], marks: ["The fishers' huts", 'A burnt village', 'The ferry', "The shepherds' fold", 'The mill'], marks2: ['An old battlefield', 'The bog oak', 'The gallows', 'The causeway', 'The drowned temple', 'The old arena'], bg: 'camp', favor: ['guild', 4], fame: 3, pay: 1.4,
    title: m => `Taken near ${lower(m)}`, boss: 'slaver', next: 'slavemart', goal: { kind: 'swift', secs: q => 16 + q.tier * 1.5, pay: 1, missPay: 0.7, met: 'You were on them before they could reach the captives. Every one of them walks home.', miss: 'Two of the captives had their throats cut before you reached the fire.' },
    foes: q => [questBoss(q.tier, q.boss, { cls: CLASSES.retiarius ? 'retiarius' : undefined, traits: ['opener'], tactic: 'defensive' })].concat(wildMen(q.tier, Math.max(1, wildCount(q.tier) - 1))),
    lead: q => `Their master is <b>${q.boss}</b>. If this is slow, he will kill what he cannot sell.`,
    ask: q => `"My son went to ${lower(q.mark)} nine days ago with a cart and has not come back. The cart was found. He was not. Somebody there must have seen which way they took him. I have ${q.pay} denarii and I will find more."`,
    at: q => `${q.mark}. Nobody wants to talk, until one of the old women does.`,
    clue: q => `"Slavers. Six or eight of them, with a string of people roped at the neck. They went towards ${lower(q.mark2)}, and they were not hurrying."`,
    at2: q => `They are camped at ${lower(q.mark2)} with their catch tied in a line beside the fire. They have not yet decided where to sell.`,
    won: q => `The boy is among them, thinner but whole, and so are eleven others who will walk home telling everyone whose school this was.`,
    twist: { title: 'One of them is alive',
      text: q => `<b>${q.boss || 'Their master'}</b> has been pulled out from under his own tent, alive. He says there is silver buried a mile off that only he can find. The people he had roped by the neck are standing round him, and one of them has picked up a tent-peg.`,
      opts: [
        { label: () => 'He goes to the Magistrate in his own rope', run: () => { favor('magistrate', 6); G.denarii += 40; return 'He walks to town at the tail of a cart. Forty denarii for a live slaver, a cross at the crossroads, and the Magistrate\'s thanks: favour +6.'; } },
        { label: () => 'Turn your back', run: q => { q.owedFame += 3; fieldParty().forEach(g => evMor(g, 4)); return 'You find that the mules need looking at. It does not take long. Those who walk home will tell it in every village, and none of them will say what they saw.'; } },
        { label: () => 'Have him show you the silver', run: q => { const n = coinFor(45, q.tier); G.denarii += n; q.owedFame = Math.max(0, q.owedFame - 2); fieldParty().forEach(g => evMor(g, -5)); return `It is where he said: <b class="gold num">${n}</b> denarii in a pot. He is let go at the edge of the marsh. The people you freed watch him walk away, and then they look at you.`; } },
      ] } },
  // ---- more that is asked at the fountain ----
  pilgrims: { type: 'give', ambush: true, verb: 'See them to the door', ambWon: 'They were waiting for old women with purses and got a school of gladiators.', givers: ['priest', 'widow'], marks: ['The white temple', 'The sacred grove', 'The ring of stones', 'The drowned temple'], favor: ['temple', 5], pay: 0.8,
    title: m => `Pilgrims for ${lower(m)}`,
    ask: q => `"Nine of us have a vow to keep at ${lower(q.mark)} before the season turns, and the youngest is sixty. The last party that went was stripped to the skin on the road. Walk with us, and there is ${q.pay} denarii collected for it, and the god's goodwill besides."`,
    at: q => `${q.mark}. The pilgrims have sung the whole way, badly, and the men have stopped pretending not to know the words.`,
    won: q => `They go in barefoot, the oldest first. One of them presses a clay token into every fighter's hand, and will not be refused.`,
    after: (q, lines) => { fieldParty().forEach(g => evMor(g, 6)); lines.push('The men are in better heart for it: morale +6.'); } },
  simples: { type: 'fetch', givers: ['physician'], marks: ['The hot spring', 'The sacred grove', 'The bog oak', 'The bee garden', 'The great waterfall'], pay: 0.7, thing: 'the root',
    title: m => `A root that grows at ${lower(m)}`,
    ask: q => `"There is a root that grows at ${lower(q.mark)} and nowhere nearer than Sicily. Boiled, it brings down a wound-fever in a night. I have none left, and the country between is no place for a man with a satchel. ${q.pay} denarii for a sackful, and the first of it boiled is for your own men."`,
    at: q => `${q.mark}. The physician drew the leaf on a tablet: grey, toothed, close to the ground. A great many things here are grey and close to the ground.`,
    won: q => `A sackful, with the earth still on it. It smells like a wet dog.`,
    after: (q, lines) => {
      const sick = G.roster.filter(g => g.injury > 0); sick.forEach(g => { g.injury = Math.max(0, g.injury - 2); });
      fieldParty().forEach(g => { g.hp = Math.min(maxHp(g), g.hp + maxHp(g) * 0.25); });
      lines.push(`<span class="gold">A handful goes into the pot that night. It works as he said${sick.length ? `: ${namesOf(sick)} will be on ${sick.length === 1 ? 'his' : 'their'} feet two days sooner` : ''}, and every man's hurts are eased.</span>`); } },
  burial: { type: 'give', day: true, givers: ['veteran', 'priest'], marks: ['An old battlefield', 'The gallows', 'A burnt village', 'The causeway'], favor: ['temple', 4], fame: 1, pay: 0.7,
    title: m => `The unburied at ${lower(m)}`,
    ask: q => `"There are men lying at ${lower(q.mark)} who never had a coin for the ferryman or a handful of earth. I knew some of them. I have dreamed of them every night this month. I am past digging; your men are not. ${q.pay} denarii, which is what I have."`,
    at: q => `${q.mark}. They are not hard to find. The crows found them long ago.`,
    won: q => `By dusk there is a long mound, a coin under every tongue, and wine poured out on the earth. Nobody says much.`,
    after: (q, lines) => { fieldParty().forEach(g => evMor(g, 4)); learn('gravewise', 0.3, lines); } },
  strayed: { type: 'rescue', givers: ['veteran'], marks: ['The fort', 'The watchtower', 'The ferry', 'The charcoal burners'], marks2: ['The old arena', 'The gallows', 'A burnt village', 'The unfinished columns', 'The broken aqueduct'], bg: 'camp', favor: ['magistrate', 3], fame: 2, pay: 1.2,
    title: m => `A boy gone from ${lower(m)}`, boss: 'outlaw', goal: { kind: 'clean', pay: 1.2, met: 'None of yours went down, and in the confusion nobody thought to put a knife in the boy.', miss: '' },
    foes: q => [questBoss(q.tier, q.boss, { traits: ['killer'], tactic: 'aggressive' })].concat(wildMen(q.tier, Math.max(1, wildCount(q.tier) - 2))),
    lead: q => `The man he follows is <b>${q.boss}</b>, who collects boys like this one and spends them.`,
    ask: q => `"My sister's boy took the oath at sixteen and was gone from ${lower(q.mark)} before his first winter was out. If the Magistrate's men find him first it is the cross. Find who he went off with, and bring him to me, not to them. ${q.pay} denarii, and an old soldier in your debt."`,
    at: q => `${q.mark}. Nobody has seen a deserter, naturally. A girl carrying water has.`,
    clue: q => `"He went with the men who drink at the back. They said there was easy money at ${lower(q.mark2)}. He did not look as if he believed it."`,
    at2: q => `They are at ${lower(q.mark2)}: hard men round a fire, and one boy in what is left of a soldier's tunic, holding a spear as if it might bite him.`,
    won: q => `The boy throws down the spear before anyone has reached him, and is sick. He walks home in the middle of the column, where he cannot be seen from the road.` },
};
// What comes after. These are never offered cold: only by somebody whose first errand you have done and come home from.
Object.assign(ERRANDS, {
  wolfden: { chain: true, type: 'fight', givers: ['shepherd'], marks: ['The eagle rock', "The giant's table", 'The wolf stone', 'The great waterfall', 'The hot spring'], bg: 'rock', fame: 4, pay: 1.5, boss: 'great', trophy: true, harder: 1,
    title: m => `What drove them down, at ${lower(m)}`, foes: q => [questBeast(greatKind(q.tier), q.tier, q.boss, 1.8)].concat(lesser('wolf', q.tier, 2)),
    ask: q => `"You did what I asked and I am grateful. But wolves do not come down to a fold in summer unless something has their own ground. My grandfather used to speak of a thing at ${lower(q.mark)}. I have sold the wool early. ${q.pay} denarii, to know it is dead."`,
    at: q => `${q.mark}. The wolves that fled this place had good reason.`, lead: q => `The shepherd's grandfather was right: <b>${q.boss}</b>, and two wolves that would not leave it.`,
    won: q => `It is the largest any man here has seen. Nothing will come down off the high ground this year.` },
  paymaster: { chain: true, type: 'fight', givers: ['merchant', 'clerk'], marks: ['The old arch', 'A villa in its garden', 'The wine press', 'The mill', 'The lime kiln'], bg: 'camp', fame: 3, pay: 1.4, boss: 'outlaw', favor: ['magistrate', 6], harder: 1,
    title: m => `The man who paid them, at ${lower(m)}`, foes: q => [questBoss(q.tier, q.boss, { boost: 3, traits: ['duelist', 'ironwill'], tactic: 'defensive' })].concat(wildMen(q.tier, Math.max(2, wildCount(q.tier) - 1), 2)),
    ask: q => `"There was a letter on the robbers' chief. They were not robbing at random: somebody at ${lower(q.mark)} told them which carts to take, and took a third. I cannot go to the Magistrate without the man himself. ${q.pay} denarii to bring him in."`,
    at: q => `${q.mark}. A respectable door, and too many armed men behind it for a respectable house.`, lead: q => `Their paymaster keeps a captain: <b>${q.boss}</b>, who has been a soldier.`,
    won: q => `He is taken alive, with his ledgers. The Magistrate will want to read them.` },
  slavemart: { chain: true, type: 'fight', givers: ['widow', 'shepherd', 'merchant'], marks: ['The ferry', 'The salt pans', 'A wreck on the strand', 'The beacon', 'The huts on stilts'], bg: 'camp', fame: 4, pay: 1.2, boss: 'slaver', favor: ['guild', 6], recruit: true, harder: 1,
    title: m => `Where they are sold, at ${lower(m)}`, foes: q => [questBoss(q.tier, q.boss, { boost: 4, traits: ['brute', 'ironhide'], tactic: 'aggressive' })].concat(wildMen(q.tier, wildCount(q.tier), 2)),
    ask: q => `"My boy says there were others, taken before him, who were not there when you came. They had been sent on to ${lower(q.mark)}, where a ship comes for them. He cannot sleep for thinking of it. I have ${q.pay} denarii left. Take it."`,
    at: q => `${q.mark}. A pen, a landing, and a ship's boat drawn up. They are loading tonight.`, lead: q => `The buyer is here himself: <b>${q.boss}</b>, with a crew.`,
    won: q => `The pen is broken open. Thirty people walk inland, and the ship's boat burns on the shingle.` },
  buried: { chain: true, type: 'fetch', givers: ['widow'], marks: ['The needle', "The giant's table", 'The old arch', 'The ring of stones', 'The great oak'], fame: 2, pay: 2.2, hard: true,
    title: m => `What he buried at ${lower(m)}`, thing: 'what he buried',
    ask: q => `"There is writing inside the ring. I never knew he could write. It says: <i>under the north side of ${lower(q.mark)}, a hand deep</i>. He was twenty years a soldier and I never saw a coin of his pay. Half of whatever is there is yours: I reckon that at ${q.pay} denarii."`,
    at: q => `${q.mark}. A hand deep, on the north side; but the ground has been turned by forty winters since.`,
    won: q => `A soldier's belt, rotted through, and inside it twenty years of pay in silver.` },
  siege: { chain: true, type: 'fight', givers: ['clerk', 'veteran'], marks: ['The fort', 'The watchtower', 'The beacon'], bg: 'camp', fame: 5, pay: 1.1, boss: 'outlaw', relic: 'gladius', favor: ['magistrate', 5], harder: 1,
    title: m => `The siege of ${lower(m)}`, foes: q => [questBoss(q.tier, q.boss, { boost: 4, traits: ['ironhide', 'finisher'], tactic: 'balanced' })].concat(wildMen(q.tier, wildCount(q.tier), 3)),
    ask: q => `"The pay you carried is the reason. Word got round that there was coin at ${lower(q.mark)}, and deserters have shut the garrison in. There are eight men in there. The Magistrate has nobody nearer than your school. ${q.pay} denarii, and the centurion's thanks, which are worth more."`,
    at: q => `${q.mark}. A ring of fires round it, and a ram being built.`, lead: q => `They are deserters, and drilled; their leader is <b>${q.boss}</b>.`,
    won: q => `The gate opens from inside as the last of them runs. The centurion unbuckles his own sword and holds it out, hilt first.` },
});
ERRANDS.heirloom.next = 'buried'; ERRANDS.supplies.next = 'siege';

// A unique piece at a landmark: [relic, landmark, how it is won, the old soldier's tale, what is found there].
const RELIC_QUESTS = [
  ['kingsblade', 'The barrow of kings', 'men', 'The tribes still watch that mound. They will not have it opened.', 'In the last chamber, on the knees of what was once a king', 'The barrow-warden'],
  ['tidemask', 'The drowned temple', 'beasts', 'The marsh has things in it that were fed there once, and remember.', 'Under the altar, in a foot of black water', 'The fed thing'],
  ['wolfmantle', 'The wolf stone', 'beasts', 'Wolves keep that stone. They always have.', 'Folded in a hollow under the stone, dry as the day it was put there', 'The white wolf'],
  ['colossus', 'The fallen colossus', 'fetch', 'Nobody guards it. Nobody has thought to look inside the leg.', 'Inside the hollow bronze of the left shin'],
  ['cutlass', 'A wreck on the strand', 'men', 'Wreckers work that shore. They think the hulk is theirs.', "In the captain's locker, still shut", "The wreckers' captain"],
  ['oldhelm', 'The old arena', 'men', 'Men who call themselves his heirs train there. They will want to be beaten first.', 'On a peg in the cell under the east gate', 'The best of his heirs'],
  ['eaglecrest', 'The eagle rock', 'fetch', 'It is a climb, and the birds do not like company.', 'In the nest itself, among the bones'],
  ['bracers', 'The great quarry', 'fetch', 'The old workings are flooded, and not safe.', 'On a skeleton pinned under a block in the lowest gallery'],
  ['bogiron', 'The bog oak', 'beasts', 'Something lies up in the roots of that tree.', 'Sunk in the peat between the roots', 'What lies in the roots'],
  ['girdle', 'The sacred grove', 'fetch', 'The priestess will give it to one she judges fit, and to no other.', 'From the hands of the priestess'],
  ['vinestaff', 'The great oak', 'fetch', 'He buried them under the tree himself, the day he was freed.', 'A hand deep, wrapped in oilcloth'],
];
RELIC_QUESTS.forEach(([k, mark, how, tale, where, keeper]) => {
  const R = RELICS[k];
  ERRANDS['relic_' + k] = { type: how === 'fetch' ? 'fetch' : 'fight', relic: k, givers: ['veteran', 'scholar'], marks: [mark], bg: how === 'beasts' ? 'forest' : 'ruin', fame: 4, pay: 0.4, thing: lower(R.name), hard: how === 'fetch',
    title: () => R.name, keeper: keeper || null,
    foes: q => how === 'beasts' ? [questBeast(k === 'wolfmantle' ? 'wolf' : greatKind(Math.max(3, q.tier)), q.tier, keeper, 1.6)].concat(lesser(k === 'wolfmantle' ? 'wolf' : 'boar', q.tier, 1 + Math.floor(q.tier / 2))) : [questBoss(q.tier, keeper, { boost: 3, traits: ['ironhide', 'finisher'], tactic: 'balanced' })].concat(wildMen(q.tier, Math.max(1, wildCount(q.tier) - 1), 2)),
    lead: q => keeper ? `It is kept by <b>${keeper}</b>.` : '',
    ask: q => `"I will tell you something for nothing, because I am too old to use it. <b>${R.name}</b> lies at ${lower(mark)}. ${tale} Send your men, and whatever else is there, that is yours. I ask ${q.pay ? 'only that you tell me how it ended, and I will give you ' + q.pay + ' denarii for the telling' : 'nothing'}."`,
    at: q => how === 'fetch' ? `${mark}. ${tale}` : `${mark}. ${tale}`,
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
  if (refuse) { G.fame += q.owedFame + 2; G.roster.forEach(g => { g.morale = clamp(g.morale + 3, 0, 100); }); lines.push(`You close ${q.giver.name}'s hand over the purse and send it home again. It is all over the town by nightfall: <b class="num">+${q.owedFame + 2}</b> fame, and your own men think the better of you.`); }
  else { G.denarii += q.owedPay; G.fame += q.owedFame; lines.push(`<b class="gold num">${q.owedPay}</b> denarii, counted out on the fountain's rim, and <b class="num">+${q.owedFame}</b> fame from those who stopped to watch.`); }
  if (T.favor) { favor(T.favor[0], T.favor[1]); lines.push(`${PATRONS[T.favor[0]].name} hears of it: favour +${T.favor[1]}.`); }
  if (T.next && !asksNow().some(a => a.tpl === T.next) && !errands().some(e => e.tpl === T.next)) {      // and there is more
    const nx = errandNew(T.next, q.giver);
    if (nx) { if (nx.tier < q.tier) { nx.pay += 60 * (q.tier - nx.tier); nx.fame += q.tier - nx.tier; nx.tier = q.tier; }      // what follows is never easier than what came before, wherever it lies
      nx.leaves = G.day + 5; nx.from = q.tpl; asksNow().push(nx); lines.push(`<span class="gold">${q.giver.name} does not go. There is something else, and it is worse. Ask at the fountain.</span>`); }
  }
  return lines;
}

Object.assign(SITE_EVENT, { errand_fight: 'wErrandFight', errand_fetch: 'wErrandFetch', errand_give: 'wErrandGive', errand_clue: 'wErrandClue' });
Object.assign(WILD_WINS, {
  errand(F) { const q = errandById(F.eid); return q ? errandDone(q, [], F.res) : ['Whoever asked for this is gone.']; },
  // the men who were waiting on the road are beaten: the delivery is made
  errandAmb(F) { const q = errandById(F.eid); return q ? errandDone(q, [ERRANDS[q.tpl].ambWon || 'They were waiting for a carter and got a school of gladiators.']) : []; },
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
    title: 'What you were sent for', can: () => !!G.field, make: () => errandEnsure('fight'),
    text: c => { const q = errandC(c), T = ERRANDS[q.tpl]; return `<b>${T.title(T.type === 'rescue' ? q.mark2 : q.mark)}</b> <span class="bad">${skulls(q.tier)}</span>. ${T.type === 'rescue' ? T.at2(q) : T.at(q)}${T.lead && q.boss ? ' ' + T.lead(q) : ''}${sizeUp(c, () => T.foes(q))} It will take the day.`; },
    opts: [
      { label: () => 'Do what you came to do', ok: c => canFightNow() && !errandC(c).gone, run: c => { const q = errandC(c), T = ERRANDS[q.tpl]; return wildFight(T.title(T.type === 'rescue' ? q.mark2 : q.mark), T.foes(q), T.bg || 'forest', 'errand', { eid: q.id, tier: q.tier, day: true }); } },
      { label: () => 'Not today', run: () => 'You draw off. It will keep, for as long as they will wait in town.' },
    ],
  },
  wErrandFetch: {
    title: 'Somewhere here', can: () => !!G.field, make: () => errandEnsure('fetch'),
    text: c => { const q = errandC(c), T = ERRANDS[q.tpl]; return `<b>${T.title(q.mark)}</b>. ${T.at(q)}${q.tries ? ` You have looked ${q.tries === 1 ? 'once' : q.tries + ' times'} already.` : ''}`; },
    opts: [
      { label: () => 'Search with care (the day)', ok: c => !errandC(c).gone, run: c => {
        const q = errandC(c), T = ERRANDS[q.tpl]; aDay();
        if (chance(clamp((T.hard ? 0.3 : 0.5) + bestWits() * 0.012 + (q.tries || 0) * 0.15, 0.2, 0.95))) return errandDone(q, []).join(' ');
        q.tries = (q.tries || 0) + 1; return `Nothing, by dark. But there is less of ${lower(q.mark)} left to look in than there was this morning.`; } },
      { label: () => 'Turn the place over', ok: c => !errandC(c).gone, run: c => {
        const q = errandC(c), T = ERRANDS[q.tpl];
        if (T.guard && !q.clear && chance(0.5) && canFightNow()) return wildFight(T.title(q.mark), wildMen(q.tier, Math.max(2, wildCount(q.tier) - 1)), 'ruin', 'errandGuard', { eid: q.id, tier: q.tier, day: true });
        const lines = [];
        if (chance(T.hard ? 0.5 : 0.25)) { const g = pick(fieldParty()); if (g) { g.injury = Math.max(g.injury, rint(1, 3)); addScar(g, 'cut'); lines.push(`It is done in an hour, and <b>${g.name}</b> pays for the hurry: laid up ${g.injury} day${g.injury === 1 ? '' : 's'}.`); } }
        return lines.concat(errandDone(q, [])).join(' '); } },
      { label: () => 'Not today', run: () => 'It has lain here this long.' },
    ],
  },
  wErrandGive: {
    title: 'Expected', can: () => !!G.field, make: () => errandEnsure('give'),
    text: c => { const q = errandC(c), T = ERRANDS[q.tpl]; return `<b>${T.title(q.mark)}</b>. ${T.at(q)}${T.cost ? ` Something of your own would be <b class="num">${T.cost}</b> denarii.` : ''}${T.day ? ' It will take the day.' : ''}`; },
    opts: [
      { label: c => { const T = ERRANDS[errandC(c).tpl]; return T.cost ? `Make the offering (${T.cost} denarii)` : T.day ? 'Stay the day' : T.verb || 'Hand it over'; }, ok: c => !errandC(c).gone && G.denarii >= (ERRANDS[errandC(c).tpl].cost || 0), run: c => {
        const q = errandC(c), T = ERRANDS[q.tpl];
        if (T.ambush && !q.amb && chance(0.35) && canFightNow()) { q.amb = true; return wildFight('Men on the road', wildMen(q.tier, Math.max(2, wildCount(q.tier) - 1)), 'camp', 'errandAmb', { eid: q.id, tier: q.tier, day: true }); }
        if (T.cost) G.denarii -= T.cost;
        if (T.day) aDay();
        return errandDone(q, []).join(' '); } },
      { label: () => 'Not today', run: () => 'You keep it in the pack a while longer.' },
    ],
  },
  wErrandClue: {
    title: 'Somebody saw', can: () => !!G.field, make: () => errandEnsure('clue'),
    text: c => { const q = errandC(c), T = ERRANDS[q.tpl]; return `<b>${T.title(q.mark)}</b>. ${T.at(q)} ${T.clue(q)}`; },
    opts: [
      { label: c => `Go after them, to ${lower(errandC(c).mark2)}`, ok: c => !errandC(c).gone, run: c => { const q = errandC(c); q.step = 1; wildMark('e' + q.id, 'quest'); return `<span class="gold">${q.mark2} is marked on your map.</span> There are ${Math.max(0, q.until - G.day)} days left before ${q.giver.name} stops hoping.`; } },
      { label: () => 'Not today', run: () => 'You say you will think on it. That has been heard here before.' },
    ],
  },
  // in town: the one at the fountain says what is wanted
  errandOffer: {
    title: 'By the fountain', can: () => true, make: () => { const q = asksNow()[0] || rollAsks(true); return { a: q ? q.id : 0 }; },
    text: c => { const q = asksNow().find(a => a.id === c.a); if (!q) return 'Whoever it was has gone.'; const T = ERRANDS[q.tpl], p = { x: q.x, y: q.y };
      return `<b>${q.giver.name}</b>, ${GIVERS[q.giver.kind].what}, has been waiting since the gates opened. ${T.ask(q)}<br><br><small style="color:#5a4326">${q.mark}, in ${wildRegion(p.x, p.y)}: danger <span class="bad">${skulls(q.tier)}</span>, out through the east gate. ${q.relic ? `<b>${RELICS[q.relic].name}</b>: ${RELICS[q.relic].note} ` : ''}To be done within ${q.days} days${goalHint(T) ? ', and ' + goalHint(T) : ''}. You have ${errands().length} of 3 such matters in hand.</small>`; },
    opts: [
      { label: () => 'Give your word', ok: c => errands().length < 3 && !!asksNow().find(a => a.id === c.a), run: c => { const q = errandTake(c.a); return q ? `It is marked on your map of the province: <b>${q.mark}</b>. ${q.giver.name} will wait ${q.days} days for word.` : 'It could not be agreed.'; } },
      { label: () => 'Not today', run: c => { const q = asksNow().find(a => a.id === c.a); return q ? `${q.giver.name} will be here ${Math.max(1, q.leaves - G.day + 1)} more day${q.leaves - G.day + 1 === 1 ? '' : 's'}, and then will ask somebody else.` : 'Nobody is there.'; } },
      { label: () => 'It is no work for this house', run: c => { G.asks = asksNow().filter(a => a.id !== c.a); return 'They nod, and go to look for somebody hungrier.'; } },
    ],
  },
};
ERRAND_EVENTS.errandThanks = {
  title: 'Home, and expected', can: () => true,
  make: () => { if (!owed().length) { const q = errandNew('wolves') || errandNew('bandits'); if (q) { q.done = G.day; q.owedPay = q.pay; q.owedFame = q.fame; owed().push(q); } } return { o: owed().length ? owed()[0].id : 0 }; },
  text: c => { const q = owed().find(o => o.id === c.o); if (!q) return 'Whoever it was has gone.'; const T = ERRANDS[q.tpl];
    return `<b>${q.giver.name}</b> has heard already, as people do, and is waiting by the fountain with a purse. "${q.well ? 'They say it could not have been better done.' : 'It is done, then.'} I said <b class="num">${q.owedPay}</b> denarii and here it is."${T.next ? ' There is something in the way it is said that is not finished.' : ''}`; },
  opts: [
    { label: c => { const q = owed().find(o => o.id === c.o); return `Take the purse${q ? ' (+' + q.owedPay + ')' : ''}`; }, run: c => errandPay(c.o, false).join(' ') },
    { label: () => 'Keep your money. It was well spent', run: c => errandPay(c.o, true).join(' ') },
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
    text: c => `A man with a mule and a great many small bags has stopped under a tree to let you pass. He sells salves, charms and knives, and swears by all three.`,
    opts: [
      { label: c => `Salve for every man (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; fieldParty().forEach(g => { g.hp = Math.min(maxHp(g), g.hp + maxHp(g) * 0.25); }); return 'It smells of goose-fat and something worse, and it works.'; } },
      { label: c => `A charm for luck (${Math.round(c.cost / 2)})`, ok: c => G.denarii >= Math.round(c.cost / 2), run: c => { G.denarii -= Math.round(c.cost / 2); fieldParty().forEach(g => evMor(g, 6)); return 'A bronze hand on a thong. The men pass it round and are the better for it.'; } },
      { label: () => 'Walk on', run: () => 'He wishes you a short road, which is what pedlars say.' },
    ],
  },
  wStorm: {
    title: 'The sky comes down', can: () => !!G.field, make: () => ({}),
    text: () => 'It has been coming since noon: a wall of black out of the west, and now the first hail. There is a hollow a little way off that would keep the worst of it out.',
    opts: [
      { label: () => 'Take shelter (the rest of the day)', run: () => { aDay(); fieldParty().forEach(g => { g.fatigue = clamp(g.fatigue - 10, 0, 100); }); return 'You sit it out under hides. Nobody is the worse, and some have slept.'; } },
      { label: () => 'March through it', run: () => { fieldParty().forEach(g => { g.fatigue = clamp(g.fatigue + 14, 0, 100); evMor(g, -3); }); return 'You keep the road and lose no time. Every man is soaked and sore, and says so.'; } },
    ],
  },
  wShepherdBoy: {
    title: 'A boy who knows a way', can: () => !!G.field, make: () => ({}),
    text: () => 'A shepherd boy has been keeping pace with the column along the ridge for an hour. At last he comes down and says there is a drove road that would save you half a day, if somebody gave him a coin to show it.',
    opts: [
      { label: () => 'Give him five denarii', ok: () => G.denarii >= 5, run: () => { G.denarii -= 5; if (chance(0.8)) { G.field.march = Math.max(0, (G.field.march || 0) - marchDay() * 0.4); return 'It is where he said, and better than the road. You have gained the best part of half a day.'; } fieldParty().forEach(g => { g.fatigue = clamp(g.fatigue + 8, 0, 100); }); return 'It ends at a bog. The boy has gone, with your five denarii.'; } },
      { label: () => 'Keep to the road', run: () => 'He shrugs and goes back up to his sheep.' },
    ],
  },
  wDeadMule: {
    title: 'A cart with no carter', can: () => !!G.field, make: () => ({ tier: wildTier(G.field.x, G.field.y) }),
    text: () => 'A cart is standing in the road with its mule dead in the shafts and nobody near. The load is still on it, roped down under a hide.',
    opts: [
      { label: () => 'Take what is on it', run: c => { if (chance(0.3) && canFightNow()) return wildFight('The men who left the cart', wildMen(c.tier, Math.max(2, wildCount(c.tier) - 2)), 'camp', 'ambush', { tier: c.tier }); const n = coinFor(18, c.tier); G.denarii += n; return `Oil, in sealed jars. It fetches <b class="gold num">${n}</b> denarii at the next farm, no questions asked.`; } },
      { label: () => 'Bury the carter, if you can find him', run: () => { fieldParty().forEach(g => evMor(g, 4)); G.fame += 1; return 'He is in the ditch. The men dig, and feel better for having done it. Somebody at the next village will hear whose school it was.'; } },
      { label: () => 'Leave it', run: () => 'Other people\'s trouble.' },
    ],
  },
  wOldSoldier: {
    title: 'A man at a milestone', can: () => !!G.field && fieldParty().length > 0, make: () => ({ g: pick(fieldParty()).id }),
    text: c => `An old man is sitting on a milestone with a soldier's boots on and nothing else of a soldier about him. He watches <b>${gn(c.g)}</b> go by, and says, to nobody: "He drops his shoulder."`,
    opts: [
      { label: () => 'Stop and let him show it', run: c => { const g = byId(c.g); aDay(); if (g) addProg(g, 'skl', 2); return `It costs the afternoon. ${gn(c.g)} will not drop that shoulder again.`; } },
      { label: () => 'Give him bread and march on', run: () => { fieldParty().forEach(g => evMor(g, 2)); return 'He takes the bread without thanks, as a man does who was once fed by an army.'; } },
    ],
  },
  wWedding: {
    title: 'A wedding in a village', can: () => !!G.field, make: () => ({}),
    text: () => 'There are garlands across the road and a whole village drunk under them. They will not hear of armed men passing through without eating.',
    opts: [
      { label: () => 'Stay for the feast (the rest of the day)', run: () => { aDay(); fieldParty().forEach(g => { evMor(g, 10); g.hp = Math.min(maxHp(g), g.hp + maxHp(g) * 0.1); }); return 'Roast kid, new wine, and a great deal of dancing by men who should be resting. Nobody regrets it.'; } },
      { label: () => 'Drink the bride\'s health and go', run: () => { fieldParty().forEach(g => evMor(g, 3)); return 'One cup each, standing. They cheer you out of the village.'; } },
    ],
  },
  wSpring: {
    title: 'Sweet water', can: () => !!G.field, make: () => ({}),
    text: () => 'A spring comes out of the rock here into a stone basin somebody cut for it long ago. The water is cold enough to hurt the teeth.',
    opts: [
      { label: () => 'Fill every skin and let them wash', run: () => { fieldParty().forEach(g => { g.fatigue = clamp(g.fatigue - 12, 0, 100); g.hp = Math.min(maxHp(g), g.hp + maxHp(g) * 0.08); }); return 'An hour well spent. They go on cleaner and quieter.'; } },
      { label: () => 'No time', run: () => 'You drink from your hands and keep moving.' },
    ],
  },
  wToll: {
    title: 'A chain across the road', can: () => !!G.field, make: () => ({ toll: 15 + 10 * wildTier(G.field.x, G.field.y), tier: wildTier(G.field.x, G.field.y) }),
    text: c => `Somebody has put a chain across the road at a bridge, and four men with clubs behind it. They say it is the landowner's toll: <b class="num">${c.toll}</b> denarii for a party of your size.`,
    opts: [
      { label: c => `Pay the ${c.toll}`, ok: c => G.denarii >= c.toll, run: c => { G.denarii -= c.toll; return 'They lower the chain and do not meet your eye.'; } },
      { label: () => 'Ask whose land this is, slowly', run: c => { if (chance(0.6)) { fieldParty().forEach(g => evMor(g, 4)); return 'They look at your men, and at each other, and remember the landowner is away. The chain comes down.'; } return wildFight('The toll-men', wildMen(c.tier, Math.max(2, wildCount(c.tier) - 2)), 'camp', 'ambush', { tier: c.tier }); } },
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
    title: 'Painted on the wall', can: () => G.roster.some(g => g.wins >= 2), make: () => ({ g: pick(G.roster.filter(g => g.wins >= 2)).id }),
    text: c => `Somebody has painted <b>${gn(c.g)}</b>'s name on the wall by the bakery in letters a foot high, with a drawing that is either a compliment or a libel.`,
    opts: [
      { label: () => 'Leave it up', run: c => { evMor(byId(c.g), 8); G.fame += 1; return `${gn(c.g)} walks past it four times that day. Fame +1.`; } },
      { label: () => 'Have it painted larger (15)', ok: () => G.denarii >= 15, run: c => { G.denarii -= 15; evMor(byId(c.g), 10); G.fame += 3; return 'Now it can be read from the arena gate. Fame +3.'; } },
      { label: () => 'Scrub it off', run: c => { evMor(byId(c.g), -5); return 'A school has its dignity. He does not see it that way.'; } },
    ],
  },
  gateDog: {
    title: 'A dog at the gate', can: () => home().length > 0, make: () => ({}),
    text: () => 'A yellow dog with one ear has been lying across the school gate for three days. The men have been feeding it, which they deny.',
    opts: [
      { label: () => 'Let it stay', run: () => { evAllMor(4); return 'It is given a name within the hour and a place by the kitchen fire by night. Morale +4.'; } },
      { label: () => 'Drive it off', run: () => { evAllMor(-3); return 'It goes. The cook will not speak to you.'; } },
    ],
  },
  lostBet: {
    title: 'A debt between two men', can: () => home().length >= 2, make: () => { const h = home().slice(), a = h.splice(Math.floor(Math.random() * h.length), 1)[0], b = pick(h); return { a: a.id, b: b.id }; },
    text: c => `<b>${gn(c.a)}</b> owes <b>${gn(c.b)}</b> eleven denarii from dice, and says the dice were loaded. It has gone past words.`,
    opts: [
      { label: () => 'Pay it yourself (11)', ok: () => G.denarii >= 11, run: c => { G.denarii -= 11; evMor(byId(c.a), 4); evMor(byId(c.b), 4); return 'Cheap at the price. Both men think you took their side.'; } },
      { label: () => 'Let them settle it with wooden swords', run: c => { const a = byId(c.a), b = byId(c.b), w = evPower(a) >= evPower(b) ? a : b, l = w === a ? b : a; addProg(w, 'skl', 1); addProg(l, 'skl', 1); evMor(w, 5); evMor(l, -4); return `${w.name} wins it, bruises and all. Both learned something.`; } },
      { label: () => 'Forbid dice in the barracks', run: () => { evAllMor(-4); return 'The dice go under the floor. Nobody thanks you.'; } },
    ],
  },
  versifier: {
    title: 'A poet wants a subject', can: () => G.roster.some(g => g.wins >= 3), make: () => ({ g: G.roster.slice().sort((a, b) => b.wins - a.wins)[0].id, cost: 40 + tier() * 30 }),
    text: c => `A thin Greek who says he has read at Rome offers to write the deeds of <b>${gn(c.g)}</b> in forty lines, to be recited in the forum. He wants ${c.cost} denarii and a meal.`,
    opts: [
      { label: c => `Pay him ${c.cost}`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; G.fame += 4 + tier() * 2; evMor(byId(c.g), 8); return `It scans, mostly. The forum hears it twice. Fame +${4 + tier() * 2}.`; } },
      { label: () => 'Feed him and send him on', run: () => 'He eats for three and writes nothing.' },
    ],
  },
  ratCatcher: {
    title: 'Rats in the granary', can: () => true, make: () => ({ cost: 20 + tier() * 10 }),
    text: c => `The cook has found the meal sacks holed. A man with terriers will clear the place for ${c.cost} denarii.`,
    opts: [
      { label: c => `Pay the ${c.cost}`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; return 'A loud afternoon, and forty tails nailed to the door.'; } },
      { label: () => 'Set the men to it', run: () => { home().forEach(g => { g.fatigue = clamp(g.fatigue + 8, 0, 100); }); evAllMor(2); return 'They make a game of it. Nobody trains, everybody is tired, and the rats are mostly dead.'; } },
      { label: () => 'Live with it', run: () => { const n = 15 + tier() * 15; G.denarii -= Math.min(G.denarii, n); return `By the month's end they have eaten ${n} denarii of barley.`; } },
    ],
  },
  boyRuns: {
    title: 'A boy who wants to be a gladiator', can: () => G.roster.some(g => g.wins > 0), make: () => ({ g: pick(G.roster.filter(g => g.wins > 0)).id }),
    text: c => `A baker's son of about ten has been found in the yard for the third time, with a stick, copying <b>${gn(c.g)}</b>.`,
    opts: [
      { label: () => 'Let him watch, mornings', run: c => { evMor(byId(c.g), 6); G.fame += 1; return `${gn(c.g)} pretends not to notice and trains better for an audience. The baker sends bread.`; } },
      { label: () => 'Send him home with a clip on the ear', run: () => 'He will be back.' },
    ],
  },
  physician: {
    title: 'A physician passing through', can: () => home().length > 0, make: () => ({ g: home().slice().sort((a, b) => (b.injury - a.injury) || (a.hp / maxHp(a) - b.hp / maxHp(b)))[0].id, cost: 50 + tier() * 30 }),
    text: c => `A Greek physician on his way to the governor's court will look at <b>${gn(c.g)}</b> for ${c.cost} denarii. He does not stay anywhere two nights.`,
    opts: [
      { label: c => `Pay ${c.cost}`, ok: c => G.denarii >= c.cost, run: c => { const g = byId(c.g); G.denarii -= c.cost; if (!g) return 'The man he came to see is gone.'; if (g.injury > 0) { g.injury = Math.max(0, Math.ceil(g.injury / 2) - 1); return `He resets what your own man had set badly. ${g.name} will be up in ${g.injury} day${g.injury === 1 ? '' : 's'}.`; } g.hp = maxHp(g); g.fatigue = clamp(g.fatigue - 20, 0, 100); return `He finds nothing broken, prescribes rest, vinegar and less wine, and ${g.name} is the better for all three.`; } },
      { label: () => 'Trust your own medicus', run: () => 'He looks at the bandaging, raises an eyebrow, and goes on to court.' },
    ],
  },
  hotDay: {
    title: 'The hottest day of the year', can: () => fit().length > 0, make: () => ({}),
    text: () => 'By the third hour the sand of the yard is too hot to stand on barefoot, and the doctore is still shouting.',
    opts: [
      { label: () => 'Train at dawn and dusk only', run: () => { fit().forEach(g => { g.fatigue = clamp(g.fatigue - 8, 0, 100); evMor(g, 3); }); return 'They sleep through the worst of it in the shade of the barracks wall.'; } },
      { label: () => 'They will fight in worse', run: () => { fit().forEach(g => { g.fatigue = clamp(g.fatigue + 12, 0, 100); addProg(g, 'str', 1); }); return 'Two faint. The rest are harder for it.'; } },
    ],
  },
  taxMan: {
    title: 'The assessor', can: () => G.denarii >= 100, make: () => ({ tax: round5(G.denarii * 0.08), bribe: round5(G.denarii * 0.03) + 10 }),
    text: c => `A man from the treasury has come to count your men, your mules and your amphorae. By his reckoning the school owes <b class="num">${c.tax}</b> denarii.`,
    opts: [
      { label: c => `Pay the ${c.tax}`, run: c => { G.denarii -= c.tax; favor('magistrate', 2); return 'He writes it down twice, in two different books.'; } },
      { label: c => `Find him a reason to count again (${c.bribe})`, ok: c => G.denarii >= c.bribe, run: c => { G.denarii -= c.bribe; if (chance(0.75)) return 'He counts again, and you have fewer mules than he thought.'; G.denarii -= Math.min(G.denarii, c.tax); favor('magistrate', -4); return 'He takes the bribe, and then the tax, and then tells the Magistrate.'; } },
    ],
  },
  songbird: {
    title: 'A song about the school', can: () => G.tally.wins > 0 || G.roster.some(g => g.wins > 0), make: () => ({}),
    text: () => 'The children in the street have a new skipping song, and it has your name in it. It is not altogether respectful.',
    opts: [
      { label: () => 'Laugh, where they can see', run: () => { G.fame += 2; return 'A lanista who can be sung about is a lanista people come to watch. Fame +2.'; } },
      { label: () => 'Have the gate-keeper chase them', run: () => { G.fame = Math.max(0, G.fame - 1); return 'Now there is a second verse, about the gate-keeper.'; } },
    ],
  },
  wineGift: {
    title: 'A cask at the gate', can: () => home().length > 0, make: () => ({ p: pick(Object.keys(G.patrons)) }),
    text: c => `A cask of good wine has been left at the gate with the compliments of ${PATRONS[c.p].name}. Nobody has said what it is for.`,
    opts: [
      { label: () => 'Give it to the men', run: () => { evAllMor(8); home().forEach(g => { g.fatigue = clamp(g.fatigue + 6, 0, 100); }); return 'A good night and a slow morning. Morale +8.'; } },
      { label: () => 'Send back something better', ok: () => G.denarii >= 40, run: c => { G.denarii -= 40; favor(c.p, 5); return `A gift answered is a door opened. ${PATRONS[c.p].name}: favour +5.`; } },
      { label: () => 'Sell it', run: () => { G.denarii += 35; return 'Thirty-five denarii, and a patron who will hear what became of his cask.'; } },
    ],
  },
  sleepless: {
    title: 'He does not sleep', can: () => home().some(g => g.wins > 0), make: () => ({ g: (home().filter(g => g.kills > 0)[0] || pick(home().filter(g => g.wins > 0))).id }),
    text: c => `<b>${gn(c.g)}</b> has been walking the yard at night since the last games. The others say he talks to somebody who is not there.`,
    opts: [
      { label: () => 'Sit up with him', run: c => { evMor(byId(c.g), 10); return 'You do not say much. It seems to be enough that somebody is there.'; } },
      { label: () => 'An offering at the temple, in the dead man\'s name (20)', ok: () => G.denarii >= 20, run: c => { G.denarii -= 20; evMor(byId(c.g), 14); favor('temple', 2); return 'He comes himself to see it burned. That night he sleeps.'; } },
      { label: () => 'Work him until he drops', run: c => { const g = byId(c.g); if (g) { g.fatigue = clamp(g.fatigue + 25, 0, 100); evMor(g, -4); addProg(g, 'str', 1); } return 'He sleeps, because he cannot stand. It is not the same thing.'; } },
    ],
  },
  rivalOffer: {
    title: 'An offer for a man', can: () => G.roster.length > 2 && G.roster.some(g => g.wins >= 3 && !g.away), make: () => { const g = pick(G.roster.filter(x => x.wins >= 3 && !x.away)), H = pick(G.houses); return { g: g.id, h: H.id, pay: round5(value(g) * 1.4) }; },
    text: c => `${houseDef(c.h).name} has sent a steward with a purse: <b class="gold num">${c.pay}</b> denarii for <b>${gn(c.g)}</b>, today, and no haggling.`,
    opts: [
      { label: c => `Sell him (+${c.pay})`, run: c => { const g = byId(c.g); if (!g) return 'He is gone already.'; G.denarii += c.pay; G.roster = G.roster.filter(x => x !== g); evAllMor(-5); return `${g.name} leaves by the side gate with his bundle. The others watch him go and do their sums.`; } },
      { label: () => 'He is not for sale', run: c => { evMor(byId(c.g), 12); feud(houseOf(c.h), 3); return `${gn(c.g)} hears of it before the steward has reached the corner. He trains like a man with something to prove.`; } },
    ],
  },
  oldArmour: {
    title: 'A chest in the cellar', can: () => true, make: () => ({}),
    text: () => 'Clearing the cellar for the new wine, the steward has found a chest nobody remembers, nailed shut and marked with your father\'s seal.',
    opts: [
      { label: () => 'Open it', run: () => { if (chance(0.6)) { const it = makeItem(pick(SLOTS.filter(s => s !== 'weapon')), clamp(tier() + rint(1, 2), 1, 5)); G.armoury.push(it); return `Under the straw: ${itemName(it)}, greased and wrapped. It is in your armoury.`; } const n = 30 + tier() * 30; G.denarii += n; return `Old coin, ${n} denarii of it, and a letter you would rather not have read.`; } },
      { label: () => 'Leave the dead their secrets', run: () => { evAllMor(2); return 'It goes back behind the casks. The household approves.'; } },
    ],
  },
  bathhouse: {
    title: 'An invitation to the baths', can: () => fit().length > 0, make: () => ({ g: pick(fit()).id }),
    text: c => `A circle of the town's richer young men want <b>${gn(c.g)}</b> at the public baths this afternoon, to be looked at and asked questions.`,
    opts: [
      { label: () => 'Let him go', run: c => { const g = byId(c.g); G.fame += 2; if (g) { g.fatigue = clamp(g.fatigue - 10, 0, 100); evMor(g, 6); } return `${gn(c.g)} comes back oiled, fed, and insufferable. Fame +2.`; } },
      { label: () => 'He has work to do', run: c => { addProg(byId(c.g), 'skl', 1); return 'They send a second invitation. He trains.'; } },
    ],
  },
  cookQuits: {
    title: 'The cook is leaving', can: () => home().length > 0 && G.denarii >= 20, make: () => ({ cost: 20 + tier() * 15 }),
    text: c => `The cook says a man cannot be expected to feed this many on what he is given, and he has an offer from the tavern.`,
    opts: [
      { label: c => `Raise his wage (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; evAllMor(3); return 'He stays, and that night there is meat.'; } },
      { label: () => 'Let him go, and let them cook for themselves', run: () => { evAllMor(-8); return 'Three days of burned porridge. He comes back on the fourth for the old wage, which nobody mentions.'; } },
    ],
  },
  omenBirds: {
    title: 'Birds over the yard', can: () => daysToGames() <= 3 && fit().length > 0, make: () => ({}),
    text: () => 'Twelve crows have settled on the barracks roof and will not be driven off. The games are close, and the men have noticed.',
    opts: [
      { label: () => 'Send for the augur (25)', ok: () => G.denarii >= 25, run: () => { G.denarii -= 25; evAllMor(8); return 'He watches them for an hour and declares that twelve is a number sacred to Mars, facing east. Nobody checks which way they face.'; } },
      { label: () => 'Tell them crows are crows', run: () => { fit().forEach(g => evMor(g, chance(0.5) ? 3 : -5)); return 'Half of them believe you.'; } },
    ],
  },
  apprentice: {
    title: 'The smith\'s boy', can: () => fit().length > 0, make: () => ({}),
    text: () => 'The blacksmith\'s apprentice has turned up at the gate with a bag of tools. His master has beaten him once too often, and he asks for a corner to sleep in. He will work for it.',
    opts: [
      { label: () => 'Take him in', run: () => { fit().forEach(g => { evMor(g, 3); addProg(g, 'agi', 1); }); favor('guild', -2); return 'Every strap and buckle in the school is seen to within the week, and the men move easier for it. The smith\'s guild is told where the boy is.'; } },
      { label: () => 'Send him back with a word to his master', run: () => { favor('guild', 2); return 'The smith is shamed into mending his ways, for a while. The Guild notes who kept the peace.'; } },
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
// A man who comes into the school out of a story, not out of the market.
function taleRecruit(name, budget, cls, how) {
  const g = makeGladiator(budget, cls ? { cls } : null);
  g.name = name; g.morale = 60; welcome(g); G.roster.push(g); addStory(g, how);
  return g;
}

const TALES = {
  // ---- the mill, and the hot spring ----
  miller: { name: "The miller's wife",
    lore: { stayed: { 'The mill': "The miller's wife runs it alone now, and the flour is better.", 'The hot spring': 'A miller sits in it to his chin, talking to the water.' },
      dragged: { 'The mill': 'The miller is home. He does not speak of the spring.' }, home: { 'The mill': 'The miller is home. He greases the wheel on the landward side.' } },
    steps: [
      { mark: 'The mill', who: "The miller's wife", title: 'The wheel is turning, and nobody is minding it',
        text: () => `A woman comes out of the mill with flour to the elbows, dragging a sack she plainly cannot lift. "You have backs," says <b>Varia</b>, the miller's wife. "My husband had one, until it began to hurt him, and three weeks ago he went up to the hot spring in the fells to soak it. A day there and a day back, he said. I have ground every sack since with my own hands. Bring Gnaeus home and I will make it worth the walk."`,
        opts: [
          { label: () => 'We will bring him home', run: () => 'She tells you the way twice, and what to say to him when you find him, which takes longer.' },
          { label: () => 'Carry her sacks in first, then go', run: t => { t.kind = true; taleTire(6); return "It is an hour's work for your men and a week's for her. She watches them do it with her arms folded, and says that the price has just gone up, in your favour."; } },
          { label: () => 'It is no business of ours', go: 'wait', run: () => '"No," she says. "It is mine." She goes back in to the stones.' },
        ] },
      { mark: 'The hot spring', title: 'The miller of the hot spring',
        text: () => `Gnaeus the miller is in the pool to his chest, as pink as a ham and plainly in no pain at all. He is not alone, or says he is not. "Her name is <b>Thalna</b>," he says, "and she lives in the water, and she has never once asked me when the flour will be ready." Something moves at the far side of the pool, under the steam: grey-green hair, a white shoulder, and below that the water is deeper than it looks. Your men have gone very quiet.`,
        opts: [
          { label: () => 'Haul him out and march him home', run: t => { t.end = 'dragged'; taleTire(4); return 'It takes two men to get him out and he weeps the whole way down the first hill. Behind you the pool closes over without a sound.'; } },
          { label: () => 'Speak to the one in the water', run: (t, id) => { t.end = 'stayed'; const n = taleCoin(id, 34); return `She comes as near as the edge of the steam, and no nearer. She does not speak. She opens her hand under the water, and when you reach in there is a pearl in it the size of a sling-stone, and warm. It is a price, and you have taken it: a jeweller will give <b class="gold num">${n}</b> denarii. Gnaeus waves as you go.`; } },
          { label: () => "Give him his wife's message, word for word", run: t => {
            if (chance(0.55)) { t.end = 'home'; return 'It takes some time; Varia was thorough. Somewhere near the end of it he gets out of the water of his own accord and asks where his boots are. He does not look back at the pool. Nothing in the pool looks at him.'; }
            t.end = 'stayed'; return 'He hears all of it, nodding, and at the end says to tell her the wheel wants greasing on the landward side. Then he slides down to his chin. You carried a message; now you have an answer to carry back.'; } },
        ] },
      { mark: 'The mill', title: "What the miller's wife says",
        text: t => t.end === 'stayed' ? `Varia hears it standing in the mill door. "A woman in the water," she says. "With a tail, I suppose." She looks at the wheel for a while. Then she takes his apron down off its nail, hangs it on the fence for the birds, and ties on her own. "Well. The mill is mine, then, and I owe you for the news."`
          : t.end === 'dragged' ? `Gnaeus is put down in his own yard like a sack of his own flour. Varia looks him over, finds nothing wrong with him, and has him at the stones before he has his breath back. "Three weeks," she says to you. "I counted."`
          : `Gnaeus walks into his own yard on his own feet and picks up a sack without being asked. Varia watches him do it. Whatever she had ready to say to him, she keeps.`,
        opts: [
          { label: () => 'Take what she offers', go: 'end', run: (t, id) => { const n = taleCoin(id, t.end === 'stayed' ? 22 : 34) + (t.kind ? 15 : 0); if (t.kind) G.denarii += 15; return `She counts it out of a crock from under the hearthstone: <b class="gold num">${n}</b> denarii${t.kind ? ', and something over for the sacks' : ''}.`; } },
          { label: () => 'Take it in bread', go: 'end', run: () => { taleTire(-15); taleCheer(5); return 'The oven is hot already. The men eat new bread sitting on the mill-race wall with their feet in the water, and march the better for it.'; } },
          { label: () => 'Take nothing', go: 'end', run: t => { G.fame += t.kind ? 3 : 2; favor('guild', 2); return `She does not argue. But every carter who stops for flour hears who it was that went up into the fells for the miller, and would not be paid. Fame +${t.kind ? 3 : 2}, and the Guild thinks better of you.`; } },
        ] },
    ] },

  // ---- the beacon, and the wreck on the strand ----
  beacon: { name: 'The cold beacon',
    lore: { lit: { 'The beacon': 'Lit every night. The keeper will tell you who brought the oil.' }, dark: { 'The beacon': 'Dark. The keeper has gone inland.', 'A wreck on the strand': 'There are two hulks on the strand now.' } },
    steps: [
      { mark: 'The beacon', who: 'The beacon keeper', title: 'A cold beacon',
        text: () => `The fire-pan on the beacon is cold, and has been for four nights by the look of the ash. The keeper, <b>old Mettius</b>, has a split lip and a bandaged hand. "They came in a boat and took every jar of oil I had, and left me alive so that I could watch. There is a grain ship due round the point. The men who took my oil are camped in the wreck on the strand, waiting for another to keep it company."`,
        opts: [
          { label: () => 'We will get his oil back', run: () => 'He shows you the path down to the strand, and where they post their lookout, and where the lookout sleeps.' },
          { label: () => 'Leave him the lamp oil out of the baggage (30 denarii)', ok: () => G.denarii >= 30, go: 'end', run: t => { G.denarii -= 30; t.end = 'lit'; favor('guild', 3); return 'It is enough for a week of nights, and in a week the Guild can send more. The men grumble about eating in the dark. Behind you, by evening, the point is lit. The Guild will hear of it: favour +3.'; } },
          { label: () => 'It is no business of ours', go: 'wait', run: () => 'He nods as if he had expected nothing else, and goes back to looking at the sea.' },
        ] },
      { mark: 'A wreck on the strand', danger: true, title: 'Wreckers',
        text: (t, id, c) => `The oil jars are stacked under the ribs of the hulk, with a sailcloth over them, and round them are the men who took them: wreckers, with boat-hooks and long knives, and a captain who is counting you. <span class="bad">${skulls(taleTier(id))}</span>${sizeUp(c, () => { const tr = taleTier(id); return [questBoss(tr, 'The wreckers\' captain', { tactic: 'aggressive' })].concat(wildMen(tr, Math.max(1, wildCount(tr) - 2))); })}`,
        opts: [
          { label: () => 'Take it back', ok: canFightNow, run: (t, id) => { const tr = taleTier(id); return wildFight('The wreckers on the strand', [questBoss(tr, 'The wreckers\' captain', { tactic: 'aggressive' })].concat(wildMen(tr, Math.max(1, wildCount(tr) - 2))), 'rock', 'tale', { tier: tr, day: true }); },
            won: () => 'What is left of them goes off down the strand. The jars are roped onto the mule, every one with the keeper\'s mark on its neck.' },
          { label: (t, id) => `Buy the oil back (${25 * taleTier(id)} denarii)`, ok: (t, id) => G.denarii >= 25 * taleTier(id), run: (t, id) => { G.denarii -= 25 * taleTier(id); t.bought = true; return 'The captain sells you the keeper\'s own oil at twice what the keeper paid for it, and laughs, and has his men help you load it. He can afford to. He thinks there will be other nights.'; } },
          { label: () => 'Take a share to see nothing', go: 'end', run: (t, id) => { t.end = 'dark'; const n = taleCoin(id, 40); favor('guild', -6); return `<b class="gold num">${n}</b> denarii, in mixed coin from several countries. Three nights later a grain ship out of Ostia opens herself on the point, and the Guild, which owned a third of her, begins asking who was on the strand that week. Guild favour -6.`; } },
        ] },
      { mark: 'The beacon', title: 'The light on the point',
        text: () => `Mettius fills the fire-pan with his own hands, bandage and all, and will not be helped. By dark it can be seen from the strand, and from a good way out beyond it.`,
        opts: [
          { label: () => 'The Guild should hear who lit it', go: 'end', run: t => { t.end = 'lit'; favor('guild', 7); G.fame += 2; return 'The keeper writes it in his log, slowly, with the wrong hand: the day, the school, and the number of jars. The Guild reads those logs. Guild favour +7, fame +2.'; } },
          { label: () => 'The keeper pays what he can', go: 'end', run: (t, id) => { t.end = 'lit'; const n = taleCoin(id, t.bought ? 38 : 28); return `He has his pay from the Guild in a sock, untouched, since there is nothing on the point to spend it on: <b class="gold num">${n}</b> denarii.`; } },
          { label: () => 'Stay the night by his fire', go: 'end', run: t => { t.end = 'lit'; taleTire(-22); taleCheer(6); fieldParty().forEach(g => { g.hp = Math.min(maxHp(g), g.hp + maxHp(g) * 0.15); }); return 'There is no warmer place on the coast. The men sleep with their backs to the beacon and wake with the sea all gold in front of them, rested.'; } },
        ] },
    ] },

  // ---- the great oak, and the sacred grove ----
  oak: { name: 'The girl and the oak',
    lore: { stands: { 'The great oak': 'A ribbon is tied round it every spring, by a girl called Senna.' }, felled: { 'The great oak': "It has lost its great south limb to the governor's roof. The grove has not forgiven it." } },
    steps: [
      { mark: 'The great oak', who: 'A girl chained to the oak', title: 'The girl and the oak',
        text: () => `There is a chain round the great oak, and inside the chain a girl of about fifteen, who has plainly been there some days. Four woodmen with a two-man saw sit in the grass, waiting for her to get hungry. Their foreman has a tablet: the Magistrate's clerk has sold the great limbs for the governor's new roof, which will kill the tree. The girl, <b>Senna</b>, says the oak belongs to the sacred grove, and that the priestess there can prove it.`,
        opts: [
          { label: () => 'Go to the grove and ask', run: () => 'You leave her your bread. The foreman watches you do it, and says nothing, and moves his men a little further off.' },
          { label: () => 'Help the woodmen lift her off', go: 'end', run: (t, id) => { t.end = 'felled'; const n = taleCoin(id, 18); favor('temple', -5); favor('magistrate', 2); return `It takes one of your men to hold her and another to cut the chain. The foreman pays <b class="gold num">${n}</b> denarii for the trouble. She does not cry; she looks at each of your men in turn, as if to remember them. The priests will hear of it: temple favour -5.`; } },
          { label: () => 'Leave them to it', go: 'wait', run: () => 'The girl calls something after you. The woodmen laugh.' },
        ] },
      { mark: 'The sacred grove', title: 'The priestess of the grove',
        text: () => `The priestess is older than seems likely, and is splitting kindling. She knows about the oak already; she seems to know about you. "It was grown from an acorn of this grove the year the first stone of the town was laid. There is a tablet that says so, under a seal older than the Magistrate's office." She fetches it out of a hollow tree. "The grove asks something of those it helps."`,
        opts: [
          { label: () => 'Leave silver on the stone (40 denarii)', ok: () => G.denarii >= 40, run: t => { G.denarii -= 40; t.gift = true; return 'She does not look at it. She presses her thumb to the old seal and then to your forehead, and for the rest of the day the men walk a little behind you.'; } },
          { label: () => "Leave a man to keep the night's vigil", run: t => { t.gift = true; const g = taleLead(); g.fatigue = clamp(g.fatigue + 25, 0, 100); evMor(g, 10); return `<b>${g.name}</b> stands the night under the trees with a bowl of water in his hands, and is not to spill it. He does not. He will not say afterwards what he saw, but he is cheerful about it.`; } },
          { label: () => 'Take the tablet, with thanks', run: () => 'She gives it to you all the same. "The oak is not the one who will remember," she says.' },
        ] },
      { mark: 'The great oak', title: 'The seal and the saw',
        text: t => `The girl is still in her chain, and thinner. The foreman reads the tablet with his lips moving. ${t.gift ? 'Then he turns it over and sees the seal, and the thumb-print in the wax beside it, still soft, and he stops being sure of himself.' : 'He says one seal is as good as another, and that his is newer.'}`,
        opts: [
          { label: () => 'Stand on the seal', go: 'end', run: t => {
            if (t.gift || chance(0.45)) { t.end = 'stands'; favor('temple', 6); G.fame += 3; return 'He hands it back with two fingers. The saw is shouldered; the woodmen go. Senna cannot get her own chain undone, in the end, and one of your men has to do it for her. Temple favour +6, fame +3.'; }
            t.end = 'felled'; favor('temple', -2); return 'He is not persuaded, and you have nothing else to persuade him with. They wait until you are over the hill. You hear the saw start from there. Temple favour -2.'; } },
          { label: () => 'Buy his deed off him (60 denarii)', ok: () => G.denarii >= 60, go: 'end', run: t => { G.denarii -= 60; t.end = 'stands'; favor('temple', 4); G.fame += 2; return 'For sixty denarii the foreman discovers that there are other oaks. He leaves you the tablet, which now makes you the owner of the great limbs of a sacred tree; you give it to the girl. Temple favour +4, fame +2.'; } },
          { label: () => 'Drive them off', ok: canFightNow, go: 'end', run: () => wildFight('Woodmen at the great oak', wildMen(1, 4), 'forest', 'tale', { tier: 1, day: true }),
            won: t => { t.end = 'stands'; favor('temple', 4); favor('magistrate', -4); return 'They are woodmen, not fighters, and they leave their saw behind. The clerk who sold the timber will have to explain it to the governor, and will not forget whose doing that was. Temple favour +4, Magistrate -4.'; } },
        ] },
    ] },

  // ---- the ferry, and the drowned temple ----
  ferry: { name: 'The bell under the water',
    lore: { silent: { 'The ferry': 'It crosses at any hour now.', 'The drowned temple': 'Quiet. A rope hangs in the tower with nothing on the end of it.' },
      noon: { 'The ferry': 'The ferryman crosses when the bell has rung noon.', 'The drowned temple': 'A bell rings at noon, under the water.' },
      kept: { 'The ferry': 'The ferryman ties up at dusk, and listens.', 'The drowned temple': 'A bell rings at dusk for the drowned, each by name.' } },
    steps: [
      { mark: 'The ferry', who: 'The ferryman', title: 'The bell under the water',
        text: () => `The ferryman will take you over by day, and not otherwise. "There is a bell," says <b>Charax</b>. "In the drowned temple, out in the marsh. It has started to ring again, at dusk. Twice now a passenger has stood up in my boat in the middle of the river and stepped off, as if somebody had called him by his name. I cannot feed my children on a morning trade. Make it stop."`,
        opts: [
          { label: () => 'Go and see what rings it', run: () => 'He draws you the channels through the marsh in the mud with his pole, and which of them have a bottom.' },
          { label: () => 'Ask him what he is not saying', run: t => { t.knows = true; return 'He looks at the water for a time. The second man who stepped off was his brother. He draws you the channels through the marsh with his pole, and does not look up again.'; } },
          { label: () => 'It is no business of ours', go: 'wait', run: () => 'He shrugs, and holds out his hand for the fare.' },
        ] },
      { mark: 'The drowned temple', title: 'Who keeps the hours',
        text: t => `The temple stands to its knees in black water. On the one dry step sits a very old man with a bell-rope across his lap. He was a boy in this temple when the marsh came up; the others left, and he did not; and every dusk since he has rung the evening office for a god whose name he is the last alive to know. He is nearly blind. He has no notion that anybody can hear it${t.knows ? ', or what it has cost' : ''}.`,
        opts: [
          { label: () => 'Cut down the clapper', go: 'end', run: (t, id) => { t.end = 'silent'; const n = taleCoin(id, 26); favor('temple', -4); return `It is old bronze, and heavy: <b class="gold num">${n}</b> denarii to a founder. He hears you do it. He goes on pulling the rope at dusk all the same, you are told afterwards, and listening, and pulling it again. Temple favour -4.`; } },
          { label: () => 'Ask him to ring it at noon', go: 'end', run: t => { t.end = 'noon'; favor('temple', 5); G.fame += 2; return 'He thinks about it for a long time. The god, he says at last, has never been particular about the hour; it was the old high priest who was. Noon, then. The ferryman, when he hears it across the marsh in broad day, sits down in his boat and laughs until he cannot. Temple favour +5, fame +2.'; } },
          { label: () => 'Sit with him through the office', go: 'end', run: t => { t.end = 'kept'; taleCheer(8); const g = taleLead(); g.xp = (g.xp || 0) + 3; return `It is long, and in no language any of you knows, and at the end of it the men are quieter than you have seen them. He asks who has died on the river. You tell him${t.knows ? ", the ferryman's brother first" : ''}. From then on he says the names at dusk, before he rings; and nobody else steps out of the boat.`; } },
        ] },
    ] },

  // ---- the watchtower, and the burnt village ----
  watch: { name: 'One man on a two-man watch',
    lore: { back: { 'The watchtower': 'Two men, a fire, and a long view north. One of them has a grave to visit.', 'A burnt village': 'One grave in the ash has a stone on it.' },
      gone: { 'The watchtower': 'One man, a fire, and a long view north.' }, oath: { 'The watchtower': 'One man, a fire, and a long view north.', 'A burnt village': 'One grave in the ash has a stone on it.' } },
    steps: [
      { mark: 'The watchtower', who: 'A soldier at the watchtower', title: 'One man on a two-man watch',
        text: () => `"Two men, a fire and a long view," says the soldier on the watchtower, without coming down. "That is the standing order. Tonight it is one man. <b>Rufio</b> went over the wall at the second watch, without his shield. The centurion rides his round in three days, and if he finds one of us he will hang the other when he catches him. He will have gone to the burnt village. He was born there."`,
        opts: [
          { label: () => 'We will find him', run: () => 'He throws down a wineskin for the road, which is half his ration, and goes back to watching north for both of them.' },
          { label: () => 'Ask what it is worth to him', run: t => { t.paid = true; return 'His pay is four months behind. He offers his boots, and then, when you say nothing, his word that the tower will not see your school on any road it watches. That is worth something. You go.'; } },
          { label: () => 'It is no business of ours', go: 'wait', run: () => 'He does not answer. There is nobody to relieve him, so he goes on watching.' },
        ] },
      { mark: 'A burnt village', title: 'What Rufio went back for',
        text: () => `He is not hiding. He is digging, with a legionary's entrenching tool, in the ash of what was a house, and he has been at it since he got here. There is a row of bundles beside him, wrapped in his own cloak, cut up. "My mother," he says, not stopping. "My sisters. Nobody buried anybody here. I asked for leave eleven times."`,
        opts: [
          { label: () => 'Dig with him, then walk him back', go: 'end', run: t => { t.end = 'back'; taleTire(10); taleCheer(4); favor('magistrate', t.paid ? 6 : 4); G.fame += 2; return `With your men at it, it is done by dark, and done properly, with a stone. He washes at the well and walks back beside you without being told. The centurion finds two men, a fire, and a long view north. Magistrate favour +${t.paid ? 6 : 4}, fame +2.`; } },
          { label: () => 'Give him road money and look away (20 denarii)', ok: () => G.denarii >= 20, go: 'end', run: t => { G.denarii -= 20; t.end = 'gone'; taleCheer(6); favor('magistrate', -2); return 'He finishes the last grave first. Then he takes the money, and the north road, and does not thank you, which the men seem to think is right. The tower will have to answer for him. Magistrate favour -2.'; } },
          { label: () => 'Offer him the oath instead of the rope', ok: () => G.roster.length < capacity(), go: 'end', run: (t, id) => { t.end = 'oath'; const g = taleRecruit('Rufio', 22 + taleTier(id) * 3, 'murmillo', 'A soldier who left his post to bury his dead, and took the oath of the school sooner than hang.'); return `He thinks about it leaning on the spade. A gladiator is a slave, and a deserter is a dead man. "Let me finish here," he says. <b>${g.name}</b> joins the school that night, with a legionary's drill and nothing else at all.`; } },
        ] },
    ] },

  // ---- the giant's table, and the ring of stones ----
  giant: { name: "Supper on the giant's table",
    lore: { fed: { "The giant's table": 'A supper is set on it every night, and the bowl comes back washed.' }, oath: { "The giant's table": 'A supper is still set on it. The foxes have it now.' }, taken: { "The giant's table": 'Nobody sets a supper on it any more.' } },
    steps: [
      { mark: "The giant's table", who: 'An old woman at the stones', title: "Supper on the giant's table",
        text: () => `An old woman is laying a meal on the capstone of the giant's table: a loaf, a cheese, an onion, a bowl of milk. "For the giant," says <b>old Brica</b>, as if it were plain. "My mother set it, and hers. Nothing ever took it but foxes. Since the spring it is gone every morning to the last crumb, and the bowl is washed. Somebody is eating my giant's supper. I want to know whether to bake more."`,
        opts: [
          { label: () => 'Keep watch tonight', run: () => { taleTire(8); return 'Near dawn something very large comes up out of the dark, eats standing, wipes the bowl with a handful of moss and sets it down straight. It is a man, though not by much. It goes off east, and it does not hurry. East is the ring of stones.'; } },
          { label: () => 'Follow the tracks by daylight', run: () => 'There are footprints in the dew, half as long again as your biggest man\'s, going and coming. They go east, towards the ring of stones, by a path somebody has been using every night for months.' },
          { label: () => 'It is no business of ours', go: 'wait', run: () => 'She shakes her head at you and goes on laying the table.' },
        ] },
      { mark: 'The ring of stones', danger: true, title: 'The giant',
        text: () => `He is sitting against the tallest stone of the ring, which does not look tall. He is the biggest man any of you has seen, and down one forearm he has the scars a murmillo gets from his own shield-rim. Your older men know who he is. <b>Buccio the Ox</b> killed his friend in the old arena twelve years ago, when the crowd would not spare him; picked up the body, walked out of the gate with it, and was not seen again. He looks at your men's cropped heads for a long time. "Did Brica send you," he says, "or a lanista?"`,
        opts: [
          { label: () => 'Tell him the old woman wants to know how much to bake', go: 'end', run: t => { t.end = 'fed'; taleCheer(8); G.fame += 2; return 'He laughs like a wall falling down. "Tell her twice the bread, and no onion." The men tell this story in the yard for a month, and are the better for having it to tell. Brica bakes twice the bread. Fame +2.'; } },
          { label: () => 'Offer him a place in the school', ok: () => G.roster.length < capacity(), go: 'end', run: (t, id) => { t.end = 'oath'; const g = taleRecruit('Buccio the Ox', 30 + taleTier(id) * 4, 'murmillo', 'Twelve years in the ring of stones, after the old arena. Came back to the sand of his own will.'); if (!g.traits.includes('ironhide')) g.traits.push('ironhide'); g.hp = maxHp(g); return `He looks at his hands. "I am forty," he says, "and I have eaten an old woman's bread for a year because I could not think what else I was for." <b>${g.name}</b> walks back with the school, and the men give him room.`; } },
          { label: () => 'There is still a price on a runaway', ok: canFightNow, go: 'end', run: (t, id) => { const tr = taleTier(id); return wildFight('Buccio the Ox', [questBoss(tr, 'Buccio the Ox', { cls: 'murmillo', boost: 6, traits: ['ironhide'], tactic: 'balanced' })], 'rock', 'tale', { tier: tr, day: true }); },
            won: (t, id) => { t.end = 'taken'; const n = taleCoin(id, 55); favor('magistrate', 3); taleCheer(-5); return `He fought as if he had been waiting twelve years for somebody to make him. The Magistrate pays <b class="gold num">${n}</b> denarii for a runaway of that name. The men do not talk about it, and somebody goes on leaving bread on the giant's table for a while. Magistrate favour +3.`; } },
        ] },
    ] },

  // ---- the wine press, and the bee garden ----
  vintner: { name: 'Drunken bees',
    lore: { supper: { 'The wine press': 'The vintner is courting the beekeeper, by lawsuit.', 'The bee garden': 'Honey for the governor. The vintner comes to supper.' }, quits: { 'The wine press': 'Its wine tastes of thyme honey, and nobody is to say so.' } },
    steps: [
      { mark: 'The wine press', who: 'The vintner', title: 'Drunken bees',
        text: () => `"Look at them," says the vintner, <b>Sergius</b>, and there are indeed bees all over his pressing floor, walking in circles. "Hers. From the bee garden. They drink my must, they drown in my vats, and I have paid a boy all month to skim them out. I want damages. You are going that way: tell that woman forty denarii, or I go to the Magistrate."`,
        opts: [
          { label: () => 'Carry his demand', run: () => 'He makes you say it back to him, to be sure of the forty.' },
          { label: () => 'Taste the must first', run: t => { t.tasted = true; taleCheer(2); return 'It is the best in the province, by some way, and it tastes of thyme honey. You do not say so. You carry his demand.'; } },
          { label: () => 'It is no business of ours', go: 'wait', run: () => 'He goes back to shouting at the boy.' },
        ] },
      { mark: 'The bee garden', title: "The beekeeper's answer",
        text: t => `<b>Albia</b> the beekeeper hears the demand without putting down her smoker. "Forty denarii. Tell him his wine was vinegar until my bees found it${t.tasted ? ', as you know, for you have tasted it' : ''}; and that I want forty from him, for the thyme honey his must has been stealing off their legs for six years. Tell him also" - she is veiled, so it is hard to be sure, but she seems to be enjoying herself - "that he might come and say it to me himself. As he did last year. And the year before. He stayed to supper both times."`,
        opts: [
          { label: () => 'Carry her answer back, all of it', go: 'end', run: (t, id) => { t.end = 'supper'; const n = taleCoin(id, 16); taleCheer(5); return `Sergius hears it out, goes red by stages, and calls for a clean tunic. For your trouble you are given a jar of the vintage in question and <b class="gold num">${n}</b> denarii not to mention the tunic to anybody. The men mention it to everybody.`; } },
          { label: () => 'Settle it yourself: each owes the other forty', go: 'end', run: (t, id) => { t.end = 'quits'; const n = taleCoin(id, 20); favor('magistrate', 2); return `It is good law, and both of them are furious. Each pays you half an arbitrator's fee, <b class="gold num">${n}</b> denarii together, to be rid of you; and the Magistrate, spared a hearing about bees, is obliged. Magistrate favour +2.`; } },
          { label: () => 'Buy wine and honey of both, and leave them to it (30 denarii)', ok: () => G.denarii >= 30, go: 'end', run: t => { G.denarii -= 30; t.end = 'supper'; taleTire(-12); taleCheer(8); return 'Honey on new bread, and the wine that tastes of it. The men have not eaten so well since the last games. When you look back from the road there is smoke from one chimney, and a man in a clean tunic walking towards it with a jar.'; } },
        ] },
    ] },

  // ---- the fishers' huts, and the bones of a whale ----
  whale: { name: 'The jawbone',
    lore: { back: { 'The bones of a whale': 'The jaw is back in its place. The fishers leave it the first fish of every catch.', "The fishers' huts": 'The boats go out again.' },
      carted: { 'The bones of a whale': "Gone, to the last rib, to the governor's garden. There is a hollow in the sand.", "The fishers' huts": 'Half the boats are drawn up for good.' },
      cast: { 'The bones of a whale': 'The jaw is back in its place, with plaster dust still in the grain of it.', "The fishers' huts": 'The boats go out again.' } },
    steps: [
      { mark: "The fishers' huts", who: 'The fishers', title: 'Boats drawn up in fair weather',
        text: () => `Every boat is drawn up above the tide-line, on a morning any fisherman would give a tooth for. The nets are dry. An old woman, <b>Mamma Tutia</b>, who seems to do the talking for all of them, points along the shore with her chin. "Somebody has been at the whale. The jaw is gone. We do not put out while the whale is not whole, and do not ask me why, because my grandmother did not know either. Go and look, since you are walking that way."`,
        opts: [
          { label: () => 'Go and look at the whale', run: () => 'They give you dried fish for the road, which is all they have to give until the boats go out.' },
          { label: () => 'Ask what the whale has to do with it', run: t => { t.asked = true; return 'It came ashore the year of the great storm, she says, the only year no boat of theirs was lost. Nobody has wished to find out whether that was chance. You go and look.'; } },
          { label: () => 'It is no business of ours', go: 'wait', run: () => 'She spits, politely, to one side.' },
        ] },
      { mark: 'The bones of a whale', title: 'A Greek with a measuring rod',
        text: t => `There is a cart among the ribs, and in the cart, packed in straw, the jawbone, as long as two men. A Greek in a clean tunic is measuring what is left with a knotted cord and calling numbers to a slave with a tablet. He is <b>Master Pollio</b>, and he has the governor's letter: the whole animal is to be set up in the governor's garden, wired together, as a wonder. "They are fishermen," he says, when you tell him. "They will fish${t.asked ? '. A storm is weather, not a whale' : ''}."`,
        opts: [
          { label: () => 'The jaw goes back where it lay', go: 'end', run: t => { t.end = 'back'; favor('magistrate', -3); taleCheer(4); G.fame += 2; return 'Your men lift it out of his cart while he reads his letter at them, louder each time. It goes back into its own print in the sand as if it had been waiting. By the time you pass the huts again the first boat is afloat, and there is fish for everybody. The governor will be told who spoiled his wonder: Magistrate favour -3, fame +2.'; } },
          { label: () => 'Help him load the rest', go: 'end', run: (t, id) => { t.end = 'carted'; const n = taleCoin(id, 30); taleTire(8); return `It is a day's work and he pays for it like a man spending somebody else's money: <b class="gold num">${n}</b> denarii. You go home by another road than the one past the huts.`; } },
          { label: () => 'Take a mould of it in plaster, and give him that', go: 'end', run: (t, id) => {
            if (chance(clamp(0.35 + bestWits() * 0.03, 0.35, 0.9))) { t.end = 'cast'; const n = taleCoin(id, 18); G.fame += 2; return `It is your own men's notion, and they are absurdly proud of it. Pollio objects until it is pointed out that plaster does not rot, smell, or need wiring. He takes his cast and pays <b class="gold num">${n}</b> denarii for the idea; the bone goes back in the sand; the boats go out. Fame +2.`; }
            t.end = 'back'; taleTire(6); return 'The plaster will not set in the sea air, and by evening there is a great deal of white mud and one furious Greek. In the end he goes off to fetch better plaster from the town, and your men put the jaw back while he is gone. The boats go out. He will not be back before winter.'; } },
        ] },
    ] },

  // ---- the gallows, and the fort ----
  gallows: { name: 'The man on the barrel',
    lore: { freed: { 'The gallows': 'Empty, this month. The barrel has been taken for firewood.', 'The fort': 'They have a new quartermaster.' },
      cut: { 'The gallows': 'A cut rope hangs from it. Nobody has claimed the reward.' }, hanged: { 'The gallows': 'A clerk hangs here, who said to the end that he was no thief.' } },
    steps: [
      { mark: 'The gallows', who: 'A man with a rope round his neck', title: 'The man on the barrel',
        text: () => `There is a man standing on a barrel under the gallows, with his hands tied and the rope already round his neck, and nobody else in sight: the hangman has gone to his dinner and left him to think. "Do not kick it," he says. "I beg you. I am <b>Naso</b>, pay-clerk at the fort. Forty men's pay went out of the chest and I am to hang for it at sundown tomorrow. Ask the quartermaster to show you his own ledger. That is all. Ask him to show it."`,
        opts: [
          { label: () => 'Go to the fort and ask', run: () => 'He thanks you as far as the rope allows. You leave him his barrel.' },
          { label: () => 'Cut him down, and let him run', go: 'end', run: t => { t.end = 'cut'; favor('magistrate', -5); taleCheer(5); return 'He is gone into the gorse before the rope has stopped swinging. Whether he stole the pay or not, you will never know now, and neither will the fort. The men like it. The Magistrate, whose gallows it is, does not: favour -5.'; } },
          { label: () => 'It is no business of ours', go: 'wait', run: () => 'He watches you all the way to the bend of the road.' },
        ] },
      { mark: 'The fort', title: "The quartermaster's ledger",
        text: () => `The quartermaster of the fort is a broad, comfortable man called <b>Sulca</b>, with new boots. He is delighted to see a lanista; he will not hear of the pay chest; and the ledger, he regrets, is under lock by the centurion's order. As you are leaving he falls into step beside you and remarks that the fort buys a great deal of oil, leather and wine, and has been thinking of changing its suppliers, and that a clerk is only a clerk.`,
        opts: [
          { label: () => 'Say it before the centurion, in front of the men', run: t => {
            if (chance(clamp(0.4 + G.fame / 400, 0.4, 0.85))) { t.proof = true; return 'The centurion does not like gladiators, but he likes being robbed less, and the men whose pay it was are listening. He has the strongbox opened on the parade ground. There are two ledgers in it. Sulca is put in the clerk\'s old cell, and you are given a tablet for the hangman, with the fort\'s seal on it.'; }
            t.proof = false; return 'The centurion hears you out and has you shown to the gate. But he looked at Sulca\'s boots while you were talking; and a soldier catches you up on the road with a scrawled note for the hangman. It asks for three days\' delay. It is not a pardon.'; } },
          { label: () => 'Have the ledger out of his room tonight', run: t => {
            if (chance(clamp(0.3 + bestWits() * 0.035, 0.3, 0.9))) { t.proof = true; return `It is under his mattress, where a man keeps what he reads last thing at night. <b>${taleLead().name}</b> is in and out by the latrine window before the watch changes. Forty men's pay, in Sulca's own hand, a little at a time over two years.`; }
            t.proof = false; taleTire(10); return 'The latrine window is narrower than it looked. Your man is not caught, but he comes back with nothing but the smell, and by morning Sulca has doubled his door-guard. All you have for the hangman is your own word.'; } },
          { label: () => 'Take the hint, and the contract', go: 'end', run: (t, id) => { t.end = 'hanged'; const n = taleCoin(id, 45); favor('magistrate', 2); taleCheer(-4); return `Oil, leather and wine: the first payment is <b class="gold num">${n}</b> denarii, in advance, in coin that has plainly been in a pay chest. The men know what it was for. At sundown the next day, from a long way off, you can see that the barrel is gone. Magistrate favour +2.`; } },
        ] },
      { mark: 'The gallows', title: 'Sundown',
        text: t => t.proof ? `The hangman reads the tablet twice, sighs for his fee, and climbs up to take the rope off. Naso sits down on the barrel, as his legs will not do anything else. His wife and two brothers have come to see him die and have brought what the family could raise for a mason; they hold it out to you instead.`
          : `The hangman reads what you have brought, and scratches his neck. Three days, or your word against the fort's. He is a reasonable man, he says, and a poor one. Naso is still on the barrel. His wife and two brothers are there, with what the family could raise for a mason.`,
        opts: [
          { label: t => t.proof ? "Take the family's purse" : "Pay the hangman out of the family's purse", go: 'end', run: (t, id) => { t.end = 'freed'; const n = t.proof ? taleCoin(id, 30) : 0; return t.proof ? `It is <b class="gold num">${n}</b> denarii, in small coin, and they would be shamed if you refused it.` : 'It takes all of it. The hangman finds that the rope has rotted and that a rotted rope is the will of the gods. By the time anybody at the fort looks into Sulca\'s ledgers, as they will, Naso is three provinces away.'; } },
          { label: () => 'Take nothing', go: 'end', run: t => { t.end = 'freed'; if (!t.proof) G.denarii -= Math.min(G.denarii > 0 ? G.denarii : 0, 25); G.fame += 3; favor('temple', 2); return `${t.proof ? 'You leave them their mason\'s money' : 'You pay the hangman yourself, twenty-five denarii, and leave them their mason\'s money'}; they have no use for a mason now. It is told in the town before you are home. Fame +3, temple favour +2.`; } },
          { label: () => 'A clerk who can keep honest books is worth feeding', ok: () => G.roster.length < capacity(), go: 'end', run: (t, id) => { t.end = 'freed'; const g = taleRecruit('Naso', 18 + taleTier(id) * 2, null, 'A pay-clerk taken down off the gallows barrel, who would not go back to the fort.'); g.morale = 85; return `He cannot go back to the fort; nobody there will forgive him for being right. <b>${g.name}</b> comes with the school. He is no fighter yet, but he has stood a day and a night on a barrel without falling, which is a kind of nerve.`; } },
        ] },
    ] },

  // ---- the lime kiln, and the great quarry ----
  kiln: { name: 'The fire that must not go out',
    lore: { round: { 'The great quarry': 'There is a face in the rock, and the cut goes round it.', 'The lime kiln': 'Its fire has not been let go out in years. It nearly was, once.' },
      broken: { 'The great quarry': 'A fresh scar in the east face, and the men will not look at it.', 'The lime kiln': 'Its fire has not been let go out in years.' },
      out: { 'The lime kiln': 'Cold. They are waiting on a priest to light it again.', 'The great quarry': 'There is a face in the rock. Nobody cuts there.' } },
    steps: [
      { mark: 'The lime kiln', who: 'The lime burner', title: 'The fire that must not go out',
        text: () => `The lime burner is feeding his kiln with fence rails. "Nineteen years," says <b>Fuscus</b>, without turning round. "My father lit it. You do not relight a kiln this size; you build another. And the quarry has sent me no stone in eight days and no word why. I have two days of stone left, and I cannot leave the fire to go and ask."`,
        opts: [
          { label: () => 'Go and ask at the quarry', run: () => 'He nods at the fire, which is as much thanks as he can spare from it.' },
          { label: () => 'Leave two men to feed it, and go', run: t => { t.help = true; taleTire(5); return 'He looks at your two men as a man might look at somebody offering to mind his child. Then he shows them, exactly, how. The rest of you go to the quarry.'; } },
          { label: () => 'It is no business of ours', go: 'wait', run: () => 'He throws on another rail.' },
        ] },
      { mark: 'The great quarry', title: 'The face in the rock',
        text: () => `Nobody is working. The quarrymen are sitting along the top bench with their mallets across their knees, looking at the east face, and the overseer, <b>Blaesus</b>, is hoarse. Eight days ago a block came away and left a face behind it in the living rock: eyes shut, a mouth, something like a beard, as tall as a house door. Nobody carved it. The best stone in the quarry lies straight through it, and the men will not put a wedge in.`,
        opts: [
          { label: () => 'Have them cut round it', go: 'end', run: t => { t.end = 'round'; favor('temple', 5); G.fame += 2; return 'It costs Blaesus forty feet of his best bed and he says so, at length. But a quarry with a god in it is still a quarry, and one with a strike in it is a hole. The first cartload reaches the kiln with a day to spare, and the priests, when they hear, send somebody out to look at the face. Temple favour +5, fame +2.'; } },
          { label: () => 'Have your own men carry a load down to the kiln', go: 'end', run: (t, id) => { t.end = t.help ? 'round' : 'out'; taleTire(14); const n = taleCoin(id, 26); return t.help ? `Loose stone off the spoil heap, on their backs, eight miles. It buys the fire four days, and in four days the quarrymen have talked themselves round to cutting somewhere else. Fuscus pays <b class="gold num">${n}</b> denarii and does not stop feeding the kiln to do it.` : `Loose stone off the spoil heap, on their backs, eight miles. Fuscus pays <b class="gold num">${n}</b> denarii for it. But one load is one load, the quarry is still idle when it is burnt, and on the tenth night the fire his father lit goes down to a red eye and then to nothing.`; } },
          { label: () => 'Put the first wedge in yourself', go: 'end', run: (t, id) => { t.end = 'broken'; const n = taleCoin(id, 38); favor('temple', -5); taleCheer(-3); return `Somebody has to, Blaesus says, and pays you <b class="gold num">${n}</b> denarii to be the one. It splits along the mouth. The men go back to work at once and do not speak to you, and yours are not much better. Temple favour -5.`; } },
        ] },
    ] },

  // ---- the huts on stilts, and the bog oak ----
  bog: { name: 'The bog man',
    lore: { buried: { 'The bog oak': 'There is a grave under it now, with a child\'s wooden horse on the mound.' }, torc: { 'The bog oak': 'The peat under it has been dug over, and left open.' },
      kept: { 'The bog oak': 'Something sleeps in the peat beneath it. A child brings it milk.', 'The huts on stilts': 'The children are not afraid of the marsh. Their mothers are.' } },
    steps: [
      { mark: 'The huts on stilts', who: 'The marsh people', title: 'The bog man',
        text: () => `The marsh people do not like strangers, and it is a mark of how things stand that a woman poles straight across to you. Her girl, <b>Uisca</b>, seven years old, goes out at dusk and comes back at dawn with peat to the knees, and will say only that she has been "minding him". The other children say there is a man in the bog by the black oak who does not get up. The men of the village will not go there after dark, or before it.`,
        opts: [
          { label: () => 'Go to the bog oak', run: () => 'She gives you a bundle of reeds to lay where the ground will not hold. It is not much to give, and here it is a great deal.' },
          { label: () => 'Ask the child', run: t => { t.child = true; return 'Uisca looks you over and decides you will do. "He is cold," she says. "He has been asleep a long time and nobody tucked him in." She shows you which way, with a wet finger, and says to mind his hair.'; } },
          { label: () => 'It is no business of ours', go: 'wait', run: () => 'She poles back without a word.' },
        ] },
      { mark: 'The bog oak', title: 'The one who does not get up',
        text: t => `Under the roots of the black oak, where the peat has slumped, there is a man lying on his side. He is the colour of the oak and as hard, with every hair of his red beard in place and a cord still round his neck. He has been there since before there was a town. Somebody has put a child's blanket over him, and a bowl of milk by his head${t.child ? ', and combed his hair' : ''}. Round his arm, black with the bog, is a ring as thick as a thumb, and where the blanket has rubbed it, it is gold.`,
        opts: [
          { label: () => 'Bury him properly, with the child to see it done', go: 'end', run: t => { t.end = 'buried'; taleTire(6); favor('temple', 4); G.fame += 2; return 'On the dry rise beyond the oak, with the ring still on his arm and the blanket over him. Uisca wants to know whether he will be warm now, and is told yes. She leaves him her wooden horse. The marsh people watch from their boats, and that night, for the first time anybody remembers, they send food to a stranger\'s fire. Temple favour +4, fame +2.'; } },
          { label: () => 'Take the arm-ring', go: 'end', run: (t, id) => { t.end = 'torc'; const n = taleCoin(id, 60); taleCheer(-6); favor('temple', -3); return `It will not come over the hand, and what has to be done to get it is done by you, since no man of yours will. A goldsmith gives <b class="gold num">${n}</b> denarii and asks nothing. The child is told that he woke up and went home. She does not believe it. Temple favour -3, and the men are uneasy.`; } },
          { label: () => 'Cover him again, and tell the village he harms nobody', go: 'end', run: t => { t.end = 'kept'; taleCheer(5); const g = taleLead(); g.xp = (g.xp || 0) + 2; return `You put the peat back over all but his face, as she had it. The village is not comforted, exactly; but a dead man who needs a blanket is less to be afraid of than one who walks. <b>${g.name}</b> stays behind a moment to straighten the bowl.`; } },
        ] },
    ] },

  // ---- the old arena, and the old arch ----
  sweeper: { name: 'The last games',
    lore: { held: { 'The old arena': 'Swept every morning. The last games held in it were fought before one old man.' }, quiet: { 'The old arena': 'Nobody sweeps it now. The grass is coming up through the sand.' } },
    steps: [
      { mark: 'The old arena', who: 'An old man with a broom', title: 'The man who sweeps the sand',
        text: () => `An old man is sweeping the sand of the old arena, in straight lines, as if there were games tomorrow. There have been no games here for forty years. <b>Hirpus</b> was the arena's boy, then its gate-man, then all that was left of it. "The last day was never finished," he says, leaning on the broom. "The Magistrate's men came in at the seventh bout. The editor buried the victor's palm and the prize purse under the old arch so they should not have it, and died that winter. If I had the palm, I could close the games. They ought to be closed."`,
        opts: [
          { label: () => 'Go and dig at the old arch', run: () => 'He tells you which pier, and how many paces from it, and then tells you again in case you were not listening.' },
          { label: () => 'Ask who was winning', run: t => { t.asked = true; return 'A Thracian called Sagaris, against a murmillo whose name he has forgotten, which grieves him. Sagaris had him down. The thumb had not been given. He tells you which pier of the arch, and how many paces.'; } },
          { label: () => 'It is no business of ours', go: 'wait', run: () => 'He goes back to his lines.' },
        ] },
      { mark: 'The old arch', title: 'Under the third pier',
        text: () => `Three feet down, in an oiled leather bag that has outlasted the man who buried it: a palm branch of gilded bronze, as long as an arm, and under it a purse. The purse is heavy. Forty years ago it was a fine prize, and silver does not spoil.`,
        opts: [
          { label: () => 'Take him both', run: t => { t.purse = 'his'; return 'It all goes back into the bag as it came out.'; } },
          { label: () => 'Take him the palm. The purse was never his', run: (t, id) => { t.purse = 'yours'; const n = taleCoin(id, 40); return `<b class="gold num">${n}</b> denarii, in coin with an emperor on it that your younger men have never seen. He asked for the palm.`; } },
          { label: () => 'Keep both, and go home', go: 'end', run: (t, id) => { t.end = 'quiet'; const n = taleCoin(id, 55); taleCheer(-3); return `The purse, and what a bronze-founder gives for the palm: <b class="gold num">${n}</b> denarii. Somewhere behind you an old man is still sweeping.`; } },
        ] },
      { mark: 'The old arena', title: 'The seventh bout',
        text: t => `Hirpus takes the palm in both hands and cannot speak for a little. Then he is all business. The seventh bout must be fought out before the games can be closed: two of your men, on his sand, with him in the editor's box${t.asked ? ', one for Sagaris and one for the man whose name he has lost' : ''}. There will be no crowd. He does not seem to think that matters.`,
        opts: [
          { label: () => 'Let them fight it in earnest, with wooden swords', go: 'end', run: t => { t.end = 'held'; const men = fieldParty().slice(0, 2); men.forEach(g => { g.xp = (g.xp || 0) + 4; g.fatigue = clamp(g.fatigue + 18, 0, 100); }); G.fame += 3; return `${men.length > 1 ? `<b>${men[0].name}</b> and <b>${men[1].name}</b>` : 'Your men'} fight it as if the stands were full, and Hirpus gives the thumb as if forty thousand were waiting on it. He awards the palm, takes it back, and declares the games closed. Both men have learned something. It gets about. Fame +3.`; } },
          { label: () => 'Give him a show: all of them, the whole pageant', go: 'end', run: t => { t.end = 'held'; taleCheer(9); taleTire(8); G.fame += 2; return 'The entry, the salute, the pairs, the lot, for an audience of one old man and some lizards. Your men have never enjoyed anything so much. He weeps without shame through the whole of it, and closes the games at dusk. Fame +2.'; } },
          { label: t => t.purse === 'his' ? 'One bout; and the purse is his, to keep the place' : 'One bout, and leave him something to keep the place', go: 'end', run: t => { t.end = 'held'; if (t.purse !== 'his') G.denarii -= Math.min(Math.max(0, G.denarii), 30); favor('magistrate', 3); G.fame += 4; return `It is fought, and judged, and closed. ${t.purse === 'his' ? 'He will not take the purse for himself; he takes it for the arena.' : 'You leave him thirty denarii, for brooms.'} A swept arena is somewhere a town might one day hold games again, and the Magistrate, when he hears of it, sends a man to look. Fame +4, Magistrate favour +3.`; } },
        ] },
    ] },

  // ---- the shepherds' fold, and the wolf stone ----
  whitewolf: { name: 'The wolf that lies down with the sheep',
    lore: { dog: { "The shepherds' fold": 'The flocks are counted in at night by an old white dog.', 'The wolf stone': 'There is a grave at the foot of it. Flowers are left there now.' },
      left: { 'The wolf stone': 'An old white dog sleeps at the foot of it, on a grave.' }, killed: { 'The wolf stone': 'Carved by no one living. A white pelt was taken here.' } },
    steps: [
      { mark: "The shepherds' fold", who: 'The shepherds', title: 'The wolf that lies down with the sheep',
        text: () => `The shepherds have all come in to the fold, which they do not do in summer, and none of them wants to be the one to say it. In the end it is the youngest. Every night for a month a white wolf has come over the wall, walked through the flock, and lain down in the middle of it until dawn. It has not touched a lamb. The ewes get up and follow it to the gate when it goes. "Wolves that kill, we know," says the boy. "It goes back up to the wolf stone. We want it dead before we find out what it is."`,
        opts: [
          { label: () => 'Go up to the wolf stone', run: () => 'They give you a cheese, and stand at the wall to watch you out of sight.' },
          { label: () => 'Wait in the fold tonight, and see it', run: t => { t.seen = true; taleTire(6); return 'It comes at moonrise, as they said: big, white, lame in the off hind leg. It counts the flock, or looks as if it does; and it turns its head when one of the shepherds coughs, as an animal does that knows the sound. At dawn it goes up the hill to the wolf stone, and you go after it.'; } },
          { label: () => 'It is no business of ours', go: 'wait', run: () => 'They look at one another. Nobody had another plan.' },
        ] },
      { mark: 'The wolf stone', danger: true, title: 'At the foot of the stone',
        text: t => `It is lying at the foot of the wolf stone, on a long low mound with a shepherd's crook stuck in the head of it, and it does not get up. It is not a wolf${t.seen ? ', as you had begun to think' : ''}. It is a dog: one of the great white fold-dogs, gone grey at the muzzle and wild in the coat, with a collar worn to a string. Old Mato, who kept this hill, died in the spring. They buried him up here and said that his dog had run off the same night.`,
        opts: [
          { label: () => 'Bring him down to the fold on a rope', go: 'end', run: (t, id) => { t.end = 'dog'; const n = taleCoin(id, 20); taleCheer(6); return `He comes, once it is clear the sheep are where you are going. The shepherds are ashamed of themselves in a body, and then, being shepherds, very pleased to have the best dog on the hill back for nothing. They give <b class="gold num">${n}</b> denarii and a fleece. He goes up to the stone every evening all the same, and is back by the counting.`; } },
          { label: () => 'Leave him where he is, and tell them', go: 'end', run: t => { t.end = 'left'; favor('temple', 3); G.fame += 2; return 'You leave your bread on the mound. The shepherds hear it out in silence; that night they leave the gate of the fold open, and a bowl by it. Fame +2, and the priests of Mars, who keep count of such things, are told: temple favour +3.'; } },
          { label: () => 'They asked for a white pelt', ok: canFightNow, go: 'end', run: (t, id) => { const tr = Math.min(3, taleTier(id)); return wildFight('The white dog of the wolf stone', [questBeast('wolf', tr, 'The white dog', 1.5)], 'rock', 'tale', { tier: tr, day: true }); },
            won: (t, id) => { t.end = 'killed'; const n = taleCoin(id, 32); taleCheer(-6); return `He would not leave the mound, so it was done there. The shepherds pay what they promised, <b class="gold num">${n}</b> denarii, and one of the older ones looks at the collar for a long time and then puts it in his shirt. Your men are sick of the whole business.`; } },
        ] },
    ] },

  // ---- the broken aqueduct, and the great waterfall ----
  surveyor: { name: "The surveyor's mark",
    lore: { found: { 'The broken aqueduct': 'There are masons\' pegs along it. The governor has been asked for the money.', 'The great waterfall': 'Behind the fall there is a mark cut by the men who built the aqueduct.' },
      guessed: { 'The broken aqueduct': 'There are masons\' pegs along it, in slightly the wrong places.' }, shared: { 'The great waterfall': 'There are men behind the fall who would rather not be visited.' } },
    steps: [
      { mark: 'The broken aqueduct', who: 'A man with a levelling-staff', title: "The surveyor's mark",
        text: () => `A thin man is walking the broken aqueduct with a levelling-staff, talking to himself in numbers. <b>Strabo the surveyor</b> has been at it a year, on his own money. "It can be mended. Eleven arches, no more. But the governor will not pay to rebuild a channel unless I can show him the fall from the source, and the men who built it cut their datum on the rock behind the great waterfall, and I am fifty-eight and cannot swim. One number. It will be cut in the rock at about the height of a man's eyes."`,
        opts: [
          { label: () => 'Go and read it for him', run: () => 'He writes out for you what the mark will look like, and what it will not, and what to do if there are two.' },
          { label: () => 'Ask what is in it for the school', run: t => { t.paid = true; return 'He had not thought. Then he has it: the men who mend an aqueduct are the Guild\'s men, and the Guild remembers who found it work. He writes out what the mark will look like.'; } },
          { label: () => 'It is no business of ours', go: 'wait', run: () => 'He is back among his numbers before you have turned round.' },
        ] },
      { mark: 'The great waterfall', danger: true, title: 'Behind the fall',
        text: (t, id, c) => `There is a ledge behind the water, and a dry cave, as he said. There is also a fire in it, and bales, and jars with no tax-seal, and the men they belong to: smugglers, who run goods up the river by night and have used this cave since before Strabo could count. The surveyors' mark is on the back wall, behind their stores. <span class="bad">${skulls(taleTier(id))}</span>${sizeUp(c, () => { const tr = taleTier(id); return [questBoss(tr, 'The smugglers\' captain', { tactic: 'balanced' })].concat(wildMen(tr, Math.max(1, wildCount(tr) - 2))); })}`,
        opts: [
          { label: () => 'Clear them out', ok: canFightNow, go: 'end', run: (t, id) => { const tr = taleTier(id); return wildFight('Smugglers behind the fall', [questBoss(tr, 'The smugglers\' captain', { tactic: 'balanced' })].concat(wildMen(tr, Math.max(1, wildCount(tr) - 2))), 'rock', 'tale', { tier: tr, day: true }); },
            won: (t, id) => { t.end = 'found'; const n = taleCoin(id, 40); favor('guild', t.paid ? 8 : 6); favor('magistrate', 3); return `The mark is where he said, at the height of a man's eyes: a line, a numeral, and a mason's initials six generations old. What the smugglers leave behind is worth <b class="gold num">${n}</b> denarii. Strabo has his number, the governor his reason, and the Guild a year's work for its masons. Guild favour +${t.paid ? 8 : 6}, Magistrate +3.`; } },
          { label: () => 'Pay to be let through to the back wall (40 denarii)', ok: () => G.denarii >= 40, go: 'end', run: t => { G.denarii -= 40; t.end = 'found'; favor('guild', t.paid ? 7 : 5); G.fame += 1; return `They think it the funniest thing that has happened in the cave: a lanista paying toll to read a number off a rock. They even hold the torch. Strabo has his number. Guild favour +${t.paid ? 7 : 5}.`; } },
          { label: () => 'Go back and give him a likely number', go: 'end', run: (t, id) => {
            if (chance(clamp(0.3 + bestWits() * 0.03, 0.3, 0.8))) { t.end = 'guessed'; favor('guild', 3); return 'Your sharpest man paces the fall from the top, counts on his fingers, and names a figure. Strabo frowns at it, works it three ways, and finds to his delight that it agrees with his own. It may even be right. Guild favour +3.'; }
            t.end = 'shared'; favor('guild', -2); return 'He knows it for a guess before you have finished saying it; a man does not walk an aqueduct for a year without knowing what the number ought to be near. He thanks you, quite politely, and goes back to his staff. Guild favour -2.'; } },
        ] },
    ] },

  // ---- the villa, and the salt pans ----
  cook: { name: "The lady's cook",
    lore: { free: { 'A villa in its garden': 'The lady keeps a new cook, and buys her fish sauce by the jar.', 'The salt pans': 'A freedman makes the best garum in the province here, and signs every jar.' },
      taken: { 'A villa in its garden': 'The cook is back in the kitchen. The dinners are not what they were.' }, jar: { 'The salt pans': 'A runaway cook makes garum here, under another name.' } },
    steps: [
      { mark: 'A villa in its garden', who: 'The lady of the villa', title: "The lady's cook",
        text: () => `The lady of the villa receives you in the garden, since gladiators are not brought indoors. <b>Domitia</b> has the governor to dinner in nine days, and no cook. "Syrus. Thirty years in my kitchen. He walked out at the new moon with his knives and the receipt for his fish sauce, which is the only reason anybody of consequence dines here, and he is at the salt pans, I am told, making it for anyone with a copper. Bring me back my cook."`,
        opts: [
          { label: () => 'Go to the salt pans', run: () => 'She has a slave give your men a meal in the yard, cold, which tells you what the kitchen has come to.' },
          { label: () => 'Ask why he left', run: t => { t.asked = true; return '"I cannot imagine," she says, and for a moment looks as if she can. You are fed in the yard, cold, and sent on your way.'; } },
          { label: () => 'It is no business of ours', go: 'wait', run: () => 'She has already turned back to her roses.' },
        ] },
      { mark: 'The salt pans', title: 'The best garum in the province',
        text: t => `You could find him with your eyes shut: a row of vats in the sun, and a smell like the bottom of the sea. <b>Syrus</b> is a small bald man with a ladle, and entirely at his ease. "She freed me eleven years ago. In front of witnesses, at the Saturnalia, when the sauce was good. She has never given me the paper${t.asked ? ', and she knows it' : ''}. No paper, no wages: I am a freedman who is fed like a slave. Here I am paid by the jar. Tell her she may have a cook, or a paper, and that I should think the governor would rather she had both."`,
        opts: [
          { label: () => 'Carry his terms to her', go: 'end', run: (t, id) => { t.end = 'free'; const n = taleCoin(id, 24); favor('guild', 3); return `She signs. It takes her a day and a broken wine-cup to do it, and she will not have him back in the house after: but the governor dines on a jar of the real thing, bought at the salt pans at the proper price, and you are paid <b class="gold num">${n}</b> denarii for a deal well made. The Guild likes a man who signs his jars. Guild favour +3.`; } },
          { label: () => 'She said to bring him. Bring him', go: 'end', run: (t, id) => { t.end = 'taken'; const n = taleCoin(id, 34); favor('magistrate', -2); taleCheer(-3); return `He does not struggle. He packs his knives. Domitia pays <b class="gold num">${n}</b> denarii and is gracious about it. The governor's dinner is said afterwards to have been correct in every particular, and the fish sauce quite without flavour; and there were eleven witnesses at that Saturnalia, some of whom talk. Magistrate favour -2.`; } },
          { label: () => 'Buy a jar for the lady, and say he could not be found (25 denarii)', ok: () => G.denarii >= 25, go: 'end', run: (t, id) => { G.denarii -= 25; t.end = 'jar'; const n = taleCoin(id, 26); taleCheer(4); return `He seals it himself and will take no more than the price. Domitia does not believe a word of it, tastes the sauce, and decides to. She pays <b class="gold num">${n}</b> denarii for the errand. There is a second jar in the baggage that nobody paid for, and the men's porridge is the better for it all week.`; } },
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
