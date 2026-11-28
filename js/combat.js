'use strict';
// Real-time auto-battle simulation and its pixel-art rendering.
// Coordinates are in a 320x180 space; the canvas is drawn at 3x.

const ARENA = { x0: 12, x1: 201, y0: 54, y1: 112 };
const TEAM_COL = ['#c23b2e', '#2f6db8'];
const TEAM_DARK = ['#7e241c', '#1d4577'];
const SCALE = 4;   // canvas pixels per interface unit (HUD, text)
const FINE = 3;    // canvas pixels per sprite pixel
const WORLD = 6;   // canvas pixels per world unit (two sprite pixels)
const Z = WORLD / SCALE;

// one look per arena tier, from a village palisade to the imperial amphitheatre
const THEMES = [
  { stands: '#2e2a22', step: '#25211b', wall: '#7a5a34', wallTop: '#94703f', wallLine: '#5e4426', sand: '#cfae6f', crowd: 0.35, planks: true },
  { stands: '#35261f', step: '#2a1d18', wall: '#a88f66', wallTop: '#c4ab7c', wallLine: '#8f7650', sand: '#d9b877', crowd: 0.7 },
  { stands: '#35261f', step: '#2a1d18', wall: '#b89b6e', wallTop: '#d8c08e', wallLine: '#a3875c', sand: '#d9b877', crowd: 1, banners: true },
  { stands: '#3a2c26', step: '#2e221d', wall: '#d6ccb8', wallTop: '#f0e8d6', wallLine: '#b5aa94', sand: '#e0c283', crowd: 1, banners: true, awning: true },
  { stands: '#3a2c26', step: '#2e221d', wall: '#d6ccb8', wallTop: '#f0e8d6', wallLine: '#b5aa94', sand: '#e0c283', crowd: 1, banners: true, awning: true, box: true },
];

const out = f => f.down || f.yielded;
// Queues a sound for the page to play: its name, its strength, where across the sand it happens (-1 left to 1 right), and its kind.
function snd(B, n, v, at, kind) { if (B.snd.length < 40) B.snd.push([n, v || 1, at ? (at.x - (ARENA.x0 + ARENA.x1) / 2) / (ARENA.x1 - ARENA.x0) * 1.5 : 0, kind || '']); }

function makeFighter(g, team, i, n, fld) {
  fld = fld || ARENA;
  const c = CLASSES[g.cls] || BEASTS[g.cls], s = g.stats, T = g.tactic || 'balanced';
  const has = t => g.traits.includes(t);
  const mh = maxHp(g);
  const gs = gearStats(g);
  // three skills: Strength is the weight of a blow, Agility its speed and his feet, Skill his aim and his guard
  let dmg = c.dmg + s.str * 0.38 + gs.dmg;
  let atk = c.atkTime * (1.15 - s.agi * 0.012);
  let dodge = c.dodge + s.agi * 0.0065 + gs.dodge;
  let block = c.shield ? c.block + s.skl * 0.0095 + gs.block : 0;
  let acc = 0.80 + s.skl * 0.0085, crit = (c.crit || 0.05) + s.skl * 0.006;
  let show = 1;
  if (T === 'aggressive') { dmg *= 1.1; atk *= 0.9; dodge *= 0.7; block *= 0.7; }
  if (T === 'defensive') { dmg *= 0.9; atk *= 1.1; dodge *= 1.3; block *= 1.3; }
  if (T === 'showman') { atk *= 1.08; show = 1.5; }
  if (has('brute')) { dmg *= 1.12; dodge -= 0.04; }
  if (has('quick')) atk *= 0.9;
  if (has('keen')) crit += 0.06;
  if (has('nervous')) acc -= 0.05;
  if (has('showy')) show *= 1.4;
  if (has('laureate')) show *= 1.5;
  if (has('embittered')) dmg *= 0.92;
  if (has('guarded')) { dodge += 0.05; if (c.shield) block += 0.05; }
  if (has('watchful')) { dodge += 0.03; if (c.shield) block += 0.03; }
  if (has('oldschool')) acc += 0.05;
  if (has('bloodoath')) dmg *= 1.08;
  if (has('twoshares')) { dmg *= 1.04; acc += 0.03; }
  if (has('provider')) { dodge += 0.03; crit += 0.03; }
  if (has('pitfighter') && n === 1) dmg *= 1.08;
  if (has('reaver') && fld.wild) dmg *= 1.1;
  if (has('eaglesworn')) dmg *= 1.05;
  let reach = c.reach, moveK = 1, resist = 0, stunK = 0, armorK = 0;
  if (has('duelist') && n === 1) { dmg *= 1.1; dodge += 0.04; }
  if (has('shieldmate') && n > 1) { dmg *= 1.08; resist = 0.08; }
  if (has('fleet')) { moveK = 1.15; dodge += 0.03; }
  if (has('ironwill')) stunK = 0.3;
  if (has('testudo')) { if (c.shield) block += 0.08; armorK = 1; }
  if (has('longreach')) { reach += 3; dmg *= 1.06; }
  if (has('twinfury')) { atk *= 0.92; crit += 0.05; }
  dmg *= 0.94 + g.morale / 1000;
  if (g.whet) dmg *= 1.1;                      // ground and reset between the rounds of a tournament
  return {
    g, c, team, tactic: T,
    // a line down the field; in a crowd they stand three deep, so that nine a side have room
    x: team === 0 ? 14 : 199, markX: (team === 0 ? 60 : 153) + (n > 5 ? (i % 3) * 11 : n > 3 && i % 2 ? 9 : 0) * (team ? 1 : -1),
    y: (fld.y0 + fld.y1) / 2 + (i - (n - 1) / 2) * Math.min(26, (fld.y1 - fld.y0 - 2) / Math.max(1, n - 1)),
    hp: Math.min(g.hp, mh), maxHp: mh,
    dmg, atkTime: Math.max(0.35, atk), dodge: Math.max(0, dodge), block, acc, crit, show, critMult: has('killer') ? 2.1 : 1.7,
    armor: c.armor + gs.armor + (has('thickskin') ? 2 : 0) + armorK, reach,
    resist, stunRes: Math.min(0.8, gs.stunRes + stunK), critRes: gs.critRes, bleedRes: gs.bleedRes, hamRes: gs.hamRes, armRes: gs.armRes,
    speed: 26 * c.speed * (1 + s.agi * 0.011) * gs.speed * moveK,
    // the charge that fills as he fights: full, it is spent on one of the abilities he carries (abilities.js)
    charge: has('opener') ? 50 : 0, chargeRate: (has('ironlungs') ? 1.25 : 1) * (1 - g.fatigue / 250), abl: abilitiesOf(g), casts: 0,
    style: styleOf(g), buff: null, weakT: 0, weakAmt: 0,
    tall: g.beast ? BEAST_ART[g.cls].lh + BEAST_ART[g.cls].bh + 9 : 45,
    cd: 0.4 + Math.random() * 0.6, state: 'ready', t: 0, move: null,
    target: null, retarget: 0, circle: chance(0.5) ? 1 : -1,
    facing: team === 0 ? 1 : -1, snare: 0, stun: 0, kx: 0, flash: 0, atkAnim: 0, slash: 0,
    walk: Math.random() * 10, moving: false,
    bleed: 0, bleedT: 0, bleedBy: null, drip: 0, hamstrung: false, armWound: false,
    fallT: 0, guard: 0, hate: null, down: false, yielded: false, fate: null, dmgDealt: 0, dmgTaken: 0, best: 0, used: {}, downedBy: null,
    // reading the other man: feints, ripostes, and what the fight has done to his kit
    feintP: g.beast ? 0 : clamp(0.05 + s.skl * 0.009, 0, 0.3) * (T === 'showman' ? 1.3 : 1), feinted: false, open: 0, riposte: false,
    backT: 0, flankT: 0, flourish: 0, shieldHits: 0, noHelm: false,
  };
}

function createBattle(teamA, teamB, opts) {
  opts = opts || {};
  const B = {
    fighters: [], time: 0, over: false, winner: -1, outro: 0, outroEnd: 2,
    exc: 0.15, excSum: 0, death: !!opts.death, hunt: !!opts.hunt, mercy: opts.mercy || [0, 0],
    hitstop: 0, shake: 0, slowmo: 0, clock: 0, flashT: 0,
    light: opts.light || (opts.death ? 'dusk' : 'day'),          // bouts to the death are fought as the sun goes down
    intro: opts.noIntro ? 0 : 4.6, introDur: 4.6,
    theme: THEMES[clamp(opts.tier || 0, 0, 4)], names: opts.names || null, snd: [],
    col: [TEAM_COL[0], opts.foeCol || TEAM_COL[1]], colD: [TEAM_DARK[0], opts.foeColD || TEAM_DARK[1]],
    parts: [], stains: [], scuffs: [], texts: [], projs: [], feed: [], log: [], crowd: [], specks: [], props: [], vfx: [],
    towel: false, lastDown: null, finish: null,
    ask: !!opts.ask, pick: null,                  // ask: stop the fight when one of the player's men is charged, and let him choose (pick is who is waiting)
    wild: opts.wild || null,                                     // a fight outside the walls: what stands behind it
    field: opts.wild ? { x0: 12, x1: 201, y0: 42, y1: 113, wild: true } : ARENA,
  };
  teamA.forEach((g, i) => B.fighters.push(makeFighter(g, 0, i, teamA.length, B.field)));
  teamB.forEach((g, i) => B.fighters.push(makeFighter(g, 1, i, teamB.length, B.field)));
  if (!B.intro) B.fighters.forEach(f => { f.x = f.markX; });
  const cols = ['#e8d7b0', '#b8452e', '#d9a441', '#6f8fb5', '#8a6a4a', '#c9c2b2', '#7a4a6a', '#5f7a4a'];
  const hairs = ['#2a1c14', '#15100d', '#5a3a22', '#8a5a2a', '#b5842d', '#c9c2b2'];
  // spectators and sand specks are placed in sprite pixels (428x240)
  for (let y = 22, r = 0; y <= 64; y += 9, r++) {
    for (let x = 2 + (r % 2) * 3; x < 424; x += 6) {
      if (B.wild || Math.random() >= B.theme.crowd) continue;
      if (B.theme.box ? x > 164 && x < 258 && y > 20 : x > 184 && x < 240 && y > 31) continue;      // the editor's box
      if (ARENA_AISLES.some(a => x + 5 > a && x < a + 10)) continue;                                   // nobody sits on the stairs
      const far = 1 - (64 - y) / 42 * 0.3, col0 = pick(cols), skin0 = pick(ORIGINS).skin, col = shade(col0, far), skin = shade(skin0, far);      // the rows further up are further off, and dimmer
      const look = Math.random();
      // (the shaded side of each is worked out from the colour he began as: a shade of a shade comes out black)
      B.crowd.push({ x: x + rint(-1, 1), y, col, colD: shade(col0, far * 0.7), skin, skinD: shade(skin0, far * 0.78), hair: shade(pick(hairs), far), ph: rand(0, 6.28), sp: rand(3, 9), arms: chance(0.5),
        hat: look < 0.12, veil: look >= 0.12 && look < 0.26, long: look >= 0.26 && look < 0.45, small: look > 0.93 });
    }
  }
  for (let i = 0; i < 420; i++) B.specks.push({ x: rint(0, 426), y: rint(92, 239), w: rint(1, 3), c: chance(0.5) ? 0 : 1 });
  // friendships, rivalries and vows in the player's ludus change how his men fight (see sim.js)
  if (typeof applyStories === 'function' && typeof G !== 'undefined' && G && G.bonds) applyStories(B);
  return B;
}

// ---------- effects ----------

// Words written straight onto the sand, a crowd or a coloured card are given a dark edge all the way round, so that
// they can be read whatever is behind them. (Words on a plate of their own do not need it.)
const EDGE8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
function edgedText(ctx, str, x, y, col, d, edge) {
  ctx.fillStyle = edge || '#0c0704';
  for (const [ox, oy] of EDGE8) ctx.fillText(str, x + ox * d, y + oy * d);
  ctx.fillStyle = col; ctx.fillText(str, x, y);
}
// Every word that rises over a man on the sand comes through here. When someone is having the fight read to him
// (B.spoken is then a list: see a11y.js) the same word is kept, with the name of the man it rose over.
// Words and figures that rise over the sand. They are of four kinds, and each kind has its own place so that they do not
// lie on top of one another: what a blow took is thrown out beside the man it landed on, away from whoever struck him;
// what has befallen him (a wound, a net) and the great words (a yielding, a verdict) go up over his head, each new one
// above the last; and the small change of a fight (a miss, a feint) is said quietly beside the figures.
const FX_QUIET = { miss: 1, dodge: 1, feint: 1, 'reads it': 1, riposte: 1, 'net misses': 1, 'armour holds': 1, 'holds it': 1 };
function fxText(B, f, str, col, big) {
  str = String(str);
  if (B.spoken) B.spoken.push([f.g.beast ? 'The ' + f.c.name : f.g.name, str]);
  const fig = /^!?\d+$/.test(str), blk = /^block \d+$/.test(str), crit = fig && str[0] === '!';
  const kind = big ? 'big' : fig || blk ? 'fig' : FX_QUIET[str] ? 'quiet' : 'word';
  const t = { str: crit ? str.slice(1) : str, col, big: !!big, kind, crit, blk, h: big ? 6.5 : kind === 'word' ? 4 : kind === 'quiet' ? 3.4 : crit ? 6 : 4.6 };
  t.life = t.life0 = big ? 1.6 : kind === 'word' ? 1.15 : kind === 'quiet' ? 0.7 : crit ? 1.1 : 0.85;
  if (kind === 'fig' || kind === 'quiet') {
    const dir = -(f.facing || 1);                 // out behind him, the way the blow was going
    t.x = f.x + dir * (kind === 'quiet' ? 9 : 7); t.y = f.y - (kind === 'quiet' ? 22 : 17) + rand(-1.5, 1.5);
    t.vx = dir * rand(9, 15) * (crit ? 1.25 : 1); t.vy = kind === 'quiet' ? -9 : -rand(20, 27);
    for (let i = 0; i < 6; i++) if (B.texts.some(o => (o.kind === 'fig' || o.kind === 'quiet') && Math.abs(o.x - t.x) < 9 && Math.abs(o.y - t.y) < (o.h + t.h) / 2)) t.y -= t.h; else break;
  } else {
    t.x = f.x; t.y = f.y - 31; t.vx = 0; t.vy = -5.5;
    for (let i = 0; i < 8; i++) { const hit = B.texts.find(o => (o.kind === 'word' || o.kind === 'big') && Math.abs(o.x - t.x) < 22 && Math.abs(o.y - t.y) < (o.h + t.h) / 2); if (!hit) break; t.y = hit.y - (hit.h + t.h) / 2; }
  }
  B.texts.push(t);
}
// Blood is not all of a size: most of it is fine, some is heavy and falls short, and what a great blow throws goes far.
const BLOOD_COL = ['#8e1b14', '#b3261c', '#c22a1e', '#a01f17'];
function fxBlood(B, f, n, dir) {
  for (let i = 0; i < n; i++) {
    const s = chance(0.5) ? 1 : chance(0.72) ? 2 : 3, far = 1.25 - s * 0.2;
    B.parts.push({ x: f.x, y: f.y + rand(-2, 2), h: rand(8, 15), vx: (dir * rand(5, 44) + rand(-12, 12)) * far, vh: rand(10, 48) * far, col: pick(BLOOD_COL), s });
  }
}
// A pool of it, where a man lies or stands bleeding: it starts small and spreads to its size as the sand takes it.
function fxPool(B, x, y, r) { if (B.stains.length < 600) B.stains.push({ x, y, w: 1, t: B.clock, pool: r, seed: rand(0, 6.28) }); }
// The sand keeps what was done on it: the drag of heels where a man was driven back, the place where one fell.
function fxScuff(B, x, y, dir, len, wide) {
  const S = B.scuffs || (B.scuffs = []);
  if (S.length >= 140) S.shift();
  S.push({ x, y: y + rand(-0.6, 0.6), dir, len, wide: wide || 0, t: B.clock });
}
// What rises from under a man's feet is what he is standing on. On the sand of an arena, dust, and plenty of it. Where
// snow lies, snow. Where it is raining or the ground is wet from rain, no dust at all: drops of water, and mud. And out
// in the province, a little of the ground itself in its own colour (B._ground: renderWild keeps it), hardly any from
// grass and more from rock or the beaten earth of a camp. (c0, c1: the two colours of what is thrown; mid, lite: of
// what hangs, and its lightest; soft: the cloud at a foot, as r,g,b; amt: how much of it there is, 0 to 1; a: how
// thick the cloud. x, y are in sprite pixels.)
const DUST_SAND = { c0: '#c9a763', c1: '#ead2a0', mid: '#d6bb84', lite: '#ead2a0', soft: '234,210,160', amt: 1, a: 1 };
const DUST_SNOW = { c0: '#ffffff', c1: '#d3deec', mid: '#d3deec', lite: '#f4f8fd', soft: '250,252,255', amt: 1, a: 1.6 };
const DUST_WET = { c0: '#d6e4f2', c1: '#7d6238', mid: '#a9b8c8', lite: '#d6e4f2', soft: '196,210,224', amt: 0.6, a: 0.4 };
const WILD_DUST = { forest: ['#6f8a45', 0.3], ruin: ['#7f8a55', 0.45], rock: ['#8f8a78', 0.85], camp: ['#8a7650', 0.85] };
function fightDust(B, x, y) {
  if (fightSnow(B, x, y) > 0.45) return DUST_SNOW;
  if ((B.wet || 0) > 0.3) return DUST_WET;
  if (!B.wild || typeof mixHex !== 'function') return DUST_SAND;
  const W = WILD_DUST[B.wild] || WILD_DUST.forest, g = B._ground || W[0];
  if (!B._dust || B._dust.g !== g) { const s = mixHex(g, '#e6dcc0', 0.5); B._dust = { g, c0: mixHex(g, '#e6dcc0', 0.25), c1: mixHex(g, '#e6dcc0', 0.55), mid: mixHex(g, '#e6dcc0', 0.4), lite: mixHex(g, '#e6dcc0', 0.6), soft: [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)).join(','), amt: W[1], a: W[1] }; }
  return B._dust;
}
function fxDust(B, x, y, n) {
  const D = fightDust(B, x * 2, y * 2);
  for (let i = 0; i < n; i++) { if (D.amt < 1 && Math.random() > D.amt) continue; B.parts.push({ x: x + rand(-4, 4), y: y + rand(-1, 1), h: 1, vx: rand(-18, 18), vh: rand(8, 28), col: chance(0.5) ? D.c0 : D.c1, spark: true }); }
}
// A line of the telling of the fight. The last few are shown over the sand for a while; all of them are kept (B.log),
// with when they happened and what kind of thing they are, to be read back during the fight or after it.
function feedKind(str) {
  if (/dies|does not get up|too late for/.test(str)) return 'dead';
  if (/spares|still breathing|dragged clear/.test(str)) return 'spared';
  if (/struck down|is down|goes down|falls/.test(str)) return 'down';
  if (/yields|the cloth/.test(str)) return 'yield';
  if (/: /.test(str)) return 'ability';
  if (/hamstrings|vein|sword arm|helmet|nets |from behind/.test(str)) return 'wound';
  return 'note';
}
function feed(B, str, team, kind) {
  const e = { str, team, life: 6, t: B.time, kind: kind || feedKind(str) };
  B.feed.push(e); if (B.log) B.log.push(e);
  if (B.feed.length > 5) B.feed.shift();
  return e;
}

// ---------- resolution ----------

// Every kind of fighter kills in his own way, and the death screen shows it: the Murmillo's shield and the short thrust
// after it, the Thraex's hooked blade from behind, the Retiarius's net and trident, the Hoplomachus's spear from
// a length away, the Dimachaerus's two cuts crossing. Beasts have theirs too. `word` is what the crowd cries.
const FATALS = {
  murmillo:    { word: 'HOC HABET!',     how: 'IS CUT DOWN BEHIND THE SHIELD OF' },
  thraex:      { word: 'IUGULA!',        how: 'IS OPENED BY THE HOOKED BLADE OF' },
  retiarius:   { word: 'PERACTUM EST!',  how: 'IS NETTED AND SPEARED BY' },
  hoplomachus: { word: 'FERRUM RECIPE!', how: 'IS RUN THROUGH BY' },
  dimachaerus: { word: 'BIS HABET!',     how: 'IS CUT TWICE BY' },
  claw:        { word: 'AD BESTIAS!',    how: 'IS TORN DOWN BY' },
  wolf:        { word: 'AD BESTIAS!',    how: 'IS PULLED DOWN BY' },
  boar:        { word: 'AD BESTIAS!',    how: 'IS GORED BY' },
  none:        { word: 'HOC HABET!',     how: '' },
};
function fatalKind(by) {
  if (!by) return 'none';
  if (by.g.beast) return by.g.cls === 'wolf' ? 'wolf' : by.g.cls === 'boar' ? 'boar' : 'claw';
  return FATALS[by.g.cls] ? by.g.cls : 'murmillo';
}
// A man has been killed: everything stops, and the death is shown on its own (drawFatal). Only where the fight is being
// watched and such things are wanted (B.cutins), only for men, and in a crowd only for your own and for the first.
function fatal(B, d, by) {
  if (!B.cutins || B.fatal || d.g.beast) return;
  if (B.fighters.length > 6 && d.team !== 0 && B.fatalSeen) return;
  B.fatalSeen = true;
  B.fatal = { f: d, by: by && by !== d ? by : null, t: 0, dur: 3.1 };
  B.fatal.kind = fatalKind(B.fatal.by);
  snd(B, 'cutin', 0.8, d);
}
// What becomes of a man who is out of it: the crowd's thumb in the arena, the handlers' speed in a hunt, his friends'
// in the wild. Decided once, the moment it is asked.
function fateOf(B, f) {
  if (f.g.beast || (f.down && B.death)) return 'dead';
  const avg = B.time > 0 ? B.excSum / B.time : 0;
  const p = B.hunt ? clamp((B.wild && f.team === 0 ? 0.65 : 0.5) + B.mercy[f.team], 0, 0.9)
    : clamp((f.yielded ? 0.88 : 0.72) + 0.25 * avg + B.mercy[f.team] + Math.min(0.1, f.dmgDealt / 300) + (f.g.traits.includes('blessed') ? 0.1 : 0), 0, 0.98);
  return Math.random() < p ? 'spared' : 'dead';
}
// A man is spared: said at once.
function spare(B, f) {
  f.fate = 'spared'; f.revealed = true;
  fxText(B, f, B.wild ? 'LIVES' : B.hunt ? 'DRAGGED CLEAR' : 'MISSIO', '#ffffff', true); snd(B, 'spared', 1, f);
  feed(B, B.wild ? `${f.g.name} is still breathing` : B.hunt ? `${f.g.name} is dragged clear by the handlers` : `The crowd spares ${f.g.name}`, f.team);
}
// A man is killed: the blow, the blood, and (where such things are shown) the death itself.
function slay(B, f) {
  f.fate = 'dead'; f.revealed = true; f.killing = false;
  fxText(B, f, B.wild ? 'DEAD' : B.hunt ? 'MAULED' : 'IUGULA!', '#ff5a4a', true); snd(B, 'killed', 1, f); f.fallT = 0.3;
  feed(B, B.wild ? `${f.g.name} does not get up` : B.hunt ? `The handlers are too late for ${f.g.name}` : `Thumbs are turned: ${f.g.name} dies`, f.team);
  f.down = true; f.yielded = false; f.flash = 0.12; B.shake = 3;
  fxBlood(B, f, 14, -f.facing);
  for (let k = 0; k < 5; k++) B.stains.push({ x: f.x + rand(-8, 8), y: f.y + rand(-2, 3), w: rint(1, 3), t: B.clock });
  fxPool(B, f.x - f.facing * 3, f.y + 1, rand(6, 8));
  fatal(B, f, f.downedBy);
}
// The killing of a man is not left for the end of the fight, nor sprung on the eye: everything stops, the picture closes
// on him and on whoever stands over him (B.kill, see the camera in drawBattle), and then it is done and shown.
const KILL_ZOOM = 0.75;
function kill(B, f, done) {
  if (!B.cutins || f.g.beast || B.kill) { if (!done) slay(B, f); else fatal(B, f, f.downedBy); return; }
  f.killing = true;
  B.kill = { f, by: f.downedBy && f.downedBy !== f ? f.downedBy : null, t: 0, done: !!done };
}
// Out of it while his side fights on: he does not lie there unjudged until the last of them is down.
function verdictNow(B, f) {
  if (B.over || f.fate || f.killing || B.death) return;
  if (!B.fighters.some(o => o !== f && o.team === f.team && !out(o))) return;      // the last of his side: that is the end of the fight, and its own moment
  if (fateOf(B, f) === 'spared') spare(B, f); else kill(B, f);
}
function knockDown(B, d, a, how) {
  d.hp = 0; d.down = true; d.downedBy = a || d.downedBy; d.state = 'ready'; d.bleed = 0; B.lastDown = d;
  d.fallT = 0.35; snd(B, 'down', 1, d);
  B.exc += 0.2 * (a ? a.show : 1);
  B.hitstop = 0.12; B.shake = 3; B.flashT = 0.12;
  fxBlood(B, d, 16, a ? a.facing : 1);
  fxDust(B, d.x, d.y, 8);
  vfx(B, { k: 'puff', under: true, x: d.x, y: d.y, r: 10, n: 7, seed: rand(0, 6), dur: 0.7 });
  fxScuff(B, d.x, d.y, a ? a.facing : 1, 9, 1);
  for (let i = 0; i < 6; i++) B.stains.push({ x: d.x + rand(-8, 8), y: d.y + rand(-2, 3), w: rint(1, 3), t: B.clock });
  fxPool(B, d.x, d.y + 1, rand(4, 5.5));
  feed(B, how || `${d.g.name} is struck down${a ? ' by ' + a.g.name : ''}`, d.team);
  if (B.death) kill(B, d, true);          // in a bout to the death, down is dead
  else verdictNow(B, d);
}

function tryYield(B, d, a) {
  if (B.death || B.hunt || d.g.beast || d.g.traits.includes('lionheart')) return;
  let p = 0.3 + (60 - d.g.morale) / 200;
  if (d.g.traits.includes('nervous')) p += 0.2;
  if (d.tactic === 'aggressive') p -= 0.15;
  if (Math.random() >= clamp(p, 0.05, 0.8)) return;
  d.yielded = true; d.downedBy = a; d.state = 'ready'; d.snare = 0; B.lastDown = null;
  B.exc += 0.08; snd(B, 'yield');
  fxText(B, d, 'yields', '#ffffff', true);
  feed(B, `${d.g.name} raises a finger and yields`, d.team);
  verdictNow(B, d);
}

// ---------- the cloth ----------
// The one thing the player may still do from the rail: throw in the cloth, once, to make his worst-hurt
// man yield while he still can. Everything else he does by choosing abilities.
function canOrder(B, kind) {
  if (B.over || B.intro > 0 || kind !== 'yield') return false;
  return !B.death && !B.hunt && !B.towel && B.fighters.some(f => f.team === 0 && !out(f));
}
function giveOrder(B, kind) {
  if (!canOrder(B, kind)) return false;
  const f = B.fighters.filter(x => x.team === 0 && !out(x)).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  B.towel = true;
  if (f.g.traits.includes('lionheart')) { fxText(B, f, 'will not yield', '#ffd24a', true); feed(B, `${f.g.name} sees the cloth, and fights on`, 0); return true; }
  f.yielded = true; f.downedBy = f.target; f.state = 'ready'; f.snare = 0; B.lastDown = null;
  if (B.pick === f) B.pick = null;
  fxText(B, f, 'yields', '#ffffff', true); snd(B, 'yield');
  feed(B, `You throw in the cloth for ${f.g.name}`, 0);
  verdictNow(B, f);
  return true;
}

// A skilled man who has just turned a blow aside may answer it at once.
function tryRiposte(B, d) {
  if (d.g.beast || out(d) || d.state !== 'ready' || d.stun > 0.2) return;
  if (Math.random() >= clamp(d.g.stats.skl * 0.015, 0, 0.35) * (d.tactic === 'defensive' ? 1.4 : 1)) return;
  d.cd = Math.min(d.cd, 0.1); d.riposte = true;
  fxText(B, d, 'riposte', '#e8d7a0');
}

// o: {mult, unblockable, pierce, bleed, stun, kb, nocrit, nodge, crit, ham, ability}
function resolveAttack(B, a, d, o) {
  o = o || {};
  const ab = a.buff || {}, db = d.buff || {};
  // what the defender is dealing with: a feint that fooled him, a man at his back, his lanista's orders
  const flank = !d.g.beast && !a.g.beast && d.target && d.target !== a && !out(d.target) && Math.sign(a.x - d.x) === -d.facing;
  const wary = d.open > 0 ? 0.55 : 1;
  if (!o.ability) d.open = 0;
  if (!o.nodge && Math.random() > a.acc) { fxText(B, d, 'miss', '#cfc6b4'); snd(B, 'miss', 1, a); return 'miss'; }
  const dodge = (o.nodge || d.snare > 0 || d.stun > 0) ? 0 : (d.dodge + (db.dodge || 0)) * (d.hamstrung ? 0.5 : 1) * wary * (flank ? 0.6 : 1);
  if (Math.random() < dodge) {
    chargeUp(d, 5);
    d.kx = a.facing * 40;
    fxText(B, d, 'dodge', '#cfe0ff'); snd(B, 'dodge', 1, d);
    B.exc += 0.015 * d.show;
    tryRiposte(B, d);
    return 'dodge';
  }
  let dmg = a.dmg * (a.armWound ? 0.8 : 1) * (0.8 + Math.random() * 0.4) * (o.mult || 1);
  dmg *= styleEdge(a.style, d.style);                 // strength beats agility beats skill beats strength
  dmg *= (1 + (ab.dmg || 0)) * (a.weakT > 0 ? 1 - a.weakAmt : 1) * (1 - (db.dr || 0)) * (1 - (d.resist || 0));
  if (a.riposte) { dmg *= 1.15; a.riposte = false; }
  if (flank && !d.flankSaid) { d.flankSaid = true; feed(B, `${a.g.name} takes ${d.g.name} from behind`, a.team); }
  if (d.snare > 0) dmg *= 1.1;
  if (a.hate === d) dmg *= 1.15;        // a man facing the rival he has sworn to beat
  if (a.g.traits.includes('bloodthirsty') && d.hp < d.maxHp * 0.5) dmg *= 1.15;
  if (a.g.traits.includes('finisher') && d.hp < d.maxHp / 3) dmg *= 1.25;
  if (a.g.traits.includes('lionheart') && a.hp < a.maxHp * 0.35) dmg *= 1.2;
  if (d.g.beast && a.g.traits.includes('beastslayer')) dmg *= 1.2;
  const crit = !o.nocrit && (o.crit || Math.random() < Math.max(0.01, a.crit - d.critRes));
  if (crit) dmg *= a.critMult;
  let blocked = false;
  if (!o.unblockable && d.snare <= 0 && Math.random() < (d.block + (db.block || 0)) * wary * (flank ? 0.3 : 1) * (a.g.traits.includes('undershield') ? 0.67 : 1)) { blocked = true; dmg *= 0.25; }
  const armor = o.pierce ? 0 : d.armor * (blocked ? 0.5 : 1);
  dmg = Math.max(1, Math.round(dmg - armor));
  d.hp -= dmg;
  a.dmgDealt += dmg; d.dmgTaken += dmg; if (dmg > a.best) a.best = dmg;
  if (o.ability && a.ablEntry) {                // the line that named his ability now says what it did
    const e = a.ablEntry; e.dmg = (e.dmg || 0) + dmg; (e.who = e.who || {})[d.g.name] = 1;
    const who = Object.keys(e.who);
    e.str = `${e.base}: ${e.dmg} to ${who.length > 1 ? who.length + ' foes' : who[0]}${blocked ? ' (blocked)' : ''}`; e.life = Math.max(e.life, 4.5);
  } else if (!o.ability) {
    if (!B.firstBlood && !blocked) { B.firstBlood = true; feed(B, `First blood to ${a.g.name}`, a.team, 'hit'); snd(B, 'firstblood'); }
    else if (crit && !blocked && dmg >= d.maxHp * 0.12 && d.hp > 0) feed(B, `${a.g.name} lands a critical hit on ${d.g.name}: ${dmg}`, a.team, 'hit');
  }
  d.flash = 0.12;
  // blows fill the charge: more for landing one than for taking one, and nothing from an ability's own strokes
  if (!o.ability) chargeUp(a, blocked ? 4 : 9);
  chargeUp(d, blocked ? 6 : 5);
  d.kx = a.facing * (o.kb || (blocked ? 15 : 35)) * (crit ? 1.5 : 1);
  d.stun = Math.max(o.stun || 0, blocked ? 0.05 : 0.15) * (1 - d.stunRes);
  if (d.state === 'windup' && (o.stun || crit)) { d.state = 'ready'; d.move = null; d.cd = 0.3; }
  B.exc += (dmg / 220 + (crit ? 0.06 : 0) + (o.ability ? 0.02 : 0)) * a.show;
  B.shake = Math.max(B.shake, crit ? 2 : 0.8);
  const heavy = clamp(dmg / d.maxHp / 0.2, 0, 1);            // how much of him it took, a fifth of his health counting as all of it
  if (crit) { B.hitstop = Math.max(B.hitstop, 0.06 + 0.04 * heavy); B.flashT = 0.07; }
  else if (!blocked && heavy > 0.45 && B.fighters.length <= 6) B.hitstop = Math.max(B.hitstop, 0.045 * heavy);      // a hard blow holds the eye a moment; in a crowd of men it would only stutter
  vfx(B, { k: 'hit', x: d.x - a.facing * 2.5, y: d.y, dir: a.facing, size: blocked ? 0.75 : 0.9 + heavy * 0.6 + (crit ? 0.35 : 0), col: blocked ? '#ffe9a0' : '#ffffff', col2: blocked ? '#c9d1d9' : '#e8584a', dur: blocked ? 0.16 : 0.22 });
  if (!blocked && Math.abs(d.kx) > 30) { fxScuff(B, d.x, d.y, a.facing, 5 + heavy * 6); fxDust(B, d.x - a.facing * 2, d.y, crit ? 4 : 2); }      // driven back: his heels mark the sand
  if (blocked) {
    fxText(B, d, 'block ' + dmg, '#e8e2d0');
    d.guard = 0.25; snd(B, 'block', 1, d, d.c.shield);
    for (let i = 0; i < 4; i++) B.parts.push({ x: d.x - a.facing * 3, y: d.y, h: 10, vx: rand(-30, 30), vh: rand(10, 40), col: '#ffe9a0', spark: true });
    // a shield only takes so much: it splinters, then hangs in pieces (for show; it still turns blows)
    d.shieldHits++;
    if (d.shieldHits === 4 || d.shieldHits === 9) {
      for (let i = 0; i < 9; i++) B.parts.push({ x: d.x - a.facing * 3, y: d.y, h: rand(8, 14), vx: rand(-40, 40), vh: rand(15, 50), col: chance(0.5) ? B.col[d.team] : '#7a5a2a', spark: true });
      fxText(B, d, d.shieldHits === 4 ? 'shield splinters' : 'shield in pieces', '#e8e2d0');
      B.exc += 0.03;
    }
  } else {
    fxText(B, d, (crit ? '!' : '') + dmg, crit ? '#ffd24a' : '#ffffff');
    fxBlood(B, d, crit ? 9 : 4, a.facing);
    snd(B, 'hit', crit ? 1.5 : clamp(0.75 + dmg / d.maxHp * 2.2, 0.75, 1.15), d, a.g.beast ? 'beast' : a.g.cls + (d.armor >= 3 ? ' armor' : ''));      // by what struck, what it struck, and how hard
    // a heavy blow to the head can tear a helmet off; it lies where it lands
    const hd = crit && !d.noHelm ? gearLook(d.g).head : 0;
    if (hd && chance(0.4)) {
      d.noHelm = true;
      B.props.push({ x0: d.x, y0: d.y, x: clamp(d.x + a.facing * rand(10, 22), B.field.x0, B.field.x1), y: clamp(d.y + rand(-5, 6), B.field.y0, B.field.y1), t: B.clock,
        col: hd >= 3 ? '#b4bec8' : hd === 2 ? '#dcae48' : '#b98a34', crest: d.g.cls === 'hoplomachus' ? '#f0ead8' : d.g.cls === 'murmillo' || d.g.cls === 'thraex' ? B.col[d.team] : null });
      fxText(B, d, 'helmet torn off', '#ffd24a');
      feed(B, `${a.g.name} knocks the helmet from ${d.g.name}'s head`, a.team);
      B.exc += 0.04 * a.show;
    }
    if (crit && a.show > 1.2) { a.flourish = 0.7; B.exc += 0.03; }       // a showman plays to the stands
  }

  if (d.hp <= 0) { knockDown(B, d, a); return 'down'; }

  // wounds
  if (!blocked && o.ham && !d.hamstrung) { d.hamstrung = true; fxText(B, d, 'hamstrung', '#ffd24a'); feed(B, `${a.g.name} hamstrings ${d.g.name}`, a.team); }
  if (!blocked && (crit || o.bleed)) {
    const r = o.bleed ? 0 : Math.random();
    // good armour on the right part of the body can turn a wound aside
    const res = r < 0.4 ? d.bleedRes : r < 0.6 ? d.hamRes : r < 0.8 ? d.armRes : 0;
    if (r < 0.8 && Math.random() < res) fxText(B, d, 'armour holds', '#c9d1d9');
    else if (r < 0.4) {
      d.bleed += Math.max(1.2, dmg * 0.09) * (o.bleed > 1 ? o.bleed : 1); d.bleedT = 6; d.bleedBy = a;
      fxText(B, d, 'bleeding', '#ff6a5a');
      if (crit) feed(B, `${a.g.name} opens a vein on ${d.g.name}`, a.team);
    } else if (r < 0.6 && !d.hamstrung) {
      d.hamstrung = true;
      fxText(B, d, 'hamstrung', '#ffd24a');
      feed(B, `${a.g.name} hamstrings ${d.g.name}`, a.team);
    } else if (r < 0.8 && !d.armWound) {
      d.armWound = true;
      fxText(B, d, 'arm wound', '#ffb04a');
      feed(B, `${a.g.name} cuts ${d.g.name}'s sword arm`, a.team);
    }
  }
  if (!blocked && d.hp < d.maxHp * 0.22) tryYield(B, d, a);
  if (blocked) tryRiposte(B, d);
  return blocked ? 'block' : 'hit';
}

function walkBy(f, ux, uy, mult, dt) {
  const sp = f.speed * mult * (f.snare > 0 ? 0.3 : 1) * (f.hamstrung ? 0.6 : 1);
  f.x += ux * sp * dt; f.y += uy * sp * dt * 0.8;
  f.walk += dt * 8; f.moving = true;
}

