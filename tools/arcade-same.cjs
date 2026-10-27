// Эталонные кадры для проверки «ничего не изменилось»: часы страницы заморожены, Math.random с зерном,
// 7 точек мира (обе машины) → PNG + сводка сцены (вызовы, треугольники, объекты) в JSON.
// Запуск: PW=$(npm root -g)/playwright node tools/arcade-same.cjs <путь к index.html> <папка для кадров>
// Сравнение двух папок: python3 -I tools/same-diff.py <папка А> <папка Б>
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PW || 'playwright');
const [html, out] = process.argv.slice(2);
const SHOTS = [                 // автобан и трюк-парк — площадки южнее карты (TZ = −3330)
  ['autobahn', -60, -3376, 0, 'vaz'], ['city', 880, -560, -Math.PI / 2, 'vaz'], ['city-x', 300, -170, 0, 'vaz'],
  ['trickpark', 296, -3330, 0, 'vaz'], ['arena', 380, -1460, Math.PI, 'vaz'], ['west', 2600, -1500, -Math.PI / 2, 'vaz'],
  ['suv-city', 880, -560, -Math.PI / 2, 'suv'],
];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 400, height: 820 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    let s = 888; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    try { localStorage.setItem('baklan3d-v1', JSON.stringify({ unlocked: 1, best: {}, quality: 'mid', vehicle: 'vaz' })); } catch (e) {}
  });
  await p.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  await p.clock.pauseAt(new Date('2026-01-01T12:00:01Z'));   // время идёт только через runFor — кадры повторяемы
  await p.goto('file://' + path.resolve(html) + '#test');
  for (let i = 0; i < 600 && !(await p.evaluate(() => !!window.__t)); i++) { await p.clock.runFor(50); await p.waitForTimeout(50); }
  await p.waitForTimeout(2500);                     // картинки из data: декодируются по настоящим часам
  await p.clock.runFor(1500);
  const sum = {};
  for (const [n, x, z, yaw, veh] of SHOTS) {
    await p.evaluate(v => window.__t.suv(v === 'suv'), veh);
    await p.evaluate(([x, z, yaw]) => window.__t.teleport(x, z, yaw), [x, z, yaw]);
    await p.waitForTimeout(400); await p.clock.runFor(1000);
    await p.screenshot({ path: path.join(out, n + '.png') });
    sum[n] = await p.evaluate(() => { const i = window.__t.info(); delete i.fps; return i; });
  }
  sum.errors = errs;
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(sum, null, 1));
  console.log(JSON.stringify(sum));
  await b.close();
})();
