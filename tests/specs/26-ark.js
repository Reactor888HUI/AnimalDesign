// The Ark (ark/index.html): the 3D library and the Knowledge Reactor.
// The engine (what the reactor concludes, the Law, learning), the rooms (the shelf-door, the walls, books
// taken from the shelf by looking at them), the search, the whole path of a plan (reactor -> human gate ->
// conveyor -> result -> rating), the landscapes behind the glass, and that the bag survives a reload.
exports.run = async t => {
  const page = await t.open('ark/index.html?manual', { game: false, viewport: { width: 640, height: 420 } });
  await page.waitForFunction(() => window.__ark, null, { timeout: 120000 });
  // logic tests do not need the pixels: skip drawing, step the world by hand
  await page.evaluate(() => { const { W } = window.__ark; W.running = false; W.renderer.render = () => {}; window.__run = (n, dt) => { for (let i = 0; i < n; i++) W.step(dt || 0.1); }; });

  // ---- the engine ------------------------------------------------------------------------------------------------
  const eng = await page.evaluate(() => {
    const A = window.__ark.A, R = A.Reactor, cat = window.__ark.UI.catalog, out = {};
    const idea = { kind: 'idea', text: 'Хочу сделать маленький сад на балконе для соседей. Бюджета почти нет, я один. Срок две недели.' };
    const run = R.runAll([idea, { kind: 'dream', text: 'Мне снилось, что дом утопает в зелени.' }], cat, null, {});
    out.variants = run.variants.length; out.winners = run.winners.map(w => w.strat.name); out.top3 = run.winners.length;
    out.fell = run.variants.filter(v => v.fell).length; out.goal = run.frame.goal; out.assumed = run.frame.assumed; out.time = run.frame.time; out.questions = run.questions.map(q => q.id);
    const bare = R.runAll([{ kind: 'idea', text: 'Хочу сделать маленький сад на балконе для соседей.' }], cat, null, {}); out.bareQuestions = bare.questions.map(q => q.id); out.bareAssumed = bare.frame.assumed;
    out.subject = run.frame.kw.slice(0, 3).map(k => k.word);
    out.horizons = run.plan.horizons.map(h => h.steps.length); out.stops = run.plan.stops.length; out.conv = run.conveyor.stations.map(s => s.name);
    out.package = run.package.length;
    // a small honest plan for an idea with no money and no team: not a "big leap"
    out.noBigLeap = !run.winners.some(w => w.sid === 'scale' || w.sid === 'partner');
    // the Law stops harm and deception; nothing is planned
    const bad = R.runAll([{ kind: 'idea', text: 'Хочу обмануть клиентов и взломать их пароли' }], cat, null, {});
    out.law = { stopped: !!bad.stopped, plan: !!bad.plan, rules: bad.stopped && bad.stopped.rules.map(r => r.id) };
    // books brought as reading do not take over the subject the person spoke about
    const withBooks = R.runAll([idea].concat(cat.slice(0, 8).map(b => ({ kind: 'book', ref: b.id, title: b.title, text: b.blurb, tags: b.tags }))), cat, null, {});
    out.subjectWithBooks = withBooks.frame.kw.slice(0, 3).map(k => k.word);
    // learning: a good rating strengthens the winner, a bad one weakens it and makes the Critic stricter
    const mem = R.freshMemory(), sid = run.winners[0].sid, w0 = mem.strat[sid] || 1;
    R.learn(mem, run, 5); const up = mem.strat[sid]; R.learn(mem, run, 1); R.learn(mem, run, 1);
    out.learn = { up: up > w0, down: mem.strat[sid] < up, strict: mem.strict > 1, version: mem.version.join('.'), log: mem.log.length };
    const run2 = R.runAll([idea], cat, mem, {}); out.learned = run2.variants.find(v => v.sid === sid).fit < R.runAll([idea], cat, null, {}).variants.find(v => v.sid === sid).fit;
    // search finds by title, by tag, by the start of a word
    out.search = { title: A.search('антихрупкость', 'all', cat, 3)[0].item.title, tag: A.search('микроскоп', 'book', cat, 5).length, prefix: A.search('космо', 'book', cat, 5).length, news: A.search('чтение', 'news', A.news, 5).every(r => r.item.kind === 'news' && r.item.demo) };
    return out;
  });
  t.ok(eng.variants === 27 && eng.top3 >= 1 && eng.top3 <= 3, 'the reactor spins 27 ways (9 strategies x 3 main concepts) and keeps up to 3', { v: eng.variants, w: eng.winners });
  t.ok(eng.winners[0] === 'Малый шаг' && eng.noBigLeap && eng.fell > 0, 'no money, no team: it picks a small step, and the big leap falls', eng);
  t.ok(eng.subject.includes('сад') && eng.subjectWithBooks.includes('сад'), 'the subject comes from what the person said, also when books are brought', { eng: eng.subject, books: eng.subjectWithBooks });
  t.ok(eng.assumed.length === 0 && eng.questions.length === 0 && /недел/.test(eng.time) && eng.goal.includes('сад'), 'what was said (goal, two weeks, no money, alone) is not asked again or assumed', { goal: eng.goal, time: eng.time, assumed: eng.assumed, q: eng.questions });
  t.ok(eng.bareQuestions.join() === 'time,money' && eng.bareAssumed.join() === 'time,money', 'a bare wish (for the neighbours): it asks about time and money, not about people; unanswered ones are assumed', { q: eng.bareQuestions, a: eng.bareAssumed });
  t.ok(eng.horizons.join() === '2,3,2,3' && eng.stops === 2 && eng.conv.length === 5 && eng.package > 400, 'a concrete plan: today / 7 / 30 / 90 days, what to check first, a conveyor of 5 stations', eng);
  t.ok(eng.law.stopped && !eng.law.plan && eng.law.rules.includes('honest') && eng.law.rules.includes('privacy'), 'the Law stops deception and prying: nothing is planned', eng.law);
  t.ok(eng.learn.up && eng.learn.down && eng.learn.strict && eng.learned && eng.learn.log >= 4, 'it learns: ratings move the weights, the Critic gets stricter, the log says what changed', eng.learn);
  t.ok(eng.search.title === 'Антихрупкость' && eng.search.tag >= 1 && eng.search.prefix >= 1 && eng.search.news, 'search: by title, by tag, by the start of a word; the news are marked as demo', eng.search);

  // ---- the rooms -------------------------------------------------------------------------------------------------------
  const rooms = await page.evaluate(() => {
    const { W, UI } = window.__ark, B = W.B, out = {};
    out.slots = W.hallCount(); out.catalog = UI.catalog.length;
    W.teleport('room'); out.doorClosedFree = W.free(7.0, 0); out.beforeX = W.player.x;
    W.player.x = 4.6; W.player.z = 0; __run(40, 0.1);       // comes up to the shelf: it slides away
    out.doorOpen = B.door.open; out.doorFree = W.free(7.0, 0);
    W.player.x = 7.9; W.player.z = 0.5; __run(5, 0.1); out.hallFree = W.free(15, 0) && W.free(8, 0); out.zone = W.zone;
    W.player.x = -3; W.player.z = 0; W.player.vx = W.player.vz = 0; __run(60, 0.1); out.doorShut = B.door.open;
    out.walls = [W.free(-6.9, 0), W.free(0, -0.6), W.free(-5.7, -1.6), W.free(0, 5.2), W.free(20, 6.0), W.free(20, -6.0)].every(v => !v);
    return out;
  });
  t.ok(rooms.slots > 1000 && rooms.slots === rooms.catalog, 'the hall holds more than a thousand books, each one a catalogue entry', rooms);
  t.ok(!rooms.doorClosedFree && rooms.doorOpen > 0.9 && rooms.doorFree && rooms.hallFree && rooms.zone === 'hall', 'come up to the bookcase: it slides away and the way into the library opens', rooms);
  t.ok(rooms.doorShut < 0.1, 'walk away: the door closes again', rooms.doorShut);
  t.ok(rooms.walls, 'glass, reactor, desk and walls cannot be walked through', rooms);

  // ---- a book taken by looking at it ---------------------------------------------------------------------------------------
  const pick = await page.evaluate(() => {
    const { W, UI } = window.__ark, out = {}, item = UI.catalog[300], sl = W.B.hallSlots[300];
    W.teleport('books', sl.c, -4.3); W.faceTo(sl.c, -6.4); W.player.pitch = Math.atan2(sl.y - 1.62, 1.65);
    __run(6, 0.1); out.prompt = W.prompt && W.prompt.type === 'book' && W.prompt.item === item;
    W.interact(); out.inBag = UI.S().bag.includes(item.id); out.taken = item.taken; out.counter = document.getElementById('bagN').textContent;
    __run(6, 0.1); out.gone = !(W.prompt && W.prompt.item === item);
    return out;
  });
  t.ok(pick.prompt && pick.inBag && pick.taken && pick.counter === '1' && pick.gone, 'look at a book, press E: it is in the bag and gone from the shelf', pick);

  // ---- the artifacts ------------------------------------------------------------------------------------------------------------
  const arts = await page.evaluate(() => {
    const { W, A } = window.__ark, B = W.B, seen = new Set();
    for (const m of B.artMeshes) seen.add(m.userData.art);
    const want = A.ARTIFACTS.map(a => a.id), missing = want.filter(id => !seen.has(id));
    // look at the globe: the prompt names it
    const g = B.artMeshes.find(m => m.userData.art === 'globe'), v = new THREE.Vector3(); g.getWorldPosition(v);
    W.teleport('artifacts', 11, 3.6); W.faceTo(v.x, v.z); W.player.pitch = Math.atan2(v.y - 1.62, Math.hypot(v.x - W.player.x, v.z - W.player.z)); __run(6, 0.1);
    return { missing, prompt: W.prompt && W.prompt.type, name: W.prompt && W.prompt.text };
  });
  t.ok(arts.missing.length === 0, 'all ten artifacts are in the cabinets (globe, microscope, telescope, magnifier, tools, finds, the unique one, diamonds, emeralds, rubies)', arts);
  t.ok(arts.prompt === 'artifact' && arts.name === 'Глобус', 'looking at an artifact names it', arts);

  // ---- the whole path of a plan ----------------------------------------------------------------------------------------------------
  const path = await page.evaluate(async () => {
    const { W, UI, A } = window.__ark, S = UI.S(), RX = UI.RX, out = {}, wait = ms => new Promise(r => setTimeout(r, ms));
    const until = async (fn, ms) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < (ms || 30000)) { __run(2, 0.25); await wait(15); } return fn(); };
    UI.fast = 0.01; RX.items = [{ id: 'u1', kind: 'idea', text: 'Хочу сделать маленький сад на балконе.' }];
    UI.openReactor(); out.panel = !document.getElementById('panel').hidden && !W.enabled;
    UI.runFlow();
    out.asked = await until(() => RX.ask);
    out.questions = RX.ask ? RX.ask.questions.map(q => q.id) : [];
    RX.answers.time = 'за две недели'; RX.ask.resolve(RX.answers);
    out.done = await until(() => RX.phase === 'done');
    out.pending = S.runs.length && S.runs[0].status; out.verdicts = RX.verdicts.length; out.assumedInPlan = S.runs[0].plan.assumed.join();
    out.noConveyorYet = W.B.reactor.beltRun === 0 && W.B.reactor.stations.length === 0 && !S.out;
    out.lamps = W.B.reactor.lit;
    UI.closePanel(); W.teleport('desk'); UI.openDesk();
    out.gateButtons = [...document.querySelectorAll('#shBody button')].map(b => b.textContent).filter(x => /Одобрить|Вернуть|Отклонить|Погрузиться/.test(x));
    const mine0 = S.mine.length; const run = S.runs[0];
    UI.closePanel(); UI.startConveyor(run);
    out.stations = await until(() => W.B.reactor.stations.length === 5, 5000);
    out.finished = await until(() => S.out, 60000);
    out.card = W.B.reactor.card.material.opacity >= 0 && W.B.reactor.card.visible;
    out.saved = S.mine.length === mine0 + 1 && S.mine[S.mine.length - 1].title.startsWith('Решение:');
    out.shelf = W.mineItems.length;
    // the result is read and rated: the reactor learns
    W.teleport('output'); __run(8, 0.1); out.outPrompt = W.prompt && W.prompt.type;
    UI.openResult();
    document.querySelectorAll('.stars button')[4].click(); [...document.querySelectorAll('#shBody button')].find(b => b.textContent === 'Оценить').click();
    out.version = A.Reactor.loadMemory().version.join('.'); out.runsMem = A.Reactor.loadMemory().runs; out.outCleared = S.out === null;
    return out;
  });
  t.ok(path.panel && path.asked && path.questions.join() === 'time,money,people', 'the reactor panel opens; it asks what is missing', path);
  t.ok(path.assumedInPlan === 'money,people', 'the time was answered; money and people were not, and the plan says so honestly', path.assumedInPlan);
  t.ok(path.done && path.pending === 'pending' && path.verdicts >= 20 && path.lamps === 8, 'the run goes through eight stages and the plan waits at the Human Gate', path);
  t.ok(path.noConveyorYet, 'without a human "yes" the conveyor does not start', path);
  t.ok(path.gateButtons.length === 4, 'the desk offers: dive into the variant, approve, send back, reject', path.gateButtons);
  t.ok(path.stations && path.finished && path.card && path.saved && path.shelf >= 4, 'approved: a conveyor of 5 stations is built, it runs, the result is printed and shelved in "my library"', path);
  t.ok(path.outPrompt === 'output' && path.version === '1.1' && path.runsMem === 1 && path.outCleared, 'the result is picked up, rated 5: the reactor becomes v1.1', path);

  // ---- the landscapes behind the glass -------------------------------------------------------------------------------------------------
  await page.waitForFunction(() => window.__ark.W.land.textures[1] instanceof THREE.Texture, null, { timeout: 60000 });
  const land = await page.evaluate(() => {
    const { W } = window.__ark, name0 = W.landscapeName(), ok = W.nextLandscape();
    __run(30, 0.2);
    return { ok, name0, name1: W.landscapeName(), index: W.land.index, fade: W.land.fade };
  });
  t.ok(land.ok && land.index === 1 && land.name0 !== land.name1 && land.fade === -1, 'the landscape changes softly to the next one in the series', land);

  // ---- the bag survives a reload; the page does not overflow ------------------------------------------------------------------------------
  await page.reload();
  await page.waitForFunction(() => window.__ark, null, { timeout: 120000 });
  const again = await page.evaluate(() => { const { UI } = window.__ark, S = UI.S(); return { bag: S.bag.length, counter: document.getElementById('bagN').textContent, taken: UI.catalog[300].taken === true, mine: S.mine.length, overflow: document.documentElement.scrollWidth > innerWidth }; });
  t.ok(again.bag === 1 && again.counter === '1' && again.taken && again.mine >= 4 && !again.overflow, 'after a reload the bag, the shelf and the results are as they were', again);
};
