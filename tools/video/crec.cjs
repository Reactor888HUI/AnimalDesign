// Покадровая съёмка ролика по сценарию tools/video/cine.js (режим #test → __t.cine / __t.cineStep). Кадры JPEG → ffmpeg.
// Пример: PW=$(npm root -g)/playwright node tools/video/crec.cjs preview "1,10,20" | node tools/video/crec.cjs full frames 24 1280 720 [t0] [t1]
// съёмка ролика: node crec.cjs preview "t1,t2,..." | node crec.cjs full <outdir> [fps] [w] [h] [t0] [t1]
const { chromium } = require(process.env.PW || 'playwright');
const fs = require('fs');
const [mode, arg, fpsA, wA, hA, t0A, t1A] = process.argv.slice(2);
const URL = process.env.URL || 'file://' + require('path').resolve(__dirname, '../../arcade/index.html') + '#test';
(async () => {
  const W = +(wA || (mode === 'preview' ? 640 : 1280)), Hh = +(hA || (mode === 'preview' ? 360 : 720));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: W, height: Hh } })).newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.addInitScript(() => localStorage.setItem('baklan3d-v1', JSON.stringify({ unlocked: 1, quality: 'high', sound: false })));
  await p.goto(URL); await p.waitForFunction(() => window.__t, null, { timeout: 90000 }); await p.waitForTimeout(1500);
  await p.addScriptTag({ path: __dirname + '/cine.js' });
  const marks = await p.evaluate(() => { __t.cine(true); __t.paint(-1); __t.setTime(window.CINE_TIME || 'sunset'); __t.traffic && 0; window.__prevT = -1; return CINE_SCRIPT.marks; });
  console.log(JSON.stringify(marks));
  const step = (t, dt, skip) => p.evaluate(([t, dt, skip]) => {
    const f = CINE_SCRIPT.frame(t, window.__prevT); window.__prevT = t;
    f.evs.forEach(fn => fn());
    const c = f.c, fw = new THREE.Vector3(1, 0, 0).applyQuaternion(c.q);
    __t.cineStep(dt, { x: c.p.x, y: c.p.y, z: c.p.z, yaw: Math.atan2(-fw.z, fw.x), v: c.v, air: !!c.air, q: c.q.toArray(), up: c.up && c.up.toArray(), noShadow: !!c.noShadow }, f.cam, skip);
    if (window.__cap !== f.cap) { window.__cap = f.cap; __t.cineCap(f.cap); }
    return c.v;
  }, [t, dt, skip]);
  if (mode === 'preview') {
    const ts = arg.split(',').map(Number).sort((a, b) => a - b); let t = 0; const dt = 1 / 8;
    for (const tt of ts) { while (t + dt < tt) { await step(t, dt, true); t += dt; } await step(tt, Math.max(1e-3, tt - t), false); t = tt; await p.waitForTimeout(450); await p.screenshot({ path: `pv-${tt.toFixed(1)}.jpg`, type: 'jpeg', quality: 80 }); }
  } else {
    const out = arg, fps = +(fpsA || 24), T = await p.evaluate(() => CINE_SCRIPT.T), ta = +(t0A || 0), tb = +(t1A || T);
    fs.mkdirSync(out, { recursive: true });
    const speeds = []; const t0 = Date.now();
    // разгон: до ta — без кадров
    let t = 0; for (; t < ta - 1e-6; t += 1 / fps) await step(t, 1 / fps, true);
    for (let i = Math.round(ta * fps); i / fps <= tb; i++) {
      const tt = i / fps; speeds.push([tt, await step(tt, 1 / fps, false)]);
      await p.waitForTimeout(30);
      await p.screenshot({ path: `${out}/f${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
      if (i % 48 === 0) console.log('frame', i, 't', tt.toFixed(1), 's', ((Date.now() - t0) / 1000).toFixed(0));
    }
    fs.writeFileSync(`${out}/speeds-${ta}.json`, JSON.stringify(speeds));
  }
  console.log('errs', errs); await b.close();
})();
