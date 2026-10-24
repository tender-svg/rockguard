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
    else if (act === 'c-back') { setState({ cstep: Math.max(0, state.cstep - 1) }); toForm(); }
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
    // the 3 copies at the end (endless loop) follow the photos of the first three slides (also after the CMS changed them)
    function syncClones() { for (var i = 0; i < 3; i++) { var s = slides[i].querySelector('img'), c = slides[real + i].querySelector('img'); if (s && c && c.getAttribute('src') !== s.getAttribute('src')) c.setAttribute('src', s.getAttribute('src')); } }
    document.addEventListener('rg-applied', syncClones); syncClones();
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
  /* ---- sending: the backend (POST /api/contact, ContactController) mails the form through the SMTP account of Dashboard > Email Configuration and
   *      copies the CC rows of that form (form_type: support / lunch_learn / credit_application). The "sent" screen shows only after the mail went out. */
  var GEO = function () { return window.RG_CODES || { country: {}, us: {}, ca: {} }; };
  // the CC rules of the Dashboard use codes: country US / CA ..., US state TX ...
  function countryCode(v) {
    v = String(v || '').trim(); if (!v) return ''; var g = GEO(), up = v.toUpperCase().replace(/\./g, '');
    if (g.country[v]) return g.country[v];
    if (up === 'USA' || up === 'US' || up === 'UNITED STATES' || up === 'UNITED STATES OF AMERICA') return 'US';
    return v.length <= 3 ? up : v;
  }
  function stateCode(country, v) {
    v = String(v || '').trim(); if (!v) return ''; var g = GEO(), t = g.us[v] || (country === 'CA' ? g.ca[v] : '');
    return t || (v.length <= 3 ? v.toUpperCase() : v);
  }
  function sendForm(payload) {
    return fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.success === false) throw new Error(j.message || j.error || ('Error ' + r.status)); return j; }); });
  }
  var failText = function (err) { return 'Sorry, your message could not be sent (' + (err && err.message || 'network error') + '). Please try again in a moment or call us.'; };
  function fieldVal(form, n) { var el = form.elements[n]; return el ? String(el.value || '').trim() : ''; }
  function payloadOf(kind, form) {
    var v = function (n) { return fieldVal(form, n); }, join = function () { return [].slice.call(arguments).filter(Boolean).join(' '); };
    var cc = countryCode(v('country')), st = stateCode(cc, v('state'));
    if (kind === 'contact') {
      return { form_type: 'support', subject: v('subject') || 'Contact form', name: v('name'), email: v('email'), phone: v('phone'), company: v('company'), project_country: cc, project_state: st, project_city: v('city'), company_address: v('address'), message: v('message') };
    }
    return { form_type: 'lunch_learn', subject: 'Lunch & Learn request', name: join(v('first'), v('last')), email: v('email'), phone: v('phone'), company: v('company'), product: v('products'), project_country: cc, project_state: st, project_city: v('city'),
      message: ['Title: ' + v('title'), 'People attending: ' + v('attending'), v('date') && 'Preferred date: ' + v('date'), v('notes') && 'Notes: ' + v('notes')].filter(Boolean).join('\n') };
  }
  document.addEventListener('submit', function (e) {
    var form = e.target, kind = form.getAttribute('data-submit'); if (!kind) return;
    e.preventDefault();
    if (body.classList.contains('cms-editing')) return;   // edit mode: the form texts are being edited, nothing is sent
    var first = checkFields(form);
    if (first) { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    var btn = form.querySelector('button[type="submit"]'), label = btn ? btn.textContent : '', msg = form.querySelector('.form-err');
    if (!msg) { msg = document.createElement('div'); msg.className = 'form-err'; msg.setAttribute('role', 'alert'); msg.style.cssText = 'color:#de4228;font-size:15px;margin-top:12px;font-weight:600'; (btn ? btn.parentNode : form).appendChild(msg); }
    msg.textContent = ''; if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    sendForm(payloadOf(kind, form)).then(function () {
      var nameEl = form.elements.name || form.elements.first, name = nameEl ? nameEl.value.trim().split(' ')[0] : '';
      all('[data-fill="name"]').forEach(function (n) { n.textContent = name; });
      var patch = {}; patch[kind === 'contact' ? 'sent' : 'lunchSent'] = true; setState(patch);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function (err) { msg.textContent = failText(err); }).then(function () { if (btn) { btn.disabled = false; btn.textContent = label; } });
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
  function toForm() { var f = document.querySelector('section.rg195'); if (!f) return; var top = f.getBoundingClientRect().top + (window.pageYOffset || 0) - 100; window.scrollTo({ top: Math.max(0, top) }); }
  function creditNext() {
    if (body.classList.contains('cms-editing')) { var cur = visible('[data-vgroup="cstep"]')[0]; if (cur && state.cstep < counts.cstep) { setState({ cstep: state.cstep + 1 }); toForm(); } return; }   // edit mode: just look at the next step, nothing is checked or sent
    var block = visible('[data-vgroup="cstep"]')[0]; if (!block) return;
    var last = state.cstep === counts.cstep, first = checkFields(block), msg = '';
    if (first) msg = 'Please complete the highlighted required fields.';
    else if (last && !(agrees.agT && agrees.agG && agrees.agS)) msg = 'Please accept the three agreements in Section 5 (Terms & Guaranty) to submit.';
    creditError(block, msg);
    if (msg) { if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if (last) { creditSend(block); return; }
    setState({ cstep: state.cstep + 1 }); toForm();
  }
  // every field of the six steps (data-f = the key of the field), in one payload
  function creditValues() { var o = {}; all('[data-vgroup="cstep"] [data-f]').forEach(function (el) { var k = el.getAttribute('data-f'); if (o[k] == null || o[k] === '') o[k] = String(el.value || '').trim(); }); return o; }
  function creditSend(block) {
    var c = creditValues(), cc = countryCode(c.country), btn = block.querySelector('[data-act="c-next"]'), label = btn ? btn.textContent : '';
    var p = { form_type: 'credit_application', subject: 'Credit Application', name: c.sname || c.company, email: c.email, phone: c.phone, company: c.company, product: c.products, message: '',
      company_address: c.addr, project_country: cc, project_state: stateCode(cc, c.state), project_city: c.city, zip: c.zip, county: c.county, fax: c.fax, salesperson: c.sales, date_started: c.started,
      mailing_address: c.maddr, mailing_city: c.mcity, mailing_state: c.mstate, mailing_zip: c.mzip, owners: c.owners, fed_tax_id: c.taxid, duns: c.duns, accounting_contact: c.acct,
      business_type: c.btype, credit_amount: c.amount, po_required: c.po,
      ref1_company: c.r1co, ref1_email: c.r1em, ref1_phone: c.r1ph, ref2_company: c.r2co, ref2_email: c.r2em, ref2_phone: c.r2ph, ref3_company: c.r3co, ref3_email: c.r3em, ref3_phone: c.r3ph,
      bank_name: c.bank, bank_phone: c.bphone, bank_account: c.bacct, bank_contact: c.bcontact, bank_address: c.baddr, bank_city: c.bcity, bank_state: c.bstate, bank_zip: c.bzip,
      tax_business_type: c.taxbiz, tax_exempt_all: c.exall, tax_exempt_some: c.exsome, agree_terms: agrees.agT ? 'Yes' : '', agree_guaranty: agrees.agG ? 'Yes' : '', agree_tos: agrees.agS ? 'Yes' : '',
      guarantor_name: c.gname, guarantor_title: c.gtitle, sign_name: c.sname, sign_signature: c.sig, sign_title: c.stitle };
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    creditError(block, '');
    sendForm(p).then(function () {
      all('strong.rg44').forEach(function (n) { if (n.closest('[data-vstate*="csent\\":true"]')) n.textContent = 'IFI-' + Math.floor(100000 + Math.random() * 900000); });
      setState({ csent: true }); toForm();
    }).catch(function (err) { creditError(block, failText(err)); }).then(function () { if (btn) { btn.disabled = false; btn.textContent = label; } });
  }
  function creditReset() {
    all('input,select').forEach(function (el) { if (el.form === null || el.closest('[data-vgroup="cstep"]')) { el.value = ''; markErr(el, false); } });
    agrees = {}; all('[data-agree]').forEach(paintAgree);
    setState({ cstep: 0, csent: false }); toForm();
  }

  function afterRender() {
    if (state.cstep === counts.cstep && !state.csent) buildSummary();
    all('[data-agree]').forEach(paintAgree);
    applySearch();
  }
  render();
})();
