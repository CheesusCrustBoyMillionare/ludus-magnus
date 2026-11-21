'use strict';
// Interface: screens, modals, and the arena overlay.

const ui = { tab: 'ludus', sel: null, picks: {}, wagers: {}, cpicks: {}, qwith: {} };
const $ = s => document.querySelector(s);
const pct = (v, m) => Math.round(clamp(v / m, 0, 1) * 100);
const bar = (cls, v, m) => `<div class="bar ${cls}"><i style="width:${pct(v, m)}%"></i></div>`;

// ---------- tooltips ----------

const TIPS = {
  day: 'Each day every fighter trains or rests, and you pay for food and wages.',
  denarii: 'Your money, and what an ordinary day costs or earns you after food, wages and the Guild stipend.\nStay in debt past the days of grace and the creditors take the ludus; an heir then begins again.',
  fame: 'Fame comes from winning bouts, and more from exciting ones. It opens greater arenas with richer purses and stronger opponents.',
  games: 'Games are held every fifth day. Bouts can only be fought on a games day.',
  skip: 'Advance day by day until the games, stopping early if an event needs your decision or men come home from the road.',
  saves: 'Save slots, backups, export and import.',
  health: 'Carried into the arena as it stands. Resting restores far more than training does.',
  fatigue: 'Rises with training and with every bout. A tired man enters the arena short of stamina; above three quarters he is exhausted and risks injury if he trains.',
  morale: 'Men in good spirits train faster and hit harder; broken men yield sooner. Raised by better rations, a cook, the Temple and victories. Lowered by defeats and by comrades dying.',
  autorest: 'When ticked, a fighter who is exhausted rests for the day instead of training into an injury. His assignment is kept.',
  str: 'Strength: harder blows, and a little more health.',
  agi: 'Agility: faster attacks, faster feet and more dodges. Heavy armour dulls it slightly.',
  end: 'Endurance: more health and stamina, quicker recovery, and training tires him less.',
  skl: 'Skill: more blows land, more are blocked if he carries a shield, and more are telling.',
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
  power: 'A single estimate of how dangerous he is right now: stats, gear, traits, morale and current health. The bookmakers use the same number.',
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
  quest: 'A journey of his own that you gave him leave for. Each step takes him away for some days. See it through and he comes back changed, and will never desert you.',
  promise: 'You promised him his freedom. When the victories are won he will come to collect, and the whole yard will see whether you keep your word.',
};
// The daily assignments, as buttons on each fighter's card: [activity, label, tooltip].
const ACT_BUTTONS = [
  ['rest', 'Rest', 'Rest: recovers health and sheds fatigue. Raises no stats.'],
  ['str', 'Strength', 'Train strength: harder blows, and a little more health.'],
  ['agi', 'Agility', 'Train agility: faster attacks, faster feet and more dodges.'],
  ['end', 'Endurance', 'Train endurance: more health and stamina, and training tires him less.'],
  ['skl', 'Skill', 'Train skill: more blows land, more are blocked, more are telling.'],
  ['spar', 'All (spar)', 'Spar: raises all four stats a little at once, and tires him less than drilling one.'],
];
const esc = t => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const tip = k => ` data-tip="${esc(TIPS[k] || k)}"`;

let tipTarget = null;
function placeTip(e) {
  const el = $('#tip'), pad = 14;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + el.offsetWidth > innerWidth - 6) x = e.clientX - el.offsetWidth - pad;
  if (y + el.offsetHeight > innerHeight - 6) y = e.clientY - el.offsetHeight - pad;
  el.style.left = Math.max(6, x) + 'px'; el.style.top = Math.max(6, y) + 'px';
}
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

