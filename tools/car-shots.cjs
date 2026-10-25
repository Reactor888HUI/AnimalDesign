// 8 видов машины игрока прямо из игры (съёмочный режим __t.cine): те же ракурсы, что в tools/blender/car-review.py.
// Запуск: PW=$(npm root -g)/playwright node tools/car-shots.cjs <vaz|suv> <папка>   → game-1.png … game-8.png (800×600)
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PW || 'playwright');
const [veh, out] = process.argv.slice(2);
// вид: [камера x, y, z, куда смотреть x, y, z, верт. угол обзора°] в координатах машины (x — вперёд, y — вверх, z — вправо)
const VIEWS = JSON.parse(fs.readFileSync(path.join(__dirname, 'car-views.json'), 'utf8'));
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 800, height: 600 } })).newPage();
  await p.addInitScript(v => { try { localStorage.setItem('baklan3d-v1', JSON.stringify({ unlocked: 1, best: {}, quality: 'high', vehicle: v, time: 'day' })); } catch (e) {} }, veh);
  await p.goto('file://' + path.resolve(__dirname, '../arcade/index.html') + '#test');
  await p.waitForFunction(() => window.__t, null, { timeout: 120000 });
  await p.evaluate(v => window.__t.suv(v === 'suv'), veh);
  await p.evaluate(() => window.__t.teleport(15, 0, 0)); await p.waitForTimeout(2500);
  await p.evaluate(() => window.__t.cine(true));
  for (let i = 0; i < VIEWS.length; i++) {
    const [name, v] = VIEWS[i];
    await p.evaluate(v => {
      const pose = { x: 15, y: window.__y0 ?? (window.__y0 = window.__t.car().y), z: 0, yaw: 0, pitch: 0, roll: 0, v: 0 };
      window.__t.cineStep(0, pose, [20, 5, 0, 15, 0, 0, 30]);
      carObj.updateMatrixWorld(true);
      const c = carObj.localToWorld(new T.Vector3(v[0], v[1], v[2])), l = carObj.localToWorld(new T.Vector3(v[3], v[4], v[5]));
      for (let k = 0; k < 3; k++) window.__t.cineStep(.016, pose, [c.x, c.y, c.z, l.x, l.y, l.z, v[6]]);
    }, v);
    await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(out, `game-${i + 1}.png`) });
  }
  console.log('снято', VIEWS.length, 'видов:', veh);
  await b.close();
})();
