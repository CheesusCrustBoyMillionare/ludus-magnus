'use strict';
// The life of the arena around the fight: spectators who stand, wave, throw things and vote on a
// fallen man; the editor of the games in his box, who gives the verdict; banners in the wind; dust,
// heat haze, and blood that soaks into the sand. Everything here is for show. It reads the battle
// and never changes it, and it keeps its own state on B.show, stepped from the drawing code.
// Coordinates are sprite pixels (428x240), the same as the backdrop.

const SHOW_PETALS = ['#e06a8a', '#f2ecd8', '#e8b545', '#d94a3a', '#f0c0d0'];
const SHOW_SCRAPS = ['#6f9a3a', '#8ab04a', '#c9a763', '#7a5a2a'];

function showInit(B) {
  const S = B.show = { t: B.clock, exc: B.exc, thrown: [], litter: [], puffs: [], motes: [], bored: 0, nextThrow: 0, steps: {}, fell: {} };
  B.crowd.forEach((p, i) => { p.h = (i * 0.61803) % 1; p.stand = 0; p.fan = i % 9 === 0 ? i % 2 : -1; });
  for (let i = 0; i < 26; i++) S.motes.push({ x: rand(0, 428), y: rand(92, 236), sp: rand(5, 14), ph: rand(0, 6.28) });
  return S;
}

// Something leaves a spectator's hand and lands on the sand, where it stays.
function showThrow(B, tx, ty, cols, from) {
  const S = B.show, front = B.crowd.filter(p => p.y >= 40 && Math.abs(p.x - tx) < 150);
  const p = from || (front.length ? pick(front) : null);
  if (!p) return;
  p.stand = Math.max(p.stand, 0.7);
  S.thrown.push({ x0: p.x + 2, y0: p.y - 9, x1: clamp(tx, 6, 420), y1: clamp(ty, 92, 232), t: 0, dur: rand(0.7, 1.15), col: pick(cols), arc: rand(26, 44) });
}

// Which fallen man is being judged right now, and how far the judgment has come (0 to 1).
function showVerdict(B) {
  if (!B.over || B.hunt) return null;
  const f = B.fighters.filter(x => x.revealAt).sort((a, b) => a.revealAt - b.revealAt).find(x => B.outro < x.revealAt + 0.75);
  if (!f) return null;
  return { f, k: clamp((B.outro - (f.revealAt - 0.9)) / 0.9, 0, 1), done: B.outro >= f.revealAt, begun: B.outro >= f.revealAt - 0.9 };
}

function showStep(B, T) {
  const S = B.show, dt = clamp(T - S.t, 0, 0.1);
  S.t = T;
  const fighting = !B.over && B.intro <= 0;
  // a telling blow brings people to their feet, and a great one brings flowers down
  const jump = B.exc - S.exc; S.exc = B.exc;
  if (jump > 0.02) {
    for (const p of B.crowd) if (Math.random() < jump * 4) p.stand = Math.max(p.stand, rand(0.5, 1.5));
    if (jump > 0.07) {
      const live = B.fighters.filter(f => !out(f)), f = live.length ? pick(live) : B.fighters[0];
      for (let i = 0; i < Math.min(6, Math.round(jump * 30)); i++) showThrow(B, f.x * 2 + rand(-40, 40), Math.max(94, f.y * 2 + rand(-30, 6)), SHOW_PETALS);
    }
  }
  // a dull fight brings cabbage stalks instead
  S.bored = fighting && B.exc < 0.05 ? S.bored + dt : 0;
  if (S.bored > 7 && T > S.nextThrow) {
    S.nextThrow = T + rand(0.8, 2.2);
    const live = B.fighters.filter(f => !out(f));
    if (live.length) { const f = pick(live); showThrow(B, f.x * 2 + rand(-18, 18), f.y * 2 + rand(-8, 8), SHOW_SCRAPS); }
  }
  // when it is settled the victors stand in a rain of petals and coins
  if (B.over && B.outro > 0.2 && B.outro < B.outroEnd && T > S.nextThrow) {
    S.nextThrow = T + 0.07;
    const win = B.fighters.filter(f => f.team === B.winner && !out(f));
    if (win.length) { const f = pick(win); showThrow(B, f.x * 2 + rand(-34, 34), f.y * 2 + rand(-22, 12), SHOW_PETALS); }
  }
  for (const p of B.crowd) p.stand = Math.max(0, p.stand - dt);
  for (const o of S.thrown) {
    o.t += dt / o.dur;
    if (o.t >= 1) { o.dead = true; S.litter.push({ x: Math.round(o.x1), y: Math.round(o.y1), col: o.col }); }
  }
  S.thrown = S.thrown.filter(o => !o.dead);
  if (S.litter.length > 160) S.litter.splice(0, S.litter.length - 160);
  // dust: kicked up by moving feet, thrown up where a man falls
  B.fighters.forEach((f, i) => {
    if (out(f)) { if (f.down && !S.fell[i]) { S.fell[i] = 1; for (let k = 0; k < 9; k++) S.puffs.push({ x: f.x * 2 + rand(-12, 12), y: f.y * 2 + rand(-2, 3), vx: rand(-9, 9), life: rand(0.6, 1.1), max: 1.1, r: rint(2, 4) }); } return; }
    if (!f.moving && f.state !== 'windup') return;
    S.steps[i] = (S.steps[i] || 0) + dt;
    if (S.steps[i] > 0.24) { S.steps[i] = 0; S.puffs.push({ x: f.x * 2 - f.facing * 3 + rand(-2, 2), y: f.y * 2 + rand(-1, 1), vx: -f.facing * rand(2, 7), life: 0.55, max: 0.55, r: 2 }); }
  });
  for (const p of S.puffs) { p.life -= dt; p.x += p.vx * dt; }
  S.puffs = S.puffs.filter(p => p.life > 0);
  for (const m of S.motes) { m.x += m.sp * dt; if (m.x > 430) { m.x = -2; m.y = rand(92, 236); } }
}

