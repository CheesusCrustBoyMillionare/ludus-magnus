// Ludus Magnus test suite. Run from the project folder:
//   node tools/test.js            everything (about two minutes; briefly opens the exe)
//   node tools/test.js --quick    rule checks only (a few seconds)
//   node tools/test.js --no-exe   everything except launching the exe
const fs = require('fs'), path = require('path'), vm = require('vm');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const args = new Set(process.argv.slice(2));
const quick = args.has('--quick'), noExe = quick || args.has('--no-exe');
const failures = [];
let passed = 0;

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function test(name, fn) {
  const t0 = Date.now();
  try {
    const note = fn();
    passed++;
    console.log(`  ok    ${name}${note ? '  [' + note + ']' : ''}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        ${String(e.message).split('\n')[0]}`);
  }
}
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

// A fresh copy of the game's rules (no interface), with an in-memory stand-in for browser storage.
function game() {
  const mem = {};
  const ctx = {
    console, Math, Date, assert, mem,
    localStorage: { getItem: k => (k in mem ? mem[k] : null), setItem(k, v) { mem[k] = String(v); }, removeItem(k) { delete mem[k]; } },
  };
  vm.createContext(ctx);
  vm.runInContext(['data', 'sim', 'jobs', 'wilds', 'combat', 'abilities'].map(f => read('js/' + f + '.js')).join('\n') + HELPERS, ctx);
  return fn => vm.runInContext('(' + fn.toString() + ')()', ctx);
}
// Helpers available inside the game context.
const HELPERS = `
function badNumber(o, p) {            // path of the first NaN or infinite number in a structure
  p = p || 'G';
  if (typeof o === 'number') return Number.isFinite(o) ? null : p;
  if (o && typeof o === 'object') for (const k in o) { const r = badNumber(o[k], p + '.' + k); if (r) return r; }
  return null;
}
function fight(mine, foes, opts) {    // runs a battle to the end of its verdicts
  const B = createBattle(mine, foes, Object.assign({ noIntro: true, mercy: [0, 0] }, opts || {}));
  let n = 0;
  while ((!B.over || B.outro <= B.outroEnd) && n++ < 40000) stepBattle(B, 1 / 30);
  assert(B.over, 'battle did not finish');
  return B;
}
function answerEvent(i) {             // resolves the pending event with option i (or the last one allowed)
  const pe = G.pendingEvent, E = EVENTS[pe.id];
  assert(typeof E.text(pe.c) === 'string', 'event text');
  E.opts.forEach(o => o.label(pe.c));
  let o = E.opts[i % E.opts.length];
  if (o.ok && !o.ok(pe.c)) o = E.opts[E.opts.length - 1];
  const out = o.run(pe.c);
  G.pendingEvent = null; nextEvent();
  return out;
}
`;

console.log('\nRules');

test('scripts parse', () => {
  for (const f of fs.readdirSync(path.join(root, 'js')).map(f => 'js/' + f).concat(fs.readdirSync(__dirname).map(f => 'tools/' + f))) {
    const r = spawnSync(process.execPath, ['--check', path.join(root, f)], { encoding: 'utf8' });
    assert(r.status === 0, f + ': ' + (r.stderr || '').split('\n').slice(0, 5).join(' '));
  }
});

test('no two scripts declare the same global name', () => {
  const seen = {};
  for (const f of fs.readdirSync(path.join(root, 'js'))) {
    for (const m of read('js/' + f).matchAll(/^(?:const|let|class|function) +([A-Za-z_$][\w$]*)/gm)) {
      assert(!seen[m[1]] || seen[m[1]] === f, `"${m[1]}" is declared in both ${seen[m[1]]} and ${f}; the page would fail to load`);
      seen[m[1]] = f;
    }
  }
});

