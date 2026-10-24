/* RockGuard data cache (window.RGC).
 * The first time a visitor opens the website the page shows its loader while the CMS data of that page is fetched; the data is kept in the browser
 * (localStorage) and, once the page is shown, the data of ALL other pages and lists is fetched in the background too.
 * After that every page is drawn at once from the cache (no loader) and refreshed from the CMS in the background (js/cms.js, js/rg-content.js).
 * A signed-in admin uses the cache too (no loader when switching pages): signing in / out clears it, and after SAVE the cache is refreshed in the background (RGC.refresh).
 * Nothing here is required: if localStorage is blocked or full everything works as before (loader on every page).
 */
(function () {
  'use strict';
  var KEY = 'rg-cache-v1', T = 'rg-cache-t', ADMIN = 'rg-admin', MAX = 24 * 3600e3, FRESH = 10 * 60e3;
  var PAGES = ['index', 'products', 'resources', 'project-highlights', 'contact', 'lunch-learn', 'credit-application'];
  var LISTS = ['solutions', 'stories', 'resources?all=true'];   // the paths js/rg-content.js asks for
  var mem = null, timer = 0;
  function ls(f) { try { return f(window.localStorage); } catch (e) { return null; } }
  function load() {
    if (mem) return mem;
    var j = ls(function (s) { return JSON.parse(s.getItem(KEY) || 'null'); });
    mem = j && j.v === 1 && j.pages && j.lists ? j : { v: 1, pages: {}, lists: {} }; return mem;
  }
  function flush() {
    clearTimeout(timer);
    timer = setTimeout(function () { ls(function (s) { s.setItem(KEY, JSON.stringify(mem)); s.setItem(T, String(Date.now())); }); }, 60);
  }
  var RGC = window.RGC = {
    // may the cache be used for drawing the page? (not for a signed-in admin, not when older than a day)
    usable: function () { return !!ls(function (s) { var t = +s.getItem(T); return t && Date.now() - t < MAX; }); },
    page: function (slug) { var e = load().pages[slug]; return e ? e.d : null; },
    list: function (path) { var e = load().lists[path]; return e ? e.d : null; },
    setPage: function (slug, rows) { if (Array.isArray(rows)) { load().pages[slug] = { t: Date.now(), d: rows }; flush(); } },
    setList: function (path, rows) { if (Array.isArray(rows)) { load().lists[path] = { t: Date.now(), d: rows }; flush(); } },
    clear: function () { clearTimeout(timer); mem = { v: 1, pages: {}, lists: {} }; ls(function (s) { s.removeItem(KEY); s.removeItem(T); }); },
    // a signed-in admin always gets fresh data: set / unset by js/cms.js and js/login.js
    admin: function (on) { if (on) ls(function (s) { s.setItem(ADMIN, '1'); }); else ls(function (s) { s.removeItem(ADMIN); }); },
    refresh: function () { warm(true); }   // after a save: fetch everything again in the background (the cache stays in use)
  };

  /* background: fetch the data of the rest of the website once the page is shown (only what is missing or older than 10 minutes) */
  function jget(path) { return fetch('/api/v2/' + path, { credentials: 'include', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  function warm(force) {
    if (!RGC.usable()) return; var c = load(), now = Date.now(), jobs = [];
    PAGES.forEach(function (p) { var e = c.pages[p]; if (!e || force || now - e.t > FRESH) jobs.push(jget('page-elements/' + encodeURIComponent(p)).then(function (d) { RGC.setPage(p, d); })); });
    LISTS.forEach(function (p) { var e = c.lists[p]; if (!e || force || now - e.t > FRESH) jobs.push(jget(p).then(function (d) { RGC.setList(p, d); return d; })); });
    // the page elements of every product page (texts, features, downloads): one entry per solution
    var sol = c.lists.solutions; (sol ? Promise.resolve(sol.d) : Promise.all(jobs).then(function () { var e = load().lists.solutions; return e ? e.d : []; })).then(function (rows) {
      (rows || []).forEach(function (r) { var p = 'page-elements/' + encodeURIComponent('product-detail-' + r.slug), e = load().lists[p]; if (r.slug && (!e || force || Date.now() - e.t > FRESH)) jget(p).then(function (d) { RGC.setList(p, d); }); });
    });
  }
  window.addEventListener('load', function () { setTimeout(warm, 1200); });
})();
