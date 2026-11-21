'use strict';
// Interface: screens, modals, and the arena overlay.

const ui = { tab: 'ludus', sel: null, picks: {}, wagers: {}, cpicks: {}, qwith: {}, dtab: 'stats', noyard: false };
try { ui.noyard = localStorage.getItem('ludus-magnus-yard') === 'off'; ui.autoCast = localStorage.getItem('ludus-magnus-autocast') === '1'; } catch (e) { /* storage unavailable */ }
const $ = s => document.querySelector(s);
const pct = (v, m) => Math.round(clamp(v / m, 0, 1) * 100);
const bar = (cls, v, m) => `<div class="bar ${cls}"><i style="width:${pct(v, m)}%"></i></div>`;

// ---------- tooltips ----------

const TIPS = {
  day: 'Each day every fighter trains or rests, and you pay for food and wages.',
  denarii: 'Your money, and what an ordinary day costs or earns you after food, wages and the Guild stipend.\nStay in debt past the days of grace and the creditors take the ludus; an heir then begins again.',
  fame: 'Fame comes from winning bouts, and more from exciting ones. It opens greater arenas with richer purses and stronger opponents.',
  games: 'Games are held every fifth day. Bouts can only be fought on a games day.',
  skip: 'Advance day by day until the games, stopping early if an event needs your decision or men come home from the road. Key: G',
  steward: 'Starts the walk through the first week again from the beginning, and has the steward explain each new thing the first time it happens.',
  endday: 'Every fighter trains or rests, you pay for food and wages, and tomorrow comes. Key: E',
  saves: 'Save slots, backups, export and import.',
  health: 'Carried into the arena as it stands. Resting restores far more than training does.',
  fatigue: 'Rises with training and with every bout. A tired man\'s charge fills more slowly, so his abilities come round less often; above three quarters he is exhausted and risks injury if he trains.',
  morale: 'Men in good spirits train faster and hit harder; broken men yield sooner. Raised by better rations, a cook, the Temple and victories. Lowered by defeats and by comrades dying.',
  autorest: 'When ticked, a fighter who is exhausted rests for the day instead of training into an injury. His assignment is kept.',
  str: 'Strength: the weight of his blows. A man whose Strength is his highest skill beats one who lives by Agility, and loses to one who lives by Skill. Teaches an ability at 5, 10 and 16.',
  agi: 'Agility: faster attacks, faster feet and more dodges. A man whose Agility is highest beats one who lives by Skill, and loses to one who lives by Strength. Teaches an ability at 5, 10 and 16.',
  rating: 'Power is the sum of his three skills: what he is today. Potential is how fast he learns, the sum of his three talents: a man of low power and high potential is worth the wait.',
  style: 'His style is his highest skill. Strength beats Agility, Agility beats Skill, Skill beats Strength: against the style his own beats, he deals a tenth more and takes a tenth less. A man with two skills level has no style, and no weakness.',
  charge: 'The gold bar under his health in a fight. It fills slowly by itself and faster with every blow given or taken. When it is full he uses an ability; if he is yours, the fight stops for you to choose which.',
  abilities: 'Each skill teaches an ability at 5, at 10 and at 16; which ones depends on how he fights. He carries four into the arena. Once he knows more than four, click one to carry it or put it down.',
  autocast: 'Ask me: the fight stops each time one of your men is charged, and you choose his ability (keys 1 to 4). Auto: they choose for themselves and the fight never stops.',
  skl: 'Skill: more blows land, more are blocked if he carries a shield, and more are telling. A man whose Skill is highest beats one who lives by Strength, and loses to one who lives by Agility. Teaches an ability at 5, 10 and 16.',
  talent: 'Talent: how quickly this stat improves with training. One star is slow, five is exceptional.',
  hidden: 'You cannot judge a recruit\'s talent by looking at him. Employ a scout to see it before you buy.',
  rank: 'Fighters earn rank from bouts, wins and kills. Each new rank lets you choose a perk for him.',
  weapon: 'Weapon: adds damage to every blow. A weapon fits only the fighting style it was made for.',
  head: 'Helm: some protection, shorter stuns, and fewer telling blows land on him.',
  chest: 'Cuirass: by far the most protection of any piece.',
  legs: 'Greaves: some protection, quicker feet, and a chance to shrug off a hamstring.',
  arms: 'Arm guard: some protection, better blocking with a shield, and a chance to shrug off an arm wound.',
  shoulders: 'Pauldrons: some protection, and a chance to shrug off a bleeding wound.',
  rarity: 'Rarity runs F, E, D, C, B, A, S. Each step up is stronger and dearer.',
  armoury: 'Pieces you own that nobody is wearing. Gear returns here when a fighter dies, is sold or is freed.',
  smithlevel: 'A better smith offers more pieces each games day, and rarer ones.',
  orders: 'Standing orders he follows in every bout.',
  sell: 'Sells him for half his market value. Proven fighters are worth far more than raw recruits.',
  free: 'A veteran given his freedom leaves for good. The city talks of it, and every man in the yard trains harder for it.',
  injured: 'He can neither train nor fight until healed. A medicus and a better infirmary shorten it.',
  exhausted: 'Fatigue above three quarters. Rest him.',
  perk: 'He has earned a new rank. Open his dossier to choose a perk.',
  veteran: 'Eight victories or more. You may grant him the wooden sword.',
  bout: 'Favoured, even and underdog describe the opposition the arena has matched to this tier; the strength numbers tell you how it compares with your own fighters.',
  power: 'How dangerous he is right now: skills, gear, traits, spirits and current health. The bookmakers use the same number, and they also know which style beats which.',
  purse: 'Paid only if you win; a loser\'s share is small, and nothing in a bout to the death. Fame grows with the crowd\'s excitement.',
  wager: 'A bet on your own side, at the bookmakers\' odds. You lose the stake if you lose the bout.',
  favour: 'Rises with gifts and with the deeds each patron cares about. Fades a little every games day.',
  feud: 'Deepens when you kill their fighters or they kill yours. At 40 their champion calls you out; refusing costs you.',
  rations: 'Paid per fighter per day. Better food means higher morale.',
  dynasty: 'If debt takes the ludus, an heir begins again with what the family has kept. See the Chronicle for the house so far.',
  friend: 'Friends hit harder when they fight on the same side. If one dies, the other grieves, and may swear to kill the man who did it.',
  rivalbond: 'Rivals inside your own ludus train harder to outdo each other, but fight worse on the same side.',
  vow: 'He has sworn to face this rival. When that man appears on a card he fights him with extra fury; winning lifts him greatly.',
  contract: 'Paid work for a patron. The men you send are gone for the days stated: they do not train, and cannot fight in any games held while they are away. Success pays silver and favour; failure costs favour.',
  asked: 'This patron has asked for your house by name. It is worth more favour if you do it, and costs you favour if the offer is still on the board at the next games.',
  odds: 'The chance the men you have chosen bring the work off. It depends on the stats the work calls for, their fighting style, traits, homeland, spirits, tiredness, and whether they are friends or rivals.',
  danger: 'How likely a man is to come home wounded. On deadly work that goes badly, he may not come home at all.',
  away: 'Away from the ludus. He does not train or eat at your table, and cannot fight until he is back.',
  flight: 'A man in very low spirits, or one you broke a promise to, may not come back from the road. If he runs, his gear goes with him.',
  quest: 'Something that matters to him, which you gave your word on. It ends at a place out in the province: take the whole school there. See it through and he comes back changed, and will never desert you.',
  awaygames: 'Games are held in town every fifth day whether you are there or not. Out here you miss them: no purse, no fame, and a challenge left unanswered still costs you.',
  minimap: 'The whole province. Coloured where you have walked, parchment where you have not. White is the town, purple is you, gold is a place a clue has marked, red is a place you have seen and not dealt with.',
  makecamp: 'Ends the day where you stand. The men rest: fatigue falls and wounds mend, though slower than at home. Key: E',
  fieldrules: 'Walking costs no time. Going into a place takes the day, and so does making camp. Nobody trains out here: marching tires the men and camp rests them. Every fit man fights when it comes to it. Walk back into the town to go home.',
  eagle: 'The hunt for the lost eagle of the Seventeenth Legion. Each clue marks the next place on the map.',
  sound: 'Turns every sound in the game on or off, music included.',
  music: 'Turns the music on or off and leaves the other sounds alone. The yard has a slow tune for lyre and pipe; the arena has a faster one that grows with the crowd.',
  yardbtn: 'Shows or hides the picture of your school. Hidden, the list beneath it has the whole height. The village stays: it is how you get about.',
  promise: 'You promised him his freedom. When the victories are won he will come to collect, and the whole yard will see whether you keep your word.',
};
// The daily assignments, as buttons on each fighter's card: [activity, label, tooltip].
const ACT_BUTTONS = [
  ['rest', 'Rest', 'Rest: recovers health and sheds fatigue. Raises no stats.'],
  ['str', 'Strength', 'Train strength: harder blows. Beats Agility.'],
  ['agi', 'Agility', 'Train agility: faster attacks, faster feet and more dodges. Beats Skill.'],
  ['skl', 'Skill', 'Train skill: more blows land, more are blocked, more are telling. Beats Strength.'],
  ['spar', 'All (spar)', 'Spar: raises all three skills a little at once, and tires him less than drilling one.'],
];
const esc = t => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const tip = k => ` data-tip="${esc(TIPS[k] || k)}"`;

let tipTarget = null;
function placeTip(e) {
  // the tooltip is scaled with the rest of the interface, so its position is set in scaled units
  const el = $('#tip'), pad = 14, r = el.getBoundingClientRect(), z = ui.z || 1;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + r.width > innerWidth - 6) x = e.clientX - r.width - pad;
  if (y + r.height > innerHeight - 6) y = e.clientY - r.height - pad;
  el.style.left = Math.max(6, x) / z + 'px'; el.style.top = Math.max(6, y) / z + 'px';
}

// The interface is drawn for a window of about 1366 by 768 and enlarged as a whole to fill anything bigger,
// so a 1440p or 4K screen shows the same layout at a readable size, not a small one in a sea of empty space.
function fitScreen() {
  const z = Math.round(Math.max(1, Math.min(innerWidth / 1366, innerHeight / 768)) * 100) / 100, st = document.documentElement.style;
  ui.z = z;
  st.setProperty('--z', z); st.setProperty('--vw', innerWidth / z + 'px'); st.setProperty('--vh', innerHeight / z + 'px');
}
addEventListener('resize', fitScreen);
fitScreen();
function hideTip() { tipTarget = null; const el = $('#tip'); if (el) el.hidden = true; }
document.addEventListener('mouseover', e => {
  const el = e.target.closest ? e.target.closest('[data-tip]') : null;
  if (el === tipTarget) return;
  tipTarget = el;
  const box = $('#tip');
  if (!el) { box.hidden = true; return; }
  box.textContent = el.dataset.tip; box.hidden = false; placeTip(e);
});
document.addEventListener('mousemove', e => { if (tipTarget) placeTip(e); });

// ---------- the steward: a first-week tutorial ----------
// A step with "until" completes itself when the player does the thing; the others wait for Next.

const TAB_NAMES = { ludus: 'Ludus', arena: 'Arena', contracts: 'Contracts', market: 'Market', facilities: 'Household', smith: 'Blacksmith', patrons: 'Patrons', rivals: 'Rivals', chronicle: 'Chronicle' };

// ---------- the steward ----------
// He teaches in two ways. First a short walk through the first week, mostly by having you do each thing once
// (a step with `until` moves on by itself when you have done it). After that he keeps quiet until something
// happens for the first time, and then says what it means, once.

const TUTORIAL = [
  { target: '#side',
    text: 'Welcome, dominus. This bar holds the day\'s figures and <b>End day</b>. The picture on the left is your school; the one on the right is the town, and you will do your business in it on foot. Hover over anything, anywhere, and I will explain it.' },
  { tab: 'ludus', target: '.acts', until: () => G.roster.some(g => g.activity !== 'rest'),
    text: 'These are your fighters. Each trains one thing a day, or rests. <b>Set one of them to train</b> with the small buttons on his line: strength, agility, endurance, skill.' },
  { tab: 'ludus', target: '.statrow',
    text: 'Click a fighter and his dossier opens here. Three skills decide how he fights, and each beats one of the others: Strength beats Agility, Agility beats Skill, Skill beats Strength. His highest is his style. The stars are his talent for each: more stars, faster gains.' },
  { tab: 'ludus', target: '[data-act=dtab][data-v=gear]', until: () => ui.tab === 'ludus' && ui.dtab === 'gear',
    text: 'A dossier has four pages. <b>Open Gear.</b>' },
  { tab: 'ludus', target: '.gearlist',
    text: 'What he wears. Yours fight with practice weapons and bare skin for now; the <b>Blacksmith</b> sells better, graded F to S, and anything you buy is put on a man here. <b>Story</b> holds his friends, grudges and history, and <b>Orders</b> how he fights and what he would fetch if sold.' },
  { target: '[data-act=endday]', until: () => G.day >= 2,
    text: 'Nothing happens until the day ends. Press <b>End day</b>, or the E key.' },
  { tab: 'ludus', target: '.bar.fat',
    text: 'Three gauges on each line: health, fatigue, spirits. Training builds fatigue, and a tired man fights badly and can tear a muscle, so rest him before the games. With the box above the list ticked, the exhausted rest on their own.' },
  { target: '#village', go: 'contracts', until: () => ui.tab === 'contracts',
    text: 'There is paid work in town. That is you with the gold mark over your head, at the door of the Ludus. <b>Walk to Contracts</b>: steer with <b>W A S D</b>, or click the building and you will walk there yourself. Step onto its doorstep and it opens.' },
  { tab: 'contracts', target: '#view .panel.list',
    text: 'Patrons hire fighters by the day. A man who suits the work has better odds, shown on his name when you choose him. It pays silver and favour, but he is <b>gone</b> for those days: no training, and no games if they fall while he is away. Each offer says whether he would be back in time. With two fighters, I would keep them home this week.' },
  { target: '#village', go: 'market', until: () => ui.tab === 'market',
    text: 'Now walk to the <b>Market</b>.' },
  { tab: 'market', target: '#view .panel.list',
    text: 'Fresh stock every games day. The three numbers are a man\'s skills; you cannot see his talent without a scout. Your barracks hold three for now, and every man eats every day. Buy when you can feed him.' },
  { target: '#village', go: 'facilities', until: () => ui.tab === 'facilities',
    text: 'Walk to your own house, <b>Household</b>, at the top left.' },
  { tab: 'facilities', target: '#view .fill > div:last-child .panel.list',
    text: 'Staff, buildings and rations. Everything here costs money, up front or every day, and the ledger shows what a day costs you now. A doctore lets men spar; an infirmary keeps the fallen alive. Do not spend the purse to nothing: stay in debt too long and the creditors take the house.' },
  { target: '[data-act=skipdays]', until: () => isGamesDay(),
    text: 'Games are held every fifth day. <b>To the games</b> (the G key) runs the days until then, stopping if anything needs you. Set your men to train first.' },
  { target: '#village', go: 'arena', until: () => ui.tab === 'arena' || !isGamesDay(),
    text: 'It is a games day: the number by the Arena\'s name is the bouts waiting. Walk to the <b>Arena</b>.' },
  { tab: 'arena', target: '.bout:not(.done)', until: () => !G.bouts || G.bouts.some(b => b.done),
    text: 'Each line on the left is a bout; the one you choose opens here. Compare the strength numbers, start with one marked <b>Favoured</b>, click a fighter\'s name to enter him, and wager only if you trust him. <b>Send a man to the sand.</b>' },
  { text: 'A win pays a purse and fame, and fame opens greater arenas. A beaten man may be spared or killed, and wounds keep him out for days. Fighters earn rank from their bouts; each new rank lets you choose a perk in his dossier.' },
  { text: 'That is the trade. <b>Patrons</b> reward favour, <b>Rivals</b> shows the other houses and your feuds, and the <b>Chronicle</b> keeps the record. The <b>Blacksmith</b> has his forge by the square. Your campaigns are under <b>Saves</b>, at the foot of the bar. I will hold my tongue now, and speak up when something new happens.' },
];

