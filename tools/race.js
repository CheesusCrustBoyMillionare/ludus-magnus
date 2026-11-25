// Race: plays whole campaigns by several different plans and reports how fast each wins.
// usage (from the project folder): node tools/race.js . [runs] ['{"name":"x", ...flags}' | name]
// It is the auto-player (autoplay.js) with its judgement made adjustable: every plan is the careful bot with a few
// of its habits changed. What each flag does is said beside it in PLANS below.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], RUNS = +(process.argv[3] || 20), ARG = process.argv[4] || 'base';
const PLANS = {
  base:      {},                                                  // the careful player, as the balance test plays him
  bold:      { bold: 0.15 },                                      // takes bouts at worse odds
  stakes:    { stakes: 0.7 },                                     // raises the stakes to the death wherever he is well favoured
  stakesAll: { stakes: 0.55 },                                    // ... or merely favoured
  elite:     { want: 3, wantT: 0 },                               // three men, and everything spent on them
  wide:      { want: 9, wantT: 0, barracksFirst: true },          // as many men as there are cells, cells first
  plan:      { plan: true },                                      // fills the card as the Fill the card button does
  home:      { noQuests: true, noJobs: true },                    // never leaves town, sends nobody away
  nowork:    { noJobs: true },                                    // takes no contracts: the games, the quests, and what he has put by
  spend:     { noSave: true },                                    // puts nothing by for the month the arena is shut
  idle:      { noJobs: true, noSave: true },                      // neither works nor saves
  quests:    { questBold: 1.25 },                                 // goes out for quests even against the stronger
  favour:    { gifts: true, sponsor: true },                      // buys the Magistrate, and puts his name on festivals
  wagers:    { wager: 0.3 },                                      // bets a third of the purse when favoured
  hard:      { regimen: 2, ration: 2 },                           // hard regimen, best table
  gear:      { gearFirst: true },                                 // the smith before the school
  notrain:   { noFac: true },                                     // builds nothing
  eagle:     { eagle: 1.15 },                                     // goes for the lost eagle as soon as he is strong enough
  finalBold: { finalAt: 0.2 },                                    // tries the Emperor's Games every games day, whatever the odds
  finalMid:  { finalAt: 0.4 },
  buyup:     { swapAt: 3 },                                       // trades up to any better man the dealer shows
  ground:    { groundFirst: true },                               // the training ground before anything else
  three:     { want: 4, wantT: 0, swapAt: 3, groundFirst: true }, // four men, traded up hard and trained hard
  rush:      { finalAt: 0.2, bold: 0.1, swapAt: 4, groundFirst: true, regimen: 2, ration: 2 },      // everything that looked quick, together
};
const SPEC = JSON.stringify(Object.assign({ name: ARG }, ARG.trim().startsWith('{') ? JSON.parse(ARG) : PLANS[ARG] || {}));
let bot = fs.readFileSync(path.join(__dirname, 'autoplay.js'), 'utf8');
const a = bot.indexOf('vm.runInContext(src + `') + 'vm.runInContext(src + `'.length, b = bot.lastIndexOf('`, ctx);');
bot = bot.slice(a, b).replace(/\\`/g, '`').replace(/\\\$/g, '$');
const rep = (x, y) => { if (bot.split(x).length !== 2) throw new Error('race.js: the auto-player has changed; not found: ' + x.slice(0, 70)); bot = bot.replace(x, () => y); };
rep(`const good = SKILL === 'good';`, `const good = true, S = JSON.parse(SPEC), SRC = { arena: 0, tourney: 0, quest: 0, eagle: 0, other: 0 }; let fameMark = 0;
const FIN = [], CAL = {}, RAW = [];
const credit = k => { SRC[k] += G.fame - fameMark; fameMark = G.fame; };`);
rep(`function reserve() { return upkeep() * (good ? Math.max(6, putBy()) : 6) + 30; }`, `function reserve() { return upkeep() * (S.noSave ? 6 : Math.max(6, putBy())) + 30; }`);
rep(`  const want = Math.min(capacity(), 3 + t);`, `  const want = Math.min(capacity(), (S.want !== undefined ? S.want : 3) + t * (S.wantT !== undefined ? S.wantT : 1));
  if (S.regimen !== undefined) G.regimen = S.regimen;
  if (S.barracksFirst && G.fac.barracks < 3 && spare() >= FAC_COST[G.fac.barracks]) { G.denarii -= FAC_COST[G.fac.barracks]; G.fac.barracks++; }
  if (S.gifts) for (let n = 0; n < 3 && G.patrons.magistrate < 80 && spare() > giftCost('magistrate') + 60; n++) { const c = giftCost('magistrate'); G.denarii -= c; G.gifts.magistrate++; favor('magistrate', 10); }
  if (S.sponsor && typeof sponsorBlock === 'function' && !sponsorBlock() && spare() > sponsorCost()) sponsorFestival();
  if (S.gearFirst && G.smith.level < 4 && spare() > SMITH_COST[G.smith.level]) upgradeSmith();`);
rep(`  const order = G.roster.length >= capacity() ? ['barracks', 'ground', 'infirmary', 'baths'] : ['ground', 'infirmary', 'baths', 'barracks'];`,
    `  const order = S.noFac ? [] : S.groundFirst ? ['ground', 'barracks', 'infirmary', 'baths'] : G.roster.length >= capacity() ? ['barracks', 'ground', 'infirmary', 'baths'] : ['ground', 'infirmary', 'baths', 'barracks'];`);
rep(`  G.ration = G.denarii > 500 ? 2 : G.denarii > 60 ? 1 : 0;`, `  G.ration = S.ration !== undefined && G.denarii > 60 ? S.ration : G.denarii > 500 ? 2 : G.denarii > 60 ? 1 : 0;`);
rep(`  botTourney(R);
  const bouts = G.bouts.filter(b => !b.done).sort((a, b) => (b.final ? 1 : 0) - (a.final ? 1 : 0) || b.fame - a.fame);
  for (const b of bouts) {
    const avail = G.roster.filter(g => boutFit(b, g) && g.hp > maxHp(g) * 0.7).sort((a, b2) => power(b2) - power(a));
    if (avail.length < b.size) continue;
    const team = avail.slice(0, b.size);
    const o = winOdds(team, boutEnemies(b));
    const need = b.final ? 0.55 : b.grudge ? 0.65 : b.hunt ? 0.6 : b.death ? (good ? 0.65 : 0.5) : (good ? 0.5 : 0.35);
    if (o.p < need) continue;
    let wager = 0;
    if (good && o.p > 0.6) wager = WAGERS.find(w => w <= G.denarii * 0.12) || 0;`, `  credit('other'); botTourney(R); credit('tourney');
  const bouts = G.bouts.filter(b => !b.done).sort((a, b) => (b.final ? 1 : 0) - (a.final ? 1 : 0) || b.fame - a.fame);
  const CP = S.plan ? cardPlan().plan : null;
  for (const b of bouts) {
    const avail = G.roster.filter(g => boutFit(b, g) && g.hp > maxHp(g) * 0.7).sort((a, b2) => power(b2) - power(a));
    if (avail.length < b.size) continue;
    const planned = CP && CP[b.id] && CP[b.id].map(byId).filter(g => g && boutFit(b, g));
    const team = planned && planned.length === b.size ? planned : avail.slice(0, b.size);
    let o = winOdds(team, boutEnemies(b));
    const need = b.final && S.finalAt !== undefined ? S.finalAt : (b.final ? 0.55 : b.grudge ? 0.65 : b.hunt ? 0.6 : b.death ? 0.65 : 0.5) - (S.bold || 0);
    if (o.p < need) continue;
    if (S.stakes && o.p >= S.stakes && !stakesBlock(b)) { raiseStakes(b.id); R.raised = (R.raised || 0) + 1; }
    let wager = 0;
    if (good && o.p > 0.6) wager = WAGERS.find(w => w <= G.denarii * (S.wager || 0.12)) || 0;`);
rep(`    R.bouts++; if (r.win) R.wins++; R.deaths += before - G.roster.length; R.purses += r.purse; R.wagerNet += r.wagerGain - wager;
  }
}`, `    R.bouts++; if (r.win) R.wins++; R.deaths += before - G.roster.length; R.purses += r.purse; R.wagerNet += r.wagerGain - wager;
    if (b.final) { FIN.push([Math.round(o.p * 100), r.win ? 1 : 0]); R.finals = (R.finals || 0) + 1; }
    { const key = (b.final ? 'final' : t >= 3 ? 'great' : 'lower') + b.size, kk = Math.min(9, Math.floor(o.p * 10)); CAL[key] = CAL[key] || {}; CAL[key][kk] = CAL[key][kk] || [0, 0]; CAL[key][kk][0]++; if (r.win) CAL[key][kk][1]++; RAW.push([b.final ? 1 : 0, b.size, +o.p.toFixed(3), r.win ? 1 : 0]); }
  }
  credit('arena');
}
// The lost eagle, as a plan: when the school is strong enough it marches out and follows the trail to its end, a few
// days' march for each place, and gives the eagle back to Rome. (The bot is set on the trail; a player has to find it.)
function botEagle(R) {
  if (!S.eagle || G.field || !gateOpen() || G.ruin || wildMap().story >= 6 || isGamesDay() || daysToGames() !== GAMES_EVERY - 1) return 0;
  const party = fieldParty(); if (party.length < 3 || party.reduce((n, g) => n + g.hp / maxHp(g), 0) / party.length < 0.8) return 0;
  const M = wildMap(), steps = { 2: () => wildMen(4, 6), 3: () => chiefFoes(), 4: () => barrowFoes() };
  if (M.story < 2) M.story = 2;
  if (!steps[M.story] && M.story !== 5) return 0;
  if (M.story < 5) { const th = strength(steps[M.story]()), me = yours(); R.eagleLook = (R.eagleLook || 0) + 1; R.eagleGap = Math.round(th / Math.max(1, me) * 100); if (th * S.eagle > me) return 0; }
  if (!wildEnter()) return 0;
  credit('other');
  const start = G.day, march = n => { for (let i = 0; i < n && G.field && !G.ruin; i++) { fieldDay('march'); while (G.pendingEvent) botEvent(); if (G.field && G.field.fight) botWildFight(); } };
  march(3);
  if (G.field && M.story < 5) { const id = { 2: 'wBattlefield', 3: 'wChief', 4: 'wBarrow' }[M.story], c = { sid: { 2: 'battlefield', 3: 'chief', 4: 'barrow' }[M.story] };
    if (fieldParty().length >= 2) { EVENTS[id].opts[0].run(c); if (G.field && G.field.fight) botWildFight(); } while (G.pendingEvent) botEvent(); R.eagleSteps = (R.eagleSteps || 0) + 1; }
  march(3);
  if (G.field) wildLeave();
  if (M.story === 5) { M.story = 6; M.eagle = 'rome'; G.fame += 250; favor('magistrate', 20); R.eagleDay = G.day; }
  while (G.pendingEvent) botEvent();
  credit('eagle');
  return G.day - start;
}`);
rep(`    const better = G.market.filter(m => statSum(m) >= statSum(worst) + 8 &&`, `    const better = G.market.filter(m => statSum(m) >= statSum(worst) + (S.swapAt || 8) &&`);
rep(`  if (!good) return;
  if (isGamesDay()) return;`, `  if (S.noJobs) return;
  if (isGamesDay()) return;`);
rep(`  if (!good || G.field || !gateOpen() || G.ruin) return 0;`, `  if (S.noQuests || G.field || !gateOpen() || G.ruin) return 0;`);
rep(`  if (T.foes && strength(T.foes(q)) > yours() * 1.0) return 0;                                    // not until they are strong enough`, `  if (T.foes && strength(T.foes(q)) > yours() * (S.questBold || 1.0)) return 0;                                    // not until they are strong enough`);
rep(`    { const away = botQuest(R); total += away; R.questDays = (R.questDays || 0) + away; }`, `    { credit('other'); const away = botQuest(R); credit('quest'); total += away; R.questDays = (R.questDays || 0) + away; }
    { const away = botEagle(R); total += away; R.eagleDays = (R.eagleDays || 0) + away; }`);
rep(`  newGame();
  const R = {`, `  newGame(); fameMark = G.fame;
  const R = {`);
// a man walked in from a story of the province (S.recruit: { day, budget, away }): the days away are spent, and he is in the school
rep(`    botSpend();
    if (G.bouts) botFight(R);`, `    if (S.recruit && !R.recruited && G.day >= S.recruit.day && !isGamesDay() && daysToGames() === GAMES_EVERY - 1 && (!S.recruit.budget || G.roster.length < capacity())) { R.recruited = G.day; for (let i = 0; i < (S.recruit.away || 0); i++) { endDay(); total++; while (G.pendingEvent) botEvent(); } if (S.recruit.budget) { const g = taleRecruit('Buccio the Ox', S.recruit.fair ? taleBudget(S.recruit.budget, 6) : S.recruit.budget, 'murmillo', 'x'); if (!g.traits.includes('ironhide')) g.traits.push('ironhide'); g.hp = maxHp(g); } G.denarii += S.recruit.coin || 0; }
    botSpend();
    if (G.bouts) botFight(R);`);
// the report: how fast, how surely, and where the fame came from
const tail = bot.indexOf('const runs = []; for (let i = 0; i < RUNS; i++) runs.push(playRun());');
bot = bot.slice(0, tail) + `const runs = []; for (let i = 0; i < RUNS; i++) { const r = playRun(); credit('other'); runs.push(r); }
const med = a => { const s = a.filter(x => x !== undefined && x !== null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const won = runs.filter(r => r.result === 'won'), tot = Object.values(SRC).reduce((a, b) => a + b, 0) || 1;
console.log(JSON.stringify({ plan: S.name, runs: RUNS, won: won.length, medianWinDay: med(won.map(r => r.day)), winDays: won.map(r => r.day), fastest: won.length ? Math.min(...won.map(r => r.day)) : null,
  finalUnlock: med(runs.map(r => r.finalDay)), tierDays: [1, 2, 3].map(t => med(runs.map(r => r.tierDay[t]))),
  winRate: +(runs.reduce((s, r) => s + r.wins, 0) / Math.max(1, runs.reduce((s, r) => s + r.bouts, 0))).toFixed(2), boutsPerRun: Math.round(runs.reduce((s, r) => s + r.bouts, 0) / RUNS),
  deaths: med(runs.map(r => r.deaths)), raised: med(runs.map(r => r.raised || 0)), heirs: runs.filter(r => r.heirs > 0).length,
  fameFrom: Object.fromEntries(Object.entries(SRC).map(([k, v]) => [k, Math.round(v / tot * 100) + '%'])), finals: +(runs.reduce((a, r) => a + (r.finals || 0), 0) / RUNS).toFixed(2), finalByOdds: (() => { const o = {}; for (const [p, w] of FIN) { const k = Math.min(9, Math.floor(p / 10)) * 10; o[k] = o[k] || [0, 0]; o[k][0]++; o[k][1] += w; } return Object.fromEntries(Object.entries(o).map(([k, v]) => [k + '%', v[1] + '/' + v[0]])); })(), cal: Object.fromEntries(Object.entries(CAL).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([p, w]) => [p / 10, w[0] + ':' + (w[1] / w[0]).toFixed(2)]))])), raw: RAW, eagleDay: med(runs.map(r => r.eagleDay)), eagleLook: med(runs.map(r => r.eagleLook || 0)), eagleGap: med(runs.map(r => r.eagleGap)), eagleSteps: med(runs.map(r => r.eagleSteps || 0)),
  lost: runs.filter(r => r.result !== 'won').map(r => r.result[0] + r.day).join(' ') }));
`;
const ctx = { console, Math, RUNS, SKILL: 'good', SPEC, localStorage: { getItem: () => null, setItem() {} } };
vm.createContext(ctx);
const src = ['data', 'sim', 'jobs', 'wilds', 'combat', 'abilities'].map(f => fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8')).join('\n');
vm.runInContext(src + bot, ctx);
