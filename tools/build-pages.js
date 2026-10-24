#!/usr/bin/env node
/*
 * build-pages: turns the single-file design (_original/index.original.html - an "x-dc" component with state-driven
 * screens) into ONE STATIC HTML FILE PER PAGE, same look, no framework at run time.
 *
 *   node tools/build-pages.js
 *
 * How: the original component logic + template are run here in Node; every page is rendered once for its default
 * state. Parts the original switched by state (product tabs, resource filters, list / grid, project gallery, the credit
 * steps, forms "sent" message ...) are rendered once per state into <div data-vgroup=.. data-vstate=..> blocks; js/site.js
 * shows the right block. Images are referenced as .webp (see tools/make-images.js).
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const ROOT = path.join(__dirname, '..');

// ------------------------------------------------------------------ pages
const PAGES = {
  home:       { file: 'index.html',               title: 'RockGuard® HD Pipeline Protection Mesh | Industrial Fabrics, Inc.', desc: 'RockGuard® HD is the standard in pipeline asset protection: an 11 mm bi-planar extruded diamond mesh rock shield. Manufactured by Industrial Fabrics, Inc.' },
  products:   { file: 'products.html',            title: 'Products | RockGuard® HD Pipeline Protection', desc: 'RockGuard® HD pipeline protection mesh, PipeWeights buoyancy bags and installation accessories.' },
  resources:  { file: 'resources.html',           title: 'Resources | RockGuard® HD Pipeline Protection', desc: 'RockGuard® HD data sheets, sizing charts, installation guides, brochures, specifications and safety documents.' },
  highlights: { file: 'project-highlights.html',  title: 'Project Highlights | RockGuard® HD Pipeline Protection', desc: 'Pipeline project highlights: RockGuard® and PipeWeights in the field.' },
  credit:     { file: 'credit-application.html',  title: 'Apply for Credit | RockGuard® HD Pipeline Protection', desc: 'Apply for a credit account with Industrial Fabrics, Inc.' },
  contact:    { file: 'contact.html',             title: 'Contact Us | RockGuard® HD Pipeline Protection', desc: 'Contact the RockGuard® team at Industrial Fabrics, Inc. for quotes, specifications and support.' },
  lunch:      { file: 'lunch-learn.html',         title: 'Lunch & Learn | RockGuard® HD Pipeline Protection', desc: 'Request a RockGuard® Lunch & Learn session for your team.' },
};
const projectFile = i => 'project-highlight-' + (i + 1) + '.html';
const VIEW_FILE = Object.fromEntries(Object.entries(PAGES).map(([k, v]) => [k, v.file]));

// ------------------------------------------------------------------ the template and the logic of the original (tools/original.js)
const { Component, HIGHLIGHTS, FILTERS, tpl, US_STATES, CA_PROV, MX_STATES } = require('./original');
const PROD_NAMES = ['All Products', 'RockGuard® HD', 'PipeWeights', 'Accessories'];
const $ = cheerio.load(tpl, { _useHtmlParser2: true, decodeEntities: false, lowerCaseAttributeNames: true });
const rootNodes = $.root()[0].children;

// which parts of a page are switched by state: [first section index, last section index, state patches]
// (section index = position of the section among the view's own top-level elements; see numberChildren)
const range = (key, from, to) => Array.from({ length: to - from + 1 }, (_, i) => ({ [key]: from + i }));
const cross = (a, b) => a.flatMap(x => b.map(y => ({ ...x, ...y })));
const CSTEPS_N = 6;
const GROUPS = {
  home: [],
  products: [{ id: 'prod', from: 0, to: 2, def: { product: 'hd' }, states: [{ product: 'hd' }, { product: 'pw' }, { product: 'acc' }] }],
  resources: [{ id: 'res', from: 1, to: 1, def: { filter: 'Downloads', prod: 'All Products' }, states: cross(FILTERS.map(f => ({ filter: f })), PROD_NAMES.map(p => ({ prod: p }))) }],
  highlights: [{ id: 'pm', from: 1, to: 1, def: { hlView: 'grid' }, states: [{ hlView: 'grid' }, { hlView: 'list' }] }],
  project: i => [{ id: 'pj', from: 2, to: 3, def: { hlImg: 0, hlCs: 'challenge' }, states: cross(range('hlImg', 0, HIGHLIGHTS[i].images.length - 1), [{ hlCs: 'challenge' }, { hlCs: 'solution' }]),
    patch: st => ({ hlTs: Math.max(0, Math.min(st.hlImg - 2, HIGHLIGHTS[i].images.length - 3)) }) }],
  contact: [{ id: 'sent', from: 1, to: 1, def: { sent: false }, states: [{ sent: false }, { sent: true }] }],
  lunch: [{ id: 'lsent', from: 2, to: 2, def: { lunchSent: false }, states: [{ lunchSent: false }, { lunchSent: true }] }],
  credit: [{ id: 'cstep', from: 1, to: 1, def: { cstep: 0, csent: false }, states: [...range('cstep', 0, CSTEPS_N - 1).map(s => ({ ...s, csent: false })), { csent: true }] }],
};

// ------------------------------------------------------------------ render helpers
const UNITLESS = new Set(['opacity', 'flex', 'flexGrow', 'flexShrink', 'fontWeight', 'zIndex', 'lineHeight', 'order', 'aspectRatio', 'orphans', 'widows', 'zoom']);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => esc(s).replace(/"/g, '&quot;');
const VOID = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source']);
const BOOL = new Set(['required', 'checked', 'disabled', 'allowfullscreen']);
const getPath = (scope, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope);
const exprOf = s => { const m = /^\s*\{\{\s*([\w.$]+)\s*\}\}\s*$/.exec(s || ''); return m ? m[1] : null; };

// webp: every image reference (remote rockguard.biz uploads and local images/) points at the converted file (tools/make-images.js)
const safeName = n => n.replace(/[^A-Za-z0-9_-]+/g, '-');
const toWebp = s => String(s)
  .replace(/https:\/\/rockguard\.biz\/wp-content\/uploads\/\d{4}\/\d{2}\/([^\/"' )]+?)\.(?:jpe?g|png)\b/g, (m, n) => 'images/' + safeName(n) + '.webp')
  .replace(/(?:\.\/)?images\/([\w.-]+?)\.(?:jpe?g|png)\b/g, (m, n) => 'images/' + safeName(n) + '.webp');

function makeInstance(page, patch) {
  const inst = new Component();
  inst.state = Object.assign({}, inst.state, { page }, patch || {});
  inst.__rec = null;
  inst.go = (p, product) => { inst.__rec = { show: p, product }; };
  inst.setState = p => { inst.__rec = { set: typeof p === 'function' ? p(inst.state) : p }; };
  return inst;
}
function descriptorOf(inst, fn) {
  inst.__rec = null;
  try { fn({ preventDefault() { }, stopPropagation() { }, target: { value: '', checked: false, type: 'text' } }); } catch (e) { /* ignore */ }
  return inst.__rec;
}
const PROD_PARAM = { hd: 'hd', pw: 'pw', acc: 'acc', tape: 'acc', hop: 'acc' };