// Things he explains the first time they happen. `when` returns whatever the text needs, or nothing.
const HINTS = [
  { id: 'debt', when: () => G.denarii < 0,
    text: () => `We are in debt, dominus. Stay there for ${graceDays()} days running and the creditors take the house. Sell a man, cut the rations, dismiss staff, or win a purse; and morale falls every day we owe.` },
  { id: 'hurt', when: () => G.roster.find(g => g.injury > 0 && !g.away),
    text: g => `<b>${g.name}</b> is wounded. He can neither train nor fight until he heals; the days left are on his line. A medicus and a better infirmary shorten it.` },
  { id: 'perk', when: () => G.roster.find(g => g.perkPending > 0),
    text: g => `<b>${g.name}</b> has earned a new rank. Open his dossier and press <b>Choose a perk</b>: three are offered, and the choice is for good.` },
  { id: 'gear', when: () => G.armoury.length > 0,
    text: () => 'There is a spare piece in the armoury. Open a fighter\'s dossier, then <b>Gear</b>, to put it on him. A weapon only fits the fighting style it was made for.' },
  { id: 'away', when: () => G.jobs.length > 0,
    text: () => 'Men are away from the house. The <b>Contracts</b> screen shows who, and when they are back. Word may come from the road asking what they should do; I will bring it to you.' },
  { id: 'quest', when: () => G.roster.find(g => g.quest && QUESTS[g.quest.id] && !g.away),
    text: g => `You gave <b>${g.name}</b> your word. The place is ${QUESTS[g.quest.id].where}, out through the east gate, and it is marked on the map of the province. Take the whole school there; do not leave him waiting for weeks.` },
  { id: 'gate', when: () => gateOpen() && !G.field,
    text: () => 'The <b>east gate</b> will open for you now, at the end of the upper street. Beyond it is the province: lairs, outlaws, old tombs, and stranger things. The whole school marches out together, walking costs no time, and each place you go into costs a day. Mind the games: they are held without you if you are away.' },
  { id: 'asked', when: () => G.contracts.find(c => c.asked),
    text: c => `${PATRONS[c.patron].name} has asked for your house by name: see <b>Contracts</b>. It is worth more favour than ordinary work, and leaving it on the board until the next games will cost you.` },
  { id: 'festival', when: () => G.festival && G.festival.day - G.day <= 5 && G.festival.day > G.day,
    text: () => `A festival is coming: <b>${FESTIVALS[G.festival.type].name}</b>. ${FESTIVALS[G.festival.type].blurb} It is held with the ordinary games; have your best men rested for it.` },
  { id: 'tourney', when: () => G.tourney && G.tourney.state === 'open',
    text: () => 'The lists are open at the <b>Arena</b>. One champion, three bouts in a day with little rest between, and the laurel for the last man standing. He sits out the ordinary games.' },
  { id: 'feud', when: () => G.houses.find(H => H.grudge >= 40),
    text: H => `The feud with <b>${houseDef(H.id).name}</b> has gone far enough that their champion will call you out at the next games. Refuse him and the town, and your own men, will think less of you. See <b>Rivals</b>.` },
  { id: 'bond', when: () => G.bonds.length > 0,
    text: () => 'Two of your men have taken to each other, for good or ill. Friends hit harder side by side, and grieve if one falls; rivals train harder and fight worse together. It is on the <b>Story</b> page of each.' },
  { id: 'morale', when: () => G.roster.find(g => g.morale < 30 && !g.away),
    text: g => `<b>${g.name}</b> is in low spirits. Such men train slowly and yield early, and one sent on the road may not come back. Better rations, a cook, the baths and victories all help.` },
  { id: 'tier', when: () => tier() >= 1,
    text: () => `The house has a name now: we fight at the <b>${TIERS[tier()].name}</b>. Richer purses, harder men, and some bouts are now <b>to the death</b>, marked in red. Look twice before you enter one.` },
  { id: 'veteran', when: () => G.roster.find(g => g.wins >= 8),
    text: g => `<b>${g.name}</b> has eight victories. You may grant him the wooden sword, on the <b>Orders</b> page of his dossier: he leaves for good, the city talks of it, and every man in the yard trains harder.` },
];

// The steward's notes on this save. Older saves have none: they get advice only if they ask for it.
function tutorState() {
  const t = G.tut || (G.tut = { step: 0, on: false });
  if (t.hints === undefined) t.hints = !!t.on;
  if (!t.seen) t.seen = {};
  return t;
}
const stewardSays = (head, text, buttons, done) => `<div class="who">${head}</div>${done === undefined ? '' : `<div class="bar prog"><i style="width:${Math.round(done * 100)}%"></i></div>`}<p>${text}</p><div class="row">${buttons}</div>`;

function renderTutor() {
  const el = $('#tutor');
  document.querySelectorAll('.tut-glow').forEach(x => x.classList.remove('tut-glow'));
  const t = G && tutorState();
  ui.wayTo = null;
  if (!t || G.ruin || (!t.on && !t.hints)) { el.hidden = true; return; }
  if (t.on) {
    while (t.step < TUTORIAL.length && TUTORIAL[t.step].until && TUTORIAL[t.step].until()) t.step++;
    if (t.step >= TUTORIAL.length) { t.on = false; save(); }
  }
  if (t.on) {
    const s = TUTORIAL[t.step], away = s.tab && s.tab !== ui.tab, last = t.step === TUTORIAL.length - 1;
    el.innerHTML = stewardSays(`Your steward &middot; ${t.step + 1} of ${TUTORIAL.length}`,
      s.text + (away ? `<br><span class="dim">Walk to ${TAB_NAMES[s.tab]}.</span>` : ''),
      `${s.until ? '<span class="dim" style="font-size:12px">Do it, and I will go on.</span>' : `<button class="primary" data-act="tutnext">${last ? 'Thank you' : 'Next'}</button>`}
       ${TUTORIAL.slice(0, t.step).some(x => !x.until) ? '<button data-act="tutback">Back</button>' : ''}
       <button data-act="tutoff" style="margin-left:auto">Dismiss him</button>`, t.step / TUTORIAL.length);
    el.hidden = false;
    const target = s.target && !away ? document.querySelector(s.target) : away ? $('#village') : null;
    if (target) target.classList.add('tut-glow');
    ui.wayTo = s.go || (away ? s.tab : null);                  // an arrow over the door he wants you at
    return;
  }
  for (const h of HINTS) {
    if (t.seen[h.id]) continue;
    const about = h.when();
    if (!about) continue;
    el.innerHTML = stewardSays('Your steward', h.text(about), `<button class="primary" data-act="hintok" data-v="${h.id}">Understood</button><button data-act="tutoff" style="margin-left:auto">No more advice</button>`);
    el.hidden = false;
    return;
  }
  el.hidden = true;
}

// ---------- modal queue ----------

const modalQueue = [];
function showModal(html) { modalQueue.push(html); if (modalQueue.length === 1) paintModal(); }
function paintModal() {
  const m = $('#modal');
  if (!modalQueue.length) { m.hidden = true; return; }
  $('#modalBox').innerHTML = modalQueue[0];
  m.hidden = false;
}
function closeModal() { modalQueue.shift(); paintModal(); }
const okBtn = (label) => `<div class="row"><button class="primary" data-act="close">${label || 'Continue'}</button></div>`;

// ---------- rendering ----------

function render() {
  hideTip();
  renderTop(); renderTabs(); renderView(); paintPortraits();
  // a browser may briefly pair a cached page with newer scripts; never let a missing yard stop the game
  if (typeof startYard === 'function') startYard();
  if (typeof startVillage === 'function') startVillage();
  if (typeof renderWilds === 'function') renderWilds();          // the map of the province, when the school is outside the walls
  renderTutor();
  if (ui.dev) renderDev();
}

// The bar down the right-hand side: the day's figures and the two buttons that move time on,
// then (from renderTabs) the screens, and at the foot the saves and the small switches.
function renderTop() {
  const t = tier();
  const next = TIERS[t + 1] ? TIERS[t + 1].fame : FINAL_FAME;
  const dg = daysToGames(), net = stipend() - upkeep();
  $('#topbar').innerHTML = `
    <div class="title">LUDUS MAGNUS${G.dynasty.gen > 1 ? ` <small${tip('dynasty')}>${ordinal(G.dynasty.gen)} generation</small>` : ''}</div>
    <div class="stat"${tip('day')}><b>${ic('day')}${G.day}</b><span>Day</span></div>
    <div class="stat"${tip('denarii')}><b class="${G.denarii < 0 ? 'bad' : 'gold'}">${ic('coin')}${G.denarii}</b><span>${net >= 0 ? '+' : ''}${net} a day</span></div>
    <div class="stat"${tip('fame')}><b>${ic('fame')}${G.fame}<small>/${next}</small></b><span>${TIERS[t].name}</span></div>
    <div class="stat games"${tip('games')}><b>${ic('games')}${dg === 0 ? 'TODAY' : dg + (dg === 1 ? ' day' : ' days')}</b><span>Next games</span></div>
    <button class="primary" data-act="endday"${tip('endday')}>End day<span class="key">E</span></button>
    <button data-act="skipdays"${tip('skip')} ${dg > 1 ? '' : 'disabled'}>To the games<span class="key">G</span></button>`;
  const sw = (act, label, on, key) => `<button class="${on ? '' : 'off'}" data-act="${act}"${tip(key)}>${label}</button>`;
  $('#sidefoot').innerHTML = `<button class="wide" data-act="saves"${tip('saves')}>Saves</button>
    ${sw('yardtoggle', 'Yard', !ui.noyard, 'yardbtn')}${sw('mute', 'Sound', !SFX.muted, 'sound')}${sw('musictoggle', 'Music', SFX.musicOn, 'music')}`;
}

const TAB_KEYS = ['ludus', 'arena', 'contracts', 'rivals', 'market', 'smith', 'facilities', 'patrons', 'chronicle'];
// The screens are reached on foot now (see village.js); all that is left to do here is hide or show the school picture.
function renderTabs() { $('#app').classList.toggle('noyard', ui.noyard); }
// Called by the village when the lanista steps onto a doorstep.
function villageEnter(key) { if (ui.tab === key) return; ui.tab = key; SFX.ui('tick'); render(); }
// What waits inside a building, shown as a number by its name on the map.
function villageMarks() { return { arena: G.bouts ? G.bouts.filter(b => !b.done).length : 0, contracts: G.contracts.filter(c => c.asked).length }; }

// The view is rebuilt after every action, so each scrolling pane is put back where the player left it.
function renderView() {
  const v = { ludus: viewLudus, arena: viewArena, contracts: viewContracts, market: viewMarket, smith: viewSmith, rivals: viewRivals, facilities: viewFacilities, patrons: viewPatrons, chronicle: viewChronicle }[ui.tab];
  const el = $('#view'), keep = {};
  if (ui.shown === ui.tab) el.querySelectorAll('[data-pane]').forEach(p => { keep[p.dataset.pane] = p.scrollTop; });
  el.innerHTML = v();
  el.querySelectorAll('[data-pane]').forEach(p => { if (keep[p.dataset.pane]) p.scrollTop = keep[p.dataset.pane]; });
  ui.shown = ui.tab;
}

// ---------- lists and what is chosen in them ----------

// One line of a list. Clicking it makes it the chosen one for that list (ui[key]).
const lrow = (key, id, inner, cls) => `<div class="lrow ${ui[key] === id ? 'sel' : ''} ${cls || ''}" data-act="rowsel" data-v="${key}" data-w="${id}">${inner}</div>`;
const prow = inner => `<div class="lrow" style="cursor:default">${inner}</div>`;
// The chosen item of a list: what the player picked if it is still there, otherwise the first.
function keepSel(key, items) {
  if (!items.some(x => x.id === ui[key])) ui[key] = items.length ? items[0].id : null;
  return items.find(x => x.id === ui[key]) || null;
}

// His style as a small mark: the icon of his highest skill, with what it beats and loses to in the tooltip.
const STYLE_LOSES = { str: 'skl', agi: 'str', skl: 'agi' };
function styleMark(g) {
  const st = styleOf(g);
  return st ? `<span class="stylemark"${tip(`${STAT_NAMES[st]} style: beats ${STAT_NAMES[STYLE_BEATS[st]]}, loses to ${STAT_NAMES[STYLE_LOSES[st]]}.`)}>${ic(st)}</span>`
    : `<span class="stylemark none"${tip('No style: two of his skills are level, so he has no edge and no weakness.')}>&ndash;</span>`;
}
// How his style stands against one opponent's: up, down, or nothing.
function edgeMark(g, foe) {
  const e = styleEdge(styleOf(g), styleOf(foe));
  return e > 1 ? ' <b class="good" title="His style beats this man">&#9650;</b>' : e < 1 ? ' <b class="bad" title="This man\'s style beats his">&#9660;</b>' : '';
}
const ratingLine = (g, hide) => `<span${tip('rating')}>Power <b class="num">${rating(g)}</b> &middot; Potential <b class="num">${hide ? '?' : potential(g)}</b></span>`;

function statusChips(g) {
  let s = '';
  if (g.away) s += `<span class="chip gold"${tip('away')}>Away ${daysLeft(jobOf(g))}d</span>`;
  if (g.quest && QUESTS[g.quest.id]) s += `<span class="chip gold"${tip('quest')}>Journey promised</span>`;
  if (g.wish) s += `<span class="chip red"${tip('vow')}>Vow</span>`;
  if (g.perkPending > 0) s += `<span class="chip gold"${tip('perk')}>Perk to choose</span>`;
  if (g.injury > 0) s += `<span class="chip red"${tip('injured')}>Injured ${g.injury}d</span>`;
  if (g.fatigue > 75) s += `<span class="chip red"${tip('exhausted')}>Exhausted</span>`;
  if (g.foughtDay === G.day) s += `<span class="chip">Fought today</span>`;
  if (g.wins >= 8) s += `<span class="chip gold"${tip('veteran')}>Veteran</span>`;
  return s;
}

// One fighter on one line: face, name, the three gauges, and today's work as six small buttons.
function gladCard(g) {
  // a button that cannot be used stays hoverable so its tooltip can say why
  const actBtn = ([k, label, what]) => {
    const why = g.injury > 0 ? 'He is injured and can only rest until he heals.' : k === 'spar' && !staffLvl('doctore') ? 'Sparring needs a doctore. Hire one under Household.' : '';
    return `<button class="${g.activity === k && g.injury <= 0 ? 'on' : ''} ${why ? 'off' : ''}" data-act="activity" data-v="${g.id}" data-w="${k}"${tip(why || what)}>${STAT_NAMES[k] ? ic(k) : k === 'rest' ? 'Rest' : 'All'}</button>`;
  };
  const J = jobOf(g);
  const work = J ? `<div class="awaynote">Away: <b>${jobTitle(J)}</b><br>back ${backWhen(J)}</div>` : `<div class="acts mini">${ACT_BUTTONS.map(actBtn).join('')}</div>`;
  return `<div class="lrow grow-row ${ui.sel === g.id ? 'sel' : ''} ${J ? 'away' : ''}" data-act="sel" data-v="${g.id}">
    <canvas width="48" height="56" style="width:34px;height:40px" data-portrait="${g.id}"></canvas>
    <div class="grow"><span class="t">${g.name} ${styleMark(g)}</span><small>${CLASSES[g.cls].name} &middot; power ${rating(g)} &middot; ${g.wins}W ${g.losses}L</small></div>
    <div class="chips">${statusChips(g)}</div>
    <div class="gauges"><div${tip('health')}>${bar('hp', g.hp, maxHp(g))}</div><div${tip('fatigue')}>${bar('fat', g.fatigue, 100)}</div><div${tip('morale')}>${bar('mor', g.morale, 100)}</div></div>
    ${work}
  </div>`;
}

// Is this one of your fighters, currently set to train this stat?
function trains(g, s) { return G.roster.includes(g) && g.injury <= 0 && !g.away && (g.activity === s || g.activity === 'spar'); }

function statRows(g, hide) {
  return STATS.map(s => `<div class="statrow"${tip(s)}>
      <span class="statname ${trains(g, s) ? 'gold' : ''}">${ic(s)} ${STAT_NAMES[s]}${trains(g, s) ? '<small class="gold">&#9650; training</small>' : ''}</span><b class="num">${g.stats[s]}</b>
      ${bar('prog', g.prog[s], needProg(g.stats[s]))}
      <span class="stars"${tip(hide ? 'hidden' : 'talent')}>${hide ? '? ? ?' : '★'.repeat(stars(g.pot[s])) + '☆'.repeat(5 - stars(g.pot[s]))}</span>
    </div>`).join('');
}
function traitList(g) {
  return g.traits.length
    ? g.traits.map(t => `<div class="trait"><b class="${TRAITS[t].good ? 'good' : 'bad'}">${TRAITS[t].name}</b> <span class="dim">${TRAITS[t].desc}</span></div>`).join('')
    : '<div class="dim">No notable traits.</div>';
}

// What the portrait is showing, in words: his mood and the marks he carries.
function faceTip(g) {
  const mood = { hurt: 'Bandaged and in pain.', angry: 'There is anger in his face.', weary: 'He is worn out.', low: 'His spirits are low.', proud: 'He holds his head high.', grim: 'He gives nothing away.' }[moodOf(g)];
  const n = scarsOf(g).length;
  return mood + (n ? ` He carries ${n} scar${n === 1 ? '' : 's'} from the arena.` : ' No blade has marked him yet.');
}

