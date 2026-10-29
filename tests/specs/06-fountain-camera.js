// No running through the fountain; the camera never swings fast (comfort).
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker&nopost#runner');
  const r = await page.evaluate(() => {
    const r = window.__runner, M = window.R.modes.runner, ctx = r.ctx, p = r.player, w = r.world;
    r.setCam('free', true);   // the free camera's comfort limit (the locked one is checked in 22)
    const step = (n, fn) => { for (let i = 0; i < n; i++) { fn && fn(i); ctx.traffic.update(1 / 30, p); M.update(1 / 30, ctx); w.update(p.x, p.z, 2); r.rig.update(1 / 30, p, i / 30); } };
    let f = null;
    for (const [ci, cj] of [[1, -1], [-1, 0]]) { p.x = ci * 74 + 15; p.z = cj * 74; w.update(p.x, p.z, 99); for (const o of w.obstaclesNear(ci * 74, cj * 74, 2)) if (o.kind === 'fountain' && o.r > 5) f = o; if (f) break; }
    const out = {};
    if (f) {
      let minD = 99;
      for (const a of [0, 0.8, 1.6, 2.4, 3.9]) {
        Object.assign(p, { x: f.x + Math.cos(a) * 12, z: f.z + Math.sin(a) * 12, y: 0, vx: 0, vz: 0, speed: 0 });
        p.heading = Math.atan2(-(f.x - p.x), -(f.z - p.z));
        step(60, () => { r.input.throttle = 1; r.input.steer = 0; const fx = -Math.sin(p.heading), fz = -Math.cos(p.heading); if (p.y < 0.5) minD = Math.min(minD, Math.hypot(p.x + fx * 0.6 - f.x, p.z + fz * 0.6 - f.z)); });
      }
      out.fountain = { r: f.r, head: +minD.toFixed(2) };
    }
    Object.assign(p, { x: 37, z: 0, vx: 0, vz: 0, speed: 0 }); r.rig.snap(p);
    let prev = r.rig.heading, maxRate = 0;
    step(90, i => { r.input.throttle = 1; r.input.steer = i < 30 ? 1 : 0; const rate = Math.abs(window.R.angDiff(prev, r.rig.heading)) * 30; prev = r.rig.heading; maxRate = Math.max(maxRate, rate); });
    out.camDegS = Math.round(maxRate * 180 / Math.PI);
    return out;
  });
  t.ok(r.fountain && r.fountain.head >= r.fountain.r - 0.05, 'the dog stops at the fountain rim', r.fountain);
  t.ok(r.camDegS <= 30, 'camera turns no faster than 30 deg/s', r.camDegS);
};
