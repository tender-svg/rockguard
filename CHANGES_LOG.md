# RockGuard frontend - change log

Dated list of changes to this site. Details of bigger features go in CHANGES.md. Local-testing DB only (project iuvjtyvmhajxxewqnwik, schema `rockguard`); live is never written.

## 2026-10-24
- Git initialised (branch main), remote origin = https://github.com/tender-svg/rockguard.git (empty, nothing pushed), .gitignore added. Read-only survey of the design files and of RoadGlas CHANGES.md; no site code changed yet.
- Images: 32 images (2 logos from the zip + 30 remote rockguard.biz images used by the design: HD gallery, product photos, tape, brand logos) converted to WebP, all under 100 KB (7954 KB -> 1235 KB), in images/. Originals moved out of the project to D:projectsROCKGUARD_images_backuporiginals (only the WebP files in images/ are used by the site). Script: tools/make-images.js (rerun after adding images). Frontend only; no pages changed yet.
- Step 1 (pages): the single-file x-dc design (zip: _original/index.original.html + css) split into 9 static pages by tools/build-pages.js: index, products (tabs RockGuard HD / PipeWeights / Accessories), resources (6 filters x 4 product groups), project-highlights (+ project-highlight-1/2: Bayou Bridge, Shin Oak), credit-application (6-step wizard), contact, lunch-learn. Interactions in js/site.js; css/styles.css = original design CSS, css/site.css = burger menu, mobile and 1920-4K scaling. tools/dev-server.js (port 5190, proxies /api to cmsapi.qpaix.com/rockguard). Forms only show the thank-you message for now (backend wiring comes later). Frontend only; no DB / backend touched.
