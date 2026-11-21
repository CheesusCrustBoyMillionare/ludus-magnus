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
  if (has('pitfighter') && n === 1) dmg *= 1.08;
  if (has('reaver') && fld.wild) dmg *= 1.1;
  if (has('eaglesworn')) dmg *= 1.05;
  dmg *= 0.94 + g.morale / 1000;
  return {
    g, c, team, tactic: T,
    // a line down the field; in a crowd they stand three deep, so that nine a side have room
    x: team === 0 ? 14 : 199, markX: (team === 0 ? 60 : 153) + (n > 5 ? (i % 3) * 11 : n > 3 && i % 2 ? 9 : 0) * (team ? 1 : -1),
    y: (fld.y0 + fld.y1) / 2 + (i - (n - 1) / 2) * Math.min(26, (fld.y1 - fld.y0 - 2) / Math.max(1, n - 1)),
    hp: Math.min(g.hp, mh), maxHp: mh,
    dmg, atkTime: Math.max(0.35, atk), dodge: Math.max(0, dodge), block, acc, crit, show, critMult: has('killer') ? 2.1 : 1.7,
    armor: c.armor + gs.armor + (has('thickskin') ? 2 : 0), reach: c.reach,
    stunRes: Math.min(0.7, gs.stunRes), critRes: gs.critRes, bleedRes: gs.bleedRes, hamRes: gs.hamRes, armRes: gs.armRes,
    speed: 26 * c.speed * (1 + s.agi * 0.011) * gs.speed,
    // the charge that fills as he fights: full, it is spent on one of the abilities he carries (abilities.js)
    charge: 0, chargeRate: (has('ironlungs') ? 1.25 : 1) * (1 - g.fatigue / 250), abl: abilitiesOf(g), casts: 0,
    style: styleOf(g), buff: null, weakT: 0, weakAmt: 0,
    tall: g.beast ? BEAST_ART[g.cls].lh + BEAST_ART[g.cls].bh + 9 : 45,
    cd: 0.4 + Math.random() * 0.6, state: 'ready', t: 0, move: null,
    target: null, retarget: 0, circle: chance(0.5) ? 1 : -1,
    facing: team === 0 ? 1 : -1, snare: 0, stun: 0, kx: 0, flash: 0, atkAnim: 0, slash: 0,
    walk: Math.random() * 10, moving: false,
    bleed: 0, bleedT: 0, bleedBy: null, drip: 0, hamstrung: false, armWound: false,
    fallT: 0, guard: 0, hate: null, down: false, yielded: false, fate: null, dmgDealt: 0, downedBy: null,
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
    intro: opts.noIntro ? 0 : 2.6,
    theme: THEMES[clamp(opts.tier || 0, 0, 4)], names: opts.names || null, snd: [],
    col: [TEAM_COL[0], opts.foeCol || TEAM_COL[1]], colD: [TEAM_DARK[0], opts.foeColD || TEAM_DARK[1]],
    parts: [], stains: [], texts: [], projs: [], feed: [], crowd: [], specks: [], props: [], vfx: [],
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
      const col = pick(cols);
      B.crowd.push({ x: x + rint(-1, 1), y, col, colD: shade(col, 0.7), skin: pick(ORIGINS).skin, hair: pick(hairs), ph: rand(0, 6.28), sp: rand(3, 9), arms: chance(0.5) });
    }
  }
  for (let i = 0; i < 420; i++) B.specks.push({ x: rint(0, 426), y: rint(92, 239), w: rint(1, 3), c: chance(0.5) ? 0 : 1 });
  // friendships, rivalries and vows in the player's ludus change how his men fight (see sim.js)
  if (typeof applyStories === 'function' && typeof G !== 'undefined' && G && G.bonds) applyStories(B);
  return B;
}

// ---------- effects ----------

function fxText(B, f, str, col, big) { B.texts.push({ x: f.x + rand(-3, 3), y: f.y - 28, str, col, life: big ? 1.6 : 0.9, big: !!big }); }
function fxBlood(B, f, n, dir) {
  for (let i = 0; i < n; i++) {
    B.parts.push({ x: f.x, y: f.y + rand(-2, 2), h: rand(8, 14), vx: dir * rand(5, 40) + rand(-12, 12), vh: rand(10, 45), col: chance(0.5) ? '#8e1b14' : '#b3261c' });
  }
}
function fxDust(B, x, y, n) {
  for (let i = 0; i < n; i++) B.parts.push({ x: x + rand(-4, 4), y: y + rand(-1, 1), h: 1, vx: rand(-18, 18), vh: rand(8, 28), col: chance(0.5) ? '#c9a763' : '#ead2a0', spark: true });
}
function feed(B, str, team) {
  B.feed.push({ str, team, life: 6 });
  if (B.feed.length > 5) B.feed.shift();
}

// ---------- resolution ----------

