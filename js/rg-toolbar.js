/* RockGuard text format toolbar of the live editor (ind-fab / RockGuard CMS):
 *   Bold, Italic | Align | Change case | Font | Size (- / +) | Text colour (picker) | Reset
 * Works on ALL editable text elements of the website (contenteditable="true") while edit mode is on:
 * select text (or click into it) and the toolbar reflects current formatting (font, size, colour, align, bold, italic).
 * Formatting can be applied to the current text selection or the entire editable block, with real-time preview,
 * undo/reset support, and bubbling change events so that CMS page-elements, repeatable lists (rg-sections),
 * and dynamic models (rg-content) all pick up the changes and can be saved via the SAVE button.
 */
(function () {
  'use strict';
  var FONTS = ['Barlow', 'Barlow Condensed', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Courier New', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins',
    'Raleway', 'Oswald', 'Merriweather', 'Playfair Display', 'Nunito', 'Ubuntu', 'PT Sans', 'Noto Sans', 'Inter', 'Work Sans', 'Source Sans Pro', 'Mulish', 'Quicksand', 'Karla', 'Fira Sans', 'Cabin',
    'DM Sans', 'Josefin Sans', 'Archivo', 'Rokkitt', 'Bitter', 'Crimson Text', 'Libre Baskerville', 'Lora', 'PT Serif', 'Arvo', 'Domine', 'Zilla Slab', 'Abril Fatface', 'Dancing Script', 'Pacifico', 'Caveat', 'Comfortaa'];
  var SAFE = ['Barlow', 'Barlow Condensed', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Courier New'], loadedFonts = {};
  var PRESET_COLORS = ['#de4228', '#2c2e35', '#ffffff', '#000000', '#ff6b5b', '#1C8A45', '#f5ebdd'];

  var ALIGN_SVG = {
    left: 'M1 2h12M1 5h8M1 8h12M1 11h8', center: 'M1 2h12M3 5h8M1 8h12M3 11h8', right: 'M1 2h12M5 5h8M1 8h12M5 11h8', justify: 'M1 2h12M1 5h12M1 8h12M1 11h12'
  };
  var icon = function (a) { return '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="' + ALIGN_SVG[a] + '" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>'; };
  var toHex = function (rgb) {
    if (!rgb) return null;
    if (/^#[0-9a-f]{6}$/i.test(rgb)) return rgb.toLowerCase();
    var m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? '#' + [m[1], m[2], m[3]].map(function (n) { return ('0' + parseInt(n, 10).toString(16)).slice(-2); }).join('').toLowerCase() : null;
  };
  function loadFont(name) {
    if (!name || SAFE.indexOf(name) >= 0 || loadedFonts[name]) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(name).replace(/%20/g, '+') + ':wght@400;700&display=swap';
    document.head.appendChild(l); loadedFonts[name] = true;
  }
  var inited = false;

  function init() {
    var slot = document.getElementById('cms-tb'); if (inited || !slot || !window.RGCMS) return; inited = true;
    slot.innerHTML = '';
    var bar = document.createElement('div'); bar.id = 'cms-text-toolbar'; bar.className = 'off';
    bar.innerHTML =
      '<button type="button" data-cmd="bold" title="Bold"><b>B</b></button><button type="button" data-cmd="italic" title="Italic"><i>I</i></button><span class="tb-sep"></span>' +
      '<button type="button" id="rgtb-align" title="Text alignment" class="wide"><span id="rgtb-align-ic">' + icon('left') + '</span><em>▾</em></button>' +
      '<button type="button" id="rgtb-case" title="Change case" class="wide"><span class="aa">Aa</span><em>▾</em></button><span class="tb-sep"></span>' +
      '<select id="rgtb-font" title="Font family"></select>' +
      '<div class="tb-size" title="Font size (px)"><input id="rgtb-size" type="number" min="6" max="120" placeholder="px"><div class="tb-arrows"><button type="button" id="rgtb-up" title="Bigger">▲</button><button type="button" id="rgtb-down" title="Smaller">▼</button></div></div>' +
      '<button type="button" id="rgtb-color" title="Text colour" class="sw"></button><span class="tb-sep"></span>' +
      '<button type="button" data-cmd="reset" title="Reset formatting / revert changes"><span class="rs">↺</span></button>';
    slot.appendChild(bar);

    // dropdown menus live in the body (the admin bar must not clip them)
    var menus = document.createElement('div'); menus.innerHTML =
      '<div class="rgtb-menu" id="rgtb-align-menu" hidden>' + ['left', 'center', 'right', 'justify'].map(function (a) { return '<div class="opt" data-align="' + a + '">' + icon(a) + ' ' + a.charAt(0).toUpperCase() + a.slice(1) + '</div>'; }).join('') + '</div>' +
      '<div class="rgtb-menu" id="rgtb-case-menu" hidden>' + [['sentence', 'Sentence case'], ['lower', 'lowercase'], ['upper', 'UPPERCASE'], ['title', 'Capitalize Each Word'], ['toggle', 'tOGGLE cASE']].map(function (c) { return '<div class="opt" data-case="' + c[0] + '">' + c[1] + '</div>'; }).join('') + '</div>';
    var alignMenu = menus.children[0], caseMenu = menus.children[1]; document.body.appendChild(alignMenu); document.body.appendChild(caseMenu);

    var $ = function (s) { return bar.querySelector(s); };
    var fontSel = $('#rgtb-font'), sizeIn = $('#rgtb-size'), colorBtn = $('#rgtb-color'), boldBtn = $('[data-cmd="bold"]'), italicBtn = $('[data-cmd="italic"]'), alignIc = $('#rgtb-align-ic');
    fontSel.innerHTML = '<option value="">Font...</option>' + FONTS.map(function (f) { return '<option value="' + f + '">' + f + '</option>'; }).join('');
    colorBtn.style.background = '#000000';

    var activeEl = null, saved = null;   // saved = { start, end }: selection offsets within activeEl

    var changed = function () {
      if (!activeEl) return;
      if (activeEl.hasAttribute('data-cms') && window.RGCMS && window.RGCMS.markDirty) {
        RGCMS.markDirty(activeEl);
      }
      try {
        activeEl.dispatchEvent(new Event('input', { bubbles: true }));
        activeEl.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) { /* ignore */ }
      if (window.RGCMS && window.RGCMS.refresh) window.RGCMS.refresh();
    };

    var editableOf = function (node) {
      var el = node && (node.nodeType === 1 ? node : node.parentElement);
      if (!el || !el.closest) return null;
      var ed = el.closest('[contenteditable="true"]');
      if (ed && !ed.closest('#cms-admin-bar, #cms-dash, #cms-linked, #cms-confirm, #rgtb-picker, .rgtb-menu')) {
        return ed;
      }
      return null;
    };

    /* ----- selection <-> character offsets using DOM Range */
    function toOffsets(el, range) {
      if (!el || !range || range.collapsed) return null;
      try {
        var pre = document.createRange();
        pre.selectNodeContents(el);
        pre.setEnd(range.startContainer, range.startOffset);
        var start = pre.toString().length;
        pre.setEnd(range.endContainer, range.endOffset);
        var end = pre.toString().length;
        return { start: Math.min(start, end), end: Math.max(start, end) };
      } catch (e) {
        return null;
      }
    }

    function toRange(el, start, end) {
      if (!el || start == null || end == null) return null;
      var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), i = 0, sn = null, so = 0, en = null, eo = 0, n, lastNode = null;
      while ((n = w.nextNode())) {
        lastNode = n;
        var len = n.textContent.length;
        if (!sn && i + len >= start) { sn = n; so = start - i; }
        if (!en && i + len >= end) { en = n; eo = end - i; break; }
        i += len;
      }
      if (!sn && lastNode) { sn = lastNode; so = lastNode.textContent.length; }
      if (!en && lastNode) { en = lastNode; eo = lastNode.textContent.length; }
      if (!sn || !en) return null;
      try {
        var r = document.createRange();
        r.setStart(sn, Math.max(0, Math.min(so, sn.textContent.length)));
        r.setEnd(en, Math.max(0, Math.min(eo, en.textContent.length)));
        return r;
      } catch (err) {
        return null;
      }
    }

    var hasSel = function () { return !!(saved && saved.start != null && saved.end != null && saved.start < saved.end); };
    function restoreSelection() {
      if (!activeEl) return; activeEl.focus();
      var sel = window.getSelection();
      if ((!sel || !sel.rangeCount || sel.isCollapsed) && hasSel()) {
        var r = toRange(activeEl, saved.start, saved.end);
        if (r) { sel.removeAllRanges(); sel.addRange(r); }
      }
    }

    /* ----- show formatting of selected text or current caret location */
    function reflect(range) {
      if (!activeEl) return;
      var node = range ? range.startContainer : activeEl;
      var el = node ? (node.nodeType === 1 ? node : node.parentElement) : activeEl;
      if (!el || !activeEl.contains(el)) el = activeEl;
      var cs = getComputedStyle(el);
      var family = (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
      if (family && FONTS.indexOf(family) < 0 && !fontSel.querySelector('option[value="' + family.replace(/"/g, '') + '"]')) {
        var o = document.createElement('option'); o.value = family; o.textContent = family; fontSel.appendChild(o);
      }
      fontSel.value = family && fontSel.querySelector('option[value="' + family.replace(/"/g, '') + '"]') ? family : '';
      sizeIn.value = parseInt(cs.fontSize, 10) || '';
      colorBtn.style.background = toHex(cs.color) || '#000000';
      boldBtn.classList.toggle('active', cs.fontWeight === 'bold' || parseInt(cs.fontWeight, 10) >= 600);
      italicBtn.classList.toggle('active', cs.fontStyle === 'italic');
      var al = (cs.textAlign || 'left').toLowerCase();
      if (al === 'start') al = 'left'; if (al === 'end') al = 'right'; if (!ALIGN_SVG[al]) al = 'left';
      alignIc.innerHTML = icon(al);
      [].slice.call(alignMenu.querySelectorAll('.opt')).forEach(function (op) {
        op.classList.toggle('active', op.getAttribute('data-align') === al);
      });
    }

    function onSelection() {
      if (!window.RGCMS || !window.RGCMS.editing) return;
      var sel = window.getSelection(); if (!sel || !sel.rangeCount) return;
      var range = sel.getRangeAt(0), el = editableOf(range.commonAncestorContainer);
      if (!el) {
        // If selection is inside toolbar or popup, do NOT wipe activeEl or saved
        var anc = range.commonAncestorContainer;
        var node = anc && (anc.nodeType === 1 ? anc : anc.parentElement);
        if (node && node.closest && node.closest('#cms-admin-bar, #cms-dash, #cms-linked, #cms-confirm, #rgtb-picker, .rgtb-menu')) {
          return;
        }
        return;
      }
      activeEl = el;
      if (el._rgInitial === undefined) { el._rgInitial = el.innerHTML; el._rgInitialStyle = el.getAttribute('style') || ''; }
      if (!sel.isCollapsed) {
        var off = toOffsets(el, range);
        if (off && off.start < off.end) saved = off;
      } else {
        saved = null;
      }
      reflect(range);
    }
    document.addEventListener('selectionchange', onSelection);
    document.addEventListener('focusin', function (e) {
      if (window.RGCMS && window.RGCMS.editing && editableOf(e.target)) {
        setTimeout(onSelection, 0);
      }
    });

    /* ----- applying format */
    function cleanFonts(c) {
      [].slice.call(c.querySelectorAll('font')).forEach(function (f) {
        var s = document.createElement('span');
        if (f.getAttribute('color')) s.style.color = f.getAttribute('color');
        if (f.getAttribute('face')) s.style.fontFamily = f.getAttribute('face');
        if (f.getAttribute('size') === '7') s.style.fontSize = '36px';
        if (f.style.cssText) s.style.cssText += ';' + f.style.cssText;
        s.innerHTML = f.innerHTML; f.replaceWith(s);
      });
    }

    function cleanSpans(c) {
      for (var guard = 0, empties; guard < 4 && (empties = [].slice.call(c.querySelectorAll('span,b,i,u,strong,em,font')).filter(function (n) { return !n.textContent && !n.querySelector('img,br'); })).length; guard++) {
        empties.forEach(function (n) { n.remove(); });
      }
      [].slice.call(c.querySelectorAll('span,font')).forEach(function (sp) {
        var st = (sp.getAttribute('style') || '').trim();
        if ((!st || st === 'font-weight: normal;' || st === 'font-style: normal;') && sp.attributes.length <= 1) {
          var p = sp.parentNode; while (sp.firstChild) p.insertBefore(sp.firstChild, sp); sp.remove();
        }
      });
    }

    function apply(ch, save) {
      if (!activeEl) return false;
      cleanFonts(activeEl);
      var target = null;
      if (hasSel()) {
        var range = toRange(activeEl, saved.start, saved.end);
        if (range && !range.collapsed) {
          var sc = range.startContainer, pe = sc.nodeType === 1 ? sc : sc.parentElement;
          if (pe && pe.tagName === 'SPAN' && activeEl.contains(pe) && pe !== activeEl && pe.textContent === range.toString()) {
            target = pe;
          } else {
            var span = document.createElement('span');
            try {
              range.surroundContents(span);
            } catch (e) {
              try {
                span.appendChild(range.extractContents());
                range.insertNode(span);
              } catch (e2) { /* ignore */ }
            }
            if (span.parentNode) target = span;
          }
        }
      }
      if (!target) {
        if (activeEl.children.length === 1 && activeEl.firstElementChild.tagName === 'SPAN') {
          target = activeEl.firstElementChild;
        } else {
          var sp = document.createElement('span');
          while (activeEl.firstChild) sp.appendChild(activeEl.firstChild);
          activeEl.appendChild(sp);
          target = sp;
        }
      }
      if (ch.color !== undefined) {
        target.style.setProperty('color', ch.color, 'important');
        [].slice.call(target.querySelectorAll('*')).forEach(function (s) { s.style.removeProperty('color'); });
      }
      if (ch.fontFamily !== undefined) {
        if (ch.fontFamily) target.style.setProperty('font-family', "'" + ch.fontFamily + "', sans-serif", 'important');
        else target.style.removeProperty('font-family');
        [].slice.call(target.querySelectorAll('*')).forEach(function (s) { s.style.removeProperty('font-family'); });
      }
      if (ch.fontSize !== undefined) {
        target.style.setProperty('font-size', ch.fontSize, 'important');
        [].slice.call(target.querySelectorAll('*')).forEach(function (s) { s.style.removeProperty('font-size'); });
      }
      cleanSpans(activeEl);
      if (save !== false) changed();
      return true;
    }

    /* ----- buttons */
    function toggle(cmd, btn, test) {
      if (!activeEl) return; restoreSelection();
      document.execCommand(cmd, false, null); cleanSpans(activeEl); changed();
      var sel = window.getSelection(), r = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
      if (r && !r.collapsed) { var off = toOffsets(activeEl, r); if (off) saved = off; }
      var node = r ? r.startContainer : activeEl, el = node.nodeType === 1 ? node : node.parentElement;
      btn.classList.toggle('active', test(getComputedStyle(el && activeEl.contains(el) ? el : activeEl)));
    }
    boldBtn.onclick = function () { toggle('bold', boldBtn, function (cs) { return cs.fontWeight === 'bold' || parseInt(cs.fontWeight, 10) >= 600; }); };
    italicBtn.onclick = function () { toggle('italic', italicBtn, function (cs) { return cs.fontStyle === 'italic'; }); };

    var closeMenus = function () { alignMenu.hidden = true; caseMenu.hidden = true; };
    function openMenu(menu, btn) {
      var was = !menu.hidden; closeMenus(); if (was) return; var r = btn.getBoundingClientRect();
      menu.hidden = false; menu.style.top = (r.bottom + 4) + 'px'; menu.style.left = Math.min(r.left, window.innerWidth - menu.offsetWidth - 6) + 'px';
    }
    $('#rgtb-align').onclick = function (e) { e.stopPropagation(); openMenu(alignMenu, this); };
    $('#rgtb-case').onclick = function (e) { e.stopPropagation(); openMenu(caseMenu, this); };
    document.addEventListener('mousedown', function (e) { if (!e.target.closest('.rgtb-menu') && !bar.contains(e.target)) closeMenus(); });
    [alignMenu, caseMenu].forEach(function (m) { m.addEventListener('mousedown', function (e) { e.preventDefault(); }); });

    alignMenu.addEventListener('click', function (e) {
      var op = e.target.closest('.opt'); if (!op || !activeEl) return; var a = op.getAttribute('data-align');
      activeEl.style.textAlign = a;
      if (activeEl.children.length === 1 && /^(SPAN|DIV)$/.test(activeEl.firstElementChild.tagName)) {
        activeEl.firstElementChild.style.display = 'block'; activeEl.firstElementChild.style.textAlign = a;
      } else if (!activeEl.children.length || [].slice.call(activeEl.childNodes).every(function (n) { return n.nodeType === 3 || /^(SPAN|SUP|B|I|STRONG|EM)$/.test(n.tagName); })) {
        var s = document.createElement('span'); s.style.display = 'block'; s.style.textAlign = a;
        while (activeEl.firstChild) s.appendChild(activeEl.firstChild);
        activeEl.appendChild(s);
      }
      alignIc.innerHTML = icon(a); closeMenus(); changed(); reflect(null);
    });

    function caseText(t, mode) {
      switch (mode) {
        case 'lower': return t.toLowerCase();
        case 'upper': return t.toUpperCase();
        case 'title': return t.replace(/\w\S*/g, function (w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); });
        case 'toggle': return t.split('').map(function (c) { return c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase(); }).join('');
        case 'sentence': return t.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, function (m) { return m.toUpperCase(); });
        default: return t;
      }
    }
    caseMenu.addEventListener('click', function (e) {
      var op = e.target.closest('.opt'); if (!op || !activeEl) return; var mode = op.getAttribute('data-case'); closeMenus();
      var range = hasSel() ? toRange(activeEl, saved.start, saved.end) : null; if (range && range.collapsed) range = null;
      var w = document.createTreeWalker(activeEl, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { return !range || range.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; } }), nodes = [], n;
      while ((n = w.nextNode())) nodes.push(n);
      nodes.forEach(function (node) {
        var t = node.textContent;
        if (!range) node.textContent = caseText(t, mode);
        else if (range.startContainer === node && range.endContainer === node) node.textContent = t.slice(0, range.startOffset) + caseText(t.slice(range.startOffset, range.endOffset), mode) + t.slice(range.endOffset);
        else if (range.startContainer === node) node.textContent = t.slice(0, range.startOffset) + caseText(t.slice(range.startOffset), mode);
        else if (range.endContainer === node) node.textContent = caseText(t.slice(0, range.endOffset), mode) + t.slice(range.endOffset);
        else node.textContent = caseText(t, mode);
      });
      changed();
    });

    fontSel.onchange = function () {
      if (!activeEl) return;
      if (fontSel.value) loadFont(fontSel.value);
      apply({ fontFamily: fontSel.value || '' });
    };

    var setSize = function () {
      var px = parseInt(sizeIn.value, 10);
      if (activeEl && px >= 6) apply({ fontSize: px + 'px' });
    };
    sizeIn.oninput = setSize; sizeIn.onchange = setSize;
    $('#rgtb-up').onclick = function (e) { e.preventDefault(); if (!activeEl) return; sizeIn.value = Math.min(120, (parseInt(sizeIn.value, 10) || 16) + 1); setSize(); };
    $('#rgtb-down').onclick = function (e) { e.preventDefault(); if (!activeEl) return; sizeIn.value = Math.max(6, (parseInt(sizeIn.value, 10) || 16) - 1); setSize(); };

    var colorOrig = null;
    colorBtn.onclick = function () {
      if (!activeEl) return;
      var node = (saved && toRange(activeEl, saved.start, saved.end)) ? toRange(activeEl, saved.start, saved.end).startContainer : activeEl;
      var el = node ? (node.nodeType === 1 ? node : node.parentElement) : activeEl;
      colorOrig = toHex(getComputedStyle(el || activeEl).color) || '#000000';
      openColorPicker(colorBtn,
        function (hex) { colorBtn.style.background = hex; apply({ color: hex }, false); },
        function (hex) { colorBtn.style.background = hex; apply({ color: hex }, true); colorOrig = null; },
        function () { if (colorOrig) { colorBtn.style.background = colorOrig; apply({ color: colorOrig }, true); } colorOrig = null; }
      );
    };

    $('[data-cmd="reset"]').onclick = function () {
      if (!activeEl || activeEl._rgInitial === undefined) return;
      activeEl.innerHTML = activeEl._rgInitial;
      if (activeEl._rgInitialStyle) activeEl.setAttribute('style', activeEl._rgInitialStyle);
      else activeEl.removeAttribute('style');
      saved = null; changed(); reflect(null);
    };

    // Toolbar buttons must not take selection away
    bar.addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });

    var setOn = function (on) { bar.classList.toggle('off', !on); if (!on) { activeEl = null; saved = null; closeMenus(); } };
    document.addEventListener('rg-edit-mode', function (e) { setOn(!!(e.detail && e.detail.on)); });
    setOn(!!(window.RGCMS && window.RGCMS.editing));
  }

  /* ----- colour picker: saturation / hue, preset palette, RGB inputs, Cancel / Apply */
  function openColorPicker(anchor, onPreview, onApply, onCancel) {
    var old = document.getElementById('rgtb-picker'); if (old) old.remove();
    var hexToRgb = function (h) { var n = parseInt(h.replace('#', ''), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; };
    var rgbToHex = function (r, g, b) { return '#' + [r, g, b].map(function (v) { return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); }).join(''); };
    var rgbToHsv = function (r, g, b) {
      r /= 255; g /= 255; b /= 255; var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
      if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
      return { h: h, s: mx === 0 ? 0 : d / mx, v: mx };
    };
    var hsvToRgb = function (h, s, v) {
      var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
      return { r: (t[0] + m) * 255, g: (t[1] + m) * 255, b: (t[2] + m) * 255 };
    };
    var start = toHex(anchor.style.background) || (/^#/.test(anchor.style.background) ? anchor.style.background : '#000000');
    var sr = hexToRgb(start), hsv = rgbToHsv(sr.r, sr.g, sr.b);
    var pop = document.createElement('div'); pop.id = 'rgtb-picker';
    pop.innerHTML = '<div class="sv"><div class="w"></div><div class="k"></div><div class="cur"></div></div><div class="hue"><div class="hcur"></div></div>' +
      '<div class="presets">' + PRESET_COLORS.map(function (c) { return '<button type="button" data-hex="' + c + '" style="background:' + c + '" title="' + c + '"></button>'; }).join('') + '</div>' +
      '<div class="row"><div class="pv"></div><input type="text" maxlength="3" inputmode="numeric" data-c="r"><input type="text" maxlength="3" inputmode="numeric" data-c="g"><input type="text" maxlength="3" inputmode="numeric" data-c="b"></div>' +
      '<div class="lab"><span>R</span><span>G</span><span>B</span></div><div class="act"><button type="button" class="no">Cancel</button><button type="button" class="yes">Apply</button></div>';
    document.body.appendChild(pop);

    var r = anchor.getBoundingClientRect();
    var popH = 280, popW = 240;
    var top = r.bottom + 8;
    if (top + popH > window.innerHeight - 6) top = Math.max(6, r.top - popH - 8);
    var left = Math.max(6, Math.min(r.left, window.innerWidth - popW - 6));
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';

    var sv = pop.querySelector('.sv'), cur = pop.querySelector('.cur'), hue = pop.querySelector('.hue'), hcur = pop.querySelector('.hcur'), pv = pop.querySelector('.pv'), ins = [].slice.call(pop.querySelectorAll('input'));
    var hex = function () { var c = hsvToRgb(hsv.h, hsv.s, hsv.v); return rgbToHex(c.r, c.g, c.b); };
    function render(fromInput) {
      sv.style.background = 'hsl(' + hsv.h + ',100%,50%)'; cur.style.left = hsv.s * 100 + '%'; cur.style.top = (1 - hsv.v) * 100 + '%'; hcur.style.left = hsv.h / 360 * 100 + '%';
      var c = hsvToRgb(hsv.h, hsv.s, hsv.v); pv.style.background = rgbToHex(c.r, c.g, c.b);
      if (!fromInput) { ins[0].value = Math.round(c.r); ins[1].value = Math.round(c.g); ins[2].value = Math.round(c.b); }
      onPreview(hex());
    }
    render();

    function drag(ev, box, fn) {
      var rc = box.getBoundingClientRect(), mv = function (e) { fn(Math.max(0, Math.min(1, (e.clientX - rc.left) / rc.width)), Math.max(0, Math.min(1, (e.clientY - rc.top) / rc.height))); };
      mv(ev); var up = function () { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    }
    sv.addEventListener('mousedown', function (e) { e.preventDefault(); drag(e, sv, function (x, y) { hsv.s = x; hsv.v = 1 - y; render(); }); });
    hue.addEventListener('mousedown', function (e) { e.preventDefault(); drag(e, hue, function (x) { hsv.h = x * 360; render(); }); });
    pop.querySelector('.presets').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-hex]'); if (!btn) return;
      var h = btn.getAttribute('data-hex'), c = hexToRgb(h);
      hsv = rgbToHsv(c.r, c.g, c.b); render();
    });
    ins.forEach(function (i) { i.addEventListener('input', function () { var v = ins.map(function (x) { return Math.max(0, Math.min(255, parseInt(x.value, 10) || 0)); }); hsv = rgbToHsv(v[0], v[1], v[2]); render(true); }); });

    var close = function () { pop.remove(); document.removeEventListener('mousedown', outside, true); };
    var outside = function (e) { if (!pop.contains(e.target) && e.target !== anchor) { onCancel(); close(); } };
    setTimeout(function () { document.addEventListener('mousedown', outside, true); }, 0);
    pop.querySelector('.no').onclick = function () { onCancel(); close(); };
    pop.querySelector('.yes').onclick = function () { onApply(hex()); close(); };
  }

  if (window.RGCMS && window.RGCMS.admin) init(); else document.addEventListener('rg-admin', init);
})();
