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
  function get(path) {
    return fetch('/api/v2/' + path, { credentials: 'include', cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  var byOrder = function (a, b) { return (a.display_order || 0) - (b.display_order || 0); };
  var live = function (r) { return r.is_active !== false && r.is_deleted !== true; };
  var json = function (s, d) { try { var j = JSON.parse(s); return j == null ? d : j; } catch (e) { return d; } };
  var imgSrc = function (u) { return String(u || '').replace(/^\//, ''); };   // /images/x.webp -> images/x.webp (the pages live in the site root)
  var img = function (u, alt, extra) { return u ? '<img class="rg14" src="' + esc(imgSrc(u)) + '" alt="' + esc(alt || '') + '" loading="lazy"' + (extra || '') + '>' : ''; };
  var fail = function (e) { if (window.console) console.warn('[rg-content]', e && e.stack || e); };   // the shipped content stays when something goes wrong
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
  function loadProducts() {
    return get('solutions').then(function (rows) {
      var list = rows.filter(live).sort(byOrder);
      return Promise.all(list.map(function (r) {
        return get('page-elements/' + encodeURIComponent('product-detail-' + r.slug)).catch(function () { return []; }).then(function (els) {
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

  /* ================================================================= HOME: the product cards */
  function home() {
    var box = $('.rg52'); if (!box) return;
    loadProducts().then(function () {
      var list = mainProds(); if (!list.length) return;
      box.innerHTML = list.map(function (p) {
        return '<article class="rg53 rg-hover5" data-href="' + esc(p.link || 'products.html?prod=' + p.key) + '"><div class="rg54" style="aspect-ratio:16/9">' + img(p.card, p.title) + '<span class="rg55">' + esc(p.tag) + '</span></div>' +
          '<div class="rg56"><h3 class="rg57">' + esc(p.title) + '</h3><p class="rg58">' + esc(p.summary) + '</p><div class="rg59">Learn More →</div></div></article>';
      }).join('');
    }).catch(fail);
  }

  /* ================================================================= PRODUCTS page */
  function products() {
    loadProducts().then(function () {
      if (!prods.length) return;
      var host = dropVariants('prod'); if (!host) return;
      var q = /[?&]prod=([a-z0-9\-]+)/.exec(location.search), tabs = function () { return mainProds().map(function (p) { return { key: p.key, name: p.title }; }).concat(hasAcc() ? [{ key: 'acc', name: 'Accessories' }] : []); };
      var sel = q && tabs().some(function (t) { return t.key === q[1]; }) ? q[1] : (tabs()[0] || {}).key;
      function draw() {
        var acc = sel === 'acc', p = acc ? null : prodByKey(sel) || mainProds()[0];
        var tabBtns = tabs().map(function (t) { var on = t.key === sel; return '<button class="rg85 rg-hover8" data-pt="' + esc(t.key) + '" style="background:' + (on ? '#f5ebdd' : 'rgba(255,255,255,.06)') + ';color:' + (on ? '#2c2e35' : '#d6c6b2') + '">' + esc(t.name) + '</button>'; }).join('');
        var name, tag, features;
        var left, right;
        if (acc) {
          var items = accProds(); name = 'Accessories'; tag = 'Installation & Jobsite'; features = [];
          items.forEach(function (x) { features = features.concat(x.features); });
          left = '<div class="rg89">' + items.map(function (x, i) { return '<div class="rg90"><img class="rg91" src="' + esc(imgSrc(x.image)) + '" alt="' + esc(x.title) + '" loading="lazy" style="object-fit:' + (i === 0 ? 'contain' : 'cover') + ';padding:' + (i === 0 ? '18px' : '0') + '"></div>'; }).join('') + '</div>';
          right = '<div class="rg95">' + items.map(function (x) { return '<div class="rg96"><p class="rg97"><strong class="rg44">' + esc(x.title) + '</strong> ' + esc(x.accDesc || x.lead) + '</p></div>'; }).join('') + '</div>';
        } else {
          name = p.title; tag = p.tag; features = p.features;
          left = '<div class="rg88">' + img(p.image, p.title) + '</div>';
          right = '<p class="rg94">' + esc(p.lead || p.summary) + '</p>';
        }
        var ds = !acc && p.downloads[0] ? p.downloads[0][1] : '';
        host.innerHTML =
          '<section class="rg80"><div class="rg81"><div class="rg82"><span class="rg18"></span>RockGuard® HD | Products</div><h1 class="rg83">Pipeline Protection <span class="rg41">Products</span></h1><div class="rg84">' + tabBtns + '</div></div></section>' +
          '<section class="rg86"><div class="rg87">' + left + '<div><div class="rg92">' + esc(tag) + '</div><h2 class="rg93">' + esc(name) + '</h2>' + right +
          '<div class="rg98"><button class="rg99 rg-hover9" data-href="contact.html">Get a Quote</button>' + (ds ? '<a class="rg100 rg-hover7" href="' + esc(ds) + '" target="_blank" rel="noopener">Data Sheet ↓</a>' : '') + '</div></div></div></section>' +
          '<section class="rg80"><div class="rg101"><div class="rg102"><div><div class="rg103"><span class="rg18"></span>' + esc(name) + '</div><h3 class="rg104">Features &amp; <span class="rg41">Benefits</span></h3></div><div class="rg105">' + pad2(features.length) + ' Key Advantages</div></div><div class="rg106">' +
          features.map(function (f, i) { return '<div class="rg107 rg-hover10"><div class="rg108"><span class="rg109">' + pad2(i + 1) + '</span><span class="rg110"></span></div><h4 class="rg111">' + esc(f[0]) + '</h4>' + (f[1] ? '<p class="rg112">' + esc(f[1]) + '</p>' : '') + '</div>'; }).join('') + '</div></div></section>';
      }
      host.addEventListener('click', function (e) { var b = e.target.closest('[data-pt]'); if (!b) return; sel = b.getAttribute('data-pt'); draw(); try { history.replaceState(null, '', 'products.html?prod=' + encodeURIComponent(sel)); } catch (x) { } });
      draw();
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
      host.appendChild(sec);
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
      draw();
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
      host.innerHTML = '<section class="rg144"><div class="rg145"><label class="rg146"><span class="rg147">⌕</span><input class="rg148" placeholder="Search projects…"></label><div class="rg149">' + modes() + '</div></div><div class="rg151 rg-empty" hidden>No project highlights match this search.</div><div class="rg152"></div></section>';
      grid();
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
  var notFoundBar = function (back, what) { return '<section class="rg162"><div class="rg163"><button class="rg164 rg-hover14" data-href="' + back + '">← Back</button></div></section><section class="rg183"><div class="rg184"><div class="rg185"><h2 class="rg186">' + what + ' not found</h2><p class="rg189">This page does not exist (any more).</p></div></div></section>'; };
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
        var thumbs = m.images.slice(ts, ts + vis).map(function (s, k) { var j = ts + k, on = j === gi; return '<div style="position:relative"><button class="rg170 rg-hover15" data-gi="' + j + '" style="outline:3px solid ' + (on ? '#de4228' : 'transparent') + ';opacity:' + (on ? 1 : 0.7) + '"><img class="rg14" src="' + esc(imgSrc(s)) + '" alt=""></button>' + (editing() ? '<button type="button" class="app-x rl-ctl" data-pa="rmimg" data-i="' + j + '" title="Remove this photo" style="top:2px;right:2px;z-index:5">×</button>' : '') + '</div>'; }).join('');
        var words = (m.product + ' – ' + r.title).split(' '), head = words.slice(0, -1).join(' '), last = words[words.length - 1];
        var tabs = [['challenge', "Client's Challenge"], ['solution', 'RockGuard® Solution']].map(function (t) { var on = t[0] === tab; return '<button class="rg188 rg-hover16" data-ct="' + t[0] + '" style="background:' + (on ? '#de4228' : 'transparent') + ';color:' + (on ? '#fff' : '#2c2e35') + '">' + t[1] + '</button>'; }).join('');
        var ben = m.benefits.map(function (b, i) { return '<div class="rg180"><span class="rg181">✓</span><span' + (editing() ? ' contenteditable="true" spellcheck="false" data-pb="' + i + '"' : '') + '>' + esc(b) + '</span>' + (editing() ? '<button type="button" class="app-x rl-ctl" data-pa="rmben" data-i="' + i + '" style="position:static;margin-left:8px">×</button>' : '') + '</div>'; }).join('');
        host.innerHTML =
          '<section class="rg162"><div class="rg163"><button class="rg164 rg-hover14" data-href="project-highlights.html">← All Projects</button></div></section>' +
          '<section class="rg165"><div class="rg166"><div class="rg167"><button class="rg168 rg-hover9" data-up aria-label="Previous photos">▲</button><div class="rg169">' + thumbs + '</div><button class="rg168 rg-hover9" data-down aria-label="More photos">▼</button></div>' +
          '<div class="rg171">' + img(m.images[gi], r.title) + '<button class="rg172 rg-hover6" data-gi="prev" aria-label="Previous photo">‹</button><button class="rg173 rg-hover6" data-gi="next" aria-label="Next photo">›</button>' +
          (editing() ? '<div class="rl-ctl" style="position:absolute;left:12px;bottom:12px;z-index:6;display:flex;gap:8px"><button type="button" class="dyn-photo" style="position:static" data-pa="photo">📷 Change this photo</button><button type="button" class="dyn-photo" style="position:static" data-pa="addimg">＋ Add photo</button></div>' : '') + '</div></div>' +
          '<div class="rg174"><div class="rg175"><span class="rg176"' + ce('product') + '>' + esc(m.product) + '</span><span class="rg158">Case Study · <span' + ce('location') + '>' + esc(m.location) + '</span></span></div><h1 class="rg177"' + ce('subtitle') + '>' + esc(m.subtitle) + '</h1>' +
          '<div class="rg178"><div><strong class="rg44">Owner:</strong> <span' + ce('owner') + '>' + esc(m.owner) + '</span></div><div><strong class="rg44">Products Used:</strong> ' + esc(m.product) + '</div></div>' +
          '<div class="rg179">' + ben + '</div>' + (editing() ? '<div class="rl-ctl"><button type="button" class="dyn-add" data-pa="addben">＋ Add benefit</button></div>' : '') +
          (m.file || editing() ? '<a class="rg182 rg-hover9" href="' + esc(m.file || '#') + '" target="_blank" rel="noopener">Download Project Highlight</a>' : '') + (editing() ? '<div class="rl-ctl" style="margin-top:10px"><button type="button" class="dyn-add" data-pa="file">🔗 Set the PDF / link of this button</button></div>' : '') + '</div></section>' +
          '<section class="rg183"><div class="rg184"><div class="rg185"><h2 class="rg186">' + esc(head) + ' <span class="rg41">' + esc(last) + '</span></h2><div class="rg187">' + tabs + '</div><p class="rg189" style="white-space:pre-line"' + ce(tab === 'challenge' ? 'challenge' : 'solution', true) + '>' + esc(tab === 'challenge' ? m.challenge : m.solution) + '</p></div></div></section>';
      }
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
      document.addEventListener('rg-edit-mode', function () { draw(); });
      draw();
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
  function articleOf(r) {
    var p = PROD_RE.exec(r.description || ''), sp = splitDesc(String(r.description || '').replace(PROD_RE, ''), r.document_type);
    return { id: r.id, title: r.title || '', type: r.document_type || '', slug: slugify(r.title), product: p ? p[1] : 'all', desc: sp.desc, body: sp.body, file: r.file_url || '', thumb: r.thumbnail_url || '', date: r.published_date || '' };
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
      var RGE = window.RGE, m = { title: r.title, body: r.body, thumb: r.thumb }, dirty = false;
      var ce = function (f) { return editing() ? ' contenteditable="true" spellcheck="false" data-af="' + f + '"' + (f === 'body' ? ' data-multi="1"' : '') : ''; };
      var d = r.date ? new Date(r.date) : null, when = d && !isNaN(d) ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
      var pname = prodTitle(r.product), blog = kind === 'blog';
      function draw() {
        document.title = m.title + ' | Resources | RockGuard® HD';
        var cover = m.thumb || 'images/IMG_0097_crop.webp', words = String(m.body || '').split(/\s+/).filter(Boolean).length, mins = Math.max(1, Math.round(words / 200));
        var photo = function (label) { return editing() ? '<button type="button" class="dyn-photo rl-ctl" data-aa="photo" style="z-index:6">📷 ' + label + '</button>' : ''; };
        var hero = '<section class="wb-hero"><img class="rg14" src="' + esc(imgSrc(cover)) + '" alt=""><div class="rg15"></div><div class="wb-in"><span class="wb-pill"><i></i>' + (blog ? 'Blog Post' : 'Webinar') + '</span><h1 class="wb-h1"' + ce('title') + '>' + esc(m.title) + '</h1><div class="wb-crumb"><a href="index.html">Home</a> / <a href="resources.html">Resources</a> / <span>' + esc(m.title) + '</span></div>' +
          (blog ? '<div class="bl-meta">' + (when ? esc(when) + ' · ' : '') + mins + ' min read</div>' : '') + (editing() ? '<div style="margin-top:16px;position:relative">' + photo('Cover photo') + '</div>' : '') + '</div></section>';
        var rows = [['Product', pname], ['Posted', when], blog ? ['Reading time', mins + ' min'] : ['Questions?', '<a href="tel:+18008484500">1-800-848-4500</a>']].filter(function (x) { return x[1]; }).map(function (x) { return '<div><dt>' + x[0] + '</dt><dd>' + (x[0] === 'Questions?' ? x[1] : esc(x[1])) + '</dd></div>'; }).join('');
        var cta = blog ? (r.product && r.product !== 'all' && prodByKey(r.product) ? '<a href="resources.html?prod=' + encodeURIComponent(r.product) + '" class="wb-cta">More about ' + esc(pname) + ' →</a>' : '<a href="resources.html" class="wb-cta">More resources →</a>')
          : (r.file ? '<a href="' + esc(r.file) + '"' + (/^https?:/i.test(r.file) ? ' target="_blank" rel="noopener"' : '') + ' class="wb-cta">Watch / Register →</a>' : '<a href="contact.html" class="wb-cta">Contact us to register →</a>');
        var side = '<aside class="wb-side"><div class="wb-card">' + (blog ? '' : '<div class="wb-img"><img src="' + esc(imgSrc(cover)) + '" alt="' + esc(m.title) + '"><span class="wb-play" aria-hidden="true"></span>' + photo('Change photo') + '</div>') + '<div class="wb-body"><span class="wb-badge">' + (blog ? 'Blog Post' : 'Webinar') + '</span><dl class="wb-dl">' + rows + '</dl>' + cta + '</div></div>' +
          '<div class="bl-help"><b>Need specifications or installation support?</b><span>Talk to the RockGuard® team.</span><a href="contact.html">Contact us →</a></div></aside>';
        var ins = editing() ? '<div class="art-ins rl-ctl"><button type="button" class="dyn-add" data-aa="ins">＋ Insert image in the text</button><span>The picture is put where the cursor is in the text below (or at the end). It is a line like [image: /images/photo.webp | caption].</span></div>' : '';
        var text = '<div class="wb-main">' + ins + (blog ? '<figure class="bl-fig"><img src="' + esc(imgSrc(cover)) + '" alt="' + esc(m.title) + '">' + photo('Change photo') + '</figure>' : '') +
          '<div class="art' + (editing() ? ' ed-multi' : ' art-cards') + '" style="font-size:18px;line-height:1.8;min-height:60px"' + ce('body') + '>' + (editing() ? esc(m.body) : fmtArticle(m.body, true)) + '</div></div>';
        host.innerHTML = hero + '<section class="wb-sec"><div class="wb-wrap">' + text + side + '</div></section>';
      }
      var mark = function () { dirty = true; refreshBar(); };
      host.addEventListener('click', function (e) {
        var b = e.target.closest('[data-aa]'); if (!b || !editing()) return; e.preventDefault(); e.stopImmediatePropagation();
        if (b.getAttribute('data-aa') === 'photo') RGE.pickFile('image/*').then(function (file) { if (!file) return; b.textContent = 'Uploading…'; return RGE.upload(file, 'resources').then(function (u) { m.thumb = u; mark(); draw(); }); }).catch(function (err) { window.RGDialog.alert(err.message, { title: 'Upload failed', danger: true }); draw(); });
        else {
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
        m[t.getAttribute('data-af')] = (t.hasAttribute('data-multi') ? t.innerText : t.textContent).split(String.fromCharCode(160)).join(' '); mark();
      });
      host.addEventListener('keydown', function (e) { if (editing() && e.key === 'Enter' && e.target.closest && e.target.closest('[data-af]:not([data-multi])')) e.preventDefault(); });
      host.addEventListener('paste', function (e) { var t = e.target.closest && e.target.closest('[data-af]'); if (!editing() || !t) return; e.preventDefault(); var txt = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t.hasAttribute('data-multi') ? txt : txt.replace(/\s*\n\s*/g, ' ')); });
      function save() {
        var body = { title: m.title, description: '[product:' + r.product + '] ' + r.desc + (m.body.trim() ? '\n\n[page]\n\n' + m.body.trim() : ''), thumbnail_url: m.thumb };
        return RGE.api('PATCH', 'resources/' + r.id, body).then(function () { var l = {}; l[m.title] = 'Updated'; return RGE.pending ? null : RGE.history('resources', l); }).then(function () { dirty = false; refreshBar(); return 1; });
      }
      if (window.RGCMS && window.RGCMS.registerHook) window.RGCMS.registerHook('article', { count: function () { return dirty ? 1 : 0; }, run: save });
      document.addEventListener('rg-edit-mode', function () { draw(); });
      draw();
    }).catch(fail);
  }

  /* ================================================================= ONE SOLUTION (product-detail-<slug>.html / solution-reference.html?slug=) - the template of every solution made in the Dashboard */
  var editing = function () { return !!(window.RGCMS && window.RGCMS.editing); };
  function solutionRef() {
    var m0 = /product-detail-([^\/]+?)\.html$/i.exec(location.pathname), q = /[?&]slug=([^&]+)/.exec(location.search), slug = q ? decodeURIComponent(q[1]) : m0 ? decodeURIComponent(m0[1]) : '';
    var host = $('[data-dyn="sol"]'); if (!host) return;
    var RGE = window.RGE, refresh = function () { if (window.RGCMS && window.RGCMS.refresh) window.RGCMS.refresh(); };
    loadProducts().then(function () {
      var p = prods.filter(function (x) { return x.slug === slug; })[0];
      if (!p) { host.innerHTML = '<section class="rg80"><div class="rg81"><div class="rg82"><span class="rg18"></span>RockGuard® HD | Products</div><h1 class="rg83">Product <span class="rg41">not found</span></h1><div class="rg84"><button class="rg85 rg-hover8" data-href="products.html" style="background:#f5ebdd;color:#2c2e35">All Products</button></div></div></section>'; return; }
      host.removeAttribute('style');
      var m = { id: p.id, title: p.title, tag: p.tag, summary: p.summary, lead: p.lead, image: p.image, features: p.features.map(function (f) { return [f[0] || '', f[1] || '']; }), downloads: p.downloads.map(function (d) { return [d[0] || '', d[1] || '', d[2] || '', d[3] || '']; }) };
      var dirty = {}, spage = 'product-detail-' + p.slug;
      var ce = function (attr) { return editing() ? ' contenteditable="true" spellcheck="false" ' + attr : ''; };
      var btn = function (cls, act, label, extra) { return editing() ? '<button type="button" class="' + cls + '" data-sa="' + act + '"' + (extra || '') + '>' + label + '</button>' : ''; };
      function draw(focus) {
        document.title = m.title + ' | Products | RockGuard® HD';
        var lead = m.lead || m.summary, ds = m.downloads[0] ? m.downloads[0][1] : '';
        var feats = m.features.map(function (f, i) {
          return '<div class="rg107 rg-hover10"><div class="rg108"><span class="rg109">' + pad2(i + 1) + '</span><span class="rg110"></span></div><h4 class="rg111"' + ce('data-sf="f" data-i="' + i + '" data-j="0"') + '>' + esc(f[0]) + '</h4>' +
            (f[1] || editing() ? '<p class="rg112"' + ce('data-sf="f" data-i="' + i + '" data-j="1"') + '>' + esc(f[1]) + '</p>' : '') + (editing() ? '<button type="button" class="app-x" data-sa="rmf" data-i="' + i + '" title="Remove this feature" style="position:static;margin-top:10px">×</button>' : '') + '</div>';
        }).join('');
        var dls = m.downloads.map(function (d, i) {
          var ext = d[3] || extOf(d[1]), tagOpen = editing() ? 'div' : 'a href="' + esc(d[1] || '#') + '" target="_blank" rel="noopener"', tagClose = editing() ? 'div' : 'a';
          return '<' + tagOpen + ' class="rg133 rg-hover12"><div class="rg134"><span class="rg135"' + ce('data-sf="d" data-i="' + i + '" data-j="2"') + '>' + esc(d[2]) + '</span><span class="rg136">' + esc(ext) + '</span></div><h4 class="rg137"' + ce('data-sf="d" data-i="' + i + '" data-j="0"') + '>' + esc(d[0]) + '</h4><div class="rg138"><span class="rg139">' + esc(m.title) + '</span><span class="rg140">↓</span></div>' +
            (editing() ? '<div style="display:flex;gap:8px;margin-top:10px"><button type="button" class="dyn-add" data-sa="dlink" data-i="' + i + '">Link / file</button><button type="button" class="app-x" data-sa="rmd" data-i="' + i + '" title="Remove this download" style="position:static">×</button></div>' : '') + '</' + tagClose + '>';
        }).join('');
        host.innerHTML =
          '<section class="rg80"><div class="rg81"><div class="rg82"><span class="rg18"></span>RockGuard® HD | Products</div><h1 class="rg83"' + ce('data-sf="title"') + '>' + esc(m.title) + '</h1><div class="rg84"><button class="rg85 rg-hover8" data-href="products.html" style="background:rgba(255,255,255,.06);color:#d6c6b2">← All Products</button></div></div></section>' +
          '<section class="rg86"><div class="rg87"><div class="rg88" style="position:relative">' + img(m.image, m.title) + btn('dyn-photo', 'photo', '📷 Change photo') + '</div><div><div class="rg92"' + ce('data-sf="tag"') + '>' + esc(m.tag) + '</div><h2 class="rg93">' + esc(m.title) + '</h2>' +
          (lead || editing() ? '<p class="rg94"' + ce('data-sf="lead"') + '>' + esc(m.lead) + '</p>' : '') + (editing() && !m.lead ? '<p class="rg94" style="opacity:.6">(Empty: the summary below is shown instead.)</p>' : '') +
          '<div class="rg98"><button class="rg99 rg-hover9" data-href="contact.html">Get a Quote</button>' + (ds ? '<a class="rg100 rg-hover7" href="' + esc(ds) + '" target="_blank" rel="noopener">Data Sheet ↓</a>' : '') + '</div>' +
          (editing() ? '<p class="rg206" style="margin-top:18px"><b>Summary</b> (shown on the home card and the Products tab):</p><p class="rg94"' + ce('data-sf="summary"') + '>' + esc(m.summary) + '</p>' : '') + '</div></div></section>' +
          (m.features.length || editing() ? '<section class="rg80"><div class="rg101"><div class="rg102"><div><div class="rg103"><span class="rg18"></span>' + esc(m.title) + '</div><h3 class="rg104">Features &amp; <span class="rg41">Benefits</span></h3></div><div class="rg105">' + pad2(m.features.length) + ' Key Advantages</div></div><div class="rg106">' + feats + '</div>' + (editing() ? '<div style="margin-top:20px">' + btn('dyn-add', 'addf', '＋ Add feature') + '</div>' : '') + '</div></section>' : '') +
          (m.downloads.length || editing() ? '<section class="rg114"><div class="rg115"><div><div class="rg116">Downloads</div><h2 class="rg117">' + esc(m.title) + ' Resources</h2></div></div><div class="rg132">' + dls + '</div>' + (editing() ? '<div style="margin-top:20px">' + btn('dyn-add', 'addd', '＋ Add download') + '</div>' : '') + '</section>' : '');
        if (focus) { var f = $(focus, host); if (f) { f.focus(); try { var r = document.createRange(); r.selectNodeContents(f); r.collapse(false); var s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) { /* ignore */ } } }
      }
      var mark = function (k) { dirty[k] = 1; refresh(); };
      host.addEventListener('input', function (e) {
        if (!editing()) return; var t = e.target.closest && e.target.closest('[data-sf]'); if (!t) return; var f = t.getAttribute('data-sf'), v = t.textContent.split(String.fromCharCode(160)).join(' '), i = parseInt(t.getAttribute('data-i'), 10), j = parseInt(t.getAttribute('data-j'), 10);
        if (f === 'f') { m.features[i][j] = v; mark('features'); } else if (f === 'd') { m.downloads[i][j] = v; mark('downloads'); } else { m[f] = v; mark(f === 'title' || f === 'tag' || f === 'summary' ? 'row' : f); }
      });
      host.addEventListener('keydown', function (e) { if (editing() && e.key === 'Enter' && e.target.closest && e.target.closest('[data-sf][contenteditable]')) e.preventDefault(); });
      host.addEventListener('paste', function (e) { var t = e.target.closest && e.target.closest('[data-sf][contenteditable]'); if (!editing() || !t) return; e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\s*\n\s*/g, ' ')); });
      host.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-sa]'); if (!b || !editing()) return; e.preventDefault(); e.stopPropagation();
        var a = b.getAttribute('data-sa'), i = parseInt(b.getAttribute('data-i'), 10);
        if (a === 'addf') { m.features.push(['', '']); mark('features'); draw('[data-sf="f"][data-i="' + (m.features.length - 1) + '"][data-j="0"]'); }
        else if (a === 'rmf') { m.features.splice(i, 1); mark('features'); draw(); }
        else if (a === 'addd') { m.downloads.push(['New download', '', 'Data Sheet', '']); mark('downloads'); draw(); }
        else if (a === 'rmd') { m.downloads.splice(i, 1); mark('downloads'); draw(); }
        else if (a === 'dlink') { RGE.fileLink({ title: 'Download link', url: m.downloads[i][1], accept: '.pdf,.docx,application/pdf', folder: 'resources', hint: 'The file this download opens: paste a link or upload a PDF / Word file.' }).then(function (r) { if (!r) return; m.downloads[i][1] = r.clear ? '' : r.url; m.downloads[i][3] = ''; mark('downloads'); draw(); }); }
        else if (a === 'photo') { RGE.pickFile('image/*').then(function (file) { if (!file) return; b.textContent = 'Uploading…'; return RGE.upload(file, 'solutions').then(function (u) { m.image = u; mark('image'); draw(); }); }).catch(function (err) { RGDialog.alert(err.message, { title: 'Upload failed', danger: true }); draw(); }); }
      });
      function save() {
        var keys = Object.keys(dirty), log = {}, pr = Promise.resolve(), n = 0;
        if (dirty.row) pr = pr.then(function () { return RGE.api('PATCH', 'solutions/' + m.id, { title: m.title, category: m.tag, short_description: m.summary }); }).then(function () { n++; });
        var el = { lead: ['prod-lead', 'text', m.lead], image: ['prod-image', 'image', m.image], features: ['prod-features', 'text', JSON.stringify(m.features.filter(function (f) { return f[0].trim() || f[1].trim(); }))], downloads: ['prod-downloads', 'text', JSON.stringify(m.downloads.filter(function (d) { return d[0].trim() || d[1].trim(); }))] };
        Object.keys(el).forEach(function (k) { if (!dirty[k]) return; pr = pr.then(function () { return RGE.api('POST', 'page-elements', { page_slug: spage, element_id: el[k][0], content_type: el[k][1], content_value: el[k][2] }); }).then(function () { n++; }); });
        keys.forEach(function (k) { log[m.title + ' · ' + (k === 'row' ? 'title / tag / summary' : k)] = 'Updated'; });
        return pr.then(function () { return RGE.pending ? null : RGE.history('solutions', log); }).then(function () { dirty = {}; refresh(); return n; });
      }
      if (window.RGCMS && window.RGCMS.registerHook) window.RGCMS.registerHook('solution', { count: function () { return Object.keys(dirty).length; }, run: save });
      document.addEventListener('rg-edit-mode', function () { draw(); });
      draw();
    }).catch(fail);
  }

  if (page === 'home') home(); else if (page === 'products') products(); else if (page === 'resources') resources(); else if (page === 'highlights') highlights(); else if (page === 'project') project(); else if (page === 'ref-solution') solutionRef(); else if (page === 'ref-blog') articleRef('blog'); else if (page === 'ref-webinar') articleRef('webinar');
})();