const TAB_NAMES = { ludus: 'Ludus', arena: 'Arena', market: 'Market', facilities: 'Household' };
const TUTORIAL = [
  { tab: 'ludus', target: '.acts', until: () => G.roster.some(g => g.activity !== 'rest'),
    text: 'These are your fighters. Each trains one stat a day, or rests. <b>Set one of them to train</b> using the buttons on his card.' },
  { tab: 'ludus', target: '.statrow',
    text: 'Click a fighter to open his dossier. Four stats decide how he fights, and the stars show his talent for each: more stars, faster gains. Hover over anything on the screen for an explanation.' },
  { target: '[data-act=endday]', until: () => G.day >= 2,
    text: 'Nothing happens until the day ends. Press <b>End day</b>.' },
  { tab: 'ludus', target: '.bar.fat',
    text: 'Training builds fatigue. An exhausted man risks injury and enters the arena short of breath, so rest him before the games. With the box above the roster ticked, exhausted fighters rest on their own.' },
  { target: '[data-act=tab][data-v=market]', until: () => ui.tab === 'market',
    text: 'Open the <b>Market</b>.' },
  { tab: 'market',
    text: 'New stock arrives every games day. You cannot see a recruit\'s talent without a scout, and your barracks hold only three men for now. Buy when you can afford another mouth to feed.' },
  { target: '[data-act=tab][data-v=facilities]', until: () => ui.tab === 'facilities',
    text: 'Open <b>Household</b>.' },
  { tab: 'facilities',
    text: 'Here you hire staff, improve the ludus and set rations. Everything on this page costs money, either up front or every day. The ledger at the bottom shows your daily spending.' },
  { target: '[data-act=skipdays]', until: () => isGamesDay(),
    text: 'Games are held every fifth day. <b>To the games</b> skips ahead until then, stopping if something needs your decision.' },
  { target: '[data-act=tab][data-v=arena]', until: () => ui.tab === 'arena' || !isGamesDay(),
    text: 'It is a games day. Open the <b>Arena</b>.' },
  { tab: 'arena', target: '.bout:not(.done)', until: () => !G.bouts || G.bouts.some(b => b.done),
    text: 'Each card is a bout. Compare your fighter\'s strength with his opponent\'s, choose who to send, and wager if you trust him. Winning pays a purse and fame, and fame opens greater arenas. <b>Pick a fighter and send him to the sand.</b>' },
  { text: 'A beaten fighter may be spared or killed by the crowd, and wounds keep men out for days. Fighters also earn rank from their bouts, and each new rank lets you choose a perk in his dossier.' },
  { text: 'Three more things, when you are ready. <b>Patrons</b> reward your favour. <b>Rivals</b> shows the other houses and your feuds with them. And a festival comes every fifteen days: watch the Arena tab for it. The <b>Blacksmith</b> sells weapons and armour, graded F to S. Your campaigns are kept under <b>Saves</b>, top right. I will leave you to it.' },
];

function renderTutor() {
  const el = $('#tutor');
  document.querySelectorAll('.tut-glow').forEach(x => x.classList.remove('tut-glow'));
  const t = G && G.tut;
  if (!t || !t.on) { el.hidden = true; return; }
  while (t.step < TUTORIAL.length && TUTORIAL[t.step].until && TUTORIAL[t.step].until()) t.step++;
  if (t.step >= TUTORIAL.length) { t.on = false; save(); el.hidden = true; return; }
  const s = TUTORIAL[t.step], away = s.tab && s.tab !== ui.tab;
  el.innerHTML = `<div class="who">Your steward &middot; ${t.step + 1} of ${TUTORIAL.length}</div>
    <p>${s.text}${away ? `<br><span class="dim">Go to the ${TAB_NAMES[s.tab]} tab.</span>` : ''}</p>
    <div class="row">${s.until ? '' : `<button class="primary" data-act="tutnext">${t.step === TUTORIAL.length - 1 ? 'Thank you' : 'Next'}</button>`}
    <button data-act="tutoff">Dismiss him</button></div>`;
  el.hidden = false;
  const target = s.target && !away ? document.querySelector(s.target) : away ? document.querySelector(`[data-act=tab][data-v=${s.tab}]`) : null;
  if (target) target.classList.add('tut-glow');
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
  renderTutor();
  if (ui.dev) renderDev();
}

function renderTop() {
  const t = tier();
  const next = TIERS[t + 1] ? TIERS[t + 1].fame : FINAL_FAME;
  const dg = daysToGames(), net = stipend() - upkeep();
  $('#topbar').innerHTML = `
    <div class="title">LUDUS MAGNUS${G.dynasty.gen > 1 ? ` <small${tip('dynasty')}>${ordinal(G.dynasty.gen)} generation</small>` : ''}</div>
    <div class="stat"${tip('day')}><b>${ic('day')}${G.day}</b><span>Day</span></div>
    <div class="stat"${tip('denarii')}><b class="${G.denarii < 0 ? 'bad' : 'gold'}">${ic('coin')}${G.denarii}</b><span>Denarii (${net >= 0 ? '+' : ''}${net}/day)</span></div>
    <div class="stat"${tip('fame')}><b>${ic('fame')}${G.fame}<small> / ${next}</small></b><span>Fame &middot; ${TIERS[t].name}</span></div>
    <div class="stat games"${tip('games')}><b>${ic('games')}${dg === 0 ? 'TODAY' : dg + (dg === 1 ? ' day' : ' days')}</b><span>Next games</span></div>
    ${dg > 1 ? `<button data-act="skipdays"${tip('skip')}>To the games &raquo;&raquo;</button>` : ''}
    <button class="primary" data-act="endday">End day &raquo;</button>
    <button data-act="saves"${tip('saves')}>Saves</button>`;
}

function renderTabs() {
  const open = G.bouts ? G.bouts.filter(b => !b.done).length : 0, asked = G.contracts.filter(c => c.asked).length;
  const tabs = [['ludus', 'Ludus'], ['arena', 'Arena'], ['contracts', 'Contracts'], ['rivals', 'Rivals'], ['market', 'Market'], ['smith', 'Blacksmith'], ['facilities', 'Household'], ['patrons', 'Patrons'], ['chronicle', 'Chronicle']];
  $('#tabs').innerHTML = tabs.map(([id, name]) =>
    `<button class="${ui.tab === id ? 'on' : ''}" data-act="tab" data-v="${id}">${name}${id === 'arena' && open ? `<span class="badge">${open}</span>` : ''}${id === 'contracts' && asked ? `<span class="badge">${asked}</span>` : ''}</button>`).join('');
}

