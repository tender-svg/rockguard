/* RockGuard dialogs: the site's own confirm / alert boxes (never the browser's native ones).
 *   RGDialog.confirm({ title, message, ok, cancel, danger }) -> Promise<boolean>
 *   RGDialog.alert(message, { title, ok })                   -> Promise<void>
 * "\n" in a message starts a new line. Escape / click outside = cancel. Self-contained: injects its own CSS. */
(function () {
  'use strict';
  if (window.RGDialog) return;

  var css = '' +
    '#rgd-ov{position:fixed;inset:0;z-index:2147483600;background:rgba(10,12,16,.62);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .18s ease}' +
    '#rgd-ov.in{opacity:1}' +
    '#rgd-ov .rgd-card{background:#fff;width:min(460px,100%);box-shadow:0 22px 64px rgba(0,0,0,.45);border-top:5px solid #2c2e35;padding:26px 26px 22px;transform:translateY(14px) scale(.97);transition:transform .22s cubic-bezier(.2,.8,.2,1);font-family:"Barlow",Arial,sans-serif;color:#2C2E35;text-align:left}' +
    '#rgd-ov.in .rgd-card{transform:none}' +
    '#rgd-ov.danger .rgd-card{border-top-color:#de4228}' +
    '#rgd-ov .rgd-h{margin:0 0 10px;font-family:"Barlow Condensed",Arial Narrow,Arial,sans-serif;font-weight:800;font-size:26px;line-height:1.1;text-transform:uppercase;letter-spacing:.01em}' +
    '#rgd-ov .rgd-m{margin:0 0 22px;font-size:16px;line-height:1.55;color:#4a4c53;white-space:pre-line;word-break:break-word}' +
    '#rgd-ov .rgd-b{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}' +
    '#rgd-ov button{font-family:"Barlow Condensed",Arial Narrow,Arial,sans-serif;font-weight:800;font-size:16px;letter-spacing:.08em;text-transform:uppercase;padding:12px 24px;cursor:pointer;border:2px solid #2c2e35;background:#2c2e35;color:#fff;transition:background .15s,color .15s,border-color .15s}' +
    '#rgd-ov button:hover{background:#0a2a76;border-color:#0a2a76}' +
    '#rgd-ov button.rgd-no{background:#fff;color:#2c2e35}' +
    '#rgd-ov button.rgd-no:hover{background:#2c2e35;color:#fff}' +
    '#rgd-ov.danger button.rgd-yes{background:#de4228;border-color:#de4228}' +
    '#rgd-ov.danger button.rgd-yes:hover{background:#c42312;border-color:#c42312}' +
    '#rgd-ov button:focus-visible{outline:3px solid #F2B8A8;outline-offset:2px}' +
    '@media (prefers-reduced-motion:reduce){#rgd-ov,#rgd-ov .rgd-card{transition:none}}';

  var styled = false;
  function addCss() { if (styled) return; styled = true; var s = document.createElement('style'); s.id = 'rgd-css'; s.textContent = css; document.head.appendChild(s); }

  var queue = Promise.resolve();   // one dialog at a time

  function open(o, withCancel) {
    return new Promise(function (resolve) {
      addCss();
      var prev = document.activeElement;
      var ov = document.createElement('div'); ov.id = 'rgd-ov'; if (o.danger) ov.className = 'danger';
      var card = document.createElement('div'); card.className = 'rgd-card'; card.setAttribute('role', withCancel ? 'dialog' : 'alertdialog'); card.setAttribute('aria-modal', 'true');
      var h = document.createElement('h3'); h.className = 'rgd-h'; h.textContent = o.title; h.id = 'rgd-t'; card.setAttribute('aria-labelledby', 'rgd-t');
      var m = document.createElement('p'); m.className = 'rgd-m'; m.textContent = o.message;
      var row = document.createElement('div'); row.className = 'rgd-b';
      var no, yes = document.createElement('button'); yes.type = 'button'; yes.className = 'rgd-yes'; yes.textContent = o.ok;
      if (withCancel) { no = document.createElement('button'); no.type = 'button'; no.className = 'rgd-no'; no.textContent = o.cancel; row.appendChild(no); }
      row.appendChild(yes); card.appendChild(h); card.appendChild(m); card.appendChild(row); ov.appendChild(card); document.body.appendChild(ov);
      var done = false;
      function close(v) {
        if (done) return; done = true;
        document.removeEventListener('keydown', key, true); ov.classList.remove('in');
        setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 190);
        try { if (prev && prev.focus) prev.focus(); } catch (e) { }
        resolve(v);
      }
      function key(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
        else if (e.key === 'Tab') { var f = [no, yes].filter(Boolean), i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); }
      }
      document.addEventListener('keydown', key, true);
      yes.onclick = function () { close(true); };
      if (no) no.onclick = function () { close(false); };
      ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(false); });
      requestAnimationFrame(function () { ov.classList.add('in'); (o.danger && no ? no : yes).focus(); });   // a destructive action starts on "Cancel"
    });
  }

  function enqueue(fn) { var p = queue.then(fn); queue = p.catch(function () { }); return p; }

  window.RGDialog = {
    confirm: function (o) {
      o = o || {};
      return enqueue(function () { return open({ title: o.title || 'Are you sure?', message: o.message || '', ok: o.ok || 'OK', cancel: o.cancel || 'Cancel', danger: !!o.danger }, true); });
    },
    alert: function (message, o) {
      o = o || {};
      return enqueue(function () { return open({ title: o.title || 'Notice', message: String(message == null ? '' : message), ok: o.ok || 'OK', danger: !!o.danger }, false); });
    }
  };
})();
