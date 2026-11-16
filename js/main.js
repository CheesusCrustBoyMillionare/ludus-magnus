'use strict';
// Interface: screens, modals, and the arena overlay.

const ui = { tab: 'ludus', sel: null, picks: {}, wagers: {} };
const $ = s => document.querySelector(s);
const pct = (v, m) => Math.round(clamp(v / m, 0, 1) * 100);
const bar = (cls, v, m) => `<div class="bar ${cls}"><i style="width:${pct(v, m)}%"></i></div>`;

// ---------- tooltips ----------

const TIPS = {
  day: 'Each day every fighter trains or rests, and you pay for food and wages.',
  denarii: 'Your money, and what an ordinary day costs or earns you after food, wages and the Guild stipend.\nTen days in debt and the creditors take the ludus.',
  fame: 'Fame comes from winning bouts, and more from exciting ones. It opens greater arenas with richer purses and stronger opponents.',
  games: 'Games are held every fifth day. Bouts can only be fought on a games day.',
  skip: 'Advance day by day until the games, stopping early if an event needs your decision.',
  saves: 'Save slots, backups, export and import.',
  health: 'Carried into the arena as it stands. Resting restores far more than training does.',
  fatigue: 'Rises with training and with every bout. A tired man enters the arena short of stamina; above three quarters he is exhausted and risks injury if he trains.',
  morale: 'Men in good spirits train faster and hit harder; broken men yield sooner. Raised by better rations, a cook, the Temple and victories. Lowered by defeats and by comrades dying.',
  activity: 'What he does each day. Training raises one stat. Sparring raises all four a little but needs a doctore.',
  autorest: 'When ticked, a fighter who is exhausted rests for the day instead of training into an injury. His assignment is kept.',
  str: 'Strength: harder blows, and a little more health.',
  agi: 'Agility: faster attacks, faster feet and more dodges. Heavy armour dulls it slightly.',
  end: 'Endurance: more health and stamina, quicker recovery, and training tires him less.',
  skl: 'Skill: more blows land, more are blocked if he carries a shield, and more are telling.',
  talent: 'Talent: how quickly this stat improves with training. One star is slow, five is exceptional.',
  hidden: 'You cannot judge a recruit\'s talent by looking at him. Employ a scout to see it before you buy.',
  rank: 'Fighters earn rank from bouts, wins and kills. Each new rank lets you choose a perk for him.',
  weapon: 'Better weapons add damage to every blow.',
  armor: 'Armour takes damage off every blow that lands, at a small cost to dodging.',
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
};
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
  { tab: 'ludus', target: '[data-chg=activity]', until: () => G.roster.some(g => g.activity !== 'rest'),
    text: 'These are your fighters. Each trains one stat a day, or rests. <b>Set one of them to train</b> using the list on his card.' },
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
  { text: 'Three more things, when you are ready. <b>Patrons</b> reward your favour. <b>Rivals</b> shows the other houses and your feuds with them. And a festival comes every fifteen days: watch the Arena tab for it. Your campaigns are kept under <b>Saves</b>, top right. I will leave you to it.' },
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
  renderTutor();
}

function renderTop() {
  const t = tier();
  const next = TIERS[t + 1] ? TIERS[t + 1].fame : FINAL_FAME;
  const dg = daysToGames(), net = stipend() - upkeep();
  $('#topbar').innerHTML = `
    <div class="title">LUDUS MAGNUS</div>
    <div class="stat"${tip('day')}><b>${G.day}</b><span>Day</span></div>
    <div class="stat"${tip('denarii')}><b class="${G.denarii < 0 ? 'bad' : 'gold'}">${G.denarii}</b><span>Denarii (${net >= 0 ? '+' : ''}${net}/day)</span></div>
    <div class="stat"${tip('fame')}><b>${G.fame}<small> / ${next}</small></b><span>Fame &middot; ${TIERS[t].name}</span></div>
    <div class="stat games"${tip('games')}><b>${dg === 0 ? 'TODAY' : dg + (dg === 1 ? ' day' : ' days')}</b><span>Next games</span></div>
    ${dg > 1 ? `<button data-act="skipdays"${tip('skip')}>To the games &raquo;&raquo;</button>` : ''}
    <button class="primary" data-act="endday">End day &raquo;</button>
    <button data-act="saves"${tip('saves')}>Saves</button>`;
}

