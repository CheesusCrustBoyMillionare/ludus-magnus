'use strict';
// Game state and the management simulation: roster, days, economy, bouts, events.

const SAVE_KEY = 'ludus-magnus-save-v1';
let G = null;

const rand = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const chance = p => Math.random() < p;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- saving ----------
// The game autosaves to the current slot after every action. Each slot also keeps one
// backup, taken on the morning of the most recent games day.

const SLOT_COUNT = 5;
const CURRENT_KEY = 'ludus-magnus-current';
const slotKey = n => 'ludus-magnus-slot-' + n;
let slot = 1;

function save() {
  try {
    G.savedAt = Date.now();
    localStorage.setItem(slotKey(slot), JSON.stringify(G));
    localStorage.setItem(CURRENT_KEY, String(slot));
  } catch (e) { /* storage unavailable or full */ }
}

function readSlot(n, backup) {
  try {
    const s = localStorage.getItem(slotKey(n) + (backup ? '-backup' : ''));
    const d = s ? JSON.parse(s) : null;
    return d && Array.isArray(d.roster) && typeof d.day === 'number' ? d : null;
  } catch (e) { return null; }
}

function slotInfo(n, backup) {
  const d = readSlot(n, backup);
  if (!d) return null;
  let t = 0;
  TIERS.forEach((x, i) => { if (d.fame >= x.fame) t = i; });
  return { day: d.day, fame: d.fame, denarii: d.denarii, roster: d.roster.length, savedAt: d.savedAt || 0, won: !!d.won, over: !!d.over, tier: TIERS[t].name };
}

function loadSlot(n, backup) {
  const d = readSlot(n, backup);
  if (!d) return false;
  G = d; slot = n;
  migrate();
  save();
  return true;
}

// Called once at start-up. Returns false when there is nothing to load.
function load() {
  try {
    const legacy = localStorage.getItem(SAVE_KEY);            // the single save from before slots existed
    if (legacy && !localStorage.getItem(slotKey(1))) localStorage.setItem(slotKey(1), legacy);
    if (legacy) localStorage.removeItem(SAVE_KEY);
    let n = +localStorage.getItem(CURRENT_KEY) || 0;
    if (!readSlot(n)) { n = 0; for (let i = 1; i <= SLOT_COUNT && !n; i++) if (readSlot(i)) n = i; }
    return n ? loadSlot(n) : false;
  } catch (e) { return false; }
}

function copyToSlot(n) { try { localStorage.setItem(slotKey(n), JSON.stringify(G)); return true; } catch (e) { return false; } }
function backupSlot() { try { localStorage.setItem(slotKey(slot) + '-backup', JSON.stringify(G)); } catch (e) { /* full */ } }
function deleteSlot(n) { try { localStorage.removeItem(slotKey(n)); localStorage.removeItem(slotKey(n) + '-backup'); } catch (e) { /* unavailable */ } }

// Puts a save file's contents into a slot. Returns an error message, or null if it worked.
function importSave(text, n) {
  let d;
  try { d = JSON.parse(text); } catch (e) { return 'That file is not a Ludus Magnus save (it is not valid JSON).'; }
  if (!d || typeof d !== 'object' || !Array.isArray(d.roster) || typeof d.day !== 'number' || typeof d.denarii !== 'number' || !Array.isArray(d.log)) {
    return 'That file is not a Ludus Magnus save.';
  }
  try { localStorage.setItem(slotKey(n), JSON.stringify(d)); localStorage.removeItem(slotKey(n) + '-backup'); }
  catch (e) { return 'There is no room left to store that save.'; }
  return null;
}

function log(text, kind) {
  G.log.push({ d: G.day, t: text, k: kind || '' });
  if (G.log.length > 250) G.log.shift();
}

// ---------- gladiators ----------

// A name nobody in your ludus or the market already answers to, where the origin has one to spare.
function freshName(origin) {
  const used = new Set((G.roster || []).concat(G.market || []).map(g => g.name));
  const free = origin.names.filter(n => !used.has(n));
  return pick(free.length ? free : origin.names);
}

function makeGladiator(budget, o) {
  o = o || {};
  const cls = o.cls || pick(Object.keys(CLASSES));
  const origin = pick(ORIGINS);
  const stats = { str: 2, agi: 2, end: 2, skl: 2 };
  const bias = CLASSES[cls].bias;
  const bag = [];
  STATS.forEach(s => { for (let i = 0; i < bias[s]; i++) bag.push(s); });
  let pts = Math.max(0, Math.round(budget) - 8), guard = 0;
  while (pts > 0 && guard++ < 2000) {
    const s = pick(bag);
    if (stats[s] < 20) { stats[s]++; pts--; }
  }
  const traits = [];
  const keys = Object.keys(TRAITS).filter(k => !TRAITS[k].special);
  const n = (chance(0.55) ? 1 : 0) + (chance(0.25) ? 1 : 0);
  while (traits.length < n) { const t = pick(keys); if (!traits.includes(t)) traits.push(t); }
  const g = {
    id: ++G.nextId, name: freshName(origin), origin: origin.name, cls, stats,
    prog: { str: 0, agi: 0, end: 0, skl: 0 },
    pot: { str: rand(0.7, 1.4), agi: rand(0.7, 1.4), end: rand(0.7, 1.4), skl: rand(0.7, 1.4) },
    traits, hp: 0, fatigue: 0, morale: 60, injury: 0,
    activity: 'rest', tactic: 'balanced', weapon: o.weapon || 0, armor: o.armor || 0,
    wins: 0, losses: 0, kills: 0, fame: 0, foughtDay: -1,
    story: [], wish: null, lostTo: null, promise: null,
    xp: 0, rank: 0, perkPending: 0, perkOffer: null,
    look: { skin: origin.skin, hair: pick(origin.hair) },
  };
  g.hp = maxHp(g);
  return g;
}

function maxHp(g) {
  return Math.round((60 + g.stats.end * 7 + g.stats.str * 2) * (g.traits.includes('ironhide') ? 1.15 : 1) * (g.beast ? BEASTS[g.cls].hpMult : 1));
}
function statSum(g) { return g.stats.str + g.stats.agi + g.stats.end + g.stats.skl; }
function power(g) {
  const s = g.stats;
  const traits = g.traits.reduce((n, t) => n + (TRAITS[t].good ? 1 : -1), 0);
  return (s.str * 1.1 + s.agi + s.end + s.skl) * (1 + 0.07 * g.weapon + 0.07 * g.armor) * (1 + 0.05 * traits)
    * (0.94 + g.morale / 1000) * (0.6 + 0.4 * g.hp / maxHp(g)) * (g.beast ? BEASTS[g.cls].pw : 1);
}
function talent(g) { return (g.pot.str + g.pot.agi + g.pot.end + g.pot.skl) / 4; }
function value(g) {
  // proven fighters cost far more than raw stock
  let v = Math.pow(statSum(g), 1.6) * 0.85 * (0.6 + 0.4 * talent(g)) * (1 + Math.max(0, statSum(g) - 30) * 0.04);
  for (let i = 1; i <= g.weapon; i++) v += GEAR_COST[i] * 0.5;
  for (let i = 1; i <= g.armor; i++) v += GEAR_COST[i] * 0.5;
  return Math.round(v / 5) * 5;
}
function stars(p) { return clamp(Math.round((p - 0.7) / 0.7 * 4) + 1, 1, 5); }
function byId(id) { return G.roster.find(g => g.id === +id); }
function canFight(g) { return g.injury <= 0 && g.foughtDay !== G.day; }

// ---------- staff, patrons, ranks ----------

function staffLvl(role) { return G.staff[role] ? G.staff[role].skill : 0; }
function wages() { return Object.values(G.staff).reduce((s, x) => s + x.wage, 0); }
function stipend() { return Math.round(G.patrons.guild / 10 * (1 + tier())); }
function favor(k, d) { G.patrons[k] = clamp(G.patrons[k] + d, 0, 100); }
function mercyBonus() { return 0.04 * G.fac.infirmary + 0.03 * staffLvl('medicus') + G.patrons.temple * 0.001; }
function giftCost(k) { return Math.round((40 + 25 * G.gifts[k]) * (1 + tier() * 0.5) / 5) * 5; }

function genHires() {
  const maxS = clamp(1 + tier(), 1, 3);
  const roles = Object.keys(STAFF_ROLES).sort(() => Math.random() - 0.5).slice(0, 3);
  G.hires = roles.map(role => {
    const skill = rint(1, maxS);
    return { id: ++G.nextId, role, skill, name: pick(STAFF_NAMES), fee: 40 * skill * skill + rint(0, 4) * 5, wage: 1 + 2 * skill };
  });
}

