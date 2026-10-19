// P0.2: джойстик под первым пальцем + ПРЫГ вторым пальцем (настоящие touch-события через CDP)
// Запуск: PW=$(npm root -g)/playwright node tools/arcade-multitouch.cjs
const { chromium } = require(process.env.PW || 'playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'], proxy: { server: process.env.HTTPS_PROXY } });
  const ctx = await b.newContext({ viewport: { width: 400, height: 820 }, hasTouch: true, isMobile: false, ignoreHTTPSErrors: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.install();
  await p.goto('file://' + require('path').resolve(__dirname, '../arcade/index.html') + '#test');
  await p.clock.runFor(1200);
  await p.evaluate(() => { window.__ev = []; ['pointerdown','pointerup','pointercancel','lostpointercapture','gotpointercapture'].forEach(t => document.getElementById('stage').addEventListener(t, e => window.__ev.push(t + ':' + e.pointerId + ':' + (e.target.id || e.target.className || e.target.tagName)), true)); });
  const cdp = await ctx.newCDPSession(p);
  const hop = await (await p.$('#b-hop')).boundingBox();
  const H = { x: hop.x + hop.width / 2, y: hop.y + hop.height / 2 };
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const f1 = (y) => ({ x: 150, y, id: 1 });
  await T('touchStart', [f1(520)]);
  for (let y = 515; y >= 460; y -= 11) { await T('touchMove', [f1(y)]); }
  await p.clock.runFor(2500);
  const s1 = await p.evaluate(() => window.__t.car());
  // second finger on ПРЫГ while first keeps holding gas
  await T('touchStart', [f1(460), { x: H.x, y: H.y, id: 2 }]);
  await p.clock.runFor(120);
  await T('touchEnd', [{ x: H.x, y: H.y, id: 2 }]);   // отпускаем только палец 2
  await p.clock.runFor(300);
  const s2 = await p.evaluate(() => window.__t.car());
  const joyVisible = await p.$eval('#joy', e => !e.hidden);
  await p.clock.runFor(2000);
  const s3 = await p.evaluate(() => window.__t.car());
  await T('touchEnd', [f1(460)]);
  await p.clock.runFor(300);
  console.log(JSON.stringify({ beforeHop: s1, afterHop: s2, joyStillHeld: joyVisible, laterSpeedGrows: s3.v > s2.v, s3, joyHiddenAtEnd: await p.$eval('#joy', e => e.hidden) }));
  console.log(await p.evaluate(() => window.__ev.join(' | ')));
  console.log('errors', errs);
  await b.close();
})();