test('every drawing and screen function that is called exists somewhere', () => {
  // these are only reached in the browser, so a missing one would not show in the rule tests: check by name
  const src = {}, declared = new Set();
  for (const f of fs.readdirSync(path.join(root, 'js'))) { src[f] = read('js/' + f); for (const m of src[f].matchAll(/(?:function|const|let) +([A-Za-z_$][\w$]*)/g)) declared.add(m[1]); }
  let n = 0;
  for (const f in src) for (const m of src[f].matchAll(/(?<![.\w$])((?:vil|village|prov|draw|render|view|wild|yard|show|paint|camp|ability)[A-Z]\w*)\(/g)) { n++; assert(declared.has(m[1]), `${f} calls ${m[1]}(), which is not defined in any script`); }
  assert(n > 150, 'expected to find the calls, found ' + n);
  return n + ' calls checked';
});

test('page is stamped: every script and stylesheet address carries its current fingerprint', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'stamp.js'), '--check'], { encoding: 'utf8' });
  assert(r.status === 0, (r.stderr || r.stdout).trim());
  const html = read('index.html');
  assert(/<meta name="build" content="[0-9a-f]{8}">/.test(html), 'index.html has no build mark');
  assert((html.match(/\?v=[0-9a-f]{8}"/g) || []).length >= 10, 'expected a fingerprint on the stylesheet and all nine scripts');
  return (r.stdout.match(/build \w+/) || [''])[0];
});

test('interface wiring: every button, field and tooltip has a handler', () => {
  const main = read('js/main.js'), html = read('index.html');
  const used = (re, src) => [...new Set([...src.matchAll(re)].map(m => m[1]))];
  const acts = used(/data-act=\\?"(\w+)\\?"/g, main + html), tipKeys = used(/tip\('(\w+)'\)/g, main);
  assert(acts.length > 30 && tipKeys.length > 20, 'expected to find the interface controls, found ' + acts.length + ' actions and ' + tipKeys.length + ' tooltips');
  for (const a of acts) assert(new RegExp('\\n  ' + a + '\\(').test(main), 'no action handler for "' + a + '"');
  for (const c of used(/data-chg=\\?"(\w+)\\?"/g, main)) assert(new RegExp('\\n  ' + c + '\\(').test(main), 'no change handler for "' + c + '"');
  const tips = main.slice(main.indexOf('const TIPS = {'), main.indexOf('const esc ='));
  for (const k of tipKeys) assert(new RegExp('\\n  ' + k + ':').test(tips), 'no tooltip text for "' + k + '"');
  for (const k of ['str', 'agi', 'skl', 'rating', 'style', 'charge', 'abilities'].concat(['weapon', 'head', 'chest', 'legs', 'arms', 'shoulders'])) assert(new RegExp('\\n  ' + k + ':').test(tips), 'no tooltip text for "' + k + '"');
  for (const s of ['data.js', 'sim.js', 'combat.js', 'show.js', 'sfx.js', 'yard.js', 'art.js', 'main.js']) assert(html.includes('js/' + s), 'index.html does not load ' + s);
  // the menu: Esc opens it, the fight screen has a button for it, and the exe closes when the page asks to
  assert(main.includes('  menu() {') && main.includes("e.key !== 'Escape'") && html.includes('data-act="menu"') && read('desktop/Program.cs').includes('WindowCloseRequested'), 'the menu is wired to Esc, to the fight screen and to the window');
  for (const act of ['menupage', 'menuset', 'menusave', 'menusaves', 'menuhelp', 'menuexit', 'fullscreen']) assert(main.includes('  ' + act + '('), 'the menu has no ' + act);
  // the quests window: a button in the province, a key, and a way to set out from it
  { const pv = read('js/province.js'); assert(pv.includes('function questsModal()') && pv.includes('data-act="quests"') && pv.includes('data-act="questgo"') && main.includes('  quests() {') && main.includes('  questgo(v) {') && main.includes("if (k === 'q') { e.preventDefault(); ACTIONS.quests(); }"), 'the quests window is not wired to its button, its key and its way out');
    for (const kind of ['Quest', 'Done', 'Asking', 'Bounty', 'Journey', 'Eagle']) assert(pv.includes("card('" + kind + "'"), 'the quests window leaves out: ' + kind); }
  // a canvas is never painted onto itself: the browser copies the whole of it first, and that was the stutter at the start and end of a fight
  for (const f of ['combat.js', 'show.js', 'yard.js', 'village.js', 'province.js']) assert(!read('js/' + f).includes('drawImage(cv,') && !read('js/' + f).includes('drawImage(ctx.canvas'), f + ' draws a canvas onto itself');
  return acts.length + ' actions, ' + tipKeys.length + ' tooltips';
});

test('new game starts in a sane state', () => game()(function () {
  for (let i = 0; i < 30; i++) {
    newGame();
    assert(G.roster.length === 2 && G.roster[0].name !== G.roster[1].name, 'two starters with different names');
    assert(G.houses.length === 5 && G.houses.every(h => h.roster.length >= 3), 'five rival houses with fighters');
    assert(G.market.length === 4 && G.hires.length === 4, 'market and hiring hall stocked');
    assert(G.festival.day === 15 && G.festival.type === 'hunt', 'first festival is a hunt on day 15');
    assert(G.denarii === 250 && G.day === 1 && !badNumber(G), 'starting numbers');
  }
}));

test('200 days of play keep the books straight', () => game()(function () {
  newGame();
  let events = 0, games = 0, sent = 0, quests = 0;
  for (let d = 0; d < 200; d++) {
    G.denarii = Math.max(G.denarii, 2000);
    G.roster.forEach(g => { g.activity = pick(['str', 'agi', 'skl', 'rest', 'spar']); });
    while (G.roster.length < 4 && G.market.length) { const m = G.market.pop(); delete m.price; G.roster.push(m); }
    const day = G.day;
    endDay();
    assert(G.day === day + 1, 'day advanced');
    assert(!G.over, 'game ended unexpectedly on day ' + G.day);
    while (G.pendingEvent) { events++; answerEvent(d + events); }
    G.reports.length = 0;
    // keep men moving in and out: contracts when there is somebody to send, and every journey that is waiting
    const free = G.roster.filter(canSend);
    const c = G.contracts.find(x => x.size <= free.length - 1);
    if (c && d % 3 === 0) { assert(sendContract(c.id, free.slice(0, c.size).map(g => g.id)), 'contract should start'); sent++; }
    for (const g of G.roster) if (g.quest) quests++;
    for (const g of G.roster) assert(!g.away || jobById(g.away), g.name + ' is away on a job that does not exist');
    for (const J of G.jobs) assert(J.end > G.day && jobMen(J).length, 'a job outlived its men or its days');
    assert(!!G.bouts === isGamesDay(), 'bouts exist exactly on games days (day ' + G.day + ')');
    if (G.bouts) { games++; assert(G.bouts.every(b => boutEnemies(b).length === b.size || b.hunt), 'every bout has its opponents'); }
    for (const g of G.roster) assert(g.hp >= 1 && g.hp <= maxHp(g) && g.fatigue >= 0 && g.fatigue <= 100 && g.morale >= 0 && g.morale <= 100, g.name + ' out of range');
    const bad = badNumber(G); assert(!bad, 'bad number at ' + bad + ' on day ' + G.day);
  }
  assert(games === 40 && events > 10, 'expected 40 games days and some events, got ' + games + ' and ' + events);
  assert(sent > 15, 'expected contracts to run, got ' + sent);
  assert(G.houses.every(h => h.roster.length >= 3 && h.roster.length <= 9), 'rival rosters stay stocked');
}));

test('rival houses: dealings, challenges, and the houses fighting each other', () => game()(function () {
  newGame(); G.denarii = 5000; G.fac.barracks = 1;
  const H = G.houses[0];
  // a gift needs a quarrel, and mends one
  assert(dealBlock(H, 'gift') && !houseDeal(H, 'gift').ok, 'no gift without a quarrel');
  H.grudge = 50; const d0 = G.denarii;
  assert(houseDeal(H, 'gift').ok && H.grudge === 30 && G.denarii < d0, 'a gift costs money and eases the feud');
  assert(dealBlock(H, 'challenge'), 'one dealing with a house between games');
  // calling a house out puts its champion on the next card
  const H2 = G.houses[1];
  assert(houseDeal(H2, 'challenge').ok && H2.called, 'a house is called out');
  G.day = GAMES_EVERY; genBouts();
  const b = G.bouts.find(x => x.called);
  assert(b && b.houseId === H2.id && b.size === 1 && !H2.called, 'the challenge is on the card');
  assert(G.rivalNews && G.rivalNews.length === 2 && G.houses.filter(X => X.form && X.form.length).length === 4, 'the houses fought each other, and it is told');
  assert(G.houses.every(X => typeof X.was === 'number'), 'and where each stood before is kept, to show who is rising');
  const G0 = G;                                // what follows is tried in games of its own, and this one is taken up again after
  // training against a house you have no quarrel with
  { newGame(); G.denarii = 1000; const X = G.houses[1], st = sparStat(X), g = G.roster[0], p0 = g.prog[st] + g.stats[st] * 1000, f0 = g.fatigue, d1 = G.denarii;
    X.grudge = SPAR_FEUD; assert(/bad blood/.test(dealBlock(X, 'spar')) && !houseDeal(X, 'spar').ok, 'not with a house you are at odds with');
    X.grudge = 10; const r = houseDeal(X, 'spar');
    assert(r.ok && !/undefined|NaN/.test(r.text) && G.denarii === d1 - dealCost('spar') && dealCost('spar') > 0 && g.prog[st] + g.stats[st] * 1000 > p0 && g.fatigue === Math.min(100, f0 + 15) && X.grudge === 10 && dealBlock(X, 'gift'), 'a day in their yard: better at what they do best, tired, and it is the one dealing for these games');
    assert(Object.keys(SPAR_STAT).length === 5 && HOUSES.every(hh => STATS.includes(SPAR_STAT[hh.trait])), 'every house teaches something'); }
  // the houses have fortunes of their own
  { newGame(); G.day = 10; const seen = {}; let n = 0;
    for (let i = 0; i < 400; i++) { G.houses.forEach(X => { X.prestige = 200; }); const before = G.houses.map(X => X.prestige), m = houseMove(); if (!m) continue; n++;
      assert(houseOf(m.h) && m.text.length > 30 && !/undefined|NaN/.test(m.text) && m.d === G.day && G.houses.some((X, k) => X.prestige !== before[k]) && G.houses.every(X => X.prestige >= 0 && X.roster.length <= 6), 'a move that is told, and changes something: ' + m.text);
      seen[/bought/.test(m.text) ? 'star' : /blows/.test(m.text) ? 'quarrel' : /dinner/.test(m.text) ? 'dinner' : 'fever'] = 1; G.houses.forEach(X => { if (X.roster.length > 4) X.roster.pop(); }); }
    assert(n > 110 && n < 210 && Object.keys(seen).length === 4 && G.rivalMoves.length === 6, 'about two games in five, four kinds of news, and the last six kept: ' + n); }
  G = G0;
  // buying a man: not the champion, and he comes over whole
  const H3 = G.houses[2], champ = houseChampion(H3), man = H3.roster.find(g => g !== champ && !G.bouts.some(x => x.enemyIds && x.enemyIds.includes(g.id)));
  assert(dealBlock(H3, 'buy', champ), 'a champion is not for sale');
  if (man) {
    const n = G.roster.length, r = houseDeal(H3, 'buy', man.id);
    assert(r.ok && G.roster.length === n + 1 && G.roster.includes(man) && !H3.roster.includes(man) && man.gear && !man.house, 'a rival\'s man is bought and becomes yours');
    assert(!badNumber(G), 'buying a man left a bad number');
  }
  // sabotage either works or is found out
  const H4 = G.houses[3], p0 = H4.prestige, g0 = H4.grudge, r4 = houseDeal(H4, 'sabotage');
  assert(H4.dealt === dealCycle() && (r4.ok ? H4.prestige < p0 : H4.grudge > g0), 'sabotage tells one way or the other');
  // a challenge left unanswered is paid for
  const f0 = G.fame = 50; endDay();
  assert(G.fame < f0 + 1, 'ducking your own challenge costs fame');
}));

test('patrons: petitions spend favour, requests are asked and settled', () => game()(function () {
  newGame(); G.denarii = 1000; G.day = 2;
  // a stranger is not listened to
  G.patrons.guild = 10;
  assert(!petition('guild', 'advance').ok, 'a patron who does not know you grants nothing');
  // an advance: money now, favour spent, and only one petition between games
  G.patrons.guild = 50; const d0 = G.denarii;
  assert(petition('guild', 'advance').ok && G.denarii > d0 && G.patrons.guild === 42, 'an advance pays and costs favour');
  assert(!petition('guild', 'grain').ok, 'one petition to a patron between games');
  // grain at cost: the men eat for nothing until the next games
  G.petitioned = {}; assert(foodCost() > 0 && petition('guild', 'grain').ok && foodCost() === 0, 'grain at the Guild\'s cost');
  // a richer card
  G.patrons.magistrate = 60; assert(petition('magistrate', 'card').ok, 'a richer card is granted');
  G.day = GAMES_EVERY; G.request = null; genBouts(); const rich = G.bouts.reduce((n, b) => n + b.purse, 0);
  G.richCard = 0; genBouts(); const plain = G.bouts.reduce((n, b) => n + b.purse, 0);
  assert(rich > plain * 1.2, 'purses are larger on a richer card: ' + rich + ' against ' + plain);
  assert(foodCost() > 0, 'the grain runs out at the games');
  // the temple heals
  G.patrons.temple = 60; G.roster[0].injury = 4; G.roster[0].hp = 5;
  assert(petition('temple', 'heal').ok && G.roster[0].injury === 2 && G.roster[0].hp === maxHp(G.roster[0]), 'the priests mend wounds');
  // a third thing to ask of each, of a house they trust
  { G.petitioned = {}; G.honoured = { magistrate: 1, guild: 1, temple: 1 }; G.patrons.magistrate = 59; assert(!petition('magistrate', 'levy').ok, 'not before sixty');
    G.patrons.magistrate = 70; const n = G.market.length, r = petition('magistrate', 'levy'), m = G.market[0];
    assert(r.ok && !/undefined|NaN/.test(r.text) && G.market.length === n + 1 && m.levy && m.bg === 'captive' && m.price >= 5 && m.price % 5 === 0 && m.price < value(m) && G.patrons.magistrate === 55, 'the pick of the prisoners, at half his price: ' + m.price + ' for a man worth ' + value(m));
    G.petitioned = {}; G.patrons.magistrate = 70; assert(/still/.test(petitionBlock('magistrate', PETITIONS.magistrate.find(p => p.id === 'levy'))), 'one such man at a time');
    genMarket(); assert(!G.market.some(x => x.levy), 'and he goes with the rest at the next market');
    G.patrons.guild = 70; G.petitioned = {}; assert(petition('guild', 'book').ok && G.bookUntil >= G.day && G.patrons.guild === 56, 'the Guild’s book is opened');
    G.patrons.temple = 70; G.petitioned = {}; const best = G.roster.slice().sort((x, y) => statSum(y) - statSum(x))[0]; G.roster.forEach(x => { x.traits = x.traits.filter(q => q !== 'blessed'); });
    assert(oracleMan() === best && petition('temple', 'oracle').ok && best.traits.includes('blessed') && G.patrons.temple === 52, 'the oracle names the best man');
    G.roster.forEach(x => { if (!x.traits.includes('blessed')) x.traits.push('blessed'); }); G.petitioned = {}; G.patrons.temple = 70;
    assert(!petition('temple', 'oracle').ok && G.patrons.temple === 70, 'and has nobody left to name');
    assert(Object.keys(PETITIONS).every(k => PETITIONS[k].length === 3 && PETITIONS[k][2].need === 60), 'three petitions to each patron'); G.honoured = undefined; }
  // honours: the first time a patron reaches sixty, once
  { newGame(); G.denarii = 1000; const arm = G.armoury.length;
    G.patrons.magistrate = 55; favor('magistrate', 4); assert(!G.honoured || !G.honoured.magistrate, 'not at fifty-nine');
    favor('magistrate', 1); const it = G.armoury[G.armoury.length - 1];
    assert(G.honoured.magistrate === G.day && G.armoury.length === arm + 1 && it.slot === 'weapon' && it.mw && it.r >= 2 && G.roster.some(g => g.cls === it.cls), 'the Magistrate sends a blade one of your men can use');
    favor('magistrate', -30); favor('magistrate', 40); assert(G.armoury.length === arm + 1, 'once only');
    const d = G.denarii; G.patrons.guild = 59; favor('guild', 5); assert(G.denarii === d + 100 * (1 + tier()) && G.honoured.guild, 'the Guild sends a purse');
    G.roster[0].injury = 5; G.roster[0].hp = 3; G.roster[0].morale = 20; G.patrons.temple = 58; favor('temple', 9);
    assert(G.roster[0].injury === 3 && G.roster[0].hp === maxHp(G.roster[0]) && G.roster[0].morale === 100 && G.honoured.temple, 'the Temple lays hands on every man');
    G.patrons.guild = 20; const d2 = G.denarii; favor('guild', -5); G.patrons.guild = 80; favor('guild', -5); assert(G.denarii === d2, 'favour lost is never an honour'); }
  // the Guild may ask you to back your own man
  { newGame(); let stake = 0, show = 0; for (let i = 0; i < 400; i++) { G.request = null; genRequest(); if (G.request && G.request.patron === 'guild') { if (G.request.type === 'stake') { stake++; assert(G.request.need >= 20 && G.request.need % 5 === 0 && /denarii or more/.test(requestText(G.request)), 'a stake is named'); } else show++; } }
    assert(stake > 15 && show > 15, 'sometimes a show, sometimes a stake: ' + show + ' and ' + stake); }
  // a request: a tithe paid is favour gained; one left undone is favour lost
  G.request = { patron: 'temple', type: 'tithe', cost: 30, day: G.day, favor: 9, pay: 0 }; let f0 = G.patrons.temple;
  assert(payTithe() && G.request.done && G.patrons.temple === f0 + 9, 'an offering made');
  G.request = { patron: 'guild', type: 'show', day: 1, favor: 8, pay: 40 }; f0 = G.patrons.guild;      // asked at an earlier games, and never done
  genRequest();
  assert(G.patrons.guild === f0 - 4, 'a request left undone costs favour');
  assert(!badNumber(G), 'patrons left a bad number');
}));

test('household: new buildings, new posts and the regimen each do what they say', () => game()(function () {
  newGame();
  assert(Object.keys(FACILITIES).length === 7 && Object.keys(FACILITIES).every(k => G.fac[k] === 0 || k === 'barracks' || k === 'ground') && Object.keys(STAFF_ROLES).length === 7, 'seven buildings and seven posts');
  const g = G.roster[0];
  // the granary and the dispensator make the house cheaper to run
  const f0 = foodCost(); G.fac.stores = 2; assert(foodCost() < f0 && foodCost() === Math.round(f0 * 0.8), 'the granary cuts the cost of food');
  G.staff.cook = { name: 'X', skill: 2, wage: 5 }; const u0 = upkeep(); G.staff.dispensator = { name: 'Y', skill: 3, wage: 0 };
  assert(thrift() > 0 && upkeep() === u0 - thrift(), 'the dispensator saves on food and wages');
  // the shrine: spirits and mercy
  const m0 = moraleBase(1), c0 = mercyBonus(); G.fac.shrine = 3; assert(moraleBase(1) === m0 + 9 && Math.abs(mercyBonus() - c0 - 0.06) < 1e-9, 'the shrine lifts morale and mercy');
  // the regimen: learning, weariness and spirits
  g.fatigue = 0; g.morale = 60; const r1 = trainRate(g), t1 = trainTire(g, false), b1 = moraleBase(1);
  G.regimen = 2; assert(trainRate(g) > r1 * 1.15 && trainTire(g, false) > t1 * 1.25 && moraleBase(1) === b1 - 5, 'a hard regimen teaches faster, tires more and sours the men');
  G.regimen = 0; assert(trainRate(g) < r1 && trainTire(g, false) < t1 && moraleBase(1) === b1 + 3, 'a light one the reverse');
  G.regimen = 1;
  // the unctor: rest and drill
  g.traits = g.traits.filter(t => t !== 'mender');      // a perk that changes rest would cloud it
  const rest0 = restGain(g)[1]; G.staff.unctor = { name: 'U', skill: 2, wage: 5 };
  assert(restGain(g)[1] === rest0 + 10 && Math.abs(trainTire(g, false) - t1 * 0.88) < 1e-9, 'the unctor eases rest and drill');
  // the armourer: only worn kit, and only your own men's
  g.gear.weapon = makeItem('weapon', 2, g.cls); g.gear.chest = makeItem('chest', 2); const s0 = gearStats(g);
  G.staff.faber = { name: 'F', skill: 2, wage: 5 }; const s1 = gearStats(g), foe = G.houses[0].roster[0], e0 = gearStats(foe).dmg;
  assert(Math.abs(s1.dmg - s0.dmg - 0.6) < 1e-9 && Math.abs(s1.armor - s0.armor - 0.5) < 1e-9 && gearStats(foe).dmg === e0, 'the armourer betters your kit and nobody else\'s');
  // stables: a longer day's march
  G.fac.stables = 0; const d0 = marchDay(); G.fac.stables = 2; assert(Math.abs(marchDay() - d0 * 1.24) < 1e-9, 'mules lengthen the march');
  // four faces in the hall; an old save gains the new buildings
  genHires(); assert(G.hires.length === 4, 'four in the hiring hall');
  // a man who has served can be raised: cheaper than hiring his better, but it takes time
  { const purse0 = G.denarii, day0 = G.day; G.denarii = 5000; G.staff = { medicus: { name: 'M', skill: 1, wage: 3, since: G.day } };
    assert(raiseDays(G.staff.medicus) === 15 && raiseCost(G.staff.medicus) === 100 && raiseCost(G.staff.medicus) < 40 * 2 * 2 && /served 0 of the 15/.test(raiseBlock('medicus')) && !raiseStaff('medicus'), 'not on the day he is hired');
    G.day += 15; const d = G.denarii, w0 = wages(), m0 = mercyBonus();
    assert(!raiseBlock('medicus') && raiseStaff('medicus') && G.staff.medicus.skill === 2 && G.staff.medicus.wage === 5 && G.denarii === d - 100 && wages() === w0 + 2 && mercyBonus() > m0, 'after fifteen days: a seasoned man, at the wage of one');
    assert(raiseDays(G.staff.medicus) === 30 && servedDays(G.staff.medicus) === 0 && !raiseStaff('medicus'), 'and the count begins again, longer');
    G.day += 30; assert(raiseStaff('medicus') && G.staff.medicus.skill === 3 && /master/.test(raiseBlock('medicus')) && !raiseStaff('medicus'), 'then a master, and no further');
    G.staff.cook = { name: 'C', skill: 1, wage: 0 }; assert(servedDays(G.staff.cook) >= 44 && raiseStaff('cook') && G.staff.cook.wage === 0, 'one who serves for nothing goes on doing so; and a man from an older save has his days counted from the first');
    G.denarii = 0; G.staff.scout = { name: 'S', skill: 1, wage: 3, since: 1 }; assert(/short/.test(raiseBlock('scout')) && /vacant/.test(raiseBlock('unctor')), 'not without the money, and not an empty post');
    G.denarii = purse0; G.day = day0; G.staff = {}; }
  // word sent for a man of one trade: he is in the hall at the next games, and as good as the town has
  { const d = G.denarii = 500; assert(seekCost() >= 15 && seekStaff('medicus') && G.hireOrder === 'medicus' && G.denarii === d - seekCost() && /already/.test(seekBlock('cook')) && !seekStaff('cook'), 'one errand at a time');
    genHires(); const h = G.hires.find(x => x.role === 'medicus');
    assert(G.hires.length === 4 && h && h.sought && h.skill === clamp(1 + tier(), 1, 3) && !G.hireOrder && new Set(G.hires.map(x => x.role)).size === 4, 'he comes, and no trade twice');
    genHires(); assert(!G.hires.some(x => x.sought), 'the next hall is as chance sends it'); }
  // the steward names what the house most lacks
  { G.staff = {}; assert(staffLack()[0] === 'doctore' && STAFF_NEED.length === Object.keys(STAFF_ROLES).length && STAFF_NEED.every(([k, why]) => STAFF_ROLES[k] && why.length > 20), 'first a doctore');
    G.staff.doctore = { name: 'd', skill: 1, wage: 3 }; assert(staffLack()[0] === 'medicus', 'then a medicus');
    for (const k in STAFF_ROLES) G.staff[k] = { name: 'x', skill: 1, wage: 3 }; assert(staffLack() === null, 'and nothing, when every post is filled'); G.staff = {}; }
  delete G.fac.shrine; delete G.regimen; migrate(); assert(G.fac.shrine === 0 && G.regimen === 1, 'an older save is brought up to date');
  endDay(); assert(G.purseLog && G.purseLog.length === 1 && !badNumber(G), 'the purse is written down each day');
}));

test('the market: backgrounds, haggling, holding, sending for a man, and the auction', () => game()(function () {
  newGame(); G.denarii = 5000; G.fac.barracks = 3;
  // every man on the block has a background that left him sane
  const seen = {};
  for (let i = 0; i < 60; i++) { genMarket(); for (const m of G.market) { seen[m.bg] = 1; assert(BACKGROUNDS[m.bg] && m.price >= 5 && m.price % 5 === 0 && STATS.every(k => m.stats[k] >= 2 && m.stats[k] <= 20 && m.pot[k] >= 0.7 - 1e-9 && m.pot[k] <= 1.4 + 1e-9) && m.perkPending === 0, 'a sound man with a background: ' + m.bg); } }
  assert(Object.keys(BACKGROUNDS).every(k => seen[k]), 'every background turns up');
  assert(Object.keys(BACKGROUNDS).length === 12 && ['hunter', 'pitman', 'pirate', 'deserter', 'gentleman'].every(k => BACKGROUNDS[k].desc.length > 40), 'twelve kinds of man come to the block');
  { const mk = bg => { const g = makeGladiator(26); g.bg = bg; BACKGROUNDS[bg].make(g); return g; };
    assert(mk('hunter').traits.includes('beastslayer') && mk('pitman').traits.includes('pitfighter') && mk('pitman').wins >= 1 && mk('pirate').traits.includes('travelled') && mk('gentleman').traits.includes('showy'), 'each brings what his life taught him');
    const d = mk('deserter'); assert(d.traits.includes('embittered') && flightRisk(d) && BACKGROUNDS.deserter.price < 1, 'a deserter is cheap, and may run again'); }
  // the dealer comes to know a good customer
  { newGame(); G.denarii = 5000; assert(dealer() === 0 && dealerWord(0) === 'A stranger' && dealerNext(0) === 3, 'a stranger at first');
    const h0 = haggleChance(), g = G.roster[0], half = sellPrice(g); assert(half === Math.round(value(g) * 0.5), 'he pays half');
    dealerMove(3); assert(dealerWord(dealer()) === 'Known to him' && Math.abs(haggleChance() - h0 - 0.1) < 1e-9, 'known: he hears you out');
    genMarket(); assert(G.market.length === 4, 'four men still');
    dealerMove(5); genMarket(); assert(dealerWord(dealer()) === 'A good customer' && G.market.length === 5, 'a good customer is brought one more');
    dealerMove(7); assert(dealerWord(dealer()) === 'An old friend' && dealerNext(dealer()) === 0 && sellPrice(g) === Math.round(value(g) * 0.6) && sellPrice(g) > half, 'an old friend is paid six parts in ten');
    dealerMove(-99); assert(dealer() === 0, 'and it does not go below nothing'); }
  // a man can be tried before he is bought: once, for a fee, and it shows how he learns
  { newGame(); G.denarii = 500; genMarket(); const m = G.market[0], d0 = G.denarii, r = tryMan(m);
    assert(r && r.text.length > 40 && !/undefined|NaN/.test(r.text) && m.tried && G.denarii === d0 - tryCost() && tryCost() >= 5, 'tried for a fee: ' + (r && r.text));
    assert(!tryMan(m) && G.denarii === d0 - tryCost(), 'once is enough');
    G.denarii = 0; assert(!tryMan(G.market[1]) && !G.market[1].tried, 'and not on credit');
    const quick = makeGladiator(26); STATS.forEach(k => { quick.pot[k] = 1.4; }); const slow = makeGladiator(26); STATS.forEach(k => { slow.pot[k] = 0.7; }); G.denarii = 500;
    assert(tryMan(quick).ok && /buy him/.test(tryMan(Object.assign(makeGladiator(26), { pot: quick.pot })).text) && !tryMan(slow).ok, 'the doctore can tell a quick learner from a slow one'); }
  newGame(); G.denarii = 5000; G.fac.barracks = 3;
  // haggling: once, and it moves the price one way or the other
  genMarket(); let m = G.market[0], p0 = m.price, r = haggle(m);
  assert(r && m.haggled && m.price !== p0 && (r.ok ? m.price < p0 : m.price > p0) && haggle(m) === null, 'one try at the price');
  // holding: a deposit off the price, and he is still there after the next market
  m = G.market[1]; const d0 = G.denarii, c = holdCost(m), p1 = m.price;
  assert(holdMan(m) && G.denarii === d0 - c && m.price === p1 - c && m.held, 'a deposit holds him');
  G.auction = null; genMarket();
  assert(G.market.includes(m) && m.kept && !m.held && G.market.length === 5 && !holdMan(m), 'he is kept through one market, and no longer');
  genMarket(); assert(!G.market.includes(m), 'then he is gone');
  // sending for a man of a kind
  assert(orderMan('retiarius') && G.marketOrder === 'retiarius' && !orderMan('thraex'), 'the dealer is sent for a net-man');
  genMarket(); assert(G.market[0].cls === 'retiarius' && G.market[0].ordered && !G.marketOrder, 'and brings one');
  // the auction: a high bid wins him, a low one sends him to a rival
  G.day = 6; let won = 0, lost = 0;
  for (let i = 0; i < 80 && !(won && lost); i++) {
    do { genMarket(); } while (!G.auction);
    const A = G.auction, H = houseOf(A.h), n = G.roster.length, hn = H.roster.length, top = auctionBids(A)[2];
    if (!won) { assert(top >= A.cap, 'the highest bid always wins'); const x = auctionBid(top); assert(x.ok && G.roster.length === n + 1 && G.roster.includes(A.g) && A.done && auctionBid(top) === null, 'won at auction'); won = 1; G.roster.pop(); }
    else if (A.cap > auctionBids(A)[0]) { const x = auctionBid(auctionBids(A)[0]); assert(!x.ok && G.roster.length === n && H.roster.length === hn + 1 && A.g.house === H.id, 'outbid: he goes to the rival'); lost = 1; }
  }
  assert(won && lost && !badNumber(G), 'both ends of an auction were seen');
}));

test('the arena: the championship, novices, wagers, stakes, runs and a clean sweep', () => game()(function () {
  const won = (mine, foes) => { const B = fight(mine, foes); B.winner = 0; B.fighters.forEach(f => { if (f.team === 0) { f.fate = null; f.hp = f.maxHp; } }); return B; };
  const lost = (mine, foes) => { const B = fight(mine, foes); B.winner = 1; return B; };
  newGame(); while (G.roster.length < 5) G.roster.push(makeGladiator(25)); G.day = 5; genBouts();
  assert(!G.title && !G.bouts.some(b => b.title || b.novice), 'the village pits crown no one');
  // from the second arena there is a champion, and a bout for novices
  G.fame = TIERS[1].fame; G.day = 10; genBouts();
  for (let tries = 0; tries < 20 && !G.bouts.find(b => !b.death && !b.title && !b.novice && b.houseId); tries++) genBouts();      // about one card in 170 has no ordinary bout on it: draw another
  const tb = G.bouts.find(b => b.title), nb = G.bouts.find(b => b.novice);
  assert(tb && G.title && G.title.house !== null && titleHolder() === boutEnemies(tb)[0] && !tb.defence, 'a rival holds the title and can be challenged');
  assert(nb && boutEnemies(nb).length === 1, "a novices' bout is on the card");
  const g = G.roster[0], vet = G.roster[1]; vet.rank = 3; g.rank = 0;
  assert(boutFit(nb, g) && !boutFit(nb, vet) && boutFit(tb, vet), 'only novices may enter it');
  // raising the stakes
  const plain = G.bouts.find(b => !b.death && !b.title && !b.novice && b.houseId), p0 = plain.purse, f0 = plain.fame;
  assert(stakesBlock(nb) && raiseStakes(plain.id) && plain.death && plain.purse > p0 && plain.fame > f0 && !raiseStakes(plain.id), 'a bout is made to the death, once');
  // winning the title
  let r = applyBoutResult(tb, won([g], boutEnemies(tb)), 0, 1);
  assert(r.win && G.title.house === null && G.title.gid === g.id && titleYours() && titleHolder() === g && G.streak === 1, 'your man takes the title');
  // the next games: a challenger comes, and only the champion may answer
  G.day = 15; g.foughtDay = 0; g.injury = 0; g.hp = maxHp(g); genBouts();
  const db = G.bouts.find(b => b.defence);
  assert(db && db.only === g.id && boutFit(db, g) && !boutFit(db, vet), 'a title defence, for the holder alone');
  r = applyBoutResult(db, won([g], boutEnemies(db)), 0, 1);
  assert(G.title.defences === 1 && titleYours() && G.streak === 2 && G.bestStreak === 2, 'a defence made, and a run building');
  // losing it
  G.day = 20; g.foughtDay = 0; g.injury = 0; g.hp = maxHp(g); genBouts();
  const db2 = G.bouts.find(b => b.defence), ch = boutEnemies(db2)[0];
  r = applyBoutResult(db2, lost([g], [ch]), 0, 1);
  assert(!r.win && G.streak === 0 && (!G.title || (G.title.house === db2.houseId && G.title.gid === ch.id)), 'the title goes to the man who took it');
  // a title left undefended is forfeit at the end of the day
  G.title = { house: null, gid: vet.id, name: vet.name, defences: 0 }; G.day = 25; genBouts();
  const db3 = G.bouts.find(b => b.defence), fame0 = G.fame; G.bouts.forEach(b => { if (b !== db3) b.done = true; });
  endDay();
  assert(G.title && G.title.house === db3.houseId && G.fame === fame0 - 5, 'a champion who does not appear loses it');
  // a holder who is gone leaves it empty, and it is filled
  G.title = { house: null, gid: 999999, name: 'Nobody', defences: 0 }; G.day = 30; genBouts();
  assert(G.title.house !== null && titleHolder(), 'an empty title is given to the best of the houses');
  // wagers: three kinds
  const B1 = won([G.roster[2]], [boutEnemies(G.bouts[0])[0]]); B1.time = 90;
  assert(wagerWon('win', B1, true) && wagerWon('clean', B1, true) && !wagerWon('swift', B1, true) && !wagerWon('win', B1, false), 'what each wager needs');
  B1.time = 10; assert(wagerWon('swift', B1, true), 'a quick win');
  const me = B1.fighters.find(f => f.team === 0); me.hp = me.maxHp * 0.2; assert(!wagerWon('clean', B1, true), 'a man badly hurt loses the clean wager');
  me.hp = me.maxHp; me.fate = 'spared'; assert(!wagerWon('clean', B1, true), 'and so does a man down');
  const wb = G.bouts.find(b => !b.done && !b.title), B2 = won([G.roster[2]], [boutEnemies(wb)[0]]); B2.time = 10;
  r = applyBoutResult(wb, B2, 100, 2, 'swift');
  assert(r.wagerGain === Math.round(100 * 2 * 1.8) && r.kind === 'swift', 'a swift wager pays 1.8 times the odds');
  const wb2 = G.bouts.find(b => !b.done && !b.title), B3 = won([G.roster[3]], [boutEnemies(wb2)[0]]); B3.time = 100;
  r = applyBoutResult(wb2, B3, 100, 2, 'swift');
  assert(r.win && r.wagerGain === 0, 'and nothing if the win was slow');
  // every bout on the card won: the day is yours
  G.day = 35; G.dayRec = null; genBouts(); G.bouts = G.bouts.filter(b => !b.title).slice(0, 3);
  let last;
  G.bouts.forEach((b, i) => { const m = G.roster[i % G.roster.length]; last = applyBoutResult(b, won([m], [boutEnemies(b)[0]]), 0, 1); if (i < 2) assert(!last.sweep, 'not before the last bout'); });
  assert(last.sweep > 0 && last.purse === G.bouts[2].purse + last.sweep, 'a clean sweep pays a bonus');
  assert(arenaRanks(8).length === 8 && arenaRanks(8)[0].g, 'the province is ranked');
  assert(!badNumber(G), 'the arena left a bad number');
}));

test('the smith: reforging, fittings, commissions, a full harness, and clearing the racks', () => game()(function () {
  newGame(); G.denarii = 20000; const g = G.roster[0];
  // reforging: one grade, only as far as the forge can go, once between games
  const blade = makeItem('weapon', 1, g.cls); G.armoury.push(blade);
  assert(forgeMax() === 2 && reforgeCost(blade) > 0 && reforgeCost(blade) < itemPrice(makeItem('weapon', 2, g.cls)), 'reforging is cheaper than buying new');
  const d0 = G.denarii, c0 = reforgeCost(blade);
  assert(reforge(blade.id) && blade.r === 2 && G.denarii === d0 - c0 && !reforge(blade.id), 'a piece goes up a grade, once between games');
  G.smith.reforged = -1; assert(reforgeBlock(blade) && !reforge(blade.id), 'a village forge cannot better grade D');
  G.smith.level = 4; assert(reforge(blade.id) && blade.r === 3, 'a better forge can');
  // worn pieces can be worked on too
  const helm = makeItem('head', 2); g.gear.head = helm; G.smith.reforged = -1;
  assert(findItem(helm.id).g === g && reforge(helm.id) && helm.r === 3, 'a worn piece is reforged where it sits');
  // fittings: one to a piece, the right kind, and they change what it does and is called
  const w0 = itemStats(blade).dmg;
  assert(!fitItem(blade.id, 'padded') && fitItem(blade.id, 'weighted') && Math.abs(itemStats(blade).dmg - w0 - 0.8) < 1e-9 && /weighted/.test(itemName(blade)) && /Weighted/.test(itemEffect(blade)), 'a weighted blade');
  assert(!fitItem(blade.id, 'balanced'), 'one fitting to a piece');
  const a0 = itemStats(helm).armor; assert(fitItem(helm.id, 'studded') && itemStats(helm).armor > a0 * 1.16 && /Studded/.test(itemEffect(helm)), 'a studded helm');
  G.smith.level = 0; const cu = makeItem('chest', 1); G.armoury.push(cu); assert(!fitItem(cu.id, 'padded'), 'a village smith does no fittings'); G.smith.level = 4;
  // a commission is paid for now and delivered with the next stock
  const d1 = G.denarii, n = G.armoury.length;
  assert(orderItem('legs') && G.denarii === d1 - orderItemCost('legs') && !orderItem('arms') && G.smith.order, 'one commission at a time');
  genSmith(); assert(G.armoury.length === n + 1 && G.armoury[G.armoury.length - 1].slot === 'legs' && G.armoury[G.armoury.length - 1].r === 6 && !G.smith.order, 'and it comes with the next games');
  // a full harness protects better than its pieces, and a matched one better still
  const h = G.roster[1]; ARMOR_SLOTS.forEach((k, i) => { h.gear[k] = makeItem(k, i === 0 ? 3 : 2); });
  const sum = ARMOR_SLOTS.reduce((t, k) => t + itemStats(h.gear[k]).armor, 0);
  assert(Math.abs(gearStats(h).armor - sum * 1.08) < 1e-9 && gearStats(h).full === 1, 'a full harness');
  h.gear.head = makeItem('head', 2); const sum2 = ARMOR_SLOTS.reduce((t, k) => t + itemStats(h.gear[k]).armor, 0);
  assert(Math.abs(gearStats(h).armor - sum2 * 1.14) < 1e-9 && gearStats(h).full === 2, 'a matched harness');
  // clearing the racks sells only what is outclassed
  G.armoury = [makeItem('arms', 5), makeItem('arms', 0), makeItem('arms', 0)]; G.roster.forEach(x => { x.gear.arms = makeItem('arms', 6); });
  const out = outclassed(), d2 = G.denarii, r = sellOutclassed();
  assert(out.length === 2 && r.n === 2 && G.armoury.length === 1 && G.armoury[0].r === 5 && G.denarii === d2 + r.sum, 'the best spare of a kind is kept');
  // a master armourer reforges two between games; a lesser smith, one
  { newGame(); G.denarii = 50000; G.smith.level = 2; const a1 = makeItem('arms', 1), a2 = makeItem('arms', 1), a3 = makeItem('arms', 1); G.armoury.push(a1, a2, a3);
    assert(reforgeLimit() === 1 && reforgesDone() === 0 && reforge(a1.id) && reforgesDone() === 1 && !reforge(a2.id), 'an armourer: one');
    G.smith.level = 3; assert(reforgeLimit() === 2 && reforge(a2.id) && reforgesDone() === 2 && !reforge(a3.id) && /two pieces/.test(reforgeBlock(a3)), 'a master armourer: two, and no more');
    G.smith.reforged = dealCycle(); delete G.smith.reforgeN; assert(reforgesDone() === 1, 'a save from before counts the one it knew of'); }
  // master-wrought: better than its grade, dearer, named for it, and it keeps the mark
  { newGame(); G.denarii = 50000; G.smith.level = 4; const g2 = G.roster[0];
    const plain = makeItem('weapon', 3, g2.cls), fine = Object.assign(makeItem('weapon', 3, g2.cls), { mw: true }), cu = makeItem('chest', 3), cuF = Object.assign(makeItem('chest', 3), { mw: true });
    assert(Math.abs(itemStats(fine).dmg - itemStats(plain).dmg - 0.5) < 1e-9 && Math.abs(itemStats(cuF).armor - itemStats(cu).armor * 1.1) < 1e-9, 'half a point on a blade, a tenth on armour');
    assert(itemPrice(fine) > itemPrice(plain) && /^Master-wrought /.test(itemName(fine)) && /Master-wrought/.test(itemEffect(fine)) && /Master-wrought/.test(itemEffect(cuF)) && !/Master/.test(itemName(plain)), 'and it is known for what it is');
    G.armoury.push(fine); G.smith.reforged = -1; assert(reforge(fine.id) && fine.mw && fine.r === 4, 'reforged, it is master-wrought still');
    assert(masterChance('order') > masterChance('reforge') && masterChance('order') <= 0.3, 'a commission comes out so oftener than a reforging: ' + masterChance('order'));
    G.smith.level = 0; const low = masterChance('order'); G.smith.level = 4; assert(masterChance('order') > low, 'and a better forge oftener than a poor one');
    let got = 0; for (let i = 0; i < 300; i++) { G.smith.order = { slot: 'head', cls: null, r: 6 }; genSmith(); if (G.armoury[G.armoury.length - 1].mw) got++; }
    assert(got > 40 && got < 130, 'about one commission in four from an imperial forge: ' + got + ' of 300');
    assert(G.smith.stock.every(x => !x.mw), 'nothing master-wrought is ever on the stall'); }
  // three more fittings, and a fitting can be struck off for another
  { newGame(); G.denarii = 50000; G.smith.level = 4; const g3 = G.roster[0], sw = makeItem('weapon', 3, g3.cls), gr = makeItem('legs', 3), sh = makeItem('shoulders', 3); G.armoury.push(sw, gr, sh);
    assert(Object.keys(FITS).length === 8 && Object.keys(FITS).filter(k => FITS[k].weapon).length === 3, 'eight fittings: three for blades, five for armour');
    const s0 = itemStats(sw), l0 = itemStats(gr), b0 = itemStats(sh);
    assert(fitItem(sw.id, 'quick') && Math.abs(itemStats(sw).speed - s0.speed - 0.03) < 1e-9 && Math.abs(itemStats(sw).dmg - s0.dmg + 0.3) < 1e-9, 'a quick blade');
    assert(fitItem(gr.id, 'braced') && Math.abs(itemStats(gr).hamRes - l0.hamRes - 0.15) < 1e-9 && fitItem(sh.id, 'lined') && Math.abs(itemStats(sh).bleedRes - b0.bleedRes - 0.2) < 1e-9, 'braced greaves and lined shoulders');
    g3.gear.weapon = sw; G.armoury = G.armoury.filter(x => x !== sw); const base = gearStats(g3).speed; assert(base > 1.02, 'and a man is the faster for carrying it: ' + base);
    const d3 = G.denarii, sc = stripCost(sw); assert(sc > 0 && sc < fitCost(sw) && stripFit(sw.id) && !sw.fit && G.denarii === d3 - sc && !/quick/.test(itemName(sw)) && !stripFit(sw.id), 'struck off for half, once');
    assert(fitItem(sw.id, 'weighted') && sw.fit === 'weighted', 'and another put on in its place'); }
  // the piece he is proudest of: the best on the stall, a fifth cheap, and only while it is his
  { newGame(); G.denarii = 50000; G.smith.level = 4; genSmith();
    const pr = G.smith.stock.filter(x => x.pride); assert(pr.length === 1 && pr[0].r === Math.max(...G.smith.stock.map(x => x.r)), 'one piece, and it is the best he has');
    const p = pr[0], full = itemPrice(p), d4 = G.denarii; assert(buyPrice(p) === Math.round(full * 0.8 / 5) * 5 && buyPrice(p) < full, 'a fifth off');
    const paid = buyPrice(p); assert(buyItem(p.id) && G.denarii === d4 - paid && !p.pride && itemPrice(p) === full, 'bought at that price, it is then a piece like any other');
    const d5 = G.denarii; assert(sellItem(p.id) && G.denarii === d5 + Math.round(full / 2) && Math.round(full / 2) < paid, 'and selling it back loses money'); }
  assert(!badNumber(G), 'the smith left a bad number');
}));

test('every event and every choice runs', () => game()(function () {
  let n = 0;
  for (const id of Object.keys(EVENTS)) {
    for (let i = 0; i < EVENTS[id].opts.length; i++) {
      newGame();
      G.denarii = 5000; G.day = 2; G.fac.barracks = 1; G.patrons.magistrate = 50;
      G.roster.push(makeGladiator(25));
      G.roster.forEach(g => { g.wins = 6; g.rank = 2; });
      const rival = G.houses[0].roster[0];
      G.roster[0].lostTo = { hid: G.houses[0].id, gid: rival.id, name: rival.name };
      if (id === 'promiseDue') G.roster[1].promise = { at: 1 };
      // something from the road: a contract under way, and a journey at its end
      G.contracts[0].type = 'caravan'; G.contracts[0].size = 1; G.contracts[0].patron = 'guild'; G.contracts[0].land = 'Gaul';
      if (EVENTS[id].field) assert(sendContract(G.contracts[0].id, [G.roster[2].id]), 'contract for ' + id);
      for (const q in QUESTS) if (QUESTS[q].finale === id) G.roster[1].quest = { id: q, since: 1 };
      // something out in the province: the school in the field, a journey to end there, the eagle in the baggage
      if (EVENTS[id].wild || id === 'eagleHome') { G.tally.wins = 1; G.roster[1].quest = { id: 'village', since: 1 }; assert(wildEnter(), 'the school marches out for ' + id); if (id === 'eagleHome') wildMap().story = 5; }
      G.houses.forEach(h => { h.grudge = 50; });
      assert(EVENTS[id].can(), id + ' should be possible in the test setup');
      G.pendingEvent = { id, c: EVENTS[id].make() };
      const out = answerEvent(i);
      assert(typeof out === 'string' && out.length > 3 && !/undefined|NaN/.test(out), id + ' option ' + i + ' gave: ' + out);
      assert(!badNumber(G), id + ' left a bad number');
      n++;
    }
  }
  assert(n >= 228, 'expected at least 228 event choices, ran ' + n);
  // an event at the ludus must not share its name with one from the road or the province, or one of the two is lost
  for (const id of ['editorsEar', 'diceGame', 'foundersDay', 'slander', 'arson', 'defector']) assert(EVENTS[id] && !EVENTS[id].field && !EVENTS[id].wild, id + ' is a ludus event of its own');
}));

test('every style can fight every other, and every fallen fighter gets a verdict', () => game()(function () {
  newGame();
  const cls = Object.keys(CLASSES);
  for (const a of cls) for (const b of cls) {
    const B = fight([makeGladiator(30, { cls: a })], [makeGladiator(30, { cls: b })]);
    assert(B.winner === 0 || B.winner === 1, a + ' v ' + b + ': no winner');
    assert(B.fighters.every(f => Number.isFinite(f.hp) && Number.isFinite(f.x) && Number.isFinite(f.y)), a + ' v ' + b + ': bad number');
    assert(B.fighters.every(f => !(f.down || f.yielded) || f.fate === 'dead' || f.fate === 'spared'), a + ' v ' + b + ': fallen fighter without a fate');
    assert(B.fighters.some(f => !f.down && !f.yielded) || B.decision, a + ' v ' + b + ': nobody left standing');
  }
}));

test('bouts to the death and beast hunts follow their own rules', () => game()(function () {
  newGame();
  for (let i = 0; i < 25; i++) {
    const B = fight([makeGladiator(30), makeGladiator(30)], [makeGladiator(30), makeGladiator(30)], { death: true });
    assert(B.fighters.every(f => !f.yielded), 'nobody yields in a bout to the death');
    assert(B.fighters.filter(f => f.down).every(f => f.fate === 'dead'), 'the fallen die in a bout to the death');
  }
  for (const kind of Object.keys(BEASTS)) for (let i = 0; i < 8; i++) {
    const B = fight([makeGladiator(30)], [makeBeast(kind, 30)], { hunt: true });
    assert(B.fighters.every(f => !f.yielded), 'nobody yields to a ' + kind);
    assert(B.fighters.filter(f => f.g.beast && f.down).every(f => f.fate === 'dead'), 'a fallen ' + kind + ' is dead');
  }
}));

test('three skills: power, potential, and old fighters converted', () => game()(function () {
  newGame();
  assert(STATS.join() === 'str,agi,skl' && Object.keys(STAT_NAMES).length === 3, 'strength, agility and skill');
  for (let i = 0; i < 200; i++) {
    const b = 8 + Math.floor(Math.random() * 60), g = makeGladiator(b);
    assert(Object.keys(g.stats).join() === 'str,agi,skl' && Object.keys(g.pot).join() === 'str,agi,skl' && Object.keys(g.prog).join() === 'str,agi,skl', 'a new man has three skills');
    assert(rating(g) === g.stats.str + g.stats.agi + g.stats.skl && rating(g) === Math.max(6, Math.min(60, b)) && STATS.every(k => g.stats[k] >= 2 && g.stats[k] <= 20), 'power is the sum of his skills and matches what was paid for: ' + rating(g) + ' for ' + b);
    assert(potential(g) === Math.round((g.pot.str + g.pot.agi + g.pot.skl) * 10) && potential(g) >= 21 && potential(g) <= 42, 'potential is the sum of his talents');
    assert(maxHp(g) === Math.round((60 + rating(g) * 2.3) * (g.traits.includes('ironhide') ? 1.15 : 1)), 'health comes from all three');
  }
  for (const k in CONTRACTS) assert(CONTRACTS[k].w.end === undefined, k + ' no longer asks for endurance');
  for (const k in BEASTS) assert(rating(makeBeast(k, 30)) > 6, k + ' is made of three skills too');
  // a fighter from an older save: his endurance is shared out, lowest skill first, and nothing is lost
  const old = makeGladiator(20);
  Object.assign(old, { stats: { str: 9, agi: 3, end: 7, skl: 5 }, prog: { str: 0.2, agi: 0, end: 0.9, skl: 0 }, pot: { str: 1, agi: 1, end: 1.3, skl: 1 }, activity: 'end', hp: 999 });
  delete old.abil;
  G.roster.push(old); G.houses[0].roster[0].stats.end = 4;
  const sumBefore = 9 + 3 + 7 + 5, rival = G.houses[0].roster[0], rivalSum = rival.stats.str + rival.stats.agi + rival.stats.skl + 4;
  migrate();
  assert(old.stats.end === undefined && old.prog.end === undefined && old.pot.end === undefined && rating(old) === sumBefore, 'his points are all still there: ' + JSON.stringify(old.stats));
  assert(old.stats.agi > 3 && old.stats.str === 9 && old.activity === 'rest' && old.hp === maxHp(old) && Array.isArray(old.abil), 'the weakest skill gained most, and he is resting');
  assert(rival.stats.end === undefined && rating(rival) === rivalSum, 'rival fighters are converted too');
  const capped = makeGladiator(20); capped.stats = { str: 20, agi: 20, end: 9, skl: 19 }; fixSkills(capped);
  assert(capped.stats.str === 20 && capped.stats.agi === 20 && capped.stats.skl === 20 && capped.stats.end === undefined, 'no skill passes twenty');
  // training still works on each of the three, and sparring on all
  const t = G.roster[0]; t.fatigue = 0; t.morale = 80;
  for (const k of STATS) { t.activity = k; const before = t.prog[k] + t.stats[k] * 100; endDay(); G.pendingEvent = null; assert(t.prog[k] + t.stats[k] * 100 > before, 'training ' + k + ' moves it'); }
  assert(!badNumber(G), 'no number went bad');
}));

test('styles: strength beats agility beats skill beats strength', () => game()(function () {
  newGame();
  const man = (cls, st) => { const g = makeGladiator(30, { cls }); g.stats = Object.assign({ str: 8, agi: 8, skl: 8 }, st); g.traits = []; g.hp = maxHp(g); return g; };
  assert(styleOf(man('murmillo', { str: 14 })) === 'str' && styleOf(man('murmillo', { agi: 14 })) === 'agi' && styleOf(man('murmillo', { skl: 14 })) === 'skl', 'his highest skill is his style');
  assert(styleOf(man('murmillo', {})) === null && styleOf(man('murmillo', { str: 12, skl: 12 })) === null && styleOf(makeBeast('lion', 30)) === null, 'two level skills are no style, and a beast has none');
  assert(styleEdge('str', 'agi') === 1.1 && styleEdge('agi', 'skl') === 1.1 && styleEdge('skl', 'str') === 1.1, 'each beats the next');
  assert(styleEdge('agi', 'str') === 0.9 && styleEdge('skl', 'agi') === 0.9 && styleEdge('str', 'skl') === 0.9, 'and loses to the one before');
  assert(styleEdge('str', 'str') === 1 && styleEdge(null, 'agi') === 1 && styleEdge('str', null) === 1, 'like against like, or no style, is even');
  // in the arena it tells: the same two men, with the skill points moved so that one style beats the other
  const duel = (a, b, n) => { let w = 0; for (let i = 0; i < n; i++) { const A = man('thraex', a), Bm = man('thraex', b); if (fight([A], [Bm]).winner === 0) w++; } return w / n; };
  const up = duel({ str: 14, agi: 5, skl: 5 }, { str: 5, agi: 14, skl: 5 }, 160), down = duel({ str: 5, agi: 14, skl: 5 }, { str: 14, agi: 5, skl: 5 }, 160);
  assert(up > down + 0.12, 'strength beat agility ' + Math.round(up * 100) + '% of the time, and agility beat strength ' + Math.round(down * 100) + '%');
  // and the bookmakers know it
  const s1 = man('thraex', { str: 14, agi: 5, skl: 5 }), a1 = man('thraex', { str: 5, agi: 14, skl: 5 }), k1 = man('thraex', { str: 5, agi: 5, skl: 14 });
  assert(winOdds([s1], [a1]).p > winOdds([s1], [s1]).p && winOdds([s1], [k1]).p < winOdds([s1], [s1]).p, 'the odds lean toward the style that beats the other');
  return 'strength over agility ' + Math.round(up * 100) + '% / ' + Math.round(down * 100) + '%';
}));

test('abilities: learned at 5, 10 and 16, four carried, cast on a full charge', () => game()(function () {
  newGame();
  // forty-five of them, three for each skill of each fighting style, every one with a name and something it does
  let n = 0; const names = new Set();
  for (const cls in CLASSES) for (const sk of STATS) {
    assert(ABILITIES[cls][sk].length === 3, cls + ' ' + sk + ' has three');
    ABILITIES[cls][sk].forEach((a, i) => {
      n++; names.add(a.name);
      assert(a.at === [5, 10, 16][i] && a.id === cls + '.' + sk + i && abilityById(a.id) === a && a.desc.length > 12, a.id + ' is in its place');
      const x = a.fx; assert(x.mult || x.net || x.buff || x.heal, a.id + ' does something');
      if (x.buff) assert(x.buff.t > 0 && (x.buff.dodge || x.buff.block || x.buff.dr || x.buff.dmg || x.buff.haste), a.id + ' has a real buff');
    });
  }
  assert(n === 45 && names.size === 45, 'forty-five abilities, no two with the same name');
  // learning
  const g = makeGladiator(20, { cls: 'murmillo' }); g.traits = [];
  g.stats = { str: 4, agi: 4, skl: 4 };
  assert(abilitiesKnown(g).length === 0 && abilitiesOf(g)[0] === BLOW && abilityNext(g, 'str').at === 5, 'below five he knows nothing but a heavy blow');
  g.stats.str = 5; assert(abilitiesKnown(g).map(a => a.id).join() === 'murmillo.str0', 'five teaches the first');
  g.stats.str = 10; assert(abilitiesKnown(g).length === 2, 'ten the second');
  g.stats.str = 16; assert(abilitiesKnown(g).length === 3 && abilityNext(g, 'str') === null, 'sixteen the third, and then no more');
  g.stats = { str: 16, agi: 10, skl: 5 };
  const known = abilitiesKnown(g), carried = abilitiesOf(g);
  assert(known.length === 6 && carried.length === 4 && carried.every(a => known.includes(a)) && carried[0].tier === 2, 'he knows six and carries the best four');
  const out1 = known.find(a => !carried.includes(a));
  assert(toggleAbility(g, out1.id) && abilitiesOf(g).includes(out1) && abilitiesOf(g).length === 4, 'one he did not carry takes a place');
  assert(toggleAbility(g, out1.id) && !abilitiesOf(g).includes(out1) && abilitiesOf(g).length === 4, 'and can be put down again for another');
  const few = makeGladiator(20, { cls: 'thraex' }); few.stats = { str: 6, agi: 6, skl: 6 };
  assert(!toggleAbility(few, 'thraex.str0') && abilitiesOf(few).length === 3, 'with four or fewer there is nothing to choose');
  assert(!toggleAbility(g, 'thraex.str0') && !toggleAbility(g, 'nonsense'), 'he cannot carry what his style does not teach');
  // the charge: fills by itself and with blows, and is spent on an ability
  const a = makeGladiator(40, { cls: 'murmillo' }), b = makeGladiator(40, { cls: 'thraex' });
  a.traits = a.traits.filter(t => t !== 'opener'); b.traits = b.traits.filter(t => t !== 'opener');      // a perk that starts a man half charged would cloud it
  let B = createBattle([a], [b], { noIntro: true });
  assert(B.fighters.every(f => f.charge === 0 && f.abl.length >= 1 && f.abl.length <= 4 && f.stam === undefined), 'they start uncharged, with their abilities, and no stamina');
  for (let i = 0; i < 30 && !B.over; i++) stepBattle(B, 1 / 30);
  assert(B.fighters.every(f => f.charge > 0 && f.charge < 100), 'a second in, the charge has begun to fill');
  // (a duel can end before anyone is charged, so a few are tried)
  for (let tries = 0; tries < 8 && !B.fighters.some(f => f.casts > 0); tries++) {
    if (tries) B = createBattle([makeGladiator(40, { cls: 'murmillo' })], [makeGladiator(40, { cls: 'murmillo' })], { noIntro: true });
    for (let i = 0; i < 3000 && !B.over && !B.fighters.some(f => f.casts > 0); i++) stepBattle(B, 1 / 30);
  }
  assert(B.fighters.some(f => f.casts > 0 && f.charge < 100) && B.time < 40, 'somebody has used an ability, after ' + B.time.toFixed(1) + 's');
  // every ability can be cast without breaking anything
  for (const cls in CLASSES) for (const sk of STATS) for (const ab of ABILITIES[cls][sk]) {
    const me = makeGladiator(45, { cls }), foes = [makeGladiator(45), makeGladiator(45), makeGladiator(45)];
    const F = createBattle([me, makeGladiator(45)], foes, { noIntro: true });
    for (let i = 0; i < 90; i++) stepBattle(F, 1 / 30);
    const f = F.fighters[0]; f.hp = Math.max(1, f.maxHp * 0.5); f.charge = 100;
    castAbility(F, f, ab);
    assert(f.charge === 0 && f.casts >= 1 && !badNumber(F.fighters.map(q => [q.hp, q.x, q.y, q.cd, q.charge, q.snare, q.stun, q.bleed, q.weakT, q.open])), ab.id + ' left a bad number');
    if (ab.fx.heal) assert(f.hp > f.maxHp * 0.5, ab.id + ' heals');
    if (ab.fx.buff) assert(f.buff && f.buff.t > 0, ab.id + ' leaves him buffed');
    let k = 0; while ((!F.over || F.outro <= F.outroEnd) && k++ < 40000) stepBattle(F, 1 / 30);
    assert(F.over, 'the fight after ' + ab.id + ' reaches a verdict');
  }
  // an ability of several blows lands them one at a time, and every cast leaves something to look at
  {
    const me = makeGladiator(45, { cls: 'dimachaerus' }), F = createBattle([me], [makeGladiator(58, { cls: 'murmillo' })], { noIntro: true });
    for (let i = 0; i < 60; i++) stepBattle(F, 1 / 30);
    const f = F.fighters[0], foe = F.fighters[1]; foe.hp = foe.maxHp; f.stun = 0; F.vfx.length = 0; F.hitstop = 0;
    castAbility(F, f, abilityById('dimachaerus.agi1'));                    // Blade storm: five cuts
    assert(f.combo && f.combo.left === 4, 'the first cut lands at once and four are still to come');
    assert(F.vfx.some(v => v.k === 'banner' && v.text === 'BLADE STORM') && F.vfx.some(v => v.k === 'ring') && F.vfx.some(v => v.k === 'arc'), 'a ribbon with its name, a ring at his feet, and the arc of the blade');
    let steps = 0; while (f.combo && steps++ < 90) stepBattle(F, 1 / 30);
    assert(!f.combo && steps > 8 && steps < 60, 'the rest follow over about half a second (' + steps + ' frames)');
    for (let i = 0; i < 90; i++) stepBattle(F, 1 / 30);
    assert(!F.vfx.some(v => v.k === 'banner' && v.text === 'BLADE STORM'), 'and the pictures clear away');
    // a thrown net flies before it lands
    const R = createBattle([makeGladiator(45, { cls: 'retiarius' })], [makeGladiator(45)], { noIntro: true }), r = R.fighters[0];
    for (let i = 0; i < 30; i++) stepBattle(R, 1 / 30);
    R.projs.length = 0; castAbility(R, r, abilityById('retiarius.skl0'));
    assert(R.projs.length === 1 && R.projs[0].snare === 3.5 && R.fighters[1].snare === 0, 'the net is in the air, and he is not yet caught');
    // a stun breaks a combo off
    const S = createBattle([makeGladiator(45, { cls: 'dimachaerus' })], [makeGladiator(58)], { noIntro: true }), sf = S.fighters[0];
    for (let i = 0; i < 30; i++) stepBattle(S, 1 / 30);
    S.hitstop = 0; castAbility(S, sf, abilityById('dimachaerus.agi1')); sf.stun = 1; S.hitstop = 0; stepBattle(S, 1 / 30);
    assert(!sf.combo, 'a stunned man loses the rest of his blows');
  }
  // watched fights stop for the player's men, and only for them
  B = createBattle([makeGladiator(40), makeGladiator(40)], [makeGladiator(40), makeGladiator(40)], { noIntro: true, ask: true });
  let asked = 0, foeCasts = 0, steps = 0;
  while (!B.over && steps++ < 30000) {
    stepBattle(B, 1 / 30);
    if (B.pick) {
      const who = B.pick, t0 = B.time;
      assert(who.team === 0 && who.charge >= 100 && who.abl.length > 1, 'it stops for one of yours, charged, with a choice to make');
      for (let i = 0; i < 20; i++) stepBattle(B, 1 / 30);
      assert(B.pick === who && B.time === t0, 'and stays stopped until you choose');
      const choice = who.abl[asked % who.abl.length];
      assert(pickAbility(B, choice.id) && !B.pick && who.charge === 0 && who.lastCast === choice.id, 'he does what you chose');
      asked++;
    }
  }
  foeCasts = B.fighters.filter(f => f.team === 1).reduce((m, f) => m + f.casts, 0);
  assert(B.over && asked > 0 && foeCasts > 0, 'you were asked ' + asked + ' times; the other side chose for itself ' + foeCasts + ' times');
  // unwatched, nobody is asked
  B = fight([makeGladiator(40), makeGladiator(40)], [makeGladiator(40), makeGladiator(40)]);
  assert(!B.pick && B.fighters.some(f => f.team === 0 && f.casts > 0), 'unwatched, your men choose for themselves');
  // the cloth is the one order left
  const start = opts => createBattle([makeGladiator(30), makeGladiator(30)], [makeGladiator(30), makeGladiator(30)], Object.assign({ noIntro: true }, opts || {}));
  B = start(); B.fighters.forEach(f => { f.g.traits = []; });
  assert(!giveOrder(B, 'press') && !giveOrder(B, 'hold'), 'press and hold are gone');
  assert(giveOrder(B, 'yield') && B.fighters.filter(f => f.team === 0 && f.yielded).length === 1 && !giveOrder(B, 'yield'), 'the cloth makes one of yours yield, once');
  assert(!giveOrder(start({ death: true }), 'yield'), 'no yielding in a bout to the death');
  return asked + ' choices asked of the player in one two-a-side fight';
}));

test('a bout pays out and updates records', () => game()(function () {
  let wins = 0, losses = 0;
  for (let i = 0; i < 40; i++) {
    newGame(); G.day = 5; genBouts();
    const b = G.bouts[i % G.bouts.length], g = G.roster[0], money = G.denarii, fame = G.fame, size0 = G.roster.length;
    const foe = boutEnemies(b)[0], H = houseOf(b.houseId), rec = H.won + H.lost;
    const r = applyBoutResult(b, fight([g], [foe]), 0, 1);
    assert(b.done && H.won + H.lost === rec + 1, 'bout and house record updated');
    assert(G.denarii === money + r.purse && G.fame === fame + r.fameGain && r.purse >= 0 && r.fameGain >= 0, 'purse and fame add up');
    if (r.win) { wins++; assert(r.purse === b.purse && r.fameGain > 0, 'winner takes the purse'); } else { losses++; assert(r.purse < b.purse, 'loser gets less'); }
    if (G.roster.includes(g)) assert(g.foughtDay === G.day && g.wins + g.losses === 1 && !canFight(g), 'fighter record');
    else assert(G.roster.length === size0 - 1 && G.fallen.length === 1, 'the dead leave the roster');
  }
  assert(wins > 3 && losses > 3, 'expected a mix of results, got ' + wins + ' wins and ' + losses + ' losses');
}));

test('festivals: hunt, great melee, funeral games', () => game()(function () {
  newGame(); G.fame = 350; G.day = 30;
  G.festival = { day: 30, type: 'hunt' }; genBouts();
  assert(G.bouts.filter(b => b.hunt).length >= 4 && G.bouts.filter(b => b.hunt).every(b => b.enemies.every(e => e.beast)), 'hunt bouts hold beasts');
  G.festival = { day: 30, type: 'melee' }; genBouts();
  const m = G.bouts.find(b => b.melee); assert(m && m.size >= 4 && boutEnemies(m).length === m.size, 'great melee has four or five a side');
  G.festival = { day: 30, type: 'funeral' }; genBouts();
  assert(G.bouts.filter(b => !b.grudge).every(b => b.death && b.funeral), 'funeral games are all to the death');
  G.fame = 0; G.festival = { day: 30, type: 'funeral' }; genBouts();
  assert(G.bouts.some(b => b.hunt) && !G.bouts.some(b => b.funeral), 'village pits get a hunt instead');
}));

test('festivals: triumph, Saturnalia, the Games of Mars, sponsors, crowns and the calendar', () => game()(function () {
  const won = (mine, foes) => { const B = fight(mine, foes); B.winner = 0; B.fighters.forEach(f => { if (f.team === 0) { f.fate = null; f.hp = f.maxHp; } }); return B; };
  newGame(); while (G.roster.length < 6) G.roster.push(makeGladiator(30));
  // the calendar: the next festival and the two after it, never the same twice running
  G.festival = null; G.festQueue = null; scheduleFestival();
  assert(G.festival.day === FESTIVAL_EVERY && G.festival.type === 'hunt' && G.festQueue.length === 2 && G.festQueue[0].day === FESTIVAL_EVERY * 2 && G.festQueue[0].type === 'tourney', 'the first is a hunt, the second the tournament');
  for (let n = 0; n < 40; n++) {
    const next = G.festQueue[0]; G.day = G.festival.day + 1; scheduleFestival();
    assert(G.festival.day === next.day && G.festival.type === next.type && FESTIVALS[G.festival.type] && G.festQueue.length === 2, 'what was promised is what comes');
    const q = [G.festival].concat(G.festQueue).filter(x => x.type !== 'tourney');
    assert(q.every((x, i) => !i || x.type !== q[i - 1].type), 'no festival twice running');
  }
  // a triumph: armed captives, to the death, and a cheap market after
  G.fame = 350; G.day = 30; G.denarii = 5000; G.festival = { day: 30, type: 'triumph' }; genBouts();
  const caps = G.bouts.filter(b => b.captive);
  assert(caps.length === 3 && caps.every(b => b.death && b.fest && b.enemies.length === b.size && !b.houseId) && crownNeed() === 2, 'three bouts against captives');
  genMarket(); assert(G.market.length && G.market.every(m => m.spoils || m.kept), 'the spoils go cheap');
  // sponsoring: paid once, in the last five days
  const d0 = G.denarii, f0 = G.patrons.magistrate;
  assert(sponsorFestival() && G.denarii === d0 - sponsorCost() && G.patrons.magistrate > f0 && G.festival.sponsor && !sponsorFestival(), 'a sponsor pays once');
  // the crown: two of the three won
  let r = applyBoutResult(caps[0], won([G.roster[0]], caps[0].enemies), 0, 1);
  assert(G.festival.won === 1 && !G.festival.crowned && !trophies(), 'one is not enough');
  const d1 = G.denarii; r = applyBoutResult(caps[1], won([G.roster[1]], caps[1].enemies), 0, 1);
  assert(G.festival.crowned && trophies() === 1 && G.trophies.triumph === 1 && G.denarii === d1 + r.purse + round5(PURSE[tier()] * 0.8 * 1.5) && trophyBonus() === 0.02, 'the crown, and a sponsor is paid half as much again');
  r = applyBoutResult(caps[2], won([G.roster[2], G.roster[3]], caps[2].enemies), 0, 1);
  assert(trophies() === 1, 'one crown a festival');
  // Saturnalia: nobody dies, more fame, better odds, and no raising the stakes
  G.day = 45; G.roster.forEach(g => { g.foughtDay = 0; g.morale = 50; }); G.festival = { day: 45, type: 'hunt' }; genBouts();
  const plainPay = winOdds([G.roster[0]], boutEnemies(G.bouts.find(b => b.houseId && b.size === 1))).pay;
  G.festival = { day: 45, type: 'saturnalia' }; G.roster.forEach(g => { g.morale = 50; }); genBouts();
  assert(G.bouts.filter(b => !b.grudge).every(b => !b.death && b.saturn) && G.roster.every(g => g.morale >= 60), 'no blood, and the men are merry');
  const sb = G.bouts.find(b => b.saturn && b.houseId);
  assert(stakesBlock(sb) && !raiseStakes(sb.id), 'the stakes cannot be raised');
  assert(festToday('saturnalia') && plainPay > 0, 'the festival is today');
  { const b1 = G.bouts.find(b => b.houseId && b.size === 1), o = winOdds([G.roster[0]], boutEnemies(b1)); G.festival.shown = 'hunt'; const o2 = winOdds([G.roster[0]], boutEnemies(b1)); G.festival.shown = 'saturnalia';
    assert(o.pay > o2.pay, 'the bookmakers pay more'); }
  // the Games of Mars: one duel for each style, and only that style may enter
  G.day = 75; G.festival = { day: 75, type: 'mars' }; genBouts(); G.roster.forEach(g => { g.foughtDay = 0; g.injury = 0; });
  const mb = G.bouts.filter(b => b.style);
  assert(mb.length === 3 && STATS.every(st => mb.some(b => b.style === st)) && mb.every(b => b.fest && b.size === 1 && stakesBlock(b)) && crownNeed() === 2, 'a duel for each style');
  for (const b of mb) assert(G.roster.every(g => boutFit(b, g) === (canFight(g) && styleOf(g) === b.style)), 'only that style may enter');
  // the village pits get a hunt instead of a triumph, and the Games of Mars are held anywhere
  G.fame = 0; G.day = 105; G.festival = { day: 105, type: 'triumph' }; genBouts();
  assert(G.bouts.some(b => b.hunt) && !G.bouts.some(b => b.captive), 'no triumphs in the pits');
  G.festival = { day: 105, type: 'mars' }; genBouts(); assert(G.bouts.filter(b => b.style).length === 3, 'the Games of Mars in the pits');
  // a hunt crown at three hunts won
  G.festival = { day: 105, type: 'hunt' }; genBouts(); G.roster.forEach(g => { g.foughtDay = 0; });
  G.bouts.filter(b => b.hunt).slice(0, 3).forEach((b, i) => applyBoutResult(b, won([G.roster[i]], b.enemies), 0, 1));
  assert(G.festival.crowned && G.trophies.hunt === 1 && trophies() === 2, 'three hunts won is a crown');
  assert(!badNumber(G), 'festivals left a bad number');
}));

test('tournament: the bracket, bets on the laurel, tending between rounds, watching, and the roll of honour', () => game()(function () {
  const won = (mine, foes) => { const B = fight(mine, foes); B.winner = 0; B.fighters.forEach(f => { if (f.team === 0) { f.fate = null; f.hp = f.maxHp * 0.5; } }); return B; };
  const fresh = () => { newGame(); G.fame = 120; G.day = 30; G.denarii = 2000; G.festival = { day: 30, type: 'tourney' }; genBouts(); return G.tourney; };
  // the odds: every man priced, and the prices make sense
  let T = fresh(), o = tourneyOdds(T);
  assert(Object.keys(o).length === 7 && !o.you && Object.values(o).every(x => x.pay >= 1.3 && x.pay <= 20 && x.p > 0), 'seven rivals priced before you enter');
  assert(Math.abs(Object.values(o).reduce((n, x) => n + x.p, 0) - 1) < 1e-9, 'the chances add up');
  assert(tourneyBetBlock('you', 50) && !tourneyBet('you', 50), 'you cannot back your man before he is entered');
  // watching: a bet on a rival, settled when the lists are fought out
  const fav = Object.keys(o).sort((a, b) => o[b].p - o[a].p)[0], d0 = G.denarii;
  assert(tourneyBet(fav, 100) && G.denarii === d0 - 100 && T.bet.key === fav && !tourneyBet(fav, 50), 'one bet, paid for now');
  assert(watchTourney() && T.state === 'done' && T.champion && T.bet.settled && !watchTourney(), 'watched to the end');
  assert(G.denarii === d0 - 100 + (T.bet.won ? Math.round(100 * T.bet.pay) : 0) && (T.bet.won === (String(T.championGid) === fav)), 'the bet is settled on the winner');
  assert(T.rounds.length >= 3 && T.rounds[T.rounds.length - 1].length === 1 && T.rounds[0].length === 7, 'the bracket is kept');
  assert(G.laurels.length === 1 && G.laurels[0].name === T.champion && G.laurels[0].hid, 'the winner goes on the roll');
  // entering: the draw, your own price, tending between rounds
  T = fresh(); const g = G.roster[0]; STATS.forEach(k => { g.stats[k] += 14; }); g.hp = maxHp(g);
  assert(enterTourney(g.id) && T.rounds.length === 1 && T.rounds[0].length === 8 && T.rounds[0][0].you, 'your man is on the bracket');
  o = tourneyOdds(T); assert(o.you && o.you.name === g.name && Object.keys(o).length === 8, 'and has a price');
  const d1 = G.denarii; assert(tourneyBet('you', 100) && G.denarii === d1 - 100, 'you may back him');
  assert(tendBlock() && !tendChampion('surgeon'), 'nothing to tend before the first round');
  applyBoutResult(T.bout, won([g], boutEnemies(T.bout)), 0, 1);
  assert(T.state === 'running' && T.round === 1 && T.rounds.length === 2 && T.rounds[1].length === 4 && !!tourneyBetBlock(String(T.field[0].gid), 1), 'through to the semi-final, and the book is shut');
  g.hp = maxHp(g) * 0.5; const hp0 = g.hp;
  assert(tendChampion('surgeon') && g.hp > hp0 && T.tended === 'surgeon' && !tendChampion('whet'), 'one thing between rounds');
  applyBoutResult(T.bout, won([g], boutEnemies(T.bout)), 0, 1);
  assert(T.round === 2 && !T.tended && tendChampion('whet') && g.whet, 'and one more before the final');
  const d2 = G.denarii, r = applyBoutResult(T.bout, won([g], boutEnemies(T.bout)), 0, 1);
  assert(T.state === 'done' && T.champion === 'you' && !g.whet && T.rounds.length === 4 && T.rounds[3][0].you, 'he takes the laurel, and the whetting is spent');
  assert(T.bet.settled && T.bet.won && G.denarii === d2 + r.purse + T.bet.gain + round5(PURSE[tier()] * 0.8), 'the bet on him pays, with the purse and the crown');
  assert(G.laurels[G.laurels.length - 1].gid === g.id && !G.laurels[G.laurels.length - 1].hid, 'and he is on the roll');
  // wine
  T = fresh(); const h = G.roster[0]; STATS.forEach(k => { h.stats[k] += 14; }); h.hp = maxHp(h); enterTourney(h.id);
  applyBoutResult(T.bout, won([h], boutEnemies(T.bout)), 0, 1); h.morale = 40; h.fatigue = 60;
  assert(tendChampion('wine') && h.morale === 70 && h.fatigue === 30, 'wine and a word');
  // a lost bet when your man goes out
  T = fresh(); const w = G.roster[0]; enterTourney(w.id); tourneyBet('you', 50);
  const B = fight([w], boutEnemies(T.bout)); B.winner = 1; applyBoutResult(T.bout, B, 0, 1);
  assert(T.state === 'done' && T.champion !== 'you' && T.bet.settled && !T.bet.won, 'out in the first round, and the stake with him');
  assert(!badNumber(G), 'the tournament left a bad number');
}));
test('the tournament: the men your man meets in later rounds carry what the earlier rounds cost them', () => game()(function () {
  const fresh = () => { newGame(); G.fame = 120; G.day = 30; G.denarii = 2000; G.festival = { day: 30, type: 'tourney' }; genBouts(); return G.tourney; };
  const won = (mine, foes) => { const B = fight(mine, foes); B.winner = 0; B.fighters.forEach(f => { if (f.team === 0) { f.fate = null; f.hp = f.maxHp; } }); return B; };
  let semi = 0, fin = 0, n = 0, low = 1, whole = 0;
  for (let i = 0; i < 40; i++) {
    const T = fresh(), g = G.roster[0]; STATS.forEach(k => { g.stats[k] += 14; }); g.hp = maxHp(g);
    for (const e of T.field) { const r = tRival(e); r.hp = 1; r.fatigue = 90; }      // whatever state they were in before, they come to the lists whole
    assert(enterTourney(g.id) && T.field.every(e => { const r = tRival(e); return r.hp === maxHp(r) && r.fatigue === 0; }), 'everybody starts the first round whole');
    applyBoutResult(T.bout, won([g], boutEnemies(T.bout)), 0, 1);
    const s = tRival(T.alive[1]), hs = tHealth(s); semi += hs; low = Math.min(low, hs); if (hs >= 0.999) whole++;
    assert(boutEnemies(T.bout)[0] === s, 'the man in the semi-final is the one who came through');
    applyBoutResult(T.bout, won([g], boutEnemies(T.bout)), 0, 1);
    const f = tRival(T.alive[1]), hf = tHealth(f); fin += hf; low = Math.min(low, hf); n++;
    assert(T.log.some(l => /% of his health/.test(l)), 'and you are told how he stands');
  }
  semi /= n; fin /= n;
  assert(semi > 0.6 && semi < 0.95, 'a semi-finalist is marked but far from finished: ' + semi.toFixed(2));
  assert(fin < semi && fin > 0.45, 'a finalist has two rounds in him and shows it: ' + fin.toFixed(2));
  assert(low >= 0.12 && whole < n * 0.2, 'nobody is carried in, and hardly anybody comes through untouched: ' + low.toFixed(2) + ', ' + whole);
  // watched from the stands it is the same: it runs to the end, and the winner has not come through whole
  const T2 = fresh(); assert(watchTourney() && T2.state === 'done' && tHealth(tRival({ hid: T2.championHouse, gid: T2.championGid })) < 1, 'the champion paid for it');
  assert(!badNumber(G), 'no bad numbers');
}));

test('tournament: enter, fight through, and resolve without the player', () => game()(function () {
  let champs = 0;
  for (let i = 0; i < 15; i++) {
    newGame(); G.fame = 120; G.day = 30; G.denarii = 500; G.festival = { day: 30, type: 'tourney' }; genBouts();
    const T = G.tourney, g = G.roster[0], money = G.denarii;
    assert(T && T.state === 'open' && T.field.length === 7 && T.field.every(e => tRival(e)), 'seven living rivals in the field');
    STATS.forEach(s => { g.stats[s] += i; });              // from hopeless to dominant across the loop
    g.hp = maxHp(g);
    assert(enterTourney(g.id) && G.denarii === money - T.fee && !canFight(g), 'entry fee paid and champion locked in');
    let rounds = 0;
    while (G.tourney.state === 'running' && G.tourney.bout && rounds < 4) {
      const me = byId(G.tourney.entrant); if (!me) break;
      applyBoutResult(G.tourney.bout, fight([me], boutEnemies(G.tourney.bout)), 0, 1); rounds++;
    }
    assert(G.tourney.state === 'done' && G.tourney.champion && rounds >= 1 && rounds <= 3, 'tournament finished in at most three rounds');
    if (G.tourney.champion === 'you') { champs++; assert(rounds === 3 && g.traits.includes('laureate'), 'champion fought three rounds and wears the laurel'); }
  }
  assert(champs >= 1 && champs <= 14, 'expected the player to win some tournaments but not all, won ' + champs + ' of 15');
  newGame(); G.day = 30; G.festival = { day: 30, type: 'tourney' }; genBouts(); endDay();
  assert(G.tourney === null && G.log.some(l => l.t.includes('wins the Laurel Tournament')), 'an unentered tournament still crowns someone');
}));

test('ranks and perks', () => game()(function () {
  newGame();
  const g = G.roster[0]; g.xp = 60;
  assert(checkRank(g) && g.rank === RANKS.length - 1 && g.perkPending === RANKS.length - 1, 'enough experience reaches the top rank');
  while (g.perkPending > 0) {
    const offer = perkOffer(g), n = g.traits.length;
    assert(offer.length === 3 && offer.every(t => TRAITS[t].good && (!TRAITS[t].special || TRAITS[t].cls === g.cls) && !g.traits.includes(t)), 'three new good perks on offer');
    choosePerk(g, offer[0]); assert(g.traits.length === n + 1, 'perk learned');
  }
}));

test('dynasty: debt, ruin, succession and what the family keeps', () => game()(function () {
  newGame();
  assert(G.dynasty.gen === 1 && !G.ruin && graceDays() === 3, 'a new dynasty, with three days of grace');
  // three days below zero and the creditors come; the campaign does not end
  G.fame = 160; G.tally.wins = 9; G.denarii = -500;
  const champ = G.roster[0]; champ.wins = 7; champ.rank = 2; champ.traits.push('brute'); champ.gear.weapon = makeItem('weapon', 5, champ.cls);
  const stats0 = Object.assign({}, champ.stats);
  endDay(); assert(G.debtDays === 1 && !G.ruin, 'day one of grace');
  endDay(); assert(G.debtDays === 2 && !G.ruin, 'day two of grace');
  endDay(); assert(G.ruin && !G.over, 'on the third day the ludus falls, and the game goes on');
  const R = G.ruin, D = G.dynasty;
  assert(deedCount() >= 1 && R.earned === Math.floor(160 / 20) + 0 + 9 + 5 + deedCount() && D.points === R.earned && D.history.length === 1 && D.history[0].gen === 1, 'legacy is worked out from how far the house got');
  assert(R.offers.length === 3 && new Set(R.offers).size === 3 && R.offers.every(b => BOONS[b]), 'three different boons are offered');
  // climbing out of debt in time avoids all of it
  const snap = JSON.stringify(G);
  // the succession
  ruinFighter(champ.id); ruinBoon('nonsense'); assert(G.ruin.boon === null, 'only an offered boon can be kept');
  ruinBoon(R.offers[0]); D.points = 100;
  assert(buyLegacy('purse') && buyLegacy('purse') && buyLegacy('blood') && buyLegacy('cells') && D.points === 100 - 15 - 25 - 15 - 30 && !buyLegacy('forge'), 'legacy points buy from the ledger until they run out');
  const kept = R.offers[0];
  assert(startHeir(), 'the heir begins');
  assert(G.day === 1 && G.dynasty.gen === 2 && G.dynasty === D || G.dynasty.gen === 2, 'a fresh ludus, second generation');
  assert(G.denarii === 250 + 100 && G.fac.barracks === 1 && G.dynasty.boons.includes(kept) && G.dynasty.points === 15 && !G.ruin && G.debtDays === 0, 'the ledger and the boon apply to the new ludus');
  const old = G.roster.find(g => g.name === champ.name && g.wins === 7);
  assert(old && old.rank === 2 && old.traits.includes('brute') && SLOTS.every(sl => old.gear[sl] === null), 'the smuggled man arrives with his record and no gear');
  assert(STATS.every(k => old.stats[k] === Math.max(2, Math.round(stats0[k] * 0.8))) && old.hp === maxHp(old) && old.story.some(x => x.t.includes('Smuggled')), 'and worn down by the road');
  assert(G.roster.length === (G.dynasty.boons.includes('third') ? 4 : 3) && new Set(G.roster.map(g => g.id)).size === G.roster.length && !badNumber(G), 'he joins the heir\'s own fighters');
  assert(G.houses.length === 5 && G.market.length >= 4 && G.smith.stock.length === 4 && G.log.some(l => l.t.includes('heir')), 'the world is made anew');
  // every boon starts a working ludus and does what it says
  for (const b of Object.keys(BOONS)) {
    const D2 = newDynasty(); D2.gen = 2; D2.boons = [b]; newGame(D2);
    assert(G.roster.length === (b === 'third' ? 3 : 2) && !badNumber(G), b + ': the ludus starts');
    if (b === 'doctore' || b === 'cook' || b === 'scout' || b === 'medicus') assert(G.staff[b] && G.staff[b].wage === 0, b + ': unpaid staff from the first day');
    if (b === 'magistrate' || b === 'guild' || b === 'temple') assert(G.patrons[b] === (b === 'magistrate' ? 40 : 30), b + ': favour');
    if (b === 'grain') assert(foodCost() === 2 * (RATIONS[1].cost - 1), 'grain: cheaper rations');
    if (b === 'blade') assert(G.roster[0].gear.weapon.r === 3, 'blade: a C weapon');
    if (b === 'panoply') assert(G.roster[0].gear.weapon.r === 4 && G.armoury.some(it => it.slot === 'chest' && it.r === 4), 'panoply: a B weapon and cuirass');
    if (b === 'veteran') assert(G.roster[0].rank === 1 && G.roster[0].perkPending === 1, 'veteran: a rank and a perk');
    if (b === 'bargain') { const it = makeItem('chest', 4); assert(buyPrice(it) < itemPrice(it) && buyPrice(it) >= itemPrice(it) * 0.8, 'bargain: cheaper forge'); }
    if (b === 'heirblood') { assert(G.roster.every(g => g.traits.includes('heirblood')), 'heirblood: starters'); const m = welcome(makeGladiator(20)); assert(m.traits.includes('heirblood') && m.hp === maxHp(m), 'heirblood: newcomers'); }
    for (let i = 0; i < 12; i++) { G.denarii = 500; endDay(); G.pendingEvent = null; }
    assert(!G.ruin && !G.over && !badNumber(G), b + ': twelve days pass without trouble');
  }
  // every ledger entry at every level
  const D3 = newDynasty(); D3.gen = 3; for (const k of Object.keys(LEGACY_TREE)) D3.tree[k] = LEGACY_TREE[k].cost.length;
  newGame(D3);
  assert(G.denarii === 400 && G.fame === 50 && G.fac.barracks === 1 && G.fac.ground === 1 && G.smith.level === 1 && graceDays() === 7 && tier() === 0, 'a full ledger gives every advantage');
  assert(Object.keys(LEGACY_TREE).every(k => legacyCost(k) === null && typeof LEGACY_TREE[k].desc(1) === 'string'), 'and nothing more can be bought');
  // paying the debt off in time
  G = JSON.parse(snap); G.ruin = null; G.dynasty = newDynasty(); G.debtDays = 2; G.denarii = 1000; endDay();
  assert(G.debtDays === 0 && !G.ruin, 'climbing out of debt resets the count');
  // losing every fighter with no money is still the end
  newGame(); G.roster = []; G.denarii = 0; endDay();
  assert(G.over === 'empty' && !G.ruin, 'an empty ludus with an empty purse still ends the campaign');
}));

test('equipment: blacksmith, armoury, and what the pieces do', () => game()(function () {
  newGame();
  const [a, b] = G.roster;
  assert(G.smith.level === 0 && G.smith.stock.length === 4 && G.armoury.length === 0 && SLOTS.every(s => a.gear[s] === null), 'a village smith with four pieces, and nobody wearing anything');
  assert(G.smith.stock.every(it => it.r <= 2), 'a village smith sells nothing better than D');
  // buying, equipping, swapping, selling
  G.denarii = 10000;
  const helm = makeItem('head', 3), better = makeItem('head', 5), blade = makeItem('weapon', 4, a.cls), wrong = makeItem('weapon', 4, Object.keys(CLASSES).find(c => c !== a.cls));
  G.smith.stock = [helm, better, blade, wrong];
  const money = G.denarii;
  assert(buyItem(helm.id) && G.denarii === money - itemPrice(helm) && G.armoury.includes(helm) && !G.smith.stock.includes(helm), 'buying moves a piece to the armoury');
  [better, blade, wrong].forEach(it => buyItem(it.id));
  const bare = power(a), hp0 = createBattle([a], [b], { noIntro: true }).fighters[0];
  assert(equip(a, helm.id) && a.gear.head === helm && !G.armoury.includes(helm), 'equipping takes it from the armoury');
  assert(equip(a, better.id) && a.gear.head === better && G.armoury.includes(helm), 'swapping returns the old piece');
  assert(!equip(a, wrong.id) && equip(a, blade.id), 'a weapon only fits its own fighting style');
  const f = createBattle([a], [b], { noIntro: true }).fighters[0];
  assert(f.dmg > hp0.dmg + 4 && f.armor > hp0.armor && f.stunRes > 0.4 && f.critRes > 0.05 && power(a) > bare * 1.15, 'kit makes him hit harder and take less');
  assert(unequip(a, 'head') && a.gear.head === null && G.armoury.includes(better), 'taking a piece off returns it');
  const m2 = G.denarii; assert(sellItem(helm.id) && G.denarii === m2 + Math.round(itemPrice(helm) / 2) && !G.armoury.includes(helm), 'selling back pays half');
  // every slot does what it says
  for (const slot of ARMOR_SLOTS) { const z = itemStats(makeItem(slot, 6)), lo = itemStats(makeItem(slot, 0)); assert(z.armor > lo.armor && z.armor > 0, slot + ' protects, and more at S than F'); }
  assert(itemStats(makeItem('chest', 4)).armor > itemStats(makeItem('head', 4)).armor * 1.9, 'the cuirass protects most');
  assert(itemStats(makeItem('legs', 6)).hamRes > 0.7 && itemStats(makeItem('arms', 6)).armRes > 0.7 && itemStats(makeItem('shoulders', 6)).bleedRes > 0.7, 'each small piece guards against its wound');
  assert(SLOTS.every(s => typeof itemEffect(makeItem(s, 3, a.cls)) === 'string' && !/NaN|undefined/.test(itemEffect(makeItem(s, 3, a.cls)))), 'every piece can describe itself');
  // gear comes home when a fighter leaves
  equip(a, better.id);
  const n = G.armoury.length;
  G.roster = G.roster.filter(x => x !== a); departed(a, 'dead', null);
  assert(G.armoury.length === n + 2 && G.armoury.includes(blade) && G.armoury.includes(better), 'a dead man\'s kit returns to the armoury');
  // upgrading the forge
  G.denarii = 10000;
  for (let lv = 1; lv <= 4; lv++) { assert(upgradeSmith() && G.smith.level === lv, 'forge improves'); genSmith(); assert(G.smith.stock.length === 4 + lv && G.smith.stock.every(it => SMITH_ODDS[lv][it.r] > 0), 'stock matches the smith at level ' + lv); }
  assert(!upgradeSmith(), 'the forge has a top level');
  let s = 0; for (let i = 0; i < 60; i++) { genSmith(); s += G.smith.stock.filter(it => it.r === 6).length; }
  assert(s > 20, 'an imperial armourer does offer S pieces');
  assert(SMITH_ODDS.every(row => row.reduce((x, y) => x + y, 0) === 100) && !badNumber(G), 'rarity odds add up');
}));

test('fighter stories: bonds, grief, vows and promises', () => game()(function () {
  newGame();
  while (G.roster.length < 4) G.roster.push(makeGladiator(25));
  const [a, b, c, d] = G.roster;
  assert(makeBond(a, b, 'friend') && !makeBond(a, b, 'rival') && makeBond(a, c, 'rival') && !makeBond(a, d, 'friend'), 'bonds form once, two per fighter at most');
  assert(bondsOf(a).length === 2 && bondsOf(b)[0].other === a && a.story.some(s => s.t.includes(b.name)), 'bonds are recorded on both men');
  // friends hit harder together; rivals fight worse together
  a.traits = a.traits.filter(t => t !== 'duelist' && t !== 'shieldmate');      // perks that tell alone from in company would cloud it
  const solo = createBattle([a], [makeGladiator(25)], { noIntro: true }).fighters[0].dmg;
  const B2 = createBattle([a, b], [makeGladiator(25), makeGladiator(25)], { noIntro: true });
  assert(B2.fighters[0].dmg > solo * 1.05, 'a friend at his side makes him hit harder');
  // a friend's death: grief and a vow against the killer
  const killer = G.houses[0].roster[0], m0 = b.morale;
  G.roster = G.roster.filter(x => x !== a); departed(a, 'dead', killer);
  assert(b.morale === m0 - 20 && b.wish && b.wish.type === 'avenge' && b.wish.gid === killer.id && wishTarget(b) === killer, 'the survivor swears vengeance');
  assert(!G.bonds.some(x => x.a === a.id || x.b === a.id) && isWanted(killer), 'the dead man leaves no bonds, and his killer is marked');
  // the wanted rival is never dropped or killed off-stage, and turns up on a card
  let offered = 0;
  for (let i = 0; i < 40; i++) { G.day = 5; genBouts(); assert(wishTarget(b) === killer, 'the wanted rival must survive between games'); if (G.bouts.some(x => x.vow === b.id)) offered++; }
  assert(offered > 10 && offered < 38, 'the vow should often but not always reach a card, got ' + offered + ' of 40');
  // settling the vow
  const vb = createBattle([b], [killer], { noIntro: true });
  assert(vb.fighters[0].hate === vb.fighters[1], 'he knows his enemy in the arena');
  vb.fighters[1].down = true; vb.fighters[1].hp = 0; vb.fighters[1].downedBy = vb.fighters[0]; vb.fighters[1].fate = 'dead'; vb.over = true; vb.winner = 0; vb.time = 10;
  const r = applyBoutResult({ id: 1, size: 1, death: true, house: 'X', houseId: G.houses[0].id, purse: 10, fame: 5 }, vb, 0, 1);
  assert(r.win && !b.wish && r.lines.some(l => l.includes('avenged')) && b.story.some(s => s.t.includes('Avenged')), 'the vow is settled and remembered');
  // a promise of freedom falls due after the victories
  c.promise = { at: c.wins + 1 }; G.pendingEvent = null;
  const pb = createBattle([c], [makeGladiator(20)], { noIntro: true });
  pb.fighters[1].down = true; pb.fighters[1].hp = 0; pb.fighters[1].fate = 'spared'; pb.over = true; pb.winner = 0; pb.time = 10;
  applyBoutResult({ id: 2, size: 1, death: false, house: 'X', purse: 10, fame: 5 }, pb, 0, 1);
  assert(G.pendingEvent && G.pendingEvent.id === 'promiseDue' && G.pendingEvent.c.g === c.id, 'the promise comes due');
  const fame = G.fame, n = G.roster.length;
  EVENTS.promiseDue.opts[0].run(G.pendingEvent.c);
  assert(G.roster.length === n - 1 && G.fame > fame && !G.roster.includes(c), 'keeping your word frees him and earns fame');
  assert(Object.keys(EVENTS).every(id => !EVENTS[id].auto || id === 'promiseDue' || id === 'quest' || id === 'errandOffer' || id === 'errandThanks' || EVENTS[id].field || EVENTS[id].wild || id === 'eagleHome' || Object.values(QUESTS).some(Q => Q.finale === id)) && !badNumber(G), 'only promises and matters from the road are raised outside the daily roll');
}));

test('contracts: terms, a name for good work, and asking around', () => game()(function () {
  newGame(); G.denarii = 500;
  assert(Object.keys(CONTRACTS).length >= 18, 'eighteen kinds of work');
  const mk = () => { const c = makeContract('caravan', 0); c.size = 1; c.days = 3; c.need = 1; G.contracts.push(c); return c; };
  // an advance: a third now, a third later
  let c = mk(), g = G.roster[0], d0 = G.denarii, T = contractTerms(c, 'advance');
  assert(T.now > 0 && T.now + T.pay < c.pay, 'an advance gives up part of the pay');
  assert(sendContract(c.id, [g.id], 'advance') && G.denarii === d0 + T.now && G.jobs[0].pay === T.pay && G.jobs[0].terms === 'advance', 'the advance is paid on the day');
  G.jobs[0].edge = 9; G.jobs[0].eventDay = 0; const r0 = workRep();
  for (let i = 0; i < 4 && G.jobs.length; i++) { endDay(); G.pendingEvent = null; G.eventQueue = []; }
  assert(!G.jobs.length && workRep() > r0, 'good service makes a name: ' + workRep());
  // provisions cost now and better the odds; hazard pay is only for dangerous work
  G.day = 2; g.away = null; g.injury = 0; G.denarii = 500; c = mk(); T = contractTerms(c, 'provision'); d0 = G.denarii;
  assert(T.cost > 0 && sendContract(c.id, [g.id], 'provision') && G.denarii === d0 - T.cost && G.jobs[0].edge === 0.08, 'provisions are bought and help');
  assert(contractTerms({ type: 'tutor', pay: 100, favor: 4 }, 'hazard').pay === 100 && contractTerms({ type: 'pitfight', pay: 100, favor: 4 }, 'hazard').pay === 130, 'hazard pay only where there is hazard');
  // a house with a name is paid more and offered more
  G.workRep = 0; const p0 = makeContract('tutor', 0).pay / 1; G.workRep = 100;
  let more = 0; for (let i = 0; i < 30; i++) { G.workRep = 0; const a = makeContract('granary', 0); G.workRep = 100; const b = makeContract('granary', 0); if (b.pay / b.days / (0.6 + 0.5 * b.diff) > a.pay / a.days / (0.6 + 0.5 * a.diff)) more++; }
  assert(more >= 27 && workOffers(0, 0) === 3 && workOffers(0, 40) === 4 && workOffers(2, 90) === 6, 'a name for good work pays');
  // asking around turns up one more offer, once
  G.workRep = 0; G.jobs = []; G.roster.forEach(x => { x.away = null; }); genContracts(); const n = G.contracts.length; G.denarii = 500;
  assert(askAround() && G.contracts.length === n + 1 && askAroundBlock() && !askAround(), 'one more offer, once between games');
  assert(!badNumber(G), 'contracts left a bad number');
}));

test('contracts: the board, who suits the work, going away and coming home', () => game()(function () {
  newGame();
  assert(G.contracts.length === 3 && G.contracts.every(c => CONTRACTS[c.type].tier === 0 && c.pay > 0 && c.pay % 5 === 0), 'three offers a village lanista can take');
  for (const k in CONTRACTS) {
    const D = CONTRACTS[k];
    assert(Math.abs(STATS.reduce((s, x) => s + (D.w[x] || 0), 0) - 1) < 1e-9, k + ' stat weights add to one');
    assert(PATRONS[D.patron] && D.events.every(e => FIELD_EVENTS[e]) && D.likes.concat(D.hates, D.trait || []).every(t => TRAITS[t]), k + ' names real patrons, events and traits');
    assert(typeof D.text({ land: 'Gaul' }) === 'string' && D.win('X').length > 10 && D.fail('X').length > 10, k + ' has its words');
  }
  // suitability: the right style, trait and homeland all help; misery hurts
  const a = makeGladiator(24, { cls: 'murmillo' }), b = makeGladiator(24, { cls: 'retiarius' });
  STATS.forEach(s => { a.stats[s] = b.stats[s] = 6; }); a.traits = []; b.traits = []; a.origin = 'Gaul'; b.origin = 'Syria';
  const D = CONTRACTS.bodyguard, base = aptitude(b, D, null).score;
  assert(aptitude(a, D, null).score > base, 'a murmillo makes the better bodyguard');
  b.traits = ['watchful']; assert(aptitude(b, D, null).score > base, 'a liked trait helps');
  b.traits = ['nervous']; assert(aptitude(b, D, null).score < base, 'a hated trait hurts');
  b.traits = []; assert(aptitude(b, D, 'Syria').score > base, 'so does knowing the country');
  b.morale = 10; assert(aptitude(b, D, null).score < base && flightRisk(b), 'a broken man is worse at it, and may run');
  b.traits = ['atpeace']; assert(!flightRisk(b), 'a man at peace never runs');
  // going away
  const g = G.roster[0], c = G.contracts[0], food = foodCost();
  c.size = 1; c.days = 3; c.type = 'tutor'; c.patron = 'magistrate'; c.need = 1; c.asked = false;
  assert(!sendContract(c.id, []) && !sendContract(c.id, [g.id, G.roster[1].id]), 'needs exactly the men it asks for');
  g.injury = 2; assert(!sendContract(c.id, [g.id]), 'an injured man cannot go'); g.injury = 0;
  assert(sendContract(c.id, [g.id]) && g.away && G.jobs.length === 1 && G.contracts.length === 2, 'he leaves and the offer comes off the board');
  assert(!canFight(g) && !canSend(g) && foodCost() < food && !fit().includes(g), 'while away he cannot fight, be sent again, or eat');
  const before = JSON.stringify(g.stats) + g.fatigue;
  g.activity = 'str'; endDay(); G.pendingEvent = null; G.eventQueue = [];
  assert(g.away && JSON.stringify(g.stats) + g.fatigue === before, 'he does not train while away');
  const coin = G.denarii, fav = G.patrons.magistrate, pay = G.jobs[0].pay, fv = G.jobs[0].favor;
  G.jobs[0].edge = 9; G.jobs[0].eventDay = 0;                 // cannot fail
  endDay(); G.pendingEvent = null; G.eventQueue = []; endDay();
  assert(!g.away && !G.jobs.length && G.reports.length === 1 && /denarii/.test(G.reports[0].html), 'he comes home on the day, with a report');
  assert(G.patrons.magistrate >= fav + fv - 1 && G.denarii > coin - 100 + pay - 1 && g.xp === 1, 'paid in silver, favour and a little experience');
  // failure, wounds, death and desertion
  let hurt = 0, dead = 0, ran = 0;
  for (let i = 0; i < 300; i++) {
    newGame(); G.fame = 150; genContracts();
    const m = G.roster[0], o = G.roster[1], x = G.contracts[0];
    Object.assign(x, { type: 'beasthunt', size: 2, patron: 'magistrate', need: 99, land: 'Gaul', asked: i % 2 === 0 });
    if (i % 3 === 0) m.morale = 5;
    const f0 = G.patrons.magistrate, d0 = G.denarii, n0 = G.armoury.length;
    assert(sendContract(x.id, [m.id, o.id]), 'the hunt sets out');
    G.jobs[0].edge = -9; finishJob(G.jobs[0]);
    assert(G.patrons.magistrate < f0 && G.denarii === d0, 'a failed contract pays nothing and costs favour');
    if (!G.roster.includes(m) && G.fallen.length && G.fallen.some(z => z.name === m.name)) dead++;
    else if (!G.roster.includes(m)) { ran++; assert(G.armoury.length === n0, 'a deserter takes his kit'); }
    else if (m.injury > 0) { hurt++; assert(m.scars.length > 0, 'a wound leaves a scar'); }
    assert(G.roster.every(z => !z.away) && !badNumber(G), 'everyone left is home');
  }
  assert(hurt > 20 && dead > 0 && ran > 5, 'deadly work that fails wounds, kills and loses men: ' + [hurt, dead, ran]);
  // an offer made by name costs favour if ignored
  newGame(); G.contracts[0].asked = true; const f1 = G.patrons[G.contracts[0].patron], who = G.contracts[0].patron;
  genContracts();
  assert(G.patrons[who] === f1 - 3, 'ignoring a patron who asked by name costs favour');
  return [hurt, dead, ran].join('/') + ' hurt/dead/fled of 300 failed hunts';
}));

test('contracts: a living, not a road to glory; and work can be done well, or half done', () => game()(function () {
  assert(Object.keys(CONTRACTS).length === 22 && ['vintage', 'pyre', 'runaway', 'taxchest'].every(k => CONTRACTS[k] && CONTRACTS[k].events.every(e => FIELD_EVENTS[e])), 'twenty-two kinds of work');
  assert(JOB_XP === 1 && JOB_PROG <= 0.15, 'work away teaches little');
  // the fame of it: a third or less of what a show used to be worth, at every standing
  for (const k in CONTRACTS) { const D = CONTRACTS[k]; if (!D.fame) { assert(contractFame(D) === 0, k + ' is not talked of'); continue; }
    newGame(); const low = contractFame(D); G.fame = 5000; const high = contractFame(D);
    assert(D.fame <= 3 && low === D.fame && high <= D.fame * 3 && high >= low, k + ' is worth ' + low + ' to ' + high + ' fame'); }
  const go = edge => { newGame(); G.fame = 0; const c = makeContract('procession', 0); c.days = 2; G.contracts.push(c); const g = G.roster[0];
    assert(sendContract(c.id, [g.id]), 'sent'); const J = G.jobs[0]; J.eventDay = 0; if (edge != null) J.edge = edge; const pay = J.pay, prog = JSON.stringify(g.prog), money = G.denarii, fav = G.patrons[J.patron];
    finishJob(J); return { g, J, pay, money, fav, moved: JSON.stringify(g.prog) !== prog || true }; };
  // done: one point of experience, two or so of fame, and the pay
  { let wellSeen = 0, plain = 0; for (let i = 0; i < 60; i++) { const r = go(9); assert(r.g.xp === 1 && G.fame === contractFame(CONTRACTS.procession) && G.fame <= 3, 'a procession: 1 experience, ' + G.fame + ' fame');
      if (G.denarii === r.money + r.pay) plain++; else { assert(G.denarii === r.money + r.pay + Math.max(5, round5(r.pay * 0.15)) && G.patrons[r.J.patron] >= r.fav, 'better than asked: fifteen parts in a hundred over'); wellSeen++; } }
    assert(wellSeen > 5 && plain > 5, 'well-suited men sometimes do better than was asked: ' + wellSeen + ' of 60'); }
  // failed outright: nothing learned, nothing paid
  { const r = go(-9); assert(r.g.xp === 0 && G.denarii === r.money && G.fame === 0 && G.patrons[r.J.patron] < r.fav, 'a failure teaches nothing and pays nothing'); }
  // a near thing: half the pay, and the patron says no more about it
  { let halves = 0; for (let i = 0; i < 400; i++) { newGame(); const c = makeContract('procession', 0); c.days = 2; G.contracts.push(c); const g = G.roster[0]; sendContract(c.id, [g.id]); const J = G.jobs[0]; J.eventDay = 0;
      J.edge = -jobOdds(CONTRACTS.procession, J.need, [g], 0, J.land) + 0.0;      // the odds brought to nothing: it cannot succeed, but one time in eight it is a near thing
      const money = G.denarii, fav = G.patrons[J.patron], pay = J.pay; finishJob(J);
      if (G.denarii === money + round5(pay * 0.5)) { halves++; assert(G.patrons[J.patron] === fav && g.xp === 0, 'half done: half paid, no favour either way'); } else assert(G.denarii === money, 'or not paid at all'); }
    assert(halves > 20 && halves < 90, 'about one failure in eight is a near thing: ' + halves + ' of 400'); }
}));

test('contracts: word from the road is uncommon, never two days running, and not the same thing over again', () => game()(function () {
  newGame();
  assert(Object.keys(FIELD_EVENTS).length === 20 && Object.keys(FIELD_EVENTS).filter(id => FIELD_EVENTS[id].fits).length === 11, 'twenty things can happen on the road, eleven of them on more than one kind of work');
  // every kind of work has a good many things that can come up on it
  for (const k in CONTRACTS) { const n = (CONTRACTS[k].events || []).concat(Object.keys(FIELD_EVENTS).filter(id => FIELD_EVENTS[id].fits && FIELD_EVENTS[id].fits(CONTRACTS[k]))).filter((id, i, all) => all.indexOf(id) === i).length; assert(n >= 9, k + ' has only ' + n + ' things that can happen on it'); }
  // fewer than half of outings bring any word at all
  { let n = 0; const J = {}; for (let i = 0; i < 2000; i++) { planEvent(J, CONTRACTS.caravan, 4); if (J.eventDay) n++; } assert(n > 600 && n < 1000, 'about two outings in five: ' + n + ' of 2000'); }
  // one outing after another: nothing comes up twice within eight, and never within three days of the last
  G.contracts[0].type = 'caravan'; G.contracts[0].size = 1; G.contracts[0].patron = 'guild'; G.contracts[0].land = 'Gaul';
  assert(sendContract(G.contracts[0].id, [G.roster[0].id]), 'a man is sent out');
  const J = G.jobs[0], got = [];
  for (let i = 0; i < 40; i++) { G.day += 3; const id = fieldEventFor(J); assert(id && FIELD_EVENTS[id], 'something comes up'); assert(!got.slice(-8).includes(id), id + ' came up again too soon: ' + got.slice(-8)); got.push(id); G.fieldSeen = (G.fieldSeen || []).concat(id).slice(-FIELD_MEMORY); G.fieldLast = G.day; assert(!fieldEventFor(J), 'nothing more the same day'); G.day++; assert(!fieldEventFor(J), 'nor the day after'); }
  assert(new Set(got).size >= 12, 'a grain caravan sees a dozen different things: ' + new Set(got).size);
  // through the morning's own reckoning, too
  G.fieldLast = 0; G.fieldSeen = []; G.pendingEvent = null; G.eventQueue = []; J.end = G.day + 50; J.eventDay = G.day; jobsTick();
  const first = G.pendingEvent; assert(first && FIELD_EVENTS[first.id] && G.fieldLast === G.day && G.fieldSeen.length === 1, 'the morning brings word, and it is remembered');
  G.pendingEvent = null; G.day++; J.eventDay = G.day; jobsTick(); assert(!G.pendingEvent, 'and none the next morning');
}));

test('journeys: asked for, promised, and ended at a place in the province', () => game()(function () {
  newGame();
  for (const q in QUESTS) assert(EVENTS[QUESTS[q].finale] && EVENTS[QUESTS[q].finale].opts.length >= 2 && QUESTS[q].where.length > 10 && QUESTS[q].fire(G.roster[0]).length > 60
    && (QUESTS[q].marks ? QUESTS[q].marks.every(m => LANDMARKS.includes(m)) && questSpot(q) : questPlace(q) && wildSites().some(s => s.kind === questPlace(q))), q + ' has an ending and a place');
  assert(Object.keys(QUESTS).length === 8 && Object.keys(QUESTS).filter(q => QUESTS[q].marks).length === 4, 'eight journeys, four of them to a landmark');
  assert(!EVENTS.quest.can(), 'raw recruits have no standing to ask');
  const g = G.roster[0]; g.wins = 4; g.rank = 1; G.tally.wins = 1;
  assert(EVENTS.quest.can(), 'a proven man may ask');
  G.pendingEvent = { id: 'quest', c: { g: g.id, q: 'village' } };
  answerEvent(0);
  const place = wildSites().find(s => s.kind === 'slavers');
  assert(g.quest && g.quest.id === 'village' && !g.away && wildMap().marks[place.id], 'promised: the place is marked on the map');
  assert(!questsFree().includes('village') && !questReady(g) && siteLive(place), 'one journey at a time; its place is waiting');
  // the school walks there, and it comes to a fight
  assert(wildEnter() && G.field, 'the school marches out');
  G.field.x = place.x; G.field.y = place.y;
  assert(wildVisit(place) && G.pendingEvent.id === 'wJourney' && G.pendingEvent.c.g === g.id, 'walking up to it raises his journey');
  const day = G.day;
  answerEvent(0);
  assert(G.field.fight && G.field.fight.win === 'slavers' && G.field.fight.foes.length === 5, 'the slavers stand and fight');
  G.fac.barracks = 3; while (G.roster.length < 8) G.roster.push(welcome(makeGladiator(40)));
  G.roster.forEach(x => { STATS.forEach(k => { x.stats[k] = 20; }); x.hp = maxHp(x); });
  let B = fight(fieldParty(), G.field.fight.foes, { wild: 'camp', hunt: true, mercy: [0.3, 0] });
  let guard = 0; while (B.winner !== 0 && guard++ < 20) { G.roster.forEach(x => { x.hp = maxHp(x); x.injury = 0; }); B = fight(fieldParty(), G.field.fight.foes, { wild: 'camp', hunt: true, mercy: [0.3, 0] }); }
  const r = applyWildResult(B);
  assert(r.win && siteDone(place) && G.day === day + 1 && !G.field.fight, 'won: the place is done and the day has gone');
  assert(byId(g.id) ? G.pendingEvent && G.pendingEvent.id === 'questVillage' : true, 'and it ends in a choice');
  if (byId(g.id)) { answerEvent(0); assert(g.traits.includes('bloodoath') && !g.quest && g.questDone === 'village' && g.grateful && !flightRisk(g), 'he is changed by it, and bound to the house'); }
  // the quiet ones end without a fight
  for (const [q, kind] of [['brother', 'quarry'], ['shrine', 'vow'], ['master', 'master']]) {
    newGame(); G.tally.wins = 1; G.denarii = 5000; G.fac.barracks = 1;
    const k = G.roster[0], n = G.roster.length; k.quest = { id: q, since: 1 }; wildEnter();
    const s2 = wildSites().find(x => x.kind === kind);
    assert(wildVisit(s2), q + ': the place answers'); answerEvent(0);
    assert(G.pendingEvent && G.pendingEvent.id === QUESTS[q].finale && siteDone(s2), q + ': a day there, then the choice');
    answerEvent(0);
    assert(!k.quest && k.questDone === q, q + ' is finished');
    if (q === 'brother') { const bro = G.roster[G.roster.length - 1]; assert(G.roster.length === n + 1 && bro.origin === k.origin && bondBetween(k, bro).type === 'friend' && k.traits.includes('atpeace'), 'his brother swears the oath beside him'); }
  }
  // four more end at a landmark, named when he asks; each of their endings can be chosen
  for (const q of ['grave', 'beast', 'child', 'betrayer']) for (let opt = 0; opt < EVENTS[QUESTS[q].finale].opts.length; opt++) {
    newGame(); G.tally.wins = 1; G.denarii = 5000; G.fac.barracks = 2;
    const k = G.roster[0]; k.wins = 4; k.rank = 1;
    const c = Object.assign({ g: k.id, q }, questSpot(q));
    assert(c.mark && QUESTS[q].marks.includes(c.mark), q + ' names a landmark');
    const asked = EVENTS.quest.text(c); assert(asked.includes(lower(c.mark)) && !/undefined|NaN/.test(asked), q + ' is asked for, by the name of the place: ' + asked);
    G.pendingEvent = { id: 'quest', c }; answerEvent(0);
    const st = wildSites().find(x => x.journey === k.id);
    assert(k.quest && k.quest.mark === c.mark && st && st.x === c.x && st.y === c.y && siteLive(st) && siteShown(st) && wildMap().marks[st.id] && questWhere(k).includes(lower(c.mark)) && SITE_EVENT[st.kind] === 'wJourney', q + ': promised, and the landmark is marked');
    assert(!questsFree().includes(q) && wildEnter(), 'the school marches out');
    // the night before, he will say what it is; a lanista who has listened pays a quarter less at the end
    assert(EVENTS.wFireside.can(), 'he sits apart from the fire'); G.pendingEvent = { id: 'wFireside', c: EVENTS.wFireside.make() };
    const said = answerEvent(0); assert(k.quest.heard && !EVENTS.wFireside.can() && said.length > 120 && !/undefined|NaN/.test(said), q + ': he says what it is: ' + said);
    const full = round5(80 + tier() * 70), day = G.day;
    assert(wildVisit(st) && G.pendingEvent.id === 'wJourney' && G.pendingEvent.c.g === k.id && !/undefined|NaN/.test(EVENTS.wJourney.text(G.pendingEvent.c)), q + ': walking up to it raises his journey');
    answerEvent(0);
    if (QUESTS[q].foes) { const F = G.field.fight; assert(F && F.win === 'journey' && F.g === k.id && F.foes.length >= 2 && F.foes[0].boss && F.foes.every(f => f.name && f.hp > 0), q + ' comes to a fight');
      G.field.fight = null; const lines = WILD_WINS.journey(F); assert(lines.join(' ').length > 20 && !/undefined|NaN/.test(lines.join(' ')), q + ' is won'); }
    else assert(G.day === day + 1 && !G.field.fight, q + ' takes the day, and no blood');
    assert(G.pendingEvent && G.pendingEvent.id === QUESTS[q].finale && G.pendingEvent.c.cost === round5(full * 0.75), q + ': then the choice, at the price of a man who listened');
    const purse = G.denarii, out = answerEvent(opt);
    assert(typeof out === 'string' && out.length > 40 && !/undefined|NaN/.test(out) && !k.quest && k.questDone && !wildSites().some(x => x.journey) && !wildMap().marks['j' + k.id] && !badNumber(G), q + ' ending ' + opt + ': ' + out);
    if (k.questDone === q) assert(k.grateful && k.morale === 100 && !flightRisk(k), q + ' ending ' + opt + ' binds him to the house');
    if (q === 'grave' && opt === 2) assert(k.traits.includes('twoshares') && TRAITS.twoshares.special, 'he fights for two');
    if (q === 'child' && opt === 1) assert(k.traits.includes('provider') && G.denarii === purse, 'somebody is waiting, and it cost the house nothing');
    if (q === 'betrayer' && opt === 1) assert(G.denarii === purse + round5(full * 0.75) * 2, 'the farm comes to the house');
  }
  // the new marks of a journey tell in a fight
  { newGame(); const a = makeGladiator(30), b = JSON.parse(JSON.stringify(a)), d = JSON.parse(JSON.stringify(a)); a.traits = []; b.traits = ['twoshares']; d.traits = ['provider'];
    const A = createBattle([a], [makeGladiator(30)], { noIntro: true }).fighters[0], B2 = createBattle([b], [makeGladiator(30)], { noIntro: true }).fighters[0], D = createBattle([d], [makeGladiator(30)], { noIntro: true }).fighters[0];
    assert(B2.dmg > A.dmg && B2.acc > A.acc && D.dodge > A.dodge && D.crit > A.crit, 'fights for two hits harder and truer; somebody waiting is harder to hit'); }
  // a place that has been the end of one journey is not promised to another man; and he may be put off once
  newGame(); G.tally.wins = 1; { const k = G.roster[0]; k.wins = 4; k.rank = 1;
    wildMap().done.quarry = 1; assert(!questsFree().includes('brother') && questsFree().includes('village') && questsFree().includes('grave'), 'the quarry gate opens once');
    G.pendingEvent = { id: 'quest', c: { g: k.id, q: 'shrine' } }; const m = k.morale; answerEvent(1);
    assert(!k.quest && !k.questDone && k.morale === m - 3 && !questReady(k), 'put off, he waits');
    G.day += 21; assert(questReady(k), 'and asks again'); }
  // a place with nobody's journey in it says nothing
  newGame(); G.tally.wins = 1; wildEnter();
  assert(!siteLive(wildSites().find(x => x.kind === 'quarry')) && !wildVisit(wildSites().find(x => x.kind === 'quarry')), 'the quarries are only stone to a school with no brother in them');
  // more than one matter can wait for an answer
  newGame(); raiseEvent('feast', EVENTS.feast.make()); raiseEvent('vigil', EVENTS.vigil.make());
  assert(G.pendingEvent.id === 'feast' && G.eventQueue.length === 1, 'the second waits behind the first');
  answerEvent(1); assert(G.pendingEvent.id === 'vigil' && !G.eventQueue.length, 'and is raised when the first is answered');
}));

test('the sand: aiming an ability, setting the side on one man, and holding a charge', () => game()(function () {
  newGame();
  const mk = (cls, stats) => { const g = makeGladiator(30, { cls }); g.stats = stats || { str: 12, agi: 12, skl: 12 }; g.traits = []; g.hp = maxHp(g); g.morale = 60; g.fatigue = 0; return g; };
  const setup = () => { const B = createBattle([mk('murmillo'), mk('thraex')], [mk('murmillo'), mk('thraex'), mk('hoplomachus')], { noIntro: true, ask: true }); return B; };
  const waitPick = B => { let n = 0; while (!B.pick && !B.over && n++ < 20000) { B.fighters.filter(q => q.team === 0).forEach(q => { q.charge = Math.max(q.charge, 99.5); q.hp = q.maxHp; }); stepBattle(B, 1 / 30); } return B.pick; };
  // the fight stops for a charged man; he can be aimed at any foe still standing
  let B = setup(), f = waitPick(B);
  assert(f && f.team === 0 && f.charge >= 100, 'the fight stops for a man of yours');
  const foes = liveFoes(B, f);
  assert(foes.length === 3 && foes.every(o => o.team === 1) && foes[0].x <= foes[2].x, 'the foes still standing, in order');
  const other = foes.find(o => o !== f.target);
  assert(aimAt(B, other) && f.target === other && f.castAt === other && f.retarget > 3, 'he is aimed where he is told');
  assert(!aimAt(B, f) && !aimAt(B, B.fighters.find(q => q.team === 0 && q !== f)) && !aimAt(B, null), 'only at a foe');
  const before = f.target; assert(aimNext(B, 1) && f.target !== before && liveFoes(B, f).includes(f.target), 'the next foe along');
  for (let i = 0; i < 3; i++) aimNext(B, 1); assert(f.target === foes[(foes.indexOf(before) + 4) % 3], 'and round again');
  // the ability lands on the man he was aimed at, not whoever he happened to be fighting
  const strike = f.abl.find(a => a.fx.mult && !a.fx.aoe && !a.fx.net) || f.abl.find(a => a.fx.mult);
  aimAt(B, other); const hp0 = other.hp, othersHp = foes.filter(o => o !== other).map(o => o.hp);
  B.cutins = false; other.dodge = 0; other.block = 0; f.acc = 1;
  assert(pickAbility(B, strike.id) && !B.pick, 'the word is given');
  assert(other.hp < hp0 && foes.filter(o => o !== other).every((o, i) => o.hp === othersHp[i] || strike.fx.aoe), 'the blow falls on the man chosen');
  assert(f.castAt === null && f.target === other, 'and he stays on him');
  // a man down cannot be aimed at
  B = setup(); f = waitPick(B); const dead = liveFoes(B, f)[0]; dead.hp = 0; dead.down = true;
  assert(!aimAt(B, dead) && liveFoes(B, f).length === 2, 'not at a man who is down');
  // the whole side set on one man
  B = setup(); f = waitPick(B); const mark = liveFoes(B, f)[2];
  assert(markFoe(B, mark) && B.marked === mark, 'the side is set on a man');
  B.pick = null; B.ask = false; B.fighters.forEach(q => { q.charge = 0; q.retarget = 0; });
  for (let i = 0; i < 20; i++) stepBattle(B, 1 / 30);
  assert(B.fighters.filter(q => q.team === 0 && !out(q)).every(q => q.target === mark), 'and every one of yours goes for him');
  assert(markFoe(B, mark) && B.marked === null, 'the same again takes it off');
  markFoe(B, mark); mark.hp = 0; mark.down = true; for (let i = 0; i < 3; i++) stepBattle(B, 1 / 30);
  assert(B.marked === null, 'a marked man who falls is marked no longer');
  assert(!markFoe(B, B.fighters.find(q => q.team === 0)), 'your own men cannot be marked');
  // holding: he keeps the charge and fights on, and the fight stops for him again
  B = setup(); f = waitPick(B);
  assert(holdCharge(B) && !B.pick && f.holdT === HOLD_TIME && f.charge >= 100, 'he holds it');
  B.fighters.forEach(q => { if (q !== f) q.charge = 0; });
  let asked = 0, t = 0; while (t < 3.5) { stepBattle(B, 1 / 30); t += 1 / 30; if (B.pick === f) { asked = t; break; } B.fighters.forEach(q => { if (q !== f) q.charge = Math.min(q.charge, 50); q.hp = q.maxHp; }); f.charge = 100; }
  assert(!asked, 'for a while nothing is asked of you');
  while (t < 9 && B.pick !== f) { stepBattle(B, 1 / 30); t += 1 / 30; B.fighters.forEach(q => { if (q !== f) q.charge = Math.min(q.charge, 50); q.hp = q.maxHp; }); f.charge = 100; }
  assert(B.pick === f, 'and then the fight stops for him again');
}));

test('perks: new perks, a craft for each style, another three, and unlearning', () => game()(function () {
  newGame(); G.denarii = 5000; const g = G.roster[0]; g.traits = []; g.rank = 0;
  // the pool: the common perks for anyone, the craft of his style only from Veteranus
  const crafts = Object.keys(TRAITS).filter(t => TRAITS[t].cls), own = classPerk(g);
  assert(crafts.length === 5 && new Set(crafts.map(t => TRAITS[t].cls)).size === 5 && Object.keys(CLASSES).every(c => crafts.some(t => TRAITS[t].cls === c)), 'a craft for each of the five styles');
  assert(TRAITS[own].cls === g.cls && !perkPool(g).some(t => TRAITS[t].cls) && perkPool(g).length >= 24, 'a novice is offered only the common perks');
  g.rank = 2; assert(perkPool(g).filter(t => TRAITS[t].cls).join() === own, 'a Veteranus may be offered his own craft, and nobody else\'s');
  g.rank = 3; g.perkPending = 1; g.perkOffer = null;
  assert(perkOffer(g).length === 3 && perkOffer(g)[0] === own, 'a Primus Palus is always shown it');
  for (const t of ['duelist', 'shieldmate', 'opener', 'finisher', 'fleet', 'ironwill', 'mender', 'quickstudy', 'teacher', 'darling']) assert(perkLearnable(t) && !TRAITS[t].special && perkPool(g).includes(t), t + ' can be learned');
  assert(!perkLearnable('laureate') && !perkLearnable('lazy') && perkLearnable(own), 'what can and cannot be taught');
  // another three: paid once, and different
  const first = perkOffer(g).slice(), d0 = G.denarii;
  assert(!perkRerollBlock(g) && rerollPerk(g) && G.denarii === d0 - perkRerollCost(g) && perkOffer(g).length === 3 && !perkOffer(g).some(t => first.includes(t)), 'three different perks for the price');
  assert(perkRerollBlock(g) && !rerollPerk(g), 'once for each choice');
  const pickd = perkOffer(g)[0]; choosePerk(g, pickd);
  assert(g.traits.includes(pickd) && g.perkPending === 0 && !g.perkRerolled, 'the choice is made');
  // unlearning: paid, once between games, and he chooses again
  const d1 = G.denarii;
  assert(forgetBlock(g, 'laureate') && !forgetBlock(g, pickd) && forgetPerk(g, pickd) && !g.traits.includes(pickd) && g.perkPending === 1 && G.denarii === d1 - forgetCost(g), 'a taught perk is drilled out, and a choice comes back');
  choosePerk(g, perkOffer(g)[0]); assert(forgetBlock(g, g.traits[0]) && !forgetPerk(g, g.traits[0]), 'one man between games');
  // what the new perks do in a fight
  const fig = (traits, cls, n) => { const m = makeGladiator(30, { cls: cls || 'murmillo' }); m.traits = traits; m.stats = { str: 10, agi: 10, skl: 10 }; m.hp = maxHp(m); m.morale = 60; m.fatigue = 0; return makeFighter(m, 0, 0, n || 1); };
  const base = fig([]), base3 = fig([], 'murmillo', 3);
  assert(fig(['opener']).charge === 50 && base.charge === 0, 'first to strike starts half charged');
  assert(Math.abs(fig(['duelist']).dmg / base.dmg - 1.1) < 1e-9 && fig(['duelist'], 'murmillo', 3).dmg === base3.dmg, 'a duelist is better alone, and no better in company');
  assert(Math.abs(fig(['shieldmate'], 'murmillo', 3).dmg / base3.dmg - 1.08) < 1e-9 && fig(['shieldmate'], 'murmillo', 3).resist === 0.08 && fig(['shieldmate']).resist === 0, 'shoulder to shoulder works in company only');
  assert(Math.abs(fig(['fleet']).speed / base.speed - 1.15) < 1e-9 && fig(['fleet']).dodge > base.dodge, 'fleet of foot');
  assert(Math.abs(fig(['ironwill']).stunRes - base.stunRes - 0.3) < 1e-9 && netHold(fig(['ironwill']), 3) < netHold(base, 3), 'iron will');
  assert(Math.abs(fig(['testudo']).block - base.block - 0.08) < 1e-9 && fig(['testudo']).armor === base.armor + 1, 'the tortoise');
  const hop = fig([], 'hoplomachus'), dim = fig([], 'dimachaerus');
  assert(fig(['longreach'], 'hoplomachus').reach === hop.reach + 3 && fig(['twinfury'], 'dimachaerus').atkTime < dim.atkTime && fig(['twinfury'], 'dimachaerus').crit > dim.crit, 'the long spear and twin fury');
  // and away from it
  const net = ABILITIES.retiarius.skl[0], r = makeGladiator(30, { cls: 'retiarius' }); r.traits = ['longnet'];
  assert(Math.abs(abilityFx(r, net).net - Math.round(net.fx.net * 1.25 * 10) / 10) < 1e-9 && abilityFx(r, net).net > net.fx.net * 1.2 && abilityFx(makeGladiator(30, { cls: 'retiarius' }), net) === net.fx, 'a weighted net holds longer');
  const q = makeGladiator(30); q.traits = ['quickstudy']; const ab = ABILITIES[q.cls].str[0]; practise(q, ab.id);
  assert(masteryUses(q, ab.id) === 2, 'a quick study counts each use twice');
  const m1 = makeGladiator(30), m2 = makeGladiator(30); m1.traits = []; m2.traits = ['mender']; m2.stats = Object.assign({}, m1.stats);
  assert(Math.abs(restGain(m2)[0] / restGain(m1)[0] - 1.3) < 1e-9 && Math.abs(restGain(m2)[1] / restGain(m1)[1] - 1.2) < 1e-9, 'quick to mend');
  const [a, b] = G.roster; a.rank = 2; a.activity = 'teach'; a.injury = 0; a.away = false; a.stats.str = 15; b.stats.str = 5; a.traits = [];
  const t0 = teachBonus(b, 'str'); a.traits = ['teacher']; assert(Math.abs(teachBonus(b, 'str') - t0 - 0.15) < 1e-9, 'a born teacher teaches better');
  assert(!badNumber(G), 'perks left a bad number');
}));

test('abilities: mastery grows with use, and a signature comes round sooner', () => game()(function () {
  newGame(); const g = G.roster[0]; g.traits = []; g.stats = { str: 16, agi: 16, skl: 16 }; g.hp = maxHp(g);
  const known = abilitiesKnown(g), ab = ABILITIES[g.cls].str[0], buffAb = Object.values(ABILITIES).flatMap(c => STATS.flatMap(k => c[k])).find(a => a.fx.buff && !a.fx.mult);
  assert(known.length === 9 && masteryRank(g, ab.id) === 0 && abilityFx(g, ab) === ab.fx, 'a new ability is as written');
  // use by use: Practised at 3, Honed at 8, Mastered at 15
  let ups = [];
  for (let i = 1; i <= 16; i++) { const up = practise(g, ab.id); if (up) ups.push([i, up]); }
  assert(JSON.stringify(ups) === JSON.stringify([[3, 1], [8, 2], [15, 3]]) && masteryUses(g, ab.id) === 16 && masteryRank(g, ab.id) === 3, 'ranks come at 3, 8 and 15 uses');
  const x = abilityFx(g, ab);
  assert(x !== ab.fx && Math.abs(x.mult - ab.fx.mult * 1.21) < 1e-9 && ab.fx.mult === ABILITIES[g.cls].str[0].fx.mult, 'mastered, it does a fifth more, and the book is not rewritten');
  if (ab.fx.stun) assert(x.stun > ab.fx.stun, 'and stuns longer');
  // a guard or a fury lasts longer
  const h = makeGladiator(30, { cls: buffAb.cls }); h.mast = { [buffAb.id]: 8 };
  assert(abilityFx(h, buffAb).buff.t > buffAb.fx.buff.t && abilityFx(h, buffAb).buff.t === Math.round(buffAb.fx.buff.t * 1.14 * 10) / 10, 'a honed guard lasts 14% longer');
  assert(abilityTags(ab, g)[0] !== abilityTags(ab)[0], 'the tags show his own figures');
  assert(practise(g, 'blow') === 0 && practise(g, 'nonsense') === 0 && abilityFx(g, BLOW) === BLOW.fx, 'a plain heavy blow is never mastered');
  const beast = makeBeast('lion', 20); assert(abilityFx(beast, BEAST_MOVES.lion) === BEAST_MOVES.lion.fx, 'nor a beast\'s move');
  // the signature: one he carries, and only one
  const carried = abilitiesOf(g), spare = known.find(a => !carried.includes(a));
  assert(!signatureOf(g) && !setSignature(g, spare.id) && setSignature(g, carried[0].id) && signatureOf(g) === carried[0], 'only an ability he carries can be his signature');
  assert(setSignature(g, carried[1].id) && signatureOf(g) === carried[1], 'choosing another moves the mark');
  assert(setSignature(g, carried[1].id) && !signatureOf(g), 'choosing it again takes the mark off');
  // in a fight: a cast counts as a use, and the signature leaves him part charged
  const foe = makeGladiator(20), B = createBattle([g], [foe], { noIntro: true }), f = B.fighters.find(q => q.team === 0);
  setSignature(g, carried[0].id); const u0 = masteryUses(g, carried[0].id), u1 = masteryUses(g, carried[1].id);
  f.charge = 100; castNow(B, f, carried[0]);
  assert(f.charge === SIG_CHARGE && masteryUses(g, carried[0].id) === u0 + 1, 'his signature leaves him at 30, and is one use the better');
  f.charge = 100; castNow(B, f, carried[1]);
  assert(f.charge === 0 && masteryUses(g, carried[1].id) === u1 + 1, 'any other leaves him at nothing');
  // sparring works at them too
  G.staff.doctore = { name: 'd', skill: 1, wage: 0 }; g.activity = 'spar'; g.fatigue = 0; const total = () => Object.values(g.mast).reduce((a, b) => a + b, 0), t0 = total();
  for (let i = 0; i < 40; i++) { g.fatigue = 0; g.injury = 0; endDay(); if (G.pendingEvent) G.pendingEvent = null; }
  assert(total() > t0 && total() < t0 + 25, 'forty days of sparring is a handful of uses, got ' + (total() - t0));
  assert(!badNumber(G), 'abilities left a bad number');
}));

test('training: teachers, sparring partners, the doctore\'s choice, and great days', () => game()(function () {
  const fresh = () => { newGame(); while (G.roster.length < 4) G.roster.push(makeGladiator(25)); G.day = 2; G.staff.doctore = { name: 'd', skill: 1, wage: 0 }; G.roster.forEach(g => { g.fatigue = 0; g.hp = maxHp(g); g.morale = 40; g.injury = 0; g.rank = 0; g.stats = { str: 6, agi: 6, skl: 6 }; g.prog = { str: 0, agi: 0, skl: 0 }; g.pot = { str: 1, agi: 1, skl: 1 }; g.traits = []; }); G.bonds = []; return G.roster; };
  // a teacher: only a veteran, only where he is clearly better, and only the best counts
  let [a, b, c, d] = fresh();
  a.activity = 'teach'; b.activity = 'str'; c.activity = 'str';
  assert(!canTeach(a) && teachers().length === 0 && teachBonus(b, 'str') === 0, 'a novice has nothing to teach');
  a.rank = 2; a.stats.str = 12;
  assert(teachers().length === 1 && Math.abs(teachBonus(b, 'str') - 0.3) < 1e-9 && teachBonus(b, 'agi') === 0 && teachBonus(a, 'str') === 0, 'a veteran teaches what he is better at, and not himself');
  d.activity = 'teach'; d.rank = 4; d.stats.str = 14;
  assert(Math.abs(teachBonus(b, 'str') - 0.4) < 1e-9, 'the best teacher counts, and only he');
  d.activity = 'rest'; b.stats.str = 11; assert(teachBonus(b, 'str') === 0, 'no use teaching a man nearly as good');
  // taught men learn faster; the teacher learns nothing and barely tires
  [a, b, c, d] = fresh(); a.rank = 2; a.stats.str = 12; a.activity = 'teach'; b.activity = 'str'; c.activity = 'rest'; d.activity = 'rest';
  const alone = (() => { const [p, q] = fresh(); q.activity = 'str'; endDay(); return q.prog.str; })();
  [a, b, c, d] = fresh(); a.rank = 2; a.stats.str = 12; a.activity = 'teach'; b.activity = 'str';
  endDay();
  assert(Math.abs(b.prog.str - alone * 1.3) < 1e-6, 'a pupil learns 30% faster, got ' + b.prog.str + ' against ' + alone);
  assert(a.prog.str === 0 && a.fatigue <= 3 && a.activity === 'teach', 'the teacher drills nothing and barely tires');
  a.rank = 0; endDay(); assert(a.activity === 'rest', 'a man who cannot teach is stood down');
  // sparring: better against a stronger man, worse alone
  [a, b, c, d] = fresh(); a.activity = 'spar';
  assert(sparBonus(a) === 0.85, 'alone');
  b.activity = 'spar'; assert(sparBonus(a) === 1 && sparBonus(b) === 1, 'with an equal');
  b.stats.str = 12; assert(sparBonus(a) === 1.15 && sparBonus(b) === 1, 'with a better man');
  // great days: never in poor spirits, sometimes in good
  assert(breakChance({ morale: 40 }) === 0 && Math.abs(breakChance({ morale: 100 }) - 0.07) < 1e-9 && breakChance({ morale: 75 }) > 0.03, 'the chance of a great day');
  let great = 0;
  for (let i = 0; i < 300; i++) { const [p, q] = fresh(); q.activity = 'str'; q.morale = 100; G.ration = 2; endDay(); const got = q.prog.str + (q.stats.str > 6 ? needProg(6) : 0), usual = alone * (0.75 + 100 / 250) / (0.75 + 40 / 250); if (got > usual * 1.8) great++; }
  assert(great >= 5 && great <= 50, 'a great day now and then, got ' + great + ' in 300');
  // the doctore's choice
  [a, b, c, d] = fresh();
  a.pot = { str: 0.8, agi: 1.4, skl: 1 }; assert(doctorePick(a) === 'agi', 'he drills a man at what he learns fastest');
  a.stats.agi = 20; assert(doctorePick(a) === 'skl', 'and moves on when that can go no higher');
  b.pot = { str: 1, agi: 1.05, skl: 1 }; assert(doctorePick(b) === 'spar', 'a man with no better skill spars');
  a.fatigue = 70; assert(doctorePick(a) === 'rest', 'a tired man rests');
  a.fatigue = 0; a.injury = 2; assert(doctorePick(a) === 'rest', 'and a hurt one');
  a.injury = 0; a.stats = { str: 20, agi: 20, skl: 20 }; a.hp = maxHp(a); assert(doctorePick(a) === 'rest', 'a novice with nothing left to learn rests'); a.rank = 3; assert(doctorePick(a) === 'teach', 'and a veteran teaches');
  G.day = 4; c.fatigue = 30; c.pot = { str: 1.5, agi: 1, skl: 1 }; assert(daysToGames() === 1 && doctorePick(c) === 'rest', 'the day before the games he rests the weary');
  // left to the doctore: set each morning; and taken back without one
  [a, b, c, d] = fresh(); a.auto = true; a.pot = { str: 1.5, agi: 1, skl: 1 }; a.activity = 'rest';
  endDay(); assert(a.auto && a.activity === 'str', 'the doctore sets his work for the morning');
  a.fatigue = 80; endDay(); assert(a.activity === 'rest', 'and rests him when he is spent');
  delete G.staff.doctore; a.fatigue = 0; endDay(); assert(!a.auto, 'no doctore, no doctore\'s choice');
  assert(!badNumber(G), 'training left a bad number');
}));

test('the annals: deeds, records, the years, and those who left', () => game()(function () {
  newGame(); while (G.roster.length < 4) G.roster.push(makeGladiator(30));
  assert(new Set(DEEDS.map(D => D.id)).size === DEEDS.length && DEEDS.every(D => D.name && D.what && (D.done || D.at)), 'every deed is named and can be judged');
  assert(checkDeeds().length === 0 && deedCount() === 0, 'nothing is done on the first morning');
  DEEDS.forEach(D => { if (D.at) { const a = D.at(); assert(a.length === 2 && a[0] >= 0 && a[1] > 0 && !a.some(isNaN), D.id + ' counts towards something'); } assert(deedDone(D) === false, D.id + ' is not done at the start'); });
  // a bout won: the first deed, and the book of records opened
  G.day = 5; genBouts();
  const b = G.bouts[0], g = G.roster[0], B = fight([g], [boutEnemies(b)[0]]); B.winner = 0; B.fighters.forEach(f => { if (f.team === 0) f.fate = null; });
  const legacy0 = legacyScore(), r = applyBoutResult(b, B, 0, 1);
  assert(G.deeds.win1 === G.day && deedCount() === 1 && r.lines.some(l => /First blood/.test(l)), 'the first victory is a deed, and the report says so');
  assert(legacyScore() >= legacy0 + 2, 'a deed is a point of legacy, on top of the victory');
  const R = G.records;
  assert(R.purse.v === r.purse && R.purse.who === g.name && R.fame.v === r.fameGain && R.quick.v > 0 && R.long.v > 0 && R.purse.day === G.day, 'the records are opened');
  assert(!setRecord('purse', R.purse.v - 5, 'x', 'y', true) && setRecord('purse', R.purse.v + 5, 'x', 'y', true) && G.records.purse.who === 'x', 'only a better figure is written in');
  assert(!setRecord('quick', R.quick.v + 5, 'x', 'y', false) && setRecord('quick', 1, 'x', 'y', false), 'a quicker win beats a slower one');
  assert(checkDeeds().length === 0, 'a deed is done once');
  // counted deeds, and deeds of state
  G.tally.wins = 10; G.bestStreak = 5; G.denarii = 2500; G.smith.level = 4;
  const got = checkDeeds().map(D => D.id);
  assert(['win10', 'run5', 'rich', 'forge'].every(k => got.includes(k)) && !got.includes('win50'), 'what has been reached is marked, and no more');
  G.denarii = 100; assert(G.deeds.rich, 'and stays marked');
  // those who left alive are remembered
  const gone = G.roster[2]; G.roster = G.roster.filter(x => x !== gone); departed(gone, 'freed');
  assert(G.alumni.length === 1 && G.alumni[0].name === gone.name && G.alumni[0].why === 'freed' && checkDeeds().some(D => D.id === 'freed'), 'a man freed is on the roll, and it is a deed');
  const dead = G.roster[2]; G.roster = G.roster.filter(x => x !== dead); departed(dead, 'dead');
  assert(G.alumni.length === 1, 'the dead are not among those who left');
  // the years: a line for each games day
  G.bouts.forEach(x => { x.done = true; }); G.day = 9; endDay();
  assert(G.annals.length === 1 && G.annals[0].d === 10 && G.annals[0].f === G.fame && G.annals[0].w === G.tally.wins, 'the games day is written into the years');
  endDay(); assert(G.annals.length === 1, 'and only games days');
  assert(!badNumber(G), 'the annals left a bad number');
}));

test('the province: every fight that can be started has an ending when it is won', () => game()(function () {
  newGame(); G.tally.wins = 1; assert(wildEnter(), 'out');
  // every name a fight is started under, anywhere in the game, is one that victory knows what to do with
  const names = new Set(); let src = '';
  for (const id in EVENTS) for (const o of EVENTS[id].opts) src += o.run.toString() + ' ; ';
  src.replace(new RegExp("wildFight\\((?:[^;]*?), '(\\w+)', \\{", 'g'), (m, w) => { names.add(w); return m; });
  assert(names.size >= 12 && names.has('ambush') && names.has('errand') && names.has('journey'), 'the fights were found: ' + [...names]);
  for (const w of names) assert(typeof WILD_WINS[w] === 'function', 'a fight is started as "' + w + '", and winning it has no ending');
  // the two that froze: won, they pay like any other brush on the road
  for (const title of ['The toll-men', 'The men who left the cart']) {
    G.field.fight = null; wildFight(title, wildMen(2, 3), 'camp', 'ambush', { tier: 2 });
    const F = G.field.fight, coin = G.denarii, fame = G.fame, lines = WILD_WINS[F.win](F);
    assert(lines.length && !/undefined|NaN/.test(lines.join(' ')) && G.denarii > coin && G.fame === fame + 2 && !badNumber(G), title + ' is won, and pays');
  }
  // and a fight under a name nobody knows still ends
  { G.field.fight = null; wildFight('Somebody', wildMen(1, 2), 'camp', 'nosuchthing', {});
    G.fac.barracks = 3; while (G.roster.length < 6) G.roster.push(welcome(makeGladiator(40)));
    G.roster.forEach(x => { STATS.forEach(k => { x.stats[k] = 20; }); x.hp = maxHp(x); });
    let B = fight(fieldParty(), G.field.fight.foes, { wild: 'camp', hunt: true, mercy: [0.3, 0] }), guard = 0;
    while (B.winner !== 0 && guard++ < 20) { G.roster.forEach(x => { x.hp = maxHp(x); x.injury = 0; }); B = fight(fieldParty(), G.field.fight.foes, { wild: 'camp', hunt: true, mercy: [0.3, 0] }); }
    const r = applyWildResult(B); assert(r.win && !G.field.fight && !badNumber(G), 'it ends, and the school marches on'); }
}));

test('the province: every bridge runs straight, and the roads still meet across it', () => game()(function () {
  newGame();
  const L = wildLand(), { TW, TH } = WILD, seen = new Uint8Array(TW * TH), comps = [];
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    if (L.t[ty * TW + tx] !== T_BRIDGE || seen[ty * TW + tx]) continue;
    const todo = [[tx, ty]], comp = [];
    while (todo.length) { const [cx, cy] = todo.pop(), k = cy * TW + cx; if (seen[k] || L.t[k] !== T_BRIDGE) continue; seen[k] = 1; comp.push([cx, cy]); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) todo.push([cx + dx, cy + dy]); }
    comps.push(comp);
  }
  assert(comps.length >= 4, 'the roads cross water in four places: ' + comps.length);
  for (const comp of comps) {
    const xs = comp.map(q => q[0]), ys = comp.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), at = (x, y) => L.t[y * TW + x];
    assert(x0 === x1 || y0 === y1, 'a bridge runs aslant, from ' + x0 + ',' + y0 + ' to ' + x1 + ',' + y1);
    assert(comp.length === (x1 - x0) + (y1 - y0) + 1, 'a bridge with a gap in it');
    // a road on dry ground at each end, and every plank of it can be walked to from the town
    const ends = y0 === y1 ? [[x0 - 1, y0], [x1 + 1, y0]] : [[x0, y0 - 1], [x0, y1 + 1]];
    assert(ends.every(([x, y]) => at(x, y) === T_ROAD && L.reach[y * TW + x]) && comp.every(([x, y]) => L.reach[y * TW + x]), 'a bridge at ' + x0 + ',' + y0 + ' does not meet the road at both ends');
  }
  // lanes: a short track from a place to the road near it, over dry ground, and never over the place itself
  { let n = 0; const spotsAt = new Set(wildSites().filter(q => !q.errand && !q.journey).map(q => Math.floor(q.y / 10) * TW + Math.floor(q.x / 10)));
    for (let i = 0; i < TW * TH; i++) if (L.lane[i]) { n++; assert(L.t[i] === T_ROAD && L.reach[i] && !spotsAt.has(i), 'a lane that is not road, or cannot be reached, or lies over a place'); assert([i - 1, i + 1, i - TW, i + TW].some(k => L.t[k] === T_ROAD || spotsAt.has(k)), 'a lane tile joined to nothing'); }
    assert(n >= 20 && n <= 160, 'a few lanes, not a web of them: ' + n + ' tiles'); }
  // nothing that was a place has been cut off or built over by it
  for (const s of wildSites()) { const k = Math.floor(s.y / 10) * TW + Math.floor(s.x / 10); assert(L.reach[k] && L.t[k] !== T_BRIDGE && L.t[k] < T_WATER, s.name + ' is cut off'); }
  // a column caught standing where a bridge used to be is set down on the nearest bank
  G.tally.wins = 1; assert(wildEnter(), 'out');
  let wet = null; for (let i = 0; i < TW * TH && !wet; i++) if (L.t[i] === T_WATER && [i - 1, i + 1, i - TW, i + TW].some(n => L.reach[n])) wet = [(i % TW) * 10 + 5, Math.floor(i / TW) * 10 + 5];
  G.field.x = wet[0]; G.field.y = wet[1]; assert(!wildWalk(G.field.x, G.field.y) && wildUnstick() && wildWalk(G.field.x, G.field.y) && Math.hypot(G.field.x - wet[0], G.field.y - wet[1]) < 25 && !wildUnstick(), 'he is put back on dry ground, close by');
  return comps.map(c => c.length).join(', ') + ' tiles';
}));

