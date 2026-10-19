// Посадочный баллон: падение без газа с высоты и с креном заканчивается мягкой посадкой на колёса,
// вверх колёсами — честной аварией. Плюс: все уровни в «Режимах» доступны и запускаются.
// Запуск: PW=$(npm root -g)/playwright node tools/arcade-landing.cjs
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
  const toasts = () => p.evaluate(() => window.__toasts.splice(0));
  await p.evaluate(() => { window.__toasts = []; const t = document.getElementById("toast"); new MutationObserver(() => window.__toasts.push(t.textContent)).observe(t, { childList: true, subtree: true, characterData: true }); });
  // скорость касания: запоминаем вертикальную скорость в последнем кадре полёта
  await p.evaluate(() => { let last = 0; setInterval(() => { const d = __t.vy(); if (d.air) last = d.vy; else if (last) { window.__impact = +(-last).toFixed(1); last = 0; } }, 5); });
  const drop = async (name, o) => {
    await p.evaluate(o => { __t.teleport(-300, 150, 0); __t.setGas(0); __t.setCar({ y: o.y, vy: 0, v: 8, roll: o.roll, om: 0, air: true }); }, o);
    const b0 = (await p.evaluate(() => __t.burst())).used;
    await p.clock.runFor(o.ms);
    const c = await p.evaluate(() => __t.car()), b1 = (await p.evaluate(() => __t.burst())).used;
    return { name, phase: c.phase, air: c.air, burst: b1 - b0, toasts: await toasts(), impact: await p.evaluate(() => window.__impact) };
  };
  const out = { drops: [] };
  out.drops.push(await drop("40 м, без газа, ровно", { y: 40, roll: 0, ms: 4000 }));
  out.drops.push(await drop("80 м, без газа, крен 60°", { y: 80, roll: 60, ms: 5500 }));
  out.drops.push(await drop("25 м, без газа, крен 100°", { y: 25, roll: 100, ms: 3500 }));
  await p.click("#dock-btn"); await p.clock.runFor(150); await p.click("#m-assist"); await p.click("#dock-btn"); await p.clock.runFor(150);   // ассистент переворота выкл
  out.drops.push(await drop("6 м, вверх колёсами, ассистент выкл", { y: 6, roll: 180, ms: 2500 }));
  await p.click("#dock-btn"); await p.clock.runFor(150); await p.click("#m-assist"); await p.click("#dock-btn"); await p.clock.runFor(150);
  // подлёт к площадке «H» сбоку: касание крыши тоже мягкое
  const pd = (await p.evaluate(() => __t.pads()))[12];
  await p.evaluate(pd => { __t.teleport(pd.x - 25, pd.z, 0); __t.setGas(0); __t.setCar({ y: pd.h + 12, vy: 3, v: 9, roll: 0, om: 0, air: true }); }, pd);
  await p.clock.runFor(4000);
  out.sideRoof = { impact: await p.evaluate(() => window.__impact), y: +(await p.evaluate(() => __t.carY())).toFixed(1), h: pd.h };
  const crashed = d => d.toasts.some(t => /Авария|Приземлились на|Слишком жёстко/.test(t));
  // меню: все уровни открыты, пятый запускается сразу
  await p.click("#dock-btn"); await p.clock.runFor(150); await p.click("#m-modes"); await p.clock.runFor(150);
  out.disabled = await p.$$eval("#levels .lvl", bs => bs.filter(x => x.disabled).length);
  out.items = await p.$$eval("#levels .lvl", bs => bs.length);
  await p.click('.lvl[data-i="4"]'); await p.clock.runFor(300);
  out.level5 = await p.textContent("#toast");
  out.title = await p.title();
  const [d1, d2, d3, d4] = out.drops;
  const ok = !errs.length && [d1, d2, d3].every(d => d.burst === 1 && d.impact <= 6 && !crashed(d) && d.phase === "free" && !d.air) && crashed(d4) && d4.burst === 1 &&
    out.sideRoof.impact <= 6 && Math.abs(out.sideRoof.y - out.sideRoof.h) < .3 && out.disabled === 0 && out.items === 7 && /^Уровень 5/.test(out.level5) && out.title === "Восьмёрка Баклажан";
  console.log(JSON.stringify({ ok, ...out, errors: errs }, null, 2));
  await b.close(); process.exit(ok ? 0 : 1);
})();
