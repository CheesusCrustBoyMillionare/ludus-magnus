'use strict';
// Interface art drawn in code: small pixel icons for stats and gear slots, and a picture for every
// piece of equipment. Icons become CSS classes (.ic-health and so on); item pictures are painted
// onto <canvas data-item="slot:rarity:style"> elements after each render.

const ART_PAL = {
  k: '#1c1310', w: '#f2e6cc', r: '#c23b2e', R: '#ef7a66', g: '#e0aa3e', G: '#f8dc88',
  b: '#5aa0e0', B: '#c8e8f8', s: '#c1c7cc', S: '#8d9094', n: '#7a5a2a', e: '#6fa34a', E: '#3f8a3a',
};

// 11x11 pixel maps; '.' is transparent
const ICONS = {
  health: ['...........', '..kk...kk..', '.krrk.krrk.', 'krRrrkrrrrk', 'krRrrrrrrrk', 'krrrrrrrrrk', '.krrrrrrrk.', '..krrrrrk..', '...krrrk...', '....krk....', '.....k.....'],
  fatigue: ['.....k.....', '....kbk....', '....kbk....', '...kbbbk...', '...kbbbk...', '..kbbbbbk..', '..kbBbbbk..', '..kbBbbbk..', '..kbbbbbk..', '...kbbbk...', '....kkk....'],
  morale: ['.....k.....', '....kgk....', '....kgk.k..', '...kgrgkgk.', '..kgrrgkgk.', '..kgrrrgrk.', '.kgrrGrrgk.', '.kgrGGGrgk.', '.kgrGGGrgk.', '..kgrGrgk..', '...kkkkk...'],
  str: ['...........', '...........', '.kk.....kk.', 'kSSk...kSSk', 'kSsskkksSSk', 'kSssssssSSk', 'kSsskkksSSk', 'kSSk...kSSk', '.kk.....kk.', '...........', '...........'],
  agi: ['......kkk..', '.....kgGk..', '....kgGk...', '...kgGk....', '..kgGGkkk..', '..kkkgGGk..', '....kgGk...', '...kgGk....', '..kgGk.....', '..kgk......', '..kk.......'],
  end: ['.kkkkkkkkk.', '.keeeEeeek.', '.keeeEeeek.', '.keeeEeeek.', '.kEEEEEEEk.', '.keeeEeeek.', '.keeeEeeek.', '..keeEeek..', '..keeEeek..', '...keEek...', '....kkk....'],
  skl: ['...kkkkk...', '..kwwwwwk..', '.kwrrrrrwk.', 'kwrwwwwwrwk', 'kwrwrrrwrwk', 'kwrwrkrwrwk', 'kwrwrrrwrwk', 'kwrwwwwwrwk', '.kwrrrrrwk.', '..kwwwwwk..', '...kkkkk...'],
  coin: ['...kkkkk...', '..kgGGGgk..', '.kgGgggGgk.', 'kgGgkkkgGgk', 'kgGgkgkgGgk', 'kgGgkgkgGgk', 'kgGgkgkgGgk', 'kgGgkkkgGgk', '.kgGgggGgk.', '..kgGGGgk..', '...kkkkk...'],
  fame: ['...........', '..kk...kk..', '.kek...kek.', 'kek.....kek', 'kek.....kek', 'kEk.....kEk', 'kek.....kek', '.kek...kek.', '.kEek.keEk.', '..kkekekk..', '....kkk....'],
  day: ['.....g.....', '.g...g...g.', '..g.....g..', '...kkkkk...', '..kgGGGgk..', 'ggkgGGGgkgg', '..kgGGGgk..', '...kkkkk...', '..g.....g..', '.g...g...g.', '.....g.....'],
  games: ['k.........k', 'sk.......ks', '.sk.....ks.', '..sk...ks..', '...sk.ks...', '....sks....', '...ksksk...', '.nnk.s.knn.', '.nnk...knn.', 'nk.......kn', 'k.........k'],
};

// Materials by rarity: main, dark, light, and a trim colour.
const ITEM_MAT = [
  { m: '#8a5a3c', d: '#5e3a26', l: '#b07a54', t: '#5e3a26' },   // F rusted
  { m: '#9a9486', d: '#6e685c', l: '#bdb7a8', t: '#6b4526' },   // E worn
  { m: '#c8913c', d: '#8a6226', l: '#e8b860', t: '#7e241c' },   // D bronze
  { m: '#8f979f', d: '#5f666d', l: '#b9c2cb', t: '#7e241c' },   // C iron
  { m: '#c1cad3', d: '#8691a0', l: '#eef3f7', t: '#2f6db8' },   // B steel
  { m: '#e8b545', d: '#a87a26', l: '#fbe08a', t: '#c23b2e' },   // A gilded
  { m: '#dcd0f2', d: '#8a5fc0', l: '#ffffff', t: '#e8b545' },   // S imperial
];
const RARITY_COL = ['#8a8a8a', '#c2b79d', '#7fb85a', '#5aa0e0', '#b77be8', '#e8b545', '#f0705e'];

// ---------- pictures of equipment ----------
// Every piece is built in layers on a 24x24 grid of letters, and only turned into colours at the end:
//   shape     which drawing: the slot, and how well made the piece is. Grades come in four bands, and each band
//             of a slot is a different object: scrap and leather (F, E), a soldier's plain kit (D, C), an officer's
//             fine work (B, A), and parade armour (S). Relics each have a drawing of their own.
//   material  the letters m, d, l, h, t stand for the grade's metal (main, dark, light, shine) and its trim.
//   fitting   what the smith has done to it since: studs, splints, padding, piping, weight on the pommel.
//   mark      a master-wrought piece is polished brighter, and its frame carries the maker's mark.
// The outline is added last, round whatever has been drawn, so no shape has to carry its own.
// Letters: m d l h metal · t T trim · w W wood · c e C leather (main, light, dark) · g G gold · j J gem ·
// n N cloth · r R crest red · s skin · f F fur · q laurel · k ink · x rust on the two worst grades · p a pit on the
// worst · v a rivet from iron upward · '.' nothing.
const ITEM_BAND = [0, 0, 1, 1, 2, 2, 3];