test('the province: the column keeps to the roads, goes round bad ground, and never tries the water', () => game()(function () {
  newGame();
  const L = wildLand(), TW = WILD.TW, kind = p => L.t[Math.floor(p.y / 10) * TW + Math.floor(p.x / 10)], onRoad = p => kind(p) === T_ROAD || kind(p) === T_BRIDGE;
  const share = path => path.filter(onRoad).length / path.length;
  // from the town gate to places along each road: nearly every step of the way is on it
  for (const [tx, ty, name] of [[150, 96, 'the east road'], [84, 58, 'the north road'], [64, 150, 'the shore road'], [172, 141, 'the road into the mere']]) {
    const path = wildRoute(WILD.TOWN.x + 22, WILD.TOWN.y, tx * 10 + 5, ty * 10 + 5);
    assert(path && path.length > 10 && path.every(p => kind(p) < T_WATER), name + ': a way that stays dry');
    assert(share(path) > 0.85, name + ': kept to, for ' + Math.round(share(path) * 100) + '% of the way');
    for (let i = 1; i < path.length; i++) assert(Math.abs(path[i].x - path[i - 1].x) <= 15 && Math.abs(path[i].y - path[i - 1].y) <= 15, name + ': no step longer than a tile');
  }
  // to somewhere off the road it goes by road as far as that serves, then strikes out
  { const far = wildRoute(WILD.TOWN.x + 22, WILD.TOWN.y, 1700, 800); assert(far && share(far) > 0.5 && !onRoad(far[far.length - 1]), 'most of the way by road, the last of it across country: ' + Math.round(share(far) * 100) + '%'); }
  // it will go round by the road sooner than straight through a wood or a bog, but not for ever
  assert(ROUTE_COST[T_ROAD] < ROUTE_COST[T_GRASS] && ROUTE_COST[T_GRASS] < ROUTE_COST[T_FOREST] && ROUTE_COST[T_FOREST] < ROUTE_COST[T_MARSH] && ROUTE_COST[T_ROAD] >= 0.5, 'road is cheapest, then open ground, then wood and hill, then marsh');
  // nowhere to go: the sea, and where it stands already
  let sea = null; for (let i = 0; i < L.t.length && !sea; i++) if (L.t[i] === T_WATER) sea = [(i % TW) * 10 + 5, Math.floor(i / TW) * 10 + 5];
  assert(wildRoute(WILD.TOWN.x + 22, WILD.TOWN.y, sea[0], sea[1]) === null && wildRoute(905, 1005, 906, 1006).length === 1, 'no way into the water; and one step to where you are');
  // quick enough to ask for at every click
  const t0 = Date.now(); for (let i = 0; i < 10; i++) wildRoute(WILD.TOWN.x + 22, WILD.TOWN.y, 2260, 140); assert(Date.now() - t0 < 2500, 'ten ways across the whole province in ' + (Date.now() - t0) + ' ms');
}));
test('the province: a place dealt with looks like what was done to it', () => {
  const src = read('js/province.js'), ctx = { Math, parseInt };
  vm.createContext(ctx);
  const from = src.indexOf('const SITE_GONE'), to = src.indexOf('function provIcon(ctx, s, T, done) {');
  assert(from > 0 && to > from, 'the rules for it can be found');
  vm.runInContext(src.slice(from, to) + '; this.SITE_GONE = SITE_GONE; this.DONE_WORD = DONE_WORD; this.doneWord = doneWord; this.ashOf = ashOf;', ctx);
  // what was fought for is laid waste; what was only visited is left standing
  for (const k of ['camp', 'slavers', 'chief', 'bounty', 'lair', 'battlefield', 'barrow']) assert(ctx.SITE_GONE.includes(k), k + ' should be laid waste');
  for (const k of ['hamlet', 'healer', 'merchant', 'hermit', 'shrine', 'vow', 'ruin', 'cache', 'herb', 'deserter', 'quarry', 'master']) assert(!ctx.SITE_GONE.includes(k) && ctx.DONE_WORD[k], k + ' should be left standing, with a word for it');
  assert(ctx.doneWord({ kind: 'hamlet' }) === 'Visited' && ctx.doneWord({ kind: 'camp' }) === 'Burnt out' && ctx.doneWord({ kind: 'ruin' }) === 'Searched' && ctx.doneWord({ kind: 'nosuch' }) === 'Dealt with', 'each kind has its own word');
  // ash: greyer and darker than what it was, but not one flat grey
  const lum = c => (c.startsWith('rgb(') ? c.slice(4, -1).split(',').map(Number) : null);
  const red = lum(ctx.ashOf('#c23b2e', 0, 0)), white = lum(ctx.ashOf('#f2ecd8', 0, 0));
  assert(red && white && red[0] - red[2] < 40 && red[0] < 0xc2 && white[0] > red[0] + 40, 'a red roof and a white wall burn to different greys: ' + red + ' and ' + white);
  assert(ctx.ashOf('rgba(0,0,0,.2)', 0, 0) === 'rgba(0,0,0,.2)', 'a shadow stays a shadow');
  assert(!src.includes("' - DONE'") && src.includes('doneWord(s).toUpperCase()'), 'the label says what was done, not only that it is done');
});

