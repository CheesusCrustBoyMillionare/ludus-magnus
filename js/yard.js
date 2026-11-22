'use strict';
// The ludus yard: a living picture of your school on the Ludus tab.
// Buildings grow with their facility levels, the forge with the smith, the outer wall and gate with
// your fame. Staff appear when hired, and your fighters do whatever you have set them to.
// Drawn on a 590x190 grid at 2 canvas pixels per unit, using the arena's fighter sprites.

const YARD = { W: 590, H: 190, S: 2, GY: 128 };
let yardRaf = 0, yardLast = 0;
let yardLayer = null, yardMask = null;      // off-screen canvases: the scene without its sky, and the shape of it
let yardHits = [];          // click targets: { x0, x1, y0, y1, fighter | tab }
let yardPrev = 0;           // when the yard was last drawn, to step the people in it
const yardAgents = {};      // staff and resting fighters who move about: where they are and what they are doing
let yardBirds = null;
let yardForce = null;       // for testing from the console: { weather: 'rain', u: 0.8 } pins the weather and the hour

// Anyone who walks about the yard. He heads for (tx, ty), then waits there.
function yardAgent(key, x, y) {
  return yardAgents[key] || (yardAgents[key] = { gid: +String(key).slice(1) || 0, x, y, tx: x, ty: y, wait: rand(0.5, 3), face: 1, walk: 0, moving: false, act: 'idle', n: 0 });
}
// Returns true once he has arrived and finished waiting, and so needs something new to do.
function agentMove(a, dt, speed) {
  const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
  if (d > 0.8) {
    const s = Math.min(d, speed * dt);
    a.x += dx / d * s; a.y += dy / d * s; if (Math.abs(dx) > 0.5) a.face = dx > 0 ? 1 : -1;
    a.walk += dt * 9; a.moving = true;
    return false;
  }
  a.moving = false; a.wait -= dt;
  return a.wait <= 0;
}

// The weather changes every 75 seconds: mostly fair, sometimes overcast, rain or wind. Like the hour,
// it is only for show. It fades in and out at each change, and rain leaves the ground wet for a while.
function yardWeather(T) {
  const SLOT = 75, i = Math.floor(T / SLOT), p = (T / SLOT) % 1;
  const kind = n => {
    if (n <= 0) return 'clear';
    const h = Math.abs(Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1;
    return h < 0.5 ? 'clear' : h < 0.7 ? 'cloud' : h < 0.87 ? 'rain' : 'wind';
  };
  let k = kind(i), prev = kind(i - 1), amt = k === 'clear' ? 0 : Math.min(1, p / 0.12, (1 - p) / 0.12);
  let wet = Math.max(k === 'rain' ? Math.min(1, p / 0.3) : 0, prev === 'rain' && k !== 'rain' ? Math.max(0, 1 - p / 0.6) : 0);
  if (yardForce && yardForce.weather) { k = yardForce.weather; amt = k === 'clear' ? 0 : 1; wet = k === 'rain' ? 1 : 0; }
  return { kind: k, rain: k === 'rain' ? amt : 0, gust: k === 'wind' ? amt : 0, over: amt * ({ cloud: 0.75, rain: 1, wind: 0.3 }[k] || 0), wet };
}

function yardPerson(ctx, X, Y, d, o) {
  const P = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(d > 0 ? X + x : X - x - w, Y + y, w, h); };
  const skin = o.skin || '#d9a57c', skinD = shade(skin, 0.76), tunicD = shade(o.tunic, 0.72), wood = '#7a5a2a';
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(X - 7, Y - 2, 14, 3);
  const st = o.moving ? (Math.sin(o.walk) > 0 ? 1 : -1) : 0;      // stride
  P(-3 - st, -12, 3, 12 - (st > 0 ? 1 : 0), skinD); P(st, -12, 3, 12 - (st < 0 ? 1 : 0), skin);
  P(-3 - st, -2 - (st > 0 ? 1 : 0), 4, 2, '#6b4526'); P(st, -2 - (st < 0 ? 1 : 0), 5, 2, '#6b4526');
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
    if (o.item === 'bucket') { P(3, -18, 1, 4, '#3a2a1c'); P(1, -14, 6, 5, '#7a5a2a'); P(1, -14, 6, 1, '#5aa0d0'); P(1, -11, 6, 1, '#5e4426'); }
    if (o.item === 'pot') { P(3, -22, 7, 5, '#2e2a28'); P(2, -23, 9, 1, '#4a4440'); P(4, -24, 5, 1, '#e8e0d0'); }
    if (o.item === 'sword') { P(5, -36, 1, 15, '#c1c7cc'); P(4, -22, 3, 1, '#8a6230'); }
    if (o.item === 'broom') { const b = o.sweep ? 2 : 0; P(5 + (b >> 1), -24, 1, 22, wood); P(3 + b, -3, 6, 3, '#c9a763'); P(3 + b, -1, 6, 1, '#a88a4a'); }
  }
}

// The yard turns through a day every four minutes: a long day, a short dusk, night, and dawn.
// It is only for show; it has nothing to do with the game's days.
const YARD_DAY = 240;
const YARD_KEYS = [
  { at: 0.00, bands: ['#e9b497', '#f1cdb0', '#f7e2c8'], tint: '#ffdcc6', night: 0.12, cloud: '#fbe6d4' },   // dawn
  { at: 0.09, bands: ['#8fbcd4', '#a9cfdc', '#c5dfe0'], tint: '#ffffff', night: 0, cloud: '#eef6f8' },      // day
  { at: 0.56, bands: ['#8fbcd4', '#a9cfdc', '#c5dfe0'], tint: '#ffffff', night: 0, cloud: '#eef6f8' },
  { at: 0.66, bands: ['#c9744f', '#e59a66', '#f3c88f'], tint: '#ffbe94', night: 0.2, cloud: '#f6c9a0' },    // dusk
  { at: 0.74, bands: ['#151d3c', '#1f2b54', '#2d3b68'], tint: '#6c7cc0', night: 1, cloud: '#3a4672' },      // night
  { at: 0.92, bands: ['#151d3c', '#1f2b54', '#2d3b68'], tint: '#6c7cc0', night: 1, cloud: '#3a4672' },
  { at: 1.00, bands: ['#e9b497', '#f1cdb0', '#f7e2c8'], tint: '#ffdcc6', night: 0.12, cloud: '#fbe6d4' },
];
function mixHex(a, b, t) {
  const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)], x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