const DTABS = [['stats', 'Stats'], ['abil', 'Abilities'], ['gear', 'Gear'], ['story', 'Story'], ['orders', 'Orders']];
// Everything his fighting style can learn, skill by skill: what he carries, what he knows, what is still locked.
function abilityBlock(g) {
  const known = abilitiesKnown(g), carried = abilitiesOf(g), choose = known.length > 4;
  const rows = STATS.map(k => `<div class="abgroup"><div class="abhead">${ic(k)} ${STAT_NAMES[k]} <b class="num">${g.stats[k]}</b></div>${ABILITIES[g.cls][k].map(a => {
    const has = known.includes(a), on = carried.includes(a);
    return `<div class="ab ${has ? (on ? 'on' : 'known') : 'locked'}" ${has && choose ? `data-act="abil" data-v="${g.id}" data-w="${a.id}"` : ''}>
      <b>${a.name}</b> <small>${has ? (on ? 'carried' : 'known') : `at ${STAT_NAMES[k]} ${a.at}`}</small><div class="dim">${a.desc}</div></div>`;
  }).join('')}</div>`).join('');
  return `<div${tip('abilities')} style="font-size:13px;margin-bottom:6px">${known.length ? `He knows <b>${known.length}</b> and carries <b>${carried.length}</b>.${choose ? ' Click one to carry it or put it down.' : ''}` : 'He has learned nothing yet: a skill at 5 teaches the first. Until then a full charge is a single heavy blow.'}</div><div class="abcols">${rows}</div>`;
}

function gladDetail(g) {
  const c = CLASSES[g.cls];
  if (!DTABS.some(t => t[0] === ui.dtab)) ui.dtab = 'stats';
  const tac = Object.entries(TACTICS).map(([k, t]) => `<option value="${k}" ${g.tactic === k ? 'selected' : ''}>${t.name}</option>`).join('');
  const pages = {
    stats: () => `${statRows(g)}<hr class="sep">${traitList(g)}<hr class="sep">
      <div class="dim" style="font-size:13px">${c.desc}</div>
      <div class="dim" style="font-size:13px;margin-top:4px">${STATS.map(k => { const a = abilityNext(g, k); return a ? `${STAT_NAMES[k]} ${a.at} teaches <b>${a.name}</b>` : `${STAT_NAMES[k]} has no more to teach`; }).join(' &middot; ')}.</div>`,
    abil: () => abilityBlock(g),
    gear: () => gearBlock(g),
    story: () => (questBlock(g) + storyBlock(g)).replace(/^<hr class="sep">/, '') || '<div class="dim">Nothing worth telling of him yet.</div>',
    orders: () => `<div class="kv">
        <span${tip('orders')}>Orders in the arena<br><small>${TACTICS[g.tactic].desc}</small></span>
        <select data-chg="tactic" data-v="${g.id}">${tac}</select>
      </div>
      <hr class="sep">
      <div class="row">${g.away ? `<small>He is away from the ludus: ${jobTitle(jobOf(g)).toLowerCase()}, back ${backWhen(jobOf(g))}. He cannot be sold or freed until he returns.</small>` : `
        <button${tip('sell')} data-act="sell" data-v="${g.id}">Sell for ${Math.round(value(g) / 2)}</button>
        ${g.wins >= 8 ? `<button${tip('free')} data-act="free" data-v="${g.id}">Grant the wooden sword</button>` : `<small>Freedom may be granted after 8 victories.</small>`}`}
      </div>`,
  };
  const mark = { story: g.quest && QUESTS[g.quest.id] ? '!' : '' };
  return `<div class="panel dossier">
    <div class="dhead">
      <canvas class="portrait" width="192" height="224" data-portrait="${g.id}"${tip(faceTip(g))}></canvas>
      <div style="flex:1;min-width:180px">
        <h2>${g.name}</h2>
        <div>${RANKS[g.rank].name} &middot; ${c.name} of ${g.origin}</div>
        <div>${ratingLine(g)} &middot; ${styleMark(g)}</div>
        <div style="margin-top:4px">${statusChips(g)}</div>
        <div class="num dim" style="font-size:13px">${g.wins} wins &middot; ${g.losses} losses &middot; ${g.kills} kills &middot; health ${Math.round(g.hp)}/${maxHp(g)}</div>
        ${g.rank < RANKS.length - 1 ? `<div class="barrow"${tip('rank')} style="grid-template-columns:auto 1fr;margin-top:4px">To ${RANKS[g.rank + 1].name} ${bar('prog', g.xp - RANKS[g.rank].xp, RANKS[g.rank + 1].xp - RANKS[g.rank].xp)}</div>` : ''}
        ${g.perkPending > 0 ? `<button class="primary" data-act="perk" data-v="${g.id}" style="margin-top:4px">Choose a perk</button>` : ''}
      </div>
    </div>
    <div class="subtabs">${DTABS.map(([k, n]) => `<button class="${ui.dtab === k ? 'on' : ''}" data-act="dtab" data-v="${k}">${n}${mark[k] ? `<span class="badge">${mark[k]}</span>` : ''}</button>`).join('')}</div>
    <div class="dbody" data-pane="dossier-${g.id}-${ui.dtab}">${pages[ui.dtab]()}</div>
  </div>`;
}

function viewLudus() {
  if (!G.roster.length) return `<div class="fill"><div><h2>Gladiators</h2><div class="pane"><div class="panel">Your cells are empty. Visit the market.</div></div></div><div></div></div>`;
  if (!byId(ui.sel)) ui.sel = G.roster[0].id;
  return `<div class="fill">
    <div><h2>Gladiators <small>${G.roster.length} / ${capacity()}</small>
        <label class="h2opt"${tip('autorest')}><input type="checkbox" data-chg="autorest" ${G.autoRest ? 'checked' : ''}> the exhausted rest on their own</label></h2>
      <div class="pane" data-pane="roster"><div class="panel list">${G.roster.map(gladCard).join('')}</div></div></div>
    <div><h2>Dossier</h2>${gladDetail(byId(ui.sel))}</div>
  </div>`;
}

// ---------- contracts and journeys ----------

const daysLeft = J => J ? Math.max(1, J.end - G.day) : 0;
const backWhen = J => { const n = daysLeft(J); return n === 1 ? 'tomorrow' : `in ${n} days (day ${J.end})`; };
const asPct = p => Math.round(p * 100) + '%';
function suitTip(g, D, need, land) {
  const a = aptitude(g, D, land), p = jobOdds(D, need, [g], 0, land);
  return `${g.name}: ${oddsWord(p).toLowerCase()} (${asPct(p)} alone).${a.why.length ? '\n' + cap1(a.why.join(', ')) + '.' : ''}${flightRisk(g) ? '\nHe may not come back.' : ''}`;
}
const pickChip = (act, v, g, on, D, need, land) =>
  `<span class="chip pick ${on ? 'on' : ''} ${flightRisk(g) ? 'red' : ''}" data-act="${act}" data-v="${v}" data-w="${g.id}"${tip(suitTip(g, D, need, land))}>${g.name} <span class="num">${asPct(jobOdds(D, need, [g], 0, land))}</span></span>`;

function contractCard(c) {
  const D = CONTRACTS[c.type];
  const picks = ui.cpicks[c.id] = (ui.cpicks[c.id] || []).filter(id => canSend(byId(id)));
  const avail = G.roster.filter(canSend), men = picks.map(byId), ready = men.length === c.size;
  const chips = avail.length ? avail.map(g => pickChip('cpick', c.id, g, picks.includes(g.id), D, c.need, c.land)).join('') : '<span class="dim">Nobody is free to send.</span>';
  const p = ready ? contractOdds(c, men) : 0;
  const suits = D.cls.map(k => CLASSES[k].name).concat(D.likes.slice(0, 3).map(t => TRAITS[t].name.toLowerCase())).join(', ');
  const stat = STATS.filter(s => D.w[s] >= 0.3).sort((a, b) => D.w[b] - D.w[a]).map(s => STAT_NAMES[s].toLowerCase()).join(' and ');
  const runners = men.filter(flightRisk);
  return `<div class="panel">
    <h3>${D.name} <small>${PATRONS[c.patron].name}</small></h3>
    ${c.asked ? `<div><span class="chip gold"${tip('asked')}>Asked of you by name</span></div>` : ''}
    <p style="margin:6px 0">${D.text(c)}</p>
    <div class="kv"><span${tip('contract')}>Pay</span><b><span class="gold num">${c.pay}</span> denarii &middot; favour <span class="num">+${c.favor}</span>${D.fame ? ` &middot; fame <span class="num">+${D.fame * (1 + tier())}</span>` : ''}</b>
      <span>Away</span><b><span class="num">${c.days}</span> day${c.days === 1 ? '' : 's'} &middot; ${missesGames(c.days) ? '<span class="bad">misses the games</span>' : '<span class="good">back before the games</span>'}</b>
      <span${tip('danger')}>Risk</span><b class="${D.danger >= 0.65 ? 'bad' : ''}">${DANGER_WORD(D.danger)}</b>
      <span>Calls for</span><b style="font-weight:normal;text-align:right">${stat}<br><small>${suits}</small></b></div>
    <div style="margin:8px 0 4px">Send ${c.size === 1 ? 'one man' : c.size + ' men'}:</div>
    <div>${chips}</div>
    <div class="row" style="margin-top:8px">
      <button class="primary" data-act="csend" data-v="${c.id}" ${ready ? '' : 'disabled'}>Send ${ready ? namesOf(men) : ''}</button>
      ${ready ? `<span${tip('odds')}>Chance of success <b class="num ${p >= 0.5 ? 'good' : 'bad'}">${asPct(p)}</b> <span class="dim">${oddsWord(p).toLowerCase()}</span></span>` : `<span class="dim">Choose ${c.size - men.length} more.</span>`}
    </div>
    ${runners.length ? `<div class="bad" style="font-size:13px;margin-top:4px"${tip('flight')}>${namesOf(runners)} may not come back.</div>` : ''}
  </div>`;
}

function viewContracts() {
  const c = keepSel('csel', G.contracts);
  const rows = G.contracts.map(x => { const D = CONTRACTS[x.type]; return lrow('csel', x.id,
    `<div class="grow"><span class="t">${D.name}${x.asked ? ` <span class="chip gold"${tip('asked')}>Asked by name</span>` : ''}</span>
      <small>${PATRONS[x.patron].name} &middot; ${x.size === 1 ? 'one man' : x.size + ' men'} &middot; ${x.days} day${x.days === 1 ? '' : 's'} &middot; ${DANGER_WORD(D.danger).toLowerCase()}</small></div>
     <span class="end"><b class="gold num">${x.pay}</b></span>`); }).join('')
    || '<div class="listnote">Nobody in town has work for your men today. New offers come with each games day.</div>';
  const away = G.jobs.map(J => prow(`<div class="grow"><span class="t">${jobTitle(J)}</span><small>${J.kind === 'quest' ? 'a journey of his own' : PATRONS[J.patron].name} &middot; back ${backWhen(J)}</small></div>
      <span class="end">${jobMen(J).map(g => `<span class="chip pick" data-act="dossier" data-v="${g.id}">${g.name}</span>`).join('')}</span>`)).join('')
    || '<div class="listnote">Every man is in the yard.</div>';
  const waiting = G.roster.filter(g => g.quest && QUESTS[g.quest.id]).map(g => prow(`<div class="grow"><span class="t">${QUESTS[g.quest.id].name}</span><small>${QUESTS[g.quest.id].where} &middot; take the school there</small></div>
      <span class="end"><span class="chip pick" data-act="dossier" data-v="${g.id}">${g.name}</span></span>`)).join('');
  return `<div class="fill even">
    <div><h2>Work on offer <small>until the next games</small></h2>
      <div class="pane" data-pane="offers"><div class="panel list">${rows}</div>
        <h2>Away from the ludus</h2><div class="panel list">${away}</div>
        ${waiting ? `<h2>Journeys promised</h2><div class="panel list">${waiting}</div>` : ''}</div></div>
    <div><h2>${c ? 'The offer' : 'Contracts'}</h2><div class="pane" data-pane="offer">${c ? contractCard(c) : ''}
      <div class="dim" style="font-size:12px;margin-top:8px">Contracts pay about half what the same men would win at the games, and earn favour with the patron who offered them. Men who are away do not train and miss any games held while they are gone. From time to time a fighter of some standing will ask leave for a journey of his own.</div></div></div>
  </div>`;
}

// A fighter's own journey, in his dossier: what you promised him, and where it is.
function questBlock(g) {
  if (!g.quest || !QUESTS[g.quest.id]) return '';
  const Q = QUESTS[g.quest.id], waited = G.day - g.quest.since;
  return `<hr class="sep"><div${tip('quest')}><b class="gold">${Q.name}</b></div>
    <div style="font-size:13px">You gave him your word. The place is ${Q.where}, out through the east gate; it is marked on the map of the province. Take the whole school there, and him with it.${waited >= 10 ? ` <span class="bad">He has waited ${waited} days.</span>` : ''}</div>`;
}

// What came of the outings that ended this morning.
function showReports() {
  if (!G.reports || !G.reports.length) return;
  G.reports.splice(0).forEach(r => showModal(`<h2>${r.title}</h2>${r.html}${okBtn()}`));
  SFX.ui('gate');
  save();
}

function boutCard(b) {
  const D = DIFF[b.diff];
  const kind = ['Duel', 'Pairs', 'Melee', 'Melee', 'Melee'][b.size - 1];
  const them = boutEnemies(b), one = them.length === 1 && !them[0].beast ? them[0] : null;
  const foes = them.map(e => `<div>${e.beast ? e.name : e.name + ', ' + CLASSES[e.cls].name + ' ' + styleMark(e)} <span class="dim num"${tip('power')}>(strength ${Math.round(power(e))})</span>${rivalNote(e)}${vowNote(e)}</div>`).join('');
  let body;
  if (b.done) body = '<div class="dim">This bout has been fought.</div>';
  else {
    const picks = (ui.picks[b.id] || []).filter(id => byId(id) && canFight(byId(id)));
    ui.picks[b.id] = picks;
    const avail = G.roster.filter(canFight);
    const chips = avail.length
      ? avail.map(g => `<span class="chip pick ${picks.includes(g.id) ? 'on' : ''}" data-act="pick" data-v="${b.id}" data-w="${g.id}"${tip('power')}>${g.name} <span class="num">${Math.round(power(g))}</span>${one ? edgeMark(g, one) : ''}</span>`).join('')
      : '<span class="dim">No one is fit to fight.</span>';
    const mine = picks.map(byId);
    const odds = winOdds(mine, boutEnemies(b));
    const ready = picks.length === b.size;
    const wager = Math.min(ui.wagers[b.id] || 0, Math.max(0, G.denarii));
    const wopts = [0, 25, 50, 100, 250, 500].filter(w => w <= Math.max(0, G.denarii))
      .map(w => `<option value="${w}" ${w === wager ? 'selected' : ''}>${w ? w + ' denarii' : 'No wager'}</option>`).join('');
    body = `<div>Send ${b.size === 1 ? 'one fighter' : b.size + ' fighters'}:</div><div style="margin:6px 0">${chips}</div>
      <div class="row">
        <select data-chg="wager" data-v="${b.id}">${wopts}</select>
        <span class="dim"${tip('wager')}>${ready ? `Bookmakers pay <b class="gold num">x${odds.pay}</b> on you` : 'Choose your fighters'}</span>
        <button class="primary" data-act="fight" data-v="${b.id}" ${ready ? '' : 'disabled'} style="margin-left:auto">To the sand</button>
      </div>`;
  }
  return `<div class="panel bout ${b.done ? 'done' : ''}">
    <h3${tip('bout')}>${b.final ? "The Emperor's Games" : b.grudge ? 'Grudge match' : b.vow ? 'A vow to settle' : b.hunt ? 'Beast hunt &middot; ' + D.name : b.melee ? 'The great melee' : kind + ' &middot; ' + D.name} <small>vs ${swatch(b.houseId)}${b.house}</small></h3>
    ${b.death ? `<div class="death">${b.funeral ? 'Funeral games: ' : ''}Sine missione &mdash; to the death</div>` : ''}
    ${b.hunt ? '<div class="death">Beasts give no quarter</div>' : ''}
    <div class="foes">${foes}</div>
    <div${tip('purse')}>Purse <b class="gold num">${b.purse}</b> &middot; Fame <b class="num">+${b.fame}</b></div>
    <hr class="sep">${body}
  </div>`;
}

const boutTitle = b => b.final ? "The Emperor's Games" : b.grudge ? 'Grudge match' : b.vow ? 'A vow to settle' : b.hunt ? 'Beast hunt &middot; ' + DIFF[b.diff].name : b.melee ? 'The great melee'
  : ['Duel', 'Pairs', 'Melee', 'Melee', 'Melee'][b.size - 1] + ' &middot; ' + DIFF[b.diff].name;