// Armour that is the same on both sides is drawn as its left half, lit from the left; the right half is the mirror
// with light and shade changed over.
const HALF = {
  head: [
    { y: 4, rows: [
      '........eccc', '......eecccc', '.....eeccccc', '....eecccccc', '...eeccccccc', '...ecccccccc', '..eecccccccc',
      '..lmmxmmmmpm', '..dddddddddd', '..eccCkkkkkk', '..eccCkkkkkk', '..eccCkkkkkk', '...ecCkkkkkk', '...eCC......', '....C.......'] },
    { y: 2, rows: [
      '..........mm', '..........mm', '.......lllmm', '.....llhlmmm', '....llhlmmmm', '...llhlmmmmm', '...llmmmmmmm', '..llmmmmmmmm',
      '..lmmmmmmmmm', '..lmmmmmmmmm', '..dddddddddd', '.llmvmmmvmmm', '.ddddddddddd', '..lmmdkkkkkk', '..lmmdkkkkkk', '..lmmdkkkkkk',
      '..lmmdkkkkkk', '...lmdkkkkkk', '...lmd......', '....dd......'] },
    { y: 1, rows: [
      '.........ttt', '.......ttttT', '......tttTTT', '......tTTmmm', '.....lllmmmm', '....llhlmmmm', '...llhlmmmmm', '...llmmmmmmm',
      '..llmmmmmmmm', '..lmmmmmmmmm', '..tttttttttt', '.llmmmmmmmmm', 'lllmvmmmvmmm', '.ddddddddddd', '..lmmmdkkmmd', '..lmmmmmmmmd',
      '..lmmkmkmkmd', '..lmmmmmmmmd', '..lmmkmkmkmd', '...lmmmmmmmd', '...ddddddddd'] },
    { y: 1, rows: [
      '........tttt', '......tttttT', '.....ttttTTT', '.....tttTTTT', '......tTTTgg', '.....lllmmgG', '....llhlmmmm', '...llhlmmmmm',
      '...llmmmmmmm', '..llmmmmmmmJ', '..qgqgqgqgqj', '.llmmmmmmmmm', 'lllmGmmmGmmm', '.ddddddddddd', '..lmmmdkkmmg', '..lmmmmmmmmg',
      '..gmmkmkmkmg', '..lmmmmmmmmg', '..gmmkmkmkmg', '...lmmmmmmmg', '...ggggggggg'] },
  ],
  chest: [
    { y: 2, rows: [
      '...eec......', '...ecc......', '...ecc......', '..eeccc...cc', '..eccccccccc', '..ecccccdddd', '..eccccdlmmm', '..eccccdmxmm',
      '..eccccdmmmp', '..eccccdmmmm', '...ecccdmmmm', '...eccccdddd', '...ecccccccc', '...ecccccccc', '...CCCCCCCCC', '...cCcCcCcCc',
      '...cCcCcCcCc', '...c.c.c.c.c'] },
    { y: 1, rows: [
      '...lm.......', '...lm.......', '..llmm...mmm', '..lmmmmmmmmm', '.llmmmmmmmmm', '.lmhlmmmmmmd', '.lmlmmmmmmmd', '.lmmmmmddmmd',
      '.lmmmmdmmmmd', '..lmmmmmmmmd', '..lmmmmmmmmd', '..lmmvmmmvmd', '...lmmmmmmmd', '...lmmmmmmmm', '...ddddddddd', '...CCCCCCCCC',
      '...cCcCcCcCc', '...cCcCcCcCc', '...c.c.c.c.c'] },
    { y: 1, rows: [
      '..lmm.......', '..lmmm......', '.llmmmm..mmm', '.lmmmmmmmmmm', 'llmmmmmmmmmm', 'lmhlmmmmmmmd', 'lmlmmmddmmmd', '.lmmmdmmdmmd',
      '.lmmmmddmmmd', '..lmmmmmmmmd', '..lmmdmmdmmd', '..lmmmmmmmmd', '..lmmdmmdmmd', '...lmmmmmmmd', '...lmmmmmmmm', '...ttttttttt',
      '...tTtTtTtTt', '...tTtTtTtTt', '...t.t.t.t.t'] },
    { y: 1, rows: [
      '..gmm.......', '..gmmm......', '.ggmmmm..ggg', '.lmmmmmmmmmm', 'llmmmmmmmmmm', 'lmhlmmmmmmmJ', 'lmlmmmmmmmmj', '.lmgGggggggg',
      '.lmmgggGgggg', '..lmmmggmmgg', '..lmmdmmdmgg', '..lmmmmmmmmg', '..lmmdmmdmmd', '...lmmmmmmmd', '...lmmmmmmmm', '...gGgGgGgGg',
      '...tTtTtTtTt', '...tTtTtTtTt', '...g.g.g.g.g'] },
  ],
  shoulders: [
    { y: 6, rows: [
      '....eccc....', '..eeccccc...', '.eccccccccc.', '.ecclmmmccc.', '.ecclmxmccC.', '.ecclmmpccC.', '.eccdddcccC.', '.eccccccccC.',
      '..CcccccCC..', '...CCCCC....'] },
    { y: 5, rows: [
      '....llmm....', '..llhmmmmm..', '.llhmmmmmmd.', '.lhmmmmmmmdC', '.lmmmmmmmmdC', '.lmmmmmmmmd.', '.lmvmmmmvmd.', '.dddddddddd.',
      '..lmmmmmmd..', '..dddddddd..'] },
    { y: 4, rows: [
      '....llmm....', '..llhmmmmm..', '.llhmmmmmmd.', '.lhmmmmmmmdC', '.ttttttttttC', '.llmmmmmmmd.', '.lmmmmmmmmd.', '.tttttttttt.',
      '..lmmmmmmd..', '..lmmmmmmd..', '..tttttttt..', '...lmmmmd...', '...dddddd...'] },
    { y: 4, rows: [
      '....ggGg....', '..ggGggggg..', '.llhmmmmmmd.', '.lhmggggmmdg', '.lmgGJjggmdg', '.lmggjjggmd.', '.lmmgkkgmmd.', '.gGgGgGgGgG.',
      '..lmmmmmmd..', '..lmmmmmmd..', '..gGgGgGgG..', '...lmmmmd...', '...gggggg...'] },
  ],
};
// One greave; a pair is two of them side by side.
const GREAVE = [
  { y: 3, rows: [
    '..eccc...', '.eelmcC..', '.eclmcC..', '.CCCCCC..', '.eclxcC..', '.eclmcC..', '.eclmcC..', '.CCCCCC..', '.eclmcC..',
    '.eclpcC..', '..elmcC..', '..CCCCC..', '..elmcC..', '..elmcC..', '..ecCC...', '.wwwwww..', 'wwwwwwW..'] },
  { y: 2, rows: [
    '..lmmm...', '.llmmmd..', '.lmmmmd..', '.lhmmmd..', '.lhmmmd..', '.lmmmmd..', '.lmmmmd..', '.CCCCCC..', '.lmmmmd..',
    '.lmmmmd..', '..lmmmd..', '..lmmmd..', '..lmmmd..', '..lmvmd..', '..lmmd...', '..dddd...', '.wwwwww..', 'wwwwwwW..'] },
  { y: 1, rows: [
    '...lmm...', '..llmmm..', '.llhmmmd.', '.lhmmmmd.', '.lmmmmmd.', '..ttttt..', '.llmmmd..', '.lhmdmd..', '.lhmdmd..',
    '.lmmdmd..', '.lmmdmd..', '.lmmdmd..', '..lmdmd..', '..lmdmd..', '..lmmmd..', '..ttttt..', '..lmmmd..', '..lmmd...',
    '..dddd...', '.wwwwww..', 'wwwwwwW..'] },
  { y: 1, rows: [
    '...ggg...', '..gGggg..', '.ggJjggd.', '.lgjjggd.', '.lmgggmd.', '..gGgGg..', '.llmmmd..', '.lhmgmd..', '.lhmgmd..',
    '.lmmgmd..', '.lmmgmd..', '.lmmgmd..', '..lmgmd..', '..lmgmd..', '..lmmmd..', '..gGgGg..', '..lmmmd..', '..lmmd...',
    '..gggg...', '.wwwwww..', 'wwwwwwW..'] },
];
// The five pieces out of the old stories: a drawing each, in a metal of its own.
const RELIC_ART = {
  crest: { mat: 4, half: { y: 1, rows: [      // the centurion's crest runs from ear to ear
    '..rrrrrrrrrr', '.rRrRrRrRrRr', '.rRrRrRrRrRr', '..rrrrrrrrrr', '.....gggmmgg', '....llhlmmmm', '...llhlmmmmm', '...llmmmmmmm',
    '..llmmmmmmmm', '..lmmmmmmmmm', '..gggggggggg', '.llmmmmmmmmm', 'lllmgmmmgmmm', '.ddddddddddd', '..lmmdkkkkkk', '..lmmdkkkkkk',
    '..lmmdkkkkkk', '..gmmdkkkkkk', '...gmdkkkkkk', '...ggd......', '....gd......'] } },
  cuirass: { mat: 4, half: { y: 1, rows: [    // silvered scale, and a legate's red sash knotted over it
    '..lmm.......', '..lmmm......', '.llmmmm..mmm', '.lmmmmmmmmmm', 'llmmdlmmdlmm', 'lmdlmmdlmmdl', '.lmmdlmmdlmm', '.ldlmmdlmmdl',
    '..rrrrrrrrRR', '..RrrrrrrRrr', '..lmdlmmdlRr', '..llmmdlmmdr', '..lmdlmmdlmr', '...lmmdlmmdl', '...ldlmmdlmm', '...ggggggggg',
    '...rRrRrRrRr', '...rRrRrRrRr', '...r.r.r.r.r'] } },
  pelt: { mat: 2, half: { y: 3, rows: [       // the fell lion, his mask at the collar and a paw over each shoulder
    '.......ff.ff', '......ffFfff', '....fffFffff', '...ffFfffkfn', '..ffFfffffnn', '.ffFfFfffnkk', '.fFffffFffn.', '.ffFfffff...',
    '.fffFfFf....', '.ffffff.....', '..fFfff.....', '..ffff......', '..fff.......', '..n.n.......'] } },
  greaves: { mat: 2, greave: { y: 2, rows: [  // beaten thin, with a wing at each ankle
    '..lmmm...', '.llmmmd..', '.lhmmmd..', '.lhmmmd..', '.lmmmmd..', '.lmmmmd..', '.lmmmmd..', '.lmmmmd..', '..lmmmd..',
    '..lmmmd..', '..lhmmd..', '..lmmmd..', 'nN.lmmd..', 'nnNlmmd..', '.nnNmd...', '..dddd...', '.wwwwww..', 'wwwwwwW..'] } },
  vambrace: { mat: 3, full: { x: 3, y: 4, rows: [   // an arm-ring of three coils, gold over iron
    '....gGGGGGGg....', '..gGGggggggGGg..', '.gGgd......dgGg.', '.gGd........dgg.', '.ggGd......dgGg.', '.dggGGGGGGGGggd.',
    '.gGdgggggggggGg.', '.gGd........dgg.', '.ggGd......dgGg.', '.dggGGGGGGGGggd.', '.gGdgggggggggGg.', '.gGd........dgg.',
    '.ggGd......dgGg.', '..ggGGGGGGGGgg..', '....gggggggjJ...'] } },
};

