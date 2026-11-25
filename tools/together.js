// Runs several of the tools at once, each in a process of its own, and prints what they printed as one JSON array.
// usage: node tools/together.js '[["autoplay.js", ".", "20", "good"], ["race.js", ".", "20", "nowork"]]'
// The balance tests use it to play their campaigns on every core instead of one after another.
const path = require('path'), { spawn } = require('child_process');
const jobs = JSON.parse(process.argv[2]);
Promise.all(jobs.map(a => new Promise(done => {
  const c = spawn(process.execPath, [path.join(__dirname, a[0]), ...a.slice(1)]);
  let out = '', err = '';
  c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { err += d; });
  c.on('close', code => done({ code, out, err: err.slice(0, 400) }));
}))).then(all => {
  const bad = all.find(r => r.code !== 0);
  if (bad) { console.error(bad.err); process.exit(1); }
  console.log(JSON.stringify(all.map(r => JSON.parse(r.out))));
});
