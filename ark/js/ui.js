(function (A) {
  // ===================================================================================================
  //  THE INTERFACE: the window around the 3D room, the HUD, the side panels (search, bag, the desk with
  //  the Human Gate, the Reactor, artifact cards, the site menu) and the glue between the world and the
  //  reactor engine. User text only ever goes into the page through textContent.
  // ===================================================================================================
  const $ = id => document.getElementById(id), R = A.Reactor, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const el = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v); }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  };
  const UI = A.UI = { fast: 1 };
  const sleep = ms => new Promise(r => setTimeout(r, ms * UI.fast));
  const stage = $('stage'), canvas = $('c');
  const coarse = matchMedia('(pointer: coarse)').matches;

  // ---- what is kept in the browser ---------------------------------------------------------------------------------
  const KEY = 'ark-state';
  const STARTER = [
    ['Как пользоваться Ковчегом', 'Хранитель', 'справка начало читальный зал реактор', 'Возьми книги с полок, принеси в реактор вместе со своими мыслями и получи план. Решение принимает человек: у стола.'],
    ['Книга идей', 'Ты', 'идеи заметки мысли', 'Пустые страницы. Сюда ложатся твои идеи и результаты работы реактора.'],
    ['Правила Закона', 'Хранитель', 'закон этика правила', 'Реактор не помогает вредить людям, обманывать, следить и нарушать закон. Остальное он разбирает до основания.'],
  ];
  function load() {
    let s = null; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    s = Object.assign({ mine: [], bag: [], runs: [], out: null, seen: false }, s || {});
    if (!s.mine.length && !s.seeded) { s.mine = STARTER.map((b, i) => ({ id: 'm' + i, kind: 'note', title: b[0], author: b[1], tags: b[2], blurb: b[3], text: b[3], mineBook: true })); s.seeded = true; }
    return s;
  }
  let S = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

  // ---- the world ---------------------------------------------------------------------------------------------------------
  let toastT = 0;
  const toast = (text, ms) => { const t = $('toast'); t.textContent = text; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms || 2600); };
  UI.toast = toast;
  const W = A.W = A.World(canvas, {
    onPrompt: p => {
      const box = $('prompt'); box.hidden = !p;
      if (p) { $('pTitle').textContent = p.text; $('pSub').textContent = p.sub || ''; $('pAct').textContent = p.act || ''; }
      $('actBtn').classList.toggle('ready', !!p);
    },
    onInteract: p => interact(p),
    onZone: z => { $('where').textContent = z === 'hall' ? 'Библиотека «Ковчег»' : 'Главная комната'; },
    onLandscape: n => { $('landName').textContent = n; },
    hasOutput: () => !!S.out,
  });
  const catalog = A.makeCatalog(W.hallCount());
  const byId = new Map(); for (const it of catalog) byId.set(it.id, it); for (const it of A.news) byId.set(it.id, it);
  const rebuildMine = () => { for (const it of S.mine) byId.set(it.id, it); W.setMine(S.mine.filter(it => !S.bag.includes(it.id))); };
  W.setCatalog(catalog); rebuildMine();
  const bagItems = () => S.bag.map(id => byId.get(id)).filter(Boolean);
  const refreshBag = () => { $('bagN').textContent = S.bag.length; };
  for (const it of bagItems()) if (it.slot !== undefined) W.takeHall(it);
  refreshBag();

  const fit = () => W.resize(Math.max(2, stage.clientWidth), Math.max(2, stage.clientHeight));
  new ResizeObserver(fit).observe(stage); fit();
  $('landName').textContent = W.landscapeName();

  // ---- taking things ------------------------------------------------------------------------------------------------------
  function take(item, quiet) {
    if (S.bag.includes(item.id)) return false;
    S.bag.push(item.id);
    if (item.slot !== undefined) W.takeHall(item); else if (item.mineBook) W.removeMine(item);
    save(); refreshBag();
    if (!quiet) toast('В сумке: ' + item.title + ' · всего ' + S.bag.length);
    return true;
  }
  function putBack(item) {
    const i = S.bag.indexOf(item.id); if (i < 0) return false;
    S.bag.splice(i, 1);
    if (item.slot !== undefined) W.putHall(item); else if (item.mineBook) W.addMine(item);
    save(); refreshBag(); return true;
  }
  UI.take = take; UI.putBack = putBack;

  // ---- panels ------------------------------------------------------------------------------------------------------------------
  let panel = null;
  function openPanel(title, build, o) {
    o = o || {};
    if (panel) closePanel(true);
    panel = { title, onClose: o.onClose, kind: o.kind };
    $('shTitle').textContent = title; $('sheet').classList.toggle('wide', !!o.wide);
    const body = $('shBody'); body.textContent = ''; build(body);
    $('panel').hidden = false; W.enabled = false; $('prompt').hidden = true; $('hint').classList.add('hide');
    if (document.exitPointerLock) try { document.exitPointerLock(); } catch (e) {}
    if (o.view) o.view();
    const f = body.querySelector('[autofocus]'); if (f && !coarse) setTimeout(() => f.focus(), 30);
  }
  function closePanel(silent) {
    if (!panel) return;
    const p = panel; panel = null; $('panel').hidden = true; if (p.onClose) p.onClose();
    if (!silent) { W.enabled = true; canvas.focus({ preventScroll: true }); }
  }
  UI.openPanel = openPanel; UI.closePanel = closePanel;
  $('shClose').addEventListener('click', () => closePanel());
  addEventListener('keydown', e => {
    if (e.code === 'Escape' && !$('dive').hidden) { exitDive(); return; }
    if (e.code === 'Escape' && panel) { closePanel(); e.preventDefault(); return; }
    const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    if (!W.enabled) return;
    if (e.code === 'KeyB' || e.code === 'Tab') { e.preventDefault(); openBag(); }
    if (e.code === 'KeyM') openMenu();
  });
  $('bagBtn').addEventListener('click', () => openBag());
  $('menuBtn').addEventListener('click', () => openMenu());
  $('prompt').addEventListener('click', () => W.interact());
  $('prompt').addEventListener('keydown', e => { if (e.code === 'Enter' || e.code === 'Space') W.interact(); });
  $('actBtn').addEventListener('click', () => W.interact());
  $('fsBtn').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else if (stage.requestFullscreen) stage.requestFullscreen(); });
  canvas.addEventListener('pointerdown', () => $('hint').classList.add('hide'));

  const kindIcon = k => ({ book: '📖', news: '📰', note: '📝' })[k] || '📄';
  const stopProp = e => e.stopPropagation();
  const btn = (text, fn, cls, attrs) => el('button', Object.assign({ type: 'button', class: 'bt ' + (cls || ''), onclick: fn }, attrs || {}), text);

  // what happens when the person presses E at something
  function interact(p) {
    if (p.type === 'book') {
      if (take(p.item)) { W.hideBook(); }
    } else if (p.type === 'artifact') openArtifact(p.art);
    else if (p.type === 'reactor') openReactor();
    else if (p.type === 'desk') openDesk();
    else if (p.type === 'search') openSearch();
    else if (p.type === 'output') openResult();
  }

  // ---- an artifact card -----------------------------------------------------------------------------------------------------------
  function openArtifact(a) {
    openPanel(a.name, b => {
      b.append(el('p', { class: 'dim' }, 'Секция: ' + A.SECTIONS[a.sec]), el('p', null, a.text),
        el('div', { class: 'row' }, btn('Закрыть', () => closePanel()), btn('К остальным артефактам', () => { closePanel(); W.teleport('artifacts'); })));
    });
  }

  // ---- the bag ---------------------------------------------------------------------------------------------------------------------------
  function openBag() {
    openPanel('Сумка', b => {
      const draw = () => {
        b.textContent = '';
        const items = bagItems();
        b.append(el('p', { class: 'dim' }, items.length ? 'Всё, что ты несёшь. Можно положить обратно или отнести в реактор.' : 'Пока пусто. Возьми книги с полок (E) или найди через поиск.'));
        b.append(el('div', { class: 'row' }, btn('Открыть реактор', () => { closePanel(); W.teleport('reactor'); openReactor(); }, 'go'), items.length ? btn('Положить всё обратно', () => { for (const it of items.slice()) putBack(it); draw(); }) : null));
        for (const it of items.slice(0, 150)) b.append(el('div', { class: 'res' }, el('span', { class: 'ic' }, kindIcon(it.kind)), el('div', null, el('b', null, it.title), it.demo ? el('span', { class: 'badge' }, 'демо') : null),
          el('div', { class: 'btns' }, btn('Положить', () => { putBack(it); draw(); })), el('div', { class: 'meta' }, (it.author || '') + (it.blurb ? ' — ' + it.blurb : ''))));
        if (items.length > 150) b.append(el('p', { class: 'dim' }, '…и ещё ' + (items.length - 150) + '.'));
      };
      draw();
    });
  }

  // ---- search ------------------------------------------------------------------------------------------------------------------------------
  const searchIndex = () => catalog.concat(A.news, S.mine);
  function showOnShelf(it) {
    closePanel();
    if (it.slot !== undefined) {
      if (it.taken) { toast('Эта книга уже у тебя в сумке'); return; }
      const sl = W.B.hallSlots[it.slot];
      W.teleport('books', sl.c, -4.3); W.faceTo(sl.c, -6.4); W.player.pitch = clamp(Math.atan2(sl.y - 1.62, 1.65), -0.5, 0.9);
      W.showBook(it);
    } else if (it.mineBook) {
      const idx = W.mineItems.indexOf(it); if (idx < 0) { toast('Эта вещь у тебя в сумке'); return; }
      const sl = W.B.mineSlots[idx]; W.teleport('mine', clamp(sl.c, -6.2, -3.0), 2.3); W.faceTo(sl.c, 4.6); W.player.pitch = clamp(Math.atan2(sl.y - 1.62, 2.2), -0.5, 0.9);
      W.showBook(it);
    }
  }
  function openSearch(initial) {
    openPanel('Читальный зал · поиск', b => {
      let scope = 'all', last = [];
      const inp = el('input', { type: 'search', placeholder: 'Что ищем? Книгу, новость, свою заметку…', autofocus: true, 'aria-label': 'Поиск' });
      const chips = el('div', { class: 'chips' }), out = el('div'), info = el('p', { class: 'dim' });
      const scopes = [['all', 'Всё'], ['book', 'Книги'], ['news', 'Новости'], ['note', 'Мои заметки']];
      const draw = () => {
        chips.textContent = ''; for (const [k, n] of scopes) chips.append(el('button', { type: 'button', class: 'chip' + (scope === k ? ' on' : ''), onclick: () => { scope = k; run(); } }, n));
        out.textContent = '';
        const q = inp.value.trim();
        if (!q) { info.textContent = 'Начни печатать: результаты появляются сразу. Найденные книги можно показать на полке или забрать в сумку.'; return; }
        info.textContent = last.length ? 'Найдено: ' + last.length + (last.length === 40 ? '+' : '') : 'Ничего не найдено. Попробуй другое слово.';
        const books = last.filter(r => r.item.kind === 'book' && r.item.slot !== undefined && !r.item.taken);
        if (books.length > 1) out.append(el('div', { class: 'row' }, btn('В сумку все книги (' + Math.min(books.length, 109) + ')', () => { let n = 0; for (const r of books.slice(0, 109)) if (take(r.item, true)) n++; toast('В сумку добавлено книг: ' + n + ' · всего ' + S.bag.length); run(); }, 'go')));
        for (const r of last) {
          const it = r.item, inBag = S.bag.includes(it.id), onShelf = it.slot !== undefined || it.mineBook;
          out.append(el('div', { class: 'res' }, el('span', { class: 'ic' }, kindIcon(it.kind)),
            el('div', null, el('b', null, it.title), it.demo ? el('span', { class: 'badge' }, 'демо') : null, inBag ? el('span', { class: 'badge' }, 'в сумке') : null),
            el('div', { class: 'btns' }, onShelf && !inBag ? btn('На полке', () => showOnShelf(it)) : null, !inBag ? btn('В сумку', () => { take(it); run(); }) : btn('Убрать', () => { putBack(it); run(); })),
            el('div', { class: 'meta' }, (it.author || '') + ' · ' + (it.blurb || it.tags || '').slice(0, 120))));
        }
      };
      let timer = 0;
      const run = () => {
        const q = inp.value; last = A.search(q, scope, searchIndex(), 40);
        for (const src of A.sources) try { for (const it of (src.find(q) || [])) if (scope === 'all' || it.kind === scope) last.push({ item: it, score: 5 }); } catch (e) {}
        last = last.slice(0, 40); draw();
      };
      inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 60); });
      b.append(inp, el('div', { class: 'row' }, chips), info, out);
      if (initial) inp.value = initial; run();
    });
  }
  UI.openSearch = openSearch;

  // ---- the desk: the Human Gate ------------------------------------------------------------------------------------------------------------------
  const planBlock = P => el('div', { class: 'plan' }, P.horizons.map(h => [el('h4', null, h.name), el('ul', null, h.steps.map(s => el('li', null, s)))]),
    el('h4', null, 'Показатели'), el('ul', null, P.metrics.map(s => el('li', null, s))), el('h4', null, 'Проверить первым'), el('ul', null, P.stops.map(s => el('li', null, s))),
    P.law.length ? [el('h4', null, 'Закон'), el('ul', null, P.law.map(s => el('li', null, s)))] : null,
    P.assumed.length ? el('p', { class: 'dim' }, 'Допущено реактором, потому что не сказано: ' + P.assumed.map(a => ({ goal: 'цель', time: 'срок', money: 'деньги', people: 'люди' })[a]).join(', ') + '.') : null);
  function runCard(run, gate) {
    const w = run.winners[0], c = el('div', { class: 'card ' + (run.status === 'pending' ? 'win' : '') });
    c.append(el('h4', null, run.plan.title), el('small', null, new Date(run.ts).toLocaleString('ru-RU') + ' · ' + ({ pending: 'ждёт решения', approved: 'одобрено', done: 'выполнено', rejected: 'отклонено', returned: 'возвращено на доработку' })[run.status]), el('p', null, 'Цель: ' + run.plan.goal),
      el('p', { class: 'dim' }, 'Выжило ' + run.alive + ' из ' + (run.alive + run.dead) + ' вариантов. Сильнейшие: ' + run.winners.map(v => v.title + ' (' + v.score.toFixed(2) + ')').join('; ')));
    const det = el('details', null, el('summary', null, 'План и допущения'), planBlock(run.plan), el('h4', null, 'Что выдержал победитель'), el('ul', null, w.assumptions.map(a => el('li', null, a.text + ' — ' + (a.support < 0.2 ? 'опровергнуто' : a.support < 0.5 ? 'не подтверждено' : 'подтверждено')))));
    c.append(det);
    const row = el('div', { class: 'row' }); c.append(row);
    row.append(btn('Погрузиться в вариант', () => dive(run, 0)));
    if (gate && run.status === 'pending') {
      const note = el('textarea', { placeholder: 'Что поправить? Этот комментарий вернётся в реактор…', hidden: true });
      row.append(btn('Одобрить: запустить конвейер', () => approve(run), 'go'), btn('Вернуть на доработку', () => { if (note.hidden) { note.hidden = false; note.focus(); } else sendBack(run, note.value); }), btn('Отклонить', () => reject(run), 'no'));
      c.append(note);
    }
    return c;
  }
  function openDesk() {
    openPanel('Стол · Человеческий гейт', b => {
      const draw = () => {
        b.textContent = '';
        b.append(el('p', { class: 'dim' }, 'Здесь человек решает. Реактор сам ничего не запускает: план ждёт твоего слова. Одобришь — построится конвейер именно под эту задачу.'));
        const pend = S.runs.filter(r => r.status === 'pending'), rest = S.runs.filter(r => r.status !== 'pending');
        b.append(el('h3', null, 'Ждут решения (' + pend.length + ')'));
        if (!pend.length) b.append(el('p', { class: 'dim' }, 'Пока ничего. Загрузи что-нибудь в реактор.'), btn('К реактору', () => { closePanel(); W.teleport('reactor'); openReactor(); }));
        for (const r of pend) b.append(runCard(r, true));
        if (rest.length) { b.append(el('h3', null, 'Решено')); for (const r of rest.slice(0, 6)) b.append(runCard(r, false)); }
        UI.redrawDesk = draw;
      };
      draw();
    }, { wide: true, onClose: () => { UI.redrawDesk = null; } });
  }
  function approve(run) { run.status = 'approved'; save(); startConveyor(run); }
  function reject(run) { run.status = 'rejected'; const mem = R.loadMemory(); R.learn(mem, run, 2); R.saveMemory(mem); save(); toast('План отклонён. Реактор учтёт это'); if (UI.redrawDesk) UI.redrawDesk(); }
  function sendBack(run, note) {
    run.status = 'returned'; save();
    RX.items = (run.items || []).slice(); if (note.trim()) RX.items.push({ id: 'n' + Date.now(), kind: 'thought', title: 'Правка человека', text: note.trim() });
    RX.phase = 'load'; closePanel(); W.teleport('reactor'); openReactor();
    toast('План вернулся в реактор вместе с твоим комментарием');
  }

  // ---- the reactor panel --------------------------------------------------------------------------------------------------------------------------------
  const STAGE_LOOK = [[0x6fd3ff, 1.1], [0x7fe0b0, 1.0], [0xffe27a, 1.3], [0xff9a4a, 2.4], [0xff5a5a, 3.0], [0xd18bff, 1.6], [0x7aa8ff, 1.2], [0xffffff, 0.8], [0x6dffa0, 1.5]];
  const KIND_COLOR = { idea: 0xffd36a, thought: 0x9fd0ff, talk: 0xff9acb, scheme: 0x7fe0b0, drawing: 0xc59aff, dream: 0xa0a8ff, fantasy: 0xffa070, book: 0xd9b45a, note: 0xe8e0d0 };
  const RX = UI.RX = { items: [], kind: 'idea', includeBag: true, phase: 'load', stage: -1, log: [], verdicts: [], run: null, ask: null, answers: {}, sketch: null, redraw: null };
  const KIND_NAMES = Object.entries(R.KINDS).filter(([k]) => k !== 'book' && k !== 'note').map(([k, v]) => [k, v[0]]);
  const setStage = i => { RX.stage = i; const L = STAGE_LOOK[i] || STAGE_LOOK[0]; const Rx = W.B.reactor; Rx.setStage(i, L[0], L[1]); Rx.setLamps(i + 1); Rx.kick(0.5); redrawReactor(); };
  const rlog = (t, cls) => { RX.log.push({ t, cls }); if (RX.log.length > 40) RX.log.shift(); redrawReactor(); };
  function redrawReactor() { if (panel && panel.kind === 'reactor' && RX.redraw) { const body = $('shBody'), y = body.scrollTop; RX.redraw(body); body.scrollTop = y; } }
  function bagForReactor() { return bagItems().map(it => it.kind === 'book' ? { id: 'k' + it.id, kind: 'book', ref: it.id, title: it.title, text: it.blurb, tags: it.tags } : { id: 'k' + it.id, kind: 'note', title: it.title, text: it.text || it.blurb || it.title, tags: it.tags }); }
  function collectItems() { return RX.items.concat(RX.includeBag ? bagForReactor() : []); }

  function openReactor() {
    openPanel('Знаниевый Реактор', b => { RX.redraw = drawReactor; drawReactor(b); }, { wide: true, kind: 'reactor', view: reactorView, onClose: () => { RX.redraw = null; } });
  }
  UI.openReactor = openReactor;
  // the drawer covers the right side: turn a little so the reactor stays in view on the left
  function reactorView() { const P = W.player; if (Math.hypot(P.x, P.z + 0.6) > 5.5 || P.x < -1) W.teleport('reactor'); P.yaw = Math.atan2(-(0 - P.x), -(-0.6 - P.z)) - 0.3; P.pitch = W.camera.aspect < 1 ? -0.46 : -0.02; }   // (upright: the sheet is at the bottom, so the reactor goes up)
  function sketchPad(onSave) {
    const c = el('canvas', { class: 'sketch', width: 520, height: 130 }), g = c.getContext('2d'); g.fillStyle = '#0b121e'; g.fillRect(0, 0, 520, 130); g.strokeStyle = '#c59aff'; g.lineWidth = 3; g.lineCap = 'round';
    let down = false, ink = 0, last = null;
    const pt = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * 520 / r.width, (e.clientY - r.top) * 130 / r.height]; };
    c.addEventListener('pointerdown', e => { down = true; last = pt(e); c.setPointerCapture(e.pointerId); e.stopPropagation(); });
    c.addEventListener('pointermove', e => { if (!down) return; const p = pt(e); g.beginPath(); g.moveTo(last[0], last[1]); g.lineTo(p[0], p[1]); g.stroke(); ink += Math.hypot(p[0] - last[0], p[1] - last[1]); last = p; });
    c.addEventListener('pointerup', () => { down = false; });
    c.ink = () => ink; c.clear = () => { g.fillStyle = '#0b121e'; g.fillRect(0, 0, 520, 130); ink = 0; };
    return c;
  }
  function drawReactor(b) {
    b.textContent = '';
    const rail = el('div', { class: 'rail' }); R.STAGES.forEach((s, i) => rail.append(el('span', { class: RX.stage === i && RX.phase === 'running' ? 'on' : RX.stage >= i && RX.phase !== 'load' ? 'done' : '' }, s.name))); b.append(rail);
    if (RX.phase === 'load') return drawLoad(b);
    // running / done
    if (RX.log.length) b.append(el('div', { class: 'log' }, RX.log.slice(-9).map(l => el('div', { class: l.cls || '' }, l.t))));
    if (RX.ask) {
      b.append(el('h3', null, 'Реактор уточняет'));
      for (const q of RX.ask.questions) { const inp = el('input', { type: 'text', placeholder: q.ph, value: RX.answers[q.id] || '' }); inp.addEventListener('input', () => { RX.answers[q.id] = inp.value; }); b.append(el('div', { class: 'q' }, el('label', null, q.q), inp)); }
      b.append(el('div', { class: 'row' }, btn('Ответить', () => RX.ask.resolve(RX.answers), 'go'), btn('Пропустить: додумай сам', () => RX.ask.resolve({}), ''), el('span', { class: 'dim' }, 'Неотвеченное реактор допустит сам и честно это отметит.')));
      return;
    }
    if (RX.verdicts.length) { b.append(el('h3', null, 'Столкновение: критик · декомпозитор · закон')); for (const v of RX.verdicts.slice(-14)) b.append(el('div', { class: 'card ' + (v.dead ? 'dead' : '') }, el('b', null, v.title), el('br'), el('small', null, v.text))); }
    const run = RX.run;
    if (run && run.winners) {
      b.append(el('h3', null, 'Сильнейшие варианты'));
      run.winners.forEach((v, i) => b.append(el('div', { class: 'card win' }, el('h4', null, (i + 1) + '. ' + v.title + ' · ' + v.score.toFixed(2)), el('p', null, v.beats[0]), el('small', null, 'Критик ' + v.critic.toFixed(2) + ' · выживаемость ' + v.survival.toFixed(2) + ' · подходит ' + v.fit.toFixed(2)), el('div', { class: 'row' }, btn('Погрузиться', () => dive(run, i))))));
      b.append(el('p', { class: 'dim' }, 'Выжило ' + run.alive + ', отброшено ' + run.dead + '. Отброшенное — «порода»: ' + (run.ore && run.ore.length ? run.ore.map(o => '«' + o.text.slice(0, 40) + '…»').slice(0, 2).join(', ') : 'нечего выбрасывать') + '.'));
      if (run.gold && run.gold.length) { b.append(el('h3', null, 'Ценное из принесённого')); for (const g of run.gold.slice(0, 4)) b.append(el('p', { class: 'gold' }, '— ' + g.text)); }
    }
    if (run && run.plan) {
      b.append(el('h3', null, 'План'), planBlock(run.plan));
      if (run.selfcheck) b.append(el('p', { class: run.selfcheck.ok ? 'ok' : 'gold' }, run.selfcheck.ok ? 'Самопроверка: план полный.' : 'Самопроверка: реактор сам исправил — ' + run.selfcheck.patches.join(', ') + '.'));
    }
    if (run && run.stopped) { b.append(el('h3', null, 'Закон остановил реактор'), el('div', { class: 'card dead' }, run.stopped.rules.map(r => el('p', { class: 'bad' }, '— ' + r.text)), el('p', null, run.stopped.suggestion))); }
    if (RX.phase === 'done') b.append(el('div', { class: 'row' },
      run && run.plan ? btn('К столу: на решение человека', () => { closePanel(); W.teleport('desk'); openDesk(); }, 'go') : null,
      btn('Загрузить новое', () => { RX.phase = 'load'; RX.stage = -1; RX.log = []; RX.verdicts = []; RX.run = null; W.B.reactor.setStage(-1, 0x6fd3ff, 1); W.B.reactor.setLamps(0); drawReactor(b); }), btn('Закрыть', () => closePanel())));
  }
  function drawLoad(b) {
    const mem = R.loadMemory(), items = RX.items, bag = bagItems();
    b.append(el('p', { class: 'dim' }, 'Кладём в реактор всё: идеи, мысли, разговоры, схемы, рисунки, фантазии, сны и книги. Реактор уточнит, добавит из библиотеки, разгонит варианты, столкнёт их с критиком и законом и предложит план. Версия реактора: ' + mem.version.join('.') + ' · запусков: ' + mem.runs + '.'));
    b.append(el('h3', null, 'Положить в реактор'));
    const kind = el('select', { 'aria-label': 'Что это' }, KIND_NAMES.map(([k, n]) => el('option', { value: k, selected: k === RX.kind }, n)));
    const text = el('textarea', { placeholder: 'Расскажи как есть: что хочется, что мешает, что приснилось, о чём говорили…', autofocus: true });
    const sk = sketchPad(), skWrap = el('div', { hidden: RX.kind !== 'drawing' }, sk, el('div', { class: 'row' }, btn('Стереть', () => sk.clear()), el('span', { class: 'dim' }, 'Нарисуй и подпиши, что это, в поле выше.')));
    kind.addEventListener('change', () => { RX.kind = kind.value; skWrap.hidden = kind.value !== 'drawing'; });
    b.append(el('div', { class: 'row' }, kind), text, skWrap, el('div', { class: 'row' }, btn('Положить', () => {
      const t = text.value.trim(); if (!t) { toast('Напиши хотя бы несколько слов'); return; }
      const it = { id: 'u' + Date.now() + Math.random().toString(36).slice(2, 5), kind: kind.value, title: '', text: t };
      if (it.kind === 'drawing') it.text = t + (sk.ink() > 40 ? ' (нарисован набросок)' : '');
      RX.items.push(it); drawReactor(b);
    }, 'go')));
    b.append(el('h3', null, 'Загружено (' + items.length + ')'));
    if (!items.length) b.append(el('p', { class: 'dim' }, 'Пока ничего своего.'));
    items.forEach((it, i) => b.append(el('div', { class: 'res' }, el('span', { class: 'ic' }, '•'), el('div', null, el('b', null, R.KINDS[it.kind][0] + ': '), it.text.slice(0, 90)), el('div', { class: 'btns' }, btn('Убрать', () => { items.splice(i, 1); drawReactor(b); })), el('div', { class: 'meta' }, ''))));
    b.append(el('h3', null, 'Из сумки (' + bag.length + ')'));
    const chk = el('input', { type: 'checkbox' }); chk.checked = RX.includeBag; chk.addEventListener('change', () => { RX.includeBag = chk.checked; });
    b.append(el('label', { class: 'row' }, chk, bag.length ? 'Взять в реактор всё из сумки (' + bag.length + ')' : 'Сумка пуста: возьми книги в библиотеке, реактор любит читать'), el('div', { class: 'row' }, btn('Открыть сумку', () => { closePanel(); openBag(); })));
    const total = collectItems().length;
    b.append(el('div', { class: 'row' }, btn('Запустить реактор (' + total + ')', () => { if (!total) { toast('Реактору нечего перерабатывать'); return; } runFlow(); }, 'big go', { disabled: !total })));
  }

  // the whole run, stage by stage, with the 3D reactor following along
  async function runFlow() {
    if (RX.phase === 'running') return;
    const mem = R.loadMemory(), catalogAll = catalog.concat(S.mine.filter(m => m.kind === 'book'));
    RX.phase = 'running'; RX.log = []; RX.verdicts = []; RX.run = null; RX.answers = {}; RX.ask = null;
    const items = collectItems(), run = { id: 'r' + Date.now(), ts: Date.now(), items: items.filter(i => !i.ref) };
    // 1 intake: the things fly into the hopper
    setStage(0);
    const kinds = {}; items.forEach(i => { kinds[R.KINDS[i.kind][0]] = (kinds[R.KINDS[i.kind][0]] || 0) + 1; });
    rlog('Приём: ' + items.length + ' (' + Object.entries(kinds).map(([k, n]) => k.toLowerCase() + ' ' + n).join(', ') + ')');
    const from = new THREE.Vector3(W.player.x, 1.3, W.player.z), cols = items.slice(0, 16).map(i => KIND_COLOR[i.kind] || 0xffffff);
    await new Promise(res => W.B.reactor.feed(cols, from, res));
    await sleep(500);
    run.docs = R.intake(items);
    // 2 clarify
    setStage(1);
    const c1 = R.clarify(run.docs, {});
    let answers = {};
    if (c1.questions.length) { rlog('Не хватает: ' + c1.questions.map(q => ({ goal: 'цели', time: 'срока', money: 'ресурсов', people: 'людей' })[q.id]).join(', ') + '. Реактор спрашивает.', 'gold'); RX.ask = { questions: c1.questions }; redrawReactor(); answers = await new Promise(res => { RX.ask.resolve = res; }); RX.ask = null; }
    run.frame = R.clarify(run.docs, answers).frame; run.questions = c1.questions;
    rlog('Цель: ' + run.frame.goal + (run.frame.assumed.length ? ' · допущено: ' + run.frame.assumed.map(a => ({ goal: 'цель', time: 'срок', money: 'деньги', people: 'люди' })[a]).join(', ') : ''));
    await sleep(700);
    // 3 gather
    setStage(2);
    run.gathered = R.gather(run.docs, run.frame, catalogAll);
    rlog('Добор из библиотеки (' + run.gathered.queries.slice(0, 4).join(', ') + '): ' + run.gathered.added.map(b => '«' + b.title + '»').join(', '));
    run.allDocs = run.docs.concat(R.intake(run.gathered.added.map(bk => ({ id: 'g' + bk.id, kind: 'book', ref: bk.id, title: bk.title, text: bk.blurb, tags: bk.tags, added: true }))));
    run.frame.flags.sources = run.frame.flags.books + run.gathered.added.length;
    await sleep(900);
    // 4 spin
    setStage(3);
    run.variants = R.spin(run.frame, run.allDocs, mem);
    rlog('Разгон: ' + run.variants.length + ' вариантов (' + R.STRATS.length + ' стратегий × ' + (run.variants.length / R.STRATS.length) + ' главных понятия)');
    await sleep(1200);
    // 5 collide
    setStage(4);
    const col = R.collide(run.variants, run.docs, run.frame, mem); run.lawHits = col.lawHits;
    for (const v of run.variants.slice(0, 27)) {
      const dead = v.law.veto || !!v.fell || v.survival < 0.3;
      RX.verdicts.push({ dead, title: v.title, text: (v.law.veto ? 'Закон: ' + v.law.hits.join(', ') + ' — запрещено. ' : '') + (v.fell ? 'Декомпозитор: ' + v.fell + '. ' : '') + (v.objections[0] ? 'Критик: ' + v.objections[0] + '.' : 'Критик: возражений нет.') + ' Выживаемость ' + v.survival.toFixed(2) });
      if (dead) W.B.reactor.kick(0.9);
      redrawReactor(); await sleep(70);
    }
    await sleep(500);
    // 6 select
    setStage(5);
    const sel = R.select(run.variants, run.allDocs, run.frame); Object.assign(run, sel);
    run.alive = sel.alive; run.dead = sel.dead;
    rlog('Отбор: выжило ' + sel.alive + ', отброшено ' + sel.dead + (sel.weak ? ' · сильных нет, взято самое устойчивое' : ''), sel.alive ? 'ok' : 'bad');
    RX.run = run; redrawReactor();
    await sleep(1000);
    if (!run.winners.length) { run.stopped = { rules: R.LAW.filter(r => run.lawHits.some(h => h.id === r.id)), suggestion: 'Переформулируй цель так, чтобы никому не вредить и никого не обманывать: реактор сможет помочь.' }; W.B.reactor.setStage(4, 0xff3030, 0.5); rlog('Закон остановил реактор.', 'bad'); RX.phase = 'done'; redrawReactor(); return; }
    // 7 plan
    setStage(6);
    run.plan = R.plan(run.winners[0], run.frame, col, sel); run.selfcheck = R.selfCheck(run.plan);
    run.conveyor = R.conveyor(run.plan); run.package = R.packageText(run.plan, run.conveyor, sel, run.frame);
    rlog('План готов: ' + run.plan.title + (run.selfcheck.ok ? '' : ' · самоисправлений: ' + run.selfcheck.patches.length), 'ok');
    RX.run = run; redrawReactor(); await sleep(900);
    // 8 gate: it waits for a person
    setStage(7);
    const slim = slimRun(run); slim.status = 'pending'; S.runs.unshift(slim); if (S.runs.length > 12) S.runs.length = 12; save();
    run.slim = slim;
    rlog('План ждёт на столе: Человеческий гейт. Без твоего слова конвейер не включится.', 'gold');
    RX.phase = 'done'; redrawReactor();
    toast('План ждёт решения у стола: Человеческий гейт', 3600);
  }
  UI.runFlow = runFlow;
  // the run without functions (to keep it in the browser): the strategies' code stays in the engine
  function slimRun(run) {
    const sv = v => ({ id: v.id, sid: v.sid, focus: v.focus, title: v.title, score: v.score, fit: v.fit, critic: v.critic, survival: v.survival, beats: v.beats, objections: v.objections, law: v.law, strat: { name: v.strat.name, upside: v.strat.upside, effort: v.strat.effort }, assumptions: v.assumptions.map(a => ({ id: a.id, text: a.text, w: a.w, core: a.core, support: a.support })) });
    return { id: run.id, ts: run.ts, items: run.items, frame: { goal: run.frame.goal, time: run.frame.time, audience: run.frame.audience, assumed: run.frame.assumed, kw: run.frame.kw }, winners: run.winners.map(sv), alive: run.alive, dead: run.dead, gold: (run.gold || []).map(g => ({ text: g.text })), ore: (run.ore || []).map(g => ({ text: g.text })), plan: run.plan, conveyor: run.conveyor, package: run.package, selfcheck: run.selfcheck };
  }

  // ---- the conveyor: only after the Human Gate says yes --------------------------------------------------------------------------------------------------------
  async function startConveyor(run) {
    closePanel(); W.teleport('conveyor');
    const Rx = W.B.reactor, st = run.conveyor.stations, bar = $('beltBar');
    Rx.setStations(st.map(s => s.name)); Rx.setStage(8, 0x6dffa0, 1.5); Rx.setLamps(9); Rx.clearCard(); S.out = null; Rx.beltRun = 1;
    bar.hidden = false; $('beltName').textContent = 'Конвейер ' + run.conveyor.name; $('beltFill').style.width = '0%';
    toast('Конвейер ' + run.conveyor.name + ' включён', 2600);
    let t = 0;
    for (let i = 0; i < st.length; i++) {
      const target = st.length > 1 ? 0.18 + 0.64 * i / (st.length - 1) : 0.5;
      const t0 = t, dur = 1400 * UI.fast, start = performance.now();
      await new Promise(res => { const f = () => { const k = Math.min(1, (performance.now() - start) / dur); t = t0 + (target - t0) * k; Rx.put(t); if (k < 1) setTimeout(f, 16); else res(); }; f(); });
      Rx.lightStation(i, 1); Rx.kick(0.4);
      $('beltFill').style.width = Math.round((i + 1) / st.length * 100) + '%';
      toast((i + 1) + '. ' + st[i].name + (st[i].check ? ' — готово' : ' — нужна доработка'), 1800);
      await sleep(900);
    }
    const t1 = performance.now(), d1 = 1400 * UI.fast; await new Promise(res => { const f = () => { const k = Math.min(1, (performance.now() - t1) / d1); Rx.put(t + (1 - t) * k); if (k < 1) setTimeout(f, 16); else res(); }; f(); });
    Rx.beltRun = 0; Rx.setStage(8, 0x6dffa0, 0.8);
    Rx.printCard(run.plan.title, run.package.split('\n').filter(Boolean).slice(0, 14));
    // the result becomes a book on the shelf of the person's own library
    const book = { id: 'm' + Date.now(), kind: 'note', mineBook: true, title: 'Решение: ' + run.plan.title.replace(/·/g, '—'), author: 'Реактор', tags: 'решение план ' + run.plan.focus + ' ' + run.plan.strategy.toLowerCase(), blurb: run.plan.goal, text: run.package };
    S.mine.push(book); byId.set(book.id, book); W.addMine(book);
    run.status = 'done'; S.out = run.id; save();
    bar.hidden = true; $('beltFill').style.width = '100%';
    toast('Готово. Результат лежит у конвейера: подойди и нажми E', 4200);
  }
  UI.startConveyor = startConveyor;

  // the result at the end of the line: read, rate, and the reactor learns
  function openResult() {
    const run = S.runs.find(r => r.id === S.out); if (!run) return;
    openPanel('Результат реактора', b => {
      let rating = 0;
      b.append(el('h3', null, run.plan.title));
      b.append(el('p', { class: 'dim' }, 'Копия лежит в «Моей библиотеке». Оцени результат: реактор запомнит, какие стратегии работают для таких задач, и станет точнее.'));
      const stars = el('div', { class: 'stars' }), msg = el('p');
      for (let i = 1; i <= 5; i++) stars.append(el('button', { type: 'button', 'aria-label': i + ' из 5', onclick: () => { rating = i; [...stars.children].forEach((s, k) => s.classList.toggle('on', k < i)); } }, '★'));
      b.append(stars, msg, el('div', { class: 'row' }, btn('Оценить', () => {
        if (!rating) { toast('Выбери оценку от 1 до 5'); return; }
        const mem = R.loadMemory(), line = R.learn(mem, run, rating); R.saveMemory(mem); S.out = null; save(); W.B.reactor.clearCard();
        msg.textContent = line; msg.className = 'ok';
      }, 'go'), btn('Закрыть', () => closePanel()), btn('Скопировать текст', () => { try { navigator.clipboard.writeText(run.package); toast('Скопировано'); } catch (e) { toast('Не удалось скопировать'); } })),
        el('pre', { class: 'log', style: 'white-space:pre-wrap;max-height:none' }, run.package));
    }, { wide: true });
  }

  // ---- "dive": walk through a variant day by day ---------------------------------------------------------------------------------------------------------------
  let diveRaf = 0;
  function dive(run, idx) {
    const v = run.winners[idx], d = $('dive'), cv = $('diveC'), g = cv.getContext('2d');
    d.hidden = false; $('dvTitle').textContent = 'Вариант: ' + v.title; const list = $('dvList'); list.textContent = '';
    const rr = A.rng(v.title.length * 131 + 7), days = [1, 3, 7, 14, 30, 60, 90];
    const events = [];
    v.beats.forEach((t, i) => events.push([days[i * 2] || 1, t]));
    for (const a of v.assumptions) events.push([days[2 + events.length % 4], 'Проверка допущения «' + a.text + '»: ' + (rr() < a.support ? 'подтвердилось.' : 'не подтвердилось — план меняется.')]);
    events.sort((x, y) => x[0] - y[0]);
    events.forEach(e => list.append(el('li', null, el('b', null, 'День ' + e[0] + '. '), e[1])));
    events.push([90, 'Итог по показателю «' + (run.plan.metrics[0] || 'результат') + '»: ' + (rr() < v.survival ? 'движение есть, продолжаем.' : 'нужно пересмотреть курс.')]);
    list.append(el('li', null, el('b', null, 'День 90. '), events[events.length - 1][1]));
    [...list.children].forEach((li, i) => setTimeout(() => li.classList.add('on'), (500 + i * 900) * UI.fast));
    const w = cv.width = stage.clientWidth, h = cv.height = stage.clientHeight, N = 160, st = [];
    for (let i = 0; i < N; i++) st.push({ a: Math.random() * 6.283, r: Math.random(), s: 0.002 + Math.random() * 0.006 });
    const col = '#' + (STAGE_LOOK[idx + 3] || STAGE_LOOK[3])[0].toString(16).padStart(6, '0');
    const frame = () => { g.fillStyle = 'rgba(2,3,10,.28)'; g.fillRect(0, 0, w, h); g.fillStyle = col; for (const s of st) { s.r += s.s * (1 + s.r * 3); if (s.r > 1.2) { s.r = 0.02; s.a = Math.random() * 6.283; } const x = w / 2 + Math.cos(s.a) * s.r * w * 0.6, y = h / 2 + Math.sin(s.a) * s.r * h * 0.6; g.globalAlpha = Math.min(1, s.r * 1.4); g.fillRect(x, y, 1 + s.r * 3, 1 + s.r * 3); } g.globalAlpha = 1; diveRaf = requestAnimationFrame(frame); };
    frame(); $('dvExit').focus();
  }
  function exitDive() { cancelAnimationFrame(diveRaf); $('dive').hidden = true; }
  $('dvExit').addEventListener('click', exitDive);
  UI.dive = dive;

  // ---- the site menu: the same rooms as links ---------------------------------------------------------------------------------------------------------------------
  function go(spot, panelFn) { closePanel(); W.teleport(spot); if (panelFn) panelFn(); }
  function openMenu() {
    openPanel('Меню сайта', b => {
      const mem = R.loadMemory();
      const item = (title, sub, fn) => el('button', { type: 'button', onclick: fn }, title, el('small', null, sub));
      b.append(el('h3', null, 'Куда пойти'),
        el('div', { class: 'lv' },
          item('Главная комната', 'панорамные окна, стол, реактор', () => go('room')),
          item('Знаниевый Реактор', 'загрузить идеи и книги, получить план', () => go('reactor', openReactor)),
          item('Стол · Человеческий гейт', 'решить судьбу плана: ' + S.runs.filter(r => r.status === 'pending').length + ' ждут', () => go('desk', openDesk)),
          item('Моя библиотека', 'твои заметки и результаты реактора', () => go('mine')),
          item('Библиотека «Ковчег»', 'книги слева, артефакты справа', () => go('hall')),
          item('Читальный зал · поиск', 'мгновенно найти книгу, новость, заметку', () => go('search', openSearch)),
          item('Артефакты', 'глобус, микроскоп, телескоп, лупа, инструменты, находки, камни', () => go('artifacts'))),
        el('h3', null, 'Окружение'),
        el('div', { class: 'lv' }, item('Сменить пейзаж за окном', 'сейчас: ' + W.landscapeName() + ' (клавиша L)', () => { W.nextLandscape(); toast('Пейзаж меняется…'); }),
          item('Как здесь всё устроено', 'короткая справка', () => openHelp())),
        el('h3', null, 'Реактор запомнил'), el('div', { class: 'log' }, mem.log.slice(0, 6).map(l => el('div', null, l.text))),
        el('div', { class: 'row' }, btn('Сбросить мои данные', () => { if (confirm('Стереть сумку, личную библиотеку, решения и обучение реактора?')) { try { localStorage.removeItem(KEY); localStorage.removeItem('ark-reactor'); } catch (e) {} location.reload(); } }, 'no')));
    });
  }
  function openHelp() {
    openPanel('Как здесь всё устроено', b => {
      b.append(el('p', null, 'Это библиотека-ковчег: место, где собирают знания, и реактор, который превращает собранное в план.'),
        el('h3', null, 'Что делать'), el('div', { class: 'plan' }, el('ul', null,
          el('li', null, 'Ходить: W A S D или стрелки, осматриваться мышью (на телефоне: джойстик слева и перетаскивание по экрану).'),
          el('li', null, 'Подойти к стеллажу у двери: он отъедет, и откроется библиотека.'),
          el('li', null, 'Слева книги, справа артефакты. E — взять книгу или осмотреть вещь.'),
          el('li', null, 'У входа в зал — поиск: книги, новости и твои заметки находятся сразу.'),
          el('li', null, 'Реактор в главной комнате: положи идеи, мысли, сны и книги, и он предложит план.'),
          el('li', null, 'План ждёт у стола: решает человек. Одобрил — запускается конвейер, собранный под эту задачу.'))),
        el('p', { class: 'dim' }, 'Новости в поиске пока демонстрационные: настоящий источник не подключён. Всё остальное работает у тебя в браузере.'),
        el('div', { class: 'row' }, btn('Понятно', () => closePanel(), 'go')));
    });
    S.seen = true; save();
  }

  // ---- touch controls: a joystick and an action button -------------------------------------------------------------------------------------------------------------
  if (coarse) {
    $('joy').hidden = false; $('actBtn').hidden = false;
    const joy = $('joy'), knob = $('joyKnob'); let jid = null, ox = 0, oy = 0;
    joy.addEventListener('pointerdown', e => { jid = e.pointerId; const r = joy.getBoundingClientRect(); ox = r.left + r.width / 2; oy = r.top + r.height / 2; joy.setPointerCapture(e.pointerId); e.preventDefault(); upd(e); });
    const upd = e => { let dx = (e.clientX - ox) / 50, dy = (e.clientY - oy) / 50; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; } W.joy.x = Math.abs(dx) < 0.12 ? 0 : dx; W.joy.y = Math.abs(dy) < 0.12 ? 0 : dy; knob.style.transform = 'translate(' + dx * 34 + 'px,' + dy * 34 + 'px)'; };
    joy.addEventListener('pointermove', e => { if (e.pointerId === jid) upd(e); });
    const end = e => { if (e.pointerId === jid) { jid = null; W.joy.x = W.joy.y = 0; knob.style.transform = ''; } };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
    $('hint').hidden = true;
  }

  // ---- start ---------------------------------------------------------------------------------------------------------------------------------------------------------------
  UI.S = () => S; UI.openBag = openBag; UI.openMenu = openMenu; UI.openDesk = openDesk; UI.openResult = openResult; UI.openArtifact = openArtifact; UI.showOnShelf = showOnShelf; UI.byId = byId; UI.catalog = catalog; UI.openHelp = openHelp;
  window.__ark = { W, A, UI };
  setTimeout(() => $('load').classList.add('off'), 150);
  $('landName').textContent = W.landscapeName();
  { const m = /[?&]land=(\d+)/.exec(location.search); if (m) W.setLandscape(+m[1]); }
  if (!/[?&]manual/.test(location.search)) { W.start(); if (!S.seen) setTimeout(openHelp, 800); }
})(globalThis.Ark);
