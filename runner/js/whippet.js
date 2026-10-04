(function (R) {
  // ===================================================================================================
  //  WHIPPET — a procedural, skinned dog built and animated in code.
  //
  //  The body is one skinned mesh: tubes (body, neck, head, legs, tail) whose cross-sections follow
  //  a whippet's side profile — deep chest, high tuck-up, arched loin, long neck, small wedge head,
  //  long thin legs, thin low tail. The skeleton is posed every frame by a gait engine: each paw has
  //  its own phase, stance paws are planted on the ground and the legs are solved with 2-bone IK.
  //
  //  Gaits: stand, walk (4-beat), trot ("семенит"), double-suspension rotary gallop (the sighthound
  //  gallop: an extended flight with all legs stretched out and a gathered flight with all four
  //  under the belly, the back flexing like a spring). Plus jump poses, a somersault tuck, a crash
  //  (nose-dive) and a limp.
  //
  //  Model space: forward = -Z (game heading 0), up = +Y, right = +X. Anatomy below is written as
  //  [u, v] = [forward, up] in "model units" (withers about 0.52), scaled to the game by SCALE.
  // ===================================================================================================
  const C = R.C;
  const SCALE = 1.5;            // a little bigger than life, so it reads well from the chase camera
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const frac = x => x - Math.floor(x);
  const bump = x => (x <= 0 || x >= 1) ? 0 : Math.sin(Math.PI * x);

  // ---- joints in the rest pose -------------------------------------------------------------------
  const J = {
    pelvis: [-0.20, 0.45], lumbar: [-0.05, 0.465], chest: [0.10, 0.45],
    // a high, arched neck carrying the head above the forechest (the side-view reference photo)
    neck1: [0.28, 0.47], neck2: [0.31, 0.56], head: [0.345, 0.62], headEnd: [0.565, 0.593],
    // a low-set tail that hangs between the hocks and curls up at the tip
    tail1: [-0.305, 0.415], tail2: [-0.355, 0.36], tail3: [-0.39, 0.29], tail4: [-0.405, 0.2], tailEnd: [-0.39, 0.12],
    scap: [0.20, 0.50], hum: [0.275, 0.37], fore: [0.22, 0.25], past: [0.225, 0.075], fpaw: [0.24, 0.03], ftoe: [0.272, 0.014],
    femur: [-0.235, 0.425], tibia: [-0.15, 0.265], meta: [-0.30, 0.11], hpaw: [-0.292, 0.03], htoe: [-0.262, 0.014],
  };
  const FX = 0.055, HX = 0.06;                 // half distance between the legs (front, hind)
  const GROUND = 0.03;                         // height of the paw joint when the paw stands

  const P3 = (p, x) => new THREE.Vector3(x || 0, p[1], -p[0]);
  const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

  // bones: [name, parent, joint, child joint (for the rest angle), side]
  const BONES = [['pelvis', null, 'pelvis', 'lumbar'], ['lumbar', 'pelvis', 'lumbar', 'chest'], ['chest', 'lumbar', 'chest', 'neck1'],
    ['neck1', 'chest', 'neck1', 'neck2'], ['neck2', 'neck1', 'neck2', 'head'], ['head', 'neck2', 'head', 'headEnd'],
    ['tail1', 'pelvis', 'tail1', 'tail2'], ['tail2', 'tail1', 'tail2', 'tail3'], ['tail3', 'tail2', 'tail3', 'tail4'], ['tail4', 'tail3', 'tail4', 'tailEnd']];
  for (const s of ['L', 'R']) {
    BONES.push(['scap' + s, 'chest', 'scap', 'hum', s], ['hum' + s, 'scap' + s, 'hum', 'fore', s], ['fore' + s, 'hum' + s, 'fore', 'past', s],
      ['past' + s, 'fore' + s, 'past', 'fpaw', s], ['fpaw' + s, 'past' + s, 'fpaw', 'ftoe', s],
      ['femur' + s, 'pelvis', 'femur', 'tibia', s], ['tibia' + s, 'femur' + s, 'tibia', 'meta', s], ['meta' + s, 'tibia' + s, 'meta', 'hpaw', s],
      ['hpaw' + s, 'meta' + s, 'hpaw', 'htoe', s]);
  }
  const sideX = (s, front) => (s === 'R' ? 1 : s === 'L' ? -1 : 0) * (front ? FX : HX);
  const isFront = n => /^(scap|hum|fore|past|fpaw)/.test(n);
  const A0 = {}, LEN = {};
  for (const [n, , j, c] of BONES) { A0[n] = ang(J[j], J[c]); LEN[n] = len(J[j], J[c]); }

  // ---- colours -----------------------------------------------------------------------------------
  const COL = {
    fawn: new THREE.Color(0xd09a5e), fawnDark: new THREE.Color(0xa9773f), white: new THREE.Color(0xe8dfd2),
    nose: new THREE.Color(0x1d1715), pink: new THREE.Color(0xd59a86),
  };
  const mix = (a, b, t) => a.clone().lerp(b, clamp(t, 0, 1));

  // ---- geometry: tubes of elliptic rings, each ring weighted to one or two bones ------------------
  // ring: [u, v, rN (in-plane radius), rX (side radius), [[bone, w], ...]], x offset per tube
  function buildGeometry(boneIndex) {
    const pos = [], col = [], si = [], sw = [], idx = [];
    function tube(rings, x, segs, colorFn, capStart, capEnd) {
      const base = pos.length / 3, n = rings.length;
      const tan = rings.map((r, i) => {
        const a = rings[Math.max(0, i - 1)], b = rings[Math.min(n - 1, i + 1)];
        const du = b[0] - a[0], dv = b[1] - a[1], l = Math.hypot(du, dv) || 1;
        return [du / l, dv / l];
      });
      const push = (u, v, xx, c, w) => {
        pos.push(xx, v, -u); col.push(c.r, c.g, c.b);
        const ws = w.slice(0, 4);
        for (let k = 0; k < 4; k++) { si.push(ws[k] ? boneIndex[ws[k][0]] : 0); sw.push(ws[k] ? ws[k][1] : 0); }
      };
      rings.forEach((r, i) => {
        const [u, v, rn, rx, w, inward] = r, [tu, tv] = tan[i], nu = -tv, nv = tu, xr = x * (1 - (inward || 0));
        for (let k = 0; k < segs; k++) {
          const a = k / segs * TAU, ca = Math.cos(a), sa = Math.sin(a);
          push(u + nu * rn * ca, v + nv * rn * ca, xr + rx * sa, colorFn(i, ca, sa, u, v, nu * ca, nv * ca), w);
        }
      });
      for (let i = 0; i + 1 < n; i++) for (let k = 0; k < segs; k++) {
        const a = base + i * segs + k, b = base + i * segs + (k + 1) % segs, c = a + segs, d = b + segs;
        idx.push(a, b, c, b, d, c);
      }
      const cap = (i, dir) => {
        const r = rings[i], [tu, tv] = tan[i], ci = pos.length / 3;
        push(r[0] + tu * dir * r[2] * 0.6, r[1] + tv * dir * r[2] * 0.6, x, colorFn(i, 0, 0, r[0], r[1], 0, 0, true), r[4]);
        for (let k = 0; k < segs; k++) {
          const a = base + i * segs + k, b = base + i * segs + (k + 1) % segs;
          if (dir > 0) idx.push(a, ci, b); else idx.push(b, ci, a);
        }
      };
      if (capStart) cap(0, -1);
      if (capEnd) cap(n - 1, 1);
    }

    // body: from the tail root to the forechest. Under the chest and belly the coat is white.
    const W = (...a) => a;
    const body = [
      // croup sloping down to a low tail set, an arched loin, moderate tuck-up, chest to the elbow
      [-0.335, 0.40, 0.034, 0.034, W(['pelvis', 1])],
      [-0.31, 0.41, 0.058, 0.056, W(['pelvis', 1])],
      [-0.26, 0.425, 0.078, 0.072, W(['pelvis', 1])],
      [-0.19, 0.44, 0.075, 0.066, W(['pelvis', 0.75], ['lumbar', 0.25])],
      [-0.11, 0.45, 0.07, 0.057, W(['pelvis', 0.3], ['lumbar', 0.7])],
      [-0.04, 0.448, 0.078, 0.06, W(['lumbar', 1])],
      [0.03, 0.435, 0.10, 0.067, W(['lumbar', 0.55], ['chest', 0.45])],
      [0.10, 0.415, 0.118, 0.077, W(['chest', 1])],
      [0.17, 0.395, 0.135, 0.082, W(['chest', 1])],
      [0.235, 0.395, 0.118, 0.079, W(['chest', 1])],
      [0.29, 0.41, 0.09, 0.07, W(['chest', 0.8], ['neck1', 0.2])],
      [0.315, 0.45, 0.05, 0.05, W(['chest', 0.4], ['neck1', 0.6])],
    ];
    for (const r of body) r[3] *= 1.12;   // a touch wider than life: reads better from behind
    tube(body, 0, 20, (i, ca, sa, u, v, nu, nv, isCap) => {
      // white under the chest and belly, a white front of the chest; darker along the back
      const down = -nv, fwd = nu;
      let c = mix(COL.fawn, COL.fawnDark, sstep(0.55, 1, nv) * 0.6);
      const belly = sstep(0.35, 0.8, down) * sstep(-0.16, -0.06, u);
      const front = sstep(0.18, 0.27, u) * sstep(0.0, 0.5, fwd - nv * 0.3);
      return mix(c, COL.white, Math.max(belly, front, isCap && u > 0.2 ? 1 : 0));
    }, true, true);

    // neck: long and arched; white throat
    const neck = [
      [0.25, 0.45, 0.075, 0.058, W(['chest', 0.7], ['neck1', 0.3])],
      [0.285, 0.505, 0.064, 0.052, W(['neck1', 1])],
      [0.305, 0.555, 0.054, 0.047, W(['neck1', 0.4], ['neck2', 0.6])],
      [0.325, 0.595, 0.048, 0.043, W(['neck2', 0.7], ['head', 0.3])],
      [0.345, 0.622, 0.046, 0.042, W(['head', 1])],
    ];
    tube(neck, 0, 12, (i, ca, sa, u, v, nu, nv) => mix(COL.fawn, COL.white, sstep(0.2, 0.7, nu - nv * 0.2)), false, false);

    // head: skull, stop, long fine muzzle; white blaze and white chin
    const head = [
      // a long, lean, flat-skulled head (slimmer than before, like the photo)
      [0.33, 0.64, 0.038, 0.038, W(['head', 1])],
      [0.365, 0.65, 0.046, 0.045, W(['head', 1])],
      [0.405, 0.647, 0.041, 0.041, W(['head', 1])],
      [0.445, 0.634, 0.033, 0.033, W(['head', 1])],
      [0.49, 0.619, 0.026, 0.025, W(['head', 1])],
      [0.535, 0.605, 0.019, 0.018, W(['head', 1])],
      [0.562, 0.596, 0.012, 0.011, W(['head', 1])],
    ];
    tube(head, 0, 14, (i, ca, sa, u, v, nu, nv, isCap) => {
      if (isCap && u > 0.545) return COL.nose;
      const blaze = sstep(0.6, 0.95, nv) * sstep(0.38, 0.44, u) * sstep(0.35, 0.0, Math.abs(sa));
      const chin = sstep(0.3, 0.8, -nv) * sstep(0.39, 0.45, u);
      const muzzle = sstep(0.46, 0.54, u) * 0.55;
      return mix(COL.fawn, COL.white, Math.max(blaze, chin, muzzle));
    }, true, true);

    // tail: thin, low, a slight upward curl; white tip
    const tl = [
      [-0.30, 0.418, 0.024, 0.024, W(['pelvis', 0.5], ['tail1', 0.5])],
      [-0.33, 0.39, 0.02, 0.02, W(['tail1', 1])],
      [-0.355, 0.36, 0.017, 0.017, W(['tail1', 0.5], ['tail2', 0.5])],
      [-0.375, 0.325, 0.015, 0.015, W(['tail2', 1])],
      [-0.39, 0.29, 0.013, 0.013, W(['tail2', 0.5], ['tail3', 0.5])],
      [-0.4, 0.245, 0.011, 0.011, W(['tail3', 1])],
      [-0.405, 0.2, 0.009, 0.009, W(['tail3', 0.5], ['tail4', 0.5])],
      [-0.4, 0.158, 0.007, 0.007, W(['tail4', 1])],
      [-0.39, 0.12, 0.004, 0.004, W(['tail4', 1])],
    ];
    tube(tl, 0, 6, i => mix(COL.fawn, COL.white, sstep(5.5, 7, i)), false, true);

    // legs
    for (const s of ['L', 'R']) {
      const xf = sideX(s, true), xh = sideX(s, false);
      const front = [
        [0.19, 0.47, 0.05, 0.03, W(['scap' + s, 1]), 0.7],
        [0.245, 0.40, 0.05, 0.034, W(['scap' + s, 0.6], ['hum' + s, 0.4]), 0.25],
        [0.265, 0.34, 0.042, 0.032, W(['hum' + s, 1])],
        [0.235, 0.275, 0.033, 0.027, W(['hum' + s, 0.5], ['fore' + s, 0.5])],
        [0.222, 0.215, 0.023, 0.02, W(['fore' + s, 1])],
        [0.223, 0.14, 0.018, 0.016, W(['fore' + s, 1])],
        [0.225, 0.082, 0.017, 0.016, W(['fore' + s, 0.5], ['past' + s, 0.5])],
        [0.232, 0.05, 0.016, 0.015, W(['past' + s, 1])],
        [0.243, 0.028, 0.02, 0.019, W(['past' + s, 0.3], ['fpaw' + s, 0.7])],
        [0.262, 0.02, 0.017, 0.017, W(['fpaw' + s, 1])],
        [0.276, 0.016, 0.009, 0.01, W(['fpaw' + s, 1])],
      ];
      tube(front, xf, 12, (i, ca, sa, u, v, nu) => {
        // white socks and a white front of the leg
        return mix(COL.fawn, COL.white, Math.max(sstep(0.17, 0.09, v), sstep(0.3, 0.2, v) * sstep(0, 0.6, nu)));
      }, false, true);
      const hind = [
        [-0.215, 0.445, 0.06, 0.03, W(['pelvis', 0.5], ['femur' + s, 0.5]), 0.8],
        [-0.212, 0.385, 0.074, 0.042, W(['femur' + s, 1]), 0.35],
        [-0.19, 0.315, 0.06, 0.038, W(['femur' + s, 1])],
        [-0.16, 0.268, 0.037, 0.028, W(['femur' + s, 0.5], ['tibia' + s, 0.5])],
        [-0.205, 0.22, 0.034, 0.024, W(['tibia' + s, 1])],
        [-0.255, 0.165, 0.025, 0.019, W(['tibia' + s, 1])],
        [-0.297, 0.115, 0.019, 0.017, W(['tibia' + s, 0.5], ['meta' + s, 0.5])],
        [-0.297, 0.07, 0.016, 0.015, W(['meta' + s, 1])],
        [-0.292, 0.028, 0.02, 0.019, W(['meta' + s, 0.3], ['hpaw' + s, 0.7])],
        [-0.274, 0.02, 0.017, 0.017, W(['hpaw' + s, 1])],
        [-0.26, 0.016, 0.009, 0.01, W(['hpaw' + s, 1])],
      ];
      tube(hind, xh, 12, (i, ca, sa, u, v, nu) => mix(COL.fawn, COL.white, Math.max(sstep(0.12, 0.06, v), sstep(0.3, 0.2, v) * sstep(0.2, -0.4, sa * (s === 'R' ? -1 : 1)) * 0.8)), false, true);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // ---- details riding on bones: eyes, nose, ears, collar --------------------------------------------
  function details(bones) {
    const head = bones.head, std = (c, r) => new THREE.MeshStandardMaterial({ color: c, roughness: r === undefined ? 0.6 : r, metalness: 0 });
    const at = (p, j, x) => new THREE.Vector3(x || 0, p[1] - J[j][1], -(p[0] - J[j][0]));
    const eyeMat = std(0x120c08, 0.15);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 10, 8), eyeMat);
      e.position.copy(at([0.408, 0.657], 'head', s * 0.034));
      head.add(e);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 8), std(0x161210, 0.3));
    nose.scale.set(1.05, 0.85, 0.9); nose.position.copy(at([0.56, 0.6], 'head'));
    head.add(nose);
    // rose ears: a small folded flap lying back along the skull, pink inside
    const ears = [];
    for (const s of [-1, 1]) {
      const g = new THREE.BufferGeometry();
      // base, upper fold, tip (pointing back), lower edge, inner fold
      const v = [0, 0, 0, s * 0.026, 0.022, 0.03, s * 0.03, 0.004, 0.088, s * 0.02, -0.03, 0.058, s * 0.004, 0.03, 0.055, s * 0.012, -0.012, 0.01];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.setIndex(s > 0 ? [0, 1, 5, 1, 3, 5, 1, 2, 3, 0, 4, 1, 4, 2, 1] : [0, 5, 1, 1, 5, 3, 1, 3, 2, 0, 1, 4, 4, 1, 2]);
      g.computeVertexNormals();
      const outer = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xb98a5c, roughness: 0.7, side: THREE.FrontSide }));
      const inner = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xd59a86, roughness: 0.8, side: THREE.BackSide }));
      const ear = new THREE.Group();
      ear.add(outer, inner);
      ear.position.copy(at([0.37, 0.675], 'head', s * 0.028));
      head.add(ear);
      ears.push({ g: ear, s });
    }
    // collar with a tag
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.008, 6, 18), std(0x6b2a1e, 0.5));
    const mid = [(J.neck1[0] + J.neck2[0]) / 2 + 0.005, (J.neck1[1] + J.neck2[1]) / 2 + 0.005];
    collar.position.copy(at(mid, 'neck1'));
    collar.rotation.x = Math.PI / 2 - ang(J.neck1, J.neck2) + 0.15;
    bones.neck1.add(collar);
    const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.003, 12), new THREE.MeshStandardMaterial({ color: 0xd8b14a, roughness: 0.25, metalness: 0.8 }));
    tag.rotation.x = Math.PI / 2; tag.position.set(0, -0.055, -0.02);
    collar.add(tag);
    for (const o of [nose, collar, tag]) o.castShadow = true;
    return { ears };
  }

  // ---- 2-bone IK in the side plane ------------------------------------------------------------------
  // from joint a, segments l1, l2, reach t; bend: +1 = middle joint in front, -1 = behind
  function ik(a, t, l1, l2, bend) {
    let du = t[0] - a[0], dv = t[1] - a[1];
    let d = Math.hypot(du, dv);
    const base = Math.atan2(dv, du);
    d = clamp(d, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
    const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    let a1 = base + A, j = [a[0] + l1 * Math.cos(a1), a[1] + l1 * Math.sin(a1)];
    const a1b = base - A, jb = [a[0] + l1 * Math.cos(a1b), a[1] + l1 * Math.sin(a1b)];
    if ((jb[0] - j[0]) * bend > 0) { a1 = a1b; j = jb; }
    const tt = [a[0] + d * Math.cos(base), a[1] + d * Math.sin(base)];
    return { a1, a2: Math.atan2(tt[1] - j[1], tt[0] - j[0]) };
  }

  // ---- gaits ----------------------------------------------------------------------------------------
  // offsets: phase of each leg; duty: share of the cycle on the ground; f(v): strides per second
  const GAITS = {
    walk: { off: { LH: 0, LF: 0.25, RH: 0.5, RF: 0.75 }, duty: () => 0.62, f: v => 0.9 + 0.55 * v, lift: [0.055, 0.06] },
    trot: { off: { LF: 0, RH: 0.03, RF: 0.5, LH: 0.53 }, duty: () => 0.42, f: v => 2.1 + 0.2 * v, lift: [0.075, 0.07] },
    gallop: { off: { LH: 0, RH: 0.07, RF: 0.43, LF: 0.5 }, duty: v => clamp(0.25 - (v - 6) * 0.01, 0.15, 0.25), f: v => 2.3 + 0.07 * v, lift: [0.2, 0.16] },
  };
  const LEGS = ['LF', 'RF', 'LH', 'RH'];

  // where a paw is (relative to its neutral spot) and how folded the lower leg is
  function legTarget(gait, psi, duty, step, front, galloping, limpLeg, limp) {
    let d = duty;
    if (limpLeg) d *= 1 - 0.35 * limp;           // a sore paw leaves the ground early
    const lift = GAITS[gait].lift[front ? 0 : 1] * (limpLeg ? 1 + 0.8 * limp : 1);
    if (psi < d) {
      const s = psi / d;
      return { u: step * (0.5 - s), v: 0, fold: front ? 0.25 * (s - 0.5) : -0.55 * s, stance: 1 - Math.abs(s - 0.5) * 2 };
    }
    const s = (psi - d) / (1 - d);
    if (!galloping) {
      return { u: step * (-0.5 + sstep(0, 1, s)), v: lift * Math.sin(Math.PI * s), fold: (front ? -1.4 : 0.8) * Math.sin(Math.PI * s), stance: 0 };
    }
    if (front) {
      // gallop fore leg: snaps up under the chest, then swings far forward and reaches out to land
      const reach = 0.1;
      const k = sstep(0.12, 0.9, s);
      return { u: -step * 0.5 + (step + reach) * k - reach * sstep(0.88, 1, s), v: lift * Math.pow(bump(Math.min(1, s / 0.9)), 0.7) * (1 - 0.6 * sstep(0.55, 0.9, s)), fold: -1.9 * bump(Math.min(1, s / 0.7)), stance: 0 };
    }
    // gallop hind leg: kicks out far behind first (extended flight), then folds and swings under the belly
    const back = 0.12;
    return { u: -step * 0.5 - back * bump(Math.min(1, s / 0.4)) + step * sstep(0.25, 0.95, s), v: lift * Math.pow(bump(s), 0.8), fold: 1.3 * bump(clamp((s - 0.15) / 0.75, 0, 1)), stance: 0 };
  }

  // a whole-body pose for one gait at one phase
  function gaitPose(gait, phi, v, limp) {
    const G = GAITS[gait], duty = G.duty(v), f = G.f(v);
    const step = clamp(duty * v / f / SCALE, 0, gait === 'gallop' ? 0.62 : 0.5);
    const gal = gait === 'gallop';
    const p = { feet: {}, dy: 0, pitch: 0, flex: 0, neck: 0, head: 0, tail: 0, ears: 0.2, scap: 0 };
    for (const L of LEGS) {
      const front = L[1] === 'F';
      p.feet[L] = legTarget(gait, frac(phi + G.off[L]), duty, step, front, gal, L === 'RF', limp);
    }
    if (gait === 'walk') {
      p.dy = -0.004 + 0.005 * Math.sin(phi * TAU * 2);
      p.neck = -0.12; p.head = 0.0; p.tail = -0.05 + 0.08 * Math.sin(phi * TAU); p.ears = 0.4;
    } else if (gait === 'trot') {
      p.dy = 0.004 + 0.008 * Math.sin(phi * TAU * 2 + 1);
      p.neck = -0.22; p.head = 0.08; p.tail = 0.05 + 0.06 * Math.sin(phi * TAU * 2); p.ears = 0.1;
      p.pitch = 0.015 * Math.sin(phi * TAU * 2);
    } else {
      // double suspension: up in both flights; the back rounds when gathered and stretches when extended
      const ext = bump(clamp((frac(phi) - 0.17) / 0.3, 0, 1)), gat = bump(clamp((frac(phi - 0.58)) / 0.4, 0, 1));
      p.dy = 0.03 * ext + 0.022 * gat - 0.015;
      p.flex = 0.32 * Math.cos(TAU * (phi - 0.88));
      p.pitch = 0.07 * Math.sin(TAU * (phi - 0.12));
      p.neck = -0.62 + 0.06 * Math.sin(TAU * phi); p.head = 0.48;
      p.tail = 0.75 + 0.18 * Math.sin(TAU * phi + 1); p.ears = -1;
      p.scap = 0.18 * Math.sin(TAU * (phi - 0.5));
    }
    if (limp > 0 && !gal) {
      // the head bobs up when the sore front paw has to carry weight
      const sore = p.feet.RF.stance;
      p.neck += 0.22 * limp * sore; p.dy += 0.006 * limp * sore;
    }
    return p;
  }

  function standPose(t) {
    const p = { feet: {}, dy: 0.002 * Math.sin(t * 2.1), pitch: 0, flex: 0.02, neck: 0.03, head: -0.02, tail: -0.1, ears: 0.55, scap: 0 };
    for (const L of LEGS) p.feet[L] = { u: L[1] === 'H' ? -0.045 : 0, v: 0, fold: 0, stance: 1 };
    return p;
  }

  const KEYS = ['dy', 'pitch', 'flex', 'neck', 'head', 'tail', 'ears', 'scap'];
  function blendInto(out, p, w) {
    for (const k of KEYS) out[k] += p[k] * w;
    for (const L of LEGS) { const a = out.feet[L], b = p.feet[L]; a.u += b.u * w; a.v += b.v * w; a.fold += b.fold * w; a.stance += b.stance * w; }
  }
  const emptyPose = () => { const p = { feet: {} }; for (const k of KEYS) p[k] = 0; for (const L of LEGS) p.feet[L] = { u: 0, v: 0, fold: 0, stance: 0 }; return p; };

  // ---- the dog --------------------------------------------------------------------------------------
  R.makeWhippet = function () {
    const bones = {}, list = [], boneIndex = {};
    for (const [n, parent, j, , s] of BONES) {
      const b = new THREE.Bone(); b.name = n;
      const pj = parent ? J[BONES.find(x => x[0] === parent)[2]] : [0, 0];
      const front = isFront(n);
      const x = s ? sideX(s, front) - (parent && BONES.find(x => x[0] === parent)[4] ? sideX(s, front) : 0) : 0;
      b.position.set(x, J[j][1] - pj[1], -(J[j][0] - pj[0]));
      if (parent) bones[parent].add(b);
      bones[n] = b; boneIndex[n] = list.length; list.push(b);
    }
    const geo = buildGeometry(boneIndex);
    // short glossy coat: a little sheen from the environment map when the game provides one
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, skinning: true, roughness: 0.52, metalness: 0 });
    if (R.envTexture) { mat.envMap = R.envTexture; mat.envMapIntensity = 0.5; mat.userData.env = true; }
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.castShadow = true; mesh.frustumCulled = false;
    mesh.add(bones.pelvis);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(list));
    const { ears } = details(bones);

    const bank = new THREE.Group(); bank.add(mesh);
    const scaled = new THREE.Group(); scaled.scale.setScalar(SCALE); scaled.add(bank);
    const root = new THREE.Group(); root.add(scaled);

    // state
    let phi = 0, t = 0, airW = 0, wasAir = false, landT = 0, atkT = 0, eatT = 0, roll = 0, look = 0, crashW = 0;
    const wS = { stand: 1, walk: 0, trot: 0, gallop: 0 };
    const P = emptyPose();

    function pose(p, extra) {
      const aP = p.pitch + p.flex * 0.5, aL = p.pitch, aC = p.pitch - p.flex * 0.5;
      const pel = [J.pelvis[0], J.pelvis[1] + p.dy];
      const lum = [pel[0] + rot(J.lumbar[0] - J.pelvis[0], J.lumbar[1] - J.pelvis[1], aP)[0], pel[1] + rot(J.lumbar[0] - J.pelvis[0], J.lumbar[1] - J.pelvis[1], aP)[1]];
      const chv = rot(J.chest[0] - J.lumbar[0], J.chest[1] - J.lumbar[1], aL), che = [lum[0] + chv[0], lum[1] + chv[1]];
      bones.pelvis.position.y = J.pelvis[1] + p.dy;
      bones.pelvis.rotation.x = aP; bones.lumbar.rotation.x = aL - aP; bones.chest.rotation.x = aC - aL;
      bones.neck1.rotation.x = p.neck * 0.6; bones.neck2.rotation.x = p.neck * 0.4; bones.head.rotation.x = p.head;
      bones.head.rotation.y = look;
      const td = [p.tail * 0.5, p.tail * 0.3 + 0.05 * Math.sin(t * 3), p.tail * 0.15, p.tail * 0.1];
      for (let i = 0; i < 4; i++) { bones['tail' + (i + 1)].rotation.x = td[i]; bones['tail' + (i + 1)].rotation.y = -roll * 0.5 * (i + 1) / 2; }
      for (const e of ears) { e.g.rotation.x = -0.25 + p.ears * 0.5; e.g.rotation.z = e.s * (0.3 + p.ears * 0.25); }

      // shoulders and hips after the spine moved
      const scapJ = (() => { const r = rot(J.scap[0] - J.chest[0], J.scap[1] - J.chest[1], aC); return [che[0] + r[0], che[1] + r[1]]; })();
      const hipJ = (() => { const r = rot(J.femur[0] - J.pelvis[0], J.femur[1] - J.pelvis[1], aP); return [pel[0] + r[0], pel[1] + r[1]]; })();
      for (const L of LEGS) {
        const s = L[0], front = L[1] === 'F', f = p.feet[L];
        if (front) {
          const sc = p.scap, scapD = aC + sc;
          bones['scap' + s].rotation.x = sc;
          const sh = (() => { const r = rot(J.hum[0] - J.scap[0], J.hum[1] - J.scap[1], scapD); return [scapJ[0] + r[0], scapJ[1] + r[1]]; })();
          const paw = [J.fpaw[0] + f.u + (extra.fu || 0), GROUND + f.v + (extra.fv || 0)];
          const aPast = A0['past' + s] + f.fold * 0.9 + (extra.ffold || 0);
          const wrist = [paw[0] - LEN['past' + s] * Math.cos(aPast), paw[1] - LEN['past' + s] * Math.sin(aPast)];
          const k = ik(sh, wrist, LEN['hum' + s], LEN['fore' + s], -1);
          const dH = k.a1 - A0['hum' + s], dF = k.a2 - A0['fore' + s], dP = aPast - A0['past' + s];
          bones['hum' + s].rotation.x = dH - scapD;
          bones['fore' + s].rotation.x = dF - dH;
          bones['past' + s].rotation.x = dP - dF;
          bones['fpaw' + s].rotation.x = f.fold * 0.5 - dP;      // flat on the ground, toes curl in the air
        } else {
          const paw = [J.hpaw[0] + f.u + (extra.hu || 0), GROUND + f.v];
          const aMeta = A0['meta' + s] + f.fold;
          const hock = [paw[0] - LEN['meta' + s] * Math.cos(aMeta), paw[1] - LEN['meta' + s] * Math.sin(aMeta)];
          const k = ik(hipJ, hock, LEN['femur' + s], LEN['tibia' + s], 1);
          const dFe = k.a1 - A0['femur' + s], dT = k.a2 - A0['tibia' + s], dM = aMeta - A0['meta' + s];
          bones['femur' + s].rotation.x = dFe - aP;
          bones['tibia' + s].rotation.x = dT - dFe;
          bones['meta' + s].rotation.x = dM - dT;
          bones['hpaw' + s].rotation.x = f.fold * 0.6 - dM;
        }
      }
    }

    return {
      kind: 'whippet', root, bones, mesh,
      get phase() { return phi; },
      trigger(name) { if (name === 'attack') atkT = 0.45; else if (name === 'eat') eatT = 0.6; },
      // s: speed01, air, vy, turn (yaw rate), flip (0..1 or -1), crash (0..1 or -1), limp (0..1), land (impact)
      update(dt, s) {
        t += dt;
        const limp = s.limp || 0;
        const v = (s.speed !== undefined ? s.speed : s.speed01 * C.MAX_SPEED);
        // gait weights by speed (the sore leg does not gallop)
        const want = {
          stand: 1 - sstep(0.08, 0.45, v),
          walk: sstep(0.08, 0.45, v) * (1 - sstep(1.6, 2.4, v)),
          trot: sstep(1.6, 2.4, v) * (1 - sstep(5.2, 6.6, v)),
          gallop: sstep(5.2, 6.6, v),
        };
        let sum = 0;
        for (const k in wS) { wS[k] = R.damp(wS[k], want[k], 8, dt); sum += wS[k]; }
        let f = 0;
        for (const k of ['walk', 'trot', 'gallop']) f += (wS[k] / sum) * GAITS[k].f(Math.max(v, 0.3));
        phi = frac(phi + f * dt);

        // in the air: the gallop's flight poses (stretched going up, front legs reaching coming down)
        if (s.air && !wasAir) airW = Math.max(airW, 0.3);
        if (!s.air && wasAir) { landT = 0.28; if (v > 5) phi = 0.43; }
        wasAir = s.air;
        airW = R.damp(airW, s.air ? 1 : 0, s.air ? 14 : 20, dt);
        landT = Math.max(0, landT - dt);

        // blend the pose
        for (const k of KEYS) P[k] = 0;
        for (const L of LEGS) { const a = P.feet[L]; a.u = a.v = a.fold = a.stance = 0; }
        blendInto(P, standPose(t), wS.stand / sum);
        for (const k of ['walk', 'trot', 'gallop']) if (wS[k] / sum > 0.01) blendInto(P, gaitPose(k, phi, Math.max(v, 0.3), limp), wS[k] / sum);
        if (airW > 0.01) {
          const desc = clamp(-(s.vy || 0) / 7, 0, 1);
          const ap = gaitPose('gallop', s.flip >= 0 ? 0.82 : 0.27 + 0.15 * desc, Math.max(v, 9), 0);
          // lift the legs off the ground in the air pose (all paws in swing anyway)
          for (const L of LEGS) ap.feet[L].v += 0.04;
          if (s.flip >= 0) { for (const L of LEGS) { ap.feet[L].v += 0.12; ap.feet[L].fold *= 1.3; } ap.flex = 0.45; }
          ap.pitch = clamp((s.vy || 0) * 0.02, -0.15, 0.15);
          for (const k of KEYS) P[k] = P[k] * (1 - airW) + ap[k] * airW;
          for (const L of LEGS) { const a = P.feet[L], b = ap.feet[L]; a.u = a.u * (1 - airW) + b.u * airW; a.v = a.v * (1 - airW) + b.v * airW; a.fold = a.fold * (1 - airW) + b.fold * airW; }
        }
        // landing: legs give and the body dips
        if (landT > 0) { const k = bump(1 - landT / 0.28); P.dy -= 0.045 * k * Math.min(1, (s.land || 8) / 10); P.flex += 0.1 * k; }

        // crash: nose into the ground, front legs fold, then it gets back up
        const cr = s.crash >= 0 ? s.crash : -1;
        crashW = cr >= 0 ? (cr < 0.12 ? cr / 0.12 : cr > 0.65 ? Math.max(0, 1 - (cr - 0.65) / 0.35) : 1) : R.damp(crashW, 0, 10, dt);
        if (crashW > 0.01) {
          const w = crashW;
          P.dy = P.dy * (1 - w) - 0.17 * w; P.pitch = P.pitch * (1 - w) - 0.32 * w; P.neck = P.neck * (1 - w) - 0.85 * w; P.head = P.head * (1 - w) - 0.2 * w;
          P.ears = P.ears * (1 - w) - 1 * w; P.tail = P.tail * (1 - w) - 0.3 * w; P.flex = P.flex * (1 - w) + 0.1 * w;
          for (const L of LEGS) {
            const a = P.feet[L];
            if (L[1] === 'F') { a.u = a.u * (1 - w) - 0.07 * w; a.v = a.v * (1 - w) + 0.05 * w; a.fold = a.fold * (1 - w) - 1.5 * w; }
            else { a.u = a.u * (1 - w) + 0.02 * w; a.v *= 1 - w; a.fold *= 1 - w; }
          }
        }
        // a quick pounce (catching) or nibble (digging)
        const extra = {};
        if (atkT > 0) { atkT -= dt; const k = bump(1 - atkT / 0.45); P.neck -= 0.35 * k; P.head += 0.25 * k; extra.fu = 0.06 * k; extra.fv = 0.05 * k; P.ears -= 0.8 * k; }
        if (eatT > 0) { eatT -= dt; const k = bump(1 - eatT / 0.6); P.neck -= 0.7 * k; P.head -= 0.3 * k; }
        if (s.sniff && v < 3) { P.neck -= 0.8; P.head -= 0.15; }

        // lean into turns like a motorbike; look where we are going
        const turn = s.turn || 0;
        roll = R.damp(roll, clamp(-turn * Math.max(v, 2) * 0.014 * (s.air ? 1.6 : 1), -0.4, 0.4), 6, dt);
        bank.rotation.z = roll;
        look = R.damp(look, clamp(turn * 0.18, -0.35, 0.35), 5, dt);
        pose(P, extra);
      },
    };
  };
})(window.R = window.R || {});
