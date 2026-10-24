#!/usr/bin/env node
/*
 * seed-articles: creates one Blog Post and one Webinar (Resources) in the rockguard site of the CMS backend, exactly as the dashboard does
 * (POST /api/v2/resources). Their pages are then /blog-<title>.html and /webinar-<title>.html (templates blog-details.html / webinar-details.html).
 *
 * The content is NOT invented: rockguard.biz has no blog posts and no webinars, so it is written only from the documents of the website itself
 *   - RockGuard HD Installation Guidelines (rev. 4/16/2010)       https://rockguard.biz/wp-content/uploads/2019/06/HDinstallation_guide.pdf
 *   - RockGuard HD Product Data Sheet (12-2024)                   https://rockguard.biz/wp-content/uploads/2024/12/RGHD_Data_Sheet_12-2024.pdf
 *   - Rock Shield Pipeline Protection Mesh specification          https://rockguard.biz/wp-content/uploads/2019/07/Rock-Shield-Specification.pdf
 *   - the Lunch & Learn text of the website
 * The webinar has no date and no speaker (none exists), so it is marked "Sample" and its button is "Contact us to register".
 *
 *   RG_PASS=... node tools/seed-articles.js        (login RG_USER, default test@rockguard.biz)
 */
const API = process.env.RG_API || 'https://cmsapi.qpaix.com/rockguard';
const USER = process.env.RG_USER || 'test@rockguard.biz';
const PASS = process.env.RG_PASS || '';

const BLOG = {
  title: 'How to Install RockGuard® HD: Pads, Rolls and Spiral Wrap',
  type: 'Blog Post', product: 'rockguard-hd', thumb: '/images/RockGuard-HD-gallery-10.webp',
  desc: 'The official installation steps for RockGuard® HD pipeline protection mesh: pads, rolls, overlaps, polyester filament tape and shaded backfill.',
  body: [
    'RockGuard® HD Pipeline Protection Mesh is an 11 mm, three dimensional bi-planar extruded diamond structured mesh rock shield made from polyethylene. It protects the pipe coating during handling and backfill and gives long term protection from geologic movement, pipeline vibration and future excavation. How it is installed matters as much as the mesh itself, so this guide follows the official RockGuard® HD Installation Guidelines.',
    '[image: /images/RockGuard-HD-gallery-9.webp | RockGuard HD installation photo]',
    'Choose rolls or pads\n- Rolls: Used for pipeline diameters up to 26". The width equals the pipeline circumference plus a minimum 6" overlap. Standard rolls are 50\' long and do not exceed 115 pounds.\n- Pads: Used for pipelines with diameters greater than 26". The width equals the pipeline circumference plus a minimum 6" overlap. Standard pad lengths are 84".',
    'Installing pads\n- Wrap the pad: Custom cut pads are wrapped around the circumference of the pipe, covering all exposed areas. Make sure every pad is large enough to protect the entire pipe.\n- Overlap at 6 o\'clock: All pad overlaps are placed at the 6 o\'clock position of the pipe and secured with polyester filament tape.\n- Keep the overlaps: End to end overlaps are at least 2"; parallel pad overlaps are at least 6".\n- Tape it: Secure every pad to the pipe with polyester filament tape at least ¾" wide.\n- Then backfill: Once the pads are secured, the backfill process may take place.',
    'Installing rolls\n- Cover the whole circumference: Rolls must be of adequate coverage to entirely cover the circumference of the pipe, with the overlap at the 6 o\'clock position.\n- Shingle the side overlaps: If a side overlap is used, place the overlaps "shingle style" so that no backfill protrudes under the mesh.\n- Keep the overlaps: End to end overlaps are at least 2"; parallel overlaps are at least 6".\n- Tape it: Secure every roll with polyester filament tape at least ¾" wide.\n- Then backfill: Once the rolls are secured, the backfill process may take place.',
    'Spiral wrapping longer pipe\nRockGuard® HD can be installed along the pipe or around the pipe and secured with polyester filament tape. For pipe with a longer circumference, start wrapping and move along the length of the pipe so that the mesh overlaps slightly, and tape it in place as you wrap.\n- Overlap: Overlap RockGuard® HD by 6".\n- Tape: Wrap with polyester filament tape every 32".',
    'Backfill and storage\n- Shade the backfill: Back-fill should be "shaded" into the trench. Do not dump back-fill directly on the protected pipe.\n- Rock size: The Rock Shield specification is written for rock 2 inches in diameter and less.\n- Check and store: Check the mesh on arrival and store it under tarps to protect it from oil, dirt and sunlight.',
    'The installation guide, data sheet and specification (PDF and Word) are on the Resources page. All figures are typical values and not a guarantee of performance; for questions call 1-800-848-4500. Source: RockGuard® HD Installation Guidelines (rev. 4/16/2010) and the Rock Shield Pipeline Protection Mesh specification, Industrial Fabrics, Inc.',
  ].join('\n\n'),
};

