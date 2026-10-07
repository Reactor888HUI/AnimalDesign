// The whippet gallops, jumps, crashes after a bad landing, limps and heals.
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker&nopost#runner');
  const r = await page.evaluate(() => {
    const r = window.__runner, M = window.R.modes.runner, ctx = r.ctx, p = r.player, inp = r.input;
    // no traffic here: a passing car could knock the dog and spoil the speed checks
    r.world.dynamic = [];
    const go = n => { for (let i = 0; i < n; i++) { M.update(1 / 30, ctx); r.world.update(p.x, p.z, 2); ctx.fx.update(1 / 30); r.rig.update(1 / 30, p, i / 30); } };
    const out = {};
    go(20); inp.throttle = 1; go(60); out.speed = p.vel;
    inp._jumpEdge = true; inp.jumpHeld = true; go(8); out.jumpY = p.y;
    inp.jumpHeld = false; inp.throttle = 0; go(60);
    p.y = 7; p.vy = 0; go(40); out.crash = p.crash; out.limp = p.limp;
    inp.throttle = 1; go(60); out.limpSpeed = p.vel;
    let n = 0; while (p.limp > 0 && n < 1200) { go(1); n++; } out.healSecs = n / 30;
    go(60); out.healedSpeed = p.vel;
    return out;
  });
  t.ok(r.speed > 14.5, 'gallops at full speed', +r.speed.toFixed(1));
  t.ok(r.jumpY > 1.2, 'jumps', +r.jumpY.toFixed(2));
  t.ok(r.limp > 0.5, 'a fall from 7 m hurts the paw', +r.limp.toFixed(2));
  t.ok(r.limpSpeed < 7, 'limps slowly', +r.limpSpeed.toFixed(1));
  t.ok(r.healSecs > 3 && r.healSecs < 30, 'the paw heals', r.healSecs);
  t.ok(r.healedSpeed > 14.5, 'full speed again', +r.healedSpeed.toFixed(1));
};
