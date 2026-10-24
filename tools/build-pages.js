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
  (LISTS[pageKey] || []).forEach(([id, sel, itemSel]) => $m(sel).each((i, box) => markList('rl-' + pageKey + '-' + id, box, itemSel)));
  FOOTER_LISTS.forEach(([id, sel, idx, itemSel]) => { const box = $m(sel).eq(idx); if (box.length) markList(id, box[0], itemSel); });
  // sections of the page (not the ones drawn from the CMS): every one can be removed / restored, and new sections can be added after it (js/rg-sections.js)
  if (!['login', 'project', 'ref-solution'].includes(pageKey)) {
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
const LOADER_HEAD = '<style>' +
  '#rg-loader{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;overflow:hidden;color:#2c2e35;text-align:center;' +
  'background:radial-gradient(ellipse at 50% 38%,#fff 0%,#faf4ec 40%,#f5ebdd 72%,#e9ddcc 100%);transition:opacity .6s ease,transform .6s ease,visibility .6s}' +
  '#rg-loader.done{opacity:0;transform:scale(1.06);visibility:hidden;pointer-events:none}html.rg-loading{overflow:hidden}html.rg-cached #rg-loader{display:none}html.rg-cached{visibility:hidden}' +
  '#rg-loader:before{content:"";position:absolute;left:0;right:0;bottom:15%;height:6px;opacity:.7;background:repeating-linear-gradient(90deg,#de4228 0 54px,transparent 54px 70px);animation:rgl-pipe .9s linear infinite}' +
  '#rg-loader:after{content:"";position:absolute;left:0;right:0;bottom:calc(15% - 16px);height:1px;background:linear-gradient(90deg,transparent,rgba(44,46,53,.3),transparent)}' +
  '#rg-loader .rgl-mark{position:relative;width:140px;height:140px;display:grid;place-items:center}' +
  '#rg-loader .rgl-ring{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,#de4228,rgba(222,66,40,0) 38%,rgba(44,46,53,0) 52%,#2c2e35 100%);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 4px),#000 calc(100% - 3px));mask:radial-gradient(farthest-side,transparent calc(100% - 4px),#000 calc(100% - 3px));animation:rgl-spin 1.25s linear infinite}' +
  '#rg-loader .rgl-glow{position:absolute;inset:-26px;border-radius:50%;background:radial-gradient(circle,rgba(222,66,40,.2),rgba(222,66,40,0) 68%);animation:rgl-glow 2.2s ease-in-out infinite}' +
  '#rg-loader .rgl-mark img{position:relative;height:76px;width:auto;animation:rgl-pop 2.2s ease-in-out infinite}' +
  '#rg-loader .rgl-logo{width:min(300px,70vw);height:auto;animation:rgl-up .8s .1s both cubic-bezier(.2,.8,.2,1)}' +
  '#rg-loader .rgl-tag{margin-top:-6px;font:600 clamp(12px,2.6vw,14px)/1.2 "Barlow Condensed","Arial Narrow",Arial,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:#6b4a35;animation:rgl-up .8s .25s both cubic-bezier(.2,.8,.2,1)}' +
  '#rg-loader .rgl-bar{width:min(230px,60vw);height:4px;border-radius:4px;background:#e2d2bc;overflow:hidden;position:relative;animation:rgl-up .8s .4s both cubic-bezier(.2,.8,.2,1)}' +
  '#rg-loader .rgl-bar:after{content:"";position:absolute;top:0;bottom:0;width:44%;border-radius:4px;background:linear-gradient(90deg,transparent,#de4228 55%,#2c2e35);animation:rgl-slide 1.1s ease-in-out infinite}' +
  '@keyframes rgl-spin{to{transform:rotate(360deg)}}@keyframes rgl-slide{0%{left:-48%}100%{left:104%}}@keyframes rgl-pipe{to{background-position:70px 0}}' +
  '@keyframes rgl-pop{0%,100%{transform:scale(1)}50%{transform:scale(.93)}}@keyframes rgl-glow{0%,100%{opacity:.55;transform:scale(.94)}50%{opacity:1;transform:scale(1.06)}}@keyframes rgl-up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}' +
  '@media (prefers-reduced-motion:reduce){#rg-loader *,#rg-loader:before{animation:none!important}#rg-loader .rgl-bar:after{left:0;width:100%}}' +
  '</style>\n' +
  '<noscript><style>#rg-loader{display:none}html.rg-loading{overflow:auto}</style></noscript>\n' +
  '<script>(function(){var d=document,n=0,ready=false,hid=false,t0=Date.now(),c=false;d.documentElement.classList.add("rg-loading");' +
  'try{var nv=performance.getEntriesByType("navigation")[0];if(nv&&nv.type==="reload"){localStorage.removeItem("rg-cache-v1");localStorage.removeItem("rg-cache-t")}}catch(e){}try{var t=+localStorage.getItem("rg-cache-t");c=!!(t&&Date.now()-t<864e5&&!localStorage.getItem("rg-admin"))}catch(e){}if(c)d.documentElement.classList.add("rg-cached");' +
  'function hide(){if(hid)return;hid=true;var e=d.getElementById("rg-loader");d.documentElement.classList.remove("rg-loading");d.documentElement.classList.remove("rg-cached");if(e){e.classList.add("done");setTimeout(function(){if(e.parentNode)e.parentNode.removeChild(e)},600)}}' +
  'function check(){if(ready&&n<=0)setTimeout(function(){if(n<=0)hide()},Math.max(30,(RGL.cached?0:380)-(Date.now()-t0)))}' +
  'window.RGL={cached:c,cachedUsed:false,hold:function(){n++},release:function(){n=Math.max(0,n-1);check()},miss:function(){RGL.cached=false;d.documentElement.classList.remove("rg-cached")}};' +
  'd.addEventListener("DOMContentLoaded",function(){ready=true;check()});setTimeout(hide,c?2500:12000)})();</script>\n';
const LOADER_BODY = '<div id="rg-loader" role="status" aria-live="polite" aria-label="Loading"><div class="rgl-mark"><span class="rgl-glow"></span><span class="rgl-ring"></span><img src="images/logo-shield-sm.webp" alt="" width="62" height="76"></div>' +
  '<img class="rgl-logo" src="images/logo-wordmark-sm.webp" alt="RockGuard HD Pipeline Protection Mesh" width="300" height="66"><div class="rgl-tag">The Rock Stops Here.™</div><div class="rgl-bar"></div></div>\n';

function page(file, title, desc, bodyHtml, defaults, bodyClass) {
  bodyHtml = withFooter(bodyHtml);
  bodyHtml = bodyHtml.replace(/<img class="rg4"/, '<img class="rg4" data-cms="site-logo" data-cms-type="image"');   // header logo: the backend's global key
  bodyHtml = markStructure(bodyHtml, bodyClass);
  const tagged = tagPage(bodyHtml, bodyClass, registry); bodyHtml = tagged.html; tagStats[file] = tagged.tagged + (tagged.created ? ' (' + tagged.created + ' new keys)' : '');
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(title) + '</title>\n<link rel="icon" type="image/png" sizes="64x64" href="images/favicon.png">\n<link rel="apple-touch-icon" href="images/apple-touch-icon.png">\n<meta name="description" content="' + escAttr(desc) + '">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet">\n' +
    LOADER_HEAD + '<link rel="stylesheet" href="css/styles.css">\n<link rel="stylesheet" href="css/site.css">\n<link rel="stylesheet" href="css/cms.css">\n</head>\n' +
    '<body data-page="' + escAttr(bodyClass) + '" data-state=\'' + JSON.stringify(defaults) + '\'>\n' + LOADER_BODY + bodyHtml + '\n' +
    (['contact', 'lunch', 'credit'].includes(bodyClass) ? '<script src="js/geo.js" defer></script>\n' : '') + '<script src="js/site.js" defer></script>\n<script src="js/rg-cache.js" defer></script>\n<script src="js/rg-dialog.js" defer></script>\n<script src="js/rg-edit.js" defer></script>\n<script src="js/rg-content.js" defer></script>\n<script src="js/cms.js" defer></script>\n<script src="js/rg-sections.js" defer></script>\n<script src="js/rg-toolbar.js" defer></script>\n</body>\n</html>\n';
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
