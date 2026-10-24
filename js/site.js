/* RockGuard site behaviour (replaces the old x-dc component runtime).
 * Every page is static HTML; this file only adds the interactions:
 *   - navigation buttons ([data-href])
 *   - tabs / filters / list-grid / project gallery / credit steps: the page contains one block per state
 *     ([data-vgroup][data-vstate]); a click on an element with [data-set='{"key":value}'] changes the state and shows the matching block
 *   - Support dropdown, mobile menu, home photo gallery slider
 *   - project search, credit application steps, forms (validation + thank-you message)
 */
(function () {
  'use strict';
  var body = document.body;
  var state = {};
  try { state = JSON.parse(body.getAttribute('data-state') || '{}'); } catch (e) { state = {}; }
  var all = function (sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); };

  /* ------------------------------------------------------------ state <-> visible blocks */
  var groups = all('[data-vgroup]');
  var counts = {};   // highest value seen per state key (e.g. number of photos of a project)
  groups.forEach(function (el) { try { var vs = JSON.parse(el.getAttribute('data-vstate')); Object.keys(vs).forEach(function (k) { if (typeof vs[k] === 'number') counts[k] = Math.max(counts[k] || 0, vs[k]); }); } catch (e) { } });
  function matches(vs) { return Object.keys(vs).every(function (k) { return state[k] === vs[k]; }); }
  function render() {
    groups.forEach(function (el) {
      var vs; try { vs = JSON.parse(el.getAttribute('data-vstate')); } catch (e) { return; }
      el.hidden = !matches(vs);
    });
    afterRender();
  }
  function setState(patch) {
    var changed = false;
    Object.keys(patch).forEach(function (k) { if (state[k] !== patch[k]) { state[k] = patch[k]; changed = true; } });
    if (changed) render();
  }
  function visible(sel) { return all(sel).filter(function (el) { return !el.closest('[hidden]'); }); }

  // entry points from other pages: products.html?prod=pw  /  resources.html?prod=pw
  (function initFromUrl() {
    var m = /[?&]prod=(hd|pw|acc|all)\b/.exec(location.search); if (!m) return;
    if ('product' in state && m[1] !== 'all') state.product = m[1];
    if ('prod' in state) state.prod = { hd: 'RockGuard® HD', pw: 'PipeWeights', acc: 'Accessories', all: 'All Products' }[m[1]];
  })();

  /* ------------------------------------------------------------ clicks */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-href],[data-set],[data-act],[data-agree]');
    if (!t) return;
    if (t.hasAttribute('data-href')) { location.href = t.getAttribute('data-href'); return; }
    if (t.hasAttribute('data-set')) {
      var patch; try { patch = JSON.parse(t.getAttribute('data-set')); } catch (err) { return; }
      setState(patch);
      if ('cstep' in patch) window.scrollTo({ top: 0 });
      return;
    }
    if (t.hasAttribute('data-agree')) { toggleAgree(t); return; }
    var act = t.getAttribute('data-act');
    if (act === 'ss-prev') slider && slider.step(-1);
    else if (act === 'ss-next') slider && slider.step(1);
    else if (act === 'hl-prev' || act === 'hl-next') stepPhoto(act === 'hl-next' ? 1 : -1, true);
    else if (act === 'hl-up' || act === 'hl-down') stepPhoto(act === 'hl-down' ? 1 : -1, false);
    else if (act === 'toggle-sale') toggleSale(t);
    else if (act === 'c-next') creditNext();
    else if (act === 'c-back') { setState({ cstep: Math.max(0, state.cstep - 1) }); window.scrollTo({ top: 0 }); }
    else if (act === 'c-reset') creditReset();
    else if (act === 'form-reset') resetForm();
  });

  /* ------------------------------------------------------------ mobile menu */
  (function () {
    var burger = document.querySelector('.rg-burger'); if (!burger) return;
    function set(open) { body.classList.toggle('nav-open', open); burger.setAttribute('aria-expanded', open ? 'true' : 'false'); burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); }
    burger.addEventListener('click', function (e) { e.stopPropagation(); set(!body.classList.contains('nav-open')); });
    window.addEventListener('resize', function () { if (window.innerWidth > 1000) set(false); });
  })();

  /* ------------------------------------------------------------ Support dropdown */
  (function () {
    var dd = document.querySelector('[data-dd]'); if (!dd) return;
    var wrap = dd.parentElement, btn = wrap.querySelector('button');
    var open = function () { dd.hidden = false; }, close = function () { dd.hidden = true; };
    wrap.addEventListener('mouseenter', function () { if (window.innerWidth > 1000) open(); });
    wrap.addEventListener('mouseleave', function () { if (window.innerWidth > 1000) close(); });
    btn.addEventListener('click', function (e) { e.stopPropagation(); dd.hidden = !dd.hidden; });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(); });
    if (window.innerWidth <= 1000 && wrap.querySelector('[style*="color:#111"],[style*="color: #111"]')) open();
  })();

  /* ------------------------------------------------------------ home: photo gallery slider */
  var slider = (function () {
    var host = document.querySelector('[data-ss="host"]'); if (!host) return null;
    var track = host.querySelector('.rg69'), slides = [].slice.call(track.children);
    var real = slides.length - 3, cur = 0, paused = false, timer;
    var per = function () { var b = parseFloat(getComputedStyle(slides[0]).flexBasis); return b ? Math.round(100 / b) || 3 : 3; };
    function apply(anim) {
      track.style.transition = anim ? 'transform .9s cubic-bezier(.65,0,.35,1)' : 'none';
      track.style.transform = 'translateX(' + (-cur * 100 / per()) + '%)';
    }
    function step(d) {
      if (d < 0 && cur === 0) { cur = real; apply(false); void track.offsetWidth; cur = real - 1; apply(true); return; }
      cur = Math.min(cur + d, real); apply(true);
    }
    track.addEventListener('transitionend', function () { if (cur >= real) { cur = 0; apply(false); } });
    host.addEventListener('mouseenter', function () { paused = true; });
    host.addEventListener('mouseleave', function () { paused = false; });
    window.addEventListener('resize', function () { apply(false); });
    timer = setInterval(function () { if (!paused && !body.classList.contains('cms-editing')) step(1); }, 4000);
    apply(false);
    return { step: step };
  })();

  /* ------------------------------------------------------------ project highlights: search + photo stepping */
  function applySearch() {
    var inputs = visible('[data-f="hlQ"]'); if (!inputs.length) return;
    var q = (state.hlQ || '').toLowerCase().trim();
    all('[data-f="hlQ"]').forEach(function (i) { if (i.value !== (state.hlQ || '')) i.value = state.hlQ || ''; });
    var any = false;
    visible('[data-vgroup="pm"] article').forEach(function (a) { var show = !q || a.textContent.toLowerCase().indexOf(q) >= 0; a.hidden = !show; if (show) any = true; });
    visible('[data-hl-empty]').forEach(function (n) { n.hidden = any; });
    all('[data-hl-empty]').forEach(function (n) { if (n.closest('[hidden]')) n.hidden = true; });
  }
  document.addEventListener('input', function (e) { var el = e.target; if (el.getAttribute && el.getAttribute('data-f') === 'hlQ') { state.hlQ = el.value; applySearch(); } });
  function stepPhoto(d, wrap) {
    if (!('hlImg' in state)) return;
    var n = (counts.hlImg || 0) + 1, i = state.hlImg + d;
    if (wrap) i = (i + n) % n; else i = Math.max(0, Math.min(n - 1, i));
    setState({ hlImg: i });
  }

  /* ------------------------------------------------------------ contact: state / province list follows the country */
  document.addEventListener('change', function (e) {
    var el = e.target; if (!el.getAttribute || el.getAttribute('data-f') !== 'ctCountry' || !window.RG_GEO) return;
    var sel = el.closest('form').querySelector('[data-f="ctState"]'); if (!sel) return;
    var list = window.RG_GEO[el.value] || ['Other'], first = sel.options[0];
    sel.innerHTML = ''; sel.appendChild(first);
    list.forEach(function (s) { var o = document.createElement('option'); o.value = o.textContent = s; sel.appendChild(o); });
    sel.value = '';
  });

  /* ------------------------------------------------------------ forms */
  var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  function markErr(el, bad) { el.style.borderColor = bad ? '#de4228' : ''; }
  document.addEventListener('input', function (e) { var el = e.target; if (el.style && el.style.borderColor && el.tagName !== 'BUTTON') markErr(el, false); });
  function checkFields(root) {
    var first = null;
    all('input,select,textarea', root).forEach(function (el) {
      if (el.hidden || el.closest('[hidden]')) return;
      var req = el.required || el.hasAttribute('data-req'), v = (el.value || '').trim();
      var bad = (req && !v) || (v && el.type === 'email' && !EMAIL.test(v));
      markErr(el, bad); if (bad && !first) first = el;
    });
    return first;
  }
  document.addEventListener('submit', function (e) {
    var form = e.target, kind = form.getAttribute('data-submit'); if (!kind) return;
    e.preventDefault();
    var first = checkFields(form);
    if (first) { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    var nameEl = form.querySelector('[name="name"],[name="first"]'), name = nameEl ? nameEl.value.trim().split(' ')[0] : '';
    all('[data-fill="name"]').forEach(function (s) { s.textContent = name; });
    var patch = {}; patch[kind === 'contact' ? 'sent' : 'lunchSent'] = true; setState(patch);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  function resetForm() {
    all('form[data-submit]').forEach(function (f) { f.reset(); });
    var patch = {}; if ('sent' in state) patch.sent = false; if ('lunchSent' in state) patch.lunchSent = false; setState(patch);
  }

  /* ------------------------------------------------------------ credit application (6 steps) */
  var agrees = {};
  function paintAgree(btn) {
    var on = !!agrees[btn.getAttribute('data-agree')], box = btn.firstElementChild;
    box.style.background = on ? '#de4228' : '#fff'; box.style.borderColor = on ? '#de4228' : '#2c2e35'; box.textContent = on ? '✓' : '';
  }
  function toggleAgree(btn) { var k = btn.getAttribute('data-agree'); agrees[k] = !agrees[k]; paintAgree(btn); }
  function toggleSale(btn) {
    var terms = btn.parentNode.querySelector('[data-sale]'); if (!terms) return;
    terms.hidden = !terms.hidden;
    btn.textContent = terms.hidden ? 'Show full Terms & General Conditions of Sale' : 'Hide Terms & General Conditions of Sale';
  }
  function creditError(block, msg) {
    var box = block.querySelector('.rg227');
    if (!msg) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.className = 'rg227'; block.querySelector('.rg228').parentNode.insertBefore(box, block.querySelector('.rg228')); }
    box.textContent = msg;
  }
  function buildSummary() {
    var host = visible('.rg216')[0]; if (!host) return;
    var html = '';
    [0, 1, 2, 3].forEach(function (s) {
      var b = document.querySelector('[data-vgroup="cstep"][data-vstate*=\'"cstep":' + s + ',\']'); if (!b) return;
      var rows = '';
      all('label.rg223', b).forEach(function (l) {
        var f = l.querySelector('input,select'); var v = f && f.value.trim(); if (!v) return;
        rows += '<div class="rg219"><span class="rg220">' + l.firstChild.textContent.replace(/\s*\*\s*$/, '').replace(' — Company Name', '').trim() + '</span><span class="rg221"></span></div>';
        rows = rows.replace(/<span class="rg221"><\/span>$/, function () { return '<span class="rg221" data-v></span>'; });
      });
      if (!rows) return;
      var d = document.createElement('div'); d.className = 'rg217'; d.innerHTML = '<div class="rg218"></div>' + rows;
      d.firstChild.textContent = b.querySelector('.rg205').textContent;
      var vals = all('label.rg223', b).map(function (l) { var f = l.querySelector('input,select'); return f && f.value.trim(); }).filter(Boolean);
      all('[data-v]', d).forEach(function (n, i) { n.textContent = vals[i]; n.removeAttribute('data-v'); });
      html += d.outerHTML;
    });
    host.innerHTML = html;
  }
  function creditNext() {
    var block = visible('[data-vgroup="cstep"]')[0]; if (!block) return;
    var last = state.cstep === counts.cstep, first = checkFields(block), msg = '';
    if (first) msg = 'Please complete the highlighted required fields.';
    else if (last && !(agrees.agT && agrees.agG && agrees.agS)) msg = 'Please accept the three agreements in Section 5 (Terms & Guaranty) to submit.';
    creditError(block, msg);
    if (msg) { if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if (last) {
      all('strong.rg44').forEach(function (s) { if (s.closest('[data-vstate*="csent\\":true"]')) s.textContent = 'IFI-' + Math.floor(100000 + Math.random() * 900000); });
      setState({ csent: true }); window.scrollTo({ top: 0 }); return;
    }
    setState({ cstep: state.cstep + 1 }); window.scrollTo({ top: 0 });
  }
  function creditReset() {
    all('input,select').forEach(function (el) { if (el.form === null || el.closest('[data-vgroup="cstep"]')) { el.value = ''; markErr(el, false); } });
    agrees = {}; all('[data-agree]').forEach(paintAgree);
    setState({ cstep: 0, csent: false }); window.scrollTo({ top: 0 });
  }

  function afterRender() {
    if (state.cstep === counts.cstep && !state.csent) buildSummary();
    all('[data-agree]').forEach(paintAgree);
    applySearch();
  }
  render();
})();