function knockDown(B, d, a, how) {
  d.hp = 0; d.down = true; d.downedBy = a || d.downedBy; d.state = 'ready'; d.bleed = 0; B.lastDown = d;
  d.fallT = 0.35; snd(B, 'down', 1, d);
  B.exc += 0.2 * (a ? a.show : 1);
  B.hitstop = 0.12; B.shake = 3; B.flashT = 0.12;
  fxBlood(B, d, 16, a ? a.facing : 1);
  fxDust(B, d.x, d.y, 8);
  for (let i = 0; i < 10; i++) B.stains.push({ x: d.x + rand(-7, 7), y: d.y + rand(-2, 3), w: rint(1, 3), t: B.clock });
  feed(B, how || `${d.g.name} is struck down${a ? ' by ' + a.g.name : ''}`, d.team);
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
    fxText(B, d, 'dodge', '#cfe0ff'); snd(B, 'miss', 1, a);
    B.exc += 0.015 * d.show;
    tryRiposte(B, d);
    return 'dodge';
  }
  let dmg = a.dmg * (a.armWound ? 0.8 : 1) * (0.8 + Math.random() * 0.4) * (o.mult || 1);
  dmg *= styleEdge(a.style, d.style);                 // strength beats agility beats skill beats strength
  dmg *= (1 + (ab.dmg || 0)) * (a.weakT > 0 ? 1 - a.weakAmt : 1) * (1 - (db.dr || 0));
  if (a.riposte) { dmg *= 1.15; a.riposte = false; }
  if (flank && !d.flankSaid) { d.flankSaid = true; feed(B, `${a.g.name} takes ${d.g.name} from behind`, a.team); }
  if (d.snare > 0) dmg *= 1.1;
  if (a.hate === d) dmg *= 1.15;        // a man facing the rival he has sworn to beat
  if (a.g.traits.includes('bloodthirsty') && d.hp < d.maxHp * 0.5) dmg *= 1.15;
  if (a.g.traits.includes('lionheart') && a.hp < a.maxHp * 0.35) dmg *= 1.2;
  if (d.g.beast && a.g.traits.includes('beastslayer')) dmg *= 1.2;
  const crit = !o.nocrit && (o.crit || Math.random() < Math.max(0.01, a.crit - d.critRes));
  if (crit) dmg *= a.critMult;
  let blocked = false;
  if (!o.unblockable && d.snare <= 0 && Math.random() < (d.block + (db.block || 0)) * wary * (flank ? 0.3 : 1)) { blocked = true; dmg *= 0.25; }
  const armor = o.pierce ? 0 : d.armor * (blocked ? 0.5 : 1);
  dmg = Math.max(1, Math.round(dmg - armor));
  d.hp -= dmg;
  a.dmgDealt += dmg;
  d.flash = 0.12;
  // blows fill the charge: more for landing one than for taking one, and nothing from an ability's own strokes
  if (!o.ability) chargeUp(a, blocked ? 4 : 9);
  chargeUp(d, blocked ? 6 : 5);
  d.kx = a.facing * (o.kb || (blocked ? 15 : 35)) * (crit ? 1.5 : 1);
  d.stun = Math.max(o.stun || 0, blocked ? 0.05 : 0.15) * (1 - d.stunRes);
  if (d.state === 'windup' && (o.stun || crit)) { d.state = 'ready'; d.move = null; d.cd = 0.3; }
  B.exc += (dmg / 220 + (crit ? 0.06 : 0) + (o.ability ? 0.02 : 0)) * a.show;
  B.shake = Math.max(B.shake, crit ? 2 : 0.8);
  if (crit) { B.hitstop = 0.06; B.flashT = 0.07; }
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
    snd(B, 'hit', crit ? 1.5 : 1, d, a.g.beast ? 'beast' : '');
    // a heavy blow to the head can tear a helmet off; it lies where it lands
    if (crit && !d.noHelm && (d.g.cls === 'murmillo' || d.g.cls === 'thraex' || d.g.cls === 'hoplomachus') && chance(0.4)) {
      d.noHelm = true;
      const hd = gearLook(d.g).head;
      B.props.push({ x0: d.x, y0: d.y, x: clamp(d.x + a.facing * rand(10, 22), B.field.x0, B.field.x1), y: clamp(d.y + rand(-5, 6), B.field.y0, B.field.y1), t: B.clock,
        col: hd >= 3 ? '#b4bec8' : hd === 2 ? '#dcae48' : '#b98a34', crest: d.g.cls === 'hoplomachus' ? '#f0ead8' : B.col[d.team] });
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
}

function updateFighter(B, f, dt) {
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
    if (f.drip <= 0) { f.drip = 0.3; B.parts.push({ x: f.x + rand(-2, 2), y: f.y + rand(-1, 1), h: 9, vx: rand(-4, 4), vh: 0, col: '#b3261c' }); }
    if (f.bleedT <= 0) f.bleed = 0;
    if (f.hp <= 0) { knockDown(B, f, f.bleedBy, `${f.g.name} collapses from loss of blood`); return; }
  }
  chargeUp(f, 3.2 * dt);                               // the charge builds by itself, slowly
  if (f.buff && (f.buff.t -= dt) <= 0) f.buff = null;
  f.weakT = Math.max(0, f.weakT - dt);
  f.snare = Math.max(0, f.snare - dt);
  f.cd -= dt; f.retarget -= dt;

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
    if (f.team === 0 && B.ask && !f.g.beast && f.abl.length > 1) { B.pick = f; return; }
    castAbility(B, f, f.abl.length > 1 ? aiPickAbility(B, f) : f.abl[0]);
    return;
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
    if (p.h <= 0) { p.dead = true; if (!p.spark && B.stains.length < 600) B.stains.push({ x: p.x, y: p.y, w: 1, t: B.clock }); }
  }
  B.parts = B.parts.filter(p => !p.dead);
  for (const t of B.texts) { t.y -= (t.big ? 7 : 14) * dt; t.life -= dt; }
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
  const avg = B.time > 0 ? B.excSum / B.time : 0;
  let i = 0;
  for (const f of B.fighters) {
    if (!out(f)) continue;
    if (f.g.beast || (f.down && B.death)) { f.fate = 'dead'; continue; }
    // in a hunt there is no appeal to the crowd: the handlers reach a fallen man in time, or they do not
    // in the wild your own are better placed to reach a fallen friend than arena handlers are
    const p = B.hunt ? clamp((B.wild && f.team === 0 ? 0.65 : 0.5) + B.mercy[f.team], 0, 0.9)
      : clamp((f.yielded ? 0.88 : 0.72) + 0.25 * avg + B.mercy[f.team] + Math.min(0.1, f.dmgDealt / 300) + (f.g.traits.includes('blessed') ? 0.1 : 0), 0, 0.98);
    f.fate = Math.random() < p ? 'spared' : 'dead';
    f.revealAt = 1.2 + i * 0.9; i++;
  }
  B.outroEnd = 1.8 + i * 0.9 + (i ? 0.9 : 0);
}

function stepOutro(B, dt) {
  B.outro += dt;
  for (const f of B.fighters) {
    f.flash = Math.max(0, f.flash - dt);
    if (!f.revealAt || f.revealed || B.outro < f.revealAt) continue;
    f.revealed = true;
    if (f.fate === 'spared') {
      fxText(B, f, B.wild ? 'LIVES' : B.hunt ? 'DRAGGED CLEAR' : 'MISSIO', '#ffffff', true); snd(B, 'spared', 1, f);
      feed(B, B.wild ? `${f.g.name} is still breathing` : B.hunt ? `${f.g.name} is dragged clear by the handlers` : `The crowd spares ${f.g.name}`, f.team);
    } else {
      fxText(B, f, B.wild ? 'DEAD' : B.hunt ? 'MAULED' : 'IUGULA!', '#ff5a4a', true); snd(B, 'killed', 1, f); f.fallT = 0.3;
      feed(B, B.wild ? `${f.g.name} does not get up` : B.hunt ? `The handlers are too late for ${f.g.name}` : `Thumbs are turned: ${f.g.name} dies`, f.team);
      f.down = true; f.yielded = false; f.flash = 0.12; B.shake = 3;
      fxBlood(B, f, 14, -f.facing);
      for (let k = 0; k < 8; k++) B.stains.push({ x: f.x + rand(-7, 7), y: f.y + rand(-2, 3), w: rint(1, 3), t: B.clock });
    }
  }
}

function stepIntro(B, dt) {
  B.intro -= dt;
  for (const f of B.fighters) {
    const dx = f.markX - f.x;
    f.moving = Math.abs(dx) > 0.5;
    if (f.moving) { f.x += Math.sign(dx) * Math.min(Math.abs(dx), 30 * dt); f.walk += dt * 8; }
  }
  if (B.intro <= 0) {
    B.fighters.forEach(f => { f.x = f.markX; f.moving = false; });
    B.texts.push({ x: 107, y: 64, str: B.wild ? 'AT THEM!' : 'PUGNATE!', col: '#ffd24a', life: 1.3, big: true });
    snd(B, 'start');
  }
}