test('the province: with stables the school rides, and better stables turn the horses out better', () => {
  const src = read('js/province.js'), from = src.indexOf('const HORSE_COATS'), to = src.indexOf('// ---------- the column on the move ----------');
  assert(from > 0 && to > from, 'the riders can be found');
  const calls = []; let people = 0;
  const ctx2 = { fillStyle: '', fillRect(x, y, w, h) { calls.push([this.fillStyle, x, y, w, h]); }, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {} };
  const box = { Math, Object, shade: (c, f) => c + '*' + f, vilPerson: () => { people++; } };
  vm.createContext(box);
  vm.runInContext(src.slice(from, to) + '; this.provRider = provRider; this.HORSE_COATS = HORSE_COATS;', box);
  const painted = lvl => { const seen = new Set(); for (const face of ['left', 'right', 'up', 'down']) for (const moving of [true, false]) for (const who of [0, 1, 2, 5]) { calls.length = 0; box.provRider(ctx2, 100, 100, { face, walk: 1.3, moving, tunic: '#c23b2e', hair: '#3a2a1c', skin: '#d9a57c' }, lvl, who);
      for (const c of calls) { assert(c.slice(1).every(Number.isFinite) && c[3] > 0 && c[4] > 0 && typeof c[0] === 'string' && !/undefined|NaN/.test(c[0]), 'a stroke of the brush that is no stroke: ' + c); seen.add(c[0]); } if (lvl) assert(calls.length >= 7, 'a horse at ' + lvl + ' facing ' + face + ' is ' + calls.length + ' strokes'); } return seen; };
  const foot = painted(0); assert(foot.size === 0 && people > 0, 'with no stables the school walks');
  const l1 = painted(1), l2 = painted(2), l3 = painted(3);
  assert(l1.has('#b8a67c') && !l1.has('#e8b545'), 'at the first a blanket, and no bronze');
  assert(l2.has('#6b4424') && l2.has('#e8b545') && !l2.has('#c9a23a'), 'at the second a saddle and a bridle with bronze on it');
  assert(l3.has('#c9a23a') && l3.has('#f5d584') && l3.size > l1.size, 'at the third a face-plate, and gold at the hem');
  assert(box.HORSE_COATS.length >= 5 && src.includes('const mounts = (G.fac && G.fac.stables) | 0;'), 'every man has a beast of a different coat, and it follows the stables');
});

