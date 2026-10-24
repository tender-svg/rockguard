#!/usr/bin/env node
/*
 * seed-content: puts the content of the CURRENT pages (Products, Project Highlights, Resources) into the rockguard site of the
 * CMS backend, so it can be edited from the dashboard / the live editor. Nothing is invented: every text, link and photo is
 * the one of the original design (_original/index.original.html, run through tools/original.js).
 *
 *   RG_PASS=... node tools/seed-content.js            (login: RG_USER, default test@rockguard.biz; the password is never stored in the repo)
 *   node tools/seed-content.js --dry-run              (shows what would be created, writes nothing)
 *
 * Where things are stored (the backend has no extra columns for them):
 *   solutions (= products)  title, slug, category (= tag line), short_description (= summary), icon_image_url (= card photo), product_family (hd / pw / acc)
 *                           + page elements of the page "product-detail-<slug>": prod-lead, prod-image, prod-tile, prod-features (JSON), prod-downloads (JSON), prod-acc-desc
 *   stories (= project highlights)  title, slug, location, application (= owner), products_used, hero_image_url, challenge_text, solution_text,
 *                           result_text = JSON { prod, images, subtitle, years, contractor, supplier, benefits, tech, excerpt, file }
 *   resources               title, document_type, description "[product:<slug>] ", file_url
 * Photos are the local WebP files (/images/...). Items that already exist (same slug / title) are skipped, so it can be re-run.
 */
const { PRODUCTS, HIGHLIGHTS, RESOURCES } = require('./original');

const API = process.env.RG_API || 'https://cmsapi.qpaix.com/rockguard';
const USER = process.env.RG_USER || 'test@rockguard.biz';
const PASS = process.env.RG_PASS || '';
const DRY = process.argv.includes('--dry-run');

const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const safe = n => n.replace(/[^A-Za-z0-9_-]+/g, '-');
const local = u => { const m = /\/([^\/]+?)\.(?:jpe?g|png)$/i.exec(String(u)); return m ? '/images/' + safe(m[1]) + '.webp' : u; };   // remote design photo -> local WebP (tools/make-images.js)
const sentence = { tape: 'is a 3/4" filament tape made for installing RockGuard® products. It makes RockGuard® HD easy to install — simply wrap it circumferentially around the pipe every 6".', hop: 'make it easy to pour aggregate into PipeWeights bags. Hoppers are available for jobsite rental, and we also offer on-site filling services and delivery to the lay down yard or right-of-way.' };
const family = p => p.acc ? 'acc' : p.id;
// card photo of the home page / tile photo of the Resources page (the design used other photos than the product page for these)
const CARD = { hd: '2019/06/RockGuard-HD-gallery-1.jpg' }, TILE = { hd: '2019/06/RockGuard-HD-gallery-5.jpg', pw: '2019/06/mainpic_mdfy.jpg', tape: '2019/06/Hoppers_small.jpg', hop: '2019/06/Hoppers_small.jpg' };
const U = 'https://rockguard.biz/wp-content/uploads/';

const solutions = PRODUCTS.map((p, i) => ({
  key: p.id, title: p.name, slug: slugify(p.name), tag: p.tag, summary: p.summary || p.lead, family: family(p), order: i + 1,
  card: local(CARD[p.id] ? U + CARD[p.id] : p.img), image: local(p.detailImg), tile: local(U + TILE[p.id]), lead: p.lead,
  features: p.features.map(f => [f[0], f[1] || '']), downloads: p.downloads.map(d => [d[0], d[1], d[2], d[3] || '']), accDesc: sentence[p.id] || '',
}));
const slugOf = {}; solutions.forEach(s => { slugOf[s.key] = s.slug; });
const nameToSlug = {}; PRODUCTS.forEach(p => { nameToSlug[p.name] = slugOf[p.id]; });

const projects = HIGHLIGHTS.map((h, i) => ({
  title: h.title, slug: slugify(h.title), location: h.location, owner: h.owner, products: h.product, prod: nameToSlug[h.product] || 'all',
  images: h.images.map(local), challenge: h.challenge, solution: h.solution, order: i,
  x: { subtitle: h.subtitle, years: h.years, contractor: h.contractor, supplier: h.supplier, benefits: h.benefits, tech: h.tech, excerpt: h.excerpt },
  file: h.url,
}));
const extOf = (u, t) => /\.docx$/i.test(u) ? 'DOCX' : /\.pdf$/i.test(u) ? 'PDF' : /youtu/i.test(u) ? 'VIDEO' : 'WEB';
const resources = RESOURCES.map((r, i) => ({ title: r.label, type: r.type, product: nameToSlug[r.product], file: r.url, order: i }));