// ---- the editor of the games ----
// Seated while the fight goes on, on his feet to start it and to judge. His right hand does the talking.
function showEditor(ctx, B, T) {
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const grand = !!B.theme.box, v = showVerdict(B);
  const toga = '#f2ecd8', togaD = '#cfc8b2', stripe = grand ? '#7a3a8e' : '#a8452e', skin = '#d9a57c', skinD = '#b08258';
  const starting = B.intro > 0, up = starting || B.over;
  const oy = up ? 0 : 5;
  // his chair
  R(206, 43, 16, 23, '#4a3323'); R(206, 43, 16, 2, '#e8b545'); R(206, 43, 2, 23, '#33241c');
  // body and head
  R(208, 47 + oy, 12, 19 - oy, toga); R(208, 47 + oy, 2, 19 - oy, togaD); R(212, 47 + oy, 3, 19 - oy, stripe);
  R(213, 45 + oy, 3, 2, skinD);
  R(211, 39 + oy, 6, 7, skin); R(211, 39 + oy, 1, 7, skinD); R(211, 38 + oy, 6, 2, '#b9b2a2'); R(215, 42 + oy, 1, 1, '#1c1310'); R(214, 44 + oy, 2, 1, skinD);
  R(210, 39 + oy, 8, 1, grand ? '#e8b545' : '#5a9a3a');                                    // wreath
  R(206, 48 + oy, 2, 8, toga); R(206, 55 + oy, 2, 2, skin);                                // left arm at rest
  const armOut = (thumb) => {            // thumb: -1 turned down, 0 wavering, 1 hidden in the fist
    R(220, 48, 7, 2, toga); R(220, 49, 7, 1, togaD); R(227, 47, 3, 3, skin); R(227, 49, 3, 1, skinD);
    if (thumb < 0) { R(228, 50, 1, 3, skin); R(228, 53, 1, 1, '#c23b2e'); }
    else if (thumb === 0) R(Math.sin(T * 11) > 0 ? 227 : 229, Math.sin(T * 7) > 0 ? 46 : 50, 1, 1, skin);
  };
  const armUp = (cloth) => {
    R(220, 41, 2, 8, toga); R(221, 41, 1, 8, togaD); R(220, 39, 2, 2, skin);
    if (cloth) { const w = Math.round(Math.sin(T * 9) * 1.5); R(219 + w, 33, 5, 4, '#ffffff'); R(220 + w * 2, 36, 4, 3, '#ffffff'); R(219 + w, 33, 1, 4, '#d8d8d8'); }
  };
  if (starting) armUp(B.intro > 0.5);                                   // he lets the cloth fall, and they begin
  else if (v && v.done) { if (v.f.fate === 'spared') armUp(true); else armOut(-1); }
  else if (v && v.begun) armOut(0);
  else if (B.over) { const c = Math.sin(T * 10) > 0 ? 1 : 0; R(220, 48, 2, 5, toga); R(217 + c, 52, 4, 2, skin); R(209, 52, 3 + c, 2, skin); }   // he applauds
  else { R(220, 48 + oy, 2, 8, toga); R(220, 55 + oy, 2, 2, skin); if (B.exc > 0.5) R(219, 47 + oy, 3, 2, togaD); }
  // the rail of his box, in front of him
  R(190, 62, 48, 1, grand ? '#f8dc88' : '#94703f'); R(190, 63, 48, 3, grand ? '#e8b545' : '#5e4426');
  for (let x = 193; x < 238; x += 7) R(x, 63, 1, 3, grand ? '#a87a26' : '#3a2a1c');
  // the verdict, written large above his head for the back rows
  if (v && v.done) {
    const spared = v.f.fate === 'spared', a = clamp((v.f.revealAt + 0.75 - B.outro) * 4, 0, 1), x = 208, y = 22;
    ctx.globalAlpha = a;
    R(x - 1, y - 1, 13, 13, '#1c1310'); R(x, y, 11, 11, spared ? '#efe8d6' : '#7e1b14');
    if (spared) { R(x + 3, y + 3, 5, 5, '#d9a57c'); R(x + 3, y + 4, 5, 1, '#b08258'); R(x + 3, y + 6, 5, 1, '#b08258'); R(x + 2, y + 5, 1, 2, '#d9a57c'); R(x + 4, y + 8, 3, 2, '#f2ecd8'); }   // the closed fist
    else { R(x + 2, y + 2, 6, 4, '#d9a57c'); R(x + 2, y + 3, 6, 1, '#b08258'); R(x + 6, y + 6, 2, 4, '#d9a57c'); R(x + 6, y + 9, 2, 1, '#f2ecd8'); }                                             // the turned thumb
    ctx.globalAlpha = 1;
  }
}

