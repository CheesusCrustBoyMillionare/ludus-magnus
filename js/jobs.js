'use strict';
// Work and journeys away from the ludus: the patrons' contracts, what happens on the road,
// and the journeys of their own that fighters ask leave for.
//
// G.contracts  offers on the board, replaced every games day
// G.jobs       outings under way; each fighter on one carries g.away = the job's id
// G.reports    what came of an outing, waiting to be shown to the player
// g.quest      a fighter's own journey: { id, step, since, tries }

// ---------- contracts ----------
// days: shortest and longest. w: how much each stat counts. cls / likes / hates: who suits the work.
// danger: 0 (none) to 1. pay: against the going rate. trait: what a man may learn doing it.
const CONTRACTS = {
  bodyguard: {
    name: 'A senator\'s shadow', patron: 'magistrate', tier: 0, days: [3, 5], size: 1, danger: 0.35, pay: 1.0,
    w: { str: 0.3, agi: 0.2, end: 0.2, skl: 0.3 }, cls: ['murmillo', 'hoplomachus'], likes: ['guarded', 'watchful', 'keen', 'steady'], hates: ['nervous'],
    trait: 'watchful', events: ['bribe', 'insult', 'wound', 'rivals'],
    text: () => 'A senator is passing through on his way to Rome and has enemies in every town. He wants a man at his shoulder who looks as though he has killed before.',
    win: n => `${n} stood at the senator's shoulder for every hour of it. Nobody came within a sword's length.`,
    fail: n => `A cut-purse got to the senator's belt while ${n} was watching the wrong doorway. The senator was not hurt, only robbed, and he is loud about it.`,
  },
  caravan: {
    name: 'The grain road', patron: 'guild', tier: 0, days: [4, 6], size: 2, danger: 0.5, pay: 1.1, travel: true,
    w: { str: 0.3, agi: 0.3, end: 0.4, skl: 0 }, cls: ['hoplomachus', 'thraex'], likes: ['tireless', 'ironlungs', 'keen', 'travelled'], hates: ['lazy', 'frail'],
    trait: 'travelled', events: ['ambush', 'dice', 'rivals', 'wound', 'homesick'],
    text: c => `The Guild is sending forty carts toward ${c.land} and the hills along that road are full of hungry men. They want two swords walking beside the oxen.`,
    win: n => `${n} brought every cart through. The Guild's factor counted the sacks twice and could find nothing to complain of.`,
    fail: n => `Three carts were cut out of the line at night and driven off. ${n} came home with the rest, and with nothing to say.`,
  },
  tutor: {
    name: 'A noble pupil', patron: 'magistrate', tier: 0, days: [4, 5], size: 1, danger: 0, pay: 0.8,
    w: { str: 0, agi: 0.3, end: 0, skl: 0.7 }, cls: ['thraex', 'dimachaerus'], likes: ['disciplined', 'steady', 'oldschool'], hates: ['lazy', 'brute', 'embittered'],
    trait: 'drillmaster', events: ['insult', 'crowd', 'windfall'],
    text: () => 'One of the town\'s better families has a son of sixteen who thinks he will be a soldier. His father wants a real swordsman to teach him how little he knows.',
    win: n => `The boy can hold a guard now, and has the bruises to remember it by. His father watched the last lesson and sent ${n} home with a full purse.`,
    fail: n => `The boy went crying to his mother on the second day, and ${n} was shown the gate.`,
  },
  procession: {
    name: 'The goddess\'s procession', patron: 'temple', tier: 0, days: [1, 2], size: 1, danger: 0, pay: 0.6, fame: 4,
    w: { str: 0.3, agi: 0, end: 0.4, skl: 0.3 }, cls: ['murmillo', 'hoplomachus'], likes: ['showy', 'laureate', 'blessed', 'steady'], hates: ['nervous'],
    trait: 'blessed', events: ['crowd', 'insult', 'windfall'],
    text: () => 'The priests of Nemesis carry her image through the streets and want an armed man walking before it, in full harness, from dawn until the lamps are lit.',
    win: n => `${n} walked before the goddess from dawn to dark and never once shifted his shield. The town saw whose man he was.`,
    fail: n => `${n} stumbled on the temple steps with the whole town watching. The priests call it an omen.`,
  },
  debts: {
    name: 'A debt to collect', patron: 'guild', tier: 0, days: [2, 3], size: 1, danger: 0.3, pay: 1.2,
    w: { str: 0.6, agi: 0, end: 0.4, skl: 0 }, cls: ['murmillo', 'dimachaerus'], likes: ['brute', 'bloodthirsty', 'killer'], hates: ['nervous', 'frail'],
    trait: null, anger: { magistrate: -2 }, events: ['bribe', 'wound', 'rivals'],
    text: () => 'A wine-seller owes the Guild more than his shop is worth and has hired two cousins to stand in his doorway. The Guild would like someone larger to stand in it instead. The Magistrate does not care for this kind of business.',
    win: n => `The wine-seller found the money once ${n} had leaned on his counter for an afternoon. The Guild has its silver.`,
    fail: n => `The wine-seller's cousins were handier than they looked, and the watch arrived before ${n} had finished with them.`,
  },
  pitfight: {
    name: 'The pit at the crossroads', patron: 'guild', tier: 0, days: [3, 4], size: 1, danger: 0.7, pay: 1.5, travel: true, feud: 5,
    w: { str: 0.4, agi: 0.3, end: 0, skl: 0.3 }, cls: ['dimachaerus', 'thraex'], likes: ['brute', 'killer', 'lionheart', 'bloodthirsty', 'pitfighter'], hates: ['nervous'],
    trait: 'pitfighter', events: ['bribe', 'wound', 'rivals', 'dice'],
    text: c => `The Guild's gamblers run a pit behind a tavern on the road to ${c.land}: no shields, no physician, no one to stop it. They want a trained man to put against the local champion, and they do not say who else has sent one.`,
    win: n => `${n} left the local champion face down in the straw. The gamblers who backed him are very pleased with your house.`,
    fail: n => `The local champion bit, gouged and won. ${n} was carried out to jeering.`,
  },
  granary: {
    name: 'Night watch at the granary', patron: 'guild', tier: 0, days: [3, 5], size: 2, danger: 0.3, pay: 0.9,
    w: { str: 0, agi: 0.3, end: 0.4, skl: 0.3 }, cls: ['retiarius', 'hoplomachus'], likes: ['keen', 'watchful', 'steady', 'disciplined'], hates: ['lazy'],
    trait: 'watchful', events: ['bribe', 'dice', 'rivals', 'wound'],
    text: () => 'Someone has been at the Guild\'s granary three nights running. They want two men on the roof until whoever it is has been caught or frightened off.',
    win: n => `On the last night ${n} caught four men on the granary wall with sacks and a ladder. The Guild has them, and its grain.`,
    fail: n => `The thieves came by the river door while ${n} watched the wall. The Guild is short forty sacks.`,
  },
  beasthunt: {
    name: 'Beasts for the games', patron: 'magistrate', tier: 1, days: [5, 7], size: 2, danger: 0.7, pay: 1.4, travel: true, scar: 'claw',
    w: { str: 0, agi: 0.4, end: 0.3, skl: 0.3 }, cls: ['retiarius', 'hoplomachus'], likes: ['keen', 'quick', 'tireless', 'beastslayer'], hates: ['nervous', 'frail', 'lazy'],
    trait: 'beastslayer', events: ['ambush', 'wound', 'dice', 'homesick'],
    text: c => `The Magistrate needs animals for his next hunt and his trappers have gone missing in the forests toward ${c.land}. He wants two men who can take a beast alive, with nets and spears.`,
    win: n => `${n} came down out of the forest with two cages full of teeth. The Magistrate's beast-master counted them and smiled.`,
    fail: n => `The cages came back empty. Whatever ${n} found in that forest, it was not willing to be caught.`,
  },
  escort: {
    name: 'A priestess on the road', patron: 'temple', tier: 1, days: [5, 6], size: 1, danger: 0.4, pay: 1.0, travel: true,
    w: { str: 0, agi: 0.3, end: 0.4, skl: 0.3 }, cls: ['murmillo', 'hoplomachus'], likes: ['guarded', 'steady', 'watchful', 'blessed'], hates: ['bloodthirsty', 'brute'],
    trait: 'watchful', events: ['ambush', 'homesick', 'windfall', 'wound'],
    text: c => `A priestess of Nemesis is carrying the temple's offerings to the great shrine in ${c.land}. The priests want one quiet man to walk behind her mule, and to be seen as little as possible.`,
    win: n => `The priestess reached the shrine with every offering. She says ${n} did not speak ten words on the road, and means it as praise.`,
    fail: n => `The offerings were stolen at an inn while ${n} slept. The priestess walked the last day alone.`,
  },
  statue: {
    name: 'A sculptor\'s model', patron: 'magistrate', tier: 1, days: [3, 4], size: 1, danger: 0, pay: 0.9, fame: 6, glory: true,
    w: { str: 0.5, agi: 0, end: 0.5, skl: 0 }, cls: [], likes: ['showy', 'laureate', 'ironhide'], hates: ['frail', 'nervous'],
    trait: null, events: ['insult', 'crowd', 'windfall'],
    text: () => 'The Magistrate is putting a bronze gladiator in the forum and his Greek sculptor wants a living one to work from: a man the town already knows, who can stand still for two days.',
    win: n => `The sculptor has what he needs. There will be a bronze in the forum with ${n}'s shoulders, and your house's name cut under it.`,
    fail: n => `The sculptor threw down his tools on the first afternoon. ${n}, he says, has the bearing of a mule-driver.`,
  },
};

