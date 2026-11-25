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
    text: c => `A town on the road to ${c.land} has a fair coming and no gladiator school of its own. The Guild is selling it a day of games, and wants two of your men as the main attraction.`,
    win: n => `${n} filled a wooden arena three days running. The Guild sold every seat twice, and your name went up the road with the carts.`,
    fail: n => `The crowd had seen better at a cock-fight, and said so. ${n} came home to a short purse and a long silence.`,
  },
  quarry: {
    name: 'Order at the quarry', patron: 'magistrate', tier: 1, days: [4, 6], size: 2, danger: 0.55, pay: 1.2,
    w: { str: 0.6, agi: 0, end: 0.4, skl: 0 }, cls: ['murmillo', 'hoplomachus'], likes: ['brute', 'ironhide', 'thickskin', 'steady'], hates: ['nervous', 'frail'],
    trait: null, anger: { temple: -2 }, events: ['bribe', 'wound', 'insult', 'homesick'],
    text: () => 'The convicts at the town\'s quarry have killed an overseer and are refusing to work. The Magistrate wants it settled before the garrison hears of it, by two men who are not squeamish. The priests call it butcher\'s work.',
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
    trait: 'blessed', events: ['crowd', 'insult', 'jobOmen'],
    text: () => 'A man who was three times chief magistrate of the town is to be cremated at dusk, and his sons want it done in the old way: two pairs of gladiators fighting beside the pyre in his honour. The priests want men who will fight with dignity, and not turn it into a slaughter.',
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

// The going rate: between a fifth and a quarter of what the same men would win at the games over the same days. Work
// away from the sand keeps a school fed between games; it is not a way to grow rich, or great. (At 0.065, and with
// three to six offers every market day, work paid a school as much as the arena did and no careful player could lose:
// see tools/race.js.)
const JOB_RATE = 0.045;
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
  if (g.morale < 40) why.push('but his morale is low');
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
  for (let d = G.day; d < G.day + days; d++) if (gamesOn(d)) return true;
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
const workOffers = (t, r) => 1 + (r >= 60 ? 1 : 0);      // one offer each market day, and a second for a house that is sought after: work is not always to be had
function workMove(d) { G.workRep = clamp(workRep() + d, 0, 100); }
function makeContract(type, t) {
  const D = CONTRACTS[type], days = rint(D.days[0], D.days[1]), diff = rand(0.85, 1.3);
  return {
    id: ++G.nextId, type, patron: D.patron, days, size: D.size, diff, need: jobNeed(t, diff),
    land: D.travel ? pick(ORIGINS).name : null, asked: false,
    pay: Math.max(5, round5(PURSE[t] * JOB_RATE * days * Math.pow(D.size, 0.85) * D.pay * (0.6 + 0.5 * diff) * workPay(workRep()))),      // never nothing: a day's light work in a village rounds down to it otherwise
    favor: 1 + Math.round(days / 6),
  };
}
// The terms men are sent on. Standard: paid on success. An advance: a third now, a third on success, and the rest
// forgone. Provisioned: a fifth of the pay spent on guides, mules and bribes, for a better chance. Hazard pay, on
// dangerous work only: three-tenths more, but the patron thinks the less of you for asking.
const TERMS = {
  standard: { name: 'Standard', what: 'Paid in full when the work is done well.' },
  advance: { name: 'An advance', what: 'You are paid a third now and a third when the work is done, and give up the last third. If the work fails you keep the advance, but they think worse of you for it.' },
  provision: { name: 'Provisioned', what: '20% of the pay is spent now on guides, mules and bribes, and the chance of success is 8 points better.' },
  hazard: { name: 'Hazard pay', what: 'Dangerous work only. 30% more pay, half the favour, and you lose one point of favour for asking.' },
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
  if (G.askedAround === dealCycle()) return 'You have asked around since the last market day.';
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

const GONE = 'By the time your answer reached them, the matter had already been settled without you.';
const fieldCtx = (J, more) => Object.assign({ job: J.id, g: pick(J.ids) }, more || {});
const lowest = J => jobMen(J).sort((a, b) => a.morale - b.morale)[0];
// runs fn with the outing and its men, or says the moment has passed
const onJob = (c, fn) => { const J = jobById(c.job), men = J ? jobMen(J) : []; return J && men.length ? fn(J, men, byId(c.g) || men[0]) : GONE; };
const abandon = J => { J.abandon = true; J.end = G.day + 1; J.eventDay = 0; };

const FIELD_EVENTS = {
  ambush: {
    title: 'Your men are stopped on the road',
    can: () => true,
    make: J => fieldCtx(J, { cost: 25 + tier() * 25 }),
    text: c => `A message arrives from the road. Armed men have stopped <b>${jn(jobById(c.job))}</b> at a river crossing, and demand ${c.cost} denarii to let ${jobMen(jobById(c.job) || { ids: [] }).length > 1 ? 'them' : 'him'} pass.`,
    opts: [
      { label: () => 'Tell them to fight their way through (risky)', run: c => onJob(c, (J, men, g) => {
        if (chance(clamp(jobOdds(jobDef(J), J.need, men, 0.1, J.land), 0.2, 0.9))) {
          J.edge += 0.1; men.forEach(x => { x.morale = clamp(x.morale + 5, 0, 100); });
          return `The armed men turned out to be only farmers with spears. ${namesOf(men)} beat them easily and went on. Morale +5, and the work is more likely to succeed.`;
        }
        J.edge -= 0.15; fieldWound(g, rint(2, 4));
        return `More armed men were hiding nearby. Your men broke through, but ${g.name} was wounded, and the work is less likely to succeed.`;
      }) },
      { label: c => `Pay what they ask (${c.cost} denarii)`, ok: c => G.denarii >= c.cost, run: c => onJob(c, () => { G.denarii -= c.cost; return `You send the ${c.cost} denarii, and your men are allowed to pass.`; }) },
      { label: () => 'Tell them to go another way (a day late, tiring)', run: c => onJob(c, (J, men) => {
        J.end++; men.forEach(x => { x.fatigue = clamp(x.fatigue + 15, 0, 100); });
        return 'Your men go round through the hills. It tires them, and they will come home a day later than planned.';
      }) },
    ],
  },
  bribe: {
    title: 'Your fighter is offered a bribe',
    can: J => J.kind === 'contract',
    make: J => fieldCtx(J, { pay: 30 + tier() * 30 }),
    text: c => `<b>${gn(c.g)}</b> sends you a message from his job. A stranger has offered him ${c.pay} denarii to look the other way tomorrow night, while something happens that he is supposed to prevent. He asks what you want him to do.`,
    opts: [
      { label: c => `Take the bribe (+${c.pay} denarii; the job will probably fail)`, run: c => onJob(c, J => { G.denarii += c.pay; J.edge -= 0.35; J.bribed = true; return `You tell him to take it, and the ${c.pay} denarii are sent to you. The job is now much less likely to succeed.`; }) },
      { label: () => 'Refuse the bribe', run: c => onJob(c, (J, men, g) => { J.edge += 0.05; g.morale = clamp(g.morale + 4, 0, 100); return `${g.name} sends the stranger away, and is glad you told him to: morale +4. The job is a little more likely to succeed.`; }) },
      { label: () => 'Take it, and warn his employer (risky)', run: c => onJob(c, (J, men, g) => {
        if (chance(0.55)) { G.denarii += c.pay; J.edge += 0.15; return `The employer is pleased to be warned. He lets ${g.name} keep the money, and uses the warning to set a trap. You gain ${c.pay} denarii, and the job is more likely to succeed.`; }
        J.edge -= 0.1; fieldWound(g, rint(2, 3));
        return `The stranger found out. His friends attacked ${g.name} that night and wounded him, and the job is less likely to succeed.`;
      }) },
    ],
  },
  insult: {
    title: 'Your fighter is being treated badly',
    can: J => J.kind === 'contract',
    make: J => fieldCtx(J),
    text: c => `You hear that <b>${gn(c.g)}</b>'s employer is treating him like a kitchen slave. He has kept quiet so far, but he wants to answer back.`,
    opts: [
      { label: () => 'Tell him to put up with it (his morale -10)', run: c => onJob(c, (J, men, g) => { J.edge += 0.08; g.morale = clamp(g.morale - 10, 0, 100); return `${g.name} puts up with it, as you ordered. He resents it: morale -10. The job is a little more likely to succeed.`; }) },
      { label: () => 'Let him answer back (his morale +10; hurts the job)', run: c => onJob(c, (J, men, g) => {
        g.morale = clamp(g.morale + 10, 0, 100); J.edge -= 0.2;
        return `${g.name} tells his employer what he thinks, in front of the whole household. He feels better: morale +10. The employer is offended, and the job is less likely to succeed.`;
      }) },
    ],
  },
  wound: {
    title: 'Your fighter is hurt on the job',
    can: J => jobDef(J).danger > 0,
    make: J => fieldCtx(J, { cost: 30 + tier() * 20 }),
    text: c => `<b>${gn(c.g)}</b> has been cut across the ribs while working. The wound is not deep, but it is becoming infected. A local physician will treat it for ${c.cost} denarii.`,
    opts: [
      { label: c => `Pay the physician (${c.cost} denarii)`, ok: c => G.denarii >= c.cost, run: c => onJob(c, () => { G.denarii -= c.cost; return 'The physician cleans and dresses the wound. Your fighter can go on working, with no harm done.'; }) },
      { label: () => 'Have him carry on untreated (he comes home injured)', run: c => onJob(c, (J, men, g) => { J.edge -= 0.1; fieldWound(g, rint(3, 5)); return `${g.name} bandages the wound himself and goes on working. He will come home injured, and the job is less likely to succeed.`; }) },
      { label: () => 'Call them home (the job is abandoned)', run: c => onJob(c, (J, men, g) => { abandon(J); fieldWound(g, 2); return 'You call your men home. The job is abandoned, and they will be back tomorrow. The hurt man needs two days to heal.'; }) },
    ],
  },
  dice: {
    title: 'Your men want to gamble',
    can: () => true,
    make: J => fieldCtx(J, { stake: 20 + tier() * 20 }),
    text: c => `<b>${jn(jobById(c.job))}</b> ${jobMen(jobById(c.job) || { ids: [] }).length > 1 ? 'have' : 'has'} met some mule-drivers playing dice at an inn, and ${jobMen(jobById(c.job) || { ids: [] }).length > 1 ? 'ask' : 'asks'} your permission to gamble with ${c.stake} denarii of the money you gave ${jobMen(jobById(c.job) || { ids: [] }).length > 1 ? 'them' : 'him'} for the journey.`,
    opts: [
      { label: c => `Let them play (morale +6; win or lose ${c.stake} denarii)`, run: c => onJob(c, (J, men) => {
        men.forEach(x => { x.morale = clamp(x.morale + 6, 0, 100); });
        if (chance(0.5)) { G.denarii += c.stake; return `They win. You gain ${c.stake} denarii, and their morale is +6.`; }
        G.denarii -= c.stake; men.forEach(x => { x.fatigue = clamp(x.fatigue + 10, 0, 100); });
        return `They lose. You are ${c.stake} denarii poorer, and they are more tired after a late night, though their morale is +6.`;
      }) },
      { label: () => 'Forbid it (morale -5)', run: c => onJob(c, (J, men) => { men.forEach(x => { x.morale = clamp(x.morale - 5, 0, 100); }); J.edge += 0.05; return 'You forbid it, and they go to bed early and annoyed: morale -5. The job is a little more likely to succeed.'; }) },
    ],
  },
  rivals: {
    title: 'A rival school\'s men insult yours',
    can: () => true,
    make: J => fieldCtx(J, { h: pick(G.houses).id }),
    text: c => `Fighters from ${houseDef(c.h).name} are in the same town as <b>${jn(jobById(c.job))}</b>, and are loudly insulting your school.`,
    opts: [
      { label: () => 'Tell them to keep away (morale -3)', run: c => onJob(c, (J, men) => { men.forEach(x => { x.morale = clamp(x.morale - 3, 0, 100); }); return 'Your men avoid them, as you ordered. It hurts their pride: morale -3.'; }) },
      { label: () => 'Let them fight it out (risky; deepens the feud)', run: c => onJob(c, (J, men, g) => {
        const H = houseOf(c.h);
        if (chance(clamp(0.35 + statSum(g) / (ENEMY_BUDGET[tier()] * 2.2) * 0.4, 0.3, 0.8))) {
          feud(H, 8); H.prestige = Math.max(0, H.prestige - 5); J.edge += 0.08;
          men.forEach(x => { x.xp++; x.morale = clamp(x.morale + 8, 0, 100); });
          return `Your men win the fight. ${houseDef(c.h).name} loses 5 renown, and your men gain experience and morale +8. The job is more likely to succeed. Feud +8.`;
        }
        feud(H, 5); J.edge -= 0.1; fieldWound(g, rint(2, 4));
        return `There were more of them than expected, and your men lost. ${g.name} was injured, and the job is less likely to succeed. Feud +5.`;
      }) },
    ],
  },
  homesick: {
    title: 'A fighter may be planning to run',
    can: J => J.kind === 'contract' && jobMen(J).some(g => !g.traits.includes('atpeace')),
    make: J => ({ job: J.id, g: lowest(J).id, cost: 30 + tier() * 30 }),
    text: c => { const g = byId(c.g), J = jobById(c.job); return `<b>${gn(c.g)}</b>, away on a job, has been asking the way to ${g && J && J.land === g.origin ? 'his home village, which is less than two days from where he is' : 'the coast, and what a ship\'s passage costs'}. He may be thinking of running away. Or it may mean nothing.`; },
    opts: [
      { label: c => `Promise him a bonus for coming home (${c.cost} denarii; his morale +15)`, ok: c => G.denarii >= c.cost, run: c => onJob(c, (J, men, g) => { G.denarii -= c.cost; g.morale = clamp(g.morale + 15, 0, 100); return `You send word that ${c.cost} denarii are waiting for ${g.name} at home. He stops asking about the road: morale +15.`; }) },
      { label: () => 'Trust him (an unhappy man may desert)', run: c => onJob(c, (J, men, g) => {
        if (g.morale < 45 && !g.grateful && !g.traits.includes('atpeace') && chance(0.6)) { J.flight = g.id; return 'You do nothing. You will find out whether he comes back when the job ends.'; }
        g.morale = clamp(g.morale + 6, 0, 100);
        return `${g.name} was only asking for news of home. He hears that you trusted him, and is glad of it: morale +6.`;
      }) },
      { label: () => 'Bring them all home (the job is abandoned)', run: c => onJob(c, J => { abandon(J); return 'You send your trainer to bring them home. The job is abandoned.'; }) },
    ],
  },
  windfall: {
    title: 'Your fighter saved a child',
    can: J => J.kind === 'contract',
    make: J => fieldCtx(J, { pay: 25 + tier() * 25 }),
    text: c => `<b>${gn(c.g)}</b> has saved his employer's child from being trampled by a horse. The family wants to reward your school, and asks what you would like.`,
    opts: [
      { label: c => `Ask for money (+${c.pay} denarii)`, run: c => onJob(c, () => { G.denarii += c.pay; return `The family sends you ${c.pay} denarii, with a letter of thanks.`; }) },
      { label: () => 'Ask for a piece of armour', run: c => onJob(c, () => {
        const it = makeItem(pick(ARMOR_SLOTS), clamp(tier() + rint(0, 1), 0, 6));
        G.armoury.push(it);
        return `The family sends you ${itemName(it).toLowerCase()} from their own collection. It is now in your armoury.`;
      }) },
      { label: () => 'Ask them to speak well of you (favour +6)', run: c => onJob(c, J => { favor(J.patron, 6); J.edge += 0.05; return `The family praises your school to their powerful friends. ${PATRONS[J.patron].name}: favour +6. The job is a little more likely to succeed.`; }) },
    ],
  },
  crowd: {
    title: 'A crowd wants your fighter to perform',
    can: J => J.kind === 'contract',
    make: J => fieldCtx(J),
    text: c => `A crowd has recognised <b>${gn(c.g)}</b> at his job, and is calling for him to show off his arena skills. His employer has not given permission.`,
    opts: [
      { label: () => 'Let him perform (fame; may annoy the employer)', run: c => onJob(c, (J, men, g) => {
        const f = 2 + tier(); G.fame += f; g.fame += f; g.morale = clamp(g.morale + 6, 0, 100);
        if (!g.traits.includes('showy') && chance(0.4)) { J.edge -= 0.2; return `${g.name} performs for the crowd, and they love it. Fame +${f}, and his morale is +6. But his employer is annoyed, and the job is less likely to succeed.`; }
        return `${g.name} performs for the crowd, and then bows to his employer. Everyone is pleased. Fame +${f}, and his morale is +6.`;
      }) },
      { label: () => 'Tell him to keep working', run: c => onJob(c, J => { J.edge += 0.06; return 'He goes on with his work, and the crowd leaves. His employer is pleased, and the job is a little more likely to succeed.'; }) },
    ],
  },
  // ---- more from the road. These are not tied to one kind of work: `fits` says which kinds they can come up on. ----
  shortpay: {
    title: 'The employer wants to pay partly in wine', fits: () => true,
    can: J => J.kind === 'contract' && J.pay > 0,
    make: J => fieldCtx(J),
    text: c => `<b>${gn(c.g)}</b>'s employer says he is short of money this month, and wants to pay part of the agreed fee in wine instead of coin. ${gn(c.g)} asks what you want him to answer.`,
    opts: [
      { label: () => 'Insist on coin, as agreed (favour -1)', run: c => onJob(c, J => { favor(J.patron, -1); return `You insist on the full fee in coin. The employer agrees, but he is not pleased. ${PATRONS[J.patron].name}: favour -1.`; }) },
      { label: () => 'Take wine for a fifth of the fee (less pay, more morale)', run: c => onJob(c, (J, men) => { J.pay = round5(J.pay * 0.8); men.forEach(x => evMor(x, 8)); home().forEach(x => evMor(x, 3)); return `You accept wine for a fifth of the fee, so the pay will be ${J.pay} denarii. The men on the job gain 8 morale, and the men at home gain 3.`; }) },
      { label: () => 'Let your fighter bargain for it (may gain or lose)', run: c => onJob(c, (J, men, g) => {
        if (chance(clamp(0.3 + g.stats.skl * 0.025, 0.3, 0.8))) { J.pay = round5(J.pay * 1.1); return `${g.name} frightens the employer into paying more. The pay will now be ${J.pay} denarii, all in coin.`; }
        J.edge -= 0.12; return `${g.name} bargains badly. The pay stays the same, but the employer is annoyed, and the job is less likely to succeed.`;
      }) },
    ],
  },
  sickness: {
    title: 'Your men are sick from bad water', fits: D => !!D.travel,
    can: () => true,
    make: J => fieldCtx(J, { cost: 20 + tier() * 15 }),
    text: c => `<b>${jn(jobById(c.job))}</b> drank from a bad well on the road, and ${jobMen(jobById(c.job) || { ids: [] }).length > 1 ? 'have' : 'has'} been sick all night. A woman in the village sells a cure for ${c.cost} denarii.`,
    opts: [
      { label: c => `Buy the cure (${c.cost} denarii)`, ok: c => G.denarii >= c.cost, run: c => onJob(c, () => { G.denarii -= c.cost; return 'The cure works. By noon your men are well enough to travel, and no time is lost.'; }) },
      { label: () => 'Rest for a day (home a day late)', run: c => onJob(c, (J, men) => { J.end++; men.forEach(x => { x.fatigue = clamp(x.fatigue - 10, 0, 100); }); return 'Your men rest for a day until they are better. They will come home a day later than planned.'; }) },
      { label: () => 'Make them go on sick (tiring, morale -5, hurts the job)', run: c => onJob(c, (J, men) => { J.edge -= 0.1; men.forEach(x => { x.fatigue = clamp(x.fatigue + 20, 0, 100); evMor(x, -5); }); return 'Your men travel on while still sick. They are much more tired, morale is -5, and the job is less likely to succeed.'; }) },
    ],
  },
  stranger: {
    title: 'A stranger wants to travel with your men', fits: D => !!D.travel,
    can: () => true,
    make: J => fieldCtx(J, { stake: 15 + tier() * 15 }),
    text: c => `A stranger on the road, who looks like an old soldier, asks to travel with <b>${jn(jobById(c.job))}</b> as far as the next town. He is good company, but he keeps looking at the baggage. He may be a thief.`,
    opts: [
      { label: () => 'Let him come along (may help, or he may rob you)', run: c => onJob(c, (J, men) => {
        if (chance(0.6)) { J.edge += 0.06; men.forEach(x => evMor(x, 3)); return 'He turns out to be an honest old soldier who knows the road well, and he teaches your men a useful trick before he leaves. Morale +3, and the job is a little more likely to succeed.'; }
        G.denarii -= c.stake; return `He was a thief. He is gone before dawn, with ${c.stake} denarii of your travelling money.`;
      }) },
      { label: () => 'Send him away', run: c => onJob(c, () => 'Your men send him away. You will never know whether he was honest.') },
    ],
  },
  sidebout: {
    title: 'An offer of a private fight', fits: D => D.danger > 0 || !!D.glory,
    can: J => J.kind === 'contract',
    make: J => fieldCtx(J, { pay: 40 + tier() * 35 }),
    text: c => `A rich man has seen <b>${gn(c.g)}</b> at his job, and wants him to fight a private bout tonight against his cook's son, who is said to be very big. The winner gets ${c.pay} denarii.`,
    opts: [
      { label: c => `Let him fight (+${c.pay} denarii if he wins; risk of injury)`, run: c => onJob(c, (J, men, g) => {
        if (chance(clamp(0.4 + statSum(g) / (ENEMY_BUDGET[tier()] * 2.2) * 0.4, 0.35, 0.85))) { G.denarii += c.pay; g.xp++; evMor(g, 8); return `${g.name} wins: the cook's son was big, but slow. You gain <b>${c.pay}</b> denarii, and he gains experience and morale +8.`; }
        J.edge -= 0.1; fieldWound(g, rint(2, 3)); return `${g.name} loses: the cook's son was an experienced fighter. He is injured, and the job is less likely to succeed.`;
      }) },
      { label: () => 'Refuse: he is there to work (his morale -3)', run: c => onJob(c, (J, men, g) => { J.edge += 0.05; evMor(g, -3); return `${g.name} turns the fight down. He is a little disappointed: morale -3. His employer approves, and the job is a little more likely to succeed.`; }) },
    ],
  },
  admirer: {
    title: 'Someone in the household admires your fighter', fits: D => !D.travel,
    can: J => J.kind === 'contract',
    make: J => fieldCtx(J, { gift: 25 + tier() * 25 }),
    text: c => `Someone in his employer's household has been leaving small gifts for <b>${gn(c.g)}</b>, and now a love letter. He does not know who it is.`,
    opts: [
      { label: () => 'Tell him to refuse politely (his morale -5)', run: c => onJob(c, (J, men, g) => { J.edge += 0.05; evMor(g, -5); return `${g.name} sends the letter back unopened. He is sorry to: morale -5. The job is a little more likely to succeed.`; }) },
      { label: () => 'Let him do as he likes (may pay well, or ruin the job)', run: c => onJob(c, (J, men, g) => {
        if (chance(0.6)) { G.denarii += c.gift; evMor(g, 12); return `Nobody finds out. ${g.name} is very happy (morale +12), and his admirer secretly sends your school ${c.gift} denarii.`; }
        J.edge -= 0.3; favor(J.patron, -3); return `The admirer was the employer's wife, and the employer finds out. The job is now much less likely to succeed. ${PATRONS[J.patron].name}: favour -3.`;
      }) },
    ],
  },
  jobThief: {      // (the school has events called thief, omen and brawl of its own: these must not take their names)
    title: 'A boy tries to rob your fighter', fits: () => true,
    can: () => true,
    make: J => fieldCtx(J),
    text: c => `<b>${gn(c.g)}</b> woke in the night and caught a thief with his hand in his pack. It is a thin, hungry boy of about ten.`,
    opts: [
      { label: () => 'Hand him to the town watch (Magistrate favour +2)', run: c => onJob(c, () => { favor('magistrate', 2); return 'Your fighter hands the boy over to the town watch. Magistrate favour +2.'; }) },
      { label: () => 'Let him go', run: c => onJob(c, () => 'Your fighter lets the boy go, and he runs off.') },
      { label: () => 'Feed him (his morale +5; the boy may help)', run: c => onJob(c, (J, men, g) => {
        evMor(g, 5);
        if (chance(0.35)) { J.edge += 0.1; return `The boy eats hungrily. In return he warns ${g.name} about people in the town who mean him harm. ${g.name}'s morale is +5, and the job is more likely to succeed.`; }
        return `The boy eats hungrily and runs off with the rest of the bread. ${g.name} is glad he fed him: morale +5.`;
      }) },
    ],
  },
  washout: {
    title: 'The bridge has been washed away', fits: D => !!D.travel,
    can: () => true,
    make: J => fieldCtx(J, { cost: 15 + tier() * 15 }),
    text: c => `Heavy rain has washed away the bridge that <b>${jn(jobById(c.job))}</b> needed to cross. A boatman will ferry ${jobMen(jobById(c.job) || { ids: [] }).length > 1 ? 'them' : 'him'} over for ${c.cost} denarii, which is far too much.`,
    opts: [
      { label: c => `Pay the boatman (${c.cost} denarii)`, ok: c => G.denarii >= c.cost, run: c => onJob(c, () => { G.denarii -= c.cost; return 'The boatman takes your men across safely, and no time is lost.'; }) },
      { label: () => 'Wade across further upstream (risky)', run: c => onJob(c, (J, men, g) => {
        if (chance(clamp(0.35 + g.stats.agi * 0.03, 0.35, 0.85))) { men.forEach(x => { x.fatigue = clamp(x.fatigue + 10, 0, 100); }); return 'Your men wade across in deep, cold water. They are more tired, but they get across safely and lose no time.'; }
        J.edge -= 0.08; fieldWound(g, rint(1, 3)); return `The current knocks ${g.name} off his feet and throws him against a rock. He gets across, but he is injured, and the job is less likely to succeed.`;
      }) },
      { label: () => 'Wait for the river to go down (home a day late)', run: c => onJob(c, J => { J.end++; return 'Your men wait a day for the river to go down. They will come home a day later than planned.'; }) },
    ],
  },
  oldfoe: {
    title: 'A retired gladiator invites your fighter to drink', fits: () => true,
    can: () => true,
    make: J => fieldCtx(J),
    text: c => `The keeper of the nearest tavern is a retired gladiator who fought in this province for eleven years. He has recognised <b>${gn(c.g)}</b>, and invites him to sit down and drink with him.`,
    opts: [
      { label: () => 'Let him drink with the old man (experience, morale +6, tiring)', run: c => onJob(c, (J, men, g) => { g.xp++; evMor(g, 6); men.forEach(x => { x.fatigue = clamp(x.fatigue + 8, 0, 100); }); return `They drink and talk until late. ${g.name} learns some useful things from him: he gains experience and morale +6. Everyone on the job is a little more tired.`; }) },
      { label: () => 'Tell him to refuse and keep working', run: c => onJob(c, J => { J.edge += 0.05; return 'Your fighter refuses politely, and the old man understands. The job is a little more likely to succeed.'; }) },
    ],
  },
  jobOmen: {
    title: 'Your men have seen a bad omen', fits: () => true,
    can: () => true,
    make: J => fieldCtx(J, { cost: 10 + tier() * 5 }),
    text: c => `An owl sat on the roof in full daylight all day, where <b>${jn(jobById(c.job))}</b> could see it. That is a sign of bad luck, and it is worrying ${jobMen(jobById(c.job) || { ids: [] }).length > 1 ? 'them' : 'him'}.`,
    opts: [
      { label: c => `Pay for a small sacrifice (${c.cost} denarii; morale +6)`, ok: c => G.denarii >= c.cost, run: c => onJob(c, (J, men) => { G.denarii -= c.cost; men.forEach(x => evMor(x, 6)); return 'Your men sacrifice a cockerel to turn the bad luck away, and feel much better: morale +6.'; }) },
      { label: () => 'Tell them to ignore it (may hurt morale and the job)', run: c => onJob(c, (J, men) => {
        if (men.some(x => x.traits.includes('blessed')) || chance(0.55)) return 'By evening the owl has gone, and nothing bad has happened. Your men forget about it.';
        J.edge -= 0.06; men.forEach(x => evMor(x, -8)); return 'Your men cannot stop worrying about it. Morale -8, and the job is a little less likely to succeed.';
      }) },
    ],
  },
  staylonger: {
    title: 'The employer wants to keep your men longer', fits: D => !D.travel,
    can: J => J.kind === 'contract' && J.pay > 0,
    make: J => fieldCtx(J, { more: round5(Math.max(15, (jobById(J.id) || J).pay * 0.35)) }),
    text: c => `The employer is pleased with <b>${jn(jobById(c.job))}</b>, and asks to keep ${jobMen(jobById(c.job) || { ids: [] }).length > 1 ? 'them' : 'him'} two days beyond what was agreed, for ${c.more} denarii more.`,
    opts: [
      { label: c => `Agree (+${c.more} denarii, home two days later)`, run: c => onJob(c, J => { J.end += 2; J.pay += c.more; return `You agree. Your men will come home two days later, and the pay will be ${J.pay} denarii.`; }) },
      { label: () => 'Refuse', run: c => onJob(c, () => 'You refuse. The employer is sorry, but accepts it. Your men will come home on time.') },
    ],
  },
  jobBrawl: {
    title: 'Drunk young men insult your fighter', fits: D => D.danger > 0,
    can: () => true,
    make: J => fieldCtx(J),
    text: c => `Five drunk young men of the town have been shouting insults at <b>${gn(c.g)}</b> in the street, saying he does not look like much of a fighter.`,
    opts: [
      { label: () => 'Tell him to walk away (his morale -4)', run: c => onJob(c, (J, men, g) => { evMor(g, -4); return `${g.name} walks away, which he finds harder than fighting: morale -4.`; }) },
      { label: () => 'Let him fight them (fame; may anger the Magistrate)', run: c => onJob(c, (J, men, g) => {
        const f = 1 + tier();
        if (chance(0.7)) { G.fame += f; g.fame += f; evMor(g, 8); return `${g.name} beats all five in moments, without hurting any of them badly. The whole town talks about it: fame +${f}, and his morale is +8.`; }
        favor('magistrate', -3); J.edge -= 0.1; return 'One of the young men is a town councillor\'s son, and your fighter breaks his jaw. The Magistrate hears of it: favour -3. The job is less likely to succeed.';
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
    ask: g => `<b>${g.name}</b> has a younger brother, who was sold as a slave in the same season he was. A trader from ${g.origin} has told him the brother is still alive, and working in the stone quarries in the northern hills. He asks you to take him there and get his brother out.` },
  village: { name: 'The men who burned his village', finale: 'questVillage', where: 'the slavers\' camp, south-east on the road into the Blackmere',
    ask: g => `Slavers burned <b>${g.name}</b>'s village in ${g.origin} and marched him away in chains. He has just learned that their captain is here in the province. He asks you to march the school to the slavers' camp, so that he can face the man.` },
  shrine: { name: 'A vow to his gods', finale: 'questShrine', where: 'the shrine on the shore, at the end of the south road',
    ask: g => `The night before his first fight, <b>${g.name}</b> made a promise to his gods: if he lived, he would take an offering to the shrine his people keep on the southern shore. He has lived. He asks you to take him there to keep his promise.` },
  master: { name: 'The old master', finale: 'questMaster', where: 'the beekeeper\'s hut, off the north road',
    ask: g => `Thirty years ago a famous champion won his freedom and went up into the hills to keep bees. He fought as a ${CLASSES[g.cls].name}, like <b>${g.name}</b>, who believes the old man is still alive. He asks you to take him there, to learn what the old champion knows.` },
  // These four end at one of the landmarks of the province, chosen when he asks. A place of that kind is always to be found.
  grave: { name: 'A friend left on the road', finale: 'questGrave', where: 'a place out in the province', marks: ['An old battlefield', 'The gallows', 'A burnt village', 'The causeway'],
    ask: (g, m) => `<b>${g.name}</b> was brought to this province chained in a line of forty slaves. The man chained next to him shared his water for two hundred miles, then died on the march and was thrown into a ditch near ${lower(m)}. He remembers the place. He asks you to take him there, so he can give his friend a proper burial.`,
    at: g => `<b>${g.name}</b> walks straight to the place: a ditch beside a thorn bush, with bones in it. He asks for a spade, and for a day to bury his friend.`,
    after: g => `${g.name} digs the grave alone, and will not let anyone help. By evening it is almost finished.`,
    fire: g => `"He was a potter. All the way here he talked about a kiln he was going to build. I never learned how his people bury their dead, so I will have to guess."` },
  beast: { name: 'The beast that marked him', finale: 'questBeast', where: 'a place out in the province', marks: ['The eagle rock', 'The wolf stone', "The giant's table", 'The great waterfall', 'The hot spring'], bg: 'rock',
    foes: (g, t) => [questBeast(greatKind(Math.max(3, t)), t, 'The one that marked him', 1.5)].concat(lesser('wolf', t, 1 + Math.floor(t / 2))),
    ask: (g, m) => `<b>${g.name}</b> has four old claw scars across his ribs. When he was a boy, herding goats with his father, a great beast attacked them. It clawed him and killed his father. A hunter says the same animal is still alive, old now, with the same torn ear, and that it lives at ${lower(m)}. He asks you to march the school there, so that he can kill it.`,
    at: g => `The ground is covered in bones. A very large animal with a torn ear is watching you from the rocks. <b>${g.name}</b> has gone pale, but he keeps walking towards it.`,
    won: g => `The beast is dead. ${g.name} sits down beside it with his hand on its torn ear, and for a long time nobody speaks to him.`,
    fire: g => `"I was nine years old, and I ran away. I could hear my father all the way down the hill. I have never run from anything since. That is the only courage I have."` },
  child: { name: 'A child he has never seen', finale: 'questChild', where: 'a place out in the province', marks: ["The fishers' huts", 'The mill', 'The huts on stilts', "The shepherds' fold", 'The bee garden', 'The charcoal burners'],
    ask: (g, m) => `A cart driver has brought <b>${g.name}</b> a message. The woman he was taken from when he was enslaved is alive, and living at ${lower(m)}. She has a four-year-old child, and it is his. He has never seen it. He asks you to march the school that way, so that he can see them once.`,
    at: g => `A woman is hanging out washing. She stops when she sees you. A small child peeps out from behind her at the armed men, and then at <b>${g.name}</b>, who has taken off his helmet and does not know what to say.`,
    after: g => `The school camps out of sight of the house. ${g.name} comes back after dark and asks to speak to you about money.`,
    fire: g => `"I do not even know whether it is a boy or a girl. The message did not say. I have been carving a toy horse. But what if she does not like horses?"` },
  betrayer: { name: 'The man who sold him', finale: 'questBetrayer', where: 'a place out in the province', marks: ['A villa in its garden', 'The wine press', 'The mill', 'The lime kiln'], bg: 'ruin',
    foes: (g, t) => [questBoss(t, "His cousin's captain", { traits: ['watchful'], tactic: 'defensive' })].concat(wildMen(t, Math.max(2, wildCount(t) - 2))),
    ask: (g, m) => `<b>${g.name}</b> was not captured in war. His own cousin sold him as a slave to pay a debt, and kept the family farm for himself. The cousin has grown rich since. He now owns a house at ${lower(m)}, with hired guards on the gate. ${g.name} asks you to take him there to confront his cousin.`,
    at: g => `The house has a good wall and a new roof, and the hired guards on the gate are expecting trouble. A face appears at an upstairs window and vanishes. It is the cousin. <b>${g.name}</b> says quietly that he has grown fat.`,
    won: g => `The guards are beaten or have run away. You find the cousin hiding under a bed.`,
    fire: g => `"We grew up together. He taught me to swim. I have thought about it a thousand times, and I still cannot work out when he began to hate me. Perhaps he never did. Perhaps he only wanted the money."` },
};
// what the first four say at the fire
Object.assign(QUESTS.brother, { fire: g => `"My brother is the clever one. He could do sums before he could walk. And they have him breaking stone. If he is alive, he will have counted every day."` });
Object.assign(QUESTS.village, { fire: g => `"He wore a ring on every finger, and he laughed the whole time. I would know that laugh anywhere. For years I have been afraid that somebody else would kill him before I could."` });
Object.assign(QUESTS.shrine, { fire: g => `"I did not think the god was listening when I made that promise. Then I lived, and the man next to me died. Now I am afraid of what happens if I do not keep it."` });
Object.assign(QUESTS.master, { fire: g => `"They say he never once lost his balance in forty fights. I lose mine twice every morning. If he refuses to teach me, I will sit outside his door until he changes his mind."` });

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
    title: 'A fighter asks a favour',
    auto: true,                      // offered on its own roll, so that it comes round often enough
    can: () => G.roster.some(questReady) && questsFree().length > 0,
    make: () => { const q = pick(questsFree()), sp = QUESTS[q].marks ? questSpot(q) : null; return Object.assign({ g: pick(G.roster.filter(questReady)).id, q }, sp || {}); },
    text: c => { const g = byId(c.g), Q = QUESTS[c.q]; return g ? Q.ask(g, c.mark || 'a place you know') + ` The place is ${Q.marks && c.mark ? `${lower(c.mark)}, in ${wildRegion(c.x, c.y)}` : Q.where}. The whole school would have to march there with him, and would miss any games held while it was away.` : 'A fighter wants a word.'; },
    opts: [
      { label: () => 'Promise to take him (morale +10)', run: c => {
        const g = byId(c.g); if (!g) return 'The moment has passed.';
        g.quest = { id: c.q, since: G.day }; g.morale = clamp(g.morale + 10, 0, 100);
        if (QUESTS[c.q].marks) { const sp = c.mark ? c : questSpot(c.q); if (!sp) { g.quest = null; return 'Nobody can say where the place is. It will have to wait.'; } Object.assign(g.quest, { mark: sp.mark, x: sp.x, y: sp.y, tier: sp.tier }); }
        wildMark(questMarkId(g), 'journey');
        addStory(g, `Was promised his journey: ${QUESTS[c.q].name.toLowerCase()}.`);
        return `${g.name} trusts your promise. The place is now marked on your map of the province: ${questWhere(g)}. Do not make him wait too long.`;
      } },
      { label: () => 'Not now. Ask me again later (morale -3)', run: c => {
        const g = byId(c.g); if (!g) return 'The moment has passed.';
        g.questAsk = G.day + 20; g.morale = clamp(g.morale - 3, 0, 100);
        return `${g.name} is disappointed, but he accepts that you have not refused. He goes back to his training, and will ask again in a few weeks.`;
      } },
      { label: () => 'Refuse', run: c => {
        const g = byId(c.g); if (g) { g.questDone = 'refused'; g.morale = clamp(g.morale - 12, 0, 100); addStory(g, `Asked leave of the house, and was refused.`); }
        return 'He nods as if he had expected nothing else, and goes back to his training. He will not ask again, and he is bitter about it: morale -12.';
      } },
    ],
  },
  questBrother: {
    title: 'At the quarry', auto: true, can: finaleCan('brother'), make: finaleMake('brother'),
    text: c => `You have found <b>${gn(c.g)}</b>'s brother, alive, in the quarry. The overseer will sell him for ${c.cost} denarii. That is three times what a quarry slave is worth, and the overseer knows it. ${gn(c.g)} says there is a low place in the wall, where they could get him out by night instead.`,
    opts: [
      { label: c => `Buy him (${c.cost})`, ok: c => G.denarii >= c.cost && G.roster.length < capacity(), run: c => questMan(c, g => {
        G.denarii -= c.cost; const b = makeBrother(g);
        questReward(g, 'atpeace', 'Bought his brother out of the quarries with the house\'s silver.');
        return `You pay, and ${b.name} walks out of the quarry gate. He joins your school beside his brother. ${g.name} is at peace now, and neither of them will forget who paid.`;
      }) },
      { label: () => 'Steal him over the wall by night (may fail; Magistrate favour -8)', ok: () => G.roster.length < capacity(), run: c => questMan(c, g => {
        favor('magistrate', -8);
        if (chance(clamp(0.35 + g.stats.agi * 0.03, 0.35, 0.85))) {
          const b = makeBrother(g);
          questReward(g, 'atpeace', 'Took his brother over the quarry wall by night.');
          return `It works. ${g.name} gets his brother over the wall, and both are back before dawn. ${b.name} joins your school, and ${g.name} is at peace now. The Magistrate hears that a slave was stolen, and can guess who did it: favour -8.`;
        }
        fieldWound(g, rint(3, 5)); g.morale = clamp(g.morale - 20, 0, 100);
        addStory(g, 'Was caught at the quarry wall, and beaten for it.'); endQuest(g, 'failed');
        return `It fails. The guard dogs caught them at the wall. ${g.name} was beaten and thrown out, and will be some days healing. His brother was dragged back inside. The Magistrate has been told: favour -8.`;
      }) },
      { label: () => 'Leave his brother there (morale -25)', run: c => questMan(c, g => {
        g.morale = clamp(g.morale - 25, 0, 100); addStory(g, 'Found his brother in the quarries, and was made to leave him.'); endQuest(g, 'failed');
        return `You order ${g.name} to come home without his brother. He obeys, and never speaks of it. His morale falls by 25.`;
      }) },
    ],
  },
  questVillage: {
    title: 'The slavers\' captain', auto: true, can: finaleCan('village'), make: finaleMake('village'),
    text: c => `The slavers are beaten, and <b>${gn(c.g)}</b> has their captain on his knees. The man is begging for his life, and offering his strongbox and his horses in exchange. ${gn(c.g)} asks you what is to be done with him.`,
    opts: [
      { label: () => 'Let him kill the captain', run: c => questMan(c, g => {
        g.kills++; addScar(g, 'deep');
        questReward(g, 'bloodoath', 'Killed the man who burned his village.');
        return `${g.name} kills the captain with the man's own knife. His debt of blood is paid, and he fights harder for it: +8% damage from now on.`;
      }) },
      { label: () => 'Hand the captain to the Magistrate (fame, Magistrate favour)', run: c => questMan(c, g => {
        const f = 10 + 6 * tier(); G.fame += f; g.fame += f; favor('magistrate', 10);
        questReward(g, 'atpeace', 'Brought the man who burned his village to be crucified by the law.');
        return `The Magistrate has the captain executed at the crossroads, and ${g.name} watches until it is over. He is at peace now. The Magistrate is pleased with you: favour +10, fame +${f}.`;
      }) },
      { label: c => `Take his money and let him go (+${c.cost * 2} denarii; morale -30)`, run: c => questMan(c, g => {
        G.denarii += c.cost * 2; g.morale = clamp(g.morale - 30, 0, 100);
        addStory(g, 'Had the man who burned his village under his knife, and was told to take his money.'); endQuest(g, 'failed');
        return `You take the strongbox and let the captain go. ${g.name} carries it home and has not spoken to anyone since. His morale falls by 30.`;
      }) },
    ],
  },
  questShrine: {
    title: 'At the shrine', auto: true, can: finaleCan('shrine'), make: finaleMake('shrine'),
    text: c => `The priests at the shrine have heard <b>${gn(c.g)}</b>'s promise, and ask what he will offer. Your school could pay for a full sacrifice, which costs ${c.cost} denarii. Or he can simply offer something of his own.`,
    opts: [
      { label: c => `Pay for a full sacrifice (${c.cost} denarii; Temple favour, morale)`, ok: c => G.denarii >= c.cost, run: c => questMan(c, g => {
        G.denarii -= c.cost; favor('temple', 12); home().forEach(x => { x.morale = clamp(x.morale + 5, 0, 100); });
        questReward(g, 'blessed', 'Paid his vow at the shrine, with a white bull in the house\'s name.');
        return `A white bull is sacrificed in the name of your school. ${g.name} has kept his promise, and people now say the goddess watches over him. The Temple is pleased: favour +12, and morale +5 for every man at home.`;
      }) },
      { label: () => 'Let him offer his hair and his first sword (free)', run: c => questMan(c, g => {
        questReward(g, 'atpeace', 'Paid his vow at the shrine with his hair and his first sword.');
        return `${g.name} leaves his hair and his first wooden sword on the altar. He has kept his promise, and he is at peace now.`;
      }) },
    ],
  },
  questMaster: {
    title: 'The old champion', auto: true, can: finaleCan('master'), make: finaleMake('master'),
    text: c => `You have found the old champion, and he agrees to teach <b>${gn(c.g)}</b> what he knows. He wants ${c.cost} denarii for it, or else a winter's firewood cut and stacked. Then he looks at his leaking roof and adds that, for more money, he might come and work at your school as its trainer.`,
    opts: [
      { label: c => `Pay his fee (${c.cost} denarii; skill +2)`, ok: c => G.denarii >= c.cost, run: c => questMan(c, g => {
        G.denarii -= c.cost; g.stats.skl = Math.min(20, g.stats.skl + 2);
        questReward(g, 'oldschool', 'Learned the old style from the last man who knew it.');
        return `The old champion teaches ${g.name} properly, and he comes home a much better fighter: skill +2, and +5% accuracy from the old style.`;
      }) },
      { label: () => 'Have him pay by cutting firewood (free; skill +1, exhausting)', run: c => questMan(c, g => {
        g.stats.skl = Math.min(20, g.stats.skl + 1); g.fatigue = 90;
        questReward(g, 'oldschool', 'Learned the old style, and paid for it with an axe.');
        return `${g.name} cuts firewood for a week, and then has his lessons. He comes home exhausted, but a better fighter: skill +1, and +5% accuracy from the old style.`;
      }) },
      { label: c => `Hire the old champion as your trainer (${c.cost * 2} denarii)`, ok: c => G.denarii >= c.cost * 2 && staffLvl('doctore') < 3, run: c => questMan(c, g => {
        G.denarii -= c.cost * 2; G.staff.doctore = { name: 'The old master', skill: 3, wage: 5 };
        questReward(g, 'oldschool', 'Brought the old master down from the hills to teach the whole house.');
        return `The old champion rides down from the hills on a mule, with two of his beehives. He is now your school's trainer, of the highest grade, at a wage of 5 denarii a day. ${g.name} gains +5% accuracy from the old style.`;
      }) },
    ],
  },
  questGrave: {
    title: 'At the grave', auto: true, can: finaleCan('grave'), make: finaleMake('grave'),
    text: c => `The grave is dug and filled. <b>${gn(c.g)}</b> stands over it, holding his friend's neck-chain, which he found in the ditch. He asks you how the burial should be finished. Proper funeral games, with a fight held beside the grave, would cost ${c.cost} denarii.`,
    opts: [
      { label: c => `Pay for funeral games (${c.cost} denarii; fame, morale)`, ok: c => G.denarii >= c.cost, run: c => questMan(c, g => {
        const f = 8 + 5 * tier(); G.denarii -= c.cost; G.fame += f; g.fame += f; home().forEach(x => { x.morale = clamp(x.morale + 6, 0, 100); });
        questReward(g, 'atpeace', 'Buried the man he was chained to, with funeral games in the house\'s name.');
        return `Your school holds funeral games at the grave, with a fire, a fight and wine for everyone. People come from farms for miles around to watch. ${g.name} fights in the games himself, and wins. He is at peace now. Fame +${f}, and morale +6 for every man at home.`;
      }) },
      { label: () => 'A simple burial, with his name said aloud (free)', run: c => questMan(c, g => {
        questReward(g, 'atpeace', 'Buried the man he was chained to, and said his name over him.');
        return `${g.name} says his friend's name three times, as his own people do, and buries the chain with him. Then he walks back to the school without looking round. He is at peace now.`;
      }) },
      { label: () => 'He keeps the chain and fights in his friend\'s memory (damage, accuracy)', run: c => questMan(c, g => {
        questReward(g, 'twoshares', 'Buried the man he was chained to, and kept the chain.');
        return `${g.name} winds the chain round his sword wrist and has the smith fasten it there for good. From now on he fights for his friend as well as himself: +4% damage and +3% accuracy.`;
      }) },
    ],
  },
  questBeast: {
    title: 'The beast\'s hide', auto: true, can: finaleCan('beast'), make: finaleMake('beast'),
    text: c => `The beast that scarred <b>${gn(c.g)}</b> and killed his father is dead and skinned. Its hide is the largest your men have ever seen. A dealer would pay ${c.cost} denarii for the hide and skull. ${gn(c.g)} has not asked to keep it, but he is waiting to hear what you decide.`,
    opts: [
      { label: () => 'Let him keep it and wear it in the arena (fame)', run: c => questMan(c, g => {
        const f = 6 + 4 * tier(); G.fame += f; g.fame += f;
        questReward(g, 'beastslayer', 'Killed the beast that marked him as a boy, and wears its hide.');
        return `${g.name} wears the hide into the arena, and the crowd is told its story. Fame +${f}, and he does +20% damage against beasts from now on.`;
      }) },
      { label: () => 'Give it to the temple of Nemesis (Temple favour)', run: c => questMan(c, g => {
        favor('temple', 8);
        questReward(g, 'blessed', 'Killed the beast that marked him as a boy, and gave its hide to Nemesis.');
        return `The hide is hung over the altar of Nemesis, the goddess of debts repaid. The priests have never been given anything like it: Temple favour +8. People now say the goddess watches over ${g.name}, and the crowd will spare him more often when he falls.`;
      }) },
      { label: c => `Sell it (+${c.cost} denarii; morale -20)`, run: c => questMan(c, g => {
        G.denarii += c.cost; g.morale = clamp(g.morale - 20, 0, 100);
        addStory(g, 'Killed the beast that marked him, and saw its hide sold.'); endQuest(g, 'failed');
        return `You sell the hide to the dealer. ${g.name} watches it being rolled up and loaded on a mule. He killed the beast, but he has nothing to show for it: morale -20.`;
      }) },
    ],
  },
  questChild: {
    title: 'His daughter', auto: true, can: finaleCan('child'), make: finaleMake('child'),
    text: c => `The child is a girl, and <b>${gn(c.g)}</b> has given her the toy horse he carved. Her mother is very poor: she lives in a hut that is not hers, and owes money to its owner. For ${c.cost} denarii you could buy them a small farm of their own. ${gn(c.g)} knows your school has no reason to spend that on him.`,
    opts: [
      { label: c => `Buy them a farm (${c.cost} denarii)`, ok: c => G.denarii >= c.cost, run: c => questMan(c, g => {
        G.denarii -= c.cost;
        questReward(g, 'atpeace', 'Found his daughter, and saw her and her mother settled on land of their own.');
        return `You buy them a small farm with a well, in the woman's name. ${g.name} is too moved to thank you. He is at peace now.`;
      }) },
      { label: () => 'Let him send them his winnings after every games (free)', run: c => questMan(c, g => {
        questReward(g, 'provider', 'Found his daughter. Somebody eats by what he wins.');
        return `It is arranged: a cart driver will carry his winnings to them after every games. ${g.name} now has someone depending on him, and fights more carefully and more sharply for it: +3% dodge, and +3% chance of a critical hit.`;
      }) },
      { label: () => 'He has seen them. March on (morale -25)', run: c => questMan(c, g => {
        g.morale = clamp(g.morale - 25, 0, 100); addStory(g, 'Stood at his daughter\'s door once, and was marched away.'); endQuest(g, 'failed');
        return `You order the school to march on, and ${g.name} obeys. The child waves until you are out of sight. He does not turn round, and it hurts him not to: morale -25.`;
      }) },
    ],
  },
  questBetrayer: {
    title: 'His cousin', auto: true, can: finaleCan('betrayer'), make: finaleMake('betrayer'),
    text: c => `<b>${gn(c.g)}</b> has his cousin on his knees, held by the hair. The cousin is begging, and offering the farm, his money, anything. He is a Roman citizen, so if he is killed the Magistrate will want to know why. ${gn(c.g)} looks at you and waits to be told what to do.`,
    opts: [
      { label: () => 'Let him kill his cousin (Magistrate favour -5)', run: c => questMan(c, g => {
        g.kills++; favor('magistrate', -5);
        questReward(g, 'bloodoath', 'Killed the cousin who sold him.');
        return `${g.name} kills his cousin in the yard, in front of the whole household. His debt of blood is paid, and he fights harder for it: +8% damage from now on. The Magistrate hears that your gladiator has killed a citizen: favour -5.`;
      }) },
      { label: c => `Make the cousin sign over all he owns (+${c.cost * 2} denarii)`, run: c => questMan(c, g => {
        G.denarii += c.cost * 2;
        questReward(g, null, 'Took back from his cousin, by deed and seal, what he was sold for.');
        return `The cousin signs over everything he owns, including the farm that ${g.name} was sold to pay for. Your school sells it the same day. The cousin leaves the province on foot, with nothing.`;
      }) },
      { label: () => 'Let the cousin go, publicly shamed (fame, Temple favour)', run: c => questMan(c, g => {
        const f = 5 + 3 * tier(); favor('temple', 6); G.fame += f; g.fame += f;
        questReward(g, 'atpeace', 'Had the cousin who sold him under his hand, and let him live.');
        return `${g.name} lets go of him. He tells the whole household, loudly, what his cousin did to him, and then walks out of the gate. The cousin will have to live among people who know. ${g.name} is at peace now. Temple favour +6, fame +${f}.`;
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
