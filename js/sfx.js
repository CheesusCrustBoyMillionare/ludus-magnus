'use strict';
// Synthesized sound (Web Audio, no asset files): the arena, its crowd, and the small noises of running a ludus.
// The audio context is created on the player's first click, since browsers only allow sound to start from a gesture.

const SFX = (() => {
  const MUTE_KEY = 'ludus-magnus-mute', LEVEL = 0.7;
  let ctx = null, master = null, bus = null, verb = null, noiseBuf = null, muted = false;
  let murmur = null, roar = null, roarBand = null, roarBand2 = null, boost = 0, voices = 0;
  const RAIN_WASH = 0.07;
  const CROWD_MURMUR = 1.5, CROWD_ROAR = 2.4;      // makeup gain: narrow bands and sung notes carry less than plain noise did
  let musicBus = null, drone = null, musicOn = true, amb = null;
  const MUSIC_KEY = 'ludus-magnus-music', MUSIC_LEVEL = 0.22;      // well under the blows and the crowd
  const last = {};
  // How loud: each on a slider from 0 to 100. Where the sliders start (80 and 60) is as loud as the game was before it had
  // them; the top of the sound is a little louder than that, and the top of the music a good deal louder, for those who
  // want the band over the blows. A slider at nothing is the same as the old switch at off, and is remembered as that.
  const VOL_KEY = 'ludus-magnus-volume', MVOL_KEY = 'ludus-magnus-musicvol', VOL0 = 80, MVOL0 = 60;
  let vol = VOL0, mvol = MVOL0;
  const pct = (v, d) => { const n = Math.round(+v); return v === null || v === '' || !isFinite(n) ? d : Math.max(5, Math.min(100, n)); };
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; musicOn = localStorage.getItem(MUSIC_KEY) !== '0'; vol = pct(localStorage.getItem(VOL_KEY), VOL0); mvol = pct(localStorage.getItem(MVOL_KEY), MVOL0); } catch (e) { /* storage unavailable */ }
  const masterLevel = () => muted ? 0 : Math.min(1, LEVEL * Math.pow(vol / VOL0, 2));
  const musicLevel = () => musicOn ? MUSIC_LEVEL * Math.pow(mvol / MVOL0, 2) : 0;
  const keep = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* storage unavailable */ } };

  const rnd = (a, b) => a + Math.random() * (b - a);

  function init(make) {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC && !make) return;
    try {
      ctx = make ? make() : new AC();
      // everything passes through a compressor, so a pile of blows at once thickens rather than crackles
      master = ctx.createGain(); master.gain.value = masterLevel(); master.connect(ctx.destination);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18;
      comp.connect(master);
      bus = ctx.createGain(); bus.connect(comp);

      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

      // the stone bowl of the arena: a short echo made from decaying noise
      const len = Math.floor(ctx.sampleRate * 1.3), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const ch = ir.getChannelData(c);
        for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * (i < 400 ? i / 400 : 1);
      }
      verb = ctx.createConvolver(); verb.buffer = ir;
      const wet = ctx.createGain(); wet.gain.value = 0.5;
      verb.connect(wet); wet.connect(comp);

      // The crowd is made of voices, not hiss.
      // The murmur: noise poured through a handful of narrow bands where the vowels of speech sit, each band swelling
      // and sinking on its own, so that it babbles like many people talking at once.
      // The roar: a choir of rough sung notes, none quite in tune and each wavering, shaped through the same vowel
      // bands, with a little breath in it. When something happens the vowel opens from "oh" towards "ah" (see crowd()).
      const send = (node, lpHz) => { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lpHz; node.connect(lp); lp.connect(bus); lp.connect(verb); };
      const hiss = rate => { const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = rate; src.start(0, Math.random() * 1.5); return src; };
      const wander = (param, hz, depth) => { const l = ctx.createOscillator(), dg = ctx.createGain(); l.frequency.value = hz; dg.gain.value = depth; l.connect(dg); dg.connect(param); l.start(); };
      murmur = ctx.createGain(); murmur.gain.value = 0;
      [330, 470, 640, 860, 1150, 1600, 2300].forEach((f, k) => {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * rnd(0.96, 1.04); bp.Q.value = 7;
        const g = ctx.createGain(); g.gain.value = 0.55 * (k < 5 ? 1 : 0.5);
        wander(g.gain, rnd(0.17, 1.3), 0.5 * (k < 5 ? 1 : 0.5)); wander(bp.frequency, rnd(0.05, 0.2), f * 0.07);       // each voice-band comes and goes, and drifts
        hiss(rnd(0.45, 0.7)).connect(bp); bp.connect(g); g.connect(murmur);
      });
      const murmurUp = ctx.createGain(); murmurUp.gain.value = CROWD_MURMUR; murmur.connect(murmurUp); send(murmurUp, 2800);
      roar = ctx.createGain(); roar.gain.value = 0;
      const choir = ctx.createGain(); choir.gain.value = 0.16;
      [98, 110, 123, 131, 147, 165, 196, 220, 247].forEach(f => {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = f * rnd(0.97, 1.03); g.gain.value = 0.6;
        wander(o.frequency, rnd(4, 6.5), f * 0.018); wander(o.frequency, rnd(0.1, 0.4), f * 0.02); wander(g.gain, rnd(0.2, 1.1), 0.4);
        o.connect(g); g.connect(choir); o.start();
      });
      roarBand = ctx.createBiquadFilter(); roarBand.type = 'bandpass'; roarBand.frequency.value = 620; roarBand.Q.value = 2.4;
      roarBand2 = ctx.createBiquadFilter(); roarBand2.type = 'bandpass'; roarBand2.frequency.value = 1080; roarBand2.Q.value = 3;
      const second = ctx.createGain(); second.gain.value = 0.7;
      choir.connect(roarBand); roarBand.connect(roar); choir.connect(roarBand2); roarBand2.connect(second); second.connect(roar);
      const breath = ctx.createBiquadFilter(), breathG = ctx.createGain(); breath.type = 'bandpass'; breath.frequency.value = 1300; breath.Q.value = 1.1; breathG.gain.value = 0.18;
      hiss(0.8).connect(breath); breath.connect(breathG); breathG.connect(roar);
      const roarUp = ctx.createGain(); roarUp.gain.value = CROWD_ROAR; roar.connect(roarUp); send(roarUp, 3400);

      // music has its own fader, and a little of the same echo
      musicBus = ctx.createGain(); musicBus.gain.value = musicLevel(); musicBus.connect(comp);
      const mv = ctx.createGain(); mv.gain.value = 0.35; musicBus.connect(mv); mv.connect(verb);
      // the drone under every tune: a root and the fifth above it, held like a pipe
      const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 520;
      const dg = ctx.createGain(); dg.gain.value = 0;
      const voice = (type, v) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = 73.4; g.gain.value = v; o.connect(g); g.connect(dl); o.start(); return o; };
      drone = { root: voice('triangle', 0.5), fifth: voice('sine', 0.35), high: voice('sawtooth', 0.06), g: dg };
      const sway = ctx.createOscillator(), swayD = ctx.createGain(), swayG = ctx.createGain();
      sway.frequency.value = 0.11; swayD.gain.value = 0.25; swayG.gain.value = 1; sway.connect(swayD); swayD.connect(swayG.gain); sway.start();
      dl.connect(dg); dg.connect(swayG); swayG.connect(musicBus);
    } catch (e) { ctx = null; }
  }

  // Where a sound goes: placed left to right, with some of it sent into the arena's echo.
  function out(node, pan, wet) {
    let n = node;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p); n = p; }
    n.connect(bus);
    if (wet) { const s = ctx.createGain(); s.gain.value = wet; n.connect(s); s.connect(verb); }
  }
  function track(src, t1) { voices++; src.onended = () => { voices--; }; src.stop(t1); }

  // A burst of filtered noise. o: dur, type, f0, f1, vol, q, delay, attack, pan, wet
  function noise(o) {
    const t = ctx.currentTime + (o.delay || 0), dur = o.dur;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = rnd(0.9, 1.1);
    const f = ctx.createBiquadFilter(); f.type = o.type || 'lowpass'; f.Q.value = o.q || 0.7;
    f.frequency.setValueAtTime(o.f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 || o.f0), t + dur);
    const g = ctx.createGain(); g.gain.value = 0.0001;        // silent until its moment: a gain left at 1 lets the first sample through as a click
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol, t + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); out(g, o.pan, o.wet);
    src.start(t, Math.random()); track(src, t + dur + 0.03);
  }
  // A pitched voice. o: type, f0, f1, dur, vol, delay, attack, lp, lp1, vib, pan, wet
  function tone(o) {
    const t = ctx.currentTime + (o.delay || 0), dur = o.dur;
    const osc = ctx.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t); osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 || o.f0), t + dur);
    if (o.vib) { const l = ctx.createOscillator(), d = ctx.createGain(); l.frequency.value = 5.5; d.gain.value = o.f0 * o.vib; l.connect(d); d.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.03); }
    const g = ctx.createGain(); g.gain.value = 0.0001;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol, t + (o.attack || 0.012));
    if (o.hold) g.gain.setValueAtTime(o.vol, t + dur * o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1;
      f.frequency.setValueAtTime(o.lp, t); if (o.lp1) f.frequency.exponentialRampToValueAtTime(o.lp1, t + Math.min(dur, 0.12));
      osc.connect(f); node = f;
    }
    node.connect(g); out(g, o.pan, o.wet);
    osc.start(t); track(osc, t + dur + 0.03);
  }
  // Struck metal: a handful of partials that do not line up, each ringing for its own time.
  function clang(base, vol, dur, pan, wet, delay) {
    [[1, 1], [2.76, 0.6], [5.4, 0.35], [8.93, 0.18]].forEach(([k, v], i) =>
      tone({ type: i ? 'sine' : 'triangle', f0: base * k * rnd(0.99, 1.01), dur: dur * (1 - i * 0.17), vol: vol * v, attack: 0.002, pan, wet, delay }));
  }
  // One note on a bronze horn: bright at the lip, then mellowing, with a second voice an octave down.
  function brass(freq, dur, vol, delay, wet) {
    tone({ type: 'sawtooth', f0: freq, dur, vol, delay, attack: 0.04, hold: 0.7, lp: 500, lp1: 1900, vib: 0.006, wet });
    tone({ type: 'square', f0: freq / 2, dur, vol: vol * 0.35, delay, attack: 0.05, hold: 0.7, lp: 700, wet });
  }
  const drum = (vol, delay, pan) => { tone({ f0: 120, f1: 42, dur: 0.32, vol, delay, attack: 0.003, pan, wet: 0.4 }); noise({ dur: 0.07, f0: 900, f1: 200, vol: vol * 0.5, delay, pan, wet: 0.3 }); };
  const cheer = v => { boost = Math.max(boost, v); };

  // ---- the arena. Each takes (strength, left-to-right position, kind) ----
  const arena = {
    // A blow landing. kind says what struck and what it struck: 'beast', or the striker's class (which tells the weapon),
    // with ' armor' added when the man hit is well armoured. Strength above 1.2 is a telling blow.
    hit(v, pan, kind) {
      const k = kind || '', hard = v > 1.2, p = rnd(0.88, 1.14);
      if (k.includes('beast')) { tone({ type: 'sawtooth', f0: 120 * p, f1: 70, dur: 0.2, vol: 0.22, lp: 700, pan, wet: 0.3 }); noise({ dur: 0.1, f0: 1100, f1: 250, vol: 0.4, pan, wet: 0.3 }); }
      else if (k.includes('retiarius') || k.includes('hoplomachus')) {      // a point driven in: a short hard knock, and less of the tearing
        noise({ dur: 0.05, type: 'bandpass', f0: 950 * p, f1: 520, vol: 0.75 * v, q: 1.6, attack: 0.002, pan, wet: 0.25 });
        noise({ dur: 0.08, f0: 1300 * p, f1: 240, vol: 0.26 * v, pan, wet: 0.3 });
      } else if (k.includes('dimachaerus')) {      // two blades: two cuts, a breath apart
        for (let n = 0; n < 2; n++) { noise({ dur: 0.03, type: 'highpass', f0: (4000 + n * 900) * p, vol: 0.17 * v, delay: n * 0.05, pan, wet: 0.2 }); noise({ dur: 0.07, f0: 1900 * p, f1: 320, vol: 0.3 * v, delay: n * 0.05, pan, wet: 0.3 }); }
      } else if (k.includes('thraex')) {           // a curved blade drawn across: it hisses as it goes
        noise({ dur: 0.09, type: 'bandpass', f0: 2400 * p, f1: 5200, vol: 0.3 * v, q: 1.8, attack: 0.01, pan, wet: 0.25 });
        noise({ dur: 0.1, f0: 1500 * p, f1: 260, vol: 0.34 * v, pan, wet: 0.3 });
      } else { noise({ dur: 0.035, type: 'highpass', f0: 4200 * p, vol: 0.2 * v, pan, wet: 0.2 }); noise({ dur: 0.1, f0: 1700 * p, f1: 260, vol: 0.42 * v, pan, wet: 0.3 }); }
      tone({ f0: 150 * p, f1: 48, dur: 0.13, vol: 0.4 * v, attack: 0.003, pan, wet: 0.25 });
      if (k.includes('armor')) clang(1050 * rnd(0.85, 1.2), 0.05 * v, 0.16, pan, 0.4, 0.004);      // and the plate it found on the way
      if (hard) {                                  // a telling blow: a crack, a deeper thud, and the stands gasp
        noise({ dur: 0.07, type: 'bandpass', f0: 2600, f1: 1200, vol: 0.4, q: 1.2, pan, wet: 0.45 });
        tone({ f0: 88, f1: 30, dur: 0.3, vol: 0.5, attack: 0.003, pan, wet: 0.4 });
        cheer(0.14);
      }
    },
    // he was not there: feet turning on the sand, and the blade going through air
    dodge(v, pan) {
      const p = rnd(0.85, 1.2);
      noise({ dur: 0.06, type: 'highpass', f0: 2100 * p, vol: 0.11, attack: 0.008, pan });
      noise({ dur: 0.11, type: 'bandpass', f0: 600 * p, f1: 2200 * p, vol: 0.3, q: 1.6, attack: 0.03, delay: 0.02, pan, wet: 0.15 });
    },
    // one foot coming down on raked sand
    walk(v, pan) { noise({ dur: 0.06, type: 'bandpass', f0: 620 * rnd(0.8, 1.25), f1: 260, vol: 0.9 * v, q: 0.9, attack: 0.005, pan, wet: 0.15 }); },
    // the first wound of the fight: the stands draw breath
    firstblood() { cheer(0.2); noise({ dur: 0.5, type: 'bandpass', f0: 640, f1: 420, vol: 0.22, q: 1.4, attack: 0.12, wet: 0.5 }); },
    // your man is failing: his own heart, twice
    heart() { tone({ f0: 62, f1: 40, dur: 0.13, vol: 0.12, attack: 0.004 }); tone({ f0: 58, f1: 38, dur: 0.15, vol: 0.09, attack: 0.004, delay: 0.21 }); },
    // the two halves of the card before a fight come together: iron on iron, and the drum
    clash() {
      noise({ dur: 0.22, type: 'bandpass', f0: 400, f1: 2800, vol: 0.26, q: 1.2, attack: 0.09, wet: 0.3 });
      clang(520 * rnd(0.97, 1.03), 0.085, 0.7, -0.3, 0.55, 0.2); clang(690 * rnd(0.97, 1.03), 0.07, 0.6, 0.3, 0.55, 0.21);
      drum(0.3, 0.2); cheer(0.14);
    },
    // the blow let go, in an ability's announcement: steel through air, the ring of it, and the weight behind it
    strike(v, pan, kind) {
      if (kind === 'beast') { tone({ type: 'sawtooth', f0: 150, f1: 70, dur: 0.3, vol: 0.24, attack: 0.02, lp: 500, lp1: 1100, vib: 0.05, pan, wet: 0.5 }); noise({ dur: 0.25, f0: 900, f1: 260, vol: 0.3, attack: 0.02, pan, wet: 0.5 }); return; }
      noise({ dur: 0.13, type: 'bandpass', f0: 1100, f1: 5200, vol: 0.42, q: 2, attack: 0.02, pan, wet: 0.3 });
      clang(1500 * rnd(0.95, 1.05), 0.05, 0.4, pan, 0.5, 0.06);
      tone({ f0: 96, f1: 40, dur: 0.22, vol: 0.3, attack: 0.004, delay: 0.05, pan, wet: 0.35 });
    },
    // the word of how it ended comes down: for a win the drum and two horns together, for a loss the drum and a falling note
    verdict(v, pan, kind) {
      drum(0.5, 0);
      if (kind === 'won') { brass(262, 0.5, 0.08, 0.02, 0.6); brass(392, 0.5, 0.07, 0.02, 0.6); cheer(0.3); }
      else { tone({ type: 'triangle', f0: 131, f1: 92, dur: 0.9, vol: 0.2, attack: 0.02, wet: 0.6 }); noise({ dur: 0.8, type: 'bandpass', f0: 500, f1: 280, vol: 0.24, q: 1.2, attack: 0.2, wet: 0.6 }); }
    },
    // a man's death, shown: the blow, a great weight falling a long way, and then one bell
    fatal(v, pan, kind) {
      // each killer's own sound first: the shield's boom, the net's hiss, the spear's long thud, a beast's snarl
      if (kind === 'murmillo') { tone({ f0: 150, f1: 60, dur: 0.22, vol: 0.5, attack: 0.002, pan, wet: 0.4 }); clang(330, 0.12, 0.35, pan, 0.4); }
      else if (kind === 'retiarius') noise({ dur: 0.3, type: 'bandpass', f0: 300, f1: 1700, vol: 0.22, q: 1.6, attack: 0.06, pan, wet: 0.25 });
      else if (kind === 'hoplomachus') tone({ f0: 210, f1: 70, dur: 0.3, vol: 0.4, attack: 0.004, pan, wet: 0.4 });
      else if (kind === 'thraex' || kind === 'dimachaerus') noise({ dur: 0.16, type: 'highpass', f0: 3000, vol: 0.28, attack: 0.01, pan, wet: 0.3 });
      else if (kind === 'claw' || kind === 'wolf' || kind === 'boar') tone({ type: 'sawtooth', f0: 120, f1: 70, dur: 0.4, vol: 0.22, attack: 0.03, pan, wet: 0.4 });
      noise({ dur: 0.09, type: 'bandpass', f0: 2600, f1: 1100, vol: 0.45, q: 1.2, pan, wet: 0.45 });
      drum(0.6, 0, pan);
      tone({ f0: 74, f1: 24, dur: 1.2, vol: 0.55, attack: 0.008, delay: 0.03, wet: 0.5 });
      noise({ dur: 0.5, f0: 420, f1: 70, vol: 0.4, delay: 0.03, wet: 0.45 });
      clang(196, 0.11, 1.9, 0, 0.6, 0.42); tone({ f0: 98, dur: 1.5, vol: 0.07, attack: 0.02, delay: 0.42, wet: 0.5 });
      cheer(0.4);
    },
    block(v, pan, kind) {
      const big = kind === 'big';
      clang((big ? 430 : 720) * rnd(0.92, 1.1), big ? 0.15 : 0.2, big ? 0.3 : 0.45, pan, 0.5);
      noise({ dur: 0.03, type: 'highpass', f0: 3500, vol: 0.2, pan, wet: 0.3 });
      if (big) tone({ f0: 190, f1: 85, dur: 0.09, vol: 0.4, attack: 0.002, pan, wet: 0.3 });      // wood behind the bronze
    },
    miss(v, pan) { const p = rnd(0.8, 1.25); noise({ dur: 0.14, type: 'bandpass', f0: 420 * p, f1: 1900 * p, vol: 0.5, q: 1.5, attack: 0.03, pan, wet: 0.15 }); },
    net(v, pan) {
      noise({ dur: 0.34, type: 'bandpass', f0: 260, f1: 1500, vol: 0.2, q: 1.6, attack: 0.08, pan, wet: 0.2 });
      tone({ type: 'triangle', f0: 320, f1: 110, dur: 0.14, vol: 0.12, delay: 0.3, pan, wet: 0.2 });
    },
    // a man steels himself: struck bronze and a breath
    buff(v, pan) { clang(540 * rnd(0.96, 1.04), 0.09, 0.55, pan, 0.5); noise({ dur: 0.35, type: 'bandpass', f0: 500, f1: 1400, vol: 0.14, q: 1.5, attack: 0.12, pan, wet: 0.4 }); },
    // a second wind: three rising notes
    heal(v, pan) { [392, 494, 587].forEach((f, i) => tone({ f0: f, dur: 0.5, vol: 0.07, attack: 0.02, delay: i * 0.08, pan, wet: 0.5 })); },
    // a weapon swung through a crowd
    sweep(v, pan) { noise({ dur: 0.32, type: 'bandpass', f0: 300, f1: 2600, vol: 0.4, q: 1.3, attack: 0.07, pan, wet: 0.35 }); tone({ f0: 160, f1: 70, dur: 0.22, vol: 0.25, attack: 0.02, delay: 0.1, pan, wet: 0.3 }); },
    // off the ground and down with his whole weight: the air, then the sand
    leap(v, pan) {
      noise({ dur: 0.24, type: 'bandpass', f0: 380, f1: 2100, vol: 0.28, q: 1.4, attack: 0.07, pan, wet: 0.3 });
      tone({ f0: 104, f1: 34, dur: 0.3, vol: 0.19, attack: 0.004, delay: 0.24, pan, wet: 0.4 });
      noise({ dur: 0.2, f0: 620, f1: 110, vol: 0.2, delay: 0.24, pan, wet: 0.35 });
      cheer(0.1);
    },
    // one placed stroke: a short hiss of steel and the ring of it
    thrust(v, pan) {
      noise({ dur: 0.1, type: 'bandpass', f0: 1500, f1: 4600, vol: 0.4, q: 2.4, attack: 0.02, pan, wet: 0.25 });
      clang(1250 * rnd(0.94, 1.06), 0.055, 0.3, pan, 0.45, 0.07);
    },
    // cut upon cut: quick breaths of air, each a little higher
    flurry(v, pan) {
      for (let i = 0; i < 4; i++) noise({ dur: 0.07, type: 'bandpass', f0: 900 + i * 320, f1: 2600 + i * 420, vol: 0.3, q: 2, attack: 0.012, delay: i * 0.075, pan, wet: 0.2 });
      tone({ f0: 1500, f1: 2300, dur: 0.3, vol: 0.04, attack: 0.05, pan, wet: 0.4 });
    },
    // he sets his feet behind his guard: wood and bronze knocked together, and a grunt of breath
    brace(v, pan) {
      tone({ f0: 170, f1: 80, dur: 0.12, vol: 0.38, attack: 0.002, pan, wet: 0.3 });
      clang(470 * rnd(0.96, 1.04), 0.1, 0.5, pan, 0.5, 0.02);
      noise({ dur: 0.22, type: 'bandpass', f0: 420, f1: 300, vol: 0.12, q: 1.2, attack: 0.05, delay: 0.05, pan, wet: 0.3 });
    },
    // he draws himself up: a breath in, and two rising notes
    surge(v, pan) {
      noise({ dur: 0.4, type: 'bandpass', f0: 500, f1: 1900, vol: 0.16, q: 1.4, attack: 0.18, pan, wet: 0.4 });
      [330, 495].forEach((f, i) => tone({ type: 'triangle', f0: f, f1: f * 1.02, dur: 0.38, vol: 0.06, attack: 0.03, delay: 0.05 + i * 0.1, pan, wet: 0.5 }));
    },
    // a skip out of reach: two light feet on the sand
    hop(v, pan) { for (let i = 0; i < 2; i++) noise({ dur: 0.08, type: 'highpass', f0: 2200, vol: 0.1, attack: 0.01, delay: i * 0.17, pan }); noise({ dur: 0.16, type: 'bandpass', f0: 500, f1: 1300, vol: 0.11, q: 1.3, attack: 0.05, pan, wet: 0.2 }); },
    // a man's wits knocked loose: a dull bell that wavers
    stun(v, pan) { tone({ f0: 620, f1: 560, dur: 0.5, vol: 0.07, attack: 0.004, vib: 0.03, pan, wet: 0.5 }); tone({ f0: 930, f1: 860, dur: 0.35, vol: 0.035, attack: 0.004, vib: 0.03, pan, wet: 0.5 }); },
    // your man is charged and the fight waits on you: a rising pair of notes on the horn
    ready() { brass(392, 0.14, 0.05, 0, 0.5); brass(587, 0.32, 0.06, 0.13, 0.5); },
    // an ability is announced: a rush of air across the stands, and one beat of the drum
    cutin(v, pan) { noise({ dur: 0.3, type: 'bandpass', f0: 350, f1: 3200, vol: 0.3, q: 1.2, attack: 0.1, pan, wet: 0.35 }); drum(0.3, 0.03, pan); tone({ f0: 880, f1: 1320, dur: 0.22, vol: 0.035, attack: 0.05, delay: 0.05, pan, wet: 0.4 }); cheer(0.08); },
    special(v, pan, kind) {
      if (kind === 'beast') {                      // a roar, not a flourish
        tone({ type: 'sawtooth', f0: 105, f1: 58, dur: 0.55, vol: 0.3, attack: 0.05, lp: 420, lp1: 900, vib: 0.05, pan, wet: 0.6 });
        noise({ dur: 0.5, f0: 700, f1: 240, vol: 0.28, attack: 0.05, pan, wet: 0.6 });
        return;
      }
      noise({ dur: 0.2, type: 'bandpass', f0: 800, f1: 3200, vol: 0.5, q: 2.5, attack: 0.04, pan, wet: 0.3 });
      tone({ f0: 1900, f1: 2700, dur: 0.16, vol: 0.09, attack: 0.03, pan, wet: 0.5 });
    },
    down(v, pan) {
      tone({ f0: 112, f1: 32, dur: 0.4, vol: 0.75, attack: 0.004, pan, wet: 0.45 });
      noise({ dur: 0.28, f0: 520, f1: 90, vol: 0.55, pan, wet: 0.4 });
      noise({ dur: 0.35, type: 'highpass', f0: 2500, vol: 0.06, attack: 0.08, delay: 0.05, pan });     // sand
      cheer(0.34);
    },
    yield() { cheer(0.16); noise({ dur: 0.7, type: 'bandpass', f0: 720, f1: 380, vol: 0.4, q: 1.4, attack: 0.15, wet: 0.5 }); },      // the stands go "ooh"
    spared() { cheer(0.3); brass(294, 0.22, 0.07, 0.05, 0.5); brass(392, 0.5, 0.08, 0.27, 0.5); },
    killed(v, pan) {
      drum(0.55, 0, pan); tone({ f0: 70, f1: 28, dur: 0.7, vol: 0.5, attack: 0.01, delay: 0.05, wet: 0.5 });
      noise({ dur: 0.18, f0: 950, f1: 180, vol: 0.45, pan, wet: 0.4 });
      cheer(0.5);
    },
    start() { cheer(0.28); drum(0.35, 0); drum(0.42, 0.22); },
    horn() { brass(196, 0.26, 0.11, 0, 0.6); brass(196, 0.26, 0.11, 0.3, 0.6); brass(294, 0.95, 0.13, 0.6, 0.6); brass(147, 0.95, 0.07, 0.6, 0.6); },
    press() { drum(0.4, 0); drum(0.4, 0.13); drum(0.5, 0.26); noise({ dur: 0.22, type: 'bandpass', f0: 900, f1: 1500, vol: 0.3, q: 2, attack: 0.03, wet: 0.5 }); },
    hold() { drum(0.5, 0); noise({ dur: 0.3, type: 'bandpass', f0: 700, f1: 500, vol: 0.25, q: 2, attack: 0.05, wet: 0.5 }); },
    victory() { [262, 330, 392].forEach((f, i) => brass(f, 0.2, 0.1, i * 0.16, 0.6)); brass(523, 1.1, 0.13, 0.48, 0.6); brass(392, 1.1, 0.07, 0.48, 0.6); cheer(0.6); },
    defeat() {
      brass(233, 0.5, 0.1, 0, 0.6); brass(196, 0.5, 0.1, 0.45, 0.6); brass(147, 1.2, 0.11, 0.9, 0.6); drum(0.35, 0.9);
      noise({ dur: 1.4, type: 'bandpass', f0: 520, f1: 260, vol: 0.4, q: 1.2, attack: 0.3, wet: 0.6 });   // the stands groan
    },
  };

  // ---- the ludus: quiet, dry and short, so that an evening of clicking does not grate ----
  const ui = {
    tick() { noise({ dur: 0.025, type: 'bandpass', f0: 2300 * rnd(0.9, 1.1), vol: 0.4, q: 1.5, attack: 0.001 }); },
    click() { noise({ dur: 0.03, type: 'bandpass', f0: 1500, vol: 0.4, q: 1.5, attack: 0.001 }); tone({ f0: 330, f1: 220, dur: 0.05, vol: 0.1, attack: 0.002 }); },
    coin() { [3150, 4180, 3620].forEach((f, i) => tone({ f0: f * rnd(0.98, 1.02), dur: 0.16, vol: 0.07, attack: 0.001, delay: i * 0.055 })); noise({ dur: 0.02, type: 'highpass', f0: 5000, vol: 0.05 }); },
    gear() { clang(980 * rnd(0.9, 1.1), 0.1, 0.18); noise({ dur: 0.08, f0: 900, f1: 300, vol: 0.09, delay: 0.02 }); },
    day() { clang(196, 0.09, 1.5, 0, 0.5); tone({ f0: 98, dur: 1.2, vol: 0.08, attack: 0.01, wet: 0.5 }); },                   // the evening gong
    scroll() { for (let i = 0; i < 3; i++) noise({ dur: 0.09, type: 'highpass', f0: rnd(2200, 3600), vol: 0.05, attack: 0.03, delay: i * 0.07 }); },
    herald() { brass(294, 0.2, 0.07, 0, 0.5); brass(392, 0.55, 0.08, 0.22, 0.5); },
    chime() { [660, 880, 1320].forEach((f, i) => tone({ f0: f, dur: 0.5, vol: 0.06, attack: 0.004, delay: i * 0.09, wet: 0.3 })); },
    thud() { tone({ f0: 95, f1: 45, dur: 0.2, vol: 0.14, attack: 0.003 }); tone({ f0: 85, f1: 40, dur: 0.25, vol: 0.14, attack: 0.003, delay: 0.16 }); },
    door() { tone({ f0: 210, f1: 150, dur: 0.07, vol: 0.12, attack: 0.002 }); noise({ dur: 0.16, type: 'bandpass', f0: 340, f1: 620, vol: 0.07, q: 3, attack: 0.05, delay: 0.04 }); },      // a latch, and the hinge
    step() { noise({ dur: 0.05, type: 'bandpass', f0: 700 * rnd(0.8, 1.25), f1: 300, vol: 0.3, q: 0.9, attack: 0.004 }); },                                                              // one foot on a dirt street
    march() { noise({ dur: 0.07, f0: 520 * rnd(0.85, 1.2), f1: 160, vol: 0.25, attack: 0.004 }); noise({ dur: 0.05, f0: 420, f1: 150, vol: 0.14, attack: 0.004, delay: 0.09 }); },         // many feet, not in step
    discover() { [587, 784].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.45, vol: 0.05, attack: 0.006, delay: i * 0.12, wet: 0.4 })); },                                       // something new on the map
    camp() { tone({ f0: 98, dur: 1.0, vol: 0.06, attack: 0.02, wet: 0.5 }); for (let i = 0; i < 9; i++) noise({ dur: 0.03, type: 'highpass', f0: rnd(1800, 4200), vol: rnd(0.03, 0.08), attack: 0.002, delay: 0.25 + i * rnd(0.09, 0.17) }); },     // night comes down, and a fire catches
    warn() { tone({ type: 'triangle', f0: 196, f1: 185, dur: 0.12, vol: 0.1, attack: 0.004 }); tone({ type: 'triangle', f0: 196, f1: 185, dur: 0.16, vol: 0.1, attack: 0.004, delay: 0.14 }); },                                                // are you sure?
    hint() { tone({ f0: 523, dur: 0.22, vol: 0.045, attack: 0.01, wet: 0.3 }); tone({ f0: 659, dur: 0.3, vol: 0.04, attack: 0.01, delay: 0.1, wet: 0.3 }); },                                // the steward clears his throat
    gate() { noise({ dur: 0.3, f0: 300, f1: 120, vol: 0.12, attack: 0.05 }); tone({ f0: 70, f1: 50, dur: 0.18, vol: 0.14, attack: 0.003, delay: 0.26 }); },   // a man leaves by the gate
  };


  // ---------- music ----------
  // Composed as it plays, so it never loops: a lyre, a reed pipe and a hand drum over a drone.
  // Three pieces. 'ludus' is slow and in the Dorian mode, for the yard: a tune for the pipe is made for each
  // sixteen bars and comes back through them. 'arena' is quick, Phrygian and driven by the drum, and grows busier
  // as the crowd grows louder. 'wild' is the open country. Each follows how things stand (see mood and hold).

  const M = { mode: null, want: null, step: 0, next: 0, timer: 0, heat: 0, bar: null,
    night: false, tense: false, festive: false, danger: 1, hold: false, motif: null, quiet: false, riff: null,
    // and for the arena's piece, how the fight stands: 'intro', 'fight' or 'over'; whether your side is failing; whether it
    // is to the death or against beasts; whether it has come down to the last of it; and, once over, who won
    phase: 'fight', peril: false, kind: '', climax: false, won: false };
  // 'grim' is what the yard's tune turns to when the house is in debt, and the country's where it is most dangerous
  const SCALES = { ludus: [0, 2, 3, 5, 7, 9, 10], arena: [0, 1, 3, 5, 7, 8, 10], wild: [0, 2, 3, 5, 7, 8, 10], grim: [0, 1, 3, 5, 7, 8, 10] };
  const ROOT = 146.83;                                 // D below middle C
  // which scale a piece is in just now
  const scaleOf = mode => (mode === 'ludus' && M.tense) || (mode === 'wild' && M.danger >= 4) ? 'grim' : mode;
  // the pitch of a step of the scale; steps past the seventh climb into the next octave
  const pitch = (mode, deg, oct) => { const sc = SCALES[scaleOf(mode)], n = sc.length; return ROOT * Math.pow(2, (sc[((deg % n) + n) % n] + 12 * (Math.floor(deg / n) + (oct || 0))) / 12); };

  // One musical voice. o: type, f, vol, t, dur, attack, hold, lp0, lp1, vib, det
  function mvoice(o) {
    const t = o.t, osc = ctx.createOscillator(); osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(o.f * (o.det || 1), t);
    if (o.vib) { const l = ctx.createOscillator(), d = ctx.createGain(); l.frequency.value = 5; d.gain.setValueAtTime(0, t); d.gain.linearRampToValueAtTime(o.f * o.vib, t + o.dur * 0.5); l.connect(d); d.connect(osc.frequency); l.start(t); l.stop(t + o.dur + 0.05); }
    const g = ctx.createGain(); g.gain.value = 0.0001;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol, t + (o.attack || 0.005));
    if (o.hold) g.gain.setValueAtTime(o.vol, t + o.dur * o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(o.lp0 || 2400, t); f.frequency.exponentialRampToValueAtTime(o.lp1 || o.lp0 || 2400, t + Math.min(o.dur, 0.3));
    osc.connect(f); f.connect(g); g.connect(musicBus);
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }
  function mnoise(t, dur, type, freq, vol, q) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 0.8;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(musicBus);
    src.start(t, Math.random()); src.stop(t + dur + 0.03);
  }
  // a plucked string: two strings a hair apart, bright at the pluck and dulling as it rings
  const lyre = (f, vol, t, dur) => { for (const det of [1, 1.004]) mvoice({ f, det, vol: vol * 0.6, t, dur: dur || 1.4, attack: 0.004, lp0: Math.min(5200, f * 7), lp1: f * 1.6 }); };
  // a reed pipe: slow to speak, held, with a waver that grows
  const pipe = (f, vol, t, dur) => { mvoice({ type: 'square', f, vol: vol * 0.5, t, dur, attack: 0.07, hold: 0.75, lp0: 900, lp1: 1500, vib: 0.007 }); mvoice({ type: 'sine', f: f * 2, vol: vol * 0.18, t, dur, attack: 0.09, hold: 0.7, lp0: 3000 }); };
  const dum = (t, vol) => { mvoice({ type: 'sine', f: 82, vol, t, dur: 0.3, attack: 0.003, lp0: 400 }); mnoise(t, 0.05, 'lowpass', 500, vol * 0.5); };
  const tek = (t, vol) => { mnoise(t, 0.06, 'bandpass', 1900, vol, 1.6); mvoice({ type: 'triangle', f: 330, vol: vol * 0.25, t, dur: 0.05, attack: 0.002, lp0: 1200 }); };
  const jingle = (t, vol) => mnoise(t, 0.05, 'highpass', 6000, vol);

  const LUDUS_CHORDS = [0, 0, 6, 0, 3, 0, 4, 0, 0, 5, 3, 0, 6, 3, 4, 0];        // roots, as steps of the scale, one a bar
  const LUDUS_FIGURES = ['0-2-1-2-', '0-21--2-', '0--2-1--', '02-1-2--', '0---2-1-', '0-1-2-12'];
  const ARENA_DRUMS = ['D-ttD-t-', 'D-tDD-tt', 'D-ttD-tD', 'DtttD-t-'];
  const ARENA_BASS = [0, 0, 4, 0, 1, 0, 4, 6];                                   // the low string, one note a step
  const ARENA_BASSES = [ARENA_BASS, [0, 4, 0, 4, 1, 0, 6, 4], [0, 0, 2, 0, 4, 0, 2, 1]];      // and the other ways it goes, a section at a time
  const pick1 = a => a[Math.floor(Math.random() * a.length)];
  const human = () => rnd(-0.008, 0.008);

  // A short tune for the pipe, as steps away from the bar's root: two halves of a bar each, and a way home.
  // It is made once for a section of sixteen bars and comes back through it, so the yard has a melody and not only notes.
  function makeMotif() {
    const half = start => { const out = []; let d = start, at = pick1([0, 0, 1, 2]); while (at < 8) { const len = pick1([2, 2, 3, 4]); out.push({ at, len, d }); at += len; d += pick1([-2, -1, -1, 1, 1, 2]); } return out; };
    const a = half(pick1([2, 4, 4, 7])), b = half(a[a.length - 1].d + pick1([-1, 1, 2]));
    const home = b.map(x => Object.assign({}, x)); home[home.length - 1].d = pick1([0, 7]); home[home.length - 1].len = Math.max(3, home[home.length - 1].len);
    return { a, b, home };
  }
  const vary = tune => tune.map(x => Math.random() < 0.18 ? Object.assign({}, x, { d: x.d + pick1([-1, 1]) }) : x);

  // Plans one bar at a time, then plays it step by step (eight steps to the bar).
  function planBar(mode, n) {
    if (mode === 'ludus') {
      const root = LUDUS_CHORDS[n % LUDUS_CHORDS.length], inSec = n % 16, phrase = Math.floor(inSec / 4), inPhrase = inSec % 4;
      if (inSec === 0 || !M.motif) { M.motif = makeMotif(); M.quiet = n > 0 && Math.random() < 0.3; }      // a new section: a new tune, or now and then none
      const bar = { root, fig: pick1(LUDUS_FIGURES), tune: null, strum: inPhrase === 0, up: phrase === 2 ? 2 : 0 };
      const piping = !M.quiet && (!M.night || phrase === 3);                  // by night the pipe is mostly put away
      if (piping && inPhrase === 1) bar.tune = vary(M.motif.a);
      if (piping && inPhrase === 3) bar.tune = phrase === 3 ? M.motif.home : vary(M.motif.b);
      return bar;
    }
    if (mode === 'wild') {                            // the open country: a pipe a long way off, and not much else
      const bar = { root: [0, 0, 5, 0, 3, 0, 6, 4][n % 8], tune: null };
      if (n % 2 === 0) { let d = bar.root + pick1([4, 7, 9]), at = pick1([0, 1, 2]); bar.tune = []; while (at < 7) { const len = pick1([2, 3, 4, 4]); bar.tune.push({ at, len, d }); at += len + pick1([0, 0, 1]); d += pick1([-2, -1, -1, 1, 2]); } }
      // now and then another pipe answers from further off, a fifth below and a moment late
      if (bar.tune) bar.echo = bar.tune.filter(() => Math.random() < 0.35).map(x => ({ at: x.at + 2, len: x.len, d: x.d - 4 })).filter(x => x.at < 8);
      return bar;
    }
    if (!M.riff) M.riff = Array.from({ length: 8 }, (_, k) => (k === 0 || Math.random() < 0.5 ? pick1([0, 2, 4, 5, 7]) : null));      // this fight's own figure on the high string
    // the fight has a tune of its own too, for the pipe: made once, and brought back in the second and fourth bar of each four
    if (!M.motif) M.motif = makeMotif();
    if (n % 8 === 0 || !M.bass) M.bass = n < 8 ? ARENA_BASS : pick1(ARENA_BASSES);
    const tune = n % 4 === 1 ? vary(M.motif.a) : n % 4 === 3 ? (n % 8 === 7 ? M.motif.home : vary(M.motif.b)) : null;
    return { drums: pick1(ARENA_DRUMS), shift: n % 8 >= 6 ? 3 : 0, fill: n % 4 === 3, roll: n % 8 === 7, tune };
  }
  function playStep(mode, n, t) {
    const i = n % 8, barN = Math.floor(n / 8);
    if (i === 0 || !M.bar) M.bar = planBar(mode, barN);
    const b = M.bar;
    if (mode === 'ludus') {
      const c = b.fig[i], chord = [b.root, b.root + 2, b.root + 4];
      if (i === 0) lyre(pitch(mode, b.root, -1), 0.16, t + human(), M.night ? 3.4 : 2.6);                 // the low string marks the bar
      if (b.strum && i === 0 && !M.night) chord.forEach((d, k) => lyre(pitch(mode, d), 0.06, t + 0.03 + k * 0.035, 1.8));      // a hand across the strings opens each phrase
      if (c !== '-' && !(M.night && Math.random() < 0.4)) lyre(pitch(mode, chord[+c] + (c !== '0' && Math.random() < 0.25 ? 7 : 0)), rnd(0.09, 0.13), t + human(), 1.5);
      for (const x of (b.tune || [])) if (x.at === i) pipe(pitch(mode, b.root + x.d + b.up, 1), 0.07, t, x.len * M.beat * 0.95);
      if (M.festive && !M.night) { if (i === 0) dum(t, 0.07); else if (i === 3 || i === 6) tek(t + human(), 0.045); }       // games day: someone keeps time on a hand drum
      return;
    }
    if (mode === 'wild') {
      if (i === 0) lyre(pitch(mode, b.root, -1), 0.13, t + human(), 3.2);
      if (i === 4 && Math.random() < 0.5) lyre(pitch(mode, b.root + 4, -1), 0.08, t + human(), 2.4);
      for (const x of (b.tune || [])) if (x.at === i) pipe(pitch(mode, x.d, 0), 0.075, t, x.len * M.beat * 0.95);
      for (const x of (b.echo || [])) if (x.at === i) pipe(pitch(mode, x.d, 0), 0.03, t, x.len * M.beat * 0.9);
      if (M.danger >= 3) { if (i === 0) dum(t, 0.07 + 0.02 * (M.danger - 3)); else if (i === 3) dum(t, 0.04); }             // far from home: a slow drum under it, like a pulse
      return;
    }
    if (M.phase === 'intro') {                        // they are walking in: the drum alone, gathering, and one long call on the pipe
      if (i % 2 === 0) dum(t, 0.14 + i * 0.012);
      if (i >= 4) tek(t + M.beat / 2, 0.07 + (i - 4) * 0.015);
      if (i === 0 && barN % 2 === 0) pipe(pitch(mode, barN % 4 ? 4 : 0, 0), 0.06, t, M.beat * 6);
      if (i === 0) lyre(pitch(mode, 0, -1), 0.12, t + human(), 1.6);
      return;
    }
    if (M.phase === 'over') {                         // it is settled: a slow pulse on the drum while the fallen are judged, and a note that says how it went
      if (i === 0) { dum(t, 0.2); lyre(pitch(mode, 0, -1), 0.13, t + human(), 2.4); }
      if (i === 3) dum(t, 0.1);
      if (i === 4 && barN % 2 === 1) lyre(pitch(mode, M.won ? 4 : 1, 0), 0.08, t + human(), 2);
      if (i === 0 && barN % 4 === 2) pipe(pitch(mode, M.won ? 2 : 0, 0), 0.045, t, M.beat * 7);
      return;
    }
    if (M.hold) {                                     // the fight waits on a choice: the band holds its breath
      if (i === 0) dum(t, 0.16);
      if (i % 4 === 0) lyre(pitch(mode, ARENA_BASS[i] + b.shift, -1), 0.08, t + human(), 0.9);
      return;
    }
    const heat = M.heat, d = b.drums[i], bass = M.bass || ARENA_BASS, death = M.kind === 'death', hunt = M.kind === 'hunt';
    if (d === 'D') dum(t, death ? 0.34 : 0.3); else if (d === 't' && !(heat < 0.12 && i % 2)) tek(t + human(), 0.16);      // the opening is spare; the drum fills in as the crowd warms
    if (death && i === 3) dum(t, 0.2);                                                                      // to the death: the drum is heavier, and comes again
    if (hunt && (i === 2 || i === 5)) mvoice({ type: 'sine', f: 110, vol: 0.13, t: t + human(), dur: 0.22, attack: 0.003, lp0: 500 });      // against beasts: a second, higher drum
    if (b.fill && i >= 6) tek(t + M.beat / 2, 0.14);
    if (b.roll && i === 7) { dum(t + M.beat / 3, 0.18); dum(t + M.beat * 2 / 3, 0.24); }                    // every eighth bar ends in a roll
    if (M.climax && i % 2 === 1) tek(t + M.beat / 2, 0.1);                                                  // the last of it: the small drum never stops
    lyre(pitch(mode, bass[i] + b.shift, -1), i % 4 === 0 ? 0.15 : 0.1, t + human(), 0.5);
    if (M.peril) {                                    // your side is failing: the low string an octave down, the half-step above home pressed on, and no tune
      if (i % 4 === 0) lyre(pitch(mode, bass[i] + b.shift, -2), 0.13, t + human(), 1.1);
      if (i === 6) lyre(pitch(mode, 1, -1), 0.11, t + human(), 0.9);
      if (i === 0 && barN % 2 === 0) pipe(pitch(mode, barN % 4 ? 1 : 0, -1), 0.06, t, M.beat * 7);
      return;
    }
    if (heat > 0.3 && !(death && heat < 0.5)) jingle(t, 0.05 + heat * 0.05);
    if (heat > 0.3 && i % 2 === 1 && !death) jingle(t + M.beat / 2, 0.04);
    if (heat > 0.5 && M.riff[i] !== null) lyre(pitch(mode, M.riff[i] + b.shift + (barN % 4 === 3 ? 2 : 0), 1), 0.09, t + human(), 0.7);   // the high string takes up its figure when the fight is good
    if (heat > 0.25 && b.tune && !hunt) { for (const x of b.tune) if (x.at === i) pipe(pitch(mode, x.d + b.shift, 1), 0.05 + heat * 0.02, t, x.len * M.beat * 0.95); }      // and the pipe has the fight's own tune
    else if (heat > 0.65 && i === 0 && barN % 2 === 0) pipe(pitch(mode, 4 + b.shift, 0), 0.07, t, M.beat * 7);
  }
  function setPiece(mode, t) {
    M.mode = mode; M.step = 0; M.bar = null; M.motif = null; M.riff = null; M.bass = null; M.hold = false;
    M.beat = mode === 'arena' ? 60 / 112 / 2 : mode === 'wild' ? 60 / 52 / 2 : 60 / 66 / 2;                               // one step is half a beat
    M.next = t + 0.15;
    const arenaNow = mode === 'arena', f = ROOT / 2;
    drone.root.frequency.setTargetAtTime(f, t, 0.3); drone.fifth.frequency.setTargetAtTime(f * 1.5, t, 0.3); drone.high.frequency.setTargetAtTime(f * 2, t, 0.3);
    drone.g.gain.setTargetAtTime(mode ? (arenaNow ? 0.11 : 0.075) : 0, t, mode ? 1.2 : 0.4);
  }
  // Runs a few times a second and writes down the notes for the next half second.
  function conduct() {
    if (!ctx || !musicOn || muted || document.hidden) return;
    const now = ctx.currentTime;
    if (M.want !== M.mode) setPiece(M.want, now);
    if (!M.mode) return;
    if (M.next < now) M.next = now + 0.05;                // the page was asleep: pick up from here, do not rush to catch up
    while (M.next < now + 0.5) { playStep(M.mode, M.step++, M.next); M.next += M.beat * (M.mode === 'arena' && M.climax && M.phase === 'fight' ? 0.9 : 1); }      // the last of a fight is taken quicker
  }
  function music(mode) {
    M.want = mode || null;
    if (!M.timer && typeof setInterval === 'function') M.timer = setInterval(conduct, 120);
    conduct();
  }

  function run(set, name, v, pan, kind) {
    if (!ctx || muted || !set[name] || voices > 48) return;
    const now = ctx.currentTime;
    if (now - (last[name] || -1) < 0.03) return;         // at four times speed, the same sound twice in a frame is only louder
    last[name] = now;
    try { set[name](v || 1, pan || 0, kind); } catch (e) { console.warn('sound failed: ' + name, e); }
  }

  return {
    init,
    // which piece plays: 'ludus', 'arena', or nothing
    music,
    // How things stand, for the band to follow: { night, tense, festive, danger }. Only what is given is changed.
    mood(o) { for (const k in o) if (k in M && ['night', 'tense', 'festive', 'danger', 'phase', 'peril', 'kind', 'climax', 'won'].includes(k)) M[k] = o[k]; },
    // The arena's piece holds back while the fight waits on the player.
    hold(on) { M.hold = !!on; },
    get musicOn() { return musicOn; },
    get musicNow() { return { piece: M.mode || null, step: M.step, heat: Math.round(M.heat * 100) / 100 }; },
    toggleMusic() {
      musicOn = !musicOn;
      try { localStorage.setItem(MUSIC_KEY, musicOn ? '1' : '0'); } catch (e) { /* storage unavailable */ }
      if (!ctx) return;
      musicBus.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.15);
      if (musicOn) { M.mode = undefined; conduct(); }    // start the piece afresh
    },
    // The sliders: 0 to 100. Nothing is off; anything more is on, and that loud.
    get volume() { return muted ? 0 : vol; },
    get musicVolume() { return musicOn ? mvol : 0; },
    setVolume(v) {
      v = Math.max(0, Math.min(100, Math.round(+v) || 0));
      const was = muted; muted = v <= 0; if (v > 0) vol = v;
      keep(MUTE_KEY, muted ? '1' : '0'); keep(VOL_KEY, vol);
      if (master) master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.02);
      if (was && !muted) conduct();
    },
    setMusicVolume(v) {
      v = Math.max(0, Math.min(100, Math.round(+v) || 0));
      const was = musicOn; musicOn = v > 0; if (v > 0) mvol = v;
      keep(MUSIC_KEY, musicOn ? '1' : '0'); keep(MVOL_KEY, mvol);
      if (!ctx) return;
      musicBus.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.08);
      if (musicOn && !was) { M.mode = undefined; conduct(); }    // back from nothing: the piece starts afresh
    },
    // For tuning: writes out some seconds of a piece without playing it and reports how loud it is.
    async probeMusic(mode, seconds, heat, moodFor) {
      const keep = [ctx, master, bus, verb, noiseBuf, murmur, roar, roarBand, roarBand2, muted, voices, boost, musicBus, drone, musicOn], keepAmb = amb;
      const keepM = Object.assign({}, M);
      ctx = null; muted = false; musicOn = true;
      try {
        init(() => new OfflineAudioContext(2, 44100 * seconds, 44100));
        M.heat = heat || 0; Object.assign(M, { night: false, tense: false, festive: false, danger: 1 }, moodFor || {}); setPiece(mode, 0);
        while (M.next < seconds) { playStep(mode, M.step++, M.next); M.next += M.beat; }
        const buf = await ctx.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1);
        let peak = 0, sum = 0, n = 0;
        for (let i = 44100 * 2; i < L.length; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; sum += (L[i] * L[i] + R[i] * R[i]) / 2; n++; }
        return { peak: Math.round(peak * 1000) / 1000, rms: Math.round(Math.sqrt(sum / n) * 1000) / 1000, steps: M.step };
      } finally {
        [ctx, master, bus, verb, noiseBuf, murmur, roar, roarBand, roarBand2, muted, voices, boost, musicBus, drone, musicOn] = keep; amb = keepAmb;
        Object.assign(M, keepM);
      }
    },
    // For tuning: renders some seconds of the crowd (exc and boost 0 to 1) or of rain (0 to 1) and reports how loud it is,
    // and how much of it is high hiss (above about 3 kHz) as a share of the whole: the lower, the less like static.
    async probeAir(kind, a, b, seconds) {
      const keep = [ctx, master, bus, verb, noiseBuf, murmur, roar, roarBand, roarBand2, muted, voices, boost, musicBus, drone, musicOn], keepAmb = amb, sec = seconds || 5;
      ctx = null; muted = false; amb = null;
      try {
        init(() => new OfflineAudioContext(2, 44100 * sec, 44100));
        if (kind === 'crowd') { boost = b || 0; murmur.gain.value = 0.03 + a * 0.07; roar.gain.value = a * 0.05 + boost * 0.55; roarBand.frequency.value = 600 + boost * 330 + a * 90; if (roarBand2) roarBand2.frequency.value = 1050 + boost * 650 + a * 150; }
        else { this.ambience(a, 0); amb.rg.gain.value = a * RAIN_WASH; for (let k = 0; k < sec * a * 30; k++) { const fat = Math.random() < 0.12, f = fat ? rnd(450, 900) : rnd(1500, 4400); tone({ f0: f, f1: f * (fat ? 0.6 : 0.75), dur: fat ? 0.05 : 0.02, vol: (fat ? 0.017 : 0.01) * (0.5 + a * 0.5), attack: 0.001, pan: rnd(-1, 1), delay: Math.random() * sec }); } }
        const buf = await ctx.startRendering(), L = buf.getChannelData(0);
        let sum = 0, hi = 0, n = 0, prev = 0, peak = 0;
        for (let i = 44100; i < L.length; i++) { const x = L[i], d = x - prev; prev = x; sum += x * x; hi += d * d; n++; if (Math.abs(x) > peak) peak = Math.abs(x); }
        const f3 = x => Math.round(x * 1000) / 1000;
        return { rms: f3(Math.sqrt(sum / n)), peak: f3(peak), hiss: f3(Math.sqrt(hi / n) / (Math.sqrt(sum / n) || 1)) };
      } finally {
        [ctx, master, bus, verb, noiseBuf, murmur, roar, roarBand, roarBand2, muted, voices, boost, musicBus, drone, musicOn] = keep; amb = keepAmb;
      }
    },
    get muted() { return muted; },
    play(name, v, pan, kind) { run(arena, name, v, pan, kind); },
    ui(name) { run(ui, name); },
    // called every frame while a fight is on screen
    crowd(exc) {
      if (!ctx) return;
      boost *= 0.985;
      M.heat += (Math.min(1, exc + boost) - M.heat) * 0.02;
      const t = ctx.currentTime;
      murmur.gain.setTargetAtTime(0.03 + exc * 0.07, t, 0.15);
      roar.gain.setTargetAtTime(exc * 0.05 + boost * 0.55, t, 0.07);
      roarBand.frequency.setTargetAtTime(600 + boost * 330 + exc * 90, t, 0.12);          // the vowel opens as they get louder
      if (roarBand2) roarBand2.frequency.setTargetAtTime(1050 + boost * 650 + exc * 150, t, 0.12);
      // single voices out of the mass: a shout here and there, more of them the better the fight
      const heat = Math.min(1, exc + boost);
      if (heat > 0.12 && voices < 30 && Math.random() < 0.006 + heat * 0.045) {
        const f = rnd(160, 330);
        tone({ type: 'sawtooth', f0: f, f1: f * rnd(0.8, 1.3), dur: rnd(0.16, 0.42), vol: rnd(0.008, 0.02) * (0.5 + heat), attack: 0.04, lp: 800, lp1: 1700, vib: 0.025, pan: rnd(-0.9, 0.9), wet: 0.7 });
      }
    },
    // The weather and the hour over the town: rain as a wash of noise, night as crickets. Both 0 to 1; called every frame.
    ambience(rain, night) {
      if (!ctx) return;
      if (!amb) {
        if (!(rain > 0.02 || night > 0.3)) return;            // nothing to build until there is something to hear
        try {
          // Rain is drops, not hiss: a soft low wash for the fall of it on roofs and ground, which rises and sinks
          // with the gusts, and over that each drop on its own (see below), a short bright tick somewhere left or right.
          const mk = rate => { const q = ctx.createBufferSource(); q.buffer = noiseBuf; q.loop = true; q.playbackRate.value = rate; q.start(0, Math.random()); return q; };
          const wash = ctx.createBiquadFilter(); wash.type = 'bandpass'; wash.frequency.value = 850; wash.Q.value = 0.45;
          const washLp = ctx.createBiquadFilter(); washLp.type = 'lowpass'; washLp.frequency.value = 2600;
          const gust = ctx.createGain(); gust.gain.value = 0.75;
          const gl = ctx.createOscillator(), gd = ctx.createGain(); gl.frequency.value = 0.13; gd.gain.value = 0.25; gl.connect(gd); gd.connect(gust.gain); gl.start();
          const roof = ctx.createBiquadFilter(); roof.type = 'lowpass'; roof.frequency.value = 320; const roofG = ctx.createGain(); roofG.gain.value = 1.6;
          const rg = ctx.createGain(); rg.gain.value = 0;
          mk(0.5).connect(wash); wash.connect(washLp); washLp.connect(gust); gust.connect(rg);
          mk(0.4).connect(roof); roof.connect(roofG); roofG.connect(rg);
          rg.connect(bus);
          // crickets: a high thin note, chopped fast, coming and going
          const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 4300;
          const chop = ctx.createGain(); chop.gain.value = 0.5;
          const fast = ctx.createOscillator(); fast.type = 'square'; fast.frequency.value = 23; const fd = ctx.createGain(); fd.gain.value = 0.5; fast.connect(fd); fd.connect(chop.gain);
          const swell = ctx.createGain(); swell.gain.value = 0.5;
          const slow = ctx.createOscillator(); slow.frequency.value = 0.7; const sd = ctx.createGain(); sd.gain.value = 0.5; slow.connect(sd); sd.connect(swell.gain);
          const cg = ctx.createGain(); cg.gain.value = 0;
          osc.connect(chop); chop.connect(swell); swell.connect(cg); cg.connect(bus); osc.start(); fast.start(); slow.start();
          amb = { rg, cg, t: ctx.currentTime, acc: 0 };
        } catch (e) { amb = { rg: null, cg: null }; }
      }
      const t = ctx.currentTime;
      const wet = Math.max(0, Math.min(1, rain || 0));
      if (amb.rg) amb.rg.gain.setTargetAtTime(wet * RAIN_WASH, t, 0.6);
      // the drops themselves: so many a second, each a tick of its own pitch and place; a few fall fat
      amb.acc = Math.min(8, (amb.acc || 0) + Math.max(0, t - (amb.t || t)) * wet * 30); amb.t = t;
      while (amb.acc >= 1 && !muted) {
        amb.acc -= 1;
        if (voices > 36) continue;
        const fat = Math.random() < 0.12, f = fat ? rnd(450, 900) : rnd(1500, 4400);
        tone({ f0: f, f1: f * (fat ? 0.6 : 0.75), dur: fat ? rnd(0.04, 0.07) : rnd(0.012, 0.03), vol: (fat ? rnd(0.012, 0.022) : rnd(0.005, 0.016)) * (0.5 + wet * 0.5), attack: 0.001, pan: rnd(-1, 1) });
      }
      if (amb.cg) amb.cg.gain.setTargetAtTime(night > 0.5 && !(rain > 0.2) ? (night - 0.5) * 0.012 : 0, t, 1.2);
    },
    quiet() { if (ctx) { boost = 0; murmur.gain.setTargetAtTime(0.03, ctx.currentTime, 0.5); roar.gain.setTargetAtTime(0.01, ctx.currentTime, 0.8); } },
    stop() { if (ctx) { boost = 0; murmur.gain.setTargetAtTime(0, ctx.currentTime, 0.25); roar.gain.setTargetAtTime(0, ctx.currentTime, 0.25); } },
    toggle() {
      muted = !muted;
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* storage unavailable */ }
      if (master) master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.02);
      if (!muted) conduct();
    },
    // For tuning: renders one sound without playing it and reports how loud it is.
    // Returns { peak, rms, left, right, seconds } for the three seconds after it starts.
    async probe(name, v, pan, kind) {
      const keep = [ctx, master, bus, verb, noiseBuf, murmur, roar, roarBand, roarBand2, muted, voices, boost, musicBus, drone], keepAmb = amb;
      ctx = null; muted = false;
      try {
        init(() => new OfflineAudioContext(2, 44100 * 3, 44100));
        Object.keys(last).forEach(k => delete last[k]);
        (arena[name] || ui[name])(v || 1, pan || 0, kind);
        const buf = await ctx.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1);
        let peak = 0, sum = 0, l = 0, r = 0, end = 0;
        for (let i = 0; i < L.length; i++) {
          const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
          if (a > peak) peak = a;
          if (a > 0.003) end = i;
          sum += (L[i] * L[i] + R[i] * R[i]) / 2; l += L[i] * L[i]; r += R[i] * R[i];
        }
        const f = x => Math.round(x * 1000) / 1000;
        return { peak: f(peak), rms: f(Math.sqrt(sum / L.length)), left: f(Math.sqrt(l / L.length)), right: f(Math.sqrt(r / L.length)), seconds: f(end / 44100) };
      } finally {
        [ctx, master, bus, verb, noiseBuf, murmur, roar, roarBand, roarBand2, muted, voices, boost, musicBus, drone] = keep; amb = keepAmb;
        Object.keys(last).forEach(k => delete last[k]);
      }
    },
    // every sound there is, and how many voices are sounding
    get names() { return { arena: Object.keys(arena), ui: Object.keys(ui) }; },
    get voices() { return voices; },
  };
})();
