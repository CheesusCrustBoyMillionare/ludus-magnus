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
  // ---- what its grade has done to it: rust and damage at the bottom, rivets and polish in the middle, gold and gems at the top ----
  const P = (pts, c) => { for (const [x, y] of pts) R(x, y, 1, 1, c); };
  const rust = '#a0522d', pit = '#3a1c10', gold = '#e8b545', goldL = '#fbe08a', gem = r === 6 ? '#b77be8' : '#d8402e', gemL = r === 6 ? '#f0e0ff' : '#ff9a8a';
  const long = slot === 'weapon' && ['spear', 'trident'].includes(WEAPON_NAMES[cls]), twin = slot === 'weapon' && WEAPON_NAMES[cls] === 'twin blades';
  if (slot === 'weapon') {
    if (long) {
      if (r <= 1) { P([[11, 4], [12, 2]], rust); if (r === 0) P([[12, 4], [4, 11]], pit); }
      if (r >= 2) P([[9, 6], [10, 6]], M.t);                                     // a binding under the head
      if (r >= 3) P([[5, 10], [7, 8]], M.d);                                     // iron bands on the shaft
      if (r >= 4) P([[12, 3]], '#ffffff');
      if (r >= 5) { P([[9, 6], [10, 6], [9, 7]], gold); P([[8, 8], [7, 9]], '#c23b2e'); P([[2, 14], [3, 14]], gold); }      // gilt, a tassel, a shod butt
      if (r === 6) P([[11, 5]], gem);
    } else if (twin) {
      if (r <= 1) { P([[6, 9], [9, 9]], rust); if (r === 0) P([[8, 7], [7, 7], [10, 5]], pit); }
      if (r >= 3) P([[6, 10], [9, 10]], M.d);
      if (r >= 4) P([[10, 4], [5, 4]], '#ffffff');
      if (r >= 5) { P([[2, 12], [4, 12], [11, 12], [13, 12]], gold); P([[3, 13], [12, 13]], gem); }
      if (r === 6) P([[7, 8], [8, 8]], goldL);
    } else {
      if (r <= 1) { P([[7, 8], [10, 5]], rust); if (r === 0) P([[8, 8], [11, 5], [9, 5]], pit); }      // rust, and a notch out of the edge
      if (r >= 3) P([[6, 10], [8, 8], [10, 6]], M.d);                             // a fuller down the blade
      if (r >= 4) P([[7, 8], [9, 6], [11, 4]], '#ffffff');                        // polished
      if (r >= 5) { R(2, 9, 5, 1, gold); R(3, 9, 2, 1, goldL); P([[1, 13], [2, 14]], gold); P([[1, 14]], gem); }      // a gilt guard, a jewelled pommel
      if (r === 6) P([[6, 9], [8, 7], [10, 5]], goldL);                           // gold let into the steel
    }
  } else if (slot === 'head') {
    if (r <= 1) { P([[6, 6], [10, 5], [5, 11]], rust); R(5, 1, 6, 1, ink); R(6, 2, 4, 1, M.d); if (r === 0) P([[9, 7], [10, 12], [7, 5]], pit); }      // rusted, its crest long gone
    if (r >= 3) P([[4, 9], [7, 9], [11, 9]], M.d);                                // rivets along the brim
    if (r >= 4) { R(6, 0, 4, 1, M.t); R(7, 0, 2, 1, shade(M.t, 1.3)); P([[10, 5]], '#ffffff'); }      // a full crest
    if (r >= 5) { R(4, 7, 8, 1, gold); R(5, 7, 2, 1, goldL); P([[4, 11], [11, 11]], gold); }           // a band of gold round the bowl
    if (r === 6) { P([[7, 6], [8, 6]], gem); P([[7, 5]], gemL); P([[5, 6], [10, 6]], '#8fc35a'); }     // a jewel at the brow, between laurel
  } else if (slot === 'chest') {
    if (r <= 1) { P([[5, 8], [10, 9], [6, 12]], rust); if (r === 0) { P([[9, 6], [10, 7], [10, 8]], ink); P([[4, 9], [8, 12]], pit); } else R(9, 8, 2, 2, '#6b4526'); }      // rust and a crack; or a leather patch
    if (r >= 3) P([[4, 6], [11, 6], [4, 9], [11, 9], [5, 12], [10, 12]], M.d);    // rivets
    if (r >= 5) { R(4, 13, 8, 1, gold); R(7, 8, 2, 2, gold); P([[7, 8]], goldL); P([[3, 2], [12, 2]], gold); }      // a gilt hem, and a boss on the breast
    if (r === 6) { P([[5, 7], [6, 8], [9, 8], [10, 7]], gold); P([[7, 9], [8, 9]], gem); P([[8, 8]], gemL); }       // an eagle's wings round it, and a jewel
  } else if (slot === 'legs') {
    for (const x of [2, 9]) {
      if (r <= 1) { P([[x + 2, 5], [x + 1, 10]], rust); if (r === 0) P([[x + 3, 8], [x + 2, 11]], pit); }
      if (r >= 3) P([[x + 2, 4]], M.l);                                           // a boss at the knee
      if (r >= 5) { R(x + 1, 2, 3, 1, gold); R(x + 1, 7, 3, 1, gold); P([[x + 2, 4]], goldL); }
      if (r === 6) P([[x + 2, 9]], gem);
    }
  } else if (slot === 'arms') {
    if (r <= 1) { P([[4, 8], [10, 7]], rust); if (r === 0) P([[7, 9], [3, 6], [12, 10]], pit); }
    if (r >= 3) for (let i = 0; i < 4; i++) P([[3 + i * 3, 8]], M.d);             // a rivet in every plate
    if (r >= 5) { R(3, 5, 11, 1, gold); R(3, 11, 11, 1, gold); P([[4, 5], [8, 5]], goldL); }
    if (r === 6) P([[6, 8], [9, 8]], gem);
  } else {
    for (const x of [1, 9]) {
      if (r <= 1) { P([[x + 2, 6], [x + 3, 10]], rust); if (r === 0) P([[x + 1, 9], [x + 4, 7]], pit); }
      if (r >= 3) P([[x + 1, 9], [x + 4, 9], [x + 1, 11], [x + 4, 11]], M.l);     // rivets
      if (r >= 5) { R(x + 1, 5, 4, 1, gold); R(x + 1, 12, 4, 1, gold); }
      if (r === 6) { R(x + 2, 6, 2, 2, gold); P([[x + 2, 6]], gem); }             // a lion's mask on each
    }
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
  if (+r >= 3) {                                 // a glow behind the better pieces, in the colour of their grade
    const c = RARITY_COL[+r], n = parseInt(c.slice(1), 16), rgb = `${n >> 16},${(n >> 8) & 255},${n & 255}`;
    for (let i = 0; i < 4; i++) { ctx.fillStyle = `rgba(${rgb},${(0.05 + (+r - 3) * 0.015).toFixed(3)})`; ctx.fillRect(4 + i, 4 + i, 12 - i * 2, 12 - i * 2); }
  }
  if (+r >= 5) { ctx.fillStyle = '#fff6d8'; for (const [x, y] of [[0, 0], [19, 0], [0, 19], [19, 19]]) ctx.fillRect(x, y, 1, 1); ctx.fillStyle = shade(RARITY_COL[+r], 1.3); ctx.fillRect(1, 0, 3, 1); ctx.fillRect(0, 1, 1, 3); ctx.fillRect(16, 19, 3, 1); ctx.fillRect(19, 16, 1, 3); }
  if (+r === 0) { ctx.fillStyle = 'rgba(160,82,45,.10)'; ctx.fillRect(2, 12, 16, 6); }      // and the worst sit in their own rust
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