function renderTabs() {
  const open = G.bouts ? G.bouts.filter(b => !b.done).length : 0;
  const tabs = [['ludus', 'Ludus'], ['arena', 'Arena'], ['rivals', 'Rivals'], ['market', 'Market'], ['facilities', 'Household'], ['patrons', 'Patrons'], ['chronicle', 'Chronicle']];
  $('#tabs').innerHTML = tabs.map(([id, name]) =>
    `<button class="${ui.tab === id ? 'on' : ''}" data-act="tab" data-v="${id}">${name}${id === 'arena' && open ? `<span class="badge">${open}</span>` : ''}</button>`).join('');
}

function renderView() {
  const v = { ludus: viewLudus, arena: viewArena, market: viewMarket, rivals: viewRivals, facilities: viewFacilities, patrons: viewPatrons, chronicle: viewChronicle }[ui.tab];
  $('#view').innerHTML = v();
}

function statusChips(g) {
  let s = '';
  if (g.perkPending > 0) s += `<span class="chip gold"${tip('perk')}>Perk to choose</span>`;
  if (g.injury > 0) s += `<span class="chip red"${tip('injured')}>Injured ${g.injury}d</span>`;
  if (g.fatigue > 75) s += `<span class="chip red"${tip('exhausted')}>Exhausted</span>`;
  if (g.foughtDay === G.day) s += `<span class="chip">Fought today</span>`;
  if (g.wins >= 8) s += `<span class="chip gold"${tip('veteran')}>Veteran</span>`;
  return s;
}

function gladCard(g) {
  const acts = Object.entries(ACTIVITIES).map(([k, n]) => `<option value="${k}" ${g.activity === k ? 'selected' : ''} ${k === 'spar' && !staffLvl('doctore') ? 'disabled' : ''}>${n}</option>`).join('');
  return `<div class="panel gcard ${ui.sel === g.id ? 'sel' : ''}" data-act="sel" data-v="${g.id}">
    <canvas width="72" height="84" data-portrait="${g.id}"></canvas>
    <div>
      <div class="name">${g.name}</div>
      <div class="sub">${RANKS[g.rank].name} &middot; ${CLASSES[g.cls].name} &middot; ${g.wins}W ${g.losses}L</div>
      <div>${statusChips(g)}</div>
      <div class="barrow"${tip('health')}>Health ${bar('hp', g.hp, maxHp(g))}</div>
      <div class="barrow"${tip('fatigue')}>Fatigue ${bar('fat', g.fatigue, 100)}</div>
      <div class="barrow"${tip('morale')}>Morale ${bar('mor', g.morale, 100)}</div>
      <select${tip('activity')} data-chg="activity" data-v="${g.id}" ${g.injury > 0 ? 'disabled' : ''} style="margin-top:6px;width:100%">${acts}</select>
    </div>
  </div>`;
}

function statRows(g, hide) {
  return STATS.map(s => `<div class="statrow"${tip(s)}>
      <span>${STAT_NAMES[s]}</span><b class="num">${g.stats[s]}</b>
      ${bar('prog', g.prog[s], needProg(g.stats[s]))}
      <span class="stars"${tip(hide ? 'hidden' : 'talent')}>${hide ? '? ? ?' : '★'.repeat(stars(g.pot[s])) + '☆'.repeat(5 - stars(g.pot[s]))}</span>
    </div>`).join('');
}
function traitList(g) {
  return g.traits.length
    ? g.traits.map(t => `<div class="trait"><b class="${TRAITS[t].good ? 'good' : 'bad'}">${TRAITS[t].name}</b> <span class="dim">${TRAITS[t].desc}</span></div>`).join('')
    : '<div class="dim">No notable traits.</div>';
}

