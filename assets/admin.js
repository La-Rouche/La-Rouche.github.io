/* ============================================================
   La Rouche — dashboard
   ------------------------------------------------------------
   SECURITY MODEL
   GitHub Pages is a static host: anything shipped in this file is
   public. So NO credential is stored here. "حفظ دائم" uses a
   fine-grained GitHub token that the operator pastes at runtime;
   it is kept only in this browser (localStorage/sessionStorage)
   and sent only to api.github.com over HTTPS. Nothing secret ever
   enters the repository.

   The token should be scoped to this ONE repo with Contents:
   Read and write, and nothing else. Whoever holds it can publish —
   treat it like a password and use "نسيان التوكن" on shared devices.
   ============================================================ */
(function () {
  'use strict';

  var OWNER = 'La-Rouche';
  var REPO = 'La-Rouche.github.io';
  var BRANCH = 'master';
  var PATH = 'data/menu.json';

  var DRAFT_KEY = 'lr.menu.draft.v1';
  var TOKEN_KEY = 'lr.gh.token.v1';
  var ICON_KEYS = ['meals', 'manakish', 'sandwiches', 'kaaka', 'croissant',
    'desserts', 'shakes', 'hot', 'cold', 'adds'];

  var $ = function (s) { return document.querySelector(s); };
  var published = null;   // last known published doc (for revert / diffing)
  var doc = null;         // working copy
  var curCat = 0;
  var dirty = false;
  var editing = null;     // {type:'item'|'cat', index}

  /* ---------- tiny helpers ---------- */
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function safeId(s) { return /^[a-z0-9_-]+$/i.test(String(s || '')) ? String(s) : ''; }

  function toast(msg, kind) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast on' + (kind ? ' ' + kind : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.className = 'toast'; }, 3200);
  }

  function setStatus(text, cls) {
    $('#statusText').textContent = text;
    $('#status').className = 'status' + (cls ? ' ' + cls : '');
  }

  function markDirty() {
    dirty = true;
    setStatus('تعديلات غير منشورة', 'dirty');
    saveDraft();
  }

  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(doc)); } catch (e) {}
    refreshPreview();
  }

  var previewTimer;
  function refreshPreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      var f = $('#preview');
      if (f && f.contentWindow) {
        try { f.contentWindow.postMessage('lr:refresh', location.origin); }
        catch (e) { f.src = f.src; }
      }
    }, 400);
  }

  /* ---------- validation ---------- */
  function validate(d) {
    var errs = [];
    if (!d || !Array.isArray(d.categories) || !d.categories.length) {
      return ['المنيو فاضي أو تالف.'];
    }
    var ids = {};
    d.categories.forEach(function (c, i) {
      var where = 'القسم ' + (i + 1) + ' (' + (c.ar || c.id || '؟') + ')';
      if (!safeId(c.id)) errs.push(where + ': المعرّف لازم يكون حروف إنجليزي/أرقام/شرطة بس.');
      if (ids[c.id]) errs.push(where + ': المعرّف "' + c.id + '" متكرر.');
      ids[c.id] = 1;
      if (!String(c.ar || '').trim()) errs.push(where + ': الاسم العربي مطلوب.');
      if (!Array.isArray(c.items) || !c.items.length) errs.push(where + ': لازم صنف واحد على الأقل.');
      (c.items || []).forEach(function (it, j) {
        var w2 = where + ' · الصنف ' + (j + 1);
        if (!String(it.en || '').trim()) errs.push(w2 + ': الاسم الإنجليزي مطلوب.');
        if (!(num(it.price) > 0)) errs.push(w2 + ': السعر لازم يكون رقم أكبر من صفر.');
      });
    });
    return errs;
  }

  /* ---------- normalise on the way in ---------- */
  function normalize(d) {
    return {
      version: 1,
      updatedAt: d.updatedAt || new Date().toISOString(),
      brand: d.brand || { name: 'La Rouche', since: '2010' },
      categories: (d.categories || []).map(function (c) {
        return {
          id: safeId(c.id) || 'cat',
          ar: String(c.ar || ''),
          en: String(c.en || ''),
          icon: ICON_KEYS.indexOf(c.icon) >= 0 ? c.icon : 'meals',
          items: (c.items || []).map(function (i) {
            var o = { en: String(i.en || ''), ar: String(i.ar || ''), price: num(i.price) };
            if (i.star) o.star = String(i.star);
            if (i.feast) o.feast = true;
            return o;
          })
        };
      })
    };
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function renderCats() {
    var box = $('#catList');
    box.textContent = '';
    doc.categories.forEach(function (c, i) {
      var row = document.createElement('div');
      row.className = 'row' + (i === curCat ? ' on' : '');
      row.draggable = true;
      row.dataset.i = i;

      var grip = document.createElement('span');
      grip.className = 'grip'; grip.textContent = '⋮⋮';

      var col = document.createElement('div');
      col.className = 'col';
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = c.ar || '(بدون اسم)';
      var sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = c.en || c.id;
      col.appendChild(nm); col.appendChild(sub);

      var cnt = document.createElement('span');
      cnt.className = 'count'; cnt.textContent = c.items.length;

      var edit = document.createElement('button');
      edit.className = 'btn xs ghost'; edit.type = 'button'; edit.textContent = 'تعديل';
      edit.addEventListener('click', function (e) { e.stopPropagation(); openCat(i); });

      row.appendChild(grip); row.appendChild(col); row.appendChild(cnt); row.appendChild(edit);
      row.addEventListener('click', function () { curCat = i; renderCats(); renderItems(); });
      wireDrag(row, box, doc.categories, function () {
        curCat = 0; renderCats(); renderItems(); markDirty();
      });
      box.appendChild(row);
    });
    $('#catCount').textContent = doc.categories.length;
  }

  function renderItems() {
    var c = doc.categories[curCat];
    var box = $('#itemList');
    box.textContent = '';
    $('#itemsTitle').textContent = c ? (c.ar || c.id) : '—';
    $('#itemCount').textContent = c ? c.items.length : 0;
    if (!c) return;

    if (!c.items.length) {
      var e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'مفيش أصناف في القسم ده. اضغط «+ صنف» للإضافة.';
      box.appendChild(e);
      return;
    }

    c.items.forEach(function (it, i) {
      var row = document.createElement('div');
      row.className = 'row';
      row.draggable = true;
      row.dataset.i = i;

      var grip = document.createElement('span');
      grip.className = 'grip'; grip.textContent = '⋮⋮';

      var col = document.createElement('div');
      col.className = 'col';
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = it.en || '(بدون اسم)';
      var sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = it.ar || '';
      col.appendChild(nm); col.appendChild(sub);

      row.appendChild(grip);
      row.appendChild(col);
      if (it.star) {
        var pill = document.createElement('span');
        pill.className = 'pill'; pill.textContent = it.star;
        row.appendChild(pill);
      }

      var pr = document.createElement('span');
      pr.className = 'price'; pr.textContent = num(it.price) + ' ج.م';
      row.appendChild(pr);

      row.addEventListener('click', function () { openItem(i); });
      wireDrag(row, box, c.items, function () { renderItems(); markDirty(); });
      box.appendChild(row);
    });
  }

  /* ---------- drag & drop reorder ---------- */
  function wireDrag(row, box, arr, done) {
    row.addEventListener('dragstart', function (e) {
      row.classList.add('drag');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.i);
    });
    row.addEventListener('dragend', function () {
      row.classList.remove('drag');
      Array.prototype.forEach.call(box.children, function (r) { r.classList.remove('over'); });
    });
    row.addEventListener('dragover', function (e) { e.preventDefault(); row.classList.add('over'); });
    row.addEventListener('dragleave', function () { row.classList.remove('over'); });
    row.addEventListener('drop', function (e) {
      e.preventDefault();
      row.classList.remove('over');
      var from = parseInt(e.dataTransfer.getData('text/plain'), 10);
      var to = parseInt(row.dataset.i, 10);
      if (isNaN(from) || isNaN(to) || from === to) return;
      arr.splice(to, 0, arr.splice(from, 1)[0]);
      done();
    });
  }

  /* ============================================================
     DRAWER EDITORS
     ============================================================ */
  function field(label, value, opts) {
    opts = opts || {};
    var wrap = document.createElement('label');
    wrap.className = 'fld';
    var s = document.createElement('span'); s.textContent = label;
    var input = document.createElement(opts.textarea ? 'textarea' : 'input');
    if (!opts.textarea) input.type = opts.type || 'text';
    if (opts.dir) input.dir = opts.dir;
    if (opts.step) input.step = opts.step;
    if (opts.min) input.min = opts.min;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    input.value = value == null ? '' : value;
    var err = document.createElement('div'); err.className = 'err'; err.textContent = opts.err || 'مطلوب';
    wrap.appendChild(s); wrap.appendChild(input); wrap.appendChild(err);
    wrap._input = input;
    return wrap;
  }

  function selectField(label, value, options) {
    var wrap = document.createElement('label');
    wrap.className = 'fld';
    var s = document.createElement('span'); s.textContent = label;
    var sel = document.createElement('select');
    options.forEach(function (o) {
      var op = document.createElement('option');
      op.value = o; op.textContent = o;
      if (o === value) op.selected = true;
      sel.appendChild(op);
    });
    wrap.appendChild(s); wrap.appendChild(sel);
    wrap._input = sel;
    return wrap;
  }

  function checkField(label, checked) {
    var wrap = document.createElement('label');
    wrap.className = 'chk';
    var inp = document.createElement('input');
    inp.type = 'checkbox'; inp.checked = !!checked;
    var s = document.createElement('span'); s.textContent = label;
    wrap.appendChild(inp); wrap.appendChild(s);
    wrap._input = inp;
    return wrap;
  }

  function openDrawer(title) {
    $('#drawerTitle').textContent = title;
    $('#drawer').classList.add('on');
    $('#drawerBack').classList.add('on');
  }
  function closeDrawer() {
    $('#drawer').classList.remove('on');
    $('#drawerBack').classList.remove('on');
    editing = null;
  }

  function openItem(i) {
    var it = doc.categories[curCat].items[i];
    editing = { type: 'item', index: i };
    var body = $('#drawerBody');
    body.textContent = '';

    var fEn = field('الاسم (إنجليزي) — بيظهر كعنوان الصنف', it.en, { dir: 'ltr' });
    var fAr = field('الوصف بالعربي', it.ar, { textarea: true });
    var fPr = field('السعر (ج.م)', num(it.price), { type: 'number', step: '1', min: '0', dir: 'ltr' });
    var fSt = field('شارة مميزة (اختياري)', it.star || '', { placeholder: 'مثال: الأكثر طلباً' });
    var fFe = checkField('كارت عريض بإطار ذهبي (للوجبات العائلية)', it.feast);

    [fEn, fAr, fPr, fSt].forEach(function (f) { body.appendChild(f); });
    body.appendChild(fFe);

    $('#drawerSave').onclick = function () {
      var en = fEn._input.value.trim();
      var pr = num(fPr._input.value);
      fEn.classList.toggle('bad', !en);
      fPr.classList.toggle('bad', !(pr > 0));
      if (!en || !(pr > 0)) { toast('صحّح الحقول المعلّمة بالأحمر', 'bad'); return; }
      it.en = en;
      it.ar = fAr._input.value.trim();
      it.price = pr;
      if (fSt._input.value.trim()) it.star = fSt._input.value.trim(); else delete it.star;
      if (fFe._input.checked) it.feast = true; else delete it.feast;
      closeDrawer(); renderItems(); markDirty(); toast('اتحفظ محلياً');
    };
    $('#drawerDelete').onclick = function () {
      if (!confirm('حذف «' + (it.en || 'الصنف') + '»؟')) return;
      doc.categories[curCat].items.splice(i, 1);
      closeDrawer(); renderItems(); renderCats(); markDirty(); toast('اتحذف');
    };
    openDrawer('تعديل صنف');
  }

  function openCat(i) {
    var c = doc.categories[i];
    editing = { type: 'cat', index: i };
    var body = $('#drawerBody');
    body.textContent = '';

    var fAr = field('اسم القسم بالعربي', c.ar);
    var fEn = field('اسم القسم بالإنجليزي', c.en, { dir: 'ltr' });
    var fId = field('المعرّف (يحدد اسم ملف الصورة)', c.id, { dir: 'ltr', err: 'حروف إنجليزي وأرقام وشرطة بس' });
    var fIc = selectField('الأيقونة البديلة (لو الصورة ناقصة)', c.icon, ICON_KEYS);

    var note = document.createElement('div');
    note.className = 'hint';
    note.textContent = 'الصور بتتقرا من assets/photos/' + c.id + '.jpg و assets/photos/thumb/'
      + c.id + '.jpg — لو غيّرت المعرّف لازم تغيّر أسماء الصور بنفس الاسم.';

    [fAr, fEn, fId, fIc].forEach(function (f) { body.appendChild(f); });
    body.appendChild(note);

    $('#drawerSave').onclick = function () {
      var ar = fAr._input.value.trim();
      var id = safeId(fId._input.value.trim());
      fAr.classList.toggle('bad', !ar);
      fId.classList.toggle('bad', !id);
      var dup = doc.categories.some(function (o, j) { return j !== i && o.id === id; });
      if (dup) { fId.classList.add('bad'); toast('المعرّف ده مستخدم في قسم تاني', 'bad'); return; }
      if (!ar || !id) { toast('صحّح الحقول المعلّمة بالأحمر', 'bad'); return; }
      c.ar = ar; c.en = fEn._input.value.trim(); c.id = id; c.icon = fIc._input.value;
      closeDrawer(); renderCats(); renderItems(); markDirty(); toast('اتحفظ محلياً');
    };
    $('#drawerDelete').onclick = function () {
      if (doc.categories.length <= 1) { toast('لازم يفضل قسم واحد على الأقل', 'bad'); return; }
      if (!confirm('حذف قسم «' + (c.ar || c.id) + '» وكل أصنافه؟')) return;
      doc.categories.splice(i, 1);
      curCat = 0;
      closeDrawer(); renderCats(); renderItems(); markDirty(); toast('اتحذف');
    };
    openDrawer('تعديل قسم');
  }

  /* ============================================================
     GITHUB PUBLISH  (token supplied at runtime, never stored in repo)
     ============================================================ */
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || ''; }
    catch (e) { return ''; }
  }
  function setToken(t, remember) {
    try {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, t);
    } catch (e) {}
  }
  function forgetToken() {
    try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  function gh(path, opts) {
    opts = opts || {};
    var headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Authorization': 'Bearer ' + getToken()
    };
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch('https://api.github.com/' + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
      referrerPolicy: 'no-referrer'
    });
  }

  // UTF-8 safe base64 (GitHub wants base64 content)
  function b64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  function unb64(s) {
    var bin = atob(String(s).replace(/\n/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function progress(steps) {
    var box = $('#progList');
    box.textContent = '';
    steps.forEach(function (s) {
      var d = document.createElement('div');
      d.textContent = '• ' + s;
      box.appendChild(d);
    });
    return {
      done: function (i, txt) {
        var d = box.children[i];
        if (d) { d.className = 'done'; d.textContent = '✓ ' + (txt || d.textContent.replace(/^[•✓✕]\s*/, '')); }
      },
      fail: function (i, txt) {
        var d = box.children[i];
        if (d) { d.className = 'fail'; d.textContent = '✕ ' + (txt || d.textContent.replace(/^[•✓✕]\s*/, '')); }
      },
      msg: function (text) {
        var m = document.createElement('span');
        m.className = 'msg';
        m.textContent = text;
        box.appendChild(m);
      }
    };
  }

  function openPublish() {
    var errs = validate(doc);
    if (errs.length) {
      alert('مش هينفع ننشر — فيه مشاكل:\n\n• ' + errs.slice(0, 8).join('\n• '));
      return;
    }
    var has = !!getToken();
    $('#pubSetup').classList.toggle('hidden', has);
    $('#pubProgress').classList.add('hidden');
    $('#pubForget').classList.toggle('hidden', !has);
    $('#pubGo').classList.remove('hidden');
    $('#pubGo').disabled = false;
    $('#pubGo').textContent = has ? 'نشر التعديلات' : 'حفظ التوكن وانشر';
    $('#tokenInput').value = '';
    $('#pubModal').classList.add('on');
    $('#pubBack').classList.add('on');
    if (!has) setTimeout(function () { $('#tokenInput').focus(); }, 120);
  }
  function closePublish() {
    $('#pubModal').classList.remove('on');
    $('#pubBack').classList.remove('on');
  }

  async function doPublish() {
    if (!getToken()) {
      var t = $('#tokenInput').value.trim();
      if (!t) { toast('الصق التوكن الأول', 'bad'); return; }
      setToken(t, $('#tokenRemember').checked);
      $('#tokenInput').value = '';
    }

    $('#pubSetup').classList.add('hidden');
    $('#pubProgress').classList.remove('hidden');
    $('#pubGo').disabled = true;
    $('#pubGo').textContent = 'جاري النشر…';

    var p = progress([
      'التحقق من التوكن',
      'قراءة النسخة الحالية',
      'رفع المنيو الجديد',
      'انتظار نشر الموقع'
    ]);

    try {
      // 1. token + repo access
      var who = await gh('repos/' + OWNER + '/' + REPO);
      if (who.status === 401) throw new Error('التوكن غير صالح أو منتهي. اعمل توكن جديد.');
      if (who.status === 403) throw new Error('التوكن مالوش صلاحية على المستودع ده.');
      if (who.status === 404) throw new Error('مش لاقي المستودع — اتأكد إن التوكن مختار له ' + REPO + '.');
      if (!who.ok) throw new Error('GitHub رد بكود ' + who.status);
      var repo = await who.json();
      if (!repo.permissions || !repo.permissions.push) {
        throw new Error('التوكن للقراءة بس. لازم Contents = Read and write.');
      }
      p.done(0, 'التوكن سليم');

      // 2. current file sha (needed to update, and guards against clobbering)
      var cur = await gh('repos/' + OWNER + '/' + REPO + '/contents/' + PATH + '?ref=' + BRANCH);
      var sha = null, remoteText = null;
      if (cur.ok) {
        var meta = await cur.json();
        sha = meta.sha;
        try { remoteText = unb64(meta.content); } catch (e) {}
      } else if (cur.status !== 404) {
        throw new Error('تعذّر قراءة الملف الحالي (كود ' + cur.status + ')');
      }
      p.done(1, sha ? 'قرأت النسخة الحالية' : 'الملف جديد');

      // Warn if the published file changed since this page loaded
      if (remoteText && published && remoteText.trim() !== JSON.stringify(published, null, 2).trim()) {
        if (!confirm('المنيو المنشور اتغيّر من مكان تاني بعد ما فتحت اللوحة.\nلو كمّلت هتستبدله بنسختك. تكمّل؟')) {
          p.fail(2, 'اتلغى بواسطتك');
          $('#pubGo').disabled = false;
          $('#pubGo').textContent = 'نشر التعديلات';
          return;
        }
      }

      // 3. write
      doc.updatedAt = new Date().toISOString();
      var body = {
        message: 'تحديث المنيو من لوحة التحكم',
        content: b64(JSON.stringify(doc, null, 2) + '\n'),
        branch: BRANCH
      };
      if (sha) body.sha = sha;

      var put = await gh('repos/' + OWNER + '/' + REPO + '/contents/' + PATH, { method: 'PUT', body: body });
      if (put.status === 409) throw new Error('فيه تعديل تاني حصل في نفس اللحظة. حدّث الصفحة وجرّب تاني.');
      if (!put.ok) {
        var e = await put.json().catch(function () { return {}; });
        throw new Error(e.message || ('فشل الرفع (كود ' + put.status + ')'));
      }
      p.done(2, 'المنيو اترفع');

      published = clone(doc);
      dirty = false;
      setStatus('منشور ✓', 'ok');
      p.done(3, 'الموقع بيتحدث — التغيير يظهر خلال دقيقة تقريباً');
      p.msg('لو فتحت الموقع ومشوفتش التغيير فوراً، اعمل تحديث بـ Ctrl+Shift+R.');
      $('#pubGo').classList.add('hidden');
      $('#pubCancel').textContent = 'تمام';
      toast('اتنشر بنجاح ✓', 'good');

    } catch (err) {
      var idx = 0;
      var box = $('#progList');
      for (var i = 0; i < box.children.length; i++) {
        if (box.children[i].className !== 'done') { idx = i; break; }
      }
      p.fail(idx);
      p.msg(err && err.message ? err.message : String(err));
      $('#pubGo').disabled = false;
      $('#pubGo').textContent = 'إعادة المحاولة';
      // a bad token shouldn't stay cached
      if (/غير صالح|منتهي|صلاحية|القراءة بس/.test(err.message || '')) {
        forgetToken();
        $('#pubSetup').classList.remove('hidden');
      }
      toast('فشل النشر', 'bad');
    }
  }

  /* ============================================================
     IMPORT / EXPORT / REVERT
     ============================================================ */
  function exportJson() {
    var blob = new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'la-rouche-menu-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('اتصدّر');
  }

  function importJson(file) {
    var r = new FileReader();
    r.onload = function () {
      var d;
      try { d = JSON.parse(r.result); }
      catch (e) { toast('الملف مش JSON سليم', 'bad'); return; }
      var errs = validate(d);
      if (errs.length) { alert('الملف فيه مشاكل:\n\n• ' + errs.slice(0, 8).join('\n• ')); return; }
      doc = normalize(d);
      curCat = 0;
      renderCats(); renderItems(); markDirty();
      toast('اتحمّل — لسه محتاج «حفظ دائم»');
    };
    r.readAsText(file);
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function cupSVG() {
    return '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<g stroke="#7A5638" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<ellipse cx="24" cy="36" rx="15" ry="2.8"/><ellipse cx="24" cy="22" rx="11" ry="3"/>' +
      '<path d="M13 22 Q13.5 33 24 33 Q34.5 33 35 22"/><path d="M35 24 Q41.5 25 40 30 Q38.5 34.6 33 33.4"/>' +
      '</g><g stroke="#7A5638" stroke-width="1.6" stroke-linecap="round" opacity=".6">' +
      '<path d="M19 16 q-3 -3.5 0 -6.5 q3 -3 0 -6"/><path d="M29 16 q-3 -3.5 0 -6.5 q3 -3 0 -6"/></g></svg>';
  }

  async function boot() {
    $('#tbCup').innerHTML = cupSVG();

    // published copy
    try {
      var r = await fetch('data/menu.json', { cache: 'no-cache' });
      if (r.ok) published = await r.json();
    } catch (e) {}

    // local draft wins if newer
    var draft = null;
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch (e) {}

    if (draft && !validate(draft).length) {
      doc = normalize(draft);
      var same = published && JSON.stringify(normalize(published).categories) === JSON.stringify(doc.categories);
      if (same) { dirty = false; setStatus('منشور ✓', 'ok'); }
      else { dirty = true; setStatus('تعديلات غير منشورة', 'dirty'); }
    } else if (published && !validate(published).length) {
      doc = normalize(published);
      setStatus('منشور ✓', 'ok');
    } else {
      doc = { version: 1, brand: { name: 'La Rouche' }, categories: [] };
      setStatus('تعذّر تحميل المنيو', 'dirty');
      toast('مش لاقي data/menu.json', 'bad');
    }

    renderCats();
    renderItems();

    /* --- wiring --- */
    $('#addCat').addEventListener('click', function () {
      var n = doc.categories.length + 1;
      doc.categories.push({ id: 'cat' + n, ar: 'قسم جديد', en: 'New Category', icon: 'meals', items: [] });
      curCat = doc.categories.length - 1;
      renderCats(); renderItems(); markDirty();
      openCat(curCat);
    });
    $('#addItem').addEventListener('click', function () {
      if (!doc.categories[curCat]) { toast('اختار قسم الأول', 'bad'); return; }
      doc.categories[curCat].items.push({ en: 'New Item', ar: '', price: 0 });
      renderItems(); renderCats(); markDirty();
      openItem(doc.categories[curCat].items.length - 1);
    });

    $('#drawerClose').addEventListener('click', closeDrawer);
    $('#drawerBack').addEventListener('click', closeDrawer);

    $('#btnExport').addEventListener('click', exportJson);
    $('#btnImport').addEventListener('click', function () { $('#fileInput').click(); });
    $('#fileInput').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) importJson(e.target.files[0]);
      e.target.value = '';
    });

    $('#btnRevert').addEventListener('click', function () {
      if (!published) { toast('مفيش نسخة منشورة', 'bad'); return; }
      if (!confirm('استعادة النسخة المنشورة؟ كل التعديلات غير المنشورة هتتلغي.')) return;
      doc = normalize(published);
      curCat = 0; dirty = false;
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
      renderCats(); renderItems(); refreshPreview();
      setStatus('منشور ✓', 'ok');
      toast('اترجعت للنسخة المنشورة');
    });

    $('#btnRefresh').addEventListener('click', function () {
      var f = $('#preview'); f.src = 'index.html?preview=1&t=' + Date.now();
    });

    $('#btnPublish').addEventListener('click', openPublish);
    $('#pubCancel').addEventListener('click', closePublish);
    $('#pubBack').addEventListener('click', closePublish);
    $('#pubGo').addEventListener('click', doPublish);
    $('#pubForget').addEventListener('click', function () {
      forgetToken();
      toast('اتنسي التوكن من الجهاز ده');
      closePublish();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeDrawer(); closePublish(); }
    });
    window.addEventListener('beforeunload', function (e) {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  boot();
})();
