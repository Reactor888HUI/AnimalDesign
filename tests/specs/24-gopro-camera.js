// The "GoPro" camera (the runner): on the dog's head, looking ahead, only the muzzle in the picture.
// It must not shake with the gallop (the head bobs ~25 cm), never roll, never get inside the head,
// keep the muzzle at the bottom of the picture, hide the dog in a flip (its head would sweep through
// the picture) and a hat (it would sit on the lens). The camera button and the menu go round all three views.
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker&nopost#runner', { viewport: { width: 844, height: 390 } });
  const r = await page.evaluate(() => {
    const R_ = window.__runner, p = R_.player, inp = R_.input, rig = R_.rig, M = window.R.modes.runner, ctx = R_.ctx;
    R_.world.dynamic = []; R_.traffic.update = () => {};
    R_.setCam('gopro', true);
    Object.assign(p, { x: 37.5, z: 60, y: 0, heading: 0, vx: 0, vz: 0, speed: 0, yawRate: 0, steerS: 0 });
    R_.world.update(p.x, p.z, 99); rig.snap(p);
    const out = { on: rig.locked && rig.gopro && inp.camLock };
    const B = p.ent.bones, v = new THREE.Vector3(), cam = rig.cam, A = window.R.angDiff;
    // run n frames at a pace; what the camera did
    const go = (n, thr, steer) => {
      const S = { ny: [], up: [], vy: 0, roll: 0, inHead: 0, nose: 0, frames: 0, gap: 0 };
      let lastY = null;
      for (let k = 0; k < n; k++) {
        inp.throttle = thr; inp.steer = steer || 0;
        M.update(1 / 30, ctx); R_.world.update(p.x, p.z, 2); rig.update(1 / 30, p, 0, inp);
        cam.updateMatrixWorld();
        if (k < 30) continue;
        S.frames++;
        const y = cam.position.y - p.y; S.up.push(y);
        if (lastY !== null) S.vy = Math.max(S.vy, Math.abs(y - lastY) * 30); lastY = y;
        // roll: the camera's own "right" stays level
        const e = cam.matrixWorld.elements; S.roll = Math.max(S.roll, Math.abs(e[1]));
        // never inside the head: above the top of the skull (~8 cm over the head bone)
        B.head.getWorldPosition(v); if (cam.position.y < v.y + 0.09) S.inHead++;
        // the nose tip in the picture: in the lower part, near the middle
        v.set(0, -0.027, -0.22); B.head.localToWorld(v); v.project(cam);
        if (v.z < 1 && Math.abs(v.x) < 0.35 && v.y > -1 && v.y < -0.35) S.nose++;
        S.ny.push(v.y);
        S.gap = Math.max(S.gap, Math.abs(A(rig.heading, p.heading)));
      }
      return { speed: +p.speed.toFixed(1), bob: +(Math.max(...S.up) - Math.min(...S.up)).toFixed(3), vy: +S.vy.toFixed(2), roll: +S.roll.toFixed(3),
        ny: [+Math.min(...S.ny).toFixed(2), +Math.max(...S.ny).toFixed(2)], inHead: S.inHead, nose: +(S.nose / S.frames).toFixed(2), gap: +S.gap.toFixed(2) };
    };
    out.walk = go(120, 0.15);
    out.trot = go(120, 0.4);
    out.gallop = go(150, 1);
    out.turn = go(60, 1, 0.8);
    // a jump and a flip (jump again in the air): the dog is hidden while it turns over
    go(10, 1);
    inp._jumpEdge = true; inp.jumpHeld = true;
    let hidden = 0, flipping = 0;
    for (let k = 0; k < 40; k++) {
      if (k === 6) inp._jumpEdge = true;
      M.update(1 / 30, ctx); R_.world.update(p.x, p.z, 2); rig.update(1 / 30, p, 0, inp); R_.camDress();
      if (p.flip >= 0) { flipping++; if (!p.ent.mesh.visible) hidden++; }
    }
    inp.jumpHeld = false;
    go(40, 1); R_.camDress();
    out.flip = { flipping, hidden, visibleAfter: p.ent.mesh.visible };
    // a hat: not on the lens
    const W = R_.wardrobe; W.owned.add('head-tophat'); W.wear('head-tophat');
    R_.camDress(); const hatOff = !p.ent.anchors.crown.visible;
    R_.setCam('lock', true); R_.camDress(); const hatBack = p.ent.anchors.crown.visible;
    W.wear('head-none');
    out.hat = { hatOff, hatBack };
    // the camera button and the menu: leash → GoPro → free → leash
    const btn = document.getElementById('camBtn'), seq = [];
    for (let i = 0; i < 3; i++) { btn.click(); seq.push(rig.locked ? (rig.gopro ? 'gopro' : 'lock') : 'free'); }
    document.getElementById('moreBtn').click();
    const mi = document.querySelector('#more [data-act="cam"]');
    mi.click(); seq.push(mi.querySelector('.v').textContent);
    document.getElementById('moreBtn').click();
    out.seq = seq; out.btnShown = getComputedStyle(btn).display !== 'none';
    out.saved = localStorage.getItem('runner-cam');
    return out;
  });
  t.ok(r.on, 'the GoPro view can be switched on (one-thumb controls stay)', r.on);
  for (const k of ['walk', 'trot', 'gallop']) {
    const g = r[k];
    t.ok(g.bob < 0.05 && g.vy < 0.5, k + ': the picture does not bob with the head (it bobs ~25 cm)', g);
    t.ok(g.roll < 0.01, k + ': no roll', g.roll);
    t.ok(g.inHead === 0, k + ': never inside the head', g.inHead);
    t.ok(g.nose > 0.8, k + ': the muzzle is at the bottom of the picture', g.nose);
  }
  t.ok(r.gallop.speed > 14, 'it gallops', r.gallop.speed);
  t.ok(r.turn.gap < 0.12 && r.turn.roll < 0.01, 'in a turn: no lag, no roll', r.turn);
  t.ok(r.flip.flipping > 3 && r.flip.hidden === r.flip.flipping && r.flip.visibleAfter, 'in a flip the dog is hidden, then back', r.flip);
  t.ok(r.hat.hatOff && r.hat.hatBack, 'a hat is not on the lens (and comes back on the leash)', r.hat);
  t.ok(r.btnShown && r.seq.join() === 'gopro,free,lock,на морде', 'the camera button and the menu: leash → GoPro → free → leash', r.seq);
  t.ok(r.saved === 'gopro', 'the choice is remembered', r.saved);
};
