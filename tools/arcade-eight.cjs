// Дрифт-трек 888 (шоу «Восьмёрка»): на треке — дрифтовый руль на экране (показывает поворот, ±120°) и широкая резина; бот проезжает 3 круга по восьмёрке (очки за трассу растут, есть итог и рекорд), дрифт даёт свои очки,
// срыв (закрутило) сжигает очки шоу. Запуск: PW=$(npm root -g)/playwright node tools/arcade-eight.cjs
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const p = await (await b.newContext({ viewport: { width: 400, height: 820 } })).newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.clock.install();
  await p.goto("file://" + path.resolve(__dirname, "../arcade/index.html") + "#test");
  await p.clock.runFor(1200);
  await p.evaluate(() => { localStorage.clear(); __t.fast(true); });
  const ev = (f, a) => p.evaluate(f, a), run = ms => p.clock.runFor(ms), out = {};
  const E = { ax: 960, bx: 1060, z: 170, r: 50 };
  // путь: петля A против часовой (через дальние ворота a), затем петля B по часовой (через ворота b)
  const way = [];
  for (let d = 15; d <= 360; d += 15) way.push([E.ax + Math.cos(d * Math.PI / 180) * E.r, E.z + Math.sin(d * Math.PI / 180) * E.r]);
  for (let d = 165; d >= -180; d -= 15) way.push([E.bx + Math.cos(d * Math.PI / 180) * E.r, E.z + Math.sin(d * Math.PI / 180) * E.r]);
  const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
  const drive = async (laps, vmax) => {
    let wi = 0, n = 0, t = 0, seenShow = false, maxMult = 1;
    for (; t < 400 && n < laps * way.length; t += .2) {
      const c = await ev(() => __t.car()), h = await ev(() => __t.heading()), s = await ev(() => __t.show());
      if (s) { seenShow = true; maxMult = Math.max(maxMult, s.mult); }
      const [wx, wz] = way[wi];
      if (Math.hypot(wx - c.x, wz - c.z) < 9) { wi = (wi + 1) % way.length; n++; continue; }
      let d = Math.atan2(-(wz - c.z), wx - c.x) - h; d = Math.atan2(Math.sin(d), Math.cos(d));
      for (const k of keys) await p.keyboard.up(k);
      await p.keyboard.down(c.v > vmax ? "ArrowDown" : "ArrowUp");
      if (d > .05) await p.keyboard.down("ArrowLeft"); else if (d < -.05) await p.keyboard.down("ArrowRight");
      await run(200);
    }
    for (const k of keys) await p.keyboard.up(k);
    return { t: +t.toFixed(1), points: n, seenShow, maxMult };
  };
  await ev(() => __t.teleport(1010, 150, -Math.PI / 2)); await run(300);
  for (let i = 0; i < 20 && !(await ev(() => __t.driftKit().on)); i++) await run(150);   // на медленном рендере кадр с переключением может ещё не пройти
  out.kit = await ev(() => __t.driftKit());
  // дрифтовый руль на экране показывает поворот: «вправо» — около +120°, отпустили — в центр (управление — обычное)
  {
    await ev(() => __t.fast(false));
    await p.keyboard.down("ArrowRight"); await run(600);
    out.wheelHeld = { ...(await ev(() => __t.driftKit())), turn: (await ev(() => __t.ctl())).turn };
    await p.keyboard.up("ArrowRight"); await run(800);
    out.wheelBack = (await ev(() => __t.driftKit())).ang;
    // две руки: левая половина экрана — руль (палец вправо — руль вправо), правая — газ; старый маленький руль не появляется
    await p.mouse.move(100, 520); await p.mouse.down(); await p.mouse.move(175, 520, { steps: 4 }); await run(400);
    out.hands = { turn: (await ev(() => __t.ctl())).turn, ang: (await ev(() => __t.driftKit())).ang, oldWheel: await p.$eval("#wheel", e => !e.hidden) };
    await p.mouse.up(); await run(200);
    await p.mouse.move(300, 520); await p.mouse.down(); await run(200);
    out.hands.thr = (await ev(() => __t.ctl())).thr; out.hands.pedal = await p.$eval("#pedal", e => !e.hidden && e.textContent);
    await p.mouse.up(); await run(200);
    await ev(() => __t.fast(true));
  }
  await ev(() => __t.teleport(1010, 150, -Math.PI / 2));
  out.drive = await drive(3, 17);
  await run(1500);
  out.after = await ev(() => __t.show());
  out.best = await ev(() => __t.showBest());
  out.card = await p.$eval("#showcard", e => e.hidden ? "" : e.innerText.replace(/\s+/g, " "));
  out.top = await p.textContent("#h-top");
  out.badge = (await ev(() => __t.driftKit())).badge;
  // дрифт и срыв: после финиша 6 с паузы (финиш запускает вечеринку 888 — 7 с замедления), затем снова на старт, разгон до перекрёстка, занос и «закрутило»
  await run(11000);
  await ev(() => __t.teleport(1010, 150, -Math.PI / 2)); await ev(() => __t.setCar({ v: 15 })); await run(1500);
  out.started = !!(await ev(() => __t.show()));
  await ev(() => __t.setCar({ v: 22, vl: 7 })); await run(120);
  out.drift = ((await ev(() => __t.show())) || {}).drift;
  await ev(() => __t.setCar({ v: 10, vl: 16 })); await run(300);
  out.spin = await ev(() => __t.show());
  await p.screenshot({ path: path.join(process.env.SHOTS || ".", "eight-spin.png") });
  const ok = !errs.length && out.kit.on && out.kit.ui && out.kit.wheels.every(Boolean) && out.wheelHeld.ang > 100 && out.wheelHeld.turn > .5 && Math.abs(out.wheelBack) < 5 && out.hands.turn > .9 && out.hands.ang > 90 && !out.hands.oldWheel && out.hands.thr === 1 && out.hands.pedal === "ГАЗ" && out.badge && out.drive.seenShow && out.drive.maxMult >= 3 && out.best > 500 && /ТРЕК 888/.test(out.card) &&
    out.started && out.drift > 0 && out.spin && out.spin.spins === 1 && out.spin.clean === 0 && out.spin.drift === 0;
  console.log(JSON.stringify({ ok, ...out, errors: errs }, null, 2));
  await b.close(); process.exit(ok ? 0 : 1);
})();
