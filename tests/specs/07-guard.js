// Guard: the aim ring shows on a thief and the lunge homes in on him, even when not facing him.
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker&nopost#guard');
  const r = await page.evaluate(() => {
    const r = window.__runner, M = window.R.modes.guard, ctx = r.ctx, p = r.player, Y = r.Y(), G = () => r.guard();
    const step = (n, fn) => { for (let i = 0; i < n; i++) { if (fn && fn(i)) return i; ctx.traffic.update(0.05, p); M.update(0.05, ctx); } return n; };
    G().events.forEach(e => { e.t = 9999; }); G().time = 1e4;
    const spawn = kind => { const b = new Set(G().npcs); G().events.push({ kind, t: -1e9 }); step(1); return G().npcs.find(n => !b.has(n)); };
    let ok = 0, ring = 0;
    for (let k = 0; k < 6; k++) {
      p.x = Y.ox + 60; p.z = Y.oz + 40;
      for (const n of G().npcs) n.state = 'gone'; G().stars = 3; G().over = false; document.getElementById('result').hidden = true; step(1);
      const th = spawn('thief');
      if (!th) return { error: 'no thief' };
      step(2000, () => th.state === 'steal');
      th.state = 'frozen'; th.t = 3;
      const a = k * 1.1;
      Object.assign(p, { x: th.x + Math.cos(a) * 5, z: th.z + Math.sin(a) * 5, vx: 0, vz: 0, speed: 0 });
      p.heading = Math.atan2(-(th.x - p.x), -(th.z - p.z)) + (k % 3 - 1) * 0.9;     // not quite facing him
      r.world.resolve(p, 0.4);
      step(1);
      if (r.scene.children.some(o => o.geometry && o.geometry.type === 'RingGeometry' && o.visible && o.material.color.getHex() === 0xff4040)) ring++;
      G().biteCd = 0; r.input._biteEdge = true;
      step(20);
      if (th.state === 'caught' || th.state === 'tug') ok++;
      G().tug = null; th.state = 'gone'; step(2);
    }
    return { ok, ring };
  });
  t.ok(r.ok >= 5, 'the lunge catches the thief (of 6)', r);
  t.ok(r.ring >= 5, 'the red aim ring is shown', r.ring);
};
