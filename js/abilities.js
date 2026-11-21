'use strict';
// Fighting styles and abilities.
//
// A man has three skills. Whichever is highest is his style, and styles beat one another in a ring:
// Strength beats Agility, Agility beats Skill, Skill beats Strength. Against the style his own beats,
// a man deals a tenth more and takes a tenth less.
//
// Each skill teaches an ability at 5, at 10 and at 16, and what it teaches depends on how he fights:
// nine for each of the five fighting styles, forty-five in all. He carries four into a fight. As he
// fights, a charge builds (slowly by itself, faster with every blow given or taken); when it is full he
// uses one of the four, and if he is yours and you are watching, the fight stops for you to choose.

const ABILITY_AT = [5, 10, 16];
const STYLE_BEATS = { str: 'agi', agi: 'skl', skl: 'str' };
const STYLE_EDGE = 0.1;

// What an ability does (fx):
//   mult     a blow at this many times his usual damage        n      that many blows
//   aoe      strikes every foe within this distance of his man  lunge  comes from far off to do it
//   stun, kb seconds stunned, how far thrown back               bleed, ham   opens a vein, cuts the leg
//   pierce   ignores armour      unblockable, nodge   cannot be blocked, cannot be dodged or missed
//   crit     always a telling blow                              exec   multiplies again if the foe is below 40% health
//   net      snares for this many seconds (may miss)            weak   { amt, t } foe hits softer for t seconds
//   expose   foe is open for this many seconds                  back   he steps away first
//   heal     gets back this share of his health                 cleanse  shakes off bleeding, snares and weakness
//   buff     { t, dodge, block, dr, dmg, haste } for t seconds: more dodging and blocking, damage taken cut by dr,
//            damage dealt raised by dmg, and haste below 1 makes his blows come quicker
const ABILITIES = {
  murmillo: {
    str: [
      { name: 'Shield bash', desc: 'Slams his shield into a foe: little hurt, but stunned and thrown back.', fx: { mult: 0.5, stun: 1.1, kb: 70 } },
      { name: 'Overhand chop', desc: 'A blow from above with his whole weight in it.', fx: { mult: 1.75, kb: 50 } },
      { name: 'Break the line', desc: 'Drives into the press: strikes every foe close by, staggering them.', fx: { mult: 1.25, aoe: 28, stun: 0.6, kb: 60 } },
    ],
    agi: [
      { name: 'Shield rush', desc: 'Crosses the sand at a run and hits shield-first.', fx: { mult: 1.0, lunge: true, kb: 65, stun: 0.3 } },
      { name: 'Sidestep', desc: 'For five seconds he is much harder to hit, and quicker to answer.', fx: { buff: { t: 5, dodge: 0.25, haste: 0.85 } } },
      { name: 'Second wind', desc: 'Gets back a fifth of his health and shakes off bleeding and snares.', fx: { heal: 0.22, cleanse: true } },
    ],
    skl: [
      { name: 'Shield wall', desc: 'For six seconds he blocks far more and takes a quarter less.', fx: { buff: { t: 6, block: 0.3, dr: 0.25 } } },
      { name: 'Counter-guard', desc: 'For six seconds he blocks more and hits a quarter harder.', fx: { buff: { t: 6, block: 0.2, dmg: 0.25 } } },
      { name: 'Find the gap', desc: 'A thrust past shield and armour that leaves the foe open.', fx: { mult: 1.6, pierce: true, unblockable: true, expose: 4 } },
    ],
  },
  thraex: {
    str: [
      { name: 'Hacking blow', desc: 'A heavy downward cut.', fx: { mult: 1.5, kb: 45 } },
      { name: 'Sunder', desc: 'Cuts through armour and numbs the arm behind it: the foe hits a quarter softer for six seconds.', fx: { mult: 1.3, pierce: true, weak: { amt: 0.25, t: 6 } } },
      { name: 'Executioner', desc: 'A killing stroke, far worse for a man already badly hurt.', fx: { mult: 1.9, exec: 1.5 } },
    ],
    agi: [
      { name: 'Quick cut', desc: 'Two fast cuts.', fx: { mult: 0.75, n: 2 } },
      { name: 'Dancing blade', desc: 'For six seconds he dodges more and strikes faster.', fx: { buff: { t: 6, dodge: 0.2, haste: 0.8 } } },
      { name: 'Whirl', desc: 'A spinning cut at every foe in reach; each one bleeds.', fx: { mult: 1.1, aoe: 26, bleed: true } },
    ],
    skl: [
      { name: 'Hooking cut', desc: 'Reaches round shield and armour. Cannot be blocked, and the wound bleeds.', fx: { mult: 0.95, unblockable: true, pierce: true, bleed: true } },
      { name: 'Hamstring', desc: 'Cuts the leg: the foe is slowed and dodges half as well for the rest of the fight.', fx: { mult: 0.7, ham: true } },
      { name: 'Open the vein', desc: 'Cannot be blocked, dodged or turned by armour, and bleeds twice over.', fx: { mult: 1.25, unblockable: true, nodge: true, pierce: true, bleed: 2 } },
    ],
  },
  retiarius: {
    str: [
      { name: 'Trident thrust', desc: 'All three points, driven home.', fx: { mult: 1.5, kb: 55 } },
      { name: 'Pin', desc: 'Pins the foe where he stands: stunned for a second, armour no help.', fx: { mult: 1.1, pierce: true, stun: 1.0 } },
      { name: 'Gaff', desc: 'Hooks and tears: a heavy wound that bleeds and throws him back.', fx: { mult: 1.8, pierce: true, bleed: true, kb: 70 } },
    ],
    agi: [
      { name: 'Slip away', desc: 'Skips out of reach, and for five seconds is very hard to hit.', fx: { back: true, buff: { t: 5, dodge: 0.3 } } },
      { name: 'Net sweep', desc: 'Swings the net low through every foe close by, tangling whom it catches.', fx: { mult: 0.3, aoe: 28, net: 2 } },
      { name: 'Dance of the tide', desc: 'For seven seconds his blows come much faster, and he dodges more.', fx: { buff: { t: 7, haste: 0.7, dodge: 0.15 } } },
    ],
    skl: [
      { name: 'Cast net', desc: 'Snares a foe for three and a half seconds: he can neither dodge nor block, and every blow hurts more.', fx: { net: 3.5 } },
      { name: 'Tangle', desc: 'A snare that also fouls the sword arm: he hits a third softer.', fx: { net: 3, weak: { amt: 0.3, t: 5 } } },
      { name: 'Drag down', desc: 'Nets him, hauls him off his feet, and strikes as he falls.', fx: { net: 3.5, mult: 1.4, stun: 0.8 } },
    ],
  },
  hoplomachus: {
    str: [
      { name: 'Driving thrust', desc: 'The spear with his shoulder behind it.', fx: { mult: 1.5, kb: 60 } },
      { name: 'Shield slam', desc: 'The round shield in the face: stunned and thrown back.', fx: { mult: 0.6, stun: 1.0, kb: 65 } },
      { name: 'Impale', desc: 'Through armour, and it bleeds.', fx: { mult: 2.0, pierce: true, bleed: true } },
    ],
    agi: [
      { name: 'Spear lunge', desc: 'A running thrust launched from well outside sword range.', fx: { mult: 1.5, lunge: true, kb: 60 } },
      { name: 'Keep away', desc: 'Sweeps the shaft through everyone near, throwing them back.', fx: { mult: 0.6, aoe: 24, kb: 85 } },
      { name: 'Phalanx step', desc: 'Lunges, and for five seconds after is hard to hit.', fx: { mult: 1.3, lunge: true, buff: { t: 5, dodge: 0.2 } } },
    ],
    skl: [
      { name: 'Measured thrust', desc: 'Placed, not thrown: it cannot be blocked or dodged.', fx: { mult: 1.2, unblockable: true, nodge: true } },
      { name: 'Set spear', desc: 'For six seconds he takes a fifth less and hits a fifth harder.', fx: { buff: { t: 6, dr: 0.2, dmg: 0.2 } } },
      { name: 'Heart-seeker', desc: 'Always a telling blow, and armour does not turn it.', fx: { mult: 1.5, pierce: true, crit: true } },
    ],
  },
  dimachaerus: {
    str: [
      { name: 'Twin cleave', desc: 'Both blades, one after the other.', fx: { mult: 0.98, n: 2 } },
      { name: 'Butcher\'s cross', desc: 'A crossing cut that opens a vein.', fx: { mult: 1.8, bleed: true } },
      { name: 'Frenzy', desc: 'For seven seconds he hits a third harder and takes a little more.', fx: { buff: { t: 7, dmg: 0.35, dr: -0.15 } } },
    ],
    agi: [
      { name: 'Flurry', desc: 'Three cuts in the time of one.', fx: { mult: 0.72, n: 3 } },
      { name: 'Blade storm', desc: 'Five cuts, faster than the eye follows.', fx: { mult: 0.66, n: 5 } },
      { name: 'Whirlwind', desc: 'Two cuts at every foe within reach.', fx: { mult: 0.8, n: 2, aoe: 26 } },
    ],
    skl: [
      { name: 'Feint and cut', desc: 'The false blade draws the guard; the true one cannot be blocked or dodged.', fx: { mult: 1.2, unblockable: true, nodge: true } },
      { name: 'Crossed blades', desc: 'For five seconds he parries like a man with a shield, and dodges more.', fx: { buff: { t: 5, block: 0.28, dodge: 0.1 } } },
      { name: 'Thousand cuts', desc: 'Four cuts through armour, every one of them bleeding.', fx: { mult: 0.6, n: 4, pierce: true, bleed: true } },
    ],
  },
};
// What a man with no ability yet does with a full charge, and what the beasts do.
const BLOW = { id: 'blow', name: 'Heavy blow', desc: 'Puts his whole weight behind one stroke.', skill: null, tier: 0, fx: { mult: 1.5, kb: 45 } };
const BEAST_MOVES = {
  boar: { id: 'boar', name: 'Charge', fx: { mult: 1.35, lunge: true, stun: 0.5, kb: 65 } },
  wolf: { id: 'wolf', name: 'Savage', fx: { mult: 0.8, n: 2, bleed: true } },
  lion: { id: 'lion', name: 'Pounce', fx: { mult: 1.4, lunge: true, kb: 60 } },
  bear: { id: 'bear', name: 'Maul', fx: { mult: 1.6, stun: 0.5, kb: 55 } },
};
// every ability knows its own name: 'murmillo.str0' is a Murmillo's first Strength ability
for (const cls in ABILITIES) for (const sk in ABILITIES[cls]) ABILITIES[cls][sk].forEach((a, i) => Object.assign(a, { id: `${cls}.${sk}${i}`, cls, skill: sk, tier: i, at: ABILITY_AT[i] }));
function abilityById(id) {
  if (id === 'blow') return BLOW;
  const m = /^(\w+)\.(str|agi|skl)(\d)$/.exec(id || '');
  return m && ABILITIES[m[1]] ? ABILITIES[m[1]][m[2]][+m[3]] || null : null;
}

