'use strict';
// The picture beside the town. At your own school it is the yard (yard.js); at any other door in the village it is
// that place: the market with the men who are really for sale, the forge with the smith's real stock on the wall,
// the tavern with the houses' shields hung in order of their renown, and so on. Each is drawn on the yard's canvas
// and its 590 by 190 grid, under the yard's sky and weather, and shows the state of the game as well as the place.

let placeLayer = null, placeMask = null;
const RAR_COL = ['#8a8a8a', '#c2b79d', '#7fb85a', '#5aa0e0', '#b77be8', '#e8b545', '#f0705e'];
const PLACE_TIPS = {
  market: 'The slave market. The men on the block are the ones for sale today; the pen holds any the dealer is keeping for you, and a gold dais is a prize lot up for auction.',
  smith: 'The forge. What hangs on the wall is what the smith has to sell; the colours are the grades. Your armourer works at the bench, and a commission waits under its cloth.',
  arena: 'The arena from the street. It grows with your name: a fence of logs round the pits, then arches of timber and of stone, and at the last the purple of the Emperor down its walls. On games days the town queues at its gates. The statue is the champion, the wreaths are your festival crowns, and the bookmakers keep their board by the wall.',
  contracts: 'The forum. Each tablet on the board is an offer of work; a gold one asks for you by name. A rail for the mules of the carriers stands at the corner, and the packs by the road belong to men who are away.',
  patrons: 'The temple. The three fires burn as high as each patron\'s favour. Your own shrine stands to the right of the steps.',
  rivals: 'The tavern. The shields on the wall are the schools of the province, the most renowned first: click one to read that house. A crown marks the house that holds the championship, and a laurel the last tournament\'s winner. The man under the town\'s talk keeps a book on the houses\' own bouts, and there are dice in the corner.',
  facilities: 'Your own house. The people in the court are the staff you have hired; those waiting by the wall are looking for a place. The granary and its garden stand at the corner.',
  chronicle: 'The record house. The shelves fill as your chronicle grows; the urns are your dead, the busts your line, and the wreaths the festival crowns the house has won.',
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
  const sky = yardSky(T), wx = yardWeather(T), late = [], lamps = [], fires = [], shafts = [];
  if (wx.over > 0) {
    const grey = mixHex('#8d98a3', '#1a2030', sky.night);
    sky.bands = sky.bands.map(c => mixHex(c, grey, wx.over * 0.8));
    sky.tint = mixHex(sky.tint, mixHex('#aab2c0', '#59669c', sky.night), wx.over * 0.75);
  }
  ctx.setTransform(S, 0, 0, S, 0, 0); ctx.imageSmoothingEnabled = false;
  if (scene.indoor) R(0, 0, 590, 190, '#1c1410');
  else {                                        // the sky, with the sun or the moon on its way across
    sky.cloud = mixHex(sky.cloud, mixHex('#7f8894', '#2a3248', sky.night), wx.over * 0.7);
    sceneSkyDraw(ctx, T, sky, wx, 122); sceneBirds(ctx, T, sky, wx, 122, tab.length);
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
    walker: (i, y, speed, o) => { const x = (((i * 137 + T * speed) % 660) + 660) % 660 - 35, lap = Math.floor((i * 137 + T * speed) / 660), k = Math.abs(i * 5 + lap * 3) % 8, carry = (o && o.item) ? {} : k === 1 ? { item: 'basket' } : k === 3 ? { item: 'jar' } : k === 5 ? { item: 'sack' } : {}; yardPerson(ctx, Math.round(x), y, speed > 0 ? 1 : -1, Object.assign({ tunic: '#8a4a3a', moving: true, walk: T * 9 + i }, o, carry)); },      // some of them are carrying something home, and not the same thing each time they come by
    sign: (x, y, text, gold) => late.push(() => {
      ctx.font = 'bold 6px Consolas, monospace'; ctx.textAlign = 'center';
      const w = Math.ceil(ctx.measureText(text).width) + 8;
      scenePlaque(ctx, x, y, w, gold);
      ctx.fillStyle = gold ? '#ffe9a0' : '#f2e6cc'; ctx.fillText(text, x, y);
    }),
    lamp: (x, y) => lamps.push([x, y]),
    fire: (x, y, r) => fires.push([x, y, r]),            // a hearth: it lights the room about it, and flickers
    shaft: pts => shafts.push(pts),                      // daylight (or the moon) coming in: the four corners of where it falls, from the opening round to the floor
    flame: (x, y, h, col) => sceneFlame(ctx, T, x, y, h, col),
    column: (x, y, h) => { R(x, y, 7, h, '#e8e2d2'); R(x + 5, y, 2, h, '#c9c2ae'); R(x + 2, y, 1, h, '#f8f4ea'); R(x + 3, y + 2, 1, h - 4, '#d6cfbc'); R(x - 2, y - 3, 11, 3, '#d8d2c0'); R(x - 3, y - 4, 13, 1, '#f0ebde'); R(x - 2, y, 11, 1, 'rgba(0,0,0,.14)'); R(x - 2, y + h, 11, 3, '#c9c2ae'); R(x - 3, y + h + 2, 13, 1, '#b5ad98'); },
    tiles: (x, y, w, h) => { R(x, y, w, h, '#b5522e'); for (let i = 0; i < w; i += 6) { R(x + i, y, 1, h, '#963f22'); R(x + i + 1, y, 1, h, '#c66444'); if (i + 3 < w) R(x + i + 2, y + h, 3, 1, '#c9684a'); } R(x, y, w, 1, '#d87650'); if (h > 4) R(x, y + (h >> 1), w, 1, 'rgba(60,20,8,.18)'); R(x, y + h + 1, w, 1, 'rgba(0,0,0,.22)'); },
    // the ground: stones laid in courses that widen toward you, their joints faint, worn pale down the middle where feet go
    paving: (y, c, d) => {
      R(0, y, 590, 190 - y, c);
      for (let yy = y + 3, hr = 4, r = 0; yy < 190; yy += hr, hr += 2, r++) { R(0, yy, 590, 1, 'rgba(40,24,8,.10)'); R(0, yy + 1, 590, 1, 'rgba(255,244,214,.05)'); const pitch = 26 + r * 7; for (let x = ((r % 2) * pitch) / 2 + (r * 13) % 9; x < 590; x += pitch) R(x, yy + 1, 1, hr - 1, 'rgba(40,24,8,.08)'); }
      for (let i = 0; i < 110; i++) R((i * 97) % 588, y + 3 + (i * 53) % (186 - y), 3 + (i % 3) * 2, 1, d);
      for (let i = 0; i < 9; i++) { const ox = 30 + (i * 149) % 520, oy = y + 10 + (i * 37) % Math.max(6, 170 - y), rx = 30 + (i % 4) * 12; for (let dy = -3; dy <= 3; dy++) { const w = Math.round(rx * Math.sqrt(1 - (dy * dy) / 12)); R(ox - w, oy + dy, w * 2, 1, i % 3 ? 'rgba(255,244,205,.06)' : 'rgba(60,40,14,.06)'); } }
      R(0, y, 590, 2, 'rgba(40,24,8,.3)'); R(0, y + 2, 590, 3, 'rgba(40,24,8,.10)');
      for (let i = 0; i < 40; i++) { const wx2 = (i * 131 + 17) % 586, tall = i % 5 === 0; R(wx2, y - (tall ? 3 : 1), 1, tall ? 4 : 2, '#5f7f3f'); R(wx2 + 1, y - 1, 1, 2, '#7a9a4b'); if (tall) R(wx2, y - 4, 1, 1, i % 2 ? '#e8a0a0' : '#f2e6a0'); }      // PASS 34: weeds where the wall meets the ground
      for (let i = 0; i < 14; i++) { const wx2 = (i * 211 + 60) % 580, wy = y + 12 + (i * 37) % Math.max(6, 170 - y); R(wx2, wy, 1, 2, '#6f8a4a'); R(wx2 + 1, wy + 1, 1, 1, '#84a05a'); }                                                                              // and coming up between the stones
    },
    // PASS 25. the floor of a room: stone flags, boards or tiles, laid so that they widen toward you
    floor: (y, c, d, kind) => {
      R(0, y, 590, 190 - y, c);
      for (let yy = y + 2, hr = 5, r = 0; yy < 190; yy += hr, hr += 3, r++) {
        R(0, yy, 590, 1, d); R(0, yy + 1, 590, 1, 'rgba(255,240,210,.05)');
        const pitch = kind === 'boards' ? 70 + r * 22 : kind === 'tiles' ? 24 + r * 9 : 34 + r * 12;
        for (let x = ((r * 37) % pitch) - pitch; x < 590; x += pitch) { if (x > 0) R(x, yy + 1, 1, hr - 1, d); const v = wildHash(Math.round(x), r, 1602); if (v > 0.7) R(Math.max(0, x + 1), yy + 1, pitch - 1, hr - 1, 'rgba(255,240,210,.05)'); else if (v < 0.25) R(Math.max(0, x + 1), yy + 1, pitch - 1, hr - 1, 'rgba(0,0,0,.07)'); if (kind === 'tiles' && (Math.round(x / pitch) + r) % 2) R(Math.max(0, x + 1), yy + 1, pitch - 1, hr - 1, 'rgba(0,0,0,.06)'); }
      }
      R(0, y, 590, 2, shade(d, 0.7)); R(0, y + 2, 590, 4, 'rgba(0,0,0,.12)');
    },
    // the shade a building throws on the ground before it: deeper and longer when the sun is low
    shade: (x, y, w) => {
      const len = 3 + Math.round(sky.shadow.len * 0.9), dx = x <= 0 && w >= 590 ? 0 : sceneSun * Math.round(len * (0.5 + sceneLow * 1.4)), c2 = ctx;
      c2.fillStyle = `rgba(40,24,8,${((0.13 + sky.shadow.len * 0.008) * (sky.sun ? 1 : 0.5) * (1 - wx.over * 0.5)).toFixed(3)})`;
      c2.beginPath(); c2.moveTo(x, y); c2.lineTo(x + w, y); c2.lineTo(x + w + dx, y + len); c2.lineTo(x + dx, y + len); c2.closePath(); c2.fill();      // slanting away from the sun; a wall right across the picture throws a straight band
    },
    pips: (l, n) => '●'.repeat(Math.max(0, Math.min(n, l))) + '○'.repeat(Math.max(0, n - l)),
    // courses of brick or dressed stone across a wall
    brick: (x, y, w, h, c) => { for (let r = 0; r * 6 < h; r++) { for (let q = (r % 2) * 9 + 4 - 18, k = 0; q < w; q += 18, k++) { const v = wildHash(x + q, y + r, 1600); if (v > 0.72) R(Math.max(x, x + q + 1), y + r * 6, Math.min(17, x + w - Math.max(x, x + q + 1)), 5, 'rgba(255,244,214,.07)'); else if (v < 0.24) R(Math.max(x, x + q + 1), y + r * 6, Math.min(17, x + w - Math.max(x, x + q + 1)), 5, 'rgba(40,24,8,.07)'); } R(x, y + r * 6, w, 1, 'rgba(255,248,224,.08)'); R(x, y + r * 6 + 5, w, 1, c); for (let q = (r % 2) * 9 + 4; q < w; q += 18) R(x + q, y + r * 6, 1, 5, c); } },      // each stone a shade of its own, lit along its top
    wreath: (x, y, c) => { R(x - 3, y - 4, 6, 1, c); R(x - 4, y - 3, 1, 5, c); R(x + 3, y - 3, 1, 5, c); R(x - 3, y + 2, 6, 1, c); R(x - 1, y + 3, 2, 2, '#a02d22'); },
    barrel: (x, y) => { R(x - 6, y - 1, 14, 2, 'rgba(0,0,0,.2)'); R(x - 5, y - 12, 10, 12, '#7a5a34'); R(x - 4, y - 11, 1, 10, '#94703f'); R(x - 5, y - 12, 10, 1, '#94703f'); R(x - 5, y - 9, 10, 1, '#3a2a1c'); R(x - 5, y - 4, 10, 1, '#3a2a1c'); R(x + 3, y - 12, 2, 12, '#5e4426'); },
    crate: (x, y, w, h) => { R(x - 1, y - 1, w + 4, 2, 'rgba(0,0,0,.2)'); R(x, y - h, w, h, '#8a6a3a'); R(x + w - 1, y - h, 1, h, '#6e5230'); R(x, y - h, 1, h, '#9c7c48'); R(x, y - h, w, 1, '#a8834a'); R(x, y - 1, w, 1, '#5e4426'); R(x + Math.floor(w / 2), y - h, 1, h, '#5e4426'); },
    sack: (x, y, c) => { R(x - 5, y - 1, 11, 2, 'rgba(0,0,0,.2)'); R(x - 4, y - 7, 8, 7, c || '#c9b48a'); R(x - 3, y - 6, 1, 5, 'rgba(255,255,255,.18)'); R(x - 3, y - 9, 6, 2, c || '#c9b48a'); R(x - 1, y - 10, 2, 1, '#8a6a3a'); R(x - 4, y - 1, 8, 1, '#a8956a'); },
    cypress: (x, y, h) => { R(x - 4, y - 1, 11, 2, 'rgba(0,0,0,.18)'); R(x, y - 3, 2, 3, '#3a2a1c'); for (let q = 0; q < h; q++) { const w = Math.round(Math.sin(q / h * Math.PI) * 4) + 1; R(x + 1 - w, y - 3 - q, w * 2, 1, q % 3 ? '#35543a' : '#416446'); if (w > 1) { R(x + 1 - w, y - 3 - q, 1, 1, '#527a56'); R(x + w, y - 3 - q, 1, 1, '#294430'); } if (q % 4 === 1 && w > 2) R(x, y - 3 - q, 1, 1, '#294430'); } },
    // a mule, feet at x, y; d is 1 facing right
    mule: (x, y, d, c) => { const b = c || '#8a6a4a', k = shade(b, 0.7); R(x - 8, y - 13, 16, 7, b); R(x - 8, y - 13, 16, 1, shade(b, 1.2)); R(x - 7, y - 6, 2, 6, k); R(x - 3, y - 6, 2, 6, k); R(x + 3, y - 6, 2, 6, k); R(x + 6, y - 6, 2, 6, k);
      R(x + d * 7 - (d < 0 ? 3 : 0), y - 18, 4, 7, b); R(x + d * 9 - (d < 0 ? 5 : 0), y - 20, 6, 4, b); R(x + d * 9 - (d < 0 ? 0 : 0), y - 23, 1, 3, k); R(x + d * 12 - (d < 0 ? 0 : 0), y - 23, 1, 3, k); R(x - d * 9, y - 12, 1, 5 + (Math.sin(T * 3 + x) > 0.6 ? 1 : 0), k); R(x + d * 13 - (d < 0 ? 1 : 0), y - 18, 2, 2, '#e8dcc0'); },
    amphora: (x, y, c) => { R(x - 3, y, 8, 1, 'rgba(0,0,0,.2)'); R(x - 2, y - 9, 5, 8, c || '#b8703c'); R(x - 1, y - 8, 1, 6, 'rgba(255,255,255,.2)'); R(x - 1, y - 12, 3, 3, c || '#b8703c'); R(x - 3, y - 11, 1, 3, '#8a5028'); R(x + 3, y - 11, 1, 3, '#8a5028'); R(x - 1, y - 1, 3, 2, '#8a5028'); },
  };
  if (!scene.indoor) {                          // the country beyond the town: two ranges of hills, cypresses, a roof or two
    sceneHills(ctx, 100, sky, 28, 2 + tab.length, T);
    sceneTown(ctx, 122, tab.length, T);
    for (const [cx, ch] of [[18, 34], [44, 26], [556, 30], [578, 38], [300, 22]]) E.cypress(cx, 122, ch);
  }
  scene.draw(E);
  placeGuest(E, tab);                           // and the master of the house, if he has come in
  if (!scene.indoor && sky.night < 0.6 && wx.rain < 0.4) {      // a dog with business of its own goes through, now and then
    const cyc = ((T + tab.length * 17) % 61) / 14;
    if (cyc < 1) { const d = tab.length % 2 ? 1 : -1, dx = Math.round(d > 0 ? -20 + cyc * 640 : 610 - cyc * 640), dy = 184, st = Math.sin(T * 14) > 0 ? 1 : 0, c = ['#8a6a4a', '#c9b48a', '#3a322c'][tab.length % 3], F = (px, py, w, hh, col) => R(d > 0 ? dx + px : dx - px - w, dy + py, w, hh, col);
      R(dx - 6, dy, 13, 2, 'rgba(0,0,0,.2)'); F(-5, -7, 10, 4, c); F(4, -10, 4, 4, c); F(7, -8, 2, 2, c); F(5, -11, 1, 2, shade(c, 0.7)); F(8, -8, 1, 1, '#1c1310'); F(-6, -9 - (Math.sin(T * 9) > 0 ? 1 : 0), 1, 3, c); F(-4 + st, -3, 1, 3, shade(c, 0.75)); F(-1 - st, -3, 1, 3, shade(c, 0.75)); F(2 + st, -3, 1, 3, shade(c, 0.75)); F(4 - st, -3, 1, 3, shade(c, 0.75)); }
  }
  if (!scene.indoor && sky.night < 0.45 && wx.rain < 0.3) {     // PASS 16: two children, one after the other, right across the picture
    const cyc = ((T + tab.length * 29) % 47) / 9;
    if (cyc < 1) { const d = tab.length % 2 ? -1 : 1, cx = d > 0 ? -20 + cyc * 640 : 610 - cyc * 640; sceneChild(ctx, cx, 178, d, T * 14, '#b85a48'); sceneChild(ctx, cx - d * (16 + Math.sin(T * 2) * 5), 181, d, T * 14 + 2, '#5a8a9a'); }
  }
  if (!scene.indoor) {                          // PASS 17: a cat, sat where it can see everything; its eyes show in the dark
    const cx = tab.length % 2 ? 22 + (tab.length * 7) % 30 : 540 + (tab.length * 5) % 30, cy = 150, d = cx < 295 ? 1 : -1, c = ['#3a322c', '#c98a4a', '#e8e2d2', '#8a8478'][tab.length % 4], tail = Math.sin(T * 1.3) > 0.3 ? 1 : 0, F = (px, py, w, hh, col) => R(d > 0 ? cx + px : cx - px - w, cy + py, w, hh, col);
    R(cx - 4, cy, 9, 1, 'rgba(0,0,0,.2)'); F(-3, -6, 6, 6, c); F(0, -10, 4, 5, c); F(0, -11, 1, 1, c); F(3, -11, 1, 1, c); F(-4 - tail, -2, 2, 1, c); F(-5 - tail, -3 - tail, 1, 2, c); F(-3, -6, 1, 6, shade(c, 0.8));
    if (sky.night > 0.4) { F(1, -8, 1, 1, '#c8f060'); F(3, -8, 1, 1, '#c8f060'); } else if (Math.sin(T * 0.7) > 0.96) F(1, -8, 3, 1, shade(c, 0.6));
  }
  if (!scene.indoor && sky.night < 0.5 && wx.rain < 0.3) {      // pigeons, wherever people are
    const up = ((T + tab.length * 17) % 61) / 14, fl = up > 0.05 && up < 0.5 ? (up - 0.05) / 0.45 : 0;      // PASS 35: they go up together when the dog comes through, wheel, and settle again
    for (let i = 0; i < 6; i++) { const px = 60 + ((i * 163 + tab.length * 37) % 470), py = 176 + (i % 2) * 6, peck = Math.sin(T * 5 + i * 1.7) > 0.5 ? 1 : 0; if (fl > 0) { const a = Math.sin(fl * Math.PI), fx = px + Math.sin(fl * 6 + i) * 40 * a, fy = py - a * (70 + i * 6), wg = Math.sin(T * 20 + i) > 0 ? 1 : 0; R(fx, fy - 1, 3, 2, i % 2 ? '#8f97a0' : '#c9d1d9'); R(fx - 2, fy - 1 - wg, 2, 1, '#6f7780'); R(fx + 3, fy - 1 - wg, 2, 1, '#6f7780'); } else { R(px, py - 2, 3, 2, i % 2 ? '#8f97a0' : '#c9d1d9'); R(px + 2, py - 3 + peck, 1, 1, '#6f7780'); R(px, py, 1, 1, '#c98a4a'); R(px - 1, py, 5, 1, 'rgba(0,0,0,.14)'); } }
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
    ctx.globalCompositeOperation = 'source-over'; sceneGlow(ctx, lx, ly - 4, 30, '255,170,80', 0.4 * la); if (!scene.indoor) sceneMoths(ctx, T, lx, ly - 6, la);
    if (scene.indoor) for (let q = 0; q < 4; q++) { const an = T * (0.25 + q * 0.07) + lx + q * 1.7, mx = lx + Math.cos(an) * (8 + q * 5), my = ly - 6 + Math.sin(an * 1.3) * (6 + q * 3); ctx.fillStyle = `rgba(255,236,190,${(0.25 + 0.2 * Math.sin(T * 1.1 + q + lx)).toFixed(3)})`; ctx.fillRect(Math.round(mx), Math.round(my), 1, 1); }      // dust turning in the lamplight
  }
  if (scene.indoor) {
    const fy = scene.floor || 142, day = (1 - sky.night) * (1 - wx.over * 0.6);
    const cg = ctx.createLinearGradient(0, 0, 0, 74); cg.addColorStop(0, 'rgba(10,6,4,.4)'); cg.addColorStop(1, 'rgba(10,6,4,0)'); ctx.fillStyle = cg; ctx.fillRect(0, 0, 590, 74);      // the roof timbers lost in the dark
    for (const side of [0, 1]) { const eg = ctx.createLinearGradient(side ? 590 : 0, 0, side ? 520 : 70, 0); eg.addColorStop(0, 'rgba(10,6,4,.3)'); eg.addColorStop(1, 'rgba(10,6,4,0)'); ctx.fillStyle = eg; ctx.fillRect(side ? 520 : 0, 0, 70, 190); }
    for (const [lx] of lamps) scenePool(ctx, lx, fy + 14, 46, '255,170,80', 0.15 * la);
    for (const [fx, fy2, fr] of fires) { const k = 0.82 + 0.18 * Math.sin(T * 9 + fx) * Math.sin(T * 5.3 + 1); sceneGlow(ctx, fx, fy2, fr, '255,140,60', 0.3 * k); scenePool(ctx, fx, fy + 16, fr * 1.3, '255,150,70', 0.2 * k); }
    for (const pts of shafts) {
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = day > 0.15 ? `rgba(255,240,200,${(0.13 * day).toFixed(3)})` : `rgba(150,170,255,${(0.06 * sky.night * (1 - wx.over)).toFixed(3)})`;
      ctx.beginPath(); pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(pts[3][0], pts[3][1]); ctx.lineTo(pts[2][0], pts[2][1]); ctx.lineTo(pts[2][0] + 6, pts[2][1]); ctx.lineTo(pts[3][0] + 14, pts[3][1] - 10); ctx.closePath(); ctx.fill();      // brighter where it lands
      ctx.globalCompositeOperation = 'source-over';
      if (day > 0.15) for (let q = 0; q < 9; q++) { const u = (q * 0.37 + 0.1) % 1, v = (T * (0.02 + (q % 3) * 0.008) + q * 0.19) % 1, ax = pts[0][0] + (pts[1][0] - pts[0][0]) * u, ay = pts[0][1] + (pts[1][1] - pts[0][1]) * u, bx = pts[3][0] + (pts[2][0] - pts[3][0]) * u, by = pts[3][1] + (pts[2][1] - pts[3][1]) * u; ctx.fillStyle = `rgba(255,248,220,${(0.5 * day * Math.sin(v * Math.PI)).toFixed(3)})`; ctx.fillRect(Math.round(ax + (bx - ax) * v + Math.sin(T + q) * 2), Math.round(ay + (by - ay) * v), 1, 1); }      // dust, seen only where the light is
    }
  }
  if (!scene.indoor) { if (wx.wet > 0) R(0, 120, 590, 70, `rgba(60,45,30,${(0.16 * wx.wet).toFixed(3)})`); sceneRain(ctx, 590, 190, T, wx.rain); sceneAir(ctx, T, sky, wx, 128, true); sceneWet(ctx, T, sky, wx, 128, lamps, [], true); }
  if (!scene.indoor && tab !== 'arena' && E.games) sceneBunting(ctx, T, 40, 550, 44, wx);
  if (!scene.indoor) sceneGrade(ctx, sky, wx);
  late.forEach(f => f());
  sceneVignette(ctx, 590, 190, scene.indoor ? 0.42 : 0.3);
}

