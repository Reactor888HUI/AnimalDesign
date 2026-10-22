// короткий ролик вечеринки 888 у баннера: node cparty.cjs <outdir> [w h]
const { chromium } = require(process.env.PW || 'playwright'); const fs = require('fs');
const [out, wA, hA] = process.argv.slice(2), W = +(wA || 720), H = +(hA || 1280);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: W, height: H } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => localStorage.setItem('baklan3d-v1', JSON.stringify({ unlocked: 1, quality: 'high', trained: true, sound: false })));
  await p.goto('file://' + require('path').resolve(__dirname, '../../arcade/index.html') + '#test'); await p.waitForFunction(() => window.__t, null, { timeout: 90000 }); await p.waitForTimeout(1500);
  fs.mkdirSync(out, { recursive: true });
  await p.evaluate(() => { __t.cine(true); const A = __t.ARENA; let b = A.at(0); for (let s = 0; s < A.len; s++) { const q = A.at(s); if (q.x > b.x) b = q; } window.__B = b; window.__d = 0; });
  const fps = 30, T0 = 2, T = 8.5;
  for (let i = 0; i < T * fps; i++) {
    const t = i / fps;
    await p.evaluate(([t, dt, T0]) => {
      if (Math.abs(t - T0) < dt / 2) __t.party(true);
      const st = __t.party(), slow = st.on && st.t < 3 ? .3 : 1, v = 9 * slow; window.__d += v * dt;
      const b = window.__B, d = 92 - window.__d, x = b.x + b.nx * d, z = b.z + b.nz * d, yaw = Math.atan2(b.nz, -b.nx);
      __t.cineStep(dt, { x, y: __t.ground(x, z, 3).h, z, yaw, v }, null);
    }, [t, 1 / fps, T0]);
    await p.screenshot({ path: `${out}/f${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  }
  console.log('errs', errs); await b.close();
})();