// The weights above were written when there were four skills. What was asked of endurance is asked of the
// others in proportion, so that each contract's weights still add up to one.
for (const k in CONTRACTS) {
  const w = CONTRACTS[k].w, rest = 1 - (w.end || 0);
  delete w.end;
  for (const s of STATS) w[s] = rest > 0 ? (w[s] || 0) / rest : 1 / STATS.length;
}

// The going rate: about half of what the same men would win at the games over the same days.
const JOB_RATE = 0.1;
const DANGER_WORD = d => d <= 0 ? 'No danger' : d < 0.4 ? 'Some danger' : d < 0.65 ? 'Dangerous' : 'Deadly work';
const jobNeed = (t, diff) => ENEMY_BUDGET[t] / 4 * diff;
const jobById = id => (G.jobs || []).find(j => j.id === +id) || null;
const jobOf = g => g && g.away ? jobById(g.away) : null;
const home = () => G.roster.filter(g => !g.away);
const inTourney = g => !!(G.tourney && G.tourney.state !== 'done' && G.tourney.entrant === g.id);
const canSend = g => !!g && !g.away && g.injury <= 0 && !inTourney(g);
const namesOf = gs => gs.length < 2 ? (gs[0] ? gs[0].name : 'nobody') : gs.slice(0, -1).map(g => g.name).join(', ') + ' and ' + gs[gs.length - 1].name;
const jobMen = J => J.ids.map(byId).filter(Boolean);
const jn = J => { const m = J && jobMen(J); return m && m.length ? namesOf(m) : 'your man'; };

// What a contract or a step of a quest asks of a man.
function jobDef(J) { return CONTRACTS[J.type]; }
function jobTitle(J) { return CONTRACTS[J.type].name; }

// How well one man suits a piece of work: a score to set against what it needs, and the reasons.
function aptitude(g, D, land) {
  let base = 0, mult = 1;
  const why = [];
  STATS.forEach(s => { base += (D.w[s] || 0) * g.stats[s]; });
  if ((D.cls || []).includes(g.cls)) { mult += 0.1; why.push(`a ${CLASSES[g.cls].name}'s work`); }
  for (const t of (D.likes || [])) if (g.traits.includes(t)) { mult += 0.08; why.push(TRAITS[t].name.toLowerCase()); }
  for (const t of (D.hates || [])) if (g.traits.includes(t)) { mult -= 0.1; why.push('but ' + TRAITS[t].name.toLowerCase()); }
  if (land && g.origin === land) { mult += 0.15; why.push(`knows ${land}`); }
  if (g.traits.includes('travelled') && !(D.likes || []).includes('travelled')) { mult += 0.08; why.push('well-travelled'); }
  if (D.glory) { const f = Math.min(0.24, g.wins * 0.03); if (f > 0) { mult += f; why.push('a known face'); } }
  if (g.morale < 40) why.push('but in low spirits');
  if (g.fatigue > 60) why.push('but tired');
  mult *= (0.85 + g.morale / 400) * (1 - Math.max(0, g.fatigue - 50) / 250);
  return { score: base * mult, why };
}