// attribute names that only make sense for the component runtime
const ACTS = { ssPrev: 'ss-prev', ssNext: 'ss-next', hlPrev: 'hl-prev', hlNext: 'hl-next', hlThumbUp: 'hl-up', hlThumbDown: 'hl-down', cNext: 'c-next', cBack: 'c-back', cToggleSale: 'toggle-sale', cReset: 'c-reset', resetForm: 'form-reset', lunchReset: 'form-reset' };

function renderAttrs(el, scope, inst) {
  const out = []; const tag = el.name; const view = inst.state.page;
  for (const [name, raw] of Object.entries(el.attribs)) {
    if (name.startsWith('hint-')) continue;
    if (name === 'ref') { if (/lunchForm/.test(raw)) out.push('id="lunch-form"'); continue; }
    if (name === 'onclick') {
      const e = exprOf(raw);
      if (e === 'goHome') { out.push('data-href="index.html"'); continue; }
      const last = (e || '').split('.').pop();
      if (ACTS[last] || ACTS[e]) { out.push('data-act="' + (ACTS[last] || ACTS[e]) + '"'); continue; }
      if (e === 'hlBack') { out.push('data-href="' + VIEW_FILE.highlights + '"'); continue; }
      const fn = e ? getPath(scope, e) : null; if (typeof fn !== 'function') continue;
      const rec = descriptorOf(inst, fn); if (!rec) continue;
      if (rec.show) {
        if (rec.show === 'products' && rec.product) {
          const pr = PROD_PARAM[rec.product] || rec.product;
          if (view === 'products') out.push("data-set='{\"product\":\"" + pr + "\"}'"); else out.push('data-href="' + VIEW_FILE.products + '?prod=' + pr + '"');
        } else if (VIEW_FILE[rec.show]) out.push('data-href="' + VIEW_FILE[rec.show] + '"');
      } else if (rec.set) {
        const s = rec.set;
        if ('menu' in s) continue;                                  // the Support dropdown is handled by js/site.js
        if (s.hlMode === 'detail') { out.push('data-href="' + projectFile(s.hl || 0) + '"'); continue; }
        if ('cf' in s) { out.push('data-agree="' + Object.keys(s.cf)[0] + '"'); continue; }
        out.push("data-set='" + JSON.stringify(s).replace(/'/g, '&#39;') + "'");
      }
      continue;
    }
    if (name === 'onmouseenter') { if (exprOf(raw) === 'ssPause') out.push('data-ss="host"'); continue; }
    if (name === 'onmouseleave' || name === 'ontransitionend') continue;
    if (name === 'onchange') {
      const e = exprOf(raw); const fn = e ? getPath(scope, e) : null; if (typeof fn !== 'function') continue;
      const rec = descriptorOf(inst, fn);
      if (rec && rec.set) { const k = Object.keys(rec.set)[0]; out.push('data-f="' + (k === 'cf' ? Object.keys(rec.set.cf)[0] : k) + '"'); }
      continue;
    }
    if (name === 'onsubmit') {
      const e = exprOf(raw) || '';
      out.push('data-submit="' + (e === 'submit' ? 'contact' : e === 'lunchSubmit' ? 'lunch' : e) + '"'); continue;
    }
    if (name === 'value' && (tag === 'select' || tag === 'textarea')) continue;
    if (name === 'value' && tag === 'input') continue;
    if (BOOL.has(name)) {
      const e = exprOf(raw); const v = e ? getPath(scope, e) : raw;
      if (v && v !== 'false') out.push(name === 'allowfullscreen' ? 'allowfullscreen' : name);
      continue;
    }
    const pure = exprOf(raw);
    if (pure && name !== 'alt') { const v = getPath(scope, pure); if (v == null || v === false || v === '') continue; }
    const val = raw.replace(/\{\{\s*([\w.$]+)\s*\}\}/g, (m, p) => { const v = getPath(scope, p); return v == null || v === false ? '' : escAttr(v); });
    out.push(name + '="' + toWebp(val) + '"');
  }
  // credit form: the fields marked with * are required
  if ((tag === 'input' || tag === 'select') && scope.f && typeof scope.f.label === 'string' && / \*$/.test(scope.f.label) && view === 'credit') out.push('data-req="1"');
  if (tag === 'img' && !el.attribs.loading && !/^rg4$/.test(el.attribs.class || '') && !/IMG_0097_crop/.test(el.attribs.src || '')) out.push('loading="lazy"');
  return out.filter(Boolean);
}
const joinAttrs = parts => parts.length ? ' ' + parts.join(' ') : '';

// section numbering of a view: the direct elements of the view, looking through nested sc-if
function numberChildren(nodes, scope, inst, counter) {
  return nodes.map(c => {
    if (c.type === 'tag' && c.name === 'sc-if') {
      const p = exprOf(c.attribs.value); if (!(p ? getPath(scope, p) : false)) return '';
      return numberChildren(c.children || [], scope, inst, counter);
    }
    if (c.type !== 'tag') return renderNode(c, scope, inst);
    const html = renderNode(c, scope, inst), i = counter.n++;
    return html.replace(/^<([a-zA-Z0-9]+)/, '<$1 data-sec="' + i + '"');
  }).join('');
}
const VIEW_FLAGS = new Set(['isHome', 'isProducts', 'isResources', 'isHighlights', 'isCredit', 'isLunch', 'isContact']);
const FILL = { sentName: 'name', lunchName: 'name' };

function renderNodes(nodes, scope, inst) { return nodes.map(n => renderNode(n, scope, inst)).join(''); }
function renderNode(n, scope, inst) {
  if (n.type === 'comment') return '';
  if (n.type === 'text') {
    return n.data.replace(/\{\{\s*([\w.$]+)\s*\}\}/g, (m, p) => {
      const v = getPath(scope, p); const s = v == null || v === false ? '' : esc(v);
      return FILL[p] ? '<span data-fill="' + FILL[p] + '">' + s + '</span>' : s;
    });
  }
  if (n.type !== 'tag' && n.type !== 'script' && n.type !== 'style') return '';
  const tag = n.name;
  if (tag === 'helmet') return '';   // design-tool head block: the page head has its own links
  if (tag === 'x-dc') return renderNodes(n.children || [], scope, inst);
  if (tag === 'sc-if') {
    const p = exprOf(n.attribs.value); const v = p ? getPath(scope, p) : false;
    if (VIEW_FLAGS.has(p)) return v ? numberChildren(n.children || [], scope, inst, { n: 0 }) : '';
    // parts the page script shows / hides without a state: rendered, but hidden
    if (!v && !['hlEmpty', 'cShowSale'].includes(p) && !(p === 'n.open' && scope.n && scope.n.hasMenu)) return '';
    let html = renderNodes(n.children || [], scope, inst);
    // the Support dropdown (n.open) is always rendered but hidden: js/site.js opens it on hover / click
    if (!v || p === 'n.open') html = html.replace(/^(\s*<[a-z0-9]+)/, '$1 ' + (p === 'hlEmpty' ? 'data-hl-empty' : p === 'cShowSale' ? 'data-sale' : 'data-dd') + ' hidden');
    else if (p === 'cShowSale') html = html.replace(/^(\s*<ol)/, '$1 data-sale hidden');
    return html;
  }
  if (tag === 'sc-for') {
    const p = exprOf(n.attribs.list); const list = p ? getPath(scope, p) : [];
    const as = n.attribs.as || 'item';
    return (Array.isArray(list) ? list : []).map((item, i) => renderNodes(n.children || [], Object.assign({}, scope, { [as]: item, $index: i }), inst)).join('');
  }
  const attrs = joinAttrs(renderAttrs(n, scope, inst));
  if (VOID.has(tag)) return '<' + tag + attrs + '>';
  return '<' + tag + attrs + '>' + renderNodes(n.children || [], scope, inst) + '</' + tag + '>';
}

function renderView(view, patch) {
  const inst = makeInstance(view, patch);
  // the Support dropdown is part of the page (hidden until js/site.js opens it)
  inst.state.menu = 'support';
  const vals = inst.renderVals();
  return renderNodes(rootNodes, vals, inst);
}

// ------------------------------------------------------------------ assemble a page
const parse = html => cheerio.load('<div id="__root">' + html + '</div>', { _useHtmlParser2: true, decodeEntities: false, lowerCaseAttributeNames: true });
function assemble(viewKey, basePatch, groups) {
  const $p = parse(renderView(viewKey, basePatch));
  const defaults = {};
  for (const g of groups) {
    const blocks = g.states.map(st => {
      const r = renderView(viewKey, Object.assign({}, basePatch, st, g.patch ? g.patch(st) : {}));
      const $v = parse(r);
      let inner = '';
      for (let i = g.from; i <= g.to; i++) inner += $v.html($v('[data-sec="' + i + '"]').first());
      const active = Object.keys(st).every(k => st[k] === g.def[k]);
      return '<div data-vgroup="' + g.id + '" data-vstate="' + escAttr(JSON.stringify(st)) + '"' + (active ? '' : ' hidden') + '>' + inner + '</div>';
    }).join('');
    Object.assign(defaults, g.def);
    for (let i = g.to; i > g.from; i--) $p('[data-sec="' + i + '"]').first().remove();
    $p('[data-sec="' + g.from + '"]').first().replaceWith(blocks);
  }
  $p('[data-sec]').each((i, el) => { delete el.attribs['data-sec']; });
  $p('.rg69').each((i, el) => { $p(el).children().slice(-3).attr('data-nocms', '1'); });   // the 3 copies at the end of the home slider (endless loop) are not CMS elements
  let out = $p('#__root').html();
  // mobile menu button (shown by css/site.css below 1100px) in front of the main navigation
  out = out.replace('<nav class="rg5">', '<button class="rg-burger" aria-label="Open menu" aria-expanded="false" aria-controls="rg-nav"><span></span><span></span><span></span></button><nav class="rg5" id="rg-nav">');
  return { html: out, defaults };
}

// stable CMS keys (see tools/cms-tag.js); the registry file keeps every key that was ever handed out
const { tagPage } = require('./cms-tag');
const REG_FILE = path.join(__dirname, 'cms-keys.json');
const registry = fs.existsSync(REG_FILE) ? JSON.parse(fs.readFileSync(REG_FILE, 'utf8')) : {};
const tagStats = {};

// one footer for every page (tools/footer.html)
const FOOTER = fs.readFileSync(path.join(__dirname, 'footer.html'), 'utf8').replace('__YEAR__', String(new Date().getFullYear())).trim();
const withFooter = html => html.replace(/<footer[\s\S]*<\/footer>/, () => FOOTER);

// ------------------------------------------------------------------ add / remove: repeatable lists and sections (js/rg-sections.js)
// A list = a container (data-rlist) whose items (data-rit) are cloned from the first one; every text / photo / link of an item is a numbered
// slot (data-rs / data-ri / data-rl), so the edit mode can add, remove and fill items and SAVE keeps them as one JSON list.
const LISTS = {
  home: [['stats', '.rg32', '.rg33'], ['about', '.rg42', 'p.rg43']],
  lunch: [['faq', '.rg254', '.rg255']],
  contact: [['offices', '.rg283', '.rg285']],
  credit: [['terms', 'ol.rg208', 'li'], ['guaranty', '.rg210', 'p'], ['sale', 'ol.rg212', 'li']],
};
const FOOTER_LISTS = [['g-rl-footer-products', 'footer .rg301', 0, 'a'], ['g-rl-footer-company', 'footer .rg301', 1, 'a:not([data-rl-fixed])']];
const INLINE_TAGS = new Set(['span', 'b', 'i', 'em', 'strong', 'br', 'a', 'sup', 'sub', 'small', 'u', 'abbr', 'mark', 's', 'wbr']);
const TEXT_BLOCK_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'span', 'div', 'a', 'button', 'strong', 'em', 'td', 'th', 'address', 'b', 'i', 'small']);
function isTextBlock(el) {
  if (!TEXT_BLOCK_TAGS.has(el.name)) return false; let direct = false;
  for (const c of el.children || []) { if (c.type === 'text') { if (/\S/.test(c.data)) direct = true; } else if (c.type === 'tag') { if (!INLINE_TAGS.has(c.name)) return false; } else if (c.type !== 'comment') return false; }
  return direct;
}
function markStructure(html, pageKey) {
  const $m = cheerio.load('<div id="__m">' + html + '</div>', { _useHtmlParser2: true, decodeEntities: false, lowerCaseAttributeNames: true });
  const markList = (id, box, itemSel) => {
    const items = $m(box).children().filter((i, el) => $m(el).is(itemSel));
    if (!items.length) return;
    $m(box).attr('data-rlist', id);
    items.each((i, item) => {
      let s = 0, im = 0, l = 0; $m(item).attr('data-rit', '');
      const walk = el => {
        if (el.type !== 'tag') return;
        if (el.name === 'img') { el.attribs['data-ri'] = String(im++); return; }
        if (isTextBlock(el)) { el.attribs['data-rs'] = String(s++); if (el.name === 'a' && el.attribs.href) el.attribs['data-rl'] = String(l++); return; }
        if (el.name === 'a' && el.attribs.href) { el.attribs['data-rl'] = String(l++); }
        (el.children || []).forEach(walk);
      };
      walk(item);
    });
  };
  // a label with a field inside (form labels): its text goes into a span so it can be keyed / edited like every other text
  $m('label').each((i, lb) => {
    const kids = lb.children || []; const first = kids[0];
    if (!first || first.type !== 'text' || !/\S/.test(first.data)) return;
    if (!kids.some(k => k.type === 'tag' && ['input', 'select', 'textarea'].includes(k.name))) return;
    $m(first).replaceWith('<span class="rg-lt">' + first.data.trim() + '</span> ');
  });
  // the step buttons of the credit application keep their function, their texts are editable
  $m('button.rg200').attr('data-edit-label', '1');
  (LISTS[pageKey] || []).forEach(([id, sel, itemSel]) => $m(sel).each((i, box) => markList('rl-' + pageKey + '-' + id, box, itemSel)));
  FOOTER_LISTS.forEach(([id, sel, idx, itemSel]) => { const box = $m(sel).eq(idx); if (box.length) markList(id, box[0], itemSel); });
  // sections of the page (not the ones drawn from the CMS): every one can be removed / restored, and new sections can be added after it (js/rg-sections.js)
  if (pageKey !== 'login') {
    const seen = {};
    $m('main section').each((i, sec) => {
      if ($m(sec).closest('[data-vgroup],[data-dyn]').length || $m(sec).parents('section').length) return;
      const txt = $m(sec).text().replace(/\s+/g, ' ').trim().toLowerCase(), words = txt.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 4).join('-').slice(0, 30);
      const base = 'sec-' + pageKey + '-' + (words || 'section'), n = seen[base] = (seen[base] || 0) + 1;
      $m(sec).attr('data-sec-id', base + '-' + require('crypto').createHash('md5').update(txt).digest('hex').slice(0, 4) + (n > 1 ? '-' + n : ''));
    });
  }
  return $m('#__m').html();
}

