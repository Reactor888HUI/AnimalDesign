// The whippet model: the skeleton the animation drives is unchanged (names, parents, rest positions),
// the skin is sound (weights sum to 1, no degenerate triangles), the triangle budget holds, and every
// movement (stand, walk, trot, gallop, jump, somersault, crash, limp, slide) poses without NaN and
// without paws sinking into the ground.
const BASELINE = [["pelvis",null,[0,0.45,0.2]],["lumbar","pelvis",[0,0.015,-0.15]],["chest","lumbar",[0,-0.015,-0.15]],["neck1","chest",[0,0.02,-0.18]],["neck2","neck1",[0,0.09,-0.03]],["head","neck2",[0,0.06,-0.035]],["tail1","pelvis",[0,-0.035,0.105]],["tail2","tail1",[0,-0.055,0.05]],["tail3","tail2",[0,-0.07,0.035]],["tail4","tail3",[0,-0.09,0.015]],["scapL","chest",[-0.055,0.05,-0.1]],["humL","scapL",[0,-0.13,-0.075]],["foreL","humL",[0,-0.12,0.055]],["pastL","foreL",[0,-0.175,-0.005]],["fpawL","pastL",[0,-0.045,-0.015]],["femurL","pelvis",[-0.06,-0.025,0.035]],["tibiaL","femurL",[0,-0.16,-0.085]],["metaL","tibiaL",[0,-0.155,0.15]],["hpawL","metaL",[0,-0.08,-0.008]],["scapR","chest",[0.055,0.05,-0.1]],["humR","scapR",[0,-0.13,-0.075]],["foreR","humR",[0,-0.12,0.055]],["pastR","foreR",[0,-0.175,-0.005]],["fpawR","pastR",[0,-0.045,-0.015]],["femurR","pelvis",[0.06,-0.025,0.035]],["tibiaR","femurR",[0,-0.16,-0.085]],["metaR","tibiaR",[0,-0.155,0.15]],["hpawR","metaR",[0,-0.08,-0.008]]];
const TRI_BUDGET = 5172;
// world positions of the 28 bones after each step of a fixed input sequence. Recorded from the model
// before the v2 rework (identical to it), then re-recorded once when the slide and crash poses were
// lifted out of the ground: any other change to the animation shows up here
const POSE_BASELINE = [[[0,0.6724,0.3],[0,0.6971,0.0752],[0,0.6746,-0.1498],[0,0.7019,-0.4201],[0,0.8373,-0.464],[0,0.9283,-0.5147],[0,0.6183,0.457],[0,0.5389,0.5352],[0,0.4359,0.5916],[0,0.3023,0.6212],[-0.0825,0.7481,-0.3005],[-0.0825,0.552,-0.4111],[-0.0825,0.3747,-0.3229],[-0.0825,0.1125,-0.3375],[-0.0825,0.045,-0.36],[-0.09,0.6343,0.3521],[-0.09,0.3749,0.2713],[-0.09,0.165,0.5175],[-0.09,0.045,0.5055],[0.0825,0.7481,-0.3005],[0.0825,0.552,-0.4111],[0.0825,0.3747,-0.3229],[0.0825,0.1125,-0.3375],[0.0825,0.045,-0.36],[0.09,0.6343,0.3521],[0.09,0.3749,0.2713],[0.09,0.165,0.5175],[0.09,0.045,0.5055]],[[0,0.6637,0.3],[0,0.6862,0.075],[0,0.6637,-0.15],[0,0.6937,-0.42],[0,0.8251,-0.4746],[0,0.9082,-0.5375],[0,0.6112,0.4575],[0,0.5318,0.5358],[0,0.428,0.5906],[0,0.2939,0.6178],[-0.0825,0.7387,-0.3],[-0.0825,0.5437,-0.4125],[-0.0825,0.3589,-0.3413],[-0.0825,0.1134,-0.4346],[-0.0825,0.045,-0.4541],[-0.09,0.6262,0.3525],[-0.09,0.4745,0.127],[-0.09,0.1955,0.2909],[-0.09,0.0893,0.2338],[0.0825,0.7387,-0.3],[0.0825,0.5437,-0.4125],[0.0825,0.4035,-0.2727],[0.0825,0.1557,-0.1858],[0.0825,0.0888,-0.1616],[0.09,0.6262,0.3525],[0.09,0.3718,0.2568],[0.09,0.1606,0.5019],[0.09,0.045,0.5362]],[[0,0.6916,0.3],[0,0.717,0.0753],[0,0.6975,-0.15],[0,0.731,-0.4195],[0,0.8597,-0.4802],[0,0.937,-0.5501],[0,0.637,0.4568],[0,0.5499,0.5263],[0,0.4384,0.5633],[0,0.3016,0.5643],[-0.0825,0.7744,-0.299],[-0.0825,0.5809,-0.414],[-0.0825,0.4503,-0.2652],[-0.0825,0.1888,-0.2407],[-0.0825,0.1326,-0.1971],[-0.09,0.6534,0.352],[-0.09,0.4551,0.1661],[-0.09,0.1654,0.3103],[-0.09,0.045,0.3164],[0.0825,0.7744,-0.299],[0.0825,0.5809,-0.414],[0.0825,0.3853,-0.4449],[0.0825,0.1284,-0.4993],[0.0825,0.0596,-0.5172],[0.09,0.6534,0.352],[0.09,0.3823,0.3712],[0.09,0.2207,0.6515],[0.09,0.1363,0.5654]],[[0,0.6525,0.3],[0,0.684,0.0761],[0,0.6561,-0.1483],[0,0.6623,-0.4199],[0,0.7647,-0.5187],[0,0.8012,-0.6163],[0,0.5937,0.4553],[0,0.4853,0.4811],[0,0.3721,0.4499],[0,0.268,0.3611],[-0.0825,0.7176,-0.3043],[-0.0825,0.5073,-0.3846],[-0.0825,0.428,-0.2031],[-0.0825,0.3772,-0.4607],[-0.0825,0.3432,-0.3982],[-0.09,0.6129,0.351],[-0.09,0.4139,0.1659],[-0.09,0.1645,0.372],[-0.09,0.045,0.3884],[0.0825,0.7176,-0.3043],[0.0825,0.5073,-0.3846],[0.0825,0.5846,-0.2023],[0.0825,0.359,-0.3366],[0.0825,0.3424,-0.2674],[0.09,0.6129,0.351],[0.09,0.3473,0.4085],[0.09,0.1564,0.6697],[0.09,0.045,0.7159]],[[0,0.6915,0.3],[0,0.7132,0.0749],[0,0.7178,-0.1511],[0,0.8119,-0.406],[0,0.9421,-0.4634],[0,1.0113,-0.5413],[0,0.6395,0.4577],[0,0.5339,0.4935],[0,0.4185,0.4719],[0,0.3061,0.3938],[-0.0825,0.8267,-0.2787],[-0.0825,0.6394,-0.4036],[-0.0825,0.473,-0.5108],[-0.0825,0.3239,-0.727],[-0.0825,0.2564,-0.7495],[-0.09,0.6541,0.3526],[-0.09,0.5132,0.585],[-0.09,0.3581,0.8689],[-0.09,0.2381,0.8568],[0.0825,0.8267,-0.2787],[0.0825,0.6394,-0.4036],[0.0825,0.4424,-0.384],[0.0825,0.4128,-0.6449],[0.0825,0.3432,-0.6301],[0.09,0.6541,0.3526],[0.09,0.5405,0.5995],[0.09,0.4187,0.8992],[0.09,0.3031,0.8646]],[[0,0.6839,0.3],[0,0.7687,0.0904],[0,0.7598,-0.1355],[0,0.745,-0.4068],[0,0.8344,-0.5175],[0,0.8555,-0.6195],[0,0.5892,0.4364],[0,0.4782,0.4464],[0,0.3719,0.3965],[0,0.2811,0.2941],[-0.0825,0.8091,-0.2958],[-0.0825,0.6139,-0.4079],[-0.0825,0.7103,-0.235],[-0.0825,0.5071,-0.0686],[-0.0825,0.4777,-0.0038],[-0.09,0.6331,0.3398],[-0.09,0.8163,0.139],[-0.09,0.5259,0.2817],[-0.09,0.4535,0.1852],[0.0825,0.8091,-0.2958],[0.0825,0.6139,-0.4079],[0.0825,0.6491,-0.2131],[0.0825,0.4659,-0.0249],[0.0825,0.4005,0.0031],[0.09,0.6331,0.3398],[0.09,0.8398,0.1633],[0.09,0.5167,0.1466],[0.09,0.4035,0.105]],[[0,0.6608,0.3],[0,0.7021,0.0777],[0,0.6657,-0.1455],[0,0.6394,-0.4159],[0,0.7264,-0.5285],[0,0.7467,-0.6307],[0,0.5953,0.4525],[0,0.4865,0.4772],[0,0.3761,0.4373],[0,0.2784,0.3415],[-0.0825,0.7082,-0.3077],[-0.0825,0.4986,-0.3899],[-0.0825,0.5993,-0.2194],[-0.0825,0.3369,-0.2075],[-0.0825,0.3228,-0.1378],[-0.09,0.619,0.3492],[-0.09,0.5552,0.085],[-0.09,0.2316,0.0879],[-0.09,0.1116,0.0759],[0.0825,0.7082,-0.3077],[0.0825,0.4986,-0.3899],[0.0825,0.5595,-0.2015],[0.0825,0.313,-0.1107],[0.0825,0.2842,-0.0457],[0.09,0.619,0.3492],[0.09,0.4869,0.1117],[0.09,0.1655,0.1483],[0.09,0.045,0.1425]],[[0,0.3915,0.3],[0,0.3952,0.0739],[0,0.3817,-0.1518],[0,0.4552,-0.4133],[0,0.5636,-0.5055],[0,0.5939,-0.6052],[0,0.3523,0.4613],[0,0.3193,0.5678],[0,0.2894,0.6814],[0,0.2334,0.8062],[-0.0825,0.4801,-0.2876],[-0.0825,0.2834,-0.3971],[-0.0825,0.2187,-0.5843],[-0.0825,0.1459,-0.8366],[-0.0825,0.0784,-0.8591],[-0.09,0.3585,0.3554],[-0.09,0.2905,0.6186],[-0.09,0.2238,0.9352],[-0.09,0.1038,0.9232],[0.0825,0.4801,-0.2876],[0.0825,0.2834,-0.3971],[0.0825,0.105,-0.483],[0.0825,0.1457,-0.7425],[0.0825,0.075,-0.7502],[0.09,0.3585,0.3554],[0.09,0.2948,0.6196],[0.09,0.2333,0.9373],[0.09,0.1145,0.9162]],[[0,0.51,0.3],[0,0.4829,0.0755],[0,0.4012,-0.1353],[0,0.3447,-0.4011],[0,0.4141,-0.5253],[0,0.4164,-0.6295],[0,0.4931,0.4652],[0,0.4433,0.5649],[0,0.3725,0.6585],[0,0.2651,0.7434],[-0.0825,0.4252,-0.3013],[-0.0825,0.2047,-0.3468],[-0.0825,0.3791,-0.4405],[-0.0825,0.1502,-0.3117],[-0.0825,0.1135,-0.2508],[-0.09,0.4849,0.3594],[-0.09,0.3257,0.1392],[-0.09,0.165,0.42],[-0.09,0.045,0.408],[0.0825,0.4252,-0.3013],[0.0825,0.2047,-0.3468],[0.0825,0.3791,-0.4405],[0.0825,0.1502,-0.3117],[0.0825,0.1135,-0.2508],[0.09,0.4849,0.3594],[0.09,0.3257,0.1392],[0.09,0.165,0.42],[0.09,0.045,0.408]],[[0.0478,0.6828,0.3],[0.0492,0.703,0.0748],[0.0474,0.6784,-0.15],[0.0494,0.7057,-0.4203],[0.0582,0.8327,-0.4839],[0.0635,0.9081,-0.5555],[0.0442,0.6319,0.458],[0.0398,0.5499,0.5333],[0.0351,0.4447,0.5852],[0.028,0.3097,0.6067],[-0.0297,0.7575,-0.3007],[-0.0434,0.5619,-0.4113],[-0.0551,0.3947,-0.5167],[-0.0701,0.1805,-0.6679],[-0.075,0.1096,-0.6638],[-0.0446,0.6522,0.3529],[-0.0585,0.4534,0.5377],[-0.0744,0.2269,0.7682],[-0.0823,0.113,0.7293],[0.1349,0.746,-0.3007],[0.1212,0.5504,-0.4113],[0.1111,0.406,-0.2762],[0.0971,0.2055,-0.1071],[0.0923,0.1379,-0.0854],[0.135,0.6396,0.3529],[0.1248,0.4938,0.1237],[0.1022,0.1711,0.129],[0.094,0.0536,0.1034]]];
const POSE_SEQ = [[300, { speed: 0 }], [120, { speed: 1.2 }], [120, { speed: 3.6 }], [180, { speed: 16 }], [30, { speed: 12, air: true, vy: 6 }], [20, { speed: 12, air: true, vy: 3, flip: 0.4 }],
  [30, { speed: 12, air: false, land: 10 }], [40, { speed: 10, slide: true }], [40, { speed: 4, crash: 0.5, limp: 1 }], [60, { speed: 5, limp: 0.6, turn: 1 }]];          // 2 x the model before the rework (2586)
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
    const at = i => ix ? ix.getX(i) : i, cnt = ix ? ix.count : p.count;
    let degen = 0;
    for (let i = 0; i < cnt; i += 3) {
      A.fromBufferAttribute(p, at(i)); B.fromBufferAttribute(p, at(i + 1)); C.fromBufferAttribute(p, at(i + 2));
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
  const moved = await page.evaluate(([seq, base]) => {
    const d = window.R.makeWhippet(), v = new THREE.Vector3();
    let maxD = 0, step = 0;
    for (const [n, s] of seq) {
      for (let i = 0; i < n; i++) d.update(1 / 60, Object.assign({ speed01: (s.speed || 0) / 16, air: false, vy: 0, turn: 0, flip: -1, crash: -1, limp: 0, land: 0, slide: false }, s));
      d.root.updateMatrixWorld(true);
      d.mesh.skeleton.bones.forEach((b, j) => { b.getWorldPosition(v); maxD = Math.max(maxD, v.distanceTo(new THREE.Vector3(...base[step][j]))); });
      step++;
    }
    return +maxD.toFixed(5);
  }, [POSE_SEQ, POSE_BASELINE]);
  t.ok(moved < 2e-4, 'the animation moves the skeleton exactly as recorded (10 movements x 28 bones)', moved);
  const ground = await page.evaluate(() => {
    const out = {}, v = new THREE.Vector3();
    for (const mode of ['slide', 'crash']) {
      const d = window.R.makeWhippet();
      for (let i = 0; i < 150; i++) d.update(1 / 60, { speed: 12, speed01: 0.75, air: false, vy: 0, turn: 0, flip: -1, crash: -1, limp: 0, land: 0 });
      let low = 9; const N = mode === 'slide' ? 60 : 84;
      for (let i = 0; i < N; i++) {
        d.update(1 / 60, { speed: mode === 'slide' ? 10 : 12 * (1 - i / N), air: false, vy: 0, turn: 0, flip: -1, crash: mode === 'crash' ? i / N : -1, limp: mode === 'crash' ? 1 : 0, land: 0, slide: mode === 'slide' });
        d.root.updateMatrixWorld(true);
        const m = d.mesh, p = m.geometry.attributes.position;
        for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k); m.boneTransform(k, v); v.applyMatrix4(m.matrixWorld); low = Math.min(low, v.y); }
        d.root.traverse(o => { if (o.isMesh && !o.isSkinnedMesh) { o.geometry.computeBoundingBox(); low = Math.min(low, o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld).min.y); } });
      }
      out[mode] = +low.toFixed(3);
    }
    return out;
  });
  for (const k in ground) t.ok(ground[k] > -0.015, 'nothing goes through the ground: ' + k, ground[k]);
  t.ok(r.boneCount === 28 && !r.boneDiff.length, 'the 28 bones are unchanged (names, parents, rest positions)', r.boneDiff);
  t.ok(r.badWeights === 0, 'skin weights sum to 1', r.badWeights);
  t.ok(r.degenerate === 0, 'no degenerate triangles', r.degenerate);
  t.ok(r.tris <= TRI_BUDGET, 'triangles within budget (' + TRI_BUDGET + ')', { tris: r.tris, meshes: r.meshes });
  for (const m of r.moves) t.ok(!m.nan && m.minPaw > -0.03, 'pose ok: ' + m.name, m);
};