function checkRank(g) {
  let up = false;
  while (g.rank < RANKS.length - 1 && g.xp >= RANKS[g.rank + 1].xp) { g.rank++; g.perkPending++; up = true; }
  return up;
}
function perkOffer(g) {
  if (!g.perkOffer) {
    g.perkOffer = Object.keys(TRAITS).filter(t => TRAITS[t].good && !TRAITS[t].special && !g.traits.includes(t)).sort(() => Math.random() - 0.5).slice(0, 3);
  }
  return g.perkOffer;
}
function choosePerk(g, t) {
  if (g.perkPending <= 0 || !perkOffer(g).includes(t)) return;
  g.traits.push(t); g.perkPending--; g.perkOffer = null;
  addStory(g, `Learned: ${TRAITS[t].name}.`);
  log(`${g.name} the ${RANKS[g.rank].name} learns: ${TRAITS[t].name}.`, 'gold');
}

// bring a save from an earlier version up to date
function migrate() {
  G.staff = G.staff || {};
  G.hires = G.hires || [];
  G.patrons = G.patrons || { magistrate: 20, guild: 10, temple: 10 };
  G.gifts = G.gifts || { magistrate: 0, guild: 0, temple: 0 };
  if (G.autoRest === undefined) G.autoRest = true;
  if (G.fix === undefined) G.fix = null;
  const fixG = g => {
    if (g && g.xp === undefined) { g.xp = g.wins * 5 + g.losses * 2 + g.kills; g.rank = 0; g.perkPending = 0; g.perkOffer = null; checkRank(g); }
  };
  G.roster.forEach(fixG); G.market.forEach(fixG);
  (G.bouts || []).forEach(b => (b.enemies || []).forEach(fixG));
  if (!G.houses) initHouses();
  if (G.tourney === undefined) G.tourney = null;
  if (!G.bonds) G.bonds = [];
  G.roster.concat(G.market).forEach(g => { if (!g.story) { g.story = []; g.wish = null; g.lostTo = null; g.promise = null; } });
  if (!G.tut) G.tut = { step: 0, on: false };
  if (!G.festival) scheduleFestival();
  if (G.pendingEvent && G.pendingEvent.c && typeof G.pendingEvent.c.g === 'object') fixG(G.pendingEvent.c.g);
  if (!G.hires.length && !Object.keys(G.staff).length) genHires();
}

const needProg = s => 1.2 + s * 0.35;
function addProg(g, stat, amt) {
  let up = false;
  if (g.stats[stat] >= 20) return false;
  g.prog[stat] += amt;
  while (g.stats[stat] < 20 && g.prog[stat] >= needProg(g.stats[stat])) {
    g.prog[stat] -= needProg(g.stats[stat]);
    g.stats[stat]++;
    up = true;
  }
  return up;
}

// ---------- world ----------

function tier() {
  let t = 0;
  TIERS.forEach((x, i) => { if (G.fame >= x.fame) t = i; });
  return t;
}
function capacity() { return 3 + 2 * G.fac.barracks; }
function isGamesDay() { return G.day % GAMES_EVERY === 0; }
function daysToGames() { return isGamesDay() ? 0 : GAMES_EVERY - (G.day % GAMES_EVERY); }
function foodCost() { return G.roster.length * RATIONS[G.ration].cost; }
function upkeep() { return foodCost() + wages(); }

function newGame() {
  G = {
    v: 1, day: 1, denarii: 250, fame: 0, nextId: 0, debtDays: 0,
    roster: [], market: [], bouts: null, log: [],
    fac: { barracks: 0, ground: 0, infirmary: 0, baths: 0 },
    ration: 1, pendingEvent: null, won: false, over: false, fallen: [],
    staff: {}, hires: [], autoRest: true, fix: null, tourney: null, festival: null, tut: { step: 0, on: false }, bonds: [],
    patrons: { magistrate: 20, guild: 10, temple: 10 }, gifts: { magistrate: 0, guild: 0, temple: 0 },
  };
  G.roster.push(makeGladiator(23));
  G.roster.push(makeGladiator(21));   // made second so he cannot share the first man's name
  G.roster.forEach(g => addStory(g, 'Came to you with the ludus.'));
  initHouses(); genMarket(); genHires(); scheduleFestival();
  log('You inherit a crumbling ludus, two fighters and a purse of 250 denarii.', 'gold');
  save();
}

function genMarket() {
  const t = tier();
  G.market = [];
  const scout = staffLvl('scout');
  for (let i = 0; i < (scout >= 2 ? 5 : 4); i++) {
    const g = makeGladiator(18 + t * 8 + rint(-3, 6), { weapon: chance(0.3) ? Math.min(3, t) : 0 });
    g.price = Math.round(value(g) * rand(1.0, 1.25) * (scout >= 3 ? 0.9 : 1) / 5) * 5;
    G.market.push(g);
  }
}

const ENEMY_BUDGET = [20, 29, 39, 50];
const FINAL_BUDGET = 61;
const ENEMY_PERKS = [0, 1, 1, 2, 3];
const PURSE = [70, 140, 240, 340];
const DEBT_DAYS = 10;
const FAME = [10, 18, 28, 40];
const DIFF = {
  easy: { name: 'Favoured', stat: 0.85, purse: 0.7, fame: 0.7 },
  even: { name: 'Even match', stat: 1.0, purse: 1.0, fame: 1.0 },
  hard: { name: 'Underdog', stat: 1.18, purse: 1.4, fame: 1.4 },
};

// rival fighters get better gear, perks and spirits in the greater arenas
function makeEnemy(budget, t, o) {
  const g = makeGladiator(budget + rint(-1, 1), {
    cls: o && o.cls,
    weapon: clamp(t + rint(-1, 0), 0, 3), armor: clamp(t + rint(-1, 0), 0, 3),
  });
  const perks = Object.keys(TRAITS).filter(k => TRAITS[k].good && !TRAITS[k].special && !g.traits.includes(k)).sort(() => Math.random() - 0.5);
  g.traits.push(...perks.slice(0, ENEMY_PERKS[t]));
  g.rank = clamp(t, 0, RANKS.length - 1);
  g.morale = 60 + t * 6;
  g.tactic = pick(['balanced', 'balanced', 'aggressive', 'defensive']);
  g.hp = maxHp(g);
  return g;
}

// ---------- rival houses ----------

const houseDef = id => HOUSES.find(h => h.id === id);
const houseOf = id => G.houses.find(h => h.id === id);
const feud = (H, d) => { H.grudge = clamp(H.grudge + d, 0, 100); };

function makeRival(H, budget, t) {
  const def = houseDef(H.id);
  // a house speciality is paid for with slightly rawer recruits
  const handicap = def.trait === 'savage' || def.trait === 'fanatics' || def.trait === 'wealthy' ? 0.94 : 1;
  const g = makeEnemy(budget * handicap, t, def.trait === 'quick' ? { cls: pick(['retiarius', 'dimachaerus', 'thraex']) } : null);
  if (def.trait === 'savage' && !g.traits.includes('brute')) g.traits.push('brute');
  if (def.trait === 'fanatics') { if (!g.traits.includes('lionheart')) g.traits.push('lionheart'); g.morale = 90; }
  if (def.trait === 'butchers') g.tactic = 'aggressive';
  if (def.trait === 'wealthy') g.weapon = Math.min(3, g.weapon + 1);
  g.house = H.id; g.vs = { w: 0, l: 0 }; g.slew = [];
  g.wins = rint(0, 2 + t * 2); g.losses = rint(0, 1 + t);
  return g;
}

function initHouses() {
  G.houses = HOUSES.map(h => ({ id: h.id, prestige: h.start, grudge: 0, won: 0, lost: 0, roster: [] }));
  for (const H of G.houses) for (let i = 0; i < 3; i++) H.roster.push(makeRival(H, ENEMY_BUDGET[tier()] * rand(0.8, 1.0), tier()));
}

function growStats(g, n) {
  const bias = CLASSES[g.cls].bias, bag = [];
  STATS.forEach(k => { for (let i = 0; i < bias[k]; i++) bag.push(k); });
  let guard = 0;
  while (n > 0 && guard++ < 200) { const k = pick(bag); if (g.stats[k] < 20) { g.stats[k]++; n--; } }
}

