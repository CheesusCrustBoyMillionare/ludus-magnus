'use strict';
// Work and journeys away from the ludus: the patrons' contracts, what happens on the road,
// and the journeys of their own that fighters ask leave for.
//
// G.contracts  offers on the board, replaced every games day
// G.jobs       outings under way; each fighter on one carries g.away = the job's id
// G.reports    what came of an outing, waiting to be shown to the player
// g.quest      a fighter's own journey: { id, since, heard } and, where it ends at a landmark, { mark, x, y, tier }

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
    name: 'The goddess\'s procession', patron: 'temple', tier: 0, days: [1, 2], size: 1, danger: 0, pay: 0.6, fame: 2,
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
    name: 'A sculptor\'s model', patron: 'magistrate', tier: 1, days: [3, 4], size: 1, danger: 0, pay: 0.9, fame: 3, glory: true,
    w: { str: 0.5, agi: 0, end: 0.5, skl: 0 }, cls: [], likes: ['showy', 'laureate', 'ironhide'], hates: ['frail', 'nervous'],
    trait: null, events: ['insult', 'crowd', 'windfall'],
    text: () => 'The Magistrate is putting a bronze gladiator in the forum and his Greek sculptor wants a living one to work from: a man the town already knows, who can stand still for two days.',
    win: n => `The sculptor has what he needs. There will be a bronze in the forum with ${n}'s shoulders, and your house's name cut under it.`,
    fail: n => `The sculptor threw down his tools on the first afternoon. ${n}, he says, has the bearing of a mule-driver.`,
  },
  wedding: {
    name: 'Swords at a wedding', patron: 'magistrate', tier: 0, days: [1, 2], size: 2, danger: 0.15, pay: 0.9, fame: 2, glory: true,
    w: { str: 0, agi: 0.4, end: 0, skl: 0.6 }, cls: ['thraex', 'dimachaerus'], likes: ['showy', 'laureate', 'disciplined'], hates: ['brute', 'bloodthirsty'],
    trait: null, events: ['crowd', 'insult', 'windfall'],
    text: () => 'A councillor is marrying off his daughter and wants a bout between the courses: two men, blunted steel, a great deal of noise, and nobody hurt badly enough to spoil the dinner.',
    win: n => `${n} gave them a fight that looked like murder and ended in a bow. The bride's father sent wine to the ludus.`,
    fail: n => `${n} forgot it was a show. There was blood on the couches, and the bride's mother fainted into the fish.`,
  },
  pilgrims: {
    name: 'Pilgrims on the hill road', patron: 'temple', tier: 0, days: [3, 4], size: 2, danger: 0.35, pay: 0.9, travel: true,
    w: { str: 0.2, agi: 0.3, end: 0.5, skl: 0 }, cls: ['murmillo', 'hoplomachus'], likes: ['steady', 'tireless', 'watchful', 'blessed'], hates: ['bloodthirsty', 'lazy'],
    trait: 'blessed', events: ['ambush', 'homesick', 'windfall', 'wound'],
    text: c => `Forty pilgrims are walking to the hill shrine on the road to ${c.land}: old women, a blind man, children. The priests want two patient men to walk with them, and to carry what cannot walk.`,
    win: n => `Every pilgrim reached the shrine, and ${n} carried the blind man the last mile. The priests have heard of it.`,
    fail: n => `The pilgrims were robbed at a ford while ${n} argued over the road. They finished the journey barefoot.`,
  },
  treasury: {
    name: 'The temple treasury', patron: 'temple', tier: 0, days: [2, 3], size: 1, danger: 0.25, pay: 0.8,
    w: { str: 0, agi: 0.2, end: 0.3, skl: 0.5 }, cls: ['retiarius', 'murmillo'], likes: ['watchful', 'keen', 'steady', 'disciplined'], hates: ['lazy', 'nervous'],
    trait: 'watchful', events: ['bribe', 'dice', 'wound'],
    text: () => 'For the days of the festival the temple\'s doors stand open and its treasury is full. The priests want one man who will stand at the inner door and not be talked to, bought, or bored.',
    win: n => `${n} stood at the inner door through the whole festival. Three men tried it, and each went home with less than he came with.`,
    fail: n => `A votive of solid silver walked out of the treasury under ${n}'s nose, in a basket of loaves.`,
  },
  exhibition: {
    name: 'An exhibition in the next town', patron: 'guild', tier: 1, days: [3, 4], size: 2, danger: 0.3, pay: 1.1, fame: 3, travel: true, glory: true,
    w: { str: 0.3, agi: 0.3, end: 0, skl: 0.4 }, cls: [], likes: ['showy', 'laureate', 'quick'], hates: ['nervous', 'lazy'],
    trait: null, events: ['crowd', 'rivals', 'dice', 'windfall'],
    text: c => `A town on the road to ${c.land} has no school of its own and a fair coming. The Guild is selling it a day of games, and wants two of yours to be most of them.`,
    win: n => `${n} filled a wooden arena three days running. The Guild sold every seat twice, and your name went up the road with the carts.`,
    fail: n => `The crowd had seen better at a cock-fight, and said so. ${n} came home to a short purse and a long silence.`,
  },
  quarry: {
    name: 'Order at the quarry', patron: 'magistrate', tier: 1, days: [4, 6], size: 2, danger: 0.55, pay: 1.2,
    w: { str: 0.6, agi: 0, end: 0.4, skl: 0 }, cls: ['murmillo', 'hoplomachus'], likes: ['brute', 'ironhide', 'thickskin', 'steady'], hates: ['nervous', 'frail'],
    trait: null, anger: { temple: -2 }, events: ['bribe', 'wound', 'insult', 'homesick'],
    text: () => 'The convicts at the town\'s quarry have killed an overseer and are sitting on the stone. The Magistrate wants it settled before the garrison hears of it, by two men who are not squeamish. The priests call it butcher\'s work.',
    win: n => `${n} walked into the quarry at dawn and the stone was moving again by noon. Nobody asks how.`,
    fail: n => `The convicts had hammers and nothing to lose. ${n} came out of the quarry faster than they went in.`,
  },
  relic: {
    name: 'What was taken from the altar', patron: 'temple', tier: 1, days: [4, 5], size: 1, danger: 0.6, pay: 1.3, travel: true,
    w: { str: 0, agi: 0.4, end: 0.2, skl: 0.4 }, cls: ['thraex', 'retiarius'], likes: ['keen', 'quick', 'watchful', 'travelled'], hates: ['nervous', 'lazy'],
    trait: 'travelled', events: ['ambush', 'bribe', 'wound', 'windfall'],
    text: c => `Something has been taken from the altar of Nemesis. The priests will not say what, only that the thief went toward ${c.land}. They want one quick man to bring it back before anyone learns of it.`,
    win: n => `${n} came home with a bundle the priests would not unwrap in front of anyone. It is back on the altar, and nothing was ever missing.`,
    fail: n => `${n} followed the thief for three days and lost him at a river. The priests have stopped mentioning it, which is worse.`,
  },
  shipguard: {
    name: 'A hull for Massilia', patron: 'guild', tier: 2, days: [6, 8], size: 3, danger: 0.7, pay: 1.5, travel: true, scar: 'cut',
    w: { str: 0.3, agi: 0.4, end: 0.3, skl: 0 }, cls: ['retiarius', 'dimachaerus'], likes: ['tireless', 'ironlungs', 'killer', 'travelled'], hates: ['frail', 'nervous', 'lazy'],
    trait: 'travelled', events: ['ambush', 'dice', 'wound', 'homesick', 'rivals'],
    text: c => `The Guild has a hull loading oil and silver for the coast of ${c.land}, and that coast has pirates the way a dog has fleas. They want three men aboard who can fight on a moving deck.`,
    win: n => `Two galleys came out of a creek at dusk and went back into it short of men. ${n} brought the hull in with every jar unbroken.`,
    fail: n => `The pirates took the silver and left the oil. ${n} rowed home in the ship's boat.`,
  },
  drill: {
    name: 'Auxiliaries to drill', patron: 'magistrate', tier: 2, days: [5, 7], size: 2, danger: 0, pay: 1.1, fame: 2,
    w: { str: 0.3, agi: 0, end: 0, skl: 0.7 }, cls: ['murmillo', 'thraex'], likes: ['disciplined', 'drillmaster', 'steady', 'oldschool'], hates: ['lazy', 'embittered', 'brute'],
    trait: 'drillmaster', events: ['insult', 'crowd', 'windfall'],
    text: () => 'A cohort of raw auxiliaries is camped outside the walls, and their centurion has seen your men fight. He asks the Magistrate for two of them, for a week, to teach farm boys which end of a sword to hold.',
    win: n => `The cohort marched north in step, and its centurion says it is ${n}'s doing. The Magistrate was thanked by a legate, and remembers who earned it.`,
    fail: n => `${n} treated free soldiers like new slaves. On the third day the cohort refused to parade.`,
  },
  vintage: {
    name: 'The vintage watch', patron: 'guild', tier: 0, days: [3, 4], size: 2, danger: 0.3, pay: 0.9,
    w: { str: 0.4, agi: 0.2, end: 0.2, skl: 0.2 }, cls: ['murmillo', 'hoplomachus'], likes: ['watchful', 'steady', 'disciplined', 'tireless'], hates: ['lazy', 'nervous'],
    trait: 'watchful', events: ['bribe', 'dice', 'wound'],
    text: () => 'The grapes are in and the must is in the vats, and for four nights every thief in the district knows exactly where a year\'s money is standing. A Guild vintner wants two men who will stay awake and stay sober, which he admits is asking a good deal.',
    win: n => `Somebody tried the back wall on the second night and went home over it faster than he came. ${n} did not touch a drop until it was over.`,
    fail: n => `Six jars of the first pressing went out through a hole in the hedge while ${n} was asleep in the press-house. They had been sampling.`,
  },
  pyre: {
    name: 'Blood for a great man\'s pyre', patron: 'temple', tier: 1, days: [1, 2], size: 2, danger: 0.55, pay: 1.3, fame: 3, glory: true, scar: 'cut',
    w: { str: 0.3, agi: 0.2, end: 0, skl: 0.5 }, cls: ['thraex', 'murmillo', 'dimachaerus'], likes: ['showy', 'steady', 'blessed', 'duelist'], hates: ['nervous', 'embittered'],
    trait: 'blessed', events: ['crowd', 'insult', 'omen'],
    text: () => 'A man who was three times duumvir is to be burned at dusk, and his sons mean to do it in the old way: two pairs fighting beside the pyre, so that he does not go down with nothing. The priests want men who will give a death its due and not make a butcher\'s yard of it.',
    win: n => `${n} fought by firelight in front of the whole town standing silent, and when it was done the eldest son put a coin in each man's hand himself.`,
    fail: n => `It was clumsy, and long, and the widow turned her face away. ${n} came home by the back streets.`,
  },
  runaway: {
    name: 'A steward gone with the plate', patron: 'magistrate', tier: 1, days: [3, 5], size: 1, danger: 0.4, pay: 1.2, travel: true,
    w: { str: 0.2, agi: 0.4, end: 0.2, skl: 0.2 }, cls: ['retiarius', 'thraex'], likes: ['keen', 'travelled', 'tireless', 'watchful'], hates: ['lazy', 'brute'],
    trait: 'travelled', events: ['ambush', 'bribe', 'homesick'],
    text: c => `A magistrate's steward has gone off toward ${c.land} with the household silver and a kitchen girl. The household wants the silver, and wants it quietly; what becomes of the steward they leave to the man who finds him.`,
    win: n => `${n} found them at an inn two days out, the silver under the bed. It came home in a sack, and nobody in the town is any the wiser.`,
    fail: n => `${n} followed the wrong cart for two days. By now the silver is spoons in somebody else's house.`,
  },
  taxchest: {
    name: 'The tax chest', patron: 'magistrate', tier: 2, days: [4, 6], size: 3, danger: 0.65, pay: 1.4, travel: true, scar: 'cut',
    w: { str: 0.4, agi: 0.2, end: 0.2, skl: 0.2 }, cls: ['murmillo', 'hoplomachus'], likes: ['guarded', 'steady', 'disciplined', 'shieldmate', 'travelled'], hates: ['nervous', 'lazy', 'embittered'],
    trait: 'watchful', events: ['ambush', 'bribe', 'wound', 'rivals'],
    text: c => `A year's taxes for the district go to the coast by way of ${c.land}, in one chest, on one cart, and the soldiers who should carry it are away putting down a rising. The Magistrate will have three of your men walk beside it, and will hold their owner answerable for every coin.`,
    win: n => `They were tried twice on the road and once at an inn. ${n} delivered the chest with the seals whole, and the quaestor's receipt is on your table.`,
    fail: n => `The cart went into a ravine, the chest burst, and by the time ${n} had driven the hill-men off, a third of it was gone into the scrub.`,
  },
};

