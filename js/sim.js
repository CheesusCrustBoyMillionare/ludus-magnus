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
  const sum = g => g && g.stats ? Object.values(g.stats).reduce((a, b) => a + (+b || 0), 0) : 0;
  const best = d.roster.slice().sort((a, b) => sum(b) - sum(a))[0];
  return { day: d.day, fame: d.fame, denarii: d.denarii, roster: d.roster.length, savedAt: d.savedAt || 0, won: !!d.won, over: !!d.over, tier: TIERS[t].name, gen: d.dynasty ? d.dynasty.gen : 1,
    label: typeof d.label === 'string' ? d.label : '', wins: d.tally ? d.tally.wins : 0, losses: d.tally ? d.tally.losses : 0, best: best ? best.name : '', bestPower: sum(best),
    size: JSON.stringify(d).length };
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

// A name of your own for a save, so five campaigns can be told apart.
function nameSlot(n, label) {
  label = String(label || '').replace(/[<>&"]/g, '').trim().slice(0, 28);
  if (n === slot && G) { G.label = label; save(); return true; }
  const d = readSlot(n);
  if (!d) return false;
  d.label = label;
  try { localStorage.setItem(slotKey(n), JSON.stringify(d)); return true; } catch (e) { return false; }
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
  const stats = { str: 2, agi: 2, skl: 2 };
  const bias = CLASSES[cls].bias;
  const bag = [];
  STATS.forEach(s => { for (let i = 0; i < bias[s]; i++) bag.push(s); });
  let pts = Math.max(0, Math.min(60, Math.round(budget)) - 6), guard = 0;       // the budget is the sum of his three skills
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
    prog: { str: 0, agi: 0, skl: 0 },
    pot: { str: rand(0.7, 1.4), agi: rand(0.7, 1.4), skl: rand(0.7, 1.4) },
    traits, hp: 0, fatigue: 0, morale: 60, injury: 0,
    activity: 'rest', tactic: 'balanced', weapon: o.weapon || 0, armor: o.armor || 0, gear: null,
    wins: 0, losses: 0, kills: 0, fame: 0, foughtDay: -1,
    story: [], wish: null, lostTo: null, promise: null, scars: [],
    xp: 0, rank: 0, perkPending: 0, perkOffer: null, abil: [],
    look: { skin: origin.skin, hair: pick(origin.hair) },
  };
  g.hp = maxHp(g);
  return g;
}

function maxHp(g) {
  return Math.round((60 + statSum(g) * 2.3) * (g.traits.includes('ironhide') ? 1.15 : 1) * (g.traits.includes('heirblood') ? 1.08 : 1) * (g.beast ? BEASTS[g.cls].hpMult : 1));
}
function statSum(g) { return g.stats.str + g.stats.agi + g.stats.skl; }
// The two ratings shown for every fighter: power is what he is, potential is how fast he will become more.
const rating = statSum;
function potential(g) { return Math.round((g.pot.str + g.pot.agi + g.pot.skl) * 10); }
function power(g) {
  const s = g.stats;
  const traits = g.traits.reduce((n, t) => n + (TRAITS[t].good ? 1 : -1), 0);
  return (s.str * 1.06 + s.agi + s.skl) * gearPower(g) * (1 + 0.05 * traits)
    * (0.94 + g.morale / 1000) * (0.6 + 0.4 * g.hp / maxHp(g)) * (g.beast ? BEASTS[g.cls].pw : 1);
}
function talent(g) { return (g.pot.str + g.pot.agi + g.pot.skl) / 3; }
function value(g) {
  // proven fighters cost far more than raw stock
  let v = Math.pow(statSum(g), 1.6) * 0.85 * (0.6 + 0.4 * talent(g)) * (1 + Math.max(0, statSum(g) - 30) * 0.04);
  return Math.round(v / 5) * 5;
}
function stars(p) { return clamp(Math.round((p - 0.7) / 0.7 * 4) + 1, 1, 5); }
function byId(id) { return G.roster.find(g => g.id === +id); }
function canFight(g) { return g.injury <= 0 && !g.away && g.foughtDay !== G.day; }

// ---------- staff, patrons, ranks ----------

function staffLvl(role) { return G.staff[role] ? G.staff[role].skill : 0; }
const facLvl = k => (G.fac && G.fac[k]) || 0;
const regimen = () => REGIMENS[G.regimen === undefined ? 1 : G.regimen] || REGIMENS[1];
// Where morale settles on a given ration: the cook, the Temple, the shrine and how hard the men are worked all count.
const moraleBase = i => RATIONS[i].morale + 5 * staffLvl('cook') + G.patrons.temple / 10 + 3 * facLvl('shrine') + regimen().morale;
function wages() { return Object.values(G.staff).reduce((s, x) => s + x.wage, 0); }
function stipend() { return Math.round(G.patrons.guild / 10 * (1 + tier())); }
function favor(k, d) { G.patrons[k] = clamp(G.patrons[k] + d, 0, 100); }
function mercyBonus() { return 0.04 * G.fac.infirmary + 0.03 * staffLvl('medicus') + 0.02 * facLvl('shrine') + G.patrons.temple * 0.001 - (G.rigged && G.rigged >= G.day ? 0.15 : 0) + (G.blessed && G.blessed >= G.day ? 0.1 : 0); }
// ---- what may be asked of a patron, and what a patron may ask of you ----
// A petition spends favour for something now. One may be put to each patron between one games and the next, and only
// by a house he knows well enough to listen to.
const nextGames = () => G.day + (daysToGames() || GAMES_EVERY);
const hottestHouse = () => G.houses.slice().sort((a, b) => b.grudge - a.grudge)[0];
const PETITIONS = {
  magistrate: [
    { id: 'card', name: 'A richer card', cost: 10, need: 35, desc: 'Every purse at the next games is half as large again.',
      run: () => { G.richCard = nextGames(); return 'He has a word with the men who pay for the games. The next card will be worth fighting for.'; } },
    { id: 'fine', name: 'Have a rival fined', cost: 12, need: 40, desc: 'The house you have the worst feud with loses 25 renown. They will know who asked.',
      block: () => hottestHouse().grudge >= 15 ? '' : 'You have no quarrel worth bringing before him.',
      run: () => { const H = hottestHouse(); H.prestige = Math.max(0, H.prestige - 25); feud(H, 8); return `${houseDef(H.id).name} is found to have broken some ordinance of the games, and pays for it in the forum.`; } },
  ],
  guild: [
    { id: 'advance', name: 'An advance', cost: 8, need: 20, desc: () => `${guildAdvance()} denarii now, against the stipend.`,
      run: () => { const n = guildAdvance(); G.denarii += n; return `A clerk counts ${n} denarii onto the table and writes your name in a long book.`; } },
    { id: 'grain', name: 'Grain at their cost', cost: 10, need: 35, desc: 'Your men eat for nothing until the next games.',
      run: () => { G.grainUntil = nextGames(); return 'Their carts will stop at your gate first. Until the next games the barley costs you nothing.'; } },
  ],
  temple: [
    { id: 'blessing', name: 'A blessing on the school', cost: 10, need: 20, desc: 'Every man\'s morale +15, and the fallen are spared a tenth more often at the next games.',
      run: () => { G.roster.forEach(g => { g.morale = clamp(g.morale + 15, 0, 100); }); G.blessed = nextGames(); return 'The priests come with fire and laurel and go round every cell. The men stand straighter for it.'; } },
    { id: 'heal', name: 'The priests\' care', cost: 12, need: 35, desc: 'Every wound mends two days sooner, and every man is made whole.',
      block: () => G.roster.some(g => !g.away && (g.injury > 0 || g.hp < maxHp(g))) ? '' : 'Nobody here needs it.',
      run: () => { G.roster.forEach(g => { if (g.away) return; g.injury = Math.max(0, g.injury - 2); g.hp = maxHp(g); }); return 'The temple keeps men who know wounds better than any medicus. They work through the night.'; } },
  ],
};
const guildAdvance = () => 60 + tier() * 60 + stipend() * 3;
// Why a petition cannot be put just now, or nothing if it can.
function petitionBlock(k, P) {
  if ((G.petitioned || {})[k] === dealCycle()) return 'You have asked something of them since the last games.';
  if (G.patrons[k] < P.need) return `They do not know you well enough yet: it takes ${P.need} favour.`;
  return P.block ? P.block() : '';
}
function petition(k, id) {
  const P = (PETITIONS[k] || []).find(x => x.id === id);
  if (!P) return { ok: false, text: '' };
  const why = petitionBlock(k, P);
  if (why) return { ok: false, text: why };
  (G.petitioned = G.petitioned || {})[k] = dealCycle();
  const text = P.run();                         // what it gives is reckoned before the favour is spent
  favor(k, -P.cost);
  log(`Asked of ${PATRONS[k].name}: ${P.name.toLowerCase()}. Favour -${P.cost}.`);
  return { ok: true, text };
}
// A patron sometimes wants something of you: asked on the morning of the games, and settled by the morning of the next.
function genRequest() {
  const old = G.request;
  if (old && !old.done) { favor(old.patron, -4); log(`${PATRONS[old.patron].name} asked something of you, and it was not done. Favour -4.`, 'bad'); }
  G.request = null;
  if (G.field || !G.roster.length || !chance(0.65)) return;
  const k = pick(Object.keys(PATRONS)), t = tier();
  G.request = k === 'magistrate' ? { patron: k, type: 'wins', need: 2, got: 0, day: G.day, favor: 8, pay: round5(PURSE[t] * 0.5) }
    : k === 'guild' ? { patron: k, type: 'show', day: G.day, favor: 8, pay: round5(PURSE[t] * 0.6) }
    : { patron: k, type: 'tithe', cost: 30 + t * 30, day: G.day, favor: 9, pay: 0 };
  log(`${PATRONS[k].name} asks something of you: ${requestText(G.request)}.`, 'gold');
}
function requestText(r) {
  return r.type === 'wins' ? `win ${r.need} bouts at today's games` : r.type === 'show' ? 'win a bout today that has the crowd on its feet'
    : `an offering of ${r.cost} denarii before the next games`;
}
function fulfilRequest(lines) {
  const r = G.request; if (!r || r.done) return;
  r.done = true; favor(r.patron, r.favor); G.denarii += r.pay;
  const say = `${PATRONS[r.patron].name} had what was asked. Favour +${r.favor}${r.pay ? `, and ${r.pay} denarii` : ''}.`;
  log(say, 'gold'); if (lines) lines.push(`<span class="gold">${say}</span>`);
}
function payTithe() {
  const r = G.request;
  if (!r || r.done || r.type !== 'tithe' || G.denarii < r.cost) return false;
  G.denarii -= r.cost; fulfilRequest(); return true;
}

function giftCost(k) { return Math.round((40 + 25 * G.gifts[k]) * (1 + tier() * 0.5) / 5) * 5; }

function genHires() {
  const maxS = clamp(1 + tier(), 1, 3);
  const roles = Object.keys(STAFF_ROLES).sort(() => Math.random() - 0.5).slice(0, 4);
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

// Endurance is gone: a fighter from an older save has its points shared out among the three skills that remain,
// lowest first, and whatever he was doing to train it becomes rest.
function fixSkills(g) {
  if (!g || !g.stats || g.stats.end === undefined) return;
  let pts = g.stats.end;
  delete g.stats.end;
  for (let guard = 0; pts > 0 && guard < 200; guard++) { const k = STATS.filter(s => g.stats[s] < 20).sort((a, b) => g.stats[a] - g.stats[b])[0]; if (!k) break; g.stats[k]++; pts--; }
  if (g.prog) delete g.prog.end;
  if (g.pot) delete g.pot.end;
  if (g.activity === 'end') g.activity = 'rest';
  if (!g.abil) g.abil = [];
  g.hp = Math.min(g.hp || 1, maxHp(g));
}

// bring a save from an earlier version up to date
function migrate() {
  G.staff = G.staff || {};
  for (const k in FACILITIES) if (G.fac[k] === undefined) G.fac[k] = 0;      // buildings added since this save was made
  if (G.regimen === undefined) G.regimen = 1;
  G.hires = G.hires || [];
  G.patrons = G.patrons || { magistrate: 20, guild: 10, temple: 10 };
  G.gifts = G.gifts || { magistrate: 0, guild: 0, temple: 0 };
  if (G.autoRest === undefined) G.autoRest = true;
  if (G.fix === undefined) G.fix = null;
  const fixG = g => {
    fixSkills(g);
    if (g && g.xp === undefined) { g.xp = g.wins * 5 + g.losses * 2 + g.kills; g.rank = 0; g.perkPending = 0; g.perkOffer = null; checkRank(g); }
  };
  G.roster.forEach(fixG); G.market.forEach(fixG);
  (G.bouts || []).forEach(b => (b.enemies || []).forEach(fixG));
  if (!G.houses) initHouses();
  G.houses.forEach(H => H.roster.forEach(fixSkills));
  if (G.tourney && G.tourney.bout) (G.tourney.bout.enemies || []).forEach(fixSkills);
  (G.eventQueue || []).concat(G.pendingEvent || []).forEach(e => { if (e && e.c && e.c.g && typeof e.c.g === 'object') fixSkills(e.c.g); });
  if (G.field && G.field.fight) (G.field.fight.foes || []).forEach(fixSkills);
  if (G.tourney === undefined) G.tourney = null;
  if (!G.bonds) G.bonds = [];
  if (!G.armoury) G.armoury = [];
  if (!G.dynasty) G.dynasty = newDynasty();
  if (!G.tally) G.tally = { wins: G.roster.reduce((n, g) => n + g.wins, 0), losses: 0 };
  if (G.over === 'debt') { G.over = false; if (!G.ruin) beginRuin(); }       // an old save that ended in debt now passes to an heir
  // saves from before the blacksmith: turn each fighter's old weapon and armour level into real pieces
  G.roster.concat(G.market).forEach(g => {
    if (g.gear) return;
    g.gear = emptyGear();
    if (g.weapon > 0) g.gear.weapon = makeItem('weapon', [0, 2, 4, 5][g.weapon], g.cls);
    if (g.armor > 0) ARMOR_SLOTS.forEach(slot => { g.gear[slot] = makeItem(slot, [0, 2, 3, 5][g.armor]); });
    g.weapon = 0; g.armor = 0;
  });
  if (!G.smith) { G.smith = { level: 0, stock: [] }; genSmith(); }
  G.roster.forEach(g => { if (!g.scars) { g.scars = []; for (let i = 0; i < Math.min(3, g.losses); i++) g.scars.push({ k: i ? 'cut' : 'deep', p: (g.id + i * 2) % 6 }); } });
  G.roster.concat(G.market).forEach(g => { if (!g.story) { g.story = []; g.wish = null; g.lostTo = null; g.promise = null; } });
  if (!G.tut) G.tut = { step: 0, on: false };
  if (!G.festival) scheduleFestival();
  if (G.pendingEvent && G.pendingEvent.c && typeof G.pendingEvent.c.g === 'object') fixG(G.pendingEvent.c.g);
  if (!G.hires.length && !Object.keys(G.staff).length) genHires();
  if (!G.jobs) G.jobs = [];
  if (!G.reports) G.reports = [];
  if (!G.eventQueue) G.eventQueue = [];
  if (!G.contracts) { G.contracts = []; genContracts(); }
  // journeys are places on the map now: anyone who was away on one alone is brought home, and his place marked
  if (G.field === undefined) G.field = null;
  G.jobs = G.jobs.filter(J => J.kind !== 'quest');
  G.roster.forEach(g => { if (g.away && !G.jobs.some(J => J.id === g.away)) g.away = null; if (g.quest && QUESTS[g.quest.id]) wildMark(questPlace(g.quest.id), 'journey'); else if (g.quest) g.quest = null; });
  wildMap();
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
function foodCost() { return G.grainUntil && G.grainUntil > G.day ? 0 : Math.round(G.roster.filter(g => !g.away).length * Math.max(1, RATIONS[G.ration].cost - (boon('grain') ? 1 : 0)) * (1 - 0.1 * facLvl('stores'))); }
// What the dispensator saves on the day's outgoings.
function thrift() { return Math.round((foodCost() + wages()) * 0.06 * staffLvl('dispensator')); }
function upkeep() { return foodCost() + wages() - thrift(); }

// ---------- the dynasty: ruin, heirs and what the family keeps ----------

function newDynasty() { return { gen: 1, points: 0, tree: {}, boons: [], history: [] }; }
const boon = b => !!(G && G.dynasty && G.dynasty.boons.includes(b));
const legacyLevel = k => (G && G.dynasty && G.dynasty.tree[k]) || 0;
function graceDays() { return GRACE_DAYS + 2 * legacyLevel('credit'); }

// Every fighter who joins a house with the right blood gains from it.
function welcome(g) {
  if (!g.gear) g.gear = emptyGear();
  if (boon('heirblood') && !g.traits.includes('heirblood')) { g.traits.push('heirblood'); g.hp = maxHp(g); }
  if (G.dynasty.map && G.dynasty.map.eagle === 'kept' && !g.traits.includes('eaglesworn')) g.traits.push('eaglesworn');      // the eagle over the gate
  return g;
}

// A new ludus. With no arguments it founds a new dynasty; an heir passes the family's dynasty,
// and may bring one fighter smuggled out of the fallen house.
function newGame(dynasty, carried) {
  const D = dynasty || newDynasty(), lv = k => D.tree[k] || 0, has = b => D.boons.includes(b);
  G = {
    v: 1, day: 1, denarii: 250 + 50 * lv('purse'), fame: 25 * lv('name'), nextId: 0, debtDays: 0,
    roster: [], market: [], bouts: null, log: [],
    fac: { barracks: lv('cells'), ground: lv('yard'), infirmary: 0, baths: 0, shrine: 0, stores: 0, stables: 0 }, regimen: 1,
    ration: 1, pendingEvent: null, won: false, over: false, fallen: [],
    staff: {}, hires: [], autoRest: true, fix: null, tourney: null, festival: null, tut: { step: 0, on: false }, bonds: [],
    armoury: [], smith: { level: lv('forge'), stock: [] }, contracts: [], jobs: [], reports: [], eventQueue: [],
    patrons: { magistrate: 20 + (has('magistrate') ? 20 : 0), guild: 10 + (has('guild') ? 20 : 0), temple: 10 + (has('temple') ? 20 : 0) },
    gifts: { magistrate: 0, guild: 0, temple: 0 },
    dynasty: D, tally: { wins: 0, losses: 0 }, ruin: null, field: null,
  };
  const budget = 2 * lv('blood');
  G.roster.push(makeGladiator(23 + budget));
  G.roster.push(makeGladiator(21 + budget));   // made after the first so he cannot share the first man's name
  if (has('third')) G.roster.push(makeGladiator(20 + budget));
  G.roster.forEach(g => { welcome(g); addStory(g, D.gen > 1 ? 'Bought by the heir to begin again.' : 'Came to you with the ludus.'); });
  const first = G.roster[0];
  if (has('veteran')) { first.xp = RANKS[1].xp; checkRank(first); }
  if (has('panoply')) { first.gear.weapon = makeItem('weapon', 4, first.cls); G.armoury.push(makeItem('chest', 4)); }
  else if (has('blade')) first.gear.weapon = makeItem('weapon', 3, first.cls);
  if (has('doctore')) G.staff.doctore = { name: 'Old ' + pick(STAFF_NAMES), skill: 1, wage: 0 };
  if (has('cook')) G.staff.cook = { name: pick(STAFF_NAMES), skill: 1, wage: 0 };
  if (has('scout')) G.staff.scout = { name: pick(STAFF_NAMES), skill: 1, wage: 0 };
  if (has('medicus')) G.staff.medicus = { name: pick(STAFF_NAMES), skill: 2, wage: 0 };
  if (carried) {          // the man smuggled out arrives older and with nothing but his skill
    const g = carried;
    g.id = ++G.nextId;
    STATS.forEach(k => { g.stats[k] = Math.max(2, Math.round(g.stats[k] * 0.8)); g.prog[k] = 0; });
    Object.assign(g, { gear: emptyGear(), weapon: 0, armor: 0, fatigue: 0, injury: 0, morale: 55, activity: 'rest', foughtDay: -1,
      wish: null, lostTo: null, promise: null, askedFree: false, perkOffer: null, away: null, quest: null });
    g.traits = g.traits.filter(t => t !== 'embittered');
    welcome(g); g.hp = maxHp(g);
    addStory(g, 'Smuggled out of the fallen ludus the night before the creditors came.');
    G.roster.push(g);
  }
  initHouses(); genMarket(); genHires(); genSmith(); genContracts(); scheduleFestival();
  log(D.gen > 1
    ? `The old ludus is gone. You are its heir, the ${ordinal(D.gen)} of your house to keep a school, and you begin again with ${G.denarii} denarii.`
    : 'You inherit a crumbling ludus, two fighters and a purse of 250 denarii.', 'gold');
  save();
}
function ordinal(n) { return ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'][n] || n + 'th'; }

// What a fallen house is worth to those who come after it.
function legacyScore() { return Math.floor(G.fame / 20) + Math.floor(G.day / 10) + G.tally.wins + 5 * tier(); }

function rollBoons(score) {
  const pool = Object.keys(BOONS).filter(b => !G.dynasty.boons.includes(b));
  const want = score < 30 ? [1, 1, 2] : score < 70 ? [1, 2, 2] : [2, 2, 3], out = [];
  for (const t of want) {
    let c = pool.filter(b => BOONS[b].tier === t && !out.includes(b));
    if (!c.length) c = pool.filter(b => !out.includes(b));
    if (c.length) out.push(pick(c));
  }
  return out;
}

// The creditors take the ludus. The game pauses on the succession until an heir is named.
function beginRuin() {
  if (G.ruin) return;
  const D = G.dynasty, earned = legacyScore();
  D.points += earned;
  D.history.push({ gen: D.gen, days: G.day, fame: G.fame, wins: G.tally.wins, tier: TIERS[tier()].name, earned });
  G.ruin = { step: 0, earned, offers: rollBoons(earned), fighter: null, boon: null };
  G.pendingEvent = null; G.eventQueue = [];
  log('The creditors come with soldiers and take the ludus, the men and the keys.', 'bad');
}
function ruinFighter(id) { if (G.ruin) G.ruin.fighter = id && byId(id) ? +id : null; }
function ruinBoon(id) { if (G.ruin && G.ruin.offers.includes(id)) G.ruin.boon = id; }
function legacyCost(k) { const l = G.dynasty.tree[k] || 0; return l < LEGACY_TREE[k].cost.length ? LEGACY_TREE[k].cost[l] : null; }
function buyLegacy(k) {
  const D = G.dynasty, c = legacyCost(k);
  if (c === null || D.points < c) return false;
  D.points -= c; D.tree[k] = (D.tree[k] || 0) + 1;
  return true;
}
function startHeir() {
  const R = G.ruin, D = G.dynasty;
  if (!R) return false;
  if (R.boon && !D.boons.includes(R.boon)) D.boons.push(R.boon);
  D.gen++;
  const g = R.fighter ? byId(R.fighter) : null;
  newGame(D, g ? JSON.parse(JSON.stringify(g)) : null);
  return true;
}

// ---- the slave market ----
// Where a man on the block came from. w: how common. price: what it does to the asking price.
const BACKGROUNDS = {
  plain:    { name: '', w: 4, desc: '' },
  captive:  { name: 'Prisoner of war', w: 3, desc: 'Taken in arms on the frontier. He was a fighting man before he was a slave.', make: g => growStats(g, 2) },
  convict:  { name: 'Condemned man', w: 2, price: 0.7, desc: 'Sold to the sword by a court. Cheap and sullen, with nothing left to lose.', make: g => { g.morale = 35; } },
  farmboy:  { name: 'Farm boy', w: 3, desc: 'He has never held a sword, but he is strong, and quick to learn.',
    make: g => { let n = 3, guard = 0; while (n > 0 && guard++ < 50) { const k = pick(STATS); if (g.stats[k] > 2) { g.stats[k]--; n--; } } STATS.forEach(k => { g.pot[k] = Math.min(1.4, g.pot[k] + 0.22); }); } },
  veteran:  { name: 'Old soldier', w: 1, desc: 'Twenty years under the eagles. He will not learn much more, and he does not need to.',
    make: g => { g.stats.skl = Math.min(20, g.stats.skl + 2); STATS.forEach(k => { g.pot[k] = Math.max(0.7, g.pot[k] - 0.18); }); if (!g.traits.includes('disciplined')) g.traits.push('disciplined'); g.traits = g.traits.filter(t => t !== 'lazy'); } },
  fallen:   { name: 'From a fallen school', w: 1, price: 1.1, desc: 'His last lanista went bankrupt. He has stood on the sand before, and has the record to show it.',
    make: g => { g.wins = rint(2, 5); g.losses = rint(0, 2); g.kills = rint(0, 1); g.xp = g.wins * 5 + g.losses * 2; checkRank(g);
      while (g.perkPending > 0) { const sp = Object.keys(TRAITS).filter(k => TRAITS[k].good && !TRAITS[k].special && !g.traits.includes(k)); if (sp.length) g.traits.push(pick(sp)); g.perkPending--; } g.fame = g.wins * 2; } },
  freeborn: { name: 'A free man', w: 1, price: 1.1, desc: 'He sold himself to clear a debt. Nobody put him here but himself.', make: g => { g.morale = 80; } },
};
function giveBackground(g) {
  const bag = []; for (const k in BACKGROUNDS) for (let i = 0; i < BACKGROUNDS[k].w; i++) bag.push(k);
  g.bg = pick(bag);
  const B = BACKGROUNDS[g.bg]; if (B.make) B.make(g);
  g.hp = maxHp(g);
}
function marketPrice(g) {
  const scout = staffLvl('scout'), B = BACKGROUNDS[g.bg] || BACKGROUNDS.plain;
  return Math.max(5, Math.round((value(g) * rand(1.0, 1.25) * (B.price || 1) + (g.gear && g.gear.weapon ? itemPrice(g.gear.weapon) * 0.6 : 0)) * (scout >= 3 ? 0.9 : 1) / 5) * 5);
}
function genMarket() {
  const t = tier(), scout = staffLvl('scout');
  const kept = (G.market || []).filter(m => m.held);       // a man you paid the dealer to hold stays one more turn
  kept.forEach(m => { m.held = false; m.kept = true; });
  G.market = [];
  for (let i = 0; i < (scout >= 2 ? 5 : 4); i++) {
    const order = i === 0 && G.marketOrder && CLASSES[G.marketOrder] ? G.marketOrder : null;        // the kind of man you sent for
    const g = makeGladiator(18 + t * 8 + rint(-3, 6) + (order ? 2 : 0), order ? { cls: order } : null);
    g.gear = emptyGear();
    if (chance(0.3)) g.gear.weapon = makeItem('weapon', clamp(t + rint(0, 1), 0, 6), g.cls);   // some come with their own blade
    giveBackground(g);
    if (order) g.ordered = true;
    g.price = marketPrice(g);
    G.market.push(g);
  }
  G.marketOrder = null;
  if (festToday('triumph')) G.market.forEach(m => { m.price = Math.max(5, round5(m.price * 0.8)); m.spoils = true; });      // the general's prisoners flood the block
  G.market = kept.concat(G.market);
  // now and then the dealer has one man too good for the block, and sells him to whoever bids highest
  G.auction = null;
  if (G.day > 1 && chance(0.35)) {
    const g = makeGladiator(18 + t * 8 + rint(8, 12)); g.gear = emptyGear();
    g.gear.weapon = makeItem('weapon', clamp(t + 1, 0, 6), g.cls);
    g.bg = pick(['captive', 'fallen', 'veteran']); if (BACKGROUNDS[g.bg].make) BACKGROUNDS[g.bg].make(g); g.hp = maxHp(g);
    const v = Math.round((value(g) + itemPrice(g.gear.weapon) * 0.6) / 5) * 5;
    G.auction = { g, h: pick(G.houses).id, worth: v, cap: Math.round(v * rand(0.95, 1.45) / 5) * 5, done: false, won: false };
  }
}
// What may be done about a man on the block besides buying him.
function haggleChance() { return clamp(0.35 + 0.12 * staffLvl('scout') + G.patrons.guild / 400, 0.1, 0.85); }
function haggle(m) {
  if (!m || m.haggled) return null;
  m.haggled = true;
  if (chance(haggleChance())) { const was = m.price; m.price = Math.max(5, Math.round(m.price * 0.85 / 5) * 5); return { ok: true, text: `The dealer swears you are robbing him, and takes ${was - m.price} off the price.` }; }
  m.price = Math.round(m.price * 1.05 / 5) * 5;
  return { ok: false, text: 'The dealer is insulted, or says he is. The price has gone up.' };
}
const holdCost = m => Math.max(5, Math.round(m.price * 0.1 / 5) * 5);
function holdMan(m) {
  if (!m || m.held || m.kept || G.denarii < holdCost(m)) return false;
  const c = holdCost(m); G.denarii -= c; m.price -= c; m.held = true;
  return true;
}
const orderCost = () => 20 + tier() * 15;
function orderMan(cls) {
  if (!CLASSES[cls] || G.marketOrder || G.denarii < orderCost()) return false;
  G.denarii -= orderCost(); G.marketOrder = cls;
  log(`The dealer is paid to bring a ${CLASSES[cls].name} to the next market.`);
  return true;
}
const auctionBids = A => [1, 1.25, 1.5].map(k => Math.round(A.worth * k / 5) * 5);
function auctionBlock(amount) {
  const A = G.auction;
  if (!A || A.done) return 'The lot is sold.';
  if (G.roster.length >= capacity()) return 'No cell free: build more barracks or sell a man.';
  if (G.denarii < amount) return `You are ${amount - G.denarii} denarii short.`;
  return '';
}
function auctionBid(amount) {
  const A = G.auction;
  if (auctionBlock(amount)) return null;
  A.done = true; A.bid = amount;
  const g = A.g, H = houseOf(A.h), def = houseDef(A.h);
  if (amount >= A.cap) {
    A.won = true; G.denarii -= amount;
    addStory(g, `Won at auction for ${amount} denarii, against ${def.name}.`);
    G.roster.push(welcome(g)); feud(H, 4);
    log(`${g.name} the ${CLASSES[g.cls].name} is won at auction for ${amount} denarii.`, 'gold');
    return { ok: true, text: `${def.lanista} shakes his head and turns away. ${g.name} is yours for ${amount} denarii.` };
  }
  g.gear = null; g.weapon = clamp(tier(), 0, 3); g.armor = clamp(tier() - 1, 0, 3);
  g.house = H.id; g.vs = { w: 0, l: 0 }; g.slew = []; g.hp = maxHp(g);
  H.roster.push(g);
  log(`${g.name} goes to ${def.name} at auction. You will meet him again.`, 'bad');
  return { ok: false, text: `${def.lanista} tops you without looking round. ${g.name} goes to ${def.name} for ${A.cap} denarii.` };
}

const ENEMY_BUDGET = [20, 29, 40, 51];
const FINAL_BUDGET = 62;
const ENEMY_PERKS = [0, 1, 1, 2, 3];
const PURSE = [70, 140, 240, 340];
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
// how a house has fared lately, against anyone: its last five results
const houseForm = (H, r) => { (H.form = H.form || []).push(r); if (H.form.length > 5) H.form.shift(); };

// ---- dealings ----
// Once between each games you may have one dealing with each house: mend the quarrel with a gift, call their champion
// out, buy one of their men from under them, or do them harm in the dark.
const dealCycle = () => Math.floor(G.day / GAMES_EVERY);
const houseChampion = H => H.roster.slice().sort((a, b) => statSum(b) - statSum(a))[0] || null;
function dealCost(kind, g) {
  const t = tier();
  return kind === 'gift' ? 40 + t * 40 : kind === 'sabotage' ? 60 + t * 50 : kind === 'buy' && g ? Math.round(value(g) * 1.6 / 5) * 5 : 0;
}
// Why a dealing cannot be had just now, or nothing if it can.
function dealBlock(H, kind, g) {
  if (H.dealt === dealCycle()) return 'You have had your dealing with this house since the last games.';
  const cost = dealCost(kind, g);
  if (kind === 'gift' && H.grudge <= 0) return 'There is no quarrel to mend.';
  if (kind === 'challenge') {
    if (H.called) return 'You have called them out already: it is on the next card.';
    if (!G.roster.some(x => !x.away && x.injury <= 0)) return 'You have no one fit to stand behind it.';
  }
  if (kind === 'buy') {
    if (!g || !H.roster.includes(g)) return 'He is not theirs to sell.';
    if (g === houseChampion(H)) return 'No house sells its champion.';
    if (H.roster.length <= 3) return 'They have too few men to part with one.';
    if (G.roster.length >= capacity()) return 'You have no cell free.';
    if ((G.bouts || []).some(b => !b.done && b.enemyIds && b.enemyIds.includes(g.id))) return 'He is on today\'s card.';
    if (G.tourney && G.tourney.state !== 'done') return 'Not while the tournament is being fought.';
    if (isWanted(g)) return 'One of your own men has business with him on the sand.';
  }
  if (cost > G.denarii) return `You are ${cost - G.denarii} denarii short.`;
  return '';
}
// A man of another house becomes one of yours: his kit is turned into pieces, and what tied him to them is cut.
function takeRival(g) {
  const H = g.house && houseOf(g.house), from = H ? houseDef(H.id).name : 'another house';
  if (H) H.roster = H.roster.filter(x => x !== g);
  const w = g.weapon || 0, a = g.armor || 0;
  delete g.house; delete g.vs; delete g.slew; delete g.exYours; delete g.outUntil;
  g.gear = null; welcome(g);
  if (w > 0) g.gear.weapon = makeItem('weapon', clamp(w, 0, 6), g.cls);
  if (a > 0) g.gear.chest = makeItem('chest', clamp(a, 0, 6));
  g.weapon = 0; g.armor = 0; g.activity = 'rest'; g.foughtDay = -1; g.kills = g.kills || 0; g.fame = g.fame || 0;
  g.xp = Math.max(g.xp || 0, RANKS[g.rank || 0].xp); g.perkPending = 0; g.perkOffer = null;
  g.wish = null; g.lostTo = null; g.promise = null; g.story = []; g.hp = maxHp(g); g.injury = 0; g.fatigue = 0; g.morale = 55;
  G.roster.push(g); addStory(g, `Came over from ${from}.`);
  return g;
}
function houseDeal(H, kind, gid) {
  const g = gid ? H.roster.find(x => x.id === gid) : null, why = dealBlock(H, kind, g), def = houseDef(H.id), cost = dealCost(kind, g);
  if (why) return { ok: false, text: why };
  H.dealt = dealCycle();
  if (kind === 'gift') {
    G.denarii -= cost; feud(H, -20);
    log(`A gift to ${def.name}: the feud eases.`);
    return { ok: true, text: `Wine and a pair of good hounds go to ${def.lanista}. Nothing is forgiven, but the feud eases.` };
  }
  if (kind === 'challenge') {
    H.called = true; feud(H, 10);
    log(`You have called out ${def.name}: their champion will be on the next card.`, 'gold');
    return { ok: true, text: `Your herald reads it in the forum: ${def.name} is called out. Their champion will answer at the next games, for a double purse. Do not be the one who fails to appear.` };
  }
  if (kind === 'buy') {
    G.denarii -= cost; feud(H, 8); takeRival(g);
    log(`${g.name} is bought out of ${def.name} for ${cost} denarii.`, 'gold');
    return { ok: true, text: `${def.lanista} takes the money with a face like a shut door. ${g.name} is yours.` };
  }
  G.denarii -= cost;                           // sabotage
  if (chance(0.65)) {
    const c = houseChampion(H); H.prestige = Math.max(0, H.prestige - (20 + tier() * 10));
    if (c) c.outUntil = dealCycle() + 1;
    return { ok: true, text: `Something in the stew, a cut girth, a word in the wrong ear. ${c ? `${c.name}, their best man, will not fight at the next games, and t` : 'T'}he town is laughing at ${def.name}.` };
  }
  favor('magistrate', -10); feud(H, 25); G.fame = Math.max(0, G.fame - 5);
  log(`Your man was caught in ${def.name}'s kitchen. The Magistrate has heard.`, 'bad');
  return { ok: false, done: true, text: `Your man is caught with his hand in their meal sack and names you before he is asked twice. Magistrate favour -10, fame -5, and ${def.name} will not forget it.` };
}

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
  // the houses meet each other too: two pairs at each games, and the better champion more often wins
  {
    const order = G.houses.slice().sort(() => Math.random() - 0.5), news = [];
    for (let i = 0; i + 1 < order.length; i += 2) {
      const A = order[i], B = order[i + 1], a = houseChampion(A), b = houseChampion(B);
      if (!a || !b) continue;
      const pA = clamp(0.5 + (statSum(a) - statSum(b)) * 0.03 + (A.prestige - B.prestige) / 2000, 0.2, 0.8), W = chance(pA) ? A : B, L = W === A ? B : A;
      const gain = Math.round(houseDef(W.id).rate * 0.6);
      W.prestige += gain; L.prestige = Math.max(0, L.prestige - Math.round(gain * 0.5));
      houseForm(W, 'W'); houseForm(L, 'L');
      news.push({ d: G.day, w: W.id, l: L.id, by: (W === A ? a : b).name });
    }
    G.rivalNews = (G.rivalNews || []).concat(news).slice(-8);
  }
  for (const H of G.houses) {
    const def = houseDef(H.id);
    H.prestige += Math.round(def.rate * 0.9 * rand(0.6, 1.4));
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

// ---------- equipment: items, the armoury and the blacksmith ----------

function emptyGear() { return { weapon: null, head: null, chest: null, legs: null, arms: null, shoulders: null }; }
function makeItem(slot, r, cls) { return { id: ++G.nextId, slot, r, cls: slot === 'weapon' ? cls : null }; }
function itemName(it) { return it.relic ? RELICS[it.relic].name : MATERIAL[it.r] + ' ' + (it.slot === 'weapon' ? WEAPON_NAMES[it.cls] : SLOT_INFO[it.slot].piece) + (it.fit && FITS[it.fit] ? ', ' + FITS[it.fit].name.toLowerCase() : ''); }
function itemPrice(it) { return Math.round(ITEM_PRICE[it.r] * SLOT_INFO[it.slot].price * (it.relic ? 2 : 1) * (it.fit ? 1.3 : 1) / 5) * 5; }
// what the blacksmith charges you; selling back is always half the full price
function buyPrice(it) { return boon('bargain') ? Math.round(itemPrice(it) * 0.85 / 5) * 5 : itemPrice(it); }
function fits(it, g) { return it.slot !== 'weapon' || it.cls === g.cls; }
const pc = v => Math.round(v * 100) + '%';

// What one piece does, as numbers. Used for combat, tooltips and comparisons.
function itemStats(it) {
  const k = it.r + 1, z = { dmg: 0, armor: 0, dodge: 0, block: 0, speed: 0, stunRes: 0, critRes: 0, bleedRes: 0, hamRes: 0, armRes: 0 };
  if (it.slot === 'weapon') { z.dmg = WEAPON_DMG[it.r]; if (it.fit && FITS[it.fit]) FITS[it.fit].add(z); return z; }
  z.armor = ARMOR_TOTAL[it.r] * SLOT_INFO[it.slot].share;
  z.dodge = -0.006;                                           // every piece is weight to carry
  if (it.slot === 'head') { z.stunRes = 0.07 * k; z.critRes = 0.01 * k; }
  if (it.slot === 'legs') { z.hamRes = 0.11 * k; z.speed = 0.01 * k; z.dodge = 0; }
  if (it.slot === 'arms') { z.armRes = 0.11 * k; z.block = 0.006 * k; }
  if (it.slot === 'shoulders') z.bleedRes = 0.11 * k;
  if (it.relic) RELICS[it.relic].add(z);                       // a piece out of the old stories (wilds.js)
  if (it.fit && FITS[it.fit]) FITS[it.fit].add(z);             // and what the smith has done to it since
  return z;
}
// ---- work the smith will do on a piece you own ----
// A fitting: one to a piece, and for good. weapon: whether it is for blades or for armour.
const FITS = {
  weighted:  { name: 'Weighted', weapon: true,  what: '+0.8 damage a blow, but 1% less dodge for the weight of it.', add: z => { z.dmg += 0.8; z.dodge -= 0.01; } },
  balanced:  { name: 'Balanced', weapon: true,  what: '+2% block and +1% dodge: it comes back to guard quicker.', add: z => { z.block += 0.02; z.dodge += 0.01; } },
  studded:   { name: 'Studded',  weapon: false, what: 'Takes a sixth more off every blow.', add: z => { z.armor *= 7 / 6; } },
  padded:    { name: 'Padded',   weapon: false, what: 'Stuns are 10% shorter and telling blows 2% less likely.', add: z => { z.stunRes += 0.1; z.critRes += 0.02; } },
  lightened: { name: 'Lightened', weapon: false, what: 'Costs no dodge to wear, and gives 0.4% back; a tenth less protection.', add: z => { z.dodge = Math.max(z.dodge, 0) + 0.004; z.armor *= 0.9; } },
};
// The best grade this forge can make.
const forgeMax = () => { let m = 0; SMITH_ODDS[G.smith.level].forEach((v, i) => { if (v > 0) m = i; }); return m; };
// A piece of yours, wherever it is: on the racks or on a man.
function findItem(id) {
  const a = G.armoury.find(x => x.id === +id);
  if (a) return { it: a, g: null };
  for (const g of G.roster) for (const k of SLOTS) if (g.gear && g.gear[k] && g.gear[k].id === +id) return { it: g.gear[k], g };
  return null;
}
// Reforging takes a piece up one grade, for less than the difference in price. One piece between games.
function reforgeCost(it) { return it.r >= 6 ? 0 : Math.max(10, Math.round((itemPrice(Object.assign({}, it, { r: it.r + 1 })) - itemPrice(it)) * 0.9 / 5) * 5); }
function reforgeBlock(it) {
  if (it.relic) return 'No smith living would put a hammer to it.';
  if (it.r >= 6) return 'There is no better steel.';
  if (it.r >= forgeMax()) return `This forge can make nothing better than grade ${RARITY[forgeMax()]}. Improve the forge.`;
  if (G.smith.reforged === dealCycle()) return 'He has reforged one piece since the last games, and it is slow work.';
  if (G.denarii < reforgeCost(it)) return `You are ${reforgeCost(it) - G.denarii} denarii short.`;
  return '';
}
function reforge(id) {
  const f = findItem(id);
  if (!f || reforgeBlock(f.it)) return false;
  G.denarii -= reforgeCost(f.it); f.it.r++; G.smith.reforged = dealCycle();
  log(`The smith reforges a piece: ${itemName(f.it)}.`, 'gold');
  return true;
}
function fitCost(it) { return Math.max(15, Math.round(ITEM_PRICE[it.r] * SLOT_INFO[it.slot].price * 0.3 / 5) * 5); }
function fitBlock(it, k) {
  const F = FITS[k];
  if (!F || F.weapon !== (it.slot === 'weapon')) return 'That is not work for this kind of piece.';
  if (it.relic) return 'No smith living would put a hammer to it.';
  if (it.fit) return 'It has been worked on already.';
  if (G.smith.level < 1) return 'A village smith does not know the work. Improve the forge.';
  if (G.denarii < fitCost(it)) return `You are ${fitCost(it) - G.denarii} denarii short.`;
  return '';
}
function fitItem(id, k) {
  const f = findItem(id);
  if (!f || fitBlock(f.it, k)) return false;
  G.denarii -= fitCost(f.it); f.it.fit = k;
  return true;
}
// A commission: a piece of the kind you name, at the best grade the forge makes, ready at the next games.
function orderItemCost(slot) { return Math.round(ITEM_PRICE[forgeMax()] * SLOT_INFO[slot].price * 1.2 / 5) * 5; }
function orderItemBlock(slot) {
  if (G.smith.order) return 'He is at work on a commission of yours already.';
  if (G.denarii < orderItemCost(slot)) return `You are ${orderItemCost(slot) - G.denarii} denarii short.`;
  return '';
}
function orderItem(slot, cls) {
  if (!SLOT_INFO[slot] || (slot === 'weapon' && !CLASSES[cls]) || orderItemBlock(slot)) return false;
  G.denarii -= orderItemCost(slot); G.smith.order = { slot, cls: slot === 'weapon' ? cls : null, r: forgeMax() };
  return true;
}
// Spare pieces that would better nobody you have, and are not the best of their kind on the racks.
function outclassed() {
  const gain = (x, g) => { const cur = g.gear && g.gear[x.slot]; return fits(x, g) && (!cur || itemStats(x).dmg + itemStats(x).armor > itemStats(cur).dmg + itemStats(cur).armor + 1e-9); };
  return G.armoury.filter(x => !x.relic && !G.roster.some(g => gain(x, g)) && G.armoury.some(y => y !== x && y.slot === x.slot && y.cls === x.cls && (y.r > x.r || (y.r === x.r && y.id < x.id))));
}
function sellOutclassed() {
  const list = outclassed(); let sum = 0;
  for (const x of list) { sum += Math.round(itemPrice(x) / 2); G.armoury = G.armoury.filter(y => y !== x); }
  G.denarii += sum;
  return { n: list.length, sum };
}
function itemEffect(it) {
  const z = itemStats(it);
  const fitted = it.fit && FITS[it.fit] ? ` ${FITS[it.fit].name}: ${FITS[it.fit].what}` : '';
  if (it.slot === 'weapon') return `+${+z.dmg.toFixed(1)} damage on every blow. Only a ${CLASSES[it.cls].name} can use it.${fitted}`;
  const bits = [`Takes ${z.armor.toFixed(1)} damage off every blow`];
  if (it.slot === 'head') bits.push(`stuns are ${pc(z.stunRes)} shorter`, `telling blows against him ${pc(z.critRes)} less likely`);
  if (it.slot === 'chest') bits.push('the heaviest protection of any piece');
  if (it.slot === 'legs') bits.push(`${pc(z.hamRes)} chance to shrug off a hamstring`, `moves ${pc(z.speed)} faster`);
  if (it.slot === 'arms') bits.push(`${pc(z.armRes)} chance to shrug off an arm wound`, `+${(z.block * 100).toFixed(1)}% block with a shield`);
  if (it.slot === 'shoulders') bits.push(`${pc(z.bleedRes)} chance to shrug off a bleeding wound`);
  return bits.join('; ') + '.' + (it.relic ? ' ' + RELICS[it.relic].note : '') + fitted;
}

// Everything a fighter's kit adds up to. Rivals and champions have no individual pieces:
// their single weapon and armour level (0 to 3) stands for the whole kit.
function gearStats(g) {
  const s = { dmg: 0, armor: 0, dodge: 0, block: 0, speed: 1, stunRes: 0, critRes: 0, bleedRes: 0, hamRes: 0, armRes: 0 };
  if (g.beast) return s;
  if (!g.gear) {
    s.dmg = g.weapon * 2; s.armor = g.armor * 1.5; s.dodge = -g.armor * 0.015;
    s.stunRes = g.armor * 0.08; s.critRes = g.armor * 0.01; s.bleedRes = s.hamRes = s.armRes = g.armor * 0.1;
    return s;
  }
  for (const slot of SLOTS) {
    const it = g.gear[slot];
    if (!it) continue;
    const z = itemStats(it);
    s.dmg += z.dmg; s.armor += z.armor; s.dodge += z.dodge; s.block += z.block; s.speed += z.speed;
    s.stunRes += z.stunRes; s.critRes += z.critRes; s.bleedRes += z.bleedRes; s.hamRes += z.hamRes; s.armRes += z.armRes;
  }
  { const worn = ARMOR_SLOTS.map(a => g.gear[a]); if (worn.every(Boolean)) { s.armor *= worn.every(x => x.r === worn[0].r) ? 1.14 : 1.08; s.full = worn.every(x => x.r === worn[0].r) ? 2 : 1; } }      // a full harness, and a matched one
  { const fb = staffLvl('faber'); if (fb && G.roster.includes(g)) { if (g.gear.weapon) s.dmg += 0.3 * fb; if (ARMOR_SLOTS.some(a => g.gear[a])) s.armor += 0.25 * fb; } }      // the armourer keeps what your men wear
  return s;
}
function gearPower(g) { const s = gearStats(g); return 1 + 0.07 * (s.dmg / 2) + 0.07 * (s.armor / 1.5); }
// How the kit shows on the sprite: 0 to 3 for torso, blade and helmet; flags for the smaller pieces.
function gearLook(g) {
  if (g.beast) return { armor: 0, weapon: 0, head: 0, legs: false, arms: false, shoulders: false, legsT: 0, armsT: 0, shouldersT: 0 };
  if (!g.gear) return { armor: g.armor, weapon: g.weapon, head: g.armor, legs: false, arms: g.armor >= 1, shoulders: false, legsT: 0, armsT: g.armor >= 1 ? 1 : 0, shouldersT: 0 };
  const t = it => (it ? (it.r <= 1 ? 1 : it.r <= 3 ? 2 : 3) : 0), x = g.gear;
  return { armor: t(x.chest), weapon: t(x.weapon), head: t(x.head), legs: !!x.legs, arms: !!x.arms, shoulders: !!x.shoulders, legsT: t(x.legs), armsT: t(x.arms), shouldersT: t(x.shoulders) };      // the T's are each piece's own grade, for its colour
}

function equip(g, itemId) {
  const it = G.armoury.find(x => x.id === +itemId);
  if (!it || !g.gear || !fits(it, g)) return false;
  G.armoury = G.armoury.filter(x => x !== it);
  if (g.gear[it.slot]) G.armoury.push(g.gear[it.slot]);
  g.gear[it.slot] = it;
  return true;
}
function unequip(g, slot) {
  if (!g.gear || !g.gear[slot]) return false;
  G.armoury.push(g.gear[slot]); g.gear[slot] = null;
  return true;
}
function stripGear(g) {
  if (!g.gear) return;
  for (const slot of SLOTS) if (g.gear[slot]) { G.armoury.push(g.gear[slot]); g.gear[slot] = null; }
}

// The blacksmith's stock changes every games day. A better smith offers more pieces and rarer ones.
function genSmith() {
  const S = G.smith, odds = SMITH_ODDS[S.level];
  if (S.order) { const it = makeItem(S.order.slot, S.order.r, S.order.cls); G.armoury.push(it); log(`The smith has finished your commission: ${itemName(it)} is on the racks.`, 'gold'); S.order = null; }
  const styles = G.roster.map(g => g.cls);
  S.stock = [];
  for (let i = 0; i < 4 + S.level; i++) {
    let roll = Math.random() * 100, r = 0;
    while (r < 6 && roll >= odds[r]) { roll -= odds[r]; r++; }
    const slot = chance(0.3) ? 'weapon' : pick(ARMOR_SLOTS);
    // weapons usually suit a style you actually field
    const cls = slot === 'weapon' ? (styles.length && chance(0.75) ? pick(styles) : pick(Object.keys(CLASSES))) : null;
    S.stock.push(makeItem(slot, r, cls));
  }
}
function buyItem(itemId) {
  const it = G.smith.stock.find(x => x.id === +itemId);
  if (!it || G.denarii < buyPrice(it)) return false;
  G.denarii -= buyPrice(it);
  G.smith.stock = G.smith.stock.filter(x => x !== it);
  G.armoury.push(it);
  return true;
}
function sellItem(itemId) {
  const it = G.armoury.find(x => x.id === +itemId);
  if (!it) return false;
  G.denarii += Math.round(itemPrice(it) / 2);
  G.armoury = G.armoury.filter(x => x !== it);
  return true;
}
function upgradeSmith() {
  const S = G.smith;
  if (S.level >= SMITH_COST.length || G.denarii < SMITH_COST[S.level]) return false;
  G.denarii -= SMITH_COST[S.level]; S.level++;
  log(`The forge is improved. Your smith is now a ${SMITH_NAMES[S.level].toLowerCase()}.`, 'gold');
  return true;
}

// ---------- fighter stories: histories, friendships, rivalries, vows ----------

// A wound that will show on his portrait for good. k: cut, deep, claw or arm; p picks where it falls.
function addScar(g, k) {
  if (!g.scars) g.scars = [];
  if (g.scars.length < 7) g.scars.push({ k, p: rint(0, 5) });
}
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

// A fighter leaves the ludus. why: 'dead', 'sold', 'freed' or 'deserted'. Those bound to him feel it.
function departed(g, why, killer) {
  stripGear(g);                       // whatever he wore goes back to the armoury
  for (const b of bondsOf(g)) {
    const o = b.other;
    if (b.type === 'friend' && why === 'dead') {
      o.morale = clamp(o.morale - 20, 0, 100);
      addStory(o, `Mourned his friend ${g.name}.`);
      if (killer && killer.house && !o.wish) {
        o.wish = { type: 'avenge', hid: killer.house, gid: killer.id, name: killer.name, for: g.name };
        addStory(o, `Swore to kill ${killer.name} of ${houseDef(killer.house).name}.`);
      }
    } else if (b.type === 'friend' && why === 'deserted') {
      o.morale = clamp(o.morale - 8, 0, 100); addStory(o, `Woke to find his friend ${g.name} gone.`);
    } else if (why === 'deserted') {
      /* nobody else misses him */
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

// The festival to come, and the two after it: the town knows its calendar.
function festType(day, prev) {
  if (day % (FESTIVAL_EVERY * 2) === 0) return 'tourney';
  if (day === FESTIVAL_EVERY) return 'hunt';
  return pick(['hunt', 'melee', 'funeral', 'triumph', 'saturnalia', 'mars'].filter(k => k !== prev));
}
function scheduleFestival() {
  const day = Math.floor(G.day / FESTIVAL_EVERY) * FESTIVAL_EVERY + FESTIVAL_EVERY;
  let q = (G.festQueue || []).filter(x => x.day >= day);
  if (q.length && q[0].day !== day) q = [];
  for (let n = q.length; n < 3; n++) {
    const d = day + n * FESTIVAL_EVERY, before = q.filter(x => x.type !== 'tourney').slice(-1)[0];
    q.push({ day: d, type: festType(d, before ? before.type : G.festival && G.festival.type) });
  }
  G.festival = { day, type: q[0].type };
  G.festQueue = q.slice(1);
}
// Is this festival being held today?
const festToday = type => !!G.festival && G.festival.day === G.day && (G.festival.shown || G.festival.type) === type;
// Festival crowns won, of every kind.
const trophies = () => Object.values(G.trophies || {}).reduce((a, b) => a + b, 0);
const trophyBonus = () => Math.min(10, trophies()) * 0.02;
// Put your name on the festival: it costs, the Magistrate notices, and your men's festival bouts earn more fame.
function sponsorCost() { return round5(PURSE[tier()] * 1.5); }
function sponsorBlock() {
  const F = G.festival;
  if (!F || F.day < G.day) return 'There is no festival to sponsor.';
  if (F.sponsor) return 'Your name is on it already.';
  if (F.day - G.day > 5) return 'The editor is not taking sponsors yet: come back when the heralds have cried it.';
  if (F.day === G.day && (G.bouts || []).some(b => b.done)) return 'The games have begun.';
  if (G.denarii < sponsorCost()) return `You are ${sponsorCost() - G.denarii} denarii short.`;
  return '';
}
function sponsorFestival() {
  if (sponsorBlock()) return false;
  G.denarii -= sponsorCost(); G.festival.sponsor = true; favor('magistrate', 5);
  log(`Your name is painted on the walls as a sponsor of ${FESTIVALS[G.festival.type].name}.`, 'gold');
  return true;
}
// How many of the festival's bouts must be won for its crown, as the card stands.
function crownNeed() {
  const F = G.festival; if (!F) return 0;
  const type = F.shown || F.type;
  if (type === 'tourney') return 0;
  const n = (G.bouts || []).filter(b => b.fest).length;
  return Math.min(FEST_CROWN[type] || 1, n || FEST_CROWN[type] || 1);
}
// Victor of the festival: a purse, a trophy for the house, and a little more fame from every bout after.
function crownFestival(lines) {
  const F = G.festival, type = F.shown || F.type;
  if (F.crowned) return 0;
  F.crowned = true;
  G.trophies = G.trophies || {}; G.trophies[type] = (G.trophies[type] || 0) + 1;
  const bonus = round5(PURSE[tier()] * 0.8 * (F.sponsor ? 1.5 : 1));
  G.denarii += bonus; favor('magistrate', 4);
  lines.push(`<span class="gold">Your school is named victor of ${FESTIVALS[type].name}: a crown for the house, and ${bonus} denarii with it.</span>`);
  log(`Your school is crowned victor of ${FESTIVALS[type].name}.`, 'gold');
  return bonus;
}

function makeBeast(kind, budget) {
  const b = BEASTS[kind], stats = { str: 2, agi: 2, skl: 2 }, bag = [];
  STATS.forEach(k => { for (let i = 0; i < b.bias[k]; i++) bag.push(k); });
  let pts = Math.max(0, Math.min(60, Math.round(budget * b.budget)) - 6), guard = 0;
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
  if ((type === 'melee' || type === 'funeral' || type === 'triumph') && t < 1) type = 'hunt';   // the village pits can only afford animals
  G.festival.shown = type;
  const B0 = ENEMY_BUDGET[t], fav = 1 + G.patrons.magistrate * 0.003;
  if (type === 'hunt') {
    const hunts = [['easy', ['boar']], ['even', ['lion']], ['hard', ['bear']]];
    if (t >= 1) hunts.push(['even', ['wolf', 'wolf', 'wolf']]);
    if (t >= 2) hunts.push(['hard', ['lion', 'bear']]);
    for (const [diff, kinds] of hunts) {
      const size = kinds.length > 1 ? 2 : 1, D = DIFF[diff];
      bouts.push({
        id: ++G.nextId, size, diff, death: false, done: false, hunt: true, fest: true, house: 'the beast-masters',
        enemies: kinds.map(k => makeBeast(k, B0)),
        purse: round5(PURSE[t] * D.purse * Math.pow(size, 0.7) * fav),
        fame: Math.round(FAME[t] * D.fame * Math.pow(size, 0.5) * 1.4),
      });
    }
  } else if (type === 'melee') {
    const size = t >= 2 ? 5 : 4, H = pick(G.houses);
    const foes = pickRivals(H, size, B0 * 0.95, t, booked);
    bouts.push({
      id: ++G.nextId, size, diff: 'even', death: false, done: false, melee: true, fest: true, houseId: H.id, house: houseDef(H.id).name,
      enemyIds: foes.map(g => g.id), purse: round5(PURSE[t] * Math.pow(size, 0.7) * 1.3 * fav), fame: Math.round(FAME[t] * Math.pow(size, 0.5) * 1.5),
    });
  } else if (type === 'funeral') {
    for (const b of bouts) {
      if (b.grudge) continue;
      b.death = true; b.funeral = true; b.fest = true; b.purse = round5(b.purse * 1.6); b.fame = Math.round(b.fame * 1.3);
    }
  } else if (type === 'triumph') {
    // prisoners of war, armed and told that the last of them standing may live
    for (const [diff, n] of [['easy', 1], ['even', 1], ['hard', 2]]) {
      const D = DIFF[diff];
      bouts.push({
        id: ++G.nextId, size: n, diff, death: true, done: false, captive: true, fest: true, house: 'the captives of the legion',
        enemies: Array.from({ length: n }, () => makeEnemy(B0 * D.stat, t)),
        purse: round5(PURSE[t] * D.purse * Math.pow(n, 0.7) * 1.5 * fav), fame: Math.round(FAME[t] * D.fame * Math.pow(n, 0.5) * 1.4),
      });
    }
  } else if (type === 'saturnalia') {
    for (const b of bouts) {
      if (b.grudge || b.final) continue;
      b.death = false; b.fest = true; b.saturn = true; b.fame = Math.round(b.fame * 1.4);
    }
    G.roster.forEach(g => { g.morale = clamp(g.morale + 10, 0, 100); });
  } else if (type === 'mars') {
    // one duel for each way of fighting, and only men who fight that way may enter it
    for (const st of STATS) {
      const H = pick(G.houses), foes = pickRivals(H, 1, B0, t, booked);
      bouts.push({
        id: ++G.nextId, size: 1, diff: 'even', death: false, done: false, style: st, fest: true, houseId: H.id, house: houseDef(H.id).name, enemyIds: foes.map(g => g.id),
        purse: round5(PURSE[t] * 1.5 * fav), fame: Math.round(FAME[t] * 1.6),
      });
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
    if (G.festival && G.festival.day === G.day) crownFestival(lines);
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

// ---------- the arena: the championship, wagers, stakes, the day's laurels ----------
// Who may be sent to this bout: some are for novices only, and a title is defended by the man who holds it.
function boutFit(b, g) { return canFight(g) && (!b.novice || g.rank <= 1) && (!b.only || g.id === b.only) && (!b.style || styleOf(g) === b.style); }
// Three ways to bet on your own side. The harder the thing, the more the bookmakers pay.
const WAGER_KINDS = {
  win:   { name: 'To win', mult: 1, what: 'Your side wins, however it comes.' },
  clean: { name: 'Barely touched', mult: 1.6, what: 'Your side wins with every man of yours on his feet and none below a third of his health. Pays 1.6 times the odds.' },
  swift: { name: 'Swiftly', mult: 1.8, what: 'Your side wins inside 12 seconds of fighting. Pays 1.8 times the odds.' },
};
const SWIFT_TIME = 12;
function wagerWon(kind, B, win) {
  if (!win) return false;
  if (kind === 'clean') return B.fighters.filter(f => f.team === 0).every(f => !f.fate && f.hp >= f.maxHp / 3);
  if (kind === 'swift') return !B.decision && B.time <= SWIFT_TIME;
  return true;
}
// The man who holds the championship, if he is still where he was.
function titleHolder() {
  const T = G.title; if (!T) return null;
  if (T.house === null) return G.roster.find(g => g.id === T.gid) || null;
  const H = houseOf(T.house);
  return (H && H.roster.find(g => g.id === T.gid)) || null;
}
const titleYours = () => !!G.title && G.title.house === null && !!titleHolder();
// From the amphitheatre up there is a champion. A rival who holds it can be challenged each games day;
// if your man holds it, the best of the others comes for it each games day, and only he may answer.
function titleBout(t, bouts, booked) {
  if (t < 1) return;
  const strongest = () => { let best = null; for (const H of G.houses) for (const g of H.roster) if (!booked.has(g.id) && (!best || statSum(g) > statSum(best.g))) best = { g, H }; return best; };
  if (!G.title || !titleHolder()) {
    const s = strongest(), was = G.title;
    if (!s) { G.title = null; return; }
    G.title = { house: s.H.id, gid: s.g.id, name: s.g.name, defences: 0 };
    if (was) log(`The championship stands empty, and ${s.g.name} of ${houseDef(s.H.id).name} is named champion.`, 'gold');
  }
  const T = G.title;
  if (T.house !== null) {
    const c = titleHolder();
    if (booked.has(c.id)) return;                 // he is answering a challenge or a grudge today
    booked.add(c.id);
    bouts.push({ id: ++G.nextId, size: 1, diff: 'hard', death: false, title: true, done: false, houseId: T.house, house: houseDef(T.house).name, enemyIds: [c.id],
      purse: round5(PURSE[t] * 2.2), fame: Math.round(FAME[t] * 2.2) });
  } else {
    const s = strongest(); if (!s) return;
    booked.add(s.g.id);
    bouts.push({ id: ++G.nextId, size: 1, diff: 'hard', death: false, title: true, defence: true, only: T.gid, done: false, houseId: s.H.id, house: houseDef(s.H.id).name, enemyIds: [s.g.id],
      purse: round5(PURSE[t] * (1.5 + 0.25 * Math.min(T.defences, 6))), fame: Math.round(FAME[t] * 1.8) });
  }
}
// Offer to fight a bout without quarter: richer, louder, and somebody may not walk out.
function stakesBlock(b) {
  if (b.done) return 'It has been fought.';
  if (b.death) return 'It is to the death already.';
  if (b.saturn) return 'Nobody dies on Saturnalia.';
  if (b.hunt || b.final || b.tourney || b.melee || b.novice || b.style || !b.houseId) return 'The editor will not hear of it for this bout.';
  if (tier() < 1) return 'The village pits do not fight to the death.';
  return '';
}
function raiseStakes(id) {
  const b = (G.bouts || []).find(x => x.id === +id);
  if (!b || stakesBlock(b)) return false;
  b.death = true; b.raised = true; b.purse = round5(b.purse * 1.3); b.fame = Math.round(b.fame * 1.4);
  feud(houseOf(b.houseId), 4);
  return true;
}
// The best in the province, yours and theirs, as the town reckons them.
const rankScore = g => statSum(g) + (g.wins || 0) * 1.5 - (g.losses || 0) * 0.5;
function arenaRanks(n) {
  const all = G.roster.map(g => ({ g, h: null }));
  for (const H of G.houses) for (const g of H.roster) all.push({ g, h: H.id });
  return all.sort((a, b) => rankScore(b.g) - rankScore(a.g)).slice(0, n);
}
// What a run of victories adds to the fame of the next.
const streakBonus = () => Math.min(G.streak || 0, 10) * 0.02;

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
  for (const H of G.houses) for (const g of H.roster) if (g.outUntil !== undefined) { if (g.outUntil >= dealCycle()) booked.add(g.id); else delete g.outUntil; }
  // a house you have called out sends its best man to answer
  for (const H of G.houses) {
    if (!H.called) continue;
    H.called = false;
    const c = H.roster.filter(g => !booked.has(g.id)).sort((a, b) => statSum(b) - statSum(a))[0];
    if (!c) continue;
    booked.add(c.id);
    bouts.push({
      id: ++G.nextId, size: 1, diff: 'hard', death: false, called: true, done: false,
      houseId: H.id, house: houseDef(H.id).name, enemyIds: [c.id],
      purse: Math.round(PURSE[t] * 2 / 5) * 5, fame: FAME[t] * 2,
    });
  }
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
    if (!r || booked.has(r.id) || g.injury > 0 || g.away || !chance(0.6)) continue;
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
  titleBout(t, bouts, booked);
  if (t >= 1) {                                   // a bout kept for the new men, against men of their own weight
    const H = order[sizes.length % order.length], foes = pickRivals(H, 1, ENEMY_BUDGET[t - 1] * 0.92, t - 1, booked);
    bouts.push({ id: ++G.nextId, size: 1, diff: 'even', death: false, novice: true, done: false, houseId: H.id, house: houseDef(H.id).name, enemyIds: foes.map(g => g.id),
      purse: round5(PURSE[t] * 0.55), fame: Math.round(FAME[t] * 0.55) });
  }
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
  if (G.richCard && G.richCard >= G.day) bouts.forEach(b => { if (!b.final) b.purse = round5(b.purse * 1.5); });      // the Magistrate was asked for a richer card
  G.bouts = bouts;
}

function winOdds(mine, foes) {
  let a = mine.reduce((s, g) => s + power(g), 0);
  const b = foes.reduce((s, g) => s + power(g), 0);
  if (!a) return { p: 0, pay: 0 };
  // the bookmakers know which style beats which: each of your men is weighed against the men he will face
  let edge = 0, n = 0;
  for (const g of mine) for (const f of foes) { edge += Math.log(styleEdge(styleOf(g), styleOf(f)) / styleEdge(styleOf(f), styleOf(g))); n++; }
  if (n) a *= Math.exp(edge / n * 0.5);
  const p = Math.pow(a, 4) / (Math.pow(a, 4) + Math.pow(b, 4));
  return { p, pay: Math.round(clamp(0.9 / p, 1.1, 6) * (festToday('saturnalia') ? 1.25 : 1) * 10) / 10 };
}

// ---------- day cycle ----------

// How much a day's drilling moves him, before his talent for the skill: the ground, the doctore, his nature, his state.
function trainRate(g) {
  const masters = G.roster.filter(x => !x.away && x.traits.includes('drillmaster')).length;
  let m = (1 + 0.2 * G.fac.ground) * (1 + 0.15 * staffLvl('doctore'));
  if (g.traits.includes('disciplined')) m *= 1.2;
  if (g.traits.includes('lazy')) m *= 0.8;
  if (g.traits.includes('embittered')) m *= 0.7;
  if (g.traits.includes('eaglesworn')) m *= 1.05;
  m *= 1 + 0.05 * (masters - (g.traits.includes('drillmaster') ? 1 : 0));
  if (bondsOf(g).some(b => b.type === 'rival')) m *= 1.1;      // nothing drives a man like someone to outdo
  return m * regimen().rate * (1 - g.fatigue / 160) * (0.75 + g.morale / 250);
}
// What a day's drilling costs him in fatigue.
function trainTire(g, spar) { return (13 - statSum(g) * 0.07) * (g.traits.includes('tireless') ? 0.7 : 1) * (spar ? 0.7 : 1) * regimen().tire * (1 - 0.06 * staffLvl('unctor')); }
// What a day's rest gives back: [health, fatigue shed].
function restGain(g) { return [maxHp(g) * (0.22 + 0.08 * G.fac.infirmary + 0.04 * staffLvl('cook')), 30 + 8 * G.fac.baths + 5 * staffLvl('unctor')]; }

function endDay() {
  const F = G.fac;
  for (const g of G.roster) {
    if (g.away) continue;             // men out on contract or on the road are not in the yard
    if (G.field) { wildDayFor(g); continue; }      // the whole school is out in the country (wilds.js)
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
      const [heal, shed] = restGain(g);
      g.fatigue -= shed;
      g.hp += heal;
      g.morale += 2 + 2 * F.baths;
    } else {
      const spar = g.activity === 'spar';
      const m = trainRate(g);
      for (const st of (spar ? STATS : [g.activity])) {
        if (addProg(g, st, m * g.pot[st] * (spar ? 0.32 : 1))) log(`${g.name}'s ${STAT_NAMES[st].toLowerCase()} rises to ${g.stats[st]}.`, 'good');
      }
      g.fatigue += trainTire(g, spar);
      g.hp += mh * 0.06;
      if (g.fatigue > 75 && chance(0.12)) {
        g.injury = Math.round(rint(2, 4) * (g.traits.includes('frail') ? 1.5 : 1));
        log(`${g.name}, worked past exhaustion, tears a muscle. Out for ${g.injury} day${g.injury === 1 ? "" : "s"}.`, 'bad');
      }
    }
    const target = Math.min(100, moraleBase(G.ration));
    g.morale += clamp(target - g.morale, -3, 3);
    g.fatigue = clamp(g.fatigue, 0, 100);
    g.morale = clamp(g.morale, g.traits.includes('atpeace') ? 60 : g.traits.includes('steady') ? 50 : 0, 100);
    g.hp = clamp(g.hp, 1, maxHp(g));
  }

  G.denarii += stipend() - upkeep();
  (G.purseLog = G.purseLog || []).push(G.denarii); if (G.purseLog.length > 30) G.purseLog.shift();      // the purse, day by day, for the ledger
  if (G.denarii < 0) {
    G.debtDays++;
    G.roster.forEach(g => { g.morale = clamp(g.morale - 5, 0, 100); });
    log(`The ludus is in debt (day ${G.debtDays} of ${graceDays()} before the creditors come).`, 'bad');
    if (G.debtDays >= graceDays()) beginRuin();
  } else G.debtDays = 0;

  if (G.tourney && G.tourney.state !== 'done') finishTourneyOffscreen();
  const ducked = (G.bouts || []).find(b => (b.grudge || b.called) && !b.done);
  if (ducked) {
    favor('magistrate', -5);
    G.roster.forEach(g => { g.morale = clamp(g.morale - 6, 0, 100); });
    if (ducked.called) G.fame = Math.max(0, G.fame - 5);
    log(ducked.called ? `You called out ${ducked.house} and did not appear. The town will not let you forget it.` : `You left ${ducked.house}'s challenge unanswered. The men heard of it, and so did the town.`, 'bad');
  }
  const lapsed = (G.bouts || []).find(b => b.defence && !b.done);
  if (lapsed && G.title && G.title.house === null) {
    const foe = boutEnemies(lapsed)[0], was = G.title.name;
    G.title = foe ? { house: lapsed.houseId, gid: foe.id, name: foe.name, defences: 0 } : null;
    G.fame = Math.max(0, G.fame - 5);
    log(`${was} did not appear to defend the championship. ${foe ? `It passes to ${foe.name} of ${lapsed.house} without a blow struck.` : 'It stands empty.'}`, 'bad');
  }
  G.day++;
  if (G.festival.day < G.day) scheduleFestival();
  if (G.festival.day - G.day === 5) log(`Heralds cry it through the town: ${FESTIVALS[G.festival.type].name}, in five days.`, 'gold');
  if (isGamesDay()) {
    for (const k in G.patrons) G.patrons[k] = Math.max(0, G.patrons[k] - 1);
    genRequest();
    genBouts(); checkWishes(); genMarket(); genHires(); genSmith(); genContracts();
    log(G.field ? `Games are held in town today at the ${TIERS[tier()].name}, and your school is not there.` : `Games are held today at the ${TIERS[tier()].name}. Fresh stock at the market.`, G.field ? 'bad' : 'gold');
  } else { G.bouts = null; G.tourney = null; }

  if (!G.roster.length && G.denarii < Math.min(...G.market.map(m => m.price))) G.over = 'empty';
  if (!G.over && !G.ruin) jobsTick();
  if (!G.over && !isGamesDay() && !G.field && chance(0.22)) rollEvent();
  if (isGamesDay()) backupSlot();
  save();
}

// ---------- bout resolution ----------

function applyBoutResult(bout, B, wager, pay, kind) {
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
        g.injury = rint(1, 3); addScar(g, 'cut');
        lines.push(`<b>${g.name}</b> yields, and the crowd lets him live. Wounded for ${g.injury} day${g.injury === 1 ? "" : "s"}.`);
      } else {
      g.hp = Math.max(1, Math.round(maxHp(g) * 0.1));
      g.injury = Math.max(1, Math.round(rint(3, 7) * (g.traits.includes('frail') ? 1.5 : 1)) - G.fac.infirmary); addScar(g, bout.hunt ? 'claw' : 'deep');
      lines.push(`<b>${g.name}</b> ${bout.hunt ? 'is dragged clear by the handlers, badly mauled' : 'falls, but the crowd grants mercy'}. Wounded for ${g.injury} day${g.injury === 1 ? "" : "s"}.`);
      }
    } else {
      g.hp = Math.max(1, Math.round(f.hp));
      if (f.hamstrung || f.armWound) {
        g.injury = rint(1, 2); addScar(g, f.armWound ? 'arm' : 'cut');
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
  if (win) G.tally.wins++; else G.tally.losses++;
  if (win) {
    purse = boon('laurel') ? Math.round(bout.purse * 1.1 / 5) * 5 : bout.purse;
    fameGain = Math.round((bout.fame * (0.8 + 0.7 * avgExc) + kills * 2) * (boon('crowd') ? 1.1 : 1) * (G.patrons.magistrate >= 80 ? 1.1 : 1) * (1 + streakBonus()) * (titleYours() ? 1.1 : 1) * (1 + trophyBonus()) * ((bout.fest || bout.tourney) && G.festival && G.festival.sponsor && G.festival.day === G.day ? 1.25 : 1));
    mine.forEach(f => { f.g.fame += Math.round(fameGain / mine.length); });
    if (wager && wagerWon(kind, B, win)) wagerGain = Math.round(wager * pay * (WAGER_KINDS[kind] || WAGER_KINDS.win).mult * (G.patrons.guild >= 80 ? 1.2 : 1));
    log(`Victory over ${bout.house}: ${purse} denarii, +${fameGain} fame.`, 'good');
  } else {
    purse = bout.death ? 0 : Math.round(bout.purse * 0.15 / 5) * 5;
    log(`Defeat at the hands of ${bout.house}.`, 'bad');
  }
  if (H) {
    for (const f of foes) { if (!f.g.vs) continue; if (win) { f.g.vs.l++; f.g.losses++; } else { f.g.vs.w++; f.g.wins++; } }
    if (win) { H.lost++; feud(H, 3); H.prestige = Math.max(0, H.prestige - 4); houseForm(H, 'L'); } else { H.won++; H.prestige += 8; houseForm(H, 'W'); }
    if (bout.called) {                        // you called them out: more is staked on it than a purse
      if (win) { H.prestige = Math.max(0, H.prestige - 12); lines.push(`You called ${bout.house} out and made it good before the whole town.`); }
      else { H.prestige += 10; G.roster.forEach(g => { g.morale = clamp(g.morale - 4, 0, 100); }); lines.push(`<span class="bad">You called ${bout.house} out, and lost. They will dine on it for a month.</span>`); }
    }
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
  if (G.patrons.temple >= 80) mine.forEach(f => { if (G.roster.includes(f.g) && f.g.injury > 1) f.g.injury--; });       // the temple's own surgeons
  { const r = G.request;
    if (r && !r.done && r.day === G.day && win) {
      if (r.type === 'wins') { r.got++; if (r.got >= r.need) fulfilRequest(lines); }
      else if (r.type === 'show' && avgExc >= 0.45) fulfilRequest(lines);
    } }
  if (G.fix) {
    if (!win) { purse += G.fix.pay; favor('guild', 8); lines.push(`As agreed, ${G.fix.pay} denarii change hands quietly.`); }
    else { favor('guild', -15); lines.push('<span class="bad">The Guild men who paid for your defeat are ruined, and furious.</span>'); }
    G.fix = null;
  }
  // a run of victories, and what it is worth
  if (win) { G.streak = (G.streak || 0) + 1; G.bestStreak = Math.max(G.bestStreak || 0, G.streak); }
  else { if ((G.streak || 0) >= 3) lines.push(`<span class="dim">A run of ${G.streak} victories ends here.</span>`); G.streak = 0; }
  // the championship changes hands, or does not
  if (bout.title && mine.length && foes.length) {
    const man = mine[0].g, foe = foes[0].g;
    if (win && !bout.defence) {
      G.title = { house: null, gid: man.id, name: man.name, defences: 0 };
      if (G.roster.includes(man)) addStory(man, 'Took the championship of the arena.');
      favor('magistrate', 3);
      lines.push(`<span class="gold"><b>${man.name}</b> is champion of the arena. Every games day now, the best of the others will come to take it from him.</span>`);
    } else if (win) {
      G.title.defences++;
      lines.push(`<span class="gold"><b>${man.name}</b> keeps the championship: ${G.title.defences} defence${G.title.defences === 1 ? '' : 's'} made.</span>`);
    } else if (bout.defence) {
      G.title = H && H.roster.includes(foe) ? { house: H.id, gid: foe.id, name: foe.name, defences: 0 } : null;
      lines.push(`<span class="bad">The championship goes to ${foe.name} of ${bout.house}.</span>`);
    } else if (G.title) G.title.defences++;
  }
  // the festival's own bouts count towards its crown
  if (win && bout.fest && G.festival && G.festival.day === G.day && !G.festival.crowned) {
    G.festival.won = (G.festival.won || 0) + 1;
    if (G.festival.won >= crownNeed()) crownFestival(lines);
  }
  // every bout on the card fought and won: the day is yours
  let sweep = 0;
  if (G.bouts && G.bouts.includes(bout)) {
    const R = G.dayRec && G.dayRec.day === G.day ? G.dayRec : (G.dayRec = { day: G.day, w: 0, l: 0 });
    if (win) R.w++; else R.l++;
    if (win && !R.l && R.w >= 3 && G.bouts.every(b => b.done || b === bout)) {
      sweep = round5(PURSE[tier()] * 0.6); purse += sweep; fameGain += Math.round(FAME[tier()] * 0.5); favor('magistrate', 2);
      lines.push(`<span class="gold">Every bout on the card, fought and won. The editor sends down a wreath and ${sweep} denarii: the day is yours.</span>`);
    }
  }
  G.denarii += purse + wagerGain;
  G.fame += fameGain;
  bout.done = true;
  if (bout.tourney) advanceTourney(win, lines);
  if (bout.final && win) G.won = true;
  if (!G.roster.length && G.denarii < Math.min(...G.market.map(m => m.price))) G.over = 'empty';
  save();
  return { win, lines, purse, fameGain, wager, wagerGain, avgExc, sweep, kind: kind || 'win' };
}

// ---------- random events ----------

const fit = () => G.roster.filter(g => g.injury <= 0 && !g.away);
const gn = id => { const g = byId(id); return g ? g.name : 'someone'; };
// small things the events below do over and over
const evMor = (g, d) => { if (g) g.morale = clamp(g.morale + d, 0, 100); };
const evAllMor = d => G.roster.forEach(g => evMor(g, d));
const evTire = (g, d) => { if (g) g.fatigue = clamp(g.fatigue + d, 0, 100); };
const evDays = n => `${n} day${n === 1 ? '' : 's'}`;
const evBest = (list, f) => list.slice().sort((a, b) => f(b) - f(a))[0];
const evPower = g => g.stats.str + g.stats.agi + g.stats.skl;

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
        const sick = fit().filter(() => chance(0.4));
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
      { label: c => `Take his oath (${c.fee})`, ok: c => G.denarii >= c.fee && G.roster.length < capacity(), run: c => { G.denarii -= c.fee; welcome(c.g); G.roster.push(c.g); if (!c.g.story) c.g.story = []; addStory(c.g, 'A free man who swore the oath to pay his debts.'); return `${c.g.name} swears to be burned, bound, beaten and killed by the sword. He joins the ludus.`; } },
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
    can: () => G.roster.length > 2 && fit().some(g => g.wins >= 2),
    make: () => { const g = pick(fit().filter(x => x.wins >= 2)); return { g: g.id, h: pick(G.houses).id, pay: Math.round(value(g) * 1.3 / 5) * 5 }; },
    text: c => `${houseDef(c.h).lanista} of ${houseDef(c.h).name} has watched <b>${gn(c.g)}</b> fight and wants him. The offer is ${c.pay} denarii, well over the market price. You would likely meet him again across the sand.`,
    opts: [
      { label: c => `Sell him (+${c.pay})`, run: c => {
        const g = byId(c.g); if (!g) return 'The deal falls through.';
        G.roster = G.roster.filter(x => x !== g); G.denarii += c.pay; departed(g, 'sold');
        g.wish = null; g.promise = null; g.lostTo = null;
        g.gear = null; g.weapon = clamp(tier() - 1, 0, 3); g.armor = clamp(tier() - 1, 0, 3);   // his new house kits him out
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
    can: () => fit().some(g => g.lostTo && !g.wish),
    make: () => ({ g: pick(fit().filter(x => x.lostTo && !x.wish)).id }),
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
    can: () => G.roster.length > 2 && home().some(g => g.wins >= 6 && g.rank >= 2 && !g.promise && !g.askedFree),
    make: () => ({ g: pick(home().filter(x => x.wins >= 6 && x.rank >= 2 && !x.promise && !x.askedFree)).id, more: 3 }),
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

  // ---- what a feud brings to your door ----
  slander: {
    title: 'Talk in the taverns',
    can: () => G.houses.some(H => H.grudge >= 25),
    make: () => ({ h: G.houses.slice().sort((a, b) => b.grudge - a.grudge)[0].id, cost: 30 + tier() * 30 }),
    text: c => `${houseDef(c.h).lanista} of ${houseDef(c.h).name} has men in every tavern saying your fighters are drugged before the games and your victories bought. People are beginning to repeat it.`,
    opts: [
      { label: c => `Pay criers to answer it (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; const H = houseOf(c.h); H.prestige = Math.max(0, H.prestige - 12); feud(H, 6); return `By the week's end the town has a new story, and it is about ${houseDef(c.h).name}. They know who paid for it.`; } },
      { label: () => 'Let the sand answer: call them out', ok: c => !houseOf(c.h).called, run: c => { const H = houseOf(c.h); H.called = true; feud(H, 8); G.fame += 2; return `Your herald reads the challenge in the forum. Their champion will be on the next card, for a double purse. Fame +2.`; } },
      { label: () => 'Ignore it', run: () => { const f = 4 + tier() * 2; G.fame = Math.max(0, G.fame - f); return `It runs its course, and leaves a stain. Fame -${f}.`; } },
    ],
  },
  editorsEar: {
    title: 'The editor\'s ear',
    can: () => fit().length > 0 && daysToGames() <= 3 && G.houses.some(H => H.grudge >= 40),
    make: () => ({ h: G.houses.slice().sort((a, b) => b.grudge - a.grudge)[0].id, cost: 50 + tier() * 50 }),
    text: c => `Your steward has it from a clerk: ${houseDef(c.h).name} has paid the man who stands at the editor's elbow. At the next games, when one of yours is down, the thumb will turn more easily.`,
    opts: [
      { label: c => `Pay him more (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; return 'He takes both purses, as such men do, and whispers nothing to anyone.'; } },
      { label: () => 'Lay it before the Magistrate', ok: () => G.patrons.magistrate >= 40, run: c => { const H = houseOf(c.h); H.prestige = Math.max(0, H.prestige - 20); feud(H, 10); favor('magistrate', -3); return `The clerk is flogged and ${houseDef(c.h).name} fined before the council. The Magistrate does not enjoy being made to notice such things. Magistrate favour -3.`; } },
      { label: () => 'Let it stand', run: () => { G.rigged = G.day + daysToGames(); return 'Then your men had better stay on their feet. At the next games, the fallen will find less mercy.'; } },
    ],
  },
  arson: {
    title: 'Fire in the night',
    can: () => G.houses.some(H => H.grudge >= 45),
    make: () => ({ h: G.houses.slice().sort((a, b) => b.grudge - a.grudge)[0].id, cost: 50 + tier() * 40 }),
    text: c => `The fodder store went up after midnight. It was out before it reached the barracks, but a boy saw a man running, and he wore the colours of ${houseDef(c.h).name}.`,
    opts: [
      { label: c => `Rebuild, and say nothing (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; return 'New timber, new thatch, and a second man on the wall at night.'; } },
      { label: c => `Answer fire with fire (${Math.round(c.cost / 2)})`, run: c => {
        const H = houseOf(c.h); G.denarii -= Math.round(c.cost / 2); feud(H, 20); H.prestige = Math.max(0, H.prestige - 20); evAllMor(5);
        if (chance(0.3)) { favor('magistrate', -8); return `Their stable burns two nights later. The watch comes asking where your men were. Magistrate favour -8.`; }
        return `Their stable burns two nights later, and nobody saw anything. Your men are grimly pleased.`;
      } },
      { label: () => 'Patch it and make do', run: c => { G.denarii -= Math.round(c.cost / 3); evAllMor(-5); return 'The men mend what they can. They would have liked an answer made.'; } },
    ],
  },
  defector: {
    title: 'A knock at the back gate',
    can: () => G.houses.some(H => H.roster.length >= 3),
    make: () => { const H = pick(G.houses.filter(X => X.roster.length >= 3)), g = H.roster.slice().sort((a, b) => statSum(a) - statSum(b))[0]; return { h: H.id, r: g.id, pay: Math.round(value(g) * 0.5 / 5) * 5 }; },
    text: c => { const g = houseOf(c.h).roster.find(x => x.id === c.r); return g ? `<b>${g.name}</b>, a ${CLASSES[g.cls].name} of ${houseDef(c.h).name}, is at the back gate with a cloak over his head. He says ${houseDef(c.h).lanista} works men to death, and that he would sooner fight for you.` : 'There was a man at the back gate. He is gone now.'; },
    opts: [
      { label: () => 'Take him in', ok: c => G.roster.length < capacity() && !!houseOf(c.h).roster.find(x => x.id === c.r), run: c => { const H = houseOf(c.h), g = H.roster.find(x => x.id === c.r); takeRival(g); feud(H, 15); return `${g.name} swears to you before dawn. ${houseDef(c.h).name} will know where he went by noon.`; } },
      { label: c => `Sell him back to them (+${c.pay})`, run: c => { G.denarii += c.pay; feud(houseOf(c.h), -5); evAllMor(-3); return `${houseDef(c.h).lanista} pays for the return of his property. Your men watched him led away.`; } },
      { label: () => 'Send him back with an escort', run: c => { feud(houseOf(c.h), -10); return `He is walked home between two of your men. ${houseDef(c.h).lanista} sends a stiff word of thanks.`; } },
    ],
  },

  // ---- the yard and the barracks ----
  roof: {
    title: 'The barracks roof',
    can: () => G.roster.length > 0,
    make: () => ({ cost: 35 + tier() * 30 }),
    text: c => `Last night's storm took a run of tiles off the barracks. Rain is coming through onto the cots. A roofer wants ${c.cost} denarii.`,
    opts: [
      { label: c => `Pay the roofer (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; return 'New tiles by nightfall. The men sleep dry.'; } },
      { label: () => 'Have the men mend it', run: () => { fit().forEach(g => evTire(g, 14)); evAllMor(-2); return 'A day on the roof with mortar and bad language. It holds. Everyone is tired.'; } },
      { label: () => 'Leave it', run: () => {
        evAllMor(-7); const sick = fit().filter(() => chance(0.25)).slice(0, 2); sick.forEach(g => { g.injury = rint(1, 3); });
        return sick.length ? `The men sleep wet. ${sick.map(g => g.name).join(' and ')} wake${sick.length > 1 ? '' : 's'} coughing and cannot train.` : 'The men sleep wet, and say so.';
      } },
    ],
  },
  rats: {
    title: 'Rats in the granary',
    can: () => G.roster.length > 0,
    make: () => ({ cost: 20 + tier() * 15 }),
    text: c => `The cook has found rats in the barley, and a great deal less barley than there should be. A rat-catcher and his dogs can be had for ${c.cost} denarii.`,
    opts: [
      { label: c => `Hire the rat-catcher (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; return 'His terriers work through the store in an afternoon. He leaves with a sack that moves.'; } },
      { label: () => 'Turn the men loose on them', run: () => { evAllMor(4); fit().forEach(g => evTire(g, 6)); return 'It becomes a contest. By dusk there is a tally chalked on the wall and the store is clear. The men are pleased with themselves.'; } },
      { label: () => 'Ignore it', run: c => { if (chance(0.65)) { G.denarii -= c.cost * 2; return `Within the week half the store is spoiled. Replacing it costs ${c.cost * 2} denarii.`; } return 'A stray cat moves in and settles the matter for nothing.'; } },
    ],
  },
  rain: {
    title: 'A week of rain',
    can: () => fit().length > 0,
    make: () => ({}),
    text: () => 'It has rained for four days and the yard is a brown lake. The doctore wants to know whether the men train in it.',
    opts: [
      { label: () => 'Train in the mud', run: () => {
        fit().forEach(g => { addProg(g, 'agi', 1.2); evTire(g, 8); });
        const g = chance(0.3) ? pick(fit()) : null; if (g) { g.injury = rint(1, 2); return `Footwork learned in mud stays learned. ${g.name} goes down hard on a buried post and is out for ${evDays(g.injury)}.`; }
        return 'Footwork learned in mud stays learned. They come in looking like river gods.';
      } },
      { label: () => 'Rest them indoors', run: () => { fit().forEach(g => evTire(g, -18)); evAllMor(-2); return 'They sleep, mend straps and stare at the rain. Rested, and restless.'; } },
      { label: () => 'Dice, wine and stories', run: () => { evAllMor(7); fit().forEach(g => evTire(g, -6)); return 'The oldest lies are told again and believed again. Morale rises.'; } },
    ],
  },
  heat: {
    title: 'The dog days',
    can: () => fit().length > 0,
    make: () => ({ cost: 15 + tier() * 10 }),
    text: c => `The heat has not broken in a week. Men are dropping at the training posts. Snow-cooled water and an awning over the yard would cost ${c.cost} denarii.`,
    opts: [
      { label: c => `Buy shade and cold water (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; fit().forEach(g => evTire(g, -12)); evAllMor(4); return 'The men train under canvas and bless your name, for a day.'; } },
      { label: () => 'They will fight in worse', run: () => {
        fit().forEach(g => { addProg(g, 'str', 1); evTire(g, 15); });
        const g = chance(0.35) ? pick(fit()) : null; if (g) { g.injury = rint(1, 2); evMor(g, -6); return `They harden. ${g.name} is carried in from the yard, raving, and needs ${evDays(g.injury)} in the dark.`; }
        return 'They harden. Nobody thanks you.';
      } },
      { label: () => 'Train at dawn and dusk only', run: () => { fit().forEach(g => evTire(g, -5)); return 'The yard is empty at noon and loud at first light. Nothing is lost.'; } },
    ],
  },
  diceGame: {
    title: 'Dice after dark',
    can: () => home().length >= 2,
    make: () => { const f = home().slice().sort(() => Math.random() - 0.5); return { a: f[0].id, b: f[1].id }; },
    text: c => `The night guard reports a dice game running in the barracks. <b>${gn(c.a)}</b> is winning, and <b>${gn(c.b)}</b> has lost his next three purses to him.`,
    opts: [
      { label: () => 'Forbid it', run: () => { evAllMor(-5); return 'The dice go into the well. The men find other things to resent.'; } },
      { label: () => 'Look the other way', run: c => {
        const a = byId(c.a), b = byId(c.b); evMor(a, 8); evMor(b, -8);
        if (a && b && chance(0.4) && makeBond(a, b, 'rival')) return `${b.name} is sure the dice were loaded. He and ${a.name} are not speaking.`;
        return `${gn(c.a)} struts for a week. ${gn(c.b)} learns to count.`;
      } },
      { label: () => 'The house takes a tenth', run: () => { const cut = 10 + 5 * home().length; G.denarii += cut; evAllMor(-3); return `The game goes on, a little poorer. +${cut} denarii, and some muttering.`; } },
    ],
  },
  stray: {
    title: 'A dog at the gate',
    can: () => G.roster.length > 0,
    make: () => ({}),
    text: () => 'A half-starved yellow dog has attached itself to the ludus. The men are feeding it from their bowls and have given it the name of a rival lanista.',
    opts: [
      { label: () => 'Let them keep it', run: () => { evAllMor(6); G.denarii -= 5; return 'It sleeps across the barracks door and bites the grain merchant. Morale rises.'; } },
      { label: () => 'Drive it off', run: () => { evAllMor(-4); return 'It is back by evening, and driven off again. The men watch it go.'; } },
    ],
  },
  mentor: {
    title: 'The old hand',
    can: () => home().length >= 2,
    make: () => { const h = home(), old = evBest(h, g => g.wins * 3 + evPower(g)), young = evBest(h.filter(g => g !== old), g => -evPower(g)); return { a: old.id, b: young.id, s: evBest(STATS, k => old.stats[k]) }; },
    text: c => `<b>${gn(c.a)}</b> has been watching <b>${gn(c.b)}</b> at the posts and shaking his head. He offers to take the younger man in hand: his own way, and nobody else's.`,
    opts: [
      { label: () => 'Let him teach', run: c => {
        const a = byId(c.a), b = byId(c.b); if (!a || !b) return 'Nothing comes of it.';
        const up = b.stats[c.s] < 20; if (up) b.stats[c.s]++; evTire(a, 18); evTire(b, 18);
        const friends = makeBond(a, b, 'friend');
        return `A week of being knocked down and told why. ${up ? `${b.name}: ${STAT_NAMES[c.s]} +1.` : `${b.name} has little left to learn there.`}${friends ? ' The two of them are thick as thieves now.' : ''}`;
      } },
      { label: () => 'The doctore trains my men', run: c => { evMor(byId(c.a), -6); return `${gn(c.a)} shrugs and goes back to his own work.`; } },
    ],
  },
  runaway: {
    title: 'Over the wall',
    can: () => home().length > 2,
    make: () => ({ g: evBest(home(), g => -g.morale).id, cost: 25 + tier() * 15 }),
    text: c => `The night guard caught <b>${gn(c.g)}</b> halfway over the wall with a blanket and a stolen loaf. He says nothing at all.`,
    opts: [
      { label: () => 'Flog him before the others', run: c => { const g = byId(c.g); evMor(g, -12); evTire(g, 15); G.roster.forEach(x => { if (x !== g) evMor(x, -3); }); return 'Twenty strokes at the post. Nobody else will try the wall this month.'; } },
      { label: () => 'Ask him why', run: c => {
        const g = byId(c.g); if (!g) return 'He is gone.';
        if (chance(0.7)) { evMor(g, 20); addStory(g, 'Tried the wall, and was talked back down.'); return `It comes out slowly: a wife, a debt, a village he will not see again. You listen. ${g.name} goes back to his cell a different man.`; }
        G.roster = G.roster.filter(x => x !== g); departed(g, 'deserted'); log(`${g.name} deserted in the night.`, 'bad');
        return `He hears you out, nods, and is gone before dawn by a way nobody has found. ${g.name} has deserted.`;
      } },
      { label: c => `Double the watch (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; evMor(byId(c.g), -5); return 'Two more men on the wall and a bolt on his door. It is a ludus again, not an inn.'; } },
    ],
  },
  nightmare: {
    title: 'A bad dream',
    can: () => fit().length > 0,
    make: () => ({ g: pick(fit()).id, cost: 20 + tier() * 15 }),
    text: c => `<b>${gn(c.g)}</b> woke the barracks screaming. He has dreamed his own death on the sand, in detail, and he believes it.`,
    opts: [
      { label: c => `A sacrifice to turn it aside (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; evMor(byId(c.g), 12); favor('temple', 4); return 'A black cock, a priest, the right words. He sleeps. Temple favour +4.'; } },
      { label: () => 'Tell him dreams are for children', run: c => { const g = byId(c.g); evMor(g, -9); if (g && chance(0.25) && !g.traits.includes('nervous') && g.traits.length < 4) { g.traits.push('nervous'); return `${g.name} says nothing more about it. He has started looking over his shoulder. He is Nervous now.`; } return `${gn(c.g)} says nothing more about it.`; } },
      { label: () => 'Give him a day of rest', run: c => { const g = byId(c.g); evMor(g, 6); evTire(g, -20); if (g) g.activity = 'rest'; return 'He sits in the sun and sharpens things. By evening he can laugh about it.'; } },
    ],
  },
  meat: {
    title: 'The butcher\'s bargain',
    can: () => G.roster.length > 0,
    make: () => ({ cost: 20 + 6 * G.roster.length }),
    text: c => `The pork that came this morning is green at the bone. The butcher swears it was sound when it left him. Fresh meat would cost ${c.cost} denarii.`,
    opts: [
      { label: c => `Throw it out and buy fresh (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; return 'The dogs get the pork. The men eat well and never know.'; } },
      { label: () => 'Boil it long and salt it hard', run: () => {
        if (chance(0.45)) { const sick = fit().filter(() => chance(0.5)); sick.forEach(g => { g.injury = Math.max(g.injury, 1); evTire(g, 20); }); evAllMor(-6); return sick.length ? `By midnight the latrine has a queue. ${sick.map(g => g.name).join(', ')} cannot stand up tomorrow.` : 'A bad night for stomachs, but nobody is laid up.'; }
        return 'Nobody notices. Nobody dies.';
      } },
      { label: () => 'Barley and beans this week', run: () => { evAllMor(-4); return 'The men eat like oxen and complain like senators.'; } },
    ],
  },
  dig: {
    title: 'Under the yard',
    can: () => G.roster.length > 0,
    make: () => { const g = pick(G.roster), slot = pick(SLOTS), r = clamp(tier() + rint(2, 3), 2, 5), it = { slot, r, cls: g.cls }; return { slot, r, cls: g.cls, sell: Math.max(20, Math.round(itemPrice(it) * 0.5 / 5) * 5) }; },
    text: c => `Men digging a new latrine have struck a rotted chest. Inside, wrapped in oiled wool, is a piece of old kit: ${itemName(c)}, better work than anything made in this town.`,
    opts: [
      { label: () => 'Put it in the armoury', run: c => { const it = makeItem(c.slot, c.r, c.cls); G.armoury.push(it); return `Cleaned and oiled, it goes on the rack: ${itemName(it)}.`; } },
      { label: c => `Sell it (+${c.sell} denarii)`, run: c => { G.denarii += c.sell; return 'A collector in town pays without haggling, which means you asked too little.'; } },
      { label: () => 'Dedicate it at the temple', run: () => { favor('temple', 9); evAllMor(4); return 'It hangs in the shrine of Nemesis with your name beneath it. Temple favour +9. The men approve.'; } },
    ],
  },
  tremor: {
    title: 'The ground moves',
    can: () => G.roster.length > 0,
    make: () => ({ cost: 30 + tier() * 25 }),
    text: c => `A tremor in the night has cracked the cistern and thrown down two training posts. The men are saying Vulcan is angry with the house. Repairs will cost ${c.cost} denarii.`,
    opts: [
      { label: c => `Repair it all (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; return 'Masons, mortar, new oak. By the next market day there is nothing to see.'; } },
      { label: c => `Repair, and sacrifice to Vulcan (${c.cost + 20})`, ok: c => G.denarii >= c.cost + 20, run: c => { G.denarii -= c.cost + 20; evAllMor(6); favor('temple', 5); return 'The smoke goes straight up, which the priest says is good. The men stop whispering. Temple favour +5.'; } },
      { label: () => 'Make do', run: () => { evAllMor(-6); fit().forEach(g => evTire(g, 5)); return 'Water is carried from the street and the men train round the rubble. They take it as a sign, and not a good one.'; } },
    ],
  },

  // ---- the town ----
  foundersDay: {
    title: 'The procession',
    can: () => fit().length > 0,
    make: () => ({ g: evBest(fit(), g => g.wins * 3 + evPower(g)).id }),
    text: c => `The town honours its founder tomorrow, and the council would like gladiators in the procession: oiled, armed and looking dangerous. <b>${gn(c.g)}</b> is asked for by name.`,
    opts: [
      { label: () => 'Send every man who can walk', run: () => { const f = 4 + fit().length * 2; fit().forEach(g => evTire(g, 12)); G.fame += f; favor('magistrate', 6); return `They march behind the priests and before the elephants. Fame +${f}. Magistrate favour +6. A long day on their feet.`; } },
      { label: c => `Send ${gn(c.g)} alone`, run: c => { const g = byId(c.g); evTire(g, 12); evMor(g, 6); if (g) g.fame = (g.fame || 0) + 4; G.fame += 4; favor('magistrate', 3); return `${gn(c.g)} is pelted with flowers and kissed by a stranger. Fame +4. Magistrate favour +3.`; } },
      { label: () => 'My men are not ornaments', run: () => { favor('magistrate', -4); return 'The council finds its ornaments elsewhere. Magistrate favour -4.'; } },
    ],
  },
  graffiti: {
    title: 'Written on the walls',
    can: () => G.roster.some(g => g.wins > 0),
    make: () => ({ g: pick(G.roster.filter(g => g.wins > 0)).id, cost: 20 + tier() * 20 }),
    text: c => `Somebody has been painting <b>${gn(c.g)}</b>'s name on walls all over town: "the girls' sigh", "lord of the sand", and worse. The aedile is not amused. The crowd is.`,
    opts: [
      { label: c => `Pay the painters to do more (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; const g = byId(c.g); if (g) g.fame = (g.fame || 0) + 8; G.fame += 8; favor('magistrate', -3); return `By the next games there is not a tavern wall without him on it. Fame +8. Magistrate favour -3.`; } },
      { label: () => 'Let it be', run: c => { const g = byId(c.g); evMor(g, 8); if (g) g.fame = (g.fame || 0) + 3; G.fame += 3; return `${gn(c.g)} pretends not to have noticed, badly. Fame +3.`; } },
      { label: () => 'Have it scrubbed off', run: c => { favor('magistrate', 5); evMor(byId(c.g), -5); return 'Your slaves spend a night with brushes. The aedile sends his thanks. Magistrate favour +5.'; } },
    ],
  },
  poet: {
    title: 'A poet at the door',
    can: () => G.roster.length > 0,
    make: () => ({ cost: 30 + tier() * 30 }),
    text: c => `A threadbare Greek offers to write the deeds of your house in elegiacs and recite them in the forum. He would like ${c.cost} denarii, or failing that, dinner.`,
    opts: [
      { label: c => `Commission the poem (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; const f = 8 + tier() * 4; G.fame += f; return `It is very long, and people stay to the end. Fame +${f}.`; } },
      { label: () => 'Give him dinner', run: () => { if (chance(0.5)) { G.fame += 3; return 'He eats for three and writes four lines, all of them good. Fame +3.'; } return 'He eats for three and is gone in the morning with a spoon.'; } },
      { label: () => 'Send him away', run: () => chance(0.3) ? (G.fame = Math.max(0, G.fame - 2), 'His next poem is about a miserly lanista. People laugh at it. Fame -2.') : 'He bows, and tries next door.' },
    ],
  },
  sculptor: {
    title: 'In bronze',
    can: () => G.roster.some(g => g.wins >= 2),
    make: () => ({ g: evBest(G.roster.filter(g => g.wins >= 2), g => g.wins).id, fee: 40 + tier() * 40 }),
    text: c => `A sculptor with a commission from the town wants <b>${gn(c.g)}</b> to stand for a statue of a victorious gladiator. It means days of standing still with his arm in the air.`,
    opts: [
      { label: () => 'Lend him gladly', run: c => { const g = byId(c.g); evTire(g, 10); evMor(g, 10); if (g) { g.fame = (g.fame || 0) + 6; addStory(g, 'Stood for a bronze in the forum.'); } G.fame += 6; favor('magistrate', 3); return `It will stand in the forum when you are both dust. Fame +6. Magistrate favour +3.`; } },
      { label: c => `Charge for his time (+${c.fee})`, run: c => { G.denarii += c.fee; evTire(byId(c.g), 10); G.fame += 2; return `The sculptor pays, and gives the statue a slightly weaker chin. Fame +2.`; } },
      { label: () => 'He has work to do', run: () => 'The sculptor finds his model at another ludus.' },
    ],
  },
  admirers: {
    title: 'A crowd at the gate',
    can: () => fit().some(g => g.wins > 0),
    make: () => ({ g: evBest(fit().filter(g => g.wins > 0), g => g.wins).id, pay: 25 + tier() * 25 }),
    text: c => `Since the last games there have been people outside the gate every morning, hoping for a sight of <b>${gn(c.g)}</b>. Today there are forty.`,
    opts: [
      { label: c => `Let them watch him train, for a coin each (+${c.pay})`, run: c => { G.denarii += c.pay; const g = byId(c.g); evTire(g, 8); evMor(g, 4); return `He has never hit a post so hard. +${c.pay} denarii.`; } },
      { label: () => 'Send him out to them', run: c => { const g = byId(c.g); evMor(g, 10); if (g) g.fame = (g.fame || 0) + 5; G.fame += 5; return `${gn(c.g)} clasps hands, lifts a child, loses a lock of hair. Fame +5.`; } },
      { label: () => 'Clear the street', run: () => { G.fame = Math.max(0, G.fame - 2); return 'They go, slowly, and tell people about it. Fame -2.'; } },
    ],
  },
  widow: {
    title: 'A lady\'s invitation',
    can: () => fit().some(g => g.wins > 0),
    make: () => ({ g: pick(fit().filter(g => g.wins > 0)).id, pay: 60 + tier() * 50 }),
    text: c => `A litter with drawn curtains stops at the gate. A rich widow of the town would like <b>${gn(c.g)}</b> to dine with her this evening, and has sent ${c.pay} denarii to cover the inconvenience.`,
    opts: [
      { label: c => `Send him (+${c.pay})`, run: c => {
        const g = byId(c.g); G.denarii += c.pay; evTire(g, 15);
        if (chance(0.5)) { evMor(g, 12); return `${gn(c.g)} comes back at dawn wearing a ring he did not leave with. +${c.pay} denarii.`; }
        evMor(g, -8); return `${gn(c.g)} comes back at dawn and will not talk about it. +${c.pay} denarii.`;
      } },
      { label: c => `Ask twice the price`, run: c => { if (chance(0.5)) { G.denarii += c.pay * 2; evTire(byId(c.g), 15); return `The steward does not blink. +${c.pay * 2} denarii.`; } return 'The curtains close and the litter moves on.'; } },
      { label: () => 'He is not for hire', run: c => { evMor(byId(c.g), 5); return 'The litter leaves. He heard what you said, and stands a little straighter.'; } },
    ],
  },
  noble: {
    title: 'A young man of family',
    can: () => fit().length > 0,
    make: () => ({ g: pick(fit()).id, pay: 50 + tier() * 50 }),
    text: c => `A senator's son, bored, drunk and nineteen, wants to spend a day training with real gladiators. He offers ${c.pay} denarii and wants to cross swords with <b>${gn(c.g)}</b>.`,
    opts: [
      { label: c => `Take his money and let him try (+${c.pay})`, run: c => {
        G.denarii += c.pay;
        if (chance(0.35)) { favor('magistrate', -10); return `${gn(c.g)} forgets himself for one stroke. The boy goes home on a door, and his father writes to the Magistrate. +${c.pay} denarii. Magistrate favour -10.`; }
        favor('magistrate', 4); return `The boy goes home with bruises, a story and a new respect for the trade. +${c.pay} denarii. Magistrate favour +4.`;
      } },
      { label: c => `Take his money and have him humoured (+${Math.round(c.pay / 2)})`, run: c => { G.denarii += Math.round(c.pay / 2); evMor(byId(c.g), -5); return `${gn(c.g)} loses three bouts to a child with a wooden sword, and takes it as an insult.`; } },
      { label: () => 'This is not a playground', run: () => { favor('magistrate', -2); return 'He calls you several things on the way out. Magistrate favour -2.'; } },
    ],
  },
  tax: {
    title: 'The assessor',
    can: () => G.denarii >= 40,
    make: () => ({ cost: Math.round((40 + tier() * 40 + G.denarii * 0.05) / 5) * 5 }),
    text: c => `The town's assessor has been through your books and finds ${c.cost} denarii owing on "entertainments". The law he cites is older than the town.`,
    opts: [
      { label: c => `Pay it (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; return 'He writes you a receipt in a very fine hand.'; } },
      { label: c => `A gift to the assessor (${Math.round(c.cost / 3)})`, ok: c => G.denarii >= Math.round(c.cost / 3), run: c => {
        if (chance(0.65)) { G.denarii -= Math.round(c.cost / 3); return 'He discovers an error in his own arithmetic.'; }
        G.denarii -= c.cost * 2; favor('magistrate', -6); return `He is, of all things, honest. The fine is ${c.cost * 2} denarii. Magistrate favour -6.`;
      } },
      { label: () => 'Appeal to the Magistrate', run: c => {
        if (G.patrons.magistrate >= 40) { favor('magistrate', -5); return 'The Magistrate waves it away, and lets you know he has done so. Magistrate favour -5.'; }
        G.denarii -= Math.round(c.cost * 1.5 / 5) * 5; return `The Magistrate does not know your face well enough. The tax stands, with costs: ${Math.round(c.cost * 1.5 / 5) * 5} denarii.`;
      } },
    ],
  },
  coins: {
    title: 'Light money',
    can: () => G.roster.length > 0,
    make: () => ({ loss: 25 + tier() * 25 }),
    text: c => `Your steward has been weighing the last purse from the games. A good part of it is clipped coin, short by ${c.loss} denarii in all.`,
    opts: [
      { label: () => 'Complain to the Magistrate', run: c => { favor('magistrate', -4); if (chance(0.6)) { G.denarii += c.loss; return `He makes it good from his own chest, sourly. +${c.loss} denarii. Magistrate favour -4.`; } return 'He is astonished that you would suggest it. Magistrate favour -4.'; } },
      { label: () => 'Pass it on in the market', run: c => { if (chance(0.7)) return 'It buys barley as well as honest silver does.'; G.denarii -= c.loss; favor('guild', -6); return `The Guild's money-changer catches it. You pay, and are remembered. -${c.loss} denarii. Guild favour -6.`; } },
      { label: () => 'Swallow the loss', run: c => { G.denarii -= c.loss; return `You write off ${c.loss} denarii and say nothing.`; } },
    ],
  },
  cargo: {
    title: 'A share in a cargo',
    can: () => G.denarii >= 80,
    make: () => ({ cost: 60 + tier() * 60 }),
    text: c => `A Guild shipper has a hull loading wine for Massilia and one share unsold. ${c.cost} denarii buys it. He says it cannot fail, which is what they all say.`,
    opts: [
      { label: c => `Buy the share (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => {
        G.denarii -= c.cost; favor('guild', 3); const r = Math.random();
        if (r < 0.45) { G.denarii += c.cost * 2; return `Word comes back within the week: sold on the quay at double. +${c.cost * 2} denarii.`; }
        if (r < 0.75) { G.denarii += c.cost; return 'A slow passage and a glutted market. You get your stake back and no more.'; }
        return 'The ship is seen off Corsica and not again. The share is worth the wax it is written on.';
      } },
      { label: () => 'I know nothing about ships', run: () => 'The share goes to a fuller, who talks of nothing else for a month.' },
    ],
  },
  fugitive: {
    title: 'A man in the hayloft',
    can: () => G.roster.length > 0,
    make: () => ({ reward: 40 + tier() * 30, g: makeGladiator(15 + tier() * 6 + rint(0, 4)) }),
    text: c => `The stable boy has found a runaway hiding in the hay: <b>${c.g.name}</b>, a field slave from an estate up the valley, with the marks of the whip on him. He begs to be allowed to fight instead. His owner has posted ${c.reward} denarii for his return.`,
    opts: [
      { label: () => 'Hide him among the men', ok: () => G.roster.length < capacity(), run: c => {
        welcome(c.g); G.roster.push(c.g); if (!c.g.story) c.g.story = []; addStory(c.g, 'A runaway, hidden in the ludus under another name.'); evMor(c.g, 20);
        if (chance(0.3)) { favor('magistrate', -8); return `${c.g.name} takes the oath under a new name. Somebody talks; the Magistrate chooses not to look too closely, this once. Magistrate favour -8.`; }
        return `${c.g.name} takes the oath under a new name. Nobody comes asking.`;
      } },
      { label: c => `Return him (+${c.reward})`, run: c => { G.denarii += c.reward; evAllMor(-5); return `He is taken away in a cart. The men watched from the yard. +${c.reward} denarii.`; } },
      { label: () => 'Give him bread and a head start', run: () => { evAllMor(3); return 'He is gone over the back wall before the moon is up. The men pretend to know nothing.'; } },
    ],
  },

  // ---- visitors with something to sell ----
  smithCart: {
    title: 'The travelling smith',
    can: () => G.roster.length > 0,
    make: () => { const g = pick(G.roster), slot = pick(SLOTS), r = clamp(tier() + rint(2, 3), 2, 6), it = { slot, r, cls: g.cls }; return { slot, r, cls: g.cls, price: Math.max(25, Math.round(itemPrice(it) * 0.7 / 5) * 5) }; },      // a third under what the town's smith would ask
    text: c => `A smith on his way to the legions has stopped his cart at your gate. He has one piece he will part with: ${itemName(c)}. He wants ${c.price} denarii and is leaving at noon.`,
    opts: [
      { label: c => `Buy it (${c.price})`, ok: c => G.denarii >= c.price, run: c => { G.denarii -= c.price; const it = makeItem(c.slot, c.r, c.cls); G.armoury.push(it); return `It goes into the armoury: ${itemName(it)}.`; } },
      { label: c => `Offer ${Math.round(c.price * 0.6)}`, ok: c => G.denarii >= Math.round(c.price * 0.6), run: c => {
        if (chance(0.45)) { G.denarii -= Math.round(c.price * 0.6); const it = makeItem(c.slot, c.r, c.cls); G.armoury.push(it); return `He spits, counts the coins twice, and takes them. ${itemName(it)} is yours.`; }
        return 'He laughs, whips up the mule and is gone.';
      } },
      { label: () => 'Let him go', run: () => 'The cart rattles off toward the frontier.' },
    ],
  },
  healer: {
    title: 'A Greek physician',
    can: () => G.roster.length > 0,
    make: () => ({ g: evBest(G.roster, g => g.injury * 20 + g.fatigue + (maxHp(g) - g.hp)).id, cost: 35 + tier() * 30 }),
    text: c => `A physician of the school of Pergamum, who has patched gladiators for twenty years, is passing through. For ${c.cost} denarii he will give <b>${gn(c.g)}</b> a day of his whole attention.`,
    opts: [
      { label: c => `Pay him (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { const g = byId(c.g); G.denarii -= c.cost; if (g) { g.injury = 0; g.hp = maxHp(g); g.fatigue = clamp(g.fatigue - 40, 0, 100); } return `Oil, hot stones, a needle, and a diet nobody will keep. ${gn(c.g)} gets up whole.`; } },
      { label: c => `Have him look over everyone (${c.cost * 2})`, ok: c => G.denarii >= c.cost * 2, run: c => { G.denarii -= c.cost * 2; G.roster.forEach(g => { g.injury = Math.max(0, g.injury - 2); g.fatigue = clamp(g.fatigue - 20, 0, 100); g.hp = Math.min(maxHp(g), g.hp + Math.round(maxHp(g) * 0.3)); }); return 'He works down the line of cots until dark. Every man is the better for it.'; } },
      { label: () => 'We have our own ways', run: () => 'He looks at your infirmary, says something in Greek, and leaves.' },
    ],
  },
  masseur: {
    title: 'Hands from the baths',
    can: () => fit().length > 0,
    make: () => ({ cost: 12 * Math.max(1, fit().length) + tier() * 10 }),
    text: c => `The bath-house is closed for repairs and its masseurs are idle. Their master offers the lot of them for a day, for ${c.cost} denarii.`,
    opts: [
      { label: c => `Hire them (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; G.roster.forEach(g => evTire(g, -30)); evAllMor(5); return 'Oil, strigils and a great deal of groaning. The men walk like younger men.'; } },
      { label: () => 'Not this month', run: () => 'They go to the next ludus down the road.' },
    ],
  },
  tout: {
    title: 'A man who knows things',
    can: () => fit().length > 0 && daysToGames() <= 3,
    make: () => ({ cost: 30 + tier() * 30 }),
    text: c => `A tout who drinks with the other schools' trainers says he knows who your men will meet at the next games, and how those men fight. He wants ${c.cost} denarii.`,
    opts: [
      { label: c => `Buy what he knows (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => {
        G.denarii -= c.cost;
        if (chance(0.75)) { fit().forEach(g => { addProg(g, 'skl', 1.5); evMor(g, 4); }); return 'It is good: which shoulder drops, who tires, who hates a low line. The doctore drills it into them.'; }
        return 'It is tavern gossip, and half of it about a man who died last year.';
      } },
      { label: () => 'My men need no spies', run: () => 'He sells it to someone else, about you.' },
    ],
  },
  hound: {
    title: 'The beast-dealer',
    can: () => fit().length > 0,
    make: () => ({ cost: 40 + tier() * 30 }),
    text: c => `A dealer bringing animals for the hunts has a Molossian hound too savage for his handlers. For ${c.cost} denarii it is yours: a guard for the gate, and something quick for the men to practise against.`,
    opts: [
      { label: c => `Buy the hound (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => {
        G.denarii -= c.cost; fit().forEach(g => addProg(g, 'agi', 1.5));
        const g = chance(0.25) ? pick(fit()) : null; if (g) { g.injury = 1; addScar(g, 'claw'); return `Nothing teaches footwork like teeth. ${g.name} learns it the slow way and wears the marks.`; }
        return 'Nothing teaches footwork like teeth. The men are quicker for it, and the grain merchant now knocks.';
      } },
      { label: () => 'No', run: () => 'The hound goes to the arena, where it will have a short career.' },
    ],
  },
  veteran: {
    title: 'An old gladiator',
    can: () => G.roster.length > 0,
    make: () => ({ cost: 15 + tier() * 10 }),
    text: c => `A one-eyed man with a wooden sword on his belt asks for a corner of the stable and a bowl a day. In return he will keep the gate and tell your men what he knows. It would cost perhaps ${c.cost} denarii to feed him through the season.`,
    opts: [
      { label: c => `Take him in (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; G.roster.forEach(g => { g.xp = (g.xp || 0) + 1; }); evAllMor(4); return 'He sits by the gate in the evenings and the men sit round him. They are learning things the doctore never fought long enough to know.'; } },
      { label: () => 'There are no free bowls here', run: () => { evAllMor(-3); return 'He nods and goes. The men saw what a wooden sword is worth at your gate.'; } },
    ],
  },

  // ---- the gods, and the men who speak for them ----
  omen: {
    title: 'Birds over the yard',
    can: () => G.roster.length > 0,
    make: () => ({ cost: 20 + tier() * 20, good: chance(0.5) }),
    text: c => `${c.good ? 'An eagle circled the yard three times at dawn and flew toward the arena.' : 'Crows have been sitting on the barracks roof since dawn, all facing the same way.'} The men have stopped training to argue about what it means.`,
    opts: [
      { label: c => `Pay an augur to read it (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; evAllMor(9); favor('temple', 4); return `${c.good ? 'Victory, he says, without hesitation.' : 'He looks a long time, and finds a way to call it favourable.'} The men believe him. Temple favour +4.`; } },
      { label: () => 'Read it yourself', run: c => { if (c.good || chance(0.5)) { evAllMor(5); return 'You tell them it means the gods are watching this house. They want to believe it, and do.'; } evAllMor(-6); return 'You tell them it means nothing. They do not want to believe that.'; } },
      { label: () => 'Birds are birds. Back to work', run: c => { evAllMor(c.good ? -2 : -5); return 'They go back to the posts, looking up.'; } },
    ],
  },
  rites: {
    title: 'The feast of Hercules',
    can: () => fit().length > 0,
    make: () => ({ cost: 45 + tier() * 35 }),
    text: c => `Tomorrow is the feast of Hercules, the gladiators' own god. The men ask leave to keep it. A bull for the altar would cost ${c.cost} denarii, and would be remembered.`,
    opts: [
      { label: c => `Give them the bull (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; evAllMor(13); favor('temple', 8); fit().forEach(g => evTire(g, -10)); return 'Smoke, roast meat, and every man swearing his next kill to the god. Temple favour +8. Morale soars.'; } },
      { label: () => 'A day\'s leave, no more', run: () => { evAllMor(6); favor('temple', 2); return 'They keep it with garlands and watered wine. Temple favour +2.'; } },
      { label: () => 'Hercules trained every day', run: () => { evAllMor(-7); favor('temple', -3); return 'They train. Badly, and on purpose. Temple favour -3.'; } },
    ],
  },
  letter: {
    title: 'A letter from home',
    can: () => home().length > 0,
    make: () => { const g = pick(home()); return { g: g.id, cost: 40 + tier() * 30 }; },
    text: c => { const g = byId(c.g); return `A trader has carried a message all the way from ${g ? g.origin : 'the provinces'} for <b>${gn(c.g)}</b>: his mother is sick and the family's land is pledged. ${c.cost} denarii would clear the debt. He has never asked you for anything.`; },
    opts: [
      { label: c => `Send the money (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => { const g = byId(c.g); G.denarii -= c.cost; evMor(g, 25); if (g) addStory(g, 'His family\'s debt was paid by the house.'); G.roster.forEach(x => { if (x !== g) evMor(x, 3); }); return `${gn(c.g)} cannot find words, and stops trying. He will fight for this house as if it were his own.`; } },
      { label: () => 'Promise it from his next purse', run: c => { evMor(byId(c.g), 8); return `${gn(c.g)} nods. He means to win it.`; } },
      { label: () => 'A ludus is not a bank', run: c => { evMor(byId(c.g), -15); return `${gn(c.g)} folds the letter very small and puts it away.`; } },
    ],
  },
  thief: {
    title: 'A boy in the kitchen',
    can: () => G.roster.length > 0,
    make: () => ({}),
    text: () => 'The cook has a street boy by the ear, caught with a loaf under his tunic. He is perhaps ten, and has plainly done this before.',
    opts: [
      { label: () => 'Put him to work in the kitchen', run: () => {
        if (chance(0.65)) { evAllMor(4); return 'He scrubs pots, runs messages and knows everything said in every tavern in town. The men make a pet of him.'; }
        const loss = 15 + tier() * 15; G.denarii -= loss; return `He works a week, then leaves in the night with the kitchen silver. -${loss} denarii.`;
      } },
      { label: () => 'Hand him to the watch', run: () => { favor('magistrate', 2); evAllMor(-2); return 'The watch takes him away. Magistrate favour +2.'; } },
      { label: () => 'Let him keep the loaf', run: () => { evAllMor(2); return 'He is over the wall before you finish the sentence.'; } },
    ],
  },

  // ---- the other houses ----
  sparring: {
    title: 'A friendly wager',
    can: () => fit().length > 0 && G.denarii >= 40,
    make: () => { const g = evBest(fit(), evPower), H = pick(G.houses); return { g: g.id, h: H.id, stake: 40 + tier() * 40 }; },
    text: c => `${houseDef(c.h).lanista} of ${houseDef(c.h).name} proposes a match with wooden swords in your yard: his best against <b>${gn(c.g)}</b>, ${c.stake} denarii a side, no blood and no crowd.`,
    opts: [
      { label: c => `Take the wager (${c.stake})`, ok: c => G.denarii >= c.stake, run: c => {
        const g = byId(c.g); if (!g) return 'It comes to nothing.';
        const p = clamp(0.5 + (evPower(g) - (22 + tier() * 9)) * 0.03, 0.2, 0.85); evTire(g, 12);
        if (chance(p)) { G.denarii += c.stake; evMor(g, 10); g.xp = (g.xp || 0) + 1; feud(houseOf(c.h), 3); return `${g.name} takes him apart in front of both schools. +${c.stake} denarii. ${houseDef(c.h).lanista} pays with a smile like a cut.`; }
        G.denarii -= c.stake; evMor(g, -8); return `${g.name} is a touch slow on the day. -${c.stake} denarii, and a long silent walk back to the barracks.`;
      } },
      { label: () => 'Decline', run: c => { feud(houseOf(c.h), 2); return 'He lets it be known in town that you were afraid to.'; } },
    ],
  },
  boast: {
    title: 'Big words in the tavern',
    can: () => fit().length > 0,
    make: () => ({ g: pick(fit()).id, h: pick(G.houses).id }),
    text: c => `On his last night's leave <b>${gn(c.g)}</b> stood on a table and told the town that nobody in ${houseDef(c.h).name} could stand in front of him for a count of twenty. ${houseDef(c.h).lanista} has heard.`,
    opts: [
      { label: () => 'Stand behind every word', run: c => { const g = byId(c.g); evMor(g, 10); if (g) g.fame = (g.fame || 0) + 3; G.fame += 3; feud(houseOf(c.h), 8); return `The town is talking about nothing else. Fame +3. ${houseDef(c.h).name} will want an answer on the sand.`; } },
      { label: () => 'Have him apologise', run: c => { evMor(byId(c.g), -10); feud(houseOf(c.h), -6); return `${gn(c.g)} says the words through his teeth. The matter is closed, and he will not forget who closed it.`; } },
      { label: () => 'Say it was the wine', run: () => 'Everyone agrees it was the wine. Nobody believes it.' },
    ],
  },
  spy: {
    title: 'A face at the wall',
    can: () => fit().length > 0 && G.houses.some(H => H.grudge >= 15),
    make: () => ({ h: G.houses.slice().sort((a, b) => b.grudge - a.grudge)[0].id, pay: 30 + tier() * 30 }),
    text: c => `The gate-keeper has caught a man on the roof of the wine shop opposite, counting your fighters' strokes onto a wax tablet. He is a freedman of ${houseDef(c.h).name}.`,
    opts: [
      { label: () => 'Beat him and send him back', run: c => { feud(houseOf(c.h), 8); evAllMor(5); return 'He goes home across a mule. The men enjoyed that more than they should have.'; } },
      { label: () => 'Let him watch the wrong things', run: c => { fit().forEach(g => evMor(g, 3)); const H = houseOf(c.h); H.prestige = Math.max(0, H.prestige - 10); return `For a week your men train left-handed and badly. ${houseDef(c.h).name} will prepare for a school that does not exist.`; } },
      { label: c => `Turn him: what does his master pay? (${c.pay})`, ok: c => G.denarii >= c.pay, run: c => { G.denarii -= c.pay; fit().forEach(g => addProg(g, 'skl', 1)); feud(houseOf(c.h), -3); return `He is cheap. Now the tablet travels the other way, and your doctore knows how ${houseDef(c.h).name} drills.`; } },
    ],
  },
};

function rollEvent() {
  if (G.pendingEvent) return;       // something from the road already wants an answer today
  const all = Object.keys(EVENTS).filter(id => !EVENTS[id].auto && EVENTS[id].can());
  if (!all.length) return;
  const seen = G.recentEvents || (G.recentEvents = []), fresh = all.filter(id => !seen.includes(id));      // nothing comes round again until a dozen other things have
  const id = pick(fresh.length ? fresh : all);
  seen.push(id); if (seen.length > 12) seen.shift();
  G.pendingEvent = { id, c: EVENTS[id].make() };
}
