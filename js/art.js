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
// Every piece is built in layers on a 32x32 grid of letters, and only turned into colours at the end:
//   shape     which drawing: the slot, and how well made the piece is. Grades come in four bands, and each band
//             of a slot is a different object: scrap and leather (F, E), a soldier's plain kit (D, C), an officer's
//             fine work (B, A), and parade armour (S). The better grade of each pair has a step up of its own, and
//             relics each have a drawing to themselves.
//   material  the letters h, l, m, d, D stand for the grade's metal from shine to deep shade, and t, T for its trim.
//   fitting   what the smith has done to it since: studs, splints, padding, piping, weight on the pommel.
//   marks     what is this piece's alone: a dent, a scratch, the tone of its leather and the dye of its cloth.
// Nothing is drawn pixel by pixel from a map. Blades, shafts and straps are strokes of a given width, shaded
// across it; plates are rows of a given span, shaded as a rounded thing lit from the upper left. The outline is
// added last, round whatever has been drawn, so no shape has to carry its own.
// Letters: h l m d D metal · t T trim · w W wood · e c C leather (light, main, dark) · G g y gold · J j gem ·
// n N cloth · r R crest red · s S skin · f F fur · q laurel · k ink · x rust on the two worst grades · p a pit on the
// worst · v a rivet from iron upward · o O a stud and its shadow.
const ITEM_BAND = [0, 0, 1, 1, 2, 2, 3];
const ITEM_N = 32;
// The five pieces out of the old stories, each in a metal of its own.
const RELIC_MAT = { crest: 4, cuirass: 4, pelt: 2, greaves: 2, vambrace: 3 };