// The chance that these men bring the work off.
function jobOdds(D, need, men, edge, land) {
  if (!men.length) return 0;
  let score = men.reduce((s, g) => s + aptitude(g, D, land).score, 0) / men.length;
  for (let i = 0; i < men.length; i++) for (let j = i + 1; j < men.length; j++) {
    const b = bondBetween(men[i], men[j]);
    if (b) score *= b.type === 'friend' ? 1.08 : 0.9;
  }
  return clamp(0.5 + (score / need - 1) * 0.9, 0.05, 0.95) + (edge || 0);   // what happens on the road can settle it either way
}
const oddsWord = p => p >= 0.75 ? 'Well suited' : p >= 0.5 ? 'Suited' : p >= 0.3 ? 'A risk' : 'Poorly suited';
const contractOdds = (c, men) => jobOdds(CONTRACTS[c.type], c.need, men, 0, c.land);

// Would he be away on a games day?
function missesGames(days) {
  for (let d = G.day; d < G.day + days; d++) if (d % GAMES_EVERY === 0) return true;
  return false;
}
// A man who might not come back: broken in spirit, or with a broken promise to remember.
function flightRisk(g) {
  if (g.traits.includes('atpeace') || g.grateful) return false;
  return g.traits.includes('embittered') || g.morale < 25;
}

function genContracts() {
  const t = tier();
  for (const c of (G.contracts || [])) {
    if (!c.asked) continue;
    favor(c.patron, -3);
    log(`${PATRONS[c.patron].name} asked a service of you, and you did not give it. Favour -3.`, 'bad');
  }
  const types = Object.keys(CONTRACTS).filter(k => CONTRACTS[k].tier <= t).sort(() => Math.random() - 0.5).slice(0, t >= 2 ? 4 : 3);
  G.contracts = types.map(type => {
    const D = CONTRACTS[type], days = rint(D.days[0], D.days[1]), diff = rand(0.85, 1.3);
    return {
      id: ++G.nextId, type, patron: D.patron, days, size: D.size, diff, need: jobNeed(t, diff),
      land: D.travel ? pick(ORIGINS).name : null, asked: false,
      pay: round5(PURSE[t] * JOB_RATE * days * Math.pow(D.size, 0.85) * D.pay * (0.6 + 0.5 * diff)),
      favor: 3 + Math.round(days / 2),
    };
  });
  // a patron who thinks well of you sometimes asks for you by name: worth more, and costly to ignore
  const friend = Object.keys(G.patrons).filter(k => G.patrons[k] >= 35 && G.contracts.some(c => c.patron === k));
  if (friend.length && chance(0.5)) {
    const c = pick(G.contracts.filter(x => friend.includes(x.patron)));
    c.asked = true; c.favor = Math.round(c.favor * 1.5);
  }
}

// One event on the road, somewhere in the middle of the work.
function planEvent(J, D, days) {
  J.eventDay = days >= 2 && (D.events || []).length && chance(0.75) ? G.day + rint(1, days - 1) : 0;
}

function sendContract(cid, ids) {
  const c = (G.contracts || []).find(x => x.id === +cid);
  const men = [...new Set(ids.map(Number))].map(byId);
  if (!c || men.length !== c.size || !men.every(canSend)) return false;
  const D = CONTRACTS[c.type];
  const J = { id: ++G.nextId, kind: 'contract', type: c.type, ids: men.map(g => g.id), start: G.day, end: G.day + c.days,
    need: c.need, land: c.land, pay: c.pay, favor: c.favor, patron: c.patron, asked: c.asked, edge: 0 };
  planEvent(J, D, c.days);
  men.forEach(g => { g.away = J.id; });
  G.jobs.push(J);
  G.contracts = G.contracts.filter(x => x !== c);
  log(`${namesOf(men)} ${men.length > 1 ? 'leave' : 'leaves'} on contract for ${PATRONS[c.patron].name}: ${D.name}. Back in ${c.days} day${c.days === 1 ? '' : 's'}.`);
  save();
  return true;
}

// ---------- coming home ----------

function fieldWound(g, days, scar) {
  g.injury = Math.max(g.injury, Math.round(days * (g.traits.includes('frail') ? 1.5 : 1)));
  g.hp = Math.max(1, Math.round(maxHp(g) * 0.5));
  addScar(g, scar || 'cut');
}
function diesAway(g, where) {
  G.roster = G.roster.filter(x => x !== g);
  departed(g, 'dead');
  G.fallen.push({ name: g.name, cls: g.cls, wins: g.wins, day: G.day, by: '' });
  log(`${g.name} the ${CLASSES[g.cls].name} died ${where} (${g.wins} victories).`, 'bad');
  G.roster.forEach(x => { x.morale = clamp(x.morale - 8, 0, 100); });
}
function deserts(g) {
  g.gear = emptyGear();                       // he does not send his kit back
  G.roster = G.roster.filter(x => x !== g);
  departed(g, 'deserted');
  log(`${g.name} did not come back. He is gone, and what he wore is gone with him.`, 'bad');
  G.roster.forEach(x => { x.morale = clamp(x.morale - 4, 0, 100); });
}

