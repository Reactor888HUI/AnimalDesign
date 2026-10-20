// Дороги и высоты: вдоль каждой улицы через 2 м нет ступенек больше 0,7 м (машина проезжает везде, «без ям»),
// концы мостов вровень с землёй, сетка склона смотрит вверх, предметы на склоне стоят на земле;
// машина проезжает Ворошиловский мост с правого берега до левого (и по построенному съезду, если сеть у моста обрывается).
// Запуск: PW=$(npm root -g)/playwright node tools/arcade-roads.cjs
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const p = await (await b.newContext({ viewport: { width: 400, height: 820 } })).newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  await p.clock.install(); await p.goto("file://" + path.resolve(__dirname, "../arcade/index.html") + "#test"); await p.clock.runFor(1200);
  const ev = (f, a) => p.evaluate(f, a);
  const out = await ev(() => __t.audit());
  // проезд: с проспекта на мост, через Дон и по съезду на Левобережную
  await ev(() => __t.fast(true));
  const D = (await ev(() => __t.decks()))[0], north = D.dz < 0, k = north ? 1 : -1, P = s => [D.cx + D.dx * s + D.nx * (D.lc + D.hw * .3), D.cz + D.dz * s + D.nz * (D.lc + D.hw * .3)];
  const [sx, sz] = P(north ? D.s0 - 40 : D.s1 + 40);
  await ev(([x, z, y]) => __t.teleport(x, z, y), [sx, sz, Math.atan2(-D.dz * k, D.dx * k)]);
  // по мосту, затем по съезду: рулим к точкам съезда, пока не доедем до Левобережной
  const link = await ev(() => __t.links());
  out.link = link.map(l => l.name);
  const way = [P(north ? D.s1 - 5 : D.s0 + 5), ...(link[0] ? link[0].pts.slice(1) : [])];
  let c, maxY = 0, wi = 0;
  for (let i = 0; i < 160 && wi < way.length; i++) {
    c = await ev(() => __t.car()); maxY = Math.max(maxY, c.y); if (c.phase !== "free") break;
    while (wi < way.length && Math.hypot(way[wi][0] - c.x, way[wi][1] - c.z) < 10) wi++;
    if (wi >= way.length) break;
    const h = await ev(() => __t.heading()); let d = Math.atan2(-(way[wi][1] - c.z), way[wi][0] - c.x) - h; d = Math.atan2(Math.sin(d), Math.cos(d));
    for (const k2 of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) await p.keyboard.up(k2);
    await p.keyboard.down(c.v > 24 ? "ArrowDown" : "ArrowUp"); if (d > .08) await p.keyboard.down("ArrowLeft"); else if (d < -.08) await p.keyboard.down("ArrowRight");
    await p.clock.runFor(250);
  }
  for (const k2 of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) await p.keyboard.up(k2);
  out.reachedLink = wi >= way.length;
  out.drive = { maxY: +maxY.toFixed(1), end: [Math.round(c.x), Math.round(c.z), +c.y.toFixed(1)], phase: c.phase, zone: await ev(() => __t.zone()) };
  const ok = !errs.length && out.steps.length === 0 && out.deckEnds.every(d => Math.abs(d) < .35) && out.hillUp > .99 && out.items.off === 0 && out.poles.checked > 100 && out.poles.onRoad === 0 && out.drive.maxY > 12 && out.drive.phase === "free" && out.reachedLink && out.drive.end[2] < 2;   // съезд строится, только если сеть у конца моста обрывается
  console.log(JSON.stringify({ ok, ...out, errors: errs }, null, 1));
  await b.close(); process.exit(ok ? 0 : 1);
})();