// The weights above were written when there were four skills. What was asked of endurance is asked of the
// others in proportion, so that each contract's weights still add up to one.
for (const k in CONTRACTS) {
  const w = CONTRACTS[k].w, rest = 1 - (w.end || 0);
  delete w.end;
  for (const s of STATS) w[s] = rest > 0 ? (w[s] || 0) / rest : 1 / STATS.length;
}

// The going rate: about a third of what the same men would win at the games over the same days. Work away from the
// sand keeps a school fed between games; it is not a way to grow rich, or great.
const JOB_RATE = 0.065;
// What work away from the sand is worth besides the money. It is a living, not a road to glory: a man learns far less
// on somebody's doorstep than at the post or in the arena, and the town talks of it far less than of a bout.
const JOB_XP = 1;                 // to each man who comes home from work done better than was asked (a bout won gives 5); nothing otherwise
const JOB_PROG = 0.08;            // of a day's training in the skill the work leans on, for each day away
const JOB_TRAIT = [0.12, 0.08];   // the chance a man comes home having learned the trade's trait: well suited to the work, or not
const JOB_WELL = 0.1;             // how much over the price is paid for work done better than asked
const contractFame = D => (D.fame ? Math.round(D.fame * (1 + tier() * 0.25)) : 0);
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

// What the town thinks of your house's work away from the sand: 0 to 100. Good service raises it, a failure or men
// called home lower it. A house with a name is paid more, and is offered more.
const WORK_NAMES = [[85, 'First choice'], [60, 'Sought after'], [35, 'Reliable'], [12, 'Tried'], [0, 'Unknown']];
const workRep = () => G.workRep || 0;
const workWord = r => WORK_NAMES.find(x => r >= x[0])[1];
const workPay = r => 1 + r * 0.002;
const workOffers = (t, r) => (t >= 2 ? 4 : 3) + (r >= 35 ? 1 : 0) + (r >= 85 ? 1 : 0);
function workMove(d) { G.workRep = clamp(workRep() + d, 0, 100); }
function makeContract(type, t) {
  const D = CONTRACTS[type], days = rint(D.days[0], D.days[1]), diff = rand(0.85, 1.3);
  return {
    id: ++G.nextId, type, patron: D.patron, days, size: D.size, diff, need: jobNeed(t, diff),
    land: D.travel ? pick(ORIGINS).name : null, asked: false,
    pay: round5(PURSE[t] * JOB_RATE * days * Math.pow(D.size, 0.85) * D.pay * (0.6 + 0.5 * diff) * workPay(workRep())),
    favor: 2 + Math.round(days / 3),
  };
}
// The terms men are sent on. Standard: paid on success. An advance: a third now, a third on success, and the rest
// forgone. Provisioned: a fifth of the pay spent on guides, mules and bribes, for a better chance. Hazard pay, on
// dangerous work only: three-tenths more, but the patron thinks the less of you for asking.
const TERMS = {
  standard: { name: 'Standard', what: 'Paid in full when the work is done well.' },
  advance: { name: 'An advance', what: 'A third of the pay now, a third when it is done, and the rest forgone. If it fails you keep what you had, and they think worse of you for it.' },
  provision: { name: 'Provisioned', what: 'A fifth of the pay spent now on guides, mules and bribes: the chance of success is 8 points better.' },
  hazard: { name: 'Hazard pay', what: 'Dangerous work only. Three-tenths more pay, half the favour, and one point of favour lost for asking.' },
};
function contractTerms(c, terms) {
  const D = CONTRACTS[c.type];
  if (terms === 'advance') { const third = round5(c.pay / 3); return { now: third, pay: third, favor: c.favor, edge: 0, cost: 0 }; }
  if (terms === 'provision') return { now: 0, pay: c.pay, favor: c.favor, edge: 0.08, cost: round5(c.pay * 0.2) };
  if (terms === 'hazard' && D.danger >= 0.5) return { now: 0, pay: round5(c.pay * 1.3), favor: Math.max(1, Math.round(c.favor / 2)), edge: 0, cost: 0, sour: 1 };
  return { now: 0, pay: c.pay, favor: c.favor, edge: 0, cost: 0 };
}
// Once between games a few coins in the right taverns turn up one more piece of work.
const askAroundCost = () => 20 + tier() * 15;
function askAroundBlock() {
  if (G.askedAround === dealCycle()) return 'You have asked around since the last games.';
  const t = tier();
  if (!Object.keys(CONTRACTS).some(k => CONTRACTS[k].tier <= t && !G.contracts.some(c => c.type === k) && !G.jobs.some(J => J.type === k))) return 'There is no other work to be had.';
  if (G.denarii < askAroundCost()) return `You are ${askAroundCost() - G.denarii} denarii short.`;
  return '';
}
function askAround() {
  if (askAroundBlock()) return null;
  const t = tier(), types = Object.keys(CONTRACTS).filter(k => CONTRACTS[k].tier <= t && !G.contracts.some(c => c.type === k) && !G.jobs.some(J => J.type === k));
  G.denarii -= askAroundCost(); G.askedAround = dealCycle();
  const c = makeContract(pick(types), t); G.contracts.push(c);
  return c;
}