function drawItemArt(ctx, slot, r, cls, o) {
  o = o || {};
  const relic = o.relic && RELIC_ART[o.relic] ? RELIC_ART[o.relic] : null;
  const band = ITEM_BAND[r], M = ITEM_MAT[relic ? relic.mat : r], fit = o.fit || '';
  const hi = !relic && r < 6 && r % 2 === 1;      // the better grade of the two that share a drawing: it gets a step up in shape
  const both = (pts, c, c2) => { for (const [x, y] of pts) { put(x, y, c); put(23 - x, y, c2 || c); } };
  const N = 24, cells = new Array(N * N).fill('');
  let flip = false;
  const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? '' : cells[y * N + x]);
  const put = (x, y, c) => { if (flip) x = N - 1 - x; if (c && c !== '.' && x >= 0 && y >= 0 && x < N && y < N) cells[y * N + x] = c; };
  const R = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c); };
  const P = (pts, c) => { for (const [x, y] of pts) put(x, y, c); };
  const stroke = (x0, y0, n, w, c) => { for (let i = 0; i < n; i++) R(x0 + i, y0 - i, w, w, c); };      // a band running up and to the right
  const stamp = (m, x0) => m.rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) put(x0 + i, m.y + j, row[i]); });
  const SWAP = { l: 'd', d: 'l', h: 'm', e: 'C', C: 'e', G: 'g', N: 'n' };
  const mirror = m => m.rows.forEach((row, j) => { for (let i = 0; i < 12; i++) { put(i, m.y + j, row[i]); put(23 - i, m.y + j, SWAP[row[i]] || row[i]); } });

  // ---- weapons: drawn along the diagonal, hilt at the bottom left ----
  const blade = (x0, y0, n, w) => {             // edge to the light, back in shade, and a point
    stroke(x0, y0, n, w, 'm'); stroke(x0, y0, n, 1, 'l'); stroke(x0 + w - 1, y0 + w - 1, n, 1, 'd');
    if (w >= 3) { R(x0 + n + 1, y0 - n, 2, 2, 'm'); put(x0 + n + 1, y0 - n, 'l'); put(x0 + n + 3, y0 - n - 1, 'l'); }
    else { put(x0 + n + 1, y0 - n, 'l'); }
  };
  const hilt = (bd, small) => {
    stroke(2, 20, 4, 2, 'w'); stroke(3, 21, 4, 1, 'W');                                   // the grip
    if (bd >= 2 && fit !== 'quick') P([[3, 20], [5, 18]], bd === 3 ? 'g' : 't');          // wire round it
    if (fit === 'quick') { stroke(2, 20, 4, 1, 'n'); P([[4, 20], [6, 18]], 'N'); }         // bound in linen for a light hand
    const gl = (small ? 1 : bd === 0 ? 1 : bd === 1 ? 2 : 3) + (hi && !small ? 1 : 0), gc = bd === 3 ? 'g' : bd === 0 ? 'd' : 't';
    for (let k = -gl; k <= gl; k++) R(6 + k, 16 + k, 2, 2, gc);                           // the guard, across the blade
    if (bd >= 2) { put(6 - gl, 16 - gl, bd === 3 ? 'G' : 'l'); put(7 + gl, 17 + gl, bd === 3 ? 'j' : 'T'); }
    if (bd === 3) put(6, 16, 'G');
    // the pommel: a lump of lead if weighted, a ring if balanced
    if (fit === 'weighted') { R(0, 20, 4, 4, 'd'); R(1, 21, 2, 2, 'm'); put(1, 21, 'l'); }
    else if (fit === 'balanced') { R(0, 20, 4, 4, 'g'); R(1, 21, 2, 2, 'k'); put(0, 20, '.'); cells[20 * N + (flip ? 23 : 0)] = ''; put(1, 20, 'G'); }
    else if (bd === 0) R(1, 21, 2, 2, 'd');
    else if (bd === 3) { R(1, 20, 3, 3, 'g'); put(2, 21, 'j'); put(1, 20, 'G'); }
    else { R(1, 20, 3, 3, bd === 2 ? 't' : 'm'); put(1, 20, 'l'); put(3, 22, 'd'); }
  };
  const sword = (len, small) => {
    if (hi && (band < 2 || small)) len++;                                                  // a longer blade, or on the finest a broader guard
    const w = fit === 'quick' ? 2 : 3, x0 = 7, y0 = w === 2 ? 16 : 15;
    blade(x0, y0, len, w); hilt(band, small);
    if (r <= 1) { P([[x0 + 3, y0 - 2], [x0 + 6, y0 - 5]], 'x'); if (r === 0) { P([[x0 + 5, y0 - 5], [x0 + 2, y0 - 2]], 'p'); cells[(y0 - 4) * N + (flip ? 23 - x0 - 4 : x0 + 4)] = ''; } }      // rust, and a notch out of the edge
    if (band >= 1 && w === 3) stroke(x0 + 2, y0, len - 3, 1, band >= 2 ? 'd' : 'm');      // a fuller down the blade
    if (band >= 2 && w === 3) stroke(x0 + 1, y0, len - 1, 1, 'h');                         // ground and polished
    if (band === 3) P([[x0 + 3, y0 - 1], [x0 + 5, y0 - 3], [x0 + 7, y0 - 5]], 'g');        // gold let into the steel
  };
  // A pole arm is drawn close: the head fills the picture and the shaft runs out of the bottom corner of the frame.
  const shaft = n => {
    stroke(-1, 23, n, 2, 'w'); stroke(0, 24, n, 1, 'W');
    if (band >= 1) for (const x of [3, 7]) P([[x, 22 - x], [x + 1, 23 - x]], band === 3 ? 'g' : 'd');      // iron bands
    if (fit === 'weighted') { R(1, 19, 4, 4, 'd'); R(2, 20, 2, 2, 'm'); put(2, 20, 'l'); }  // a lump of lead on the shaft
    if (fit === 'balanced') { R(4, 17, 3, 3, 'g'); put(4, 17, 'G'); put(6, 19, 'T'); }      // a collar where the hand goes
    if (fit === 'quick') { stroke(2, 20, 4, 2, 'n'); stroke(3, 21, 4, 1, 'N'); }
  };
  // A blade seen flat, point up and to the right: prof is its half-width at each step along it.
  const leaf = (cx, cy, prof, rib) => prof.forEach((hw, i) => {
    for (let k = -hw; k <= hw; k++) {
      const c = k === 0 ? rib : k < 0 ? (k === -hw && hw > 2 ? 'm' : 'l') : k === hw && hw > 1 ? 'd' : 'm';
      put(cx + i + k, cy - i + k, c); if (k < hw) put(cx + i + k + 1, cy - i + k, k < 0 ? 'l' : c === 'd' ? 'd' : 'm');
    }
    if (!hw) put(cx + i, cy - i, 'l');
  });
  if (!relic && slot === 'weapon') {
    const kind = WEAPON_NAMES[cls] || 'gladius';
    if (kind === 'gladius') sword([9, 11, 12, 12][band]);
    else if (kind === 'sica') {                  // a short blade that hooks forward at the end
      const n = [6, 7, 7, 7][band] + (hi && band < 2 ? 1 : 0);
      blade(7, 15, n, 3); hilt(band);
      R(8 + n, 14 - n, 3, 3, 'm'); R(10 + n, 13 - n, 3, 3, 'm'); R(12 + n, 13 - n, 2, 2, 'm'); put(14 + n, 13 - n, 'l');
      R(8 + n, 14 - n, 5, 1, 'l'); P([[9 + n, 16 - n], [10 + n, 15 - n], [11 + n, 15 - n], [12 + n, 14 - n], [13 + n, 14 - n]], 'd');
      put(7 + n, 15 - n, 'l');
      if (r <= 1) { P([[10, 12], [13, 9]], 'x'); if (r === 0) P([[11, 12], [16, 8]], 'p'); }
      if (band >= 2) stroke(8, 15, n, 1, 'h');
      if (band === 3) P([[10, 14], [12, 12], [14, 10]], 'g');
    } else if (kind === 'twin blades') {
      sword([7, 8, 9, 9][band], true); flip = true; sword([7, 8, 9, 9][band], true); flip = false;
    } else if (kind === 'spear') {
      // a narrow head lashed on; a soldier's leaf; a broad polished leaf with a tassel; the same with gold let in
      const cx = band ? 10 : 11, cy = 23 - cx;
      const prof = [hi ? [1, 2, 2, 3, 2, 2, 2, 1, 1, 0] : [1, 1, 2, 2, 2, 2, 1, 1, 0], [1, 2, 2, 3, 3, 3, 2, 2, 1, 1, 0], [1, 2, 3, 4, 4, 4, 3, 3, 2, 2, 1, 1, 0], [1, 2, 3, 4, 4, 4, 3, 3, 2, 2, 1, 1, 0]][band];
      shaft(cx - 1);
      if (band >= 2) { P([[cx - 2, cy + 4], [cx - 2, cy + 5], [cx - 1, cy + 5], [cx - 2, cy + 6], [cx - 1, cy + 7]], 'r'); put(cx - 1, cy + 4, 'R'); put(cx - 1, cy + 6, 'R'); }      // a tassel under the head
      stroke(cx - 3, cy + 1, 2, 3, band === 3 ? 'g' : band >= 1 ? 'd' : 'C');               // the socket, or the binding
      put(cx - 3, cy + 1, band === 3 ? 'G' : band >= 1 ? 'm' : 'c'); put(cx - 2, cy, band === 3 ? 'G' : band >= 1 ? 'm' : 'c');
      leaf(cx, cy, prof, band >= 2 ? 'h' : 'l');
      if (hi && band >= 1) { P([[cx - 3, cy - 1], [cx - 4, cy - 2], [cx - 3, cy - 2]], 'l'); P([[cx + 1, cy + 3], [cx + 2, cy + 4], [cx + 2, cy + 3]], 'd'); P([[cx - 2, cy - 1], [cx + 1, cy + 2]], 'm'); }      // a wing each side of the socket
      if (band === 3) { P([[cx + 2, cy - 2], [cx + 4, cy - 4], [cx + 6, cy - 6]], 'g'); P([[cx - 1, cy - 3], [cx + 3, cy + 1]], 'g'); }      // gold down the rib, and a lug each side
      if (r <= 1) { P([[cx + 3, cy - 1], [cx + 4, cy - 5]], 'x'); if (r === 0) { P([[cx + 2, cy - 3], [5, 18]], 'p'); } }
    } else {                                     // trident
      shaft(12);
      const sp = band ? 5 : 4, bc = band === 3 ? 'g' : band === 0 ? 'C' : 'd';
      for (let k = -sp; k <= sp; k++) R(11 + k, 11 + k, 2, 2, bc);                         // the bar the tines stand on
      if (band >= 1) { put(11 - sp, 11 - sp, band === 3 ? 'G' : 'm'); put(11, 11, band === 3 ? 'G' : 'm'); }
      for (const k of [-sp, sp, 0]) {
        const n = (k ? 6 : 8) - (band ? 0 : 1) + (hi && band && !k ? 1 : 0), x0 = 12 + k, y0 = 10 + k;
        stroke(x0, y0, n, 2, 'm'); stroke(x0, y0, n, 1, 'l'); stroke(x0 + 1, y0 + 1, n, 1, 'd');
        put(x0 + n, y0 - n, 'l');
        if (band >= 1 || hi) {                   // a barb on each: the outer tines hooked inward, the middle one both ways
          if (k <= 0) { put(x0 + n - 1, y0 - n + 3, 'd'); put(x0 + n - 2, y0 - n + 3, 'm'); }
          if (k >= 0) { put(x0 + n - 3, y0 - n + 1, 'l'); put(x0 + n - 3, y0 - n + 2, 'm'); }
        }
        if (band >= 2) stroke(x0, y0, n - 1, 1, 'h');
      }
      if (hi && band) { R(8, 12, 4, 4, band === 2 ? 't' : 'm'); put(8, 12, 'l'); R(9, 15, 3, 1, 'd'); R(11, 13, 1, 3, 'd'); }      // a collar where the head meets the shaft
      if (band === 3) { R(11, 11, 2, 2, 'j'); put(11, 11, 'J'); }
      if (r <= 1) { P([[14, 7], [19, 11]], 'x'); if (r === 0) P([[10, 3], [5, 18]], 'p'); }
    }
  } else if (relic) {
    if (relic.half) mirror(relic.half);
    if (relic.greave) { stamp(relic.greave, 3); stamp(relic.greave, 13); }
    if (relic.full) stamp(relic.full, relic.full.x);
  } else if (slot === 'legs') {
    for (const x0 of [2, 13]) {
      stamp(GREAVE[band], x0);
      if (hi) {                                  // a cap standing over the knee, and a wing either side of it
        const y = GREAVE[band].y, L = band ? 'l' : 'e', D = band ? 'd' : 'C', w = band === 2 ? 8 : 7;
        R(x0 + 3, y - 1, 2, 1, band ? 'm' : 'c'); put(x0 + 3, y - 1, L);
        R(x0, y + 2, 1, 2, L); R(x0 + w, y + 2, 1, 2, D);
      }
    }
  }
  else if (slot === 'arms') {
    // an arm guard on a bent arm: plates down the upper arm from the shoulder at the top left, the elbow at the
    // bottom, and more up the forearm to a fist. Leather between the plates on the worst; a cop over the elbow
    // on the best.
    const trim = band === 3 ? 'g' : 't', edge = band === 3 ? 'G' : 'T';
    const drop = x => Math.round((x - 3) * 0.8);                                            // the upper arm slopes down to the elbow
    const lame = (x, y, w, h, lea, up) => {
      for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
        const first = up ? j === 0 : i === 0;
        let c = first ? (lea ? 'e' : band >= 2 ? trim : 'l') : j === h - 1 || i === w - 1 ? (lea ? 'C' : 'd') : j === 0 || i === 0 ? (lea ? 'e' : 'l') : lea ? 'c' : 'm';
        if (!lea && i === 1 && j === 1) c = 'h';
        if (!lea && band >= 1 && w > 2 && h > 2 && (up ? i === w - 2 && j === h >> 1 : i === w >> 1 && j === h - 2)) c = 'v';
        put(x + i, y + j + (up ? 0 : drop(x + i)), c);
      }
    };
    R(1, 4, 2, 10, band === 0 ? 'C' : trim); put(1, 4, band === 0 ? 'c' : edge);            // the strap at the shoulder
    const plates = [[5, 5], [4, 3, 3], [4, 3, 3], [3, 3, 2, 2]][band];                      // upper arm, shoulder to elbow
    let x = 3;
    plates.forEach((w, i) => { lame(x, 5, w, 8, band === 0 && i === 1, false); if (band === 0 && !i) P([[x + 2, 9], [x + 3, 12]], 'x'); x += w; });
    let y = 14;                                                                             // forearm, elbow up to the wrist
    [[4, 4], [3, 3, 2], [3, 3, 2], [2, 2, 2, 2]][band].forEach((h, i) => { y -= h; const thin = y < 10 ? 1 : 0; lame(14 + thin, y, 7 - thin * 2, h, band === 0 && i === 1, true); if (band === 0 && !i) put(17, y + 2, 'p'); });
    R(15, 5, 5, 1, band === 0 ? 'C' : band === 1 ? 'd' : trim);                             // the cuff
    R(14, 1, 7, 4, 's'); R(15, 0, 5, 1, 's'); P([[16, 1], [18, 1], [14, 3], [15, 3], [16, 3], [20, 4]], 'k');      // the fist
    // the elbow: a plain joint plate, or a round cop with a boss
    const E = band === 0 ? ['c', 'e', 'C'] : ['m', 'l', 'd'];
    R(13, 14, 8, 7, E[0]); R(14, 21, 6, 1, E[2]); R(21, 15, 1, 5, E[2]); R(13, 14, 8, 1, E[1]); R(13, 14, 1, 7, E[1]); R(20, 15, 1, 6, E[2]); R(14, 20, 6, 1, E[2]);
    if (band === 0) P([[15, 16], [18, 16], [15, 18], [18, 18]], 'C');
    else if (band === 1) { put(14, 15, 'h'); P([[16, 18], [18, 16]], 'v'); }
    else { R(15, 15, 4, 4, trim); R(16, 16, 2, 2, band === 3 ? 'j' : 'm'); put(16, 16, band === 3 ? 'J' : 'l'); put(15, 15, edge); put(14, 15, 'h'); R(22, 16, 1, 3, 'd'); R(15, 22, 4, 1, 'd'); }
    if (hi) {                                    // a point to the elbow, and a cap over the top of the arm
      R(21, 20, 2, 2, E[0]); put(21, 20, E[1]); put(22, 21, E[2]); put(23, 22, E[2]); put(22, 22, E[2]);
      R(3, 3, 5, 2, E[0]); R(3, 3, 5, 1, E[1]); put(7, 4, E[2]); R(4, 2, 3, 1, E[1]);
    }
  } else if (slot === 'shoulders') {
    // one pauldron: a domed cap with plates lapping down the arm under it, the whole leaning out over the arm; a
    // strap up to the neck and another round under the arm
    const trim = band === 3 ? 'g' : 't', lea = band === 0;
    const span = (y, x0, x1, base, lit, dk) => { for (let x = x0; x <= x1; x++) put(x, y, x - x0 < 2 ? lit : x1 - x < (y > 6 ? 2 : 1) ? dk : base); };
    const M3 = lea ? ['c', 'e', 'C'] : ['m', 'l', 'd'];
    const dome = [[8, 13], [6, 15], [5, 16], [4, 17], [3, 17], [3, 18], [2, 18], [2, 18], [2, 18]];
    dome.forEach(([a, b], j) => span(3 + j, a, b, M3[0], M3[1], M3[2]));
    R(2, 12, 17, 1, lea ? 'C' : band >= 2 ? trim : 'd');                                    // the cap's rim
    if (!lea) { P([[7, 5], [6, 6], [5, 7], [8, 4], [9, 4]], 'h'); R(8, 3, 6, 1, 'l'); }
    const lames = [[[3, 17, 3]], [[3, 17, 3], [4, 16, 2]], [[3, 17, 2], [4, 16, 2], [5, 15, 2]], [[3, 17, 2], [4, 16, 2], [5, 15, 2]]][band].slice();
    if (hi && band < 2) lames.push([[4, 16, 2], [5, 15, 2]][band]);                          // one more plate down the arm
    if (hi && band === 2) { R(7, 2, 8, 1, 'm'); R(9, 1, 4, 1, 'l'); put(7, 2, 'l'); put(14, 2, 'd'); }      // or a ridge standing on the cap
    let y = 13;
    for (const [a, b, h] of lames) {
      for (let j = 0; j < h; j++) span(y + j, a, b, M3[0], M3[1], M3[2]);
      R(a, y + h, b - a + 1, 1, lea ? 'C' : band >= 2 ? trim : 'd');
      if (band >= 1) P([[a + 2, y + h - 1], [b - 3, y + h - 1]], 'v');
      y += h + 1;
    }
    if (lea) { R(8, 6, 5, 4, 'm'); R(8, 6, 5, 1, 'l'); R(8, 9, 5, 1, 'd'); R(12, 7, 1, 3, 'd'); put(10, 7, 'x'); if (r === 0) put(9, 8, 'p'); P([[4, 14], [16, 14]], 'C'); }      // a plate sewn to the hide
    else if (band === 1) P([[4, 11], [10, 11], [16, 11]], 'v');
    else {                                       // a boss on the cap, and on the best a gilded crown to it
      R(8, 6, 5, 5, trim); R(9, 7, 3, 3, band === 3 ? 'j' : 'm'); put(9, 7, band === 3 ? 'J' : 'l'); put(8, 6, band === 3 ? 'G' : 'T'); put(12, 10, 'T');
      if (band === 3) { R(8, 3, 6, 1, 'g'); P([[6, 4], [7, 4], [14, 4], [15, 4]], 'g'); P([[4, 12], [8, 12], [12, 12], [16, 12]], 'G'); }
    }
    // lean it: each row slides over, top toward the neck and bottom out along the arm
    const flat = cells.slice(); cells.fill('');
    for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) { const c = flat[yy * N + xx], nx = xx + Math.round((12 - yy) / 3); if (c && nx >= 0 && nx < N) cells[yy * N + nx] = c; }
    const under = (xx, yy, c) => { if (!at(xx, yy)) put(xx, yy, c); };
    for (let i = 0; i < 5; i++) { under(17 + i, 6 - i, 'e'); under(18 + i, 6 - i, 'c'); under(18 + i, 7 - i, 'C'); under(17 + i, 7 - i, 'c'); }      // to the neck
    R(20, 3, 2, 2, band === 3 ? 'g' : 'l'); put(21, 4, band === 3 ? 'T' : 'd');             // and its buckle
    for (let i = 0; i < 7; i++) { under(13 + i, 14 + i, 'c'); under(14 + i, 14 + i, 'e'); under(13 + i, 15 + i, 'C'); under(14 + i, 15 + i, 'c'); }      // under the arm
  } else {
    mirror(HALF[slot][band]);
    if (hi && slot === 'head') {
      if (band === 0) both([[11, 3], [11, 2], [10, 3]], 'm', 'd');                           // a button on the crown
      if (band === 1) { both([[11, 1], [11, 0]], 'l', 'm'); both([[0, 13], [0, 14]], 'l', 'd'); both([[1, 14]], 'd'); }      // a spike, and a broader brim
      if (band === 2) both([[2, 7], [1, 6], [1, 5], [2, 6], [0, 4], [1, 4]], 't', 'T');     // a feather at each temple
    }
    if (hi && slot === 'chest') {
      const y = HALF.chest[band].y + HALF.chest[band].rows.length;                         // a second row to the skirt
      both([[3, y], [5, y], [7, y], [9, y], [11, y]], band === 2 ? 'T' : 'C');
      if (band === 1) both([[1, 4], [0, 5], [0, 6], [1, 5]], 'l', 'd');                      // broader at the shoulder
      if (band === 2) { both([[10, 9], [11, 9], [10, 11], [11, 11]], 't', 'T'); both([[10, 10]], 't', 'T'); both([[11, 10]], 'l', 'm'); }      // a medallion on the breast
    }
  }

  // ---- what the smith has done to it since: armour only; a weapon's fitting is in how it was drawn above ----
  const metal = c => c === 'm' || c === 'l' || c === 'd' || c === 'h' || c === 'v';
  const inside = (x, y) => at(x - 1, y) && at(x + 1, y) && at(x, y - 1) && at(x, y + 1);
  // Each is placed by the shape of the piece it is on, so that it sits on the drawing and not across it:
  //   studded    a line of studs following the rim, just inside it
  //   braced     two splints riveted on, where the slot's joints are
  //   lightened  rows of slits cut through the plate
  //   lined      oiled leather showing along the lower and the shaded edges
  //   padded     a roll of cloth under the bottom edge
  if (slot !== 'weapon' && fit) {
    const snap = cells.slice(), was = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? '' : snap[y * N + x]);
    const body = c => metal(c) || c === 'c' || c === 'e' || c === 'C';
    const rimmed = (x, y) => !(was(x - 1, y) && was(x + 1, y) && was(x, y - 1) && was(x, y + 1));
    const deep = (x, y) => was(x, y) && !rimmed(x, y);
    const set = (x, y, c) => { cells[y * N + x] = c; };
    let y0 = N, y1 = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (body(was(x, y))) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (fit === 'studded') {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (!body(was(x, y)) || !deep(x, y) || (x + 2 * y) % 5) continue;
        if (!(rimmed(x - 1, y) || rimmed(x + 1, y) || rimmed(x, y - 1) || rimmed(x, y + 1))) continue;
        set(x, y, 'o'); if (deep(x, y + 1) && body(was(x, y + 1))) set(x, y + 1, 'O');
      }
    } else if (fit === 'braced') {
      for (const x of { head: [6, 16], chest: [7, 15], shoulders: [7, 13], legs: [5, 16], arms: [8, 17] }[slot] || []) {
        let first = true, last = -1;
        for (let y = 0; y < N; y++) {
          if (!(body(was(x, y)) && body(was(x + 1, y)) && deep(x, y) && deep(x + 1, y))) continue;
          set(x, y, first ? 'h' : 'l'); set(x + 1, y, 'd'); first = false; last = y;
        }
        if (last >= 0) set(x, last, 'h');
      }
    } else if (fit === 'lightened') {
      const rows = { head: [0.28], chest: [0.3, 0.62], shoulders: [0.3, 0.62], legs: [0.3, 0.62], arms: [0.38, 0.78] }[slot] || [0.5];
      for (const t of rows) {
        const ya = Math.round(y0 + (y1 - y0) * t);
        const slits = y => { const out = []; for (let x = 0; x < N; x++) if (x % 3 === 1 && body(was(x, y)) && body(was(x, y + 1)) && deep(x, y) && deep(x, y + 1) && deep(x + 1, y)) out.push(x); return out; };
        const y = [0, 1, -1, 2, -2, 3].map(k => ya + k).find(y => slits(y).length >= 2);      // a row that has room for them
        if (y !== undefined) for (const x of slits(y)) { set(x, y, 'k'); set(x, y + 1, 'k'); }
      }
    } else for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const c = was(x, y);
      if (!c || c === 'k') continue;
      if (fit === 'lined' && body(c)) { if (!was(x, y + 1)) set(x, y, 'e'); else if (!was(x + 1, y) || (!was(x, y + 2) && !rimmed(x, y))) set(x, y, 'c'); }
      if (fit === 'padded') { if (!was(x, y + 1)) set(x, y, 'n'); else if (!was(x, y + 2) && !rimmed(x, y)) set(x, y, 'N'); }
    }
  }
  // ---- the outline, then colour (a master-wrought piece shines white where a plain one only catches the light) ----
  const ink = '#1c1310', top = r >= 4 || relic || o.mw;
  // Light is warm and shade is cool: every material's dark leans toward indigo and its light toward straw, so a
  // piece has weight where three tones of one hue would lie flat.
  const cool = (c, t) => mixHex(c, '#2b2a5c', t === undefined ? 0.22 : t), warm = (c, t) => mixHex(c, '#ffe9b0', t === undefined ? 0.24 : t);
  const C = {
    m: M.m, d: cool(M.d), l: warm(M.l), h: top ? '#ffffff' : warm(shade(M.l, 1.14), 0.34), t: M.t, T: cool(shade(M.t, 0.68)),
    w: '#7a5a2a', W: cool('#5e4222'), c: '#8a5a34', e: warm('#a87244', 0.2), C: cool('#5e3a22'), g: '#e8b545', G: warm('#fbe08a', 0.3),
    j: r === 6 ? '#b77be8' : '#d8402e', J: r === 6 ? '#f0e0ff' : '#ff9a8a', n: '#d8c8a0', N: cool('#a89870', 0.16),
    r: '#c23b2e', R: warm('#ef7a66', 0.16), s: '#d9a57c', f: '#c8913c', F: cool('#8a6226'), q: '#8fc35a', k: ink,
    o: '#fff6d8', O: mixHex(cool(M.d), ink, 0.4),
    x: r <= 1 ? '#a0522d' : M.m, p: r === 0 ? '#3a1c10' : M.m, v: r >= 3 ? cool(M.d) : M.m,
  };
  // The outline is ink underneath and on the right, but on the lit side it is only the piece's own colour gone
  // dark; and the whole casts a shadow one pixel down and across.
  const rim = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (at(x, y)) { rim.push([x, y, C[at(x, y)] || M.m]); continue; }
    const lit = at(x + 1, y) || at(x, y + 1), dark = at(x - 1, y) || at(x, y - 1);
    if (lit || dark) rim.push([x, y, dark ? ink : mixHex(C[lit] || M.m, ink, 0.6)]);
  }
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  for (const [x, y] of rim) ctx.fillRect(x + 1, y + 1, 1, 1);
  for (const [x, y, c] of rim) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
}

