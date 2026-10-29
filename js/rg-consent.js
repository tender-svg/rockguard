/* RockGuard cookie banner (first visit) + "Cookie Preferences" (footer link, [data-cookie-prefs]).
 *  - The only optional third-party item is the ZoomInfo tracking tag (see privacy-policy.html, section 4). It is loaded ONLY after "Accept" (or when it is switched
 *    on under "View preferences"); "Deny" / closing the banner / the browser's Global Privacy Control signal = it is not loaded.
 *  - The choice is kept in localStorage ("rg_cookie_consent"). Nothing else on the site depends on it (the staff cookie and the page cache are essential).
 *  - ZOOMINFO_SRC: the address of the company's ZoomInfo tag (the script URL of its ZoomInfo / WebSights snippet). It is empty until the company
 *    supplies it: with an empty value nothing is ever loaded, whatever the visitor chooses.
 */
(function () {
  'use strict';
  var KEY = 'rg_cookie_consent';
  var ZOOMINFO_SRC = '';
  var root = document.documentElement;

  function read() { try { var j = JSON.parse(localStorage.getItem(KEY)); return j && j.v === 1 ? j : null; } catch (e) { return null; } }
  var loaded = false;
  function loadTag() { if (loaded || !ZOOMINFO_SRC) return; loaded = true; var s = document.createElement('script'); s.async = true; s.src = ZOOMINFO_SRC; document.head.appendChild(s); }
  function save(tracking) { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, tracking: !!tracking, t: Date.now() })); } catch (e) { /* storage blocked: the banner just shows again next time */ } if (tracking) loadTag(); }

  var cur = read();
  if (!cur && navigator.globalPrivacyControl === true) { save(false); cur = read(); }   // the browser's opt-out signal counts as "Deny"
  if (cur && cur.tracking) loadTag();

  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function close() { var b = document.getElementById('rg-consent'); if (b) { b.classList.add('out'); setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 280); } }

  function main(on) {
    return '<div class="rgc-body"><p>We use cookies to make our website work and to remember your preferences.</p>' +
      '<p>See our <a href="privacy-policy.html#cookies">Cookie Policy</a> and <a href="privacy-policy.html">Privacy Statement</a> for details, including your privacy rights.</p></div>' +
      '<div class="rgc-actions"><button type="button" class="rgc-btn rgc-accept" data-c="accept">Accept</button><button type="button" class="rgc-btn rgc-alt" data-c="deny">Deny</button><button type="button" class="rgc-btn rgc-alt" data-c="prefs">View preferences</button></div>' +
      '<a class="rgc-dns" href="privacy-policy.html#california" data-c="dns">Do Not Sell or Share My Personal Information</a>';
  }
  function prefs(on) {
    return '<div class="rgc-body"><div class="rgc-row"><div><b>Essential</b><span>Needed for the website to work (page cache, staff sign-in). Always on.</span></div><label class="rgc-sw is-lock"><input type="checkbox" checked disabled><i></i></label></div>' +
      '<div class="rgc-row"><div><b>Third-party tracking tag (ZoomInfo)</b><span>Helps us understand which businesses visit our website. May set cookies and collect your IP address and the pages you visit.</span></div><label class="rgc-sw"><input type="checkbox" id="rgc-track"' + (on ? ' checked' : '') + '><i></i></label></div></div>' +
      '<div class="rgc-actions"><button type="button" class="rgc-btn rgc-accept" data-c="save">Save preferences</button><button type="button" class="rgc-btn rgc-alt" data-c="back">Back</button></div>';
  }
  function show(openPrefs) {
    var old = document.getElementById('rg-consent'); if (old) old.remove();
    var on = !!(read() && read().tracking), b = document.createElement('div'); b.id = 'rg-consent'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', 'Cookie consent');
    b.innerHTML = '<div class="rgc-card"><div class="rgc-head"><h4>Our Site Uses Cookies</h4><button type="button" class="rgc-x" data-c="deny" aria-label="Close">&times;</button></div><div class="rgc-view">' + (openPrefs ? prefs(on) : main(on)) + '</div></div>';
    b.addEventListener('click', function (e) {
      var t = e.target.closest('[data-c]'); if (!t) return; var c = t.getAttribute('data-c');
      if (c === 'accept') { save(true); close(); }
      else if (c === 'deny') { save(false); close(); }
      else if (c === 'dns') { save(false); }   // opt out, then the link opens the California section of the privacy policy
      else if (c === 'prefs') { b.querySelector('.rgc-view').innerHTML = prefs(on); }
      else if (c === 'back') { b.querySelector('.rgc-view').innerHTML = main(on); }
      else if (c === 'save') { save(!!b.querySelector('#rgc-track').checked); close(); }
    });
    document.body.appendChild(b);
  }
  // first visit: after the page loader has gone, so the banner never pops up over it
  function first() {
    if (cur) return;
    var tries = 0, t = setInterval(function () { tries++; if (!root.classList.contains('rg-loading') || tries > 40) { clearInterval(t); setTimeout(function () { if (!read()) show(false); }, 500); } }, 150);
  }
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('[data-cookie-prefs]'); if (a) { e.preventDefault(); show(true); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', first); else first();
})();
