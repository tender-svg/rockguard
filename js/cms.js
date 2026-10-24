/* RockGuard live editor.
 *  - For EVERY visitor: loads the saved page content of this page from the CMS and puts it into the page
 *    (text / image of every element that carries a data-cms key in the HTML; keys are fixed in the source, see tools/cms-tag.js).
 *  - For a signed-in admin: shows the admin bar (SAVE / DASHBOARD / SWITCH TO EDIT / LOGOUT) and lets them edit the page itself:
 *    click a text to change it, press "Change image" on a photo, then SAVE. Lists (applications, solutions, projects, resources)
 *    are managed in the dashboard.
 * Backend (the site's own /api and /admin paths): GET /api/v2/page-elements/<page>, POST /api/v2/page-elements, /api/upload,
 * /api/admin/status, /api/admin/logout. No element is ever numbered or tagged here: only existing data-cms keys are used.
 */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var slug = ((location.pathname.split('/').pop() || '').replace(/\.html$/i, '') || 'index').toLowerCase();
  (function () {
    var pre = { 'ref-solution': 'product-detail' }[document.body && document.body.getAttribute('data-page')], q = /[?&]slug=([^&]+)/.exec(location.search);
    if (pre && q) slug = (pre + '-' + decodeURIComponent(q[1])).toLowerCase().replace(/[^a-z0-9\-_]/g, '-');
  })();
  // keys the backend shares between all pages (saved under the "index" page, shown everywhere)
  var GLOBAL = {}; ['site-logo', 'footer-logo', 'footer-tagline', 'footer-address', 'footer-phone-1', 'footer-ifi-logo', 'footer-company-link-1', 'footer-company-link-2', 'footer-company-link-3',
    'footer-product-link-1', 'footer-product-link-2', 'footer-product-link-3'].forEach(function (k) { GLOBAL[k] = 1; });

  /* ---------------------------------------------------------------- safe HTML */
  function clean(html) {
    var t = document.createElement('template'); t.innerHTML = String(html);
    $$('script,style,iframe,object,embed', t.content).forEach(function (n) { n.remove(); });
    $$('*', t.content).forEach(function (n) { [].slice.call(n.attributes).forEach(function (a) { if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name); }); });
    return t.innerHTML;
  }
  var keyEls = function (key) { return $$('[data-cms="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]'); };

  /* ---------------------------------------------------------------- public API for the other scripts (rg-content.js builds lists and uses these) */
  var savedRows = [], hooks = {};
  window.RGCMS = window.RGCMS || {};
  window.RGCMS.admin = false; window.RGCMS.editing = false;
  window.RGCMS.registerHook = function (id, h) { hooks[id] = h; refreshSave(); };   // h = { count(): number of unsaved changes, run(): Promise }
  window.RGCMS.refresh = function () { refreshSave(); };
  window.RGCMS.rows = function () { return savedRows; };   // the saved page elements (this page + the shared ones), read by js/rg-sections.js
  window.RGCMS.reapply = function () { applySaved(savedRows); if (editing) makeEditable(true); };   // after a list was (re)drawn

  /* ---------------------------------------------------------------- 1) saved content for everybody */
  var linkEls = function (key) { return $$('[data-cms-link="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]'); };
  var isGlobalLink = function (k) { return /^lnk-g-/.test(k); };
  var isGlobalKey = function (k) { return !!GLOBAL[k] || /^(g-|lnk-g-)/.test(k); };   // stored with the home page, shown on every page
  var setUrl = function (el, url) { if (el.tagName === 'A') el.setAttribute('href', url); else el.setAttribute('data-href', url); };
  var urlOf = function (el) { return (el.tagName === 'A' ? el.getAttribute('href') : el.getAttribute('data-href')) || ''; };
  function applySaved(rows) {
    savedRows = rows;
    rows.forEach(function (r) {
      var key = r.element_id, type = r.content_type, val = r.content_value; if (!key || val == null || val === '') return;
      if (/^lnk-/.test(key)) { if (dirty && dirty[key]) return; linkEls(key).forEach(function (el) { if (!/^\s*javascript:/i.test(val)) setUrl(el, String(val).trim()); }); return; }
      if (dirty && dirty[key]) return;   // keep what the admin is typing
      keyEls(key).forEach(function (el) {
        if (type === 'image' || el.getAttribute('data-cms-type') === 'image') { if (el.tagName === 'IMG') { el.removeAttribute('srcset'); el.setAttribute('src', val); el.removeAttribute('loading'); } }
        else if (type === 'text' || el.getAttribute('data-cms-type') === 'text') { if (el !== document.activeElement) el.innerHTML = clean(val); }
      });
    });
    document.dispatchEvent(new CustomEvent('rg-applied'));
  }
  var RGC = window.RGC || { usable: function () { return false; }, page: function () { return null; }, setPage: function () { }, admin: function () { }, clear: function () { } };   // data cache (js/rg-cache.js)
  var pre = function (p) { return window.RGP && window.RGP.take ? window.RGP.take(p) : null; };   // answers requested by the head script (tools/build-pages.js prefetch)
  var viaPre = function (p, url) { var x = pre(p); var ask = function () { return fetch(url, { credentials: 'include', cache: 'no-store' }); }; return x ? x.then(function (r) { return r && r.ok ? r : ask(); }) : ask(); };
  function getRows(page) { return viaPre('v2/page-elements/' + encodeURIComponent(page), '/api/v2/page-elements/' + encodeURIComponent(page)).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  // the texts of this page + the shared ones (header / footer links, top bar) that are stored with the home page
  function rowsOf(a, b) { return (Array.isArray(a) ? a : []).concat(Array.isArray(b) ? b.filter(function (r) { return isGlobalKey(r.element_id || ''); }) : []); }
  function loadSaved() {
    var home = slug === 'index' ? null : 'index', cm = RGC.usable() ? RGC.page(slug) : null, ch = home ? (cm && RGC.page(home)) : [];
    var fresh = Promise.all([getRows(slug), home ? getRows(home) : null]).then(function (res) {
      RGC.setPage(slug, res[0]); if (home) RGC.setPage(home, res[1]);
      return rowsOf(res[0], res[1]);
    });
    if (cm && ch) {   // everything is in the cache: draw it at once (no loader), then look for newer texts in the background
      if (window.RGL) RGL.cachedUsed = true;
      var first = rowsOf(cm, ch), sig = JSON.stringify(first); applySaved(first);
      fresh.then(function (rows) { if (JSON.stringify(rows) !== sig) applySaved(rows); }).catch(function () { });
      return Promise.resolve();
    }
    if (window.RGL && RGL.miss) RGL.miss();   // nothing cached for this page yet: show the loader
    return fresh.then(applySaved).catch(function () { });
  }

  /* ---------------------------------------------------------------- 2) admin */
  var editing = false, dirty = {}, dashChanged = false, bar;
  function toast(msg, bad) { var t = $('#cms-toast'); if (!t) { t = document.createElement('div'); t.id = 'cms-toast'; document.body.appendChild(t); } t.textContent = msg; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(toast.t); toast.t = setTimeout(function () { t.className = bad ? 'bad' : ''; }, 3400); }
  function dirtyCount() { var n = Object.keys(dirty).length; Object.keys(hooks).forEach(function (k) { try { n += hooks[k].count() || 0; } catch (e) { /* ignore */ } }); return n; }
  function refreshSave() { var b = $('#cms-save'); if (!b) return; var n = dirtyCount(); b.setAttribute('data-dirty', n ? '1' : '0'); $('.cms-count', b).textContent = n; }

  function buildBar(status) {
    document.body.classList.add('has-cms-bar');
    bar = document.createElement('div'); bar.id = 'cms-admin-bar';
    bar.innerHTML = '<div class="cms-brand">ROCK<i>GUARD</i> CMS</div><div class="cms-mode" id="cms-mode">Preview mode</div><div class="cms-tb-slot" id="cms-tb"></div>' +
      '<div class="cms-actions"><button class="cms-btn save" id="cms-save" type="button" data-dirty="0">Save <span class="cms-count">0</span></button><button class="cms-btn dash" id="cms-dashboard" type="button">Dashboard</button>' +
      '<button class="cms-btn" id="cms-toggle" type="button">Switch to edit</button><button class="cms-btn out" id="cms-logout" type="button">Logout</button></div>';
    document.body.prepend(bar);
    $('#cms-save').onclick = save; $('#cms-dashboard').onclick = function () { openDashboard(); }; $('#cms-toggle').onclick = function () { setEditing(!editing); };
    $('#cms-logout').onclick = function () { fetch('/api/admin/logout', { method: 'POST', credentials: 'include' }).catch(function () { }).then(function () { if (window.RGC) { RGC.admin(false); RGC.clear(); } location.reload(); }); };
  }

  function markDirty(el) {
    var key = el.getAttribute('data-cms'); if (!key) return;
    dirty[key] = el.getAttribute('data-cms-type') === 'image' ? 'image' : 'text'; refreshSave();
    if (dirty[key] === 'text') keyEls(key).forEach(function (o) { if (o !== el) o.innerHTML = el.innerHTML; });   // copies of the same element (tab variants)
  }
  function onInput(e) { var el = e.target.closest && e.target.closest('[contenteditable="true"][data-cms]'); if (el) markDirty(el); }
  function onKey(e) {
    var el = e.target.closest && e.target.closest('[contenteditable="true"][data-cms]'); if (!el) return;
    if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); }
    else if (e.key === ' ' && /^(BUTTON|A)$/.test(el.tagName)) { e.preventDefault(); document.execCommand('insertText', false, ' '); }
  }
  function onPaste(e) {
    var el = e.target.closest && e.target.closest('[contenteditable="true"][data-cms]'); if (!el) return;
    e.preventDefault(); var t = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t);
  }
  // in edit mode links / navigation buttons must not leave the page (tabs and filters keep working)
  function onClickCapture(e) {
    if (!editing) return; if (e.target.closest('#cms-admin-bar,#cms-dash,#cms-confirm,#cms-linked,.cms-img-badge,.cms-dyn-badge,.rl-ctl')) return;
    if (e.target.closest('label') && e.target.closest('[contenteditable="true"]')) { e.preventDefault(); return; }   // a form label being edited must not jump into its field
    var nav = e.target.closest('a[href]:not([href^="#"]), [data-href], [data-scroll]');
    if (nav && !(e.ctrlKey || e.metaKey)) {
      e.preventDefault(); e.stopImmediatePropagation();
      var lk = e.target.closest('[data-cms-link]');
      // a click on an inner text of the link keeps editing that text; a click on the link itself opens the link editor
      var inner = lk && e.target.closest('[contenteditable="true"]'); if (lk && (!inner || inner === lk)) openLinkEditor(lk);
    }
  }

  /* ----- link editor (click a link / link button in edit mode): label (when it has a text key) + address */
  var SITE_PAGES = [['index.html', 'Home'], ['products.html', 'Products'], ['resources.html', 'Resources'], ['project-highlights.html', 'Project Highlights'], ['contact.html', 'Contact Us'], ['credit-application.html', 'Credit Application'], ['lunch-learn.html', 'Lunch & Learn']];
  function labelHost(lk) { if (lk.matches('[data-cms][data-cms-type="text"]')) return lk; return null; }
  function openLinkEditor(lk) {
    var key = lk.getAttribute('data-cms-link'), host = labelHost(lk), cur = urlOf(lk), m = $('#cms-linked'); if (m) m.remove();
    var label = host ? host.textContent.replace(/\s+/g, ' ').trim() : (lk.textContent || '').replace(/\s+/g, ' ').trim() || 'Link';
    m = document.createElement('div'); m.id = 'cms-linked';
    m.innerHTML = '<div class="card" role="dialog" aria-modal="true"><div class="hd"><h3>Edit link</h3><button type="button" class="x" aria-label="Close">×</button></div><div class="bd">' +
      '<label><span>Button / link text' + (host ? '' : ' (change it in the text itself)') + '</span><input type="text" id="cl-label" value="' + esc(label) + '"' + (host ? '' : ' disabled') + '></label>' +
      '<label><span>Link address</span><input type="text" id="cl-url" value="' + esc(cur) + '" placeholder="e.g. contact.html or https://…"></label>' +
      '<label><span>Or pick a page of this website</span><select id="cl-pick"><option value="">Choose a page…</option>' + SITE_PAGES.map(function (p) { return '<option value="' + p[0] + '">' + esc(p[1]) + '</option>'; }).join('') + '</select></label>' +
      (isGlobalLink(key) ? '<p class="note">This link is part of the header / footer: the change applies on every page.</p>' : '') +
      '<div class="err" id="cl-err" role="alert"></div></div><div class="ft"><button type="button" class="no">Cancel</button><button type="button" class="yes">Apply</button></div></div>';
    document.body.appendChild(m);
    var url = $('#cl-url', m), lab = $('#cl-label', m); url.focus(); url.select();
    $('#cl-pick', m).onchange = function () { if (this.value) url.value = this.value; };
    var close = function () { m.remove(); };
    $('.x', m).onclick = close; $('.no', m).onclick = close; m.addEventListener('mousedown', function (e) { if (e.target === m) close(); });
    m.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); if (e.key === 'Enter') $('.yes', m).click(); });
    $('.yes', m).onclick = function () {
      var u = url.value.trim(), err = $('#cl-err', m);
      if (!u) { err.textContent = 'Enter the link address.'; return; }
      if (/^\s*javascript:/i.test(u)) { err.textContent = 'This address is not allowed.'; return; }
      if (u !== cur) { linkEls(key).forEach(function (el) { setUrl(el, u); }); dirty[key] = 'link'; }
      var t = lab.value.trim();
      if (host && !lab.disabled && t && t !== label) {
        var kid = [].slice.call(host.childNodes).filter(function (n) { return n.nodeType === 3 && /\S/.test(n.nodeValue); })[0];
        if (host.children.length && kid) kid.nodeValue = t; else if (!host.children.length) host.textContent = t; else { host.insertBefore(document.createTextNode(t), host.firstChild); }
        markDirty(host);
      }
      refreshSave(); close();
    };
  }

  /* ----- edit / preview */
  function setEditing(on) {
    editing = on; document.body.classList.toggle('cms-editing', on);
    window.RGCMS.editing = on; makeEditable(on);
    document.dispatchEvent(new CustomEvent('rg-edit-mode', { detail: { on: on } }));
    var m = $('#cms-mode'); m.textContent = on ? 'Edit mode active' : 'Preview mode'; m.className = 'cms-mode' + (on ? ' on' : '');
    $('#cms-toggle').textContent = on ? 'Switch to preview' : 'Switch to edit';
    if (on) { buildBadges(); positionBadges(); } else { $$('.cms-img-badge,.cms-dyn-badge').forEach(function (b) { b.remove(); }); }
  }

  function makeEditable(on) {
    $$('[data-cms][data-cms-type="text"]').forEach(function (el) { if (on) { el.setAttribute('contenteditable', 'true'); el.setAttribute('spellcheck', 'false'); } else { el.removeAttribute('contenteditable'); el.removeAttribute('spellcheck'); } });
  }

  /* ----- image badges ("Change image") and "managed in the dashboard" badges */
  var badges = [];
  var DYN = [['.rg52', 'solutions', 'Edit solutions in the Dashboard'], ['[data-dyn="prod"]', 'solutions', 'Edit solutions in the Dashboard'], ['[data-dyn="sol"]', 'solutions', 'Edit solutions in the Dashboard'], ['[data-dyn="res"]', 'resources', 'Edit resources in the Dashboard'], ['[data-dyn="pm"]', 'stories', 'Edit project highlights in the Dashboard'], ['[data-vgroup="pj"]', 'stories', 'Edit this project in the Dashboard']];
  function offsetOf(el) { var x = 0, y = 0, n = el; while (n) { x += n.offsetLeft || 0; y += n.offsetTop || 0; n = n.offsetParent; } return { x: x, y: y }; }
  function visible(el) { if (el.closest('[hidden]')) return false; if (!el.getClientRects().length) return false; return el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true; }
  function buildBadges() {
    $$('.cms-img-badge,.cms-dyn-badge').forEach(function (b) { b.remove(); });
    badges = [];
    $$('img[data-cms][data-cms-type="image"]').forEach(function (img) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'cms-img-badge'; b.textContent = '📷 Change image';
      b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); pickImage(img); }; document.body.appendChild(b); badges.push({ b: b, el: img, kind: 'img' });
    });
    DYN.forEach(function (d) { $$(d[0]).forEach(function (host) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'cms-dyn-badge'; b.textContent = '⚙ ' + d[2];
      b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); openDashboard(d[1]); }; document.body.appendChild(b); badges.push({ b: b, el: host, kind: 'dyn' });
    }); });
  }
  var raf = 0;
  function positionBadges() {
    clearTimeout(raf); raf = setTimeout(function () {
      badges.forEach(function (o) {
        var show = editing && document.body.contains(o.el) && visible(o.el);
        o.b.classList.toggle('show', !!show); if (!show) return;
        var p = offsetOf(o.el), w = o.el.offsetWidth;
        o.b.style.top = (p.y + 10) + 'px';
        o.b.style.left = o.kind === 'img' ? Math.max(p.x + 6, p.x + w - o.b.offsetWidth - 10) + 'px' : (p.x + 10) + 'px';
      });
    }, 30);
  }
  document.addEventListener('rg-redrawn', function () { if (editing) { buildBadges(); positionBadges(); } });   // a list / tab drawn by js/rg-content.js
  window.addEventListener('resize', positionBadges); window.addEventListener('scroll', positionBadges, { passive: true });
  setInterval(function () { if (editing) positionBadges(); }, 700);   // tabs / sliders / lists change what is visible

  /* ----- image replace */
  var picker;
  function pickImage(img) {
    if (!picker) { picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'image/*'; picker.style.display = 'none'; document.body.appendChild(picker); }
    picker.value = ''; picker.onchange = function () { var f = picker.files && picker.files[0]; if (f) uploadImage(img, f); }; picker.click();
  }
  function uploadImage(img, file) {
    toast('Uploading ' + file.name + '…'); var fd = new FormData(); fd.append('file', file); fd.append('folder', 'pages');
    fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd }).then(function (r) { if (!r.ok) throw new Error('Upload failed (' + r.status + ')'); return r.json(); })
      .then(function (j) { if (!j || !j.url) throw new Error('Upload failed'); toast('Uploaded.'); confirmImage(img, j.url); }).catch(function (e) { toast(e.message, true); });
  }
  function confirmImage(img, url) {
    var m = $('#cms-confirm');
    if (!m) { m = document.createElement('div'); m.id = 'cms-confirm'; m.innerHTML = '<div class="card"><h3>Use this image?</h3><div class="pv"><img alt="" id="cms-confirm-img"></div><p>It is applied to the page now and kept for visitors after you press <b>SAVE</b>.</p><div class="row"><button type="button" class="no">Cancel</button><button type="button" class="yes">Use image</button></div></div>'; document.body.appendChild(m); }
    $('#cms-confirm-img').src = url; m.classList.add('open');
    $('.no', m).onclick = function () { m.classList.remove('open'); };
    $('.yes', m).onclick = function () { m.classList.remove('open'); var key = img.getAttribute('data-cms'); keyEls(key).forEach(function (o) { if (o.tagName === 'IMG') { o.removeAttribute('srcset'); o.removeAttribute('loading'); o.setAttribute('src', url); } }); dirty[key] = 'image'; refreshSave(); positionBadges(); };
  }

  /* ----- save */
  function valueOf(key, type) {
    if (type === 'link') { var le = linkEls(key)[0]; return le ? urlOf(le) : null; }
    var el = keyEls(key)[0]; if (!el) return null;
    if (type === 'image') return el.getAttribute('src');
    var c = el.cloneNode(true); ['contenteditable', 'spellcheck'].forEach(function (a) { c.removeAttribute(a); });
    return clean(c.innerHTML).replace(/\s+$/, '');
  }
  // change history: the saved values of the page (all keyed elements, so a version can be looked at later) + which keys this save touched
  function logPage(keys) {
    if (!keys.length) return; var snap = {};
    [].slice.call(document.querySelectorAll('[data-cms]')).forEach(function (el) { var k = el.getAttribute('data-cms'), t = el.getAttribute('data-cms-type') || 'text'; try { var v = valueOf(k, t); if (v != null) snap[k] = { type: t, value: v }; } catch (e) { /* skip */ } });
    [].slice.call(document.querySelectorAll('[data-cms-link]')).forEach(function (el) { var k = el.getAttribute('data-cms-link'); if (snap[k] === undefined) snap[k] = { type: 'text', value: urlOf(el) }; });
    fetch('/api/v2/history', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page_slug: slug, snapshot: snap, changed_keys: keys }) }).catch(function () { });
  }
  function save() {
    var keys = Object.keys(dirty), hookIds = Object.keys(hooks).filter(function (k) { try { return hooks[k].count() > 0; } catch (e) { return false; } });
    if (!keys.length && !hookIds.length) { toast('Nothing to save yet. Switch to edit and change something.'); return; }
    var btn = $('#cms-save'); btn.disabled = true; var done = 0, failed = [], savedKeys = [], queued = 0; if (window.RGE) RGE.pending = false;
    var hookRun = hookIds.reduce(function (p, id) { return p.then(function () { return hooks[id].run(); }).then(function (n) { done += (typeof n === 'number' ? n : 1); }).catch(function (e) { failed.push(id + ': ' + (e && e.message || e)); }); }, Promise.resolve());
    hookRun.then(function () {
    if (window.RGE && RGE.pending) queued++;
    (function next(i) {
      if (i >= keys.length) {
        btn.disabled = false; if (!queued) logPage(savedKeys);
        if (failed.length) toast('Saved ' + done + ', but ' + failed.length + ' failed: ' + failed[0], true); else if (queued) toast('Submitted ' + done + ' change' + (done === 1 ? '' : 's') + ' for admin approval. The website is updated once an admin approves.'); else toast('Saved ' + done + ' change' + (done === 1 ? '' : 's') + '. The website is updated.');
        refreshSave(); return;
      }
      var key = keys[i], type = dirty[key], val = valueOf(key, type);
      if (val == null) { delete dirty[key]; next(i + 1); return; }
      fetch('/api/v2/page-elements', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page_slug: isGlobalKey(key) ? 'index' : slug, element_id: key, content_type: type === 'link' ? 'text' : type, content_value: val }) })
        .then(function (r) { return r.text().then(function (t) { if (r.status === 401 || r.status === 403) throw new Error('Session expired. Please sign in again.'); if (!r.ok) throw new Error(t.slice(0, 120) || ('Error ' + r.status)); if (/PENDING_APPROVAL/.test(t)) queued++; }); })
        .then(function () { done++; delete dirty[key]; savedKeys.push(key); }).catch(function (e) { failed.push(key + ': ' + e.message); }).then(function () { next(i + 1); });
    })(0);
    });
  }
  window.addEventListener('beforeunload', function (e) { if (dirtyCount()) { e.preventDefault(); e.returnValue = ''; } });

  /* ----- dashboard popup (the dashboard page inside the live site) */
  function openDashboard(section) {
    var d = $('#cms-dash');
    if (!d) {
      d = document.createElement('div'); d.id = 'cms-dash'; d.innerHTML = '<div class="box"><div class="head"><span>CMS Dashboard</span><button type="button" aria-label="Close">×</button></div><iframe title="CMS Dashboard"></iframe></div>'; document.body.appendChild(d);
      $('button', d).onclick = closeDashboard;
    }
    $('iframe', d).src = 'dashboard.html?embed=1' + (section ? '#' + section : ''); d.classList.add('open'); document.body.style.overflow = 'hidden';
  }
  function closeDashboard() { var d = $('#cms-dash'); if (!d) return; d.classList.remove('open'); document.body.style.overflow = ''; $('iframe', d).src = 'about:blank'; if (dashChanged) location.reload(); }
  window.addEventListener('message', function (e) { if (e.data === 'rg-cms-changed') dashChanged = true; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('#cms-dash.open')) closeDashboard(); });

  /* ---------------------------------------------------------------- start */
  var hold = function () { if (window.RGL) RGL.hold(); }, release = function () { if (window.RGL) RGL.release(); };   // the page loader stays until the CMS texts are in
  hold(); var loaded = loadSaved(); loaded.then(release, release);
  var heldStatus = !(window.RGL && RGL.cached); if (heldStatus) hold();   // with the cache nothing waits for the sign-in check
  viaPre('admin/status', '/api/admin/status').then(function (r) { return r.ok ? r.json() : { loggedIn: false }; }).catch(function () { return { loggedIn: false }; }).then(function (s) {
    if (heldStatus) release();
    if (!s || !s.loggedIn) { RGC.admin(false); return; }
    RGC.admin(true);   // a signed-in admin always works on fresh data
    if (window.RGL && RGL.cachedUsed) { location.reload(); return; }   // this view was drawn from the cache: load it again with fresh data
    buildBar(s);
    Object.assign(window.RGCMS, { admin: true, setEditing: setEditing, save: save, uploadImage: uploadImage, openDashboard: openDashboard, dirty: dirty, markDirty: markDirty, badges: function () { return badges; } });   // also used by tools/test-cms.js
    document.dispatchEvent(new CustomEvent('rg-admin', { detail: {} }));
    document.addEventListener('input', onInput); document.addEventListener('keydown', onKey, true); document.addEventListener('paste', onPaste, true); document.addEventListener('click', onClickCapture, true);
    if (location.hash === '#edit') setEditing(true);
  });
})();