// Men who share a road come back changed toward each other.
function roadBonds(men, win, lines) {
  for (let i = 0; i < men.length; i++) for (let j = i + 1; j < men.length; j++) {
    const a = men[i], b = men[j], bond = bondBetween(a, b);
    if (!bond && win && chance(0.3) && makeBond(a, b, 'friend')) lines.push(`${a.name} and ${b.name} shared a fire and a road, and came back friends.`);
    else if (!bond && !win && chance(0.25) && makeBond(a, b, 'rival')) lines.push(`${a.name} and ${b.name} each blame the other. There is bad blood between them now.`);
    else if (bond && bond.type === 'rival' && win && chance(0.3)) {
      bond.type = 'friend';
      addStory(a, `Made his peace with ${b.name} on the road.`); addStory(b, `Made his peace with ${a.name} on the road.`);
      lines.push(`Somewhere on the road ${a.name} and ${b.name} stopped being enemies.`);
    } else if (bond && bond.type === 'friend' && !win && chance(0.15)) {
      G.bonds = G.bonds.filter(x => x !== bond);
      addStory(a, `Fell out with ${b.name}.`); addStory(b, `Fell out with ${a.name}.`);
      lines.push(`${a.name} and ${b.name} are no longer speaking.`);
    }
  }
}

// The work is over, one way or another. Settles every man who went and writes the report.
function finishJob(J) {
  G.jobs = G.jobs.filter(x => x !== J);
  const D = jobDef(J), all = jobMen(J), quest = false;
  all.forEach(g => { g.away = null; });
  if (!all.length) return;
  const title = jobTitle(J), names = namesOf(all), lines = [];
  const p = jobOdds(D, J.need, all, J.edge, J.land);
  const win = !J.abandon && chance(p);
  const top = STATS.slice().sort((a, b) => (D.w[b] || 0) - (D.w[a] || 0))[0];
  const days = Math.max(1, J.end - J.start);
  let back = [];

  for (const g of all) {
    if (J.flight === g.id || (flightRisk(g) && chance(g.traits.includes('embittered') ? 0.35 : 0.25))) {
      lines.push(`<span class="bad"><b>${g.name}</b> slipped away on the road and has not been seen since. His kit went with him.</span>`);
      deserts(g);
      continue;
    }
    if (!J.abandon && D.danger > 0 && chance(D.danger * (win ? 0.18 : 0.55))) {
      if (!win && D.danger >= 0.5 && chance(clamp(D.danger * 0.25 - mercyBonus(), 0.02, 0.3))) {
        lines.push(`<span class="bad"><b>${g.name}</b> did not live to come home.</span>`);
        diesAway(g, quest ? 'far from the ludus' : 'on contract');
        continue;
      }
      fieldWound(g, rint(2, 5), D.scar);
      lines.push(`<b>${g.name}</b> comes back wounded, and will rest for ${g.injury} day${g.injury === 1 ? '' : 's'}.`);
    }
    back.push(g);
  }

  for (const g of back) {
    g.fatigue = clamp(Math.max(g.fatigue * 0.5, 25 + 40 * D.danger), 0, 100);
    g.morale = clamp(g.morale + (J.abandon ? -4 : win ? 6 : -6), g.traits.includes('atpeace') ? 60 : 0, 100);
    if (!J.abandon) {
      g.xp += win ? 2 : 1;
      addProg(g, top, 0.4 * days * g.pot[top]);
    }
  }

  if (J.abandon) {
    lines.unshift(`${names} ${all.length > 1 ? 'were' : 'was'} called home before the work was done.`);
    if (!quest) { favor(J.patron, -3); lines.push(`${PATRONS[J.patron].name} is not pleased. Favour -3.`); }
  } else {
    lines.unshift((win ? D.win : D.fail)(names, J));
    if (win) {
      G.denarii += J.pay; favor(J.patron, J.favor);
      let gain = `<b class="gold">+${J.pay} denarii.</b> ${PATRONS[J.patron].name}: favour +${J.favor}.`;
      if (D.fame) { const f = D.fame * (1 + tier()); G.fame += f; back.forEach(g => { g.fame += Math.round(f / back.length); }); gain += ` Fame +${f}.`; }
      for (const k in (D.anger || {})) { favor(k, D.anger[k]); gain += ` ${PATRONS[k].name}: favour ${D.anger[k]}.`; }
      lines.push(gain);
      if (D.feud) { const H = pick(G.houses); feud(H, D.feud); lines.push(`<span class="dim">${houseDef(H.id).name} had a man in the same pit, and will remember who beat him.</span>`); }
      for (const g of back) {
        addStory(g, `Did good service on contract: ${D.name}.`);
        if (D.trait && !g.traits.includes(D.trait) && chance(p >= 0.75 ? 0.3 : 0.2)) {
          g.traits.push(D.trait); addStory(g, `Learned: ${TRAITS[D.trait].name}.`);
          lines.push(`<span class="gold"><b>${g.name}</b> has learned something out there: ${TRAITS[D.trait].name}.</span> <span class="dim">${TRAITS[D.trait].desc}</span>`);
        }
      }
      log(`${names} ${back.length === 1 ? 'returns' : 'return'} from contract (${D.name}): ${J.pay} denarii.`, 'good');
    } else {
      const loss = J.asked || J.bribed ? 6 : 4;
      favor(J.patron, -loss);
      lines.push(`No pay. ${PATRONS[J.patron].name}: favour -${loss}.`);
      back.forEach(g => addStory(g, `Failed on contract: ${D.name}.`));
      log(`The contract failed: ${D.name}.`, 'bad');
    }
    roadBonds(back, win, lines);
  }
  for (const g of back) {
    if (checkRank(g)) { addStory(g, `Rose to the rank of ${RANKS[g.rank].name}.`); lines.push(`<span class="gold"><b>${g.name}</b> rises to the rank of ${RANKS[g.rank].name} and may learn a perk.</span>`); }
  }
  G.reports.push({ title, html: lines.map(l => `<p>${l}</p>`).join('') });
}

// Called each morning: road events fall due, and men come home.
function jobsTick() {
  for (const g of home()) {
    if (g.quest && G.day - g.quest.since > 0 && (G.day - g.quest.since) % 15 === 0) {
      g.morale = clamp(g.morale - 8, 0, 100);
      log(`${g.name} is still waiting for you to take him where you promised.`, 'bad');
    }
  }
  for (const J of G.jobs.slice()) {
    if (G.day >= J.end) { finishJob(J); continue; }
    if (J.eventDay === G.day) {
      const D = jobDef(J), ids = (D.events || []).filter(id => FIELD_EVENTS[id].can(J));
      if (ids.length) { const id = pick(ids); raiseEvent(id, FIELD_EVENTS[id].make(J)); }
    }
  }
  if (!isGamesDay() && chance(0.07) && EVENTS.quest.can()) raiseEvent('quest', EVENTS.quest.make());
}

