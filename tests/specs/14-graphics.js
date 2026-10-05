// Graphics: soft ground shadows (ambient occlusion) in the detailed blocks; streets wet at night and
// dry by day; and the lamps' reflections really brighten a wet street (measured on the picture).
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker&nopost#runner');
  const r = await page.evaluate(() => {
    const r = window.__runner, R = window.R, W = R.wet, w = r.world;
    let ao = 0;
    for (const c of w.cells.values()) if (c.near) c.group.traverse(o => { if (o.isMesh && o.material === R.mat('ao')) ao += o.geometry.attributes.position.count / 3; });
    r.setTheme('day'); const dayWet = W.uWet.value;
    r.setTheme('night'); const nightWet = W.uWet.value;
    // the camera down the street at night, the lamps ahead; render the picture with and without them
    const p = r.player; p.x = 37; p.z = 30; p.heading = 0; w.update(p.x, p.z, 99); r.rig.snap(p);
    for (let i = 0; i < 30; i++) r.rig.update(1 / 30, p, i / 30, r.input);
    r.camera.updateMatrixWorld();
    W.uCam.value.copy(r.camera.position);
    const cd = r.camera.getWorldDirection(new THREE.Vector3()), cp = r.camera.position;
    w.lampsNear(cp.x + cd.x * 25, cp.z + cd.z * 25, W.count).forEach((l, i) => W.uLamps.value[i].set(l.x, l.y, l.z));
    const rt = new THREE.WebGLRenderTarget(160, 96);
    const shot = () => {
      const px = new Uint8Array(160 * 96 * 4);
      r.renderer.setRenderTarget(rt); r.renderer.render(r.scene, r.camera); r.renderer.setRenderTarget(null);
      r.renderer.readRenderTargetPixels(rt, 0, 0, 160, 96, px);
      return px;
    };
    const a = shot(); const k = W.uLampK.value; W.uLampK.value = 0; const b = shot(); W.uLampK.value = k;
    // pixels the reflections made clearly brighter, and pixels pushed to white
    let lit = 0, white = 0;
    for (let i = 0; i < a.length; i += 4) {
      if ((a[i] + a[i + 1] + a[i + 2]) - (b[i] + b[i + 1] + b[i + 2]) > 45) lit++;
      if (a[i] > 250 && a[i + 1] > 250 && a[i + 2] > 250 && !(b[i] > 250 && b[i + 1] > 250 && b[i + 2] > 250)) white++;
    }
    const pct = n => +(100 * n / (160 * 96)).toFixed(2);
    return { aoTriangles: ao, dayWet: +dayWet.toFixed(2), nightWet: +nightWet.toFixed(2), litPct: pct(lit), whitePct: pct(white) };
  });
  t.ok(r.aoTriangles > 100, 'soft shadows under things in the detailed blocks', r.aoTriangles);
  t.ok(r.nightWet > 0.5 && r.dayWet < 0.2, 'wet streets at night, dry by day', [r.dayWet, r.nightWet]);
  t.ok(r.litPct > 1.5 && r.litPct < 30 && r.whitePct < 1, 'lamp reflections light up streaks on the wet street (not the whole street)', r);
};
