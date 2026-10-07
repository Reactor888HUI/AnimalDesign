// Detailed blocks are built well ahead of the dog, and running down the middle of a street
// (which is a cell border) does not rebuild blocks back and forth.
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker&nopost#runner');
  const res = await page.evaluate(() => {
    const r = window.__runner, w = r.world, P = window.R.C.P, p = r.player;
    p.x = 37.5; p.z = 0; p.heading = 0; p.vx = 0; p.vz = -16; w.update(p.x, p.z, 99);
    const nearSet = () => new Set([...w.cells].filter(([k, c]) => c.near).map(([k]) => k));
    let prev = nearSet(); const ahead = [], all = [];
    let maxUpd = 0;
    for (let f = 0; f < 900; f++) {
      p.z -= 16 / 30; p.x = 37 + Math.sin(f / 20) * 3;      // weave across the street
      const [ax, az] = r.ahead();
      const t0 = performance.now(); w.update(p.x, p.z, 1, ax, az); maxUpd = Math.max(maxUpd, performance.now() - t0);
      const now = nearSet();
      for (const k of now) if (!prev.has(k)) {
        const [ci, cj] = k.split(',').map(Number);
        const d = Math.hypot(Math.max(0, Math.abs(p.x - ci * P) - P / 2), Math.max(0, Math.abs(p.z - cj * P) - P / 2));
        all.push(Math.round(d));
        if (Math.abs(ci * P - p.x) < P / 2 + 2) ahead.push(Math.round(d));       // the block straight ahead
      }
      prev = now;
    }
    return { builds: all.length, ahead, minAhead: Math.min(...ahead), maxUpd: Math.round(maxUpd), near: prev.size };
  });
  t.ok(res.minAhead >= 70, 'blocks ahead are ready 70+ m before the dog', res.ahead);
  t.ok(res.builds <= 24, 'no rebuilding back and forth while weaving (480 m run)', res.builds);
  t.ok(res.near <= 13, 'not too many detailed blocks at once', res.near);
};
