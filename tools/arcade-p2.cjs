// P2: задания свободной езды, повтор лучшего трюка, новые трюк-зоны, трафик (обгон/торможение/авария сверху).
// Запуск: PW=$(npm root -g)/playwright node tools/arcade-p2.cjs
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
const SHOTS = process.env.SHOTS || ".";
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const p = await (await b.newContext({ viewport: { width: 400, height: 820 }, ignoreHTTPSErrors: true })).newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.clock.install();
  await p.goto("file://" + path.resolve(__dirname, "../arcade/index.html") + "#test");
  await p.clock.runFor(1200);
  await p.evaluate(() => { localStorage.clear(); __t.fast(true); });   // рисуем редко: физика не отстаёт от часов теста
  const ev = (f, a) => p.evaluate(f, a), run = ms => p.clock.runFor(ms);
  const M = () => ev(() => __t.missions()), out = {};
  const shot = async n => { await ev(() => __t.draw()); await p.screenshot({ path: path.join(SHOTS, n) }); };
  const keys = async (down, ms) => { for (const k of down) await p.keyboard.down(k); await run(ms); for (const k of down) await p.keyboard.up(k); };

  // мост на левый берег
  await ev(() => __t.teleport(700, -1050, Math.PI / 2)); await keys(["ArrowUp"], 5000);
  out.bridge = !!(await M()).bridge;
  // крыша дома
  const roof = (await ev(() => __t.pads()))[0];       // зелёная площадка «H»
  await ev(r => { __t.teleport(r.x, r.z, 0); __t.setCar({ y: r.h + 4, vy: 0, v: 0, air: true }); }, roof); await run(1500);
  out.roof = { ...(await ev(() => __t.car())), done: !!(await M()).roof, h: roof.h };
  await shot("p2-roof.png");
  // перелёт автобана с трамплина
  await ev(() => { __t.teleport(850, 120, Math.PI / 2); __t.setCar({ v: 42 }); }); await keys(["ArrowUp"], 2000); await run(5000);   // в воздухе газ не держим — иначе сопла несут дальше
  out.overpass = { ...(await ev(() => __t.car())), done: !!(await M()).overpass };
  // автобусы
  await ev(() => { __t.teleport(330, 30, 0); __t.setCar({ v: 40 }); }); await keys(["ArrowUp"], 900); await run(3500);
  out.bus = { ...(await ev(() => __t.car())), done: !!(await M()).bus };
  // лучший трюк записан → кнопка повтора → повтор идёт и заканчивается
  await run(1200);
  out.best = await ev(() => __t.best());
  out.replayBtn = await p.$eval("#b-replay", e => !e.hidden);
  if (!out.replayBtn) { await p.click("#dock-btn"); await run(200); }
  out.replayVia = out.replayBtn ? "кнопка на экране" : "меню «⋯»";
  if (out.best.frames) { await p.click(out.replayBtn ? "#b-replay" : "#m-replay"); await run(600); out.replayOn = (await ev(() => __t.best())).replay; await shot("p2-replay.png"); await run(6000); out.replayEnded = !(await ev(() => __t.best())).replay; }
  // три кольца подряд: пролетаем сквозь кольца трюк-парка
  for (const [x, y, z] of [[349, 6.4, 0], [397, 12.4, 30], [527, 21.4, -15]]) { await ev(([x, y, z]) => { __t.teleport(x, z, 0); __t.setCar({ y, vy: 0, v: 14, air: true }); }, [x, y, z]); await run(2500); }
  out.rings3 = !!(await M()).rings3;
  // две бочки: посадка ровно с накрученными 720°
  await ev(() => { __t.teleport(-300, 150, 0); __t.setCar({ y: 6, vy: 0, v: 5, air: true }); __t.spin(720); }); await run(3000);
  out.barrel2 = !!(await M()).barrel2;
  // «Восьмёрка»: едем по точкам двух петель
  await ev(() => __t.teleport(1010, 172, -Math.PI / 2));
  const way = [];
  for (let i = 1; i <= 24; i++) { const a = i / 24 * Math.PI * 2; way.push([960 + 50 * Math.cos(a), 170 + 50 * Math.sin(a)]); }
  for (let i = 1; i <= 24; i++) { const a = Math.PI - i / 24 * Math.PI * 2; way.push([1060 + 50 * Math.cos(a), 170 + 50 * Math.sin(a)]); }
  way.push([1010, 175]);
  let wi = 0;
  for (let t = 0; t < 45 && wi < way.length; t += .2) {
    const c = await ev(() => __t.car()), h = await ev(() => __t.heading());
    while (wi < way.length && Math.hypot(way[wi][0] - c.x, way[wi][1] - c.z) < 9) wi++;
    if (wi >= way.length) break;
    let d = Math.atan2(-(way[wi][1] - c.z), way[wi][0] - c.x) - h; d = Math.atan2(Math.sin(d), Math.cos(d));
    for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) await p.keyboard.up(k);
    await p.keyboard.down(c.v < 17 ? "ArrowUp" : c.v > 20 ? "ArrowDown" : "ArrowUp");
    if (d > .08) await p.keyboard.down("ArrowLeft"); else if (d < -.08) await p.keyboard.down("ArrowRight");
    await run(200);
  }
  for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) await p.keyboard.up(k);
  await run(500);
  out.eight = { done: !!(await M()).eight, waypoints: wi + "/" + way.length };
  // автобан за 30 с: стартуем разогнанными у знака
  await ev(() => { __t.teleport(-215, -46.25, 0); __t.setCar({ v: 50 }); }); await keys(["ArrowUp"], 29000);
  out.autobahn = { ...(await ev(() => __t.car())), done: !!(await M()).autobahn };

  // трафик: стоим в полосе — машины сзади тормозят или объезжают, а не проезжают сквозь
  const lead = (await ev(() => __t.traffic())).map((c, i) => ({ ...c, i })).find(c => Math.abs(c.zt - -56.65) < .1 && c.x > -300 && c.x < 900);
  const px = lead.x + 60;
  await ev(x => __t.teleport(x, -56.65, 0), px); await run(100);
  let minGap = Infinity, changed = 0;
  const z0 = await ev(() => __t.traffic().map(c => c.zt));
  for (let i = 0; i < 30; i++) {
    await run(300);
    const tr = await ev(() => __t.traffic());
    tr.forEach((c, k) => { if (Math.abs(c.z - -56.65) < 1.2 && c.x < px && c.x > px - 50) minGap = Math.min(minGap, px - c.x); if (c.zt !== z0[k]) changed++; });
  }
  out.traffic = { minGapBehind: +minGap.toFixed(1), laneChanges: changed > 0 };
  // авария сверху: падаем на крышу машины в потоке
  const tc = (await ev(() => __t.traffic())).find(c => c.x > -400 && c.x < 1200 && c.z > -60 && !c.wreck);
  await ev(c => { __t.teleport(c.x, c.z, 0); __t.setCar({ y: 3.2, vy: -2, v: c.v, air: true }); }, tc); await run(800);
  const after = await ev(() => __t.traffic());
  out.stomp = { wrecked: after.some(c => c.wreck > 0), car: await ev(() => __t.car()) };
  await shot("p2-stomp.png");
  await p.click("#dock-btn"); await run(300); await shot("p2-dock.png");
  out.missionsUI = await p.textContent("#m-mis-h");

  const ok = !errs.length && out.bridge && out.roof.done && out.overpass.done && out.bus.done && out.best.frames > 10 && out.replayOn && out.replayEnded &&
    out.rings3 && out.barrel2 && out.eight.done && out.autobahn.done && out.traffic.minGapBehind > 4 && out.stomp.wrecked && out.stomp.car.phase === "free";
  console.log(JSON.stringify({ ok, ...out, errors: errs }, null, 2));
  await b.close(); process.exit(ok ? 0 : 1);
})();
