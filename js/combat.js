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
    parts: [], stains: [], texts: [], projs: [], feed: [], log: [], crowd: [], specks: [], props: [], vfx: [],
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
      const far = 1 - (64 - y) / 42 * 0.3, col = shade(pick(cols), far), skin = shade(pick(ORIGINS).skin, far);      // the rows further up are further off, and dimmer
      const look = Math.random();
      B.crowd.push({ x: x + rint(-1, 1), y, col, colD: shade(col, 0.7), skin, skinD: shade(skin, 0.78), hair: shade(pick(hairs), far), ph: rand(0, 6.28), sp: rand(3, 9), arms: chance(0.5),
        hat: look < 0.12, veil: look >= 0.12 && look < 0.26, long: look >= 0.26 && look < 0.45, small: look > 0.93 });
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

// A man has been killed: everything stops, and the death is shown on its own (drawFatal). Only where the fight is being
// watched and such things are wanted (B.cutins), only for men, and in a crowd only for your own and for the first.
function fatal(B, d, by) {
  if (!B.cutins || B.fatal || d.g.beast) return;
  if (B.fighters.length > 6 && d.team !== 0 && B.fatalSeen) return;
  B.fatalSeen = true;
  B.fatal = { f: d, by: by && by !== d ? by : null, t: 0, dur: 3.1 };
  snd(B, 'cutin', 0.8, d);
}
function knockDown(B, d, a, how) {
  d.hp = 0; d.down = true; d.downedBy = a || d.downedBy; d.state = 'ready'; d.bleed = 0; B.lastDown = d;
  d.fallT = 0.35; snd(B, 'down', 1, d);
  B.exc += 0.2 * (a ? a.show : 1);
  B.hitstop = 0.12; B.shake = 3; B.flashT = 0.12;
  fxBlood(B, d, 16, a ? a.facing : 1);
  fxDust(B, d.x, d.y, 8);
  for (let i = 0; i < 10; i++) B.stains.push({ x: d.x + rand(-7, 7), y: d.y + rand(-2, 3), w: rint(1, 3), t: B.clock });
  feed(B, how || `${d.g.name} is struck down${a ? ' by ' + a.g.name : ''}`, d.team);
  if (B.death) fatal(B, d, a || d.downedBy);          // in a bout to the death, down is dead
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
  a.dmgDealt += dmg; d.dmgTaken += dmg; if (dmg > a.best) a.best = dmg;
  if (o.ability && a.ablEntry) {                // the line that named his ability now says what it did
    const e = a.ablEntry; e.dmg = (e.dmg || 0) + dmg; (e.who = e.who || {})[d.g.name] = 1;
    const who = Object.keys(e.who);
    e.str = `${e.base}: ${e.dmg} to ${who.length > 1 ? who.length + ' foes' : who[0]}${blocked ? ' (blocked)' : ''}`; e.life = Math.max(e.life, 4.5);
  } else if (!o.ability) {
    if (!B.firstBlood && !blocked) { B.firstBlood = true; feed(B, `First blood to ${a.g.name}`, a.team, 'hit'); }
    else if (crit && !blocked && dmg >= d.maxHp * 0.12 && d.hp > 0) feed(B, `${a.g.name} lands a telling blow on ${d.g.name}: ${dmg}`, a.team, 'hit');
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
  B.cardAt = B.outroEnd - 0.3; B.outroEnd += 3.2;                // and then the reckoning of it is shown, before the sand is left
}

function stepOutro(B, dt) {
  const was = B.outro;
  B.outro += dt;
  if (was < 0.55 && B.outro >= 0.55) { B.shake = 2.5; B.flashT = B.winner === 0 ? 0.12 : 0; snd(B, 'cutin', 0.6); }      // the word of it lands
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
      fatal(B, f, f.downedBy);
    }
  }
}

function stepIntro(B, dt) {
  const was = B.introDur - B.intro;
  B.intro -= dt;
  const ti = B.introDur - B.intro, at = v => was < v && ti >= v;
  for (const f of B.fighters) {
    const dx = f.markX - f.x, moved = f.moving;
    f.moving = Math.abs(dx) > 0.5;
    if (f.moving) { f.x += Math.sign(dx) * Math.min(Math.abs(dx), 30 * dt); f.walk += dt * 8; if (Math.random() < dt * 5) fxDust(B, f.x, f.y, 1); }
    else if (moved && !f.g.beast) f.flourish = 1.1;                       // on his mark, he salutes the stands
    f.flourish = Math.max(0, f.flourish - dt);
  }
  if (at(0.75)) { snd(B, 'cutin', 0.7); B.shake = 2; B.flashT = 0.1; }    // the two halves of the card meet
  if (B.intro <= 0) {
    B.fighters.forEach(f => { f.x = f.markX; f.moving = false; f.flourish = 0; });
    B.texts.push({ x: 107, y: 64, str: B.wild ? 'AT THEM!' : 'PUGNATE!', col: '#ffd24a', life: 1.3, big: true });
    B.shake = 2.5; B.flashT = 0.12;
    for (const f of B.fighters) vfx(B, { k: 'ring', under: true, x: f.x, y: f.y, r: 14, r0: 3, col: '#f2e2b8', dur: 0.4, a: 0.7 });
    snd(B, 'start');
  }
}

