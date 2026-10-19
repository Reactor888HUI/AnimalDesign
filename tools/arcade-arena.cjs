// Ростов Арена: присоски (въезд в стену с разгона, подъём, езда по кругу, прыжок со стены, задание «300 м по стене»),
// круг по трассе вокруг Арены через все ворота по порядку. Запуск: PW=$(npm root -g)/playwright node tools/arcade-arena.cjs
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
  const A = await ev(() => __t.arena());
  out.arena = { wallLen: Math.round(A.len), trackLen: Math.round(A.trackLen), gates: A.gates.length };
  // присоски: от ворот 2 к стене под углом
  const [gx, gz, tx, tz] = A.gates[2], yaw0 = Math.atan2(-(A.C[1] - gz), A.C[0] - gx), yt = Math.atan2(-tz, tx);
  await ev(([x, z, y]) => { __t.teleport(x, z, y); __t.setCar({ v: 24 }); }, [gx, gz, yaw0 + (Math.sin(yt - yaw0) > 0 ? .9 : -.9)]);
  await p.keyboard.down("ArrowUp");
  let w = null; for (let i = 0; i < 20 && !w; i++) { await run(150); w = (await ev(() => __t.arena())).wall; }
  out.attached = !!w;
  await p.keyboard.down("ArrowLeft"); await run(800); await p.keyboard.up("ArrowLeft");
  const w1 = (await ev(() => __t.arena())).wall; out.climbed = w1 && w1.y > (w ? w.y : 0) + 3;
  await run(6000);
  const w2 = (await ev(() => __t.arena())).wall; out.rodeMeters = w2 ? Math.round(w2.dist) : 0;
  await ev(() => __t.hop()); await run(200);
  out.jumpedOff = !(await ev(() => __t.arena())).wall && (await ev(() => __t.car())).air;
  await p.keyboard.up("ArrowUp"); await run(4000);
  const c = await ev(() => __t.car()); out.landed = c.phase === "free" && !c.air;
  out.wallMission = !!(await ev(() => __t.missions())).wall;
  // круг: едем по точкам кольца трассы через ворота по порядку
  const G = A.gates; await ev(([x, z, tx, tz]) => __t.teleport(x - tx * 25, z - tz * 25, Math.atan2(-tz, tx)), G[0]);
  const way = []; for (let k = 1; k <= G.length; k++) { const a = G[k - 1], g = G[k % G.length]; for (let f = 1 / 3; f <= 1.001; f += 1 / 3) way.push([a[0] + (g[0] - a[0]) * f, a[1] + (g[1] - a[1]) * f]); }
  let wi = 0, lapSeen = false, t = 0;
  for (; t < 90 && wi < way.length; t += .2) {
    const c = await ev(() => __t.car()), h = await ev(() => __t.heading());
    if (await ev(() => !!__t.lap())) lapSeen = true;
    while (wi < way.length && Math.hypot(way[wi][0] - c.x, way[wi][1] - c.z) < 18) wi++;
    if (wi >= way.length) break;
    let d = Math.atan2(-(way[wi][1] - c.z), way[wi][0] - c.x) - h; d = Math.atan2(Math.sin(d), Math.cos(d));
    for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) await p.keyboard.up(k);
    await p.keyboard.down((Math.abs(d) > .4 && c.v > 14) || c.v > 26 ? "ArrowDown" : "ArrowUp");
    if (d > .06) await p.keyboard.down("ArrowLeft"); else if (d < -.06) await p.keyboard.down("ArrowRight");
    await run(200);
  }
  for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) await p.keyboard.up(k);
  await run(1500);
  out.lap = { started: lapSeen, waypoints: `${wi}/${way.length}`, seconds: +t.toFixed(1), best: await ev(() => JSON.parse(localStorage.getItem("baklan3d-v1")).arenaLap || null) };
  const ok = !!(!errs.length && out.attached && out.climbed && out.rodeMeters > 150 && out.jumpedOff && out.landed && out.wallMission && out.lap.started && out.lap.best);
  console.log(JSON.stringify({ ok, ...out, errors: errs }, null, 2));
  await b.close(); process.exit(ok ? 0 : 1);
})();