// ---------- one light for every scene ----------
// The yard keeps the hour and the weather (yardSky, yardWeather). The town, the province and the arena ask it,
// so that dusk falls and rain comes on everywhere at once. T here is always the clock of the page, in seconds.
const sceneClock = () => performance.now() / 1000;
// The colour of the hour, at full strength or part of the way from plain daylight.
function sceneTint(sky, k) { return k >= 1 ? sky.tint : mixHex('#ffffff', sky.tint, k); }
// The corners fall away a little, so the eye rests on the middle. Drawn in the scene's own units.
function sceneVignette(ctx, w, h, a) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.5, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  g.addColorStop(0, 'rgba(26,15,6,0)'); g.addColorStop(1, `rgba(26,15,6,${a})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
// Rain across a scene w by h units: slanting streaks, heavier as amt goes to 1.
function sceneRain(ctx, w, h, T, amt, n) {
  if (!(amt > 0)) return;
  ctx.fillStyle = `rgba(200,215,235,${(0.5 * amt).toFixed(3)})`;
  for (let i = 0, m = Math.round((n || 70) * amt); i < m; i++) {
    const x = Math.floor(((i * 97.3 - T * 70) % (w + 30) + (w + 30)) % (w + 30) - 15), y = Math.floor((i * 61.7 + T * 340 + (i % 7) * 13) % (h + 10) - 5);
    ctx.fillRect(x, y, 1, 4); ctx.fillRect(x - 1, y + 4, 1, 2);
  }
}

function yardSky(T) {
  let u = ((T / YARD_DAY) + 0.2) % 1;                         // begin in mid-morning
  if (yardForce && yardForce.u != null) u = yardForce.u;
  let i = 0; while (i < YARD_KEYS.length - 2 && u >= YARD_KEYS[i + 1].at) i++;
  const a = YARD_KEYS[i], b = YARD_KEYS[i + 1], t = (u - a.at) / (b.at - a.at);
  const sunP = u < 0.70 ? u / 0.70 : -1, moonP = u >= 0.70 ? (u - 0.70) / 0.30 : -1;
  const arc = p => [40 + p * 510, 70 - Math.sin(p * Math.PI) * 58];
  const low = sunP >= 0 ? 1 - Math.sin(sunP * Math.PI) : 1;   // 0 at noon, 1 at the horizon
  return {
    bands: a.bands.map((c, k) => mixHex(c, b.bands[k], t)), tint: mixHex(a.tint, b.tint, t), cloud: mixHex(a.cloud, b.cloud, t),
    night: a.night + (b.night - a.night) * t,
    sun: sunP >= 0 ? arc(sunP) : null, sunCol: mixHex('#fbeab0', '#f08a4a', Math.max(0, low * 1.4 - 0.4)), moon: moonP >= 0 ? arc(moonP) : null,
    shadow: { len: Math.round(2 + low * 12), a: 0.2 },
  };
}

function drawYard(cv, T) {
  YARD.S = cv.width / 590;                    // whatever whole number of canvas pixels to the unit the screen calls for (see fitScenes in main.js)
  const main = cv.getContext('2d'), GY = YARD.GY, F = G.fac, t = tier();
  let ctx = main;                           // drawing switches to the scene layer once the sky is done
  ctx.setTransform(YARD.S, 0, 0, YARD.S, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  // names and signs are drawn last, after the light of the hour has been laid over the scene
  const late = [];
  const label = (x, y, text) => late.push(() => {
    ctx.font = 'bold 6px Consolas, monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(text, x + 0.5, y + 0.5);
    ctx.fillStyle = '#f2e6cc'; ctx.fillText(text, x, y);
  });
  // building names sit on a dark plaque so they read against any wall
  const sign = (x, y, text) => late.push(() => {
    ctx.font = 'bold 6px Consolas, monospace'; ctx.textAlign = 'center';
    const w = Math.ceil(ctx.measureText(text).width) + 8;
    R(x - w / 2 - 1, y - 8, w + 2, 11, '#e0aa3e'); R(x - w / 2, y - 7, w, 9, '#241812');
    ctx.fillStyle = '#f2e6cc'; ctx.fillText(text, x, y);
  });
  const sky = yardSky(T), lights = [], fires = [], perches = [];
  const wx = yardWeather(T);
  if (wx.over > 0) {                            // cloud takes the colour out of the sky and the light off the yard
    const grey = mixHex('#8d98a3', '#1a2030', sky.night);
    sky.bands = sky.bands.map(c => mixHex(c, grey, wx.over * 0.8));
    sky.cloud = mixHex(sky.cloud, mixHex('#7f8894', '#2a3248', sky.night), wx.over * 0.7);
    sky.tint = mixHex(sky.tint, mixHex('#aab2c0', '#59669c', sky.night), wx.over * 0.75);
    sky.shadow = { len: sky.shadow.len, a: 0.2 * (1 - wx.over * 0.6) };
  }
  const OUT = '#2a1c14', SHADOW = 'rgba(0,0,0,.3)';
  const pips = (n, max) => '●'.repeat(n) + '○'.repeat(max - n);
  const smoke = (x, y, n, col) => {            // puffs drifting up and to the right
    for (let i = 0; i < n; i++) {
      const p = (T * 0.25 + i / n) % 1;
      ctx.globalAlpha = 0.55 * (1 - p);
      R(x + p * (10 + wx.gust * 34 + wx.rain * 8) + Math.sin(p * 6 + i) * 2, y - p * (34 - wx.gust * 12), 3 + Math.round(p * 4), 3 + Math.round(p * 3), col);
    }
    ctx.globalAlpha = 1;
  };
  yardHits = [];
  const hit = (x0, y0, x1, y1, o) => yardHits.push(Object.assign({ x0, y0, x1, y1 }, o));

  // ---- sky, hills, sun ----
  R(0, 0, 590, 70, sky.bands[0]); R(0, 42, 590, 30, sky.bands[1]); R(0, 60, 590, 14, sky.bands[2]);
  if (sky.night > 0.05) {
    for (let i = 0; i < 46; i++) { ctx.globalAlpha = sky.night * (0.5 + 0.5 * Math.sin(T * 1.7 + i * 2.1)); R((i * 131) % 588, (i * 47) % 58, 1, 1, '#f4f6ff'); }
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = 1 - wx.over * 0.9;
  if (sky.sun) { const [sx, sy] = sky.sun; R(sx - 7, sy - 7, 14, 14, sky.sunCol); R(sx - 10, sy - 4, 20, 8, sky.sunCol); R(sx - 4, sy - 10, 8, 20, sky.sunCol); }
  if (sky.moon) { const [mx, my] = sky.moon; R(mx - 6, my - 6, 12, 12, '#eef0f8'); R(mx - 8, my - 3, 16, 6, '#eef0f8'); R(mx - 3, my - 8, 6, 16, '#eef0f8'); R(mx + 1, my - 5, 6, 9, sky.bands[0]); R(mx - 3, my + 2, 2, 2, '#cfd4e6'); }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 10; i++) {                 // three clouds in fair weather, a sky full of them in foul
    const a = i < 3 ? 1 : clamp(wx.over * 8 - (i - 3), 0, 1);
    if (a <= 0) continue;
    const cx = (T * (3 + i % 4) + i * 210) % 760 - 100, cy = 8 + (i * 13) % 44, big = i >= 3 ? 2 : 1;
    ctx.globalAlpha = a; R(cx, cy, 34 * big, 5 + big, sky.cloud); R(cx + 6, cy - 3, 20 * big, 4, sky.cloud); if (big > 1) R(cx + 14, cy + 6, 40, 3, sky.cloud);
  }
  ctx.globalAlpha = 1;
  if (sky.night < 0.3 && wx.rain < 0.2) {        // now and then a skein of birds crosses the sky
    const q = (T % 48) / 10;
    if (q < 1) for (let i = 0; i < 5; i++) {
      const bx = -20 + q * 640 - Math.abs(i - 2) * 7, by = 20 + Math.sin(q * 5) * 6 + (i - 2) * 4, f = Math.floor(T * 7 + i) % 2 ? -1 : 1;
      R(bx, by, 2, 1, '#2a2a33'); R(bx - 2, by + f, 2, 1, '#2a2a33'); R(bx + 2, by + f, 2, 1, '#2a2a33');
    }
  }

  // Everything under the sky is drawn on its own layer, so the light of the hour can be laid over
  // exactly what is there (roofs and chimneys included) without staining the sky behind it.
  if (!yardLayer || yardLayer.width !== cv.width) {
    yardLayer = document.createElement('canvas'); yardMask = document.createElement('canvas');
    yardLayer.width = yardMask.width = cv.width; yardLayer.height = yardMask.height = cv.height;
  }
  ctx = yardLayer.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(YARD.S, 0, 0, YARD.S, 0, 0); ctx.imageSmoothingEnabled = false;
  for (let x = -30; x < 590; x += 64) { const h = 20 + ((x * 5) % 13); R(x, 72 - h, 90, h, '#93b0a0'); R(x + 14, 68 - h, 58, 5, '#a3bcad'); }      // far hills, paler
  for (let x = -20; x < 590; x += 46) { const h = 14 + ((x * 7) % 11); R(x, 74 - h, 60, h, '#7fa27a'); R(x + 8, 70 - h, 40, 5, '#8fb287'); }
  if (t >= 1) {                                 // a town of some standing has water brought to it
    R(60, 44, 330, 3, '#b7b3a4'); R(60, 44, 330, 1, '#cfcbbc');
    for (let x = 64; x < 388; x += 18) { R(x, 47, 4, 30, '#aaa697'); R(x + 4, 47, 14, 3, '#aaa697'); R(x + 5, 50, 12, 2, '#9c988a'); }
  }
  for (const [cx, ch] of [[36, 30], [164, 24], [232, 34], [306, 26], [444, 32], [462, 22], [488, 28]]) {      // cypresses beyond the wall
    R(cx, 78 - ch + 4, 2, ch, '#3a2a1c');
    for (let q = 0; q < ch; q++) { const w = Math.round(Math.sin(q / ch * Math.PI) * 4) + 1; R(cx + 1 - w, 76 - q, w * 2, 1, q % 3 ? '#35543a' : '#416446'); }
  }
  for (const [rx, rw, rh] of [[520, 26, 12], [548, 30, 16], [500, 18, 9]]) {       // the town's roofs, off toward the arena
    R(rx, 76 - rh, rw, rh, '#d8c9a2'); R(rx - 2, 76 - rh - 4, rw + 4, 4, '#b5522e'); R(rx - 2, 76 - rh - 4, rw + 4, 1, '#cf6a40'); R(rx + 4, 76 - rh + 3, 3, 4, '#5a4334');
  }

  // ---- outer wall: grows grander with fame ----
  const W = [{ c: '#7a5a34', d: '#5e4426', l: '#94703f' }, { c: '#a88f66', d: '#8f7650', l: '#c4ab7c' }, { c: '#b89b6e', d: '#a3875c', l: '#d8c08e' }, { c: '#d6ccb8', d: '#b5aa94', l: '#f0e8d6' }][t];
  R(0, 74, 590, GY - 74, W.c); R(0, 74, 590, 2, W.l);
  if (t === 0) { for (let x = 0; x < 590; x += 8) { R(x, 74, 1, GY - 74, W.d); R(x + 2, 70, 5, 4, W.c); R(x + 3, 68, 3, 2, W.l); } R(0, 98, 590, 2, W.d); }
  else {
    for (let r = 0; r < 9; r++) { const y = 76 + r * 6; R(0, y + 5, 590, 1, W.d); for (let x = (r % 2) * 9; x < 590; x += 18) R(x, y, 1, 5, W.d); }
    if (t >= 2) for (let x = 0; x < 590; x += 14) R(x, 69, 8, 5, W.c);
  }

  R(0, 76, 590, GY - 76, 'rgba(24,14,8,.3)');      // the wall falls into shade so what stands before it shows

  // ---- generic building pieces ----
  const walls = (x, w, h, c) => {
    const y = GY - h, d = shade(c, 0.78);
    R(x + w + 1, y + 6, 6, h - 6, SHADOW);                    // shadow thrown on the wall behind
    R(x - 1, y - 1, w + 2, h + 1, OUT);                       // outline
    R(x, y, w, h, c); R(x, y, 2, h, d); R(x + w - 2, y, 2, h, d);
    for (let yy = y + 7; yy < GY - 2; yy += 7) R(x + 2, yy, w - 4, 1, shade(c, 0.9));
    R(x, GY - 3, w, 3, d);
    return y;
  };
  const roof = (x, y, w, kind) => {
    if (kind === 'thatch') R(x - 4, y - 10, w + 8, 12, OUT); else if (kind === 'tile') R(x - 5, y - 13, w + 10, 15, OUT); else R(x - 3, y - 4, w + 6, 6, OUT);
    if (kind === 'thatch') { R(x - 3, y - 6, w + 6, 7, '#9a7a42'); R(x - 1, y - 9, w + 2, 3, '#b8964e'); for (let xx = x - 2; xx < x + w + 3; xx += 5) R(xx, y - 6, 1, 7, '#7a5e30'); }
    else if (kind === 'tile') { R(x - 4, y - 5, w + 8, 6, '#a8452e'); R(x - 1, y - 9, w + 2, 4, '#b8553a'); R(x + 5, y - 12, w - 10, 3, '#c9684a'); for (let xx = x - 3; xx < x + w + 4; xx += 4) R(xx, y - 5, 1, 6, '#7e3220'); }
    else { R(x - 2, y - 3, w + 4, 4, '#8a6a4a'); R(x - 2, y - 3, w + 4, 1, '#a8855e'); }
  };
  const door = (x, w, h) => { R(x - 1, GY - h - 1, w + 2, h + 1, '#5a4334'); R(x, GY - h, w, h, '#241812'); R(x, GY - h, 1, h, '#3a2a1c'); };
  const win = (x, y) => { R(x - 1, y - 1, 8, 9, '#5a4334'); R(x, y, 6, 7, '#241812'); R(x + 3, y, 1, 7, '#5a4334'); lights.push([x, y]); };
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
    sign(x + w / 2, y - 17, `BARRACKS ${pips(lv, 3)} ${G.roster.length}/${capacity()}`);
    perches.push([x + 22, y - (lv >= 2 ? 12 : 9)], [x + w - 24, y - (lv >= 2 ? 12 : 9)]);
    hit(x, y - 12, x + w, GY, { tab: 'ludus', school: true });
  }
  // ---- infirmary: a cot under an awning, then a hut, then stone, then columns ----
  {
    const lv = F.infirmary, x = 172, w = [36, 44, 52, 58][lv], h = [38, 48, 58, 66][lv];
    let y;
    if (lv === 0) {
      // a healer's tent: canvas walls, a green-striped awning, a cot inside
      y = GY - h;
      R(x + w + 1, y + 10, 6, h - 10, SHADOW);
      R(x - 1, y + 5, w + 2, h - 5, OUT); R(x, y + 6, w, h - 6, '#efe6cf'); R(x, y + 6, 3, h - 6, '#cfc4a6'); R(x + w - 3, y + 6, 3, h - 6, '#cfc4a6');
      R(x + 8, y + 13, w - 16, h - 13, '#33241c');
      R(x - 5, y - 1, w + 10, 9, OUT); R(x - 4, y, w + 8, 7, '#efe6cf'); for (let xx = x - 4; xx < x + w + 4; xx += 8) R(xx, y, 4, 7, '#3f8a3a');
      R(x + 10, GY - 10, w - 20, 3, '#f2ecd8'); R(x + 10, GY - 7, 2, 7, '#7a5a2a'); R(x + w - 12, GY - 7, 2, 7, '#7a5a2a'); R(x + 10, GY - 12, 5, 2, '#e8d7b0');
    } else {
      y = walls(x, w, h, lv >= 2 ? '#f6f1e4' : '#efe6cf'); roof(x, y, w, lv >= 2 ? 'tile' : 'thatch');
      R(x + 2, y + 2, w - 4, 3, '#3f8a3a');                                           // the healers' green band
      door(x + w / 2 - 6, 12, 30); win(x + 6, GY - 30); if (lv >= 2) win(x + w - 12, GY - 30);
      if (lv >= 3) { column(x - 3, GY - 40, 40); column(x + w - 2, GY - 40, 40); R(x - 4, GY - 43, w + 8, 4, '#f0e8d6'); }
      R(x + w / 2 - 5, y + 6, 10, 10, '#f2ecd8'); R(x + w / 2 - 1, y + 7, 1, 8, '#3f8a3a'); R(x + w / 2 - 2, y + 9, 3, 1, '#3f8a3a'); R(x + w / 2 - 1, y + 12, 3, 1, '#3f8a3a');
    }
    sign(x + w / 2, y - (lv ? (lv >= 2 ? 19 : 16) : 7), 'INFIRMARY ' + pips(lv, 3) + (G.roster.some(g => g.injury > 0 && !g.away) ? ` - ${G.roster.filter(g => g.injury > 0 && !g.away).length} HURT` : ''));
    hit(x, y - 12, x + w, GY, { tab: 'ludus', school: true });
  }
  // ---- baths: a trough, then a bathhouse, then a dome, then a grand dome with columns ----
  {
    const lv = F.baths, x = 244, w = [34, 46, 58, 70][lv], h = [36, 44, 52, 60][lv];
    let y = GY - h;
    if (lv === 0) {       // a washing place: a stone basin under a blue-striped canopy
      R(x + w + 1, y + 10, 6, h - 10, SHADOW);
      R(x - 1, y + 5, w + 2, h - 16, OUT); R(x, y + 6, w, h - 18, '#d3e6ec'); R(x, y + 6, 3, h - 18, '#b3ccd4');
      R(x, y + 4, 2, h - 4, '#5a4334'); R(x + w - 2, y + 4, 2, h - 4, '#5a4334');
      R(x - 5, y - 1, w + 10, 9, OUT); R(x - 4, y, w + 8, 7, '#eef6f8'); for (let xx = x - 4; xx < x + w + 4; xx += 8) R(xx, y, 4, 7, '#3d86c8');
      R(x + 1, GY - 13, w - 2, 13, OUT); R(x + 2, GY - 12, w - 4, 12, '#c9c0aa'); R(x + 2, GY - 12, w - 4, 2, '#e4dcc8');
      R(x + 5, GY - 10, w - 10, 5, '#3d9be0'); R(x + 6, GY - 10, 8, 1, '#c8e8f8'); R(x + w - 14, GY - 8, 6, 1, '#c8e8f8');
    }
    else {
      y = walls(x, w, h, '#dfeaee'); R(x - 3, y - 4, w + 6, 6, OUT); R(x - 2, y - 3, w + 4, 4, '#f4fafb');
      R(x + 2, y + 3, w - 4, 3, '#3d86c8');                                            // the bathers' blue band
      if (lv >= 2) { const dw = w - 20; for (let i = 0; i < 6; i++) R(x + 10 + i * 2, y - 5 - i * 3, dw - i * 4, 3, i % 2 ? '#c7d3d6' : '#b3c3c8'); }
      door(x + w / 2 - 6, 12, 30); R(x + 6, GY - 26, 8, 2, '#5aa0d0'); R(x + w - 14, GY - 26, 8, 2, '#5aa0d0');
      if (lv >= 3) { column(x - 3, GY - 40, 40); column(x + w - 2, GY - 40, 40); column(x + 12, GY - 40, 40); column(x + w - 17, GY - 40, 40); }
      smoke(x + w / 2, y - (lv >= 2 ? 22 : 4), 3 + lv, '#f4f8f8');
    }
    sign(x + w / 2, y - (lv >= 2 ? 32 : lv ? 12 : 7), 'BATHS ' + pips(lv, 3));
    hit(x, y - 12, x + w, GY, { tab: 'ludus', school: true });
  }
  // ---- kitchen: what is over the fire depends on the rations ----
  {
    const x = 328, r = G.ration;
    // a cookhouse: whitewashed wall, tiled roof and a dark hearth alcove, so the fire has something to burn against
    { const kx = x - 12, kw = 60, kh = 46, ky = GY - kh;
      R(kx + kw + 1, ky + 6, 6, kh - 6, SHADOW); R(kx - 1, ky - 1, kw + 2, kh + 1, OUT);
      R(kx, ky, kw, kh, '#ecdcb8'); R(kx, ky, 3, kh, '#cdbb92'); R(kx + kw - 3, ky, 3, kh, '#cdbb92'); R(kx, GY - 3, kw, 3, '#cdbb92');
      R(kx + 2, ky + 2, kw - 4, 3, '#c2552e');
      roof(kx, ky, kw, 'tile'); perches.push([kx + 22, ky - 12]);
      R(x - 2, GY - 36, 32, 36, OUT); R(x - 1, GY - 35, 30, 35, '#3a2a22');
      R(kx + kw - 16, GY - 31, 12, 1, '#7a5a2a'); R(kx + kw - 15, GY - 35, 3, 4, '#b0603a'); R(kx + kw - 10, GY - 34, 4, 3, '#8d9094'); }
    R(x, GY - 6, 26, 6, '#6a6058'); R(x + 2, GY - 8, 22, 3, '#7c7268');
    const fl = Math.sin(T * 9) > 0 ? 1 : 0;
    R(x + 8, GY - 12 - fl, 10, 5 + fl, '#e2702a'); R(x + 10, GY - 14 - fl, 6, 4, '#f5c04a'); R(x + 12, GY - 16, 2, 3, '#fff0b0');
    R(x + 3, GY - 30, 2, 24, '#5a4334'); R(x + 21, GY - 30, 2, 24, '#5a4334'); R(x + 3, GY - 30, 20, 2, '#5a4334');
    if (r === 2) { R(x + 6, GY - 26, 14, 6, '#8a4a2a'); R(x + 6, GY - 26, 14, 2, '#b06a3a'); R(x + 4, GY - 24, 18, 1, '#3a2a1c'); }
    else { R(x + 8, GY - 27, 10, 8, '#2e2a28'); R(x + 7, GY - 28, 12, 2, '#4a4440'); if (r === 1) R(x + 9, GY - 28, 8, 1, '#c9a763'); }
    if (r >= 1) { R(x + 30, GY - 14, 14, 2, '#7a5a2a'); R(x + 31, GY - 12, 2, 12, '#7a5a2a'); R(x + 41, GY - 12, 2, 12, '#7a5a2a'); R(x + 32, GY - 18, 5, 4, '#d9b877'); R(x + 38, GY - 17, 4, 3, '#d9b877'); }
    if (r === 2) { R(x - 8, GY - 16, 6, 16, '#b0603a'); R(x - 7, GY - 20, 4, 4, '#b0603a'); R(x - 8, GY - 16, 1, 16, '#8a4428'); }
    smoke(x + 13, GY - 32, 4, '#d8d8d8');
    fires.push([x + 13, GY - 12, 26]);
    sign(x + 18, GY - 63, 'KITCHEN: ' + RATIONS[r].name.toUpperCase());
    hit(x - 12, GY - 60, x + 48, GY, { tab: 'facilities' });
  }
  // ---- forge: an anvil under a lean-to grows into an armourer's workshop ----
  {
    const lv = G.smith ? G.smith.level : 0, x = 392, w = [38, 46, 54, 60, 72][lv], h = [38, 46, 54, 60, 66][lv];
    let y = GY - h;
    if (lv === 0) {       // a lean-to: soot-black planks behind, a slatted roof above
      R(x + w + 1, y + 10, 6, h - 10, SHADOW);
      R(x - 1, y + 5, w + 2, h - 5, OUT); R(x, y + 6, w, h - 6, '#4a3a36'); for (let xx = x + 5; xx < x + w; xx += 6) R(xx, y + 6, 1, h - 6, '#352825');
      R(x - 5, y - 1, w + 10, 9, OUT); for (let i = 0; i < 7; i++) R(x - 4, y + i, w + 8, 1, i % 2 ? '#6a4a34' : '#8a6444');
      R(x, y + 6, 2, h - 6, '#2e221e'); R(x + w - 2, y + 6, 2, h - 6, '#2e221e');
    }
    else {
      y = walls(x, w, h, lv >= 2 ? '#8a4a3a' : '#6e5248'); roof(x, y, w, lv >= 3 ? 'tile' : 'flat');
      R(x + 2, y + 2, w - 4, 3, '#e2702a');                                           // the smiths' ember band
      R(x + w - 14, y - 22, 9, 22, '#6a4a3c'); R(x + w - 15, y - 24, 11, 3, '#4a3428'); smoke(x + w - 10, y - 26, 3 + lv, '#6a6a6a');
      if (lv >= 4) { R(x + 6, y - 16, 8, 16, '#6a4a3c'); R(x + 5, y - 18, 10, 3, '#4a3428'); smoke(x + 9, y - 20, 4, '#6a6a6a'); }
      R(x + 5, GY - 34, w - 22, 34, '#1c130f');                                         // the open front
      for (let i = 0; i < Math.min(4, lv); i++) R(x + w - 9, GY - 40 + i * 8, 5, 6, ['#c1c7cc', '#e8b545', '#b77be8', '#f0705e'][i]);   // finished pieces on the wall
    }
    const glow = 0.6 + Math.sin(T * 5) * 0.2;
    R(x + 7, GY - 14, 12, 14, '#4a3a34'); R(x + 9, GY - 18, 8, 6, '#e2702a'); ctx.globalAlpha = glow; R(x + 10, GY - 20, 6, 5, '#f5c04a'); ctx.globalAlpha = 1;
    R(x + 24, GY - 9, 10, 3, '#55565c'); R(x + 26, GY - 6, 6, 6, '#3c3d42'); R(x + 22, GY - 10, 14, 2, '#6c6d74');   // anvil
    fires.push([x + 13, GY - 16, 24]);
    sign(x + w / 2, y - (lv ? (lv >= 3 ? 34 : 32) : 7), 'FORGE ' + pips(lv, 4));
    hit(x, y - 12, x + w, GY + 4, { tab: 'smith' });
  }
  // ---- gate: banners multiply with fame ----
  {
    const x = 506;
    R(x, GY - 62, 62, 62, W.l); R(x, GY - 62, 2, 62, W.d); R(x + 60, GY - 62, 2, 62, W.d); R(x - 2, GY - 66, 66, 5, W.c); R(x - 2, GY - 66, 66, 1, W.l);
    R(x + 14, GY - 44, 34, 44, '#3a2a1c'); R(x + 16, GY - 42, 30, 42, '#5a4030'); R(x + 30, GY - 42, 2, 42, '#3a2a1c');
    for (let yy = GY - 36; yy < GY; yy += 10) R(x + 16, yy, 30, 1, '#3a2a1c');
    R(x + 12, GY - 48, 38, 4, W.d);
    fires.push([x + 6, GY - 40, 14], [x + 56, GY - 40, 14]);       // torches either side of the gate
    const banner = (bx) => { R(bx, GY - 60, 8, 12, '#c23b2e'); R(bx, GY - 60, 2, 12, '#7e241c'); R(bx, GY - 48, 3, 3, '#c23b2e'); R(bx + 5, GY - 48, 3, 3, '#c23b2e'); R(bx + 3, GY - 57, 2, 4, '#e8b545'); };
    banner(x + 3); banner(x + 51);
    const champ = typeof titleYours === 'function' && titleYours();      // a man of yours holds the championship: gold flies over the gate
    if (t >= 2 || champ) { const fw = 12 + Math.round(Math.sin(T * (3 + wx.gust * 7)) * (1 + wx.gust)); R(x + 27, GY - 78, 2, 14, '#5a4334'); R(x + 29, GY - 78, fw, 7, champ ? '#e8b545' : '#c23b2e'); if (champ) { R(x + 29, GY - 78, fw, 1, '#fff0b0'); R(x + 32, GY - 76, 4, 3, '#a8261c'); } }
    if (t >= 3) { R(x + 26, GY - 61, 10, 9, '#e8b545'); R(x + 28, GY - 59, 6, 5, '#f8dc88'); }
    { const n = Math.min(5, typeof trophies === 'function' ? trophies() : 0);      // festival crowns, hung under the lintel
      for (let i = 0; i < n; i++) { const wx0 = x + 15 + i * 7, wy = GY - 53; R(wx0, wy, 4, 1, '#6f8f48'); R(wx0 - 1, wy + 1, 1, 3, '#6f8f48'); R(wx0 + 4, wy + 1, 1, 3, '#6f8f48'); R(wx0, wy + 4, 4, 1, '#5d7f3f'); R(wx0 + 1, wy + 5, 2, 1, '#a02d22'); } }
    sign(x + 31, GY - 84 + (t >= 2 || champ ? 0 : 10), TIERS[t].name.toUpperCase());
    if (isGamesDay() && G.bouts) sign(x + 31, GY - 24, G.bouts.some(b => !b.done) ? 'GAMES TODAY' : 'THE GAMES ARE OVER');
    else if (G.festival && G.festival.day > G.day && G.festival.day - G.day <= 5) sign(x + 31, GY - 24, `FESTIVAL IN ${G.festival.day - G.day} DAY${G.festival.day - G.day === 1 ? '' : 'S'}`);
    hit(x, GY - 70, x + 62, GY, { tab: 'arena' });
    perches.push([x + 20, GY - 66], [150, t === 0 ? 68 : t >= 2 ? 69 : 74], [470, t === 0 ? 68 : t >= 2 ? 69 : 74], [300, GY + 12, 1], [356, GY + 17, 1], [132, GY + 18, 1]);
  }

  // ---- the yard ----
  R(0, GY, 590, YARD.H - GY, '#d9b877'); R(0, GY, 590, 3, 'rgba(60,35,10,.3)'); R(0, GY + 3, 590, 3, 'rgba(60,35,10,.12)');
  {
    const oval = (cx, cy, rx, ry, c) => { ctx.fillStyle = c; for (let yy = -ry; yy <= ry; yy++) { const hw = Math.round(rx * Math.sqrt(1 - (yy * yy) / (ry * ry))); ctx.fillRect(Math.round(cx - hw), Math.round(cy + yy), hw * 2, 1); } };
    for (let i = 0; i < 12; i++) oval(30 + (i * 149) % 540, GY + 14 + (i * 37) % 40, 26 + (i % 4) * 10, 3 + (i % 3) * 2, i % 3 ? 'rgba(255,244,205,.08)' : 'rgba(90,60,20,.07)');      // lights and darks in the sand
    R(0, GY + 6, 590, 7, 'rgba(255,244,205,.10)'); for (let x = 0; x < 590; x += 7) R(x + (x % 3), GY + 8 + (x % 4), 3, 1, 'rgba(120,85,40,.14)');      // the way worn along the doors
    R(0, GY, 590, 3 + Math.round(sky.shadow.len * 0.9), `rgba(50,28,8,${(0.1 + sky.shadow.len * 0.008).toFixed(3)})`);      // the buildings' shade, longer when the sun is low
    for (let i = 0; i < 46; i++) {              // grass and weeds where the wall meets the ground
      const x = (i * 131) % 586, tall = i % 5 === 0;
      R(x, GY - (tall ? 4 : 2), 1, tall ? 5 : 3, '#5f7f3f'); R(x + 1, GY - 1, 1, 2, '#7a9a4b'); if (tall) { R(x - 1, GY - 2, 1, 3, '#4f6f34'); R(x, GY - 5, 1, 1, i % 2 ? '#e8a0a0' : '#f2e6a0'); }
    }
    for (let i = 0; i < 26; i++) { const x = (i * 211 + 40) % 580, y = GY + 16 + (i * 29) % 42; R(x, y, 2, 1, '#a8905c'); R(x, y - 1, 1, 1, '#c8b078'); }      // pebbles
  }
  for (let i = 0; i < 90; i++) { const sx = (i * 97) % 588, sy = GY + 6 + (i * 53) % (YARD.H - GY - 8); R(sx, sy, 1 + (i % 3), 1, i % 2 ? '#c9a763' : '#e6c98a'); }
  if (wx.wet > 0) {
    R(0, GY, 590, YARD.H - GY, `rgba(70,45,20,${(0.22 * wx.wet).toFixed(3)})`);
    const pc = mixHex('#a88a58', sky.bands[2], 0.55), pl = mixHex('#c8b078', sky.bands[1], 0.7);
    for (const [px, py, pw] of [[70, 172, 26], [180, 183, 34], [300, 174, 30], [412, 181, 28], [522, 169, 24], [244, 151, 18], [470, 186, 22]]) {
      const w = Math.round(pw * wx.wet); if (w < 4) continue;
      R(px - w / 2, py, w, 2, pc); R(px - w / 2 + 2, py + 2, w - 4, 1, pc); R(px - w / 4, py, Math.round(w / 4), 1, pl);
    }
  }
  const gl = F.ground;
  if (gl >= 2) { for (let i = 0; i < 44; i++) { const a = i / 44 * Math.PI * 2; R(300 + Math.cos(a) * 130, 160 + Math.sin(a) * 20, 3, 1, '#f0dca8'); } }
  const posts = [[214, 150], [274, 152], [334, 150], [394, 153]].slice(0, gl + 1);
  const drawPost = ([px, py]) => { ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(px - 5, py - 1, 10, 2); R(px - 2, py - 34, 4, 34, '#7a5a2a'); R(px - 2, py - 34, 1, 34, '#5e4426'); R(px - 6, py - 26, 12, 2, '#7a5a2a'); R(px - 2, py - 36, 4, 2, '#94703f'); if (gl >= 2) { R(px - 3, py - 20, 6, 8, '#a8452e'); R(px - 2, py - 18, 4, 4, '#e8b545'); } };
  if (gl >= 1) { R(452, 148, 2, 22, '#5e4426'); R(470, 148, 2, 22, '#5e4426'); R(450, 152, 24, 2, '#7a5a2a'); for (let i = 0; i < 4; i++) R(455 + i * 5, 136, 1, 18, i % 2 ? '#c1c7cc' : '#7a5a2a'); }
  if (gl >= 3) { R(476, GY - 6, 14, 6, '#c9c0aa'); R(479, GY - 30, 8, 24, '#d6ccb8'); R(480, GY - 37, 6, 7, '#d6ccb8'); R(479, GY - 30, 2, 24, '#b5aa94'); R(488, GY - 40, 1, 34, '#b5aa94'); R(480, GY - 39, 6, 2, '#a8452e'); }
  sign(300, YARD.H - 4, 'TRAINING GROUND ' + pips(gl, 3) + (typeof regimen === 'function' && G.regimen !== undefined && G.regimen !== 1 ? ` - ${REGIMENS[G.regimen].name.toUpperCase()} REGIMEN` : ''));
  hit(190, GY + 8, 420, YARD.H, { tab: 'ludus', school: true, low: true });

  // ---- who is where ----
  const names = [];
  const things = posts.map(p => ({ y: p[1], draw: () => drawPost(p) }));
  {
    const shadow = (x, y, w) => { ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x - 1, y - 1, w + 2 + Math.round(sky.shadow.len / 3), 2); };
    const jar = (x, y, c) => { R(x - 2, y - 9, 5, 8, c); R(x - 1, y - 12, 3, 3, c); R(x - 3, y - 11, 1, 3, shade(c, 0.7)); R(x + 3, y - 11, 1, 3, shade(c, 0.7)); R(x - 2, y - 9, 1, 8, shade(c, 0.8)); R(x - 1, y - 1, 3, 1, shade(c, 0.6)); };
    // the stores: jars of oil and wine, more of them the better the house eats
    things.push({ y: GY + 3, draw: () => { shadow(446, GY + 3, 8 + G.ration * 7); for (let i = 0; i <= G.ration + 1; i++) jar(449 + i * 7, GY + 3 - (i % 2), i % 2 ? '#b8703c' : '#c98a4a'); } });
    // a handcart and a heap of straw against the wall by the gate
    things.push({ y: GY + 2, draw: () => {
      shadow(472, GY + 2, 30);
      R(474, GY - 9, 22, 6, '#7a5a34'); R(474, GY - 9, 22, 1, '#94703f'); R(472, GY - 4, 30, 1, '#5e4426'); R(496, GY - 6, 8, 1, '#5e4426');
      R(478, GY - 5, 6, 6, '#3a2a1c'); R(479, GY - 4, 4, 4, '#6b4f2c'); R(480, GY - 3, 2, 2, '#3a2a1c');
      R(476, GY - 14, 18, 5, '#d9c070'); R(478, GY - 16, 14, 2, '#e6d088'); for (let i = 0; i < 6; i++) R(477 + i * 3, GY - 13 + (i % 2), 1, 3, '#b89a4a');
    } });
    if (sky.night < 0.5 && wx.rain < 0.3) {       // hens about the kitchen door, by day and in the dry
      for (let i = 0; i < 3; i++) {
        const ph = T * 0.35 + i * 2.1, hx = 340 + Math.sin(ph) * 16 + i * 14, hy = GY + 9 + i * 4 + Math.round(Math.sin(ph * 1.7) * 2), d = Math.cos(ph) > 0 ? 1 : -1, peck = Math.sin(T * 3 + i * 1.3) > 0.6 ? 1 : 0;
        things.push({ y: hy, draw: () => {
          ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(hx - 3, hy - 1, 6, 1);
          R(hx - 2, hy - 4, 5, 3, i === 1 ? '#8a5a32' : '#f1ead8'); R(hx - 3 * d - (d < 0 ? 0 : 1), hy - 5, 2, 2, i === 1 ? '#6b4526' : '#d8d0bc');      // body and tail
          R(hx + 2 * d, hy - 6 + peck * 2, 2, 2, i === 1 ? '#8a5a32' : '#f1ead8'); R(hx + 2 * d + (d > 0 ? 2 : -1), hy - 5 + peck * 2, 1, 1, '#e3b04a'); R(hx + 2 * d, hy - 7 + peck * 2, 1, 1, '#c23b2e');
          R(hx - 1, hy - 1, 1, 1, '#e3b04a'); R(hx + 1, hy - 1, 1, 1, '#e3b04a');
        } });
      }
    }
    {                                           // the yard dog: lies by the barracks door, lifts his head by day, sleeps at night
      const dx = 126, dy = GY + 13, awake = sky.night < 0.5, wag = awake && Math.sin(T * 7) > 0 ? 1 : 0, look = awake && Math.sin(T * 0.4) > 0.3;
      things.push({ y: dy, draw: () => {
        ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(dx - 8, dy - 1, 18, 2);
        R(dx - 6, dy - 5, 12, 4, '#8a6a4a'); R(dx - 6, dy - 2, 12, 1, '#6b4f36'); R(dx - 5, dy - 6, 9, 1, '#9a7a58');
        R(dx - 9, dy - 4 - wag, 3, 1, '#8a6a4a'); R(dx - 10, dy - 5 - wag, 1, 1, '#8a6a4a');                    // tail
        R(dx + 5, dy - (look ? 9 : 6), 5, 4, '#8a6a4a'); R(dx + 9, dy - (look ? 7 : 4), 2, 2, '#6b4f36'); R(dx + 5, dy - (look ? 10 : 7), 2, 2, '#6b4f36');      // head, muzzle, ear
        if (awake) R(dx + 8, dy - (look ? 8 : 5), 1, 1, '#1c1310');
        R(dx + 4, dy - 2, 4, 1, '#9a7a58'); R(dx - 4, dy - 2, 3, 1, '#9a7a58');                                 // paws
      } });
    }
  }
  {
    // the school's record, chalked on a board by the gate
    things.push({ y: GY + 1, draw: () => { R(468, GY - 46, 34, 16, '#3a2a1c'); R(470, GY - 44, 30, 12, '#2a2a2a'); for (let i = 0; i < Math.min(10, G.tally.wins); i++) R(472 + (i % 5) * 3 + Math.floor(i / 5) * 0, GY - 42 + Math.floor(i / 5) * 5, 1, 4, '#e8e2d2'); for (let i = 0; i < Math.min(5, G.tally.losses); i++) R(490 + i * 2, GY - 42, 1, 4, '#c23b2e'); } });
    sign(485, GY - 50, `${G.tally.wins} WON - ${G.tally.losses} LOST` + ((G.streak || 0) >= 2 ? ` - ${G.streak} RUNNING` : ''));
    // the house gods in their niche on the wall, lit once you have built them a shrine
    if ((G.fac.shrine || 0) >= 1) { things.push({ y: GY, draw: () => { R(377, GY - 34, 12, 16, OUT); R(378, GY - 33, 10, 14, '#d8cdb6'); R(380, GY - 30, 6, 9, '#3a2a1c'); R(382, GY - 28, 2, 5, '#e8e2d2'); R(378, GY - 36, 10, 3, '#b8553a'); R(381, GY - 22, 4, 2, '#e8b545'); } }); fires.push([383, GY - 24, 8]); }
    // a well in the corner of the yard
    things.push({ y: 176, draw: () => { ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(538, 175, 26, 2); R(540, 166, 22, 10, '#b5aa94'); R(540, 166, 22, 2, '#d6ccb8'); R(543, 168, 16, 3, '#2a3a44'); for (let q = 0; q < 4; q++) R(541 + q * 6, 171, 1, 5, '#9a8e7c'); R(541, 150, 2, 16, '#6b4f2c'); R(559, 150, 2, 16, '#6b4f2c'); R(539, 148, 24, 3, '#7a5a34'); R(550, 151, 1, 10, '#c9b890'); R(548, 160, 5, 5, '#7a5a2a'); R(548, 160, 5, 1, '#5aa0d0'); } });
    // a mule at the rail by the gate, once there are stables to keep one
    if ((G.fac.stables || 0) >= 1) things.push({ y: GY + 9, draw: () => { const mx = 578, my = GY + 9, b = '#8a6a4a', k = '#5e4a34', tail = Math.sin(T * 3) > 0.6 ? 1 : 0;
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(mx - 10, my - 1, 20, 2);
      R(mx - 8, my - 13, 16, 7, b); R(mx - 8, my - 13, 16, 1, '#a8855e'); for (const lx of [-7, -3, 3, 6]) R(mx + lx, my - 6, 2, 6, k);
      R(mx - 11, my - 18, 4, 7, b); R(mx - 15, my - 20, 6, 4, b); R(mx - 10, my - 23, 1, 3, k); R(mx - 13, my - 23, 1, 3, k); R(mx - 15, my - 18, 2, 2, '#e8dcc0'); R(mx + 8, my - 12, 1, 5 + tail, k);
      R(mx - 3, my - 15, 8, 3, '#a8452e'); R(568, my - 14, 1, 14, '#5e4426'); } });
    // someone sent by a patron waits inside the gate when you are asked for by name, or asked a favour
    { const asked = (G.contracts || []).find(c => c.asked), req = G.request && !G.request.done ? G.request : null, k = asked ? asked.patron : req ? req.patron : null;
      if (k && sky.night < 0.7) { const c = k === 'temple' ? '#f1ead8' : k === 'guild' ? '#c9a21e' : '#7a2a8a';
        things.push({ y: GY + 13, draw: () => yardPerson(ctx, 522, GY + 13, -1, { tunic: c, hair: '#2a1c14', item: 'scroll' }) });
        label(522, GY + 22, k === 'temple' ? 'from the Temple' : k === 'guild' ? 'from the Guild' : 'from the Magistrate'); } }
  }
  const place = (g, x, y, o) => {
    things.push({ y, draw: () => {
      drawSprite(ctx, Object.assign({ x, y, facing: 1, g, team: 0, moving: false, walk: 0, clock: T + g.id, atkAnim: 0, flash: 0, down: false, snare: 0, shadow: sky.shadow }, o));
      if (g.id === ui.sel) { R(x - 2, y - 52, 5, 2, '#e8b545'); R(x - 1, y - 50, 3, 1, '#e8b545'); R(x, y - 49, 1, 1, '#e8b545'); }
      // a name is skipped when it would sit on top of one already drawn; the selected fighter always gets his
      const half = g.name.length * 1.9 + 2, clash = names.some(n => Math.abs(n.x - x) < n.half + half && Math.abs(n.y - y) < 8);
      if (g.id === ui.sel || !clash) { label(x, y + 9, g.name); names.push({ x, y, half }); }
    } });
    hit(x - 10, y - 46, x + 10, y + 10, { fighter: g.id });
  };
  const strike = (off, every) => { if ((T + off * 3) % 9 > 7.5) return {};      // a breather
    const p = ((T + off) / every) % 1; return { windup: p < 0.22, windP: Math.min(1, p / 0.22), atkAnim: p >= 0.22 && p < 0.6 ? 1 - (p - 0.22) / 0.38 : 0 }; };
  const by = k => G.roster.filter(g => !g.away && (g.injury > 0 ? 'hurt' : g.activity) === k);
  by('hurt').forEach((g, i) => place(g, 186 + i * 20, 141 + (i % 2) * 5, { falling: true, down: true }));
  by('str').concat(by('skl')).forEach((g, i) => {
    const p = posts[i % posts.length], right = Math.floor(i / posts.length) % 2;
    place(g, p[0] + (right ? 13 : -13), p[1] + 1, Object.assign({ facing: right ? -1 : 1 }, strike(g.id * 0.37, g.activity === 'str' ? 1.5 : 1.0)));
  });
  by('agi').forEach((g, i) => {
    const p = ((T * 0.11 + i * 0.31 + g.id * 0.13) % 1) * 2, f = p < 1 ? p : 2 - p;
    place(g, 150 + f * 300, 176 + (i % 2) * 6, { facing: p < 1 ? 1 : -1, moving: true, walk: T * 9 + g.id });
  });
  by('end').forEach((g, i) => place(g, 444 + (i % 3) * 22 - Math.floor(i / 3) * 10, 168 + Math.floor(i / 3) * 10, { cheer: Math.sin(T * 2.2 + g.id) > 0 ? T + g.id : 0 }));
  by('teach').forEach((g, i) => { const p = posts[i % posts.length]; place(g, p[0] + (i % 2 ? 26 : -26), p[1] + 8, { facing: i % 2 ? -1 : 1, cheer: Math.sin(T * 1.6 + g.id) > 0.4 ? T + g.id : 0 }); });
  const sp = by('spar');
  sp.forEach((g, i) => {
    const pair = Math.floor(i / 2), left = i % 2 === 0, cx = 250 + pair * 84, alone = left && i === sp.length - 1;
    place(g, cx + (left ? -12 : 12), 170 + (pair % 2) * 6, Object.assign({ facing: left ? 1 : -1 }, alone ? strike(g.id, 1.4) : strike(pair * 0.5 + (left ? 0 : 0.6), 1.2)));
  });

  // ---- people going about their day ----
  const dt = clamp(T - yardPrev, 0, 0.1); yardPrev = T;
  const night = sky.night > 0.6, wetDay = wx.rain > 0.3, folk = [];
  // staff walk a round of stops; at night they keep to the first of them
  const staffer = (key, look, route, speed) => {
    const a = yardAgent(key, route[0].x, route[0].y);
    if (a.n >= route.length) a.n = 0;
    if (agentMove(a, dt, speed || 16)) {
      a.n = night ? 0 : (a.n + 1) % route.length;
      const s = route[a.n]; a.tx = s.x + (a.n ? rand(-3, 3) : 0); a.ty = s.y; a.wait = night ? 4 : rand(s.wait * 0.7, s.wait * 1.3);
    }
    const s = route[a.n];
    if (s.gone && !a.moving) return a;                 // out of the gate on an errand
    folk.push(a);
    things.push({ y: a.y, draw: () => yardPerson(ctx, Math.round(a.x), Math.round(a.y), a.moving ? a.face : (s.face || a.face),
      Object.assign({ moving: a.moving, walk: a.walk, item: s.item }, look, s.pose ? s.pose(a) : null)) });
    return a;
  };
  const hurtMen = by('hurt'), forgeX = 392;
  if (G.staff.cook) staffer('cook', { tunic: '#b9b09a', apron: '#f2ecd8', hair: '#5a3a22' }, [
    { x: 316, y: GY + 6, wait: 9, item: 'ladle', face: 1 }, { x: 72, y: GY + 9, wait: 2.5, item: 'pot' },
    { x: 316, y: GY + 6, wait: 7, item: 'ladle', face: 1 }, { x: 264, y: GY + 9, wait: 2.5, item: 'bucket' }]);
  if (G.staff.medicus) staffer('medicus', { tunic: '#f2ecd8', hair: '#3a2a1c' }, [
    { x: 168, y: GY + 5, wait: 7, item: 'bag', face: 1 },
    hurtMen.length ? { x: 176, y: 144, wait: 4, item: 'bag', face: 1 } : { x: 96, y: GY + 9, wait: 3, item: 'bag' }]);
  if (G.staff.scout) staffer('scout', { tunic: '#4a6a3a', hair: '#2a1c14' }, [
    { x: 498, y: GY + 8, wait: 7, item: 'scroll', face: -1 }, { x: 537, y: GY + 2, wait: 9, gone: true },
    { x: 498, y: GY + 8, wait: 3, item: 'scroll', face: -1 }, { x: 112, y: GY + 10, wait: 4, item: 'scroll' }]);
  if (G.staff.doctore) staffer('doctore', { tunic: '#8a3a2a', hair: '#c9c2b2' },
    [{ x: 152, y: 149, wait: 4, item: 'staff', face: 1 }].concat(posts.map((p, i) => ({ x: p[0] + (i % 2 ? 30 : -30), y: p[1] + 4, wait: 5, item: 'staff', face: i % 2 ? -1 : 1 }))), 13);
  {
    const a = staffer('smith', { tunic: '#6b5a48', apron: '#4a3323', hair: '#1e1612', skin: '#c9966c' }, [
      { x: forgeX + 16, y: GY + 3, wait: 16, item: 'hammer', face: 1, pose: m => ({ swing: m.moving ? 0.9 : (T * 1.1) % 1 }) },
      gl >= 1 ? { x: 444, y: 154, wait: 2.5, item: 'sword', face: 1 } : { x: 272, y: GY + 9, wait: 2.5, item: 'sword' }]);
    const sw = (T * 1.1) % 1;                            // sparks off the anvil
    if (!a.moving && a.n === 0 && sw > 0.5 && sw < 0.62) things.push({ y: GY + 4, draw: () => { R(forgeX + 27, GY - 14, 1, 1, '#fff0b0'); R(forgeX + 31, GY - 16, 1, 1, '#f5c04a'); R(forgeX + 24, GY - 17, 1, 1, '#f5c04a'); R(forgeX + 33, GY - 12, 1, 1, '#fff0b0'); } });
  }
  if (G.staff.unctor) staffer('unctor', { tunic: '#5a8a9a', hair: '#2a1c14' }, [
    { x: 276, y: GY + 6, wait: 6, item: 'bucket', face: -1 }, { x: 60, y: GY + 11, wait: 4, item: 'bucket' }, { x: 230, y: 158, wait: 3, item: 'bucket' }], 14);
  if (G.staff.dispensator) staffer('dispensator', { tunic: '#8a8a8a', hair: '#c9c2b2' }, [
    { x: 352, y: GY + 8, wait: 6, item: 'scroll', face: 1 }, { x: 456, y: GY + 10, wait: 5, item: 'scroll', face: 1 }, { x: 514, y: GY + 11, wait: 4, item: 'scroll', face: 1 }], 11);
  if (G.staff.faber) staffer('faber', { tunic: '#6a5a4a', apron: '#3a2a1c', hair: '#8a8a8a', skin: '#c9966c' }, [
    { x: forgeX + 40, y: GY + 6, wait: 12, item: 'hammer', face: -1, pose: m => ({ swing: m.moving ? 0.9 : (T * 0.9 + 0.5) % 1 }) },
    gl >= 1 ? { x: 466, y: 158, wait: 4, item: 'sword', face: -1 } : { x: 300, y: GY + 12, wait: 3, item: 'sword' }], 13);
  if (sky.night < 0.8) staffer('sweeper', { tunic: '#8a7a5a', hair: '#3a2a1c' }, [
    { x: 40, y: GY + 14, wait: 3, item: 'broom', pose: () => ({ sweep: Math.sin(T * 6) > 0 }) }, { x: 112, y: GY + 15, wait: 3, item: 'broom', pose: () => ({ sweep: Math.sin(T * 6) > 0 }) },
    { x: 164, y: GY + 13, wait: 3, item: 'broom', pose: () => ({ sweep: Math.sin(T * 6) > 0 }) }, { x: 84, y: GY + 16, wait: 3, item: 'broom', pose: () => ({ sweep: Math.sin(T * 6) > 0 }) }], 9);

  // resting fighters fill their day: a nap in the shade, a drink at the baths, a word with a friend,
  // a look at the men training. At night they sleep by the brazier; in rain they keep under the eaves.
  const seen = {}, resters = by('rest');
  resters.forEach((g, i) => {
    const hx = 24 + i * 22, hy = 140 + (i % 2) * 7, key = 'g' + g.id, a = yardAgent(key, hx, hy);
    seen[key] = 1; a.home = [hx, hy]; if (a.mate && !seen['g' + a.mate.gid] && !yardAgents['g' + a.mate.gid]) a.mate = null;
    if (agentMove(a, dt, 14)) {
      if (a.next) { a.act = a.next; a.next = null; a.wait = a.hold; }             // arrived: do what he came for
      else {
        const go = (x, y, act, hold) => { a.tx = x; a.ty = y; a.next = act; a.hold = hold; a.act = 'walk'; a.wait = 0; a.mate = null; };
        // no more than two wander off at once, so the yard never knots up
        const away = resters.filter(o => { const b = yardAgents['g' + o.id]; return b && b !== a && Math.hypot(b.tx - b.home[0], b.ty - b.home[1]) > 4; }).length;
        const r = away >= 2 ? Math.random() * 0.46 : Math.random();
        if (night) go(hx, hy, 'nap', 6);
        else if (wetDay || r < 0.28) go(hx, hy, 'idle', rand(3, 7));
        else if (r < 0.46) go(hx, hy, 'nap', rand(8, 14));
        else if (r < 0.66) go(238 + rand(0, 46), GY + 8 + rand(0, 5), 'drink', rand(3, 5));
        else if (r < 0.84) go(146 + (i % 4) * 15 + rand(0, 5), 160 + (i % 3) * 6, 'watch', rand(4, 8));
        else {
          const mate = resters.map(o => yardAgents['g' + o.id]).find(b => b && b !== a && b.act === 'idle' && !b.moving);
          if (mate) { go(mate.x + 13, mate.y, 'chat', 6); a.mate = mate; mate.act = 'chat'; mate.mate = a; mate.wait = 11; }
          else go(hx, hy, 'idle', rand(2, 4));
        }
      }
    }
    folk.push(a);
    const x = Math.round(a.x), y = Math.round(a.y), toMate = a.mate ? (a.mate.x > a.x ? 1 : -1) : 1;
    const o = a.moving ? { facing: a.face, moving: true, walk: a.walk } : a.act === 'nap' ? { falling: true, down: true }
      : a.act === 'watch' ? { cheer: Math.sin(T * 1.3 + g.id) > 0.6 ? T + g.id : 0 } : a.act === 'chat' ? { facing: toMate } : {};
    place(g, x, y, o);
    if (!a.moving && a.act === 'nap') late.push(() => { ctx.font = 'bold 6px Consolas, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#f2e6cc'; const p = (T * 0.7 + g.id * 0.3) % 1; ctx.globalAlpha = 1 - p; ctx.fillText('z', x + 12 + p * 5, y - 12 - p * 12); ctx.globalAlpha = 1; });
    if (!a.moving && a.act === 'chat' && (Math.floor(T * 0.8) + (a.mate && a.mate.x > a.x ? 1 : 0)) % 2) things.push({ y: y + 1, draw: () => { R(x + toMate * 3 - 4, y - 53, 9, 6, '#1c1310'); R(x + toMate * 3 - 3, y - 52, 7, 4, '#f2e6cc'); R(x + toMate * 3, y - 47, 1, 2, '#f2e6cc'); for (let k = 0; k < 3; k++) R(x + toMate * 3 - 2 + k * 2, y - 51, 1, 1, '#5a4334'); } });
    if (!a.moving && a.act === 'drink') things.push({ y: y + 1, draw: () => { R(x + 5, y - 34, 3, 3, '#7a5a2a'); R(x + 5, y - 34, 3, 1, '#5aa0d0'); } });
  });
  for (const k of Object.keys(yardAgents)) if (k[0] === 'g' && !seen[k]) delete yardAgents[k];

  // a brazier by the barracks, lit when the light goes
  things.push({ y: 151, draw: () => {
    const bx = 136, by = 151;
    R(bx - 5, by - 1, 10, 2, 'rgba(0,0,0,.2)'); R(bx - 4, by - 9, 1, 9, '#3a2a1c'); R(bx + 3, by - 9, 1, 9, '#3a2a1c'); R(bx - 5, by - 12, 10, 4, '#4a3a34'); R(bx - 5, by - 12, 10, 1, '#6a5a50');
    if (sky.night > 0.25) { const fl = Math.sin(T * 10) > 0 ? 1 : 0; R(bx - 3, by - 17 - fl, 6, 5 + fl, '#e2702a'); R(bx - 2, by - 19 - fl, 4, 4, '#f5c04a'); R(bx - 1, by - 20, 2, 2, '#fff0b0'); fires.push([bx, by - 14, 24]); }
    else R(bx - 3, by - 13, 6, 1, '#2a1c14');
  } });

  // birds: on the roofs and pecking in the yard by day, gone in rain and darkness
  if (!yardBirds) yardBirds = [0, 1, 2, 3].map(i => ({ x: -20, y: -20, state: 'away', wait: 1 + i * 2.5, p: -1 }));
  const badSky = sky.night > 0.5 || wx.rain > 0.2;
  yardBirds.forEach((b, i) => {
    const freeP = () => { const used = yardBirds.map(o => o.p), c = perches.map((_, k) => k).filter(k => !used.includes(k)); return c.length ? pick(c) : -1; };
    const fly = (tx, ty, p) => { b.fx = b.x; b.fy = b.y; b.tx = tx; b.ty = ty; b.t = 0; b.dur = Math.max(0.5, Math.hypot(tx - b.x, ty - b.y) / 70); b.state = 'fly'; b.p = p; };
    if (b.state === 'sit') {
      b.wait -= dt;
      const pr = perches[b.p];
      if (pr) { b.x = pr[0]; b.y = pr[1]; if (pr[2] && folk.some(a => Math.hypot(a.x - b.x, a.y - b.y) < 20)) b.wait = 0; }
      if (badSky || !pr) fly(b.x + 120, -12, -1);
      else if (b.wait <= 0) { const p = freeP(); if (p >= 0) fly(perches[p][0], perches[p][1], p); else b.wait = 2; }
    } else if (b.state === 'away') {
      b.wait -= dt;
      if (!badSky && b.wait <= 0) { const p = freeP(); if (p >= 0) { b.x = -10 - i * 12; b.y = 20 + i * 6; fly(perches[p][0], perches[p][1], p); } }
    } else {
      b.t += dt / b.dur;
      const k = Math.min(1, b.t); b.x = b.fx + (b.tx - b.fx) * k; b.y = b.fy + (b.ty - b.fy) * k - Math.sin(k * Math.PI) * 12;
      if (k >= 1) { if (b.p < 0) { b.state = 'away'; b.wait = rand(3, 8); } else { b.state = 'sit'; b.wait = rand(4, 11); } }
    }
    if (b.state === 'away') return;
    things.push({ y: b.state === 'fly' ? 999 : b.y, draw: () => {
      const x = Math.round(b.x), y = Math.round(b.y), c = '#3a3a44';
      if (b.state === 'fly') { R(x - 2, y - 1, 4, 2, c); R(x + 2, y - 1, 1, 1, '#e8b545'); if (Math.floor(T * 10 + i) % 2) R(x - 1, y - 4, 2, 3, c); else R(x - 1, y + 1, 2, 2, c); }
      else {
        const peck = perches[b.p] && perches[b.p][2] && Math.sin(T * 5 + i * 2) > 0.5;
        R(x - 2, y - 3, 4, 3, c); R(x - 3, y - 3, 1, 1, c); R(x - 1, y - 1, 2, 1, '#8a8a92');
        if (peck) { R(x + 2, y - 2, 2, 2, c); R(x + 3, y, 1, 1, '#e8b545'); } else { R(x + 1, y - 5, 2, 2, c); R(x + 3, y - 4, 1, 1, '#e8b545'); }
      }
    } });
  });
  things.sort((a, b) => a.y - b.y).forEach(o => o.draw());

  // ---- the light of the hour over everything below the sky, then what glows in the dark ----
  if (sky.tint !== '#ffffff') {
    const m = yardMask.getContext('2d');             // the tint colour, cut to the shape of the scene
    m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = 'source-over';
    m.fillStyle = sky.tint; m.fillRect(0, 0, cv.width, cv.height);
    m.globalCompositeOperation = 'destination-in'; m.drawImage(yardLayer, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(yardMask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx = main;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(yardLayer, 0, 0);
  ctx.setTransform(YARD.S, 0, 0, YARD.S, 0, 0);
  if (sky.night > 0.05) {
    const n = sky.night;
    ctx.globalAlpha = n; for (const [lx, ly] of lights) { R(lx, ly, 6, 7, '#ffd27a'); R(lx + 3, ly, 1, 7, '#b8802e'); } ctx.globalAlpha = 1;
    R(512 - 1, GY - 46, 3, 6, '#e2702a'); R(562 - 1, GY - 46, 3, 6, '#e2702a');
    ctx.globalCompositeOperation = 'lighter';
    for (const [lx, ly] of lights) { ctx.fillStyle = `rgba(255,190,90,${(0.16 * n).toFixed(3)})`; ctx.fillRect(lx - 4, ly - 4, 14, 15); }
    for (const [fx, fy, r] of fires) {
      const k = (0.85 + Math.sin(T * 8 + fx) * 0.15) * n;
      for (const [q, a] of [[1, 0.07], [0.66, 0.1], [0.35, 0.14]]) { ctx.fillStyle = `rgba(255,150,60,${(a * k).toFixed(3)})`; ctx.fillRect(fx - r * q, fy - r * q * 0.7, r * q * 2, r * q * 1.4); }
      for (let i = 0; i < 5; i++) { const w = r * (1.9 - i * 0.3); ctx.fillStyle = `rgba(255,170,80,${(0.022 * k).toFixed(3)})`; ctx.fillRect(fx - w / 2, GY + 1 + i, w, 14 - i * 2); }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (wx.rain > 0) {
    ctx.fillStyle = 'rgba(205,222,240,.5)';
    for (let i = 0, n = Math.round(130 * wx.rain); i < n; i++) {
      const x = Math.floor(((i * 97.3 - T * 70) % 620 + 620) % 620 - 15), yy = Math.floor((i * 61.7 + T * 340 + (i % 7) * 13) % 200 - 5);
      ctx.fillRect(x, yy, 1, 4); ctx.fillRect(x - 1, yy + 4, 1, 3);
    }
    ctx.fillStyle = 'rgba(225,238,250,.6)';
    for (let i = 0, n = Math.round(30 * wx.rain); i < n; i++) { const k = Math.floor(T * 10) + i * 17, sx = (k * 73) % 588, sy = GY + 4 + (k * 29) % (YARD.H - GY - 6); ctx.fillRect(sx, sy, 3, 1); ctx.fillRect(sx + 1, sy - 1, 1, 1); }
    if (wx.rain > 0.8 && T % 13 < 0.1) { ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(0, 0, 590, 190); }
  }
  if (wx.gust > 0) {                             // sand and leaves on the wind
    ctx.fillStyle = `rgba(245,228,185,${(0.45 * wx.gust).toFixed(3)})`;
    for (let i = 0; i < 16; i++) ctx.fillRect(Math.floor((i * 83 + T * 170) % 660 - 40), GY + 6 + (i * 37) % 54, 10 + (i % 3) * 5, 1);
    ctx.globalAlpha = wx.gust;
    for (let i = 0; i < 5; i++) R((i * 211 + T * 120) % 640 - 20, GY + 22 + (i * 23) % 30 - Math.abs(Math.sin(T * 5 + i)) * 8, 2, 1, i % 2 ? '#6f8a3a' : '#a8722e');
    ctx.globalAlpha = 1;
  }
  late.forEach(f => f());
  sceneVignette(ctx, 590, 190, 0.3);
}

// The picture is the yard at your own school, and the place itself at any other door in the village (places.js).
function drawScene(cv, T) {
  const tab = typeof ui !== 'undefined' ? ui.tab : 'ludus';
  if (tab !== 'ludus' && typeof PLACE_SCENES !== 'undefined' && PLACE_SCENES[tab]) drawPlace(cv, T, tab); else drawYard(cv, T);
}
function yardFrame(ts) {
  const cv = document.getElementById('yard');
  if (!cv || !G) { yardRaf = 0; return; }
  const arena = document.getElementById('arena');
  if (ts - yardLast > 30 && !(arena && !arena.hidden)) { yardLast = ts; try { drawScene(cv, ts / 1000); } catch (e) { console.error(e); yardRaf = 0; return; } }
  yardRaf = requestAnimationFrame(yardFrame);
}
// Draw once at once, then keep it moving while the canvas is on the page.
function startYard() {
  const cv = document.getElementById('yard');
  if (!cv) return;
  drawScene(cv, performance.now() / 1000);
  if (!yardRaf) yardRaf = requestAnimationFrame(yardFrame);
}
// What was clicked: a fighter (nearest the front wins) or a building.
function yardPick(cv, e) {
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * YARD.W, y = (e.clientY - r.top) / r.height * YARD.H;
  const hits = yardHits.filter(h => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1);
  return hits.filter(h => h.fighter).sort((a, b) => b.y1 - a.y1)[0] || hits.filter(h => !h.low)[0] || hits[0] || null;
}