function startMove(f, move, t) { f.state = 'windup'; f.move = move; f.t = t; f.t0 = t; }

function performMove(B, f, t, dx, dy, dist) {
  f.move = null;
  if (!out(t) && dist <= f.reach * 1.4) resolveAttack(B, f, t);
  f.state = 'ready';
  f.cd = f.atkTime * 0.7 * (f.buff && f.buff.haste ? f.buff.haste : 1);
  if (f.tactic === 'defensive') f.backT = 0.3;
  f.atkAnim = 1; f.slash = 0.12;
  if (!f.g.beast) {
    if (/trident|spear|hasta|lance|pilum/.test(String(f.c.weapon))) vfx(B, { k: 'jab', x: f.x, y: f.y, dir: f.facing, len: f.reach, dur: 0.14 });
    else vfx(B, { k: 'arc', x: f.x, y: f.y, dir: f.facing, size: 0.55, col: '#efe8d2', dur: 0.16 });
  }
}

function updateFighter(B, f, dt) {
  if (f.pose && ((f.pose.t -= dt) <= 0 || out(f))) f.pose = null;
  f.flash = Math.max(0, f.flash - dt);
  f.atkAnim = Math.max(0, f.atkAnim - dt * 4);
  f.slash = Math.max(0, f.slash - dt);
  f.guard = Math.max(0, f.guard - dt);
  f.open = Math.max(0, f.open - dt); f.flourish = Math.max(0, f.flourish - dt);
  f.x += f.kx * dt;
  f.kx *= Math.pow(0.002, dt);
  f.moving = false;
  if (!out(f)) fighterAct(B, f, dt);
  if (f.moving && Math.random() < dt * 4) fxDust(B, f.x - f.facing * 2, f.y, 1);
  f.x = clamp(f.x, B.field.x0, B.field.x1);
  f.y = clamp(f.y, B.field.y0, B.field.y1);
}

function fighterAct(B, f, dt) {
  if (f.bleed > 0) {
    const d = f.bleed * dt;
    f.hp -= d; f.bleedT -= dt; f.drip -= dt;
    if (f.bleedBy) f.bleedBy.dmgDealt += d;
    if (f.drip <= 0) { f.drip = 0.3; B.parts.push({ x: f.x + rand(-2, 2), y: f.y + rand(-1, 1), h: 9, vx: rand(-4, 4), vh: 0, col: '#b3261c', s: 2, drip: true }); }
    if (f.bleedT <= 0) f.bleed = 0;
    if (f.hp <= 0) { knockDown(B, f, f.bleedBy, `${f.g.name} collapses from loss of blood`); return; }
  }
  chargeUp(f, 3.2 * dt);                               // the charge builds by itself, slowly
  if (f.buff && (f.buff.t -= dt) <= 0) f.buff = null;
  f.weakT = Math.max(0, f.weakT - dt);
  f.snare = Math.max(0, f.snare - dt);
  f.cd -= dt; f.retarget -= dt;

  if (B.marked && out(B.marked)) B.marked = null;
  if (!f.target || out(f.target) || f.retarget <= 0) {
    // nearest first, but a man weighs more than distance: the one he hates, the one already hurt or
    // helpless, and above all the one who is cutting down a wounded friend
    let best = null, bd = 1e9, cover = null;
    for (const o of B.fighters) {
      if (o.team === f.team || out(o)) continue;
      let dd = Math.hypot(o.x - f.x, (o.y - f.y) * 1.3), c = null;
      if (!f.g.beast) {
        if (o === f.target) dd -= 6;
        if (o === f.hate) dd -= 30;
        if (f.team === 0 && o === B.marked) dd -= 45;      // the man the lanista has set the whole side on
        if (o.hp < o.maxHp * 0.35) dd -= f.tactic === 'aggressive' || f.g.traits.includes('bloodthirsty') ? 22 : 9;
        if (o.snare > 0 || o.stun > 0.3) dd -= 8;
        const m = o.target;
        if (m && m !== f && m.team === f.team && !out(m) && m.hp < m.maxHp * 0.4) { dd -= f.tactic === 'defensive' ? 26 : 14; c = m; }
      }
      if (dd < bd) { bd = dd; best = o; cover = c; }
    }
    if (cover && best !== f.target && !f.coverSaid) { f.coverSaid = true; feed(B, `${f.g.name} steps in to cover ${cover.g.name}`, f.team); B.exc += 0.03; }
    if (best !== f.target && f.state === 'windup') { f.state = 'ready'; f.move = null; }
    f.target = best; f.retarget = 1.5;
  }
  const t = f.target;
  if (!t) return;
  const dx = t.x - f.x, dy = t.y - f.y, dist = Math.hypot(dx, dy) || 0.01;
  const ux = dx / dist, uy = dy / dist;
  f.facing = dx >= 0 ? 1 : -1;
  if (f.stun > 0) { f.stun -= dt; f.combo = null; return; }
  if (f.combo) { comboStep(B, f, dt); return; }             // in the middle of an ability of several blows

  if (f.state === 'windup') {
    f.t -= dt;
    if (f.t <= 0) performMove(B, f, t, dx, dy, dist);
    return;
  }

  // charged: he uses one of the abilities he carries. One of yours, with you watching, waits for your word.
  if (f.charge >= 100) {
    const asks = f.team === 0 && B.ask && !f.g.beast && f.abl.length > 1;
    if (asks && f.holdT > 0) f.holdT -= dt;      // told to hold it: he fights on, charged, until the word comes
    else {
      if (asks) { B.pick = f; return; }
      castAbility(B, f, f.abl.length > 1 ? aiPickAbility(B, f) : f.abl[0]);
      return;
    }
  }
  if (dist > f.reach) {
    // when a friend already has him busy, come at his back instead of his shield
    if (!f.g.beast && t.target && t.target !== f && !out(t.target) && dist < 60 && f.flankT < 1.5) {
      const ex = t.x - t.facing * f.reach * 0.75 - f.x, ey = t.y - f.y, ed = Math.hypot(ex, ey);
      if (ed > 3) { f.flankT += dt; walkBy(f, ex / ed, ey / ed, 1, dt); return; }
    }
    walkBy(f, ux, uy, 1, dt);
  } else if (f.cd <= 0) {
    f.flankT = 0;
    if (!f.feinted && t.open <= 0 && Math.random() < f.feintP) {
      // a feint: a false start that costs little, and leaves a man who believes it open to the true blow
      f.feinted = true; f.cd = f.atkTime * 0.3; f.atkAnim = 0.6;
      if (Math.random() < clamp(0.25 + t.g.stats.skl * 0.022, 0, 0.8)) fxText(B, t, 'reads it', '#cfc6b4');
      else { t.open = 0.9; fxText(B, f, 'feint', '#e8d7a0'); }
    } else {
      f.feinted = false;
      startMove(f, 'strike', f.atkTime * 0.3);
    }
  } else if (f.c.net && dist < f.reach * 0.7 && t.snare <= 0) walkBy(f, -ux, -uy, 0.45, dt);
  else if (f.tactic === 'aggressive' && !f.g.beast) { if (dist > f.reach * 0.65) walkBy(f, ux, uy, 0.3, dt); }       // he crowds his man
  else if ((f.backT > 0 || (f.g.traits.includes('nervous') && f.hp < f.maxHp * 0.3)) && !f.g.beast) {              // he steps out after striking
    f.backT -= dt;
    if (dist < f.reach * 0.95) walkBy(f, -ux, -uy, 0.4, dt);
  }
  else walkBy(f, -uy * f.circle, ux * f.circle, 0.3, dt);
}

function stepFx(B, dt) {
  for (const p of B.parts) {
    p.x += p.vx * dt; p.h += p.vh * dt; p.vh -= 160 * dt;
    if (p.h <= 0) {
      p.dead = true;
      if (!p.spark) {                           // it lands: into a pool if one is there, which grows by it; or as a mark of its own
        const pool = p.drip && B.stains.find(q => q.pool && Math.abs(q.x - p.x) < 5 && Math.abs(q.y - p.y) < 2.5);
        if (pool) pool.pool = Math.min(5, pool.pool + 0.22);
        else if (p.drip && B.stains.length < 600) fxPool(B, p.x, p.y, 1.2);
        else if (B.stains.length < 600) B.stains.push({ x: p.x, y: p.y, w: p.s === 3 ? 2 : 1, tall: p.s === 3 ? 1 : 0, t: B.clock });
      }
    }
  }
  B.parts = B.parts.filter(p => !p.dead);
  for (const t of B.texts) {
    if (t.kind === 'fig' || t.kind === 'quiet') { t.x += t.vx * dt; t.y += t.vy * dt; t.vx *= Math.pow(0.08, dt); t.vy += (t.kind === 'fig' ? 46 : 8) * dt; if (t.kind === 'fig' && t.vy > 5) t.vy = 5; }      // thrown out, and settling
    else t.y -= (t.vy === undefined ? 7 : -t.vy) * dt;
    t.life -= dt;
  }
  B.texts = B.texts.filter(t => t.life > 0);
  for (const v of B.vfx) v.t += dt;
  B.vfx = B.vfx.filter(v => v.t < v.dur);
  for (const l of B.feed) l.life -= dt;
  B.shake = Math.max(0, B.shake - dt * 12);
  B.flashT = Math.max(0, B.flashT - dt);
  B.clock += dt;
  for (const f of B.fighters) f.fallT = Math.max(0, f.fallT - dt);
}

function decideVerdicts(B) {
  let i = 0;
  for (const f of B.fighters) {
    if (!out(f) || f.fate) continue;             // whoever fell while it was still being fought has had his answer
    if (f.g.beast || (f.down && B.death)) { f.fate = 'dead'; continue; }
    f.fate = fateOf(B, f);
    f.revealAt = 1.2 + i * 0.9; i++;
  }
  B.outroEnd = 1.8 + i * 0.9 + (i ? 0.9 : 0);
  B.cardAt = B.outroEnd - 0.3; B.outroEnd += 3.2;                // and then the reckoning of it is shown, before the sand is left
}

function stepOutro(B, dt) {
  const was = B.outro;
  B.outro += dt;
  if (was < 0.55 && B.outro >= 0.55) { B.shake = 2.5; B.flashT = B.winner === 0 ? 0.12 : 0; snd(B, 'verdict', 1, null, B.winner === 0 ? 'won' : 'lost'); }      // the word of it lands
  for (const f of B.fighters) {
    f.flash = Math.max(0, f.flash - dt);
    if (!f.revealAt || f.revealed || f.killing || B.outro < f.revealAt) continue;
    if (f.fate === 'spared') spare(B, f); else { kill(B, f); if (B.kill) return; }
  }
}

function stepIntro(B, dt) {
  const was = B.introDur - B.intro;
  B.intro -= dt;
  const ti = B.introDur - B.intro, at = v => was < v && ti >= v;
  for (const f of B.fighters) {
    const dx = f.markX - f.x, moved = f.moving;
    f.moving = Math.abs(dx) > 0.5;
    if (f.moving) {
      f.x += Math.sign(dx) * Math.min(Math.abs(dx), 30 * dt); f.walk += dt * 8; if (Math.random() < dt * 5) fxDust(B, f.x, f.y, 1);
      f.stepT = (f.stepT || 0) + dt; if (f.stepT > 0.3 && B.fighters.length <= 6) { f.stepT = 0; snd(B, 'walk', f.g.beast ? 0.6 : 1, f); }
    }
    else if (moved && !f.g.beast) f.flourish = 1.1;                       // on his mark, he salutes the stands
    f.flourish = Math.max(0, f.flourish - dt);
  }
  if (at(0.55)) snd(B, 'clash');             // it is heard a little before it is seen, for the sound has its own wind-up
  if (at(0.75)) { B.shake = 2; B.flashT = 0.1; }    // the two halves of the card meet
  if (B.intro <= 0) {
    B.fighters.forEach(f => { f.x = f.markX; f.moving = false; f.flourish = 0; });
    B.texts.push({ x: 107, y: 64, str: B.wild ? 'AT THEM!' : 'PUGNATE!', col: '#ffd24a', life: 1.3, big: true });
    B.shake = 2.5; B.flashT = 0.12;
    for (const f of B.fighters) vfx(B, { k: 'ring', under: true, x: f.x, y: f.y, r: 14, r0: 3, col: '#f2e2b8', dur: 0.4, a: 0.7 });
    snd(B, 'start');
  }
}

function stepBattle(B, dt) {
  if (B.kill) {                               // the picture is closing on a man about to die: nothing moves until it has
    B.kill.t += dt;
    if (B.kill.t < KILL_ZOOM && B.cutins) { B.clock += dt; return; }
    const k = B.kill; B.kill = null;
    if (k.done) { k.f.killing = false; fatal(B, k.f, k.by); } else slay(B, k.f);
  }
  if (B.fatal) {                              // a death is being shown: nothing else moves until it has been
    const was = B.fatal.t; B.fatal.t += dt;
    if (was < 0.55 && B.fatal.t >= 0.55) snd(B, 'fatal', 1, B.fatal.f, B.fatal.kind);
    const beat2 = B.fatal.kind === 'murmillo' ? 0.89 : B.fatal.kind === 'dimachaerus' ? 0.69 : 0;      // the second blow of it, where there is one
    if (beat2 && was < beat2 && B.fatal.t >= beat2) snd(B, 'strike', 0.9, B.fatal.f);
    if (B.fatal.t < B.fatal.dur && B.cutins) { B.clock += dt; return; }
    B.fatal = null;
  }
  if (B.slowmo > 0) { B.slowmo -= dt; dt *= 0.25; }
  stepFx(B, dt);
  if (B.over) { stepOutro(B, dt); return; }
  if (B.intro > 0) { stepIntro(B, dt); return; }
  if (B.pick) { if (out(B.pick) || !B.ask) B.pick = null; else return; }      // stopped, waiting for the player to choose an ability
  if (B.cut) {                                // an ability is being announced: everything waits until the band has crossed
    B.cut.t += dt;
    if (!B.cut.struck && B.cut.t >= B.cut.ts && B.cutins) { B.cut.struck = true; snd(B, 'strike', 1, B.cut.f, B.cut.f.g.beast ? 'beast' : ''); }
    if (B.cut.t < B.cut.dur && B.cutins) return;
    const c = B.cut; B.cut = null;
    if (!out(c.f)) castNow(B, c.f, c.ab);
  }
  if (B.hitstop > 0) { B.hitstop -= dt; for (const f of B.fighters) f.flash = Math.max(0, f.flash - dt); return; }      // the fight holds, but the white of the blow does not: he is seen through the hold
  B.time += dt;
  B.heartT = (B.heartT || 0) + dt;
  if (B.heartT > 0.9 && B.fighters.some(f => f.team === 0 && !out(f) && !f.g.beast && f.hp < f.maxHp * 0.25)) { B.heartT = 0; snd(B, 'heart'); }
  B.exc = clamp(B.exc - 0.012 * dt, 0, 1);
  B.excSum += B.exc * dt;
  for (const f of B.fighters) { updateFighter(B, f, dt); if (B.pick) break; }      // the moment it stops for a man of yours, nobody else moves
  for (const p of B.projs) {
    p.t += dt;
    const k = Math.min(1, p.t / p.dur);
    p.x = p.from.x + (p.to.x - p.from.x) * k; p.y = p.from.y + (p.to.y - p.from.y) * k; p.k = k;
    if (k >= 1) {
      p.dead = true;
      if (p.hit && !out(p.to)) {
        p.to.snare = Math.max(p.to.snare, netHold(p.to, p.snare || 3)); fxText(B, p.to, 'netted', '#d8c79a'); B.exc += 0.05 * p.from.show;
        if (p.weak) { p.to.weakT = p.weak.t; p.to.weakAmt = p.weak.amt; vfx(B, { k: 'drip', f: p.to, col: '#c9b458', dur: 0.9 }); }
        vfx(B, { k: 'ring', under: true, x: p.to.x, y: p.to.y, r: 12, col: '#e8dcb4', dur: 0.35 });
        if (p.to.state === 'windup') { p.to.state = 'ready'; p.to.move = null; }
        feed(B, `${p.from.g.name} nets ${p.to.g.name}`, p.from.team);
      } else if (!out(p.to)) fxText(B, p.to, 'net misses', '#cfc6b4');
    }
  }
  B.projs = B.projs.filter(p => !p.dead);
  // keep bodies from stacking
  const F = B.fighters;
  for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
    const a = F[i], b = F[j];
    if (out(a) || out(b)) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
    if (d < 12) { const push = (12 - d) / 2; a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push; }
  }
  const alive = [0, 0], frac = [0, 0];
  for (const f of F) { if (!out(f)) alive[f.team]++; frac[f.team] += f.hp / f.maxHp; }
  if (!alive[0] || !alive[1]) { B.over = true; B.winner = alive[0] ? 0 : 1; }
  else if (B.time > 150) { B.over = true; B.winner = frac[0] >= frac[1] ? 0 : 1; B.decision = true; }
  if (B.over) { decideVerdicts(B); if (!B.decision) B.slowmo = 0.8; if (!B.decision && B.lastDown) B.finish = { x: B.lastDown.x, y: B.lastDown.y }; }
}

// ---------- drawing ----------

// ---------- fighter sprites ----------
// Sprites are drawn on a grid twice as fine as the world (FINE px per sprite pixel),
// about 24 wide and 40 tall, with the origin at the feet. x runs toward the enemy, y up is negative.

// A man who has just been hit is white for an instant (while more than HIT_WHITE of his flash is left) and then flushed
// red, less and less, until it is spent: the blow is seen, and so is he.
const HIT_WHITE = 0.075, _flush = {};
function flush(hex, k) {
  if (typeof hex !== 'string' || hex[0] !== '#' || hex.length !== 7) return hex;
  const q = k > 0.66 ? 3 : k > 0.33 ? 2 : 1, key = hex + q;
  if (_flush[key]) return _flush[key];
  const m = q * 0.17, n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return _flush[key] = 'rgb(' + Math.round(r + (255 - r) * m) + ',' + Math.round(g + (70 - g) * m) + ',' + Math.round(b + (50 - b) * m) + ')';
}
const _shades = {};
function shade(hex, f) {
  const k = hex + '|' + f;
  if (_shades[k]) return _shades[k];
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f <= 1) { r *= f; g *= f; b *= f; } else { const t = f - 1; r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
  return (_shades[k] = 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')');
}

// How a man's whole body moves when he uses an ability. castAbility (abilities.js) sets f.pose = { k, t, dur, fx, fy }:
// k is the kind of movement, t counts down from dur, and fx, fy are where he started from (so that a rush is seen
// crossing the sand, though the rules moved him at once). Returns where to draw him, how stretched, and what trails.
function poseOf(f) {
  const p = f.pose;
  if (!p || f.down || f.yielded) return null;
  const u = clamp(1 - p.t / p.dur, 0, 1), d = f.facing, S = Math.sin, PI = Math.PI;
  const P = { ox: 0, oy: 0, sx: 1, sy: 1, flip: 1, lift: 0, ghosts: 0, gx: -d, gy: 0 };
  const far = Math.hypot(p.fx || 0, p.fy || 0);
  if (far > 1) {                                   // the run-in, over the first part of the move
    const part = p.k === 'hop' ? 0.85 : 0.32, k = 1 - Math.min(1, u / part), e = k * k;
    P.ox += p.fx * 2 * e; P.oy += p.fy * 2 * e;
    if (k > 0.05) { P.ghosts = 3; P.gx = p.fx / far; P.gy = p.fy / far; }
  }
  if (p.k === 'leap') {                            // up, and down on him with his whole weight
    const a = S(Math.min(1, u / 0.62) * PI);
    P.lift = a * 15; P.sy = 1 + a * 0.1; P.sx = 1 - a * 0.05;
    if (u > 0.62) { const q = 1 - (u - 0.62) / 0.38; P.sy = 1 - 0.16 * q; P.sx = 1 + 0.12 * q; }
  } else if (p.k === 'thrust') {                   // drawn back, then driven forward and held
    const a = u < 0.22 ? -4 * (u / 0.22) : u < 0.42 ? -4 + 13 * ((u - 0.22) / 0.2) : 9 * (1 - (u - 0.42) / 0.58);
    P.ox += d * a; if (u > 0.22 && u < 0.6) { P.sx = 1.1; P.sy = 0.96; P.ghosts = Math.max(P.ghosts, 2); }
  } else if (p.k === 'spin') {                     // round on his heel, twice
    if (u < 0.86) P.flip = Math.floor(u * 9) % 2 ? -1 : 1;
    P.sx = 1 + 0.1 * S(u * PI); P.lift = 2 * S(u * PI);
  } else if (p.k === 'flurry') {                   // in and out with every cut
    P.ox += d * (3.5 * S(u * PI * 2 * (p.n || 2)) + 4 * S(u * PI)); P.ghosts = Math.max(P.ghosts, 2);
  } else if (p.k === 'brace') {                    // sets his feet and sinks behind his guard
    const a = S(Math.min(1, u * 1.6) * PI);
    P.sy = 1 - 0.15 * a; P.sx = 1 + 0.1 * a;
  } else if (p.k === 'surge') {                    // draws himself up
    const a = S(u * PI);
    P.sy = 1 + 0.13 * a; P.sx = 1 - 0.05 * a; P.lift = 3 * a;
  } else if (p.k === 'throw') {                    // back on his heel, then the whole arm forward
    P.ox += d * (u < 0.35 ? -5 * (u / 0.35) : -5 + 11 * S((u - 0.35) / 0.65 * PI * 0.5) - 6 * Math.max(0, (u - 0.7) / 0.3));
  } else if (p.k === 'hop') {                      // a skip out of reach
    P.lift = S(u * PI) * 9;
  }
  return P;
}
function drawFighter(ctx, f, o) {
  const P = poseOf(f);
  if (!P) return drawSprite(ctx, o);
  const x = o.x + P.ox, y = o.y + P.oy, none = { len: 0, a: 0 };
  for (let i = P.ghosts; i >= 1; i--) {            // where he was a moment ago
    ctx.globalAlpha = 0.2 - i * 0.045;
    drawSprite(ctx, Object.assign({}, o, { x: x + P.gx * i * 7, y: y + P.gy * i * 7 - P.lift, shadow: none, flash: 0, light: null }));
  }
  ctx.globalAlpha = 1;
  if (P.lift > 1) {                                // his shadow stays on the sand, and shrinks as he rises
    const w = Math.round(9 - P.lift * 0.25);
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(Math.round(x) - w, Math.round(y) - 1, w * 2, 2);
  }
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y - P.lift)); ctx.scale(P.sx, P.sy);
  drawSprite(ctx, Object.assign({}, o, { x: 0, y: 0, facing: o.facing * P.flip, shadow: P.lift > 1 ? none : o.shadow }));
  ctx.restore();
}

