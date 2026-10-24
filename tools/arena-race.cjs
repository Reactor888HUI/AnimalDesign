// Гран-при Арены: бот встаёт в рамку стартового поля, ждёт огни и проезжает 3 круга по осевой (руль — по курсу на точку
// впереди). Проверяет: старт по огням, счёт кругов и мест, финиш, соперники едут; печатает время кругов (калибровка соперников).
// Запуск: PW=$(npm root -g)/playwright node tools/arena-race.cjs [скорость бота, м/с]
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const p = await (await b.newContext({ viewport: { width: 480, height: 300 } })).newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.addInitScript(() => localStorage.setItem("baklan3d-v1", JSON.stringify({ unlocked: 1, quality: "low", trained: true, partyFx: false, kino: false })));
  await p.clock.install();
  await p.goto("file://" + path.resolve(__dirname, "../arcade/index.html") + "#test");
  await p.clock.runFor(2500);
  const ev = (f, a) => p.evaluate(f, a), run = ms => p.clock.runFor(ms);
  const VT = +(process.argv[2] || 24);
  const g = await ev(() => { const R = __t.irace(), G = R && __t.iraceAt(0, 0); return { L: R.L }; });
  // в рамку №4 (последняя), лицом по ходу
  await ev(() => { const st = __t.irace(); const q = __t.iraceAt(-7 - 9 - 3, 1.9); __t.teleport(q.x, q.z, Math.atan2(-q.tz, q.tx)); });
  for (let i = 0; i < 12; i++) await run(250);
  const out = { L: Math.round(g.L), states: [] };
  let st = await ev(() => __t.irace()); out.countdown = st.st === "count" || st.st === "race";
  for (let i = 0; i < 40 && st.st !== "race"; i++) { await run(200); st = await ev(() => __t.irace()); }
  out.started = st.st === "race";
  const t0 = await ev(() => __t.simTime()); let laps = [], last = -1, maxPlace = 0, minPlace = 9;
  for (let i = 0; i < 1200 && st.st === "race"; i++) {
    const c = await ev(() => __t.car()), me = await ev(([x, z]) => { const R = __t.irace(); return R; }, [c.x, c.z]);
    const tgt = await ev(([x, z, v]) => { const A = __t.arena().C; let a = Math.atan2(z - A[1], x - A[0]); const q = __t.iraceAt(0, 0); return null; }, [c.x, c.z, c.v]);
    const aim = await ev(([x, z]) => { // точка на осевой на 14 м впереди
      let best = 0, bd = 1e9; const R = __t.irace(); for (let s = 0; s < R.L; s += 2) { const q = __t.iraceAt(s, 0), d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; best = s; } } const q = __t.iraceAt(best + 14, 0); return [q.x, q.z]; }, [c.x, c.z]);
    const want = Math.atan2(-(aim[1] - c.z), aim[0] - c.x); let d = want - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) await p.keyboard.up(k);
    if (c.v < VT) await p.keyboard.down("ArrowUp"); else if (c.v > VT + 3) await p.keyboard.down("ArrowDown");
    if (d > .05) await p.keyboard.down("ArrowLeft"); else if (d < -.05) await p.keyboard.down("ArrowRight");
    await run(100);
    st = await ev(() => __t.irace());
    if (st.lap !== last) { if (last >= 0) laps.push(+(await ev(() => __t.simTime()) - t0).toFixed(1)); last = st.lap; }
    if (st.place) { maxPlace = Math.max(maxPlace, st.place); minPlace = Math.min(minPlace, st.place); }
  }
  for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) await p.keyboard.up(k);
  out.final = { st: st.st, place: st.place, best: st.best && +st.best.toFixed(2), lap: st.lap, ai: st.ai.map(a => ({ v: +a.v.toFixed(1), prog: Math.round(a.prog), done: a.done })) };
  out.lapMarks = laps; out.places = [minPlace, maxPlace];
  out.hud = await p.$eval("#race", e => e.hidden ? "" : e.textContent);
  out.aiMoved = out.final.ai.every(a => a.prog > 100);
  const ok = !errs.length && out.started && st.st === "done" && out.final.best > 0 && out.aiMoved;
  console.log(JSON.stringify({ ok, ...out, errors: errs }, null, 1));
  await b.close(); process.exit(ok ? 0 : 1);
})();
