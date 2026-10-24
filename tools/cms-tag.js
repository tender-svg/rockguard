/*
 * cms-tag: gives every editable text block and image of a page a STABLE, readable CMS key (data-cms="...") in the HTML itself.
 * Nothing is ever numbered at run time: the live editor (js/cms.js) only edits elements that already carry a key here.
 *
 * Stability rules
 *  - A key comes from WHAT the element is: its kind + its default text / image file, never from its position on the page.
 *    Adding, removing or moving other elements therefore never changes an existing key.
 *  - Every key ever handed out is remembered in tools/cms-keys.json ("registry", commit it). A rebuild re-uses the key of a known element
 *    and only creates keys for new ones. Keys are never renumbered or deleted, so saved content can never end up on the wrong element.
 *  - The same element repeated in the state variants of a page (tabs / FAQ) shares one key; two identical texts inside one block get -2, -3 ...
 *  - Parts that come from the CMS lists (applications, solutions, projects, resources) are not tagged; they are managed in the dashboard.
 *  - Elements that already have a data-cms in the source (the shared footer uses the backend's global keys) are left untouched.
 */
const crypto = require('crypto');
const cheerio = require('cheerio');

const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'svg', 'select', 'option', 'textarea', 'input', 'header', 'footer', 'head', 'template', 'iframe', 'canvas']);
const INLINE = new Set(['span', 'b', 'i', 'em', 'strong', 'br', 'a', 'sup', 'sub', 'small', 'u', 'abbr', 'mark', 's', 'wbr']);
const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'span', 'div', 'a', 'button', 'strong', 'em', 'label', 'td', 'th', 'address', 'b', 'i', 'small', 'figcaption', 'blockquote', 'dt', 'dd', 'summary']);
const DYNAMIC_GROUPS = new Set(['prod', 'pm', 'pj']);                           // filled from the CMS lists (products = solutions, project highlights, resources)
const DYNAMIC_CLASS_BY_PAGE = { home: ['rg52'], resources: ['rg117', 'rg119', 'rg128', 'rg130', 'rg131', 'rg132'] };   // resources: only the title, tiles, filters, count and cards are drawn from the CMS, the rest of the section is keyed                                 // the product cards of the home page are filled from the CMS
const UNTAGGED_PAGES = new Set(['login']);                                          // 'project' = the project highlight pages (drawn from the CMS)

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const norm = s => String(s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const hash = s => crypto.createHash('md5').update(s).digest('hex').slice(0, 4);

function makeKey(kind, n) {
  const words = slug(n).split('-').slice(0, 5).join('-').slice(0, 30).replace(/-+$/, '');
  return (kind === 'image' ? 'img-' : 'txt-') + (words || 'item') + '-' + hash(n);
}

/**
 * @param {string} html      body markup of one page
 * @param {string} pageKey   page identifier ("home", "solutions" ...)
 * @param {object} registry  { [pageKey]: { [signature]: key } }  (mutated: new keys are added)
 * @returns {{html:string, tagged:number, created:number}}
 */
function tagPage(html, pageKey, registry) {
  if (UNTAGGED_PAGES.has(pageKey)) return { html, tagged: 0, created: 0 };   // (these pages are drawn from the CMS lists: nothing to tag)
  const $ = cheerio.load('<div id="__r">' + html + '</div>', { _useHtmlParser2: true, decodeEntities: false, lowerCaseAttributeNames: true });
  const reg = registry[pageKey] = registry[pageKey] || {};
  const used = new Set(Object.values(reg));
  const skipClasses = new Set(DYNAMIC_CLASS_BY_PAGE[pageKey] || []);
  let tagged = 0, created = 0;

  function keyFor(kind, n, counters) {
    const base = kind + '|' + n;
    const occ = counters[base] = (counters[base] || 0) + 1;
    const sig = base + '|' + occ;
    if (reg[sig]) return reg[sig];
    let key = makeKey(kind, n) + (occ > 1 ? '-' + occ : '');
    while (used.has(key)) key += 'x';
    reg[sig] = key; used.add(key); created++;
    return key;
  }

  const isTextBlock = el => {
    if (!TEXT_TAGS.has(el.name)) return false;
    const kids = el.children || [];
    let direct = false;
    for (const c of kids) {
      if (c.type === 'text') { if (/\S/.test(c.data)) direct = true; }
      else if (c.type === 'tag') { if (!INLINE.has(c.name)) return false; }
      else if (c.type !== 'comment') return false;
    }
    if (!direct) return false;
    const t = norm($.html(el.children));
    return t.length > 0 && /[a-z0-9]/i.test(t);
  };

  function walk(el, counters) {
    if (el.type !== 'tag') return;
    const a = el.attribs || {};
    if (SKIP_TAGS.has(el.name)) return;
    if ('data-cms' in a) return;                                   // explicit key in the source: respect it, do not look inside
    if (a['data-tpl'] !== undefined) return;                       // add / remove lists (js/rg-solution-tpl.js): saved as one list, not as keyed texts
    if (a['data-dyn'] !== undefined || a['data-dd'] !== undefined || a['data-sale'] !== undefined || a['data-nocms'] !== undefined || a['data-hl-empty'] !== undefined || a['data-rlist'] !== undefined) return;
    const cls = (a.class || '').split(/\s+/);
    if (cls.some(c => skipClasses.has(c)) || cls.includes('rg1') || cls.includes('rg-burger')) return;
    if (a['data-vgroup']) {                                        // a state variant: its own occurrence counters
      if (DYNAMIC_GROUPS.has(a['data-vgroup'])) return;
      counters = {};
    }
    if (el.name === 'img') {
      const src = String(a.src || '').split('?')[0]; if (!src) return;
      el.attribs['data-cms'] = keyFor('image', src, counters); el.attribs['data-cms-type'] = 'image'; tagged++; return;
    }
    if ((a['data-set'] !== undefined || a['data-act'] !== undefined || a['data-scroll'] !== undefined) && el.name === 'button' && a['data-edit-label'] === undefined) return;   // tabs / controls keep their function
    if (isTextBlock(el)) {
      el.attribs['data-cms'] = keyFor('text', norm($.html(el.children)), counters); el.attribs['data-cms-type'] = 'text'; tagged++; return;
    }
    for (const c of el.children || []) walk(c, counters);
  }
  for (const c of $('#__r')[0].children) walk(c, {});

  // ---- header menu labels (Home, Products ... and the Support sub menu): one shared text per label ("g-txt-...", stored once, shown on every page)
  if (pageKey !== 'login') {
    const hreg = registry._chrome = registry._chrome || {}, hused = new Set(Object.values(hreg));
    $('#__r header button.rg7, #__r header button.rg11').each((i, el) => {
      if (el.attribs['data-cms'] !== undefined) return;
      const kids = el.children || []; let direct = false, ok = true;
      for (const c of kids) { if (c.type === 'text') { if (/\S/.test(c.data)) direct = true; } else if (c.type === 'tag') { if (!INLINE.has(c.name)) ok = false; } }
      const n = norm($.html(el.children)); if (!ok || !direct || !n) return;
      const sig = 'htext|' + n; let key = hreg[sig];
      if (!key) { key = 'g-txt-' + (slug(n).slice(0, 24).replace(/-+$/, '') || 'item') + '-' + hash(n); while (hused.has(key)) key += 'x'; hreg[sig] = key; hused.add(key); created++; }
      el.attribs['data-cms'] = key; el.attribs['data-cms-type'] = 'text'; tagged++;
    });
  }

  // ---- links: every link / link button gets a stable data-cms-link key (the live editor opens its link editor on it; the saved URL is stored under this key).
  // The key comes from the link's label + original address, never from its position. Links of the header / footer are shared by all pages ("lnk-g-...", stored once).
  const chromeReg = registry._chrome = registry._chrome || {};
  const usedChrome = new Set(Object.values(chromeReg));
  const SKIP_LINK_TAGS = new Set(['script', 'style', 'noscript', 'svg', 'template', 'head', 'select', 'option', 'textarea', 'form']);
  let linked = 0;
  function linkKey(chromeScope, label, href, counters) {
    const base = 'link|' + label + '|' + href, reg2 = chromeScope ? chromeReg : reg, used2 = chromeScope ? usedChrome : used;
    const occ = chromeScope ? 1 : (counters[base] = (counters[base] || 0) + 1);
    const sig = base + '|' + occ;
    if (reg2[sig]) return reg2[sig];
    const words = slug(label || 'link').split('-').slice(0, 4).join('-').slice(0, 26).replace(/-+$/, '') || 'link';
    let key = (chromeScope ? 'lnk-g-' : 'lnk-') + words + '-' + hash(label + '|' + href) + (occ > 1 ? '-' + occ : '');
    while (used2.has(key)) key += 'x';
    reg2[sig] = key; used2.add(key); created++;
    return key;
  }
  function walkLinks(el, counters, chromeScope) {
    if (el.type !== 'tag') return;
    const a = el.attribs || {};
    if (SKIP_LINK_TAGS.has(el.name)) return;
    if (a['data-dyn'] !== undefined || a['data-dd'] !== undefined || a['data-sale'] !== undefined || a['data-nocms'] !== undefined || a['data-hl-empty'] !== undefined || a['data-rlist'] !== undefined) return;
    const cls = (a.class || '').split(/\s+/);
    if (cls.some(c => skipClasses.has(c)) || cls.includes('rg1')) return;
    if (a['data-vgroup']) { if (DYNAMIC_GROUPS.has(a['data-vgroup'])) return; counters = {}; }
    if (el.name === 'header' || el.name === 'footer') chromeScope = true;
    const isA = el.name === 'a' && a.href && !/^\s*(#|javascript:|mailto:|tel:)/i.test(a.href);
    const isBtn = a['data-href'] !== undefined && a['data-set'] === undefined && a['data-act'] === undefined;
    if (isA || isBtn) {
      const label = norm($.html(el.children)).replace(/\s+/g, ' ');
      el.attribs['data-cms-link'] = linkKey(chromeScope, label, isA ? a.href : a['data-href'], counters); linked++;
      return;
    }
    for (const c of el.children || []) walkLinks(c, counters, chromeScope);
  }
  for (const c of $('#__r')[0].children) walkLinks(c, {}, false);
  return { html: $('#__r').html(), tagged: tagged + linked, created };
}

module.exports = { tagPage };