function renderView() {
  const v = { ludus: viewLudus, arena: viewArena, contracts: viewContracts, market: viewMarket, smith: viewSmith, rivals: viewRivals, facilities: viewFacilities, patrons: viewPatrons, chronicle: viewChronicle }[ui.tab];
  $('#view').innerHTML = v();
}

function statusChips(g) {
  let s = '';
  if (g.away) s += `<span class="chip gold"${tip('away')}>Away ${daysLeft(jobOf(g))}d</span>`;
  if (g.quest && !g.away) s += `<span class="chip gold"${tip('quest')}>Journey waiting</span>`;
  if (g.wish) s += `<span class="chip red"${tip('vow')}>Vow</span>`;
  if (g.perkPending > 0) s += `<span class="chip gold"${tip('perk')}>Perk to choose</span>`;
  if (g.injury > 0) s += `<span class="chip red"${tip('injured')}>Injured ${g.injury}d</span>`;
  if (g.fatigue > 75) s += `<span class="chip red"${tip('exhausted')}>Exhausted</span>`;
  if (g.foughtDay === G.day) s += `<span class="chip">Fought today</span>`;
  if (g.wins >= 8) s += `<span class="chip gold"${tip('veteran')}>Veteran</span>`;
  return s;
}

function gladCard(g) {
  // one button per activity; a button that cannot be used stays hoverable so its tooltip can say why
  const actBtn = ([k, label, what]) => {
    const why = g.injury > 0 ? 'He is injured and can only rest until he heals.' : k === 'spar' && !staffLvl('doctore') ? 'Sparring needs a doctore. Hire one under Household.' : '';
    return `<button class="${g.activity === k && g.injury <= 0 ? 'on' : ''} ${why ? 'off' : ''}" data-act="activity" data-v="${g.id}" data-w="${k}"${tip(why || what)}>${label}</button>`;
  };
  // a plain sentence saying what he is doing today, then Rest on its own and the training choices under a label
  const doing = g.injury > 0 ? 'recovering from injury' : g.activity === 'rest' ? 'resting' : g.activity === 'spar' ? 'sparring (all four stats)' : 'training ' + STAT_NAMES[g.activity].toLowerCase();
  const acts = `<div class="today">Today he is <b>${doing}</b></div>
      <div class="acts"><span class="lbl">Rest</span><div>${actBtn(ACT_BUTTONS[0])}</div>
      <span class="lbl">Train</span><div>${ACT_BUTTONS.slice(1).map(actBtn).join('')}</div></div>`;
  const J = jobOf(g);
  const gone = J ? `<div class="today">Away: <b>${jobTitle(J)}</b></div><div class="dim" style="font-size:13px">Back ${backWhen(J)}.</div>` : '';
  return `<div class="panel gcard ${ui.sel === g.id ? 'sel' : ''} ${J ? 'away' : ''}" data-act="sel" data-v="${g.id}">
    <canvas width="96" height="112" data-portrait="${g.id}"></canvas>
    <div>
      <div class="name">${g.name}</div>
      <div class="sub">${RANKS[g.rank].name} &middot; ${CLASSES[g.cls].name} &middot; ${g.wins}W ${g.losses}L</div>
      <div>${statusChips(g)}</div>
      <div class="barrow icrow"${tip('health')}>${ic('health')} ${bar('hp', g.hp, maxHp(g))}</div>
      <div class="barrow icrow"${tip('fatigue')}>${ic('fatigue')} ${bar('fat', g.fatigue, 100)}</div>
      <div class="barrow icrow"${tip('morale')}>${ic('morale')} ${bar('mor', g.morale, 100)}</div>
      ${J ? gone : acts}
    </div>
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

function gladDetail(g) {
  const c = CLASSES[g.cls];
  const tac = Object.entries(TACTICS).map(([k, t]) => `<option value="${k}" ${g.tactic === k ? 'selected' : ''}>${t.name}</option>`).join('');
  return `<div class="panel">
    <div class="row" style="align-items:flex-start">
      <canvas class="portrait" width="192" height="224" data-portrait="${g.id}"${tip(faceTip(g))}></canvas>
      <div style="flex:1;min-width:180px">
        <h2 style="margin-bottom:2px">${g.name}</h2>
        <div>${RANKS[g.rank].name} &middot; ${c.name} of ${g.origin}</div>
        <div class="dim" style="font-size:13px">${c.desc}</div>
        <div style="font-size:13px"><b class="gold">${SPECIALS[g.cls].name}.</b> <span class="dim">${SPECIALS[g.cls].desc}</span></div>
        <div style="margin-top:6px">${statusChips(g)}</div>
        <div class="num dim" style="font-size:13px">${g.wins} wins &middot; ${g.losses} losses &middot; ${g.kills} kills &middot; health ${Math.round(g.hp)}/${maxHp(g)}</div>
        ${g.rank < RANKS.length - 1 ? `<div class="barrow"${tip('rank')} style="grid-template-columns:auto 1fr;margin-top:4px">To ${RANKS[g.rank + 1].name} ${bar('prog', g.xp - RANKS[g.rank].xp, RANKS[g.rank + 1].xp - RANKS[g.rank].xp)}</div>` : ''}
        ${g.perkPending > 0 ? `<button class="primary" data-act="perk" data-v="${g.id}" style="margin-top:6px">Choose a perk</button>` : ''}
      </div>
    </div>
    <hr class="sep">
    ${statRows(g)}
    <hr class="sep">
    ${traitList(g)}
    ${storyBlock(g)}
    ${questBlock(g)}
    <hr class="sep">
    ${gearBlock(g)}
    <hr class="sep">
    <div class="kv">
      <span${tip('orders')}>Orders in the arena<br><small>${TACTICS[g.tactic].desc}</small></span>
      <select data-chg="tactic" data-v="${g.id}">${tac}</select>
    </div>
    <hr class="sep">
    <div class="row">${g.away ? `<small>He is away from the ludus: ${jobTitle(jobOf(g)).toLowerCase()}, back ${backWhen(jobOf(g))}. He cannot be sold or freed until he returns.</small>` : `
      <button${tip('sell')} data-act="sell" data-v="${g.id}">Sell for ${Math.round(value(g) / 2)}</button>
      ${g.wins >= 8 ? `<button${tip('free')} data-act="free" data-v="${g.id}">Grant the wooden sword</button>` : `<small>Freedom may be granted after 8 victories.</small>`}`}
    </div>
  </div>`;
}

function viewLudus() {
  if (!G.roster.length) return `<div class="panel">Your cells are empty. Visit the market.</div>`;
  if (!byId(ui.sel)) ui.sel = G.roster[0].id;
  return `<div class="cols">
    <div><h2>Gladiators <small>${G.roster.length} / ${capacity()}</small></h2>
      <label class="row"${tip('autorest')} style="margin-bottom:10px;font-size:14px;gap:6px"><input type="checkbox" data-chg="autorest" ${G.autoRest ? 'checked' : ''}> Exhausted fighters rest on their own</label><div class="grid">${G.roster.map(gladCard).join('')}</div></div>
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
  const board = G.contracts.map(contractCard).join('') || '<div class="panel dim">Nobody in town has work for your men today. New offers come with each games day.</div>';
  const away = G.jobs.map(J => `<div style="margin-bottom:8px"><b>${jobTitle(J)}</b> <small>${J.kind === 'quest' ? 'a journey of his own' : PATRONS[J.patron].name}</small><br>
      ${jobMen(J).map(g => `<span class="chip pick" data-act="dossier" data-v="${g.id}">${g.name}</span>`).join('')} <span class="dim">back ${backWhen(J)}</span></div>`).join('')
    || '<div class="dim">Every man is in the yard.</div>';
  const waiting = G.roster.filter(g => g.quest && !g.away).map(g => `<div style="margin-bottom:6px"><span class="chip pick" data-act="dossier" data-v="${g.id}">${g.name}</span> <b>${QUESTS[g.quest.id].name}</b> <span class="dim">&middot; next: ${questStep(g).name.toLowerCase()} (${questStep(g).days} days)</span></div>`).join('');
  return `<div class="cols">
    <div><h2>Work on offer <small>until the next games</small></h2><div class="grid">${board}</div></div>
    <div><h2>Away from the ludus</h2><div class="panel">${away}</div>
      ${waiting ? `<h2 style="margin-top:16px">Journeys promised</h2><div class="panel">${waiting}<small>Send a man on his journey from his dossier.</small></div>` : ''}
      <div class="panel dim" style="margin-top:16px;font-size:13px">Contracts pay about half what the same men would win at the games, and earn favour with the patron who offered them. Men who are away do not train and miss any games held while they are gone. From time to time a fighter of some standing will ask leave for a journey of his own.</div>
    </div>
  </div>`;
}