function viewArena() {
  const t = tier();
  const road = `<div class="strip"${tip('fame')}>${TIERS.map((x, i) => `<span class="${i === t ? 'cur' : i < t ? 'past' : ''}">${x.name} <b class="num">${x.fame}</b></span>`).join('&rsaquo;')}&rsaquo;<span class="${G.fame >= FINAL_FAME ? 'cur' : ''}">The Emperor's Games <b class="num">${FINAL_FAME}</b></span></div>`;
  if (!G.bouts) return `<div class="fill even">
    <div><h2>The arena is quiet</h2><div class="pane">${road}<div class="panel">The next games are in <b>${daysToGames()}</b> ${daysToGames() === 1 ? 'day' : 'days'}. Train, rest and arm your fighters until then.</div></div></div>
    <div><h2>The road to Rome</h2><div class="pane">${festivalNote()}<div class="panel dim" style="font-size:13px">Fame opens greater arenas with richer purses and deadlier opponents. Reach ${FINAL_FAME} fame to be summoned before the Emperor.</div></div></div>
  </div>`;
  const items = (G.tourney ? [{ id: 'lists' }] : []).concat(G.bouts);
  let cur = keepSel('bsel', items);
  if (cur && cur.done && G.bouts.some(b => !b.done)) { cur = G.bouts.find(b => !b.done); ui.bsel = cur.id; }   // move on to the next bout still to fight
  const rows = items.map(b => b.id === 'lists'
    ? lrow('bsel', 'lists', `<div class="grow"><span class="t gold">The lists</span><small>${FESTIVALS.tourney.name} &middot; eight fighters, three rounds</small></div>`)
    : lrow('bsel', b.id, `<div class="grow"><span class="t">${boutTitle(b)}${b.death || b.hunt ? ' <span class="chip red">To the death</span>' : ''}</span>
        <small>vs ${swatch(b.houseId)}${b.house} &middot; ${boutEnemies(b).map(e => Math.round(power(e))).join(' + ')} strength</small></div>
        <span class="end">${b.done ? '<span class="dim">fought</span>' : `<b class="gold num">${b.purse}</b> <span class="num dim">+${b.fame}</span>`}</span>`, b.done ? 'done' : '')).join('');
  return `<div class="fill even">
    <div><h2>Today's games</h2><div class="pane" data-pane="bouts">${road}${G.fix ? '<p class="bad" style="margin:0 0 6px">You have agreed to lose your next bout.</p>' : ''}<div class="panel list">${rows}</div></div></div>
    <div><h2>${cur && cur.id === 'lists' ? 'The tournament' : 'The bout'}</h2><div class="pane" data-pane="bout">${festivalNote()}${cur ? (cur.id === 'lists' ? tourneyPanel() : boutCard(cur)) : ''}</div></div>
  </div>`;
}

function viewMarket() {
  const full = G.roster.length >= capacity(), g = keepSel('msel', G.market), scout = staffLvl('scout');
  const rows = G.market.map(m => lrow('msel', m.id, `<canvas width="48" height="56" style="width:36px;height:42px" data-mportrait="${m.id}"></canvas>
      <div class="grow"><span class="t">${m.name} ${styleMark(m)}</span><small>${CLASSES[m.cls].name} of ${m.origin} &middot; power ${rating(m)} (${STATS.map(s => m.stats[s]).join(' / ')})</small></div>
      <span class="end"><b class="num ${G.denarii < m.price ? 'bad' : 'gold'}">${m.price}</b></span>`)).join('')
    || '<div class="listnote">The dealer has nothing left until the next games.</div>';
  const card = g ? `<div class="panel">
      <div class="row" style="align-items:flex-start">
        <canvas class="portrait" width="96" height="112" data-mportrait="${g.id}"></canvas>
        <div style="flex:1"><h3>${g.name}</h3>
          <div class="dim" style="font-size:13px">${CLASSES[g.cls].name} of ${g.origin}</div>
          <div class="dim" style="font-size:13px">${CLASSES[g.cls].desc}</div>
          <div style="font-size:13px">${ratingLine(g, !scout)} &middot; ${styleMark(g)}</div>
          <div class="num dim" style="font-size:13px">health ${maxHp(g)}${g.gear && g.gear.weapon ? ' &middot; comes with ' + itemTag(g.gear.weapon) : ''}</div></div>
      </div>
      <div style="margin-top:8px">${statRows(g, !scout)}</div>
      <div style="margin:8px 0">${traitList(g)}</div>
      <button class="primary" data-act="buy" data-v="${g.id}" ${full || G.denarii < g.price ? 'disabled' : ''}>Buy &mdash; ${g.price} denarii</button>
    </div>` : '';
  return `<div class="fill even">
    <div><h2>The slave market <small>${G.roster.length} / ${capacity()} cells filled</small></h2>
      <div class="pane" data-pane="market">${full ? '<p class="bad" style="margin:0 0 6px">Your barracks are full. Build more cells or sell a fighter.</p>' : ''}<div class="panel list">${rows}</div>
      <div class="listnote">New stock every games day. The three numbers are strength, agility and skill.</div></div></div>
    <div><h2>The man</h2><div class="pane" data-pane="recruit">${card}</div></div>
  </div>`;
}

function viewFacilities() {
  const wrap = 'style="white-space:normal"';
  const staff = Object.entries(STAFF_ROLES).map(([k, r]) => {
    const s = G.staff[k];
    return prow(s
      ? `<div class="grow"><span class="t"><b>${r.name}</b> ${s.name} <span class="dim">&middot; ${STAFF_GRADES[s.skill]}</span></span><small ${wrap}>${r.desc(s.skill)}</small></div>
         <span class="end num dim">${s.wage}/day</span><button class="mini" data-act="fire" data-v="${k}">Dismiss</button>`
      : `<div class="grow"><span class="t"><b>${r.name}</b> <span class="dim">post vacant</span></span><small ${wrap}>${r.desc(1)}</small></div>`);
  }).join('');
  const hall = G.hires.map(h => prow(`<div class="grow"><span class="t">${h.name} <span class="dim">&middot; ${STAFF_GRADES[h.skill]} ${STAFF_ROLES[h.role].name.toLowerCase()}</span></span><small ${wrap}>${STAFF_ROLES[h.role].desc(h.skill)}</small></div>
      <span class="end num dim">${h.wage}/day</span>
      <button class="mini primary" data-act="hire" data-v="${h.id}" ${G.denarii < h.fee ? 'disabled' : ''}>${G.staff[h.role] ? 'Replace' : 'Hire'} &mdash; ${h.fee}</button>`)).join('')
    || '<div class="listnote">No one is looking for work.</div>';
  const fac = Object.entries(FACILITIES).map(([k, f]) => {
    const l = G.fac[k];
    return prow(`<div class="grow"><span class="t"><b>${f.name}</b> <span class="pips">${'●'.repeat(l)}${'○'.repeat(3 - l)}</span></span>
      <small ${wrap}>${f.effect(l)}${l < 3 ? `. <span class="gold">Next: ${f.effect(l + 1)}</span>` : ''}</small></div>
      ${l < 3 ? `<button class="mini" data-act="build" data-v="${k}" ${G.denarii < FAC_COST[l] ? 'disabled' : ''}${tip(f.desc)}>Improve &mdash; ${FAC_COST[l]}</button>` : '<span class="end dim">Fully built</span>'}`);
  }).join('');
  const rations = RATIONS.map((r, i) => `<button class="${G.ration === i ? 'primary' : ''}" data-act="ration" data-v="${i}">${r.name} &middot; ${r.cost}/man/day</button>`).join('');
  return `<div class="fill even">
    <div><h2>Staff</h2><div class="pane" data-pane="staff"><div class="panel list">${staff}</div>
      <h2>Hiring hall <small>new faces every games day</small></h2><div class="panel list">${hall}</div></div></div>
    <div><h2>Facilities</h2><div class="pane" data-pane="fac"><div class="panel list">${fac}</div>
      <h2${tip('rations')}>Rations</h2><div class="panel"><div class="row">${rations}</div></div>
      ${ledger()}</div></div>
  </div>`;
}

function staffSection() {
  const mine = Object.entries(STAFF_ROLES).map(([k, r]) => {
    const s = G.staff[k];
    return `<div class="panel"><h3>${r.name}</h3>${s
      ? `<div>${s.name} <span class="dim">&middot; ${STAFF_GRADES[s.skill]}</span></div><p style="font-size:14px">${r.desc(s.skill)}</p>
         <div class="row"><span class="num dim">${s.wage} denarii/day</span><button data-act="fire" data-v="${k}">Dismiss</button></div>`
      : `<p class="dim">Post vacant.</p><p class="dim" style="font-size:13px">${r.desc(1)}</p>`}</div>`;
  }).join('');
  const hall = G.hires.map(h => `<div class="panel"><h3>${h.name} <small>${STAFF_GRADES[h.skill]} ${STAFF_ROLES[h.role].name.toLowerCase()}</small></h3>
      <p style="font-size:14px">${STAFF_ROLES[h.role].desc(h.skill)}</p>
      <div class="row"><span class="num dim">${h.wage} denarii/day</span>
      <button class="primary" data-act="hire" data-v="${h.id}" ${G.denarii < h.fee ? 'disabled' : ''}>${G.staff[h.role] ? 'Replace' : 'Hire'} &mdash; ${h.fee} denarii</button></div></div>`).join('');
  return `<h2>Staff</h2><div class="cards">${mine}</div>
    <h2 style="margin-top:20px">Hiring hall <small>new faces every games day</small></h2>
    <div class="cards">${hall || '<div class="panel dim">No one is looking for work.</div>'}</div>`;
}

function ledger() {
  const rows = [['Food', -foodCost()], ['Wages', -wages()], ['Guild stipend', stipend()], ['Net', stipend() - upkeep()]];
  const cell = v => `<b class="num ${v < 0 ? 'bad' : v > 0 ? 'good' : 'dim'}">${v > 0 ? '+' : ''}${v}</b>`;
  return `<h2>Daily ledger <small>purses, wagers and gifts come on top</small></h2>
    <div class="panel row" style="gap:6px 18px">${rows.map(([n, v]) => `<span>${n} ${cell(v)}</span>`).join('')}</div>`;
}

function viewPatrons() {
  const cards = Object.entries(PATRONS).map(([k, p]) => {
    const f = G.patrons[k], cost = giftCost(k);
    return `<div class="panel"><h3>${p.name}</h3><div class="dim" style="font-size:13px">${p.desc}</div>
      <div class="barrow"${tip('favour')} style="margin:8px 0">Favour ${bar('prog', f, 100)}</div>
      <p>${p.perk(f)}</p>
      <button data-act="gift" data-v="${k}" ${G.denarii < cost || f >= 100 ? 'disabled' : ''}>Send a gift &mdash; ${cost} denarii</button></div>`;
  }).join('');
  return `<div class="fill one"><div><h2>Patrons</h2><div class="pane" data-pane="patrons">${G.fix ? `<p class="bad">You have agreed to lose your next bout for ${G.fix.pay} denarii.</p>` : ''}
    <div class="threecol">${cards}</div>
    <p class="dim" style="font-size:13px;margin-top:12px">Favour fades a little every games day. Victories please the Magistrate, and a roaring crowd pleases the Guild. Each gift costs more than the last. Patrons also offer paid work: see Contracts.</p></div></div></div>`;
}

function swatch(id) {
  const d = id && houseDef(id);
  return d ? `<span class="swatch" style="background:${d.col}"></span>` : '';
}
function rivalNote(e) {
  if (!e.vs) return '';
  return ` <span class="dim num">${e.wins}W ${e.losses}L</span>`
    + (e.vs.w || e.vs.l ? ` <span class="dim">(${e.vs.w}&ndash;${e.vs.l} against you)</span>` : '')
    + (e.exYours ? ' <span class="gold">once yours</span>' : '')
    + (e.slew.length ? ` <span class="bad">slew ${e.slew.join(', ')}</span>` : '');
}

function viewRivals() {
  const H = keepSel('hsel', G.houses), d = H && houseDef(H.id);
  const rows = G.houses.map(X => ({ id: X.id, name: houseDef(X.id).name, p: X.prestige, H: X }))
    .concat([{ name: 'Your ludus', p: G.fame, you: true }]).sort((a, b) => b.p - a.p);
  const table = rows.map((r, i) => r.you
    ? prow(`<div class="grow"><span class="t gold">${i + 1}. Your ludus</span></div><span class="end num gold">${r.p}</span>`)
    : lrow('hsel', r.id, `<div class="grow"><span class="t">${i + 1}. ${swatch(r.id)}${r.name}</span>
        <small>${r.H.won} won, ${r.H.lost} lost against you${r.H.grudge >= 40 ? ' &middot; <span class="bad">their champion will call you out</span>' : ''}</small></div>
        <div style="flex:none;width:90px"${tip('feud')}>${bar('hp', r.H.grudge, 100)}</div><span class="end num">${r.p}</span>`)).join('');
  const men = H ? H.roster.slice().sort((a, b) => statSum(b) - statSum(a)).map(e => `<div class="rival">
      <canvas width="48" height="56" data-rportrait="${H.id}:${e.id}"></canvas>
      <div>${e.name} <span class="dim">${RANKS[e.rank].name} ${CLASSES[e.cls].name}</span><br>
      <span class="dim num">strength ${Math.round(power(e))}</span>${rivalNote(e)}</div></div>`).join('') : '';
  return `<div class="fill even">
    <div><h2>Standing <small>renown, and the feud with each house</small></h2><div class="pane" data-pane="houses"><div class="panel list">${table}</div>
      <div class="listnote">Renown of every school in the province; yours is your fame. Beating a house that stands above you earns extra fame.
      Killing a house's fighters, or losing your own to them, deepens the feud. At 40 their champion challenges you to a grudge match, and leaving it unanswered costs you with the Magistrate and your own men.</div></div></div>
    <div><h2>${d ? d.name : 'Rival houses'}</h2><div class="pane" data-pane="house-${H ? H.id : ''}">${H ? `<div class="panel" style="border-left:6px solid ${d.col}">
      <div class="dim" style="font-size:13px">${d.lanista}. ${d.blurb}</div>
      <div class="rivalgrid">${men}</div></div>` : ''}</div></div>
  </div>`;
}

function festivalNote() {
  const f = G.festival;
  if (!f) return '';
  const today = f.day === G.day && G.bouts, F = FESTIVALS[today ? (f.shown || f.type) : f.type], left = f.day - G.day;
  return `<div class="panel" style="border-color:var(--gold);margin-bottom:14px"><h3>${F.name} <small>${today ? 'today' : left === 1 ? 'tomorrow' : 'in ' + left + ' days'}</small></h3>
    <div class="dim" style="font-size:13px">${F.blurb}</div></div>`;
}

function tourneyPanel() {
  const T = G.tourney;
  if (!T) return '';
  const prizes = [0, 1, 2].map(r => { const p = tourneyPrize(T, r); return `${ROUND_NAMES[r]} <b class="gold num">${p.purse}</b> <span class="num">+${p.fame} fame</span>`; }).join(' &middot; ');
  const entry = e => {
    if (e.you) { const g = byId(T.entrant); return `<b>${g ? g.name : 'Your man'}</b> <span class="dim">(yours)</span>`; }
    const g = tRival(e);
    return `${swatch(e.hid)}${e.name}` + (g ? ` <span class="dim num">${CLASSES[g.cls].name}, strength ${Math.round(power(g))}</span>` : ' <span class="dim">(dead)</span>');
  };
  let body;
  if (T.state === 'open') {
    const avail = G.roster.filter(canFight);
    if (!avail.some(g => g.id === ui.tpick)) ui.tpick = null;
    const chips = avail.map(g => `<span class="chip pick ${ui.tpick === g.id ? 'on' : ''}" data-act="tpick" data-v="${g.id}">${g.name} <span class="num">${Math.round(power(g))}</span></span>`).join('')
      || '<span class="dim">No one is fit to enter.</span>';
    body = `<div class="foes">${T.field.map(e => `<div>${entry(e)}</div>`).join('')}</div>
      <div>Choose a champion. He fights up to three bouts today with little rest between them, and sits out the ordinary games.</div>
      <div style="margin:6px 0">${chips}</div>
      <div class="row"><span class="dim">Entry fee <b class="num">${T.fee}</b> denarii</span>
      <button class="primary" data-act="tenter" ${ui.tpick && G.denarii >= T.fee ? '' : 'disabled'} style="margin-left:auto">Enter the lists</button></div>`;
  } else if (T.state === 'running' && T.bout) {
    const g = byId(T.entrant), pairs = [];
    for (let i = 0; i + 1 < T.alive.length; i += 2) pairs.push(`<div>${entry(T.alive[i])} <span class="dim">against</span> ${entry(T.alive[i + 1])}</div>`);
    const odds = winOdds([g], boutEnemies(T.bout));
    body = `<div class="foes"><b>${ROUND_NAMES[T.round]}</b>${pairs.join('')}</div>
      <div class="row"><span>${g.name}: health <b class="num">${Math.round(g.hp)}/${maxHp(g)}</b></span>
      <span class="dim">Bookmakers give him ${Math.round(odds.p * 100)} in 100</span>
      <button class="primary" data-act="tfight" style="margin-left:auto">To the sand</button></div>`;
  } else {
    body = T.champion === 'you' ? '<b class="gold">Your man wears the laurel.</b>' : `<span>${T.champion || 'A rival'} takes the laurel.</span>`;
  }
  return `<div class="panel bout" style="border-color:var(--gold);margin-bottom:14px"><h3>The lists</h3>
    <div style="font-size:13px">${prizes}</div>
    ${T.log.length ? `<div class="dim" style="font-size:13px;margin-top:6px">${T.log.join('<br>')}</div>` : ''}
    <hr class="sep">${body}</div>`;
}

