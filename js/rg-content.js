/* RockGuard: the pages read their lists from the CMS (what is added / edited in the Dashboard shows up on the website).
 * Pages are shipped with the same content already written in (tools/build-pages.js); this script replaces it with the live CMS data
 * as soon as the API answers. If the API cannot be reached the shipped content simply stays.
 * Backend (the site's own /api path): /api/v2/solutions (= products), /stories (= project highlights), /resources, /page-elements/<page>.
 *
 * Where the data of a product lives: the solution row (title, tag line = category, summary = short_description, card photo = icon_image_url,
 * family hd / pw / acc = product_family) + the page elements of the page "product-detail-<slug>": prod-lead, prod-image, prod-tile,
 * prod-features (JSON [[title, text]]), prod-downloads (JSON [[label, url, type, ext]]), prod-acc-desc (see tools/seed-content.js).
 */
(function () {
  'use strict';
  var page = document.body.getAttribute('data-page');
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var RGC = window.RGC || { usable: function () { return false; }, list: function () { return null; }, setList: function () { } };   // data cache (js/rg-cache.js)
  function get(path) {
    var ask = function () { return fetch('/api/v2/' + path, { credentials: 'include', cache: 'no-store' }); }, x = window.RGP && window.RGP.take ? window.RGP.take('v2/' + path) : null;
    var fresh = (x ? x.then(function (r) { return r && r.ok ? r : ask(); }) : ask()).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { if (Array.isArray(j)) RGC.setList(path, j); return j; });
    var cached = RGC.usable() ? RGC.list(path) : null;
    if (cached) { if (window.RGL) RGL.cachedUsed = true; fresh.catch(function () { }); return Promise.resolve(cached); }   // drawn from the cache at once; the newer data is kept for the next page
    if (window.RGL) { if (RGL.miss) RGL.miss(); RGL.hold(); }   // not cached yet: the page loader stays until the list is drawn
    var done = function () { setTimeout(function () { if (window.RGL) RGL.release(); }, 30); };
    fresh.then(done, done); return fresh;
  }
  var byOrder = function (a, b) { return (a.display_order || 0) - (b.display_order || 0); };
  var live = function (r) { return r.is_active !== false && r.is_deleted !== true; };
  var json = function (s, d) { try { var j = JSON.parse(s); return j == null ? d : j; } catch (e) { return d; } };
  var imgSrc = function (u) { return String(u || '').replace(/^\//, ''); };   // /images/x.webp -> images/x.webp (the pages live in the site root)
  var img = function (u, alt, extra) { return u ? '<img class="rg14" src="' + esc(imgSrc(u)) + '" alt="' + esc(alt || '') + '" loading="lazy"' + (extra || '') + '>' : ''; };
  var fail = function (e) { if (window.console) console.warn('[rg-content]', e && e.stack || e); };   // the shipped content stays when something goes wrong
  // the banner photo of the Products / product pages (a normal CMS image: "Change image" in edit mode)
  var heroBg = function (key, src) { return '<img class="rg-herobg" src="' + esc(src ? imgSrc(src) : 'images/26a.webp') + '" alt="" data-cms="' + key + '" data-cms-type="image"><div class="rg-heroov"></div>'; };
  var afterDraw = function () { if (window.RGCMS && window.RGCMS.reapply) window.RGCMS.reapply(); document.dispatchEvent(new CustomEvent('rg-redrawn')); };
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  // the host that replaces the shipped state variants of a part of the page (see data-vgroup in tools/build-pages.js)
  function dropVariants(group) {
    var blocks = $$('[data-vgroup="' + group + '"]'); if (!blocks.length) return null;
    var host = document.createElement('div'); host.setAttribute('data-dyn', group); host.style.display = 'block';
    blocks[0].parentNode.insertBefore(host, blocks[0]); blocks.forEach(function (b) { b.remove(); }); return host;
  }

  /* ================================================================= products (solutions + the page elements of their product page) */
  var prods = [];   // [{ slug, title, tag, summary, card, family, order, link, lead, image, tile, features, downloads, accDesc, key }]
  var tabKey = function (p) { return p.family === 'acc' ? 'acc' : (p.family === 'hd' || p.family === 'pw') ? p.family : p.slug; };
  function loadProducts(only) {   // only = true: just the solution rows (home cards); only = a slug: the texts of that product only (its own page); nothing: all
    return get('solutions').then(function (rows) {
      var list = rows.filter(live).sort(byOrder);
      return Promise.all(list.map(function (r) {
        return ((only === true || (only && only !== r.slug)) ? Promise.resolve([]) : get('page-elements/' + encodeURIComponent('product-detail-' + r.slug))).catch(function () { return []; }).then(function (els) {
          var e = {}; (Array.isArray(els) ? els : []).forEach(function (x) { if (/^prod-/.test(x.element_id || '')) e[x.element_id] = x.content_value; });
          return {
            id: r.id, slug: r.slug, title: r.title || r.slug, tag: r.category || '', summary: String(r.short_description || '').replace(/\s*\[Images:\d+\]/g, '').trim(), card: r.icon_image_url || '',
            family: r.product_family || '', order: r.display_order || 0, link: r.custom_link || '',
            lead: e['prod-lead'] || '', image: e['prod-image'] || r.icon_image_url || '', tile: e['prod-tile'] || r.icon_image_url || '',
            features: json(e['prod-features'], []), downloads: json(e['prod-downloads'], []), accDesc: e['prod-acc-desc'] || ''
          };
        });
      })).then(function (all) { prods = all; prods.forEach(function (p) { p.key = tabKey(p); }); return prods; });
    });
  }
  var isAcc = function (p) { return p.family === 'acc'; };
  var mainProds = function () { return prods.filter(function (p) { return !isAcc(p); }); };
  var accProds = function () { return prods.filter(isAcc); };
  var hasAcc = function () { return accProds().length > 0; };
  var prodByKey = function (k) { var p = prods.filter(function (x) { return x.key === k || x.slug === k; })[0]; return p; };
  var prodTitle = function (slug) { var p = prods.filter(function (x) { return x.slug === slug; })[0]; return p ? p.title : ''; };

  /* ================================================================= product models: what the live editor changes (home cards, Products tab, product page share them) */
  var pmodels = {};
  function pm(p) {
    var m = pmodels[p.slug];
    if (!m) m = pmodels[p.slug] = { id: p.id, slug: p.slug, title: p.title, tag: p.tag, summary: p.summary, card: p.card, lead: p.lead, image: p.image, accDesc: p.accDesc,
      features: p.features.map(function (f) { return [f[0] || '', f[1] || '']; }), downloads: p.downloads.map(function (d) { return [d[0] || '', d[1] || '', d[2] || '', d[3] || '']; }), dirty: {} };
    return m;
  }
  var editing = function () { return !!(window.RGCMS && window.RGCMS.editing); };
  var refreshBar = function () { if (window.RGCMS && window.RGCMS.refresh) window.RGCMS.refresh(); };
  var pe = function (m, attr) { return editing() ? ' contenteditable="true" spellcheck="false" data-slug="' + esc(m.slug) + '" ' + attr : ''; };   // an editable text of a product
  var pbtn = function (m, cls, act, label, extra) { return editing() ? '<button type="button" class="' + cls + ' rl-ctl" data-sa="' + act + '" data-slug="' + esc(m.slug) + '"' + (extra || '') + '>' + label + '</button>' : ''; };
  var pmark = function (m, k) { m.dirty[k] = 1; refreshBar(); };
  var pcount = function () { return Object.keys(pmodels).reduce(function (n, s) { return n + Object.keys(pmodels[s].dirty).length; }, 0); };
  var redrawFns = [];   // every drawn part that shows products; called after an edit that changes the structure (add / remove / photo)
  function saveProducts() {
    var RGE = window.RGE, pr = Promise.resolve(), n = 0, log = {};
    Object.keys(pmodels).forEach(function (s) {
      var m = pmodels[s], d = m.dirty, keys = Object.keys(d); if (!keys.length) return;
      var page = 'product-detail-' + m.slug;
      var el = { lead: ['prod-lead', 'text', m.lead], image: ['prod-image', 'image', m.image], accDesc: ['prod-acc-desc', 'text', m.accDesc],
        features: ['prod-features', 'text', JSON.stringify(m.features.filter(function (f) { return f[0].trim() || f[1].trim(); }))], downloads: ['prod-downloads', 'text', JSON.stringify(m.downloads.filter(function (x) { return x[0].trim() || x[1].trim(); }))] };
      if (d.row || d.card) { var body = {}; if (d.row) { body.title = m.title; body.category = m.tag; body.short_description = m.summary; } if (d.card) body.icon_image_url = m.card; pr = pr.then(function () { return RGE.api('PATCH', 'solutions/' + m.id, body); }).then(function () { n++; }); }
      Object.keys(el).forEach(function (k) { if (!d[k]) return; pr = pr.then(function () { return RGE.api('POST', 'page-elements', { page_slug: page, element_id: el[k][0], content_type: el[k][1], content_value: el[k][2] }); }).then(function () { n++; }); });
      keys.forEach(function (k) { log[m.title + ' · ' + (k === 'row' ? 'title / tag / summary' : k)] = 'Updated'; });
      pr = pr.then(function () { m.dirty = {}; });
    });
    return pr.then(function () { return RGE.pending ? null : RGE.history('solutions', log); }).then(function () { refreshBar(); return n; });
  }
  // one set of listeners for every host that shows editable products
  function bindProducts(host) {
    if (host.__pb) return; host.__pb = 1;
    if (window.RGCMS && window.RGCMS.registerHook && !bindProducts.hooked) { bindProducts.hooked = 1; window.RGCMS.registerHook('products', { count: pcount, run: saveProducts }); }
    var RGE = window.RGE, modelOf = function (el) { return pmodels[el.getAttribute('data-slug')]; };
    host.addEventListener('input', function (e) {
      if (!editing()) return; var t = e.target.closest && e.target.closest('[data-sf]'); if (!t) return; var m = modelOf(t); if (!m) return;
      var f = t.getAttribute('data-sf'), v = t.textContent.split(String.fromCharCode(160)).join(' '), i = parseInt(t.getAttribute('data-i'), 10), j = parseInt(t.getAttribute('data-j'), 10);
      if (f === 'f') { m.features[i][j] = v; pmark(m, 'features'); } else if (f === 'd') { m.downloads[i][j] = v; pmark(m, 'downloads'); }
      else { m[f] = v; pmark(m, f === 'title' || f === 'tag' || f === 'summary' ? 'row' : f); }
    });
    host.addEventListener('keydown', function (e) { if (editing() && e.key === 'Enter' && e.target.closest && e.target.closest('[data-sf][contenteditable]')) e.preventDefault(); });
    host.addEventListener('paste', function (e) { var t = e.target.closest && e.target.closest('[data-sf][contenteditable]'); if (!editing() || !t) return; e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\s*\n\s*/g, ' ')); });
    host.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-sa]'); if (!b || !editing()) return; e.preventDefault(); e.stopImmediatePropagation();
      var m = modelOf(b), a = b.getAttribute('data-sa'), i = parseInt(b.getAttribute('data-i'), 10), field = b.getAttribute('data-field') || 'image'; if (!m) return;
      var redraw = function () { redrawFns.forEach(function (fn) { fn(); }); };
      if (a === 'addf') { m.features.push(['', '']); pmark(m, 'features'); redraw(); var f = $('[data-sf="f"][data-slug="' + m.slug + '"][data-i="' + (m.features.length - 1) + '"][data-j="0"]'); if (f) f.focus(); }
      else if (a === 'rmf') { m.features.splice(i, 1); pmark(m, 'features'); redraw(); }
      else if (a === 'addd') { m.downloads.push(['New download', '', 'Data Sheet', '']); pmark(m, 'downloads'); redraw(); }
      else if (a === 'rmd') { m.downloads.splice(i, 1); pmark(m, 'downloads'); redraw(); }
      else if (a === 'dlink') RGE.fileLink({ title: 'Download link', url: m.downloads[i][1], accept: '.pdf,.docx,application/pdf', folder: 'resources', hint: 'The file this download opens: paste a link or upload a PDF / Word file.' }).then(function (r) { if (!r) return; m.downloads[i][1] = r.clear ? '' : r.url; m.downloads[i][3] = ''; pmark(m, 'downloads'); redraw(); });
      else if (a === 'photo') RGE.pickFile('image/*').then(function (file) { if (!file) return; b.textContent = 'Uploading…'; return RGE.upload(file, 'solutions').then(function (u) { m[field] = u; pmark(m, field === 'card' ? 'card' : 'image'); redraw(); }); }).catch(function (err) { window.RGDialog.alert(err.message, { title: 'Upload failed', danger: true }); redraw(); });
    }, true);
  }

  /* ================================================================= HOME: the product cards (title, tag line, summary and card photo are editable here) */
  function home() {
    var box = $('.rg52'); if (!box) return;
    loadProducts(true).then(function () {
      var list = mainProds(); if (!list.length) return;
      function draw() {
        box.innerHTML = list.map(function (p) {
          var m = pm(p);
          return '<article class="rg53 rg-hover5" data-href="' + esc(p.link || 'products.html?prod=' + p.key) + '"><div class="rg54" style="aspect-ratio:16/9">' + img(m.card, m.title) + pbtn(m, 'dyn-photo', 'photo', '📷 Change photo', ' data-field="card"') + '<span class="rg55"' + pe(m, 'data-sf="tag"') + '>' + esc(m.tag) + '</span></div>' +
            '<div class="rg56"><h3 class="rg57"' + pe(m, 'data-sf="title"') + '>' + esc(m.title) + '</h3><p class="rg58"' + pe(m, 'data-sf="summary"') + '>' + esc(m.summary) + '</p><div class="rg59">Learn More →</div></div></article>';
        }).join('');
        afterDraw();
      }
      redrawFns.push(draw); bindProducts(box); document.addEventListener('rg-edit-mode', draw); draw();
    }).catch(fail);
  }

  /* ================================================================= PRODUCTS page */
  // static texts of the drawn parts are normal CMS texts (data-cms keys), so every word of the page is editable
  var T = function (key, html, tag, cls) { return '<' + (tag || 'span') + (cls ? ' class="' + cls + '"' : '') + ' data-cms="' + key + '" data-cms-type="text">' + html + '</' + (tag || 'span') + '>'; };
  function products() {
    loadProducts().then(function () {
      if (!prods.length) return;
      var host = dropVariants('prod'); if (!host) return;
      var q = /[?&]prod=([a-z0-9\-]+)/.exec(location.search), tabs = function () { return mainProds().map(function (p) { return { key: p.key, name: pm(p).title }; }).concat(hasAcc() ? [{ key: 'acc', name: 'Accessories' }] : []); };
      var sel = q && tabs().some(function (t) { return t.key === q[1]; }) ? q[1] : (tabs()[0] || {}).key;
      function draw() {
        var acc = sel === 'acc', p = acc ? null : prodByKey(sel) || mainProds()[0], m = p && pm(p);
        var tabBtns = tabs().map(function (t) { var on = t.key === sel; return '<button class="rg85 rg-ptab' + (on ? ' on' : '') + '" data-pt="' + esc(t.key) + '"' + (on ? ' aria-current="true"' : '') + '>' + esc(t.name) + '</button>'; }).join('');
        var name, tag, left, right, feats = [];   // feats: [owner model, index in its features]
        if (acc) {
          var items = accProds().map(pm); name = 'Accessories'; tag = 'Installation & Jobsite';
          items.forEach(function (x) { x.features.forEach(function (f, k) { feats.push([x, k]); }); });
          left = '<div class="rg89">' + items.map(function (x, i) { return '<div class="rg90" style="position:relative"><img class="rg91" src="' + esc(imgSrc(x.image)) + '" alt="' + esc(x.title) + '" loading="lazy" style="object-fit:' + (i === 0 ? 'contain' : 'cover') + ';padding:' + (i === 0 ? '18px' : '0') + '">' + pbtn(x, 'dyn-photo', 'photo', '📷 Change photo') + '</div>'; }).join('') + '</div>';
          right = '<div class="rg95">' + items.map(function (x) { return '<div class="rg96"><p class="rg97"><strong class="rg44"' + pe(x, 'data-sf="title"') + '>' + esc(x.title) + '</strong> <span' + pe(x, 'data-sf="accDesc"') + '>' + esc(x.accDesc || x.lead) + '</span></p></div>'; }).join('') + '</div>';
        } else {
          name = m.title; tag = m.tag; m.features.forEach(function (f, k) { feats.push([m, k]); });
          left = '<div class="rg88" style="position:relative">' + img(m.image, m.title) + pbtn(m, 'dyn-photo', 'photo', '📷 Change photo') + '</div>';
          right = (m.lead || m.summary || editing() ? '<p class="rg94"' + (p ? pe(m, 'data-sf="lead"') : '') + '>' + esc(m.lead || (editing() ? '' : m.summary)) + '</p>' : '') + (editing() && !m.lead ? '<p class="rg94" style="opacity:.6">(Empty: the summary is shown instead. Click above to write the lead text.)</p>' : '');
        }
        var ds = !acc && m.downloads[0] ? m.downloads[0][1] : '';
        var featHtml = feats.map(function (fx, i) {
          var o = fx[0], k = fx[1], f = o.features[k];
          return '<div class="rg107 rg-hover10"><div class="rg108"><span class="rg109">' + pad2(i + 1) + '</span><span class="rg110"></span></div><h4 class="rg111"' + pe(o, 'data-sf="f" data-i="' + k + '" data-j="0"') + '>' + esc(f[0]) + '</h4>' +
            (f[1] || editing() ? '<p class="rg112"' + pe(o, 'data-sf="f" data-i="' + k + '" data-j="1"') + '>' + esc(f[1]) + '</p>' : '') + (editing() ? '<button type="button" class="app-x rl-ctl" data-sa="rmf" data-slug="' + esc(o.slug) + '" data-i="' + k + '" title="Remove this feature" style="position:static;margin-top:10px">×</button>' : '') + '</div>';
        }).join('');
        var addF = !editing() ? '' : (acc ? accProds().map(pm).map(function (x) { return pbtn(x, 'dyn-add', 'addf', '＋ Add feature to ' + esc(x.title), ' style="margin:0 10px 10px 0"'); }).join('') : pbtn(m, 'dyn-add', 'addf', '＋ Add feature'));
        host.innerHTML =
          '<section class="rg80 rg-hero" data-sec-id="sec-products-hero">' + heroBg('img-hero-products') + '<div class="rg81" style="padding-bottom:64px"><div class="rg82"><span class="rg18"></span>' + T('products-eyebrow', 'RockGuard® HD | Products') + '</div>' + T('products-title', 'Pipeline Protection <span class="rg41">Products</span>', 'h1', 'rg83') + '</div></section>' +
          '<div class="rg-tabstrip"><div class="rg-tabstrip-in"><div class="rg84" style="padding-top:0">' + tabBtns + '</div></div></div>' +
          '<section class="rg86" data-sec-id="sec-products-detail"><div class="rg87">' + left + '<div><div class="rg92"' + (p ? pe(m, 'data-sf="tag"') : '') + '>' + esc(tag) + '</div><h2 class="rg93"' + (p ? pe(m, 'data-sf="title"') : '') + '>' + esc(name) + '</h2>' + right +
          '<div class="rg98"><button class="rg99 rg-hover9" data-href="contact.html" data-cms="products-quote-btn" data-cms-type="text" data-cms-link="lnk-products-quote">Get a Quote</button>' + (ds ? '<a class="rg100 rg-hover7" href="' + esc(ds) + '" target="_blank" rel="noopener">Data Sheet ↓</a>' : '') + '</div>' +
          (editing() && !acc ? '<p class="rg206" style="margin-top:14px">The summary (home card) and the downloads of this product are edited on its own page: <a href="product-detail-' + esc(m.slug) + '.html">product-detail-' + esc(m.slug) + '.html</a>.</p>' : '') + '</div></div></section>' +
          '<section class="rg80" data-sec-id="sec-products-features"><div class="rg101"><div class="rg102"><div><div class="rg103"><span class="rg18"></span>' + esc(name) + '</div>' + T('products-features-title', 'Features &amp; <span class="rg41">Benefits</span>', 'h3', 'rg104') + '</div><div class="rg105">' + pad2(feats.length) + ' ' + T('products-advantages', 'Key Advantages') + '</div></div><div class="rg106">' + featHtml + '</div>' + (editing() ? '<div class="rl-ctl" style="margin-top:20px">' + addF + '</div>' : '') + '</div></section>';
        afterDraw();
      }
      host.addEventListener('click', function (e) { var b = e.target.closest('[data-pt]'); if (!b) return; sel = b.getAttribute('data-pt'); draw(); try { history.replaceState(null, '', 'products.html?prod=' + encodeURIComponent(sel)); } catch (x) { } });
      redrawFns.push(draw); bindProducts(host); document.addEventListener('rg-edit-mode', draw); draw();
    }).catch(fail);
  }

  /* ================================================================= RESOURCES page */
  var RES_TABS = ['Downloads', 'Technical Datasheets', 'Webinars', 'Videos', 'Blog Posts', 'Technical Notes'];
  var DL_TYPES = ['Sizing Chart', 'Installation', 'Brochure', 'Specification', 'Safety'];
  var F_TYPE = { 'Technical Datasheets': ['Data Sheet'], 'Webinars': ['Webinar'], 'Videos': ['Video'], 'Blog Posts': ['Blog Post'], 'Technical Notes': ['Technical Note'] };
  var PROD_RE = /^\[product:([a-z0-9\-]+)\]\s*/;
  var extOf = function (u) { return /\.docx(\?|$)/i.test(u) ? 'DOCX' : /\.pdf(\?|$)/i.test(u) ? 'PDF' : /youtu/i.test(u) ? 'VIDEO' : u ? 'WEB' : ''; };
  function resources() {
    Promise.all([get('resources?all=true'), loadProducts()]).then(function (res) {
      var rows = res[0].filter(live).sort(function (a, b) { return String(a.published_date || '').localeCompare(String(b.published_date || '')); });   // oldest first = the order of the design
      if (!rows.length) return;
      var list = rows.map(function (r) { var m = PROD_RE.exec(r.description || ''), t = r.document_type || '', own = t === 'Blog Post' ? 'blog-' + slugify(r.title) + '.html' : t === 'Webinar' ? 'webinar-' + slugify(r.title) + '.html' : ''; return { title: r.title || '', type: t, product: m ? m[1] : 'all', file: own || r.file_url || '', own: !!own, ext: own ? (t === 'Blog Post' ? 'READ' : 'WATCH') : extOf(r.file_url || '') }; });
      var blocks = $$('[data-vgroup="res"]'); if (!blocks.length) return;
      var host = dropVariants('res'); var block0 = blocks[0];
      // keep the shipped section (video, headings), only the dynamic parts are redrawn
      var sec = $('section.rg114', block0); if (!sec) return;
      host.appendChild(sec); sec.setAttribute('data-sec-id', 'sec-resources-library');
      var groups = [['all', 'All Products', 'images/IMG_0097_crop.webp', null]].concat(mainProds().map(function (p) { return [p.slug, p.title, p.tile, [p.slug]]; }));
      if (hasAcc()) groups.push(['acc', 'Accessories', accProds()[0].tile, accProds().map(function (p) { return p.slug; })]);
      var q = /[?&]prod=([a-z0-9\-]+)/.exec(location.search), want = q ? q[1] : 'all';
      var cur = groups.filter(function (g) { return g[0] === want || (prodByKey(want) && g[0] === prodByKey(want).slug) || (want === 'acc' && g[0] === 'acc'); })[0] || groups[0];
      var prod = cur[0], filter = 'Downloads';
      var inGrp = function (g, r) { return !g[3] || g[3].indexOf(r.product) >= 0; };
      function draw() {
        var g = groups.filter(function (x) { return x[0] === prod; })[0] || groups[0];
        var byType = list.filter(function (r) { return filter === 'Downloads' ? DL_TYPES.indexOf(r.type) >= 0 : F_TYPE[filter].indexOf(r.type) >= 0; });
        var shown = byType.filter(function (r) { return inGrp(g, r); });
        $('.rg117', sec).textContent = g[1];
        $('.rg119', sec).innerHTML = groups.map(function (x) { var n = list.filter(function (r) { return inGrp(x, r); }).length; return '<button class="rg120" data-rp="' + esc(x[0]) + '"><img class="rg121 rg-hover11" src="' + esc(imgSrc(x[2])) + '" alt=""><div class="rg122"></div><div class="rg123"><span class="rg124">' + n + (n === 1 ? ' Document' : ' Documents') + '</span><span class="rg125">' + esc(x[1]) + '</span></div><div class="rg126" style="background:' + (x[0] === g[0] ? '#de4228' : 'transparent') + '"></div></button>'; }).join('');
        $('.rg128', sec).innerHTML = RES_TABS.map(function (f) { var on = f === filter; return '<button class="rg129 rg-hover1" data-rf="' + esc(f) + '" style="border-bottom:3px solid ' + (on ? '#de4228' : 'transparent') + ';color:' + (on ? '#de4228' : '#6b4a35') + '">' + esc(f) + '</button>'; }).join('');
        $('.rg130', sec).textContent = shown.length + (shown.length === 1 ? ' document' : ' documents');
        var empty = $('.rg131', sec);
        if (!shown.length) { if (!empty) { empty = document.createElement('div'); empty.className = 'rg131'; $('.rg132', sec).parentNode.insertBefore(empty, $('.rg132', sec)); } empty.textContent = 'No ' + filter.toLowerCase() + ' available for ' + (g[0] === 'all' ? 'RockGuard® products' : g[1]) + ' yet.'; } else if (empty) empty.remove();
        $('.rg132', sec).innerHTML = shown.map(function (r) { return '<a class="rg133 rg-hover12" href="' + esc(r.file || '#') + '"' + (r.own ? '' : ' target="_blank" rel="noopener"') + '><div class="rg134"><span class="rg135">' + esc(r.type) + '</span><span class="rg136">' + esc(r.ext) + '</span></div><h4 class="rg137">' + esc(r.title) + '</h4><div class="rg138"><span class="rg139">' + esc(prodTitle(r.product)) + '</span><span class="rg140">↓</span></div></a>'; }).join('');
      }
      sec.addEventListener('click', function (e) { var b = e.target.closest('[data-rp],[data-rf]'); if (!b) return; if (b.hasAttribute('data-rp')) prod = b.getAttribute('data-rp'); else filter = b.getAttribute('data-rf'); draw(); });
      draw(); afterDraw();
    }).catch(fail);
  }

  /* ================================================================= PROJECT HIGHLIGHTS (stories) */
  var storyX = function (r) { var x = json(r.result_text, {}); return x && typeof x === 'object' ? x : {}; };
  function storyOf(r) {
    var x = storyX(r), imgs = (x.images && x.images.length ? x.images : (r.hero_image_url ? [r.hero_image_url] : [])).slice();
    return { raw: r, id: r.id, slug: r.slug, title: r.title || '', location: r.location || '', owner: r.application || '', product: r.products_used || '', prod: x.prod || '', subtitle: x.subtitle || r.title || '', years: x.years || '', contractor: x.contractor || '', supplier: x.supplier || '',
      benefits: Array.isArray(x.benefits) ? x.benefits : [], tech: x.tech || [], excerpt: x.excerpt || String(r.challenge_text || '').slice(0, 320), challenge: r.challenge_text || '', solution: r.solution_text || '', file: x.file || '', images: imgs };
  }
  function highlights() {
    get('stories').then(function (rows) {
      var list = rows.filter(live).map(storyOf); if (!list.length) return;
      var host = dropVariants('pm'); if (!host) return;
      var view = 'grid', qs = '';
      function cards() {
        var t = qs.toLowerCase().trim(), grid = view === 'grid';
        var shown = list.filter(function (x) { return !t || (x.title + ' ' + x.location + ' ' + x.excerpt + ' ' + x.product).toLowerCase().indexOf(t) >= 0; });
        return { n: shown.length, html: shown.map(function (x) {
          return '<article class="rg153 rg-hover13" data-href="project-highlight-' + esc(x.slug) + '.html" style="flex-direction:' + (grid ? 'column' : 'row') + '"><div class="rg154" style="width:' + (grid ? '100%' : 'min(30%,200px)') + ';aspect-ratio:' + (grid ? '16/9' : '4/3') + '">' + img(x.images[0], x.title) + '</div><div class="rg155"><div class="rg156"><span class="rg51">' + esc(x.product) + '</span><span class="rg157">·</span><span class="rg158">' + esc(x.location) + '</span></div><h3 class="rg159">' + esc(x.title) + '</h3><p class="rg160">' + esc(x.excerpt) + '</p><span class="rg161">View Project →</span></div></article>';
        }).join('') };
      }
      function grid() { var c = cards(), g = view === 'grid';
        var gb = $('.rg152', host); gb.style.gridTemplateColumns = g ? 'repeat(auto-fill,minmax(min(100%,260px),1fr))' : '1fr'; gb.style.gap = g ? '16px' : '10px'; gb.innerHTML = c.html; $('.rg-empty', host).hidden = c.n > 0; }
      function modes() { return [['grid', '▦'], ['list', '☰']].map(function (m) { var on = m[0] === view; return '<button class="rg150" data-hm="' + m[0] + '" style="background:' + (on ? '#2c2e35' : '#fff') + ';color:' + (on ? '#fff' : '#2c2e35') + '">' + m[1] + '</button>'; }).join(''); }
      host.innerHTML = '<section class="rg144" data-sec-id="sec-highlights-list"><div class="rg145"><label class="rg146"><span class="rg147">⌕</span><input class="rg148" placeholder="Search projects…"></label><div class="rg149">' + modes() + '</div></div><div class="rg151 rg-empty" hidden>No project highlights match this search.</div><div class="rg152"></div></section>';
      grid(); afterDraw();
      host.addEventListener('input', function (e) { if (e.target.matches('.rg148')) { qs = e.target.value; grid(); } });
      host.addEventListener('click', function (e) { var b = e.target.closest('[data-hm]'); if (!b) return; view = b.getAttribute('data-hm'); $('.rg149', host).innerHTML = modes(); grid(); });
    }).catch(fail);
  }

  /* ================================================================= ONE PROJECT HIGHLIGHT (project-highlight-<slug>.html / project-highlight.html?slug=) - the template of every project made in the Dashboard */
  function routeSlug(prefix) {
    var q = /[?&]slug=([^&]+)/.exec(location.search); if (q) return decodeURIComponent(q[1]);
    var m = new RegExp('/' + prefix + '-([^/]+?)\\.html$', 'i').exec(location.pathname); return m ? decodeURIComponent(m[1]) : '';
  }
  var editing = function () { return !!(window.RGCMS && window.RGCMS.editing); };
  var refreshBar = function () { if (window.RGCMS && window.RGCMS.refresh) window.RGCMS.refresh(); };
  var notFoundBar = function (back, what) { return '<section class="rg183"><div class="rg184"><div class="rg185"><h2 class="rg186">' + what + ' not found</h2><p class="rg189">This page does not exist (any more).</p></div></div></section>'; };
  function project() {
    get('stories').then(function (rows) {
      var list = rows.filter(live).map(storyOf); if (!list.length) return;
      var slug = routeSlug('project-highlight'), r = list.filter(function (x) { return x.slug === slug; })[0];
      var host = $('[data-vgroup="pj"]') || $('[data-dyn="pj"]'); if (!host) return;
      if (!r) { host.innerHTML = notFoundBar('project-highlights.html', 'Project'); return; }
      host.removeAttribute('hidden'); host.removeAttribute('style');
      var RGE = window.RGE, m = { subtitle: r.subtitle, location: r.location, owner: r.owner, product: r.product, benefits: r.benefits.slice(), challenge: r.challenge, solution: r.solution, images: r.images.slice(), file: r.file };
      var gi = 0, ts = 0, tab = 'challenge', dirty = false;
      var ce = function (f, multi) { return editing() ? ' contenteditable="true" spellcheck="false" data-pf="' + f + '"' + (multi ? ' data-multi="1"' : '') : ''; };
      function draw() {
        var n = m.images.length; gi = Math.min(gi, Math.max(0, n - 1)); document.title = r.title + ' | Project Highlights | RockGuard® HD';
        var vis = Math.min(3, n); ts = Math.max(0, Math.min(ts, n - vis));
        var thumbs = m.images.slice(ts, ts + vis).map(function (s, k) { var j = ts + k, on = j === gi; return '<button class="rg170 rg-hover15" data-gi="' + j + '" style="outline:3px solid ' + (on ? '#de4228' : 'transparent') + ';opacity:' + (on ? 1 : 0.7) + '"><img class="rg14" src="' + esc(imgSrc(s)) + '" alt=""></button>'; }).join('');
        var words = (m.product + ' – ' + r.title).split(' '), head = words.slice(0, -1).join(' '), last = words[words.length - 1];
        var tabs = [['challenge', "Client's Challenge"], ['solution', 'RockGuard® Solution']].map(function (t) { var on = t[0] === tab; return '<button class="rg188 rg-hover16" data-ct="' + t[0] + '" style="background:' + (on ? '#de4228' : 'transparent') + ';color:' + (on ? '#fff' : '#2c2e35') + '">' + t[1] + '</button>'; }).join('');
        var ben = m.benefits.map(function (b, i) { return '<div class="rg180"><span class="rg181">✓</span><span' + (editing() ? ' contenteditable="true" spellcheck="false" data-pb="' + i + '"' : '') + '>' + esc(b) + '</span>' + (editing() ? '<button type="button" class="app-x rl-ctl" data-pa="rmben" data-i="' + i + '" style="position:static;margin-left:8px">×</button>' : '') + '</div>'; }).join('');
        host.innerHTML =
          '<section class="rg165" data-sec-id="sec-project-gallery"><div class="rg166"><div class="rg167"><button class="rg168 rg-hover9" data-up aria-label="Previous photos">▲</button><div class="rg169">' + thumbs + '</div><button class="rg168 rg-hover9" data-down aria-label="More photos">▼</button></div>' +
          '<div class="rg171">' + img(m.images[gi], r.title) + '<button class="rg172 rg-hover6" data-gi="prev" aria-label="Previous photo">‹</button><button class="rg173 rg-hover6" data-gi="next" aria-label="Next photo">›</button>' +
          (editing() ? '<div class="rl-ctl" style="position:absolute;left:12px;bottom:12px;z-index:6;display:flex;gap:8px"><button type="button" class="dyn-photo" style="position:static" data-pa="photo">📷 Change this photo</button><button type="button" class="dyn-photo" style="position:static" data-pa="addimg">＋ Add photo</button>' + (m.images.length ? '<button type="button" class="dyn-photo" style="position:static;background:#de4228" data-pa="rmimg" data-i="' + gi + '">🗑 Remove this photo</button>' : '') + '</div>' : '') + '</div></div>' +
          '<div class="rg174"><div class="rg175"><span class="rg176"' + ce('product') + '>' + esc(m.product) + '</span><span class="rg158">Case Study · <span' + ce('location') + '>' + esc(m.location) + '</span></span></div><h1 class="rg177"' + ce('subtitle') + '>' + esc(m.subtitle) + '</h1>' +
          '<div class="rg178"><div><strong class="rg44">Owner:</strong> <span' + ce('owner') + '>' + esc(m.owner) + '</span></div><div><strong class="rg44">Products Used:</strong> ' + esc(m.product) + '</div></div>' +
          '<div class="rg179">' + ben + '</div>' + (editing() ? '<div class="rl-ctl"><button type="button" class="dyn-add" data-pa="addben">＋ Add benefit</button></div>' : '') +
          (m.file || editing() ? '<a class="rg182 rg-hover9" href="' + esc(m.file || '#') + '" target="_blank" rel="noopener">Download Project Highlight</a>' : '') + (editing() ? '<div class="rl-ctl" style="margin-top:10px"><button type="button" class="dyn-add" data-pa="file">🔗 Set the PDF / link of this button</button></div>' : '') + '</div></section>' +
          '<section class="rg183" data-sec-id="sec-project-case"><div class="rg184"><div class="rg185"><h2 class="rg186">' + esc(head) + ' <span class="rg41">' + esc(last) + '</span></h2><div class="rg187">' + tabs + '</div><p class="rg189" style="white-space:pre-line"' + ce(tab === 'challenge' ? 'challenge' : 'solution', true) + '>' + esc(tab === 'challenge' ? m.challenge : m.solution) + '</p></div></div></section>';
        afterDraw();
      }
      var bg = $('section.rg-hero > img.rg-herobg'); if (bg && m.images[0]) bg.setAttribute('src', imgSrc(m.images[0]));   // then a saved banner photo (CMS key) is applied over it by js/cms.js
      var mark = function () { dirty = true; refreshBar(); };
      host.addEventListener('click', function (e) {
        var pa = e.target.closest('[data-pa]');
        if (pa && editing()) {
          e.preventDefault(); e.stopImmediatePropagation(); var a = pa.getAttribute('data-pa'), i = parseInt(pa.getAttribute('data-i'), 10);
          if (a === 'rmimg') { m.images.splice(i, 1); mark(); draw(); }
          else if (a === 'rmben') { m.benefits.splice(i, 1); mark(); draw(); }
          else if (a === 'addben') { m.benefits.push('New benefit'); mark(); draw(); }
          else if (a === 'photo' || a === 'addimg') RGE.pickFile('image/*').then(function (file) { if (!file) return; pa.textContent = 'Uploading…'; return RGE.upload(file, 'projects').then(function (u) { if (a === 'addimg' || !m.images.length) { m.images.push(u); gi = m.images.length - 1; } else m.images[gi] = u; mark(); draw(); }); }).catch(function (err) { window.RGDialog.alert(err.message, { title: 'Upload failed', danger: true }); draw(); });
          else if (a === 'file') RGE.fileLink({ title: 'Project highlight PDF / link', url: m.file, accept: '.pdf,application/pdf', folder: 'projects', hint: 'What the "Download Project Highlight" button opens.' }).then(function (x) { if (!x) return; m.file = x.clear ? '' : x.url; mark(); draw(); });
          return;
        }
        var g = e.target.closest('[data-gi]'), c = e.target.closest('[data-ct]'), n = m.images.length || 1;
        if (g) { var v = g.getAttribute('data-gi'); gi = v === 'prev' ? (gi - 1 + n) % n : v === 'next' ? (gi + 1) % n : parseInt(v, 10); if (gi < ts) ts = gi; if (gi >= ts + 3) ts = gi - 2; draw(); }
        else if (c) { tab = c.getAttribute('data-ct'); draw(); }
        else if (e.target.closest('[data-up]')) { ts--; draw(); }
        else if (e.target.closest('[data-down]')) { ts++; draw(); }
      }, true);
      host.addEventListener('input', function (e) {
        if (!editing()) return; var t = e.target.closest && e.target.closest('[data-pf],[data-pb]'); if (!t) return;
        var v = (t.hasAttribute('data-multi') ? t.innerText : t.textContent).split(String.fromCharCode(160)).join(' ');
        if (t.hasAttribute('data-pb')) m.benefits[parseInt(t.getAttribute('data-pb'), 10)] = v; else m[t.getAttribute('data-pf')] = v;
        mark();
      });
      host.addEventListener('keydown', function (e) { if (editing() && e.key === 'Enter' && e.target.closest && e.target.closest('[data-pf]:not([data-multi]),[data-pb]')) e.preventDefault(); });
      host.addEventListener('paste', function (e) { var t = e.target.closest && e.target.closest('[data-pf],[data-pb]'); if (!editing() || !t) return; e.preventDefault(); var txt = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t.hasAttribute('data-multi') ? txt : txt.replace(/\s*\n\s*/g, ' ')); });
      function save() {
        var keep = storyX(r.raw), body = { location: m.location, application: m.owner, products_used: m.product, hero_image_url: m.images[0] || '', challenge_text: m.challenge, solution_text: m.solution, project_benefits: m.benefits.filter(Boolean).join(', '),
          result_text: JSON.stringify(Object.assign({}, keep, { images: m.images.filter(Boolean), file: m.file || '', subtitle: m.subtitle, benefits: m.benefits.map(function (b) { return String(b).trim(); }).filter(Boolean) })) };
        return RGE.api('PATCH', 'stories/' + r.id, body).then(function () { var l = {}; l[r.title] = 'Updated'; return RGE.pending ? null : RGE.history('stories', l); }).then(function () { dirty = false; refreshBar(); return 1; });
      }
      if (window.RGCMS && window.RGCMS.registerHook) window.RGCMS.registerHook('project', { count: function () { return dirty ? 1 : 0; }, run: save });
      document.addEventListener('rg-edit-mode', function () { draw(); afterDraw(); });
      draw(); afterDraw();
    }).catch(fail);
  }

  /* ================================================================= BLOG POST / WEBINAR (blog-<slug>.html, webinar-<slug>.html) - the templates of the resources of that type
   * The description of a resource holds two texts: "[product:<slug>] short text" (the card on the Resources page) and, after a line "[page]", the text of its own page. */
  var isArt = function (t) { return t === 'Blog Post' || t === 'Webinar'; };
  var slugify = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); };
  var splitDesc = function (text, type) {
    text = String(text || ''); var m = /(^|\n)[ \t]*\[page\][ \t]*(\n|$)/.exec(text);
    if (m) return { desc: text.slice(0, m.index).trim(), body: text.slice(m.index + m[0].length).trim() };
    return isArt(type) ? { desc: '', body: text.trim() } : { desc: text.trim(), body: '' };
  };
  var PHONE_RE = /\[phone:([^\]]+)\]/i;
  var CTALBL_RE = /\[ctalabel:([^\]]+)\]/i;
  function articleOf(r) {
    var p = PROD_RE.exec(r.description || ''), sp = splitDesc(String(r.description || '').replace(PROD_RE, ''), r.document_type);
    var ph = PHONE_RE.exec(r.description || ''), cl = CTALBL_RE.exec(r.description || '');
    return { id: r.id, title: r.title || '', type: r.document_type || '', slug: slugify(r.title), product: p ? p[1] : 'all', desc: sp.desc, body: sp.body, file: r.file_url || '', thumb: r.thumbnail_url || '', date: r.published_date || '', phone: ph ? ph[1].trim() : '1-800-848-4500', ctaLabel: cl ? cl[1].trim() : '' };
  }
  // the text typed in the page (plain text) -> paragraphs; a short first line of a block = sub-heading; lines starting with "• " / "- " = a list (numbered cards); [image: url | caption] = a picture
  function fmtArticle(t, cards) {
    return String(t || '').split(/\n\s*\n/).map(function (blk) {
      var ls = blk.split('\n').map(function (l) { return l.replace(/\s+$/, ''); }).filter(function (l) { return l.trim(); }), out = '';
      if (!ls.length) return '';
      if (ls.length > 1 && ls[0].length <= 70 && !/[.:;!?]$/.test(ls[0].trim()) && !/^\s*([•\-*]|\d+[.)])\s/.test(ls[0]) && !/^\s*\[image:/i.test(ls[0])) { out += '<h3 class="art-h">' + esc(ls.shift().trim()) + '</h3>'; }
      var para = [], list = [], flush = function () { if (para.length) out += '<p>' + para.join('<br>') + '</p>'; if (list.length) out += '<ul>' + list.join('') + '</ul>'; para = []; list = []; };
      ls.forEach(function (l) {
        var im = /^\s*\[image:\s*([^\]|]+?)\s*(?:\|\s*([^\]]*?)\s*)?\]\s*$/i.exec(l);
        if (im) {   // a picture inside the text: only own images (/images/..., images/...) or https links
          if (!/^(\/?images\/|\/|https:\/\/)/i.test(im[1]) || /^\s*javascript:/i.test(im[1])) return;
          flush(); out += '<figure class="art-fig"><img src="' + esc(imgSrc(im[1])) + '" alt="' + esc(im[2] || '') + '" loading="lazy">' + (im[2] ? '<figcaption>' + esc(im[2]) + '</figcaption>' : '') + '</figure>'; return;
        }
        var m = /^\s*(?:[•\-*]|\d+[.)])\s+(.*)$/.exec(l);
        if (m) { if (para.length) { out += '<p>' + para.join('<br>') + '</p>'; para = []; } var tx = m[1], k = cards ? tx.indexOf(':') : -1; list.push('<li>' + (k > 0 && k <= 48 ? '<strong>' + esc(tx.slice(0, k)) + '</strong> ' + esc(tx.slice(k + 1).trim().replace(/^./, function (c) { return c.toUpperCase(); })) : esc(tx)) + '</li>'); }
        else { if (list.length) { out += '<ul>' + list.join('') + '</ul>'; list = []; } para.push(esc(l.trim())); }
      });
      flush(); return out;
    }).join('');
  }
  function articleRef(kind) {
    var type = kind === 'blog' ? 'Blog Post' : 'Webinar', host = $('[data-dyn="art"]'); if (!host) return;
    Promise.all([get('resources?all=true'), loadProducts()]).then(function (res) {
      var list = res[0].filter(live).map(articleOf), slug = routeSlug(kind), r = list.filter(function (x) { return x.type === type && x.slug === slug; })[0];
      host.removeAttribute('style');
      if (!r) { host.innerHTML = notFoundBar('resources.html', kind === 'blog' ? 'Blog post' : 'Webinar'); return; }
      var RGE = window.RGE, m = { title: r.title, body: r.body, thumb: r.thumb, phone: r.phone, ctaLabel: r.ctaLabel, product: r.product || 'all', date: r.date || '' }, dirty = false;
      var ce = function (f) { return editing() ? ' contenteditable="true" spellcheck="false" data-af="' + f + '"' + (f === 'body' ? ' data-multi="1"' : '') : ''; };
      var blog = kind === 'blog';
      function draw() {
        document.title = m.title + ' | Resources | RockGuard® HD';
        var cover = m.thumb || 'images/IMG_0097_crop.webp', words = String(m.body || '').split(/\s+/).filter(Boolean).length, mins = Math.max(1, Math.round(words / 200));
        var d = m.date ? new Date(m.date) : null, when = d && !isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : (m.date || '');
        var curProd = m.product || r.product || 'all';
        var pname = curProd === 'all' ? 'All Products' : (prodTitle(curProd) || curProd);
        var photo = function (label) { return editing() ? '<button type="button" class="dyn-photo rl-ctl" data-aa="photo" style="z-index:6">📷 ' + label + '</button>' : ''; };
        var hero = '<section class="wb-hero" data-sec-id="sec-article-hero"><img class="rg14" src="' + esc(imgSrc(cover)) + '" alt=""><div class="rg15"></div><div class="wb-in"><span class="wb-pill"><i></i>' + (blog ? 'Blog Post' : 'Webinar') + '</span><h1 class="wb-h1"' + ce('title') + '>' + esc(m.title) + '</h1><div class="wb-crumb"><a href="index.html">Home</a> / <a href="resources.html">Resources</a> / <span>' + esc(m.title) + '</span></div>' +
          (blog ? '<div class="bl-meta">' + (when ? esc(when) + ' · ' : '') + mins + ' min read</div>' : '') + (editing() ? '<div style="margin-top:16px;position:relative">' + photo('Cover photo') + '</div>' : '') + '</div></section>';
        var prodCell = editing()
          ? '<span contenteditable="true" spellcheck="false" data-af="productName" title="Click to edit product name" style="cursor:text">' + esc(pname) + '</span>' +
            '<select data-af="productSelect" style="margin-left:6px;font-family:inherit;font-size:11px;padding:2px 4px;border:1px solid #ccc;border-radius:3px;background:#fafafa;color:#2c2e35;cursor:pointer" title="Or select from product list">' +
              '<option value="">Select...</option>' +
              '<option value="all"' + (curProd === 'all' ? ' selected' : '') + '>All Products</option>' +
              prods.map(function (p) { return '<option value="' + esc(p.slug) + '"' + (curProd === p.slug ? ' selected' : '') + '>' + esc(p.title) + '</option>'; }).join('') +
            '</select>'
          : esc(pname);
        var postedCell = editing()
          ? '<span contenteditable="true" spellcheck="false" data-af="date" title="Click to edit date (e.g. October 24, 2026)" style="cursor:text">' + esc(when || 'October 24, 2026') + '</span>'
          : esc(when);
        var phoneNum = m.phone || '1-800-848-4500';
        var phoneCell = editing()
          ? '<span contenteditable="true" spellcheck="false" data-af="phone" style="color:#de4228;cursor:text" title="Click to edit phone number">' + esc(phoneNum) + '</span>'
          : '<a href="tel:+1' + phoneNum.replace(/\D/g, '') + '">' + esc(phoneNum) + '</a>';
        var rows = [['Product', prodCell], ['Posted', postedCell], blog ? ['Reading time', mins + ' min'] : ['Questions?', phoneCell]].filter(function (x) { return x[1]; }).map(function (x) { return '<div><dt>' + x[0] + '</dt><dd>' + x[1] + '</dd></div>'; }).join('');
        var defCtaLabel = blog
          ? (curProd && curProd !== 'all' && prodByKey(curProd) ? 'More about ' + esc(pname) + ' →' : 'More resources →')
          : (r.file ? 'Watch / Register →' : 'Contact us to register →');
        var defCtaHref = blog
          ? (curProd && curProd !== 'all' && prodByKey(curProd) ? 'resources.html?prod=' + encodeURIComponent(curProd) : 'resources.html')
          : (r.file ? r.file : 'contact.html');
        var ctaLabel = m.ctaLabel || defCtaLabel;
        var ctaHref = r.file || defCtaHref;
        var ctaExtra = !blog && r.file && /^https?:/i.test(r.file) ? ' target="_blank" rel="noopener"' : '';
        var cta;
        if (editing()) {
          cta = '<div class="wb-cta" style="cursor:default" title="Click button text to edit">' +
            '<span contenteditable="true" spellcheck="false" data-af="ctaLabel" style="outline:2px dashed rgba(255,255,255,.8);outline-offset:3px;display:inline-block;cursor:text;color:#fff!important" title="Click to edit button text">' + esc(ctaLabel) + '</span>' +
            '</div>' +
            '<div class="rl-ctl" style="margin-top:8px;display:flex;align-items:center;justify-content:center;gap:8px">' +
            '<button type="button" class="dyn-photo" style="position:static;font-size:11px;padding:4px 10px;cursor:pointer" data-aa="ctafile">🔗 Set CTA link' + (r.file ? ' (File linked)' : ' (Contact page)') + '</button>' +
            '</div>';
        } else {
          cta = '<a href="' + esc(ctaHref) + '"' + ctaExtra + ' class="wb-cta">' + esc(ctaLabel) + '</a>';
        }
        var side = '<aside class="wb-side"><div class="wb-card">' + (blog ? '' : '<div class="wb-img"><img src="' + esc(imgSrc(cover)) + '" alt="' + esc(m.title) + '">' + photo('Change photo') + '</div>') + '<div class="wb-body"><span class="wb-badge">' + (blog ? 'Blog Post' : 'Webinar') + '</span><dl class="wb-dl">' + rows + '</dl>' + cta + '</div></div>' +
          '<div class="bl-help"><b>Need specifications or installation support?</b><span>Talk to the RockGuard® team.</span><a href="contact.html">Contact us →</a></div></aside>';
        var ins = editing() ? '<div class="art-ins rl-ctl"><button type="button" class="dyn-add" data-aa="ins">＋ Insert image in the text</button><span>The picture is put where the cursor is in the text below (or at the end). It is a line like [image: /images/photo.webp | caption].</span></div>' : '';
        var text = '<div class="wb-main">' + ins + (blog ? '<figure class="bl-fig"><img src="' + esc(imgSrc(cover)) + '" alt="' + esc(m.title) + '">' + photo('Change photo') + '</figure>' : '') +
          '<div class="art' + (editing() ? ' ed-multi' : ' art-cards') + '" style="font-size:18px;line-height:1.8;min-height:60px"' + ce('body') + '>' + (editing() ? esc(m.body) : fmtArticle(m.body, true)) + '</div></div>';
        host.innerHTML = hero + '<section class="wb-sec" data-sec-id="sec-article-body"><div class="wb-wrap">' + text + side + '</div></section>';
        afterDraw();
      }
      var mark = function () { dirty = true; refreshBar(); };
      host.addEventListener('click', function (e) {
        var b = e.target.closest('[data-aa]'); if (!b || !editing()) return; e.preventDefault(); e.stopImmediatePropagation();
        var aa = b.getAttribute('data-aa');
        if (aa === 'photo') {
          RGE.pickFile('image/*').then(function (file) { if (!file) return; b.textContent = 'Uploading…'; return RGE.upload(file, 'resources').then(function (u) { m.thumb = u; mark(); draw(); }); }).catch(function (err) { window.RGDialog.alert(err.message, { title: 'Upload failed', danger: true }); draw(); });
        } else if (aa === 'ctafile') {
          RGE.fileLink({ title: 'CTA button link', url: r.file, accept: '.pdf,application/pdf,video/*', folder: 'resources', hint: 'The URL the CTA button opens (leave blank for Contact page).' }).then(function (x) { if (!x) return; r.file = x.clear ? '' : x.url; mark(); draw(); });
        } else {
          var box = host.querySelector('[data-af="body"]'); if (!box) return;
          RGE.pickFile('image/*').then(function (file) {
            if (!file) return; b.textContent = 'Uploading…';
            return RGE.upload(file, 'resources').then(function (url) {
              box.focus(); var sel = window.getSelection();
              if (!sel.rangeCount || !box.contains(sel.anchorNode)) { var rg = document.createRange(); rg.selectNodeContents(box); rg.collapse(false); sel.removeAllRanges(); sel.addRange(rg); }
              document.execCommand('insertText', false, '\n\n[image: ' + url + ' | ]\n\n'); b.textContent = '＋ Insert image in the text'; m.body = box.innerText; mark();
            });
          }).catch(function (err) { window.RGDialog.alert(err.message, { title: 'Upload failed', danger: true }); b.textContent = '＋ Insert image in the text'; });
        }
      }, true);
      host.addEventListener('input', function (e) {
        if (!editing()) return; var t = e.target.closest && e.target.closest('[data-af]'); if (!t) return;
        var af = t.getAttribute('data-af'); if (af === 'productSelect') return;
        var val = (t.hasAttribute('data-multi') ? t.innerText : t.textContent).split(String.fromCharCode(160)).join(' ');
        if (af === 'productName') {
          var trimmed = val.trim().toLowerCase();
          var match = prods.filter(function (x) { return x.title.toLowerCase() === trimmed || x.slug.toLowerCase() === trimmed; })[0];
          if (match) m.product = match.slug;
          else if (trimmed === 'all products' || trimmed === 'all') m.product = 'all';
          else m.product = val.trim();
        } else if (af === 'date') {
          m.date = val.trim();
        } else {
          m[af] = val;
        }
        mark();
      });
      host.addEventListener('change', function (e) {
        if (!editing()) return; var sel = e.target.closest && e.target.closest('[data-af="productSelect"]'); if (!sel) return;
        if (sel.value) {
          m.product = sel.value;
          var name = sel.value === 'all' ? 'All Products' : (prodTitle(sel.value) || sel.value);
          var pspan = host.querySelector('[data-af="productName"]');
          if (pspan) pspan.textContent = name;
          mark();
        }
      });
      host.addEventListener('keydown', function (e) { if (editing() && e.key === 'Enter' && e.target.closest && e.target.closest('[data-af]:not([data-multi])')) e.preventDefault(); });
      host.addEventListener('paste', function (e) { var t = e.target.closest && e.target.closest('[data-af]'); if (!editing() || !t) return; e.preventDefault(); var txt = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t.hasAttribute('data-multi') ? txt : txt.replace(/\s*\n\s*/g, ' ')); });
      function save() {
        var prodKey = m.product || r.product || 'all';
        var meta = '[product:' + prodKey + ']';
        if (m.phone && m.phone.trim() !== '1-800-848-4500') meta += ' [phone:' + m.phone.trim() + ']';
        if (m.ctaLabel && m.ctaLabel.trim()) meta += ' [ctalabel:' + m.ctaLabel.trim() + ']';
        var cleanDesc = String(r.desc || '').replace(PHONE_RE, '').replace(CTALBL_RE, '').trim();
        var desc = meta + (cleanDesc ? ' ' + cleanDesc : '');
        var body = { title: m.title, description: desc + (m.body.trim() ? '\n\n[page]\n\n' + m.body.trim() : ''), thumbnail_url: m.thumb, file_url: r.file || '' };
        if (m.date) { var parsed = new Date(m.date); body.published_date = !isNaN(parsed.getTime()) ? parsed.toISOString() : m.date; }
        return RGE.api('PATCH', 'resources/' + r.id, body).then(function () { var l = {}; l[m.title] = 'Updated'; return RGE.pending ? null : RGE.history('resources', l); }).then(function () { dirty = false; refreshBar(); return 1; });
      }
      if (window.RGCMS && window.RGCMS.registerHook) window.RGCMS.registerHook('article', { count: function () { return dirty ? 1 : 0; }, run: save });
      document.addEventListener('rg-edit-mode', function () { draw(); });
      draw();
    }).catch(fail);
  }

  /* ================================================================= ONE SOLUTION (product-detail-<slug>.html / solution-reference.html?slug=) - the template of every solution made in the Dashboard */
  function solutionRef() {
    var m0 = /product-detail-([^\/]+?)\.html$/i.exec(location.pathname), q = /[?&]slug=([^&]+)/.exec(location.search), slug = q ? decodeURIComponent(q[1]) : m0 ? decodeURIComponent(m0[1]) : '';
    var host = $('[data-dyn="sol"]'); if (!host) return;
    loadProducts(slug).then(function () {
      var p = prods.filter(function (x) { return x.slug === slug; })[0];
      if (!p) { host.innerHTML = '<section class="rg80" data-sec-id="sec-product-hero"><div class="rg81"><div class="rg82"><span class="rg18"></span>RockGuard® HD | Products</div><h1 class="rg83">Product <span class="rg41">not found</span></h1><div class="rg84"><button class="rg85 rg-hover8" data-href="products.html" style="background:#f5ebdd;color:#2c2e35">All Products</button></div></div></section>'; return; }
      host.removeAttribute('style');
      var m = pm(p), spage = 'product-detail-' + p.slug;
      var sf = function (attr) { return pe(m, attr); };
      function draw() {
        document.title = m.title + ' | Products | RockGuard® HD';
        var lead = m.lead || m.summary, ds = m.downloads[0] ? m.downloads[0][1] : '';
        var feats = m.features.map(function (f, i) {
          return '<div class="rg107 rg-hover10"><div class="rg108"><span class="rg109">' + pad2(i + 1) + '</span><span class="rg110"></span></div><h4 class="rg111"' + sf('data-sf="f" data-i="' + i + '" data-j="0"') + '>' + esc(f[0]) + '</h4>' +
            (f[1] || editing() ? '<p class="rg112"' + sf('data-sf="f" data-i="' + i + '" data-j="1"') + '>' + esc(f[1]) + '</p>' : '') + (editing() ? '<button type="button" class="app-x rl-ctl" data-sa="rmf" data-slug="' + esc(m.slug) + '" data-i="' + i + '" title="Remove this feature" style="position:static;margin-top:10px">×</button>' : '') + '</div>';
        }).join('');
        var dls = m.downloads.map(function (d, i) {
          var ext = d[3] || extOf(d[1]), tagOpen = editing() ? 'div' : 'a href="' + esc(d[1] || '#') + '" target="_blank" rel="noopener"', tagClose = editing() ? 'div' : 'a';
          return '<' + tagOpen + ' class="rg133 rg-hover12"><div class="rg134"><span class="rg135"' + sf('data-sf="d" data-i="' + i + '" data-j="2"') + '>' + esc(d[2]) + '</span><span class="rg136">' + esc(ext) + '</span></div><h4 class="rg137"' + sf('data-sf="d" data-i="' + i + '" data-j="0"') + '>' + esc(d[0]) + '</h4><div class="rg138"><span class="rg139">' + esc(m.title) + '</span><span class="rg140">↓</span></div>' +
            (editing() ? '<div class="rl-ctl" style="display:flex;gap:8px;margin-top:10px"><button type="button" class="dyn-add" data-sa="dlink" data-slug="' + esc(m.slug) + '" data-i="' + i + '">Link / file</button><button type="button" class="app-x" data-sa="rmd" data-slug="' + esc(m.slug) + '" data-i="' + i + '" title="Remove this download" style="position:static">×</button></div>' : '') + '</' + tagClose + '>';
        }).join('');
        host.innerHTML =
          '<section class="rg80 rg-hero" data-sec-id="sec-product-hero">' + heroBg('img-hero-solution', m.image) + '<div class="rg81"><div class="rg82"><span class="rg18"></span>' + T('solution-eyebrow', 'RockGuard® HD | Products') + '</div><h1 class="rg83"' + sf('data-sf="title"') + '>' + esc(m.title) + '</h1><div class="rg84"><button class="rg85 rg-hover8" data-href="products.html" style="background:rgba(255,255,255,.06);color:#d6c6b2">← All Products</button></div></div></section>' +
          '<section class="rg86" data-sec-id="sec-product-detail"><div class="rg87"><div class="rg88" style="position:relative">' + img(m.image, m.title) + pbtn(m, 'dyn-photo', 'photo', '📷 Change photo') + '</div><div><div class="rg92"' + sf('data-sf="tag"') + '>' + esc(m.tag) + '</div><h2 class="rg93">' + esc(m.title) + '</h2>' +
          (lead || editing() ? '<p class="rg94"' + sf('data-sf="lead"') + '>' + esc(m.lead) + '</p>' : '') + (editing() && !m.lead ? '<p class="rg94" style="opacity:.6">(Empty: the summary below is shown instead.)</p>' : '') +
          '<div class="rg98"><button class="rg99 rg-hover9" data-href="contact.html" data-cms="solution-quote-btn" data-cms-type="text" data-cms-link="lnk-solution-quote">Get a Quote</button>' + (ds ? '<a class="rg100 rg-hover7" href="' + esc(ds) + '" target="_blank" rel="noopener">Data Sheet ↓</a>' : '') + '</div>' +
          (editing() ? '<p class="rg206" style="margin-top:18px"><b>Summary</b> (shown on the home card and the Products tab):</p><p class="rg94"' + sf('data-sf="summary"') + '>' + esc(m.summary) + '</p>' : '') + '</div></div></section>' +
          (m.features.length || editing() ? '<section class="rg80" data-sec-id="sec-product-features"><div class="rg101"><div class="rg102"><div><div class="rg103"><span class="rg18"></span>' + esc(m.title) + '</div>' + T('solution-features-title', 'Features &amp; <span class="rg41">Benefits</span>', 'h3', 'rg104') + '</div><div class="rg105">' + pad2(m.features.length) + ' ' + T('solution-advantages', 'Key Advantages') + '</div></div><div class="rg106">' + feats + '</div>' + (editing() ? '<div class="rl-ctl" style="margin-top:20px">' + pbtn(m, 'dyn-add', 'addf', '＋ Add feature') + '</div>' : '') + '</div></section>' : '') +
          (m.downloads.length || editing() ? '<section class="rg114" data-sec-id="sec-product-downloads"><div class="rg115"><div><div class="rg116">' + T('solution-downloads-label', 'Downloads') + '</div><h2 class="rg117">' + esc(m.title) + ' Resources</h2></div></div><div class="rg132">' + dls + '</div>' + (editing() ? '<div class="rl-ctl" style="margin-top:20px">' + pbtn(m, 'dyn-add', 'addd', '＋ Add download') + '</div>' : '') + '</section>' : '');
        afterDraw();
      }
      redrawFns.push(draw); bindProducts(host); document.addEventListener('rg-edit-mode', draw); draw();
    }).catch(fail);
  }

  if (page === 'home') home(); else if (page === 'products') products(); else if (page === 'resources') resources(); else if (page === 'highlights') highlights(); else if (page === 'project') project(); else if (page === 'ref-solution') solutionRef(); else if (page === 'ref-blog') articleRef('blog'); else if (page === 'ref-webinar') articleRef('webinar');
})();