// A fighter's own journey, in his dossier: where it stands, and the button that sends him on.
function questBlock(g) {
  if (!g.quest) return '';
  const Q = QUESTS[g.quest.id], S = questStep(g), J = jobOf(g);
  const head = `<hr class="sep"><div${tip('quest')}><b class="gold">${Q.name}</b> <small>part ${g.quest.step + 1} of ${Q.steps.length}: ${S.name.toLowerCase()}</small></div>`;
  if (J && J.kind === 'quest' && J.who === g.id) return `${head}<div class="dim" style="font-size:13px">${S.text} He will be back ${backWhen(J)}.</div>`;
  if (g.away) return `${head}<div class="dim" style="font-size:13px">It waits until he is home.</div>`;
  const others = S.with ? G.roster.filter(o => o !== g && canSend(o)) : [];
  const wid = ui.qwith[g.id] = others.some(o => o.id === ui.qwith[g.id]) ? ui.qwith[g.id] : null;
  const need = jobNeed(tier(), S.diff), p = questOdds(g, wid), waited = G.day - g.quest.since;
  const why = g.injury > 0 ? 'He must heal first.' : inTourney(g) ? 'He is entered in the tournament.' : '';
  return `${head}<div style="font-size:13px">${S.text} <span class="num">${S.days}</span> days away${missesGames(S.days) ? ', <span class="bad">missing the games</span>' : ''}. ${DANGER_WORD(S.danger)}.${g.quest.tries ? ' <span class="bad">He has failed at this once; a second failure ends it.</span>' : ''}${waited >= 6 ? ` <span class="bad">He has waited ${waited} days.</span>` : ''}</div>
    ${S.with ? `<div style="margin-top:6px;font-size:13px">A companion, if you can spare one: ${others.map(o => pickChip('qwith', g.id, o, wid === o.id, S, need, null)).join('') || '<span class="dim">nobody is free.</span>'}</div>` : ''}
    <div class="row" style="margin-top:6px"><button class="primary" data-act="qsend" data-v="${g.id}" ${why ? 'disabled' : ''}>Send him</button>
      <span${tip('odds')}>${why || `Chance of success <b class="num ${p >= 0.5 ? 'good' : 'bad'}">${asPct(p)}</b>`}</span></div>`;
}

