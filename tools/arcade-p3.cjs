// P3: обвес машины переключается, номерной знак на месте, на улицах Ростова есть фонари, светофоры и «зебры»,
// сигналы светофоров меняются, таблица рекордов без базы (локальный файл) спрятана и не ломает игру.
// Запуск: PW=$(npm root -g)/playwright node tools/arcade-p3.cjs
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const p = await (await b.newContext({ viewport: { width: 400, height: 820 }, ignoreHTTPSErrors: true })).newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.clock.install();
  await p.goto("file://" + path.resolve(__dirname, "../arcade/index.html") + "#test");
  await p.clock.runFor(1200);
  const out = {};
  out.street = await p.evaluate(() => __t.street());
  const s0 = await p.evaluate(() => __t.signals()); await p.clock.runFor(9000); const s1 = await p.evaluate(() => __t.signals());
  out.signalsChange = JSON.stringify(s0) !== JSON.stringify(s1);
  out.oneLitPerHead = [...s0, ...s1].every(g => g.length === 3);
  await p.click("#dock-btn"); await p.clock.runFor(200);
  const labels = [];
  for (let i = 0; i < 3; i++) { labels.push(await p.textContent("#m-tune")); await p.click("#m-tune"); await p.clock.runFor(100); }
  out.tuneLabels = labels; out.tuneSaved = await p.evaluate(() => JSON.parse(localStorage.getItem("baklan3d-v1")).tune);
  out.boardHidden = await p.$eval("#m-board-h", e => e.hidden);
  // таблица рекордов с подставной базой: игра пишет свой документ scores/<id> и рисует список
  const p2 = await (await b.newContext({ viewport: { width: 400, height: 820 }, ignoreHTTPSErrors: true })).newPage();
  p2.on("pageerror", e => errs.push(e.message));
  await p2.addInitScript(() => {
    window.__writes = []; let snap = null;
    const rows = () => [{ id: "u_other", data: () => ({ best: 9000, missions: 3 }) }, ...window.__writes.slice(-1).map(w => ({ id: w.path.split("/")[1], data: () => w.data }))].sort((a, b) => b.data().best - a.data().best);
    const q = { orderBy: () => q, limit: () => q, onSnapshot: cb => { snap = cb; cb({ docs: rows() }); return () => {}; } };
    const db = { collection: () => q, doc: path => ({ set: async data => { window.__writes.push({ path, data }); snap && snap({ docs: rows() }); } }) };
    const user = { id: async () => "u_me", profiles: async ids => Object.fromEntries(ids.map(i => [i, { id: i, name: i === "u_other" ? "Соседка" : "" }])) };
    window.claude = { use: async n => n === "db" ? db : n === "user" ? user : null };
  });
  await p2.clock.install();
  await p2.goto("file://" + path.resolve(__dirname, "../arcade/index.html") + "#test");
  await p2.clock.runFor(1200);
  await p2.evaluate(() => __t.fast(true));
  await p.close();
  {   // задание «мост» (Ворошиловский, из конца в конец) → очки → запись
    const D = (await p2.evaluate(() => __t.decks()))[0], north = D.dz < 0, k = north ? 1 : -1, s = north ? D.s0 + 4 : D.s1 - 4, l = D.lc + D.hw * .45;
    await p2.evaluate(([x, z, y]) => __t.teleport(x, z, y), [D.cx + D.dx * s + D.nx * l, D.cz + D.dz * s + D.nz * l, Math.atan2(-D.dz * k, D.dx * k)]);
    await p2.keyboard.down("ArrowUp"); await p2.clock.runFor(18000); await p2.keyboard.up("ArrowUp");
  }
  await p2.clock.runFor(9000);   // мост теперь с подъёмом от правого берега: задание засчитывается позже, запись — через 4 с после него
  out.boardMissions = await p2.evaluate(() => __t.missions()); out.boardCar = await p2.evaluate(() => __t.car());
  out.boardWrites = await p2.evaluate(() => window.__writes.map(w => ({ path: w.path, best: w.data.best })));
  await p2.click("#dock-btn"); await p2.clock.runFor(300);
  out.boardText = await p2.$eval("#m-board", e => e.innerText.replace(/\s+/g, " "));
  await p2.screenshot({ path: path.join(process.env.SHOTS || ".", "p3-board.png") });
  const ok = !errs.length && out.boardWrites.length >= 1 && out.boardWrites[0].path === "scores/u_me" && /Соседка/.test(out.boardText) && /вы/.test(out.boardText) && out.street.lamps > 10 && out.street.signals > 20 && out.street.zebras > 200 && out.signalsChange &&
    new Set(labels).size === 3 && out.tuneSaved === 0 && out.boardHidden;
  console.log(JSON.stringify({ ok, ...out, errors: errs }, null, 2));
  await b.close(); process.exit(ok ? 0 : 1);
})();