// page loader: visible from the first paint until the CMS data (page texts + lists) has been applied; js/cms.js and js/rg-content.js hold / release it (window.RGL).
// Only the FIRST visit shows it (js/rg-cache.js keeps the data of the whole site in the browser, later pages are drawn at once); a page reload clears the cache.
// It uses the logo of the website (the shield + the "RockGuardHD" wordmark of the header, cut from images/rockguard-hd-logo-tm2) on the light page colours.
// banner text / photo are held invisible from the first paint until their entrance animation starts (html.rgm-pre, lifted by js/rg-motion.js; the timeout is a safety net)
const PRE_HOLD = '<script>(function(){var d=document.documentElement;if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)return;d.classList.add("rgm-pre");setTimeout(function(){d.classList.remove("rgm-pre")},9000)})();</script>' + '\n';
// data prefetch: the requests a page needs (its page elements, the lists it draws, the sign-in check) start in the head, while the scripts are still loading;
// js/cms.js and js/rg-content.js take the answers from window.RGP instead of asking again (RGP.take(path) gives a copy of the response)
const PREFETCH_LISTS = { home: ['solutions'], products: ['solutions'], resources: ['resources?all=true', 'solutions'], highlights: ['stories'], project: ['stories'], 'ref-solution': ['solutions'], 'ref-blog': ['resources?all=true', 'solutions'], 'ref-webinar': ['resources?all=true', 'solutions'] };
const PREFETCH_EL = new Set(['products', 'resources', 'ref-blog', 'ref-webinar']);   // these pages also need the page elements of every product: asked as soon as the solution list is here
const prefetch = pageKey => '<script>(function(){try{var P=window.RGP={},u=function(p){P[p]=fetch("/api/"+p,{credentials:"include",cache:"no-store"}).catch(function(){return null})};' +
  'var s=((location.pathname.split("/").pop()||"").replace(/\\.html$/i,"")||"index").toLowerCase();u("v2/page-elements/"+encodeURIComponent(s));if(s!=="index")u("v2/page-elements/index");' + JSON.stringify(PREFETCH_LISTS[pageKey] || []) + '.forEach(function(l){u("v2/"+l)});u("admin/status");' +
  (PREFETCH_EL.has(pageKey) ? 'P["v2/solutions"].then(function(r){return r&&r.ok?r.clone().json():[]}).then(function(rows){(rows||[]).forEach(function(x){if(x&&x.slug)u("v2/page-elements/product-detail-"+encodeURIComponent(x.slug))})}).catch(function(){});' : '') +
  'P.take=function(p){var x=P[p];return x?x.then(function(r){return r?r.clone():null}):null}}catch(e){}})();</script>\n';