test('the province: places make the country round them', () => {
  const src = read('js/province.js'), wilds = read('js/wilds.js');
  const from = src.indexOf('const SET_OF = {'), to = src.indexOf('const setting = (x, y, r, name, sd) => {');
  assert(from > 0 && to > from, 'the list of them can be found');
  const box = { T_GRASS: 0, T_FOREST: 1, T_HILL: 2, T_MARSH: 3, T_SAND: 4, T_MEADOW: 7 }; vm.createContext(box);
  vm.runInContext(src.slice(from, to) + '; this.SET_OF = SET_OF; this.SET_GROUND = SET_GROUND;', box);
  const names = Object.keys(box.SET_OF), kinds = [...new Set(Object.values(box.SET_OF))];
  assert(names.length >= 28 && kinds.length === 15, names.length + ' places, of ' + kinds.length + ' kinds of country');
  // each is a real landmark or a real dwelling, and each kind of country is actually painted
  for (const n of names) assert(wilds.includes("'" + n + "'") || wilds.includes('"' + n + '"') || src.includes(", '" + n + "', ") || src.includes(', "' + n + '", '), n + ' is no place on the map');
  for (const k of kinds) assert(src.includes("kind === '" + k + "'"), 'nothing is painted for ' + k);
  for (const k of Object.keys(box.SET_GROUND)) assert(kinds.includes(k), k + ' has ground but no place');
  assert(box.SET_OF['The wine press'] === 'vines' && box.SET_OF['The great quarry'] === 'quarry' && box.SET_OF['The mill'] === 'corn', 'vines by the press, cut rock by the quarry, corn by the mill');
  // and it is laid before the place itself, for landmarks and for dwellings both
  assert(src.split('d: () => setting(x, y, ').length === 3, 'both kinds of place are given their country');
});