function stepBattle(B, dt) {
  if (B.slowmo > 0) { B.slowmo -= dt; dt *= 0.25; }
  stepFx(B, dt);
  if (B.over) { stepOutro(B, dt); return; }
  if (B.intro > 0) { stepIntro(B, dt); return; }
  if (B.pick) { if (out(B.pick) || !B.ask) B.pick = null; else return; }      // stopped, waiting for the player to choose an ability
  if (B.hitstop > 0) { B.hitstop -= dt; return; }
  B.time += dt;
  B.exc = clamp(B.exc - 0.012 * dt, 0, 1);
  B.excSum += B.exc * dt;
  for (const f of B.fighters) updateFighter(B, f, dt);
  for (const p of B.projs) {
    p.t += dt;
    const k = Math.min(1, p.t / p.dur);
    p.x = p.from.x + (p.to.x - p.from.x) * k; p.y = p.from.y + (p.to.y - p.from.y) * k; p.k = k;
    if (k >= 1) {
      p.dead = true;
      if (p.hit && !out(p.to)) {
        p.to.snare = Math.max(p.to.snare, p.snare || 3); fxText(B, p.to, 'netted', '#d8c79a'); B.exc += 0.05 * p.from.show;
        if (p.weak) { p.to.weakT = p.weak.t; p.to.weakAmt = p.weak.amt; }
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

const _shades = {};
function shade(hex, f) {
  const k = hex + '|' + f;
  if (_shades[k]) return _shades[k];
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f <= 1) { r *= f; g *= f; b *= f; } else { const t = f - 1; r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
  return (_shades[k] = 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')');
}

function drawSprite(ctx, o) {
  // o: {x,y,facing,g,team,col,colD,moving,walk,clock,atkAnim,windup,windP,recoil,bash,guard,flash,down,falling,yielded,snare,cheer,shadow}
  if (o.g.beast) { drawBeast(ctx, o); return; }
  const g = o.g, c = CLASSES[g.cls], cls = g.cls, d = o.facing;
  const look = gearLook(g), armorT = look.armor, weaponT = look.weapon;
  const X = Math.round(o.x), Y = Math.round(o.y) - (o.cheer && Math.sin(o.cheer * 9) > 0.3 ? 2 : 0);
  const white = o.flash > 0;
  let lean = 0;       // sideways shift of everything above the hips: into a blow, back from a hit
  const P = (x, y, w, h, col) => { ctx.fillStyle = white ? '#fff' : col; ctx.fillRect(d > 0 ? X + x + lean : X - x - w - lean, Y + y, w, h); };
  const L = (x0, y0, x1, y1, w, col) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)), o2 = w >> 1;
    for (let i = 0; i <= n; i++) { const t = n ? i / n : 0; P(Math.round(x0 + (x1 - x0) * t) - o2, Math.round(y0 + (y1 - y0) * t) - o2, w, w, col); }
  };

  const skin = g.look.skin, skinD = shade(skin, 0.76), skinL = shade(skin, 1.18), hair = g.look.hair;
  const team = o.col || TEAM_COL[o.team], teamD = o.colD || TEAM_DARK[o.team], teamL = shade(team, 1.3);
  const metal = look.head >= 3 ? '#b4bec8' : look.head === 2 ? '#dcae48' : '#b98a34';
  const metalD = shade(metal, 0.68), metalL = shade(metal, 1.4);
  const blade = ['#8d9094', '#c1c7cc', '#e4e9ed', '#fbf6dc'][weaponT], bladeD = shade(blade, 0.72);
  const hilt = weaponT >= 3 ? '#e8b545' : weaponT >= 1 ? '#8a6230' : '#5e4222';
  const gold = '#e8b545', wood = '#7a5a2a', cloth = '#ddd3ba', clothD = '#b0a488', leather = '#6b4526', ink = '#1c1310';
  const torso = [skin, '#d6c8a2', skin, '#aeb8c2'][armorT], torsoD = [skinD, '#b0a078', skinD, '#7c8792'][armorT];
  const helmed = (cls === 'murmillo' || cls === 'thraex' || cls === 'hoplomachus') && !o.noHelm;
  const manica = cls === 'murmillo' || cls === 'thraex' || cls === 'retiarius' || look.arms;
  const arm = manica ? '#cfc4a6' : skin, armD = manica ? '#a2977a' : skinD;
  const seed = g.id * 7919 % 97;

  // shadow: a pool under the feet, drawn out along the ground when the light is low
  const sh = o.shadow || { len: 0, a: 0.2 };
  ctx.fillStyle = `rgba(0,0,0,${sh.a})`;
  ctx.fillRect(X - 9, Y - 2, 18 + sh.len, 3); ctx.fillRect(X - 6, Y + 1, 12 + sh.len, 1);
  if (sh.len) { ctx.fillRect(X - 5, Y - 3, 12 + sh.len, 1); ctx.fillRect(X + 9 + sh.len, Y - 2, 3, 2); }

  // ---- lying on the sand ----
  if (o.down && !o.falling) {
    if (c.shield) { P(-16, -11, 8, 4, teamD); P(-15, -10, 6, 2, team); P(-13, -10, 2, 2, gold); }
    P(-18, -4, 10, 3, skin); P(-18, -2, 10, 1, skinD); P(-20, -4, 2, 3, leather);
    P(-9, -6, 6, 5, cloth); P(-9, -2, 6, 1, clothD);
    P(-3, -8, 11, 7, torso); P(-3, -2, 11, 1, torsoD); P(-4, -8, 2, 7, team);
    if (armorT === 2) { P(0, -8, 6, 4, metal); P(0, -8, 6, 1, metalL); }
    if (armorT === 3) { for (let x = -1; x < 8; x += 2) P(x, -8, 1, 6, '#7c8792'); }
    L(6, -3, 13, -1, 2, arm);
    if (helmed) { P(8, -9, 7, 7, metal); P(8, -9, 7, 1, metalL); P(13, -6, 2, 3, ink); P(6, -10, 3, 3, cls === 'hoplomachus' ? '#f0ead8' : team); }
    else { P(8, -8, 6, 6, skin); P(8, -8, 6, 2, hair); P(8, -6, 2, 3, hair); P(12, -5, 1, 1, ink); }
    L(14, -1, 22, -1, 1, blade); P(13, -2, 1, 2, hilt);
    return;
  }

  // ---- pose ----
  const kneel = o.yielded || o.falling;
  const ph = (o.walk || 0) * Math.PI / 2;                       // walk cycle: one stride every four units of o.walk
  const by = kneel ? 8 : (o.moving ? (Math.abs(Math.sin(ph)) > 0.7 ? 1 : 0) : (Math.sin((o.clock || 0) * 2.6) > 0.55 ? 1 : 0));
  const striking = !kneel && !o.cheer && !o.windup && o.atkAnim > 0.45;
  // lean forward on the move and into a blow; rock back while winding up or when struck
  const leanAmt = kneel ? 0 : (o.moving ? 1 : 0) + (striking ? 2 : o.atkAnim > 0 && !o.windup ? 1 : 0) - (o.windup ? 1 : 0) - Math.round((o.recoil || 0) * 2);
  const sway = (o.moving ? -1 : 0) + (Math.sin((o.clock || 0) * 3.1 + seed) > 0.6 ? -1 : 0) - (striking ? 1 : 0);   // crests and plumes trail behind

  // ---- legs ----
  const greave = (x, lift, tall) => { P(x, (tall ? -10 : -8) - lift, 4, tall ? 9 : 7, metal); P(x + 1, (tall ? -10 : -8) - lift, 1, tall ? 9 : 7, metalL); };
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
  if (look.shoulders && armorT !== 3) { P(-6, -29 + by, 5, 3, metal); P(-6, -29 + by, 5, 1, metalL); P(-6, -27 + by, 5, 1, metalD); }
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
    if (cls === 'murmillo') {            // tall fin crest
      P(-4, -39 + by, 8, 1, metalD);
      P(-5, -40 + by, 8, 1, team); P(-5 + sway, -42 + by, 8, 2, team); P(-4 + sway, -43 + by, 6, 1, teamL); P(3, -41 + by, 1, 2, team);
      P(-4 + sway, -42 + by, 1, 2, teamD); P(-2 + sway, -42 + by, 1, 2, teamD); P(0 + sway, -42 + by, 1, 2, teamD); P(-4, -40 + by, 1, 1, teamD); P(-2, -40 + by, 1, 1, teamD); P(0, -40 + by, 1, 1, teamD); P(2, -41 + by, 1, 2, teamD);
    } else if (cls === 'thraex') {       // griffin hook with a plume behind it
      P(-5, -40 + by, 4, 2, team); P(-5 + sway, -42 + by, 4, 2, team); P(-6, -41 + by, 1, 5, teamD); P(-4 + sway, -43 + by, 2, 1, teamL);
      P(0, -41 + by, 2, 3, metal); P(1, -43 + by, 3, 2, metal); P(4, -42 + by, 1, 2, metalL); P(2, -42 + by, 1, 1, ink);
    } else {                             // feathers
      P(-1, -42 + by, 2, 4, '#f0ead8'); P(-3, -41 + by, 2, 3, '#f0ead8'); P(1, -40 + by, 2, 2, '#d8d0b8');
      P(-1 + sway, -44 + by, 2, 2, '#f0ead8'); P(-3 + sway, -43 + by, 2, 2, '#f0ead8'); P(1 + sway, -42 + by, 2, 2, '#d8d0b8');
      P(-1 + sway, -45 + by, 2, 1, team); P(-3 + sway, -44 + by, 2, 1, team); P(1 + sway, -43 + by, 2, 1, team); P(-5, -41 + by, 2, 3, '#d8d0b8');
    }
  } else {
    P(-3, -36 + by, 7, 7, skin); P(-3, -30 + by, 7, 1, skinD); P(-3, -36 + by, 1, 7, skinD);
    P(2, -34 + by, 1, 1, ink); P(1, -35 + by, 3, 1, shade(hair, 0.8)); P(4, -33 + by, 1, 1, skin); P(2, -31 + by, 2, 1, skinD); P(-1, -34 + by, 1, 2, skinD);
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
      P(Math.round(hx - vy) - 1, Math.round(hy + vx) - 1, 2, 2, hilt); P(Math.round(hx + vy) - 1, Math.round(hy - vx) - 1, 2, 2, hilt);
    }
    L(-1, -26 + by, A.e[0], A.e[1] + by, 3, arm); L(A.e[0], A.e[1] + by, hx, hy, 3, arm);
    if (manica) P(A.e[0] - 1, A.e[1] + by - 1, 3, 1, armD);
    P(hx - 1, hy - 1, 3, 3, skin); P(hx - 1, hy + 1, 3, 1, skinD);
    if (striking && o.atkAnim > 0.55) {          // the sweep of the blow: a fading trail from the wind-up to the strike
      const reach = long ? 16 : c.weapon === 'gladius' ? 9 : 7;
      for (let i = 1; i <= 5; i++) {
        const t = i / 6, m = mix(K.windup, K.strike, t), n = Math.hypot(m.v[0], m.v[1]) || 1;
        P(Math.round(m.h[0] + m.v[0] / n * reach), Math.round(m.h[1] + by + m.v[1] / n * reach - Math.sin(t * Math.PI) * 3), 2, 2, `rgba(255,255,255,${(0.1 + t * 0.5).toFixed(2)})`);
      }
      P(Math.round(tx) + 1, Math.round(ty) - 3, 1, 7, 'rgba(255,255,255,.8)');
    }

    // ---- off hand: shield, net or second blade ----
    const so = o.bash ? 4 : o.guard > 0 ? 2 : 0, sy = (o.guard > 0 ? -3 : 0) + by;
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
    ctx.fillStyle = 'rgba(232,220,180,.75)';
    for (let i = -10; i <= 10; i += 4) ctx.fillRect(X + i, Y - 38, 1, 38);
    for (let j = -38; j <= -2; j += 5) ctx.fillRect(X - 10, Y + j, 21, 1);
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

function drawBeast(ctx, o) {
  const kind = o.g.cls, a = BEAST_ART[kind], d = o.facing, X = Math.round(o.x), Y = Math.round(o.y);
  const white = o.flash > 0;
  const P = (x, y, w, h, col) => { ctx.fillStyle = white ? '#fff' : col; ctx.fillRect(d > 0 ? X + x : X - x - w, Y + y, w, h); };
  const col = a.col, colD = shade(col, 0.7), colL = shade(col, 1.22), ink = '#1c1310', hb = Math.floor(a.bw / 2);
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.fillRect(X - hb - 2, Y - 2, a.bw + 8, 3);

  if (o.down && !o.falling) { // on its side
    P(-hb, -a.bh + 2, a.bw, a.bh - 2, col); P(-hb, -2, a.bw, 2, colD); P(-hb + 2, -a.bh + 2, a.bw - 4, 1, colL);
    P(-hb + 2, -a.bh - 2, a.lw, 4, colD); P(hb - a.lw - 3, -a.bh - 2, a.lw, 4, colD);
    if (a.mane) P(hb - 5, -a.hh - 1, a.hw + 2, a.hh + 1, a.mane);
    P(hb - 1, -a.hh + 1, a.hw, a.hh - 1, col); P(hb + a.hw - 2, -3, 3, 2, colD); P(hb + a.hw - 3, -a.hh + 3, 1, 1, ink);
    return;
  }

  const lunge = Math.round(o.atkAnim * 3) - (o.windup ? 2 : 0);
  const frame = o.moving ? Math.floor(o.walk) % 4 : -1;
  const bob = o.moving ? frame % 2 : (Math.sin((o.clock || 0) * 2.2) > 0.6 ? 1 : 0);
  const sw = o.moving ? [2, 0, -2, 0][frame] : 0;
  const x0 = -hb + lunge, top = -(a.lh + a.bh) - (o.moving ? bob : 0);
  // far legs, then near legs
  P(x0 + 1 - sw, -a.lh, a.lw, a.lh, colD); P(x0 + a.bw - a.lw - 4 + sw, -a.lh, a.lw, a.lh, colD);
  P(x0 + 3 + sw, -a.lh, a.lw, a.lh, col); P(x0 + a.bw - a.lw - 1 - sw, -a.lh, a.lw, a.lh, col);
  P(x0 + 3 + sw, -1, a.lw + 1, 1, colD); P(x0 + a.bw - a.lw - 1 - sw, -1, a.lw + 1, 1, colD);
  // tail
  if (a.tail === 1) { P(x0 - 4, top + 1, 5, 2, col); P(x0 - 5, top + 3, 2, 3, colD); }
  if (a.tail === 2) { P(x0 - 5, top + 1, 6, 1, col); P(x0 - 6, top - 2, 1, 4, col); P(x0 - 7, top - 4, 3, 2, a.mane); }
  if (kind === 'boar') P(x0 - 1, top + 2, 1, 3, colD);
  // body
  P(x0, top, a.bw, a.bh, col); P(x0, top + a.bh - 2, a.bw, 2, colD); P(x0 + 2, top, a.bw - 4, 1, colL);
  if (kind === 'boar') for (let i = 1; i < a.bw - 2; i += 2) P(x0 + i, top - 1, 1, 1, ink);
  if (kind === 'bear') { P(x0 + 3, top - 1, a.bw - 8, 1, col); P(x0 + a.bw - 8, top - 2, 6, 2, col); }
  // head
  const hx = x0 + a.bw - 2, hy = top + a.hy + (o.moving ? 0 : bob);
  if (a.mane) { P(hx - 4, hy - 2, a.hw + 3, a.hh + 4, a.mane); P(hx - 5, hy, 2, a.hh, shade(a.mane, 0.8)); P(hx - 3, hy - 3, a.hw, 1, shade(a.mane, 1.2)); }
  P(hx, hy, a.hw, a.hh, col); P(hx, hy + a.hh - 2, a.hw, 2, colD);
  P(hx + 1, hy - 2, 2, 2, kind === 'wolf' ? colD : col); if (kind === 'wolf') P(hx + 1, hy - 3, 1, 1, colD);
  P(hx + a.hw - 1, hy + a.hh - 4, 3, 3, kind === 'bear' || kind === 'lion' ? colL : col);
  P(hx + a.hw + 1, hy + a.hh - 4, 1, 1, ink);
  P(hx + a.hw - 3, hy + 2, 1, 1, ink);
  if (kind === 'boar') { P(hx + a.hw, hy + a.hh - 2, 1, 2, '#f2ecd8'); P(hx + a.hw + 1, hy + a.hh - 3, 1, 1, '#f2ecd8'); }
  if (o.atkAnim > 0.3 || o.windup) { P(hx + a.hw - 1, hy + a.hh - 1, 3, 1, '#b3261c'); P(hx + a.hw, hy + a.hh - 2, 1, 1, '#ffffff'); P(hx + a.hw + 1, hy + a.hh, 1, 1, '#ffffff'); }
  if (o.slash > 0) { P(hx + a.hw + 3, hy, 1, a.hh + 2, '#ffffff'); P(hx + a.hw + 5, hy + 1, 1, a.hh, 'rgba(255,255,255,.6)'); }
  if (o.snare > 0) {
    ctx.fillStyle = 'rgba(232,220,180,.75)';
    for (let i = -hb - 2; i <= hb + a.hw + 2; i += 4) ctx.fillRect(X + (d > 0 ? i : -i), Y + top - 4, 1, -top + 4);
    for (let j = top - 4; j <= -2; j += 5) ctx.fillRect(X - hb - a.hw - 2, Y + j, a.bw + 2 * a.hw + 4, 1);
  }
}

// The arena sprite on a portrait canvas. Beasts still use this; fighters get a close-up (art.js).
function drawSpritePortrait(canvas, g, team, col, colD) {
  const ctx = canvas.getContext('2d');
  const full = canvas.width >= 100;
  const s = full ? 3 : Math.max(2, Math.round(canvas.width / 18));
  const w = canvas.width / s, h = canvas.height / s;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#54433a'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#483930';
  for (let y = 4, r = 0; y < h; y += 6, r++) { ctx.fillRect(0, y, w, 1); for (let x = r % 2 ? 4 : 10; x < w; x += 12) ctx.fillRect(x, y - 5, 1, 5); }
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, 0, w, 2);
  if (full) { ctx.fillStyle = '#c9a763'; ctx.fillRect(0, h - 5, w, 5); ctx.fillStyle = '#a88a52'; ctx.fillRect(0, h - 5, w, 1); }
  drawSprite(ctx, {
    x: Math.round(w / 2) - (full ? 4 : 2), y: full ? Math.round(h) - 3 : Math.round(h) + 20, facing: 1, g, team: team || 0, col, colD,
    moving: false, walk: 0, clock: 0, atkAnim: 0, flash: 0, down: false, snare: 0, slash: 0,
  });
}

