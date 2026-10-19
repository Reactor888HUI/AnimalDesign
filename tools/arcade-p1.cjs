// P1: занос и крен кузова, «руль + педаль» двумя пальцами (CDP touch), камера на заднем ходу и у домов, звук без ошибок.
// Запуск: PW=$(npm root -g)/playwright node tools/arcade-p1.cjs
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
const SHOTS = process.env.SHOTS || ".";
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const ctx = await b.newContext({ viewport: { width: 400, height: 820 }, hasTouch: true, ignoreHTTPSErrors: true });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.clock.install();
  await p.goto("file://" + path.resolve(__dirname, "../arcade/index.html") + "#test");
  await p.clock.runFor(1200);
  const ev = (f, a) => p.evaluate(f, a);
  const out = {};

  // 1. занос: разгон по автобану, потом руль + тормоз
  await ev(() => { localStorage.clear(); });
  await p.keyboard.down("ArrowUp"); await p.clock.runFor(4500);
  out.speedBefore = (await ev(() => __t.car())).v;
  await p.keyboard.down("ArrowLeft"); await p.keyboard.down("ArrowDown"); await p.clock.runFor(400);
  const d1 = await ev(() => __t.drift());
  await p.keyboard.up("ArrowDown"); await p.clock.runFor(300);
  out.drift = { ...d1, vlAbs: Math.abs(d1.vl) };
  await p.screenshot({ path: path.join(SHOTS, "p1-drift.png") });
  await p.keyboard.up("ArrowLeft"); await p.keyboard.up("ArrowUp");
  await p.clock.runFor(2500);
  out.driftAfter = await ev(() => __t.drift());
  out.sound = await ev(() => __t.sound());

  // 2. при разгоне нос приподнимается (при торможении — клюёт, см. drift.bodyPitch)
  await ev(() => __t.teleport(-60, -46.25, 0));
  await p.keyboard.down("ArrowUp"); await p.clock.runFor(500);
  out.pitchAccel = (await ev(() => __t.drift())).bodyPitch;
  await p.keyboard.up("ArrowUp");

  // 3. руль + педаль: переключить управление (джойстик → руль)
  await p.click("#dock-btn"); await p.clock.runFor(200);
  await p.click("#m-ctrl"); out.ctrlLabel = await p.textContent("#m-ctrl");
  await p.click("#dock-btn"); await p.clock.runFor(200);
  await ev(() => __t.teleport(-60, -46.25, 0));
  const cdp = await ctx.newCDPSession(p);
  const TT = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
  const L = x => ({ x, y: 600, id: 1 }), Rt = y => ({ x: 320, y, id: 2 });
  await TT("touchStart", [Rt(600)]); await p.clock.runFor(2500);
  const w1 = await ev(() => __t.car()), h1 = await ev(() => __t.heading());
  await TT("touchStart", [Rt(600), L(100)]);
  for (let x = 110; x <= 160; x += 10) await TT("touchMove", [Rt(600), L(x)]);
  await p.clock.runFor(800);
  out.wheelShown = await p.$eval("#wheel", e => !e.hidden); out.pedalText = await p.textContent("#pedal");
  await p.screenshot({ path: path.join(SHOTS, "p1-wheel.png") });
  const h2 = await ev(() => __t.heading());
  await TT("touchEnd", [L(160)]); await p.clock.runFor(100);
  for (let y = 610; y <= 680; y += 10) await TT("touchMove", [Rt(y)]);
  await p.clock.runFor(600);
  out.pedalBrakeText = await p.textContent("#pedal");
  const w3 = await ev(() => __t.car());
  await TT("touchEnd", [Rt(680)]); await p.clock.runFor(200);
  out.wheel = { gasSpeed: w1.v, turnedRight: h2 < h1, dHeading: h2 - h1, brakeSlows: w3.v < w1.v + 6 && w3.v < (await ev(() => __t.car())).v + 1, hiddenAfter: await p.$eval("#wheel", e => e.hidden) && await p.$eval("#pedal", e => e.hidden) };

  // 4. камера на заднем ходу выше, чем при езде вперёд
  await ev(() => __t.teleport(-60, -46.25, 0));
  await p.keyboard.down("ArrowUp"); await p.clock.runFor(1500); await p.keyboard.up("ArrowUp");
  const camF = await ev(() => __t.cam()), carF = await ev(() => __t.car());
  await ev(() => __t.teleport(-60, -46.25, 0));
  await p.keyboard.down("ArrowDown"); await p.clock.runFor(2500);
  const camR = await ev(() => __t.cam()), carR = await ev(() => __t.car());
  await p.keyboard.up("ArrowDown");
  out.reverse = { fwdH: camF.y, revH: camR.y, revV: carR.v, higher: camR.y > camF.y + 1 };

  // 5. камера не заходит в дома: машина у стены, задом к дому
  const houses = await ev(() => __t.houses());
  let inside = 0, tried = 0;
  for (const hb of houses.filter((_, i) => i % Math.max(1, Math.floor(houses.length / 12)) === 0).slice(0, 12)) {
    // стоим в 1,5 м перед стеной x1 и смотрим от дома (по +x)
    const z = (hb.z0 + hb.z1) / 2, x = hb.x1 + 2.5;
    const blocked = await ev(([x, z]) => __t.houses().some(b => x > b.x0 - 1.5 && x < b.x1 + 1.5 && z > b.z0 - 1.5 && z < b.z1 + 1.5 && x - b.x1 !== 2.5), [x, z]);
    if (blocked) continue;
    await ev(([x, z]) => __t.teleport(x, z, 0), [x, z]); await p.clock.runFor(1200);
    const c = await ev(() => __t.cam()); tried++; if (c.inside) { inside++; console.error("camera inside at", x, z, JSON.stringify(c)); }
    if (tried === 1) await p.screenshot({ path: path.join(SHOTS, "p1-wallcam.png") });
  }
  out.cityCam = { tried, inside };

  const ok = errs.length === 0 && out.drift.vlAbs > 3 && Math.abs(out.drift.bodyRoll) > 1 && out.pitchAccel > .3 && out.drift.bodyPitch < 0 &&
    out.ctrlLabel.includes("руль") && out.wheel.gasSpeed > 10 && out.wheel.turnedRight && out.pedalBrakeText === "ТОРМОЗ" && out.wheel.hiddenAfter &&
    out.reverse.higher && out.reverse.revV < -1 && tried > 3 && inside === 0;
  console.log(JSON.stringify({ ok, ...out, errors: errs }, null, 2));
  await b.close(); process.exit(ok ? 0 : 1);
})();
