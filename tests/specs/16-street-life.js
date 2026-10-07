// Street life: pigeons peck about and burst up when the dog runs at them (and settle again later,
// some on the wires); leaves lie round the trees and fly up under a running dog, then settle on the
// ground (never under it); pedestrians walk round the blocks without getting stuck or walking through
// things, stop to look at a dashing dog, and the dog cannot run through them.
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker&nopost#runner');
  await page.waitForFunction(() => window.__runner.life.people, null, { timeout: 30000 });
  const r = await page.evaluate(() => {
    const r = window.__runner, L = r.life, p = r.player, ctx = r.ctx, M = window.R.modes.runner, inp = r.input, out = {};
    r.setTheme('day');
    const step = (n, fn) => { for (let i = 0; i < n; i++) { fn && fn(i); r.world.dynamic.length = 0; L.update(1 / 30, p, ctx.theme()); M.update(1 / 30, ctx); r.world.update(p.x, p.z, 2); } };
    // pigeons: the square at cell (1, -1)
    p.x = 77; p.z = -54; r.world.update(p.x, p.z, 99); step(2);
    let f = null; for (const list of L.flocks.values()) for (const x of list) if (!f || Math.hypot(x.hx - p.x, x.hz - p.z) < Math.hypot(f.hx - p.x, f.hz - p.z)) f = x;
    out.flock = !!f && f.birds.length;
    Object.assign(p, { x: f.hx + 12, z: f.hz, heading: Math.PI / 2, speed: 12, vx: -12, vz: 0, y: 0 });
    step(25, () => { inp.throttle = 1; inp.steer = 0; });
    out.flewUp = f.birds.filter(b => b.y > 1).length;
    Object.assign(p, { x: f.hx + 20, z: f.hz + 18, vx: 0, vz: 0, speed: 0 }); inp.throttle = 0;   // gone, but the square still in view
    let perched = 0; step(240, () => { perched = Math.max(perched, f.birds.filter(b => b.state === 'perch').length); });
    step(700);
    out.perched = perched; out.backHome = f.birds.filter(b => b.state === 'ground').length;
    // leaves: the park at cell (1, 0)
    p.x = 74; p.z = 0; r.world.update(p.x, p.z, 99); step(2);
    let tr = null; for (const list of L.leafSets.values()) for (const l of list) if (!tr && Math.hypot(l.tree.x - 74, l.tree.z) < 30) tr = l.tree;
    Object.assign(p, { x: tr.x + 8, z: tr.z + 0.8, heading: Math.PI / 2, speed: 13, vx: -13, vz: 0 });
    let kicked = 0; step(30, () => { inp.throttle = 1; kicked = Math.max(kicked, L.stats().air); });
    inp.throttle = 0; p.vx = p.vz = p.speed = 0;
    step(200);
    let below = 0, leaves = 0; for (const list of L.leafSets.values()) for (const l of list) { leaves++; if (l.y < -0.01) below++; }
    out.leaves = leaves; out.kicked = kicked; out.below = below;
    // pedestrians
    p.x = 37; p.z = 0; r.world.update(p.x, p.z, 99);
    // stuck = hardly any walking at all in 2 s (not "back at the same spot": turning back at a bench
    // and passing the same point again is fine)
    const last = new Map(), walked = new Map(); let stuck = 0, inside = 0, placed = 0;
    for (let i = 0; i < 1200; i++) {
      r.world.dynamic.length = 0; L.update(1 / 30, p, ctx.theme());
      placed = Math.max(placed, L.stats().people);
      for (const m of L.people) if (m.cell) {
        const q = last.get(m);
        // (standing to look at the dog is not being stuck)
        if (q) walked.set(m, (walked.get(m) || 0) + (m.look > 0 ? 99 : Math.hypot(q[0] - m.x, q[1] - m.z)));
        last.set(m, [m.x, m.z]);
      }
      if (i % 60 === 59) for (const m of L.people) if (m.cell) {
        if (walked.has(m) && walked.get(m) < 0.3) stuck++;
        walked.set(m, 0);
        if (r.world.obstaclesNear(m.x, m.z, 0.1).some(o => o.kind !== 'npc' && o.kind !== 'traffic' && o.h > 0.4 && Math.abs(m.x - o.x) < o.hx && Math.abs(m.z - o.z) < o.hz)) inside++;
      }
    }
    out.people = placed; out.stuck = stuck; out.inside = inside;
    const m = L.people.find(q => q.cell);
    Object.assign(p, { x: m.x + 2, z: m.z, vx: 12, vz: 0 }); L.update(1 / 30, p, ctx.theme());
    out.looked = m.look > 0;
    m.look = 99;
    Object.assign(p, { x: m.x + 4, z: m.z, heading: Math.PI / 2, speed: 6, vx: -6, vz: 0, y: 0 });
    let minD = 9; step(40, () => { inp.throttle = 1; inp.steer = 0; minD = Math.min(minD, Math.hypot(p.x - m.x, p.z - m.z)); });
    out.closest = +minD.toFixed(2);
    return out;
  });
  t.ok(r.flock >= 5, 'a flock of pigeons on the square', r.flock);
  t.ok(r.flewUp >= r.flock - 1, 'the flock bursts up when the dog runs at it', r.flewUp);
  t.ok(r.perched > 0, 'some pigeons land on the wires', r.perched);
  t.ok(r.backHome === r.flock, 'and come back down when the dog has gone', r.backHome);
  t.ok(r.leaves > 100 && r.kicked >= 3, 'leaves round the trees fly up under a running dog', { leaves: r.leaves, kicked: r.kicked });
  t.ok(r.below === 0, 'no leaf ends up under the ground', r.below);
  t.ok(r.people >= 3 && r.stuck === 0 && r.inside === 0, 'pedestrians walk round the blocks, never stuck, never through things', r);
  t.ok(r.looked, 'a pedestrian stops to look at a dashing dog', r.looked);
  t.ok(r.closest > 0.5, 'the dog cannot run through a person', r.closest);
};
