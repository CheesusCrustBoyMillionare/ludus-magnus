// Stamps index.html so that updates reach players on an ordinary refresh.
//
// Web hosts tell browsers they may reuse a file for a while (GitHub Pages: ten minutes). Without
// stamps, a refresh can pair a new page with old scripts. Here every script and stylesheet address
// carries a fingerprint of the file's contents (js/main.js?v=1a2b3c4d), so a changed file has a new
// address that no browser has cached. A combined "build" fingerprint lets the running game notice
// that a newer version has been published.
//
//   node tools/stamp.js           rewrite index.html if any fingerprint is out of date
//   node tools/stamp.js --check   change nothing; exit 1 if index.html is out of date
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const root = path.join(__dirname, '..');
const file = path.join(root, 'index.html');
const check = process.argv.includes('--check');
const print8 = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);

const before = fs.readFileSync(file, 'utf8');
const prints = [];
let after = before.replace(/\b(src|href)="((?:js|css)\/[\w.-]+)(?:\?v=[0-9a-f]*)?"/g, (m, attr, rel) => {
  const p = print8(fs.readFileSync(path.join(root, rel)));
  prints.push(rel + ':' + p);
  return `${attr}="${rel}?v=${p}"`;
});
if (!prints.length) { console.error('stamp: found no scripts or stylesheets in index.html'); process.exit(1); }

// the page's own markup counts too, so strip the old build mark before fingerprinting it
const meta = /[ \t]*<meta name="build" content="[0-9a-f]*">\r?\n/;
const bare = after.replace(meta, '');
const build = print8(prints.join('|') + '|' + bare);
after = bare.replace(/(<meta name="viewport"[^>]*>\r?\n)/, `$1<meta name="build" content="${build}">\n`);
if (!after.includes(`content="${build}"`)) { console.error('stamp: could not place the build mark in index.html'); process.exit(1); }

if (after === before) { console.log(`stamp: index.html is up to date (build ${build})`); process.exit(0); }
if (check) { console.error('stamp: index.html is out of date. Run: node tools/stamp.js'); process.exit(1); }
fs.writeFileSync(file, after);
console.log(`stamp: index.html updated (build ${build})\n  ${prints.join('\n  ')}`);
