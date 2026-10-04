(function (R) {
  const C = R.C;
  const P = C.P, B = C.B, HB = B / 2, SW = C.SW, HP = P / 2, RH = C.ROAD / 2;
  const PADH = HB + SW;               // half size of the sidewalk pad
  const A = R.assets;
  const rad = d => d * Math.PI / 180;

  const COL = {
    asphalt: [0.20, 0.21, 0.24], alley: [0.17, 0.17, 0.19], sidewalk: [0.5, 0.48, 0.45], curb: [0.74, 0.72, 0.68],
    paint: [0.9, 0.88, 0.78], yellow: [0.86, 0.68, 0.2], grass: [0.27, 0.5, 0.2], grass2: [0.34, 0.58, 0.25],
    paving: [0.45, 0.41, 0.36], paving2: [0.39, 0.355, 0.315], path: [0.55, 0.5, 0.42], fill: [0.42, 0.3, 0.26],
    pole: [0.27, 0.29, 0.33], globe: [1.0, 0.92, 0.65], stone: [0.72, 0.7, 0.66], stone2: [0.58, 0.56, 0.53],
    water: [0.25, 0.5, 0.66], gold: [0.85, 0.66, 0.25],
  };
  const FAR_TINT = [[0.6, 0.2, 0.17], [0.5, 0.48, 0.35], [0.52, 0.3, 0.2], [0.58, 0.52, 0.42], [0.45, 0.25, 0.2]];

  const SIDES = [
    { nx: 0, nz: 1, yaw: 0 }, { nx: 1, nz: 0, yaw: rad(90) },
    { nx: 0, nz: -1, yaw: rad(180) }, { nx: -1, nz: 0, yaw: rad(270) },
  ];
  // point on a side: t = along the side, off = distance from the block center along its outward normal
  function pt(side, t, off) {
    return side.nz ? [t, side.nz * off] : [side.nx * off, t];
  }

  const FACADES = ['building_red', 'building_green', 'gb_blank', 'rb_blank', 'brown_building'];
  const CORNER_YAW = {
    pizza_corner:        { pp: 0, pm: 90, mm: 180, mp: 270 },
    building_red_corner: { mp: 0, pp: 90, pm: 180, mm: 270 },
  };
  const CORNER = 5.8, SLOT = (B - 2 * CORNER) / 3, AW = SLOT / 2; // AW = half width of an alley

  // ---- what stands in which cell ---------------------------------------------------------
  const seedOf = (ci, cj) => ((ci * 73856093) ^ (cj * 19349663)) >>> 0;
  const FORCED = { '0,0': 'city', '1,0': 'park', '1,-1': 'square', '0,-1': 'city', '0,-2': 'plaza', '-1,0': 'square' };
  function typeOf(ci, cj) {
    const f = FORCED[ci + ',' + cj];
    if (f) return f;
    const h = R.rng(seedOf(ci, cj) ^ 0x9e3779b9)();
    return h < 0.56 ? 'city' : h < 0.72 ? 'park' : h < 0.86 ? 'square' : 'plaza';
  }
  const isOpen = (ci, cj) => typeOf(ci, cj) !== 'city';

  function layout(ci, cj) {
    const type = typeOf(ci, cj), open = type !== 'city';
    // a street between two open cells becomes a pedestrian zone
    const ped = SIDES.map(s => open && isOpen(ci + s.nx, cj + s.nz));
    const corner = (sx, sz) => open && isOpen(ci + sx, cj) && isOpen(ci, cj + sz) && isOpen(ci + sx, cj + sz);
    return { type, ped, corner };
  }

  // ---- the ring of buildings around a block (shared by near and far versions) ----------------
  function ringPlan(rnd) {
    const out = [];
    const ar = rnd();
    const alley = ar < 0.22 ? 'z' : ar < 0.44 ? 'x' : null;
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      const key = rnd() < 0.5 ? 'pizza_corner' : 'building_red_corner';
      const yaw = rad(CORNER_YAW[key][(sx > 0 ? 'p' : 'm') + (sz > 0 ? 'p' : 'm')]);
      out.push({ key, x: sx * (HB - CORNER / 2), z: sz * (HB - CORNER / 2), yaw, w: CORNER, sy: 0.9 + rnd() * 0.3, corner: true });
    }
    for (const side of SIDES) {
      const cut = (alley === 'z' && side.nz) || (alley === 'x' && side.nx);
      const r = rnd();
      const pattern = cut ? ['s', 'gap', 's'] : r < 0.45 ? ['s', 's', 's'] : r < 0.72 ? ['B', 's'] : ['s', 'B'];
      let pos = -(B - 2 * CORNER) / 2;
      for (const kind of pattern) {
        const w = kind === 'B' ? SLOT * 2 : SLOT;
        if (kind !== 'gap') {
          const key = kind === 'B' ? 'big_building' : FACADES[Math.floor(rnd() * FACADES.length)];
          const sy = kind === 'B' ? 0.85 + rnd() * 0.25 : 0.85 + rnd() * 0.5;
          out.push({ key, side, t: pos + w / 2, w, sy, yaw: side.yaw, tint: Math.floor(rnd() * FAR_TINT.length) });
        }
        pos += w;
      }
    }
    out.alley = alley;
    return out;
  }

  function planPlace(item) {
    const dims = A.dims(item.key);
    if (!dims) return null;
    let sy = item.sy;
    if (dims.h * item.w * sy > 27) sy = 27 / (dims.h * item.w);
    const d = dims.d * item.w, h = dims.h * item.w * sy;
    let x, z;
    if (item.corner) { x = item.x; z = item.z; }
    else { [x, z] = pt(item.side, item.t, HB - d / 2); }
    return { x, z, d, h, sy };
  }

  // solid core of a block (+ the alley walls) and its collision boxes
  function blockCore(b, obs, ox, oz, alley) {
    if (!alley) {
      b.box(COL.fill, ox, 5, oz, B - 12, 10, B - 12);
      obs.push({ x: ox, z: oz, hx: HB, hz: HB, h: 99, kind: 'wall' });
      return;
    }
    const half = (HB - AW) / 2, c = AW + half;
    for (const s of [1, -1]) {
      const [x, z] = alley === 'z' ? [s * c, 0] : [0, s * c];
      const inner = HB - 6 - AW;
      const [bx, bz] = alley === 'z' ? [s * (AW + inner / 2), 0] : [0, s * (AW + inner / 2)];
      b.facadeBox(FAR_TINT[s > 0 ? 0 : 2], ox + bx, 6.5, oz + bz, alley === 'z' ? inner : B - 12, 13, alley === 'z' ? B - 12 : inner);
      obs.push({ x: ox + x, z: oz + z, hx: alley === 'z' ? half : HB, hz: alley === 'z' ? HB : half, h: 99, kind: 'wall' });
    }
    b.rect(COL.alley, ox, oz, alley === 'z' ? 2 * AW : 2 * PADH, alley === 'z' ? 2 * PADH : 2 * AW, 0.04);
  }

  function lamp(b, obs, lamps, x, z, towardX, towardZ) {
    b.cyl(COL.pole, x, 2.75, z, 0.08, 0.11, 5.5, 6);
    b.box(COL.pole, x + towardX * 0.5, 5.45, z + towardZ * 0.5, towardX ? 1.0 : 0.07, 0.07, towardZ ? 1.0 : 0.07);
    b.sph(COL.globe, x + towardX * 1.0, 5.3, z + towardZ * 1.0, 0.32, 'glass');
    b.poolDecal(x + towardX * 2.6, z + towardZ * 2.6, 12);
    obs.push({ x, z, hx: 0.15, hz: 0.15, h: 5, kind: 'pole' });
    lamps.push({ x: x + towardX * 1.0, y: 5.3, z: z + towardZ * 1.0 });
  }

  function addObs(obs, fp, kind, minH) {
    if (fp && fp.h > (minH || 0.3)) { fp.kind = kind || 'prop'; obs.push(fp); }
  }

  // ---- ground, sidewalks, markings -------------------------------------------------------------
  function groundBase(b, ox, oz, L) {
    const open = L.type !== 'city';
    b.rect(COL.asphalt, ox, oz, P, P, 0);
    b.rect(open ? COL.paving : COL.sidewalk, ox, oz, 2 * PADH, 2 * PADH, 0.03);
    SIDES.forEach((s, i) => {
      if (L.ped[i]) {
        const [cx, cz] = pt(s, 0, (PADH + HP) / 2);
        b.rect(COL.paving, ox + cx, oz + cz, s.nz ? 2 * PADH : HP - PADH, s.nx ? 2 * PADH : HP - PADH, 0.03);
      } else {
        const [cx, cz] = pt(s, 0, PADH);
        b.box(COL.curb, ox + cx, 0.09, oz + cz, s.nz ? 2 * PADH : 0.28, 0.18, s.nx ? 2 * PADH : 0.28);
      }
    });
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      if (L.corner(sx, sz)) b.rect(COL.paving, ox + sx * (PADH + HP) / 2, oz + sz * (PADH + HP) / 2, HP - PADH, HP - PADH, 0.03);
    }
    // lane lines on the streets this cell owns (+X and +Z edges): double centre line + lane dashes
    const seg = HP - RH - 4;
    const ownX = !L.ped[1], ownZ = !L.ped[0];
    for (let t = -seg; t < seg; t += 6) {
      if (ownX) {
        for (const d of [-0.18, 0.18]) b.box(COL.yellow, ox + HP + d, 0.02, oz + t + 1.5, 0.12, 0.02, 3.2);
        for (const d of [-RH / 2, RH / 2]) b.box(COL.paint, ox + HP + d, 0.02, oz + t + 1.5, 0.14, 0.02, 2.4);
      }
      if (ownZ) {
        for (const d of [-0.18, 0.18]) b.box(COL.yellow, ox + t + 1.5, 0.02, oz + HP + d, 3.2, 0.02, 0.12);
        for (const d of [-RH / 2, RH / 2]) b.box(COL.paint, ox + t + 1.5, 0.02, oz + HP + d, 2.4, 0.02, 0.14);
      }
    }
    // zebra crossings on this cell's half of every street
    const zc = HP - RH - 2;
    SIDES.forEach((s, i) => {
      if (L.ped[i]) return;
      for (let off = PADH + 0.9; off < HP - 0.4; off += 1.8) {
        for (const q of [1, -1]) {
          const [x, z] = pt(s, q * zc, off);
          b.box(COL.paint, ox + x, 0.02, oz + z, s.nx ? 0.9 : 3, 0.02, s.nx ? 3 : 0.9);
        }
      }
    });
  }

  // ---- far, cheap version of a cell -----------------------------------------------------------
  function farCell(ci, cj, rnd, L) {
    const ox = ci * P, oz = cj * P, b = new R.Batch(), obs = [];
    groundBase(b, ox, oz, L);
    if (L.type === 'city') {
      const plan = ringPlan(rnd);
      blockCore(b, obs, ox, oz, plan.alley);
      for (const it of plan) {
        const pl = planPlace(it);
        if (!pl) continue;
        const w = it.w, tint = FAR_TINT[(it.tint || 0) % FAR_TINT.length];
        const turned = Math.abs(Math.sin(it.yaw)) > 0.7;
        b.facadeBox(tint, ox + pl.x, pl.h / 2, oz + pl.z, turned ? pl.d : w, pl.h, turned ? w : pl.d);
      }
    } else if (L.type === 'park') {
      b.rect(COL.grass, ox, oz, B, B, 0.05);
      for (let i = 0; i < 9; i++) {
        const x = (rnd() - 0.5) * (B - 6), z = (rnd() - 0.5) * (B - 6);
        b.cone([0.2, 0.42, 0.18], ox + x, 3.5, oz + z, 1.9, 6);
        b.cyl([0.35, 0.24, 0.15], ox + x, 0.8, oz + z, 0.15, 0.2, 1.6, 5);
      }
    } else if (L.type === 'square') {
      b.cyl(COL.stone, ox, 0.4, oz, 6, 6.2, 0.8, 16);
      b.box(COL.stone, ox, 8, oz, 1.4, 16, 1.4);
    }
    return { b, obs, lamps: [] };
  }

  // ---- detailed cell -------------------------------------------------------------------------
  function nearCell(ci, cj, rnd, L) {
    const ox = ci * P, oz = cj * P, b = new R.Batch(), obs = [], lamps = [];
    groundBase(b, ox, oz, L);
    const place = (key, x, z, yaw, s, sy, y) => A.place(b, key, ox + x, oz + z, yaw, s, sy, y);
    const solid = (fp, kind, minH) => addObs(obs, fp, kind, minH);
    const rr = (a, c) => a + rnd() * (c - a);
    const pick = arr => arr[Math.floor(rnd() * arr.length)];
    const tree = (x, z, s) => { place('tree', x, z, rnd() * 6.28, s || rr(0.9, 1.25)); obs.push({ x: ox + x, z: oz + z, hx: 0.32, hz: 0.32, h: 8, kind: 'tree' }); };
    const plan = L.type === 'city' ? ringPlan(rnd) : null;
    const inGap = (side, t) => plan && plan.alley && ((plan.alley === 'z' && side.nz) || (plan.alley === 'x' && side.nx)) && Math.abs(t) < AW + 1.2;

    // lamps and trees along the curb
    SIDES.forEach((side, i) => {
      for (const t of [-12, 12]) {
        if (inGap(side, t)) continue;
        const [x, z] = pt(side, t, PADH - 0.5);
        lamp(b, obs, lamps, ox + x, oz + z, -side.nx, -side.nz);
      }
      for (let t = -HB + 4; t < HB - 3; t += 8 + rnd() * 4) {
        if (Math.abs(Math.abs(t) - 12) < 3 || rnd() < 0.3 || inGap(side, t)) continue;
        const [x, z] = pt(side, t, PADH - 1.2);
        tree(x, z);
      }
      if (L.ped[i]) {
        // pedestrian street: benches and planters in the middle
        for (const t of [-14, 0, 14]) {
          const [x, z] = pt(side, t, (PADH + HP) / 2 + 2);
          if (rnd() < 0.5) solid(place('planter_bushes', x, z, side.yaw + rad(90), 1.2), 'prop');
          else tree(x, z, 1.1);
        }
      }
    });

    // traffic lights where real streets cross
    if (A.has('traffic_light')) {
      const w = A.dims('traffic_light').w;
      for (const sx of [1, -1]) for (const sz of [1, -1]) {
        if (L.ped[sx > 0 ? 1 : 3] && L.ped[sz > 0 ? 0 : 2]) continue;
        const px = sx * (PADH - 0.6), pz = sz * (PADH - 0.6);
        place('traffic_light', px + sx * w / 2, pz, sx > 0 ? Math.PI : 0);
        obs.push({ x: ox + px, z: oz + pz, hx: 0.22, hz: 0.22, h: 6, kind: 'pole' });
      }
    }

    // parked cars and things on the road
    const cars = ['car', 'car_b', 'suv', 'police_car', 'sports_car', 'pickup_truck', 'van', 'motorcycle'];
    SIDES.forEach((side, i) => {
      if (L.ped[i]) return;
      for (const t0 of [-15, 0, 15]) {
        if (rnd() < 0.45 || inGap(side, t0)) continue;
        const t = t0 + rr(-3, 3);
        const key = rnd() < 0.08 ? 'bus' : pick(cars);
        const [x, z] = pt(side, t, PADH + 1.7);
        const yaw = (side.nz ? rad(90) : 0) + (rnd() < 0.5 ? 0 : Math.PI);
        solid(place(key, x, z, yaw, 1), 'car', 0.5);
      }
      const n = 1 + Math.floor(rnd() * 2);
      for (let k = 0; k < n; k++) {
        const t = rr(-HB + 5, HB - 5), off = PADH + rr(3.6, RH * 2 - 1.5);
        const [x, z] = pt(side, t, off);
        if (ci === 0 && cj === 0 && Math.abs(ox + x - HP) < 10 && Math.abs(oz + z) < 26) continue;
        const kk = pick(['cone', 'cone', 'box', 'trash_can', 'dumpster', 'planter_bushes', 'fence_piece', 'trash_bag']);
        if (kk === 'cone') {
          for (let c = 0; c < 3; c++) solid(place('cone', x + (side.nz ? c * 1.0 : 0), z + (side.nz ? 0 : c * 1.0), 0, 1), 'cone');
        } else solid(place(kk, x, z, rad(90) * Math.floor(rnd() * 4), 1), kk);
      }
      for (let k = 0; k < 2; k++) {
        const [x, z] = pt(side, rr(-HB, HB), PADH + rr(2, RH * 2 - 2));
        place(rnd() < 0.5 ? 'manhole_cover' : 'debris_papers', x, z, rnd() * 6.28, 1, 1, 0.03);
      }
    });

    if (L.type === 'city') cityBlock();
    else if (L.type === 'park') park();
    else if (L.type === 'square') square();
    else plaza();
    return { b, obs, lamps };

    function cityBlock() {
      blockCore(b, obs, ox, oz, plan.alley);
      for (const it of plan) {
        const pl = planPlace(it);
        if (pl) A.place(b, it.key, ox + pl.x, oz + pl.z, it.yaw, it.w, pl.sy);
        else {
          const tint = FAR_TINT[(it.tint || 0) % FAR_TINT.length];
          const [x, z] = it.corner ? [it.x, it.z] : pt(it.side, it.t, HB - 3);
          b.box(tint, ox + x, 7, oz + z, 9, 14, 6);
        }
      }
      // furniture in front of the buildings
      for (const side of SIDES) {
        for (let t = -HB + 6; t < HB - 5; t += rr(6, 10)) {
          if (inGap(side, t)) continue;
          const [x, z] = pt(side, t, HB + 0.8);
          const r = rnd();
          if (r < 0.2) solid(place('trash_can', x, z, 0, 1), 'prop');
          else if (r < 0.35) solid(place('mailbox', x, z, side.yaw, 1), 'prop');
          else if (r < 0.5) solid(place('power_box', x, z, side.yaw, 1), 'prop');
          else if (r < 0.62) solid(place('planter_bushes', x, z, side.yaw, 1), 'prop');
          else if (r < 0.74) solid(place('flower_pot', x, z, 0, 1), 'prop');
          else if (r < 0.82) solid(place('bench', x, z, side.yaw + Math.PI, 1), 'prop');
          else if (r < 0.88) solid(place('atm', x, z, side.yaw, 1), 'prop');
          else if (r < 0.94) solid(place('trash_bag', x, z, rnd() * 6, 1), 'prop');
        }
        const ht = rr(-14, 14);
        if (!inGap(side, ht)) { const [hx, hz] = pt(side, ht, PADH - 0.6); solid(place('fire_hydrant', hx, hz, 0, 1), 'prop'); }
      }
      if (rnd() < 0.5) {
        const side = pick(SIDES), t = rr(-16, -8);
        if (!inGap(side, t)) { const [x, z] = pt(side, t, PADH - 2); solid(place('bus_stop', x, z, side.yaw, 1), 'prop'); }
      }
      // the alley: bins, bags and boxes along the walls, room to run through the middle
      if (plan.alley) {
        for (let t = -HB + 5; t < HB - 4; t += rr(5, 8)) {
          const s = rnd() < 0.5 ? 1 : -1, off = s * (AW - 1.3);
          const [x, z] = plan.alley === 'z' ? [off, t] : [t, off];
          const k = pick(['dumpster', 'trash_bag', 'box', 'trash_can', 'power_box', 'box']);
          solid(place(k, x, z, plan.alley === 'z' ? rad(90) * s : (s > 0 ? Math.PI : 0), 1), k);
        }
        const [lx, lz] = plan.alley === 'z' ? [AW - 0.4, 0] : [0, AW - 0.4];
        lamp(b, obs, lamps, ox + lx, oz + lz, plan.alley === 'z' ? -1 : 0, plan.alley === 'z' ? 0 : -1);
      }
    }

    function park() {
      b.rect(COL.grass, ox, oz, B, B, 0.05);
      b.rect(COL.grass2, ox, oz, B - 8, B - 8, 0.06);
      b.rect(COL.path, ox, oz, B, 3.6, 0.08);
      b.rect(COL.path, ox, oz, 3.6, B, 0.08);
      b.rect(COL.path, ox, oz, 10, 10, 0.09);
      const spots = [];
      const free = (x, z, d) => spots.every(s => Math.hypot(s[0] - x, s[1] - z) > d);
      for (let tries = 0; tries < 70 && spots.length < 16; tries++) {
        const x = rr(-HB + 3, HB - 3), z = rr(-HB + 3, HB - 3);
        if (Math.abs(x) < 4 || Math.abs(z) < 4 || !free(x, z, 6)) continue;
        spots.push([x, z]);
        tree(x, z, rr(0.9, 1.35));
      }
      for (const [bx, bz, yaw] of [[6, 3, 0], [-6, -3, Math.PI], [3, -7, rad(90)], [-3, 8, rad(270)], [14, 3, 0], [-14, -3, Math.PI]]) {
        solid(place('bench', bx, bz, yaw, 1), 'prop');
      }
      for (const [x, z] of [[8, 6], [-8, -6], [6, -10], [-10, 6]]) solid(place('planter_bushes', x, z, rad(90) * Math.floor(rnd() * 4), 1), 'prop');
      for (const [x, z] of [[5, 5], [-5, -5]]) lamp(b, obs, lamps, ox + x, oz + z, -Math.sign(x), 0);
      solid(place('trash_can', 4, 10, 0, 1), 'prop');
      solid(place('trash_can', -4, -10, 0, 1), 'prop');
    }

    function square() {
      // checkered paving
      for (let x = -HB + 2; x < HB; x += 4) for (let z = -HB + 2; z < HB; z += 4) {
        if (((x + z) / 4 & 1) === 0) b.rect(COL.paving2, ox + x, oz + z, 4, 4, 0.05);
      }
      if (rnd() < 0.55) {
        // fountain
        b.cyl(COL.stone, ox, 0.4, oz, 6, 6.3, 0.8, 20);
        b.cyl(COL.water, ox, 0.62, oz, 5.5, 5.5, 0.4, 20);
        b.cyl(COL.stone2, ox, 1.4, oz, 0.6, 0.8, 2.6, 10);
        b.cyl(COL.stone, ox, 2.8, oz, 2.0, 1.2, 0.5, 14);
        b.cyl(COL.water, ox, 3.05, oz, 1.8, 1.8, 0.06, 14);
        b.sph(COL.stone2, ox, 3.6, oz, 0.45);
        obs.push({ x: ox, z: oz, hx: 4.8, hz: 4.8, h: 0.8, kind: 'fountain' });
        obs.push({ x: ox, z: oz, hx: 0.8, hz: 0.8, h: 3.4, kind: 'fountain' });
      } else {
        // landmark obelisk, visible from far streets
        b.box(COL.stone2, ox, 0.6, oz, 5, 1.2, 5);
        b.box(COL.stone, ox, 1.6, oz, 3, 0.8, 3);
        b.box(COL.stone, ox, 9.5, oz, 1.4, 15, 1.4);
        b.cone(COL.stone, ox, 17.8, oz, 1.0, 1.6);
        b.sph(COL.gold, ox, 18.9, oz, 0.5, 'glass');
        obs.push({ x: ox, z: oz, hx: 2.5, hz: 2.5, h: 1.2, kind: 'monument' });
        obs.push({ x: ox, z: oz, hx: 1.5, hz: 1.5, h: 17, kind: 'monument' });
        for (const [x, z] of [[-7, 0], [7, 0], [0, -7], [0, 7]]) b.rect(COL.grass2, ox + x, oz + z, 3, 3, 0.07);
      }
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4 + Math.PI / 8;
        const x = Math.cos(a) * 11, z = Math.sin(a) * 11;
        solid(place('bench', x, z, Math.atan2(Math.cos(a), Math.sin(a)), 1), 'prop');
      }
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3;
        lamp(b, obs, lamps, ox + Math.cos(a) * 16, oz + Math.sin(a) * 16, 0, 0);
      }
      for (const sx of [1, -1]) for (const sz of [1, -1]) {
        solid(place('planter_bushes', sx * 17, sz * 13, rad(90), 1.1), 'prop');
        tree(sx * 17, sz * 17);
        solid(place('flower_pot', sx * 13, sz * 17, 0, 1), 'prop');
      }
    }

    function plaza() {
      b.rect(COL.paving, ox, oz, B, B, 0.05);
      b.rect([0.41, 0.375, 0.33], ox, oz, B - 6, B - 6, 0.06);
      for (let k = 0; k < 9; k++) solid(place('cone', -16 + k * 4, (k % 2 ? 1.4 : -1.4), 0, 1), 'cone');
      for (let k = 0; k < 7; k++) solid(place('cone', 10 + (k % 2 ? 1.4 : -1.4), -18 + k * 5, 0, 1), 'cone');
      for (const [x, z] of [[-14, -14], [14, 14], [-14, 14], [14, -14]]) {
        solid(place('planter_bushes', x, z, 0, 1.2), 'prop');
        tree(x + 3, z + 3, 1);
      }
      for (let k = 0; k < 4; k++) solid(place('box', -4 + k * 2.2, 8, 0, 1), 'box');
      for (const [x, z, yaw] of [[0, 17, Math.PI], [0, -17, 0], [17, 0, rad(90) + Math.PI]]) solid(place('bench', x, z, yaw, 1), 'prop');
      for (let row = 0; row < 3; row++) for (let k = 0; k < 4; k++) solid(place('fence_piece', -8 + k * 1.3, -6 - row * 4, 0, 1), 'fence');
    }
  }

  // ---- streaming -----------------------------------------------------------------------------
  class World {
    constructor(scene) {
      this.scene = scene;
      this.cells = new Map();
      this.start = { x: HP, z: 0 };
      this.farCells = C.FAR_CELLS;
      this.nearR = 1;
    }
    static cellIndex(v) { return Math.round(v / P); }
    key(ci, cj) { return ci + ',' + cj; }

    update(px, pz, budget) {
      const ci0 = World.cellIndex(px), cj0 = World.cellIndex(pz), R_ = this.farCells;
      const want = [];
      for (let dz = -R_; dz <= R_; dz++) for (let dx = -R_; dx <= R_; dx++) {
        const near = Math.max(Math.abs(dx), Math.abs(dz)) <= this.nearR;
        const ci = ci0 + dx, cj = cj0 + dz, c = this.cells.get(this.key(ci, cj));
        if (!c || c.near !== near) want.push({ ci, cj, near, d: dx * dx + dz * dz });
      }
      want.sort((a, b) => a.d - b.d);
      let n = 0;
      for (const w of want) {
        if (n >= budget) break;
        this.build(w.ci, w.cj, w.near);
        n++;
      }
      for (const [k, c] of this.cells) {
        if (Math.max(Math.abs(c.ci - ci0), Math.abs(c.cj - cj0)) > R_ + 1) this.drop(k, c);
      }
    }

    build(ci, cj, near) {
      const k = this.key(ci, cj), old = this.cells.get(k);
      if (old) this.drop(k, old);
      const rnd = R.rng(seedOf(ci, cj)), L = layout(ci, cj);
      const r = near ? nearCell(ci, cj, rnd, L) : farCell(ci, cj, rnd, L);
      const group = new THREE.Group();
      r.b.build(group);
      this.scene.add(group);
      this.cells.set(k, { ci, cj, near, type: L.type, group, obstacles: r.obs, lamps: r.lamps });
    }
    drop(k, c) {
      this.scene.remove(c.group);
      c.group.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      this.cells.delete(k);
    }
    each3x3(x, z, fn) {
      const ci = World.cellIndex(x), cj = World.cellIndex(z);
      for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
        const c = this.cells.get(this.key(i, j));
        if (c) fn(c);
      }
    }
    obstaclesNear(x, z, range) {
      const out = [];
      this.each3x3(x, z, c => {
        for (const o of c.obstacles) {
          if (Math.abs(o.x - x) < range + o.hx && Math.abs(o.z - z) < range + o.hz) out.push(o);
        }
      });
      return out;
    }
    lampsNear(x, z, n) {
      const all = [];
      this.each3x3(x, z, c => { for (const l of c.lamps) all.push(l); });
      all.sort((a, b) => ((a.x - x) ** 2 + (a.z - z) ** 2) - ((b.x - x) ** 2 + (b.z - z) ** 2));
      return all.slice(0, n);
    }
    // is a tall, unjumpable thing within r of this point?
    solidAt(x, z, r) {
      for (const o of this.obstaclesNear(x, z, r)) {
        if (o.h > 1.5 && Math.abs(o.x - x) < o.hx + r && Math.abs(o.z - z) < o.hz + r) return true;
      }
      return false;
    }
    // keep the camera out of buildings
    pushOut(pos, r) {
      for (const o of this.obstaclesNear(pos.x, pos.z, r)) {
        if (o.h < 3) continue;
        const cx = R.clamp(pos.x, o.x - o.hx, o.x + o.hx), cz = R.clamp(pos.z, o.z - o.hz, o.z + o.hz);
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 < 1e-6) { dx = pos.x - o.x; dz = pos.z - o.z; }
        const d = Math.hypot(dx, dz) || 1;
        pos.x = cx + dx / d * r; pos.z = cz + dz / d * r;
      }
    }

    // push p out of obstacles; returns the strongest hit (normal points away from the obstacle)
    resolve(p, r) {
      let hit = null;
      for (const o of this.obstaclesNear(p.x, p.z, r + 0.2)) {
        if (p.y > o.h - 0.15) continue;
        const cx = R.clamp(p.x, o.x - o.hx, o.x + o.hx), cz = R.clamp(p.z, o.z - o.hz, o.z + o.hz);
        let dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-5) { dx = p.x - o.x; dz = p.z - o.z; d = Math.hypot(dx, dz) || 1; }
        const nx = dx / d, nz = dz / d;
        p.x = cx + nx * r; p.z = cz + nz * r;
        hit = { nx, nz, h: o.h, kind: o.kind, ox: o.x };
      }
      return hit;
    }
  }

  R.World = World;
})(window.R = window.R || {});
