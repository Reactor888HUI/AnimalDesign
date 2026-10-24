// P0.1: вызовы отрисовки, треугольники и FPS в трёх точках мира при качестве 1.0
// Запуск: PW=$(npm root -g)/playwright node tools/arcade-perf.cjs
const { chromium } = require(process.env.PW || 'playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'], proxy: { server: process.env.HTTPS_PROXY } });
  const p = await (await b.newContext({ viewport: { width: 400, height: 820 }, ignoreHTTPSErrors: true })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(o => { try { localStorage.setItem('baklan3d-v1', JSON.stringify({ unlocked: 1, best: {}, quality: 'mid', vehicle: o.veh, cam: o.cam })); } catch (e) {} }, { veh: process.env.VEH || 'vaz', cam: process.env.CAM || 'chase' });   // VEH=suv — с внедорожником, CAM=cockpit — из кабины
  await p.goto('file://' + require('path').resolve(__dirname, '../arcade/index.html') + '#test');
  await p.waitForTimeout(1500);
  for (const [n, x, z, yaw] of [['autobahn', -60, -46, 0], ['city', 880, -560, -Math.PI / 2], ['city-x', 300, -170, 0]]) {
    await p.evaluate(([x, z, yaw]) => window.__t.teleport(x, z, yaw), [x, z, yaw]);
    await p.waitForTimeout(1200);
    // real-time fps over 3 s
    const fps = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(f) : r(n / 3); }; requestAnimationFrame(f); }));
    console.log(n, JSON.stringify(await p.evaluate(() => window.__t.info())), 'fps', fps.toFixed(1));
  }
  console.log('errors:', errs);
  await b.close();
})();
