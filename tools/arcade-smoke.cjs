// Дымовой тест игры «Восьмёрка Баклажан»: открывает страницу в headless Chromium,
// едет по автобану джойстиком, проверяет меню «⋯», перенос на полигон и ошибки в консоли.
// Запуск: PW=$(npm root -g)/playwright node tools/arcade-smoke.cjs
// Скриншоты складываются в каталог из SHOTS (по умолчанию — текущий).
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
const SHOTS = process.env.SHOTS || ".";
const PAGE = "file://" + path.resolve(__dirname, "../arcade/index.html");

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium",
    args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
  });
  const p = await (await b.newContext({ viewport: { width: 400, height: 820 }, ignoreHTTPSErrors: true })).newPage();
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.clock.install();                 // ненастоящее время: физика идёт ровно, даже если рендер медленный
  await p.goto(PAGE);
  await p.clock.runFor(1200);
  const text = id => p.$eval(id, e => (e.hidden ? "" : e.textContent));
  const shot = n => p.screenshot({ path: path.join(SHOTS, `smoke-${n}.png`) });

  // джойстик: зажать в центре и потянуть вверх — газ
  await p.mouse.move(200, 500); await p.mouse.down(); await p.mouse.move(200, 440, { steps: 4 });
  await p.clock.runFor(3000);
  const speed = +(await p.textContent("#h-speed"));
  await p.mouse.move(245, 445, { steps: 3 }); await p.clock.runFor(500); await shot("drive");
  await p.mouse.up();

  // меню «⋯» и перенос на полигон
  await p.click("#dock-btn"); await p.clock.runFor(200); await shot("dock");
  await p.click("#m-go button:nth-child(4)"); await p.clock.runFor(300);
  const zone = await p.textContent("#zone");

  const ok = errs.length === 0 && speed > 20 && zone === "Полигон";
  console.log(JSON.stringify({ ok, speed, zone, toast: await text("#toast"), errors: errs }, null, 2));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