// Paints a <canvas data-item="slot:rarity:style:fitting:master:relic">: a dark plate framed in the grade's colour,
// 28 units square with the picture in the middle 24. Canvases are sized in whole multiples of 28.
function paintItem(cv) {
  const [slot, r0, cls, fit, mw, relic] = cv.dataset.item.split(':'), r = +r0, ctx = cv.getContext('2d'), s = cv.width / 28;
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  ctx.setTransform(s, 0, 0, s, 0, 0); ctx.imageSmoothingEnabled = false;
  const fc = relic ? '#d8a657' : RARITY_COL[r];
  R(0, 0, 28, 28, fc); R(1, 1, 26, 26, '#17110f'); R(2, 2, 24, 24, relic ? '#33261a' : '#2c211c');
  R(2, 2, 24, 11, 'rgba(255,255,255,.05)');
  if (r >= 3 || relic) {                         // a glow behind the better pieces, in the colour of their grade
    const n = parseInt(fc.slice(1), 16), rgb = `${n >> 16},${(n >> 8) & 255},${n & 255}`;
    for (let i = 0; i < 5; i++) R(5 + i, 5 + i, 18 - i * 2, 18 - i * 2, `rgba(${rgb},${(0.045 + (relic ? 2 : r - 3) * 0.013).toFixed(3)})`);
  }
  if (r >= 5 || relic) {                         // the best have their corners picked out
    for (const [x, y] of [[0, 0], [27, 0], [0, 27], [27, 27]]) R(x, y, 1, 1, '#fff6d8');
    const c = shade(fc, 1.3); R(1, 0, 4, 1, c); R(0, 1, 1, 4, c); R(23, 27, 4, 1, c); R(27, 23, 1, 4, c);
  }
  if (relic) { R(1, 1, 26, 1, '#7a5a2a'); R(1, 26, 26, 1, '#7a5a2a'); R(1, 1, 1, 26, '#7a5a2a'); R(26, 1, 1, 26, '#7a5a2a'); for (const [x, y] of [[1, 1], [26, 1], [1, 26], [26, 26]]) R(x, y, 1, 1, '#fbe08a'); }      // an old frame inside the new
  if (r === 0 && !relic) R(2, 19, 24, 7, 'rgba(160,82,45,.10)');                              // and the worst sit in their own rust
  ctx.translate(2, 2);
  drawItemArt(ctx, slot, r, cls, { fit, mw: mw === '1', relic });
  ctx.translate(-2, -2);
  if (r === 6 && !relic) { R(3, 3, 1, 1, '#ffffff'); R(24, 6, 1, 1, '#ffffff'); R(23, 24, 1, 1, '#fbe08a'); R(4, 22, 1, 1, '#fbe08a'); }      // an imperial piece glints
  if (mw === '1') { R(22, 3, 3, 1, '#fff6d8'); R(23, 2, 1, 3, '#fff6d8'); R(1, 24, 3, 3, '#17110f'); R(2, 24, 1, 3, '#fbe08a'); R(1, 25, 3, 1, '#fbe08a'); }      // a glint, and the maker's mark in the corner
}
// size: 28, 56 or 84 (one, two or three screen pixels to each of the picture's).
function itemArt(it, size) { return `<canvas class="itemart" width="${size}" height="${size}" data-item="${it.slot}:${it.r}:${it.cls || ''}:${it.fit || ''}:${it.mw ? 1 : ''}:${it.relic || ''}"></canvas>`; }
const ic = name => `<i class="ic ic-${name}"></i>`;