// ---------- events: more than one may now be waiting ----------

function raiseEvent(id, c) {
  if (G.pendingEvent) G.eventQueue.push({ id, c }); else G.pendingEvent = { id, c };
}
function nextEvent() {
  while (!G.pendingEvent && G.eventQueue.length) {
    const e = G.eventQueue.shift();
    if (EVENTS[e.id]) G.pendingEvent = e;
  }
}

// ---------- what happens on the road ----------
// Each is raised for one outing. c.job is the outing; c.g the man it turns on.

const GONE = 'The matter had settled itself before your answer reached them.';
const fieldCtx = (J, more) => Object.assign({ job: J.id, g: pick(J.ids) }, more || {});
const lowest = J => jobMen(J).sort((a, b) => a.morale - b.morale)[0];
// runs fn with the outing and its men, or says the moment has passed
const onJob = (c, fn) => { const J = jobById(c.job), men = J ? jobMen(J) : []; return J && men.length ? fn(J, men, byId(c.g) || men[0]) : GONE; };
const abandon = J => { J.abandon = true; J.end = G.day + 1; J.eventDay = 0; };

const FIELD_EVENTS = {
  ambush: {
    title: 'Word from the road',
    can: () => true,
    make: J => fieldCtx(J, { cost: 25 + tier() * 25 }),
    text: c => `A carter brings word: armed men have stopped <b>${jn(jobById(c.job))}</b> at a ford and are asking a toll of ${c.cost} denarii to let ${jobMen(jobById(c.job) || { ids: [] }).length > 1 ? 'them' : 'him'} cross.`,
    opts: [
      { label: () => 'Tell them to cut their way through', run: c => onJob(c, (J, men, g) => {
        if (chance(clamp(jobOdds(jobDef(J), J.need, men, 0.1, J.land), 0.2, 0.9))) {
          J.edge += 0.1; men.forEach(x => { x.xp++; x.morale = clamp(x.morale + 5, 0, 100); });
          return `The toll-takers were farmers with boar spears. ${namesOf(men)} left two of them in the water and went on.`;
        }
        J.edge -= 0.15; fieldWound(g, rint(2, 4));
        return `There were more of them in the reeds. ${g.name} took a spear in the thigh before they broke through.`;
      }) },
      { label: c => `Send the toll (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => onJob(c, () => { G.denarii -= c.cost; return 'The silver goes down the road with the carter. They are let through.'; }) },
      { label: () => 'Have them go round by the hills', run: c => onJob(c, (J, men) => {
        J.end++; men.forEach(x => { x.fatigue = clamp(x.fatigue + 15, 0, 100); });
        return 'A day lost on goat tracks. They will be back a day later than agreed.';
      }) },
    ],
  },
  bribe: {
    title: 'A purse in the dark',
    can: J => J.kind === 'contract',
    make: J => fieldCtx(J, { pay: 30 + tier() * 30 }),
    text: c => `<b>${gn(c.g)}</b> sends word by a tavern boy. A stranger has offered ${c.pay} denarii if he will be looking the other way tomorrow night. He asks what the house wants done.`,
    opts: [
      { label: c => `Take it (+${c.pay})`, run: c => onJob(c, J => { G.denarii += c.pay; J.edge -= 0.35; J.bribed = true; return 'The purse comes home ahead of him. What it bought, you will find out.'; }) },
      { label: () => 'Refuse it', run: c => onJob(c, (J, men, g) => { J.edge += 0.05; g.morale = clamp(g.morale + 4, 0, 100); return `${g.name} sends the stranger away. He seems glad to have been told to.`; }) },
      { label: () => 'Take it, and tell his employer', run: c => onJob(c, (J, men, g) => {
        if (chance(0.55)) { G.denarii += c.pay; J.edge += 0.15; return `The employer laughs, lets ${g.name} keep the purse, and sets a trap with it.`; }
        J.edge -= 0.1; fieldWound(g, rint(2, 3));
        return `The stranger had friends, and they found ${g.name} in an alley the same night.`;
      }) },
    ],
  },
  insult: {
    title: 'Treated like a dog',
    can: J => J.kind === 'contract',
    make: J => fieldCtx(J),
    text: c => `Word comes that <b>${gn(c.g)}</b> is being fed with the kitchen slaves and spoken to like one. He has not answered back yet. He wants to.`,
    opts: [
      { label: () => 'He bears it', run: c => onJob(c, (J, men, g) => { J.edge += 0.08; g.morale = clamp(g.morale - 10, 0, 100); return `${g.name} bears it. He will remember that you told him to.`; }) },
      { label: () => 'He may answer as he likes', run: c => onJob(c, (J, men, g) => {
        g.morale = clamp(g.morale + 10, 0, 100); J.edge -= 0.2;
        return `${g.name} said something short in front of the whole household. It was understood.`;
      }) },
    ],
  },
  wound: {
    title: 'Hurt on the job',
    can: J => jobDef(J).danger > 0,
    make: J => fieldCtx(J, { cost: 30 + tier() * 20 }),
    text: c => `<b>${gn(c.g)}</b> has been hurt: a blade across the ribs, not deep, already hot to the touch. A local physician will see to it for ${c.cost} denarii.`,
    opts: [
      { label: c => `Pay the physician (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => onJob(c, () => { G.denarii -= c.cost; return 'Vinegar, honey and clean linen. He will carry on.'; }) },
      { label: () => 'He carries on as he is', run: c => onJob(c, (J, men, g) => { J.edge -= 0.1; fieldWound(g, rint(3, 5)); return `${g.name} binds it himself and carries on. He will come home the worse for it.`; }) },
      { label: () => 'Call them home', run: c => onJob(c, (J, men, g) => { abandon(J); fieldWound(g, 2); return 'The work is given up. They will be home tomorrow.'; }) },
    ],
  },
  dice: {
    title: 'Dice at an inn',
    can: () => true,
    make: J => fieldCtx(J, { stake: 20 + tier() * 20 }),
    text: c => `<b>${jn(jobById(c.job))}</b> ${jobMen(jobById(c.job) || { ids: [] }).length > 1 ? 'have' : 'has'} fallen in with a table of mule-drivers and a set of dice, and ${jobMen(jobById(c.job) || { ids: [] }).length > 1 ? 'ask' : 'asks'} leave to play with the house's travelling money.`,
    opts: [
      { label: () => 'Let them play', run: c => onJob(c, (J, men) => {
        men.forEach(x => { x.morale = clamp(x.morale + 6, 0, 100); });
        if (chance(0.5)) { G.denarii += c.stake; return `The dice were kind. ${c.stake} denarii come home, most of what was won.`; }
        G.denarii -= c.stake; men.forEach(x => { x.fatigue = clamp(x.fatigue + 10, 0, 100); });
        return `The mule-drivers had played before. ${c.stake} denarii of your money stays at the inn.`;
      }) },
      { label: () => 'Forbid it', run: c => onJob(c, (J, men) => { men.forEach(x => { x.morale = clamp(x.morale - 5, 0, 100); }); J.edge += 0.05; return 'They go to bed sober and sour.'; }) },
    ],
  },
  rivals: {
    title: 'Familiar colours',
    can: () => true,
    make: J => fieldCtx(J, { h: pick(G.houses).id }),
    text: c => `Men of ${houseDef(c.h).name} are in the same town on business of their own, and have been saying what they think of your house where <b>${jn(jobById(c.job))}</b> can hear it.`,
    opts: [
      { label: () => 'Keep away from them', run: c => onJob(c, (J, men) => { men.forEach(x => { x.morale = clamp(x.morale - 3, 0, 100); }); return 'They cross the street. It costs them something.'; }) },
      { label: () => 'Let it be settled', run: c => onJob(c, (J, men, g) => {
        const H = houseOf(c.h);
        if (chance(clamp(0.35 + statSum(g) / (ENEMY_BUDGET[tier()] * 2.2) * 0.4, 0.3, 0.8))) {
          feud(H, 8); H.prestige = Math.max(0, H.prestige - 5); J.edge += 0.08;
          men.forEach(x => { x.xp += 2; x.morale = clamp(x.morale + 8, 0, 100); });
          return `It was settled behind a stable. ${houseDef(c.h).name} will be short a man for a week, and they know who to thank.`;
        }
        feud(H, 5); J.edge -= 0.1; fieldWound(g, rint(2, 4));
        return `There were more of them than was said. ${g.name} came out of it with a broken hand.`;
      }) },
    ],
  },
  homesick: {
    title: 'A long way from the ludus',
    can: J => J.kind === 'contract' && jobMen(J).some(g => !g.traits.includes('atpeace')),
    make: J => ({ job: J.id, g: lowest(J).id, cost: 30 + tier() * 30 }),
    text: c => { const g = byId(c.g), J = jobById(c.job); return `<b>${gn(c.g)}</b> has been asking the way to ${g && J && J.land === g.origin ? 'his own village, which is not two days from here' : 'the coast, and what a passage costs'}. It may be nothing.`; },
    opts: [
      { label: c => `Promise him a bonus when he is home (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => onJob(c, (J, men, g) => { G.denarii -= c.cost; g.morale = clamp(g.morale + 15, 0, 100); return `${g.name} is told there is silver waiting for him. He stops asking questions.`; }) },
      { label: () => 'Trust him', run: c => onJob(c, (J, men, g) => {
        if (g.morale < 45 && !g.grateful && !g.traits.includes('atpeace') && chance(0.6)) { J.flight = g.id; return 'You send no word. There is nothing to do now but wait and see who comes back.'; }
        g.morale = clamp(g.morale + 6, 0, 100);
        return `${g.name} was only asking after news of home. He hears that you trusted him, and it matters to him.`;
      }) },
      { label: () => 'Have them all brought back', run: c => onJob(c, J => { abandon(J); return 'The doctore rides out to fetch them. The work is given up.'; }) },
    ],
  },
  windfall: {
    title: 'A grateful household',
    can: J => J.kind === 'contract',
    make: J => fieldCtx(J, { pay: 25 + tier() * 25 }),
    text: c => `<b>${gn(c.g)}</b> pulled the employer's child out from under a cart horse. The family would like to thank the house, and ask how.`,
    opts: [
      { label: c => `In silver (+${c.pay})`, run: c => onJob(c, () => { G.denarii += c.pay; return 'A purse arrives with a note in a good hand.'; }) },
      { label: () => 'In iron: something from their armoury', run: c => onJob(c, () => {
        const it = makeItem(pick(ARMOR_SLOTS), clamp(tier() + rint(0, 1), 0, 6));
        G.armoury.push(it);
        return `They send ${itemName(it).toLowerCase()} that belonged to an uncle. It is in your armoury.`;
      }) },
      { label: () => 'In good words to their friends', run: c => onJob(c, J => { favor(J.patron, 6); J.edge += 0.05; return `They speak well of you where it counts. ${PATRONS[J.patron].name}: favour +6.`; }) },
    ],
  },
  crowd: {
    title: 'They know his face',
    can: J => J.kind === 'contract',
    make: J => fieldCtx(J),
    text: c => `A crowd has gathered where <b>${gn(c.g)}</b> is working and is shouting for him to show them something from the arena. His employer has not said he may.`,
    opts: [
      { label: () => 'Give them a show', run: c => onJob(c, (J, men, g) => {
        const f = 4 + 3 * tier(); G.fame += f; g.fame += f; g.morale = clamp(g.morale + 6, 0, 100);
        if (!g.traits.includes('showy') && chance(0.4)) { J.edge -= 0.2; return `${g.name} gives them the salute and six cuts at the air. The street roars; the employer is tight-lipped. Fame +${f}.`; }
        return `${g.name} gives them the salute and six cuts at the air, and bows to his employer after. Everyone is pleased. Fame +${f}.`;
      }) },
      { label: () => 'He keeps to his work', run: c => onJob(c, J => { J.edge += 0.06; return 'The crowd drifts off. The employer notices that he stayed where he was put.'; }) },
    ],
  },
};
// raised only for an outing; asked without one, they answer for the first that is under way
for (const id in FIELD_EVENTS) {
  const E = FIELD_EVENTS[id], can = E.can, make = E.make;
  Object.assign(E, { auto: true, field: true,
    can: J => { J = J || G.jobs[0]; return !!J && jobMen(J).length > 0 && can(J); },
    make: J => make(J || G.jobs[0]) });
}

// ---------- journeys of their own ----------
// A fighter asks for something that matters to him. Each ends at a place out in the province (see wilds.js),
// where the whole school must walk with him, and in a choice that is yours.
const QUESTS = {
  brother: { name: 'A brother in chains', finale: 'questBrother', where: 'the stone quarries, at the end of the north road',
    ask: g => `<b>${g.name}</b> was not taken alone. A trader from ${g.origin} has told him that his younger brother is alive, sold the same season, somewhere along the slave road. It can only be the stone quarries in the northern hills. He asks you to take him there.` },
  village: { name: 'The men who burned his village', finale: 'questVillage', where: 'the slavers\' camp, south-east on the road into the Blackmere',
    ask: g => `<b>${g.name}</b> has heard a name in the market: the captain of the slavers who burned his village in ${g.origin} and marched him away in a neck-chain. The man is in the province. He asks you to take the school there, and him with it.` },
  shrine: { name: 'A vow to his gods', finale: 'questShrine', where: 'the shrine on the shore, at the end of the south road',
    ask: g => `The night before he was first sent onto the sand, <b>${g.name}</b> swore that if he lived he would carry an offering to the shrine his people keep on the southern shore. He has lived. He asks you to take him there to pay what he owes.` },
  master: { name: 'The old master', finale: 'questMaster', where: 'the beekeeper\'s hut, off the north road',
    ask: g => `Every ${CLASSES[g.cls].name} has heard of the old champion who won the wooden sword thirty years ago and went up into the hills to keep bees. <b>${g.name}</b> believes he is still alive, and asks you to take him there to learn what the old man knows.` },
};

function endQuest(g, how) { g.quest = null; g.questDone = how; }

// What every finished journey leaves behind: a man who knows what you did for him.
function questReward(g, trait, story) {
  const Q = QUESTS[g.quest.id];
  if (trait && !g.traits.includes(trait)) g.traits.push(trait);
  g.grateful = true; g.morale = 100; g.xp += 3;
  addStory(g, story);
  log(`${g.name} has finished what he set out to do: ${Q.name}.`, 'gold');
  endQuest(g, g.quest.id);
  if (checkRank(g)) addStory(g, `Rose to the rank of ${RANKS[g.rank].name}.`);
}
const questMan = (c, fn) => { const g = byId(c.g); return g && g.quest ? fn(g) : 'He is no longer here to ask.'; };
const finaleCan = id => () => G.roster.some(g => g.quest && g.quest.id === id);
const finaleMake = id => () => ({ g: G.roster.find(g => g.quest && g.quest.id === id).id, cost: 80 + tier() * 70 });

function makeBrother(g) {
  const b = makeGladiator(Math.max(16, Math.round(statSum(g) * 0.7)));
  const origin = ORIGINS.find(o => o.name === g.origin) || ORIGINS[0];
  b.origin = g.origin; b.look = { skin: g.look.skin, hair: g.look.hair }; b.name = freshName(origin);
  b.morale = 90; b.grateful = true;
  welcome(b); G.roster.push(b);
  addStory(b, `Brother of ${g.name}. Brought out of the quarries and sworn to the same house.`);
  makeBond(g, b, 'friend');
  return b;
}

Object.assign(EVENTS, FIELD_EVENTS, {
  quest: {
    title: 'He asks to speak with you',
    auto: true,                      // offered on its own roll, so that it comes round often enough
    can: () => G.roster.some(questReady) && questsFree().length > 0,
    make: () => ({ g: pick(G.roster.filter(questReady)).id, q: pick(questsFree()) }),
    text: c => { const g = byId(c.g); return g ? QUESTS[c.q].ask(g) + ` That is ${QUESTS[c.q].where}: the whole school would have to march out with him, and miss whatever games fell while it was away.` : 'A fighter wants a word.'; },
    opts: [
      { label: () => 'Give your word', run: c => {
        const g = byId(c.g); if (!g) return 'The moment has passed.';
        g.quest = { id: c.q, since: G.day }; g.morale = clamp(g.morale + 10, 0, 100);
        wildMark(questPlace(c.q), 'journey');
        addStory(g, `Was promised his journey: ${QUESTS[c.q].name.toLowerCase()}.`);
        return `${g.name} takes you at your word. The place is marked on your map of the province: ${QUESTS[c.q].where}. Do not make him wait long.`;
      } },
      { label: () => 'Refuse', run: c => {
        const g = byId(c.g); if (g) { g.questDone = 'refused'; g.morale = clamp(g.morale - 12, 0, 100); addStory(g, `Asked leave of the house, and was refused.`); }
        return 'He nods as if he had expected nothing else, and goes back to the post.';
      } },
    ],
  },
  questBrother: {
    title: 'The quarry gate', auto: true, can: finaleCan('brother'), make: finaleMake('brother'),
    text: c => `The overseer will sell <b>${gn(c.g)}</b>'s brother for ${c.cost} denarii, which is three times what a quarry slave is worth, and he knows it. ${gn(c.g)} says there is a place where the wall is low.`,
    opts: [
      { label: c => `Buy him (${c.cost})`, ok: c => G.denarii >= c.cost && G.roster.length < capacity(), run: c => questMan(c, g => {
        G.denarii -= c.cost; const b = makeBrother(g);
        questReward(g, 'atpeace', 'Bought his brother out of the quarries with the house\'s silver.');
        return `${b.name} walks out of the quarry gate and does not look back. He has sworn the oath beside his brother; neither of them will forget who paid.`;
      }) },
      { label: () => 'Over the wall, by night', ok: () => G.roster.length < capacity(), run: c => questMan(c, g => {
        favor('magistrate', -8);
        if (chance(clamp(0.35 + g.stats.agi * 0.03, 0.35, 0.85))) {
          const b = makeBrother(g);
          questReward(g, 'atpeace', 'Took his brother over the quarry wall by night.');
          return `Two men come down the quarry road before dawn where one went up. ${b.name} joins the ludus. The Magistrate hears a slave was stolen, and can guess by whom. Favour -8.`;
        }
        fieldWound(g, rint(3, 5)); g.morale = clamp(g.morale - 20, 0, 100);
        addStory(g, 'Was caught at the quarry wall, and beaten for it.'); endQuest(g, 'failed');
        return `The dogs found them at the wall. ${g.name} was beaten and thrown out on the road; his brother was dragged back inside. The Magistrate has been told. Favour -8.`;
      }) },
      { label: () => 'Leave him there', run: c => questMan(c, g => {
        g.morale = clamp(g.morale - 25, 0, 100); addStory(g, 'Found his brother in the quarries, and was made to leave him.'); endQuest(g, 'failed');
        return `${g.name} is called home. He does as he is told. He does not speak of it.`;
      }) },
    ],
  },
  questVillage: {
    title: 'A rope round his neck', auto: true, can: finaleCan('village'), make: finaleMake('village'),
    text: c => `<b>${gn(c.g)}</b> has the slavers' captain on his knees in the ashes of the camp. The man is offering his strongbox, his horses, anything. ${gn(c.g)} has sent to ask what the house wants done with him.`,
    opts: [
      { label: () => 'He is yours. Finish it', run: c => questMan(c, g => {
        g.kills++; addScar(g, 'deep');
        questReward(g, 'bloodoath', 'Killed the man who burned his village.');
        return `${g.name} does it with the captain's own knife, and takes his time. He comes home lighter, and worse to meet across the sand.`;
      }) },
      { label: () => 'Bring him to the Magistrate in chains', run: c => questMan(c, g => {
        const f = 10 + 6 * tier(); G.fame += f; g.fame += f; favor('magistrate', 10);
        questReward(g, 'atpeace', 'Brought the man who burned his village to be crucified by the law.');
        return `The captain is nailed up at the crossroads with a placard, and ${g.name} stands and watches until it is over. The Magistrate is glad of the gift. Favour +10, fame +${f}.`;
      }) },
      { label: c => `Take the strongbox and let him run (+${c.cost * 2})`, run: c => questMan(c, g => {
        G.denarii += c.cost * 2; g.morale = clamp(g.morale - 30, 0, 100);
        addStory(g, 'Had the man who burned his village under his knife, and was told to take his money.'); endQuest(g, 'failed');
        return `The strongbox comes home. ${g.name} carried it the whole way and has not said a word to anyone since.`;
      }) },
    ],
  },
  questShrine: {
    title: 'What is owed', auto: true, can: finaleCan('shrine'), make: finaleMake('shrine'),
    text: c => `The priests have heard <b>${gn(c.g)}</b>'s vow and ask what will be given. A proper sacrifice in the name of the house would cost ${c.cost} denarii. Or he can give what is his own.`,
    opts: [
      { label: c => `A sacrifice in the house's name (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => questMan(c, g => {
        G.denarii -= c.cost; favor('temple', 12); home().forEach(x => { x.morale = clamp(x.morale + 5, 0, 100); });
        questReward(g, 'blessed', 'Paid his vow at the shrine, with a white bull in the house\'s name.');
        return `A white bull, gilded horns, smoke going straight up. Word of it reaches the Temple of Nemesis before ${g.name} does. Temple favour +12.`;
      }) },
      { label: () => 'His own offering: his hair, and his first sword', run: c => questMan(c, g => {
        questReward(g, 'atpeace', 'Paid his vow at the shrine with his hair and his first sword.');
        return `${g.name} leaves his hair on the altar and his first wooden sword beside it, and comes home with nothing weighing on him.`;
      }) },
    ],
  },
  questMaster: {
    title: 'The old man\'s price', auto: true, can: finaleCan('master'), make: finaleMake('master'),
    text: c => `The old master will teach <b>${gn(c.g)}</b> the last of what he knows. He wants ${c.cost} denarii for it, or a winter's firewood cut and stacked. Or, he says, looking at his leaking roof, he might be talked into coming down to see what passes for a ludus these days.`,
    opts: [
      { label: c => `Pay his fee (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => questMan(c, g => {
        G.denarii -= c.cost; g.stats.skl = Math.min(20, g.stats.skl + 2);
        questReward(g, 'oldschool', 'Learned the old style from the last man who knew it.');
        return `${g.name} comes home moving like a different man. Skill +2.`;
      }) },
      { label: () => 'He pays in firewood', run: c => questMan(c, g => {
        g.stats.skl = Math.min(20, g.stats.skl + 1); g.fatigue = 90;
        questReward(g, 'oldschool', 'Learned the old style, and paid for it with an axe.');
        return `A week of axe-work, then the lessons. ${g.name} comes home exhausted and better. Skill +1.`;
      }) },
      { label: c => `Bring the old man home as doctore (${c.cost * 2})`, ok: c => G.denarii >= c.cost * 2 && staffLvl('doctore') < 3, run: c => questMan(c, g => {
        G.denarii -= c.cost * 2; G.staff.doctore = { name: 'The old master', skill: 3, wage: 5 };
        questReward(g, 'oldschool', 'Brought the old master down from the hills to teach the whole house.');
        return `The old man arrives on a mule with two hives and a stick, looks round the yard, and spits. He is your doctore now, a master, at 5 denarii a day.`;
      }) },
    ],
  },
});

function questReady(g) { return !g.away && g.injury <= 0 && !g.quest && !g.questDone && (g.rank >= 1 || g.wins >= 3); }
function questsFree() { return Object.keys(QUESTS).filter(q => !G.roster.some(g => (g.quest && g.quest.id === q) || g.questDone === q)); }