const LOADER_HEAD = '<style>' +
  '#rg-loader{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;overflow:hidden;color:#2c2e35;text-align:center;' +
  'background:radial-gradient(ellipse at 50% 38%,#fff 0%,#faf4ec 46%,#f1e6d6 100%);transition:opacity .35s ease,transform .35s ease,visibility .35s}' +
  '#rg-loader.done{opacity:0;transform:scale(1.04);visibility:hidden;pointer-events:none}html.rg-loading{overflow:hidden}html.rg-cached #rg-loader{display:none}html.rg-cached{visibility:hidden}' +
  /* faint diamond mesh (the RockGuard HD mesh) that drifts behind, strongest around the logo */
  '#rg-loader .rgl-grid{position:absolute;inset:-60px;background:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2756%27 height=%2756%27%3E%3Cpath d=%27M0 28L28 0L56 28L28 56Z%27 fill=%27none%27 stroke=%27%232c2e35%27 stroke-width=%271%27/%3E%3C/svg%3E") 0 0/56px 56px;opacity:.085;-webkit-mask:radial-gradient(circle at 50% 38%,#000 0,rgba(0,0,0,.5) 34%,transparent 70%);mask:radial-gradient(circle at 50% 38%,#000 0,rgba(0,0,0,.5) 34%,transparent 70%);animation:rgl-grid 12s linear infinite}' +
  /* the mark: a glass disc with the shield, a progress arc around it, a slowly turning tick ring and radar pulses */
  '#rg-loader .rgl-mark{position:relative;width:156px;height:156px;display:grid;place-items:center}' +
  '#rg-loader .rgl-disc{position:absolute;inset:16px;border-radius:50%;background:radial-gradient(circle at 34% 28%,#fff 0%,#faf4ec 62%,#efe3d1 100%);box-shadow:0 14px 40px rgba(44,46,53,.17),inset 0 0 0 1px rgba(44,46,53,.06)}' +
  '#rg-loader .rgl-arc{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg);overflow:visible}' +
  '#rg-loader .rgl-arc .tr{fill:none;stroke:#e6d9c7;stroke-width:3}#rg-loader .rgl-arc .pr{fill:none;stroke:url(#rgl-g);stroke-width:4;stroke-linecap:round;stroke-dasharray:452;stroke-dashoffset:calc(452px * (1 - var(--p,0)));filter:drop-shadow(0 0 5px rgba(222,66,40,.55))}' +
  '#rg-loader .rgl-ticks{position:absolute;inset:-14px;width:calc(100% + 28px);height:calc(100% + 28px);animation:rgl-turn 16s linear infinite reverse}#rg-loader .rgl-ticks circle{fill:none;stroke:rgba(44,46,53,.4);stroke-width:2;stroke-dasharray:1.6 8.4}' +
  '#rg-loader .rgl-wave{position:absolute;inset:14px;border-radius:50%;border:1.5px solid rgba(222,66,40,.45);opacity:0;animation:rgl-wave 2.2s ease-out infinite}#rg-loader .rgl-wave.b{animation-delay:.73s}#rg-loader .rgl-wave.c{animation-delay:1.46s}' +
  '#rg-loader .rgl-mark img{position:relative;height:74px;width:auto;filter:drop-shadow(0 4px 8px rgba(44,46,53,.25));animation:rgl-pop 1.8s ease-in-out infinite}' +
  '#rg-loader .rgl-logo{width:min(290px,68vw);height:auto;margin-top:6px;animation:rgl-up .45s 0s both cubic-bezier(.2,.8,.2,1)}' +
  '#rg-loader .rgl-tag{margin-top:-4px;font:600 clamp(12px,2.6vw,14px)/1.2 "Barlow Condensed","Arial Narrow",Arial,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:#6b4a35;animation:rgl-up .45s .06s both cubic-bezier(.2,.8,.2,1)}' +
  /* thin progress line along the very bottom */
  '#rg-loader .rgl-line{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(44,46,53,.08)}#rg-loader .rgl-line i{display:block;height:100%;transform-origin:0 50%;transform:scaleX(var(--p,0));background:linear-gradient(90deg,#de4228,#ff6a4a 70%,#2c2e35)}' +
  '@keyframes rgl-grid{to{background-position:56px 56px}}@keyframes rgl-turn{to{transform:rotate(360deg)}}@keyframes rgl-wave{0%{opacity:.7;transform:scale(1)}100%{opacity:0;transform:scale(2.5)}}' +
  '@keyframes rgl-pop{0%,100%{transform:scale(1)}50%{transform:scale(.94)}}@keyframes rgl-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}' +
  '@media (prefers-reduced-motion:reduce){#rg-loader .rgl-grid,#rg-loader .rgl-ticks,#rg-loader .rgl-wave,#rg-loader .rgl-mark img{animation:none!important}#rg-loader .rgl-wave{display:none}}' +
  '</style>\n' +
  '<noscript><style>#rg-loader{display:none}html.rg-loading{overflow:auto}</style></noscript>\n' +
  '<script>(function(){var d=document,n=0,ready=false,hid=false,fin=false,t0=Date.now(),c=false,P=0,S=0;d.documentElement.classList.add("rg-loading");' +
  'try{var nv=performance.getEntriesByType("navigation")[0];if(nv&&nv.type==="reload"){localStorage.removeItem("rg-cache-v1");localStorage.removeItem("rg-cache-t")}}catch(e){}try{var t=+localStorage.getItem("rg-cache-t");c=!!(t&&Date.now()-t<864e5)}catch(e){}if(c)d.documentElement.classList.add("rg-cached");' +
  /* progress: eases towards 94 % while the data comes in, jumps to 100 % when everything is drawn */
  'function frame(){var e=d.getElementById("rg-loader");if(e){P=hid?1:.94*(1-Math.exp(-(Date.now()-t0)/900));S+=(P-S)*.22;if(P-S<.004)S=P;e.style.setProperty("--p",S.toFixed(3));}if(!fin)requestAnimationFrame(frame)}requestAnimationFrame(frame);' +
  'function finish(){if(fin)return;fin=true;var e=d.getElementById("rg-loader");d.documentElement.classList.remove("rg-loading");d.documentElement.classList.remove("rg-cached");if(e){e.classList.add("done");setTimeout(function(){if(e.parentNode)e.parentNode.removeChild(e)},370)}}' +
  'function hide(){if(hid)return;hid=true;setTimeout(finish,c?0:230)}' +
  'function check(){if(ready&&n<=0)setTimeout(function(){if(n<=0)hide()},Math.max(30,(RGL.cached?0:160)-(Date.now()-t0)))}' +
  'window.RGL={cached:c,cachedUsed:false,hold:function(){n++},release:function(){n=Math.max(0,n-1);check()},miss:function(){RGL.cached=false;d.documentElement.classList.remove("rg-cached")}};' +
  'd.addEventListener("DOMContentLoaded",function(){ready=true;check()});setTimeout(hide,c?2500:2200)})();</script>\n';