// Turns the icon maps, and a neutral picture of each gear slot, into CSS classes.
(function buildIcons() {
  if (typeof document === 'undefined') return;
  const rules = [];
  const cv = document.createElement('canvas');
  for (const name of Object.keys(ICONS)) {
    cv.width = cv.height = 11;
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, 11, 11);
    ICONS[name].forEach((row, y) => { for (let x = 0; x < 11; x++) { const c = ART_PAL[row[x]]; if (c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); } } });
    rules.push(`.ic-${name}{background-image:url(${cv.toDataURL()})}`);
  }
  for (const slot of ['weapon', 'head', 'chest', 'legs', 'arms', 'shoulders']) {
    cv.width = cv.height = 24;
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, 24, 24);
    drawItemArt(ctx, slot, 4, 'murmillo');
    rules.push(`.ic-slot-${slot}{background-image:url(${cv.toDataURL()});width:24px;height:24px}`);
  }
  const st = document.createElement('style');
  st.textContent = rules.join('\n');
  document.head.appendChild(st);
})();

// ---------- close-up portraits ----------
// A bust drawn on a 48x56 grid and scaled up to whatever canvas it is given. The face is built from
// the fighter himself: features from his id, expression from his morale, fatigue and injuries, scars
// from the wounds he has taken, and each piece of kit he wears drawn in its own material.

