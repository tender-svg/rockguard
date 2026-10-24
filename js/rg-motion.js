/* Scroll animations: the title banner (photo + title) of EVERY page plays an entrance, headings / texts rise and wipe in, photos unveil with a soft zoom,
 * cards cascade, a thin progress bar runs along the top.
 * It only touches classes (no text is split or rewritten), so the CMS / the editor keep working on the same elements: texts and photos that are
 * changed in the live editor, lists drawn from the CMS, and the template pages (product, project, blog, webinar) get the same animation as the
 * shipped pages. In edit mode everything stands still (css/rg-motion.css) so typing never flickers; preview mode shows the real animation. */
(function () {
  'use strict';
  var root = document.documentElement;
  if (!('IntersectionObserver' in window) || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { root.classList.remove('rgm-pre'); return; }

  var SKIP = 'header, footer, nav, #rg-loader, button, .rg67, .rg-ctl, #cms-admin-bar, #cms-dash';
  var seen = new WeakSet();

  // whole boxes (product cards, feature cards, resource cards, project cards, questions, stats, offices, ...) animate as one piece; their texts / photos then do not animate again
  var BLOCK = 'article, .rg107, .rg133, .rg255, .rg33, .rg285, .rg96, .rg217, .wb-card, .bl-help, .art-fig';
  function skip(el, isBlock) { return !!el.closest(SKIP) || !!el.closest('.rgm-banner') || (!isBlock && !!el.closest(BLOCK)); }

  var pending = [];   // seen on the first screen while the loader / banner entrance is still running
  function reveal(el, extra) {
    if (extra) el.style.setProperty('--rgm-d', ((parseInt(el.style.getPropertyValue('--rgm-d'), 10) || 0) + extra) + 'ms');
    el.classList.add('rgm-in');
    // after the entrance, drop the heavy transition so hovers / sliders stay snappy (boxes lose the animation classes completely)
    setTimeout(function () {
      el.style.setProperty('--rgm-d', '0ms');
      if (el.classList.contains('rgm-block')) { el.classList.remove('rgm', 'rgm-up', 'rgm-block', 'rgm-in'); el.style.removeProperty('--rgm-d'); }
    }, 1800 + (extra || 0));
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      if (!ready) { pending.push(en.target); return; }
      reveal(en.target, 0);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

  function inView(el) { var r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }

  // late = content (re)drawn after load (CMS text / cards, tabs, edits): what is already on screen must never hide and re-animate
  function add(el, cls, delay, late) {
    if (seen.has(el) || skip(el, cls === 'rgm-block')) return;
    seen.add(el);
    if (late && ready && inView(el)) return;
    el.classList.add('rgm', cls, 'rgm-nt');
    fresh.push(el);
    if (delay) el.style.setProperty('--rgm-d', delay + 'ms');
    io.observe(el);
  }
  // one reflow applies the hidden start state of every element added in this pass, then the transitions come back
  var fresh = [];
  function flush() {
    if (!fresh.length) return;
    void root.offsetWidth;
    fresh.forEach(function (e) { e.classList.remove('rgm-nt'); });
    fresh = [];
  }

  // children of the same row get a small cascade (cards, columns, list items)
  function stagger(el) {
    var p = el.parentElement; if (!p) return 0;
    var sibs = [].filter.call(p.children, function (c) { return c.tagName === el.tagName || c.tagName === 'DIV'; });
    var i = sibs.indexOf(el); return i < 0 ? 0 : Math.min(i, 5) * 110;
  }

  function scan(scope, late) {
    scope = scope || document;
    [].forEach.call(scope.querySelectorAll('h2'), function (h) {   // the small label above a section heading
      var e = h.previousElementSibling;
      if (e && e.tagName === 'DIV' && e.textContent.trim().length > 0 && e.textContent.trim().length < 60 && !e.querySelector('div,p,img')) add(e, 'rgm-up', 0, late);
    });
    [].forEach.call(scope.querySelectorAll(BLOCK), function (b) {
      if (b.closest('[data-vgroup][hidden]')) return;
      add(b, 'rgm-block', Math.min(stagger(b), 440), late);
    });
    [].forEach.call(scope.querySelectorAll('h1, h2, h3'), function (el) { add(el, 'rgm-head', 0, late); });
    [].forEach.call(scope.querySelectorAll('p, li, form, table'), function (el) {
      if (el.closest('[data-vgroup][hidden]')) return;
      add(el, 'rgm-up', Math.min(stagger(el), 330), late);
    });
    [].forEach.call(scope.querySelectorAll('main img, section img, article img'), function (img) {
      if (img.closest('.rg67')) return;                    // the gallery carousel moves its own photos
      var frame = img.parentElement, clipped = false;
      try { clipped = getComputedStyle(frame).overflow === 'hidden'; } catch (e) { /* ignore */ }
      add(img, 'rgm-img', stagger(img), late);
      if (clipped) img.classList.add('rgm-zoom');
    });
    flush();
  }

  // run fn once the page loader has gone, so an entrance animation is actually seen
  function afterLoader(fn) {
    if (!root.classList.contains('rg-loading') && !document.getElementById('rg-loader')) { fn(); return; }
    var started = false;
    function begin() { if (started) return; started = true; setTimeout(fn, 60); }
    new MutationObserver(function (m, o) { if (!root.classList.contains('rg-loading')) { o.disconnect(); begin(); } }).observe(root, { attributes: true, attributeFilter: ['class'] });
    setTimeout(begin, 6000);
  }

  // The banner text is held invisible by css (html.rgm-pre, set in <head>) from the very first paint, so it never shows and then vanishes:
  // release() starts the entrance animations and lifts that hold in the same frame.
  var ready = false;
  function release() {
    ready = true;
    [].forEach.call(document.querySelectorAll('.rgm-banner:not(.rgm-banner-on)'), function (s) { void s.offsetWidth; s.classList.add('rgm-banner-on'); });
    root.classList.remove('rgm-pre');
    var q = pending; pending = []; q.forEach(function (el) { reveal(el, 450); });
  }

  // every page: the title banner at the top (home hero, dark page headers, product / project / blog / webinar banners) gets the entrance:
  // photo eases in with a soft zoom-out, label, title and the rest slide / rise in one after another
  function markBanner() {
    var h = document.querySelector('main h1, section h1'); if (!h) return;
    var sec = h.closest('section'); if (!sec || sec.classList.contains('rgm-banner')) return;
    if (sec.getBoundingClientRect().top > innerHeight * 0.8) return;   // only a banner at the top of the page
    sec.classList.add('rgm-banner');
    if (ready) { void sec.offsetWidth; sec.classList.add('rgm-banner-on'); }
  }

  function start() {
    root.classList.add('rg-motion');
    markBanner();
    scan();
    afterLoader(release);
    // content that appears later (CMS content, tabs, filters, template pages, edits): pick up new nodes
    new MutationObserver(function () { markBanner(); scan(document, true); }).observe(document.body, { childList: true, subtree: true });

    // top progress bar
    var bar = document.createElement('div'); bar.id = 'rgm-bar'; document.body.appendChild(bar);
    var tick = false;
    function upd() { tick = false; var h = document.documentElement.scrollHeight - innerHeight; bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, scrollY / h) : 0) + ')'; }
    addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true });
    upd();

    // safety net: never leave content invisible
    setTimeout(function () {
      [].forEach.call(document.querySelectorAll('.rgm:not(.rgm-in)'), function (el) { var r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) el.classList.add('rgm-in'); });
    }, 3500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
