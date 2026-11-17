// Auto-player: plays full campaigns headless and reports how they went.
// usage (from the project folder): node tools/autoplay.js . [runs] [good|casual]
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], RUNS = +(process.argv[3] || 30), SKILL = process.argv[4] || 'good';
const ctx = { console, Math, RUNS, SKILL, localStorage: { getItem: () => null, setItem() {} } };
vm.createContext(ctx);
const src = ['data', 'sim', 'combat'].map(f => fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8')).join('\n');
vm.runInContext(src + `
const good = SKILL === 'good';
const WAGERS = [500, 250, 100, 50, 25];
const R_debt = { n: 0 };
const huntStats = [0, 0, 0, 0];
let gearSpend = 0;
const calib = {}; // predicted win chance bucket -> [fights, wins]
const tierStats = [0,1,2,3,4].map(() => ({ bouts: 0, wins: 0, deaths: 0 }));

function reserve() { return upkeep() * 6 + 30; }
function spare() { return G.denarii - reserve(); }

function botSpend() {
  const t = tier();
  // in debt: cut costs the way a person would
  if (G.denarii < 0) {
    G.ration = 0;
    for (const k of Object.keys(G.staff)) delete G.staff[k];
    for (const it of G.armoury.slice()) sellItem(it.id);
    if (G.debtDays >= 1 && G.roster.length > 2) { const w = G.roster.slice().sort((x, y) => statSum(x) - statSum(y))[0]; G.denarii += Math.round(value(w) / 2); G.roster = G.roster.filter(x => x !== w); }
    R_debt.n++;
    return;
  }
  // recruits
  const want = Math.min(capacity(), 3 + t);
  let guard = 0;
  while (G.roster.length < want && guard++ < 5) {
    const opts = G.market.filter(m => m.price <= (G.roster.length < 2 ? G.denarii : spare())).sort((a, b) => statSum(b) / b.price - statSum(a) / a.price);
    if (!opts.length) break;
    const m = good ? opts.slice().sort((a, b) => statSum(b) - statSum(a))[0] : opts[0];
    G.denarii -= m.price; delete m.price; G.market = G.market.filter(x => x !== m); G.roster.push(m);
  }
  // replace the weakest with clearly better stock
  if (good && G.roster.length >= capacity() && G.roster.length > 2) {
    const worst = G.roster.slice().sort((a, b) => statSum(a) - statSum(b))[0];
    const better = G.market.filter(m => statSum(m) >= statSum(worst) + 8 && m.price <= spare() + value(worst) / 2).sort((a, b) => statSum(b) - statSum(a))[0];
    if (better && canFight(worst)) {
      G.denarii += Math.round(value(worst) / 2); G.roster = G.roster.filter(x => x !== worst);
      G.denarii -= better.price; delete better.price; G.market = G.market.filter(x => x !== better); G.roster.push(better);
    }
  }
  // staff
  for (const h of G.hires.slice()) {
    const cur = G.staff[h.role];
    if ((!cur || cur.skill < h.skill) && spare() - h.fee > (good ? 40 : 150) && (h.role !== 'scout' || G.denarii > 600)) {
      G.denarii -= h.fee; G.staff[h.role] = { name: h.name, skill: h.skill, wage: h.wage }; G.hires = G.hires.filter(x => x !== h);
    }
  }
  // gear: hand out spare pieces, then buy whatever improves someone, best pieces first
  const wants = it => G.roster.filter(g => fits(it, g) && (!g.gear[it.slot] || g.gear[it.slot].r < it.r)).sort((a, b) => power(b) - power(a))[0];
  for (const it of G.armoury.slice().sort((a, b) => b.r - a.r)) { const g = wants(it); if (g) equip(g, it.id); }
  for (const it of G.smith.stock.slice().sort((a, b) => b.r - a.r)) {
    const g = wants(it);
    if (!g || spare() < buyPrice(it)) continue;
    if (buyItem(it.id)) { equip(g, it.id); gearSpend += buyPrice(it); }
  }
  for (const it of G.armoury.slice()) if (!wants(it)) sellItem(it.id);       // junk nobody needs
  if (G.smith.level < 4 && spare() > SMITH_COST[G.smith.level] + (good ? 250 : 600)) upgradeSmith();
  // facilities
  const order = G.roster.length >= capacity() ? ['barracks', 'ground', 'infirmary', 'baths'] : ['ground', 'infirmary', 'baths', 'barracks'];
  for (const k of order) {
    if (G.fac[k] < 3 && spare() >= FAC_COST[G.fac[k]] + (good ? 0 : 150)) { G.denarii -= FAC_COST[G.fac[k]]; G.fac[k]++; }
  }
  G.ration = G.denarii > 500 ? 2 : G.denarii > 60 ? 1 : 0;
  if (good && G.denarii > 900 && G.patrons.magistrate < 60 && spare() > giftCost('magistrate') + 300) { const c = giftCost('magistrate'); G.denarii -= c; G.gifts.magistrate++; favor('magistrate', 10); }
}

function botTrain() {
  for (const g of G.roster) {
    const bias = CLASSES[g.cls].bias;
    const tired = g.fatigue > (good ? 55 : 70) || g.hp < maxHp(g) * 0.75 || (daysToGames() <= 1 && g.fatigue > 25);
    if (tired) { g.activity = 'rest'; continue; }
    let best = 'str', bv = -1;
    for (const s of STATS) { const v = bias[s] * g.pot[s] / (1 + g.stats[s] * 0.08); if (v > bv && g.stats[s] < 20) { bv = v; best = s; } }
    g.activity = good ? best : pick(STATS);
  }
}

function botTourney(R) {
  const T = G.tourney;
  if (!T || T.state !== 'open') return;
  const g = G.roster.filter(x => canFight(x) && x.hp > maxHp(x) * 0.85).sort((a, b) => power(b) - power(a))[0];
  const best = tRival(T.field[0]);
  if (!g || !best || G.denarii < T.fee + 40 || winOdds([g], [best]).p < (good ? 0.4 : 0.25)) return;
  enterTourney(g.id); R.tEntered = (R.tEntered || 0) + 1;
  let guard = 0;
  while (G.tourney.state === 'running' && G.tourney.bout && guard++ < 4) {
    const b = G.tourney.bout, me = byId(G.tourney.entrant);
    if (!me) break;
    const B = createBattle([me], boutEnemies(b), { death: false, mercy: [mercyBonus(), 0], noIntro: true });
    let n = 0; while (!B.over && n++ < 30000) stepBattle(B, 1 / 30);
    const before = G.roster.length;
    const r = applyBoutResult(b, B, 0, 1);
    R.bouts++; if (r.win) R.wins++; R.deaths += before - G.roster.length; R.purses += r.purse;
    R.tRounds = (R.tRounds || 0) + (r.win ? 1 : 0);
  }
  if (G.tourney.champion === 'you') R.tWon = (R.tWon || 0) + 1;
}

function botFight(R) {
  botTourney(R);
  const bouts = G.bouts.filter(b => !b.done).sort((a, b) => (b.final ? 1 : 0) - (a.final ? 1 : 0) || b.fame - a.fame);
  for (const b of bouts) {
    const avail = G.roster.filter(g => canFight(g) && g.hp > maxHp(g) * 0.7).sort((a, b2) => power(b2) - power(a));
    if (avail.length < b.size) continue;
    const team = avail.slice(0, b.size);
    const o = winOdds(team, boutEnemies(b));
    const need = b.final ? 0.55 : b.grudge ? 0.65 : b.hunt ? 0.6 : b.death ? (good ? 0.65 : 0.5) : (good ? 0.5 : 0.35);
    if (o.p < need) continue;
    let wager = 0;
    if (good && o.p > 0.6) wager = WAGERS.find(w => w <= G.denarii * 0.12) || 0;
    G.denarii -= wager;
    const t = b.final ? 4 : tier();
    const B = createBattle(team, boutEnemies(b), { death: b.death, mercy: [mercyBonus(), 0], noIntro: true, hunt: !!b.hunt });
    if (b.grudge) R.grudges = (R.grudges || 0) + 1;
    if (b.hunt) { R.hunts = (R.hunts || 0) + 1; }
    if (b.melee) R.melees = (R.melees || 0) + 1;
    let n = 0; while (!B.over && n++ < 30000) stepBattle(B, 1 / 30);
    const before = G.roster.length;
    const r = applyBoutResult(b, B, wager, o.pay);
    if (b.hunt) { huntStats[0]++; if (r.win) huntStats[1]++; huntStats[2] += before - G.roster.length; huntStats[3] += o.p; }
    const k = Math.min(9, Math.floor(o.p * 10)); calib[k] = calib[k] || [0, 0]; calib[k][0]++; if (r.win) calib[k][1]++;
    tierStats[t].bouts++; if (r.win) tierStats[t].wins++; tierStats[t].deaths += before - G.roster.length;
    R.bouts++; if (r.win) R.wins++; R.deaths += before - G.roster.length; R.purses += r.purse; R.wagerNet += r.wagerGain - wager;
  }
}

function botEvent() {
  const pe = G.pendingEvent, E = EVENTS[pe.id];
  let i = 0;
  if (pe.id === 'fix' || pe.id === 'merchant') i = pe.id === 'fix' ? 1 : 0;
  if (pe.id === 'freedom' || pe.id === 'promiseDue') i = 1;      // the bot never gives a fighter away
  if (pe.id === 'trainer' && !good) i = 1;
  const o = E.opts[i];
  if (!o.ok || o.ok(pe.c)) o.run(pe.c); else E.opts[E.opts.length - 1].run(pe.c);
  G.pendingEvent = null;
}

// The bot's succession: take the best man, the first boon, and whatever the points will buy.
function botHeir() {
  const best = G.roster.slice().sort((a, b) => power(b) - power(a))[0];
  ruinFighter(best ? best.id : null);
  if (G.ruin.offers.length) ruinBoon(G.ruin.offers[G.ruin.offers.length - 1]);
  for (const k of ['blood', 'purse', 'cells', 'yard', 'credit', 'forge', 'name']) while (buyLegacy(k)) { /* spend */ }
  startHeir();
}

function playRun() {
  newGame();
  const R = { result: 'timeout', day: 0, tierDay: [1], bouts: 0, wins: 0, deaths: 0, purses: 0, wagerNet: 0, money: {}, power: {}, heirs: 0 };
  let total = 0;
  while (total < 700) {
    if (G.ruin) { botHeir(); R.heirs++; continue; }
    if (G.pendingEvent) botEvent();
    G.roster.forEach(g => { while (g.perkPending > 0) choosePerk(g, perkOffer(g)[0]); });
    botSpend();
    if (G.bouts) botFight(R);
    if (G.won) { R.result = 'won'; break; }
    if (G.over) { R.result = G.over; break; }
    botTrain();
    endDay(); total++;
    const t = tier(); if (R.tierDay[t] === undefined) R.tierDay[t] = G.day;
    if (G.fame >= FINAL_FAME && R.finalDay === undefined) R.finalDay = G.day;
    if (G.day % 25 === 0) { R.money[G.day] = G.denarii; R.power[G.day] = Math.round(Math.max(0, ...G.roster.map(statSum))); }
    if (G.over) { R.result = G.over; break; }
  }
  R.day = total; R.fame = G.fame; R.roster = G.roster.length; R.staff = Object.keys(G.staff).length;
  R.fac = Object.values(G.fac).reduce((a, b) => a + b, 0); R.endMoney = G.denarii;
  R.smith = G.smith.level; R.kit = Math.max(0, ...G.roster.map(g => gearPower(g)));
  return R;
}

const runs = []; for (let i = 0; i < RUNS; i++) runs.push(playRun());
const med = a => { const s = a.filter(x => x !== undefined).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const count = k => runs.filter(r => r.result === k).length;
const out2 = {
  skill: SKILL, runs: RUNS, dynasty: { runsThatFell: runs.filter(r => r.heirs > 0).length, mostHeirs: Math.max(...runs.map(r => r.heirs)), wonAfterFalling: runs.filter(r => r.heirs > 0 && r.result === 'won').length, wonFirstGeneration: runs.filter(r => r.heirs === 0 && r.result === 'won').length }, gear: { medianSmithLevel: med(runs.map(r => r.smith)), medianBestKit: med(runs.map(r => +r.kit.toFixed(2))), spendPerRun: Math.round(gearSpend / RUNS) },
  tourneys: { entered: med(runs.map(r => r.tEntered || 0)), won: med(runs.map(r => r.tWon || 0)), totalWon: runs.reduce((a, r) => a + (r.tWon || 0), 0), totalEntered: runs.reduce((a, r) => a + (r.tEntered || 0), 0) },
  hunts: { fought: huntStats[0], winRate: +(huntStats[1] / Math.max(1, huntStats[0])).toFixed(2), deathsPerHunt: +(huntStats[2] / Math.max(1, huntStats[0])).toFixed(3), avgOdds: +(huntStats[3] / Math.max(1, huntStats[0])).toFixed(2), perRun: med(runs.map(r => r.hunts || 0)) }, meleesPerRun: med(runs.map(r => r.melees || 0)), medianGrudgeBouts: med(runs.map(r => r.grudges || 0)), debtDaysTotal: R_debt.n,
  lossDays: runs.filter(r => r.result !== 'won').map(r => r.result[0] + r.day),
  results: { won: count('won'), debt: count('debt'), empty: count('empty'), timeout: count('timeout') },
  medianWinDay: med(runs.filter(r => r.result === 'won').map(r => r.day)),
  medianTierDay: [1, 2, 3].map(t => med(runs.map(r => r.tierDay[t]))),
  reachedTier: [1, 2, 3].map(t => runs.filter(r => r.tierDay[t] !== undefined).length),
  medianFinalUnlockDay: med(runs.map(r => r.finalDay)), reachedFinal: runs.filter(r => r.finalDay !== undefined).length,
  medianDeaths: med(runs.map(r => r.deaths)), winRate: +(runs.reduce((s, r) => s + r.wins, 0) / runs.reduce((s, r) => s + r.bouts, 0)).toFixed(2),
  medianMoneyByDay: Object.fromEntries([25, 50, 75, 100, 150, 200, 300].map(d => [d, med(runs.map(r => r.money[d]))])),
  medianBestStatSumByDay: Object.fromEntries([25, 50, 100, 150, 200, 300].map(d => [d, med(runs.map(r => r.power[d]))])),
  medianEnd: { money: med(runs.map(r => r.endMoney)), fac: med(runs.map(r => r.fac)), staff: med(runs.map(r => r.staff)), purses: med(runs.map(r => r.purses)), wagerNet: med(runs.map(r => r.wagerNet)) },
  tierWinRate: tierStats.map(t => t.bouts ? [t.bouts, +(t.wins / t.bouts).toFixed(2), +(t.deaths / t.bouts).toFixed(3)] : null),
  oddsCalibration: Object.fromEntries(Object.keys(calib).sort().map(k => [(k / 10).toFixed(1), [calib[k][0], +(calib[k][1] / calib[k][0]).toFixed(2)]])),
};
console.log(JSON.stringify(out2));
`, ctx);
