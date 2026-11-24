// Contrast audit, for the browser. It finds every piece of text on the page that falls short of WCAG AA contrast
// (4.5 to 1, or 3 to 1 for large text) against the background painted under it. Text on a canvas is not seen.
//
// With the game open, in the browser console:
//   const s = document.createElement('script'); s.src = 'tools/a11y-audit.js'; document.head.appendChild(s);
//   __audit()            the whole page as it stands; an empty list is a pass
//   __audit('#modal')    one part of it
// Each line is: ratio, font size, how many, where, the two colours, a sample. "DISABLED" marks a control that cannot
// be used, which the standard exempts. Run it on each screen: it only sees what is on the page at the time.
window.__audit = function (rootSel) {
  const parse = s => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  // the background under an element: layers from the element outward, composited from the bottom up
  function bgOf(el) {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const c = parse(cs.backgroundColor);
      const img = cs.backgroundImage;
      let solid = false;
      if (img && img !== 'none' && /gradient/.test(img)) {
        // only a gradient that covers the whole box counts as its background: a linear one whose every stop is opaque.
        // Studs, sheens and speckle painted over a flat colour are decoration, and the flat colour is what text sits on.
        const parts = []; let d = 0, s = '';
        for (const ch of img) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { parts.push(s.trim()); s = ''; } else s += ch; }
        parts.push(s.trim());
        for (const p of parts) {
          if (!/^(repeating-)?linear-gradient/.test(p)) continue;
          const cols = (p.match(/rgba?\([^)]+\)/g) || []).map(parse).filter(Boolean);
          if (cols.length && cols.every(x => x.a === 1)) { layers.push({ grad: cols }); solid = true; break; }
        }
      }
      if (solid) break;
      if (c && c.a > 0) { layers.push(c); if (c.a === 1) break; }
    }
    let base = { r: 23, g: 17, b: 14, a: 1 };
    const out = [base];
    for (let i = layers.length - 1; i >= 0; i--) {
      const L = layers[i];
      if (L.grad) { const n = []; for (const g of L.grad) n.push({ ...g, a: 1 }); out.length = 0; out.push(...n); }
      else for (let j = 0; j < out.length; j++) out[j] = over(L, out[j]);
    }
    return out;
  }
  const res = {};
  const root = document.querySelector(rootSel || 'body');
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (!n.data.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('script,style,[hidden],#dev')) continue;
    const r = el.getClientRects(); if (!r.length) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    let op = 1, dis = false;
    for (let e = el; e; e = e.parentElement) { op *= +getComputedStyle(e).opacity; if (e.disabled) dis = true; }
    if (op === 0) continue;
    let fg = parse(cs.color); if (!fg) continue;
    const bgs = bgOf(el);
    let worst = 99, wb = null;
    for (const b of bgs) { const f = over({ ...fg, a: fg.a * op }, b); const q = ratio(f, b); if (q < worst) { worst = q; wb = b; } }
    const px = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
    const large = px >= 24 || (bold && px >= 18.66);
    if (worst >= (large ? 3 : 4.5)) continue;
    const path = []; for (let e = el, i = 0; e && i < 3; e = e.parentElement, i++) path.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).join('.') : ''));
    const key = path.join(' > ') + ' | ' + hex(fg) + (fg.a < 1 ? '@' + fg.a : '') + (op < 1 ? ' op' + op.toFixed(2) : '') + ' on ' + hex(wb) + (dis ? ' DISABLED' : '');
    if (!res[key]) res[key] = { ratio: +worst.toFixed(2), px, n: 0, eg: n.data.trim().slice(0, 30) };
    res[key].n++;
  }
  return Object.entries(res).sort((a, b) => a[1].ratio - b[1].ratio).map(([k, v]) => `${v.ratio} ${v.px}px x${v.n} ${k}  "${v.eg}"`);
};
'ok';

