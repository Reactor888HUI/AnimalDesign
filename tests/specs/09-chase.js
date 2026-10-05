// Direction controls: a simple "player" pushes the stick towards the cat on the screen.
// The dog must catch cats, and the camera must stay calm (comfort).
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker&nopost#runner');
  const r = await page.evaluate(() => {
    const r = window.__runner, M = window.R.modes.runner, ctx = r.ctx, p = r.player, c = r.cat, w = r.world, inp = r.input, A = window.R.angDiff;
    inp.dirMode = true;
    inp.poll = function () {
      const dx = c.x - p.x, dz = c.z - p.z, l = Math.hypot(dx, dz) || 1, h = r.rig.heading;
      this.my = (dx * -Math.sin(h) + dz * -Math.cos(h)) / l; this.mx = (dx * Math.cos(h) + dz * -Math.sin(h)) / l; this.mag = 1;
    };
    let lastH = r.rig.heading, camAbs = 0, n = 0;
    const s0 = +document.getElementById('score').textContent, dt = 1 / 30;
    for (let i = 0; i < 1800; i++) {
      inp.poll(); r.worldDir();
      ctx.traffic.update(dt, p); M.update(dt, ctx); w.update(p.x, p.z, 2); ctx.fx.update(dt); r.rig.update(dt, p, i * dt, inp);
      const fx = -Math.sin(p.heading), fz = -Math.cos(p.heading);
      const ob = w.obstaclesNear(p.x + fx * 2.2, p.z + fz * 2.2, 0.5).find(o => o.h < 1.2);
      if (ob && !p.air) { inp._jumpEdge = true; inp.jumpHeld = true; } else if (p.y > 0.9) inp.jumpHeld = false;
      camAbs += Math.abs(A(lastH, r.rig.heading)) / dt; lastH = r.rig.heading; n++;
    }
    return { catches: +document.getElementById('score').textContent - s0, camAvgDegS: Math.round(camAbs / n * 57.3) };
  });
  t.ok(r.catches >= 1, 'catches cats in a minute', r.catches);
  t.ok(r.camAvgDegS <= 12, 'camera turns slowly on average', r.camAvgDegS);
};
