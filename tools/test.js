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
  return acts.length + ' actions, ' + tipKeys.length + ' tooltips';
});

test('new game starts in a sane state', () => game()(function () {
  for (let i = 0; i < 30; i++) {
    newGame();
    assert(G.roster.length === 2 && G.roster[0].name !== G.roster[1].name, 'two starters with different names');
    assert(G.houses.length === 5 && G.houses.every(h => h.roster.length >= 3), 'five rival houses with fighters');
    assert(G.market.length === 4 && G.hires.length === 3, 'market and hiring hall stocked');
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
  // a request: a tithe paid is favour gained; one left undone is favour lost
  G.request = { patron: 'temple', type: 'tithe', cost: 30, day: G.day, favor: 9, pay: 0 }; let f0 = G.patrons.temple;
  assert(payTithe() && G.request.done && G.patrons.temple === f0 + 9, 'an offering made');
  G.request = { patron: 'guild', type: 'show', day: 1, favor: 8, pay: 40 }; f0 = G.patrons.guild;      // asked at an earlier games, and never done
  genRequest();
  assert(G.patrons.guild === f0 - 4, 'a request left undone costs favour');
  assert(!badNumber(G), 'patrons left a bad number');
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
    assert(offer.length === 3 && offer.every(t => TRAITS[t].good && !TRAITS[t].special && !g.traits.includes(t)), 'three new good perks on offer');
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
  assert(R.earned === Math.floor(160 / 20) + 0 + 9 + 5 && D.points === R.earned && D.history.length === 1 && D.history[0].gen === 1, 'legacy is worked out from how far the house got');
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
  assert(Object.keys(EVENTS).every(id => !EVENTS[id].auto || id === 'promiseDue' || id === 'quest' || EVENTS[id].field || EVENTS[id].wild || id === 'eagleHome' || Object.values(QUESTS).some(Q => Q.finale === id)) && !badNumber(G), 'only promises and matters from the road are raised outside the daily roll');
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
  assert(G.patrons.magistrate >= fav + fv - 1 && G.denarii > coin - 100 + pay - 1 && g.xp >= 2, 'paid in silver, favour and experience');
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

test('journeys: asked for, promised, and ended at a place in the province', () => game()(function () {
  newGame();
  for (const q in QUESTS) assert(EVENTS[QUESTS[q].finale] && questPlace(q) && wildSites().some(s => s.kind === questPlace(q)) && QUESTS[q].where.length > 10, q + ' has an ending and a place');
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
  // a place with nobody's journey in it says nothing
  newGame(); G.tally.wins = 1; wildEnter();
  assert(!siteLive(wildSites().find(x => x.kind === 'quarry')) && !wildVisit(wildSites().find(x => x.kind === 'quarry')), 'the quarries are only stone to a school with no brother in them');
  // more than one matter can wait for an answer
  newGame(); raiseEvent('feast', EVENTS.feast.make()); raiseEvent('vigil', EVENTS.vigil.make());
  assert(G.pendingEvent.id === 'feast' && G.eventQueue.length === 1, 'the second waits behind the first');
  answerEvent(1); assert(G.pendingEvent.id === 'vigil' && !G.eventQueue.length, 'and is raised when the first is answered');
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