function showBanner(ctx, x, c, cD, T, gust) {
  const R = (bx, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(bx, y, w, h); };
  R(x - 1, 68, 14, 2, '#3a2a1c');
  for (let j = 0; j < 13; j++) {
    const off = Math.round(Math.sin(T * 2.6 + j * 0.55 + x * 0.3) * (j / 12) * gust), y = 70 + j;
    if (j < 10) { R(x + off, y, 12, 1, c); R(x + off, y, 2, 1, cD); if (j >= 2 && j < 7) R(x + 5 + off, y, 2, 1, 'rgba(255,255,255,.35)'); }
    else { R(x + off, y, 4, 1, c); R(x + 8 + off, y, 4, 1, c); }
  }
}

// Behind the fighters: the crowd, the editor, cloth in the wind, what lies on the sand, the shimmer of heat.
function showBack(ctx, B, T) {
  const S = B.show || showInit(B);
  showStep(B, T);
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const th = B.theme, v = showVerdict(B);
  const cheer = 0.15 + clamp(B.exc, 0, 1) * 0.85 + (B.over ? 0.5 : 0);
  const bored = S.bored > 7;
  let vi = 0; if (v) vi = B.fighters.indexOf(v.f);
  for (const p of B.crowd) {
    if (v && v.begun && (v.done || v.k > p.h * 0.35)) {
      // each of them votes: a waved cloth to spare him, a turned thumb for the sword
      const lean = v.f.fate === 'spared' ? 0.5 + 0.5 * v.k : 0.5 - 0.5 * v.k;
      const mercy = v.done ? v.f.fate === 'spared' : ((p.h * 7.3 + vi * 0.37) % 1) < lean;
      drawSpectator(ctx, Object.assign({}, p, { arms: false }), 2);
      if (mercy) { const w = Math.sin(T * 10 + p.ph) > 0 ? 0 : 1; R(p.x + 4, p.y - 12, 1, 4, p.skin); R(p.x + 3 + w, p.y - 14, 2, 2, '#ffffff'); }
      else { R(p.x + 4, p.y - 9, 3, 1, p.skin); R(p.x + 6, p.y - 8, 1, 2, p.skin); }
      continue;
    }
    const wave = Math.sin(T * p.sp + p.ph) > 1 - cheer * 1.4;
    if (p.stand > 0) {                       // on his feet, both arms going
      drawSpectator(ctx, Object.assign({}, p, { arms: false }), 3);
      const a = Math.sin(T * 12 + p.ph) > 0 ? 1 : 0;
      R(p.x - 1, p.y - 13 - a, 1, 4, p.skin); R(p.x + 4, p.y - 14 + a, 1, 4, p.skin);
      if (p.fan >= 0) R(p.x + 4 + a, p.y - 16 + a, 2, 2, B.col[p.fan]);
    } else if (wave && !bored) drawSpectator(ctx, p, 2);
  }
  showEditor(ctx, B, T);
  const gust = 1 + (0.5 + 0.5 * Math.sin(T * 0.45)) * 1.4;
  showBanner(ctx, 48, B.col[0], B.colD[0], T, gust); showBanner(ctx, 368, B.col[1], B.colD[1], T + 2, gust);
  if (th.banners) for (const x of [108, 150, 266, 308]) showBanner(ctx, x, '#d9a441', '#a87a26', T + x, gust);
  if (!th.awning && th.crowd >= 0.7) for (const x of [44, 132, 292, 380]) {          // pennants along the rim
    R(x, 3, 1, 19, '#3a2a1c');
    for (let i = 0; i < 9; i++) { const dy = Math.round(Math.sin(T * 6 - i * 0.9 + x) * 1.3 * (i / 8) * gust * 0.6); R(x + 1 + i, 4 + dy, 1, i > 5 ? 3 : 4, i % 4 < 2 ? '#d9a441' : '#b8452e'); }
  }
  // blood: bright where it has just fallen, then darkening and spreading as the sand drinks it
  for (const s of B.stains) {
    const age = T - (s.t || 0), x = Math.round(s.x * 2), y = Math.round(s.y * 2), w = s.w * 2;
    if (age > 2.5) { ctx.fillStyle = `rgba(120,52,28,${Math.min(0.2, (age - 2.5) * 0.03).toFixed(3)})`; ctx.fillRect(x - 1, y, w + 2, 2); ctx.fillRect(x, y + 2, w, 1); }
    ctx.fillStyle = age < 1.2 ? '#c22a1e' : age < 5 ? '#8e1b14' : age < 14 ? '#76241a' : '#633024';
    ctx.fillRect(x, y, w, 2);
    if (age < 1.2) { ctx.fillStyle = '#e8584a'; ctx.fillRect(x, y, 1, 1); }
  }
  for (const l of S.litter) { R(l.x, l.y, 2, 1, l.col); R(l.x, l.y + 1, 2, 1, 'rgba(0,0,0,.18)'); }
  // heat: by day the foot of the wall and the far sand swim a little
  if (B.light !== 'dusk' && B.shake <= 0.2) {
    const cv = ctx.canvas;
    for (let y = 80; y < 100; y++) {
      const a = Math.sin(T * 3.1 + y * 0.83) * (1 - (y - 80) / 26);
      if (Math.abs(a) > 0.62) ctx.drawImage(cv, 0, y * FINE, cv.width, FINE, a > 0 ? 1 : -1, y, 428, 1);
    }
  }
}

// In front of the fighters: what is in the air.
function showFront(ctx, B, T) {
  const S = B.show; if (!S) return;
  for (const p of S.puffs) {
    const k = p.life / p.max, r = p.r + Math.round((1 - k) * 3);
    ctx.fillStyle = `rgba(234,210,160,${(0.42 * k).toFixed(3)})`;
    ctx.fillRect(Math.round(p.x) - r, Math.round(p.y - (1 - k) * 7) - r, r * 2, r + 1);
  }
  for (const o of S.thrown) {
    const x = o.x0 + (o.x1 - o.x0) * o.t, y = o.y0 + (o.y1 - o.y0) * o.t - Math.sin(o.t * Math.PI) * o.arc;
    ctx.fillStyle = o.col; ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
  }
  ctx.fillStyle = B.light === 'dusk' ? 'rgba(255,220,170,.22)' : 'rgba(255,246,214,.3)';
  for (const m of S.motes) ctx.fillRect(Math.round(m.x), Math.round(m.y + Math.sin(T * 0.9 + m.ph) * 4), 1, 1);
}