// What his face is doing today. The worst thing wins.
function moodOf(g) {
  if (g.injury > 0) return 'hurt';
  if (g.traits.includes('embittered') || (g.wish && g.wish.type === 'avenge')) return 'angry';
  if (g.fatigue >= 70) return 'weary';
  if (g.morale < 35) return 'low';
  if (g.morale >= 75) return 'proud';
  return 'grim';
}
// Fighters with a recorded history carry exactly those scars; anyone else (rivals, men at market)
// gets a few that fit his record.
function scarsOf(g) {
  if (g.scars) return g.scars;
  const n = Math.min(3, Math.floor(((g.losses || 0) + (g.rank || 0)) / 2)), out = [];
  for (let i = 0; i < n; i++) out.push({ k: (g.id + i) % 4 === 0 ? 'deep' : 'cut', p: (g.id * 3 + i * 5) % 6 });
  return out;
}
// The material of whatever fills a slot: the item itself, or the old numbered tiers rivals still use.
function slotMat(g, slot, look) {
  if (g.gear) return g.gear[slot] ? ITEM_MAT[g.gear[slot].r] : null;
  const t = slot === 'weapon' ? look.weapon : slot === 'head' ? look.head : slot === 'chest' ? look.armor : slot === 'arms' ? (look.arms ? 1 : 0) : 0;
  return t ? ITEM_MAT[[0, 2, 3, 4][t]] : null;
}

