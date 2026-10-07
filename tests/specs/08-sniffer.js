// Sniffer: three quests in a row: client -> clue -> trail -> find -> back home.
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker&nopost#sniffer');
  const res = await page.evaluate(() => {
    const r = window.__runner, M = window.R.modes.sniffer, ctx = r.ctx, p = r.player, inp = r.input, S = () => r.sniff();
    const step = (n, fn) => { for (let i = 0; i < n; i++) { ctx.traffic.update(0.05, p); M.update(0.05, ctx); if (fn && fn(i)) return i; } return n; };
    const tp = (x, z) => { p.x = x; p.z = z; p.vx = p.vz = p.speed = 0; };
    const out = [];
    for (let k = 0; k < 3; k++) {
      const c = S().c, log = { item: c.def.item };
      const h = c.npc.root.position; tp(h.x + 1, h.z + 1); step(2);
      if (!c.clue) { log.end = 'no clue'; out.push(log); break; }
      tp(c.clue.position.x + 0.5, c.clue.position.z); inp._scentEdge = true; step(12);
      const pts = c.trail.pts; let i = 0;
      step(4000, () => {
        if (c.state !== 'track') return true;
        const q = pts[Math.min(i, pts.length - 1)];
        p.heading = Math.atan2(-(q.x - p.x), -(q.z - p.z)); inp.throttle = 1;
        if (Math.hypot(q.x - p.x, q.z - p.z) < 1.5) i++;
        if (c.def.find === 'dig' && Math.hypot(c.trail.end.x - p.x, c.trail.end.z - p.z) < 2) { inp.throttle = 0; inp._biteEdge = true; }
        return false;
      });
      if (c.state === 'chase') step(1200, () => {
        if (c.state !== 'chase') return true;
        const q = c.foxState === 'run' ? c.fox : c.thing.position;
        p.heading = Math.atan2(-(q.x - p.x), -(q.z - p.z)); inp.throttle = 1; return false;
      });
      const home = c.npc.root.position;
      let j = 0, best = 1e9;
      pts.forEach((q, n) => { if (n < c.trail.swirl) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < best) { best = d; j = n; } } });
      const back = pts.slice(0, j + 1).reverse().concat([{ x: home.x, z: home.z }]);
      let b = 0;
      step(3000, () => {
        if (c.state !== 'back') return true;
        let q = back[Math.min(b, back.length - 1)];
        if (c.kitten && c.kitten.state === 'lost') q = c.kitten;
        p.heading = Math.atan2(-(q.x - p.x), -(q.z - p.z)); inp.throttle = c.kitten ? 0.5 : 1;
        if (Math.hypot(q.x - p.x, q.z - p.z) < 1.6 && q !== c.kitten) b++;
        return false;
      });
      inp.throttle = 0;
      log.end = c.state; log.bones = S().bones;
      step(80);
      out.push(log);
    }
    return out;
  });
  res.forEach((l, k) => t.ok(l.end === 'over', 'quest ' + (k + 1) + ' (' + l.item + ') done', l));
};