// Between games the rival schools train, fight each other and replace their dead.
function houseTick() {
  const t = tier(), target = ENEMY_BUDGET[t];
  for (const H of G.houses) {
    const def = houseDef(H.id);
    H.prestige += Math.round(def.rate * rand(0.6, 1.4));
    for (const g of H.roster.slice()) {
      if (chance(0.5)) {
        if (chance(0.6)) g.wins++;
        else {
          g.losses++;
          if (chance(0.08) && !g.slew.length && !g.exYours && !isWanted(g)) {
            H.roster = H.roster.filter(x => x !== g);
            if (g.wins >= 6 || g.vs.w > 0) log(`${g.name} of ${def.name}, ${g.wins} times a victor, has died in another arena.`);
            continue;
          }
        }
      }
      if (statSum(g) < target) growStats(g, rint(1, 2));
      const spare = Object.keys(TRAITS).filter(k => TRAITS[k].good && !TRAITS[k].special && !g.traits.includes(k)).sort(() => Math.random() - 0.5);
      let need = ENEMY_PERKS[t] - g.traits.filter(k => TRAITS[k].good).length;
      while (need-- > 0 && spare.length) g.traits.push(spare.pop());
      const gear = clamp(t - 1, 0, 3);
      g.weapon = Math.max(g.weapon, gear + (def.trait === 'wealthy' ? 1 : 0), 0); g.armor = Math.max(g.armor, gear);
      g.weapon = Math.min(3, g.weapon);
      g.rank = Math.max(g.rank, clamp(t, 0, RANKS.length - 1));
      g.hp = maxHp(g); g.injury = 0; g.fatigue = 0;
    }
    while (H.roster.length < 4) H.roster.push(makeRival(H, target * rand(0.8, 1.0), t));
  }
}

function pickRivals(H, size, budget, t, booked) {
  const picks = H.roster.filter(g => !booked.has(g.id) && statSum(g) >= budget * 0.88 && statSum(g) <= budget * 1.04)
    .sort((a, b) => Math.abs(statSum(a) - budget) - Math.abs(statSum(b) - budget)).slice(0, size);
  while (picks.length < size) { const g = makeRival(H, budget, t); H.roster.push(g); picks.push(g); }
  picks.forEach(g => booked.add(g.id));
  return picks;
}

// ---------- fighter stories: histories, friendships, rivalries, vows ----------

function addStory(g, t) {
  if (!g.story) g.story = [];
  g.story.push({ d: G.day, t });
  if (g.story.length > 14) g.story.shift();
}
function bondBetween(a, b) { return G.bonds.find(x => (x.a === a.id && x.b === b.id) || (x.a === b.id && x.b === a.id)) || null; }
function bondsOf(g) {
  return G.bonds.filter(x => x.a === g.id || x.b === g.id)
    .map(x => ({ type: x.type, other: byId(x.a === g.id ? x.b : x.a) })).filter(x => x.other);
}
function canBond(a, b) { return a !== b && !bondBetween(a, b) && bondsOf(a).length < 2 && bondsOf(b).length < 2; }
function makeBond(a, b, type) {
  if (!canBond(a, b)) return false;
  G.bonds.push({ a: a.id, b: b.id, type });
  const t = type === 'friend' ? 'Became sworn friends with ' : 'Began a bitter rivalry with ';
  addStory(a, t + b.name + '.'); addStory(b, t + a.name + '.');
  return true;
}
function unbondedPair() {
  const r = fit().slice().sort(() => Math.random() - 0.5);
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (canBond(r[i], r[j])) return [r[i], r[j]];
  return null;
}

// A fighter leaves the ludus. why: 'dead', 'sold' or 'freed'. Those bound to him feel it.
function departed(g, why, killer) {
  for (const b of bondsOf(g)) {
    const o = b.other;
    if (b.type === 'friend' && why === 'dead') {
      o.morale = clamp(o.morale - 20, 0, 100);
      addStory(o, `Mourned his friend ${g.name}.`);
      if (killer && killer.house && !o.wish) {
        o.wish = { type: 'avenge', hid: killer.house, gid: killer.id, name: killer.name, for: g.name };
        addStory(o, `Swore to kill ${killer.name} of ${houseDef(killer.house).name}.`);
      }
    } else if (b.type === 'friend' && why === 'sold') {
      o.morale = clamp(o.morale - 12, 0, 100); addStory(o, `Watched his friend ${g.name} sold away.`);
    } else if (b.type === 'friend') {
      o.morale = clamp(o.morale + 10, 0, 100); addStory(o, `Saw his friend ${g.name} walk free.`);
    } else if (why === 'dead') {
      o.morale = clamp(o.morale - 5, 0, 100); addStory(o, `Found the yard too quiet without ${g.name}.`);
    }
  }
  G.bonds = G.bonds.filter(x => x.a !== g.id && x.b !== g.id);
}

// The rival fighter a man has vowed to face, if that rival still lives.
function wishTarget(g) {
  if (!g.wish) return null;
  const H = houseOf(g.wish.hid);
  return H ? H.roster.find(x => x.id === g.wish.gid) || null : null;
}
const isWanted = rival => G.roster.some(g => g.wish && g.wish.gid === rival.id);

function checkWishes() {
  for (const g of G.roster) {
    if (g.wish && !wishTarget(g)) {
      addStory(g, `Heard that ${g.wish.name} died by another's hand, and felt cheated.`);
      g.morale = clamp(g.morale - 5, 0, 100); g.wish = null;
    }
    if (g.lostTo) { const H = houseOf(g.lostTo.hid); if (!H || !H.roster.some(x => x.id === g.lostTo.gid)) g.lostTo = null; }
  }
}

// Called by the arena when a battle is set up.
function applyStories(B) {
  const mine = B.fighters.filter(f => f.team === 0 && !f.g.beast);
  for (const f of mine) {
    for (const o of mine) {
      if (o === f) continue;
      const b = bondBetween(f.g, o.g);
      if (b && b.type === 'friend') f.dmg *= 1.06;
      if (b && b.type === 'rival') f.acc -= 0.03;
    }
    if (f.g.wish) f.hate = B.fighters.find(x => x.team === 1 && x.g.id === f.g.wish.gid) || null;
  }
}

function storyAfterBout(g, f, foes, win, bout, lines) {
  if (win) {
    if (g.wins === 1) addStory(g, `Won his first bout, against ${bout.house}.`);
    for (const x of foes) {
      if (x.fate === 'dead' && x.downedBy === f) addStory(g, x.g.beast ? `Killed a ${x.g.name.toLowerCase()} in the hunt.` : `Slew ${x.g.name} of ${bout.house}.`);
    }
    const t = g.wish && foes.find(x => x.g.id === g.wish.gid);
    if (t) {
      const blood = g.wish.type === 'avenge';
      addStory(g, blood ? `Avenged ${g.wish.for} against ${t.g.name}.` : `Had his rematch with ${t.g.name}, and won it.`);
      lines.push(`<span class="gold"><b>${g.name}</b> ${blood ? 'has avenged ' + g.wish.for : 'has his revenge on ' + t.g.name}.</span>`);
      g.morale = clamp(g.morale + 25, 0, 100); g.xp += 3; g.wish = null; g.lostTo = null;
    }
  } else {
    const rivals = foes.filter(x => x.g.house);
    const by = f.downedBy && f.downedBy.g.house ? f.downedBy.g : rivals.length === 1 ? rivals[0].g : null;
    if (by && !g.wish) g.lostTo = { hid: by.house, gid: by.id, name: by.name };
    if (f.fate === 'spared' && f.hp <= 0) addStory(g, bout.hunt ? 'Mauled in the hunt, and dragged clear alive.' : `Struck down by ${bout.house}, and spared.`);
    if (g.wish && foes.some(x => x.g.id === g.wish.gid)) { g.morale = clamp(g.morale - 10, 0, 100); addStory(g, `Failed against ${g.wish.name} again.`); }
  }
}

// ---------- festivals: hunts, great melees, funeral games, the tournament ----------

const round5 = v => Math.round(v / 5) * 5;

function scheduleFestival() {
  const day = Math.floor(G.day / FESTIVAL_EVERY) * FESTIVAL_EVERY + FESTIVAL_EVERY;
  const type = day % (FESTIVAL_EVERY * 2) === 0 ? 'tourney' : day === FESTIVAL_EVERY ? 'hunt' : pick(['hunt', 'melee', 'funeral']);
  G.festival = { day, type };
}

function makeBeast(kind, budget) {
  const b = BEASTS[kind], stats = { str: 2, agi: 2, end: 2, skl: 2 }, bag = [];
  STATS.forEach(k => { for (let i = 0; i < b.bias[k]; i++) bag.push(k); });
  let pts = Math.max(0, Math.round(budget * b.budget) - 8), guard = 0;
  while (pts > 0 && guard++ < 2000) { const k = pick(bag); if (stats[k] < 20) { stats[k]++; pts--; } }
  const g = {
    id: ++G.nextId, name: b.name, origin: 'the wilds', cls: kind, beast: true, stats, traits: [],
    hp: 0, fatigue: 0, morale: 60, injury: 0, tactic: 'balanced', weapon: 0, armor: 0,
    wins: 0, losses: 0, kills: 0, fame: 0, look: { skin: '#000000', hair: '#000000' },
  };
  g.hp = maxHp(g);
  return g;
}