// Everything he has learned so far, best first.
function abilitiesKnown(g) {
  if (g.beast || !ABILITIES[g.cls]) return [];
  const out = [];
  for (const sk of STATS) ABILITIES[g.cls][sk].forEach(a => { if (g.stats[sk] >= a.at) out.push(a); });
  return out.sort((a, b) => b.tier - a.tier || g.stats[b.skill] - g.stats[a.skill]);
}
// The four he carries into a fight: the ones chosen for him, filled out with the best of the rest.
function abilitiesOf(g) {
  if (g.beast) return [BEAST_MOVES[g.cls] || BLOW];
  const known = abilitiesKnown(g);
  if (!known.length) return [BLOW];
  const picked = (g.abil || []).map(abilityById).filter(a => a && known.includes(a)).slice(0, 4);
  for (const a of known) { if (picked.length >= 4) break; if (!picked.includes(a)) picked.push(a); }
  return picked;
}
// Change what he carries. Only matters once he knows more than four: an ability he carries is put down
// for the best one he does not, and one he does not carry takes the place of the fourth.
function toggleAbility(g, id) {
  const a = abilityById(id), known = abilitiesKnown(g);
  if (!a || !known.includes(a) || known.length <= 4) return false;
  let cur = abilitiesOf(g).map(x => x.id);
  if (cur.includes(id)) { const spare = known.find(k => !cur.includes(k.id)); cur = cur.filter(x => x !== id); if (spare) cur.push(spare.id); }
  else cur = cur.slice(0, 3).concat(id);
  g.abil = cur;
  return true;
}
// The next thing each skill will teach him, for the dossier.
function abilityNext(g, sk) { return g.beast || !ABILITIES[g.cls] ? null : ABILITIES[g.cls][sk].find(a => g.stats[sk] < a.at) || null; }

