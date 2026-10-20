// Шоу «Восьмёрка»: бот проезжает 3 круга по восьмёрке (очки за трассу растут, есть итог и рекорд), дрифт даёт свои очки,
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
  await ev(() => __t.teleport(1010, 150, -Math.PI / 2));
  out.drive = await drive(3, 17);
  await run(1500);
  out.after = await ev(() => __t.show());
  out.best = await ev(() => __t.showBest());
  out.card = await p.$eval("#showcard", e => e.hidden ? "" : e.innerText.replace(/\s+/g, " "));
  out.top = await p.textContent("#h-top");
  // дрифт и срыв: после финиша 6 с паузы, затем снова на старт, разгон до перекрёстка, занос и «закрутило»
  await run(7000);
  await ev(() => __t.teleport(1010, 150, -Math.PI / 2)); await ev(() => __t.setCar({ v: 15 })); await run(1500);
  out.started = !!(await ev(() => __t.show()));
  await ev(() => __t.setCar({ v: 22, vl: 7 })); await run(120);
  out.drift = ((await ev(() => __t.show())) || {}).drift;
  await ev(() => __t.setCar({ v: 10, vl: 16 })); await run(300);
  out.spin = await ev(() => __t.show());
  await p.screenshot({ path: path.join(process.env.SHOTS || ".", "eight-spin.png") });
  const ok = !errs.length && out.drive.seenShow && out.drive.maxMult >= 3 && out.best > 500 && /ШОУ/.test(out.card) &&
    out.started && out.drift > 0 && out.spin && out.spin.spins === 1 && out.spin.clean === 0 && out.spin.drift === 0;
  console.log(JSON.stringify({ ok, ...out, errors: errs }, null, 2));
  await b.close(); process.exit(ok ? 0 : 1);
})();