const LOADER_BODY = '<div id="rg-loader" role="status" aria-live="polite" aria-label="Loading"><div class="rgl-grid"></div><div class="rgl-mark"><span class="rgl-wave"></span><span class="rgl-wave b"></span><span class="rgl-wave c"></span>' +
  '<svg class="rgl-ticks" viewBox="0 0 184 184" aria-hidden="true"><circle cx="92" cy="92" r="89"/></svg><span class="rgl-disc"></span>' +
  '<svg class="rgl-arc" viewBox="0 0 156 156" aria-hidden="true"><defs><linearGradient id="rgl-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#de4228"/><stop offset="1" stop-color="#2c2e35"/></linearGradient></defs><circle class="tr" cx="78" cy="78" r="72"/><circle class="pr" cx="78" cy="78" r="72"/></svg>' +
  '<img src="images/logo-shield-sm.webp" alt="" width="60" height="74"></div>' +
  '<img class="rgl-logo" src="images/logo-wordmark-sm.webp" alt="RockGuard HD Pipeline Protection Mesh" width="290" height="64"><div class="rgl-tag">The Rock Stops Here.™</div>' +
  '<div class="rgl-line"><i></i></div></div>\n';


// background photo of the dark banner at the top of these pages (a normal CMS image: replace it with "Change image" in edit mode); the Products banner is drawn by js/rg-content.js
const HERO = { resources: 'mainpic_mdfy', highlights: 'IMG_0097_crop', contact: 'RockGuard-HD-gallery-6', credit: 'RockGuard-HD-gallery-3', lunch: 'RockGuard-HD-gallery-11', project: 'RockGuard-HD-gallery-10', privacy: 'RockGuard-HD-gallery-1' };
function withHero(html, pageKey) {
  if (!HERO[pageKey]) return html;
  const $h = cheerio.load('<div id="__h">' + html + '</div>', { _useHtmlParser2: true, decodeEntities: false, lowerCaseAttributeNames: true });
  const sec = $h('main > section.rg80').first(); if (!sec.length) return html;
  sec.addClass('rg-hero').prepend('<img class="rg-herobg" src="images/' + HERO[pageKey] + '.webp" alt="" data-cms="img-hero-' + pageKey + '" data-cms-type="image"><div class="rg-heroov"></div>');
  return $h('#__h').html();
}
function page(file, title, desc, bodyHtml, defaults, bodyClass) {
  bodyHtml = withHero(withFooter(bodyHtml), bodyClass);
  bodyHtml = bodyHtml.replace(/<img class="rg4"/, '<img class="rg4" data-cms="site-logo" data-cms-type="image"');   // header logo: the backend's global key
  bodyHtml = markStructure(bodyHtml, bodyClass);
  const tagged = tagPage(bodyHtml, bodyClass, registry); bodyHtml = tagged.html; tagStats[file] = tagged.tagged + (tagged.created ? ' (' + tagged.created + ' new keys)' : '');
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(title) + '</title>\n<link rel="icon" type="image/png" sizes="64x64" href="images/favicon.png">\n<link rel="apple-touch-icon" href="images/apple-touch-icon.png">\n<meta name="description" content="' + escAttr(desc) + '">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet">\n' +
    LOADER_HEAD + prefetch(bodyClass) + PRE_HOLD + '<link rel="stylesheet" href="css/styles.css">\n<link rel="stylesheet" href="css/site.css">\n<link rel="stylesheet" href="css/rg-motion.css">\n<link rel="stylesheet" href="css/cms.css">\n</head>\n' +
    '<body data-page="' + escAttr(bodyClass) + '" data-state=\'' + JSON.stringify(defaults) + '\'>\n' + LOADER_BODY + bodyHtml + '\n' +
    (['contact', 'lunch', 'credit'].includes(bodyClass) ? '<script src="js/geo.js" defer></script>\n' : '') + '<script src="js/site.js" defer></script>\n<script src="js/rg-cache.js" defer></script>\n<script src="js/rg-consent.js" defer></script>\n<script src="js/rg-motion.js" defer></script>\n<script src="js/rg-dialog.js" defer></script>\n<script src="js/rg-edit.js" defer></script>\n<script src="js/rg-content.js" defer></script>\n<script src="js/cms.js" defer></script>\n<script src="js/rg-sections.js" defer></script>\n<script src="js/rg-toolbar.js" defer></script>\n</body>\n</html>\n';
}