function genContracts() {
  const t = tier();
  for (const c of (G.contracts || [])) {
    if (!c.asked) continue;
    favor(c.patron, -3);
    log(`${PATRONS[c.patron].name} asked a service of you, and you did not give it. Favour -3.`, 'bad');
  }
  const types = Object.keys(CONTRACTS).filter(k => CONTRACTS[k].tier <= t).sort(() => Math.random() - 0.5).slice(0, workOffers(t, workRep()));
  G.contracts = types.map(type => makeContract(type, t));
  // a patron who thinks well of you sometimes asks for you by name: worth more, and costly to ignore
  const friend = Object.keys(G.patrons).filter(k => G.patrons[k] >= 35 && G.contracts.some(c => c.patron === k));
  if (friend.length && chance(0.5)) {
    const c = pick(G.contracts.filter(x => friend.includes(x.patron)));
    c.asked = true; c.favor = Math.round(c.favor * 1.5);
  }
}

// One event on the road, somewhere in the middle of the work.
function planEvent(J, D, days) {
  J.eventDay = days >= 2 && (D.events || []).length && chance(0.4) ? G.day + rint(1, days - 1) : 0;      // most work passes without a word from the road
}

function sendContract(cid, ids, terms) {
  const c = (G.contracts || []).find(x => x.id === +cid);
  const men = [...new Set(ids.map(Number))].map(byId);
  if (!c || men.length !== c.size || !men.every(canSend)) return false;
  const D = CONTRACTS[c.type], T = contractTerms(c, terms);
  if (T.cost > G.denarii) return false;
  G.denarii += T.now - T.cost; if (T.sour) favor(c.patron, -1);
  const J = { id: ++G.nextId, kind: 'contract', type: c.type, ids: men.map(g => g.id), start: G.day, end: G.day + c.days,
    need: c.need, land: c.land, pay: T.pay, favor: T.favor, patron: c.patron, asked: c.asked, edge: T.edge, terms: TERMS[terms] && !(terms === 'hazard' && !T.sour) ? terms : 'standard' };
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
  const roll = Math.random(), win = !J.abandon && roll < p;
  const well = win && roll < Math.min(p, 0.95) - 0.5;            // men well suited to it sometimes do better than was asked
  const half = !win && !J.abandon && roll < p + 0.12;            // and a near thing is not a whole failure
  const top = STATS.slice().sort((a, b) => (D.w[b] || 0) - (D.w[a] || 0))[0];
  const days = Math.max(1, J.end - J.start);
  let back = [];

  for (const g of all) {
    if (J.flight === g.id || (flightRisk(g) && chance(g.traits.includes('embittered') ? 0.35 : 0.25))) {
      lines.push(`<span class="bad"><b>${g.name}</b> slipped away on the road and has not been seen since. His kit went with him.</span>`);
      deserts(g);
      continue;
    }
    if (!J.abandon && D.danger > 0 && chance(D.danger * (win ? 0.28 : 0.6))) {
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
    g.fatigue = clamp(Math.max(g.fatigue * 0.5, 38 + 45 * D.danger), 0, 100);
    g.morale = clamp(g.morale + (J.abandon ? -4 : win ? 6 : -6), g.traits.includes('atpeace') ? 60 : 0, 100);
    if (!J.abandon) {
      if (well) g.xp += JOB_XP;
      addProg(g, top, JOB_PROG * days * g.pot[top]);
    }
  }

  if (J.abandon) {
    lines.unshift(`${names} ${all.length > 1 ? 'were' : 'was'} called home before the work was done.`);
    if (!quest) { favor(J.patron, -3); workMove(-4); lines.push(`${PATRONS[J.patron].name} is not pleased. Favour -3.`); }
  } else {
    lines.unshift((win ? D.win : D.fail)(names, J));
    if (win) {
      if (well) { const more = Math.max(5, round5(J.pay * JOB_WELL)); J.pay += more; J.favor += 1; lines.push(`<span class="gold">It was better done than was asked, and the employer says so with ${more} denarii over the price.</span>`); }
      G.denarii += J.pay; favor(J.patron, J.favor); workMove((J.asked ? 6 : 4) + (well ? 1 : 0));
      let gain = `<b class="gold">+${J.pay} denarii.</b> ${PATRONS[J.patron].name}: favour +${J.favor}.`;
      if (D.fame) { const f = contractFame(D); G.fame += f; back.forEach(g => { g.fame += Math.round(f / back.length); }); gain += ` Fame +${f}.`; }
      for (const k in (D.anger || {})) { favor(k, D.anger[k]); gain += ` ${PATRONS[k].name}: favour ${D.anger[k]}.`; }
      lines.push(gain);
      if (D.feud) { const H = pick(G.houses); feud(H, D.feud); lines.push(`<span class="dim">${houseDef(H.id).name} had a man in the same pit, and will remember who beat him.</span>`); }
      for (const g of back) {
        addStory(g, `Did good service on contract: ${D.name}.`);
        if (D.trait && !g.traits.includes(D.trait) && chance(p >= 0.75 ? JOB_TRAIT[0] : JOB_TRAIT[1])) {
          g.traits.push(D.trait); addStory(g, `Learned: ${TRAITS[D.trait].name}.`);
          lines.push(`<span class="gold"><b>${g.name}</b> has learned something out there: ${TRAITS[D.trait].name}.</span> <span class="dim">${TRAITS[D.trait].desc}</span>`);
        }
      }
      log(`${names} ${back.length === 1 ? 'returns' : 'return'} from contract (${D.name}): ${J.pay} denarii.`, 'good');
    } else if (half) {
      const part = round5(J.pay * 0.5);
      G.denarii += part; workMove(-2);
      lines.push(`It was not all lost. ${PATRONS[J.patron].name} pays half, <b class="gold">${part} denarii</b>, and says no more about it: no favour gained, and none lost.`);
      back.forEach(g => addStory(g, `Half did the work on contract: ${D.name}.`));
      log(`${names} ${back.length === 1 ? 'returns' : 'return'} from contract (${D.name}) with half the pay: ${part} denarii.`);
    } else {
      const loss = (J.asked || J.bribed ? 6 : 4) + (J.terms === 'advance' ? 2 : 0);
      favor(J.patron, -loss); workMove(-6);
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
      const id = fieldEventFor(J);
      if (id) { G.fieldSeen = (G.fieldSeen || []).concat(id).slice(-FIELD_MEMORY); G.fieldLast = G.day; raiseEvent(id, FIELD_EVENTS[id].make(J)); }
    }
  }
  if (!isGamesDay() && chance(0.07) && EVENTS.quest.can()) raiseEvent('quest', EVENTS.quest.make());
}

// Which matter, if any, comes up from this outing today. Word from the road never comes two days running, however many
// are away; and nothing that has come up lately comes up again until a good many other things have.
const FIELD_GAP = 3, FIELD_MEMORY = 8;
function fieldEventFor(J) {
  if (G.fieldLast && G.day - G.fieldLast < FIELD_GAP) return null;
  const D = jobDef(J), seen = G.fieldSeen || [];
  const ids = (D.events || []).concat(Object.keys(FIELD_EVENTS).filter(id => FIELD_EVENTS[id].fits && FIELD_EVENTS[id].fits(D)))
    .filter((id, i, all) => all.indexOf(id) === i && !seen.includes(id) && FIELD_EVENTS[id].can(J));
  return ids.length ? pick(ids) : null;
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
          J.edge += 0.1; men.forEach(x => { x.morale = clamp(x.morale + 5, 0, 100); });
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
          men.forEach(x => { x.xp++; x.morale = clamp(x.morale + 8, 0, 100); });
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
        const f = 2 + tier(); G.fame += f; g.fame += f; g.morale = clamp(g.morale + 6, 0, 100);
        if (!g.traits.includes('showy') && chance(0.4)) { J.edge -= 0.2; return `${g.name} gives them the salute and six cuts at the air. The street roars; the employer is tight-lipped. Fame +${f}.`; }
        return `${g.name} gives them the salute and six cuts at the air, and bows to his employer after. Everyone is pleased. Fame +${f}.`;
      }) },
      { label: () => 'He keeps to his work', run: c => onJob(c, J => { J.edge += 0.06; return 'The crowd drifts off. The employer notices that he stayed where he was put.'; }) },
    ],
  },
  // ---- more from the road. These are not tied to one kind of work: `fits` says which kinds they can come up on. ----
  shortpay: {
    title: 'A light purse', fits: () => true,
    can: J => J.kind === 'contract' && J.pay > 0,
    make: J => fieldCtx(J),
    text: c => `The employer has let <b>${gn(c.g)}</b> know that money is tight this month, and that part of what was agreed might be paid in wine: good wine, he says. ${gn(c.g)} asks whether the house takes wine.`,
    opts: [
      { label: () => 'Coin, as agreed', run: c => onJob(c, J => { favor(J.patron, -1); return `It will be coin. The employer pays as a man pays who has been made to. ${PATRONS[J.patron].name}: favour -1.`; }) },
      { label: () => 'Take the wine for a fifth of it', run: c => onJob(c, (J, men) => { J.pay = round5(J.pay * 0.8); men.forEach(x => evMor(x, 8)); home().forEach(x => evMor(x, 3)); return `Four amphorae come home on a cart. The pay will be ${J.pay} denarii, and there is not a sour face in the barracks.`; }) },
      { label: () => 'Let him argue it out himself', run: c => onJob(c, (J, men, g) => {
        if (chance(clamp(0.3 + g.stats.skl * 0.025, 0.3, 0.8))) { J.pay = round5(J.pay * 1.1); return `${g.name} says very little, and stands rather close while he says it. The pay will be ${J.pay} denarii, in coin.`; }
        J.edge -= 0.12; return `${g.name} is a better swordsman than he is a bargainer. Nothing is changed but the employer's temper.`;
      }) },
    ],
  },
  sickness: {
    title: 'Bad water', fits: D => !!D.travel,
    can: () => true,
    make: J => fieldCtx(J, { cost: 20 + tier() * 15 }),
    text: c => `<b>${jn(jobById(c.job))}</b> drank from a well that the local people have more sense than to use, and ${jobMen(jobById(c.job) || { ids: [] }).length > 1 ? 'have' : 'has'} been paying for it since midnight. A woman in the village sells a cure for ${c.cost} denarii.`,
    opts: [
      { label: c => `Buy the cure (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => onJob(c, () => { G.denarii -= c.cost; return 'It is mostly charcoal and mint. By noon they are on the road again, pale and uncomplaining.'; }) },
      { label: () => 'Lie up a day', run: c => onJob(c, (J, men) => { J.end++; men.forEach(x => { x.fatigue = clamp(x.fatigue - 10, 0, 100); }); return 'A day in a barn with a bucket. They will be home a day later than agreed.'; }) },
      { label: () => 'They march as they are', run: c => onJob(c, (J, men) => { J.edge -= 0.1; men.forEach(x => { x.fatigue = clamp(x.fatigue + 20, 0, 100); evMor(x, -5); }); return 'They march, stopping often. The work will get what is left of them.'; }) },
    ],
  },
  stranger: {
    title: 'A man going the same way', fits: D => !!D.travel,
    can: () => true,
    make: J => fieldCtx(J, { stake: 15 + tier() * 15 }),
    text: c => `A lean man with a soldier's walk has fallen in beside <b>${jn(jobById(c.job))}</b> and asks to keep company as far as the next town. He is good talk, and he looks at the baggage a little too often.`,
    opts: [
      { label: () => 'He is welcome', run: c => onJob(c, (J, men) => {
        if (chance(0.6)) { J.edge += 0.06; men.forEach(x => evMor(x, 3)); return 'He was twenty years with the legions, knows every mile of this road, and shows them a trick with a shield rim before he goes his way.'; }
        G.denarii -= c.stake; return `He is gone before dawn, and so is ${c.stake} denarii of the travelling money.`;
      }) },
      { label: () => 'He walks alone', run: c => onJob(c, () => 'He shrugs and drops back. Nobody will ever know which kind he was.') },
    ],
  },
  sidebout: {
    title: 'A private wager', fits: D => D.danger > 0 || !!D.glory,
    can: J => J.kind === 'contract',
    make: J => fieldCtx(J, { pay: 40 + tier() * 35 }),
    text: c => `A man with rings on his thumbs has seen <b>${gn(c.g)}</b> and wants him to fight his cook's son tonight, in a courtyard, for ${c.pay} denarii to the winner. The cook's son is said to be very large.`,
    opts: [
      { label: () => 'Let him fight', run: c => onJob(c, (J, men, g) => {
        if (chance(clamp(0.4 + statSum(g) / (ENEMY_BUDGET[tier()] * 2.2) * 0.4, 0.35, 0.85))) { G.denarii += c.pay; g.xp++; evMor(g, 8); return `The cook's son was very large and very slow. <b>${c.pay}</b> denarii come home, and ${g.name} has a story.`; }
        J.edge -= 0.1; fieldWound(g, rint(2, 3)); return `The cook's son had done this before. ${g.name} will do the rest of his work with one eye shut.`;
      }) },
      { label: () => 'He is there to work', run: c => onJob(c, (J, men, g) => { J.edge += 0.05; evMor(g, -3); return `${g.name} sends his regrets. His employer hears that he did, and approves.`; }) },
    ],
  },
  admirer: {
    title: 'A letter, scented', fits: D => !D.travel,
    can: J => J.kind === 'contract',
    make: J => fieldCtx(J, { gift: 25 + tier() * 25 }),
    text: c => `Somebody in the employer's household has been leaving figs, and now a letter, where <b>${gn(c.g)}</b> will find them. He cannot read it. He has a fair idea what it says.`,
    opts: [
      { label: () => 'He is to find it has all been a mistake', run: c => onJob(c, (J, men, g) => { J.edge += 0.05; evMor(g, -5); return `${g.name} returns the letter unopened, by way of the steward, which is the safest insult there is.`; }) },
      { label: () => 'What he does after dark is his own affair', run: c => onJob(c, (J, men, g) => {
        if (chance(0.6)) { G.denarii += c.gift; evMor(g, 12); return `Nothing is ever said. ${g.name} comes off duty whistling, and a purse of ${c.gift} denarii reaches the house from a hand nobody names.`; }
        J.edge -= 0.3; favor(J.patron, -3); return `It is the employer's wife, and the employer is not a fool. ${PATRONS[J.patron].name}: favour -3.`;
      }) },
    ],
  },
  thief: {
    title: 'A hand in the baggage', fits: () => true,
    can: () => true,
    make: J => fieldCtx(J),
    text: c => `<b>${gn(c.g)}</b> woke with a hand in his pack and has the owner of it by the wrist: a boy of ten or so, all ribs, who has not made a sound.`,
    opts: [
      { label: () => 'Give him to the watch', run: c => onJob(c, () => { favor('magistrate', 2); return 'The watch are glad of somebody to be seen catching. The Magistrate: favour +2.'; }) },
      { label: () => 'A clip round the ear, and let him run', run: c => onJob(c, () => 'He runs. He will try an easier pack tomorrow.') },
      { label: () => 'Feed him', run: c => onJob(c, (J, men, g) => {
        evMor(g, 5);
        if (chance(0.35)) { J.edge += 0.1; return `He eats like a dog, watching the door. Then he tells ${g.name} who in this town is asking about him, and why. It is worth knowing.`; }
        return `He eats like a dog, watching the door, and is gone with the bread that was left. ${g.name} seems the better for it.`;
      }) },
    ],
  },
  washout: {
    title: 'The bridge is down', fits: D => !!D.travel,
    can: () => true,
    make: J => fieldCtx(J, { cost: 15 + tier() * 15 }),
    text: c => `Three days of rain in the hills, and the bridge <b>${jn(jobById(c.job))}</b> meant to cross is somewhere downstream. A man with a flat boat will take them over for ${c.cost} denarii, which is robbery.`,
    opts: [
      { label: c => `Pay the boatman (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => onJob(c, () => { G.denarii -= c.cost; return 'He poles them across, singing. It is a good boat.'; }) },
      { label: () => 'Ford it higher up', run: c => onJob(c, (J, men, g) => {
        if (chance(clamp(0.35 + g.stats.agi * 0.03, 0.35, 0.85))) { men.forEach(x => { x.fatigue = clamp(x.fatigue + 10, 0, 100); }); return 'Chest-deep and very cold, with the packs held overhead. They are across, and no time lost.'; }
        J.edge -= 0.08; fieldWound(g, rint(1, 3)); return `The river took ${g.name}'s feet from under him and put him against a rock. He is across, and the worse for it.`;
      }) },
      { label: () => 'Wait for the water to fall', run: c => onJob(c, J => { J.end++; return 'A day watching brown water. They will be home a day later than agreed.'; }) },
    ],
  },
  oldfoe: {
    title: 'A face from the sand', fits: () => true,
    can: () => true,
    make: J => fieldCtx(J),
    text: c => `The man who keeps the tavern nearest the work has a wooden sword over his door and knows <b>${gn(c.g)}</b> by sight: he fought in this province for eleven years. He has put a jug on the table and pulled out a stool.`,
    opts: [
      { label: () => 'Sit down with him', run: c => onJob(c, (J, men, g) => { g.xp++; evMor(g, 6); men.forEach(x => { x.fatigue = clamp(x.fatigue + 8, 0, 100); }); return `It goes on until the lamp is out. ${g.name} comes away with a sore head and two things about footwork he had never been told.`; }) },
      { label: () => 'Another time', run: c => onJob(c, J => { J.edge += 0.05; return 'The old man nods: he remembers what it was to be on somebody else\'s time.'; }) },
    ],
  },
  omen: {
    title: 'A bad sign', fits: () => true,
    can: () => true,
    make: J => fieldCtx(J, { cost: 10 + tier() * 5 }),
    text: c => `An owl sat on the roof-tree all day in full sun, where <b>${jn(jobById(c.job))}</b> could not help but see it. Nothing has been said. A good deal is being thought.`,
    opts: [
      { label: c => `A cock to the household gods (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => onJob(c, (J, men) => { G.denarii -= c.cost; men.forEach(x => evMor(x, 6)); return 'The blood goes on the threshold and the bird goes in the pot. Everybody feels a great deal better.'; }) },
      { label: () => 'It is a bird', run: c => onJob(c, (J, men) => {
        if (men.some(x => x.traits.includes('blessed')) || chance(0.55)) return 'It is a bird. By evening it has gone, and nothing has happened to anybody.';
        J.edge -= 0.06; men.forEach(x => evMor(x, -8)); return 'It is a bird; but they do the rest of the work looking over their shoulders.';
      }) },
    ],
  },
  staylonger: {
    title: 'Two days more', fits: D => !D.travel,
    can: J => J.kind === 'contract' && J.pay > 0,
    make: J => fieldCtx(J, { more: round5(Math.max(15, (jobById(J.id) || J).pay * 0.35)) }),
    text: c => `The employer is pleased with <b>${jn(jobById(c.job))}</b>, and asks to keep ${jobMen(jobById(c.job) || { ids: [] }).length > 1 ? 'them' : 'him'} two days beyond what was agreed, for ${c.more} denarii more.`,
    opts: [
      { label: c => `Two days more (+${c.more})`, run: c => onJob(c, J => { J.end += 2; J.pay += c.more; return `It is agreed. They will be home two days later, and the pay will be ${J.pay} denarii.`; }) },
      { label: () => 'They are wanted at home', run: c => onJob(c, () => 'The employer is sorry, and says so civilly.') },
    ],
  },
  brawl: {
    title: 'Words in the street', fits: D => D.danger > 0,
    can: () => true,
    make: J => fieldCtx(J),
    text: c => `Some young men of the town, with wine in them, have decided that <b>${gn(c.g)}</b> does not look so much, and have said so across the width of the street. There are five of them.`,
    opts: [
      { label: () => 'He walks on', run: c => onJob(c, (J, men, g) => { evMor(g, -4); return `${g.name} walks on. It is harder than fighting, and he says so afterwards.`; }) },
      { label: () => 'He may teach them better', run: c => onJob(c, (J, men, g) => {
        const f = 1 + tier();
        if (chance(0.7)) { G.fame += f; g.fame += f; evMor(g, 8); return `It takes about as long as it takes to say. Nobody is badly hurt, and the town talks of nothing else. Fame +${f}.`; }
        favor('magistrate', -3); J.edge -= 0.1; return 'One of them is the son of a town councillor, and has a broken jaw. The Magistrate hears of it: favour -3.';
      }) },
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
  // These four end at one of the landmarks of the province, chosen when he asks. A place of that kind is always to be found.
  grave: { name: 'A friend left on the road', finale: 'questGrave', where: 'a place out in the province', marks: ['An old battlefield', 'The gallows', 'A burnt village', 'The causeway'],
    ask: (g, m) => `<b>${g.name}</b> came into this province in a coffle of forty. The man chained next to him, who shared his water for two hundred miles, died on the march and was rolled into a ditch by ${lower(m)}. He knows the spot. He asks you to take him there, to do what should have been done.`,
    at: g => `<b>${g.name}</b> walks straight to it, as if he had been here yesterday: a ditch, a thorn bush, and what the foxes have left. He asks for a spade, and for the day.`,
    after: g => `${g.name} digs alone, and will not be helped. By evening it is done, all but the last of it.`,
    fire: g => `"He was a potter. He talked the whole way about a kiln he was going to build. I never learned what his people do for their dead, so I shall have to guess."` },
  beast: { name: 'The beast that marked him', finale: 'questBeast', where: 'a place out in the province', marks: ['The eagle rock', 'The wolf stone', "The giant's table", 'The great waterfall', 'The hot spring'], bg: 'rock',
    foes: (g, t) => [questBeast(greatKind(Math.max(3, t)), t, 'The one that marked him', 1.5)].concat(lesser('wolf', t, 1 + Math.floor(t / 2))),
    ask: (g, m) => `<b>${g.name}</b> has four white lines across his ribs that no arena gave him. He was a boy with his father's goats when it came, and his father did not come home. A hunter in the market swears the same animal, old now and with the same torn ear, lies up at ${lower(m)}. He asks you to take the school there, and him with it.`,
    at: g => `The ground is all bones and droppings, and something very large is watching from the rocks with one torn ear laid back. <b>${g.name}</b> has gone white, and has not stopped walking.`,
    won: g => `It is dead. ${g.name} sits down beside it and puts his hand on the torn ear, and for a long time nobody speaks to him.`,
    fire: g => `"I ran. I was nine, and I ran, and I heard him the whole way down the hill. I have not run from anything since. That is all the courage I have: it is only that."` },
  child: { name: 'A child he has never seen', finale: 'questChild', where: 'a place out in the province', marks: ["The fishers' huts", 'The mill', 'The huts on stilts', "The shepherds' fold", 'The bee garden', 'The charcoal burners'],
    ask: (g, m) => `A carter has brought <b>${g.name}</b> a message scratched on a potsherd. The woman he was taken from is alive, at ${lower(m)}, and there is a child of four with his eyes. He asks you to take the school that way, and to let him stand at the door once.`,
    at: g => `A woman is hanging out washing, and stops with her arms up. A small child looks round her skirt at the armed men, and then at <b>${g.name}</b>, who has taken off his helmet and does not seem to know what to do with it.`,
    after: g => `The school camps out of sight. ${g.name} comes back after dark and asks to speak with you about money.`,
    fire: g => `"I do not know if it is a boy or a girl. The potsherd did not say. I have been carving a horse, and now I think: what if she does not like horses?"` },
  betrayer: { name: 'The man who sold him', finale: 'questBetrayer', where: 'a place out in the province', marks: ['A villa in its garden', 'The wine press', 'The mill', 'The lime kiln'], bg: 'ruin',
    foes: (g, t) => [questBoss(t, "His cousin's captain", { traits: ['watchful'], tactic: 'defensive' })].concat(wildMen(t, Math.max(2, wildCount(t) - 2))),
    ask: (g, m) => `<b>${g.name}</b> was not taken in war. He was sold, for a debt that was not his, by a cousin who put his seal to the bill and kept the farm. The cousin has done well since: he has a place at ${lower(m)} now, and hired men on the gate. ${g.name} asks you to take him to that gate.`,
    at: g => `A good wall, a new roof, and hired men on the gate who have been told to expect somebody. A face shows at an upper window and is gone. <b>${g.name}</b> says, quite quietly, that it has put on weight.`,
    won: g => `The hired men are down or over the wall. The cousin is found under a bed.`,
    fire: g => `"We were boys together. He taught me to swim. I have gone over it a thousand times, and I still cannot find the day he began to hate me. Perhaps he never did. Perhaps it was only the money."` },
};
// what the first four say at the fire
Object.assign(QUESTS.brother, { fire: g => `"He is the clever one. He could reckon before he could walk. They will have him breaking stone, with those hands. If he is alive he will have counted every day."` });
Object.assign(QUESTS.village, { fire: g => `"He had a ring on every finger and he laughed the whole time. I would know that laugh in the dark. I have been afraid, all these years, that somebody else would kill him first."` });
Object.assign(QUESTS.shrine, { fire: g => `"I did not think the god was listening. I said it the way you say anything, the night before. Then I lived, and the man beside me did not, and now I do not like to walk under a clear sky."` });
Object.assign(QUESTS.master, { fire: g => `"They say he never lost his footing once in forty fights. I lose mine twice a morning. If he will not teach me I shall sit outside his door until he does, and you may come and fetch me in the spring."` });

const questDef = g => (g && g.quest && QUESTS[g.quest.id]) || null;
// Where his journey ends, in words: a fixed place, or the landmark that was named when he asked.
function questWhere(g) { const Q = questDef(g); return !Q ? '' : Q.marks && g.quest.mark ? `${lower(g.quest.mark)}, in ${wildRegion(g.quest.x, g.quest.y)}` : Q.where; }
const questMarkId = g => (QUESTS[g.quest.id].marks ? 'j' + g.id : questPlace(g.quest.id));
// A landmark for a journey of this kind: one about as dangerous as the school can bear, where there will be a fight.
function questSpot(q) {
  const Q = QUESTS[q], spots = (Q.marks || []).map(m => ({ m, p: landmarkAt(m) })).filter(o => o.p).map(o => Object.assign(o, { t: clamp(wildTier(o.p.x, o.p.y), 1, 5) }));
  if (!spots.length) return null;
  const aim = clamp(tier() + 1, 1, 5), near = Math.min(...spots.map(o => Math.abs(o.t - aim))), o = pick(spots.filter(x => Math.abs(x.t - aim) === near));
  return { mark: o.m, x: o.p.x, y: o.p.y, tier: o.t };
}
// The places such journeys make on the map, for as long as they are promised.
const journeySites = () => G.roster.filter(g => questDef(g) && questDef(g).marks && g.quest.x != null)
  .map(g => ({ id: 'j' + g.id, kind: 'errand_journey', x: g.quest.x, y: g.quest.y, tier: questDef(g).foes ? g.quest.tier : 0, name: questDef(g).name, fixed: true, journey: g.id }));

function endQuest(g, how) { if (typeof wildMap === 'function' && G.dynasty) delete wildMap().marks['j' + g.id]; g.quest = null; g.questDone = how; }

// What every finished journey leaves behind: a man who knows what you did for him.
function questReward(g, trait, story) {
  const Q = QUESTS[g.quest.id];
  if (trait && !g.traits.includes(trait)) g.traits.push(trait);
  g.grateful = true; g.morale = 100; g.xp += 3;
  home().forEach(x => { if (x !== g) x.morale = clamp(x.morale + 3, 0, 100); });      // the others have watched to see whether the house keeps its word
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
    make: () => { const q = pick(questsFree()), sp = QUESTS[q].marks ? questSpot(q) : null; return Object.assign({ g: pick(G.roster.filter(questReady)).id, q }, sp || {}); },
    text: c => { const g = byId(c.g), Q = QUESTS[c.q]; return g ? Q.ask(g, c.mark || 'a place you know') + ` That is ${Q.marks && c.mark ? `${lower(c.mark)}, in ${wildRegion(c.x, c.y)}` : Q.where}: the whole school would have to march out with him, and miss whatever games fell while it was away.` : 'A fighter wants a word.'; },
    opts: [
      { label: () => 'Give your word', run: c => {
        const g = byId(c.g); if (!g) return 'The moment has passed.';
        g.quest = { id: c.q, since: G.day }; g.morale = clamp(g.morale + 10, 0, 100);
        if (QUESTS[c.q].marks) { const sp = c.mark ? c : questSpot(c.q); if (!sp) { g.quest = null; return 'Nobody can say where the place is. It will have to wait.'; } Object.assign(g.quest, { mark: sp.mark, x: sp.x, y: sp.y, tier: sp.tier }); }
        wildMark(questMarkId(g), 'journey');
        addStory(g, `Was promised his journey: ${QUESTS[c.q].name.toLowerCase()}.`);
        return `${g.name} takes you at your word. The place is marked on your map of the province: ${questWhere(g)}. Do not make him wait long.`;
      } },
      { label: () => 'Not this season. Ask me again', run: c => {
        const g = byId(c.g); if (!g) return 'The moment has passed.';
        g.questAsk = G.day + 20; g.morale = clamp(g.morale - 3, 0, 100);
        return `${g.name} looks at you a moment, to see whether it is a no. He decides it is not, and goes back to the post. He will ask again.`;
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
  questGrave: {
    title: 'The last of it', auto: true, can: finaleCan('grave'), make: finaleMake('grave'),
    text: c => `The grave is dug and filled. <b>${gn(c.g)}</b> stands over it with the dead man's neck-chain in his hand, which he found in the ditch, and asks how the house would have it ended. Proper funeral games, with a bout fought over the grave, would cost ${c.cost} denarii.`,
    opts: [
      { label: c => `Funeral games in the house's name (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => questMan(c, g => {
        const f = 8 + 5 * tier(); G.denarii -= c.cost; G.fame += f; g.fame += f; home().forEach(x => { x.morale = clamp(x.morale + 6, 0, 100); });
        questReward(g, 'atpeace', 'Buried the man he was chained to, with funeral games in the house\'s name.');
        return `A pyre, a bout to first blood, wine for forty. The farms for miles round come to watch a potter buried like a senator. ${g.name} fights the bout himself, and wins it. Fame +${f}.`;
      }) },
      { label: () => 'A coin, a handful of earth, and his name said aloud', run: c => questMan(c, g => {
        questReward(g, 'atpeace', 'Buried the man he was chained to, and said his name over him.');
        return `${g.name} says the name three times, as his own people do, and puts the chain in with him. He walks back to the column without looking round.`;
      }) },
      { label: () => 'He keeps the chain, and fights for two', run: c => questMan(c, g => {
        questReward(g, 'twoshares', 'Buried the man he was chained to, and kept the chain.');
        return `${g.name} winds the chain twice round his sword wrist and has the smith close it. He says the potter can see the arena from there.`;
      }) },
    ],
  },
  questBeast: {
    title: 'Its hide', auto: true, can: finaleCan('beast'), make: finaleMake('beast'),
    text: c => `The beast that marked <b>${gn(c.g)}</b> is skinned, and the hide is the largest your men have seen. A dealer would give ${c.cost} denarii for it and the skull. ${gn(c.g)} has not asked for it. He is waiting to hear.`,
    opts: [
      { label: () => 'It is his. He wears it onto the sand', run: c => questMan(c, g => {
        const f = 6 + 4 * tier(); G.fame += f; g.fame += f;
        questReward(g, 'beastslayer', 'Killed the beast that marked him as a boy, and wears its hide.');
        return `${g.name} goes into the arena with the torn ear hanging over his shoulder, and the crowd is told why. Fame +${f}.`;
      }) },
      { label: () => 'Hang it in the temple of Nemesis', run: c => questMan(c, g => {
        favor('temple', 8);
        questReward(g, 'blessed', 'Killed the beast that marked him as a boy, and gave its hide to Nemesis.');
        return `It hangs over the altar, where a goddess of debts paid can see it. The priests have never been given anything like it. Temple favour +8.`;
      }) },
      { label: c => `Sell it (+${c.cost})`, run: c => questMan(c, g => {
        G.denarii += c.cost; g.morale = clamp(g.morale - 20, 0, 100);
        addStory(g, 'Killed the beast that marked him, and saw its hide sold.'); endQuest(g, 'failed');
        return `The dealer counts out the money. ${g.name} watches the hide rolled and corded and put on a mule. He killed it; that much is his.`;
      }) },
    ],
  },
  questChild: {
    title: 'At the door', auto: true, can: finaleCan('child'), make: finaleMake('child'),
    text: c => `It is a girl. <b>${gn(c.g)}</b> has given her the horse. The woman has a hut, a debt to the man who owns it, and nothing else. ${c.cost} denarii would buy them a holding of their own, and ${gn(c.g)} knows the house has no reason to spend it.`,
    opts: [
      { label: c => `Buy them the holding (${c.cost})`, ok: c => G.denarii >= c.cost, run: c => questMan(c, g => {
        G.denarii -= c.cost;
        questReward(g, 'atpeace', 'Found his daughter, and saw her and her mother settled on land of their own.');
        return `Four iugera, a well, and a deed in the woman's name. ${g.name} does not thank you. He cannot, yet.`;
      }) },
      { label: () => 'His own winnings, sent to them after every games', run: c => questMan(c, g => {
        questReward(g, 'provider', 'Found his daughter. Somebody eats by what he wins.');
        return `It is agreed with the carter. ${g.name} has something to lose now, and fights like a man who knows it.`;
      }) },
      { label: () => 'He has seen them. March', run: c => questMan(c, g => {
        g.morale = clamp(g.morale - 25, 0, 100); addStory(g, 'Stood at his daughter\'s door once, and was marched away.'); endQuest(g, 'failed');
        return `${g.name} falls in. The child waves until the column is out of sight; he does not turn round, and it costs him something not to.`;
      }) },
    ],
  },
  questBetrayer: {
    title: 'Under the bed', auto: true, can: finaleCan('betrayer'), make: finaleMake('betrayer'),
    text: c => `<b>${gn(c.g)}</b>'s cousin is on his knees among his own broken crockery, offering the farm, the deeds, his daughters. He is a citizen, and the Magistrate will ask questions if he dies. ${gn(c.g)} is holding him by the hair and looking at you.`,
    opts: [
      { label: () => 'It is his to settle', run: c => questMan(c, g => {
        g.kills++; favor('magistrate', -5);
        questReward(g, 'bloodoath', 'Killed the cousin who sold him.');
        return `It is done in the yard, where the household can see. The Magistrate hears that a citizen has been killed by somebody's gladiator, and remembers whose. Favour -5.`;
      }) },
      { label: c => `He signs over everything he has (+${c.cost * 2})`, run: c => questMan(c, g => {
        G.denarii += c.cost * 2;
        questReward(g, null, 'Took back from his cousin, by deed and seal, what he was sold for.');
        return `The cousin signs until his hand shakes too much to hold the pen. The farm that ${g.name} was sold to pay for comes to the house, and is sold again by nightfall. The cousin leaves the province on foot.`;
      }) },
      { label: () => 'He lets him go, in front of them all', run: c => questMan(c, g => {
        const f = 5 + 3 * tier(); favor('temple', 6); G.fame += f; g.fame += f;
        questReward(g, 'atpeace', 'Had the cousin who sold him under his hand, and let him live.');
        return `${g.name} opens his hand. He says, so that the whole household hears, what was done to him and by whom; and then he walks out of the gate. The cousin will live a long time, here, among people who know. Temple favour +6, fame +${f}.`;
      }) },
    ],
  },
});

function questReady(g) { return !g.away && g.injury <= 0 && !g.quest && !g.questDone && !(g.questAsk > G.day) && (g.rank >= 1 || g.wins >= 3); }
// A journey nobody here has made or been promised, and whose place is still there to go to: the quarry, the camp, the shrine
// and the old man are each visited once, but a landmark can be the end of one journey after another.
function questsFree() {
  return Object.keys(QUESTS).filter(q => !G.roster.some(g => (g.quest && g.quest.id === q) || g.questDone === q)
    && (QUESTS[q].marks ? !!questSpot(q) : !wildMap().done[questPlace(q)]));
}