test('the province: an event on the road does not make the column forget where it was going', () => {
  const src = read('js/province.js');
  assert(!src.includes('if (wildVisit(here)) { prov.path = null') && !src.includes('wildWalked(moved)) { prov.path = null') && !src.includes('prov.path = null; villageStill(); startWildFight()'), 'the path is thrown away when something stops the column');
  assert(src.includes('prov.path && !F.fight && !G.pendingEvent'), 'and it does not walk on while the matter is still open');
  assert(src.includes('function provPath(x0, y0, x1, y1) { return wildRoute(x0, y0, x1, y1); }'), 'the map asks the same road-keeping way-finder the rules use');
});

test('the province: nothing is set down on top of anything else', () => game()(function () {
  newGame();
  const L = wildLand(), TW = WILD.TW, S = wildSites().filter(s => !s.errand && !s.journey), AQ = L.aqueduct;
  assert(AQ && AQ.length === 3 && AQ.every(p => p.length === 2 && p[0] > 0 && p[1] > 0), 'the aqueduct has its line: out of the town, a turn, and the source');
  const near = (x, y) => { let d = 1e9; for (let i = 0; i + 1 < AQ.length; i++) { const p = AQ[i], q = AQ[i + 1], vx = q[0] - p[0], vy = q[1] - p[1], k = Math.max(0, Math.min(1, ((x - p[0]) * vx + (y - p[1]) * vy) / (vx * vx + vy * vy))); d = Math.min(d, Math.hypot(x - p[0] - vx * k, y - p[1] - vy * k)); } return d; };
  // no place under the arches
  for (const s of S) if (!s.fixed) assert(near(s.x, s.y - 4) >= 32, s.name + ' (' + s.id + ') stands under the aqueduct, ' + Math.round(near(s.x, s.y - 4)) + ' from its line');
  // no two places on top of each other, none in a clearing, none on water, and every one can be walked to
  for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) assert(Math.hypot(S[i].x - S[j].x, S[i].y - S[j].y) >= 60, S[i].name + ' and ' + S[j].name + ' stand on top of each other');
  for (const s of S) { const k = Math.floor(s.y / 10) * TW + Math.floor(s.x / 10); assert(L.t[k] < T_WATER && L.reach[k], s.name + ' is in the water, or cut off'); assert(!L.glades.some(g => Math.hypot(g.tx * 10 + 5 - s.x, g.ty * 10 + 5 - s.y) < 30), s.name + ' is in a clearing'); }
  // no clearing under the arches, and no lane run through a clearing
  for (const g of L.glades) { assert(near(g.tx * 10 + 5, g.ty * 10 + 5) >= 24, 'a clearing under the aqueduct'); assert(!L.lane[g.ty * TW + g.tx], 'a lane through a clearing'); }
  // the painter keeps its own things clear of the same line
  return S.length + ' places';
}));
test('the province: landmarks and dwellings are kept out from under the aqueduct too', () => {
  const src = read('js/province.js');
  assert(src.includes('if (underAq(tx * 10 + r, ty * 10 - 6, r + 20)) return false;') && src.includes('if (underAq(tx * 10 + 12, ty * 10 - 6, 32)) continue;'), 'a landmark or a dwelling may be set down under the arches');
  assert(src.includes('L.aqueduct && L.aqueduct.length ? L.aqueduct.map'), 'the painter draws the aqueduct along some other line than the one the land was laid out round');
});