const WEBINAR = {
  title: 'RockGuard® HD Specification and Installation Overview (Sample Webinar)',
  type: 'Webinar', product: 'rockguard-hd', thumb: '/images/RockGuard-HD-gallery-11.webp',
  desc: 'Sample session: what RockGuard® HD is, how it performs, how rolls and pads are sized and installed, and how to specify it.',
  body: [
    'Sample session. This page is a sample webinar made only from the RockGuard® HD documents of this website. No date and no speaker are set yet: contact us to schedule a session for your team.',
    'What the session covers\n- Product overview: RockGuard® HD is an 11 mm, three dimensional bi-planar extruded diamond structured mesh rock shield made from polyethylene, for steel and plastic pipelines.\n- Performance: It does not interfere with cathodic protection, has excellent impact and compressive strengths, is chemically inert and will not rot, and stays flexible even in extremely low temperatures.\n- Rolls and pads: Rolls are used for pipeline diameters up to 26"; pads are used for diameters greater than 26". Both are custom sized for every pipeline diameter.\n- Installation: Overlaps at the 6 o\'clock position, polyester filament tape at least ¾" wide, spiral wrap for longer circumferences and "shaded" backfill.\n- Specifying: The Rock Shield specification (PDF and Word), the data sheet and the sizing chart are on the Resources page.',
    '[image: /images/RockGuard-HD-gallery-8.webp | RockGuard HD installation photo]',
    'How a Lunch & Learn works\nThe program is coordinated by a RockGuard® representative. A presentation typically lasts about an hour depending on questions, and lunch is provided by our company. Engineers, designers and anyone looking to learn more about RockGuard® pipeline protection products can participate, including anyone who would like to continue their education and earn Professional Development Hours (PDHs). Programs are typically scheduled over the lunch hour, but exceptions can be made for breakfast or dinner.',
    'To request a session, use the Lunch & Learn request form or call 1-800-848-4500.',
  ].join('\n\n'),
};

let cookie = '';
async function call(method, url, body) {
  const r = await fetch(API + url, { method, headers: Object.assign({ Cookie: cookie }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* not json */ }
  if (!r.ok) throw new Error(method + ' ' + url + ' -> ' + r.status + ' ' + text.slice(0, 200));
  return json;
}
(async () => {
  if (!PASS) throw new Error('set RG_PASS (the password of ' + USER + ')');
  const login = await fetch(API + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: USER, password: PASS }) });
  if (!login.ok) throw new Error('login failed ' + login.status);
  cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const have = new Set(((await call('GET', '/api/v2/resources?all=true')) || []).map(r => r.title + '|' + r.document_type));
  for (const a of [BLOG, WEBINAR]) {
    if (have.has(a.title + '|' + a.type)) { console.log('skip (exists)', a.type, a.title); continue; }
    await call('POST', '/api/v2/resources', { title: a.title, document_type: a.type, description: '[product:' + a.product + '] ' + a.desc + '\n\n[page]\n\n' + a.body, file_url: '', thumbnail_url: a.thumb, is_active: true, published_date: new Date().toISOString() });
    const snap = {}; snap[a.title] = { type: 'text', value: 'Added' };
    await call('POST', '/api/v2/history', { page_slug: 'resources', snapshot: snap, changed_keys: [a.title] }).catch(() => { });
    console.log('+', a.type, a.title);
  }
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
