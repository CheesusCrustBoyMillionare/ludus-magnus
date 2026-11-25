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

// The house is finished when the cells are empty and no man on the block can be paid for. A block with nobody on it is
// not that: the dealer brings more on the next games day, and a full purse will buy them.
const houseEmpty = () => !G.roster.length && G.market.length > 0 && G.denarii < Math.min(...G.market.map(m => m.price));
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

// What an entry in the chronicle is about, judged from its words: the sand, the road, the house or the men.
const LOG_TOPICS = {
  sand: /victory|defeat|\bbout|games|arena|crowd|champion|tournament|\btitle|wager|laurel|spared|called (you|them) out|auction/i,
  road: /contract|province|\bwild|quest|bounty|journey|fountain|\broad\b|\bcamp\b|march|region|eagle|done:|driven off|gold coin/i,
  house: /taken on as|dismissed|raised:|bought|\bsold\b|forge|smith|reforge|commission|improved|market|dealer|gift|favour|magistrate|guild|temple|priests|denarii short|\bdebt|word is sent|regimen|asked of/i,
  men: /rank of|perk|learned|\bdied|\bdies|did not come back|friends|bad blood|\bvow|sworn|freed|waiting for you|finished what he set out|rises to|sparring/i,
};
const logTopic = (e, topic) => !LOG_TOPICS[topic] || LOG_TOPICS[topic].test(String(e.t).replace(/<[^>]+>/g, ''));
// The chronicle as plain words, newest day first, for copying out of the game.
function logText(entries) {
  const out = []; let day = null;
  for (const e of entries.slice().reverse()) { if (e.d !== day) { day = e.d; out.push((out.length ? '\n' : '') + 'Day ' + e.d); } out.push('  ' + (e.k === 'gold' ? '* ' : e.k === 'bad' ? '- ' : '  ') + String(e.t).replace(/<[^>]+>/g, '').replace(/&mdash;/g, '-').replace(/&middot;/g, '.').replace(/&[a-z]+;/g, ' ')); }
  return out.join('\n');
}
function log(text, kind) {
  G.log.push({ d: G.day, t: text, k: kind || '' });
  if (G.log.length > 400) G.log.shift();
}

