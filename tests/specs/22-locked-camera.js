// The runner's default: the camera "on the leash" (fixed ~1 m behind the collar) and the gear controls.
// The left hand has a gear lever (stop, walk, trot, run, gallop, super speed — it stays where it is set),
// a jump and a slide button; the right thumb steers anywhere on the right half (further from where it went
// down = a sharper turn; let go = straight) and a quick flick up or down shifts a gear; a double tap jumps.
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
    const g = {}; for (const b of document.querySelectorAll('#gearBox button')) g[b.dataset.g] = c(b);
    const z = document.getElementById('jumpZone').getBoundingClientRect();
    return { gear: g, pad: { x: z.left + z.width * 0.5, y: z.top + z.height * 0.55 }, jump: c(document.getElementById('jumpBtn')), slide: c(document.getElementById('slideBtn')),
      stickHidden: getComputedStyle(document.getElementById('stickZone')).display === 'none', locked: R_.rig.locked && R_.input.camLock && document.body.classList.contains('gears') };
  });
  const step = n => page.evaluate(n => window.__step(n), n);
  const m = page.mouse, tap = async q => { await m.move(q.x, q.y); await m.down(); await m.up(); };
  const flick = async dy => { await m.move(pt.pad.x, pt.pad.y); await m.down(); await m.move(pt.pad.x, pt.pad.y + dy / 2); await m.move(pt.pad.x, pt.pad.y + dy); await m.up(); };
  // each gear: its own pace and gait
  const gears = [];
  for (const g of ['1', '2', '3', '4']) { await tap(pt.gear[g]); gears.push(await step(g === '4' ? 90 : 70)); }
  // the right thumb: down in the middle of the right half, slide right: the dog turns right
  await m.move(pt.pad.x, pt.pad.y); await m.down(); await m.move(pt.pad.x + 30, pt.pad.y); await m.move(pt.pad.x + 60, pt.pad.y);
  const turn = await step(40);
  await m.move(pt.pad.x, pt.pad.y);
  const after = await step(30);
  // let go: it keeps the gear and runs straight
  await m.up();
  const h0 = after.heading, cruise = await step(30);
  // a double tap: it jumps
  await m.move(pt.pad.x, pt.pad.y); await m.down(); await m.up(); await m.down();
  const jump = await step(8);
  await m.up();
  await step(40);
  // the jump button on the left
  await m.move(pt.jump.x, pt.jump.y); await m.down();
  const jumpL = await step(8);
  await m.up(); await step(40);
  // a flick up: super speed; a flick down: back to a gallop, super speed off
  await flick(-90); const sup = await step(75);
  await flick(90); const down = await step(10);
  // flick down to a stop
  for (let i = 0; i < 4; i++) await flick(90);
  const stop = await step(90);
  // keys (with the locked camera): W shifts up, S down
  const keys = await page.evaluate(() => {
    const inp = window.__runner.input, key = (type, code) => dispatchEvent(new KeyboardEvent(type, { code }));
    const out = [];
    key('keydown', 'KeyW'); key('keyup', 'KeyW'); out.push(inp.gear);
    key('keydown', 'KeyW'); key('keyup', 'KeyW'); out.push(inp.gear);
    key('keydown', 'KeyS'); key('keyup', 'KeyS'); out.push(inp.gear);
    key('keydown', 'Digit4'); key('keyup', 'Digit4'); out.push(inp.gear);
    key('keydown', 'Digit0'); key('keyup', 'Digit0'); out.push(inp.gear);
    return out;
  });
  t.ok(pt.locked && pt.stickHidden, 'the runner starts with the camera on the leash and the gears (no stick)', pt);
  t.ok(pt.gear['5'].shown && pt.jump.shown && pt.slide.shown && pt.jump.x < pt.pad.x && pt.slide.x < pt.pad.x, 'the gear lever, jump and slide are on the left', pt);
  const [g1, g2, g3, g4] = gears;
  t.ok(g1.speed > 0.6 && g1.speed < 1.8, 'gear 1: a walk', g1.speed);
  t.ok(g2.speed > 2.6 && g2.speed < 5, 'gear 2: a trot', g2.speed);
  t.ok(g3.speed > 7 && g3.speed < 11, 'gear 3: a run', g3.speed);
  t.ok(g4.speed > 14 && g4.maxSpeed < 16.5 && !g4.superOn && Math.abs(g4.heading) < 0.05, 'gear 4: a straight gallop, no super speed by itself', g4);
  t.ok(turn.heading < -0.6, 'the right thumb slides right: the dog turns right', turn);
  t.ok(Math.abs(cruise.heading - h0) < 0.05 && cruise.speed > 14, 'thumb off: it runs straight on in its gear', { h0, cruise });
  t.ok(turn.maxGap < 0.12 && after.gap < 0.02, 'on the leash: the camera turns with the dog at once (no lag)', { turn, after });
  t.ok(g4.minD > 0.4 && g4.maxD < 0.8 && g4.camUp > 1.2 && g4.camUp < 1.7, 'about a metre behind the collar, a little above the head', g4);
  t.ok(Math.max(g4.maxJump, turn.maxJump, after.maxJump) < 0.15, 'the picture never jumps', { run: g4.maxJump, turn: turn.maxJump, after: after.maxJump });
  t.ok(jump.air && jumpL.air, 'a double tap jumps, so does the jump button on the left', { jump, jumpL });
  t.ok(sup.gear === 5 && sup.superOn && sup.maxSpeed > 17.5, 'a flick up from a gallop: super speed', sup);
  t.ok(down.gear === 4 && !down.superOn, 'a flick down: a gallop again, super speed off', down);
  t.ok(stop.gear === 0 && stop.speed < 0.5, 'flicked down to the bottom: it stops', stop);
  t.ok(keys.join() === '1,2,1,4,0', 'keys: W / S shift gears, digits pick one', keys);

  // a bot steering like a handlebar towards the cat catches cats
  const chase = await page.evaluate(() => {
    const r = window.__runner, M = window.R.modes.runner, ctx = r.ctx, p = r.player, c = r.cat, w = r.world, inp = r.input, A = window.R.angDiff;
    inp.poll = function () { this.dirMode = false; const want = Math.atan2(-(c.x - p.x), -(c.z - p.z)); this.steer = Math.max(-1, Math.min(1, -A(p.heading, want) * 2)); this.throttle = 1; };
    let gapMax = 0;
    const s0 = +document.getElementById('score').textContent, dt = 1 / 30;
    for (let i = 0; i < 1800; i++) {
      inp.poll();
      ctx.traffic.update(dt, p); M.update(dt, ctx); w.update(p.x, p.z, 2); ctx.fx.update(dt); r.rig.update(dt, p, i * dt, inp);
      const fx = -Math.sin(p.heading), fz = -Math.cos(p.heading);
      const ob = w.obstaclesNear(p.x + fx * 2.2, p.z + fz * 2.2, 0.5).find(o => o.h < 1.2);
      if (ob && !p.air) { inp._jumpEdge = true; inp.jumpHeld = true; } else if (p.y > 0.9) inp.jumpHeld = false;
      gapMax = Math.max(gapMax, Math.abs(A(r.rig.heading, p.heading)));
    }
    return { catches: +document.getElementById('score').textContent - s0, gapMaxDeg: Math.round(gapMax * 57.3) };
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
