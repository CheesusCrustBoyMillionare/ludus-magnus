'use strict';
// The picture beside the town. At your own school it is the yard (yard.js); at any other door in the village it is
// that place: the market with the men who are really for sale, the forge with the smith's real stock on the wall,
// the tavern with the houses' shields hung in order of their renown, and so on. Each is drawn on the yard's canvas
// and its 590 by 190 grid, under the yard's sky and weather, and shows the state of the game as well as the place.

let placeLayer = null, placeMask = null;
const RAR_COL = ['#8a8a8a', '#c2b79d', '#7fb85a', '#5aa0e0', '#b77be8', '#e8b545', '#f0705e'];
const PLACE_TIPS = {
  market: 'The slave market. The men on the block are the ones for sale today.',
  smith: 'The forge. What hangs on the wall is what the smith has to sell; the colours are the grades.',
  arena: 'The arena from the street. On games days the town queues at its gates.',
  contracts: 'The forum. Each tablet on the board is an offer of work; a gold one asks for you by name.',
  patrons: 'The temple. The three fires burn as high as each patron\'s favour.',
  rivals: 'The tavern. The shields on the wall are the schools of the province, the most renowned first.',
  facilities: 'Your own house. The people in the court are the staff you have hired.',
  chronicle: 'The record house. The shelves fill as your chronicle grows; the urns are your dead.',
};

function drawPlace(cv, T, tab) {
  const S = cv.width / 590, main = cv.getContext('2d'), scene = PLACE_SCENES[tab];
  if (!placeLayer || placeLayer.width !== cv.width) {
    placeLayer = document.createElement('canvas'); placeMask = document.createElement('canvas');
    placeLayer.width = placeMask.width = cv.width; placeLayer.height = placeMask.height = cv.height;
  }
  yardHits = [];                                // nothing here is clickable as the yard's fighters and buildings are
  let ctx = main;
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const sky = yardSky(T), wx = yardWeather(T), late = [], lamps = [];
  if (wx.over > 0) {
    const grey = mixHex('#8d98a3', '#1a2030', sky.night);
    sky.bands = sky.bands.map(c => mixHex(c, grey, wx.over * 0.8));
    sky.tint = mixHex(sky.tint, mixHex('#aab2c0', '#59669c', sky.night), wx.over * 0.75);
  }
  ctx.setTransform(S, 0, 0, S, 0, 0); ctx.imageSmoothingEnabled = false;
  if (scene.indoor) R(0, 0, 590, 190, '#1c1410');
  else {                                        // the sky, with the sun or the moon on its way across
    R(0, 0, 590, 70, sky.bands[0]); R(0, 42, 590, 30, sky.bands[1]); R(0, 60, 590, 60, sky.bands[2]);
    if (sky.night > 0.05) { for (let i = 0; i < 40; i++) { ctx.globalAlpha = sky.night * (0.5 + 0.5 * Math.sin(T * 1.7 + i * 2.1)); R((i * 131) % 588, (i * 47) % 58, 1, 1, '#f4f6ff'); } ctx.globalAlpha = 1; }
    ctx.globalAlpha = 1 - wx.over * 0.9;
    if (sky.sun) { const [sx, sy] = sky.sun; R(sx - 7, sy - 7, 14, 14, sky.sunCol); R(sx - 10, sy - 4, 20, 8, sky.sunCol); R(sx - 4, sy - 10, 8, 20, sky.sunCol); }
    if (sky.moon) { const [mx, my] = sky.moon; R(mx - 6, my - 6, 12, 12, '#eef0f8'); R(mx - 8, my - 3, 16, 6, '#eef0f8'); R(mx + 1, my - 5, 6, 9, sky.bands[0]); }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 3 + Math.round(wx.over * 5); i++) { const cx = (T * (3 + i % 4) + i * 210) % 760 - 100, cy = 8 + (i * 13) % 44; R(cx, cy, 34, 6, sky.cloud); R(cx + 6, cy - 3, 20, 4, sky.cloud); }
  }
  // everything under the sky goes on its own layer, so the light of the hour stains the place and not the sky
  ctx = placeLayer.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(S, 0, 0, S, 0, 0); ctx.imageSmoothingEnabled = false;

  const E = {
    T, R, sky, wx, night: sky.night, games: isGamesDay(),
    ctx: () => ctx,
    // a person on the street, feet at x, y; d is 1 facing right, -1 left
    P: (x, y, d, o) => yardPerson(ctx, Math.round(x), Math.round(y), d, Object.assign({ tunic: '#8a4a3a' }, o)),
    // someone walking the length of the picture and coming round again
    walker: (i, y, speed, o) => { const x = (((i * 137 + T * speed) % 660) + 660) % 660 - 35; yardPerson(ctx, Math.round(x), y, speed > 0 ? 1 : -1, Object.assign({ tunic: '#8a4a3a', moving: true, walk: T * 9 + i }, o)); },
    sign: (x, y, text, gold) => late.push(() => {
      ctx.font = 'bold 6px Consolas, monospace'; ctx.textAlign = 'center';
      const w = Math.ceil(ctx.measureText(text).width) + 8;
      R(x - w / 2 - 1, y - 8, w + 2, 11, '#e0aa3e'); R(x - w / 2, y - 7, w, 9, gold ? '#5a3d1c' : '#241812');
      ctx.fillStyle = gold ? '#ffe9a0' : '#f2e6cc'; ctx.fillText(text, x, y);
    }),
    lamp: (x, y) => lamps.push([x, y]),
    flame: (x, y, h, col) => { const fl = Math.sin(T * 12 + x) > 0 ? 1 : 0; R(x - 2, y - h - fl, 5, h + fl, col || '#e2702a'); R(x - 1, y - Math.round(h * 0.7) - fl, 3, Math.round(h * 0.7), '#f5c04a'); R(x, y - Math.round(h * 0.4), 1, Math.round(h * 0.4), '#fff0b0'); },
    column: (x, y, h) => { R(x, y, 7, h, '#e8e2d2'); R(x + 5, y, 2, h, '#c9c2ae'); R(x + 2, y, 1, h, '#f8f4ea'); R(x - 2, y - 3, 11, 3, '#d8d2c0'); R(x - 2, y + h, 11, 3, '#c9c2ae'); },
    tiles: (x, y, w, h) => { R(x, y, w, h, '#b5522e'); for (let i = 0; i < w; i += 6) R(x + i, y, 1, h, '#963f22'); R(x, y, w, 1, '#d06a3e'); },
    paving: (y, c, d) => { R(0, y, 590, 190 - y, c); for (let i = 0; i < 110; i++) R((i * 97) % 588, y + 3 + (i * 53) % (186 - y), 3 + (i % 3) * 2, 1, d); R(0, y, 590, 2, 'rgba(40,24,8,.3)'); },
    // the shade a building throws on the ground before it: deeper and longer when the sun is low
    shade: (x, y, w) => R(x, y, w, 3 + Math.round(sky.shadow.len * 0.8), `rgba(40,24,8,${(0.13 + sky.shadow.len * 0.008).toFixed(3)})`),
    amphora: (x, y, c) => { R(x - 2, y - 9, 5, 8, c || '#b8703c'); R(x - 1, y - 12, 3, 3, c || '#b8703c'); R(x - 3, y - 11, 1, 3, '#8a5028'); R(x + 3, y - 11, 1, 3, '#8a5028'); R(x - 1, y - 1, 3, 2, '#8a5028'); },
  };
  if (!scene.indoor) {                          // the country beyond the town: two ranges of hills, cypresses, a roof or two
    for (let x = -30; x < 590; x += 64) { const hh = 22 + ((x * 5) % 13); R(x, 96 - hh, 90, hh + 30, '#93b0a0'); R(x + 14, 92 - hh, 58, 5, '#a3bcad'); }
    for (let x = -20; x < 590; x += 46) { const hh = 14 + ((x * 7) % 11); R(x, 100 - hh, 60, hh + 26, '#7fa27a'); R(x + 8, 96 - hh, 40, 5, '#8fb287'); }
    for (const [cx, ch] of [[18, 34], [44, 26], [556, 30], [578, 38], [300, 22]]) { R(cx, 122 - ch, 2, ch, '#3a2a1c'); for (let q = 0; q < ch; q++) { const w = Math.round(Math.sin(q / ch * Math.PI) * 4) + 1; R(cx + 1 - w, 118 - q, w * 2, 1, q % 3 ? '#35543a' : '#416446'); } }
  }
  scene.draw(E);
  if (!scene.indoor && sky.night < 0.5 && wx.rain < 0.3) {      // pigeons, wherever people are
    for (let i = 0; i < 4; i++) { const px = 60 + ((i * 163 + tab.length * 37) % 470), py = 176 + (i % 2) * 6, peck = Math.sin(T * 5 + i * 1.7) > 0.5 ? 1 : 0; R(px, py - 2, 3, 2, i % 2 ? '#8f97a0' : '#c9d1d9'); R(px + 2, py - 3 + peck, 1, 1, '#6f7780'); R(px, py, 1, 1, '#c98a4a'); }
  }

  // the light of the hour: full out of doors, a little of it under a roof
  const tint = scene.indoor ? mixHex('#ffffff', sky.tint, 0.35) : sky.tint;
  if (tint !== '#ffffff') {
    const m = placeMask.getContext('2d');
    m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = 'source-over'; m.fillStyle = tint; m.fillRect(0, 0, cv.width, cv.height);
    m.globalCompositeOperation = 'destination-in'; m.drawImage(placeLayer, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(placeMask, 0, 0); ctx.globalCompositeOperation = 'source-over';
  }
  ctx = main;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(placeLayer, 0, 0);
  ctx.setTransform(S, 0, 0, S, 0, 0);
  // lamps and torches: lit when it grows dark, and always under a roof
  const la = scene.indoor ? Math.max(0.55, sky.night) : Math.min(1, Math.max(0, (sky.night - 0.2) * 2));
  if (la > 0) for (const [lx, ly] of lamps) {
    ctx.globalAlpha = la; E.flame(lx, ly, 5);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) { const r = 26 - i * 5; ctx.fillStyle = `rgba(255,170,80,${(0.06 * la).toFixed(3)})`; ctx.fillRect(Math.round(lx - r), Math.round(ly - 4 - r * 0.7), r * 2, Math.round(r * 1.4)); }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (!scene.indoor) { if (wx.wet > 0) R(0, 120, 590, 70, `rgba(60,45,30,${(0.16 * wx.wet).toFixed(3)})`); sceneRain(ctx, 590, 190, T, wx.rain); }
  late.forEach(f => f());
  sceneVignette(ctx, 590, 190, scene.indoor ? 0.42 : 0.3);
}