// A row of townsfolk in assorted tunics, for wherever a crowd is wanted.
const TOWN_TUNICS = ['#8a4a3a', '#4a6a8a', '#7a7a3a', '#6a4a7a', '#3f7a5a', '#a8763a', '#8a8a8a', '#b06a8a', '#5a8a9a'];
const TOWN_SKINS = ['#d9a57c', '#c9966c', '#8a5a3a', '#e3b48f'];
const townsman = i => ({ tunic: TOWN_TUNICS[i % 9], skin: TOWN_SKINS[i % 4], hair: i % 2 ? '#2a1c14' : '#6a4a2a' });

// The lanista, in the picture of whatever place he has gone into (vil.inside, see village.js). He comes in at the side
// the door is on, goes to whatever is being read in the list beside the picture, and points it out; with nothing of
// the place's chosen, he waits where a visitor would. Sent somewhere else (vil.leaving, see village.js) he goes back to the door at a good pace, and only then comes out on the map of the town. For each place: where he comes in, the line he walks, where he
// waits, and (point) what he should be pointing at just now: { x, y } of the thing, and frame: [w, h] to ring it.
const sceneGuests = {};
const GUEST = {
  smith: () => { const stock = G.smith.stock.slice(0, 12), i = stock.findIndex(it => it.id === ui.isel);
    return { door: 568, y: 160, wait: 524, point: i >= 0 ? { x: 308 + (i % 6) * 40, y: 62 + Math.floor(i / 6) * 52, frame: [26, 43] } : null }; },
  contracts: () => { const offers = (G.contracts || []).slice(0, 8), i = offers.findIndex(c => c.id === ui.csel);
    return { door: 20, y: 150, wait: 150, point: i >= 0 ? { x: 221 + (i % 4) * 34, y: 87 + Math.floor(i / 4) * 21 } : null }; },
  market: () => { const men = (G.market || []).slice(0, 6), i = men.findIndex(m => m.id === ui.msel);
    return { door: 570, y: 182, wait: 430, point: i >= 0 ? { x: 216 + i * (men.length > 4 ? 30 : 36), y: 104, frame: [16, 46] } : null }; },
  rivals: () => { const rows = G.houses.map(H => ({ id: H.id, p: H.prestige })).concat([{ p: G.fame, you: true }]).sort((a, b) => b.p - a.p), i = rows.findIndex(h => h.id !== undefined && h.id === ui.hsel);
    return { door: 14, y: 162, wait: 130, point: i >= 0 ? { x: 196 + i * 62, y: 47 } : null }; },
  patrons: () => ({ door: 20, y: 176, wait: 330, point: null }),
  arena: () => ({ door: 20, y: 176, wait: 250, point: null }),
  facilities: () => ({ door: 20, y: 176, wait: 300, point: null }),
  chronicle: () => ({ door: 20, y: 162, wait: 300, point: null }),
};
function placeGuest(E, tab) {
  if (typeof vil === 'undefined' || vil.inside !== tab || !GUEST[tab] || typeof ui === 'undefined') return;
  const { R, T } = E, o = GUEST[tab](), Gs = sceneGuests[tab] || (sceneGuests[tab] = { token: 0 }), pt = o.point;
  if (Gs.token !== vil.insideT) { Gs.token = vil.insideT; Gs.x = o.door; Gs.d = o.door > 295 ? -1 : 1; Gs.t = T; Gs.walk = 0; }      // just in: he starts at the door
  const dt = clamp(T - Gs.t, 0, 0.1); Gs.t = T;
  const lv = vil.leaving && vil.leaving.key === tab ? vil.leaving : null;      // sent elsewhere: he makes for the door
  const side = pt ? (pt.x > 40 ? -1 : 1) : 0, tx = lv ? o.door : pt ? pt.x + side * 13 : o.wait, gap = tx - Gs.x, moving = Math.abs(gap) > 1;
  if (lv) { vil.sceneT = performance.now(); if (!lv.pace) { lv.pace = 62 * LEAVE_PACE; lv.need = Math.abs(gap) / lv.pace; } if (!moving) lv.out = true; }      // half as fast again as he walks about the place, and the map waits for him
  if (moving) { const step = Math.sign(gap) * Math.min(Math.abs(gap), (lv ? lv.pace : 62) * dt); Gs.x += step; Gs.d = step > 0 ? 1 : -1; Gs.walk += dt * 11 * (lv ? LEAVE_PACE : 1); } else Gs.d = pt && !lv ? -side : (o.door > 295 ? -1 : 1);
  const X = Math.round(Gs.x), Y = o.y, d = Gs.d;
  if (pt && pt.frame && !lv) { const [fw, fh] = pt.frame, c = '#f5d584'; E.ctx().globalAlpha = 0.55 + 0.35 * Math.sin(T * 5); R(pt.x - fw / 2, pt.y - fh / 2, fw, 1, c); R(pt.x - fw / 2, pt.y + fh / 2, fw, 1, c); R(pt.x - fw / 2, pt.y - fh / 2, 1, fh, c); R(pt.x + fw / 2 - 1, pt.y - fh / 2, 1, fh + 1, c); E.ctx().globalAlpha = 1; }      // the thing in question, ringed
  E.P(X, Y, d, { tunic: '#f1ead8', hair: '#4a3320', moving, walk: Gs.walk, item: 'lanista' });
  R(d > 0 ? X : X - 1, Y - 27, 2, 16, '#7a2a8a');                                                   // the purple stripe, and the laurel
  R(X - 3, Y - 37, 6, 1, '#6f8f48'); R(d > 0 ? X + 2 : X - 3, Y - 36, 1, 1, '#6f8f48'); R(d > 0 ? X - 3 : X + 2, Y - 37, 1, 1, '#e8b545');
  if (!moving && pt && !lv) {                                                                       // his arm up, and his stick to reach what his arm cannot: gold at the tip
    const sx = X + d * 3, sy = Y - 26, ax = pt.x - d * 8 - sx, ay = pt.y - sy, n = Math.hypot(ax, ay) || 1, reach = 11 + (Math.sin(T * 2.2) > 0.6 ? 1 : 0);
    for (let q = 0; q <= reach; q += 2) R(Math.round(sx + ax / n * q) - (d > 0 ? 0 : 1), Math.round(sy + ay / n * q), 2, 2, q > reach - 3 ? '#e3b48f' : '#d9a57c');
    const far = Math.max(reach + 2, Math.min(n - 16, reach + 30)); for (let q = reach + 1; q <= far; q++) R(Math.round(sx + ax / n * q), Math.round(sy + ay / n * q), 1, 1, q > far - 2 ? '#e8b545' : '#7a5a2a');
  }
}
const PLACE_SCENES = {
  // ---- the slave market: stalls, and the block with today's men on it ----
  market: { draw(E) {
    const { R, T } = E;
    R(0, 62, 590, 60, '#c9b48a'); R(0, 62, 590, 2, '#e0cfa6');
    E.brick(0, 66, 590, 54, '#bfa87c'); R(0, 114, 590, 6, '#b39c70');
    for (const x of [186, 300, 414]) { R(x, 94, 14, 26, '#3a2416'); R(x - 2, 91, 18, 3, '#8a6a3a'); R(x + 6, 94, 1, 26, '#5a3c20'); R(x + 10, 106, 1, 2, '#c9a21e'); }      // doors along the back of the square
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
    // the pen at the end of the square: men the dealer is keeping back for you
    { const kept = (G.market || []).filter(m => m.held || m.kept).length;
      R(532, 92, 56, 40, '#2a1c14'); R(528, 88, 62, 5, '#6b4f2c'); R(528, 88, 62, 1, '#8a6a3a'); R(530, 130, 60, 3, '#5e4426');
      for (let i = 0; i < Math.min(3, kept); i++) E.P(544 + i * 14, 131, -1, { tunic: '#b8a888', skin: TOWN_SKINS[i % 4], hair: '#2a1c14' });
      for (let x = 533; x < 588; x += 6) R(x, 93, 2, 37, '#7a5a34');
      E.sign(559, 84, kept ? `HELD FOR YOU: ${kept}` : 'THE PEN', kept > 0); }
    // a prize lot stands apart, on a dais hung with gold, with the rival who wants him looking on
    if (G.auction && !G.auction.done && !G.auction.won) {
      const lot = G.auction.g, hc = houseDef(G.auction.h).col;
      R(398, 122, 22, 8, '#e8b545'); R(398, 122, 22, 2, '#fff0b0'); for (let q = 0; q < 4; q++) R(400 + q * 6, 130, 3, 3, '#b6832c');
      E.P(409, 122, -1, { tunic: '#e8dcc0', skin: lot.look ? lot.look.skin : '#c9966c', hair: lot.look ? lot.look.hair : '#2a1c14' });
      E.P(446, 168, -1, { tunic: hc, hair: '#2a1c14', item: 'bag' });
      E.sign(409, 76, 'THE PRIZE LOT: ONE BID', true);
    }
    if (G.marketOrder && CLASSES[G.marketOrder]) E.sign(180, 106, `SENT FOR: A ${CLASSES[G.marketOrder].name.toUpperCase()}`, true);
    if (typeof festToday === 'function' && festToday('triumph')) {      // the general's standard over the block, and his prisoners cheap under it
      R(294, 30, 2, 40, '#8a6230'); R(286, 32, 18, 14, '#a8261c'); R(286, 32, 18, 2, '#e8b545'); R(292, 37, 6, 4, '#e8b545'); R(292, 26, 6, 5, '#e8b545');
      E.sign(296, 62, 'SPOILS OF THE TRIUMPH', true);
    }
    if (G.staff.scout) { E.P(170, 172, 1, { tunic: '#3f7a5a', hair: '#6a4a2a', item: 'scroll' }); E.sign(170, 186, `YOUR SCOUT ${E.pips(G.staff.scout.skill, 3)}`); }
    { const free = capacity() - G.roster.length; E.sign(60, 48, free > 0 ? `YOUR CELLS: ${free} FREE` : 'YOUR CELLS ARE FULL', free > 0); }
    // a cart come in from the country, and the dealer's dog under it
    R(8, 166, 34, 9, '#7a5a34'); R(8, 166, 34, 2, '#94703f'); R(4, 170, 6, 2, '#5e4426'); for (const wx of [14, 34]) { R(wx - 4, 173, 8, 8, '#3a2a1c'); R(wx - 2, 175, 4, 4, '#8a6a3a'); R(wx - 1, 176, 2, 2, '#3a2a1c'); }
    for (let q = 0; q < 3; q++) E.sack(16 + q * 9, 166, q % 2 ? '#c9b48a' : '#b8a070');
    { const wag = Math.sin(T * 6) > 0 ? 1 : 0; R(46, 178, 9, 4, '#8a6a4a'); R(54, 176, 4, 4, '#8a6a4a'); R(54, 175, 1, 1, '#5e4426'); R(47, 182, 1, 3, '#5e4426'); R(53, 182, 1, 3, '#5e4426'); R(44, 177 - wag, 2, 1, '#8a6a4a'); }
    E.lamp(150, 110); E.lamp(430, 110);
  } },

  // ---- the forge: fire, anvil, and the smith's real stock on the wall ----
  smith: { indoor: true, floor: 140, draw(E) {
    const { R, T } = E, lv = G.smith.level;
    E.fire(76, 116, 96); E.shaft([[552, 140], [590, 140], [590, 188], [478, 188]]);
    R(0, 0, 590, 140, '#3a3430'); for (let r = 0; r < 14; r++) { R(0, r * 10 + 9, 590, 1, '#2a2522'); for (let x = (r % 2) * 14; x < 590; x += 28) R(x, r * 10, 1, 9, '#2a2522'); }
    E.floor(140, '#4a3f36', '#3a312a', 'flags'); for (let i = 0; i < 30; i++) R((i * 89) % 588, 146 + (i * 37) % 42, 3, 1, '#2e2722');      // stone flags, black with scale and coal dust
    // the hearth, its hood, and the fire
    R(24, 84, 104, 56, '#6b5a4c'); R(24, 84, 104, 3, '#85735f'); for (let i = 0; i < 5; i++) R(24, 96 + i * 10, 104, 1, '#55473b');
    for (let q = 0; q < 5; q++) R(30 - q * 4, 4 + q * 5, 92 + q * 8, 6, 'rgba(0,0,0,.07)');      // soot up the wall over the hood
    R(40, 30, 72, 54, '#2a2420'); R(40, 30, 3, 54, '#3a332e'); R(34, 76, 84, 8, '#3a322c'); R(34, 76, 84, 1, '#4a423a'); R(44, 100, 64, 30, '#170f0b');
    const glow = 0.6 + 0.4 * Math.sin(T * 7);
    R(48, 118, 56, 12, `rgba(255,${Math.round(110 + 70 * glow)},40,.9)`); for (let i = 0; i < 6; i++) E.flame(54 + i * 9, 122, 8 + ((i * 7 + Math.floor(T * 6)) % 5), i % 2 ? '#e2702a' : '#f08a3a');
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
    // beams, posts and what hangs from them
    R(0, 0, 590, 6, '#241a14'); R(0, 6, 590, 1, '#3a2a1c'); for (const x of [182, 288]) { R(x, 6, 5, 134, '#3a2a1c'); R(x, 6, 1, 134, '#55402a'); R(x - 4, 6, 13, 4, '#3a2a1c'); }
    for (let i = 0; i < 3; i++) { const hx = 204 + i * 26, hy = 62 + (i % 2) * 6; R(hx, hy, 2, 9, '#7d8288'); R(hx + 8, hy, 2, 9, '#7d8288'); R(hx, hy, 10, 2, '#8d9094'); R(hx + 4, hy - 4, 2, 4, '#6b4f2c'); }      // horseshoes
    R(236, 6, 1, 26, '#55504a'); R(232, 32, 9, 5, '#b98a34'); R(233, 31, 7, 1, '#dcae48'); E.lamp(236, 33);
    E.sign(76, 22, `THE FORGE ${E.pips(lv, 4)}`, lv >= 4);
    // the grindstone, turning: where fittings are put on
    { const a = T * 5, gx = 440, gy = 138;
      R(gx - 12, gy + 6, 24, 3, '#5e4426'); R(gx - 10, gy - 4, 3, 12, '#6b4f2c'); R(gx + 7, gy - 4, 3, 12, '#6b4f2c');
      R(gx - 7, gy - 10, 14, 14, '#8d9094'); R(gx - 5, gy - 12, 10, 18, '#8d9094'); R(gx - 9, gy - 8, 18, 10, '#8d9094'); R(gx - 5, gy - 8, 10, 10, '#a3a6aa'); R(gx - 1, gy - 4, 2, 2, '#3a2a1c');
      R(gx + Math.round(Math.cos(a) * 6), gy - 3 + Math.round(Math.sin(a) * 6), 2, 2, '#6f7478');
      if (lv >= 1) for (let i = 0; i < 3; i++) R(gx + 8 + ((Math.floor(T * 20) + i * 3) % 9), gy - 12 - ((Math.floor(T * 20) + i * 5) % 7), 1, 1, '#ffe9a0'); }
    // your own armourer, at the bench, if you keep one
    if (G.staff.faber) {
      const sw2 = (T * 1.1 + 0.4) % 1;
      E.P(372, 152, 1, { tunic: '#6a5a4a', apron: '#3a2a1c', hair: '#8a8a8a', skin: '#c9966c', item: 'hammer', swing: sw2 });
      E.sign(372, 174, `YOUR ARMOURER ${E.pips(G.staff.faber.skill, 3)}`, G.staff.faber.skill >= 3);
    } else if ((G.hires || []).some(h => h.role === 'faber')) {
      E.P(528, 156, -1, { tunic: '#6a5a4a', apron: '#3a2a1c', hair: '#2a1c14', item: 'bag' }); E.sign(520, 176, 'AN ARMOURER SEEKS A PLACE', true);
    }
    // a commission, under its cloth until the next games
    if (G.smith.order) { R(268, 106, 16, 3, '#6b4f2c'); R(274, 109, 4, 15, '#5e4426'); R(266, 96, 20, 10, '#a8261c'); R(266, 96, 20, 2, '#d0463a'); R(268, 106, 3, 3, '#a8261c'); R(281, 106, 3, 4, '#a8261c'); E.sign(276, 92, 'YOUR COMMISSION', true); }
    // ingots stacked by the wall, and a barrel of quenching oil
    for (let i = 0; i < 3 + lv * 2; i++) R(300 + (i % 4) * 9 + (Math.floor(i / 4) % 2) * 4, 136 - Math.floor(i / 4) * 4, 8, 3, i % 3 ? '#8d9094' : '#b98a34');
    E.barrel(468, 144); E.barrel(480, 146);
    E.lamp(280, 76); E.lamp(540, 44);
  } },

  // ---- the arena, from the street ----
  arena: { draw(E) {
    const { R, T } = E, t = tier(), imperial = G.won || G.fame >= FINAL_FAME, W = [{ c: '#7a5a34', d: '#5e4426', l: '#94703f' }, { c: '#a88f66', d: '#8f7650', l: '#c4ab7c' }, { c: '#b89b6e', d: '#a3875c', l: '#d8c08e' }, { c: '#d6ccb8', d: '#b5aa94', l: '#f0e8d6' }][Math.min(3, t)];
    E.paving(124, '#cdae78', '#bf9f6a');
    const rows = Math.min(4, 2 + t);                      // a greater arena stands taller
    if (t === 0) {                                        // the village pits: no arches, only a fence of split logs round a hole in a field
      for (let x = 30; x < 560; x += 6) { const hgt = 40 + ((x * 7) % 5) - (x % 18 === 0 ? 4 : 0), c = (x / 6) % 3 ? W.c : shade(W.c, 0.9); R(x, 124 - hgt, 6, hgt, c); R(x, 124 - hgt, 1, hgt, W.l); R(x + 5, 124 - hgt, 1, hgt, W.d); R(x + 1, 124 - hgt - 2, 4, 2, c); R(x + 2, 124 - hgt - 4, 2, 2, c); if ((x * 13) % 7 === 0) R(x + 2, 124 - hgt + 12 + (x % 11), 2, 3, W.d); }
      R(30, 96, 530, 3, W.d); R(30, 96, 530, 1, W.l); R(30, 112, 530, 3, W.d); R(30, 112, 530, 1, W.l);      // the rails the logs are pegged to
      for (let x = 60; x < 540; x += 96) { if (x > 230 && x < 330) continue; R(x, 70, 3, 54, '#4a3520'); R(x, 70, 1, 54, W.l); }      // and the posts that hold it up
    }
    for (let r = 0; r < (t === 0 ? 0 : rows); r++) {
      const y = 124 - (r + 1) * 26, inset = r * 8;
      R(30 + inset, y, 530 - inset * 2, 26, r % 2 ? shade(W.c, 0.94) : W.c); R(30 + inset, y, 530 - inset * 2, 2, W.l); R(30 + inset, y + 24, 530 - inset * 2, 2, W.d);
      for (let x = 46 + inset; x < 546 - inset; x += 30) { R(x, y + 8, 16, 18, '#1c1410'); R(x + 2, y + 6, 12, 2, '#1c1410'); R(x + 4, y + 4, 8, 2, '#1c1410'); R(x - 3, y + 4, 2, 22, W.d); }
    }
    const top = t === 0 ? 80 : 124 - rows * 26;
    if (E.games && t > 0) for (let r = 1; r < rows; r++) { const y = 124 - (r + 1) * 26, inset = r * 8; let n = 0;      // the town in the upper arches, on its feet
      for (let x = 46 + inset; x < 546 - inset; x += 30, n++) { if ((n * 7 + r * 3) % 4 === 0) continue; const up = Math.sin(T * 3 + n * 1.3 + r) > 0.5 ? 1 : 0;
        R(x + 3, y + 17 - up, 3, 3, TOWN_SKINS[(n + r) % 4]); R(x + 2, y + 20 - up, 5, 6 + up, TOWN_TUNICS[(n * 3 + r) % 9]); R(x + 9, y + 18, 3, 3, TOWN_SKINS[(n + r + 1) % 4]); R(x + 8, y + 21, 5, 5, TOWN_TUNICS[(n * 5 + r + 2) % 9]); } }
    for (let i = 0; i < 7; i++) { const x = 70 + i * 75; R(x, top - 14, 1, 14, '#5a4326'); R(x + 1, top - 14 + (Math.sin(T * 4 + i) > 0 ? 0 : 1), 7, 4, imperial ? (i % 2 ? '#e8b545' : '#7a3a8e') : ['#8a2a20', '#c9a21e', '#2f6db8'][i % 3]); }
    R(270, 96, 50, 28, '#120c0a'); R(274, 92, 42, 4, '#120c0a'); R(280, 88, 30, 4, '#120c0a'); R(266, 88, 4, 36, W.l); R(320, 88, 4, 36, W.l);       // the great gate
    for (let i = 0; i < 6; i++) R(273 + i * 8, 96, 1, 28, '#3a2a1c');
    if (t === 0) { R(262, 84, 66, 5, W.d); R(262, 84, 66, 1, W.l); R(290, 78, 10, 7, '#e8e2d2'); R(292, 80, 2, 2, '#1c1410'); R(296, 80, 2, 2, '#1c1410'); R(293, 83, 4, 1, '#1c1410'); }      // a beam over the way in, and an ox skull nailed to it
    if (imperial) {                                       // the Emperor's colours down the gate and along the wall, and gold on the cornice
      R(30, top, 530, 2, '#e8b545'); R(262, 84, 66, 4, '#e8b545'); R(262, 84, 66, 1, '#fff0b0');
      for (const x of [240, 334, 120, 454]) { const w = Math.sin(T * 2.4 + x) > 0 ? 1 : 0; R(x, top + 6, 16, 1, '#5a4326'); R(x + 1, top + 7, 14, 40 + w, '#7a3a8e'); R(x + 1, top + 7, 14, 2, '#9a5aaa'); R(x + 1, top + 7, 2, 40 + w, '#5a2a6a'); R(x + 5, top + 18, 6, 6, '#e8b545'); R(x + 3, top + 20, 10, 2, '#e8b545'); R(x + 1, top + 45 + w, 14, 2, '#e8b545'); }
      R(288, 124, 14, 30, '#7a3a8e'); R(288, 124, 1, 30, '#e8b545'); R(301, 124, 1, 30, '#e8b545');
    }
    if (E.games) {
      for (let i = 0; i < 13; i++) { const bx = 250 + i * 7, by = 82 + Math.round(Math.sin(i / 12 * Math.PI) * 4); R(bx, by, 7, 1, '#3a2a1c'); R(bx + 1, by + 1, 5, 3 + (Math.sin(T * 5 + i) > 0 ? 1 : 0), ['#c23b2e', '#e3b04a', '#2f6db8'][i % 3]); }
      for (let i = 0; i < 12; i++) E.P(330 + i * 17 + (i % 2) * 3, 150 + (i % 3) * 8, -1, townsman(i));          // the queue
      E.P(250, 156, 1, { tunic: '#e3b04a', hair: '#2a1c14', apron: '#f1ead8', item: 'ladle' });                  // someone selling hot sausage to it
      E.sign(295, 78, 'GAMES TODAY', true);
    } else {
      E.P(210, 152, 1, { tunic: '#8a8a8a', hair: '#6a6a6a', item: 'broom', sweep: Math.sin(T * 3) > 0 });
      for (let i = 0; i < 3; i++) E.walker(i, 164 + i * 8, i % 2 ? -13 : 16, townsman(i + 4));
      const dg = daysToGames(); E.sign(295, 78, `${arenaShut() ? 'SHUT FOR THE MONTH: ' : ''}NEXT GAMES IN ${dg} DAY${dg === 1 ? '' : 'S'}`);
    }
    E.shade(30, 124, 530);
    if (t >= 2) for (let x = 53; x < 540; x += 60) { if (x > 250 && x < 330) continue; const y = 124 - rows * 26 + 12, sc = imperial ? '#e8b545' : '#e8e2d2'; R(x, y + 6, 4, 10, sc); R(x + 1, y + 3, 2, 3, sc); R(x - 1, y + 16, 6, 2, imperial ? '#b6832c' : '#c9c2ae'); }      // statues in the upper arches of a great arena
    R(266, 124, 58, 3, '#b8a888'); R(262, 127, 66, 3, '#a39a84');                               // steps up to the gate
    R(96, 108, 26, 16, '#6b4f2c'); R(98, 110, 22, 12, '#f1ead8'); for (let i = 0; i < 4; i++) R(100, 112 + i * 3, 12 + (i % 2) * 5, 1, '#6b573c'); R(94, 106, 30, 2, '#4a3520');      // the day's card, posted by the wall
    R(452, 104, 34, 20, '#7a5a34'); for (let i = 0; i < 6; i++) R(450 + i * 6, 98, 6, 6, i % 2 ? '#f1ead8' : '#b93a2e'); R(452, 116, 34, 2, '#94703f'); E.P(468, 124, -1, { tunic: '#a8763a', hair: '#2a1c14' }); R(452, 116, 34, 8, '#7a5a34'); R(452, 116, 34, 2, '#94703f');      // where the tokens are sold
    E.sign(295, Math.max(11, top - 20), imperial ? 'THE GREAT ARENA: THE EMPEROR\'S GAMES' : TIERS[Math.min(3, t)].name.toUpperCase(), t >= 3);
    if (G.fame >= FINAL_FAME && !G.won) {      // the eagle over the gate: the Emperor has sent for you
      R(294, 44, 2, 12, '#8a6230'); R(288, 38, 14, 6, '#e8b545'); R(284, 40, 4, 3, '#e8b545'); R(302, 40, 4, 3, '#e8b545'); R(293, 35, 4, 3, '#e8b545'); E.sign(295, Math.max(23, top - 32), 'THE EMPEROR SUMMONS YOU', true); }
    // the champion, in stone on his plinth; gilded if he is yours
    { const holder = typeof titleHolder === 'function' ? titleHolder() : null, yours = holder && G.title.house === null;
      R(160, 132, 20, 16, '#b8ab94'); R(158, 130, 24, 3, '#d8cdb6'); R(158, 147, 24, 2, '#a39a84');
      if (holder) { const c = yours ? '#e8b545' : '#d8d2c0'; E.P(170, 130, 1, { tunic: c, skin: c, hair: yours ? '#b6832c' : '#c9c2ae', item: 'sword' }); E.wreath(170, 96, yours ? '#fff0b0' : '#5d7f3f'); }
      E.sign(170, 162, holder ? `CHAMPION: ${holder.name.toUpperCase()}` : t >= 1 ? 'THE TITLE STANDS EMPTY' : 'NO CHAMPION IN THE PITS', !!yours); }
    // the bookmakers, their board and their strongbox
    R(126, 106, 24, 20, '#2a2a2a'); R(124, 104, 28, 2, '#6b4f2c'); for (let i = 0; i < 4; i++) { R(129, 109 + i * 4, 8 + (i % 2) * 4, 1, '#e8e2d2'); R(143, 109 + i * 4, 4, 1, i % 2 ? '#e8b545' : '#e8e2d2'); }
    R(118, 140, 34, 4, '#6b4f2c'); R(121, 144, 3, 12, '#5e4426'); R(146, 144, 3, 12, '#5e4426'); for (let i = 0; i < 5; i++) R(124 + (i % 3) * 3, 138 - Math.floor(i / 3) * 2, 2, 2, '#e8b545');
    E.P(138, 158, 1, { tunic: '#4a6a8a', hair: '#2a1c14', item: 'scroll' });
    E.sign(136, 100, (G.streak || 0) >= 2 ? `WAGERS - ${G.streak} WON RUNNING` : 'WAGERS', (G.streak || 0) >= 2);
    // the festival crowns the house has won, hung on a rail by the wall
    { const n = typeof trophies === 'function' ? trophies() : 0;
      R(500, 132, 2, 26, '#5e4426'); R(572, 132, 2, 26, '#5e4426'); R(498, 130, 78, 3, '#6b4f2c');
      for (let i = 0; i < Math.min(8, n); i++) E.wreath(508 + i * 9, 140 + (i % 2) * 2, i % 2 ? '#5d7f3f' : '#6f8f48');
      E.sign(537, 126, n ? `FESTIVAL CROWNS: ${n}` : 'NO FESTIVAL CROWN YET', n > 0); }
    // what the heralds are crying
    if (G.festival && G.festival.day >= G.day && G.festival.day - G.day <= 5) { const left = G.festival.day - G.day, F = FESTIVALS[left === 0 && G.festival.shown ? G.festival.shown : G.festival.type];
      E.sign(295, 66, `${F.name.toUpperCase()} ${left === 0 ? 'TODAY' : left === 1 ? 'TOMORROW' : 'IN ' + left + ' DAYS'}`, true);
      if (left > 0) E.P(232, 158, 1, { tunic: '#a8261c', hair: '#2a1c14', item: 'scroll' }); }
    for (const x of [22, 574]) E.cypress(x, 126, 40);
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
    offers.forEach((c, i) => { const x = 208 + (i % 4) * 34, y = 79 + Math.floor(i / 4) * 21;
      yardHits.push({ x0: x - 2, y0: y - 3, x1: x + 28, y1: y + 18, offer: c.id });
      if (typeof ui !== 'undefined' && ui.csel === c.id) { R(x - 2, y - 2, 30, 20, '#e8b545'); R(x - 1, y - 1, 28, 18, '#6b4f2c'); }
       R(x, y, 26, 16, c.asked ? '#e8b545' : '#f1ead8'); R(x, y, 26, 1, c.asked ? '#fff0b0' : '#ffffff'); for (let k = 0; k < 3; k++) R(x + 3, y + 4 + k * 4, 14 + ((i + k) % 3) * 3, 1, '#6b573c'); R(x + 12, y - 2, 2, 3, '#a02d22'); });
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
    // a pediment over the middle of the colonnade
    for (let i = 0; i < 6; i++) R(226 + i * 8, 28 - (i + 1) * 3, 92 - i * 16, 3, i % 2 ? '#e8e2d2' : '#ddd6c4'); R(266, 16, 12, 6, '#e8b545'); R(268, 18, 8, 2, '#b6832c');
    // the fountain
    R(136, 160, 44, 10, '#b8ab94'); R(134, 158, 48, 3, '#d8cdb6'); R(139, 161, 38, 5, '#4f8fb8'); R(156, 146, 4, 14, '#c9c2ae'); R(153, 144, 10, 3, '#d8d2c0');
    for (let i = 0; i < 6; i++) { const q = (T * 1.4 + i / 6) % 1; R(157 + Math.round((i % 2 ? 1 : -1) * q * 9), 144 - Math.round(Math.sin(q * Math.PI) * 7), 1, 2, '#d6ecf8'); } for (let i = 0; i < 3; i++) R(142 + ((i * 13 + Math.floor(T * 6)) % 30), 163, 4, 1, '#d6ecf8');
    // a rail at the corner of the square, where the carriers tie up their mules (your own stables are in the yard of the school)
    R(14, 150, 2, 14, '#5e4426'); R(58, 150, 2, 14, '#5e4426'); R(12, 152, 50, 2, '#7a5a34'); E.mule(30, 166, 1);
    { const rep = workRep(); E.sign(271, 136, `YOUR NAME FOR WORK: ${workWord(rep).toUpperCase()}`, rep >= 35); }
    if ((G.jobs || []).length) E.sign(546, 150, `${G.jobs.length} OF YOUR OUTINGS AWAY`);
    R(572, 150, 8, 18, '#c9c2ae'); R(570, 148, 12, 3, '#d8d2c0'); R(574, 154, 4, 1, '#8a8478'); R(574, 158, 4, 1, '#8a8478');      // the milestone on the east road
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
    // bronze doors, acroteria, and tripods smoking either side of the steps
    R(282, 76, 12, 36, '#8a6230'); R(296, 76, 12, 36, '#8a6230'); R(282, 76, 26, 1, '#b98a34'); for (let q = 0; q < 4; q++) { R(286, 80 + q * 8, 2, 2, '#e8b545'); R(302, 80 + q * 8, 2, 2, '#e8b545'); }
    R(292, 8, 6, 9, '#e8b545'); R(290, 12, 10, 2, '#e8b545'); R(190, 36, 6, 8, '#e8e2d2'); R(394, 36, 6, 8, '#e8e2d2');
    for (const x of [176, 414]) { R(x - 1, 100, 1, 12, '#8a6230'); R(x + 5, 100, 1, 12, '#8a6230'); R(x + 2, 100, 1, 12, '#8a6230'); R(x - 3, 96, 11, 4, '#b98a34'); E.flame(x + 2, 96, 4, '#e2702a'); }
    for (const [x, h] of [[142, 46], [448, 46], [128, 34], [462, 34]]) E.cypress(x, 124, h);
    // your own shrine, to the right of the steps: a stone, an altar, the goddess, a roof over her
    { const sh = G.fac.shrine || 0, x = 446;
      R(x - 12, 140, 24, 4, '#b8ab94'); R(x - 12, 140, 24, 1, '#d8cdb6');
      if (sh >= 1) { R(x - 7, 126, 14, 14, '#d8d2c0'); R(x - 9, 124, 18, 3, '#e8e2d2'); R(x - 9, 137, 18, 3, '#c9c2ae'); E.flame(x, 124, 3 + sh, '#f0e0a0'); }
      if (sh >= 2) { R(x + 12, 116, 10, 24, '#c9c2ae'); R(x + 10, 114, 14, 3, '#d8d2c0'); E.P(x + 17, 114, -1, { tunic: '#e8e2d2', skin: '#e8e2d2', hair: '#c9c2ae' }); R(x + 9, 92, 4, 8, '#e8e2d2'); R(x + 22, 92, 4, 8, '#e8e2d2'); }      // Nemesis, winged
      if (sh >= 3) { E.column(x - 16, 100, 40); E.column(x + 27, 100, 40); R(x - 20, 92, 58, 5, '#d8d2c0'); for (let q = 0; q < 4; q++) R(x - 16 + q * 7, 92 - (q + 1) * 3, 50 - q * 14, 3, q % 2 ? '#e8e2d2' : '#ddd6c4'); R(x - 20, 95, 58, 2, '#e8b545'); }
      E.sign(x + 6, 176, `YOUR SHRINE ${E.pips(sh, 3)}`, sh >= 3); }
    // what is being asked of you, and what has been granted
    if (G.request && !G.request.done) { const k = G.request.patron, hx = k === 'magistrate' ? 124 : k === 'guild' ? 546 : 330, c = k === 'magistrate' ? '#7a2a8a' : k === 'guild' ? '#c9a21e' : '#f1ead8';
      E.P(hx, 168, k === 'guild' ? -1 : 1, { tunic: c, hair: '#2a1c14', item: 'scroll' }); E.sign(hx, 184, 'A REQUEST FOR YOU', true); }
    if (G.blessed && G.blessed >= G.day) { for (let i = 0; i < 14; i++) if (Math.sin(T * 4 + i * 2.3) > 0.2) R(206 + (i * 37) % 180, 20 + (i * 23) % 80, 1, 1, '#fff0b0'); E.sign(295, 30, 'THE SCHOOL IS BLESSED', true); }
    // those who have come to pray
    E.P(238, 122, 1, Object.assign(townsman(3), { face: 'up' })); E.P(352, 120, -1, Object.assign(townsman(6), { face: 'up' })); E.P(366, 124, -1, Object.assign(townsman(1), { face: 'up' }));
    E.lamp(190, 108); E.lamp(400, 108);
  } },

  // ---- the tavern: the schools' shields, hung in order of renown ----
  rivals: { indoor: true, floor: 142, draw(E) {
    const { R, T } = E;
    E.fire(560, 124, 84);
    R(0, 0, 590, 142, '#b89868'); R(0, 96, 590, 46, '#7a5a34'); for (let x = 0; x < 590; x += 20) R(x, 96, 1, 46, '#5e4426'); R(0, 94, 590, 3, '#94703f');
    for (let i = 0; i < 46; i++) R(6 + (i * 131) % 576, 12 + (i * 47) % 78, 6 + (i % 4) * 4, 2 + (i % 3), i % 2 ? 'rgba(255,240,200,.07)' : 'rgba(80,50,20,.07)');      // plaster gone patchy with smoke and years
    for (let x = 30; x < 590; x += 110) { R(x, 0, 8, 96, '#5e4426'); R(x, 0, 2, 96, '#7a5a34'); R(x + 6, 0, 2, 96, '#4a3520'); R(x + 8, 8, 3, 88, 'rgba(0,0,0,.12)'); } R(0, 0, 590, 8, '#4a3520'); R(0, 8, 590, 3, 'rgba(0,0,0,.18)');
    E.floor(142, '#6b4f2c', '#573f22', 'boards');
    // the wall of shields: every school in the province, the most renowned first, yours among them
    const rows = G.houses.map(H => ({ id: H.id, called: H.called, name: houseDef(H.id).name, col: houseDef(H.id).col, p: H.prestige, feud: H.grudge })).concat([{ name: 'YOU', col: '#c23b2e', p: G.fame, you: true }]).sort((a, b) => b.p - a.p);
    rows.forEach((h, i) => {
      const x = 196 + i * 62, y = 30;
      if (!h.you) { yardHits.push({ x0: x - 16, y0: y - 12, x1: x + 16, y1: y + 56, house: h.id }); if (typeof ui !== 'undefined' && ui.hsel === h.id) { R(x - 9, y + 37, 18, 1, '#e8b545'); R(x - 1, y + 38, 2, 2, '#e8b545'); } }      // click a shield to read that house
      R(x - 13, y, 26, 34, '#2a1c14'); R(x - 11, y + 2, 22, 30, h.col); R(x - 11, y + 2, 22, 3, shade(h.col, 1.35)); R(x - 11, y + 2, 3, 30, shade(h.col, 0.7)); R(x - 3, y + 13, 6, 6, h.you ? '#f5d584' : '#d8cdb6');
      if (h.you) { R(x - 15, y - 2, 30, 1, '#f5d584'); R(x - 15, y + 35, 30, 1, '#f5d584'); R(x - 15, y - 2, 1, 38, '#f5d584'); R(x + 14, y - 2, 1, 38, '#f5d584'); }
      if (h.feud >= 40) for (let k = -8; k <= 8; k++) { R(x + k, y + 17 + k, 2, 2, '#1c1310'); R(x + k, y + 17 - k, 2, 2, '#1c1310'); }      // an open feud: a blade scored across it
      E.sign(x, 80, `${i + 1}. ${h.p}`, h.you);
      // a crown over the house that holds the championship, a laurel for the last tournament, a dagger where you have called them out
      const T0 = G.title, lastL = G.laurels && G.laurels[G.laurels.length - 1];
      if (T0 && (h.you ? T0.house === null : T0.house === h.id) && titleHolder()) { R(x - 7, y - 9, 14, 4, '#e8b545'); for (let q = 0; q < 4; q++) R(x - 7 + q * 4, y - 12, 2, 3, '#e8b545'); R(x - 1, y - 8, 2, 2, '#a02d22'); }
      if (lastL && (h.you ? !lastL.hid : lastL.hid === h.id)) E.wreath(x + 13, y + 30, '#5d7f3f');
      if (h.called) { R(x + 8, y - 2, 2, 12, '#c1c7cc'); R(x + 6, y - 4, 6, 2, '#6b4526'); R(x + 8, y - 8, 2, 4, '#3a2a1c'); }
    });
    // the bar, the man behind it, and what he pours
    R(14, 108, 150, 34, '#5e4426'); R(10, 104, 158, 5, '#8a6a3a'); R(18, 60, 140, 3, '#4a3520'); R(18, 84, 140, 3, '#4a3520');
    for (let i = 0; i < 9; i++) { E.amphora(28 + i * 15, 60, i % 3 ? '#b8703c' : '#8a5028'); E.amphora(28 + i * 15, 84, i % 2 ? '#c98a4a' : '#b8703c'); }
    E.P(84, 108, 1, { tunic: '#7a7a3a', apron: '#e8dcc0', hair: '#2a1c14' }); R(60, 108, 60, 34, '#5e4426'); R(60, 104, 60, 5, '#8a6a3a');
    // tables, with men of the other houses drinking at them
    G.houses.slice(0, 3).forEach((H, i) => {
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
    E.sign(88, 24, 'THE CROSSED SWORDS');
    R(64, 28, 1, 12, '#c1c7cc'); R(112, 28, 1, 12, '#c1c7cc');
    // crossed swords over the hearth, barrels by the bar, and the girl who carries the wine
    for (let k = 0; k < 12; k++) { R(548 + k * 2, 62 + k * 2, 2, 2, '#c1c7cc'); R(572 - k * 2, 62 + k * 2, 2, 2, '#c1c7cc'); } R(546, 60, 4, 4, '#8a6230'); R(572, 60, 4, 4, '#8a6230');
    E.barrel(24, 176); E.barrel(38, 178); E.barrel(31, 164);
    E.walker(2, 182, 11, { tunic: '#b06a8a', hair: '#3a2a1c', skin: '#d9a57c', apron: '#e8dcc0', item: 'pot' });
    // the talk of the town, pinned up by the door
    { const news = Math.min(6, (G.rivalNews || []).length);
      R(496, 100, 36, 30, '#5e4426'); R(498, 102, 32, 26, '#8a6a3a');
      for (let i = 0; i < news; i++) { const nx = 500 + (i % 3) * 10, ny = 104 + Math.floor(i / 3) * 12; R(nx, ny, 8, 9, '#f1ead8'); R(nx + 1, ny + 2, 5, 1, '#6b573c'); R(nx + 1, ny + 5, 4, 1, '#6b573c'); R(nx + 3, ny - 1, 2, 2, '#a02d22'); }
      E.sign(514, 96, news ? 'TOWN TALK' : 'NO NEWS'); }
    // the man who keeps the book, at his own small table under the town's talk, with his tablet and his strongbox
    { const tv = G.tavern || {}, bet = tv.bet;
      yardHits.push({ x0: 484, y0: 132, x1: 534, y1: 190, tavern: 'book' });
      E.P(520, 160, -1, { tunic: '#4a5a6a', hair: '#8a8478', skin: TOWN_SKINS[2], item: 'scroll' });
      R(488, 146, 30, 4, '#8a6a3a'); R(488, 146, 30, 1, '#a8834a'); R(491, 150, 3, 16, '#5e4426'); R(512, 150, 3, 16, '#5e4426');
      R(492, 141, 9, 5, '#5e4426'); R(492, 141, 9, 1, '#8a6a3a'); R(496, 143, 2, 2, '#c9a21e');                    // the strongbox
      R(504, 144, 8, 2, '#f1ead8'); R(505, 144, 5, 1, '#6b573c');                                                  // the tablet
      if (bet) for (let k = 0; k < 3; k++) R(503 + k * 3, 142 - (k % 2), 2, 2, '#e8b545');                          // your money on the table
      E.sign(504, 178, bet ? 'YOUR STAKE IS DOWN' : 'THE BOOK', !!bet);
      // your own men, the night they are stood one
      if (tv.nightDay === G.day) { const lift = Math.sin(T * 1.7) > 0.5 ? 2 : 0;
        E.P(94, 170, 1, { tunic: '#c23b2e', hair: '#2a1c14', skin: TOWN_SKINS[1] }); E.P(124, 170, -1, { tunic: '#a8261c', hair: '#6a4a2a', skin: TOWN_SKINS[3] });
        R(100, 148 - lift, 4, 4, '#c9c2ae'); R(114, 149, 4, 4, '#c9c2ae'); E.sign(109, 184, 'YOUR MEN, AT LIBERTY', true); } }
    // a game of dice in the corner
    yardHits.push({ x0: 132, y0: 150, x1: 200, y1: 192, tavern: 'dice' });
    R(150, 172, 30, 3, '#8a6a3a'); R(153, 175, 3, 10, '#5e4426'); R(174, 175, 3, 10, '#5e4426'); { const roll = Math.floor(T * 1.5) % 3; R(160 + roll * 3, 169, 3, 3, '#f1ead8'); R(168 - roll, 169, 3, 3, '#f1ead8'); R(161 + roll * 3, 170, 1, 1, '#1c1310'); }
    E.P(142, 186, 1, townsman(4)); E.P(190, 186, -1, townsman(7));
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
    const post = (role, x, o, word) => { if (!st[role]) return; const k = n++; E.P(x, 150 + (k % 2) * 6, x < 295 ? 1 : -1, o); E.sign(x, k % 2 ? 185 : 174, `${word} ${E.pips(st[role].skill, 3)}`, st[role].skill >= 3); };
    post('medicus', 104, { tunic: '#f1ead8', hair: '#3a2a1c', item: 'bag' }, 'MEDICUS');
    post('unctor', 196, { tunic: '#5a8a9a', hair: '#2a1c14', item: 'bucket' }, 'UNCTOR');
    post('cook', 376, { tunic: '#a8763a', apron: '#f1ead8', hair: '#2a1c14', item: Math.sin(T * 2) > 0 ? 'ladle' : 'pot' }, 'COOK');
    post('dispensator', 440, { tunic: '#8a8a8a', hair: '#c9c2b2', item: 'scroll' }, 'DISPENSATOR');
    post('scout', 504, { tunic: '#3f7a5a', hair: '#6a4a2a', item: 'scroll' }, 'SCOUT');
    if (!n) E.sign(295, 178, 'NO HOUSEHOLD HIRED YET');
    // the strongbox by the door: fuller the richer you are, and men waiting for it when you owe
    R(336, 112, 22, 12, '#5e4426'); R(336, 112, 22, 2, '#8a6a3a'); R(346, 116, 2, 3, '#e0aa3e');
    for (let i = 0, c = Math.min(14, Math.floor(Math.max(0, G.denarii) / 120)); i < c; i++) R(338 + (i % 7) * 3, 110 - Math.floor(i / 7) * 2, 2, 2, '#e8b545');
    if (G.denarii < 0) { E.P(366, 126, -1, { tunic: '#3a3a44', hair: '#2a1c14', item: 'scroll' }); E.P(380, 128, -1, { tunic: '#4a3a3a', hair: '#8a8a8a' }); E.sign(372, 100, 'THE CREDITORS', true); }
    E.shade(50, 124, 490);
    // what you have built: a plaque on the wall for each, with its pips
    for (let gy = 132; gy < 148; gy += 4) for (let gx = 258 + (gy % 8 ? 0 : 3); gx < 336; gx += 6) R(gx, gy, 3, 2, (gx + gy) % 3 ? '#c9b890' : '#a8452e');      // a mosaic walk up to the door
    R(52, 60, 6, 64, '#d8cdb6'); R(532, 60, 6, 64, '#d8cdb6'); R(52, 60, 1, 64, '#f0e8d6'); R(537, 60, 1, 64, '#b5aa94');
    for (let i = 0; i < 3; i++) { const q = (T * 0.25 + i / 3) % 1; E.ctx().globalAlpha = 0.4 * (1 - q); R(470 + Math.sin(q * 5 + i) * 3 + q * 8, 44 - q * 30, 3 + Math.round(q * 4), 3, '#d8d4cc'); } E.ctx().globalAlpha = 1; R(468, 40, 6, 8, '#8f8a84');      // the kitchen chimney
    // antefixes along the eaves, a vine up the corner, a balcony over the door
    for (let x = 46; x < 546; x += 18) R(x, 57, 3, 3, '#d06a3e');
    for (let q = 0; q < 26; q++) { const vx = 60 + Math.round(Math.sin(q * 0.9) * 3); R(vx, 122 - q * 2, 2, 2, q % 3 ? '#4f7a3a' : '#6f8f48'); if (q % 5 === 2) R(vx + 2, 121 - q * 2, 2, 2, '#7a2a8a'); }
    R(262, 64, 66, 3, '#8a6a3a'); for (let x = 264; x < 328; x += 6) R(x, 60, 1, 4, '#6b4f2c'); R(262, 59, 66, 1, '#a8834a');
    // those looking for a place wait along the wall
    { const seek = (G.hires || []).filter(h => h.role !== 'faber' && h.role !== 'doctore').length;
      R(108, 122, 60, 3, '#7a5a34'); R(112, 125, 2, 5, '#5e4426'); R(162, 125, 2, 5, '#5e4426');
      for (let i = 0; i < Math.min(4, seek); i++) E.P(118 + i * 14, 128, 1, townsman(i + 3));
      E.sign(138, 104, seek ? `${seek} SEEKING A PLACE` : 'THE HALL IS EMPTY', seek > 0); }
    // the granary at the corner: sacks, then a store on its staddles, then a garden, then a pig
    { const gl = G.fac.stores || 0, x = 546;
      if (!gl) { for (let q = 0; q < 2; q++) E.sack(x + 8 + q * 10, 150); }
      else {
        for (const px of [x + 2, x + 16, x + 30]) { R(px, 146, 3, 6, '#8f8a84'); R(px - 1, 144, 5, 2, '#b5aa94'); }
        R(x - 2, 124, 40, 21, '#c9a66a'); R(x - 2, 124, 40, 2, '#dcc08a'); for (let q = 0; q < 6; q++) R(x + 2 + q * 6, 126, 1, 19, '#a8864e'); R(x + 13, 130, 10, 15, '#5e4426');
        if (gl >= 3) E.tiles(x - 6, 114, 48, 10); else { R(x - 6, 116, 48, 8, '#b89a5a'); R(x - 6, 116, 48, 1, '#d0b46e'); for (let q = 0; q < 48; q += 5) R(x - 6 + q, 116, 1, 8, '#9a7e44'); }
        for (let q = 0; q < gl; q++) E.sack(x - 8 - q * 8, 152);
      }
      if (gl >= 2) for (let r = 0; r < 3; r++) for (let q = 0; q < 6; q++) { R(x - 4 + q * 7, 160 + r * 6, 5, 2, '#6b4f2c'); R(x - 3 + q * 7, 158 + r * 6, 3, 2, (q + r) % 3 ? '#5d7f3f' : '#8ab04a'); }      // the kitchen garden
      if (gl >= 3) { const sn = Math.sin(T * 2) > 0.7 ? 1 : 0; R(x - 28, 170, 12, 6, '#e0a8a0'); R(x - 18 , 171 + sn, 5, 4, '#e0a8a0'); R(x - 14, 173 + sn, 2, 2, '#c98880'); R(x - 27, 176, 2, 3, '#c98880'); R(x - 20, 176, 2, 3, '#c98880'); R(x - 29, 169, 1, 2, '#c98880'); }
      E.sign(x + 14, 110, `GRANARY ${E.pips(gl, 3)}`, gl >= 3); }
    E.sign(470, 28, `THE TABLE: ${RATIONS[G.ration].name.toUpperCase()}`);
    if (G.denarii >= 0) { const net = stipend() - upkeep(); E.sign(392, 108, `${net >= 0 ? '+' : ''}${net} A DAY`, net >= 0); }
    E.lamp(228, 110); E.lamp(360, 96);
  } },

  // ---- the record house: shelves that fill as your chronicle grows ----
  chronicle: { indoor: true, floor: 142, draw(E) {
    const { R, T } = E;
    E.shaft([[440, 54], [510, 54], [452, 188], [350, 188]]);
    R(0, 0, 590, 142, '#8a7a66'); E.brick(0, 6, 590, 136, '#7a6b58'); R(0, 116, 590, 26, 'rgba(60,40,20,.16)'); R(0, 115, 590, 1, '#a39078'); R(0, 0, 590, 6, '#5e4c3a'); E.floor(142, '#6b5a48', '#57483a', 'tiles');
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
    // a rug under the keeper's table, and a column where the shelves end
    R(412, 160, 112, 12, '#7a2a2a'); R(412, 160, 112, 1, '#e8b545'); R(412, 171, 112, 1, '#e8b545'); for (let x = 418; x < 520; x += 12) R(x, 165, 6, 2, '#c9a21e');
    R(400, 8, 8, 134, '#b5a894'); R(400, 8, 2, 134, '#d0c4b0'); R(397, 6, 14, 4, '#c9bca8'); R(397, 138, 14, 4, '#9a8e7c');
    // the line of the house: a bust for each generation, on top of the shelves
    { const gen = Math.min(5, G.dynasty ? G.dynasty.gen : 1);
      for (let i = 0; i < gen; i++) { const bx = 34 + i * 22, last = i === gen - 1; R(bx, 14, 10, 8, last ? '#e8e2d2' : '#b5aa94'); R(bx + 2, 8, 6, 7, last ? '#e8e2d2' : '#b5aa94'); R(bx + 2, 8, 6, 2, last ? '#c9c2ae' : '#8f8a84'); R(bx + 3, 11, 1, 1, '#5a4a3a'); R(bx + 6, 11, 1, 1, '#5a4a3a'); } }
    // the festival crowns of the house, hung over the map
    { const n = typeof trophies === 'function' ? trophies() : 0;
      R(524, 78, 56, 2, '#6b4f2c'); if (n) R(524, 58, 56, 20, '#5e4c3a');
      for (let i = 0; i < Math.min(10, n); i++) E.wreath(530 + (i % 5) * 11, 64 + Math.floor(i / 5) * 9, i % 2 ? '#5d7f3f' : '#6f8f48');
      if (n) E.sign(552, 58, `FESTIVAL CROWNS: ${n}`, true); }
    // the champion's cup, while a man of yours holds the title; and the laurels your men have taken
    if (typeof titleYours === 'function' && titleYours()) { R(540, 150, 12, 14, '#8a7a66'); R(538, 148, 16, 3, '#a39a84'); R(542, 138, 8, 7, '#e8b545'); R(542, 138, 8, 2, '#fff0b0'); R(545, 145, 2, 3, '#b6832c'); R(540, 139, 2, 4, '#e8b545'); R(550, 139, 2, 4, '#e8b545'); E.sign(546, 176, `THE TITLE: ${G.title.name.toUpperCase()}`, true); }
    { const mine = (G.laurels || []).filter(x => !x.hid).length; for (let i = 0; i < Math.min(4, mine); i++) E.wreath(424 + i * 10, 96, '#6f8f48'); if (mine) E.sign(440, 110, `${mine} LAUREL${mine === 1 ? '' : 'S'}`, true); }
    if ((G.bestStreak || 0) >= 3) E.sign(210, 136, `LONGEST RUN OF VICTORIES: ${G.bestStreak}`);
    E.lamp(486, 126); E.lamp(404, 60);
  } },
};
