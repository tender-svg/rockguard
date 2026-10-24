# RockGuard - what was done

## Step 1: pages
- The single-file design (`_original/index.original.html`, an "x-dc" component with 7 screens) is split into one static HTML file per page by `node tools/build-pages.js`:
  `index`, `products`, `resources`, `project-highlights`, `project-highlight` (template of every project), `credit-application`, `contact`, `lunch-learn`.
  Same look, no framework at run time. Interactions (tabs, filters, credit steps, forms, slider, menu) are in `js/site.js`; `css/styles.css` is the original design CSS, `css/site.css` adds the hamburger menu, mobile breakpoints and 1920-4K scaling.
- Images: all design photos are WebP under 100 KB in `images/` (`node tools/make-images.js`; the originals are kept OUTSIDE the project in `D:\projects\ROCKGUARD_images_backup\originals`).
- `tools/original.js` runs the script of the original design in Node (data of products, projects, resources); `build-pages.js` and `seed-content.js` use it.
- `node tools/dev-server.js 5195`: static server + proxy of `/api` and `/admin` to `https://cmsapi.qpaix.com/rockguard/...` (port 5195 because 5190 is used by another project). `vercel.json` has the same rewrites for production.

## Step 2-3: footer, login
- One footer for every page (`tools/footer.html`), CMS Login link in the Company column. `login.html` (split screen, eye button, "I am not a robot" tick) posts to `/api/admin/login`. Favicon = red "RG" square of the design.
- Test admin (LOCAL DB only): `test@rockguard.biz` (Supabase Auth + `rockguard.cms_admins`, role admin). Change or remove before going live.

## Step 4: live editor
- `tools/cms-tag.js` + `tools/cms-keys.json`: every editable text / image / link gets a stable key from what it IS (kind + default text / file), never from its position. Rebuilds keep the keys (commit the registry). Parts drawn from the CMS lists (products, resources, project highlights) are not keyed.
- `js/cms.js` (+ `css/cms.css`, `js/rg-toolbar.js`): admin bar, edit / preview, inline text + image edit, link editor, SAVE via `/api/v2/page-elements`, text format toolbar.

## Step 5: public pages read the CMS (`js/rg-content.js`)
- Home product cards, Products page (tabs + Accessories), Resources page (product tiles + 6 filters), Project Highlights (list / grid + search) and each project (`/project-highlight-<slug>.html`, rewritten to `project-highlight.html`) are drawn from `/api/v2/solutions`, `/resources`, `/stories`. If the API cannot be reached the shipped content stays.
- Where a product's data lives (the backend has no extra columns): solution row (title, `category` = tag line, `short_description` = summary, `icon_image_url` = card photo, `product_family` = hd / pw / acc) + page elements of the page `product-detail-<slug>`: `prod-lead`, `prod-image`, `prod-tile`, `prod-features` (JSON), `prod-downloads` (JSON), `prod-acc-desc`. Project extras are JSON in `result_text`; a resource's product is `[product:<slug>]` in its description.
- `tools/seed-content.js` (`RG_PASS=... node tools/seed-content.js`, `--dry-run`): seeded the LOCAL DB with the content of the design: 4 solutions (RockGuard HD, PipeWeights, RockGuard Tape, PipeWeights Hoppers), 2 projects (Bayou Bridge, Shin Oak), 12 resources. Nothing invented; PDF links still point to rockguard.biz.