function addFestival(t, bouts, booked) {
  let type = G.festival.type;
  if ((type === 'melee' || type === 'funeral') && t < 1) type = 'hunt';   // the village pits can only afford animals
  G.festival.shown = type;
  const B0 = ENEMY_BUDGET[t], fav = 1 + G.patrons.magistrate * 0.003;
  if (type === 'hunt') {
    const hunts = [['easy', ['boar']], ['even', ['lion']], ['hard', ['bear']]];
    if (t >= 1) hunts.push(['even', ['wolf', 'wolf', 'wolf']]);
    if (t >= 2) hunts.push(['hard', ['lion', 'bear']]);
    for (const [diff, kinds] of hunts) {
      const size = kinds.length > 1 ? 2 : 1, D = DIFF[diff];
      bouts.push({
        id: ++G.nextId, size, diff, death: false, done: false, hunt: true, house: 'the beast-masters',
        enemies: kinds.map(k => makeBeast(k, B0)),
        purse: round5(PURSE[t] * D.purse * Math.pow(size, 0.7) * fav),
        fame: Math.round(FAME[t] * D.fame * Math.pow(size, 0.5) * 1.4),
      });
    }
  } else if (type === 'melee') {
    const size = t >= 2 ? 5 : 4, H = pick(G.houses);
    const foes = pickRivals(H, size, B0 * 0.95, t, booked);
    bouts.push({
      id: ++G.nextId, size, diff: 'even', death: false, done: false, melee: true, houseId: H.id, house: houseDef(H.id).name,
      enemyIds: foes.map(g => g.id), purse: round5(PURSE[t] * Math.pow(size, 0.7) * 1.3 * fav), fame: Math.round(FAME[t] * Math.pow(size, 0.5) * 1.5),
    });
  } else if (type === 'funeral') {
    for (const b of bouts) {
      if (b.grudge) continue;
      b.death = true; b.funeral = true; b.purse = round5(b.purse * 1.6); b.fame = Math.round(b.fame * 1.3);
    }
  } else if (type === 'tourney') genTourney(t, booked);
}

// --- the Laurel Tournament: eight fighters, single elimination, all in one day ---

const tRival = e => { const H = e && e.hid && houseOf(e.hid); return H ? H.roster.find(g => g.id === e.gid) : null; };
function tourneyPrize(T, r) { return { purse: round5(PURSE[T.t] * [0.8, 1.5, 4][r]), fame: Math.round(FAME[T.t] * [1, 1.5, 5][r]) }; }

function genTourney(t, booked) {
  const pool = [];
  for (const H of G.houses) H.roster.filter(g => !booked.has(g.id)).forEach(g => pool.push({ hid: H.id, g }));
  pool.sort((a, b) => power(b.g) - power(a.g));
  const picks = [], per = {};
  for (const e of pool) {
    if (picks.length >= 7) break;
    if ((per[e.hid] || 0) >= 2) continue;
    per[e.hid] = (per[e.hid] || 0) + 1; picks.push(e);
  }
  while (picks.length < 7) { const H = pick(G.houses), g = makeRival(H, ENEMY_BUDGET[t], t); H.roster.push(g); picks.push({ hid: H.id, g }); }
  picks.forEach(e => booked.add(e.g.id));
  G.tourney = {
    day: G.day, t, fee: round5(PURSE[t] * 0.5), state: 'open', round: 0, entrant: null, bout: null, log: [],
    field: picks.map(e => ({ hid: e.hid, gid: e.g.id, name: e.g.name })), alive: null,
  };
}

function enterTourney(gid) {
  const T = G.tourney, g = byId(gid);
  if (!T || T.state !== 'open' || !g || !canFight(g) || G.denarii < T.fee) return false;
  G.denarii -= T.fee; T.entrant = g.id; T.state = 'running';
  g.foughtDay = G.day;                     // he is kept out of the ordinary bouts
  const f = T.field;                       // strongest first; the favourite sits in the far half of the draw
  T.alive = [{ you: true }, f[6], f[3], f[4], f[1], f[5], f[2], f[0]];
  log(`${g.name} is entered in the Laurel Tournament.`, 'gold');
  nextTourneyBout();
  save();
  return true;
}

function nextTourneyBout() {
  const T = G.tourney, opp = T.alive[1], pz = tourneyPrize(T, T.round);
  T.bout = {
    id: ++G.nextId, size: 1, diff: 'even', death: false, done: false, tourney: true, round: T.round,
    houseId: opp.hid, house: houseDef(opp.hid).name, enemyIds: [opp.gid], purse: pz.purse, fame: pz.fame,
  };
}

function simMatch(a, b) {
  const ga = tRival(a), gb = tRival(b);
  if (!ga) return b;
  if (!gb) return a;
  const pa = Math.pow(power(ga), 4), pb = Math.pow(power(gb), 4);
  const aWins = Math.random() < pa / (pa + pb);
  (aWins ? ga : gb).wins++; (aWins ? gb : ga).losses++;
  return aWins ? a : b;
}

function advanceTourney(win, lines) {
  const T = G.tourney, me = byId(T.entrant), rn = ROUND_NAMES[T.round];
  const next = [win ? { you: true } : T.alive[1]];
  for (let i = 2; i + 1 < T.alive.length; i += 2) next.push(simMatch(T.alive[i], T.alive[i + 1]));
  const others = next.slice(1).map(e => e.name).join(', ');
  T.log.push(`${rn}: ${!win ? 'your man is out' : next.length === 1 ? 'your man wins it' : 'your man goes through'}${others ? '. Also through: ' + others : ''}.`);
  T.alive = next; T.round++; T.bout = null;
  if (!win) { finishTourneyOffscreen(); return; }
  if (next.length === 1) {
    T.state = 'done'; T.champion = 'you';
    if (me && !me.traits.includes('laureate')) me.traits.push('laureate');
    if (me) addStory(me, 'Won the Laurel Tournament.');
    favor('magistrate', 10);
    lines.push(`<span class="gold"><b>${me ? me.name : 'Your man'}</b> wins the Laurel Tournament and is crowned before the whole town.</span>`);
    log(`${me ? me.name : 'Your man'} wins the Laurel Tournament.`, 'gold');
    return;
  }
  if (me) { me.hp = Math.min(maxHp(me), me.hp + (maxHp(me) - me.hp) * 0.35); me.injury = 0; }   // a little wine and a bandage between rounds
  nextTourneyBout();
}

// Plays out whatever is left of the tournament without the player.
function finishTourneyOffscreen() {
  const T = G.tourney;
  let alive = (T.alive || T.field).filter(e => !e.you);
  while (alive.length > 1) {
    const nx = [];
    for (let i = 0; i + 1 < alive.length; i += 2) nx.push(simMatch(alive[i], alive[i + 1]));
    if (alive.length % 2) nx.push(alive[alive.length - 1]);
    alive = nx;
  }
  const c = alive[0];
  T.state = 'done'; T.bout = null; T.champion = c.name; T.championHouse = c.hid;
  houseOf(c.hid).prestige += 25;
  T.log.push(`${c.name} of ${houseDef(c.hid).name} takes the laurel.`);
  log(`${c.name} of ${houseDef(c.hid).name} wins the Laurel Tournament.`, 'gold');
}

function boutEnemies(b) {
  if (b.enemies) return b.enemies;
  const H = houseOf(b.houseId);
  return b.enemyIds.map(id => H.roster.find(g => g.id === id)).filter(Boolean);
}

