// Доступность: из разных точек Ростова доезжаем до дороги к площадкам (начинается у южного края карты),
// с площадок-макетов (южнее карты) — до их автобана.
// В Ростове «водитель» едет по пути, найденному в игре по сетке препятствий (дома, вода; с левого берега — только
// через понтонный мост), на пустыре — носом к автобану с объездом. Упёрся — сдаёт назад и ищет путь заново. Запуск: PW=$(npm root -g)/playwright node tools/arcade-reach.cjs
const { chromium } = require(process.env.PW || "playwright");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const p = await (await b.newContext({ viewport: { width: 400, height: 820 }, ignoreHTTPSErrors: true })).newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.clock.install();
  await p.goto("file://" + require("path").resolve(__dirname, "../arcade/index.html") + "#test");
  await p.clock.runFor(1000);
  await p.evaluate(() => __t.fast(true));      // рисуем редко: физика не отстаёт от часов теста
  const ZA = await p.evaluate(() => ZA), TZ = await p.evaluate(() => TZ);

  const places = ["улица Седова", "Береговая улица", "Богатяновский спуск", "Левобережная улица", "улица Бориса Слюсаря"];
  const starts = [["пустырь юг", 900, 200], ["пустырь запад", -500, 150], ["край востока", 1370, 100], ["трюк-парк за автобусами", 420, 45], ["полигон у трибуны", 120, 30]].map(([n, x, z]) => [n, x, z + TZ]);   // площадки
  for (const n of places) { const pt = await p.evaluate(n => __t.place(n), n); if (pt) starts.push([n, pt[0], pt[1], pt[2]]); }
  const res = [];
  for (const [name, x, z, yaw0] of starts) {
    const inCity = z > -2900;                       // Ростов (площадки — южнее −2900)
    await p.evaluate(([x, z, y]) => window.__t.teleport(x, z, y), [x, z, yaw0 ?? (z < ZA ? -Math.PI / 2 : Math.PI / 2)]);
    let path = inCity ? await p.evaluate(([x, z]) => __t.path(x, z), [x, z]) : null;
    const plen = path ? path.length : 0;
    let ok = false, t = 0, wi = 0, stuck = 0, back = 0, detour = 0, px = x, pz = z, wet = false, replans = 0;
    const limit = inCity ? 240 : 60;
    for (; t < limit && !ok; t += .25) {
      const c = await p.evaluate(() => window.__t.car()), heading = await p.evaluate(() => window.__t.heading());
      if (c.phase === "fcrash") wet = wet || await p.evaluate(() => document.getElementById("toast").textContent.startsWith("Искупались"));
      stuck = Math.hypot(c.x - px, c.z - pz) < .4 ? stuck + .25 : 0; px = c.x; pz = c.z;
      if (stuck > 1.5) {
        back = 1; stuck = 0; detour = path ? 0 : 4;
        if (path) { path = await p.evaluate(([x, z]) => __t.path(x, z), [c.x, c.z]) || path; wi = 0; replans++; }
      }
      let target;
      if (path) {
        while (wi < path.length - 1 && Math.hypot(path[wi][0] - c.x, path[wi][1] - c.z) < 6) wi++;
        const [tx, tz] = path[wi]; target = Math.atan2(-(tz - c.z), tx - c.x);
      } else { target = (c.z < ZA ? -Math.PI / 2 : Math.PI / 2) + (detour > 0 && back <= 0 ? 1.3 : 0); detour -= .25; }
      let d = target - heading; d = Math.atan2(Math.sin(d), Math.cos(d));
      for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) await p.keyboard.up(k);
      if (back > 0) { back -= .25; await p.keyboard.down("ArrowDown"); if (d > 0) await p.keyboard.down("ArrowRight"); else await p.keyboard.down("ArrowLeft"); }
      else {
        if (Math.abs(d) < .6 && c.v < (path ? 16 : 30)) await p.keyboard.down("ArrowUp"); else if (c.v > 8) await p.keyboard.down("ArrowDown"); else await p.keyboard.down("ArrowUp");
        if (d > .12) await p.keyboard.down("ArrowLeft"); else if (d < -.12) await p.keyboard.down("ArrowRight");
      }
      await p.clock.runFor(250);
      ok = ["Автобан", "Дорога на полигон"].includes(await p.evaluate(() => __t.zone()));
    }
    for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) await p.keyboard.up(k);
    res.push(`${name}: ${ok ? "доехал за " + t.toFixed(1) + " с" : "НЕ ДОЕХАЛ, стоит в " + JSON.stringify(await p.evaluate(() => window.__t.car()))}${plen ? ` · путь ${plen} точек${replans ? `, перестроен ${replans} раз` : ""}` : ""}${wet ? " · падал в воду" : ""}`);
  }
  console.log(res.join("\n")); console.log("errors", errs);
  await b.close();
  process.exit(res.every(r => r.includes("доехал за")) && !errs.length ? 0 : 1);
})();
