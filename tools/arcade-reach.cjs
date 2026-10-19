// P0.3: из 9 точек карты доезжаем до автобана (тестовый «водитель» держит газ, рулит по улицам и объезжает препятствия)
// Запуск: PW=$(npm root -g)/playwright node tools/arcade-reach.cjs
// из разных точек карты, держа газ и рулём наводясь на автобан, должны доехать до зоны «Автобан»
const { chromium } = require(process.env.PW || 'playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'], proxy: { server: process.env.HTTPS_PROXY } });
  const p = await (await b.newContext({ viewport: { width: 400, height: 820 }, ignoreHTTPSErrors: true })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.install();
  await p.goto('file://' + require('path').resolve(__dirname, '../arcade/index.html') + '#test');
  await p.clock.runFor(1000);
  const ZA = -60;
  const starts = [['пустырь юг', 900, 200], ['пустырь запад', -500, 150], ['край востока', 1370, 100], ['центр города', 40, -330], ['глубина города', 500, -480], ['сквер/дома', 210, -290], ['трюк-парк за автобусами', 420, 45], ['полигон у трибуны', 120, 30], ['север за городом', 900, -520]];
  const res = [];
  for (const [name, x, z] of starts) {
    await p.evaluate(([x, z]) => window.__t.teleport(x, z, z < -60 ? -Math.PI / 2 : Math.PI / 2), [x, z]);
    let ok = false, t = 0, slow = 0, avoid = 0, px = null, pz = null, hints = new Set();
    for (; t < 60 && !ok; t += .25) {
      // «водитель»: держит газ и рулит носом на ближайшую точку оси автобана
      const c = await p.evaluate(() => window.__t.car());
      await p.keyboard.down('ArrowUp');
      const heading = await p.evaluate(() => window.__t.heading());
      slow = Math.hypot(c.x - (px ?? c.x + 9), c.z - (pz ?? c.z)) < .3 ? slow + .25 : 0; px = c.x; pz = c.z;
      if (slow > 1.5) avoid = 2;                                   // упёрлись — объезжаем: 2 с вбок
      avoid = Math.max(0, avoid - .25);
      // в городе — сначала по поперечной улице к ближайшей продольной (они идут к автобану), потом прямо
      const XS = []; for (let x = -200; x <= 760; x += 80) XS.push(x);
      const nx = XS.reduce((a, b) => Math.abs(b - c.x) < Math.abs(a - c.x) ? b : a);
      const inCity = c.z < ZA - 19 && c.x > -210 && c.x < 770;
      let target = c.z < ZA ? -Math.PI / 2 : Math.PI / 2;
      if (inCity && Math.abs(nx - c.x) > 2.5) target = nx > c.x ? 0 : Math.PI;
      target += avoid > 0 ? 1.4 : 0;
      let d = target - heading; d = Math.atan2(Math.sin(d), Math.cos(d));
      await p.keyboard.up('ArrowLeft'); await p.keyboard.up('ArrowRight');
      if (d > .15) await p.keyboard.down('ArrowLeft'); else if (d < -.15) await p.keyboard.down('ArrowRight');
      await p.clock.runFor(250);
      ok = (await p.textContent('#zone')) === 'Автобан';
      const tt = await p.$eval('#toast', e => e.hidden ? '' : e.textContent); if (tt.startsWith('Застряли')) hints.add(t.toFixed(0));
    }
    await p.keyboard.up('ArrowUp'); await p.keyboard.up('ArrowLeft'); await p.keyboard.up('ArrowRight');
    res.push(`${name}: ${ok ? 'доехал за ' + t.toFixed(1) + ' с' : 'НЕ ДОЕХАЛ, стоит в ' + JSON.stringify(await p.evaluate(() => window.__t.car()))}${hints.size ? ' · подсказка «Застряли» на ' + [...hints].join(',') + ' с' : ''}`);
  }
  console.log(res.join('\n')); console.log('errors', errs);
  await b.close();
})();
