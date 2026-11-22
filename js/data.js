'use strict';
// Static game data: fighting styles, origins, traits, gear, facilities.

// Three skills. Each beats one of the others (see abilities.js): Strength beats Agility, Agility beats Skill, Skill beats Strength.
const STATS = ['str', 'agi', 'skl'];
const STAT_NAMES = { str: 'Strength', agi: 'Agility', skl: 'Skill' };

const CLASSES = {
  murmillo: {
    name: 'Murmillo', desc: 'Short sword and a great shield. A wall that hits back.',
    reach: 15, dmg: 9.5, speed: 0.95, atkTime: 1.07, block: 0.26, dodge: 0.04, armor: 1.7,
    shield: 'big', weapon: 'gladius', helm: 'crest', bias: { str: 3, agi: 1, skl: 2 },
  },
  thraex: {
    name: 'Thraex', desc: 'Curved blade and a small shield. Finds the gaps in armour.',
    reach: 14, dmg: 9.2, speed: 1.05, atkTime: 0.98, block: 0.15, dodge: 0.10, crit: 0.10, armor: 1,
    shield: 'small', weapon: 'sica', helm: 'griffin', bias: { str: 3, agi: 2, skl: 3 },
  },
  retiarius: {
    name: 'Retiarius', desc: 'Trident and net. Quick and fragile; snares a foe, then strikes from range.',
    reach: 24, dmg: 9.7, speed: 1.2, atkTime: 1.03, block: 0, dodge: 0.23, armor: 0,
    shield: null, weapon: 'trident', helm: null, net: true, bias: { str: 2, agi: 3, skl: 3 },
  },
  hoplomachus: {
    name: 'Hoplomachus', desc: 'Spear and round shield. Strikes first and keeps his distance.',
    reach: 22, dmg: 10, speed: 1.0, atkTime: 1.12, block: 0.18, dodge: 0.08, armor: 1,
    shield: 'small', weapon: 'spear', helm: 'plume', bias: { str: 2, agi: 2, skl: 3 },
  },
  dimachaerus: {
    name: 'Dimachaerus', desc: 'Two blades and no shield. Kills quickly or dies quickly.',
    reach: 13, dmg: 7.9, speed: 1.1, atkTime: 0.61, block: 0, dodge: 0.18, armor: 0,
    shield: null, weapon: 'twin', helm: 'band', bias: { str: 3, agi: 3, skl: 1 },
  },
};

const ORIGINS = [
  { name: 'Gaul', skin: '#e3b48f', hair: ['#b5842d', '#7a4a1e', '#c9a24a'],
    names: ['Brennos', 'Ambiorix', 'Dumnac', 'Vercas', 'Lugos', 'Segomar', 'Taran', 'Catuvel'] },
  { name: 'Thrace', skin: '#d9a57c', hair: ['#3a2a1c', '#5a3a22', '#1e1612'],
    names: ['Rhesos', 'Sitalkes', 'Dromos', 'Kotys', 'Bithus', 'Zalmos', 'Teres', 'Mukas'] },
  { name: 'Numidia', skin: '#8a5a3a', hair: ['#15100d', '#241812'],
    names: ['Juba', 'Massin', 'Gauda', 'Tacfar', 'Adher', 'Micip', 'Zelal', 'Narava'] },
  { name: 'Germania', skin: '#ebc3a0', hair: ['#d2b25a', '#b88a3a', '#8a5a2a'],
    names: ['Arnulf', 'Segest', 'Ingmar', 'Gund', 'Maro', 'Catual', 'Ermin', 'Wulfar'] },
  { name: 'Hispania', skin: '#c9966c', hair: ['#2a1c14', '#3c2a1c'],
    names: ['Indibil', 'Viriat', 'Corbis', 'Orsua', 'Tautal', 'Luxin', 'Caro', 'Besadin'] },
  { name: 'Greece', skin: '#d6a47a', hair: ['#2a1c14', '#4a3320', '#1a1410'],
    names: ['Nikandros', 'Phaidon', 'Lykos', 'Damon', 'Kleitos', 'Xanthos', 'Theron', 'Ajax'] },
  { name: 'Britannia', skin: '#ecc6a6', hair: ['#a8452a', '#7a3a1e', '#c56a32'],
    names: ['Cadoc', 'Brannoc', 'Tasgo', 'Cunobel', 'Addomar', 'Togod', 'Venut', 'Dubnov'] },
  { name: 'Syria', skin: '#b98660', hair: ['#18120e', '#2a1e16'],
    names: ['Barates', 'Malchos', 'Zabdas', 'Hairan', 'Iamlik', 'Sohaem', 'Azizos', 'Bolan'] },
];

