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
    var host = document.createElement('div'); host.setAttribute('data-dyn', group); host.style.display = 'contents';
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
      var list = rows.map(function (r) { var m = PROD_RE.exec(r.description || ''); return { title: r.title || '', type: r.document_type || '', product: m ? m[1] : 'all', file: r.file_url || '', ext: extOf(r.file_url || '') }; });
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
        $('.rg132', sec).innerHTML = shown.map(function (r) { return '<a class="rg133 rg-hover12" href="' + esc(r.file || '#') + '" target="_blank" rel="noopener"><div class="rg134"><span class="rg135">' + esc(r.type) + '</span><span class="rg136">' + esc(r.ext) + '</span></div><h4 class="rg137">' + esc(r.title) + '</h4><div class="rg138"><span class="rg139">' + esc(prodTitle(r.product)) + '</span><span class="rg140">↓</span></div></a>'; }).join('');
      }
      sec.addEventListener('click', function (e) { var b = e.target.closest('[data-rp],[data-rf]'); if (!b) return; if (b.hasAttribute('data-rp')) prod = b.getAttribute('data-rp'); else filter = b.getAttribute('data-rf'); draw(); });
      draw();
    }).catch(fail);
  }

  /* ================================================================= PROJECT HIGHLIGHTS (stories) */
  var storyX = function (r) { var x = json(r.result_text, {}); return x && typeof x === 'object' ? x : {}; };
  function storyOf(r) {
    var x = storyX(r), imgs = (x.images && x.images.length ? x.images : (r.hero_image_url ? [r.hero_image_url] : [])).slice();
    return { id: r.id, slug: r.slug, title: r.title || '', location: r.location || '', owner: r.application || '', product: r.products_used || '', prod: x.prod || '', subtitle: x.subtitle || r.title || '', years: x.years || '', contractor: x.contractor || '', supplier: x.supplier || '',
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

  /* ================================================================= ONE PROJECT HIGHLIGHT (project-highlight-<slug>.html / project-highlight.html?slug=) */
  function routeSlug() {
    var q = /[?&]slug=([^&]+)/.exec(location.search); if (q) return decodeURIComponent(q[1]);
    var m = /project-highlight-([^\/]+?)\.html$/i.exec(location.pathname); return m ? decodeURIComponent(m[1]) : '';
  }
  function project() {
    get('stories').then(function (rows) {
      var list = rows.filter(live).map(storyOf); if (!list.length) return;
      var slug = routeSlug(), r = list.filter(function (x) { return x.slug === slug; })[0];
      var host = $('[data-vgroup="pj"]') || $('[data-dyn="pj"]'); if (!host) return;
      if (!r) { host.innerHTML = '<section class="rg162"><div class="rg163"><button class="rg164 rg-hover14" data-href="project-highlights.html">← All Projects</button></div></section><section class="rg183"><div class="rg184"><div class="rg185"><h2 class="rg186">Project not found</h2><p class="rg189">This project highlight does not exist (any more).</p></div></div></section>'; return; }
      host.removeAttribute('hidden'); host.removeAttribute('style');
      var gi = 0, ts = 0, tab = 'challenge', n = r.images.length;
      document.title = r.title + ' | Project Highlights | RockGuard® HD';
      function draw() {
        var vis = Math.min(3, n); ts = Math.max(0, Math.min(ts, n - vis));
        var thumbs = r.images.slice(ts, ts + vis).map(function (s, k) { var j = ts + k, on = j === gi; return '<button class="rg170 rg-hover15" data-gi="' + j + '" style="outline:3px solid ' + (on ? '#de4228' : 'transparent') + ';opacity:' + (on ? 1 : 0.7) + '"><img class="rg14" src="' + esc(imgSrc(s)) + '" alt=""></button>'; }).join('');
        var words = (r.product + ' – ' + r.title).split(' '), head = words.slice(0, -1).join(' '), last = words[words.length - 1];
        var tabs = [['challenge', "Client's Challenge"], ['solution', 'RockGuard® Solution']].map(function (t) { var on = t[0] === tab; return '<button class="rg188 rg-hover16" data-ct="' + t[0] + '" style="background:' + (on ? '#de4228' : 'transparent') + ';color:' + (on ? '#fff' : '#2c2e35') + '">' + t[1] + '</button>'; }).join('');
        host.innerHTML =
          '<section class="rg162"><div class="rg163"><button class="rg164 rg-hover14" data-href="project-highlights.html">← All Projects</button></div></section>' +
          '<section class="rg165"><div class="rg166"><div class="rg167"><button class="rg168 rg-hover9" data-up aria-label="Previous photos">▲</button><div class="rg169">' + thumbs + '</div><button class="rg168 rg-hover9" data-down aria-label="More photos">▼</button></div>' +
          '<div class="rg171">' + img(r.images[gi], r.title) + '<button class="rg172 rg-hover6" data-gi="prev" aria-label="Previous photo">‹</button><button class="rg173 rg-hover6" data-gi="next" aria-label="Next photo">›</button></div></div>' +
          '<div class="rg174"><div class="rg175"><span class="rg176">' + esc(r.product) + '</span><span class="rg158">Case Study · ' + esc(r.location) + '</span></div><h1 class="rg177">' + esc(r.subtitle) + '</h1>' +
          '<div class="rg178"><div><strong class="rg44">Owner:</strong> ' + esc(r.owner) + '</div><div><strong class="rg44">Products Used:</strong> ' + esc(r.product) + '</div></div>' +
          '<div class="rg179">' + r.benefits.map(function (b) { return '<div class="rg180"><span class="rg181">✓</span>' + esc(b) + '</div>'; }).join('') + '</div>' +
          (r.file ? '<a class="rg182 rg-hover9" href="' + esc(r.file) + '" target="_blank" rel="noopener">Download Project Highlight</a>' : '') + '</div></section>' +
          '<section class="rg183"><div class="rg184"><div class="rg185"><h2 class="rg186">' + esc(head) + ' <span class="rg41">' + esc(last) + '</span></h2><div class="rg187">' + tabs + '</div><p class="rg189">' + esc(tab === 'challenge' ? r.challenge : r.solution) + '</p></div></div></section>';
      }
      host.addEventListener('click', function (e) {
        var g = e.target.closest('[data-gi]'), c = e.target.closest('[data-ct]');
        if (g) { var v = g.getAttribute('data-gi'); gi = v === 'prev' ? (gi - 1 + n) % n : v === 'next' ? (gi + 1) % n : parseInt(v, 10); if (gi < ts) ts = gi; if (gi >= ts + 3) ts = gi - 2; draw(); }
        else if (c) { tab = c.getAttribute('data-ct'); draw(); }
        else if (e.target.closest('[data-up]')) { ts--; draw(); }
        else if (e.target.closest('[data-down]')) { ts++; draw(); }
      });
      draw();
    }).catch(fail);
  }

  if (page === 'home') home(); else if (page === 'products') products(); else if (page === 'resources') resources(); else if (page === 'highlights') highlights(); else if (page === 'project') project();
})();
