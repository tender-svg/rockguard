/* RockGuard CMS dashboard: sign-in check + add / edit / delete for Applications, Solutions, Project Highlights, Resources.
 * Talks to the multi-site backend through the site's own /api and /admin paths (routed to https://cmsapi.qpaix.com/rockguard/...). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var slugify = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); };
  var goLogin = function () { location.replace('login.html'); };
  // inside the live site's dashboard popup: tell the page that content changed (it reloads when the popup is closed)
  var embedded = /[?&]embed=1/.test(location.search); if (embedded) document.documentElement.classList.add('embed');
  var notify = function () { if (embedded && window.parent !== window) window.parent.postMessage('rg-cms-changed', '*'); };

  /* ---------------------------------------------------------------- backend */
  function api(method, url, body, isForm) {
    var opt = { method: method, credentials: 'include', headers: {} };
    if (body && !isForm) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    else if (isForm) opt.body = body;
    return fetch(url, opt).then(function (r) {
      if ((r.status === 401 || r.status === 403) && method !== 'GET') { goLogin(); throw new Error('Your session has expired. Please sign in again.'); }
      return r.text().then(function (t) {
        var j = null; try { j = JSON.parse(t); } catch (e) { /* not json */ }
        if (!r.ok) throw new Error((j && (j.error || j.message)) || ('Request failed (' + r.status + ')'));
        if (j && j.status === 'PENDING_APPROVAL') pendingFlag = true;   // an editor's change: queued for an admin
        return j;
      });
    });
  }
  function upload(file, folder) {
    var fd = new FormData(); fd.append('file', file); fd.append('folder', folder || 'OTHERS');
    return api('POST', '/api/upload', fd, true).then(function (j) { if (!j || !j.url) throw new Error('Upload failed'); return j.url; });
  }

  /* ---------------------------------------------------------------- small helpers for the stored formats */
  var PRODUCT_RE = /^\[product:([a-z0-9\-]+)\]\s*/;
  // the description holds two texts: the short one (card on the Resources page) and, for a blog post / webinar, the text of its page after a line "[page]"
  var isArticle = function (t) { return t === 'Blog Post' || t === 'Webinar'; };
  var splitDesc = function (text, type) {
    text = String(text || ''); var m = /(^|\n)[ \t]*\[page\][ \t]*(\n|$)/.exec(text);
    if (m) return { desc: text.slice(0, m.index).trim(), body: text.slice(m.index + m[0].length).trim() };
    return isArticle(type) ? { desc: '', body: text.trim() } : { desc: text.trim(), body: '' };
  };
  // list rows show only the start of a long text (the article body after "[page]" and its [image: ...] markers never belong in a table cell)
  var clipText = function (t, n) { t = String(t || '').split(/[page]/)[0].replace(/[image:[^]]*]/g, ' ').replace(/s+/g, ' ').trim(); return t.length > n ? t.slice(0, n).replace(/s+S*$/, '') + '…' : t; };
  var parseProduct = function (d) { var m = PRODUCT_RE.exec(d || ''); return { product: m ? m[1] : 'all', text: String(d || '').replace(PRODUCT_RE, '') }; };
  var stripImages = function (s) { return String(s || '').replace(/\s*\[Images:\d+\]/g, '').trim(); };
  var lines = function (s) { return String(s || '').split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean); };
  // a solution keeps its description and its ticked points in one text: the first lines are the description, lines starting with "- " are the points
  var solText = function (d) { var ls = stripImages(d).split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean), pt = /^[-•]\s+/; return { text: ls.filter(function (l) { return !pt.test(l); }).join(' '), bullets: ls.filter(function (l) { return pt.test(l); }).map(function (l) { return l.replace(pt, ''); }) }; };
  var SECTIONS = [['stats', 'Figures strip'], ['overview', 'Overview'], ['types', 'Product Types'], ['coating', 'Advanced Coating'], ['guide', 'Application guide + installation steps'], ['faq', 'Q&A']];
  var pageNameOf = function (slug) { return ('product-detail-' + slug).toLowerCase().replace(/[^a-z0-9\-_]/g, '-'); };   // the page of a solution made from the template
  var thumb = function (u) { return u ? '<img class="db-thumb" src="' + esc(u) + '" alt="" loading="lazy">' : '<span class="db-thumb none">no photo</span>'; };
  var pill = function (on) { return '<span class="db-pill ' + (on ? 'on' : 'off') + '">' + (on ? 'Live' : 'Hidden') + '</span>'; };
  // products = the solutions (their slug is the value): the product selects of Resources and Project Highlights list every solution made here
  var solRows = function () { return ((MODS.solutions && MODS.solutions.rows) || []).filter(function (r) { return r.is_active !== false; }); };
  var productOptions = function (noneKey, noneLabel) { var o = solRows().map(function (r) { return [r.slug, r.title]; }); return o.length ? o : [[noneKey, noneLabel]]; };   // only the solutions: "All" is the filter that shows everything
  // old saved values mat / grid -> the solution of that family
  var normProd = function (v) {
    v = String(v || ''); if (!v || v === 'all' || v === 'other') return v || 'all';
    if (solRows().some(function (r) { return r.slug === v; })) return v;
    var s = solRows().filter(function (r) { return r.product_family === v; })[0]; return s ? s.slug : v;
  };
  var productName = function (k) { k = normProd(k); var s = solRows().filter(function (r) { return r.slug === k; })[0]; return s ? s.title : 'All products / other'; };
  var firstProduct = function (none) { var r = solRows()[0]; return r ? r.slug : none; };

  var RES_TYPES = ['Data Sheet', 'Sizing Chart', 'Installation', 'Brochure', 'Specification', 'Safety', 'Technical Note', 'Webinar', 'Video', 'Blog Post'];
  /* ---------------------------------------------------------------- the three sections (the website has no separate "applications" list) */
  var SOLFAM = [['hd', 'RockGuard HD'], ['pw', 'PipeWeights'], ['acc', 'Accessory (shown in the Accessories tab)'], ['other', 'Other product']];
  var pairs = function (s) { return lines(s).map(function (l) { return l.split('|').map(function (x) { return x.trim(); }); }); };   // "a | b | c" per line
  var EL = {};   // the page elements (prod-*) of the solution that is open in the editor
  var elVal = function (id) { return EL[id] != null ? EL[id] : ''; };
  var jsonOr = function (s, d) { try { var j = JSON.parse(s); return j == null ? d : j; } catch (e) { return d; } };
  var MODS = {
    solutions: {
      label: 'Solutions', one: 'solution', list: '/api/v2/solutions', url: '/api/v2/solutions',
      blurb: 'The RockGuard products: a card on the home page, a tab on the Products page and a page of their own (product-detail-<name>.html), all made from what you fill in here.',
      sort: function (a, b) { return (a.display_order || 0) - (b.display_order || 0); },
      fields: [
        { name: 'title', label: 'Product name', type: 'text', req: true, full: true },
        { name: 'category', label: 'Small heading above the name', type: 'text', help: 'e.g. "Pipeline Protection Mesh".' },
        { name: 'display_order', label: 'Order', type: 'number', help: '0 shows first.' },
        { name: 'product_family', label: 'Group', type: 'select', options: SOLFAM, help: 'Accessories are shown together in the "Accessories" tab of the Products page.' },
        { name: 'text', label: 'Summary', type: 'textarea', full: true, help: 'The text on the product card (home page).' },
        { name: 'lead', label: 'Lead text on the product page', type: 'textarea', full: true, help: 'The paragraph under the name on the product page. Leave empty to use the summary.' },
        { name: 'icon_image_url', label: 'Card photo (home page)', type: 'image', folder: 'solutions', full: true },
        { name: 'detail_image', label: 'Photo on the product page', type: 'image', folder: 'solutions', full: true },
        { name: 'tile_image', label: 'Photo of its tile on the Resources page', type: 'image', folder: 'solutions', full: true },
        { name: 'features', label: 'Features & benefits', type: 'lines', full: true, rows: 8, help: 'One per line: Title | short text (the text is optional). Each line becomes a numbered card.' },
        { name: 'downloads', label: 'Downloads of the product page', type: 'lines', full: true, rows: 6, help: 'One per line: Label | link | type (e.g. Data Sheet). The first one is the "Data Sheet" button.' },
        { name: 'custom_link', label: 'Page the card opens', type: 'text', help: 'Leave it empty for the automatic page of this solution (product-detail-<name>.html), or write e.g. products.html?prod=hd.' },
        { name: 'is_active', label: 'Show on the website', type: 'checkbox' },
      ],
      columns: [['', function (r) { return thumb(r.icon_image_url); }], ['Product', function (r) { return '<div class="db-title">' + esc(r.title) + '</div><div class="db-sub">' + esc(r.category || '') + '</div>'; }], ['Page', function (r) { return '<span class="db-sub">product-detail-' + esc(r.slug || '') + '.html</span>'; }], ['Group', function (r) { var f = SOLFAM.filter(function (x) { return x[0] === (r.product_family || 'other'); })[0]; return esc(f ? f[1].replace(/ \(.*/, '') : (r.product_family || '')); }], ['Status', function (r) { return pill(r.is_active !== false); }]],
      toForm: function (r) { return { title: r.title, category: r.category || '', display_order: r.display_order || 0, product_family: r.product_family || 'other', text: stripImages(r.short_description), lead: '', icon_image_url: r.icon_image_url || '', detail_image: '', tile_image: '', features: '', downloads: '', custom_link: r.custom_link || '', is_active: r.is_active !== false }; },
      toBody: function (v, row) { return { title: v.title, slug: row ? row.slug : slugify(v.title), short_description: v.text, icon_image_url: v.icon_image_url, category: v.category, product_family: v.product_family, display_order: v.display_order, is_active: v.is_active }; },
      afterOpen: function (row) {   // the product page texts live in the page elements of "product-detail-<slug>"
        EL = {}; if (!row) { editing.els = true; return; }
        api('GET', '/api/v2/page-elements/' + encodeURIComponent(pageNameOf(row.slug))).then(function (rows) {
          (rows || []).forEach(function (r) { if (/^prod-/.test(r.element_id || '')) EL[r.element_id] = r.content_value; });
          if (!editing || editing.row !== row) return; editing.els = true;
          var set = function (n, v) { var el = document.querySelector('#editor [name="' + n + '"]'); if (el) { el.value = v; var box = el.closest('[data-up]'); if (box && v) { var pv = box.querySelector('.pv'); if (pv) pv.innerHTML = '<img src="' + esc(v) + '" alt="">'; } } };
          set('lead', elVal('prod-lead')); set('detail_image', elVal('prod-image')); set('tile_image', elVal('prod-tile'));
          set('features', jsonOr(elVal('prod-features'), []).map(function (f) { return f[1] ? f[0] + ' | ' + f[1] : f[0]; }).join('\n'));
          set('downloads', jsonOr(elVal('prod-downloads'), []).map(function (d) { return [d[0], d[1], d[2]].join(' | ').replace(/( \| )+$/, ''); }).join('\n'));
        }).catch(function () { });
      },
      after: function (v, saved, isNew) {
        var row = editing && editing.row, slug = isNew ? ((saved && saved.solution && saved.solution.slug) || slugify(v.title)) : (row && row.slug), jobs = [];
        if (isNew && saved && saved.solution && saved.solution.id && v.custom_link) jobs.push(api('PATCH', '/api/v2/solutions/' + saved.solution.id, { custom_link: v.custom_link }));   // the create call always sets the default link
        if (slug && (isNew || editing.els)) {
          var page = pageNameOf(slug), put = function (id, type, val) { return api('POST', '/api/v2/page-elements', { page_slug: page, element_id: id, content_type: type, content_value: val }); };
          jobs.push(put('prod-lead', 'text', v.lead), put('prod-image', 'image', v.detail_image), put('prod-tile', 'image', v.tile_image),
            put('prod-features', 'text', JSON.stringify(pairs(v.features).map(function (p) { return [p[0] || '', p[1] || '']; }))),
            put('prod-downloads', 'text', JSON.stringify(pairs(v.downloads).map(function (p) { return [p[0] || '', p[1] || '', p[2] || '', '']; }))));
        }
        return Promise.all(jobs);
      },
      defaults: function () { return { is_active: true, product_family: 'other', display_order: (MODS.solutions.rows || []).length + 1 }; },
    },

    stories: {
      label: 'Project Highlights', one: 'project highlight', list: '/api/v2/stories', url: '/api/v2/stories',
      blurb: 'Finished pipeline projects with a photo gallery. Shown on the Project Highlights page and on a page of their own.',
      fields: [
        { name: 'title', label: 'Project title', type: 'text', req: true, full: true },
        { name: 'subtitle', label: 'Heading of the project page', type: 'text', full: true, help: 'e.g. "Bayou Bridge Pipeline". Empty: the title is used.' },
        { name: 'location', label: 'Location', type: 'text' },
        { name: 'years', label: 'Dates', type: 'text', help: 'e.g. "April 2018 – Present".' },
        { name: 'owner', label: 'Owner', type: 'text' },
        { name: 'contractor', label: 'Contractor', type: 'text' },
        { name: 'supplier', label: 'Supplier', type: 'text' },
        { name: 'product', label: 'Product used (for the link to the product)', type: 'select', legacy: 'Other', options: function () { return productOptions('other', 'Other'); } },
        { name: 'products_used', label: 'Products used (text shown on the page)', type: 'text', full: true },
        { name: 'benefits', label: 'Benefits (ticked points)', type: 'lines', full: true, help: 'One per line.' },
        { name: 'excerpt', label: 'Short text of the card', type: 'textarea', full: true, help: 'Shown on the Project Highlights page. Empty: the first part of the challenge text is used.' },
        { name: 'challenge_text', label: "Client's challenge: text", type: 'textarea', full: true },
        { name: 'solution_text', label: 'RockGuard solution: text', type: 'textarea', full: true },
        { name: 'images', label: 'Photos (the first one is the main photo)', type: 'images', count: 6, folder: 'projects', full: true },
        { name: 'case_study', label: 'Project highlight PDF or link: opens from "Download Project Highlight"', type: 'file', folder: 'projects', full: true },
      ],
      columns: [['', function (r) { return thumb(r.hero_image_url); }], ['Project', function (r) { return '<div class="db-title">' + esc(r.title) + '</div><div class="db-sub">' + esc(r.location || '') + '</div>'; }], ['Product', function (r) { return esc(r.products_used || productName(extras(r).prod === 'other' ? 'all' : extras(r).prod)); }], ['Dates', function (r) { return esc(extras(r).years || ''); }], ['Page', function (r) { return '<span class="db-sub">project-highlight-' + esc(r.slug || '') + '.html</span>'; }]],
      toForm: function (r) {
        var x = extras(r); return { title: r.title, subtitle: x.subtitle || '', location: r.location || '', years: x.years || '', owner: r.application || '', contractor: x.contractor || '', supplier: x.supplier || '', product: normProd(x.prod || 'other'), products_used: r.products_used || '',
          benefits: (x.benefits || []).join('\n'), excerpt: x.excerpt || '', challenge_text: r.challenge_text || '', solution_text: r.solution_text || '', case_study: x.file || '', images: (x.images && x.images.length ? x.images : (r.hero_image_url ? [r.hero_image_url] : [])) };
      },
      toBody: function (v, row, all) {
        var keep = row ? extras(row) : {};   // what the form does not show (e.g. the technical table) is kept
        var body = { title: v.title, location: v.location, application: v.owner, products_used: v.products_used, hero_image_url: v.images[0] || '', challenge_text: v.challenge_text, solution_text: v.solution_text, project_benefits: lines(v.benefits).join(', '),
          result_text: JSON.stringify(Object.assign({}, keep, { prod: v.product, images: v.images, file: v.case_study || '', subtitle: v.subtitle, years: v.years, contractor: v.contractor, supplier: v.supplier, benefits: lines(v.benefits), excerpt: v.excerpt })) };
        if (!row) { var s = slugify(v.title) || 'project'; var taken = (all || []).map(function (a) { return a.slug; }); if (taken.indexOf(s) >= 0) s += '-' + Date.now().toString(36).slice(-4); body.slug = s; }
        return body;
      },
      defaults: function () { return { product: firstProduct('other') }; },
    },

    resources: {
      label: 'Resources', one: 'resource', list: '/api/v2/resources?all=true', url: '/api/v2/resources',
      blurb: 'Data sheets, sizing charts, installation guides, brochures, specifications and videos. Shown on the Resources page.',
      fields: [
        { name: 'title', label: 'Title', type: 'text', req: true, full: true },
        { name: 'document_type', label: 'Type', type: 'select', options: RES_TYPES.map(function (x) { return [x, x]; }), help: 'Sizing Chart, Installation, Brochure, Specification and Safety show under Downloads; Data Sheet under Technical Datasheets.' },
        { name: 'product', label: 'Product', type: 'select', legacy: 'All products / other', options: function () { return productOptions('all', 'All products / other'); } },
        { name: 'description', label: 'Short description', type: 'textarea', full: true, help: 'Optional. Kept with the resource (not shown on its card).' },
        { name: 'body', label: 'Text of its own page', type: 'textarea', full: true, rows: 12, help: 'Only for a Blog Post or a Webinar: the text of its page (blog-<title>.html / webinar-<title>.html). A blank line starts a new paragraph; a short first line of a block is a sub-heading; lines starting with • or - are a list (shown as numbered cards); a line [image: /images/photo.webp | caption] puts a picture there (or use "Insert image" on the page itself).' },
        { name: 'file_url', label: 'File (PDF or other document) or link', type: 'file', folder: 'resources', full: true, help: 'A Webinar page uses it for its "Watch / Register" button.' },
        { name: 'thumbnail_url', label: 'Cover photo (Blog Post / Webinar page)', type: 'image', folder: 'resources', full: true },
        { name: 'is_active', label: 'Show on the website', type: 'checkbox' },
      ],
      columns: [['Resource', function (r) { return '<div class="db-title">' + esc(r.title) + '</div><div class="db-sub">' + esc(clipText(r.file_url, 70)) + '</div>'; }], ['Type', function (r) { return esc(r.document_type || ''); }], ['Page', function (r) { var k = r.document_type === 'Blog Post' ? 'blog' : r.document_type === 'Webinar' ? 'webinar' : ''; return k ? '<span class="db-sub">' + k + '-' + esc(slugify(r.title)) + '.html</span>' : '<span class="db-sub">—</span>'; }], ['Product', function (r) { return esc(productName(parseProduct(r.description).product)); }], ['Status', function (r) { return pill(r.is_active !== false); }]],
      toForm: function (r) { var p = parseProduct(r.description), sp = splitDesc(p.text, r.document_type); return { title: r.title, document_type: r.document_type || 'Data Sheet', product: normProd(p.product), description: sp.desc, body: sp.body, file_url: r.file_url || '', thumbnail_url: r.thumbnail_url || '', is_active: r.is_active !== false }; },
      toBody: function (v, row) {
        var b = { title: v.title, document_type: v.document_type, description: '[product:' + v.product + '] ' + v.description + (v.body && isArticle(v.document_type) ? '\n\n[page]\n\n' + v.body : ''), file_url: v.file_url, thumbnail_url: v.thumbnail_url, is_active: v.is_active };
        if (!row) b.published_date = new Date().toISOString();
        return b;
      },
      defaults: function () { return { is_active: true, document_type: RES_NEW_TYPE[resTab] || 'Data Sheet', product: resProd !== 'all' ? resProd : firstProduct('all') }; },
    },
  };
  function extras(r) { try { var j = JSON.parse(r.result_text || '{}'); return j && typeof j === 'object' ? j : {}; } catch (e) { return {}; } }
  var KEYS = ['solutions', 'stories', 'resources'];

  /* ---------------------------------------------------------------- ui state */
  var cur = 'overview', search = '';
  // Resources: the same tabs as the Resources page (+ All) and a product filter; "Add resource" starts with the type / product that is selected
  var resTab = 'all', resProd = 'all';
  var RES_TABS = [['all', 'All'], ['downloads', 'Downloads'], ['datasheets', 'Technical Datasheets'], ['webinars', 'Webinars'], ['videos', 'Videos'], ['blog', 'Blog Posts'], ['notes', 'Technical Notes']];
  var DL_TYPES = ['Sizing Chart', 'Installation', 'Brochure', 'Specification', 'Safety'];
  var RES_IN = { all: function () { return true; }, downloads: function (t) { return DL_TYPES.indexOf(t) >= 0; }, datasheets: function (t) { return t === 'Data Sheet'; }, webinars: function (t) { return t === 'Webinar'; }, videos: function (t) { return t === 'Video'; }, blog: function (t) { return t === 'Blog Post'; }, notes: function (t) { return t === 'Technical Note'; } };
  var RES_NEW_TYPE = { downloads: 'Sizing Chart', datasheets: 'Data Sheet', webinars: 'Webinar', videos: 'Video', blog: 'Blog Post', notes: 'Technical Note' };
  var resProduct = function (r) { return normProd(parseProduct(r.description).product); };
  var resType = function (r) { return r.document_type || 'Data Sheet'; };
  function resBar(all) {
    var inProd = function (r) { return resProd === 'all' || resProduct(r) === resProd; }, inTab = function (r) { return RES_IN[resTab](resType(r)); };
    var tabs = RES_TABS.map(function (t) { var n = all.filter(function (r) { return inProd(r) && RES_IN[t[0]](resType(r)); }).length; return '<button type="button" class="' + (resTab === t[0] ? 'on' : '') + '" data-rtab="' + t[0] + '">' + esc(t[1]) + ' <i>' + n + '</i></button>'; }).join('');
    var prodOpts = [['all', 'All products']].concat(solRows().map(function (s) { return [s.slug, s.title]; })).map(function (p) { var n = all.filter(function (r) { return inTab(r) && (p[0] === 'all' || resProduct(r) === p[0]); }).length; return '<option value="' + esc(p[0]) + '"' + (resProd === p[0] ? ' selected' : '') + '>' + esc(p[1]) + '  (' + n + ')</option>'; }).join('');
    return '<div class="db-filters"><div class="db-frow"><span>Type</span><div class="db-tabs">' + tabs + '</div></div><div class="db-frow"><span>Product</span><select class="db-fsel" data-rprodsel="1" aria-label="Filter by product">' + prodOpts + '</select></div></div>';
  }
  function toast(msg, bad) { var t = $('#toast'); t.textContent = msg; t.className = 'db-toast show' + (bad ? ' bad' : ''); clearTimeout(toast.t); toast.t = setTimeout(function () { t.className = 'db-toast' + (bad ? ' bad' : ''); }, 3200); }

  function loadModule(k) {
    var m = MODS[k];
    return api('GET', m.list).then(function (rows) { rows = Array.isArray(rows) ? rows : []; if (m.sort) rows.sort(m.sort); m.rows = rows; return rows; });
  }
  function renderSide() {
    var sideBtn = function (k, label, cnt) { return '<button type="button" data-go="' + k + '" class="' + (k === cur ? 'on' : '') + '">' + esc(label) + (cnt || '') + '</button>'; };
    var adminTop = !isAdmin ? '' : sideBtn('approvals', 'Pending Approvals', pendingN ? '<span class="db-count hot">' + pendingN + '</span>' : '') + sideBtn('team', 'Team & Access');
    $('#side').innerHTML = ['overview'].concat(KEYS).map(function (k) {
      var label = k === 'overview' ? 'Overview' : MODS[k].label;
      var cnt = k === 'overview' ? '' : '<span class="db-count">' + (MODS[k].rows ? MODS[k].rows.length : '…') + '</span>';
      return '<button type="button" data-go="' + k + '" class="' + (k === cur ? 'on' : '') + '">' + esc(label) + cnt + '</button>' + (k === 'overview' ? adminTop : '');
    }).join('') + '<div class="db-side-h">Settings</div>' + SETTINGS.filter(allowed).map(function (x) { return sideBtn(x[0], x[1]); }).join('') + '<button type="button" data-pw="1">Change Password</button>';
  }
  function renderOverview() {
    $('#main').innerHTML = '<div class="db-head"><div><h1>Dashboard</h1><p>Manage the RockGuard website content.</p></div></div><div class="db-cards">' +
      KEYS.map(function (k) { var m = MODS[k]; return '<div class="db-card"><div class="n">' + (m.rows ? m.rows.length : '…') + '</div><div class="t">' + esc(m.label) + '</div><div class="a"><button class="db-btn db-btn-ghost db-btn-sm" data-go="' + k + '">Manage</button><button class="db-btn db-btn-red db-btn-sm" data-add="' + k + '">+ Add new</button></div></div>'; }).join('') +
      '</div><div class="db-note"><b>How it works:</b> pick a section on the left, press <b>+ Add new</b> or <b>Edit</b>, fill in the form and press <b>Save</b>. Photos and documents are uploaded straight from the form. Use <b>Show on the website</b> to hide something without deleting it.</div>';
  }
  function renderList(k) {
    var m = MODS[k], rows = (m.rows || []).filter(function (r) { return !search || JSON.stringify([r.title, r.location, r.category, r.description, r.document_type]).toLowerCase().indexOf(search.toLowerCase()) >= 0; });
    var bar = '', filtered = false;
    if (k === 'resources') { var all = m.rows || []; bar = resBar(all); rows = rows.filter(function (r) { return RES_IN[resTab](resType(r)) && (resProd === 'all' || resProduct(r) === resProd); }); filtered = resTab !== 'all' || resProd !== 'all'; }
    var head = '<tr>' + m.columns.map(function (c) { return '<th>' + esc(c[0]) + '</th>'; }).join('') + '<th></th></tr>';
    var body = rows.map(function (r) {
      return '<tr>' + m.columns.map(function (c) { return '<td>' + c[1](r) + '</td>'; }).join('') + '<td><div class="db-actions"><button class="db-btn db-btn-ghost db-btn-sm" data-edit="' + esc(r.id) + '">Edit</button><button class="db-btn db-btn-danger db-btn-sm" data-del="' + esc(r.id) + '">Delete</button></div></td></tr>';
    }).join('');
    $('#main').innerHTML = '<div class="db-head"><div><h1>' + esc(m.label) + '</h1><p>' + esc(m.blurb) + '</p></div><div class="db-tools"><input class="db-search" id="q" type="search" placeholder="Search…" value="' + esc(search) + '"><button class="db-btn db-btn-red" data-add="' + k + '">+ Add ' + esc(m.one) + '</button></div></div>' +
      bar + '<div class="db-table-wrap">' + (rows.length ? '<table class="db-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>' : '<div class="db-empty">' + (filtered && !search ? 'No resource in this filter yet. Press <b>+ Add ' + esc(m.one) + '</b>: it starts with the selected type and product.' : m.rows && m.rows.length ? 'Nothing matches your search.' : 'Nothing here yet. Press <b>+ Add ' + esc(m.one) + '</b> to create the first one.') + '</div>') + '</div>';
    var q = $('#q'); if (q) q.addEventListener('input', function () { search = q.value; var pos = q.selectionStart; renderList(k); var n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); });
  }
  function show(k) {
    cur = k; search = ''; location.hash = k === 'overview' ? '' : k; renderSide();
    document.body.classList.remove('menu-open');
    if (k === 'overview') { renderOverview(); return; }
    if (!allowed([k])) { show('overview'); return; }
    if (k === 'approvals') { renderApprovals(); return; }
    if (k === 'team') { renderTeam(); return; }
    if (k === 'history') { renderHistory(); return; }
    if (k === 'email') { loadEmail(); return; }
    renderList(k);
    loadModule(k).then(function () { if (cur === k) { renderSide(); renderList(k); } }).catch(function (e) { toast(e.message, true); });
  }

  /* ---------------------------------------------------------------- editor form */
  var editing = null; // { key, row }
  // the options of a select; an old item that has no product keeps its old value (shown only for that item)
  function withLegacy(f, val) {
    var o = typeof f.options === 'function' ? f.options() : f.options;
    return f.legacy && val && !o.some(function (x) { return String(x[0]) === String(val); }) ? o.concat([[val, f.legacy]]) : o;
  }
  function fieldHtml(f, val) {
    var id = 'f_' + f.name, cls = 'db-field' + (f.full ? ' full' : ''), help = f.help ? '<small>' + esc(f.help) + '</small>' : '', label = '<span>' + esc(f.label) + (f.req ? ' <b>*</b>' : '') + '</span>';
    if (f.type === 'sections') return '<div class="db-field full" data-f="sections"><span>' + esc(f.label) + '</span><div class="db-checks2">' + SECTIONS.map(function (x) { return '<label><input type="checkbox" data-sec="' + x[0] + '" checked> ' + esc(x[1]) + '</label>'; }).join('') + '</div>' + help + '</div>';
    if (f.type === 'checkbox') return '<label class="db-field chk"><input type="checkbox" name="' + f.name + '"' + (val ? ' checked' : '') + '><span>' + esc(f.label) + '</span></label>';
    if (f.type === 'textarea' || f.type === 'lines') return '<label class="' + cls + '" data-f="' + f.name + '">' + label + '<textarea name="' + f.name + '" rows="' + (f.rows || (f.type === 'lines' ? 6 : 4)) + '">' + esc(val) + '</textarea>' + help + '</label>';
    if (f.type === 'select') return '<label class="' + cls + '" data-f="' + f.name + '">' + label + '<select name="' + f.name + '">' + withLegacy(f, val).map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' + help + '</label>';
    if (f.type === 'number') return '<label class="' + cls + '" data-f="' + f.name + '">' + label + '<input type="number" name="' + f.name + '" value="' + esc(val) + '">' + help + '</label>';
    if (f.type === 'image' || f.type === 'file') return uploader(f, f.name, val, cls, label, help);
    if (f.type === 'images') { var arr = Array.isArray(val) ? val : []; var out = ''; for (var i = 0; i < f.count; i++) out += uploader({ type: 'image', folder: f.folder, label: 'Photo ' + (i + 1) }, f.name + '__' + i, arr[i] || '', 'db-field full', '<span>Photo ' + (i + 1) + (i === 0 ? ' (main)' : '') + '</span>', ''); return '<div class="' + cls + '" data-multi="' + f.name + '"><span>' + esc(f.label) + '</span></div>' + out; }
    return '<label class="' + cls + '" data-f="' + f.name + '">' + label + '<input type="text" name="' + f.name + '" value="' + esc(val) + '">' + help + '</label>';
  }
  function uploader(f, name, val, cls, label, help) {
    var isImg = f.type === 'image';
    var prev = isImg ? (val ? '<img src="' + esc(val) + '" alt="">' : '<div class="ph">no photo yet</div>') : '<div class="ph">' + (val ? 'file attached' : 'no file yet') + '</div>';
    return '<div class="' + cls + '" data-up="' + name + '" data-folder="' + esc(f.folder || 'OTHERS') + '" data-kind="' + (isImg ? 'image' : 'file') + '">' + label +
      '<div class="db-up"><div class="pv">' + prev + '</div><div class="col"><input type="text" name="' + name + '" value="' + esc(val) + '" placeholder="' + (isImg ? 'Photo link (filled automatically after upload)' : 'File link (filled automatically after upload)') + '">' +
      '<div class="row"><input type="file" ' + (isImg ? 'accept="image/*"' : '') + '><button type="button" class="db-btn db-btn-ghost db-btn-sm" data-clear="' + name + '">Remove</button></div><div class="st"></div></div></div>' + help + '</div>';
  }
  function openEditor(key, row) {
    var m = MODS[key]; editing = { key: key, row: row || null };
    var vals = row ? m.toForm(row) : m.defaults();
    $('#modalTitle').textContent = (row ? 'Edit ' : 'Add ') + m.one;
    $('#editorBody').innerHTML = m.fields.map(function (f) { return fieldHtml(f, vals[f.name] != null ? vals[f.name] : ''); }).join('');
    $('#formMsg').textContent = ''; $('#saveBtn').disabled = false; $('#saveBtn').textContent = 'Save';
    $('#modal').hidden = false; document.body.style.overflow = 'hidden';
    if (m.afterOpen) m.afterOpen(row);
    if (key === 'resources') syncResForm();
    var first = $('#editorBody input[type=text],#editorBody textarea'); if (first) first.focus();
  }
  function syncResForm() { var t = $('#editor [name=document_type]'), box = $('#editor [data-f="body"]'); if (t && box) box.hidden = !isArticle(t.value); }
  function closeEditor() { $('#modal').hidden = true; document.body.style.overflow = ''; editing = null; }
  function collect(m) {
    var v = {}, form = $('#editor');
    m.fields.forEach(function (f) {
      var el = form.elements[f.name];
      if (f.type === 'checkbox') v[f.name] = !!(el && el.checked);
      else if (f.type === 'number') v[f.name] = parseInt(el && el.value, 10) || 0;
      else if (f.type === 'images') { v[f.name] = []; for (var i = 0; i < f.count; i++) { var x = form.elements[f.name + '__' + i]; if (x && x.value.trim()) v[f.name].push(x.value.trim()); } }
      else if (f.type === 'sections') { v.sections = {}; SECTIONS.forEach(function (x) { var cb = form.querySelector('[data-sec="' + x[0] + '"]'); v.sections[x[0]] = !cb || cb.checked; }); }
      else v[f.name] = el ? el.value.trim() : '';
    });
    return v;
  }
  function save(e) {
    e.preventDefault();
    var m = MODS[editing.key], v = collect(m), row = editing.row, bad = [];
    m.fields.forEach(function (f) { var box = $('[data-f="' + f.name + '"]'); if (box) box.classList.remove('err'); if (f.req && !v[f.name]) { bad.push(f.label); if (box) box.classList.add('err'); } });
    if (bad.length) { $('#formMsg').textContent = 'Please fill in: ' + bad.join(', '); return; }
    var uploading = [].slice.call(document.querySelectorAll('#editor [data-up]')).some(function (u) { return u.getAttribute('data-busy') === '1'; });
    if (uploading) { $('#formMsg').textContent = 'Wait for the upload to finish.'; return; }
    var btn = $('#saveBtn'); btn.disabled = true; btn.textContent = 'Saving…'; $('#formMsg').textContent = '';
    pendingFlag = false; var body = m.toBody(v, row, m.rows);
    var req = row ? api('PATCH', m.url + '/' + row.id, body) : api('POST', m.url, body);
    req.then(function (saved) { return m.after ? m.after(v, saved, !row) : null; })
      .then(function () { var k = editing.key; var sub = pendingFlag; if (!sub) logHistory(k, v.title, row ? 'Updated' : 'Added'); closeEditor(); toast(sub ? 'Submitted for admin approval. It goes live once an admin approves it.' : 'Saved. The change is live.'); notify(); return loadModule(k).then(function () { renderSide(); if (cur === k) renderList(k); else if (cur === 'overview') renderOverview(); }); })
      .catch(function (err) { btn.disabled = false; btn.textContent = 'Save'; $('#formMsg').textContent = err.message; });
  }
  function onUpload(input) {
    var box = input.closest('[data-up]'), name = box.getAttribute('data-up'), st = $('.st', box), file = input.files && input.files[0]; if (!file) return;
    box.setAttribute('data-busy', '1'); st.textContent = 'Uploading ' + file.name + '…';
    upload(file, box.getAttribute('data-folder')).then(function (url) {
      $('input[name="' + name + '"]', box).value = url; st.textContent = 'Uploaded.';
      $('.pv', box).innerHTML = box.getAttribute('data-kind') === 'image' ? '<img src="' + esc(url) + '" alt="">' : '<div class="ph">file attached</div>';
    }).catch(function (err) { st.textContent = 'Upload failed: ' + err.message; }).then(function () { box.removeAttribute('data-busy'); input.value = ''; });
  }
  function remove(key, id) {
    var m = MODS[key], row = (m.rows || []).filter(function (r) { return String(r.id) === String(id); })[0]; if (!row) return;
    RGDialog.confirm({ title: 'Delete this item?', message: 'Delete "' + row.title + '"?\nThis removes it from the website and cannot be undone.', ok: 'Delete', danger: true }).then(function (go) {
    if (!go) return;
    pendingFlag = false; api('DELETE', m.url + '/' + id).then(function () { var sub = pendingFlag; if (!sub) logHistory(key, row.title, 'Deleted'); toast(sub ? 'Submitted for admin approval.' : 'Deleted.'); notify(); return loadModule(key); }).then(function () { renderSide(); if (cur === key) renderList(key); })
      .catch(function (e) { toast(e.message, true); });
    });
  }

  /* ---------------------------------------------------------------- settings: change history, email configuration, change password */
  var SETTINGS = [['history', 'Change History'], ['email', 'Email Configuration']];
  var allowed = function (x) { return isAdmin || ['email', 'approvals', 'team'].indexOf(x[0]) < 0; };   // editors never see these
  var fmtWhen = function (iso) { var d = new Date(iso); return isNaN(d) ? ['', ''] : [d.toLocaleDateString('en-GB'), d.toLocaleTimeString('en-GB')]; };
  var overlay = function (id, html) { var o = document.getElementById(id); if (o) o.remove(); o = document.createElement('div'); o.className = 'db-modal fit'; o.id = id; o.innerHTML = html; document.body.appendChild(o); o.addEventListener('mousedown', function (e) { if (e.target === o && e.clientX < o.clientWidth) o.remove(); }); return o; };   // (a click on the scrollbar is not a click outside)

  // every save is written to the change history of its page / list (js/cms.js and js/rg-edit.js do the same for the live editor)
  function logHistory(slug, title, what) {
    var key = title || '(untitled)', snap = {}; snap[key] = { type: 'text', value: what };
    return api('POST', '/api/v2/history', { page_slug: slug, snapshot: snap, changed_keys: [key] }).catch(function () { });
  }

  /* ----- change history */
  var HIST = [['index', 'Home'], ['products', 'Products'], ['solutions', 'Solutions'], ['resources', 'Resources'], ['project-highlights', 'Project Highlights'], ['stories', 'Project Highlights (list)'], ['contact', 'Contact'], ['lunch-learn', 'Lunch & Learn'], ['credit-application', 'Credit Application'], ['sections', 'Sections & lists'], ['email-config', 'Email Configuration']];
  var histRows = [], histPage = '';
  var histLabel = function (s) { var h = HIST.filter(function (x) { return x[0] === s; })[0]; return h ? h[1] : s; };
  var looksImage = function (v) { return typeof v === 'string' && /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(v.split('?')[0]); };
  function renderHistory() {
    $('#main').innerHTML = '<div class="db-head"><div><h1>Change History</h1><p>Every save made from the dashboard or the live editor, newest first. Press <b>View</b> to see what was saved.</p></div><div class="db-tools"><select class="db-search" id="histPage"><option value="">All pages</option>' + HIST.map(function (h) { return '<option value="' + h[0] + '"' + (histPage === h[0] ? ' selected' : '') + '>' + esc(h[1]) + '</option>'; }).join('') + '</select><button class="db-btn db-btn-red" type="button" id="histReload">Refresh</button></div></div><div id="histBody"><div class="db-empty">Loading history…</div></div>';
    $('#histPage').addEventListener('change', function () { histPage = this.value; drawHistory(); });
    $('#histReload').addEventListener('click', renderHistory);
    Promise.all(HIST.map(function (h) { return api('GET', '/api/v2/history/' + h[0] + '?size=50').then(function (rows) { return (Array.isArray(rows) ? rows : []).map(function (r) { r._slug = h[0]; return r; }); }).catch(function () { return []; }); }))
      .then(function (all) { histRows = [].concat.apply([], all).sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); }); if (cur === 'history') drawHistory(); });
  }
  function drawHistory() {
    var rows = histRows.filter(function (r) { return !histPage || r._slug === histPage; }).slice(0, 200), box = $('#histBody'); if (!box) return;
    if (!rows.length) { box.innerHTML = '<div class="db-empty">No saved changes yet. Edits you save from the dashboard or the live editor are listed here.</div>'; return; }
    box.innerHTML = '<div class="db-table-wrap"><table class="db-table"><thead><tr><th>Date &amp; time</th><th>Page</th><th>Changed by</th><th>What changed</th><th></th></tr></thead><tbody>' + rows.map(function (r, i) {
      var w = fmtWhen(r.created_at), keys = Array.isArray(r.changed_keys) ? r.changed_keys : Object.keys(r.snapshot || {}).filter(function (k) { return k !== 'PAGE_LAYOUT'; });
      return '<tr><td><div class="db-title">' + esc(w[0]) + '</div><div class="db-sub">' + esc(w[1]) + '</div></td><td>' + esc(histLabel(r._slug)) + '</td><td><span class="db-pill">' + esc((r.admins && r.admins.username) || 'Admin') + '</span></td><td><span class="db-sub">' + esc(keys.length + (keys.length === 1 ? ' item' : ' items')) + '</span></td><td><div class="db-actions"><button class="db-btn db-btn-ghost db-btn-sm" type="button" data-hview="' + i + '">View</button></div></td></tr>';
    }).join('') + '</tbody></table></div>';
    box.onclick = function (e) { var b = e.target.closest('[data-hview]'); if (b) viewHistory(rows[parseInt(b.getAttribute('data-hview'), 10)]); };
  }
  function viewHistory(r) {
    var snap = r.snapshot || r.changes || {}, keys = (Array.isArray(r.changed_keys) ? r.changed_keys : Object.keys(snap)).filter(function (k) { return k !== 'PAGE_LAYOUT' && snap[k] !== undefined; }), w = fmtWhen(r.created_at);
    var val = function (v) {
      if (v == null || v === '') return '<span class="db-sub">(empty)</span>';
      if (looksImage(v)) return '<img class="db-thumb" src="' + esc(v) + '" alt="">';
      var t = String(v).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); return esc(t.length > 240 ? t.slice(0, 240) + '…' : t) || '<span class="db-sub">(empty)</span>';
    };
    overlay('histView', '<div class="db-modal-box" style="max-width:680px"><div class="db-modal-head"><h2>Saved content</h2><button class="db-x" type="button" data-close="histView" aria-label="Close">×</button></div><div class="db-modal-body" style="grid-template-columns:1fr"><div class="db-sub">' + esc(histLabel(r._slug)) + ' · ' + esc(w[0] + ' ' + w[1]) + ' · by ' + esc((r.admins && r.admins.username) || 'Admin') + '</div>' +
      (keys.length ? keys.map(function (k) { return '<div class="db-hrow"><div class="k">' + esc(k) + '</div><div>' + val(snap[k] && snap[k].value) + '</div></div>'; }).join('') : '<div class="db-sub">No field content in this save.</div>') + '</div></div>');
  }

  /* ----- email configuration (SMTP + who gets a copy of each form) */
  var CC_FORMS = [['support', 'Contact'], ['lunch_learn', 'Lunch & Learn'], ['credit_application', 'Credit Application']];
  var ccFormName = function (code) { return String(code).replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); };
  function ccForms() {   // the forms of this site + any other form that already has rows saved
    var extra = []; ccAll.forEach(function (e) { if (e.form && !CC_FORMS.some(function (f) { return f[0] === e.form; }) && !extra.some(function (f) { return f[0] === e.form; })) extra.push([e.form, ccFormName(e.form)]); });
    return CC_FORMS.concat(extra);
  }
  var CC_PRODUCTS = ['RockGuard® HD', 'PipeWeights', 'Accessories'];   // the product choices of the Lunch & Learn / Credit Application forms
  var CC_REGIONS = [['none', 'Any region'], ['us_state', 'Specific US states'], ['country', 'Specific countries'], ['us_fallback', 'Every other US state'], ['intl_fallback', 'All other countries']];
  var emailCfg = null, ccAll = [], ccForm = 'support', EMAILRE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function loadEmail() {
    $('#main').innerHTML = '<div class="db-head"><div><h1>Email Configuration</h1></div></div><div class="db-empty">Loading…</div>';
    api('GET', '/api/v2/email-config').then(function (cfg) { setEmail(cfg); drawEmail(); }).catch(function (e) { $('#main').innerHTML = '<div class="db-empty">' + esc(e.message) + '</div>'; });
  }
  function setEmail(cfg) {
    emailCfg = cfg || {}; var all = Array.isArray(emailCfg.cc_emails) ? emailCfg.cc_emails : [], out = [];
    all.forEach(function (e) { if (!e || !e.email) return; if (e.form) out.push(e); else ['support', 'credit_application'].forEach(function (f) { out.push(Object.assign({}, e, { form: f })); }); });   // old rows without a form belong to Contact + Credit
    ccAll = out.map(function (e) { return { name: e.name || '', email: e.email, form: e.form, type: e.type || 'none', values: Array.isArray(e.values) ? e.values : (e.value ? [e.value] : []), products: Array.isArray(e.products) ? e.products : [] }; });
  }
  function ccRow(e, i) {
    var needs = e.type === 'us_state' || e.type === 'country';
    return '<div class="db-cc" data-ci="' + i + '"><label class="db-field"><span>Name</span><input type="text" data-cc="name" value="' + esc(e.name) + '"></label><label class="db-field"><span>Email</span><input type="text" data-cc="email" value="' + esc(e.email) + '" placeholder="name@company.com"></label>' +
      '<div class="db-field"><span>Products</span><div class="db-checks">' + CC_PRODUCTS.map(function (p) { return '<label><input type="checkbox" data-cc="prod" value="' + esc(p) + '"' + (e.products.indexOf(p) >= 0 ? ' checked' : '') + '> ' + esc(p) + '</label>'; }).join('') + '</div></div>' +
      '<label class="db-field"><span>Region</span><select data-cc="type">' + CC_REGIONS.map(function (r) { return '<option value="' + r[0] + '"' + (e.type === r[0] ? ' selected' : '') + '>' + esc(r[1]) + '</option>'; }).join('') + '</select>' +
      (needs ? '<input type="text" data-cc="values" value="' + esc(e.values.join(', ')) + '" placeholder="' + (e.type === 'us_state' ? 'State codes, e.g. TX, OK' : 'Country codes, e.g. CA, GB') + '">' : '') + '</label>' +
      '<button type="button" class="db-btn db-btn-danger db-btn-sm" data-ccdel="' + i + '">Remove</button></div>';
  }
  function drawEmail() {
    var c = emailCfg || {}, rows = ccAll.map(function (e, i) { return e.form === ccForm ? ccRow(e, i) : ''; }).join('');
    var recEmail = c.recipient_email || c.from_email || '';
    $('#main').innerHTML = '<div class="db-head"><div><h1>Email Configuration</h1><p>The mail account the website forms are sent through, and who gets a copy of each form.</p></div></div>' +
      '<form class="db-panel" id="emailForm" novalidate><h2>SMTP</h2><div class="db-grid2"><label class="db-field"><span>SMTP host</span><input type="text" name="smtp_host" value="' + esc(c.smtp_host) + '" placeholder="e.g. smtp.gmail.com"></label><label class="db-field"><span>Port</span><input type="number" name="smtp_port" value="' + esc(c.smtp_port) + '" placeholder="587"></label></div>' +
      '<label class="db-field"><span>SMTP username</span><input type="text" name="smtp_username" value="' + esc(c.smtp_username) + '" placeholder="your@email.com" autocomplete="off"><small>This is also the "From" address of the form emails, and the address they are delivered to.</small></label>' +
      '<label class="db-field" for="smtp-recipient-email"><span>Recipient Email (Inquiry Inbox)</span><input type="email" id="smtp-recipient-email" name="recipient_email" value="' + esc(recEmail) + '" placeholder="e.g. info@yourdomain.com" autocomplete="off"><small>Inquiries from the website contact forms will be sent to this email address.</small></label>' +
      '<label class="db-field"><span>SMTP password ' + (c.smtp_password_set ? '<b class="db-okc">(saved, leave blank to keep it)</b>' : '') + '</span><input type="password" name="smtp_password" placeholder="' + (c.smtp_password_set ? '••••••••' : 'Enter the SMTP password') + '" autocomplete="new-password"></label>' +
      '<h2>CC mail</h2><p class="db-sub">Each form keeps its own list. A row needs a product or a region (or both): with both set, the visitor\'s choice must match both for the person to get a copy.</p>' +
      '<div class="db-tabs">' + ccForms().map(function (f) { return '<button type="button" class="' + (ccForm === f[0] ? 'on' : '') + '" data-ccform="' + f[0] + '">' + esc(f[1]) + '</button>'; }).join('') + '</div>' +
      '<div id="ccList">' + (rows || '<div class="db-sub" style="padding:10px 0">No one is copied on this form yet.</div>') + '</div><button type="button" class="db-btn db-btn-ghost-dark db-btn-sm" data-ccadd="1">+ Add CC</button>' +
      '<div class="db-panel-foot"><div class="db-test"><input type="text" id="emailTestTo" class="db-search" placeholder="Send a test email to…"><button type="button" class="db-btn db-btn-ghost-dark" data-emailtest="1">Send test</button></div><span class="db-form-msg" id="emailMsg" role="alert"></span><button type="submit" class="db-btn db-btn-red" id="emailSave">Save configuration</button></div></form>';
  }
  function readCc(el) {
    var i = parseInt(el.closest('[data-ci]').getAttribute('data-ci'), 10), e = ccAll[i], k = el.getAttribute('data-cc'); if (!e) return false;
    if (k === 'name' || k === 'email') e[k] = el.value.trim();
    else if (k === 'prod') e.products = [].slice.call(el.closest('.db-checks').querySelectorAll('input:checked')).map(function (x) { return x.value; });
    else if (k === 'values') e.values = el.value.split(',').map(function (x) { return x.trim().toUpperCase(); }).filter(Boolean);
    else if (k === 'type') { e.type = el.value; if (e.type !== 'us_state' && e.type !== 'country') e.values = []; return true; }
    return false;
  }
  function saveEmail(ev) {
    ev.preventDefault(); var f = $('#emailForm'), msg = $('#emailMsg'), btn = $('#emailSave'); msg.textContent = '';
    var bad = null;
    ccAll.forEach(function (e, i) {
      if (bad || !e.email) return; var f2 = (ccForms().filter(function (x) { return x[0] === e.form; })[0] || [0, e.form])[1];
      if (!EMAILRE.test(e.email)) bad = f2 + ': "' + e.email + '" is not a valid email.';
      else if (e.type === 'none' && !e.products.length && (e.form === 'support' || e.form === 'credit_application')) bad = f2 + ': choose a product or a region for ' + e.email + '.';
      else if ((e.type === 'us_state' || e.type === 'country') && !e.values.length) bad = f2 + ': enter the ' + (e.type === 'us_state' ? 'state' : 'country') + ' codes for ' + e.email + '.';
    });
    if (bad) { msg.textContent = bad; return; }
    var recVal = (f.elements.recipient_email ? f.elements.recipient_email.value : ($('#smtp-recipient-email') ? $('#smtp-recipient-email').value : '')).trim() || null;
    var port = parseInt(f.elements.smtp_port.value, 10), body = { provider_mode: 'smtp', smtp_host: f.elements.smtp_host.value.trim() || null, smtp_port: port || null, smtp_username: f.elements.smtp_username.value.trim() || null,
      recipient_email: recVal, from_email: recVal,
      cc_emails: ccAll.filter(function (e) { return e.email; }).map(function (e) { return { name: e.name, email: e.email, form: e.form, type: e.type, values: e.values, products: e.products }; }) };
    if (f.elements.smtp_password.value) body.smtp_password = f.elements.smtp_password.value;
    btn.disabled = true; btn.textContent = 'Saving…';
    api('PUT', '/api/v2/email-config', body).then(function (cfg) { setEmail(cfg); drawEmail(); toast('Email configuration saved.'); logHistory('email-config', 'Email configuration', 'Updated'); })
      .catch(function (e) { msg.textContent = e.message; btn.disabled = false; btn.textContent = 'Save configuration'; });
  }
  function testEmail() {
    var to = ($('#emailTestTo').value || '').trim(), msg = $('#emailMsg');
    if (!EMAILRE.test(to)) { msg.textContent = 'Enter a valid email address to send the test to.'; return; }
    msg.textContent = 'Sending…'; api('POST', '/api/v2/email-config/test', { to: to }).then(function (r) { msg.textContent = ''; toast((r && r.message) || 'Test email sent.'); }).catch(function (e) { msg.textContent = e.message; });
  }

  /* ----- change password */
  function pwField(name, label, ac) { return '<label class="db-field"><span>' + label + '</span><div class="db-pwbox"><input type="password" name="' + name + '" autocomplete="' + ac + '"><button type="button" class="db-eye" data-eye="1" aria-label="Show password">Show</button></div></label>'; }
  function openPw() {
    var o = overlay('pwModal', '<div class="db-modal-box" style="max-width:460px"><div class="db-modal-head"><h2>Change password</h2><button class="db-x" type="button" data-close="pwModal" aria-label="Close">×</button></div><form id="pwForm" novalidate><div class="db-modal-body" style="grid-template-columns:1fr">' +
      pwField('cur', 'Current password', 'current-password') + pwField('nw', 'New password (at least 8 characters)', 'new-password') + pwField('cf', 'Confirm new password', 'new-password') + '</div><div class="db-modal-foot"><span class="db-form-msg" id="pwMsg" role="alert"></span><button class="db-btn db-btn-ghost" type="button" data-close="pwModal">Cancel</button><button class="db-btn db-btn-red" type="submit" id="pwSave">Update password</button></div></form></div>');
    var form = $('#pwForm', o), msg = $('#pwMsg', o); form.elements.cur.focus();
    form.addEventListener('submit', function (e) {
      e.preventDefault(); var cur0 = form.elements.cur.value, nw = form.elements.nw.value, cf = form.elements.cf.value;
      if (!cur0 || !nw || !cf) { msg.textContent = 'All fields are required.'; return; }
      if (nw.length < 8) { msg.textContent = 'The new password must be at least 8 characters.'; return; }
      if (nw !== cf) { msg.textContent = 'The new password and its confirmation do not match.'; return; }
      var b = $('#pwSave', o); b.disabled = true; b.textContent = 'Updating…'; msg.textContent = '';
      api('POST', '/api/admin/change-password', { currentPassword: cur0, newPassword: nw }).then(function () { o.remove(); toast('Password updated.'); })
        .catch(function (err) { msg.textContent = err.message; b.disabled = false; b.textContent = 'Update password'; });
    });
  }

  var isAdmin = true, pendingFlag = false;
  /* ---------------------------------------------------------------- admin only: pending approvals + team & access */
  // An editor's saves are not published: the backend queues them (status PENDING_APPROVAL) and an admin approves or rejects them here.
  var pendingN = null, teamUsers = [], me = {};
  var TYPE_LABEL = { 'page-elements': 'Page content', solutions: 'Solution', stories: 'Project Highlight', resources: 'Resource' };
  var IGNORED = ['id', 'created_at', 'updated_at', 'is_deleted', 'is_active'];
  var shortVal = function (v) {
    if (v == null || v === '') return '<span class="db-sub">(empty)</span>';
    if (looksImage(v)) return '<img class="db-thumb" src="' + esc(v) + '" alt="">';
    var t = (typeof v === 'object' ? JSON.stringify(v) : String(v)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); return esc(t.length > 200 ? t.slice(0, 200) + '…' : t) || '<span class="db-sub">(empty)</span>';
  };
  function diffRows(c) {
    var before = c.current_payload || {}, after = c.request_payload || {};
    if (c.request_type === 'page-elements' || !c.request_type) return [[c.element_key || '', before.content_value, after.content_value]];
    var fields = Object.keys(before).concat(Object.keys(after)).filter(function (f, i, a) { return a.indexOf(f) === i && IGNORED.indexOf(f) < 0; });
    return fields.filter(function (f) { return JSON.stringify(before[f]) !== JSON.stringify(after[f]); }).map(function (f) { return [f, before[f], after[f]]; });
  }
  function refreshPending() {
    if (!isAdmin) return Promise.resolve();
    return api('GET', '/api/v2/approvals').then(function (rows) { pendingN = Array.isArray(rows) ? rows.filter(function (c) { return c.element_key !== 'PAGE_LAYOUT'; }).length : 0; renderSide(); }).catch(function () { });
  }
  function renderApprovals() {
    $('#main').innerHTML = '<div class="db-head"><div><h1>Pending Approvals</h1><p>Changes submitted by editors. Approve to publish them on the website, or reject to discard them.</p></div><div class="db-tools"><button class="db-btn db-btn-red" type="button" data-go="approvals">Refresh</button></div></div><div id="apBody"><div class="db-empty">Loading…</div></div>';
    Promise.all([api('GET', '/api/v2/approvals'), api('GET', '/api/v2/team-access/users').catch(function () { return []; })]).then(function (r) {
      if (cur !== 'approvals') return;
      var rows = (Array.isArray(r[0]) ? r[0] : []).filter(function (c) { return c.element_key !== 'PAGE_LAYOUT'; }), users = Array.isArray(r[1]) ? r[1] : [], box = $('#apBody');
      pendingN = rows.length; renderSide();
      if (!rows.length) { box.innerHTML = '<div class="db-empty">No changes are waiting for approval.</div>'; return; }
      box.innerHTML = rows.map(function (c) {
        var who = users.filter(function (u) { return u.id === c.submitted_by; })[0], w = fmtWhen(c.created_at), diff = diffRows(c);
        return '<div class="db-ap"><div class="db-ap-head"><div><span class="db-pill">' + esc(TYPE_LABEL[c.request_type] || c.request_type || 'Change') + '</span> <span class="db-sub">' + esc(w[0] + ' ' + w[1]) + ' · by ' + esc(who ? who.username : 'an editor') + (c.page_slug ? ' · page ' + esc(c.page_slug) : '') + '</span></div>' +
          '<div class="db-actions"><button class="db-btn db-btn-danger db-btn-sm" type="button" data-apno="' + esc(c.id) + '">Reject</button><button class="db-btn db-btn-red db-btn-sm" type="button" data-apok="' + esc(c.id) + '">Approve &amp; publish</button></div></div>' +
          '<div class="db-ap-row h"><div>Field</div><div>Current</div><div>Proposed</div></div>' + (diff.length ? diff.map(function (d) { return '<div class="db-ap-row"><div class="k">' + esc(d[0]) + '</div><div>' + shortVal(d[1]) + '</div><div>' + shortVal(d[2]) + '</div></div>'; }).join('') : '<div class="db-sub" style="padding:8px 0">No field-level changes to show.</div>') + '</div>';
      }).join('');
    }).catch(function (e) { $('#apBody').innerHTML = '<div class="db-empty">' + esc(e.message) + '</div>'; });
  }
  function decide(id, ok) {
    if (ok) return decideNow(id, true);
    RGDialog.confirm({ title: 'Reject this change?', message: 'The editor\'s change is discarded and will not be published.', ok: 'Reject', danger: true }).then(function (go) { if (go) decideNow(id, false); });
  }
  function decideNow(id, ok) {
    api('POST', '/api/v2/approvals/' + id + (ok ? '/approve' : '/reject'), ok ? undefined : {}).then(function () { toast(ok ? 'Approved and published.' : 'Change rejected.'); if (ok) { notify(); logHistory('approvals', 'Approved change', 'Published'); } renderApprovals(); })
      .catch(function (e) { toast(e.message, true); });
  }

  var roleBadge = function (r) { return '<span class="db-pill ' + (r === 'admin' ? 'off' : 'on') + '" style="' + (r === 'admin' ? 'background:#FBE7E4' : 'background:#E4ECFB;color:#2c2e35') + '">' + esc(String(r || 'editor').toUpperCase()) + '</span>'; };
  function renderTeam() {
    $('#main').innerHTML = '<div class="db-head"><div><h1>Team &amp; Access</h1><p>Admins publish directly. Editors can change content, but their changes wait in Pending Approvals until an admin approves them.</p></div><div class="db-tools"><button class="db-btn db-btn-red" type="button" data-teamadd="1">+ Add new user</button></div></div><div id="teamBody"><div class="db-empty">Loading…</div></div>';
    api('GET', '/api/v2/team-access/users').then(function (users) {
      if (cur !== 'team') return; teamUsers = Array.isArray(users) ? users : [];
      var admins = teamUsers.filter(function (u) { return u.role === 'admin'; }).length;
      $('#teamBody').innerHTML = '<div class="db-table-wrap"><table class="db-table"><thead><tr><th>User</th><th>Role</th><th>Changes</th><th></th></tr></thead><tbody>' + teamUsers.map(function (u) {
        var self = u.id === me.adminId, last = u.role === 'admin' && admins <= 1;
        return '<tr><td><div class="db-title">' + esc(u.username || u.email) + (self ? ' <span class="db-sub">(you)</span>' : '') + '</div><div class="db-sub">' + esc(u.email || '') + '</div></td><td>' + roleBadge(u.role) + '</td><td>' + esc(u.changes_count == null ? 0 : u.changes_count) + '</td><td><div class="db-actions"><button class="db-btn db-btn-ghost db-btn-sm" type="button" data-uedit="' + esc(u.id) + '">Edit</button><button class="db-btn db-btn-ghost db-btn-sm" type="button" data-ureset="' + esc(u.id) + '">Reset password</button>' +
          (!self && !last ? '<button class="db-btn db-btn-danger db-btn-sm" type="button" data-udel="' + esc(u.id) + '">Remove</button>' : (last ? '<span class="db-sub" title="At least one admin must remain">Last admin</span>' : '')) + '</div></td></tr>';
      }).join('') + '</tbody></table></div>';
    }).catch(function (e) { $('#teamBody').innerHTML = '<div class="db-empty">' + esc(e.message) + '</div>'; });
  }
  function userModal(u) {
    var isNew = !u;
    var o = overlay('userModal', '<div class="db-modal-box" style="max-width:640px"><div class="db-modal-head"><h2>' + (isNew ? 'Add new user' : 'Edit user') + '</h2><button class="db-x" type="button" data-close="userModal" aria-label="Close">×</button></div><form id="userForm" novalidate><div class="db-modal-body">' +
      '<label class="db-field"><span>Email <b>*</b></span><input type="text" name="email" value="' + esc(u && u.email) + '" placeholder="name@company.com" autocomplete="off">' + (isNew ? '' : '<small>Changing the email also changes the login: they sign in with the new address next time.</small>') + '</label>' +
      '<label class="db-field"><span>Username</span><input type="text" name="username" value="' + esc(u && u.username) + '" placeholder="Defaults to the email" autocomplete="off"></label>' +
      (isNew ? pwField('password', 'Password (at least 6 characters)', 'new-password') + '<label class="db-field"><span>Role</span><select name="role"><option value="editor">Editor (changes need approval)</option><option value="admin">Admin (publishes directly)</option></select></label>' : '') +
      '</div><div class="db-modal-foot"><span class="db-form-msg" id="userMsg" role="alert"></span><button class="db-btn db-btn-ghost" type="button" data-close="userModal">Cancel</button><button class="db-btn db-btn-red" type="submit" id="userSave">' + (isNew ? 'Create user' : 'Save') + '</button></div></form></div>');
    var form = $('#userForm', o), msg = $('#userMsg', o); form.elements.email.focus();
    form.addEventListener('submit', function (e) {
      e.preventDefault(); var email = form.elements.email.value.trim(), username = form.elements.username.value.trim();
      if (!EMAILRE.test(email)) { msg.textContent = 'Enter a valid email address.'; return; }
      var req;
      if (isNew) { var pw = form.elements.password.value; if (pw.length < 6) { msg.textContent = 'The password must be at least 6 characters.'; return; } req = api('POST', '/api/v2/team-access/users', { username: username || email, email: email, password: pw, role: form.elements.role.value }); }
      else req = api('PATCH', '/api/v2/team-access/users/' + u.id, { username: username || email, email: email });
      var b = $('#userSave', o); b.disabled = true; msg.textContent = '';
      req.then(function () { o.remove(); toast(isNew ? 'User created.' : 'User updated.'); renderTeam(); }).catch(function (err) { msg.textContent = err.message; b.disabled = false; });
    });
  }
  function resetModal(u) {
    var o = overlay('resetModal', '<div class="db-modal-box" style="max-width:460px"><div class="db-modal-head"><h2>Reset password</h2><button class="db-x" type="button" data-close="resetModal" aria-label="Close">×</button></div><form id="resetForm" novalidate><div class="db-modal-body" style="grid-template-columns:1fr">' +
      pwField('pw', 'New password for ' + esc(u.username || u.email) + ' (at least 6 characters)', 'new-password') + '</div><div class="db-modal-foot"><span class="db-form-msg" id="resetMsg" role="alert"></span><button class="db-btn db-btn-ghost" type="button" data-close="resetModal">Cancel</button><button class="db-btn db-btn-red" type="submit" id="resetSave">Reset password</button></div></form></div>');
    var form = $('#resetForm', o), msg = $('#resetMsg', o); form.elements.pw.focus();
    form.addEventListener('submit', function (e) {
      e.preventDefault(); var pw = form.elements.pw.value; if (pw.length < 6) { msg.textContent = 'The password must be at least 6 characters.'; return; }
      var b = $('#resetSave', o); b.disabled = true; msg.textContent = '';
      api('POST', '/api/v2/team-access/users/' + u.id + '/reset-password', { newPassword: pw }).then(function () { o.remove(); toast('Password reset.'); }).catch(function (err) { msg.textContent = err.message; b.disabled = false; });
    });
  }
  function removeUser(u) {
    RGDialog.confirm({ title: 'Remove this user?', message: 'Remove ' + (u.username || u.email) + '?\nThis permanently removes their account and login access.', ok: 'Remove', danger: true }).then(function (go) {
      if (!go) return;
      api('DELETE', '/api/v2/team-access/users/' + u.id).then(function () { toast('User removed.'); renderTeam(); }).catch(function (e) { toast(e.message, true); });
    });
  }
  var userById = function (id) { return teamUsers.filter(function (u) { return String(u.id) === String(id); })[0]; };

  /* ---------------------------------------------------------------- wiring */
  document.addEventListener('change', function (e) { var sel = e.target.closest && e.target.closest('[data-rprodsel]'); if (sel) { resProd = sel.value; renderList('resources'); } });   // Resources: product filter
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-go],[data-add],[data-edit],[data-del],[data-clear],[data-pw],[data-close],[data-eye],[data-ccform],[data-ccadd],[data-ccdel],[data-emailtest],[data-apok],[data-apno],[data-teamadd],[data-uedit],[data-ureset],[data-udel],[data-rtab],[data-rprod]'); if (!t) return;
    if (t.hasAttribute('data-go')) show(t.getAttribute('data-go'));
    else if (t.hasAttribute('data-pw')) { document.body.classList.remove('menu-open'); openPw(); }
    else if (t.hasAttribute('data-close')) { var ov = document.getElementById(t.getAttribute('data-close')); if (ov) ov.remove(); }
    else if (t.hasAttribute('data-eye')) { var pi = t.parentNode.querySelector('input'), sh = pi.type === 'password'; pi.type = sh ? 'text' : 'password'; t.textContent = sh ? 'Hide' : 'Show'; }
    else if (t.hasAttribute('data-ccform')) { ccForm = t.getAttribute('data-ccform'); drawEmail(); }
    else if (t.hasAttribute('data-ccadd')) { ccAll.push({ name: '', email: '', form: ccForm, type: 'none', values: [], products: [] }); drawEmail(); var ins = document.querySelectorAll('#ccList [data-cc="name"]'); if (ins.length) ins[ins.length - 1].focus(); }
    else if (t.hasAttribute('data-ccdel')) { ccAll.splice(parseInt(t.getAttribute('data-ccdel'), 10), 1); drawEmail(); }
    else if (t.hasAttribute('data-emailtest')) testEmail();
    else if (t.hasAttribute('data-rtab')) { resTab = t.getAttribute('data-rtab'); renderList('resources'); }
    else if (t.hasAttribute('data-rprod')) { resProd = t.getAttribute('data-rprod'); renderList('resources'); }
    else if (t.hasAttribute('data-apok')) decide(t.getAttribute('data-apok'), true);
    else if (t.hasAttribute('data-apno')) decide(t.getAttribute('data-apno'), false);
    else if (t.hasAttribute('data-teamadd')) userModal(null);
    else if (t.hasAttribute('data-uedit')) { var u1 = userById(t.getAttribute('data-uedit')); if (u1) userModal(u1); }
    else if (t.hasAttribute('data-ureset')) { var u2 = userById(t.getAttribute('data-ureset')); if (u2) resetModal(u2); }
    else if (t.hasAttribute('data-udel')) { var u3 = userById(t.getAttribute('data-udel')); if (u3) removeUser(u3); }
    else if (t.hasAttribute('data-add')) openEditor(t.getAttribute('data-add'), null);
    else if (t.hasAttribute('data-edit')) { var m = MODS[cur], row = (m.rows || []).filter(function (r) { return String(r.id) === t.getAttribute('data-edit'); })[0]; if (row) openEditor(cur, row); }
    else if (t.hasAttribute('data-del')) remove(cur, t.getAttribute('data-del'));
    else if (t.hasAttribute('data-clear')) { var box = t.closest('[data-up]'); $('input[name="' + t.getAttribute('data-clear') + '"]', box).value = ''; $('.pv', box).innerHTML = '<div class="ph">' + (box.getAttribute('data-kind') === 'image' ? 'no photo yet' : 'no file yet') + '</div>'; }
  });
  document.addEventListener('change', function (e) { if (e.target.matches('#editor input[type=file]')) onUpload(e.target); else if (e.target.matches('#editor [name=document_type]')) syncResForm(); });
  document.addEventListener('input', function (e) { if (e.target.matches('[data-cc]') && e.target.getAttribute('data-cc') !== 'type' && e.target.getAttribute('data-cc') !== 'prod') readCc(e.target); });
  document.addEventListener('change', function (e) { if (e.target.matches('[data-cc]') && readCc(e.target)) drawEmail(); });
  document.addEventListener('submit', function (e) { if (e.target.id === 'emailForm') saveEmail(e); });
  $('#editor').addEventListener('submit', save);
  $('#modalClose').addEventListener('click', closeEditor);
  $('#cancelBtn').addEventListener('click', closeEditor);
  // (the add / edit form is NOT closed by a click outside it: the page scrollbar sits on that backdrop and a click there closed the form with everything typed in)
  document.addEventListener('keydown', function (e) { if (e.key !== 'Escape') return; ['pwModal', 'histView', 'userModal', 'resetModal'].forEach(function (id) { var o = document.getElementById(id); if (o) o.remove(); }); if (!$('#modal').hidden) closeEditor(); });
  $('#menuBtn').addEventListener('click', function () { var o = document.body.classList.toggle('menu-open'); $('#menuBtn').setAttribute('aria-expanded', o ? 'true' : 'false'); });
  $('#logoutBtn').addEventListener('click', function () { fetch('/api/admin/logout', { method: 'POST', credentials: 'include' }).catch(function () { }).then(function () { try { localStorage.removeItem('rg-admin'); localStorage.removeItem('rg-cache-v1'); localStorage.removeItem('rg-cache-t'); } catch (e) { /* ignore */ } goLogin(); }); });

  /* ---------------------------------------------------------------- start: must be signed in */
  fetch('/api/admin/status', { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : { loggedIn: false }; }).catch(function () { return { loggedIn: false }; }).then(function (s) {
    if (!s || !s.loggedIn) { goLogin(); return; }
    isAdmin = s.role !== 'editor'; me = s;
    $('#who').textContent = (s.username || 'admin') + (s.role ? ' · ' + s.role : '');
    $('#boot').hidden = true; $('#app').hidden = false;
    var start = (location.hash || '').replace('#', ''); cur = KEYS.indexOf(start) >= 0 || (SETTINGS.concat([['approvals'], ['team']]).some(function (x) { return x[0] === start; }) && allowed([start])) ? start : 'overview';
    renderSide(); if (cur === 'overview') renderOverview(); else if (cur === 'history') renderHistory(); else if (cur === 'email') loadEmail(); else if (cur === 'approvals') renderApprovals(); else if (cur === 'team') renderTeam(); else renderList(cur);
    refreshPending();
    Promise.all(KEYS.map(loadModule)).then(function () { renderSide(); if (cur === 'overview') renderOverview(); else if (KEYS.indexOf(cur) >= 0) renderList(cur); }).catch(function (e) { toast(e.message, true); });
  });
})();