// A row of townsfolk in assorted tunics, for wherever a crowd is wanted.
const TOWN_TUNICS = ['#8a4a3a', '#4a6a8a', '#7a7a3a', '#6a4a7a', '#3f7a5a', '#a8763a', '#8a8a8a', '#b06a8a', '#5a8a9a'];
const TOWN_SKINS = ['#d9a57c', '#c9966c', '#8a5a3a', '#e3b48f'];
const townsman = i => ({ tunic: TOWN_TUNICS[i % 9], skin: TOWN_SKINS[i % 4], hair: i % 2 ? '#2a1c14' : '#6a4a2a' });

const PLACE_SCENES = {
  // ---- the slave market: stalls, and the block with today's men on it ----
  market: { draw(E) {
    const { R, T } = E;
    R(0, 62, 590, 60, '#c9b48a'); R(0, 62, 590, 2, '#e0cfa6');
    for (let x = 10; x < 590; x += 58) { E.tiles(x - 6, 54, 50, 8); R(x + 8, 78, 8, 12, '#3a2a1c'); R(x + 28, 78, 8, 12, '#3a2a1c'); R(x + 8, 78, 8, 1, '#8a6a3a'); R(x + 28, 78, 8, 1, '#8a6a3a'); }
    E.paving(120, '#cdae78', '#bf9f6a'); E.shade(0, 120, 590);
    for (let x = 34; x < 590; x += 116) { R(x, 70, 1, 8, '#6b573c'); R(x + 40, 70, 1, 8, '#6b573c'); R(x, 72, 41, 1, '#8a7a5a'); for (let q = 0; q < 5; q++) R(x + 4 + q * 8, 73, 5, 5 + (q % 2), ['#e8dcc0', '#b85a48', '#8fa8c8', '#e8dcc0', '#c9a21e'][q]); }      // washing, strung between the windows
    const stall = (x, c, goods) => {
      R(x, 86, 2, 46, '#6b4f2c'); R(x + 62, 86, 2, 46, '#6b4f2c');
      for (let i = 0; i < 8; i++) R(x - 4 + i * 9, 80, 9, 9, i % 2 ? '#f1ead8' : c); R(x - 4, 89, 72, 2, shade(c, 0.7));
      R(x - 2, 118, 68, 14, '#8a6a3a'); R(x - 2, 118, 68, 2, '#a8834a');
      goods(x);
    };
    stall(22, '#b93a2e', x => { for (let i = 0; i < 5; i++) E.amphora(x + 8 + i * 12, 118, i % 2 ? '#b8703c' : '#c98a4a'); });
    stall(452, '#2f6db8', x => { for (let i = 0; i < 6; i++) { R(x + 4 + i * 10, 112, 8, 6, ['#c23b2e', '#e3b04a', '#3f7a5a', '#7a2a8a'][i % 4]); R(x + 4 + i * 10, 112, 8, 1, '#f1ead8'); } });
    E.P(52, 150, 1, { tunic: '#b93a2e', hair: '#2a1c14', apron: '#e8dcc0' }); E.P(486, 150, -1, { tunic: '#2f6db8', hair: '#6a4a2a' });
    // the block: a wooden stage, and on it whoever the dealer has brought
    R(196, 128, 200, 14, '#7a5a34'); R(196, 128, 200, 2, '#94703f'); for (let x = 200; x < 396; x += 22) R(x, 130, 1, 12, '#5e4426'); R(190, 142, 212, 3, 'rgba(0,0,0,.25)');
    const men = (G.market || []).slice(0, 6);
    men.forEach((m, i) => {
      const x = 216 + i * (men.length > 4 ? 30 : 36), bob = Math.sin(T * 1.2 + i * 2) > 0.9 ? 1 : 0;
      E.P(x, 128 - bob, i % 2 ? -1 : 1, { tunic: '#b8a888', skin: m.look ? m.look.skin : '#c9966c', hair: m.look ? m.look.hair : '#2a1c14' });
      R(x - 5, 118, 10, 7, '#f1ead8'); R(x - 5, 118, 10, 1, '#c9c0aa'); R(x - 3, 120, 6, 1, '#6b573c'); R(x - 3, 122, 4, 1, '#6b573c');      // a tablet round his neck: his name and price
    });
    E.P(180, 152, 1, { tunic: '#7a2a8a', hair: '#3a2a1c', item: 'staff' });           // the dealer
    E.sign(296, 76, men.length ? `ON THE BLOCK TODAY: ${G.market.length}` : 'THE BLOCK IS EMPTY', men.length > 0);
    for (let i = 0; i < 4; i++) E.walker(i, 168 + (i % 2) * 10, i % 2 ? -14 : 17, townsman(i + 2));
    // a third stall, of fruit; a clerk at his table taking the money; and buyers come to look at the block
    stall(110, '#c9a21e', x => { for (let i = 0; i < 7; i++) { R(x + 3 + i * 9, 113, 7, 5, '#8a6a3a'); R(x + 4 + i * 9, 111, 5, 3, ['#c23b2e', '#e3b04a', '#6f9a3a'][i % 3]); R(x + 5 + i * 9, 110, 2, 1, ['#e06a5a', '#f2d06a', '#8ab04a'][i % 3]); } });
    E.P(140, 150, -1, { tunic: '#c9a21e', hair: '#6a4a2a' });
    R(404, 132, 30, 4, '#6b4f2c'); R(407, 136, 3, 14, '#5e4426'); R(428, 136, 3, 14, '#5e4426'); R(410, 128, 10, 4, '#f1ead8'); for (let i = 0; i < 4; i++) R(422 + (i % 2) * 3, 130 - Math.floor(i / 2) * 2, 2, 2, '#e8b545');
    E.P(420, 152, -1, { tunic: '#e8dcc0', hair: '#8a8a8a', item: 'scroll' });
    for (let i = 0, n = Math.min(5, (G.market || []).length + 1); i < n; i++) E.P(232 + i * 34, 166 + (i % 2) * 5, i % 2 ? -1 : 1, Object.assign(townsman(i + 6), { face: 'up' }));
    R(196, 124, 200, 1, '#c9b48a'); for (let x = 198; x < 396; x += 28) R(x, 118, 2, 10, '#5e4426');      // a rope along the front of the block
    E.lamp(150, 110); E.lamp(430, 110);
  } },

  // ---- the forge: fire, anvil, and the smith's real stock on the wall ----
  smith: { indoor: true, draw(E) {
    const { R, T } = E, lv = G.smith.level;
    R(0, 0, 590, 140, '#3a3430'); for (let r = 0; r < 14; r++) { R(0, r * 10 + 9, 590, 1, '#2a2522'); for (let x = (r % 2) * 14; x < 590; x += 28) R(x, r * 10, 1, 9, '#2a2522'); }
    R(0, 140, 590, 50, '#4a3f36'); for (let i = 0; i < 70; i++) R((i * 89) % 588, 144 + (i * 37) % 44, 4, 1, '#3d342c'); R(0, 140, 590, 2, '#2a2420');
    // the hearth, its hood, and the fire
    R(24, 84, 104, 56, '#6b5a4c'); R(24, 84, 104, 3, '#85735f'); for (let i = 0; i < 5; i++) R(24, 96 + i * 10, 104, 1, '#55473b');
    R(40, 30, 72, 54, '#2a2420'); R(34, 76, 84, 8, '#3a322c'); R(44, 100, 64, 30, '#170f0b');
    const glow = 0.6 + 0.4 * Math.sin(T * 7);
    R(48, 118, 56, 12, `rgba(255,${Math.round(110 + 70 * glow)},40,.9)`); for (let i = 0; i < 6; i++) E.flame(54 + i * 9, 122, 8 + ((i * 7 + Math.floor(T * 6)) % 5), i % 2 ? '#e2702a' : '#f08a3a');
    E.ctx().globalCompositeOperation = 'lighter'; for (let i = 0; i < 6; i++) { const r = 70 - i * 10; R(76 - r, 116 - r * 0.6, r * 2, r * 1.2, `rgba(255,150,60,${(0.035 * glow).toFixed(3)})`); } E.ctx().globalCompositeOperation = 'source-over';
    R(132, 110, 22, 16, '#6b4526'); R(132, 110, 22, 2, '#8a6230'); R(150, 116, 12, 3, '#3a2a1c');       // bellows
    // the anvil, and the smith at it
    const sw = (T * 1.5) % 1;
    R(200, 126, 26, 5, '#5a5e64'); R(196, 124, 34, 3, '#7d8288'); R(206, 131, 14, 10, '#44484d'); R(202, 141, 22, 3, '#2e3135');
    R(208, 121, 12, 3, sw > 0.5 ? '#ffb060' : '#ff8a3a');
    E.P(190, 152, 1, { tunic: '#5a4a3a', apron: '#3a2a1c', hair: '#2a1c14', skin: '#c9966c', item: 'hammer', swing: sw });
    if (sw > 0.5 && sw < 0.64) for (let i = 0; i < 6; i++) R(214 + Math.cos(i * 1.1) * (sw - 0.5) * 90, 120 - Math.abs(Math.sin(i * 1.7)) * (sw - 0.5) * 80, 1, 1, '#ffe9a0');
    R(250, 124, 20, 18, '#6b4f2c'); R(250, 124, 20, 2, '#5aa0d0'); R(250, 132, 20, 1, '#4a3520');         // the quenching tub, steaming
    for (let i = 0; i < 3; i++) { const p = (T * 0.4 + i / 3) % 1; E.ctx().globalAlpha = 0.4 * (1 - p); R(256 + Math.sin(p * 5 + i) * 3, 122 - p * 22, 4 + Math.round(p * 3), 3, '#d8d4cc'); } E.ctx().globalAlpha = 1;
    // the wall: every piece he has to sell, each on its peg, ringed in the colour of its grade
    R(296, 40, 250, 3, '#6b4f2c'); R(296, 92, 250, 3, '#6b4f2c');
    const stock = G.smith.stock.slice(0, 12);
    stock.forEach((it, i) => {
      const x = 308 + (i % 6) * 40, y = 48 + Math.floor(i / 6) * 52, c = RAR_COL[it.r];
      R(x - 1, y - 4, 2, 4, '#8a6a3a');
      if (it.slot === 'weapon') { R(x - 1, y, 2, 26, '#c1c7cc'); R(x, y, 1, 26, '#eef2f5'); R(x - 4, y + 26, 8, 2, c); R(x - 1, y + 28, 2, 6, '#6b4526'); }
      else if (it.slot === 'head') { R(x - 6, y + 4, 12, 10, c); R(x - 6, y + 4, 12, 2, shade(c, 1.3)); R(x - 4, y + 10, 8, 3, '#1c1310'); R(x - 1, y, 2, 5, '#a8342a'); }
      else if (it.slot === 'chest') { R(x - 7, y + 2, 14, 18, c); R(x - 7, y + 2, 14, 2, shade(c, 1.3)); R(x - 1, y + 4, 2, 14, shade(c, 0.7)); R(x - 9, y + 2, 3, 6, shade(c, 0.85)); R(x + 6, y + 2, 3, 6, shade(c, 0.85)); }
      else { R(x - 5, y + 4, 4, 16, c); R(x + 1, y + 4, 4, 16, c); R(x - 5, y + 4, 4, 2, shade(c, 1.3)); R(x + 1, y + 4, 4, 2, shade(c, 1.3)); }
    });
    E.sign(420, 34, stock.length ? `${G.smith.stock.length} PIECE${G.smith.stock.length === 1 ? '' : 'S'} FOR SALE` : 'SOLD OUT');
    for (let i = 0; i < lv; i++) { R(300 + i * 16, 150, 10, 14, '#55473b'); R(300 + i * 16, 150, 10, 2, '#7d8288'); }      // a better forge has more tools about it
    R(552, 60, 34, 80, '#e8dcc0'); R(552, 60, 34, 80, 'rgba(255,240,200,.25)'); R(550, 58, 38, 3, '#6b4f2c'); R(550, 58, 3, 82, '#6b4f2c');      // the door, and daylight
    // tools on the wall by the hearth, a boy at the bellows, coal, a bench, and your own spare pieces in a crate by the door
    R(136, 58, 34, 2, '#6b4f2c'); for (let i = 0; i < 5; i++) { const tx = 140 + i * 6; R(tx, 60, 1, 14 + (i % 2) * 4, '#7d8288'); R(tx - 1, 60 + 14 + (i % 2) * 4, 3, 3, i % 2 ? '#5a5e64' : '#8d9094'); }
    const pump = Math.sin(T * 3) > 0 ? 1 : 0;
    R(132, 110 + pump, 22, 16 - pump, '#6b4526'); R(132, 110 + pump, 22, 2, '#8a6230');
    E.P(150, 150, -1, { tunic: '#7a6a4a', hair: '#6a4a2a', skin: '#d9a57c' });
    for (let i = 0; i < 14; i++) R(8 + (i * 7) % 20, 136 - (i % 4), 4, 3, i % 3 ? '#1c1614' : '#2e2a28'); R(6, 138, 26, 3, '#1c1614');
    R(340, 128, 60, 4, '#6b4f2c'); R(344, 132, 4, 12, '#5e4426'); R(392, 132, 4, 12, '#5e4426'); R(352, 120, 10, 8, '#b98a34'); R(352, 120, 10, 2, '#dcae48'); R(354, 124, 6, 2, '#1c1310'); R(370, 124, 16, 2, '#c1c7cc'); R(368, 123, 3, 4, '#6b4526');
    const spare = Math.min(8, G.armoury.length);
    R(500, 128, 40, 16, '#7a5a34'); R(500, 128, 40, 2, '#94703f'); for (let x = 506; x < 540; x += 8) R(x, 130, 1, 14, '#5e4426');
    for (let i = 0; i < spare; i++) { R(504 + i * 4, 118 - (i % 2) * 3, 2, 10, i % 3 ? '#c1c7cc' : '#b98a34'); R(503 + i * 4, 127 - (i % 2) * 3, 4, 1, '#6b4526'); }
    if (spare) E.sign(520, 112, `YOUR RACKS: ${G.armoury.length}`);
    E.ctx().globalCompositeOperation = 'lighter'; for (let i = 0; i < 4; i++) R(40 + i * 10, 141, 150 - i * 30, 8 - i, `rgba(255,150,60,${(0.035 * glow).toFixed(3)})`); E.ctx().globalCompositeOperation = 'source-over';      // firelight across the floor
    E.lamp(280, 76); E.lamp(540, 44);
  } },

  // ---- the arena, from the street ----
  arena: { draw(E) {
    const { R, T } = E, t = tier(), W = [{ c: '#7a5a34', d: '#5e4426', l: '#94703f' }, { c: '#a88f66', d: '#8f7650', l: '#c4ab7c' }, { c: '#b89b6e', d: '#a3875c', l: '#d8c08e' }, { c: '#d6ccb8', d: '#b5aa94', l: '#f0e8d6' }][Math.min(3, t)];
    E.paving(124, '#cdae78', '#bf9f6a');
    const rows = Math.min(4, 2 + t);                      // a greater arena stands taller
    for (let r = 0; r < rows; r++) {
      const y = 124 - (r + 1) * 26, inset = r * 8;
      R(30 + inset, y, 530 - inset * 2, 26, r % 2 ? shade(W.c, 0.94) : W.c); R(30 + inset, y, 530 - inset * 2, 2, W.l); R(30 + inset, y + 24, 530 - inset * 2, 2, W.d);
      for (let x = 46 + inset; x < 546 - inset; x += 30) { R(x, y + 8, 16, 18, '#1c1410'); R(x + 2, y + 6, 12, 2, '#1c1410'); R(x + 4, y + 4, 8, 2, '#1c1410'); R(x - 3, y + 4, 2, 22, W.d); }
    }
    const top = 124 - rows * 26;
    for (let i = 0; i < 7; i++) { const x = 70 + i * 75; R(x, top - 14, 1, 14, '#5a4326'); R(x + 1, top - 14 + (Math.sin(T * 4 + i) > 0 ? 0 : 1), 7, 4, ['#8a2a20', '#c9a21e', '#2f6db8'][i % 3]); }
    R(270, 96, 50, 28, '#120c0a'); R(274, 92, 42, 4, '#120c0a'); R(280, 88, 30, 4, '#120c0a'); R(266, 88, 4, 36, W.l); R(320, 88, 4, 36, W.l);       // the great gate
    for (let i = 0; i < 6; i++) R(273 + i * 8, 96, 1, 28, '#3a2a1c');
    if (E.games) {
      for (let i = 0; i < 13; i++) { const bx = 250 + i * 7, by = 82 + Math.round(Math.sin(i / 12 * Math.PI) * 4); R(bx, by, 7, 1, '#3a2a1c'); R(bx + 1, by + 1, 5, 3 + (Math.sin(T * 5 + i) > 0 ? 1 : 0), ['#c23b2e', '#e3b04a', '#2f6db8'][i % 3]); }
      for (let i = 0; i < 12; i++) E.P(330 + i * 17 + (i % 2) * 3, 150 + (i % 3) * 8, -1, townsman(i));          // the queue
      E.P(250, 156, 1, { tunic: '#e3b04a', hair: '#2a1c14', apron: '#f1ead8', item: 'ladle' });                  // someone selling hot sausage to it
      E.sign(295, 78, 'GAMES TODAY', true);
    } else {
      E.P(210, 152, 1, { tunic: '#8a8a8a', hair: '#6a6a6a', item: 'broom', sweep: Math.sin(T * 3) > 0 });
      for (let i = 0; i < 3; i++) E.walker(i, 164 + i * 8, i % 2 ? -13 : 16, townsman(i + 4));
      const dg = daysToGames(); E.sign(295, 78, `NEXT GAMES IN ${dg} DAY${dg === 1 ? '' : 'S'}`);
    }
    E.shade(30, 124, 530);
    if (t >= 2) for (let x = 53; x < 540; x += 60) { if (x > 250 && x < 330) continue; const y = 124 - rows * 26 + 12; R(x, y + 6, 4, 10, '#e8e2d2'); R(x + 1, y + 3, 2, 3, '#e8e2d2'); R(x - 1, y + 16, 6, 2, '#c9c2ae'); }      // statues in the upper arches of a great arena
    R(266, 124, 58, 3, '#b8a888'); R(262, 127, 66, 3, '#a39a84');                               // steps up to the gate
    R(96, 108, 26, 16, '#6b4f2c'); R(98, 110, 22, 12, '#f1ead8'); for (let i = 0; i < 4; i++) R(100, 112 + i * 3, 12 + (i % 2) * 5, 1, '#6b573c'); R(94, 106, 30, 2, '#4a3520');      // the day's card, posted by the wall
    R(452, 104, 34, 20, '#7a5a34'); for (let i = 0; i < 6; i++) R(450 + i * 6, 98, 6, 6, i % 2 ? '#f1ead8' : '#b93a2e'); R(452, 116, 34, 2, '#94703f'); E.P(468, 124, -1, { tunic: '#a8763a', hair: '#2a1c14' }); R(452, 116, 34, 8, '#7a5a34'); R(452, 116, 34, 2, '#94703f');      // where the tokens are sold
    E.lamp(258, 110); E.lamp(332, 110);
  } },

  // ---- the forum: the board where work is posted ----
  contracts: { draw(E) {
    const { R, T } = E;
    R(30, 46, 530, 8, '#d8d2c0'); R(30, 46, 530, 2, '#f8f4ea'); R(24, 38, 542, 8, '#c9c2ae'); E.tiles(20, 30, 550, 8);
    R(30, 54, 530, 66, '#5a4a3e'); for (let x = 40; x < 560; x += 44) R(x + 9, 60, 26, 60, '#463a30');
    for (let x = 40; x <= 550; x += 44) E.column(x, 57, 60);
    E.paving(120, '#d8c9a8', '#c4b490');
    // the board: a tablet for every offer, gold for one that asks for you by name
    R(196, 70, 150, 54, '#6b4f2c'); R(200, 74, 142, 46, '#8a6a3a'); R(192, 68, 158, 3, '#4a3520');
    const offers = (G.contracts || []).slice(0, 8);
    offers.forEach((c, i) => { const x = 208 + (i % 4) * 34, y = 79 + Math.floor(i / 4) * 21; R(x, y, 26, 16, c.asked ? '#e8b545' : '#f1ead8'); R(x, y, 26, 1, c.asked ? '#fff0b0' : '#ffffff'); for (let k = 0; k < 3; k++) R(x + 3, y + 4 + k * 4, 14 + ((i + k) % 3) * 3, 1, '#6b573c'); R(x + 12, y - 2, 2, 3, '#a02d22'); });
    E.sign(271, 64, offers.length ? `${offers.length} OFFER${offers.length === 1 ? '' : 'S'} OF WORK` : 'NO WORK POSTED', offers.some(c => c.asked));
    const asked = offers.find(c => c.asked);
    if (asked) E.P(362, 150, -1, { tunic: asked.patron === 'temple' ? '#f1ead8' : asked.patron === 'guild' ? '#c9a21e' : '#7a2a8a', hair: '#2a1c14', item: 'scroll' });      // a patron's man, waiting on you
    R(96, 96, 20, 28, '#c9c2ae'); R(92, 94, 28, 3, '#d8d2c0'); E.P(106, 96, 1, { tunic: '#d8d2c0', skin: '#d8d2c0', hair: '#c9c2ae' });        // a statue of somebody
    R(440, 132, 44, 4, '#6b4f2c'); R(444, 136, 3, 14, '#5e4426'); R(477, 136, 3, 14, '#5e4426'); E.P(462, 150, -1, { tunic: '#e8dcc0', hair: '#8a8a8a', item: 'scroll' });      // the clerk at his table
    // men of yours already out on a job: their packs by the road
    (G.jobs || []).slice(0, 4).forEach((J, i) => { R(520 + i * 14, 160, 9, 8, '#8a6a3a'); R(520 + i * 14, 160, 9, 2, '#a8834a'); R(523 + i * 14, 156, 3, 4, '#c23b2e'); });
    for (let i = 0; i < 4; i++) E.walker(i, 164 + (i % 2) * 10, i % 2 ? -12 : 15, townsman(i + 1));
    E.shade(30, 120, 530);
    // each patron's colours hang in the colonnade, bright or faded as his favour stands
    [['magistrate', 62, '#7a2a8a'], ['guild', 458, '#c9a21e'], ['temple', 502, '#f1ead8']].forEach(([k, x, c]) => {
      const f = G.patrons[k], col = f >= 35 ? c : mixHex(c, '#8a8478', 0.55), w = Math.sin(T * 3 + x) > 0 ? 1 : 0;
      R(x, 62, 16, 1, '#5a4326'); R(x + 1, 63, 14, 24 + w, col); R(x + 1, 63, 14, 2, shade(col, 1.25)); R(x + 6, 72, 4, 4, '#e8b545'); R(x + 1, 86 + w, 5, 3, col); R(x + 10, 86 + w, 5, 3, col);
    });
    for (let i = 0; i < 5; i++) { const px = 120 + i * 78; R(px, 28, 3, 2, i % 2 ? '#8f97a0' : '#c9d1d9'); R(px + 2, 27, 1, 1, '#6f7780'); }      // pigeons along the roof
    E.lamp(186, 108); E.lamp(356, 108);
  } },

  // ---- the temple: three fires, as high as each patron's favour ----
  patrons: { draw(E) {
    const { R, T } = E, P = G.patrons;
    E.paving(124, '#d8c9a8', '#c4b490');
    R(180, 112, 230, 4, '#e8e2d2'); R(172, 116, 246, 4, '#d8d2c0'); R(164, 120, 262, 4, '#c9c2ae');       // the steps
    R(200, 52, 190, 60, '#3a322c'); R(270, 70, 50, 42, '#1c1410');
    for (let i = 0; i < 6; i++) E.column(202 + i * 36, 55, 57);
    R(192, 44, 206, 8, '#d8d2c0'); R(192, 44, 206, 2, '#f8f4ea');
    for (let i = 0; i < 9; i++) R(196 + i * 11, 44 - (i + 1) * 3, 198 - i * 22, 3, i % 2 ? '#e8e2d2' : '#ddd6c4');      // the pediment
    // the fires: the Magistrate's, the goddess's own on the altar, and the Guild's
    const fire = (x, col, f, name) => {
      R(x - 8, 126, 16, 20, '#b8ab94'); R(x - 10, 124, 20, 3, '#d8cdb6'); R(x - 7, 118, 14, 6, '#5a4a3e'); R(x - 9, 116, 18, 3, '#7a6a5a');
      E.flame(x, 117, 4 + Math.round(f / 6), col);
      E.sign(x, 160, `${name} ${Math.round(f)}`, f >= 60);
    };
    fire(96, '#b05ad0', P.magistrate, 'MAGISTRATE'); fire(295, '#f0e0a0', P.temple, 'TEMPLE'); fire(494, '#e8b545', P.guild, 'GUILD');
    E.P(262, 112, 1, { tunic: '#f1ead8', hair: '#c9c2b2' });                          // the priest
    E.P(72, 150, 1, { tunic: '#7a2a8a', hair: '#3a2a1c' }); E.P(520, 150, -1, { tunic: '#c9a21e', hair: '#2a1c14', item: 'bag' });      // the Magistrate's man, and the Guild's
    for (let i = 0; i < 3; i++) E.walker(i, 170 + (i % 2) * 8, i % 2 ? -10 : 12, townsman(i + 5));
    E.shade(164, 124, 262);
    R(192, 48, 206, 3, '#e8b545'); for (let x = 198; x < 394; x += 12) R(x, 49, 6, 1, '#b6832c');          // a gilded frieze
    for (let i = 0; i < 4; i++) { const q = (T * 0.25 + i / 4) % 1; E.ctx().globalAlpha = 0.4 * (1 - q); R(294 + Math.sin(q * 5 + i) * 4, 106 - q * 50, 3 + Math.round(q * 4), 3, '#e8e2d2'); } E.ctx().globalAlpha = 1;      // incense from the altar
    if (G.patrons.temple >= 35) for (let i = 0; i < 5; i++) for (let q = 2; q < 34; q += 2) R(208 + i * 36 + q, 60 + Math.round(Math.sin(q / 36 * Math.PI) * 4), 2, 2, q % 4 ? '#4f7a3a' : '#c23b2e');      // garlands between the columns, when she favours you
    const gifts = Math.min(6, (G.gifts ? G.gifts.magistrate + G.gifts.guild + G.gifts.temple : 0));
    for (let i = 0; i < gifts; i++) E.amphora(318 + i * 8, 124, i % 2 ? '#c98a4a' : '#b8703c');          // what you have brought them so far
    E.lamp(190, 108); E.lamp(400, 108);
  } },

  // ---- the tavern: the schools' shields, hung in order of renown ----
  rivals: { indoor: true, draw(E) {
    const { R, T } = E;
    R(0, 0, 590, 142, '#b89868'); R(0, 96, 590, 46, '#7a5a34'); for (let x = 0; x < 590; x += 20) R(x, 96, 1, 46, '#5e4426'); R(0, 94, 590, 3, '#94703f');
    for (let x = 30; x < 590; x += 110) R(x, 0, 8, 96, '#5e4426'); R(0, 0, 590, 8, '#4a3520');
    R(0, 142, 590, 48, '#6b4f2c'); for (let i = 0; i < 12; i++) R(0, 146 + i * 4, 590, 1, '#5e4426');
    // the wall of shields: every school in the province, the most renowned first, yours among them
    const rows = G.houses.map(H => ({ name: houseDef(H.id).name, col: houseDef(H.id).col, p: H.prestige, feud: H.grudge })).concat([{ name: 'YOU', col: '#c23b2e', p: G.fame, you: true }]).sort((a, b) => b.p - a.p);
    rows.forEach((h, i) => {
      const x = 196 + i * 62, y = 30;
      R(x - 13, y, 26, 34, '#2a1c14'); R(x - 11, y + 2, 22, 30, h.col); R(x - 11, y + 2, 22, 3, shade(h.col, 1.35)); R(x - 11, y + 2, 3, 30, shade(h.col, 0.7)); R(x - 3, y + 13, 6, 6, h.you ? '#f5d584' : '#d8cdb6');
      if (h.you) { R(x - 15, y - 2, 30, 1, '#f5d584'); R(x - 15, y + 35, 30, 1, '#f5d584'); R(x - 15, y - 2, 1, 38, '#f5d584'); R(x + 14, y - 2, 1, 38, '#f5d584'); }
      if (h.feud >= 40) for (let k = -8; k <= 8; k++) { R(x + k, y + 17 + k, 2, 2, '#1c1310'); R(x + k, y + 17 - k, 2, 2, '#1c1310'); }      // an open feud: a blade scored across it
      E.sign(x, 80, `${i + 1}. ${h.p}`, h.you);
    });
    // the bar, the man behind it, and what he pours
    R(14, 108, 150, 34, '#5e4426'); R(10, 104, 158, 5, '#8a6a3a'); R(18, 60, 140, 3, '#4a3520'); R(18, 84, 140, 3, '#4a3520');
    for (let i = 0; i < 9; i++) { E.amphora(28 + i * 15, 60, i % 3 ? '#b8703c' : '#8a5028'); E.amphora(28 + i * 15, 84, i % 2 ? '#c98a4a' : '#b8703c'); }
    E.P(84, 108, 1, { tunic: '#7a7a3a', apron: '#e8dcc0', hair: '#2a1c14' }); R(60, 108, 60, 34, '#5e4426'); R(60, 104, 60, 5, '#8a6a3a');
    // tables, with men of the other houses drinking at them
    G.houses.slice(0, 4).forEach((H, i) => {
      const x = 230 + i * 92, c = houseDef(H.id).col, lift = Math.sin(T * 1.3 + i * 2) > 0.7 ? 2 : 0;
      E.P(x - 14, 160, 1, { tunic: c, hair: '#2a1c14', skin: TOWN_SKINS[i % 4] }); E.P(x + 16, 160, -1, { tunic: shade(c, 0.8), hair: '#6a4a2a', skin: TOWN_SKINS[(i + 1) % 4] });
      R(x - 22, 146, 46, 4, '#8a6a3a'); R(x - 22, 146, 46, 1, '#a8834a'); R(x - 18, 150, 3, 16, '#5e4426'); R(x + 17, 150, 3, 16, '#5e4426');
      R(x - 9, 142 - lift, 4, 4, '#c9c2ae'); R(x + 6, 142, 4, 4, '#c9c2ae'); R(x - 1, 144, 2, 2, '#f1ead8');
    });
    R(540, 86, 40, 56, '#3a322c'); R(546, 100, 28, 42, '#170f0b'); for (let i = 0; i < 3; i++) E.flame(552 + i * 8, 140, 9 + ((i * 5 + Math.floor(T * 6)) % 5));      // the hearth
    for (const x of [250, 360, 470]) { R(x, 8, 1, 14, '#3a2a1c'); R(x - 3, 22, 7, 4, '#b98a34'); R(x - 2, 21, 5, 1, '#dcae48'); E.flame(x, 22, 4); }      // lamps hung from the beams
    R(176, 84, 14, 9, '#7a5a34'); R(178, 80, 10, 5, '#6b4526'); R(176, 86, 3, 2, '#f2ecd8'); R(187, 86, 3, 2, '#f2ecd8'); R(181, 83, 1, 1, '#1c1310'); R(185, 83, 1, 1, '#1c1310');      // a boar's head over the bar
    const cy = 176 + Math.round(Math.sin(T * 0.6));                                                                // the tavern cat
    R(196, cy - 3, 9, 3, '#3a3a3a'); R(204, cy - 5, 4, 4, '#3a3a3a'); R(204, cy - 6, 1, 1, '#3a3a3a'); R(207, cy - 6, 1, 1, '#3a3a3a'); R(193, cy - 4 - (Math.sin(T * 2) > 0 ? 1 : 0), 3, 1, '#3a3a3a'); R(206, cy - 4, 1, 1, '#e8c84a');
    R(152, 150, 10, 2, '#6b4f2c'); R(155, 152, 2, 12, '#5e4426'); R(174, 150, 10, 2, '#6b4f2c'); R(177, 152, 2, 12, '#5e4426');      // stools at the bar
    E.lamp(176, 70); E.lamp(400, 100);
  } },

  // ---- your own house: the court, and the household you have hired ----
  facilities: { draw(E) {
    const { R, T } = E, st = G.staff;
    R(50, 58, 490, 66, '#e8dcc0'); R(50, 58, 490, 2, '#f8f0dc'); R(50, 116, 490, 8, '#c9b890'); E.tiles(42, 46, 506, 12);
    for (let x = 80; x < 520; x += 62) { R(x, 72, 14, 20, '#3a2a1c'); R(x, 72, 14, 2, '#8a6a3a'); R(x + 6, 72, 1, 20, '#8a6a3a'); }
    R(270, 78, 50, 46, '#3a2416'); R(266, 74, 58, 4, '#8a6a3a'); R(294, 78, 2, 46, '#5a3c20');          // the door
    for (const x of [236, 344]) E.column(x, 66, 54);
    E.paving(124, '#d8c9a8', '#c4b490');
    R(250, 150, 90, 18, '#b8ab94'); R(254, 153, 82, 12, '#4f8fb8'); for (let i = 0; i < 4; i++) R(260 + ((i * 23 + Math.floor(T * 6)) % 70), 156 + (i % 2) * 4, 5, 1, '#d6ecf8');        // the pool in the court
    for (const x of [70, 150, 440, 520]) { R(x - 8, 132, 16, 8, '#7a5a34'); R(x - 7, 124, 14, 9, '#5d7f3f'); R(x - 4, 120, 8, 5, '#6f8f48'); R(x - 2, 122, 2, 2, '#e8a0a0'); }
    // the household: whoever you have taken on, each at his work
    let n = 0;
    const post = (role, x, o, word) => { if (!st[role]) return; E.P(x, 150 + (n++ % 2) * 6, x < 295 ? 1 : -1, o); E.sign(x, 178, `${word} ${'●'.repeat(st[role].skill)}`); };
    post('doctore', 110, { tunic: '#8a4a3a', hair: '#8a8a8a', item: 'staff' }, 'DOCTORE');
    post('medicus', 200, { tunic: '#f1ead8', hair: '#3a2a1c', item: 'bag' }, 'MEDICUS');
    post('cook', 390, { tunic: '#a8763a', apron: '#f1ead8', hair: '#2a1c14', item: Math.sin(T * 2) > 0 ? 'ladle' : 'pot' }, 'COOK');
    post('scout', 480, { tunic: '#3f7a5a', hair: '#6a4a2a', item: 'scroll' }, 'SCOUT');
    if (!n) E.sign(295, 178, 'NO HOUSEHOLD HIRED YET');
    // the strongbox by the door: fuller the richer you are, and men waiting for it when you owe
    R(336, 112, 22, 12, '#5e4426'); R(336, 112, 22, 2, '#8a6a3a'); R(346, 116, 2, 3, '#e0aa3e');
    for (let i = 0, c = Math.min(14, Math.floor(Math.max(0, G.denarii) / 120)); i < c; i++) R(338 + (i % 7) * 3, 110 - Math.floor(i / 7) * 2, 2, 2, '#e8b545');
    if (G.denarii < 0) { E.P(366, 126, -1, { tunic: '#3a3a44', hair: '#2a1c14', item: 'scroll' }); E.P(380, 128, -1, { tunic: '#4a3a3a', hair: '#8a8a8a' }); E.sign(372, 100, 'THE CREDITORS', true); }
    E.shade(50, 124, 490);
    // what you have built: a plaque on the wall for each, with its pips
    [['shrine', 96], ['stores', 186], ['stables', 450]].forEach(([k, x]) => E.sign(x, 106, `${FACILITIES[k].name.split(' ')[0].toUpperCase()} ${'●'.repeat(G.fac[k])}${'○'.repeat(3 - G.fac[k])}`, G.fac[k] >= 3));
    for (let gy = 132; gy < 148; gy += 4) for (let gx = 258 + (gy % 8 ? 0 : 3); gx < 336; gx += 6) R(gx, gy, 3, 2, (gx + gy) % 3 ? '#c9b890' : '#a8452e');      // a mosaic walk up to the door
    R(52, 60, 6, 64, '#d8cdb6'); R(532, 60, 6, 64, '#d8cdb6'); R(52, 60, 1, 64, '#f0e8d6'); R(537, 60, 1, 64, '#b5aa94');
    for (let i = 0; i < 3; i++) { const q = (T * 0.25 + i / 3) % 1; E.ctx().globalAlpha = 0.4 * (1 - q); R(470 + Math.sin(q * 5 + i) * 3 + q * 8, 44 - q * 30, 3 + Math.round(q * 4), 3, '#d8d4cc'); } E.ctx().globalAlpha = 1; R(468, 40, 6, 8, '#8f8a84');      // the kitchen chimney
    E.lamp(228, 110); E.lamp(360, 96);
  } },

  // ---- the record house: shelves that fill as your chronicle grows ----
  chronicle: { indoor: true, draw(E) {
    const { R, T } = E;
    R(0, 0, 590, 142, '#8a7a66'); R(0, 0, 590, 6, '#5e4c3a'); R(0, 142, 590, 48, '#6b5a48'); for (let i = 0; i < 60; i++) R((i * 97) % 588, 146 + (i * 41) % 42, 6, 1, '#5a4a3a');
    // the shelves: a scroll for every few entries, so a long history fills the wall
    R(24, 22, 372, 104, '#4a3520'); for (let r = 0; r <= 4; r++) R(24, 22 + r * 26, 372, 3, '#6b4f2c'); for (let c = 0; c <= 12; c++) R(24 + c * 31, 22, 2, 104, '#6b4f2c');
    const scrolls = Math.min(144, Math.floor(G.log.length / 2) + G.day);
    for (let i = 0; i < scrolls; i++) { const cell = i % 48, k = Math.floor(i / 48), cx = 28 + (cell % 12) * 31 + k * 8, cy = 40 - k * 5 + Math.floor(cell / 12) * 26; R(cx, cy, 7, 6, '#f1ead8'); R(cx, cy, 7, 1, '#ffffff'); R(cx + 2, cy + 2, 3, 2, i % 5 ? '#c9c0aa' : '#a02d22'); }
    E.sign(210, 16, `DAY ${G.day}  -  ${G.tally.wins} WON, ${G.tally.losses} LOST`);
    // the dead of the house: an urn each, on the shelf by the window
    R(416, 70, 120, 3, '#6b4f2c');
    G.fallen.slice(-9).forEach((f, i) => { const x = 424 + i * 13; R(x - 3, 60, 7, 10, '#5a5e64'); R(x - 2, 57, 5, 3, '#7d8288'); R(x - 3, 63, 7, 1, '#3a3d42'); });
    if (G.fallen.length) E.sign(476, 84, `${G.fallen.length} FALLEN`);
    R(440, 20, 70, 34, E.sky.bands[1]); R(438, 18, 74, 3, '#5e4c3a'); R(438, 54, 74, 3, '#5e4c3a'); R(474, 20, 2, 34, '#5e4c3a'); R(438, 36, 74, 2, '#5e4c3a');      // the window
    if (G.won) { for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; R(560 + Math.cos(a) * 9, 40 + Math.sin(a) * 9, 4, 3, '#5d7f3f'); } R(558, 50, 6, 2, '#e8b545'); }      // the laurel, if you have won it
    // the keeper of the rolls, writing
    R(430, 128, 70, 5, '#6b4f2c'); R(434, 133, 4, 22, '#5e4426'); R(492, 133, 4, 22, '#5e4426'); R(444, 124, 30, 4, '#f1ead8'); R(446, 126, 20 + Math.round((T * 3) % 8), 1, '#6b573c');
    E.P(466, 156, -1, { tunic: '#e8dcc0', hair: '#c9c2b2', item: 'scroll' }); R(430, 128, 70, 5, '#6b4f2c'); R(444, 124, 30, 4, '#f1ead8');
    // a ladder to the high shelves, and on the far wall a map of the province, coloured in as far as you have walked it
    R(150, 30, 2, 112, '#8a6a3a'); R(166, 30, 2, 112, '#8a6a3a'); for (let y = 40; y < 140; y += 12) R(150, y, 18, 2, '#a8834a');
    R(524, 88, 56, 42, '#5e4c3a'); R(527, 91, 50, 36, '#d7c59c');
    const seen = typeof wildExplored === 'function' ? wildExplored() : 0;
    for (let i = 0; i < 60; i++) { const mx = 529 + (i * 7) % 46, my = 93 + (i * 11) % 32; if (i / 60 < seen) R(mx, my, 4, 3, i % 3 ? '#7e9a4b' : '#5d7f3f'); }
    R(540, 108, 3, 3, '#a02d22'); E.sign(552, 84, `THE PROVINCE: ${Math.round(seen * 100)}%`);
    R(420, 148, 12, 5, '#c98a4a'); R(430, 145, 5, 5, '#c98a4a'); R(430, 144, 1, 1, '#c98a4a'); R(434, 144, 1, 1, '#c98a4a'); R(417, 150 - (Math.sin(T * 1.5) > 0.6 ? 1 : 0), 4, 1, '#c98a4a');      // the keeper's cat, asleep in the warm
    E.lamp(486, 126); E.lamp(404, 60);
  } },
};