function genBouts() {
  const t = tier(), bouts = [], booked = new Set();
  houseTick();
  const sizes = t === 0 ? [1, 1, 1] : t === 1 ? [1, 1, 2] : t === 2 ? [1, 2, 2, 3] : [1, 2, 3, 3];
  if (G.patrons.magistrate >= 60) sizes.push(t >= 1 ? 2 : 1);
  const diffs = ['easy', 'even', 'hard', 'even', 'hard'];
  // a house with a serious feud sends its best man to call you out
  const foe = G.houses.filter(H => H.grudge >= 40).sort((a, b) => b.grudge - a.grudge)[0];
  const champ = foe && foe.roster.filter(g => !booked.has(g.id)).sort((a, b) => statSum(b) - statSum(a))[0];
  if (champ) {
    booked.add(champ.id);
    bouts.push({
      id: ++G.nextId, size: 1, diff: 'hard', death: t >= 1, grudge: true, done: false,
      houseId: foe.id, house: houseDef(foe.id).name, enemyIds: [champ.id],
      purse: Math.round(PURSE[t] * 2 / 5) * 5, fame: FAME[t] * 2,
    });
  }
  // a man with a vow gets his chance: the rival he wants is put on the card
  for (const g of G.roster) {
    const r = wishTarget(g);
    if (!r || booked.has(r.id) || g.injury > 0 || !chance(0.6)) continue;
    booked.add(r.id);
    bouts.push({
      id: ++G.nextId, size: 1, diff: 'even', death: g.wish.type === 'avenge' && t >= 1, vow: g.id, done: false,
      houseId: r.house, house: houseDef(r.house).name, enemyIds: [r.id], purse: round5(PURSE[t] * 1.2), fame: Math.round(FAME[t] * 1.3),
    });
  }
  const order = G.houses.slice().sort(() => Math.random() - 0.5);
  sizes.forEach((size, i) => {
    const diff = diffs[i], D = DIFF[diff];
    const H = order[i % order.length], def = houseDef(H.id);
    const death = t >= 1 && chance(def.trait === 'butchers' ? 0.35 : 0.15);
    const foes = pickRivals(H, size, ENEMY_BUDGET[t] * D.stat, t, booked);
    bouts.push({
      id: ++G.nextId, size, diff, death, done: false, houseId: H.id, house: def.name, enemyIds: foes.map(g => g.id),
      purse: Math.round(PURSE[t] * D.purse * Math.pow(size, 0.7) * (death ? 1.3 : 1) * (1 + G.patrons.magistrate * 0.003) / 5) * 5,
      fame: Math.round(FAME[t] * D.fame * Math.pow(size, 0.5) * (death ? 1.4 : 1) * (H.prestige > G.fame ? 1.15 : 1)),
    });
  });
  if (G.festival && G.festival.day === G.day) addFestival(t, bouts, booked);
  for (const H of G.houses) {
    while (H.roster.length > 7) {
      const drop = H.roster.filter(g => !booked.has(g.id) && !g.slew.length && !g.exYours && !isWanted(g)).sort((a, b) => statSum(a) - statSum(b))[0];
      if (!drop) break;
      H.roster = H.roster.filter(g => g !== drop);
    }
  }
  if (G.fame >= FINAL_FAME && !G.won) {
    const enemies = [];
    for (let k = 0; k < 3; k++) enemies.push(makeEnemy(FINAL_BUDGET, 4));
    bouts.unshift({
      id: ++G.nextId, size: 3, diff: 'hard', death: false, enemies, done: false, final: true,
      house: "The Emperor's Champions", purse: 3000, fame: 300,
    });
  }
  G.bouts = bouts;
}

function winOdds(mine, foes) {
  const a = mine.reduce((s, g) => s + power(g), 0), b = foes.reduce((s, g) => s + power(g), 0);
  if (!a) return { p: 0, pay: 0 };
  const p = Math.pow(a, 4) / (Math.pow(a, 4) + Math.pow(b, 4));
  return { p, pay: Math.round(clamp(0.9 / p, 1.1, 6) * 10) / 10 };
}

// ---------- day cycle ----------

function endDay() {
  const F = G.fac;
  for (const g of G.roster) {
    const mh = maxHp(g);
    if (g.activity === 'spar' && !staffLvl('doctore')) g.activity = 'rest';
    const tiredOut = G.autoRest && g.fatigue > 75;
    const resting = g.injury > 0 || g.activity === 'rest' || tiredOut;
    if (g.injury > 0) {
      g.injury -= 1;
      if (chance(0.25 * F.infirmary + 0.15 * staffLvl('medicus'))) g.injury -= 1;
      if (g.injury <= 0) { g.injury = 0; log(`${g.name} is fit to train again.`); }
    }
    if (resting) {
      g.fatigue -= 30 + 8 * F.baths;
      g.hp += mh * (0.22 + 0.08 * F.infirmary + 0.04 * staffLvl('cook'));
      g.morale += 2 + 2 * F.baths;
    } else {
      const spar = g.activity === 'spar';
      let m = (1 + 0.2 * F.ground) * (1 + 0.15 * staffLvl('doctore'));
      if (g.traits.includes('disciplined')) m *= 1.2;
      if (g.traits.includes('lazy')) m *= 0.8;
      if (g.traits.includes('embittered')) m *= 0.7;
      if (bondsOf(g).some(b => b.type === 'rival')) m *= 1.1;      // nothing drives a man like someone to outdo
      m *= (1 - g.fatigue / 160) * (0.75 + g.morale / 250);
      for (const st of (spar ? STATS : [g.activity])) {
        if (addProg(g, st, m * g.pot[st] * (spar ? 0.32 : 1))) log(`${g.name}'s ${STAT_NAMES[st].toLowerCase()} rises to ${g.stats[st]}.`, 'good');
      }
      g.fatigue += (13 - g.stats.end * 0.25) * (g.traits.includes('tireless') ? 0.7 : 1) * (spar ? 0.7 : 1);
      g.hp += mh * 0.06;
      if (g.fatigue > 75 && chance(0.12)) {
        g.injury = Math.round(rint(2, 4) * (g.traits.includes('frail') ? 1.5 : 1));
        log(`${g.name}, worked past exhaustion, tears a muscle. Out for ${g.injury} day${g.injury === 1 ? "" : "s"}.`, 'bad');
      }
    }
    const target = Math.min(100, RATIONS[G.ration].morale + 5 * staffLvl('cook') + G.patrons.temple / 10);
    g.morale += clamp(target - g.morale, -3, 3);
    g.fatigue = clamp(g.fatigue, 0, 100);
    g.morale = clamp(g.morale, g.traits.includes('steady') ? 50 : 0, 100);
    g.hp = clamp(g.hp, 1, maxHp(g));
  }

  G.denarii += stipend() - upkeep();
  if (G.denarii < 0) {
    G.debtDays++;
    G.roster.forEach(g => { g.morale = clamp(g.morale - 5, 0, 100); });
    log(`The ludus is in debt (${G.debtDays} of ${DEBT_DAYS} days before the creditors come).`, 'bad');
    if (G.debtDays >= DEBT_DAYS) { G.over = 'debt'; }
  } else G.debtDays = 0;

  if (G.tourney && G.tourney.state !== 'done') finishTourneyOffscreen();
  const ducked = (G.bouts || []).find(b => b.grudge && !b.done);
  if (ducked) {
    favor('magistrate', -5);
    G.roster.forEach(g => { g.morale = clamp(g.morale - 6, 0, 100); });
    log(`You left ${ducked.house}'s challenge unanswered. The men heard of it, and so did the town.`, 'bad');
  }
  G.day++;
  if (G.festival.day < G.day) scheduleFestival();
  if (G.festival.day - G.day === 5) log(`Heralds cry it through the town: ${FESTIVALS[G.festival.type].name}, in five days.`, 'gold');
  if (isGamesDay()) {
    for (const k in G.patrons) G.patrons[k] = Math.max(0, G.patrons[k] - 1);
    genBouts(); checkWishes(); genMarket(); genHires();
    log(`Games are held today at the ${TIERS[tier()].name}. Fresh stock at the market.`, 'gold');
  } else { G.bouts = null; G.tourney = null; }

  if (!G.roster.length && G.denarii < Math.min(...G.market.map(m => m.price))) G.over = 'empty';
  if (!G.over && !isGamesDay() && chance(0.22)) rollEvent();
  if (isGamesDay()) backupSlot();
  save();
}

// ---------- bout resolution ----------