// ---------- the annals: deeds, records, and the years ----------
// A deed is done once and stays done. Each is worth a point of legacy to the heir, if it comes to that.
// at() gives [how far, how far it must go] for the deeds that are counted towards.
const mapOf = () => (G.dynasty && G.dynasty.map) || {};
const DEEDS = [
  { id: 'win1', name: 'First blood', what: 'Win a bout.', at: () => [G.tally.wins, 1] },
  { id: 'win10', name: 'A name in the pits', what: 'Win 10 bouts.', at: () => [G.tally.wins, 10] },
  { id: 'win50', name: 'A house to be feared', what: 'Win 50 bouts.', at: () => [G.tally.wins, 50] },
  { id: 'win100', name: 'A hundred victories', what: 'Win 100 bouts.', at: () => [G.tally.wins, 100] },
  { id: 'run5', name: 'Five on the run', what: 'Win 5 bouts in a row.', at: () => [G.bestStreak || 0, 5] },
  { id: 'run10', name: 'Unbeaten', what: 'Win 10 bouts in a row.', at: () => [G.bestStreak || 0, 10] },
  { id: 'sweep', name: 'The day is yours', what: 'Fight and win every bout on a card of three or more.', at: () => [G.sweeps || 0, 1] },
  { id: 'tier1', name: 'Out of the pits', what: `Reach the ${TIERS[1].name}.`, done: () => tier() >= 1 },
  { id: 'tier2', name: 'The city knows you', what: `Reach the ${TIERS[2].name}.`, done: () => tier() >= 2 },
  { id: 'tier3', name: 'The great arena', what: `Reach the ${TIERS[3].name}.`, done: () => tier() >= 3 },
  { id: 'emperor', name: 'Before the Emperor', what: 'Win the Emperor\'s Games.', done: () => !!G.won },
  { id: 'title', name: 'Champion of the arena', what: 'A man of yours takes the championship.', done: () => !!G.title && G.title.house === null },
  { id: 'title3', name: 'None can take it', what: 'Defend the championship three times.', at: () => [G.title && G.title.house === null ? G.title.defences : 0, 3] },
  { id: 'laurel', name: 'The laurel', what: 'A man of yours wins the Laurel Tournament.', done: () => (G.laurels || []).some(x => !x.hid) },
  { id: 'crown1', name: 'Victor of a festival', what: 'Win a festival crown.', at: () => [trophies(), 1] },
  { id: 'crown3', name: 'Three crowns', what: 'Win three festival crowns.', at: () => [trophies(), 3] },
  { id: 'first', name: 'First among the schools', what: 'Stand above every rival house in renown.', done: () => G.fame > 0 && G.houses.every(H => H.prestige < G.fame) },
  { id: 'primus', name: 'A man at the top', what: `A fighter of yours reaches the rank of ${RANKS[RANKS.length - 1].name}.`, done: () => G.roster.some(g => g.rank >= RANKS.length - 1) },
  { id: 'killer', name: 'A killer in the house', what: 'A fighter of yours has five kills.', at: () => [Math.max(0, ...G.roster.map(g => g.kills || 0)), 5] },
  { id: 'freed', name: 'The wooden sword', what: 'Give a fighter his freedom.', done: () => (G.alumni || []).some(x => x.why === 'freed') },
  { id: 'cells', name: 'A full barracks', what: 'Keep nine fighters at once.', at: () => [G.roster.length, 9] },
  { id: 'staff', name: 'A full household', what: 'Fill every post.', at: () => [Object.keys(G.staff).length, Object.keys(STAFF_ROLES).length] },
  { id: 'built', name: 'Nothing left to build', what: 'Improve every building as far as it goes.', at: () => [Object.keys(FACILITIES).filter(k => (G.fac[k] || 0) >= 3).length, Object.keys(FACILITIES).length] },
  { id: 'forge', name: 'An imperial forge', what: 'Improve the forge as far as it goes.', at: () => [G.smith.level, 4] },
  { id: 'harness', name: 'A matched harness', what: 'Arm a man in five pieces of one grade.', done: () => G.roster.some(g => g.gear && gearStats(g).full === 2) },
  { id: 'rich', name: 'A heavy purse', what: 'Hold 2,000 denarii.', at: () => [Math.max(0, G.denarii), 2000] },
  { id: 'patron', name: 'A friend in high places', what: 'Reach 80 favour with a patron.', at: () => [Math.round(Math.max(...Object.values(G.patrons))), 80] },
  { id: 'work', name: 'First choice', what: 'Earn the best name for work on contract.', at: () => [Math.round(workRep()), 85] },
  { id: 'sites', name: 'A walker of the province', what: 'Deal with ten places out in the country.', at: () => [mapOf().cleared || 0, 10] },
  { id: 'bounty', name: 'The Magistrate\'s hunter', what: 'Take three bounties.', at: () => [mapOf().bounties || 0, 3] },
  { id: 'safe', name: 'Safe roads', what: 'Make a region of the province safe.', at: () => [safeRegions().length, 1] },
  { id: 'eagle', name: 'The eagle of the Seventeenth', what: 'Find the lost eagle.', done: () => (mapOf().story || 0) >= 5 },
];
const deedDone = D => { try { if (D.done) return !!D.done(); const [a, b] = D.at(); return a >= b; } catch (e) { return false; } };
const deedCount = () => Object.keys(G.deeds || {}).length;
// Marks whatever has just been achieved. The lines of a report can be handed in to carry the news.
function checkDeeds(lines) {
  const got = [];
  G.deeds = G.deeds || {};
  for (const D of DEEDS) {
    if (G.deeds[D.id] || !deedDone(D)) continue;
    G.deeds[D.id] = G.day; got.push(D);
    log(`A deed for the annals: ${D.name}.`, 'gold');
    if (lines) lines.push(`<span class="gold">A deed for the annals: <b>${D.name}</b>.</span>`);
  }
  return got;
}
// The best the house has done at one thing or another. `more`: a bigger figure beats the old one.
function setRecord(k, v, who, vs, more) {
  const R = G.records = G.records || {};
  if (!(v > 0) || (R[k] && (more ? v <= R[k].v : v >= R[k].v))) return false;
  R[k] = { v, who, vs: vs || '', day: G.day };
  return true;
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
function stipend() { return Math.round(G.patrons.guild / 10 * (1 + tier())) + (typeof safeRegions === 'function' ? SAFE_TOLL * safeRegions().length : 0); }
function favor(k, d) { G.patrons[k] = clamp(G.patrons[k] + d, 0, 100); if (d > 0 && G.patrons[k] >= HONOUR_AT) honour(k); }
// The first time a patron comes to trust the house (60 favour) it is marked, once, with a gift of the patron's own kind:
// a blade from the Magistrate's armoury, a purse from the Guild, the priests' hands on every man from the Temple.
const HONOUR_AT = 60;
const HONOURS = {
  magistrate: 'a blade from his own armoury', guild: 'a purse, counted out in public', temple: 'every man blessed and made whole',
};
function honour(k) {
  if (!HONOURS[k] || (G.honoured = G.honoured || {})[k]) return false;
  G.honoured[k] = G.day;
  if (k === 'magistrate') {
    const best = G.roster.slice().sort((a, b) => statSum(b) - statSum(a))[0], it = makeItem('weapon', clamp(tier() + 2, 2, 6), best ? best.cls : Object.keys(CLASSES)[0]);
    it.mw = true; G.armoury.push(it);
    log(`The Magistrate lets it be known that he trusts your house, and sends a thing from his own armoury to prove it: ${itemName(it)}.`, 'gold');
  } else if (k === 'guild') {
    const n = 100 * (1 + tier()); G.denarii += n;
    log(`The Guild votes your house its confidence, and ${n} denarii with it, counted out where the whole exchange can see.`, 'gold');
  } else {
    G.roster.forEach(g => { g.morale = 100; if (!g.away) { g.injury = Math.max(0, g.injury - 2); g.hp = maxHp(g); } });
    log('The priests of Nemesis come unasked, with fire and water, and lay hands on every man in the house. They say the goddess knows your gate.', 'gold');
  }
  return true;
}
function mercyBonus() { return 0.04 * G.fac.infirmary + 0.03 * staffLvl('medicus') + 0.02 * facLvl('shrine') + G.patrons.temple * 0.001 - (G.rigged && G.rigged >= G.day ? 0.15 : 0) + (G.blessed && G.blessed >= G.day ? 0.1 : 0); }
// ---- what may be asked of a patron, and what a patron may ask of you ----
// A petition spends favour for something now. One may be put to each patron between one games and the next, and only
// by a house he knows well enough to listen to.
const nextGames = () => { for (let d = G.day + 1; ; d++) if (gamesOn(d)) return d; };      // the next day there are games, after today
const nextMarket = () => G.day + (GAMES_EVERY - G.day % GAMES_EVERY);                    // the next market day, after today
const hottestHouse = () => G.houses.slice().sort((a, b) => b.grudge - a.grudge)[0];
const PETITIONS = {
  magistrate: [
    { id: 'card', name: 'A richer card', cost: 10, need: 35, desc: 'Every purse at the next games is half as large again.',
      run: () => { G.richCard = nextGames(); return 'He has a word with the men who pay for the games. The next card will be worth fighting for.'; } },
    { id: 'fine', name: 'Have a rival fined', cost: 12, need: 40, desc: 'The house you have the worst feud with loses 25 renown. They will know who asked.',
      block: () => hottestHouse().grudge >= 15 ? '' : 'You have no quarrel worth bringing before him.',
      run: () => { const H = hottestHouse(); H.prestige = Math.max(0, H.prestige - 25); feud(H, 8); return `${houseDef(H.id).name} is found to have broken some ordinance of the games, and pays for it in the forum.`; } },
    { id: 'levy', name: 'The pick of the prisoners', cost: 15, need: 60, desc: 'A prisoner of war, better than anything on the block, is sent to the market for you at half his price. He goes with the rest on the next market day.',
      block: () => (G.market || []).some(m => m.levy) ? 'The man he sent is at the market still.' : '',
      run: () => { const g = makeGladiator(18 + tier() * 8 + rint(8, 11)); g.gear = emptyGear(); g.bg = 'captive'; BACKGROUNDS.captive.make(g); g.hp = maxHp(g); g.levy = true; g.price = Math.max(5, round5(marketPrice(g) * 0.5)); G.market.unshift(g);
        return `A file of prisoners goes through the town to the mines, and one is taken out of it at the Magistrate's word: ${g.name} of ${g.origin}, a ${CLASSES[g.cls].name}. He is at the market, and the dealer has been told the price: ${g.price} denarii.`; } },
  ],
  guild: [
    { id: 'advance', name: 'An advance', cost: 8, need: 20, desc: () => `${guildAdvance()} denarii now, against the stipend.`,
      run: () => { const n = guildAdvance(); G.denarii += n; return `A clerk counts ${n} denarii onto the table and writes your name in a long book.`; } },
    { id: 'grain', name: 'Grain at their cost', cost: 10, need: 35, desc: 'Your men eat for nothing until the next market day.',
      run: () => { G.grainUntil = nextMarket(); return 'Their carts will stop at your gate first. Until the next market day the barley costs you nothing.'; } },
    { id: 'book', name: 'Their book behind your men', cost: 14, need: 60, desc: 'At the next games every wager you win pays half as much again.',
      run: () => { G.bookUntil = nextGames(); return 'The men who make the odds are told whose money to be generous with. At the next games your wagers are written at a better price.'; } },
  ],
  temple: [
    { id: 'blessing', name: 'A blessing on the school', cost: 10, need: 20, desc: 'Every man\'s morale +15, and the fallen are spared a tenth more often at the next games.',
      run: () => { G.roster.forEach(g => { g.morale = clamp(g.morale + 15, 0, 100); }); G.blessed = nextGames(); return 'The priests come with fire and laurel and go round every cell. The men stand straighter for it.'; } },
    { id: 'heal', name: 'The priests\' care', cost: 12, need: 35, desc: 'Every wound mends two days sooner, and every man is made whole.',
      block: () => G.roster.some(g => !g.away && (g.injury > 0 || g.hp < maxHp(g))) ? '' : 'Nobody here needs it.',
      run: () => { G.roster.forEach(g => { if (g.away) return; g.injury = Math.max(0, g.injury - 2); g.hp = maxHp(g); }); return 'The temple keeps men who know wounds better than any medicus. They work through the night.'; } },
    { id: 'oracle', name: 'The oracle names a champion', cost: 18, need: 60, desc: 'The best of your men who is not already so is named Favoured of Nemesis, for good: the crowd spares him more often when he falls.',
      block: () => oracleMan() ? '' : 'Every man you have is hers already, or you have none.',
      run: () => { const g = oracleMan(); g.traits.push('blessed'); g.morale = 100; addStory(g, 'Named by the oracle of Nemesis before the whole town.'); return `The lot is cast three times and falls three times the same way. <b>${g.name}</b> is led out and shown to the people: Favoured of Nemesis, from this day.`; } },
  ],
};
const guildAdvance = () => 60 + tier() * 60 + stipend() * 3;
const oracleMan = () => G.roster.filter(g => !g.traits.includes('blessed')).sort((a, b) => statSum(b) - statSum(a))[0] || null;
// Why a petition cannot be put just now, or nothing if it can.
function petitionBlock(k, P) {
  if ((G.petitioned || {})[k] === dealCycle()) return 'You have asked something of them since the last market day.';
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
    : k === 'guild' ? (chance(0.5) ? { patron: k, type: 'show', day: G.day, favor: 8, pay: round5(PURSE[t] * 0.6) } : { patron: k, type: 'stake', need: round5(20 + 30 * t), day: G.day, favor: 8, pay: round5(PURSE[t] * 0.4) })
    : { patron: k, type: 'tithe', cost: 30 + t * 30, day: G.day, favor: 9, pay: 0 };
  log(`${PATRONS[k].name} asks something of you: ${requestText(G.request)}.`, 'gold');
}
function requestText(r) {
  return r.type === 'wins' ? `win ${r.need} bouts at today's games` : r.type === 'show' ? 'win a bout today that has the crowd on its feet'
    : r.type === 'stake' ? `put ${r.need} denarii or more on a man of your own today, and win the wager`
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

// ---- the household: men who stay are worth more than men who are bought ----
// A man who has served long enough can be raised a grade, for less than a new man of that grade would cost to hire,
// and whatever the hiring hall has to offer this season. Fifteen days as a journeyman, thirty as a seasoned man.
const raiseDays = st => 15 * st.skill;
const servedDays = st => Math.max(0, G.day - (st.since || 1));
const raiseCost = st => 25 * (st.skill + 1) * (st.skill + 1);
function raiseBlock(role) {
  const st = G.staff[role];
  if (!st) return 'The post is vacant.';
  if (st.skill >= 3) return 'He is a master of his trade already.';
  if (servedDays(st) < raiseDays(st)) return `He has served ${servedDays(st)} of the ${raiseDays(st)} days it takes.`;
  if (G.denarii < raiseCost(st)) return `You are ${raiseCost(st) - G.denarii} denarii short.`;
  return '';
}
function raiseStaff(role) {
  if (raiseBlock(role)) return false;
  const st = G.staff[role];
  G.denarii -= raiseCost(st); st.skill++; st.since = G.day;
  if (st.wage) st.wage = 1 + 2 * st.skill;                 // a man who serves the family for nothing goes on doing so
  log(`${st.name} the ${STAFF_ROLES[role].name.toLowerCase()} is raised: he is a ${STAFF_GRADES[st.skill].toLowerCase()} of his trade now.`, 'gold');
  return true;
}
// Word can be sent round the taverns for a man of one trade: he will be in the hall at the next games, and a good one.
const seekCost = () => 15 + tier() * 10;
function seekBlock(role) {
  if (!STAFF_ROLES[role]) return 'There is no such post.';
  if (G.hireOrder) return `Word is out already, for a ${STAFF_ROLES[G.hireOrder].name.toLowerCase()}.`;
  if (G.denarii < seekCost()) return `You are ${seekCost() - G.denarii} denarii short.`;
  return '';
}
function seekStaff(role) {
  if (seekBlock(role)) return false;
  G.denarii -= seekCost(); G.hireOrder = role;
  log(`Word is sent round the taverns for a ${STAFF_ROLES[role].name.toLowerCase()}.`);
  return true;
}
// What the house most lacks, in the steward's opinion: the first vacant post in the order that matters.
const STAFF_NEED = [['doctore', 'nobody is teaching the men, and they cannot spar'], ['medicus', 'every wound takes its own time, and more of the fallen die'], ['cook', 'the men eat what they are given, and their spirits show it'],
  ['unctor', 'the men carry yesterday\'s work into today'], ['scout', 'we buy men at market without knowing what is in them'], ['dispensator', 'nobody is watching what the kitchen and the wages cost'], ['faber', 'the blades are kept by whoever carries them']];
const staffLack = () => STAFF_NEED.find(([k]) => !G.staff[k]) || null;
function genHires() {
  const maxS = clamp(1 + tier(), 1, 3), sought = G.hireOrder && STAFF_ROLES[G.hireOrder] ? G.hireOrder : null;
  const roles = (sought ? [sought] : []).concat(Object.keys(STAFF_ROLES).filter(k => k !== sought).sort(() => Math.random() - 0.5)).slice(0, 4);
  G.hireOrder = null;
  G.hires = roles.map(role => {
    const skill = role === sought ? maxS : rint(1, maxS);
    return { id: ++G.nextId, role, skill, name: pick(STAFF_NAMES), fee: 40 * skill * skill + rint(0, 4) * 5, wage: 1 + 2 * skill, sought: role === sought || undefined };
  });
}

function checkRank(g) {
  let up = false;
  while (g.rank < RANKS.length - 1 && g.xp >= RANKS[g.rank + 1].xp) { g.rank++; g.perkPending++; up = true; }
  return up;
}
// A perk a man can be taught: the common ones, and the craft of his own way of fighting once he is a Veteranus.
const perkLearnable = t => !!TRAITS[t] && TRAITS[t].good && (!TRAITS[t].special || !!TRAITS[t].cls);
const classPerk = g => Object.keys(TRAITS).find(t => TRAITS[t].cls === g.cls) || null;
function perkPool(g) {
  return Object.keys(TRAITS).filter(t => TRAITS[t].good && !g.traits.includes(t) && (TRAITS[t].cls ? TRAITS[t].cls === g.cls && g.rank >= 2 : !TRAITS[t].special));
}
function perkOffer(g) {
  if (!g.perkOffer) {
    const pool = perkPool(g).sort(() => Math.random() - 0.5), own = classPerk(g);
    // a Primus Palus is always shown the craft of his own style, if he has not got it
    if (g.rank >= 3 && own && pool.includes(own)) { pool.splice(pool.indexOf(own), 1); pool.unshift(own); }
    g.perkOffer = pool.slice(0, 3);
  }
  return g.perkOffer;
}
// Another three, for a price: once for each perk he has to choose.
const perkRerollCost = g => 30 + 30 * g.rank;
function perkRerollBlock(g) {
  if (g.perkPending <= 0) return 'He has nothing to choose.';
  if (g.perkRerolled) return 'You have asked once already for this choice.';
  if (perkPool(g).length <= 3) return 'There is nothing else left to teach him.';
  if (G.denarii < perkRerollCost(g)) return `You are ${perkRerollCost(g) - G.denarii} denarii short.`;
  return '';
}
function rerollPerk(g) {
  if (perkRerollBlock(g)) return false;
  const old = perkOffer(g), rest = perkPool(g).filter(t => !old.includes(t)).sort(() => Math.random() - 0.5);
  G.denarii -= perkRerollCost(g);
  g.perkOffer = rest.concat(old.slice().sort(() => Math.random() - 0.5)).slice(0, 3);
  g.perkRerolled = true;
  return true;
}
// Unlearning: a perk he was taught is drilled out of him, and he chooses again. It costs, and once between games is all a man can stand.
const forgetCost = g => 100 + 50 * g.rank;
function forgetBlock(g, t) {
  if (!g.traits.includes(t) || !perkLearnable(t)) return 'That is not something he was taught.';
  if (G.forgot === dealCycle()) return 'One man has been set to unlearn something since the last market day. It is slow work.';
  if (G.denarii < forgetCost(g)) return `You are ${forgetCost(g) - G.denarii} denarii short.`;
  return '';
}
function forgetPerk(g, t) {
  if (forgetBlock(g, t)) return false;
  G.denarii -= forgetCost(g); G.forgot = dealCycle();
  g.traits = g.traits.filter(x => x !== t); g.perkPending++; g.perkOffer = null; g.perkRerolled = false;
  g.hp = Math.min(g.hp, maxHp(g));
  addStory(g, `Unlearned: ${TRAITS[t].name}.`);
  log(`${g.name} is drilled out of an old habit: ${TRAITS[t].name} is gone, and he may learn something else.`);
  return true;
}
function choosePerk(g, t) {
  if (g.perkPending <= 0 || !perkOffer(g).includes(t)) return;
  g.traits.push(t); g.perkPending--; g.perkOffer = null; g.perkRerolled = false;
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
  if (G.festival && !gamesOn(G.festival.day)) { G.festQueue = null; scheduleFestival(); }      // a festival promised for a day on which, now, there are no games
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
  if (G.field && typeof wildUnstick === 'function') wildUnstick();
  G.jobs = G.jobs.filter(J => J.kind !== 'quest');
  G.roster.forEach(g => { if (g.away && !G.jobs.some(J => J.id === g.away)) g.away = null; if (g.quest && QUESTS[g.quest.id] && (!QUESTS[g.quest.id].marks || g.quest.x != null)) wildMark(questMarkId(g), 'journey'); else if (g.quest) g.quest = null; });
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
// The calendar. Days 1 to 30 are a month of games, 31 to 60 a month with the arena shut, and so on by turns.
const GAMES_A_MONTH = MONTH / GAMES_EVERY;
const gamesMonth = d => Math.floor((d - 1) / MONTH) % 2 === 0;                    // is the arena open in the month this day falls in?
const gamesOn = d => d > 0 && d % GAMES_EVERY === 0 && gamesMonth(d);             // are there games on this day?
const arenaShut = () => !gamesMonth(G.day);                                       // today
const isMarketDay = () => G.day % GAMES_EVERY === 0;
const daysToMarket = () => isMarketDay() ? 0 : GAMES_EVERY - (G.day % GAMES_EVERY);
function isGamesDay() { return gamesOn(G.day); }
function daysToGames() { for (let n = 0; n <= MONTH * 2; n++) if (gamesOn(G.day + n)) return n; return 0; }
// Games days are numbered from the first: how many there have been by a given day, and the day the nth falls on.
const gamesNo = d => Math.floor(d / (MONTH * 2)) * GAMES_A_MONTH + Math.min(GAMES_A_MONTH, Math.floor((d % (MONTH * 2)) / GAMES_EVERY));
const gamesDayNo = n => Math.floor((n - 1) / GAMES_A_MONTH) * MONTH * 2 + ((n - 1) % GAMES_A_MONTH + 1) * GAMES_EVERY;
// When the arena next opens, or shuts: the first day of the month after this one.
const monthEnds = () => Math.ceil(G.day / MONTH) * MONTH + 1;
// The seasons, three months to each, for the look of the town and nothing else: the year begins in spring.
const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const seasonNo = d => Math.floor(((Math.max(1, d) - 1) % (MONTH * 12)) / (MONTH * 3));
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
    fac: { barracks: lv('cells'), ground: lv('yard'), infirmary: 0, baths: 0, shrine: 0, stores: 0, stables: 0, eagle: 0 }, regimen: 1,
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
function legacyScore() { return Math.floor(G.fame / 20) + Math.floor(G.day / 10) + G.tally.wins + 5 * tier() + deedCount(); }

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
  hunter:   { name: 'Hill hunter', w: 2, desc: 'He has stood in front of a boar with a spear and nothing else. Beasts do not frighten him, and he knows where to put the point.',
    make: g => { g.stats.agi = Math.min(20, g.stats.agi + 1); if (!g.traits.includes('beastslayer')) g.traits.push('beastslayer'); } },
  pitman:   { name: 'Tavern pit-fighter', w: 1, price: 1.05, desc: 'He has fought for coppers behind wine-shops since he was a boy. He knows every foul there is, and has little left to learn.',
    make: g => { g.stats.str = Math.min(20, g.stats.str + 1); if (!g.traits.includes('pitfighter')) g.traits.push('pitfighter'); STATS.forEach(k => { g.pot[k] = Math.max(0.7, g.pot[k] - 0.08); }); g.wins = rint(1, 3); g.xp = g.wins * 5; checkRank(g); while (g.perkPending > 0) { const sp = Object.keys(TRAITS).filter(k => TRAITS[k].good && !TRAITS[k].special && !g.traits.includes(k)); if (sp.length) g.traits.push(pick(sp)); g.perkPending--; } } },
  pirate:   { name: 'Off a taken ship', w: 2, desc: 'A pirate, pulled out of the water when his galley was rammed. Quick on his feet, at home anywhere, and not much given to obedience.',
    make: g => { g.stats.agi = Math.min(20, g.stats.agi + 2); if (!g.traits.includes('travelled')) g.traits.push('travelled'); g.morale = 45; } },
  deserter: { name: 'Legion deserter', w: 1, price: 0.7, desc: 'He was drilled by the best army in the world and ran from it. He is cheap because he is bitter, and because a man who has run once may run again.',
    make: g => { g.stats.skl = Math.min(20, g.stats.skl + 2); if (!g.traits.includes('embittered')) g.traits.push('embittered'); g.morale = 40; } },
  gentleman: { name: 'A ruined gentleman', w: 1, price: 1.15, desc: 'He had a fencing-master once, and a name. He carries himself as if the crowd were his guests, and they like him for it.',
    make: g => { g.stats.skl = Math.min(20, g.stats.skl + 1); if (!g.traits.includes('showy')) g.traits.push('showy'); g.pot.skl = Math.min(1.4, g.pot.skl + 0.12); g.morale = 55; } },
};
function giveBackground(g) {
  const bag = []; for (const k in BACKGROUNDS) for (let i = 0; i < BACKGROUNDS[k].w; i++) bag.push(k);
  g.bg = pick(bag);
  const B = BACKGROUNDS[g.bg]; if (B.make) B.make(g);
  g.hp = maxHp(g);
}
// What the dealer thinks of your custom. Every man bought or sold through him counts; it never goes down.
// Known to him: he hears you out when you haggle. A good customer: he brings one more man to every market. An old
// friend: he pays six parts in ten for a man instead of five, and will say how far the other house means to bid.
const DEALER_RANKS = [[15, 'An old friend'], [8, 'A good customer'], [3, 'Known to him'], [0, 'A stranger']];
const dealer = () => G.dealer || 0;
const dealerWord = n => DEALER_RANKS.find(x => n >= x[0])[1];
const dealerNext = n => { const up = DEALER_RANKS.slice().reverse().find(x => x[0] > n); return up ? up[0] - n : 0; };
function dealerMove(d) { G.dealer = Math.max(0, dealer() + d); }
const sellPrice = g => Math.round(value(g) * (dealer() >= 15 ? 0.6 : 0.5));
// A man on the block can be tried before he is bought: a wooden sword, the dealer's own bruiser, and your doctore
// watching. It shows how quickly he will learn each skill, which a house with no scout cannot otherwise see.
const tryCost = () => 5 + tier() * 5;
function tryMan(m) {
  if (!m || m.tried || G.denarii < tryCost()) return null;
  G.denarii -= tryCost(); m.tried = true;
  const by = STATS.slice().sort((a, b) => m.pot[b] - m.pot[a]), best = by[0], worst = by[by.length - 1];
  const quick = stars(m.pot[best]) >= 4, slow = stars(m.pot[worst]) <= 2, all = STATS.reduce((n, k) => n + m.pot[k], 0) / STATS.length;
  const said = [quick ? `He takes to ${STAT_NAMES[best].toLowerCase()} as if he had been waiting to be shown.` : `There is nothing in him that will come quickly; ${STAT_NAMES[best].toLowerCase()} is the best of it.`];
  if (slow && worst !== best) said.push(`His ${STAT_NAMES[worst].toLowerCase()} will be slow work.`);
  said.push(all >= 1.15 ? 'Your doctore says: buy him before somebody else sees this.' : all >= 0.95 ? 'Your doctore says he will do.' : 'Your doctore says he is what he is today, and will not be much more.');
  return { ok: all >= 0.95, text: said.join(' ') };
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
  for (let i = 0; i < (scout >= 2 ? 5 : 4) + (dealer() >= 8 ? 1 : 0); i++) {
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
function haggleChance() { return clamp(0.35 + 0.12 * staffLvl('scout') + G.patrons.guild / 400 + (dealer() >= 3 ? 0.1 : 0), 0.1, 0.85); }
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
  if (G.roster.length >= capacity()) return 'No cell free: build more barracks at the Ludus, or sell a man.';
  if (G.denarii < amount) return `You are ${amount - G.denarii} denarii short.`;
  return '';
}
function auctionBid(amount) {
  const A = G.auction;
  if (auctionBlock(amount)) return null;
  A.done = true; A.bid = amount;
  const g = A.g, H = houseOf(A.h), def = houseDef(A.h);
  if (amount >= A.cap) {
    A.won = true; G.denarii -= amount; dealerMove(2);
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
// A house you have no quarrel with will let your men train against theirs for a fee: a day at what that house does
// best. What each teaches follows its way of fighting.
const SPAR_FEUD = 25, SPAR_STAT = { butchers: 'str', savage: 'str', quick: 'agi', fanatics: 'skl', wealthy: 'skl' };
const sparStat = H => SPAR_STAT[houseDef(H.id).trait] || 'skl';
const houseChampion = H => H.roster.slice().sort((a, b) => statSum(b) - statSum(a))[0] || null;
function dealCost(kind, g) {
  const t = tier();
  return kind === 'gift' ? 40 + t * 40 : kind === 'spar' ? 25 + t * 25 : kind === 'sabotage' ? 60 + t * 50 : kind === 'buy' && g ? Math.round(value(g) * 1.6 / 5) * 5 : 0;
}
// Why a dealing cannot be had just now, or nothing if it can.
function dealBlock(H, kind, g) {
  if (H.dealt === dealCycle()) return 'You have had your dealing with this house since the last market day.';
  const cost = dealCost(kind, g);
  if (kind === 'gift' && H.grudge <= 0) return 'There is no quarrel to mend.';
  if (kind === 'spar') {
    if (H.grudge >= SPAR_FEUD) return 'There is too much bad blood between you for that.';
    if (!G.roster.some(x => !x.away && x.injury <= 0)) return 'You have nobody fit to send.';
  }
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
  if (kind === 'spar') {
    const st = sparStat(H), men = G.roster.filter(x => !x.away && x.injury <= 0); G.denarii -= cost;
    men.forEach(x => { addProg(x, st, 1.5 * x.pot[st]); x.fatigue = clamp(x.fatigue + 15, 0, 100); });
    log(`Your men train a day against ${def.name}.`);
    return { ok: true, text: `${def.lanista} opens the yard to you for a day. ${men.length === 1 ? men[0].name + ' comes' : 'Your men come'} home bruised, tired and the better at ${STAT_NAMES[st].toLowerCase()} for it; and each house has had a long look at the other.` };
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

// ---- the tavern ----
// The Crossed Swords is where the other houses' men drink. Three things are to be had there besides news: a book is kept
// on the bouts the houses fight among themselves, there is a dice game in the corner, and once between games the
// school's own men can be stood a night of it. The book and the dice both keep a little for themselves.
const BOOK_CUT = 0.9, BOOK_STAKES = [10, 25, 50], DICE_STAKES = [5, 15, 40], DICE_THROWS = 3, NIGHT_HEAD = 8;
const tavern = () => G.tavern || (G.tavern = {});
const tavernStake = s => s * (1 + tier());
// The chance the first house's champion beats the second's, when the houses meet each other.
const pairOdds = (A, B) => { const a = houseChampion(A), b = houseChampion(B); return a && b ? clamp(0.5 + (statSum(a) - statSum(b)) * 0.03 + (A.prestige - B.prestige) / 2000, 0.2, 0.8) : 0.5; };
// Who meets whom at the next games: two pairs, drawn as soon as the last games are over, so the town can argue about it.
function drawHouseCard() {
  const order = G.houses.slice().sort(() => Math.random() - 0.5), pairs = [];
  for (let i = 0; i + 1 < order.length; i += 2) pairs.push([order[i].id, order[i + 1].id]);
  G.houseCard = pairs;
}
function houseCard() {
  if (!G.houseCard || !G.houseCard.length || !G.houseCard.every(p => p.every(houseOf))) drawHouseCard();
  return G.houseCard.map(([a, b]) => ({ A: houseOf(a), B: houseOf(b) }));
}
// What the book pays on a house, for each denarius staked and the stake back with it: fair odds, less its tenth.
const bookPrice = p => Math.max(1.1, Math.round(BOOK_CUT / p * 20) / 20);
const bookQuote = (A, B) => { const p = pairOdds(A, B); return { p, a: bookPrice(p), b: bookPrice(1 - p) }; };
function bookBlock(stake) {
  if (tavern().bet) return 'Your money is down already: one stake at each games.';
  if (stake > G.denarii) return `You are ${stake - G.denarii} denarii short.`;
  return '';
}
function bookBet(hid, stake) {
  const pr = houseCard().find(p => p.A.id === hid || p.B.id === hid);
  if (!pr) return { ok: false, text: 'That house does not fight another at these games.' };
  const why = bookBlock(stake); if (why) return { ok: false, text: why };
  const q = bookQuote(pr.A, pr.B), mine = pr.A.id === hid, vs = mine ? pr.B : pr.A, price = mine ? q.a : q.b;
  G.denarii -= stake; tavern().bet = { on: hid, vs: vs.id, stake, price };
  log(`${stake} denarii laid on ${houseDef(hid).name} against ${houseDef(vs.id).name}, at the tavern.`);
  return { ok: true, text: `He scratches it into the wax without looking up: ${stake} on ${houseDef(hid).name}, to return ${Math.round(stake * price)}.` };
}
// A bout between two houses is over (or, with nobody named, the games are): the book pays, keeps, or hands back.
function bookSettle(W, L) {
  const t = tavern(), bet = t.bet; if (!bet) return;
  if (!W) { G.denarii += bet.stake; delete t.bet; t.last = { day: G.day, on: bet.on, vs: bet.vs, stake: bet.stake, pay: bet.stake, off: true }; return; }
  if (!((bet.on === W.id && bet.vs === L.id) || (bet.on === L.id && bet.vs === W.id))) return;
  const win = bet.on === W.id, pay = win ? Math.round(bet.stake * bet.price) : 0;
  G.denarii += pay; delete t.bet;
  t.last = { day: G.day, on: bet.on, vs: bet.vs, stake: bet.stake, pay, win };
  log(win ? `${houseDef(W.id).name} beat ${houseDef(L.id).name}, and the book at the tavern pays you ${pay} denarii.` : `${houseDef(L.id).name} lost to ${houseDef(W.id).name}, and your ${bet.stake} denarii with them.`, win ? 'gold' : 'bad');
}
// Dice: three each, the higher throw takes the stake, and a tied throw is the table's. Three sixes is the Venus, and is paid double.
const diceLeft = () => { const t = tavern(); return t.diceDay === G.day ? Math.max(0, DICE_THROWS - (t.dice || 0)) : DICE_THROWS; };
function diceBlock(stake) {
  if (diceLeft() <= 0) return 'The table has had enough of you for one day.';
  if (stake > G.denarii) return `You are ${stake - G.denarii} denarii short.`;
  return '';
}
function tavernDice(stake) {
  const why = diceBlock(stake); if (why) return { ok: false, text: why };
  const t = tavern(), roll = () => [rint(1, 6), rint(1, 6), rint(1, 6)], sum = a => a[0] + a[1] + a[2];
  if (t.diceDay !== G.day) { t.diceDay = G.day; t.dice = 0; }
  t.dice++;
  const mine = roll(), theirs = roll(), win = sum(mine) > sum(theirs), venus = win && sum(mine) === 18, gain = win ? stake * (venus ? 2 : 1) : -stake;
  G.denarii += gain;
  return { ok: true, mine, theirs, win, venus, tie: sum(mine) === sum(theirs), stake, gain };
}
// A night at the tavern for every fit man at home, once between one games and the next: it lifts them and it tires them,
// and now and then something comes of it.
const nightMen = () => G.roster.filter(g => !g.away && g.injury <= 0);
const nightCost = () => nightMen().length * (NIGHT_HEAD + 4 * tier());
function nightBlock() {
  if (tavern().night === dealCycle()) return 'They have had their night since the last market day.';
  if (G.field) return 'The school is on the road.';
  if (!nightMen().length) return 'You have nobody fit to send.';
  if (nightCost() > G.denarii) return `You are ${nightCost() - G.denarii} denarii short.`;
  return '';
}
function tavernNight() {
  const why = nightBlock(); if (why) return { ok: false, text: why };
  const men = nightMen().sort(() => Math.random() - 0.5), t = tavern(), r = Math.random();
  G.denarii -= nightCost(); t.night = dealCycle(); t.nightDay = G.day;
  men.forEach(g => { g.morale = clamp(g.morale + 10, 0, 100); g.fatigue = clamp(g.fatigue + 8, 0, 100); });
  let text = `${men.length === 1 ? men[0].name + ' comes' : 'They come'} home after the lamps are out, singing something the neighbours will remember. Morale +10, and ${men.length === 1 ? 'he' : 'they'} will be slow in the morning.`, kind = 'plain';
  if (r < 0.2 && men.length >= 2) {
    let pair = null; for (let i = 0; i < men.length && !pair; i++) for (let j = i + 1; j < men.length; j++) if (canBond(men[i], men[j])) { pair = [men[i], men[j]]; break; }
    if (pair && makeBond(pair[0], pair[1], 'friend')) { kind = 'friends'; text += ` <b>${pair[0].name}</b> and <b>${pair[1].name}</b> carried each other back, and have sworn something over it that they both still mean sober.`; }
  } else if (r < 0.4) {
    const hot = hottestHouse(), H = hot && hot.grudge > 0 ? hot : pick(G.houses), g = men[0];
    feud(H, 6); g.injury = Math.max(g.injury, 1); kind = 'brawl';
    text += ` There were men of ${houseDef(H.id).name} at the next table, and words, and then stools. <b>${g.name}</b> will be a day mending, and the feud is the worse by 6.`;
    addStory(g, `Fought men of ${houseDef(H.id).name} across a tavern table.`);
  } else if (r < 0.58) {
    men.forEach(g => addProg(g, 'skl', 0.5 * g.pot.skl)); kind = 'veteran';
    text += ' The old man with the wooden sword over the door drank with them, and showed them on the table-top with two spoons how he took the net-man at Capua. Some of it stuck.';
  }
  log(`The men are stood a night at the Crossed Swords.`);
  return { ok: true, text, kind, men: men.length };
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

// The other houses have fortunes of their own. Now and then, between one games and the next, one of them does something
// the town talks about: buys a champion, falls out with another house, wins the Magistrate's ear, or loses a week to
// fever. It moves their renown, and sometimes the strength of what they put on the sand.
function houseMove() {
  if (!chance(0.4) || G.houses.length < 2) return null;
  const t = tier(), H = pick(G.houses), def = houseDef(H.id), r = Math.random(); let text;
  if (r < 0.3 && H.roster.length < 5) {
    const g = makeRival(H, ENEMY_BUDGET[t] * rand(1.05, 1.15), t); g.wins += rint(3, 6); g.rank = Math.max(g.rank || 0, clamp(t, 0, RANKS.length - 1)); H.roster.push(g); H.prestige += 6;
    text = `has bought a new man out of a school in the south: ${g.name}, a ${CLASSES[g.cls].name} with ${g.wins} victories`;
  } else if (r < 0.55) {
    const O = pick(G.houses.filter(x => x !== H)); H.prestige = Math.max(0, H.prestige - 6); O.prestige = Math.max(0, O.prestige - 6);
    text = `and ${houseDef(O.id).name} came to blows in the forum over a trainer one had hired from under the other. Neither is thought the better of`;
  } else if (r < 0.8) {
    H.prestige += 12;
    text = `gave the Magistrate a dinner the town is still talking about, and stands the higher for it`;
  } else {
    H.prestige = Math.max(0, H.prestige - 12); const c0 = houseChampion(H), c = c0 && !isWanted(c0) ? c0 : null; if (c) c.outUntil = dealCycle() + 1;      // a man one of yours has sworn to meet is never kept from the sand by it
    text = `has fever in its barracks, and lost a week's training to it${c ? `. ${c.name}, their best man, will not fight at the next games` : ''}`;
  }
  const move = { d: G.day, h: H.id, text };
  G.rivalMoves = (G.rivalMoves || []).concat(move).slice(-6);
  return move;
}
// Between games the rival schools train, fight each other and replace their dead.
function houseTick() {
  const t = tier(), target = ENEMY_BUDGET[t];
  for (const H of G.houses) H.was = H.prestige;             // where each stood before this games: the table shows who is rising
  // the houses meet each other too: two pairs at each games, and the better champion more often wins
  {
    const news = [];
    for (const { A, B } of houseCard()) {         // as it was posted in the tavern (see below), where money may have been laid on it
      const a = houseChampion(A), b = houseChampion(B);
      if (!a || !b) continue;
      const pA = pairOdds(A, B), W = chance(pA) ? A : B, L = W === A ? B : A;
      bookSettle(W, L);
      const gain = Math.round(houseDef(W.id).rate * 0.6);
      W.prestige += gain; L.prestige = Math.max(0, L.prestige - Math.round(gain * 0.5));
      houseForm(W, 'W'); houseForm(L, 'L');
      news.push({ d: G.day, w: W.id, l: L.id, by: (W === A ? a : b).name });
    }
    G.rivalNews = (G.rivalNews || []).concat(news).slice(-8);
    bookSettle(null, null);                     // a stake on a bout that was never fought is handed back
    drawHouseCard();                            // and who meets whom at the games after is chalked up
  }
  houseMove();
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
function itemName(it) { return it.relic ? RELICS[it.relic].name : (it.mw ? 'Master-wrought ' + MATERIAL[it.r].toLowerCase() : MATERIAL[it.r]) + ' ' + (it.slot === 'weapon' ? WEAPON_NAMES[it.cls] : SLOT_INFO[it.slot].piece) + (it.fit && FITS[it.fit] ? ', ' + FITS[it.fit].name.toLowerCase() : ''); }
function itemPrice(it) { return Math.round(ITEM_PRICE[it.r] * SLOT_INFO[it.slot].price * (it.relic ? 2 : 1) * (it.fit ? 1.3 : 1) * (it.mw ? 1.25 : 1) / 5) * 5; }
// what the blacksmith charges you; selling back is always half the full price
function buyPrice(it) { return Math.round(itemPrice(it) * (boon('bargain') ? 0.85 : 1) * (it.pride ? 0.8 : 1) / 5) * 5; }      // and the piece he is proudest of goes for a fifth less, to be seen worn
function fits(it, g) { return it.slot !== 'weapon' || it.cls === g.cls; }
const pc = v => Math.round(v * 100) + '%';

// What one piece does, as numbers. Used for combat, tooltips and comparisons.
function itemStats(it) {
  const k = it.r + 1, z = { dmg: 0, armor: 0, dodge: 0, block: 0, speed: 0, stunRes: 0, critRes: 0, bleedRes: 0, hamRes: 0, armRes: 0 };
  if (it.slot === 'weapon') { z.dmg = WEAPON_DMG[it.r] + (it.mw ? MASTER_DMG : 0); if (it.relic) RELICS[it.relic].add(z); if (it.fit && FITS[it.fit]) FITS[it.fit].add(z); return z; }
  z.armor = ARMOR_TOTAL[it.r] * SLOT_INFO[it.slot].share * (it.mw ? MASTER_ARMOR : 1);
  z.dodge = -0.006;                                           // every piece is weight to carry
  if (it.slot === 'head') { z.stunRes = 0.07 * k; z.critRes = 0.01 * k; }
  if (it.slot === 'legs') { z.hamRes = 0.11 * k; z.speed = 0.01 * k; z.dodge = 0; }
  if (it.slot === 'arms') { z.armRes = 0.11 * k; z.block = 0.006 * k; }
  if (it.slot === 'shoulders') z.bleedRes = 0.11 * k;
  if (it.relic) RELICS[it.relic].add(z);                       // a piece out of the old stories (wilds.js)
  if (it.fit && FITS[it.fit]) FITS[it.fit].add(z);             // and what the smith has done to it since
  return z;
}
// A master-wrought piece: now and then the work goes better than the smith himself expected. It can come of a
// commission or a reforging, never off the stall, and the better the forge the oftener. Half a point more on every
// blow for a blade; a tenth more protection for armour. It keeps the mark through any reforging after.
const MASTER_DMG = 0.5, MASTER_ARMOR = 1.1;
const masterChance = how => (how === 'order' ? 0.1 : 0.06) + 0.04 * G.smith.level;
// How many pieces he will reforge between one games and the next: a master armourer has journeymen to do the rough work.
const reforgeLimit = () => (G.smith.level >= 3 ? 2 : 1);
const reforgesDone = () => (G.smith.reforged === dealCycle() ? G.smith.reforgeN || 1 : 0);
// ---- work the smith will do on a piece you own ----
// A fitting: one to a piece, and for good. weapon: whether it is for blades or for armour.
const FITS = {
  weighted:  { name: 'Weighted', weapon: true,  what: '+0.8 damage a blow, but 1% less dodge for the weight of it.', add: z => { z.dmg += 0.8; z.dodge -= 0.01; } },
  balanced:  { name: 'Balanced', weapon: true,  what: '+2% block and +1% dodge: it comes back to guard quicker.', add: z => { z.block += 0.02; z.dodge += 0.01; } },
  studded:   { name: 'Studded',  weapon: false, what: 'Takes a sixth more off every blow.', add: z => { z.armor *= 7 / 6; } },
  padded:    { name: 'Padded',   weapon: false, what: 'Stuns are 10% shorter and telling blows 2% less likely.', add: z => { z.stunRes += 0.1; z.critRes += 0.02; } },
  quick:     { name: 'Quick',    weapon: true,  what: 'Ground thin and light in the hand: he moves 3% faster, for 0.3 less damage a blow.', add: z => { z.speed += 0.03; z.dmg -= 0.3; } },
  braced:    { name: 'Braced',   weapon: false, what: 'Splints at the joints: 15% more chance to shrug off a hamstring or an arm wound.', add: z => { z.hamRes += 0.15; z.armRes += 0.15; } },
  lined:     { name: 'Lined',    weapon: false, what: 'Oiled leather inside: bleeding is shrugged off 20% more often.', add: z => { z.bleedRes += 0.2; } },
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
  if (reforgesDone() >= reforgeLimit()) return reforgeLimit() > 1 ? 'He has reforged two pieces since the last market day, and that is all even his shop can do.' : 'He has reforged one piece since the last market day, and it is slow work.';
  if (G.denarii < reforgeCost(it)) return `You are ${reforgeCost(it) - G.denarii} denarii short.`;
  return '';
}
function reforge(id) {
  const f = findItem(id);
  if (!f || reforgeBlock(f.it)) return false;
  G.denarii -= reforgeCost(f.it); f.it.r++;
  G.smith.reforgeN = reforgesDone() + 1; G.smith.reforged = dealCycle();
  if (!f.it.mw && chance(masterChance('reforge'))) { f.it.mw = true; log(`The steel took the work better than the smith had any right to expect: ${itemName(f.it)}.`, 'gold'); }
  else log(`The smith reforges a piece: ${itemName(f.it)}.`, 'gold');
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
// A fitting can be struck off again, for half what it cost to put on, and another put in its place.
function stripCost(it) { return Math.max(10, Math.round(fitCost(it) / 2 / 5) * 5); }
function stripBlock(it) {
  if (!it.fit) return 'There is nothing on it to strip.';
  if (G.denarii < stripCost(it)) return `You are ${stripCost(it) - G.denarii} denarii short.`;
  return '';
}
function stripFit(id) {
  const f = findItem(id);
  if (!f || stripBlock(f.it)) return false;
  G.denarii -= stripCost(f.it); delete f.it.fit;
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
  const fitted = (it.fit && FITS[it.fit] ? ` ${FITS[it.fit].name}: ${FITS[it.fit].what}` : '') + (it.mw ? (it.slot === 'weapon' ? ` Master-wrought: ${MASTER_DMG} of that damage is the smith's best work.` : ' Master-wrought: a tenth more protection than its grade.') : '');
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
  if (S.order) { const it = makeItem(S.order.slot, S.order.r, S.order.cls); if (chance(masterChance('order'))) it.mw = true; G.armoury.push(it); log(it.mw ? `The smith has finished your commission, and it is the best thing he has made this year: ${itemName(it)} is on the racks.` : `The smith has finished your commission: ${itemName(it)} is on the racks.`, 'gold'); S.order = null; }
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
  // one piece on the stall is the one he is proudest of: he lets it go cheap to a house whose men will be seen in it
  if (S.stock.length) { const top = Math.max(...S.stock.map(x => x.r)); pick(S.stock.filter(x => x.r === top)).pride = true; }
}
function buyItem(itemId) {
  const it = G.smith.stock.find(x => x.id === +itemId);
  if (!it || G.denarii < buyPrice(it)) return false;
  G.denarii -= buyPrice(it); delete it.pride;
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
  if (why !== 'dead') { (G.alumni = G.alumni || []).push({ name: g.name, cls: g.cls, wins: g.wins || 0, kills: g.kills || 0, day: G.day, why }); if (G.alumni.length > 40) G.alumni.shift(); }      // the roll of those who left alive
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

// The festival to come, and the two after it: the town knows its calendar. A festival is every third games day (which is
// every fifteenth day while the arena is open, and none at all in a month when it is shut), and every other one the tournament.
const FEST_GAMES = FESTIVAL_EVERY / GAMES_EVERY;
function festType(day, prev) {
  if (gamesNo(day) % (FEST_GAMES * 2) === 0) return 'tourney';
  if (gamesNo(day) === FEST_GAMES) return 'hunt';
  return pick(['hunt', 'melee', 'funeral', 'triumph', 'saturnalia', 'mars'].filter(k => k !== prev));
}
function scheduleFestival() {
  const no = Math.floor(gamesNo(G.day) / FEST_GAMES) * FEST_GAMES + FEST_GAMES, day = gamesDayNo(no);
  let q = (G.festQueue || []).filter(x => x.day >= day);
  if (q.length && (q[0].day !== day || q.some((x, i) => x.day !== gamesDayNo(no + i * FEST_GAMES)))) q = [];      // (a calendar from before the arena kept its months is drawn up afresh)
  for (let n = q.length; n < 3; n++) {
    const d = gamesDayNo(no + n * FEST_GAMES), before = q.filter(x => x.type !== 'tourney').slice(-1)[0];
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
    day: G.day, t, fee: round5(PURSE[t] * 0.5), state: 'open', round: 0, entrant: null, bout: null, log: [], rounds: [], bet: null,
    field: picks.map(e => ({ hid: e.hid, gid: e.g.id, name: e.g.name })), alive: null,
  };
}

// The draw as it would stand: strongest first in the field, the favourite in the far half from your man.
function tourneyDraw(T) { const f = T.field; return [{ you: true }, f[6], f[3], f[4], f[1], f[5], f[2], f[0]]; }
const tSnap = e => e.you ? { you: true } : { hid: e.hid, gid: e.gid, name: e.name };
const tKey = e => e.you ? 'you' : String(e.gid);
// What the bookmakers think of each man's chance of the laurel, and what they pay on him.
function tourneyOdds(T) {
  const me = T.entrant ? byId(T.entrant) : null, list = T.field.map(e => ({ key: tKey(e), name: e.name, g: tRival(e) })).filter(x => x.g);
  if (me) list.push({ key: 'you', name: me.name, g: me });
  const sum = list.reduce((n, x) => n + Math.pow(power(x.g), 4), 0) || 1, out = {};
  for (const x of list) { const pr = Math.pow(power(x.g), 4) / sum; out[x.key] = { name: x.name, p: pr, pay: Math.round(clamp(0.8 / pr, 1.3, 20) * 10) / 10 }; }
  return out;
}
// One bet on who takes the laurel, laid before the first round is fought.
function tourneyBetBlock(key, stake) {
  const T = G.tourney;
  if (!T || T.state === 'done') return 'The lists are closed.';
  if (T.bet) return 'You have laid your bet.';
  if (T.round > 0) return 'The bookmakers took their last bets before the first round.';
  if (!tourneyOdds(T)[key]) return key === 'you' ? 'Enter a man first.' : 'He is not in the lists.';
  if (!(stake > 0) || G.denarii < stake) return 'You have not the coin.';
  return '';
}
function tourneyBet(key, stake) {
  key = String(key); stake = +stake;
  if (tourneyBetBlock(key, stake)) return false;
  const o = tourneyOdds(G.tourney)[key];
  G.denarii -= stake; G.tourney.bet = { key, name: o.name, stake, pay: o.pay };
  return true;
}
function settleTourneyBet(winnerKey) {
  const T = G.tourney, b = T && T.bet;
  if (!b || b.settled) return;
  b.settled = true; b.won = b.key === String(winnerKey);
  if (b.won) { b.gain = Math.round(b.stake * b.pay); G.denarii += b.gain; }
  const line = b.won ? `Your bet on ${b.name} comes home: ${b.gain} denarii.` : `Your ${b.stake} denarii on ${b.name} are lost.`;
  T.log.push(line); log(line, b.won ? 'gold' : 'bad');
}
function laurelWon(name, hid, gid) { (G.laurels = G.laurels || []).push({ day: G.day, name, hid: hid || null, gid: gid || null }); if (G.laurels.length > 12) G.laurels.shift(); }
// Between rounds there is time for one thing.
const TENDS = {
  surgeon: { name: 'The surgeon', what: 'He is stitched and bound: a further 30% of the health he has lost comes back.' },
  whet:    { name: 'The armourer', what: 'His blade is ground and his straps reset: 10% more damage in the next round.' },
  wine:    { name: 'Wine and a word', what: 'You sit with him. His spirits rise by 30 and he sheds 30 fatigue.' },
};
function tendBlock() {
  const T = G.tourney;
  return !T || T.state !== 'running' || !T.bout || T.round === 0 ? 'There is nothing to tend.' : T.tended ? 'There was time for one thing, and it is done.' : '';
}
function tendChampion(kind) {
  const T = G.tourney, g = T && byId(T.entrant);
  if (tendBlock() || !g || !TENDS[kind]) return false;
  if (kind === 'surgeon') g.hp = Math.min(maxHp(g), g.hp + (maxHp(g) - g.hp) * 0.3);
  if (kind === 'whet') g.whet = true;
  if (kind === 'wine') { g.morale = clamp(g.morale + 30, 0, 100); g.fatigue = clamp(g.fatigue - 30, 0, 100); }
  T.tended = kind;
  return true;
}
// Watch from the stands: the tournament is fought out without a man of yours in it.
function watchTourney() {
  const T = G.tourney;
  if (!T || T.state !== 'open') return false;
  finishTourneyOffscreen();
  return true;
}

function enterTourney(gid) {
  const T = G.tourney, g = byId(gid);
  if (!T || T.state !== 'open' || !g || !canFight(g) || G.denarii < T.fee) return false;
  G.denarii -= T.fee; T.entrant = g.id; T.state = 'running';
  g.foughtDay = G.day;                     // he is kept out of the ordinary bouts
  const f = T.field;                       // strongest first; the favourite sits in the far half of the draw
  tFresh(T);
  T.alive = tourneyDraw(T); T.rounds = [T.alive.map(tSnap)];
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

// A man in the lists carries what each round cost him into the next, as yours does. How much of himself he has left:
const tHealth = g => g ? clamp(g.hp / maxHp(g), 0, 1) : 1;
// what he is worth in a fight as he stands: a hurt, tired man is less than his name
const tPower = g => power(g) * (0.55 + 0.45 * tHealth(g)) * (1 - clamp(g.fatigue || 0, 0, 100) / 400);
// What winning cost him. The nearer the other man was to his match, the more of him it took; nobody wins a round
// of the Laurel without a mark, and nobody who won it was carried out.
function tWear(g, foePower) {
  if (!g) return;
  const share = foePower / (tPower(g) + foePower), took = clamp(share * rand(0.7, 1.5), 0.08, 0.8) * maxHp(g);
  g.hp = Math.max(Math.round(maxHp(g) * 0.12), Math.round(g.hp - took));
  g.fatigue = clamp((g.fatigue || 0) + 18 + share * 20, 0, 100);
}
// Between rounds every house does for its man what you do for yours: wine and a bandage (35% of what he has lost
// comes back), and time for one thing more, the surgeon if he is hurt and a rest if he is not.
function tMend(g) {
  if (!g) return;
  const mh = maxHp(g);
  g.hp = Math.min(mh, Math.round(g.hp + (mh - g.hp) * 0.35));
  if (g.hp < mh * 0.8) g.hp = Math.min(mh, Math.round(g.hp + (mh - g.hp) * 0.3)); else g.fatigue = clamp((g.fatigue || 0) - 30, 0, 100);
}
// Everybody comes to the first round whole.
function tFresh(T) { for (const e of T.field) { const g = tRival(e); if (g) { g.hp = maxHp(g); g.fatigue = 0; } } }
function simMatch(a, b) {
  const ga = tRival(a), gb = tRival(b);
  if (!ga) return b;
  if (!gb) return a;
  const ea = tPower(ga), eb = tPower(gb), pa = Math.pow(ea, 4), pb = Math.pow(eb, 4);
  const aWins = Math.random() < pa / (pa + pb);
  (aWins ? ga : gb).wins++; (aWins ? gb : ga).losses++;
  tWear(aWins ? ga : gb, aWins ? eb : ea);
  return aWins ? a : b;
}

function advanceTourney(win, lines) {
  const T = G.tourney, me = byId(T.entrant), rn = ROUND_NAMES[T.round];
  const next = [win ? { you: true } : T.alive[1]];
  if (!win) tWear(tRival(T.alive[1]), me ? power(me) : 0);      // the man who beat yours did not do it for nothing
  for (let i = 2; i + 1 < T.alive.length; i += 2) next.push(simMatch(T.alive[i], T.alive[i + 1]));
  if (next.length > 1) for (const e of next) if (!e.you) tMend(tRival(e));      // and then the same short rest for every man still in it
  const others = next.slice(1).map(e => e.name).join(', ');
  T.log.push(`${rn}: ${!win ? 'your man is out' : next.length === 1 ? 'your man wins it' : 'your man goes through'}${others ? '. Also through: ' + others : ''}.`);
  T.alive = next; T.round++; T.bout = null; T.tended = false;
  (T.rounds = T.rounds || []).push(next.map(tSnap));
  if (me) delete me.whet;
  if (!win) { finishTourneyOffscreen(); return; }
  if (next.length === 1) {
    T.state = 'done'; T.champion = 'you';
    if (me && !me.traits.includes('laureate')) me.traits.push('laureate');
    if (me) addStory(me, 'Won the Laurel Tournament.');
    favor('magistrate', 10);
    lines.push(`<span class="gold"><b>${me ? me.name : 'Your man'}</b> wins the Laurel Tournament and is crowned before the whole town.</span>`);
    if (G.festival && G.festival.day === G.day) crownFestival(lines);
    log(`${me ? me.name : 'Your man'} wins the Laurel Tournament.`, 'gold');
    laurelWon(me ? me.name : 'Your man', null, me ? me.id : null); settleTourneyBet('you');
    return;
  }
  if (me) { me.hp = Math.min(maxHp(me), me.hp + (maxHp(me) - me.hp) * 0.35); me.injury = 0; }   // a little wine and a bandage between rounds
  nextTourneyBout();
  { const og = tRival(T.alive[1]), hl = Math.round(tHealth(og) * 100); if (og) { T.log.push(`${T.alive[1].name} comes to the ${ROUND_NAMES[T.round].toLowerCase()} ${hl >= 95 ? 'almost untouched' : hl >= 75 ? 'marked but strong' : hl >= 50 ? 'carrying wounds' : 'badly hurt'}: ${hl}% of his health.`); lines.push(`Your man meets <b>${T.alive[1].name}</b> next, who is ${hl >= 95 ? 'almost untouched' : hl >= 75 ? 'marked but strong' : hl >= 50 ? 'carrying wounds' : 'badly hurt'} (${hl}% of his health).`); } }
}

// Plays out whatever is left of the tournament without the player.
function finishTourneyOffscreen() {
  const T = G.tourney;
  if (!T.alive) tFresh(T);
  let alive = (T.alive || T.field).filter(e => !e.you);
  T.rounds = T.rounds || [];
  if (!T.rounds.length) T.rounds.push(alive.map(tSnap));
  while (alive.length > 1) {
    const nx = [];
    for (let i = 0; i + 1 < alive.length; i += 2) nx.push(simMatch(alive[i], alive[i + 1]));
    if (alive.length % 2) nx.push(alive[alive.length - 1]);
    alive = nx; T.rounds.push(alive.map(tSnap));
    if (alive.length > 1) alive.forEach(e => tMend(tRival(e)));
  }
  const c = alive[0];
  T.state = 'done'; T.bout = null; T.champion = c.name; T.championHouse = c.hid; T.championGid = c.gid;
  laurelWon(c.name, c.hid, c.gid); settleTourneyBet(c.gid);
  houseOf(c.hid).prestige += 25;
  T.log.push(`${c.name} of ${houseDef(c.hid).name} takes the laurel.`);
  log(`${c.name} of ${houseDef(c.hid).name} wins the Laurel Tournament.`, 'gold');
}

// ---------- the arena: the championship, wagers, stakes, the day's laurels ----------
// Who may be sent to this bout: some are for novices only, and a title is defended by the man who holds it.
// What the bout is called on the card.
const boutTitle = b => b.final ? "The Emperor's Games" : b.captive ? 'Captives &middot; ' + DIFF[b.diff].name : b.style ? `Games of Mars &middot; ${STAT_NAMES[b.style]}` : b.defence ? 'Title defence' : b.title ? 'The championship' : b.novice ? "Novices' duel" : b.grudge ? 'Grudge match' : b.called ? 'Your challenge' : b.vow ? 'A vow to settle' : b.hunt ? 'Beast hunt &middot; ' + DIFF[b.diff].name : b.melee ? 'The great melee'
  : ['Duel', 'Pairs', 'Melee', 'Melee', 'Melee'][b.size - 1] + ' &middot; ' + DIFF[b.diff].name;

// The men who give the best chance in this bout, of those fit to fight today and not spoken for: every team is tried.
// Where two teams stand within a hair of each other, the lighter one goes, and the better men are kept for elsewhere.
function bestTeamOf(b, taken) {
  const avail = G.roster.filter(g => boutFit(b, g) && !(taken && taken.includes(g.id))), foes = boutEnemies(b);
  if (avail.length < b.size) return null;
  const all = [];
  const go = (from, team) => {
    if (team.length === b.size) { all.push({ men: team.slice(), p: winOdds(team, foes).p }); return; }
    for (let k = from; k < avail.length; k++) { team.push(avail[k]); go(k + 1, team); team.pop(); }
  };
  go(0, []);
  let best = all[0];
  for (const t of all) if (t.p > best.p) best = t;
  if (taken) {
    const wt = t => t.men.reduce((n, g) => n + power(g), 0);
    const top = best.p;
    for (const t of all) if (t.p >= top - 0.02 && wt(t) < wt(best)) best = t;
  }
  return best;
}
// A whole card, filled: the hardest bouts get first call on the men, nobody is sent twice,
// and a bout the school would most likely lose is left for the master to judge.
const CARD_FLOOR = 0.3;
function cardPlan() {
  const left = (G.bouts || []).filter(b => !b.done);
  const foeMight = b => boutEnemies(b).reduce((n, e) => n + power(e), 0);
  const first = (x, y) => (y.defence ? 1 : 0) - (x.defence ? 1 : 0) || ((y.novice || y.style ? 1 : 0) - (x.novice || x.style ? 1 : 0));
  const tryOrder = by => {
    const taken = [], plan = {}, skipped = []; let worth = 0;
    for (const b of left.slice().sort((x, y) => first(x, y) || by(x, y))) {
      const t = bestTeamOf(b, taken);
      if (!t || (t.p < CARD_FLOOR && !b.defence)) { skipped.push(b.id); continue; }
      plan[b.id] = t.men.map(g => g.id); t.men.forEach(g => taken.push(g.id));
      worth += t.p * (b.purse + b.fame * 5) - (1 - t.p) * (b.death || b.hunt ? b.purse : 0);
    }
    return { plan, skipped, worth };
  };
  // three ways of dealing the men out, and whichever promises the most is kept
  const tries = [tryOrder((x, y) => foeMight(y) - foeMight(x)), tryOrder((x, y) => foeMight(x) - foeMight(y)), tryOrder((x, y) => y.purse + y.fame * 5 - x.purse - x.fame * 5)];
  return tries.reduce((best, t) => t.worth > best.worth + 1e-9 ? t : best);
}
// What the games day came to, kept once the arena empties.
function closeCard() {
  const fought = (G.bouts || []).filter(b => b.res);
  if (!G.bouts || !G.bouts.length) return;
  const rows = fought.map(b => Object.assign({ t: boutTitle(b), house: b.house, houseId: b.houseId || null, death: !!(b.death || b.hunt) }, b.res));
  (G.cardLog = G.cardLog || []).unshift({ day: G.day, arena: TIERS[tier()].name, rows, passed: G.bouts.length - fought.length, away: !!G.field });
  if (G.cardLog.length > 6) G.cardLog.length = 6;
}
const cardSum = rows => rows.reduce((s, r) => { s.w += r.win ? 1 : 0; s.l += r.win ? 0 : 1; s.purse += r.purse; s.fame += r.fame; s.bet += r.bet || 0; s.dead += (r.dead || []).length; return s; }, { w: 0, l: 0, purse: 0, fame: 0, bet: 0, dead: 0 });

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
  if (G.fame >= FINAL_FAME && !G.won && !(G.finalBar > G.day)) {
    const enemies = [];
    for (let k = 0; k < 3; k++) { const e = makeEnemy(FINAL_BUDGET, 4); e.imperial = true; enemies.push(e); }      // marked, so the book knows whose men they are
    bouts.unshift({
      id: ++G.nextId, size: 3, diff: 'hard', death: false, enemies, done: false, final: true,
      house: "The Emperor's Champions", purse: 3000, fame: 300,
    });
  }
  if (G.richCard && G.richCard >= G.day) bouts.forEach(b => { if (!b.final) b.purse = round5(b.purse * 1.5); });      // the Magistrate was asked for a richer card
  G.bouts = bouts;
}

const ODDS_POWER = { duel: 5, team: 10, final: 10.5 };
function winOdds(mine, foes) {
  let a = mine.reduce((s, g) => s + power(g), 0);
  const b = foes.reduce((s, g) => s + power(g), 0);
  if (!a) return { p: 0, pay: 0 };
  // the bookmakers know which style beats which: each of your men is weighed against the men he will face
  let edge = 0, n = 0;
  for (const g of mine) for (const f of foes) { edge += Math.log(styleEdge(styleOf(g), styleOf(f)) / styleEdge(styleOf(f), styleOf(g))); n++; }
  if (n) a *= Math.exp(edge / n * 0.5);
  // How surely the stronger side wins depends on how many are fighting. In a duel a weaker man often gets his blow in; with
  // two or three a side the first man down leaves the rest outnumbered, and a small edge is nearly the whole of it. The
  // Emperor's men are surest of all. (Measured over some thousands of bouts, tools/race.js: with one power for every
  // size, a three-a-side bout the book called even was won two times in three, and the final three in four.)
  const imperial = foes.some(f => f.imperial), k = imperial ? ODDS_POWER.final : Math.max(mine.length, foes.length) >= 2 ? ODDS_POWER.team : ODDS_POWER.duel;
  a *= imperial ? 1.03 : k === ODDS_POWER.duel ? 0.95 : 1;      // and what is left over when the slope is right: the final a shade kinder than its numbers, a duel a shade harder
  const p = Math.pow(a, k) / (Math.pow(a, k) + Math.pow(b, k));
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
// ---- teaching, sparring partners, the doctore's own judgement, and days when it all comes right ----
const TEACH_RANK = 2;                 // a Veteranus or better may be set to teach
const canTeach = g => g.rank >= TEACH_RANK;
// The men teaching today: here, whole, and of the rank for it.
const teachers = () => G.roster.filter(t => !t.away && t.injury <= 0 && t.activity === 'teach' && canTeach(t));
// What a teacher adds to one man's work on one skill: nothing unless he is clearly the better at it. Only the best teacher counts.
function teachBonus(g, st) {
  let best = 0;
  for (const t of teachers()) if (t !== g && t.stats[st] >= g.stats[st] + 2) best = Math.max(best, 0.2 + 0.05 * t.rank + (t.traits.includes('teacher') ? 0.15 : 0));
  return best;
}
// Sparring is worth more against a better man, and less against the air.
function sparBonus(g) {
  const others = G.roster.filter(o => o !== g && !o.away && o.injury <= 0 && o.activity === 'spar' && !(G.autoRest && o.fatigue > 75));
  if (!others.length) return 0.85;
  return others.some(o => statSum(o) > statSum(g)) ? 1.15 : 1;
}
// The chance that today is one of the days when everything comes right: better in good spirits, none in poor.
const breakChance = g => g.morale < 50 ? 0 : 0.03 + 0.04 * (g.morale - 50) / 50;
// What the doctore would set a man to today, if it were left to him: rest when he needs it and before the games,
// otherwise the skill he learns fastest that still has room to grow.
function doctorePick(g) {
  if (g.injury > 0) return 'rest';
  if (g.fatigue > 60 || g.hp < maxHp(g) * 0.7) return 'rest';
  if (daysToGames() === 1 && (g.fatigue > 25 || g.hp < maxHp(g) * 0.9)) return 'rest';
  const open = STATS.filter(k => g.stats[k] < 20);
  if (!open.length) return canTeach(g) ? 'teach' : 'rest';
  const sorted = open.slice().sort((a, b) => g.pot[b] - g.pot[a] || g.stats[a] - g.stats[b]);
  if (open.length === 3 && g.pot[sorted[0]] - g.pot[sorted[2]] < 0.15) return 'spar';      // no skill comes easier than another: work them all
  return sorted[0];
}
// Men left to the doctore are given their day's work. Without a doctore nobody is.
function doctoreRound() {
  for (const g of G.roster) {
    if (!g.auto) continue;
    if (!staffLvl('doctore')) { g.auto = false; continue; }
    if (!g.away) g.activity = doctorePick(g);
  }
}
// What a day's drilling costs him in fatigue.
function trainTire(g, spar) { return (13 - statSum(g) * 0.07) * (g.traits.includes('tireless') ? 0.7 : 1) * (spar ? 0.7 : 1) * regimen().tire * (1 - 0.06 * staffLvl('unctor')); }
// What a day's rest gives back: [health, fatigue shed].
function restGain(g) { const m = g.traits.includes('mender'); return [maxHp(g) * (0.22 + 0.08 * G.fac.infirmary + 0.04 * staffLvl('cook')) * (m ? 1.3 : 1), (30 + 8 * G.fac.baths + 5 * staffLvl('unctor')) * (m ? 1.2 : 1)]; }

function endDay() {
  const F = G.fac;
  for (const g of G.roster) {
    if (g.away) continue;             // men out on contract or on the road are not in the yard
    if (G.field) { wildDayFor(g); continue; }      // the whole school is out in the country (wilds.js)
    const mh = maxHp(g);
    if (g.activity === 'spar' && !staffLvl('doctore')) g.activity = 'rest';
    if (g.activity === 'teach' && !canTeach(g)) g.activity = 'rest';
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
    } else if (g.activity === 'teach') {         // he walks the line with a stick: no drill of his own, little weariness, and some pride in it
      g.fatigue += 3; g.hp += mh * 0.08; g.morale += 2;
    } else {
      const spar = g.activity === 'spar';
      let m = trainRate(g) * (spar ? sparBonus(g) : 1);
      if (chance(breakChance(g))) { m *= 2.5; g.morale = clamp(g.morale + 4, 0, 100); log(`${g.name} has a day when everything comes right: he learns in one what takes most men three.`, 'good'); }
      for (const st of (spar ? STATS : [g.activity])) {
        if (addProg(g, st, m * g.pot[st] * (spar ? 0.32 : 1) * (1 + teachBonus(g, st)))) log(`${g.name}'s ${STAT_NAMES[st].toLowerCase()} rises to ${g.stats[st]}.`, 'good');
      }
      if (spar && chance(0.25)) {              // sparring is where a man works at what he knows
        const ab = pick(abilitiesOf(g).filter(a => a.cls));
        if (ab) { const up = practise(g, ab.id); if (up) log(`${g.name}, sparring, has ${ab.name} ${MAST_NAMES[up].toLowerCase()}.`, 'good'); }
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

  if (!G.field) {                             // men who cross swords every day come to like or to hate each other
    const sp = G.roster.filter(g => !g.away && g.injury <= 0 && g.activity === 'spar');
    if (sp.length >= 2 && chance(0.03 * (sp.length - 1))) {
      const a = pick(sp), b = pick(sp.filter(x => x !== a)), type = chance(0.5) ? 'friend' : 'rival';
      if (b && makeBond(a, b, type)) log(type === 'friend' ? `${a.name} and ${b.name}, sparring day after day, have become friends.` : `${a.name} and ${b.name} have stopped pulling their blows when they spar. There is something between them now.`, type === 'friend' ? 'good' : '');
    }
  }
  G.denarii += stipend() - upkeep();
  (G.purseLog = G.purseLog || []).push(G.denarii); if (G.purseLog.length > 30) G.purseLog.shift();
  (G.dayPurse = G.dayPurse || {})[G.day] = G.denarii; delete G.dayPurse[G.day - 60];      // and by its day, so the chronicle can say what each day cost or brought      // the purse, day by day, for the ledger
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
  closeCard();
  G.day++;
  if (G.festival.day < G.day) scheduleFestival();
  if (typeof rollAsks === 'function') rollAsks();      // somebody new at the fountain, perhaps (wilds.js)
  if (G.festival.day - G.day === 5) log(`Heralds cry it through the town: ${FESTIVALS[G.festival.type].name}, in five days.`, 'gold');
  // Every fifth day is market day; while the arena is open it is a games day as well.
  if (isMarketDay()) for (const k in G.patrons) G.patrons[k] = Math.max(0, G.patrons[k] - 1);
  if (isGamesDay()) { genRequest(); genBouts(); checkWishes(); } else { G.bouts = null; G.tourney = null; }
  if (isMarketDay()) {
    genMarket(); genHires(); genSmith(); genContracts(); postBounty();
    (G.annals = G.annals || []).push({ d: G.day, f: G.fame, c: G.denarii, w: G.tally.wins, l: G.tally.losses }); if (G.annals.length > 80) G.annals.shift();      // where the house stood, each market day
    if (isGamesDay()) log(G.field ? `Games are held in town today at the ${TIERS[tier()].name}, and your school is not there.` : `Games are held today at the ${TIERS[tier()].name}. Fresh stock at the market.`, G.field ? 'bad' : 'gold');
    else log('Market day. The arena is shut this month, but there is fresh stock at the market and new work on the board.', 'gold');
  }
  if (G.day > 1 && G.day % MONTH === 1) log(arenaShut() ? `The games are over for the month. The arena is shut, and opens again in ${MONTH} days: a month for training, for work, and for the road.` : 'The arena opens again today: a month of games, every fifth day.', 'gold');

  if (houseEmpty()) G.over = 'empty';
  if (!G.over && !G.ruin) jobsTick();
  if (!G.over && !isGamesDay() && !G.field && chance(0.22)) rollEvent();
  if (!G.over && !G.ruin) checkDeeds();
  doctoreRound();
  if (isMarketDay()) backupSlot();
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
    fameGain = Math.round((bout.fame * (0.8 + 0.7 * avgExc) + kills * 2) * (boon('crowd') ? 1.1 : 1) * (G.patrons.magistrate >= 80 ? 1.1 : 1) * (1 + streakBonus()) * (titleYours() ? 1.1 : 1) * (1 + trophyBonus()) * (1 + 0.2 * mine.filter(f => f.g.traits.includes('darling')).length / Math.max(1, mine.length)) * ((bout.fest || bout.tourney) && G.festival && G.festival.sponsor && G.festival.day === G.day ? 1.25 : 1));
    mine.forEach(f => { f.g.fame += Math.round(fameGain / mine.length); });
    if (wager && wagerWon(kind, B, win)) wagerGain = Math.round(wager * pay * (WAGER_KINDS[kind] || WAGER_KINDS.win).mult * (G.patrons.guild >= 80 ? 1.2 : 1) * (G.bookUntil && G.bookUntil >= G.day ? 1.5 : 1));
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
      else if (r.type === 'stake' && wager >= r.need && wagerGain > 0) fulfilRequest(lines);
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
      sweep = round5(PURSE[tier()] * 0.6); purse += sweep; G.sweeps = (G.sweeps || 0) + 1; fameGain += Math.round(FAME[tier()] * 0.5); favor('magistrate', 2);
      lines.push(`<span class="gold">Every bout on the card, fought and won. The editor sends down a wreath and ${sweep} denarii: the day is yours.</span>`);
    }
  }
  G.denarii += purse + wagerGain;
  G.fame += fameGain;
  bout.done = true;
  bout.res = { win, purse, fame: fameGain, bet: wager ? wagerGain - wager : 0, men: mine.map(f => f.g.name), dead: dead.map(g => g.name), kills, exc: Math.round(avgExc * 100) };
  if (bout.tourney) advanceTourney(win, lines);
  if (bout.final && win) G.won = true;
  if (bout.final && !win) { const drop = Math.min(G.fame, FINAL_LOSS); G.fame -= drop; G.finalBar = G.day + FINAL_WAIT; lines.push(`<span class="bad">Beaten before the Emperor. Rome is slow to send twice for a school it has seen lose: <b class="num">${drop}</b> fame is gone, and no summons will come for ${FINAL_WAIT} days, however the school stands by then.</span>`); log(`Beaten at the Emperor's Games: ${drop} fame lost, and no summons for ${FINAL_WAIT} days.`, 'bad'); }
  if (win) {                                  // what goes in the book of records
    const who = mine.map(f => f.g.name).join(' & ');
    setRecord('purse', purse, who, bout.house, true); setRecord('fame', fameGain, who, bout.house, true); setRecord('wager', wagerGain, who, bout.house, true);
    setRecord('crowd', Math.round(avgExc * 100), who, bout.house, true); setRecord('long', Math.round(B.time), who, bout.house, true);
    if (!B.decision) setRecord('quick', Math.round(B.time * 10) / 10, who, bout.house, false);
  }
  checkDeeds(lines);
  if (houseEmpty()) G.over = 'empty';
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
    text: c => `A magistrate wants to hire <b>${gn(c.g)}</b> for a night, to stand at the door of his banquet and impress the guests. He will pay ${c.pay} denarii. The gladiator will get no sleep, and will be very tired tomorrow.`,
    opts: [
      { label: c => `Send him (+${c.pay} denarii, very tiring)`, run: c => { const g = byId(c.g); G.denarii += c.pay; if (g) g.fatigue = clamp(g.fatigue + 35, 0, 100); return `${gn(c.g)} comes back at dawn, exhausted. You are paid ${c.pay} denarii.`; } },
      { label: () => 'Refuse', run: () => 'You refuse. The magistrate\'s servant leaves without a word.' },
    ],
  },
  trainer: {
    title: 'A retired champion',
    can: () => fit().length > 0 && G.denarii >= 60,
    make: () => ({ g: pick(fit()).id, cost: 60 + tier() * 30 }),
    text: c => `A retired gladiator, who won his freedom in the arena long ago, offers to train <b>${gn(c.g)}</b> for a day. He wants ${c.cost} denarii.`,
    opts: [
      { label: c => `Pay ${c.cost} denarii (skill +1)`, ok: c => G.denarii >= c.cost, run: c => { const g = byId(c.g); G.denarii -= c.cost; if (g && g.stats.skl < 20) g.stats.skl++; return `After a day of his training, ${gn(c.g)} is a better fighter. Skill +1.`; } },
      { label: () => 'Send him away', run: () => 'He shrugs, and goes off to offer his lessons to another school.' },
    ],
  },
  fever: {
    title: 'Fever in the barracks',
    can: () => G.roster.length >= 2,
    make: () => ({ cost: 20 + 12 * G.roster.length }),
    text: c => `Two of your men have woken with a fever, and it may spread to the others. A physician will treat the whole school for ${c.cost} denarii.`,
    opts: [
      { label: c => `Pay the physician (${c.cost} denarii)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; return 'The physician gives the men medicine, and after a day the fever is gone. Nobody is laid up.'; } },
      { label: () => 'Do nothing (men may fall sick)', run: () => {
        const sick = fit().filter(() => chance(0.4));
        sick.forEach(g => { g.injury = rint(2, 4); });
        return sick.length ? `The fever spreads. ${sick.map(g => g.name).join(', ')} ${sick.length > 1 ? 'are' : 'is'} too sick to train or fight for several days.` : 'You are lucky: the fever passes, and nobody else falls sick.';
      } },
    ],
  },
  brawl: {
    title: 'A fight in the mess hall',
    can: () => fit().length >= 2,
    make: () => { const f = fit().slice().sort(() => Math.random() - 0.5); return { a: f[0].id, b: f[1].id }; },
    text: c => `<b>${gn(c.a)}</b> and <b>${gn(c.b)}</b> have had a fist fight over food. The other men are waiting to see how you deal with it.`,
    opts: [
      { label: () => 'Whip them both (morale -12 each)', run: c => { [c.a, c.b].forEach(id => { const g = byId(id); if (g) g.morale = clamp(g.morale - 12, 0, 100); }); return 'Both men are whipped, and there is no more trouble. Each of them loses 12 morale.'; } },
      { label: () => 'Let them fight it out (may end well or badly)', run: c => {
        if (chance(0.5)) { const g = byId(chance(0.5) ? c.a : c.b); if (g) { g.injury = rint(2, 3); const a = byId(c.a), b = byId(c.b); if (a && b) makeBond(a, b, 'rival'); return `The fight ends badly. ${g.name} has a cracked rib and is out for ${g.injury} day${g.injury === 1 ? "" : "s"}, and the two men are now rivals.`; } }
        [c.a, c.b].forEach(id => { const g = byId(id); if (g) g.morale = clamp(g.morale + 8, 0, 100); });
        const a = byId(c.a), b = byId(c.b); if (a && b) makeBond(a, b, 'friend');
        return 'They fight until both are tired, and end the night drinking together. They are friends now, and each gains 8 morale.';
      } },
    ],
  },
  volunteer: {
    title: 'A volunteer at the gate',
    can: () => G.roster.length < capacity(),
    make: () => ({ fee: 40 + tier() * 40, g: makeGladiator(19 + tier() * 8 + rint(0, 5)) }),
    text: c => `<b>${c.g.name}</b> of ${c.g.origin} is a free man with heavy debts. He offers to join your school as a ${CLASSES[c.g.cls].name}, if you will pay ${c.fee} denarii to clear what he owes.`,
    opts: [
      { label: c => `Pay his debts and take him (${c.fee} denarii)`, ok: c => G.denarii >= c.fee && G.roster.length < capacity(), run: c => { G.denarii -= c.fee; welcome(c.g); G.roster.push(c.g); if (!c.g.story) c.g.story = []; addStory(c.g, 'A free man who swore the oath to pay his debts.'); return `You pay his debts. ${c.g.name} swears the gladiator's oath and joins your school.`; } },
      { label: () => 'Turn him away', run: () => 'You turn him away, and he walks back down the road.' },
    ],
  },
  gift: {
    title: 'A gift of wine',
    can: () => G.roster.some(g => g.wins > 0),
    make: () => ({ g: pick(G.roster.filter(g => g.wins > 0)).id, sell: 30 + tier() * 25 }),
    text: c => `A large jar of expensive wine arrives at the school. It is a gift from someone who admires <b>${gn(c.g)}</b>.`,
    opts: [
      { label: () => 'Share it among the men (morale +10)', run: () => { G.roster.forEach(g => { g.morale = clamp(g.morale + 10, 0, 100); }); return 'The men drink it together and have a loud, happy night. Morale +10 for everyone.'; } },
      { label: c => `Sell it (+${c.sell} denarii)`, run: c => { G.denarii += c.sell; return `You sell the wine for ${c.sell} denarii. The men never hear about it.`; } },
    ],
  },
  merchant: {
    title: 'The grain merchant cheats you',
    can: () => G.roster.length > 0,
    make: () => ({ loss: 20 + tier() * 15 }),
    text: c => `The grain merchant has delivered less than you paid for this month. Buying the missing grain elsewhere will cost ${c.loss} denarii.`,
    opts: [
      { label: c => `Buy the missing grain (${c.loss} denarii)`, run: c => { G.denarii -= c.loss; return `You pay ${c.loss} denarii for the missing grain, and say nothing to the merchant.`; } },
      { label: () => 'Send your biggest man to threaten him (risky)', run: c => {
        if (chance(0.55)) { G.denarii += c.loss; return `The merchant is frightened. He admits a mistake and pays you back: +${c.loss} denarii.`; }
        G.denarii -= c.loss * 2; return `The merchant complains to his friends on the town council, and you are fined ${c.loss * 2} denarii.`;
      } },
    ],
  },
  dinner: {
    title: 'The Magistrate\'s dinner',
    can: () => G.denarii >= 30,
    make: () => ({ cost: 30 + tier() * 30 }),
    text: c => `The Magistrate is giving a dinner for the leading families of the town, and you are invited. Guests are expected to bring a gift. A suitable one would cost ${c.cost} denarii.`,
    opts: [
      { label: c => `Go, and bring a gift (${c.cost} denarii; Magistrate favour +10)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; favor('magistrate', 10); return 'The Magistrate is pleased with your gift, and gives you a seat near him. Magistrate favour +10.'; } },
      { label: () => 'Stay at home (Magistrate favour -6)', run: () => { favor('magistrate', -6); return 'You stay at home, and the Magistrate notices that you did not come. Magistrate favour -6.'; } },
    ],
  },
  fix: {
    title: 'An offer to lose on purpose',
    can: () => !G.fix && fit().length > 0 && daysToGames() <= 3,
    make: () => ({ pay: 80 + tier() * 90 }),
    text: c => `A man who works for the Grain Guild's gamblers comes to you with an offer. If your school loses its next bout on purpose, they will pay you ${c.pay} denarii. But if you agree and then win, the Guild will hold it against you.`,
    opts: [
      { label: c => `Agree to lose your next bout (+${c.pay} denarii if you lose)`, run: c => { G.fix = { pay: c.pay }; return `You agree. If your school loses its next bout, you will be paid ${c.pay} denarii.`; } },
      { label: () => 'Refuse', run: () => 'You refuse. He shrugs, and goes to make the same offer to another school.' },
    ],
  },
  vigil: {
    title: 'The priests of Nemesis',
    can: () => G.roster.length > 0,
    make: () => ({ cost: 25 + tier() * 20 }),
    text: c => `Priests of Nemesis, the goddess who watches over the arena, have come to ask your school for an offering of ${c.cost} denarii. Your fighters are listening to hear what you answer.`,
    opts: [
      { label: c => `Make the offering (${c.cost} denarii; Temple favour +10, morale +5)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; favor('temple', 10); G.roster.forEach(g => { g.morale = clamp(g.morale + 5, 0, 100); }); return 'You pay, and the priests bless your fighters and their weapons. Temple favour +10, and morale +5 for everyone.'; } },
      { label: () => 'Send them away (Temple favour -5, morale -4)', run: () => { favor('temple', -5); G.roster.forEach(g => { g.morale = clamp(g.morale - 4, 0, 100); }); return 'You send the priests away with nothing. Your men are uneasy about it: morale -4 for everyone. Temple favour -5.'; } },
    ],
  },
  sponsor: {
    title: 'The Guild wants its mark on your fighter',
    can: () => G.roster.some(g => g.wins > 0),
    make: () => ({ g: pick(G.roster.filter(g => g.wins > 0)).id, pay: 40 + tier() * 40 }),
    text: c => `The Grain Guild offers ${c.pay} denarii to have its symbol painted on <b>${gn(c.g)}</b>'s shield and armour, so that the crowd sees it. The Magistrate does not like merchants advertising at his games.`,
    opts: [
      { label: c => `Accept (+${c.pay} denarii; Guild favour +8, Magistrate favour -4)`, run: c => { G.denarii += c.pay; favor('guild', 8); favor('magistrate', -4); return `The Guild's symbol is painted on, and you are paid ${c.pay} denarii. Guild favour +8, Magistrate favour -4.`; } },
      { label: () => 'Refuse (Guild favour -3)', run: () => { favor('guild', -3); return 'You refuse, and the Guild takes its offer to another school. Guild favour -3.'; } },
    ],
  },
  poach: {
    title: 'A rival wants to buy your fighter',
    can: () => G.roster.length > 2 && fit().some(g => g.wins >= 2),
    make: () => { const g = pick(fit().filter(x => x.wins >= 2)); return { g: g.id, h: pick(G.houses).id, pay: Math.round(value(g) * 1.3 / 5) * 5 }; },
    text: c => `${houseDef(c.h).lanista} of ${houseDef(c.h).name} has watched <b>${gn(c.g)}</b> fight, and wants to buy him. The offer is ${c.pay} denarii, which is well above his market price. If you sell him, he will fight for that house, and you may have to face him in the arena.`,
    opts: [
      { label: c => `Sell him (+${c.pay} denarii; morale -5)`, run: c => {
        const g = byId(c.g); if (!g) return 'The deal falls through.';
        G.roster = G.roster.filter(x => x !== g); G.denarii += c.pay; departed(g, 'sold');
        g.wish = null; g.promise = null; g.lostTo = null;
        g.gear = null; g.weapon = clamp(tier() - 1, 0, 3); g.armor = clamp(tier() - 1, 0, 3);   // his new house kits him out
        g.house = c.h; g.vs = { w: 0, l: 0 }; g.slew = []; g.exYours = true; g.hp = maxHp(g); g.fatigue = 0; g.activity = 'rest';
        houseOf(c.h).roster.push(g);
        G.roster.forEach(x => { x.morale = clamp(x.morale - 5, 0, 100); });
        return `You sell ${g.name} for ${c.pay} denarii, and he leaves to fight for ${houseDef(c.h).name}. Your other men do not like seeing him sold: morale -5 for everyone.`;
      } },
      { label: () => 'Refuse (feud +5)', run: c => { feud(houseOf(c.h), 5); return `You refuse. ${houseDef(c.h).name} takes it as an insult: your feud with them grows by 5.`; } },
    ],
  },
  poison: {
    title: 'A fighter has been poisoned',
    can: () => fit().length > 0 && G.houses.some(H => H.grudge >= 30),
    make: () => ({ g: pick(fit()).id, h: G.houses.slice().sort((a, b) => b.grudge - a.grudge)[0].id, cost: 30 + tier() * 25 }),
    text: c => `<b>${gn(c.g)}</b> is suddenly very sick. It looks like poison. A kitchen boy saw a stranger near the water barrels, wearing the colours of ${houseDef(c.h).name}.`,
    opts: [
      { label: c => `Pay a physician (${c.cost} denarii; out 1 day)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; const g = byId(c.g); if (g) g.injury = 1; return 'The physician treats him. He will be well again in one day.'; } },
      { label: () => 'Leave him to recover alone (out 3 to 5 days)', run: c => { const g = byId(c.g); if (!g) return 'It passes.'; g.injury = rint(3, 5); return `He recovers slowly, without a physician. He cannot train or fight for ${g.injury} days.`; } },
      { label: () => 'Accuse them to the Magistrate (needs favour 40; feud +10)', ok: () => G.patrons.magistrate >= 40, run: c => {
        const H = houseOf(c.h); H.prestige = Math.max(0, H.prestige - 30); feud(H, 10); favor('magistrate', -5);
        const g = byId(c.g); if (g) g.injury = 2;
        return `The Magistrate believes you. He fines ${houseDef(c.h).name} and has their man whipped in public, and they lose 30 renown. They will want revenge: your feud with them grows by 10. Asking cost you 5 Magistrate favour, and your fighter is out for 2 days.`;
      } },
    ],
  },
  truce: {
    title: 'A rival offers peace',
    can: () => G.houses.some(H => H.grudge >= 25),
    make: () => ({ h: G.houses.slice().sort((a, b) => b.grudge - a.grudge)[0].id, cost: 40 + tier() * 40 }),
    text: c => `${houseDef(c.h).lanista} of ${houseDef(c.h).name} sends you a message: the feud between your schools is bad for business. If you send a gift of ${c.cost} denarii, both sides can treat the quarrel as ended.`,
    opts: [
      { label: c => `Send the gift (${c.cost} denarii; feud -30)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; feud(houseOf(c.h), -30); return 'You send the gift, and they send wine in return. Neither side is really friendly, but the feud with them falls by 30.'; } },
      { label: () => 'Send nothing', run: () => 'You send their messenger home with nothing. The feud goes on as before.' },
    ],
  },
  kinship: {
    title: 'Two fighters are becoming friends',
    can: () => !!unbondedPair(),
    make: () => { const p = unbondedPair(); return { a: p[0].id, b: p[1].id }; },
    text: c => `<b>${gn(c.a)}</b> and <b>${gn(c.b)}</b> have started training and eating together, and looking out for each other. Friends fight harder when they are on the same side, but one takes it very badly if the other is killed.`,
    opts: [
      { label: () => 'Let them be friends', run: c => { const a = byId(c.a), b = byId(c.b); return a && b && makeBond(a, b, 'friend') ? `${a.name} and ${b.name} are now friends.` : 'In the end, nothing comes of it.'; } },
      { label: () => 'Keep them apart (morale -4 each)', run: c => { [c.a, c.b].forEach(id => { const g = byId(id); if (g) g.morale = clamp(g.morale - 4, 0, 100); }); return 'You give them separate cells and separate training hours. They do not become friends, and each loses 4 morale.'; } },
    ],
  },
  rivalry: {
    title: 'Two fighters are falling out',
    can: () => !!unbondedPair(),
    make: () => { const p = unbondedPair(); return { a: p[0].id, b: p[1].id }; },
    text: c => `<b>${gn(c.a)}</b> has been telling everyone that <b>${gn(c.b)}</b> only wins against weak opponents. ${gn(c.b)} is angry, and has started training until dark to prove him wrong. Rivals train harder, but fight worse when they are on the same side.`,
    opts: [
      { label: () => 'Let them be rivals', run: c => { const a = byId(c.a), b = byId(c.b); return a && b && makeBond(a, b, 'rival') ? 'The two men are now rivals. They no longer speak to each other, and both train harder to outdo the other.' : 'The quarrel is forgotten after a few days.'; } },
      { label: () => 'Make them shake hands (may make them friends)', run: c => {
        const a = byId(c.a), b = byId(c.b);
        if (a && b && chance(0.5) && makeBond(a, b, 'friend')) return 'To everyone\'s surprise, it works. The two men are friends by the end of the day.';
        [a, b].forEach(g => { if (g) g.morale = clamp(g.morale - 4, 0, 100); });
        return 'They shake hands, but neither of them means it. Each loses 4 morale.';
      } },
    ],
  },
  rematch: {
    title: 'A fighter wants a rematch',
    can: () => fit().some(g => g.lostTo && !g.wish),
    make: () => ({ g: pick(fit().filter(x => x.lostTo && !x.wish)).id }),
    text: c => { const g = byId(c.g), L = g && g.lostTo; return L ? `<b>${g.name}</b> cannot forget being beaten by ${L.name} of ${houseDef(L.hid).name}. He asks you to promise him another fight against the same man.` : 'A fighter cannot forget an old defeat.'; },
    opts: [
      { label: () => 'Promise him the rematch (morale +8)', run: c => {
        const g = byId(c.g); if (!g || !g.lostTo) return 'The moment has passed.';
        g.wish = { type: 'rematch', hid: g.lostTo.hid, gid: g.lostTo.gid, name: g.lostTo.name };
        g.morale = clamp(g.morale + 8, 0, 100); addStory(g, `Vowed to face ${g.wish.name} again.`);
        return `You promise it. ${g.name} will get his rematch the next time ${g.wish.name} is on the list of bouts at the games. He trains hard for it: morale +8.`;
      } },
      { label: () => 'Tell him to forget it (morale -8)', run: c => { const g = byId(c.g); if (g) { g.lostTo = null; g.morale = clamp(g.morale - 8, 0, 100); } return 'He accepts it, but he is unhappy: morale -8.'; } },
    ],
  },
  freedom: {
    title: 'A fighter asks about his freedom',
    can: () => G.roster.length > 2 && home().some(g => g.wins >= 6 && g.rank >= 2 && !g.promise && !g.askedFree),
    make: () => ({ g: pick(home().filter(x => x.wins >= 6 && x.rank >= 2 && !x.promise && !x.askedFree)).id, more: 3 }),
    text: c => { const g = byId(c.g); return `<b>${gn(c.g)}</b> asks to speak with you alone. He has won ${g ? g.wins : 'many'} fights for your school, and he wants to know what he must do to be set free.`; },
    opts: [
      { label: c => `Promise to free him after ${c.more} more wins (morale +15)`, run: c => {
        const g = byId(c.g); if (!g) return 'The moment has passed.';
        g.promise = { at: g.wins + c.more }; g.askedFree = true; g.morale = clamp(g.morale + 15, 0, 100);
        addStory(g, `Was promised his freedom after ${c.more} more victories.`);
        return `You promise to free ${g.name} after ${c.more} more wins, and he shakes your hand on it. Morale +15. He will expect you to keep your word.`;
      } },
      { label: () => 'Promise nothing (morale -10)', run: c => { const g = byId(c.g); if (g) { g.askedFree = true; g.morale = clamp(g.morale - 10, 0, 100); } return 'You promise him nothing. He says no more about it, and will not ask again. Morale -10.'; } },
    ],
  },
  promiseDue: {
    title: 'Time to keep your promise',
    auto: true,                      // raised when the victories are won, never at random
    can: () => G.roster.some(g => g.promise && g.wins >= g.promise.at),
    make: () => ({ g: G.roster.find(g => g.promise && g.wins >= g.promise.at).id }),
    text: c => `<b>${gn(c.g)}</b> has won all the fights you asked for when you promised him his freedom. He has come to claim it, and the whole school is watching to see whether you keep your word.`,
    opts: [
      { label: () => 'Free him (you lose him; fame, morale +20)', run: c => {
        const g = byId(c.g); if (!g) return 'He is gone.';
        const gain = 40 + g.wins * 5;
        G.roster = G.roster.filter(x => x !== g); departed(g, 'freed');
        G.fame += gain; G.roster.forEach(x => { x.morale = clamp(x.morale + 20, 0, 100); });
        log(`${g.name} is given the wooden sword, as promised. +${gain} fame.`, 'gold');
        return `You give ${g.name} the wooden sword that marks a freed gladiator, and he leaves a free man. Everyone saw you keep your word: fame +${gain}, and morale +20 for every man who remains.`;
      } },
      { label: () => 'Break your promise (you keep him; morale collapses)', run: c => {
        const g = byId(c.g); if (!g) return 'He is gone.';
        g.promise = null; g.morale = 5;
        if (!g.traits.includes('embittered')) g.traits.push('embittered');
        addStory(g, 'Was promised his freedom, and denied it.');
        G.roster.forEach(x => { if (x !== g) x.morale = clamp(x.morale - 12, 0, 100); });
        return `You refuse to free him. ${g.name} goes back to his cell, bitter, with almost no morale left. Every other man now knows you do not keep your promises: morale -12 for all of them.`;
      } },
    ],
  },
  leave: {
    title: 'A fighter asks for a night off',
    can: () => fit().length > 0 && daysToGames() >= 2,
    make: () => ({ g: pick(fit()).id }),
    text: c => `<b>${gn(c.g)}</b> asks you to let him spend a night in town before the games.`,
    opts: [
      { label: () => 'Let him go (morale +15; he may come back tired)', run: c => {
        const g = byId(c.g); if (!g) return 'He thinks better of it.';
        g.morale = clamp(g.morale + 15, 0, 100);
        if (chance(0.4)) { g.fatigue = clamp(g.fatigue + 25, 0, 100); return `${g.name} comes back at dawn, happy but worn out. Morale +15, but he is much more tired.`; }
        return `${g.name} comes back in good time, sober and grateful. Morale +15.`;
      } },
      { label: () => 'Refuse (morale -6)', run: c => { const g = byId(c.g); if (g) g.morale = clamp(g.morale - 6, 0, 100); return 'You refuse, and he goes back to his training. Morale -6.'; } },
    ],
  },

  // ---- what a feud brings to your door ----
  slander: {
    title: 'A rival is spreading lies about you',
    can: () => G.houses.some(H => H.grudge >= 25),
    make: () => ({ h: G.houses.slice().sort((a, b) => b.grudge - a.grudge)[0].id, cost: 30 + tier() * 30 }),
    text: c => `${houseDef(c.h).lanista} of ${houseDef(c.h).name} is paying men to say in the taverns that you drug your fighters and buy your victories. People are starting to believe it.`,
    opts: [
      { label: c => `Pay to spread stories about them (${c.cost} denarii; feud +6)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; const H = houseOf(c.h); H.prestige = Math.max(0, H.prestige - 12); feud(H, 6); return `You pay men to spread stories about ${houseDef(c.h).name} instead. Within a week the town is talking about them, not you: they lose 12 renown. They know who paid for it: feud +6.`; } },
      { label: () => 'Challenge their champion (fame +2, feud +8)', ok: c => !houseOf(c.h).called, run: c => { const H = houseOf(c.h); H.called = true; feud(H, 8); G.fame += 2; return `You challenge them publicly. Their champion will fight one of your men at the next games, for double the usual prize. Fame +2, feud +8.`; } },
      { label: () => 'Ignore it (lose fame)', run: () => { const f = 4 + tier() * 2; G.fame = Math.max(0, G.fame - f); return `You do nothing. The talk dies down in time, but some people still believe it. Fame -${f}.`; } },
    ],
  },
  editorsEar: {
    title: 'A rival has bribed the games official',
    can: () => fit().length > 0 && daysToGames() <= 3 && G.houses.some(H => H.grudge >= 40),
    make: () => ({ h: G.houses.slice().sort((a, b) => b.grudge - a.grudge)[0].id, cost: 50 + tier() * 50 }),
    text: c => `Your steward has learned that ${houseDef(c.h).name} has bribed an official at the games. At the next games, when one of your men is beaten, he will be less likely to be spared.`,
    opts: [
      { label: c => `Pay the official more (${c.cost} denarii)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; return 'The official takes your money as well as theirs, and does nothing for either side. Your men will be judged fairly.'; } },
      { label: () => 'Report it to the Magistrate (needs favour 40; feud +10)', ok: () => G.patrons.magistrate >= 40, run: c => { const H = houseOf(c.h); H.prestige = Math.max(0, H.prestige - 20); feud(H, 10); favor('magistrate', -3); return `The official is whipped and ${houseDef(c.h).name} is fined, and loses 20 renown. Your men will be judged fairly. The Magistrate dislikes being dragged into such things: favour -3. Feud +10.`; } },
      { label: () => 'Do nothing (your men spared less often)', run: () => { G.rigged = G.day + daysToGames(); return 'You do nothing. At the next games, any of your men who is beaten is less likely to be spared.'; } },
    ],
  },
  arson: {
    title: 'A rival has set fire to your stores',
    can: () => G.houses.some(H => H.grudge >= 45),
    make: () => ({ h: G.houses.slice().sort((a, b) => b.grudge - a.grudge)[0].id, cost: 50 + tier() * 40 }),
    text: c => `Someone set fire to your storehouse in the night. The fire was put out before it reached the barracks, but the store is badly damaged. A boy saw a man running away, wearing the colours of ${houseDef(c.h).name}.`,
    opts: [
      { label: c => `Rebuild it properly, and take no revenge (${c.cost} denarii)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; return 'You pay to rebuild the store, and put an extra guard on the wall at night.'; } },
      { label: c => `Burn their stable in revenge (${Math.round(c.cost / 2)} denarii; feud +20, morale +5, risky)`, run: c => {
        const H = houseOf(c.h); G.denarii -= Math.round(c.cost / 2); feud(H, 20); H.prestige = Math.max(0, H.prestige - 20); evAllMor(5);
        if (chance(0.3)) { favor('magistrate', -8); return `Two nights later their stable burns down. They lose 20 renown, and your men are pleased: morale +5. But the town watch suspects you: Magistrate favour -8. Feud +20.`; }
        return `Two nights later their stable burns down, and nobody can prove who did it. They lose 20 renown, and your men are pleased: morale +5. Feud +20.`;
      } },
      { label: c => `Make cheap repairs (${Math.round(c.cost / 3)} denarii; morale -5)`, run: c => { G.denarii -= Math.round(c.cost / 3); evAllMor(-5); return 'Your men patch the store as well as they can. They wanted revenge and did not get it: morale -5 for everyone.'; } },
    ],
  },
  defector: {
    title: 'A rival\'s fighter wants to join you',
    can: () => G.houses.some(H => H.roster.length >= 3),
    make: () => { const H = pick(G.houses.filter(X => X.roster.length >= 3)), g = H.roster.slice().sort((a, b) => statSum(a) - statSum(b))[0]; return { h: H.id, r: g.id, pay: Math.round(value(g) * 0.5 / 5) * 5 }; },
    text: c => { const g = houseOf(c.h).roster.find(x => x.id === c.r); return g ? `<b>${g.name}</b>, a ${CLASSES[g.cls].name} who fights for ${houseDef(c.h).name}, has come secretly to your back gate. He says ${houseDef(c.h).lanista} works his men to death, and he wants to fight for you instead.` : 'There was a man at the back gate. He is gone now.'; },
    opts: [
      { label: () => 'Take him in (feud +15)', ok: c => G.roster.length < capacity() && !!houseOf(c.h).roster.find(x => x.id === c.r), run: c => { const H = houseOf(c.h), g = H.roster.find(x => x.id === c.r); takeRival(g); feud(H, 15); return `${g.name} joins your school. ${houseDef(c.h).name} will soon know where he went: feud +15.`; } },
      { label: c => `Sell him back to them (+${c.pay} denarii; feud -5, morale -3)`, run: c => { G.denarii += c.pay; feud(houseOf(c.h), -5); evAllMor(-3); return `${houseDef(c.h).lanista} pays you ${c.pay} denarii to get his fighter back. Your men saw him led away, and did not like it: morale -3. Feud -5.`; } },
      { label: () => 'Send him back for nothing (feud -10)', run: c => { feud(houseOf(c.h), -10); return `Two of your men walk him back to his own school. ${houseDef(c.h).lanista} sends his thanks: feud -10.`; } },
    ],
  },

  // ---- the yard and the barracks ----
  roof: {
    title: 'The barracks roof is leaking',
    can: () => G.roster.length > 0,
    make: () => ({ cost: 35 + tier() * 30 }),
    text: c => `Last night's storm blew tiles off the barracks roof, and rain is coming in on the men's beds. A roofer will fix it for ${c.cost} denarii.`,
    opts: [
      { label: c => `Pay the roofer (${c.cost} denarii)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; return 'The roofer fixes it the same day, and the men sleep dry.'; } },
      { label: () => 'Have the men fix it (tiring, morale -2)', run: () => { fit().forEach(g => evTire(g, 14)); evAllMor(-2); return 'Your men spend a day on the roof and fix it themselves. Everyone is more tired, and morale is -2.'; } },
      { label: () => 'Leave it (morale -7, men may fall sick)', run: () => {
        evAllMor(-7); const sick = fit().filter(() => chance(0.25)).slice(0, 2); sick.forEach(g => { g.injury = rint(1, 3); });
        return sick.length ? `The men sleep in wet beds: morale -7. ${sick.map(g => g.name).join(' and ')} ${sick.length > 1 ? 'fall' : 'falls'} sick and cannot train for a few days.` : 'The men sleep in wet beds, and complain about it: morale -7.';
      } },
    ],
  },
  rats: {
    title: 'Rats in the grain store',
    can: () => G.roster.length > 0,
    make: () => ({ cost: 20 + tier() * 15 }),
    text: c => `The cook has found rats in the grain store, and they have already eaten a good deal of it. A rat-catcher with dogs will clear them out for ${c.cost} denarii.`,
    opts: [
      { label: c => `Hire the rat-catcher (${c.cost} denarii)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; return 'The rat-catcher and his dogs clear the store in an afternoon.'; } },
      { label: () => 'Have the men hunt them (morale +4, a little tiring)', run: () => { evAllMor(4); fit().forEach(g => evTire(g, 6)); return 'The men make a contest of it, and by evening the store is clear. They enjoyed it: morale +4, and they are a little more tired.'; } },
      { label: () => 'Ignore it (may cost more later)', run: c => { if (chance(0.65)) { G.denarii -= c.cost * 2; return `Within a week the rats have ruined half the grain. Replacing it costs ${c.cost * 2} denarii.`; } return 'You are lucky: a stray cat moves in and kills the rats for nothing.'; } },
    ],
  },
  rain: {
    title: 'A week of rain',
    can: () => fit().length > 0,
    make: () => ({}),
    text: () => 'It has rained for four days, and the training yard is deep in mud. Your trainer asks whether the men should train in it.',
    opts: [
      { label: () => 'Train in the mud (agility practice, tiring, risk of injury)', run: () => {
        fit().forEach(g => { addProg(g, 'agi', 1.2); evTire(g, 8); });
        const g = chance(0.3) ? pick(fit()) : null; if (g) { g.injury = rint(1, 2); return `The men train in the mud, which is good practice for their agility, and tiring. But ${g.name} falls badly and is out for ${evDays(g.injury)}.`; }
        return 'The men train in the mud, which is good practice for their agility. They are more tired, but nobody is hurt.';
      } },
      { label: () => 'Rest them indoors (much less tired, morale -2)', run: () => { fit().forEach(g => evTire(g, -18)); evAllMor(-2); return 'The men stay indoors and rest. They are much less tired, but bored: morale -2.'; } },
      { label: () => 'Give them a day of dice and wine (morale +7)', run: () => { evAllMor(7); fit().forEach(g => evTire(g, -6)); return 'The men spend the day drinking, playing dice and telling stories. Morale +7, and they are a little less tired.'; } },
    ],
  },
  heat: {
    title: 'A week of great heat',
    can: () => fit().length > 0,
    make: () => ({ cost: 15 + tier() * 10 }),
    text: c => `It has been extremely hot for a week, and men are collapsing during training. Cold water and a shade over the yard would cost ${c.cost} denarii.`,
    opts: [
      { label: c => `Buy shade and cold water (${c.cost} denarii; less tired, morale +4)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; fit().forEach(g => evTire(g, -12)); evAllMor(4); return 'The men train in the shade with cold water to drink. They are less tired, and grateful: morale +4.'; } },
      { label: () => 'Train in the heat anyway (strength practice, very tiring, risky)', run: () => {
        fit().forEach(g => { addProg(g, 'str', 1); evTire(g, 15); });
        const g = chance(0.35) ? pick(fit()) : null; if (g) { g.injury = rint(1, 2); evMor(g, -6); return `The men train in the heat, which builds their strength, and they are much more tired. ${g.name} collapses with sunstroke and is out for ${evDays(g.injury)}.`; }
        return 'The men train in the heat, which builds their strength. They are much more tired, but nobody collapses.';
      } },
      { label: () => 'Train only at dawn and dusk (a little less tired)', run: () => { fit().forEach(g => evTire(g, -5)); return 'The men train in the cool of the morning and evening, and rest at midday. They are a little less tired, and nothing is lost.'; } },
    ],
  },
  diceGame: {
    title: 'Gambling in the barracks',
    can: () => home().length >= 2,
    make: () => { const f = home().slice().sort(() => Math.random() - 0.5); return { a: f[0].id, b: f[1].id }; },
    text: c => `The night guard reports that the men are playing dice for money in the barracks. <b>${gn(c.a)}</b> is winning, and <b>${gn(c.b)}</b> has lost a great deal to him.`,
    opts: [
      { label: () => 'Forbid it (morale -5)', run: () => { evAllMor(-5); return 'You take away the dice. The men resent it: morale -5 for everyone.'; } },
      { label: () => 'Allow it (the two men may become rivals)', run: c => {
        const a = byId(c.a), b = byId(c.b); evMor(a, 8); evMor(b, -8);
        if (a && b && chance(0.4) && makeBond(a, b, 'rival')) return `${b.name} is sure that ${a.name} cheated. The two men are now rivals. ${a.name} gains 8 morale and ${b.name} loses 8.`;
        return `The game goes on. ${gn(c.a)} is pleased with his winnings (morale +8), and ${gn(c.b)} is sore about his losses (morale -8).`;
      } },
      { label: () => 'Allow it, and take a share (coin, morale -3)', run: () => { const cut = 10 + 5 * home().length; G.denarii += cut; evAllMor(-3); return `You let the game go on and take a tenth of the money: +${cut} denarii. The men grumble: morale -3.`; } },
    ],
  },
  stray: {
    title: 'A stray dog',
    can: () => G.roster.length > 0,
    make: () => ({}),
    text: () => 'A hungry stray dog has started living at the school. The men are feeding it from their own bowls, and have named it after a rival lanista.',
    opts: [
      { label: () => 'Let them keep it (5 denarii; morale +6)', run: () => { evAllMor(6); G.denarii -= 5; return 'The men keep the dog, and it sleeps at the barracks door. Feeding it costs 5 denarii. Morale +6 for everyone.'; } },
      { label: () => 'Drive it away (morale -4)', run: () => { evAllMor(-4); return 'You have the dog driven away. The men are sorry to see it go: morale -4 for everyone.'; } },
    ],
  },
  mentor: {
    title: 'A veteran offers to teach',
    can: () => home().length >= 2,
    make: () => { const h = home(), old = evBest(h, g => g.wins * 3 + evPower(g)), young = evBest(h.filter(g => g !== old), g => -evPower(g)); return { a: old.id, b: young.id, s: evBest(STATS, k => old.stats[k]) }; },
    text: c => `<b>${gn(c.a)}</b>, your most experienced fighter, has been watching <b>${gn(c.b)}</b> train, and thinks he is doing it badly. He offers to teach the younger man himself, in his own way.`,
    opts: [
      { label: () => 'Let him teach (a stat +1 for the pupil; tiring for both)', run: c => {
        const a = byId(c.a), b = byId(c.b); if (!a || !b) return 'Nothing comes of it.';
        const up = b.stats[c.s] < 20; if (up) b.stats[c.s]++; evTire(a, 18); evTire(b, 18);
        const friends = makeBond(a, b, 'friend');
        return `${a.name} trains ${b.name} hard for a week, and both are much more tired. ${up ? `${b.name} gains ${STAT_NAMES[c.s]} +1.` : `${b.name} had nothing left to learn from him there.`}${friends ? ' The two men are now friends.' : ''}`;
      } },
      { label: () => 'Refuse: training is the trainer\'s job (his morale -6)', run: c => { evMor(byId(c.a), -6); return `You refuse. ${gn(c.a)} shrugs and goes back to his own training: morale -6.`; } },
    ],
  },
  runaway: {
    title: 'A fighter tried to escape',
    can: () => home().length > 2,
    make: () => ({ g: evBest(home(), g => -g.morale).id, cost: 25 + tier() * 15 }),
    text: c => `The night guard caught <b>${gn(c.g)}</b> climbing over the wall with a blanket and a stolen loaf of bread. He was trying to run away, and he will not say why.`,
    opts: [
      { label: () => 'Whip him in front of the others (his morale -12, others -3)', run: c => { const g = byId(c.g); evMor(g, -12); evTire(g, 15); G.roster.forEach(x => { if (x !== g) evMor(x, -3); }); return 'He is whipped in front of the whole school. He loses 12 morale and is more tired, and every other man loses 3 morale.'; } },
      { label: () => 'Talk to him (morale +20, or he may desert)', run: c => {
        const g = byId(c.g); if (!g) return 'He is gone.';
        if (chance(0.7)) { evMor(g, 20); addStory(g, 'Tried the wall, and was talked back down.'); return `Slowly he tells you about it: a wife, a debt, and a village he will never see again. You listen. ${g.name} goes back to his cell feeling much better: morale +20.`; }
        G.roster = G.roster.filter(x => x !== g); departed(g, 'deserted'); log(`${g.name} deserted in the night.`, 'bad');
        return `He listens to you and nods. But before dawn he escapes by some way nobody has found. ${g.name} has deserted, and you have lost him.`;
      } },
      { label: c => `Pay for more guards (${c.cost} denarii; his morale -5)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; evMor(byId(c.g), -5); return 'You pay for two more guards on the wall and a lock on his door. He will not get out again: morale -5.'; } },
    ],
  },
  nightmare: {
    title: 'A fighter dreams of his death',
    can: () => fit().length > 0,
    make: () => ({ g: pick(fit()).id, cost: 20 + tier() * 15 }),
    text: c => `<b>${gn(c.g)}</b> woke the whole barracks screaming. He dreamed that he was killed in the arena, and he believes the dream will come true.`,
    opts: [
      { label: c => `Pay for a sacrifice (${c.cost} denarii; morale +12, Temple favour +4)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; evMor(byId(c.g), 12); favor('temple', 4); return 'A priest makes a sacrifice to turn the bad luck away. The fighter is calmer and sleeps: morale +12. Temple favour +4.'; } },
      { label: () => 'Tell him to forget it (morale -9, may turn nervous)', run: c => { const g = byId(c.g); evMor(g, -9); if (g && chance(0.25) && !g.traits.includes('nervous') && g.traits.length < 4) { g.traits.push('nervous'); return `${g.name} says no more about it, but he is still afraid: morale -9. He has become Nervous.`; } return `${gn(c.g)} says no more about it, but he is still uneasy: morale -9.`; } },
      { label: () => 'Give him a day of rest (morale +6, less tired)', run: c => { const g = byId(c.g); evMor(g, 6); evTire(g, -20); if (g) g.activity = 'rest'; return 'He rests for the day, and by evening he can laugh about the dream. Morale +6, and he is much less tired.'; } },
    ],
  },
  meat: {
    title: 'The meat has gone bad',
    can: () => G.roster.length > 0,
    make: () => ({ cost: 20 + 6 * G.roster.length }),
    text: c => `The pork delivered this morning has gone bad. The butcher swears it was fresh when he sent it. Buying fresh meat would cost ${c.cost} denarii.`,
    opts: [
      { label: c => `Throw it out and buy fresh (${c.cost} denarii)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; return 'You throw the bad pork away and buy fresh meat. The men eat well.'; } },
      { label: () => 'Cook it thoroughly and serve it (men may fall sick)', run: () => {
        if (chance(0.45)) { const sick = fit().filter(() => chance(0.5)); sick.forEach(g => { g.injury = Math.max(g.injury, 1); evTire(g, 20); }); evAllMor(-6); return sick.length ? `The meat makes the men sick. ${sick.map(g => g.name).join(', ')} cannot train or fight tomorrow, and morale is -6 for everyone.` : 'The meat upsets the men\'s stomachs, but nobody is too sick to train. Morale -6 for everyone.'; }
        return 'You are lucky: nobody notices anything wrong, and nobody falls sick.';
      } },
      { label: () => 'Give them no meat this week (morale -4)', run: () => { evAllMor(-4); return 'The men eat barley and beans all week, and complain about it: morale -4 for everyone.'; } },
    ],
  },
  dig: {
    title: 'Something buried under the yard',
    can: () => G.roster.length > 0,
    make: () => { const g = pick(G.roster), slot = pick(SLOTS), r = clamp(tier() + rint(2, 3), 2, 5), it = { slot, r, cls: g.cls }; return { slot, r, cls: g.cls, sell: Math.max(20, Math.round(itemPrice(it) * 0.5 / 5) * 5) }; },
    text: c => `Men digging a new latrine have found an old chest buried in the yard. Inside is a piece of equipment in very good condition: ${itemName(c)}. It is better made than anything you could buy in this town.`,
    opts: [
      { label: () => 'Keep it for your fighters', run: c => { const it = makeItem(c.slot, c.r, c.cls); G.armoury.push(it); return `You clean it and add it to your armoury: ${itemName(it)}. It is there for any of your fighters to use.`; } },
      { label: c => `Sell it (+${c.sell} denarii)`, run: c => { G.denarii += c.sell; return `A collector in town buys it for ${c.sell} denarii.`; } },
      { label: () => 'Give it to the temple (Temple favour +9, morale +4)', run: () => { favor('temple', 9); evAllMor(4); return 'You give it to the temple of Nemesis, where it is hung up with your name under it. Temple favour +9, and your men approve: morale +4.'; } },
    ],
  },
  tremor: {
    title: 'An earthquake damages the school',
    can: () => G.roster.length > 0,
    make: () => ({ cost: 30 + tier() * 25 }),
    text: c => `A small earthquake in the night has cracked your water tank and knocked down two training posts. The men are saying the god Vulcan is angry with the school. Repairs will cost ${c.cost} denarii.`,
    opts: [
      { label: c => `Repair everything (${c.cost} denarii)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; return 'You pay for the repairs, and within a few days everything is as it was.'; } },
      { label: c => `Repair, and sacrifice to Vulcan (${c.cost + 20} denarii; morale +6, Temple favour +5)`, ok: c => G.denarii >= c.cost + 20, run: c => { G.denarii -= c.cost + 20; evAllMor(6); favor('temple', 5); return 'You pay for the repairs and for a sacrifice to Vulcan. The priest says the god is satisfied, and the men stop worrying: morale +6. Temple favour +5.'; } },
      { label: () => 'Repair nothing (morale -6, a little tiring)', run: () => { evAllMor(-6); fit().forEach(g => evTire(g, 5)); return 'You repair nothing. The men have to carry water in from the street and train among the rubble. They think the school is unlucky: morale -6, and they are a little more tired.'; } },
    ],
  },

  // ---- the town ----
  foundersDay: {
    title: 'The town asks for gladiators in its parade',
    can: () => fit().length > 0,
    make: () => ({ g: evBest(fit(), g => g.wins * 3 + evPower(g)).id }),
    text: c => `Tomorrow the town holds a parade in honour of its founder, and the council would like gladiators to march in it, armed and looking dangerous. They ask for <b>${gn(c.g)}</b> by name.`,
    opts: [
      { label: () => 'Send every fit man (most fame, Magistrate favour +6, tiring)', run: () => { const f = 4 + fit().length * 2; fit().forEach(g => evTire(g, 12)); G.fame += f; favor('magistrate', 6); return `All your fit men march in the parade. Fame +${f}, Magistrate favour +6. They are more tired after a long day on their feet.`; } },
      { label: c => `Send only ${gn(c.g)} (fame +4, Magistrate favour +3)`, run: c => { const g = byId(c.g); evTire(g, 12); evMor(g, 6); if (g) g.fame = (g.fame || 0) + 4; G.fame += 4; favor('magistrate', 3); return `${gn(c.g)} marches in the parade, and the crowd throws flowers at him. Fame +4, Magistrate favour +3. He is more tired, but pleased: morale +6.`; } },
      { label: () => 'Refuse (Magistrate favour -4)', run: () => { favor('magistrate', -4); return 'You refuse, and the council asks another school. Magistrate favour -4.'; } },
    ],
  },
  graffiti: {
    title: 'A fighter\'s name painted on the walls',
    can: () => G.roster.some(g => g.wins > 0),
    make: () => ({ g: pick(G.roster.filter(g => g.wins > 0)).id, cost: 20 + tier() * 20 }),
    text: c => `Admirers have been painting <b>${gn(c.g)}</b>'s name and praise of him on walls all over town. The crowd enjoys it. The town official in charge of public order does not.`,
    opts: [
      { label: c => `Pay for more of it (${c.cost} denarii; fame +8, Magistrate favour -3)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; const g = byId(c.g); if (g) g.fame = (g.fame || 0) + 8; G.fame += 8; favor('magistrate', -3); return `You pay the painters to do more, and soon his name is on every wall in town. Fame +8, Magistrate favour -3.`; } },
      { label: () => 'Leave it alone (fame +3, his morale +8)', run: c => { const g = byId(c.g); evMor(g, 8); if (g) g.fame = (g.fame || 0) + 3; G.fame += 3; return `You leave the writing where it is. ${gn(c.g)} is secretly delighted: morale +8. Fame +3.`; } },
      { label: () => 'Have it cleaned off (Magistrate favour +5, his morale -5)', run: c => { favor('magistrate', 5); evMor(byId(c.g), -5); return 'You have your slaves scrub the walls clean. The town official sends his thanks: Magistrate favour +5. Your fighter is disappointed: morale -5.'; } },
    ],
  },
  poet: {
    title: 'A poet offers to praise your school',
    can: () => G.roster.length > 0,
    make: () => ({ cost: 30 + tier() * 30 }),
    text: c => `A poor Greek poet offers to write a poem about the victories of your school and recite it in the town square. He asks ${c.cost} denarii, or, if you will not pay that, a dinner.`,
    opts: [
      { label: c => `Pay for the poem (${c.cost} denarii; fame)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; const f = 8 + tier() * 4; G.fame += f; return `He recites the poem in the town square. It is very long, but people stay to hear all of it. Fame +${f}.`; } },
      { label: () => 'Give him dinner instead (may bring a little fame)', run: () => { if (chance(0.5)) { G.fame += 3; return 'He eats a great deal, and writes a short poem about you that is very good. Fame +3.'; } return 'He eats a great deal, writes nothing, and leaves in the morning with one of your spoons.'; } },
      { label: () => 'Send him away (may cost a little fame)', run: () => chance(0.3) ? (G.fame = Math.max(0, G.fame - 2), 'He takes his revenge: his next poem is about a mean lanista, and the town laughs at you. Fame -2.') : 'He bows politely and goes to try somewhere else.' },
    ],
  },
  sculptor: {
    title: 'A sculptor wants a model',
    can: () => G.roster.some(g => g.wins >= 2),
    make: () => ({ g: evBest(G.roster.filter(g => g.wins >= 2), g => g.wins).id, fee: 40 + tier() * 40 }),
    text: c => `The town has ordered a bronze statue of a victorious gladiator, and the sculptor wants <b>${gn(c.g)}</b> to pose for it. He would have to stand still for days.`,
    opts: [
      { label: () => 'Lend him for free (fame +6, Magistrate favour +3)', run: c => { const g = byId(c.g); evTire(g, 10); evMor(g, 10); if (g) { g.fame = (g.fame || 0) + 6; addStory(g, 'Stood for a bronze in the forum.'); } G.fame += 6; favor('magistrate', 3); return `He poses for the statue, which will stand in the town square for generations. Fame +6, Magistrate favour +3. He is proud of it (morale +10), and a little more tired.`; } },
      { label: c => `Charge for his time (+${c.fee} denarii; fame +2)`, run: c => { G.denarii += c.fee; evTire(byId(c.g), 10); G.fame += 2; return `The sculptor pays you ${c.fee} denarii, and your fighter poses for the statue. Fame +2. He is a little more tired.`; } },
      { label: () => 'Refuse', run: () => 'You refuse, and the sculptor finds his model at another school.' },
    ],
  },
  admirers: {
    title: 'Admirers at the gate',
    can: () => fit().some(g => g.wins > 0),
    make: () => ({ g: evBest(fit().filter(g => g.wins > 0), g => g.wins).id, pay: 25 + tier() * 25 }),
    text: c => `Since the last games, people have been gathering outside your gate every morning, hoping to see <b>${gn(c.g)}</b>. Today there are forty of them.`,
    opts: [
      { label: c => `Charge them to watch him train (+${c.pay} denarii)`, run: c => { G.denarii += c.pay; const g = byId(c.g); evTire(g, 8); evMor(g, 4); return `The crowd pays to watch him train, and he shows off for them. +${c.pay} denarii. He is a little more tired, and pleased: morale +4.`; } },
      { label: () => 'Send him out to meet them (fame +5, his morale +10)', run: c => { const g = byId(c.g); evMor(g, 10); if (g) g.fame = (g.fame || 0) + 5; G.fame += 5; return `${gn(c.g)} goes out to greet his admirers, and they love him for it. Fame +5, and his morale is +10.`; } },
      { label: () => 'Send them away (fame -2)', run: () => { G.fame = Math.max(0, G.fame - 2); return 'You have the crowd sent away. They leave unhappily, and complain about it in town. Fame -2.'; } },
    ],
  },
  widow: {
    title: 'A rich widow invites a fighter',
    can: () => fit().some(g => g.wins > 0),
    make: () => ({ g: pick(fit().filter(g => g.wins > 0)).id, pay: 60 + tier() * 50 }),
    text: c => `A rich widow of the town has sent a servant to your gate. She would like <b>${gn(c.g)}</b> to spend the evening with her, and offers ${c.pay} denarii for it.`,
    opts: [
      { label: c => `Send him (+${c.pay} denarii; tiring, his mood may go either way)`, run: c => {
        const g = byId(c.g); G.denarii += c.pay; evTire(g, 15);
        if (chance(0.5)) { evMor(g, 12); return `${gn(c.g)} comes back at dawn, tired and happy, with a ring she gave him. +${c.pay} denarii, and his morale is +12.`; }
        evMor(g, -8); return `${gn(c.g)} comes back at dawn, tired and unhappy, and will not talk about it. +${c.pay} denarii, and his morale is -8.`;
      } },
      { label: c => `Ask for twice as much (${c.pay * 2} denarii, or nothing)`, run: c => { if (chance(0.5)) { G.denarii += c.pay * 2; evTire(byId(c.g), 15); return `She agrees to the higher price, and he goes. +${c.pay * 2} denarii. He comes back tired.`; } return 'She will not pay that much, and her servant leaves. You get nothing.'; } },
      { label: () => 'Refuse (his morale +5)', run: c => { evMor(byId(c.g), 5); return 'You refuse, and her servant leaves. Your fighter heard you say he was not for hire, and is proud of it: morale +5.'; } },
    ],
  },
  noble: {
    title: 'A senator\'s son wants to train with you',
    can: () => fit().length > 0,
    make: () => ({ g: pick(fit()).id, pay: 50 + tier() * 50 }),
    text: c => `A senator's son, nineteen years old, bored and drunk, wants to spend a day training with real gladiators. He offers ${c.pay} denarii, and wants to fight a practice bout against <b>${gn(c.g)}</b>.`,
    opts: [
      { label: c => `Let him have a real practice bout (+${c.pay} denarii; risky)`, run: c => {
        G.denarii += c.pay;
        if (chance(0.35)) { favor('magistrate', -10); return `${gn(c.g)} hits the boy too hard, and he has to be carried home. His father complains to the Magistrate. +${c.pay} denarii, Magistrate favour -10.`; }
        favor('magistrate', 4); return `The boy goes home with a few bruises and a good story, and is very pleased. +${c.pay} denarii, Magistrate favour +4.`;
      } },
      { label: c => `Have your fighter let him win (+${Math.round(c.pay / 2)} denarii; his morale -5)`, run: c => { G.denarii += Math.round(c.pay / 2); evMor(byId(c.g), -5); return `${gn(c.g)} lets the boy win three practice bouts, and hates doing it. +${Math.round(c.pay / 2)} denarii, and his morale is -5.`; } },
      { label: () => 'Refuse (Magistrate favour -2)', run: () => { favor('magistrate', -2); return 'You refuse, and he insults you on his way out. Magistrate favour -2.'; } },
    ],
  },
  tax: {
    title: 'The tax collector',
    can: () => G.denarii >= 40,
    make: () => ({ cost: Math.round((40 + tier() * 40 + G.denarii * 0.05) / 5) * 5 }),
    text: c => `The town's tax collector has gone through your accounts, and says you owe ${c.cost} denarii in tax under a very old law.`,
    opts: [
      { label: c => `Pay the tax (${c.cost} denarii)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; return `You pay the ${c.cost} denarii, and he gives you a receipt.`; } },
      { label: c => `Bribe him instead (${Math.round(c.cost / 3)} denarii; risky)`, ok: c => G.denarii >= Math.round(c.cost / 3), run: c => {
        if (chance(0.65)) { G.denarii -= Math.round(c.cost / 3); return `He takes the bribe of ${Math.round(c.cost / 3)} denarii, and decides that you owe no tax after all.`; }
        G.denarii -= c.cost * 2; favor('magistrate', -6); return `He turns out to be honest, and reports the bribe. You are fined ${c.cost * 2} denarii. Magistrate favour -6.`;
      } },
      { label: () => 'Ask the Magistrate to cancel it (works at favour 40 or more)', run: c => {
        if (G.patrons.magistrate >= 40) { favor('magistrate', -5); return 'The Magistrate cancels the tax as a favour to you, and you pay nothing. It uses up some goodwill: Magistrate favour -5.'; }
        G.denarii -= Math.round(c.cost * 1.5 / 5) * 5; return `The Magistrate does not think well enough of you to help. You must pay the tax and extra costs: ${Math.round(c.cost * 1.5 / 5) * 5} denarii.`;
      } },
    ],
  },
  coins: {
    title: 'You were paid in bad coin',
    can: () => G.roster.length > 0,
    make: () => ({ loss: 25 + tier() * 25 }),
    text: c => `Your steward has weighed the prize money from the last games. Many of the coins have had silver shaved off them, and are worth ${c.loss} denarii less than they should be.`,
    opts: [
      { label: () => 'Complain to the Magistrate (favour -4; may be repaid)', run: c => { favor('magistrate', -4); if (chance(0.6)) { G.denarii += c.loss; return `The Magistrate pays you the difference, but he is not pleased to be asked. +${c.loss} denarii, Magistrate favour -4.`; } return 'The Magistrate refuses to believe it, and pays nothing. Magistrate favour -4.'; } },
      { label: () => 'Spend the bad coins in the market (risky)', run: c => { if (chance(0.7)) return 'You spend the bad coins in the market, and nobody notices. You lose nothing.'; G.denarii -= c.loss; favor('guild', -6); return `A Guild money-changer spots the bad coins. You have to make up the difference: -${c.loss} denarii. Guild favour -6.`; } },
      { label: c => `Accept the loss (-${c.loss} denarii)`, run: c => { G.denarii -= c.loss; return `You accept the loss of ${c.loss} denarii, and say nothing.`; } },
    ],
  },
  cargo: {
    title: 'A chance to invest in a ship',
    can: () => G.denarii >= 80,
    make: () => ({ cost: 60 + tier() * 60 }),
    text: c => `A Guild ship owner is sending a cargo of wine overseas, and offers you a share in it for ${c.cost} denarii. If the voyage goes well, you will be paid back double. If it goes badly, you could lose it all.`,
    opts: [
      { label: c => `Buy the share (${c.cost} denarii; Guild favour +3)`, ok: c => G.denarii >= c.cost, run: c => {
        G.denarii -= c.cost; favor('guild', 3); const r = Math.random();
        if (r < 0.45) { G.denarii += c.cost * 2; return `The voyage goes well, and the wine sells for double. You are paid ${c.cost * 2} denarii. Guild favour +3.`; }
        if (r < 0.75) { G.denarii += c.cost; return `The voyage is slow and the wine sells poorly. You get your ${c.cost} denarii back, and no more. Guild favour +3.`; }
        return `The ship is lost at sea, and you lose all ${c.cost} denarii. Guild favour +3.`;
      } },
      { label: () => 'Refuse', run: () => 'You refuse, and he sells the share to somebody else.' },
    ],
  },
  fugitive: {
    title: 'A runaway slave is hiding in your stable',
    can: () => G.roster.length > 0,
    make: () => ({ reward: 40 + tier() * 30, g: makeGladiator(15 + tier() * 6 + rint(0, 4)) }),
    text: c => `Your stable boy has found a runaway slave hiding in the hay. He is <b>${c.g.name}</b>, a farm slave who has been badly whipped, and he begs you to let him become a gladiator instead of going back. His owner is offering ${c.reward} denarii for his return.`,
    opts: [
      { label: () => 'Take him in as a fighter (free; the Magistrate may find out)', ok: () => G.roster.length < capacity(), run: c => {
        welcome(c.g); G.roster.push(c.g); if (!c.g.story) c.g.story = []; addStory(c.g, 'A runaway, hidden in the ludus under another name.'); evMor(c.g, 20);
        if (chance(0.3)) { favor('magistrate', -8); return `${c.g.name} joins your school under a false name. But somebody talks, and the Magistrate hears of it. He lets it pass this once: Magistrate favour -8.`; }
        return `${c.g.name} joins your school under a false name, and nobody comes looking for him.`;
      } },
      { label: c => `Hand him back for the reward (+${c.reward} denarii; morale -5)`, run: c => { G.denarii += c.reward; evAllMor(-5); return `You hand him back to his owner and collect the reward: +${c.reward} denarii. Your men watched him taken away, and did not like it: morale -5 for everyone.`; } },
      { label: () => 'Give him food and let him go (morale +3)', run: () => { evAllMor(3); return 'You give him bread and let him escape over the back wall. Your men approve: morale +3 for everyone.'; } },
    ],
  },

  // ---- visitors with something to sell ----
  smithCart: {
    title: 'The travelling smith',
    can: () => G.roster.length > 0,
    make: () => { const g = pick(G.roster), slot = pick(SLOTS), r = clamp(tier() + rint(2, 3), 2, 6), it = { slot, r, cls: g.cls }; return { slot, r, cls: g.cls, price: Math.max(25, Math.round(itemPrice(it) * 0.7 / 5) * 5) }; },      // a third under what the town's smith would ask
    text: c => `A travelling smith has stopped his cart at your gate. He has one piece of equipment for sale: ${itemName(c)}. He wants ${c.price} denarii, which is cheaper than the town smith would charge, and he is leaving today.`,
    opts: [
      { label: c => `Buy it (${c.price} denarii)`, ok: c => G.denarii >= c.price, run: c => { G.denarii -= c.price; const it = makeItem(c.slot, c.r, c.cls); G.armoury.push(it); return `You buy it, and it goes into your armoury: ${itemName(it)}.`; } },
      { label: c => `Offer only ${Math.round(c.price * 0.6)} denarii (he may refuse and leave)`, ok: c => G.denarii >= Math.round(c.price * 0.6), run: c => {
        if (chance(0.45)) { G.denarii -= Math.round(c.price * 0.6); const it = makeItem(c.slot, c.r, c.cls); G.armoury.push(it); return `He grumbles, but accepts your lower offer. ${itemName(it)} goes into your armoury.`; }
        return 'He laughs at your offer and drives away. You get nothing.';
      } },
      { label: () => 'Buy nothing', run: () => 'You buy nothing, and he drives on.' },
    ],
  },
  healer: {
    title: 'A skilled physician is passing through',
    can: () => G.roster.length > 0,
    make: () => ({ g: evBest(G.roster, g => g.injury * 20 + g.fatigue + (maxHp(g) - g.hp)).id, cost: 35 + tier() * 30 }),
    text: c => `A Greek physician who has treated gladiators for twenty years is passing through town. For ${c.cost} denarii he will spend a day treating <b>${gn(c.g)}</b>, the man who needs it most.`,
    opts: [
      { label: c => `Have him treat that one man (${c.cost} denarii; fully healed)`, ok: c => G.denarii >= c.cost, run: c => { const g = byId(c.g); G.denarii -= c.cost; if (g) { g.injury = 0; g.hp = maxHp(g); g.fatigue = clamp(g.fatigue - 40, 0, 100); } return `The physician treats ${gn(c.g)} for a day. His injury is healed, his health is full again, and he is much less tired.`; } },
      { label: c => `Have him treat everyone (${c.cost * 2} denarii; a smaller benefit each)`, ok: c => G.denarii >= c.cost * 2, run: c => { G.denarii -= c.cost * 2; G.roster.forEach(g => { g.injury = Math.max(0, g.injury - 2); g.fatigue = clamp(g.fatigue - 20, 0, 100); g.hp = Math.min(maxHp(g), g.hp + Math.round(maxHp(g) * 0.3)); }); return 'The physician treats every man in turn. Each one recovers two days sooner from any injury, gets back some health, and is less tired.'; } },
      { label: () => 'Refuse', run: () => 'You refuse, and he travels on.' },
    ],
  },
  masseur: {
    title: 'Masseurs for hire',
    can: () => fit().length > 0,
    make: () => ({ cost: 12 * Math.max(1, fit().length) + tier() * 10 }),
    text: c => `The town bath-house is closed for repairs, so its masseurs have no work. Their master offers to send all of them to your school for a day, for ${c.cost} denarii.`,
    opts: [
      { label: c => `Hire them (${c.cost} denarii; much less tired, morale +5)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; G.roster.forEach(g => evTire(g, -30)); evAllMor(5); return 'The masseurs work on every man. Your fighters are much less tired, and morale is +5.'; } },
      { label: () => 'Refuse', run: () => 'You refuse, and they go to another school.' },
    ],
  },
  tout: {
    title: 'A man selling information',
    can: () => fit().length > 0 && daysToGames() <= 3,
    make: () => ({ cost: 30 + tier() * 30 }),
    text: c => `A man who drinks with the trainers of the other schools says he knows who your men will face at the next games, and how those men fight. He will tell you for ${c.cost} denarii. His information may or may not be any good.`,
    opts: [
      { label: c => `Pay him (${c.cost} denarii; usually worth it)`, ok: c => G.denarii >= c.cost, run: c => {
        G.denarii -= c.cost;
        if (chance(0.75)) { fit().forEach(g => { addProg(g, 'skl', 1.5); evMor(g, 4); }); return 'His information is good. Your trainer uses it to prepare the men: every fit man gets some skill practice, and morale is +4.'; }
        return 'His information is worthless gossip. You have wasted your money.';
      } },
      { label: () => 'Refuse', run: () => 'You refuse, and he goes to sell what he knows about your school to somebody else.' },
    ],
  },
  hound: {
    title: 'A fierce dog for sale',
    can: () => fit().length > 0,
    make: () => ({ cost: 40 + tier() * 30 }),
    text: c => `An animal dealer has a big, fierce dog that his own men cannot handle. He will sell it to you for ${c.cost} denarii. It would guard your gate, and your men could practise dodging it.`,
    opts: [
      { label: c => `Buy the dog (${c.cost} denarii; agility practice, small risk of a bite)`, ok: c => G.denarii >= c.cost, run: c => {
        G.denarii -= c.cost; fit().forEach(g => addProg(g, 'agi', 1.5));
        const g = chance(0.25) ? pick(fit()) : null; if (g) { g.injury = 1; addScar(g, 'claw'); return `Dodging the dog is good agility practice for every fit man. But it bites ${g.name}, who is out for a day and will carry the scar.`; }
        return 'Dodging the dog is good agility practice for every fit man, and nobody is bitten.';
      } },
      { label: () => 'Refuse', run: () => 'You refuse, and the dealer sells the dog to the arena.' },
    ],
  },
  veteran: {
    title: 'A retired gladiator asks for a home',
    can: () => G.roster.length > 0,
    make: () => ({ cost: 15 + tier() * 10 }),
    text: c => `A one-eyed old gladiator, long since freed, asks for a place to sleep in your stable and one meal a day. In return he will guard the gate and teach your men what he knows. Feeding him would cost about ${c.cost} denarii.`,
    opts: [
      { label: c => `Take him in (${c.cost} denarii; experience, morale +4)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; G.roster.forEach(g => { g.xp = (g.xp || 0) + 1; }); evAllMor(4); return 'You take him in. In the evenings the men sit round him and listen to what he learned in the arena. Every man gains a little experience, and morale is +4.'; } },
      { label: () => 'Turn him away (morale -3)', run: () => { evAllMor(-3); return 'You turn him away. Your men saw how you treat an old gladiator, and they do not like it: morale -3.'; } },
    ],
  },

  // ---- the gods, and the men who speak for them ----
  omen: {
    title: 'The men have seen an omen',
    can: () => G.roster.length > 0,
    make: () => ({ cost: 20 + tier() * 20, good: chance(0.5) }),
    text: c => `${c.good ? 'An eagle circled the yard three times at dawn and flew toward the arena.' : 'Crows have been sitting on the barracks roof since dawn, all facing the same way.'} The men have stopped training to argue about what it means.`,
    opts: [
      { label: c => `Pay a priest to explain it (${c.cost} denarii; morale +9, Temple favour +4)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; evAllMor(9); favor('temple', 4); return `${c.good ? 'The priest says at once that it means victory.' : 'The priest studies it for a long time, and then finds a way to call it a good sign.'} The men believe him: morale +9. Temple favour +4.`; } },
      { label: c => c.good ? 'Tell them yourself that it is a good sign (morale +5)' : 'Tell them yourself what it means (morale +5 or -6)', run: c => { if (c.good || chance(0.5)) { evAllMor(5); return 'You tell the men it means the gods are watching over this school. They believe you: morale +5.'; } evAllMor(-6); return 'You tell the men it means nothing. They do not believe you, and go on worrying: morale -6.'; } },
      { label: c => `Order them back to training (morale ${c.good ? -2 : -5})`, run: c => { evAllMor(c.good ? -2 : -5); return `You order the men back to training. They obey, but they are still uneasy: morale ${c.good ? -2 : -5}.`; } },
    ],
  },
  rites: {
    title: 'The feast of Hercules',
    can: () => fit().length > 0,
    make: () => ({ cost: 45 + tier() * 35 }),
    text: c => `Tomorrow is the feast of Hercules, the god of gladiators, and your men ask to be allowed to celebrate it. A bull to sacrifice would cost ${c.cost} denarii.`,
    opts: [
      { label: c => `Buy the bull and give them the feast (${c.cost} denarii; morale +13, Temple favour +8)`, ok: c => G.denarii >= c.cost, run: c => { G.denarii -= c.cost; evAllMor(13); favor('temple', 8); fit().forEach(g => evTire(g, -10)); return 'You buy the bull. The men sacrifice it and feast on the meat. Morale +13, Temple favour +8, and they are less tired for the day off.'; } },
      { label: () => 'Give them the day off, but no bull (morale +6, Temple favour +2)', run: () => { evAllMor(6); favor('temple', 2); return 'You give the men the day off, and they celebrate simply, with a little wine. Morale +6, Temple favour +2.'; } },
      { label: () => 'Make them train as usual (morale -7, Temple favour -3)', run: () => { evAllMor(-7); favor('temple', -3); return 'You make the men train as usual, and they resent it: morale -7. Temple favour -3.'; } },
    ],
  },
  letter: {
    title: 'A fighter\'s family is in debt',
    can: () => home().length > 0,
    make: () => { const g = pick(home()); return { g: g.id, cost: 40 + tier() * 30 }; },
    text: c => { const g = byId(c.g); return `A trader has brought <b>${gn(c.g)}</b> a message from his family in ${g ? g.origin : 'the provinces'}. His mother is sick, and the family will lose its land unless a debt is paid. ${c.cost} denarii would pay it. He has never asked you for anything before.`; },
    opts: [
      { label: c => `Pay the debt for him (${c.cost} denarii; his morale +25)`, ok: c => G.denarii >= c.cost, run: c => { const g = byId(c.g); G.denarii -= c.cost; evMor(g, 25); if (g) addStory(g, 'His family\'s debt was paid by the house.'); G.roster.forEach(x => { if (x !== g) evMor(x, 3); }); return `You pay his family's debt. ${gn(c.g)} is too grateful to speak: morale +25. The other men are pleased too: morale +3 each.`; } },
      { label: () => 'Promise to pay it from his next winnings (his morale +8)', run: c => { evMor(byId(c.g), 8); return `You promise that his next winnings will go to pay the debt. ${gn(c.g)} is determined to win: morale +8.`; } },
      { label: () => 'Refuse (his morale -15)', run: c => { evMor(byId(c.g), -15); return `You refuse. ${gn(c.g)} puts the letter away and says nothing: morale -15.`; } },
    ],
  },
  thief: {
    title: 'A boy caught stealing bread',
    can: () => G.roster.length > 0,
    make: () => ({}),
    text: () => 'The cook has caught a street boy, about ten years old, stealing a loaf of bread from the kitchen. He has clearly stolen before.',
    opts: [
      { label: () => 'Give him work in the kitchen (may turn out well or badly)', run: () => {
        if (chance(0.65)) { evAllMor(4); return 'The boy works hard in the kitchen and runs errands, and the men grow fond of him. Morale +4 for everyone.'; }
        const loss = 15 + tier() * 15; G.denarii -= loss; return `The boy works for a week, and then runs off in the night with your kitchen silver. You lose ${loss} denarii.`;
      } },
      { label: () => 'Hand him to the town watch (Magistrate favour +2, morale -2)', run: () => { favor('magistrate', 2); evAllMor(-2); return 'You hand the boy over to the town watch. Magistrate favour +2. Your men think it was hard on a child: morale -2.'; } },
      { label: () => 'Let him go with the bread (morale +2)', run: () => { evAllMor(2); return 'You let him keep the loaf, and he runs off at once. Your men approve: morale +2.'; } },
    ],
  },

  // ---- the other houses ----
  sparring: {
    title: 'A rival proposes a practice match for money',
    can: () => fit().length > 0 && G.denarii >= 40,
    make: () => { const g = evBest(fit(), evPower), H = pick(G.houses); return { g: g.id, h: H.id, stake: 40 + tier() * 40 }; },
    text: c => `${houseDef(c.h).lanista} of ${houseDef(c.h).name} proposes a private practice match with wooden swords: his best man against <b>${gn(c.g)}</b>, your strongest. Each of you would put up ${c.stake} denarii, and the winner takes both.`,
    opts: [
      { label: c => `Accept (win or lose ${c.stake} denarii)`, ok: c => G.denarii >= c.stake, run: c => {
        const g = byId(c.g); if (!g) return 'It comes to nothing.';
        const p = clamp(0.5 + (evPower(g) - (22 + tier() * 9)) * 0.03, 0.2, 0.85); evTire(g, 12);
        if (chance(p)) { G.denarii += c.stake; evMor(g, 10); g.xp = (g.xp || 0) + 1; feud(houseOf(c.h), 3); return `${g.name} wins the match easily. You win ${c.stake} denarii, and he gains morale +10 and a little experience. ${houseDef(c.h).lanista} is not pleased to pay: feud +3.`; }
        G.denarii -= c.stake; evMor(g, -8); return `${g.name} loses the match. You lose ${c.stake} denarii, and his morale is -8.`;
      } },
      { label: () => 'Refuse (feud +2)', run: c => { feud(houseOf(c.h), 2); return 'You refuse, and he tells the town you were afraid to accept: feud +2.'; } },
    ],
  },
  boast: {
    title: 'A fighter has insulted another school',
    can: () => fit().length > 0,
    make: () => ({ g: pick(fit()).id, h: pick(G.houses).id }),
    text: c => `On his last night in town, <b>${gn(c.g)}</b> stood on a tavern table and announced that no fighter of ${houseDef(c.h).name} could last a moment against him. ${houseDef(c.h).lanista} has heard about it, and is angry.`,
    opts: [
      { label: () => 'Back him up (fame +3, his morale +10, feud +8)', run: c => { const g = byId(c.g); evMor(g, 10); if (g) g.fame = (g.fame || 0) + 3; G.fame += 3; feud(houseOf(c.h), 8); return `You say that he meant every word. The whole town is talking about it: fame +3, and his morale is +10. ${houseDef(c.h).name} is furious: feud +8.`; } },
      { label: () => 'Make him apologise (his morale -10, feud -6)', run: c => { evMor(byId(c.g), -10); feud(houseOf(c.h), -6); return `You make ${gn(c.g)} apologise, which he hates: morale -10. The quarrel is settled: feud -6.`; } },
      { label: () => 'Say he was only drunk (nothing changes)', run: () => 'You say he was only drunk. Nobody quite believes it, but the matter is dropped.' },
    ],
  },
  spy: {
    title: 'A rival\'s spy is watching your training',
    can: () => fit().length > 0 && G.houses.some(H => H.grudge >= 15),
    make: () => ({ h: G.houses.slice().sort((a, b) => b.grudge - a.grudge)[0].id, pay: 30 + tier() * 30 }),
    text: c => `Your gate-keeper has caught a man on a nearby roof, watching your fighters train and taking notes. He works for ${houseDef(c.h).name}.`,
    opts: [
      { label: () => 'Beat him and send him back (morale +5, feud +8)', run: c => { feud(houseOf(c.h), 8); evAllMor(5); return 'Your men beat him and send him back to his master. They enjoy it: morale +5. Feud +8.'; } },
      { label: () => 'Let him watch, and show him the wrong things (their renown -10)', run: c => { fit().forEach(g => evMor(g, 3)); const H = houseOf(c.h); H.prestige = Math.max(0, H.prestige - 10); return `For a week your men train badly on purpose while he watches. ${houseDef(c.h).name} is fooled, and looks foolish later: they lose 10 renown. Your men enjoy the trick: morale +3.`; } },
      { label: c => `Pay him to spy for you instead (${c.pay} denarii; skill practice)`, ok: c => G.denarii >= c.pay, run: c => { G.denarii -= c.pay; fit().forEach(g => addProg(g, 'skl', 1)); feud(houseOf(c.h), -3); return `You pay him, and now he reports to you. Your trainer learns how ${houseDef(c.h).name} trains, and every fit man gets some skill practice from it. Feud -3.`; } },
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