// A fighter, with a dark line round him so he stands clear of the sand and of the men beside him.
// The line is the figure itself in ink, drawn a pixel off in each direction, with the figure on top.
// The figure is worked out once, into a list of rectangles (spriteRects, beastRects), and the list is laid down five
// times: four in ink, a pixel off each way, and once in its own colours. Working him out five times over was most of
// the cost of a frame of a fight. Every rectangle is still filled by itself, so where two overlap the ink lies as
// dark as it always did. What is light and not body (his shadow, the sweep of a blow, a net over him) has no line.
// o.solid draws the whole figure in that one colour, as a shadow of himself; a beast drawn so has no line round it.
const SPRITE_EDGE = [[1, 0], [-1, 0], [0, 1], [0, -1]], SPRITE_INK = 'rgba(30,18,9,.62)';
const _spr = { n: 0, x: [], y: [], w: [], h: [], c: [], ink: [] };
function sprPut(x, y, w, h, col, ink) { const S = _spr, i = S.n++; S.x[i] = x; S.y[i] = y; S.w[i] = w; S.h[i] = h; S.c[i] = col; S.ink[i] = ink; }
function drawSprite(ctx, o) {
  const S = _spr, beast = !!o.g.beast;
  S.n = 0;
  if (beast) beastRects(o); else spriteRects(o);
  const n = S.n, X = S.x, Y = S.y, W = S.w, H = S.h, C = S.c, I = S.ink;
  if (o.lightOnly) { if (o.light) sprLight(ctx, o.light); return; }      // (nothing of him but the light on him: for whoever lays it on after the dark has come down over the picture, as the yard does)
  if (!o.plain && !(beast && o.solid)) {
    ctx.fillStyle = SPRITE_INK;
    for (let e = 0; e < 4; e++) { const dx = SPRITE_EDGE[e][0], dy = SPRITE_EDGE[e][1]; for (let i = 0; i < n; i++) if (I[i]) ctx.fillRect(X[i] + dx, Y[i] + dy, W[i], H[i]); }
  }
  if (o.solid) { ctx.fillStyle = o.solid; for (let i = 0; i < n; i++) if (I[i]) ctx.fillRect(X[i], Y[i], W[i], H[i]); return; }
  let last = null;
  for (let i = 0; i < n; i++) { if (C[i] !== last) ctx.fillStyle = last = C[i]; ctx.fillRect(X[i], Y[i], W[i], H[i]); }
  if (o.light && !(o.flash > HIT_WHITE)) sprLight(ctx, o.light);
}
// The light on a figure. He is painted in his own colours whatever the hour; what tells where the light is, is his
// edge: bright along the side the sun or a flame is on, a little along the top of him when the light is overhead,
// and darkened down the side that is turned from it. The list of rectangles he was drawn from (_spr) is laid on a
// small grid to find where he ends, so the light falls on his outline and on nothing inside it; where there is air
// between an arm and his body, or between his legs, it comes through and lights the far limb as well.
// L: la, lc: how strong the light on his left is, 0 to 1, and its colour as r,g,b; ra, rc: on his right; ta, tc:
// from above. Whoever draws him works it out (in a fight, drawBattle); with no L he is drawn as he always was.
const _lg = new Uint8Array(128 * 96);
function sprLight(ctx, L) {
  const S = _spr, n = S.n, X = S.x, Y = S.y, W = S.w, H = S.h, I = S.ink, g = _lg;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < n; i++) if (I[i]) { if (X[i] < x0) x0 = X[i]; if (Y[i] < y0) y0 = Y[i]; if (X[i] + W[i] > x1) x1 = X[i] + W[i]; if (Y[i] + H[i] > y1) y1 = Y[i] + H[i]; }
  x0 = Math.floor(x0); y0 = Math.floor(y0); const w = Math.ceil(x1) - x0, h = Math.ceil(y1) - y0;
  if (!(w > 0 && h > 0) || w > 128 || h > 96) return;
  g.fill(0, 0, w * h);
  for (let i = 0; i < n; i++) if (I[i]) { const ax = Math.max(0, Math.round(X[i]) - x0), bx = Math.min(w, Math.round(X[i] + W[i]) - x0), by = Math.min(h, Math.round(Y[i] + H[i]) - y0); if (bx > ax) for (let y = Math.max(0, Math.round(Y[i]) - y0); y < by; y++) g.fill(1, y * w + ax, y * w + bx); }
  // dx: which way the light comes from, across (-1 from the left, 1 from the right) or 0 from above; deep: how far in from the edge (0, or 1 for the pixel behind it)
  // (L.mask, where whoever draws him has kept what has since been painted over him: x, y, w, h, and m, which is 1
  // wherever he is hidden. No light is laid there. A place in the town keeps one for each of its people: places.js.)
  const K = L.mask || null;
  const edge = (col, a, dx, deep) => {
    if (!(a > 0.03)) return;
    ctx.fillStyle = `rgba(${col},${Math.min(1, a).toFixed(3)})`;
    for (let y = 0; y < h; y++) for (let x = 0, r = y * w; x < w; x++) {
      if (!g[r + x]) continue;
      if (K) { const mx = x0 + x - K.x, my = y0 + y - K.y; if (mx >= 0 && mx < K.w && my >= 0 && my < K.h && K.m[my * K.w + mx]) continue; }
      let out;
      if (dx) { const e = x + dx * (deep + 1), m = x + dx; out = (e < 0 || e >= w || !g[r + e]) && (!deep || (m >= 0 && m < w && g[r + m])); }
      else out = (y - deep - 1 < 0 || !g[r - (deep + 1) * w + x]) && (!deep || g[r - w + x]);
      if (out) ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
  };
  const la = L.la || 0, ra = L.ra || 0, DARK = '14,8,22';
  edge(L.lc, la, -1, 0); if (la > 0.3) edge(L.lc, la * 0.4, -1, 1);
  edge(L.rc, ra, 1, 0); if (ra > 0.3) edge(L.rc, ra * 0.4, 1, 1);
  if (la < 0.06 && ra > 0.12) edge(DARK, ra * 0.5, -1, 0); else if (ra < 0.06 && la > 0.12) edge(DARK, la * 0.5, 1, 0);      // the side turned from it
  edge(L.tc, L.ta || 0, 0, 0);
}
function spriteRects(o) {
  // o: {x,y,facing,g,team,col,colD,moving,walk,clock,atkAnim,windup,windP,recoil,bash,guard,flash,down,falling,yielded,snare,cheer,shadow,solid}
  const g = o.g, c = CLASSES[g.cls], cls = g.cls, d = o.facing;
  const look = gearLook(g), armorT = look.armor, weaponT = look.weapon;
  const X = Math.round(o.x), Y = Math.round(o.y) - (o.cheer && Math.sin(o.cheer * 9) > 0.3 ? 2 : 0);
  const white = o.flash > HIT_WHITE, hurtK = o.flash > 0 && !white ? o.flash / HIT_WHITE : 0;
  let lean = 0;       // sideways shift of everything above the hips: into a blow, back from a hit
  let inked = 1;      // whether what is being drawn is body, and so has the dark line round it
  const P = (x, y, w, h, col) => sprPut(d > 0 ? X + x + lean : X - x - w - lean, Y + y, w, h, white ? '#fff' : hurtK ? flush(col, hurtK) : col, inked);
  const L = (x0, y0, x1, y1, w, col) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)), o2 = w >> 1;
    for (let i = 0; i <= n; i++) { const t = n ? i / n : 0; P(Math.round(x0 + (x1 - x0) * t) - o2, Math.round(y0 + (y1 - y0) * t) - o2, w, w, col); }
  };

  const skin = g.look.skin, skinD = shade(skin, 0.76), skinL = shade(skin, 1.18), hair = g.look.hair;
  const team = o.col || TEAM_COL[o.team], teamD = o.colD || TEAM_DARK[o.team], teamL = shade(team, 1.3);
  const metalOf = t => t >= 3 ? '#b4bec8' : t === 2 ? '#dcae48' : '#b98a34';        // bronze, then gilt, then bright steel
  const metal = metalOf(look.head);
  const metalD = shade(metal, 0.68), metalL = shade(metal, 1.4);
  const legM = metalOf(look.legsT || look.head), legML = shade(legM, 1.4);           // greaves, pauldrons and arm guard each in their own grade
  const shM = metalOf(look.shouldersT), shML = shade(shM, 1.4), shMD = shade(shM, 0.68);
  const blade = ['#8d9094', '#c1c7cc', '#e4e9ed', '#fbf6dc'][weaponT], bladeD = shade(blade, 0.72);
  const hilt = weaponT >= 3 ? '#e8b545' : weaponT >= 1 ? '#8a6230' : '#5e4222';
  const gold = '#e8b545', wood = '#7a5a2a', cloth = '#ddd3ba', clothD = '#b0a488', leather = '#6b4526', ink = '#1c1310';
  const torso = [skin, '#d6c8a2', skin, '#aeb8c2'][armorT], torsoD = [skinD, '#b0a078', skinD, '#7c8792'][armorT];
  const helmed = look.head > 0 && !o.noHelm;      // a helmet only where he wears one; its crest is his school's
  const manica = cls === 'murmillo' || cls === 'thraex' || cls === 'retiarius' || look.arms;
  const plated = look.armsT >= 2;                 // a good arm guard is scaled metal, not wrapped linen
  const arm = plated ? shade(metalOf(look.armsT), 0.92) : manica ? '#cfc4a6' : skin, armD = plated ? shade(metalOf(look.armsT), 0.62) : manica ? '#a2977a' : skinD;
  const seed = g.id * 7919 % 97;

  // shadow: a pool under the feet, drawn out along the ground when the light is low (to the right; or, where the
  // light comes from the right, sh.dir less than nothing, to the left)
  const sh = o.shadow || { len: 0, a: 0.2 };
  if (sh.a > 0) {
    const sc = `rgba(0,0,0,${sh.a})`, lf = sh.dir < 0 ? sh.len : 0;
    sprPut(X - 9 - lf, Y - 2, 18 + sh.len, 3, sc, 0); sprPut(X - 6 - lf, Y + 1, 12 + sh.len, 1, sc, 0);
    sprPut(X - 5, Y - 1, 10, 2, `rgba(0,0,0,${(sh.a * 0.9).toFixed(3)})`, 0);      // darkest right under his feet
    if (sh.len) { sprPut(sh.dir < 0 ? X - 7 - sh.len : X - 5, Y - 3, 12 + sh.len, 1, sc, 0); sprPut(sh.dir < 0 ? X - 12 - sh.len : X + 9 + sh.len, Y - 2, 3, 2, sc, 0); }
  }

  // ---- lying on the sand ----
  if (o.down && !o.falling) {
    if (c.shield) { P(-16, -11, 8, 4, teamD); P(-15, -10, 6, 2, team); P(-13, -10, 2, 2, gold); }
    P(-18, -4, 10, 3, skin); P(-18, -2, 10, 1, skinD); P(-20, -4, 2, 3, leather);
    P(-9, -6, 6, 5, cloth); P(-9, -2, 6, 1, clothD);
    P(-3, -8, 11, 7, torso); P(-3, -2, 11, 1, torsoD); P(-4, -8, 2, 7, team);
    if (armorT === 2) { P(0, -8, 6, 4, metal); P(0, -8, 6, 1, metalL); }
    if (armorT === 3) { for (let x = -1; x < 8; x += 2) P(x, -8, 1, 6, '#7c8792'); }
    L(6, -3, 13, -1, 2, arm);
    if (helmed) { P(8, -9, 7, 7, metal); P(8, -9, 7, 1, metalL); P(13, -6, 2, 3, ink); if (cls === 'murmillo' || cls === 'thraex' || cls === 'hoplomachus') P(6, -10, 3, 3, cls === 'hoplomachus' ? '#f0ead8' : team); }
    else { P(8, -8, 6, 6, skin); P(8, -8, 6, 2, hair); P(8, -6, 2, 3, hair); P(12, -5, 1, 1, ink); }
    L(14, -1, 22, -1, 1, blade); P(13, -2, 1, 2, hilt);
    return;
  }

  // ---- pose ----
  const kneel = o.yielded || o.falling;
  const ph = (o.walk || 0) * Math.PI / 2;                       // walk cycle: one stride every four units of o.walk
  const by = kneel ? 8 : (o.moving ? (Math.abs(Math.sin(ph)) > 0.7 ? 1 : 0) : (Math.sin((o.clock || 0) * (o.hurt >= 2 ? 5.4 : 2.6)) > 0.55 ? 1 : 0));      // breathing: a badly hurt man pants
  const striking = !kneel && !o.cheer && !o.windup && o.atkAnim > 0.45;
  // lean forward on the move and into a blow; rock back while winding up or when struck
  const leanAmt = kneel ? 0 : (o.moving ? 1 : 0) + (striking ? 2 : o.atkAnim > 0 && !o.windup ? 1 : 0) - (o.windup ? 1 : 0) - Math.round((o.recoil || 0) * 2) + (o.hurt >= 3 && !striking && !o.windup && !o.cheer ? 1 : 0);      // and stoops
  const sway = (o.moving ? -1 : 0) + (Math.sin((o.clock || 0) * 3.1 + seed) > 0.6 ? -1 : 0) - (striking ? 1 : 0);   // crests and plumes trail behind

  // ---- legs ----
  const greave = (x, lift, tall) => { P(x, (tall ? -10 : -8) - lift, 4, tall ? 9 : 7, legM); P(x + 1, (tall ? -10 : -8) - lift, 1, tall ? 9 : 7, legML); };
  const leg = (x, lift, back, gr) => {
    P(x, -13, 4, 7, back ? skinD : skin);
    P(x, -7 - lift, 4, 6, back ? skinD : skin);
    if (!back) P(x + 3, -13, 1, 12 - lift, skinD);
    if (gr) greave(x, lift, gr === 2); else { P(x, -5 - lift, 4, 1, leather); P(x, -3 - lift, 4, 1, leather); }
    P(x, -2 - lift, 5, 2, leather); P(x, -1 - lift, 6, 1, shade(leather, 0.7));
  };
  if (kneel) {
    P(-9, -3, 10, 3, skinD); P(-11, -3, 2, 3, leather);       // rear shin flat on the sand
    P(-1, -8, 4, 6, skin); P(1, -3, 6, 3, skin); P(6, -2, 3, 2, leather);
  } else {
    const fdx = o.moving ? Math.round(Math.sin(ph) * 2.5) : striking ? 2 : 0;       // a stride, or a step into the blow
    const gFront = cls === 'murmillo' ? 1 : (cls === 'thraex' || cls === 'hoplomachus') ? 2 : look.legs ? 1 : 0;
    const gBack = (cls === 'thraex' || cls === 'hoplomachus') ? 2 : look.legs ? 1 : 0;
    leg(-4 - fdx, o.moving ? Math.max(0, Math.round(-Math.cos(ph) * 1.6)) : 0, true, gBack);
    leg(0 + fdx, o.moving ? Math.max(0, Math.round(Math.cos(ph) * 1.6)) : 0, false, gFront);
  }

  // ---- hips and belt ----
  P(-5, -16 + (kneel ? 8 : 0), 10, 4, cloth); P(-5, -13 + (kneel ? 8 : 0), 10, 1, clothD);
  if (!kneel) { const fl = o.moving ? Math.round(Math.sin(ph + 1.2)) : 0; P(1 + fl, -12, 3, 3, cloth); P(1 + fl, -9, 3, 1, clothD); }
  lean = leanAmt;
  P(-5, -18 + by, 10, 2, team); P(-5, -17 + by, 10, 1, teamD);
  P(-3, -18 + by, 1, 1, gold); P(0, -18 + by, 1, 1, gold); P(3, -18 + by, 1, 1, gold);

  // ---- torso ----
  P(-5, -28 + by, 10, 10, torso); P(-5, -28 + by, 2, 10, torsoD);
  if (armorT === 0 || armorT === 2) {
    P(-2, -24 + by, 6, 1, skinD); P(1, -22 + by, 1, 1, skinD); P(1, -20 + by, 1, 1, skinD); P(3, -27 + by, 1, 3, skinL);
    L(-4, -27 + by, 3, -19 + by, 1, leather);
  }
  if (armorT === 1) {
    for (let y = -26; y <= -20; y += 3) P(-5, y + by, 10, 1, torsoD);
    P(-2, -28 + by, 1, 10, torsoD); P(2, -28 + by, 1, 10, torsoD);
  }
  if (armorT === 2) {
    P(-3, -27 + by, 7, 7, metal); P(-3, -27 + by, 7, 1, metalL); P(-3, -21 + by, 7, 1, metalD);
    P(-3, -27 + by, 1, 7, metalD); P(-1, -25 + by, 3, 3, metalL); P(0, -24 + by, 1, 1, metal);
  }
  if (armorT === 3) {
    for (let y = -28; y <= -20; y += 2) { P(-5, y + by, 10, 1, '#cfd7df'); P(-5, y + 1 + by, 10, 1, '#7c8792'); }
    P(-5, -28 + by, 10, 1, gold); P(-5, -19 + by, 10, 1, gold);
    P(-6, -29 + by, 5, 3, '#cfd7df'); P(-6, -27 + by, 5, 1, '#7c8792');
  }
  if (look.shoulders && armorT !== 3) { P(-6, -29 + by, 5, 3, shM); P(-6, -29 + by, 5, 1, shML); P(-6, -27 + by, 5, 1, shMD); if (look.shouldersT >= 3) P(-5, -30 + by, 3, 1, shML); }
  P(-1, -29 + by, 3, 1, skinD);
  // ---- wounds: the worse he is hurt, the more of it shows ----
  if (o.hurt) {
    const bl = '#a3261b', blD = '#7a1a12';
    P(-1, -25 + by, 2, 2, bl); P(0, -23 + by, 1, 2, blD);
    if (o.hurt >= 2) { P(-4, -22 + by, 3, 2, bl); P(-3, -20 + by, 1, 2, blD); P(1, -27 + by, 2, 1, bl); }
    if (o.hurt >= 3) { P(-2, -27 + by, 4, 1, bl); P(2, -21 + by, 2, 3, bl); P(-1, -16 + (kneel ? 8 : 0), 3, 2, blD); if (!kneel) P(1, -11, 2, 3, bl); }
  }
  if (o.armWound) { P(-5, -27 + by, 2, 3, '#a3261b'); P(-5, -24 + by, 1, 2, '#7a1a12'); }
  if (o.hamstrung && !kneel) { P(0, -9, 3, 2, '#a3261b'); P(1, -7, 1, 3, '#7a1a12'); }

  // ---- head ----
  if (helmed) {
    P(-4, -38 + by, 8, 5, metal); P(-3, -38 + by, 5, 1, metalL); P(-2, -37 + by, 2, 1, metalL); P(-4, -38 + by, 1, 5, metalD);
    P(-3, -33 + by, 7, 4, metal); P(1, -33 + by, 3, 3, metalD);
    P(1, -32 + by, 1, 1, ink); P(3, -32 + by, 1, 1, ink); P(2, -31 + by, 1, 1, ink);
    P(-5, -34 + by, 11, 1, metalL); P(-5, -33 + by, 2, 3, metal); P(-2, -30 + by, 5, 1, metalD);
    if (look.head === 3 && Math.sin((o.clock || 0) * 0.8 + seed) > 0.93) { P(-2, -37 + by, 1, 1, '#ffffff'); P(-3, -36 + by, 1, 1, '#ffffff'); }      // and on a fine helm
    if (cls === 'murmillo') {            // tall fin crest
      P(-4, -39 + by, 8, 1, metalD);
      P(-5, -40 + by, 8, 1, team); P(-5 + sway, -42 + by, 8, 2, team); P(-4 + sway, -43 + by, 6, 1, teamL); P(3, -41 + by, 1, 2, team);
      P(-4 + sway, -42 + by, 1, 2, teamD); P(-2 + sway, -42 + by, 1, 2, teamD); P(0 + sway, -42 + by, 1, 2, teamD); P(-4, -40 + by, 1, 1, teamD); P(-2, -40 + by, 1, 1, teamD); P(0, -40 + by, 1, 1, teamD); P(2, -41 + by, 1, 2, teamD);
    } else if (cls === 'thraex') {       // griffin hook with a plume behind it
      P(-5, -40 + by, 4, 2, team); P(-5 + sway, -42 + by, 4, 2, team); P(-6, -41 + by, 1, 5, teamD); P(-4 + sway, -43 + by, 2, 1, teamL);
      P(0, -41 + by, 2, 3, metal); P(1, -43 + by, 3, 2, metal); P(4, -42 + by, 1, 2, metalL); P(2, -42 + by, 1, 1, ink);
    } else if (cls === 'hoplomachus') {  // feathers; any other school wears the helm plain
      P(-1, -42 + by, 2, 4, '#f0ead8'); P(-3, -41 + by, 2, 3, '#f0ead8'); P(1, -40 + by, 2, 2, '#d8d0b8');
      P(-1 + sway, -44 + by, 2, 2, '#f0ead8'); P(-3 + sway, -43 + by, 2, 2, '#f0ead8'); P(1 + sway, -42 + by, 2, 2, '#d8d0b8');
      P(-1 + sway, -45 + by, 2, 1, team); P(-3 + sway, -44 + by, 2, 1, team); P(1 + sway, -43 + by, 2, 1, team); P(-5, -41 + by, 2, 3, '#d8d0b8');
    }
  } else {
    P(-3, -36 + by, 7, 7, skin); P(-3, -30 + by, 7, 1, skinD); P(-3, -36 + by, 1, 7, skinD);
    P(2, -34 + by, 1, 1, Math.sin((o.clock || 0) * 1.3 + seed) > 0.975 ? skinD : ink); P(1, -35 + by, 3, 1, shade(hair, 0.8)); P(4, -33 + by, 1, 1, skin); P(2, -31 + by, 2, 1, skinD); P(-1, -34 + by, 1, 2, skinD);      // he blinks; a brow, a nose, a mouth and an ear
    const style = seed % 3;
    if (style !== 1) { P(-3, -37 + by, 7, 2, hair); P(-3, -35 + by, 2, 3, hair); } else P(-3, -36 + by, 6, 1, shade(hair, 1.2));
    if (style === 2) P(-4, -35 + by, 2, 6, hair);
    if (seed % 5 < 2) { P(1, -31 + by, 3, 2, hair); P(0, -32 + by, 1, 2, hair); }
    if (seed % 7 === 0) P(3, -35 + by, 1, 3, shade(skin, 0.6));          // an old scar
    if (cls === 'retiarius') { P(-3, -36 + by, 7, 1, team); P(-4, -36 + by, 1, 3, teamD); }
    if (cls === 'dimachaerus') {
      P(-3, -38 + by, 7, 3, metal); P(-3, -38 + by, 6, 1, metalL); P(-4, -36 + by, 2, 4, metal); P(-1, -39 + by, 2, 1, metalD);
    }
  }

  if (kneel) {
    // weapon and shield dropped
    L(7, -1, 15, -1, 1, blade); P(6, -2, 1, 2, hilt);
    if (c.shield) { P(-18, -3, 8, 3, teamD); P(-17, -2, 6, 1, team); }
    L(-2, -26 + by, -4, -19 + by, 3, arm); P(-5, -19 + by, 2, 2, skin);
    if (o.yielded) { L(2, -27 + by, 4, -33 + by, 3, arm); L(4, -33 + by, 4, -38 + by, 2, skin); P(4, -41 + by, 1, 3, skin); }
    else { L(2, -26 + by, 4, -19 + by, 3, arm); P(4, -19 + by, 2, 2, skin); }
  } else {
    // ---- weapon arm ----
    // Key poses for elbow (e), hand (h) and the direction the weapon points (v). The arm eases between
    // them: drawn back through the wind-up, snapped forward on the blow, then carried back to guard.
    const long = c.weapon === 'spear' || c.weapon === 'trident';
    const K = long ? {
      idle:   { e: [1, -22],  h: [4, -22],  v: [0.97, -0.24] },
      windup: { e: [-4, -25], h: [-7, -27], v: [0.97, -0.24] },
      strike: { e: [4, -24],  h: [9, -24],  v: [1, 0] },
      cheer:  { e: [-1, -31], h: [1, -36],  v: [0, -1] },
    } : {
      idle:   { e: [-4, -22], h: [-5, -26], v: [0.22, -0.97] },     // sword held high behind the shoulder
      windup: { e: [-4, -25], h: [-6, -29], v: [-0.35, -0.94] },
      strike: { e: [3, -24],  h: [8, -24],  v: [1, 0] },
      cheer:  { e: [-1, -31], h: [1, -36],  v: [0, -1] },
    };
    const mix = (a, b, t) => ({ e: [a.e[0] + (b.e[0] - a.e[0]) * t, a.e[1] + (b.e[1] - a.e[1]) * t], h: [a.h[0] + (b.h[0] - a.h[0]) * t, a.h[1] + (b.h[1] - a.h[1]) * t], v: [a.v[0] + (b.v[0] - a.v[0]) * t, a.v[1] + (b.v[1] - a.v[1]) * t] });
    const ease = t => t * t * (3 - 2 * t);
    let A = K.idle;
    if (o.cheer) A = K.cheer;
    else if (o.windup) A = mix(K.idle, K.windup, ease(o.windP === undefined ? 1 : o.windP));
    else if (o.atkAnim > 0.45) A = K.strike;
    else if (o.atkAnim > 0) A = mix(K.strike, K.idle, ease(1 - o.atkAnim / 0.45));
    A = { e: [Math.round(A.e[0]), Math.round(A.e[1])], h: [Math.round(A.h[0]), Math.round(A.h[1])], v: A.v };
    const vn = Math.hypot(A.v[0], A.v[1]) || 1;
    const hx = A.h[0], hy = A.h[1] + by;
    const vx = A.v[0] / vn, vy = A.v[1] / vn;
    let tx, ty;
    if (long) {
      const ax = hx - vx * 9, ay = hy - vy * 9, bx = hx + vx * 12, bY = hy + vy * 12;
      L(ax, ay, bx, bY, 1, wood);
      tx = bx + vx * 4; ty = bY + vy * 4;
      if (c.weapon === 'spear') {
        L(bx, bY, tx, ty, 1, blade);
        P(Math.round(bx + vx * 1.5 - vy), Math.round(bY + vy * 1.5 + vx), 1, 1, blade); P(Math.round(bx + vx * 1.5 + vy), Math.round(bY + vy * 1.5 - vx), 1, 1, bladeD);
      } else {
        L(bx - vy * 2, bY + vx * 2, bx + vy * 2, bY - vx * 2, 1, bladeD);
        for (const k of [-2, 0, 2]) L(bx - vy * k, bY + vx * k, bx - vy * k + vx * 4, bY + vx * k + vy * 4, 1, blade);
      }
    } else {
      const len = c.weapon === 'gladius' ? 9 : c.weapon === 'sica' ? 5 : 7;
      tx = hx + vx * len; ty = hy + vy * len;
      L(hx + vx, hy + vy, tx, ty, 2, blade); L(hx + vx, hy + vy, tx, ty, 1, bladeD);
      if (c.weapon === 'sica') {         // the blade hooks forward
        const cs = 0.64, sn = 0.77, rx = vx * cs - vy * sn, ry = vx * sn + vy * cs;
        L(tx, ty, tx + rx * 4, ty + ry * 4, 2, blade); tx += rx * 4; ty += ry * 4;
      }
      P(Math.round(tx), Math.round(ty) - 1, 1, 1, '#ffffff');
      if (weaponT === 3) { const q = ((o.clock || 0) * 0.55 + seed * 0.13) % 1; if (q < 0.22) { const k = q / 0.22; P(Math.round(hx + vx * (1 + (len - 1) * k)), Math.round(hy + vy * (1 + (len - 1) * k)), 1, 1, '#ffffff'); } }      // a glint runs up a fine blade
      P(Math.round(hx - vy) - 1, Math.round(hy + vx) - 1, 2, 2, hilt); P(Math.round(hx + vy) - 1, Math.round(hy - vx) - 1, 2, 2, hilt);
    }
    L(-1, -26 + by, A.e[0], A.e[1] + by, 3, arm); L(A.e[0], A.e[1] + by, hx, hy, 3, arm);
    if (manica) P(A.e[0] - 1, A.e[1] + by - 1, 3, 1, armD);
    P(hx - 1, hy - 1, 3, 3, skin); P(hx - 1, hy + 1, 3, 1, skinD);
    if (striking && o.atkAnim > 0.55) {          // the sweep of the blow: a fading trail from the wind-up to the strike
      const reach = long ? 16 : c.weapon === 'gladius' ? 9 : 7;
      inked = 0;
      for (let i = 1; i <= 5; i++) {
        const t = i / 6, m = mix(K.windup, K.strike, t), n = Math.hypot(m.v[0], m.v[1]) || 1;
        P(Math.round(m.h[0] + m.v[0] / n * reach), Math.round(m.h[1] + by + m.v[1] / n * reach - Math.sin(t * Math.PI) * 3), 2, 2, `rgba(255,255,255,${(0.1 + t * 0.5).toFixed(2)})`);
      }
      P(Math.round(tx) + 1, Math.round(ty) - 3, 1, 7, 'rgba(255,255,255,.8)');
      inked = 1;
    }

    // ---- off hand: shield, net or second blade ----
    const so = o.bash ? 4 : o.guard > 0 ? 2 : 0, sy = (o.guard > 0 ? -3 : 0) + by + (o.moving && Math.sin(ph * 2) > 0.2 ? 1 : 0);      // the shield rides with his stride
    if (cls === 'murmillo') {
      const sx = 4 + so;
      P(sx, -29 + sy, 6, 19, teamD); P(sx + 1, -28 + sy, 4, 17, team); P(sx + 1, -28 + sy, 1, 17, teamL);
      P(sx, -29 + sy, 6, 1, metal); P(sx, -11 + sy, 6, 1, metal);
      P(sx + 2, -21 + sy, 2, 3, gold); P(sx + 1, -25 + sy, 4, 1, gold); P(sx + 1, -15 + sy, 4, 1, gold);
    } else if (cls === 'thraex') {
      const sx = 4 + so;
      P(sx, -27 + sy, 6, 10, teamD); P(sx + 1, -26 + sy, 4, 8, team); P(sx + 1, -26 + sy, 1, 8, teamL);
      P(sx + 2, -23 + sy, 2, 2, gold); P(sx, -27 + sy, 6, 1, metal);
    } else if (cls === 'hoplomachus') {
      const sx = 4 + so;
      P(sx + 1, -26 + sy, 4, 8, metal); P(sx, -25 + sy, 6, 6, metal); P(sx + 1, -26 + sy, 2, 1, metalL); P(sx, -25 + sy, 1, 3, metalL);
      P(sx + 1, -24 + sy, 4, 4, team); P(sx + 2, -23 + sy, 2, 2, metalL); P(sx + 5, -22 + sy, 1, 3, metalD);
    }
    if (c.shield && o.shieldDmg) {          // cracks, then a corner gone
      const sx = 4 + so, top = cls === 'murmillo' ? -29 : -27;
      P(sx + 2, top + 3 + sy, 1, 4, ink); P(sx + 3, top + 6 + sy, 1, 3, ink); P(sx + 1, top + 8 + sy, 2, 1, ink);
      if (o.shieldDmg >= 2) { P(sx + 3, top + sy, 3, 3, '#3a2a1c'); P(sx + 2, top + 2 + sy, 2, 2, '#3a2a1c'); P(sx + 4, top + 5 + sy, 1, 3, ink); P(sx, top + 5 + sy, 2, 1, ink); }
    }
    if (cls === 'retiarius') {
      L(2, -26 + by, 5, -21 + by, 3, arm); P(4, -22 + by, 3, 3, skin);
      P(-8, -34 + by, 5, 1, metalL); P(-8, -33 + by, 4, 8, metal); P(-8, -33 + by, 1, 8, metalL); P(-5, -33 + by, 1, 8, metalD);   // shoulder guard
      P(4, -20 + by, 5, 6, '#cfc3a0'); P(5, -14 + by, 3, 4, '#cfc3a0'); P(6, -10 + by, 1, 3, '#b3a785');
      for (let y = -19; y <= -11; y += 2) P(5 + (y & 2 ? 0 : 1), y + by, 1, 1, '#8f8363');
      P(7, -19 + by, 1, 1, '#8f8363'); P(7, -15 + by, 1, 1, '#8f8363');
    } else {
      const up = striking;
      const fx = up ? 4 : 7, fy = (up ? -24 : -20) + by, wx = up ? 0.25 : 0.8, wy = up ? -0.97 : -0.6;
      L(fx + wx, fy + wy, fx + wx * 7, fy + wy * 7, 2, blade); L(fx + wx, fy + wy, fx + wx * 7, fy + wy * 7, 1, bladeD);
      P(Math.round(fx - wy) - 1, Math.round(fy + wx) - 1, 2, 2, hilt);
      L(2, -26 + by, fx, fy, 3, arm); P(fx - 1, fy - 1, 3, 3, skin);
    }
  }

  lean = 0;
  // ---- snared in the net ----
  if (o.snare > 0) {
    for (let i = -10; i <= 10; i += 4) sprPut(X + i, Y - 38, 1, 38, 'rgba(232,220,180,.75)', 0);
    for (let j = -38; j <= -2; j += 5) sprPut(X - 10, Y + j, 21, 1, 'rgba(232,220,180,.75)', 0);
  }
}

// ---------- beasts ----------
// bw/bh body, lh/lw legs, hw/hh head, hy head height relative to the back, tail style
const BEAST_ART = {
  boar: { col: '#5e4636', bw: 18, bh: 9, lh: 4, lw: 3, hw: 7, hh: 7, hy: 3, tail: 0 },
  wolf: { col: '#8b8e94', bw: 17, bh: 6, lh: 6, lw: 2, hw: 6, hh: 5, hy: -2, tail: 1 },
  lion: { col: '#c9974a', bw: 20, bh: 8, lh: 7, lw: 3, hw: 7, hh: 7, hy: -3, tail: 2, mane: '#8a5a22' },
  bear: { col: '#6b4a2e', bw: 22, bh: 12, lh: 6, lw: 4, hw: 8, hh: 8, hy: 1, tail: 0 },
};

// A beast, with the same dark line round it as a fighter has. Each kind has its own head, ears, tail and markings;
// what they share is a rounded body on BEAST_ART's measures, legs that step in diagonal pairs, a mouth that opens
// to strike, and wounds that show.
function beastRects(o) {
  const kind = o.g.cls, a = BEAST_ART[kind], d = o.facing, X = Math.round(o.x), Y = Math.round(o.y), T = o.clock || 0;
  const white = o.flash > HIT_WHITE, hurtK = o.flash > 0 && !white ? o.flash / HIT_WHITE : 0;
  let inked = 1;      // body has the dark line round it; shadow, claws, the flash of a blow and a net do not
  const P = (x, y, w, h, col) => sprPut(d > 0 ? X + x : X - x - w, Y + y, w, h, white ? '#fff' : hurtK ? flush(col, hurtK) : col, inked);
  const col = a.col, colD = shade(col, 0.7), colDD = shade(col, 0.52), colL = shade(col, 1.22), ink = '#1c1310', hb = Math.floor(a.bw / 2);
  const belly = { boar: shade(col, 0.85), wolf: '#c9ccd2', lion: '#e3c486', bear: shade(col, 0.82) }[kind];
  const eye = { boar: '#c23b2e', wolf: '#e8c84a', lion: '#e8a83a', bear: '#1c1310' }[kind];
  const seed = o.g.id * 7919 % 97;
  // its shadow: a pool under it; or, out in the province, where the sun is somewhere (o.shadow.cast), thrown from it as a man's is
  { const sh = o.shadow && o.shadow.cast ? o.shadow : null;
    if (!sh) { sprPut(X - hb - 2, Y - 2, a.bw + 8, 3, 'rgba(0,0,0,.2)', 0); sprPut(X - hb + 1, Y - 1, a.bw + 2, 2, 'rgba(0,0,0,.18)', 0); }
    else { const sc = `rgba(0,0,0,${(sh.a * 0.9).toFixed(3)})`, lf = sh.dir < 0 ? sh.len : 0; sprPut(X - hb - 2 - lf, Y - 2, a.bw + 4 + sh.len, 3, sc, 0); sprPut(X - hb + 1, Y - 1, a.bw + 2, 2, `rgba(0,0,0,${(sh.a * 0.8).toFixed(3)})`, 0); if (sh.len > 3) sprPut(sh.dir < 0 ? X - hb - 4 - sh.len : X + hb + 2 + sh.len, Y - 2, 2, 2, sc, 0); } }

  if (o.down && !o.falling) {                    // on its side, legs out, done
    P(-hb + 1, -a.bh + 1, a.bw - 2, 1, colL); P(-hb, -a.bh + 2, a.bw, a.bh - 3, col); P(-hb + 1, -1, a.bw - 2, 1, colDD); P(-hb, -3, a.bw, 2, colD);
    P(-hb + 3, -a.bh - 3, a.lw, 5, colD); P(-hb + 3, -a.bh - 4, a.lw + 1, 1, colDD); P(hb - a.lw - 4, -a.bh - 3, a.lw, 5, colD); P(hb - a.lw - 4, -a.bh - 4, a.lw + 1, 1, colDD);
    if (a.mane) { P(hb - 6, -a.hh - 2, a.hw + 4, a.hh + 2, a.mane); P(hb - 5, -a.hh - 3, a.hw + 1, 1, shade(a.mane, 1.2)); }
    P(hb - 1, -a.hh + 1, a.hw, a.hh - 1, col); P(hb - 1, -2, a.hw, 2, colD); P(hb + a.hw - 2, -4, 3, 3, belly);
    P(hb + a.hw - 3, -a.hh + 3, 2, 1, ink);                         // the eye, shut
    P(hb + a.hw, -1, 2, 1, '#b3261c');                              // the tongue
    if (kind === 'wolf') P(-hb - 5, -3, 6, 2, col);
    if (kind === 'lion') { P(-hb - 6, -2, 7, 1, col); P(-hb - 8, -3, 3, 2, a.mane); }
    return;
  }

  const lunge = Math.round(o.atkAnim * 3) - (o.windup ? 2 : 0);
  const frame = o.moving ? Math.floor(o.walk) % 4 : -1;
  const bob = o.moving ? frame % 2 : (Math.sin(T * (o.hurt >= 2 ? 4.6 : 2.2)) > 0.6 ? 1 : 0);
  const sw = o.moving ? [2, 0, -2, 0][frame] : 0;
  const crouch = o.windup ? 1 : 0;                                  // it gathers itself before it springs
  const x0 = -hb + lunge, top = -(a.lh + a.bh) - (o.moving ? bob : 0) + crouch, bw = a.bw, bh = a.bh, lh = a.lh - crouch, lw = a.lw;

  // ---- legs: far pair behind in shade, near pair in front; diagonal pairs swing together, the stepping foot lifted ----
  const leg = (x, swing, c, cD, claws) => {
    const up = Math.ceil(lh / 2), lo = lh - up, lift = o.moving && swing > 0 ? 1 : 0;
    P(x, -lh, lw + 1, up, c);                                       // thigh or shoulder
    P(x + Math.sign(swing), -lo - lift, lw, lo, c); P(x + Math.sign(swing), -lo - lift, 1, lo, cD);
    P(x + Math.sign(swing) + (swing ? swing > 0 ? 1 : -1 : 0), -1 - lift, lw + 1, 1, cD);      // the paw or hoof
    if (claws) { inked = 0; P(x + Math.sign(swing) + lw + (swing > 0 ? 1 : 0), -1 - lift, 1, 1, '#f2ecd8'); inked = 1; }
  };
  const claws = kind === 'bear' || kind === 'lion';
  leg(x0 + 1, -sw, colD, colDD, false); leg(x0 + bw - lw - 5, sw, colD, colDD, false);
  // ---- tail ----
  const wag = Math.sin(T * (o.moving ? 9 : 3) + seed) > 0 ? 1 : 0;
  if (kind === 'wolf') { P(x0 - 3, top + 1, 4, 2, col); P(x0 - 6, top + 2 + wag, 4, 3, col); P(x0 - 7, top + 4 + wag, 3, 2, belly); P(x0 - 6, top + 2 + wag, 4, 1, colD); }
  if (kind === 'lion') { P(x0 - 4, top + 2, 5, 1, col); P(x0 - 6, top + 1 - wag, 2, 2, col); P(x0 - 7, top - 2 - wag, 1, 4, col); P(x0 - 9, top - 4 - wag, 3, 3, a.mane); }
  if (kind === 'boar') { P(x0 - 1, top + 2, 1, 2, colD); P(x0 - 2, top + 1 + wag, 1, 2, colD); }
  if (kind === 'bear') P(x0 - 1, top + 2, 2, 2, colD);
  // ---- body: rounded at the corners, lit along the back, in shade under the belly ----
  P(x0 + 1, top, bw - 2, 1, colL); P(x0, top + 1, bw, bh - 2, col); P(x0 + 1, top + bh - 1, bw - 2, 1, colDD);
  P(x0, top + bh - 3, bw, 2, colD); P(x0 + 3, top + bh - 2, bw - 8, 1, belly);
  P(x0, top + 1, 1, 1, colD);                                       // the haunch
  P(x0 + 1, top + 2, 4, bh - 4, shade(col, 0.9)); P(x0 + bw - 6, top + 1, 5, bh - 3, shade(col, 1.08));      // hip and shoulder
  if (kind === 'boar') { for (let k = 1; k < bw - 1; k += 2) P(x0 + k, top - 1 - (k % 4 === 1 ? 1 : 0), 1, 1 + (k % 4 === 1 ? 1 : 0), ink); P(x0 + 4, top + 3, bw - 9, 1, colL); }      // a ridge of bristles
  if (kind === 'wolf') { P(x0 + 2, top, bw - 5, 2, colD); P(x0 + bw - 7, top + 2, 4, 1, colD); }          // a dark saddle
  if (kind === 'lion') P(x0 + 2, top + 1, bw - 10, 1, colL);
  if (kind === 'bear') { P(x0 + 3, top - 1, bw - 8, 1, col); P(x0 + bw - 9, top - 2, 7, 2, col); P(x0 + bw - 8, top - 3, 5, 1, colL); for (let k = 2; k < bw - 3; k += 3) P(x0 + k, top + 3 + (k % 2), 1, 2, colD); }      // the hump, and shag
  // ---- wounds ----
  if (o.hurt) { const bl = '#a3261b', blD = '#7a1a12'; P(x0 + 6, top + 2, 3, 2, bl); P(x0 + 7, top + 4, 1, 2, blD); if (o.hurt >= 2) { P(x0 + bw - 9, top + 3, 2, 3, bl); P(x0 + 3, top + 4, 2, 1, bl); } if (o.hurt >= 3) { P(x0 + 9, top + 1, 4, 1, bl); P(x0 + bw - 5, top + bh - 3, 2, 3, blD); } }
  // near legs go over the body
  leg(x0 + 3, sw, col, colD, claws); leg(x0 + bw - lw - 2, -sw, col, colD, claws);

  // ---- head ----
  const hx = x0 + bw - 2, hy = top + a.hy + (o.moving ? 0 : bob) + crouch, hw = a.hw, hh = a.hh;
  const open = o.atkAnim > 0.3 || o.windup;
  if (kind === 'lion') {                         // the mane first: a ruff all round the face
    const m = a.mane, mL = shade(m, 1.25), mD = shade(m, 0.75);
    P(hx - 5, hy - 2, hw + 4, hh + 5, m); P(hx - 4, hy - 4, hw + 1, 2, m); P(hx - 6, hy, 2, hh + 1, mD); P(hx - 4, hy + hh + 3, hw, 1, mD);
    P(hx - 3, hy - 4, hw - 2, 1, mL); P(hx - 4, hy - 2, 1, 3, mL); for (let k = 0; k < 4; k++) P(hx - 4 + k * 2, hy + 2 + (k % 2) * 2, 1, 3, mD);
  }
  if (kind === 'wolf') P(hx - 2, hy + 1, 4, hh, shade(col, 0.92));          // the ruff of the neck
  P(hx + 1, hy, hw - 1, 1, colL); P(hx, hy + 1, hw, hh - 1, col); P(hx, hy + hh - 2, hw, 2, colD);
  // ears
  if (kind === 'wolf') { P(hx + 1, hy - 3, 2, 3, col); P(hx + 1, hy - 4, 1, 1, colD); P(hx + 2, hy - 2, 1, 2, '#6a4a52'); P(hx + 4, hy - 2, 1, 2, colD); }
  else if (kind === 'boar') { P(hx + 1, hy - 2, 2, 3, colD); P(hx + 2, hy - 1, 1, 1, '#8a6a5a'); }
  else { P(hx + 1, hy - 2, 2, 2, kind === 'lion' ? col : colD); P(hx + 2, hy - 1, 1, 1, kind === 'lion' ? '#8a5a3a' : colDD); if (kind === 'bear') P(hx + hw - 3, hy - 2, 2, 2, colD); }
  // muzzle
  const mz = hy + hh - 4;
  if (kind === 'wolf') { P(hx + hw - 1, mz, 5, 3, col); P(hx + hw - 1, mz + 2, 5, 1, belly); P(hx + hw - 1, mz, 5, 1, colL); P(hx + hw + 3, mz, 1, 1, ink); P(hx + 1, hy + hh - 2, hw - 2, 1, belly); }
  else if (kind === 'boar') { P(hx + hw - 1, mz - 1, 4, 4, col); P(hx + hw + 2, mz - 1, 1, 4, '#8a6a5a'); P(hx + hw + 2, mz, 1, 1, ink); P(hx + hw + 2, mz + 2, 1, 1, ink); }
  else if (kind === 'lion') { P(hx + hw - 1, mz, 3, 3, belly); P(hx + hw + 1, mz, 1, 1, '#5a3a2a'); P(hx + hw - 2, mz + 2, 3, 1, '#f4ead4'); }
  else { P(hx + hw - 1, mz, 4, 3, '#a8845c'); P(hx + hw - 1, mz, 4, 1, '#c09a6e'); P(hx + hw + 2, mz, 1, 1, ink); }
  // the eye: it narrows when it strikes, and now and then it blinks
  const blink = !open && Math.sin(T * 1.1 + seed) > 0.975;
  if (!blink) { P(hx + hw - 3, hy + 2, open ? 2 : 1, 1, eye); if (kind !== 'bear') P(hx + hw - 4, hy + 1, 3, 1, colD); } else P(hx + hw - 4, hy + 2, 3, 1, colD);
  if (kind === 'boar') { P(hx + hw, hy + hh - 2, 1, 2, '#f2ecd8'); P(hx + hw + 1, hy + hh - 4, 1, 2, '#f2ecd8'); P(hx + hw + 2, hy + hh - 5, 1, 1, '#ffffff'); }       // tusks, curving up
  // the mouth: open to bite, with the teeth showing
  if (open) {
    const jw = kind === 'wolf' ? 5 : 4;
    P(hx + hw - 1, hy + hh - 1, jw, 2, '#7a1a12'); P(hx + hw - 1, hy + hh + 1, jw - 1, 1, colD);
    P(hx + hw, hy + hh - 1, 1, 1, '#ffffff'); P(hx + hw + 2, hy + hh - 1, 1, 1, '#ffffff'); P(hx + hw + 1, hy + hh, 1, 1, '#ffffff');
    if (kind === 'lion' || kind === 'bear') P(hx + hw + jw - 2, hy + hh - 1, 1, 2, '#ffffff');
  }
  inked = 0;                                     // what follows is light and net, not part of the outline
  if (o.slash > 0) { P(hx + hw + 4, hy, 1, hh + 2, '#ffffff'); P(hx + hw + 6, hy + 1, 1, hh, 'rgba(255,255,255,.6)'); if (claws) P(hx + hw + 8, hy + 2, 1, hh - 2, 'rgba(255,255,255,.35)'); }
  if (o.snare > 0) {
    for (let i = -hb - 2; i <= hb + a.hw + 2; i += 4) sprPut(X + (d > 0 ? i : -i), Y + top - 4, 1, -top + 4, 'rgba(232,220,180,.75)', 0);
    for (let j = top - 4; j <= -2; j += 5) sprPut(X - hb - a.hw - 2, Y + j, a.bw + 2 * a.hw + 4, 1, 'rgba(232,220,180,.75)', 0);
  }
}

// The arena sprite on a portrait canvas. Beasts still use this; fighters get a close-up (art.js).
function drawSpritePortrait(canvas, g, team, col, colD) {
  const ctx = canvas.getContext('2d');
  const full = canvas.width >= 100;
  const low = !full && g.beast;                 // a beast stands low: in a small frame it is shown whole, not cropped as a man is to his head
  const s = full ? 3 : low ? Math.max(1, Math.round(canvas.width / 30)) : Math.max(2, Math.round(canvas.width / 18));
  const w = canvas.width / s, h = canvas.height / s;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#54433a'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#483930';
  for (let y = 4, r = 0; y < h; y += 6, r++) { ctx.fillRect(0, y, w, 1); for (let x = r % 2 ? 4 : 10; x < w; x += 12) ctx.fillRect(x, y - 5, 1, 5); }
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, 0, w, 2);
  if (full) { ctx.fillStyle = '#c9a763'; ctx.fillRect(0, h - 5, w, 5); ctx.fillStyle = '#a88a52'; ctx.fillRect(0, h - 5, w, 1); }
  drawSprite(ctx, {
    x: Math.round(w / 2) - (full ? 4 : low ? -5 : 2), y: low ? Math.round(h * 0.74) : full ? Math.round(h) - 3 : Math.round(h) + 20, facing: 1, g, team: team || 0, col, colD,
    moving: false, walk: 0, clock: 0, atkAnim: 0, flash: 0, down: false, snare: 0, slash: 0,
  });
}

// A small picture from the interface's icon maps (art.js), drawn on the fight's own canvas.
function drawIcon(ctx, name, x, y, s) {
  const map = typeof ICONS !== 'undefined' && ICONS[name];
  if (!map) return;
  map.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const c = ART_PAL[row[i]]; if (c) { ctx.fillStyle = c; ctx.fillRect(x + i * s, y + j * s, s, s); } } });
}
const STYLE_COL = { str: '#e2695c', agi: '#ffd24a', skl: '#8fc0ff' };

