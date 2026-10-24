/* RockGuard inline editing of the CMS lists (applications, solutions, project highlights, resources).
 * A small framework used by js/rg-content.js:
 *   RGE.store(cfg)      one list of items in memory (edited on the page) + what has to be saved: changed items, new items, removed items.
 *                       It joins the SAVE button of the admin bar (js/cms.js: RGCMS.registerHook).
 *   RGE.bind(host, st, o)   makes the markup inside `host` editable with plain attributes, so every list only has to draw its HTML:
 *        data-e="field" data-id="<id>"          text (contenteditable) / input / select / checkbox bound to item[field]
 *        data-arr="field" data-i="n" data-id    one point of a list field (item[field][n]); Enter adds a point, Backspace on an empty one removes it
 *        data-eact="photo|photo-add|file|addarr|rmarr|add|del"  buttons (photo / file upload, add / remove a point, add / delete an item)
 * Only active while the admin is in edit mode (RGCMS.editing); visitors just get the drawn page.
 */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var RGE = window.RGE = {};
  RGE.editing = function () { return !!(window.RGCMS && window.RGCMS.editing); };
  RGE.slugify = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); };
  var refresh = function () { if (window.RGCMS && window.RGCMS.refresh) window.RGCMS.refresh(); };

  /* ---------------------------------------------------------------- backend */
  RGE.api = function (method, path, body) {
    return fetch('/api/v2/' + path, { method: method, credentials: 'include', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.text().then(function (t) {
          if (r.status === 401 || r.status === 403) throw new Error('Session expired. Please sign in again.');
          var j = null; try { j = JSON.parse(t); } catch (e) { /* not json */ }
          if (!r.ok) throw new Error((j && (j.error || j.message)) || ('Error ' + r.status));
          if (j && j.status === 'PENDING_APPROVAL') RGE.pending = true;   // an editor's change: queued for an admin
          return j;
        });
      });
  };
  RGE.upload = function (file, folder) {
    var fd = new FormData(); fd.append('file', file); fd.append('folder', folder || 'OTHERS');
    return fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd }).then(function (r) { if (!r.ok) throw new Error('Upload failed (' + r.status + ')'); return r.json(); }).then(function (j) { if (!j || !j.url) throw new Error('Upload failed'); return j.url; });
  };
  var picker;
  RGE.pickFile = function (accept) {
    return new Promise(function (resolve) {
      if (!picker) { picker = document.createElement('input'); picker.type = 'file'; picker.style.display = 'none'; document.body.appendChild(picker); }
      picker.accept = accept || ''; picker.value = ''; picker.onchange = function () { resolve(picker.files && picker.files[0] || null); }; picker.click();
    });
  };

  /* Link / file dialog (same look as the link editor): paste a link address OR upload a file.
   * RGE.fileLink({ title, url, accept, folder, hint }) -> Promise<{ url } | { clear: true } | null> */
  RGE.fileLink = function (o) {
    return new Promise(function (resolve) {
      var old = document.getElementById('cms-linked'); if (old) old.remove();
      var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
      var nameOf = function (u) { try { return decodeURIComponent(String(u).split('?')[0].split('/').pop() || ''); } catch (e) { return String(u); } };
      var m = document.createElement('div'); m.id = 'cms-linked'; m.className = 'cms-filelink';
      m.innerHTML = '<div class="card" role="dialog" aria-modal="true"><div class="hd"><h3>' + esc(o.title || 'Edit link') + '</h3><button type="button" class="x" aria-label="Close">×</button></div><div class="bd">' +
        '<label><span>Link address</span><input type="text" id="fl-url" value="' + esc(o.url || '') + '" placeholder="https://… (a web page or a PDF link)"></label>' +
        '<div class="fl-or"><i></i><b>or</b><i></i></div>' +
        '<div class="fl-up"><button type="button" class="fl-btn">⬆ Upload a file' + (o.accept && /pdf/i.test(o.accept) ? ' (PDF)' : '') + '</button><span class="fl-name" id="fl-name">' + (o.url ? 'Current: ' + esc(nameOf(o.url)) : 'No file chosen') + '</span></div>' +
        (o.hint ? '<p class="note">' + esc(o.hint) + '</p>' : '') +
        '<div class="err" id="fl-err" role="alert"></div></div><div class="ft">' + (o.url ? '<button type="button" class="rm">Remove</button>' : '') + '<button type="button" class="no">Cancel</button><button type="button" class="yes">Apply</button></div></div>';
      document.body.appendChild(m);
      var url = m.querySelector('#fl-url'), nm = m.querySelector('#fl-name'), err = m.querySelector('#fl-err'), up = m.querySelector('.fl-btn'), busy = false;
      url.focus(); url.select();
      var close = function (v) { document.removeEventListener('keydown', key, true); m.remove(); resolve(v); };
      function key(e) { if (e.key === 'Escape') { e.stopPropagation(); close(null); } else if (e.key === 'Enter' && !busy && e.target !== up) { e.preventDefault(); apply(); } }
      document.addEventListener('keydown', key, true);
      function apply() {
        var u = url.value.trim();
        if (busy) { err.textContent = 'Wait until the upload has finished.'; return; }
        if (!u) { err.textContent = 'Enter a link address or upload a file.'; return; }
        if (/^\s*javascript:/i.test(u)) { err.textContent = 'This address is not allowed.'; return; }
        close({ url: u });
      }
      up.onclick = function () {
        err.textContent = '';
        RGE.pickFile(o.accept || '').then(function (file) {
          if (!file) return;
          busy = true; up.disabled = true; nm.textContent = 'Uploading ' + file.name + '…';
          return RGE.upload(file, o.folder || 'OTHERS').then(function (u) { url.value = u; nm.textContent = 'Uploaded: ' + file.name; })
            .catch(function (e) { nm.textContent = o.url ? 'Current: ' + nameOf(o.url) : 'No file chosen'; err.textContent = e.message; })
            .then(function () { busy = false; up.disabled = false; });
        });
      };
      m.querySelector('.x').onclick = function () { close(null); }; m.querySelector('.no').onclick = function () { close(null); };
      m.querySelector('.yes').onclick = apply;
      var rm = m.querySelector('.rm'); if (rm) rm.onclick = function () { close({ clear: true }); };
      m.addEventListener('mousedown', function (e) { if (e.target === m) close(null); });
    });
  };

  // change history of a list (shown in the dashboard under Change History): one entry per save with the items that were added / updated / deleted
  RGE.history = function (slug, changes) {
    var keys = Object.keys(changes); if (!keys.length) return Promise.resolve(); var snap = {}; keys.forEach(function (k) { snap[k] = { type: 'text', value: changes[k] }; });
    return fetch('/api/v2/history', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page_slug: slug, snapshot: snap, changed_keys: keys }) }).catch(function () { });
  };

  /* ---------------------------------------------------------------- the store */
  RGE.store = function (cfg) {
    var st = { rows: [], dirty: {}, removed: [], titles: {}, seq: 0, onSaved: null };
    st.load = function (rows) { if (!st.reg && window.RGCMS && window.RGCMS.registerHook) { st.reg = true; window.RGCMS.registerHook(cfg.name, { count: st.count, run: st.save }); }   // (cms.js runs after this file: register on first load)
      st.rows = rows.filter(cfg.live || function () { return true; }).sort(cfg.sort || function () { return 0; }).map(cfg.toModel); st.dirty = {}; st.removed = []; st.titles = {}; return st; };
    st.by = function (id) { return st.rows.filter(function (m) { return String(m.id) === String(id); })[0]; };
    st.mark = function (m) { if (m) st.dirty[m.id] = 1; refresh(); };
    st.count = function () { return Object.keys(st.dirty).length + st.removed.length; };
    st.add = function (extra) { var m = cfg.defaults(st); m.id = 'new-' + (++st.seq); m.isNew = true; if (extra) for (var k in extra) m[k] = extra[k]; st.rows.push(m); st.mark(m); return m; };
    st.remove = function (m) { if (!m.isNew) { st.removed.push(m.id); st.titles[m.id] = m.title; } st.rows = st.rows.filter(function (x) { return x !== m; }); delete st.dirty[m.id]; refresh(); };
    st.save = function () {
      var n = 0, p = Promise.resolve(), log = {};
      st.rows.forEach(function (m) {
        if (!st.dirty[m.id]) return;
        p = p.then(function () {
          if (m.isNew) return RGE.api('POST', cfg.path, cfg.toBody(m, true, st)).then(function (res) { return cfg.afterCreate ? cfg.afterCreate(m, res) : null; });
          return RGE.api('PATCH', cfg.path + '/' + m.id, cfg.toBody(m, false, st));
        }).then(function () { n++; log[m.title || '(untitled)'] = m.isNew ? 'Added' : 'Updated'; });
      });
      st.removed.forEach(function (id) { p = p.then(function () { return RGE.api('DELETE', cfg.path + '/' + id); }).then(function () { n++; log[st.titles[id] || '(untitled)'] = 'Deleted'; }); });
      return p.then(function () { return RGE.pending ? null : RGE.history(cfg.name, log); }).then(function () { return RGE.api('GET', cfg.list || cfg.path); }).then(function (fresh) {
        var keep = st.onBeforeReload ? st.onBeforeReload() : null; st.load(Array.isArray(fresh) ? fresh : []);
        if (st.onSaved) st.onSaved(keep); refresh(); return n;
      });
    };
    return st;
  };

  /* ---------------------------------------------------------------- the binder */
  var isField = function (t) { return /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName); };
  RGE.bind = function (host, st, o) {
    function onEdit(e) {
      if (!RGE.editing()) return; var t = e.target;
      var arr = t.closest && t.closest('[data-arr]');
      if (arr && !isField(t)) { var m = st.by(arr.getAttribute('data-id')); if (!m) return; m[arr.getAttribute('data-arr')][parseInt(arr.getAttribute('data-i'), 10)] = arr.textContent.replace(/ /g, ' '); st.mark(m); if (o.onField) o.onField(m, arr.getAttribute('data-arr'), arr); return; }
      var f = t.getAttribute && t.getAttribute('data-e'); if (!f) return;
      var item = st.by(t.getAttribute('data-id')); if (!item) return;
      var v = isField(t) ? (t.type === 'checkbox' ? t.checked : t.type === 'number' ? (parseInt(t.value, 10) || 0) : t.value) : (t.hasAttribute('data-multi') ? t.innerText : t.textContent).split(String.fromCharCode(160)).join(' ');
      item[f] = v; st.mark(item); if (o.onField) o.onField(item, f, t);
    }
    host.addEventListener('input', onEdit); host.addEventListener('change', onEdit);

    host.addEventListener('keydown', function (e) {
      if (!RGE.editing()) return; var t = e.target.closest && e.target.closest('[data-arr][contenteditable="true"]');
      if (t) {
        var m = st.by(t.getAttribute('data-id')), k = t.getAttribute('data-arr'), i = parseInt(t.getAttribute('data-i'), 10); if (!m) return;
        if (e.key === 'Enter') { e.preventDefault(); m[k].splice(i + 1, 0, ''); st.mark(m); o.redraw('[data-arr="' + k + '"][data-i="' + (i + 1) + '"][data-id="' + m.id + '"]'); }
        else if (e.key === 'Backspace' && t.textContent === '' && m[k].length > 1) { e.preventDefault(); m[k].splice(i, 1); st.mark(m); o.redraw('[data-arr="' + k + '"][data-i="' + Math.max(0, i - 1) + '"][data-id="' + m.id + '"]'); }
        return;
      }
      var line = e.target.closest && e.target.closest('[data-e][contenteditable="true"]');
      if (line && e.key === 'Enter' && !line.hasAttribute('data-multi')) e.preventDefault();   // single paragraph texts: no line breaks (data-multi texts keep them)
    });
    host.addEventListener('paste', function (e) {
      var t = e.target.closest && e.target.closest('[contenteditable="true"]'); if (!RGE.editing() || !t || t.hasAttribute('data-cms')) return;
      e.preventDefault(); var txt = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t.hasAttribute('data-multi') ? txt : txt.replace(/\s*\n\s*/g, ' '));
    });

    host.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-eact]'); if (!b || !RGE.editing()) return;
      e.preventDefault(); e.stopPropagation();
      var act = b.getAttribute('data-eact'), id = b.getAttribute('data-id'), m = id ? st.by(id) : null, field = b.getAttribute('data-field'), i = parseInt(b.getAttribute('data-i'), 10);
      if (o.action && o.action(act, b, m) === true) return;
      if (act === 'add') { var n = o.add ? o.add() : st.add(); o.redraw(null, n); }
      else if (act === 'del' && m) { RGDialog.confirm({ title: 'Delete this item?', message: 'Delete "' + (m.title || 'this item') + '"?\nIt is removed from the website when you press SAVE.', ok: 'Delete', danger: true }).then(function (go) { if (!go) return; st.remove(m); if (o.afterDelete) o.afterDelete(m); o.redraw(); }); }
      else if (act === 'clear' && m) { m[field] = ''; st.mark(m); o.redraw(); }
      else if (act === 'filelink' && m) { RGE.fileLink({ title: b.getAttribute('data-title') || 'Edit link', url: m[field], accept: b.getAttribute('data-accept') || '', folder: b.getAttribute('data-folder') || 'OTHERS', hint: b.getAttribute('data-hint') || '' }).then(function (r) { if (!r) return; m[field] = r.clear ? '' : r.url; st.mark(m); o.redraw(); }); }
      else if (act === 'addarr' && m) { m[field].push(''); st.mark(m); o.redraw('[data-arr="' + field + '"][data-i="' + (m[field].length - 1) + '"][data-id="' + m.id + '"]'); }
      else if (act === 'rmarr' && m) { m[field].splice(i, 1); st.mark(m); o.redraw(); }
      else if ((act === 'photo' || act === 'photo-add' || act === 'file') && m) {
        RGE.pickFile(act === 'file' ? (b.getAttribute('data-accept') || '') : 'image/*').then(function (file) {
          if (!file) return; b.textContent = 'Uploading…';
          return RGE.upload(file, b.getAttribute('data-folder') || 'OTHERS').then(function (url) {
            if (act === 'photo-add') m[field].push(url); else if (!isNaN(i)) m[field][i] = url; else m[field] = url;
            st.mark(m); o.redraw();
          });
        }).catch(function (err) { RGDialog.alert(err.message, { title: 'Upload failed', danger: true }); o.redraw(); });
      }
    });
  };
})();