const RIVAL_HOUSES = ['Ludus Corvinus', 'House Aquila', 'Ludus Ferox', 'The Sons of Dis', 'Ludus Vespa', 'House Lupara', 'Ludus Aureus'];

const TRAITS = {
  brute:       { name: 'Brute',       good: true,  desc: '+12% damage, slightly easier to hit.' },
  quick:       { name: 'Quick hands', good: true,  desc: 'Attacks 10% faster.' },
  ironhide:    { name: 'Ironhide',    good: true,  desc: '+15% health.' },
  showy:       { name: 'Showman',     good: true,  desc: 'Every blow thrills the crowd more.' },
  keen:        { name: 'Keen eye',    good: true,  desc: '+6% chance of a telling blow.' },
  disciplined: { name: 'Disciplined', good: true,  desc: 'Trains 20% faster.' },
  tireless:    { name: 'Tireless',    good: true,  desc: 'Training tires him 30% less.' },
  bloodthirsty:{ name: 'Bloodthirsty',good: true,  desc: '+15% damage against wounded foes.' },
  lionheart:   { name: 'Lionheart',   good: true,  desc: '+20% damage when badly hurt.' },
  lazy:        { name: 'Lazy',        good: false, desc: 'Trains 20% slower.' },
  frail:       { name: 'Frail',       good: false, desc: 'Injuries take half again as long to heal.' },
  nervous:     { name: 'Nervous',     good: false, desc: '-5% accuracy before a crowd.' },
  guarded:     { name: 'Guarded',     good: true,  desc: '+5% to dodge and block.' },
  ironlungs:   { name: 'Iron lungs',  good: true,  desc: 'His charge fills a quarter faster, so his abilities come round sooner.' },
  thickskin:   { name: 'Thick skin',  good: true,  desc: 'Shrugs 2 damage off every blow.' },
  killer:      { name: 'Killer instinct', good: true, desc: 'Telling blows hit far harder.' },
  steady:      { name: 'Steady',      good: true,  desc: 'Morale never falls below half.' },
  duelist:     { name: 'Duelist',     good: true,  desc: '+10% damage and +4% dodge when he fights alone.' },
  shieldmate:  { name: 'Shoulder to shoulder', good: true, desc: '+8% damage, and takes 8% less, when he fights beside others.' },
  opener:      { name: 'First to strike', good: true, desc: 'Begins every fight with his charge half full.' },
  finisher:    { name: 'Finisher',    good: true,  desc: '+25% damage against a foe below a third of his health.' },
  fleet:       { name: 'Fleet of foot', good: true, desc: 'Moves 15% faster and dodges 3% more.' },
  ironwill:    { name: 'Iron will',   good: true,  desc: 'Stuns are 30% shorter, and nets hold him a third less long.' },
  mender:      { name: 'Quick to mend', good: true, desc: 'A day of rest restores 30% more health and sheds 20% more fatigue.' },
  quickstudy:  { name: 'Quick study', good: true,  desc: 'Every use of an ability counts twice towards mastering it.' },
  teacher:     { name: 'Born teacher', good: true, desc: 'When he teaches, his pupils learn a further 15% faster.' },
  darling:     { name: 'The crowd\'s darling', good: true, desc: 'A bout he helps to win earns a fifth more fame.' },
  // one for each way of fighting: offered only to a man who fights that way, from Veteranus up
  testudo:     { name: 'Tortoise',    good: true, special: true, cls: 'murmillo', desc: 'The Murmillo\'s craft: +8% block, and armour takes a further 1 off every blow.' },
  undershield: { name: 'Under the shield', good: true, special: true, cls: 'thraex', desc: 'The Thraex\'s craft: his blows are blocked a third less often.' },
  longnet:     { name: 'Weighted net', good: true, special: true, cls: 'retiarius', desc: 'The Retiarius\'s craft: his nets hold a quarter longer.' },
  longreach:   { name: 'The long spear', good: true, special: true, cls: 'hoplomachus', desc: 'The Hoplomachus\'s craft: he strikes from further off, and 6% harder.' },
  twinfury:    { name: 'Twin fury',   good: true, special: true, cls: 'dimachaerus', desc: 'The Dimachaerus\'s craft: attacks 8% faster, and +5% chance of a telling blow.' },
  laureate:    { name: 'Laureate',    good: true,  special: true, desc: 'A tournament champion. The crowd roars at everything he does.' },
  heirblood:   { name: 'Blood of the house', good: true, special: true, desc: '+8% health. The family has always fed its fighters well.' },
  embittered:  { name: 'Embittered',  good: false, special: true, desc: 'Was promised his freedom and denied it. Trains 30% slower and hits without heart.' },
  // earned away from the ludus, on contracts
  beastslayer: { name: 'Beast-slayer', good: true, special: true, desc: 'Has hunted in the wild. +20% damage against beasts.' },
  travelled:   { name: 'Well-travelled', good: true, special: true, desc: 'Knows the roads and the people on them. Better suited to any work away from the ludus.' },
  watchful:    { name: 'Bodyguard\'s eye', good: true, special: true, desc: 'Sees the blow before it starts. +3% to dodge and block.' },
  pitfighter:  { name: 'Pit-fighter',  good: true, special: true, desc: 'Learned in tavern pits where nobody stops the fight. +8% damage in a duel.' },
  drillmaster: { name: 'Drillmaster',  good: true, special: true, desc: 'Teaching it taught him. Every other fighter at home trains 5% faster.' },
  blessed:     { name: 'Favoured of Nemesis', good: true, special: true, desc: 'The crowd has heard the goddess watches him. Spared more often when he falls.' },
  // earned by finishing a journey of his own
  atpeace:     { name: 'At peace',     good: true, special: true, desc: 'The thing that ate at him is settled. Morale never falls below 60, and he will never desert.' },
  bloodoath:   { name: 'Blood-debt paid', good: true, special: true, desc: 'He has killed the men he lived to kill. +8% damage.' },
  twoshares:   { name: 'Fights for two', good: true, special: true, desc: 'Wears a dead man\'s chain on his sword wrist. +4% damage and +3% accuracy.' },
  provider:    { name: 'Somebody waiting', good: true, special: true, desc: 'A child eats by what he wins. +3% to dodge, and telling blows come 3% more often.' },
  oldschool:   { name: 'Old school',   good: true, special: true, desc: 'Taught by a master of the old style. +5% accuracy.' },
  // earned out in the province
  gravewise:   { name: 'Grave-wise',   good: true, special: true, desc: 'Knows where the dead kept their silver. While he is with the school, ruins and tombs give up half as much again.' },
  reaver:      { name: 'Outlaw-hunter', good: true, special: true, desc: 'Has fought where there is no sand and no rules. +10% damage in any fight outside the arena.' },
  eaglesworn:  { name: 'Eagle-sworn',  good: true, special: true, desc: 'Trains under the eagle of the Seventeenth. +5% damage, and trains 5% faster.' },
};