test('the province: the river runs one way, from the fells to the bay', () => game()(function () {
  newGame();
  const L = wildLand(), TW = WILD.TW, F = wildFlow();
  assert(F.size > 200 && F.size < 1500 && wildFlow() === F, 'the river is a few hundred tiles of water, reckoned once: ' + F.size);
  let south = 0, n = 0;
  for (const [k, d] of F) { n++; assert(L.t[k] === T_WATER && Math.abs(Math.hypot(d[0], d[1]) - 1) < 1e-6, 'a current where there is no water, or of no fixed strength'); if (d[1] > 0) south++; }
  assert(south === n, 'every stretch of it runs down the map, toward the bay');
  // the sea and the mere have no current
  assert(!F.has(100 * TW + 5) && !F.has(125 * TW + 165), 'still water stays still');
  // and it is the river that was laid: every bend of its course has current beside it
  for (const [x, y] of WILD_RIVER.slice(0, -1)) assert([0, 1, -1, 2, -2].some(dx => F.has(y * TW + x + dx)), 'no current at the bend at ' + x + ',' + y);
  return n + ' tiles';
}));

test('the province: clearings in the woods, where a rainbow can come down', () => game()(function () {
  newGame();
  const C = wildClearings(), L = wildLand();
  assert(C.length >= 6, 'the woods have clearings: ' + C.length);
  for (const c of C) {
    const tx = Math.floor(c.x / 10), ty = Math.floor(c.y / 10), k = L.t[ty * WILD.TW + tx];
    assert(k === T_MEADOW && L.reach[ty * WILD.TW + tx] && wildWalk(c.x, c.y), 'a clearing is open grass that can be reached');
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const q = L.t[(ty + dy) * WILD.TW + tx + dx]; assert(Math.max(Math.abs(dx), Math.abs(dy)) <= 1 ? q === T_MEADOW || q === T_FOREST : q === T_FOREST, 'and the wood stands all round it'); }
    assert(C.every(o => o === c || Math.hypot(o.x - c.x, o.y - c.y) >= 140), 'no two are close together');
  }
  for (const s of wildSites()) assert(!C.some(c => Math.hypot(c.x - s.x, c.y - s.y) < 25), 'none is cut where a place stands: ' + s.name);
  return C.length + ' clearings';
}));
test('the province: the rainbow stands still, and the one at the end of it runs for the trees', () => {
  const src = read('js/province.js');
  assert(src.includes('prov.bow || (prov.bow = bowPlace(camX, camY))') && src.includes('} else prov.bow = null;'), 'the bow is placed once when it shows, and forgotten when it has gone');
  assert(!src.includes('const cx = camX + PROV.VW * 0.72, cy = camY'), 'the bow is no longer drawn from the corner of the view every frame');
  // his wits, tried without a screen: he sits, he runs from a man who comes near, he runs when the bow fades, and he is gone
  const ctx = { Math, console };
  vm.createContext(ctx);
  const from = src.indexOf('const LEP_SHY'), to = src.indexOf('function drawLeprechaun');
  assert(from > 0 && to > from, 'his wits can be found');
  vm.runInContext('const T_FOREST = 1; let G = { field: { x: 0, y: 0 } }; const wood = (x, y) => x > 130; const wildTile = (x, y) => wood(x, y) ? 1 : 0;\n' + src.slice(from, to) + '\nthis.lepStep = lepStep; this.setField = (x, y) => { G.field.x = x; G.field.y = y; }; this.LEP_SHY = LEP_SHY;', ctx);
  const mk = () => ({ x: 100, y: 100, hx: 100, hy: 100, state: 'sit', t: 0, a: 1, last: 0 });
  let lep = mk(); ctx.setField(100 - ctx.LEP_SHY - 20, 100);
  for (let i = 0; i < 100; i++) ctx.lepStep(lep, 0.05, false);
  assert(lep.state === 'sit' && lep.x === 100, 'left alone under a bright bow, he sits');
  ctx.setField(100 - ctx.LEP_SHY + 5, 100); ctx.lepStep(lep, 0.05, false);
  assert(lep.state === 'run' && lep.tx > 130, 'a man comes near: he is up, and it is the trees he makes for, away from the man');
  assert(lep.drop === true, 'and a coin goes over the rim of the pot');
  // the coin: it lies there until somebody walks over it, and is worth more far from the town
  { const c2 = { Math, console }; vm.createContext(c2); const f2 = src.indexOf('const lepCoin'), t2 = src.indexOf('function drawCoin'); assert(f2 > 0 && t2 > f2, 'the coin can be found');
    vm.runInContext('let G = { denarii: 100, field: { x: 0, y: 0 } }; const said = []; const log = s => said.push(s); const wildTier = (x, y) => x > 1000 ? 4 : 1; ' + src.slice(f2, t2) + ' ; this.G = G; this.said = said; this.lepCoin = lepCoin; this.coinTake = coinTake;', c2);
    assert(c2.lepCoin(100, 100) === 15 && c2.lepCoin(2000, 100) === 30, 'one gold piece: 15 denarii near the town, 30 far out');
    const coin = { x: 300, y: 300, v: 15, t: 0 };
    assert(!c2.coinTake(coin) && c2.G.denarii === 100, 'it lies there while the school is elsewhere');
    c2.G.field.x = 304; c2.G.field.y = 297; assert(c2.coinTake(coin) && c2.G.denarii === 115 && c2.said.length === 1 && c2.said[0].includes('15 denarii'), 'walked over, it is picked up, and noted'); }
  let steps = 0; while (lep.state === 'run' && steps++ < 400) ctx.lepStep(lep, 0.05, false);
  assert(lep.state === 'gone' && lep.x > 130 && steps < 200, 'and the wood takes him: ' + steps);
  lep = mk(); ctx.setField(-900, -900); ctx.lepStep(lep, 0.05, true);
  assert(lep.state === 'run', 'the bow fades: he goes whether anyone is near or not');
});

test('the province: bounties, foraging, scouting and regions made safe', () => game()(function () {
  newGame(); G.tally.wins = 1; G.day = 6; while (G.roster.length < 4) G.roster.push(makeGladiator(30));
  const base = wildSites().length;
  // a bounty is posted, marked on the map, and is a place like any other
  const b = postBounty();
  assert(b && bountyLive() && b.pay > 0 && b.tier >= 1 && b.tier <= 5 && b.until === G.day + 20 && !postBounty(), 'one bounty stands at a time');
  const st = siteById('bounty');
  assert(wildSites().length === base + 1 && st && st.kind === 'bounty' && siteLive(st) && siteShown(st) && wildMap().marks.bounty, 'it is on the map, through the fog');
  assert(wildLand().reach[Math.floor(b.y / 10) * WILD.TW + Math.floor(b.x / 10)], 'and can be walked to');
  assert(bountyFoes(b).length >= 2, 'somebody is waiting there');
  // taking it: the fight, the pay, the favour
  assert(wildEnter(), 'the school marches out');
  assert(wildVisit(st) && G.pendingEvent.id === 'wBounty', 'walking up to it raises it');
  answerEvent(0);
  assert(G.field.fight && G.field.fight.win === 'bounty', 'a fight is set');
  const d0 = G.denarii, f0 = G.patrons.magistrate, fame0 = G.fame, B = fight(fieldParty(), G.field.fight.foes, { hunt: true }); B.winner = 0;
  const r = applyWildResult(B);
  assert(r.win && !G.bounty && !bountyLive() && wildSites().length === base && G.denarii >= d0 + b.pay - upkeep() && G.patrons.magistrate > f0 && G.fame > fame0 && wildMap().bounties === 1 && !wildMap().marks.bounty, 'the bounty is paid and gone');
  // an old bounty lapses, and a new one is posted on a games day
  postBounty(); const old = G.bounty; G.day = old.until + 1;
  assert(!bountyLive() && wildSites().length === base, 'a bounty lapses after twenty days');
  assert(postBounty() && G.bounty !== old && bountyLive(), 'and another is posted');
  // foraging: a day passes, coin comes in, little rest
  if (!G.field) wildEnter();
  G.roster.forEach(g => { g.injury = 0; g.fatigue = 50; g.hp = maxHp(g); });
  const day0 = G.day, d1 = G.denarii, net = stipend() - upkeep();
  const coin = campForage();
  assert(coin > 0 && G.day === day0 + 1 && G.denarii === d1 + net + coin && G.field.note && G.field.note.day === G.day, 'a day foraging pays');
  assert(G.roster.every(g => g.fatigue < 50 && g.fatigue > 30), 'and rests the men a little');
  // scouting: the fog lifts a long way round
  const seen0 = wildExplored(), day1 = G.day;
  campScout();
  assert(G.day === day1 + 1 && wildExplored() > seen0 + 0.01 && G.field.note.day === G.day, 'a day scouting opens the map');
  G.staff.scout = { name: 'x', skill: 3, wage: 0 }; G.field.x += 400; const seen1 = wildExplored(); campScout(); const gain = wildExplored() - seen1;
  assert(gain > 0, 'a scout sees further');
  // a region is safe when its last lair or camp is dealt with, and pays a toll every day
  const tally = regionTally(), region = Object.keys(tally)[0];
  assert(Object.values(tally).every(t => t.n > 0 && t.done === 0) && safeRegions().length === 0, 'nothing is safe at the start');
  const hostile = wildSites().filter(q => HOSTILE_SITES.includes(q.kind) && wildRegion(q.x, q.y) === region), s0 = stipend(), fame1 = G.fame;
  hostile.slice(0, -1).forEach(q => siteFinish(q.id));
  assert(safeRegions().length === 0 && stipend() === s0, 'not until the last of them');
  siteFinish(hostile[hostile.length - 1].id);
  assert(safeRegions().length === 1 && safeRegions()[0] === region && stipend() === s0 + SAFE_TOLL && G.fame === fame1 + 10 && wildMap().justSafe === region, 'the region is safe, and pays');
  const lines = []; safeLine(lines); assert(lines.length === 1 && !wildMap().justSafe, 'and the report says so, once');
  assert(!badNumber(G), 'the province left a bad number');
}));

test('the province: land, fog, days in the field, fights, spoils and the eagle', () => game()(function () {
  newGame();
  // the land is the same for every house, and everything in it can be walked to
  const L = wildLand(), sites = wildSites();
  assert(L.t.length === WILD.TW * WILD.TH && L.sites.length === 40 && sites.length === 51, 'forty shuffled places and eleven fixed ones, got ' + sites.length);
  assert(sites.every(s => L.reach[Math.floor(s.y / 10) * WILD.TW + Math.floor(s.x / 10)]), 'every place can be reached on foot from the town');
  assert(wildWalk(WILD.TOWN.x, WILD.TOWN.y) && !wildWalk(5, 900) && wildTier(WILD.TOWN.x + 50, WILD.TOWN.y) === 1 && wildTier(2300, 120) === 5, 'town on dry land, sea to the west, danger grows with distance');
  for (let t = 1; t <= 5; t++) assert(sites.some(s => s.tier === t), 'there are places of ' + t + ' skulls');
  // only water and bare rock stop you: every other kind of ground, meadow included, can be walked
  let blocked = 0, wet = 0, rock = 0, meadow = null;
  for (let i = 0; i < L.t.length; i++) { const k = L.t[i], x = (i % WILD.TW) * 10 + 5, y = Math.floor(i / WILD.TW) * 10 + 5; if (!wildWalk(x, y)) blocked++; if (k === T_WATER) wet++; if (k === T_PEAK) rock++; if (k === T_MEADOW && !meadow) meadow = [x, y]; }
  assert(blocked === wet + rock && meadow && wildWalk(meadow[0], meadow[1]) && [T_GRASS, T_FOREST, T_HILL, T_MARSH, T_SAND, T_ROAD, T_BRIDGE, T_MEADOW].every(k => k < T_WATER), 'nothing blocks the way but water and rock (' + blocked + ' tiles of ' + (wet + rock) + ')');
  let reach = 0, open = 0; for (let i = 0; i < L.t.length; i++) { if (L.reach[i]) reach++; if (L.t[i] < T_WATER) open++; }
  assert(reach > open * 0.97, 'nearly all open ground can be reached from the town: ' + reach + ' of ' + open);
  const fixedXY = sites.filter(s => s.fixed).map(s => s.x + ',' + s.y).join(';'), kinds1 = sites.map(s => s.kind).join();
  newGame();
  assert(wildSites().filter(s => s.fixed).map(s => s.x + ',' + s.y).join(';') === fixedXY && wildSites().map(s => s.kind).join() !== kinds1, 'another house finds the same country with its places shuffled');
  // the gate, and the fog
  assert(!gateOpen() && !wildEnter() && !G.field, 'the gate is shut until the first games');
  G.tally.wins = 1;
  assert(gateOpen() && wildEnter() && G.field && G.field.packs.length > 5, 'then the whole school may march out, and bands roam the country');
  const seen0 = wildExplored();
  assert(seen0 > 0 && wildSeen(G.field.x, G.field.y) && !wildSeen(2000, 300), 'the fog lifts only where you have been');
  assert(wildReveal(1200, 900) && wildSeen(1200, 900) && wildExplored() > seen0 && !wildReveal(1200, 900), 'walking lifts more of it, once');
  // days in the field: nothing is learned, marching tires, camp rests
  const g = G.roster[0]; g.activity = 'str'; g.fatigue = 40; g.hp = maxHp(g) * 0.5;
  const stats = JSON.stringify(g.stats) + JSON.stringify(g.prog), day = G.day;
  fieldDay('march');
  assert(G.day === day + 1 && JSON.stringify(g.stats) + JSON.stringify(g.prog) === stats && g.fatigue > 40, 'a day on the march: no training, more fatigue');
  const f1 = g.fatigue, h1 = g.hp; fieldDay('camp');
  assert(g.fatigue < f1 && g.hp > h1 && G.field.days === 2 && !G.pendingEvent, 'a day in camp rests them, and nothing from the town interrupts');
  // every kind of place answers when walked up to, once
  for (const kind of ['lair', 'camp', 'ruin', 'shrine', 'hermit', 'hamlet', 'healer', 'merchant']) {
    const s = wildSites().find(x => x.kind === kind && !siteDone(x));
    G.denarii = 5000; G.fac.barracks = 2;
    assert(wildVisit(s) && G.pendingEvent && G.pendingEvent.c.sid === s.id, kind + ' raises its event');
    assert(typeof EVENTS[G.pendingEvent.id].text(G.pendingEvent.c) === 'string', kind + ' has its words');
    const out = answerEvent(0);
    if (G.field.fight) { assert(G.field.fight.foes.length >= 2 && G.field.fight.sid === s.id, kind + ' comes to a fight'); G.field.fight = null; }
    else assert(typeof out === 'string' && out.length > 10 && (siteDone(s) || kind === 'hermit'), kind + ' is dealt with: ' + out);
    assert(!badNumber(G), kind + ' left a bad number');
    G.pendingEvent = null; G.eventQueue = [];
  }
  // a fight in the wild: nine a side fits the field, and the result is settled
  newGame(); G.tally.wins = 1; G.fac.barracks = 3;
  while (G.roster.length < 9) G.roster.push(welcome(makeGladiator(40)));
  wildEnter();
  const lair = wildSites().filter(x => x.kind === 'lair').sort((a, b) => a.tier - b.tier)[0], coin = G.denarii, fame = G.fame;
  wildVisit(lair); answerEvent(0); G.field.fight.foes = wildBeasts(1);
  const foes9 = wildMen(1, 9), B9 = createBattle(fieldParty(), foes9, { wild: 'forest', hunt: true, noIntro: true });
  assert(B9.fighters.length === 18 && B9.fighters.every(f => f.y >= B9.field.y0 && f.y <= B9.field.y1 && f.markX > 10 && f.markX < 204), 'eighteen men all stand on the field');
  const ys = B9.fighters.filter(f => f.team === 0).map(f => Math.round(f.y)); assert(new Set(ys).size === 9, 'and no two of a side on the same spot');
  let B = fight(fieldParty(), G.field.fight.foes, { wild: 'forest', hunt: true, mercy: [0.3, 0] });
  assert(B.winner === 0, 'nine good men beat two wolves');
  const res = applyWildResult(B);
  assert(res.win && siteDone(lair) && G.denarii > coin - upkeep() && G.fame > fame && wildMap().cleared === 1 && /denarii/.test(res.lines.join()), 'the lair is cleared, and pays in coin and fame');
  assert(!wildVisit(lair) && !siteLive(lair), 'and cannot be done again');
  // defeat: men may die, the place remains
  newGame(); G.tally.wins = 1; wildEnter();
  const camp = wildSites().find(x => x.kind === 'camp'); wildVisit(camp); answerEvent(0);
  G.field.fight.foes = wildMen(5, 8);
  const n0 = G.roster.length; B = fight(fieldParty(), G.field.fight.foes, { wild: 'camp', hunt: true, mercy: [0, 0] });
  const lost = applyWildResult(B);
  assert(!lost.win && !siteDone(camp) && G.roster.length <= n0 && G.roster.every(x => x.injury > 0 || x.hp >= 1), 'beaten: the camp stands, and the men are dead or carried off');
  // relics are real gear with something extra
  newGame(); const it = wildRelic('crest'), plain = makeItem('head', 5);
  assert(it.relic === 'crest' && itemName(it) === RELICS.crest.name && itemStats(it).critRes > itemStats(plain).critRes + 0.1 && itemPrice(it) > itemPrice(plain) && /Seventeenth/.test(itemEffect(it)), 'a relic is named, stronger and dearer than its grade');
  assert(G.armoury.includes(it) && equip(G.roster[0], it.id) && gearStats(G.roster[0]).critRes > 0.15, 'and can be worn');
  // the eagle: five steps across the map, then a choice at home
  newGame(); G.tally.wins = 1; G.fac.barracks = 3; wildEnter();
  const M = wildMap(), find = k => wildSites().find(x => x.kind === k);
  assert(M.story === 0 && !siteLive(find('deserter')) && eagleLead() === '', 'nothing is known at first');
  const tomb = wildSites().find(x => x.kind === 'ruin' && x.tier >= 2); ruinLoot(tomb, 1);
  assert(M.story === 1 && M.marks.deserter && siteLive(find('deserter')) && eagleLead().length > 20, 'a tomb gives the first clue and marks the old soldier');
  wildVisit(find('deserter')); answerEvent(0);
  assert(M.story === 2 && M.marks.battlefield && siteDone(find('deserter')), 'the old soldier points to the battlefield');
  for (const [kind, win, next] of [['battlefield', 'battlefield', 3], ['chief', 'chief', 4], ['barrow', 'barrow', 5]]) {
    assert(siteLive(find(kind)), kind + ' is open');
    wildVisit(find(kind)); answerEvent(0);
    assert(G.field.fight && G.field.fight.win === win && G.field.fight.foes.length >= 6 && G.field.fight.foes.length <= 9, kind + ' is a real fight of ' + G.field.fight.foes.length);
    const lines = WILD_WINS[win](G.field.fight); G.field.fight = null;
    assert(M.story === next && lines.length > 0 && siteDone(find(kind)), kind + ' moves the story on');
  }
  assert(M.relics.includes('crest') && M.relics.includes('vambrace') && G.armoury.some(x => x.relic === 'crest'), 'One-Eye and the barrow each give up a relic');
  wildLeave();
  assert(!G.field && G.pendingEvent && G.pendingEvent.id === 'eagleHome', 'home with the eagle: a choice');
  answerEvent(1);
  assert(M.story === 6 && M.eagle === 'kept' && G.roster.every(x => x.traits.includes('eaglesworn')) && welcome(makeGladiator(20)).traits.includes('eaglesworn'), 'kept over the gate, it marks every man of the house');
  // what the family knows outlives the house
  const walked = wildExplored(), cleared = M.cleared;
  G.denarii = -100; G.debtDays = 99; endDay();
  assert(G.ruin, 'the house falls'); startHeir();
  assert(wildMap().story === 6 && wildExplored() === walked && wildMap().cleared === cleared && G.field === null && G.roster.every(x => x.traits.includes('eaglesworn')), 'the heir keeps the map, the tale and the eagle');
  // old saves: a man away on a journey of the old kind is brought home and his place marked
  newGame(); const old = G.roster[0]; old.quest = { id: 'master', step: 0, since: 1, tries: 0 }; old.away = 77; G.jobs.push({ id: 77, kind: 'quest', type: 'master', ids: [old.id], end: 9 });
  delete G.field; delete G.dynasty.map; migrate();
  assert(!old.away && !G.jobs.length && G.field === null && wildMap().marks.master, 'the old journey becomes a mark on the map');
}));