function drawHud(ctx, B) {
  const rows = [0, 0], many = B.fighters.length > 10, rh = many ? 6 : 10, ty = many ? 4.5 : 6.5;      // a crowd gets thinner lines
  ctx.font = 'bold 5px Consolas, monospace';
  ctx.textAlign = 'left';
  for (const f of B.fighters) {
    const x = f.team ? 226 : 2, y = 2 + rows[f.team]++ * rh, gone = out(f);
    ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(x, y, 92, rh - 1);
    ctx.fillStyle = B.col[f.team]; ctx.fillRect(x, y, 2, rh - 1);
    ctx.fillStyle = gone ? '#8a7a66' : '#f2e6cc'; ctx.fillText(f.g.name.slice(0, 10), x + 4, y + ty);
    const bx = x + 36, bw = 44;
    if (gone) {
      const slain = f.fate === 'dead' && (f.revealed || !f.revealAt);
      ctx.fillStyle = slain ? '#e2695c' : '#c9b9a0';
      ctx.fillText(slain ? 'SLAIN' : f.yielded ? 'YIELDED' : 'DOWN', bx, y + ty);
      continue;
    }
    const by = many ? y + 1 : y + 2, sy = many ? y + 4 : y + 6, bh = many ? 2 : 3;
    ctx.fillStyle = '#3a1512'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = B.col[f.team]; ctx.fillRect(bx, by, Math.ceil(bw * f.hp / f.maxHp), bh);
    ctx.fillStyle = '#2a2418'; ctx.fillRect(bx, sy, bw, 1);
    ctx.fillStyle = f.charge >= 100 ? '#fff0b0' : '#e0aa3e'; ctx.fillRect(bx, sy, Math.ceil(bw * f.charge / 100), 1);
    let px = bx + bw + 2;
    const pip = col => { ctx.fillStyle = col; ctx.fillRect(px, many ? y + 1 : y + 3, 2, 3); px += 3; };
    if (f.bleed > 0) pip('#ff3a2a');
    if (f.hamstrung) pip('#ffd24a');
    if (f.armWound) pip('#ff9a3a');
  }
}