// His style: the skill that stands clear above the other two, or none if two are level.
function styleOf(g) {
  if (!g || g.beast || !g.stats) return null;
  const s = g.stats, top = STATS.slice().sort((a, b) => s[b] - s[a]);
  return s[top[0]] > s[top[1]] ? top[0] : null;
}
// What a blow from a to d is multiplied by, for their styles.
function styleEdge(a, d) {
  if (!a || !d) return 1;
  return STYLE_BEATS[a] === d ? 1 + STYLE_EDGE : STYLE_BEATS[d] === a ? 1 - STYLE_EDGE : 1;
}

// ---------- in the fight ----------

function chargeUp(f, n) { if (!out(f)) f.charge = Math.min(100, f.charge + n * f.chargeRate); }

// The look of one blow of an ability landing.
function abilityHit(B, f, o, x, res) {
  const size = clamp((x.mult || 0.6) * (x.n ? 0.8 : 1), 0.5, 2.2), col = x.bleed ? '#ff9a8a' : x.pierce ? '#cfe6ff' : '#fff0c0';
  vfx(B, { k: 'arc', x: o.x, y: o.y, dir: f.facing, size, col, col2: x.bleed ? '#c22a1e' : '#e0aa3e', dur: 0.22 + size * 0.06 });
  if (res === 'hit' && (x.mult || 0) >= 1.5) { vfx(B, { k: 'flash', under: true, x: o.x, y: o.y, col: '#fff6d8', dur: 0.25 }); B.shake = Math.max(B.shake, 2.4); }
  if (x.stun && res !== 'miss' && res !== 'dodge') { vfx(B, { k: 'ring', under: true, x: o.x, y: o.y, r: 10, col: '#ffe27a', dur: 0.3 }); snd(B, 'stun', 1, o); }
}
function abilityStrike(B, f, foes, x) {
  const hit = [];
  for (const o of foes) {
    if (out(o)) continue;
    const res = resolveAttack(B, f, o, { mult: x.mult * (x.exec && o.hp < o.maxHp * 0.4 ? x.exec : 1), unblockable: x.unblockable, pierce: x.pierce, bleed: x.bleed, stun: x.stun, kb: x.kb, nodge: x.nodge, crit: x.crit, ham: x.ham, ability: true });
    abilityHit(B, f, o, x, res);
    if (!out(o) && res !== 'miss' && res !== 'dodge') hit.push(o);
  }
  f.atkAnim = 1; f.slash = 0.16;
  return hit;
}
// An ability of several blows lands them one after another, a beat apart; a stun breaks it off.
function comboStep(B, f, dt) {
  const c = f.combo;
  c.t -= dt;
  if (c.t > 0) return;
  c.foes = c.foes.filter(o => !out(o));
  if (!c.foes.length) { f.combo = null; return; }
  f.facing = c.foes[0].x >= f.x ? 1 : -1;
  abilityStrike(B, f, c.foes, c.x);
  if (c.x.aoe) vfx(B, { k: 'ring', under: true, x: f.x, y: f.y, r: c.x.aoe, r0: 6, col: '#ead2a0', dur: 0.3, a: 0.6 });
  if (--c.left <= 0) { f.combo = null; f.cd = f.atkTime * 0.6; } else c.t = 0.13;
}

