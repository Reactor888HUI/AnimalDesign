// Tricks: a barrier stops a standing dog, a slide goes under it, a jump goes over it;
// a jump off a wall turns the dog round; tricks in a row pay out with a multiplier.
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker&nopost#runner');
  await page.evaluate(() => {
    const r = window.__runner, p = r.player, M = window.R.modes.runner, ctx = r.ctx, w = r.world;
    window.__go = (n, fn) => { for (let i = 0; i < n; i++) { if (fn && fn(i)) return i; ctx.traffic.update(1 / 30, p); M.update(1 / 30, ctx); w.update(p.x, p.z, 2); ctx.fx.update(1 / 30); } return n; };
    window.__put = (x, z, heading, speed) => {
      Object.assign(p, { x, z, y: 0, vy: 0, heading, speed, vx: -Math.sin(heading) * speed, vz: -Math.cos(heading) * speed, crash: -1, limp: 0, air: false, slide: -1, wall: null });
      p.tricks.length = 0; w.update(x, z, 99);
    };
  });
  // the garage gate at x = -15 (cell 0,1), across the driveway
  const gate = how => page.evaluate(how => {
    const r = window.__runner, p = r.player, inp = r.input;
    __put(-23, 69, -Math.PI / 2, 12);
    let slid = false;
    __go(70, () => {
      inp.throttle = 1; inp.steer = 0;
      if (how === 'slide' && p.x > -19.5 && !slid) { inp._slideEdge = true; slid = true; }
      if (how === 'jump' && p.x > -18.2 && !slid) { inp._jumpEdge = true; inp.jumpHeld = true; slid = true; }
    });
    inp.jumpHeld = false;
    return { x: +p.x.toFixed(1), chain: (window.R.modes.runner.debug().chain() || { names: [] }).names };
  }, how);
  const stand = await gate('run'), slide = await gate('slide'), jump = await gate('jump');
  t.ok(stand.x < -15, 'a standing dog stops at the barrier', stand.x);
  t.ok(slide.x > -12 && slide.chain.includes('bar'), 'a slide goes under it (trick "under the barrier")', slide);
  t.ok(jump.x > -12, 'a jump goes over it', jump.x);
  // wall jump: jump at the garage wall (row at z = 74 - 12) and kick off it
  const wall = await page.evaluate(() => {
    const r = window.__runner, p = r.player, inp = r.input;
    __put(-8, 74 - 5, 0, 9);
    inp._jumpEdge = true; inp.jumpHeld = true;
    let kicked = false;
    __go(60, () => { inp.throttle = 1; inp.steer = 0; if (p.wall && !kicked) { inp._jumpEdge = true; kicked = true; } });
    inp.jumpHeld = false;
    return { kicked, vz: +p.vz.toFixed(1), chain: (window.R.modes.runner.debug().chain() || { names: [] }).names };
  });
  t.ok(wall.kicked && wall.vz > 2 && wall.chain.includes('wall'), 'a jump off the wall turns the dog back', wall);
  // the chain pays out: wait on the ground
  const pay = await page.evaluate(() => {
    const r = window.__runner, M = window.R.modes.runner, inp = r.input;
    inp.throttle = 0;
    const b0 = +document.getElementById('bonesN').textContent, n = (M.debug().chain() || { names: [] }).names.length;
    __go(150);
    return { tricks: n, gain: +document.getElementById('bonesN').textContent - b0, chainLeft: !!M.debug().chain() };
  });
  t.ok(pay.gain > 0 && !pay.chainLeft, 'the chain pays out bones when it ends', pay);
};
