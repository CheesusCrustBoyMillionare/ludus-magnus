// Headless duels: style-vs-style win rates and fight length.
// usage (from the project folder): node tools/duels.js .
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2];
const ctx = { console, Math, localStorage: { getItem: () => null, setItem() {} } };
vm.createContext(ctx);
const src = ['data', 'sim', 'combat'].map(f => fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8')).join('\n');
vm.runInContext(src + `
newGame();
function run(a, b) { const B = createBattle(a, b, {}); let n = 0; while (!B.over && n++ < 20000) stepBattle(B, 1/30); return B; }
const res = {};
// class vs class at equal budget
const cls = Object.keys(CLASSES);
for (const budget of [22, 40]) {
  const wins = {}; cls.forEach(c => wins[c] = 0); let T = 0, N = 0;
  for (const a of cls) for (const b of cls) { if (a === b) continue;
    for (let i = 0; i < 150; i++) { const B = run([makeGladiator(budget, {cls:a})], [makeGladiator(budget, {cls:b})]); if (B.winner === 0) wins[a]++; else wins[b]++; T += B.time; N++; } }
  res['classWins@' + budget] = wins; res['avgTime@' + budget] = (T / N).toFixed(1);
}
// starter vs tier-0 bouts
for (const d of ['easy','even','hard']) { let w = 0; for (let i = 0; i < 400; i++) { const B = run([makeGladiator(23)], [makeEnemy(ENEMY_BUDGET[0]*DIFF[d].stat, 0)]); if (B.winner === 0) w++; } res['starterWin_' + d] = w / 400; }
let w3 = 0, t3 = 0; for (let i = 0; i < 100; i++) { const B = run([1,2,3].map(()=>makeGladiator(40)), [1,2,3].map(()=>makeGladiator(40))); if (B.winner===0) w3++; t3 += B.time; }
res.melee3v3 = { winA: w3/100, avgTime: (t3/100).toFixed(1) };
// day loop smoke test
for (let i = 0; i < 40; i++) { G.roster.forEach(g => g.activity = pick(['str','agi','end','skl','rest'])); endDay(); G.pendingEvent = null; }
res.afterDays = { day: G.day, den: G.denarii, stats: G.roster.map(g => statSum(g)), bouts: G.bouts && G.bouts.length };
console.log(JSON.stringify(res, null, 1));
`, ctx);