function drawBust(ctx, g, col, colD) {
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const M2 = (x, y, w, h, c) => { R(x, y, w, h, c); R(48 - x - w, y, w, h, c); };            // both sides of the face
  const seed = g.id * 7919 % 97, mood = moodOf(g), look = gearLook(g);
  const skin = g.look.skin, skinD = shade(skin, 0.8), skinDD = shade(skin, 0.62), skinL = shade(skin, 1.16);
  const hair = g.look.hair, hairD = shade(hair, 0.7), hairL = shade(hair, 1.25), ink = '#1c1310';
  const team = col || TEAM_COL[0], teamD = colD || shade(team, 0.7), teamL = shade(team, 1.3);
  const wood = '#7a5a2a', woodD = '#5e4222', leather = '#6b4526', leatherD = '#4a2f1a';
  const hurt = mood === 'hurt';
  const mHead = hurt ? null : slotMat(g, 'head', look), mChest = slotMat(g, 'chest', look);
  const mArms = slotMat(g, 'arms', look), mSh = slotMat(g, 'shoulders', look), mWep = slotMat(g, 'weapon', look);
  const build = g.stats.str >= 14 ? 2 : g.stats.str >= 8 ? 1 : 0;
  const jaw = seed % 3;                                   // 0 square, 1 even, 2 narrow

  // wall behind him, darker toward the edges
  R(0, 0, 48, 56, '#54433a');
  for (let y = 5, r = 0; y < 56; y += 7, r++) { R(0, y, 48, 1, '#483930'); for (let x = r % 2 ? 5 : 13; x < 48; x += 16) R(x, y - 6, 1, 6, '#483930'); }
  R(0, 0, 48, 3, 'rgba(0,0,0,.28)'); R(0, 0, 3, 56, 'rgba(0,0,0,.2)'); R(45, 0, 3, 56, 'rgba(0,0,0,.2)'); R(16, 6, 16, 34, 'rgba(255,220,160,.06)');

  // his weapon, held upright behind the shoulder
  const weapon = (x, flip) => {
    const W = mWep || { m: '#a07a44', d: woodD, l: '#c49a5c', t: woodD };       // no item: a wooden practice piece
    const F = (dx, y, w, h, c) => R(flip ? x + 3 - dx - w + 1 : x + dx, y, w, h, c);
    if (g.cls === 'retiarius') {
      F(1, 16, 2, 30, wood); F(2, 16, 1, 30, woodD); F(-2, 14, 8, 2, W.d);
      F(-2, 5, 1, 9, W.m); F(1, 3, 2, 11, W.m); F(5, 5, 1, 9, W.m); F(1, 3, 1, 8, W.l); F(-2, 4, 1, 1, W.l); F(5, 4, 1, 1, W.l);
    } else if (g.cls === 'hoplomachus') {
      F(1, 15, 2, 31, wood); F(2, 15, 1, 31, woodD); F(0, 13, 4, 2, W.t);
      F(1, 3, 2, 10, W.m); F(0, 6, 4, 5, W.m); F(1, 3, 1, 9, W.l); F(3, 7, 1, 4, W.d);
    } else if (g.cls === 'thraex') {
      F(0, 12, 4, 26, W.m); F(0, 12, 1, 26, W.l); F(3, 12, 1, 26, W.d);
      F(1, 8, 4, 4, W.m); F(3, 5, 3, 3, W.m); F(5, 3, 2, 2, W.m); F(1, 8, 1, 4, W.l);
      F(-2, 38, 8, 2, W.t); F(0, 40, 4, 6, leather);
    } else {
      F(0, 10, 4, 28, W.m); F(0, 10, 1, 28, W.l); F(3, 10, 1, 28, W.d); F(1, 7, 2, 3, W.m); F(1, 5, 1, 2, W.l); F(2, 14, 1, 20, W.d);
      F(-2, 38, 8, 2, W.t); F(0, 40, 4, 6, leather);
    }
  };
  weapon(3, false);
  if (g.cls === 'dimachaerus') weapon(41, true);

  // long hair falls behind the neck
  const style = seed % 3;
  if (style === 2 && !mHead) { M2(11, 16, 4, 24, hairD); M2(12, 14, 3, 4, hair); M2(12, 30, 2, 8, hair); }

  // neck and shoulders
  R(19, 33, 10, 10, skin); R(26, 33, 3, 10, skinD); R(19, 36, 10, 2, skinDD); R(19, 38, 8, 1, skinD);
  const sh = [7, 11, 15, 18, 19 + build];
  for (let y = 39; y < 56; y++) { const w = sh[Math.min(y - 39, 4)]; R(24 - w, y, w * 2, 1, skin); R(24 + w - 4, y, 4, 1, skinD); }
  R(24 - 15, 41, 6, 1, skinL); R(24 - 18, 43, 5, 1, skinL);
  M2(14, 44, 8, 1, skinD); R(23, 45, 2, 11, skinD); M2(11, 51, 11, 1, skinD); M2(12, 52, 9, 1, skinDD);
  if (build === 2) M2(9, 46, 1, 6, skinD);

  // scars on the body show only where no armour covers them
  const scars = scarsOf(g);
  const scarC = shade(skin, 0.58), scarL = shade(skin, 1.22);
  if (!mChest) scars.forEach(s => {
    if (s.k === 'claw') for (let i = 0; i < 3; i++) for (let j = 0; j < 6; j++) R((s.p % 2 ? 28 : 10) + i * 3 + (j >> 1), 45 + j, 1, 1, scarC);
    if (s.k === 'arm') for (let j = 0; j < 6; j++) { R((s.p % 2 ? 37 : 8) + (j >> 1), 44 + j, 1, 1, scarC); R((s.p % 2 ? 38 : 9) + (j >> 1), 44 + j, 1, 1, scarL); }
  });

  // chest: a cuirass in the metal of the piece, or bare skin under a sword belt
  if (mChest) {
    const C = mChest;
    for (let y = 43; y < 56; y++) { const w = Math.min(sh[4] - 3, 12 + (y - 43)); R(24 - w, y, w * 2, 1, C.m); R(24 + w - 3, y, 3, 1, C.d); R(24 - w, y, 1, 1, C.d); }
    R(18, 43, 12, 1, C.t); R(19, 44, 10, 1, C.d); R(21, 45, 6, 1, C.d);
    M2(13, 48, 8, 1, C.l); M2(12, 52, 10, 1, C.d); R(23, 46, 2, 10, C.d); M2(15, 45, 2, 3, C.t); M2(15, 45, 1, 1, C.l);
    if (g.gear && g.gear.chest && g.gear.chest.r >= 4) { R(21, 49, 6, 4, C.t); R(22, 50, 4, 2, C.l); R(23, 50, 2, 2, C.t); }
  } else {
    for (let i = 0; i < 16; i++) { R(11 + i * 2, 43 + i, 3, 2, leather); R(11 + i * 2, 44 + i, 3, 1, leatherD); }
    R(23, 48, 3, 3, '#c8913c'); R(24, 49, 1, 1, '#e8b860');
  }
  // arm guard: padded, strapped sleeve on the sword arm
  if (mArms) {
    const A = mArms, x0 = 24 - sh[4];
    for (let y = 47; y < 56; y++) { R(x0, y, 6, 1, (y - 47) % 3 === 2 ? A.d : A.m); R(x0, y, 1, 1, A.l); }
    R(x0, 46, 6, 1, A.t);
  }
  // shoulder guards: layered plates over each shoulder
  if (mSh) {
    const S = mSh;
    M2(24 - sh[4] - 1, 41, 11, 2, S.m); M2(24 - sh[4] - 2, 43, 12, 2, S.m); M2(24 - sh[4] - 2, 45, 11, 2, S.m);
    M2(24 - sh[4] - 1, 42, 11, 1, S.d); M2(24 - sh[4] - 2, 44, 12, 1, S.d); M2(24 - sh[4] - 2, 46, 11, 1, S.d);
    R(24 - sh[4], 41, 6, 1, S.l); M2(24 - sh[4] + 8, 40, 2, 2, S.t);
  }
  // neck cloth in his house's colour
  R(18, 40, 12, 2, team); R(18, 41, 12, 1, teamD); R(20, 42, 8, 1, teamD); R(18, 40, 5, 1, teamL);

  // head
  const hw = y => y < 11 ? 0 : y === 11 ? 5 : y === 12 ? 7 : y === 13 ? 8 : y <= 28 ? 9
    : [[9, 9, 8, 8, 7, 6, 5], [9, 8, 8, 7, 6, 5, 4], [8, 8, 7, 6, 5, 4, 3]][jaw][y - 29];
  M2(13, 22, 3, 6, skinD); M2(14, 23, 1, 4, skinDD); R(13, 22, 2, 1, skin);                       // ears
  for (let y = 11; y <= 35; y++) { const w = hw(y); R(24 - w, y, w * 2, 1, skin); R(24 + w - 3, y, 3, 1, skinD); R(24 - w, y, 1, 1, skinD); }
  R(17, 15, 4, 2, skinL); R(16, 26, 3, 2, skinL);                                                 // light on brow and cheek
  M2(16, 28, 2, 1, skinD);                                                                        // cheekbones

  // nose and mouth
  const nose = seed % 4;
  R(23, 22, 2, 7, skin); R(25, 24, 1, 5, skinD); R(23, 22, 1, 6, skinL); R(22, 28, 4, 1, skin); R(22, 29, 4, 1, skinD);
  R(22, 29, 1, 1, skinDD); R(25, 29, 1, 1, skinDD);
  if (nose === 0) { R(21, 28, 1, 1, skin); R(26, 28, 1, 1, skinD); }                              // broad
  if (nose === 1) R(24, 24, 1, 2, skinD);                                                         // broken once
  const lip = shade(skin, 0.55);
  R(21, 34, 6, 1, skinD);
  if (mood === 'proud') { R(20, 32, 8, 1, lip); R(19, 31, 1, 1, lip); R(28, 31, 1, 1, lip); R(22, 33, 4, 1, skinL); }
  else if (mood === 'low') { R(20, 32, 8, 1, lip); R(19, 33, 1, 1, lip); R(28, 33, 1, 1, lip); }
  else if (mood === 'angry') { R(20, 32, 8, 1, lip); R(20, 33, 1, 1, lip); R(27, 33, 1, 1, lip); R(21, 31, 6, 1, skinD); }
  else if (hurt) { R(20, 31, 8, 3, lip); R(21, 32, 6, 1, '#efe6d2'); R(23, 32, 1, 1, lip); R(25, 32, 1, 1, lip); }
  else if (mood === 'weary') { R(21, 32, 6, 1, lip); R(22, 33, 4, 1, shade(skin, 0.45)); }
  else R(20, 32, 8, 1, lip);

  // eyes and brows
  const iris = ['#3a2412', '#241408', '#3f6a8a', '#4a6a3a', '#5a3a1a'][seed % 5];
  const lid = shade(skin, 0.42), white = '#efe6d2', brow = shade(hair, 0.62);
  const eye = (x, shut, px) => {
    if (shut) { R(x, 24, 4, 1, lid); return; }
    R(x, 23, 4, 1, lid); R(x, 24, 4, 1, white); R(x + px, 24, 2, 1, iris); R(x + px, 24, 1, 1, ink); R(x + px + 1, 24, 1, 1, shade(iris, 1.7));      // and the light in it
    if (mood === 'weary') { R(x, 24, 4, 1, lid); R(x + 1, 25, 2, 1, white); R(x + px, 25, 1, 1, iris); R(x, 27, 4, 1, skinDD); }
    else R(x, 25, 4, 1, skinD);
    if (mood === 'proud') { R(x, 22, 4, 1, lid); R(x, 23, 4, 1, white); R(x + px, 23, 2, 2, iris); R(x + px, 23, 1, 1, ink); }
  };
  eye(17, false, 1); eye(27, hurt, 1);
  if (hurt) { R(26, 22, 6, 5, 'rgba(110,40,90,.35)'); R(27, 26, 4, 1, 'rgba(60,20,60,.45)'); }
  if (mood === 'angry') { R(16, 20, 3, 1, brow); R(18, 21, 4, 1, brow); R(21, 22, 1, 1, brow); R(29, 20, 3, 1, brow); R(26, 21, 4, 1, brow); R(26, 22, 1, 1, brow); R(23, 21, 2, 1, skinD); }
  else if (mood === 'low' || hurt) { R(16, 22, 2, 1, brow); R(17, 21, 3, 1, brow); R(20, 20, 2, 1, brow); R(30, 22, 2, 1, brow); R(28, 21, 3, 1, brow); R(26, 20, 2, 1, brow); }
  else if (mood === 'proud') { M2(16, 20, 6, 1, brow); M2(16, 21, 1, 1, brow); }
  else M2(16, 21, 6, 1, brow);

  // beard, by the same rule the arena sprite uses
  if (seed % 5 < 2) {
    for (let y = 29; y <= 35; y++) { const w = hw(y); R(24 - w, y, w * 2, 1, y % 2 ? hair : hairD); }
    R(19, 30, 10, 1, hair); R(20, 31, 8, 3, skinD);
    R(20, 32, 8, 1, hurt ? '#efe6d2' : lip); R(22, 34, 4, 1, hair); R(24 - hw(27), 26, 2, 3, hair); R(22 + hw(27), 26, 2, 3, hairD);
    R(19, 30, 3, 1, hairL);
  } else if (seed % 5 === 2) {
    for (let y = 29; y <= 35; y++) {                          // a day's stubble, kept clear of the mouth
      const w = hw(y), c = 'rgba(40,28,20,.17)';
      if (y >= 31 && y <= 33) { R(24 - w, y, w - 5, 1, c); R(29, y, w - 5, 1, c); } else R(24 - w, y, w * 2, 1, c);
    }
  }

  // ---- where he comes from, and how long he has been at this ----
  const origin = g.origin, bearded = seed % 5 < 2, veteran = (g.wins || 0) + (g.losses || 0) >= 10 || (g.rank || 0) >= 3;
  if (veteran) {                                 // the years: lines across the brow, and at the corners of the eyes
    R(19, 17, 10, 1, skinD); R(21, 19, 6, 1, skinD); R(15, 25, 1, 1, skinDD); R(32, 25, 1, 1, skinDD); R(16, 26, 1, 1, skinDD); R(31, 26, 1, 1, skinDD);
    M2(17, 26, 4, 1, skinD);
  }
  if (seed % 11 === 0) R(seed % 2 ? 29 : 18, 30, 1, 1, shade(skin, 0.5));                         // a mole
  if (seed % 13 < 2 && origin !== 'Numidia') for (let i = 0; i < 6; i++) R(17 + (i * 5) % 14, 26 + (i * 3) % 4, 1, 1, shade(skin, 0.82));      // freckles
  if (origin === 'Thrace') {                     // tattooed, as his people are: a mark on the brow and a line of dots down the cheek
    const tat = '#3f5a7a';
    R(23, 16, 2, 1, tat); R(24, 15, 1, 3, tat); R(17, 27, 1, 1, tat); R(18, 29, 1, 1, tat); R(17, 31, 1, 1, tat); R(30, 27, 1, 1, tat); R(29, 29, 1, 1, tat);
  } else if (origin === 'Gaul') {                // a long moustache, and a torc of twisted gold
    if (!bearded) { R(20, 31, 8, 1, hair); R(19, 32, 2, 3, hair); R(27, 32, 2, 3, hairD); R(21, 31, 3, 1, hairL); }
    R(19, 39, 10, 1, '#e8b545'); R(18, 38, 1, 1, '#e8b545'); R(29, 38, 1, 1, '#b6832c'); R(21, 39, 1, 1, '#fff0b0'); R(22, 40, 1, 1, '#b6832c'); R(25, 40, 1, 1, '#b6832c');
  } else if (origin === 'Germania') {            // his beard in a plait, or his hair in one down the side of his face
    if (bearded) { R(23, 36, 2, 5, hair); R(23, 37, 2, 1, hairD); R(23, 39, 2, 1, hairD); R(23, 41, 2, 1, '#8a2a20'); }
    else { R(14, 20, 2, 15, hair); R(14, 23, 2, 1, hairD); R(14, 27, 2, 1, hairD); R(14, 31, 2, 1, hairD); R(14, 35, 2, 1, '#8a2a20'); }
  } else if (origin === 'Numidia') {             // a ring of gold in his ear
    R(13, 27, 1, 2, '#e8b545'); R(14, 28, 1, 1, '#fff0b0'); R(34, 27, 1, 2, '#b6832c');
  } else if (origin === 'Hispania') {            // long at the sides, and a bronze charm at his throat
    M2(15, 21, 1, 7, hair); R(22, 42, 4, 1, leather); R(23, 43, 2, 2, '#c8913c'); R(23, 43, 1, 1, '#e8b860');
  } else if (origin === 'Greece' && !bearded) {  // clean-shaven, with a cleft in his chin
    R(24, 34, 1, 2, skinD);
  } else if (origin === 'Britannia') {           // painted with woad: three strokes across each cheek
    const woad = '#4a6a9a';
    for (let i = 0; i < 3; i++) { R(16, 26 + i * 2, 3 - (i & 1), 1, woad); R(29 + (i & 1), 26 + i * 2, 3 - (i & 1), 1, woad); }
    R(22, 13, 4, 1, woad);
  } else if (origin === 'Syria') {               // eyes lined with kohl, and a ring in one ear
    R(17, 25, 4, 1, '#241812'); R(27, 25, 4, 1, '#241812'); R(16, 24, 1, 1, '#241812'); R(31, 24, 1, 1, '#241812'); R(34, 27, 1, 2, '#c9d1d9');
  }

  // scars on the face
  scars.forEach(s => {
    const D = (x, y, n, dx) => { for (let i = 0; i < n; i++) { R(x + Math.round(i * dx), y + i, 1, 1, scarC); R(x + Math.round(i * dx) + 1, y + i, 1, 1, scarL); } };
    if (s.k === 'deep') { const x = s.p % 2 ? 29 : 18; D(x, 17, 4, 0.3); D(x + 1, 26, 5, 0.3); R(x, 21, 2, 1, skin); }        // through the brow and down the cheek
    else if (s.k === 'cut') {
      const p = s.p % 6;
      if (p === 0) D(16, 26, 4, 0.6); else if (p === 1) D(29, 26, 4, -0.6); else if (p === 2) D(27, 14, 4, 0.7);
      else if (p === 3) { R(22, 25, 4, 1, scarC); R(22, 24, 4, 1, scarL); } else if (p === 4) D(20, 33, 3, 0.5); else D(19, 14, 3, -0.5);
    } else if (s.k === 'claw' && mChest) for (let i = 0; i < 3; i++) D(28 + i * 2, 26, 4, -0.4);
  });

  // hair, or the helmet over it
  if (mHead) {
    const H = mHead, wide = g.cls === 'murmillo' || g.cls === 'thraex';
    const dome = [6, 8, 9, 10, 10, 10, 10, 10, 10, 10, 10, 10];
    dome.forEach((w, i) => { R(24 - w, 8 + i, w * 2, 1, H.m); R(24 + w - 3, 8 + i, 3, 1, H.d); });
    R(17, 10, 2, 7, H.l); R(16, 12, 1, 4, H.l);
    R(wide ? 10 : 13, 19, wide ? 28 : 22, 2, H.m); R(wide ? 10 : 13, 20, wide ? 28 : 22, 1, H.d); R(wide ? 10 : 13, 19, 8, 1, H.l);
    R(22, 18, 4, 1, H.t); R(23, 19, 2, 3, H.m); R(24, 19, 1, 3, H.d);                                // nose guard
    for (let y = 21; y <= 32; y++) { const w = y < 28 ? 4 : y < 31 ? 3 : 2; R(13, y, w, 1, H.m); R(13, y, 1, 1, H.l); R(35 - w, y, w, 1, H.d); }
    M2(14, 22, 1, 1, H.t);
    if (g.gear && g.gear.head && g.gear.head.r >= 4) { R(15, 16, 18, 1, H.t); R(23, 12, 2, 3, H.t); }
    if (g.cls === 'murmillo') { R(22, 1, 4, 8, team); R(22, 1, 1, 8, teamL); R(25, 1, 1, 8, teamD); R(21, 3, 1, 5, teamD); R(26, 3, 1, 5, teamD); R(21, 7, 6, 2, H.d); }
    else if (g.cls === 'thraex') { R(22, 4, 3, 5, H.m); R(23, 2, 4, 3, H.m); R(26, 3, 2, 2, H.l); R(25, 3, 1, 1, ink); R(17, 3, 5, 5, team); R(16, 5, 2, 5, teamD); R(18, 2, 3, 2, teamL); }
    else if (g.cls === 'hoplomachus') { R(23, 2, 2, 7, '#f0ead8'); R(20, 3, 2, 6, '#f0ead8'); R(26, 4, 2, 5, '#d8d0b8'); R(23, 1, 2, 2, team); R(20, 2, 2, 2, team); R(26, 3, 2, 2, team); }
    else { R(23, 6, 2, 2, H.t); R(23, 6, 1, 1, H.l); }
  } else {
    if (style === 1) {                                         // shaved close
      R(19, 10, 10, 1, hairD); R(17, 11, 14, 1, 'rgba(30,20,14,.5)'); for (let x = 16; x < 32; x += 2) { R(x, 12, 1, 1, 'rgba(30,20,14,.4)'); R(x + 1, 13, 1, 1, 'rgba(30,20,14,.25)'); }
    } else {
      R(19, 8, 10, 1, hairD); R(17, 9, 14, 1, hair); R(16, 10, 16, 1, hair);
      for (let y = 11; y <= 14; y++) { const w = hw(y) + 1; R(24 - w, y, w * 2, 1, hair); R(24 + w - 3, y, 3, 1, hairD); }
      R(15, 15, 5, 1, hair); R(22, 15, 3, 1, hair); R(28, 15, 5, 1, hairD); M2(14, 15, 2, 6, hair); R(32, 15, 2, 6, hairD);
      R(18, 10, 5, 1, hairL); R(17, 12, 3, 1, hairL); R(24, 11, 1, 3, hairD); R(21, 13, 1, 2, hairD);
      if (style === 2) { M2(13, 14, 2, 20, hair); R(34, 14, 1, 20, hairD); }
    }
    if (style !== 1 && (origin === 'Numidia' || origin === 'Greece' || seed % 7 === 3)) {       // tight curls
      for (let y = 9; y <= 14; y += 2) for (let x = 17 + (y % 4 ? 1 : 0); x < 32; x += 3) { R(x, y, 1, 1, hairL); R(x + 1, y + 1, 1, 1, hairD); }
    }
    if (veteran && style !== 1) {                // grey coming in at the temples, and on some the hair going back from the brow
      M2(15, 15, 2, 5, '#b4b0a6'); M2(16, 13, 2, 2, '#c8c4ba');
      if (seed % 4 === 0) { R(20, 10, 8, 2, skin); R(21, 9, 6, 1, skin); R(20, 11, 2, 1, skinL); }
    }
    if (origin === 'Greece' && style !== 1) { R(16, 12, 16, 1, '#f1ead8'); R(16, 13, 16, 1, 'rgba(0,0,0,.15)'); }      // a white fillet round the hair
    if (g.cls === 'retiarius') { R(15, 14, 18, 2, team); R(15, 15, 18, 1, teamD); R(13, 15, 2, 5, teamD); }      // headband
    if (g.traits.includes('laureate')) {                       // the tournament's laurel
      const leaf = '#5a9a3a', leafL = '#8fc35a';
      for (let i = 0; i < 5; i++) { M2(14 + i * 2, 13 - (i >> 1), 2, 2, i % 2 ? leaf : leafL); }
      R(23, 10, 2, 1, '#e8b545');
    }
    if (hurt) {                                                // bandaged, and no helmet until he heals
      for (let x = 14; x < 34; x++) R(x, 13 + ((x - 14) >> 3), 1, 3, x % 4 === 0 ? '#cfc6b0' : '#efe8d6');
      R(27, 15, 3, 2, '#a3261b'); R(28, 16, 1, 1, '#7a1a12'); R(33, 15, 2, 4, '#cfc6b0');
    }
  }
  if (mood === 'weary') { R(15, 18, 1, 2, '#c8e8f8'); R(32, 26, 1, 2, '#c8e8f8'); R(15, 20, 1, 1, '#8fc0e0'); }
  // ---- his standing, on the frame: bronze corners for a Gregarius, silver for a Veteranus, gold above that, and a champion's laurel ----
  const rk = g.rank || 0;
  if (rk > 0) {
    const rc = ['', '#b98a34', '#c9d1d9', '#e8b545', '#e8b545'][Math.min(4, rk)], rl = shade(rc, 1.3), n = rk >= 3 ? 9 : 7;
    for (const [x, y, w, h] of [[0, 0, n, 1], [0, 0, 1, n], [48 - n, 0, n, 1], [47, 0, 1, n], [0, 55, n, 1], [0, 56 - n, 1, n], [48 - n, 55, n, 1], [47, 56 - n, 1, n]]) R(x, y, w, h, rc);
    R(0, 0, 3, 1, rl); R(0, 0, 1, 3, rl); R(45, 0, 3, 1, rl); R(0, 55, 3, 1, rl);
    if (rk >= 3) { R(1, 1, 2, 2, rc); R(45, 1, 2, 2, rc); R(1, 53, 2, 2, rc); R(45, 53, 2, 2, rc); }
    if (rk >= 4) for (let i = 0; i < 4; i++) { R(3 + i * 2, 52 - i, 2, 2, i % 2 ? '#5a9a3a' : '#8fc35a'); R(43 - i * 2, 52 - i, 2, 2, i % 2 ? '#5a9a3a' : '#8fc35a'); }
  }
}

// Paints a fighter onto any portrait canvas. Beasts keep their arena drawing.
function drawPortrait(canvas, g, team, col, colD) {
  if (g.beast || !g.look) return drawSpritePortrait(canvas, g, team, col, colD);
  const ctx = canvas.getContext('2d'), s = Math.max(1, Math.floor(Math.min(canvas.width / 48, canvas.height / 56)));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#3a2d26'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(s, 0, 0, s, Math.floor((canvas.width - 48 * s) / 2), Math.floor((canvas.height - 56 * s) / 2));
  ctx.imageSmoothingEnabled = false;
  drawBust(ctx, g, col || TEAM_COL[team || 0], colD);
}
