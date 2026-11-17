'use strict';
// The ludus yard: a living picture of your school on the Ludus tab.
// Buildings grow with their facility levels, the forge with the smith, the outer wall and gate with
// your fame. Staff appear when hired, and your fighters do whatever you have set them to.
// Drawn on a 590x190 grid at 2 canvas pixels per unit, using the arena's fighter sprites.

const YARD = { W: 590, H: 190, S: 2, GY: 128 };
let yardRaf = 0, yardLast = 0;
let yardHits = [];          // click targets: { x0, x1, y0, y1, fighter | tab }

function yardPerson(ctx, X, Y, d, o) {
  const P = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(d > 0 ? X + x : X - x - w, Y + y, w, h); };
  const skin = o.skin || '#d9a57c', skinD = shade(skin, 0.76), tunicD = shade(o.tunic, 0.72), wood = '#7a5a2a';
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(X - 7, Y - 2, 14, 3);
  P(-3, -12, 3, 12, skinD); P(0, -12, 3, 12, skin); P(-3, -2, 4, 2, '#6b4526'); P(0, -2, 5, 2, '#6b4526');
  P(-4, -27, 8, 17, o.tunic); P(-4, -27, 2, 17, tunicD); P(-4, -18, 8, 1, '#6b4526');
  if (o.apron) { P(-1, -26, 5, 15, o.apron); P(-1, -26, 1, 15, shade(o.apron, 0.8)); }
  P(-1, -28, 3, 1, skinD);
  P(-3, -35, 6, 7, skin); P(-3, -36, 6, 2, o.hair || '#3a2a1c'); P(-3, -34, 1, 3, o.hair || '#3a2a1c'); P(1, -33, 1, 1, '#1c1310');
  if (o.item === 'hammer') {          // o.swing 0..1: raised to struck
    const up = o.swing < 0.5;
    const hx = up ? 3 : 8, hy = up ? -36 : -21;
    for (let i = 0; i <= 4; i++) P(Math.round(1 + (hx - 1) * i / 4), Math.round(-26 + (hy + 26) * i / 4), 2, 2, skin);
    P(hx, hy - 4, 1, 5, wood); P(hx - 2, hy - 6, 5, 3, '#8d9094'); P(hx - 2, hy - 6, 5, 1, '#c1c7cc');
  } else {
    P(2, -26, 2, 8, skin); P(2, -19, 3, 2, skinD);
    if (o.item === 'staff') { P(5, -38, 1, 38, wood); P(5, -38, 1, 3, '#a8452e'); }
    if (o.item === 'ladle') { P(4, -20, 7, 1, wood); P(10, -20, 2, 2, '#8d9094'); }
    if (o.item === 'bag') { P(-6, -24, 3, 8, '#f2ecd8'); P(-6, -24, 3, 1, '#c9c0aa'); }
    if (o.item === 'scroll') { P(4, -21, 4, 2, '#f2ecd8'); }
  }
}