// ---------- equipment ----------
// Every piece has a rarity from F (worst) to S. Weapons fit one fighting style; armour fits anyone.
const RARITY = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];
const MATERIAL = ['Rusted', 'Worn', 'Bronze', 'Iron', 'Steel', 'Gilded', 'Imperial'];
const SLOTS = ['weapon', 'head', 'chest', 'legs', 'arms', 'shoulders'];
const ARMOR_SLOTS = ['head', 'chest', 'legs', 'arms', 'shoulders'];
// price: share of the rarity's base price. share: how much of a full set's protection this piece carries.
const SLOT_INFO = {
  weapon:    { name: 'Weapon',    piece: '',          price: 1.3, share: 0 },
  head:      { name: 'Head',      piece: 'helm',      price: 0.7, share: 0.2 },
  chest:     { name: 'Chest',     piece: 'cuirass',   price: 1.0, share: 0.4 },
  legs:      { name: 'Legs',      piece: 'greaves',   price: 0.5, share: 0.15 },
  arms:      { name: 'Arms',      piece: 'arm guard', price: 0.5, share: 0.125 },
  shoulders: { name: 'Shoulders', piece: 'pauldrons', price: 0.5, share: 0.125 },
};
const WEAPON_NAMES = { murmillo: 'gladius', thraex: 'sica', retiarius: 'trident', hoplomachus: 'spear', dimachaerus: 'twin blades' };
const ITEM_PRICE = [35, 65, 115, 200, 340, 560, 900];       // by rarity, before the slot's price factor
const WEAPON_DMG = [1, 1.8, 2.6, 3.6, 4.6, 5.6, 7];        // damage added per blow
const ARMOR_TOTAL = [0.8, 1.4, 2.1, 2.9, 3.8, 4.8, 6];     // damage a full five-piece set takes off each blow
const SMITH_NAMES = ['Village smith', 'Journeyman smith', 'Armourer', 'Master armourer', 'Imperial armourer'];
const SMITH_COST = [250, 600, 1200, 2200];                // to reach levels 1 to 4
// chance (out of 100) of each rarity F..S appearing in his stock, by level
const SMITH_ODDS = [
  [50, 35, 15, 0, 0, 0, 0],
  [25, 35, 25, 15, 0, 0, 0],
  [0, 20, 30, 30, 17, 3, 0],
  [0, 0, 15, 30, 30, 20, 5],
  [0, 0, 0, 15, 30, 35, 20],
];

