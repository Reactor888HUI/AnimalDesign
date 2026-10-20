// Внутри Ростов Арены: аэротруба «888» (подъём выше крыши, вылет на крышу, выход вниз в стороне от знака),
// горка-труба с крыши до поля, «Баклажановый поток» (подъём магнитами, три круга, выход ПРЫГ в аэрополёт),
// аэро-слалом по 8 кольцам, крен на трибуне и камера над чашей, кнопка «ВИД», наклон телефона (синтетические события).
// Запуск: PW=$(npm root -g)/playwright node tools/arcade-inner.cjs   (скриншоты — в каталог SHOTS)
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
  await p.addStyleTag({ content: '.joy-hint,.toast{display:none!important}' });
  const ev = (f, a) => p.evaluate(f, a), run = ms => p.clock.runFor(ms), out = {}, car = () => ev(() => __t.car()), inn = () => ev(() => __t.inner());
  const I = await inn(); const SH = process.env.SHOTS || ".";
  // 1. аэротруба
  await ev(([x, z]) => __t.teleport(x - 14, z, 0), [I.pad.x, I.pad.z]);
  await p.keyboard.down("ArrowUp"); let st = null;
  for (let i = 0; i < 30 && !st; i++) { await run(150); st = (await inn()).aero; }
  await p.keyboard.up("ArrowUp");
  out.aeroStart = !!st;
  await ev(() => __t.key("hop", true)); await run(4000); await ev(() => __t.key("hop", false));
  let c = await car(); out.aeroTop = +c.y.toFixed(1); out.aeroMission = !!(await ev(() => __t.missions())).aero;
  await ev(() => __t.fast(false)); await run(1500); await p.screenshot({ path: SH + "/in-aero.png" }); await ev(() => __t.fast(true));
  await p.keyboard.down("ArrowUp"); let y = 0;
  const trc = []; for (let i = 0; i < 60; i++) { await run(200); c = await car(); const ia = (await inn()).aero; trc.push(`${c.y.toFixed(0)}/${ia ? "A" : c.air ? "F" : "G"}`); if (!ia) await p.keyboard.up("ArrowUp"); if (!ia && !c.air) break; } out.trc = trc.join(" ");
  await p.keyboard.up("ArrowUp"); await run(500); c = await car();
  out.aeroToRoof = { y: +c.y.toFixed(1), air: c.air, aero: !!(await inn()).aero };
  // аэротруба: опуститься в стороне
  await ev(([x, z]) => __t.teleport(x - 14, z, 0), [I.pad.x, I.pad.z]); await p.keyboard.down("ArrowUp"); await run(1500); await p.keyboard.up("ArrowUp");
  await run(1500); await p.keyboard.down("ArrowDown"); await run(1200); await p.keyboard.up("ArrowDown");
  for (let i = 0; i < 60; i++) { await run(250); if (!(await inn()).aero) break; }
  await run(1500); c = await car(); out.aeroDown = { y: +c.y.toFixed(1), air: c.air, aero: !!(await inn()).aero, phase: c.phase };
  // 2. горка-труба
  const m = I.slide0; await ev(([x, z, yaw]) => __t.teleport(x, z, yaw, 29), [m.p.x - m.T.x * 16, m.p.z - m.T.z * 16, Math.atan2(-m.T.z, m.T.x)]);
  await p.keyboard.down("ArrowUp"); let tb = null;
  for (let i = 0; i < 30 && !tb; i++) { await run(150); tb = (await inn()).tube; }
  await p.keyboard.up("ArrowUp"); out.slideStart = !!tb;
  await run(2500); await p.screenshot({ path: SH + "/in-slide.png" });
  await p.keyboard.down("ArrowRight"); await run(2500); await p.keyboard.up("ArrowRight");
  for (let i = 0; i < 80; i++) { await run(250); if (!(await inn()).tube) break; }
  await run(800); c = await car(); out.slideEnd = { y: +c.y.toFixed(1), v: +c.v.toFixed(1), phase: c.phase, mission: !!(await ev(() => __t.missions())).slide };
  // 3. Баклажановый поток
  await ev(([x, z]) => __t.teleport(x - 12, z, 0), [I.padE.x, I.padE.z]);
  await p.keyboard.down("ArrowUp"); tb = null;
  for (let i = 0; i < 30 && !(tb && tb.flow); i++) { await run(150); tb = (await inn()).tube; }
  out.flowStart = !!(tb && tb.flow);
  await run(5000); await p.screenshot({ path: SH + "/in-flow.png" });
  for (let i = 0; i < 60; i++) { await run(500); tb = (await inn()).tube; if (!tb || tb.laps >= 3) break; }
  await p.keyboard.up("ArrowUp");
  out.flow = { laps: tb && tb.laps, v: tb && +tb.v.toFixed(1), mission: !!(await ev(() => __t.missions())).flow3 };
  await ev(() => __t.hop()); await run(400); out.flowToAero = !!(await inn()).aero;
  for (let i = 0; i < 80; i++) { await run(250); if (!(await inn()).aero) break; }
  await run(1500); c = await car(); out.flowEnd = { y: +c.y.toFixed(1), air: c.air, phase: c.phase, aero: !!(await inn()).aero };
  await p.screenshot({ path: SH + "/in-end.png" });
  // катапульта: 5-й круг потока на скорости → дуга над крышей Арены на площадь, двойная бочка, мягкая посадка
  await ev(([x, z]) => __t.teleport(x - 12, z, 0), [I.padE.x, I.padE.z]);
  await p.keyboard.down("ArrowUp"); tb = null;
  for (let i = 0; i < 30 && !(tb && tb.flow); i++) { await run(150); tb = (await inn()).tube; }
  await ev(() => __t.flowSet(4, 80));
  for (let i = 0; i < 80; i++) { await run(250); tb = (await inn()).tube; if (!tb) break; await ev(() => __t.flowSet(4, 80)); }
  await p.keyboard.up("ArrowUp");
  let maxY = 0, landed = null;
  for (let i = 0; i < 150; i++) { await run(200); c = await car(); maxY = Math.max(maxY, c.y); if (!c.air) { landed = c; break; } }   // полёт ~10–13 с
  await run(1500); c = await car();
  const AC = await ev(() => __t.arena()), outside = Math.hypot(c.x - AC.C[0], c.z - AC.C[1]);
  out.catapult = { maxY: +maxY.toFixed(1), landed: !!landed, phase: c.phase, dist: Math.round(outside), wallR: Math.round(AC.len / (2 * Math.PI)), mission: !!(await ev(() => __t.missions())).flowShot };
  // аэро-слалом: в аэротрубе проходим кольца по порядку
  await ev(([x, z]) => __t.teleport(x - 14, z, 0), [I.pad.x, I.pad.z]);
  await p.keyboard.down("ArrowUp"); for (let i = 0; i < 30 && !(await inn()).aero; i++) await run(150); await p.keyboard.up("ArrowUp");
  const SL = await ev(() => __t.slalom());
  for (const [x, y, z] of SL.gates) for (let k = 0; k < 5; k++) { await ev(([x, y, z]) => __t.setPos(x, y - .6, z), [x, y, z]); await run(50); }   // держим у кольца несколько кадров
  out.slalom = { gates: SL.gates.length, mission: !!(await ev(() => __t.missions())).slalom };
  // трибуна: едем поперёк склона — машина кренится по склону, камера не уходит под трибуну
  const A = await ev(() => __t.arena()), ang = 2.2, Dx = Math.cos(ang), Dz = Math.sin(ang);
  let px = A.C[0], pz = A.C[1]; for (let d = 0; d < 300; d += 1) { const h = await ev(([x, z]) => __t.bowlH(x, z), [A.C[0] + Dx * d, A.C[1] + Dz * d]); if (h != null && h > 8) { px = A.C[0] + Dx * d; pz = A.C[1] + Dz * d; break; } }
  await ev(([x, z, yaw, y]) => __t.teleport(x, z, yaw, y), [px, pz, Math.atan2(-Dx, -Dz), await ev(([x, z]) => __t.bowlH(x, z), [px, pz])]);
  await p.keyboard.down("ArrowUp"); let roll = 0, under = 0;
  for (let i = 0; i < 12; i++) { await run(150); roll = Math.max(roll, Math.abs(await ev(() => __t.slopeRoll()))); const cm = await ev(() => __t.cam()), bh = await ev(([x, z]) => __t.bowlH(x, z), [cm.x, cm.z]); if (bh != null && cm.y < bh + 1) under++; }
  await p.keyboard.up("ArrowUp");
  out.stands = { roll: +roll.toFixed(1), camUnder: under };
  // кнопка «ВИД» и наклон телефона
  const cams = []; for (let i = 0; i < 3; i++) { await p.click("#cam-btn"); cams.push((await ev(() => __t.ctl())).cam); }
  out.cams = cams.join(",");
  await p.click("#dock-btn"); await run(200); await p.click("#m-tilt"); await run(200);
  const orient = (beta, gamma) => ev(([b, g]) => dispatchEvent(new DeviceOrientationEvent("deviceorientation", { alpha: 0, beta: b, gamma: g })), [beta, gamma]);
  await orient(50, 0); await orient(36, 16); const ctl = await ev(() => __t.ctl());
  out.tilt = { on: ctl.tilt.on, turn: +ctl.turn.toFixed(2), thr: +ctl.thr.toFixed(2) };
  await orient(62, -16); const ctl2 = await ev(() => __t.ctl()); out.tilt.turnL = +ctl2.turn.toFixed(2); out.tilt.brk = +ctl2.brk.toFixed(2);
  await p.click("#m-tilt");
  const ok = out.catapult && out.catapult.landed && out.catapult.phase === "free" && out.catapult.maxY > 90 && out.catapult.dist > out.catapult.wallR + 60 && out.catapult.mission && !errs.length && out.aeroStart && out.aeroMission && out.aeroTop > 35 && out.aeroToRoof.y >= 28 && !out.aeroToRoof.aero &&
    !out.aeroDown.aero && out.aeroDown.phase === "free" && out.slideStart && out.slideEnd.mission && out.slideEnd.phase === "free" &&
    out.flowStart && out.flow.laps >= 3 && out.flow.mission && out.flowToAero && !out.flowEnd.aero && out.flowEnd.phase === "free" &&
    out.slalom.mission && out.stands.roll > 15 && out.stands.camUnder === 0 && out.cams === "far,cockpit,chase" &&
    out.tilt.on && out.tilt.turn > .3 && out.tilt.thr > .3 && out.tilt.turnL < -.3 && out.tilt.brk > .3;
  console.log(JSON.stringify({ ok, ...out, errors: errs }, null, 2));
  await b.close(); process.exit(ok ? 0 : 1);
})();
