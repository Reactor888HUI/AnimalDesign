(function (A) {
  // ===================================================================================================
  //  THE KNOWLEDGE REACTOR: what is put in comes out as one concrete plan.
  //  The stages (each is a plain function, so a real scheme can replace any of them):
  //    1 intake    — what was brought: ideas, thoughts, talks, schemes, drawings, dreams, fantasies, books
  //    2 clarify   — what is missing (goal, time, money, people): questions; unanswered ones are assumed
  //    3 gather    — the library adds what the input lacks
  //    4 spin      — all the ways it could go: strategies x main concepts
  //    5 collide   — each way meets the Critic, the Destructive Decomposer and the Law
  //    6 select    — the strongest ways, the valuable core ("gold"), the waste ("ore")
  //    7 plan      — a concrete plan: today / 7 days / 30 days / 90 days, metrics, stop signs
  //    8 gate      — a human decides (the Human Gate); only an approved plan goes on the conveyor
  //    9 conveyor  — a line built for this very task, with its own name and stations
  //  After a run the reactor learns from the rating: it shifts the weight of strategies, the link between
  //  words and strategies, and the strictness of the Critic, and it keeps a log of what changed in itself.
  //  There is no language model here: it is a transparent rule-based engine; everything it says it can show.
  // ===================================================================================================
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const KINDS = {
    idea: ['Идея', 0.5], thought: ['Мысль', 0.45], talk: ['Разговор', 0.55], scheme: ['Схема', 0.7], drawing: ['Рисунок', 0.4],
    dream: ['Сон', 0.25], fantasy: ['Фантазия', 0.3], book: ['Книга', 0.85], note: ['Заметка', 0.6],
  };
  const STAGES = [
    { id: 'intake', name: 'Приём' }, { id: 'clarify', name: 'Уточнение' }, { id: 'gather', name: 'Добор' }, { id: 'spin', name: 'Разгон' },
    { id: 'collide', name: 'Столкновение' }, { id: 'select', name: 'Отбор' }, { id: 'plan', name: 'План' }, { id: 'gate', name: 'Человеческий гейт' }, { id: 'conveyor', name: 'Конвейер' },
  ];

  // ---- memory: what the reactor has learned (kept in the browser) ----------------------------------------
  function freshMemory() { return { version: [1, 0], runs: 0, strat: {}, aff: {}, strict: 1, log: [{ t: Date.now(), text: 'Реактор собран: версия 1.0' }], history: [] }; }
  function loadMemory() {
    try { const m = JSON.parse(localStorage.getItem('ark-reactor') || 'null'); if (m && m.version) return Object.assign(freshMemory(), m); } catch (e) {}
    return freshMemory();
  }
  function saveMemory(m) { try { localStorage.setItem('ark-reactor', JSON.stringify(m)); } catch (e) {} }

  // ---- 1. intake ------------------------------------------------------------------------------------------
  function intake(items) {
    return items.map((it, i) => ({
      id: it.id || 'd' + i, kind: it.kind || 'idea', title: it.title || '', ref: it.ref, added: !!it.added,
      rel: (KINDS[it.kind] || KINDS.idea)[1],
      text: (it.title ? it.title + '. ' : '') + (it.text || ''),
      tokens: A.tokens((it.title ? it.title + ' ' : '') + (it.text || '') + ' ' + (it.tags || '')),
    })).filter(d => d.text.replace(/[.\s]/g, '').length > 0);
  }
  // words that say nothing about the subject (the reactor does not build a plan around "хочу" or "срок")
  const NOISE = new Set('хочу хотим сделать создать нужно надо почти срок нет очень просто который которые которая можно также этот этого свой своя свои мой моя мои наш наша наши всё все весь быть стать есть будет будут буду мне себе делать сделаю нужны нужна недели неделя недель дней день дня месяц месяца месяцев года год лет две два три пять десять один одна одно сам сама сами тоже ещё уже вообще например чтобы чтоб если когда потом сначала затем после перед тогда'.split(' '));
  function keywords(docs, n) {
    n = n || 8;
    const pass = ds => {
      const m = new Map();
      for (const d of ds) for (const w of d.tokens) {
        if (NOISE.has(w)) continue;
        const s = A.stem(w), e = m.get(s) || { stem: s, score: 0, forms: new Map() };
        e.score += d.rel * (d.kind === 'book' ? 0.35 : 1.2); e.forms.set(w, (e.forms.get(w) || 0) + 1); m.set(s, e);
      }
      return [...m.values()].map(e => ({ stem: e.stem, word: [...e.forms.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0], score: e.score })).sort((a, b) => b.score - a.score);
    };
    // what the person said or drew decides the subject; the books they brought only fill the gaps
    const list = pass(docs.filter(d => d.kind !== 'book')), seen = new Set(list.map(k => k.stem));
    if (list.length < n) for (const k of pass(docs.filter(d => d.kind === 'book'))) if (!seen.has(k.stem)) list.push(k);
    return list.slice(0, n);
  }
  // the text that says what the person wants (books are reading, not wishes): their own words, or all if there are only books
  const ownText = docs => { const own = docs.filter(d => d.kind !== 'book'); return (own.length ? own : docs).map(d => d.text).join('\n'); };

  // ---- 2. clarify -----------------------------------------------------------------------------------------
  const RE = {
    goal: /(хочу|хотим|нужно|надо|цель|сделать|создать|запустить|построить|найти|понять|выучить|написать|открыть|придумать|разобраться|собрать)/i,
    time: /((?:\d+|один|одну|два|две|три|четыре|пять|шесть|семь|десять|пару|несколько)\s*(дн|недел|месяц|год|час)|срок|до конца|к\s+(лету|осени|зиме|весне)|завтра|сегодня|срочно)/i,
    money: /(бюджет|деньг|руб|\$|€|тыс|инвест|стоимост|дорог|дешев|бесплатн)/i,
    people: /(команд|партнёр|партнер|друз|помощник|клиент|пользовател|аудитор|сообществ|семь|коллег|я один|я одна|сам по себе|одиночк|вдвоём|втроём|соседей|соседям|для\s+(людей|детей|всех))/i,
  };
  const QUESTIONS = [
    { id: 'goal', q: 'Какого результата ты хочешь добиться? Одним предложением.', ph: 'Хочу…' },
    { id: 'time', q: 'К какому сроку это нужно?', ph: 'Например: за 2 недели' },
    { id: 'money', q: 'Какие деньги или ресурсы есть?', ph: 'Например: почти нет бюджета' },
    { id: 'people', q: 'Кто может помочь и для кого это делается?', ph: 'Например: я один, делаю для друзей' },
  ];
  function clarify(docs, answers) {
    answers = answers || {};
    const text = ownText(docs), given = {};
    for (const q of QUESTIONS) given[q.id] = RE[q.id].test(text) || !!(answers[q.id] && answers[q.id].trim());
    const all = text + '\n' + Object.values(answers).join(' ');
    const kw = keywords(docs, 8), low = all.toLowerCase();
    const g = all.match(/(?:хочу|хотим|нужно|надо|цель[:\s-]*|сделать|создать|запустить|построить|найти|понять|выучить|написать|открыть|придумать|разобраться|собрать)\s+[^.!?\n]{3,90}/i);
    const assumed = [], pick = (id, found, fallback) => { if (found) return found.trim(); assumed.push(id); return fallback; };
    const frame = {
      goal: pick('goal', (answers.goal || '').trim() || (g && g[0]), 'прояснить и продвинуть тему «' + kw.slice(0, 2).map(k => k.word).join(' ') + '»'),
      time: pick('time', (answers.time || '').trim() || (all.match(/(?:\d+|один|одну|два|две|три|четыре|пять|шесть|семь|десять|пару|несколько)\s*(?:дн|недел|месяц|год|час)\S*/i) || all.match(/срок[^.!?\n]{0,30}/i) || [])[0], '30 дней'),
      money: pick('money', (answers.money || '').trim() || (RE.money.test(all) ? 'указаны в тексте' : ''), 'минимальный бюджет'),
      people: pick('people', (answers.people || '').trim() || (RE.people.test(all) ? 'указаны в тексте' : ''), 'ты сам и один-два помощника'),
      audience: ((all.match(/для\s+([а-яёa-z][а-яёa-z\s-]{2,28})/i) || [])[1] || 'ты сам и ближайший круг').trim(),
      assumed, given, kw,
      flags: {
        shortTime: /((?:\d+|один|одну|два|две|три|четыре|пять|шесть|семь|десять|пару|несколько)\s*(дн|недел)|завтра|сегодня|срочно|быстр)/i.test(all) || assumed.includes('time'),
        lowMoney: /(бесплатн|дешев|без денег|минимальн|мало денег|нет денег|нет бюджета)/i.test(all) || assumed.includes('money'),
        hasMoney: /(бюджет|инвест|млн|\d+\s*(тыс|руб|\$|€))/i.test(all) && !/(нет денег|нет бюджета|без денег)/i.test(all),
        hasPeople: /(команд|партнёр|партнер|помощник|друз|сообществ|коллег)/i.test(all),
        tech: /(код|программ|алгоритм|автомат|сайт|приложен|бот|скрипт|искусственн|нейросет)/i.test(all),
        problem: /(проблем|трудно|не получается|застр|тупик|не работает|сложно|мешает)/i.test(all),
        community: /(сообществ|аудитор|люди|людей|клиент|читател|подписчик)/i.test(all),
        sell: /(продат|продаж|заработ|клиент|покупател|заказ)/i.test(all),
        habit: /(привыч|ежедневн|каждый день|режим|дисциплин|ритуал)/i.test(all),
        books: docs.filter(d => d.kind === 'book').length, sources: docs.filter(d => d.kind === 'book').length,
        dreamy: docs.some(d => d.kind === 'dream' || d.kind === 'fantasy'),
        low: low,
      },
    };
    const questions = QUESTIONS.filter(q => !given[q.id]);
    return { frame, questions };
  }

  // ---- 3. gather ------------------------------------------------------------------------------------------
  function gather(docs, frame, catalog) {
    const have = new Set(docs.map(d => d.ref).filter(Boolean)), q = frame.kw.slice(0, 6).map(k => k.stem), scored = [];
    for (const b of catalog) {
      if (have.has(b.id)) continue;
      const toks = A.tokens(b.title + ' ' + b.tags + ' ' + b.blurb).map(A.stem);
      let s = 0; for (const w of q) if (toks.includes(w)) s++;
      if (s > 0) scored.push({ b, s: s + (b.real ? 0.3 : 0) });
    }
    scored.sort((a, b) => b.s - a.s);
    let added = scored.slice(0, 4).map(x => x.b), fallback = false;
    if (!added.length) { fallback = true; added = catalog.filter(b => b.real && /системн|метод|решени|принцип/.test(b.tags)).slice(0, 3); }
    return { queries: frame.kw.slice(0, 6).map(k => k.word), added, fallback };
  }

  // ---- 4. spin: the strategies ----------------------------------------------------------------------------
  const asm = (id, text, w, core, cue, frameKey) => ({ id, text, w, core: !!core, cue, frameKey });
  const STRATS = [
    {
      id: 'mvp', name: 'Малый шаг', upside: 0.6, effort: 0.25, station: 'Показ людям',
      fit: f => 0.55 + 0.2 * f.shortTime + 0.15 * f.lowMoney,
      assumptions: [asm('small', 'Идею можно показать в малом виде за неделю', 0.5, true, 'недел|прототип|набросок|пробн|минимальн|быстр|простой|маленьк', 'time'),
        asm('reach', 'До первых живых людей можно дотянуться', 0.5, true, 'люд|друз|клиент|пользовател|знаком|аудитор|семь', 'people'), asm('learn', 'По реакции людей понятно, что менять', 0.3, false, 'отзыв|реакц|провер|тест|обратн')],
      beats: (fr, x) => ['Неделя 1: собрать самую простую версию «' + x + '» — только то, без чего она не работает.', 'Показать её тем, для кого это делается (' + fr.audience + '), и записать, что им непонятно и что понравилось.', 'К сроку (' + fr.time + '): оставить то, что вызвало отклик, убрать остальное и решить, расти или менять курс.'],
      lead: { today: 'Выбрать одну самую маленькую версию «{focus}», которую можно сделать за 2–3 дня', d7: 'Сделать эту версию и показать первому человеку из «{aud}»', d30: 'Собрать отзывы десяти человек и убрать всё, что их не зацепило', d90: 'Решить по цифрам: расти, менять курс или остановиться' },
      metrics: ['Сколько людей посмотрели и сколько вернулись', 'Сколько правок внесено по отзывам'],
    },
    {
      id: 'deep', name: 'Глубокое погружение', upside: 0.7, effort: 0.55, station: 'Чтение и конспект',
      fit: f => 0.5 + 0.12 * Math.min(2, f.books) + 0.1 * f.dreamy,
      assumptions: [asm('sources', 'Есть источники, из которых можно учиться', 0.5, true, 'книг|статья|курс|изуч|читат|источник|исслед', 'books'),
        asm('time', 'Хватит времени на погружение', 0.4, false, 'месяц|год|время|неспешн', 'time'), asm('apply', 'Знание удастся превратить в действие', 0.4, false, 'применить|сделать|практик|проект|результат')],
      beats: (fr, x) => ['Недели 1–2: прочитать самые сильные источники по «' + x + '» и выписать по пять мыслей из каждого.', 'Сложить мысли в одну схему и найти в ней пустые места: что никто не объяснил.', 'К сроку (' + fr.time + '): превратить схему в первое действие по цели «' + fr.goal + '».'],
      lead: { today: 'Выбрать три самых сильных источника по «{focus}» и отложить остальные', d7: 'Прочитать их и выписать по пять мыслей из каждого', d30: 'Сложить мысли в одну схему и отметить пустые места', d90: 'Превратить схему в первый проект по цели «{goal}»' },
      metrics: ['Сколько мыслей превращено в действия', 'Сколько пустых мест в схеме закрыто'],
    },
    {
      id: 'scale', name: 'Большой рывок', upside: 1, effort: 0.9, station: 'Ресурсы и роли',
      fit: f => 0.3 + 0.3 * f.hasMoney + 0.2 * f.hasPeople - 0.1 * f.shortTime,
      assumptions: [asm('money', 'Хватит денег на широкий запуск', 0.6, true, 'бюджет|инвест|деньг|средств|\\$|руб|млн', 'money'),
        asm('team', 'Есть команда, которая потянет масштаб', 0.5, true, 'команд|сотрудник|партнёр|партнер|людей', 'people'), asm('demand', 'Спрос уже подтверждён', 0.5, false, 'спрос|клиент|продаж|покупател|заявк|очередь')],
      beats: (fr, x) => ['Месяц 1: нанять или собрать людей и распределить роли вокруг «' + x + '».', 'Месяц 2: запустить широко, на всю аудиторию (' + fr.audience + '), и следить за узкими местами.', 'К сроку (' + fr.time + '): либо масштаб окупился, либо понятно, где он сломался.'],
      lead: { today: 'Прикинуть, сколько нужно денег и людей на широкий запуск «{focus}»', d7: 'Собрать людей и раздать роли: кто за что отвечает', d30: 'Запустить на всю аудиторию «{aud}» и следить за узкими местами', d90: 'Сравнить затраты с результатом и решить, масштабировать ли дальше' },
      metrics: ['Затраты на одного пользователя', 'Доля задач, закрытых в срок'],
    },
    {
      id: 'partner', name: 'Союз', upside: 0.8, effort: 0.45, station: 'Переговоры',
      fit: f => 0.4 + 0.35 * f.hasPeople + 0.1 * f.community,
      assumptions: [asm('ally', 'Есть с кем объединиться', 0.6, true, 'партнёр|партнер|друз|коллег|сообществ|знаком|эксперт', 'people'),
        asm('win', 'У союзника есть своя выгода', 0.4, false, 'выгод|интерес|польза|обмен'), asm('trust', 'Договорённости будут исполняться', 0.3, false, 'договор|довер|репутац')],
      beats: (fr, x) => ['Неделя 1: составить список людей, которым «' + x + '» нужно не меньше, чем тебе.', 'Предложить каждому понятный обмен: что получает он и что получаешь ты.', 'К сроку (' + fr.time + '): с теми, кто согласился, сделать общий первый шаг.'],
      lead: { today: 'Составить список пяти людей, которым «{focus}» нужно не меньше, чем тебе', d7: 'Написать каждому и предложить понятный обмен', d30: 'С теми, кто согласился, сделать общий первый шаг', d90: 'Оформить договорённости и распределить роли на будущее' },
      metrics: ['Сколько людей ответили и сколько остались', 'Что получил каждый из участников'],
    },
    {
      id: 'auto', name: 'Автомат', upside: 0.85, effort: 0.6, station: 'Скрипт и тест',
      fit: f => 0.4 + 0.3 * f.tech + 0.1 * f.habit,
      assumptions: [asm('repeat', 'Задача повторяется: есть что автоматизировать', 0.5, true, 'повтор|каждый|рутин|снова|регулярн|ежедневн|поток'),
        asm('tech', 'Нужные инструменты доступны', 0.5, true, 'код|программ|алгоритм|автомат|сайт|приложен|бот|скрипт|технолог|искусственн', 'tech'), asm('maintain', 'Автомат можно поддерживать', 0.3, false, 'поддерж|обновл|проверк')],
      beats: (fr, x) => ['Неделя 1: вручную пройти задачу «' + x + '» три раза и записать каждый шаг.', 'Найти шаги, которые повторяются, и сделать для них самый простой автомат.', 'К сроку (' + fr.time + '): автомат берёт на себя рутину, а человек — решения.'],
      lead: { today: 'Пройти задачу «{focus}» вручную и записать каждый шаг', d7: 'Найти повторяющиеся шаги и сделать для них самый простой автомат', d30: 'Проверить автомат на десяти случаях и поправить ошибки', d90: 'Подключить автомат к повседневной работе и назначить, кто его проверяет' },
      metrics: ['Сколько времени экономит автомат за неделю', 'Доля случаев без ошибок'],
    },
    {
      id: 'invert', name: 'Наоборот', upside: 0.75, effort: 0.4, station: 'Переворот допущения',
      fit: f => 0.45 + 0.25 * f.problem,
      assumptions: [asm('stuck', 'Привычное решение не работает', 0.5, true, 'проблем|трудно|не получается|застр|тупик|не работает|сложно|мешает'),
        asm('flip', 'Обратный ход возможен', 0.4, false, 'наоборот|иначе|по-другому|вместо|отказ'), asm('courage', 'Есть готовность рискнуть привычным', 0.3, false, 'риск|смел|эксперимент')],
      beats: (fr, x) => ['День 1: выписать, что все считают очевидным в «' + x + '», и перевернуть каждое утверждение.', 'Выбрать самое странное и проверить его на маленьком случае.', 'К сроку (' + fr.time + '): либо переворот сработал и открыл новый путь, либо стал понятен настоящий закон.'],
      lead: { today: 'Выписать, что все считают очевидным в «{focus}», и перевернуть каждое утверждение', d7: 'Выбрать самый странный переворот и проверить на маленьком случае', d30: 'Если сработало — повторить на втором случае, если нет — записать почему', d90: 'Описать найденное правило и использовать его в следующем решении' },
      metrics: ['Сколько допущений проверено на практике', 'Сколько из них оказалось ложными'],
    },
    {
      id: 'commun', name: 'Сообщество', upside: 0.8, effort: 0.5, station: 'Публикация и ритм',
      fit: f => 0.4 + 0.3 * f.community,
      assumptions: [asm('audience', 'Есть те, кому это интересно', 0.6, true, 'аудитор|сообществ|люди|пользовател|читател|подписчик|клиент', 'people'),
        asm('content', 'Есть чем регулярно делиться', 0.4, false, 'знан|опыт|материал|контент|истори|книг'), asm('rhythm', 'Хватит сил на ритм', 0.3, false, 'ритм|регулярн|еженедельн|каждую')],
      beats: (fr, x) => ['Неделя 1: выбрать место, где собираются люди, которым интересно «' + x + '».', 'Раз в неделю делиться одной полезной находкой и слушать ответы.', 'К сроку (' + fr.time + '): появляются первые постоянные участники, и они сами подсказывают следующий шаг.'],
      lead: { today: 'Выбрать место, где собираются люди, которым интересно «{focus}»', d7: 'Поделиться первой полезной находкой и спросить, что им нужно', d30: 'Выходить с находкой раз в неделю и вести список вопросов', d90: 'Пригласить самых активных участников помогать' },
      metrics: ['Сколько людей отвечают без просьбы', 'Сколько постоянных участников'],
    },
    {
      id: 'cash', name: 'Продать раньше, чем сделать', upside: 0.7, effort: 0.35, station: 'Предпродажа',
      fit: f => 0.4 + 0.3 * f.sell,
      assumptions: [asm('buyer', 'Есть тот, кто заплатит до создания', 0.6, true, 'клиент|покупател|заказ|продаж|заработ|деньги|платить|заплатит'),
        asm('promise', 'Обещание можно выполнить', 0.4, false, 'сроки|умею|могу|опыт|сделаю'), asm('honest', 'Можно честно сказать, что ещё в работе', 0.3, false, 'честно|прозрачн|открыт')],
      beats: (fr, x) => ['Неделя 1: описать «' + x + '» так, чтобы было понятно, что человек получит и когда.', 'Предложить трём людям (' + fr.audience + ') заказать заранее, честно сказав, что это предзаказ.', 'К сроку (' + fr.time + '): сделать ровно то, что обещано, для тех, кто заказал.'],
      lead: { today: 'Описать «{focus}» одной страницей: что человек получит и к какой дате', d7: 'Предложить трём людям из «{aud}» заказать заранее и честно сказать, что это предзаказ', d30: 'Сделать ровно то, что обещано, для тех, кто заказал', d90: 'Спросить заказчиков, что улучшить, и предложить следующую версию' },
      metrics: ['Сколько человек заказали заранее', 'Сколько выполнено в обещанный срок'],
    },
    {
      id: 'ritual', name: 'Ритм и привычка', upside: 0.65, effort: 0.3, station: 'Ежедневный цикл',
      fit: f => 0.45 + 0.2 * f.habit,
      assumptions: [asm('daily', 'Можно делать понемногу каждый день', 0.5, true, 'каждый день|ежедневн|привыч|режим|дисциплин|ритуал|утр|вечер'),
        asm('cue', 'Есть привязка к уже существующей привычке', 0.3, false, 'после|перед|во время|утром|вечером'), asm('track', 'Прогресс можно измерять', 0.3, false, 'измер|счёт|отмет|трекер|график')],
      beats: (fr, x) => ['Неделя 1: выбрать один маленький кусок «' + x + '», который занимает десять минут, и привязать к утру или вечеру.', 'Отмечать каждый день крестиком; не пропускать два дня подряд.', 'К сроку (' + fr.time + '): привычка держится сама, и результат виден по отметкам.'],
      lead: { today: 'Выбрать десятиминутный кусок «{focus}» и привязать к утру или вечеру', d7: 'Отмечать крестиком каждый день и не пропускать два дня подряд', d30: 'Добавить второй кусок, когда первый станет лёгким', d90: 'Подвести итог по отметкам и закрепить, что работает' },
      metrics: ['Сколько дней подряд без пропусков', 'Что удалось сделать за месяц'],
    },
  ];
  const NEG = [
    [/(нет денег|нет бюджета|без денег|без бюджета|денег нет)/i, ['money']],
    [/(я один|я одна|сам по себе|нет команды|без команды|никого нет|одиночк)/i, ['team', 'ally']],
    [/(нет времени|некогда|времени нет|мало времени)/i, ['time', 'small']],
    [/(нет аудитории|никто не знает|никому не интересно|некому показать)/i, ['audience', 'reach', 'buyer', 'demand']],
  ];

  function spin(frame, docs, memory) {
    const mem = memory || freshMemory(), kw = frame.kw.slice(0, 3).map(k => k.word);
    if (!kw.length) kw.push('тема');
    const out = [];
    for (const s of STRATS) for (const focus of kw) {
      let aff = 1; for (const k of frame.kw.slice(0, 6)) { const a = mem.aff[k.stem]; if (a && a[s.id]) aff += a[s.id]; }
      const fit = clamp(s.fit(frame.flags), 0.05, 1) * clamp((mem.strat[s.id] || 1) * clamp(aff, 0.6, 1.8), 0.4, 2);
      out.push({ id: s.id + ':' + focus, sid: s.id, strat: s, focus, title: s.name + ' · ' + focus, fit, beats: s.beats(frame, focus), assumptions: s.assumptions.map(a => ({ ...a })) });
    }
    return out;
  }

  // ---- 5. collide: the Critic, the Destructive Decomposer, the Law ----------------------------------------
  const LAW = [
    { id: 'harm', text: 'Не навреди людям', hard: true, re: /(убить|убий|яд\b|оруж|насили|травм|взрыв|избить|навред)/i },
    { id: 'honest', text: 'Не обманывай', hard: true, re: /(обман|мошен|поддел|фейк|накрут|скрыть от|развести на)/i },
    { id: 'privacy', text: 'Береги приватность', hard: true, re: /(слежк|шпион|чужие данные|чужие пароли|взлом|украсть данные)/i },
    { id: 'law', text: 'Соблюдай закон и лицензии', hard: true, re: /(пират|взятк|контрабанд|без лиценз|отмыть)/i },
  ];
  function support(a, text, frame, books) {
    let s = 0.35;                                   // unknown: neither proven nor broken
    const m = text.match(new RegExp(a.cue, 'gi'));
    if (m) s = clamp(0.45 + 0.2 * m.length, 0.45, 0.95);
    if (a.frameKey === 'books') { const n = frame.flags.sources || books; s = Math.max(s, n ? clamp(0.5 + 0.1 * n, 0.5, 0.9) : 0.2); }
    else if (a.frameKey === 'tech') s = Math.max(s, frame.flags.tech ? 0.7 : s);
    else if (a.frameKey && frame.given[a.frameKey]) s = Math.max(s, 0.6);
    for (const [re, ids] of NEG) if (re.test(text) && ids.includes(a.id)) s = 0.08;
    return s;
  }
  function collide(variants, docs, frame, memory) {
    const text = ownText(docs), strict = (memory && memory.strict) || 1, books = frame.flags.books;
    const hits = LAW.filter(r => r.re.test(text));
    for (const v of variants) {
      let sev = 0, wsum = 0, surv = 0;
      v.objections = []; v.killed = [];
      for (const a of v.assumptions) {
        a.support = support(a, text, frame, books);
        a.severity = a.w * (1 - a.support) * strict;
        wsum += a.w; sev += a.severity; surv += a.w * Math.max(0.1, a.support);
        if (a.support < 0.2) v.killed.push(a);
        if (a.severity > 0.2 || a.support < 0.2) v.objections.push('«' + a.text + '» — ' + (a.support < 0.2 ? 'прямо противоречит тому, что принесено' : a.support < 0.5 ? 'ничем не подтверждено' : 'подтверждено слабо'));
      }
      v.critic = clamp(1 - sev / wsum * 0.9, 0.05, 1);
      v.survival = surv / wsum;
      const core = v.killed.find(a => a.core);
      v.fell = core ? 'ядро «' + core.text + '» не выдерживает' : '';
      v.law = { hits: hits.map(h => h.id), veto: hits.length > 0, notes: [] };
      if (frame.flags.books) v.law.notes.push('Указать источники: книги, на которые опирается план');
      if (/(людям|людей|друз|клиент|пользовател)/i.test(v.beats.join(' '))) v.law.notes.push('Спросить согласие людей, на которых проверяется идея');
    }
    return { variants, lawHits: hits };
  }

  // ---- 6. select --------------------------------------------------------------------------------------------
  function sentences(docs) {
    const out = [];
    for (const d of docs) for (const s of d.text.split(/(?<=[.!?])\s+|\n+/)) {
      const t = s.trim(); if (t.length > 12) out.push({ text: t, doc: d });
    }
    return out;
  }
  function select(variants, docs, frame) {
    for (const v of variants) {
      v.dead = !!v.law.veto || !!v.fell || v.survival < 0.3;
      v.score = v.dead ? 0 : v.fit * (0.4 + 0.6 * v.critic) * v.survival * (1 + v.strat.upside * 0.35) / (1 + v.strat.effort * 0.35);
    }
    const alive = variants.filter(v => !v.dead).sort((a, b) => b.score - a.score);
    const winners = [], used = new Set();
    for (const v of alive) { if (used.has(v.sid)) continue; used.add(v.sid); winners.push(v); if (winners.length === 3) break; }
    let weak = false;
    if (!winners.length && !variants.every(v => v.law.veto)) {            // nothing strong: the sturdiest way, and a step to collect data
      weak = true;
      const best = variants.filter(v => !v.law.veto).sort((a, b) => b.survival - a.survival)[0];
      if (best) winners.push(best);
    }
    // gold: the sentences that carry the most weight; ore: what carried none
    const kwSet = new Map(frame.kw.map(k => [k.stem, k.score]));
    const sent = sentences(docs).map(s => {
      const t = A.tokens(s.text).map(A.stem); let sc = 0; for (const w of t) sc += kwSet.get(w) || 0;
      return { ...s, score: sc / Math.sqrt(t.length || 1) * s.doc.rel };
    });
    const gold = sent.filter(s => s.score > 0 && !s.doc.added).sort((a, b) => b.score - a.score).slice(0, 5);
    const ore = sent.filter(s => s.score === 0 && !s.doc.added).slice(0, 5);
    return { winners, weak, gold, ore, alive: alive.length, dead: variants.length - alive.length };
  }

  // ---- 7. plan ------------------------------------------------------------------------------------------------
  const GENERIC = {
    today: ['Записать цель одним предложением и положить на видное место'],
    d7: ['Записать, что получилось и что нет', 'Попросить одного человека честно оценить результат'],
    d30: ['Сравнить результат с показателями и решить: продолжать, менять или остановить'],
    d90: ['Собрать итоги на одной странице и положить в библиотеку', 'Поставить оценку реактору, чтобы он стал точнее'],
  };
  function plan(winner, frame, collided, sel) {
    const s = winner.strat, fill = t => t.replace(/\{focus\}/g, winner.focus).replace(/\{goal\}/g, frame.goal).replace(/\{aud\}/g, frame.audience);
    const weakest = winner.assumptions.slice().sort((a, b) => a.support - b.support).slice(0, 2);
    const P = {
      title: winner.title, strategy: s.name, focus: winner.focus, goal: frame.goal, why: s.name + ': ' + winner.beats[0],
      horizons: [
        { id: 'today', name: 'Сегодня', steps: [fill(s.lead.today), ...GENERIC.today] },
        { id: 'd7', name: 'За 7 дней', steps: [fill(s.lead.d7), ...GENERIC.d7] },
        { id: 'd30', name: 'За 30 дней', steps: [fill(s.lead.d30), ...GENERIC.d30] },
        { id: 'd90', name: 'За 90 дней', steps: [fill(s.lead.d90), ...GENERIC.d90] },
      ],
      weak: sel.weak,
      metrics: s.metrics.slice(),
      stops: weakest.map(a => 'Проверить в первую очередь: «' + a.text + '» (' + (a.support < 0.5 ? 'пока не подтверждено' : 'подтверждено слабо') + ')'),
      law: winner.law.notes.slice(),
      assumed: frame.assumed.slice(),
    };
    if (sel.weak) P.horizons[0].steps.unshift('Реактор не нашёл сильного варианта: сначала собрать данные — ответить на пропущенные вопросы и принести ещё материал');
    return P;
  }
  // the reactor checks its own output and patches what is missing
  function selfCheck(P) {
    const patches = [];
    if (!P.metrics || P.metrics.length < 2) { P.metrics = (P.metrics || []).concat(['Что изменилось за неделю по сравнению с началом']); patches.push('добавлен показатель успеха'); }
    if (!P.stops || !P.stops.length) { P.stops = ['Остановиться и пересмотреть, если за 30 дней нет ни одного заметного результата']; patches.push('добавлен знак остановки'); }
    if (!P.horizons[0].steps.length) { P.horizons[0].steps = ['Записать цель и первый шаг']; patches.push('добавлен шаг на сегодня'); }
    const text = JSON.stringify(P);
    if (!/\d/.test(text)) { P.metrics.push('Число сделанных шагов к концу недели'); patches.push('добавлено число в показатели'); }
    return { ok: !patches.length, patches };
  }

  // ---- 9. conveyor ---------------------------------------------------------------------------------------------
  function conveyor(P) {
    const s = STRATS.find(x => x.name === P.strategy) || STRATS[0], H = id => P.horizons.find(h => h.id === id).steps;
    const stations = [
      { name: 'Заготовка', input: 'Цель и материалы', steps: H('today') },
      { name: s.station, input: 'Заготовка', steps: [H('d7')[0]] },
      { name: 'Сборка', input: 'Результат прошлой станции', steps: H('d7').slice(1) },
      { name: 'Проверка', input: 'Собранное', steps: H('d30').concat(P.stops) },
      { name: 'Выпуск', input: 'Проверенное', steps: H('d90').concat(P.law) },
    ];
    for (const st of stations) { st.output = st.steps.map(t => '— ' + t).join('\n'); st.check = st.steps.length > 0 && st.output.length > 40; }
    return { name: '«' + cap(P.focus) + ' · ' + P.strategy + '»', stations };
  }
  function packageText(P, conv, sel, frame) {
    const L = ['РЕШЕНИЕ: ' + P.title, 'Цель: ' + P.goal, ''];
    for (const h of P.horizons) { L.push(h.name.toUpperCase()); for (const t of h.steps) L.push('— ' + t); L.push(''); }
    L.push('ПОКАЗАТЕЛИ'); for (const m of P.metrics) L.push('— ' + m);
    L.push('', 'ЧТО ПРОВЕРИТЬ ПЕРВЫМ'); for (const m of P.stops) L.push('— ' + m);
    if (P.law.length) { L.push('', 'ЗАКОН'); for (const m of P.law) L.push('— ' + m); }
    if (P.assumed.length) { L.push('', 'ДОПУЩЕНО РЕАКТОРОМ (вы не уточнили): ' + P.assumed.map(a => ({ goal: 'цель', time: 'срок', money: 'деньги', people: 'люди' })[a]).join(', ')); }
    L.push('', 'Конвейер ' + conv.name + ': ' + conv.stations.map(s => s.name).join(' → '));
    if (sel && sel.gold.length) { L.push('', 'ЦЕННОЕ ИЗ ПРИНЕСЁННОГО'); for (const g of sel.gold.slice(0, 3)) L.push('— ' + g.text); }
    return L.join('\n');
  }

  // ---- learning ---------------------------------------------------------------------------------------------------
  function learn(mem, run, rating) {
    const d = (clamp(rating, 1, 5) - 3) / 2, before = JSON.stringify([mem.strat, mem.strict]);
    const win = run.winners[0], notes = [];
    mem.runs++;
    if (win && d !== 0) {
      const w0 = mem.strat[win.sid] || 1;
      mem.strat[win.sid] = clamp(w0 * (1 + 0.2 * d), 0.5, 1.8);
      notes.push('«' + win.strat.name + '» ' + (d > 0 ? 'сильнее' : 'слабее') + ' (вес ' + w0.toFixed(2) + ' → ' + mem.strat[win.sid].toFixed(2) + ')');
      for (const o of run.winners.slice(1)) mem.strat[o.sid] = clamp((mem.strat[o.sid] || 1) * (1 + 0.05 * d), 0.5, 1.8);
      for (const k of run.frame.kw.slice(0, 6)) { const a = mem.aff[k.stem] || (mem.aff[k.stem] = {}); a[win.sid] = clamp((a[win.sid] || 0) + 0.1 * d, -0.3, 0.8); }
      notes.push('связь слов «' + run.frame.kw.slice(0, 3).map(k => k.word).join(', ') + '» со стратегией ' + (d > 0 ? 'усилена' : 'ослаблена'));
    }
    if (rating <= 2) { mem.strict = clamp(mem.strict + 0.06, 0.8, 1.5); notes.push('критик стал строже (' + mem.strict.toFixed(2) + '): сильнее проверять допущения'); }
    else if (rating >= 4) { mem.strict = clamp(mem.strict - 0.02, 0.8, 1.5); }
    if ((run.selfcheck && run.selfcheck.patches.length)) notes.push('самоисправления в плане: ' + run.selfcheck.patches.join(', '));
    if (JSON.stringify([mem.strat, mem.strict]) !== before) { mem.version = [mem.version[0], mem.version[1] + 1]; }
    const line = 'Версия ' + mem.version.join('.') + ': ' + (notes.length ? notes.join('; ') : 'оценка нейтральна, веса не менялись');
    mem.log.unshift({ t: Date.now(), text: line });
    if (mem.log.length > 30) mem.log.length = 30;
    mem.history.unshift({ t: Date.now(), title: run.winners[0] ? run.winners[0].title : '—', rating });
    if (mem.history.length > 50) mem.history.length = 50;
    return line;
  }

  // ---- the whole run in one go (tests, or "do it all for me") ------------------------------------------------------
  function runAll(items, catalog, memory, answers) {
    const mem = memory || freshMemory(), run = { stages: [] };
    run.docs = intake(items);
    const c = clarify(run.docs, answers); run.frame = c.frame; run.questions = c.questions;
    run.gathered = gather(run.docs, run.frame, catalog);
    // the library's additions are reading material: they never decide what the subject is or what is "given"
    run.allDocs = run.docs.concat(intake(run.gathered.added.map(b => ({ id: 'g' + b.id, kind: 'book', ref: b.id, title: b.title, text: b.blurb, tags: b.tags, added: true }))));
    run.frame.flags.sources = run.frame.flags.books + run.gathered.added.length;
    run.variants = spin(run.frame, run.allDocs, mem);
    const col = collide(run.variants, run.docs, run.frame, mem); run.lawHits = col.lawHits;
    const sel = select(run.variants, run.allDocs, run.frame); Object.assign(run, sel);
    if (!run.winners.length) { run.stopped = { rules: LAW.filter(r => run.lawHits.some(h => h.id === r.id)), suggestion: 'Переформулируй цель так, чтобы никому не вредить и никого не обманывать: реактор сможет помочь.' }; return run; }
    run.plan = plan(run.winners[0], run.frame, col, sel);
    run.selfcheck = selfCheck(run.plan);
    run.conveyor = conveyor(run.plan);
    run.package = packageText(run.plan, run.conveyor, sel, run.frame);
    return run;
  }

  A.Reactor = { STAGES, KINDS, STRATS, LAW, QUESTIONS, intake, keywords, clarify, gather, spin, collide, select, plan, selfCheck, conveyor, packageText, learn, runAll, freshMemory, loadMemory, saveMemory };
})(globalThis.Ark = globalThis.Ark || {});