const FACILITIES = {
  barracks:  { name: 'Barracks',        desc: 'Cells for your fighters.', effect: l => `Room for ${3 + 2 * l} gladiators` },
  ground:    { name: 'Training ground', desc: 'Posts, weights and a doctore to shout at them.', effect: l => l ? `Every man trains ${20 * l}% faster` : 'Bare sand: no help to training' },
  infirmary: { name: 'Infirmary',       desc: 'A medicus, clean linen, sour wine.', effect: l => l ? `A day's rest restores ${22 + 8 * l}% of health, wounds mend sooner, the fallen are ${4 * l}% likelier to live` : `A day's rest restores 22% of health` },
  baths:     { name: 'Baths',           desc: 'Hot water does what the whip cannot.', effect: l => `A day's rest sheds ${30 + 8 * l} fatigue and lifts morale by ${2 + 2 * l}` },
  shrine:    { name: 'Shrine', desc: 'An altar of your own in the Temple precinct, for the gods of the house, and for Nemesis.', effect: l => l ? `Morale settles ${3 * l} higher, and the fallen are ${2 * l}% likelier to live` : 'No shrine: the men pray where they can' },
  stores:    { name: 'Granary & garden', desc: 'Dry storage, a kitchen garden, a pig.', effect: l => l ? `Food costs ${10 * l}% less` : 'Everything is bought at the gate, at the gate\'s price' },
  eagle:     { name: 'Eagle', desc: 'A hunting eagle, kept in a mews at the stables and flown over the column on the march.', effect: l => l ? `In the province you see ${20 * l}% further, and are likelier by ${15 * l} in the hundred to learn how strong an enemy is before you fight` : 'No bird: the school sees what a man on foot sees' },
  stables:   { name: 'Stables & carts', desc: 'Mules, a wagon, and a boy who knows the roads.', effect: l => l ? `In the province the column goes ${12 * l}% further in a day` : 'The school marches on its own feet' },
};
// How hard the men are worked. rate: how fast they learn. tire: what a day's drill costs them. morale: where spirits settle.
const REGIMENS = [
  { name: 'Light',  rate: 0.85, tire: 0.7, morale: 3,  what: 'Short days and long meals.' },
  { name: 'Steady', rate: 1,    tire: 1,   morale: 0,  what: 'The usual round.' },
  { name: 'Hard',   rate: 1.18, tire: 1.3, morale: -5, what: 'Dawn to dark, and the whip for stragglers.' },
];
const FAC_COST = [150, 400, 900];