// ---------- save menu ----------

function savesModal() {
  const when = t => t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'unknown time';
  const line = i => `${i.gen > 1 ? ordinal(i.gen)[0].toUpperCase() + ordinal(i.gen).slice(1) + ' generation &middot; ' : ''}Day <b class="num">${i.day}</b> &middot; ${i.tier} &middot; <span class="num">${i.fame}</span> fame &middot; <span class="num">${i.denarii}</span> denarii &middot; ${i.roster} fighter${i.roster === 1 ? '' : 's'}${i.won ? ' &middot; <span class="gold">victor</span>' : ''}${i.over ? ' &middot; <span class="bad">fallen</span>' : ''}`;
  const rows = [];
  for (let n = 1; n <= SLOT_COUNT; n++) {
    const info = slotInfo(n), bak = slotInfo(n, true), cur = n === slot && !!info;
    let body;
    if (info) {
      body = `<div>${line(info)}</div><div class="dim" style="font-size:12px">Saved ${when(info.savedAt)}</div>
        <div class="row" style="margin-top:6px">
          ${cur ? '' : `<button class="primary" data-act="slotload" data-v="${n}">Load</button><button data-act="slotcopy" data-v="${n}">${ui.confirmSlot === 'copy' + n ? 'Overwrite it?' : 'Save current game here'}</button>`}
          <button data-act="slotexport" data-v="${n}">Export</button>
          ${bak && bak.day !== info.day ? `<button data-act="slotrestore" data-v="${n}" title="Saved ${when(bak.savedAt)}">${ui.confirmSlot === 'restore' + n ? 'Go back to day ' + bak.day + '?' : 'Restore backup (day ' + bak.day + ')'}</button>` : ''}
          <button data-act="slotdel" data-v="${n}">${ui.confirmSlot === 'del' + n ? 'Really delete?' : 'Delete'}</button>
        </div>`;
    } else {
      body = `<div class="dim">Empty</div><div class="row" style="margin-top:6px">
        <button data-act="slotcopy" data-v="${n}">Save current game here</button>
        <button data-act="slotnew" data-v="${n}">New game</button>
        <button data-act="slotimport" data-v="${n}">Import a file</button></div>`;
    }
    rows.push(`<div class="panel ${cur ? 'sel' : ''}" style="margin:8px 0;padding:10px;${cur ? 'border-color:var(--gold)' : ''}">
      <b>Slot ${n}</b>${cur ? ' <span class="chip gold">Playing now</span>' : ''}${body}</div>`);
  }
  return `<h2>Saves</h2>
    <p class="dim" style="font-size:13px">The game saves itself to the slot you are playing after every action, and keeps a backup from the morning of the last games day. Export writes a slot to a file you can keep or carry to another computer.</p>
    ${ui.saveMsg ? `<p class="${ui.saveErr ? 'bad' : 'good'}">${ui.saveMsg}</p>` : ''}
    ${rows.join('')}
    <div class="row"><button class="primary" data-act="close">Done</button></div>`;
}
function refreshSaves(msg, err) {
  ui.saveMsg = msg || ''; ui.saveErr = !!err;
  if (modalQueue.length) { modalQueue[0] = savesModal(); paintModal(); }
}
// After the game in memory has been replaced: forget selections and redraw everything.
function afterLoad() {
  modalQueue.length = 0; paintModal();
  ui.sel = null; ui.picks = {}; ui.wagers = {}; ui.tpick = null; ui.overShown = false; ui.ruinShown = false; ui.confirmSlot = null; ui.saveMsg = ''; ui.tab = 'ludus';
  render();
  showReports();
  if (G.pendingEvent) showEvent();
  checkEnd();
}
// A destructive button must be pressed twice; the first press only relabels it.
function confirmSlot(key) {
  if (ui.confirmSlot === key) { ui.confirmSlot = null; return true; }
  ui.confirmSlot = key; refreshSaves(); return false;
}

function vowNote(e) {
  const g = G.roster.find(x => x.wish && x.wish.gid === e.id);
  return g ? ` <span class="gold">${g.name} has sworn to ${g.wish.type === 'avenge' ? 'kill' : 'beat'} him</span>` : '';
}

// Bonds, vows, promises and the last few lines of a fighter's history, for the dossier.
function storyBlock(g) {
  const chips = [];
  for (const b of bondsOf(g)) chips.push(`<span class="chip ${b.type === 'friend' ? 'gold' : 'red'}"${tip(b.type === 'friend' ? 'friend' : 'rivalbond')}>${b.type === 'friend' ? 'Friend of' : 'Rival of'} ${b.other.name}</span>`);
  if (g.wish) chips.push(`<span class="chip red"${tip('vow')}>${g.wish.type === 'avenge' ? 'Sworn to kill' : 'Wants a rematch with'} ${g.wish.name}</span>`);
  if (g.promise) { const left = Math.max(0, g.promise.at - g.wins); chips.push(`<span class="chip gold"${tip('promise')}>Promised freedom: ${left} more ${left === 1 ? 'victory' : 'victories'}</span>`); }
  const lines = (g.story || []).slice(-6).reverse().map(s => `<div><span class="d">Day ${s.d}</span>${s.t}</div>`).join('');
  if (!chips.length && !lines) return '';
  return `<hr class="sep">${chips.length ? `<div style="margin-bottom:4px">${chips.join('')}</div>` : ''}${lines ? `<div class="log" style="font-size:13px;max-height:none">${lines}</div>` : ''}`;
}

// ---------- equipment ----------

function itemTag(it) { return `<span class="rar r${it.r}"${tip('rarity')}>${RARITY[it.r]}</span> ${itemName(it)}`; }

// The six equipment slots on a fighter's dossier, with anything in the armoury he could wear instead.
function gearBlock(g) {
  if (!g.gear) return '';
  const rows = SLOTS.map(slot => {
    const it = g.gear[slot];
    const spare = G.armoury.filter(x => x.slot === slot && fits(x, g)).sort((a, b) => b.r - a.r);
    const worn = it
      ? `${itemArt(it, 40)}<span${tip(itemEffect(it))}>${itemTag(it)}</span> <button class="mini" data-act="unequip" data-v="${g.id}" data-w="${slot}">Take off</button>`
      : `<span class="dim">${slot === 'weapon' ? 'Practice ' + WEAPON_NAMES[g.cls] : 'Nothing'}</span>`;
    const choices = spare.map(x => `<button class="mini ${it && x.r <= it.r ? '' : 'better'}" data-act="equip" data-v="${g.id}" data-w="${x.id}"${tip(itemEffect(x))}>${it ? 'Swap for' : 'Wear'} ${RARITY[x.r]} ${itemName(x)}</button>`).join('');
    return `<span class="lbl"${tip(slot)}>${ic('slot-' + slot)}</span><div><div class="worn">${worn}</div>${choices ? `<div class="spare">${choices}</div>` : ''}</div>`;
  }).join('');
  const gs = gearStats(g);
  return `<div class="gearlist">${rows}</div>
    <div class="dim num" style="font-size:12px;margin-top:6px">Kit in all: +${gs.dmg.toFixed(1)} damage, ${gs.armor.toFixed(1)} off every blow${gs.dodge < 0 ? ', ' + (gs.dodge * 100).toFixed(1) + '% dodge' : ''}</div>`;
}

function viewSmith() {
  const S = G.smith, lv = S.level, odds = SMITH_ODDS[lv];
  const range = RARITY.filter((_, i) => odds[i] > 0);
  const best = it => G.roster.filter(g => fits(it, g) && (!g.gear[it.slot] || g.gear[it.slot].r < it.r)).map(g => g.name);
  const mine = G.armoury.slice().sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) || b.r - a.r);
  const it = keepSel('isel', S.stock.concat(mine)), own = !!it && G.armoury.includes(it);
  const row = (x, mineToo) => lrow('isel', x.id, `${itemArt(x, 28)}<div class="grow"><span class="t">${itemTag(x)}</span>
      <small>${SLOT_INFO[x.slot].name}${x.slot === 'weapon' ? ' &middot; ' + CLASSES[x.cls].name : ''}${best(x).length ? ' &middot; <span class="good">better for ' + best(x).join(', ') + '</span>' : ''}</small></div>
      <span class="end">${mineToo ? '<span class="dim">yours</span>' : `<b class="num ${G.denarii < buyPrice(x) ? 'bad' : 'gold'}">${buyPrice(x)}</b>`}</span>`);
  const stock = S.stock.map(x => row(x, false)).join('') || '<div class="listnote">He has sold everything he had. Come back after the next games.</div>';
  const racks = mine.map(x => row(x, true)).join('') || '<div class="listnote">The racks are empty. Pieces you buy wait here until a fighter wears them; open a fighter\'s dossier to equip him.</div>';
  const who = it ? best(it) : [];
  const card = it ? `<div class="panel item"><div class="itemhead">${itemArt(it, 60)}<div><h3>${itemTag(it)}</h3>
      <div class="dim" style="font-size:12px;text-transform:uppercase;letter-spacing:.06em">${SLOT_INFO[it.slot].name}${it.slot === 'weapon' ? ' &middot; ' + CLASSES[it.cls].name : ''}</div></div></div>
      <p style="font-size:14px">${itemEffect(it)}</p>
      <div class="dim" style="font-size:13px;margin-bottom:8px">${who.length ? 'An improvement for ' + who.join(', ') : it.slot === 'weapon' && !G.roster.some(g => g.cls === it.cls) ? 'Nobody in your ludus fights this way' : 'No better than what your men wear'}.${own ? ' To put it on a man, open his dossier.' : ''}</div>
      ${own ? `<button data-act="smithsell" data-v="${it.id}">Sell back &mdash; ${Math.round(itemPrice(it) / 2)}</button>`
            : `<button class="primary" data-act="smithbuy" data-v="${it.id}" ${G.denarii < buyPrice(it) ? 'disabled' : ''}>Buy &mdash; ${buyPrice(it)} denarii</button>`}
    </div>` : '';
  const forge = `<div class="panel" style="margin-top:10px"><div class="row">
      <div style="flex:1;min-width:200px"><h3${tip('smithlevel')}>${SMITH_NAMES[lv]} <span class="pips">${'●'.repeat(lv)}${'○'.repeat(4 - lv)}</span></h3>
      <div class="dim" style="font-size:13px">Offers ${4 + lv} pieces each games day, graded ${range[0]} to ${range[range.length - 1]}.${lv < 4 ? ` Improved, he would offer ${5 + lv}, graded ${RARITY.filter((_, i) => SMITH_ODDS[lv + 1][i] > 0)[0]} to ${RARITY.filter((_, i) => SMITH_ODDS[lv + 1][i] > 0).slice(-1)[0]}.` : ' There is no finer forge in the empire.'}</div></div>
      ${lv < 4 ? `<button data-act="smithup" ${G.denarii < SMITH_COST[lv] ? 'disabled' : ''}>Improve the forge &mdash; ${SMITH_COST[lv]}</button>` : ''}
    </div></div>`;
  return `<div class="fill even">
    <div><h2>For sale <small>new stock every games day</small></h2><div class="pane" data-pane="smith"><div class="panel list">${stock}</div>
      <h2${tip('armoury')}>Your armoury <small>${G.armoury.length} spare ${G.armoury.length === 1 ? 'piece' : 'pieces'}</small></h2><div class="panel list">${racks}</div></div></div>
    <div><h2>The piece</h2><div class="pane" data-pane="piece">${card}${forge}</div></div>
  </div>`;
}

// ---------- the dynasty ----------

const cap1 = t => t[0].toUpperCase() + t.slice(1);

// What the family holds, for the Chronicle.
function dynastyPanel() {
  const D = G.dynasty;
  if (D.gen === 1 && !D.history.length) return '';
  const boons = D.boons.map(b => `<div><b class="gold">${BOONS[b].name}.</b> <span class="dim">${BOONS[b].desc}</span></div>`).join('') || '<div class="dim">No boons yet.</div>';
  const tree = Object.keys(D.tree).filter(k => D.tree[k]).map(k => `<div><b>${LEGACY_TREE[k].name}</b> <span class="pips">${'●'.repeat(D.tree[k])}</span> <span class="dim">${LEGACY_TREE[k].desc(D.tree[k])}</span></div>`).join('');
  const past = D.history.map(h => `<div><span class="d">${cap1(ordinal(h.gen))}</span>Lasted ${h.days} days, reached the ${h.tier} with ${h.fame} fame and ${h.wins} victories. Left ${h.earned} legacy.</div>`).join('');
  return `<h2>The dynasty <small>${ordinal(D.gen)} generation &middot; ${D.points} legacy unspent</small></h2>
    <div class="panel">${boons}${tree ? '<hr class="sep">' + tree : ''}${past ? '<hr class="sep"><div class="log" style="max-height:none">' + past + '</div>' : ''}</div>`;
}

// The succession, shown when debt has taken the ludus. Four steps; it cannot be closed.
function ruinModal() {
  const R = G.ruin, D = G.dynasty;
  const steps = `<div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">The succession &middot; ${R.step + 1} of 4</div>`;
  if (R.step === 0) {
    const h = D.history[D.history.length - 1];
    return `${steps}<h2>The creditors come</h2>
      <p>The days of grace are spent and the purse is still empty. They arrive at dawn with soldiers and a magistrate's seal, and take the ludus, the men and the keys.</p>
      <p>But a house is more than its walls. Your heir will begin again, and the family keeps what this ludus earned.</p>
      <ul><li>Lasted <b class="num">${h.days}</b> days</li><li>Reached the <b>${h.tier}</b> with <b class="num">${h.fame}</b> fame</li><li>Won <b class="num">${h.wins}</b> bouts</li></ul>
      <p>The house earns <b class="gold num">${R.earned}</b> legacy${D.points > R.earned ? `, and holds <b class="num">${D.points}</b> in all` : ''}.</p>
      <div class="row"><button class="primary" data-act="ruinstep" data-v="1">Send for your heir</button></div>`;
  }
  if (R.step === 1) {
    const men = G.roster.map(g => `<p><button class="${R.fighter === g.id ? 'primary' : ''}" data-act="ruinpick" data-v="${g.id}">${g.name}</button>
      <span class="dim">${RANKS[g.rank].name} ${CLASSES[g.cls].name}, ${g.wins} victories, strength ${Math.round(power(g))}</span></p>`).join('');
    return `${steps}<h2>One man goes with him</h2>
      <p>There is time to get one fighter out through the kitchen gate before the seal goes on the doors. He will arrive with nothing but his skill, and less of that than he had: a hard road wears a man down.</p>
      ${men || '<p class="dim">There is nobody left to send.</p>'}
      <p><button class="${R.fighter === null ? 'primary' : ''}" data-act="ruinpick" data-v="0">Send no one</button></p>
      <div class="row"><button class="primary" data-act="ruinstep" data-v="${R.offers.length ? 2 : 3}">Continue</button></div>`;
  }
  if (R.step === 2) {
    const cards = R.offers.map(b => `<div class="panel" style="margin:8px 0;padding:10px;${R.boon === b ? 'border-color:var(--gold)' : ''}">
      <b class="gold">${BOONS[b].name}</b> <span class="chip">${['', 'Common', 'Uncommon', 'Rare'][BOONS[b].tier]}</span>
      <div style="margin:4px 0 8px">${BOONS[b].desc}</div>
      <button class="${R.boon === b ? 'primary' : ''}" data-act="ruinboon" data-v="${b}">${R.boon === b ? 'Chosen' : 'Keep this'}</button></div>`).join('');
    return `${steps}<h2>What the family keeps</h2>
      <p>Not everything can be carried out of a ruin. Choose one of these; it stays with the house for every generation to come.</p>
      ${cards}
      <div class="row"><button class="primary" data-act="ruinstep" data-v="3" ${R.boon ? '' : 'disabled'}>Continue</button></div>`;
  }
  const rows = Object.keys(LEGACY_TREE).map(k => {
    const T = LEGACY_TREE[k], l = D.tree[k] || 0, c = legacyCost(k);
    return `<div class="panel" style="margin:6px 0;padding:8px 10px"><div class="row"><div style="flex:1;min-width:200px"><b>${T.name}</b> <span class="pips">${'●'.repeat(l)}${'○'.repeat(T.cost.length - l)}</span>
      <div class="dim" style="font-size:13px">${c === null ? T.desc(l) : (l ? T.desc(l) + ' Next: ' : '') + T.desc(l + 1)}</div></div>
      ${c === null ? '<span class="dim">Complete</span>' : `<button data-act="ruinbuy" data-v="${k}" ${D.points < c ? 'disabled' : ''}>${c} legacy</button>`}</div></div>`;
  }).join('');
  return `${steps}<h2>The family ledger</h2>
    <p>Legacy buys lasting advantages for every heir. What you do not spend now is kept for the next time. <b class="gold num">${D.points}</b> legacy to spend.</p>
    ${rows}
    <div class="row"><button class="primary" data-act="ruinstart">Begin as the heir</button></div>`;
}
function refreshRuin() { modalQueue[0] = ruinModal(); paintModal(); }

