// Downloads the design's remote images into ../ROCKGUARD_images_backup/originals (outside the project) (once) and writes every image of that folder
// to ../images as WebP, under 100 KB (same rule as the CMS upload): node tools/make-images.js
//  - longest side at most 1920 px; quality 80 -> 50, then the picture is made smaller (x0.8, not below 480 px); transparency kept
const fs = require('fs'), path = require('path'), sharp = require('sharp');
const SRC = path.join(__dirname, '..', '..', 'ROCKGUARD_images_backup', 'originals'), OUT = path.join(__dirname, '..', 'images');
const U = 'https://rockguard.biz/wp-content/uploads/';
const REMOTE = [
  ...[1, 15, 5, 19, 17, 18, 16, 11, 7, 10, 9, 8, 6, 3, 2].map(n => '2019/06/RockGuard-HD-gallery-' + n + '.jpg'),
  '2019/05/26a.jpg', '2019/05/IMG_0779-e1560528059582.jpg', '2019/05/hotgirl_small.jpg', '2019/06/Hoppers_small.jpg',
  '2019/06/IMG_0097_crop.jpg', '2019/06/RockGuard-Tape.png', '2019/06/mainpic_mdfy.jpg',
  '2019/05/IFI-CP-ES_Logo-Stacked.png', '2019/05/IFI-mark_for-dark-bg.png',
  ...['industrial_fabrics-logo-color-white-small', 'baselok-logo-color-small', 'envirotubes-logo-color-small',
      'grassguard-logo-color-small', 'green_solutions-logo-color-small', 'rockguard-logo-color-small'].map(f => '2024/12/' + f + '.png'),
];
const TARGET = 100 * 1024, MAX_DIM = 1920, MIN_DIM = 480, QUALITIES = [80, 72, 65, 58, 50];
(async () => {
  fs.mkdirSync(SRC, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
  for (const r of REMOTE) {
    const f = path.join(SRC, path.basename(r)); if (fs.existsSync(f)) continue;
    const res = await fetch(U + r);
    if (!res.ok) { console.log('FAILED', r, res.status); continue; }
    fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }
  let before = 0, after = 0, n = 0;
  for (const f of fs.readdirSync(SRC).sort()) {
    const ext = path.extname(f).toLowerCase(); if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) continue;
    const buf = fs.readFileSync(path.join(SRC, f)), meta = await sharp(buf).metadata();
    let dim = Math.min(Math.max(meta.width, meta.height), MAX_DIM), best, q;
    for (;;) {
      const img = sharp(buf).rotate().resize({ width: meta.width >= meta.height ? dim : null, height: meta.height > meta.width ? dim : null, withoutEnlargement: true });
      for (q of QUALITIES) { best = await img.clone().webp({ quality: q, effort: 6, smartSubsample: true, alphaQuality: 90 }).toBuffer(); if (best.length <= TARGET) break; }
      if (best.length <= TARGET || dim <= MIN_DIM) break;
      dim = Math.max(MIN_DIM, Math.round(dim * 0.8));
    }
    fs.writeFileSync(path.join(OUT, path.basename(f, ext).replace(/[^A-Za-z0-9_-]+/g, '-') + '.webp'), best);
    const m2 = await sharp(best).metadata(); before += buf.length; after += best.length; n++;
    console.log(f.padEnd(48), Math.round(buf.length / 1024) + ' KB -> ' + Math.round(best.length / 1024) + ' KB', meta.width + 'x' + meta.height + ' -> ' + m2.width + 'x' + m2.height, best.length > TARGET ? 'OVER 100 KB' : '');
  }
  console.log('TOTAL', Math.round(before / 1024) + ' KB ->', Math.round(after / 1024) + ' KB (' + n + ' files)');
})();