const RATIONS = [
  { name: 'Gruel',          cost: 2, morale: 35 },
  { name: 'Barley & beans', cost: 4, morale: 60 },
  { name: 'Meat & wine',    cost: 8, morale: 85 },
];

const TIERS = [
  { name: 'Village Pits',      fame: 0 },
  { name: 'Provincial Arena',  fame: 100 },
  { name: 'City Amphitheatre', fame: 300 },
  { name: 'The Great Arena',   fame: 700 },
];
const FINAL_FAME = 1100;
const GAMES_EVERY = 5;

const ACTIVITIES = { rest: 'Rest', str: 'Train strength', agi: 'Train agility', skl: 'Train skill', spar: 'Spar (needs a doctore)' };

const TACTICS = {
  balanced:   { name: 'Balanced',   desc: 'No orders. Fights as he was taught.' },
  aggressive: { name: 'Aggressive', desc: 'Hits harder and faster, guards worse.' },
  defensive:  { name: 'Defensive',  desc: 'Guards better, hits softer and slower.' },
  showman:    { name: 'Play to the crowd', desc: 'Slower, but the crowd loves it: more fame.' },
};

const RANKS = [
  { name: 'Tiro', xp: 0 },
  { name: 'Gregarius', xp: 6 },
  { name: 'Veteranus', xp: 16 },
  { name: 'Primus Palus', xp: 32 },
  { name: 'Champion', xp: 55 },
];

const STAFF_ROLES = {
  doctore: { name: 'Doctore', desc: s => `Training +${15 * s}%. Fighters may spar.` },
  medicus: { name: 'Medicus', desc: s => `Injuries often mend a day sooner (${15 * s}% each day). The fallen are ${3 * s}% likelier to live.` },
  cook:    { name: 'Cook',    desc: s => `Morale settles ${5 * s} higher. A day's rest restores ${4 * s}% more health.` },
  scout:   { name: 'Scout',   desc: s => `Reveals a recruit's talent before you buy${s >= 2 ? ', finds an extra recruit' : ''}${s >= 3 ? ', haggles prices down 10%' : ''}.` },
  unctor:  { name: 'Unctor',  desc: s => `A day's rest sheds ${5 * s} more fatigue. Training tires ${6 * s}% less.` },
  dispensator: { name: 'Dispensator', desc: s => `Keeps the books: food and wages cost ${6 * s}% less.` },
  faber:   { name: 'Armourer', desc: s => `Blades he keeps do ${(0.3 * s).toFixed(1)} more damage, and armour takes ${(0.25 * s).toFixed(2)} more off a blow.` },
};
const STAFF_GRADES = ['', 'Journeyman', 'Seasoned', 'Master'];
const STAFF_NAMES = ['Sabinus', 'Rufus', 'Felix', 'Priscus', 'Macer', 'Celer', 'Dama', 'Hermes', 'Eros', 'Niger', 'Philo', 'Syrus', 'Glaucus', 'Stichus', 'Onesimus', 'Tertius'];

const PATRONS = {
  magistrate: {
    name: 'The Magistrate', desc: 'He stages the games. His favour fattens every purse.',
    perk: f => `Purses +${Math.round(f * 0.3)}%${f >= 60 ? ', and an extra bout at every games' : ' (an extra bout at 60 favour)'}`,
  },
  guild: {
    name: 'The Grain Guild', desc: 'Merchants who like their name shouted in the arena, and gamblers who like to know the result.',
    perk: () => `A stipend of ${stipend()} denarii a day`,
  },
  temple: {
    name: 'The Temple of Nemesis', desc: 'Gladiators pray to her. So does the crowd.',
    perk: f => `Morale +${Math.round(f / 10)}. The fallen are spared more often (+${Math.round(f * 0.1)}%)`,
  },
};

