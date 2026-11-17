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

// Draws one piece on a 16x16 grid.
function drawItemArt(ctx, slot, r, cls) {
  const M = ITEM_MAT[r], wood = '#7a5a2a', woodD = '#5e4222', ink = '#1c1310';
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const diag = (x0, y0, n, w, c) => { for (let i = 0; i < n; i++) R(x0 + i, y0 - i, w, w, c); };
  if (slot === 'weapon') {
    const kind = WEAPON_NAMES[cls] || 'gladius';
    if (kind === 'spear' || kind === 'trident') {
      diag(2, 13, 9, 2, ink); diag(2, 13, 9, 1, wood); for (let i = 0; i < 9; i++) R(3 + i, 13 - i, 1, 1, woodD);
      if (kind === 'spear') { diag(10, 5, 4, 3, ink); diag(10, 5, 4, 2, M.m); diag(11, 5, 3, 1, M.l); R(13, 1, 2, 2, M.l); }
      else { R(9, 3, 5, 1, ink); R(12, 3, 1, 5, ink); diag(10, 5, 3, 1, M.m); R(9, 1, 1, 3, M.m); R(11, 0, 1, 4, M.l); R(14, 3, 1, 3, M.m); R(12, 4, 3, 1, M.m); R(13, 5, 1, 2, M.d); R(9, 0, 1, 1, M.l); R(15, 5, 1, 1, M.l); }
    } else if (kind === 'twin blades') {
      diag(3, 12, 8, 3, ink); diag(4, 11, 7, 2, M.m); diag(4, 11, 7, 1, M.l);
      for (let i = 0; i < 8; i++) R(12 - i, 12 - i, 3, 3, ink); for (let i = 0; i < 7; i++) { R(11 - i, 11 - i, 2, 2, M.m); R(12 - i, 11 - i, 1, 1, M.d); }
      R(2, 12, 3, 3, M.t); R(11, 12, 3, 3, M.t); R(3, 13, 1, 1, '#e8b545'); R(12, 13, 1, 1, '#e8b545');
    } else {
      const n = kind === 'sica' ? 6 : 9;
      diag(4, 11, n, 3, ink); diag(5, 10, n - 1, 2, M.m); diag(5, 10, n - 1, 1, M.l);
      if (kind === 'sica') { R(9, 2, 5, 4, ink); R(10, 3, 3, 2, M.m); R(12, 3, 2, 1, M.l); R(13, 4, 1, 2, M.m); }
      else R(13, 1, 2, 2, M.l);
      R(2, 9, 5, 2, ink); R(5, 11, 2, 3, ink); R(3, 9, 3, 1, '#e8b545'); R(5, 11, 1, 2, '#e8b545');     // guard
      R(1, 12, 4, 3, ink); R(2, 12, 2, 2, wood); R(1, 14, 2, 1, M.t);                                    // grip and pommel
    }
  } else if (slot === 'head') {
    R(3, 2, 10, 13, ink);
    R(4, 4, 8, 5, M.m); R(4, 4, 8, 1, M.l); R(5, 5, 2, 2, M.l); R(4, 8, 8, 1, M.d);
    R(2, 9, 12, 2, ink); R(3, 9, 10, 1, M.l);                                   // brim
    R(4, 10, 3, 4, M.m); R(9, 10, 3, 4, M.m); R(7, 10, 2, 3, ink); R(4, 13, 3, 1, M.d); R(9, 13, 3, 1, M.d);
    R(5, 1, 6, 3, ink); R(6, 1, 4, 2, M.t); R(6, 1, 4, 1, r >= 5 ? '#fbe08a' : M.t);   // crest
  } else if (slot === 'chest') {
    R(2, 1, 12, 14, ink);
    R(3, 2, 3, 3, M.m); R(10, 2, 3, 3, M.m); R(6, 2, 4, 2, ink);                // shoulder straps, neck
    R(3, 5, 10, 6, M.m); R(4, 11, 8, 3, M.m); R(3, 5, 10, 1, M.l); R(3, 5, 1, 6, M.l);
    R(7, 6, 2, 7, M.d); R(4, 7, 3, 1, M.d); R(9, 7, 3, 1, M.d); R(5, 10, 6, 1, M.d);
    R(4, 13, 8, 1, M.t); if (r >= 4) { R(5, 6, 1, 1, M.l); R(10, 6, 1, 1, M.l); R(7, 3, 2, 1, '#e8b545'); }
  } else if (slot === 'legs') {
    for (const x of [2, 9]) {
      R(x, 1, 5, 14, ink); R(x + 1, 2, 3, 11, M.m); R(x + 1, 2, 1, 11, M.l); R(x + 3, 3, 1, 9, M.d);
      R(x + 1, 2, 3, 2, M.l); R(x + 1, 7, 3, 1, M.t); R(x, 13, 5, 2, ink); R(x + 1, 13, 4, 1, wood);
    }
  } else if (slot === 'arms') {
    R(2, 4, 12, 9, ink);
    for (let i = 0; i < 4; i++) { R(3 + i * 3, 5, 2, 7, M.m); R(3 + i * 3, 5, 2, 1, M.l); R(5 + i * 3, 5, 1, 7, M.d); }
    R(3, 11, 11, 1, M.d); R(13, 6, 2, 5, ink); R(13, 7, 1, 3, '#d9a57c');       // the hand end
    R(1, 6, 2, 5, M.t);
  } else {  // shoulders
    for (const [x, f] of [[1, 1], [9, -1]]) {
      R(x, 4, 6, 9, ink); R(x + 1, 5, 4, 3, M.m); R(x + 1, 5, 4, 1, M.l);
      R(x + 1, 8, 4, 2, M.m); R(x + 1, 8, 4, 1, M.d); R(x + 1, 10, 4, 2, M.m); R(x + 1, 10, 4, 1, M.d);
      R(f > 0 ? x + 4 : x + 1, 6, 1, 1, '#e8b545');
    }
    R(6, 3, 4, 3, ink); R(7, 4, 2, 1, M.t);
  }
  if (r === 6) { R(1, 1, 1, 1, '#ffffff'); R(14, 3, 1, 1, '#ffffff'); R(13, 13, 1, 1, '#fbe08a'); R(2, 12, 1, 1, '#fbe08a'); }   // an imperial piece glints
}

// Paints a <canvas data-item="slot:rarity:style">: a dark plate framed in the rarity's colour.
function paintItem(cv) {
  const [slot, r, cls] = cv.dataset.item.split(':'), ctx = cv.getContext('2d'), s = cv.width / 20;
  ctx.setTransform(s, 0, 0, s, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = RARITY_COL[+r]; ctx.fillRect(0, 0, 20, 20);
  ctx.fillStyle = '#17110f'; ctx.fillRect(1, 1, 18, 18);
  ctx.fillStyle = '#2c211c'; ctx.fillRect(2, 2, 16, 16);
  ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(2, 2, 16, 8);
  ctx.translate(2, 2);
  drawItemArt(ctx, slot, +r, cls);
}
function itemArt(it, size) { return `<canvas class="itemart" width="${size}" height="${size}" data-item="${it.slot}:${it.r}:${it.cls || ''}"></canvas>`; }
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
    cv.width = cv.height = 16;
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, 16, 16);
    drawItemArt(ctx, slot, 4, 'murmillo');
    rules.push(`.ic-slot-${slot}{background-image:url(${cv.toDataURL()});width:26px;height:26px}`);
  }
  const st = document.createElement('style');
  st.textContent = rules.join('\n');
  document.head.appendChild(st);
})();