// What came of the outings that ended this morning.
function showReports() {
  if (!G.reports || !G.reports.length) return;
  G.reports.splice(0).forEach(r => showModal(`<h2>${r.title}</h2>${r.html}${okBtn()}`));
  save();
}

function boutCard(b) {
  const D = DIFF[b.diff];
  const kind = ['Duel', 'Pairs', 'Melee', 'Melee', 'Melee'][b.size - 1];
  const foes = boutEnemies(b).map(e => `<div>${e.beast ? e.name : e.name + ', ' + CLASSES[e.cls].name} <span class="dim num"${tip('power')}>(strength ${Math.round(power(e))})</span>${rivalNote(e)}${vowNote(e)}</div>`).join('');
  let body;
  if (b.done) body = '<div class="dim">This bout has been fought.</div>';
  else {
    const picks = (ui.picks[b.id] || []).filter(id => byId(id) && canFight(byId(id)));
    ui.picks[b.id] = picks;
    const avail = G.roster.filter(canFight);
    const chips = avail.length
      ? avail.map(g => `<span class="chip pick ${picks.includes(g.id) ? 'on' : ''}" data-act="pick" data-v="${b.id}" data-w="${g.id}"${tip('power')}>${g.name} <span class="num">${Math.round(power(g))}</span></span>`).join('')
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

function viewArena() {
  const t = tier();
  const ladder = TIERS.map((x, i) => `<div class="${i === t ? 'cur' : i < t ? 'past' : ''}">${x.name} <small class="num">${x.fame} fame</small></div>`).join('')
    + `<div class="${G.fame >= FINAL_FAME ? 'cur' : ''}">The Emperor's Games <small class="num">${FINAL_FAME} fame</small></div>`;
  const left = G.bouts
    ? `${festivalNote()}${tourneyPanel()}<h2>Today's games</h2>${G.fix ? '<p class="bad">You have agreed to lose your next bout.</p>' : ''}<div class="grid">${G.bouts.map(boutCard).join('')}</div>`
    : `${festivalNote()}<h2>The arena is quiet</h2><div class="panel">The next games are in <b>${daysToGames()}</b> ${daysToGames() === 1 ? 'day' : 'days'}. Train, rest and arm your fighters until then.</div>`;
  return `<div class="cols"><div>${left}</div>
    <div><h2>The road to Rome</h2><div class="panel ladder">${ladder}
      <p class="dim" style="font-size:13px">Fame opens greater arenas with richer purses and deadlier opponents. Reach ${FINAL_FAME} fame to be summoned before the Emperor.</p></div></div></div>`;
}

function viewMarket() {
  const full = G.roster.length >= capacity();
  const cards = G.market.map(g => `<div class="panel">
      <div class="row" style="align-items:flex-start">
        <canvas class="portrait" width="96" height="112" data-mportrait="${g.id}"></canvas>
        <div style="flex:1"><div style="font-size:16px">${g.name}</div>
          <div class="dim" style="font-size:13px">${CLASSES[g.cls].name} of ${g.origin}</div>
          <div class="num dim" style="font-size:13px">health ${maxHp(g)}${g.gear && g.gear.weapon ? ' &middot; comes with ' + itemTag(g.gear.weapon) : ''}</div></div>
      </div>
      <div style="margin-top:8px">${statRows(g, !staffLvl('scout'))}</div>
      <div style="margin:8px 0">${traitList(g)}</div>
      <button class="primary" data-act="buy" data-v="${g.id}" ${full || G.denarii < g.price ? 'disabled' : ''}>Buy &mdash; ${g.price} denarii</button>
    </div>`).join('');
  return `<h2>The slave market <small>${G.roster.length} / ${capacity()} cells filled &middot; new stock every games day</small></h2>
    ${full ? '<p class="bad">Your barracks are full. Build more cells or sell a fighter.</p>' : ''}
    <div class="cards">${cards || '<div class="panel dim">The dealer has nothing left until the next games.</div>'}</div>`;
}

function viewFacilities() {
  const cards = Object.entries(FACILITIES).map(([k, f]) => {
    const l = G.fac[k];
    return `<div class="panel"><h3>${f.name} <span class="pips">${'●'.repeat(l)}${'○'.repeat(3 - l)}</span></h3>
      <div class="dim" style="font-size:13px">${f.desc}</div>
      <p>${f.effect(l)}</p>
      ${l < 3 ? `<p class="dim" style="font-size:13px">Next: ${f.effect(l + 1)}</p>
        <button data-act="build" data-v="${k}" ${G.denarii < FAC_COST[l] ? 'disabled' : ''}>Improve &mdash; ${FAC_COST[l]} denarii</button>` : '<span class="dim">Fully built.</span>'}
    </div>`;
  }).join('');
  const rations = RATIONS.map((r, i) => `<button class="${G.ration === i ? 'primary' : ''}" data-act="ration" data-v="${i}">${r.name} &middot; ${r.cost}/man/day</button>`).join('');
  return `${staffSection()}<h2 style="margin-top:20px">Facilities</h2><div class="cards">${cards}</div>
    <h2 style="margin-top:20px"${tip('rations')}>Rations</h2>
    <div class="panel"><div class="row">${rations}</div>
    <p class="dim" style="font-size:13px">Better food keeps morale high. Men in good spirits train faster and hit harder.</p></div>${ledger()}`;
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
  const rows = [['Food', -foodCost()], ['Wages', -wages()], ['Guild stipend', stipend()]];
  const net = stipend() - upkeep();
  const cell = v => `<b class="num ${v < 0 ? 'bad' : v > 0 ? 'good' : 'dim'}">${v > 0 ? '+' : ''}${v}</b>`;
  return `<h2 style="margin-top:20px">Daily ledger</h2><div class="panel"><div class="kv">
    ${rows.map(([n, v]) => `<span>${n}</span>${cell(v)}`).join('')}<span>Net per day</span>${cell(net)}</div>
    <p class="dim" style="font-size:13px">Purses, wagers and gifts come on top of this.</p></div>`;
}

function viewPatrons() {
  const cards = Object.entries(PATRONS).map(([k, p]) => {
    const f = G.patrons[k], cost = giftCost(k);
    return `<div class="panel"><h3>${p.name}</h3><div class="dim" style="font-size:13px">${p.desc}</div>
      <div class="barrow"${tip('favour')} style="margin:8px 0">Favour ${bar('prog', f, 100)}</div>
      <p>${p.perk(f)}</p>
      <button data-act="gift" data-v="${k}" ${G.denarii < cost || f >= 100 ? 'disabled' : ''}>Send a gift &mdash; ${cost} denarii</button></div>`;
  }).join('');
  return `<h2>Patrons</h2>${G.fix ? `<p class="bad">You have agreed to lose your next bout for ${G.fix.pay} denarii.</p>` : ''}
    <div class="cards">${cards}</div>
    <p class="dim" style="font-size:13px;margin-top:12px">Favour fades a little every games day. Victories please the Magistrate, and a roaring crowd pleases the Guild. Each gift costs more than the last.</p>`;
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
  const rows = G.houses.map(H => ({ id: H.id, name: houseDef(H.id).name, p: H.prestige }))
    .concat([{ name: 'Your ludus', p: G.fame, you: true }]).sort((a, b) => b.p - a.p);
  const table = rows.map((r, i) => `<div class="${r.you ? 'cur' : ''}">${i + 1}. ${swatch(r.id)}${r.name} <small class="num">${r.p}</small></div>`).join('');
  const cards = G.houses.map(H => {
    const d = houseDef(H.id);
    const men = H.roster.slice().sort((a, b) => statSum(b) - statSum(a)).map(e => `<div class="rival">
        <canvas width="48" height="56" data-rportrait="${H.id}:${e.id}"></canvas>
        <div>${e.name} <span class="dim">${RANKS[e.rank].name} ${CLASSES[e.cls].name}</span><br>
        <span class="dim num">strength ${Math.round(power(e))}</span>${rivalNote(e)}</div></div>`).join('');
    return `<div class="panel" style="border-left:6px solid ${d.col}"><h3>${d.name}</h3>
      <div class="dim" style="font-size:13px">${d.lanista}. ${d.blurb}</div>
      <div class="num" style="margin:6px 0">Against you: ${H.won} won, ${H.lost} lost</div>
      <div class="barrow"${tip('feud')}>Feud ${bar('hp', H.grudge, 100)}</div>
      ${H.grudge >= 40 ? '<div class="death">Their champion will call you out at the next games</div>' : ''}
      <hr class="sep">${men}</div>`;
  }).join('');
  return `<div class="cols"><div><h2>Rival houses</h2><div class="grid">${cards}</div></div>
    <div><h2>Standing</h2><div class="panel ladder">${table}
      <p class="dim" style="font-size:13px">Renown of every school in the province; yours is your fame. Beating a house that stands above you earns extra fame.
      Killing a house's fighters, or losing your own to them, deepens the feud. At 40 their champion challenges you to a grudge match, and leaving it unanswered costs you with the Magistrate and your own men.</p></div></div></div>`;
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
  const card = (it, own) => {
    const who = best(it);
    return `<div class="panel item"><div class="itemhead">${itemArt(it, 60)}<div><h3>${itemTag(it)}</h3>
      <div class="dim" style="font-size:12px;text-transform:uppercase;letter-spacing:.06em">${SLOT_INFO[it.slot].name}${it.slot === 'weapon' ? ' &middot; ' + CLASSES[it.cls].name : ''}</div></div></div>
      <p style="font-size:14px">${itemEffect(it)}</p>
      <div class="dim" style="font-size:13px;margin-bottom:8px">${who.length ? 'An improvement for ' + who.join(', ') : it.slot === 'weapon' && !G.roster.some(g => g.cls === it.cls) ? 'Nobody in your ludus fights this way' : 'No better than what your men wear'}</div>
      ${own ? `<button data-act="smithsell" data-v="${it.id}">Sell back &mdash; ${Math.round(itemPrice(it) / 2)}</button>`
            : `<button class="primary" data-act="smithbuy" data-v="${it.id}" ${G.denarii < buyPrice(it) ? 'disabled' : ''}>Buy &mdash; ${buyPrice(it)} denarii</button>`}
    </div>`;
  };
  const stock = S.stock.map(it => card(it, false)).join('') || '<div class="panel dim">He has sold everything he had. Come back after the next games.</div>';
  const mine = G.armoury.slice().sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) || b.r - a.r).map(it => card(it, true)).join('')
    || '<div class="panel dim">The racks are empty. Pieces you buy wait here until a fighter wears them; open a fighter\'s dossier to equip him.</div>';
  return `<div class="panel" style="margin-bottom:16px"><div class="row">
      <div style="flex:1;min-width:220px"><h3${tip('smithlevel')}>${SMITH_NAMES[lv]} <span class="pips">${'●'.repeat(lv)}${'○'.repeat(4 - lv)}</span></h3>
      <div class="dim" style="font-size:13px">Offers ${4 + lv} pieces each games day, graded ${range[0]} to ${range[range.length - 1]}.${lv < 4 ? ` Improved, he would offer ${5 + lv}, graded ${RARITY.filter((_, i) => SMITH_ODDS[lv + 1][i] > 0)[0]} to ${RARITY.filter((_, i) => SMITH_ODDS[lv + 1][i] > 0).slice(-1)[0]}.` : ' There is no finer forge in the empire.'}</div></div>
      ${lv < 4 ? `<button data-act="smithup" ${G.denarii < SMITH_COST[lv] ? 'disabled' : ''}>Improve the forge &mdash; ${SMITH_COST[lv]} denarii</button>` : ''}
    </div></div>
    <h2>For sale <small>new stock every games day</small></h2><div class="cards">${stock}</div>
    <h2 style="margin-top:20px"${tip('armoury')}>Your armoury <small>${G.armoury.length} spare ${G.armoury.length === 1 ? 'piece' : 'pieces'}</small></h2><div class="cards">${mine}</div>`;
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
  return `<h2 style="margin-top:20px">The house <small>${ordinal(D.gen)} generation &middot; ${D.points} legacy unspent</small></h2>
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

function viewChronicle() {
  const rows = G.log.slice().reverse().map(e => `<div class="${e.k}"><span class="d">Day ${e.d}</span>${e.t}</div>`).join('');
  const fallen = G.fallen.length ? `<h2 style="margin-top:20px">The fallen</h2><div class="panel">${G.fallen.map(f => `<div>${f.name}, ${CLASSES[f.cls].name} &mdash; ${f.wins} victories, died day ${f.day}${f.by ? ', slain by ' + f.by : ''}</div>`).join('')}</div>` : '';
  return `<h2>Chronicle</h2><div class="panel log">${rows}</div>${fallen}${dynastyPanel()}
    <p style="margin-top:20px" class="row"><button data-act="tuton">Summon the steward (tutorial)</button><button data-act="askreset">Abandon this ludus and start anew</button></p>`;
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
  const wager = Math.min(ui.wagers[b.id] || 0, Math.max(0, G.denarii));
  const odds = winOdds(picks, boutEnemies(b));
  G.denarii -= wager;
  const B = createBattle(picks, boutEnemies(b), { death: b.death, mercy: [mercyBonus(), 0], tier: b.final ? 4 : tier(), names: ['Your ludus', b.hunt ? 'The beasts' : b.house], hunt: !!b.hunt,
    foeCol: b.houseId && houseDef(b.houseId).col, foeColD: b.houseId && houseDef(b.houseId).colD });
  SFX.init(); SFX.play('horn');
  fight = { bout: b, B, speed: 1, wager, pay: odds.pay, last: 0, raf: 0 };
  $('#arenaHead').innerHTML = `<span style="color:${TEAM_COL[0]}">Your ludus</span> <span class="dim">vs</span> <span style="color:${b.houseId ? houseDef(b.houseId).col : '#6fa4e6'}">${b.house}</span>${b.death ? ' &middot; <span class="death">to the death</span>' : ''}`;
  $('#arena').hidden = false;
  paintSpeed(); paintOrders();
  drawBattle($('#arenaCanvas').getContext('2d'), B);
  fight.raf = requestAnimationFrame(fightLoop);
}
// The order buttons: greyed while your voice recovers, with the seconds left on them.
function paintOrders() {
  if (!fight) return;
  const B = fight.B, wait = Math.ceil(B.orderCd);
  const state = [canOrder(B, 'press'), canOrder(B, 'yield'), wait, B.order ? B.order.kind : ''].join();
  if (state === fight.ordState) return;
  fight.ordState = state;
  for (const [id, kind, label] of [['ordPress', 'press', 'Press!'], ['ordHold', 'hold', 'Hold!']]) {
    const b = $('#' + id);
    b.disabled = !canOrder(B, kind);
    b.classList.toggle('on', !!B.order && B.order.kind === kind);
    b.textContent = B.orderCd > 0 && !(B.order && B.order.kind === kind) && !B.over ? `${label} (${wait})` : label;
  }
  $('#ordYield').disabled = !canOrder(B, 'yield');
  $('#arenaOrders').style.visibility = B.hunt && B.death ? 'hidden' : 'visible';
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
  for (const s of f.B.snd) SFX.play(s[0], s[1]);
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
  let guard = 0;
  while ((!f.B.over || f.B.outro <= f.B.outroEnd) && guard++ < 20000) stepBattle(f.B, 1 / 30);
  f.B.snd.length = 0; SFX.quiet();
  drawBattle($('#arenaCanvas').getContext('2d'), f.B);
  const r = applyBoutResult(f.bout, f.B, f.wager, f.pay);
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
  tab(v) { ui.tab = v; render(); },
  yard(v, w, el, e) {                       // click a fighter to open his dossier, a building to go to its screen
    const h = typeof yardPick === 'function' ? yardPick(el, e) : null;
    if (!h) return;
    if (h.fighter) { ui.sel = h.fighter; ui.tab = 'ludus'; } else ui.tab = h.tab;
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
    showReports();
    if (G.pendingEvent) showEvent();
    checkEnd();
  },
  forceend() { closeModal(); ACTIONS.endday(); },
  evopt(v) {
    const pe = G.pendingEvent; if (!pe) { closeModal(); return; }
    const E = EVENTS[pe.id];
    const res = E.opts[+v].run(pe.c);
    log(`${E.title}: ${res}`);
    G.pendingEvent = null; nextEvent(); save();
    modalQueue[0] = `<h2>${E.title}</h2><p>${res}</p>${okBtn()}`;
    paintModal(); render();
    if (G.pendingEvent) showEvent();          // another matter is waiting behind this one
  },
  dossier(v) { ui.sel = +v; ui.tab = 'ludus'; render(); },
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
  qwith(v, w) { ui.qwith[v] = ui.qwith[v] === +w ? null : +w; render(); },
  qsend(v) { if (sendQuest(v, ui.qwith[v])) { delete ui.qwith[v]; render(); } },
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
  tutstart() { G.tut = { step: 0, on: true }; save(); closeModal(); render(); },
  tuton() { G.tut = { step: 0, on: true }; ui.tab = 'ludus'; save(); render(); },
  tutnext() { G.tut.step++; save(); renderTutor(); },
  tutoff() { G.tut.on = false; save(); renderTutor(); },
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
  mute() { SFX.toggle(); paintSpeed(); },
  speed(v) { if (fight) { fight.speed = +v; paintSpeed(); } },
  order(v) { if (fight && !fight.finished && giveOrder(fight.B, v)) paintOrders(); },
  skip() { finishFight(); },
  leavearena() { SFX.stop(); $('#arena').hidden = true; fight = null; closeModal(); render(); if (G.pendingEvent) showEvent(); checkEnd(); },
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

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
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
      <li>Hire staff under <b>Household</b>, court the powerful under <b>Patrons</b>, and choose a perk each time a fighter earns a new rank.</li>
      <li>Tired or wounded men lose. Dead men stay dead.</li>
      <li>Stay in debt for ${graceDays()} days and the creditors take the ludus. That is not the end: your heir begins again, with whatever the family managed to keep.</li>
    </ul><div class="row"><button class="primary" data-act="tutstart">Show me the ropes</button><button data-act="close">I know the trade</button></div>`);
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
  tutorial: () => { G.tut = { step: 0, on: true }; ui.tab = 'ludus'; return 'The steward is back at step one.'; },
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
  const kind = { 1: 'press', 2: 'hold', 3: 'yield' }[e.key];
  if (kind) { e.preventDefault(); ACTIONS.order(kind); }
});
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