// The rival schools. Each has its own colours and its own way of fighting.
const HOUSES = [
  { id: 'corvinus', name: 'Ludus Corvinus', lanista: 'Decimus Corvinus', col: '#6a6c86', colD: '#3a3b52', trait: 'butchers', start: 30, rate: 9,
    blurb: 'Butchers. They ask for bouts to the death and send men who only know how to attack.' },
  { id: 'vespa', name: 'Ludus Vespa', lanista: 'Vibia Vespa', col: '#c9a21e', colD: '#7d6410', trait: 'quick', start: 80, rate: 11,
    blurb: 'Net-men and knife-men. Fast, light and hard to pin down.' },
  { id: 'ferox', name: 'Ludus Ferox', lanista: 'Titus Ferox', col: '#3f8a3a', colD: '#255423', trait: 'savage', start: 150, rate: 13,
    blurb: 'Big men bought on the northern frontier. Every one of them hits like falling masonry.' },
  { id: 'dis', name: 'The Sons of Dis', lanista: 'Charun the priest', col: '#8a45ad', colD: '#522569', trait: 'fanatics', start: 250, rate: 15,
    blurb: 'Sworn to the god below. They do not yield, and they fight hardest when nearly dead.' },
  { id: 'aquila', name: 'House Aquila', lanista: 'Senator Marcus Aquila', col: '#2f6db8', colD: '#1d4577', trait: 'wealthy', start: 380, rate: 18,
    blurb: 'Old money. Every fighter carries better steel than his rank deserves.' },
];

// Animals for the beast hunts. They use the same combat numbers as a fighting style.
const BEASTS = {
  boar: { name: 'Boar', beast: true, move: 'charge', reach: 12, dmg: 9, speed: 1.2, atkTime: 1.0, block: 0, dodge: 0.06, armor: 1,
          shield: null, weapon: 'tusks', bias: { str: 3, agi: 2, skl: 1 }, hpMult: 1.2, budget: 1.05, pw: 0.82 },
  wolf: { name: 'Wolf', beast: true, move: null, reach: 11, dmg: 10, speed: 1.35, atkTime: 0.72, block: 0, dodge: 0.16, armor: 0,
          shield: null, weapon: 'bite', bias: { str: 2, agi: 4, skl: 2 }, hpMult: 1.0, budget: 0.95, pw: 0.62 },
  lion: { name: 'Lion', beast: true, move: 'pounce', reach: 13, dmg: 10, speed: 1.25, atkTime: 0.85, block: 0, dodge: 0.12, crit: 0.14, armor: 0,
          shield: null, weapon: 'claws', bias: { str: 3, agi: 3, skl: 2 }, hpMult: 1.1, budget: 1.0, pw: 1.0 },
  bear: { name: 'Bear', beast: true, move: 'maul', reach: 14, dmg: 11, speed: 0.95, atkTime: 1.25, block: 0, dodge: 0.03, armor: 1.5,
          shield: null, weapon: 'claws', bias: { str: 4, agi: 1, skl: 1 }, hpMult: 1.25, budget: 1.1, pw: 1.0 },
};

const FESTIVAL_EVERY = 15;
const FESTIVALS = {
  hunt:    { name: 'The Beast Hunt', blurb: 'Animals from across the empire are loosed on the sand. Beasts give no quarter and take none, and the crowd adores a man who kills one.' },
  melee:   { name: 'The Great Melee', blurb: 'A battle restaged with live steel: four or five a side against a single rival house.' },
  funeral: { name: 'Funeral Games', blurb: 'A great man is dead and his heirs honour him in blood. Every bout is to the death, and every purse is far richer.' },
  tourney: { name: 'The Laurel Tournament', blurb: 'Eight fighters, three rounds, one day. The last man standing takes the laurel.' },
  triumph: { name: 'A Triumph', blurb: 'A general is home from the frontier, and his prisoners are given swords. The captives fight to the death for rich purses, and the dealer sells what is left of them a fifth cheaper that day.' },
  saturnalia: { name: 'Saturnalia', blurb: 'The world is turned upside down. No bout is to the death, every bout earns far more fame, the bookmakers pay a quarter more, and the men are given the run of the wine.' },
  mars: { name: 'The Games of Mars', blurb: 'Three rich duels, each open to one way of fighting only: one for strength, one for agility, one for skill. A school with only one kind of man will sit most of it out.' },
};
// What must be won on the day to be crowned victor of each festival.
const FEST_CROWN = { hunt: 3, melee: 1, funeral: 3, tourney: 0, triumph: 2, saturnalia: 3, mars: 2 };
const ROUND_NAMES = ['Quarter-final', 'Semi-final', 'Final'];

