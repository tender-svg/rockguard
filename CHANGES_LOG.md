# RockGuard frontend - change log

Dated list of changes to this site. Details of bigger features go in CHANGES.md. Local-testing DB only (project iuvjtyvmhajxxewqnwik, schema `rockguard`); live is never written.

## 2026-10-24
- Git initialised (branch main), remote origin = https://github.com/tender-svg/rockguard.git (empty, nothing pushed), .gitignore added. Read-only survey of the design files and of RoadGlas CHANGES.md; no site code changed yet.
- Images: 32 images (2 logos from the zip + 30 remote rockguard.biz images used by the design: HD gallery, product photos, tape, brand logos) converted to WebP, all under 100 KB (7954 KB -> 1235 KB), in images/. Originals moved out of the project to D:projectsROCKGUARD_images_backuporiginals (only the WebP files in images/ are used by the site). Script: tools/make-images.js (rerun after adding images). Frontend only; no pages changed yet.
