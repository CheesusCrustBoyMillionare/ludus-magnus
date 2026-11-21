'use strict';
// Synthesized sound (Web Audio, no asset files): the arena, its crowd, and the small noises of running a ludus.
// The audio context is created on the player's first click, since browsers only allow sound to start from a gesture.

const SFX = (() => {
  const MUTE_KEY = 'ludus-magnus-mute', LEVEL = 0.7;
  let ctx = null, master = null, bus = null, verb = null, noiseBuf = null, muted = false;
  let murmur = null, roar = null, roarBand = null, boost = 0, voices = 0;
  const last = {};
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* storage unavailable */ }

  const rnd = (a, b) => a + Math.random() * (b - a);

  function init(make) {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC && !make) return;
    try {
      ctx = make ? make() : new AC();
      // everything passes through a compressor, so a pile of blows at once thickens rather than crackles
      master = ctx.createGain(); master.gain.value = muted ? 0 : LEVEL; master.connect(ctx.destination);
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

      // the crowd: a low murmur that never quite stops, and a roar that swells when something happens
      const layer = (freq, q, rate, breathe) => {
        const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = rate;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
        const g = ctx.createGain(); g.gain.value = 0;
        let end = g;
        if (breathe) {                       // the murmur swells and sinks a little, so it never sounds like a steady hiss
          const b = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
          b.gain.value = 1; lfo.frequency.value = 0.23; depth.gain.value = 0.3;
          lfo.connect(depth); depth.connect(b.gain); lfo.start(); g.connect(b); end = b;
        }
        src.connect(bp); bp.connect(g); end.connect(bus); end.connect(verb); src.start(0, Math.random());
        return { g, bp };
      };
      murmur = layer(480, 0.6, 0.8, true).g;
      const r = layer(1000, 0.8, 1.15); roar = r.g; roarBand = r.bp;
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
    hit(v, pan, kind) {
      const hard = v > 1.2, p = rnd(0.88, 1.14);
      if (kind === 'beast') { tone({ type: 'sawtooth', f0: 120 * p, f1: 70, dur: 0.2, vol: 0.22, lp: 700, pan, wet: 0.3 }); noise({ dur: 0.1, f0: 1100, f1: 250, vol: 0.4, pan, wet: 0.3 }); }
      else { noise({ dur: 0.035, type: 'highpass', f0: 4200 * p, vol: 0.2 * v, pan, wet: 0.2 }); noise({ dur: 0.1, f0: 1700 * p, f1: 260, vol: 0.42 * v, pan, wet: 0.3 }); }
      tone({ f0: 150 * p, f1: 48, dur: 0.13, vol: 0.4 * v, attack: 0.003, pan, wet: 0.25 });
      if (hard) {                                  // a telling blow: a crack, a deeper thud, and the stands gasp
        noise({ dur: 0.07, type: 'bandpass', f0: 2600, f1: 1200, vol: 0.4, q: 1.2, pan, wet: 0.45 });
        tone({ f0: 88, f1: 30, dur: 0.3, vol: 0.5, attack: 0.003, pan, wet: 0.4 });
        cheer(0.14);
      }
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
    gate() { noise({ dur: 0.3, f0: 300, f1: 120, vol: 0.12, attack: 0.05 }); tone({ f0: 70, f1: 50, dur: 0.18, vol: 0.14, attack: 0.003, delay: 0.26 }); },   // a man leaves by the gate
  };

  function run(set, name, v, pan, kind) {
    if (!ctx || muted || !set[name] || voices > 48) return;
    const now = ctx.currentTime;
    if (now - (last[name] || -1) < 0.03) return;         // at four times speed, the same sound twice in a frame is only louder
    last[name] = now;
    try { set[name](v || 1, pan || 0, kind); } catch (e) { console.warn('sound failed: ' + name, e); }
  }

  return {
    init,
    get muted() { return muted; },
    play(name, v, pan, kind) { run(arena, name, v, pan, kind); },
    ui(name) { run(ui, name); },
    // called every frame while a fight is on screen
    crowd(exc) {
      if (!ctx) return;
      boost *= 0.985;
      const t = ctx.currentTime;
      murmur.gain.setTargetAtTime(0.03 + exc * 0.07, t, 0.15);
      roar.gain.setTargetAtTime(exc * 0.05 + boost * 0.55, t, 0.07);
      roarBand.frequency.setTargetAtTime(900 + boost * 1100 + exc * 300, t, 0.1);
    },
    quiet() { if (ctx) { boost = 0; murmur.gain.setTargetAtTime(0.03, ctx.currentTime, 0.5); roar.gain.setTargetAtTime(0.01, ctx.currentTime, 0.8); } },
    stop() { if (ctx) { boost = 0; murmur.gain.setTargetAtTime(0, ctx.currentTime, 0.25); roar.gain.setTargetAtTime(0, ctx.currentTime, 0.25); } },
    toggle() {
      muted = !muted;
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* storage unavailable */ }
      if (master) master.gain.setTargetAtTime(muted ? 0 : LEVEL, ctx.currentTime, 0.02);
    },
    // For tuning: renders one sound without playing it and reports how loud it is.
    // Returns { peak, rms, left, right, seconds } for the three seconds after it starts.
    async probe(name, v, pan, kind) {
      const keep = [ctx, master, bus, verb, noiseBuf, murmur, roar, roarBand, muted, voices, boost];
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
        [ctx, master, bus, verb, noiseBuf, murmur, roar, roarBand, muted, voices, boost] = keep;
        Object.keys(last).forEach(k => delete last[k]);
      }
    },
    // every sound there is, and how many voices are sounding
    get names() { return { arena: Object.keys(arena), ui: Object.keys(ui) }; },
    get voices() { return voices; },
  };
})();
