'use strict';
// Static game data: fighting styles, origins, traits, gear, facilities.

const STATS = ['str', 'agi', 'end', 'skl'];
const STAT_NAMES = { str: 'Strength', agi: 'Agility', end: 'Endurance', skl: 'Skill' };

const CLASSES = {
  murmillo: {
    name: 'Murmillo', desc: 'Short sword and a great shield. A wall that hits back.',
    reach: 15, dmg: 9, speed: 0.95, atkTime: 1.1, block: 0.24, dodge: 0.04, armor: 1.5,
    shield: 'big', weapon: 'gladius', helm: 'crest', bias: { str: 3, agi: 1, end: 3, skl: 2 },
  },
  thraex: {
    name: 'Thraex', desc: 'Curved blade and a small shield. Finds the gaps in armour.',
    reach: 14, dmg: 10, speed: 1.05, atkTime: 0.95, block: 0.15, dodge: 0.10, crit: 0.12, armor: 1,
    shield: 'small', weapon: 'sica', helm: 'griffin', bias: { str: 3, agi: 2, end: 1, skl: 3 },
  },
  retiarius: {
    name: 'Retiarius', desc: 'Trident and net. Quick and fragile; snares a foe, then strikes from range.',
    reach: 24, dmg: 9, speed: 1.2, atkTime: 1.05, block: 0, dodge: 0.22, armor: 0,
    shield: null, weapon: 'trident', helm: null, net: true, bias: { str: 2, agi: 3, end: 2, skl: 3 },
  },
  hoplomachus: {
    name: 'Hoplomachus', desc: 'Spear and round shield. Strikes first and keeps his distance.',
    reach: 22, dmg: 10, speed: 1.0, atkTime: 1.12, block: 0.18, dodge: 0.08, armor: 1,
    shield: 'small', weapon: 'spear', helm: 'plume', bias: { str: 2, agi: 2, end: 2, skl: 3 },
  },
  dimachaerus: {
    name: 'Dimachaerus', desc: 'Two blades and no shield. Kills quickly or dies quickly.',
    reach: 13, dmg: 7, speed: 1.1, atkTime: 0.63, block: 0, dodge: 0.15, armor: 0,
    shield: null, weapon: 'twin', helm: 'band', bias: { str: 3, agi: 3, end: 2, skl: 1 },
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
  ironlungs:   { name: 'Iron lungs',  good: true,  desc: '+30% stamina and recovery.' },
  thickskin:   { name: 'Thick skin',  good: true,  desc: 'Shrugs 2 damage off every blow.' },
  killer:      { name: 'Killer instinct', good: true, desc: 'Telling blows hit far harder.' },
  steady:      { name: 'Steady',      good: true,  desc: 'Morale never falls below half.' },
  laureate:    { name: 'Laureate',    good: true,  special: true, desc: 'A tournament champion. The crowd roars at everything he does.' },
};

const WEAPON_TIERS = ['Worn', 'Iron', 'Steel', 'Masterwork'];
const ARMOR_TIERS = ['Bare', 'Padded', 'Bronze', 'Lorica'];
const GEAR_COST = [0, 60, 150, 350];

const FACILITIES = {
  barracks:  { name: 'Barracks',        desc: 'Cells for your fighters.', effect: l => `Room for ${3 + 2 * l} gladiators` },
  ground:    { name: 'Training ground', desc: 'Posts, weights and a doctore to shout at them.', effect: l => `Training speed +${20 * l}%` },
  infirmary: { name: 'Infirmary',       desc: 'A medicus, clean linen, sour wine.', effect: l => `Faster healing, better odds of surviving a fall (level ${l})` },
  baths:     { name: 'Baths',           desc: 'Hot water does what the whip cannot.', effect: l => `Rest restores more, morale rises (level ${l})` },
};
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

const ACTIVITIES = { rest: 'Rest', str: 'Train strength', agi: 'Train agility', end: 'Train endurance', skl: 'Train skill', spar: 'Spar (needs a doctore)' };

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
  medicus: { name: 'Medicus', desc: s => `Wounds mend faster. The fallen are likelier to live (+${3 * s}%).` },
  cook:    { name: 'Cook',    desc: s => `Morale +${5 * s}. Rest restores more health.` },
  scout:   { name: 'Scout',   desc: s => `Reveals a recruit's talent before you buy${s >= 2 ? ', finds an extra recruit' : ''}${s >= 3 ? ', haggles prices down 10%' : ''}.` },
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
          shield: null, weapon: 'tusks', bias: { str: 3, agi: 2, end: 3, skl: 1 }, hpMult: 1.2, budget: 1.05, pw: 0.82 },
  wolf: { name: 'Wolf', beast: true, move: null, reach: 11, dmg: 10, speed: 1.35, atkTime: 0.72, block: 0, dodge: 0.16, armor: 0,
          shield: null, weapon: 'bite', bias: { str: 2, agi: 4, end: 2, skl: 2 }, hpMult: 1.0, budget: 0.95, pw: 0.62 },
  lion: { name: 'Lion', beast: true, move: 'pounce', reach: 13, dmg: 10, speed: 1.25, atkTime: 0.85, block: 0, dodge: 0.12, crit: 0.14, armor: 0,
          shield: null, weapon: 'claws', bias: { str: 3, agi: 3, end: 2, skl: 2 }, hpMult: 1.1, budget: 1.0, pw: 1.0 },
  bear: { name: 'Bear', beast: true, move: 'maul', reach: 14, dmg: 11, speed: 0.95, atkTime: 1.25, block: 0, dodge: 0.03, armor: 1.5,
          shield: null, weapon: 'claws', bias: { str: 4, agi: 1, end: 4, skl: 1 }, hpMult: 1.25, budget: 1.1, pw: 1.0 },
};

const FESTIVAL_EVERY = 15;
const FESTIVALS = {
  hunt:    { name: 'The Beast Hunt', blurb: 'Animals from across the empire are loosed on the sand. Beasts give no quarter and take none, and the crowd adores a man who kills one.' },
  melee:   { name: 'The Great Melee', blurb: 'A battle restaged with live steel: four or five a side against a single rival house.' },
  funeral: { name: 'Funeral Games', blurb: 'A great man is dead and his heirs honour him in blood. Every bout is to the death, and every purse is far richer.' },
  tourney: { name: 'The Laurel Tournament', blurb: 'Eight fighters, three rounds, one day. The last man standing takes the laurel.' },
};
const ROUND_NAMES = ['Quarter-final', 'Semi-final', 'Final'];
