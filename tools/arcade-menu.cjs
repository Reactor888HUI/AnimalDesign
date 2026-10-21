// Меню на телефоне: «⋯» прокручивается пальцем и не вылезает за поле игры, «Режимы и уровни» сверху,
// из свободной езды касанием запускаются все режимы: уроки, каждый уровень, свободная езда, точки «Куда ехать».
// Плюс: на крышах есть зелёные площадки «H», и посадка на площадку засчитывается.
// Запуск: PW=$(npm root -g)/playwright node tools/arcade-menu.cjs
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const out = { modes: [] }, errs = [];
  for (const vp of [{ width: 360, height: 640 }, { width: 800, height: 360 }]) {      // маленький телефон стоя и боком
    const ctx = await b.newContext({ viewport: vp, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message));
    await p.clock.install();
    await p.goto("file://" + path.resolve(__dirname, "../arcade/index.html") + "#test");
    await p.clock.runFor(1200);
    const fits = async () => p.evaluate(() => { const st = document.getElementById("stage").getBoundingClientRect(), d = document.getElementById("dock-panel").getBoundingClientRect(); return d.bottom <= st.bottom + 1; });
    const open = async () => { if (await p.$eval("#dock-panel", e => e.hidden)) await p.tap("#dock-btn"); await p.clock.runFor(150); };
    await open();
    const r = { vp: `${vp.width}×${vp.height}`, panelFits: await fits() };
    // прокрутка меню до конца — последняя кнопка «Заново» должна стать видимой
    await p.$eval("#dock-panel", e => { e.scrollTop = e.scrollHeight; }); await p.clock.runFor(100);
    r.lastVisible = await p.evaluate(() => { const st = document.getElementById("stage").getBoundingClientRect(), x = document.getElementById("m-restart").getBoundingClientRect(); return x.bottom <= st.bottom + 1 && x.top >= st.top; });
    await p.$eval("#dock-panel", e => { e.scrollTop = 0; });
    const tapLvl = async sel => {
      await open(); await p.tap("#m-modes"); await p.clock.runFor(150);
      await p.$eval(sel, e => e.scrollIntoView({ block: "center" }));
      await p.tap(sel); await p.clock.runFor(400);
      return { sel, menuClosed: await p.$eval("#ov-menu", e => e.hidden), toast: (await p.textContent("#toast")).slice(0, 40) };
    };
    r.modes = [];
    for (const sel of ['.lvl[data-i="train"]', ...[0, 1, 2, 3, 4].map(i => `.lvl[data-i="${i}"]`), '.lvl[data-i="free"]']) r.modes.push(await tapLvl(sel));
    await open(); const goN = await p.$$eval("#m-go button", bs => bs.length);
    await p.tap("#m-go button:nth-child(9)"); await p.clock.runFor(300); r.go8 = await p.evaluate(() => __t.zone());
    out.modes.push(r); await ctx.close();
  }
  // площадка «H»: садимся сверху
  const p = await (await b.newContext({ viewport: { width: 400, height: 820 } })).newPage(); p.on("pageerror", e => errs.push(e.message));
  await p.clock.install(); await p.goto("file://" + path.resolve(__dirname, "../arcade/index.html") + "#test"); await p.clock.runFor(1200);
  await p.evaluate(() => { localStorage.clear(); __t.fast(true); });
  const pads = await p.evaluate(() => __t.pads()); out.pads = pads.length;
  let landed = 0;
  for (const pd of pads.slice(0, 10)) {
    await p.evaluate(pd => { __t.teleport(pd.x, pd.z, 0); __t.setCar({ y: pd.h + 8, vy: 0, v: 0, air: true }); }, pd);
    await p.clock.runFor(3000);
    const y = await p.evaluate(() => __t.carY()), c = await p.evaluate(() => __t.car());
    if (Math.abs(y - pd.h) < .3 && c.phase === "free" && !c.air) landed++;
  }
  out.padLandings = landed + " из " + Math.min(10, pads.length);
  out.roofMission = !!(await p.evaluate(() => __t.missions())).roof;
  const ok = !errs.length && out.modes.every(r => r.panelFits && r.lastVisible && r.modes.every(m => m.menuClosed) && r.go8 === "Восьмёрка") &&
    out.pads > 50 && landed === Math.min(10, pads.length) && out.roofMission;
  console.log(JSON.stringify({ ok, ...out, errors: errs }, null, 2));
  await b.close(); process.exit(ok ? 0 : 1);
})();
