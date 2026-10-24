/* RockGuard: add / remove on the whole website (live editor, js/cms.js).
 *
 *  1) Repeatable lists  [data-rlist]  (tools/build-pages.js marks them: stats, about paragraphs, Lunch & Learn questions, offices, credit terms, footer link columns ...)
 *     In edit mode every item can be changed and removed (x), and a "+ Add item" button clones the first item. SAVE stores the list as ONE JSON page element
 *     (id of the list, e.g. "rl-home-stats"; ids starting with "g-" are shared by every page and stored with the home page). Visitors get the saved list applied on load.
 *     Slots of an item: data-rs = text (html), data-ri = photo, data-rl = link address.
 *  2) Sections  [data-sec-id]  every section of a page can be removed (and restored), and new sections (text / image + text / cards) can be added after any section.
 *     Stored as the page element "sec-config" of the page: { hidden: [section ids], custom: [{ id, type, after, ...fields }] }.
 * Visitors only get the result; the controls exist in edit mode only.
 */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var slug = ((location.pathname.split('/').pop() || '').replace(/\.html$/i, '') || 'index').toLowerCase();
  var NB = String.fromCharCode(160);
  var editing = function () { return !!(window.RGCMS && window.RGCMS.editing); };
  var refresh = function () { if (window.RGCMS && window.RGCMS.refresh) window.RGCMS.refresh(); };
  var rid = function () { return Math.random().toString(36).slice(2, 8); };

  function clean(html) {   // same rules as js/cms.js
    var t = document.createElement('template'); t.innerHTML = String(html);
    $$('script,style,iframe,object,embed', t.content).forEach(function (n) { n.remove(); });
    $$('*', t.content).forEach(function (n) { [].slice.call(n.attributes).forEach(function (a) { if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name); }); });
    return t.innerHTML;
  }
  var savedValue = function (key) { var rows = (window.RGCMS && window.RGCMS.rows && window.RGCMS.rows()) || [], v = null; rows.forEach(function (r) { if (r.element_id === key && r.content_value != null && r.content_value !== '') v = r.content_value; }); return v; };
  var parse = function (s, d) { try { var j = JSON.parse(s); return j == null ? d : j; } catch (e) { return d; } };
  var ownerPage = function (key) { return /^g-/.test(key) ? 'index' : slug; };

  /* ================================================================= repeatable lists */
  var lists = [], dirtyLists = {};
  $$('[data-rlist]').forEach(function (box) {
    var first = $$('[data-rit]', box).filter(function (n) { return n.parentNode === box; })[0];
    lists.push({ id: box.getAttribute('data-rlist'), box: box, proto: first ? first.cloneNode(true) : null });
  });
  var itemsOf = function (L) { return [].slice.call(L.box.children).filter(function (n) { return n.hasAttribute('data-rit'); }); };
  function slotsOf(root, attr) {
    var out = []; if (root.hasAttribute(attr)) out.push(root);
    $$('[' + attr + ']', root).forEach(function (n) { out.push(n); });
    out.sort(function (a, b) { return parseInt(a.getAttribute(attr), 10) - parseInt(b.getAttribute(attr), 10); });
    return out;
  }
  function itemData(it) {
    var c = it.cloneNode(true); $$('.rl-ctl', c).forEach(function (n) { n.remove(); });
    var d = { t: [], i: [], l: [] };
    slotsOf(c, 'data-rs').forEach(function (n) { n.removeAttribute('contenteditable'); n.removeAttribute('spellcheck'); d.t.push(clean(n.innerHTML).replace(/\s+$/, '')); });
    slotsOf(c, 'data-ri').forEach(function (n) { d.i.push(n.getAttribute('src') || ''); });
    slotsOf(c, 'data-rl').forEach(function (n) { d.l.push(n.getAttribute('href') || ''); });
    return d;
  }
  function fillItem(node, d) {
    slotsOf(node, 'data-rs').forEach(function (n, k) { if (d.t && d.t[k] != null) n.innerHTML = clean(d.t[k]); });
    slotsOf(node, 'data-ri').forEach(function (n, k) { if (d.i && d.i[k]) { n.removeAttribute('srcset'); n.removeAttribute('loading'); n.setAttribute('src', d.i[k]); } });
    slotsOf(node, 'data-rl').forEach(function (n, k) { if (d.l && d.l[k] && !/^\s*javascript:/i.test(d.l[k])) n.setAttribute('href', d.l[k]); });
  }
  function renderList(L, arr) {
    if (!L.proto || !Array.isArray(arr)) return;
    itemsOf(L).forEach(function (n) { n.remove(); });
    var tail = [].slice.call(L.box.children).filter(function (n) { return !n.hasAttribute('data-rit') && !n.classList.contains('rl-ctl'); })[0] || null;   // fixed items (e.g. CMS Login) stay at the end
    arr.forEach(function (d) { var n = L.proto.cloneNode(true); fillItem(n, d || {}); L.box.insertBefore(n, tail); });
  }

  /* ================================================================= sections */
  var cfg = { hidden: [], custom: [] }, cfgDirty = false;
  var SEC = '[data-sec-id]';
  var secEl = function (id) { return $('[data-sec-id="' + id + '"]') || $('[data-csec="' + id + '"]'); };
  var secTitle = function (el) { var h = $('h1,h2,h3', el) || el; return (h.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50) || 'Section'; };
  var linkAttr = function (c) { return c.btn ? '<div class="rg22" style="margin-top:26px"><button class="rg99 rg-hover9" data-href="' + esc(c.href || 'contact.html') + '"' + (editing() ? ' data-cf="btn" contenteditable="true" spellcheck="false"' : '') + '>' + esc(c.btn) + '</button></div>' : ''; };
  var ce = function (f) { return editing() ? ' data-cf="' + f + '" contenteditable="true" spellcheck="false"' : ' data-cf="' + f + '"'; };
  function buildCustom(c) {
    var s = document.createElement('section'); s.setAttribute('data-csec', c.id);
    var btn = linkAttr(c) || (editing() ? '<div class="rg22 rl-ctl" style="margin-top:26px"><button type="button" class="dyn-add" data-cs="addbtn">＋ Add button</button></div>' : '');
    if (c.type === 'imgtext') {
      s.className = 'rg86';
      s.innerHTML = '<div class="rg87"><div class="rg88" style="position:relative">' + (c.image ? '<img class="rg14" src="' + esc(String(c.image).replace(/^\//, '')) + '" alt="">' : '') + (editing() ? '<button type="button" class="dyn-photo rl-ctl" data-cs="photo">📷 ' + (c.image ? 'Change photo' : 'Add photo') + '</button>' : '') + '</div><div><div class="rg92"' + ce('eyebrow') + '>' + esc(c.eyebrow) + '</div><h2 class="rg93"' + ce('title') + '>' + esc(c.title) + '</h2><p class="rg94" style="white-space:pre-line"' + ce('text') + '>' + esc(c.text) + '</p>' + btn + '</div></div>';
    } else if (c.type === 'cards') {
      s.className = 'rg80';
      s.innerHTML = '<div class="rg101"><div class="rg102"><div><div class="rg103"><span class="rg18"></span><span' + ce('eyebrow') + '>' + esc(c.eyebrow) + '</span></div><h3 class="rg104"' + ce('title') + '>' + esc(c.title) + '</h3></div></div><div class="rg106">' +
        (c.cards || []).map(function (k, i) { return '<div class="rg107 rg-hover10"><div class="rg108"><span class="rg109">' + (i < 9 ? '0' : '') + (i + 1) + '</span><span class="rg110"></span></div><h4 class="rg111"' + (editing() ? ' data-cc="' + i + '.0" contenteditable="true" spellcheck="false"' : '') + '>' + esc(k[0]) + '</h4><p class="rg112"' + (editing() ? ' data-cc="' + i + '.1" contenteditable="true" spellcheck="false"' : '') + '>' + esc(k[1]) + '</p>' + (editing() ? '<button type="button" class="app-x rl-ctl" data-cs="rmcard" data-i="' + i + '" style="position:static;margin-top:10px">×</button>' : '') + '</div>'; }).join('') + '</div>' +
        (editing() ? '<div class="rl-ctl" style="margin-top:20px"><button type="button" class="dyn-add" data-cs="addcard">＋ Add card</button></div>' : '') + '</div>';
    } else {
      s.className = 'rg36';
      s.innerHTML = '<div class="rg37"><div class="rg38"><div class="rg39"><span class="rg18"></span><span' + ce('eyebrow') + '>' + esc(c.eyebrow) + '</span></div><h2 class="rg40"' + ce('title') + '>' + esc(c.title) + '</h2><div class="rg42"><p class="rg43" style="white-space:pre-line"' + ce('text') + '>' + esc(c.text) + '</p></div>' + btn + '</div></div>';
    }
    return s;
  }
  function placeCustom() {
    $$('[data-csec]').forEach(function (n) { n.remove(); });
    var last = {}, anchorFallback = $$(SEC).pop();
    cfg.custom.forEach(function (c) {
      var after = c.after || 'top', node = buildCustom(c), ref;
      if (last[after]) ref = last[after];
      else if (after === 'top') ref = null;
      else ref = secEl(after) || anchorFallback;
      if (after === 'top' && !last[after]) { var f = $$(SEC)[0] || $$('[data-csec]')[0]; if (f) f.parentNode.insertBefore(node, f); else (anchorFallback ? anchorFallback.parentNode : $('main')).appendChild(node); }
      else if (ref) ref.parentNode.insertBefore(node, ref.nextSibling);
      last[after] = node;
    });
  }
  function applyHidden() {
    $$(SEC).forEach(function (s) { s.hidden = cfg.hidden.indexOf(s.getAttribute('data-sec-id')) >= 0; });
  }

  /* ================================================================= apply the saved data (everybody) */
  var applied = false;
  function applyAll() {
    if (editing() || Object.keys(dirtyLists).length || cfgDirty) return;
    lists.forEach(function (L) { var v = savedValue(L.id); if (v == null) return; var arr = parse(v, null); if (Array.isArray(arr)) renderList(L, arr); });
    var c = parse(savedValue('sec-config'), null);
    if (c && typeof c === 'object') { cfg = { hidden: Array.isArray(c.hidden) ? c.hidden : [], custom: Array.isArray(c.custom) ? c.custom : [] }; }
    applyHidden(); placeCustom(); applied = true;
  }
  document.addEventListener('rg-applied', applyAll);
  applyAll();

  /* ================================================================= edit mode */
  var ctl = function (html, cls, extra) { var d = document.createElement('div'); d.className = 'rl-ctl ' + (cls || ''); d.innerHTML = html; if (extra) d.setAttribute('data-x', extra); return d; };
  function itemControls(L) {
    itemsOf(L).forEach(function (it) {
      slotsOf(it, 'data-rs').forEach(function (n) { n.setAttribute('contenteditable', 'true'); n.setAttribute('spellcheck', 'false'); });
      if ($('.rl-x', it)) return;
      var x = document.createElement('button'); x.type = 'button'; x.className = 'rl-x rl-ctl'; x.setAttribute('data-rlx', ''); x.title = 'Remove this item'; x.textContent = '×'; it.appendChild(x);
      slotsOf(it, 'data-ri').forEach(function (img, k) { var b = document.createElement('button'); b.type = 'button'; b.className = 'dyn-photo rl-ctl rl-photo'; b.setAttribute('data-rlp', k); b.textContent = '📷 Change photo'; img.parentNode.appendChild(b); });
      slotsOf(it, 'data-rl').forEach(function (a, k) { var b = document.createElement('button'); b.type = 'button'; b.className = 'dyn-add rl-ctl rl-link'; b.setAttribute('data-rll', k); b.textContent = '🔗 Link'; it.appendChild(b); });
    });
  }
  function listControls() {
    lists.forEach(function (L) {
      itemControls(L);
      if (!L.addWrap && L.proto) { L.addWrap = ctl('<button type="button" class="dyn-add" data-rla>＋ Add item</button>', 'rl-addwrap'); L.box.parentNode.insertBefore(L.addWrap, L.box.nextSibling); L.addWrap.setAttribute('data-list', L.id); }
    });
  }
  function secControls() {
    $$(SEC + ',[data-csec]').forEach(function (s) {
      if ([].slice.call(s.children).some(function (c) { return c.classList.contains('rs-tools'); })) return;
      var id = s.getAttribute('data-sec-id') || s.getAttribute('data-csec'), custom = s.hasAttribute('data-csec');
      if (s.hidden) return;
      var t = ctl('<button type="button" data-rs-remove="' + id + '">🗑 ' + (custom ? 'Delete this section' : 'Remove section') + '</button>', 'rs-tools'); s.appendChild(t);
      var add = ctl('<button type="button" class="dyn-add" data-rs-add="' + id + '">＋ Add section here</button>', 'rs-add'); s.parentNode.insertBefore(add, s.nextSibling);
    });
    // removed sections: a bar to restore them
    $$(SEC).forEach(function (s) {
      if (!s.hidden) return; var id = s.getAttribute('data-sec-id');
      var bar = ctl('Removed section: <b>' + esc(secTitle(s)) + '</b> <button type="button" class="dyn-add" data-rs-restore="' + id + '">Restore</button>', 'rs-removed'); s.parentNode.insertBefore(bar, s);
    });
    // the very first position
    var first = $$(SEC + ',[data-csec]')[0];
    if (first && !$('.rs-add[data-x="top"]')) first.parentNode.insertBefore(ctl('<button type="button" class="dyn-add" data-rs-add="top">＋ Add section at the top</button>', 'rs-add', 'top'), first);
  }
  function enter() {
    placeCustom(); applyHidden(); listControls(); secControls();
  }
  function leave() {
    $$('.rl-ctl').forEach(function (n) { n.remove(); });
    $$('[data-rs][contenteditable],[data-cf],[data-cc]').forEach(function (n) { n.removeAttribute('contenteditable'); n.removeAttribute('spellcheck'); });
    lists.forEach(function (L) { L.addWrap = null; });
    placeCustom();
  }
  function redrawSections() { $$('.rl-ctl.rs-tools,.rl-ctl.rs-add,.rl-ctl.rs-removed').forEach(function (n) { n.remove(); }); placeCustom(); applyHidden(); secControls(); refresh(); }
  document.addEventListener('rg-edit-mode', function (e) { if (e.detail && e.detail.on) enter(); else leave(); });

  /* ----- input: lists, custom sections */
  var markList = function (L) { dirtyLists[L.id] = 1; refresh(); };
  var listOf = function (n) { var box = n.closest('[data-rlist]'); return box ? lists.filter(function (L) { return L.box === box; })[0] : null; };
  document.addEventListener('input', function (e) {
    if (!editing()) return; var t = e.target;
    var L = t.closest && listOf(t); if (L) { markList(L); return; }
    var cs = t.closest && t.closest('[data-csec]'); if (!cs) return; var c = cfg.custom.filter(function (x) { return x.id === cs.getAttribute('data-csec'); })[0]; if (!c) return;
    var f = t.getAttribute('data-cf'), cc = t.getAttribute('data-cc'), v = t.textContent.split(NB).join(' ');
    if (f) { c[f] = v; cfgDirty = true; refresh(); } else if (cc) { var p = cc.split('.'); c.cards[+p[0]][+p[1]] = v; cfgDirty = true; refresh(); }
  });
  document.addEventListener('keydown', function (e) {
    if (!editing() || e.key !== 'Enter') return; var t = e.target.closest && e.target.closest('[contenteditable="true"][data-rs],[contenteditable="true"][data-cf],[contenteditable="true"][data-cc]'); if (!t) return;
    e.preventDefault(); document.execCommand('insertLineBreak');
  }, true);
  document.addEventListener('paste', function (e) {
    var t = e.target.closest && e.target.closest('[contenteditable="true"][data-rs],[contenteditable="true"][data-cf],[contenteditable="true"][data-cc]'); if (!editing() || !t) return;
    e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
  }, true);

  /* ----- clicks */
  function addSectionDialog(afterId) {
    var old = $('#cms-linked'); if (old) old.remove();
    var removed = cfg.hidden.map(function (id) { var s = $('[data-sec-id="' + id + '"]'); return s ? [id, secTitle(s)] : null; }).filter(Boolean);
    var m = document.createElement('div'); m.id = 'cms-linked'; m.className = 'rs-pick';
    m.innerHTML = '<div class="card" role="dialog" aria-modal="true"><div class="hd"><h3>Add a section</h3><button type="button" class="x" aria-label="Close">×</button></div><div class="bd">' +
      '<p class="note">Choose what to add. You can write everything right on the page afterwards.</p>' +
      '<button type="button" class="rs-opt" data-t="text"><b>Text section</b><span>Small heading, big heading, text and an optional button.</span></button>' +
      '<button type="button" class="rs-opt" data-t="imgtext"><b>Image + text</b><span>A photo next to a heading, text and an optional button.</span></button>' +
      '<button type="button" class="rs-opt" data-t="cards"><b>Cards</b><span>A dark band with numbered cards (title + text each).</span></button>' +
      (removed.length ? '<p class="note" style="margin-top:14px">Or bring back a removed section:</p>' + removed.map(function (r) { return '<button type="button" class="rs-opt" data-r="' + esc(r[0]) + '"><b>Restore: ' + esc(r[1]) + '</b></button>'; }).join('') : '') + '</div><div class="ft"><button type="button" class="no">Cancel</button></div></div>';
    document.body.appendChild(m);
    var close = function () { m.remove(); };
    $('.x', m).onclick = close; $('.no', m).onclick = close; m.addEventListener('mousedown', function (e) { if (e.target === m) close(); });
    m.addEventListener('click', function (e) {
      var b = e.target.closest('.rs-opt'); if (!b) return;
      if (b.getAttribute('data-r')) { cfg.hidden = cfg.hidden.filter(function (x) { return x !== b.getAttribute('data-r'); }); cfgDirty = true; close(); redrawSections(); return; }
      var t = b.getAttribute('data-t'), c = { id: 'c-' + rid(), type: t, after: afterId, eyebrow: 'Small heading', title: 'Your heading', text: t === 'cards' ? '' : 'Write your text here.', btn: '', href: '' };
      if (t === 'imgtext') c.image = '';
      if (t === 'cards') c.cards = [['Card title', 'Card text'], ['Card title', 'Card text'], ['Card title', 'Card text']];
      cfg.custom.push(c); cfgDirty = true; close(); redrawSections();
      var s = secEl(c.id); if (s && s.scrollIntoView) s.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  document.addEventListener('click', function (e) {
    if (!editing()) return; var b = e.target.closest && e.target.closest('button[data-rlx],button[data-rla],button[data-rlp],button[data-rll],button[data-rs-remove],button[data-rs-add],button[data-rs-restore],button[data-cs]'); if (!b) return;
    e.preventDefault(); e.stopImmediatePropagation();
    var RGE = window.RGE, L;
    if (b.hasAttribute('data-rlx')) {
      var it = b.closest('[data-rit]'); L = listOf(it); if (!L) return;
      window.RGDialog.confirm({ title: 'Remove this item?', message: 'It is removed from the website when you press SAVE.', ok: 'Remove', danger: true }).then(function (go) { if (!go) return; it.remove(); markList(L); });
    } else if (b.hasAttribute('data-rla')) {
      var wrap = b.closest('[data-list]'); L = lists.filter(function (x) { return x.id === wrap.getAttribute('data-list'); })[0]; if (!L || !L.proto) return;
      var items = itemsOf(L), n = (items.length ? items[items.length - 1] : L.proto).cloneNode(true); $$('.rl-ctl', n).forEach(function (x) { x.remove(); });
      var tail = [].slice.call(L.box.children).filter(function (x) { return !x.hasAttribute('data-rit') && !x.classList.contains('rl-ctl'); })[0] || null;
      L.box.insertBefore(n, tail); itemControls(L); markList(L); var f = slotsOf(n, 'data-rs')[0]; if (f) f.focus();
    } else if (b.hasAttribute('data-rlp')) {
      var it2 = b.closest('[data-rit]'); L = listOf(it2); var img = slotsOf(it2, 'data-ri')[parseInt(b.getAttribute('data-rlp'), 10)];
      RGE.pickFile('image/*').then(function (file) { if (!file) return; b.textContent = 'Uploading…'; return RGE.upload(file, 'pages').then(function (u) { img.removeAttribute('srcset'); img.removeAttribute('loading'); img.setAttribute('src', u); markList(L); }); })
        .catch(function (err) { window.RGDialog.alert(err.message, { title: 'Upload failed', danger: true }); }).then(function () { b.textContent = '📷 Change photo'; });
    } else if (b.hasAttribute('data-rll')) {
      var it3 = b.closest('[data-rit]'); L = listOf(it3); var a = slotsOf(it3, 'data-rl')[parseInt(b.getAttribute('data-rll'), 10)];
      RGE.fileLink({ title: 'Link address', url: a.getAttribute('href') || '', accept: '', folder: 'resources', hint: 'Where this item leads: a page of this website (e.g. contact.html) or any web address.' }).then(function (r) { if (!r) return; a.setAttribute('href', r.clear ? '#' : r.url); markList(L); });
    } else if (b.hasAttribute('data-rs-remove')) {
      var id = b.getAttribute('data-rs-remove'), s = secEl(id), custom = s && s.hasAttribute('data-csec');
      window.RGDialog.confirm({ title: custom ? 'Delete this section?' : 'Remove this section?', message: '"' + secTitle(s) + '"\nIt is ' + (custom ? 'deleted' : 'removed from the website') + ' when you press SAVE' + (custom ? '.' : ' (you can restore it with "Add section").'), ok: custom ? 'Delete' : 'Remove', danger: true }).then(function (go) {
        if (!go) return;
        if (custom) cfg.custom = cfg.custom.filter(function (c) { return c.id !== id; }).map(function (c) { if (c.after === id) { var gone = cfg.custom.filter(function (x) { return x.id === id; })[0]; c.after = gone ? gone.after : 'top'; } return c; });
        else if (cfg.hidden.indexOf(id) < 0) cfg.hidden.push(id);
        cfgDirty = true; redrawSections();
      });
    } else if (b.hasAttribute('data-rs-add')) addSectionDialog(b.getAttribute('data-rs-add'));
    else if (b.hasAttribute('data-rs-restore')) { var rid2 = b.getAttribute('data-rs-restore'); cfg.hidden = cfg.hidden.filter(function (x) { return x !== rid2; }); cfgDirty = true; redrawSections(); }
    else if (b.hasAttribute('data-cs')) {
      var cs = b.closest('[data-csec]'), c = cfg.custom.filter(function (x) { return x.id === cs.getAttribute('data-csec'); })[0], act = b.getAttribute('data-cs'); if (!c) return;
      if (act === 'addcard') c.cards.push(['Card title', 'Card text']);
      else if (act === 'rmcard') c.cards.splice(parseInt(b.getAttribute('data-i'), 10), 1);
      else if (act === 'addbtn') { c.btn = 'Button text'; c.href = 'contact.html'; }
      else if (act === 'photo') { RGE.pickFile('image/*').then(function (file) { if (!file) return; b.textContent = 'Uploading…'; return RGE.upload(file, 'pages').then(function (u) { c.image = u; cfgDirty = true; redrawSections(); }); }).catch(function (err) { window.RGDialog.alert(err.message, { title: 'Upload failed', danger: true }); redrawSections(); }); return; }
      cfgDirty = true; redrawSections();
    }
  }, true);
  // the button of a custom section: click = set the link (edit mode)
  document.addEventListener('click', function (e) {
    if (!editing()) return; var bt = e.target.closest && e.target.closest('[data-csec] [data-href][data-cf="btn"]'); if (!bt) return;
    var cs = bt.closest('[data-csec]'), c = cfg.custom.filter(function (x) { return x.id === cs.getAttribute('data-csec'); })[0]; if (!c) return;
    e.preventDefault(); e.stopImmediatePropagation();
    window.RGE.fileLink({ title: 'Button link', url: c.href || '', accept: '', folder: 'resources', hint: 'Where the button leads: a page of this website (e.g. contact.html) or any web address. The button text is edited on the page.' }).then(function (r) { if (!r) return; c.href = r.clear ? '' : r.url; cfgDirty = true; bt.setAttribute('data-href', c.href); refresh(); });
  }, true);

  /* ================================================================= SAVE (joins the SAVE button of the admin bar) */
  function post(key, value) { return window.RGE.api('POST', 'page-elements', { page_slug: ownerPage(key), element_id: key, content_type: 'text', content_value: value }); }
  function save() {
    var pr = Promise.resolve(), n = 0, log = {};
    lists.forEach(function (L) {
      if (!dirtyLists[L.id]) return;
      var arr = itemsOf(L).map(itemData);
      pr = pr.then(function () { return post(L.id, JSON.stringify(arr)); }).then(function () { n++; log['List ' + L.id] = 'Updated'; delete dirtyLists[L.id]; });
    });
    if (cfgDirty) {
      var out = JSON.stringify({ hidden: cfg.hidden, custom: cfg.custom });
      pr = pr.then(function () { return post('sec-config', out); }).then(function () { n++; log['Sections of ' + slug] = 'Updated'; cfgDirty = false; });
    }
    return pr.then(function () { return window.RGE.pending ? null : window.RGE.history('sections', log); }).then(function () { refresh(); return n; });
  }
  if (window.RGCMS && window.RGCMS.registerHook) window.RGCMS.registerHook('sections', { count: function () { return Object.keys(dirtyLists).length + (cfgDirty ? 1 : 0); }, run: save });
})();
