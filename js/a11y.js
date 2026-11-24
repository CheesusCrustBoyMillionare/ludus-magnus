'use strict';
// Accessibility: the game played from a keyboard, and read out by a screen reader.
//
// The interface is rebuilt after everything the player does, which throws away whatever the keyboard was resting on,
// and a good deal of it is drawn on canvases that say nothing to a screen reader. So, after each rebuild, this file:
//   - gives every clickable thing that is not a real button the manners of one (a Tab stop, a role, Enter and Space);
//   - puts the keyboard back on the thing it was on, or the nearest thing to it;
//   - treats the dialog as a dialog: named, entered when it opens, and everything behind it out of reach;
//   - names what has only a picture, and says whether a switch is on;
//   - shows an explanation for whatever the keyboard rests on, as the mouse would;
//   - lists the places of the town as buttons, for whoever cannot click a picture of them;
//   - says aloud what changes without being asked: a new screen, the steward, each line of a fight.
// Nothing here changes a rule of the game. It is all in one function so that it adds one name to the page.

(function () {
  const doc = document, root = doc.documentElement, q = s => doc.querySelector(s), qa = (s, el) => [...(el || doc).querySelectorAll(s)];
  const first = text => String(text || '').split('\n')[0];
  const st = { tabbing: false, last: null, lastEl: null, opener: null, modalWas: false, tab: null, steward: '', fightTip: '', logN: 0, logB: null, pickWas: false, places: '', queued: false };

  // ---------- who is at the keyboard ----------
  // Tab says the player is finding his way by keyboard; a press of the mouse says he is not. Only for the first
  // is the keyboard put back after a rebuild: a player with a mouse expects Enter and Space to do what they always did.
  doc.addEventListener('keydown', e => { if (e.key === 'Tab') { st.tabbing = true; root.classList.add('tabbing'); } }, true);
  doc.addEventListener('mousedown', () => { st.tabbing = false; root.classList.remove('tabbing'); }, true);

  // ---------- saying things ----------
  const live = doc.createElement('div');
  live.id = 'live'; live.className = 'sr'; live.setAttribute('aria-live', 'polite'); live.setAttribute('role', 'status');
  doc.body.appendChild(live);
  let sayT = 0, sayQ = [];
  function say(text) {
    text = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return;
    sayQ.push(text);
    if (sayT) return;
    sayT = setTimeout(() => { sayT = 0; live.textContent = sayQ.splice(0).join(' '); }, 120);     // one breath for everything that changed together
  }

  // ---------- one thing the keyboard can be put back on ----------
  const HOSTS = '#modalBox, #arenaPick, #arenaLog, #arenaTip, #arenaBar, #camp, #tutor, #places, #topbar, #sidefoot, #view, #dev, #updatebar';
  function keyOf(el) {
    if (!el || el === doc.body || !el.closest) return null;
    const act = el.closest('[data-act]'), host = el.closest(HOSTS);
    return { host: host ? host.id : '', act: act ? act.dataset.act : '', v: act ? act.dataset.v || '' : '', w: act ? act.dataset.w || '' : '', id: el.id || '', chg: el.dataset.chg || '', cv: el.dataset.chg ? el.dataset.v || '' : '', text: act ? '' : (el.textContent || '').trim().slice(0, 40) };
  }
  // what takes the keyboard for a clickable thing: itself, or the name inside it when it holds buttons of its own
  const handle = el => (el.matches('button, input, select, [tabindex]') ? el : el.querySelector('[role=button][tabindex]') || el);
  const usable = el => el && !el.disabled && el.getClientRects().length && !el.closest('[inert]');
  function findAgain(k) {
    if (!k) return null;
    const host = (k.host && doc.getElementById(k.host)) || doc.body;
    if (k.id) { const el = doc.getElementById(k.id); if (usable(el)) return el; }
    if (k.chg) { const el = qa('[data-chg]', host).find(x => x.dataset.chg === k.chg && (x.dataset.v || '') === k.cv); if (usable(el)) return el; }
    if (k.act) {
      const all = qa('[data-act]', host).filter(x => x.dataset.act === k.act && usable(x));
      const el = all.find(x => (x.dataset.v || '') === k.v && (x.dataset.w || '') === k.w) || all.find(x => (x.dataset.v || '') === k.v) || (k.host === 'modalBox' ? null : all[0]);      // a new page of a dialog starts at its top
      if (el) return handle(el);
    }
    if (k.text) { const el = qa('button, [tabindex="0"]', host).find(x => (x.textContent || '').trim().slice(0, 40) === k.text && usable(x)); if (el) return el; }
    return null;
  }
  doc.addEventListener('focusin', e => { st.lastEl = e.target; st.last = keyOf(e.target); showTipFor(e.target); });
  doc.addEventListener('focusout', () => { const tb = q('#tip'); if (tb && tb.dataset.by === 'key') { delete tb.dataset.by; hideTip(); } });
  const lost = () => !doc.activeElement || doc.activeElement === doc.body || !doc.activeElement.isConnected || !!doc.activeElement.closest('[inert]');

  // ---------- explanations for the keyboard ----------
  function showTipFor(el) {
    if (!st.tabbing || !el.closest) return;
    const t = el.closest('[data-tip], [data-cmp]'), box = q('#tip');
    if (!t || !box || t.tagName === 'CANVAS') return;
    fillTip(box, t);
    if (box.hidden) return;
    box.dataset.by = 'key';
    const r = t.getBoundingClientRect();
    placeTip({ clientX: r.left - 6, clientY: r.bottom - 8 });          // under it, and clear of it
  }

  // ---------- Enter and Space on what is not a real button ----------
  doc.addEventListener('keydown', e => {
    if (e.ctrlKey || e.altKey || e.metaKey || (e.key !== 'Enter' && e.key !== ' ')) return;
    const el = e.target;
    if (!el || !el.matches || !el.matches('[role=button]:not(button)')) return;
    e.preventDefault(); e.stopPropagation();
    el.click();
  }, true);

  // ---------- the dialog ----------
  function tendModal() {
    const m = q('#modal'), box = q('#modalBox');
    if (!m || !box) return;
    const open = !m.hidden, arena = q('#arena'), wilds = q('#wilds'), fightOn = arena && !arena.hidden, away = wilds && !wilds.hidden;
    // what lies under something else cannot be reached, by Tab or by a screen reader
    const behind = { app: open || fightOn || away, wilds: open || fightOn, arena: open, tutor: open, dev: false };
    for (const id in behind) { const el = doc.getElementById(id); if (el && el.inert !== behind[id]) el.inert = behind[id]; }
    if (open) {
      const h = box.querySelector('h2, h3, .who, b');
      if (h) { if (!h.id) h.id = 'modalTitle'; box.setAttribute('aria-labelledby', h.id); } else box.removeAttribute('aria-labelledby');
      if (!st.modalWas) st.opener = st.last;                 // where to go back to when it shuts
      if (!box.contains(doc.activeElement)) {
        const again = st.tabbing && st.last && st.last.host === 'modalBox' ? findAgain(st.last) : null;
        (again || box).focus({ preventScroll: true });
      }
    } else if (st.modalWas) {
      const back = st.tabbing ? findAgain(st.opener) : null;
      st.opener = null;
      if (back) back.focus({ preventScroll: true }); else if (lost() && doc.activeElement && doc.activeElement !== doc.body) doc.activeElement.blur();
    }
    st.modalWas = open;
  }

  // ---------- the town, as a list ----------
  function tendPlaces() {
    const nav = q('#places');
    if (!nav || typeof PLACES === 'undefined' || typeof G === 'undefined' || !G) return;
    const marks = typeof villageMarks === 'function' ? villageMarks() : {}, folk = typeof fountainFolk === 'function' ? fountainFolk() : [], open = typeof gateOpen === 'function' && gateOpen();
    const sig = [ui.tab, open, folk.length, JSON.stringify(marks), typeof daysToGames === 'function' ? daysToGames() : ''].join('|');
    if (sig === st.places) return;
    st.places = sig;
    const info = k => { const t = (typeof PLACE_INFO !== 'undefined' && PLACE_INFO[k]) || ''; return t ? t.slice(t.indexOf(':') + 2).toLowerCase() : ''; };
    const note = p => [info(p.key), p.key === 'arena' && typeof daysToGames === 'function' ? (daysToGames() === 0 ? 'games today' : `games in ${daysToGames()} day${daysToGames() === 1 ? '' : 's'}`) : '', marks[p.key] ? `${marks[p.key]} waiting` : ''].filter(Boolean).join(', ');
    nav.innerHTML = '<b id="placesHead">Walk to</b>' + PLACES.map(p => `<button data-act="goto" data-v="${p.key}"${p.key === ui.tab ? ' aria-current="page"' : ''}>${p.name}<span class="sr">: ${note(p)}</span></button>`).join('')
      + folk.map((f, i) => `<button data-act="goto" data-v="giver${i}">${f.q && f.q.giver ? f.q.giver.name : 'A visitor'}<span class="sr">, waiting at the fountain ${f.owed ? 'to pay what is owed' : 'with work'}</span></button>`).join('')
      + `<button data-act="goto" data-v="gate"${open ? '' : ' aria-disabled="true"'}>East gate<span class="sr">: ${open ? 'out into the province' : 'barred until your first games'}</span></button>`;
  }

  // ---------- after every rebuild ----------
  function pass() {
    st.queued = false;
    if (typeof ui === 'undefined') return;
    tendPlaces();

    // clickable things that are not buttons
    for (const el of qa('[data-act]:not(button):not(canvas):not(input):not(select):not([data-a11y])')) {
      el.dataset.a11y = '1';
      const nested = el.querySelector('button, [data-act]');
      const t = nested ? el.querySelector('.t, .nm') : el;
      if (!t) continue;
      t.tabIndex = 0; t.setAttribute('role', 'button');
      if (el.matches('.pick, .sig, .ab')) t.setAttribute('aria-pressed', el.classList.contains('on'));
      else if (el.classList.contains('sel')) t.setAttribute('aria-current', 'true');
      if (!(t.textContent || '').trim() || el.matches('.sig, .kc')) {
        let name = '';
        if (el.dataset.cmp && typeof findItem === 'function') { try { const it = findItem(+el.dataset.cmp.split(':')[0]); if (it) name = itemName(it); } catch (err) { /* no such piece now */ } }
        t.setAttribute('aria-label', name || (el.matches('.sig') ? 'Signature ability' : first(el.dataset.tip) || 'Choose'));
      }
    }
    // real buttons: one with only a picture on it is named by its explanation; one that is "on" says so; one that cannot be used says that
    for (const b of qa('button:not([data-a11y])')) {
      b.dataset.a11y = '1';
      if (!(b.textContent || '').trim() && !b.getAttribute('aria-label')) b.setAttribute('aria-label', first(b.dataset.tip).replace(/\.$/, '') || b.dataset.act || 'Button');
      if (b.classList.contains('off') && !b.hasAttribute('data-toggle') && !b.closest('#arenaBar')) b.setAttribute('aria-disabled', 'true');
    }
    for (const b of qa('button.on:not([data-toggle]), button[aria-pressed]:not([data-toggle])')) { const on = b.classList.contains('on'); if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', on); }
    { const mb = q('#muteBtn'); if (mb) { const on = !mb.classList.contains('off'); if (mb.getAttribute('aria-pressed') !== String(on)) mb.setAttribute('aria-pressed', on); } }
    // pictures: a face beside its owner's name says nothing; an icon that stands alone for a word says the word
    for (const cv of qa('canvas:not(#yard):not(#village):not(#wildCanvas):not(#arenaCanvas):not(#wildMini):not([aria-hidden]), i.ic:not([aria-hidden])')) cv.setAttribute('aria-hidden', 'true');
    { const mm = doc.getElementById('wildMini'); if (mm && !mm.hasAttribute('role')) { mm.setAttribute('role', 'img'); mm.setAttribute('aria-label', 'A small map of the province'); } }
    for (const el of qa('.stylemark:not([role]), .sk:not([role])')) { const t = first(el.dataset.tip); if (t) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', t); } }
    for (const el of qa('.pips:not([role])')) { const s = el.textContent || '', n = (s.match(/●/g) || []).length; el.setAttribute('role', 'img'); el.setAttribute('aria-label', `${n} of ${s.trim().length}`); }
    for (const el of qa('.lrow.sel:not([aria-current])')) if (!el.hasAttribute('role')) el.setAttribute('aria-current', 'true');
    // the panes that scroll can be scrolled from the keyboard
    for (const p of qa('.pane:not([tabindex]), .log:not([tabindex]), #arenaLog .lb:not([tabindex])')) if (p.scrollHeight > p.clientHeight + 2) { p.tabIndex = 0; p.setAttribute('role', 'group'); if (!p.getAttribute('aria-label')) p.setAttribute('aria-label', (p.querySelector('h2') || {}).textContent || 'List'); }
    // with the setting on, Tab stops at everything that has an explanation
    if (ui.tipStops) for (const el of qa('[data-tip]:not([tabindex]):not(button):not(canvas):not(input):not(label), [data-cmp]:not([tabindex]):not(button)')) { if (el.closest('button, [role=button]')) continue; el.tabIndex = 0; if (!el.hasAttribute('role')) { el.setAttribute('role', 'note'); el.setAttribute('aria-description', first(el.dataset.tip)); } }
    // explanations are read out with the buttons they belong to
    for (const el of qa('button[data-tip]:not([aria-description]), [role=button][data-tip]:not([aria-description])')) { const t = (el.dataset.tip || '').replace(/\n/g, ' '); if (t && t !== el.getAttribute('aria-label')) el.setAttribute('aria-description', t); }

    tendModal();

    // the keyboard goes back where it was
    if (st.lastEl && !st.lastEl.isConnected) {
      if (st.tabbing && lost()) {
        const m = q('#modal'), ar = q('#arena'), host = st.last && st.last.host ? doc.getElementById(st.last.host) : null;
        const again = findAgain(st.last) || (m && !m.hidden ? q('#modalBox') : usable(host) ? host : ar && !ar.hidden ? q('#pauseBtn') : q('#view'));
        if (again) { if (!again.matches('button, input, select, [tabindex]')) again.tabIndex = -1; again.focus({ preventScroll: false }); }
      }
      if (st.lastEl && !st.lastEl.isConnected) { st.lastEl = null; if (!st.tabbing) st.last = null; }
    }

    // a new screen says its name, and the page takes it for a title
    if (st.tab !== ui.tab && typeof TAB_NAMES !== 'undefined') {
      if (st.tab !== null) say(TAB_NAMES[ui.tab] || ui.tab);
      st.tab = ui.tab;
    }
    { const where = typeof fight !== 'undefined' && fight && !fight.finished ? 'The arena' : typeof G !== 'undefined' && G && G.field ? 'The province' : (typeof TAB_NAMES !== 'undefined' && TAB_NAMES[ui.tab]) || '', t = (where ? where + ' – ' : '') + 'Ludus Magnus'; if (doc.title !== t) doc.title = t; }
    // the steward, when he has something new to say
    for (const [id, key] of [['tutor', 'steward'], ['arenaTip', 'fightTip']]) {
      const el = doc.getElementById(id), p = el && !el.hidden ? el.querySelector('p') : null, text = p ? p.textContent.trim() : '';
      if (el && !el.hasAttribute('role')) { el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Your steward'); }
      if (text && text !== st[key]) say('Your steward: ' + text);
      st[key] = text;
    }
    // the choice of abilities: the fight has stopped and waits for an answer
    { const pk = q('#arenaPick'), on = !!pk && !pk.hidden;
      if (on && !st.pickWas) {
        if (!pk.hasAttribute('role')) { pk.setAttribute('role', 'group'); pk.setAttribute('aria-label', 'Choose an ability'); }
        const b = pk.querySelector('button:not(:disabled)'), who = typeof fight !== 'undefined' && fight && fight.B && fight.B.pick && fight.B.pick.g ? fight.B.pick.g.name : '';
        say('The fight waits. Choose an ability' + (who ? ' for ' + who : '') + '.');
        if (st.tabbing && b && !pk.contains(doc.activeElement)) b.focus({ preventScroll: true });
      }
      st.pickWas = on; }
    { const dm = q('#dev .devmsg'); if (dm && dm.textContent !== st.devMsg) { st.devMsg = dm.textContent; say(st.devMsg); } }
  }
  function queue() { if (st.queued) return; st.queued = true; Promise.resolve().then(pass); }
  new MutationObserver(queue).observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });

  // ---------- a fight, line by line ----------
  // The sand is a picture. Its log is words, so each new line of it is said as it is written (the same lines the Log button shows).
  setInterval(() => {
    if (typeof fight === 'undefined' || !fight || !fight.B || !fight.B.log) { st.logB = null; return; }
    const B = fight.B;
    if (st.logB !== B) { st.logB = B; st.logN = B.log.length; return; }
    if (B.log.length > st.logN) { const fresh = B.log.slice(st.logN).slice(-4); st.logN = B.log.length; say(fresh.map(l => l.str).join('. ')); }
  }, 900);

  // ---------- the pictures themselves ----------
  const label = (id, text, extra) => { const el = doc.getElementById(id); if (!el) return; el.setAttribute('role', 'img'); el.setAttribute('aria-label', text); if (extra) for (const k in extra) el.setAttribute(k, extra[k]); };
  label('yard', 'A picture of your school. Everything in it can be reached from the lists below and from the places of the town.');
  label('village', 'A picture of the town. Its places are listed as buttons under "Walk to", just before this picture.');
  label('wildCanvas', 'The map of the province. The arrow keys march the column; the places you know are listed as buttons beside it.');
  label('arenaCanvas', 'The fight. Each thing that happens is read out, and the Log button lists all of it.');
  { const m = q('#modalBox'); if (m) { m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.tabIndex = -1; } }
  { const c = q('#camp'); if (c) c.setAttribute('aria-label', 'The camp'); const s = q('#side'); if (s) s.setAttribute('aria-label', 'The day, and the menu'); const b = q('#arenaBar'); if (b) { b.setAttribute('role', 'toolbar'); b.setAttribute('aria-label', 'The fight'); } }
  { const ah = q('#arenaHead'); if (ah) { ah.setAttribute('role', 'heading'); ah.setAttribute('aria-level', '1'); } }

  queue();
})();