// ------------------------------------------------------------------ write everything
const written = [];
function write(file, html) { fs.writeFileSync(path.join(ROOT, file), html); written.push(file); }
for (const [key, p] of Object.entries(PAGES)) {
  const basePatch = key === 'highlights' ? { hlMode: 'list' } : {};
  const a = assemble(key, basePatch, GROUPS[key]);
  write(p.file, page(p.file, p.title, p.desc, a.html, a.defaults, key));
}
// project-highlight.html: the template of every project highlight (/project-highlight-<slug>.html is rewritten to it, see vercel.json); js/rg-content.js draws the project of the slug
{
  const a = assemble('highlights', { hlMode: 'detail', hl: 0 }, GROUPS.project(0));
  const $t = parse(a.html); $t('[data-vgroup="pj"]').html('').removeAttr('hidden').attr('style', 'min-height:60vh');
  write('project-highlight.html', page('project-highlight.html', 'Project Highlight | RockGuard® HD Pipeline Protection', 'RockGuard® HD and PipeWeights project highlight.', $t('#__root').html(), a.defaults, 'project'));
}

// privacy-policy.html: cookie / privacy policy (tools/privacy.html) in the page shell of the site; js/rg-consent.js is the cookie banner
{
  const a = assemble('contact', {}, []);
  const $t = parse(a.html);
  $t('main').html(fs.readFileSync(path.join(__dirname, 'privacy.html'), 'utf8').replace('__DATE__', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })));
  const html = $t('#__root').html().split('color:#111111;border-bottom:2px solid #de4228').join('color:#6b4a35;border-bottom:2px solid transparent').split('background:#faf4ec;color:#de4228').join('background:#fff;color:#2c2e35');
  write('privacy-policy.html', page('privacy-policy.html', 'Privacy Policy | RockGuard® HD Pipeline Protection', 'How the RockGuard® HD website uses cookies and browser storage, the third-party services it uses and what happens to the information you send us.', html, a.defaults, 'privacy'));
}

