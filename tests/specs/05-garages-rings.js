// Garages: up the ramp, off the kicker, onto the next roofs; rings in the air; jump record.
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker&nopost#runner');
  await page.evaluate(() => { try { localStorage.removeItem('runner-jump-best'); } catch (e) {} });
  const run = (lane, jump) => page.evaluate(([lane, jump]) => {
    const r = window.__runner, p = r.player, M = window.R.modes.runner, ctx = r.ctx, inp = r.input, w = r.world;
    for (const o of M.debug().rings().values()) { o.active = true; o.t = 0; }
    const [x0, z, h] = lane === 1 ? [-26, 74 - 12, -Math.PI / 2] : [26, 74 + 10, Math.PI / 2];
    Object.assign(p, { x: x0, z, y: 0, vy: 0, heading: h, vx: 0, vz: 0, speed: 14, crash: -1, limp: 0, air: false });
    p.airJumps = p.maxAirJumps;
    w.update(p.x, p.z, 99); r.rig.snap(p);
    const b0 = +document.getElementById('bonesN').textContent, ev = [], on0 = p.onEvent;
    p.onEvent = (n, v) => { ev.push(n); on0 && on0(n, v); };
    let landed = null;
    for (let i = 0; i < 150; i++) {
      inp.throttle = 1; inp.steer = 0;
      if (jump && p.air && p.vy < 0 && p.airJumps > 0 && p.y - p.ground > 1.5) inp._jumpEdge = true;
      const wasAir = p.air;
      ctx.traffic.update(1 / 30, p); M.update(1 / 30, ctx); w.update(p.x, p.z, 2); ctx.fx.update(1 / 30);
      if (wasAir && !p.air && ev.includes('launch') && !landed) landed = { y: +p.y.toFixed(2), crash: p.crash >= 0 };
    }
    p.onEvent = on0;
    return { launched: ev.includes('launch'), landed, bonus: +document.getElementById('bonesN').textContent - b0, best: M.debug().jump().best };
  }, [lane, jump]);
  const a = await run(1, false);
  t.ok(a.launched && a.landed && Math.abs(a.landed.y - 2.72) < 0.1 && !a.landed.crash, 'lane 1: kicker throws the dog onto the far roofs', a.landed);
  t.ok(a.bonus >= 10, 'lane 1: flies through the ring', a.bonus);
  const b = await run(1, true);
  t.ok(b.bonus >= 30, 'lane 1 + second jump: two rings, x2 bonus', b.bonus);
  t.ok(b.best > 9, 'jump record is kept', +b.best.toFixed(1));
  const c = await run(2, false);
  t.ok(c.launched && c.landed && c.landed.y > 2 && !c.landed.crash, 'lane 2: lands on the roofs', c.landed);
};
