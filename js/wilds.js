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
  return (wildLandCache = { t, reach, sites });
}
const wildTile = (x, y) => { const tx = Math.floor(x / 10), ty = Math.floor(y / 10); return tx < 0 || ty < 0 || tx >= WILD.TW || ty >= WILD.TH ? T_PEAK : wildLand().t[ty * WILD.TW + tx]; };
const wildWalk = (x, y) => wildTile(x, y) < T_WATER;
const wildPace = (x, y) => { const k = wildTile(x, y); return k === T_ROAD || k === T_BRIDGE ? 1.25 : k === T_FOREST || k === T_HILL ? 0.7 : k === T_MARSH ? 0.55 : 1; };
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
  if (wildSiteCache && wildSiteCache.seed === M.seed) return wildSiteCache.list;
  const rnd = wildRng(M.seed), deck = SITE_DECK.slice();
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const list = wildLand().sites.map((s, i) => {
    const x = s.tx * 10 + 5, y = s.ty * 10 + 5, tier = wildTier(x, y), kind = deck[i % deck.length], n = SITE_NAMES[kind];
    return { id: 's' + i, kind, x, y, tier, name: Array.isArray(n) ? n[tier - 1] : n };
  });
  for (const f of WILD_FIXED) list.push({ id: f.id, kind: f.kind, x: f.tx * 10 + 5, y: f.ty * 10 + 5, tier: wildTier(f.tx * 10, f.ty * 10), name: f.name, fixed: true });
  wildSiteCache = { seed: M.seed, list };
  return list;
}
const siteById = id => wildSites().find(s => s.id === id) || null;
const siteDone = s => !!wildMap().done[s.id];
// Is there anything to do here now? The fixed places wait for their moment: a fighter's journey, a clue followed.
function siteLive(s) {
  if (siteDone(s)) return false;
  const M = wildMap();
  if (QUEST_SITE[s.kind]) return !!questAt(s);
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
  const M = wildMap(), F = WILD.FOG, r = WILD.SEE;
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
function wildFight(title, foes, backdrop, win, o) {
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
  const M = wildMap(), k = key || Object.keys(RELICS).find(r => !M.relics.includes(r) && r !== 'crest' && r !== 'vambrace');
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
function siteFinish(sid) { const M = wildMap(); if (sid && !M.done[sid]) { M.done[sid] = G.day; M.cleared++; delete M.marks[sid]; } }

// What winning a fight in the wild brings. Each returns the lines of the report.
const WILD_WINS = {
  lair(F) {
    const s = siteById(F.sid), c = coinFor(22, s.tier), f = 2 * s.tier, lines = [`The hides and teeth will fetch <b class="gold num">${c}</b> denarii. Word of it is worth <b class="num">+${f}</b> fame.`];
    G.denarii += c; G.fame += f; learn('beastslayer', 0.35, lines); siteFinish(s.id);
    return lines;
  },
  camp(F) {
    const s = siteById(F.sid), c = coinFor(55, s.tier), lines = [`Their plunder comes to <b class="gold num">${c}</b> denarii. The Magistrate pays for outlaws' heads, and the Guild's carters will sleep easier.`];
    G.denarii += c; favor('magistrate', 2 + s.tier); favor('guild', 2); G.fame += 3 * s.tier;
    if (chance(0.3 + 0.1 * s.tier)) { const it = wildGear(s.tier); lines.push(`In the leader's tent: ${itemName(it)}, now in your armoury.`); }
    learn('reaver', 0.3, lines); siteFinish(s.id);
    const M = wildMap();
    if (!M.chain.word && s.tier >= 2) { M.chain.word = 1; wildMark('cacheB', 'dig'); lines.push('<span class="gold">One of them, dying, buys a drink of water with a secret: where the band buried its strongbox, by the lower river road. It is marked on your map.</span>'); }
    return lines;
  },
  guardians(F) {                         // whatever was woken in a tomb
    const s = siteById(F.sid), lines = ruinLoot(s, 1.6);
    siteFinish(s.id);
    return lines;
  },
  pack(F) { const c = coinFor(8, F.tier), lines = [F.beasts ? `Pelts worth <b class="gold num">${c}</b> denarii.` : `Their purses hold <b class="gold num">${c}</b> denarii.`]; G.denarii += c; G.fame += F.tier; return lines; },
  slavers(F) {
    const g = byId(F.g); siteFinish('slavers');
    if (g && g.quest) raiseEvent('questVillage', { g: g.id, cost: 80 + tier() * 70 });
    return ['The camp is ash.'];
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
    lines.push(...WILD_WINS[F.win](F));
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
const questAt = s => G.roster.find(g => g.quest && g.quest.id === QUEST_SITE[s.kind] && !g.away) || null;

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
    text: c => `<b>${site(c).name}</b> <span class="bad">${skulls(site(c).tier)}</span>. The mules will not go nearer. Whatever lives here has been taking sheep, and lately shepherds. Every fit man you have would go in together; yours come to strength <b class="num">${yours()}</b>. It will take the day.`,
    opts: [
      { label: () => 'Go in after them', ok: canFightNow, run: c => { const s = site(c); return wildFight(s.name, wildBeasts(s.tier), s.tier >= 3 ? 'rock' : 'forest', 'lair', { sid: s.id, day: true }); } },
      leaveIt,
    ],
  },
  wCamp: {
    title: 'Smoke over the trees', can: wildCan('camp'), make: wildMake('camp'),
    text: c => `<b>${site(c).name}</b> <span class="bad">${skulls(site(c).tier)}</span>. About ${['two', 'three', 'five', 'six', 'eight'][site(c).tier - 1]} armed men, a lookout who has already seen you, and no way to talk. Your fit men come to strength <b class="num">${yours()}</b>. It will take the day.`,
    opts: [
      { label: () => 'Storm it', ok: canFightNow, run: c => { const s = site(c); return wildFight(s.name, wildMen(s.tier, wildCount(s.tier)), 'camp', 'camp', { sid: s.id, day: true }); } },
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
    text: c => `A valley full of long grass and, under the grass, bones. Somebody is still working it for what the dead carried: a band of scavengers, <span class="bad">${skulls(site(c).tier)}</span>, about six, who do not want company. Your fit men come to strength <b class="num">${yours()}</b>. It will take the day.`,
    opts: [
      { label: () => 'Drive them off the dead', ok: canFightNow, run: c => wildFight('The field of the Seventeenth', wildMen(4, 6), 'ruin', 'battlefield', { sid: 'battlefield', day: true }) },
      leaveIt,
    ],
  },
  wChief: {
    title: 'One-Eye\'s stockade', can: wildCan('chief'), make: wildMake('chief'),
    text: () => `A log wall on an island in the mere, a causeway, and on the gate-tower a big man in a centurion's transverse crest, watching you count his men. There are eight of them, and him. <span class="bad">${skulls(5)}</span> Your fit men come to strength <b class="num">${yours()}</b>. It will take the day.`,
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
    text: () => `A green mound the size of a temple at the end of the fell road, ringed with stones, and men among the stones: the hill-king's grandsons, who have guarded this door all their lives, and the beasts they keep for it. Nine in all. <span class="bad">${skulls(5)}</span> Your fit men come to strength <b class="num">${yours()}</b>. Nothing in the province will be harder. It will take the day.`,
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
    title: 'What he came for', can: () => !!G.field && wildSites().some(s => QUEST_SITE[s.kind] && questAt(s)),
    make: () => { const s = wildSites().find(x => QUEST_SITE[x.kind] && questAt(x)); return { sid: s.id, g: questAt(s).id }; },
    text: c => {
      const g = byId(c.g), k = site(c).kind;
      if (!g) return 'There is nothing here for you now.';
      return {
        quarry: `The quarries: a white wound in the hill, gangs of grey men, overseers with whips. <b>${g.name}</b> has not taken his eyes off the gate since it came in sight. His brother is in there. It will take the day to find out the price.`,
        slavers: `The camp is where the trail said: a dozen tents, a horse line, and the captain who burned <b>${g.name}</b>'s village grown fat by his fire. There are about five of them under arms <span class="bad">${skulls(3)}</span>. ${g.name} is already loosening his sword. Your fit men come to strength <b class="num">${yours()}</b>. It will take the day.`,
        vow: `The shrine of <b>${g.name}</b>'s people, on a headland over the sea, smaller than he had been told. He has carried his offering from the day he first went onto the sand. The vigil will take the day.`,
        master: `Beehives, a patch of beans, and an old man who watches <b>${g.name}</b> walk up the path and says, before anyone has spoken, "Your weight is on the wrong foot." It will take the day to be let in the door.`,
      }[k];
    },
    opts: [
      { label: () => 'Go with him', ok: c => site(c).kind !== 'slavers' || canFightNow(), run: c => {
        const g = byId(c.g), s = site(c), cost = 80 + tier() * 70;
        if (!g || !g.quest) return 'He is not here to see it.';
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
for (const id in WILD_EVENTS) Object.assign(WILD_EVENTS[id], { auto: true, wild: true });
Object.assign(EVENTS, WILD_EVENTS);

const SITE_EVENT = { lair: 'wLair', camp: 'wCamp', ruin: 'wRuin', shrine: 'wShrine', hermit: 'wHermit', hamlet: 'wHamlet', healer: 'wHealer', merchant: 'wMerchant', cache: 'wCache', herb: 'wHerb',
  deserter: 'wDeserter', battlefield: 'wBattlefield', chief: 'wChief', barrow: 'wBarrow', quarry: 'wJourney', slavers: 'wJourney', vow: 'wJourney', master: 'wJourney' };
// Raises whatever is found at a place. Called by the map when the school walks up to it.
function wildVisit(s) {
  if (!siteLive(s) || G.pendingEvent) return false;
  const id = SITE_EVENT[s.kind], c = EVENTS[id].make();
  c.sid = s.id;
  if (id === 'wJourney') c.g = questAt(s).id;
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
  const r = Math.random(), id = r < 0.4 ? 'wAmbush' : r < 0.7 ? 'wTraveller' : 'wFind';
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
