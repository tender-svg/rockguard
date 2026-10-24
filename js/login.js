/* CMS login page. Posts to /api/admin/login (routed to https://cmsapi.qpaix.com/rockguard/...). On success the website opens with the CMS tools. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var form = $('#loginForm'), msg = $('#msg'), go = $('#go'), user = $('#username'), pass = $('#password'), robot = $('#robot'), eye = $('#eye');

  eye.addEventListener('click', function () {
    var show = pass.type === 'password';
    pass.type = show ? 'text' : 'password'; eye.classList.toggle('is-on', show);
    eye.setAttribute('aria-pressed', show ? 'true' : 'false'); eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); pass.focus();
  });
  function bad(el, on) { var box = el.closest('.lg-field,.lg-robot'); if (box) box.classList.toggle('bad', !!on); }
  [user, pass, robot].forEach(function (el) { el.addEventListener('input', function () { bad(el, false); msg.textContent = ''; }); el.addEventListener('change', function () { bad(el, false); }); });

  form.addEventListener('submit', function (e) {
    e.preventDefault(); msg.textContent = '';
    var u = user.value.trim(), p = pass.value, ok = true;
    if (!u) { bad(user, true); ok = false; } if (!p) { bad(pass, true); ok = false; } if (!robot.checked) { bad(robot, true); ok = false; }
    if (!ok) { msg.textContent = !u || !p ? 'Please enter your email and password.' : 'Please confirm that you are not a robot.'; return; }
    go.disabled = true; go.textContent = 'Signing in…';
    fetch('/api/admin/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })
      .then(function (r) {
        if (r.ok) { try { localStorage.setItem('rg-admin', '1'); localStorage.removeItem('rg-cache-v1'); localStorage.removeItem('rg-cache-t'); } catch (e) { /* ignore */ } $('#ok').hidden = false; setTimeout(function () { location.href = 'index.html'; }, 1400); return 'ok'; }
        bad(pass, true); msg.textContent = (r.status === 401 || r.status === 400 || r.status === 403) ? 'Wrong email or password.' : 'The CMS server is not available right now (error ' + r.status + ').';
      })
      .catch(function () { msg.textContent = 'Could not reach the CMS server.'; })
      .then(function (s) { if (s !== 'ok') { go.disabled = false; go.textContent = 'Login'; } });
  });
})();
