'use strict';
// Synthesized arena sound (Web Audio, no asset files). Created on the first fight,
// since browsers only allow audio to start from a user gesture.

const SFX = (() => {
  const MUTE_KEY = 'ludus-magnus-mute';
  let ctx = null, master = null, noiseBuf = null, crowdGain = null, boost = 0, muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* storage unavailable */ }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // crowd murmur: looped noise through a band-pass, volume follows excitement
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.5;
      crowdGain = ctx.createGain(); crowdGain.gain.value = 0;
      src.connect(bp); bp.connect(crowdGain); crowdGain.connect(master); src.start();
    } catch (e) { ctx = null; }
  }

  function noise(dur, type, f0, f1, vol, q) {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q || 0.7;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random()); src.stop(t + dur + 0.02);
  }
  function tone(type, f0, f1, dur, vol, delay, lp) {
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node = o;
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
    node.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const cheer = v => { boost = Math.max(boost, v); };

  const sounds = {
    hit: v => { noise(0.09, 'lowpass', 1400, 300, 0.45 * v); tone('sine', 140, 50, 0.12, 0.45 * v); },
    block: () => { tone('square', 1250, 1180, 0.14, 0.1); tone('triangle', 1870, 1790, 0.2, 0.12); noise(0.04, 'highpass', 3000, 3000, 0.22); },
    miss: () => noise(0.13, 'bandpass', 500, 1800, 0.16, 2),
    net: () => noise(0.3, 'bandpass', 300, 1200, 0.2, 1.5),
    special: () => noise(0.18, 'bandpass', 800, 2400, 0.2, 3),
    down: () => { tone('sine', 110, 35, 0.35, 0.8); noise(0.25, 'lowpass', 500, 100, 0.6); cheer(0.3); },
    yield: () => cheer(0.18),
    spared: () => cheer(0.22),
    killed: () => { tone('sine', 100, 35, 0.3, 0.7); noise(0.15, 'lowpass', 900, 200, 0.5); cheer(0.35); },
    start: () => cheer(0.25),
    horn: () => {
      tone('sawtooth', 196, 196, 0.24, 0.12, 0, 900);
      tone('sawtooth', 196, 196, 0.24, 0.12, 0.28, 900);
      tone('sawtooth', 294, 290, 0.8, 0.14, 0.56, 1100);
      tone('sawtooth', 147, 146, 0.8, 0.08, 0.56, 700);
    },
  };

  return {
    init,
    get muted() { return muted; },
    play(name, v) {
      if (!ctx || muted || !sounds[name]) return;
      try { sounds[name](v || 1); } catch (e) { /* ignore audio glitches */ }
    },
    // called every frame while a fight is on screen
    crowd(exc) {
      if (!ctx) return;
      boost *= 0.985;
      crowdGain.gain.setTargetAtTime(0.03 + exc * 0.1 + boost, ctx.currentTime, 0.08);
    },
    quiet() { if (ctx) { boost = 0; crowdGain.gain.setTargetAtTime(0.03, ctx.currentTime, 0.5); } },
    stop() { if (ctx) { boost = 0; crowdGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2); } },
    toggle() {
      muted = !muted;
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* storage unavailable */ }
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.6, ctx.currentTime, 0.02);
    },
  };
})();
