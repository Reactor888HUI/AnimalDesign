// Daily quests and the wardrobe: three quests a day (the same for everyone on a date), a welcome gift,
// real game events count (a ring, a jump, a cat), a done quest pays stars, all three pay a bonus;
// stars buy things that really change the dog (a hat on the head, a new coat, a trail behind it,
// another voice); it is all kept after a reload.
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker&nopost#runner');
  await page.evaluate(() => localStorage.removeItem('runner-quests') || localStorage.removeItem('runner-wardrobe'));
  await page.reload();
  await page.waitForFunction(() => window.__runner && window.__runner.quests, null, { timeout: 120000 });
  const r = await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    const R_ = window.__runner, Q = R_.quests, W = R_.wardrobe, out = {};
    out.count = Q.list.length; out.distinct = new Set(Q.list.map(q => q.id)).size; out.gift = Q.stars;
    // force today's list to known quests, then play them for real
    Q.list = [Q.make('rings', 0), Q.make('jump', 0), Q.make('cats', 0)];
    const p = R_.player, M = window.R.modes.runner, ctx = R_.ctx, inp = R_.input; inp.poll = () => {}; inp.dirMode = false;
    // garages lane 1 with the second jump: rings and a long jump
    const lane = () => {
      for (const o of M.debug().rings().values()) { o.active = true; o.t = 0; }
      Object.assign(p, { x: -26, z: 62, y: 0, vy: 0, heading: -Math.PI / 2, vx: 14, vz: 0, speed: 14, crash: -1, limp: 0, air: false });
      p.airJumps = p.maxAirJumps; R_.world.update(p.x, p.z, 99);
      for (let i = 0; i < 150; i++) { inp.throttle = 1; inp.steer = 0; if (p.air && p.vy < 0 && p.airJumps > 0 && p.y - p.ground > 1.5) inp._jumpEdge = true; M.update(1 / 30, ctx); R_.world.update(p.x, p.z, 2); }
    };
    lane(); lane();
    out.rings = Q.list[0].n; out.jump = Q.list[1].n;
    // catch cats: put the cat in front of the dog
    for (let k = 0; k < 2; k++) { const c = R_.cat; c.x = p.x + 1; c.z = p.z; c.y = 0; M.update(1 / 30, ctx); }
    out.cats = Q.list[2].n;
    out.done = Q.list.map(q => q.done); out.stars = Q.stars; out.bonus = Q.bonus;
    // buy and wear: a crown, the gold coat, the heart trail, the quack
    Q.stars = 40;
    const col0 = Array.from(p.ent.mesh.geometry.attributes.color.array.slice(0, 30));
    for (const id of ['head-crown', 'coat-gold', 'trail-hearts', 'voice-quack']) { W.buy(id, Q); W.wear(id); }
    out.hat = !!W.headObj && !!W.headObj.parent;
    out.coatChanged = p.ent.mesh.geometry.attributes.color.array.slice(0, 30).some((v, i) => Math.abs(v - col0[i]) > 0.02);
    out.metal = p.ent.mesh.material.metalness > 0.2;
    // the trail: run a bit, count heart particles
    const heart = window.R.shapeTexture('heart'); let hearts = 0;
    Object.assign(p, { x: 37, z: 20, heading: 0, vx: 0, vz: -12, speed: 12 });
    for (let i = 0; i < 40; i++) { inp.throttle = 1; M.update(1 / 30, ctx); W.update(1 / 30, p, ctx.fx, false); }
    for (const s of ctx.fx.pool) if (s.visible && s.material.map === heart) hearts++;
    out.hearts = hearts;
    out.left = Q.stars;
    return out;
  });
  t.ok(r.count === 3 && r.distinct === 3, 'three different quests for today', r);
  t.ok(r.gift === 3, 'a welcome gift of 3 stars', r.gift);
  t.ok(r.rings >= 3 && r.jump >= 11, 'rings and jumps in the game count', { rings: r.rings, jump: r.jump });
  t.ok(r.cats >= 2, 'caught cats count', r.cats);
  t.ok(r.done.every(Boolean) && r.bonus, 'all three done, the day bonus paid', r);
  t.ok(r.hat && r.coatChanged && r.metal, 'bought things change the dog: a crown, a gold shiny coat', r);
  t.ok(r.hearts >= 3, 'the heart trail behind the running dog', r.hearts);
  // kept after a reload
  await page.reload();
  await page.waitForFunction(() => window.__runner && window.__runner.quests, null, { timeout: 120000 });
  const k = await page.evaluate(() => ({ stars: window.__runner.quests.stars, worn: window.__runner.wardrobe.worn, done: window.__runner.quests.list.filter(q => q.done).length }));
  t.ok(k.stars === r.left && k.worn.head === 'head-crown' && k.worn.voice === 'voice-quack' && k.done === 3, 'stars, outfit and progress are kept', k);
};
