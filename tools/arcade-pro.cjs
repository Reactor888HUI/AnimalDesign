// PRO «Бесконечный Безлимит»: кнопка в меню, полёт по ПРЫГ с бесконечным газом, плавная посадка и занос на руле,
// баклажановый разгон перед трамплином, присоски не отпускают даже без скорости.
// Запуск: PW=$(npm root -g)/playwright node tools/arcade-pro.cjs   (скриншот — в каталог SHOTS)
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const p = await (await b.newContext({ viewport: { width: 400, height: 820 } })).newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message + e.stack));
  await p.clock.install();
  await p.goto("file://" + path.resolve(__dirname, "../arcade/index.html") + "#test");
  await p.clock.runFor(1200);
  await p.evaluate(() => { localStorage.clear(); __t.fast(true); });
  const ev = (f, a) => p.evaluate(f, a), run = ms => p.clock.runFor(ms), out = {}, car = () => ev(() => __t.car()), ps = () => ev(() => __t.proState());
  const B = await ev(() => __t.boosts()); out.boosts = { pads: B.filter(o => o.kind === "pad").length, roofPads: B.filter(o => o.kind === "pad" && o.y > 3).length, rings: B.filter(o => o.kind === "ring").length };
  // меню: кнопка PRO
  await p.click("#dock-btn"); await run(200); await p.click("#m-modes"); await run(200); await p.click('.lvl[data-i="pro"]'); await run(500);
  out.menu = await ps(); out.hud = await p.textContent("#h-top");
  // взлёт по ПРЫГ, держим 5 с — высота растёт, газ 100
  await p.keyboard.down("ArrowUp"); await run(1500);
  await ev(() => __t.key("hop", true)); await run(5000);
  let s = await ps(), c = await car(); out.fly = { y: +c.y.toFixed(1), flying: s.flying, gas: s.gas, v: +c.v.toFixed(1) };
  await ev(() => __t.key("hop", false));
  // отпустили — плавная посадка; газ и руль вправо — после касания машину заносит
  await p.keyboard.down("ArrowRight");
  let landed = false; for (let i = 0; i < 80 && !landed; i++) { await run(250); s = await ps(); c = await car(); landed = !s.flying && !c.air && c.phase === "free"; }
  let vl = 0; for (let i = 0; i < 6; i++) { await run(100); vl = Math.max(vl, Math.abs((await ev(() => __t.drift())).vl)); }
  await p.keyboard.up("ArrowRight"); await p.keyboard.up("ArrowUp");
  out.land = { landed, phase: c.phase, y: +c.y.toFixed(1), driftVl: +vl.toFixed(1) };
  // разгон-дорожка перед трамплином
  const pad = B.find(o => o.kind === "pad" && o.y < 1);
  await ev(([x, z, yaw]) => __t.teleport(x - Math.cos(yaw) * 15, z + Math.sin(yaw) * 15, yaw), [pad.x, pad.z, pad.yaw]);
  await p.keyboard.down("ArrowUp"); let vmax = 0; for (let i = 0; i < 20; i++) { await run(150); vmax = Math.max(vmax, (await car()).v); } await p.keyboard.up("ArrowUp");
  out.boost = { vmax: +vmax.toFixed(1) };
  await run(3000);
  // присоски в PRO: медленно не отваливаемся
  const A = await ev(() => __t.arena()); const [gx, gz, tx, tz] = A.gates[2], yaw0 = Math.atan2(-(A.C[1] - gz), A.C[0] - gx), yt = Math.atan2(-tz, tx);
  await ev(([x, z, y]) => { __t.teleport(x, z, y); __t.setCar({ v: 24 }); }, [gx, gz, yaw0 + (Math.sin(yt - yaw0) > 0 ? .9 : -.9)]);
  await p.keyboard.down("ArrowUp"); let w = null; for (let i = 0; i < 20 && !w; i++) { await run(150); w = (await ev(() => __t.arena())).wall; }
  await p.keyboard.up("ArrowUp"); await p.keyboard.down("ArrowDown"); await run(4000); await p.keyboard.up("ArrowDown"); await run(6000);
  const w2 = (await ev(() => __t.arena())).wall; out.wall = { attached: !!w, stillOn: !!w2, v: w2 && +w2.v.toFixed(1), gas: (await ps()).gas };
  await p.screenshot({ path: path.join(process.env.SHOTS || ".", "pro-wall.png") });
  const ok = !errs.length && out.boosts.pads >= 10 && out.boosts.roofPads >= 5 && out.boosts.rings >= 10 && out.menu.pro && out.hud.startsWith("PRO") &&
    out.fly.flying && out.fly.y > 30 && out.fly.gas === 100 && out.land.landed && out.land.driftVl > 2 && out.boost.vmax > 45 && out.wall.attached && out.wall.stillOn;
  console.log(JSON.stringify({ ok, ...out, errors: errs }, null, 2));
  await b.close(); process.exit(ok ? 0 : 1);
})();
