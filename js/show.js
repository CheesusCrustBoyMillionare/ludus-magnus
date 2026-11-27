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
  // Each of them has a side: the red's people sit mostly under the red banner and the blue's under the blue, with some who
  // have come only for the show. One in five has brought a cloth in his side's colour, and each side has its flags.
  B.crowd.forEach((p, i) => {
    p.h = (i * 0.61803) % 1; p.stand = 0; p.slump = 0;
    const r = (i * 0.754877) % 1, red = clamp(0.8 - p.x / 428 * 0.6, 0.2, 0.8);
    p.side = r < 0.12 ? -1 : (r - 0.12) / 0.88 < red ? 0 : 1;
    p.fan = p.side >= 0 && i % 5 === 0 ? p.side : -1;
  });
  S.joy = [0, 0]; S.logN = 0; S.shouts = []; S.hot = 0; S.wave = null; S.wasIntro = B.intro > 0; S.said = {};
  S.flags = [0, 1].flatMap(side => B.crowd.filter(p => p.side === side && p.y >= 31 && p.y <= 49 && (side ? p.x > 250 : p.x < 178)).filter((p, i) => i % 23 === 7).slice(0, 3).map(p => ({ p, side })));
  // and there are men working the stairs with trays: wine, sausage, cushions
  S.sellers = B.crowd.length > 60 ? ARENA_AISLES.map((a, i) => ({ x: a + 3, y: 30 + i * 9, dir: i % 2 ? 1 : -1, wait: i * 1.3, col: ['#c9a763', '#8a6a4a', '#b8452e', '#6f8fb5'][i] })).filter((_, i) => i !== 1 || B.crowd.length > 200) : [];
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
  if (jump > 0.05 && S.ed && fighting) S.ed.clap = 1.1;       // the editor claps a telling blow
  if (jump > 0.02) {
    for (const p of B.crowd) if (Math.random() < jump * 4) p.stand = Math.max(p.stand, rand(0.5, 1.5));
    if (jump > 0.07) {
      const live = B.fighters.filter(f => !out(f)), f = live.length ? pick(live) : B.fighters[0];
      for (let i = 0; i < Math.min(6, Math.round(jump * 30)); i++) showThrow(B, f.x * 2 + rand(-40, 40), Math.max(94, f.y * 2 + rand(-30, 6)), SHOW_PETALS);
    }
  }
  // They follow the fight as partisans. Each new thing that is told of it (B.log) lifts one side and sinks the other:
  // a man's own people are up for his blows and sit with their heads in their hands when he goes down.
  const cry = (word, side, n) => {
    const from = B.crowd.filter(p => (side < 0 || p.side === side) && p.y >= 40);      // from the lower rows, clear of the panels and the telling at the top
    for (let i = 0; i < (n || 1) && from.length; i++) { const p = pick(from); S.shouts.push({ x: p.x + 2, y: p.y - 12, word, t: -i * 0.18, dur: 1.3, side: p.side }); }
    if (S.shouts.length > 7) S.shouts.splice(0, S.shouts.length - 7);
  };
  const log = B.log || [];
  for (; S.logN < log.length; S.logN++) {
    const e = log[S.logN], k = e.kind, t = e.team;
    if (k === 'down' || k === 'dead') {            // e.team is the man who fell
      for (const p of B.crowd) { if (p.side === 1 - t) p.stand = Math.max(p.stand, rand(1.2, 2.6)); else if (p.side === t) { p.stand = 0; p.slump = rand(1.5, 3); } }
      S.joy[1 - t] = 1; S.joy[t] = 0; if (k === 'down') cry('HABET!', 1 - t, 3);
      if (S.ed && k === 'down') S.ed.rise = 1.8;       // and is on his feet when a man goes down
    } else if (k === 'hit' || k === 'ability' || k === 'wound') {      // e.team is the man who did it
      const big = k === 'hit' ? 0.3 : 0.16;
      for (const p of B.crowd) { if (p.side === t && Math.random() < big) p.stand = Math.max(p.stand, rand(0.5, 1.4)); else if (p.side === 1 - t && Math.random() < big * 0.5) p.slump = Math.max(p.slump, rand(0.6, 1.2)); }
      S.joy[t] = Math.min(1, S.joy[t] + 0.45); S.joy[1 - t] = Math.max(0, S.joy[1 - t] - 0.25);
      if (k === 'hit' && Math.random() < 0.7) cry('HABET!', t, 1);
    } else if (k === 'yield') { for (const p of B.crowd) if (p.side === t) p.slump = Math.max(p.slump, rand(1, 2)); S.joy[t] = 0; }
    else if (k === 'spared') { for (const p of B.crowd) if (p.side === t || p.side < 0) p.stand = Math.max(p.stand, rand(0.8, 1.6)); }
  }
  S.joy[0] = Math.max(0, S.joy[0] - dt * 0.12); S.joy[1] = Math.max(0, S.joy[1] - dt * 0.12);
  // they are on their feet as the men come in, and again when the cloth falls
  if (B.intro > 0 && B.introDur - B.intro < 1.4) for (const p of B.crowd) if (p.stand < 0.3 && p.h < 0.7) p.stand = 0.3 + p.h * 0.5;
  if (S.wasIntro && B.intro <= 0) { for (const p of B.crowd) if (Math.random() < 0.6) p.stand = rand(0.6, 1.6); cry('PUGNATE!', -1, 2); }
  S.wasIntro = B.intro > 0;
  // when a fallen man's life is being asked for, they say which way they lean before the thumb turns
  const vd = showVerdict(B);
  if (vd && vd.begun && !vd.done && !S.said[B.fighters.indexOf(vd.f)]) { S.said[B.fighters.indexOf(vd.f)] = 1; cry(vd.f.fate === 'spared' ? 'MITTE!' : 'IUGULA!', -1, 4); cry(vd.f.fate === 'spared' ? 'IUGULA!' : 'MITTE!', vd.f.team === 0 ? 1 : 0, 1); }
  // a fight that has kept them roaring sets a wave going round the stands
  S.hot = fighting && B.exc > 0.55 ? S.hot + dt : Math.max(0, S.hot - dt * 2);
  if (S.hot > 5 && !S.wave) { S.wave = { x: -20, dir: 1 }; S.hot = 0; }
  if (S.wave) {
    S.wave.x += S.wave.dir * 150 * dt;
    for (const p of B.crowd) if (Math.abs(p.x - S.wave.x) < 12 && !p.slump) p.stand = Math.max(p.stand, 0.4);
    if (S.wave.x > 450) S.wave = S.wave.dir > 0 && Math.random() < 0.5 ? { x: 450, dir: -1 } : null; else if (S.wave.x < -30) S.wave = null;
  }
  // a dull fight brings cabbage stalks instead
  S.bored = fighting && B.exc < 0.05 ? S.bored + dt : 0;
  if (S.bored > 7 && T > S.nextThrow) {
    S.nextThrow = T + rand(0.8, 2.2);
    const live = B.fighters.filter(f => !out(f));
    if (live.length) { const f = pick(live); showThrow(B, f.x * 2 + rand(-18, 18), f.y * 2 + rand(-8, 8), SHOW_SCRAPS); }
    if (Math.random() < 0.4) cry('VERBERA!', -1, 1);              // and shouts to get on with it
  }
  // when it is settled the victors stand in a rain of petals and coins
  if (B.over && B.outro > 0.2 && B.outro < B.outroEnd && T > S.nextThrow) {
    S.nextThrow = T + 0.07;
    const win = B.fighters.filter(f => f.team === B.winner && !out(f));
    if (win.length) { const f = pick(win); showThrow(B, f.x * 2 + rand(-34, 34), f.y * 2 + rand(-22, 12), SHOW_PETALS); }
  }
  for (const p of B.crowd) { p.stand = Math.max(0, p.stand - dt); p.slump = Math.max(0, p.slump - dt); }
  for (const c of S.shouts) c.t += dt;
  S.shouts = S.shouts.filter(c => c.t < c.dur);
  for (const v of S.sellers) {                   // up a few rows, stop to sell, on again; down when he reaches the top
    if (v.wait > 0) { v.wait -= dt; continue; }
    v.y += v.dir * 5 * dt;
    if (v.y < 22) { v.y = 22; v.dir = 1; v.wait = rand(1.5, 4); } else if (v.y > 64) { v.y = 64; v.dir = -1; v.wait = rand(1.5, 4); }
    else if (Math.abs((v.y - 22) % 9) < 0.09 && Math.random() < 0.45) v.wait = rand(1, 3.5);
  }
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
// He gives the games and he judges them. He stands to start the fight and lets the cloth fall; seated, he watches where
// the fighting is, leans to the rail when it is good, claps a telling blow, is on his feet when a man goes down, and when
// it is dull drinks, yawns and props his chin on his hand. For the verdict he stands, looks round the stands, and turns
// his thumb or raises the cloth; and he throws the victor his reward. In any arena but the meanest he does not sit alone:
// a slave fans him and a guard stands by, and in the great arena there are more of both, a lady beside him and the eagle.
function showEditor(ctx, B, T) {
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const S = B.show, E = S.ed || (S.ed = { clap: 0, rise: 0, sip: 0, nextSip: T + 6, tossed: false, drop: -1, t: T });
  const dt = clamp(T - E.t, 0, 0.1); E.t = T;
  E.clap = Math.max(0, E.clap - dt); E.rise = Math.max(0, E.rise - dt); E.sip = Math.max(0, E.sip - dt);
  const th = B.theme, grand = !!th.box, humble = !!th.planks, v = showVerdict(B);
  const toga = humble ? '#d8cfb4' : '#f2ecd8', togaD = humble ? '#b3aa90' : '#cfc8b2', stripe = grand ? '#7a3a8e' : humble ? '#8a6a4a' : '#a8452e', skin = '#d9a57c', skinD = '#b08258';
  const starting = B.intro > 0, fighting = !B.over && !starting;
  const bored = fighting && S.bored > 4 && !E.rise, keen = fighting && B.exc > 0.5;
  if (fighting && !bored && !keen && T > E.nextSip) { E.sip = 1.5; E.nextSip = T + rand(8, 15); }
  const up = starting || B.over || E.rise > 0;
  const oy = up ? 0 : bored ? 6 : 5;
  // where he is looking: at the fighting; round the stands while a life is being asked for
  const live = B.fighters.filter(f => !out(f)), ax = live.length ? live.reduce((n, f) => n + f.x * 2, 0) / live.length : 214;
  let look = ax < 186 ? -1 : ax > 242 ? 1 : 0;
  if (v && v.begun && !v.done) look = Math.sin(T * 3.2) > 0 ? 1 : -1;
  const blink = Math.sin(T * 0.9 + 1) > 0.985 || (bored && Math.sin(T * 0.5) > 0.6);

  // ---- those who attend him, behind ----
  if (!humble) {
    const sway = Math.round(Math.sin(T * 1.6) * 2);
    R(200, 41, 1, 12, '#6b4f2c');                                                            // the fan's pole
    R(196 + sway, 36, 9, 6, '#e8dcc0'); R(197 + sway, 35, 7, 1, '#e8dcc0'); R(196 + sway, 36, 9, 1, '#f8f2e0'); R(198 + sway, 38, 1, 2, '#3a8a8e'); R(202 + sway, 38, 1, 2, '#3a8a8e'); R(200 + sway, 37, 1, 2, '#c9a23a');
    R(195, 50, 6, 13, '#c9c2b2'); R(195, 50, 1, 13, '#a39c8c'); R(196, 45, 4, 5, '#a8744a'); R(196, 44, 4, 2, '#1c1310'); R(199, 51, 2, 3, '#a8744a');      // the slave who holds it
    const guard = (gx, flip) => {
      R(gx + (flip ? -2 : 6), 38, 1, 25, '#6b4f2c'); R(gx + (flip ? -2 : 6), 36, 1, 3, '#d8dde2');                    // spear
      R(gx, 49, 5, 14, '#8a3a2e'); R(gx, 49, 5, 6, '#c9a94a'); R(gx, 49, 1, 6, '#9a7f34'); R(gx, 55, 5, 1, '#6b4f2c');   // tunic, cuirass, belt
      R(gx + 1, 44, 3, 5, skin); R(gx, 42, 5, 3, '#c9a94a'); R(gx + 1, 40, 3, 2, '#b8452e'); R(gx + (flip ? 4 : 0), 45, 1, 3, '#c9a94a');      // head, helmet, crest, cheek-piece
      R(gx + (flip ? 3 : -2), 51, 4, 9, '#a8452e'); R(gx + (flip ? 4 : -1), 54, 2, 2, '#e8b545');                      // shield, and its boss
    };
    guard(grand ? 239 : 229, false);
    if (grand) {
      guard(189, true);
      R(183, 36, 1, 27, '#6b4f2c'); R(180, 32, 7, 2, '#e8b545'); R(182, 30, 3, 2, '#e8b545'); R(179, 33, 2, 1, '#e8b545'); R(186, 33, 2, 1, '#e8b545'); R(181, 37, 5, 3, '#8a2a20');      // the eagle on its staff
      // the lady beside him, who watches when he does and looks away when a man is killed
      const away = v && v.done && v.f.fate === 'dead';
      R(225, 43, 9, 23, '#4a3323'); R(225, 43, 9, 1, '#e8b545');
      R(226, 51, 7, 15, '#7a3a8e'); R(226, 51, 1, 15, '#5a2a6a'); R(227, 50, 5, 1, '#e8b545');
      R(227, 45, 4, 5, skin); R(226, 43, 6, 3, '#3a2414'); R(away ? 231 : 226, 45, 1, 4, '#3a2414'); R(away ? 228 : 229, 47, 1, 1, '#1c1310');
    }
  }
  // his chair, and the cushion on it
  R(205, 42, 18, 24, humble ? '#5a4630' : '#4a3323'); R(205, 42, 18, 2, humble ? '#7a6244' : '#e8b545'); R(205, 42, 2, 24, '#33241c'); R(221, 42, 2, 24, '#33241c');
  if (!humble) { R(205, 40, 2, 2, '#e8b545'); R(221, 40, 2, 2, '#e8b545'); R(207, 60, 14, 2, grand ? '#7a3a8e' : '#a8452e'); }
  // body and head
  R(208, 47 + oy, 12, 19 - oy, toga); R(208, 47 + oy, 2, 19 - oy, togaD); R(212, 47 + oy, 3, 19 - oy, stripe);
  for (let y = 50 + oy; y < 64; y += 4) R(215, y, 4, 1, togaD);                               // the folds of it
  R(213, 45 + oy, 3, 2, skinD);
  R(211, 39 + oy, 6, 7, skin); R(look > 0 ? 211 : 216, 39 + oy, 1, 7, skinD); R(211, 38 + oy, 6, 2, '#b9b2a2'); R(look > 0 ? 211 : 216, 40 + oy, 1, 2, '#b9b2a2');
  if (blink) R(212, 42 + oy, 4, 1, skinD);
  else if (look === 0) { R(212, 42 + oy, 1, 1, '#1c1310'); R(215, 42 + oy, 1, 1, '#1c1310'); }
  else { R(look > 0 ? 215 : 212, 42 + oy, 1, 1, '#1c1310'); R(look > 0 ? 217 : 210, 43 + oy, 1, 1, skin); }                // in profile: one eye, and his nose
  if (bored && Math.sin(T * 0.7) > 0.88) R(213, 44 + oy, 2, 2, '#5a2a1c'); else R(look > 0 ? 214 : 213, 44 + oy, 2, 1, skinD);     // a yawn, or his mouth
  R(210, 39 + oy, 8, 1, grand ? '#e8b545' : '#5a9a3a'); if (grand) { R(210, 38 + oy, 1, 1, '#e8b545'); R(217, 38 + oy, 1, 1, '#e8b545'); }      // wreath
  // ---- his arms: what he is doing ----
  const armOut = (thumb) => {            // thumb: -1 turned down, 0 wavering, 1 hidden in the fist
    R(220, 48, 7, 2, toga); R(220, 49, 7, 1, togaD); R(227, 47, 3, 3, skin); R(227, 49, 3, 1, skinD);
    if (thumb < 0) { R(228, 50, 1, 3, skin); R(228, 53, 1, 1, '#c23b2e'); }
    else if (thumb === 0) R(Math.sin(T * 11) > 0 ? 227 : 229, Math.sin(T * 7) > 0 ? 46 : 50, 1, 1, skin);
  };
  const armUp = (cloth) => {
    R(220, 41, 2, 8, toga); R(221, 41, 1, 8, togaD); R(220, 39, 2, 2, skin);
    if (cloth) { const w = Math.round(Math.sin(T * 9) * 1.5); R(219 + w, 33, 5, 4, '#ffffff'); R(220 + w * 2, 36, 4, 3, '#ffffff'); R(219 + w, 33, 1, 4, '#d8d8d8'); }
  };
  const leftRest = () => { R(206, 48 + oy, 2, 8, toga); R(206, 55 + oy, 2, 2, skin); };
  const clapping = () => { const c = Math.sin(T * 12) > 0 ? 1 : 0; R(220, 48 + oy, 2, 5, toga); R(217 + c, 52 + oy, 4, 2, skin); R(206, 48 + oy, 2, 5, toga); R(209, 52 + oy, 3 + c, 2, skin); };
  if (starting) {
    leftRest();
    if (B.intro > 0.5) armUp(true); else { armOut(1); if (E.drop < 0) E.drop = 0; }          // he lets the cloth fall, and they begin
  } else if (v && v.done) { leftRest(); if (v.f.fate === 'spared') armUp(true); else armOut(-1); }
  else if (v && v.begun) { leftRest(); armOut(0); }
  else if (B.over || E.clap > 0) clapping();                                                // he applauds
  else if (E.sip > 0) {                                                                     // a cup of wine
    leftRest(); const k = Math.sin(clamp(1 - E.sip / 1.5, 0, 1) * Math.PI) > 0.5;
    if (k) { R(219, 45 + oy, 2, 5, toga); R(216, 43 + oy, 3, 2, '#e8b545'); R(216, 43 + oy, 3, 1, '#fff0b0'); }
    else { R(220, 48 + oy, 2, 6, toga); R(221, 52 + oy, 3, 2, '#e8b545'); R(221, 51 + oy, 3, 1, '#7a1f2a'); }
  } else if (bored) { R(220, 48 + oy, 2, 8, toga); R(220, 55 + oy, 2, 2, skin); R(206, 46 + oy, 2, 8, toga); R(208, 45 + oy, 3, 2, skin); }       // chin on his hand
  else if (keen) { R(206, 50 + oy, 2, 7, toga); R(206, 57 + oy, 3, 2, skin); R(220, 50 + oy, 2, 7, toga); R(219, 57 + oy, 3, 2, skin); R(219, 47 + oy, 3, 2, togaD); }      // both hands on the rail
  else { leftRest(); R(220, 48 + oy, 2, 8, toga); R(220, 55 + oy, 2, 2, skin); }
  // the rail of his box, in front of him
  R(190, 62, 48, 1, grand ? '#f8dc88' : '#94703f'); R(190, 63, 48, 3, grand ? '#e8b545' : '#5e4426');
  for (let x = 193; x < 238; x += 7) R(x, 63, 1, 3, grand ? '#a87a26' : '#3a2a1c');
  // the cloth, falling to the sand
  if (E.drop >= 0 && E.drop < 1.1) {
    E.drop += dt; const q = clamp(E.drop / 1.0, 0, 1), cx = 224 + Math.round(Math.sin(q * 9) * 4 * (1 - q)), cy = Math.round(46 + q * q * 54);
    R(cx, cy, 5, 3, '#ffffff'); R(cx + (Math.sin(q * 14) > 0 ? 1 : -1), cy + 3, 4, 2, '#f0f0f0'); R(cx, cy, 1, 3, '#d8d8d8');
    if (E.drop >= 1.1) S.litter.push({ x: cx, y: cy + 3, col: '#ffffff' }, { x: cx + 2, y: cy + 4, col: '#e8e8e8' });
  }
  // the victor's reward: a palm and a purse, thrown down when the judging is done
  if (B.over && !E.tossed && B.outro > (B.cardAt === undefined ? 1.5 : B.cardAt) - 0.2) {
    E.tossed = true;
    const win = B.fighters.filter(f => f.team === B.winner && !out(f) && !f.g.beast);
    if (win.length && !B.hunt) { const f = win[0]; for (let n = 0; n < 6; n++) showThrow(B, f.x * 2 + rand(-10, 10), f.y * 2 + rand(-4, 5), n < 2 ? ['#5a9a3a', '#8fc35a'] : ['#e8b545', '#fff0b0'], { x: 222, y: 56, stand: 0 }); }
  }
  // the verdict, written large above his head for the back rows
  if (v && v.done) {
    const spared = v.f.fate === 'spared', a = clamp((v.f.revealAt + 0.75 - B.outro) * 4, 0, 1), x = 207, y = 20;
    ctx.globalAlpha = a;
    R(x - 2, y - 2, 17, 17, Math.sin(T * 16) > 0 ? '#e8b545' : '#fff0b0'); R(x - 1, y - 1, 15, 15, '#1c1310'); R(x, y, 13, 13, spared ? '#efe8d6' : '#7e1b14');
    if (spared) { R(x + 4, y + 4, 5, 5, '#d9a57c'); R(x + 4, y + 5, 5, 1, '#b08258'); R(x + 4, y + 7, 5, 1, '#b08258'); R(x + 3, y + 6, 1, 2, '#d9a57c'); R(x + 5, y + 9, 3, 2, '#f2ecd8'); }   // the closed fist
    else { R(x + 3, y + 3, 6, 4, '#d9a57c'); R(x + 3, y + 4, 6, 1, '#b08258'); R(x + 7, y + 7, 2, 4, '#d9a57c'); R(x + 7, y + 10, 2, 1, '#f2ecd8'); }                                             // the turned thumb
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
// What moves in the country behind a fight outside the walls: birds over the hills, things on the air, and at a camp
// the fire, its smoke, and the outlaws' banner.
function showWild(ctx, B, T, gust) {
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const k = B.wild, seed = B.wseed || 1;
  for (let i = 0; i < 4; i++) {                 // birds
    const bx = ((i * 139 + seed + T * (9 + i * 3)) % 500) - 36, by = 10 + (i * 11 + seed) % 26 + Math.sin(T * 0.8 + i) * 3, f = Math.sin(T * 8 + i * 2) > 0 ? 1 : 0;
    R(bx - 3, by - f, 3, 1, '#2a2a33'); R(bx + 1, by - f, 3, 1, '#2a2a33'); R(bx, by + 1 - f, 1, 1, '#2a2a33');
  }
  if (k === 'rock') for (let i = 0; i < 2; i++) {             // and over a lair, something that waits its turn
    const a = T * 0.5 + i * 3.1, cx = 214 + Math.cos(a) * (60 + i * 20), cy = 20 + Math.sin(a) * 7, f = Math.sin(T * 5 + i) > 0 ? 1 : 0;
    R(cx - 4, cy - f, 4, 1, '#1c1310'); R(cx + 1, cy - f, 4, 1, '#1c1310'); R(cx - 1, cy, 3, 2, '#1c1310');
  }
  // things on the air: leaves in a wood, dust on the rock, ash at a camp, seed-down among the stones
  const col = k === 'forest' ? ['#a8762e', '#6f9a4a', '#c9a23a'] : k === 'rock' ? ['#c9c2ae', '#a39c88'] : k === 'camp' ? ['#d8d4cc', '#8a8478'] : ['#f4f0e0', '#e8e0c8'];
  for (let i = 0; i < (k === 'forest' ? 14 : 9); i++) {
    const p = (T * (0.05 + (i % 4) * 0.012) + i * 0.173 + seed * 0.01) % 1, x = ((i * 97 + seed * 3 + T * 6 * gust) % 460) - 16 + Math.sin(T * 1.3 + i) * 5;
    const y = k === 'camp' ? 96 - p * 80 : 20 + p * 210;
    ctx.globalAlpha = Math.min(1, Math.sin(p * Math.PI) * 1.6) * 0.8;
    R(x, y, k === 'forest' ? 2 : 1, 1, col[i % col.length]); if (k === 'forest' && Math.sin(T * 6 + i) > 0) R(x + 1, y + 1, 1, 1, col[i % col.length]);
  }
  ctx.globalAlpha = 1;
  if (k === 'camp') {
    const fl = Math.sin(T * 13) > 0 ? 1 : 0, k2 = 0.8 + Math.sin(T * 9) * 0.2;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) { const r = 34 - i * 5; ctx.fillStyle = `rgba(255,150,60,${(0.04 * k2).toFixed(3)})`; ctx.fillRect(214 - r, 94 - Math.round(r * 0.5), r * 2, r); }
    ctx.globalCompositeOperation = 'source-over';
    R(209, 85 - fl, 10, 9 + fl, '#e2702a'); R(211, 83 - fl * 2, 6, 9, '#f08a3a'); R(212, 86 - fl, 4, 6, '#f5c04a'); R(213, 88, 2, 4, '#fff0b0');
    for (let i = 0; i < 4; i++) { const q = (T * 0.3 + i / 4) % 1; ctx.globalAlpha = 0.45 * (1 - q); R(212 + Math.sin(q * 5 + i) * 4 + q * 12 * gust, 80 - q * 46, 4 + Math.round(q * 5), 3 + Math.round(q * 3), '#cfcac0'); }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 12; i++) { const dy = Math.round(Math.sin(T * 6 - i * 0.8) * 1.4 * (i / 11) * gust * 0.6); R(152 + i, 31 + dy, 1, i > 8 ? 6 : 8, i % 5 < 3 ? '#8a2a20' : '#6a1f18'); }      // their banner
  }
}

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
    if (p.slump > 0 && !p.stand) {           // his man is in trouble: he sits with his head in his hands
      drawSpectator(ctx, Object.assign({}, p, { arms: false }), 0);
      R(p.x - 1, p.y - 9 + (p.small ? 2 : 0), 1, 3, p.skin); R(p.x + 3, p.y - 9 + (p.small ? 2 : 0), 1, 3, p.skin);
      continue;
    }
    if (p.stand > 0) {                       // on his feet, both arms going: all together when the whole place is roaring
      drawSpectator(ctx, Object.assign({}, p, { arms: false }), 3);
      const a = Math.sin(T * 12 + (B.exc > 0.75 ? 0 : p.ph)) > 0 ? 1 : 0;
      R(p.x - 1, p.y - 13 - a, 1, 4, p.skin); R(p.x + 4, p.y - 14 + a, 1, 4, p.skin);
      if (p.fan >= 0) R(p.x + 4 + a, p.y - 16 + a, 2, 2, B.col[p.fan]);
    } else if (wave && !bored) {
      drawSpectator(ctx, p, 2);
      if (p.fan >= 0 && S.joy[p.fan] > 0.3) { const a = Math.sin(T * 9 + p.ph) > 0 ? 1 : 0; R(p.x + 4, p.y - 11, 1, 3, p.skin); R(p.x + 4 + a, p.y - 13, 2, 2, B.col[p.fan]); }      // his side is doing well: out comes the cloth
    }
  }
  // the flags of each side: high and flying while their man is on top, down and hanging when he is not
  for (const fl of (S.flags || [])) {
    const p = fl.p, joy = S.joy[fl.side], up = joy > 0.2, c = B.col[fl.side], cD = B.colD[fl.side];
    const sway = up ? Math.round(Math.sin(T * 3 + p.ph) * 2) : 0, top = p.y - (up ? 26 : 19);
    for (let i = 0; i < (up ? 17 : 10); i++) R(p.x + 4 + Math.round(sway * (1 - i / 17)), top + i, 1, 1, '#3a2a1c');
    if (up) for (let i = 0; i < 9; i++) { const dy = Math.round(Math.sin(T * 7 - i * 0.8 + p.ph) * 1.2 * (i / 8)); R(p.x + 5 + sway + i, top + dy, 1, 6, i % 4 === 3 ? cD : c); if (i === 2 || i === 5) R(p.x + 5 + sway + i, top + 2 + dy, 1, 2, 'rgba(255,255,255,.4)'); }
    else { R(p.x + 5, top, 2, 7, c); R(p.x + 5, top, 1, 7, cD); }
  }
  // the men with trays, on the stairs
  for (const v of (S.sellers || [])) {
    const y = Math.round(v.y), bob = v.wait > 0 ? 0 : (Math.sin(T * 10 + v.x) > 0 ? 1 : 0);
    R(v.x, y - 9 - bob, 3, 3, '#c98f62'); R(v.x, y - 10 - bob, 3, 1, '#2a1c14');
    R(v.x - 1, y - 6 - bob, 5, 5, v.col); R(v.x - 1, y - 6 - bob, 1, 5, 'rgba(0,0,0,.25)'); R(v.x, y - 1, 1, 1, '#3a2a1c'); R(v.x + 2, y - 1 - bob, 1, 1, '#3a2a1c');
    R(v.x - 2, y - 5 - bob, 7, 1, '#6b4f2c'); R(v.x - 1, y - 6 - bob, 1, 1, '#e8dcc0'); R(v.x + 1, y - 6 - bob, 1, 1, '#b8452e'); R(v.x + 3, y - 6 - bob, 1, 1, '#e8dcc0');      // the tray, and what is on it
  }
  // what they shout: a word going up from the stands, in the colour of the side it comes from
  if (S.shouts && S.shouts.length) {
    ctx.font = 'bold 5px Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (const c of S.shouts) {
      if (c.t < 0) continue;
      const k = c.t / c.dur, x = clamp(c.x, 20, 408), y = c.y - k * 7;
      { const V = B.view || { z: 1, ox: 0, oy: 0 }, sx = x * FINE * V.z + V.ox, sy = y * FINE * V.z + V.oy; if (sy < 150 && (sx < 450 || sx > 830)) continue; }      // (it would lie under one of the plates at the top of the picture)
      ctx.globalAlpha = Math.min(1, k * 8) * Math.min(1, (1 - k) * 3);
      const w = ctx.measureText(c.word).width;
      ctx.fillStyle = 'rgba(12,8,5,.78)'; ctx.fillRect(x - w / 2 - 2, y - 5, w + 4, 7); ctx.fillRect(x - 1, y + 2, 2, 1);
      ctx.fillStyle = c.side >= 0 ? shade(B.col[c.side], 1.5) : '#fff0c8'; ctx.fillText(c.word, x, y);
    }
    ctx.globalAlpha = 1;
  }
  const gust = 1 + (0.5 + 0.5 * Math.sin(T * 0.45)) * 1.4;
  if (B.wild) showWild(ctx, B, T, gust);
  if (!B.wild) {                      // the editor, the banners and the pennants belong to an arena
  showEditor(ctx, B, T);
  showBanner(ctx, 48, B.col[0], B.colD[0], T, gust); showBanner(ctx, 368, B.col[1], B.colD[1], T + 2, gust);
  if (th.banners) for (const x of [108, 150, 266, 308]) showBanner(ctx, x, '#d9a441', '#a87a26', T + x, gust);
  if (!th.awning && th.crowd >= 0.7) for (const x of [44, 132, 292, 380]) {          // pennants along the rim
    R(x, 3, 1, 19, '#3a2a1c');
    for (let i = 0; i < 9; i++) { const dy = Math.round(Math.sin(T * 6 - i * 0.9 + x) * 1.3 * (i / 8) * gust * 0.6); R(x + 1 + i, 4 + dy, 1, i > 5 ? 3 : 4, i % 4 < 2 ? '#d9a441' : '#b8452e'); }
  }
  }
  // blood: bright where it has just fallen, then darkening and spreading as the sand drinks it
  for (const c of B.scuffs || []) {              // the sand as it has been used: heels dragged through it, a man fallen on it
    const age = T - c.t, k = Math.min(1, age / 0.25), len = Math.round(c.len * 2 * k), x = Math.round(c.x * 2), y = Math.round(c.y * 2), x0 = c.dir > 0 ? x - len : x;
    ctx.fillStyle = 'rgba(96,66,30,.2)'; ctx.fillRect(x0, y - 1, len, 1); ctx.fillRect(x0 + 2, y + 1, Math.max(0, len - 4), 1);
    ctx.fillStyle = 'rgba(255,238,196,.16)'; ctx.fillRect(x0 + 1, y, Math.max(0, len - 2), 1);
    if (c.wide) { ctx.fillStyle = 'rgba(96,66,30,.14)'; ctx.fillRect(x - len / 2, y - 3, len, 1); ctx.fillRect(x - len / 2 + 3, y + 3, len - 6, 1); ctx.fillStyle = 'rgba(255,238,196,.1)'; ctx.fillRect(x - len / 2 + 2, y - 2, len - 4, 1); }
  }
  for (const s of B.stains) {
    const age = T - (s.t || 0), x = Math.round(s.x * 2), y = Math.round(s.y * 2), w = s.w * 2;
    if (s.pool) {                                 // a pool: it spreads as the sand takes it, bright in the middle while it is new, with a darker rim
      const grow = 1 - Math.pow(1 - Math.min(1, age / 3.5), 2), rx = Math.max(1.5, s.pool * 2 * (0.3 + 0.7 * grow)), ry = Math.max(1, rx * 0.36);
      const body = age < 1.5 ? '#b3261c' : age < 6 ? '#8e1b14' : age < 16 ? '#76241a' : '#633024', rim = age < 6 ? '#6e1510' : '#55281e';
      for (let yy = -Math.ceil(ry); yy <= Math.ceil(ry); yy++) {
        const q = 1 - (yy * yy) / (ry * ry + 0.5); if (q <= 0) continue;
        const hw = Math.round(rx * Math.sqrt(q) + Math.sin(s.seed + yy * 1.7) * Math.min(1.5, rx * 0.2));
        if (hw < 1) continue;
        if (age > 2.5) { ctx.fillStyle = `rgba(120,52,28,${Math.min(0.22, (age - 2.5) * 0.03).toFixed(3)})`; ctx.fillRect(x - hw - 2, y + yy, hw * 2 + 4, 1); }
        ctx.fillStyle = rim; ctx.fillRect(x - hw, y + yy, hw * 2, 1);
        if (hw > 1) { ctx.fillStyle = body; ctx.fillRect(x - hw + 1, y + yy, hw * 2 - 2, 1); }
      }
      if (age < 5 && rx > 3) { ctx.fillStyle = age < 1.5 ? '#e8584a' : '#b3261c'; ctx.fillRect(x - Math.round(rx * 0.45), y - 1, Math.max(1, Math.round(rx * 0.4)), 1); }      // the wet of it catching the light
      continue;
    }
    if (age > 2.5) { ctx.fillStyle = `rgba(120,52,28,${Math.min(0.2, (age - 2.5) * 0.03).toFixed(3)})`; ctx.fillRect(x - 1, y, w + 2, 2); ctx.fillRect(x, y + 2, w, 1); }
    ctx.fillStyle = age < 1.2 ? '#c22a1e' : age < 5 ? '#8e1b14' : age < 14 ? '#76241a' : '#633024';
    ctx.fillRect(x, y, w, s.tall ? 3 : 2);
    if (age < 1.2) { ctx.fillStyle = '#e8584a'; ctx.fillRect(x, y, 1, 1); }
  }
  for (const l of S.litter) { R(l.x, l.y, 2, 1, l.col); R(l.x, l.y + 1, 2, 1, 'rgba(0,0,0,.18)'); }
  for (const p of B.props) {              // helmets torn off: they spin away, land, and lie there
    const q = Math.min(1, (T - p.t) / 0.5), x = Math.round((p.x0 + (p.x - p.x0) * q) * 2), y = Math.round((p.y0 * 2 - 70) + (p.y * 2 - (p.y0 * 2 - 70)) * q - Math.sin(q * Math.PI) * 14);
    if (q >= 1) R(x - 4, y - 1, 9, 2, 'rgba(0,0,0,.2)');
    R(x - 3, y - 6, 7, 6, p.col); R(x - 3, y - 6, 7, 1, shade(p.col, 1.4)); R(x - 3, y - 6, 1, 6, shade(p.col, 0.68)); R(x + 1, y - 3, 2, 2, '#1c1310'); if (p.crest) R(x - 2, y - 8, 4, 2, p.crest);
  }
  // heat: by day the foot of the wall and the far sand swim a little. Not after dark, nor under cloud, nor in winter,
  // nor while snow lies (the rows are bare sand, and would show through it).
  let hot = true;
  if (typeof yardSky === 'function' && typeof yardWeather === 'function' && typeof sceneClock === 'function') { const sky = yardSky(sceneClock()), wx = yardWeather(sceneClock()); hot = !!sky.sun && sky.night < 0.15 && !(wx.over > 0.5) && !(wx.white > 0.02) && !(typeof sceneSeason === 'function' && sceneSeason() === 3); }
  if (hot && !B.wild && B.light !== 'dusk' && B.shake <= 0.2 && (!B.cam || B.cam.z === 1)) {
    // The rows are taken from the painted backdrop, not from the picture as it stands: drawing a canvas onto itself
    // makes the browser copy the whole of it first, every time, and at twenty rows a frame that was most of the cost
    // of a frame whenever the view was drawn back (the entrance, the verdict, and a fixed view throughout).
    const bg = B._bg;
    if (bg) for (let y = 80; y < 100; y++) {
      const a = Math.sin(T * 3.1 + y * 0.83) * (1 - (y - 80) / 26);
      if (Math.abs(a) > 0.62) ctx.drawImage(bg, 0, y, 428, 1, a > 0 ? 1 : -1, y, 428, 1);
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