function drawSpectator(ctx, p, up) {
  ctx.fillStyle = p.col; ctx.fillRect(p.x, p.y - 5 - up, 4, 5);
  ctx.fillStyle = p.colD; ctx.fillRect(p.x, p.y - 2 - up, 4, 2 + up);
  ctx.fillStyle = p.skin; ctx.fillRect(p.x, p.y - 8 - up, 3, 3);
  ctx.fillStyle = p.hair; ctx.fillRect(p.x, p.y - 9 - up, 3, 1);
  if (up && p.arms) { ctx.fillStyle = p.skin; ctx.fillRect(p.x - 1, p.y - 10 - up, 1, 4); ctx.fillRect(p.x + 4, p.y - 10 - up, 1, 4); }
}

const ARENA_TORCHES = [24, 132, 294, 402];      // x of each wall torch, in sprite pixels

// Everything that does not move is painted once per fight onto its own canvas (428x240 sprite pixels).
// A fight outside the walls has no stands and no wall: trees, rock, a palisade or old stones, and open ground.
function renderWild(B) {
  const cv = document.createElement('canvas'); cv.width = 428; cv.height = 240;
  const ctx = cv.getContext('2d'), k = B.wild;
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const h = i => Math.abs(Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1;
  const ground = { forest: '#6f8a45', rock: '#8f8a78', camp: '#8a7650', ruin: '#7f8a55' }[k] || '#6f8a45';
  for (let y = 0; y < 44; y += 4) R(0, y, 428, 4, shade('#a9c8dc', 0.86 + y / 300));                     // sky
  for (let x = 0; x < 428; x += 2) { const t = 34 + Math.round(Math.sin(x * 0.021) * 7 + Math.sin(x * 0.05 + 2) * 4); R(x, t, 2, 60 - t, '#7f9a8a'); }   // far hills
  for (let x = 0; x < 428; x += 2) { const t = 50 + Math.round(Math.sin(x * 0.034 + 1) * 6 + Math.sin(x * 0.09) * 3); R(x, t, 2, 40, '#5f7f5a'); }
  R(0, 78, 428, 162, ground);
  for (let i = 0; i < 520; i++) R(h(i) * 426, 84 + h(i + 900) * 154, 1 + Math.round(h(i + 5) * 2), 1, shade(ground, i % 2 ? 0.88 : 1.12));
  const tree = (x, y, s) => { R(x - 2 * s, y - 16 * s, 4 * s, 16 * s, '#4a3320'); R(x - 2 * s, y - 16 * s, s, 16 * s, '#33230f'); for (const [ox, oy, r, c] of [[0, -30, 15, '#2f5226'], [-9, -22, 11, '#35602b'], [9, -24, 12, '#2a4a22'], [-2, -34, 9, '#4a7a36']]) for (let yy = -r; yy <= r; yy++) { const hw = Math.round(r * Math.sqrt(1 - yy * yy / (r * r))) * s; R(x + ox * s - hw, y + (oy + yy) * s, hw * 2, s, c); } };
  if (k === 'forest') { for (let i = 0; i < 16; i++) tree(10 + i * 28 + h(i) * 10, 80 + h(i + 3) * 8, 1); for (let i = 0; i < 22; i++) { const x = h(i + 60) * 420; R(x, 80 + h(i + 70) * 6, 9, 5, '#3f6a30'); R(x + 1, 79 + h(i + 70) * 6, 6, 2, '#57863a'); } }
  else if (k === 'rock') {
    for (let x = 0; x < 428; x += 3) { const t = 22 + Math.round(Math.sin(x * 0.03) * 9 + h(x) * 6); R(x, t, 3, 64 - t + 20, '#77705f'); R(x, t, 3, 2, '#a39c88'); if (h(x + 7) > 0.7) R(x, t + 6 + h(x) * 30, 1, 10, '#5d5749'); }
    R(176, 46, 76, 40, '#1a1410'); R(182, 40, 64, 8, '#1a1410'); R(190, 36, 48, 5, '#1a1410'); R(172, 84, 84, 3, '#5d5749');
    for (let i = 0; i < 9; i++) { const x = 20 + h(i + 20) * 390; R(x, 82 + h(i) * 10, 12, 6, '#77705f'); R(x, 82 + h(i) * 10, 12, 1, '#a39c88'); }
  } else if (k === 'camp') {
    for (let x = 0; x < 428; x += 6) { const t = 52 + Math.round(h(x) * 6); R(x, t, 5, 86 - t, '#6b4f2c'); R(x, t, 1, 86 - t, '#4a3620'); R(x + 1, t - 3, 3, 3, '#6b4f2c'); }
    R(190, 58, 48, 28, '#2a1d12');
    for (const tx of [70, 330]) { for (let i = 0; i < 26; i++) R(tx - i, 60 + i, i * 2, 1, i % 6 < 3 ? '#b8a880' : '#a09068'); R(tx - 4, 72, 8, 14, '#2a1d12'); }
    R(206, 92, 16, 3, '#3a2a1c'); R(210, 86, 8, 6, '#e2702a'); R(212, 84, 4, 4, '#f5c04a');
  } else {
    for (let i = 0; i < 9; i++) tree(24 + i * 50, 76 + h(i) * 6, 1);
    for (const [x, hh] of [[60, 44], [120, 30], [178, 52], [250, 52], [310, 24], [368, 40]]) { R(x, 86 - hh, 12, hh, '#c9c3ae'); R(x, 86 - hh, 3, hh, '#a8a290'); R(x - 2, 86 - hh, 16, 3, '#dcd6c2'); R(x - 2, 83, 16, 3, '#b5af9b'); }
    R(176, 30, 88, 6, '#c9c3ae'); R(176, 30, 88, 1, '#e4dfcd'); R(280, 88, 46, 7, '#b5af9b'); R(284, 86, 30, 3, '#c9c3ae');
  }
  for (let i = 0; i < 5; i++) R(0, 78 + i * 4, 428, 4, `rgba(20,30,10,${(0.3 * (1 - i / 5)).toFixed(3)})`);
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
  for (let y = 23; y <= 65; y += 9) { R(0, y, 428, 1, th.step); R(0, y + 1, 428, 1, shade(th.step, 0.8)); }
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
  for (const s of B.specks) R(s.x, s.y, s.w, 1, s.c ? sd : sl);
  // the wall's shade falls across the near sand, further when the sun is low
  const bands = B.light === 'dusk' ? 9 : 5;
  for (let i = 0; i < bands; i++) R(0, 86 + i * 4, 428, 4, `rgba(50,28,8,${(0.34 * (1 - i / bands)).toFixed(3)})`);
  // torch brackets along the wall; the flames are drawn live
  for (const x of ARENA_TORCHES) { R(x, 70, 2, 9, '#3a2a1c'); R(x - 2, 69, 6, 2, '#5a4334'); }
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
      for (let i = 0; i < 7; i++) { const q = i / 6; ctx.globalAlpha = a * q * 0.5; R((v.x + (v.x2 - v.x) * q) * 2 - 5, (v.y + (v.y2 - v.y) * q) * 2 - 34, 10, 30, v.col); R((v.x + (v.x2 - v.x) * q) * 2 - 8, (v.y + (v.y2 - v.y) * q) * 2 - 2, 16, 2, '#ead2a0'); }
    } else if (v.k === 'arc') {                // the sweep of a blade: a crescent that opens and fades
      const rad = 12 + v.size * 9, th = v.size > 1.4 ? 4 : 3, from = -1.25, span = 2.5 * Math.min(1, k * 2.2 + 0.25);
      ctx.globalAlpha = a;
      for (let i = 0; i <= 12; i++) { const an = from + span * (i / 12), px = v.x * 2 + v.dir * (Math.cos(an) * rad - rad * 0.55), py = v.y * 2 - 24 + Math.sin(an) * rad * 1.15; R(px, py, th, th, i > 8 ? '#ffffff' : v.col); if (v.size > 1.2) R(px - v.dir * 2, py, th, th, v.col2 || v.col); }
    } else if (v.k === 'motes' && v.f && !out(v.f)) {      // sparks rising round him
      for (let i = 0; i < 9; i++) { const up = (k * 46 + i * 11) % 44; ctx.globalAlpha = a * (1 - up / 50); R(v.f.x * 2 + Math.sin(i * 2.4 + k * 3) * 11, v.f.y * 2 - 4 - up, 2, 2, v.col); }
    } else if (v.k === 'flash') {              // the sand lights for an instant under a great blow
      ctx.globalAlpha = a * 0.5; for (let i = 0; i < 4; i++) R(v.x * 2 - 22 + i * 3, v.y * 2 - 3 + i, 44 - i * 6, 2, v.col);
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
  const shx = B.shake > 0.2 ? Math.round(rand(-1, 1) * B.shake) * SCALE : 0;
  const shy = B.shake > 0.2 ? Math.round(rand(-1, 1) * B.shake * 0.6) * SCALE : 0;

  // the camera closes in on the blow that ends it, then draws back for the verdict
  const cam = B.cam || (B.cam = { z: 1, x: 214, y: 120, t: performance.now() });
  const now = performance.now(), cdt = Math.min(0.1, (now - cam.t) / 1000), ck = 1 - Math.pow(0.004, cdt);
  cam.t = now;
  const want = B.over && B.finish && B.outro < 0.55 ? 1.5 : 1;
  if (want > 1) { cam.tx = B.finish.x * 2; cam.ty = B.finish.y * 2 - 16; if (cam.z === 1) { cam.x = cam.tx; cam.y = cam.ty; } }
  cam.z += (want - cam.z) * ck; if (Math.abs(cam.z - want) < 0.004) cam.z = want;
  if (cam.tx != null) { cam.x += (cam.tx - cam.x) * ck; cam.y += (cam.ty - cam.y) * ck; }
  const cz = cam.z, CW = ctx.canvas.width, CH = ctx.canvas.height;
  const cox = cz === 1 ? 0 : clamp(CW / 2 - cam.x * FINE * cz, CW - 428 * FINE * cz, 0), coy = cz === 1 ? 0 : clamp(CH / 2 - cam.y * FINE * cz, CH - 240 * FINE * cz, 0);
  const view = unit => ctx.setTransform(unit * cz, 0, 0, unit * cz, cox + shx, coy + shy);

  // ---- sprite-pixel layer: backdrop, crowd, blood, fighters ----
  view(FINE);
  if (!B._bg) B._bg = renderBackdrop(B);
  ctx.drawImage(B._bg, 0, 0);
  showBack(ctx, B, T);        // the crowd, the editor, banners, blood and litter on the sand, heat haze (show.js)

  const dusk = B.light === 'dusk';
  const shadow = dusk ? { len: 16, a: 0.3 } : { len: 5, a: 0.22 };
  const flat = f => f.down && f.fallT <= 0;
  drawVfx(ctx, B, true);
  const sorted = B.fighters.slice().sort((a, b) => (flat(a) === flat(b) ? a.y - b.y : flat(a) ? -1 : 1));
  for (const f of sorted) {
    drawSprite(ctx, {
      x: f.x * 2, y: f.y * 2, facing: f.facing, g: f.g, team: f.team, col: B.col[f.team], colD: B.colD[f.team],
      moving: f.moving, walk: f.walk, clock: T + f.walk, atkAnim: f.atkAnim,
      windup: f.state === 'windup', windP: f.t0 ? clamp(1 - f.t / f.t0, 0, 1) : 1,
      recoil: clamp(Math.abs(f.kx) / 40, 0, 1), shadow,
      bash: f.state === 'windup' && f.move === 'bash', guard: f.guard,
      flash: f.flash, down: f.down, falling: f.fallT > 0, yielded: f.yielded, snare: f.snare, slash: f.slash,
      cheer: (B.over && !out(f) && f.team === B.winner && B.slowmo <= 0) || f.flourish > 0 ? T + f.walk : 0,
      noHelm: f.noHelm, hurt: f.g.beast ? 0 : f.hp < f.maxHp * 0.3 ? 3 : f.hp < f.maxHp * 0.55 ? 2 : f.hp < f.maxHp * 0.8 ? 1 : 0,
      hamstrung: f.hamstrung, armWound: f.armWound, shieldDmg: f.shieldHits >= 9 ? 2 : f.shieldHits >= 4 ? 1 : 0,
    });
  }
  drawVfx(ctx, B, false);
  drawAuras(ctx, B, T);
  for (const p of B.parts) { ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x * 2), Math.round((p.y - p.h) * 2), 2, 2); }
  showFront(ctx, B, T);       // dust, things thrown from the stands

  // ---- light: the colour of the hour, torches, darkened edges, the flash of a telling blow ----
  if (dusk) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#f4b68c'; ctx.fillRect(0, 0, 428, 240); ctx.fillStyle = 'rgba(70,60,110,.35)'; ctx.fillRect(0, 0, 428, 66); ctx.globalCompositeOperation = 'source-over'; }
  for (const x of B.wild ? [] : ARENA_TORCHES) {
    const fl = Math.sin(T * 13 + x) > 0 ? 1 : 0;
    if (dusk) {                       // lit: a flame, a halo, and a pool of light on the sand below
      ctx.globalCompositeOperation = 'lighter';
      const k = 0.85 + Math.sin(T * 9 + x) * 0.15;
      for (let i = 0; i < 7; i++) { const r = 34 - i * 4; ctx.fillStyle = `rgba(255,150,60,${(0.035 * k).toFixed(3)})`; ctx.fillRect(x + 1 - r, 66 - r * 0.7, r * 2, r * 1.4); }
      for (let i = 0; i < 7; i++) { const w = 62 - i * 8, h = 26 - i * 3; ctx.fillStyle = `rgba(255,170,80,${(0.028 * k).toFixed(3)})`; ctx.fillRect(x + 1 - w / 2, 87 + i, w, h); }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#e2702a'; ctx.fillRect(x - 1, 63 - fl, 4, 6 + fl); ctx.fillStyle = '#f5c04a'; ctx.fillRect(x, 64 - fl, 2, 4); ctx.fillStyle = '#fff0b0'; ctx.fillRect(x, 66, 1, 2);
    } else { ctx.fillStyle = '#2a1c14'; ctx.fillRect(x - 1, 66, 4, 3); }
  }
  for (let i = 0; i < 4; i++) {       // the edges fall away into shade
    ctx.fillStyle = `rgba(20,10,4,${(0.05 * (dusk ? 1.6 : 1)).toFixed(3)})`;
    ctx.fillRect(0, 86, 14 - i * 3, 154); ctx.fillRect(428 - 14 + i * 3, 86, 14 - i * 3, 154); ctx.fillRect(0, 240 - 10 + i * 2, 428, 10 - i * 2);
  }
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
  for (const f of B.fighters) {
    if (out(f) || B.intro > 0) continue;
    const fx = f.x * Z, x = Math.round(fx) - 7, y = Math.round(f.y * Z) - Math.round(f.tall * FINE / SCALE) - 4, ny = y - 3 - f.team * 6;
    ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, 16, 5);
    ctx.fillStyle = '#3a1512'; ctx.fillRect(x, y, 14, 2);
    ctx.fillStyle = B.col[f.team]; ctx.fillRect(x, y, Math.ceil(14 * f.hp / f.maxHp), 2);
    ctx.fillStyle = f.charge >= 100 ? '#fff0b0' : '#e0aa3e'; ctx.fillRect(x, y + 2, Math.ceil(14 * f.charge / 100), 1);
    let px = x + 16;
    const pip = col => { ctx.fillStyle = '#000'; ctx.fillRect(px, y - 1, 4, 4); ctx.fillStyle = col; ctx.fillRect(px + 1, y, 2, 2); px += 4; };
    if (f.bleed > 0) pip('#ff3a2a');
    if (f.hamstrung) pip('#ffd24a');
    if (f.armWound) pip('#ff9a3a');
    if (f.open > 0) pip('#e8d7a0');
    if (f.buff) pip('#6aa8ff');
    if (f.weakT > 0) pip('#8a7a66');
    if (B.fighters.length > 2) continue;   // in team fights the corner panels carry the names
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(f.g.name, fx + 0.4, ny + 0.4);
    ctx.fillStyle = f.team ? '#bcd6ff' : '#ffd9d2'; ctx.fillText(f.g.name, fx, ny);
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
    ctx.font = t.big ? 'bold 8px Cinzel, Georgia, serif' : 'bold 6px Consolas, monospace';
    ctx.globalAlpha = Math.min(1, t.life * 2.5);
    ctx.fillStyle = '#000'; ctx.fillText(t.str, t.x * Z + 0.5, t.y * Z + 0.5);
    ctx.fillStyle = t.col; ctx.fillText(t.str, t.x * Z, t.y * Z);
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

  drawHud(ctx, B);

  // running commentary, top centre
  ctx.textAlign = 'center';
  ctx.font = 'bold 5px Consolas, monospace';
  let fy = 8;
  for (const l of B.feed.slice(-4)) {
    if (l.life <= 0) continue;
    ctx.globalAlpha = Math.min(1, l.life);
    const w = ctx.measureText(l.str).width;
    ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(160 - w / 2 - 4, fy - 5, w + 8, 7);
    ctx.fillStyle = B.col[l.team]; ctx.fillRect(160 - w / 2 - 4, fy - 5, 2, 7);
    ctx.fillStyle = '#f2e6cc'; ctx.fillText(l.str, 160, fy);
    fy += 8;
  }
  ctx.globalAlpha = 1;

  // entrance banner
  if (B.intro > 0) {
    const label = t => {
      const fs = B.fighters.filter(f => f.team === t);
      if (fs.length === 1 && fs[0].g.beast) return 'A ' + fs[0].c.name.toLowerCase();
      return fs.length === 1 ? `${fs[0].g.name} the ${fs[0].c.name}` : (B.names ? B.names[t] : fs.map(f => f.g.name).join(', '));
    };
    ctx.globalAlpha = Math.min(1, B.intro / 0.4);
    ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(0, 66, 320, 22);
    ctx.fillStyle = '#e0aa3e'; ctx.fillRect(0, 66, 320, 1); ctx.fillRect(0, 87, 320, 1);
    ctx.font = 'bold 8px Cinzel, Georgia, serif';
    ctx.textAlign = 'right'; ctx.fillStyle = '#ff9a8a'; ctx.fillText(label(0), 148, 80);
    ctx.textAlign = 'left'; ctx.fillStyle = '#9cc4ff'; ctx.fillText(label(1), 172, 80);
    ctx.textAlign = 'center'; ctx.font = 'bold 6px Cinzel, Georgia, serif';
    ctx.fillStyle = '#e0aa3e'; ctx.fillText('VS', 160, 80);
    ctx.globalAlpha = 1;
  }

  // crowd meter
  ctx.textAlign = 'center';
  ctx.font = 'bold 5px Consolas, monospace';
  if (!B.wild) {                 // nobody is watching out here
    ctx.fillStyle = '#000'; ctx.fillRect(109, 172, 102, 5);
    ctx.fillStyle = '#3a2a22'; ctx.fillRect(110, 173, 100, 3);
    ctx.fillStyle = '#e0aa3e'; ctx.fillRect(110, 173, Math.round(100 * clamp(B.exc, 0, 1)), 3);
    ctx.fillStyle = '#3a2a22'; ctx.fillText('CROWD', 160, 170);
  }
  if (B.death && B.intro <= 0) { ctx.fillStyle = '#8e1b14'; ctx.fillText('SINE MISSIONE', 160, 72); }
  if (B.pick && !out(B.pick)) {                     // the man the fight has stopped for
    const f = B.pick, px = Math.round(f.x * Z), py = Math.round(f.y * Z);
    ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1; ctx.strokeRect(px - 9.5, py - Math.round(f.tall * FINE / SCALE) - 1.5, 19, Math.round(f.tall * FINE / SCALE) + 4);
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(100, 160, 120, 9);
    ctx.fillStyle = '#ffd24a'; ctx.fillText(`${f.g.name.toUpperCase()} IS READY: CHOOSE`, 160, 166.5);
  }

  if (B.over) {
    ctx.font = 'bold 16px Cinzel, Georgia, serif';
    const msg = B.winner === 0 ? 'VICTORY' : 'DEFEAT';
    ctx.fillStyle = '#000'; ctx.fillText(msg, 161, 83);
    ctx.fillStyle = B.winner === 0 ? '#ffd24a' : '#e2695c'; ctx.fillText(msg, 160, 82);
  }
}
