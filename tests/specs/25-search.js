// "Search" (the runner): at a walk or a trot the nose goes to the ground and rainbow scent threads show on
// the ground, leading to finds: clews by the bins (with smoke of their colour), a ball, a sausage, a mark,
// the cat. A faster gear lifts the nose; the finds count for the search quests and the records.
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker&nopost#runner');
  const r = await page.evaluate(() => {
    const R_ = window.__runner, p = R_.player, inp = R_.input, M = window.R.modes.runner, ctx = R_.ctx, w = R_.world, rig = R_.rig;
    const S = M.debug().search(), Q = ctx.quests, out = {};
    R_.traffic.update = () => {};
    Object.assign(p, { x: 37.5, z: 60, y: 0, heading: 0, vx: 0, vz: 0, speed: 0, yawRate: 0, steerS: 0 });
    w.update(p.x, p.z, 99); rig.snap(p);
    const step = n => { for (let i = 0; i < n; i++) { inp._poll(); M.update(1 / 30, ctx); w.update(p.x, p.z, 2); rig.update(1 / 30, p, 0, inp); } };
    const stat = k => (Q.stats && Q.stats[k]) || 0;
    // (the finds made round the start: let them come round here instead; the cat nearby)
    for (const x of [...S.targets]) S.remove(x);
    const cat = M.debug().cat; Object.assign(cat, { x: p.x + 6, z: p.z - 30 });
    // standing, the nose up
    inp.setGear(0); step(40);
    const neckUp = p.ent.bones.neck1.rotation.x;
    // the nose button (E): on; the nose goes down, the threads come up
    inp._scentEdge = true; step(1);
    out.on = S.on && p.sniff;
    step(60);
    out.neckDown = +(neckUp - p.ent.bones.neck1.rotation.x).toFixed(2);
    out.k = +S.k.toFixed(2);
    const d = S.debug();
    out.kinds = d.targets.map(x => x.kind).sort();
    out.segments = d.segments;
    out.visible = S.mesh.visible;
    // the threads lie on the ground; each trail ends at its find
    const pos = S.mesh.geometry.attributes.position.array; let yMin = 9, yMax = -9;
    for (let i = 1; i < pos.length; i += 3) { yMin = Math.min(yMin, pos[i]); yMax = Math.max(yMax, pos[i]); }
    out.y = [yMin, yMax];
    const withTrail = d.targets.filter(x => x.trail);
    out.trails = withTrail.length; out.inReach = d.targets.filter(x => Math.hypot(x.x - p.x, x.z - p.z) < 85).length;
    out.ends = withTrail.every(x => { const e = x.trail.main[x.trail.main.length - 1]; return Math.hypot(e.x - x.x, e.z - x.z) < 0.01; });
    // along the streets, hardly through the houses
    let pts = 0, inWall = 0;
    for (const x of withTrail) for (const q of x.trail.main) { pts++; if (w.obstaclesNear(q.x, q.z, 0).some(o => o.kind === 'wall')) inWall++; }
    out.inWalls = +(inWall / Math.max(1, pts)).toFixed(2);
    out.cat = !!d.catTrail;
    out.colors = new Set(d.targets.map(x => x.colorId)).size;
    // smoke rises over the clews, in their colour
    const sp = S.smoke.pts.geometry.attributes.position.array, clew0 = d.targets.find(x => x.kind === 'clew');
    out.smoke = clew0 ? [0, 1, 2, 3].some(i => Math.hypot(sp[i * 3] - clew0.x, sp[i * 3 + 2] - clew0.z) < 2 && sp[i * 3 + 1] > 0.3) : false;
    // a faster gear: the nose comes up, the threads fade
    inp.setGear(3); step(45);
    out.offAtRun = !S.on && S.k < 0.1;
    // asked to sniff at a gallop: it drops to a trot and sniffs
    inp.setGear(4); step(5); inp._scentEdge = true; step(2);
    out.dropTo = inp.gear; out.onAgain = S.on;
    inp.setGear(0); step(30);
    // a clew: stand by it sniffing and it comes untangled (a stat, its colour counts for the rainbow)
    const clew = S.debug().targets.find(x => x.kind === 'clew');
    const c0 = stat('clews');
    if (clew) { Object.assign(p, { x: clew.x + 0.8, z: clew.z, speed: 0, vx: 0, vz: 0 }); step(70); }
    out.clew = { had: !!clew, found: stat('clews') - c0, color: clew && (Q.colors || []).includes(clew.colorId), gone: clew && !S.debug().targets.includes(clew) };
    // a ball and a sausage: just get there
    const ball = S.debug().targets.find(x => x.kind === 'ball'), b0 = stat('balls');
    if (ball) { Object.assign(p, { x: ball.x + 0.5, z: ball.z }); step(3); }
    out.ball = { had: !!ball, found: stat('balls') - b0 };
    const saus = S.debug().targets.find(x => x.kind === 'sausage'), s0 = stat('sausages');
    if (saus) { Object.assign(p, { x: saus.x + 0.5, z: saus.z }); step(3); }
    out.sausage = { had: !!saus, found: stat('sausages') - s0 };
    // a mark: sniff it for a second
    const mark = S.debug().targets.find(x => x.kind === 'mark'), m0 = stat('marks');
    if (mark) { Object.assign(p, { x: mark.x + 0.6, z: mark.z }); step(45); }
    out.mark = { had: !!mark, found: stat('marks') - m0 };
    // the cat in hiding: creep up to it at a walk
    const k0 = stat('stalks');
    Object.assign(p, { x: 37.5, z: 60 }); w.update(p.x, p.z, 99);
    S.stalked = false; cat.x = p.x + 2.5; cat.z = p.z; cat.dist = 2.5; step(1);
    out.stalk = stat('stalks') - k0;
    // seconds with the nose down count
    out.noseSec = stat('noseSec');
    out.newFinds = S.debug().targets.length;
    // the quests and the records
    out.quests = ['rainbow', 'clew', 'ball', 'sausage', 'stalk', 'mark', 'quiet', 'nose'].filter(id => window.R.Quests.POOL.some(q => q.id === id));
    document.getElementById('questBtn').click(); document.querySelector('[data-tab="records"]').click();
    out.records = [...document.querySelectorAll('#quests .records div')].map(x => x.textContent).filter(s => /Клубков|Нос к земле|выслежено/.test(s));
    document.querySelector('#quests .close').click();
    return out;
  });
  t.ok(r.on && r.neckDown > 0.25, 'the nose button: the nose goes down to the ground', r);
  t.ok(r.k > 0.8 && r.visible && r.segments > 100 && r.segments < 9000, 'thin threads show (one cheap mesh)', { k: r.k, segments: r.segments });
  t.ok(r.y[0] > 0.04 && r.y[1] < 0.1, 'the threads lie on the ground', r.y);
  t.ok(['ball', 'clew', 'clew', 'clew', 'mark', 'sausage'].every((k, i, a) => r.kinds.filter(x => x === k).length >= a.filter(x => x === k).length - (k === 'clew' ? 1 : 0)), 'finds round the dog: clews by the bins, a ball, a sausage, a mark', r.kinds);
  t.ok(r.trails >= 3 && r.trails === r.inReach && r.ends && r.cat, 'a thread leads to each find within reach, and one to the cat', r);
  t.ok(r.colors >= 4, 'in different colours', r.colors);
  t.ok(r.inWalls < 0.2, 'the threads go along the streets, not through the houses', r.inWalls);
  t.ok(r.smoke, 'smoke rises over a clew', r.smoke);
  t.ok(r.offAtRun, 'a run: the nose comes up and the threads fade', r);
  t.ok(r.dropTo === 2 && r.onAgain, 'asked to sniff at a gallop: it drops to a trot', r);
  t.ok(r.clew.had && r.clew.found === 1 && r.clew.color && r.clew.gone, 'sniffing a clew untangles it (and its colour counts)', r.clew);
  t.ok(r.ball.had && r.ball.found === 1 && r.sausage.had && r.sausage.found === 1, 'the ball and the sausage are found', { ball: r.ball, sausage: r.sausage });
  t.ok(r.mark.had && r.mark.found === 1, 'the mark is sniffed', r.mark);
  t.ok(r.stalk === 1, 'creeping up to the cat at a walk counts', r.stalk);
  t.ok(r.noseSec >= 2, 'seconds with the nose down count', r.noseSec);
  t.ok(r.quests.length === 8, 'eight search quests', r.quests);
  t.ok(r.records.length === 3, 'the records list the finds', r.records);
};