// The announcement of an ability: the sand dims, a slanted band in his side's colour sweeps in with streaks of speed,
// his likeness close up at one end and the ability's name at the other, and it is gone again in under a second.
// Drawn on the interface layer (320 by 180). Your side comes in from the left, the other from the right.
// The card before a fight. Two halves come in from the two sides, each in its side's colour with its men drawn large;
// they meet with a clash and VS between them; beneath, whose style has the edge and how the two sides weigh against each
// other. Then the halves part and the cloth falls.
function drawIntro(ctx, B, T) {
  const ti = B.introDur - B.intro, cl = v => clamp(v, 0, 1);
  const e = 1 - Math.pow(1 - cl((ti - 0.3) / 0.45), 3), o = Math.pow(cl((0.55 - B.intro) / 0.45), 2), live = Math.min(e, 1 - o);
  if (live <= 0) return;
  const side = t => B.fighters.filter(f => f.team === t), one = t => side(t).length === 1 ? side(t)[0] : null;
  const power = t => side(t).reduce((n, q) => n + q.g.stats.str + q.g.stats.agi + q.g.stats.skl, 0);
  const beast = t => side(t).some(f => f.g.beast);
  const clash = ti - 0.75, jolt = clash >= 0 && clash < 0.3 ? 1 - clash / 0.3 : 0;
  const top = 50, bot = 112, mid = 160, skew = 12;
  ctx.save();
  ctx.fillStyle = `rgba(8,5,2,${(0.5 * live).toFixed(3)})`; ctx.fillRect(0, 0, 320, 180);
  for (const t of [0, 1]) {
    const dir = t ? -1 : 1, off = -dir * ((1 - e) * 230 + o * 230) + (jolt ? Math.round(Math.sin(ti * 90 + t) * jolt * 2) : 0);
    const fs = side(t), col = B.col[t], colD = B.colD[t];
    const inner = mid - dir * 3 + off, outer = (t ? 340 : -20) + off;
    const half = () => { ctx.beginPath(); ctx.moveTo(outer, top); ctx.lineTo(inner + skew, top); ctx.lineTo(inner - skew, bot); ctx.lineTo(outer, bot); ctx.closePath(); };
    half(); ctx.fillStyle = colD; ctx.fill();
    const g = ctx.createLinearGradient(0, top, 0, bot); g.addColorStop(0, 'rgba(255,255,255,.2)'); g.addColorStop(0.5, col); g.addColorStop(1, 'rgba(0,0,0,.4)');
    half(); ctx.globalAlpha = 0.85; ctx.fillStyle = g; ctx.fill(); ctx.globalAlpha = 1;
    ctx.save(); half(); ctx.clip();
    for (let i = 0; i < 9; i++) {               // the light moving across it
      const y = top + 3 + (i * 29) % (bot - top - 6), x = ((i * 67 + T * dir * 90) % 240 + 240) % 240 + (t ? 150 : -40);
      ctx.fillStyle = `rgba(255,255,255,${(0.06 + (i % 3) * 0.04).toFixed(2)})`; ctx.fillRect(x + off, y, 30 + (i % 4) * 12, 1);
    }
    // its men, large: one alone stands tall, a band stands in a rank
    const show = fs.slice(0, 4), n = show.length, zoom = n === 1 ? 2.3 : n === 2 ? 1.8 : 1.45, x0 = (t ? 320 - (n === 1 ? 34 : 26) : (n === 1 ? 34 : 26)) + off, gap = n === 1 ? 0 : Math.min(18, 36 / (n - 1));
    show.forEach((f, i) => {
      const k = n - 1 - i, x = x0 + dir * k * gap, bob = Math.round(Math.sin(T * 3 + i * 1.7) * 0.6);
      ctx.save(); ctx.translate(Math.round(x), bot + (f.g.beast ? (n === 1 ? 2 : 0) : n === 1 ? 34 : 14) + (f.g.beast ? 0 : bob) + (k % 2 ? -3 : 0)); ctx.scale(zoom, zoom);
      drawSprite(ctx, { x: 0, y: 0, facing: dir, g: f.g, team: f.team, col, colD, moving: false, walk: 0, clock: T + i, atkAnim: 0, flash: clash >= 0 && clash < 0.08 ? 1 : 0, down: false, snare: 0, slash: 0, shadow: { len: 0, a: 0 }, noHelm: f.noHelm, cheer: n === 1 && clash > 0.5 && clash < 1.5 && !f.g.beast ? T : 0 });
      ctx.restore();
    });
    ctx.restore();
    ctx.fillStyle = '#e0aa3e'; ctx.fillRect(t ? inner : outer, top - 2, Math.abs(inner - outer) + skew, 2); ctx.fillRect(t ? inner - skew : outer, bot, Math.abs(inner - outer) + skew, 2);
    // who they are
    const f1 = one(t), tx = mid - dir * 20 + off, ta = cl((ti - 0.55) / 0.3);
    ctx.globalAlpha = ta; ctx.textAlign = t ? 'left' : 'right'; ctx.textBaseline = 'alphabetic';
    const name = f1 ? (f1.g.beast ? 'A ' + f1.c.name : f1.g.name) : (B.names ? B.names[t] : `${fs.length} fighters`);
    let size = 12; ctx.font = `bold ${size}px Cinzel, Georgia, serif`;
    while (size > 6 && ctx.measureText(name.toUpperCase()).width > (f1 ? 92 : 66)) { size--; ctx.font = `bold ${size}px Cinzel, Georgia, serif`; }
    ctx.fillStyle = 'rgba(20,10,4,.85)'; ctx.fillText(name.toUpperCase(), tx + 1, 70 + 1.2); ctx.fillStyle = '#fff6dc'; ctx.fillText(name.toUpperCase(), tx, 70);
    ctx.font = 'bold 5px Consolas, monospace';
    const lines = [];
    if (f1 && f1.g.beast) lines.push(['A BEAST', '#f1e6c8']);
    else if (f1) {
      lines.push([`THE ${f1.c.name.toUpperCase()}`, '#f1e6c8']);
      lines.push([`POWER ${power(t)}   ${f1.style ? STAT_NAMES[f1.style].toUpperCase() : 'NO STYLE'}`, f1.style ? STYLE_COL[f1.style] : '#c9b9a0']);
      if ((f1.g.wins || 0) + (f1.g.losses || 0) > 0) lines.push([`${f1.g.wins || 0} WON   ${f1.g.losses || 0} LOST`, '#c9b9a0']);
    } else {
      lines.push([`${fs.length} FIGHTERS   POWER ${power(t)}`, '#f1e6c8']);
      const ns = fs.map(f => f.g.beast ? f.c.name : f.g.name);
      for (let i = 0; i < Math.min(ns.length, 6); i += 2) lines.push([ns.slice(i, i + 2).join(', ').toUpperCase() + (i + 2 >= 6 && ns.length > 6 ? ' ...' : ''), '#c9b9a0']);
    }
    lines.forEach(([str, c], i) => edgedText(ctx, str, tx, 79 + i * 7, c, 0.6));
    ctx.globalAlpha = 1;
  }
  // VS, struck where the halves meet
  if (clash >= 0 && !o) {
    const k = cl(clash / 0.16), sc = 3 - 2 * k, vy = (top + bot) / 2;
    ctx.save(); ctx.translate(mid, vy); ctx.rotate(-0.12); ctx.scale(sc, sc);
    ctx.fillStyle = 'rgba(14,8,4,.9)'; ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(14, 0); ctx.lineTo(0, 15); ctx.lineTo(-14, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e0aa3e'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.font = 'bold 13px Cinzel, Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = k < 1 ? '#ffffff' : '#ffd24a'; ctx.fillText('VS', 0, 1);
    ctx.restore();
    for (let i = 0; i < 10; i++) {              // and the sparks off it
      const an = i * 0.628 + 0.3, r = 12 + clash * 90; if (clash > 0.45) break;
      ctx.globalAlpha = 1 - clash / 0.45; ctx.fillStyle = i % 2 ? '#fff6dc' : '#ffd24a'; ctx.fillRect(mid + Math.cos(an) * r, vy + Math.sin(an) * r * 0.7, 2, 2);
    }
    ctx.globalAlpha = 1;
  }
  // beneath: how the two sides weigh against each other, and whose style has the edge
  const ba = cl((ti - 1.15) / 0.35) * (1 - o);
  if (ba > 0) {
    ctx.globalAlpha = ba; ctx.textBaseline = 'alphabetic';
    let y = bot + 6;
    if (!beast(0) && !beast(1)) {
      const pa = power(0), pb = power(1), w = 150, x = mid - w / 2, cut = Math.round(w * pa / Math.max(1, pa + pb) * ba + w / 2 * (1 - ba));
      ctx.fillStyle = 'rgba(10,6,3,.85)'; ctx.fillRect(x - 1, y - 1, w + 2, 6);
      ctx.fillStyle = B.col[0]; ctx.fillRect(x, y, cut, 4); ctx.fillStyle = B.col[1]; ctx.fillRect(x + cut, y, w - cut, 4);
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x, y, w, 1);
      ctx.fillStyle = '#fff6dc'; ctx.fillRect(x + cut - 0.5, y - 2, 1, 8); ctx.fillStyle = '#e0aa3e'; ctx.fillRect(mid - 0.25, y + 4, 0.5, 2);
      ctx.font = 'bold 5px Consolas, monospace'; ctx.fillStyle = '#f1e6c8'; ctx.textAlign = 'right'; ctx.fillText(pa, x - 4, y + 4.5); ctx.textAlign = 'left'; ctx.fillText(pb, x + w + 4, y + 4.5);
      y += 10;
    }
    const a = one(0), b = one(1); let word = null, wc = '#f1e6c8';
    if (a && b && a.style && b.style && a.style !== b.style) {
      const mine = STYLE_BEATS[a.style] === b.style, theirs = STYLE_BEATS[b.style] === a.style;
      if (mine || theirs) { const w = mine ? a.style : b.style, l = mine ? b.style : a.style; word = `${STAT_NAMES[w].toUpperCase()} BEATS ${STAT_NAMES[l].toUpperCase()}`; wc = mine ? '#ff9a8a' : '#9cc4ff'; }
    }
    ctx.font = 'bold 5px Consolas, monospace'; ctx.textAlign = 'center';
    if (word) { const sw = ctx.measureText(word).width; ctx.fillStyle = 'rgba(10,6,3,.8)'; ctx.fillRect(mid - sw / 2 - 5, y, sw + 10, 8); ctx.fillStyle = wc; ctx.fillText(word, mid, y + 5.8); y += 10; }
    if (B.death) { const str = 'SINE MISSIONE  -  TO THE DEATH', sw = ctx.measureText(str).width; ctx.fillStyle = 'rgba(40,6,4,.9)'; ctx.fillRect(mid - sw / 2 - 5, top - 13, sw + 10, 8); ctx.fillStyle = '#ff6a5a'; ctx.fillText(str, mid, top - 7.2); }
    ctx.globalAlpha = 1;
  }
  if (ti > 1.6 && !o) { ctx.font = '4px Consolas, monospace'; ctx.textAlign = 'right'; edgedText(ctx, 'CLICK TO SKIP', 316, 176, '#e8dcc0', 0.4); }
  ctx.restore();
}

// How a fight ends. The word of it - VICTORY or DEFEAT - comes across on a band and stays while the fallen are judged;
// then the reckoning comes up from below: who carried the day, what he did, how long it took and what the stands made of it.
function drawOutro(ctx, B, T) {
  const o = B.outro, won = B.winner === 0, cl = v => clamp(v, 0, 1), wt = B.winner;
  if (o < 0.55) return;
  if (!B.endWord) {                             // how it was settled, fixed the moment it is first told
    const d = B.lastDown && B.lastDown.team !== wt ? B.lastDown : null, gave = B.fighters.filter(f => f.team !== wt && f.yielded);
    B.endWord = B.decision ? 'ON THE EDITOR\'S DECISION' : !d && gave.length ? (gave.length > 1 ? 'THEY YIELD' : `${gave[0].g.name.toUpperCase()} YIELDS`) : d ? `${(d.g.beast ? 'THE ' + d.c.name : d.g.name).toUpperCase()} ${d.yielded ? 'YIELDS' : d.g.beast ? 'IS SLAIN' : 'IS DOWN'}` : '';
    const side = B.fighters.filter(f => f.team === wt), up = side.filter(f => !out(f));
    B.hero = (up.length ? up : side).slice().sort((a, b) => b.dmgDealt - a.dmgDealt)[0] || null;
  }
  const e = 1 - Math.pow(1 - cl((o - 0.55) / 0.3), 3), dir = won ? 1 : -1, off = -dir * (1 - e) * 340;
  const top = 42, bot = 66, skew = 8, gold = won ? '#e0aa3e' : '#8e1b14';
  ctx.save();
  // the light of it: gold spreading for a win, the day going dark for a loss
  if (won) {
    ctx.globalAlpha = 0.5 * e;
    for (const odd of [0, 1]) {               // the rays, each colour laid in one stroke of the brush
      ctx.fillStyle = odd ? 'rgba(255,226,122,.16)' : 'rgba(255,246,220,.10)'; ctx.beginPath();
      for (let i = odd; i < 12; i += 2) { const an = i / 12 * 6.283 + T * 0.15, w = 0.07; ctx.moveTo(160, 54); ctx.lineTo(160 + Math.cos(an - w) * 260, 54 + Math.sin(an - w) * 260); ctx.lineTo(160 + Math.cos(an + w) * 260, 54 + Math.sin(an + w) * 260); ctx.closePath(); }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    const g = ctx.createRadialGradient(160, 96, 40, 160, 96, 190); g.addColorStop(0, 'rgba(20,4,4,0)'); g.addColorStop(1, `rgba(20,4,4,${(0.6 * e).toFixed(3)})`); ctx.fillStyle = g; ctx.fillRect(0, 0, 320, 180);
  }
  // the band
  const band = () => { ctx.beginPath(); ctx.moveTo(-20 + off + skew, top); ctx.lineTo(340 + off + skew, top); ctx.lineTo(340 + off - skew, bot); ctx.lineTo(-20 + off - skew, bot); ctx.closePath(); };
  band(); ctx.fillStyle = won ? 'rgba(46,30,8,.92)' : 'rgba(26,6,6,.92)'; ctx.fill();
  const g = ctx.createLinearGradient(0, top, 0, bot); g.addColorStop(0, won ? 'rgba(255,220,120,.30)' : 'rgba(160,40,30,.25)'); g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
  band(); ctx.fillStyle = g; ctx.fill();
  ctx.save(); band(); ctx.clip();
  for (let i = 0; i < 10; i++) { const y = top + 2 + (i * 13) % (bot - top - 3), x = ((i * 71 + T * dir * 60) % 380 + 380) % 380 - 30; ctx.fillStyle = `rgba(255,255,255,${(0.04 + (i % 3) * 0.03).toFixed(2)})`; ctx.fillRect(x, y, 26 + (i % 4) * 10, 1); }
  ctx.restore();
  ctx.fillStyle = gold; ctx.fillRect(Math.min(0, off) - 4, top - 1.5, 328 + Math.abs(off), 1.5); ctx.fillRect(Math.min(0, off) - 4, bot, 328 + Math.abs(off), 1.5);
  if (won) { ctx.fillStyle = '#fff0b0'; ctx.fillRect(Math.min(0, off) - 4, top - 1.5, 328 + Math.abs(off), 0.5); }
  // the word, struck a letter at a time
  const msg = won ? 'VICTORY' : 'DEFEAT', t0 = 0.7, step = 0.05;
  ctx.font = 'bold 17px Cinzel, Georgia, serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const sp = 2.5, mw = ctx.measureText(msg).width + sp * (msg.length - 1); let x = 160 - mw / 2;
  for (let i = 0; i < msg.length; i++) {
    const age = o - t0 - i * step, cw = ctx.measureText(msg[i]).width;
    if (age >= 0) {
      const pop = age < 0.16 ? 1 - age / 0.16 : 0, y = 59 - pop * 5;
      ctx.fillStyle = 'rgba(0,0,0,.85)'; ctx.fillText(msg[i], x + 1, y + 1.5);
      edgedText(ctx, msg[i], x, y, pop > 0.4 ? '#ffffff' : won ? '#ffd24a' : '#f08a7c', 0.7);
    }
    x += cw + sp;
  }
  const done = t0 + msg.length * step, ua = cl((o - done) / 0.3);
  if (ua > 0) {
    if (won) for (const sd of [-1, 1]) for (let i = 0; i < 5; i++) {           // laurel to either side of it
      const lx = 160 + sd * (mw / 2 + 10 + i * 5 * ua), ly = 55 - Math.sin(i / 4 * 2.2) * 4;
      ctx.globalAlpha = ua; ctx.fillStyle = i % 2 ? '#5a9a3a' : '#8fc35a'; ctx.fillRect(lx - 1.5, ly - 1, 3, 2); ctx.fillRect(lx - 0.5, ly + 1, 1, 1.5);
    }
    ctx.globalAlpha = ua; ctx.font = 'bold 4.5px Consolas, monospace'; ctx.textAlign = 'center';
    if (B.endWord) edgedText(ctx, B.endWord, 160, 64.2, won ? '#f1e6c8' : '#e8c8c0', 0.45);
    ctx.globalAlpha = 1;
  }

  // ---- the reckoning ----
  const h = B.hero, ca = B.cardAt === undefined || !h ? 0 : 1 - Math.pow(1 - cl((o - B.cardAt) / 0.4), 3);
  if (ca > 0) {
    const cw = 232, ch = 50, cx = 160 - cw / 2, cy = 112 + (1 - ca) * 74, col = B.col[wt], colD = B.colD[wt], k = cl((o - B.cardAt - 0.3) / 0.7);
    ctx.fillStyle = 'rgba(12,7,4,.93)'; ctx.fillRect(cx, cy, cw, ch);
    ctx.fillStyle = '#e0aa3e'; ctx.fillRect(cx, cy - 1, cw, 1); ctx.fillRect(cx, cy + ch, cw, 1);
    // him, large, in his side's colour
    ctx.save(); ctx.beginPath(); ctx.rect(cx, cy, 54, ch); ctx.clip();
    ctx.fillStyle = colD; ctx.fillRect(cx, cy, 54, ch);
    const g3 = ctx.createLinearGradient(0, cy, 0, cy + ch); g3.addColorStop(0, 'rgba(255,255,255,.18)'); g3.addColorStop(0.5, col); g3.addColorStop(1, 'rgba(0,0,0,.4)'); ctx.globalAlpha = 0.85; ctx.fillStyle = g3; ctx.fillRect(cx, cy, 54, ch); ctx.globalAlpha = 1;
    ctx.translate(cx + 27, cy + ch + (h.g.beast ? -3 : 16)); ctx.scale(h.g.beast ? 1.3 : 1.9, h.g.beast ? 1.3 : 1.9);
    drawSprite(ctx, { x: 0, y: 0, facing: wt ? -1 : 1, g: h.g, team: h.team, col, colD, moving: false, walk: 0, clock: T, atkAnim: 0, flash: 0, down: false, snare: 0, slash: 0, shadow: { len: 0, a: 0 }, noHelm: h.noHelm, cheer: !h.g.beast && !out(h) ? T : 0 });
    ctx.restore();
    ctx.fillStyle = '#e0aa3e'; ctx.fillRect(cx + 54, cy, 0.7, ch);
    const tx = cx + 62; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 4.5px Consolas, monospace'; ctx.fillStyle = won ? '#ffd24a' : '#e2695c';
    ctx.fillText(B.fighters.filter(f => f.team === wt).length > 1 ? (won ? 'HERO OF THE FIGHT' : 'THEIR BEST') : won ? 'THE VICTOR' : 'YOUR CONQUEROR', tx, cy + 8);
    ctx.font = 'bold 10px Cinzel, Georgia, serif'; ctx.fillStyle = '#fff6dc';
    ctx.fillText((h.g.beast ? 'The ' + h.c.name : h.g.name).toUpperCase().slice(0, 22), tx, cy + 19);
    // what he did, counted up
    const stats = [['DAMAGE', Math.round(h.dmgDealt)], ['BEST BLOW', Math.round(h.best)], ['TAKEN', Math.round(h.dmgTaken)], ['ABILITIES', Object.values(h.used || {}).reduce((a, b) => a + b, 0)]];
    stats.forEach(([lab, val], i) => {
      const sx = tx + i * 42;
      ctx.font = 'bold 9px Cinzel, Georgia, serif'; ctx.fillStyle = i === 2 ? '#e2a090' : '#ffd24a'; ctx.fillText(Math.round(val * k), sx, cy + 33);
      ctx.font = '4px Consolas, monospace'; ctx.fillStyle = '#c9b9a0'; ctx.fillText(lab, sx, cy + 38.5);
    });
    // and the fight as a whole
    const mine = B.fighters.filter(f => f.team === 0), up = mine.filter(f => !out(f)).length, secs = Math.round(B.time);
    const avg = B.time > 0 ? B.excSum / B.time : 0, parts = [`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`];
    if (mine.length > 1) parts.push(`${up} OF ${mine.length} OF YOURS STANDING`);
    if (!B.wild && !B.hunt) parts.push(avg > 0.55 ? 'THE CROWD ROARS' : avg > 0.3 ? 'THE CROWD IS PLEASED' : 'THE CROWD WANTED MORE');
    ctx.font = 'bold 4.5px Consolas, monospace'; ctx.fillStyle = '#f1e6c8'; ctx.fillText(parts.join('   -   '), tx, cy + 46.5);
    if (o > B.cardAt + 1) { ctx.font = '4px Consolas, monospace'; ctx.textAlign = 'right'; edgedText(ctx, 'CLICK TO GO ON', cx + cw - 3, cy + 6, '#e8dcc0', 0.4); }
  }
  ctx.restore();
}

// A death, shown for what it is. The day goes out of the picture and the sand turns the colour of blood; the two of them
// stand against it as shadows, the blow falls, and the cry the crowd gave for a man who has taken his death-wound -
// HOC HABET, he has it - comes down over them, running. Then who it was, and by whose hand.
function drawFatal(ctx, B, T) {
  const c = B.fatal, f = c.f, by = c.by, t = c.t, d = c.dur, cl = v => clamp(v, 0, 1);
  const a = Math.min(cl(t / 0.12), cl((d - t) / 0.4)), hit = t - 0.55, slam = t - 0.95;
  const jolt = (hit >= 0 && hit < 0.3 ? 1 - hit / 0.3 : 0) + (slam >= 0 && slam < 0.3 ? 1 - slam / 0.3 : 0);
  const shx = Math.round(Math.sin(t * 97) * jolt * 3), shy = Math.round(Math.cos(t * 71) * jolt * 2);
  const h = i => Math.abs(Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1;
  ctx.save(); ctx.globalAlpha = a;
  // the field of it: black at the edges, blood at the heart, and rays turning slowly behind them
  const g = ctx.createRadialGradient(160, 100, 10, 160, 100, 200); g.addColorStop(0, '#b0160e'); g.addColorStop(0.45, '#5a0806'); g.addColorStop(1, '#0a0202');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 320, 180);
  for (let i = 0; i < 14; i++) {
    const an = i / 14 * 6.283 + T * 0.12, w = 0.085; ctx.fillStyle = i % 2 ? 'rgba(255,90,60,.10)' : 'rgba(0,0,0,.16)';
    ctx.beginPath(); ctx.moveTo(160, 104); ctx.lineTo(160 + Math.cos(an - w) * 300, 104 + Math.sin(an - w) * 300); ctx.lineTo(160 + Math.cos(an + w) * 300, 104 + Math.sin(an + w) * 300); ctx.closePath(); ctx.fill();
  }
  ctx.save(); ctx.translate(shx, shy);
  // the ground they stand on, and what runs out over it once he is down
  ctx.fillStyle = '#0a0202'; ctx.fillRect(-10, 136, 340, 50);
  ctx.fillStyle = 'rgba(255,80,50,.35)'; ctx.fillRect(-10, 136, 340, 0.7);
  const kind = c.kind || fatalKind(by), FK = FATALS[kind] || FATALS.none, pre = cl(t / 0.5), vx0 = by ? 196 : 160;
  // where each of them stands, and how, through the scene: the common case first, then each killer's own way of it
  let kx = 118 + (hit >= 0 ? Math.min(10, hit * 60) : -pre * 4), vx = vx0 + (hit >= 0 ? Math.min(6, hit * 30) : 0), lift = 0, fallAt = 0.22, spray = by ? 'fwd' : 'both';
  let kPose = hit < 0 ? { windup: true, windP: pre } : { atkAnim: Math.max(0.6, 1 - hit) }, vSnare = 0;
  if (kind === 'murmillo') {                    // the shield goes in first and throws him back; the sword follows him down
    kx = 122 + (hit >= 0 ? Math.min(34, hit * 150) : -pre * 6); vx = vx0 + (hit >= 0 ? Math.min(24, hit * 120) : 0); fallAt = 0.3;
    kPose = hit < 0 ? { windup: true, windP: pre } : hit < 0.3 ? { atkAnim: 0.2 } : { atkAnim: Math.max(0.55, 1 - (hit - 0.3) * 1.5) };
  } else if (kind === 'thraex') {               // he goes past on the blind side, and the hooked blade comes back over the shoulder
    kx = 118 + (hit >= 0 ? Math.min(112, hit * 460) : -pre * 6); spray = 'up'; fallAt = 0.34;
    kPose = hit < 0 ? { windup: true, windP: pre } : { atkAnim: Math.max(0.5, 1 - hit * 1.4), moving: hit < 0.24, walk: t * 30 };
  } else if (kind === 'retiarius') {            // the net first, from a distance; then three points together
    kx = 100 + (hit >= 0 ? Math.min(20, hit * 110) : 0); vSnare = pre >= 0.8 ? 1 : 0; fallAt = 0.4;
    kPose = hit < 0 ? (pre < 0.6 ? { atkAnim: 1 - pre / 0.6 } : { windup: true, windP: cl((pre - 0.6) / 0.4) }) : { atkAnim: Math.max(0.6, 1 - hit) };
  } else if (kind === 'hoplomachus') {          // the whole length of the spear: he is held up on it, and falls when it comes out
    kx = 92 + (hit >= 0 ? Math.min(18, hit * 110) : -pre * 5); vx = vx0 + (hit >= 0 ? Math.min(4, hit * 20) : 0); fallAt = 0.62; spray = 'flat';
    kPose = hit < 0 ? { windup: true, windP: pre } : { atkAnim: hit < 0.6 ? 0.95 : Math.max(0.5, 1 - (hit - 0.6) * 2) };
  } else if (kind === 'dimachaerus') {          // inside his guard, and two cuts that cross on him
    kx = 138 + (hit >= 0 ? Math.min(22, hit * 110) : -pre * 5); spray = 'both'; fallAt = 0.36;
    kPose = hit < 0 ? { windup: true, windP: pre } : hit < 0.14 ? { atkAnim: 1 - hit * 3 } : { atkAnim: Math.max(0.5, 1 - (hit - 0.14) * 2.2) };
  } else if (kind === 'boar') {                 // under him and up: he is thrown, and comes down wrong
    kx = 124 + (hit >= 0 ? Math.min(52, hit * 220) : -pre * 8); lift = hit >= 0 && hit < 0.5 ? Math.sin(hit / 0.5 * Math.PI) * 34 : 0; vx = vx0 + (hit >= 0 ? Math.min(20, hit * 60) : 0); fallAt = 0.5; spray = 'up';
    kPose = hit < 0 ? { moving: true, walk: t * 30 } : { atkAnim: Math.max(0.6, 1 - hit) };
  } else if (kind === 'wolf' || kind === 'claw') {
    kx = 130 + (hit >= 0 ? Math.min(30, hit * 160) : -pre * 8); fallAt = 0.26;
    kPose = hit < 0 ? { windup: true, windP: pre } : { atkAnim: Math.max(0.6, 1 - hit) };
  }
  const fallen = hit > fallAt;
  if (hit > fallAt + 0.08) { const pw = Math.min(46, (hit - fallAt - 0.08) * 60); ctx.fillStyle = '#c2180e'; ctx.fillRect(vx - pw, 137, pw * 2, 2); ctx.fillStyle = '#7a0c08'; ctx.fillRect(vx - pw * 0.8, 139, pw * 1.6, 1.5); }
  // the two of them, as shadows: he who struck, and he who took it
  const shadow = (o, x, face, extra, up) => {
    ctx.save(); ctx.translate(Math.round(x), 136 - Math.round(up || 0)); ctx.scale(1.9, 1.9);
    drawSprite(ctx, Object.assign({ x: 0, y: 0, facing: face, g: o.g, team: o.team, col: '#000', colD: '#000', moving: false, walk: 0, clock: 0, atkAnim: 0, flash: 0, down: false, snare: 0, slash: 0, shadow: { len: 0, a: 0 }, noHelm: o.noHelm, solid: '#070202' }, extra));
    ctx.restore();
  };
  if (by) shadow(by, kx, 1, kPose);
  shadow(f, vx, by ? -1 : 1, hit < 0 ? {} : fallen ? { down: true } : { falling: true, recoil: 1 }, lift);
  // a stroke of light that goes red as it fades: k runs 0 to 1 over the life of it
  const stroke = (k, path, fat) => {
    if (k < 0 || k >= 1) return;
    for (const [w, col] of [[7, '#c2180e'], [3, k < 0.35 ? '#ffffff' : '#ff6a4a']]) { ctx.globalAlpha = a * (1 - k); ctx.strokeStyle = col; ctx.lineWidth = w * (fat || 1) * (1 - k * 0.5); ctx.lineCap = 'round'; ctx.beginPath(); path(); ctx.stroke(); }
    ctx.globalAlpha = a;
  };
  const line = (x0, y0, x1, y1) => () => { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); };
  if (kind === 'murmillo') {
    // the shield: a flat wall of light against him, and the shock going out from it
    stroke(hit / 0.26, () => { ctx.moveTo(vx - 20, 74); ctx.lineTo(vx - 20, 132); }, 2.2);
    if (hit >= 0 && hit < 0.26) for (let i = 0; i < 7; i++) { const yy = 78 + i * 8, ex = (hit / 0.26) * 26; ctx.fillStyle = `rgba(255,220,200,${(0.7 * (1 - hit / 0.26)).toFixed(3)})`; ctx.fillRect(vx - 14 + ex, yy, 10, 1); }
    // then the short sword, straight down into a man on his back
    stroke((hit - 0.34) / 0.4, line(vx - 26, 58, vx + 2, 134));
  } else if (kind === 'thraex') {
    // the sica: up from below, round, and down behind the shoulder
    stroke(hit / 0.5, () => { ctx.moveTo(vx - 32, 126); ctx.bezierCurveTo(vx - 26, 46, vx + 44, 44, vx + 20, 104); });
    if (hit >= 0.05 && hit < 0.5) { ctx.globalAlpha = a * (1 - hit / 0.5); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(vx + 20, 104); ctx.lineTo(vx + 30, 88); ctx.lineTo(vx + 14, 92); ctx.closePath(); ctx.fill(); ctx.globalAlpha = a; }      // the hook of it
  } else if (kind === 'retiarius') {
    // the net: thrown open in the air, then lying over him
    const flying = pre < 0.8, nk = cl(pre / 0.8), nx = flying ? kx + 26 + (vx - kx - 26) * nk : vx, ny = flying ? 96 - Math.sin(nk * Math.PI) * 34 : 108 + (fallen ? 14 : 0), nr = flying ? 6 + nk * 20 : 22, nh = flying ? nr : (fallen ? 12 : 30);
    ctx.save(); ctx.translate(nx, ny); if (flying) ctx.rotate(nk * 2.4);
    ctx.strokeStyle = `rgba(255,150,120,${(0.75 * a).toFixed(3)})`; ctx.lineWidth = 0.7;
    for (let q = -3; q <= 3; q++) { ctx.beginPath(); ctx.moveTo(q * nr / 3, -nh); ctx.lineTo(q * nr / 3 + nr / 3, nh); ctx.stroke(); ctx.beginPath(); ctx.moveTo(q * nr / 3, -nh); ctx.lineTo(q * nr / 3 - nr / 3, nh); ctx.stroke(); }
    ctx.strokeStyle = `rgba(255,200,180,${(0.9 * a).toFixed(3)})`; ctx.lineWidth = 1; ctx.strokeRect(-nr, -nh, nr * 2, nh * 2);
    for (const [wx, wy] of [[-nr, -nh], [nr, -nh], [-nr, nh], [nr, nh]]) { ctx.fillStyle = '#ffd0c0'; ctx.fillRect(wx - 1, wy - 1, 2.5, 2.5); }      // the weights at its corners
    ctx.restore();
    // the trident: three points, level, all the way through
    for (const dy of [-7, 0, 7]) stroke(hit / 0.5, line(kx + 22, 102 + dy, vx + 30, 100 + dy), dy ? 0.7 : 1);
  } else if (kind === 'hoplomachus') {
    // the spear: one straight line from his hand to a long way past the man on it
    stroke(hit / 0.75, line(kx + 20, 104, vx + 78, 96), 0.9);
    if (hit >= 0 && hit < 0.62) { ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(kx + 20, 104); ctx.lineTo(vx + 40, 99); ctx.stroke(); ctx.fillStyle = '#ffe9dc'; ctx.beginPath(); ctx.moveTo(vx + 50, 98); ctx.lineTo(vx + 38, 95); ctx.lineTo(vx + 38, 102); ctx.closePath(); ctx.fill(); }      // the shaft, and the head standing out of his back
  } else if (kind === 'dimachaerus') {
    // one blade and then the other, crossing on him
    stroke(hit / 0.4, line(vx - 34, 62, vx + 28, 132));
    stroke((hit - 0.14) / 0.4, line(vx + 34, 62, vx - 28, 132));
    if (hit >= 0.14 && hit < 0.34) { ctx.globalAlpha = a * (1 - (hit - 0.14) / 0.2); ctx.fillStyle = '#ffffff'; ctx.fillRect(vx - 5, 92, 10, 10); ctx.fillRect(vx - 2, 86, 4, 22); ctx.fillRect(vx - 11, 95, 22, 4); ctx.globalAlpha = a; }      // where they meet
  } else if (kind === 'claw') {
    for (let q = 0; q < 4; q++) stroke((hit - q * 0.02) / 0.42, line(vx - 30 + q * 9, 62 + q * 2, vx - 2 + q * 9, 130), 0.75);
  } else if (kind === 'wolf') {
    // the jaws: two rows of teeth that meet on him
    if (hit >= -0.1 && hit < 0.5) { const k = cl((hit + 0.1) / 0.16), gap = 26 * (1 - k); ctx.globalAlpha = a * (hit < 0.2 ? 1 : 1 - (hit - 0.2) / 0.3); ctx.fillStyle = hit < 0.12 ? '#ffffff' : '#ff6a4a';
      for (let q = 0; q < 6; q++) { const tx = vx - 24 + q * 9; ctx.beginPath(); ctx.moveTo(tx, 92 - gap - 12); ctx.lineTo(tx + 8, 92 - gap - 12); ctx.lineTo(tx + 4, 100 - gap); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(tx + 4, 116 + gap + 12); ctx.lineTo(tx + 12, 116 + gap + 12); ctx.lineTo(tx + 8, 108 + gap); ctx.closePath(); ctx.fill(); }
      ctx.globalAlpha = a; }
  } else if (kind === 'boar') {
    stroke(hit / 0.45, () => { ctx.moveTo(vx - 30, 134); ctx.quadraticCurveTo(vx - 4, 128, vx + 10, 64); });
    stroke((hit - 0.03) / 0.45, () => { ctx.moveTo(vx - 22, 134); ctx.quadraticCurveTo(vx + 4, 128, vx + 18, 70); }, 0.7);
  } else stroke(hit / 0.45, () => { ctx.moveTo(vx - 34, 62); ctx.quadraticCurveTo(vx + 6, 96, vx + 30, 134); });
  // what the blow throws out of him, the way that blow throws it
  if (hit >= 0) for (let i = 0; i < 34; i++) {
    const r1 = h(i), r2 = h(i + 50), tt = hit - (kind === 'dimachaerus' && i % 2 ? 0.14 : kind === 'murmillo' ? 0.34 : 0);
    if (tt < 0) continue;
    const an = spray === 'fwd' ? -1.45 + r1 * 1.5 : spray === 'flat' ? -0.42 + r1 * 0.5 : spray === 'up' ? -2.25 + r1 * 1.35 : (i % 2 ? -1.35 + r1 * 1.1 : -2.9 + r1 * 1.1);
    const sp = (spray === 'flat' ? 90 : 40) + r2 * 130, px = vx + Math.cos(an) * sp * tt, py = 100 - lift + (kind === 'retiarius' ? ((i % 3) - 1) * 7 : 0) + Math.sin(an) * sp * tt + 210 * tt * tt;
    if (py > 137) continue;
    ctx.fillStyle = i % 3 ? '#e02a1a' : '#ff6a4a'; ctx.fillRect(Math.round(px), Math.round(py), i % 4 ? 2 : 3, i % 4 ? 2 : 3);
  }
  ctx.restore();
  // black above and below, and blood running down from the top of the picture
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 320, 12); ctx.fillRect(0, 168, 320, 12);
  for (let i = 0; i < 22; i++) {
    const x = Math.round(h(i + 9) * 316), len = Math.max(0, (t - h(i + 20) * 0.9) * (14 + h(i + 30) * 26)), w = 1 + Math.round(h(i + 40) * 2);
    if (len <= 0) continue;
    ctx.fillStyle = '#8e120a'; ctx.fillRect(x, 12, w, len); ctx.fillStyle = '#c2180e'; ctx.fillRect(x, 12 + len - 2, w, 2); ctx.fillRect(x - 0.5, 12 + len - 1, w + 1, 1.5);
  }
  ctx.fillStyle = '#8e120a'; ctx.fillRect(0, 12, 320, 1.5);
  // the word of it, coming down hard, and running
  if (slam >= 0) {
    const k = cl(slam / 0.14), word = FK.word, sc = (2.6 - 1.6 * k) * (word.length > 11 ? 0.82 : 1);
    ctx.save(); ctx.translate(160 + shx, 42 + shy); ctx.scale(sc, sc);
    ctx.font = 'bold 27px Cinzel, Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = '#080101'; ctx.strokeText(word, 0, 0);
    const tg = ctx.createLinearGradient(0, -20, 0, 2); tg.addColorStop(0, k < 1 ? '#ffffff' : '#ff5a3a'); tg.addColorStop(0.55, '#d81c10'); tg.addColorStop(1, '#7a0c08');
    ctx.fillStyle = tg; ctx.fillText(word, 0, 0);
    if (k >= 1) {                               // it runs from the foot of the letters
      const w = ctx.measureText(word).width;
      for (let i = 0; i < 9; i++) { const x = -w / 2 + 6 + h(i + 70) * (w - 12), len = Math.min(5 + h(i + 80) * 12, (slam - 0.14 - h(i + 90) * 0.5) * 16); if (len > 0) { ctx.fillStyle = '#b0160e'; ctx.fillRect(x, 0, 1.5, len); ctx.fillRect(x - 0.5, len - 1, 2.5, 1.5); } }
    }
    ctx.restore();
    if (slam < 0.14) { ctx.fillStyle = `rgba(255,220,200,${(0.5 * (1 - k)).toFixed(3)})`; ctx.fillRect(0, 0, 320, 180); }
  }
  // who, and by whose hand
  const sa = cl((t - 1.35) / 0.3);
  if (sa > 0) {
    const nm = o => (o.g.beast ? 'the ' + o.c.name : o.g.name).toUpperCase();
    const line = by ? `${nm(f)}  ${FK.how || (by.g.beast ? 'IS TORN DOWN BY' : 'IS SLAIN BY')}  ${nm(by)}` : `${nm(f)} IS DEAD`;
    ctx.globalAlpha = a * sa; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 8px Cinzel, Georgia, serif'; ctx.fillStyle = '#000'; ctx.fillText(line, 160.6, 156.6); ctx.fillStyle = '#ffe9dc'; ctx.fillText(line, 160, 156);
    const w = ctx.measureText(line).width; ctx.fillStyle = '#c2180e'; ctx.fillRect(160 - w / 2 * sa, 158.5, w * sa, 0.8);
    if (!f.g.beast) {                           // and what he was
      const wins = f.g.wins || 0, epi = `${f.c.name.toUpperCase()}   -   ${wins} ${wins === 1 ? 'VICTORY' : 'VICTORIES'}${f.g.kills ? `   -   ${f.g.kills} KILLED` : ''}`;
      ctx.font = 'bold 4.5px Consolas, monospace'; edgedText(ctx, epi, 160, 165, f.team === 0 ? '#ffb0a2' : '#dcc4bc', 0.45);
    }
  }
  if (hit >= 0 && hit < 0.1) { ctx.globalAlpha = 1 - hit / 0.1; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 320, 180); }
  ctx.restore();
}