function drawYard(cv, T) {
  const ctx = cv.getContext('2d'), GY = YARD.GY, F = G.fac, t = tier();
  ctx.setTransform(YARD.S, 0, 0, YARD.S, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const label = (x, y, text) => {
    ctx.font = 'bold 6px Consolas, monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(text, x + 0.5, y + 0.5);
    ctx.fillStyle = '#f2e6cc'; ctx.fillText(text, x, y);
  };
  const pips = (n, max) => '●'.repeat(n) + '○'.repeat(max - n);
  const smoke = (x, y, n, col) => {            // puffs drifting up and to the right
    for (let i = 0; i < n; i++) {
      const p = (T * 0.25 + i / n) % 1;
      ctx.globalAlpha = 0.55 * (1 - p);
      R(x + p * 10 + Math.sin(p * 6 + i) * 2, y - p * 34, 3 + Math.round(p * 4), 3 + Math.round(p * 3), col);
    }
    ctx.globalAlpha = 1;
  };
  yardHits = [];
  const hit = (x0, y0, x1, y1, o) => yardHits.push(Object.assign({ x0, y0, x1, y1 }, o));

  // ---- sky, hills, sun ----
  R(0, 0, 590, 70, '#8fbcd4'); R(0, 42, 590, 30, '#a9cfdc'); R(0, 60, 590, 14, '#c5dfe0');
  R(498, 12, 14, 14, '#fbeab0'); R(495, 15, 20, 8, '#fbeab0'); R(501, 9, 8, 20, '#fbeab0');
  for (let i = 0; i < 3; i++) { const cx = (T * (3 + i) + i * 210) % 680 - 60, cy = 14 + i * 9; R(cx, cy, 34, 5, '#eef6f8'); R(cx + 6, cy - 3, 20, 4, '#eef6f8'); }
  for (let x = -20; x < 590; x += 46) { const h = 14 + ((x * 7) % 11); R(x, 74 - h, 60, h, '#7fa27a'); R(x + 8, 70 - h, 40, 5, '#8fb287'); }

  // ---- outer wall: grows grander with fame ----
  const W = [{ c: '#7a5a34', d: '#5e4426', l: '#94703f' }, { c: '#a88f66', d: '#8f7650', l: '#c4ab7c' }, { c: '#b89b6e', d: '#a3875c', l: '#d8c08e' }, { c: '#d6ccb8', d: '#b5aa94', l: '#f0e8d6' }][t];
  R(0, 74, 590, GY - 74, W.c); R(0, 74, 590, 2, W.l);
  if (t === 0) { for (let x = 0; x < 590; x += 8) { R(x, 74, 1, GY - 74, W.d); R(x + 2, 70, 5, 4, W.c); R(x + 3, 68, 3, 2, W.l); } R(0, 98, 590, 2, W.d); }
  else {
    for (let r = 0; r < 9; r++) { const y = 76 + r * 6; R(0, y + 5, 590, 1, W.d); for (let x = (r % 2) * 9; x < 590; x += 18) R(x, y, 1, 5, W.d); }
    if (t >= 2) for (let x = 0; x < 590; x += 14) R(x, 69, 8, 5, W.c);
  }

  // ---- generic building pieces ----
  const walls = (x, w, h, c) => {
    const y = GY - h, d = shade(c, 0.78);
    R(x, y, w, h, c); R(x, y, 2, h, d); R(x + w - 2, y, 2, h, d);
    for (let yy = y + 7; yy < GY - 2; yy += 7) R(x + 2, yy, w - 4, 1, shade(c, 0.9));
    R(x, GY - 3, w, 3, d);
    return y;
  };
  const roof = (x, y, w, kind) => {
    if (kind === 'thatch') { R(x - 3, y - 6, w + 6, 7, '#9a7a42'); R(x - 1, y - 9, w + 2, 3, '#b8964e'); for (let xx = x - 2; xx < x + w + 3; xx += 5) R(xx, y - 6, 1, 7, '#7a5e30'); }
    else if (kind === 'tile') { R(x - 4, y - 5, w + 8, 6, '#a8452e'); R(x - 1, y - 9, w + 2, 4, '#b8553a'); R(x + 5, y - 12, w - 10, 3, '#c9684a'); for (let xx = x - 3; xx < x + w + 4; xx += 4) R(xx, y - 5, 1, 6, '#7e3220'); }
    else { R(x - 2, y - 3, w + 4, 4, '#8a6a4a'); R(x - 2, y - 3, w + 4, 1, '#a8855e'); }
  };
  const door = (x, w, h) => { R(x - 1, GY - h - 1, w + 2, h + 1, '#5a4334'); R(x, GY - h, w, h, '#241812'); R(x, GY - h, 1, h, '#3a2a1c'); };
  const win = (x, y) => { R(x - 1, y - 1, 8, 9, '#5a4334'); R(x, y, 6, 7, '#241812'); R(x + 3, y, 1, 7, '#5a4334'); };
  const column = (x, y, h) => { R(x, y, 5, h, '#f0e8d6'); R(x, y, 1, h, '#c9c0aa'); R(x - 1, y, 7, 2, '#f0e8d6'); R(x - 1, y + h - 2, 7, 2, '#d6ccb8'); };

  // ---- barracks: more cells, then a second floor, then tiles and a colonnade ----
  {
    const lv = F.barracks, x = 8, w = [96, 128, 128, 150][lv], h = [52, 52, 86, 92][lv];
    const y = walls(x, w, h, lv >= 2 ? '#d2bf98' : '#bba06e');
    roof(x, y, w, lv >= 2 ? 'tile' : 'thatch');
    const n = [3, 5, 4, 5][lv];
    for (let i = 0; i < n; i++) door(x + 10 + i * ((w - 30) / Math.max(1, n - 1)), 11, 30);
    if (lv >= 2) { R(x, GY - 46, w, 2, '#a8905e'); for (let i = 0; i < n; i++) win(x + 12 + i * ((w - 30) / Math.max(1, n - 1)), GY - 74); }
    if (lv >= 3) { for (let xx = x - 2; xx <= x + w - 3; xx += 24) column(xx, GY - 46, 46); R(x - 3, GY - 49, w + 6, 4, '#f0e8d6'); }
    label(x + w / 2, y - 14, 'BARRACKS ' + pips(lv, 3));
    hit(x, y - 12, x + w, GY, { tab: 'facilities' });
  }
  // ---- infirmary: a cot under an awning, then a hut, then stone, then columns ----
  {
    const lv = F.infirmary, x = 172, w = [36, 44, 52, 58][lv], h = [38, 48, 58, 66][lv];
    let y;
    if (lv === 0) {
      y = GY - h; R(x, y, 2, h, '#7a5a2a'); R(x + w - 2, y, 2, h, '#7a5a2a'); R(x - 3, y, w + 6, 5, '#e8d7b0'); R(x - 3, y + 4, w + 6, 1, '#b8a888');
      for (let xx = x; xx < x + w; xx += 8) R(xx, y, 4, 5, '#b8452e');
      R(x + 8, GY - 9, 20, 3, '#f2ecd8'); R(x + 8, GY - 6, 2, 6, '#7a5a2a'); R(x + 26, GY - 6, 2, 6, '#7a5a2a'); R(x + 8, GY - 11, 5, 2, '#e8d7b0');
    } else {
      y = walls(x, w, h, lv >= 2 ? '#ddd3bd' : '#c9b58a'); roof(x, y, w, lv >= 2 ? 'tile' : 'thatch');
      door(x + w / 2 - 6, 12, 30); win(x + 6, GY - 30); if (lv >= 2) win(x + w - 12, GY - 30);
      if (lv >= 3) { column(x - 3, GY - 40, 40); column(x + w - 2, GY - 40, 40); R(x - 4, GY - 43, w + 8, 4, '#f0e8d6'); }
      R(x + w / 2 - 5, y + 6, 10, 10, '#f2ecd8'); R(x + w / 2 - 1, y + 7, 1, 8, '#3f8a3a'); R(x + w / 2 - 2, y + 9, 3, 1, '#3f8a3a'); R(x + w / 2 - 1, y + 12, 3, 1, '#3f8a3a');
    }
    label(x + w / 2, y - (lv ? 14 : 4), 'INFIRMARY ' + pips(lv, 3));
    hit(x, y - 12, x + w, GY, { tab: 'facilities' });
  }
  // ---- baths: a trough, then a bathhouse, then a dome, then a grand dome with columns ----
  {
    const lv = F.baths, x = 244, w = [28, 46, 58, 70][lv], h = [10, 44, 52, 60][lv];
    let y = GY - h;
    if (lv === 0) { R(x, y, w, h, '#7a5a34'); R(x + 2, y + 2, w - 4, 4, '#5aa0d0'); R(x + 3, y + 2, 6, 1, '#bfe0f0'); R(x, y, w, 2, '#94703f'); }
    else {
      y = walls(x, w, h, '#e0d6c0'); R(x - 2, y - 3, w + 4, 4, '#f0e8d6');
      if (lv >= 2) { const dw = w - 20; for (let i = 0; i < 6; i++) R(x + 10 + i * 2, y - 5 - i * 3, dw - i * 4, 3, i % 2 ? '#c7d3d6' : '#b3c3c8'); }
      door(x + w / 2 - 6, 12, 30); R(x + 6, GY - 26, 8, 2, '#5aa0d0'); R(x + w - 14, GY - 26, 8, 2, '#5aa0d0');
      if (lv >= 3) { column(x - 3, GY - 40, 40); column(x + w - 2, GY - 40, 40); column(x + 12, GY - 40, 40); column(x + w - 17, GY - 40, 40); }
      smoke(x + w / 2, y - (lv >= 2 ? 22 : 4), 3 + lv, '#f4f8f8');
    }
    label(x + w / 2, y - (lv >= 2 ? 30 : lv ? 10 : 4), 'BATHS ' + pips(lv, 3));
    hit(x, y - 12, x + w, GY, { tab: 'facilities' });
  }
  // ---- kitchen: what is over the fire depends on the rations ----
  {
    const x = 328, r = G.ration;
    R(x, GY - 6, 26, 6, '#6a6058'); R(x + 2, GY - 8, 22, 3, '#7c7268');
    const fl = Math.sin(T * 9) > 0 ? 1 : 0;
    R(x + 8, GY - 12 - fl, 10, 5 + fl, '#e2702a'); R(x + 10, GY - 14 - fl, 6, 4, '#f5c04a'); R(x + 12, GY - 16, 2, 3, '#fff0b0');
    R(x + 3, GY - 30, 2, 24, '#5a4334'); R(x + 21, GY - 30, 2, 24, '#5a4334'); R(x + 3, GY - 30, 20, 2, '#5a4334');
    if (r === 2) { R(x + 6, GY - 26, 14, 6, '#8a4a2a'); R(x + 6, GY - 26, 14, 2, '#b06a3a'); R(x + 4, GY - 24, 18, 1, '#3a2a1c'); }
    else { R(x + 8, GY - 27, 10, 8, '#2e2a28'); R(x + 7, GY - 28, 12, 2, '#4a4440'); if (r === 1) R(x + 9, GY - 28, 8, 1, '#c9a763'); }
    if (r >= 1) { R(x + 30, GY - 14, 14, 2, '#7a5a2a'); R(x + 31, GY - 12, 2, 12, '#7a5a2a'); R(x + 41, GY - 12, 2, 12, '#7a5a2a'); R(x + 32, GY - 18, 5, 4, '#d9b877'); R(x + 38, GY - 17, 4, 3, '#d9b877'); }
    if (r === 2) { R(x - 8, GY - 16, 6, 16, '#b0603a'); R(x - 7, GY - 20, 4, 4, '#b0603a'); R(x - 8, GY - 16, 1, 16, '#8a4428'); }
    smoke(x + 13, GY - 32, 4, '#d8d8d8');
    label(x + 14, GY - 40, RATIONS[r].name.toUpperCase());
    hit(x - 8, GY - 46, x + 46, GY, { tab: 'facilities' });
    if (G.staff.cook) yardPerson(ctx, x - 12 + Math.round(Math.sin(T * 0.8) * 2), GY + 6, 1, { tunic: '#b9b09a', apron: '#f2ecd8', hair: '#5a3a22', item: 'ladle' });
  }
  // ---- forge: an anvil under a lean-to grows into an armourer's workshop ----
  {
    const lv = G.smith ? G.smith.level : 0, x = 392, w = [38, 46, 54, 60, 72][lv], h = [38, 46, 54, 60, 66][lv];
    let y = GY - h;
    if (lv === 0) { R(x, y, 2, h, '#5a4334'); R(x + w - 2, y + 8, 2, h - 8, '#5a4334'); for (let i = 0; i < 6; i++) R(x - 3, y + i, w + 6 - i, 1, i % 2 ? '#8a6a3a' : '#9a7a42'); }
    else {
      y = walls(x, w, h, lv >= 2 ? '#8a5a48' : '#9a8468'); roof(x, y, w, lv >= 3 ? 'tile' : 'flat');
      R(x + w - 14, y - 22, 9, 22, '#6a4a3c'); R(x + w - 15, y - 24, 11, 3, '#4a3428'); smoke(x + w - 10, y - 26, 3 + lv, '#6a6a6a');
      if (lv >= 4) { R(x + 6, y - 16, 8, 16, '#6a4a3c'); R(x + 5, y - 18, 10, 3, '#4a3428'); smoke(x + 9, y - 20, 4, '#6a6a6a'); }
      R(x + 5, GY - 34, w - 22, 34, '#1c130f');                                         // the open front
      for (let i = 0; i < Math.min(4, lv); i++) R(x + w - 9, GY - 40 + i * 8, 5, 6, ['#c1c7cc', '#e8b545', '#b77be8', '#f0705e'][i]);   // finished pieces on the wall
    }
    const glow = 0.6 + Math.sin(T * 5) * 0.2;
    R(x + 7, GY - 14, 12, 14, '#4a3a34'); R(x + 9, GY - 18, 8, 6, '#e2702a'); ctx.globalAlpha = glow; R(x + 10, GY - 20, 6, 5, '#f5c04a'); ctx.globalAlpha = 1;
    R(x + 24, GY - 9, 10, 3, '#55565c'); R(x + 26, GY - 6, 6, 6, '#3c3d42'); R(x + 22, GY - 10, 14, 2, '#6c6d74');   // anvil
    const sw = (T * 1.1) % 1;
    yardPerson(ctx, x + 16, GY + 3, 1, { tunic: '#6b5a48', apron: '#4a3323', hair: '#1e1612', skin: '#c9966c', item: 'hammer', swing: sw });
    if (sw > 0.5 && sw < 0.62) { R(x + 27, GY - 14, 1, 1, '#fff0b0'); R(x + 31, GY - 16, 1, 1, '#f5c04a'); R(x + 24, GY - 17, 1, 1, '#f5c04a'); R(x + 33, GY - 12, 1, 1, '#fff0b0'); }
    label(x + w / 2, y - (lv ? (lv >= 3 ? 30 : 28) : 4), 'FORGE ' + pips(lv, 4));
    hit(x, y - 12, x + w, GY + 4, { tab: 'smith' });
  }
  // ---- gate: banners multiply with fame ----
  {
    const x = 506;
    R(x, GY - 62, 62, 62, W.l); R(x, GY - 62, 2, 62, W.d); R(x + 60, GY - 62, 2, 62, W.d); R(x - 2, GY - 66, 66, 5, W.c); R(x - 2, GY - 66, 66, 1, W.l);
    R(x + 14, GY - 44, 34, 44, '#3a2a1c'); R(x + 16, GY - 42, 30, 42, '#5a4030'); R(x + 30, GY - 42, 2, 42, '#3a2a1c');
    for (let yy = GY - 36; yy < GY; yy += 10) R(x + 16, yy, 30, 1, '#3a2a1c');
    R(x + 12, GY - 48, 38, 4, W.d);
    const banner = (bx) => { R(bx, GY - 60, 8, 12, '#c23b2e'); R(bx, GY - 60, 2, 12, '#7e241c'); R(bx, GY - 48, 3, 3, '#c23b2e'); R(bx + 5, GY - 48, 3, 3, '#c23b2e'); R(bx + 3, GY - 57, 2, 4, '#e8b545'); };
    banner(x + 3); banner(x + 51);
    if (t >= 2) { R(x + 27, GY - 78, 2, 14, '#5a4334'); R(x + 29, GY - 78, 12 + Math.round(Math.sin(T * 3)), 7, '#c23b2e'); }
    if (t >= 3) { R(x + 26, GY - 61, 10, 9, '#e8b545'); R(x + 28, GY - 59, 6, 5, '#f8dc88'); }
    label(x + 31, GY - 84 + (t >= 2 ? 0 : 12), TIERS[t].name.toUpperCase());
    hit(x, GY - 70, x + 62, GY, { tab: 'arena' });
    if (G.staff.scout) yardPerson(ctx, x - 8, GY + 8, -1, { tunic: '#4a6a3a', hair: '#2a1c14', item: 'scroll' });
  }

  // ---- the yard ----
  R(0, GY, 590, YARD.H - GY, '#d9b877'); R(0, GY, 590, 3, 'rgba(60,35,10,.3)'); R(0, GY + 3, 590, 3, 'rgba(60,35,10,.12)');
  for (let i = 0; i < 90; i++) { const sx = (i * 97) % 588, sy = GY + 6 + (i * 53) % (YARD.H - GY - 8); R(sx, sy, 1 + (i % 3), 1, i % 2 ? '#c9a763' : '#e6c98a'); }
  const gl = F.ground;
  if (gl >= 2) { for (let i = 0; i < 44; i++) { const a = i / 44 * Math.PI * 2; R(300 + Math.cos(a) * 130, 160 + Math.sin(a) * 20, 3, 1, '#f0dca8'); } }
  const posts = [[214, 150], [274, 152], [334, 150], [394, 153]].slice(0, gl + 1);
  const drawPost = ([px, py]) => { ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(px - 5, py - 1, 10, 2); R(px - 2, py - 34, 4, 34, '#7a5a2a'); R(px - 2, py - 34, 1, 34, '#5e4426'); R(px - 6, py - 26, 12, 2, '#7a5a2a'); R(px - 2, py - 36, 4, 2, '#94703f'); if (gl >= 2) { R(px - 3, py - 20, 6, 8, '#a8452e'); R(px - 2, py - 18, 4, 4, '#e8b545'); } };
  if (gl >= 1) { R(452, 148, 2, 22, '#5e4426'); R(470, 148, 2, 22, '#5e4426'); R(450, 152, 24, 2, '#7a5a2a'); for (let i = 0; i < 4; i++) R(455 + i * 5, 136, 1, 18, i % 2 ? '#c1c7cc' : '#7a5a2a'); }
  if (gl >= 3) { R(476, GY - 6, 14, 6, '#c9c0aa'); R(479, GY - 30, 8, 24, '#d6ccb8'); R(480, GY - 37, 6, 7, '#d6ccb8'); R(479, GY - 30, 2, 24, '#b5aa94'); R(488, GY - 40, 1, 34, '#b5aa94'); R(480, GY - 39, 6, 2, '#a8452e'); }
  label(300, YARD.H - 4, 'TRAINING GROUND ' + pips(gl, 3));
  hit(190, GY + 8, 420, YARD.H, { tab: 'facilities', low: true });

  // ---- who is where ----
  const names = [];
  const things = posts.map(p => ({ y: p[1], draw: () => drawPost(p) }));
  const place = (g, x, y, o) => {
    things.push({ y, draw: () => {
      drawSprite(ctx, Object.assign({ x, y, facing: 1, g, team: 0, moving: false, walk: 0, clock: T + g.id, atkAnim: 0, flash: 0, down: false, snare: 0, slash: 0 }, o));
      if (g.id === ui.sel) { R(x - 2, y - 52, 5, 2, '#e8b545'); R(x - 1, y - 50, 3, 1, '#e8b545'); R(x, y - 49, 1, 1, '#e8b545'); }
      // a name is skipped when it would sit on top of one already drawn; the selected fighter always gets his
      const half = g.name.length * 1.9 + 2, clash = names.some(n => Math.abs(n.x - x) < n.half + half && Math.abs(n.y - y) < 8);
      if (g.id === ui.sel || !clash) { label(x, y + 9, g.name); names.push({ x, y, half }); }
    } });
    hit(x - 10, y - 46, x + 10, y + 10, { fighter: g.id });
  };
  const strike = (off, every) => { const p = ((T + off) / every) % 1; return { windup: p < 0.18, atkAnim: p >= 0.18 && p < 0.5 ? 1 - (p - 0.18) / 0.32 : 0, slash: p >= 0.18 && p < 0.24 ? 0.1 : 0 }; };
  const by = k => G.roster.filter(g => (g.injury > 0 ? 'hurt' : g.activity) === k);
  by('hurt').forEach((g, i) => place(g, 186 + i * 20, 141 + (i % 2) * 5, { falling: true, down: true }));
  by('rest').forEach((g, i) => place(g, 24 + i * 22, 140 + (i % 2) * 7, {}));
  by('str').concat(by('skl')).forEach((g, i) => {
    const p = posts[i % posts.length], right = Math.floor(i / posts.length) % 2;
    place(g, p[0] + (right ? 13 : -13), p[1] + 1, Object.assign({ facing: right ? -1 : 1 }, strike(g.id * 0.37, g.activity === 'str' ? 1.5 : 1.0)));
  });
  by('agi').forEach((g, i) => {
    const p = ((T * 0.11 + i * 0.31 + g.id * 0.13) % 1) * 2, f = p < 1 ? p : 2 - p;
    place(g, 150 + f * 300, 176 + (i % 2) * 6, { facing: p < 1 ? 1 : -1, moving: true, walk: T * 9 + g.id });
  });
  by('end').forEach((g, i) => place(g, 444 + (i % 3) * 22 - Math.floor(i / 3) * 10, 168 + Math.floor(i / 3) * 10, { cheer: Math.sin(T * 2.2 + g.id) > 0 ? T + g.id : 0 }));
  const sp = by('spar');
  sp.forEach((g, i) => {
    const pair = Math.floor(i / 2), left = i % 2 === 0, cx = 250 + pair * 84, alone = left && i === sp.length - 1;
    place(g, cx + (left ? -12 : 12), 170 + (pair % 2) * 6, Object.assign({ facing: left ? 1 : -1 }, alone ? strike(g.id, 1.4) : strike(pair * 0.5 + (left ? 0 : 0.6), 1.2)));
  });
  if (G.staff.doctore) things.push({ y: 149, draw: () => { const dx = Math.sin(T * 0.35) * 30; yardPerson(ctx, 152 + dx, 149, Math.cos(T * 0.35) >= 0 ? 1 : -1, { tunic: '#8a3a2a', hair: '#c9c2b2', item: 'staff' }); } });
  if (G.staff.medicus) things.push({ y: GY + 4, draw: () => yardPerson(ctx, 168, GY + 5, 1, { tunic: '#f2ecd8', hair: '#3a2a1c', item: 'bag' }) });
  // the selected fighter is drawn first among equals so his name claims its place
  things.sort((a, b) => a.y - b.y).forEach(o => o.draw());
}

function yardFrame(ts) {
  const cv = document.getElementById('yard');
  if (!cv || !G) { yardRaf = 0; return; }
  if (ts - yardLast > 30) { yardLast = ts; try { drawYard(cv, ts / 1000); } catch (e) { console.error(e); yardRaf = 0; return; } }
  yardRaf = requestAnimationFrame(yardFrame);
}
// Draw once at once, then keep it moving while the canvas is on the page.
function startYard() {
  const cv = document.getElementById('yard');
  if (!cv) return;
  drawYard(cv, performance.now() / 1000);
  if (!yardRaf) yardRaf = requestAnimationFrame(yardFrame);
}
// What was clicked: a fighter (nearest the front wins) or a building.
function yardPick(cv, e) {
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * YARD.W, y = (e.clientY - r.top) / r.height * YARD.H;
  const hits = yardHits.filter(h => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1);
  return hits.filter(h => h.fighter).sort((a, b) => b.y1 - a.y1)[0] || hits.filter(h => !h.low)[0] || hits[0] || null;
}