// ---------- the dynasty ----------
// When debt takes the ludus, an heir begins again. What the family keeps comes in two kinds.

// Bought with legacy points at each succession. cost[i] is the price of level i + 1.
const LEGACY_TREE = {
  purse:  { name: 'The family silver',     cost: [15, 25, 40], desc: l => `Begin with ${50 * l} more denarii.` },
  blood:  { name: 'Good stock',            cost: [15, 30, 45], desc: l => `Your first fighters begin with ${2 * l} more stat points each.` },
  name:   { name: 'The family name',       cost: [20, 40],     desc: l => `Begin with ${25 * l} fame.` },
  credit: { name: 'A patient creditor',    cost: [15, 30],     desc: l => `${2 * l} more days of grace when in debt.` },
  cells:  { name: 'Deeds to the cells',    cost: [30],         desc: () => 'The barracks begin one level higher.' },
  yard:   { name: 'The old training yard', cost: [30],         desc: () => 'The training ground begins one level higher.' },
  forge:  { name: 'The family smith',      cost: [35],         desc: () => 'The blacksmith begins one level higher.' },
};

// One of three is offered at each succession and kept for good. Higher tiers are offered to houses that got further.
const BOONS = {
  doctore:   { tier: 1, name: 'The old doctore',        desc: 'He trained your father\'s men and will train yours. A journeyman doctore from the first day, unpaid.' },
  cook:      { tier: 1, name: 'The family cook',        desc: 'A journeyman cook from the first day, unpaid.' },
  magistrate:{ tier: 1, name: 'A friend at the forum',  desc: 'The Magistrate remembers the family. Begin with 20 more of his favour.' },
  guild:     { tier: 1, name: 'An old partnership',     desc: 'The Grain Guild remembers the family. Begin with 20 more of its favour.' },
  temple:    { tier: 1, name: 'A family altar',         desc: 'The Temple remembers the family. Begin with 20 more of its favour.' },
  grain:     { tier: 1, name: 'A standing grain order', desc: 'Rations cost one denarius less per man each day.' },
  blade:     { tier: 1, name: 'An heirloom blade',      desc: 'Your first fighter begins with a C-grade weapon.' },
  scout:     { tier: 2, name: 'The family\'s eye',      desc: 'A journeyman scout from the first day, unpaid. You always see a recruit\'s talent.' },
  veteran:   { tier: 2, name: 'A proven man',           desc: 'Your first fighter begins one rank up, with a perk to choose.' },
  bargain:   { tier: 2, name: 'The smith owes a debt',  desc: 'Everything at the blacksmith costs 15% less.' },
  crowd:     { tier: 2, name: 'A name they know',       desc: 'Every victory earns 10% more fame.' },
  third:     { tier: 2, name: 'A cousin\'s fighter',    desc: 'Begin with three fighters, not two.' },
  medicus:   { tier: 3, name: 'The family physician',   desc: 'A seasoned medicus from the first day, unpaid.' },
  laurel:    { tier: 3, name: 'Old glory',              desc: 'Every purse you win is 10% richer.' },
  heirblood: { tier: 3, name: 'Blood of the house',     desc: 'Every fighter who joins your ludus has 8% more health.' },
  panoply:   { tier: 3, name: 'The ancestral panoply',  desc: 'Begin with a B-grade weapon for your first fighter and a B-grade cuirass.' },
};
const GRACE_DAYS = 3;