// Colour helpers that keep to #rrggbb, so that their results can be mixed again.
const tone = (hex, f) => (f <= 1 ? mixHex(hex, '#000000', 1 - f) : mixHex(hex, '#ffffff', f - 1));
function hueTurn(hex, deg) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return hex;
  const c = d, m = l - c / 2;
  const h = ((((mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + deg) % 360) + 360) % 360;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const out = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + out.map(v => Math.max(0, Math.min(255, Math.round((v + m) * 255))).toString(16).padStart(2, '0')).join('');
}
// A run of numbers from 0 to 1 that is always the same for the same seed.
function artRng(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function drawItemArt(ctx, slot, r, cls, o) {
  o = o || {};
  const relic = o.relic && RELIC_MAT[o.relic] !== undefined ? o.relic : '';
  const band = ITEM_BAND[r], M = ITEM_MAT[relic ? RELIC_MAT[relic] : r], fit = o.fit || '';
  const hi = !relic && r < 6 && r % 2 === 1;      // the better grade of the two that share a drawing: it gets a step up in shape
  const N = ITEM_N, cells = new Array(N * N).fill('');
  let flip = false, under = false;
  const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? '' : cells[y * N + x]);
  const put = (x, y, c) => {
    if (flip) x = N - 1 - x;
    if (!c || x < 0 || y < 0 || x >= N || y >= N || (under && cells[y * N + x])) return;
    cells[y * N + x] = c;
  };
  const wipe = (x, y, w, h) => { for (let j = 0; j < (h || 1); j++) for (let i = 0; i < (w || 1); i++) if (x + i >= 0 && x + i < N && y + j >= 0 && y + j < N) cells[(y + j) * N + (flip ? N - 1 - x - i : x + i)] = ''; };
  const R = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c); };
  const P = (pts, c) => { for (const [x, y] of pts) put(x, y, c); };
  const both = (pts, c, c2) => { for (const [x, y] of pts) { put(x, y, c); put(N - 1 - x, y, c2 || c); } };

  // ---- the two ways of drawing ----
  // A stroke from one point to another, r0 wide at the start and r1 at the end (half-widths). pal(u, t, w) names the
  // letter for a place across it: u runs from 1 on the lit edge to -1 on the shaded one, t from 0 to 1 along it.
  const limb = (x0, y0, x1, y1, r0, r1, pal) => {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    let nx = uy, ny = -ux;
    if (nx + ny > 0) { nx = -nx; ny = -ny; }       // the normal that faces the light, which is up and to the left
    const pad = Math.max(r0, r1) + 1;
    for (let y = Math.floor(Math.min(y0, y1) - pad); y <= Math.ceil(Math.max(y0, y1) + pad); y++) for (let x = Math.floor(Math.min(x0, x1) - pad); x <= Math.ceil(Math.max(x0, x1) + pad); x++) {
      const px = x + 0.5 - x0, py = y + 0.5 - y0, t = (px * ux + py * uy) / len;
      if (t < 0 || t > 1) continue;
      const w = r0 + (r1 - r0) * t, s = px * nx + py * ny;
      if (Math.abs(s) <= w) put(x, y, pal(w ? s / w : 0, t, w));
    }
  };
  const disc = (cx, cy, rad, pal) => {
    for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      const px = x + 0.5 - cx, py = y + 0.5 - cy;
      if (px * px + py * py <= rad * rad) put(x, y, pal(-(px + py) / (rad * 1.4142), 0, rad));
    }
  };
  // Rows of a shape, each [first, last] or nothing, shaded as a rounded thing: round is how much the light falls
  // off from the top of it to the bottom.
  const METAL = { h: 'h', l: 'l', m: 'm', d: 'd', D: 'D' }, HIDE = { h: 'e', l: 'e', m: 'c', d: 'C', D: 'C' };
  const DYED = { h: 't', l: 't', m: 't', d: 'T', D: 'T' }, RED = { h: 'R', l: 'R', m: 'r', d: 'r', D: 'r' }, FUR = { h: 'f', l: 'f', m: 'f', d: 'F', D: 'F' };
  const tone5 = v => (v > 0.8 ? 'h' : v > 0.32 ? 'l' : v > -0.42 ? 'm' : v > -0.86 ? 'd' : 'D');
  const mass = (y0, rows, pal, round) => rows.forEach((row, j) => {
    if (!row) return;
    const [x0, x1] = row, w = x1 - x0, g = rows.length > 1 ? j / (rows.length - 1) : 0.4;
    for (let x = x0; x <= x1; x++) put(x, y0 + j, pal[tone5(-((w ? (x - x0) / w : 0.4) - 0.42) * 1.9 - (g - 0.4) * (round === undefined ? 0.7 : round))]);
  });
  const sym = hws => hws.map(h => (h ? [16 - h, 15 + h] : null));
  const M3 = u => (u > 0.4 ? 'l' : u < -0.4 ? 'd' : 'm');                                   // bright metal
  const I3 = u => (u > 0.3 ? 'm' : u < -0.4 ? 'D' : 'd');                                   // dull iron fittings
  const W3 = u => (u > 0.15 ? 'w' : 'W'), L3 = u => (u > 0.5 ? 'e' : u < -0.3 ? 'C' : 'c'), G3 = u => (u > 0.4 ? 'G' : u < -0.4 ? 'y' : 'g'), T3 = u => (u > -0.25 ? 't' : 'T');

  // ---- weapons: drawn along the diagonal, hilt at the bottom left. a counts steps along it from the corner, and s
  // is how far off to the side, toward the light ----
  const A = (a, s) => [3 + a - (s || 0) * 0.7071, 29 - a - (s || 0) * 0.7071];
  const seg = (a0, s0, a1, s1, r0, r1, pal) => limb(...A(a0, s0), ...A(a1, s1), r0, r1, pal);
  const dot = (a, s, c) => { const [x, y] = A(a, s); put(Math.floor(x), Math.floor(y), c); };
  const rust = spots => { if (r <= 1) spots.forEach(([a, s], i) => dot(a, s, i < 2 ? 'x' : r === 0 ? 'p' : '')); };      // two of rust, and the rest pits
  const hilt = (g0, small) => {
    const bd = band, wrap = bd === 3 ? 'g' : bd === 2 ? 't' : 'W';
    seg(2.2, 0, g0, 0, 1.3, 1.3, fit === 'quick' ? (u => (u > 0 ? 'n' : 'N')) : W3);       // the grip, bound in linen for a light hand
    for (let a = 3.6; a < g0 - 1; a += 1.9) seg(a, -1.3, a, 1.3, 0.42, 0.42, () => (fit === 'quick' ? 'N' : wrap));      // cord or wire round it
    const gl = (small ? 2.3 : [2.4, 3.4, 4.4, 4.4][bd]) + (hi && !small ? 1.3 : 0);         // the guard, across the blade
    seg(g0, -gl, g0, gl, 1.15, 1.15, bd === 3 ? G3 : bd === 0 ? I3 : bd === 1 ? M3 : T3);
    if (bd >= 2 && !small) for (const s of [gl, -gl]) disc(...A(g0, s), 1.45, bd === 3 ? G3 : T3);      // a knob on each end of it
    if (bd === 3) dot(g0, 0, 'j');
    // the pommel: a lump of lead if weighted, a ring if balanced
    const [px, py] = A(1.1);
    if (fit === 'weighted') { disc(px, py, 3, u => (u > 0.45 ? 'm' : u < -0.35 ? 'D' : 'd')); put(Math.floor(px) - 1, Math.floor(py) - 1, 'l'); }
    else if (fit === 'balanced') { disc(px, py, 2.9, G3); disc(px, py, 1.15, () => 'k'); }
    else if (bd === 0) disc(px, py, 1.6, I3);
    else if (bd === 1) disc(px, py, 2, M3);
    else if (bd === 2) { disc(px, py, 2.2, T3); put(Math.floor(px), Math.floor(py), 'l'); }
    else { disc(px, py, 2.4, G3); put(Math.floor(px), Math.floor(py), 'j'); put(Math.floor(px) - 1, Math.floor(py) - 1, 'J'); }
  };
  const sword = (L, small) => {
    const bw = fit === 'quick' ? 1.6 : 2.3, g0 = small ? 6.5 : 8.5;
    if (hi && (band < 2 || small)) L += 1.2;                                                // a longer blade, or on the finest a broader guard
    const b0 = g0 + 0.6, b1 = g0 + 1 + L;
    seg(b0, 0, b1, 0, bw, bw, M3); seg(b1, 0, b1 + bw * 1.5, 0, bw, 0, M3);                 // the blade and its point
    if (band >= 1 && fit !== 'quick') seg(b0 + 1.4, 0, b1 - 1, 0, 0.5, 0.5, () => 'd');     // a fuller down it
    if (band >= 2) seg(b0 + 0.6, bw * 0.55, b1 + 0.6, bw * 0.55, 0.36, 0.36, () => 'h');    // ground and polished
    if (band === 3) for (let a = b0 + 2.4; a < b1 - 1; a += 2.6) dot(a, 0, 'g');            // gold let into the steel
    rust([[b0 + 3.3, 0.9], [b0 + L * 0.7, -0.8], [b0 + L * 0.45, 0.2], [b0 + 1.6, -1]]);
    if (r === 0) { const [x, y] = A(b0 + L * 0.55, -bw + 0.2); wipe(Math.floor(x), Math.floor(y)); }      // and a notch out of the edge
    hilt(g0, small);
  };
  // A pole arm is drawn close: the head fills the picture and the shaft runs out of the bottom corner of the frame.
  const shaft = a1 => {
    limb(-1, 33, ...A(a1), 1.3, 1.3, W3);
    if (band >= 1) for (const a of [4.6, 8.8]) seg(a, -1.35, a, 1.35, 0.5, 0.5, () => (band === 3 ? 'g' : 'd'));      // iron bands
    if (fit === 'weighted') { disc(...A(6.2), 2.8, u => (u > 0.45 ? 'm' : u < -0.35 ? 'D' : 'd')); dot(6.2, 1.5, 'l'); }      // a lump of lead on the shaft
    if (fit === 'balanced') seg(5.6, 0, 8.2, 0, 1.95, 1.95, G3);                            // a collar where the hand goes
    if (fit === 'quick') { seg(3, 0, 9.6, 0, 1.4, 1.4, u => (u > 0.1 ? 'n' : 'N')); for (let a = 4; a < 9.5; a += 1.8) seg(a, -1.4, a, 1.4, 0.4, 0.4, () => 'N'); }
  };
  const draw = {
    gladius: () => sword([10.5, 12, 13.5, 13.5][band]),
    'twin blades': () => { const L = [7.5, 8.5, 9.5, 9.5][band]; sword(L, true); flip = true; sword(L, true); flip = false; },
    sica: () => {                                // a short blade that hooks forward at the end
      const g0 = 8.5, b0 = g0 + 0.6, n = [7, 8, 8.5, 8.5][band] + (hi && band < 2 ? 1 : 0), [x1, y1] = A(b0 + n);
      disc(x1, y1, 2.3, M3);
      seg(b0, 0, b0 + n, 0, 2.3, 2.3, M3);
      limb(x1, y1, x1 + 4.6, y1 - 2.1, 2.3, 1.9, M3); disc(x1 + 4.6, y1 - 2.1, 1.9, M3); limb(x1 + 4.6, y1 - 2.1, x1 + 9.4, y1 - 2.5, 1.9, 0, M3);
      if (band >= 1) seg(b0 + 1.2, -0.4, b0 + n, -0.4, 0.45, 0.45, () => 'd');
      if (band >= 2) { seg(b0 + 0.6, 1.3, b0 + n, 1.3, 0.36, 0.36, () => 'h'); limb(x1 + 1, y1 - 2, x1 + 6.5, y1 - 3.7, 0.36, 0.36, () => 'h'); }
      if (band === 3) for (let a = b0 + 2; a < b0 + n; a += 2.5) dot(a, 0.4, 'g');
      rust([[b0 + 3, 0.9], [b0 + n - 1, -0.9], [b0 + n * 0.5, 0.2], [b0 + n + 2.5, 0.5]]);
      hilt(g0);
    },
    spear: () => {
      // a narrow head lashed on; a soldier's leaf; a broad polished leaf with a tassel; the same with gold let in
      const ah = [12, 10.5, 9, 9][band], len = [12, 15, 17.5, 17.5][band], W = [3, 4.2, 5.4, 5.4][band] + (hi && !band ? 0.9 : 0);
      shaft(ah - 1);
      if (band >= 2) { const [tx, ty] = A(ah - 2.2, -1.2), x = Math.floor(tx), y = Math.floor(ty); R(x, y, 2, 6, 'r'); P([[x + 1, y + 1], [x + 1, y + 3], [x, y + 5]], 'R'); put(x, y + 6, 'r'); put(x + 1, y + 7, 'r'); }      // a tassel under the head
      if (hi && band >= 1) seg(ah - 0.9, -4.2, ah - 0.9, 4.2, 0.95, 0.75, M3);              // a wing each side of the socket
      seg(ah - 3.4, 0, ah + 0.4, 0, 1.75, 1.5, band === 3 ? G3 : band >= 1 ? I3 : L3);      // the socket, or the binding
      if (!band) for (const a of [ah - 2.7, ah - 1.3]) seg(a, -1.75, a, 1.75, 0.4, 0.4, () => 'C');
      const rib = band >= 2 ? 'h' : 'd';
      const face = (u, t, w) => { const s = u * w; return Math.abs(s) < 0.5 ? rib : u > 0 ? (u > 0.8 && w > 2.4 ? 'm' : 'l') : u < -0.72 && w > 1.6 ? 'd' : 'm'; };
      seg(ah, 0, ah + len * 0.36, 0, 0.9, W, face); seg(ah + len * 0.36, 0, ah + len, 0, W, 0, face);
      if (band === 3) for (let a = ah + 2; a < ah + len - 3; a += 2.4) dot(a, 0, 'g');      // gold down the rib
      rust([[ah + 4, 1.2], [ah + len * 0.6, -0.9], [ah + 3, -1], [7, 0]]);
    },
    trident: () => {
      const a0 = 12.5, sp = band ? 7.4 : 6.2;
      shaft(a0 - 0.6);
      if (hi && band) seg(a0 - 3.2, 0, a0 - 0.8, 0, 2.1, 2.1, band === 2 ? T3 : M3);        // a collar where the head meets the shaft
      seg(a0, -sp, a0, sp, 1.5, 1.5, band === 3 ? G3 : band === 0 ? L3 : I3);              // the bar the tines stand on
      for (const s of [sp, -sp, 0]) {
        const n = (s ? 8.5 : 12) - (band ? 0 : 1) + (hi && band && !s ? 1.2 : 0);
        seg(a0, s, a0 + n - 2.4, s, 1.45, 1.3, M3); seg(a0 + n - 2.4, s, a0 + n + 0.8, s, 1.3, 0.15, M3);
        if (band >= 1 || hi) for (const k of s ? [-Math.sign(s)] : [1, -1]) seg(a0 + n - 1.6, s, a0 + n - 4.4, s + k * 2.6, 0.95, 0.3, M3);      // a barb on each: the outer tines hooked inward, the middle one both ways
        if (band >= 2) seg(a0 + 0.8, s + 0.75, a0 + n - 2, s + 0.75, 0.34, 0.34, () => 'h');
      }
      if (band === 3) disc(...A(a0), 1.5, u => (u > 0 ? 'J' : 'j'));
      rust([[a0 + 4, 0.3], [a0 + 3, -sp], [a0 + 5, sp + 0.4], [6, 0.2]]);
    },
  };

  // ---- armour ----
  const strips = (y, n, c, cd, tip) => {         // the skirt of straps under a cuirass
    for (const [a, b] of [[6, 8], [10, 12], [14, 17], [19, 21], [23, 25]]) {
      R(a, y, b - a + 1, n, c); R(b, y, 1, n, cd); R(a + 1, y + n, b - a - 1 || 1, 1, cd);
      if (tip) R(a, y + n - 2, b - a + 1, 2, tip);
    }
  };
  const armour = {
    head: () => {
      const B = relic ? 1 : band, lea = B === 0, pal = lea ? HIDE : METAL;
      if (relic) {                               // the centurion's crest runs from ear to ear
        mass(1, sym([8, 11, 13, 13, 13, 12]), RED, 0.4);
        for (let x = 3; x < 29; x += 2) for (let y = 1; y < 7; y++) if (at(x, y)) put(x, y, x < 16 ? 'R' : 'r');
        for (let x = 4; x < 29; x += 2) for (let y = 1; y < 7; y++) if (at(x, y) === 'R' && x > 16) put(x, y, 'r');
        R(7, 7, 18, 1, 'g'); R(7, 7, 6, 1, 'G'); R(20, 7, 5, 1, 'y');
      } else if (B >= 2) {                       // a plume, front to back
        mass(B === 3 ? 0 : 1, sym(B === 3 ? [2, 3, 4, 5, 5, 4, 4, 3] : [1, 2, 3, 4, 4, 3, 3]), DYED, 0.3);
        for (let y = 2; y < 8; y++) if (at(15, y)) put(15, y, y % 2 ? 'T' : 't');
        R(13, 8, 6, 1, B === 3 ? 'g' : 'd');
      }
      const top = B >= 2 || relic ? 8 : 5;
      mass(top, sym(top === 8 ? [6, 8, 9, 10, 10, 11, 11, 11, 11] : [3, 5, 7, 8, 9, 10, 10, 11, 11, 11, 11, 11]), pal, 0.9);
      if (lea) {
        // a leather cap, sewn down the middle, with an iron band round the brow and a flap over each ear
        for (let y = 6; y < 14; y++) { put(16, y, 'C'); if (y % 2) put(15, y, 'e'); }
        R(5, 14, 22, 1, 'l'); R(5, 15, 22, 1, 'm'); R(5, 16, 22, 1, 'd'); R(21, 15, 6, 1, 'd');
        P([[9, 15], [19, 15]], 'x'); if (r === 0) P([[13, 15], [24, 14]], 'p');
        const flap = [[5, 9], [5, 9], [5, 9], [5, 8], [6, 8], [6, 8], [6, 7]];
        mass(17, flap, HIDE, 0.3); mass(17, flap.map(([a, b]) => [31 - b, 31 - a]), HIDE, 0.3);
        both([[6, 24], [6, 25], [7, 26]], 'C');
        R(10, 17, 12, 5, 'k');
        if (hi) { R(15, 3, 2, 2, 'm'); put(15, 3, 'l'); for (let y = 5; y < 14; y++) { put(15, y, 'l'); put(16, y, 'd'); } }      // a button on the crown, and a strip of iron over it
      } else if (B === 1) {
        // a soldier's pot: a knob, a band riveted round the brow, a brim, and a cheek-piece hinged each side
        if (!relic) { R(15, 3, 2, 2, 'm'); put(15, 3, 'l'); put(16, 4, 'd'); }
        const G = relic ? ['G', 'g', 'y'] : ['l', 'm', 'd'];
        R(5, 14, 22, 1, G[0]); R(5, 15, 22, 1, G[1]); R(5, 16, 22, 1, G[2]); R(22, 15, 5, 1, G[2]);
        P([[8, 15], [13, 15], [18, 15], [23, 15]], relic ? 'G' : 'v');
        const bw = hi ? 14 : 13;
        mass(17, sym([bw]), METAL, 0); R(16 - bw + 1, 18, bw * 2 - 2, 1, 'D');
        R(10, 18, 12, 6, 'k');
        const cheek = [[5, 9], [5, 9], [5, 9], [5, 9], [5, 9], [6, 9], [6, 10], [7, 10], [8, 10], [9, 10]];
        mass(18, cheek, METAL, 0.4); mass(18, cheek.map(([a, b]) => [31 - b, 31 - a]), METAL, 0.4);
        both([[7, 20]], 'v'); both([[5, 18], [6, 18], [7, 18], [8, 18], [9, 18]], 'd', 'D');
        if (relic) for (let y = 19; y < 28; y++) for (let x = 0; x < 16; x++) if (at(x, y) && at(x, y) !== 'k' && !at(x - 1, y)) { put(x, y, 'g'); put(31 - x, y, 'y'); }
        if (hi) { R(15, 1, 2, 2, 'm'); put(15, 1, 'l'); }                                    // a spike, and a broader brim
      } else {
        // an officer's helm: the brow bound in colour, and a mask over the face with slits for the eyes
        R(5, 14, 22, 1, 'l');
        if (B === 3) { for (let x = 5; x < 27; x++) { put(x, 14, x % 2 ? 'q' : 'g'); put(x, 15, x % 2 ? 'g' : 'q'); } R(5, 16, 22, 1, 'y'); }      // a wreath of laurel
        else { R(5, 15, 22, 1, 't'); R(5, 16, 22, 1, 'T'); }
        mass(17, sym([13]), METAL, 0);
        const mask = sym([11, 11, 11, 11, 10, 10, 9, 8, 7, 5]);
        mass(18, mask, METAL, 0.5);
        mask.forEach(([a, b], j) => { put(a, 18 + j, B === 3 ? 'g' : 't'); put(b, 18 + j, B === 3 ? 'y' : 'T'); });
        R(11, 27, 10, 1, B === 3 ? 'y' : 'T');
        R(9, 19, 5, 1, 'd'); R(18, 19, 5, 1, 'd'); R(9, 20, 5, 2, 'k'); R(18, 20, 5, 2, 'k');
        R(15, 19, 1, 6, 'l'); R(16, 19, 1, 6, 'd');
        P([[11, 24], [13, 24], [12, 26], [18, 24], [20, 24], [19, 26]], 'k');
        if (B === 3) { P([[14, 10], [14, 11], [17, 10], [17, 11], [15, 9], [16, 9], [15, 12], [16, 12]], 'g'); R(15, 10, 2, 2, 'j'); put(15, 10, 'J'); }
        if (hi) both([[3, 15], [2, 14], [3, 14], [2, 13], [1, 12], [2, 12], [1, 11], [1, 10]], 't', 'T');      // a feather at each temple
      }
    },
    chest: () => {
      const B = relic ? 2 : band, lea = B === 0, pal = lea ? HIDE : METAL;
      const tl = relic || B === 3 ? 'g' : 't', td = relic || B === 3 ? 'y' : 'T';
      const yoke = [[8, 10], [7, 11], [6, 12], [5, 12]];                                    // a strap over each shoulder, broadening into it
      mass(3, yoke, pal, 0.3); mass(3, yoke.map(([a, b]) => [31 - b, 31 - a]), pal, 0.3);
      const body = [[5, 26], [4, 27], [4, 27], [5, 26], [6, 25], [6, 25], [6, 25], [7, 24], [7, 24], [7, 24], [7, 24], [7, 24], [6, 25], [6, 25]];
      mass(7, body, pal, 0.5);
      wipe(13, 7, 6, 1); wipe(14, 8, 4, 1);                                                // the neck
      if (relic) {                               // silvered scale, and a legate's red sash knotted over it
        body.forEach(([a, b], j) => { for (let x = a; x <= b; x++) if (at(x, 7 + j)) { const s = (x + ((j >> 1) & 1) * 2) % 4; put(x, 7 + j, j % 2 ? 'dmdD'[s] : 'lmmd'[s]); } });
        limb(25, 6, 8, 19, 1.8, 1.8, u => (u > 0 ? 'R' : 'r'));
        limb(8, 20, 5.5, 27, 1.2, 0.9, u => (u > 0 ? 'R' : 'r')); limb(9.5, 20, 11, 28, 1.2, 0.9, u => (u > 0.2 ? 'R' : 'r'));
        disc(8.5, 19.5, 2.3, u => (u > 0.2 ? 'R' : 'r'));
      } else if (lea) {
        // a hide jerkin, and a plate of iron riveted over the heart
        R(11, 10, 10, 7, 'm'); R(11, 10, 10, 1, 'l'); R(11, 10, 1, 7, 'l'); R(11, 16, 10, 1, 'd'); R(20, 10, 1, 7, 'd');
        P([[11, 10], [20, 10], [11, 16], [20, 16]], 'k'); P([[14, 12], [17, 14]], 'x'); if (r === 0) P([[13, 14], [18, 11]], 'p');
        for (let x = 7; x < 25; x += 2) put(x, 19, 'C');
      } else {
        // a breastplate, the chest and belly beaten into it; on the better ones the edges are bound in colour
        both([[8, 5]], 'v');
        both([[8, 12], [8, 13], [9, 14], [10, 14], [11, 14], [12, 14], [13, 13], [14, 12]], 'd'); both([[9, 15], [10, 15], [11, 15], [12, 15]], 'l', 'm');
        for (let y = 10; y < 20; y++) put(16, y, 'd');
        if (B === 1) P([[9, 19], [13, 19], [18, 19], [22, 19]], 'v');
        else {
          both([[11, 17], [12, 17], [13, 17], [11, 19], [12, 19], [13, 19]], 'd'); put(15, 19, 'D');
          P([[12, 7], [13, 8], [14, 9], [15, 9], [16, 9], [17, 9], [18, 8], [19, 7]], tl);
          for (let j = 2; j < 7; j++) { put(body[j][0], 7 + j, tl); put(body[j][1], 7 + j, td); }
          R(6, 20, 20, 1, tl); R(20, 20, 6, 1, td);
        }
        if (B === 3) { both([[13, 10], [12, 10], [11, 9], [10, 9], [9, 8], [13, 11], [12, 11], [11, 11], [10, 10]], 'g', 'g'); R(15, 10, 2, 2, 'j'); put(15, 10, 'J'); P([[14, 10], [17, 10], [14, 11], [17, 11]], 'G'); }
        if (hi && B === 1) both([[3, 8], [3, 9], [4, 10]], 'l', 'D');                         // broader at the shoulder
        if (hi && B === 2) { R(14, 10, 4, 3, 't'); R(15, 11, 2, 1, 'l'); put(17, 12, 'T'); }  // a medallion on the breast
      }
      R(6, 21, 20, 1, relic ? 'g' : 'C'); R(15, 21, 2, 1, B === 3 || relic ? 'G' : lea ? 'd' : 'l');      // the belt
      if (hi) for (const x of [9, 13, 18, 22]) R(x, 22, 1, 4, B >= 2 ? 'T' : 'C');          // a second row to the skirt, showing between
      if (relic) strips(22, 5, 'r', 'r', 'g');
      else if (B >= 2) strips(22, hi ? 6 : 5, 't', 'T', B === 3 ? 'g' : '');
      else strips(22, hi ? 6 : 5, 'c', 'C');
      if (B === 2 && !relic) for (const x of [7, 11, 15, 20, 24]) put(x, 25, 'l');
      if (!lea) for (const x of [6, 10, 14, 19, 23]) put(x, 22, B >= 2 ? (relic ? 'R' : 't') : 'e');
    },
    legs: () => {
      const B = relic ? 1 : band, lea = B === 0, pal = lea ? HIDE : METAL;
      // a cap for the knee, and under it a plate that is broadest over the calf and narrows to the ankle
      const shin = [[4, 6], [3, 7], [3, 7], [3, 7], [2, 8], [1, 9], [1, 9], [1, 9], [1, 9], [1, 9], [1, 9], [1, 9], [2, 9], [2, 9], [2, 9], [2, 9], [2, 8], [2, 8], [2, 8], [3, 8], [3, 8]];
      for (const gx of relic ? [5, 17] : [3, 17]) {
        mass(3, shin.map(([a, b]) => [gx + a, gx + b]), pal, 0.5);
        R(gx + 2, 7, 7, 1, lea ? 'C' : 'D');
        R(gx + 2, 24, 8, 1, 'C'); R(gx + 1, 25, 10, 1, 'w'); R(gx + 1, 26, 10, 1, 'W'); put(gx + 10, 25, 'W');      // the sandal under it
        if (relic) {                             // beaten thin, with a wing at each ankle
          const dir = gx < 16 ? -1 : 1, bx = dir < 0 ? gx + 2 : gx + 9, wing = u => (u > -0.1 ? 'n' : 'N');
          under = true;
          limb(bx, 21, bx + dir * 5.5, 14.5, 1.3, 0.4, wing); limb(bx, 22, bx + dir * 5, 18.5, 1.1, 0.4, wing); limb(bx, 23, bx + dir * 4, 21.5, 0.9, 0.4, wing);
          under = false;
          for (let y = 9; y < 22; y++) put(gx + 4, y, 'h');
          R(gx + 3, 22, 6, 1, 'd');
        } else if (lea) {
          // hide bound round the shin, a splint of iron down the front of it
          for (const y of [10, 14, 18, 21]) for (let x = 1; x < 10; x++) if (at(gx + x, y)) put(gx + x, y, 'C');
          for (let y = 3; y < 23; y++) if (y !== 7) { put(gx + 5, y, 'l'); put(gx + 6, y, 'd'); }
          put(gx + 5, 11, 'x'); put(gx + 6, 19, 'x'); if (r === 0) put(gx + 5, 16, 'p');
        } else if (B === 1) {
          P([[gx + 3, 10], [gx + 4, 21], [gx + 5, 5]], 'v');
          R(gx + 10, 11, 1, 2, 'C'); R(gx + 9, 19, 1, 2, 'C');                              // the straps round the calf
        } else {
          // a cap over the knee, a ridge down the shin, and a band at the knee and the ankle
          const tl = B === 3 ? 'g' : 't', td = B === 3 ? 'y' : 'T';
          R(gx + 1, 8, 9, 1, tl); R(gx + 8, 8, 2, 1, td); R(gx + 3, 22, 6, 1, tl); put(gx + 8, 22, td);
          for (let y = 9; y < 22; y++) { put(gx + 4, y, B === 3 ? 'G' : 'h'); put(gx + 5, y, B === 3 ? 'g' : 'd'); }
          if (B === 3) { R(gx + 3, 4, 5, 3, 'g'); R(gx + 3, 4, 5, 1, 'G'); R(gx + 7, 5, 1, 2, 'y'); R(gx + 4, 5, 3, 1, 'j'); put(gx + 4, 5, 'J'); }
          else { R(gx + 4, 4, 2, 2, 'l'); put(gx + 4, 4, 'h'); }
        }
        if (hi) { R(gx + 4, 2, 3, 1, pal.l); put(gx + 6, 2, pal.m); R(gx + 2, 4, 1, 3, pal.l); R(gx + 8, 4, 1, 3, pal.D); R(gx + 1, 5, 1, 1, pal.l); R(gx + 9, 5, 1, 1, pal.D); }      // a cap standing over the knee, and a wing either side of it
      }
    },
    arms: () => {
      if (relic) {                               // an arm-ring of three coils, gold over iron
        for (const front of [false, true]) for (let i = 0; i < 3; i++) {
          const cy = 9 + i * 6.5;
          for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const ex = (x + 0.5 - 16) / 11.5, ey = (y + 0.5 - cy) / 5, ix = (x + 0.5 - 16) / 8.4, iy = (y + 0.5 - cy) / 2.5;
            if (ex * ex + ey * ey > 1 || ix * ix + iy * iy <= 1 || (y + 0.5 > cy) !== front) continue;
            const f = (x - 4.5) / 23, k = (f < 0.28 ? 0 : f < 0.72 ? 1 : 2) + (front ? 0 : 1);
            put(x, y, ix * ix + iy * iy < 1.45 && front ? 'd' : ['G', 'g', 'y', 'y'][k]);
          }
        }
        R(25, 25, 3, 3, 'g'); R(26, 26, 2, 2, 'j'); put(26, 26, 'J');
        return;
      }
      // an arm guard on a bent arm: plates down the upper arm from the shoulder at the top left, the elbow at the
      // bottom, and more up the forearm to a fist. Leather between the plates on the worst; a cop over the elbow
      // on the best.
      const lea0 = band === 0, trim = band === 3 ? 'g' : 't', trimD = band === 3 ? 'y' : 'T';
      const drop = x => Math.round((x - 4) * 0.8);                                          // the upper arm slopes down to the elbow
      const lame = (x, y, w, h, lea, up) => {
        for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
          const a = up ? j : i, an = up ? h : w, b = up ? i : j, bn = up ? w : h;           // a runs across the joins, b round the arm
          let c = a === an - 1 ? 'D' : b < 2 ? (a === 0 ? 'h' : 'l') : b >= bn - 1 ? 'D' : b >= bn - 3 ? 'd' : 'm';
          if (a === 0 && band >= 2) c = b >= bn - 2 ? trimD : trim;
          if (band >= 1 && a === an >> 1 && b === bn - 4 && an > 2) c = 'v';
          if (lea) c = a === an - 1 || b >= bn - 2 ? 'C' : b < 2 ? 'e' : 'c';
          put(x + i, y + j + (up ? 0 : drop(x + i)), c);
        }
      };
      R(1, 6, 3, 13, lea0 ? 'c' : trim); R(3, 6, 1, 13, lea0 ? 'C' : trimD); put(1, 6, lea0 ? 'e' : band === 3 ? 'G' : trim);      // the strap at the shoulder
      let x = 4;
      [[7, 6], [5, 4, 4], [5, 4, 4], [4, 3, 3, 3]][band].forEach((w, i) => { lame(x, 7, w, 10, lea0 && i === 1, false); if (lea0 && !i) P([[x + 2, 12], [x + 4, 16]], 'x'); x += w; });      // upper arm, shoulder to elbow
      let y = 19;
      [[6, 5], [4, 4, 3], [4, 4, 3], [3, 3, 3, 2]][band].forEach((h, i) => { y -= h; const thin = y < 13 ? 1 : 0; lame(19 + thin, y, 9 - thin * 2, h, lea0 && i === 1, true); if (lea0 && !i) put(22, y + 3, 'p'); });      // forearm, elbow up to the wrist
      R(20, 7, 7, 1, lea0 ? 'C' : band === 1 ? 'd' : trim);                                 // the cuff
      R(19, 2, 9, 5, 's'); R(20, 1, 7, 1, 's'); R(27, 2, 1, 5, 'S'); R(20, 6, 8, 1, 'S');   // the fist
      P([[22, 1], [22, 2], [24, 1], [24, 2], [26, 1], [26, 2], [19, 4], [20, 4], [21, 4], [22, 4], [23, 4], [23, 3]], 'S');
      // the elbow: a plain joint plate, or a round cop with a boss
      mass(19, [[17, 27], [17, 28], [17, 28], [17, 28], [17, 28], [17, 28], [17, 28], [18, 27], [19, 26]], lea0 ? HIDE : METAL, 0.8);
      if (lea0) P([[20, 21], [24, 21], [20, 25], [24, 25], [22, 23]], 'C');
      else if (band === 1) P([[20, 22], [25, 22], [22, 25]], 'v');
      else { disc(22.5, 23.5, 3.2, u => (u > -0.2 ? trim : trimD)); disc(22.5, 23.5, 1.7, band === 3 ? (u => (u > 0 ? 'J' : 'j')) : M3); }
      if (hi) {                                  // a point to the elbow, and a cap over the top of the arm
        const E = lea0 ? HIDE : METAL;
        P([[28, 26], [29, 27]], E.d); P([[28, 27], [29, 28], [27, 27]], E.D);
        R(4, 4, 7, 3, E.m); R(4, 4, 7, 1, E.l); R(10, 5, 1, 2, E.d); R(5, 3, 5, 1, E.l);
      }
    },
    shoulders: () => {
      if (relic) {                               // the fell lion, his mask at the collar and a paw over each shoulder
        both([[10, 4], [11, 3], [12, 3], [11, 4], [12, 4]], 'f', 'F');
        mass(5, sym([4, 5, 6, 6, 6, 5]), FUR, 0.6); mass(11, sym([9, 12, 13, 14, 14]), FUR, 0.5);
        const arm = [[2, 13], [2, 11], [2, 10], [2, 9], [2, 8], [3, 8], [3, 8]];
        mass(16, arm, FUR, 0.3); mass(16, arm.map(([a, b]) => [31 - b, 31 - a]), FUR, 0.3);
        R(2, 23, 7, 2, 'f'); R(23, 23, 7, 2, 'F'); both([[2, 25], [4, 25], [6, 25], [8, 25]], 'n', 'N');
        for (let y = 5; y < 25; y++) for (let x = 0; x < N; x++) if (at(x, y) === 'f' && (x * 3 + y * 5) % 7 === 0) put(x, y, 'F');
        both([[13, 7]], 'k'); R(14, 8, 4, 2, 'n'); R(15, 8, 2, 1, 'k'); R(14, 10, 4, 1, 'N'); P([[15, 10], [16, 10]], 'k');
        return;
      }
      // one pauldron: a domed cap with plates lapping down the arm under it, the whole leaning out over the arm; a
      // strap up to the neck and another round under the arm
      const lea = band === 0, pal = lea ? HIDE : METAL, trim = band === 3 ? 'g' : 't', trimD = band === 3 ? 'y' : 'T';
      mass(4, [[11, 18], [9, 20], [7, 22], [6, 23], [5, 24], [4, 24], [4, 25], [3, 25], [3, 25], [3, 25], [3, 25], [3, 25]], pal, 1);
      R(3, 16, 23, 1, lea ? 'C' : band >= 2 ? trim : 'D'); if (band >= 2) R(19, 16, 7, 1, trimD);      // the cap's rim
      const lames = [[[4, 24, 4]], [[4, 24, 3], [5, 23, 3]], [[4, 24, 3], [5, 23, 3], [6, 22, 2]], [[4, 24, 3], [5, 23, 3], [6, 22, 2]]][band].slice();
      if (hi && band < 2) lames.push([[5, 23, 3], [6, 22, 2]][band]);                        // one more plate down the arm
      if (hi && band === 2) { R(10, 3, 10, 1, 'm'); R(12, 2, 6, 1, 'l'); put(10, 3, 'l'); put(19, 3, 'd'); }      // or a ridge standing on the cap
      let y = 17;
      for (const [a, b, h] of lames) {
        mass(y, new Array(h).fill([a, b]), pal, 0.5);
        R(a, y + h, b - a + 1, 1, lea ? 'C' : band >= 2 ? trim : 'D'); if (band >= 2) R(b - 5, y + h, 6, 1, trimD);
        if (band >= 1) P([[a + 2, y + h - 1], [b - 3, y + h - 1], [(a + b) >> 1, y + h - 1]], 'v');
        y += h + 1;
      }
      if (lea) { R(10, 8, 7, 5, 'm'); R(10, 8, 7, 1, 'l'); R(10, 8, 1, 5, 'l'); R(10, 12, 7, 1, 'd'); R(16, 8, 1, 5, 'd'); P([[13, 10]], 'x'); if (r === 0) put(12, 11, 'p'); P([[6, 18], [10, 18], [14, 18], [18, 18], [22, 18]], 'C'); }      // a plate sewn to the hide
      else if (band === 1) P([[5, 15], [10, 15], [15, 15], [20, 15], [24, 15]], 'v');
      else {                                     // a boss on the cap, and on the best a gilded crown to it
        disc(14, 10.5, 3.4, u => (u > -0.2 ? trim : trimD)); disc(14, 10.5, 1.9, band === 3 ? (u => (u > 0 ? 'J' : 'j')) : M3);
        if (band === 3) { R(11, 4, 8, 1, 'g'); P([[9, 5], [10, 5], [19, 5], [20, 5]], 'g'); for (let x = 4; x < 25; x += 3) put(x, 16, 'G'); }
      }
      // lean it: each row slides over, top toward the neck and bottom out along the arm
      const flat = cells.slice(); cells.fill('');
      for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) { const c = flat[yy * N + xx], nx = xx + Math.round((16 - yy) / 3); if (c && nx >= 0 && nx < N) cells[yy * N + nx] = c; }
      under = true;
      limb(22, 10, 30.5, 1.5, 1.35, 1.35, L3);                                              // to the neck
      limb(17, 18, 29, 30, 1.35, 1.35, L3);                                                 // under the arm
      under = false;
      R(26, 4, 3, 3, band === 3 ? 'g' : 'l'); R(28, 4, 1, 3, band === 3 ? 'y' : 'd'); R(26, 6, 3, 1, band === 3 ? 'y' : 'd'); put(27, 5, 'k');      // and its buckle
    },
  };
  if (slot === 'weapon' && !relic) draw[WEAPON_NAMES[cls] || 'gladius']();
  else (armour[slot] || armour.chest)();

  const metal = c => c === 'm' || c === 'l' || c === 'd' || c === 'h' || c === 'v' || c === 'D';
  const inside = (x, y) => at(x - 1, y) && at(x + 1, y) && at(x, y - 1) && at(x, y + 1);
  // ---- what is this piece's alone: no two are quite alike. Each item's number picks its marks of use (a dent or a
  // scratch, and on poor work a nick out of the edge), and further down the tone of its leather, wood and metal
  // and the dye of its cloth. Relics, parade pieces and master-wrought work carry no marks.
  const seed = relic ? 0 : o.seed | 0;
  if (seed && !o.mw && band < 3) {
    const rw = artRng(seed ^ 0x51ed27), spots = [], edges = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const c = at(x, y);
      if ((c === 'm' || c === 'c') && inside(x, y)) spots.push([x, y]);
      if ((c === 'm' || c === 'd' || c === 'D') && at(x - 1, y) && at(x, y - 1) && (!at(x + 1, y) || !at(x, y + 1)) && at(x - 1, y - 1)) edges.push([x, y]);
    }
    const marks = band === 0 ? 3 : band === 1 ? 2 : rw() < 0.5 ? 1 : 0;
    for (let i = 0; i < marks && spots.length; i++) {
      const [x, y] = spots[Math.floor(rw() * spots.length)], dk = at(x, y) === 'c' ? 'C' : 'd', n = 1 + Math.floor(rw() * 3);
      for (let k = 0; k < n; k++) if (k === 0 || ((at(x + k, y - k) === 'm' || at(x + k, y - k) === 'c') && inside(x + k, y - k))) cells[(y - k) * N + x + k] = dk; else break;      // drawn out into a scratch
    }
    if (edges.length && (band === 0 || (band === 1 && rw() < 0.5))) { const [x, y] = edges[Math.floor(rw() * edges.length)]; cells[y * N + x] = ''; }
  }
  // ---- what the smith has done to it since: armour only; a weapon's fitting is in how it was drawn above. Each is
  // placed by the shape of the piece it is on, so that it sits on the drawing and not across it:
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
      for (const x of { head: [8, 22], chest: [10, 20], shoulders: [10, 18], legs: [7, 21], arms: [9, 23] }[slot] || []) {
        let first = true, last = -1;
        for (let y = 0; y < N; y++) {
          if (!(body(was(x, y)) && body(was(x + 1, y)) && deep(x, y) && deep(x + 1, y))) continue;
          set(x, y, first ? 'o' : 'l'); set(x + 1, y, 'D'); first = false; last = y;
        }
        if (last >= 0) set(x, last, 'o');
      }
    } else if (fit === 'lightened') {
      const rows = { head: [0.3], chest: [0.28, 0.6], shoulders: [0.3, 0.62], legs: [0.3, 0.62], arms: [0.42, 0.8] }[slot] || [0.5];
      for (const t of rows) {
        const ya = Math.round(y0 + (y1 - y0) * t);
        const slits = y => { const out = []; for (let x = 0; x < N; x++) if (x % 3 === 1 && [0, 1, 2].every(k => body(was(x, y + k)) && deep(x, y + k)) && deep(x + 1, y)) out.push(x); return out; };
        const y = [0, 1, -1, 2, -2, 3].map(k => ya + k).find(y => slits(y).length >= 2);      // a row that has room for them
        if (y !== undefined) for (const x of slits(y)) { set(x, y, 'k'); set(x, y + 1, 'k'); set(x, y + 2, 'k'); }
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
  // piece has weight where tones of one hue would lie flat.
  const cool = (c, t) => mixHex(c, '#2b2a5c', t === undefined ? 0.22 : t), warm = (c, t) => mixHex(c, '#ffe9b0', t === undefined ? 0.24 : t);
  let V = M, leather = 1, wood = 1, dye = null;
  if (seed) {
    const rc = artRng(seed), mf = 0.94 + rc() * 0.12, turn = [-26, 0, 0, 22][Math.floor(rc() * 4)];
    leather = 0.84 + rc() * 0.3; wood = 0.84 + rc() * 0.3;
    dye = [null, ['#2f6db8', '#7fb0e8'], ['#4f8a3a', '#8fc35a'], ['#d8a030', '#f8dc88']][Math.floor(rc() * 4)];
    V = { m: tone(M.m, mf), d: tone(M.d, mf), l: tone(M.l, mf), t: r < 6 ? hueTurn(M.t, turn) : M.t };
  }
  if (relic) dye = null;
  const C = {
    m: V.m, d: cool(V.d), D: cool(tone(V.d, 0.74), 0.34), l: warm(V.l), h: top ? '#ffffff' : warm(tone(V.l, 1.14), 0.34), t: V.t, T: cool(tone(V.t, 0.68)),
    w: tone('#7a5a2a', wood), W: cool(tone('#5e4222', wood)), c: tone('#8a5a34', leather), e: warm(tone('#a87244', leather), 0.2), C: cool(tone('#5e3a22', leather)),
    g: '#e8b545', G: warm('#fbe08a', 0.3), y: cool('#a87a26', 0.18),
    j: r === 6 ? '#b77be8' : '#d8402e', J: r === 6 ? '#f0e0ff' : '#ff9a8a', n: '#d8c8a0', N: cool('#a89870', 0.16),
    r: dye ? dye[0] : '#c23b2e', R: dye ? dye[1] : warm('#ef7a66', 0.16), s: '#d9a57c', S: cool('#a87450', 0.14), f: '#c8913c', F: cool('#8a6226'), q: '#8fc35a', k: ink,
    o: '#fff6d8', O: mixHex(cool(M.d), ink, 0.4),
    x: r <= 1 ? '#a0522d' : V.m, p: r === 0 ? '#3a1c10' : V.m, v: r >= 3 ? cool(V.d) : V.m,
  };
  // The outline is ink underneath and on the right, but on the lit side it is only the piece's own colour gone
  // dark; and the whole casts a shadow one pixel down and across.
  const rim = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (at(x, y)) { rim.push([x, y, C[at(x, y)] || V.m]); continue; }
    const lit = at(x + 1, y) || at(x, y + 1), dark = at(x - 1, y) || at(x, y - 1);
    if (lit || dark) rim.push([x, y, dark ? ink : mixHex(C[lit] || V.m, ink, 0.6)]);
  }
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  for (const [x, y] of rim) ctx.fillRect(x + 1, y + 1, 1, 1);
  for (const [x, y, c] of rim) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
}

