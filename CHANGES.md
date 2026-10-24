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

## Step 6: solution template page, add / remove on the whole website
- **Solution template** (`solution-reference.html`, route `/product-detail-<slug>.html` in `vercel.json` + dev server): every solution created in the Dashboard gets its own page (the backend already sets this link). `js/rg-content.js` (`solutionRef`) draws it from the solution row + the page elements `prod-*` of `product-detail-<slug>`: hero, photo, tag line, lead text, Get a Quote / Data Sheet buttons, Features & Benefits cards, Downloads. In edit mode every text, the photo, the features (+ Add / remove) and the downloads (+ Add / remove, link or upload a file) are editable; SAVE writes the solution row (title, tag line, summary) and the page elements (and the change history).
- **Add / remove everywhere** (`js/rg-sections.js`, markers set by `tools/build-pages.js`):
  - Repeatable lists (`data-rlist`): home stats + about paragraphs, Lunch & Learn questions, contact offices, credit terms / guaranty / sale terms, footer Products + Company link columns (the CMS Login link stays). Edit mode: edit items, remove (x), "+ Add item" (clone of the last item), change photo / link; SAVE stores one JSON page element per list (`rl-<page>-<name>`, footer lists `g-rl-footer-*` are shared by all pages).
  - Sections (`data-sec-id`, every static section of every page): "Remove section" / restore, and "+ Add section here" (Text, Image + text, Cards) after any section or at the top. Stored as the page element `sec-config` of the page ({ hidden, custom }).
  - Header menu labels and footer headings / copyright are CMS texts too (`g-txt-*`, `g-footer-*`, shared by all pages).
- Not in the live editor (they are CMS lists, managed in the Dashboard / next step): products on the Products page, resources, project highlights, and the 15 home gallery photos (each photo can be replaced).

## Step 7: dashboard (`dashboard.html`, `js/dashboard.js`, `css/dashboard.css`)
- Sidebar: Overview, **Solutions**, **Project Highlights**, **Resources**, Settings (Change History, Email Configuration, Change Password) and, for admins only, **Pending Approvals** and **Team & Access**. Opens by itself inside the live site from the DASHBOARD button (`dashboard.html?embed=1`, the page reloads when it is closed after a change). The edit-mode pages get "Edit ... in the Dashboard" badges on the lists drawn from the CMS.
- **Solutions** (add / edit / delete): name, small heading, order, group (RockGuard HD / PipeWeights / Accessory / Other), summary (home card), lead text, card photo, product-page photo, Resources-tile photo, features (`Title | text` per line), downloads (`Label | link | type` per line), page the card opens, show / hide. The product page texts are saved as the page elements `prod-*` of `product-detail-<slug>`; a new solution gets its own page `/product-detail-<slug>.html` from the template.
- **Project Highlights**: title, page heading, location, dates, owner, contractor, supplier, product, benefits, card text, challenge, solution, up to 6 photos, project PDF / link. The extras are kept in `result_text` (JSON; the fields the form does not show, e.g. the technical table, are kept).
- **Resources**: title, type (Data Sheet, Sizing Chart, Installation, Brochure, Specification, Safety, Technical Note, Webinar, Video, Blog Post), product (= a solution), file or link, show / hide; type tabs like the Resources page + a product filter with counts; "Add" starts with the selected tab's type and product.
- **Change Password**, **Email Configuration** (SMTP + CC rows per form: Contact, Lunch & Learn, Credit Application + send a test mail), **Change History** (dashboard saves, live-editor saves, list / section edits), **Team & Access** (add admin / editor, edit, reset password, remove) and **Pending Approvals** (an editor's saves wait there; approve / reject), same backend endpoints as the other CMS sites. Every dashboard save is written to the change history.
- Blog / Webinar pages of their own do not exist on this website (their resources open the file / link), so the template pages for them were not made.
