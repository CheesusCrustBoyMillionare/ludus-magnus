'use strict';
// Interface: screens, modals, and the arena overlay.

const ui = { tab: 'ludus', sel: null, picks: {}, wagers: {}, cpicks: {}, cterms: {}, qwith: {}, dtab: 'stats', noyard: false };
try { ui.noyard = localStorage.getItem('ludus-magnus-yard') === 'off'; ui.autoCast = localStorage.getItem('ludus-magnus-autocast') === '1'; ui.fspeed = +localStorage.getItem('ludus-magnus-fspeed') || 1; ui.fixedCam = localStorage.getItem('ludus-magnus-fixedcam') === '1'; ui.noCut = localStorage.getItem('ludus-magnus-cutins') === '0'; } catch (e) { /* storage unavailable */ }
// Three settings for those who play without a mouse, or cannot have things moving: single keys off (so that a slip of the hand,
// or speech typed for another program, does nothing), the pictures held still, and a stop for Tab at every explanation.
// Still pictures follow the system's own wish for less motion until the player says otherwise.
try { ui.noKeys = localStorage.getItem('ludus-magnus-keys') === '0'; ui.tipStops = localStorage.getItem('ludus-magnus-tipstops') === '1'; ui.sayBlows = localStorage.getItem('ludus-magnus-sayblows') === '1'; const st = localStorage.getItem('ludus-magnus-still'); ui.still = st === null ? !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) : st === '1'; } catch (e) { /* storage unavailable */ }
document.documentElement.classList.toggle('still', !!ui.still);
const $ = s => document.querySelector(s);
const pct = (v, m) => Math.round(clamp(v / m, 0, 1) * 100);
const BAR_NAMES = { hp: 'Health', fat: 'Fatigue', mor: 'Morale', prog: 'Progress' };
const bar = (cls, v, m) => `<div class="bar ${cls}" role="img" aria-label="${BAR_NAMES[cls] || 'Gauge'} ${pct(v, m)}%"><i style="width:${pct(v, m)}%"></i></div>`;

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
  smithlevel: 'A better smith offers more pieces each games day, and rarer ones. From a journeyman up he does fittings; a master armourer reforges two pieces between games instead of one; and the better the forge, the oftener a commission or a reforging comes out master-wrought.',
  orders: 'Standing orders he follows in every bout.',
  sell: 'Sells him to the dealer for half his market value, or six parts in ten once the dealer counts you an old friend. Proven fighters are worth far more than raw recruits.',
  free: 'A veteran given his freedom leaves for good. The city talks of it, and every man in the yard trains harder for it.',
  injured: 'He can neither train nor fight until healed. A medicus and a better infirmary shorten it.',
  exhausted: 'Fatigue above three quarters. Rest him.',
  perk: 'He has earned a new rank. Open his dossier to choose a perk.',
  veteran: 'Eight victories or more. You may grant him the wooden sword.',
  bout: 'Favoured, even and underdog describe the opposition the arena has matched to this tier; the might numbers tell you how it compares with your own fighters.',
  power: 'Might: how dangerous he is right now: skills, gear, traits, spirits and current health. The bookmakers use the same number, and they also know which style beats which.',
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
  bigmap: 'Lays the whole province out at once: everything you have walked and everything marked. Click anywhere on it to set out for that spot. Key: M',
  minimap: 'Click for the whole map. The whole province. Coloured where you have walked, parchment where you have not. White is the town, purple is you, gold is a place a clue has marked, red is a place you have seen and not dealt with.',
  makecamp: 'Ends the day where you stand. The men rest: fatigue falls and wounds mend, though slower than at home. Scout spends the day the same way, for a wider map, with less rest. Key: E',
  fieldrules: 'Marching takes time: a day passes for each day\'s march, further by road and less through forest, hill and marsh. Going into a place takes a day, and so does making camp. Nobody trains out here: marching tires the men and camp rests them. Every fit man fights when it comes to it. Walk back into the town to go home.',
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
  ['spar', 'All (spar)', 'Spar: raises all three skills a little at once, and tires him less than drilling one. Worth 15% more with a stronger man sparring too, and 15% less alone.'],
  ['teach', 'Teach', 'T for Teach: he drills nothing himself and barely tires. Every man training a skill at which he is clearly the better (2 points or more) learns it faster: 30% for a Veteranus, 35% for a Primus Palus, 40% for a Champion. Only the best teacher counts.'],
];
// What the small button says for each assignment.
const actLabel = k => STAT_NAMES[k] ? ic(k) : k === 'rest' ? 'Rest' : k === 'teach' ? 'T' : 'All';
const actBlock = (g, k) => g.injury > 0 ? 'He is injured and can only rest until he heals.' : k === 'spar' && !staffLvl('doctore') ? 'Sparring needs a doctore. Hire one under Household.'
  : k === 'teach' && !canTeach(g) ? `Only a ${RANKS[TEACH_RANK].name} or better has anything to teach.` : '';
const esc = t => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const tip = k => ` data-tip="${esc(TIPS[k] || k)}"`;

let tipTarget = null;
// Most tooltips are a line or two of words. A thing marked data-cmp="item" or "item:fighter" gets a card instead:
// the piece's picture and what it does, and beside it what that man wears in the slot now (see cmpCard).
function fillTip(box, el) {
  const card = el.dataset.cmp ? cmpCard(...el.dataset.cmp.split(':')) : '';
  box.classList.toggle('rich', !!card);
  if (card) { box.innerHTML = card; box.querySelectorAll('[data-item]').forEach(paintItem); }
  else box.textContent = el.dataset.tip || '';
  box.hidden = !card && !el.dataset.tip;
}
// An explanation is set down once, beside where the mouse came onto the thing it explains, and stays there: so the
// mouse can be moved onto it, to read it under a magnifier or to keep it up. Over something big (the picture of the
// yard) it is set under the thing, not in the middle of it.
function placeTip(e, of) {
  // the tooltip is scaled with the rest of the interface, so its position is set in scaled units
  const el = $('#tip'), pad = 14, r = el.getBoundingClientRect(), z = ui.z || 1;
  let x = e.clientX + pad, y = e.clientY + pad;
  const big = of && of.getBoundingClientRect ? of.getBoundingClientRect() : null;
  if (big && big.width > 260 && big.height > 110) { y = big.bottom + 4; if (y + r.height > innerHeight - 6) y = big.top - r.height - 4; x = e.clientX - r.width / 2; if (x + r.width > innerWidth - 6) x = innerWidth - 6 - r.width; }
  else {
  if (x + r.width > innerWidth - 6) x = e.clientX - r.width - pad;
  if (y + r.height > innerHeight - 6) y = e.clientY - r.height - pad;
  }
  el.style.left = Math.max(6, x) / z + 'px'; el.style.top = Math.max(6, y) / z + 'px';
}

// The interface is drawn for a window of about 1366 by 768 and enlarged as a whole to fill anything bigger,
// so a 1440p or 4K screen shows the same layout at a readable size, not a small one in a sea of empty space.
function fitScreen() {
  const z = Math.round(Math.max(1, Math.min(innerWidth / 1366, innerHeight / 768)) * 100) / 100, st = document.documentElement.style;
  ui.z = z;
  st.setProperty('--z', z); st.setProperty('--vw', innerWidth / z + 'px'); st.setProperty('--vh', innerHeight / z + 'px');
}
// The picture of a fight takes what height its heading and its controls leave. Those are measured, not assumed: the
// controls run to two or three rows depending on the window, and a picture sized for one row pushed the heading off
// the top of the screen and the last row of buttons off the bottom. Everything is measured the same way and only
// the proportion used, so it does not matter how the browser counts a zoomed box.
function fitArena() {
  const a = document.getElementById('arena'), head = document.getElementById('arenaHead'), bar = document.getElementById('arenaBar');
  if (!a || a.hidden || !head || !bar) return;
  const ah = a.getBoundingClientRect().height;
  if (!ah) return;
  const k = (innerHeight / (ui.z || 1)) / ah, barH = bar.getBoundingClientRect().height * k, st = document.documentElement.style;
  st.setProperty('--arena-chrome', Math.ceil(head.getBoundingClientRect().height * k + barH + 46) + 'px');      // and the gaps and padding round them
  // What lies over the picture is placed by the same measure: the choice of abilities sits on top of the controls and
  // not across them, and the log of the fight stops short of the choice while there is one to make.
  const pick = document.getElementById('arenaPick'), ph = pick && !pick.hidden ? pick.getBoundingClientRect().height * k : 0;
  st.setProperty('--arena-bar', Math.ceil(barH) + 'px');
  st.setProperty('--arena-pick', ph ? Math.ceil(ph + 8) + 'px' : '0px');
}
addEventListener('resize', () => { fitScreen(); fitArena(); });
fitScreen();
if (typeof ResizeObserver !== 'undefined') {
  const watch = new ResizeObserver(fitArena);
  for (const id of ['arenaHead', 'arenaBar', 'arenaPick']) { const el = document.getElementById(id); if (el) watch.observe(el); }
}

// Each scene is drawn at a whole number of canvas pixels to one of its own units: the smallest whole number that is
// at least what the screen really shows, and never fewer than `min`. The browser then only ever shrinks the picture
// a little, smoothly, so every pixel of the art comes out the same size on any screen, and big screens get more of them.
// (Before, the canvases had one fixed size and were stretched by an uneven amount: pixels of two sizes at 1440p and 4K.)
const SCENES = { yard: [590, 190, 2], village: [590, 190, 2], wildCanvas: [480, 360, 2], arenaCanvas: [1280, 720, 1] };
function fitScene(cv, devW) {
  const spec = SCENES[cv.id];
  if (!spec || !(devW > 8)) return;                        // hidden: leave it as it is
  const k = Math.max(spec[2], Math.min(6, Math.ceil(devW / spec[0] - 0.04)));
  if (cv.width === spec[0] * k) return;
  cv.width = spec[0] * k; cv.height = spec[1] * k;         // this clears it; the scene redraws on its next frame
  if (cv.id === 'arenaCanvas' && typeof fight !== 'undefined' && fight && fight.B) drawBattle(cv.getContext('2d'), fight.B);
}
function fitScenes() {
  if (typeof ResizeObserver !== 'function') return;
  const ro = new ResizeObserver(list => {
    for (const e of list) {
      const box = e.devicePixelContentBoxSize && e.devicePixelContentBoxSize[0];
      fitScene(e.target, box ? box.inlineSize : e.target.getBoundingClientRect().width * (devicePixelRatio || 1));
    }
  });
  for (const id in SCENES) {
    const cv = document.getElementById(id);
    if (!cv) continue;
    try { ro.observe(cv, { box: 'device-pixel-content-box' }); } catch (err) { ro.observe(cv); }
  }
}
fitScenes();
let tipGo = 0;                    // the moment's grace between leaving a thing and its explanation going: time to reach the explanation
function hideTip() { clearTimeout(tipGo); tipGo = 0; tipTarget = null; clsTip = null; const el = $('#tip'); if (el) { el.hidden = true; delete el.dataset.by; } }
const tipSoon = () => { clearTimeout(tipGo); tipGo = setTimeout(hideTip, 220); };
const onTip = t => !!(t && t.closest && t.closest('#tip'));
document.addEventListener('mouseover', e => {
  if (onTip(e.target)) { clearTimeout(tipGo); tipGo = 0; return; }      // the mouse is on the explanation itself: it stays
  const el = e.target.closest ? e.target.closest('[data-tip], [data-cmp]') : null;
  const box = $('#tip');
  if (el === tipTarget) { if (el) { clearTimeout(tipGo); tipGo = 0; } else if (!tipGo && !clsTip && !box.hidden && box.dataset.by !== 'key') tipSoon(); return; }      // come off the explanation onto nothing: it goes
  if (!el) { tipTarget = null; if (!clsTip && !box.hidden && box.dataset.by !== 'key') tipSoon(); return; }
  clearTimeout(tipGo); tipGo = 0;
  tipTarget = el;
  if (clsTip) return;                                     // a type's name is under the mouse: that is being explained
  delete box.dataset.by;
  fillTip(box, el); placeTip(e, el);
});
// A click on an explanation puts it away and goes through to whatever is under it, so that an explanation which has
// stayed where it was put is never in the way of the next thing to be pressed.
document.addEventListener('click', e => {
  if (!onTip(e.target)) return;
  e.stopPropagation(); hideTip();
  const under = document.elementFromPoint(e.clientX, e.clientY);
  if (under && !onTip(under)) under.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: e.clientX, clientY: e.clientY }));
}, true);
// The name of a gladiator's type explains itself wherever it is written: in a list, on a card, in the middle of a sentence.
// The word under the mouse is read from the page, so nothing that prints a type's name has to say so.
const CLASS_WORDS = (() => { const o = {}; for (const k in CLASSES) { const n = CLASSES[k].name.toLowerCase(); o[n] = k; o[n + 's'] = k; } return Object.assign(o, { murmillones: 'murmillo', thraeces: 'thraex', retiarii: 'retiarius', hoplomachi: 'hoplomachus', dimachaeri: 'dimachaerus' }); })();
function classTip(k) {
  const c = CLASSES[k], pc = v => Math.round(v * 100) + '%', lean = Object.keys(c.bias).sort((a, b) => c.bias[b] - c.bias[a])[0];
  return `${c.name}\n${c.desc}\n${c.shield ? 'Blocks ' + pc(c.block) : 'No shield'}, dodges ${pc(c.dodge)}, armour ${c.armor}, reach ${c.reach}. Leans to ${STAT_NAMES[lean].toLowerCase()}.`;
}
function classAt(e) {
  const t = e.target;
  if (!t || !t.closest || t.tagName === 'CANVAS' || t.closest('input, textarea, #tip')) return null;
  let node = null, off = 0;
  if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(e.clientX, e.clientY); if (r) { node = r.startContainer; off = r.startOffset; } }
  else if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(e.clientX, e.clientY); if (p) { node = p.offsetNode; off = p.offset; } }
  if (!node || node.nodeType !== 3) return null;
  const s = node.data, letter = ch => /[A-Za-z]/.test(ch || '');
  let a = Math.min(off, s.length), b = a;
  while (a > 0 && letter(s[a - 1])) a--;
  while (b < s.length && letter(s[b])) b++;
  const k = CLASS_WORDS[s.slice(a, b).toLowerCase()];
  if (!k) return null;
  // the caret snaps to the nearest letter even from the empty end of a line: the mouse must really be on the word
  const rg = document.createRange(); rg.setStart(node, a); rg.setEnd(node, b);
  const z = ui.z || 1, on = (r, m) => e.clientX >= r.left * m - 1 && e.clientX <= r.right * m + 1 && e.clientY >= r.top * m - 1 && e.clientY <= r.bottom * m + 1;
  return [...rg.getClientRects()].some(r => on(r, 1) || on(r, z)) ? { k, el: node.parentElement } : null;
}
let clsTip = null, tipMove = null;
document.addEventListener('mousemove', e => {
  const waiting = !!tipMove;                 // looked at once a frame, however fast the mouse is moving
  tipMove = e;
  if (waiting) return;
  requestAnimationFrame(() => {
    const ev = tipMove, box = $('#tip'), hit = classAt(ev);
    tipMove = null;
    if (onTip(ev.target)) return;                         // reading the explanation: nothing changes
    if (hit && hit.el !== tipTarget) {                    // unless the word is itself a thing with a tooltip of its own
      if (clsTip !== hit.k) { clsTip = hit.k; clearTimeout(tipGo); tipGo = 0; delete box.dataset.by; box.classList.remove('rich'); box.textContent = classTip(hit.k); box.hidden = false; placeTip(ev); }
    } else if (clsTip) {
      clsTip = null;
      if (tipTarget && tipTarget.isConnected) { fillTip(box, tipTarget); placeTip(ev, tipTarget); } else tipSoon();
    }
  });
});

// ---------- the steward: a first-week tutorial ----------
// A step with "until" completes itself when the player does the thing; the others wait for Next.

const TAB_NAMES = { ludus: 'Ludus', arena: 'Arena', contracts: 'Contracts', market: 'Market', facilities: 'Household', smith: 'Blacksmith', patrons: 'Patrons', rivals: 'Rivals', chronicle: 'Chronicle' };

// ---------- the steward ----------
// He teaches in two ways. First a short walk through the first week, mostly by having you do each thing once
// (a step with `until` moves on by itself when you have done it). After that he keeps quiet until something
// happens for the first time, and then says what it means, once.

const TUTORIAL = [
  { ch: 'Welcome', target: '#side',
    text: 'Welcome, dominus. This bar holds the day\'s figures and <b>End day</b>. The picture on the left is your school; the one on the right is the town, and you will do your business in it on foot. Hover over anything, anywhere, and I will explain it.' },
  { ch: 'The school', tab: 'ludus', target: '.lrow .acts', until: () => G.roster.some(g => g.activity !== 'rest'),
    text: 'These are your fighters. Each drills one skill a day, or rests. <b>Set one of them to train</b> with the small buttons on his line: strength, agility or skill. Keys <b>1 to 5</b> do the same for whoever is chosen, and <b>Everyone</b>, above the list, gives one order to the whole school.' },
  { tab: 'ludus', target: '.schoolbar',
    text: 'This strip is the school at a glance: who is fit to fight, who is hurt, exhausted, away or idle, and what a day costs you. The button beside it puts the list in another order.' },
  { ch: 'A fighter', tab: 'ludus', target: '.statrow',
    text: 'Click a fighter and his dossier opens here. Three skills decide how he fights, and each beats one of the others: <b>Strength beats Agility, Agility beats Skill, Skill beats Strength</b>. His highest is his style. The stars are his talent for each: more stars, faster gains. The <b>Today</b> line above says what his work will do, and when it will pay.' },
  { tab: 'ludus', target: '[data-act=dtab][data-v=abil]', until: () => ui.tab === 'ludus' && ui.dtab === 'abil',
    text: 'A dossier has five pages. <b>Open Abilities</b>, or step through the pages with the left and right arrow keys.' },
  { tab: 'ludus', target: '.abcols',
    text: 'Every kind of fighter learns his own abilities: one when a skill reaches 5, another at 10, a third at 16. He carries four into the arena. In a fight his gold bar fills as he gives and takes blows, and when it is full he uses one. You will be asked which.' },
  { tab: 'ludus', target: '[data-act=dtab][data-v=gear]', until: () => ui.tab === 'ludus' && ui.dtab === 'gear',
    text: 'Now <b>open Gear</b>.' },
  { tab: 'ludus', target: '.gearlist',
    text: 'What he wears, slot by slot. Yours fight with practice weapons and bare skin for now; the <b>Blacksmith</b> sells better, graded F to S, and will fit a piece straight onto a man. Spare pieces wait on your racks: each slot here offers the best of them, <b>+ more</b> shows the rest, and <b>Wear the best</b> puts on every gain at once. <b>Story</b> holds his friends, grudges and history, and <b>Orders</b> how he fights and what he would fetch if sold.' },
  { ch: 'The day', target: '[data-act=endday]', until: () => G.day >= 2,
    text: 'Nothing happens until the day ends. Press <b>End day</b>, or the E key.' },
  { tab: 'ludus', target: '.lrow .gauges',
    text: 'Three gauges on each line: health, fatigue, spirits. Training builds fatigue, and a tired man fights badly and can tear a muscle, so rest him before the games. With the box above the list ticked, the exhausted rest on their own.' },
  { ch: 'The town', target: '#village', go: 'contracts', until: () => ui.tab === 'contracts',
    text: 'There is paid work in town. That is you with the gold mark over your head, at the door of the Ludus. <b>Walk to Contracts</b>: steer with <b>W A S D</b>, or click the building and you will walk there yourself. Step onto its doorstep and it opens.' },
  { tab: 'contracts', target: '#view .panel.list',
    text: 'Patrons hire fighters by the day. The bar on each offer is the best chance your free men could manage; the offer itself says what it pays, what it risks, and <b>Pick the best</b> chooses who should go. But a man sent is <b>gone</b> for those days: no training, and no games if they fall while he is away. With two fighters, I would keep them home this week.' },
  { target: '#village', go: 'market', until: () => ui.tab === 'market',
    text: 'Now walk to the <b>Market</b>.' },
  { tab: 'market', target: '#view .panel.list',
    text: 'Fresh stock every games day. Each man shows his power and three skills, and his card says where he would stand among your own. You cannot see how fast he will learn without a scout. Your barracks hold three for now, and every man eats every day. Buy when you can feed him; the dealer will also buy your men, at half their worth.' },
  { target: '#village', go: 'facilities', until: () => ui.tab === 'facilities',
    text: 'Walk to your own house, <b>Household</b>, at the top left.' },
  { tab: 'facilities', target: '#view .schoolbar',
    text: 'Staff, the house and rations, and each says exactly what it gives. The school\'s own buildings (barracks, training ground, infirmary, baths) are improved at the <b>Ludus</b>, under <b>The school</b>. Everything here costs money, up front or every day: this strip shows what a day costs and how long the purse will last. A doctore lets men spar; an infirmary keeps the fallen alive. Do not spend the purse to nothing: stay in debt too long and the creditors take the house.' },
  { ch: 'The games', target: '[data-act=skipdays]', until: () => isGamesDay(),
    text: 'Games are held every fifth day. <b>To the games</b> (the G key) runs the days until then, stopping if anything needs you. Set your men to train first.' },
  { target: '#village', go: 'arena', until: () => ui.tab === 'arena' || !isGamesDay(),
    text: 'It is a games day: the number by the Arena\'s name is the bouts waiting. Walk to the <b>Arena</b>.' },
  { tab: 'arena', target: '.bout:not(.done)', until: () => !G.bouts || G.bouts.some(b => b.done),
    text: 'Each line on the left is a bout; the one you choose opens here. Compare <b>might</b>, the number by each name that says how dangerous a man is today, and look for the small arrows: <b>&#9650;</b> means your man\'s style beats his opponent\'s, <b>&#9660;</b> the reverse. Start with a bout marked <b>Favoured</b>. Click a fighter\'s name to enter him, or <b>Pick the best</b> (B) and I will choose; the bar shows your chance. Wager only if you trust him. <b>Send a man to the sand</b> (Enter). I will be at your shoulder once it starts.' },
  { ch: 'Afterwards', text: 'A win pays a purse and fame, and fame opens greater arenas. A beaten man may be spared or killed, and wounds keep him out for days. The result shows what the bout paid, how each of your men came out of it, and the whole fight line by line if you want it. Fighters earn rank from their bouts; each new rank lets you choose a perk in his dossier.' },
  { text: 'That is the trade. <b>Patrons</b> reward favour, <b>Rivals</b> shows the other houses and your feuds, and the <b>Chronicle</b> keeps the record. The <b>Blacksmith</b> has his forge by the square. Your campaigns are under <b>Saves</b>, at the foot of the bar. Press <b>H</b> at any time, even in the middle of a fight, for the book of the trade: seven short pages, the keys among them, opened at the one for wherever you are. I will hold my tongue now, and speak up when something new happens.' },
];

// Things he explains the first time they happen. `when` returns whatever the text needs, or nothing.
const HINTS = [
  { id: 'debt', when: () => G.denarii < 0,
    text: () => `We are in debt, dominus. Stay there for ${graceDays()} days running and the creditors take the house. Sell a man, cut the rations, dismiss staff, or win a purse; and morale falls every day we owe.` },
  { id: 'thin', when: () => { const net = stipend() - upkeep(); return net < 0 && G.denarii >= 0 && Math.floor(G.denarii / -net) < daysToGames(); },
    text: () => 'At this rate the purse runs dry before the next games, dominus. <b>Household</b> shows where it goes: cheaper rations or one wage less would see us through, or a contract that pays before then.' },
  { id: 'field1', when: () => G.field,
    text: () => 'This is the province, dominus, and the whole school is with you. <b>W A S D</b> or a click walks the column; the parchment lifts as you go. <b>Marching takes time</b>: the bar at the top left is what is left of today\'s march, and when it is spent night falls and a day passes. Point at anywhere and I will say how many days it is; set out, and the count runs at the foot of the map. Going into a place takes a day, and so does making camp (<b>E</b>). <b>M</b> lays out the whole map, and you go home by walking back in at the gate.' },
  { id: 'field2', when: () => G.field && tutorState().seen.field1 && wildSites().find(st => siteKnown(st) && !siteDone(st)),
    text: st => `Something has come into view: <b>${st.name}</b>. Rest the mouse on a place and it says what it is; the red skulls are how hard it will be. <b>Places known</b>, on the right, walks you to any of them with a click. If it comes to a fight, every man who is fit fights, up to nine.` },
  { id: 'fieldgames', when: () => G.field && daysToGames() <= 1,
    text: () => `The games are ${daysToGames() === 0 ? 'today' : 'tomorrow'}, and they are held without us if we are out here: no purses, and the Magistrate notices. <b>Home</b> is at the foot of the places list.` },
  { id: 'fieldworn', when: () => G.field && G.roster.some(g => !g.away) && fieldParty().length * 2 <= G.roster.filter(g => !g.away).length,
    text: () => 'Half the school or more is in no state to fight. <b>Make camp</b> rests them, though slower than their own beds would; or turn for home before something finds us like this.' },
  { id: 'fieldfar', when: () => G.field && wildTier(G.field.x, G.field.y) >= 3,
    text: () => 'We are a long way from the walls now. The skulls by the name of the country, top left, are how hard it is: what lives out here is stronger than anything near the town, and what it guards is worth more.' },
  { id: 'hurt', when: () => G.roster.find(g => g.injury > 0 && !g.away),
    text: g => `<b>${g.name}</b> is wounded. He can neither train nor fight until he heals; the days left are on his line. A medicus and a better infirmary shorten it.` },
  { id: 'perk', when: () => G.roster.find(g => g.perkPending > 0),
    text: g => `<b>${g.name}</b> has earned a new rank. Open his dossier and press <b>Choose a perk</b>: three are offered, and the choice is for good.` },
  { id: 'spent', when: () => G.roster.find(g => g.fatigue > 75 && g.injury <= 0 && !g.away),
    text: g => `<b>${g.name}</b> is exhausted. His charge fills slowly in a fight, and if he trains like this he may tear a muscle. A day or two of rest mends it${G.autoRest ? '; he will take it himself while the box above the roster is ticked' : ''}.` },
  { id: 'choose', when: () => G.roster.find(g => abilitiesKnown(g).length > 4),
    text: g => `<b>${g.name}</b> now knows more abilities than he can carry. On the <b>Abilities</b> page of his dossier, click one to put it down and another to take it up: four go with him into the arena.` },
  { id: 'idle', when: () => G.day >= 3 && !isGamesDay() && G.roster.find(g => !g.away && g.injury <= 0 && g.activity === 'rest' && g.hp >= maxHp(g) && g.fatigue <= 0),
    text: g => `<b>${g.name}</b> is resting though he is whole and fresh: a day of training lost. Set him to a skill on his line, or with keys 1 to 5.` },
  { id: 'full', when: () => G.roster.length >= capacity() && G.day >= 2,
    text: () => 'Every cell is taken. To buy another man, improve the <b>Barracks</b> at the <b>Ludus</b> (the button <b>The school</b>), or sell one: the dealer at the <b>Market</b> will tell you what he would pay.' },
  { id: 'request', when: () => G.request && !G.request.done && !G.field && (G.request.type === 'tithe' || G.request.day === G.day) && G.request,
    text: r => `${PATRONS[r.patron].name} ask${r.patron === 'guild' ? '' : 's'} something of us, dominus: ${requestText(r)}. Done, it is worth ${r.favor} favour${r.pay ? ` and ${r.pay} denarii` : ''}; left undone, it costs four. It is written up under <b>Patrons</b>, where you may also <b>ask</b> things of them in your turn, once they know us.` },
  { id: 'called', when: () => (G.bouts || []).find(b => b.called && !b.done),
    text: b => `Your challenge to <b>${b.house}</b> is on today's card at the <b>Arena</b>: their champion, for a double purse. You called it, dominus. If no man of ours appears, the town will not let us forget it.` },
  { id: 'grudge', when: () => (G.bouts || []).find(b => b.grudge && !b.done),
    text: b => `<b>${b.house}</b> has called you out: there is a grudge match on today\'s card at the <b>Arena</b>. Answer it, win or lose, and the feud cools. Leave it and the Magistrate and your own men will think less of you.` },
  { id: 'gear', when: () => G.armoury.length > 0,
    text: () => 'There is a spare piece in the armoury. Choose it at the <b>Blacksmith</b> and press <b>Give him</b> beside a man\'s name, or open a fighter\'s dossier and then <b>Gear</b>. A weapon only fits the kind of fighter it was made for.' },
  { id: 'away', when: () => G.jobs.length > 0,
    text: () => 'Men are away from the house. The <b>Contracts</b> screen shows who, and when they are back. Word may come from the road asking what they should do; I will bring it to you.' },
  { id: 'quest', when: () => G.roster.find(g => g.quest && QUESTS[g.quest.id] && !g.away),
    text: g => `You gave <b>${g.name}</b> your word. The place is ${questWhere(g)}, out through the east gate, and it is marked on the map of the province. Take the whole school there; do not leave him waiting for weeks.` },
  { id: 'gate', when: () => gateOpen() && !G.field,
    text: () => 'The <b>east gate</b> will open for you now, at the end of the upper street. Beyond it is the province: lairs, outlaws, old tombs, and stranger things. The whole school marches out together, a day passes for each day\'s march, and each place you go into costs a day. Mind the games: they are held without you if you are away.' },
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

// What he says the first time each thing happens in a fight: shown over the arena, one at a time. `when` says it is the
// moment for it, `gone` that the moment has passed and it should be taken down unanswered (to be said another time).
const FIGHT_HINTS = [
  { id: 'f_card', when: B => B.intro > 0.6 && B.introDur - B.intro > 0.9, gone: B => B.intro <= 0.3,
    text: () => 'The card is the two sides: who they are, their power and their style. Beneath it, how they weigh against each other and whose style has the edge. A click on the sand sends it away.' },
  { id: 'f_hud', when: B => B.intro <= 0 && !B.over && !B.pick && B.time > 1.2, gone: B => B.over || B.time > 16,
    text: () => 'Red is yours, blue is theirs. The corners carry each man\'s health in figures and, in gold, his <b>charge</b>. Rest the mouse on any fighter for all there is to know of him. <b>Space</b> pauses; the bar below has half speed, a step at a time, and the <b>Log</b> of everything that has happened.' },
  { id: 'f_pick', when: B => B.pick && !out(B.pick), gone: B => !B.pick,
    text: B => `<b>${B.pick.g.name}</b> is charged, and the fight has stopped for you. Each card says what the ability does, what speaks for and against it at this moment, and about what it would do to the man in front of him. The one ringed in gold is what I would choose. Press its number, or <b>A</b> to let him decide.` },
  { id: 'f_low', when: B => !B.over && B.intro <= 0 && canOrder(B, 'yield') && B.fighters.some(f => f.team === 0 && !out(f) && f.hp < f.maxHp * 0.3), gone: B => B.over || B.towel,
    text: () => 'One of yours is failing: his line is flashing red. <b>Throw in the cloth</b> (C, twice) makes your worst-hurt man yield at once, and a man who yields is spared far more often than one who is struck down. Once a bout.' },
  { id: 'f_end', when: B => B.over && B.outro > 0.9 && !B.wild && !B.hunt, gone: () => false,
    text: () => 'It is settled. Now the crowd judges each fallen man: watch the stands, and the editor\'s thumb over his box. A good show spares more of them. Then the reckoning comes up, and a click goes on to the result.' },
];
function paintFightTip() {
  const el = $('#arenaTip'); if (!el) return;
  const t = G && tutorState(), B = fight && !fight.finished ? fight.B : null;
  if (!B || !t || (!t.on && !t.hints)) { el.hidden = true; return; }
  let h = FIGHT_HINTS.find(x => x.id === fight.tipId);
  if (h && (t.seen[h.id] || h.gone(B))) { h = null; fight.tipId = null; }
  if (!h) { h = FIGHT_HINTS.find(x => !t.seen[x.id] && x.when(B)) || null; fight.tipId = h ? h.id : null; if (h) SFX.ui('hint'); }
  const sig = h ? h.id : '';
  if (sig === fight.tipSig) return;
  fight.tipSig = sig;
  if (!h) { el.hidden = true; return; }
  el.className = h.id === 'f_pick' ? 'top' : ''; el.hidden = false;
  el.innerHTML = `<div class="who">Your steward</div><p>${h.text(B)}</p><div class="row"><button class="primary" data-act="fhintok" data-v="${h.id}">Understood</button><button data-act="tutoff" style="margin-left:auto">No more advice</button></div>`;
}

// The steward's notes on this save. Older saves have none: they get advice only if they ask for it.
function tutorState() {
  const t = G.tut || (G.tut = { step: 0, on: false });
  if (t.hints === undefined) t.hints = !!t.on;
  if (!t.seen) t.seen = {};
  return t;
}
const stewardSays = (head, text, buttons, done, extra) => `<div class="who">${head}</div>${done === undefined ? '' : `<div class="bar prog"><i style="width:${Math.round(done * 100)}%"></i></div>`}${extra || ''}<p>${text}</p><div class="row">${buttons}</div>`;

function renderTutor() {
  const el = $('#tutor');
  document.querySelectorAll('.tut-glow').forEach(x => x.classList.remove('tut-glow'));
  const t = G && tutorState();
  ui.wayTo = null;
  el.classList.toggle('field', !!(G && G.field));
  if (!t || G.ruin || (!t.on && !t.hints)) { el.hidden = true; return; }
  if (t.on) {
    while (t.step < TUTORIAL.length && TUTORIAL[t.step].until && TUTORIAL[t.step].until()) t.step++;
    if (t.step >= TUTORIAL.length) { t.on = false; save(); }
  }
  if (t.on) {
    const s = TUTORIAL[t.step], away = s.tab && s.tab !== ui.tab, last = t.step === TUTORIAL.length - 1;
    if (ui.stewardSaid !== 'step' + t.step) { if (ui.stewardSaid) SFX.ui('hint'); ui.stewardSaid = 'step' + t.step; }
    el.innerHTML = stewardSays(`Your steward &middot; ${t.step + 1} of ${TUTORIAL.length}`,
      s.text + (away ? `<br><span class="dim">Walk to ${TAB_NAMES[s.tab]}.</span>` : ''),
      `${s.until ? '<span class="dim" style="font-size:12px">Do it, and I will go on.</span>' : `<button class="primary" data-act="tutnext">${last ? 'Thank you' : 'Next'}</button>`}
       ${TUTORIAL.slice(0, t.step).some(x => !x.until) ? '<button data-act="tutback">Back</button>' : ''}
       <button data-act="tutoff" style="margin-left:auto">Dismiss him</button>`, t.step / TUTORIAL.length,
      `<div class="chs"${tip('The parts of the tour. Click one to go straight to it.')}>${TUTORIAL.map((x, i) => x.ch ? `<button class="${TUTORIAL.slice(0, t.step + 1).map(y => y.ch).filter(Boolean).pop() === x.ch ? 'on' : ''}" data-act="tutjump" data-v="${i}">${x.ch}</button>` : '').join('')}</div>`);
    el.hidden = false;
    const target = s.target && !away ? document.querySelector(s.target) : away ? $('#village') : null;
    if (target) target.classList.add('tut-glow');
    // he steps to the other side of the room rather than stand in front of what he is pointing at
    el.classList.remove('aside');
    if (target && target.id !== 'village' && target.id !== 'side') {
      const a = el.getBoundingClientRect(), b = target.getBoundingClientRect();
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) el.classList.add('aside');
    }
    ui.wayTo = s.go || (away ? s.tab : null);                  // an arrow over the door he wants you at
    return;
  }
  for (const h of HINTS) {
    if (t.seen[h.id]) continue;
    const about = h.when();
    if (!about) continue;
    el.classList.remove('aside');
    if (ui.stewardSaid !== 'hint' + h.id) { SFX.ui('hint'); ui.stewardSaid = 'hint' + h.id; }
    el.innerHTML = stewardSays('Your steward', h.text(about), `<button class="primary" data-act="hintok" data-v="${h.id}">Understood</button><button data-act="tutoff" style="margin-left:auto">No more advice</button>`);
    el.hidden = false;
    return;
  }
  el.hidden = true;
}

// A day has passed out in the province: show what it brought.
function fieldDayDone() { render(); showReports(); if (G.pendingEvent) showEvent(); checkEnd(); }

// ---------- help: the keys and the rules of the trade, in one place ----------
// ---- choosing a perk ----
// Which perks sit well with which style of fighting: no more than a word of advice.
const PERK_SUITS = { str: ['brute', 'bloodthirsty', 'lionheart', 'ironhide', 'thickskin', 'killer', 'finisher', 'shieldmate', 'testudo', 'longreach'], agi: ['quick', 'guarded', 'ironlungs', 'tireless', 'showy', 'fleet', 'duelist', 'opener', 'twinfury', 'longnet'], skl: ['keen', 'killer', 'guarded', 'disciplined', 'steady', 'duelist', 'quickstudy', 'undershield', 'ironwill'] };
const PERK_KIND = { brute: 'Attack', quick: 'Attack', keen: 'Attack', bloodthirsty: 'Attack', lionheart: 'Attack', killer: 'Attack', ironhide: 'Defence', guarded: 'Defence', thickskin: 'Defence', steady: 'Spirit', showy: 'The crowd', disciplined: 'Training', tireless: 'Training', ironlungs: 'Abilities',
  duelist: 'Attack', shieldmate: 'Attack', finisher: 'Attack', opener: 'Abilities', quickstudy: 'Abilities', fleet: 'Defence', ironwill: 'Defence', mender: 'Training', teacher: 'Training', darling: 'The crowd',
  testudo: 'His craft', undershield: 'His craft', longnet: 'His craft', longreach: 'His craft', twinfury: 'His craft' };
// What a perk would change for this man, in his own figures: he is weighed as he would walk onto the sand with and without it.
function perkEffect(g, t) {
  const rows = [];
  try {
    // he is weighed as he is, then with the perk put on him for a moment, so that everything else about him is the same
    const a = makeFighter(g, 0, 0, 1), a3 = makeFighter(g, 0, 0, 3), r0 = trainRate(g), t0 = trainTire(g, false), h0 = restGain(g)[0];
    g.traits.push(t);
    let b, b3, r1, t1, h1;
    try { b = makeFighter(g, 0, 0, 1); b3 = makeFighter(g, 0, 0, 3); r1 = trainRate(g); t1 = trainTire(g, false); h1 = restGain(g)[0]; } finally { g.traits.pop(); }
    const add = (lab, x, y, fmt, lowGood) => { if (Math.abs(y - x) > 1e-6) rows.push(`<div><span>${lab}</span><b>${fmt(x)}</b><i>&rarr;</i><b class="${(y > x) !== !!lowGood ? 'good' : 'bad'}">${fmt(y)}</b></div>`); };
    const pc = v => Math.round(v * 100) + '%', f1 = v => v.toFixed(1);
    add('Damage a blow', a.dmg, b.dmg, f1);
    add('Seconds between blows', a.atkTime, b.atkTime, v => v.toFixed(2), true);
    add('Health', a.maxHp, b.maxHp, v => Math.round(v));
    add('Armour', a.armor, b.armor, f1);
    add('Dodge', a.dodge, b.dodge, pc); add('Block', a.block, b.block, pc);
    add('Accuracy', a.acc, b.acc, pc); add('Telling blows', a.crit, b.crit, pc);
    add('A telling blow hits', a.critMult, b.critMult, v => '&times;' + v.toFixed(1));
    add('The crowd\'s liking', a.show, b.show, pc);
    add('Charge fills at', a.chargeRate, b.chargeRate, pc);
    add('Training speed', r0, r1, pc);
    add('Fatigue from a day of drill', t0, t1, f1, true);
    add('Health from a day of rest', h0, h1, v => Math.round(v));
    add('Speed on the sand', a.speed, b.speed, f1); add('Reach', a.reach, b.reach, v => Math.round(v));
    add('Stuns shortened by', a.stunRes, b.stunRes, pc); add('Charge at the start', a.charge, b.charge, v => Math.round(v) + '%');
    if (Math.abs(b.dmg - a.dmg) < 1e-6) add('Damage beside others', a3.dmg, b3.dmg, f1);
    add('Damage taken beside others', 1 - a3.resist, 1 - b3.resist, pc, true);
  } catch (e) { /* the description alone will have to do */ }
  return rows.join('');
}
function perkModal(g) {
  const offer = perkOffer(g), st = styleOf(g), c = CLASSES[g.cls];
  const cards = offer.map((t, i) => {
    const T = TRAITS[t], armed = ui.perkArm === g.id + ':' + t, suits = st && PERK_SUITS[st].includes(t), fx = perkEffect(g, t);
    return `<button class="perkcard ${armed ? 'armed' : ''} ${T.cls ? 'craft' : ''}" data-act="pickperk" data-v="${g.id}" data-w="${t}">
      <span class="k">${i + 1}</span><span class="kind">${PERK_KIND[t] || 'Perk'}</span>
      <b>${T.name}</b>
      <span class="desc">${T.desc}</span>
      ${fx ? `<span class="fx"><em>For ${g.name}</em>${fx}</span>` : '<span class="fx none">Its worth shows only in the moment it is for.</span>'}
      ${suits ? `<span class="suits">${ic(st)} Suits his ${STAT_NAMES[st].toLowerCase()} style</span>` : ''}
      <span class="take">${armed ? 'Sure? It is for good. Press again.' : 'Choose'}</span></button>`;
  }).join('');
  return `<div class="perkbox"><div class="perkhead"><canvas class="portrait" width="192" height="224" data-portrait="${g.id}"></canvas>
      <div><div class="rise">Rises to ${RANKS[g.rank].name}</div><h2>${g.name}</h2>
        <div class="dline">${c.name} of ${g.origin} &middot; ${ratingLine(g)} &middot; ${styleMark(g)} &middot; ${g.wins}W ${g.losses}L</div>
        <div class="has">${g.traits.length ? g.traits.map(t => TRAITS[t] ? `<span class="chip ${TRAITS[t].good ? '' : 'red'}"${tip(TRAITS[t].desc)}>${TRAITS[t].name}</span>` : '').join('') : '<span class="dim">No traits yet.</span>'}</div></div></div>
    <p class="perklead">Choose what the sand has taught him. One of three, and it is his for life.${g.perkPending > 1 ? ` <b>He has ${g.perkPending} to choose</b>: another three follow this.` : ''}</p>
    <div class="perkcards">${cards}</div>
    <div class="row"><button data-act="close">Decide later</button>
      ${(why => `<button data-act="perkreroll" data-v="${g.id}" ${why ? 'disabled' : ''}${tip(`Pay the doctore's old comrades to show him something else: three different perks are offered in place of these. Once for each choice.${why ? '\n' + why : ''}`)}>Another three &mdash; ${perkRerollCost(g)}</button>`)(perkRerollBlock(g))}
      <span class="dim" style="font-size:12px;margin-left:auto">Keys 1&ndash;${offer.length}, twice to confirm</span></div></div>`;
}

// The book of the trade: a page to each part of it, opened at the page for wherever you are standing.
const HELP_TABS = [['basics', 'The day'], ['fighters', 'Fighters'], ['fights', 'The sand'], ['town', 'The town'], ['province', 'The province'], ['legend', 'Marks'], ['keys', 'Keys']];
function helpModal() {
  if (!HELP_TABS.some(t => t[0] === ui.helpTab)) ui.helpTab = 'basics';
  const sec = (h, body) => `<div class="hsec"><h3>${h}</h3><p>${body}</p></div>`;
  const keys = (title, rows) => `<div class="hsec"><h3>${title}</h3><table class="keys">${rows.map(([k, t]) => `<tr><td><b>${k}</b></td><td>${t}</td></tr>`).join('')}</table></div>`;
  const pages = {
    basics: () => sec('Time', 'Nothing happens until you <b>end the day</b>. Each man trains one skill, spars or rests; you pay food and wages. Every fifth day there are <b>games</b>, and on that day the market, the smith, the hiring hall and the contract board all change.')
      + sec('The aim', `Win bouts for purses and <b>fame</b>. Fame opens greater arenas, and at ${FINAL_FAME} the Emperor sends for you. Lose every man, or stay in debt past the days of grace, and the house falls.`)
      + sec('Money', 'Purses, wagers, contracts and the Guild\'s stipend bring it in; food, wages, men and steel take it out. The ledger under <b>Household</b> shows each day\'s balance.')
      + sec('Debt and heirs', 'Below zero the creditors give you a few days of grace, then take the ludus. That is not the end: an heir begins again with whatever the family managed to keep, and legacy buys a better start.')
      + sec('Where to look', 'Hover over anything, anywhere, for what it means, or reach it with Tab. <b>Settings</b>, in the menu, can hold the pictures still, switch off the single keys, and make Tab stop at every explanation. The steward can walk you through the first week again from the foot of this page.')
      + sec('Saving', 'The game saves itself after everything you do, and keeps a copy from the morning of the last games day. <b>Saves</b>, at the foot of the side bar, holds five campaigns.'),
    fighters: () => sec('Three skills', '<b>Strength</b> hits harder and carries more health; <b>Agility</b> strikes faster and dodges; <b>Skill</b> lands blows, finds telling ones and blocks. <b>Power</b> is the three added up.')
      + sec('Style', 'A man\'s highest skill is his style. <b>Strength beats Agility, Agility beats Skill, Skill beats Strength</b>: the style with the edge hits a tenth harder. Two skills level means no style, no edge and no weakness.')
      + sec('Training', 'Train a skill and its bar fills; full, the skill goes up. <b>Potential</b> (the stars) is how fast he learns it. Training tires him; a tired man trains worse and fights worse, and an exhausted one must rest.')
      + sec('Abilities', 'A skill at 5, 10 and 16 teaches an ability, different for each kind of fighter. He carries four; choose which on his Abilities page once he knows more.')
      + sec('Rank and perks', 'Fights give experience; experience gives rank; each rank gives a perk to choose. Traits he came with, good and bad, are his for life.')
      + sec('Morale, wounds, bonds', 'Low morale saps everything. Wounds keep a man out for days: an infirmary and a medicus shorten that. Men make friends and rivals; a friend\'s death is grieved, and may be avenged.')
      + sec('Freedom', 'After eight victories a man may be given the wooden sword: he leaves, the city talks of it, and every man in the yard takes heart. A promise of freedom must be kept.'),
    fights: () => sec('Before the bout', 'Pick your men, set a wager if you like, and go to the sand. <b>Might</b> is how dangerous a man is today, with gear, wounds and weariness counted; the odds are worked from it.')
      + sec('The charge', 'Each fighter\'s gold bar fills with time and with blows given and taken. Full, the fight stops and you choose his ability, or set <b>Abilities: auto</b> and he chooses for himself.')
      + sec('How it ends', 'A man goes down, or yields. The crowd then judges the fallen: a good show and a man who yielded are spared far more often. In a bout <b>to the death</b> there is no yielding and no mercy.')
      + sec('The cloth', '<b>Throw in the cloth</b> to make your worst-hurt man yield at once. Once a bout, and it asks twice.')
      + sec('The crowd', 'Telling blows, abilities and a close fight raise the crowd; a roused crowd pays more fame and spares more men. A dull fight gets cabbage stalks.')
      + sec('Aiming', 'When the fight stops for one of yours, the ability goes to whoever he is aimed at: click a foe on the sand or in the panel, or press <b>T</b> for the next one. <b>All on him</b> (F) sets every man of yours on that foe until he is down. <b>Hold it</b> (W) keeps the charge and asks again in four seconds.')
      + sec('Watching', 'Pause, step, or run at half speed to look closely; rest the mouse on any fighter for what he is and how he stands. <b>Log</b> keeps every line of the fight. Cut-ins and the following camera can be switched off.')
      + sec('Festivals', 'Some games days are special: a beast hunt, a great melee of four or five a side, funeral games fought to the death for richer purses, a triumph with armed captives and a cheap market, Saturnalia with no deaths and generous bookmakers, the Games of Mars with a duel for each fighting style, or the eight-man Laurel Tournament, where you may back any man for the laurel before the first round, tend your own between rounds, or enter nobody and watch. The arena screen shows the next three. <b>Sponsor</b> a festival in its last five days for more fame from its bouts; win enough of them and the house keeps its <b>crown</b>, which adds fame to every bout after.'),
    town: () => sec('The slave market', 'Buy men; sell your own for half their worth. A scout shows a recruit\'s potential before you pay. Fresh stock every games day.')
      + sec('The blacksmith', 'Six pieces to a man: a weapon and five of armour. Grades run F to S, rusted to imperial. A weapon adds damage; armour takes damage off every blow, and its weight costs a little dodge. Improve the forge for better stock.')
      + sec('Training', 'Each man is set to rest, to drill one skill, or to spar at all three. Sparring is worth more with a stronger partner. A Veteranus or better can <b>Teach</b>: men drilling a skill he is clearly better at learn it faster. <b>Auto</b> leaves a man to the doctore, who rests him when he needs it and drills him at what he learns fastest. In good spirits a man sometimes has a great day and learns far more.')
      + sec('The school', 'At the <b>Ludus</b>, the button <b>The school</b> shows its own buildings: barracks hold more men; the training ground speeds training; the infirmary and baths mend and rest them. The regimen is set there too.')
      + sec('Household', 'Staff are hired by the day. Rations trade coin for morale, and the granary makes them cheaper. Other buildings stand where they are used: the shrine with the <b>Patrons</b>, the stables just outside the east gate, on the map of the province, and the armourer is hired at the <b>Blacksmith</b>.')
      + sec('Patrons', 'The <b>Magistrate</b> fattens purses and at 60 favour adds a bout to every games. The <b>Grain Guild</b> pays a daily stipend. The <b>Temple</b> makes the crowd more merciful. Gifts and the right choices win favour.')
      + sec('Rival houses', 'Killing their men, or losing yours to them, deepens a feud. At open feud a house calls you out: answer the grudge match and it cools; refuse and it costs you.')
      + sec('Contracts', 'Work away from the ludus for pay and favour: guard duty, caravans, hunts. A man sent out is gone until he comes home, and some come home changed.')
      + sec('Things that happen', 'Now and then something wants an answer. Each choice has its price; the dialog shows what actually changed once you have chosen.'),
    province: () => sec('Getting out', 'Out through the east gate once you have fought your first games. Every fit man marches with you.')
      + sec('Time on the road', 'A day passes for each day\'s march, for going into a place, and for making camp. The map says how many days anywhere is before you set out. At night the column halts.')
      + sec('Places', 'Lairs, camps, shrines, ruins and villages. The skulls by a place say how hard it is; farther from town is harder and richer. Nothing out here can be done twice.')
      + sec('Fights in the wild', 'No crowd and no mercy: a man who goes down lives or dies by luck and your medicus. Beasts give no quarter.')
      + sec('Home', 'Games are still held in town every fifth day; away, you miss them. <b>Go home</b> sets the column on the shortest road to the gate.')
      + sec('The eagle', 'There is an old story in the province about a lost legion\'s eagle. Men who have a journey to make will tell you where they need to go.'),
    legend: () => `<div class="hsec wide"><h3>Styles</h3><div class="tri">${ic('str')} <b>Strength</b> <i>beats</i> ${ic('agi')} <b>Agility</b> <i>beats</i> ${ic('skl')} <b>Skill</b> <i>beats</i> ${ic('str')} <b>Strength</b></div></div>
      <div class="hsec wide"><h3>Grades of steel</h3><div class="grades">${RARITY.map((r, i) => `<span><span class="rar r${i}">${r}</span> ${MATERIAL[i]}</span>`).join('')}</div></div>
      <div class="hsec"><h3>Bars</h3><div class="legbars"><span>${bar('hp', 7, 10)} health</span><span>${bar('fat', 6, 10)} fatigue: lower is better</span><span>${bar('mor', 7, 10)} morale</span><span>${bar('prog', 5, 10)} progress, and in a fight the charge</span></div></div>
      <div class="hsec"><h3>In a fight</h3><div class="marks">${[['bleed', 'Bleeding: loses health as he fights'], ['ham', 'Hamstrung: slowed, dodges half as well'], ['arm', 'Arm wounded: hits softer'], ['net', 'Netted: cannot dodge or block'], ['stun', 'Stunned: cannot act'], ['weak', 'Weakened: hits softer for a time'], ['open', 'Exposed: every blow on him lands harder'], ['buff', 'Roused: guarding, hasty or in a fury']].map(([k, t]) => `<span><canvas width="14" height="14" data-hmark="${k}"></canvas>${t}</span>`).join('')}</div></div>
      <div class="hsec"><h3>On a fighter\'s card</h3><p><span class="chip red">Injured 2d</span> out until healed &nbsp; <span class="chip red">Exhausted</span> must rest &nbsp; <span class="chip gold">Perk to choose</span> a rank gained &nbsp; <span class="chip gold">Away</span> on a contract</p></div>
      <div class="hsec"><h3>On the province map</h3><p>Skulls beside a place: how dangerous it is, one to five. A gold name: a place you have marked, or that someone has asked to be taken to.</p></div>`,
    keys: () => keys('Everywhere', [['Tab', 'to each button in turn; Enter or Space presses it'], ['H', 'this book'], [typeof escFree === 'function' && !escFree() ? 'Esc' : 'Esc', typeof escFree === 'function' && !escFree() ? 'leave full screen (the browser keeps this key)' : 'close a window'], ['Enter', 'go on from a notice'], ['1 to 3', 'answer a matter that wants a choice']])
      + keys('At the ludus and in town', [['W A S D', 'walk the lanista about the town'], ['E', 'end the day'], ['G', 'run the days to the next games'], ['Up, Down', 'through the list on screen'], ['Left, Right', 'through the pages of a dossier'], ['1 to 5', 'the chosen fighter\'s work: rest, strength, agility, skill, spar'], ['B', 'buy at the market or the smith; pick the best men for a bout or a contract'], ['Enter', 'to the sand']])
      + keys('In a fight', [['1 to 4', 'choose the ability'], ['A', 'let him choose this once'], ['Space', 'pause'], ['.', 'step a tenth of a second'], ['[ and ]', 'slower and faster'], ['L', 'the log of the fight'], ['C, twice', 'throw in the cloth'], ['click the sand', 'cut short an entrance, an announcement, a death or the ending']])
      + keys('In the province', [['W A S D', 'march the column'], ['click', 'march to that place'], ['E', 'make camp'], ['M', 'the whole map'], ['R', 'set out for home']]),
  };
  return `<div class="help"><h2>How the trade is plied</h2>
    <div class="subtabs helptabs">${HELP_TABS.map(([k, n]) => `<button class="${ui.helpTab === k ? 'on' : ''}" data-act="helptab" data-v="${k}">${n}</button>`).join('')}</div>
    <div class="hpage ${ui.helpTab}">${pages[ui.helpTab]()}</div>
    <div class="row"><button class="primary" data-act="close">Close</button><button data-act="helptut"${tip('steward')}>Walk me through it again</button><span class="dim" style="font-size:12px;margin-left:auto">Left and Right turn the pages</span></div></div>`;
}
function paintHelpMarks() {
  document.querySelectorAll('[data-hmark]').forEach(cv => { const c = cv.getContext('2d'); c.clearRect(0, 0, 14, 14); try { drawMark(c, cv.dataset.hmark, 2, 2, 2); } catch (e) { /* the fight's code is not loaded */ } });
}

// ---------- modal queue ----------

const modalQueue = [];
function showModal(html) { modalQueue.push(html); if (modalQueue.length === 1) paintModal(); }
function paintModal() {
  const m = $('#modal');
  if (!modalQueue.length) { m.hidden = true; return; }
  $('#modalBox').innerHTML = modalQueue[0];
  $('#modalBox').classList.toggle('wide', modalQueue[0].startsWith('<div class="res">'));
  $('#modalBox').classList.toggle('evbox', modalQueue[0].startsWith('<div class="ev">'));
  if (typeof paintEventArt === 'function') paintEventArt();
  $('#modalBox').classList.toggle('helpbox', modalQueue[0].startsWith('<div class="help">'));
  $('#modalBox').classList.toggle('perkwide', modalQueue[0].startsWith('<div class="perkbox">'));
  $('#modalBox').classList.toggle('savebox', modalQueue[0].startsWith('<div class="saves">'));
  $('#modalBox').classList.toggle('menubox', modalQueue[0].startsWith('<div class="menu">'));
  $('#modalBox').classList.toggle('questbox', modalQueue[0].startsWith('<div class="quests">'));
  paintHelpMarks();
  if (typeof paintResultFaces === 'function') paintResultFaces();
  m.hidden = false;
}
function closeModal() { modalQueue.shift(); paintModal(); }
const okBtn = (label) => `<div class="row"><button class="primary" data-act="close">${label || 'Continue'}</button></div>`;

// ---------- rendering ----------

function render() {
  hideTip();
  { const y = $('#yard'); if (y) { if (!y.dataset.home) y.dataset.home = y.dataset.tip; y.dataset.tip = ui.tab !== 'ludus' && PLACE_TIPS[ui.tab] ? PLACE_TIPS[ui.tab] : y.dataset.home; } }      // the picture's tooltip follows the picture
  if (G) SFX.mood({ tense: G.denarii < 0, festive: isGamesDay() });       // the yard's tune darkens in debt, and gains a drum on games days
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
    <h1 class="title">LUDUS MAGNUS${G.dynasty.gen > 1 ? ` <small${tip('dynasty')}>${ordinal(G.dynasty.gen)} generation</small>` : ''}</h1>
    <div class="stat"${tip('day')}><b>${ic('day')}${G.day}</b><span>Day</span></div>
    <div class="stat"${tip('denarii')}><b class="${G.denarii < 0 ? 'bad' : 'gold'}">${ic('coin')}${G.denarii}<span class="sr"> denarii</span></b><span>${net >= 0 ? '+' : ''}${net} a day</span></div>
    <div class="stat"${tip('fame')}><b>${ic('fame')}${G.fame}<small>/${next}</small><span class="sr"> fame</span></b><span>${TIERS[t].name}</span></div>
    <div class="stat games"${tip('games')}><b>${ic('games')}${dg === 0 ? 'TODAY' : dg + (dg === 1 ? ' day' : ' days')}</b><span>Next games</span></div>
    <button class="primary" data-act="endday"${tip('endday')}>End day<span class="key">E</span></button>
    <button data-act="skipdays"${tip('skip')} ${dg > 1 ? '' : 'disabled'}>To the games<span class="key">G</span></button>`;
  const sw = (act, label, on, key) => `<button class="${on ? '' : 'off'}" data-act="${act}" data-toggle aria-pressed="${!!on}"${tip(key)}>${label}</button>`;
  $('#sidefoot').innerHTML = `<button class="wide" data-act="menu"${tip('Settings, saving, the figures of your house, and the way out.')}>Menu${typeof escFree === 'function' && !escFree() ? '' : ' <span class="key">Esc</span>'}</button>${canFull() ? `<button class="wide" data-act="fullscreen"${tip('Fills the whole screen with the game, or gives the screen back. Esc also leaves it.')}>${isFull() ? 'Leave full screen' : 'Full screen'}</button>` : ''}<button class="wide" data-act="help"${tip('The keys, and the rules of the trade in a page. Key: H')}>Help</button><button class="wide" data-act="saves"${tip('saves')}>Saves</button>
    ${sw('yardtoggle', 'Yard', !ui.noyard, 'yardbtn')}${sw('mute', 'Sound', !SFX.muted, 'sound')}${sw('musictoggle', 'Music', SFX.musicOn, 'music')}`;
}

const TAB_KEYS = ['ludus', 'arena', 'contracts', 'rivals', 'market', 'smith', 'facilities', 'patrons', 'chronicle'];
// The screens are reached on foot now (see village.js); all that is left to do here is hide or show the school picture.
function renderTabs() { $('#app').classList.toggle('noyard', ui.noyard); }
// Called by the village when the lanista steps onto a doorstep.
function villageEnter(key) { if (ui.tab === key) return; ui.tab = key; SFX.ui('door'); render(); }
// What waits inside a building, shown as a number by its name on the map.
function villageMarks() { return { arena: G.bouts ? G.bouts.filter(b => !b.done).length : 0, contracts: G.contracts.filter(c => c.asked).length }; }

// The view is rebuilt after every action, so each scrolling pane is put back where the player left it.
function renderView() {
  const v = { ludus: viewLudus, arena: viewArena, contracts: viewContracts, market: viewMarket, smith: viewSmith, rivals: viewRivals, facilities: viewFacilities, patrons: viewPatrons, chronicle: viewChronicle }[ui.tab];
  const el = $('#view'), keep = {};
  if (ui.shown !== ui.tab) { ui.sellArm = ui.fireArm = null; ui.school = ui.tab === 'ludus' && !!ui.schoolNext; ui.schoolNext = false; }       // a sale half-agreed is forgotten when you walk away
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
  return e > 1 ? ' <b class="good" role="img" aria-label="His style beats this man" title="His style beats this man">&#9650;</b>' : e < 1 ? ' <b class="bad" role="img" aria-label="This man\'s style beats his" title="This man\'s style beats his">&#9660;</b>' : '';
}
const ratingLine = (g, hide) => `<span${tip('rating')}>Power <b class="num">${rating(g)}</b> &middot; Potential <b class="num">${hide ? '?' : potential(g)}</b></span>`;

function statusChips(g) {
  let s = '';
  if (g.away) s += `<span class="chip gold"${tip('away')}>Away ${daysLeft(jobOf(g))}d</span>`;
  if (g.quest && QUESTS[g.quest.id]) s += `<span class="chip gold"${tip('quest')}>Journey promised</span>${journeyGo(g)}`;
  if (g.wish) s += `<span class="chip red"${tip('vow')}>Vow</span>`;
  if (g.perkPending > 0) s += `<span class="chip gold"${tip('perk')}>Perk to choose</span>`;
  if (g.injury > 0) s += `<span class="chip red"${tip('injured')}>Injured ${g.injury}d</span>`;
  if (g.fatigue > 75) s += `<span class="chip red"${tip('exhausted')}>Exhausted</span>`;
  if (g.foughtDay === G.day) s += `<span class="chip">Fought today</span>`;
  if (g.wins >= 8) s += `<span class="chip gold"${tip('veteran')}>Veteran</span>`;
  return s;
}

// One fighter on one row: face, name and standing, his three skills, the three gauges, and today's work as five small buttons.
function gladCard(g) {
  // a button that cannot be used stays hoverable so its tooltip can say why
  const actBtn = ([k, label, what], i) => {
    const why = actBlock(g, k);
    return `<button class="${g.activity === k && g.injury <= 0 ? 'on' : ''} ${why ? 'off' : ''} ${g.auto && g.activity === k ? 'byauto' : ''}" data-act="activity" data-v="${g.id}" data-w="${k}"${tip(why || `${what}\nKey: ${i + 1}, for whoever is chosen.`)}>${actLabel(k)}</button>`;
  };
  const noDoc = !staffLvl('doctore');
  const autoBtn = `<button class="${g.auto ? 'on' : ''} ${noDoc ? 'off' : ''}" data-act="actauto" data-v="${g.id}"${tip(noDoc ? 'Leaving a man to the doctore needs a doctore. Hire one under Household.' : `A for Auto: leave him to the doctore. Each morning he is set to rest when he needs it and before the games, and otherwise to the skill he learns fastest.${g.auto ? `\nToday the doctore has him ${g.activity === 'rest' ? 'resting' : g.activity === 'spar' ? 'sparring' : g.activity === 'teach' ? 'teaching' : 'at ' + STAT_NAMES[g.activity].toLowerCase()}. Choose anything else to take him back.` : ''}`)}>A</button>`;
  const J = jobOf(g);
  const work = J ? `<div class="awaynote">Away: <b>${jobTitle(J)}</b><br>back ${backWhen(J)}</div>` : `<div class="acts mini">${ACT_BUTTONS.map(actBtn).join('')}${autoBtn}</div>`;
  const skills = STATS.map(s => `<span class="sk ${trains(g, s) ? 'up' : ''}"${tip(`${STAT_NAMES[s]} ${g.stats[s]}${trains(g, s) ? ', in training' : ''}`)}>${ic(s)}<b class="num">${g.stats[s]}</b></span>`).join('');
  return `<div class="lrow grow-row lud ${ui.sel === g.id ? 'sel' : ''} ${J ? 'away' : ''}" data-act="sel" data-v="${g.id}">
    <canvas width="48" height="56" style="width:34px;height:40px" data-portrait="${g.id}"></canvas>
    <div class="grow"><span class="t">${g.name} ${styleMark(g)} <small class="inl">${RANKS[g.rank].name} &middot; ${CLASSES[g.cls].name} &middot; ${g.wins}W ${g.losses}L</small></span>
      <div class="l2"><span class="sks"${tip('rating')}><b class="num pw"><span class="sr">power </span>${rating(g)}</b>${skills}</span>${statusChips(g)}</div></div>
    <div class="gauges"><div${tip(`Health ${Math.round(g.hp)} of ${maxHp(g)}.\n${TIPS.health}`)}>${bar('hp', g.hp, maxHp(g))}</div><div${tip(`Fatigue ${Math.round(g.fatigue)} of 100.\n${TIPS.fatigue}`)}>${bar('fat', g.fatigue, 100)}</div><div${tip(`Morale ${Math.round(g.morale)} of 100.\n${TIPS.morale}`)}>${bar('mor', g.morale, 100)}</div></div>
    ${work}
  </div>`;
}

// What today holds for him, in a sentence or two: what his work will do and when it will pay.
function todayNote(g) {
  const J = jobOf(g);
  if (J) return `Away: ${jobTitle(J).toLowerCase()}, back ${backWhen(J)}.`;
  const [heal, shed] = restGain(g), need = Math.max(Math.ceil((maxHp(g) - g.hp) / heal), Math.ceil(g.fatigue / shed));
  const mend = need <= 0 ? 'He is whole and fresh.' : `Whole and fresh in ${need} day${need === 1 ? '' : 's'}.`;
  if (g.injury > 0) return `<b class="bad">Injured.</b> He can only rest: ${g.injury} more day${g.injury === 1 ? '' : 's'} before he trains or fights.`;
  const tired = G.autoRest && g.fatigue > 75;
  if (g.activity === 'rest' || tired) {
    return `<b>${tired ? 'Too tired to train, so he rests.' : 'Resting.'}</b> Each day gives back ${Math.round(heal)} health and sheds ${shed} fatigue. ${need <= 0 && !tired ? '<span class="bad">Rest is wasted on him today.</span>' : mend}`;
  }
  const byDoc = g.auto ? ' <span class="dim">(the doctore\'s choice)</span>' : '';
  if (g.activity === 'teach') {
    const pupils = G.roster.filter(o => o !== g && !o.away && o.injury <= 0 && STATS.includes(o.activity) && g.stats[o.activity] >= o.stats[o.activity] + 2);
    return `<b>Teaching.</b>${byDoc} ${pupils.length ? `${namesOf(pupils)} ${pupils.length === 1 ? 'learns' : 'learn'} ${Math.round((0.2 + 0.05 * g.rank) * 100)}% faster for it.` : '<span class="bad">Nobody is drilling a skill he is clearly better at: his day is wasted.</span>'} He barely tires.`;
  }
  const spar = g.activity === 'spar', sb = spar ? sparBonus(g) : 1, rate = trainRate(g) * sb, tire = trainTire(g, spar);
  const days = s => g.stats[s] >= 20 ? 0 : Math.max(1, Math.ceil((needProg(g.stats[s]) - g.prog[s]) / (rate * g.pot[s] * (spar ? 0.32 : 1) * (1 + teachBonus(g, s)))));
  const gains = (spar ? STATS : [g.activity]).map(s => { const d = days(s); return d ? `${STAT_NAMES[s]} ${g.stats[s] + 1} in ${d} day${d === 1 ? '' : 's'}` : `${STAT_NAMES[s]} can go no higher`; }).join(', ');
  const left = Math.max(0, Math.ceil((75 - g.fatigue) / tire));
  const warn = g.fatigue > 75 ? '<span class="bad">He is exhausted and may tear something.</span>' : left <= 1 ? '<span class="bad">Exhausted after today.</span>' : `Exhausted in ${left} days at this pace.`;
  const tb = spar ? 0 : teachBonus(g, g.activity), bc = Math.round(breakChance(g) * 100);
  const extra = (tb ? ` <span class="good">Taught: +${Math.round(tb * 100)}%.</span>` : '') + (spar ? (sb > 1 ? ' <span class="good">A stronger partner: +15%.</span>' : sb < 1 ? ' <span class="bad">Nobody to spar with: 15% less.</span>' : '') : '')
    + (bc ? ` <span class="dim"${tip('In good spirits a man now and then has a day when everything comes right, and learns two and a half times as much. The better his morale, the likelier.')}>${bc}% chance of a great day.</span>` : '');
  return `<b>${spar ? 'Sparring.' : 'Drilling ' + STAT_NAMES[g.activity].toLowerCase() + '.'}</b>${byDoc} ${gains}. ${warn}${extra}`;
}

// The school at a glance, and one order for everybody.
const RSORTS = [['cells', 'by cell'], ['power', 'by power'], ['ready', 'by readiness']];
function rosterSorted() {
  const r = [...G.roster], fit = g => (canFight(g) ? 2 : g.away ? 0 : 1) + g.hp / maxHp(g) - g.fatigue / 200;
  if (ui.rsort === 'power') r.sort((a, b) => rating(b) - rating(a));
  else if (ui.rsort === 'ready') r.sort((a, b) => fit(b) - fit(a));
  return r;
}
function schoolBar() {
  const here = G.roster.filter(g => !g.away), fit = G.roster.filter(canFight).length, hurt = G.roster.filter(g => g.injury > 0).length, away = G.roster.length - here.length;
  const spent = here.filter(g => g.injury <= 0 && g.fatigue > 75).length, idle = here.filter(g => g.injury <= 0 && g.activity === 'rest' && g.hp >= maxHp(g) && g.fatigue <= 0).length;
  const bit = (n, word, cls, t) => n ? `<span class="${cls}"${tip(t)}><b class="num">${n}</b> ${word}</span>` : '';
  const all = ACT_BUTTONS.filter(([k]) => k !== 'teach').map(([k, label]) => {
    const off = k === 'spar' && !staffLvl('doctore');
    return `<button class="${off ? 'off' : ''}" data-act="actall" data-w="${k}"${tip(off ? 'Sparring needs a doctore. Hire one under Household.' : `Set every man who is here and whole to: ${label.toLowerCase()}.`)}>${actLabel(k)}</button>`;
  }).join('') + `<button class="${staffLvl('doctore') ? '' : 'off'}" data-act="actall" data-w="auto"${tip(staffLvl('doctore') ? 'A for Auto: leave every man who is here to the doctore. He rests them when they need it and before the games, and drills each at what he learns fastest.' : 'Leaving the men to the doctore needs a doctore. Hire one under Household.')}>A</button>`;
  return `<div class="panel schoolbar">
    <div class="tally">${bit(fit, 'fit to fight', 'good', 'Whole, here, and not yet fought today.') || '<span class="bad">No one fit to fight</span>'}${bit(hurt, 'injured', 'bad', 'Resting until they heal. An infirmary and a medicus shorten it.')}${bit(spent, 'exhausted', 'bad', TIPS.exhausted)}${bit(away, 'away', 'gold', TIPS.away)}${bit(idle, 'idle', 'bad', 'Resting though whole and fresh: a day of training lost.')}
      <span${tip('Food for every man here, and the wages of your household, each day.')}>upkeep <b class="num">${upkeep()}</b> a day</span></div>
    <button class="mini" data-act="rsort"${tip('Change the order of the list: by cell, strongest first, or readiest to fight first.')}>${RSORTS.find(s => s[0] === (ui.rsort || 'cells'))[1]}</button>
    <div class="acts mini"><span class="lbl">Everyone</span>${all}</div>
  </div>`;
}

// Is this one of your fighters, currently set to train this stat?
function trains(g, s) { return G.roster.includes(g) && g.injury <= 0 && !g.away && (g.activity === s || g.activity === 'spar'); }

function statRows(g, hide) {
  return STATS.map(s => `<div class="statrow"${tip(s)}>
      <span class="statname ${trains(g, s) ? 'gold' : ''}">${ic(s)} ${STAT_NAMES[s]}${trains(g, s) ? '<small class="gold">&#9650; training</small>' : ''}</span><b class="num">${g.stats[s]}</b>
      <div class="progcell">${bar('prog', g.prog[s], needProg(g.stats[s]))}${(a => g.beast || !ABILITIES[g.cls] ? '' : a ? `<small>${a.name} at ${a.at}</small>` : '<small>nothing more to learn</small>')(g.beast || !ABILITIES[g.cls] ? null : abilityNext(g, s))}</div>
      <span class="stars" role="img" aria-label="${hide ? 'Talent unknown' : 'Talent ' + stars(g.pot[s]) + ' of 5'}"${tip(hide ? 'hidden' : 'talent')}>${hide ? '? ? ?' : '★'.repeat(stars(g.pot[s])) + '☆'.repeat(5 - stars(g.pot[s]))}</span>
    </div>`).join('');
}
function traitList(g) {
  const mine = G.roster.includes(g);
  return g.traits.length
    ? g.traits.map(t => {
      const can = mine && perkLearnable(t), why = can ? forgetBlock(g, t) : '', armed = ui.forgetArm === g.id + ':' + t;
      return `<div class="trait"><b class="${TRAITS[t].good ? 'good' : 'bad'}">${TRAITS[t].name}</b> <span class="dim">${TRAITS[t].desc}</span>${can ? `<button class="mini unlearn ${armed ? 'primary' : ''}" data-act="forget" data-v="${g.id}" data-w="${t}" ${why ? 'disabled' : ''}${tip(`Drill it out of him for ${forgetCost(g)} denarii: the perk is gone and he chooses again from three. One man between one games and the next.${why ? '\n' + why : ''}`)}>${armed ? `Sure? ${forgetCost(g)}` : 'Unlearn'}</button>` : ''}</div>`; }).join('')
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
  const known = abilitiesKnown(g), carried = abilitiesOf(g), choose = known.length > 4, sigA = signatureOf(g);
  const pace = Math.round((g.traits.includes('ironlungs') ? 1.25 : 1) * (1 - g.fatigue / 250) * 100);
  const rows = STATS.map(k => `<div class="abgroup"><div class="abhead">${ic(k)} ${STAT_NAMES[k]} <b class="num">${g.stats[k]}</b>${(a => a ? `<small>${a.at - g.stats[k]} to go</small>` : '<small>all learned</small>')(abilityNext(g, k))}</div>${ABILITIES[g.cls][k].map(a => {
    const has = known.includes(a), on = carried.includes(a), mr = masteryRank(g, a.id), uses = masteryUses(g, a.id), sig = sigA === a;
    const mast = has ? `<span class="mast r${mr}"${tip(`${mr ? MAST_NAMES[mr] + '. ' : ''}Used ${uses} time${uses === 1 ? '' : 's'}, in fights and at sparring.${mr < 3 ? ` ${MAST_NAMES[mr + 1]} at ${MAST_AT[mr]}.` : ''}\nPractised at ${MAST_AT[0]}, Honed at ${MAST_AT[1]}, Mastered at ${MAST_AT[2]}: each makes it ${Math.round(MAST_STEP * 100)}% stronger, in damage or in how long it lasts.${mr ? `\nNow: ${abilityTags(a, g).join(', ')}.` : ''}`)}>${'●'.repeat(mr)}${'○'.repeat(3 - mr)}</span>` : '';
    const star = has && on ? `<span class="sig ${sig ? 'on' : ''}" data-act="absig" data-v="${g.id}" data-w="${a.id}"${tip(sig ? 'His signature. After he uses it, his charge starts again at 30% instead of nothing. Click to take the mark off.' : 'Make this his signature: after he uses it, his charge starts again at 30% instead of nothing. One to a man.')}>&#9733;</span>` : '';
    return `<div class="ab ${has ? (on ? 'on' : 'known') : 'locked'} ${sig ? 'sigd' : ''}" ${has && choose ? `data-act="abil" data-v="${g.id}" data-w="${a.id}"` : ''}>
      <b>${a.name}</b> ${mast}<small>${has ? (on ? 'carried' : 'known') : `at ${STAT_NAMES[k]} ${a.at}`}</small>${star}<div class="dim"${tip(a.desc)}>${a.desc}</div></div>`;
  }).join('')}</div>`).join('');
  return `<div${tip('abilities')} style="font-size:13px;margin-bottom:6px">${known.length ? `He knows <b>${known.length}</b> and carries <b>${carried.length}</b>.${choose ? ' Click one to carry it or put it down.' : ''} ${sigA ? `His signature is <b class="gold">${sigA.name}</b>.` : 'Star one he carries to make it his signature.'} Abilities grow stronger with use.` : 'He has learned nothing yet: a skill at 5 teaches the first. Until then a full charge is a single heavy blow.'} <span${tip('How fast his gold bar fills in a fight. Fatigue slows it; rest restores it.')} class="${pace < 85 ? 'bad' : 'dim'}">His charge fills at ${pace}% of full pace${pace < 85 ? ': he is tired' : ''}.</span></div><div class="abcols">${rows}</div>`;
}

function gladDetail(g) {
  const c = CLASSES[g.cls];
  if (!DTABS.some(t => t[0] === ui.dtab)) ui.dtab = 'stats';
  const tac = Object.entries(TACTICS).map(([k, t]) => `<option value="${k}" ${g.tactic === k ? 'selected' : ''}>${t.name}</option>`).join('');
  const pages = {
    stats: () => `<div class="today"><span class="lbl">Today</span><div>${todayNote(g)}</div></div>
      ${statRows(g)}<hr class="sep">${traitList(g)}<hr class="sep">
      <div class="dim" style="font-size:13px">${c.desc}</div>
      <div class="dim" style="font-size:13px;margin-top:4px">Worth about <b class="num">${value(g)}</b> denarii.</div>`,
    abil: () => abilityBlock(g),
    gear: () => gearBlock(g),
    story: () => storyBlock(g) + questBlock(g),
    orders: () => `<div class="sendhead"${tip('orders')}><span>How he fights, in every bout until you say otherwise</span></div>
      <div class="tactics">${Object.entries(TACTICS).map(([k, t]) => `<button class="${g.tactic === k ? 'primary' : ''}" data-act="tactic" data-v="${g.id}" data-w="${k}"><b>${t.name}</b><span>${t.desc}</span></button>`).join('')}</div>
      <hr class="sep">
      ${g.away ? `<small>He is away from the ludus: ${jobTitle(jobOf(g)).toLowerCase()}, back ${backWhen(jobOf(g))}. He cannot be sold or freed until he returns.</small>` : `
      <div class="partings">
        <div><b>Sell him</b><small>He is worth about ${value(g)} denarii; the dealer pays half. His kit comes back to your racks.</small>
          <button class="${ui.sellArm === g.id ? 'primary' : ''}" data-act="msell" data-v="${g.id}"${tip('sell')}>${ui.sellArm === g.id ? `Sure? Sell ${g.name}` : `Sell for ${sellPrice(g)}`}</button></div>
        <div><b>Grant the wooden sword</b><small>${g.wins >= 8 ? `He walks free for good. The city talks of it: fame +${40 + g.wins * 5}, and every man in the yard takes heart.` : `Freedom may be granted after 8 victories. He has ${g.wins}.`}</small>
          ${g.wins >= 8 ? `<button data-act="free" data-v="${g.id}"${tip('free')}>Free ${g.name}</button>` : bar('prog', g.wins, 8)}</div>
      </div>`}`,
  };
  const mark = { story: g.quest && QUESTS[g.quest.id] ? '!' : '' };
  return `<div class="panel dossier">
    <div class="dhead">
      <canvas class="portrait" width="192" height="224" data-portrait="${g.id}"${tip(faceTip(g))}></canvas>
      <canvas class="portrait figure" width="192" height="224" data-figure="${g.id}"${tip('As he stands on the sand, in the kit he wears now. Change his gear and this changes with it.')}></canvas>
      <div class="dinfo">
        <div class="dname"><h2>${g.name}</h2>${epithetOf(g) ? `<i class="ep"${tip('What the yard calls him, from what he has done. It changes as he does.')}>${epithetOf(g)}</i>` : ''}<span class="num dim">${g.wins} wins &middot; ${g.losses} losses &middot; ${g.kills} kills</span></div>
        <div class="dline">${RANKS[g.rank].name} &middot; ${c.name} of ${g.origin} &middot; ${ratingLine(g)} &middot; ${styleMark(g)}</div>
        <div class="dchips">${statusChips(g)}${g.perkPending > 0 ? `<button class="primary mini" data-act="perk" data-v="${g.id}">Choose a perk</button>` : ''}</div>
        <div class="vitals four">
          <div${tip('health')}><span>Health <b class="num">${Math.round(g.hp)}/${maxHp(g)}</b></span>${bar('hp', g.hp, maxHp(g))}</div>
          <div${tip('fatigue')}><span>Fatigue <b class="num ${g.fatigue > 75 ? 'bad' : ''}">${Math.round(g.fatigue)}</b></span>${bar('fat', g.fatigue, 100)}</div>
          <div${tip('morale')}><span>Morale <b class="num ${g.morale < 30 ? 'bad' : ''}">${Math.round(g.morale)}</b></span>${bar('mor', g.morale, 100)}</div>
          ${g.rank < RANKS.length - 1 ? `<div${tip('rank')}><span>To ${RANKS[g.rank + 1].name}</span>${bar('prog', g.xp - RANKS[g.rank].xp, RANKS[g.rank + 1].xp - RANKS[g.rank].xp)}</div>` : '<div><span>Highest rank</span></div>'}
        </div>
      </div>
    </div>
    <div class="subtabs">${DTABS.map(([k, n]) => `<button class="${ui.dtab === k ? 'on' : ''}" data-act="dtab" data-v="${k}">${n}${mark[k] ? `<span class="badge">${mark[k]}</span>` : ''}</button>`).join('')}</div>
    <div class="dbody" data-pane="dossier-${g.id}-${ui.dtab}">${pages[ui.dtab]()}</div>
  </div>`;
}

// How things stand behind each door, in a line, for the map of the town.
function villageStatus(key) {
  const dg = daysToGames(), when = n => n === 0 ? 'TODAY' : n === 1 ? 'TOMORROW' : `IN ${n} DAYS`, net = stipend() - upkeep();
  const here = G.roster.filter(g => !g.away), hurt = G.roster.filter(g => g.injury > 0).length, away = G.roster.length - here.length;
  if (key === 'ludus') return `${G.roster.filter(canFight).length} FIT TO FIGHT${hurt ? `, ${hurt} HURT` : ''}${away ? `, ${away} AWAY` : ''}${G.roster.some(g => g.perkPending > 0) ? ', A PERK TO CHOOSE' : ''}`;
  if (key === 'facilities') return `PURSE ${G.denarii}, ${net >= 0 ? '+' : ''}${net} A DAY${G.denarii < 0 ? ' - THE CREDITORS ARE AT THE DOOR' : ''}`;
  if (key === 'arena') { const open = (G.bouts || []).filter(b => !b.done).length; return isGamesDay() ? (open ? `${open} BOUT${open === 1 ? '' : 'S'} WAITING TODAY` : 'THE DAY\'S BOUTS ARE DONE') : `GAMES ${when(dg)}`; }
  if (key === 'market') return `${G.market.length} FOR SALE, ${Math.max(0, capacity() - G.roster.length)} CELL${capacity() - G.roster.length === 1 ? '' : 'S'} FREE, FRESH STOCK ${when(dg)}`;
  if (key === 'smith') return `${G.smith.stock.length} PIECE${G.smith.stock.length === 1 ? '' : 'S'} FOR SALE${G.armoury.length ? `, ${G.armoury.length} SPARE ON YOUR RACKS` : ''}`;
  if (key === 'contracts') return `${G.contracts.length} OFFER${G.contracts.length === 1 ? '' : 'S'} OF WORK${G.contracts.some(c => c.asked) ? ', ONE ASKS FOR YOU BY NAME' : ''}${G.jobs.length ? `, ${G.jobs.length} OUTING${G.jobs.length === 1 ? '' : 'S'} UNDER WAY` : ''}`;
  if (key === 'patrons') return `MAGISTRATE ${Math.round(G.patrons.magistrate)}, GUILD ${Math.round(G.patrons.guild)}, TEMPLE ${Math.round(G.patrons.temple)}`;
  if (key === 'rivals') { const hot = G.houses.slice().sort((a, b) => b.grudge - a.grudge)[0]; return `YOU STAND ${ordinal(G.houses.filter(H => H.prestige > G.fame).length + 1).toUpperCase()} OF ${G.houses.length + 1}${hot && hot.grudge >= 25 ? `, ${feudWord(hot.grudge).toUpperCase()} WITH ${houseDef(hot.id).name.toUpperCase()}` : ''}`; }
  return `DAY ${G.day}, ${G.tally.wins} WON AND ${G.tally.losses} LOST${G.fallen.length ? `, ${G.fallen.length} FALLEN` : ''}`;
}

function viewLudus() {
  const flip = `<button class="mini h2btn ${ui.school ? 'primary' : ''}" data-act="school"${tip(ui.school ? 'Back to the men.' : 'The school\'s own buildings: barracks, training ground, infirmary and baths, and how hard the men are worked.')}>${ui.school ? 'The men' : 'The school'}</button>`;
  if (!G.roster.length && !ui.school) return `<div class="fill"><div><h2>Gladiators ${flip}</h2><div class="pane"><div class="panel">Your cells are empty. Visit the market.</div></div></div><div></div></div>`;
  if (G.roster.length && !byId(ui.sel)) ui.sel = G.roster[0].id;
  const left = ui.school
    ? `<div><h2>The school <small>${G.roster.length} / ${capacity()}</small>${flip}</h2>${schoolPanel()}</div>`
    : `<div><h2>Gladiators <small>${G.roster.length} / ${capacity()}</small>${flip}
        <label class="h2opt"${tip('autorest')}><input type="checkbox" data-chg="autorest" ${G.autoRest ? 'checked' : ''}> the exhausted rest on their own</label></h2>
      ${schoolBar()}
      <div class="pane" data-pane="roster"><div class="panel list">${rosterSorted().map(gladCard).join('')}${capacity() > G.roster.length ? `<div class="lrow emptycell"><span class="dim">${capacity() - G.roster.length} empty cell${capacity() - G.roster.length === 1 ? '' : 's'}. The slave market in the village has men for sale.</span></div>` : ''}</div></div></div>`;
  return `<div class="fill">
    ${left}
    <div><h2>Dossier</h2>${G.roster.length ? gladDetail(byId(ui.sel)) : ''}</div>
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

// The men who would do this work best together, from those free to go: every team is tried, bonds and all.
function bestTeam(c) {
  const avail = G.roster.filter(canSend);
  if (avail.length < c.size) return null;
  let best = null, bp = -1;
  const go = (from, team) => {
    if (team.length === c.size) { const p = contractOdds(c, team); if (p > bp) { bp = p; best = team.slice(); } return; }
    for (let k = from; k < avail.length; k++) { team.push(avail[k]); go(k + 1, team); team.pop(); }
  };
  go(0, []);
  return { men: best, p: bp };
}
// What the road is likely to cost each man sent: [chance of a wound, chance of death], given the chance of success.
function roadRisk(D, p) {
  const wound = D.danger * (p * 0.18 + (1 - p) * 0.55);
  const death = D.danger >= 0.5 ? (1 - p) * D.danger * 0.55 * clamp(D.danger * 0.25 - mercyBonus(), 0.02, 0.3) : 0;
  return [wound, death];
}
const oddsBar = p => `<div class="bar odds"><i class="${p >= 0.75 ? 'hi' : p >= 0.5 ? 'mid' : 'lo'}" style="width:${Math.round(p * 100)}%"></i><u style="left:50%"></u></div>`;

function contractCard(c) {
  const D = CONTRACTS[c.type];
  const picks = ui.cpicks[c.id] = (ui.cpicks[c.id] || []).filter(id => canSend(byId(id)));
  const avail = G.roster.filter(canSend).sort((a, b) => aptitude(b, D, c.land).score - aptitude(a, D, c.land).score), men = picks.map(byId), ready = men.length === c.size;
  const chips = avail.length ? avail.map(g => pickChip('cpick', c.id, g, picks.includes(g.id), D, c.need, c.land)).join('') : '<span class="dim">Nobody is free to send.</span>';
  if (!TERMS[ui.cterms[c.id]] || (ui.cterms[c.id] === 'hazard' && D.danger < 0.5)) ui.cterms[c.id] = 'standard';
  const terms = ui.cterms[c.id], T = contractTerms(c, terms);
  const best = bestTeam(c), p0 = ready ? contractOdds(c, men) : 0, p = ready ? Math.min(0.99, p0 + T.edge) : 0, isBest = ready && best && Math.abs(best.p - p0) < 0.001;
  const termChips = Object.keys(TERMS).filter(k => k !== 'hazard' || D.danger >= 0.5).map(k => `<span class="chip pick ${terms === k ? 'on' : ''}" data-act="cterms" data-v="${c.id}" data-w="${k}"${tip(TERMS[k].what)}>${TERMS[k].name}</span>`).join('');
  const termLine = terms === 'advance' ? `<b class="gold num">${T.now}</b> now and <b class="gold num">${T.pay}</b> on success, of ${c.pay}.` : terms === 'provision' ? `Costs <b class="num ${T.cost > G.denarii ? 'bad' : ''}">${T.cost}</b> now; the chance is 8 points better.` : terms === 'hazard' ? `<b class="gold num">${T.pay}</b> on success, favour +${T.favor} only, and one point lost for asking.` : `<b class="gold num">${c.pay}</b> on success.`;
  const suits = D.cls.map(k => CLASSES[k].name).concat(D.likes.slice(0, 3).map(t => TRAITS[t].name.toLowerCase())).join(', ');
  const stat = STATS.filter(k => D.w[k] >= 0.3).sort((a, b) => D.w[b] - D.w[a]).map(k => `${ic(k)} ${STAT_NAMES[k]}`).join(' &nbsp; ');
  const runners = men.filter(flightRisk), lose = c.asked ? 6 : 4;
  const [wound, death] = roadRisk(D, ready ? p : best ? best.p : 0.5);
  const gamesDay = (() => { for (let d = G.day; d < G.day + c.days; d++) if (d % GAMES_EVERY === 0) return d; return 0; })();
  const pct1 = x => x < 0.005 ? 'none' : x < 0.01 ? 'under 1%' : asPct(x);
  return `<div class="panel offer">
    <h3>${D.name} <small>${PATRONS[c.patron].name}</small>${c.asked ? ` <span class="chip gold"${tip('asked')} style="vertical-align:2px;margin:0 0 0 6px">Asked of you by name</span>` : ''}</h3>
    <p style="margin:2px 0">${D.text(c)}</p>
    <div class="kvs">
      <div${tip('contract')}><span>Pay</span><b class="num gold">${c.pay}</b><small>${Math.round(c.pay / c.size / c.days)} a man a day</small></div>
      <div><span>Away</span><b class="num">${c.days} day${c.days === 1 ? '' : 's'}</b><small class="${gamesDay ? 'bad' : 'good'}">${gamesDay ? `misses the games on day ${gamesDay}` : 'back before the games'}</small></div>
      <div${tip('danger')}><span>Risk</span><b class="${D.danger >= 0.65 ? 'bad' : ''}">${DANGER_WORD(D.danger)}</b><small>wound ${pct1(wound)}${death >= 0.005 ? `, death ${pct1(death)}` : ''} a man</small></div>
      <div><span>Calls for</span><b class="calls">${stat}</b><small>${suits}</small></div>
    </div>
    <div class="outcomes">
      <div><b class="good">If it goes well</b> ${c.pay} denarii, ${PATRONS[c.patron].name.replace(/^The /, 'the ')} favour +${c.favor}${D.fame ? `, fame +${contractFame(D)}` : ''}.${D.trait ? ` A man may come home ${TRAITS[D.trait].name.toLowerCase()}: ${TRAITS[D.trait].desc.replace(/\.$/, '').replace(/^./, ch => ch.toLowerCase())}.` : ''}${D.feud ? ' It will make an enemy among the rival houses.' : ''}</div>
      <div><b class="bad">If it goes badly</b> No pay, and favour -${lose}.${D.danger >= 0.5 ? ' On work this dangerous a man may not come home.' : ''}</div>
      <div class="dim">Either way they learn on the road as if they had trained, and come home tired.</div>
    </div>
    <div class="termrow"><span class="lbl"${tip('The terms your men go on. Choose before you send them.')}>Terms</span>${termChips}<small>${termLine}</small></div>
    <div class="sendhead"><span>Send ${c.size === 1 ? 'one man' : c.size + ' men'}, best suited first</span>
      ${best ? `<button class="mini" data-act="cbest" data-v="${c.id}" ${isBest ? 'disabled' : ''}${tip('Choose whoever gives the best chance together, of the men free to go. Key: B')}>${isBest ? 'Best chosen' : `Pick the best &middot; ${asPct(best.p)}`}</button>` : ''}</div>
    <div>${chips}</div>
    <div class="sendrow">
      <button class="primary" data-act="csend" data-v="${c.id}" ${ready && T.cost <= G.denarii ? '' : 'disabled'}>Send ${ready ? namesOf(men) : ''}</button>
      ${ready ? `<div class="oddsbox"${tip('odds')}><div>Chance of success <b class="num ${p >= 0.5 ? 'good' : 'bad'}">${asPct(p)}</b> <span class="dim">${oddsWord(p).toLowerCase()} &middot; worth about ${Math.round(T.now - T.cost + T.pay * p)} on average</span></div>${oddsBar(p)}</div>`
        : `<span class="dim">${avail.length < c.size ? `It needs ${c.size}, and only ${avail.length} ${avail.length === 1 ? 'is' : 'are'} free.` : `Choose ${c.size - men.length} more.`}</span>`}
    </div>
    ${runners.length ? `<div class="bad" style="font-size:13px;margin-top:4px"${tip('flight')}>${namesOf(runners)} may not come back.</div>` : ''}
  </div>`;
}

// The quests taken from people at the fountain, and who is waiting there now.
function questsHtml() {
  if (typeof errands !== 'function') return '';
  const mine = errands().map(q => { const T = ERRANDS[q.tpl], second = T.type === 'rescue' && q.step === 1, left = Math.max(0, q.until - G.day);
    return prow(`<div class="grow"><span class="t">${T.title(second ? q.mark2 : q.mark)}</span><small>for ${q.giver.name} &middot; ${second ? q.mark2 : q.mark}, ${wildRegion(second ? q.x2 : q.x, second ? q.y2 : q.y)} &middot; danger ${q.tier} of 5 &middot; <span class="${left <= 3 ? 'bad' : ''}">${left} day${left === 1 ? '' : 's'} left</span>${goalHint(T) ? ` &middot; <span class="gold">${goalHint(T)}</span>` : ''}</small></div>
      <span class="end">${q.relic ? `<span class="chip gold"${tip(RELICS[q.relic].note)}>${RELICS[q.relic].name}</span> ` : ''}<b class="gold num">${q.pay}</b></span>`); }).join('');
  const waiting = asksNow().map(q => prow(`<div class="grow"><span class="t">${q.giver.name}</span><small>${GIVERS[q.giver.kind].what}, waiting by the fountain in the square &middot; ${Math.max(1, q.leaves - G.day + 1)} more day${q.leaves - G.day + 1 === 1 ? '' : 's'}</small></div><span class="end"><span class="chip gold">walk to the fountain</span></span>`)).join('');
  const paying = owed().map(q => prow(`<div class="grow"><span class="t good">${q.giver.name} is waiting to pay you</span><small>${ERRANDS[q.tpl].title(q.mark)}: done &middot; at the fountain in the square${ERRANDS[q.tpl].next ? ' &middot; and has more to say' : ''}</small></div><span class="end"><b class="gold num">${q.owedPay}</b></span>`)).join('');
  if (!mine && !waiting && !paying) return '';
  return `<h2${tip('People of the town come to the fountain in the square with work of their own. Click any one of them on the town map to hear what they want. What you take on is marked on the map of the province, out through the east gate; you may have three such matters in hand.')}>Quests <small>${errands().length} of 3 in hand${G.questsDone ? ` &middot; ${G.questsDone} done` : ''}</small> <button class="mini" data-act="quests" style="vertical-align:middle;margin-left:6px">Open the quests window</button></h2><div class="panel list">${paying}${mine}${waiting}</div>`;
}
function viewContracts() {
  const c = keepSel('csel', G.contracts), dg = daysToGames(), free = G.roster.filter(canSend).length, gone = G.roster.filter(g => g.away).length, asked = G.contracts.find(x => x.asked);
  const rows = G.contracts.map(x => {
    const D = CONTRACTS[x.type], b = bestTeam(x);
    return lrow('csel', x.id,
    `<div class="grow"><span class="t">${D.name}${x.asked ? ` <span class="chip gold"${tip('asked')}>Asked by name</span>` : ''}</span>
      <small>${PATRONS[x.patron].name} &middot; ${x.size === 1 ? 'one man' : x.size + ' men'} &middot; ${x.days} day${x.days === 1 ? '' : 's'}${missesGames(x.days) ? ' <span class="bad">over the games</span>' : ''} &middot; <span class="${D.danger >= 0.65 ? 'bad' : ''}">${DANGER_WORD(D.danger).toLowerCase()}</span></small></div>
     <div class="bestodds"${tip(b ? `The best you could send today: ${namesOf(b.men)}.` : 'You have too few men free for this.')}>${b ? `${oddsBar(b.p)}<small>at best ${asPct(b.p)}</small>` : '<small class="bad">too few free</small>'}</div>
     <span class="end"><b class="gold num">${x.pay}</b></span>`); }).join('')
    || '<div class="listnote">Nobody in town has work for your men today. New offers come with each games day.</div>';
  const away = G.jobs.map(J => { const len = Math.max(1, J.end - J.start); return prow(`<div class="grow"><span class="t">${jobTitle(J)}</span><small>${J.kind === 'quest' ? 'a journey of his own' : `${PATRONS[J.patron].name} &middot; ${J.pay} denarii if it goes well`} &middot; back ${backWhen(J)}</small></div>
      <div class="bestodds"${tip(`Day ${Math.min(len, G.day - J.start)} of ${len}.`)}>${bar('prog', G.day - J.start, len)}</div>
      <span class="end">${jobMen(J).map(g => `<span class="chip pick" data-act="dossier" data-v="${g.id}">${g.name}</span>`).join('')}</span>`); }).join('')
    || '<div class="listnote">Every man is in the yard.</div>';
  const waiting = G.roster.filter(g => g.quest && QUESTS[g.quest.id]).map(g => prow(`<div class="grow"><span class="t">${QUESTS[g.quest.id].name}</span><small>${questWhere(g)} &middot; take the school there</small></div>
      <span class="end"><span class="chip pick" data-act="dossier" data-v="${g.id}">${g.name}</span></span>`)).join('');
  return `<div class="fill even">
    <div><h2>Work on offer <small>until the next games</small></h2>
      <div class="panel schoolbar"><div class="tally">
        <span class="${free ? '' : 'bad'}"><b class="num">${free}</b> free to send</span>
        ${gone ? `<span class="gold"><b class="num">${gone}</b> away</span>` : ''}
        <span${tip('The board is cleared and filled again every games day.')}>new offers ${dg === 0 ? '<b>today</b>' : `in <b class="num">${dg}</b> day${dg === 1 ? '' : 's'}`}</span>
        ${asked ? `<span class="gold"${tip('asked')}>${PATRONS[asked.patron].name} asks for you by name</span>` : ''}
        ${bountyLive() ? `<span class="gold"${tip(`The Magistrate pays ${G.bounty.pay} denarii for ${G.bounty.name}, last seen in ${G.bounty.region}, out through the east gate. It is marked on the map of the province, danger ${G.bounty.tier} of 5, and stands for ${G.bounty.until - G.day} more day${G.bounty.until - G.day === 1 ? '' : 's'}. Take the school there.`)}>bounty: <b class="num">${G.bounty.pay}</b> for ${G.bounty.name}</span>` : ''}
        <span${tip(`What the town thinks of your house's work away from the sand: ${Math.round(workRep())} of 100. Good service raises it; failures and men called home lower it. It adds ${Math.round((workPay(workRep()) - 1) * 100)}% to what every contract pays. At Reliable (35) the board carries one more offer, and at First choice (85) another.`)}>name for work <b class="${workRep() >= 35 ? 'gold' : ''}">${workWord(workRep())}</b>${workRep() >= 1 ? ` <small class="num">+${Math.round((workPay(workRep()) - 1) * 100)}% pay</small>` : ''}</span></div>
        ${(why => `<button class="mini" data-act="caround" ${why ? 'disabled' : ''}${tip(`A few coins in the right taverns turn up one more piece of work. Once between games.${why ? '\n' + why : ''}`)}>Ask around &mdash; ${askAroundCost()}</button>`)(askAroundBlock())}</div>
      <div class="pane" data-pane="offers"><div class="panel list">${rows}</div>
        <h2>Away from the ludus</h2><div class="panel list">${away}</div>
        ${waiting ? `<h2>Journeys promised</h2><div class="panel list">${waiting}</div>` : ''}
        ${questsHtml()}
        ${G.contracts.length + G.jobs.length < 6 ? '<div class="listnote">Contracts pay about a third of what the same men would win at the games, teach a man almost nothing, tire him, and are little talked of. Men who are away do not fight in games held while they are gone.</div>' : ''}</div></div>
    <div><h2>${c ? 'The offer' : 'Contracts'}</h2><div class="pane" data-pane="offer">${c ? contractCard(c) : ''}</div></div>
  </div>`;
}

// A fighter's own journey, in his dossier: what you promised him, and where it is.
// Out in the province, a man's promised journey can be set out for from wherever it is named: the way is laid to the
// place, by the roads. (Nothing in the town: there is no column to send.)
function journeyGo(g, label) {
  if (!G.field || !g.quest || !QUESTS[g.quest.id] || g.away || typeof questMarkId !== 'function') return '';
  const id = questMarkId(g), st = siteById(id); if (!st) return '';
  return `<button class="mini primary jgo" data-act="questgo" data-v="${id}"${tip(`Sets the column on the road to ${questWhere(g)}: ${wayTo(st.x, st.y)}. You can still steer away, or click elsewhere, to change your mind.`)}>${label || 'Set out'}</button>`;
}
function questBlock(g) {
  if (!g.quest || !QUESTS[g.quest.id]) return '';
  const Q = QUESTS[g.quest.id], waited = G.day - g.quest.since;
  return `<hr class="sep"><div${tip('quest')}><b class="gold">${Q.name}</b></div>
    <div style="font-size:13px">You gave him your word. The place is ${questWhere(g)}, out through the east gate; it is marked on the map of the province. Take the whole school there, and him with it.${g.quest.heard ? ' He has told you what it is, by the fire: you know what it will take.' : ''}${waited >= 10 ? ` <span class="bad">He has waited ${waited} days.</span>` : ''}</div>${journeyGo(g, 'Set out for it') ? `<div class="row" style="margin-top:6px">${journeyGo(g, 'Set out for it')}</div>` : ''}`;
}

// What came of the outings that ended this morning.
function showReports() {
  if (!G.reports || !G.reports.length) return;
  G.reports.splice(0).forEach(r => showModal(`<h2>${r.title}</h2>${r.html}${okBtn()}`));
  SFX.ui('gate');
  save();
}

const bestBoutTeam = b => bestTeamOf(b);
// A line on how a bout went.
function boutResLine(r) {
  return `<b class="${r.win ? 'good' : 'bad'}">${r.win ? 'Won' : 'Lost'}</b>${r.purse ? ` &middot; <span class="gold num">+${r.purse}</span>` : ''}${r.fame ? ` &middot; <span class="num">+${r.fame} fame</span>` : ''}${r.bet ? ` &middot; <span class="num ${r.bet > 0 ? 'gold' : 'bad'}">wager ${r.bet > 0 ? '+' : '&minus;'}${Math.abs(r.bet)}</span>` : ''}`;
}
// What a card came to, in a few words.
function cardLine(s) {
  return `<b class="num">${s.w}</b> won, <b class="num">${s.l}</b> lost &middot; <span class="gold num">${s.purse + s.bet >= 0 ? '+' : '&minus;'}${Math.abs(s.purse + s.bet)}</span> denarii &middot; <span class="num">+${s.fame}</span> fame${s.dead ? ` &middot; <span class="bad">${s.dead} dead</span>` : ''}`;
}
// The last games, bout by bout, and the ones before in a line each.
function lastGames() {
  const L = G.cardLog || []; if (!L.length) return '';
  const C = L[0], s = cardSum(C.rows);
  const rows = C.rows.map(r => `<div class="lrow gres" style="cursor:default"><div class="grow"><span class="t">${r.t}${r.death ? ' <span class="chip red">To the death</span>' : ''} <small class="inl">vs ${swatch(r.houseId)}${r.house}</small></span>
      <small>${r.men.join(', ')}${r.dead.length ? ` &middot; <span class="bad">${r.dead.join(' and ')} died</span>` : ''}${r.kills ? ` &middot; ${r.kills} slain` : ''} &middot; the crowd ${r.exc > 55 ? 'roared' : r.exc > 30 ? 'was pleased' : 'was restless'}</small></div><span class="end">${boutResLine(r)}</span></div>`).join('');
  const older = L.slice(1).map(c => `<div class="lrow gres old" style="cursor:default"><div class="grow"><span class="t">Day ${c.day} <small class="inl">${c.arena}</small></span></div><span class="end">${c.rows.length ? cardLine(cardSum(c.rows)) : '<span class="dim">' + (c.away ? 'the school was away' : 'no bout fought') + '</span>'}</span></div>`).join('');
  return `<h2>The last games <small>day ${C.day} &middot; ${C.arena}</small></h2><div class="panel list tight">
    ${C.rows.length ? `<div class="listnote gsum">${cardLine(s)}${C.passed ? ` &middot; <span class="dim">${C.passed} bout${C.passed === 1 ? '' : 's'} let pass</span>` : ''}</div>${rows}` : `<div class="listnote">${C.away ? 'The school was on the road, and the games went on without it.' : 'You sent no one to the sand.'}</div>`}
    ${older}</div>`;
}
const might = g => Math.round(power(g));

function boutCard(b) {
  const D = DIFF[b.diff];
  const kind = ['Duel', 'Pairs', 'Melee', 'Melee', 'Melee'][b.size - 1];
  const them = boutEnemies(b).slice().sort((x, y) => power(y) - power(x)), one = them.length === 1 && !them[0].beast ? them[0] : null;
  const foes = them.map(e => e.beast
    ? `<div class="lrow foe" style="cursor:default"><div class="grow"><span class="t">${e.name}</span><small>a beast: it cannot be reasoned with, and gives no quarter</small></div><span class="end num"${tip('power')}>${might(e)}</span></div>`
    : `<div class="lrow lud foe" style="cursor:default"${tip(`${e.name} carries ${abilitiesOf(e).map(a => a.name).join(', ') || 'no abilities'}.${e.traits.length ? '\n' + e.traits.map(t => TRAITS[t].name + ': ' + TRAITS[t].desc).join('\n') : ''}`)}>
        ${b.houseId ? `<canvas width="48" height="56" style="width:30px;height:35px" data-rportrait="${b.houseId}:${e.id}"></canvas>` : ''}
        <div class="grow"><span class="t">${e.name} ${styleMark(e)} <small class="inl">${RANKS[e.rank] ? RANKS[e.rank].name + ' &middot; ' : ''}${CLASSES[e.cls].name}${e.wins !== undefined ? ` &middot; ${e.wins}W ${e.losses}L` : ''}</small></span>
          <div class="l2"><span class="sks">${STATS.map(k => `<span class="sk">${ic(k)}<b class="num">${e.stats[k]}</b></span>`).join('')}</span><small class="notes">${rivalNote(e)}${vowNote(e)}</small></div></div>
        <span class="end num"${tip('power')}>${might(e)}</span></div>`).join('');
  let body;
  if (b.done) body = b.res ? `<div class="oddsbox foughtbox"><div>${boutResLine(b.res)}</div><small class="dim">${b.res.men.join(', ')} fought it${b.res.dead.length ? `; <span class="bad">${b.res.dead.join(' and ')} did not come back</span>` : ''}.</small></div>` : '<div class="dim">This bout has been fought.</div>';
  else {
    const picks = (ui.picks[b.id] || []).filter(id => byId(id) && boutFit(b, byId(id)));
    ui.picks[b.id] = picks;
    const avail = G.roster.filter(g => boutFit(b, g)).sort((x, y) => power(y) - power(x));
    const elsewhere = id => Object.keys(ui.picks).some(k => +k !== b.id && (ui.picks[k] || []).includes(id));
    const chips = avail.length
      ? avail.map(g => {
        const worn = g.hp < maxHp(g) * 0.7 || g.fatigue > 60;
        return `<span class="chip pick ${picks.includes(g.id) ? 'on' : ''} ${worn ? 'red' : ''}" data-act="pick" data-v="${b.id}" data-w="${g.id}"${tip(`${g.name}: might ${might(g)}. Health ${Math.round(g.hp)} of ${maxHp(g)}, fatigue ${Math.round(g.fatigue)}, spirits ${Math.round(g.morale)}.${worn ? '\nHe is not at his best today.' : ''}${elsewhere(g.id) ? '\nHe is down for another bout: choosing him here takes him out of it.' : ''}`)}>${g.name} <span class="num">${might(g)}</span>${one ? edgeMark(g, one) : ''}${elsewhere(g.id) ? ' <small>busy</small>' : ''}</span>`;
      }).join('')
      : `<span class="dim">${b.defence ? `${G.title.name} cannot fight today. If he does not appear, the title is forfeit.` : b.novice ? 'You have no Tiro or Gregarius fit to fight.' : b.style ? `You have no one fit who fights in the ${STAT_NAMES[b.style].toLowerCase()} style.` : 'No one is fit to fight.'}</span>`;
    const mine = picks.map(byId);
    const odds = winOdds(mine, boutEnemies(b));
    const ready = picks.length === b.size, best = bestBoutTeam(b), isBest = ready && best && Math.abs(best.p - odds.p) < 0.001;
    const wager = Math.min(ui.wagers[b.id] || 0, Math.max(0, G.denarii));
    const wopts = [0, 25, 50, 100, 250, 500].filter(w => w <= Math.max(0, G.denarii))
      .map(w => `<button class="mini ${w === wager ? 'on' : ''}" data-act="wagerset" data-v="${b.id}" data-w="${w}">${w || 'None'}</button>`).join('');
    const sums = `${mine.reduce((n, g) => n + might(g), 0)} against ${them.reduce((n, e) => n + might(e), 0)}`;
    const wk = (ui.wkind = ui.wkind || {})[b.id] || 'win', W = WAGER_KINDS[wk], wpay = Math.round(odds.pay * W.mult * 10) / 10;
    const kinds = Object.keys(WAGER_KINDS).map(k => `<button class="mini ${k === wk ? 'on' : ''}" data-act="wkind" data-v="${b.id}" data-w="${k}"${tip(WAGER_KINDS[k].what)}>${WAGER_KINDS[k].name}</button>`).join('');
    const sb = stakesBlock(b), armed = ui.stakeArm === b.id;
    body = `<div class="sendhead"><span>${b.defence ? 'Only the champion may answer' : b.novice ? 'Send a Tiro or a Gregarius' : b.style ? `Send a man who fights in the ${STAT_NAMES[b.style].toLowerCase()} style` : `Send ${b.size === 1 ? 'one fighter' : b.size + ' fighters'}, strongest first`}</span>
        ${best ? `<button class="mini" data-act="bbest" data-v="${b.id}" ${isBest ? 'disabled' : ''}${tip('Choose whoever gives the best chance here, of the men fit to fight. Key: B')}>${isBest ? 'Best chosen' : `Pick the best &middot; ${asPct(best.p)}`}</button>` : ''}</div>
      <div style="margin:5px 0">${chips}</div>
      ${ready ? `<div class="oddsbox"${tip('The bookmakers\' reckoning: each side\'s might, and whose style beats whose. The fight itself is not decided by it.')}><div>Chance of victory <b class="num ${odds.p >= 0.5 ? 'good' : 'bad'}">${asPct(odds.p)}</b> <span class="dim">might ${sums}</span></div>${oddsBar(odds.p)}</div>`
        : `<div class="dim" style="font-size:13px">${avail.length < b.size ? `It needs ${b.size}, and only ${avail.length} ${avail.length === 1 ? 'is' : 'are'} fit to fight.` : `Choose ${b.size - picks.length} more.`}</div>`}
      <div class="wagerrow"><span class="lbl"${tip('wager')}>Wager</span><div class="acts mini">${wopts}</div><div class="acts mini kinds"${tip('What you are betting will happen. The harder it is, the more it pays.')}>${kinds}</div></div>
      <div class="row" style="margin-top:6px"><button class="primary" data-act="fight" data-v="${b.id}" ${ready ? '' : 'disabled'}${tip('Key: Enter')}>To the sand</button>
        ${sb ? '' : `<button class="mini ${armed ? 'primary' : ''}" data-act="stakes" data-v="${b.id}"${tip('Offer to fight it sine missione, to the death: the purse rises by 30% and the fame by 40%, and a man who falls will not be spared, yours or theirs. It cannot be taken back, and the other house will remember it.')}>${armed ? 'Sure? To the death' : 'Raise the stakes'}</button>`}
        <small class="wagernote dim">${ready ? (wager ? `pays <b class="gold num">${Math.round(wager * wpay)}</b> at x${wpay} ${wk === 'win' ? 'if you win' : wk === 'clean' ? 'if you win barely touched' : `if you win inside ${SWIFT_TIME} seconds`}, and is lost otherwise` : `the bookmakers pay x${wpay} on you${wk === 'win' ? '' : ', ' + W.name.toLowerCase()}`) : ''}</small></div>`;
  }
  const H = b.houseId && houseOf(b.houseId), above = H && H.prestige > G.fame;
  return `<div class="panel bout ${b.done ? 'done' : ''} ${them.length > 2 || (b.death && them.length > 1) ? 'many' : ''}">
    <h3${tip('bout')}>${boutTitle(b)} <small>vs ${swatch(b.houseId)}${b.house}</small></h3>
    ${b.death ? `<div class="death">${b.funeral ? 'Funeral games: ' : b.captive ? 'The triumph: ' : b.raised ? 'At your asking: ' : ''}Sine missione &mdash; to the death</div>` : ''}
    ${b.hunt ? '<div class="death">Beasts give no quarter</div>' : ''}
    ${b.final ? `<div class="death"${tip(`Win, and the campaign is won. Lose, and ${FINAL_LOSS} fame is lost and no summons comes for ${FINAL_WAIT} days: it is not a thing to try before the school is ready.`)}>Lose before the Emperor: ${FINAL_LOSS} fame gone, and no summons for ${FINAL_WAIT} days</div>` : ''}
    <div class="kvs three">
      <div${tip('purse')}><span>Purse</span><b class="num gold">${b.purse}</b><small>if you win</small></div>
      <div><span>Fame</span><b class="num">+${b.fame}</b><small>${above ? 'more for beating a greater house' : 'and more for a good show'}</small></div>
      <div><span>Against</span><b class="num">${them.length}</b><small>${b.style ? `${STAT_NAMES[b.style].toLowerCase()} fighters only` : b.captive ? 'with nothing left to lose' : b.defence ? `${G.title ? G.title.name : 'your man'}'s title is staked` : b.title ? 'beat him and the title is yours' : b.novice ? 'a Tiro or a Gregarius only' : b.grudge ? 'win or lose, the feud cools' : b.called ? 'you called them out: do not fail to appear' : H && H.grudge >= 25 ? feudWord(H.grudge).toLowerCase() + ' between you' : them.length === 1 ? 'a single opponent' : 'on their side'}</small></div>
    </div>
    <div class="list foelist ${them.length > 2 ? 'tight3' : ''} ${them.length > 2 ? 'grid2' : ''}">${foes}</div>
    ${body}
  </div>`;
}


function viewArena() {
  const t = tier(), dg = daysToGames();
  const road = `<div class="strip"${tip('fame')}>${TIERS.map((x, i) => `<span class="${i === t ? 'cur' : i < t ? 'past' : ''}">${x.name} <b class="num">${x.fame}</b></span>`).join('&rsaquo;')}&rsaquo;<span class="${G.fame >= FINAL_FAME ? 'cur' : ''}">The Emperor's Games <b class="num">${FINAL_FAME}</b></span></div>`;
  if (!G.bouts) {
    // between games: who will be ready when they come
    const ready = G.roster.map(g => {
      const J = jobOf(g), back = J ? J.end - G.day : 0;
      const [word, cls] = J ? (back <= dg ? [`away, back in ${back} day${back === 1 ? '' : 's'}`, 'gold'] : ['away over the games', 'bad'])
        : g.injury > dg ? [`injured: ${g.injury} days, he will miss them`, 'bad'] : g.injury > 0 ? [`injured: ${g.injury} day${g.injury === 1 ? '' : 's'}, healed in time`, 'gold']
        : g.fatigue > 60 ? ['tired: rest him before the day', 'bad'] : g.hp < maxHp(g) * 0.7 ? ['hurt: rest will mend him', 'gold'] : ['ready', 'good'];
      return prow(`<div class="grow"><span class="t">${g.name} ${styleMark(g)} <small class="inl">${CLASSES[g.cls].name} &middot; might ${might(g)}</small></span></div><span class="end ${cls}">${word}</span>`);
    }).join('');
    return `<div class="fill even">
    <div><h2>The arena is quiet</h2><div class="pane">${road}<div class="panel">The next games are in <b>${dg}</b> ${dg === 1 ? 'day' : 'days'}. Train, rest and arm your fighters until then.</div>
      <h2>Who will be ready <small>as things stand</small></h2><div class="panel list tight">${ready || '<div class="listnote">You have no fighters.</div>'}</div>${lastGames()}</div></div>
    <div><h2>The road to Rome</h2><div class="pane">${festivalNote()}${arenaStandings()}<div class="panel dim" style="font-size:13px"${tip('The fame of a bout grows with the excitement of the crowd, and beating a house that stands above you earns more.')}>Fame opens greater arenas, with richer purses and deadlier opponents. You have <b class="num">${G.fame}</b>${G.fame < FINAL_FAME ? `; reach ${FINAL_FAME} to be summoned before the Emperor` : ''}.</div></div></div>
  </div>`;
  }
  const items = (G.tourney ? [{ id: 'lists' }] : []).concat(G.bouts);
  let cur = keepSel('bsel', items);
  if (cur && cur.done && G.bouts.some(b => !b.done)) { cur = G.bouts.find(b => !b.done); ui.bsel = cur.id; }   // move on to the next bout still to fight
  const rows = items.map(b => {
    if (b.id === 'lists') return lrow('bsel', 'lists', `<div class="grow"><span class="t gold">The lists</span><small>${FESTIVALS.tourney.name} &middot; eight fighters, three rounds</small></div>`);
    const bt = b.done ? null : bestBoutTeam(b), chosen = (ui.picks[b.id] || []).map(byId).filter(Boolean);
    return lrow('bsel', b.id, `<div class="grow"><span class="t ${b.title ? 'gold' : ''}">${boutTitle(b)}${b.death || b.hunt ? ' <span class="chip red">To the death</span>' : ''}${b.fest ? ` <span class="chip gold"${tip('One of the festival\'s own bouts: winning it counts towards the festival crown.')}>Festival</span>` : ''}</span>
        <small>vs ${swatch(b.houseId)}${b.house} &middot; might ${boutEnemies(b).map(might).join(' + ')}${chosen.length ? ` &middot; <span class="gold">${namesOf(chosen)}</span>` : ''}</small></div>
        ${b.done ? '' : `<div class="bestodds"${tip(bt ? `The best you could send: ${namesOf(bt.men)}.` : 'You have too few men fit to fight this.')}>${bt ? `${oddsBar(bt.p)}<small>at best ${asPct(bt.p)}</small>` : '<small class="bad">too few fit</small>'}</div>`}
        <span class="end">${b.done ? (b.res ? boutResLine(b.res) : '<span class="dim">fought</span>') : `<b class="gold num">${b.purse}</b> <span class="num dim">+${b.fame}</span>`}</span>`, b.done ? 'done' : '');
  }).join('');
  const left = G.bouts.filter(b => !b.done), fit = G.roster.filter(canFight).length, purse = left.reduce((n, b) => n + b.purse, 0);
  const fought = G.bouts.filter(b => b.res).map(b => b.res), CP = left.length ? cardPlan() : null;
  const planned = CP ? Object.keys(CP.plan) : [], same = CP && left.every(b => (CP.plan[b.id] || []).slice().sort().join() === (ui.picks[b.id] || []).slice().sort().join());
  const anyPick = left.some(b => (ui.picks[b.id] || []).length);
  return `<div class="fill even">
    <div><h2>Today's games</h2>
      <div class="panel schoolbar"><div class="tally">
        <span class="${left.length ? 'gold' : ''}"><b class="num">${left.length}</b> bout${left.length === 1 ? '' : 's'} to fight</span>
        <span class="${fit ? '' : 'bad'}"${tip('A man fights once a day. Whoever has fought, is hurt or is away cannot be sent.')}><b class="num">${fit}</b> fit to fight</span>
        ${left.length ? `<span${tip('purse')}><b class="num">${purse}</b> in purses still to win</span>` : '<span>the day is done: end it when you are ready</span>'}
        ${(G.streak || 0) >= 2 ? `<span class="gold"${tip(`A run of victories draws the crowd: each win in a row adds 2% to the fame of the next, up to 20%. A defeat ends it. Your longest run is ${G.bestStreak || 0}.`)}><b class="num">${G.streak}</b> won running &middot; +${Math.round(streakBonus() * 100)}% fame</span>` : ''}
        ${titleYours() ? `<span class="gold"${tip('Your man holds the championship. While he does, every victory of the school earns a tenth more fame, and a challenger comes for the title each games day. If he does not appear, it is forfeit.')}>${G.title.name} is champion</span>` : ''}
        ${G.fix ? '<span class="bad"><b>You have agreed to lose your next bout.</b></span>' : ''}
        ${fought.length ? `<span class="sofar"${tip('What the day has brought so far: purses and wagers together, and the fame won.')}>so far ${cardLine(cardSum(fought))}</span>` : ''}</div>
        ${left.length > 1 ? `<div class="acts mini"><button class="mini" data-act="bfill" ${planned.length && !same ? '' : 'disabled'}${tip(planned.length ? `Name men for ${planned.length === left.length ? 'every bout' : planned.length + ' of the ' + left.length + ' bouts'} at once: the hardest bouts get first call, and nobody is sent twice.${CP.skipped.length ? '\nA bout your best men would most likely lose is left for you to judge.' : ''} Key: F` : 'No bout here that your men could be sent to with a fair chance.')}>${same && planned.length ? 'Card filled' : 'Fill the card'}</button>${anyPick ? `<button class="mini" data-act="bclear"${tip('Take every man off the card and start again.')}>Clear</button>` : ''}</div>` : ''}</div>
      <div class="pane" data-pane="bouts">${road}<div class="panel list ${items.length > 8 ? 'longcard oneline' : items.length > 6 ? 'longcard' : ''}">${rows}</div></div></div>
    <div><h2>${cur && cur.id === 'lists' ? 'The tournament' : 'The bout'}</h2><div class="pane" data-pane="bout">${festivalNote(true)}${cur ? (cur.id === 'lists' ? tourneyPanel() : boutCard(cur)) : ''}</div></div>
  </div>`;
}

// The school's record, who holds the title, and the best in the province.
function arenaStandings() {
  const T = G.title, holder = titleHolder(), W = G.tally.wins, L = G.tally.losses;
  const ranks = arenaRanks(7).map((x, n) => `<div class="rankrow ${x.h === null ? 'yours' : ''}"><b class="num">${n + 1}</b><span class="nm">${x.h === null ? '' : swatch(x.h)}${x.g.name}${holder === x.g ? ` <span class="chip gold"${tip('He holds the championship of the arena.')}>Champion</span>` : ''}</span><small>${x.h === null ? 'yours' : houseDef(x.h).name}</small><small class="num">${x.g.wins || 0}W ${x.g.losses || 0}L</small><b class="num"${tip('power')}>${might(x.g)}</b></div>`).join('');
  return `<div class="panel standings"><div class="kvs three">
      <div><span>Record</span><b class="num">${W}&ndash;${L}</b><small${tip(`Festival crowns held by the house: ${Object.keys(G.trophies || {}).map(k => `${FESTIVALS[k].name} \u00d7${G.trophies[k]}`).join(', ') || 'none yet'}. Each adds 2% to the fame of every bout, up to 20%.`)}>${W + L ? Math.round(W / (W + L) * 100) + '%' + (trophies() ? '' : ' won') : 'no bout fought yet'}${trophies() ? ` &middot; <i class="gold" style="font-style:normal">${trophies()} crown${trophies() === 1 ? '' : 's'}</i>` : ''}</small></div>
      <div${tip('Each win in a row adds 2% to the fame of the next, up to 20%. A defeat ends the run.')}><span>Won running</span><b class="num ${(G.streak || 0) >= 2 ? 'gold' : ''}">${G.streak || 0}</b><small>longest ${G.bestStreak || 0}</small></div>
      <div${tip('From the second arena up there is a champion. Beat him in the title bout and your man holds it: a tenth more fame for every victory, and a challenger to face each games day.')}><span>Champion</span><b class="${T && T.house === null ? 'gold' : ''}" style="font-size:15px">${holder ? holder.name : '&mdash;'}</b><small>${!holder ? (tier() < 1 ? 'the pits crown no one' : 'the title stands empty') : T.house === null ? `yours &middot; ${T.defences} defence${T.defences === 1 ? '' : 's'}` : houseDef(T.house).name}</small></div>
    </div>
    <div class="sendhead"><span>The best in the province</span></div><div class="ranks">${ranks}</div></div>`;
}

// What the dealer is asking against what the man is worth: only a scout can tell you.
function dealOf(m) {
  const r = m.price / Math.max(1, value(m) + (m.gear && m.gear.weapon ? itemPrice(m.gear.weapon) * 0.6 : 0));
  return r < 1.07 ? ['good', 'Fair price', 'Your scout says the dealer is asking little more than he is worth.'] : r > 1.17 ? ['bad', 'Dear', 'Your scout says the dealer is asking well over what he is worth.'] : null;
}
// Why he cannot be bought, or nothing.
function buyBlock(m) {
  return G.roster.length >= capacity() ? 'No cell free: build more barracks at the Ludus, or sell a man.' : G.denarii < m.price ? `You are ${m.price - G.denarii} denarii short.` : '';
}
// How he would sit among the men you have.
function fitNotes(m) {
  const mine = G.roster, out = [], st = styleOf(m);
  if (!mine.length) return ['He would be your first fighter.'];
  const weaker = mine.filter(g => rating(g) < rating(m)).length;
  out.push(weaker === mine.length ? '<b class="good">Stronger than every man you have.</b>' : weaker ? `Stronger than ${weaker} of your ${mine.length}.` : `Weaker than every man you have${mine.length === 1 ? '' : ' today'}.`);
  const same = mine.filter(g => g.cls === m.cls).length;
  out.push(same ? `You have ${same} ${CLASSES[m.cls].name}${same === 1 ? '' : ' fighters'} already.` : `<b class="good">Your first ${CLASSES[m.cls].name}.</b>`);
  if (st) {
    const n = mine.filter(g => styleOf(g) === st).length, by = mine.filter(g => styleOf(g) === STYLE_LOSES[st]).length;
    out.push(n ? `${n} of your men ${n === 1 ? 'fights' : 'fight'} in the ${STAT_NAMES[st].toLowerCase()} style too.` : `<b class="good">No one of yours fights in the ${STAT_NAMES[st].toLowerCase()} style</b>: he would answer ${STAT_NAMES[STYLE_BEATS[st]].toLowerCase()} fighters${by ? '' : ', whom nobody of yours beats'}.`);
  }
  return out;
}

function viewMarket() {
  const A = G.auction && !G.auction.won ? G.auction : null, lot = A && !A.done ? A.g : null;
  const full = G.roster.length >= capacity(), g = keepSel('msel', (lot ? [lot] : []).concat(G.market)), scout = staffLvl('scout'), dg = daysToGames(), free = capacity() - G.roster.length;
  const bgChip = m => m.bg && BACKGROUNDS[m.bg] && BACKGROUNDS[m.bg].name ? `<span class="chip"${tip(BACKGROUNDS[m.bg].desc)}>${BACKGROUNDS[m.bg].name}</span>` : '';
  const skills = m => STATS.map(k => `<span class="sk"${tip(`${STAT_NAMES[k]} ${m.stats[k]}`)}>${ic(k)}<b class="num">${m.stats[k]}</b></span>`).join('');
  const rows = G.market.map(m => {
    const deal = scout ? dealOf(m) : null, why = buyBlock(m);
    return lrow('msel', m.id, `<canvas width="48" height="56" style="width:34px;height:40px" data-mportrait="${m.id}"></canvas>
      <div class="grow"><span class="t">${m.name} ${styleMark(m)} <small class="inl">${CLASSES[m.cls].name} of ${m.origin}</small></span>
        <div class="l2"><span class="sks"${tip('rating')}><b class="num pw"><span class="sr">power </span>${rating(m)}</b>${skills(m)}</span>${bgChip(m)}${m.held ? `<span class="chip gold"${tip('You have paid the dealer to keep him for you past the next games.')}>Held</span>` : m.kept ? `<span class="chip gold"${tip('Kept back for you from the last market. He goes at the next games if you do not buy him.')}>Kept for you</span>` : ''}${m.ordered ? `<span class="chip gold"${tip('The kind of man you sent the dealer for.')}>Sent for</span>` : ''}${m.levy ? `<span class="chip gold"${tip('Taken out of a file of prisoners at a word from the Magistrate, and priced at half. He goes at the next games.')}>From the Magistrate</span>` : ''}${m.spoils ? `<span class="chip gold"${tip('Brought home in the general\'s train and sold off after his triumph: a fifth under the usual price.')}>Spoils</span>` : ''}${scout ? `<span class="chip gold"${tip('talent')}>Potential ${potential(m)}</span>` : ''}${m.gear && m.gear.weapon ? `<span class="chip"${tip('He comes with his own weapon, and it is in the price.')}>Armed</span>` : ''}${m.traits.map(t => `<span class="chip ${TRAITS[t].good ? '' : 'red'}"${tip(TRAITS[t].desc)}>${TRAITS[t].name}</span>`).join('')}${deal ? `<span class="chip ${deal[0] === 'good' ? 'gold' : 'red'}"${tip(deal[2])}>${deal[1]}</span>` : ''}</div></div>
      <span class="end price"${why ? tip(why) : ''}><b class="num ${why ? 'bad' : 'gold'}"><span class="sr">price </span>${m.price}</b><small>${Math.round(m.price / rating(m))} a point</small></span>`, 'lud');
  }).join('') || '<div class="listnote">The dealer has nothing left until the next games.</div>';
  const lotRow = lot ? lrow('msel', lot.id, `<canvas width="48" height="56" style="width:34px;height:40px" data-mportrait="${lot.id}"></canvas>
      <div class="grow"><span class="t gold">${lot.name} ${styleMark(lot)} <small class="inl">${CLASSES[lot.cls].name} of ${lot.origin}</small></span>
        <div class="l2"><span class="sks"><b class="num pw"><span class="sr">power </span>${rating(lot)}</b>${skills(lot)}</span><span class="chip gold">The prize lot</span>${bgChip(lot)}</div></div>
      <span class="end price"><b class="num gold">bid</b><small>against ${houseDef(A.h).name}</small></span>`, 'lud lot') : '';
  const lotNote = A && A.done ? `<div class="listnote bad">${A.g.name}, the prize lot, went to ${houseDef(A.h).name} for ${A.cap}. You bid ${A.bid}.</div>` : '';
  const orders = `<div class="orderrow"><span class="lbl"${tip(`Pay the dealer ${orderCost()} denarii and the first man at the next market will be of the kind you name, and a little better than most. The money is spent whether or not you buy him.`)}>Send for a</span>${G.marketOrder ? `<b class="gold">${CLASSES[G.marketOrder].name}</b> <small class="dim">at the next market</small>` : Object.keys(CLASSES).map(k => `<button class="mini" data-act="morder" data-v="${k}" ${G.denarii < orderCost() ? 'disabled' : ''}>${CLASSES[k].name}</button>`).join('') + `<small class="dim num">${orderCost()}</small>`}</div>`;
  const many = G.roster.length > 6;            // a full barracks is listed three abreast, by name, with the rest on the tip
  const mine = G.roster.map(r => {
    const armed = ui.sellArm === r.id, what = `${CLASSES[r.cls].name}, power ${rating(r)}, ${r.wins}W ${r.losses}L. Worth about ${value(r)}; the dealer pays ${dealer() >= 15 ? 'six parts in ten' : 'half'}.`;
    return many
      ? `<div class="lrow" style="cursor:default"${tip(what)}><div class="grow"><span class="t">${r.name} ${styleMark(r)}</span></div>
          ${r.away ? '<span class="end dim">away</span>' : `<button class="mini ${armed ? 'primary' : ''}" data-act="msell" data-v="${r.id}">${armed ? 'Sure?' : 'Sell'} ${sellPrice(r)}</button>`}</div>`
      : prow(`<div class="grow"><span class="t">${r.name} ${styleMark(r)} <small class="inl">${CLASSES[r.cls].name} &middot; power ${rating(r)} &middot; ${r.wins}W ${r.losses}L</small></span></div>
      ${r.away ? '<span class="end dim">away</span>' : `<button class="mini ${armed ? 'primary' : ''}" data-act="msell" data-v="${r.id}"${tip('sell')}>${armed ? 'Sure? Sell' : 'Sell'} &mdash; ${sellPrice(r)}</button>`}`);
  }).join('');
  const why = g ? buyBlock(g) : '';
  const card = g ? `<div class="panel dossier">
      <div class="dhead">
        <canvas class="portrait" width="96" height="112" data-mportrait="${g.id}"></canvas>
        <div style="flex:1"><h2>${g.name}</h2>
          <div>${CLASSES[g.cls].name} of ${g.origin}</div>
          <div>${ratingLine(g, !scout && !g.tried)} &middot; ${styleMark(g)}</div>
          <div class="num dim" style="font-size:13px">health ${maxHp(g)}${g.gear && g.gear.weapon ? ' &middot; comes with ' + itemTag(g.gear.weapon) : ''}</div>
          ${g === lot ? `<div class="bidrow"><span class="lbl"${tip(`An auction, against ${houseDef(A.h).lanista} of ${houseDef(A.h).name}. You bid once. Bid higher than they are willing to go and he is yours at your price; bid lower and he goes to them, and you will meet him on the sand. Nobody knows how far they will go: somewhere near his worth, perhaps half as much again.`)}>One bid</span>${auctionBids(A).map((b, n) => { const no = auctionBlock(b), armed = ui.bidArm === b; return `<button class="${armed ? 'primary' : ''}" data-act="mbid" data-v="${b}" ${no ? 'disabled' : ''}${tip(no || ['About what he is worth: it will rarely be enough.', 'A quarter over his worth: enough more often than not.', 'Half as much again: nobody will go higher.'][n])}>${armed ? 'Sure? ' : ''}${b}</button>`; }).join('')}</div>
            <small class="dim">Worth about ${A.worth}. ${houseDef(A.h).name} wants him too.${dealer() >= 15 ? ` <span class="gold">The dealer, behind his hand: they will not go much past ${Math.round(A.cap / 25) * 25}.</span>` : ''}</small>`
          : `<div class="buyrow"><button class="primary" data-act="buy" data-v="${g.id}" ${why ? 'disabled' : ''}${tip('Buy him and put him in a cell. Key: B')}>Buy &mdash; ${g.price} denarii</button>
            <button class="mini" data-act="mhaggle" data-v="${g.id}" ${g.haggled ? 'disabled' : ''}${tip(g.haggled ? 'You have had your say on his price.' : `One try a man. About ${Math.round(haggleChance() * 100)} chances in 100 he comes down by 15%; otherwise the price goes up by 5%. A scout and the Guild's favour help.`)}>Haggle</button>
            <button class="mini" data-act="mhold" data-v="${g.id}" ${g.held || g.kept || G.denarii < holdCost(g) ? 'disabled' : ''}${tip(g.held ? 'He is being held for you.' : g.kept ? 'He has been kept back once already.' : `Pay ${holdCost(g)} now, taken off his price, and the dealer keeps him for you through the next market. The deposit is lost if you never buy him.`)}>${g.held ? 'Held' : `Hold &mdash; ${holdCost(g)}`}</button>
            ${scout ? '' : `<button class="mini" data-act="mtry" data-v="${g.id}" ${g.tried || G.denarii < tryCost() ? 'disabled' : ''}${tip(g.tried ? 'He has been tried: his stars are shown below.' : `Pay ${tryCost()} to have him put through his paces against the dealer's man while your doctore watches. It shows how fast he will learn each skill, which you cannot otherwise see without a scout.`)}>${g.tried ? 'Tried' : `Try him &mdash; ${tryCost()}`}</button>`}
            <small class="${why ? 'bad' : 'dim'}">${why || `Leaves you ${G.denarii - g.price}.`}</small></div>`}
          ${ui.mktMsg && ui.mktMsg.id === g.id && ui.mktMsg.day === G.day ? `<div class="dealmsg ${ui.mktMsg.ok ? '' : 'bad'}">${ui.mktMsg.text}</div>` : ''}
        </div>
      </div>
      <div class="dbody" data-pane="recruit">
        <div class="today"><span class="lbl">In your school</span><div>${g.bg && BACKGROUNDS[g.bg] && BACKGROUNDS[g.bg].name ? `<b>${BACKGROUNDS[g.bg].name}.</b> ${BACKGROUNDS[g.bg].desc} ` : ''}${fitNotes(g).join(' ')}${g.wins ? ` He has fought ${g.wins + g.losses} times and won ${g.wins}.` : ''}</div></div>
        ${statRows(g, !scout && !g.tried)}
        ${scout || g.tried ? '' : `<div class="dim" style="font-size:12px;margin-top:2px">The stars are hidden: you cannot judge how fast he will learn without a scout, unless you pay to have him tried.</div>`}
        <hr class="sep">${traitList(g)}<hr class="sep">
        <div class="dim" style="font-size:13px">${CLASSES[g.cls].desc}</div>
        <div class="dim" style="font-size:13px;margin-top:4px">${abilitiesKnown(g).length ? `Knows ${abilitiesKnown(g).map(a => `<b>${a.name}</b>`).join(', ')}.` : 'Knows no abilities yet: a skill at 5 teaches the first.'}</div>
      </div>
    </div>` : '';
  return `<div class="fill even">
    <div><h2>The slave market <small>${G.market.length} for sale</small></h2>
      <div class="panel schoolbar"><div class="tally">
        <span class="${free > 0 ? '' : 'bad'}"${tip('Each man needs a cell. The barracks, improved at the Ludus under The school, add two at a time.')}><b class="num">${Math.max(0, free)}</b> cell${free === 1 ? '' : 's'} free</span>
        <span${tip('denarii')}>purse <b class="num">${G.denarii}</b></span>
        <span${tip('The dealer brings new men every games day, and takes away whoever was not sold.')}>fresh stock ${dg === 0 ? '<b>today</b>' : `in <b class="num">${dg}</b> day${dg === 1 ? '' : 's'}`}</span>
        <span class="${dealer() >= 3 ? 'gold' : ''}"${tip(`What the dealer thinks of your custom: ${dealer()}. Every man you buy from him counts two, and every man you sell him one.\nKnown to him (3): haggling goes your way more often.\nA good customer (8): he brings one more man to every market.\nAn old friend (15): he pays six parts in ten for a man instead of half, and tells you how far the other house will bid for the prize lot.${dealerNext(dealer()) ? `\n${dealerNext(dealer())} more to the next.` : ''}`)}>the dealer: <b>${dealerWord(dealer()).toLowerCase()}</b></span>
        <span class="${scout ? 'gold' : ''}"${tip(scout ? 'Your scout shows each man\'s potential and whether the price is fair.' : TIPS.hidden)}>${scout ? 'scout at your side' : 'no scout: talent hidden'}</span></div></div>
      <div class="pane" data-pane="market"><div class="panel list">${lotRow}${rows}</div>${lotNote}${orders}
      ${mine ? `<h2>Your men <small>what the dealer would pay</small></h2><div class="panel list tight ${many ? 'threeup' : 'twoup'}">${mine}</div>` : ''}</div></div>
    <div><h2>The man</h2>${card}</div>
  </div>`;
}

// Where morale settles on these rations, with the cook and the Temple counted in.
const moraleAt = i => Math.min(100, moraleBase(i));
const grade = n => `<span class="pips" role="img" aria-label="${n} of 3">${'●'.repeat(n)}${'○'.repeat(3 - n)}</span>`;

// The buildings of the school itself are improved at the school; the rest belong to the house.
const SCHOOL_FACS = ['barracks', 'ground', 'infirmary', 'baths'];
function facTile(k) {
  const f = FACILITIES[k], l = G.fac[k] || 0, cost = FAC_COST[l];
  return `<div class="htile"${tip(`${f.desc}\nNow: ${f.effect(l)}.${l < 3 ? `\nNext: ${f.effect(l + 1)}.` : ''}`)}><div class="hh"><b>${f.name}</b>${grade(l)}</div>
      <small>${f.effect(l)}.</small>
      ${l < 3 ? `<button class="mini" data-act="build" data-v="${k}" ${G.denarii < cost ? 'disabled' : ''}>Improve &mdash; ${cost}</button>` : '<span class="done">Fully built</span>'}</div>`;
}
// Buildings that stand somewhere else in town, and the post that goes with the forge.
const ELSEWHERE_FACS = { shrine: 'Patrons', stables: 'Stables', eagle: 'Stables' }, SMITH_POSTS = ['faber'];
function facButton(k) {
  const f = FACILITIES[k], l = G.fac[k] || 0, cost = FAC_COST[l], short = l < 3 && G.denarii < cost;
  return `<button class="mini facbtn" data-act="build" data-v="${k}" ${l >= 3 || short ? 'disabled' : ''}${tip(`${f.name}: ${f.desc}\nNow: ${f.effect(l)}.${l < 3 ? `\nNext, for ${cost} denarii: ${f.effect(l + 1)}.${short ? `\nYou are ${cost - G.denarii} denarii short.` : ''}` : '\nFully built.'}`)}>${f.name.split(' ')[0]} ${grade(l)}${l < 3 ? ` &mdash; ${cost}` : ''}</button>`;
}
// The armourer's post, kept at the forge: who holds it, or who would take it.
function armourerRow() {
  const k = 'faber', r = STAFF_ROLES[k], st = G.staff[k], armed = ui.fireArm === k;
  const offers = G.hires.filter(h => h.role === k).map(h => {
    const better = st && h.skill > st.skill, worse = st && h.skill < st.skill;
    return `<button class="mini ${worse ? '' : 'primary'}" data-act="hire" data-v="${h.id}" ${G.denarii < h.fee ? 'disabled' : ''}${tip(`${h.name}, ${STAFF_GRADES[h.skill].toLowerCase()}: ${r.desc(h.skill)}\n${h.fee} denarii now and ${h.wage} a day.${st ? `\n${better ? 'Better' : worse ? 'Worse' : 'No better'} than ${st.name}.` : ''}`)}>${st ? 'Replace with' : 'Hire'} ${h.name} ${grade(h.skill)} &mdash; ${h.fee}</button>`;
  }).join('');
  return `<div class="workrow" style="margin-top:4px"><span class="lbl"${tip(`A man of your own at the forge. ${r.desc(1)} A better one does more.`)}>Armourer</span>
    ${st ? `<span${tip(r.desc(st.skill))}><b>${st.name}</b> ${grade(st.skill)} <small class="dim num">${st.wage ? st.wage + ' a day' : 'no wage'}</small></span><button class="mini ${armed ? 'primary' : ''}" data-act="fire" data-v="${k}"${tip('Dismissing him saves his wage, but the fee you paid is gone and the post stands empty.')}>${armed ? 'Sure?' : 'Dismiss'}</button>` : ''}
    ${offers || (st ? '' : '<small class="dim">post vacant, and no one is asking for it: new faces come every games day</small>')}</div>`;
}
const regimenButtons = () => REGIMENS.map((r, i) => `<button class="ration ${(G.regimen === undefined ? 1 : G.regimen) === i ? 'primary' : ''}" data-act="regimen" data-v="${i}"${tip(`${r.what}\nTraining ${Math.round(r.rate * 100)}% as fast, ${Math.round(r.tire * 100)}% as tiring; morale settles ${r.morale > 0 ? r.morale + ' higher' : r.morale < 0 ? -r.morale + ' lower' : 'where the table puts it'}.`)}><b>${r.name}</b><span>${r.rate === 1 ? 'as usual' : `${r.rate > 1 ? '+' : '&minus;'}${Math.abs(Math.round((r.rate - 1) * 100))}% learning`}</span></button>`).join('');
// The school's own buildings and how hard the men are worked: the other face of the Ludus screen.
function schoolPanel() {
  const free = capacity() - G.roster.length, here = G.roster.filter(g => !g.away), hurt = G.roster.filter(g => g.injury > 0).length;
  const rate = Math.round((1 + 0.2 * G.fac.ground) * (1 + 0.15 * staffLvl('doctore')) * regimen().rate * 100);
  return `<div class="panel schoolbar"><div class="tally">
      <span${tip('denarii')}>purse <b class="num">${G.denarii}</b></span>
      <span class="${free > 0 ? '' : 'bad'}"${tip('Each man needs a cell. The barracks add two at a time.')}><b class="num">${G.roster.length}</b> of <b class="num">${capacity()}</b> cells taken</span>
      <span${tip('The training ground, the doctore and the regimen together, before each man\'s own nature and state.')}>training at <b class="num">${rate}%</b></span>
      <span class="${hurt ? 'bad' : ''}"><b class="num">${hurt}</b> injured</span>
      <span class="${teachers().length ? 'gold' : ''}"${tip(`A ${RANKS[TEACH_RANK].name} or better can be set to teach: men drilling a skill he is clearly better at learn it faster.${teachers().length ? '\nTeaching today: ' + namesOf(teachers()) + '.' : ''}`)}><b class="num">${teachers().length}</b> teaching</span>
      <span${tip('Men left to the doctore are set their work each morning.')}><b class="num">${G.roster.filter(g => g.auto).length}</b> left to the doctore</span></div></div>
    <div class="pane" data-pane="school"><div class="htiles">${SCHOOL_FACS.map(facTile).join('')}</div>
      <h2${tip('How hard the men are worked: it sets how fast they learn, how tired a day\'s drill leaves them, and where their spirits settle.')}>Regimen <small>${here.length} in the yard</small></h2><div class="rations">${regimenButtons()}</div>
      <div class="panel dim" style="font-size:13px;margin-top:10px">These are the school's own walls: cells, the ground the men drill on, and where they are mended and rested. The house across the way keeps the staff, the table and the stores; the shrine is with the Patrons, the stables with the Contracts, and the armourer at the Blacksmith.</div></div>`;
}

function viewFacilities() {
  const dg = daysToGames(), net = stipend() - upkeep(), fed = G.roster.filter(g => !g.away).length;
  // the household: a tile to each post, filled or vacant
  const staff = Object.entries(STAFF_ROLES).filter(([k]) => !SMITH_POSTS.includes(k)).map(([k, r]) => {
    const st = G.staff[k], armed = ui.fireArm === k, offers = G.hires.filter(h => h.role === k).length;
    return st
      ? `<div class="htile"${tip(r.desc(st.skill))}><div class="hh"><b>${r.name}</b>${grade(st.skill)}<span class="end num dim">${st.wage ? st.wage + ' a day' : 'no wage'}</span></div>
          <small>${st.name}, ${STAFF_GRADES[st.skill].toLowerCase()}, ${servedDays(st)} day${servedDays(st) === 1 ? '' : 's'} in the post. ${r.desc(st.skill)}</small>
          <div class="hbtns">${st.skill < 3 ? `<button class="mini ${raiseBlock(k) ? '' : 'primary'}" data-act="raise" data-v="${k}" ${raiseBlock(k) ? 'disabled' : ''}${tip(`Raise him to ${STAFF_GRADES[st.skill + 1].toLowerCase()}: ${r.desc(st.skill + 1)}\nIt costs less than hiring a new man of that grade${st.wage ? `, and his wage goes to ${1 + 2 * (st.skill + 1)} a day` : ''}. A man must have served ${raiseDays(st)} days first.${raiseBlock(k) ? '\n' + raiseBlock(k) : ''}`)}>Raise &mdash; ${raiseCost(st)}</button>` : ''}<button class="mini ${armed ? 'primary' : ''}" data-act="fire" data-v="${k}"${tip('Dismissing him saves his wage, but the fee you paid is gone and the post stands empty.')}>${armed ? 'Sure?' : 'Dismiss'}</button></div></div>`
      : `<div class="htile vacant"${tip(`A journeyman would give: ${r.desc(1)}`)}><div class="hh"><b>${r.name}</b><span class="end ${offers ? 'gold' : 'dim'}">${offers ? 'one in the hall' : 'post vacant'}</span></div>
          <small>${r.desc(1)}</small>
          ${offers ? '' : `<div class="hbtns"><button class="mini" data-act="seek" data-v="${k}" ${seekBlock(k) ? 'disabled' : ''}${tip(`Send word round the taverns: a ${r.name.toLowerCase()} will be in the hall at the next games, and as good a one as this town has. The money is spent whether or not you hire him. One such errand at a time.${seekBlock(k) ? '\n' + seekBlock(k) : ''}`)}>${G.hireOrder === k ? 'Sent for' : `Send for one &mdash; ${seekCost()}`}</button></div>`}</div>`;
  }).join('');
  const hallMen = G.hires.filter(h => !SMITH_POSTS.includes(h.role));
  const hall = hallMen.map(h => {
    const cur = G.staff[h.role], better = cur && h.skill > cur.skill, worse = cur && h.skill < cur.skill, dw = cur ? h.wage - cur.wage : h.wage;
    const note = cur ? `${better ? 'Better' : worse ? 'Worse' : 'No better'} than ${cur.name}, your ${STAFF_GRADES[cur.skill].toLowerCase()}; wages ${dw > 0 ? 'rise by ' + dw : dw < 0 ? 'fall by ' + -dw : 'stay the same'}.` : 'Fills an empty post.';
    return `<div class="htile hire"${tip(`${STAFF_ROLES[h.role].desc(h.skill)}\n${note}`)}><div class="hh"><b>${STAFF_ROLES[h.role].name}</b>${grade(h.skill)}<span class="end num dim">${h.wage} a day</span></div>
      <small>${h.name}${h.sought ? ', who came because you sent for him' : ''}. <span class="${cur ? (better ? 'good' : worse ? 'bad' : '') : 'good'}">${note}</span></small>
      <button class="mini ${worse ? '' : 'primary'}" data-act="hire" data-v="${h.id}" ${G.denarii < h.fee ? 'disabled' : ''}>${cur ? 'Replace' : 'Hire'} &mdash; ${h.fee}</button></div>`;
  }).join('') || '<div class="listnote">No one is looking for work.</div>';
  const fac = Object.keys(FACILITIES).filter(k => !SCHOOL_FACS.includes(k) && !ELSEWHERE_FACS[k]).map(facTile).join('');
  const avg = fed ? Math.round(G.roster.filter(g => !g.away).reduce((n, g) => n + g.morale, 0) / fed) : 0;
  const rations = RATIONS.map((r, i) => {
    const each = Math.max(1, r.cost - (boon('grain') ? 1 : 0)), on = G.ration === i;
    return `<button class="ration ${on ? 'primary' : ''}" data-act="ration" data-v="${i}"${tip(`${each} denarii a man each day before any savings. Morale drifts towards ${Math.round(moraleAt(i))}, three points a day.`)}><b>${r.name}</b><span>morale to ${Math.round(moraleAt(i))}</span></button>`;
  }).join('');
  const last = net < 0 ? Math.floor(Math.max(0, G.denarii) / -net) : -1;
  return `<div class="fill even">
    <div><h2>Household <small>the fee once, the wage every day</small></h2>
      <div class="panel schoolbar"><div class="tally">
        <span${tip('denarii')}>purse <b class="num">${G.denarii}</b></span>
        <span class="${net < 0 ? 'bad' : 'good'}"${tip('Food and wages against the Guild stipend, on a day with no games.')}><b class="num">${net > 0 ? '+' : ''}${net}</b> a day</span>
        ${last >= 0 ? `<span class="${last < dg ? 'bad' : ''}"${tip('How long the purse lasts at this rate if nothing comes in. Purses, wagers and contracts are what fill it.')}>purse lasts <b class="num">${last}</b> day${last === 1 ? '' : 's'}</span>` : ''}
        <span${tip('The hiring hall changes its faces every games day.')}>new faces ${dg === 0 ? '<b>today</b>' : `in <b class="num">${dg}</b> day${dg === 1 ? '' : 's'}`}</span></div></div>
      <div class="pane" data-pane="staff">${staffLack() ? `<div class="listnote" style="margin:0 0 6px"><b>Your steward:</b> We have no ${STAFF_ROLES[staffLack()[0]].name.toLowerCase()}, dominus: ${staffLack()[1]}.${G.hireOrder ? ` Word is out for a ${STAFF_ROLES[G.hireOrder].name.toLowerCase()}.` : ''}</div>` : ''}<div class="htiles">${staff}</div>
      <h2>Hiring hall <small>${hallMen.length} looking for a place${hallMen.length < G.hires.length ? ' &middot; an armourer is asking at the Blacksmith' : ''}</small></h2><div class="htiles">${hall}</div></div></div>
    <div><h2>The house <small${tip('The barracks, training ground, infirmary and baths are improved at the Ludus, with the regimen. The shrine is with the Patrons, the stables outside the east gate, and the armourer at the Blacksmith.')}>the rest stands where it is used</small></h2><div class="pane" data-pane="fac"><div class="htiles solo">${fac}</div>
      <h2${tip('rations')}>Rations <small>${fed} at table &middot; morale ${avg}</small></h2><div class="rations">${rations}</div>
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
  const fed = G.roster.filter(g => !g.away).length, each = Math.max(1, RATIONS[G.ration].cost - (boon('grain') ? 1 : 0));
  const cell = v => `<b class="num ${v < 0 ? 'bad' : v > 0 ? 'good' : 'dim'}">${v > 0 ? '+' : ''}${v}</b>`;
  const who = Object.entries(G.staff).filter(([, st]) => st.wage).map(([k, st]) => `${STAFF_ROLES[k].name.toLowerCase()} ${st.wage}`).join(', ');
  const rows = [['Food', `${fed} at table, ${each} each${facLvl('stores') ? `, less ${10 * facLvl('stores')}%` : ''}${G.grainUntil > G.day ? ', at the Guild\'s cost' : ''}`, -foodCost()], ['Wages', who || 'no one on wages', -wages()]];
  if (thrift()) rows.push(['Thrift', 'the dispensator\'s books', thrift()]);
  rows.push(['Guild stipend', `favour ${Math.round(G.patrons.guild)}`, stipend()]);
  // the purse over the last days, as bars
  const P = (G.purseLog || []).slice(-24), hi = Math.max(1, ...P.map(Math.abs));
  const spark = P.length > 1 ? `<div class="spark"${tip(`The purse at each day's end, over the last ${P.length} days: from ${P[0]} to ${P[P.length - 1]}.`)}>${P.map(v => `<i class="${v < 0 ? 'neg' : ''}" style="height:${Math.max(6, Math.round(Math.abs(v) / hi * 100))}%"></i>`).join('')}</div>` : '';
  return `<h2>Daily ledger <small>purses, wagers and gifts come on top</small></h2>
    <div class="panel ledger n${rows.length + 1}">${rows.map(([n, why, v]) => `<div><span>${n}</span> ${cell(v)}<small>${why}</small></div>`).join('')}
      <div class="net"><span>Each day</span> ${cell(stipend() - upkeep())}<small>on a day without games</small></div></div>${spark}`;
}

// How a patron stands towards you, in a word.
const STANDING = [[80, 'Devoted'], [60, 'Trusted'], [35, 'Friendly'], [15, 'Known'], [0, 'A stranger']];
// What each patron gives at a given favour, as lines: [what, whether you have it].
const PATRON_GIVES = {
  magistrate: f => [[`Purses <b class="num">+${Math.round(f * 0.3)}%</b>`, f > 0], ['He sometimes asks for you by name on the contract board', f >= 35], ['You may accuse a rival school before him', f >= 40], ['An extra bout at every games', f >= 60], ['Fame from every bout <b class="num">+10%</b>', f >= 80]],
  guild: f => [[`A stipend of <b class="num">${Math.round(f / 10 * (1 + tier()))}</b> denarii a day`, f >= 5], ['They sometimes ask for you by name on the contract board', f >= 35], ['Wagers won pay <b class="num">a fifth more</b>', f >= 80]],
  temple: f => [[`Morale settles <b class="num">${Math.round(f / 10)}</b> higher`, f >= 5], [`The fallen are spared <b class="num">${Math.round(f * 0.1)}%</b> more often`, f >= 5], ['The priests sometimes ask for you by name on the contract board', f >= 35], ['Wounds from the arena mend a day sooner', f >= 80]],
};
const PATRON_MARKS = { magistrate: [35, 40, 60, 80], guild: [20, 35, 60, 80], temple: [20, 35, 60, 80] };
// What moves each patron, as the rules have it.
const PATRON_WAYS = {
  magistrate: [['good', 'Every bout won (more if to the death), the Laurel Tournament, his contracts, outlaws and bandits handed over.'], ['bad', 'Ducking a grudge bout, staying away from his dinners, failing his contracts.']],
  guild: [['good', 'A win that had the crowd roaring, their contracts, their name on your walls.'], ['bad', 'Winning a bout you were paid to lose, failing or ignoring their contracts.']],
  temple: [['good', 'Offerings when the priests come, their contracts, a pilgrimage.'], ['bad', 'Sending the priests away, failing their contracts.']],
};
// What the next gift would change, in words.
function giftGain(k, f) {
  const to = Math.min(100, f + 10);
  if (k === 'magistrate') return `purses +${Math.round(to * 0.3) - Math.round(f * 0.3)}%${f < 60 && to >= 60 ? ' and the extra bout' : f < 40 && to >= 40 ? ', and you may accuse rivals' : ''}`;
  if (k === 'guild') { const d = Math.round(to / 10 * (1 + tier())) - Math.round(f / 10 * (1 + tier())); return d > 0 ? `${d} more a day, earned back in ${Math.ceil(giftCost(k) / d)} days` : 'nothing more a day yet'; }
  return `morale +${Math.round(to / 10) - Math.round(f / 10)}, the fallen spared ${Math.round(to * 0.1) - Math.round(f * 0.1)}% more`;
}

// What a patron has asked of you, if anything, and how it stands.
function patronRequest() {
  const r = G.request; if (!r) return '';
  const P = PATRONS[r.patron], reward = `Favour +${r.favor}${r.pay ? ` and ${r.pay} denarii` : ''}; left undone, favour &minus;4.`;
  if (r.done) return `<div class="today preq done"><span class="lbl">Asked of you</span><div><b>${P.name}</b> had what was asked. It is remembered.</div></div>`;
  const stale = r.type !== 'tithe' && r.day !== G.day;
  const what = r.type === 'wins' ? `win <b>${r.need}</b> bouts at ${stale ? 'the games just gone' : 'today\'s games'} (<b class="num">${r.got}</b> so far)` : r.type === 'show' ? `win a bout ${stale ? 'at the games just gone' : 'today'} with the crowd on its feet (a crowd at 45 or better over the whole bout)` : r.type === 'stake' ? `put <b class="num">${r.need}</b> denarii or more on a man of your own ${stale ? 'at the games just gone' : 'today'}, and win the wager` : `an offering of <b class="num">${r.cost}</b> denarii before the next games`;
  return `<div class="today preq"><span class="lbl">Asked of you</span><div><b>${P.name}</b> ask${r.patron === 'guild' ? '' : 's'}: ${what}. <span class="dim">${stale ? 'The day has passed: it will be held against you at the next games. ' : ''}${reward}</span>
    ${r.type === 'tithe' ? `<button class="mini primary" data-act="tithe" ${G.denarii < r.cost ? 'disabled' : ''} style="margin-left:6px">Make the offering &mdash; ${r.cost}</button>` : ''}</div></div>`;
}
// What has been granted and is still running.
function patronBoons() {
  const b = [];
  if (G.richCard && G.richCard >= G.day) b.push('a richer card at the next games');
  if (G.grainUntil && G.grainUntil > G.day) b.push(`grain at the Guild's cost for ${G.grainUntil - G.day} more day${G.grainUntil - G.day === 1 ? '' : 's'}`);
  if (G.blessed && G.blessed >= G.day) b.push('the temple\'s blessing on your fallen at the next games');
  if (G.bookUntil && G.bookUntil >= G.day) b.push('the Guild\'s book behind you: wagers won at the next games pay half as much again');
  if (G.rigged && G.rigged >= G.day) b.push('<span class="bad">a bought man at the editor\'s elbow, against you</span>');
  return b.length ? `<div class="today preq"><span class="lbl">In force</span><div>${b.join(' &middot; ')}</div></div>` : '';
}
function viewPatrons() {
  const dg = daysToGames();
  const cards = Object.entries(PATRONS).map(([k, p]) => {
    const f = G.patrons[k], cost = giftCost(k), stand = STANDING.find(x => f >= x[0])[1], next = PATRON_MARKS[k].find(m => m > f);
    const work = (G.contracts || []).filter(c => c.patron === k), asked = work.some(c => c.asked), out = (G.jobs || []).filter(J => J.patron === k).length;
    const gives = PATRON_GIVES[k](f).map(([t, on]) => `<li class="${on ? 'on' : 'off'}">${t}</li>`).join('');
    const why = f >= 100 ? 'Favour could go no higher.' : G.denarii < cost ? `You are ${cost - G.denarii} denarii short.` : '';
    const asks = PETITIONS[k].map(P => { const no = petitionBlock(k, P), armed = ui.petArm === k + ':' + P.id, what = typeof P.desc === 'function' ? P.desc() : P.desc;
      return `<button class="${armed ? 'primary' : ''}" data-act="petition" data-v="${k}" data-w="${P.id}" ${no ? 'disabled' : ''}${tip(`${what}\nIt costs ${P.cost} favour, and wants ${P.need}.${no ? '\n' + no : ''}`)}>${armed ? 'Sure?' : P.name} <small>&minus;${P.cost}</small></button>`; }).join('');
    const said = ui.petMsg && ui.petMsg.k === k && ui.petMsg.day === G.day ? `<div class="dealmsg ${ui.petMsg.ok ? '' : 'bad'}">${ui.petMsg.text}</div>` : '';
    const ways = PATRON_WAYS[k].map(([c, t]) => `${c === 'good' ? 'Pleased by' : 'Angered by'}: ${t}`).join('\n');
    return `<div class="panel patron">
      <h3>${p.name} <small class="${f >= 60 ? 'gold' : f < 15 ? 'dim' : ''}">${stand}</small></h3>
      <div class="dim" style="font-size:13px">${p.desc}</div>
      <div class="favour"${tip('favour')}><span>Favour</span><div class="bar prog"><i style="width:${pct(f, 100)}%"></i>${PATRON_MARKS[k].map(m => `<u class="${f >= m ? 'got' : ''}" style="left:${m}%"></u>`).join('')}</div><b class="num">${Math.round(f)}</b></div>
      <div class="dim" style="font-size:12px">${next ? `${Math.ceil(next - f)} more to the next mark, at ${next}.` : 'Every mark reached.'} One point fades ${dg === 0 ? 'today' : `in ${dg} day${dg === 1 ? '' : 's'}`}.</div>
      <ul class="gives">${gives}<li class="${(G.honoured || {})[k] ? 'on' : 'off'}"${tip('The first time a patron comes to trust your house, at 60 favour, it is marked once with a gift.')}>${(G.honoured || {})[k] ? `Honoured your house on day ${G.honoured[k]}: ${HONOURS[k]}` : `At 60, once: ${HONOURS[k]}`}</li></ul>
      <div class="asks"><span class="lbl"${tip('Spend favour for something now. One petition to each patron between one games and the next.')}>Ask of ${k === 'guild' ? 'them' : k === 'temple' ? 'her' : 'him'}</span>${asks}<span class="moves"${tip(ways)}>what moves ${k === 'guild' ? 'them' : k === 'temple' ? 'her' : 'him'}?</span></div>${said}
      <div class="work ${asked ? 'gold' : 'dim'}">${work.length ? `${work.length} offer${work.length === 1 ? '' : 's'} of work on the board${asked ? ', <b>one asking for you by name</b>: ignoring it costs favour' : ''}.` : 'No work on the board from here.'}${out ? ` ${out} of your outings ${out === 1 ? 'is' : 'are'} in ${k === 'guild' ? 'their' : k === 'temple' ? 'her' : 'his'} service now.` : ''}</div>
      <div class="buyrow"><button class="primary" data-act="gift" data-v="${k}" ${why ? 'disabled' : ''}>Send a gift &mdash; ${cost}</button>
        <small class="${why ? 'bad' : 'dim'}">${why || `Favour +10: ${giftGain(k, f)}. The next gift will cost more.`}</small></div>
    </div>`;
  }).join('');
  return `<div class="fill one"><div><h2>Patrons <small>the three powers of the town</small></h2>
    <div class="panel schoolbar"><div class="tally">
      <span${tip('denarii')}>purse <b class="num">${G.denarii}</b></span>
      <span class="good"${tip('What the Guild pays you every day, set by their favour and your standing.')}>stipend <b class="num">+${stipend()}</b> a day</span>
      <span${tip('favour')}>favour fades by one ${dg === 0 ? '<b>today</b>' : `in <b class="num">${dg}</b> day${dg === 1 ? '' : 's'}`}</span>
      ${G.fix ? `<span class="bad"><b>You have agreed to lose your next bout for ${G.fix.pay} denarii.</b> Win it and the Guild will not forgive you.</span>` : ''}</div>
      ${facButton('shrine')}</div>
    <div class="preqs ${patronRequest() && patronBoons() ? 'two' : ''}">${patronRequest()}${patronBoons()}</div>
    <div class="pane" data-pane="patrons"><div class="threecol">${cards}</div></div></div></div>`;
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

// What a house's way of fighting means on the sand, as the rules have it.
const HOUSE_WAYS = {
  butchers: 'Every man attacks without pause, and more than a third of their bouts are to the death.',
  quick: 'They field only net-men, twin-blades and Thracians: light, fast classes.',
  savage: () => `Every man is a brute: ${TRAITS.brute.desc.replace(/\.$/, '').toLowerCase()}.`,
  fanatics: () => `Every man is lionhearted: ${TRAITS.lionheart.desc.replace(/\.$/, '').toLowerCase()}.`,
  wealthy: 'Every man carries a weapon one grade better than his standing would buy.',
};
const feudWord = g => g >= 70 ? 'Blood feud' : g >= 40 ? 'Open feud' : g >= 25 ? 'Bad blood' : g > 0 ? 'A grievance' : 'No quarrel';

// ---- the tavern's own business: the book, the dice, and a night for the men ----
const DIE_PIPS = [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];
const DIE = n => `<span class="die">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => `<i${DIE_PIPS[n].includes(i) ? ' class="on"' : ''}></i>`).join('')}</span>`;
const houseTag = id => `${swatch(id)}<b>${houseDef(id).name}</b>`;
// What the keeper has to say today.
function tavernTalk() {
  const t = G.tavern || {}, top = G.houses.slice().sort((a, b) => b.prestige - a.prestige)[0], hot = hottestHouse();
  const up = G.houses.filter(H => H.was != null && H.prestige > H.was).sort((a, b) => (b.prestige - b.was) - (a.prestige - a.was))[0];
  if (t.last && t.last.day === G.day) return t.last.off ? 'The bout you had money on was never fought. The man with the book counts your stake back coin by coin.' : t.last.win ? `${houseDef(t.last.on).name} won. The man with the book pays out your ${t.last.pay} denarii as if each one were a tooth.` : `${houseDef(t.last.on).name} lost, and your ${t.last.stake} denarii with them. The man with the book sends his regards.`;
  const says = [];
  if (t.bet) says.push(`Your ${t.bet.stake} is on ${houseDef(t.bet.on).name}. Half the room has money the other way, and says so.`);
  if (hot && hot.grudge >= 40) says.push(`The men of ${houseDef(hot.id).name} drink at the far table, and stop talking when anyone of yours comes in.`);
  says.push(G.fame > top.prestige ? 'They drink your health here now, and mean about half of it.' : `${houseDef(top.id).name} drink free here: first house in the province, and the keeper says it is good for trade.`);
  if (up) says.push(`All the talk is of ${houseDef(up.id).name}: up ${up.prestige - up.was} since the games before last.`);
  says.push('The keeper fought eleven years in this province and has the wooden sword over his door to show for it. He will tell you about it, if you let him.');
  says.push('The dice in the corner are bone, and old, and the keeper swears nobody has ever proved anything about them.');
  return says[G.day % says.length];
}
function tavernHtml() {
  const t = G.tavern || {}, nwhy = nightBlock(), armed = ui.dealArm === 'night', n = nightMen().length;
  const said = ui.tavMsg && ui.tavMsg.day === G.day ? `<div class="dealmsg ${ui.tavMsg.ok ? 'good' : 'bad'}">${ui.tavMsg.text}</div>` : '';
  return `<div class="panel tavbar"><div class="deals"><span class="lbl">The Crossed Swords</span>
      <button data-act="tbook"${tip(`A man by the hearth keeps a book on the bouts the houses fight among themselves at the next games. He pays fair odds, less his tenth. One stake at each games.${t.bet ? `\nYou have ${t.bet.stake} on ${houseDef(t.bet.on).name}.` : ''}`)}>The book${t.bet ? ` &middot; ${t.bet.stake} down` : ''}</button>
      <button data-act="tdice"${tip(`Three dice each: the higher throw takes the stake, and a tied throw is the table's. ${diceLeft()} of ${DICE_THROWS} throws left today.`)}>Dice &middot; ${diceLeft()}</button>
      <button class="${armed ? 'primary' : ''}" data-act="tnight" ${nwhy ? 'disabled' : ''}${tip(`Stand every fit man at home a night here, once between one games and the next: morale +10 and fatigue +8 for each. Now and then two of them come home friends, or the better for an old fighter's talk; now and then there is a brawl with another house's men, and one of yours is a day mending.${nwhy ? '\n' + nwhy : ''}`)}>${armed ? 'Sure?' : `A night for the men${nwhy ? '' : ` &mdash; ${nightCost()}`}`}</button></div>
    <div class="keeper">${tavernTalk()}</div>${said}</div>`;
}
function bookModal(msg) {
  const t = G.tavern || {}, days = daysToGames(), bet = t.bet;
  const side = (H, O, price, p) => { const c = houseChampion(H);
    return `<div class="bside" style="border-left:5px solid ${houseDef(H.id).col}"><div><b>${houseDef(H.id).name}</b> <small>renown ${H.prestige}</small></div>
      <div class="dim">${c ? `${c.name}, ${CLASSES[c.cls].name}, power ${rating(c)}` : 'no champion'}</div>
      <div class="bprice"${tip(`The book thinks this about ${Math.round(p * 100)} chances in a hundred. A stake of 10 returns ${Math.round(10 * price)}.`)}>pays <b class="num">&times;${price.toFixed(2)}</b></div>
      <div class="bstakes">${bet ? (bet.on === H.id ? `<span class="gold">Your ${bet.stake} is here: returns ${Math.round(bet.stake * bet.price)}</span>` : '') : BOOK_STAKES.map(s => { const st = tavernStake(s), why = bookBlock(st); return `<button class="mini" data-act="bkbet" data-v="${H.id}" data-w="${st}" ${why ? 'disabled' : ''}${tip(why || `${st} on ${houseDef(H.id).name}: ${Math.round(st * price)} back if they win, nothing if they lose.`)}>${st}</button>`; }).join('')}</div></div>`; };
  const pairs = houseCard().map(({ A, B }) => { const q = bookQuote(A, B); return `<div class="bpair">${side(A, B, q.a, q.p)}<span class="bvs">against</span>${side(B, A, q.b, 1 - q.p)}</div>`; }).join('');
  const last = t.last ? `<p class="dim">Last time: ${t.last.off ? `the bout was never fought, and your ${t.last.stake} came back.` : `${t.last.stake} on ${houseDef(t.last.on).name} against ${houseDef(t.last.vs).name}, and they ${t.last.win ? `won. The book paid ${t.last.pay}.` : 'lost.'}`}</p>` : '';
  if (modalQueue.length) closeModal();
  showModal(`<h2>The book <small>${days ? `the games are in ${days} day${days === 1 ? '' : 's'}` : 'for the games after these'}</small></h2>
    <p>At every games the houses fight each other as well as you: their champions, one against one. A man by the hearth takes money on it. He pays fair odds less a tenth, and he has never been known to be wrong about the tenth.</p>
    ${pairs}${msg ? `<p class="${msg.ok ? 'good' : 'bad'}">${msg.text}</p>` : ''}${last}
    <div class="row"><button data-act="close">${bet ? 'Leave it to the sand' : 'Keep your money'}</button></div>`);
}
function diceModal(res) {
  const left = diceLeft(), sum = a => a[0] + a[1] + a[2], row = (who, a, won) => `<div class="${won ? 'won' : ''}"><span>${who}</span><span class="throw">${a.map(DIE).join('')}</span><b class="num">${sum(a)}</b></div>`;
  const out = res && res.ok ? `<div class="dice">${row('You', res.mine, res.win)}${row('The table', res.theirs, !res.win)}</div>
    <p class="${res.win ? 'good' : 'bad'}">${res.venus ? `Three sixes: the Venus. The whole room groans, and you are paid double: ${res.gain} denarii.` : res.win ? `Yours. ${res.gain} denarii come across the table.` : res.tie ? `Level, and a level throw is the table's. Your ${res.stake} denarii go.` : sum(res.mine) === 3 ? `Three ones: the Dogs. Your ${res.stake} denarii go, and somebody barks.` : `Theirs. Your ${res.stake} denarii go.`}</p>` : res ? `<p class="bad">${res.text}</p>` : '';
  if (modalQueue.length) closeModal();
  showModal(`<h2>Dice <small>${left ? `${left} throw${left === 1 ? '' : 's'} left today` : 'no more today'}</small></h2>
    <p>A mule-driver, a cooper and a man who will not say what he does, round a board in the corner. Three dice each. The higher throw takes the stake, a tied throw is the table's, and three sixes, the Venus, is paid double.</p>
    ${out}
    <div class="row">${DICE_STAKES.map(s => { const st = tavernStake(s), why = diceBlock(st); return `<button class="${s === DICE_STAKES[0] ? 'primary' : ''}" data-act="tdice" data-v="${st}" ${why ? 'disabled' : ''}${why ? tip(why) : ''}>Throw for ${st}</button>`; }).join('')}<button data-act="close">${res ? 'Get up from the table' : 'Not today'}</button></div>`);
}

function viewRivals() {
  const H = keepSel('hsel', G.houses), d = H && houseDef(H.id);
  const rows = G.houses.map(X => ({ id: X.id, name: houseDef(X.id).name, p: X.prestige, H: X }))
    .concat([{ name: 'Your ludus', p: G.fame, you: true }]).sort((a, b) => b.p - a.p);
  const top = Math.max(1, rows[0].p), mine = rows.findIndex(r => r.you), above = rows[mine - 1], below = rows[mine + 1];
  const today = (G.bouts || []).filter(b => !b.done && b.houseId);
  const table = rows.map((r, i) => r.you
    ? prow(`<span class="rk gold">${i + 1}</span><div class="grow"><span class="t gold">Your ludus</span><small>${above ? `${above.p - r.p} behind ${above.name}` : 'First in the province'}${below ? ` &middot; ${r.p - below.p} ahead of ${below.name}` : ''}</small></div>
        <div class="ren"${tip('Your renown is your fame.')}>${bar('prog', r.p, top)}</div><span class="end num gold">${r.p}</span>`)
    : lrow('hsel', r.id, `<span class="rk">${i + 1}</span><div class="grow"><span class="t">${swatch(r.id)}${r.name}</span>
        <small>${r.H.won + r.H.lost ? `${r.H.lost}&ndash;${r.H.won} to you` : 'never met'} &middot; <span class="${r.H.grudge >= 40 ? 'bad' : ''}">${feudWord(r.H.grudge).toLowerCase()}</span>${today.some(b => b.houseId === r.id) ? ' &middot; <span class="gold">on today\'s card</span>' : ''}</small></div>
        <div class="feudbar"${tip(`Feud ${Math.round(r.H.grudge)} of 100.\n${TIPS.feud}`)}><div class="bar hp"><i style="width:${pct(r.H.grudge, 100)}%"></i><u style="left:40%"></u></div></div>
        <div class="ren"${tip(`Renown ${r.p}${r.H.was != null && r.H.was !== r.p ? `, ${r.p > r.H.was ? 'up' : 'down'} ${Math.abs(r.p - r.H.was)} since the games before last` : ''}. A house gains about ${houseDef(r.id).rate} every games, and more for beating you.`)}>${bar('prog', r.p, top)}</div><span class="end num">${r.p}${r.H.was != null && r.H.was !== r.p ? `<small class="trend ${r.p > r.H.was ? 'up' : 'down'}">${r.p > r.H.was ? '&#9650;' : '&#9660;'}${Math.abs(r.p - r.H.was)}</small>` : ''}</span>`)).join('');
  const hot = G.houses.slice().sort((a, b) => b.grudge - a.grudge)[0], call = (G.bouts || []).find(b => b.grudge && !b.done);
  let detail = '';
  if (H) {
    const men = H.roster.slice().sort((a, b) => rating(b) - rating(a)), way = HOUSE_WAYS[d.trait], best = G.roster.slice().sort((a, b) => rating(b) - rating(a))[0];
    const styles = STATS.map(k => [k, men.filter(e => styleOf(e) === k).length]).filter(x => x[1]).map(([k, n]) => `<span class="sk">${ic(k)}<b class="num">${n}</b></span>`).join('');
    const mineBeat = k => G.roster.filter(g => styleOf(g) === STYLE_LOSES[k]).length;
    const lead = men.length ? STATS.map(k => [k, men.filter(e => styleOf(e) === k).length]).sort((a, b) => b[1] - a[1])[0] : null;
    const list = men.map((e, n) => {
      const sworn = G.roster.find(g => g.wish && g.wish.gid === e.id), lost = G.roster.filter(g => g.lostTo && g.lostTo.gid === e.id);
      return `<div class="lrow lud rivalrow" style="cursor:default"${tip(`${e.name} carries ${abilitiesOf(e).map(a => a.name).join(', ') || 'no abilities'}.${e.traits.length ? '\n' + e.traits.map(t => TRAITS[t].name + ': ' + TRAITS[t].desc).join('\n') : ''}`)}>
        <canvas width="48" height="56" style="width:34px;height:40px" data-rportrait="${H.id}:${e.id}"></canvas>
        <div class="grow"><span class="t">${e.name} ${styleMark(e)} <small class="inl">${RANKS[e.rank].name} &middot; ${CLASSES[e.cls].name} &middot; ${e.wins}W ${e.losses}L</small></span>
          <div class="l2"><span class="sks"><b class="num pw"><span class="sr">power </span>${rating(e)}</b>${STATS.map(k => `<span class="sk">${ic(k)}<b class="num">${e.stats[k]}</b></span>`).join('')}</span>${n === 0 ? '<span class="chip gold">Champion</span>' : ''}${e.vs.w || e.vs.l ? `<span class="chip">${e.vs.w}&ndash;${e.vs.l} against you</span>` : ''}${e.exYours ? '<span class="chip gold">Once yours</span>' : ''}${e.slew.length ? `<span class="chip red">Slew ${e.slew.join(', ')}</span>` : ''}${sworn ? `<span class="chip red">${sworn.name} has sworn to face him</span>` : lost.length ? `<span class="chip">Beat ${lost.map(g => g.name).join(', ')}</span>` : ''}</div></div>
        ${best ? `<span class="end num ${rating(e) > rating(best) ? 'bad' : 'dim'}"${tip(`Against ${best.name}, your strongest, at power ${rating(best)}.`)}>${rating(e) > rating(best) ? '+' : ''}${rating(e) - rating(best) || '='}</span>` : ''}
        ${n === 0 ? '' : (why => `<button class="mini ${ui.dealArm === H.id + ':buy:' + e.id ? 'primary' : ''}" data-act="hdeal" data-v="${H.id}" data-w="buy:${e.id}" ${why ? 'disabled' : ''}${tip(why ? `Buy him out of his house.\n${why}` : `Buy him out of ${d.name} for ${dealCost('buy', e)} denarii: well over his worth, and they will resent it (feud +8). He brings his own kit.`)}>${ui.dealArm === H.id + ':buy:' + e.id ? 'Sure?' : 'Buy ' + dealCost('buy', e)}</button>`)(dealBlock(H, 'buy', e))}
      </div>`;
    }).join('');
    const card = today.filter(b => b.houseId === H.id);
    const form = (H.form || []).map(r => `<i class="${r === 'W' ? 'w' : 'l'}">${r}</i>`).join('') || '<span class="dim">no word yet</span>';
    const deal = (kind, label, what) => { const why = dealBlock(H, kind), cost = dealCost(kind), armed = ui.dealArm === H.id + ':' + kind; return `<button class="${armed ? 'primary' : ''}" data-act="hdeal" data-v="${H.id}" data-w="${kind}" ${why ? 'disabled' : ''}${tip(why ? `${what}\n${why}` : what)}>${armed ? 'Sure?' : label}${cost && !armed ? ` &mdash; ${cost}` : ''}</button>`; };
    const said = ui.dealMsg && ui.dealMsg.hid === H.id && ui.dealMsg.day === G.day ? `<div class="dealmsg ${ui.dealMsg.ok ? 'good' : 'bad'}">${ui.dealMsg.text}</div>` : '';
    const deals = `<div class="deals"><span class="lbl"${tip('One dealing with each house between one games and the next.')}>Dealings</span>
        ${deal('spar', 'Train against them', `A day in their yard for every fit man you have at home: about a day and a half of training in ${STAT_NAMES[sparStat(H)].toLowerCase()}, which is what this house does best, and some fatigue. Only a house you have no real quarrel with (a feud under ${SPAR_FEUD}) will have you.`)}
        ${deal('gift', 'Send a gift', 'Wine and hounds for their lanista: the feud eases by 20.')}
        ${deal('challenge', H.called ? 'Called out' : 'Call them out', 'Their champion against a man of yours at the next games, for a double purse and double fame. The feud deepens by 10; win, and their renown falls. Fail to appear and it costs you fame, favour and your men\'s respect.')}
        ${deal('sabotage', 'Sabotage', 'Two chances in three: their best man misses the next games and their renown falls. Otherwise your man is caught: Magistrate favour -10, fame -5, and the feud deepens by 25.')}</div>${said}`;
    detail = `<div class="panel housecard" style="border-left:6px solid ${d.col}">
        <div><b>${d.lanista}.</b> <span class="dim">${d.blurb}</span></div>
        <div class="today"><span class="lbl">Their way</span><div>${typeof way === 'function' ? way() : way}</div></div>
        <div class="kvs">
          <div><span>Renown</span><b class="num">${H.prestige}</b><small>${H.prestige > G.fame ? `${H.prestige - G.fame} above you: beating them earns extra fame` : `${G.fame - H.prestige} below you`}</small></div>
          <div><span>Against you</span><b class="num">${H.won}&ndash;${H.lost}</b><small class="form"${tip('Their last five results against anyone, oldest first: W won, L lost.')}>${form}</small></div>
          <div><span>Feud</span><b class="num ${H.grudge >= 40 ? 'bad' : ''}">${Math.round(H.grudge)}</b><small>${feudWord(H.grudge)}${H.grudge >= 40 ? ': their champion will call you out' : `, ${Math.ceil(40 - H.grudge)} short of a challenge`}</small></div>
          <div><span>Styles</span><b class="sks">${styles || '&ndash;'}</b><small>${lead && lead[1] ? (mineBeat(lead[0]) ? `${mineBeat(lead[0])} of yours beat their ${STAT_NAMES[lead[0]].toLowerCase()} men` : `none of yours beats ${STAT_NAMES[lead[0]].toLowerCase()}: train ${STAT_NAMES[STYLE_LOSES[lead[0]]].toLowerCase()}`) : ''}</small></div>
        </div>
        ${deals}
        ${card.length ? `<div class="gold" style="font-size:13px">On today's card: ${card.map(b => `${b.grudge ? 'a grudge match' : b.called ? 'your challenge' : b.size === 1 ? 'a duel' : b.size + ' a side'}${b.death ? ', to the death' : ''}`).join('; ')}.</div>` : ''}
      </div>
      <div class="panel list">${list}</div>`;
  }
  return `<div class="fill even">
    <div><h2>Standing <small>renown, and the feud with each house</small></h2>
      <div class="panel schoolbar"><div class="tally">
        <span class="${mine === 0 ? 'gold' : ''}"><b class="num">${ordinal(mine + 1)}</b> of ${rows.length}</span>
        ${above ? `<span${tip('Renown comes from fame: win bouts, and beat houses that stand above you.')}><b class="num">${above.p - G.fame + 1}</b> fame to pass ${above.name}</span>` : '<span class="gold">no one stands above you</span>'}
        ${call ? `<span class="bad"><b>${call.house} has called you out today.</b> Leave it unanswered and it costs you.</span>` : hot && hot.grudge >= 25 ? `<span class="${hot.grudge >= 40 ? 'bad' : ''}"${tip('feud')}>${feudWord(hot.grudge).toLowerCase()} with ${houseDef(hot.id).name}</span>` : '<span>no feud worth the name</span>'}</div></div>
      <div class="pane" data-pane="houses">${tavernHtml()}<div class="panel list standing">${table}</div>
      <div class="listnote">Killing a house's men, or losing yours to them, deepens the feud. At the mark on the red bar (40) their champion calls you out; answer it and the feud cools, whoever wins.</div>
      ${(G.rivalNews || []).length + (G.rivalMoves || []).length ? `<h2>Word from the other schools</h2><div class="panel rnews">${(G.rivalMoves || []).map(x => ({ d: x.d + 0.5, x })).concat((G.rivalNews || []).map(x => ({ d: x.d, x }))).sort((a, b) => b.d - a.d).slice(0, 4).map(({ x }) => x.text ? `<div><span class="d">Day ${x.d}</span><span>${swatch(x.h)}<b>${houseDef(x.h).name}</b> ${x.text}.</span></div>` : `<div><span class="d">Day ${x.d}</span><span>${swatch(x.w)}<b>${houseDef(x.w).name}</b> beat ${swatch(x.l)}${houseDef(x.l).name} <small>${x.by} carried it</small></span></div>`).join('')}</div>` : ''}</div></div>
    <div><h2>${d ? d.name : 'Rival houses'} <small>${H ? H.roster.length + ' fighters' : ''}</small></h2><div class="pane" data-pane="house-${H ? H.id : ''}">${detail}</div></div>
  </div>`;
}

function festivalNote(brief) {
  const f = G.festival;
  if (!f) return '';
  const today = f.day === G.day && G.bouts, type = today ? (f.shown || f.type) : f.type, F = FESTIVALS[type], left = f.day - G.day;
  const when = today ? 'today' : left === 1 ? 'tomorrow' : 'in ' + left + ' days';
  const need = today ? crownNeed() : FEST_CROWN[type], won = f.won || 0;
  const crownText = type === 'tourney' ? 'win the tournament' : type === 'melee' ? 'win the great melee' : `win ${need} of the festival's bouts`;
  const crown = f.crowned ? '<span class="gold">crowned victor</span>' : today && type !== 'tourney' ? `crown: ${won} of ${need} won` : `crown: ${crownText}`;
  const crownTip = `Be named victor of the festival: ${crownText} on the day. It pays ${round5(PURSE[tier()] * 0.8)} denarii (half as much again for a sponsor), pleases the Magistrate, and the crown stays with the house: each one adds 2% to the fame of every bout after, up to 20%. You hold ${trophies()}.`;
  const sb = sponsorBlock(), canAsk = !f.sponsor && left <= 5 && left >= 0 && !(today && G.bouts.some(b => b.done));
  const sponsor = f.sponsor ? `<span class="chip gold"${tip('Your name is on the festival: your men earn a quarter more fame in its bouts, and the crown pays half as much again.')}>Sponsor</span>`
    : canAsk ? `<button class="mini" data-act="sponsor" ${sb ? 'disabled' : ''}${tip(`Pay ${sponsorCost()} denarii to put your name on the festival. The Magistrate is pleased at once, your men earn a quarter more fame in the festival's bouts, and its crown pays half as much again.${sb ? '\n' + sb : ''}`)}>Sponsor it &mdash; ${sponsorCost()}</button>` : '';
  if (brief) return `<div class="panel festline"><b${tip(F.blurb)}>${F.name}</b> <small>${when}</small> <small${tip(crownTip)}>&middot; ${crown}</small>${sponsor}</div>`;
  const then = (G.festQueue || []).map(x => `<span${tip(FESTIVALS[x.type].blurb)}><b>${FESTIVALS[x.type].name}</b> <small>day ${x.day}</small></span>`).join('');
  return `<div class="panel festcard"><h3>${F.name} <small>${when}</small>${sponsor}</h3>
    <div class="dim" style="font-size:13px">${F.blurb}</div>
    <div class="festmeta"><span${tip(crownTip)}>${crown}</span>${then ? `<span class="lbl">Then</span>${then}` : ''}</div></div>`;
}

function tourneyPanel() {
  const T = G.tourney;
  if (!T) return '';
  const me = T.entrant ? byId(T.entrant) : null, odds = T.state === 'done' ? {} : tourneyOdds(T), open = T.state === 'open';
  const prizes = [0, 1, 2].map(r => { const pz = tourneyPrize(T, r); return `<span>${ROUND_NAMES[r]} <b class="gold num">${pz.purse}</b> <small class="num">+${pz.fame}</small></span>`; }).join('');
  const canBet = !T.bet && T.round === 0 && T.state !== 'done';
  const cols = T.rounds && T.rounds.length ? T.rounds : [tourneyDraw(T).map(tSnap)];
  if (canBet && ui.tbet && !odds[ui.tbet]) ui.tbet = null;
  // one man on the bracket: struck through once he is out, gold if he is yours, and what the bookmakers pay on him
  const ent = (e, r) => {
    const key = tKey(e), g = e.you ? me : tRival(e), next = cols[r + 1], outNow = next && !next.some(x => tKey(x) === key), o = odds[key];
    const name = e.you ? (me ? me.name : open ? 'your man?' : 'your man') : e.name;
    const what = e.you ? (me ? `${me.name}, yours: ${CLASSES[me.cls].name}, might ${might(me)}.` : 'The place kept for your man, if you enter one.')
      : g ? `${e.name} of ${houseDef(e.hid).name}: ${CLASSES[g.cls].name}, might ${might(g)}, ${g.wins}W ${g.losses}L.${T.state === 'running' && !outNow && tHealth(g) < 0.995 ? `
What the rounds have cost him: he has ${Math.round(tHealth(g) * 100)}% of his health left.` : ''}` : `${e.name} of ${houseDef(e.hid).name}.`;
    const held = !e.you && G.laurels && G.laurels.length && G.laurels[G.laurels.length - 1].gid === e.gid && G.laurels[G.laurels.length - 1].day !== G.day;
    return `<div class="bent ${e.you ? 'you' : ''} ${outNow ? 'out' : ''} ${canBet && ui.tbet === key ? 'sel' : ''}" ${canBet && o ? `data-act="tbetpick" data-v="${key}"` : ''}${tip(what + (held ? '\nHe took the laurel last time.' : '') + (o && r === 0 && T.state !== 'done' ? `\nThe bookmakers give him ${asPct(o.p)} for the laurel, and pay x${o.pay}.${canBet ? ' Click to back him.' : ''}` : ''))}>${e.you ? '' : swatch(e.hid)}<span>${name}</span>${held ? '<i>&#9733;</i>' : ''}${g && r === 0 ? `<b class="num">${might(g)}</b>` : ''}</div>`;
  };
  const heads = ['Quarter-finals', 'Semi-finals', 'Final', 'Laurel'];
  const bracket = `<div class="bracket">${[0, 1, 2, 3].map(r => `<div class="bcol"><div class="bhead">${cols[0].length < 8 && r === 0 ? 'The field' : heads[r]}</div><div class="bents">${(cols[r] || []).map(e => ent(e, r)).join('')}</div></div>`).join('')}</div>`;
  // the bet on the laurel
  let bet = '';
  if (T.bet) bet = `<div class="tbet"><span class="lbl">Your bet</span><span><b class="num">${T.bet.stake}</b> on <b>${T.bet.name}</b> at x${T.bet.pay}${T.bet.settled ? (T.bet.won ? `: <b class="gold">it pays ${T.bet.gain}</b>` : ': <span class="bad">lost</span>') : `, to pay <b class="gold num">${Math.round(T.bet.stake * T.bet.pay)}</b>`}</span></div>`;
  else if (canBet) {
    const o = ui.tbet && odds[ui.tbet];
    bet = `<div class="tbet"${tip('One bet on who takes the laurel, yours or anybody\'s, laid before the first round. Click a man on the bracket, then a stake.')}><span class="lbl">Back a man</span>${o
      ? `<span><b>${o.name}</b> at x${o.pay}</span><div class="acts mini">${[25, 50, 100, 250].map(w => `<button class="mini" data-act="tbet" data-v="${w}" ${G.denarii < w ? 'disabled' : ''}>${w}</button>`).join('')}</div>`
      : '<small class="dim">click a man on the bracket to see what the bookmakers pay on him</small>'}</div>`;
  }
  const past = (G.laurels || []).filter(x => x.day !== G.day).slice(-3).reverse();
  const pastRow = past.length ? `<div class="tpast"><span class="lbl">Past laureates</span>${past.map(x => `<span>${x.hid ? swatch(x.hid) : ''}<b class="${x.hid ? '' : 'gold'}">${x.name}</b> <small>day ${x.day}</small></span>`).join('')}</div>` : '';
  let body;
  if (open) {
    const avail = G.roster.filter(canFight);
    if (!avail.some(g => g.id === ui.tpick)) ui.tpick = null;
    const chips = avail.map(g => `<span class="chip pick ${ui.tpick === g.id ? 'on' : ''}" data-act="tpick" data-v="${g.id}">${g.name} <span class="num">${might(g)}</span></span>`).join('')
      || '<span class="dim">No one is fit to enter.</span>';
    body = `<div class="sendhead"><span>Choose a champion: up to three bouts today, and he sits out the ordinary games</span></div>
      <div style="margin:5px 0">${chips}</div>
      <div class="row"><button class="primary" data-act="tenter" ${ui.tpick && G.denarii >= T.fee ? '' : 'disabled'}${tip(G.denarii < T.fee ? `The entry fee is ${T.fee} denarii, and you have not got it.` : 'He is entered, and the draw is fixed.')}>Enter the lists &mdash; ${T.fee}</button>
        <button class="mini ${ui.watchArm ? 'primary' : ''}" data-act="twatch"${tip('Enter nobody and watch it fought out now. A bet you have laid still stands.')}>${ui.watchArm ? 'Sure? Watch' : 'Watch from the stands'}</button>${pastRow.replace('class="tpast"', 'class="tpast inrow"')}</div>`;
  } else if (T.state === 'running' && T.bout && me) {
    const o = winOdds([me], boutEnemies(T.bout)), foe = boutEnemies(T.bout)[0], tb = tendBlock();
    const wager = Math.min(ui.wagers[T.bout.id] || 0, Math.max(0, G.denarii));
    const tend = T.round === 0 ? '' : `<div class="tbet"><span class="lbl"${tip('Between rounds he is given a little wine and a bandage as it is. There is time for one thing more.')}>Between rounds</span>${T.tended
      ? `<span class="gold">${TENDS[T.tended].name}</span>`
      : Object.keys(TENDS).map(k => `<button class="mini" data-act="ttend" data-v="${k}" ${tb ? 'disabled' : ''}${tip(TENDS[k].what)}>${TENDS[k].name}</button>`).join('')}</div>`;
    body = `<div class="kvs three">
        <div><span>${ROUND_NAMES[T.round]}</span><b style="font-size:15px">${foe ? foe.name : '&mdash;'}</b><small>${foe ? `${CLASSES[foe.cls].name} &middot; might ${might(foe)}` : ''}</small></div>
        <div><span>${me.name}</span><b class="num ${me.hp < maxHp(me) * 0.5 ? 'bad' : ''}">${Math.round(me.hp)}/${maxHp(me)}</b><small>health &middot; might ${might(me)}${me.whet ? ' &middot; blade whetted' : ''}</small></div>
        <div><span>Chance</span><b class="num ${o.p >= 0.5 ? 'good' : 'bad'}">${asPct(o.p)}</b><small>the bookmakers pay x${o.pay}</small></div></div>
      ${tend}
      <div class="wagerrow"><span class="lbl"${tip('wager')}>Wager</span><div class="acts mini">${[0, 25, 50, 100, 250, 500].filter(w => w <= Math.max(0, G.denarii)).map(w => `<button class="mini ${w === wager ? 'on' : ''}" data-act="wagerset" data-v="${T.bout.id}" data-w="${w}">${w || 'None'}</button>`).join('')}</div>
        <small class="dim" style="margin-left:8px;flex:1">${wager ? `pays ${Math.round(wager * o.pay)} if he wins` : ''}</small>
        <button class="primary" data-act="tfight"${tip('Key: Enter')}>To the sand</button></div>`;
  } else {
    body = T.champion === 'you' ? '<b class="gold">Your man wears the laurel.</b>' : `<span>${T.champion || 'A rival'}${T.championHouse ? ' of ' + houseDef(T.championHouse).name : ''} takes the laurel.</span>`;
  }
  return `<div class="panel bout lists"><h3>The lists <span class="tprizes">${prizes}</span></h3>
    ${bracket}
    ${T.state === 'done' && T.log.length ? `<div class="dim tlog">${T.log.slice(-2).join('<br>')}</div>` : ''}
    ${bet}
    <hr class="sep">${body}
    ${open ? '' : pastRow}</div>`;
}

// ---------- save menu ----------

function savesModal() {
  const ago = t => {
    if (!t) return 'at an unknown time';
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
    if (m < 60 * 24) { const h = Math.round(m / 60); return `${h} hour${h === 1 ? '' : 's'} ago`; }
    return 'on ' + new Date(t).toLocaleDateString([], { dateStyle: 'medium' });
  };
  const exact = t => t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const rows = [], empty = [];
  let used = 0;
  for (let n = 1; n <= SLOT_COUNT; n++) {
    const info = slotInfo(n), bak = slotInfo(n, true), cur = n === slot && !!info;
    if (!info) { empty.push(n); continue; }
    used += info.size + (bak ? bak.size : 0);
    const state = info.won ? '<span class="chip gold">Victor</span>' : info.over ? '<span class="chip red">Fallen</span>' : '';
    const back = bak && bak.day !== info.day;
    rows.push(`<div class="slot ${cur ? 'cur' : ''}">
      <div class="slothead"><span class="sn">${n}</span>
        <input type="text" maxlength="28" value="${esc(info.label)}" placeholder="${info.gen > 1 ? cap1(ordinal(info.gen)) + ' generation' : 'Name this campaign'}" data-chg="slotname" data-v="${n}" aria-label="Name of the campaign in slot ${n}"${tip('A name of your own for this save.')}>
        ${cur ? '<span class="chip gold">Playing now</span>' : ''}${state}${info.gen > 1 ? `<span class="chip"${tip('An heir\'s campaign: the family has been ruined before and begun again.')}>${cap1(ordinal(info.gen))} generation</span>` : ''}
        <span class="when" title="${exact(info.savedAt)}">saved ${ago(info.savedAt)}</span></div>
      <div class="slotway"${tip(info.won ? 'The Great Arena is won.' : `${info.fame} of the ${FINAL_FAME} fame that brings the final games.`)}><i style="width:${Math.round(clamp(info.fame / FINAL_FAME, 0, 1) * 100)}%"></i>${TIERS.slice(1).map(t => `<u style="left:${Math.round(t.fame / FINAL_FAME * 100)}%"></u>`).join('')}</div>
      <div class="slotfacts">
        <div><span>Day</span><b class="num">${info.day}</b></div>
        <div><span>Arena</span><b>${info.tier}</b></div>
        <div><span>Fame</span><b class="num">${info.fame}</b></div>
        <div><span>Purse</span><b class="num ${info.denarii < 0 ? 'bad' : ''}">${info.denarii}</b></div>
        <div><span>Bouts</span><b class="num">${info.wins}&ndash;${info.losses}</b></div>
        <div><span>Best of ${info.roster}</span><b>${info.best ? `${info.best} <small class="num">${info.bestPower}</small>` : '&ndash;'}</b></div>
      </div>
      <div class="slotacts">
        ${cur ? '<span class="dim">It saves itself after everything you do.</span>' : `<button class="primary" data-act="slotload" data-v="${n}">Load</button><button data-act="slotcopy" data-v="${n}"${tip('Replaces this save with the game you are playing now. The game you are playing stays in its own slot too.')}>${ui.confirmSlot === 'copy' + n ? 'Overwrite it?' : 'Overwrite with current'}</button>`}
        <span class="sp"></span>
        ${back ? `<button class="mini" data-act="slotrestore" data-v="${n}"${tip(`A copy from the morning of the last games day, saved ${exact(bak.savedAt)}. Going back loses everything since.`)}>${ui.confirmSlot === 'restore' + n ? `Go back to day ${bak.day}?` : `Back to day ${bak.day}`}</button>` : ''}
        <button class="mini" data-act="slotexport" data-v="${n}"${tip('Writes this save to a file you can keep, or carry to another computer.')}>Export</button>
        <button class="mini ${ui.confirmSlot === 'del' + n ? 'danger' : ''}" data-act="slotdel" data-v="${n}">${ui.confirmSlot === 'del' + n ? 'Really delete?' : 'Delete'}</button>
      </div></div>`);
  }
  const free = empty.length ? `<div class="slotfree"><div class="lbl">Empty slots</div>${empty.map(n => `<div class="slot empty"><span class="sn">${n}</span>
      <button class="mini" data-act="slotnew" data-v="${n}"${tip('Begin a new ludus here. The game you are playing stays in its own slot.')}>New game</button>
      <button class="mini" data-act="slotcopy" data-v="${n}"${tip('Puts a copy of the game you are playing here: a save to come back to.')}>Copy current</button>
      <button class="mini" data-act="slotimport" data-v="${n}"${tip('Reads a file written by Export into this slot.')}>Import</button></div>`).join('')}</div>` : '';
  const now = slotInfo(slot);
  return `<div class="saves"><h2>Saves</h2>
    <p class="savenow">${now ? `You are playing <b>${esc(now.label) || 'slot ' + slot}</b>: day ${now.day}, ${now.tier}, saved ${ago(now.savedAt)}. It saves itself after everything you do, and keeps a copy from the morning of the last games day.` : 'The game saves itself after everything you do.'}</p>
    ${ui.saveMsg ? `<p class="${ui.saveErr ? 'bad' : 'good'}" style="margin:0 0 6px">${ui.saveMsg}</p>` : ''}
    ${rows.join('')}${free}
    <p class="dim" style="font-size:11px;margin:6px 0 0">${rows.length} of ${SLOT_COUNT} slots used${used ? `, about ${Math.max(1, Math.round(used / 1024))} KB` : ''}. Saves live in this ${typeof location !== 'undefined' && /^https?:$/.test(location.protocol) ? 'browser, on this computer: clearing the site\'s data removes them' : 'program\'s own folder on this computer'}. Export writes one to a file you can keep or carry elsewhere.</p>
    <div class="row"><button class="primary" data-act="close">Done</button></div></div>`;
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
// What the yard calls him, from what he has done.
function epithetOf(g) {
  const fought = g.wins + g.losses, scars = scarsOf(g).length;
  if (g.traits.includes('laureate')) return 'the Laureate';
  if (g.traits.includes('embittered')) return 'the Embittered';
  if (!fought) return 'the Untried';
  if (g.wins >= 5 && !g.losses) return 'the Unbeaten';
  if (g.kills >= 6) return 'the Butcher';
  if ((g.fame || 0) >= 80) return 'Darling of the Crowd';
  if (scars >= 5) return 'the Scarred';
  if (g.wins >= 10) return 'the Old Hand';
  if (g.losses > g.wins && fought >= 4) return 'the Survivor';
  if (g.kills >= 3) return 'the Killer';
  if (g.wins >= 3 && g.losses <= 1) return 'the Rising';
  return '';
}
// What kind of thing a line of his story is, for the mark beside it.
function storyKind(t) {
  if (/^Won|Did good service|Had the man|Stood for a bronze|Was blessed/.test(t)) return 'good';
  if (/^Rose to|^Learned|freedom after|walk free|Laurel/.test(t)) return 'gold';
  if (/^Failed|Mourned|denied|refused|sold away|gone\.|too quiet|beaten for|Fell out|Swore to kill|Vowed/.test(t)) return 'bad';
  return '';
}
function storyBlock(g) {
  const bonds = bondsOf(g), scars = scarsOf(g), fought = g.wins + g.losses, story = g.story || [], first = story[0], days = first ? Math.max(0, G.day - first.d) : G.day;
  const c = CLASSES[g.cls], ep = epithetOf(g), plural = (n, w, ws) => `${n} ${n === 1 ? w : (ws || w + 's')}`;
  // who he is, in a few sentences made from what he has done
  const sc = {}; for (const x of scars) sc[x.k] = (sc[x.k] || 0) + 1;
  const scarWords = Object.entries(sc).map(([k, n]) => plural(n, { cut: 'cut', deep: 'deep wound', claw: 'claw mark', arm: 'wound to the arm' }[k] || 'scar'));
  const bio = [`<b>${g.name}</b>${ep ? `, called <b class="gold">${ep}</b>,` : ''} is a ${c.name} from ${g.origin || 'nobody knows where'}, ${RANKS[g.rank].name} of this house for ${plural(days, 'day')}.`,
    fought ? `He has fought ${plural(fought, 'time')} and won ${g.wins}${g.kills ? `, and killed ${plural(g.kills, 'man', 'men')}` : ''}.` : 'He has not yet stood on the sand for you.',
    scarWords.length ? `He carries ${scarWords.join(', ').replace(/, ([^,]*)$/, ' and $1')}.` : fought >= 3 ? 'No blade has marked him yet.' : '',
    (g.fame || 0) >= 40 ? 'The city knows his name.' : (g.fame || 0) >= 15 ? 'People in town have begun to know his face.' : ''].filter(Boolean).join(' ');
  // those he is bound to, and what he has sworn or been promised
  const people = bonds.map(b => `<div class="sbond ${b.type}" data-act="dossier" data-v="${b.other.id}"${tip(b.type === 'friend' ? 'friend' : 'rivalbond')}><canvas width="48" height="56" data-portrait="${b.other.id}"></canvas><div><small>${b.type === 'friend' ? 'Friend' : 'Rival'}</small><b>${b.other.name}</b></div></div>`).join('');
  const vows = [];
  if (g.wish) vows.push(`<div class="svow bad"${tip('vow')}><small>${g.wish.type === 'avenge' ? 'Sworn to kill' : 'Wants again'}</small><b>${g.wish.name}</b>${g.wish.for ? `<span>for ${g.wish.for}</span>` : ''}</div>`);
  if (g.promise) { const left = Math.max(0, g.promise.at - g.wins); vows.push(`<div class="svow gold"${tip('promise')}><small>Promised his freedom</small><b>${left ? plural(left, 'more victory', 'more victories') : 'it is owed him now'}</b>${bar('prog', Math.max(0, 3 - left), 3)}</div>`); }
  if (!g.promise && !g.away && g.wins >= 8) vows.push(`<div class="svow gold"${tip('free')}><small>Has earned</small><b>the wooden sword</b><span>on his Orders page</span></div>`);
  // his history, newest first: the last eight unless more are asked for
  const all = story.slice().reverse(), open = ui.storyAll === g.id, shown = open ? all : all.slice(0, 8);
  const lines = shown.map(x => `<div class="sline ${storyKind(x.t)}"><span class="d">Day ${x.d}</span><span>${x.t}</span></div>`).join('');
  return `<p class="sbio">${bio}</p>
    ${people || vows.length ? `<div class="sties">${people}${vows.join('')}</div>` : ''}
    <div class="shead"><span>His story</span>${all.length > 8 ? `<button class="mini" data-act="storyall" data-v="${g.id}">${open ? 'Latest only' : `All ${all.length}`}</button>` : ''}</div>
    ${lines ? `<div class="slines">${lines}</div>` : '<div class="dim" style="font-size:13px">Nothing worth telling of him yet.</div>'}`;
}

// ---------- equipment ----------

function itemTag(it) { return `<span class="rar r${it.r}"${tip('rarity')}>${RARITY[it.r]}</span> ${itemName(it)}`; }

// The best spare piece for each of his slots, where one on the racks would be a gain.
function bestSpares(g) {
  const out = [];
  for (const slot of SLOTS) {
    const top = G.armoury.filter(x => x.slot === slot && fits(x, g)).map(x => ({ x, d: itemDelta(x, g).d })).sort((a, b) => b.d - a.d)[0];
    if (top && top.d > 0.05) out.push(top.x);
  }
  return out;
}
// A piece's picture, or the empty place where one would go.
const slotPic = (it, slot, size) => it ? itemArt(it, size || 72) : `<span class="itemart none s${size || 72}">${ic('slot-' + slot)}</span>`;
// A piece of yours, or one on the smith's stall.
const anyItem = id => { const f = findItem(id); return f ? f.it : G.smith.stock.find(x => x.id === +id) || null; };
// Pieces that have come to the racks since you last looked at them glint for a few seconds the first time they are shown.
function freshAge(it) {      // milliseconds since it was first shown, or -1 once it is old news
  if (!ui.seenItems) return -1;
  if (!ui.seenItems.has(it.id)) ui.seenItems.set(it.id, Date.now());
  const age = Date.now() - ui.seenItems.get(it.id);
  return age < 6000 ? age : -1;
}
// The class and the style of a tile for a piece: its grade's colour, and the glint if it is new.
const tileLook = (it, cls) => { const a = freshAge(it); return `class="${cls}${a >= 0 ? ' fresh' : ''}" style="--rc:${it.relic ? '#d8a657' : RARITY_COL[it.r]}${a >= 0 ? `;--age:-${a}ms` : ''}"`; };
function noteItems() {      // everything owned when the game is opened is old news
  if (ui.seenItems) return;
  ui.seenItems = new Map();
  for (const x of G.armoury) ui.seenItems.set(x.id, 0);
}

// What a piece does, line by line, and against what a man wears in that slot now: the card under the mouse.
const CMP_ROWS = [
  ['dmg', 'Damage on a blow', v => v.toFixed(1)], ['armor', 'Taken off a blow', v => v.toFixed(2)],
  ['block', 'Block', v => (v * 100).toFixed(1) + '%'], ['dodge', 'Dodge', v => (v * 100).toFixed(1) + '%'], ['speed', 'Speed', v => Math.round(v * 100) + '%'],
  ['stunRes', 'Stuns shorter', v => Math.round(v * 100) + '%'], ['critRes', 'Telling blows fewer', v => Math.round(v * 100) + '%'],
  ['bleedRes', 'Shrugs off bleeding', v => Math.round(v * 100) + '%'], ['hamRes', 'Shrugs off a hamstring', v => Math.round(v * 100) + '%'], ['armRes', 'Shrugs off an arm wound', v => Math.round(v * 100) + '%'],
];
function cmpCard(id, gid) {
  const it = anyItem(id);
  if (!it) return '';
  const g = gid ? byId(gid) : null, cur = g && g.gear ? g.gear[it.slot] : null, vs = !!g && cur !== it;
  const a = itemStats(it), b = vs && cur ? itemStats(cur) : null;
  const side = (x, lbl) => `<div class="cmpside">${slotPic(x, it.slot)}<div><small>${lbl}</small><b>${x ? `<span class="rar r${x.r}">${RARITY[x.r]}</span> ${itemName(x)}` : it.slot === 'weapon' ? 'A practice ' + WEAPON_NAMES[g.cls] : 'Nothing'}</b></div></div>`;
  const rows = CMP_ROWS.filter(([k]) => Math.abs(a[k]) > 1e-9 || (b && Math.abs(b[k]) > 1e-9)).map(([k, name, fmt]) => {
    const d = a[k] - (b ? b[k] : 0), flat = Math.abs(d) < 1e-9;
    return `<div class="cmprow"><span>${name}</span><b class="num">${a[k] < -1e-9 ? '&minus;' : ''}${fmt(Math.abs(a[k]))}</b>${vs ? `<i class="num ${flat ? 'dim' : d > 0 ? 'good' : 'bad'}">${flat ? '=' : (d > 0 ? '+' : '&minus;') + fmt(Math.abs(d))}</i>` : ''}</div>`;
  }).join('');
  const notes = [it.relic ? RELICS[it.relic].note : '', it.fit && FITS[it.fit] ? `${FITS[it.fit].name}: ${FITS[it.fit].what}` : '', it.mw ? 'Master-wrought: better than its grade, and for good.' : '', it.slot === 'weapon' ? `Only a ${CLASSES[it.cls].name} can use it.` : ''].filter(Boolean);
  return `<div class="cmp">${side(it, vs ? 'This' : SLOT_INFO[it.slot].name)}${vs ? side(cur, `${g.name} wears`) : ''}</div>
    <div class="cmprows">${vs ? `<div class="cmprow head"><span></span><b>this</b><i>change</i></div>` : ''}${rows}</div>
    ${notes.length ? `<div class="cmpnote">${notes.join('<br>')}</div>` : ''}`;
}

// The six equipment slots on a fighter's dossier, laid out round the man himself as he stands in what he wears.
// Click a slot and everything on the racks that fits it is set out underneath, best gain first.
function gearBlock(g) {
  if (!g.gear) return '';
  noteItems();
  const better = bestSpares(g), open = ui.gearOpen && String(ui.gearOpen).startsWith(g.id + ':') ? ui.gearOpen.split(':')[1] : null;
  const spareOf = slot => G.armoury.filter(x => x.slot === slot && fits(x, g)).map(x => ({ x, dl: itemDelta(x, g) })).sort((a, b) => b.dl.d - a.dl.d);
  const smithOf = slot => G.smith.stock.filter(x => x.slot === slot && fits(x, g) && (!g.gear[slot] || x.r > g.gear[slot].r)).length;
  const slotBox = (slot, side) => {
    const it = g.gear[slot], sp = spareOf(slot), up = sp.length && sp[0].dl.d > 0.05, sm = smithOf(slot);
    return `<div class="dslot ${side} ${open === slot ? 'sel' : ''} ${it ? '' : 'bare'}" data-act="gearmore" data-v="${g.id}" data-w="${slot}" ${it ? `data-cmp="${it.id}"` : tip(`${SLOT_INFO[slot].name}: ${slot === 'weapon' ? 'a practice ' + WEAPON_NAMES[g.cls] : 'nothing'}. Click to see what on the racks would fit.`).trim()}>
      <span class="dpic">${slotPic(it, slot)}${up ? '<u class="up">&#9650;</u>' : ''}${sm ? '<u class="sm">&#9679;</u>' : ''}</span>
      <span class="dtxt"><small>${SLOT_INFO[slot].name}</small><b>${it ? `<span class="rar r${it.r}">${RARITY[it.r]}</span> ${itemName(it)}` : `<span class="dim">${slot === 'weapon' ? 'Practice ' + WEAPON_NAMES[g.cls] : 'Nothing'}</span>`}</b><i>${it ? itemGist(it) : sp.length ? `${sp.length} on the racks` : ''}</i></span></div>`;
  };
  let pick = `<div class="dpick hint"><span class="dim">Click a slot to change it. <span class="good">&#9650;</span> something better is on your racks &middot; <span class="gold">&#9679;</span> the smith has something better today.</span></div>`;
  if (open && SLOT_INFO[open]) {
    const it = g.gear[open], sp = spareOf(open), sm = smithOf(open);
    const tiles = sp.map(({ x, dl }) => `<button ${tileLook(x, 'rtile big' + (dl.d > 0.05 ? ' gain' : ''))} data-act="equip" data-v="${g.id}" data-w="${x.id}" data-cmp="${x.id}:${g.id}">${itemArt(x, 72)}<em class="${dl.d > 0.05 ? 'good' : dl.d < -0.05 ? 'bad' : 'dim'}">${dl.short}</em></button>`).join('');
    pick = `<div class="dpick"><div class="dpickhead"><span class="lbl">${SLOT_INFO[open].name}</span>
        <span class="grow">${it ? `${itemName(it)} <small class="dim">${itemGist(it)}</small>` : `<span class="dim">${open === 'weapon' ? 'A practice ' + WEAPON_NAMES[g.cls] : 'Nothing worn'}</span>`}</span>
        ${sm ? `<small class="gold"${tip('The blacksmith has something better for this slot today. He will fit it straight onto him.')}>smith: ${sm} better</small>` : ''}
        ${it ? `<button class="mini" data-act="unequip" data-v="${g.id}" data-w="${open}"${tip('Take it off him; it goes back to the racks.')}>Take off</button>` : ''}</div>
      <div class="dpicktiles">${tiles || `<span class="dim">Nothing on the racks fits this slot${open === 'weapon' ? ': only a ' + WEAPON_NAMES[g.cls] + ' will do for him' : ''}.</span>`}</div></div>`;
  }
  const gs = gearStats(g), bare = SLOTS.filter(k => !g.gear[k]).length;
  return `<div class="today"><span class="lbl">Kit</span><div><b class="num">+${gs.dmg.toFixed(1)}</b> damage on every blow &middot; <b class="num">${gs.armor.toFixed(1)}</b> taken off every blow against him${gs.dodge < 0 ? ` &middot; <span class="bad">${(gs.dodge * 100).toFixed(1)}%</span> dodge for the weight` : ''}.${bare ? ` ${bare} of 6 slots ${bare === 1 ? 'is' : 'are'} bare.` : ''}${gs.full ? ` <span class="gold"${tip('All five pieces of armour worn: 8% more protection, or 14% if they are all of one grade.')}>${gs.full === 2 ? 'A matched harness: +14%.' : 'A full harness: +8%.'}</span>` : ''}
      ${better.length ? `<button class="mini primary" data-act="wearbest" data-v="${g.id}" style="margin-left:6px"${tip('Puts on the best spare piece from your racks for every slot where one would be a gain.')}>Wear the best from the racks (${better.length})</button>` : ''}</div></div>
    <div class="dollbox"><div class="doll">
      <div class="dollcol">${['head', 'shoulders', 'chest'].map(s => slotBox(s, 'l')).join('')}</div>
      <canvas class="dollfig" width="192" height="224" data-figure="${g.id}"${tip('As he stands on the sand, in the kit he wears now.')}></canvas>
      <div class="dollcol">${['weapon', 'arms', 'legs'].map(s => slotBox(s, 'r')).join('')}</div>
    </div></div>
    ${pick}`;
}

// A piece in a few words, and what it would change for a man against what he wears now.
const itemGist = it => it.slot === 'weapon' ? `+${itemStats(it).dmg} damage` : `${itemStats(it).armor.toFixed(1)} off a blow`;
function itemDelta(it, g) {
  const cur = g.gear && g.gear[it.slot], a = itemStats(it), b = cur ? itemStats(cur) : null;
  const d = it.slot === 'weapon' ? a.dmg - (b ? b.dmg : 0) : a.armor - (b ? b.armor : 0), unit = it.slot === 'weapon' ? 'damage' : 'off a blow';
  const n = +Math.abs(d).toFixed(1);
  return { d, short: Math.abs(d) < 0.05 ? '=' : `${d > 0 ? '+' : '&minus;'}${n}`, text: Math.abs(d) < 0.05 ? 'no change' : `${d > 0 ? '+' : '&minus;'}${n} ${unit}` };
}

function viewSmith() {
  const S = G.smith, lv = S.level, odds = SMITH_ODDS[lv], dg = daysToGames();
  const range = RARITY.filter((_, i) => odds[i] > 0);
  const best = it => G.roster.filter(g => fits(it, g) && (!g.gear[it.slot] || g.gear[it.slot].r < it.r)).map(g => g.name);
  const mine = G.armoury.slice().sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) || b.r - a.r);
  const wornAll = G.roster.flatMap(g => SLOTS.map(k => g.gear && g.gear[k]).filter(Boolean));
  const it = keepSel('isel', S.stock.concat(mine, wornAll)), own = !!it && G.armoury.includes(it), wearer = it ? G.roster.find(g => SLOTS.some(k => g.gear && g.gear[k] === it)) : null, yours = own || !!wearer;
  noteItems();
  // the stall: a tile to a piece, with its picture, what it is, who it would better, and its price
  const row = x => lrow('isel', x.id, `<span class="dpic" data-cmp="${x.id}">${itemArt(x, 72)}${best(x).length ? `<u class="up">&#9650;</u>` : ''}${x.pride ? `<u class="pride">&#9733;</u>` : ''}</span>
      <span class="nm"><span class="rar r${x.r}">${RARITY[x.r]}</span> ${x.slot === 'weapon' ? WEAPON_NAMES[x.cls] : SLOT_INFO[x.slot].piece}</span>
      <small${best(x).length ? tip('Better than what they wear now: ' + best(x).join(', ') + '.') : x.pride ? tip('The piece on the stall he is proudest of. He lets it go a fifth cheap, to a house whose men will be seen wearing it.') : ''}>${best(x).length ? `<span class="good">for ${best(x).length === 1 ? best(x)[0] : best(x).length + ' men'}</span>` : x.slot === 'weapon' && !G.roster.some(g => g.cls === x.cls) ? '<span class="dim">no one can use it</span>' : `<span class="dim">${itemGist(x)}</span>`}</small>
      <b class="num ${G.denarii < buyPrice(x) ? 'bad' : 'gold'}">${buyPrice(x)}</b>`, 'stile');
  const stock = S.stock.map(x => row(x)).join('') || '<div class="listnote">He has sold everything he had. Come back after the next games.</div>';
  const tile = x => `<button ${tileLook(x, 'rtile big' + (ui.isel === x.id ? ' sel' : ''))} data-act="rowsel" data-v="isel" data-w="${x.id}" data-cmp="${x.id}">${itemArt(x, 72)}${best(x).length ? '<u>&#9650;</u>' : ''}</button>`;
  const racks = mine.length ? mine.map(tile).join('') : '<div class="listnote">The racks are empty. A piece you buy without giving it to a man waits here.</div>';
  // every man's kit at a glance: one cell a slot
  const kit = G.roster.map(g => {
    const gs = gearStats(g);
    return `<div class="kitrow"><span class="nm">${g.name}</span>${SLOTS.map(slot => { const x = g.gear && g.gear[slot]; return x ? `<span class="kc ${ui.isel === x.id ? 'sel' : ''}" data-act="rowsel" data-v="isel" data-w="${x.id}" data-cmp="${x.id}">${itemArt(x, 36)}</span>` : `<span class="kc"${tip(`${SLOT_INFO[slot].name}: ${slot === 'weapon' ? 'a practice ' + WEAPON_NAMES[g.cls] : 'nothing'}.`)}>${slotPic(null, slot, 36)}</span>`; }).join('')}<small class="num ${gs.full ? 'gold' : ''}"${gs.full ? tip(gs.full === 2 ? 'A full harness, all of one grade: 14% more protection.' : 'A full harness: 8% more protection. All five pieces of one grade would make it 14%.') : ''}>+${gs.dmg.toFixed(0)} dmg &middot; ${gs.armor.toFixed(1)} off${gs.full === 2 ? '+' : ''}</small></div>`;
  }).join('');
  const kitHead = `<div class="kitrow head"><span class="nm"></span>${SLOTS.map(slot => `<span${tip(SLOT_INFO[slot].name)}>${ic('slot-' + slot)}</span>`).join('')}<small></small></div>`;
  let card = '';
  if (it) {
    const price = buyPrice(it), short = !yours && G.denarii < price;
    const wearers = G.roster.filter(g => fits(it, g)).map(g => ({ g, dl: itemDelta(it, g) })).sort((a, b) => b.dl.d - a.dl.d).map(({ g, dl }) => {
      const cur = g.gear[it.slot];
      return `<div class="lrow wearer" style="cursor:default"${tip(`${g.name}, ${CLASSES[g.cls].name}, power ${rating(g)}. Now: ${cur ? RARITY[cur.r] + ' ' + itemName(cur) : 'nothing'}.`)}><div class="grow"><span class="t">${g.name} <small class="inl">${CLASSES[g.cls].name} &middot; power ${rating(g)}</small></span>
          <small>now: ${cur ? `${RARITY[cur.r]} ${itemName(cur)}` : it.slot === 'weapon' ? 'a practice ' + WEAPON_NAMES[g.cls] : 'nothing'}</small></div>
        <span class="end num ${dl.d > 0.05 ? 'good' : dl.d < -0.05 ? 'bad' : 'dim'}">${dl.text}</span>
        ${wearer ? '' : own ? `<button class="mini ${dl.d > 0.05 ? 'primary' : ''}" data-act="equip" data-v="${g.id}" data-w="${it.id}">Give him</button>`
              : `<button class="mini ${dl.d > 0.05 ? 'primary' : ''}" data-act="smithgive" data-v="${it.id}" data-w="${g.id}" ${short ? 'disabled' : ''}>Buy for him</button>`}</div>`;
    }).join('');
    card = `<div class="panel item"><div class="itemhead">${itemArt(it, 108)}<div style="flex:1"><h3>${itemTag(it)}</h3>
      <div class="dim" style="font-size:12px;text-transform:uppercase;letter-spacing:.06em">${SLOT_INFO[it.slot].name}${it.slot === 'weapon' ? ' &middot; ' + CLASSES[it.cls].name : ''}</div>
      <div style="font-size:13px;margin-top:3px">${itemEffect(it)}</div></div></div>
      ${yours ? (() => {
        const rb = reforgeBlock(it), work = Object.keys(FITS).filter(k => FITS[k].weapon === (it.slot === 'weapon'));
        return `<div class="workrow"><span class="lbl"${tip('Work the smith will do on a piece you own, on the racks or on a man.')}>Smith's work</span>
          <button class="mini" data-act="reforge" data-v="${it.id}" ${rb ? 'disabled' : ''}${tip(`Takes it up one grade, to ${it.r < 6 ? RARITY[it.r + 1] : RARITY[6]}, for less than a new piece would cost. ${reforgeLimit() > 1 ? 'Two pieces' : 'One piece'} between games (${reforgesDone()} done). About ${Math.round(masterChance('reforge') * 100)} times in 100 it comes out master-wrought.${rb ? '\n' + rb : ''}`)}>Reforge${it.r < 6 ? ` to ${RARITY[it.r + 1]} &mdash; ${reforgeCost(it)}` : ''}</button>
          ${it.fit ? `<span class="chip gold"${tip(FITS[it.fit].what)}>${FITS[it.fit].name}</span><button class="mini" data-act="strip" data-v="${it.id}" ${stripBlock(it) ? 'disabled' : ''}${tip(`Strikes the fitting off again, so that another can be put on.${stripBlock(it) ? '\n' + stripBlock(it) : ''}`)}>Strip it &mdash; ${stripCost(it)}</button>` : work.map(k => { const fb = fitBlock(it, k); return `<button class="mini" data-act="fit" data-v="${it.id}" data-w="${k}" ${fb ? 'disabled' : ''}${tip(`${FITS[k].what}\nOne fitting to a piece; it can be struck off again for half the cost.${fb ? '\n' + fb : ''}`)}>${FITS[k].name}</button>`; }).join('') + `<small class="dim num">${fitCost(it)}</small>`}</div>`; })() : ''}
      <div class="buyrow" style="margin:0 0 6px">${wearer ? `<small class="dim">Worn by <b>${wearer.name}</b>. Take it off him in his dossier to sell it or hand it on.</small>` : own ? `<button data-act="smithsell" data-v="${it.id}"${tip('He buys back at half the full price.')}>Sell back &mdash; ${Math.round(itemPrice(it) / 2)}</button><small class="dim">It is on your racks. Give it to a man below, or sell it back.</small>`
            : `<button data-act="smithbuy" data-v="${it.id}" ${short ? 'disabled' : ''}${tip('Buy it for the racks, to give out later. Key: B')}>Buy for the racks &mdash; ${price}</button><small class="${short ? 'bad' : 'dim'}">${short ? `You are ${price - G.denarii} denarii short.` : `Leaves you ${G.denarii - price}. Or buy it straight onto a man below.`}</small>`}</div>
      ${wearer ? '' : wearers ? `<div class="sendhead"><span>Who could wear it, best gain first</span></div><div class="list wearers ${G.roster.filter(g => fits(it, g)).length > 4 ? 'twoup' : ''}">${wearers}</div>` : `<div class="dim" style="font-size:13px">${it.slot === 'weapon' ? `Only a ${CLASSES[it.cls].name} can use it, and you have none.` : 'You have no one to wear it.'}</div>`}
    </div>`;
  }
  const up = lv < 4 ? SMITH_COST[lv] : 0;
  const forge = `<div class="panel" style="margin-top:8px"><div class="row">
      <div style="flex:1;min-width:200px"><h3${tip('smithlevel')}>${SMITH_NAMES[lv]} <span class="pips">${'●'.repeat(lv)}${'○'.repeat(4 - lv)}</span></h3>
      <div class="dim" style="font-size:13px">Offers ${4 + lv} pieces each games day, graded ${range[0]} to ${range[range.length - 1]}.${lv < 4 ? ` <span class="gold">Improved: ${5 + lv} pieces, graded ${RARITY.filter((_, i) => SMITH_ODDS[lv + 1][i] > 0)[0]} to ${RARITY.filter((_, i) => SMITH_ODDS[lv + 1][i] > 0).slice(-1)[0]}.</span>` : ' There is no finer forge in the empire.'}</div></div>
      ${lv < 4 ? `<div style="text-align:right"><button data-act="smithup" ${G.denarii < up ? 'disabled' : ''}>Improve the forge &mdash; ${up}</button>${G.denarii < up ? `<small class="bad" style="display:block;font-size:11px">short by ${up - G.denarii}</small>` : ''}</div>` : ''}
    </div>
    <div class="workrow" style="margin-top:6px"><span class="lbl"${tip(`Pay now, a fifth over the price, and a piece of the kind you name is on your racks at the next games: grade ${RARITY[forgeMax()]}, the best this forge makes. About ${Math.round(masterChance('order') * 100)} times in 100 it comes out master-wrought: better than its grade, and for good.`)}>Commission</span>
      ${S.order ? `<b class="gold">${RARITY[S.order.r]} ${S.order.slot === 'weapon' ? WEAPON_NAMES[S.order.cls] : SLOT_INFO[S.order.slot].piece}</b> <small class="dim">ready at the next games</small>`
        : [...new Set(G.roster.map(g => g.cls))].map(k => `<button class="mini" data-act="smithorder" data-v="weapon" data-w="${k}" ${orderItemBlock('weapon') ? 'disabled' : ''}${tip(`A grade ${RARITY[forgeMax()]} ${WEAPON_NAMES[k]} for ${orderItemCost('weapon')}.`)}>${WEAPON_NAMES[k]}</button>`).join('')
          + ARMOR_SLOTS.map(k => `<button class="mini" data-act="smithorder" data-v="${k}" ${orderItemBlock(k) ? 'disabled' : ''}${tip(`A grade ${RARITY[forgeMax()]} ${SLOT_INFO[k].piece} for ${orderItemCost(k)}.`)}>${SLOT_INFO[k].piece}</button>`).join('')}</div>
    ${outclassed().length ? `<div class="workrow" style="margin-top:4px"><span class="lbl">Racks</span><button class="mini ${ui.clearArm ? 'primary' : ''}" data-act="smithclear"${tip(`Sells the ${outclassed().length} spare piece${outclassed().length === 1 ? '' : 's'} that would better nobody you have and are not the best of their kind on the racks: ${outclassed().map(x => RARITY[x.r] + ' ' + itemName(x)).join(', ')}.`)}>${ui.clearArm ? 'Sure? ' : ''}Sell what no one needs &mdash; ${outclassed().reduce((n, x) => n + Math.round(itemPrice(x) / 2), 0)}</button></div>` : ''}
    ${armourerRow()}
    </div>`;
  return `<div class="fill even">
    <div><h2>For sale <small>${S.stock.length} piece${S.stock.length === 1 ? '' : 's'}</small></h2>
      <div class="panel schoolbar"><div class="tally">
        <span${tip('denarii')}>purse <b class="num">${G.denarii}</b></span>
        <span${tip('The smith lays out new pieces every games day; what he has not sold is gone.')}>new stock ${dg === 0 ? '<b>today</b>' : `in <b class="num">${dg}</b> day${dg === 1 ? '' : 's'}`}</span>
        <span${tip('armoury')}><b class="num">${G.armoury.length}</b> spare on your racks</span>
        <span${tip('rarity')}>grades ${RARITY.map((r, k) => `<span class="rar r${k}">${r}</span>`).join('')}</span></div></div>
      <div class="pane" data-pane="smith"><div class="panel list stall">${stock}</div>
      <h2${tip('armoury')}>Your armoury <small>${G.armoury.length} spare ${G.armoury.length === 1 ? 'piece' : 'pieces'} &middot; &#9650; a gain for someone</small></h2><div class="panel racks">${racks}</div>
      ${kit ? `<h2>What your men wear</h2><div class="panel kit ${G.roster.length > 4 ? 'two' : ''}">${kitHead}${G.roster.length > 4 ? kitHead : ''}${kit}</div>` : ''}</div></div>
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
      <span class="dim">${RANKS[g.rank].name} ${CLASSES[g.cls].name}, ${g.wins} victories, might ${Math.round(power(g))}</span></p>`).join('');
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

const LOG_FILTERS = [['all', 'Everything'], ['gold', 'Great days'], ['good', 'Good news'], ['bad', 'Bad news']];
const LOG_ABOUT = [['all', 'Any matter'], ['sand', 'The sand'], ['road', 'The road'], ['house', 'The house'], ['men', 'The men']];
function viewChronicle() {
  const f = LOG_FILTERS.some(x => x[0] === ui.lfilter) ? ui.lfilter : 'all';
  const topic = LOG_ABOUT.some(x => x[0] === ui.ltopic) ? ui.ltopic : 'all';
  const shown = G.log.filter(e => (f === 'all' || e.k === f) && logTopic(e, topic));
  // the days, newest first, each under its own heading
  // a page holds what the pane can show without scrolling: lines are counted, a long entry as two
  const pages = [[]]; { let used = 0, d0 = null; for (const e of shown.slice().reverse()) { const cost = (e.d !== d0 ? 1.2 : 0) + (String(e.t).replace(/<[^>]+>/g, '').length > 78 ? 2 : 1); if (used + cost > 17 && pages[pages.length - 1].length) { pages.push([]); used = 0; d0 = null; } used += cost; d0 = e.d; pages[pages.length - 1].push(e); } }
  const pg = clamp(ui.lpage || 0, 0, pages.length - 1); ui.lpage = pg;
  const pager = pages.length > 1 ? `<div class="pager"><button class="mini" data-act="lpage" data-v="-1" ${pg === 0 ? 'disabled' : ''}>&lsaquo; Newer</button><span>Page ${pg + 1} of ${pages.length}</span><button class="mini" data-act="lpage" data-v="1" ${pg >= pages.length - 1 ? 'disabled' : ''}>Older &rsaquo;</button></div>` : '';
  let rows = '', day = null;
  for (const e of pages[pg]) {
    if (e.d !== day) { day = e.d; const ago = G.day - e.d, P = G.dayPurse || {}, net = P[e.d] !== undefined && P[e.d - 1] !== undefined ? P[e.d] - P[e.d - 1] : null;
      rows += `<div class="dayhead"><b>Day ${e.d}</b><span>${ago === 0 ? 'today' : ago === 1 ? 'yesterday' : ago + ' days ago'}${e.d > 0 && e.d % GAMES_EVERY === 0 ? ' &middot; a games day' : ''}${net !== null ? ` &middot; <b class="num ${net < 0 ? 'bad' : net > 0 ? 'good' : 'dim'}"${tip('What the purse gained or lost over that whole day, everything counted.')}>${net > 0 ? '+' : ''}${net}</b> denarii` : ''}</span></div>`; }
    rows += `<div class="entry ${e.k}">${e.t}</div>`;
  }
  const count = k => G.log.filter(e => e.k === k).length;
  const filters = LOG_FILTERS.map(([k, n]) => `<button class="${f === k ? 'on' : ''}" data-act="lfilter" data-v="${k}">${n}${k === 'all' ? '' : ` <span class="num">${count(k)}</span>`}</button>`).join('');
  const abouts = LOG_ABOUT.map(([k, n]) => `<button class="${topic === k ? 'on' : ''}" data-act="ltopic" data-v="${k}"${k === 'all' ? '' : tip(`Only what concerns ${n.toLowerCase()}, judged from the words of each entry.`)}>${n}${k === 'all' ? '' : ` <span class="num">${G.log.filter(e => (f === 'all' || e.k === f) && logTopic(e, k)).length}</span>`}</button>`).join('');
  // where the house stands
  const t = tier(), nextFame = t < TIERS.length - 1 ? TIERS[t + 1].fame : FINAL_FAME, base = TIERS[t].fame, T = G.tally, fought = T.wins + T.losses;
  const place = G.houses.filter(H => H.prestige > G.fame).length + 1;
  const standing = `<div class="panel housestand">
      <div class="kvs">
        <div><span>Day</span><b class="num">${G.day}</b><small>${G.dynasty.gen > 1 ? ordinal(G.dynasty.gen) + ' generation' : 'of this ludus'}</small></div>
        <div><span>Bouts</span><b class="num">${T.wins}&ndash;${T.losses}</b><small>${fought ? Math.round(T.wins / fought * 100) + '% won' : 'none fought yet'}</small></div>
        <div><span>Standing</span><b class="num">${cap1(ordinal(place))}</b><small>of ${G.houses.length + 1} schools</small></div>
        <div><span>Fallen</span><b class="num ${G.fallen.length ? 'bad' : ''}">${G.fallen.length}</b><small>${G.roster.length} in the cells now</small></div>
      </div>
      <div class="famerow"${tip('fame')}><span>${TIERS[t].name}</span>${bar('prog', G.fame - base, nextFame - base)}<b class="num">${G.fame}</b></div>
      <div class="dim" style="font-size:12px">${G.won ? 'The Great Arena is won. Everything after this is glory.' : t < TIERS.length - 1 ? `${nextFame - G.fame} more fame opens the ${TIERS[t + 1].name}: richer purses, harder men.` : `${Math.max(0, nextFame - G.fame)} more fame brings the final games.`}</div>
    </div>`;
  // the men who have done most for it
  const lead = (label, key, unit) => { const g = G.roster.slice().sort((a, b) => b[key] - a[key])[0]; return g && g[key] > 0 ? `<div><span>${label}</span><b>${g.name}</b><small>${g[key]} ${unit}${g[key] === 1 ? '' : 's'}</small></div>` : ''; };
  const honours = lead('Most victories', 'wins', 'win') + lead('Most kills', 'kills', 'kill') + lead('Most famous', 'fame', 'fame');
  // the years: where the house stood on each games day
  const A = (G.annals || []).slice(-40), top = Math.max(1, ...A.map(x => x.f));
  const years = A.length > 1 ? `<h2>The years <small>fame on each games day</small></h2><div class="panel"><div class="spark years"${tip(`Fame at each games day, from day ${A[0].d} to day ${A[A.length - 1].d}: ${A[0].f} to ${A[A.length - 1].f}. The marks are where each greater arena opens.`)}>${A.map(x => `<i style="height:${Math.max(4, Math.round(x.f / top * 100))}%"${tip(`Day ${x.d}: ${x.f} fame, ${x.w} won and ${x.l} lost, ${x.c} denarii.`)}></i>`).join('')}${TIERS.filter(x => x.fame > 0 && x.fame < top).map(x => `<u style="bottom:${Math.round(x.fame / top * 100)}%"></u>`).join('')}</div></div>` : '';
  const tabs = [['house', 'The house'], ['deeds', `Deeds <span class="num">${deedCount()}/${DEEDS.length}</span>`], ['records', 'Records'], ['men', `The men <span class="num">${G.fallen.length + (G.alumni || []).length}</span>`]];
  const ct = tabs.some(x => x[0] === ui.ctab) ? ui.ctab : 'house';
  let right;
  if (ct === 'deeds') {
    const row = D => { const day = (G.deeds || {})[D.id], at = D.at ? D.at() : null;
      return `<div class="deed ${day ? 'done' : ''}"${tip(`${D.name}: ${D.what}${day ? `\nDone on day ${day}.` : at ? `\n${Math.min(at[0], at[1])} of ${at[1]} so far.` : '\nNot yet.'}`)}><b>${D.name}</b><small>${D.what}</small><span class="num">${day ? 'day ' + day : at ? `${Math.min(at[0], at[1])}/${at[1]}` : '&mdash;'}</span></div>`; };
    right = `<div class="deeds"${tip('Each deed is done once and stays done. If the house falls, every deed is a point of legacy for the heir.')}>${DEEDS.map(row).join('')}</div>`;
  } else if (ct === 'records') {
    const R = G.records || {}, rec = (label, k, fmt, none) => { const x = R[k]; return `<div${x ? tip(`${x.who}, against ${x.vs || 'the field'}, on day ${x.day}.`) : ''}><span>${label}</span><b class="num ${x ? '' : 'dim'}">${x ? fmt(x.v) : '&mdash;'}</b><small>${x ? `${x.who} &middot; day ${x.day}` : none}</small></div>`; };
    const count = (label, v, sub) => `<div><span>${label}</span><b class="num ${v ? '' : 'dim'}">${v || 0}</b><small>${sub}</small></div>`;
    right = `<h2>The best of the house <small>in a single bout won</small></h2><div class="panel"><div class="kvs three recs">
        ${rec('Richest purse', 'purse', v => v, 'no bout won yet')}${rec('Most fame', 'fame', v => '+' + v, 'no bout won yet')}${rec('Biggest wager won', 'wager', v => v, 'no wager won yet')}
        ${rec('Quickest win', 'quick', v => v + 's', 'no bout won yet')}${rec('Longest fight won', 'long', v => v + 's', 'no bout won yet')}${rec('Loudest crowd', 'crowd', v => v + '%', 'no bout won yet')}</div></div>
      <h2>The tally</h2><div class="panel"><div class="kvs three recs">
        ${count('Longest run', G.bestStreak, 'victories in a row')}${count('Clean sweeps', G.sweeps, 'whole cards won')}${count('Festival crowns', trophies(), 'held by the house')}
        ${count('Laurels', (G.laurels || []).filter(x => !x.hid).length, 'tournaments won')}${count('Title defences', G.title && G.title.house === null ? G.title.defences : 0, G.title && G.title.house === null ? `${G.title.name} holds it` : 'the title is not yours')}${count('Bounties', wildMap().bounties, 'taken in the province')}
        ${count('Places dealt with', wildMap().cleared, 'out in the country')}${count('Regions safe', safeRegions().length, `of ${Object.keys(regionTally()).length}`)}${count('Deeds', deedCount(), `of ${DEEDS.length}`)}</div></div>`;
  } else if (ct === 'men') {
    const WHY = { freed: 'freed', sold: 'sold', deserted: 'ran' };
    const fallen = G.fallen.slice(-12).reverse().map(x => `<div class="lrow" style="cursor:default"${tip(`${x.name}${CLASSES[x.cls] ? ', ' + CLASSES[x.cls].name : ''}: ${x.wins} ${x.wins === 1 ? 'victory' : 'victories'}. Died on day ${x.day}${x.by ? ', killed by ' + x.by : ''}.`)}><div class="grow"><span class="t">${x.name}</span></div><span class="end dim">${x.wins}W &middot; day ${x.day}</span></div>`).join('');
    const gone = (G.alumni || []).slice(-8).reverse().map(x => `<div class="lrow" style="cursor:default"${tip(`${x.name}${CLASSES[x.cls] ? ', ' + CLASSES[x.cls].name : ''}: ${x.wins} ${x.wins === 1 ? 'victory' : 'victories'}, ${x.kills} kill${x.kills === 1 ? '' : 's'}. ${x.why === 'freed' ? 'Given his freedom' : x.why === 'sold' ? 'Sold' : 'Ran'} on day ${x.day}.`)}><div class="grow"><span class="t">${x.name}</span></div><span class="end ${x.why === 'freed' ? 'gold' : 'dim'}">${WHY[x.why] || x.why} &middot; day ${x.day}</span></div>`).join('');
    right = `${honours ? `<h2>Honours <small>of the men you have now</small></h2><div class="panel"><div class="kvs three">${honours}</div></div>` : ''}
      <h2>The fallen <small>${G.fallen.length}${G.fallen.length > 12 ? ', the last twelve shown' : ''}</small></h2>${fallen ? `<div class="panel list tight twoup">${fallen}</div>` : '<div class="listnote">No fighter of this house has died yet.</div>'}
      <h2>Those who left <small>${(G.alumni || []).length}${(G.alumni || []).length > 8 ? ', the last eight shown' : ''}</small></h2>${gone ? `<div class="panel list tight twoup">${gone}</div>` : '<div class="listnote">Nobody has been sold, freed or lost to the road.</div>'}`;
  } else {
    right = `${standing}${years}${provincePanel()}${dynastyPanel()}
      <p style="margin-top:10px" class="row"><button data-act="tuton"${tip('steward')}>Summon the steward (tutorial)</button><button data-act="askreset">Abandon this ludus and start anew</button></p>`;
  }
  return `<div class="fill">
    <div><h2>Chronicle <small>${shown.length} of the last ${G.log.length} entries</small></h2>
      <div class="subtabs logtabs">${filters}</div>
      <div class="subtabs logtabs about">${abouts}<button class="copy" data-act="lcopy" ${shown.length ? '' : 'disabled'}${tip('Copies what is listed here, every page of it, as plain text: to keep the story of the house, or to send it to somebody.')}>${ui.lcopied === G.day + ':' + shown.length ? 'Copied' : 'Copy'}</button></div>
      <div class="pane" data-pane="log-${f}-${topic}-${pg}"><div class="panel log">${rows || '<div class="dim">Nothing of that kind has happened yet.</div>'}</div>${pager}</div></div>
    <div><h2>The annals</h2>
      <div class="subtabs logtabs">${tabs.map(([k, n]) => `<button class="${ct === k ? 'on' : ''}" data-act="ctab" data-v="${k}"${k === 'deeds' ? tip('Things the house has done once and for all. Each is a point of legacy for the heir if the house falls.') : ''}>${n}</button>`).join('')}</div>
      <div class="pane" data-pane="annals-${ct}">${right}</div></div>
  </div>`;
}

// The whole man as the arena draws him, in what he wears now, against the arena's wall and sand.
function paintFigure(cv, g) {
  const ctx = cv.getContext('2d'), k = 4, w = cv.width / k, h = cv.height / k;
  ctx.setTransform(k, 0, 0, k, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#54433a'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#483930';
  for (let y = 4, r = 0; y < h - 8; y += 6, r++) { ctx.fillRect(0, y, w, 1); for (let x = r % 2 ? 4 : 10; x < w; x += 12) ctx.fillRect(x, y - 5, 1, 5); }
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, 0, w, 2);
  ctx.fillStyle = '#c9a763'; ctx.fillRect(0, h - 8, w, 8); ctx.fillStyle = '#a88a52'; ctx.fillRect(0, h - 8, w, 1);
  drawSprite(ctx, { x: Math.round(w / 2) - 4, y: Math.round(h) - 4, facing: 1, g, team: 0, col: TEAM_COL[0], colD: TEAM_DARK[0],
    moving: false, walk: 0, clock: 0, atkAnim: 0, flash: 0, down: false, snare: 0, slash: 0,
    hurt: g.hp < maxHp(g) * 0.3 ? 3 : g.hp < maxHp(g) * 0.55 ? 2 : g.hp < maxHp(g) * 0.8 ? 1 : 0 });
}

function paintPortraits() {
  document.querySelectorAll('[data-item]').forEach(paintItem);
  document.querySelectorAll('[data-portrait]').forEach(cv => { const g = byId(cv.dataset.portrait); if (g) drawPortrait(cv, g, 0); });
  document.querySelectorAll('[data-figure]').forEach(cv => { const g = byId(cv.dataset.figure); if (g) paintFigure(cv, g); });
  document.querySelectorAll('[data-rportrait]').forEach(cv => {
    const [hid, gid] = cv.dataset.rportrait.split(':');
    const g = houseOf(hid).roster.find(x => x.id === +gid), d = houseDef(hid);
    if (g) drawPortrait(cv, g, 1, d.col, d.colD);
  });
  document.querySelectorAll('[data-mportrait]').forEach(cv => { const g = G.market.find(m => m.id === +cv.dataset.mportrait) || (G.auction && G.auction.g.id === +cv.dataset.mportrait ? G.auction.g : null); if (g) drawPortrait(cv, g, 0); });
}

// ---------- events and end states ----------

// ---- a matter that wants an answer ----
// Where each kind of thing happens, for the picture over it: the yard unless it is somewhere else.
const EVENT_SCENE = {
  market: ['volunteer', 'merchant', 'fugitive', 'cargo', 'coins', 'hound', 'thief'],
  smith: ['smithCart', 'dig'],
  facilities: ['healer', 'masseur', 'fever', 'meat', 'rats', 'tax'],
  patrons: ['feast', 'dinner', 'vigil', 'omen', 'rites', 'sponsor', 'fix', 'foundersDay', 'noble', 'widow'],
  arena: ['gift', 'graffiti', 'poet', 'sculptor', 'admirers', 'tout'],
  rivals: ['poach', 'poison', 'truce', 'sparring', 'boast', 'spy', 'slander', 'editorsEar', 'defector'],
};
function eventScene(id) {
  const E = EVENTS[id];
  if (E.wild) return '';
  if (E.field) return 'contracts';
  for (const k in EVENT_SCENE) if (EVENT_SCENE[k].includes(id)) return k;
  return 'ludus';
}
let evFaces = [];
// Whoever it concerns, with his face: the men named in it, or the stranger at the gate.
function eventPeople(c) {
  evFaces = [];
  for (const k of ['g', 'a', 'b']) { const v = c && c[k], g = typeof v === 'number' ? byId(v) : v && v.stats && v.name ? v : null; if (g && !evFaces.includes(g)) evFaces.push(g); }
  if (c && c.h && c.r) { const H = houseOf(c.h), g = H && H.roster.find(x => x.id === c.r); if (g) evFaces.push(g); }
  if (!evFaces.length) return '';
  return `<div class="evwho">${evFaces.map((g, i) => `<div><canvas width="96" height="112" data-evface="${i}"></canvas><div><b>${g.name}</b><small>${CLASSES[g.cls] ? CLASSES[g.cls].name : ''} &middot; power ${rating(g)}${G.roster.includes(g) ? ` &middot; ${g.wins}W ${g.losses}L` : ' &middot; a stranger'}</small>
      ${G.roster.includes(g) ? `<div class="evbars"><span${tip('health')}>${bar('hp', g.hp, maxHp(g))}</span><span${tip('fatigue')}>${bar('fat', g.fatigue, 100)}</span><span${tip('morale')}>${bar('mor', g.morale, 100)}</span></div>` : ''}</div></div>`).join('')}</div>`;
}
const eventArt = id => { const sc = eventScene(id), y = $('#yard'); return sc ? `<canvas class="evart" data-evart="${sc}" width="${y && y.width > 100 ? y.width : 1180}" height="${y && y.width > 100 ? y.height : 380}"></canvas>` : ''; };
function paintEventArt() {
  document.querySelectorAll('[data-evface]').forEach(cv => { const g = evFaces[+cv.dataset.evface]; if (g) try { drawPortrait(cv, g, 0); } catch (e) { cv.style.display = 'none'; } });
  document.querySelectorAll('[data-evart]').forEach(cv => {
    try { const T = performance.now() / 1000; if (cv.dataset.evart === 'ludus') drawYard(cv, T); else drawPlace(cv, T, cv.dataset.evart); } catch (e) { cv.style.display = 'none'; }
  });
}
// How things stood before an answer was given, and what the answer changed: shown under the outcome so that nobody has
// to take the telling's word for it.
function eventSnap() {
  const men = {}; for (const g of G.roster) men[g.id] = { name: g.name, morale: g.morale, fatigue: g.fatigue, injury: g.injury, hp: g.hp, str: g.stats.str, agi: g.stats.agi, skl: g.stats.skl, traits: g.traits.slice(), xp: g.xp || 0 };
  const feud = {}; for (const H of G.houses) feud[H.id] = H.grudge;
  return { den: G.denarii, fame: G.fame, pat: Object.assign({}, G.patrons), men, feud, arm: G.armoury.length };
}
function eventDiff(b) {
  const out = [], add = (text, cls) => out.push(`<span class="chip ${cls || ''}">${text}</span>`), sg = n => (n > 0 ? '+' : '&minus;') + Math.abs(Math.round(n));
  if (G.denarii !== b.den) add(`${sg(G.denarii - b.den)} denarii`, G.denarii > b.den ? 'gold' : 'red');
  if (G.fame !== b.fame) add(`Fame ${sg(G.fame - b.fame)}`, G.fame > b.fame ? 'gold' : 'red');
  for (const k in b.pat) if (Math.round(G.patrons[k] - b.pat[k])) add(`${PATRONS[k].name.replace(/^The /, '')} ${sg(G.patrons[k] - b.pat[k])}`, G.patrons[k] > b.pat[k] ? 'good' : 'red');
  for (const H of G.houses) { const d = Math.round(H.grudge - (b.feud[H.id] || 0)); if (d) add(`Feud with ${houseDef(H.id).name} ${sg(d)}`, d > 0 ? 'red' : 'good'); }
  if (G.armoury.length > b.arm) add(`${G.armoury.length - b.arm} piece${G.armoury.length - b.arm === 1 ? '' : 's'} for the racks`, 'gold');
  for (const g of G.roster) if (!b.men[g.id]) add(`${g.name} joins the ludus`, 'gold');
  for (const id in b.men) if (!G.roster.some(g => g.id === +id)) add(`${b.men[id].name} is gone`, 'red');
  // what it did to each man; the same thing done to several is said once
  const per = [];
  for (const g of G.roster) {
    const o = b.men[g.id]; if (!o) continue;
    const bits = [];
    for (const k of STATS) if (g.stats[k] > o[k]) bits.push([`${STAT_NAMES[k]} +${g.stats[k] - o[k]}`, 1]);
    for (const t of g.traits) if (!o.traits.includes(t) && TRAITS[t]) bits.push([`now ${TRAITS[t].name}`, TRAITS[t].good ? 1 : -1]);
    if (g.injury > o.injury) bits.push([`laid up ${g.injury} day${g.injury === 1 ? '' : 's'}`, -1]); else if (g.injury < o.injury) bits.push([g.injury ? `mends sooner (${g.injury}d)` : 'healed', 1]);
    if (Math.round(g.hp - o.hp) > 0 && g.injury >= o.injury) bits.push([`health ${sg(g.hp - o.hp)}`, 1]);
    if (Math.round(g.morale - o.morale)) bits.push([`morale ${sg(g.morale - o.morale)}`, g.morale > o.morale ? 1 : -1]);
    if (Math.round(g.fatigue - o.fatigue)) bits.push([`fatigue ${sg(g.fatigue - o.fatigue)}`, g.fatigue < o.fatigue ? 1 : -1]);
    if ((g.xp || 0) > o.xp) bits.push([`experience +${(g.xp || 0) - o.xp}`, 1]);
    for (const [t, good] of bits) { let e = per.find(x => x.t === t); if (!e) per.push(e = { t, good, who: [] }); e.who.push(g.name); }
  }
  for (const e of per) add(`${e.who.length >= 3 && e.who.length === G.roster.length ? 'Every man' : e.who.length > 3 ? e.who.length + ' men' : e.who.join(', ')}: ${e.t}`, e.good > 0 ? 'good' : 'red');
  return out.length ? `<div class="evfx"><span class="lbl">What changed</span>${out.join('')}</div>` : '';
}
function showEvent() {
  const pe = G.pendingEvent;
  if (pe && pe.c && pe.c.job !== undefined && { thief: 1, omen: 1, brawl: 1 }[pe.id]) pe.id = 'job' + pe.id[0].toUpperCase() + pe.id.slice(1);      // a save from when three events of the road went by the names of three at the school
  if (!pe || !EVENTS[pe.id]) { G.pendingEvent = null; return; }
  const E = EVENTS[pe.id];
  const btns = E.opts.map((o, i) => { const ok = !o.ok || o.ok(pe.c); return `<button class="evopt" data-act="evopt" data-v="${i}" ${ok ? '' : 'disabled'}><span class="k">${i + 1}</span><span>${o.label(pe.c)}</span>${ok ? '' : '<small>not possible now</small>'}</button>`; }).join('');
  const tt = tutorState(), first = (tt.on || tt.hints) && !tt.seen.event;
  if (first) { tt.seen.event = true; save(); }
  showModal(`<div class="ev">${eventArt(pe.id)}<h2>${E.title}</h2>${eventPeople(pe.c)}<p class="evtext">${E.text(pe.c)}</p>${first ? '<p class="evnote"><b>Your steward:</b> matters like this come up every few days, dominus. Each answer has its price; once you have chosen I will set out what it changed. A greyed answer is one the purse or the house cannot manage today.</p>' : ''}
    <div class="evopts">${btns}</div>
    <div class="evfoot"><span>Your purse: <b class="num ${G.denarii < 0 ? 'bad' : ''}">${G.denarii}</b> denarii</span><span>Keys 1&ndash;${E.opts.length} answer</span></div></div>`);
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
  const picks = tourneyBout ? [byId(G.tourney.entrant)].filter(Boolean) : (ui.picks[b.id] || []).map(byId).filter(g => g && boutFit(b, g));
  if (picks.length !== b.size) return;
  const tut = tutorState();
  if ((tut.on || tut.hints) && !tut.seen.fight) {
    tut.seen.fight = true; save(); ui.heldFight = [boutId, tourneyBout];
    showModal(`<h2>Before he goes out</h2>
      <p>Your men fight on their own, as they were trained and as their standing orders say. What you decide is their <b>abilities</b>.</p>
      <ul><li><b>The gold bar</b> under a man's health is his charge. It fills slowly by itself, and faster with every blow given or taken.</li>
      <li><b>When it is full, the fight stops</b> and you choose which of his abilities he uses: keys 1 to 4, or click. If you would rather they chose for themselves, switch <b>Abilities</b> to auto below the sand.</li>
      <li><b>You also choose who it is for.</b> With more than one foe standing, click one on the sand or in the panel (or press T) to aim at him. <b>All on him</b> (F) sets your whole side on that man; <b>Hold it</b> (W) keeps the charge for a better moment.</li>
      <li><b>Styles.</b> Strength beats Agility, Agility beats Skill, Skill beats Strength. The marks on the bout card show whose style has the edge.</li>
      <li><b>Throw in the cloth</b> (key C): your worst-hurt man yields at once. A man who yields is spared far more often than one struck down. Once a bout, and never in a fight to the death.</li></ul>
      <p>Below the sand you can run the fight faster, <b>pause</b> it (Space), or skip to the result. Rest the mouse on any fighter to see what he is and what he carries. The crowd's bar matters: an exciting fight earns more fame.</p>
      <div class="row"><button class="primary" data-act="fightgo">To the sand</button></div>`);
    return;
  }
  const wager = Math.min(ui.wagers[b.id] || 0, Math.max(0, G.denarii));
  const odds = winOdds(picks, boutEnemies(b));
  G.denarii -= wager;
  const B = createBattle(picks, boutEnemies(b), { ask: !ui.autoCast, death: b.death, mercy: [mercyBonus(), 0], tier: b.final ? 4 : tier(), names: ['Your ludus', b.hunt ? 'The beasts' : b.house], hunt: !!b.hunt,
    foeCol: b.houseId && houseDef(b.houseId).col, foeColD: b.houseId && houseDef(b.houseId).colD });
  B.cutins = !ui.noCut;                       // abilities are announced with a band across the screen
  B.fixedCam = !!ui.fixedCam;
  SFX.init(); SFX.play('horn'); SFX.music('arena');
  fight = { bout: b, B, speed: ui.fspeed || 1, wager, pay: odds.pay, wkind: (ui.wkind || {})[b.id] || 'win', last: 0, raf: 0 };
  $('#arenaHead').innerHTML = `<span style="color:${TEAM_COL[0]}">Your ludus</span> <span class="dim">vs</span> <span style="color:${b.houseId ? houseDef(b.houseId).col : '#6fa4e6'}">${b.house}</span>${b.death ? ' &middot; <span class="death">to the death</span>' : ''}`;
  $('#arena').hidden = false;
  paintSpeed(); paintOrders(); fitArena();
  drawBattle($('#arenaCanvas').getContext('2d'), B);
  fight.raf = requestAnimationFrame(fightLoop);
}
// A fight out in the province: every fit man you have, against whatever was waiting (wilds.js sets it up).
function startWildFight() {
  const F = G.field && G.field.fight;
  if (!F) return;
  const picks = fieldParty();
  if (!picks.length) { G.field.fight = null; return; }
  for (const e of F.foes) if (!e.name) e.name = e.beast ? 'The great beast' : 'Their leader';      // nobody goes into a fight without a name to be called by
  const B = createBattle(picks, F.foes, { ask: !ui.autoCast, wild: F.backdrop, hunt: true, mercy: [mercyBonus(), 0], names: ['Your school', F.title] });
  B.cutins = !ui.noCut;                       // abilities are announced with a band across the screen
  B.fixedCam = !!ui.fixedCam;
  SFX.init(); SFX.play('horn'); SFX.music('arena');
  fight = { wild: true, bout: null, B, speed: ui.fspeed || 1, wager: 0, pay: 0, last: 0, raf: 0 };
  $('#arenaHead').innerHTML = `<span style="color:${TEAM_COL[0]}">Your school</span> <span class="dim">against</span> <span style="color:#6fa4e6">${F.title}</span>`;
  $('#arena').hidden = false;
  paintSpeed(); paintOrders(); fitArena();
  drawBattle($('#arenaCanvas').getContext('2d'), B);
  fight.raf = requestAnimationFrame(fightLoop);
}
// The east gate of the village: the way out to the province.
// The stables stand outside the east wall, on the map of the province: walking up to them is how they are improved.
function stablesModal() {
  const f = FACILITIES.stables, l = G.fac.stables || 0, cost = FAC_COST[l], short = l < 3 && G.denarii < cost;
  const fe = FACILITIES.eagle, el = G.fac.eagle || 0, ecost = FAC_COST[el], eshort = el < 3 && G.denarii < ecost;
  const what = ['A paddock and a trough, and nothing in it. The school marches on its own feet.', 'A shed, a mule, and a boy who knows the roads.', 'Stalls for four, and a cart to carry what the men would otherwise carry.', 'A tiled range, a wagon and a team: the column travels like a legion\'s baggage.'][l];
  if (modalQueue.length) closeModal();
  showModal(`<h2>The stables <small>${grade(l)}</small></h2><p>${what}</p>
    <p style="color:#5a4326">${f.effect(l)}.${l < 3 ? ` Improved, for <b class="gold num">${cost}</b> denarii: ${lower(f.effect(l + 1))}.` : ' There is nothing more to build here.'}</p>
    <h3 style="margin:12px 0 4px">The eagle <small>${grade(el)}</small></h3><p>${['There is no mews. A falconer in the town has an eaglet he would part with, if there were somewhere to keep it.', 'A young eagle on a block in the yard, hooded, and a boy with a glove too big for him. It goes up when the column marches, and comes back.', 'A trained bird. It ranges a mile ahead and stoops over whatever is waiting there.', 'A hunting eagle the governor has asked after twice. Nothing in the country moves that it has not been over first.'][el]}</p>
    <p style="color:#5a4326">${fe.effect(el)}.${el < 3 ? (l < 1 ? ' It needs stables to be kept in.' : ` ${el ? 'Better trained' : 'Bought'}, for <b class="gold num">${ecost}</b> denarii: ${lower(fe.effect(el + 1))}.`) : ' It cannot be made better.'}</p>
    <div class="row">${l < 3 ? `<button class="primary" data-act="stablebuild" ${short ? 'disabled' : ''}${short ? tip(`You are ${cost - G.denarii} denarii short.`) : ''}>Improve the stables &mdash; ${cost}</button>` : ''}${el < 3 ? `<button class="${l >= 3 ? 'primary' : ''}" data-act="eaglebuild" ${l < 1 || eshort ? 'disabled' : ''}${l < 1 ? tip('Build the stables first: a bird needs a mews.') : eshort ? tip(`You are ${ecost - G.denarii} denarii short.`) : ''}>${el ? 'Train the eagle' : 'Buy the eagle'} &mdash; ${ecost}</button>` : ''}<button data-act="close">${l < 3 || el < 3 ? 'Not now' : 'Continue'}</button></div>`);
}
// Walking up to the fountain when somebody is waiting there: they say what they want.
function villageTalk(i) { if (typeof fountainTalk === 'function' && fountainTalk(i)) { save(); showEvent(); } }
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
      <ul><li><b>Marching takes time.</b> A day passes for each day's march: further by road, less through forest, hill and marsh. Point at a spot and the map says how many days it is; click, and it counts them down as you go.</li>
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
  // the cloth and the skip cannot be taken back, so each is armed by one press and done by a second within three seconds
  if (fight.armed && performance.now() - fight.armT > 3000) fight.armed = null;
  const can = canOrder(B, 'yield'), worst = can ? B.fighters.filter(x => x.team === 0 && !out(x)).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] : null;
  const sig = [can, worst ? worst.g.id : 0, fight.armed || '', B.towel, B.over].join();
  if (sig !== fight.armSig) {
    fight.armSig = sig;
    const y = $('#ordYield'), sk = $('#skipBtn');
    y.textContent = fight.armed === 'yield' ? `Sure? ${worst ? worst.g.name + ' yields' : 'Yield'}` : worst && B.fighters.filter(x => x.team === 0).length > 1 ? `Throw in the cloth: ${worst.g.name}` : 'Throw in the cloth';
    y.classList.toggle('armed', fight.armed === 'yield');
    y.dataset.tip = B.death ? 'There is no yielding in a bout to the death.' : B.towel ? 'The cloth has been thrown once already; it cannot be thrown again.' : B.over ? 'It is over.'
      : 'Throw in the cloth: your worst-hurt man yields at once. A man who yields is spared far more often than one struck down. Once per bout, and it cannot be taken back, so it asks you twice.';
    sk.textContent = fight.armed === 'skip' ? 'Sure? Skip it' : 'Skip to result';
    sk.classList.toggle('armed', fight.armed === 'skip');
  }
  const state = [canOrder(B, 'yield'), pick ? pick.g.id : 0, !!ui.autoCast, B.over, !!ui.noCut, pick && pick.target ? B.fighters.indexOf(pick.target) : -1, B.marked ? B.fighters.indexOf(B.marked) : -1].join();
  if (state === fight.ordState) return;
  fight.ordState = state;
  $('#ordYield').disabled = !canOrder(B, 'yield');
  $('#arenaOrders').style.display = B.hunt ? 'none' : '';
  $('#autoCast').textContent = ui.autoCast ? 'Abilities: auto' : 'Abilities: ask me';
  $('#cutBtn').textContent = ui.noCut ? 'Cut-ins: off' : 'Cut-ins: on';
  // the fight has stopped for one of yours: his abilities, to choose from
  const el = $('#arenaPick');
  el.hidden = !pick;
  if (pick) {
    const tg = pick.target && !out(pick.target) ? pick.target : null, edge = tg ? styleEdge(pick.style, tg.style) : 1;
    const side = (f, foe) => {
      const st = [];
      if (f.stun > 0.3) st.push('Stunned'); if (f.snare > 0) st.push('Netted'); if (f.hamstrung) st.push('Hamstrung'); if (f.armWound) st.push('Arm wounded');
      if (f.bleed > 0) st.push('Bleeding'); if (f.open > 0) st.push('Exposed'); if (f.weakT > 0) st.push('Weakened'); if (f.buff) st.push('Roused'); if (f.state === 'windup') st.push('Winding up');
      return `<div class="pside${foe ? ' foe' : ''}"><canvas width="96" height="112" data-rface="${B.fighters.indexOf(f)}"></canvas>
        <div><b>${f.g.beast ? 'The ' + f.c.name.toLowerCase() : f.g.name}</b> ${f.g.beast ? '' : styleMark(f.g)}<small>${foe ? 'his mark' : 'is charged'}</small>
        <div class="bar hp"><i style="width:${Math.round(clamp(f.hp / f.maxHp, 0, 1) * 100)}%"></i></div>
        <div class="st"><span class="num">${Math.max(0, Math.round(f.hp))} / ${f.maxHp}</span>${st.map(w => `<span class="chip">${w}</span>`).join('')}</div></div></div>`;
    };
    const reads = pick.abl.map(a => abilityRead(B, pick, a)), bestI = reads.reduce((b, r, i) => r.score > reads[b].score ? i : b, 0);
    const card = (a, i) => {
      const r = reads[i], n = pick.used[a.name] || 0;
      return `<button data-act="abpick" data-v="${a.id}" class="${i === bestI && pick.abl.length > 1 ? 'sug' : ''}" style="--sk:${a.skill ? STYLE_COL[a.skill] : '#e0aa3e'}">
        <span class="key">${i + 1}</span>${i === bestI && pick.abl.length > 1 ? '<span class="rib">Suggested</span>' : ''}
        <b>${a.skill ? ic(a.skill) : ''}${a.name}${pick.g.sig === a.id ? ' <span class="gold" title="His signature">&#9733;</span>' : ''}</b>
        ${a.cls && masteryRank(pick.g, a.id) ? `<span class="pmast">${MAST_NAMES[masteryRank(pick.g, a.id)]} ${'●'.repeat(masteryRank(pick.g, a.id))}</span>` : ''}
        <span class="tags">${abilityTags(a, pick.g).map(t => `<i>${t}</i>`).join('')}</span>
        <small>${a.desc}</small>
        ${r.notes.map(([t, good]) => `<span class="note ${good ? 'good' : 'bad'}">${good ? '&#9650;' : '&#9660;'} ${t}</span>`).join('')}
        <span class="foot"><span>${r.dmg ? `about <b>${r.dmg}</b> damage` : '&nbsp;'}</span>${n ? `<em>used ${n === 1 ? 'once' : n + ' times'}</em>` : ''}</span></button>`;
    };
    el.innerHTML = `<div class="phead">${side(pick)}<div class="pmid"><b>Choose</b>${tg ? (edge > 1 ? '<span class="good">&#9650; his style gives way to yours</span>' : edge < 1 ? '<span class="bad">&#9660; his style beats yours</span>' : '<span>neither style has the edge</span>') : '<span>no one in front of him</span>'}</div>${tg ? side(tg, true) : '<div class="pside foe"></div>'}</div>
      ${(() => {      // who it is to be used on: every foe still standing, to click; and the whole side can be set on him
        const foes = liveFoes(B, pick), mates = B.fighters.filter(x => x.team === 0 && !out(x)).length;
        if (foes.length < 2 && !(tg && mates > 1)) return '';
        const chips = foes.map(o => { const on = o === tg, nm = o.g.beast ? 'The ' + o.c.name.toLowerCase() : o.g.name, pct = Math.round(clamp(o.hp / o.maxHp, 0, 1) * 100), e = styleEdge(pick.style, o.style);
          return `<button class="tchip ${on ? 'on' : ''} ${B.marked === o ? 'marked' : ''}" data-act="abtarget" data-v="${B.fighters.indexOf(o)}"${tip(`${nm}: ${Math.max(0, Math.round(o.hp))} of ${o.maxHp} health${o.snare > 0 ? ', netted' : ''}${o.stun > 0.3 ? ', stunned' : ''}${o.bleed > 0 ? ', bleeding' : ''}.${e > 1 ? '\nYour man\'s style beats his.' : e < 1 ? '\nHis style beats your man\'s.' : ''}${on ? '\nThe ability will be used on him.' : '\nClick to aim at him.'}`)}>${o.g.beast ? '' : styleMark(o.g)}<b>${nm}</b><i class="bar hp"><i style="width:${pct}%"></i></i>${e > 1 ? '<em class="good">&#9650;</em>' : e < 1 ? '<em class="bad">&#9660;</em>' : ''}</button>`; }).join('');
        return `<div class="ptargets"><span class="lbl">${foes.length > 1 ? 'Aim at' : 'His mark'}</span>${foes.length > 1 ? chips : ''}
          ${tg && mates > 1 ? `<button class="mini ${B.marked === tg ? 'primary' : ''}" data-act="abmark"${tip('Set the whole side on this man: every one of yours goes for him until he is down. Press again to take it off.')}>${B.marked === tg ? 'All are on him' : 'All on him'} <span class="k">F</span></button>` : ''}</div>`; })()}
      <div class="abrow">${pick.abl.map(card).join('')}</div>
      <div class="pfoot"><span>Keys <b>1</b>&ndash;<b>${pick.abl.length}</b> choose${liveFoes(B, pick).length > 1 ? ' &middot; <b>T</b> next foe' : ''}</span>
        <button class="mini" data-act="abhold"${tip('Hold the charge: he fights on with it full, and the fight stops for him again in four seconds. For when the moment is wrong: the foe is out of reach, a friend is about to stun him, the net is about to land.')}>Hold it <span class="k">W</span></button>
        <button class="mini" data-act="abpickai">Let him choose <span class="k">A</span></button></div>`;
    paintResultFaces();
    SFX.ui('chime');
  }
}
// The whole telling of a fight, as lines: when, whose, and what.
function fightLogHtml(B) {
  const tm = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  return B.log.map(l => `<div class="ll t${l.team} k-${l.kind}"><span class="tm">${tm(l.t)}</span><span>${l.str}</span></div>`).join('') || '<div class="dim">Nothing yet.</div>';
}
function paintFightLog() {
  const el = $('#arenaLog');
  if (!fight || !ui.flog) { el.hidden = true; return; }
  const B = fight.B, sig = B.log.length + '|' + B.log.slice(-3).map(l => l.str).join('|');
  if (!el.hidden && sig === fight.logSig) return;
  fight.logSig = sig;
  const stick = el.hidden || el.scrollTop + el.clientHeight >= el.scrollHeight - 12;       // stay at the foot unless he has scrolled back to read
  el.innerHTML = `<div class="lh">The fight so far <button class="mini" data-act="flog">Close</button></div><div class="lb">${fightLogHtml(B)}</div>`;
  el.hidden = false;
  const lb = el.querySelector('.lb'); if (stick) lb.scrollTop = lb.scrollHeight;
}
function paintSpeed() {
  $('#muteBtn').textContent = SFX.muted ? 'Sound off' : 'Sound on';
  $('#pauseBtn').textContent = fight && fight.paused ? 'Resume' : 'Pause';
  $('#muteBtn').classList.toggle('off', !!SFX.muted);
  $('#pauseBtn').classList.toggle('on', !!(fight && fight.paused));
  $('#logBtn').classList.toggle('on', !!ui.flog);
  $('#camBtn').textContent = ui.fixedCam ? 'Camera: fixed' : 'Camera: follows';
  document.querySelectorAll('#arenaCtl [data-act="speed"]').forEach(b => b.classList.toggle('on', fight && +b.dataset.v === fight.speed));
}
function fightLoop(ts) {
  const f = fight;
  if (!f || f.finished) return;
  const dt = f.last ? Math.min(0.05, (ts - f.last) / 1000) : 0.016;
  f.last = ts;
  f.B.paused = !!f.paused;
  if (!f.paused) for (let i = 0; i < Math.max(1, f.speed); i++) stepBattle(f.B, f.speed < 1 ? dt * f.speed : dt);
  // whoever the mouse is resting on gets a card saying what he is
  { const V = f.B.view || { z: 1, ox: 0, oy: 0 }; f.hover = f.mouse ? { x: (f.mouse.u * 1280 - V.ox) / (WORLD * V.z), y: (f.mouse.v * 720 - V.oy) / (WORLD * V.z) } : null; }
  f.B.inspect = f.hover ? f.B.fighters.filter(q => Math.abs(q.x - f.hover.x) < 9 && f.hover.y > q.y - (out(q) ? 8 : 24) && f.hover.y < q.y + 4).sort((a, b) => (out(a) - out(b)) || Math.abs(a.x - f.hover.x) - Math.abs(b.x - f.hover.x))[0] || null : null;
  for (const s of f.B.snd) SFX.play(s[0], s[1], s[2], s[3]);
  SFX.hold(!!(f.B.pick || f.paused) && !f.B.over);
  {                                           // the band follows the fight: who is failing, what kind of fight it is, and whether it is nearly done
    const B = f.B, live = t => B.fighters.filter(q => q.team === t && !out(q)), frac = t => { const a = B.fighters.filter(q => q.team === t); return live(t).reduce((n, q) => n + Math.max(0, q.hp), 0) / Math.max(1, a.reduce((n, q) => n + q.maxHp, 0)); };
    const mine = live(0), foes = live(1), on = !B.over && B.intro <= 0;
    SFX.mood({ phase: B.intro > 0 ? 'intro' : B.over ? 'over' : 'fight', kind: B.death ? 'death' : B.hunt ? 'hunt' : '', won: B.winner === 0,
      peril: on && frac(0) < 0.35 && frac(0) < frac(1),
      climax: on && (B.time > 120 || (mine.length + foes.length <= 2 && Math.max(frac(0), frac(1)) < 0.45)) });
  }
  if (f.B.pick && f.askedOf !== f.B.pick) SFX.play('ready');          // the fight has stopped for your man: a call to say so
  f.askedOf = f.B.pick || null;
  f.B.snd.length = 0;
  SFX.crowd(f.B.exc + (f.B.over ? 0.3 : 0));
  paintOrders(); paintFightLog(); paintFightTip();
  drawBattle($('#arenaCanvas').getContext('2d'), f.B);
  if (f.B.over && f.B.outro > f.B.outroEnd) { finishFight(); return; }
  f.raf = requestAnimationFrame(fightLoop);
}
// After a fight: what each man gave, took and used.
// What is shown when a fight is done: the word of it and how it went, what it paid, each of your men with how he came
// out of it and what he did, the other side more briefly, and then whatever followed from it.
function fightReport(B) {
  const top = Math.max(1, ...B.fighters.map(f => f.dmgDealt)), mine = B.fighters.filter(f => f.team === 0);
  const foes = B.fighters.filter(f => f.team === 1).sort((a, b) => b.dmgDealt - a.dmgDealt);
  const best = mine.length > 1 ? mine.slice().sort((a, b) => b.dmgDealt - a.dmgDealt)[0] : null;
  const state = f => {
    const g = f.g;
    if (f.fate === 'dead') return ['Dead', 'red'];
    if (f.team === 1) return out(f) ? [f.yielded ? 'Yielded' : 'Down, spared', ''] : ['Standing', ''];
    const days = g.injury > 0 ? ` &middot; ${g.injury} day${g.injury === 1 ? '' : 's'}` : '';
    if (f.fate) return [(f.yielded || f.hp > 0 ? 'Yielded' : 'Carried off') + days, 'red'];
    return g.injury > 0 ? ['Wounded' + days, 'red'] : ['Unhurt', 'ok'];
  };
  const used = f => Object.entries(f.used).map(([n, c]) => `<span class="chip">${n}${c > 1 ? ' &times;' + c : ''}</span>`).join('');
  const face = (f, w, h) => `<canvas width="96" height="112" style="width:${w}px;height:${h}px" data-rface="${B.fighters.indexOf(f)}"></canvas>`;
  const man = f => {
    const [word, cls] = state(f), g = f.g, dead = f.fate === 'dead', hp = dead ? 0 : clamp(g.hp / maxHp(g), 0, 1);
    return `<div class="resman${dead ? ' dead' : ''}">${mine.length >= 3 ? face(f, 36, 42) : face(f, 48, 56)}
      <div class="who"><b>${g.name}</b> <small>${f.c.name}</small>${f === best && f.dmgDealt > 0 ? ' <span class="chip gold">Best of yours</span>' : ''}<span class="chip st ${cls}">${word}</span></div>
      <div class="bar hp"${tip(dead ? 'He did not leave the sand.' : `Health after the fight: ${Math.round(g.hp)} of ${maxHp(g)}.`)}><i style="width:${Math.round(hp * 100)}%"></i></div>
      <div class="nums"><span><b class="num">${Math.round(f.dmgDealt)}</b> dealt</span><span><b class="num">${Math.round(f.dmgTaken)}</b> taken</span><span><b class="num">${f.best ? Math.round(f.best) : '&ndash;'}</b> best blow</span></div>
      <div class="bar dealt"><i style="width:${Math.round(f.dmgDealt / top * 100)}%"></i></div>
      ${used(f) ? `<div class="used">${used(f)}</div>` : ''}</div>`;
  };
  const foe = f => {
    const [word, cls] = state(f);
    return `<div class="resfoe">${face(f, 24, 28)}<span class="nm">${f.g.beast ? f.c.name : f.g.name} <small class="${cls}">${word}</small></span>
      <span class="bar dealt"><i style="width:${Math.round(f.dmgDealt / top * 100)}%"></i></span><span class="num">${Math.round(f.dmgDealt)} dealt</span><span class="num">${Math.round(f.dmgTaken)} taken</span></div>`;
  };
  return `<div class="resmen${mine.length > 1 ? ' two' : ''}${mine.length >= 3 ? ' compact' : ''}${mine.length >= 5 ? ' three' : ''}">${mine.map(man).join('')}</div>
    <div class="resfoes"><div class="lbl">Against</div>${foes.slice(0, mine.length >= 5 ? 3 : 4).map(foe).join('')}${foes.length > (mine.length >= 5 ? 3 : 4) ? `<div class="dim" style="font-size:11px">and ${foes.length - (mine.length >= 5 ? 3 : 4)} more, in the line-by-line telling below</div>` : ''}</div>
    ${B.log && B.log.length ? `<details class="reslog"><summary>The fight, line by line (${B.log.length})</summary><div class="lb">${fightLogHtml(B)}</div></details>` : ''}`;
}
// The head of that screen, and the tiles of what it paid.
function resultHead(B, win, title, tiles) {
  const secs = Math.round(B.time), how = B.endWord ? B.endWord[0] + B.endWord.slice(1).toLowerCase() : '';
  return `<div class="reshead ${win ? 'won' : 'lost'}"><h2 class="${win ? '' : 'bad'}">${title}</h2>
      <p>${[how, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} on the ${B.wild ? 'field' : 'sand'}`].filter(Boolean).join(' &middot; ')}</p></div>
    <div class="kvs restiles">${tiles.map(([k, v, note, cls]) => `<div class="${cls || ''}"><span>${k}</span><b class="num">${v}</b>${note ? `<small>${note}</small>` : ''}</div>`).join('')}</div>`;
}
function paintResultFaces() {
  if (typeof fight === 'undefined' || !fight || !fight.B) return;
  document.querySelectorAll('[data-rface]').forEach(cv => { const f = fight.B.fighters[+cv.dataset.rface]; if (f) drawPortrait(cv, f.g, f.team, fight.B.col[f.team], fight.B.colD[f.team]); });
}

function finishFight() {
  const f = fight;
  if (!f || f.finished) return;
  f.finished = true;
  cancelAnimationFrame(f.raf);
  f.B.ask = false; f.B.pick = null; f.B.cutins = false;             // nobody is asked, and nothing announced, while the rest is played out unseen
  $('#arenaPick').hidden = true; $('#arenaLog').hidden = true; if ($('#arenaTip')) $('#arenaTip').hidden = true;
  let guard = 0;
  while ((!f.B.over || f.B.outro <= f.B.outroEnd) && guard++ < 20000) stepBattle(f.B, 1 / 30);
  f.B.snd.length = 0; SFX.quiet();
  drawBattle($('#arenaCanvas').getContext('2d'), f.B);
  const B = f.B, mine = B.fighters.filter(x => x.team === 0), foes = B.fighters.filter(x => x.team === 1);
  const standing = [`${mine.filter(x => !out(x)).length} of ${mine.length}`, mine.some(x => x.fate === 'dead') ? `${mine.filter(x => x.fate === 'dead').length} dead` : 'none lost', mine.some(x => x.fate === 'dead') ? 'bad' : ''];
  const then = lines => lines.length ? `<div class="resthen${lines.length > 4 ? ' pair' : ''}"><div class="lbl">What followed</div><ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul></div>` : '';
  if (f.wild) {
    // Whatever goes wrong in the reckoning, the player is never left looking at the last frame of a fight with no way on.
    let w;
    try { w = applyWildResult(B); }
    catch (err) {
      console.error(err);
      if (G.field) G.field.fight = null;
      w = { win: B.winner === 0, lines: ['<span class="dim">Something went wrong in the reckoning of this fight, and what it should have brought was not counted. The school marches on.</span>'] };
      try { save(); } catch (e2) { /* nothing more to be done */ }
    }
    SFX.play(w.win ? 'victory' : 'defeat'); SFX.music(null);
    showModal(`<div class="res">${resultHead(B, w.win, w.win ? 'The field is yours' : 'Driven off', [
        ['Yours standing', standing[0], standing[1], standing[2]],
        ['Foes felled', `${foes.filter(out).length} of ${foes.length}`, `${foes.filter(x => x.fate === 'dead').length} dead`]])}
      ${fightReport(B)}${then(w.lines)}
      <div class="row"><button class="primary" data-act="leavearena">Back to the column</button></div></div>`);
    return;
  }
  const r = applyBoutResult(f.bout, B, f.wager, f.pay, f.wkind);
  SFX.play(r.win ? 'victory' : 'defeat'); SFX.music(null);          // the fanfare has the floor
  const mood = r.avgExc > 0.55 ? ['Roaring', 'on its feet'] : r.avgExc > 0.3 ? ['Pleased', 'a good showing'] : ['Restless', 'it wanted more'];
  const tiles = [['Purse', r.purse ? `+${r.purse}` : '0', r.purse ? 'denarii' : 'you leave with nothing', r.purse ? 'gold' : '']];
  if (r.wager) tiles.push(['Wager', r.wagerGain ? `+${r.wagerGain}` : `&minus;${r.wager}`, r.wagerGain ? 'it pays' : r.win ? `lost: not ${WAGER_KINDS[r.kind].name.toLowerCase()}` : 'lost', r.wagerGain ? 'gold' : 'bad']);
  tiles.push(['Fame', r.fameGain ? `+${r.fameGain}` : '0', r.fameGain ? 'for the school' : 'none for losing']);
  tiles.push(['The crowd', mood[0], `<i class="meter"><i style="width:${Math.round(clamp(r.avgExc, 0, 1) * 100)}%"></i></i>${mood[1]}`]);
  if (mine.length > 1) tiles.push(['Yours standing', standing[0], standing[1], standing[2]]);
  showModal(`<div class="res">${resultHead(B, r.win, r.win ? 'Victory' : 'Defeat', tiles)}
    ${B.decision ? '<p class="dim">The fight dragged on, and the judges decided it.</p>' : ''}
    ${fightReport(B)}${then(r.lines)}
    <div class="row"><button class="primary" data-act="leavearena">Return to the ludus</button></div></div>`);
}

// ---------- actions ----------

const ACTIONS = {
  tab(v) { ui.tab = v; villagePlace(v); render(); },                 // a jump, for the dev drawer and the steward; the player walks
  village(v, w, el, e) { const k = villagePick(el, e); if (k) villageWalkTo(k); },
  yard(v, w, el, e) {                       // click a fighter to open his dossier, a building to go to its screen
    const h = typeof yardPick === 'function' ? yardPick(el, e) : null;
    if (!h) return;
    if (h.house) { ui.hsel = h.house; ui.dealArm = null; SFX.ui('scroll'); render(); return; }      // a shield on the tavern wall: that house is the one read
    if (h.tavern) { ACTIONS[h.tavern === 'dice' ? 'tdice' : 'tbook'](); return; }                    // the dicers' corner, and the man with the book
    if (h.offer) { ui.csel = h.offer; SFX.ui('scroll'); render(); const row = document.querySelector('#view .lrow.sel'); if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' }); return; }      // a tablet on the board of work: that offer is the one read
    if (h.fighter) { ui.sel = h.fighter; ui.school = false; ui.schoolNext = false; villageWalkTo('ludus'); }
    else if (h.school) { if (ui.tab === 'ludus') ui.school = true; else ui.schoolNext = true; villageWalkTo('ludus'); }      // the school's own walls are seen to at the school
    else villageWalkTo(h.tab);       // he walks there; nothing opens until he arrives
    render();
  },
  activity(v, w, el) {
    const g = byId(v);
    if (!g || el.classList.contains('off')) return;
    g.activity = w; g.auto = false; ui.sel = g.id; save(); render();
  },
  actauto(v, w, el) {                       // leave him to the doctore, or take him back
    const g = byId(v);
    if (!g || el.classList.contains('off')) return;
    g.auto = !g.auto; if (g.auto) g.activity = doctorePick(g);
    ui.sel = g.id; save(); render();
  },
  actall(v, w, el) {
    if (el.classList.contains('off')) return;
    for (const g of G.roster) { if (g.away) continue; if (w === 'auto') { g.auto = true; g.activity = doctorePick(g); } else if (g.injury <= 0) { g.activity = w; g.auto = false; } }
    save(); render();
  },
  rsort() { const i = RSORTS.findIndex(s => s[0] === (ui.rsort || 'cells')); ui.rsort = RSORTS[(i + 1) % RSORTS.length][0]; render(); },
  sel(v, w, el, e) { if (e.target.closest('select')) return; ui.sel = +v; render(); },
  close() { closeModal(); checkEnd(); },
  endday() {
    if (G.over) { checkEnd(); return; }
    const open = G.bouts ? G.bouts.filter(b => !b.done).length : 0;
    if (open && G.roster.some(canFight) && !ui.confirmSkip) {      // asked every time: to stay is not to have been asked (forceend is the answer that ends it)
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
  forceend() { closeModal(); ui.confirmSkip = true; ACTIONS.endday(); },
  evopt(v) {
    const pe = G.pendingEvent; if (!pe) { closeModal(); return; }
    const E = EVENTS[pe.id];
    if (E.opts[+v].ok && !E.opts[+v].ok(pe.c)) return;
    const before = eventSnap(), art = eventArt(pe.id);
    const res = E.opts[+v].run(pe.c);
    if (G.field && G.field.fight) { G.pendingEvent = null; save(); closeModal(); startWildFight(); return; }       // it has come to blows
    log(`${E.title}: ${res}`);
    G.pendingEvent = null; nextEvent(); save();
    modalQueue[0] = `<div class="ev">${art}<h2>${E.title}</h2><p class="evtext">${res}</p>${eventDiff(before)}<div class="row"><button class="primary" data-act="close">Continue<span class="k">Enter</span></button></div></div>`;
    paintModal(); render();
    if (G.pendingEvent) showEvent();          // another matter is waiting behind this one
  },
  dossier(v) { ui.sel = +v; villageWalkTo('ludus'); render(); },
  rowsel(v, w) { ui[v] = /^\d+$/.test(w) ? +w : w; render(); },
  dtab(v) { ui.dtab = v; render(); },
  lfilter(v) { ui.lfilter = v; ui.lpage = 0; render(); },
  ltopic(v) { ui.ltopic = v; ui.lpage = 0; render(); },
  lcopy() {
    const f = ui.lfilter || 'all', topic = ui.ltopic || 'all', shown = G.log.filter(e => (f === 'all' || e.k === f) && logTopic(e, topic));
    const text = `Ludus Magnus: the chronicle of the house, day ${G.day}\n\n${logText(shown)}\n`;
    const done = () => { ui.lcopied = G.day + ':' + shown.length; SFX.ui('scroll'); render(); };
    const old = () => { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-999px;top:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { /* nothing more to try */ } ta.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, old); else old();
  },
  ctab(v) { ui.ctab = v; render(); },
  lpage(v) { ui.lpage = Math.max(0, (ui.lpage || 0) + (+v)); render(); },
  storyall(v) { ui.storyAll = ui.storyAll === +v ? null : +v; render(); },
  // A dealing with a house: those that cannot be taken back are asked twice.
  tbook() { bookModal(); },
  bkbet(v, w) { const r = bookBet(v, +w); SFX.ui(r.ok ? 'coin' : 'thud'); save(); render(); bookModal(r); },
  tdice(v) {
    if (!v) { diceModal(); return; }
    const r = tavernDice(+v); SFX.ui(!r.ok ? 'thud' : r.win ? 'coin' : 'warn'); save(); render(); diceModal(r);
  },
  tnight() {
    if (ui.dealArm !== 'night') { ui.dealArm = 'night'; SFX.ui('warn'); render(); return; }
    ui.dealArm = null;
    const r = tavernNight(); ui.tavMsg = { day: G.day, ok: r.ok && r.kind !== 'brawl', text: r.text };
    SFX.ui(r.ok ? 'chime' : 'thud'); save(); render();
  },
  hdeal(v, w) {
    const H = houseOf(v); if (!H) return;
    const [kind, id] = w.split(':'), key = v + ':' + w;
    if (kind !== 'gift' && ui.dealArm !== key) { ui.dealArm = key; SFX.ui('warn'); render(); return; }
    ui.dealArm = null;
    const r = houseDeal(H, kind, id ? +id : 0);
    ui.dealMsg = { hid: v, day: G.day, ok: r.ok, text: r.text };
    SFX.ui(r.ok ? (kind === 'buy' ? 'coin' : 'chime') : 'thud');
    save(); render();
  },
  gearmore(v, w) { const k = v + ':' + w; ui.gearOpen = ui.gearOpen === k ? null : k; render(); },
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
  cbest(v) {
    const c = G.contracts.find(x => x.id === +v), b = c && bestTeam(c); if (!b) return;
    const ids = b.men.map(g => g.id);
    for (const k in ui.cpicks) ui.cpicks[k] = ui.cpicks[k].filter(x => !ids.includes(x));
    ui.cpicks[c.id] = ids; render();
  },
  csend(v) { if (sendContract(v, ui.cpicks[v] || [], ui.cterms[v])) { delete ui.cpicks[v]; delete ui.cterms[v]; render(); } },
  cterms(v, w) { ui.cterms[v] = w; render(); },
  caround() { const c = askAround(); if (c) { ui.csel = c.id; SFX.ui('coin'); save(); render(); } },
  smithbuy(v) { if (buyItem(v)) { save(); render(); } },
  smithgive(v, w) { const g = byId(w); if (g && buyItem(v)) { equip(g, v); save(); render(); } },      // bought and straight onto a man
  smithsell(v) { if (sellItem(v)) { save(); render(); } },
  smithup() { if (upgradeSmith()) { save(); render(); } },
  reforge(v) { if (reforge(v)) { SFX.ui('gear'); save(); render(); } },
  fit(v, w) { if (fitItem(v, w)) { SFX.ui('gear'); save(); render(); } },
  strip(v) { if (stripFit(v)) { SFX.ui('gear'); save(); render(); } },
  smithorder(v, w) { if (orderItem(v, w)) { SFX.ui('coin'); save(); render(); } },
  smithclear() { if (!ui.clearArm) { ui.clearArm = true; render(); return; } ui.clearArm = false; const r = sellOutclassed(); if (r.n) { SFX.ui('coin'); log(`${r.n} spare piece${r.n === 1 ? '' : 's'} sold back to the smith for ${r.sum} denarii.`); } save(); render(); },
  wearbest(v) { const g = byId(v); if (!g) return; for (const it of bestSpares(g)) equip(g, it.id); save(); render(); },
  tactic(v, w) { const g = byId(v); if (g && TACTICS[w]) { g.tactic = w; save(); render(); } },
  equip(v, w) { const g = byId(v); if (g && equip(g, w)) { save(); render(); } },
  unequip(v, w) { const g = byId(v); if (g && unequip(g, w)) { save(); render(); } },
  sell(v) {
    const g = byId(v); if (!g) return;
    const p = sellPrice(g);
    G.denarii += p; G.roster = G.roster.filter(x => x !== g); departed(g, 'sold'); dealerMove(1);
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
    G.denarii -= g.price; addStory(g, `Bought at market for ${g.price} denarii.`); delete g.price; delete g.tried; delete g.levy; dealerMove(2);
    G.market = G.market.filter(m => m !== g); G.roster.push(welcome(g));
    log(`${g.name} the ${CLASSES[g.cls].name} is bought at market.`);
    ui.sel = g.id; save(); render();
  },
  mhaggle(v) { const m = G.market.find(x => x.id === +v), r = haggle(m); if (r) { ui.mktMsg = { id: +v, day: G.day, ok: r.ok, text: r.text }; SFX.ui(r.ok ? 'coin' : 'thud'); save(); render(); } },
  mhold(v) { if (holdMan(G.market.find(x => x.id === +v))) { SFX.ui('coin'); save(); render(); } },
  mtry(v) { const r = tryMan(G.market.find(x => x.id === +v)); if (r) { ui.mktMsg = { id: +v, day: G.day, ok: r.ok, text: r.text }; SFX.ui('thud'); save(); render(); } },
  morder(v) { if (orderMan(v)) { SFX.ui('coin'); save(); render(); } },
  mbid(v) {                                    // one bid, and it cannot be taken back: asked twice
    if (ui.bidArm !== +v) { ui.bidArm = +v; SFX.ui('warn'); render(); return; }
    ui.bidArm = null;
    const id = G.auction ? G.auction.g.id : 0, r = auctionBid(+v);
    if (!r) return;
    SFX.ui(r.ok ? 'chime' : 'thud');
    if (r.ok) { ui.sel = id; }
    save(); render();
    showModal(`<h2>${r.ok ? 'Sold to you' : 'Outbid'}</h2><p>${r.text}</p>${okBtn()}`);
  },
  msell(v) {                                   // from the market: asked twice, since it cannot be undone
    if (ui.sellArm !== +v) { ui.sellArm = +v; render(); return; }
    ui.sellArm = null; SFX.ui('coin'); ACTIONS.sell(v);
  },
  school() { ui.school = !ui.school; render(); },
  stablebuild() { ACTIONS.build('stables'); SFX.ui('gate'); stablesModal(); },
  eaglebuild() { if ((G.fac.stables || 0) < 1) return; ACTIONS.build('eagle'); SFX.ui('discover'); stablesModal(); },
  build(v) {
    const l = G.fac[v] || 0;
    if (l >= 3 || G.denarii < FAC_COST[l]) return;
    G.denarii -= FAC_COST[l]; G.fac[v] = l + 1;
    log(`${FACILITIES[v].name} improved to level ${G.fac[v]}.`, 'gold');
    save(); render();
  },
  ration(v) { G.ration = +v; save(); render(); },
  regimen(v) { G.regimen = clamp(+v, 0, REGIMENS.length - 1); log(`The men are now worked on a ${REGIMENS[G.regimen].name.toLowerCase()} regimen.`); save(); render(); },
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
  bbest(v) {
    const b = G.bouts.find(x => x.id === +v), t = b && bestBoutTeam(b); if (!t) return;
    const ids = t.men.map(g => g.id);
    for (const k in ui.picks) ui.picks[k] = ui.picks[k].filter(x => !ids.includes(x));
    ui.picks[b.id] = ids; render();
  },
  bfill() {
    if (!G.bouts) return;
    const P = cardPlan().plan; if (!Object.keys(P).length) return;
    G.bouts.forEach(b => { if (!b.done) ui.picks[b.id] = P[b.id] || []; });
    render();
  },
  bclear() { (G.bouts || []).forEach(b => { if (!b.done) ui.picks[b.id] = []; }); render(); },
  wagerset(v, w) { ui.wagers[v] = +w; render(); },
  sponsor() { if (sponsorFestival()) { SFX.ui('coin'); save(); render(); } },
  wkind(v, w) { (ui.wkind = ui.wkind || {})[v] = w; render(); },
  stakes(v) { if (ui.stakeArm !== +v) { ui.stakeArm = +v; render(); return; } ui.stakeArm = null; if (raiseStakes(v)) { SFX.ui('gate'); save(); } render(); },
  fight(v) { startFight(v); },
  hire(v) {
    const h = G.hires.find(x => x.id === +v);
    if (!h || G.denarii < h.fee) return;
    G.denarii -= h.fee;
    G.staff[h.role] = { name: h.name, skill: h.skill, wage: h.wage, since: G.day };
    G.hires = G.hires.filter(x => x !== h);
    log(`${h.name} is taken on as ${STAFF_ROLES[h.role].name.toLowerCase()}.`);
    save(); render();
  },
  raise(v) { if (raiseStaff(v)) { SFX.ui('coin'); save(); render(); } },
  seek(v) { if (seekStaff(v)) { SFX.ui('coin'); save(); render(); } },
  fire(v) {
    const s = G.staff[v]; if (!s) return;
    if (ui.fireArm !== v) { ui.fireArm = v; render(); return; }      // asked twice: his fee does not come back
    ui.fireArm = null;
    delete G.staff[v];
    log(`${s.name} the ${STAFF_ROLES[v].name.toLowerCase()} is dismissed.`);
    save(); render();
  },
  // A petition spends favour, so it is asked twice.
  petition(v, w) {
    const key = v + ':' + w;
    if (ui.petArm !== key) { ui.petArm = key; SFX.ui('warn'); render(); return; }
    ui.petArm = null;
    const r = petition(v, w);
    ui.petMsg = { k: v, day: G.day, ok: r.ok, text: r.text };
    SFX.ui(r.ok ? 'chime' : 'thud'); save(); render();
  },
  tithe() { if (payTithe()) { SFX.ui('coin'); save(); render(); } },
  gift(v) {
    const c = giftCost(v);
    if (G.denarii < c || G.patrons[v] >= 100) return;
    G.denarii -= c; G.gifts[v]++; favor(v, 10);
    log(`A gift worth ${c} denarii is sent to ${PATRONS[v].name}.`);
    save(); render();
  },
  perk(v) {
    const g = byId(v); if (!g || g.perkPending <= 0) return;
    perkOffer(g); save(); ui.perkArm = null;
    showModal(perkModal(g)); paintPortraits();
  },
  // A perk is for good, so the first press on one only asks; the second takes it.
  perkreroll(v) { const g = byId(v); if (g && rerollPerk(g)) { ui.perkArm = null; SFX.ui('coin'); save(); modalQueue[0] = perkModal(g); paintModal(); paintPortraits(); } },
  forget(v, w) {
    const g = byId(v); if (!g) return;
    if (ui.forgetArm !== v + ':' + w) { ui.forgetArm = v + ':' + w; render(); return; }
    ui.forgetArm = null;
    if (forgetPerk(g, w)) { SFX.ui('gear'); save(); }
    render();
  },
  pickperk(v, w) {
    const g = byId(v); if (!g) { closeModal(); return; }
    if (ui.perkArm !== v + ':' + w) { ui.perkArm = v + ':' + w; modalQueue[0] = perkModal(g); paintModal(); paintPortraits(); return; }
    ui.perkArm = null; choosePerk(g, w); save(); SFX.ui('chime');
    if (g.perkPending > 0) { perkOffer(g); save(); modalQueue[0] = perkModal(g); paintModal(); render(); paintPortraits(); }
    else { closeModal(); render(); }
  },
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
  tbetpick(v) { ui.tbet = ui.tbet === v ? null : v; render(); },
  tbet(v) { if (ui.tbet && tourneyBet(ui.tbet, +v)) { ui.tbet = null; SFX.ui('coin'); save(); } render(); },
  ttend(v) { if (tendChampion(v)) { SFX.ui('gear'); save(); } render(); },
  twatch() { if (!ui.watchArm) { ui.watchArm = true; render(); return; } ui.watchArm = false; if (watchTourney()) { SFX.ui('gate'); save(); } render(); },
  tfight() { if (G.tourney && G.tourney.bout) startFight(null, G.tourney.bout); },
  saves() { ui.confirmSlot = null; ui.saveMsg = ''; showModal(savesModal()); },
  help(v) {                                  // opened at the page for where you are, unless one is asked for
    if (modalQueue.length) return;
    ui.helpTab = v && HELP_TABS.some(t => t[0] === v) ? v : fight && !fight.finished ? 'fights' : G.field ? 'province' : ['market', 'smith', 'facilities', 'patrons', 'rivals', 'contracts'].includes(ui.tab) ? 'town' : ui.tab === 'arena' ? 'fights' : ui.helpTab || 'basics';
    if (fight && !fight.finished && !fight.B.over && !fight.paused) { fight.paused = true; paintSpeed(); }
    showModal(helpModal());
  },
  helptab(v) { ui.helpTab = v; if (modalQueue.length) { modalQueue[0] = helpModal(); paintModal(); } },
  helptut() { closeModal(); if (G.field) { tutorState().hints = true; tutorState().seen = {}; save(); render(); } else ACTIONS.tuton(); },
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
  tutjump(v) { G.tut.step = clamp(+v, 0, TUTORIAL.length - 1); if (TUTORIAL[G.tut.step].tab === 'ludus') ui.dtab = 'stats'; save(); render(); },
  fhintok(v) { tutorState().seen[v] = true; save(); if (fight) fight.tipSig = ''; paintFightTip(); },
  tutback() { let i = G.tut.step - 1; while (i > 0 && TUTORIAL[i].until) i--; G.tut.step = Math.max(0, i); save(); render(); },
  tutoff() { G.tut.on = false; G.tut.hints = false; save(); renderTutor(); if (fight) { fight.tipSig = null; paintFightTip(); } },
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
  speed(v) { if (fight) { fight.speed = +v; ui.fspeed = +v; try { localStorage.setItem('ludus-magnus-fspeed', v); } catch (e) { /* storage unavailable */ } if (fight.paused) fight.paused = false; paintSpeed(); } },
  fstep() {                                   // stop it, or if it is stopped move it on a tenth of a second
    if (!fight || fight.finished || fight.B.over) return;
    if (!fight.paused) fight.paused = true; else for (let i = 0; i < 3; i++) stepBattle(fight.B, 1 / 30);
    paintSpeed();
  },
  order(v) {
    if (!fight || fight.finished || !canOrder(fight.B, v)) return;
    if (fight.armed !== v) { fight.armed = v; fight.armT = performance.now(); SFX.ui('warn'); paintOrders(); return; }
    fight.armed = null; if (giveOrder(fight.B, v)) paintOrders();
  },
  abpick(v) { if (fight && !fight.finished && pickAbility(fight.B, v)) paintOrders(); },
  fcam() { ui.fixedCam = !ui.fixedCam; try { localStorage.setItem('ludus-magnus-fixedcam', ui.fixedCam ? '1' : '0'); } catch (e) { /* storage unavailable */ } if (fight) fight.B.fixedCam = ui.fixedCam; paintSpeed(); },
  flog() { ui.flog = !ui.flog; if (fight) fight.logSig = ''; paintFightLog(); paintSpeed(); },
  abtarget(v) { const B = fight && !fight.finished ? fight.B : null; if (B && B.pick && aimAt(B, B.fighters[+v])) { SFX.ui('tick'); paintOrders(); } },
  abnext(v) { const B = fight && !fight.finished ? fight.B : null; if (B && B.pick && aimNext(B, +v || 1)) { SFX.ui('tick'); paintOrders(); } },
  abmark() { const B = fight && !fight.finished ? fight.B : null; if (B && B.pick && B.pick.target && markFoe(B, B.pick.target)) { SFX.ui('tick'); paintOrders(); } },
  abhold() { const B = fight && !fight.finished ? fight.B : null; if (B && B.pick && holdCharge(B)) paintOrders(); },
  abpickai() { const B = fight && !fight.finished ? fight.B : null; if (B && B.pick && !out(B.pick) && pickAbility(B, aiPickAbility(B, B.pick).id)) paintOrders(); },
  abauto() { ui.autoCast = !ui.autoCast; try { localStorage.setItem('ludus-magnus-autocast', ui.autoCast ? '1' : '0'); } catch (e) { /* storage unavailable */ } if (fight) { fight.B.ask = !ui.autoCast; fight.ordState = ''; paintOrders(); } },
  cutins() { ui.noCut = !ui.noCut; try { localStorage.setItem('ludus-magnus-cutins', ui.noCut ? '0' : '1'); } catch (e) { /* storage unavailable */ } if (fight) { fight.B.cutins = !ui.noCut; fight.ordState = ''; paintOrders(); } },
  abil(v, w) { const g = byId(v); if (g && toggleAbility(g, w)) { save(); render(); } },
  absig(v, w) { const g = byId(v); if (g && setSignature(g, w)) { SFX.ui('tick'); save(); render(); } },
  skip() {
    if (!fight || fight.finished) return;
    if (!fight.B.over && fight.armed !== 'skip') { fight.armed = 'skip'; fight.armT = performance.now(); paintOrders(); return; }
    finishFight();
  },
  pause() { if (fight && !fight.finished && !fight.B.over) { fight.paused = !fight.paused; paintSpeed(); } },
  leavearena() { SFX.stop(); SFX.music(G.field ? 'wild' : 'ludus'); $('#arena').hidden = true; fight = null; closeModal(); nextEvent(); render(); showReports(); if (G.pendingEvent) showEvent(); checkEnd(); },
  wildclick(v, w, el, e) { provClick(el, e); },
  quests() { if (modalQueue.length) { if (modalQueue[0].startsWith('<div class="quests">')) closeModal(); return; } ui.dropArm = null; SFX.ui('scroll'); showModal(questsModal()); },
  questdrop(v) { if (ui.dropArm !== +v) { ui.dropArm = +v; SFX.ui('warn'); } else { ui.dropArm = null; if (errandDrop(+v)) { SFX.ui('thud'); save(); render(); } } if (modalQueue.length && modalQueue[0].startsWith('<div class="quests">')) { modalQueue[0] = questsModal(); paintModal(); } },
  questgo(v) { if (modalQueue.length) closeModal(); if (ui.campSel) { ui.campSel = null; render(); } ACTIONS.wildgo(v); },
  wildgo(v) {
    const F = G.field; if (!F) return;
    const st = v === 'home' ? { x: WILD.TOWN.x + 12, y: WILD.TOWN.y } : siteById(v); if (!st) return;      // home: right up to the gate, so that arriving takes you in
    const path = provPath(F.x, F.y, st.x, st.y) || (v === 'home' ? provPath(F.x, F.y, WILD.TOWN.x + 22, WILD.TOWN.y) : null);
    if (path) { prov.path = path; prov.dest = v === 'home' ? 'Home' : st.name; if (prov.big) { prov.big = false; render(); } } else prov.hint = performance.now() + 1600;
  },
  bigmap() { if (!G.field) return; prov.big = !prov.big; prov.path = prov.big ? prov.path : prov.path; render(); },
  scout() { if (!G.field) return; prov.big = false; prov.night = performance.now(); campScout(); SFX.ui('discover'); fieldDayDone(); },
  makecamp() { if (!G.field) return; prov.big = false; prov.night = performance.now(); G.field.march = 0; fieldDay('camp'); SFX.ui('camp'); fieldDayDone(); },      // a rested column starts tomorrow with a whole day's march
  landuse() {
    if (!G.field || G.pendingEvent) return;
    const n = landmarkHere(), st = n && landUseState(n); if (!st || st.why) return;
    const day = !!st.u.day; if (day) { prov.big = false; prov.night = performance.now(); }
    const out = landUseRun(n); if (!out) return;
    if (G.field) G.field.note = { day: G.day, ok: true, text: `<b>${n}.</b> ${out}` };
    SFX.ui(day ? 'camp' : 'coin'); save();
    if (day) fieldDayDone(); else render();
  },
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
  slotname(v, val, el) { nameSlot(+v, el.value); },      // no redraw: a click that ended the typing must still land
};

// What each kind of click sounds like. Anything not named here makes the plain click; '' is silent
// (it makes its own sound, or the thing it starts does).
const CLICK_SOUND = {
  tab: 'tick', village: '', sel: 'tick', rowsel: 'tick', dtab: 'tick', dossier: 'tick', pick: 'tick', cpick: 'tick', tpick: 'tick', activity: 'tick', yard: 'tick', speed: 'tick',
  buy: 'coin', smithbuy: 'coin', smithgive: 'coin', smithsell: 'coin', smithup: 'coin', hire: 'coin', build: 'coin', gift: 'coin', sell: 'coin', tenter: 'coin',
  equip: 'gear', unequip: 'gear', pickperk: 'chime', free: 'chime', csend: 'gate',
  endday: '', forceend: '', makecamp: '', landuse: '', wildclick: '', bigmap: 'scroll', wildgo: 'tick', campsel: 'tick', campback: 'tick', skipdays: '', fight: '', tfight: '', order: '', pause: 'tick', actall: 'click', rsort: 'tick', help: 'scroll', tactic: 'tick', bbest: 'tick', bfill: 'tick', bclear: 'tick', wagerset: 'tick', lfilter: 'tick', cbest: 'tick', msell: 'warn', fire: 'warn', slotdel: 'warn', slotcopy: 'tick', slotrestore: 'warn', slotload: 'chime', abpick: '', abauto: 'click', cutins: 'click', abil: 'tick', mute: '', musictoggle: 'click', fightgo: '', tutnext: 'tick', tutback: 'tick', hintok: 'tick', evopt: 'scroll', skip: '', leavearena: 'tick',
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
// Where the mouse is over the map of the province, so that a place can say what it is.
document.addEventListener('mousemove', e => {
  if (!G || !G.field) return;
  const cv = $('#wildCanvas');
  if (e.target !== cv) { prov.mouse = null; return; }
  const r = cv.getBoundingClientRect();
  prov.mouse = { u: (e.clientX - r.left) / r.width, v: (e.clientY - r.top) / r.height };
});
// A click on the sand while an ability is being announced cuts the announcement short.
document.addEventListener('click', e => {
  if (!fight || !fight.B || e.target.id !== 'arenaCanvas') return;
  if (fight.B.pick && !fight.finished) { const o = fight.B.inspect; if (o && aimAt(fight.B, o)) { SFX.ui('tick'); paintOrders(); } return; }      // choosing: a click on a foe aims the ability at him
  if (fight.B.fatal) { if (fight.B.fatal.t > 0.7) fight.B.fatal.t = fight.B.fatal.dur; }      // a click sends a death screen on, once the blow has fallen
  else if (fight.B.cut) fight.B.cut.t = fight.B.cut.dur;
  else if (fight.B.intro > 0.5) fight.B.intro = 0.5;               // and one during the entrance sends the card away
  else if (fight.B.over && fight.B.outro > 0.8) fight.B.outro = fight.B.outroEnd;      // and one when it is over goes on to the result
});
// Where the mouse is over the sand, in the fight's own units, so that a man can be looked at.
document.addEventListener('mousemove', e => {
  if (!fight) return;
  const cv = $('#arenaCanvas'), r = cv.getBoundingClientRect();
  fight.mouse = e.target === cv ? { u: (e.clientX - r.left) / r.width, v: (e.clientY - r.top) / r.height } : null;
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
// The book of the trade turns its pages with Left and Right.
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.altKey || e.metaKey || $('#modal').hidden || !document.querySelector('#modalBox .help')) return;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const i = HELP_TABS.findIndex(t => t[0] === ui.helpTab), n = HELP_TABS.length;
  e.preventDefault(); e.stopPropagation(); ACTIONS.helptab(HELP_TABS[(i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n][0]);
}, true);
// 1, 2 and 3 shout the orders while a fight is on
document.addEventListener('keydown', e => {
  if (!fight || fight.finished || e.ctrlKey || e.altKey || e.metaKey || $('#arena').hidden) return;
  if (e.repeat && e.key !== '.') return;      // a key held down repeats itself: that steps the fight on, and does nothing else (held, C would throw in the cloth and answer its own "sure?")
  if (!$('#modal').hidden) {                  // the book is open over the fight: Esc or Enter shuts it, and nothing else reaches the sand
    if ((e.key === 'Escape' || e.key === 'Enter') && $('#modalBox [data-act=close]')) { e.preventDefault(); $('#modalBox [data-act=close]').click(); }
    return;
  }
  if (ui.noKeys && e.key.length === 1 && e.key !== ' ') return;       // single keys are switched off: every one of them has a button
  if (e.key === 'h' || e.key === 'H' || e.key === 'F1') { e.preventDefault(); ACTIONS.help(); return; }
  const B = fight.B;
  if (B.pick && /^[1-4]$/.test(e.key)) { const a = B.pick.abl[+e.key - 1]; if (a) { e.preventDefault(); ACTIONS.abpick(a.id); } }
  else if (B.pick && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); ACTIONS.abpickai(); }
  else if (B.pick && (e.key === 't' || e.key === 'T' || (e.key === 'Tab' && (document.activeElement || document.body) === document.body && !document.documentElement.classList.contains('tabbing')))) { e.preventDefault(); ACTIONS.abnext(e.shiftKey ? -1 : 1); }
  else if (B.pick && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); ACTIONS.abmark(); }
  else if (B.pick && (e.key === 'w' || e.key === 'W')) { e.preventDefault(); ACTIONS.abhold(); }
  else if (e.key === 'l' || e.key === 'L') { e.preventDefault(); ACTIONS.flog(); }
  else if (e.key === '.') { e.preventDefault(); ACTIONS.fstep(); }
  else if (e.key === '[' || e.key === ']') { e.preventDefault(); const sp = [0.5, 1, 2, 4], i = clamp(sp.indexOf(fight.speed) + (e.key === ']' ? 1 : -1), 0, 3); ACTIONS.speed(sp[i]); }
  else if (e.key === 'c' || e.key === 'C') { e.preventDefault(); ACTIONS.order('yield'); }
  else if (e.key === ' ' && !(document.activeElement && document.activeElement.tagName === 'BUTTON')) { e.preventDefault(); ACTIONS.pause(); }
});
// Keys for everything done often, so the hand can stay off the mouse:
//   W A S D walk the lanista about the village, E end the day, G to the games, up and down through the list on screen,
//   left and right through a fighter's dossier pages, 1-5 to set the chosen fighter's work, H for the page of help, B to buy the man chosen at market, Enter to dismiss a notice, 1-4 to answer an event.
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || !G) return;
  if (!$('#arena').hidden && ($('#modal').hidden || (fight && !fight.finished))) return;       // a fight has its own keys; its result, once it is over, is a notice like any other
  const at = document.activeElement || document.body;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName) && at.type !== 'checkbox') return;
  if (ui.noKeys && e.key.length === 1 && e.key !== ' ') return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const press = el => { if (el && !el.disabled) { e.preventDefault(); el.click(); } };
  // A key held down repeats itself. That walks the lanista and runs down a list, and nothing else: a day is not ended
  // twice, nor a second man bought, nor a notice sent away unread, because a finger rested on the key.
  const held = e.repeat && !/^Arrow/.test(k);
  if (!$('#modal').hidden) {
    if (held) return;
    const btns = [...document.querySelectorAll('#modalBox button:not(:disabled)')], opts = [...document.querySelectorAll('#modalBox [data-act=evopt]')];
    if (k === 'q' && modalQueue[0] && modalQueue[0].startsWith('<div class="quests">')) { e.preventDefault(); closeModal(); }
    else if ((k === 'Enter' || k === ' ' || k === 'Escape') && btns.length === 1 && at.tagName !== 'BUTTON' && at.tagName !== 'SUMMARY') press(btns[0]);
    else if (k === 'Escape' && $('#modalBox [data-act=close]')) press($('#modalBox [data-act=close]'));
    else if (/^[1-9]$/.test(k) && opts[+k - 1]) press(opts[+k - 1]);
    else if (/^[1-3]$/.test(k) && document.querySelectorAll('#modalBox .perkcard')[+k - 1]) press(document.querySelectorAll('#modalBox .perkcard')[+k - 1]);
    return;
  }
  if (villageKey(e, true)) { e.preventDefault(); return; }
  if (held) return;
  if (k === 'h' || k === 'F1') { e.preventDefault(); SFX.ui('scroll'); ACTIONS.help(); return; }
  if (G.field) { if (k === 'q') { e.preventDefault(); ACTIONS.quests(); } else if (k === 'e') press($('#camp [data-act=makecamp]')); else if (k === 'f') press($('#camp [data-act=landuse]')); else if (k === 'm') { e.preventDefault(); SFX.ui('scroll'); ACTIONS.bigmap(); } else if (k === 'r') { e.preventDefault(); SFX.ui('tick'); ACTIONS.wildgo('home'); } else if (k === 'Escape' && prov.big) ACTIONS.bigmap(); return; }           // out in the country, E makes camp
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
  if (ui.tab === 'arena' && k === 'b') return press($('#view [data-act=bbest]'));
  if (ui.tab === 'arena' && k === 'f') return press($('#view [data-act=bfill]'));
  if (ui.tab === 'arena' && k === 'Enter' && at.tagName !== 'BUTTON') return press($('#view [data-act=fight]'));
  if (k === 'b' && ui.tab === 'market') return press($('#view [data-act=buy]'));
  if (k === 'b' && ui.tab === 'smith') return press($('#view [data-act=smithbuy]'));
  if (k === 'b' && ui.tab === 'contracts') return press($('#view [data-act=cbest]'));
  if (/^[1-5]$/.test(k) && ui.tab === 'ludus') return press($(`#view .lrow.sel .acts button:nth-child(${k})`));
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

// ---------- the menu: Esc, from anywhere ----------
// Settings, saving, the figures of the house, help, the whole screen (in a browser) and the way out.

const DESKTOP = location.hostname === 'ludus.game';          // inside the exe, which answers for that name
const canFull = () => !DESKTOP && !!(document.documentElement.requestFullscreen && document.fullscreenEnabled);
const isFull = () => !!document.fullscreenElement;
// In a browser's full screen Escape belongs to the browser: it leaves full screen, and never reaches the game.
const escFree = () => DESKTOP || !isFull();
function escHints() { document.querySelectorAll('[data-key="Esc"], [data-nokey="Esc"]').forEach(b => { if (escFree()) { b.dataset.key = 'Esc'; delete b.dataset.nokey; } else { b.dataset.nokey = 'Esc'; delete b.dataset.key; } }); }
const menuOpen = () => modalQueue.length > 0 && modalQueue[0].startsWith('<div class="menu">');
function menuStats() {
  const rows = [], add = (a, b) => rows.push([a, b]), num = n => (+n || 0).toLocaleString('en');
  const w = G.tally.wins, l = G.tally.losses, men = G.roster, best = men.slice().sort((a, b) => b.wins - a.wins)[0];
  add('Day', num(G.day) + (G.dynasty.gen > 1 ? `, ${ordinal(G.dynasty.gen)} generation` : ''));
  add('Standing', `${TIERS[tier()].name}, ${num(G.fame)} fame`);
  add('Purse', `${num(G.denarii)} denarii`);
  add('Bouts won and lost', `${num(w)} and ${num(l)}${w + l ? ` (${Math.round(100 * w / (w + l))}% won)` : ''}`);
  add('Fighters in the school', `${men.length} of ${capacity()}`);
  add('Kills by the men you have now', num(men.reduce((n, g) => n + (g.kills || 0), 0)));
  if (best && best.wins) add('Most victories', `${best.name}, ${best.wins}`);
  add('Men lost on the sand', num((G.fallen || []).length));
  add('Quests done for the town', num(G.questsDone || 0));
  add('Journeys seen through', num(men.filter(g => QUESTS[g.questDone]).length));
  try { const M = wildMap(); add('Places dealt with in the province', num(M.cleared || 0)); add('Regions made safe', num(Object.keys(M.safe || {}).length)); add('Unique pieces found', num((M.relics || []).length)); } catch (e) { /* no map yet */ }
  try { add('Legacy', num(legacyScore())); } catch (e) { /* not reckoned yet */ }
  return `<table class="mstats">${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table>`;
}
function menuModal() {
  const page = ui.menuPage || 'main', inFight = !!(fight && !fight.finished);
  const item = (act, label, note, o) => `<button class="mitem${o && o.cls ? ' ' + o.cls : ''}" data-act="${act}"${o && o.v ? ` data-v="${o.v}"` : ''}${o && o.off ? ' disabled' : ''}${o && o.pressed !== undefined ? ` data-toggle aria-pressed="${!!o.pressed}"` : ''}><b>${label}</b>${note ? `<small>${note}</small>` : ''}</button>`;
  const back = item('menupage', 'Back', '', { v: 'main' });
  if (page === 'settings') {
    const sw = (act, label, on, yes, no) => item('menuset', label, on ? yes || 'on' : no || 'off', { v: act, cls: on ? 'on' : 'off', pressed: !!on });
    return `<div class="menu"><h2>Settings</h2><div class="mlist">
      ${sw('mute', 'Sound', !SFX.muted)}
      ${sw('musictoggle', 'Music', SFX.musicOn)}
      ${canFull() ? sw('fullscreen', 'Full screen', isFull()) : ''}
      ${sw('yardtoggle', 'The picture of the yard', !ui.noyard, 'shown', 'hidden')}
      ${sw('abauto', 'Abilities in a fight', !ui.autoCast, 'ask me each time', 'they choose for themselves')}
      ${sw('cutins', 'Cut-ins when an ability is used', !ui.noCut)}
      ${sw('fcam', 'The view of a fight', !ui.fixedCam, 'follows the fighting', 'the whole arena, fixed')}
      ${sw('stilltoggle', 'The pictures and the map', !ui.still, 'moving', 'held still')}
      ${sw('keystoggle', 'Letter and number keys', !ui.noKeys, 'on', 'off')}
      ${sw('tipstops', 'Tab stops at explanations', !!ui.tipStops, 'on', 'off')}
      ${sw('sayblows', 'A fight read aloud', !!ui.sayBlows, 'every blow', 'the main events')}
      ${back}</div><p class="dim mnote">These are kept on this ${DESKTOP ? 'computer' : 'browser'}, for every campaign.</p></div>`;
  }
  if (page === 'stats') return `<div class="menu"><h2>The house in figures</h2>${menuStats()}<div class="mlist">${back}</div></div>`;
  const info = slotInfo(slot);
  return `<div class="menu"><h2>Ludus Magnus</h2><div class="mlist">
    ${item('close', 'Back to the game', escFree() ? 'Esc' : '')}
    ${item('menusave', 'Save now', inFight ? 'not while a fight is on' : ui.menuMsg || `slot ${slot}${info && info.label ? ', ' + esc(info.label) : ''}: kept at every step`, { off: inFight })}
    ${item('menusaves', 'Saves', inFight ? 'not while a fight is on' : 'load, copy, or begin another campaign', { off: inFight })}
    ${item('menupage', 'Settings', 'sound, music, how fights are shown', { v: 'settings' })}
    ${item('menupage', 'The house in figures', `day ${G.day}, ${G.tally.wins} won`, { v: 'stats' })}
    ${item('menuhelp', 'Help and keys', 'H')}
    ${canFull() ? item('fullscreen', isFull() ? 'Leave full screen' : 'Full screen', '') : ''}
    ${item('menuexit', ui.exitArm ? 'Press again to leave' : DESKTOP ? 'Exit the game' : 'Save and leave', ui.exitArm ? (inFight ? 'this fight will be lost as it stands' : 'your campaign is saved first') : '', { cls: ui.exitArm ? 'warn' : '' })}
    </div></div>`;
}
function repaintMenu() { if (menuOpen()) { modalQueue[0] = menuModal(); paintModal(); } }
Object.assign(ACTIONS, {
  menu() {
    if (modalQueue.length) return;
    ui.menuPage = 'main'; ui.menuMsg = ''; ui.exitArm = false;
    if (fight && !fight.finished && !fight.B.over && !fight.paused) { fight.paused = true; paintSpeed(); }      // the sand waits
    SFX.ui('scroll'); showModal(menuModal());
  },
  menupage(v) { ui.menuPage = v; ui.exitArm = false; repaintMenu(); },
  menuset(v) { if (ACTIONS[v]) ACTIONS[v](); repaintMenu(); },
  stilltoggle() { ui.still = !ui.still; try { localStorage.setItem('ludus-magnus-still', ui.still ? '1' : '0'); } catch (e) { /* storage unavailable */ } document.documentElement.classList.toggle('still', ui.still); render(); },
  keystoggle() { ui.noKeys = !ui.noKeys; try { localStorage.setItem('ludus-magnus-keys', ui.noKeys ? '0' : '1'); } catch (e) { /* storage unavailable */ } villageStill(); },
  // out in the province: the surroundings, in words (a11y.js listens for this and says them)
  lookabout() { document.dispatchEvent(new CustomEvent('lookabout')); },
  sayblows() { ui.sayBlows = !ui.sayBlows; try { localStorage.setItem('ludus-magnus-sayblows', ui.sayBlows ? '1' : '0'); } catch (e) { /* storage unavailable */ } },
  tipstops() { ui.tipStops = !ui.tipStops; try { localStorage.setItem('ludus-magnus-tipstops', ui.tipStops ? '1' : '0'); } catch (e) { /* storage unavailable */ } render(); },
  // the list of places, for a keyboard: he walks there as he would for a click on the building
  goto(v) { if (v === 'gate' && !gateOpen()) return; villageWalkTo(v); },
  menusave() { if (fight && !fight.finished) return; save(); ui.menuMsg = `saved to slot ${slot}, just now`; ui.exitArm = false; SFX.ui('coin'); repaintMenu(); },
  menusaves() { closeModal(); ACTIONS.saves(); },
  menuhelp() { closeModal(); ACTIONS.help(); },
  menuexit() {
    if (!ui.exitArm) { ui.exitArm = true; repaintMenu(); return; }
    ui.exitArm = false;
    if (!(fight && !fight.finished)) save();
    if (DESKTOP) { window.close(); return; }
    if (isFull()) document.exitFullscreen().catch(() => { /* already out */ });
    modalQueue[0] = `<div class="menu"><h2>Saved</h2><p>Your campaign is kept in this browser, in slot ${slot}. You can close this tab now; it will be here when you come back.</p>${okBtn('Back to the game')}</div>`;
    paintModal();
    try { window.close(); } catch (e) { /* a tab the player opened is his own to close */ }
  },
  fullscreen() {
    if (!canFull()) return;
    const p = isFull() ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    if (p && p.catch) p.catch(() => { /* refused by the browser: nothing to do */ });
  },
});
document.addEventListener('fullscreenchange', () => { if (G) { renderTop(); if (G.field && typeof renderWilds === 'function') renderWilds(); } repaintMenu(); escHints(); });
// Esc opens it when nothing else is open. (When something is, Esc shuts that: see the keys below.)
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || !G) return;
  if (e.repeat) { e.preventDefault(); e.stopPropagation(); return; }      // held down, it would open the menu and shut it again for as long as it was held
  { const tb = $('#tip'); if (tb && !tb.hidden) { const byKey = tb.dataset.by === 'key'; hideTip(); if (byKey) { e.preventDefault(); e.stopPropagation(); return; } } }
  if (menuOpen()) {                           // in the menu, Esc goes back a page, and from the first page back to the game
    e.preventDefault(); e.stopPropagation();
    if (ui.menuPage && ui.menuPage !== 'main' && $('#modalBox .mlist')) ACTIONS.menupage('main'); else ACTIONS.close();
    return;
  }
  if (!$('#modal').hidden || modalQueue.length) return;
  if (G.field && $('#arena').hidden && typeof prov !== 'undefined' && prov.big) return;      // the whole map is up: Esc folds it
  e.preventDefault(); e.stopPropagation();
  ACTIONS.menu();
}, true);

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
  el.id = 'updatebar'; el.setAttribute('role', 'status');
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
  else if (G.field && G.field.fight) startWildFight();      // the page was closed with a fight out in the province still to be fought: fight it
  checkEnd();
} else {
  newGame(); render(); intro();
}
checkForUpdate();