function gladDetail(g) {
  const c = CLASSES[g.cls];
  const gear = (slot, names) => {
    const lvl = g[slot];
    const btn = lvl < 3
      ? `<button data-act="gear" data-v="${g.id}" data-w="${slot}" ${G.denarii < GEAR_COST[lvl + 1] ? 'disabled' : ''}>${names[lvl + 1]} &mdash; ${GEAR_COST[lvl + 1]}</button>`
      : '<span class="dim">Finest there is</span>';
    return `<span${tip(slot)}>${slot === 'weapon' ? 'Weapon' : 'Armour'}: <b>${names[lvl]}</b></span>${btn}`;
  };
  const tac = Object.entries(TACTICS).map(([k, t]) => `<option value="${k}" ${g.tactic === k ? 'selected' : ''}>${t.name}</option>`).join('');
  return `<div class="panel">
    <div class="row" style="align-items:flex-start">
      <canvas class="portrait" width="120" height="140" data-portrait="${g.id}"></canvas>
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
    <hr class="sep">
    <div class="kv">${gear('weapon', WEAPON_TIERS)}${gear('armor', ARMOR_TIERS)}
      <span${tip('orders')}>Orders in the arena<br><small>${TACTICS[g.tactic].desc}</small></span>
      <select data-chg="tactic" data-v="${g.id}">${tac}</select>
    </div>
    <hr class="sep">
    <div class="row">
      <button${tip('sell')} data-act="sell" data-v="${g.id}">Sell for ${Math.round(value(g) / 2)}</button>
      ${g.wins >= 8 ? `<button${tip('free')} data-act="free" data-v="${g.id}">Grant the wooden sword</button>` : `<small>Freedom may be granted after 8 victories.</small>`}
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

function boutCard(b) {
  const D = DIFF[b.diff];
  const kind = ['Duel', 'Pairs', 'Melee', 'Melee', 'Melee'][b.size - 1];
  const foes = boutEnemies(b).map(e => `<div>${e.beast ? e.name : e.name + ', ' + CLASSES[e.cls].name} <span class="dim num"${tip('power')}>(strength ${Math.round(power(e))})</span>${rivalNote(e)}</div>`).join('');
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
    <h3${tip('bout')}>${b.final ? "The Emperor's Games" : b.grudge ? 'Grudge match' : b.hunt ? 'Beast hunt &middot; ' + D.name : b.melee ? 'The great melee' : kind + ' &middot; ' + D.name} <small>vs ${swatch(b.houseId)}${b.house}</small></h3>
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
        <canvas class="portrait" width="72" height="84" data-mportrait="${g.id}"></canvas>
        <div style="flex:1"><div style="font-size:16px">${g.name}</div>
          <div class="dim" style="font-size:13px">${CLASSES[g.cls].name} of ${g.origin}</div>
          <div class="num dim" style="font-size:13px">health ${maxHp(g)} &middot; ${WEAPON_TIERS[g.weapon]} weapon</div></div>
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
  const line = i => `Day <b class="num">${i.day}</b> &middot; ${i.tier} &middot; <span class="num">${i.fame}</span> fame &middot; <span class="num">${i.denarii}</span> denarii &middot; ${i.roster} fighter${i.roster === 1 ? '' : 's'}${i.won ? ' &middot; <span class="gold">victor</span>' : ''}${i.over ? ' &middot; <span class="bad">fallen</span>' : ''}`;
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
  ui.sel = null; ui.picks = {}; ui.wagers = {}; ui.tpick = null; ui.overShown = false; ui.confirmSlot = null; ui.saveMsg = ''; ui.tab = 'ludus';
  render();
  if (G.pendingEvent) showEvent();
  checkEnd();
}
// A destructive button must be pressed twice; the first press only relabels it.
function confirmSlot(key) {
  if (ui.confirmSlot === key) { ui.confirmSlot = null; return true; }
  ui.confirmSlot = key; refreshSaves(); return false;
}

function viewChronicle() {
  const rows = G.log.slice().reverse().map(e => `<div class="${e.k}"><span class="d">Day ${e.d}</span>${e.t}</div>`).join('');
  const fallen = G.fallen.length ? `<h2 style="margin-top:20px">The fallen</h2><div class="panel">${G.fallen.map(f => `<div>${f.name}, ${CLASSES[f.cls].name} &mdash; ${f.wins} victories, died day ${f.day}</div>`).join('')}</div>` : '';
  return `<h2>Chronicle</h2><div class="panel log">${rows}</div>${fallen}
    <p style="margin-top:20px" class="row"><button data-act="tuton">Summon the steward (tutorial)</button><button data-act="askreset">Abandon this ludus and start anew</button></p>`;
}

function paintPortraits() {
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
  if (G.over && !ui.overShown) {
    ui.overShown = true;
    const why = G.over === 'debt'
      ? 'Ten days in debt. The creditors arrive with soldiers and take the ludus, the men, and the keys.'
      : 'Your cells are empty and your purse cannot fill them. The gates are chained shut.';
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
  paintSpeed();
  drawBattle($('#arenaCanvas').getContext('2d'), B);
  fight.raf = requestAnimationFrame(fightLoop);
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
    if (G.pendingEvent) showEvent();
    checkEnd();
  },
  forceend() { closeModal(); ACTIONS.endday(); },
  evopt(v) {
    const pe = G.pendingEvent; if (!pe) { closeModal(); return; }
    const E = EVENTS[pe.id];
    const res = E.opts[+v].run(pe.c);
    log(`${E.title}: ${res}`);
    G.pendingEvent = null; save();
    modalQueue[0] = `<h2>${E.title}</h2><p>${res}</p>${okBtn()}`;
    paintModal(); render();
  },
  gear(v, w) {
    const g = byId(v), cost = GEAR_COST[g[w] + 1];
    if (g[w] >= 3 || G.denarii < cost) return;
    G.denarii -= cost; g[w]++; save(); render();
  },
  sell(v) {
    const g = byId(v); if (!g) return;
    const p = Math.round(value(g) / 2);
    G.denarii += p; G.roster = G.roster.filter(x => x !== g);
    log(`${g.name} is sold for ${p} denarii.`);
    save(); render();
  },
  free(v) {
    const g = byId(v); if (!g || g.wins < 8) return;
    const gain = 40 + g.wins * 5;
    G.roster = G.roster.filter(x => x !== g);
    G.fame += gain;
    G.roster.forEach(x => { x.morale = clamp(x.morale + 20, 0, 100); });
    log(`${g.name} is given the wooden sword and walks free. The city talks of little else. +${gain} fame.`, 'gold');
    save(); render();
    showModal(`<h2>The wooden sword</h2><p><b>${g.name}</b> takes the rudis from your hand and walks out through the gate a free man. Every fighter in the yard watches him go, and trains harder for it.</p><p>Fame <b class="num">+${gain}</b>. Morale rises across the ludus.</p>${okBtn()}`);
  },
  buy(v) {
    const g = G.market.find(m => m.id === +v);
    if (!g || G.denarii < g.price || G.roster.length >= capacity()) return;
    G.denarii -= g.price; delete g.price;
    G.market = G.market.filter(m => m !== g); G.roster.push(g);
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
    do { endDay(); n++; } while (n < GAMES_EVERY && !isGamesDay() && !G.over && !G.pendingEvent);
    render();
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
  mute() { SFX.toggle(); paintSpeed(); },
  speed(v) { if (fight) { fight.speed = +v; paintSpeed(); } },
  skip() { finishFight(); },
  leavearena() { SFX.stop(); $('#arena').hidden = true; fight = null; closeModal(); render(); checkEnd(); },
  askreset() {
    showModal(`<h2>Abandon the ludus?</h2><p>Your current game will be lost.</p>
      <div class="row"><button data-act="close">Keep playing</button><button class="primary" data-act="reset">Start anew</button></div>`);
  },
  reset() {
    modalQueue.length = 0; paintModal();
    ui.sel = null; ui.picks = {}; ui.wagers = {}; ui.overShown = false; ui.tab = 'ludus';
    newGame(); render(); intro();
  },
};

const CHANGES = {
  activity(v, val) { const g = byId(v); if (g) { g.activity = val; save(); } },
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
    </ul><div class="row"><button class="primary" data-act="tutstart">Show me the ropes</button><button data-act="close">I know the trade</button></div>`);
}

// ---------- boot ----------

if (load()) {
  render();
  if (G.pendingEvent) showEvent();
  checkEnd();
} else {
  newGame(); render(); intro();
}