function stepBattle(B, dt) {
  if (B.fatal) {                              // a death is being shown: nothing else moves until it has been
    const was = B.fatal.t; B.fatal.t += dt;
    if (was < 0.55 && B.fatal.t >= 0.55) { snd(B, 'down', 1, B.fatal.f); snd(B, 'killed', 0.8, B.fatal.f); }
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
    if (!B.cut.struck && B.cut.t >= B.cut.ts && B.cutins) { B.cut.struck = true; snd(B, 'hop', 0.7, B.cut.f); }
    if (B.cut.t < B.cut.dur && B.cutins) return;
    const c = B.cut; B.cut = null;
    if (!out(c.f)) castNow(B, c.f, c.ab);
  }
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
    drawSprite(ctx, Object.assign({}, o, { x: x + P.gx * i * 7, y: y + P.gy * i * 7 - P.lift, shadow: none, flash: 0 }));
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
const SPRITE_EDGE = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function drawSprite(ctx, o) {
  if (o.g.beast) { drawBeast(ctx, o); return; }
  if (!o.plain) {
    const edge = Object.assign({}, o, { solid: 'rgba(30,18,9,.62)', shadow: { len: 0, a: 0 } });
    for (const [dx, dy] of SPRITE_EDGE) { edge.x = o.x + dx; edge.y = o.y + dy; drawSpriteBody(ctx, edge); }
  }
  drawSpriteBody(ctx, o);
}
function drawSpriteBody(ctx, o) {
  // o: {x,y,facing,g,team,col,colD,moving,walk,clock,atkAnim,windup,windP,recoil,bash,guard,flash,down,falling,yielded,snare,cheer,shadow,solid}
  const g = o.g, c = CLASSES[g.cls], cls = g.cls, d = o.facing;
  const look = gearLook(g), armorT = look.armor, weaponT = look.weapon;
  const X = Math.round(o.x), Y = Math.round(o.y) - (o.cheer && Math.sin(o.cheer * 9) > 0.3 ? 2 : 0);
  const white = o.flash > 0;
  let lean = 0;       // sideways shift of everything above the hips: into a blow, back from a hit
  const P = (x, y, w, h, col) => { ctx.fillStyle = o.solid || (white ? '#fff' : col); ctx.fillRect(d > 0 ? X + x + lean : X - x - w - lean, Y + y, w, h); };
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
  const helmed = (cls === 'murmillo' || cls === 'thraex' || cls === 'hoplomachus') && !o.noHelm;
  const manica = cls === 'murmillo' || cls === 'thraex' || cls === 'retiarius' || look.arms;
  const plated = look.armsT >= 2;                 // a good arm guard is scaled metal, not wrapped linen
  const arm = plated ? shade(metalOf(look.armsT), 0.92) : manica ? '#cfc4a6' : skin, armD = plated ? shade(metalOf(look.armsT), 0.62) : manica ? '#a2977a' : skinD;
  const seed = g.id * 7919 % 97;

  // shadow: a pool under the feet, drawn out along the ground when the light is low
  const sh = o.shadow || { len: 0, a: 0.2 };
  ctx.fillStyle = `rgba(0,0,0,${o.solid ? 0 : sh.a})`;
  ctx.fillRect(X - 9, Y - 2, 18 + sh.len, 3); ctx.fillRect(X - 6, Y + 1, 12 + sh.len, 1);
  if (!o.solid) { ctx.fillStyle = `rgba(0,0,0,${(sh.a * 0.9).toFixed(3)})`; ctx.fillRect(X - 5, Y - 1, 10, 2); ctx.fillStyle = `rgba(0,0,0,${sh.a})`; }      // darkest right under his feet
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
    } else {                             // feathers
      P(-1, -42 + by, 2, 4, '#f0ead8'); P(-3, -41 + by, 2, 3, '#f0ead8'); P(1, -40 + by, 2, 2, '#d8d0b8');
      P(-1 + sway, -44 + by, 2, 2, '#f0ead8'); P(-3 + sway, -43 + by, 2, 2, '#f0ead8'); P(1 + sway, -42 + by, 2, 2, '#d8d0b8');
      P(-1 + sway, -45 + by, 2, 1, team); P(-3 + sway, -44 + by, 2, 1, team); P(1 + sway, -43 + by, 2, 1, team); P(-5, -41 + by, 2, 3, '#d8d0b8');
    }
  } else {
    P(-3, -36 + by, 7, 7, skin); P(-3, -30 + by, 7, 1, skinD); P(-3, -36 + by, 1, 7, skinD);
    P(2, -34 + by, 1, 1, Math.sin((o.clock || 0) * 1.3 + seed) > 0.975 ? skinD : ink); P(1, -35 + by, 3, 1, shade(hair, 0.8));      // he blinks P(4, -33 + by, 1, 1, skin); P(2, -31 + by, 2, 1, skinD); P(-1, -34 + by, 1, 2, skinD);
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
    if (striking && o.atkAnim > 0.55 && !o.solid) {          // the sweep of the blow: a fading trail from the wind-up to the strike
      const reach = long ? 16 : c.weapon === 'gladius' ? 9 : 7;
      for (let i = 1; i <= 5; i++) {
        const t = i / 6, m = mix(K.windup, K.strike, t), n = Math.hypot(m.v[0], m.v[1]) || 1;
        P(Math.round(m.h[0] + m.v[0] / n * reach), Math.round(m.h[1] + by + m.v[1] / n * reach - Math.sin(t * Math.PI) * 3), 2, 2, `rgba(255,255,255,${(0.1 + t * 0.5).toFixed(2)})`);
      }
      P(Math.round(tx) + 1, Math.round(ty) - 3, 1, 7, 'rgba(255,255,255,.8)');
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
  if (o.snare > 0 && !o.solid) {
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

// A beast, with the same dark line round it as a fighter has. Each kind has its own head, ears, tail and markings;
// what they share is a rounded body on BEAST_ART's measures, legs that step in diagonal pairs, a mouth that opens
// to strike, and wounds that show.
function drawBeast(ctx, o) {
  if (!o.plain && !o.solid) {
    const edge = Object.assign({}, o, { solid: 'rgba(30,18,9,.62)' });
    for (const [dx, dy] of SPRITE_EDGE) { edge.x = o.x + dx; edge.y = o.y + dy; drawBeast(ctx, edge); }
  }
  const kind = o.g.cls, a = BEAST_ART[kind], d = o.facing, X = Math.round(o.x), Y = Math.round(o.y), T = o.clock || 0;
  const white = o.flash > 0;
  const P = (x, y, w, h, col) => { ctx.fillStyle = o.solid || (white ? '#fff' : col); ctx.fillRect(d > 0 ? X + x : X - x - w, Y + y, w, h); };
  const col = a.col, colD = shade(col, 0.7), colDD = shade(col, 0.52), colL = shade(col, 1.22), ink = '#1c1310', hb = Math.floor(a.bw / 2);
  const belly = { boar: shade(col, 0.85), wolf: '#c9ccd2', lion: '#e3c486', bear: shade(col, 0.82) }[kind];
  const eye = { boar: '#c23b2e', wolf: '#e8c84a', lion: '#e8a83a', bear: '#1c1310' }[kind];
  const seed = o.g.id * 7919 % 97;
  if (!o.solid) { ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(X - hb - 2, Y - 2, a.bw + 8, 3); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(X - hb + 1, Y - 1, a.bw + 2, 2); }

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
    if (claws && !o.solid) P(x + Math.sign(swing) + lw + (swing > 0 ? 1 : 0), -1 - lift, 1, 1, '#f2ecd8');
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
  if (o.solid) return;                           // what follows is light and net, not part of the outline
  if (o.slash > 0) { P(hx + hw + 4, hy, 1, hh + 2, '#ffffff'); P(hx + hw + 6, hy + 1, 1, hh, 'rgba(255,255,255,.6)'); if (claws) P(hx + hw + 8, hy + 2, 1, hh - 2, 'rgba(255,255,255,.35)'); }
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
    lines.forEach(([str, c], i) => { ctx.fillStyle = 'rgba(20,10,4,.7)'; ctx.fillText(str, tx + 0.6, 79.6 + i * 7); ctx.fillStyle = c; ctx.fillText(str, tx, 79 + i * 7); });
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
  if (ti > 1.6 && !o) { ctx.globalAlpha = 0.5; ctx.font = '4px Consolas, monospace'; ctx.textAlign = 'right'; ctx.fillStyle = '#e8dcc0'; ctx.fillText('CLICK TO SKIP', 316, 176); ctx.globalAlpha = 1; }
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
    for (let i = 0; i < 12; i++) { const an = i / 12 * 6.283 + T * 0.15, w = 0.07; ctx.fillStyle = i % 2 ? 'rgba(255,226,122,.16)' : 'rgba(255,246,220,.10)'; ctx.beginPath(); ctx.moveTo(160, 54); ctx.lineTo(160 + Math.cos(an - w) * 260, 54 + Math.sin(an - w) * 260); ctx.lineTo(160 + Math.cos(an + w) * 260, 54 + Math.sin(an + w) * 260); ctx.closePath(); ctx.fill(); }
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
      ctx.fillStyle = pop > 0.4 ? '#ffffff' : won ? '#ffd24a' : '#e2695c'; ctx.fillText(msg[i], x, y);
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
    if (B.endWord) { ctx.fillStyle = won ? '#f1e6c8' : '#d8b0a8'; ctx.fillText(B.endWord, 160, 64.2); }
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
    if (o > B.cardAt + 1) { ctx.globalAlpha = 0.5 + 0.3 * Math.sin(T * 5); ctx.font = '4px Consolas, monospace'; ctx.textAlign = 'right'; ctx.fillStyle = '#e8dcc0'; ctx.fillText('CLICK TO GO ON', cx + cw - 3, cy + 6); ctx.globalAlpha = 1; }
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
  const vx = by ? 196 : 160, kx = 118, fallen = hit > 0.22;
  if (hit > 0.3) { const pw = Math.min(46, (hit - 0.3) * 60); ctx.fillStyle = '#c2180e'; ctx.fillRect(vx - pw, 137, pw * 2, 2); ctx.fillStyle = '#7a0c08'; ctx.fillRect(vx - pw * 0.8, 139, pw * 1.6, 1.5); }
  // the two of them, as shadows: he who struck, and he who took it
  const shadow = (o, x, face, extra) => {
    ctx.save(); ctx.translate(Math.round(x), 136); ctx.scale(1.9, 1.9);
    drawSprite(ctx, Object.assign({ x: 0, y: 0, facing: face, g: o.g, team: o.team, col: '#000', colD: '#000', moving: false, walk: 0, clock: 0, atkAnim: 0, flash: 0, down: false, snare: 0, slash: 0, shadow: { len: 0, a: 0 }, noHelm: o.noHelm, solid: '#070202' }, extra));
    ctx.restore();
  };
  if (by) shadow(by, kx + (hit >= 0 ? Math.min(10, hit * 60) : -cl(t / 0.5) * 4), 1, hit < 0 ? { windup: true, windP: cl(t / 0.5) } : { atkAnim: Math.max(0.6, 1 - hit) });
  shadow(f, vx + (hit >= 0 ? Math.min(6, hit * 30) : 0), by ? -1 : 1, hit < 0 ? {} : fallen ? { down: true } : { falling: true, recoil: 1 });
  // the blow: a white stroke through him that goes red, and what it throws out
  if (hit >= 0 && hit < 0.45) {
    const k = hit / 0.45;
    for (const [w, col] of [[7, '#c2180e'], [3, k < 0.35 ? '#ffffff' : '#ff6a4a']]) {
      ctx.globalAlpha = a * (1 - k); ctx.strokeStyle = col; ctx.lineWidth = w * (1 - k * 0.5);
      ctx.beginPath(); ctx.moveTo(vx - 34, 62); ctx.quadraticCurveTo(vx + 6, 96, vx + 30, 134); ctx.stroke();
    }
    ctx.globalAlpha = a;
  }
  if (hit >= 0) for (let i = 0; i < 34; i++) {
    const an = -2.6 + h(i) * 2.1, sp = 40 + h(i + 50) * 130, tt = hit, px = vx + Math.cos(an) * sp * tt * (by ? 1 : (i % 2 ? 1 : -1)), py = 100 + Math.sin(an) * sp * tt + 210 * tt * tt;
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
    const k = cl(slam / 0.14), sc = 2.6 - 1.6 * k, word = 'HOC HABET!';
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
    const line = by ? `${nm(f)}  ${by.g.beast ? 'IS TORN DOWN BY' : 'IS SLAIN BY'}  ${nm(by)}` : `${nm(f)} IS DEAD`;
    ctx.globalAlpha = a * sa; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 8px Cinzel, Georgia, serif'; ctx.fillStyle = '#000'; ctx.fillText(line, 160.6, 156.6); ctx.fillStyle = '#ffe9dc'; ctx.fillText(line, 160, 156);
    const w = ctx.measureText(line).width; ctx.fillStyle = '#c2180e'; ctx.fillRect(160 - w / 2 * sa, 158.5, w * sa, 0.8);
    if (!f.g.beast) {                           // and what he was
      const wins = f.g.wins || 0, epi = `${f.c.name.toUpperCase()}   -   ${wins} ${wins === 1 ? 'VICTORY' : 'VICTORIES'}${f.g.kills ? `   -   ${f.g.kills} KILLED` : ''}`;
      ctx.font = 'bold 4.5px Consolas, monospace'; ctx.fillStyle = f.team === 0 ? '#ff9a8a' : '#c9a8a0'; ctx.fillText(epi, 160, 165);
    }
  }
  if (hit >= 0 && hit < 0.1) { ctx.globalAlpha = 1 - hit / 0.1; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 320, 180); }
  ctx.restore();
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
  if (t > 1.2 && !o2) { ctx.globalAlpha = 0.5; ctx.font = '4px Consolas, monospace'; ctx.textAlign = dir > 0 ? 'right' : 'left'; ctx.fillStyle = '#e8dcc0'; ctx.fillText('CLICK TO SKIP', dir > 0 ? 316 : 4, top - 5); ctx.globalAlpha = 1; }
  ctx.restore();
}

// The corner panels: one line a fighter. His style, his name, his health over his charge, and whatever ails or aids him.
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
function drawHud(ctx, B) {
  const rows = [0, 0], many = B.fighters.length > 10, rh = many ? 6 : 12, T = B.clock;
  ctx.font = 'bold 5px Consolas, monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  for (const f of B.fighters) {
    const x = f.team ? 222 : 2, y = 2 + rows[f.team]++ * rh, gone = out(f), ready = !gone && f.charge >= 100, frac = clamp(f.hp / f.maxHp, 0, 1), low = !gone && frac < 0.25;
    ctx.fillStyle = 'rgba(0,0,0,.74)'; ctx.fillRect(x, y, 96, rh - 1);
    ctx.fillStyle = B.col[f.team]; ctx.fillRect(x, y, 2, rh - 1);
    if (ready) { ctx.fillStyle = `rgba(255,210,74,${(0.18 + 0.14 * Math.sin(T * 9)).toFixed(3)})`; ctx.fillRect(x + 2, y, 94, rh - 1); }
    if (low) { ctx.fillStyle = `rgba(200,30,20,${(0.14 + 0.12 * Math.sin(T * 7)).toFixed(3)})`; ctx.fillRect(x + 2, y, 94, rh - 1); }
    if (!gone && f.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(x + 2, y, 94, rh - 1); }      // he has just been hit
    if (B.pick === f) { ctx.fillStyle = '#ffd24a'; ctx.fillRect(x, y, 96, 0.6); ctx.fillRect(x, y + rh - 1.6, 96, 0.6); }
    const nx = many ? x + 4 : x + 10;
    if (!many) { if (f.style) drawIcon(ctx, f.style, x + 3.5, y + 2.5, 0.5); else { ctx.fillStyle = '#6b5f50'; ctx.fillRect(x + 4.5, y + 5, 4, 1); } }
    ctx.textAlign = 'left'; ctx.fillStyle = gone ? '#8a7a66' : '#f2e6cc'; ctx.fillText(f.g.name.slice(0, many ? 10 : 9), nx, y + (many ? 4.5 : 5.5));
    const bx = x + 44, bw = many ? 48 : 37;
    if (gone) {
      const slain = f.fate === 'dead' && (f.revealed || !f.revealAt);
      ctx.fillStyle = slain ? '#e2695c' : '#c9b9a0';
      ctx.fillText(slain ? 'SLAIN' : f.yielded ? 'YIELDED' : 'DOWN', bx, y + (many ? 4.5 : 6.5));
      continue;
    }
    const by = many ? y + 1 : y + 2, bh = many ? 2 : 3, sy = many ? y + 4 : y + 7, sh = many ? 1 : 2;
    ctx.fillStyle = '#3a1512'; ctx.fillRect(bx, by, bw, bh);
    const lag = clamp((f.hudHp === undefined ? f.hp : f.hudHp) / f.maxHp, 0, 1);
    if (lag > frac) { ctx.fillStyle = '#fff0c8'; ctx.fillRect(bx, by, Math.ceil(bw * lag), bh); }       // what the last blow took, still showing
    ctx.fillStyle = low && Math.sin(T * 7) > 0 ? shade(B.col[f.team], 1.35) : B.col[f.team]; ctx.fillRect(bx, by, Math.ceil(bw * frac), bh);
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(bx, by, Math.ceil(bw * frac), 1);
    ctx.fillStyle = '#2a2418'; ctx.fillRect(bx, sy, bw, sh);
    ctx.fillStyle = ready ? '#fff0b0' : '#e0aa3e'; ctx.fillRect(bx, sy, Math.ceil(bw * f.charge / 100), sh);
    if (!many) {
      for (let i = 1; i < 4; i++) { ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(bx + bw * i / 4, sy, 0.5, sh); }
      // his health in figures, and READY when he is charged
      ctx.textAlign = 'right'; ctx.fillStyle = low ? '#ff8a7a' : '#f2e6cc'; ctx.fillText(Math.max(0, Math.ceil(f.hp)), x + 94, y + 5.5);
      if (ready) { ctx.font = 'bold 3.5px Consolas, monospace'; ctx.fillStyle = '#fff0b0'; ctx.fillText('READY', x + 94, y + 9.6); ctx.font = 'bold 5px Consolas, monospace'; }
      ctx.textAlign = 'left';
      hudMarks(f).slice(0, 8).forEach((k, i) => drawMark(ctx, k, nx + 0.5 + i * 4, y + 7.4, 0.5));      // what ails or aids him, under his name
    } else {
      let px = bx + bw + 1;
      const pip = col => { ctx.fillStyle = col; ctx.fillRect(px, y + 1, 1.5, 3); px += 2; };
      if (f.bleed > 0) pip('#ff3a2a');
      if (f.buff) pip('#6aa8ff');
    }
  }
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
  const ctx = cv.getContext('2d'), k = B.wild, seed = B.wseed || (B.wseed = 1 + Math.floor(Math.random() * 900));      // no two fights on quite the same ground
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const h = i => Math.abs(Math.sin((i + seed) * 127.1 + 311.7) * 43758.5453) % 1;
  const blob = (cx, cy, rx, ry, col) => { ctx.fillStyle = col; for (let yy = -ry; yy <= ry; yy++) { const hw = Math.round(rx * Math.sqrt(1 - (yy * yy) / (ry * ry))); ctx.fillRect(Math.round(cx - hw), Math.round(cy + yy), hw * 2, 1); } };
  const ground = { forest: '#6f8a45', rock: '#8f8a78', camp: '#8a7650', ruin: '#7f8a55' }[k] || '#6f8a45';
  const gD = shade(ground, 0.84), gL = shade(ground, 1.14);

  // ---- sky: paler toward the horizon, a low sun, a few clouds ----
  for (let y = 0; y < 60; y += 3) R(0, y, 428, 3, shade('#9cc0d8', 0.9 + y / 190));
  blob(330 - (seed % 200), 18, 9, 9, '#fdf4d0'); blob(330 - (seed % 200), 18, 14, 14, 'rgba(253,244,208,.25)');
  for (let c = 0; c < 4; c++) { const cx = 40 + h(c + 40) * 350, cy = 8 + h(c + 50) * 22; blob(cx, cy, 20 + h(c) * 14, 3, '#eef5f8'); blob(cx + 8, cy - 3, 11, 3, '#f8fbfc'); blob(cx - 6, cy + 2, 14, 2, '#dfeaf0'); }
  // ---- two ranges of far hills, bluer and fainter the further off ----
  for (let x = 0; x < 428; x += 2) { const t = 36 + Math.round(Math.sin(x * 0.019 + seed) * 8 + Math.sin(x * 0.047 + 2) * 4); R(x, t, 2, 46, '#8fa9a6'); if (h(x) > 0.82) R(x, t, 2, 1, '#a3bab6'); }
  for (let x = 0; x < 428; x += 2) { const t = 52 + Math.round(Math.sin(x * 0.031 + 1 + seed) * 6 + Math.sin(x * 0.085) * 3); R(x, t, 2, 30, '#6c8b68'); if (h(x + 300) > 0.7) R(x, t - 2, 2, 2, '#5c7a58'); }
  // ---- the ground: broad lights and darks, then grain, then a place worn smooth in the middle ----
  R(0, 78, 428, 162, ground);
  for (let n = 0; n < 16; n++) blob(h(n + 10) * 428, 96 + h(n + 20) * 136, 26 + h(n + 30) * 34, 4 + h(n + 31) * 7, n % 2 ? 'rgba(255,250,210,.06)' : 'rgba(30,40,10,.07)');
  blob(214, 164, 150, 46, 'rgba(240,225,180,.07)'); blob(214, 164, 96, 28, 'rgba(240,225,180,.06)');
  for (let n = 0; n < 620; n++) R(h(n) * 426, 84 + h(n + 900) * 154, 1 + Math.round(h(n + 5) * 2), 1, n % 2 ? gD : gL);
  const tuft = (x, y, c) => { R(x, y - 3, 1, 3, c); R(x + 1, y - 2, 1, 2, shade(c, 1.2)); R(x + 2, y - 4, 1, 4, c); R(x - 1, y - 1, 1, 1, c); };
  const stone = (x, y, w, c) => { R(x, y - 3, w, 3, c); R(x + 1, y - 4, w - 2, 1, c); R(x + 1, y - 4, w - 3, 1, shade(c, 1.25)); R(x, y - 1, w, 1, shade(c, 0.7)); R(x - 1, y, w + 3, 1, 'rgba(0,0,0,.2)'); };
  const tree = (x, y, sc, dark) => {
    const tk = dark ? '#3a2a1c' : '#4a3320', pal = dark ? ['#27432a', '#2c4c2f', '#223b26', '#33562f'] : ['#2f5226', '#35602b', '#2a4a22', '#4a7a36'];
    R(x - 2 * sc, y - 16 * sc, 4 * sc, 16 * sc, tk); R(x - 2 * sc, y - 16 * sc, sc, 16 * sc, shade(tk, 0.7)); R(x + sc, y - 12 * sc, sc, 3 * sc, shade(tk, 1.3));
    for (const [ox, oy, r, ci] of [[0, -30, 15, 0], [-9, -22, 11, 1], [9, -24, 12, 2], [-2, -34, 9, 3]]) blob(x + ox * sc, y + oy * sc, r * sc, r * sc, pal[ci]);
    if (!dark) { blob(x - 5 * sc, y - 37 * sc, 5 * sc, 3 * sc, '#5a8c40'); blob(x + 6 * sc, y - 31 * sc, 4 * sc, 2 * sc, '#56883e'); }
  };
  const bush = (x, y, c) => { blob(x, y - 3, 7, 4, c); blob(x - 4, y - 1, 5, 3, shade(c, 0.86)); blob(x + 2, y - 5, 4, 2, shade(c, 1.2)); };

  if (k === 'forest') {
    for (let n = 0; n < 22; n++) tree(n * 20 + h(n + 200) * 12, 76 + h(n + 210) * 4, 0.7, true);                      // the wood behind, dark and close
    for (let n = 0; n < 15; n++) tree(8 + n * 30 + h(n) * 12, 82 + h(n + 3) * 8, 1, false);
    for (let n = 0; n < 5; n++) { const x = 30 + n * 90 + h(n + 77) * 40; ctx.fillStyle = 'rgba(255,248,200,.07)'; for (let q = 0; q < 70; q++) ctx.fillRect(Math.round(x + q * 0.5), 14 + q, 12, 1); }      // light coming down through the leaves
    for (let n = 0; n < 24; n++) bush(h(n + 60) * 428, 86 + h(n + 70) * 7, n % 3 ? '#3f6a30' : '#4a7a36');
    const lx = 60 + h(1) * 260; R(lx, 100, 44, 6, '#5a4026'); R(lx, 100, 44, 2, '#74552f'); R(lx - 2, 100, 3, 6, '#8a6a3a'); R(lx - 1, 102, 1, 2, '#5a4026'); R(lx + 12, 97, 2, 4, '#5a4026'); for (let q = 0; q < 4; q++) R(lx + 6 + q * 9, 104, 4, 2, '#4f7a3a');      // a fallen trunk, mossed over
    for (let n = 0; n < 160; n++) R(h(n + 400) * 426, 92 + h(n + 410) * 146, 2, 1, ['#8a6a3a', '#a8762e', '#6a5a2a'][n % 3]);          // last year's leaves
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
      if (h(gx * 7 + gy) > 0.42) { R(gx + 2, gy + 2, 40, 16, 'rgba(210,204,186,.20)'); R(gx + 2, gy + 2, 40, 1, 'rgba(240,236,220,.25)'); R(gx + 2, gy + 17, 40, 1, 'rgba(60,60,40,.2)'); }
    }
    for (let n = 0; n < 10; n++) bush(h(n + 60) * 428, 88 + h(n + 70) * 6, '#57863a');
  }
  // ---- grass and stones about the place, and darker growth along the near edge to frame the fight ----
  const tc = k === 'rock' ? '#7a8456' : k === 'camp' ? '#7f8a4a' : '#4f7a34';
  for (let n = 0; n < (k === 'camp' ? 40 : 90); n++) tuft(h(n + 1000) * 424, 94 + h(n + 1010) * 142, n % 4 ? tc : shade(tc, 1.2));
  for (let n = 0; n < (k === 'rock' ? 0 : 9); n++) stone(h(n + 1100) * 410, 104 + h(n + 1110) * 126, 5 + Math.round(h(n + 1120) * 5), '#8a8371');
  for (let n = 0; n < 26; n++) { const x = n * 17 + h(n + 1200) * 10; bush(x, 240 + h(n + 1210) * 3, shade(tc, 0.6)); }
  for (let n = 0; n < 5; n++) R(0, 78 + n * 4, 428, 4, `rgba(20,30,10,${(0.3 * (1 - n / 5)).toFixed(3)})`);
  for (let n = 0; n < 4; n++) R(0, 224 + n * 4, 428, 4, `rgba(15,20,8,${(0.06 + n * 0.05).toFixed(3)})`);
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
    if (stone) {                                // an arcade round the rim: columns and a lintel against the light
      R(0, 0, 428, 2, th.wallTop); R(0, 2, 428, 1, th.wallLine);
      for (let x = 2; x < 428; x += 14) { R(x, 3, 3, 8, th.wallTop); R(x + 2, 3, 1, 8, th.wallLine); }
    } else {                                    // a village pit: far hills, a rail, and posts
      for (let x = 0; x < 428; x += 2) { const t = 4 + Math.round(Math.sin(x * 0.03) * 2 + Math.sin(x * 0.08 + 1) * 1.5); R(x, t, 2, 10 - t, '#6f8a5a'); }
      for (let x = 6; x < 428; x += 22) { R(x, 3, 2, 9, '#5e4426'); R(x, 3, 1, 9, '#7a5a34'); }
      R(0, 6, 428, 1, '#7a5a34');
    }
    R(0, 10, 428, 3, stone ? th.wallTop : '#7a5a34'); R(0, 13, 428, 2, stone ? th.wallLine : '#4a3520'); R(0, 15, 428, 3, 'rgba(0,0,0,.28)');
  }
  // the rows: each seat lit along its top edge, in shade down its face
  for (let y = 23; y <= 65; y += 9) {
    R(0, y - 8, 428, 8, shade(th.stands, 0.92 + (y - 23) / 42 * 0.16));
    R(0, y, 428, 1, shade(th.stands, 1.55)); R(0, y + 1, 428, 1, shade(th.step, 0.8));
    if (stone) for (let x = (y % 2) * 7; x < 428; x += 14) R(x, y - 7, 1, 7, th.step);       // the joints between the blocks
    else for (let x = 0; x < 428; x += 9) R(x, y - 7, 1, 7, shade(th.stands, 0.8));          // or planks
  }
  // the stairs up through the crowd, each from its own doorway
  for (const a of ARENA_AISLES) {
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
      const len = (v.r || 20) * 2 * Math.min(1, k * 2.6); ctx.globalAlpha = a * 0.85;
      for (let i = 0; i < 7; i++) { const an = i * 0.9 + 0.3; for (let q = 4; q < len; q += 3) R(v.x * 2 + Math.cos(an) * q + Math.sin(q * 1.3 + i) * 1.5, v.y * 2 + Math.sin(an) * q * 0.45, 2, 1, '#4a3320'); R(v.x * 2 + Math.cos(an) * len - 2, v.y * 2 + Math.sin(an) * len * 0.45 - k * 9, 4, 3, '#e2cf9c'); }
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
  const shx = B.shake > 0.2 ? Math.round(rand(-1, 1) * B.shake) * SCALE : 0;
  const shy = B.shake > 0.2 ? Math.round(rand(-1, 1) * B.shake * 0.6) * SCALE : 0;

  // the camera closes in on the blow that ends it, then draws back for the verdict
  const cam = B.cam || (B.cam = { z: 1, x: 214, y: 120, t: performance.now() });
  const now = performance.now(), cdt = Math.min(0.1, (now - cam.t) / 1000), ck = 1 - Math.pow(0.004, cdt);
  cam.t = now;
  const picking = B.pick && !out(B.pick) ? B.pick : null;
  const want = B.over && B.finish && B.outro < 0.55 ? 1.5 : picking ? 1.18 : 1;
  const focus = want >= 1.5 ? B.finish : picking;
  if (focus) { cam.tx = focus.x * 2; cam.ty = focus.y * 2 - 16; if (cam.z === 1) { cam.x = cam.tx; cam.y = cam.ty; } }
  cam.z += (want - cam.z) * ck; if (Math.abs(cam.z - want) < 0.004) cam.z = want;
  if (cam.tx != null) { cam.x += (cam.tx - cam.x) * ck; cam.y += (cam.ty - cam.y) * ck; }
  const cz = cam.z, CW = 1280, CH = 720;
  const cox = cz === 1 ? 0 : clamp(CW / 2 - cam.x * FINE * cz, CW - 428 * FINE * cz, 0), coy = cz === 1 ? 0 : clamp(CH / 2 - cam.y * FINE * cz, CH - 240 * FINE * cz, 0);
  const view = unit => ctx.setTransform(unit * cz * K, 0, 0, unit * cz * K, (cox + shx) * K, (coy + shy) * K);

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
  const spr = f => ({
      x: f.x * 2, y: f.y * 2, facing: f.facing, g: f.g, team: f.team, col: B.col[f.team], colD: B.colD[f.team],
      moving: f.moving, walk: f.walk, clock: T + f.walk, atkAnim: f.atkAnim,
      windup: f.state === 'windup', windP: f.t0 ? clamp(1 - f.t / f.t0, 0, 1) : 1,
      recoil: clamp(Math.abs(f.kx) / 40, 0, 1), shadow,
      bash: f.state === 'windup' && f.move === 'bash', guard: f.guard,
      flash: f.flash, down: f.down, falling: f.fallT > 0, yielded: f.yielded, snare: f.snare, slash: f.slash,
      cheer: (B.over && !out(f) && f.team === B.winner && B.slowmo <= 0) || f.flourish > 0 ? T + f.walk : 0,
      noHelm: f.noHelm, hurt: f.hp < f.maxHp * 0.3 ? 3 : f.hp < f.maxHp * 0.55 ? 2 : f.hp < f.maxHp * 0.8 ? 1 : 0,
      hamstrung: f.hamstrung, armWound: f.armWound, shieldDmg: f.shieldHits >= 9 ? 2 : f.shieldHits >= 4 ? 1 : 0,
  });
  for (const f of sorted) drawFighter(ctx, f, spr(f));
  drawVfx(ctx, B, false);
  drawAuras(ctx, B, T);
  if (picking) {                              // the fight has stopped for him: the sand dims, and he and his man stand out
    ctx.fillStyle = 'rgba(8,5,2,.45)'; ctx.fillRect(0, 0, 428, 240);
    const tg = picking.target && !out(picking.target) ? picking.target : null;
    if (tg) { drawSprite(ctx, { ...spr(tg), flash: 0 }); const tx = tg.x * 2, ty = tg.y * 2 - tg.tall - 12 + Math.round(Math.sin(T * 7) * 2); ctx.fillStyle = '#ff5a4a'; for (let i = 0; i < 4; i++) ctx.fillRect(tx - 3 + i, ty + i, 7 - i * 2, 1); }
    ctx.strokeStyle = `rgba(255,210,74,${(0.6 + 0.3 * Math.sin(T * 6)).toFixed(2)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(picking.x * 2, picking.y * 2 + 1, 15, 5, 0, 0, 7); ctx.stroke();
    drawSprite(ctx, { ...spr(picking), flash: 0 });
  }
  for (const p of B.parts) { ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x * 2), Math.round((p.y - p.h) * 2), 2, 2); }
  showFront(ctx, B, T);       // dust, things thrown from the stands

  // ---- light: the colour of the hour, torches, darkened edges, the flash of a telling blow ----
  // by day the arena takes the weather and a little of the hour from the same sky as the yard; a dusk bout has its own light
  if (!dusk && typeof yardSky === 'function') {
    const sky = B.wild && typeof provSky === 'function' && G && G.field ? provSky() : yardSky(sceneClock()), wx = yardWeather(sceneClock()), tint = sceneTint(sky, B.wild ? 0.6 : 0.3);      // a fight in the province is fought at the province's hour
    if (tint !== '#ffffff') { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = tint; ctx.fillRect(0, 0, 428, 240); ctx.globalCompositeOperation = 'source-over'; }
    if (wx.over > 0) { ctx.fillStyle = `rgba(40,45,60,${(0.1 * wx.over).toFixed(3)})`; ctx.fillRect(0, 0, 428, 240); }
    if (wx.wet > 0) { ctx.fillStyle = `rgba(70,45,20,${(0.14 * wx.wet).toFixed(3)})`; ctx.fillRect(0, 86, 428, 154); }
    sceneRain(ctx, 428, 240, T, wx.rain, 90);
  }
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
    ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, 16, 5);
    ctx.fillStyle = '#3a1512'; ctx.fillRect(x, y, 14, 2);
    if (f.hudHp > f.hp) { ctx.fillStyle = '#fff0c8'; ctx.fillRect(x, y, Math.ceil(14 * clamp(f.hudHp / f.maxHp, 0, 1)), 2); }
    ctx.fillStyle = B.col[f.team]; ctx.fillRect(x, y, Math.ceil(14 * clamp(f.hp / f.maxHp, 0, 1)), 2);
    ctx.fillStyle = f.charge >= 100 ? (Math.sin(T * 12) > 0 ? '#ffffff' : '#fff0b0') : '#e0aa3e'; ctx.fillRect(x, y + 2, Math.ceil(14 * f.charge / 100), 1);
    hudMarks(f).slice(0, 5).forEach((k, i) => drawMark(ctx, k, x + 16.5 + i * 4, y - 0.5, 0.5));
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
    ctx.fillStyle = last ? 'rgba(0,0,0,.84)' : 'rgba(0,0,0,.66)'; ctx.fillRect(x0, fy - 5, w + 8, 7);
    ctx.fillStyle = B.col[l.team]; ctx.fillRect(x0, fy - 5, 2, 7);
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
    ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(108, 163.5, 104, 14);
    ctx.fillStyle = '#e0aa3e'; ctx.fillRect(108, 163.5, 104, 0.5);
    ctx.fillStyle = '#1c130c'; ctx.fillRect(110, 173, 100, 3);
    ctx.fillStyle = e > 0.55 ? (Math.sin(T * 10) > 0 ? '#ffe27a' : '#ffd24a') : e > 0.3 ? '#e0aa3e' : '#b98a2e'; ctx.fillRect(110, 173, Math.round(100 * e), 3);
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(110, 173, Math.round(100 * e), 1);
    for (const v of [0.3, 0.55]) { ctx.fillStyle = '#f2e6cc'; ctx.fillRect(110 + 100 * v, 172, 0.5, 5); }      // where it stirs, and where it roars
    ctx.textAlign = 'left'; ctx.fillStyle = '#c9b9a0'; ctx.fillText('CROWD', 110, 170.5);
    ctx.fillStyle = e > 0.55 ? '#ffd24a' : e > 0.3 ? '#f2e6cc' : '#8a7a66'; ctx.fillText(word, 131, 170.5);
  }
  if (live) {                    // the clock: how long it has run, and when the judges will end it
    const left = 150 - B.time, s2 = Math.floor(left < 30 ? Math.max(0, left) : B.time), str = `${Math.floor(s2 / 60)}:${String(s2 % 60).padStart(2, '0')}`;
    if (B.wild) { ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(146, 169.5, 28, 8); }
    ctx.textAlign = 'right';
    if (left < 30) { ctx.fillStyle = Math.sin(T * 8) > 0 ? '#ff8a7a' : '#e2695c'; ctx.fillText(`ENDS IN ${str}`, B.wild ? 172 : 210, B.wild ? 175.5 : 170.5); }
    else { ctx.fillStyle = '#f2e6cc'; ctx.fillText(str, B.wild ? 166 : 210, B.wild ? 175.5 : 170.5); }
  }
  if (live && B.fighters.length > 2) for (const t of [0, 1]) {      // how each side stands as a whole
    const fs = B.fighters.filter(f => f.team === t), up = fs.filter(f => !out(f)), tot = fs.reduce((n, f) => n + f.maxHp, 0), has = up.reduce((n, f) => n + Math.max(0, f.hp), 0);
    const x = t ? 218 : 38, w = 64, fr = clamp(has / Math.max(1, tot), 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(x - 2, 166.5, w + 4, 11);
    ctx.fillStyle = '#3a1512'; ctx.fillRect(x, 173, w, 3);
    ctx.fillStyle = B.col[t]; ctx.fillRect(t ? x : x + w - Math.round(w * fr), 173, Math.round(w * fr), 3);
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(t ? x : x + w - Math.round(w * fr), 173, Math.round(w * fr), 1);
    ctx.textAlign = t ? 'left' : 'right'; ctx.fillStyle = '#f2e6cc'; ctx.fillText(`${up.length} OF ${fs.length} STANDING`, t ? x : x + w, 171.5);
  }
  ctx.textAlign = 'center';
  if (B.death && live && !B.pick) {             // no quarter in this one
    ctx.fillStyle = 'rgba(40,6,4,.85)'; ctx.fillRect(134, 155, 52, 7.5); ctx.fillStyle = '#ff6a5a'; ctx.fillText('SINE MISSIONE', 160, 160.6);
  }
  if (B.pick && !out(B.pick)) {                     // the man the fight has stopped for
    const f = B.pick;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(100, 160, 120, 9);
    ctx.fillStyle = '#ffd24a'; ctx.fillText(`${f.g.name.toUpperCase()} IS READY: CHOOSE`, 160, 166.5);
  }

  // the man the mouse is on: what he is, how he stands, and what he carries
  const who = B.inspect && B.fighters.includes(B.inspect) ? B.inspect : null;
  if (who && !B.pick && !B.over && B.intro <= 0) {
    const g = who.g, lines = [], w = 104;
    lines.push([`${g.name.toUpperCase()}${g.beast ? '' : '  ' + who.c.name.toUpperCase()}`, who.team ? '#9cc4ff' : '#ff9a8a']);
    lines.push([`HEALTH ${Math.max(0, Math.round(who.hp))}/${who.maxHp}   CHARGE ${Math.round(who.charge)}%`, '#f2e6cc']);
    if (!g.beast) lines.push([who.style ? `${STAT_NAMES[who.style].toUpperCase()} STYLE: BEATS ${STAT_NAMES[STYLE_BEATS[who.style]].toUpperCase()}` : 'NO STYLE: NO EDGE, NO WEAKNESS', who.style ? STYLE_COL[who.style] : '#a8947a']);
    const st = [who.bleed > 0 && 'BLEEDING', who.hamstrung && 'HAMSTRUNG', who.armWound && 'ARM WOUND', who.snare > 0 && 'NETTED', who.stun > 0.3 && 'STUNNED', who.weakT > 0 && 'WEAKENED', who.buff && 'BUFFED'].filter(Boolean).join(', ');
    if (st) lines.push([st, '#ffd24a']);
    const abl = who.abl.map(a => a.name.toUpperCase());
    for (let i = 0; i < abl.length; i += 2) lines.push([abl.slice(i, i + 2).join(', '), '#c9b9a0']);
    const h = lines.length * 6 + 4, cx = clamp(who.x * Z - w / 2, 2, 318 - w), cy = who.y * Z > 92 ? who.y * Z - Math.round(who.tall * FINE / SCALE) - h - 12 : who.y * Z + 8;
    ctx.fillStyle = 'rgba(10,6,3,.9)'; ctx.fillRect(cx, cy, w, h);
    ctx.fillStyle = '#e0aa3e'; ctx.fillRect(cx, cy, w, 0.5); ctx.fillRect(cx, cy + h - 0.5, w, 0.5);
    ctx.font = 'bold 4.5px Consolas, monospace'; ctx.textAlign = 'left';
    lines.forEach(([t, c], i) => { ctx.fillStyle = c; ctx.fillText(t, cx + 3, cy + 6 + i * 6); });
    ctx.textAlign = 'center';
  }
  if (B.cut) drawCutIn(ctx, B, T);
  if (B.fatal) drawFatal(ctx, B, T);
  if (B.paused && !B.over) { ctx.font = 'bold 12px Cinzel, Georgia, serif'; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(110, 78, 100, 18); ctx.fillStyle = '#e0aa3e'; ctx.fillText('PAUSED', 160, 91); }

  if (B.over) drawOutro(ctx, B, T);
}