function applyBoutResult(bout, B, wager, pay) {
  const mine = B.fighters.filter(f => f.team === 0), foes = B.fighters.filter(f => f.team === 1);
  const win = B.winner === 0;
  const avgExc = B.time > 0 ? B.excSum / B.time : 0;
  const lines = [];
  const H = bout.houseId ? houseOf(bout.houseId) : null;
  let kills = 0;

  for (const f of foes) {
    if (!f.fate) continue;
    if (f.fate === 'dead') {
      kills++;
      if (H) { H.roster = H.roster.filter(x => x !== f.g); feud(H, 12); }
      if (f.downedBy && f.downedBy.team === 0) { f.downedBy.g.kills++; f.downedBy.g.xp++; }
      lines.push(f.g.beast ? `<span class="dim">The ${f.g.name.toLowerCase()} is slain.</span>` : `<span class="dim">${f.g.name} of ${bout.house} is slain.</span>`);
    } else lines.push(`<span class="dim">The crowd spares ${f.g.name}.</span>`);
  }

  const dead = [];
  for (const f of mine) {
    const g = f.g;
    g.foughtDay = G.day;
    g.fatigue = clamp(g.fatigue + 20, 0, 100);
    STATS.forEach(s => addProg(g, s, win ? 1.0 : 0.6));
    g.xp += win ? 5 : 2;
    if (f.fate) {
      if (f.fate === 'dead') {
        dead.push(g);
        g.killedBy = f.downedBy ? f.downedBy.g : null;
        if (f.downedBy && f.downedBy.g.slew) f.downedBy.g.slew.push(g.name);
        if (H) feud(H, 5);
        lines.push(`<span class="bad"><b>${g.name}</b> dies on the sand.</span>`);
        continue;
      }
      if (f.hp > 0) {
        g.hp = Math.max(1, Math.round(f.hp));
        g.injury = rint(1, 3);
        lines.push(`<b>${g.name}</b> yields, and the crowd lets him live. Wounded for ${g.injury} day${g.injury === 1 ? "" : "s"}.`);
      } else {
      g.hp = Math.max(1, Math.round(maxHp(g) * 0.1));
      g.injury = Math.max(1, Math.round(rint(3, 7) * (g.traits.includes('frail') ? 1.5 : 1)) - G.fac.infirmary);
      lines.push(`<b>${g.name}</b> ${bout.hunt ? 'is dragged clear by the handlers, badly mauled' : 'falls, but the crowd grants mercy'}. Wounded for ${g.injury} day${g.injury === 1 ? "" : "s"}.`);
      }
    } else {
      g.hp = Math.max(1, Math.round(f.hp));
      if (f.hamstrung || f.armWound) {
        g.injury = rint(1, 2);
        lines.push(`<b>${g.name}</b> carries a wound out of the arena. Resting for ${g.injury} day${g.injury === 1 ? "" : "s"}.`);
      }
    }
    if (win) { g.wins++; g.morale = clamp(g.morale + 10, 0, 100); }
    else { g.losses++; g.morale = clamp(g.morale - 8, 0, 100); }
    storyAfterBout(g, f, foes, win, bout, lines);
  }
  for (const g of dead) {
    G.roster = G.roster.filter(x => x !== g);
    const k = g.killedBy; delete g.killedBy;
    departed(g, 'dead', k);
    G.fallen.push({ name: g.name, cls: g.cls, wins: g.wins, day: G.day, by: k ? (k.beast ? 'a ' + k.name.toLowerCase() : k.name + ' of ' + bout.house) : '' });
    log(`${g.name} the ${CLASSES[g.cls].name} died in the arena (${g.wins} victories).`, 'bad');
  }
  if (dead.length) G.roster.forEach(g => { g.morale = clamp(g.morale - 10, 0, 100); });

  for (const f of mine) {
    if (G.roster.includes(f.g) && checkRank(f.g) && (addStory(f.g, `Rose to the rank of ${RANKS[f.g.rank].name}.`), true)) lines.push(`<span class="gold"><b>${f.g.name}</b> rises to the rank of ${RANKS[f.g.rank].name} and may learn a perk.</span>`);
  }

  let purse = 0, fameGain = 0, wagerGain = 0;
  if (win) {
    purse = bout.purse;
    fameGain = Math.round(bout.fame * (0.8 + 0.7 * avgExc)) + kills * 2;
    mine.forEach(f => { f.g.fame += Math.round(fameGain / mine.length); });
    if (wager) wagerGain = Math.round(wager * pay);
    log(`Victory over ${bout.house}: ${purse} denarii, +${fameGain} fame.`, 'good');
  } else {
    purse = bout.death ? 0 : Math.round(bout.purse * 0.15 / 5) * 5;
    log(`Defeat at the hands of ${bout.house}.`, 'bad');
  }
  if (H) {
    for (const f of foes) { if (!f.g.vs) continue; if (win) { f.g.vs.l++; f.g.losses++; } else { f.g.vs.w++; f.g.wins++; } }
    if (win) { H.lost++; feud(H, 3); H.prestige = Math.max(0, H.prestige - 4); } else { H.won++; H.prestige += 8; }
    if (bout.grudge) { feud(H, -30); lines.push(win ? `The feud with ${bout.house} cools. For now.` : `${bout.house} consider the debt paid.`); }
  }
  if (win && mine.length > 1 && chance(0.3)) {             // men who win side by side sometimes become friends
    const alive = mine.map(f => f.g).filter(g => G.roster.includes(g));
    pairs: for (const a of alive) for (const b of alive) {
      if (a !== b && makeBond(a, b, 'friend')) { lines.push(`${a.name} and ${b.name} fought back to back, and leave the sand as friends.`); break pairs; }
    }
  }
  for (const f of mine) {                                    // a promise of freedom falls due
    const g = f.g;
    if (win && G.roster.includes(g) && g.promise && g.wins >= g.promise.at && !G.pendingEvent) G.pendingEvent = { id: 'promiseDue', c: { g: g.id } };
  }
  if (win) { favor('magistrate', bout.death ? 2 : 1); if (avgExc > 0.4) favor('guild', 2); }
  if (G.fix) {
    if (!win) { purse += G.fix.pay; favor('guild', 8); lines.push(`As agreed, ${G.fix.pay} denarii change hands quietly.`); }
    else { favor('guild', -15); lines.push('<span class="bad">The Guild men who paid for your defeat are ruined, and furious.</span>'); }
    G.fix = null;
  }
  G.denarii += purse + wagerGain;
  G.fame += fameGain;
  bout.done = true;
  if (bout.tourney) advanceTourney(win, lines);
  if (bout.final && win) G.won = true;
  if (!G.roster.length && G.denarii < Math.min(...G.market.map(m => m.price))) G.over = 'empty';
  save();
  return { win, lines, purse, fameGain, wager, wagerGain, avgExc };
}

// ---------- random events ----------

const fit = () => G.roster.filter(g => g.injury <= 0);
const gn = id => { const g = byId(id); return g ? g.name : 'someone'; };