// Paints a <canvas data-item="slot:rarity:style:fitting:master:relic:number">: a dark plate framed in the grade's colour,
// 36 units square with the picture in the middle 32. Canvases are sized in whole multiples of 36.
function paintItem(cv) {
  const [slot, r0, cls, fit, mw, relic, seed] = cv.dataset.item.split(':'), r = +r0, ctx = cv.getContext('2d'), U = ITEM_N + 4, s = cv.width / U;
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  ctx.setTransform(s, 0, 0, s, 0, 0); ctx.imageSmoothingEnabled = false;
  const fc = relic ? '#d8a657' : RARITY_COL[r], e = U - 1;
  R(0, 0, U, U, fc); R(1, 1, U - 2, U - 2, '#17110f'); R(2, 2, U - 4, U - 4, relic ? '#33261a' : '#2c211c');
  R(2, 2, U - 4, 14, 'rgba(255,255,255,.05)');
  if (r >= 3 || relic) {                         // a glow behind the better pieces, in the colour of their grade
    const n = parseInt(fc.slice(1), 16), rgb = `${n >> 16},${(n >> 8) & 255},${n & 255}`;
    const peak = 0.22 + (relic ? 2 : r - 3) * 0.06;                                         // round, and fading out to nothing at the frame
    for (let y = 2; y < U - 2; y++) for (let x = 2; x < U - 2; x++) { const d = Math.hypot(x + 0.5 - U / 2, y + 0.5 - U / 2) / 16.5; if (d < 1) R(x, y, 1, 1, `rgba(${rgb},${(peak * Math.pow(1 - d, 1.4)).toFixed(3)})`); }
  }
  if (r >= 5 || relic) {                         // the best have their corners picked out
    for (const [x, y] of [[0, 0], [e, 0], [0, e], [e, e]]) R(x, y, 1, 1, '#fff6d8');
    const c = shade(fc, 1.3); R(1, 0, 5, 1, c); R(0, 1, 1, 5, c); R(e - 5, e, 5, 1, c); R(e, e - 5, 1, 5, c);
  }
  if (relic) { R(1, 1, U - 2, 1, '#7a5a2a'); R(1, e - 1, U - 2, 1, '#7a5a2a'); R(1, 1, 1, U - 2, '#7a5a2a'); R(e - 1, 1, 1, U - 2, '#7a5a2a'); for (const [x, y] of [[1, 1], [e - 1, 1], [1, e - 1], [e - 1, e - 1]]) R(x, y, 1, 1, '#fbe08a'); }      // an old frame inside the new
  if (r === 0 && !relic) R(2, 25, U - 4, 9, 'rgba(160,82,45,.10)');                          // and the worst sit in their own rust
  ctx.translate(2, 2);
  drawItemArt(ctx, slot, r, cls, { fit, mw: mw === '1', relic, seed: +seed || 0 });
  ctx.translate(-2, -2);
  if (r === 6 && !relic) { R(4, 4, 1, 1, '#ffffff'); R(31, 7, 1, 1, '#ffffff'); R(30, 31, 1, 1, '#fbe08a'); R(5, 29, 1, 1, '#fbe08a'); }      // an imperial piece glints
  if (mw === '1') { R(28, 4, 5, 1, '#fff6d8'); R(30, 2, 1, 5, '#fff6d8'); R(1, 31, 4, 4, '#17110f'); R(2, 31, 1, 4, '#fbe08a'); R(1, 32, 4, 1, '#fbe08a'); R(4, 34, 1, 1, '#fbe08a'); }      // a glint, and the maker's mark in the corner
}
// size: 36, 72 or 108 (one, two or three screen pixels to each of the picture's).
// A relic or an imperial piece is never quite still: its frame breathes light, each in its own time.
function itemArt(it, size) { const lit = it.relic || it.r === 6; return `<canvas class="itemart${lit ? (it.relic ? ' shim relic' : ' shim') : ''}"${lit ? ` style="animation-delay:-${((it.id || 0) * 617) % 3600}ms"` : ''} width="${size}" height="${size}" data-item="${it.slot}:${it.r}:${it.cls || ''}:${it.fit || ''}:${it.mw ? 1 : ''}:${it.relic || ''}:${it.id || 0}"></canvas>`; }
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
    cv.width = cv.height = ITEM_N;
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, ITEM_N, ITEM_N);
    drawItemArt(ctx, slot, 4, 'murmillo');
    rules.push(`.ic-slot-${slot}{background-image:url(${cv.toDataURL()});width:32px;height:32px}`);
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
