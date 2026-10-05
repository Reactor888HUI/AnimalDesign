// The whippet model: the skeleton the animation drives is unchanged (names, parents, rest positions),
// the skin is sound (weights sum to 1, no degenerate triangles), the triangle budget holds, and every
// movement (stand, walk, trot, gallop, jump, somersault, crash, limp, slide) poses without NaN and
// without paws sinking into the ground.
const BASELINE = [["pelvis",null,[0,0.45,0.2]],["lumbar","pelvis",[0,0.015,-0.15]],["chest","lumbar",[0,-0.015,-0.15]],["neck1","chest",[0,0.02,-0.18]],["neck2","neck1",[0,0.09,-0.03]],["head","neck2",[0,0.06,-0.035]],["tail1","pelvis",[0,-0.035,0.105]],["tail2","tail1",[0,-0.055,0.05]],["tail3","tail2",[0,-0.07,0.035]],["tail4","tail3",[0,-0.09,0.015]],["scapL","chest",[-0.055,0.05,-0.1]],["humL","scapL",[0,-0.13,-0.075]],["foreL","humL",[0,-0.12,0.055]],["pastL","foreL",[0,-0.175,-0.005]],["fpawL","pastL",[0,-0.045,-0.015]],["femurL","pelvis",[-0.06,-0.025,0.035]],["tibiaL","femurL",[0,-0.16,-0.085]],["metaL","tibiaL",[0,-0.155,0.15]],["hpawL","metaL",[0,-0.08,-0.008]],["scapR","chest",[0.055,0.05,-0.1]],["humR","scapR",[0,-0.13,-0.075]],["foreR","humR",[0,-0.12,0.055]],["pastR","foreR",[0,-0.175,-0.005]],["fpawR","pastR",[0,-0.045,-0.015]],["femurR","pelvis",[0.06,-0.025,0.035]],["tibiaR","femurR",[0,-0.16,-0.085]],["metaR","tibiaR",[0,-0.155,0.15]],["hpawR","metaR",[0,-0.08,-0.008]]];
const TRI_BUDGET = 5172;          // 2 x the model before the rework (2586)
exports.run = async t => {
  const page = await t.open('runner/whippet.html', { game: false });
  await page.waitForFunction(() => window.__lab, null, { timeout: 60000 });
  const r = await page.evaluate(base => {
    const L = window.__lab; L.stop();
    const d = window.R.makeWhippet(), g = d.mesh.geometry, out = {};
    // skeleton
    const bones = d.mesh.skeleton.bones.map(x => [x.name, x.parent && x.parent.isBone ? x.parent.name : null, x.position.toArray().map(v => +v.toFixed(5))]);
    out.boneDiff = base.filter((b, i) => !bones[i] || bones[i][0] !== b[0] || bones[i][1] !== b[1] || b[2].some((v, k) => Math.abs(v - bones[i][2][k]) > 1e-4)).map(b => b[0]);
    out.boneCount = bones.length;
    // skin weights
    const sw = g.attributes.skinWeight; let bad = 0;
    for (let i = 0; i < sw.count; i++) if (Math.abs(sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i) - 1) > 1e-3) bad++;
    out.badWeights = bad;
    // degenerate triangles
    const p = g.attributes.position, ix = g.index, A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
    let degen = 0;
    for (let i = 0; i < ix.count; i += 3) {
      A.fromBufferAttribute(p, ix.getX(i)); B.fromBufferAttribute(p, ix.getX(i + 1)); C.fromBufferAttribute(p, ix.getX(i + 2));
      if (B.clone().sub(A).cross(C.clone().sub(A)).length() < 1e-9) degen++;
    }
    out.degenerate = degen;
    // triangles and draw calls of the whole dog
    let tris = 0, meshes = 0;
    d.root.traverse(o => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
    out.tris = tris; out.meshes = meshes;
    // movements: run the lab's dog through every state and watch the bones
    const S = L.S, dog = L.dog, V = new THREE.Vector3();
    const check = name => {
      dog.root.updateMatrixWorld(true);
      let minY = 9, nan = false;
      for (const b of dog.mesh.skeleton.bones) { b.getWorldPosition(V); if (!isFinite(V.x + V.y + V.z)) nan = true; if (/paw/.test(b.name)) minY = Math.min(minY, V.y - (S.y || 0)); }
      return { name, nan, minPaw: +minY.toFixed(3) };
    };
    const res = [];
    const run = (n, fn) => { for (let i = 0; i < n; i++) { fn && fn(i); L.step(1 / 60); } };
    for (const v of [0, 1.2, 3.6, 10, 16]) { L.setSpeed(v); S.speed = v; let worst = null; run(120, () => { const c = check('v' + v); if (!worst || c.nan || c.minPaw < worst.minPaw) worst = c; }); res.push(worst); }
    S.vy = 9.4; S.air = true; run(30); res.push(check('jump'));
    S.vy = 7.5; S.flip = 0; run(20); res.push(check('flip'));
    run(60); S.crash = 0; S.limp = 1; run(30); res.push(check('crash'));
    run(90); res.push(check('limp'));
    S.limp = 0; L.setSpeed(12); S.speed = 12; run(60);
    for (let i = 0; i < 40; i++) { dog.update(1 / 60, { speed: 10, speed01: 0.6, air: false, vy: 0, turn: 0, flip: -1, crash: -1, limp: 0, land: 0, slide: true }); }
    res.push(check('slide'));
    out.moves = res;
    return out;
  }, BASELINE);
  t.ok(r.boneCount === 28 && !r.boneDiff.length, 'the 28 bones are unchanged (names, parents, rest positions)', r.boneDiff);
  t.ok(r.badWeights === 0, 'skin weights sum to 1', r.badWeights);
  t.ok(r.degenerate === 0, 'no degenerate triangles', r.degenerate);
  t.ok(r.tris <= TRI_BUDGET, 'triangles within budget (' + TRI_BUDGET + ')', { tris: r.tris, meshes: r.meshes });
  for (const m of r.moves) t.ok(!m.nan && m.minPaw > -0.03, 'pose ok: ' + m.name, m);
};
