// Controls that agree: a drag (or mouse, or X) to the right turns the camera to look right; with the
// stick held up the dog turns right along with it; and when the dog runs off sideways, the camera
// comes round behind it by itself within a few seconds (no faster than the comfort limit), while the dog keeps running straight.
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker&nopost#runner');
  const r = await page.evaluate(() => {
    const R_ = window.__runner, p = R_.player, M = window.R.modes.runner, ctx = R_.ctx, w = R_.world, inp = R_.input, rig = R_.rig, out = {};
    w.dynamic = []; R_.traffic.update = () => {};
    R_.setCam('free', true);   // these are the free camera's controls
    // one frame as the game runs it, with the stick at (mx, my) and an optional camera drag
    const frame = (mx, my, drag) => {
      inp.dirMode = true; inp.mx = mx; inp.my = my; inp.mag = Math.hypot(mx, my) ? 1 : 0; inp.camDrag = drag || 0; inp.camTurn = 0;
      R_.worldDir(); M.update(1 / 30, ctx); w.update(p.x, p.z, 2); rig.update(1 / 30, p, 0, inp);
    };
    const start = () => { Object.assign(p, { x: 37.5, z: 60, y: 0, heading: 0, vx: 0, vz: -12, speed: 12, yawRate: 0, steerS: 0, superOn: false, energy: 0 }); w.update(p.x, p.z, 99); rig.snap(p); };
    // the camera looks right after a drag to the right
    start();
    const d0 = new THREE.Vector3(), d1 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    rig.cam.getWorldDirection(d0); const right = new THREE.Vector3().crossVectors(d0, up).normalize();
    frame(0, 0, 0.4); rig.cam.getWorldDirection(d1);
    out.lookRight = +d1.dot(right).toFixed(2);
    // stick up + a drag right: the dog turns right (its heading goes down), the same way as the camera
    start(); const h0 = p.heading;
    for (let k = 0; k < 20; k++) frame(0, 1, k < 10 ? 0.05 : 0);
    out.dogTurn = +(p.heading - h0).toFixed(2);
    out.camDogGap = +Math.abs(R.angDiff(rig.heading, p.heading)).toFixed(2);
    // stick held to the right: the dog turns right once and runs straight; the camera comes round behind
    start();
    let hMid = 0;
    for (let k = 0; k < 150; k++) { frame(1, 0); if (k === 30) hMid = p.heading; }
    out.straight = +Math.abs(R.angDiff(p.heading, hMid)).toFixed(2);
    out.behind = +Math.abs(R.angDiff(rig.heading, p.heading)).toFixed(2);
    out.turnedRight = +(p.heading).toFixed(2);
    return out;
  });
  t.ok(r.lookRight > 0.05, 'a drag to the right turns the camera to look right', r);
  t.ok(r.dogTurn < -0.3 && r.camDogGap < 0.25, 'stick up + a drag right: the dog turns right with the camera', r);
  t.ok(r.turnedRight < -1.2 && r.straight < 0.1, 'stick held right: the dog turns right and then runs straight (no circling)', r);
  t.ok(r.behind < 0.3, 'the camera comes round behind the dog by itself within 5 s', r);
};