function heirIntro() {
  const D = G.dynasty, kept = D.boons.map(b => `<li><b>${BOONS[b].name}.</b> ${BOONS[b].desc}</li>`).join('');
  const tree = Object.keys(D.tree).filter(k => D.tree[k]).map(k => `<li><b>${LEGACY_TREE[k].name}.</b> ${LEGACY_TREE[k].desc(D.tree[k])}</li>`).join('');
  showModal(`<h2>The ${ordinal(D.gen)} generation</h2>
    <p>The old ludus is sealed and sold. You have a rented yard, ${G.roster.length} fighters and ${G.denarii} denarii, and the name of a house that has done this before.</p>
    ${kept || tree ? `<p>What the family kept:</p><ul>${kept}${tree}</ul>` : ''}
    ${okBtn('Open the gates')}`);
}

function provincePanel() {
  const M = wildMap(), relics = M.relics.map(k => RELICS[k].name).join(', '), lead = eagleLead();
  if (!M.cleared && !M.story && wildExplored() < 0.005) return '';
  return `<h2>The province</h2><div class="panel"><div>${Math.round(wildExplored() * 100)}% of the country walked &middot; ${M.cleared} places dealt with${relics ? ` &middot; found: ${relics}` : ''}.</div>
    ${lead ? `<div style="margin-top:4px"><b class="gold">The eagle of the Seventeenth.</b> ${lead}</div>` : ''}</div>`;
}

function viewChronicle() {
  const rows = G.log.slice().reverse().map(e => `<div class="${e.k}"><span class="d">Day ${e.d}</span>${e.t}</div>`).join('');
  const fallen = G.fallen.length ? `<h2>The fallen</h2><div class="panel">${G.fallen.map(f => `<div>${f.name}, ${CLASSES[f.cls].name} &mdash; ${f.wins} victories, died day ${f.day}${f.by ? ', slain by ' + f.by : ''}</div>`).join('')}</div>` : '';
  return `<div class="fill">
    <div><h2>Chronicle</h2><div class="pane" data-pane="log"><div class="panel log">${rows}</div></div></div>
    <div><h2>The house</h2><div class="pane" data-pane="house">${fallen || '<div class="panel dim">No fighter of this house has died yet.</div>'}${provincePanel()}${dynastyPanel()}
      <p style="margin-top:14px" class="row"><button data-act="tuton"${tip('steward')}>Summon the steward (tutorial)</button><button data-act="askreset">Abandon this ludus and start anew</button></p></div></div>
  </div>`;
}

function paintPortraits() {
  document.querySelectorAll('[data-item]').forEach(paintItem);
  document.querySelectorAll('[data-portrait]').forEach(cv => { const g = byId(cv.dataset.portrait); if (g) drawPortrait(cv, g, 0); });
  document.querySelectorAll('[data-rportrait]').forEach(cv => {
    const [hid, gid] = cv.dataset.rportrait.split(':');
    const g = houseOf(hid).roster.find(x => x.id === +gid), d = houseDef(hid);
    if (g) drawPortrait(cv, g, 1, d.col, d.colD);
  });
  document.querySelectorAll('[data-mportrait]').forEach(cv => { const g = G.market.find(m => m.id === +cv.dataset.mportrait); if (g) drawPortrait(cv, g, 0); });
}

// ---------- events and end states ----------

function showEvent() {
  const pe = G.pendingEvent;
  if (!pe || !EVENTS[pe.id]) { G.pendingEvent = null; return; }
  const E = EVENTS[pe.id];
  const btns = E.opts.map((o, i) => `<button data-act="evopt" data-v="${i}" ${o.ok && !o.ok(pe.c) ? 'disabled' : ''}>${o.label(pe.c)}</button>`).join('');
  showModal(`<h2>${E.title}</h2><p>${E.text(pe.c)}</p><div class="row">${btns}</div>`);
  SFX.ui('scroll');
}

function checkEnd() {
  if (G.ruin && !ui.ruinShown) { ui.ruinShown = true; modalQueue.length = 0; showModal(ruinModal()); return; }
  if (G.over && !ui.overShown) {
    ui.overShown = true;
    const why = 'Your cells are empty and your purse cannot fill them. The gates are chained shut.';
    showModal(`<h2>The ludus falls</h2><p>${why}</p><p class="dim">You lasted ${G.day} days and earned ${G.fame} fame.</p>
      <div class="row"><button class="primary" data-act="reset">Begin again</button></div>`);
  }
  if (G.won && !G.wonShown) {
    G.wonShown = true; save();
    showModal(`<h2>Ave, lanista</h2><p>Your fighters stand alone on the sand of the Great Arena. The Emperor rises. Fifty thousand voices shout the name of your house.</p>
      <p>You have won the Emperor's Games on day ${G.day}. The ludus is yours to run for as long as you like.</p>${okBtn('Glory')}`);
  }
}

// ---------- arena overlay ----------

let fight = null;

function startFight(boutId, tourneyBout) {
  const b = tourneyBout || G.bouts.find(x => x.id === +boutId);
  if (!b || b.done) return;
  const picks = tourneyBout ? [byId(G.tourney.entrant)].filter(Boolean) : (ui.picks[b.id] || []).map(byId).filter(g => g && canFight(g));
  if (picks.length !== b.size) return;
  const tut = tutorState();
  if ((tut.on || tut.hints) && !tut.seen.fight) {
    tut.seen.fight = true; save(); ui.heldFight = [boutId, tourneyBout];
    showModal(`<h2>Before he goes out</h2>
      <p>Your men fight on their own, as they were trained and as their standing orders say. What you decide is their <b>abilities</b>.</p>
      <ul><li><b>The gold bar</b> under a man's health is his charge. It fills slowly by itself, and faster with every blow given or taken.</li>
      <li><b>When it is full, the fight stops</b> and you choose which of his abilities he uses: keys 1 to 4, or click. If you would rather they chose for themselves, switch <b>Abilities</b> to auto below the sand.</li>
      <li><b>Styles.</b> Strength beats Agility, Agility beats Skill, Skill beats Strength. The marks on the bout card show whose style has the edge.</li>
      <li><b>Throw in the cloth</b> (key C): your worst-hurt man yields at once. A man who yields is spared far more often than one struck down. Once a bout, and never in a fight to the death.</li></ul>
      <p>Below the sand you can run the fight faster or skip to the result. The crowd's bar matters: an exciting fight earns more fame.</p>
      <div class="row"><button class="primary" data-act="fightgo">To the sand</button></div>`);
    return;
  }
  const wager = Math.min(ui.wagers[b.id] || 0, Math.max(0, G.denarii));
  const odds = winOdds(picks, boutEnemies(b));
  G.denarii -= wager;
  const B = createBattle(picks, boutEnemies(b), { ask: !ui.autoCast, death: b.death, mercy: [mercyBonus(), 0], tier: b.final ? 4 : tier(), names: ['Your ludus', b.hunt ? 'The beasts' : b.house], hunt: !!b.hunt,
    foeCol: b.houseId && houseDef(b.houseId).col, foeColD: b.houseId && houseDef(b.houseId).colD });
  SFX.init(); SFX.play('horn'); SFX.music('arena');
  fight = { bout: b, B, speed: 1, wager, pay: odds.pay, last: 0, raf: 0 };
  $('#arenaHead').innerHTML = `<span style="color:${TEAM_COL[0]}">Your ludus</span> <span class="dim">vs</span> <span style="color:${b.houseId ? houseDef(b.houseId).col : '#6fa4e6'}">${b.house}</span>${b.death ? ' &middot; <span class="death">to the death</span>' : ''}`;
  $('#arena').hidden = false;
  paintSpeed(); paintOrders();
  drawBattle($('#arenaCanvas').getContext('2d'), B);
  fight.raf = requestAnimationFrame(fightLoop);
}
// A fight out in the province: every fit man you have, against whatever was waiting (wilds.js sets it up).
function startWildFight() {
  const F = G.field && G.field.fight;
  if (!F) return;
  const picks = fieldParty();
  if (!picks.length) { G.field.fight = null; return; }
  const B = createBattle(picks, F.foes, { ask: !ui.autoCast, wild: F.backdrop, hunt: true, mercy: [mercyBonus(), 0], names: ['Your school', F.title] });
  SFX.init(); SFX.play('horn'); SFX.music('arena');
  fight = { wild: true, bout: null, B, speed: 1, wager: 0, pay: 0, last: 0, raf: 0 };
  $('#arenaHead').innerHTML = `<span style="color:${TEAM_COL[0]}">Your school</span> <span class="dim">against</span> <span style="color:#6fa4e6">${F.title}</span>`;
  $('#arena').hidden = false;
  paintSpeed(); paintOrders();
  drawBattle($('#arenaCanvas').getContext('2d'), B);
  fight.raf = requestAnimationFrame(fightLoop);
}
// The east gate of the village: the way out to the province.
function villageGate() {
  if (!gateOpen()) { showModal(`<h2>The east gate</h2><p>The gate-captain will not open for a lanista nobody has heard of. Fight your first games, and the road is yours.</p>${okBtn()}`); return; }
  if (!G.roster.some(g => !g.away)) { showModal(`<h2>The east gate</h2><p>You have nobody to march out with.</p>${okBtn()}`); return; }
  if (!wildEnter()) return;
  prov.trail = []; prov.path = null;
  SFX.ui('gate'); SFX.music('wild');
  render();
  const M = wildMap();
  if (!M.told) {
    M.told = true; save();
    showModal(`<h2>Beyond the walls</h2>
      <p>The whole school marches with you: every man, the mules, the baggage. What lies out there is on no map you own. The country is under parchment until you have walked it.</p>
      <ul><li><b>Walking costs no time.</b> Steer with W A S D or click where you want to go; roads are quicker, forest, hill and marsh slower.</li>
      <li><b>Going into a place takes the day</b>, and so does making camp. Nobody trains out here. Marching tires the men; camp rests them.</li>
      <li><b>Every fit man fights</b> when it comes to it, and there is no crowd to spare the fallen: a man who goes down lives or dies by luck and your medicus.</li>
      <li><b>The skulls</b> by a place say how hard it is. The country is worse the farther you go from home.</li>
      <li><b>Games are still held in town</b> every fifth day. If you are not there, you miss them.</li>
      <li>Nothing out here can be done twice. Walk back into the town to go home.</li></ul>${okBtn('March')}`);
  }
}
// The order buttons: greyed while your voice recovers, with the seconds left on them.
function paintOrders() {
  if (!fight) return;
  const B = fight.B, pick = B.pick && !out(B.pick) ? B.pick : null;
  const state = [canOrder(B, 'yield'), pick ? pick.g.id : 0, !!ui.autoCast, B.over].join();
  if (state === fight.ordState) return;
  fight.ordState = state;
  $('#ordYield').disabled = !canOrder(B, 'yield');
  $('#ordYield').style.visibility = B.hunt ? 'hidden' : 'visible';
  $('#autoCast').textContent = ui.autoCast ? 'Abilities: auto' : 'Abilities: ask me';
  // the fight has stopped for one of yours: his abilities, to choose from
  const el = $('#arenaPick');
  el.hidden = !pick;
  if (pick) {
    el.innerHTML = `<div class="who">${pick.g.name} is charged ${styleMark(pick.g)}</div><div class="abrow">${pick.abl.map((a, i) =>
      `<button data-act="abpick" data-v="${a.id}"><span class="key">${i + 1}</span><b>${a.name}</b><small>${a.desc}</small></button>`).join('')}</div>`;
    SFX.ui('chime');
  }
}
function paintSpeed() {
  $('#muteBtn').textContent = SFX.muted ? 'Sound off' : 'Sound on';
  document.querySelectorAll('#arenaCtl [data-act="speed"]').forEach(b => b.classList.toggle('on', fight && +b.dataset.v === fight.speed));
}
function fightLoop(ts) {
  const f = fight;
  if (!f || f.finished) return;
  const dt = f.last ? Math.min(0.05, (ts - f.last) / 1000) : 0.016;
  f.last = ts;
  for (let i = 0; i < f.speed; i++) stepBattle(f.B, dt);
  for (const s of f.B.snd) SFX.play(s[0], s[1], s[2], s[3]);
  f.B.snd.length = 0;
  SFX.crowd(f.B.exc + (f.B.over ? 0.3 : 0));
  paintOrders();
  drawBattle($('#arenaCanvas').getContext('2d'), f.B);
  if (f.B.over && f.B.outro > f.B.outroEnd) { finishFight(); return; }
  f.raf = requestAnimationFrame(fightLoop);
}
function finishFight() {
  const f = fight;
  if (!f || f.finished) return;
  f.finished = true;
  cancelAnimationFrame(f.raf);
  f.B.ask = false; f.B.pick = null;             // nobody is asked while the rest is played out unseen
  $('#arenaPick').hidden = true;
  let guard = 0;
  while ((!f.B.over || f.B.outro <= f.B.outroEnd) && guard++ < 20000) stepBattle(f.B, 1 / 30);
  f.B.snd.length = 0; SFX.quiet();
  drawBattle($('#arenaCanvas').getContext('2d'), f.B);
  if (f.wild) {
    const w = applyWildResult(f.B);
    SFX.play(w.win ? 'victory' : 'defeat'); SFX.music(null);
    showModal(`<h2 class="${w.win ? '' : 'bad'}">${w.win ? 'The field is yours' : 'Driven off'}</h2>
      <ul>${w.lines.map(l => `<li>${l}</li>`).join('')}</ul>
      <div class="row"><button class="primary" data-act="leavearena">Back to the column</button></div>`);
    return;
  }
  const r = applyBoutResult(f.bout, f.B, f.wager, f.pay);
  SFX.play(r.win ? 'victory' : 'defeat'); SFX.music(null);          // the fanfare has the floor
  const money = [];
  if (r.purse) money.push(`Purse: <b class="gold num">+${r.purse}</b> denarii`);
  if (r.wager) money.push(r.win ? `Wager pays <b class="gold num">+${r.wagerGain}</b>` : `Wager lost: <b class="bad num">-${r.wager}</b>`);
  if (r.fameGain) money.push(`Fame: <b class="num">+${r.fameGain}</b>`);
  const mood = r.avgExc > 0.55 ? 'The crowd is on its feet, roaring.' : r.avgExc > 0.3 ? 'The crowd is well pleased.' : 'The crowd wanted more.';
  showModal(`<h2 class="${r.win ? '' : 'bad'}">${r.win ? 'Victory' : 'Defeat'}</h2>
    <p class="dim">${f.B.decision ? 'The fight drags on; the judges decide it. ' : ''}${mood}</p>
    ${r.lines.length ? `<ul>${r.lines.map(l => `<li>${l}</li>`).join('')}</ul>` : ''}
    <p>${money.join(' &middot; ') || 'You leave with nothing.'}</p>
    <div class="row"><button class="primary" data-act="leavearena">Return to the ludus</button></div>`);
}

// ---------- actions ----------