// The card for the man the mouse is resting on. He is ringed on the sand and a line runs to the man he is fighting;
// the card stands beside him: who he is, his health and charge, what he can do in figures, what ails or aids him and
// for how long, what he has done in this fight, and the abilities he carries.
function drawInspect(ctx, B, who, T) {
  const g = who.g, w = 122, col = B.col[who.team], colD = B.colD[who.team], gone = out(who);
  const V = B.view || { z: 1, ox: 0, oy: 0 }, sx = f => f.x * Z * V.z + V.ox / SCALE, sy = f => f.y * Z * V.z + V.oy / SCALE;
  const fx = sx(who), fy = sy(who), tg = !gone && who.target && !out(who.target) ? who.target : null;
  ctx.save(); ctx.textBaseline = 'alphabetic';
  // on the sand: a ring under him, and a line to his man
  ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 0.6; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(T * 6);
  ctx.beginPath(); ctx.ellipse(fx, fy, 9 * V.z, 3 * V.z, 0, 0, 6.283); ctx.stroke();
  if (tg) {
    ctx.globalAlpha = 0.55; ctx.setLineDash([2, 1.5]); ctx.lineDashOffset = -T * 8; ctx.strokeStyle = col;
    ctx.beginPath(); ctx.moveTo(fx, fy - 1); ctx.lineTo(sx(tg), sy(tg) - 1); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = B.col[tg.team]; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.ellipse(sx(tg), sy(tg), 7 * V.z, 2.4 * V.z, 0, 0, 6.283); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // what goes on it
  const marks = [];
  const tm = v => v > 0 && v < 60 ? ` ${v.toFixed(v < 10 ? 1 : 0)}S` : '';
  if (who.bleed > 0) marks.push(['bleed', 'BLEEDING']); if (who.hamstrung) marks.push(['ham', 'HAMSTRUNG']); if (who.armWound) marks.push(['arm', 'ARM WOUND']);
  if (who.snare > 0) marks.push(['net', 'NETTED' + tm(who.snare)]); if (who.stun > 0.3) marks.push(['stun', 'STUNNED' + tm(who.stun)]);
  if (who.weakT > 0) marks.push(['weak', 'WEAKENED' + tm(who.weakT)]); if (who.open > 0) marks.push(['open', 'EXPOSED' + tm(who.open)]);
  if (who.buff) { const b = who.buff, k = b.dr > 0 || b.block ? 'GUARDED' : b.dmg > 0 ? 'FURY' : b.haste ? 'HASTE' : 'ROUSED'; marks.push(['buff', k + tm(b.t)]); }
  const traits = g.beast ? [] : (g.traits || []).map(t => TRAITS[t]).filter(Boolean).slice(0, 4);
  const pct = v => Math.round(clamp(v, 0, 1) * 100) + '%';
  const stats = [['DAMAGE', Math.round(who.dmg)], ['EVERY', who.atkTime.toFixed(2) + 'S'], ['ARMOUR', Math.round(who.armor)], ['BLOCK', pct(who.block)], ['DODGE', pct(who.dodge)], ['CRIT', pct(who.crit)]];
  const mrows = Math.ceil(marks.length / 2), arows = who.abl.length;
  const h = 27 + 15 + (mrows ? mrows * 6 + 3 : 0) + (traits.length ? 8 : 0) + 9 + (arows ? arows * 6 + 7 : 0) + (tg || gone ? 7 : 0) + 2;
  // beside him, and on the side away from the man he is fighting where there is room for it
  let right = tg ? tg.x < who.x : fx < 160;
  if (right && fx + 14 + w > 318) right = false; else if (!right && fx - 14 - w < 2) right = true;
  const cx = clamp(right ? fx + 14 : fx - 14 - w, 2, 318 - w), cy = clamp(fy - h * 0.62, 14, 166 - h);
  // the card
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(cx + 1.5, cy + 1.5, w, h);
  ctx.fillStyle = 'rgba(14,9,5,.95)'; ctx.fillRect(cx, cy, w, h);
  ctx.fillStyle = '#e0aa3e'; ctx.fillRect(cx, cy, w, 0.5); ctx.fillRect(cx, cy + h - 0.5, w, 0.5); ctx.fillStyle = col; ctx.fillRect(cx, cy, 1.5, h);
  // his likeness, in a small frame
  ctx.save(); ctx.beginPath(); ctx.rect(cx + 4, cy + 3, 18, 21); ctx.clip();
  ctx.fillStyle = colD; ctx.fillRect(cx + 4, cy + 3, 18, 21); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(cx + 4, cy + 3, 18, 8);
  ctx.translate(cx + 13, cy + (g.beast ? 22 : 37)); ctx.scale(g.beast ? 0.55 : 0.85, g.beast ? 0.55 : 0.85);
  drawSprite(ctx, { x: 0, y: 0, facing: who.team ? -1 : 1, g, team: who.team, col, colD, moving: false, walk: 0, clock: T, atkAnim: 0, flash: 0, down: false, snare: 0, slash: 0, shadow: { len: 0, a: 0 }, noHelm: who.noHelm });
  ctx.restore();
  ctx.strokeStyle = '#e0aa3e'; ctx.lineWidth = 0.5; ctx.strokeRect(cx + 4, cy + 3, 18, 21);
  // name, what he is, health and charge
  const tx = cx + 26, rw = w - 30;
  ctx.textAlign = 'left'; ctx.font = 'bold 6px Cinzel, Georgia, serif'; ctx.fillStyle = who.team ? '#bcd6ff' : '#ffd9d2';
  ctx.fillText((g.beast ? who.c.name : g.name).toUpperCase().slice(0, 18), tx, cy + 8);
  ctx.font = 'bold 4px Consolas, monospace'; ctx.fillStyle = '#c9b9a0';
  ctx.fillText(g.beast ? 'A BEAST' : `${who.c.name.toUpperCase()}  ${RANKS[g.rank || 0] ? RANKS[g.rank || 0].name.toUpperCase() : ''}  ${g.wins || 0}W ${g.losses || 0}L`, tx, cy + 13);
  if (!g.beast) { if (who.style) drawIcon(ctx, who.style, cx + w - 9, cy + 2.5, 0.6); }
  const hp = clamp(who.hp / who.maxHp, 0, 1);
  ctx.fillStyle = '#3a1512'; ctx.fillRect(tx, cy + 15.5, rw, 3.5); ctx.fillStyle = col; ctx.fillRect(tx, cy + 15.5, rw * hp, 3.5); ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(tx, cy + 15.5, rw * hp, 1);
  ctx.fillStyle = '#2a2418'; ctx.fillRect(tx, cy + 20.5, rw, 2.5); ctx.fillStyle = who.charge >= 100 ? '#fff0b0' : '#e0aa3e'; ctx.fillRect(tx, cy + 20.5, rw * clamp(who.charge / 100, 0, 1), 2.5);
  ctx.font = 'bold 3.5px Consolas, monospace'; ctx.fillStyle = '#fff'; ctx.textAlign = 'right';
  ctx.fillText(`${Math.max(0, Math.ceil(who.hp))} / ${who.maxHp}`, tx + rw - 1, cy + 18.5);
  edgedText(ctx, who.charge >= 100 ? 'CHARGED' : `CHARGE ${Math.round(who.charge)}%`, tx + rw - 1, cy + 22.7, '#fff6dc', 0.35);      // over a bar part gold and part dark: pale, with a dark edge
  let y = cy + 27;
  const rule = () => { ctx.fillStyle = 'rgba(224,170,62,.3)'; ctx.fillRect(cx + 4, y, w - 8, 0.4); };
  // what he can do, in figures: three and three
  rule();
  stats.forEach(([lab, val], i) => {
    const sx = cx + 5 + (i % 3) * 39, sy = y + 6 + Math.floor(i / 3) * 6.5;
    ctx.textAlign = 'left'; ctx.font = '3.5px Consolas, monospace'; ctx.fillStyle = '#a8947a'; ctx.fillText(lab, sx, sy);
    ctx.textAlign = 'right'; ctx.font = 'bold 4.5px Consolas, monospace'; ctx.fillStyle = '#f2e6cc'; ctx.fillText(val, sx + 35, sy);
  });
  y += 15;
  // what ails or aids him
  if (mrows) {
    rule();
    marks.forEach(([k, lab], i) => { const sx = cx + 5 + (i % 2) * 58, sy = y + 3 + Math.floor(i / 2) * 6; drawMark(ctx, k, sx + 0.5, sy, 0.5); ctx.textAlign = 'left'; ctx.font = 'bold 4px Consolas, monospace'; ctx.fillStyle = HUD_MARKS[k][0]; ctx.fillText(lab, sx + 5, sy + 2.6); });
    y += mrows * 6 + 3;
  }
  if (traits.length) {
    rule(); ctx.textAlign = 'left'; ctx.font = 'bold 4px Consolas, monospace'; let sx = cx + 5;
    for (const t of traits) { const nm = t.name.toUpperCase(), tw = ctx.measureText(nm).width; if (sx + tw > cx + w - 4) break; ctx.fillStyle = t.good ? '#9fd070' : '#e2897c'; ctx.fillText(nm, sx, y + 5.5); sx += tw + 5; }
    y += 8;
  }
  // what he has done in this fight
  rule(); ctx.textAlign = 'left'; ctx.font = '3.5px Consolas, monospace'; ctx.fillStyle = '#a8947a'; ctx.fillText('THIS FIGHT', cx + 5, y + 6);
  ctx.font = 'bold 4px Consolas, monospace'; ctx.fillStyle = '#f2e6cc'; ctx.fillText(`${Math.round(who.dmgDealt)} DEALT   ${Math.round(who.dmgTaken)} TAKEN   BEST ${who.best ? Math.round(who.best) : '-'}`, cx + 31, y + 6);
  y += 9;
  // what he carries
  if (arows) {
    rule(); ctx.font = '3.5px Consolas, monospace'; ctx.fillStyle = '#a8947a'; ctx.textAlign = 'left'; ctx.fillText('ABILITIES', cx + 5, y + 5); y += 7;
    who.abl.forEach((ab, i) => {
      const n = who.used[ab.name] || 0, sy = y + i * 6;
      if (ab.skill) drawIcon(ctx, ab.skill, cx + 5, sy - 0.4, 0.45);
      ctx.textAlign = 'left'; ctx.font = 'bold 4px Consolas, monospace'; ctx.fillStyle = who.lastCast === ab.id ? '#ffd24a' : '#f2e6cc'; ctx.fillText(ab.name.toUpperCase(), cx + 11, sy + 3.2);
      if (n) { ctx.textAlign = 'right'; ctx.fillStyle = '#c9b9a0'; ctx.fillText(`USED ${n}`, cx + w - 4, sy + 3.2); }
    });
    y += arows * 6;
  }
  if (tg || gone) {
    rule(); ctx.textAlign = 'left'; ctx.font = 'bold 4px Consolas, monospace';
    ctx.fillStyle = gone ? '#e2897c' : B.col[tg.team] === col ? '#f2e6cc' : (tg.team ? '#bcd6ff' : '#ffd9d2');
    ctx.fillText(gone ? (who.fate === 'dead' ? 'SLAIN' : who.yielded ? 'HAS YIELDED' : 'IS DOWN') : `FIGHTING ${(tg.g.beast ? 'THE ' + tg.c.name : tg.g.name).toUpperCase()}${TACTICS[who.tactic] && who.tactic !== 'balanced' ? '   ' + TACTICS[who.tactic].name.toUpperCase() : ''}`, cx + 5, y + 5.2);
  }
  ctx.restore(); ctx.textAlign = 'center';
}

function drawCutIn(ctx, B, T) {
  // In beats, so that the whole of its time is used: the band slams across, the man draws back while the name of the
  // thing is struck out a letter at a time, then he lets fly - and the one it is meant for is seen to take it.
  const c = B.cut, f = c.f, ab = c.ab, t = c.t, d = c.dur, dir = f.team === 0 ? 1 : -1, cl = v => clamp(v, 0, 1);
  const e = 1 - Math.pow(1 - cl(t / 0.28), 2), o2 = Math.pow(cl((t - (d - 0.4)) / 0.4), 2);
  const ts = c.ts || d * 0.45, hit = t - ts;                     // when the blow is let go, and how long since
  const jolt = hit >= 0 && hit < 0.3 ? 1 - hit / 0.3 : 0, slam = t > 0.24 && t < 0.5 ? 1 - (t - 0.24) / 0.26 : 0;
  const shx = Math.round(Math.sin(t * 95) * (jolt * 3 + slam * 2)), shy = Math.round(Math.cos(t * 75) * (jolt * 2 + slam * 1.5));
  const off = dir * (-(1 - e) * 360 + o2 * 360) + shx;           // where the band is: in from its own side, out the other
  const top = 52 + shy, bot = 124 + shy, skew = 14, col = B.col[f.team], colD = B.colD[f.team];
  const acc = ab.skill ? STYLE_COL[ab.skill] : '#ffd24a', live = Math.min(e, 1 - o2);
  const tg = f.target && !out(f.target) && f.target.team !== f.team && (ab.fx.mult || ab.fx.net || ab.fx.weak) ? f.target : null;
  const fig = (g, team, facing, o) => Object.assign({ x: 0, y: 0, facing, g, team, col: B.col[team], colD: B.colD[team], moving: false, walk: 0, clock: T, atkAnim: 0, flash: 0, down: false, snare: 0, slash: 0, shadow: { len: 0, a: 0 } }, o);
  ctx.save();
  ctx.fillStyle = `rgba(8,5,2,${(0.6 * live).toFixed(3)})`; ctx.fillRect(0, 0, 320, 180);

  // ---- under the band: what the thing does, in words, and the one it is meant for ----
  const sa = cl((t - 0.8) / 0.3) * (1 - o2);
  if (sa > 0 && ab.desc) {
    ctx.font = '5px Consolas, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const lines = []; let line = '';
    for (const w of ab.desc.split(' ')) { if (line && ctx.measureText(line + ' ' + w).width > 176) { lines.push(line); line = w; } else line = line ? line + ' ' + w : w; }
    if (line) lines.push(line);
    const sw = 190, sh = lines.length * 7 + 6, sx = dir > 0 ? 16 : 320 - 16 - sw, sy = bot + 2 - (1 - sa) * (sh + 2);
    ctx.globalAlpha = sa;
    ctx.fillStyle = 'rgba(14,8,4,.92)'; ctx.fillRect(sx, sy, sw, sh); ctx.fillStyle = acc; ctx.fillRect(dir > 0 ? sx : sx + sw - 2, sy, 2, sh); ctx.fillStyle = '#e0aa3e'; ctx.fillRect(sx, sy + sh - 0.5, sw, 0.5);
    ctx.fillStyle = '#f1e6c8'; lines.forEach((ln, i) => ctx.fillText(ln, sx + 7, sy + 8.5 + i * 7));
    ctx.globalAlpha = 1;
  }
  const ta = cl((t - 0.65) / 0.3) * (1 - o2);
  if (tg && ta > 0) {
    const pw = 64, ph = 40, px0 = (dir > 0 ? 320 - 20 - pw : 20) + dir * (1 - ta) * 90 + (jolt > 0 ? Math.round(Math.sin(t * 110) * jolt * 3) : 0), py0 = bot + 5;
    ctx.save(); ctx.globalAlpha = ta;
    ctx.fillStyle = B.colD[tg.team]; ctx.fillRect(px0, py0, pw, ph);
    const g2 = ctx.createLinearGradient(0, py0, 0, py0 + ph); g2.addColorStop(0, 'rgba(255,255,255,.14)'); g2.addColorStop(1, 'rgba(0,0,0,.4)'); ctx.fillStyle = g2; ctx.fillRect(px0, py0, pw, ph);
    ctx.beginPath(); ctx.rect(px0, py0, pw, ph); ctx.clip();
    ctx.save(); ctx.translate(Math.round(px0 + pw / 2 + dir * jolt * 5), py0 + ph + 8); ctx.scale(1.45, 1.45);
    drawSprite(ctx, fig(tg.g, tg.team, -dir, { flash: hit >= 0 && hit < 0.12 ? 1 : 0, recoil: jolt, noHelm: tg.noHelm }));
    ctx.restore();
    if (jolt > 0) {                             // and the blow arriving on him
      ctx.fillStyle = `rgba(255,240,210,${(jolt * 0.55).toFixed(3)})`; ctx.fillRect(px0, py0, pw, ph);
      ctx.strokeStyle = `rgba(255,255,255,${jolt.toFixed(3)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px0 + pw / 2 - dir * 22, py0 + 4); ctx.lineTo(px0 + pw / 2 + dir * 14, py0 + ph - 4); ctx.stroke();
    }
    ctx.font = 'bold 4.5px Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(10,6,3,.75)'; ctx.fillRect(px0, py0 + ph - 8, pw, 8); ctx.fillStyle = '#f1e6c8'; ctx.fillText(tg.g.name.toUpperCase().slice(0, 20), px0 + pw / 2, py0 + ph - 2.2);
    ctx.restore();
    ctx.globalAlpha = ta; ctx.fillStyle = '#e0aa3e'; ctx.fillRect(px0, py0 - 1, pw, 1); ctx.fillRect(px0, py0 + ph, pw, 1); ctx.globalAlpha = 1;
  }

  // ---- the band, slanted ----
  const band = () => { ctx.beginPath(); ctx.moveTo(-40 + off + skew, top); ctx.lineTo(360 + off + skew, top); ctx.lineTo(360 + off - skew, bot); ctx.lineTo(-40 + off - skew, bot); ctx.closePath(); };
  band(); ctx.fillStyle = colD; ctx.fill();
  const g = ctx.createLinearGradient(0, top, 0, bot); g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(0.5, col); g.addColorStop(1, 'rgba(0,0,0,.35)');
  band(); ctx.globalAlpha = 0.85; ctx.fillStyle = g; ctx.fill(); ctx.globalAlpha = 1;
  ctx.save(); band(); ctx.clip();
  const px = (dir > 0 ? 62 : 258) + off * 1.15, cy = (top + bot) / 2;
  // the light gathers on him while he draws back, and bursts from him when he lets go
  {
    const wind = hit < 0 ? cl((t - 0.4) / Math.max(0.2, ts - 0.4)) : 0, n = 14;
    for (let i = 0; i < n; i++) {
      const an = i / n * 6.283 + (hit < 0 ? T * 0.5 : 0.2), r0 = hit < 0 ? 150 - wind * 95 - ((T * 60 + i * 23) % 40) : 26 + hit * 240, r1 = r0 + (hit < 0 ? 46 : 70), w = 0.045;
      const al = hit < 0 ? 0.05 + wind * 0.1 : Math.max(0, 0.3 - hit * 0.55);
      if (al <= 0) continue;
      ctx.fillStyle = i % 3 ? `rgba(255,255,255,${al.toFixed(3)})` : acc; ctx.globalAlpha = i % 3 ? 1 : al * 1.6;
      ctx.beginPath(); ctx.moveTo(px + Math.cos(an) * r0, cy + Math.sin(an) * r0 * 0.6); ctx.lineTo(px + Math.cos(an - w) * r1, cy + Math.sin(an - w) * r1 * 0.6); ctx.lineTo(px + Math.cos(an + w) * r1, cy + Math.sin(an + w) * r1 * 0.6); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // streaks of speed, running the way he is going: idling while he gathers himself, tearing past once he is loosed
  const rush = hit < 0 ? 150 : 150 + Math.min(1, hit / 0.15) * 620;
  c.sx = (c.sx || 0) + rush * dir * Math.max(0, t - (c.lt || 0)); c.lt = t;
  for (let i = 0; i < 18; i++) {
    const y = top + 3 + (i * 37) % (bot - top - 6), len = (26 + (i % 4) * 16) * (hit < 0 ? 0.7 : 1.5), x = ((i * 83 + c.sx) % 440 + 440) % 440 - 60;
    ctx.fillStyle = `rgba(255,255,255,${(0.08 + (i % 3) * 0.06 + (hit >= 0 ? 0.05 : 0)).toFixed(2)})`; ctx.fillRect(x, y, len, i % 5 ? 1 : 2);
  }
  // sparks going up through it, in the colour of his school of fighting
  for (let i = 0; i < 12; i++) {
    const life = ((T * 0.5 + i * 0.137) % 1), x = ((i * 97) % 340) - 10 + off * 0.3 + Math.sin(T * 2 + i) * 3, y = bot - life * (bot - top + 6);
    ctx.globalAlpha = (1 - life) * 0.8 * live; ctx.fillStyle = i % 4 ? acc : '#fff6dc'; ctx.fillRect(Math.round(x), Math.round(y), i % 3 ? 1 : 2, i % 3 ? 1 : 2);
  }
  ctx.globalAlpha = 1;
  // his likeness, close up: the same figure the sand shows, drawing back and then letting fly
  {
    const wind = hit < 0 ? cl((t - 0.5) / Math.max(0.2, ts - 0.5)) : 0, lunge = hit < 0 ? -wind * 5 : 12 * Math.max(0.45, 1 - hit * 1.4);
    const zoom = 2.5 + (hit >= 0 ? 0.3 * Math.max(0, 1 - hit / 0.5) : wind * 0.08), fx = Math.round(px + dir * lunge), breath = hit < 0 ? Math.sin(T * 5) * 0.4 : 0;
    const pose = hit < 0 ? (t > 0.5 ? { windup: true, windP: wind } : {}) : { atkAnim: Math.max(0.6, 1 - hit * 0.9) };
    ctx.save(); ctx.translate(fx, bot + 44 + Math.round(breath)); ctx.scale(zoom, zoom);
    if (hit >= 0 && hit < 0.6) for (let q = 2; q >= 1; q--) { ctx.globalAlpha = 0.3 * (1 - hit / 0.6) / q; drawSprite(ctx, fig(f.g, f.team, dir, Object.assign({ x: -dir * 6 * q, flash: 1, noHelm: f.noHelm }, pose))); }
    ctx.globalAlpha = 1; drawSprite(ctx, fig(f.g, f.team, dir, Object.assign({ flash: hit >= 0 && hit < 0.07 ? 1 : 0, noHelm: f.noHelm }, pose)));
    ctx.restore();
    if (hit >= 0 && hit < 0.32) {               // the stroke itself, across the whole band
      const k = hit / 0.32, x0 = px + dir * (18 + k * 60);
      ctx.globalAlpha = 1 - k;
      for (const [w, cc, dx] of [[9, acc, -dir * 5], [5, '#ffffff', 0]]) { ctx.strokeStyle = cc; ctx.lineWidth = w * (1 - k * 0.6); ctx.beginPath(); ctx.moveTo(x0 + dx + dir * 26, top - 4); ctx.quadraticCurveTo(x0 + dx + dir * 46, cy, x0 + dx - dir * 6, bot + 4); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
  // gold along both edges, a line of his style's colour inside them, and the time it has left running along the foot
  const ex = Math.min(0, off) - 4, ew = 328 + Math.abs(off);
  ctx.fillStyle = '#e0aa3e'; ctx.fillRect(ex, top - 2, ew, 2); ctx.fillRect(ex, bot, ew, 2);
  ctx.fillStyle = '#fff0b0'; ctx.fillRect(ex, top - 2, ew, 0.5);
  ctx.globalAlpha = 0.8 * live; ctx.fillStyle = acc; ctx.fillRect(ex, top + 1.5, ew, 0.7); ctx.fillRect(ex, bot - 2.2, ew, 0.7); ctx.globalAlpha = 1;
  { const w = 320 * cl(t / d); ctx.fillStyle = '#fff6dc'; ctx.globalAlpha = live; ctx.fillRect(dir > 0 ? 0 : 320 - w, bot + 0.5, w, 1); ctx.globalAlpha = 1; }
  // the name of it, struck out a letter at a time
  const tx = (dir > 0 ? 204 : 116) - off * 0.55, name = ab.name.toUpperCase(), ny = 92 + shy;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  let size = 19; ctx.font = `bold ${size}px Cinzel, Georgia, serif`;
  while (size > 9 && ctx.measureText(name).width > 176) { size--; ctx.font = `bold ${size}px Cinzel, Georgia, serif`; }
  const nw = ctx.measureText(name).width, step = Math.min(0.045, 0.6 / name.length), t0 = 0.4, done = t0 + name.length * step;
  for (let i = 0; i < name.length; i++) {
    const age = t - t0 - i * step; if (age < 0) break;
    const pop = age < 0.14 ? 1 - age / 0.14 : 0, x = tx - nw / 2 + ctx.measureText(name.slice(0, i)).width, y = ny - pop * 4;
    ctx.fillStyle = 'rgba(20,10,4,.85)'; ctx.fillText(name[i], x + 1, y + 1.5);
    ctx.fillStyle = pop > 0.4 || (hit >= 0 && hit < 0.12) ? '#ffffff' : '#fff6dc'; ctx.fillText(name[i], x, y);
  }
  const ua = cl((t - done) / 0.25);
  if (ua > 0) {                                 // ruled off beneath, from the middle outward, and then who and by what art
    ctx.fillStyle = acc; ctx.fillRect(tx - nw / 2 * ua, ny + 3, nw * ua, 1); ctx.fillStyle = '#fff6dc'; ctx.fillRect(tx - nw / 4 * ua, ny + 3, nw / 2 * ua, 0.5);
    ctx.globalAlpha = ua; ctx.textAlign = 'center';
    ctx.font = 'bold 6px Consolas, monospace';
    const sub = f.g.beast ? f.g.name.toUpperCase() : `${f.g.name.toUpperCase()}${ab.skill ? '  -  ' + STAT_NAMES[ab.skill].toUpperCase() : ''}`, sw = ctx.measureText(sub).width;
    ctx.fillStyle = 'rgba(20,10,4,.6)'; ctx.fillRect(tx - sw / 2 - 9, ny + 8, sw + 18, 10);
    if (ab.skill) drawIcon(ctx, ab.skill, tx - sw / 2 - 7, ny + 10.5, 0.5);
    ctx.fillStyle = acc; ctx.fillText(sub, tx + 3, ny + 15.5);
    ctx.globalAlpha = 1;
  }
  // light: as the band lands, as the blow goes, and as the band leaves
  const fl = Math.max(slam * 0.3, hit >= 0 && hit < 0.18 ? 0.5 * (1 - hit / 0.18) : 0, o2 > 0.1 ? 0.45 * (1 - o2) * (o2 < 0.5 ? o2 * 2 : 1) : 0);
  if (fl > 0.01) { ctx.fillStyle = `rgba(255,248,228,${fl.toFixed(3)})`; ctx.fillRect(0, 0, 320, 180); }
  if (t > 1.2 && !o2) { ctx.font = '4px Consolas, monospace'; ctx.textAlign = dir > 0 ? 'right' : 'left'; edgedText(ctx, 'CLICK TO SKIP', dir > 0 ? 316 : 4, top - 5, '#e8dcc0', 0.4); }
  ctx.restore();
}

// What ails or aids a man, as small pictures: a drop for bleeding, a boot for a cut leg, a blade for a hurt arm, a mesh
// for the net, a star for a daze, an arrow down for weakness and up for a rousing, a mark for a man left open.
const HUD_MARKS = {
  bleed: ['#ff3a2a', '..#..', '.###.', '#####', '#####', '.###.'],
  ham:   ['#ffd24a', '..##.', '..##.', '..##.', '.###.', '####.'],
  arm:   ['#ff9a3a', '..#..', '..#..', '..#..', '.###.', '..#..'],
  net:   ['#d8c79a', '#.#.#', '.#.#.', '#.#.#', '.#.#.', '#.#.#'],
  stun:  ['#ffffff', '.#.#.', '#####', '.###.', '#####', '.#.#.'],
  weak:  ['#b0a690', '.###.', '.###.', '#####', '.###.', '..#..'],
  buff:  ['#6aa8ff', '..#..', '.###.', '#####', '.###.', '.###.'],
  open:  ['#ff8a4a', '#####', '#...#', '#.#.#', '#...#', '#####'],
  // and for the lines of the telling: an ability, a wound, a telling blow, a man down, a man dead, a yielding, a sparing
  l_ability: ['#ffd24a', '.#.#.', '#####', '.###.', '#####', '.#.#.'],
  l_wound:   ['#ff8a5a', '..#..', '.###.', '#####', '#####', '.###.'],
  l_hit:     ['#fff0c8', '..#..', '.###.', '#####', '.###.', '..#..'],
  l_down:    ['#ff9a8a', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  l_dead:    ['#ff4a3a', '.###.', '#.#.#', '#####', '.###.', '.#.#.'],
  l_yield:   ['#c9b9a0', '####.', '####.', '####.', '#....', '#....'],
  l_spared:  ['#ffffff', '.#.#.', '#####', '#####', '.###.', '..#..'],
};
function hudMarks(f) {
  const m = [];
  if (f.bleed > 0) m.push('bleed'); if (f.hamstrung) m.push('ham'); if (f.armWound) m.push('arm'); if (f.snare > 0) m.push('net');
  if (f.stun > 0.3) m.push('stun'); if (f.weakT > 0) m.push('weak'); if (f.open > 0) m.push('open'); if (f.buff) m.push('buff');
  return m;
}
function drawMark(ctx, k, x, y, u) {            // u: the size of one of its dots
  const m = HUD_MARKS[k];
  ctx.fillStyle = 'rgba(0,0,0,.8)'; ctx.fillRect(x - u, y - u, u * 7, u * 7);
  ctx.fillStyle = m[0];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (m[r + 1][c] === '#') ctx.fillRect(x + c * u, y + r * u, u, u);
}
// The health a bar shows lags the health a man has, so that what a blow took is seen for a moment before it goes.
function hudLag(B) {
  const T = B.clock, dt = clamp(T - (B.hudT === undefined ? T : B.hudT), 0, 0.1); B.hudT = T;
  for (const f of B.fighters) {
    if (f.hudHp === undefined || f.hudHp < f.hp) f.hudHp = f.hp;
    else if (f.hudHp > f.hp) { if (f.flash > 0) f.hudHold = 0.35; f.hudHold = Math.max(0, (f.hudHold || 0) - dt); if (!f.hudHold) f.hudHp = Math.max(f.hp, f.hudHp - f.maxHp * 0.6 * dt); }
  }
}
// The furniture of the interface, drawn on the fight's own canvas in interface units (320 by 180). A plate is a slab of
// dark stone with a bronze line round it and a light along its upper edge; a gauge is a trough cut into one, with a fill
// that is lit from above. Everything the fight shows over the sand is made of these two.
const HUD_BRONZE = '#a8793a', HUD_BRONZE_L = '#e8c27a', HUD_EDGE = '#120b08', HUD_INK = '#f2e6cc', HUD_DIM = '#b5a892';
const HUD_FONT = 'Cinzel, Georgia, serif', HUD_NUM = 'Consolas, monospace';
function hudPlate(ctx, x, y, w, h, o) {
  o = o || {};
  ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.fillRect(x + 0.75, y + 1, w, h);                                  // the shadow it throws
  ctx.fillStyle = HUD_EDGE; ctx.fillRect(x - 0.25, y - 0.25, w + 0.5, h + 0.5);
  ctx.fillStyle = o.line || HUD_BRONZE; ctx.fillRect(x, y, w, h);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, o.top || '#2e2118'); g.addColorStop(1, o.bot || '#150e09');
  ctx.fillStyle = g; ctx.fillRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = o.line ? 'rgba(255,255,255,.35)' : HUD_BRONZE_L; ctx.globalAlpha *= 0.7; ctx.fillRect(x, y, w, 0.25); ctx.globalAlpha /= 0.7;
}
function hudGauge(ctx, x, y, w, h, frac, col, o) {
  o = o || {};
  const fw = Math.round(w * clamp(frac, 0, 1) * 4) / 4, from = o.right ? x + w - fw : x;
  ctx.fillStyle = '#0a0604'; ctx.fillRect(x - 0.5, y - 0.5, w + 1, h + 1);
  ctx.fillStyle = o.trough || '#3a1512'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x, y, w, Math.min(0.5, h / 3));                          // the trough is cut in: its upper lip is in shade
  if (o.lag > frac) { const lw = Math.round(w * clamp(o.lag, 0, 1) * 4) / 4; ctx.fillStyle = '#fff0c8'; ctx.fillRect(o.right ? x + w - lw : x, y, lw, h); }      // what the last blow took, still showing
  if (fw > 0) {
    ctx.fillStyle = col; ctx.fillRect(from, y, fw, h);
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(from, y, fw, h * 0.3);
    ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.fillRect(from, y + h * 0.72, fw, h * 0.28);
    if (fw < w) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(o.right ? from : from + fw - 0.25, y, 0.25, h); }      // a bright edge where it stops
  }
  if (o.ticks) { ctx.fillStyle = 'rgba(0,0,0,.4)'; for (let i = 1; i < o.ticks; i++) ctx.fillRect(x + w * i / o.ticks - 0.125, y, 0.25, h); }
}
// A line of lettering made to fit: it is drawn smaller before it is cut short.
function hudFit(ctx, str, max, size, min, face, weight) {
  let z = size; const f = () => { ctx.font = (weight || 'bold') + ' ' + z + 'px ' + face; };
  f(); while (z > min && ctx.measureText(str).width > max) { z -= 0.25; f(); }
  while (str.length > 3 && ctx.measureText(str).width > max) str = str.slice(0, -2).trimEnd() + '…';
  return str;
}
// A man's head and shoulders in a small frame, as the sand shows him.
function hudFace(ctx, B, f, x, y, w, h, T, lit) {
  const g = f.g, gone = out(f);
  ctx.fillStyle = HUD_EDGE; ctx.fillRect(x - 0.5, y - 0.5, w + 1, h + 1);
  ctx.fillStyle = lit || HUD_BRONZE; ctx.fillRect(x - 0.25, y - 0.25, w + 0.5, h + 0.5);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = B.colD[f.team]; ctx.fillRect(x, y, w, h); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x, y, w, h * 0.4);
  const k = g.beast ? 0.3 : 0.6;
  ctx.translate(x + w / 2 + (g.beast ? 0 : (f.team ? 0.6 : -0.6)), y + (g.beast ? h + 1 : h * 2.42)); ctx.scale(k, k);
  drawSprite(ctx, { x: 0, y: 0, facing: f.team ? -1 : 1, g, team: f.team, col: B.col[f.team], colD: B.colD[f.team], moving: false, walk: 0, clock: 0, atkAnim: 0, flash: gone ? 0 : f.flash, down: false, snare: 0, slash: 0, shadow: { len: 0, a: 0 }, noHelm: f.noHelm });
  ctx.restore();
  if (gone) { ctx.fillStyle = 'rgba(14,9,6,.62)'; ctx.fillRect(x, y, w, h); }
}
// The two corner panels: each side under its own name and colour, and one line a fighter: his face, his name and style,
// his health over his charge, and whatever ails or aids him.
function drawHud(ctx, B) {
  const many = B.fighters.length > 10, rh = many ? 6 : 12, T = B.clock, HEAD = 8, W = 96;
  ctx.textBaseline = 'alphabetic';
  for (const t of [0, 1]) {
    const fs = B.fighters.filter(f => f.team === t), x = t ? 222 : 2, y0 = 2, H = HEAD + fs.length * rh, col = B.col[t], colD = B.colD[t];
    hudPlate(ctx, x, y0, W, H);
    // the head of it: the side's colour, its name, and how many of it still stand
    const hg = ctx.createLinearGradient(x, 0, x + W, 0);
    hg.addColorStop(t ? 1 : 0, shade(col, 1.12)); hg.addColorStop(t ? 0 : 1, colD);
    ctx.fillStyle = hg; ctx.fillRect(x + 0.5, y0 + 0.5, W - 1, HEAD - 1);
    ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(x + 0.5, y0 + 0.5, W - 1, 0.5);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x + 0.5, y0 + HEAD - 2, W - 1, 1.5);
    ctx.fillStyle = HUD_BRONZE_L; ctx.fillRect(x + 0.5, y0 + HEAD - 0.5, W - 1, 0.25);
    ctx.fillStyle = HUD_EDGE; ctx.fillRect(x + 0.5, y0 + HEAD - 0.25, W - 1, 0.25);
    const up = fs.filter(f => !out(f)).length, title = hudFit(ctx, String(B.names ? B.names[t] : t ? 'Their side' : 'Your side').toUpperCase(), W - 24, 4.75, 3.75, HUD_FONT);
    ctx.textAlign = t ? 'right' : 'left'; edgedText(ctx, title, t ? x + W - 3 : x + 3, y0 + 5.9, '#fff6d8', 0.25, 'rgba(0,0,0,.55)');
    ctx.font = 'bold 4.5px ' + HUD_NUM; ctx.textAlign = t ? 'left' : 'right';
    if (fs.length > 1) edgedText(ctx, up + '/' + fs.length, t ? x + 3 : x + W - 3, y0 + 5.9, up ? '#fff6d8' : '#ffb0a4', 0.25, 'rgba(0,0,0,.55)');
    fs.forEach((f, i) => {
      const y = y0 + HEAD + i * rh, gone = out(f), ready = !gone && f.charge >= 100, frac = clamp(f.hp / f.maxHp, 0, 1), low = !gone && frac < 0.25, ih = rh - 0.5;
      if (i % 2) { ctx.fillStyle = 'rgba(255,240,210,.045)'; ctx.fillRect(x + 0.5, y, W - 1, ih); }
      if (i) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x + 0.5, y - 0.25, W - 1, 0.25); ctx.fillStyle = 'rgba(232,194,122,.1)'; ctx.fillRect(x + 0.5, y, W - 1, 0.25); }
      if (ready) { ctx.fillStyle = 'rgba(255,210,74,' + (0.16 + 0.12 * Math.sin(T * 9)).toFixed(3) + ')'; ctx.fillRect(x + 0.5, y, W - 1, ih); }
      if (low) { ctx.fillStyle = 'rgba(200,30,20,' + (0.14 + 0.12 * Math.sin(T * 7)).toFixed(3) + ')'; ctx.fillRect(x + 0.5, y, W - 1, ih); }
      if (!gone && f.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,.26)'; ctx.fillRect(x + 0.5, y, W - 1, ih); }      // he has just been hit
      ctx.fillStyle = gone ? shade(col, 0.5) : col; ctx.fillRect(x + 0.5, y, 1.25, ih);
      if (B.pick === f) { ctx.fillStyle = '#ffd24a'; ctx.fillRect(x + 0.5, y, W - 1, 0.5); ctx.fillRect(x + 0.5, y + ih - 0.5, W - 1, 0.5); }
      const nx = many ? x + 4 : x + 14.5, bx = x + 45, bw = many ? 46 : 35;
      if (!many) hudFace(ctx, B, f, x + 3.5, y + 1.25, 9, 9.25, T, ready ? '#ffd24a' : B.pick === f ? '#ffd24a' : null);
      const name = hudFit(ctx, String(f.g.name || ''), bx - nx - 1.5, many ? 4 : 4.75, many ? 3.5 : 3.75, HUD_FONT);
      ctx.textAlign = 'left'; ctx.fillStyle = gone ? '#9c8f7a' : HUD_INK; ctx.fillText(name, nx, y + (many ? 4.4 : 5.4));
      if (!many) { if (f.style) { ctx.globalAlpha = gone ? 0.45 : 1; drawIcon(ctx, f.style, nx - 0.5, y + 6.2, 0.4); ctx.globalAlpha = 1; } }
      if (gone) {
        const slain = f.fate === 'dead' && (f.revealed || !f.revealAt);
        ctx.font = 'bold ' + (many ? 3.75 : 4.5) + 'px ' + HUD_FONT; ctx.fillStyle = slain ? '#e2695c' : '#c9b9a0';
        ctx.fillText(slain ? 'SLAIN' : f.yielded ? 'YIELDED' : 'DOWN', bx, y + (many ? 4.3 : 6.9));
        if (!many) { ctx.fillStyle = slain ? 'rgba(226,105,92,.4)' : 'rgba(201,185,160,.28)'; const tw = ctx.measureText(slain ? 'SLAIN' : f.yielded ? 'YIELDED' : 'DOWN').width; ctx.fillRect(bx + tw + 2, y + 5.4, x + W - 3 - (bx + tw + 2), 0.25); }
        return;
      }
      const lag = clamp((f.hudHp === undefined ? f.hp : f.hudHp) / f.maxHp, 0, 1);
      hudGauge(ctx, bx, many ? y + 1 : y + 2, bw, many ? 2 : 3.5, frac, low && Math.sin(T * 7) > 0 ? shade(col, 1.35) : col, { lag });
      hudGauge(ctx, bx, many ? y + 4 : y + 7.25, bw, many ? 1 : 1.75, f.charge / 100, ready ? '#fff0b0' : '#e0aa3e', { trough: '#2a2418', ticks: many ? 0 : 4 });
      if (!many) {
        // his health in figures, and READY when he is charged
        ctx.font = 'bold 5px ' + HUD_NUM; ctx.textAlign = 'right'; ctx.fillStyle = low ? '#ff8a7a' : HUD_INK; ctx.fillText(Math.max(0, Math.ceil(f.hp)), x + W - 2, y + 5.6);
        if (ready) { ctx.font = 'bold 3.25px ' + HUD_FONT; ctx.fillStyle = '#fff0b0'; ctx.fillText('READY', x + W - 2, y + 9.4); }
        ctx.textAlign = 'left';
        hudMarks(f).slice(0, 6).forEach((k, j) => drawMark(ctx, k, nx + 5.5 + j * 4, y + 7.3, 0.5));      // what ails or aids him, under his name
      } else {
        let px = bx + bw + 1.25;
        const pip = c => { ctx.fillStyle = c; ctx.fillRect(px, y + 1, 1.5, 3); px += 2; };
        if (f.bleed > 0) pip('#ff3a2a');
        if (f.buff) pip('#6aa8ff');
      }
    });
  }
  ctx.textAlign = 'left';
}

// One of the crowd, seated (up 0) or risen (up 2 or 3): shoulders, a head with a lit and a shaded side, and whatever
// he or she wears on it. Some are children; they are shorter.
function drawSpectator(ctx, p, up) {
  const x = p.x, y = p.y - up, sm = p.small ? 2 : 0, R = (ax, ay, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ax, ay, w, h); };
  R(x - 1, y - 5 + sm, 5, 3 - (sm ? 1 : 0), p.col); R(x - 1, y - 5 + sm, 1, 3 - (sm ? 1 : 0), p.colD);          // shoulders
  R(x, y - 2, 4, 2 + up, p.colD); R(x + 1, y - 2, 1, 2 + up, p.col);                                          // lap, or legs when standing
  R(x, y - 8 + sm, 3, 3, p.skin); R(x + 2, y - 8 + sm, 1, 3, p.skinD || p.skin);                              // the face
  if (p.veil) { R(x - 1, y - 9 + sm, 5, 2, p.col); R(x - 1, y - 7 + sm, 1, 2, p.col); }                       // a mantle drawn over the head
  else if (p.hat) { R(x - 1, y - 9 + sm, 5, 1, '#c9a763'); R(x, y - 10 + sm, 3, 1, '#b08a48'); }              // a straw hat against the sun
  else { R(x, y - 9 + sm, 3, 1, p.hair); if (p.long) { R(x - 1, y - 8 + sm, 1, 4, p.hair); R(x + 3, y - 8 + sm, 1, 3, p.hair); } }
  if (up && p.arms) { R(x - 2, y - 10, 1, 5, p.skin); R(x + 4, y - 10, 1, 5, p.skin); }
}

const ARENA_TORCHES = [24, 132, 294, 402];      // x of each wall torch, in sprite pixels
const ARENA_AISLES = [70, 142, 278, 350];       // x of each flight of stairs up through the stands

// Everything that does not move is painted once per fight onto its own canvas (428x240 sprite pixels).
// A fight outside the walls has no stands and no wall: trees, rock, a palisade or old stones, and open ground.
function renderWild(B) {
  const cv = document.createElement('canvas'); cv.width = 428; cv.height = 240;
  const main = cv.getContext('2d'), k = B.wild, seed = B.wseed || (B.wseed = 1 + Math.floor(Math.random() * 900));      // no two fights on quite the same ground
  B._slabs = [];
  let ctx = main;      // (what is being painted on: the picture, then a sheet for all that stands nearer than the hills, then the sky under cloud)
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const h = i => Math.abs(Math.sin((i + seed) * 127.1 + 311.7) * 43758.5453) % 1;
  const blob = (cx, cy, rx, ry, col) => { ctx.fillStyle = col; for (let yy = -ry; yy <= ry; yy++) { const hw = Math.round(rx * Math.sqrt(1 - (yy * yy) / (ry * ry))); ctx.fillRect(Math.round(cx - hw), Math.round(cy + yy), hw * 2, 1); } };
  // The ground a fight is fought on keeps the year, as the province round it does (se: 0 spring, 1 summer, 2 autumn,
  // 3 winter): the grass fresher or drier or gone to straw, the trees lighter in spring and some of them in blossom,
  // turned in autumn, and bare in winter but for the firs in the wood behind.
  const se = typeof sceneSeason === 'function' ? sceneSeason() : 0;
  const ground = ({ forest: ['#6f8a45', '#788a44', '#857a46', '#77805c'], rock: ['#8f8a78', '#908a76', '#8f8674', '#8c8a80'], camp: ['#8a7650', '#8e7a50', '#8a704c', '#857a62'], ruin: ['#7f8a55', '#888a52', '#8a7e50', '#7c8262'] }[k] || ['#6f8a45', '#788a44', '#857a46', '#77805c'])[se];
  const gD = shade(ground, 0.84), gL = shade(ground, 1.14);
  B._ground = ground;      // (kept: what a man's feet raise from it is of its colour. fightDust asks.)

  // ---- sky: paler toward the horizon, the sun, a few clouds ----
  // The sun is where the hour has it, by the same sky the fight takes its light from (see drawBattle): coming up
  // over the hills on the left in the morning, high at noon, and going down behind them on the right, redder the
  // lower it is and with the sky lit about it. (sun: where, its colour, and how low, 0 at noon to 1 on the hills.)
  const hour = typeof yardSky !== 'function' || typeof mixHex !== 'function' ? null : typeof provSky === 'function' && typeof G !== 'undefined' && G && G.field ? provSky() : typeof sceneClock === 'function' ? yardSky(sceneClock()) : null;
  const crest = x => 36 + Math.round(Math.sin(x * 0.019 + seed) * 8 + Math.sin(x * 0.047 + 2) * 4);      // how high the further hills stand, at x (see them, below)
  const sunX = hour && hour.sun ? Math.round(128 + (hour.sun[0] - 40) / 510 * 172) : 0;      // (it keeps to the middle of the sky, between the two lists of names that lie over the corners of the picture; and at the first and the last of the day it stands a little more than half clear of the hills, wherever along them that is)
  const sun = !hour ? [330 - (seed % 200), 18, '#fdf4d0', 0] : hour.sun ? [sunX, Math.round(10 + (hour.sun[1] - 12) / 45 * (crest(sunX) - 12)), mixHex(hour.sunCol, '#ffffff', 0.3), clamp((hour.sun[1] - 12) / 58, 0, 1)] : null;
  B._sun = sun;      // (kept: the men's shadows are thrown from it. See drawBattle.)
  // And the sky itself is the colour the hour makes it: the blue of the day, with whatever the yard's sky has more or
  // less than its own day's blue at that hour (yardSky's bands) put into it, so that it is rose and pale at first
  // light and red and gold at the day's end, down to the hills.
  { const DAYB = ['#8fbcd4', '#a9cfdc', '#c5dfe0'], rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    const bandAt = (b, y) => { const t = Math.min(1, y / 57) * 2, a = rgb(b[t < 1 ? 0 : 1]), z = rgb(b[t < 1 ? 1 : 2]), f = t < 1 ? t : t - 1; return a.map((v, i) => v + (z[i] - v) * f); };
    const turned = !!hour && hour.bands.join() !== DAYB.join();
    for (let y = 0; y < 60; y += 3) {
      if (!turned) { R(0, y, 428, 3, shade('#9cc0d8', 0.9 + y / 190)); continue; }
      const now = bandAt(hour.bands, y), day = bandAt(DAYB, y), f = 0.9 + y / 190;
      R(0, y, 428, 3, 'rgb(' + [156, 192, 216].map((v, i) => clamp(Math.round(v * f + now[i] - day[i]), 0, 255)).join(',') + ')');
    } }
  if (sun) {
    const [sx, sy, sc, low] = sun, n = parseInt(sc.slice(1), 16), glow = a => `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
    if (low > 0.4) { blob(sx, crest(sx) + 4, 96, 24, glow((low - 0.4) * 0.4)); blob(sx, crest(sx) + 4, 56, 16, glow((low - 0.4) * 0.4)); }
    blob(sx, sy, 14, 14, glow(0.25)); blob(sx, sy, 9, 9, sc);
  }
  // The clouds are not painted here: they go over, so drawBattle draws them every frame, between this sky and the
  // hills (B._land, at the end of this). Kept for it: where each begins, how high, how wide and how fast against the
  // others; and their colours at this hour, the body of a cloud, its top, and its underside, which the sun reddens
  // when it is low.
  B._clouds = [0, 1, 2, 3].map(c => ({ x: 40 + h(c + 40) * 350, y: Math.round(8 + h(c + 50) * 22), w: Math.round(20 + h(c) * 14), sp: 0.75 + h(c + 60) * 0.5 }));
  B._cloudCol = !hour ? ['#eef5f8', '#f8fbfc', '#dfeaf0'] : [hour.cloud, mixHex(hour.cloud, '#ffffff', 0.6), mixHex(mixHex(hour.cloud, hour.bands[0], 0.16), hour.sunCol, sun ? sun[3] * 0.4 : 0)];
  // ---- two ranges of far hills, bluer and fainter the further off ----
  // They keep the year too: fresh in spring, bracken and turned woods in autumn, dead grass under a cold haze in
  // winter. (Each range, and what catches the eye along its crest. renderWildSnow knows the hills by these colours.)
  const HILL = [['#93b0a6', '#a8c0b6', '#72975c', '#5f864e'], ['#8fa9a6', '#a3bab6', '#6c8b68', '#5c7a58'], ['#a3a498', '#b6b6a8', '#94805a', '#7c6238'], ['#99a5ae', '#aeb8bf', '#7d8472', '#676c5e']][se];
  B._hills = HILL.map(c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
  const hills = ([far, farL, near, nearD]) => {
    for (let x = 0; x < 428; x += 2) { const t = crest(x); R(x, t, 2, 46, far); if (h(x) > 0.82) R(x, t, 2, 1, farL); }
    for (let x = 0; x < 428; x += 2) { const t = 52 + Math.round(Math.sin(x * 0.031 + 1 + seed) * 6 + Math.sin(x * 0.085) * 3); R(x, t, 2, 30, near); if (h(x + 300) > 0.7) R(x, t - 2, 2, 2, nearD); }
  };
  hills(HILL);
  // Everything nearer than the hills is painted on a sheet of its own, and laid over them when it is done: so that
  // it can be laid over a second sky as well, the one there is under cloud (see the end of this).
  const fg = Object.assign(document.createElement('canvas'), { width: 428, height: 240 }); ctx = fg.getContext('2d');
  let shafts = null;      // (the sun coming down through a wood, if this is one)
  // ---- the ground: broad lights and darks, then grain, then a place worn smooth in the middle ----
  R(0, 78, 428, 162, ground);
  for (let n = 0; n < 16; n++) blob(h(n + 10) * 428, 96 + h(n + 20) * 136, 26 + h(n + 30) * 34, 4 + h(n + 31) * 7, n % 2 ? 'rgba(255,250,210,.06)' : 'rgba(30,40,10,.07)');
  blob(214, 164, 150, 46, 'rgba(240,225,180,.07)'); blob(214, 164, 96, 28, 'rgba(240,225,180,.06)');
  for (let n = 0; n < 620; n++) R(h(n) * 426, 84 + h(n + 900) * 154, 1 + Math.round(h(n + 5) * 2), 1, n % 2 ? gD : gL);
  const tuft = (x, y, c) => { R(x, y - 3, 1, 3, c); R(x + 1, y - 2, 1, 2, shade(c, 1.2)); R(x + 2, y - 4, 1, 4, c); R(x - 1, y - 1, 1, 1, c); };
  const stone = (x, y, w, c) => { R(x, y - 3, w, 3, c); R(x + 1, y - 4, w - 2, 1, c); R(x + 1, y - 4, w - 3, 1, shade(c, 1.25)); R(x, y - 1, w, 1, shade(c, 0.7)); R(x - 1, y, w + 3, 1, 'rgba(0,0,0,.2)'); };
  const MASSES = [[0, -30, 15, 0], [-9, -22, 11, 1], [9, -24, 12, 2], [-2, -34, 9, 3]];      // where a tree's leaf is, about its trunk: four masses of it
  const tree = (x, y, sc, dark) => {
    const tk = dark ? '#3a2a1c' : '#4a3320', tv = h(Math.round(x) + 1300), fir = dark && tv > 0.45;      // (fir: one of the wood behind that keeps its dark all the year)
    let pal = dark ? ['#27432a', '#2c4c2f', '#223b26', '#33562f'] : ['#2f5226', '#35602b', '#2a4a22', '#4a7a36'], tips = ['#5a8c40', '#56883e'];
    if (se === 0 && !dark) { pal = ['#3a6a2a', '#427a30', '#346028', '#5a9040']; tips = ['#74a850', '#6ea24c']; }
    if (se === 2 && !fir) {      // turned: rust, gold, red, or one that holds its green
      const q = Math.floor(tv * 3.99);
      pal = dark ? [['#5a4222', '#6a4c26', '#4e3a1e', '#7a5a2a'], ['#6a5a26', '#7a6a2c', '#5a4c20', '#8a7a32'], ['#5a3a20', '#6a4424', '#4e321c', '#7a5028'], ['#27432a', '#2c4c2f', '#223b26', '#33562f']][q] : [['#a8622a', '#b8702e', '#8f5226', '#d08a3a'], ['#b08a2e', '#c09a36', '#96762a', '#dcae4a'], ['#8f4a26', '#a05a2c', '#7a4022', '#bf6e34'], ['#4a6a2a', '#547a30', '#405c26', '#7a9a3a']][q];
      tips = [shade(pal[3], 1.18), shade(pal[3], 1.1)];
    }
    R(x - 2 * sc, y - 16 * sc, 4 * sc, 16 * sc, tk); R(x - 2 * sc, y - 16 * sc, sc, 16 * sc, shade(tk, 0.7)); R(x + sc, y - 12 * sc, sc, 3 * sc, shade(tk, 1.3));
    if (se === 3 && !fir) {      // bare: a bough out from the head of the trunk to where each mass of leaf was, and the twigs off the end of it
      const bt = dark ? '#33261a' : tk;
      for (const [ox, oy, r] of MASSES) {
        const x0 = x, y0 = y - 16 * sc, x1 = x + ox * sc, y1 = y + (oy + r * 0.4) * sc, n = Math.max(4, Math.round(Math.hypot(x1 - x0, y1 - y0)));
        for (let q = 0; q <= n; q++) R(x0 + (x1 - x0) * q / n, y0 + (y1 - y0) * q / n, q < n * 0.5 && sc >= 1 ? 2 : 1, 1, bt);
        for (let t = 0; t < 4; t++) { const a = (t - 1.5) * 0.62 + (ox < 0 ? -0.35 : ox > 0 ? 0.35 : 0), len = Math.round(r * 0.75 * sc); for (let q = 1; q <= len; q++) R(x1 + Math.sin(a) * q, y1 - Math.cos(a) * q, 1, 1, q > len * 0.6 ? shade(bt, 1.25) : bt); }
      }
      return;
    }
    for (const [ox, oy, r, ci] of MASSES) blob(x + ox * sc, y + oy * sc, r * sc, r * sc, pal[ci]);
    if (!dark) { blob(x - 5 * sc, y - 37 * sc, 5 * sc, 3 * sc, tips[0]); blob(x + 6 * sc, y - 31 * sc, 4 * sc, 2 * sc, tips[1]); }
    if (se === 0 && !dark && tv > 0.55) for (let q = 0; q < 9; q++) R(x + (h(q * 3 + Math.round(x)) - 0.5) * 26 * sc, y - (20 + h(q * 5 + Math.round(x) + 9) * 20) * sc, 1, 1, q % 2 ? '#f8e0e8' : '#ffffff');      // in blossom
  };
  // (frame: one of the dark growth along the near edge, which stays dark whatever the season)
  const bush = (x, y, c, frame) => {
    if (se === 2) c = frame ? '#4c4222' : h(Math.round(x) + 77) > 0.5 ? '#8a7436' : '#6f7a34';
    if (se === 3) { const tw = frame ? '#33291c' : '#5a4e3a'; blob(x, y - 2, 6, 3, frame ? '#3a3024' : '#665a44'); for (let q = 0; q < 6; q++) R(x - 6 + q * 2.4, y - 5 - (q % 3), 1, 4 + (q % 2), tw); return; }      // in winter a bush is its twigs
    blob(x, y - 3, 7, 4, c); blob(x - 4, y - 1, 5, 3, shade(c, 0.86)); blob(x + 2, y - 5, 4, 2, shade(c, 1.2));
  };

  if (k === 'forest') {
    for (let n = 0; n < 22; n++) tree(n * 20 + h(n + 200) * 12, 76 + h(n + 210) * 4, 0.7, true);                      // the wood behind, dark and close
    for (let n = 0; n < 15; n++) tree(8 + n * 30 + h(n) * 12, 82 + h(n + 3) * 8, 1, false);
    if (se !== 3) shafts = () => { for (let n = 0; n < 5; n++) { const x = 30 + n * 90 + h(n + 77) * 40, k = clamp((x + 6 - sun[0]) / 150, -0.8, 0.8); ctx.fillStyle = 'rgba(255,248,200,.07)'; for (let q = 0; q < 70; q++) ctx.fillRect(Math.round(x + q * k), 14 + q, 12, 1); } };      // light coming down through the leaves, away from the sun on either side of it (laid on last, and only under a fair sky: see the end of this)
    for (let n = 0; n < 24; n++) bush(h(n + 60) * 428, 86 + h(n + 70) * 7, n % 3 ? '#3f6a30' : '#4a7a36');
    const lx = 60 + h(1) * 260; R(lx, 100, 44, 6, '#5a4026'); R(lx, 100, 44, 2, '#74552f'); R(lx - 2, 100, 3, 6, '#8a6a3a'); R(lx - 1, 102, 1, 2, '#5a4026'); R(lx + 12, 97, 2, 4, '#5a4026'); for (let q = 0; q < 4; q++) R(lx + 6 + q * 9, 104, 4, 2, '#4f7a3a');      // a fallen trunk, mossed over
    for (let n = 0; n < (se === 2 ? 420 : 160); n++) R(h(n + 400) * 426, 92 + h(n + 410) * 146, 2, 1, (se === 2 ? ['#c9822e', '#a8562a', '#d9a23a'] : ['#8a6a3a', '#a8762e', '#6a5a2a'])[n % 3]);          // last year's leaves; and in autumn this year's, coming down
    for (let n = 0; n < 9; n++) { const x = h(n + 500) * 420, y = 100 + h(n + 510) * 120; R(x, y - 2, 1, 2, '#e8dcc0'); R(x - 1, y - 3, 3, 1, n % 2 ? '#b8452e' : '#c9a763'); }      // mushrooms
  } else if (k === 'rock') {
    for (let x = 0; x < 428; x += 3) {           // the cliff: banded, ledged, cracked
      const t = 20 + Math.round(Math.sin(x * 0.03 + seed) * 9 + h(x) * 6);
      R(x, t, 3, 82 - t, '#77705f'); R(x, t, 3, 2, '#a39c88'); R(x, t + 2, 3, 1, '#8a8371');
      for (let b = t + 9; b < 82; b += 9 + Math.round(h(x + b) * 2)) R(x, b + Math.round(Math.sin(x * 0.05) * 2), 3, 1, '#655f50');
      if (h(x + 7) > 0.72) R(x, t + 6 + h(x) * 30, 1, 12, '#55503f');
    }
    for (let n = 0; n < 6; n++) { const x = h(n + 80) * 400, y = 40 + h(n + 81) * 30; R(x, y, 22 + h(n) * 16, 2, '#8f8875'); R(x, y + 2, 22 + h(n) * 16, 2, '#5d5749'); }      // ledges
    R(172, 48, 84, 38, '#16110d'); R(178, 42, 72, 8, '#16110d'); R(188, 38, 52, 5, '#16110d'); R(200, 35, 28, 4, '#16110d'); R(196, 60, 36, 26, '#0c0907');      // the mouth of the lair
    R(168, 84, 92, 3, '#5d5749'); for (let n = 0; n < 7; n++) { const x = 178 + n * 11; R(x, 87 + (n % 2), 5, 1, '#efe8d8'); R(x + 1, 86 + (n % 2), 1, 3, '#d8d0bc'); }      // what it has left at its door
    R(206, 90, 6, 4, '#efe8d8'); R(207, 91, 1, 1, '#1c1310'); R(210, 91, 1, 1, '#1c1310');
    const dx = 40 + h(2) * 60; R(dx, 40, 3, 46, '#4a3a2a'); R(dx - 9, 48, 10, 2, '#4a3a2a'); R(dx + 2, 44, 12, 2, '#4a3a2a'); R(dx - 12, 44, 2, 5, '#4a3a2a'); R(dx + 13, 38, 2, 7, '#4a3a2a');      // a dead tree
    for (let n = 0; n < 16; n++) stone(10 + h(n + 20) * 400, 86 + h(n) * 16, 8 + Math.round(h(n + 9) * 10), n % 2 ? '#77705f' : '#8a8371');
    for (let n = 0; n < 260; n++) R(h(n + 600) * 426, 90 + h(n + 610) * 148, 2, 1, n % 3 ? '#77705f' : '#a39c88');      // scree
    for (let n = 0; n < 10; n++) bush(h(n + 700) * 428, 96 + h(n + 710) * 12, '#6a7a4a');
  } else if (k === 'camp') {
    for (let n = 0; n < 6; n++) tree(20 + n * 80 + h(n) * 20, 70, 0.8, true);
    for (let x = 0; x < 428; x += 6) {           // the palisade: sharpened stakes, lashed with rope
      const t = 50 + Math.round(h(x) * 6);
      R(x, t, 5, 86 - t, '#6b4f2c'); R(x, t, 1, 86 - t, '#4a3620'); R(x + 3, t, 1, 86 - t, '#7d5e36'); R(x + 1, t - 3, 3, 3, '#6b4f2c'); R(x + 2, t - 5, 1, 2, '#7d5e36');
    }
    R(0, 62, 428, 2, '#a8905c'); R(0, 74, 428, 2, '#8f7a4c');
    R(186, 54, 56, 32, '#231811'); R(184, 52, 3, 34, '#5a4026'); R(241, 52, 3, 34, '#5a4026'); R(182, 50, 64, 3, '#7d5e36');      // the gate, standing open
    R(30, 22, 4, 64, '#5a4026'); R(62, 22, 4, 64, '#5a4026'); R(26, 40, 44, 3, '#7d5e36'); R(28, 24, 40, 16, '#4a3620'); R(26, 18, 44, 5, '#8a6a3a'); R(30, 12, 36, 6, '#a8452e'); R(34, 8, 28, 4, '#b8553a');      // a watch tower
    const tent = (tx, c1, c2) => { for (let q = 0; q < 28; q++) R(tx - q, 58 + q, q * 2, 1, Math.floor(q / 3) % 2 ? c1 : c2); R(tx - 5, 72, 10, 14, '#231811'); R(tx - 1, 54, 2, 5, '#5a4026'); };
    tent(110, '#b8a880', '#a09068'); tent(330, '#a8785a', '#8f6248');
    R(268, 76, 12, 10, '#7a5a34'); R(268, 76, 12, 2, '#94703f'); R(282, 80, 9, 6, '#6b4f2c'); R(282, 80, 9, 1, '#8a6a3a');        // crates
    for (let q = 0; q < 3; q++) { R(376 + q * 5, 62, 1, 24, '#5a4026'); R(375 + q * 5, 60, 3, 3, '#c1c7cc'); } R(372, 74, 20, 2, '#5a4026');      // spears racked
    R(150, 30, 2, 56, '#3a2a1c');                // the pole their banner flies from (the cloth is drawn live)
    R(204, 94, 20, 3, '#3a2a1c'); R(208, 92, 12, 2, '#2a1d12'); for (let q = 0; q < 6; q++) R(202 + q * 4, 96, 3, 2, '#77705f');      // the fire's ring of stones
    for (let n = 0; n < 240; n++) R(h(n + 800) * 426, 90 + h(n + 810) * 148, 3, 1, n % 2 ? '#7a6644' : '#9a865e');
    for (let q = 0; q < 2; q++) { ctx.fillStyle = 'rgba(60,40,20,.12)'; for (let x = 0; x < 428; x += 2) ctx.fillRect(x, 150 + q * 12 + Math.round(Math.sin(x * 0.02) * 5), 2, 2); }      // cart ruts
  } else {
    for (let n = 0; n < 9; n++) { const x = 16 + n * 50 + h(n) * 14; R(x - 1, 34, 3, 46, '#3a2a1c'); for (let q = 0; q < 44; q++) R(x - Math.round(5 * Math.sin(q / 44 * Math.PI) + 1), 34 + q - 12, Math.round(10 * Math.sin(q / 44 * Math.PI)) + 3, 1, q % 3 ? '#2f4a2e' : '#3a5a36'); }      // cypresses behind
    const column = (x, hh, broken) => {
      R(x, 86 - hh, 12, hh, '#c9c3ae'); R(x, 86 - hh, 3, hh, '#a8a290'); R(x + 9, 86 - hh, 2, hh, '#e4dfcd'); for (let q = 2; q < 10; q += 2) R(x + q, 86 - hh + 3, 1, hh - 6, '#b5af9b');
      R(x - 2, 83, 16, 3, '#b5af9b'); R(x - 3, 85, 18, 2, '#a8a290');
      if (!broken) { R(x - 2, 86 - hh, 16, 3, '#dcd6c2'); R(x - 3, 86 - hh - 2, 18, 2, '#e4dfcd'); } else { R(x, 86 - hh, 4, 2, '#7f8a55'); R(x + 5, 86 - hh - 2, 4, 3, '#c9c3ae'); }
      for (let q = 0; q < hh; q += 3) if (h(x + q) > 0.6) R(x + (q % 2 ? 0 : 9), 86 - q, 3, 2, '#4f7a3a');          // ivy has found it
    };
    [[52, 44, true], [112, 30, true], [176, 54, false], [252, 54, false], [314, 24, true], [370, 40, true]].forEach(([x, hh, br]) => column(x, hh, br));
    R(170, 22, 100, 8, '#c9c3ae'); R(170, 22, 100, 2, '#e4dfcd'); R(170, 28, 100, 2, '#a8a290'); for (let q = 0; q < 9; q++) R(176 + q * 11, 24, 6, 3, '#b5af9b');      // what is left of the lintel
    for (const [x, y, w] of [[286, 92, 40], [70, 100, 26], [334, 108, 22]]) { R(x, y - 8, w, 8, '#c9c3ae'); R(x, y - 8, w, 2, '#e4dfcd'); R(x, y - 1, w, 1, '#a8a290'); for (let q = 4; q < w; q += 8) R(x + q, y - 7, 1, 6, '#b5af9b'); R(x - 1, y, w + 3, 1, 'rgba(0,0,0,.2)'); }      // drums of fallen columns
    for (let gy = 96; gy < 236; gy += 20) for (let gx = (gy / 20 % 2) * 22 - 10; gx < 428; gx += 44) {           // the old paving, with grass coming through
      if (h(gx * 7 + gy) > 0.42) { B._slabs.push([Math.round(gx + 2), gy + 2]);      // (kept: snow lies on a slab as it does on the ground beside it. renderWildSnow asks.)
        R(gx + 2, gy + 2, 40, 16, 'rgba(210,204,186,.20)'); R(gx + 2, gy + 2, 40, 1, 'rgba(240,236,220,.25)'); R(gx + 2, gy + 17, 40, 1, 'rgba(60,60,40,.2)'); }
    }
    for (let n = 0; n < 10; n++) bush(h(n + 60) * 428, 88 + h(n + 70) * 6, '#57863a');
  }
  // ---- grass and stones about the place, and darker growth along the near edge to frame the fight ----
  const tc = se === 3 ? '#8c8862' : se === 2 ? '#8a8440' : k === 'rock' ? '#7a8456' : k === 'camp' ? '#7f8a4a' : '#4f7a34';      // (grass: gone to straw by autumn, and paler still in winter)
  for (let n = 0; n < (k === 'camp' ? 40 : 90); n++) tuft(h(n + 1000) * 424, 94 + h(n + 1010) * 142, n % 4 ? tc : shade(tc, 1.2));
  for (let n = 0; n < (k === 'rock' ? 0 : 9); n++) stone(h(n + 1100) * 410, 104 + h(n + 1110) * 126, 5 + Math.round(h(n + 1120) * 5), '#8a8371');
  for (let n = 0; n < 26; n++) { const x = n * 17 + h(n + 1200) * 10; bush(x, 240 + h(n + 1210) * 3, shade(tc, 0.6), true); }
  for (let n = 0; n < 5; n++) R(0, 78 + n * 4, 428, 4, `rgba(20,30,10,${(0.3 * (1 - n / 5)).toFixed(3)})`);
  for (let n = 0; n < 4; n++) R(0, 224 + n * 4, 428, 4, `rgba(15,20,8,${(0.06 + n * 0.05).toFixed(3)})`);
  main.drawImage(fg, 0, 0); B._near = fg;      // (kept: where it is clear above the ground, there is sky or the hills. renderWildSnow asks.)
  if (shafts && sun) { ctx = main; shafts(); }
  // The hills and all that stands in front of them, as far down as the ground, a second time with nothing behind:
  // laid back over the clouds once they are drawn (drawBattle), so that a cloud goes behind the hills and the trees.
  { const land = Object.assign(document.createElement('canvas'), { width: 428, height: 84 }); ctx = land.getContext('2d'); hills(HILL); ctx.drawImage(fg, 0, 0);
    if (shafts && sun) { ctx.globalCompositeOperation = 'source-atop'; shafts(); ctx.globalCompositeOperation = 'source-over'; }      // (the light through the leaves, where it falls on something: on the open sky the picture has it already)
    B._land = land; }
  // ---- the same sky under cloud ----
  // What is above the ground, painted a second time as it is when the weather has closed in: the blue gone out of
  // the sky, a deck of cloud across it with only a pale place where the sun is, and the hills gone grey and faint
  // behind the same trees. drawBattle lays it over the fair sky by how much cloud there is (yardWeather's over), so
  // the sun goes in as the cloud comes on, and rain and snow fall out of a sky that could hold them.
  if (typeof mixHex === 'function') {
    const dull = Object.assign(document.createElement('canvas'), { width: 428, height: 84 }), grey = '#8d98a3', over = mixHex('#9cc0d8', grey, 0.8), low = mixHex(over, '#ffffff', 0.2);      // (low: the sky as it is down at the hills)
    ctx = dull.getContext('2d');
    for (let y = 0; y < 60; y += 3) R(0, y, 428, 3, shade(over, 0.9 + y / 190));
    R(0, 60, 428, 18, low);
    if (sun) { blob(sun[0], sun[1], 24, 11, 'rgba(255,255,255,.09)'); blob(sun[0], sun[1], 13, 6, 'rgba(255,255,255,.1)'); }      // where the sun is, behind it
    for (let c = 0; c < 14; c++) { const cx = h(c + 1500) * 428, cy = 4 + h(c + 1510) * 42, w = 34 + h(c + 1520) * 40; blob(cx, cy, w, 4, '#98a1ab'); blob(cx + 10, cy - 3, w * 0.55, 3, '#b0b8c1'); blob(cx - 8, cy + 3, w * 0.7, 2, '#77828e'); }
    hills([mixHex(HILL[0], low, 0.6), mixHex(HILL[0], low, 0.6), shade(mixHex(HILL[2], grey, 0.3), 0.93), shade(mixHex(HILL[3], grey, 0.3), 0.93)]);
    ctx.drawImage(fg, 0, 0);
    B._dull = dull;
  }
  return cv;
}

function renderBackdrop(B) {
  if (B.wild) return renderWild(B);
  const th = B.theme, cv = document.createElement('canvas');
  cv.width = 428; cv.height = 240;
  const ctx = cv.getContext('2d');
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  // stands and the seated crowd
  R(0, 0, 428, 66, th.stands);
  const dusk0 = B.light === 'dusk', stone = !th.planks;
  if (!th.awning) {                             // the top of the stands, and the sky over it
    for (let y = 0; y < 10; y += 2) R(0, y, 428, 2, dusk0 ? shade('#e59a66', 0.86 + y / 60) : shade('#a9c8dc', 0.9 + y / 80));
    const rim = P => {
      if (stone) {                              // an arcade round the rim: columns and a lintel against the light
        P(0, 0, 428, 2, th.wallTop); P(0, 2, 428, 1, th.wallLine);
        for (let x = 2; x < 428; x += 14) { P(x, 3, 3, 8, th.wallTop); P(x + 2, 3, 1, 8, th.wallLine); }
      } else {                                  // a village pit: far hills, a rail, and posts
        for (let x = 0; x < 428; x += 2) { const t = 4 + Math.round(Math.sin(x * 0.03) * 2 + Math.sin(x * 0.08 + 1) * 1.5); P(x, t, 2, 10 - t, '#6f8a5a'); }
        for (let x = 6; x < 428; x += 22) { P(x, 3, 2, 9, '#5e4426'); P(x, 3, 1, 9, '#7a5a34'); }
        P(0, 6, 428, 1, '#7a5a34');
      }
    };
    rim(R);
    // (What stands against the sky is kept on a strip of its own as well, with nothing behind it: by day the sky
    // there is painted afresh every frame, as the hour and the weather have it, and this is laid back over it; and
    // at a bout to the death the red of the evening is painted out under cloud, and this laid back the same way.
    // See drawBattle.)
    { const strip = Object.assign(document.createElement('canvas'), { width: 428, height: 10 }), sc = strip.getContext('2d'); rim((x, y, w, h, col) => { sc.fillStyle = col; sc.fillRect(x, y, w, h); }); B._rim = strip; }
    R(0, 10, 428, 3, stone ? th.wallTop : '#7a5a34'); R(0, 13, 428, 2, stone ? th.wallLine : '#4a3520'); R(0, 15, 428, 3, 'rgba(0,0,0,.28)');
  }
  // the rows: each seat lit along its top edge, in shade down its face
  for (let y = 23; y <= 65; y += 9) {
    if (th.planks) {      // the pits: no seats, only the earth thrown up out of the hole, cut into steps, turf along each and a plank here and there to sit on
      const e = shade('#77653f', 0.86 + (y - 23) / 42 * 0.24);
      R(0, y - 8, 428, 8, e); R(0, y, 428, 1, '#7f9a4b'); R(0, y + 1, 428, 1, shade(e, 0.7));
      for (let x = (y * 7) % 13; x < 428; x += 13) R(x, y - 1, 2 + (x % 3), 1, (x + y) % 2 ? '#6f8f42' : '#93ab58');
      for (let x = (y * 11) % 17; x < 428; x += 17) R(x, y - 5 + (x % 3), 2, 1, shade(e, x % 2 ? 0.85 : 1.15));
      for (let x = 12 + (y % 18) * 2; x < 428; x += 46) { R(x, y - 3, 24, 2, '#a8834a'); R(x, y - 3, 24, 1, '#c9a763'); R(x, y - 1, 24, 1, 'rgba(0,0,0,.25)'); R(x + 2, y - 1, 1, 1, '#5e4426'); R(x + 21, y - 1, 1, 1, '#5e4426'); }
      continue;
    }
    R(0, y - 8, 428, 8, shade(th.stands, 0.92 + (y - 23) / 42 * 0.16));
    R(0, y, 428, 1, shade(th.stands, 1.55)); R(0, y + 1, 428, 1, shade(th.step, 0.8));
    if (stone) for (let x = (y % 2) * 7; x < 428; x += 14) R(x, y - 7, 1, 7, th.step);       // the joints between the blocks
    else for (let x = 0; x < 428; x += 9) R(x, y - 7, 1, 7, shade(th.stands, 0.8));          // or planks
  }
  // the stairs up through the crowd, each from its own doorway
  for (const a of ARENA_AISLES) {
    if (th.planks) { R(a, 15, 9, 51, '#8f7c52'); R(a, 15, 1, 51, '#75643e'); R(a + 8, 15, 1, 51, '#75643e'); for (let y = 18; y < 66; y += 4) R(a + 1, y, 7, 1, '#7c6a44'); continue; }      // a path trodden down the bank, and no doorway at the foot of it
    R(a, 15, 9, 51, shade(th.stands, 1.5)); R(a, 15, 1, 51, shade(th.stands, 1.15)); R(a + 8, 15, 1, 51, shade(th.stands, 1.15));
    for (let y = 17; y < 58; y += 3) R(a + 1, y, 7, 1, shade(th.stands, 1.15));
    R(a + 1, 57, 7, 9, '#120c0a'); R(a, 56, 9, 1, stone ? th.wallTop : '#7a5a34'); R(a + 2, 55, 5, 1, stone ? th.wallTop : '#7a5a34');
  }
  for (const p of B.crowd) drawSpectator(ctx, p, 0);
  if (th.awning) {
    for (let x = -4; x < 428; x += 24) { const c = ((x + 4) / 24) % 2 ? '#e8d7b0' : '#b8452e'; R(x, 0, 24, 8, c); R(x + 2, 8, 20, 2, c); R(x + 6, 10, 12, 1, c); }
    R(0, 11, 428, 3, 'rgba(0,0,0,.3)');
  }
  if (th.box) { // the imperial box
    R(170, 22, 88, 4, '#7a3a8e'); R(170, 26, 88, 1, '#e8b545');
    R(174, 27, 80, 39, '#e8b545'); R(177, 29, 74, 37, '#5a2a6a');
    for (let x = 184; x < 250; x += 9) R(x, 29, 2, 37, '#43204f');
    R(174, 27, 5, 39, '#f0e8d6'); R(249, 27, 5, 39, '#f0e8d6'); R(174, 27, 2, 39, '#c9c0aa'); R(249, 27, 2, 39, '#c9c0aa');
  } else if (th.planks) {      // a plank stand with a cloth roof
    R(192, 38, 44, 28, '#2a1d16'); R(190, 34, 2, 32, '#5e4426'); R(236, 34, 2, 32, '#5e4426');
    R(188, 32, 52, 3, '#8a6a4a'); R(188, 32, 52, 1, '#a8855e');
    for (let x = 190; x < 238; x += 8) { R(x, 35, 8, 3, (x / 8) % 2 ? '#a8452e' : '#e8d7b0'); R(x + 2, 38, 4, 1, (x / 8) % 2 ? '#a8452e' : '#e8d7b0'); }
  } else {                     // a stone box hung with red
    R(190, 34, 48, 32, '#5a1f1a'); for (let x = 196; x < 236; x += 8) R(x, 36, 2, 30, '#461612');
    R(187, 30, 54, 4, th.wallTop); R(187, 34, 54, 1, '#e8b545');
    R(188, 35, 4, 31, th.wallTop); R(236, 35, 4, 31, th.wallTop); R(188, 35, 1, 31, th.wallLine); R(236, 35, 1, 31, th.wallLine);
  }
  // wall
  R(0, 66, 428, 3, th.wallTop); R(0, 69, 428, 17, th.wall);
  if (th.planks) {
    for (let x = 4; x < 428; x += 10) {
      R(x, 66, 1, 20, th.wallLine); R(x + 3, 63, 5, 3, th.wall); R(x + 4, 61, 3, 2, th.wallTop);
      R(x + 5, 72, 1, 1, th.wallLine); R(x + 5, 82, 1, 1, th.wallLine);
    }
    R(0, 76, 428, 2, th.wallLine); R(0, 78, 428, 1, shade(th.wall, 1.15));
  } else {
    R(0, 69, 428, 1, shade(th.wall, 1.15));
    for (let r = 0; r < 3; r++) {
      const y = 69 + r * 5;
      R(0, y + 5, 428, 1, th.wallLine);
      for (let x = 4 + (r % 2) * 10; x < 428; x += 20) R(x, y + 1, 1, 4, th.wallLine);
    }
    for (let x = 14; x < 428; x += 50) {                   // pilasters
      if (x > 180 && x < 244) continue;
      R(x, 67, 5, 18, shade(th.wall, 1.12)); R(x, 67, 1, 18, th.wallTop); R(x + 4, 67, 1, 18, th.wallLine); R(x - 1, 67, 7, 2, th.wallTop); R(x - 1, 83, 7, 2, th.wallLine);
    }
    if (th.banners) for (let x = 19; x < 400; x += 50) {    // garlands swung between them
      if (x > 150 && x < 250) continue;
      for (let i = 2; i < 46; i += 2) { const dy = Math.round(Math.sin(i / 48 * Math.PI) * 4); R(x + i, 71 + dy, 2, 2, i % 4 ? '#4f7a3a' : '#6f9a4a'); if (i % 12 === 6) R(x + i, 71 + dy, 2, 1, '#c23b2e'); }
    }
  }
  R(0, 84, 428, 2, shade(th.wallLine, 0.75));
  // gate
  R(190, 67, 48, 19, shade(th.wall, 1.15)); R(193, 69, 42, 17, '#1c130f');
  for (let x = 196; x < 234; x += 6) R(x, 69, 2, 17, '#4a3323');
  R(193, 74, 42, 2, '#4a3323'); R(193, 80, 42, 2, '#4a3323');
  // banners: each side's colours, and gold ones in the grander arenas
  // (the banners hang here; they move, so show.js draws them live)
  // sand
  R(0, 86, 428, 154, th.sand);
  const sd = shade(th.sand, 0.9), sl = shade(th.sand, 1.12);
  for (let i = 0; i < 11; i++) {                            // lighter where it has been walked smooth, darker where it lies deep
    const cx = 30 + (i * 137) % 370, cy = 104 + (i * 71) % 120, rx = 22 + (i % 4) * 9, ry = 5 + (i % 3) * 3;
    ctx.fillStyle = i % 3 ? 'rgba(255,240,200,.07)' : 'rgba(90,60,20,.06)';
    for (let yy = -ry; yy <= ry; yy++) { const hw = Math.round(rx * Math.sqrt(1 - (yy * yy) / (ry * ry))); ctx.fillRect(cx - hw, cy + yy, hw * 2, 1); }
  }
  ctx.fillStyle = 'rgba(90,60,20,.09)';                    // the rake's rings, out from the middle
  for (const rr of [46, 82, 120, 160]) for (let a = 0; a < 360; a += 3) { const x = 214 + Math.cos(a * Math.PI / 180) * rr * 1.5, y = 168 + Math.sin(a * Math.PI / 180) * rr * 0.5; if (y > 96 && y < 238 && x > 2 && x < 426 && (a + rr) % 9) ctx.fillRect(Math.round(x), Math.round(y), 2, 1); }
  for (const s of B.specks) R(s.x, s.y, s.w, 1, s.c ? sd : sl);
  // the wall's shade falls across the near sand, further when the sun is low. (Painted here only for a bout to the
  // death, whose light does not change, or where there is no sky to ask. By day it is laid on every frame, as long
  // and as dark as the hour and the cloud make it: see drawBattle.)
  // (The wall's shade is laid on as the fight is drawn, by the hour and the cloud: drawBattle. Painted in here only where there is no sky to go by.)
  if (typeof yardSky !== 'function') { const bands = dusk0 ? 9 : 5; for (let i = 0; i < bands; i++) R(0, 86 + i * 4, 428, 4, `rgba(50,28,8,${(0.34 * (1 - i / bands)).toFixed(3)})`); }
  // torch brackets along the wall; the flames are drawn live
  for (const x of ARENA_TORCHES) { R(x, 70, 2, 9, '#3a2a1c'); R(x - 2, 69, 6, 2, '#5a4334'); }
  return cv;
}

// How much of the ground snow covers where a fight is fought, 0 to 1, at a place in the picture, before anyone has
// set foot on it: all but whole, with a little more of the ground showing in the middle, where it was raked or
// walked over beforehand. Both sheets of lying snow are laid by it. (It was once painted trodden thin in the middle
// from the start; now it is the men who tread it thin, where they in fact fight: see the snow in show.js.)
function snowLie(x, y) { const dx = (x - 214) / 158, dy = (y - 166) / 60, r = dx * dx + dy * dy; return r < 0.5 ? 0.9 : r < 1 ? 0.9 + (r - 0.5) / 0.5 * 0.04 : 0.94; }
// And how much snow a man has under his feet there now: none unless snow is lying (B.lying: drawBattle keeps it),
// and less wherever feet have worn it away since the fight began (B._wear, kept in show.js, a figure to every eight
// pixels by four). What his feet throw up, and what his blood falls on, are by this.
function fightSnow(B, x, y) {
  const k = B.lying || 0; if (!(k > 0.03)) return 0;
  const W = B._wear, w = W ? W[(clamp(y | 0, 0, 239) >> 2) * 54 + (clamp(x | 0, 0, 427) >> 3)] : 0;
  return clamp(snowLie(x, y) - w, 0, 1) * Math.min(1, k * 1.3);
}

// Snow lying in the arena (a sheet of its own, laid over the backdrop by how much of it there is: see drawBattle). On
// the seats and the steps of the bank, where nobody is sitting; along the rim, the awning, the roof of the box and
// the top of the wall; and over the sand, drifted against the wall, blue in the wall's shade. (It is the men who tread
// it thin, where they fight: see the snow in show.js.) It is laid under the banners, the blood and the men, which are drawn after it.
function renderArenaSnow(B) {
  const th = B.theme, cv = document.createElement('canvas'); cv.width = 428; cv.height = 240;
  const ctx = cv.getContext('2d'), stone = !th.planks, hv = (x, y) => wildHash(x, y, 1660);
  const S = (x, y, w, h, c) => { ctx.fillStyle = c || '#f7fafd'; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  // the rows of seats, and the stairs between them; then whoever sits there is taken out of it
  for (let y = 23; y <= 65; y += 9) {
    if (th.planks) S(0, y - 8, 428, 8, 'rgba(244,248,252,.45)');
    for (let x = 0; x < 428; x += 2) { if (hv(x, y) < 0.86) S(x, y, 2, 1); if (hv(x, y + 1) < 0.3) S(x, y - 1, 2, 1, '#e3eaf3'); }
  }
  for (const a of ARENA_AISLES) { ctx.clearRect(a, 15, 9, 51); for (let y = 18; y < 58; y += th.planks ? 4 : 3) if (hv(a, y) < 0.6) S(a + 1 + (hv(y, a) < 0.5 ? 0 : 3), y, 4, 1, '#eef2f7'); }
  ctx.globalCompositeOperation = 'destination-out'; for (const p of B.crowd) drawSpectator(ctx, p, 0); ctx.globalCompositeOperation = 'source-over';
  // the rim: the lintel of the arcade, or the far hills and the rail of a pit; or the awning
  if (!th.awning) {
    if (stone) S(0, 0, 428, 1);
    else { for (let x = 0; x < 428; x += 2) { const t = 4 + Math.round(Math.sin(x * 0.03) * 2 + Math.sin(x * 0.08 + 1) * 1.5); S(x, t, 2, 10 - t, 'rgba(244,248,252,.8)'); }
      for (let x = 6; x < 428; x += 22) { ctx.clearRect(x, 3, 2, 9); S(x, 2, 2, 1); } ctx.clearRect(0, 6, 428, 1); for (let x = 0; x < 428; x += 2) if (hv(x, 5) < 0.7) S(x, 5, 2, 1); }
    S(0, 9, 428, 2); for (let x = 0; x < 428; x++) if (hv(x, 11) < 0.4) S(x, 11, 1, 1, '#e3eaf3');
  } else for (let x = 0; x < 428; x++) { S(x, 0, 1, 2 + Math.floor(hv(x, 0) * 2.2)); }
  // the roof of the box
  if (th.box) { S(170, 21, 88, 2); for (let x = 170; x < 258; x++) if (hv(x, 23) < 0.5) S(x, 23, 1, 1, '#e3eaf3'); }
  else if (th.planks) S(188, 31, 52, 2);
  else { S(187, 29, 54, 2); for (let x = 187; x < 241; x++) if (hv(x, 31) < 0.5) S(x, 31, 1, 1, '#e3eaf3'); }
  // the top of the wall round the sand: on every point of a palisade, or along the coping
  if (th.planks) for (let x = 4; x < 428; x += 10) { S(x + 4, 60, 3, 1); S(x + 3, 62, 1, 1, '#eef2f7'); S(x + 7, 62, 1, 1, '#eef2f7'); S(x + 8, 65, 5, 1, '#eef2f7'); }
  else { S(0, 65, 428, 2); for (let x = 0; x < 428; x++) { const d = Math.floor(hv(x, 67) * 2.3); if (d) S(x, 67, 1, d, '#e3eaf3'); } }
  // the sand
  for (let y = 86; y < 240; y++) {
    const sh = Math.max(0, Math.min(1, (y - 86) / 20)), c = 'rgb(' + Math.round(204 + 41 * sh) + ',' + Math.round(215 + 33 * sh) + ',' + Math.round(232 + 20 * sh) + ')';      // (blue in the shade of the wall, which lies across the near sand)
    for (let x = 0; x < 428; x += 2) {
      const lie = y < 89 ? 1 : snowLie(x, y);
      if (wildHash(x >> 1, y, 1661) < lie) S(x, y, 2, 1, wildHash(x >> 2, y >> 1, 1662) > 0.9 ? '#dbe4f0' : c);
    }
  }
  return cv;
}

// And snow lying where a fight is fought out in the province. That ground is painted by one painter for every kind
// of country (renderWild), which knows nothing of snow, so the picture itself is looked at, once: the far hills go
// white; whatever stands there (a tree, the cliff, a palisade, old stones, a rock on the ground) takes snow along
// its top, wherever it has the sky, the hills or the open ground over it; and the ground is covered, blue under
// whatever throws its shade across it. (It is the men who tread it thin, where they fight: see the snow in show.js.)
function renderWildSnow(B) {
  const W = 428, H = 240, GY = 78, bg = B._bg, look = Object.assign(document.createElement('canvas'), { width: W, height: H }), lc = look.getContext('2d', { willReadFrequently: true });
  lc.drawImage(bg, 0, 0); const D = lc.getImageData(0, 0, W, H).data;
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H }), ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), O = img.data;
  // the colour of the open ground: whatever colour there is most of across the foot of the picture
  const tally = new Map(); let base = [0, 0, 0], most = 0;
  for (let y = 200; y < H; y += 2) for (let x = 0; x < W; x += 3) { const i = (y * W + x) * 4, key = (D[i] >> 2) << 12 | (D[i + 1] >> 2) << 6 | (D[i + 2] >> 2), n = (tally.get(key) || 0) + 1; tally.set(key, n); if (n > most) { most = n; base = [D[i], D[i + 1], D[i + 2]]; } }
  const HILLS = B._hills || [[143, 169, 166], [163, 186, 182], [108, 139, 104], [92, 122, 88]];      // (the hills' colours this season: renderWild keeps them)
  const far = (i, c) => Math.abs(D[i] - c[0]) + Math.abs(D[i + 1] - c[1]) + Math.abs(D[i + 2] - c[2]);
  // (The ground is painted darker toward the hills, in five bands of four rows from where it begins: see the end of
  // renderWild. So it is known there by its colour under that shade, baseAt, or the snow would stop short of the
  // hills and leave a bare strip across the picture. deepAt: how much of that shade there is, 1 to 0.)
  const deepAt = y => y >= GY && y < GY + 20 ? 1 - Math.floor((y - GY) / 4) / 5 : 0;
  const bases = []; for (let y = 0; y < H; y++) { const a = 0.3 * deepAt(y); bases.push(a ? [base[0] * (1 - a) + 20 * a, base[1] * (1 - a) + 30 * a, base[2] * (1 - a) + 10 * a] : base); }
  const baseAt = y => bases[Math.max(0, Math.min(H - 1, y))];
  // (Old paving is ground too, though it is paler than the ground: all of a slab but the light along its upper edge.)
  const slab = new Uint8Array(W * H); for (const [sx, sy] of B._slabs || []) for (let y = sy; y < sy + 16 && y < H; y++) for (let x = Math.max(0, sx); x < sx + 40 && x < W; x++) slab[y * W + x] = 1;
  const hill = i => HILLS.some(c => far(i, c) < 8), ground = (i, y) => far(i, baseAt(y)) < (slab[i >> 2] ? 125 : 62);
  // (The sky, a cloud, or the sun: wherever nothing nearer than the hills was painted. The sun is any colour from
  // white to red by the hour, and lights the sky about it, so it is not to be known by its colour.)
  let N = null; if (B._near) { lc.clearRect(0, 0, W, H); lc.drawImage(B._near, 0, 0); N = lc.getImageData(0, 0, W, H).data; }
  const sky = i => { if (N) return N[i + 3] < 128; const r = D[i], g = D[i + 1], b = D[i + 2]; return (b >= g && b > r + 6 && r + g + b > 400) || (r > 220 && g > 230 && b > 235) || (r > 240 && g > 228 && b > 190 && b < 232); };
  const open = (i, y) => y < GY + 6 ? sky(i) || hill(i) || (y >= GY && ground(i, y)) : ground(i, y);
  const put = (i, r, g, b, a) => { if (O[i + 3] >= a) return; O[i] = r; O[i + 1] = g; O[i + 2] = b; O[i + 3] = a; };
  for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, v = wildHash(x, y, 1680);
    if (y < GY + 6 && hill(i)) { put(i, 244, 248, 252, 140); continue; }
    if (y < GY ? sky(i) : false) continue;
    if (y >= GY && ground(i, y)) {
      const lie = y < GY + 3 ? 1 : snowLie(x, y);
      if (wildHash(x >> 1, y, 1681) < lie) {
        const b = baseAt(y), dark = far(i, b) > 30 && D[i] + D[i + 1] + D[i + 2] < b[0] + b[1] + b[2], k = deepAt(y);
        if (dark || wildHash(x >> 2, y >> 1, 1682) > 0.9) put(i, 214, 224, 238, 232); else put(i, Math.round(245 - 31 * k), Math.round(248 - 24 * k), Math.round(252 - 14 * k), 232);      // (and the snow keeps that shade: bluer toward the hills)
      }
      continue;
    }
    if (open(i - W * 4, y - 1)) { put(i, 252, 253, 255, 242); if (!open(i + W * 4, y + 1) && v < 0.6) put(i + W * 4, 226, 233, 243, 205); }      // the top of something
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// ---------- what an ability looks like ----------
// Short-lived pictures laid over the fight: a burst under a man as he calls on an ability, the arc of a heavy
// blow, a shockwave, the streak of a lunge, motes rising round a man who has steeled or mended himself.
// Positions are in world units; they are drawn in sprite pixels (two to a unit). `under` ones go beneath the fighters.
function vfx(B, o) { if (B.vfx.length < 60) B.vfx.push(Object.assign({ t: 0, dur: 0.4 }, o)); }
function drawVfx(ctx, B, under) {
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  for (const v of B.vfx) {
    const k = clamp(v.t / v.dur, 0, 1), a = 1 - k;
    if (!!v.under !== under) continue;
    if (v.k === 'ring') {                      // a ring spreading over the sand
      const r = (v.r0 || 3) + ((v.r || 16) - (v.r0 || 3)) * (1 - (1 - k) * (1 - k)), n = Math.max(14, Math.round(r * 1.6));
      ctx.globalAlpha = a * (v.a || 0.9);
      for (let i = 0; i < n; i++) { const an = i / n * 6.283; R(v.x * 2 + Math.cos(an) * r * 2 - 1, v.y * 2 + Math.sin(an) * r * 0.9 - 1, v.w || 3, v.w || 3, v.col); }
      if (v.fill) { ctx.globalAlpha = a * 0.24; for (let yy = -r * 0.9; yy <= r * 0.9; yy += 2) { const hw = r * 2 * Math.sqrt(Math.max(0, 1 - (yy * yy) / (r * r * 0.81))); R(v.x * 2 - hw, v.y * 2 + yy, hw * 2, 2, v.col); } }
    } else if (v.k === 'trail') {              // where he was a moment ago, and where he is
      for (let i = 0; i < 7; i++) { const q = i / 6; ctx.globalAlpha = a * q * 0.5; R((v.x + (v.x2 - v.x) * q) * 2 - 5, (v.y + (v.y2 - v.y) * q) * 2 - 34, 10, 30, v.col); R((v.x + (v.x2 - v.x) * q) * 2 - 8, (v.y + (v.y2 - v.y) * q) * 2 - 2, 16, 2, fightDust(B, v.x2 * 2, v.y2 * 2).lite); }
    } else if (v.k === 'arc') {                // the sweep of a blade: a crescent that opens and fades
      const rad = 12 + v.size * 9, th = v.size > 1.4 ? 4 : 3, from = -1.25, span = 2.5 * Math.min(1, k * 2.2 + 0.25);
      ctx.globalAlpha = a;
      for (let i = 0; i <= 12; i++) { const an = from + span * (i / 12), px = v.x * 2 + v.dir * (Math.cos(an) * rad - rad * 0.55), py = v.y * 2 - 24 + Math.sin(an) * rad * 1.15; R(px, py, th, th, i > 8 ? '#ffffff' : v.col); if (v.size > 1.2) R(px - v.dir * 2, py, th, th, v.col2 || v.col); }
    } else if (v.k === 'hit') {                // where a blow landed: a star of light, thrown on the way the blow was going
      const sz = v.size || 1, cx = v.x * 2, cy = v.y * 2 - 23, e = 1 - (1 - k) * (1 - k), len = sz * (14 + 12 * e), c2 = v.col2 || v.col;
      ctx.globalAlpha = Math.min(1, a * 2.4);
      // the rays: unbroken, thick at the root and thin at the tip, long and short by turns, leaving the middle as they go
      for (let i = 0; i < 7; i++) {
        const an = (i - 3) * 0.5 + (i % 2 ? 0.1 : -0.08), reach = len * (i % 2 ? 0.7 : 1);
        for (let q = 0.2 + e * 0.4; q <= 1; q += 0.1) { const w = q > 0.78 ? 2 : q > 0.5 ? 3 : 4; R(cx + v.dir * Math.cos(an) * reach * q - w / 2, cy + Math.sin(an) * reach * q * 0.85 - w / 2, w, w, q > 0.78 ? c2 : v.col); }
      }
      // the heart of it: a four-pointed star, white on its own colour
      if (k < 0.55) {
        const c = Math.round(sz * (k < 0.25 ? 4 : 3)), arm = c + Math.round(sz * 5);
        R(cx - c - 1, cy - c - 1, c * 2 + 2, c * 2 + 2, c2); R(cx - arm - 1, cy - 2, arm * 2 + 2, 4, c2); R(cx - 2, cy - arm - 1, 4, arm * 2 + 2, c2);
        R(cx - c, cy - c, c * 2, c * 2, '#ffffff'); R(cx - arm, cy - 1, arm * 2, 2, '#ffffff'); R(cx - 1, cy - arm, 2, arm * 2, '#ffffff');
      }
    } else if (v.k === 'jab') {                // a thrust: a line of light along the shaft, and a point at the end of it
      const len = Math.min(34, (v.len || 16) * 1.5) * Math.min(1, k * 4 + 0.3), x0 = v.x * 2 + v.dir * 9; ctx.globalAlpha = a * 0.9;
      R(v.dir > 0 ? x0 : x0 - len, v.y * 2 - 25, len, 1, '#efe8d2'); R(v.dir > 0 ? x0 + len * 0.4 : x0 - len, v.y * 2 - 24, len * 0.6, 1, '#ffffff'); R(v.dir > 0 ? x0 + len - 2 : x0 - len, v.y * 2 - 26, 3, 3, '#ffffff');
    } else if (v.k === 'puff') {               // dust thrown up and hanging: a man has gone down in it, or been driven through it
      const n = v.n || 5, D = fightDust(B, v.x * 2, v.y * 2), thick = clamp(D.a, 0.4, 1); for (let i = 0; i < n; i++) { const an = i / n * 6.283 + (v.seed || 0), d = (v.r || 9) * (0.35 + 0.65 * (1 - (1 - k) * (1 - k))), sz = Math.max(2, Math.round((5 - (i % 3)) * (1 - k * 0.5))); ctx.globalAlpha = a * 0.5 * thick; R(v.x * 2 + Math.cos(an) * d * 2 - sz / 2, v.y * 2 - 1 + Math.sin(an) * d * 0.55 - k * (5 + (i % 3) * 3) - sz / 2, sz, sz, i % 2 ? D.lite : D.mid); }
    } else if (v.k === 'motes' && v.f && !out(v.f)) {      // sparks rising round him
      for (let i = 0; i < 9; i++) { const up = (k * 46 + i * 11) % 44; ctx.globalAlpha = a * (1 - up / 50); R(v.f.x * 2 + Math.sin(i * 2.4 + k * 3) * 11, v.f.y * 2 - 4 - up, 2, 2, v.col); }
    } else if (v.k === 'flash') {              // the sand lights for an instant under a great blow
      ctx.globalAlpha = a * 0.5; for (let i = 0; i < 4; i++) R(v.x * 2 - 22 + i * 3, v.y * 2 - 3 + i, 44 - i * 6, 2, v.col);
    } else if (v.k === 'burst') {              // a telling blow: light thrown out in rays from where it landed
      const len = (v.size || 1) * (10 + k * 26); ctx.globalAlpha = Math.min(1, a * 1.5);
      for (let i = 0; i < 8; i++) { const an = i / 8 * 6.283 + 0.4; for (let q = 0.45; q <= 1; q += 0.18) R(v.x * 2 + Math.cos(an) * len * q, v.y * 2 - 22 + Math.sin(an) * len * q * 0.8, 3, 3, q > 0.8 ? '#ffffff' : v.col); }
      if (k < 0.3) R(v.x * 2 - 3, v.y * 2 - 25, 6, 6, '#ffffff');
    } else if (v.k === 'spray') {              // an opened vein: blood thrown the way the blade was going, and falling
      ctx.globalAlpha = a;
      for (let i = 0; i < 11; i++) { const an = -0.95 + i * 0.19, sp = 14 + (i * 7) % 13; R(v.x * 2 + v.dir * Math.cos(an) * sp * k * 1.7, v.y * 2 - 22 + Math.sin(an) * sp * k + k * k * 28, i % 3 ? 2 : 3, 2, i % 2 ? '#c22a1e' : '#e8584a'); }
    } else if (v.k === 'pierce') {             // through armour: a lance of light that goes in one side and out the other
      const len = 50 * Math.min(1, k * 3.2), x0 = v.dir > 0 ? v.x * 2 - 14 : v.x * 2 + 14 - len; ctx.globalAlpha = a;
      R(x0, v.y * 2 - 23, len, 2, '#ffffff'); R(x0 + (v.dir > 0 ? 0 : len * 0.3), v.y * 2 - 24, len * 0.7, 1, v.col); R(x0 + (v.dir > 0 ? 0 : len * 0.3), v.y * 2 - 21, len * 0.7, 1, v.col);
      R(v.dir > 0 ? x0 + len - 3 : x0 - 1, v.y * 2 - 25, 4, 6, '#ffffff');
    } else if (v.k === 'shards') {             // a guard broken: chips of it flying
      ctx.globalAlpha = a;
      for (let i = 0; i < 8; i++) { const an = i * 0.85 + 1, d = k * 19; R(v.x * 2 + Math.cos(an) * d * 1.3, v.y * 2 - 22 + Math.sin(an) * d + k * k * 15, i % 3 ? 3 : 2, 2, i % 2 ? '#b9c2cb' : '#8f979f'); }
    } else if (v.k === 'slashx') {             // the killing stroke: two cuts crossing, drawn in red
      ctx.globalAlpha = a; const n = Math.round(15 * Math.min(1, k * 3.2));
      for (let i = 0; i < n; i++) { const c = i > n - 4 ? '#ffffff' : '#c22a1e'; R(v.x * 2 - 15 + i * 2, v.y * 2 - 38 + i * 2, 3, 3, c); R(v.x * 2 + 13 - i * 2, v.y * 2 - 38 + i * 2, 3, 3, c); }
    } else if (v.k === 'legcut') {             // low, across the back of the knee
      ctx.globalAlpha = a; const w = 24 * Math.min(1, k * 3); R(v.x * 2 - 12, v.y * 2 - 9, w, 2, '#ffffff'); R(v.x * 2 - 12, v.y * 2 - 7, w * 0.8, 1, '#c22a1e'); R(v.x * 2 - 2, v.y * 2 - 6 + k * 8, 2, 2, '#c22a1e');
    } else if (v.k === 'mark' && v.f && !out(v.f)) {       // he is open: a mark closes on him
      const sz = 18 - 9 * Math.min(1, k * 2.5), cx = v.f.x * 2, cy = v.f.y * 2 - 22; ctx.globalAlpha = Math.min(1, a * 1.6);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { R(cx + sx * sz + (sx > 0 ? -6 : 0), cy + sy * sz + (sy > 0 ? -1 : 0), 8, 2, v.col); R(cx + sx * sz + (sx > 0 ? 0 : 0), cy + sy * sz + (sy > 0 ? -6 : 0), 2, 8, v.col); }
      R(cx - 1, cy - 1, 3, 3, '#ffffff');
    } else if (v.k === 'drip' && v.f && !out(v.f)) {       // his arm fails him: strength running out of it
      ctx.globalAlpha = a;
      for (let i = 0; i < 3; i++) { const d = (k * 34 + i * 9) % 24, px = v.f.x * 2 - 8 + i * 8, py = v.f.y * 2 - 42 + d; R(px, py, 1, 5, v.col); R(px - 1, py + 4, 3, 1, v.col); R(px, py + 5, 1, 1, v.col); }
    } else if (v.k === 'plus' && v.f && !out(v.f)) {       // mending: green crosses going up
      for (let i = 0; i < 5; i++) { const up = (k * 42 + i * 13) % 38, px = v.f.x * 2 + Math.sin(i * 2.1) * 12, py = v.f.y * 2 - 8 - up; ctx.globalAlpha = a * (1 - up / 44); R(px - 1, py - 3, 2, 6, v.col); R(px - 3, py - 1, 6, 2, v.col); }
    } else if (v.k === 'shield' && v.f && !out(v.f)) {     // he sets his guard: a shield of light before him, and a gleam down it
      const cx = v.f.x * 2 + v.f.facing * 10, cy = v.f.y * 2 - 24;
      ctx.globalAlpha = a * 0.28; R(cx - 6, cy - 9, 12, 14, v.col);
      ctx.globalAlpha = a; R(cx - 7, cy - 10, 14, 1, v.col); R(cx - 7, cy - 10, 1, 15, v.col); R(cx + 6, cy - 10, 1, 15, v.col);
      for (let q = 0; q < 7; q++) { R(cx - 7 + q, cy + 5 + q, 1, 1, v.col); R(cx + 6 - q, cy + 5 + q, 1, 1, v.col); }
      R(cx - 4, cy - 8 + Math.round(k * 14), 8, 1, '#ffffff');
    } else if (v.k === 'wind' && v.f && !out(v.f)) {       // quickness: the air streaming off him
      for (let i = 0; i < 7; i++) { const off = (k * 64 + i * 17) % 42; ctx.globalAlpha = a * 0.75 * (1 - off / 46); R(v.f.x * 2 - v.f.facing * (6 + off) - 5, v.f.y * 2 - 6 - i * 6, 11, 1, v.col); }
    } else if (v.k === 'flame' && v.f && !out(v.f)) {      // fury: fire coming up round his feet
      for (let i = 0; i < 8; i++) { const up = (k * 54 + i * 9) % 28, px = v.f.x * 2 - 14 + i * 4; ctx.globalAlpha = Math.min(1, a * 1.6) * (1 - up / 32); R(px, v.f.y * 2 - 3 - up, 4, 6, i % 2 ? '#ff6a2a' : '#f5a02a'); R(px + 1, v.f.y * 2 - 6 - up, 2, 4, '#ffe27a'); }
    } else if (v.k === 'cracks') {             // a blow that takes in everyone near: the sand splits outward from it
      const len = (v.r || 20) * 2 * Math.min(1, k * 2.6), D = fightDust(B, v.x * 2, v.y * 2), chip = D === DUST_SAND ? '#e2cf9c' : D.lite; ctx.globalAlpha = a * 0.85;
      for (let i = 0; i < 7; i++) { const an = i * 0.9 + 0.3; for (let q = 4; q < len; q += 3) R(v.x * 2 + Math.cos(an) * q + Math.sin(q * 1.3 + i) * 1.5, v.y * 2 + Math.sin(an) * q * 0.45, 2, 1, '#4a3320'); R(v.x * 2 + Math.cos(an) * len - 2, v.y * 2 + Math.sin(an) * len * 0.45 - k * 9, 4, 3, chip); }
    } else if (v.k === 'speed') {              // a rush: lines of speed along the way he came
      for (let i = 0; i < 6; i++) { const q = (k * 1.5 + i * 0.17) % 1, px = v.x + (v.x2 - v.x) * q, py = v.y + (v.y2 - v.y) * q; ctx.globalAlpha = a * 0.8; R(px * 2 - 9, py * 2 - 8 - i * 6, 18, 1, '#fff0c0'); }
    }
  }
  ctx.globalAlpha = 1;
}
// What shows on a man for as long as it lasts: the glow of a buff, stars round a stunned head, the sag of a weakened arm.
function drawAuras(ctx, B, T) {
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  for (const f of B.fighters) {
    if (out(f)) continue;
    const x = f.x * 2, y = f.y * 2, top = y - f.tall - 6;
    if (f.buff) {
      const b = f.buff, col = b.dmg > 0 && !(b.dr > 0) && !b.block ? '#ff8a5a' : b.dr > 0 || b.block ? '#8fc0ff' : '#ffe27a';
      ctx.globalAlpha = 0.75 * Math.min(1, b.t);
      for (let i = 0; i < 6; i++) { const an = T * 3.2 + i * 1.047; R(x + Math.cos(an) * 13, y - 3 + Math.sin(an) * 4 - (i % 2) * 2, 2, 2, col); }
      for (let i = 0; i < 3; i++) { const up = (T * 26 + i * 15) % 40; R(x - 9 + i * 9, y - 6 - up, 1, 3, col); }
    }
    if (f.buff) {                               // and by its kind: a brow of light over a guard, flame at the feet of a fury
      const b = f.buff, al = 0.6 * Math.min(1, b.t);
      if (b.dr > 0 || b.block) { ctx.globalAlpha = al; for (let i = 0; i <= 10; i++) R(x - 14 + i * 2.8, top + 4 - Math.sin(i / 10 * Math.PI) * 6, 3, 2, i % 5 === 2 ? '#ffffff' : '#8fc0ff'); }
      else if (b.dmg > 0) { ctx.globalAlpha = al; for (let i = 0; i < 4; i++) { const up = (T * 22 + i * 5) % 8; R(x - 10 + i * 6, y - 3 - up, 3, 4, i % 2 ? '#ff6a2a' : '#f5a02a'); R(x - 9 + i * 6, y - 5 - up, 1, 2, '#ffe27a'); } }
      else if (b.haste || b.dodge) { ctx.globalAlpha = al * 0.8; for (let i = 0; i < 3; i++) { const off = (T * 40 + i * 13) % 22; R(x - f.facing * (8 + off) - 4, y - 10 - i * 9, 8, 1, '#fff6c0'); } }
    }
    if (f.bleed > 0) { ctx.globalAlpha = 0.95; const d = (T * 30 + f.x * 3) % 20; R(x - 3, y - 20 + d, 2, 3, '#c22a1e'); R(x + 4, y - 26 + ((d + 9) % 20), 1, 2, '#e8584a'); if (d > 17) R(x - 4, y - 1, 4, 1, '#8e1b14'); }      // bleeding: it runs off him and spots the sand
    if (f.open > 0) {                           // open to every blow: the mark stays on him
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(T * 9); const sz = 11, cy = y - 22;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { R(x + sx * sz + (sx > 0 ? -4 : 0), cy + sy * sz + (sy > 0 ? -1 : 0), 6, 2, '#ff6a3a'); R(x + sx * sz, cy + sy * sz + (sy > 0 ? -4 : 0), 2, 6, '#ff6a3a'); }
    }
    if (f.stun > 0.35) { ctx.globalAlpha = 1; for (let i = 0; i < 3; i++) { const an = T * 7 + i * 2.094; R(x + Math.cos(an) * 8, top + Math.sin(an) * 2.5, 2, 2, i ? '#ffe27a' : '#ffffff'); } }
    if (f.weakT > 0) { ctx.globalAlpha = 0.8; for (let i = 0; i < 2; i++) { const d = (T * 14 + i * 7) % 12; R(x - 12 + i * 22, y - 30 + d, 3, 1, '#a39a88'); R(x - 11 + i * 22, y - 29 + d, 1, 1, '#a39a88'); } }
    if (f.charge >= 100) { ctx.globalAlpha = 0.5 + 0.4 * Math.sin(T * 10); R(x - 10, y + 2, 20, 1, '#ffd24a'); R(x - 7, y + 4, 14, 1, '#ffd24a'); }
  }
  ctx.globalAlpha = 1;
}

function drawBattle(ctx, B) {
  const T = B.clock;
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1a1210'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const K = ctx.canvas.width / 1280;          // how many canvas pixels to one of the arena's own (see fitScenes in main.js)
  const calm = typeof ui !== 'undefined' && ui.still;          // still pictures asked for: the sand does not shake
  const shx = B.shake > 0.2 && !calm ? Math.round(rand(-1, 1) * B.shake) * SCALE : 0;
  const shy = B.shake > 0.2 && !calm ? Math.round(rand(-1, 1) * B.shake * 0.6) * SCALE : 0;

  // The camera. While they fight it follows them: it frames the men still standing, coming closer when they are
  // bunched and drawing back when they spread, in a few fixed steps so that the picture is not forever creeping. It
  // closes on the man the fight has stopped for, hard on the blow that ends it, gives a little at a heavy blow, and
  // stands back for the verdict and the reckoning. B.fixedCam holds it still except for those last two.
  const cam = B.cam || (B.cam = { z: 1, x: 214, y: 120, lv: 1, t: performance.now() });
  const now = performance.now(), cdt = Math.min(0.1, (now - cam.t) / 1000);
  cam.t = now;
  const picking = B.pick && !out(B.pick) ? B.pick : null, finish = B.over && B.finish && B.outro < 0.55;
  let want = finish ? 1.5 : picking ? 1.18 : 1, slow = false;
  const focus = finish ? B.finish : picking, kz = B.kill;
  if (kz) { want = 1.7; cam.tx = (kz.by ? (kz.f.x + kz.by.x) / 2 : kz.f.x) * 2; cam.ty = (kz.by ? (kz.f.y + kz.by.y) / 2 : kz.f.y) * 2 - 16; cam.lv = 1; }      // the slain and the slayer, close, the moment before
  else if (focus) { cam.tx = focus.x * 2; cam.ty = focus.y * 2 - 16; cam.lv = 1; }
  else if (!B.fixedCam && B.intro <= 0 && !B.over) {
    const live = B.fighters.filter(f => !out(f));
    if (live.length) {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const f of live) { x0 = Math.min(x0, f.x * 2); x1 = Math.max(x1, f.x * 2); y0 = Math.min(y0, f.y * 2); y1 = Math.max(y1, f.y * 2); }
      const fit = Math.min(428 / (x1 - x0 + 170), 240 / (y1 - y0 + 124));
      let best = 1; for (const l of [1, 1.12, 1.25]) if (fit >= l * (l > cam.lv ? 1.08 : 1)) best = l;      // it takes a little more room to go closer than to stay close
      cam.lv = best; want = best; slow = true;
      cam.tx = (x0 + x1) / 2; cam.ty = (y0 + y1) / 2 - 24;
    }
  } else cam.lv = 1;
  if (cam.z === 1 && cam.tx != null) { cam.x = cam.tx; cam.y = cam.ty; }
  const ck = 1 - Math.pow(kz ? 0.0006 : slow ? 0.1 : 0.004, cdt);
  cam.z += (want - cam.z) * ck; if (Math.abs(cam.z - want) < 0.004) cam.z = want;
  if (cam.tx != null) { cam.x += (cam.tx - cam.x) * ck; cam.y += (cam.ty - cam.y) * ck; }
  const cz = cam.z + (B.fixedCam || finish ? 0 : Math.min(0.05, B.flashT * 0.45)), CW = 1280, CH = 720;      // and it starts forward at a heavy blow
  // While the fight waits on a choice, the choices lie across the foot of the picture. The view is lifted by as much of
  // the picture as they cover, so that the man it has stopped for stands clear above them, even one fighting at the near
  // edge of the sand; and it comes down again as they are put away.
  let under = 0;
  if (picking && typeof document !== 'undefined') { const pk = document.getElementById('arenaPick'), cr = ctx.canvas.getBoundingClientRect(); if (pk && !pk.hidden && cr.height) under = clamp((cr.bottom - pk.getBoundingClientRect().top) / cr.height, 0, 0.6) * CH; }
  B.under = (B.under || 0) + (under - (B.under || 0)) * (1 - Math.pow(0.002, cdt)); if (B.under < 0.5 && !under) B.under = 0;
  const uu = B.under;
  const cox = cz === 1 ? 0 : clamp(CW / 2 - cam.x * FINE * cz, CW - 428 * FINE * cz, 0), coy = cz === 1 && !uu ? 0 : clamp((CH - uu) / 2 - cam.y * FINE * cz, CH - 240 * FINE * cz - uu, 0);
  B.view = { z: cz, ox: cox, oy: coy };       // for whatever needs to find a man on the screen, or the mouse on the sand
  const view = unit => ctx.setTransform(unit * cz * K, 0, 0, unit * cz * K, (cox + shx) * K, (coy + shy) * K);

  // ---- sprite-pixel layer: backdrop, crowd, blood, fighters ----
  view(FINE);
  if (!B.dressed && typeof showDress === 'function') showDress(B);      // the crowd, for the weather of the day: before it is painted into its seats (show.js)
  if (!B._bg) B._bg = renderBackdrop(B);
  ctx.drawImage(B._bg, 0, 0);
  const dusk = B.light === 'dusk';
  // The arena keeps the hour, by the same sky as the yard (yardSky): what there is of the sky over the smaller
  // arenas, the shade of the wall on the sand, the men's shadows, and after dark the torches. (hr: that sky, how much
  // cloud is over it, and how low the sun is, 0 at noon to 1 at the rim. Not for a bout to the death, which has a
  // light of its own, nor out in the province, which has its own sky.)
  const hr = !dusk && !B.wild && typeof yardSky === 'function' && typeof sceneClock === 'function' ? yardSky(sceneClock()) : null;
  const hrOv = hr && typeof yardWeather === 'function' ? Math.min(1, yardWeather(sceneClock()).over || 0) : 0, hrLow = hr && hr.sun ? clamp((hr.sun[1] - 12) / 58, 0, 1) : 0;
  const lit = dusk ? 1 : hr ? clamp((hr.night - 0.45) / 0.4, 0, 1) : 0;      // the torches: lit for a bout to the death, and for any that is fought after dark; they come up as the light goes
  if (hr && B._rim) {      // the sky over the rim: blue, or red at either end of the day, or grey, or dark with a few stars
    const grey = mixHex('#8d98a3', '#1a2030', hr.night);
    for (let y = 0; y < 10; y += 2) { ctx.fillStyle = mixHex(mixHex(hr.bands[0], hr.bands[1], y / 8), grey, hrOv * 0.8); ctx.fillRect(0, y, 428, 2); }
    const st = clamp((hr.night - 0.5) * 2, 0, 1) * (1 - hrOv);
    if (st > 0.05) for (let q = 0; q < 16; q++) { ctx.fillStyle = `rgba(240,240,255,${(st * (0.45 + 0.45 * wildHash(q, 3, 1671)) * (Math.sin(T * (1.1 + q % 3) + q * 2.4) > -0.8 ? 1 : 0.4)).toFixed(3)})`; ctx.fillRect(Math.floor(wildHash(q, 1, 1671) * 428), Math.floor(wildHash(q, 2, 1671) * 8), 1, 1); }
    ctx.drawImage(B._rim, 0, 0);
  }
  // A bout to the death keeps its own light, but not its own weather: it rains or snows on it as on anything else
  // that day (wxF: the weather, for every kind of fight), and under cloud the red goes out of its evening sky.
  const wxF = typeof yardWeather === 'function' && typeof sceneClock === 'function' ? yardWeather(sceneClock()) : null, duskOv = dusk && wxF ? Math.min(1, wxF.over || 0) : 0;
  if (duskOv > 0.02 && B._rim) {
    ctx.globalAlpha = duskOv * 0.9; for (let y = 0; y < 10; y += 2) { ctx.fillStyle = shade('#8f8790', 0.9 + y / 60); ctx.fillRect(0, y, 428, 2); } ctx.globalAlpha = 1;
    ctx.drawImage(B._rim, 0, 0);
  }
  if (B.wild) {
    const wx = typeof yardWeather === 'function' && typeof sceneClock === 'function' ? yardWeather(sceneClock()) : null, ov = wx ? Math.min(1, wx.over || 0) : 0;
    // Out in the province the clouds go over: slowly, faster in a wind, each at a pace of its own, off one side of
    // the picture and in again at the other; behind the hills and whatever stands in front of them (B._land).
    if (B._clouds && B._land && ov < 0.98) {
      const tc = typeof sceneClock === 'function' ? sceneClock() : T, [body, top, under] = B._cloudCol;
      B._drift = (B._drift || 0) + clamp(tc - (B._driftT === undefined ? tc : B._driftT), 0, 0.25) * (1.6 + 7 * (wx ? wx.gust || 0 : 0)); B._driftT = tc;
      const puff = (cx, cy, rx, ry, col) => { ctx.fillStyle = col; for (let yy = -ry; yy <= ry; yy++) { const hw = Math.round(rx * Math.sqrt(1 - (yy * yy) / (ry * ry))); ctx.fillRect(cx - hw, cy + yy, hw * 2, 1); } };
      for (const c of B._clouds) { const cx = Math.round((c.x + B._drift * c.sp) % 548) - 60; puff(cx, c.y, c.w, 3, body); puff(cx + 8, c.y - 3, 11, 3, top); puff(cx - 6, c.y + 2, 14, 2, under); }
      ctx.drawImage(B._land, 0, 0);
    }
    if (B._dull && ov > 0.02) { ctx.globalAlpha = ov; ctx.drawImage(B._dull, 0, 0); ctx.globalAlpha = 1; }      // and the sky as it is under cloud (see the end of renderWild)
  }
  if (uu > 0 && !B.wild) { ctx.fillStyle = shade(B.theme.sand, 0.95); ctx.fillRect(0, 240, 428, Math.ceil(uu / (FINE * cz)) + 2); }      // more sand below the sand, for the little of it that shows either side of the choices
  // snow lying, where snow would lie (renderArenaSnow, or out in the province renderWildSnow): under the crowd's banners, the blood and the men
  const lying = typeof yardWeather === 'function' && typeof sceneClock === 'function' ? Math.min(1, (yardWeather(sceneClock()).white || 0) * 1.5) : 0;
  // (The sheet is kept twice: as it fell, B._snow0, and as the men have left it, B._snow, which is the one that is
  // shown. Their feet mark it and wear it through, and falling snow fills it again: see the snow in show.js.)
  B.lying = lying;
  B.wet = wxF ? Math.min(1, Math.max(wxF.wet || 0, wxF.rain || 0)) : 0;      // (how wet the ground is, for what feet raise from it: fightDust)
  if (lying > 0.03) { if (!B._snow) { B._snow0 = B.wild ? renderWildSnow(B) : renderArenaSnow(B); B._snow = Object.assign(document.createElement('canvas'), { width: 428, height: 240 }); B._snow.getContext('2d').drawImage(B._snow0, 0, 0); B._wear = new Float32Array(54 * 60); } ctx.globalAlpha = lying; ctx.drawImage(B._snow, 0, 0); if (uu > 0 && !B.wild) { ctx.fillStyle = '#eef3f9'; ctx.fillRect(0, 240, 428, Math.ceil(uu / (FINE * cz)) + 2); } ctx.globalAlpha = 1; }
  // Wet ground, where it is raining or has rained (showWet, in show.js): pools that hold the sky, which is the
  // colour the hour and the cloud make it over this fight, and after dark the torches lying long on the wet.
  // And what the air over it is doing, for whatever the wind moves and whatever goes over the ground (the wind and
  // the air, in show.js): the day's wind and cloud, how dark it is, whether there is a sun to throw a cloud's
  // shadow, and how early in the day it is, from 1 at sunrise to nothing by the middle of the morning.
  const pv = B.wild && typeof provSky === 'function' && typeof G !== 'undefined' && G && G.field ? provSky() : null;
  { const s = dusk ? null : hr || pv; B.air = { gust: wxF ? wxF.gust || 0 : 0, over: wxF ? Math.min(1, wxF.over || 0) : 0, rain: wxF ? wxF.rain || 0 : 0, night: s ? s.night : 0, sun: dusk || !!(s && s.sun), early: s && s.sun ? clamp((200 - s.sun[0]) / 160, 0, 1) : 0 }; }
  if (wxF && (wxF.wet > 0 || wxF.rain > 0) && typeof showWet === 'function' && typeof mixHex === 'function') {
    const over = Math.min(1, wxF.over || 0);
    const up = dusk ? ['#e59a66', 0] : hr ? [hr.bands[1], hr.night] : pv ? [pv.bands[1], pv.night] : ['#a9cfdc', 0];
    showWet(ctx, B, T, wxF, { sky: mixHex(up[0], mixHex('#8d98a3', '#1a2030', up[1]), over * 0.8), night: up[1], lit, lying });
  }
  showBack(ctx, B, T);        // the crowd, the editor, banners, blood and litter on the sand, heat haze (show.js)
  // The wall's shade across the near sand, by day: further out the lower the sun is, faint under cloud, and after
  // dark only the little there is from the moon. It lies on whatever is on the sand there, and on snow it is blue.
  if (hr) {
    const d = 20 + hrLow * 12, a = (hr.sun ? 0.34 : 0.13) * (1 - hrOv * 0.75) * (1 - lying * 0.45), col = lying > 0.5 ? '36,52,92' : '50,28,8';
    for (let i = 0; i < 5; i++) { const y0 = Math.round(i * d / 5), y1 = Math.round((i + 1) * d / 5); ctx.fillStyle = `rgba(${col},${(a * (1 - i / 5)).toFixed(3)})`; ctx.fillRect(0, 86 + y0, 428, y1 - y0); }
  }
  // A bout to the death has the long shade of its low sun, well out over the sand: and that too is faint under
  // cloud, lies on whatever is on the sand, and is blue on snow.
  else if (dusk && typeof yardSky === 'function') {
    const a = 0.34 * (1 - duskOv * 0.75) * (1 - lying * 0.45), col = lying > 0.5 ? '36,52,92' : '50,28,8';
    for (let i = 0; i < 9; i++) { ctx.fillStyle = `rgba(${col},${(a * (1 - i / 9)).toFixed(3)})`; ctx.fillRect(0, 86 + i * 4, 428, 4); }
  }

  let shadow = dusk ? { len: Math.round(16 * (1 - duskOv * 0.85)), a: +(0.3 * (1 - duskOv * 0.5)).toFixed(3) } : { len: 5, a: 0.22 };      // (the long shadows of a low sun, unless cloud has it)
  // In the arena, by day, a shadow keeps the hour as the shadows in the yard do, by the same sky (yardSky): thrown
  // to the right through the morning and to the left once the sun has crossed, longer as it gets low; under cloud
  // only what is dark under a man's feet; and by night, when a bout is fought so late, the little the moon throws.
  // (A bout to the death has its own light, of the sun going down and the torches: the long shadow above.)
  if (!dusk && !B.wild && typeof yardSky === 'function' && typeof sceneClock === 'function') {
    const sky = yardSky(sceneClock()), ov = typeof yardWeather === 'function' ? Math.min(1, yardWeather(sceneClock()).over || 0) : 0, low = sky.sun ? clamp((sky.shadow.len - 2) / 12, 0, 1) : 0;
    shadow = { len: sky.sun ? Math.round((2 + low * 12) * (1 - ov * 0.85)) : 1, a: +((sky.sun ? 0.22 + low * 0.06 : 0.16) * (1 - ov * 0.5)).toFixed(3), dir: (sky.sun || sky.moon || [0])[0] > 295 ? -1 : 1, cast: true };
  }
  // Out in the province a shadow is thrown from the sun, wherever in the sky the hour has put it (B._sun: see
  // renderWild): away to the right while it is on the left and to the left once it has crossed, long when it is low
  // and short at noon; and under cloud there is hardly one to throw, only what is dark under a man's feet.
  if (B.wild && B._sun !== undefined) {
    const ov = typeof yardWeather === 'function' && typeof sceneClock === 'function' ? Math.min(1, yardWeather(sceneClock()).over || 0) : 0, low = B._sun ? B._sun[3] : 0;
    shadow = { len: B._sun ? Math.round((2 + low * 18) * (1 - ov * 0.85)) : 0, a: +((B._sun ? 0.22 + low * 0.08 : 0.16) * (1 - ov * 0.5)).toFixed(3), dir: B._sun && B._sun[0] > 214 ? -1 : 1, cast: true };
  }
  // The light on the men (sprLight). From the sun, on the side their shadows are thrown away from: low and strong
  // toward either end of the day and in the red of a bout to the death, more from overhead at noon, and hardly any
  // under cloud. After dark a little from the moon, cold; and from each torch on the wall, warm, on whoever is near
  // enough, so that a man between two has an edge of fire down either side. A camp out in the province has its fire.
  const rgbOf = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)).join(','), FIRE = '255,168,84';
  let sunL = null;
  if (typeof mixHex === 'function') {
    const from = -(shadow.dir || 1);
    if (dusk) sunL = { dir: -1, a: 0.65 * (1 - duskOv * 0.85), col: '255,196,120', top: 0.08 };
    else if (hr) sunL = hr.sun ? { dir: from, a: (0.22 + 0.4 * hrLow) * (1 - hrOv * 0.85), col: rgbOf(mixHex(hr.sunCol, '#ffffff', 0.45)), top: 0.24 * (1 - hrLow) * (1 - hrOv * 0.7) } : { dir: from, a: 0.24 * (1 - hrOv), col: '186,204,255', top: 0.08 * (1 - hrOv) };
    else if (B.wild && B._sun) { const ov = wxF ? Math.min(1, wxF.over || 0) : 0, low = B._sun[3]; sunL = { dir: from, a: (0.22 + 0.4 * low) * (1 - ov * 0.85), col: rgbOf(mixHex(B._sun[2], '#ffffff', 0.3)), top: 0.24 * (1 - low) * (1 - ov * 0.7) }; }
  }
  const lightOn = f => {
    let la = 0, lc = FIRE, ra = 0, rc = FIRE, ta = 0, tc = FIRE;
    if (sunL) { if (sunL.dir < 0) { la = sunL.a; lc = sunL.col; } else { ra = sunL.a; rc = sunL.col; } ta = sunL.top; tc = sunL.col; }
    const fire = (fx, fy, reach, k) => {      // a flame at fx, fy: by how near he is to it, on the side of him it is on
      const dx = fx - f.x * 2, a = k * clamp(1 - Math.hypot(dx, (fy - f.y * 2) * 1.3) / reach, 0, 1); if (a < 0.04) return;
      if (dx < 0) { if (a > la) { la = a; lc = FIRE; } } else if (a > ra) { ra = a; rc = FIRE; }
      if (a * 0.5 > ta) { ta = a * 0.5; tc = FIRE; }
    };
    if (lit > 0 && !B.wild) for (const tx of ARENA_TORCHES) fire(tx + 1, 70, 190, lit);
    if (B.wild === 'camp') fire(214, 90, 120, 0.5);
    return la < 0.04 && ra < 0.04 && ta < 0.04 ? null : { la, lc, ra, rc, ta, tc };
  };
  const flat = f => f.down && f.fallT <= 0;
  drawVfx(ctx, B, true);
  const sorted = B.fighters.slice().sort((a, b) => (flat(a) === flat(b) ? a.y - b.y : flat(a) ? -1 : 1));
  const spr = f => ({
      x: f.x * 2, y: f.y * 2, facing: f.facing, g: f.g, team: f.team, col: B.col[f.team], colD: B.colD[f.team],
      moving: f.moving, walk: f.walk, clock: T + f.walk, atkAnim: f.atkAnim,
      windup: f.state === 'windup', windP: f.t0 ? clamp(1 - f.t / f.t0, 0, 1) : 1,
      recoil: clamp(Math.abs(f.kx) / 40, 0, 1), shadow, light: lightOn(f),
      bash: f.state === 'windup' && f.move === 'bash', guard: f.guard,
      flash: f.flash, down: f.down, falling: f.fallT > 0, yielded: f.yielded, snare: f.snare, slash: f.slash,
      cheer: (B.over && !out(f) && f.team === B.winner && B.slowmo <= 0) || f.flourish > 0 ? T + f.walk : 0,
      noHelm: f.noHelm, hurt: f.hp < f.maxHp * 0.3 ? 3 : f.hp < f.maxHp * 0.55 ? 2 : f.hp < f.maxHp * 0.8 ? 1 : 0,
      hamstrung: f.hamstrung, armWound: f.armWound, shieldDmg: f.shieldHits >= 9 ? 2 : f.shieldHits >= 4 ? 1 : 0,
  });
  // In winter whoever is on his feet breathes a cloud, as the men in the yard do (sceneBreath, in yard.js), by the
  // fight's own clock: harder when he is at work, and hardest when he is badly hurt. A beast breathes from its muzzle.
  const cold = typeof sceneSeason === 'function' && typeof sceneBreath === 'function' && sceneSeason() === 3;
  for (const f of sorted) {
    const o = spr(f); drawFighter(ctx, f, o);
    if (!cold || f.down || f.fallT > 0) continue;
    const P = poseOf(f), x = o.x + (P ? P.ox : 0), y = o.y + (P ? P.oy - P.lift : 0), d = o.facing * (P ? P.flip : 1), a = f.g.beast ? BEAST_ART[f.g.cls] : null;
    const rate = o.hurt >= 2 ? 0.85 : f.moving || f.atkAnim > 0 || o.windup ? 0.6 : 0.38;
    if (a) sceneBreath(ctx, x + d * ((a.bw >> 1) + a.hw + 1), y - a.lh - a.bh + a.hy + a.hh - 2, d, f.g.id * 37 + 11, rate, T);
    else sceneBreath(ctx, x + d * 5, y - (f.yielded ? 22 : 30), d, f.g.id * 37 + 11, rate, T);      // (his mouth: thirty pixels up, or on his knees twenty-two)
  }
  drawVfx(ctx, B, false);
  drawAuras(ctx, B, T);
  if (picking) {                              // the fight has stopped for him: the sand dims, and he and his man stand out
    ctx.fillStyle = 'rgba(8,5,2,.45)'; ctx.fillRect(0, 0, 428, 240 + (uu > 0 ? Math.ceil(uu / (FINE * cz)) + 2 : 0));
    const tg = picking.target && !out(picking.target) ? picking.target : null;
    if (tg) { drawSprite(ctx, { ...spr(tg), flash: 0 }); const tx = tg.x * 2, ty = tg.y * 2 - tg.tall - 12 + Math.round(Math.sin(T * 7) * 2); ctx.fillStyle = '#ff5a4a'; for (let i = 0; i < 4; i++) ctx.fillRect(tx - 3 + i, ty + i, 7 - i * 2, 1); }
    ctx.strokeStyle = `rgba(255,210,74,${(0.6 + 0.3 * Math.sin(T * 6)).toFixed(2)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(picking.x * 2, picking.y * 2 + 1, 15, 5, 0, 0, 7); ctx.stroke();
    drawSprite(ctx, { ...spr(picking), flash: 0 });
  }
  for (const p of B.parts) { const z = p.s || 2; ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x * 2), Math.round((p.y - p.h) * 2), z, z); if (z === 3) { ctx.fillStyle = '#e8584a'; ctx.fillRect(Math.round(p.x * 2), Math.round((p.y - p.h) * 2), 1, 1); } }
  showFront(ctx, B, T);       // dust, things thrown from the stands

  // ---- light: the colour of the hour, torches, darkened edges, the flash of a telling blow ----
  // by day the arena takes the weather and a little of the hour from the same sky as the yard; a dusk bout has its own light
  if (!dusk && typeof yardSky === 'function') {
    const sky = B.wild && typeof provSky === 'function' && G && G.field ? provSky() : yardSky(sceneClock()), tint = sceneTint(sky, B.wild ? 0.6 : 0.3 + 0.35 * sky.night);      // a fight in the province is fought at the province's hour; and in the arena the dark comes down further than the colours of the day do, so that a bout fought after dark is fought by torchlight
    if (tint !== '#ffffff') { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = tint; ctx.fillRect(0, 0, 428, 240); ctx.globalCompositeOperation = 'source-over'; }
  }
  if (dusk) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = duskOv > 0.02 && typeof mixHex === 'function' ? mixHex('#f4b68c', '#b4acb4', duskOv * 0.8) : '#f4b68c'; ctx.fillRect(0, 0, 428, 240); ctx.fillStyle = 'rgba(70,60,110,.35)'; ctx.fillRect(0, 0, 428, 66); ctx.globalCompositeOperation = 'source-over'; }      // (the red of the low sun, greyer the more cloud there is over it)
  // The weather, on whatever kind of fight it is: the grey of cloud, the dark of wet ground, rain, the white of a
  // snowy day and snow coming down; and in an autumn storm the sky lights, as it does over the yard and the town
  // (sceneStorm, by the page's clock, so that a fight stopped for a choice is not left standing in the flash).
  if (wxF && typeof sceneRain === 'function') {
    const wx = wxF;
    if (wx.over > 0) { ctx.fillStyle = `rgba(40,45,60,${(0.1 * wx.over).toFixed(3)})`; ctx.fillRect(0, 0, 428, 240); }
    if (wx.wet > 0) { ctx.fillStyle = `rgba(70,45,20,${(0.14 * wx.wet).toFixed(3)})`; ctx.fillRect(0, 86, 428, 154); }
    sceneRain(ctx, 428, 240, T, wx.rain, 90); if (typeof sceneSnow === 'function') { sceneWhite(ctx, 428, 86, 154, wx.white * 0.16); sceneSnow(ctx, 428, 240, T, wx.snow, 110); }
    if (typeof sceneStorm === 'function') sceneStorm(ctx, 428, 240, sceneClock(), wx);
  }
  if (typeof showWetFire === 'function') showWetFire(ctx, B, T);      // the torches, or a camp's fire, lying on wet ground (show.js)
  for (const x of B.wild ? [] : ARENA_TORCHES) {      // the torches (lit: how far they are alight)
    const fl = Math.sin(T * 13 + x) > 0 ? 1 : 0;
    if (lit > 0) {                    // lit: a flame, a halo, and a pool of light on the sand below
      ctx.globalCompositeOperation = 'lighter';
      const k = (0.85 + Math.sin(T * 9 + x) * 0.15) * lit;
      for (let i = 0; i < 7; i++) { const r = 34 - i * 4; ctx.fillStyle = `rgba(255,150,60,${(0.035 * k).toFixed(3)})`; ctx.fillRect(x + 1 - r, 66 - r * 0.7, r * 2, r * 1.4); }
      for (let i = 0; i < 7; i++) { const w = 62 - i * 8, h = 26 - i * 3; ctx.fillStyle = `rgba(255,170,80,${(0.028 * k).toFixed(3)})`; ctx.fillRect(x + 1 - w / 2, 87 + i, w, h); }
      ctx.globalCompositeOperation = 'source-over';
      const ln = typeof showWind === 'function' && showWind(B, x, 66, T) > 0.5 ? 1 : 0;      // (a gust has the top of the flame over)
      ctx.fillStyle = '#e2702a'; ctx.fillRect(x - 1 + ln, 63 - fl, 4, 3); ctx.fillRect(x - 1, 66 - fl, 4, 3 + fl); ctx.fillStyle = '#f5c04a'; ctx.fillRect(x + ln, 64 - fl, 2, 2); ctx.fillRect(x, 66 - fl, 2, 2); ctx.fillStyle = '#fff0b0'; ctx.fillRect(x, 66, 1, 2);
    } else { ctx.fillStyle = '#2a1c14'; ctx.fillRect(x - 1, 66, 4, 3); }
  }
  // And up in the stands, after dark, the lamps that some of them have brought (B.show.lamps): a point of flame
  // held up beside a face, and the little it lights; it goes up with him when he is on his feet.
  if (lit > 0 && !B.wild && B.show && B.show.lamps) {
    for (const p of B.show.lamps) {
      const lx = p.x + 5, ly = p.y - 9 - (p.stand > 0 ? 3 : 0), k = (0.8 + Math.sin(T * 8 + p.ph * 3) * 0.2) * lit * (dusk ? 0.7 : 1);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) { const r = 7 - i * 2; ctx.fillStyle = `rgba(255,160,70,${(0.1 * k).toFixed(3)})`; ctx.fillRect(lx - r, ly - r + 1, r * 2 + 1, r * 2 - 1); }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(245,192,74,${Math.min(1, k * 1.2).toFixed(3)})`; ctx.fillRect(lx, ly - (Math.sin(T * 11 + p.ph) > 0 ? 1 : 0), 1, 2); ctx.fillStyle = `rgba(255,240,176,${Math.min(1, k * 1.2).toFixed(3)})`; ctx.fillRect(lx, ly, 1, 1);
    }
  }
  for (let i = 0; i < 4; i++) {       // the edges fall away into shade
    ctx.fillStyle = `rgba(20,10,4,${(0.05 * (dusk ? 1.6 : 1)).toFixed(3)})`;
    ctx.fillRect(0, 86, 14 - i * 3, 154); ctx.fillRect(428 - 14 + i * 3, 86, 14 - i * 3, 154); ctx.fillRect(0, 240 - 10 + i * 2, 428, 10 - i * 2);
  }
  if (typeof sceneVignette === 'function') sceneVignette(ctx, 428, 240, 0.22);
  if (B.flashT > 0) { ctx.fillStyle = `rgba(255,250,235,${Math.min(0.2, B.flashT * 1.8).toFixed(3)})`; ctx.fillRect(0, 0, 428, 240); }

  // ---- world-unit layer: nets, bars, floating text ----
  view(WORLD);
  for (const p of B.projs) {
    const px = Math.round(p.x), py = Math.round(p.y - 12 - Math.sin(p.k * Math.PI) * 10);
    ctx.fillStyle = 'rgba(232,220,180,.9)';
    for (let i = 0; i <= 6; i += 2) { ctx.fillRect(px - 3 + i, py - 3, 1, 7); ctx.fillRect(px - 3, py - 3 + i, 7, 1); }
  }

  // bars, wound pips and names over each fighter (interface units; world positions are scaled by Z)
  view(SCALE);
  ctx.textAlign = 'center';
  ctx.font = 'bold 5px Consolas, monospace';
  hudLag(B);
  for (const f of B.fighters) {
    if (out(f) || B.intro > 0) continue;
    const fx = f.x * Z, x = Math.round(fx) - 7, y = Math.round(f.y * Z) - Math.round(f.tall * FINE / SCALE) - 4, ny = y - 3 - f.team * 6;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - 0.5, y - 0.25, 16, 5);
    ctx.fillStyle = HUD_EDGE; ctx.fillRect(x - 1, y - 1, 16, 5);
    ctx.fillStyle = f.charge >= 100 ? '#ffd24a' : '#5c4020'; ctx.fillRect(x - 0.75, y - 0.75, 15.5, 4.5);      // a bronze rim, gold when he is charged
    ctx.fillStyle = '#0a0604'; ctx.fillRect(x - 0.25, y - 0.25, 14.5, 3.5);
    ctx.fillStyle = '#3a1512'; ctx.fillRect(x, y, 14, 2);
    if (f.hudHp > f.hp) { ctx.fillStyle = '#fff0c8'; ctx.fillRect(x, y, Math.ceil(14 * clamp(f.hudHp / f.maxHp, 0, 1)), 2); }
    { const hw = Math.ceil(14 * clamp(f.hp / f.maxHp, 0, 1)); ctx.fillStyle = B.col[f.team]; ctx.fillRect(x, y, hw, 2); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(x, y, hw, 0.5); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x, y + 1.5, hw, 0.5); }
    ctx.fillStyle = '#2a2418'; ctx.fillRect(x, y + 2.25, 14, 0.75);
    ctx.fillStyle = f.charge >= 100 ? (Math.sin(T * 12) > 0 ? '#ffffff' : '#fff0b0') : '#e0aa3e'; ctx.fillRect(x, y + 2.25, Math.ceil(14 * f.charge / 100), 0.75);
    hudMarks(f).slice(0, 5).forEach((k, i) => drawMark(ctx, k, x + 16.5 + i * 4, y - 0.5, 0.5));
    // no name over his head: the corner panels carry the names, with a face to each, and over the sand they only lay across one another
  }
  for (const v of B.vfx) {
    if (v.k !== 'banner' || !v.f) continue;
    const k = v.t / v.dur, bx = v.f.x * Z, by = v.f.y * Z - Math.round(v.f.tall * FINE / SCALE) - 13 - k * 4;
    ctx.font = 'bold 5px Cinzel, Georgia, serif';
    const w = Math.ceil(ctx.measureText(v.text).width) + 8;
    ctx.globalAlpha = Math.min(1, (1 - k) * 4) * Math.min(1, k * 12 + 0.3);
    ctx.fillStyle = '#1a110c'; ctx.fillRect(bx - w / 2 - 1, by - 6, w + 2, 9);
    ctx.fillStyle = B.col[v.f.team]; ctx.fillRect(bx - w / 2, by - 5, w, 7);
    ctx.fillStyle = '#ffd24a'; ctx.fillRect(bx - w / 2, by - 5, w, 1); ctx.fillRect(bx - w / 2, by + 1, w, 1);
    ctx.fillStyle = '#fff6d8'; ctx.fillText(v.text, bx, by);
  }
  ctx.globalAlpha = 1;
  for (const t of B.texts) {
    const age = (t.life0 || 1.3) - t.life, kind = t.kind || (t.big ? 'big' : 'word');
    const pop = kind === 'quiet' ? 1 : 1 + 0.55 * Math.max(0, 1 - age / 0.11);          // it lands large and settles to its size
    const size = (kind === 'big' ? 8 : kind === 'word' ? 5 : kind === 'quiet' ? 4.25 : t.crit ? 9.5 : t.blk ? 5 : 7) * pop;
    ctx.font = (kind === 'quiet' ? 'italic ' : '') + 'bold ' + size.toFixed(2) + 'px ' + (kind === 'fig' && !t.crit && !t.blk ? 'Consolas, monospace' : 'Cinzel, Georgia, serif');
    ctx.globalAlpha = Math.min(1, t.life * (kind === 'quiet' ? 3 : 4)) * (kind === 'quiet' ? 0.8 : 1);
    const str = kind === 'word' || t.blk ? t.str.toUpperCase() : t.str, x = t.x * Z, y = t.y * Z + size * 0.35;
    if (t.crit) { const w = ctx.measureText(str).width; ctx.fillStyle = 'rgba(255,210,74,' + (0.35 * Math.max(0, 1 - age / 0.3)).toFixed(3) + ')'; ctx.fillRect(x - w / 2 - 3, y - size * 0.82, w + 6, size); }      // a telling blow: a flare behind the figure
    edgedText(ctx, str, x, y, t.col, kind === 'big' ? 0.7 : kind === 'quiet' ? 0.35 : 0.5, '#000');
  }
  ctx.globalAlpha = 1;
  {
    const aim = B.pick && !out(B.pick) && B.pick.target && !out(B.pick.target) ? B.pick.target : null, pulse = 1 + Math.sin(performance.now() / 150) * 0.1;
    const bracket = (o, col, r) => {
      const x = o.x * Z, y = (o.y - o.tall * 0.3) * Z, sx = r * Z * pulse, sy = (o.tall * 0.42 + 2) * Z * pulse, arm = 3.5 * Z;
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 2.2;
      for (let pass = 0; pass < 2; pass++) {
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.moveTo(x + dx * sx - dx * arm, y + dy * sy); ctx.lineTo(x + dx * sx, y + dy * sy); ctx.lineTo(x + dx * sx, y + dy * sy - dy * arm); ctx.stroke(); }
        ctx.strokeStyle = col; ctx.lineWidth = 1.1;
      }
    };
    if (B.marked && !out(B.marked)) {
      const o = B.marked, x = o.x * Z, y = (o.y - o.tall - 7 + Math.sin(performance.now() / 200) * 1.2) * Z;
      bracket(o, '#ff5a4a', 9);
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(x - 4.6, y - 0.6); ctx.lineTo(x + 4.6, y - 0.6); ctx.lineTo(x, y + 5.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff5a4a'; ctx.beginPath(); ctx.moveTo(x - 3.5, y); ctx.lineTo(x + 3.5, y); ctx.lineTo(x, y + 4.5); ctx.closePath(); ctx.fill();
    }
    if (aim) bracket(aim, '#ffd24a', 8);
  }
  ctx.setTransform(SCALE * K, 0, 0, SCALE * K, 0, 0);

  drawHud(ctx, B);

  // running commentary, top centre: the last few lines, the newest lowest and brightest, each with a mark for what
  // kind of thing it is, and never wider than the gap between the two corner panels
  ctx.textBaseline = 'alphabetic';
  let fy = 8;
  const FEED_COL = { ability: '#ffd24a', wound: '#f2c8a0', hit: '#fff0c8', down: '#ff9a8a', dead: '#ff6a5a', yield: '#c9b9a0', spared: '#ffffff', note: '#f2e6cc' };
  const shown = B.feed.slice(-4).filter(l => l.life > 0);
  shown.forEach((l, i) => {
    const age = 6 - l.life, inK = clamp(age / 0.18, 0, 1), mark = HUD_MARKS['l_' + l.kind], pad = mark ? 5 : 0, max = 116 - pad;
    let size = 5, str = l.str; ctx.font = `bold ${size}px Consolas, monospace`;
    while (size > 4 && ctx.measureText(str).width > max) { size -= 0.5; ctx.font = `bold ${size}px Consolas, monospace`; }
    while (str.length > 8 && ctx.measureText(str).width > max) str = str.slice(0, -2).trimEnd() + '…';
    const w = ctx.measureText(str).width + pad, x0 = 160 - w / 2 - 4, last = i === shown.length - 1;
    ctx.globalAlpha = Math.min(1, l.life) * inK * (last ? 1 : 0.82);
    ctx.fillStyle = last ? 'rgba(20,13,9,.92)' : 'rgba(20,13,9,.72)'; ctx.fillRect(x0, fy - 5, w + 8, 7);
    ctx.fillStyle = last ? 'rgba(232,194,122,.55)' : 'rgba(168,121,58,.35)'; ctx.fillRect(x0, fy - 5, w + 8, 0.25); ctx.fillRect(x0, fy + 1.75, w + 8, 0.25);
    ctx.fillStyle = B.col[l.team]; ctx.fillRect(x0, fy - 5, 1.5, 7); ctx.fillRect(x0 + w + 6.5, fy - 5, 1.5, 7);
    if (age < 0.5) { ctx.fillStyle = `rgba(255,255,255,${(0.35 * (1 - age / 0.5)).toFixed(3)})`; ctx.fillRect(x0 + 2, fy - 5, w + 6, 7); }      // it has just been said
    if (mark) drawMark(ctx, 'l_' + l.kind, x0 + 4, fy - 3.2, 0.5);
    ctx.textAlign = 'left'; ctx.fillStyle = FEED_COL[l.kind] || '#f2e6cc'; ctx.fillText(str, x0 + 4 + pad, fy - (5 - size) * 0.4);
    fy += 8;
  });
  ctx.textAlign = 'center'; ctx.font = 'bold 5px Consolas, monospace';
  ctx.globalAlpha = 1;

  // entrance: who is fighting whom, what each is, and whose style has the edge
  if (B.intro > 0) drawIntro(ctx, B, T);

  // crowd meter
  ctx.textAlign = 'center';
  ctx.font = 'bold 5px Consolas, monospace';
  const live = B.intro <= 0 && !B.over;
  if (!B.wild) {                 // nobody is watching out here
    const e = clamp(B.exc, 0, 1), word = e > 0.55 ? 'ROARING' : e > 0.3 ? 'STIRRING' : 'QUIET';
    hudPlate(ctx, 108, 163.5, 104, 14);
    if (e > 0.55) { ctx.fillStyle = 'rgba(255,210,74,' + (0.07 + 0.05 * Math.sin(T * 10)).toFixed(3) + ')'; ctx.fillRect(108.5, 164, 103, 13); }      // the whole plate warms when they roar
    hudGauge(ctx, 111, 172.5, 98, 3, e, e > 0.55 ? (Math.sin(T * 10) > 0 ? '#ffe27a' : '#ffd24a') : e > 0.3 ? '#e0aa3e' : '#b98a2e', { trough: '#1c130c' });
    for (const v of [0.3, 0.55]) { ctx.fillStyle = HUD_EDGE; ctx.fillRect(111 + 98 * v - 0.5, 171.75, 1, 4.5); ctx.fillStyle = HUD_BRONZE_L; ctx.fillRect(111 + 98 * v - 0.25, 171.75, 0.5, 4.5); }      // where it stirs, and where it roars
    ctx.font = 'bold 4.25px ' + HUD_FONT; ctx.textAlign = 'left'; ctx.fillStyle = HUD_DIM; ctx.fillText('CROWD', 111, 169.9);
    ctx.fillStyle = e > 0.55 ? '#ffd24a' : e > 0.3 ? HUD_INK : HUD_DIM; ctx.fillText(word, 111 + ctx.measureText('CROWD ').width + 1.5, 169.9);
    ctx.font = 'bold 5px ' + HUD_NUM;
  }
  if (live) {                    // the clock: how long it has run, and when the judges will end it
    const left = 150 - B.time, s2 = Math.floor(left < 30 ? Math.max(0, left) : B.time), str = `${Math.floor(s2 / 60)}:${String(s2 % 60).padStart(2, '0')}`;
    if (B.wild) hudPlate(ctx, 144, 169, 32, 8.5);
    ctx.textAlign = 'right';
    if (left < 30) { ctx.fillStyle = Math.sin(T * 8) > 0 ? '#ff8a7a' : '#e2695c'; ctx.fillText(B.wild ? str : `ENDS IN ${str}`, B.wild ? 166 : 209, B.wild ? 175.3 : 170.2); }
    else { ctx.fillStyle = '#f2e6cc'; ctx.fillText(str, B.wild ? 166 : 209, B.wild ? 175.3 : 170.2); }
  }
  if (live && B.fighters.length > 2) for (const t of [0, 1]) {      // how each side stands as a whole
    const fs = B.fighters.filter(f => f.team === t), up = fs.filter(f => !out(f)), tot = fs.reduce((n, f) => n + f.maxHp, 0), has = up.reduce((n, f) => n + Math.max(0, f.hp), 0);
    const x = t ? 218 : 38, w = 64, fr = clamp(has / Math.max(1, tot), 0, 1);
    hudPlate(ctx, x - 3, 166.5, w + 6, 11);
    ctx.fillStyle = B.col[t]; ctx.fillRect(t ? x + w + 1.25 : x - 2.5, 167, 1.25, 10);
    hudGauge(ctx, x, 172.5, w, 3, fr, B.col[t], { right: !t });
    ctx.font = 'bold 3.75px ' + HUD_FONT; ctx.textAlign = t ? 'left' : 'right'; ctx.fillStyle = HUD_INK; ctx.fillText(`${up.length} OF ${fs.length} STANDING`, t ? x : x + w, 170.6);
    ctx.font = 'bold 5px ' + HUD_NUM;
  }
  ctx.textAlign = 'center';
  if (B.death && live && !B.pick) {             // no quarter in this one
    hudPlate(ctx, 132, 154.5, 56, 8, { line: '#a3261b', top: '#4a0f0a', bot: '#240604' }); ctx.font = 'bold 4.25px ' + HUD_FONT; ctx.fillStyle = '#ff8a7a'; ctx.fillText('SINE MISSIONE', 160, 160.3); ctx.font = 'bold 5px ' + HUD_NUM;
  }
  if (B.pick && !out(B.pick)) {                     // the man the fight has stopped for
    const f = B.pick;
    const many = B.fighters.filter(o => o.team !== f.team && !out(o)).length > 1;
    hudPlate(ctx, many ? 70 : 96, 153, many ? 180 : 128, 9, { line: '#e0aa3e' });
    ctx.font = 'bold 4.25px ' + HUD_FONT; ctx.fillStyle = '#ffd24a'; ctx.fillText(`${f.g.name.toUpperCase()} IS READY: CHOOSE${many ? '  -  CLICK A FOE TO AIM AT HIM' : ''}`, 160, 159.1); ctx.font = 'bold 5px ' + HUD_NUM;
  }

  // the man the mouse is on: what he is, how he stands, and what he carries
  const who = B.inspect && B.fighters.includes(B.inspect) ? B.inspect : null;
  if (who && !B.pick && !B.over && B.intro <= 0 && !B.cut && !B.fatal) drawInspect(ctx, B, who, T);
  if (B.cut) drawCutIn(ctx, B, T);
  if (B.fatal) drawFatal(ctx, B, T);
  if (B.paused && !B.over) { ctx.fillStyle = 'rgba(8,5,2,.28)'; ctx.fillRect(0, 0, 320, 180); hudPlate(ctx, 116, 77, 88, 19, { line: '#e0aa3e' }); ctx.fillStyle = 'rgba(232,194,122,.35)'; ctx.fillRect(120, 79.5, 80, 0.25); ctx.fillRect(120, 93.25, 80, 0.25); ctx.font = 'bold 11px Cinzel, Georgia, serif'; ctx.textAlign = 'center'; edgedText(ctx, 'PAUSED', 160, 90.4, '#f5d584', 0.4, '#000'); }

  if (B.over) drawOutro(ctx, B, T);
}