// Where the fight is being watched (B.cutins), an ability is announced before it lands: the fight holds, a band
// crosses the screen with the man's likeness and the ability's name (drawCutIn in combat.js), and only then does
// castNow do the work. Unwatched fights, and a second cast while one is already being announced, go straight through.
function castAbility(B, f, ab) {
  const many = B.fighters.length > 6;
  if (!B.cutins || B.cut || (many && f.team !== 0)) return castNow(B, f, ab);
  B.cut = { f, ab, t: 0, dur: f.team === 0 ? 0.95 : 0.62 };       // your own men get the longer look
  f.charge = 100; f.state = 'ready'; f.move = null;
  snd(B, 'cutin', 1, f, f.g.beast ? 'beast' : '');
}
function castNow(B, f, ab) {
  const x = ab.fx;
  let t = f.target && !out(f.target) ? f.target : null;
  if (!t) for (const o of B.fighters) if (o.team !== f.team && !out(o) && (!t || Math.hypot(o.x - f.x, o.y - f.y) < Math.hypot(t.x - f.x, t.y - f.y))) t = o;
  f.charge = 0; f.casts = (f.casts || 0) + 1; f.lastCast = ab.id; f.combo = null;
  if (f.used) f.used[ab.name] = (f.used[ab.name] || 0) + 1;
  // he calls on it: a ring of light at his feet, its name on a ribbon over his head, and the fight holds its breath
  vfx(B, { k: 'ring', under: true, x: f.x, y: f.y, r: 15, col: '#ffd24a', dur: 0.45, fill: true });
  vfx(B, { k: 'banner', f, text: ab.name.toUpperCase(), dur: 1.25 });
  B.hitstop = Math.max(B.hitstop, 0.07);
  snd(B, f.g.beast ? 'special' : x.heal ? 'heal' : x.buff && !x.mult ? (x.buff.block || x.buff.dr > 0 ? 'brace' : 'surge') : x.aoe ? 'sweep' : (x.n || 1) > 1 ? 'flurry' : x.back ? 'hop' : x.net && !x.mult ? 'special' : x.lunge || (x.mult || 0) >= 1.7 ? 'leap' : 'thrust', 1, f, f.g.beast ? 'beast' : '');
  feed(B, `${f.g.name}: ${ab.name}`, f.team);
  B.exc += 0.045 * f.show;
  f.state = 'ready'; f.move = null;
  const pose = (k, dur, o) => { f.pose = Object.assign({ k, t: dur, dur, fx: 0, fy: 0 }, o); };
  if (x.heal) pose('surge', 0.7);
  else if (x.buff && !x.mult) pose(x.buff.block || x.buff.dr > 0 ? 'brace' : 'surge', 0.65);
  if (x.heal) { const h = Math.round(f.maxHp * x.heal); f.hp = Math.min(f.maxHp, f.hp + h); fxText(B, f, '+' + h, '#9fd070'); vfx(B, { k: 'motes', f, col: '#9fd070', dur: 1.1 }); }
  if (x.cleanse) { f.bleed = 0; f.snare = 0; f.weakT = 0; }
  if (x.buff) {
    f.buff = Object.assign({}, x.buff);
    vfx(B, { k: 'motes', f, col: x.buff.dmg > 0 && !(x.buff.dr > 0) && !x.buff.block ? '#ff8a5a' : x.buff.dr > 0 || x.buff.block ? '#8fc0ff' : '#ffe27a', dur: 0.9 });
    f.guard = Math.max(f.guard, x.buff.block ? 0.5 : 0);
  }
  if (!t) return;
  const dx = t.x - f.x, dy = t.y - f.y, dist = Math.hypot(dx, dy) || 0.01, x0 = f.x, y0 = f.y;
  f.facing = dx >= 0 ? 1 : -1;
  if (x.back) { fxDust(B, f.x, f.y, 5); f.x -= dx / dist * 22; f.y -= dy / dist * 10; vfx(B, { k: 'trail', under: true, x: x0, y: y0, x2: f.x, y2: f.y, col: B.col[f.team], dur: 0.35 }); pose('hop', 0.42, { fx: x0 - f.x, fy: y0 - f.y }); }
  if (!(x.mult || x.net || x.weak)) return;
  // a net with no blow behind it is thrown: it flies, and may miss
  if (x.net && !x.mult) {
    const hit = Math.random() < clamp(0.62 + f.g.stats.skl * 0.012 - t.g.stats.agi * 0.012, 0.25, 0.9);
    B.projs.push({ from: f, to: t, x: f.x, y: f.y, t: 0, dur: 0.35, hit, snare: x.net, weak: x.weak });
    snd(B, 'net', 1, f); f.atkAnim = 1; pose('throw', 0.42);
    return;
  }
  // close with him: a blow needs reach
  const go = Math.max(0, dist - f.reach * 0.85);
  if (go > 0) {
    fxDust(B, f.x, f.y, x.lunge ? 6 : 3); f.x += dx / dist * go; f.y += dy / dist * go;
    if (go > 5) vfx(B, { k: 'trail', under: true, x: x0, y: y0, x2: f.x, y2: f.y, col: x.lunge ? '#fff0c0' : B.col[f.team], dur: x.lunge ? 0.4 : 0.25 });
    if (x.lunge) fxDust(B, f.x, f.y, 4);
  }
  // how his body goes into it: a spin for a sweep, in and out for a flurry, a leap for a rush or a killing stroke, a thrust for the rest
  {
    const n = x.n || 1, k = x.aoe ? 'spin' : n > 1 ? 'flurry' : x.lunge || (x.mult || 0) >= 1.7 ? 'leap' : 'thrust';
    pose(k, k === 'spin' ? 0.5 + (n - 1) * 0.13 : k === 'flurry' ? 0.22 + n * 0.13 : k === 'leap' ? 0.44 : 0.36, { fx: x0 - f.x, fy: y0 - f.y, n });
    if (k === 'spin') { vfx(B, { k: 'arc', x: f.x, y: f.y, dir: f.facing, size: 1.6, col: '#fff0c0', col2: '#e0aa3e', dur: 0.3 }); vfx(B, { k: 'arc', x: f.x, y: f.y, dir: -f.facing, size: 1.6, col: '#fff0c0', col2: '#e0aa3e', dur: 0.42 }); }
    if (k === 'leap') vfx(B, { k: 'ring', under: true, x: f.x, y: f.y, r: 12, r0: 3, col: '#e8d8b0', dur: 0.35, a: 0.7 });
  }
  const foes = x.aoe ? B.fighters.filter(o => o.team !== f.team && !out(o) && Math.hypot(o.x - t.x, o.y - t.y) <= x.aoe) : [t];
  if (x.aoe) vfx(B, { k: 'ring', under: true, x: t.x, y: t.y, r: x.aoe, r0: 5, col: '#f2e2b8', dur: 0.4, fill: true, w: 3 });
  if (x.net) for (const o of foes) {              // a net swung or hauled, with a blow to follow
    const got = !x.aoe || Math.random() < clamp(0.62 + f.g.stats.skl * 0.012 - o.g.stats.agi * 0.012, 0.25, 0.9);
    if (got) { o.snare = Math.max(o.snare, x.net); fxText(B, o, 'netted', '#d8c79a'); snd(B, 'net', 1, o); if (o.state === 'windup') { o.state = 'ready'; o.move = null; } }
    else fxText(B, o, 'net misses', '#cfc6b4');
  }
  const hit = abilityStrike(B, f, foes, x);
  for (const o of hit) {
    if (x.weak) { o.weakT = x.weak.t; o.weakAmt = x.weak.amt; fxText(B, o, 'weakened', '#c9b458'); }
    if (x.expose) o.open = Math.max(o.open, x.expose);
  }
  if ((x.n || 1) > 1) f.combo = { foes, left: x.n - 1, t: 0.13, x };
  else f.cd = f.atkTime * 0.6;
}

