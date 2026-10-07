// God rays and dust: at sunset, looking down a street at the sun, the beams brighten the picture
// (measured on screenshots with and without them); dust motes show in the low sun, none at night.
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker#runner', { live: true });
  await page.evaluate(() => { const r = window.__runner, p = r.player; r.input.poll = () => {}; r.setLevel(2); r.setTheme('sunset'); Object.assign(p, { x: 10, z: 41, heading: Math.PI / 2 }); r.world.update(10, 41, 99); r.rig.snap(p); });
  await page.waitForTimeout(1500);
  // mean brightness of the upper half of the picture (sky and the street ahead)
  const mean = async () => {
    const b64 = (await page.screenshot()).toString('base64');
    return page.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const g = document.createElement('canvas'); g.width = 160; g.height = 100;
      const x = g.getContext('2d'); x.drawImage(img, 0, 0, 160, 100);
      const d = x.getImageData(0, 0, 160, 50).data; let s = 0;
      for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
      return +(s / (d.length / 4) / 3).toFixed(1);
    }, b64);
  };
  const withRays = await mean();
  await page.evaluate(() => { const T = window.R.THEMES.sunset; window.__keep = T.rays; T.rays = 0; window.__runner.daytime.fixed = {}; window.__runner.setTheme('sunset'); });   // (fixed times are cached)
  await page.waitForTimeout(400);
  const without = await mean();
  const m = await page.evaluate(async () => {
    const R_ = window.__runner, wait = ms => new Promise(ok => setTimeout(ok, ms));
    window.R.THEMES.sunset.rays = window.__keep; R_.daytime.fixed = {}; R_.setTheme('sunset'); await wait(300);
    const motes = () => R_.scene.children.some(o => o.isPoints && o.material.size === 4 && o.visible && o.material.opacity > 0.05);
    const sunset = motes(); R_.setTheme('night');
    // let a couple of frames run (software rendering is slow: time alone is not enough)
    for (let i = 0; i < 2; i++) await new Promise(ok => requestAnimationFrame(() => ok()));
    await wait(100);
    return { sunset, night: motes() };
  });
  t.ok(withRays > without + 3, 'sunset: the rays brighten the view towards the sun', { withRays, without });
  t.ok(m.sunset && !m.night, 'dust motes in the low sun, none at night', m);
};
