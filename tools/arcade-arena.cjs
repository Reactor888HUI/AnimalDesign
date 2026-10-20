// Ростов Арена: присоски (въезд в стену с разгона, подъём, езда по кругу, прыжок со стены, задание «300 м по стене»),
// круг по трассе вокруг Арены через все ворота по порядку; мега-трамплины на крышу, чаша-рампа, прыжок с крыши над главным входом. Запуск: PW=$(npm root -g)/playwright node tools/arcade-arena.cjs
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
  let w = null; for (let i = 0; i < 40 && !w; i++) { await run(150); w = (await ev(() => __t.arena())).wall; }
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
  way.push([G[0][0] + G[0][2] * 25, G[0][1] + G[0][3] * 25]);   // за финишные ворота: иначе бот бросал газ за 18 м до них и не всегда докатывался
  let wi = 0, lapSeen = false, t = 0; const lapLog = [];
  for (; t < 90 && wi < way.length; t += .2) {
    const c = await ev(() => __t.car()), h = await ev(() => __t.heading());
    { const L = await ev(() => __t.lap()); if (L) { lapSeen = true; if (L.n !== lapLog[lapLog.length - 1]) lapLog.push(L.n); } else if (lapLog[lapLog.length - 1] !== "-") { lapLog.push("-"); if (lapLog.length > 2) lapLog.push(JSON.stringify(G.map((g, i) => [i, Math.round(Math.hypot(g[0] - c.x, g[1] - c.z))]).filter(e => e[1] < 40))); } }
    // точка ворот (каждая третья) засчитывается ближе 8 м — игра считает ворота в радиусе 11 м; промежуточные — 18 м
    while (wi < way.length && Math.hypot(way[wi][0] - c.x, way[wi][1] - c.z) < (wi % 3 === 2 && wi < way.length - 1 ? 8 : 18)) wi++;
    if (wi >= way.length) break;
    let d = Math.atan2(-(way[wi][1] - c.z), way[wi][0] - c.x) - h; d = Math.atan2(Math.sin(d), Math.cos(d));
    for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) await p.keyboard.up(k);
    await p.keyboard.down((Math.abs(d) > .4 && c.v > 14) || c.v > 26 ? "ArrowDown" : "ArrowUp");
    if (d > .06) await p.keyboard.down("ArrowLeft"); else if (d < -.06) await p.keyboard.down("ArrowRight");
    await run(200);
  }
  for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) await p.keyboard.up(k);
  await run(1500);
  out.lap = { started: lapSeen, waypoints: `${wi}/${way.length}`, seconds: +t.toFixed(1), gatesLog: lapLog.join(" "), best: await ev(() => JSON.parse(localStorage.getItem("baklan3d-v1")).arenaLap || null) };
  // мега-трамплины: разгон с места, газ отпускаем в воздухе — каждый сажает на крышу (29 м)
  out.megas = [];
  for (const m of A.megas) {
    const d = Math.min(m[3] - 5, 75);
    await ev(([x, z, y]) => __t.teleport(x, z, y), [m[0] - Math.cos(m[2]) * d, m[1] + Math.sin(m[2]) * d, m[2]]);
    await p.keyboard.down("ArrowUp");
    let cm, top = 0;
    for (let i = 0; i < 80; i++) { await run(150); cm = await ev(() => __t.car()); top = Math.max(top, cm.y); if (cm.air) await p.keyboard.up("ArrowUp"); if (top > 20 && !cm.air) break; }
    await p.keyboard.up("ArrowUp");
    out.megas.push({ top: +top.toFixed(1), y: +cm.y.toFixed(1), onRoof: !cm.air && cm.phase === "free" && Math.abs(cm.y - 29) < .1 });
  }
  out.roofMission = !!(await ev(() => __t.missions())).arenaRoof;
  // чаша: с поля по трибунам на крышу (газ в сторону главного входа)
  const [kx, kz, ky] = A.roofKick;
  const ax = kx - A.C[0], az = kz - A.C[1], al = Math.hypot(ax, az);    // в 15 м от центра — мимо знака «888»
  await ev(([x, z, y]) => __t.teleport(x, z, y), [A.C[0] + ax / al * 15, A.C[1] + az / al * 15, Math.atan2(-az, ax)]);
  await p.keyboard.down("ArrowUp");
  let top = 0; for (let i = 0; i < 40 && top < 29; i++) { await run(150); top = Math.max(top, (await ev(() => __t.car())).y); }
  await p.keyboard.up("ArrowUp");
  out.bowlToRoof = top >= 29;
  // крыша: разгон к трамплину над главным входом, в полёте — бочка, посадка внизу
  await ev(([x, z, y]) => { __t.teleport(x, z, y, 29); __t.setCar({ v: 22 }); }, [kx - Math.cos(ky) * 22, kz + Math.sin(ky) * 22, ky]);
  await p.keyboard.down("ArrowUp");
  let jump = null, cj;
  for (let i = 0; i < 60; i++) {
    await run(150); cj = await ev(() => __t.car());
    if (cj.air && !jump) { jump = { y: +cj.y.toFixed(1), fromRoof: cj.fromRoof }; await p.keyboard.up("ArrowUp"); await ev(() => __t.spin(360)); }
    if (jump && !cj.air) break;
  }
  await p.keyboard.up("ArrowUp"); await run(1500);
  out.roofJump = { ...jump, landedY: +cj.y.toFixed(1), phase: (await ev(() => __t.car())).phase, mission: !!(await ev(() => __t.missions())).arenaJump };
  const ok = !!(!errs.length && out.megas.length >= 2 && out.megas.every(m => m.onRoof) && out.roofMission && out.bowlToRoof &&
    out.roofJump.fromRoof && out.roofJump.mission && out.roofJump.phase === "free" && out.attached && out.climbed && out.rodeMeters > 150 && out.jumpedOff && out.landed && out.wallMission && out.lap.started && out.lap.best);
  console.log(JSON.stringify({ ok, ...out, errors: errs }, null, 2));
  await b.close(); process.exit(ok ? 0 : 1);
})();