// What a man chooses for himself when nobody is choosing for him.
function aiPickAbility(B, f) {
  const t = f.target, hurt = f.hp / f.maxHp;
  let best = f.abl[0], bs = -1e9;
  for (const a of f.abl) {
    const x = a.fx;
    let s = (a.tier || 0) + Math.random() * 1.3;
    if (x.heal) s += hurt < 0.45 ? 4 : hurt < 0.7 ? 0 : -6;
    if (x.buff && !x.mult) { s += f.buff ? -6 : (x.buff.dr > 0 || x.buff.block || x.buff.dodge) && hurt < 0.6 ? 1.5 : 0; }
    if (x.aoe && t) { const n = B.fighters.filter(o => o.team !== f.team && !out(o) && Math.hypot(o.x - t.x, o.y - t.y) <= x.aoe).length; s += n >= 3 ? 3 : n === 2 ? 1.5 : -1.5; }
    if (x.net && t && t.snare > 0) s -= 4;
    if (x.exec && t && t.hp < t.maxHp * 0.4) s += 2.5;
    if (x.ham && t && t.hamstrung) s -= 4;
    if (x.stun && t && t.state === 'windup') s += 1;
    if (x.lunge && t && Math.hypot(t.x - f.x, t.y - f.y) > f.reach * 1.5) s += 1.5;
    if (s > bs) { bs = s; best = a; }
  }
  return best;
}
// The player has chosen for the man the fight stopped for.
function pickAbility(B, id) {
  const f = B.pick;
  if (!f) return false;
  const a = f.abl.find(x => x.id === id) || f.abl[0];
  B.pick = null;
  if (!out(f)) castAbility(B, f, a);
  return true;
}
