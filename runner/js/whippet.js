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
  const EYE = [0.405, 0.657, 0.036];          // the eye on the head (u, v, side)
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
    fawn: new THREE.Color(0xb46d33), fawnDark: new THREE.Color(0x8e5226), white: new THREE.Color(0xf1e9de),
    nose: new THREE.Color(0x161110), rim: new THREE.Color(0x3a2214), pink: new THREE.Color(0xd0907e),
  };
  // rim light: the edges of the coat that face the sun glow in its colour (strong against a low
  // sunset sun, faint at noon, cool under the moon). main.js sets these every frame.
  R.dogLight = R.dogLight || {
    uRimCol: { value: new THREE.Color(1, 0.8, 0.6) }, uRimDir: { value: new THREE.Vector3(0, 1, 0) }, uRimK: { value: 0.4 },
  };
  function withRim(mat) {
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, R.dogLight);
      sh.fragmentShader = 'uniform vec3 uRimCol, uRimDir;\nuniform float uRimK;\n' + sh.fragmentShader.replace(
        'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
        `float rimF = smoothstep(0.12, 0.7, 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0));
        outgoingLight += uRimCol * uRimK * 1.6 * rimF * (0.2 + 0.8 * clamp(dot(normal, uRimDir) + 0.3, 0.0, 1.0));
        gl_FragColor = vec4( outgoingLight, diffuseColor.a );`);
    };
    mat.customProgramCacheKey = () => 'whippet-rim';
    return mat;
  }
  const mix = (a, b, t) => a.clone().lerp(b, clamp(t, 0, 1));

  // ---- geometry: tubes of rings, each ring weighted to one or two bones -----------------------------
  // ring: [u, v, rN, rX, [[bone, w], ...], inward, shape], x offset per tube.
  //   rN: radius in the side plane on the "first" side (up for the body, forward for a leg),
  //   rX: half width; shape (optional): dn = radius on the other side (down / back),
  //   sq = squareness (2 = ellipse, more = flatter sides), keel = narrower towards the dn side
  //   (the deep, egg-shaped chest), crown = narrower towards the first side (the croup seen from
  //   behind), so a section need not be a plain ellipse.
  function buildGeometry(boneIndex) {
    const pos = [], col = [], si = [], sw = [], idx = [], grp = [];
    let ng = 0;
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
        const [u, v, rn, rx, w, inward, sh] = r, [tu, tv] = tan[i], nu = -tv, nv = tu, xr = x * (1 - (inward || 0));
        const dn = sh && sh.dn !== undefined ? sh.dn : rn, e = 2 / ((sh && sh.sq) || 2), keel = (sh && sh.keel) || 0, crown = (sh && sh.crown) || 0;
        for (let k = 0; k < segs; k++) {
          const a = k / segs * TAU, ca = Math.cos(a), sa = Math.sin(a);
          const pc = Math.sign(ca) * Math.pow(Math.abs(ca), e), ps = Math.sign(sa) * Math.pow(Math.abs(sa), e);
          const rr = ca >= 0 ? rn : dn, wx = rx * (1 - keel * Math.max(0, -ca) - crown * Math.max(0, ca));
          const pu = u + nu * rr * pc, pv = v + nv * rr * pc, px = xr + wx * ps;
          push(pu, pv, px, colorFn(i, ca, sa, u, v, nu * ca, nv * ca, false, [pu, pv, px]), w);
        }
      });
      for (let i = 0; i + 1 < n; i++) for (let k = 0; k < segs; k++) {
        const a = base + i * segs + k, b = base + i * segs + (k + 1) % segs, c = a + segs, d = b + segs;
        idx.push(a, b, c, b, d, c); grp.push(ng, ng); ng++;
      }
      const cap = (i, dir) => {
        const r = rings[i], [tu, tv] = tan[i], ci = pos.length / 3;
        const cu = r[0] + tu * dir * r[2] * 0.6, cv = r[1] + tv * dir * r[2] * 0.6;
        push(cu, cv, x, colorFn(i, 0, 0, r[0], r[1], 0, 0, true, [cu, cv, x]), r[4]);
        for (let k = 0; k < segs; k++) {
          const a = base + i * segs + k, b = base + i * segs + (k + 1) % segs;
          if (dir > 0) idx.push(a, ci, b); else idx.push(b, ci, a);
          grp.push(ng++);
        }
      };
      if (capStart) cap(0, -1);
      if (capEnd) cap(n - 1, 1);
    }

    // body: from the tail root to the forechest. Under the chest and belly the coat is white.
    const W = (...a) => a;
    // [u, top, bottom, half width, weights, shape]: proportions from the side photo (withers = 1):
    // chest down to the elbow (brisket 0.54 off the ground) and held low to well behind the elbow,
    // then a steep tuck-up (0.70) into a slim loin with a slight arch; the croup slopes to a low tail
    const B = (u, top, bot, w, wt, sh) => [u, (top + bot) / 2, (top - bot) / 2, w, wt, 0, sh];
    const CH = { keel: 0.35 }, LO = { keel: 0.1 }, CR = { crown: 0.35 };
    // the topline: highest at the withers, a slight dip behind them, an arch over the loin, the croup
    // falling to the tail. The hindquarters are narrow on top: the thighs give the width (below).
    const body = [
      B(-0.322, 0.44, 0.39, 0.03, W(['pelvis', 1])),
      B(-0.30, 0.47, 0.36, 0.05, W(['pelvis', 1]), CR),
      B(-0.262, 0.497, 0.355, 0.062, W(['pelvis', 1]), CR),
      B(-0.19, 0.515, 0.372, 0.062, W(['pelvis', 0.75], ['lumbar', 0.25]), LO),
      B(-0.12, 0.523, 0.392, 0.058, W(['pelvis', 0.3], ['lumbar', 0.7]), LO),
      B(-0.06, 0.52, 0.378, 0.058, W(['lumbar', 1]), LO),
      B(0.0, 0.513, 0.33, 0.07, W(['lumbar', 0.7], ['chest', 0.3]), CH),
      B(0.05, 0.514, 0.296, 0.083, W(['lumbar', 0.4], ['chest', 0.6]), CH),
      B(0.10, 0.521, 0.282, 0.09, W(['chest', 1]), CH),
      B(0.17, 0.53, 0.276, 0.093, W(['chest', 1]), CH),
      B(0.235, 0.525, 0.29, 0.086, W(['chest', 1]), CH),
      B(0.29, 0.5, 0.335, 0.072, W(['chest', 0.8], ['neck1', 0.2]), CH),
      B(0.315, 0.495, 0.405, 0.05, W(['chest', 0.4], ['neck1', 0.6])),
    ];
    for (const r of body) r[3] *= 1.12;   // a touch wider than life: reads better from behind
    tube(body, 0, 16, (i, ca, sa, u, v, nu, nv, isCap) => {
      // white under the chest and belly, a white front of the chest; darker along the back
      const down = -nv, fwd = nu;
      if (isCap && u > 0.2) return COL.white;
      if (down > 0.45 && u > -0.15) return COL.white;                    // belly and brisket
      if (u > 0.2 && fwd - nv * 0.3 > 0.12) return COL.white;           // the front of the chest
      return mix(COL.fawn, COL.fawnDark, sstep(0.5, 1, nv) * 0.75);     // darker along the back
    }, true, true);

    // neck: long, an arched crest flowing into the withers (the first radius: the back of the neck),
    // a thick base; the throat and the front are white
    const neck = [
      [0.25, 0.45, 0.082, 0.058, W(['chest', 0.7], ['neck1', 0.3]), 0, { dn: 0.07 }],
      [0.285, 0.505, 0.067, 0.052, W(['neck1', 1]), 0, { dn: 0.058 }],
      [0.305, 0.555, 0.056, 0.046, W(['neck1', 0.4], ['neck2', 0.6]), 0, { dn: 0.047 }],
      [0.325, 0.595, 0.049, 0.042, W(['neck2', 0.7], ['head', 0.3]), 0, { dn: 0.042 }],
      [0.345, 0.622, 0.045, 0.04, W(['head', 1])],
    ];
    tube(neck, 0, 12, (i, ca, sa, u, v, nu, nv) => nu > 0.12 ? COL.white : COL.fawn, false, false);

    // head: a broad skull with the cheeks, a clear stop, a long narrow muzzle (narrower than high)
    const MZ = { keel: 0.15 };
    const head = [
      [0.33, 0.64, 0.036, 0.036, W(['head', 1])],
      [0.36, 0.65, 0.046, 0.046, W(['head', 1])],
      [0.395, 0.652, 0.044, 0.046, W(['head', 1])],
      [0.425, 0.643, 0.036, 0.034, W(['head', 1]), 0, MZ],
      [0.46, 0.628, 0.03, 0.025, W(['head', 1]), 0, MZ],
      [0.50, 0.615, 0.024, 0.02, W(['head', 1]), 0, MZ],
      [0.535, 0.604, 0.018, 0.015, W(['head', 1]), 0, MZ],
      [0.562, 0.596, 0.011, 0.01, W(['head', 1])],
    ];
    tube(head, 0, 14, (i, ca, sa, u, v, nu, nv, isCap, P) => {
      if (isCap) return u > 0.5 ? COL.nose : COL.fawn;
      const [pu, pv, px] = P;
      if (Math.abs(pu - EYE[0]) < 0.022 && Math.abs(pv - EYE[1]) < 0.015 && Math.abs(px) > 0.02) return COL.rim;
      if (u > 0.545) return COL.nose;                                    // the leather of the nose
      if (nv > 0.55 && Math.abs(sa) < 0.45 && u > 0.40) return COL.white; // the blaze up between the eyes
      if (u > 0.455 && nv < 0.5) return COL.white;                       // white muzzle
      if (nv < -0.3 && u > 0.37) return COL.white;                       // chin and lower jaw
      return COL.fawn;
    }, true, true);

    // tail: thin, low, a slight upward curl; white tip
    const tl = [
      [-0.30, 0.418, 0.028, 0.026, W(['pelvis', 0.5], ['tail1', 0.5])],
      [-0.33, 0.39, 0.022, 0.021, W(['tail1', 1])],
      [-0.355, 0.36, 0.018, 0.018, W(['tail1', 0.5], ['tail2', 0.5])],
      [-0.375, 0.325, 0.015, 0.015, W(['tail2', 1])],
      [-0.39, 0.29, 0.013, 0.013, W(['tail2', 0.5], ['tail3', 0.5])],
      [-0.4, 0.245, 0.011, 0.011, W(['tail3', 1])],
      [-0.405, 0.2, 0.009, 0.009, W(['tail3', 0.5], ['tail4', 0.5])],
      [-0.4, 0.158, 0.007, 0.007, W(['tail4', 1])],
      [-0.39, 0.12, 0.004, 0.004, W(['tail4', 1])],
    ];
    tube(tl, 0, 6, (i, ca, sa, u, v, nu, nv) => i >= 6 ? COL.white : nv < -0.5 && i >= 2 ? mix(COL.fawn, COL.white, 0.5) : COL.fawn, false, true);

    // legs
    for (const s of ['L', 'R']) {
      const xf = sideX(s, true), xh = sideX(s, false);
      // front: shoulder, upper arm, a pointed elbow at the brisket, a thin straight forearm, a
      // sloping pastern, an oval paw with a flat sole. The lower leg stands a little out from the body.
      const PAW = { dn: 0.018, sq: 3 }, OUT = -0.1;
      const front = [
        [0.19, 0.47, 0.05, 0.03, W(['scap' + s, 1]), 0.7],
        [0.245, 0.40, 0.056, 0.037, W(['scap' + s, 0.6], ['hum' + s, 0.4]), 0.25],
        [0.262, 0.335, 0.044, 0.032, W(['hum' + s, 1]), 0.05],
        [0.232, 0.268, 0.028, 0.025, W(['hum' + s, 0.5], ['fore' + s, 0.5]), 0, { dn: 0.038 }],
        [0.222, 0.212, 0.021, 0.019, W(['fore' + s, 1]), OUT],
        [0.223, 0.145, 0.016, 0.015, W(['fore' + s, 1]), OUT],
        [0.225, 0.085, 0.016, 0.016, W(['fore' + s, 0.5], ['past' + s, 0.5]), OUT],
        [0.232, 0.052, 0.013, 0.013, W(['past' + s, 1]), OUT],
        [0.243, 0.027, 0.017, 0.022, W(['past' + s, 0.25], ['fpaw' + s, 0.75]), OUT, PAW],
        [0.262, 0.021, 0.017, 0.023, W(['fpaw' + s, 1]), OUT, PAW],
        [0.279, 0.016, 0.01, 0.016, W(['fpaw' + s, 1]), OUT, { dn: 0.01, sq: 3 }],
      ];
      const inner = sa => sa * (s === 'R' ? -1 : 1) > 0.3;                 // the side facing the other leg
      tube(front, xf, 8, (i, ca, sa, u, v, nu) => (v < 0.15 || (v < 0.3 && (nu > 0.2 || inner(sa))) ? COL.white : COL.fawn), false, true);
      // hind: a broad thigh (more muscle behind), the stifle, the long "second thigh" sloping back,
      // a sharp hock with its point behind, a thin upright metatarsus, an oval paw
      const hind = [
        // the thigh grows out of the croup (its top inside the body) and is the widest part behind
        [-0.228, 0.468, 0.05, 0.034, W(['pelvis', 0.6], ['femur' + s, 0.4]), 0.55],   // kept inside the croup: no flicker
        [-0.215, 0.39, 0.07, 0.047, W(['femur' + s, 1]), 0.25, { dn: 0.088 }],
        [-0.188, 0.318, 0.055, 0.037, W(['femur' + s, 1]), 0.1, { dn: 0.058 }],
        [-0.157, 0.268, 0.034, 0.025, W(['femur' + s, 0.5], ['tibia' + s, 0.5]), 0],
        [-0.2, 0.222, 0.026, 0.021, W(['tibia' + s, 1]), OUT, { dn: 0.036 }],
        [-0.25, 0.166, 0.02, 0.016, W(['tibia' + s, 1]), OUT, { dn: 0.024 }],
        [-0.293, 0.118, 0.016, 0.015, W(['tibia' + s, 0.5], ['meta' + s, 0.5]), OUT, { dn: 0.026 }],
        [-0.298, 0.074, 0.012, 0.012, W(['meta' + s, 1]), OUT],
        [-0.296, 0.042, 0.013, 0.013, W(['meta' + s, 0.5], ['hpaw' + s, 0.5]), OUT],
        [-0.29, 0.026, 0.017, 0.022, W(['meta' + s, 0.2], ['hpaw' + s, 0.8]), OUT, PAW],
        [-0.274, 0.021, 0.017, 0.023, W(['hpaw' + s, 1]), OUT, PAW],
        [-0.257, 0.016, 0.01, 0.016, W(['hpaw' + s, 1]), OUT, { dn: 0.01, sq: 3 }],
      ];
      tube(hind, xh, 8, (i, ca, sa, u, v, nu) => (v < 0.125 || (v < 0.3 && inner(sa)) ? COL.white : COL.fawn), false, true);
    }

    // one colour per face (a quad of the tube, or a triangle of a cap): white if most of its corners
    // are, dark if most are dark, else the mean of its coat colours. So the white patches have crisp
    // edges that run along the facets.
    const P2 = [], C2 = [], SI = [], SW = [], cls = [];
    const wb = COL.white.b, fb = COL.fawn.b;
    for (let v = 0; v < col.length / 3; v++) {
      const r = col[v * 3], g_ = col[v * 3 + 1], b_ = col[v * 3 + 2];
      cls.push(0.3 * r + 0.59 * g_ + 0.11 * b_ < 0.2 ? 2 : (b_ - fb) / (wb - fb) > 0.5 ? 1 : 0);
    }
    const corners = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      const gi = grp[t / 3]; if (!corners.has(gi)) corners.set(gi, new Set());
      for (let j = 0; j < 3; j++) corners.get(gi).add(idx[t + j]);
    }
    const gcol = new Map();
    for (const [gi, set] of corners) {
      const vs = [...set], n = [0, 0, 0];
      for (const v of vs) n[cls[v]]++;
      const want = n[2] * 2 > vs.length ? 2 : n[1] * 2 >= vs.length ? 1 : 0;
      const c = new THREE.Color(0, 0, 0); let k = 0;
      for (const v of vs) if (cls[v] === want) { c.r += col[v * 3]; c.g += col[v * 3 + 1]; c.b += col[v * 3 + 2]; k++; }
      if (!k) for (const v of vs) { c.r += col[v * 3]; c.g += col[v * 3 + 1]; c.b += col[v * 3 + 2]; k++; }
      c.multiplyScalar(1 / k);
      // the coat is not plastic: each facet a shade lighter or darker (a fixed hash, so it never flickers)
      const h = Math.sin(gi * 12.9898 + 78.233) * 43758.5453, jit = (h - Math.floor(h) - 0.5) * (want === 0 ? 0.1 : 0.03);
      gcol.set(gi, c.multiplyScalar(1 + jit));
    }
    for (let t = 0; t < idx.length; t += 3) {
      const fc = gcol.get(grp[t / 3]);
      for (const v of [idx[t], idx[t + 1], idx[t + 2]]) {
        P2.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); C2.push(fc.r, fc.g, fc.b);
        for (let j = 0; j < 4; j++) { SI.push(si[v * 4 + j]); SW.push(sw[v * 4 + j]); }
      }
    }
    // remember each vertex's coat class (0 coat, 1 white, 2 dark) and colour, for other coats (setCoat)
    const VC = new Uint8Array(P2.length / 3);
    for (let t = 0, f = 0; t < idx.length; t += 3, f++) {
      const vs = [...corners.get(grp[f])], n = [0, 0, 0];
      for (const v of vs) n[cls[v]]++;
      const want = n[2] * 2 > vs.length ? 2 : n[1] * 2 >= vs.length ? 1 : 0;
      VC[t] = VC[t + 1] = VC[t + 2] = want;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C2, 3));
    g.userData.cls = VC; g.userData.base = Float32Array.from(C2);
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
    g.computeVertexNormals();
    return g;
  }

  // ---- details riding on bones: eyes, nose, ears, collar --------------------------------------------
  function details(bones) {
    const head = bones.head, std = (c, r) => new THREE.MeshStandardMaterial({ color: c, roughness: r === undefined ? 0.6 : r, metalness: 0 });
    const at = (p, j, x) => new THREE.Vector3(x || 0, p[1] - J[j][1], -(p[0] - J[j][0]));
    // eyes and nose in one glossy mesh: large dark almond eyes (set in the dark rims painted on the
    // head), a black nose. Low-poly like the rest.
    const parts = [];
    const piece = (r, sc, p, c) => {
      const g = new THREE.IcosahedronGeometry(r, 1).toNonIndexed();
      g.scale(sc[0], sc[1], sc[2]); g.translate(p.x, p.y, p.z);
      const n = g.attributes.position.count, cc = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { cc[i * 3] = c.r; cc[i * 3 + 1] = c.g; cc[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      g.deleteAttribute('uv');
      parts.push(g);
    };
    const eyeCol = new THREE.Color(0x1c0e07);
    for (const s of [-1, 1]) piece(0.014, [0.62, 0.8, 1.3], at([EYE[0], EYE[1]], 'head', s * EYE[2]), eyeCol);
    piece(0.0145, [1.05, 0.85, 0.9], at([0.561, 0.6], 'head'), COL.nose);
    const join = list => {
      const g = new THREE.BufferGeometry();
      for (const n of ['position', 'color']) g.setAttribute(n, new THREE.Float32BufferAttribute(list.flatMap(x => Array.from(x.attributes[n].array)), 3));
      g.computeVertexNormals();
      return g;
    };
    const glossy = new THREE.Mesh(join(parts),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0, flatShading: true }));
    glossy.castShadow = true;
    head.add(glossy);
    // rose ears: a small thin flap folded back along the skull, the fold turned over so the pink
    // inside shows at the front edge; the tip points back and a little down
    const ears = [];
    const earMat = withRim(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, flatShading: true }));
    for (const s of [-1, 1]) {
      const P = [], Cc = [], N = 6, outer = COL.fawnDark, inner = COL.pink;
      const ring = t => {
        // centre line: back along the skull, a rise then a drop to the tip; the flap folds over
        const c = new THREE.Vector3(s * (0.004 + 0.016 * t), 0.002 + 0.007 * Math.sin(Math.PI * t * 0.8) - 0.022 * t * t, 0.066 * t);
        const fold = -1.35 * t * s, w = 0.018 * (1 - 0.75 * t) + 0.002, th = 0.0035 * (1 - 0.5 * t);
        const W_ = new THREE.Vector3(Math.sin(fold), Math.cos(fold), 0).multiplyScalar(w);      // across the flap
        const T_ = new THREE.Vector3(Math.cos(fold) * s, -Math.sin(fold) * s, 0).multiplyScalar(th); // its thickness, outwards
        return [c.clone().add(W_).add(T_), c.clone().add(W_).sub(T_), c.clone().sub(W_).sub(T_), c.clone().sub(W_).add(T_)];
      };
      const tri = (a, b, c, col) => { for (const v of [a, b, c]) { P.push(v.x, v.y, v.z); Cc.push(col.r, col.g, col.b); } };
      const quad = (a, b, c, d, col) => { if (s > 0) { tri(a, b, c, col); tri(a, c, d, col); } else { tri(a, c, b, col); tri(a, d, c, col); } };
      let prev = ring(0);
      quad(prev[0], prev[1], prev[2], prev[3], outer);                                   // base cap
      for (let i = 1; i <= N; i++) {
        const cur = ring(i / N);
        quad(prev[0], cur[0], cur[3], prev[3], outer);                                    // outside
        quad(prev[2], cur[2], cur[1], prev[1], i <= 2 ? inner : mix(inner, outer, 0.5));  // inside: pink at the fold
        quad(prev[1], cur[1], cur[0], prev[0], i <= 3 ? inner : outer);                  // top edge, turned over
        quad(prev[3], cur[3], cur[2], prev[2], outer);                                    // lower edge
        prev = cur;
      }
      quad(prev[3], prev[2], prev[1], prev[0], outer);                                   // tip
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
      g.computeVertexNormals();
      const ear = new THREE.Group(), m = new THREE.Mesh(g, earMat);
      m.castShadow = true;
      ear.add(m);
      ear.position.copy(at([0.366, 0.67], 'head', s * 0.029));
      head.add(ear);
      ears.push({ g: ear, s });
    }
    // collar with a tag
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.008, 6, 18), std(0x6b2a1e, 0.5));
    const mid = [(J.neck1[0] + J.neck2[0]) / 2 + 0.005, (J.neck1[1] + J.neck2[1]) / 2 + 0.005];
    collar.position.copy(at(mid, 'neck1'));
    collar.rotation.x = Math.PI / 2 - ang(J.neck1, J.neck2) + 0.15;
    collar.scale.set(1.12, 1.22, 1);       // round the thicker, arched neck (crest behind, throat in front)
    collar.position.add(new THREE.Vector3(0, 0.003, 0.004));
    bones.neck1.add(collar);
    const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.003, 12), new THREE.MeshStandardMaterial({ color: 0xd8b14a, roughness: 0.25, metalness: 0.8 }));
    tag.rotation.x = Math.PI / 2; tag.position.set(0, -0.055, -0.02);
    collar.add(tag);
    for (const o of [collar, tag]) o.castShadow = true;
    // places to hang things on (the wardrobe): the top of the skull, the face between the eyes
    const crown = new THREE.Group(); crown.position.copy(at([0.383, 0.694], 'head')); head.add(crown);
    const face = new THREE.Group(); face.position.copy(at([EYE[0] + 0.008, EYE[1] + 0.002], 'head')); head.add(face);
    return { ears, earMat, collar, tag, crown, face };
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
    const mat = withRim(new THREE.MeshStandardMaterial({ vertexColors: true, skinning: true, roughness: 0.52, metalness: 0, flatShading: true }));
    if (R.envTexture) { mat.envMap = R.envTexture; mat.envMapIntensity = 0.5; mat.userData.env = true; }
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.castShadow = true; mesh.frustumCulled = false;
    mesh.add(bones.pelvis);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(list));
    const { ears, earMat, collar, tag, crown, face } = details(bones);

    const bank = new THREE.Group(); bank.add(mesh);
    const scaled = new THREE.Group(); scaled.scale.setScalar(SCALE); scaled.add(bank);
    const root = new THREE.Group(); root.add(scaled);

    // state
    let phi = 0, t = 0, airW = 0, wasAir = false, landT = 0, atkT = 0, eatT = 0, roll = 0, look = 0, crashW = 0, slideW = 0;
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
      anchors: { crown, face, collar, tag },
      // another coat: { fawn: colour of the coat, white: of the white parts (optional), stripes: 0..1
      // (brindle), metal: 0..1 (a shine) }. Without an argument: back to the whippet's own coat.
      setCoat(coat) {
        const g = mesh.geometry, cls = g.userData.cls, base = g.userData.base, col = g.attributes.color, pos = g.attributes.position;
        const f = coat && coat.fawn ? new THREE.Color(coat.fawn) : COL.fawn, w = coat && coat.white ? new THREE.Color(coat.white) : null;
        // each coat facet keeps its own shade (the back darker, the facet jitter): its brightness relative
        // to the plain fawn, applied to the new colour
        const fl = COL.fawn.r + COL.fawn.g + COL.fawn.b, kr = f.r, kg = f.g, kb = f.b;
        for (let i = 0; i < cls.length; i += 3) {
          // brindle: dark stripes running down the body (by the face's middle point)
          let st = 1;
          if (coat && coat.stripes) {
            const zc = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3, yc = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
            if (Math.sin(zc * 95 + yc * 30 + Math.sin(yc * 40) * 2) > 0.35) st = 1 - 0.55 * coat.stripes;
          }
          for (let j = i; j < i + 3; j++) {
            const r = base[j * 3], gg = base[j * 3 + 1], b = base[j * 3 + 2];
            const k = (r + gg + b) / fl * st;
            if (cls[j] === 0) col.setXYZ(j, kr * k, kg * k, kb * k);
            else if (cls[j] === 1 && w) col.setXYZ(j, r / COL.white.r * w.r, gg / COL.white.g * w.g, b / COL.white.b * w.b);
            else col.setXYZ(j, r, gg, b);
          }
        }
        col.needsUpdate = true;
        earMat.color.setRGB(kr / COL.fawn.r, kg / COL.fawn.g, kb / COL.fawn.b);
        mat.metalness = coat && coat.metal ? 0.55 * coat.metal : 0;
        mat.roughness = coat && coat.metal ? 0.52 - 0.25 * coat.metal : 0.52;
        mat.envMapIntensity = coat && coat.metal ? 1.2 : 0.5;
      },
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

        // slide: flat on the belly, front legs reaching forward, hind legs stretched back, ears flat
        slideW = R.damp(slideW, s.slide ? 1 : 0, s.slide ? 16 : 9, dt);
        if (slideW > 0.01) {
          const w = slideW, sp = gaitPose('gallop', 0.27, 12, 0);
          for (const k of KEYS) P[k] = P[k] * (1 - w) + sp[k] * w;
          for (const L of LEGS) {
            const a = P.feet[L], b = sp.feet[L];
            a.u = a.u * (1 - w) + (b.u + (L[1] === 'F' ? 0.08 : -0.08)) * w; a.v = a.v * (1 - w) + 0.02 * w; a.fold = a.fold * (1 - w) + b.fold * 0.4 * w;
          }
          P.dy -= 0.2 * w; P.pitch = P.pitch * (1 - w) + 0.04 * w; P.neck -= 0.35 * w; P.head += 0.2 * w; P.ears -= 1 * w;
          P.tail = P.tail * (1 - w) + (-0.9) * w;          // the tail streams out behind, clear of the ground
        }
        // crash: nose into the ground, front legs fold, then it gets back up
        const cr = s.crash >= 0 ? s.crash : -1;
        crashW = cr >= 0 ? (cr < 0.12 ? cr / 0.12 : cr > 0.65 ? Math.max(0, 1 - (cr - 0.65) / 0.35) : 1) : R.damp(crashW, 0, 10, dt);
        if (crashW > 0.01) {
          const w = crashW;
          // (just touching the ground with the nose and the folded front legs, not through it)
          P.dy = P.dy * (1 - w) - 0.11 * w; P.pitch = P.pitch * (1 - w) - 0.27 * w; P.neck = P.neck * (1 - w) - 0.7 * w; P.head = P.head * (1 - w) - 0.12 * w;
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
