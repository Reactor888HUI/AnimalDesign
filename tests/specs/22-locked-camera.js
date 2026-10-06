// The runner's default: the camera locked behind the dog and one-thumb controls. The stick steers like
// a handlebar (sideways = turn, up = pace, back = stop), the pace is kept when the thumb lets go, a double
// tap jumps; the camera stays right behind the dog and turns smoothly (no jerks); a bot steering this
// way catches cats; and the one menu button in the corner holds the map, quests, camera, sound and time.
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
      let maxRate = 0, maxAcc = 0, last = rig.heading, lastRate = 0;
      for (let k = 0; k < n; k++) {
        inp._poll(); R_.worldDir(); M.update(1 / 30, ctx); R_.world.update(p.x, p.z, 2); rig.update(1 / 30, p, 0, inp);
        const rate = A(last, rig.heading) * 30; last = rig.heading;
        maxRate = Math.max(maxRate, Math.abs(rate)); if (k > 0) maxAcc = Math.max(maxAcc, Math.abs(rate - lastRate) * 30); lastRate = rate;
      }
      return { speed: +p.speed.toFixed(1), heading: +p.heading.toFixed(2), gap: +Math.abs(A(rig.heading, p.heading)).toFixed(2), air: p.air || p.y > 0.3, maxRate: Math.round(maxRate * 57.3), maxAcc: Math.round(maxAcc * 57.3) };
    };
    const b = document.getElementById('stickZone').getBoundingClientRect();
    return { x: b.left + b.width * 0.4, y: b.top + b.height * 0.6, locked: R_.rig.locked && R_.input.camLock };
  });
  const step = n => page.evaluate(n => window.__step(n), n);
  const m = page.mouse;
  // push up: the dog gallops off straight
  await m.move(pt.x, pt.y); await m.down(); await m.move(pt.x, pt.y - 50);
  const run = await step(60);
  // push up and right: it turns right, the camera stays behind it, smoothly
  await m.move(pt.x + 42, pt.y - 34);
  const turn = await step(40);
  await m.move(pt.x, pt.y - 50);
  const after = await step(30);
  // let go: it keeps the pace
  await m.up();
  const cruise = await step(30);
  // a double tap: it jumps
  await m.move(pt.x, pt.y); await m.down(); await m.up(); await m.down();
  const jump = await step(8);
  await m.up();
  await step(40);
  // pull back: it stops
  await m.down(); await m.move(pt.x, pt.y + 50);
  const stop = await step(70);
  await m.up();
  t.ok(pt.locked, 'the runner starts with the camera locked behind the dog', pt);
  t.ok(run.speed > 14 && Math.abs(run.heading) < 0.05, 'stick up: a straight gallop', run);
  t.ok(turn.heading < -0.6, 'stick to the right: the dog turns right', turn);
  t.ok(after.gap < 0.15, 'the camera is right behind the dog again', after);
  t.ok(turn.maxRate <= 130 && turn.maxAcc <= 700, 'the camera turns smoothly (no jerks, at most ~125 deg/s)', turn);
  t.ok(cruise.speed > run.speed * 0.85, 'thumb off the stick: the dog keeps running', { before: run.speed, after: cruise.speed });
  t.ok(jump.air, 'a double tap jumps', jump);
  t.ok(stop.speed < 1, 'stick back: the dog stops', stop);

  // a bot steering like a handlebar towards the cat catches cats
  const chase = await page.evaluate(() => {
    const r = window.__runner, M = window.R.modes.runner, ctx = r.ctx, p = r.player, c = r.cat, w = r.world, inp = r.input, A = window.R.angDiff;
    inp.poll = function () { this.dirMode = false; const want = Math.atan2(-(c.x - p.x), -(c.z - p.z)); this.steer = Math.max(-1, Math.min(1, -A(p.heading, want) * 2)); this.throttle = 1; };
    let lastH = r.rig.heading, camMax = 0;
    const s0 = +document.getElementById('score').textContent, dt = 1 / 30;
    for (let i = 0; i < 1800; i++) {
      inp.poll();
      ctx.traffic.update(dt, p); M.update(dt, ctx); w.update(p.x, p.z, 2); ctx.fx.update(dt); r.rig.update(dt, p, i * dt, inp);
      const fx = -Math.sin(p.heading), fz = -Math.cos(p.heading);
      const ob = w.obstaclesNear(p.x + fx * 2.2, p.z + fz * 2.2, 0.5).find(o => o.h < 1.2);
      if (ob && !p.air) { inp._jumpEdge = true; inp.jumpHeld = true; } else if (p.y > 0.9) inp.jumpHeld = false;
      camMax = Math.max(camMax, Math.abs(A(lastH, r.rig.heading)) / dt); lastH = r.rig.heading;
    }
    return { catches: +document.getElementById('score').textContent - s0, camMaxDegS: Math.round(camMax * 57.3) };
  });
  t.ok(chase.catches >= 1 && chase.camMaxDegS <= 130, 'steering like a handlebar catches cats; the camera stays within ~125 deg/s', chase);

  // the menu in the corner
  const menu = await page.evaluate(() => {
    const $ = id => document.getElementById(id), R_ = window.__runner, more = $('more'), out = {};
    out.oldHidden = ['menuBtn', 'muteBtn', 'themeBtn', 'minimap', 'questBtn'].every(id => getComputedStyle($(id)).display === 'none');
    $('moreBtn').click();
    out.open = !more.hidden && R_.ctx.paused;
    out.items = [...more.querySelectorAll('button')].filter(b => getComputedStyle(b).display !== 'none').map(b => b.dataset.act);
    const cam = more.querySelector('[data-act="cam"]');
    cam.click(); out.free = !R_.rig.locked && /свободная/.test(cam.textContent);
    cam.click(); out.lockedAgain = R_.rig.locked;
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
  t.ok(menu.free && menu.lockedAgain, 'the camera can be switched to free and back', menu);
  t.ok(menu.soundChanged && menu.closed, 'sound from the menu; Escape closes it', menu);
  t.ok(menu.map && menu.quests, 'the map and the quests open from the menu', menu);
};