// Words drawn on the canvases. For `seconds`, every fillText is watched: the pixels where the words are about to be
// written are read, and their colour set against the colour of the words. Whatever falls short is listed, worst first:
//   await __canvasAudit(4)
// Words drawn several times over in one place are one piece of writing with something under it. If there are four or
// more layers under the last (an edge all the way round) the words are measured against that edge, as the eye reads
// them; fewer (a shadow to one side) and they are measured against what is behind. Words fading in or out are left out.
window.__canvasAudit = function (seconds) {
  const P = CanvasRenderingContext2D.prototype, real = P.fillText, found = {};
  const lum = (r, g, b) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const probe = document.createElement('canvas').getContext('2d');
  const rgb = style => { if (typeof style !== 'string') return null; probe.clearRect(0, 0, 1, 1); probe.fillStyle = style; probe.fillRect(0, 0, 1, 1); const d = probe.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const hex = c => '#' + c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const over = (f, al, b) => [f[0] * al + b[0] * (1 - al), f[1] * al + b[1] * (1 - al), f[2] * al + b[2] * (1 - al)];
  let held = null;                    // the last thing written, kept back until it is known whether more is written on top of it
  const commit = h => {
    if (!h || h.alpha < 0.85) return;
    const bg = h.under.length >= 4 ? over(h.under[0].fg, h.under[0].fg[3] * h.under[0].alpha, h.bg) : h.bg, fg = over(h.fg, h.fg[3] * h.alpha, bg);
    const l1 = lum(...fg), l2 = lum(...bg), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const key = h.where + ' | ' + h.style + ' | ' + h.str.replace(/d+/g, '#').slice(0, 26) + (h.under.length >= 4 ? ' (edged)' : '');
    const e = found[key] || (found[key] = { min: 99, sum: 0, n: 0, css: h.css, need: h.need, bg: '' });
    e.n++; e.sum += ratio; if (ratio < e.min) { e.min = ratio; e.bg = hex(bg); }
  };
  P.fillText = function (str, x, y) {
    try {
      const cv = this.canvas, s = String(str);
      if (cv && cv.isConnected && cv.getClientRects().length && s.trim()) {
        const m = this.getTransform(), px = parseFloat((/(d+(?:.d+)?)px/.exec(this.font) || [0, 10])[1]), w = this.measureText(s).width;
        let x0 = x, y0 = y - px * 0.8;
        if (this.textAlign === 'center') x0 = x - w / 2; else if (this.textAlign === 'right' || this.textAlign === 'end') x0 = x - w;
        if (this.textBaseline === 'top' || this.textBaseline === 'hanging') y0 = y; else if (this.textBaseline === 'middle') y0 = y - px / 2;
        const a = m.transformPoint({ x: x0, y: y0 }), b = m.transformPoint({ x: x0 + w, y: y0 + px }), sc = Math.hypot(m.a, m.b);
        const X = Math.max(0, Math.floor(Math.min(a.x, b.x))), Y = Math.max(0, Math.floor(Math.min(a.y, b.y))), W = Math.min(cv.width - X, Math.ceil(Math.abs(b.x - a.x))), H = Math.min(cv.height - Y, Math.ceil(Math.abs(b.y - a.y)));
        const fg = rgb(this.fillStyle);
        if (fg && W > 0 && H > 0) {
          const near = held && held.ctx === this && held.str === s && Math.abs(held.X - a.x) <= px * sc * 0.3 + 2 && Math.abs(held.Y - a.y) <= px * sc * 0.3 + 2;
          let bg, under;
          if (near) { under = held.under.concat([held]); bg = held.bg; }           // what is behind is what was there before the first layer
          else { commit(held); under = []; const d = this.getImageData(X, Y, W, H).data; let r = 0, g = 0, bl = 0, n = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; bl += d[i + 2]; n++; } bg = [r / n, g / n, bl / n]; }
          const css = px * sc * (cv.getBoundingClientRect().width / cv.width), bold = /bold|[6-9]00/.test(this.font);
          held = { ctx: this, str: s, X: a.x, Y: a.y, fg, alpha: this.globalAlpha, bg, under, css, need: css >= 24 || (bold && css >= 18.66) ? 3 : 4.5, style: String(this.fillStyle), where: cv.id || cv.className || 'canvas' };
        }
      }
    } catch (err) { /* a canvas that cannot be read is skipped */ }
    return real.apply(this, arguments);
  };
  return new Promise(done => setTimeout(() => {
    P.fillText = real; commit(held);
    done(Object.entries(found).filter(([, e]) => e.sum / e.n < e.need).sort((p, q) => p[1].sum / p[1].n - q[1].sum / q[1].n)
      .map(([k, e]) => `${(e.sum / e.n).toFixed(2)} avg, ${e.min.toFixed(2)} worst on ${e.bg}, ${e.css.toFixed(1)}px x${e.n}  ${k}`));
  }, (seconds || 3) * 1000));
};