// ------------------------------------------------------------------ backend helpers
let cookie = '';
async function call(method, url, body) {
  const headers = { Cookie: cookie };
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* not json */ }
  if (!r.ok) throw new Error(method + ' ' + url + ' -> ' + r.status + ' ' + text.slice(0, 200));
  return json;
}

(async () => {
  console.log('to seed:', solutions.length, 'solutions,', projects.length, 'project highlights,', resources.length, 'resources');
  if (DRY) { console.log(JSON.stringify({ solutions: solutions.map(s => s.title + ' [' + s.family + ']'), projects: projects.map(p => p.slug + ' -> ' + p.prod), resources: resources.map(r => r.type + ' | ' + r.title + ' | ' + r.product) }, null, 1)); return; }
  if (!PASS) throw new Error('set RG_PASS (the password of ' + USER + ')');
  const login = await fetch(API + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: USER, password: PASS }) });
  if (!login.ok) throw new Error('login failed ' + login.status);
  cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) throw new Error('no session cookie');
  console.log('logged in as', USER);
  const have = async p => (await call('GET', p)) || [];
  const element = (page, id, type, value) => call('POST', '/api/v2/page-elements', { page_slug: page, element_id: id, content_type: type, content_value: value });

  // Solutions + the page elements of their product page
  const haveSol = new Map((await have('/api/v2/solutions')).map(s => [s.slug, s]));
  for (const s of solutions) {
    if (!haveSol.has(s.slug)) {
      const created = await call('POST', '/api/v2/solutions', { title: s.title, slug: s.slug, short_description: s.summary, icon_image_url: s.card, category: s.tag, product_family: s.family, display_order: s.order });
      const id = created && created.solution && created.solution.id;
      if (id) await call('PATCH', '/api/v2/solutions/' + id, { custom_link: 'products.html?prod=' + (s.family === 'acc' ? 'acc' : s.family) });
      console.log('+ solution', s.title);
    } else console.log('skip solution', s.title);
    const page = 'product-detail-' + s.slug;
    await element(page, 'prod-lead', 'text', s.lead);
    await element(page, 'prod-image', 'image', s.image);
    await element(page, 'prod-tile', 'image', s.tile);
    await element(page, 'prod-features', 'text', JSON.stringify(s.features));
    await element(page, 'prod-downloads', 'text', JSON.stringify(s.downloads));
    if (s.accDesc) await element(page, 'prod-acc-desc', 'text', s.accDesc);
  }
  // Project highlights
  const haveStories = new Set((await have('/api/v2/stories')).map(s => s.slug));
  for (const p of projects) {
    if (haveStories.has(p.slug)) { console.log('skip project', p.slug); continue; }
    await call('POST', '/api/v2/stories', {
      title: p.title, slug: p.slug, location: p.location, application: p.owner, products_used: p.products, hero_image_url: p.images[0],
      challenge_text: p.challenge, solution_text: p.solution, project_benefits: p.x.benefits.join(', '), published_date: new Date(Date.now() - p.order * 86400000).toISOString(),
      result_text: JSON.stringify(Object.assign({ prod: p.prod, images: p.images, file: p.file }, p.x)),
    });
    console.log('+ project', p.title);
  }
  // Resources
  const haveRes = new Set((await have('/api/v2/resources?all=true')).map(r => r.title + '|' + r.document_type + '|' + (r.description || '').slice(0, 24)));
  const base = Date.now() - resources.length * 1000;
  for (const r of resources) {
    if (haveRes.has(r.title + '|' + r.type + '|' + ('[product:' + r.product + '] ').slice(0, 24))) { console.log('skip resource', r.title); continue; }
    await call('POST', '/api/v2/resources', { title: r.title, document_type: r.type, description: '[product:' + r.product + '] ', file_url: r.file, thumbnail_url: '', is_active: true, published_date: new Date(base + r.order * 1000).toISOString() });
    console.log('+ resource', r.type + ' - ' + r.title + ' (' + r.product + ')');
  }
  console.log('done.');
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