const ACTIONS = {
  tab(v) { ui.tab = v; villagePlace(v); render(); },                 // a jump, for the dev drawer and the steward; the player walks
  village(v, w, el, e) { const k = villagePick(el, e); if (k) villageWalkTo(k); },
  yard(v, w, el, e) {                       // click a fighter to open his dossier, a building to go to its screen
    const h = typeof yardPick === 'function' ? yardPick(el, e) : null;
    if (!h) return;
    if (h.fighter) { ui.sel = h.fighter; villageWalkTo('ludus'); } else villageWalkTo(h.tab);       // he walks there; nothing opens until he arrives
    render();
  },
  activity(v, w, el) {
    const g = byId(v);
    if (!g || el.classList.contains('off')) return;
    g.activity = w; ui.sel = g.id; save(); render();
  },
  sel(v, w, el, e) { if (e.target.closest('select')) return; ui.sel = +v; render(); },
  close() { closeModal(); checkEnd(); },
  endday() {
    if (G.over) { checkEnd(); return; }
    const open = G.bouts ? G.bouts.filter(b => !b.done).length : 0;
    if (open && G.roster.some(canFight) && !ui.confirmSkip) {
      ui.confirmSkip = true;
      showModal(`<h2>Leave the games?</h2><p>There ${open === 1 ? 'is still a bout' : `are still ${open} bouts`} to be fought today, and fighters fit to enter.</p>
        <div class="row"><button data-act="close">Stay</button><button class="primary" data-act="forceend">End the day</button></div>`);
      return;
    }
    ui.confirmSkip = false;
    endDay(); render();
    SFX.ui(G.ruin ? 'thud' : isGamesDay() ? 'herald' : 'day');
    showReports();
    if (G.pendingEvent) showEvent();
    checkEnd();
  },
  forceend() { closeModal(); ACTIONS.endday(); },
  evopt(v) {
    const pe = G.pendingEvent; if (!pe) { closeModal(); return; }
    const E = EVENTS[pe.id];
    const res = E.opts[+v].run(pe.c);
    if (G.field && G.field.fight) { G.pendingEvent = null; save(); closeModal(); startWildFight(); return; }       // it has come to blows
    log(`${E.title}: ${res}`);
    G.pendingEvent = null; nextEvent(); save();
    modalQueue[0] = `<h2>${E.title}</h2><p>${res}</p>${okBtn()}`;
    paintModal(); render();
    if (G.pendingEvent) showEvent();          // another matter is waiting behind this one
  },
  dossier(v) { ui.sel = +v; villageWalkTo('ludus'); render(); },
  rowsel(v, w) { ui[v] = /^\d+$/.test(w) ? +w : w; render(); },
  dtab(v) { ui.dtab = v; render(); },
  yardtoggle() {
    ui.noyard = !ui.noyard;
    try { localStorage.setItem('ludus-magnus-yard', ui.noyard ? 'off' : 'on'); } catch (e) { /* storage unavailable */ }
    render();
  },
  cpick(v, w) {
    const c = G.contracts.find(x => x.id === +v); if (!c) return;
    const id = +w;
    let p = ui.cpicks[c.id] || [];
    if (p.includes(id)) p = p.filter(x => x !== id);
    else {
      for (const k in ui.cpicks) ui.cpicks[k] = ui.cpicks[k].filter(x => x !== id);
      p = (ui.cpicks[c.id] || []).concat(id);
      while (p.length > c.size) p.shift();
    }
    ui.cpicks[c.id] = p; render();
  },
  csend(v) { if (sendContract(v, ui.cpicks[v] || [])) { delete ui.cpicks[v]; render(); } },
  smithbuy(v) { if (buyItem(v)) { save(); render(); } },
  smithsell(v) { if (sellItem(v)) { save(); render(); } },
  smithup() { if (upgradeSmith()) { save(); render(); } },
  equip(v, w) { const g = byId(v); if (g && equip(g, w)) { save(); render(); } },
  unequip(v, w) { const g = byId(v); if (g && unequip(g, w)) { save(); render(); } },
  sell(v) {
    const g = byId(v); if (!g) return;
    const p = Math.round(value(g) / 2);
    G.denarii += p; G.roster = G.roster.filter(x => x !== g); departed(g, 'sold');
    log(`${g.name} is sold for ${p} denarii.`);
    save(); render();
  },
  free(v) {
    const g = byId(v); if (!g || g.wins < 8) return;
    const gain = 40 + g.wins * 5;
    G.roster = G.roster.filter(x => x !== g); departed(g, 'freed');
    G.fame += gain;
    G.roster.forEach(x => { x.morale = clamp(x.morale + 20, 0, 100); });
    log(`${g.name} is given the wooden sword and walks free. The city talks of little else. +${gain} fame.`, 'gold');
    save(); render();
    showModal(`<h2>The wooden sword</h2><p><b>${g.name}</b> takes the rudis from your hand and walks out through the gate a free man. Every fighter in the yard watches him go, and trains harder for it.</p><p>Fame <b class="num">+${gain}</b>. Morale rises across the ludus.</p>${okBtn()}`);
  },
  buy(v) {
    const g = G.market.find(m => m.id === +v);
    if (!g || G.denarii < g.price || G.roster.length >= capacity()) return;
    G.denarii -= g.price; addStory(g, `Bought at market for ${g.price} denarii.`); delete g.price;
    G.market = G.market.filter(m => m !== g); G.roster.push(welcome(g));
    log(`${g.name} the ${CLASSES[g.cls].name} is bought at market.`);
    ui.sel = g.id; save(); render();
  },
  build(v) {
    const l = G.fac[v];
    if (l >= 3 || G.denarii < FAC_COST[l]) return;
    G.denarii -= FAC_COST[l]; G.fac[v]++;
    log(`${FACILITIES[v].name} improved to level ${G.fac[v]}.`, 'gold');
    save(); render();
  },
  ration(v) { G.ration = +v; save(); render(); },
  pick(v, w) {
    const b = G.bouts.find(x => x.id === +v); if (!b) return;
    const id = +w;
    let p = ui.picks[b.id] || [];
    if (p.includes(id)) p = p.filter(x => x !== id);
    else {
      for (const k in ui.picks) ui.picks[k] = ui.picks[k].filter(x => x !== id);
      p = (ui.picks[b.id] || []).concat(id);
      while (p.length > b.size) p.shift();
    }
    ui.picks[b.id] = p; render();
  },
  fight(v) { startFight(v); },
  hire(v) {
    const h = G.hires.find(x => x.id === +v);
    if (!h || G.denarii < h.fee) return;
    G.denarii -= h.fee;
    G.staff[h.role] = { name: h.name, skill: h.skill, wage: h.wage };
    G.hires = G.hires.filter(x => x !== h);
    log(`${h.name} is taken on as ${STAFF_ROLES[h.role].name.toLowerCase()}.`);
    save(); render();
  },
  fire(v) {
    const s = G.staff[v]; if (!s) return;
    delete G.staff[v];
    log(`${s.name} the ${STAFF_ROLES[v].name.toLowerCase()} is dismissed.`);
    save(); render();
  },
  gift(v) {
    const c = giftCost(v);
    if (G.denarii < c || G.patrons[v] >= 100) return;
    G.denarii -= c; G.gifts[v]++; favor(v, 10);
    log(`A gift worth ${c} denarii is sent to ${PATRONS[v].name}.`);
    save(); render();
  },
  perk(v) {
    const g = byId(v); if (!g || g.perkPending <= 0) return;
    const offer = perkOffer(g); save();
    showModal(`<h2>${g.name}, ${RANKS[g.rank].name}</h2><p>Choose what the sand has taught him.</p>
      ${offer.map(t => `<p><button data-act="pickperk" data-v="${g.id}" data-w="${t}">${TRAITS[t].name}</button> <span class="dim">${TRAITS[t].desc}</span></p>`).join('')}
      <div class="row"><button data-act="close">Decide later</button></div>`);
  },
  pickperk(v, w) { const g = byId(v); if (g) choosePerk(g, w); save(); closeModal(); render(); },
  skipdays() {
    if (G.over) { checkEnd(); return; }
    let n = 0;
    do { endDay(); n++; } while (n < GAMES_EVERY && !isGamesDay() && !G.over && !G.pendingEvent && !G.reports.length);
    render();
    SFX.ui(G.ruin ? 'thud' : isGamesDay() ? 'herald' : 'day');
    showReports();
    if (G.pendingEvent) showEvent();
    checkEnd();
  },
  tpick(v) { ui.tpick = +v; render(); },
  tenter() { if (enterTourney(ui.tpick)) { ui.tpick = null; render(); } },
  tfight() { if (G.tourney && G.tourney.bout) startFight(null, G.tourney.bout); },
  saves() { ui.confirmSlot = null; ui.saveMsg = ''; showModal(savesModal()); },
  slotload(v) { save(); if (loadSlot(+v)) afterLoad(); else refreshSaves('That slot could not be read.', true); },
  slotcopy(v) {
    if (slotInfo(+v) && !confirmSlot('copy' + v)) return;
    refreshSaves(copyToSlot(+v) ? `Current game copied to slot ${v}.` : 'There is no room left to store another save.', false);
  },
  slotnew(v) { save(); slot = +v; newGame(); afterLoad(); intro(); },
  slotdel(v) {
    if (!confirmSlot('del' + v)) return;
    deleteSlot(+v);
    if (+v === slot) {            // the game being played was deleted: move to another save, or start afresh here
      let n = 0;
      for (let i = 1; i <= SLOT_COUNT && !n; i++) if (slotInfo(i)) n = i;
      if (n && loadSlot(n)) { afterLoad(); return; }
      newGame(); afterLoad(); intro(); return;
    }
    refreshSaves(`Slot ${v} deleted.`);
  },
  slotrestore(v) {
    if (!confirmSlot('restore' + v)) return;
    if (+v === slot) { if (loadSlot(+v, true)) afterLoad(); return; }
    const d = readSlot(+v, true);
    if (d) localStorage.setItem(slotKey(+v), JSON.stringify(d));
    refreshSaves(`Slot ${v} put back to its backup.`);
  },
  slotexport(v) {
    if (+v === slot) save();
    const d = readSlot(+v); if (!d) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d)], { type: 'application/json' }));
    a.download = `ludus-magnus-slot${v}-day${d.day}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    refreshSaves(`Slot ${v} exported as ${a.download}.`);
  },
  slotimport(v) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      f.text().then(t => { const err = importSave(t, +v); refreshSaves(err || `Imported into slot ${v}. Press Load to play it.`, !!err); });
    };
    inp.click();
  },
  tutstart() { G.tut = { step: 0, on: true, hints: true, seen: {} }; ui.tab = 'ludus'; villagePlace('ludus'); ui.dtab = 'stats'; save(); closeModal(); render(); },
  tuton() { G.tut = { step: 0, on: true, hints: true, seen: {} }; ui.tab = 'ludus'; villagePlace('ludus'); ui.dtab = 'stats'; save(); render(); },
  tutnext() { G.tut.step++; save(); render(); },
  tutback() { let i = G.tut.step - 1; while (i > 0 && TUTORIAL[i].until) i--; G.tut.step = Math.max(0, i); save(); render(); },
  tutoff() { G.tut.on = false; G.tut.hints = false; save(); renderTutor(); },
  hintok(v) { tutorState().seen[v] = true; save(); renderTutor(); },
  fightgo() { closeModal(); const f = ui.heldFight; ui.heldFight = null; if (f) startFight(f[0], f[1]); },
  ruinstep(v) { G.ruin.step = +v; save(); refreshRuin(); },
  ruinpick(v) { ruinFighter(+v || null); save(); refreshRuin(); },
  ruinboon(v) { ruinBoon(v); save(); refreshRuin(); },
  ruinbuy(v) { if (buyLegacy(v)) { save(); refreshRuin(); } },
  ruinstart() {
    if (!startHeir()) return;
    modalQueue.length = 0; paintModal();
    ui.sel = null; ui.picks = {}; ui.wagers = {}; ui.tpick = null; ui.overShown = false; ui.ruinShown = false; ui.tab = 'ludus';
    render(); heirIntro();
  },
  devclose() { ui.dev = false; renderDev(); },
  dev(v, w) {
    if (!DEV[v]) return;
    try { ui.devMsg = DEV[v](w); } catch (e) { ui.devMsg = 'Failed: ' + e.message; console.error(e); }
    if (!G.ruin) save();
    render();
    if (G.pendingEvent && !modalQueue.length) showEvent();
    checkEnd();
    renderDev();
  },
  reload() { save(); location.reload(); },
  updatelater() { const el = document.getElementById('updatebar'); if (el) el.remove(); },
  musictoggle() { SFX.toggleMusic(); renderTop(); },
  mute() { SFX.toggle(); paintSpeed(); renderTop(); SFX.ui('click'); },
  speed(v) { if (fight) { fight.speed = +v; paintSpeed(); } },
  order(v) { if (fight && !fight.finished && giveOrder(fight.B, v)) paintOrders(); },
  abpick(v) { if (fight && !fight.finished && pickAbility(fight.B, v)) paintOrders(); },
  abauto() { ui.autoCast = !ui.autoCast; try { localStorage.setItem('ludus-magnus-autocast', ui.autoCast ? '1' : '0'); } catch (e) { /* storage unavailable */ } if (fight) { fight.B.ask = !ui.autoCast; fight.ordState = ''; paintOrders(); } },
  abil(v, w) { const g = byId(v); if (g && toggleAbility(g, w)) { save(); render(); } },
  skip() { finishFight(); },
  leavearena() { SFX.stop(); SFX.music(G.field ? 'wild' : 'ludus'); $('#arena').hidden = true; fight = null; closeModal(); nextEvent(); render(); showReports(); if (G.pendingEvent) showEvent(); checkEnd(); },
  wildclick(v, w, el, e) { provClick(el, e); },
  makecamp() { if (!G.field) return; fieldDay('camp'); SFX.ui('day'); render(); showReports(); if (G.pendingEvent) showEvent(); checkEnd(); },
  campsel(v) { ui.campSel = +v; ui.dtab = 'gear'; render(); },
  campback() { ui.campSel = null; render(); },
  askreset() {
    showModal(`<h2>Abandon the ludus?</h2><p>Your current game will be lost.</p>
      <div class="row"><button data-act="close">Keep playing</button><button class="primary" data-act="reset">Start anew</button></div>`);
  },
  reset() {
    modalQueue.length = 0; paintModal();
    ui.sel = null; ui.picks = {}; ui.wagers = {}; ui.overShown = false; ui.ruinShown = false; ui.tab = 'ludus';
    newGame(); render(); intro();
  },
};

const CHANGES = {
  tactic(v, val) { const g = byId(v); if (g) { g.tactic = val; save(); render(); } },
  wager(v, val) { ui.wagers[v] = +val; },
  autorest(v, val, el) { G.autoRest = el.checked; save(); },
};

// What each kind of click sounds like. Anything not named here makes the plain click; '' is silent
// (it makes its own sound, or the thing it starts does).
const CLICK_SOUND = {
  tab: 'tick', village: '', sel: 'tick', rowsel: 'tick', dtab: 'tick', dossier: 'tick', pick: 'tick', cpick: 'tick', tpick: 'tick', activity: 'tick', yard: 'tick', speed: 'tick',
  buy: 'coin', smithbuy: 'coin', smithsell: 'coin', smithup: 'coin', hire: 'coin', build: 'coin', gift: 'coin', sell: 'coin', tenter: 'coin',
  equip: 'gear', unequip: 'gear', pickperk: 'chime', free: 'chime', csend: 'gate',
  endday: '', forceend: '', makecamp: '', wildclick: '', campsel: 'tick', campback: 'tick', skipdays: '', fight: '', tfight: '', order: '', abpick: '', abauto: 'click', abil: 'tick', mute: '', musictoggle: 'click', fightgo: '', tutnext: 'tick', tutback: 'tick', hintok: 'tick', evopt: 'scroll', skip: '', leavearena: 'tick',
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act, fn = ACTIONS[act];
  SFX.init();                                // sound may only begin from a click, so the first one wakes it
  if (!ui.musicBegun) { ui.musicBegun = true; if (!fight) SFX.music(G && G.field ? 'wild' : 'ludus'); }
  if (fn && !el.classList.contains('off')) { const s = act in CLICK_SOUND ? CLICK_SOUND[act] : 'click'; if (s) SFX.ui(s); }
  if (fn) fn(el.dataset.v, el.dataset.w, el, e);
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-chg]');
  if (el && CHANGES[el.dataset.chg]) { CHANGES[el.dataset.chg](el.dataset.v, el.value, el); renderTutor(); }
});

function intro() {
  showModal(`<h2>Ludus Magnus</h2>
    <p>Your uncle is dead and his gladiator school is yours: two fighters, a leaking roof, and 250 denarii.</p>
    <ul>
      <li>Set each fighter to <b>train</b> or <b>rest</b>, then end the day.</li>
      <li>Every fifth day there are <b>games</b>. Win bouts for purses and fame.</li>
      <li>Fame opens greater arenas. At ${FINAL_FAME} fame, the Emperor sends for you.</li>
      <li>Between games, hire men out on <b>contracts</b>, arm them at the <b>Blacksmith</b>, hire staff under <b>Household</b> and court the powerful under <b>Patrons</b>.</li>
      <li>Tired or wounded men lose. Dead men stay dead.</li>
      <li>Stay in debt for ${graceDays()} days and the creditors take the ludus. That is not the end: your heir begins again, with whatever the family managed to keep.</li>
    </ul>
    <p class="dim" style="font-size:13px">Your steward can walk you through the first week (about five minutes), and afterwards speak up only when something new happens. You can dismiss him at any time, and call him back from the Chronicle.</p>
    <div class="row"><button class="primary" data-act="tutstart">Show me the ropes</button><button data-act="close">I know the trade</button></div>`);
}

// ---------- dev tools (Shift+Y) ----------
// A drawer of shortcuts for testing: jump to any state of the game without playing to it.

function devEl() {
  let el = document.getElementById('dev');
  if (!el) { el = document.createElement('div'); el.id = 'dev'; el.hidden = true; document.body.appendChild(el); }
  return el;
}
const devSel = () => byId(ui.sel) || G.roster[0] || null;

const DEV = {
  money: v => { G.denarii += +v; return `Denarii ${+v >= 0 ? '+' : ''}${v}.`; },
  fame: v => {
    if (v === 'tier') { const n = TIERS[tier() + 1]; G.fame = n ? n.fame : FINAL_FAME; }
    else if (v === 'final') G.fame = FINAL_FAME;
    else G.fame = Math.max(0, G.fame + +v);
    return `Fame is now ${G.fame} (${TIERS[tier()].name}).`;
  },
  days: v => {
    let n = 0;
    const stop = () => v === 'games' ? isGamesDay() : v === 'festival' ? G.festival.day === G.day : n >= +v;
    do { if (G.denarii < 0) G.denarii = 0; endDay(); G.pendingEvent = null; n++; } while (!stop() && !G.over && !G.ruin && n < 40);
    return `Advanced ${n} day${n === 1 ? '' : 's'} to day ${G.day}. Events on the way were skipped.`;
  },
  heal: () => { G.roster.forEach(g => { g.hp = maxHp(g); g.fatigue = 0; g.injury = 0; g.morale = 85; g.foughtDay = -1; }); return 'Everyone is healed, rested, cheerful and free to fight today.'; },
  stats: v => { const g = devSel(); if (!g) return 'No fighter.'; STATS.forEach(k => { g.stats[k] = clamp(g.stats[k] + +v, 2, 20); }); g.hp = maxHp(g); return `${g.name}: every stat ${+v >= 0 ? '+' : ''}${v}.`; },
  rank: () => { const g = devSel(); if (!g) return 'No fighter.'; if (g.rank >= RANKS.length - 1) return `${g.name} is already a Champion.`; g.xp = RANKS[g.rank + 1].xp; checkRank(g); return `${g.name} is now a ${RANKS[g.rank].name} with a perk to choose.`; },
  wins: () => { const g = devSel(); if (!g) return 'No fighter.'; g.wins += 3; G.tally.wins += 3; return `${g.name} has ${g.wins} victories.`; },
  recruit: v => {
    const g = welcome(makeGladiator(v === 'champion' ? 62 : ENEMY_BUDGET[tier()] + 2));
    if (v === 'champion') { g.rank = 3; g.xp = RANKS[3].xp; g.wins = 12; SLOTS.forEach(sl => { g.gear[sl] = makeItem(sl, 5, g.cls); }); g.hp = maxHp(g); }
    addStory(g, 'Appeared out of nowhere.'); G.roster.push(g); ui.sel = g.id;
    return `${g.name} the ${CLASSES[g.cls].name} joins${G.roster.length > capacity() ? ' (over the barracks limit)' : ''}.`;
  },
  remove: () => { const g = devSel(); if (!g) return 'No fighter.'; G.roster = G.roster.filter(x => x !== g); departed(g, 'sold'); return `${g.name} is gone; his gear is in the armoury.`; },
  hurt: () => { const g = devSel(); if (!g) return 'No fighter.'; g.injury = 4; g.hp = Math.round(maxHp(g) * 0.2); g.fatigue = 90; return `${g.name} is injured for 4 days and exhausted.`; },
  bond: v => { const a = G.roster[0], b = G.roster[1]; if (!a || !b) return 'Needs two fighters.'; return makeBond(a, b, v) ? `${a.name} and ${b.name}: ${v === 'friend' ? 'sworn friends' : 'bitter rivals'}.` : 'Those two cannot bond (already bonded, or too many bonds).'; },
  kit: v => { const g = devSel(); if (!g) return 'No fighter.'; stripGear(g); SLOTS.forEach(sl => { g.gear[sl] = makeItem(sl, +v, g.cls); }); return `${g.name} wears a full ${RARITY[+v]} set; what he had is in the armoury.`; },
  loot: () => { for (let i = 0; i < 6; i++) { const sl = pick(SLOTS); G.armoury.push(makeItem(sl, rint(0, 6), pick(G.roster.length ? G.roster.map(g => g.cls) : Object.keys(CLASSES)))); } return 'Six random pieces added to the armoury.'; },
  smith: v => { if (v === 'restock') { genSmith(); return 'The blacksmith has new stock.'; } G.smith.level = clamp(G.smith.level + 1, 0, 4); genSmith(); return `Blacksmith is now a ${SMITH_NAMES[G.smith.level].toLowerCase()}, with new stock.`; },
  fac: v => { Object.keys(G.fac).forEach(k => { G.fac[k] = v === 'max' ? 3 : v === 'zero' ? 0 : clamp(G.fac[k] + 1, 0, 3); }); return 'Facilities: ' + Object.entries(G.fac).map(([k, l]) => k + ' ' + l).join(', ') + '.'; },
  staff: v => { if (v === 'none') { G.staff = {}; return 'All staff dismissed.'; } Object.keys(STAFF_ROLES).forEach(r => { G.staff[r] = { name: pick(STAFF_NAMES), skill: 3, wage: 0 }; }); return 'A master of every trade is hired, unpaid.'; },
  ration: v => { G.ration = +v; return `Rations: ${RATIONS[G.ration].name}.`; },
  favour: v => { Object.keys(G.patrons).forEach(k => favor(k, +v)); return 'Patron favour: ' + Object.entries(G.patrons).map(([k, f]) => k + ' ' + f).join(', ') + '.'; },
  feud: () => { const H = pick(G.houses); feud(H, 50); return `Feud with ${houseDef(H.id).name} is now ${H.grudge}. Their champion calls you out at the next games.`; },
  games: v => {
    if (v) G.festival = { day: G.day, type: v };
    genBouts(); ui.tab = 'arena';
    return v ? `Held today: ${FESTIVALS[G.festival.shown || v].name}.` : 'Ordinary games are held today.';
  },
  event: v => {
    const E = EVENTS[v];
    if (!E.can()) return `"${E.title}" is not possible right now (its conditions are not met).`;
    if (modalQueue.length) return 'Close the open dialog first.';
    G.pendingEvent = { id: v, c: E.make() };
    return `Event: ${E.title}.`;
  },
  legacy: v => { G.dynasty.points += +v; return `The house holds ${G.dynasty.points} legacy.`; },
  boon: () => { const left = Object.keys(BOONS).filter(b => !G.dynasty.boons.includes(b)); if (!left.length) return 'The house already holds every boon.'; const b = pick(left); G.dynasty.boons.push(b); return `Boon gained: ${BOONS[b].name}. It applies from the next heir's ludus.`; },
  ruin: () => { if (G.ruin) return 'The succession is already under way.'; if (modalQueue.length) return 'Close the open dialog first.'; G.denarii = Math.min(G.denarii, -1); beginRuin(); return 'The creditors come.'; },
  fight: v => {
    if (!fight || fight.finished) return 'No fight is in progress.';
    fight.B.fighters.filter(f => f.team === (v === 'win' ? 1 : 0) && !f.down && !f.yielded).forEach(f => { f.hp = 1; });
    return v === 'win' ? 'The opposition is on its last legs.' : 'Your side is on its last legs.';
  },
  tutorial: () => { G.tut = { step: 0, on: true, hints: true, seen: {} }; ui.tab = 'ludus'; villagePlace('ludus'); ui.dtab = 'stats'; return 'The steward is back at step one.'; },
};