// solution-reference.html: the template of every solution made in the Dashboard (/product-detail-<slug>.html is rewritten to it, see vercel.json); js/rg-content.js (solutionRef) draws the solution of the slug
{
  const a = assemble('products', { product: 'hd' }, []);
  const $t = parse(a.html);
  $t('main > section.rg80, main > section.rg86').remove();
  $t('main > section.rg31').before('<div data-dyn="sol" style="min-height:60vh"></div>');
  write('solution-reference.html', page('solution-reference.html', 'Product | RockGuard® HD Pipeline Protection', 'RockGuard® pipeline protection product.', $t('#__root').html(), a.defaults, 'ref-solution'));
}

// blog-details.html / webinar-details.html: the templates of the resources of type Blog Post / Webinar (/blog-<slug>.html and /webinar-<slug>.html are rewritten to them, see vercel.json); js/rg-content.js (articleRef)
for (const [file, cls, label] of [['blog-details.html', 'ref-blog', 'Blog post'], ['webinar-details.html', 'ref-webinar', 'Webinar']]) {
  const a = assemble('resources', { filter: 'Downloads', prod: 'All Products' }, []);
  const $t = parse(a.html);
  $t('main > section.rg80, main > section.rg114').remove();
  $t('main > section.rg31').before('<div data-dyn="art" style="min-height:60vh"></div>');
  write(file, page(file, label + ' | RockGuard® HD Pipeline Protection', 'RockGuard® ' + label.toLowerCase() + '.', $t('#__root').html(), a.defaults, cls));
}

