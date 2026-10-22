/* Демо-сайт "Медицинский центр, Самара": общая логика страниц.
   Меню, поиск по сайту, аккордеоны, "открыто/закрыто", каталог цен, формы записи и контактов. */

/* Адрес приёма заявок из форм. Пусто = ничего никуда не отправляется (демо).
   Чтобы подключить отправку позже: впишите сюда адрес, формы отправят JSON методом POST. */
var FORM_ENDPOINT = '';

(function () {
  'use strict';

  var ROOT = document.body.getAttribute('data-root') || '';
  var REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var NBSP = ' ';

  /* ---------- утилиты ---------- */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text != null) { e.textContent = text; }
    return e;
  }
  function icon(name, cls) {
    var ns = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(ns, 'svg');
    s.setAttribute('class', 'icon' + (cls ? ' ' + cls : ''));
    s.setAttribute('aria-hidden', 'true');
    var u = document.createElementNS(ns, 'use');
    u.setAttribute('href', '#i-' + name);
    s.appendChild(u);
    return s;
  }
  function plural(n, f) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) { return f[0]; }
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) { return f[1]; }
    return f[2];
  }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function pad2(n) { return ('0' + n).slice(-2); }

  /* ---------- время Самары, "открыто/закрыто" ---------- */
  var HOURS = { 0: null, 1: [480, 1200], 2: [480, 1200], 3: [480, 1200], 4: [480, 1200], 5: [480, 1200], 6: [480, 900] };
  var DAYS_ACC = ['в воскресенье', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу'];
  function fmtMin(m) { return Math.floor(m / 60) + ':' + pad2(m % 60); }
  function samaraNow() {
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Samara', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
      }).formatToParts(new Date());
      var o = {};
      parts.forEach(function (p) { o[p.type] = p.value; });
      var map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      if (map[o.weekday] === undefined) { throw new Error('weekday'); }
      return { dow: map[o.weekday], min: (parseInt(o.hour, 10) % 24) * 60 + parseInt(o.minute, 10) };
    } catch (e) {
      var d = new Date();
      return { dow: d.getDay(), min: d.getHours() * 60 + d.getMinutes() };
    }
  }
  function statusInfo() {
    var n = samaraNow();
    var h = HOURS[n.dow];
    if (h && n.min >= h[0] && n.min < h[1]) {
      return { open: true, dow: n.dow, text: 'Сейчас: открыто до ' + fmtMin(h[1]) };
    }
    if (h && n.min < h[0]) {
      return { open: false, dow: n.dow, text: 'Сейчас: закрыто, откроемся сегодня в ' + fmtMin(h[0]) };
    }
    for (var i = 1; i <= 7; i++) {
      var d = (n.dow + i) % 7;
      if (HOURS[d]) {
        return {
          open: false, dow: n.dow,
          text: 'Сейчас: закрыто, откроемся ' + (i === 1 ? 'завтра' : DAYS_ACC[d]) + ' в ' + fmtMin(HOURS[d][0])
        };
      }
    }
    return { open: false, dow: n.dow, text: 'Сейчас: закрыто' };
  }
  function applyStatus() {
    var st = statusInfo();
    $$('[data-open-status]').forEach(function (n) { n.textContent = st.text; });
    $$('[data-sched] li').forEach(function (li) {
      var days = (li.getAttribute('data-days') || '').split(' ');
      var today = days.indexOf(String(st.dow)) > -1;
      li.classList.toggle('is-today', today);
      var tag = $('.today-tag', li);
      if (tag) { tag.hidden = !today; }
    });
  }

  /* ---------- справочник услуг для записи ---------- */
  var SERVICES = {
    voditelskaya: 'Водительская справка',
    oruzhie: 'Справка на оружие',
    medkniga: 'Медицинская книжка',
    bassein: 'Справка в бассейн',
    sport: 'Справка в спортивную секцию или на соревнования',
    vuz: 'Справка в ВУЗ или колледж (086/у)',
    sankur: 'Санаторно-курортная карта',
    putevka: 'Справка для путёвки',
    gossluzhba: 'Справка для госслужбы или гостайны',
    priem: 'Приём врача',
    uzi: 'УЗИ',
    ekg: 'ЭКГ или Холтер',
    analizy: 'Анализы',
    stacionar: 'Дневной стационар и капельницы',
    organizacii: 'Медосмотр для организации',
    drugoe: 'Другое'
  };

  /* ---------- проверка телефона ---------- */
  function phoneDigits(s) { return String(s || '').replace(/\D/g, ''); }
  function phoneOk(s) {
    var d = phoneDigits(s);
    return d.length === 11 && (d.charAt(0) === '7' || d.charAt(0) === '8');
  }
  function phoneFmt(s) {
    var d = phoneDigits(s);
    if (d.length !== 11) { return String(s || '').trim(); }
    return '+7 ' + d.slice(1, 4) + ' ' + d.slice(4, 7) + '-' + d.slice(7, 9) + '-' + d.slice(9, 11);
  }

  /* ---------- отправка заявки (демо: ничего не уходит, пока FORM_ENDPOINT пуст) ---------- */
  function sendForm(payload, onOk, onFail) {
    if (!FORM_ENDPOINT) { onOk(); return; }
    try {
      fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) {
        if (!r.ok) { throw new Error('http ' + r.status); }
        onOk();
      }).catch(function () { onFail(); });
    } catch (e) { onFail(); }
  }

  /* тексты демо-пометок зависят от того, подключена ли отправка */
  var DEMO_NOTES = {
    'book-pre': [
      'Это демо-версия: заявка никуда не отправляется и в клинику не уйдёт. Для настоящей записи позвоните: 8 (888) 888-88-88.',
      'Это демо-версия: заявка уходит автору демо, а не в клинику. Для настоящей записи позвоните по номеру 8 (888) 888-88-88.'
    ],
    'book-post': [
      'Это демо-версия: заявка никуда не отправлена и в клинику не передавалась. Для настоящей записи позвоните: 8 (888) 888-88-88.',
      'Это демо-версия: заявка получена автором демо и в клинику не передавалась. Для настоящей записи позвоните: 8 (888) 888-88-88.'
    ],
    'contact-pre': [
      'Это демо-версия: сообщение никуда не отправляется и в клинику не уйдёт. Для настоящей записи позвоните: 8 (888) 888-88-88.',
      'Это демо-версия: сообщение получит автор демо, а не клиника. Для настоящей записи позвоните: 8 (888) 888-88-88.'
    ],
    'contact-post': [
      'Это демо-версия: сообщение никуда не отправлено и в клинику не передавалось. Для настоящей записи позвоните: 8 (888) 888-88-88.',
      'Это демо-версия: сообщение получено автором демо и в клинику не передавалось. Для настоящей записи позвоните: 8 (888) 888-88-88.'
    ]
  };
  function applyDemoNotes() {
    $$('[data-demo-note]').forEach(function (n) {
      var t = DEMO_NOTES[n.getAttribute('data-demo-note')];
      if (t) { n.textContent = t[FORM_ENDPOINT ? 1 : 0]; }
    });
  }

  /* ---------- шапка: меню ---------- */
  function initHeader() {
    var header = $('#site-header');
    var btn = $('#menu-btn');
    var panel = $('#menu-panel');
    if (!header || !btn || !panel) { return; }
    var label = $('.menu-btn-label', btn);

    function inertNodes() { return $$('main, .site-footer, .ribbon, .bottombar, .chat-fab'); }
    function sizePanel() {
      var r = header.getBoundingClientRect();
      panel.style.maxHeight = Math.max(240, window.innerHeight - r.bottom) + 'px';
    }
    function openMenu() {
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      if (label) { label.textContent = 'Закрыть'; }
      document.documentElement.classList.add('menu-open');
      sizePanel();
      inertNodes().forEach(function (n) { n.setAttribute('inert', ''); });
    }
    function closeMenu(refocus) {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (label) { label.textContent = 'Меню'; }
      document.documentElement.classList.remove('menu-open');
      inertNodes().forEach(function (n) { n.removeAttribute('inert'); });
      if (refocus) { btn.focus(); }
    }
    btn.addEventListener('click', function () {
      if (panel.hidden) { openMenu(); } else { closeMenu(true); }
    });
    panel.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a') : null;
      if (a) { closeMenu(false); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) { closeMenu(true); }
    });
    window.addEventListener('resize', function () {
      if (panel.hidden) { return; }
      if (window.innerWidth >= 1260) { closeMenu(false); } else { sizePanel(); }
    });
    header.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' || panel.hidden) { return; }
      var f = $$('a[href], button:not([disabled]), input', header).filter(function (n) { return n.offsetParent !== null; });
      if (!f.length) { return; }
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    window.MC_closeMenu = closeMenu;
  }

  /* ---------- поиск по сайту ---------- */
  var INDEX = null;
  var CAT_KW = {
    lor: 'лор ухо горло нос отоларинголог',
    narkolog: 'нарколог психиатр кодирование зависимость',
    stacionar: 'капельница капельницы система стационар',
    uzi: 'узи ультразвук',
    kardiolog: 'сердце экг холтер',
    oftalmolog: 'окулист глаза зрение очки',
    ginekolog: 'гинеколог женский',
    komissii: 'справка справки медкомиссия книжка'
  };
  function catKeywords(id) { return CAT_KW[id] || ''; }

  function buildIndex() {
    var R = ROOT;
    var list = [];
    var o = 0;
    function add(type, name, url, kw) {
      list.push({ type: type, name: name, url: url, n: norm(name), h: norm(name + ' ' + (kw || '')), o: o++ });
    }
    add('Страница', 'Главная', R + 'index.html', 'начало');
    add('Страница', 'Справки и медосмотры', R + 'spravki/index.html', 'справки медосмотры медкомиссия');
    add('Страница', 'Услуги и цены', R + 'uslugi.html', 'прайс цены стоимость каталог услуги');
    add('Страница', 'Врачи', R + 'vrachi.html', 'специалисты приём доктор');
    add('Страница', 'Контакты', R + 'kontakty.html', 'адрес телефон график аптека почта e-mail');
    add('Страница', 'Запись онлайн', R + 'zapis.html', 'записаться запись заявка');
    add('Страница', 'Политика конфиденциальности', R + 'politika.html', 'персональные данные согласие');
    add('Справка', 'Водительская справка', R + 'spravki/voditelskaya.html', 'права водительская 003-в/у гибдд медкомиссия на права замена прав');
    add('Справка', 'Справка на оружие', R + 'spravki/oruzhie.html', 'оружие 002-о/у охота охрана чоп лицензия хти');
    add('Справка', 'Медицинская книжка', R + 'spravki/medkniga.html', 'медкнижка санитарная книжка санкнижка лмк');
    add('Справка', 'Справка в бассейн', R + 'spravki/index.html#bassein', '083/4-89 бассейн');
    add('Справка', 'Справка в спортивную секцию и для соревнований', R + 'spravki/index.html#sport', '083/5-89 физкультура спорт соревнования');
    add('Справка', 'Справка в ВУЗ, колледж, техникум', R + 'spravki/index.html#vuz', '086/у поступление общежитие');
    add('Справка', 'Санаторно-курортная карта', R + 'spravki/index.html#sankur', '072-у санаторий сан-кур');
    add('Справка', 'Справка для получения путёвки', R + 'spravki/index.html#putevka', '070-у путевка');
    add('Справка', 'Справка для госслужбы и гостайны', R + 'spravki/index.html#gossluzhba', '001-гс/у государственная служба');
    add('Справка', 'Предрейсовый и послерейсовый осмотр водителей', R + 'spravki/index.html#predreys', 'организации водители рейс');
    add('Справка', 'Профосмотр и медкомиссии для организаций', R + 'spravki/index.html#profosmotr', '302н сотрудники организации');
    [
      ['Иванов Иван Иванович', 'doctor-1', 'психиатр-нарколог'],
      ['Петрова Анастасия Петровна', 'doctor-2', 'гастроэнтеролог'],
      ['Петрова Анастасия Петровна', 'doctor-3', 'акушер-гинеколог гинеколог'],
      ['Петрова Анастасия Петровна', 'doctor-4', 'кардиолог функциональная диагностика'],
      ['Петрова Анастасия Петровна', 'doctor-5', 'офтальмолог окулист'],
      ['Петрова Анастасия Петровна', 'doctor-6', 'невролог'],
      ['Петрова Анастасия Петровна', 'doctor-7', 'врач ультразвуковой диагностики узи'],
      ['Петрова Анастасия Петровна', 'doctor-8', 'психиатр']
    ].forEach(function (d) { add('Врач', d[0], R + 'vrachi.html#doc-' + d[1], d[2]); });
    if (window.PRICE_DATA) {
      window.PRICE_DATA.categories.forEach(function (c) {
        c.items.forEach(function (it) {
          add('Услуга', it[0], R + 'uslugi.html#category=' + c.id, (c.title || c.name) + ' ' + catKeywords(c.id));
        });
      });
    }
    return list;
  }
  function stems(q) {
    return norm(q).split(' ').filter(Boolean).map(function (w) { return w.length > 5 ? w.slice(0, w.length - 1) : w; });
  }
  function searchSite(q) {
    if (!INDEX) { INDEX = buildIndex(); }
    var words = stems(q);
    if (!words.length) { return []; }
    var found = [];
    INDEX.forEach(function (it) {
      var ok = words.every(function (w) { return it.h.indexOf(w) > -1; });
      if (!ok) { return; }
      var s = 3;
      if (it.n.indexOf(words[0]) === 0) { s = 0; }
      else if ((' ' + it.n).indexOf(' ' + words[0]) > -1) { s = 1; }
      else if (it.n.indexOf(words[0]) > -1) { s = 2; }
      found.push({ it: it, rank: s * 1000 + it.o });
    });
    found.sort(function (a, b) { return a.rank - b.rank; });
    return found.slice(0, 8).map(function (f) { return f.it; });
  }
  function appendHighlighted(node, text, words) {
    var parts = words.filter(Boolean).map(function (w) { return escRe(w).replace(/е/g, '[её]'); });
    if (!parts.length) { node.appendChild(document.createTextNode(text)); return; }
    var re = new RegExp('(' + parts.join('|') + ')', 'ig');
    var last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m[0] === '') { re.lastIndex++; continue; }
      if (m.index > last) { node.appendChild(document.createTextNode(text.slice(last, m.index))); }
      var mk = document.createElement('mark');
      mk.textContent = m[0];
      node.appendChild(mk);
      last = m.index + m[0].length;
    }
    if (last < text.length) { node.appendChild(document.createTextNode(text.slice(last))); }
  }
  function initSearch(box, onNavigate) {
    var input = $('.search-input', box);
    var out = $('.search-results', box);
    if (!input || !out) { return null; }
    out.setAttribute('aria-live', 'polite');

    function render() {
      var q = input.value;
      out.innerHTML = '';
      if (!norm(q)) { out.hidden = true; return; }
      var res = searchSite(q);
      out.hidden = false;
      if (!res.length) {
        var box2 = el('div', 'search-empty');
        box2.appendChild(el('p', 'search-empty-title', 'Ничего не нашли'));
        box2.appendChild(el('p', null, 'Не нашли нужную услугу? Спросите помощника или позвоните: 8 (888) 888-88-88.'));
        var b1 = el('button', 'btn btn-primary btn-sm', 'Спросить помощника');
        b1.type = 'button';
        b1.setAttribute('data-open-chat', '');
        var b2 = el('a', 'btn btn-secondary btn-sm', 'Позвонить 8 (888) 888-88-88');
        b2.href = 'tel:+78888888888';
        box2.appendChild(b1);
        box2.appendChild(b2);
        out.appendChild(box2);
        return;
      }
      var words = stems(q);
      var ul = el('ul');
      res.forEach(function (it) {
        var li = el('li');
        var a = el('a', 'search-hit');
        a.href = it.type === 'Услуга' ? ROOT + 'uslugi.html#q=' + encodeURIComponent(q.trim()) : it.url;
        var s = el('span');
        appendHighlighted(s, it.name, words);
        a.appendChild(s);
        a.appendChild(el('small', null, it.type));
        li.appendChild(a);
        ul.appendChild(li);
      });
      out.appendChild(ul);
    }
    function hits() { return $$('.search-hit', out); }
    function reset() { input.value = ''; out.innerHTML = ''; out.hidden = true; }

    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        var h = hits();
        if (h.length) { e.preventDefault(); h[0].focus(); }
      } else if (e.key === 'Enter') {
        var h2 = hits();
        if (h2.length) { e.preventDefault(); if (onNavigate) { onNavigate(); } window.location.href = h2[0].href; }
      }
    });
    out.addEventListener('keydown', function (e) {
      var h = hits();
      var i = h.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' && i > -1) { e.preventDefault(); if (i < h.length - 1) { h[i + 1].focus(); } }
      else if (e.key === 'ArrowUp' && i > -1) { e.preventDefault(); if (i > 0) { h[i - 1].focus(); } else { input.focus(); } }
    });
    out.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a, button') : null;
      if (a && onNavigate) { onNavigate(); }
    });
    return { input: input, reset: reset };
  }
  function initSearchUI() {
    var boxes = $$('[data-search]');
    var bar = $('#search-bar');
    var btn = $('#search-btn');
    var barSearch = null;
    function closeBar(refocus) {
      if (!bar) { return; }
      bar.hidden = true;
      if (btn) { btn.setAttribute('aria-expanded', 'false'); if (refocus) { btn.focus(); } }
      if (barSearch) { barSearch.reset(); }
    }
    boxes.forEach(function (b) {
      var inBar = bar && bar.contains(b);
      var api = initSearch(b, function () {
        if (inBar) { closeBar(false); }
      });
      if (inBar) { barSearch = api; }
    });
    if (bar && btn) {
      btn.addEventListener('click', function () {
        if (bar.hidden) {
          bar.hidden = false;
          btn.setAttribute('aria-expanded', 'true');
          var inp = $('.search-input', bar);
          if (inp) { inp.focus(); }
        } else {
          closeBar(true);
        }
      });
      $$('[data-search-close]', bar).forEach(function (c) {
        c.addEventListener('click', function () { closeBar(true); });
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !bar.hidden) { closeBar(true); }
      });
      document.addEventListener('click', function (e) {
        if (bar.hidden) { return; }
        if (!bar.contains(e.target) && !btn.contains(e.target)) { closeBar(false); }
      });
    }
  }

  /* ---------- аккордеон FAQ (details с анимацией) ---------- */
  function initFaq() {
    $$('.faq details').forEach(function (det) {
      var sum = $('summary', det);
      if (!sum) { return; }
      sum.addEventListener('click', function (e) {
        e.preventDefault();
        if (det.open && det.classList.contains('is-open')) {
          det.classList.remove('is-open');
          if (REDUCE) { det.open = false; }
          else {
            setTimeout(function () { if (!det.classList.contains('is-open')) { det.open = false; } }, 230);
          }
        } else {
          det.open = true;
          if (REDUCE) { det.classList.add('is-open'); }
          else {
            void det.offsetHeight;
            requestAnimationFrame(function () { det.classList.add('is-open'); });
          }
        }
      });
    });
  }

  /* ---------- оглавление: текущий раздел ---------- */
  function initToc() {
    $$('.toc-m a').forEach(function (a) {
      a.addEventListener('click', function () {
        var d = a.closest('details');
        if (d) { d.removeAttribute('open'); }
      });
    });
    var links = $$('.toc-d a[href^="#"]');
    if (!links.length) { return; }
    var secs = [];
    links.forEach(function (a) {
      var s = document.getElementById(a.getAttribute('href').slice(1));
      if (s) { secs.push(s); }
    });
    if (!secs.length) { return; }
    var current = '';
    var ticking = false;
    function update() {
      ticking = false;
      var off = parseInt(getComputedStyle(document.documentElement).scrollPaddingTop, 10) || 120;
      var cur = secs[0].id;
      secs.forEach(function (s) { if (s.getBoundingClientRect().top <= off + 8) { cur = s.id; } });
      if (cur === current) { return; }
      current = cur;
      links.forEach(function (a) {
        var on = a.getAttribute('href') === '#' + cur;
        a.classList.toggle('is-current', on);
        if (on) { a.setAttribute('aria-current', 'location'); } else { a.removeAttribute('aria-current'); }
      });
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ---------- каталог цен ---------- */
  function fmtPrice(p) {
    if (p === null || p === undefined) { return { text: 'Уточняйте у администратора', ask: true }; }
    if (p === 'free') { return { text: 'бесплатно', ask: false }; }
    if (Array.isArray(p)) { return { text: 'от ' + p[0] + NBSP + 'до' + NBSP + p[1] + NBSP + 'руб.', ask: false }; }
    return { text: p + NBSP + 'руб.', ask: false };
  }
  function minPrice(cat) {
    var m = null;
    cat.items.forEach(function (it) {
      var p = it[1];
      var v = Array.isArray(p) ? p[0] : (typeof p === 'number' ? p : null);
      if (v !== null && (m === null || v < m)) { m = v; }
    });
    return m;
  }
  function serviceFor(catId, name) {
    var n = norm(name);
    if (catId === 'komissii') {
      if (/водительск/.test(n)) { return 'voditelskaya'; }
      if (/санитарн|бланк|санминимум/.test(n)) { return 'medkniga'; }
      if (/086/.test(n)) { return 'vuz'; }
      if (/сан-кур/.test(n)) { return 'sankur'; }
      if (/путевк/.test(n)) { return 'putevka'; }
      if (/бассейн/.test(n)) { return 'bassein'; }
      if (/физкульт|соревнован/.test(n)) { return 'sport'; }
      if (/001-гс|гостайн/.test(n)) { return 'gossluzhba'; }
      return 'drugoe';
    }
    if (catId === 'uzi') { return 'uzi'; }
    if (catId === 'stacionar') { return 'stacionar'; }
    if (catId === 'kardiolog' && /экг|холтер/.test(n)) { return 'ekg'; }
    if (catId === 'fizio') { return 'drugoe'; }
    return 'priem';
  }
  function priceRow(cat, it, words) {
    var li = el('li', 'price-row');
    var nm = el('span', 'price-name');
    appendHighlighted(nm, it[0], words);
    li.appendChild(nm);
    var dots = el('span', 'price-dots');
    dots.setAttribute('aria-hidden', 'true');
    li.appendChild(dots);
    var pr = fmtPrice(it[1]);
    li.appendChild(el('span', 'price-val' + (pr.ask ? ' is-ask' : ''), pr.text));
    var a = el('a', 'btn btn-secondary btn-sm', 'Записаться');
    a.href = ROOT + 'zapis.html?service=' + serviceFor(cat.id, it[0]);
    a.setAttribute('aria-label', 'Записаться: ' + it[0]);
    li.appendChild(a);
    return li;
  }

  function initCatalog() {
    var rootEl = $('#catalog');
    if (!rootEl || !window.PRICE_DATA) { return; }
    var cats = window.PRICE_DATA.categories;
    var byId = {};
    cats.forEach(function (c) { byId[c.id] = c; });

    var qInput = $('#cat-q');
    var chipsBox = $('#cat-chips');
    var select = $('#cat-select');
    var view = $('#cat-view');
    var counter = $('#cat-counter');
    var resetBtn = $('#cat-reset');
    var minibar = $('#minibar');
    var miniTitle = $('#minibar-title');
    var toolbar = $('#cat-toolbar');
    var state = { cat: '', q: '' };
    var toolbarOut = false;

    function catTitle(c) { return c.title || c.name; }

    /* чипы и select */
    function addChip(id, text) {
      var b = el('button', 'chip');
      b.type = 'button';
      b.setAttribute('data-cat', id);
      b.setAttribute('aria-pressed', 'false');
      b.appendChild(icon('check'));
      b.appendChild(document.createTextNode(text));
      chipsBox.appendChild(b);
      var o = el('option', null, text);
      o.value = id;
      select.appendChild(o);
    }
    addChip('', 'Все категории');
    cats.forEach(function (c) { addChip(c.id, c.name); });

    function readState() {
      var raw = window.location.hash.replace(/^#/, '');
      if (!raw) { raw = window.location.search.replace(/^\?/, ''); }
      var p = new URLSearchParams(raw);
      var c = p.get('category') || '';
      if (!byId[c]) { c = ''; }
      return { cat: c, q: (p.get('q') || '').slice(0, 100) };
    }
    function writeState(replace) {
      var p = new URLSearchParams();
      if (state.cat) { p.set('category', state.cat); }
      if (state.q) { p.set('q', state.q); }
      var s = p.toString();
      var url = window.location.pathname + (s ? '#' + s : '');
      try {
        if (replace) { history.replaceState(null, '', url); } else { history.pushState(null, '', url); }
      } catch (e) {
        window.location.hash = s;
      }
    }

    function setCounter(text) { counter.textContent = text; }

    function renderCategories() {
      var h = el('h2', 'sr-only', 'Категории прайса');
      view.appendChild(h);
      var grid = el('div', 'cat-grid');
      cats.forEach(function (c, i) {
        var a = el('a', 'cat-card' + (i === 0 ? ' cat-card--accent' : ''));
        a.href = '#category=' + c.id;
        a.setAttribute('data-cat', c.id);
        a.appendChild(el('h3', null, catTitle(c)));
        var m = minPrice(c);
        a.appendChild(el('p', 'cat-from', (c.fromLabel || 'от') + ' ' + m + NBSP + 'руб.'));
        if (c.extra) { a.appendChild(el('p', 'cat-extra', c.extra)); }
        a.appendChild(el('p', 'cat-count', c.items.length + ' ' + plural(c.items.length, ['услуга', 'услуги', 'услуг'])));
        var go = el('span', 'cat-go');
        go.appendChild(document.createTextNode('Смотреть цены'));
        go.appendChild(icon('chevron-right'));
        a.appendChild(go);
        grid.appendChild(a);
      });
      view.appendChild(grid);
      setCounter('Найдено: ' + cats.length + ' ' + plural(cats.length, ['категория', 'категории', 'категорий']));
    }

    function backLink() {
      var b = el('button', 'link-chevron cat-back');
      b.type = 'button';
      b.setAttribute('data-action', 'all');
      b.appendChild(icon('chevron-left'));
      b.appendChild(document.createTextNode('Все категории'));
      return b;
    }

    function renderCategory(c) {
      view.appendChild(backLink());
      var head = el('div', 'cat-head');
      var h2 = el('h2', null, catTitle(c));
      h2.id = 'cat-heading';
      h2.tabIndex = -1;
      head.appendChild(h2);
      var m = minPrice(c);
      head.appendChild(el('p', null, (c.fromLabel || 'от') + ' ' + m + NBSP + 'руб., ' + c.items.length + ' ' + plural(c.items.length, ['услуга', 'услуги', 'услуг'])));
      view.appendChild(head);
      var card = el('div', 'price-card');
      var ul = el('ul', 'price-list');
      c.items.forEach(function (it) { ul.appendChild(priceRow(c, it, [])); });
      card.appendChild(ul);
      view.appendChild(card);
      setCounter('Найдено: ' + c.items.length + ' ' + plural(c.items.length, ['услуга', 'услуги', 'услуг']));
    }

    function renderSearch() {
      var words = stems(state.q);
      var total = 0;
      var groups = [];
      cats.forEach(function (c) {
        if (state.cat && c.id !== state.cat) { return; }
        var hay = norm(catTitle(c) + ' ' + catKeywords(c.id));
        var list = [];
        c.items.forEach(function (it) {
          var h = norm(it[0]) + ' ' + hay;
          var ok = words.every(function (w) { return h.indexOf(w) > -1; });
          if (ok) { list.push(it); }
        });
        if (list.length) { groups.push({ cat: c, items: list }); total += list.length; }
      });
      if (state.cat) { view.appendChild(backLink()); }
      var h2 = el('h2', 'sr-only', 'Результаты поиска');
      h2.id = 'cat-heading';
      h2.tabIndex = -1;
      view.appendChild(h2);
      if (!groups.length) {
        var box = el('div', 'nothing');
        box.appendChild(el('h3', null, 'Ничего не найдено'));
        box.appendChild(el('p', null, 'Не нашли нужную услугу? Спросите помощника или позвоните: 8 (888) 888-88-88.'));
        var row = el('div', 'btn-row');
        var b1 = el('button', 'btn btn-primary', 'Спросить помощника');
        b1.type = 'button';
        b1.setAttribute('data-open-chat', '');
        var b2 = el('a', 'btn btn-secondary', 'Позвонить 8 (888) 888-88-88');
        b2.href = 'tel:+78888888888';
        row.appendChild(b1);
        row.appendChild(b2);
        box.appendChild(row);
        view.appendChild(box);
        setCounter('Найдено: 0');
        return;
      }
      groups.forEach(function (g) {
        var wrap = el('div', 'price-group');
        wrap.appendChild(el('h3', null, catTitle(g.cat)));
        var card = el('div', 'price-card');
        var ul = el('ul', 'price-list');
        g.items.forEach(function (it) { ul.appendChild(priceRow(g.cat, it, words)); });
        card.appendChild(ul);
        wrap.appendChild(card);
        view.appendChild(wrap);
      });
      setCounter('Найдено: ' + total + ' ' + plural(total, ['услуга', 'услуги', 'услуг']));
    }

    function render() {
      if (qInput.value !== state.q) { qInput.value = state.q; }
      $$('.chip', chipsBox).forEach(function (c) {
        c.setAttribute('aria-pressed', c.getAttribute('data-cat') === state.cat ? 'true' : 'false');
      });
      select.value = state.cat;
      resetBtn.hidden = !(state.cat || state.q);
      view.innerHTML = '';
      if (norm(state.q)) { renderSearch(); }
      else if (state.cat) { renderCategory(byId[state.cat]); }
      else { renderCategories(); }
      if (miniTitle) { miniTitle.textContent = state.cat ? catTitle(byId[state.cat]) : ''; }
      updateMini();
    }
    function updateMini() {
      if (minibar) { minibar.hidden = !(state.cat && toolbarOut); }
    }
    function focusHeading() {
      var h = $('#cat-heading');
      if (h) { h.focus({ preventScroll: false }); }
    }
    function setCat(id, userAction) {
      state.cat = id;
      writeState(false);
      render();
      if (userAction && id) { focusHeading(); }
      if (userAction && !id) { try { toolbar.scrollIntoView({ block: 'start' }); } catch (e) { /* ничего */ } }
    }

    qInput.addEventListener('input', function () {
      state.q = qInput.value.slice(0, 100);
      writeState(true);
      render();
    });
    qInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); }
    });
    chipsBox.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.chip') : null;
      if (b) { setCat(b.getAttribute('data-cat'), true); }
    });
    select.addEventListener('change', function () { setCat(select.value, true); });
    resetBtn.addEventListener('click', function () {
      state = { cat: '', q: '' };
      writeState(false);
      render();
      qInput.focus();
    });
    view.addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('a[data-cat]') : null;
      if (card) { e.preventDefault(); setCat(card.getAttribute('data-cat'), true); return; }
      var back = e.target.closest ? e.target.closest('[data-action="all"]') : null;
      if (back) { setCat('', true); }
    });
    if (minibar) {
      minibar.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-action="all"]') : null;
        if (b) { setCat('', true); }
      });
    }
    function onNav() { state = readState(); render(); }
    window.addEventListener('hashchange', onNav);
    window.addEventListener('popstate', onNav);

    if ('IntersectionObserver' in window && toolbar) {
      var offset = (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ribbon-h'), 10) || 0) +
        (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h'), 10) || 0);
      var io = new IntersectionObserver(function (entries) {
        var e = entries[entries.length - 1];
        var top = e.rootBounds ? e.rootBounds.top : offset;
        toolbarOut = !e.isIntersecting && e.boundingClientRect.bottom <= top + 1;
        updateMini();
      }, { rootMargin: '-' + offset + 'px 0px 0px 0px', threshold: [0, 1] });
      io.observe(toolbar);
    }

    state = readState();
    if (window.location.search && (state.cat || state.q)) { writeState(true); }
    render();
  }

  /* ---------- общие помощники форм ---------- */
  function fieldWrap(form, name) { return form.querySelector('[data-field="' + name + '"]'); }
  function setFieldError(form, name, msg) {
    var wrap = fieldWrap(form, name);
    if (!wrap) { return; }
    var span = $('.field-error span', wrap);
    var ctl = wrap.querySelector('[data-control]');
    if (msg) {
      wrap.classList.add('has-error');
      if (span) { span.textContent = msg; }
      if (ctl) { ctl.setAttribute('aria-invalid', 'true'); }
    } else {
      wrap.classList.remove('has-error');
      if (span) { span.textContent = ''; }
      if (ctl) { ctl.removeAttribute('aria-invalid'); }
    }
  }
  function focusControl(form, name) {
    var wrap = fieldWrap(form, name);
    var ctl = wrap ? wrap.querySelector('[data-control]') : null;
    if (ctl) { ctl.focus(); }
  }
  function showSummary(box, items) {
    /* items: [{name, label, msg}] */
    box.innerHTML = '';
    var icn = icon('triangle-alert');
    box.appendChild(icn);
    var d = el('div');
    d.appendChild(el('strong', null, 'Проверьте форму'));
    var ul = el('ul');
    items.forEach(function (it) {
      var li = el('li');
      var a = el('a', null, it.msg);
      a.href = '#' + it.id;
      a.addEventListener('click', function (e) { e.preventDefault(); var t = document.getElementById(it.id); if (t) { t.focus(); } });
      li.appendChild(a);
      ul.appendChild(li);
    });
    d.appendChild(ul);
    box.appendChild(d);
    box.classList.add('is-shown');
  }
  function hideSummary(box) { box.classList.remove('is-shown'); box.innerHTML = ''; }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  var WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  function dayLabel(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
    if (!m) { return v || ''; }
    var d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    return WEEKDAYS[d.getDay()] + ', ' + m[3] + '.' + m[2] + '.' + m[1];
  }
  var MSG = {
    service: 'Выберите услугу из списка.',
    address: 'Выберите адрес.',
    dayEmpty: 'Выберите удобный день.',
    daySunday: 'В воскресенье центр не работает. Выберите другой день.',
    dayPast: 'Эта дата уже прошла. Выберите другой день.',
    name: 'Укажите, как к вам обращаться.',
    phoneEmpty: 'Укажите телефон, чтобы администратор мог перезвонить.',
    phoneBad: 'Проверьте номер: нужно 11 цифр, например +7 900 000-00-00.',
    consent: 'Без согласия мы не можем принять заявку. Поставьте галочку или позвоните: 8 (888) 888-88-88.',
    sendFail: 'Не получилось отправить заявку. Попробуйте ещё раз или позвоните: 8 (888) 888-88-88.'
  };
  function dayError(v) {
    if (!v) { return MSG.dayEmpty; }
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) { return MSG.dayEmpty; }
    if (v < todayStr()) { return MSG.dayPast; }
    var d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    if (d.getDay() === 0) { return MSG.daySunday; }
    return '';
  }
  function phoneError(v) {
    if (!String(v || '').trim()) { return MSG.phoneEmpty; }
    return phoneOk(v) ? '' : MSG.phoneBad;
  }

  /* ---------- запись онлайн ---------- */
  function initBooking() {
    var form = $('#booking');
    if (!form) { return; }
    var steps = $$('.bk-step', form);
    var stepperItems = $$('#stepper li');
    var progText = $('#progress-text');
    var progBar = $$('#progress-bar span');
    var NAMES = ['Услуга', 'Адрес', 'День', 'Контакты', 'Согласие'];
    var back = $('#bk-back');
    var next = $('#bk-next');
    var nextLabel = $('span', next);
    var summary = $('#form-summary');
    var cardBox = $('#booking-card');
    var blankBox = $('#booking-blank');
    var doneBox = $('#booking-done');
    var intro = $('#booking-intro');
    var fService = $('#f-service');
    var fDay = $('#f-day');
    var fName = $('#f-name');
    var fPhone = $('#f-phone');
    var fConsent = $('#f-consent');
    var cur = 1;
    var doctor = '';

    fDay.setAttribute('min', todayStr());

    /* предзаполнение из адреса страницы */
    var params = new URLSearchParams(window.location.search);
    var sv = params.get('service');
    if (sv && SERVICES[sv]) { fService.value = sv; }
    var doc = params.get('doctor');
    if (doc) { doctor = doc.slice(0, 80); if (!fService.value) { fService.value = 'priem'; } }

    function addrValue() {
      var r = form.querySelector('input[name="address"]:checked');
      return r ? r.value : '';
    }
    function serviceText() {
      if (!fService.value) { return ''; }
      var t = SERVICES[fService.value] || fService.value;
      if (fService.value === 'priem' && doctor) { t += ' (' + doctor + ')'; }
      return t;
    }
    function values() {
      return {
        service: serviceText(),
        address: addrValue(),
        day: dayLabel(fDay.value),
        name: fName.value.trim(),
        phone: phoneOk(fPhone.value) ? phoneFmt(fPhone.value) : fPhone.value.trim()
      };
    }
    function updateBlank() {
      var v = values();
      $$('[data-bl]').forEach(function (dd) {
        var val = v[dd.getAttribute('data-bl')];
        dd.innerHTML = '';
        if (val) {
          dd.className = '';
          dd.appendChild(icon('check'));
          dd.appendChild(document.createTextNode(val));
        } else {
          dd.className = 'is-empty';
          dd.textContent = 'Не выбрано';
        }
      });
    }

    function paint() {
      steps.forEach(function (s) { s.hidden = parseInt(s.getAttribute('data-step'), 10) !== cur; });
      stepperItems.forEach(function (li, i) {
        li.classList.toggle('is-done', i + 1 < cur);
        li.classList.toggle('is-current', i + 1 === cur);
        if (i + 1 === cur) { li.setAttribute('aria-current', 'step'); } else { li.removeAttribute('aria-current'); }
      });
      if (progText) { progText.textContent = 'Шаг ' + cur + ' из 5. ' + NAMES[cur - 1]; }
      progBar.forEach(function (s, i) {
        s.className = i + 1 < cur ? 'is-done' : (i + 1 === cur ? 'is-current' : '');
      });
      back.hidden = cur === 1;
      if (nextLabel) { nextLabel.textContent = cur === 5 ? 'Отправить заявку' : 'Далее'; }
      updateBlank();
    }
    function goTo(n, focusTitle) {
      cur = n;
      hideSummary(summary);
      paint();
      if (focusTitle) {
        var t = $('.bk-step[data-step="' + cur + '"] .step-title', form);
        if (t) { t.focus(); }
      }
    }

    function checkStep(n) {
      /* возвращает массив ошибок {name, id, msg} и показывает их у полей */
      var errs = [];
      function chk(name, id, msg) {
        setFieldError(form, name, msg);
        if (msg) { errs.push({ name: name, id: id, msg: msg }); }
      }
      if (n === 1) { chk('service', 'f-service', fService.value ? '' : MSG.service); }
      if (n === 2) { chk('address', 'f-address-1', addrValue() ? '' : MSG.address); }
      if (n === 3) { chk('day', 'f-day', dayError(fDay.value)); }
      if (n === 4) {
        chk('name', 'f-name', fName.value.trim().length >= 2 ? '' : MSG.name);
        chk('phone', 'f-phone', phoneError(fPhone.value));
      }
      if (n === 5) { chk('consent', 'f-consent', fConsent.checked ? '' : MSG.consent); }
      return errs;
    }
    function reportErrors(errs) {
      if (!errs.length) { hideSummary(summary); return; }
      if (errs.length > 1) { showSummary(summary, errs); summary.setAttribute('tabindex', '-1'); summary.focus(); }
      else { hideSummary(summary); focusControl(form, errs[0].name); if (errs[0].name === 'address') { var r = $('#f-address-1'); if (r) { r.focus(); } } }
    }

    /* убираем ошибку при исправлении */
    fService.addEventListener('change', function () { setFieldError(form, 'service', ''); updateBlank(); });
    $$('input[name="address"]', form).forEach(function (r) {
      r.addEventListener('change', function () { setFieldError(form, 'address', ''); updateBlank(); });
    });
    fDay.addEventListener('change', function () { setFieldError(form, 'day', dayError(fDay.value)); updateBlank(); });
    fName.addEventListener('input', function () { if (fName.value.trim().length >= 2) { setFieldError(form, 'name', ''); } updateBlank(); });
    fPhone.addEventListener('input', function () { if (phoneOk(fPhone.value)) { setFieldError(form, 'phone', ''); } updateBlank(); });
    fConsent.addEventListener('change', function () { if (fConsent.checked) { setFieldError(form, 'consent', ''); } });

    back.addEventListener('click', function () { if (cur > 1) { goTo(cur - 1, true); } });

    function finish() {
      var v = values();
      var payload = {
        'услуга': v.service, 'адрес': v.address, 'день': v.day, 'имя': v.name, 'телефон': v.phone, 'согласие': true,
        'источник': 'форма записи на сайте (демо)'
      };
      next.disabled = true;
      if (nextLabel) { nextLabel.textContent = 'Отправляем...'; }
      sendForm(payload, function () {
        next.disabled = false;
        cardBox.hidden = true;
        blankBox.hidden = true;
        if (intro) { intro.hidden = true; }
        doneBox.hidden = false;
        doneBox.setAttribute('tabindex', '-1');
        updateBlank();
        doneBox.focus();
        window.scrollTo(0, 0);
      }, function () {
        next.disabled = false;
        if (nextLabel) { nextLabel.textContent = 'Отправить заявку'; }
        summary.innerHTML = '';
        summary.appendChild(icon('triangle-alert'));
        var p = el('p', null, MSG.sendFail);
        summary.appendChild(p);
        summary.classList.add('is-shown');
        summary.setAttribute('tabindex', '-1');
        summary.focus();
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var errs = checkStep(cur);
      if (errs.length) { reportErrors(errs); return; }
      hideSummary(summary);
      if (cur < 5) { goTo(cur + 1, true); return; }
      /* шаг 5: проверяем всё ещё раз перед отправкой */
      for (var n = 1; n <= 4; n++) {
        var e2 = checkStep(n);
        if (e2.length) { goTo(n, false); reportErrors(e2); return; }
      }
      finish();
    });
    form.setAttribute('novalidate', '');

    paint();
  }

  /* ---------- форма на странице контактов ---------- */
  function initContactForm() {
    var form = $('#contact-form');
    if (!form) { return; }
    var summary = $('#contact-summary');
    var fName = $('#c-name');
    var fPhone = $('#c-phone');
    var fMsg = $('#c-msg');
    var fConsent = $('#c-consent');
    var done = $('#contact-done');
    var btn = $('#contact-send');
    form.setAttribute('novalidate', '');

    fName.addEventListener('input', function () { if (fName.value.trim().length >= 2) { setFieldError(form, 'name', ''); } });
    fPhone.addEventListener('input', function () { if (phoneOk(fPhone.value)) { setFieldError(form, 'phone', ''); } });
    fConsent.addEventListener('change', function () { if (fConsent.checked) { setFieldError(form, 'consent', ''); } });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var errs = [];
      function chk(name, id, msg) {
        setFieldError(form, name, msg);
        if (msg) { errs.push({ name: name, id: id, msg: msg }); }
      }
      chk('name', 'c-name', fName.value.trim().length >= 2 ? '' : MSG.name);
      chk('phone', 'c-phone', phoneError(fPhone.value));
      chk('consent', 'c-consent', fConsent.checked ? '' : MSG.consent);
      if (errs.length) {
        if (errs.length > 1) { showSummary(summary, errs); summary.setAttribute('tabindex', '-1'); summary.focus(); }
        else { hideSummary(summary); focusControl(form, errs[0].name); }
        return;
      }
      hideSummary(summary);
      var payload = {
        'имя': fName.value.trim(), 'телефон': phoneFmt(fPhone.value), 'сообщение': fMsg.value.trim(),
        'согласие': true, 'источник': 'форма на странице контактов (демо)'
      };
      btn.disabled = true;
      sendForm(payload, function () {
        btn.disabled = false;
        $('[data-done="name"]', done).textContent = payload['имя'];
        $('[data-done="phone"]', done).textContent = payload['телефон'];
        var mrow = $('[data-done-row="msg"]', done);
        if (payload['сообщение']) {
          $('[data-done="msg"]', done).textContent = payload['сообщение'];
          mrow.hidden = false;
        } else { mrow.hidden = true; }
        form.hidden = true;
        done.hidden = false;
        done.setAttribute('tabindex', '-1');
        done.focus();
      }, function () {
        btn.disabled = false;
        summary.innerHTML = '';
        summary.appendChild(icon('triangle-alert'));
        summary.appendChild(el('p', null, MSG.sendFail));
        summary.classList.add('is-shown');
        summary.setAttribute('tabindex', '-1');
        summary.focus();
      });
    });
  }

  /* ---------- запуск ---------- */
  window.MC = {
    root: ROOT,
    norm: norm,
    status: statusInfo,
    services: SERVICES,
    phoneOk: phoneOk,
    phoneFmt: phoneFmt,
    sendForm: sendForm,
    formEndpoint: function () { return FORM_ENDPOINT; },
    dayError: dayError,
    plural: plural
  };

  initHeader();
  initSearchUI();
  initFaq();
  initToc();
  initCatalog();
  initBooking();
  initContactForm();
  applyDemoNotes();
  applyStatus();
  setInterval(applyStatus, 60000);
})();
