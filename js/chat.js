/* Виджет "ИИ-помощник регистратуры" (демо).
   Два режима:
   1) демо без ИИ (CHAT_ENDPOINT пуст): ответы по базе знаний kb.js и 12 образцам из assistant.md, подбор по ключевым словам;
   2) режим ИИ: если указан CHAT_ENDPOINT, запросы уходят на серверную функцию api/chat.js (Vercel). Ключ API живёт только на сервере. */

/* Адрес серверной функции, например https://ваш-проект.vercel.app/api/chat
   Пусто = демо-режим без ИИ (работает на любом статическом хостинге и локально). */
var CHAT_ENDPOINT = '';

(function () {
  'use strict';

  var MC = window.MC;
  var KB = window.MC_KB;
  var PD = window.PRICE_DATA;
  if (!MC || !KB) { return; }

  var ROOT = MC.root;
  var POLICY = ROOT + 'politika.html';
  var NB = ' ';
  var REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var MOBILE = window.matchMedia ? window.matchMedia('(max-width: 767px)') : { matches: false };

  /* ---------- утилиты ---------- */
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
  var norm = MC.norm;
  /* P - с начала слова, W - слово целиком (границы по кириллице и латинице) */
  function P(src) { return new RegExp('(?:^|[^а-яa-z0-9])(?:' + src + ')'); }
  function W(src) { return new RegExp('(?:^|[^а-яa-z0-9])(?:' + src + ')(?![а-яa-z0-9])'); }
  function pad2(n) { return ('0' + n).slice(-2); }

  /* ---------- DOM виджета ---------- */
  var fab, win, log, input, sendBtn, titleEl, form, lastTrigger = null, started = false, busy = false;
  var hist = [];

  function build() {
    fab = el('button', 'chat-fab');
    fab.type = 'button';
    fab.setAttribute('data-open-chat', '');
    fab.setAttribute('aria-haspopup', 'dialog');
    fab.setAttribute('aria-controls', 'chat-win');
    fab.setAttribute('aria-expanded', 'false');
    fab.appendChild(icon('message-circle'));
    fab.appendChild(el('span', null, 'Спросить ИИ-помощника'));

    win = el('section', 'chat');
    win.id = 'chat-win';
    win.hidden = true;
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-labelledby', 'chat-title');

    var head = el('div', 'chat-head');
    var logo = el('span', 'chat-logo', 'ИИ');
    logo.setAttribute('aria-hidden', 'true');
    head.appendChild(logo);
    var titles = el('div', 'chat-titles');
    titleEl = el('p', 'chat-title', KB.title);
    titleEl.id = 'chat-title';
    titleEl.tabIndex = -1;
    titles.appendChild(titleEl);
    titles.appendChild(el('p', 'chat-sub', 'Не врач и не человек'));
    head.appendChild(titles);
    var close = el('button', 'chat-close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Закрыть чат');
    close.appendChild(icon('x'));
    close.appendChild(el('span', null, 'Закрыть'));
    close.addEventListener('click', closeChat);
    head.appendChild(close);
    win.appendChild(head);

    win.appendChild(el('p', 'chat-demo', MC.formEndpoint() ? KB.demoCaption : KB.demoCaptionNoSend));

    log = el('div', 'chat-log');
    log.id = 'chat-log';
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');
    log.setAttribute('aria-label', 'Переписка с помощником');
    win.appendChild(log);

    form = el('form', 'chat-form');
    form.setAttribute('autocomplete', 'off');
    var row = el('div', 'chat-form-row');
    var lab = el('label', 'sr-only', 'Ваше сообщение');
    lab.setAttribute('for', 'chat-input');
    row.appendChild(lab);
    input = el('textarea', 'chat-input');
    input.id = 'chat-input';
    input.rows = 1;
    input.maxLength = 600;
    input.setAttribute('enterkeyhint', 'send');
    input.setAttribute('aria-describedby', 'chat-note');
    row.appendChild(input);
    sendBtn = el('button', 'btn btn-primary chat-send');
    sendBtn.type = 'submit';
    sendBtn.appendChild(icon('send', 'icon-20'));
    sendBtn.appendChild(el('span', null, 'Отправить'));
    row.appendChild(sendBtn);
    form.appendChild(row);
    var note = el('p', 'chat-note', KB.inputNote);
    note.id = 'chat-note';
    form.appendChild(note);
    win.appendChild(form);

    document.body.appendChild(fab);
    document.body.appendChild(win);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = input.value;
      input.value = '';
      input.style.height = '';
      ask(v);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (typeof form.requestSubmit === 'function') { form.requestSubmit(); }
        else { form.dispatchEvent(new Event('submit', { cancelable: true })); }
      }
    });
    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
  }

  /* ---------- открытие и закрытие ---------- */
  function backgroundNodes() {
    return Array.prototype.slice.call(document.querySelectorAll('main, .site-header, .site-footer, .ribbon, .bottombar, .chat-fab, .skip-link'));
  }
  function openChat(trigger) {
    lastTrigger = trigger || fab;
    if (window.MC_closeMenu) { window.MC_closeMenu(false); }
    win.hidden = false;
    fab.hidden = true;
    fab.setAttribute('aria-expanded', 'true');
    if (MOBILE.matches) {
      document.documentElement.classList.add('chat-open-m');
      win.setAttribute('aria-modal', 'true');
      backgroundNodes().forEach(function (n) { n.setAttribute('inert', ''); });
    } else {
      win.removeAttribute('aria-modal');
    }
    if (!started) { started = true; start(); }
    titleEl.focus();
  }
  function closeChat() {
    win.hidden = true;
    fab.hidden = false;
    fab.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('chat-open-m');
    win.removeAttribute('aria-modal');
    backgroundNodes().forEach(function (n) { n.removeAttribute('inert'); });
    var t = lastTrigger;
    if (!t || !document.body.contains(t) || !isVisible(t)) { t = isVisible(fab) ? fab : null; }
    if (t) { t.focus(); }
  }
  function isVisible(n) { return !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length); }
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-open-chat]') : null;
    if (t) { e.preventDefault(); openChat(t); }
  });
  document.addEventListener('keydown', function (e) {
    if (!win || win.hidden) { return; }
    if (e.key === 'Escape') { e.preventDefault(); closeChat(); return; }
    if (e.key === 'Tab' && MOBILE.matches) {
      var f = Array.prototype.slice.call(win.querySelectorAll('a[href], button:not([disabled]), textarea:not([readonly]), [tabindex="-1"]#chat-title'))
        .filter(function (n) { return n.offsetParent !== null; });
      if (!f.length) { return; }
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- вывод сообщений ---------- */
  function scrollDown() { log.scrollTop = log.scrollHeight; }
  function addNode(n) { log.appendChild(n); scrollDown(); return n; }

  var TOKEN = /(Политика конфиденциальности|8 \(888\) 888-88-88|8 \(888\) 888-88-88|\(888\) 888-88-88|demo@example\.com)/;
  function inline(parent, text) {
    text.split(TOKEN).forEach(function (part, i) {
      if (!part) { return; }
      if (i % 2 === 1) {
        var a = document.createElement('a');
        a.textContent = part;
        if (part === 'Политика конфиденциальности') { a.href = POLICY; a.target = '_blank'; a.rel = 'noopener'; }
        else if (part.indexOf('@') > -1) { a.href = 'mailto:' + part; }
        else { a.href = 'tel:' + (part.indexOf('770') > -1 ? '+78888888888' : '+78888888888'); }
        parent.appendChild(a);
      } else {
        parent.appendChild(document.createTextNode(part));
      }
    });
  }
  function rich(box, text) {
    var ul = null;
    String(text).split('\n').forEach(function (line) {
      if (/^- /.test(line)) {
        if (!ul) { ul = el('ul'); box.appendChild(ul); }
        var li = el('li');
        inline(li, line.slice(2));
        ul.appendChild(li);
      } else {
        ul = null;
        if (!line.trim()) { return; }
        var p = el('p');
        inline(p, line);
        box.appendChild(p);
      }
    });
  }
  function actionsRow(list) {
    var wrap = el('div', 'msg-actions');
    list.forEach(function (a) {
      var n;
      var cls = 'btn btn-sm ' + (a.primary ? 'btn-primary' : 'btn-secondary');
      if (a.href) {
        n = el('a', cls, a.label);
        n.href = a.href;
      } else {
        n = el('button', cls, a.label);
        n.type = 'button';
        n.addEventListener('click', function () { if (!busy) { handleAction(a); } });
      }
      wrap.appendChild(n);
    });
    return wrap;
  }
  function handleAction(a) {
    if (a.start) {
      addUser(a.say || a.label);
      hist.push({ role: 'user', content: a.say || a.label });
      if (CHAT_ENDPOINT) { askAI(); return; }
      if (flow) { flow = null; }
      startFlow(a.start);
    } else if (a.ask) {
      ask(a.ask);
    }
  }
  function addUser(text) {
    var b = el('div', 'msg msg-user');
    b.appendChild(el('p', null, text));
    addNode(b);
  }
  function say(text, opts) {
    var b = el('div', 'msg msg-bot');
    rich(b, text);
    if (opts && opts.actions && opts.actions.length) { b.appendChild(actionsRow(opts.actions)); }
    addNode(b);
    hist.push({ role: 'assistant', content: text });
    return b;
  }
  function addStatus(text) {
    var s = el('div', 'msg-status');
    s.appendChild(icon('check'));
    s.appendChild(el('span', null, text));
    addNode(s);
    return s;
  }
  function addAlarm(text) {
    var b = el('div', 'msg msg-alarm');
    b.setAttribute('role', 'alert');
    var t = el('div', 'alarm-text');
    t.appendChild(icon('triangle-alert'));
    t.appendChild(el('span', null, text));
    b.appendChild(t);
    var row = el('div', 'msg-actions');
    ['103', '112'].forEach(function (num) {
      var a = el('a', 'btn btn-danger btn-sm', 'Позвонить ' + num);
      a.href = 'tel:' + num;
      row.appendChild(a);
    });
    b.appendChild(row);
    addNode(b);
    hist.push({ role: 'assistant', content: text });
  }
  function addError(text, retry) {
    var b = el('div', 'msg msg-error');
    b.setAttribute('role', 'alert');
    var h = el('div', 'msg-head');
    h.appendChild(icon('triangle-alert'));
    h.appendChild(el('p', null, text));
    b.appendChild(h);
    var row = el('div', 'msg-actions');
    if (retry) {
      var r = el('button', 'btn btn-secondary btn-sm', 'Повторить');
      r.type = 'button';
      r.addEventListener('click', function () {
        if (busy) { return; }
        if (b.parentNode) { b.parentNode.removeChild(b); }
        retry();
      });
      row.appendChild(r);
    }
    var c = el('a', 'btn btn-primary btn-sm', 'Позвонить');
    c.href = 'tel:+78888888888';
    row.appendChild(c);
    b.appendChild(row);
    addNode(b);
  }
  function addHandoffCard() {
    var c = el('div', 'card-chat');
    var r1 = el('div', 'row');
    r1.appendChild(icon('phone'));
    var a1 = el('a', null, '8 (888) 888-88-88');
    a1.href = 'tel:+78888888888';
    r1.appendChild(a1);
    c.appendChild(r1);
    var r2 = el('div', 'row');
    r2.appendChild(icon('mail'));
    var a2 = el('a', null, 'demo@example.com');
    a2.href = 'mailto:demo@example.com';
    r2.appendChild(a2);
    c.appendChild(r2);
    c.appendChild(el('p', 'row-note', 'Пн-пт 8:00-20:00, сб 8:00-15:00, вс - выходной'));
    addNode(c);
  }
  function addSent() {
    var b = el('div', 'msg msg-ok');
    b.appendChild(icon('check'));
    var d = el('div');
    d.appendChild(el('p', null, MC.formEndpoint()
      ? 'Заявка принята. Администратор перезвонит в рабочее время и подтвердит время. Работаем пн-пт 8:00-20:00, сб 8:00-15:00. Я время приёма не подтверждаю.'
      : 'Заявка оформлена. В рабочей версии администратор перезвонил бы в рабочее время и подтвердил время. Работаем пн-пт 8:00-20:00, сб 8:00-15:00. Я время приёма не подтверждаю.'));
    d.appendChild(el('p', 'chat-caption', MC.formEndpoint()
      ? 'Это демо: заявка получена автором демо и в клинику не передавалась.'
      : 'Это демо: заявка никуда не отправлена и в клинику не передавалась.'));
    b.appendChild(d);
    addNode(b);
    hist.push({ role: 'assistant', content: 'Заявка принята. Администратор перезвонит в рабочее время и подтвердит время.' });
  }

  /* ---------- индикатор "печатает", блокировка ввода ---------- */
  function setBusy(v) {
    busy = v;
    sendBtn.disabled = v;
    input.readOnly = v;
    if (v) { input.setAttribute('aria-busy', 'true'); } else { input.removeAttribute('aria-busy'); }
  }
  function showTyping() {
    var t = el('div', 'typing');
    t.setAttribute('role', 'status');
    var d = el('span', 'dots-t');
    d.setAttribute('aria-hidden', 'true');
    d.appendChild(el('i'));
    d.appendChild(el('i'));
    d.appendChild(el('i'));
    t.appendChild(d);
    t.appendChild(el('span', null, 'Помощник печатает'));
    return addNode(t);
  }
  function later(fn, ms) {
    setBusy(true);
    var t = showTyping();
    setTimeout(function () {
      if (t.parentNode) { t.parentNode.removeChild(t); }
      try { fn(); } catch (err) { addError(KB.unavailable); }
      setBusy(false);
      if (!MOBILE.matches || !win.hidden) { try { input.focus({ preventScroll: true }); } catch (e2) { /* ничего */ } }
      scrollDown();
    }, ms || (REDUCE ? 80 : 500));
  }

  /* ---------- старт ---------- */
  function start() {
    var b = el('div', 'msg msg-bot');
    rich(b, KB.greeting);
    addNode(b);
    hist.push({ role: 'assistant', content: KB.greeting });
    log.appendChild(el('p', 'chat-caption', MC.formEndpoint() ? KB.demoCaption : KB.demoCaptionNoSend));
    var chips = el('div', 'chips-q');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Быстрые вопросы');
    KB.quick.forEach(function (q) {
      var c = el('button', 'chip-q', q);
      c.type = 'button';
      c.addEventListener('click', function () { ask(q); });
      chips.appendChild(c);
    });
    addNode(chips);
  }

  /* ---------- отправка вопроса ---------- */
  function ask(raw) {
    var q = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 600);
    if (!q || busy) { return; }
    addUser(q);
    hist.push({ role: 'user', content: q });
    processInput(q);
  }

  /* тревожные признаки: срабатывают всегда, в любом режиме */
  var ALARM = [
    /(болит|боль|давит|давление|жмет|жмут|колет|сжимает|стягивает)[^.!?]{0,25}(сердц|груд|за грудин)/,
    /(сердц|груд)[^.!?]{0,25}(болит|боль|давит|жмет|колет|сжимает|прихватил)/,
    /(трудно|тяжело|сложно|невозможно|нечем|не могу)\s+(дышать|вдохнуть|вздохнуть)|задыха|не хватает воздуха|затрудненн[а-я]* дыхан|одышка\s+(сильн|резк)/,
    /потер[а-я]* сознан|теряю сознан|потерял[а-я]* сознан|упал[а-я]* в обморок|без сознан|обморок/,
    /кровотеч|кровь (не останавливается|хлещет|идет сильно)|сильно идет кровь/,
    /онемел|онемение|немеет|отнялас|речь (нарушен|заплета|пропала)|не могу говорить|перекосил/,
    /судорог|припадок/,
    /внезапн[а-я]* (сильн[а-я]* )?слабост|инсульт|инфаркт/,
    /(невыносим|нестерпим)[а-я]* бол|ужасн[а-я]* бол|очень сильн[а-я]* бол|сильн[а-я]* бол|болит невыносимо/
  ];
  function isAlarm(n) { return ALARM.some(function (rx) { return rx.test(n); }); }
  var alarmLock = false;
  var alarmHeart = false;
  var SAFE_RX = /(вызвал|вызвали|скорая (едет|приехал|уже)|помощь (вызвана|едет|приехал)|я в безопасности|все (хорошо|в порядке|нормально)|мне лучше|уже лучше|прошло|боли нет|не болит)/;
  var HEART_FOLLOW = 'Хорошо. Если станет хуже, снова звоните 103 или 112.\nЕсли острой боли нет, а вопрос в обследовании, это вопрос к врачу. Могу записать вас на приём к кардиологу: первичный приём стоит 2100 руб. по прайсу клиники от 01.10.2019. Хотите записаться?';

  var pending = null;     /* предложение, на которое ждём "да" */
  var consentGiven = null;
  var flow = null;

  var YES_RX = /^(да|ага|угу|конечно|давайте|давай|хорошо|ок|окей|можно|оформить|оформляйте|оформи|запишите|записать|запиши|согласен|согласна|хочу|пожалуйста|верно|все верно|отправляйте|отправить)([ .,!]|$)/;
  var NO_RX = /^(нет|не надо|не нужно|не хочу|позже|потом|не сейчас|пока нет|не согласен|не согласна)([ .,!]|$)/;

  function processInput(q) {
    var n = norm(q);
    if (isAlarm(n)) {
      alarmLock = true;
      alarmHeart = ALARM[0].test(n) || ALARM[1].test(n);
      flow = null;
      pending = null;
      later(function () { addAlarm(KB.alarm); });
      return;
    }
    if (alarmLock) {
      if (SAFE_RX.test(n) || /^(да|ага|угу|ок|окей)([ .,!]|$)/.test(n)) {
        alarmLock = false;
        if (alarmHeart) {
          alarmHeart = false;
          later(function () { say(HEART_FOLLOW, { actions: [bookAction('priem')] }); pending = { service: 'priem' }; });
        } else {
          later(function () { say(KB.alarmDone); });
        }
      } else {
        later(function () { addAlarm(KB.alarmRepeat); });
      }
      return;
    }
    if (flow) { flowInput(q, n); return; }
    if (pending) {
      var off = pending;
      pending = null;
      var shortReply = n.split(' ').length <= 4 && !/\?/.test(q);
      if (shortReply && YES_RX.test(n)) { startFlow(off); return; }
      if (shortReply && NO_RX.test(n)) { later(function () { say(KB.bye); }); return; }
    }
    if (CHAT_ENDPOINT) { askAI(); return; }
    later(function () { deliver(pickReply(n, q)); });
  }

  /* ---------- режим ИИ ---------- */
  function askAI() {
    setBusy(true);
    var t = showTyping();
    var ctl = ('AbortController' in window) ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) { ctl.abort(); } }, 30000);
    var done = false;
    function finish(fn) {
      if (done) { return; }
      done = true;
      clearTimeout(timer);
      if (t.parentNode) { t.parentNode.removeChild(t); }
      try { fn(); } catch (e) { addError(KB.unavailable, askAI); }
      setBusy(false);
      scrollDown();
    }
    fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: hist.slice(-12) }),
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, d: d || {} }; });
    }).then(function (res) {
      finish(function () {
        var text = typeof res.d.reply === 'string' ? res.d.reply.trim() : '';
        if (!res.ok || !text) { addError(text || KB.unavailable, text ? null : askAI); if (text) { hist.push({ role: 'assistant', content: text }); } return; }
        say(text);
        if (res.d.application && typeof res.d.application === 'object') {
          MC.sendForm(res.d.application, function () { addSent(); }, function () {
            addError('Не получилось отправить заявку. Попробуйте ещё раз или позвоните: 8 (888) 888-88-88.');
          });
        }
      });
    }).catch(function () {
      finish(function () { addError(KB.unavailable, askAI); });
    });
  }

  /* ---------- демо-режим: подбор ответа ---------- */
  var SVC_RX = [
    ['voditelskaya', P('водительск|на права|права(?![а-я])|гибдд|мрэо|003')],
    ['oruzhie', P('оружи|охот|чоп|охранник|002')],
    ['medkniga', P('медкниж|санкниж|санитарн|медицинск[а-я]* книж|лмк')],
    ['bassein', P('бассейн')],
    ['sport', P('спортивн|секци|соревновани|физкультур')],
    ['vuz', P('вуз|колледж|техникум|086')],
    ['sankur', P('санатор|сан-кур|санкур|072')],
    ['putevka', P('путевк|070')],
    ['gossluzhba', P('госслужб|гостайн|001-гс')],
    ['organizacii', P('организаци|сотрудник|предрейс|профосмотр|302н')],
    ['uzi', P('узи|ультразвук')],
    ['ekg', P('экг|холтер|кардиограмм')],
    ['analizy', P('анализ|кровь|моча|мочи|лаборатор')],
    ['stacionar', P('капельниц|стационар')],
    ['priem', P('врач|прием|консультац|терапевт|кардиолог|невролог|гастро|гинеколог|офтальмолог|окулист|лор(?![а-я])|отоларинголог|дерматолог|нарколог|психиатр')],
    ['drugoe', P('друго')]
  ];
  function guessService(n) {
    for (var i = 0; i < SVC_RX.length; i++) { if (SVC_RX[i][1].test(n)) { return SVC_RX[i][0]; } }
    return '';
  }
  var ADDR = { tar: 'ул. Примерная, 1', soc: 'ул. Образцовая, 2', any: 'Не важно, подскажет администратор' };
  function guessAddress(n) {
    if (/примерн/.test(n)) { return 'tar'; }
    if (/образцов/.test(n)) { return 'soc'; }
    if (/не важно|неважно|любой|все равно|без разницы|подскаж/.test(n)) { return 'any'; }
    return '';
  }

  var WD = [['понедельник', 'понедельник'], ['вторник', 'вторник'], ['сред', 'среда'], ['четверг', 'четверг'], ['пятниц', 'пятница'], ['суббот', 'суббота']];
  var WD_NAMES = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  function isoOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function ruDate(d) { return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear(); }
  /* возвращает {text} или {err} */
  function parseDay(n) {
    if (/воскресен/.test(n)) { return { err: 'В воскресенье центр не работает. Выберите другой день.' }; }
    var i;
    for (i = 0; i < WD.length; i++) { if (n.indexOf(WD[i][0]) > -1) { return { text: WD[i][1] }; } }
    var off = null;
    if (/послезавтра/.test(n)) { off = 2; } else if (/завтра/.test(n)) { off = 1; } else if (/сегодня/.test(n)) { off = 0; }
    var d = new Date();
    if (off !== null) {
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + off);
    } else {
      var m = /(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?/.exec(n);
      if (!m) { return { err: 'Напишите день, например: пятница или 25.10.' }; }
      var y = m[3] ? parseInt(m[3], 10) : d.getFullYear();
      if (y < 100) { y += 2000; }
      d = new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
      if (isNaN(d.getTime()) || d.getMonth() !== parseInt(m[2], 10) - 1) { return { err: 'Напишите день, например: пятница или 25.10.' }; }
    }
    var e = MC.dayError(isoOf(d));
    if (e) { return { err: e }; }
    return { text: WD_NAMES[d.getDay()] + ', ' + ruDate(d) };
  }

  function priceText(p) {
    if (p === null || p === undefined) { return 'цену уточните у администратора'; }
    if (p === 'free') { return 'бесплатно'; }
    if (Array.isArray(p)) { return 'от ' + p[0] + NB + 'до' + NB + p[1] + NB + 'руб.'; }
    return p + NB + 'руб.';
  }
  var STOP = /^(сколько|стоит|стоят|стоимость|цена|цены|цену|прайс|почем|какая|какой|какие|вас|вам|мне|нужно|нужна|нужен|хочу|узнать|подскажите|скажите|пожалуйста|для|это|как|что|где|когда|есть|можно|услуга|услуги|услугу|сделать|делаете|делают|оформить|врача|врач|прием|приема|приему|ваш|ваши|вашей|центре|центр|клинике|рублей|руб)$/;
  var ALIAS = { 'капельниц': 'систем', 'капельница': 'систем', 'ультразвук': 'узи', 'кардиограмм': 'экг', 'кардиограмма': 'экг' };
  function stemOf(w) {
    if (ALIAS[w]) { return ALIAS[w]; }
    if (w.length >= 7) { return w.slice(0, w.length - 2); }
    if (w.length === 6) { return w.slice(0, 5); }
    return w;
  }
  function priceQueryWords(n) {
    return n.split(/[^а-яa-z0-9\-\/]+/).filter(function (w) { return w.length >= 3 && !STOP.test(w); }).map(stemOf);
  }
  function findPrices(n) {
    if (!PD) { return []; }
    var words = priceQueryWords(n);
    if (!words.length) { return []; }
    var out = [];
    PD.categories.forEach(function (c) {
      c.items.forEach(function (it) {
        var h = norm(it[0] + ' ' + (c.title || c.name));
        if (words.every(function (w) { return h.indexOf(w) > -1; })) { out.push({ cat: c, it: it }); }
      });
    });
    return out;
  }
  function priceReply(n) {
    var res = findPrices(n);
    var more = { label: 'Все услуги и цены', href: ROOT + 'uslugi.html' };
    if (!res.length) { return null; }
    var shown = res.slice(0, 8);
    var lines = ['Цены ' + KB.priceNote + ':'];
    shown.forEach(function (r) { lines.push('- ' + r.it[0] + ': ' + priceText(r.it[1])); });
    if (res.length > shown.length) { lines.push('Это не все позиции, остальные смотрите на странице "Услуги и цены".'); }
    else { lines.push('Записать вас?'); }
    return { text: lines.join('\n'), actions: [more], offer: { service: guessService(n) || 'priem' } };
  }

  var SPEC = [
    { rx: P('терапевт'), cat: 'terapevt', gen: 'терапевта' },
    { rx: P('кардиолог'), cat: 'kardiolog', gen: 'кардиолога', doc: 3 },
    { rx: P('невролог'), cat: 'nevrolog', gen: 'невролога', doc: 5 },
    { rx: P('гастроэнтеролог|гастро'), cat: 'gastro', gen: 'гастроэнтеролога', doc: 1 },
    { rx: P('гинеколог'), cat: 'ginekolog', gen: 'гинеколога', doc: 2 },
    { rx: P('офтальмолог|окулист'), cat: 'oftalmolog', gen: 'офтальмолога', doc: 4 },
    { rx: P('отоларинголог|оториноларинголог|лор(?![а-я])'), cat: 'lor', gen: 'отоларинголога' },
    { rx: P('дерматолог|кожн'), cat: 'dermatolog', gen: 'дерматолога' },
    { rx: P('нарколог'), cat: 'narkolog', gen: 'нарколога', doc: 0 },
    { rx: P('психиатр'), cat: '', gen: 'психиатра', doc: 7 }
  ];
  function catById(id) {
    var r = null;
    if (PD) { PD.categories.forEach(function (c) { if (c.id === id) { r = c; } }); }
    return r;
  }
  function findItemPrice(cat, startsWith) {
    var r = null;
    if (cat) { cat.items.forEach(function (it) { if (!r && it[0].indexOf(startsWith) === 0) { r = it[1]; } }); }
    return r;
  }
  function specReply(s) {
    var lines = [];
    var cat = catById(s.cat);
    if (s.cat === 'narkolog') {
      lines.push('Цены на приём нарколога в моей базе нет, уточните у администратора: 8 (888) 888-88-88. В прайсе клиники от 01.10.2019 есть психофармакологическое кодирование: на 1 год - 10000' + NB + 'руб., на 3 года - 12000' + NB + 'руб., антидот по желанию пациента - 4000' + NB + 'руб. Актуальную стоимость подтвердит администратор.');
    } else if (!cat) {
      lines.push('Цены на приём психиатра в моей базе нет, уточните у администратора: 8 (888) 888-88-88.');
    } else {
      var p1 = findItemPrice(cat, 'Первичный');
      var p2 = findItemPrice(cat, 'Повторный');
      lines.push('Приём ' + s.gen + ' ' + KB.priceNote + ': первичный - ' + priceText(p1) + ', повторный - ' + priceText(p2) + '.');
      if (s.cat === 'terapevt') { lines.push('Измерение артериального давления бесплатно.'); }
    }
    if (s.doc !== undefined) {
      var d = KB.doctors[s.doc];
      lines.push('По данным сайта клиники приём ведёт ' + d.name + ': ' + d.days + '. Точные дни и часы подтвердит администратор.');
    } else if (s.cat === 'terapevt' || s.cat === 'lor' || s.cat === 'dermatolog') {
      lines.push('Кто ведёт этот приём, уточните у администратора.');
    }
    lines.push('Записать вас?');
    return { text: lines.join('\n'), offer: { service: 'priem' }, actions: [{ label: 'Врачи центра', href: ROOT + 'vrachi.html' }] };
  }

  function statusLine() {
    var st = MC.status();
    if (st.open) { return ''; }
    var part = st.text.indexOf('Сейчас: закрыто, откроемся ') === 0 ? st.text.slice('Сейчас: закрыто, откроемся '.length) : '';
    return part ? 'Сейчас центр закрыт, откроется ' + part + '.' : 'Сейчас центр закрыт.';
  }
  function addressText() {
    var t = 'Два адреса в Самаре: ул. Примерная, д. 1 и ул. Образцовая, д. 2. График одинаковый: пн-пт 8:00-20:00, сб 8:00-15:00, воскресенье - выходной. Какие услуги на каком адресе, уточните у администратора: 8 (888) 888-88-88.';
    var s = statusLine();
    return s ? t + '\n' + s + ' Заявку можно оставить и сейчас.' : t;
  }

  function startOffer(service, extra) {
    var o = { service: service };
    if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) { o[k] = extra[k]; } } }
    return o;
  }
  function bookAction(service, label, extra) {
    return { label: label || 'Записаться', start: startOffer(service, extra) };
  }
  function pageAction(path, label) { return { label: label, href: ROOT + path }; }

  /* список правил; первое сработавшее правило отвечает.
     Правило: функция (n, q) -> объект ответа или null */
  var S = KB.samples, RF = KB.refusals, SP = KB.spravki, PR = KB.prep;
  var HAS_PRICE = P('сколько|цена|цены|цену|стоит|стоят|стоимость|почем|прайс');
  var HAS_PREP = P('подготов|натощак|как сдавать|как сдать|как готовиться|что нужно перед|перед (узи|анализ|сдачей)');
  function prepGeneral() {
    return {
      text: PR.general,
      actions: [
        { label: 'УЗИ брюшной полости', ask: 'Как подготовиться к УЗИ брюшной полости?' },
        { label: 'УЗИ малого таза', ask: 'Как подготовиться к УЗИ малого таза?' },
        { label: 'Анализы крови и мочи', ask: 'Как сдавать общий анализ мочи и крови?' },
        { label: 'Холтер', ask: 'Как подготовиться к Холтеру?' }
      ]
    };
  }
  var BOOK_RX =P('записа|запиши|запись|оформить заявку|оставить заявку|хочу на (прием|осмотр)|хочу попасть|можно (ли )?записаться|заявк');

  var RULES = [
    function (n) { if (P('спасибо|благодар').test(n) && n.length < 40) { return { text: KB.thanks }; } return null; },
    function (n) { if (/^(привет|здравств|добрый|доброе|хай)/.test(n) && n.length < 30) { return { text: KB.hello }; } return null; },
    function (n) {
      if (/(позови|позвать|соедини|переключи)[а-я]*.*(человек|администратор|оператор|сотрудник)|оператор|живой человек|живым человеком|поговорить с (человеком|администратором)/.test(n)) {
        return { text: KB.handoff, handoff: true };
      }
      return null;
    },
    function (n) {
      if (P('жалоб|претензи|недоволен|возврат|вернуть деньги|верните деньги|вернут деньги|договор').test(n) && !P('оружи').test(n)) {
        return { text: 'Жалобы, возвраты и вопросы по договору решает администратор.\n' + KB.handoff, handoff: true };
      }
      return null;
    },
    function (n) { if (/(ты|вы)\s+(кто|бот|робот|человек|нейросет|ии|настоящ|живой)|это бот|нейросет|искусственн/.test(n)) { return { text: KB.whoAmI }; } return null; },
    function (n) { if (P('аптек').test(n)) { return { text: KB.apteka }; } return null; },
    /* отказы: анализы, лекарства, симптомы, результат */
    function (n) {
      var anal = P('анализ|гемоглобин|лейкоцит|холестерин|сахар|глюкоз|результат|скрининг|ттг|соэ|эритроцит|тромбоцит').test(n);
      var judge = P('расшифр|что значит|это нормально|в норме|плох|повышен|понижен|высок|низк|плохо ли|хорошо ли').test(n);
      if ((anal && judge) || P('расшифр').test(n) || /гемоглобин\s*\d/.test(n)) {
        return { text: RF.r2, offer: { service: 'priem' }, actions: [bookAction('priem')] };
      }
      return null;
    },
    function (n) {
      if (P('таблетк|чем (сбить|лечить|снять|полечить|лечиться)|что (пить|принять|выпить)|дозировк|сколько (пить|принимать)|антибиотик|лекарств|препарат|схем[а-я]* лечения|народн[а-я]* средств').test(n) && !HAS_PREP.test(n)) {
        return { text: RF.r3, offer: { service: 'priem' }, actions: [bookAction('priem')] };
      }
      return null;
    },
    function (n) {
      var sym = P('болит|болят|болею|болеет|боль(?![а-я])|кружится|тошнит|рвота|рвет|температур|кашел|насморк|сыпь|слабость|головн|что со мной|что это (может быть|такое)|это (опасно|серьезно|страшно)|диагноз|симптом|заболел|плохо себя|плохо мне|запой|запою|выпивк|алкогол|наркоман|зависимост|похмел').test(n);
      if (sym && !P('кодирован|антидот').test(n)) {
        return { text: RF.r1, offer: { service: 'priem' }, actions: [bookAction('priem')] };
      }
      return null;
    },
    function (n) {
      if (P('вылеч|гарантир|точно поможет|точно (будет|получится)|результат лечения|обещаете|лучше чем|лучше других|чем (вы )?отличаетесь|другие клиники|сравн|вы лучшие|самые лучшие').test(n)) {
        return { text: RF.r5, actions: [pageAction('vrachi.html', 'Врачи центра'), pageAction('uslugi.html', 'Услуги и цены')] };
      }
      return null;
    },
    /* воскресенье, как записаться */
    function (n) { if (P('воскресен').test(n)) { return { text: S.s5, offer: { service: 'drugoe' }, actions: [bookAction('drugoe')] }; } return null; },
    function (n) {
      if (P('как (записаться|записать|оформить запись|попасть на приём|попасть на прием)').test(n)) {
        return {
          text: 'Записаться можно тремя способами:\n- онлайн: форма на сайте (страница "Запись онлайн") или через меня;\n- по телефону 8 (888) 888-88-88, пн-пт 8:00-20:00, сб 8:00-15:00;\n- по e-mail demo@example.com.\nАдминистратор перезвонит в рабочее время и подтвердит время. Я время приёма не подтверждаю. Оформить заявку сейчас?',
          offer: { service: '' }, actions: [bookAction('', 'Оформить заявку'), pageAction('zapis.html', 'Запись онлайн')]
        };
      }
      return null;
    },
    /* запись (если нет вопроса про цену) */
    function (n, q) {
      if (BOOK_RX.test(n) && !HAS_PRICE.test(n)) {
        if (P('организаци|сотрудник|предрейс|профосмотр|302н').test(n)) { return { start: { type: 'org', text: q } }; }
        return { start: { type: 'booking', text: q } };
      }
      return null;
    },
    /* организации */
    function (n) {
      if (P('профосмотр|медосмотр|сотрудник|организаци|302н|для (фирм|компани|предприят)|юридическ').test(n) && !P('предрейс|послерейс').test(n)) {
        return { text: S.s11, offer: { type: 'org' }, actions: [{ label: 'Оставить заявку для организации', start: { type: 'org' } }, pageAction('spravki/index.html#profosmotr', 'Подробнее')] };
      }
      return null;
    },
    function (n) { if (P('предрейс|послерейс').test(n)) { return { text: SP.predreys, offer: { type: 'org' }, actions: [{ label: 'Оставить заявку для организации', start: { type: 'org' } }] }; } return null; },
    /* подготовка и исследования */
    function (n) {
      if (P('мрт|кт(?![а-я])|рентген|эндоскоп|гастроскоп|колоноскоп|фгдс|эгдс|бронхоскоп|урограф').test(n)) { return { text: PR.other, actions: [{ label: 'Позвонить', href: 'tel:+78888888888' }] }; }
      return null;
    },
    function (n) {
      if (HAS_PREP.test(n)) {
        if (P('холтер|мониторирован').test(n)) { return { text: PR.holter, offer: { service: 'ekg' }, actions: [bookAction('ekg')] }; }
        if (P('экг|кардиограмм').test(n)) { return { text: PR.ekg, offer: { service: 'ekg' }, actions: [bookAction('ekg')] }; }
        if (P('узи|ультразвук').test(n) && P('анализ|кров|моч').test(n)) { return prepGeneral(); }
        if (P('малого таза|таза').test(n)) { return { text: S.s7, offer: { service: 'uzi' }, actions: [bookAction('uzi')] }; }
        if (P('щитовидн|мошонк').test(n)) { return { text: PR.uziNo, offer: { service: 'uzi' }, actions: [bookAction('uzi')] }; }
        if (P('почек|почки|почка').test(n)) { return { text: PR.uziKidney, offer: { service: 'uzi' }, actions: [bookAction('uzi')] }; }
        if (P('простат|мочевого|мочевой').test(n)) { return { text: PR.uziMen, offer: { service: 'uzi' }, actions: [bookAction('uzi')] }; }
        if (P('молочн|груд').test(n)) { return { text: PR.uziBreast, offer: { service: 'uzi' }, actions: [bookAction('uzi')] }; }
        if (P('брюш|живот|печен|желчн|поджелудоч|селезен').test(n)) { return { text: S.s2, offer: { service: 'uzi' }, actions: [bookAction('uzi')] }; }
        if (P('моч').test(n) && !P('кров|общ').test(n)) { return { text: PR.urine }; }
        if (P('анализ|кров|моч').test(n)) { return { text: S.s8, offer: { service: 'analizy' }, actions: [bookAction('analizy')] }; }
        return prepGeneral();
      }
      return null;
    },
    function (n) { if (P('холтер|мониторирован').test(n)) { return { text: PR.holter, offer: { service: 'ekg' }, actions: [bookAction('ekg')] }; } return null; },
    function (n) {
      if (P('узи|ультразвук').test(n) && P('малого таза|таза').test(n)) { return { text: S.s7, offer: { service: 'uzi' }, actions: [bookAction('uzi')] }; }
      return null;
    },
    function (n) {
      if (P('узи|ультразвук').test(n) && P('брюш|живот|печен|желчн|поджелудоч|селезен').test(n) && !P('почек').test(n)) {
        return { text: S.s2, offer: { service: 'uzi' }, actions: [bookAction('uzi'), pageAction('uslugi.html#category=uzi', 'Все цены на УЗИ')] };
      }
      return null;
    },
    function (n) {
      if (P('анализ|кровь|моча|мочи|сдать кровь|лаборатор').test(n) && !HAS_PREP.test(n)) {
        return { text: S.s8, offer: { service: 'analizy' }, actions: [bookAction('analizy')] };
      }
      return null;
    },
    /* ОМС */
    function (n) { if (W('омс|дмс').test(n) || P('полис|страхов').test(n)) { return { text: S.s4, actions: [pageAction('uslugi.html', 'Услуги и цены')] }; } return null; },
    /* справки */
    function (n) {
      if (P('оружи|охот[а-я]*|чоп|охранник|002').test(n) && !P('вуз|бассейн').test(n)) {
        if (P('возврат|вернуть|вернут').test(n)) { return { text: RF.r4, offer: { service: 'oruzhie' }, actions: [bookAction('oruzhie')] }; }
        return { text: SP.oruzhie, offer: { service: 'oruzhie' }, actions: [bookAction('oruzhie'), pageAction('spravki/oruzhie.html', 'Подробнее о справке')] };
      }
      return null;
    },
    function (n) {
      if (P('справк[а-я]* на прав|водительск|на права|права(?![а-я])|гибдд|мрэо|автошкол|003').test(n)) {
        return { text: S.s1, offer: { service: 'voditelskaya' }, actions: [bookAction('voditelskaya'), pageAction('spravki/voditelskaya.html', 'Подробнее о справке')] };
      }
      return null;
    },
    function (n) {
      if (P('медкниж|санкниж|санитарн|медицинск[а-я]* книж|лмк').test(n)) {
        return { text: S.s6, offer: { service: 'medkniga' }, actions: [bookAction('medkniga'), pageAction('spravki/medkniga.html', 'Подробнее о справке')] };
      }
      return null;
    },
    function (n) { if (P('бассейн').test(n)) { return { text: S.s9, offer: { service: 'bassein' }, actions: [bookAction('bassein')] }; } return null; },
    function (n) { if (P('спортивн|секци|соревновани|физкультур|083/5').test(n)) { return { text: SP.sport, offer: { service: 'sport' }, actions: [bookAction('sport')] }; } return null; },
    function (n) { if (P('вуз|колледж|техникум|поступлен|общежити|086').test(n)) { return { text: SP.vuz, offer: { service: 'vuz' }, actions: [bookAction('vuz')] }; } return null; },
    function (n) { if (P('санатор|сан-кур|санкур|072').test(n)) { return { text: SP.sankur, offer: { service: 'sankur' }, actions: [bookAction('sankur')] }; } return null; },
    function (n) { if (P('путевк|070').test(n)) { return { text: SP.putevka, offer: { service: 'putevka' }, actions: [bookAction('putevka')] }; } return null; },
    function (n) { if (P('госслужб|гостайн|государственн[а-я]* служб|001-гс').test(n)) { return { text: SP.gossluzhba, offer: { service: 'gossluzhba' }, actions: [bookAction('gossluzhba')] }; } return null; },
    function (n) {
      if (P('какие справки|виды справок|перечень справок|все справки|справки|справка').test(n) && !HAS_PRICE.test(n)) {
        return { text: SP.list, actions: [pageAction('spravki/index.html', 'Справки и медосмотры')] };
      }
      return null;
    },
    /* адреса, график, контакты */
    function (n) {
      if (P('образцов').test(n)) { return { text: S.s12, offer: { service: 'uzi', address: 'soc' }, actions: [bookAction('uzi', 'Оформить заявку', { address: 'soc' })] }; }
      return null;
    },
    function (n) {
      if (P('парковк|проезд|как (добраться|проехать|найти)|ориентир').test(n)) { return { text: addressText() + '\n' + KB.noAddressInfo, handoff: true }; }
      return null;
    },
    function (n) {
      if (P('где (вы|находит|центр|клиника)|адрес|до скольки|график|часы работы|режим работы|во сколько (откр|закр)|когда (откр|работа|принима)|работаете|открыты|работает ли|выходной|выходные').test(n)) {
        return { text: addressText(), actions: [pageAction('kontakty.html', 'Все контакты'), bookAction('', 'Записаться')] };
      }
      return null;
    },
    function (n) {
      if (P('телефон|номер|позвонить|почт|e-?mail|email|связаться|контакт|написать').test(n)) {
        var s = statusLine();
        return { text: 'Телефон: 8 (888) 888-88-88. E-mail: demo@example.com. Звоните в рабочее время: пн-пт 8:00-20:00, сб 8:00-15:00.' + (s ? '\n' + s : ''), handoff: true };
      }
      return null;
    },
    /* врачи */
    function (n) {
      for (var i = 0; i < SPEC.length; i++) {
        if (SPEC[i].rx.test(n)) { return specReply(SPEC[i]); }
      }
      return null;
    },
    function (n) {
      if (P('какие врачи|список врачей|врачи(?![а-я])|специалист|кто принимает|кто ведет|кто работает').test(n)) {
        var lines = [KB.doctorsIntro];
        KB.doctors.forEach(function (d) { lines.push('- ' + d.name + ', ' + d.spec); });
        lines.push(KB.doctorsOutro);
        return { text: lines.join('\n'), actions: [pageAction('vrachi.html', 'Все врачи и дни приёма'), bookAction('priem', 'Записаться к врачу')] };
      }
      return null;
    },
    /* цены, которых нет в базе */
    function (n) {
      if (P('массаж').test(n)) { return { text: 'Массаж в центре есть, но цены на массаж в моей базе нет. Уточните у администратора: 8 (888) 888-88-88.', handoff: true }; }
      if (P('косметолог|ботокс|пилинг|лазерн').test(n)) { return { text: 'Косметология в центре есть, но цен на неё в моей базе нет. Уточните у администратора: 8 (888) 888-88-88. Показания и результаты я не обсуждаю.', handoff: true }; }
      if (P('золушк').test(n)) { return { text: 'Про капельницу "Золушка": цены в прайсе нет, а перед процедурой нужна консультация врача. Уточните у администратора: 8 (888) 888-88-88.', handoff: true }; }
      return null;
    },
    /* цены по прайсу */
    function (n) {
      var r = priceReply(n);
      if (r && (HAS_PRICE.test(n) || r.text.split('\n').length <= 8)) { return r; }
      return null;
    },
    function (n) {
      if (HAS_PRICE.test(n)) {
        return {
          text: 'Этой услуги не нашлось в моём прайсе. Цены на все услуги, которые у меня есть, можно посмотреть на странице "Услуги и цены". Если услуги там нет, уточните у администратора: 8 (888) 888-88-88.',
          actions: [pageAction('uslugi.html', 'Услуги и цены')], handoff: true
        };
      }
      return null;
    },
    function (n) { if (P('демо|настоящ').test(n)) { return { text: KB.demoSite }; } return null; }
  ];

  function pickReply(n, q) {
    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i](n, q);
      if (r) { return r; }
    }
    return { text: KB.handoff, handoff: true, actions: [bookAction('', 'Оформить заявку')] };
  }

  function deliver(spec) {
    if (spec.start) { pending = null; startFlow(spec.start, true); return; }
    var text = spec.text;
    if (spec.handoff) {
      var s = statusLine();
      if (s && text.indexOf('Сейчас центр закрыт') === -1) { text += '\n' + s; }
    }
    say(text, { actions: spec.actions });
    if (spec.handoff) { addHandoffCard(); }
    pending = spec.offer || null;
  }

  /* ---------- сценарий заявки (демо) ---------- */
  function startFlow(opts, inLater) {
    var run = function () {
      pending = null;
      var type = opts.type === 'org' ? 'org' : 'booking';
      flow = { type: type, data: {}, step: '', consentCard: null };
      if (type === 'org') { flow.data.service = 'organizacii'; }
      if (opts.service) { flow.data.service = opts.service; }
      if (opts.address) { flow.data.address = opts.address; }
      if (opts.text) {
        var n = norm(opts.text);
        if (type === 'booking' && !flow.data.service) { var g = guessService(n); if (g) { flow.data.service = g; } }
        if (type === 'booking' && !flow.data.address) { var ad = guessAddress(n); if (ad && ad !== 'any') { flow.data.address = ad; } }
        if (type === 'booking' && !flow.data.day) {
          var dd = parseDay(n);
          if (dd.text) { flow.data.day = dd.text; }
        }
      }
      say('Хорошо, оформим заявку.');
      nextStep();
    };
    if (inLater) { run(); } else { later(run); }
  }

  var ORDER = {
    booking: ['service', 'address', 'day', 'consent', 'name', 'phone'],
    org: ['org', 'count', 'consent', 'contact', 'phone']
  };
  function nextStep() {
    var order = ORDER[flow.type];
    for (var i = 0; i < order.length; i++) {
      var f = order[i];
      if (f === 'consent') {
        if (consentGiven === true) { continue; }
        flow.step = 'consent';
        promptStep();
        return;
      }
      if (!flow.data[f]) { flow.step = f; promptStep(); return; }
    }
    flow.step = 'review';
    showReview();
  }
  function serviceChips() {
    return ['voditelskaya', 'bassein', 'medkniga', 'priem', 'uzi', 'ekg', 'stacionar', 'drugoe'].map(function (s) {
      return { label: MC.services[s], ask: MC.services[s] };
    });
  }
  function promptStep() {
    switch (flow.step) {
      case 'service':
        say('Что вам нужно? Выберите из списка или напишите, например: справка в бассейн.', { actions: serviceChips() });
        break;
      case 'address':
        say('Какой адрес вам удобнее: ул. Примерная, 1, ул. Образцовая, 2 или не важно? Какие услуги на каком адресе, уточнит администратор.', {
          actions: [{ label: 'ул. Примерная, 1', ask: 'ул. Примерная, 1' }, { label: 'ул. Образцовая, 2', ask: 'ул. Образцовая, 2' }, { label: 'Не важно', ask: 'Не важно' }]
        });
        break;
      case 'day':
        say('Какой день вам удобен? Пн-пт 8:00-20:00, сб 8:00-15:00, воскресенье - выходной. Время приёма подтвердит администратор.');
        break;
      case 'consent':
        addConsentCard();
        break;
      case 'name':
        say('Как к вам обращаться? Напишите только имя.');
        break;
      case 'phone':
        say('Какой телефон для связи? Например: +7 900 000-00-00.');
        break;
      case 'org':
        say('Как называется организация?');
        break;
      case 'count':
        say('Сколько сотрудников нужно осмотреть? Напишите число.');
        break;
      case 'contact':
        say('Как зовут контактное лицо?');
        break;
      default:
        break;
    }
  }

  function addConsentCard() {
    var c = el('div', 'card-chat is-consent');
    c.setAttribute('role', 'group');
    c.setAttribute('aria-label', 'Согласие на обработку данных');
    var head = el('div', 'card-head');
    head.appendChild(icon('shield-check'));
    var p = el('p');
    p.appendChild(document.createTextNode(KB.consentAsk + ' '));
    var a = el('a', null, 'Политика конфиденциальности');
    a.href = POLICY;
    a.target = '_blank';
    a.rel = 'noopener';
    p.appendChild(a);
    head.appendChild(p);
    c.appendChild(head);
    var row = el('div', 'btn-row');
    var yes = el('button', 'btn btn-primary btn-sm', 'Согласен');
    yes.type = 'button';
    var no = el('button', 'btn btn-secondary btn-sm', 'Не согласен');
    no.type = 'button';
    yes.addEventListener('click', function () { if (!busy) { decideConsent(true); } });
    no.addEventListener('click', function () { if (!busy) { decideConsent(false); } });
    row.appendChild(yes);
    row.appendChild(no);
    c.appendChild(row);
    flow.consentCard = c;
    addNode(c);
    hist.push({ role: 'assistant', content: KB.consentAsk + ' Политика конфиденциальности' });
  }
  function decideConsent(yes) {
    if (!flow || flow.step !== 'consent') { return; }
    var card = flow.consentCard;
    var label = yes ? 'Согласен' : 'Не согласен';
    addUser(label);
    hist.push({ role: 'user', content: label });
    applyConsent(yes, card);
  }
  function applyConsent(yes, card) {
    consentGiven = yes;
    later(function () {
      var status;
      if (yes) {
        status = el('div', 'msg-status');
        status.appendChild(icon('check'));
        status.appendChild(el('span', null, KB.consentYes));
      } else {
        status = el('div', 'msg-status');
        status.appendChild(icon('triangle-alert'));
        status.appendChild(el('span', null, KB.consentNo));
      }
      if (card && card.parentNode) { card.parentNode.replaceChild(status, card); }
      else { addNode(status); }
      flow.consentCard = null;
      hist.push({ role: 'assistant', content: yes ? KB.consentYes : KB.consentNo });
      if (yes) { nextStep(); }
      else { flow = null; consentGiven = null; }
    }, 250);
  }

  function extractPhone(q) {
    var m = /\+?\d[\d\s\-()]{8,}\d/.exec(q);
    if (!m || !MC.phoneOk(m[0])) { return null; }
    return { phone: MC.phoneFmt(m[0]), rest: (q.slice(0, m.index) + ' ' + q.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim() };
  }
  function cleanName(s) {
    s = s.replace(/^(меня зовут|меня|я|это|имя|зовут)\s+/i, '').replace(/^[\s,.\-]+|[\s,.!\-]+$/g, '').trim();
    if (!s || s.length > 30 || /\d/.test(s) || s.split(' ').length > 3) { return null; }
    if (!/^[A-Za-zА-Яа-яЁё\- ]+$/.test(s)) { return null; }
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function flowInput(q, n) {
    if (/^(отмена|отменить|стоп|хватит|не надо|не хочу|передумал|передумала|не буду)([ .,!]|$)/.test(n)) {
      flow = null;
      pending = null;
      later(function () { say('Хорошо, заявку не оформляю. Если понадобится, напишите "записаться".'); });
      return;
    }
    var step = flow.step;
    if (step === 'review') { reviewInput(n); return; }
    if (step === 'editpick') { editPick(n); return; }
    var free = (step === 'name' || step === 'phone' || step === 'org' || step === 'contact' || step === 'count' || step === 'day' || step === 'address' || step === 'service');
    if (free && /\?/.test(q)) {
      later(function () {
        var r = pickReply(n, q);
        if (r.text) { deliver(r); }
        pending = null;
        promptStep();
      });
      return;
    }
    later(function () { applyInput(q, n); });
  }

  function applyInput(q, n) {
    var step = flow.step;
    var d = flow.data;
    var ok = false;
    var errText = '';
    var ph;
    if (step === 'service') {
      var s = guessService(n);
      if (s) { d.service = s; ok = true; } else { errText = 'Не удалось определить услугу. Выберите из списка ниже или напишите, например: справка в бассейн.'; }
    } else if (step === 'address') {
      var a = guessAddress(n);
      if (a) { d.address = a; ok = true; } else { errText = 'Выберите адрес: ул. Примерная, 1, ул. Образцовая, 2 или не важно.'; }
    } else if (step === 'day') {
      var dd = parseDay(n);
      if (dd.text) { d.day = dd.text; ok = true; } else { errText = dd.err; }
    } else if (step === 'consent') {
      if (YES_RX.test(n)) { applyConsentTyped(true); return; }
      if (NO_RX.test(n)) { applyConsentTyped(false); return; }
      errText = 'Нужно ваше согласие на обработку имени и телефона. Нажмите "Согласен" или напишите "да" либо "нет".';
    } else if (step === 'name' || step === 'contact') {
      ph = extractPhone(q);
      var namePart = ph ? ph.rest : q;
      var nm = cleanName(namePart);
      if (nm) {
        if (step === 'name') { d.name = nm; } else { d.contact = nm; }
        if (ph) { d.phone = ph.phone; }
        ok = true;
      } else if (q.length > 25 || P('болит|боль|диагноз|анализ|температур|давлени').test(n)) {
        errText = KB.complaintStop + ' Напишите только имя.';
      } else {
        errText = 'Напишите, пожалуйста, только имя - как к вам обращаться.';
      }
    } else if (step === 'phone') {
      if (MC.phoneOk(q)) { d.phone = MC.phoneFmt(q); ok = true; }
      else if (/\d/.test(q)) { errText = 'Проверьте номер: нужно 11 цифр, например +7 900 000-00-00.'; }
      else { errText = 'Напишите номер телефона, например +7 900 000-00-00.'; }
    } else if (step === 'org') {
      var o = q.replace(/\s+/g, ' ').trim();
      if (o.length >= 2 && o.length <= 80) { d.org = o; ok = true; } else { errText = 'Напишите название организации.'; }
    } else if (step === 'count') {
      var m = /\d+/.exec(q);
      var cnt = m ? parseInt(m[0], 10) : 0;
      if (cnt >= 1 && cnt <= 100000) { d.count = String(cnt); ok = true; } else { errText = 'Напишите число сотрудников цифрами, например 25.'; }
    }
    if (!ok) { say(errText); return; }
    /* дополнительно: адрес и телефон из той же реплики */
    if (flow.type === 'booking') {
      if (!d.address) { var ad2 = guessAddress(n); if (ad2 && ad2 !== 'any' && step !== 'service') { d.address = ad2; } }
    }
    if (consentGiven === true) {
      if (!d.phone && step !== 'phone') { ph = extractPhone(q); if (ph) { d.phone = ph.phone; } }
      if (!d.name && flow.type === 'booking') {
        var mn = /меня зовут\s+([А-Яа-яЁё\-]+)/i.exec(q);
        if (mn) { d.name = cleanName(mn[1]) || ''; }
      }
    }
    nextStep();
  }
  function applyConsentTyped(yes) {
    var card = flow.consentCard;
    consentGiven = yes;
    var status = el('div', 'msg-status');
    status.appendChild(icon(yes ? 'check' : 'triangle-alert'));
    status.appendChild(el('span', null, yes ? KB.consentYes : KB.consentNo));
    if (card && card.parentNode) { card.parentNode.replaceChild(status, card); } else { addNode(status); }
    flow.consentCard = null;
    hist.push({ role: 'assistant', content: yes ? KB.consentYes : KB.consentNo });
    if (yes) { nextStep(); } else { flow = null; consentGiven = null; }
  }

  /* ---------- проверка заявки ---------- */
  function reviewRows() {
    var d = flow.data;
    if (flow.type === 'org') {
      return [
        ['Услуга', MC.services.organizacii], ['Организация', d.org], ['Сотрудников', d.count],
        ['Контактное лицо', d.contact], ['Телефон', d.phone]
      ];
    }
    return [
      ['Услуга', MC.services[d.service] || d.service], ['Адрес', ADDR[d.address] || d.address], ['День', d.day],
      ['Имя', d.name], ['Телефон', d.phone]
    ];
  }
  function showReview() {
    say('Проверьте, пожалуйста. Всё верно? Отправляю заявку администратору.');
    var c = el('div', 'card-chat');
    c.setAttribute('role', 'group');
    c.setAttribute('aria-label', 'Проверка заявки');
    var dl = el('dl');
    reviewRows().forEach(function (r) {
      var row = el('div');
      row.appendChild(el('dt', null, r[0]));
      row.appendChild(el('dd', null, r[1]));
      dl.appendChild(row);
    });
    c.appendChild(dl);
    var btns = el('div', 'btn-row');
    var yes = el('button', 'btn btn-primary btn-sm', 'Да, отправить');
    yes.type = 'button';
    var chg = el('button', 'btn btn-secondary btn-sm', 'Изменить');
    chg.type = 'button';
    yes.addEventListener('click', function () { if (!busy) { addUser('Да, отправить'); hist.push({ role: 'user', content: 'Да, отправить' }); submitFlow(); } });
    chg.addEventListener('click', function () { if (!busy) { addUser('Изменить'); hist.push({ role: 'user', content: 'Изменить' }); later(askEdit); } });
    btns.appendChild(yes);
    btns.appendChild(chg);
    c.appendChild(btns);
    addNode(c);
  }
  function reviewInput(n) {
    if (YES_RX.test(n)) { submitFlow(); return; }
    later(askEdit);
  }
  function editFields() {
    return flow.type === 'org'
      ? [['Организация', 'org'], ['Число сотрудников', 'count'], ['Контактное лицо', 'contact'], ['Телефон', 'phone']]
      : [['Услуга', 'service'], ['Адрес', 'address'], ['День', 'day'], ['Имя', 'name'], ['Телефон', 'phone']];
  }
  function askEdit() {
    flow.step = 'editpick';
    say('Что изменить?', { actions: editFields().map(function (f) { return { label: f[0], ask: f[0] }; }) });
  }
  function editPick(n) {
    var fields = editFields();
    var hit = null;
    fields.forEach(function (f) { if (norm(f[0]) === n || n.indexOf(norm(f[0]).slice(0, 5)) > -1) { hit = f[1]; } });
    later(function () {
      if (!hit) { say('Выберите, что изменить: ' + fields.map(function (f) { return f[0]; }).join(', ') + '.'); return; }
      flow.data[hit] = '';
      flow.step = hit;
      promptStep();
    });
  }

  function submitFlow() {
    var d = flow.data;
    var payload;
    if (flow.type === 'org') {
      payload = {
        'услуга': MC.services.organizacii, 'организация': d.org, 'сотрудников': d.count,
        'контакт': d.contact, 'телефон': d.phone, 'согласие': true, 'источник': 'чат-помощник (демо)'
      };
    } else {
      payload = {
        'услуга': MC.services[d.service] || d.service, 'адрес': ADDR[d.address] || d.address, 'день': d.day,
        'имя': d.name, 'телефон': d.phone, 'согласие': true, 'источник': 'чат-помощник (демо)'
      };
    }
    setBusy(true);
    var t = showTyping();
    MC.sendForm(payload, function () {
      if (t.parentNode) { t.parentNode.removeChild(t); }
      addSent();
      flow = null;
      pending = null;
      setBusy(false);
    }, function () {
      if (t.parentNode) { t.parentNode.removeChild(t); }
      setBusy(false);
      addError('Не получилось отправить заявку. Попробуйте ещё раз или позвоните: 8 (888) 888-88-88.', submitFlow);
    });
  }

  /* ---------- запуск ---------- */
  build();
})();