// js/geo.js: the country / state lists of the contact form (the component kept them in its script)
// codes for the CC rules of the Dashboard (Email Configuration): the backend compares country US / CA ... and US state TX ...
const zip = (names, codes) => { if (names.length !== codes.length) throw new Error('geo codes do not match'); return Object.fromEntries(names.map((n, i) => [n, codes[i]])); };
write('js/geo.js', '/* generated by tools/build-pages.js from the original design: country -> state / province lists of the contact form + name -> code tables (CC rules) */' + '\n' + 'window.RG_GEO = ' + JSON.stringify({ 'United States': US_STATES, 'Canada': CA_PROV, 'Mexico': MX_STATES }) + ';' + '\n' + 'window.RG_CODES = ' + JSON.stringify({ country: { 'United States': 'US', 'Canada': 'CA', 'Mexico': 'MX', 'Other': 'OTHER' }, us: zip(US_STATES, ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"]), ca: zip(CA_PROV, ["AB","BC","MB","NB","NL","NS","ON","PE","QC","SK","NT","NU","YT"]) }) + ';' + '\n');
fs.writeFileSync(REG_FILE, JSON.stringify(registry, null, 1) + '\n');
console.log('written:', written.join(', '));
console.log('cms keys per page:', JSON.stringify(tagStats));
