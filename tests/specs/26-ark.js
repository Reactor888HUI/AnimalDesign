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
    UI.closePanel(); const t0 = S.tasks.length; UI.approve(run);
    out.planTasks = S.tasks.length - t0; out.approveMsg = S.msgs.some(m => /одобрен/.test(m.text));
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
  t.ok(path.planTasks === 4 && path.approveMsg, 'approving turns the plan into four tasks of the project and writes a message', { tasks: path.planTasks, msg: path.approveMsg });
  t.ok(path.stations && path.finished && path.card && path.saved && path.shelf >= 4, 'approved: a conveyor of 5 stations is built, it runs, the result is printed and shelved in "my library"', path);
  t.ok(path.outPrompt === 'output' && path.version === '1.1' && path.runsMem === 1 && path.outCleared, 'the result is picked up, rated 5: the reactor becomes v1.1', path);

  // ---- the neon monitor: a pane of the glass turns into a screen --------------------------------------------------------------------------
  const mon = await page.evaluate(async () => {
    const { W, UI, A } = window.__ark, B = W.B, out = {}, wait = ms => new Promise(r => setTimeout(r, ms));
    UI.closePanel(); W.teleport('desk'); __run(40, 0.1); out.k = B.monitor.k;
    const px = B.monitor.canvas.getContext('2d').getImageData(0, 0, 1024, 560).data; let cy = 0, mg = 0;
    for (let i = 0; i < px.length; i += 4) { if (px[i] < 120 && px[i + 1] > 200 && px[i + 2] > 230) cy++; if (px[i] > 220 && px[i + 1] < 120 && px[i + 2] > 200) mg++; }
    out.neon = [cy, mg];
    const v = new THREE.Vector3(); B.monitor.screen.getWorldPosition(v); W.faceTo(v.x, v.z); W.player.pitch = Math.atan2(v.y - 1.62, Math.hypot(v.x - W.player.x, v.z - W.player.z)); __run(6, 0.1);
    out.prompt = W.prompt && W.prompt.type;
    let got = null; A.hooks.onTask = t => { got = t.text; };
    const S = UI.S(), n0 = S.tasks.length, ver0 = B.monitor.tex.version;
    UI.addTask('Написать письмо партнёру'); out.tasks = S.tasks.length - n0; out.hook = got; out.msg = S.msgs[S.msgs.length - 1].text;
    await wait(400); out.redrawn = B.monitor.tex.version > ver0;
    UI.openMonitor(); const cb = document.querySelector('#shBody input[type=checkbox]'); cb.click(); out.done = S.tasks.some(t => t.done); UI.closePanel();
    UI.openMonitor(); const field = document.querySelector('#shBody input[type=text]'); field.value = 'Вторая задача'; field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); out.typed = S.tasks.some(t => t.text === 'Вторая задача'); UI.closePanel();
    W.setMonitor(false); __run(40, 0.1); out.off = B.monitor.k; W.setMonitor(true); __run(40, 0.1); out.on = B.monitor.k;
    return out;
  });
  t.ok(mon.k > 0.95 && mon.neon[0] > 2000 && mon.neon[1] > 300, 'the west window behind the desk is a neon monitor: cyan and magenta letters on a dark screen', mon);
  t.ok(mon.prompt === 'monitor', 'looking at the monitor names it', mon.prompt);
  t.ok(mon.tasks === 1 && mon.hook === 'Написать письмо партнёру' && mon.msg.startsWith('Новая задача') && mon.redrawn && mon.done && mon.typed, 'a task is added (also with Enter), shown on the screen, done by a tick, and handed to Ark.hooks.onTask', mon);
  t.ok(mon.off < 0.05 && mon.on > 0.95, 'the monitor turns back into a window with the landscape, and on again', { off: mon.off, on: mon.on });

  // ---- a model built in Blender, loaded as glTF -------------------------------------------------------------------------------------------------
  await page.waitForFunction(() => window.__ark.W.B.blenderLamp, null, { timeout: 30000 });
  const lamp = await page.evaluate(() => {
    const { W } = window.__ark, B = W.B, L = B.blenderLamp; let meshes = 0, tris = 0; const box = new THREE.Box3().setFromObject(L), names = [];
    L.traverse(o => { if (o.isMesh) { meshes++; tris += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; names.push(o.material.name); } });
    return { meshes, tris, height: +(box.max.y - box.min.y).toFixed(2), foot: +box.min.y.toFixed(2), names, oldHidden: B.deskLampOld.every(o => !o.visible) };
  });
  t.ok(lamp.meshes === 2 && lamp.tris > 200 && lamp.height > 0.35 && lamp.height < 0.45 && Math.abs(lamp.foot - 0.79) < 0.01 && lamp.oldHidden, 'the desk lamp comes from Blender (a glb file): two meshes, brass and green glass, standing on the desk', lamp);

  // ---- the rooms built in Blender: shape, baked occlusion, and the same measures as the walking rules ----------------------------------------------
  await page.waitForFunction(() => window.__ark.W.B.roomsMeshes, null, { timeout: 60000 });
  const rm = await page.evaluate(() => {
    const { W } = window.__ark, B = W.B, root = B.roomsRoot, out = {}, ray = new THREE.Raycaster();
    root.updateMatrixWorld(true);
    const box = n => new THREE.Box3().setFromObject(root.getObjectByName(n) || root.children.find(c => c.name.startsWith(n)));
    const nodes = []; root.traverse(o => { if (o.name && /^room_/.test(o.name)) nodes.push(o.name); });
    const bm = new THREE.Box3(), bh = new THREE.Box3();
    root.traverse(o => { if (o.isMesh) { const b = new THREE.Box3().setFromObject(o); (o.material.name.endsWith('.main') ? bm : bh).union(b); } });
    out.main = [bm.min.x, bm.max.x, bm.min.z, bm.max.z, bm.max.y].map(v => +v.toFixed(2)); out.hall = [bh.min.x, bh.max.x, bh.min.z, bh.max.z, bh.max.y].map(v => +v.toFixed(2));
    let std = 0, withAo = 0, uv1 = 0, meshes = 0;
    root.traverse(o => { if (!o.isMesh) return; meshes++; if (o.geometry.attributes.uv1) uv1++; if (o.material.isMeshStandardMaterial) { std++; if (o.material.aoMap && o.material.aoMap.channel === 1) withAo++; } });
    out.meshes = meshes; out.std = std; out.withAo = withAo; out.uv1 = uv1; out.primitivesHidden = B.arch.every(g => !g.visible);
    const hit = (ox, oy, oz, dx, dy, dz, far) => { ray.set(new THREE.Vector3(ox, oy, oz), new THREE.Vector3(dx, dy, dz)); ray.far = far; const h = ray.intersectObject(root, true); return h.length ? +h[0].distance.toFixed(2) : null; };
    // the doorway (the walking rules say |z| < 1.3): free at z = 0 and 1.0, a wall at 1.6 and -1.6
    out.door = [0, 1.0, -1.0].map(z => hit(5, 1.5, z, 1, 0, 0, 6)); out.wall = [1.6, -1.6].map(z => hit(5, 1.5, z, 1, 0, 0, 6));
    out.floors = [hit(0, 2, 0, 0, -1, 0, 4), hit(15.3, 2, 0, 0, -1, 0, 4)]; out.ceilings = [hit(0, 2, 0, 0, 1, 0, 4), hit(15.3, 2, 0, 0, 1, 0, 4)];
    return out;
  });
  t.ok(rm.meshes >= 14 && rm.primitivesHidden && rm.std >= 10 && rm.withAo === rm.std && rm.uv1 === rm.meshes, 'the rooms come from Blender (a glb): every mesh has a second UV set, every lit material the baked occlusion map; the primitives are hidden', rm);
  // walls, cornices and pilasters stick out past the walkable limits by a little, never inside them
  t.ok(rm.main[0] <= -7.0 && rm.main[0] > -7.5 && rm.main[1] >= 7.2 && rm.main[1] < 7.5 && rm.main[2] <= -5.0 && rm.main[2] > -5.4 && rm.main[3] >= 5.3 && rm.main[3] < 5.6 && Math.abs(rm.main[4] - 4.6) < 0.1, 'the main room holds the walking area (14 x 10 m) with its trim outside it', rm.main);
  t.ok(rm.hall[0] <= 7.2 && rm.hall[0] > 7.0 && rm.hall[1] >= 29.0 && rm.hall[1] < 29.8 && rm.hall[2] <= -6.5 && rm.hall[2] > -7.0 && rm.hall[3] >= 6.5 && rm.hall[3] < 7.0 && rm.hall[4] >= 4.6 && rm.hall[4] < 5.0, 'the hall holds the walking area (22 x 13 m) with its trim outside it', rm.hall);
  t.ok(rm.door.every(d => d === null) && rm.wall.every(d => d !== null && d < 2.5) && Math.abs(rm.floors[0] - 2) < 0.05 && Math.abs(rm.floors[1] - 2) < 0.05 && Math.abs(rm.ceilings[0] - 1.8) < 0.1 && Math.abs(rm.ceilings[1] - 2.6) < 0.1, 'the doorway is open at |z| < 1.3 and walled beside it; the floors are at 0, the ceilings at 3.8 and 4.6', rm);

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
