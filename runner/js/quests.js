(function (R) {
  // ===================================================================================================
  //  DAILY QUESTS (the runner): three goals a day, the same for everyone on that date, a new set at
  //  midnight. Each pays stars; all three in a day pay a bonus. Stars buy things in the wardrobe.
  //  The game reports what happens (on('cat'), on('ring'), on('jump', 12.4) ...); a quest counts its
  //  event, or keeps the best value for "max" goals. Kept in the browser (localStorage).
  // ===================================================================================================
  const POOL = [
    { id: 'cats', ev: 'cat', goals: [2, 4], stars: [1, 2], text: n => 'Поймай котов: ' + n },
    { id: 'combo', ev: 'combo', max: true, goals: [2, 3], stars: [2, 3], text: n => 'Поймай кота с комбо ×' + n },
    { id: 'nightcat', ev: 'catDark', goals: [1, 2], stars: [2, 3], text: n => n > 1 ? 'Поймай котов в темноте (вечер или ночь): ' + n : 'Поймай кота в темноте (вечер или ночь)' },
    { id: 'rings', ev: 'ring', goals: [3, 6], stars: [2, 3], text: n => 'Пролети сквозь кольца: ' + n },
    { id: 'rings2', ev: 'rings2', goals: [1, 2], stars: [3, 4], text: n => n > 1 ? 'Два кольца за один полёт: ' + n + ' раза' : 'Два кольца за один полёт' },
    { id: 'jump', ev: 'jump', max: true, goals: [11, 14], stars: [2, 3], unit: ' м', text: n => 'Прыжок дальше ' + n + ' м' },
    { id: 'chain', ev: 'chain', max: true, goals: [3, 4], stars: [2, 3], text: n => 'Цепочка трюков ×' + n },
    { id: 'bar', ev: 'trick:bar', goals: [2, 4], stars: [1, 2], text: n => 'Проскочи подкатом под шлагбаумом: ' + n },
    { id: 'wall', ev: 'trick:wall', goals: [2, 4], stars: [2, 3], text: n => 'Оттолкнись от стены: ' + n },
    { id: 'flip', ev: 'trick:flip', goals: [3, 6], stars: [1, 2], text: n => 'Сальто: ' + n },
    { id: 'pigeons', ev: 'trick:pigeons', goals: [2, 4], stars: [1, 2], text: n => 'Разгони стаи голубей: ' + n },
    { id: 'gallop', ev: 'gallop', goals: [600, 1200], stars: [1, 2], unit: ' м', text: n => 'Пробеги галопом ' + n + ' м' },
    { id: 'bones', ev: 'bones', goals: [40, 90], stars: [1, 2], text: n => 'Собери косточки: ' + n },
    { id: 'places', ev: 'place', goals: [3, 4], stars: [2, 3], text: n => 'Побывай в разных местах (гаражи, паркур, фонтан, парк): ' + n },
    { id: 'launch', ev: 'launch', goals: [2, 4], stars: [1, 2], text: n => 'Взлети с трамплина на гаражах: ' + n },
    { id: 'bark', ev: 'bark', goals: [3, 6], stars: [1, 1], text: n => 'Облай кота: ' + n },
  ];
  const byId = Object.fromEntries(POOL.map(q => [q.id, q]));
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

  class Quests {
    constructor() {
      this.stars = 0; this.total = 0; this.onDone = null; this.onChange = null;
      let s = {};
      try { s = JSON.parse(localStorage.getItem('runner-quests') || '{}'); } catch (e) {}
      this.stars = s.stars || 0; this.total = s.total || 0;
      this.gift = !s.seen;              // the first time: a welcome present
      if (this.gift) this.stars += 3;
      if (s.day === today() && s.list) { this.day = s.day; this.list = s.list; this.rerolled = !!s.rerolled; this.bonus = !!s.bonus; this.places = s.places || []; }
      else this.newDay();
      this.save();
    }
    newDay() {
      this.day = today(); this.rerolled = false; this.bonus = false; this.places = [];
      const rnd = R.rng(hash(this.day)), ids = POOL.map(q => q.id), list = [];
      while (list.length < 3) {
        const id = ids.splice(Math.floor(rnd() * ids.length), 1)[0], lvl = list.length === 2 ? 1 : rnd() < 0.5 ? 0 : 1;
        list.push(this.make(id, lvl));
      }
      this.list = list;
    }
    make(id, lvl) { const q = byId[id]; return { id, goal: q.goals[lvl], stars: q.stars[lvl], n: 0, done: false }; }
    save() {
      try { localStorage.setItem('runner-quests', JSON.stringify({ seen: true, stars: this.stars, total: this.total, day: this.day, list: this.list, rerolled: this.rerolled, bonus: this.bonus, places: this.places })); } catch (e) {}
    }
    text(q) { return byId[q.id].text(q.goal); }
    progress(q) { const d = byId[q.id]; return Math.min(q.n, q.goal) + (d.unit ? '' : '') + ' / ' + q.goal + (d.unit || ''); }
    spend(n) { if (this.stars < n) return false; this.stars -= n; this.save(); if (this.onChange) this.onChange(); return true; }
    // one quest of today can be swapped for another, once a day
    reroll(i) {
      if (this.rerolled || !this.list[i] || this.list[i].done) return false;
      const used = new Set(this.list.map(q => q.id)), free = POOL.filter(q => !used.has(q.id));
      const pick = free[Math.floor(Math.random() * free.length)];
      this.list[i] = this.make(pick.id, Math.random() < 0.5 ? 0 : 1);
      this.rerolled = true; this.save();
      if (this.onChange) this.onChange();
      return true;
    }
    // the game reports an event; v: how many (or the value, for "max" quests)
    on(ev, v, extra) {
      if (this.day !== today()) { this.newDay(); this.save(); }
      if (v === undefined) v = 1;
      if (ev === 'place') {                     // distinct places only
        if (this.places.includes(extra)) return;
        this.places.push(extra);
        v = 1;
      }
      let changed = false;
      for (const q of this.list) {
        const d = byId[q.id];
        if (q.done || d.ev !== ev) continue;
        const before = q.n;
        q.n = d.max ? Math.max(q.n, v) : q.n + v;
        if (d.unit) q.n = Math.round(q.n * 10) / 10;
        if (q.n !== before) changed = true;
        if (q.n >= q.goal) {
          q.done = true; this.stars += q.stars; this.total++;
          if (this.onDone) this.onDone(q, false);
        }
      }
      if (!this.bonus && this.list.every(q => q.done)) {
        this.bonus = true; this.stars += 2;
        if (this.onDone) this.onDone(null, true);
      }
      if (changed) { this.save(); if (this.onChange) this.onChange(); }
    }
  }
  Quests.POOL = POOL;
  R.Quests = Quests;

  // ---- the panel: today's quests and the wardrobe ---------------------------------------------------
  R.QuestPanel = class {
    constructor(ctx, quests, wardrobe) {
      this.ctx = ctx; this.q = quests; this.w = wardrobe;
      this.btn = document.getElementById('questBtn'); this.box = document.getElementById('quests');
      this.btn.hidden = false;
      this.btn.addEventListener('click', () => this.toggle(true));
      this.box.querySelector('.close').addEventListener('click', () => this.toggle(false));
      for (const b of this.box.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { this.tab = b.dataset.tab; this.render(); });
      addEventListener('keydown', e => { if (e.code === 'KeyJ' && !e.repeat) this.toggle(!this.open); else if (e.code === 'Escape' && this.open) this.toggle(false); });
      this.tab = 'quests'; this.open = false;
      quests.onChange = () => this.refresh();
      this.refresh();
    }
    refresh() {
      const left = this.q.list.filter(q => !q.done).length;
      this.btn.querySelector('.stars').textContent = this.q.stars;
      this.btn.querySelector('.left').textContent = left ? left + ' ' + (left === 1 ? 'задание' : 'задания') : 'всё сделано';
      if (this.open) this.render();
    }
    toggle(on) {
      if (this.ctx.map && this.ctx.map.open) this.ctx.map.toggle(false);
      this.open = on; this.box.hidden = !on; this.ctx.paused = on;
      if (on) this.render();
    }
    render() {
      for (const b of this.box.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === this.tab);
      this.box.querySelector('.bal').textContent = this.q.stars;
      const body = this.box.querySelector('.body');
      body.innerHTML = '';
      if (this.tab === 'quests') {
        if (this.q.gift) { body.insertAdjacentHTML('beforeend', '<p class="gift">Подарок для начала: 3 ★ — загляни в гардероб!</p>'); this.q.gift = false; }
        this.q.list.forEach((q, i) => {
          const d = Quests.POOL.find(p => p.id === q.id), pct = Math.min(1, q.n / q.goal);
          const card = document.createElement('div'); card.className = 'quest' + (q.done ? ' done' : '');
          card.innerHTML = `<div class="t"><b></b><span class="r">${'★'.repeat(q.stars)}</span></div><div class="bar"><i style="transform:scaleX(${pct.toFixed(3)})"></i></div><div class="p"><span>${q.done ? 'готово!' : Math.min(q.n, q.goal) + ' / ' + q.goal + (d.unit || '')}</span></div>`;
          card.querySelector('b').textContent = this.q.text(q);
          if (!q.done && !this.q.rerolled) {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'reroll'; b.textContent = 'другое';
            b.title = 'Заменить это задание (раз в день)';
            b.addEventListener('click', () => this.q.reroll(i));
            card.querySelector('.p').appendChild(b);
          }
          body.appendChild(card);
        });
        body.insertAdjacentHTML('beforeend', `<p class="note">${this.q.bonus ? 'Все задания дня выполнены: +2 ★ бонус получен.' : 'Все три за день — ещё +2 ★.'} Новые задания — завтра.</p>`);
      } else {
        for (const [slot, name] of R.Wardrobe.SLOTS) {
          const sec = document.createElement('div'); sec.className = 'slot';
          sec.innerHTML = `<h3>${name}</h3><div class="items"></div>`;
          for (const it of R.Wardrobe.ITEMS.filter(i => i.slot === slot)) {
            const own = this.w.has(it.id), worn = this.w.worn[slot] === it.id, b = document.createElement('button');
            b.type = 'button'; b.className = 'item' + (worn ? ' worn' : own ? ' own' : this.q.stars >= it.cost ? ' can' : ' lock');
            b.innerHTML = `<b></b><small></small>`;
            b.querySelector('b').textContent = it.name;
            b.querySelector('small').textContent = worn ? 'надето' : own ? (it.desc || 'надеть') : it.cost + ' ★' + (it.desc ? ' · ' + it.desc : '');
            b.addEventListener('click', () => {
              if (!own) { if (!this.w.buy(it.id, this.q)) { this.ctx.say('Нужно ' + it.cost + ' ★ — выполняй задания', 'bad'); return; } this.ctx.au.chime(); }
              this.w.wear(it.id);
              if (slot === 'voice') this.w.bark();
              this.refresh(); this.render();
            });
            sec.querySelector('.items').appendChild(b);
          }
          body.appendChild(sec);
        }
      }
    }
  };
})(window.R = window.R || {});