test('the province: a day passes for each day\'s march', () => game()(function () {
  newGame();
  G.day = 7; assert(wildEnter(), 'the gate opens after the first games');
  const d0 = G.day;
  assert(!wildMarched(MARCH_DAY * 0.6, 1) && G.day === d0, 'most of a day\'s march: still today');
  assert(marchDays(MARCH_DAY * 0.3) === 0 && marchDays(MARCH_DAY * 0.5) === 1 && marchDays(MARCH_DAY * 2.3) === 2, 'the forecast counts what is left of today');
  assert(wildMarched(MARCH_DAY * 0.5, 1) && G.day === d0 + 1 && G.field.days === 1, 'the rest of it: night falls and a day passes');
  assert(Math.abs(G.field.march - MARCH_DAY * 0.1) < 1e-6, 'what was walked past nightfall counts toward tomorrow');
  const m0 = G.field.march; wildMarched(100, 1.25); const road = G.field.march - m0; wildMarched(100, 0.55); const marsh = G.field.march - m0 - road;
  assert(road < 100 && marsh > 100, 'a road is quicker than open ground, and marsh slower');
  assert(pathCost(0, 0, [{ x: 30, y: 40 }]) > 0, 'a path has a cost');
}));

test('quests: people at the fountain, landmarks, unique pieces, deadlines, and new things on the road', () => game()(function () {
  newGame(); G.tally.wins = 1; G.denarii = 500;
  // every landmark has a place the school can reach, and each a place of its own
  const spots = landmarkSpots(), L = wildLand();
  assert(LANDMARKS.length === 40 && LANDMARKS.every(n => spots[n] && L.reach[Math.floor(spots[n].y / 10) * WILD.TW + Math.floor(spots[n].x / 10)]), 'every landmark can be walked to');
  // every kind of quest can be offered, names a landmark, has a giver who would give it, pays, and puts a place on the map
  let n = 0;
  for (const k in ERRANDS) {
    newGame(); G.tally.wins = 1;
    const q = errandNew(k), T = ERRANDS[k];
    assert(!T.boss || (q.boss && q.boss.length > 3), k + ' has somebody with a name waiting there');
    assert(q && q.tpl === k && LANDMARKS.includes(q.mark) && T.marks.includes(q.mark) && T.givers.includes(q.giver.kind) && q.tier >= 1 && q.tier <= 5 && q.pay >= 0 && q.fame >= 1 && q.days >= 10, k + ' can be offered: ' + JSON.stringify(q));
    assert(T.ask(q).length > 40 && T.at(q).length > 10 && T.won(q).length > 10 && T.title(q.mark).length > 5 && !/undefined|NaN/.test(T.ask(q) + T.at(q) + T.won(q) + T.title(q.mark)), k + ' has its words');
    G.asks = [q];
    assert(errandTake(q.id) === q && errands().length === 1 && !asksNow().length && q.until === G.day + q.days, k + ' is taken on');
    const st = wildSites().find(x => x.errand === q.id);
    assert(st && SITE_EVENT[st.kind] && EVENTS[SITE_EVENT[st.kind]] && siteShown(st) && siteLive(st) && st.x === q.x && st.y === q.y, k + ' is a place on the map');
    if (T.foes) { const foes = T.foes(q); assert(foes.length >= (k === 'beastking' ? 1 : 2) && foes.every(f => f.hp > 0) && (!T.boss || (foes[0].boss && foes[0].name === q.boss)), k + ' has a named leader and others to fight'); }
    if (T.lead && q.boss) assert(T.lead(q).length > 20 && !/undefined|NaN/.test(T.lead(q)), k + ' says who is there');
    const purse = G.denarii, fame = G.fame, arm = G.armoury.length, men = G.roster.length;
    assert(wildEnter(), 'the school marches out');
    // done out there: what was found is yours at once, but nobody has paid yet
    const lines = errandDone(q, []);
    assert(G.denarii === purse && G.fame === fame && !errands().length && !wildSites().some(x => x.errand) && owed().length === 1 && owed()[0] === q && q.owedPay === q.pay && lines.join(' ').length > 30 && !/undefined|NaN/.test(lines.join(' ')), k + ' is done, and the pay is waiting at home');
    if (T.recruit) assert(G.roster.length === men + 1, k + ' brings a freed man into the school');
    // home: the purse at the fountain, and for some, more to do
    assert(fountainFolk().length === 1 && fountainFolk()[0].owed, k + ': the giver is at the fountain to pay');
    const said = errandPay(q.id, false).join(' ');
    assert(G.denarii === purse + q.pay && G.fame === fame + q.fame && !owed().length && said.length > 20 && !/undefined|NaN/.test(said), k + ' pays what was promised, at the fountain');
    if (T.next) { const nx = asksNow()[0]; assert(asksNow().length === 1 && nx.tpl === T.next && ERRANDS[T.next].chain && nx.giver.name === q.giver.name && nx.giver.kind === q.giver.kind && nx.from === k, k + ' leads on to ' + T.next + ', from the same person'); }
    else assert(!asksNow().length, k + ' ends there');
    if (T.relic) {
      const it = G.armoury.filter(x => x.relic).pop();
      assert(G.armoury.length === arm + 1 + (T.trophy ? 1 : 0) && it.relic === T.relic && itemName(it) === RELICS[T.relic].name && wildMap().relics.includes(T.relic), k + ' leaves its piece in the armoury');
      const plain = makeItem(it.slot, it.r, it.cls), a = itemStats(it), b = itemStats(plain);
      assert(Object.keys(a).some(key => a[key] > b[key] + 1e-9), RELICS[T.relic].name + ' is better than a plain piece of its grade');
      assert(!errandNew(k), 'a unique piece is not offered twice');
    }
    n++;
  }
  assert(n >= 26 && Object.keys(ERRANDS).filter(k => ERRANDS[k].relic).length === 12 && Object.keys(ERRANDS).filter(k => ERRANDS[k].chain).length === 5, 'fourteen kinds of work, five that follow on, and twelve unique pieces: ' + n);
  assert(n === 30 && Object.keys(ERRANDS).filter(k => ERRANDS[k].type === 'rescue').length === 2 && GIVERS.physician, 'four new kinds of work, one of them a second trail to follow: ' + n);
  // with the work done there is often a choice of the lanista's own, and it changes what is waiting at the fountain
  { const twists = Object.keys(ERRANDS).filter(k => ERRANDS[k].twist);
    assert(twists.length === 6 && twists.every(k => EVENTS['wAfter_' + k] && EVENTS['wAfter_' + k].wild && EVENTS['wAfter_' + k].opts.length >= 3), 'six kinds of quest end in a choice: ' + twists);
    for (const k of twists) for (let i = 0; i < ERRANDS[k].twist.opts.length; i++) {
      newGame(); G.tally.wins = 1; G.fac.barracks = 2; assert(wildEnter(), 'out');
      const q = errandNew(k); errands().push(q); let raised = 0;
      for (let t = 0; t < 60 && !raised; t++) { G.pendingEvent = null; G.eventQueue = []; G.owed = []; if (!errands().includes(q)) errands().push(q); errandDone(q, []); raised = G.pendingEvent && G.pendingEvent.id === 'wAfter_' + k ? 1 : 0; }
      assert(raised && G.pendingEvent.c.o === q.id && owed().includes(q), k + ': the choice is raised out there, about the quest just done');
      const text = EVENTS['wAfter_' + k].text(G.pendingEvent.c), pay = q.owedPay, fame = q.owedFame, men = G.roster.length;
      assert(text.length > 60 && !/undefined|NaN/.test(text), k + ' says what was found');
      const out = answerEvent(i);
      assert(typeof out === 'string' && out.length > 20 && !/undefined|NaN/.test(out) && !badNumber(G), k + ' choice ' + i + ' gave: ' + out);
      if (k === 'champion' && i === 0) assert(G.roster.length === men + 1 && G.roster[men].name === q.boss && q.owedPay === round5(pay * 0.5), 'the beaten champion swears, and the noble pays half');
      if (k === 'ledger' && i === 2) assert(!owed().includes(q), 'the box given to the Guild: nobody waits at the fountain');
      if (k === 'ledger' && i === 1) assert(q.owedPay === round5(pay * 1.7), 'silence has its price');
      if (k === 'rescue' && i === 1) assert(q.owedFame === fame + 3, 'what the captives did is told');
    }
    // a man who has sworn to the house is not met again as somebody else's champion
    newGame(); G.roster[0].name = QUEST_NAMES.champion[0];
    for (let i = 0; i < 60; i++) assert(errandNew('champion').boss !== QUEST_NAMES.champion[0], 'a sworn man was named as an enemy'); }
  assert(goalHint(ERRANDS.wolves).length > 10 && goalHint(ERRANDS.bandits).length > 5 && goalHint(ERRANDS.heirloom) === '', 'the quest log says how it is best done');
  // what follows on is never offered cold
  newGame(); G.tally.wins = 1; G.fame = 5000;
  for (let i = 0; i < 400; i++) { const q = errandNew(); assert(q && !ERRANDS[q.tpl].chain, 'a follow-up was offered to a stranger: ' + (q && q.tpl)); }
  // a quest can be done well: how the fight went decides the bonus, or the loss
  { newGame(); G.tally.wins = 1; assert(wildEnter(), 'out');
    const a = errandNew('wolves'); errands().push(a); errandDone(a, [], { time: 20, down: 0, n: 5 });
    const b = errandNew('wolves'); errands().push(b); errandDone(b, [], { time: 20, down: 2, n: 5 });
    assert(a.owedPay === round5(a.pay * 1.25) && a.well && b.owedPay === b.pay && !b.well, 'wolves: clean work is paid a quarter more');
    const c = errandNew('rescue'); errands().push(c); errandDone(c, [], { time: 10, down: 3, n: 5 });
    const d = errandNew('rescue'); errands().push(d); errandDone(d, [], { time: 300, down: 0, n: 5 });
    assert(c.owedPay === c.pay && d.owedPay === round5(d.pay * 0.7), 'a slow rescue costs captives, and pay');
    const e = errandNew('champion'); errands().push(e); errandDone(e, [], { time: 99, down: 0, n: 5 });
    assert(e.owedFame === e.fame + 4, 'a champion beaten without a man down is worth more fame'); }
  // giving the purse back is worth more fame than taking it
  { newGame(); G.tally.wins = 1; assert(wildEnter(), 'out'); const q = errandNew('heirloom'); errands().push(q); errandDone(q, []); const purse = G.denarii, fame = G.fame; errandPay(q.id, true);
    assert(G.denarii === purse && G.fame === fame + q.fame + 2 && asksNow().length === 1 && asksNow()[0].tpl === 'buried', 'the purse refused: more fame, no coin, and she still has more to say'); }
  // one who waits a month for you sends most of it round
  { newGame(); G.tally.wins = 1; assert(wildEnter(), 'out'); const q = errandNew('bandits'); errands().push(q); errandDone(q, []); const purse = G.denarii; G.day += 31; rollAsks();
    assert(!owed().length && G.denarii === purse + round5(q.pay * 0.8), 'left unclaimed a month, four parts in five are sent round'); }
  // the pieces people send you for are never found by chance in a ruin
  newGame(); for (let i = 0; i < 12; i++) { const it = wildRelic(); if (it) assert(!RELICS[it.relic].quest, 'a quest piece turned up by chance'); }
  // a rescue has two places: the second is marked only once somebody has talked
  newGame(); G.tally.wins = 1;
  { const q = errandNew('rescue'); errands().push(q); q.until = G.day + q.days;
    let st = wildSites().find(x => x.errand === q.id);
    assert(st.kind === 'errand_clue' && st.x === q.x && q.mark2 && q.mark2 !== q.mark, 'first, where he was last seen');
    q.step = 1; st = wildSites().find(x => x.errand === q.id);
    assert(st.kind === 'errand_fight' && st.x === q.x2 && st.y === q.y2 && st.name.includes(q.mark2.slice(1)), 'then, where they took him'); }
  // the difficulty follows the school: a new house is sent near, a great one far
  { newGame(); G.tally.wins = 1; let lo = 0, hi = 0; const N = 60;
    for (let i = 0; i < N; i++) { const q = errandNew('wolves'); lo += q.tier; }
    G.fame = 5000; for (let i = 0; i < N; i++) { const q = errandNew('wolves'); hi += q.tier; }
    assert(tier() >= 2 && hi / N > lo / N, 'a greater school is sent to worse places: ' + (lo / N).toFixed(2) + ' then ' + (hi / N).toFixed(2)); }
  // the fountain: nobody before the gate is open; then people come, wait three days, and go
  newGame();
  while (G.day < GAMES_EVERY) { G.day++; for (let i = 0; i < 20; i++) rollAsks(); }
  assert(!gateOpen() && !asksNow().length, 'nobody asks a house that has not yet fought its first games');
  G.tally.wins = 1; let came = 0, most = 0;
  for (let i = 0; i < 200; i++) { G.day++; const q = rollAsks(); if (q) came++; most = Math.max(most, asksNow().length); assert(asksNow().every(a => a.leaves >= G.day), 'those who have waited their three days are gone'); }
  assert(came >= 25 && came <= 110 && most <= 2, 'somebody new on about two days in five, never more than two waiting: ' + came + ', ' + most);
  // three in hand at most; and one left too long is lost, and talked of
  newGame(); G.tally.wins = 1; G.fame = 10;
  for (const k of ['wolves', 'bandits', 'heirloom', 'supplies']) { const q = errandNew(k); G.asks = [q]; errandTake(q.id); }
  assert(errands().length === 3 && asksNow().length === 1, 'a fourth is not taken while three are in hand');
  const late = errands()[0]; late.until = G.day - 1; G.day++; rollAsks();
  assert(errands().length === 2 && !errands().includes(late) && G.fame === 9 && !wildMap().marks['e' + late.id], 'a quest left too long is lost, and costs a little fame');
  // on the road: eleven things can stop the column, and the same one never twice running
  newGame(); G.tally.wins = 1; assert(wildEnter(), 'out through the gate');
  { const seen = new Set(); let last = null, rep = 0; for (let i = 0; i < 300; i++) { const id = roadEventId(); assert(EVENTS[id] && EVENTS[id].wild, id + ' is a matter of the road'); if (id === last) rep++; last = id; seen.add(id); }
    assert(seen.size === 11 && rep === 0, 'eleven things on the road, none twice running: ' + seen.size + ', ' + rep); }
  assert(!badNumber(G), 'no bad numbers');
}));
test('quests: a quest from an older save, with no leader named, still gives everyone in the fight a name', () => game()(function () {
  newGame();
  for (const k of Object.keys(ERRANDS)) { const T = ERRANDS[k]; if (!T.foes) continue;
    for (const tier of [1, 3, 5]) { const foes = T.foes({ id: 1, tpl: k, tier, mark: 'The gallows', mark2: 'The mill', pay: 0, fame: 0, giver: { name: 'X', kind: 'shepherd' } });
      assert(foes.length && foes.every(f => typeof f.name === 'string' && f.name.length), k + ': a foe with no name at danger ' + tier); } }
}));

test('saves: slots, backup, import, and upgrading old saves', () => game()(function () {
  assert(load() === false, 'nothing to load at first');
  newGame(); const legacy = JSON.parse(JSON.stringify(G));
  for (const k of ['staff', 'hires', 'patrons', 'gifts', 'autoRest', 'fix', 'houses', 'festival', 'tourney', 'tut', 'bonds', 'armoury', 'smith', 'dynasty', 'tally', 'ruin']) delete legacy[k];
  legacy.roster.forEach(g => { delete g.xp; delete g.rank; delete g.perkPending; delete g.perkOffer; delete g.story; delete g.wish; delete g.gear; g.wins = 4; });
  legacy.roster[0].weapon = 2; legacy.roster[0].armor = 3;
  for (const k in mem) delete mem[k];
  mem['ludus-magnus-save-v1'] = JSON.stringify(legacy); G = null;
  assert(load() && slot === 1 && !('ludus-magnus-save-v1' in mem) && mem['ludus-magnus-slot-1'], 'old single save moves to slot 1');
  assert(G.houses.length === 5 && G.festival && G.patrons && G.tut && Array.isArray(G.bonds) && G.dynasty.gen === 1 && G.tally.wins === 8 && Array.isArray(G.armoury) && G.smith.stock.length === 4 && G.roster[0].gear.weapon.r === 4 && ARMOR_SLOTS.every(sl => G.roster[0].gear[sl].r === 5) && G.roster[0].armor === 0 && SLOTS.every(sl => G.roster[1].gear[sl] === null) && G.roster.every(g => Array.isArray(g.story)) && G.roster.every(g => g.rank > 0 && g.perkPending > 0), 'old save gains the newer systems');
  for (let i = 0; i < 7; i++) { endDay(); G.pendingEvent = null; }
  assert(slotInfo(1).day === 8 && slotInfo(1, true).day === 5, 'autosave and games-day backup');
  assert(copyToSlot(3) && slotInfo(3).day === 8, 'copy to another slot');
  save(); slot = 2; newGame(); assert(slotInfo(2).day === 1 && slotInfo(1).day === 8, 'a new game in slot 2 leaves slot 1 alone');
  assert(loadSlot(1, true) && G.day === 5 && slot === 1, 'restore the backup');
  const file = JSON.stringify(readSlot(3));
  assert(importSave(file, 5) === null && slotInfo(5).day === 8, 'import a good file');
  for (const junk of ['hello', '{"a":1}', '[1,2]', 'null', '']) assert(typeof importSave(junk, 4) === 'string' && !slotInfo(4), 'junk file refused: ' + junk);
  deleteSlot(3); assert(!slotInfo(3), 'delete');
  G = null; assert(load() && slot === 1 && G.day === 5, 'restart resumes the slot last played');
}));

if (!quick) {
  console.log('\nBalance (simulated)');

  test('fighting styles are evenly matched', () => {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'duels.js'), root], { encoding: 'utf8', maxBuffer: 1 << 24 });
    assert(r.status === 0, 'duels.js failed: ' + r.stderr.slice(0, 200));
    const d = JSON.parse(r.stdout), out = [];
    for (const key of ['classWins@22', 'classWins@40']) for (const c in d[key]) {
      const rate = d[key][c] / 1200;
      out.push(rate);
      assert(rate >= 0.38 && rate <= 0.62, `${c} wins ${(rate * 100).toFixed(0)}% of duels (${key}); allowed 38-62%`);
    }
    for (const k of ['avgTime@22', 'avgTime@40']) assert(+d[k] >= 9 && +d[k] <= 22, 'average duel lasts ' + d[k] + 's; allowed 9-22s');
    assert(d.starterWin_easy > d.starterWin_even && d.starterWin_even > d.starterWin_hard, 'easier bouts should be won more often');
    return `${(Math.min(...out) * 100).toFixed(0)}-${(Math.max(...out) * 100).toFixed(0)}% win rates, ${d['avgTime@22']}s duels`;
  });

  test('a careful player usually wins the campaign', () => {
    // Measured at about 85% over 60 runs. With 30 runs, chance alone almost never drops it below 18.
    const r = spawnSync(process.execPath, [path.join(__dirname, 'autoplay.js'), root, '30', 'good'], { encoding: 'utf8', maxBuffer: 1 << 24 });
    assert(r.status === 0, 'autoplay.js failed: ' + r.stderr.slice(0, 200));
    const d = JSON.parse(r.stdout), won = d.results.won;
    assert(won >= 18, `careful auto-player won only ${won} of 30 campaigns; expected at least 18`);
    assert(d.medianWinDay >= 120 && d.medianWinDay <= 340, 'median victory on day ' + d.medianWinDay + '; allowed 120-340');
    assert(d.medianTierDay[0] <= 45, 'second arena reached on day ' + d.medianTierDay[0] + '; expected by day 45');
    assert(d.winRate >= 0.5 && d.winRate <= 0.85, 'bout win rate ' + d.winRate + '; allowed 0.50-0.85');
    return `${won}/30 campaigns won, median day ${d.medianWinDay}, ${Math.round(d.winRate * 100)}% of bouts`;
  });
}

if (!noExe) {
  console.log('\nDesktop build');
  const exe = path.join(root, 'dist', 'LudusMagnus.exe');
  test('exe is newer than the game files', () => {
    assert(fs.existsSync(exe), 'dist\\LudusMagnus.exe is missing; run desktop\\build.ps1');
    const built = fs.statSync(exe).mtimeMs;
    const src = ['index.html', 'desktop/Program.cs'].concat(fs.readdirSync(path.join(root, 'js')).map(f => 'js/' + f), fs.readdirSync(path.join(root, 'css')).map(f => 'css/' + f));
    const stale = src.filter(f => fs.statSync(path.join(root, f)).mtimeMs > built);
    assert(!stale.length, 'exe is older than ' + stale.join(', ') + '; run desktop\\build.ps1');
  });
  test('exe launches and shows the game', () => {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'check-exe.js')], { encoding: 'utf8', timeout: 90000 });
    assert(r.status === 0, (r.stdout || r.stderr || 'no output').trim().slice(0, 300));
  });
}

console.log(`\n${failures.length ? 'FAILED' : 'ALL PASSED'}: ${passed} passed, ${failures.length} failed${quick ? ' (quick run: balance and exe checks skipped)' : noExe ? ' (exe launch skipped)' : ''}`);
if (failures.length) console.log('Failed: ' + failures.join('; '));
process.exit(failures.length ? 1 : 0);