function devPanel() {
  const b = (label, cmd, arg, title) => `<button data-act="dev" data-v="${cmd}" data-w="${arg === undefined ? '' : arg}"${title ? ` title="${title}"` : ''}>${label}</button>`;
  const g = devSel();
  const sec = (name, html) => `<h4>${name}</h4><div>${html}</div>`;
  return `<div class="row" style="margin-bottom:4px"><b class="gold" style="flex:1;letter-spacing:.1em">DEV TOOLS</b><button data-act="devclose">Close (Shift+Y)</button></div>
    <div class="dim">Day ${G.day} &middot; ${G.denarii} den &middot; ${G.fame} fame &middot; ${TIERS[tier()].name}<br>
      debt day ${G.debtDays} of ${graceDays()} &middot; ${ordinal(G.dynasty.gen)} generation &middot; games ${isGamesDay() ? 'today' : 'in ' + daysToGames()} &middot; ${FESTIVALS[G.festival.type].name.replace('The ', '')} day ${G.festival.day}</div>
    ${ui.devMsg ? `<div class="devmsg">${ui.devMsg}</div>` : ''}
    ${sec('Money', b('+100', 'money', 100) + b('+1,000', 'money', 1000) + b('+10,000', 'money', 10000) + b('-300', 'money', -300))}
    ${sec('Fame', b('+50', 'fame', 50) + b('+250', 'fame', 250) + b('Next arena', 'fame', 'tier') + b('Emperor\'s summons', 'fame', 'final'))}
    ${sec('Time', b('+1 day', 'days', 1) + b('+5 days', 'days', 5) + b('To games', 'days', 'games') + b('To festival', 'days', 'festival'))}
    ${sec('Selected fighter' + (g ? ': ' + g.name : ''), b('Stats +3', 'stats', 3) + b('Stats -3', 'stats', -3) + b('Rank up', 'rank') + b('+3 wins', 'wins') + b('Injure', 'hurt') + b('Remove', 'remove')
      + '<br>' + [0, 2, 4, 6].map(r => b(RARITY[r] + ' kit', 'kit', r)).join(''))}
    ${sec('Roster', b('Heal all', 'heal') + b('Add recruit', 'recruit') + b('Add champion', 'recruit', 'champion') + b('Befriend first two', 'bond', 'friend') + b('Rival first two', 'bond', 'rival'))}
    ${sec('Ludus', b('Facilities +1', 'fac', 'up') + b('Max', 'fac', 'max') + b('Reset', 'fac', 'zero') + b('Hire all staff', 'staff', 'all') + b('Dismiss staff', 'staff', 'none')
      + '<br>' + RATIONS.map((r, i) => b(r.name, 'ration', i)).join(''))}
    ${sec('Blacksmith', b('Level +1', 'smith', 'up') + b('Restock', 'smith', 'restock') + b('6 random pieces', 'loot'))}
    ${sec('Patrons and rivals', b('Favour +30', 'favour', 30) + b('Favour -30', 'favour', -30) + b('Start a feud', 'feud'))}
    ${sec('Games today', b('Ordinary', 'games', '') + Object.keys(FESTIVALS).map(k => b(FESTIVALS[k].name.replace('The ', ''), 'games', k)).join(''))}
    ${sec('Fight in progress', b('Win it', 'fight', 'win') + b('Lose it', 'fight', 'lose'))}
    ${sec('Events', Object.keys(EVENTS).map(id => `<button class="${EVENTS[id].can() ? '' : 'off'}" data-act="dev" data-v="event" data-w="${id}" title="${esc(EVENTS[id].title)}">${id}</button>`).join(''))}
    ${sec('Dynasty', b('+50 legacy', 'legacy', 50) + b('Random boon', 'boon') + b('Send the creditors', 'ruin'))}
    ${sec('Other', b('Restart tutorial', 'tutorial'))}`;
}
function renderDev() {
  const el = devEl();
  if (!ui.dev) { el.hidden = true; return; }
  el.innerHTML = devPanel(); el.hidden = false;
}
// 1, 2 and 3 shout the orders while a fight is on
document.addEventListener('keydown', e => {
  if (!fight || fight.finished || e.ctrlKey || e.altKey || e.metaKey || $('#arena').hidden) return;
  const B = fight.B;
  if (B.pick && /^[1-4]$/.test(e.key)) { const a = B.pick.abl[+e.key - 1]; if (a) { e.preventDefault(); ACTIONS.abpick(a.id); } }
  else if (e.key === 'c' || e.key === 'C') { e.preventDefault(); ACTIONS.order('yield'); }
});
// Keys for everything done often, so the hand can stay off the mouse:
//   W A S D walk the lanista about the village, E end the day, G to the games, up and down through the list on screen,
//   left and right through a fighter's dossier pages, Enter to dismiss a notice, 1-4 to answer an event.
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || !G || !$('#arena').hidden) return;       // a fight has its own keys
  const at = document.activeElement || document.body;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName) && at.type !== 'checkbox') return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const press = el => { if (el && !el.disabled) { e.preventDefault(); el.click(); } };
  if (!$('#modal').hidden) {
    const btns = [...document.querySelectorAll('#modalBox button:not(:disabled)')], opts = [...document.querySelectorAll('#modalBox [data-act=evopt]')];
    if ((k === 'Enter' || k === ' ' || k === 'Escape') && btns.length === 1 && at.tagName !== 'BUTTON') press(btns[0]);
    else if (/^[1-9]$/.test(k) && opts[+k - 1]) press(opts[+k - 1]);
    return;
  }
  if (villageKey(e, true)) { e.preventDefault(); return; }
  if (G.field) { if (k === 'e') press($('#camp [data-act=makecamp]')); return; }           // out in the country, E makes camp
  if (k === 'e') return press($('[data-act=endday]'));
  if (k === 'g') return press($('[data-act=skipdays]'));
  if (k === 'ArrowUp' || k === 'ArrowDown') {
    const cur = $('#view .lrow.sel[data-act]');
    if (!cur) return;
    const rows = [...cur.parentElement.querySelectorAll('.lrow[data-act=sel], .lrow[data-act=rowsel]')];
    const to = rows[rows.indexOf(cur) + (k === 'ArrowDown' ? 1 : -1)];
    if (to) { press(to); const now = $('#view .lrow.sel[data-act]'); if (now) now.scrollIntoView({ block: 'nearest' }); } else e.preventDefault();
    return;
  }
  if ((k === 'ArrowLeft' || k === 'ArrowRight') && ui.tab === 'ludus') {
    const i = DTABS.findIndex(t => t[0] === ui.dtab) + (k === 'ArrowRight' ? 1 : -1);
    if (DTABS[i]) { e.preventDefault(); SFX.ui('tick'); ACTIONS.dtab(DTABS[i][0]); }
  }
});
document.addEventListener('keyup', e => { villageKey(e, false); });
addEventListener('blur', () => villageStill());             // a key let go while the window was elsewhere would leave him walking
document.addEventListener('keydown', e => {
  if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || (e.key !== 'Y' && e.key !== 'y')) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || document.body).tagName) && document.activeElement.type !== 'checkbox') return;
  e.preventDefault();
  ui.dev = !ui.dev; ui.devMsg = '';
  renderDev();
});

// ---------- noticing a newer published version ----------
// The page carries a build mark (see tools/stamp.js). Every so often the game fetches the page
// afresh and, if the published mark differs from its own, offers a reload.

const buildOf = html => { const m = /<meta name="build" content="([0-9a-f]+)"/.exec(html); return m ? m[1] : ''; };
let updateChecked = 0;
function checkForUpdate() {
  const mine = (document.querySelector('meta[name="build"]') || {}).content;
  if (!mine || !/^https?:$/.test(location.protocol) || Date.now() - updateChecked < 5 * 60 * 1000) return;
  updateChecked = Date.now();
  fetch('index.html?check=' + updateChecked, { cache: 'no-store' }).then(r => (r.ok ? r.text() : '')).then(html => {
    const theirs = buildOf(html);
    if (theirs && theirs !== mine) showUpdateBar();
  }).catch(() => { /* offline, or served from inside the exe: nothing to do */ });
}
function showUpdateBar() {
  if (document.getElementById('updatebar')) return;
  const el = document.createElement('div');
  el.id = 'updatebar';
  el.innerHTML = 'A newer version of Ludus Magnus has been published. Your campaign is saved. <button class="primary" data-act="reload">Reload now</button> <button data-act="updatelater">Later</button>';
  document.body.appendChild(el);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
setInterval(checkForUpdate, 10 * 60 * 1000);

// ---------- boot ----------

if (load()) {
  render();
  showReports();
  if (G.pendingEvent) showEvent();
  checkEnd();
} else {
  newGame(); render(); intro();
}
checkForUpdate();
