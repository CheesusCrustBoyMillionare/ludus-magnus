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
//   - says aloud what changes without being asked: a new screen, the steward, a fight as it goes, the country
//     the column is marching through.
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
    sayT = setTimeout(() => { sayT = 0; live.textContent = sayQ.splice(0).map(t => (/[.!?]$/.test(t) ? t : t + '.')).join(' '); }, 120);     // one breath for everything that changed together
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
      // "3W 1L" is read letter by letter: a man's record is said in words
      { const txt = (t.textContent || '').replace(/\s+/g, ' ').trim(); if (/\b\d+W \d+L\b/.test(txt)) t.setAttribute('aria-label', txt.replace(/\b(\d+)W (\d+)L\b/g, '$1 won, $2 lost').replace(/ \u00b7 /g, ', ')); }
      if (!(t.textContent || '').trim() || el.matches('.sig, .kc')) {
        let name = '';
        if (el.dataset.cmp && typeof findItem === 'function') { try { const it = findItem(+el.dataset.cmp.split(':')[0]); if (it) name = itemName(it); } catch (err) { /* no such piece now */ } }
        t.setAttribute('aria-label', name || (el.matches('.sig') ? 'Signature ability' : first(el.dataset.tip) || 'Choose'));
      }
    }
    // real buttons: one with only a picture on it is named by its explanation; one that is "on" says so; one that cannot be used says that
    // a key written on a button is not part of its name: it is said as the button's shortcut
    for (const k of qa('button .key:not([aria-hidden]), button .k:not([aria-hidden]), [role=button] .key:not([aria-hidden])')) { k.setAttribute('aria-hidden', 'true'); const b = k.closest('button, [role=button]'), key = (k.textContent || '').trim(); if (b && key && !b.hasAttribute('aria-keyshortcuts')) b.setAttribute('aria-keyshortcuts', key === 'Esc' ? 'Escape' : key); }
    for (const b of qa('button[data-key]:not([aria-keyshortcuts])')) b.setAttribute('aria-keyshortcuts', b.dataset.key === 'Esc' ? 'Escape' : b.dataset.key);
    // the three smallest buttons on a man's line say only a letter; their names say what they do
    const SHORT = { spar: 'Spar at all three skills', teach: 'Teach', auto: 'Auto: leave it to the doctore', rest: 'Rest' };
    for (const b of qa('button[data-act=activity]:not([data-a11y]), button[data-act=actall]:not([data-a11y]), button[data-act=actauto]:not([data-a11y])')) { const w = b.dataset.act === 'actauto' ? 'auto' : b.dataset.w; if (SHORT[w] && (b.textContent || '').trim().length <= 4) b.setAttribute('aria-label', SHORT[w]); }
    for (const b of qa('button:not([data-a11y])')) {
      b.dataset.a11y = '1';
      if (!(b.textContent || '').trim() && !b.getAttribute('aria-label')) b.setAttribute('aria-label', first(b.dataset.tip).replace(/\.$/, '') || b.dataset.act || 'Button');
      if (b.classList.contains('off') && !b.hasAttribute('data-toggle') && !b.closest('#arenaBar')) b.setAttribute('aria-disabled', 'true');
    }
    for (const b of qa('button.on:not([data-toggle]), button[aria-pressed]:not([data-toggle])')) { const on = b.classList.contains('on'); if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', on); }
    for (const b of qa('button[aria-pressed="true"]:not([data-toggle])')) { const p = b.parentElement; if (p) for (const sib of p.children) if (sib !== b && sib.tagName === 'BUTTON' && !sib.hasAttribute('aria-pressed') && !sib.hasAttribute('data-toggle') && sib.dataset.act === b.dataset.act) sib.setAttribute('aria-pressed', 'false'); }
    // a row of buttons under a small label is a group with that label for a name
    for (const l of qa('.lbl:not([data-a11y]), .gl:not([data-a11y])')) { l.dataset.a11y = '1'; const p = l.parentElement, t = (l.textContent || '').trim(); if (p && t && !p.hasAttribute('role') && p.querySelector('button, [role=button], [data-act]')) { p.setAttribute('role', 'group'); p.setAttribute('aria-label', t); } }
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
        const b = pk.querySelector('button:not(:disabled)'), who = typeof fight !== 'undefined' && fight && fight.B && fight.B.pick && fight.B.pick.g ? fight.B.pick.g.name : '';
        pk.setAttribute('role', 'group'); pk.setAttribute('aria-label', 'Choose an ability' + (who ? ' for ' + who : ''));
        say('The fight waits. Choose an ability' + (who ? ' for ' + who : '') + '.');
        if (st.tabbing && b && !pk.contains(doc.activeElement)) b.focus({ preventScroll: true });
      }
      st.pickWas = on; }
    { const dm = q('#dev .devmsg'); if (dm && dm.textContent !== st.devMsg) { st.devMsg = dm.textContent; say(st.devMsg); } }
  }
  function queue() { if (st.queued) return; st.queued = true; Promise.resolve().then(pass); }
  new MutationObserver(queue).observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });

  // ---------- a fight, read out ----------
  // The sand is a picture. Three things are said of it. Each new line of its log (the same lines the Log button shows).
  // How every man stands, whenever that has changed, which is what the bars at the top of the picture show. And, for
  // whoever asks for it in Settings, every word that rises over a man: each blow, block, dodge and miss.
  const nameOf = f => (f.g.beast ? 'The ' + f.c.name : f.g.name);
  function standing(B) {
    const up = t => B.fighters.filter(f => f.team === t && !f.down && !f.yielded);
    if (B.fighters.length <= 4) return B.fighters.map(f => nameOf(f) + (f.down ? ' is down' : f.yielded ? ' has yielded' : ' ' + Math.max(0, Math.ceil(f.hp)) + ' of ' + Math.round(f.maxHp))).join(', ');
    const side = t => { const all = B.fighters.filter(f => f.team === t), on = up(t); return on.length + ' of ' + all.length + ' standing at ' + Math.round(100 * on.reduce((s, f) => s + Math.max(0, f.hp), 0) / Math.max(1, all.reduce((s, f) => s + f.maxHp, 0))) + ' in the hundred'; };
    return 'Yours: ' + side(0) + '. Theirs: ' + side(1);
  }
  const blowWords = (who, w) => (/^!?\d+$/.test(w) ? who + ' takes ' + w.replace('!', '') + (w[0] === '!' ? ', a telling blow' : '') : /^\+\d+$/.test(w) ? who + ' gains ' + w.slice(1) + ' health' : /^block \d+$/.test(w) ? who + ' blocks, and takes ' + w.slice(6) : w === 'miss' ? 'A blow at ' + who + ' misses' : w === 'dodge' ? who + ' dodges' : w === 'net misses' ? 'The net misses ' + who : who + ': ' + w.toLowerCase());
  setInterval(() => {
    if (typeof fight === 'undefined' || !fight || !fight.B || !fight.B.log) { st.logB = null; return; }
    const B = fight.B, now = Date.now();
    if (st.logB !== B) { st.logB = B; st.logN = B.log.length; st.spokeN = 0; st.stoodAt = now; st.stood = ''; if (ui.sayBlows && !B.spoken) B.spoken = []; return; }
    if (ui.sayBlows && !B.spoken) { B.spoken = []; st.spokeN = 0; } else if (!ui.sayBlows && B.spoken) B.spoken = null;
    if (fight.paused && !B.pick) return;
    if (B.spoken && B.spoken.length > st.spokeN) { const fresh = B.spoken.slice(st.spokeN).slice(-6); st.spokeN = B.spoken.length; say(fresh.map(([who, w]) => blowWords(who, w)).join('. ')); }
    if (B.log.length > st.logN) { const fresh = B.log.slice(st.logN).slice(-4); st.logN = B.log.length; say(fresh.map(l => l.str).join('. ')); }
    const s = standing(B);
    if (s !== st.stood && (now - st.stoodAt > 6000 || (B.pick && st.pickSaid !== B.pick))) { st.stood = s; st.stoodAt = now; st.pickSaid = B.pick || null; say(s); }
  }, 900);

  // ---------- the province, in words ----------
  // The map is a picture too. What it shows of where the column stands is put into words: the country and the ground
  // underfoot, how dangerous it is, how much of the day is left, the way home and the nearest places known. It is said
  // when asked for (a button the keyboard reaches before the map), and the changes are said as they happen.
  const GROUND = ['open grass', 'forest', 'hill country', 'marsh', 'sand', 'a road', 'a bridge', 'meadow', 'water', 'bare rock'];
  const way = (x, y) => wayTo(x, y).replace(/^today /, 'within the day, to the ').replace(/^(about \d+ days?) /, '$1 to the ');
  const ground = F => { try { return GROUND[wildTile(F.x, F.y)] || 'open country'; } catch (e) { return 'open country'; } };
  function whereabouts() {
    const F = G.field; if (!F) return '';
    const t = wildTier(F.x, F.y), left = Math.round(100 * Math.max(0, Math.min(1, 1 - (F.march || 0) / marchDay())));
    let rows = []; try { rows = placeRows().slice(0, 4); } catch (e) { /* none known */ }
    const here = (() => { try { return landmarkHere(); } catch (e) { return ''; } })();
    return 'The column is in ' + wildRegion(F.x, F.y) + ', on ' + ground(F) + (here ? ', at ' + here : '') + '. ' + (TIER_WORD[t - 1] ? TIER_WORD[t - 1].charAt(0).toUpperCase() + TIER_WORD[t - 1].slice(1) + ' danger' : 'No danger') + '. '
      + left + ' in the hundred of the day\'s march is left. The town gate is ' + way(WILD.TOWN.x, WILD.TOWN.y) + '. '
      + (rows.length ? 'Places known: ' + rows.map(r => r.name + ', ' + way(r.st.x, r.st.y)).join('; ') + '.' : 'No place is known yet.');
  }
  doc.addEventListener('lookabout', () => { live.textContent = ''; say(whereabouts()); });
  setInterval(() => {
    if (typeof G === 'undefined' || !G || !G.field || (typeof fight !== 'undefined' && fight && !fight.finished)) { st.prov = null; return; }
    const F = G.field, m = q('#modal'); if (m && !m.hidden) return;
    let known = []; try { known = placeRows().map(r => r.st.id); } catch (e) { /* none */ }
    const now = { region: wildRegion(F.x, F.y), ground: ground(F), here: (() => { try { return landmarkHere() || ''; } catch (e) { return ''; } })(), known, day: G.day, blocked: prov.hint > performance.now() };
    const was = st.prov; st.prov = now;
    if (!was) { say(whereabouts()); return; }
    if (now.day !== was.day) say('Day ' + now.day + '.');
    if (now.region !== was.region) say('Into ' + now.region + ': ' + (TIER_WORD[wildTier(F.x, F.y) - 1] || 'no') + ' danger.');
    if (now.ground !== was.ground) say('Onto ' + now.ground + '.');
    if (now.here && now.here !== was.here) { const el = q('#campHere'); say('At ' + now.here + '. ' + (el ? el.textContent : '')); }
    if (now.blocked && !was.blocked) say('You cannot walk there.');
    const fresh = now.known.filter(id => !was.known.includes(id));
    if (fresh.length) { try { say('In view: ' + placeRows().filter(r => fresh.includes(r.st.id)).slice(0, 3).map(r => r.name + ', ' + way(r.st.x, r.st.y)).join('; ') + '.'); } catch (e) { /* gone again */ } }
  }, 1200);

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