const EVENTS = {
  feast: {
    title: 'A magistrate\'s banquet',
    can: () => fit().length > 0,
    make: () => ({ g: pick(fit()).id, pay: 50 + tier() * 40 }),
    text: c => `A magistrate wants <b>${gn(c.g)}</b> to stand at his banquet door like a trophy. He pays well. The gladiator will get no sleep.`,
    opts: [
      { label: c => `Send him (+${c.pay} denarii)`, run: c => { const g = byId(c.g); G.denarii += c.pay; if (g) g.fatigue = clamp(g.fatigue + 35, 0, 100); return `${gn(c.g)} returns at dawn, hollow-eyed. The purse is heavy.`; } },
      { label: () => 'Refuse', run: () => 'The magistrate\'s steward leaves without a word.' },
    ],
  },
  trainer: {
    title: 'The old champion',
    can: () => fit().length > 0 && G.denarii >= 60,
    make: () => ({ g: pick(fit()).id, cost: 60 + tier() * 30 }),
    text: c => `A scarred freedman who once won the wooden sword offers to drill <b>${gn(c.g)}</b> for a day. He wants ${c.cost} denarii.`,
    opts: [
      { label: c => `Pay ${c.cost} denarii`, ok: c => G.denarii >= c.cost, run: c => { const g = byId(c.g); G.denarii -= c.cost; if (g && g.stats.skl < 20) g.stats.skl++; return `By dusk ${gn(c.g)} moves differently. Skill +1.`; } },
      { label: () => 'Send him away', run: () => 'He shrugs and limps off toward the next ludus.' },
    ],
  },
  fever: {
    title: 'Fever in the barracks',
    can: () => G.roster.length >= 2,
    make: () => ({ cost: 20 + 12 * G.roster.length }),
    text: c => `Two men woke shivering and the rest are watching them. A physician can be had for ${c.cost} denarii.`,
    opts: [
      { label: c => `Fetch the physician (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; return 'Bitter draughts and a day of sweating. The fever breaks.'; } },
      { label: () => 'Let it run its course', run: () => {
        const sick = G.roster.filter(g => g.injury <= 0 && chance(0.4));
        sick.forEach(g => { g.injury = rint(2, 4); });
        return sick.length ? `${sick.map(g => g.name).join(', ')} ${sick.length > 1 ? 'are' : 'is'} laid low for days.` : 'By luck alone, it passes.';
      } },
    ],
  },
  brawl: {
    title: 'Blood in the mess hall',
    can: () => fit().length >= 2,
    make: () => { const f = fit().slice().sort(() => Math.random() - 0.5); return { a: f[0].id, b: f[1].id }; },
    text: c => `<b>${gn(c.a)}</b> and <b>${gn(c.b)}</b> came to blows over a bowl of barley. The others are waiting to see what you do.`,
    opts: [
      { label: () => 'Flog them both', run: c => { [c.a, c.b].forEach(id => { const g = byId(id); if (g) g.morale = clamp(g.morale - 12, 0, 100); }); return 'Order is restored. Nobody thanks you for it.'; } },
      { label: () => 'Let them settle it', run: c => {
        if (chance(0.5)) { const g = byId(chance(0.5) ? c.a : c.b); if (g) { g.injury = rint(2, 3); const a = byId(c.a), b = byId(c.b); if (a && b) makeBond(a, b, 'rival'); return `It ends with ${g.name} on the floor and a cracked rib. Out for ${g.injury} day${g.injury === 1 ? "" : "s"}.`; } }
        [c.a, c.b].forEach(id => { const g = byId(id); if (g) g.morale = clamp(g.morale + 8, 0, 100); });
        const a = byId(c.a), b = byId(c.b); if (a && b) makeBond(a, b, 'friend');
        return 'They beat each other bloody and end the night sharing wine. Morale rises.';
      } },
    ],
  },
  volunteer: {
    title: 'A free man at the gate',
    can: () => G.roster.length < capacity(),
    make: () => ({ fee: 40 + tier() * 40, g: makeGladiator(19 + tier() * 8 + rint(0, 5)) }),
    text: c => `<b>${c.g.name}</b> of ${c.g.origin}, drowning in debt, offers to swear the gladiator's oath as a ${CLASSES[c.g.cls].name}. He asks ${c.fee} denarii to pay off his creditors.`,
    opts: [
      { label: c => `Take his oath (${c.fee})`, ok: c => G.denarii >= c.fee && G.roster.length < capacity(), run: c => { G.denarii -= c.fee; G.roster.push(c.g); if (!c.g.story) c.g.story = []; addStory(c.g, 'A free man who swore the oath to pay his debts.'); return `${c.g.name} swears to be burned, bound, beaten and killed by the sword. He joins the ludus.`; } },
      { label: () => 'Turn him away', run: () => 'He walks back down the road.' },
    ],
  },
  gift: {
    title: 'An admirer\'s gift',
    can: () => G.roster.some(g => g.wins > 0),
    make: () => ({ g: pick(G.roster.filter(g => g.wins > 0)).id, sell: 30 + tier() * 25 }),
    text: c => `An amphora of good Falernian arrives, sent by an admirer of <b>${gn(c.g)}</b>.`,
    opts: [
      { label: () => 'Share it among the men', run: () => { G.roster.forEach(g => { g.morale = clamp(g.morale + 10, 0, 100); }); return 'For one night the barracks sounds like a tavern. Morale rises.'; } },
      { label: c => `Sell it (+${c.sell} denarii)`, run: c => { G.denarii += c.sell; return 'Wine is wasted on them anyway.'; } },
    ],
  },
  merchant: {
    title: 'Short measure',
    can: () => G.roster.length > 0,
    make: () => ({ loss: 20 + tier() * 15 }),
    text: c => `The grain merchant has shorted this month's delivery. Making up the difference will cost ${c.loss} denarii.`,
    opts: [
      { label: c => `Pay (${c.loss})`, run: c => { G.denarii -= c.loss; return 'You pay, and remember his face.'; } },
      { label: () => 'Send your largest man to discuss it', run: c => {
        if (chance(0.55)) { G.denarii += c.loss; return `The merchant discovers a clerical error in your favour. +${c.loss} denarii.`; }
        G.denarii -= c.loss * 2; return `The merchant has friends on the town council. The fine costs you ${c.loss * 2} denarii.`;
      } },
    ],
  },
  dinner: {
    title: 'The Magistrate\'s table',
    can: () => G.denarii >= 30,
    make: () => ({ cost: 30 + tier() * 30 }),
    text: c => `The Magistrate is hosting the town's better families, and a lanista who arrives empty-handed is not invited twice. A suitable gift would cost ${c.cost} denarii.`,
    opts: [
      { label: c => `Bring a gift (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; favor('magistrate', 10); return 'He seats you within earshot. Magistrate favour +10.'; } },
      { label: () => 'Stay home', run: () => { favor('magistrate', -6); return 'Your absence is noted. Magistrate favour -6.'; } },
    ],
  },
  fix: {
    title: 'A quiet word',
    can: () => !G.fix && fit().length > 0 && daysToGames() <= 3,
    make: () => ({ pay: 80 + tier() * 90 }),
    text: c => `A man who works for the Grain Guild's gamblers finds you at the baths. Lose your next bout, he says, and ${c.pay} denarii will find their way to you. Win it after taking his word, and the Guild will remember.`,
    opts: [
      { label: () => 'Agree to lose', run: c => { G.fix = { pay: c.pay }; return 'He nods and is gone. Your next bout is spoken for.'; } },
      { label: () => 'Refuse', run: () => 'He shrugs. There are other lanistae.' },
    ],
  },
  vigil: {
    title: 'The priests of Nemesis',
    can: () => G.roster.length > 0,
    make: () => ({ cost: 25 + tier() * 20 }),
    text: c => `Priests of Nemesis come asking an offering of ${c.cost} denarii for the goddess who watches over the arena. Your fighters are listening from the yard.`,
    opts: [
      { label: c => `Make the offering (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; favor('temple', 10); G.roster.forEach(g => { g.morale = clamp(g.morale + 5, 0, 100); }); return 'Incense, a prayer, a blessing over the practice swords. Temple favour +10. Morale rises.'; } },
      { label: () => 'Send them away', run: () => { favor('temple', -5); G.roster.forEach(g => { g.morale = clamp(g.morale - 4, 0, 100); }); return 'The men watch the priests leave. Temple favour -5.'; } },
    ],
  },
  sponsor: {
    title: 'A painted shield',
    can: () => G.roster.some(g => g.wins > 0),
    make: () => ({ g: pick(G.roster.filter(g => g.wins > 0)).id, pay: 40 + tier() * 40 }),
    text: c => `The Grain Guild will pay ${c.pay} denarii to have their mark painted on <b>${gn(c.g)}</b>'s gear. The Magistrate dislikes merchants buying their way into his games.`,
    opts: [
      { label: c => `Take the money (+${c.pay})`, run: c => { G.denarii += c.pay; favor('guild', 8); favor('magistrate', -4); return 'The paint is still wet when the coin arrives. Guild favour +8. Magistrate favour -4.'; } },
      { label: () => 'Decline', run: () => { favor('guild', -3); return 'The Guild finds another ludus. Guild favour -3.'; } },
    ],
  },
  poach: {
    title: 'An offer from a rival',
    can: () => G.roster.length > 2 && G.roster.some(g => g.wins >= 2 && g.injury <= 0),
    make: () => { const g = pick(G.roster.filter(x => x.wins >= 2 && x.injury <= 0)); return { g: g.id, h: pick(G.houses).id, pay: Math.round(value(g) * 1.3 / 5) * 5 }; },
    text: c => `${houseDef(c.h).lanista} of ${houseDef(c.h).name} has watched <b>${gn(c.g)}</b> fight and wants him. The offer is ${c.pay} denarii, well over the market price. You would likely meet him again across the sand.`,
    opts: [
      { label: c => `Sell him (+${c.pay})`, run: c => {
        const g = byId(c.g); if (!g) return 'The deal falls through.';
        G.roster = G.roster.filter(x => x !== g); G.denarii += c.pay; departed(g, 'sold');
        g.wish = null; g.promise = null; g.lostTo = null;
        g.house = c.h; g.vs = { w: 0, l: 0 }; g.slew = []; g.exYours = true; g.hp = maxHp(g); g.fatigue = 0; g.activity = 'rest';
        houseOf(c.h).roster.push(g);
        G.roster.forEach(x => { x.morale = clamp(x.morale - 5, 0, 100); });
        return `${g.name} leaves in the colours of ${houseDef(c.h).name}. The men watch him go.`;
      } },
      { label: () => 'Refuse', run: c => { feud(houseOf(c.h), 5); return 'The refusal is taken as an insult.'; } },
    ],
  },
  poison: {
    title: 'Something in the water',
    can: () => fit().length > 0 && G.houses.some(H => H.grudge >= 30),
    make: () => ({ g: pick(fit()).id, h: G.houses.slice().sort((a, b) => b.grudge - a.grudge)[0].id, cost: 30 + tier() * 25 }),
    text: c => `<b>${gn(c.g)}</b> is doubled over in the yard, grey and sweating. A kitchen boy saw a stranger by the water barrels, wearing the colours of ${houseDef(c.h).name}.`,
    opts: [
      { label: c => `Send for a physician (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; const g = byId(c.g); if (g) g.injury = 1; return 'Purged and furious, he will be on his feet in a day.'; } },
      { label: () => 'Let him sweat it out', run: c => { const g = byId(c.g); if (!g) return 'It passes.'; g.injury = rint(3, 5); return `He will not train for ${g.injury} days.`; } },
      { label: () => 'Accuse them before the Magistrate', ok: () => G.patrons.magistrate >= 40, run: c => {
        const H = houseOf(c.h); H.prestige = Math.max(0, H.prestige - 30); feud(H, 10); favor('magistrate', -5);
        const g = byId(c.g); if (g) g.injury = 2;
        return `The Magistrate fines ${houseDef(c.h).name} and has their man flogged in the forum. They will not forget it.`;
      } },
    ],
  },
  truce: {
    title: 'An olive branch',
    can: () => G.houses.some(H => H.grudge >= 25),
    make: () => ({ h: G.houses.slice().sort((a, b) => b.grudge - a.grudge)[0].id, cost: 40 + tier() * 40 }),
    text: c => `${houseDef(c.h).lanista} sends a slave with a message: the feud is bad for business. A gift of ${c.cost} denarii, and both houses can call it settled.`,
    opts: [
      { label: c => `Send the gift (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; feud(houseOf(c.h), -30); return 'Wine is exchanged. Nobody means a word of it, but the knives go away.'; } },
      { label: () => 'Let them stew', run: () => 'The slave goes home with nothing.' },
    ],
  },
  kinship: {
    title: 'Two of a kind',
    can: () => !!unbondedPair(),
    make: () => { const p = unbondedPair(); return { a: p[0].id, b: p[1].id }; },
    text: c => `<b>${gn(c.a)}</b> and <b>${gn(c.b)}</b> have taken to training together, eating together and watching each other's backs. The doctore says men like that fight harder side by side, and break harder when one of them falls.`,
    opts: [
      { label: () => 'Let it grow', run: c => { const a = byId(c.a), b = byId(c.b); return a && b && makeBond(a, b, 'friend') ? `${a.name} and ${b.name} are sworn friends.` : 'Nothing comes of it.'; } },
      { label: () => 'Keep them apart', run: c => { [c.a, c.b].forEach(id => { const g = byId(id); if (g) g.morale = clamp(g.morale - 4, 0, 100); }); return 'They are given separate cells and separate hours. Neither thanks you.'; } },
    ],
  },
  rivalry: {
    title: 'Bad blood',
    can: () => !!unbondedPair(),
    make: () => { const p = unbondedPair(); return { a: p[0].id, b: p[1].id }; },
    text: c => `<b>${gn(c.a)}</b> has been telling the yard that <b>${gn(c.b)}</b> only wins when the opposition is soft. ${gn(c.b)} has started training until dark.`,
    opts: [
      { label: () => 'Let it burn', run: c => { const a = byId(c.a), b = byId(c.b); return a && b && makeBond(a, b, 'rival') ? 'They will not speak to each other again. Both train like men possessed.' : 'It blows over.'; } },
      { label: () => 'Make them clasp hands', run: c => {
        const a = byId(c.a), b = byId(c.b);
        if (a && b && chance(0.5) && makeBond(a, b, 'friend')) return 'To the surprise of the whole yard, it takes. They are friends by nightfall.';
        [a, b].forEach(g => { if (g) g.morale = clamp(g.morale - 4, 0, 100); });
        return 'They clasp hands and mean none of it.';
      } },
    ],
  },
  rematch: {
    title: 'A matter of pride',
    can: () => G.roster.some(g => g.lostTo && !g.wish && g.injury <= 0),
    make: () => ({ g: pick(G.roster.filter(x => x.lostTo && !x.wish && x.injury <= 0)).id }),
    text: c => { const g = byId(c.g), L = g && g.lostTo; return L ? `<b>${g.name}</b> has not slept properly since ${L.name} of ${houseDef(L.hid).name} put him on the sand. He asks you to get him that fight again.` : 'A fighter broods over an old defeat.'; },
    opts: [
      { label: () => 'Promise him the rematch', run: c => {
        const g = byId(c.g); if (!g || !g.lostTo) return 'The moment has passed.';
        g.wish = { type: 'rematch', hid: g.lostTo.hid, gid: g.lostTo.gid, name: g.lostTo.name };
        g.morale = clamp(g.morale + 8, 0, 100); addStory(g, `Vowed to face ${g.wish.name} again.`);
        return `${g.name} will get his chance when ${g.wish.name} next appears on a card. He hits the training post until his hands bleed.`;
      } },
      { label: () => 'Tell him to forget it', run: c => { const g = byId(c.g); if (g) { g.lostTo = null; g.morale = clamp(g.morale - 8, 0, 100); } return 'He nods, and says nothing for two days.'; } },
    ],
  },
  freedom: {
    title: 'The wooden sword',
    can: () => G.roster.length > 2 && G.roster.some(g => g.wins >= 6 && g.rank >= 2 && !g.promise && !g.askedFree),
    make: () => ({ g: pick(G.roster.filter(x => x.wins >= 6 && x.rank >= 2 && !x.promise && !x.askedFree)).id, more: 3 }),
    text: c => { const g = byId(c.g); return `<b>${gn(c.g)}</b> asks to speak with you alone. He has won ${g ? g.wins : 'many'} times for this house, and he wants to know what it would take to walk out of the gate a free man.`; },
    opts: [
      { label: c => `Promise it after ${c.more} more victories`, run: c => {
        const g = byId(c.g); if (!g) return 'The moment has passed.';
        g.promise = { at: g.wins + c.more }; g.askedFree = true; g.morale = clamp(g.morale + 15, 0, 100);
        addStory(g, `Was promised his freedom after ${c.more} more victories.`);
        return `${g.name} takes your hand on it. He will hold you to the count.`;
      } },
      { label: () => 'Promise nothing', run: c => { const g = byId(c.g); if (g) { g.askedFree = true; g.morale = clamp(g.morale - 10, 0, 100); } return 'He takes it without a word. He will not ask again.'; } },
    ],
  },
  promiseDue: {
    title: 'A promise falls due',
    auto: true,                      // raised when the victories are won, never at random
    can: () => G.roster.some(g => g.promise && g.wins >= g.promise.at),
    make: () => ({ g: G.roster.find(g => g.promise && g.wins >= g.promise.at).id }),
    text: c => `<b>${gn(c.g)}</b> has won the victories you asked of him. He is standing at your door, and half the yard is pretending not to watch.`,
    opts: [
      { label: () => 'Keep your word', run: c => {
        const g = byId(c.g); if (!g) return 'He is gone.';
        const gain = 40 + g.wins * 5;
        G.roster = G.roster.filter(x => x !== g); departed(g, 'freed');
        G.fame += gain; G.roster.forEach(x => { x.morale = clamp(x.morale + 20, 0, 100); });
        log(`${g.name} is given the wooden sword, as promised. +${gain} fame.`, 'gold');
        return `${g.name} takes the wooden sword and walks out a free man. The whole yard saw you keep your word. Fame +${gain}.`;
      } },
      { label: () => 'Break it', run: c => {
        const g = byId(c.g); if (!g) return 'He is gone.';
        g.promise = null; g.morale = 5;
        if (!g.traits.includes('embittered')) g.traits.push('embittered');
        addStory(g, 'Was promised his freedom, and denied it.');
        G.roster.forEach(x => { if (x !== g) x.morale = clamp(x.morale - 12, 0, 100); });
        return `${g.name} looks at you for a long moment and walks back to his cell. Every man in the ludus now knows what your word is worth.`;
      } },
    ],
  },
  leave: {
    title: 'A night in town',
    can: () => fit().length > 0 && daysToGames() >= 2,
    make: () => ({ g: pick(fit()).id }),
    text: c => `<b>${gn(c.g)}</b> asks for a night's leave in town before the games.`,
    opts: [
      { label: () => 'Let him go', run: c => {
        const g = byId(c.g); if (!g) return 'He thinks better of it.';
        g.morale = clamp(g.morale + 15, 0, 100);
        if (chance(0.4)) { g.fatigue = clamp(g.fatigue + 25, 0, 100); return `${g.name} comes back at dawn, grinning and useless for a day.`; }
        return `${g.name} comes back at dusk, sober and grateful.`;
      } },
      { label: () => 'Refuse', run: c => { const g = byId(c.g); if (g) g.morale = clamp(g.morale - 6, 0, 100); return 'He goes back to the training post.'; } },
    ],
  },
};

function rollEvent() {
  const ids = Object.keys(EVENTS).filter(id => !EVENTS[id].auto && EVENTS[id].can());
  if (!ids.length) return;
  const id = pick(ids);
  G.pendingEvent = { id, c: EVENTS[id].make() };
}
