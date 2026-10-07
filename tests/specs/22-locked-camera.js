// The runner's default: the camera "on the leash" (fixed ~1 m behind the collar). The left thumb's circle is
// the gas pedal and the wheel: a light push walks, held forward at the edge the dog speeds up a gait at a time
// (walk, trot, run, gallop, super speed), held back it slows down to a stop, sideways it turns; let go and it
// keeps its gait. The right hand does the tricks: jump, slide, the nose; a double tap jumps.
// The camera stays fixed behind the dog and turns with it (no lag, no jumps); a bot steering this way
// catches cats; and the one menu button in the corner holds the map, quests, camera, sound and time.
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker&nopost#runner');
  const pt = await page.evaluate(() => {
    const R_ = window.__runner;
    R_.world.dynamic = []; R_.traffic.update = () => {};
    document.getElementById('touchUI').hidden = false;
    const p = R_.player; Object.assign(p, { x: 37.5, z: 60, y: 0, heading: 0, vx: 0, vz: 0, speed: 0, yawRate: 0, steerS: 0 });
    R_.world.update(p.x, p.z, 99); R_.rig.snap(p);
    window.__step = n => {
      const M = window.R.modes.runner, ctx = R_.ctx, inp = R_.input, rig = R_.rig, A = window.R.angDiff;
      let maxGap = 0, maxJump = 0, minD = 99, maxD = 0, maxSpeed = 0;
      const prev = rig.cam.position.clone();
      for (let k = 0; k < n; k++) {
        inp._poll(); R_.worldDir(); M.update(1 / 30, ctx); R_.world.update(p.x, p.z, 2); rig.update(1 / 30, p, 0, inp);
        maxGap = Math.max(maxGap, Math.abs(A(rig.heading, p.heading)));
        // how far the camera moved this frame beyond what the dog moved: a jump of the picture
        maxJump = Math.max(maxJump, rig.cam.position.distanceTo(prev) - p.speed / 30); prev.copy(rig.cam.position);
        const d = Math.hypot(rig.cam.position.x - p.x, rig.cam.position.z - p.z); minD = Math.min(minD, d); maxD = Math.max(maxD, d);
        maxSpeed = Math.max(maxSpeed, p.speed);
      }
      return { speed: +p.speed.toFixed(1), maxSpeed: +maxSpeed.toFixed(1), heading: +p.heading.toFixed(2), gap: +Math.abs(A(rig.heading, p.heading)).toFixed(2), air: p.air || p.y > 0.3,
        maxGap: +maxGap.toFixed(2), maxJump: +maxJump.toFixed(2), minD: +minD.toFixed(2), maxD: +maxD.toFixed(2), camUp: +(rig.cam.position.y - p.y).toFixed(2),
        gear: inp.gear, superOn: p.superOn };
    };
    const c = el => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, shown: b.width > 0 }; };
    const sz = document.getElementById('stickZone').getBoundingClientRect(), z = document.getElementById('jumpZone').getBoundingClientRect();
    return { stick: { x: sz.left + sz.width * 0.4, y: sz.top + sz.height * 0.6 }, pad: { x: z.left + z.width * 0.3, y: z.top + z.height * 0.4 }, mid: innerWidth / 2,
      jump: c(document.getElementById('jumpBtn')), slide: c(document.getElementById('slideBtn')), nose: c(document.getElementById('sniffBtn')), dots: c(document.getElementById('gearBox')),
      dotsTouch: getComputedStyle(document.getElementById('gearBox')).pointerEvents,
      locked: R_.rig.locked && R_.input.camLock && document.body.classList.contains('gears') };
  });
  const step = n => page.evaluate(n => window.__step(n), n);
  const m = page.mouse, S = pt.stick, R = 56;
  // a light push forward: a walk, and it stays a walk
  await m.move(S.x, S.y); await m.down(); await m.move(S.x, S.y - 25);
  const walk = await step(60), walk2 = await step(30);
  // held at the edge: a gait up every 0.7 s, from a gallop (held a second more) super speed
  await m.move(S.x, S.y - R);
  const seq = [];
  for (const n of [3, 21, 21, 21, 32]) seq.push((await step(n)).gear);
  const sup = await step(60);
  // held back: a gait down every 0.45 s, super speed off, to a stop
  await m.move(S.x, S.y + 40);
  const back1 = await step(1), stop = await step(90);
  await m.up();
  // up to a gallop again; sideways: it turns, the gait stays; let go: it keeps running, straight
  // (at the gallop the thumb eases off the edge: it stays a gallop)
  await m.move(S.x, S.y); await m.down(); await m.move(S.x, S.y - R);
  await step(66); await m.move(S.x, S.y - 28);
  const g4 = await step(40);
  await m.move(S.x + R, S.y);
  const turn = await step(40);
  await m.move(S.x, S.y);
  const after = await step(30);
  await m.up();
  const h0 = after.heading, cruise = await step(30);
  // the right hand: a double tap jumps, so does the jump button
  await m.move(pt.pad.x, pt.pad.y); await m.down(); await m.up(); await m.down();
  const jump = await step(8);
  await m.up(); await step(40);
  await m.move(pt.jump.x, pt.jump.y); await m.down();
  const jumpR = await step(8);
  await m.up(); await step(40);
  // keys: W held speeds up like the circle, S slows down, digits pick a gait
  const keys = await page.evaluate(() => {
    const inp = window.__runner.input, key = (type, code) => dispatchEvent(new KeyboardEvent(type, { code })), out = [];
    inp.setGear(0, true);
    key('keydown', 'KeyW'); window.__step(1); out.push(inp.gear); window.__step(22); out.push(inp.gear); key('keyup', 'KeyW'); window.__step(1);
    key('keydown', 'KeyS'); window.__step(1); out.push(inp.gear); key('keyup', 'KeyS');
    key('keydown', 'Digit4'); key('keyup', 'Digit4'); out.push(inp.gear);
    key('keydown', 'Digit0'); key('keyup', 'Digit0'); out.push(inp.gear);
    return out;
  });
  t.ok(pt.locked, 'the runner starts with the camera on the leash', pt);
  t.ok(pt.jump.shown && pt.slide.shown && pt.nose.shown && [pt.jump, pt.slide, pt.nose].every(b => b.x > pt.mid), 'the right hand: jump, slide and the nose are on the right', pt);
  t.ok(pt.dots.shown && pt.dotsTouch === 'none' && pt.dots.x < pt.mid, 'the gait shows as dots on the left (not a control)', pt.dots);
  t.ok(walk.gear === 1 && walk2.gear === 1 && walk2.speed > 0.6 && walk2.speed < 1.8, 'a light push forward: a walk, and it stays a walk', { walk, walk2 });
  t.ok(seq.join() === '2,3,4,4,5', 'held at the edge: it speeds up a gait at a time (trot, run, gallop), then super speed', seq);
  t.ok(sup.superOn && sup.maxSpeed > 17.5, 'super speed', sup);
  t.ok(back1.gear === 4 && !back1.superOn && stop.gear === 0 && stop.speed < 0.5, 'held back: super speed off, slower and slower, a stop', { back1, stop });
  t.ok(g4.gear === 4 && g4.speed > 14 && !g4.superOn && Math.abs(g4.heading) < 0.05, 'a straight gallop', g4);
  t.ok(turn.heading < -0.6 && turn.gear === 4, 'the circle to the right: it turns right, the gait stays', turn);
  t.ok(Math.abs(cruise.heading - h0) < 0.05 && cruise.speed > 14 && cruise.gear === 4, 'thumb off: it runs straight on in its gait', { h0, cruise });
  t.ok(turn.maxGap < 0.12 && after.gap < 0.02, 'on the leash: the camera turns with the dog at once (no lag)', { turn, after });
  t.ok(g4.minD > 0.4 && g4.maxD < 0.8 && g4.camUp > 1.2 && g4.camUp < 1.7, 'about a metre behind the collar, a little above the head', g4);
  t.ok(Math.max(g4.maxJump, turn.maxJump, after.maxJump) < 0.15, 'the picture never jumps', { run: g4.maxJump, turn: turn.maxJump, after: after.maxJump });
  t.ok(jump.air && jumpR.air, 'a double tap jumps, so does the jump button on the right', { jump, jumpR });
  t.ok(keys.join() === '1,2,1,4,0', 'keys: W held speeds up, S slows down, digits pick a gait', keys);

  // a bot steering like a handlebar towards the cat catches cats
  const chase = await page.evaluate(() => {
    const r = window.__runner, M = window.R.modes.runner, ctx = r.ctx, p = r.player, c = r.cat, w = r.world, inp = r.input, A = window.R.angDiff;
    inp.poll = function () { this.dirMode = false; const want = Math.atan2(-(c.x - p.x), -(c.z - p.z)); this.steer = Math.max(-1, Math.min(1, -A(p.heading, want) * 2)); this.throttle = 1; };
    // (from the open street where the test began: the steps above may leave the dog by a wall)
    Object.assign(p, { x: 37.5, z: 60, y: 0, vy: 0, heading: 0, vx: 0, vz: 0, speed: 0, yawRate: 0, steerS: 0, limp: 0, crash: -1 }); w.update(p.x, p.z, 99); c.respawn(p, w, 30); r.rig.snap(p);
    let gapMax = 0; window.__botStart = { x: p.x.toFixed(0), z: p.z.toFixed(0), sp: p.speed.toFixed(1), limp: p.limp, cat: c.dist.toFixed(0), y: p.y.toFixed(2) };
    const s0 = +document.getElementById('score').textContent, dt = 1 / 30;
    for (let i = 0; i < 1800; i++) {
      inp.poll();
      ctx.traffic.update(dt, p); M.update(dt, ctx); w.update(p.x, p.z, 2); ctx.fx.update(dt); r.rig.update(dt, p, i * dt, inp);
      const fx = -Math.sin(p.heading), fz = -Math.cos(p.heading);
      const ob = w.obstaclesNear(p.x + fx * 2.2, p.z + fz * 2.2, 0.5).find(o => o.h < 1.2);
      if (ob && !p.air) { inp._jumpEdge = true; inp.jumpHeld = true; } else if (p.y > 0.9) inp.jumpHeld = false;
      gapMax = Math.max(gapMax, Math.abs(A(r.rig.heading, p.heading)));
    }
    return { catches: +document.getElementById("score").textContent - s0, gapMaxDeg: Math.round(gapMax * 57.3), start: window.__botStart, end: { x: p.x.toFixed(0), z: p.z.toFixed(0), sp: p.speed.toFixed(1), limp: p.limp.toFixed(2), cat: c.dist.toFixed(0) } };
  });
  t.ok(chase.catches >= 1, 'steering like a handlebar catches cats', chase);

  // the menu in the corner
  const menu = await page.evaluate(() => {
    const $ = id => document.getElementById(id), R_ = window.__runner, more = $('more'), out = {};
    out.oldHidden = ['menuBtn', 'muteBtn', 'themeBtn', 'minimap', 'questBtn'].every(id => getComputedStyle($(id)).display === 'none');
    $('moreBtn').click();
    out.open = !more.hidden && R_.ctx.paused;
    out.items = [...more.querySelectorAll('button')].filter(b => getComputedStyle(b).display !== 'none').map(b => b.dataset.act);
    const cam = more.querySelector('[data-act="cam"]');
    cam.click(); out.gopro = R_.rig.locked && R_.rig.gopro && /на морде/.test(cam.textContent);
    cam.click(); out.free = !R_.rig.locked && /свободная/.test(cam.textContent);
    cam.click(); out.lockedAgain = R_.rig.locked && !R_.rig.gopro;
    const s0 = $('muteBtn').getAttribute('aria-pressed') + R_.ctx.au.muted; more.querySelector('[data-act="sound"]').click();
    out.sound = more.querySelector('.v.sound').textContent; out.soundChanged = s0 !== $('muteBtn').getAttribute('aria-pressed') + R_.ctx.au.muted || out.sound === 'без музыки';
    dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    out.closed = more.hidden && !R_.ctx.paused;
    $('moreBtn').click(); more.querySelector('[data-act="map"]').click();
    out.map = !$('bigmap').hidden; $('bigmap').querySelector('.close').click();
    $('moreBtn').click(); more.querySelector('[data-act="quests"]').click();
    out.quests = !$('quests').hidden; document.querySelector('#quests .close').click();
    return out;
  });
  t.ok(menu.oldHidden, 'the top buttons and the minimap are tucked away', menu);
  t.ok(menu.open && ['quests', 'map', 'cam', 'sound', 'time', 'dogs'].every(a => menu.items.includes(a)), 'one button opens the menu with everything (the game waits)', menu.items);
  t.ok(menu.gopro && menu.free && menu.lockedAgain, 'the camera goes round: leash → on the head → free → leash', menu);
  t.ok(menu.soundChanged && menu.closed, 'sound from the menu; Escape closes it', menu);
  t.ok(menu.map && menu.quests, 'the map and the quests open from the menu', menu);
};
