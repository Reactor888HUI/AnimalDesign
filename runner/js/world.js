(function (R) {
  const C = R.C;
  const P = C.P, B = C.B, HB = B / 2, SW = C.SW, HP = P / 2, RH = C.ROAD / 2;
  const PADH = HB + SW;               // half size of the sidewalk pad
  const A = R.assets;
  const rad = d => d * Math.PI / 180;

  const COL = {
    asphalt: [0.19, 0.195, 0.215], alley: [0.165, 0.165, 0.18], sidewalk: [0.55, 0.51, 0.46], curb: [0.76, 0.73, 0.68],
    paint: [0.93, 0.9, 0.8], yellow: [0.9, 0.68, 0.16], grass: [0.25, 0.52, 0.17], grass2: [0.33, 0.6, 0.22],
    paving: [0.5, 0.43, 0.36], paving2: [0.42, 0.36, 0.31], path: [0.55, 0.5, 0.42], fill: [0.42, 0.3, 0.26],
    pole: [0.27, 0.29, 0.33], globe: [1.0, 0.92, 0.65], stone: [0.72, 0.7, 0.66], stone2: [0.58, 0.56, 0.53],
    water: [0.25, 0.5, 0.66], gold: [0.85, 0.66, 0.25], yard: [0.25, 0.25, 0.24],
  };
  // which surface detail each colour gets (materials.js): 1 asphalt, 2 slabs, 3 paving, 4 grass, 6 gravel, 7 concrete
  R.SURF = new Map([
    [COL.asphalt, 1], [COL.alley, 1], [COL.sidewalk, 2], [COL.paving, 3], [COL.paving2, 3], [COL.grass, 4], [COL.grass2, 4],
    [COL.path, 6], [COL.curb, 7], [COL.fill, 7], [COL.stone, 7], [COL.stone2, 7], [COL.yard, 7],
  ]);
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
  const YARD_CELL = [-1, 1];
  const FORCED = { '0,0': 'city', '1,0': 'park', '1,-1': 'square', '0,-1': 'city', '0,-2': 'plaza', '-1,0': 'square', '-1,1': 'yard', '0,1': 'garages' };
  function typeOf(ci, cj) {
    const f = FORCED[ci + ',' + cj];
    if (f) return f;
    const h = R.rng(seedOf(ci, cj) ^ 0x9e3779b9)();
    return h < 0.53 ? 'city' : h < 0.68 ? 'park' : h < 0.81 ? 'square' : h < 0.92 ? 'plaza' : 'garages';
  }
  const isOpen = (ci, cj) => { const t = typeOf(ci, cj); return t !== 'city' && t !== 'yard'; };

  // ---- the guarded yard (warehouse, coop, kiosk) -----------------------------------------------
  // Everything in yard-local metres; the block spans -22..22, the gate opens to the +Z street.
  const YARD = {
    fence: HB, fenceH: 2.4, gateHalf: 4,
    warehouse: { x: -6, z: -17, w: 24, d: 8, h: 7 },
    crates: { x: -9, z: -7.5 },            // where a thief grabs a crate
    coop: { x: 15, z: -15, pen: [9.5, 22, -22, -9.5] },
    coopTarget: { x: 15, z: -11.5 },
    stall: { x: 13, z: 15 }, stallTarget: { x: 13, z: 12.2 },
    doghouse: { x: -4, z: 5 }, dogStart: { x: 0, z: 9 },
    door: { x: -9, z: -12.3 },
    checkpoints: [[-19, 18], [19, 4], [2, -10], [-19, -9]],
  };
  function yardWorld() {
    const ox = YARD_CELL[0] * P, oz = YARD_CELL[1] * P, w = (p) => ({ x: ox + p.x, z: oz + p.z });
    return {
      ox, oz, fence: YARD.fence, fenceH: YARD.fenceH, gateHalf: YARD.gateHalf,
      gate: { x: ox, z: oz + YARD.fence }, outside: { x: ox, z: oz + YARD.fence + 6 },
      crates: w(YARD.crates), coop: w(YARD.coopTarget), stall: w(YARD.stallTarget),
      door: w(YARD.door), doghouse: w({ x: YARD.doghouse.x + 1.6, z: YARD.doghouse.z + 0.5 }), dogStart: w(YARD.dogStart),
      pen: { x0: ox + YARD.coop.pen[0], x1: ox + YARD.coop.pen[1], z0: oz + YARD.coop.pen[2], z1: oz + YARD.coop.pen[3] },
      checkpoints: YARD.checkpoints.map(([x, z]) => ({ x: ox + x, z: oz + z })),
    };
  }

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

  // a barrier gate: a striped bar at knee height across `len` metres along `axis` ('x' or 'z').
  // Standing, the dog does not fit under it: slide under (body low) or jump over.
  const BAR_LOW = 0.6, BAR_TOP = 0.82;
  function bar(b, obs, x, z, len, axis) {
    const ax = axis === 'x', n = Math.max(3, Math.round(len / 0.5));
    for (const e of [-1, 1]) {
      const px = x + (ax ? e * len / 2 : 0), pz = z + (ax ? 0 : e * len / 2);
      b.cyl([0.85, 0.82, 0.78], px, 0.55, pz, 0.07, 0.08, 1.1, 8);
      obs.push({ x: px, z: pz, hx: 0.1, hz: 0.1, h: 1.1, kind: 'pole' });
    }
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + (i + 0.5) * len / n, col = i % 2 ? [0.95, 0.94, 0.9] : [0.86, 0.16, 0.12];
      b.box(col, x + (ax ? t : 0), (BAR_LOW + BAR_TOP) / 2, z + (ax ? 0 : t), ax ? len / n : 0.14, BAR_TOP - BAR_LOW, ax ? 0.14 : len / n);
    }
    obs.push({ x, z, hx: ax ? len / 2 : 0.1, hz: ax ? 0.1 : len / 2, h: BAR_TOP, low: BAR_LOW, kind: 'bar' });
  }

  // ambient occlusion on the ground: soft dark patches at the foot of things, so they stand on the
  // ground instead of floating over it (walls get a wide one, cars a dark one under them, trees a round one)
  const AO_SKIP = { ramp: 1, kicker: 1, bar: 1, traffic: 1, npc: 1, pen: 1 };
  function groundAO(b, obs) {
    for (const o of obs) {
      if (AO_SKIP[o.kind] || o.h < 0.25 || o.low !== undefined) continue;
      if (o.kind === 'tree') b.aoDisc(o.x, o.z, 0.45, 2.4, 0.4);
      else if (o.kind === 'pole') b.aoDisc(o.x, o.z, 0.1, 0.55, 0.45, 8);
      else if (o.r) b.aoDisc(o.x, o.z, o.r, o.r + 1.3, 0.38, 24);
      else {
        const big = Math.max(o.hx, o.hz) > 3 || o.h > 3, car = o.kind === 'car';
        b.aoRect(o.x, o.z, o.hx, o.hz, big ? 1.7 : car ? 0.9 : 0.5, big ? 0.4 : car ? 0.62 : 0.42);
      }
    }
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
    } else if (L.type === 'yard') {
      b.rect(COL.yard, ox, oz, B, B, 0.05);
      const W = YARD.warehouse;
      b.facadeBox([0.5, 0.47, 0.42], ox + W.x, W.h / 2, oz + W.z, W.w, W.h, W.d);
      obs.push({ x: ox + W.x, z: oz + W.z, hx: W.w / 2, hz: W.d / 2, h: 99, kind: 'wall' });
    } else if (L.type === 'garages') {
      b.rect(COL.yard, ox, oz, B, B, 0.05);
      for (const [x0, x1, z, h] of GARAGE_ROWS) b.box([0.55, 0.53, 0.5], ox + (x0 + x1) / 2, h / 2, oz + z, x1 - x0, h, 6);
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
    const arcs = [];   // bone arcs over the jumps (garages), picked up by the runner
    const rings = [];  // hoops in the air to fly through: { x, y, z, r, axis } (axis = direction of flight)
    const wires = [];  // overhead wires: { a, b, sag }
    const inGap = (side, t) => plan && plan.alley && ((plan.alley === 'z' && side.nz) || (plan.alley === 'x' && side.nx)) && Math.abs(t) < AW + 1.2;

    // lamps and trees along the curb
    const poles = [];  // [side][0 = t -12, 1 = t +12]: the street lamps' poles, for the wires
    SIDES.forEach((side, i) => {
      poles[i] = [];
      for (const t of [-12, 12]) {
        if (inGap(side, t)) continue;
        const [x, z] = pt(side, t, PADH - 0.5);
        lamp(b, obs, lamps, ox + x, oz + z, -side.nx, -side.nz);
        poles[i][t < 0 ? 0 : 1] = [ox + x, oz + z];
      }
      for (let t = -HB + 4; t < HB - 3; t += 8 + rnd() * 4) {
        if (Math.abs(Math.abs(t) - 12) < 3 || rnd() < 0.3 || inGap(side, t)) continue;
        if (L.type === 'yard' && side.nz === 1 && Math.abs(t) < 8) continue; // keep the gate clear
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
        if (L.type === 'yard' && side.nz === 1 && t0 === 0) continue;
        const t = t0 + rr(-3, 3);
        const key = rnd() < 0.08 ? 'bus' : pick(cars);
        const [x, z] = pt(side, t, PADH + 1.7);
        const yaw = (side.nz ? rad(90) : 0) + (rnd() < 0.5 ? 0 : Math.PI);
        solid(place(key, x, z, yaw, 1), 'car', 0.5);
      }
      const n = 1 + Math.floor(rnd() * 2);
      for (let k = 0; k < n; k++) {
        const t = rr(-HB + 5, HB - 5), off = PADH + rr(3.4, 5.6);
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
    else if (L.type === 'yard') yard();
    else if (L.type === 'park') park();
    else if (L.type === 'square') square();
    else if (L.type === 'garages') garages();
    else plaza();
    // wires from pole to pole along the block and round its corners; birds perch on them
    {
      const WY = 5.05, wire = (p, q, sag) => {
        b.wire([0.13, 0.13, 0.15], [p[0], WY, p[1]], [q[0], WY, q[1]], sag, 0.022);
        wires.push({ a: [p[0], WY, p[1]], b: [q[0], WY, q[1]], sag });
      };
      // the sides go round the block: side i's +12 end meets side (i + 1)'s ... end at a corner
      for (let i = 0; i < 4; i++) {
        const P0 = poles[i][0], P1 = poles[i][1];
        if (P0 && P1) wire(P0, P1, 0.7);
      }
      const ends = i => [poles[i][0], poles[i][1]].filter(Boolean);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        let best = null, bd = 1e9;
        for (const p of ends(i)) for (const q of ends(j)) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; best = [p, q]; } }
        if (best && bd < 30) wire(best[0], best[1], 0.9);
      }
    }
    groundAO(b, obs);
    return { b, obs, lamps, arcs, rings, wires };

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

    function yard() {
      const Y = YARD, F = Y.fence, H = Y.fenceH;
      b.rect(COL.yard, ox, oz, B, B, 0.05);
      // fence: concrete posts + mesh panels, gate on the +Z side
      const postCol = [0.6, 0.6, 0.58], meshCol = [0.25, 0.27, 0.3];
      const run = (x0, z0, x1, z1) => {
        const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 3.5));
        for (let k = 0; k <= n; k++) {
          const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
          b.box(postCol, ox + x, H / 2, oz + z, 0.25, H, 0.25);
        }
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
        b.box(meshCol, ox + cx, H - 0.1, oz + cz, alongX ? len : 0.06, 0.08, alongX ? 0.06 : len);
        for (let y = 0.35; y < H - 0.2; y += 0.42) b.box(meshCol, ox + cx, y, oz + cz, alongX ? len : 0.04, 0.04, alongX ? 0.04 : len);
        for (let k = 0; k < len / 0.5; k++) {
          const t = (k + 0.5) / (len / 0.5), x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
          b.box(meshCol, ox + x, H / 2, oz + z, 0.03, H - 0.2, 0.03);
        }
        obs.push({ x: ox + cx, z: oz + cz, hx: alongX ? len / 2 : 0.15, hz: alongX ? 0.15 : len / 2, h: H, kind: 'fence_tall' });
      };
      run(-F, -F, F, -F); run(-F, -F, -F, F); run(F, -F, F, F);
      run(-F, F, -Y.gateHalf, F); run(Y.gateHalf, F, F, F);
      for (const s of [-1, 1]) {
        b.box([0.7, 0.62, 0.2], ox + s * Y.gateHalf, 1.5, oz + F, 0.5, 3, 0.5);
        b.sph(COL.globe, ox + s * Y.gateHalf, 3.2, oz + F, 0.25, 'glass');
      }
      // warehouse with roller doors
      const W = Y.warehouse;
      b.box([0.5, 0.47, 0.42], ox + W.x, W.h / 2, oz + W.z, W.w, W.h, W.d);
      b.box([0.32, 0.3, 0.28], ox + W.x, W.h + 0.2, oz + W.z, W.w + 0.4, 0.4, W.d + 0.4);
      for (const dx of [-6, 6]) {
        b.box([0.28, 0.3, 0.33], ox + W.x + dx, 1.9, oz + W.z + W.d / 2 + 0.03, 4.4, 3.8, 0.06);
        for (let y = 0.4; y < 3.8; y += 0.35) b.box([0.38, 0.4, 0.43], ox + W.x + dx, y, oz + W.z + W.d / 2 + 0.07, 4.4, 0.05, 0.03);
        b.box(COL.pole, ox + W.x + dx, 4.4, oz + W.z + W.d / 2 + 0.4, 0.5, 0.15, 0.8);
        b.sph(COL.globe, ox + W.x + dx, 4.25, oz + W.z + W.d / 2 + 0.7, 0.2, 'glass');
        b.poolDecal(ox + W.x + dx, oz + W.z + W.d / 2 + 3, 10);
        lamps.push({ x: ox + W.x + dx, y: 4.3, z: oz + W.z + W.d / 2 + 0.7 });
      }
      b.box([0.75, 0.7, 0.2], ox + W.x, 5.6, oz + W.z + W.d / 2 + 0.05, 7, 1, 0.1);
      obs.push({ x: ox + W.x, z: oz + W.z, hx: W.w / 2, hz: W.d / 2, h: 99, kind: 'wall' });
      // crates in front of the warehouse
      const crate = [0.55, 0.4, 0.24];
      for (const [x, z, n] of [[-14, -10, 2], [-12.6, -10, 1], [-11, -10, 3], [-6.5, -10, 2], [-5, -10, 1], [-3.4, -10.2, 2], [-14, -8.6, 1]]) {
        for (let k = 0; k < n; k++) b.box(k % 2 ? crate.map(c => c * 0.85) : crate, ox + x, 0.6 + k * 1.2, oz + z, 1.2, 1.2, 1.2);
        obs.push({ x: ox + x, z: oz + z, hx: 0.6, hz: 0.6, h: n * 1.2, kind: 'box' });
      }
      // chicken coop with a low pen
      const cp = Y.coop, [x0, x1, z0, z1] = cp.pen;
      b.box([0.62, 0.3, 0.22], ox + cp.x + 2, 1.2, oz + cp.z - 3.5, 4, 2.4, 2.6);
      b.ramp([0.35, 0.18, 0.14], ox + cp.x + 2, oz + cp.z - 3.5, 4.4, 3.0, 0.9, 'z', 1, 2.4);
      b.box([0.2, 0.12, 0.08], ox + cp.x + 2, 0.5, oz + cp.z - 2.18, 0.8, 1.0, 0.05);
      obs.push({ x: ox + cp.x + 2, z: oz + cp.z - 3.5, hx: 2, hz: 1.3, h: 2.4, kind: 'box' });
      const penRun = (ax, az, bx2, bz2) => {
        const alongX = Math.abs(bx2 - ax) > 0.01, len = alongX ? Math.abs(bx2 - ax) : Math.abs(bz2 - az);
        const cx = (ax + bx2) / 2, cz = (az + bz2) / 2;
        b.box([0.55, 0.5, 0.42], ox + cx, 1.0, oz + cz, alongX ? len : 0.05, 0.06, alongX ? 0.05 : len);
        b.box([0.55, 0.5, 0.42], ox + cx, 0.5, oz + cz, alongX ? len : 0.04, 0.04, alongX ? 0.04 : len);
        for (let k = 0; k <= len / 2; k++) {
          const t = Math.min(1, k * 2 / len);
          b.box([0.45, 0.38, 0.3], ox + ax + (bx2 - ax) * t, 0.55, oz + az + (bz2 - az) * t, 0.1, 1.1, 0.1);
        }
        obs.push({ x: ox + cx, z: oz + cz, hx: alongX ? len / 2 : 0.1, hz: alongX ? 0.1 : len / 2, h: 1.05, kind: 'pen' });
      };
      penRun(x0, z1, x1, z1); penRun(x0, z0, x0, z1);
      b.rect([0.42, 0.36, 0.22], ox + (x0 + x1) / 2, oz + (z0 + z1) / 2, x1 - x0, z1 - z0, 0.06);
      // kiosk with sausages
      const st = Y.stall;
      b.box([0.75, 0.72, 0.62], ox + st.x, 1.3, oz + st.z, 4.2, 2.6, 2.6);
      b.box([0.75, 0.2, 0.18], ox + st.x, 2.75, oz + st.z - 1.7, 4.6, 0.12, 1.4);
      b.box([0.5, 0.36, 0.22], ox + st.x, 1.05, oz + st.z - 1.45, 4.2, 0.1, 0.5);
      for (let k = 0; k < 6; k++) b.cyl([0.62, 0.18, 0.12], ox + st.x - 1.5 + k * 0.6, 1.16, oz + st.z - 1.45, 0.07, 0.07, 0.4, 6);
      b.box([0.95, 0.85, 0.5], ox + st.x, 2.95, oz + st.z - 1.31, 2.4, 0.4, 0.05, 'glass');
      obs.push({ x: ox + st.x, z: oz + st.z, hx: 2.1, hz: 1.3, h: 2.6, kind: 'box' });
      // doghouse
      const dh = Y.doghouse;
      b.box([0.55, 0.38, 0.24], ox + dh.x, 0.6, oz + dh.z, 1.6, 1.2, 1.8);
      b.ramp([0.4, 0.2, 0.15], ox + dh.x, oz + dh.z, 2.0, 1.9, 0.5, 'x', 1, 1.2);
      b.box([0.08, 0.06, 0.05], ox + dh.x + 0.81, 0.45, oz + dh.z, 0.03, 0.75, 0.6);
      obs.push({ x: ox + dh.x, z: oz + dh.z, hx: 0.8, hz: 0.9, h: 1.2, kind: 'box' });
      // patrol posts and lamps
      for (const [x, z] of Y.checkpoints) {
        b.cyl([0.3, 0.3, 0.32], ox + x, 0.6, oz + z, 0.12, 0.15, 1.2, 8);
        obs.push({ x: ox + x, z: oz + z, hx: 0.18, hz: 0.18, h: 1.2, kind: 'pole' });
      }
      for (const [x, z] of [[-19, 19], [19, 19], [19, -3], [-19, 0], [3, 0]]) lamp(b, obs, lamps, ox + x, oz + z, 0, 0);
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
        // round, like the stone basin itself (a square box let the dog sink half way into the rim)
        obs.push({ x: ox, z: oz, hx: 6.3, hz: 6.3, r: 6.3, h: 0.8, kind: 'fountain' });
        obs.push({ x: ox, z: oz, hx: 0.8, hz: 0.8, r: 0.8, h: 3.4, kind: 'fountain' });
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

    // Garage block: two lines of garage roofs over a driveway. Each line: a ramp up onto a roof, a
    // kicker (orange) at the end of the roof, a gap, and the next roof to land on. The second line
    // is higher with a wider gap: it needs speed and a well-timed second jump.
    function garages() {
      b.rect(COL.yard, ox, oz, B, B, 0.05);
      const roofCol = [0.2, 0.2, 0.22], doorCol = [0.38, 0.41, 0.45];
      const walls = [[0.62, 0.6, 0.55], [0.5, 0.55, 0.6], [0.62, 0.53, 0.44], [0.55, 0.6, 0.52]];
      const row = (x0, x1, z, h, side) => {
        const d = 6, n = Math.max(1, Math.round((x1 - x0) / 3.3)), w = (x1 - x0) / n;
        for (let i = 0; i < n; i++) {
          const cx = x0 + w * (i + 0.5);
          b.box(walls[(i * 7 + Math.round(z)) & 3], ox + cx, h / 2, oz + z, w - 0.1, h, d);
          b.box(doorCol, ox + cx, h * 0.42, oz + z + side * (d / 2 + 0.03), w * 0.78, h * 0.8, 0.05);
          for (let k = 1; k < 6; k++) b.box([0.3, 0.33, 0.37], ox + cx, h * 0.84 * k / 6, oz + z + side * (d / 2 + 0.06), w * 0.78, 0.04, 0.02);
        }
        b.box(roofCol, ox + (x0 + x1) / 2, h + 0.06, oz + z, x1 - x0 + 0.3, 0.12, d + 0.3);
        obs.push({ x: ox + (x0 + x1) / 2, z: oz + z, hx: (x1 - x0) / 2 + 0.15, hz: d / 2 + 0.15, h: h + 0.12, kind: 'garage' });
      };
      // a ramp (or a kicker) from height y0 up by `rise`, rising along `axis` towards `dir`
      const ramp = (x, z, len, wid, rise, axis, dir, y0, kick) => {
        b.ramp(kick ? [0.92, 0.45, 0.12] : [0.48, 0.4, 0.32], ox + x, oz + z, len, wid, rise, axis, dir, y0 || 0);
        if (kick) for (let k = 0; k < 3; k++) b.box([0.95, 0.9, 0.85], ox + x + dir * (len / 2 - 0.12), (y0 || 0) + rise + 0.02 - 0.0, oz + z - wid / 2 + 0.4 + k * (wid - 0.8) / 2, 0.22, 0.04, 0.35);
        obs.push({ x: ox + x, z: oz + z, hx: (axis === 'x' ? len : wid) / 2, hz: (axis === 'x' ? wid : len) / 2, h: (y0 || 0) + rise, kind: kick ? 'kicker' : 'ramp', ramp: { axis, dir, y0: y0 || 0 }, kick: !!kick });
      };
      for (const [x0, x1, z, h, side] of GARAGE_ROWS) row(x0, x1, z, h, side);
      // line 1 (north): ramp up from the west, kicker at the east end of the first roof
      ramp(-18, -12, 8, 3.6, 2.72, 'x', 1);
      ramp(-1.9, -12, 1.8, 3.4, 0.7, 'x', 1, 2.72, true);
      // line 2 (south): ramp up from the east, kicker at the west end, a lower roof across a wider gap
      ramp(18, 10, 8, 3.6, 3.32, 'x', -1);
      ramp(2.9, 10, 1.8, 3.4, 0.75, 'x', -1, 3.32, true);
      // bones over the gaps
      arcs.push({ from: [ox - 1, oz - 12], to: [ox + 4.5, oz - 12], y0: 3.4, peak: 2.0 });
      arcs.push({ from: [ox + 2, oz + 10], to: [ox - 5.5, oz + 10], y0: 4.1, peak: 2.2 });
      // rings on the flight lines: one over each gap, and a high one that needs the second jump
      rings.push({ x: ox + 1.5, y: 4.6, z: oz - 12, r: 1.3, axis: 'x' });
      rings.push({ x: ox + 7.5, y: 5.3, z: oz - 12, r: 1.2, axis: 'x' });
      rings.push({ x: ox - 1.8, y: 5.5, z: oz + 10, r: 1.35, axis: 'x' });
      // the driveway: a couple of parked cars, tyres, lamps
      solid(place('car', -9, -1, rad(90), 1), 'car', 0.5);
      solid(place('van', 12, 1.5, rad(270), 1), 'car', 0.5);
      for (const [x, z] of [[-4, 3], [-3.2, 3.5], [8, -4]]) { b.cyl([0.1, 0.1, 0.11], ox + x, 0.15, oz + z, 0.42, 0.42, 0.3, 10); obs.push({ x: ox + x, z: oz + z, hx: 0.4, hz: 0.4, h: 0.3, kind: 'box' }); }
      lamp(b, obs, lamps, ox - 21, oz - 1, 1, 0);
      lamp(b, obs, lamps, ox + 21, oz + 1, -1, 0);
      // barrier gates across the driveway: slide under or jump over
      bar(b, obs, ox - 15, oz - 1, 14, 'z');
      bar(b, obs, ox + 17, oz - 1, 14, 'z');
    }

    function plaza() {
      b.rect(COL.paving, ox, oz, B, B, 0.05);
      b.rect([0.41, 0.375, 0.33], ox, oz, B - 6, B - 6, 0.06);
      const CONT = [[0.62, 0.22, 0.18], [0.18, 0.36, 0.55], [0.25, 0.45, 0.28], [0.8, 0.6, 0.15]];
      const box = (col, x, z, sx, sz, h, kind) => {
        b.box(col, ox + x, h / 2, oz + z, sx, h, sz);
        b.box(col.map(c => c * 0.75), ox + x, h + 0.04, oz + z, sx + 0.1, 0.08, sz + 0.1);
        obs.push({ x: ox + x, z: oz + z, hx: sx / 2, hz: sz / 2, h: h + 0.08, kind: kind || 'container' });
      };
      const ramp = (x, z, len, wid, h, axis, dir) => {
        b.ramp([0.5, 0.36, 0.22], ox + x, oz + z, len, wid, h, axis, dir);
        obs.push({ x: ox + x, z: oz + z, hx: (axis === 'x' ? len : wid) / 2, hz: (axis === 'x' ? wid : len) / 2, h, kind: 'ramp', ramp: { axis, dir } });
      };
      // a ring over the gap between the first two containers
      rings.push({ x: ox - 3.5, y: 4.0, z: oz - 10, r: 1.3, axis: 'x' });
      // container run: ramp up, gap jump, a higher box, drop down
      ramp(-15.5, -10, 9, 2.6, 2.6, 'x', 1);
      box(CONT[0], -8, -10, 6, 2.6, 2.6);
      box(CONT[1], 1, -10, 6, 2.6, 2.6);
      box(CONT[2], 10, -10, 6, 2.6, 3.6);
      // crate stairs up to a container
      for (let k = 0; k < 3; k++) {
        for (let lv = 0; lv <= k; lv++) place('box', -17 + k * 1.1, 8, 0, 1, 1, lv * 0.85);
        obs.push({ x: ox - 17 + k * 1.1, z: oz + 8, hx: 0.45, hz: 0.45, h: (k + 1) * 0.85, kind: 'box' });
      }
      box(CONT[3], -10, 8, 5, 2.6, 2.6);
      ramp(-4.5, 8, 6, 2.6, 2.6, 'x', -1);
      // hurdles and a slalom
      for (let row = 0; row < 3; row++) for (let k = 0; k < 4; k++) solid(place('fence_piece', 4 + k * 1.3, 2 - row * 3.5, 0, 1), 'fence');
      for (let k = 0; k < 8; k++) solid(place('cone', -14 + k * 4, 17 + (k % 2 ? 1.2 : -1.2), 0, 1), 'cone');
      for (const [x, z] of [[-18, -18], [18, 18], [18, -18], [-18, 18]]) solid(place('planter_bushes', x, z, 0, 1.2), 'prop');
      for (const [x, z, yaw] of [[14, 4, rad(90)], [14, 9, rad(90)]]) solid(place('bench', x, z, yaw, 1), 'prop');
      tree(18, 0); tree(-20, 0);
      // a slide lane: three barriers in a row
      for (const x of [-13, -9, -5]) bar(b, obs, ox + x, oz - 1, 5, 'z');
    }
  }

  // garage rows: [x0, x1, z, height, door side]
  const GARAGE_ROWS = [[-14, -1, -12, 2.6, 1], [4, 20, -12, 2.6, 1], [2, 14, 10, 3.2, -1], [-20, -5.5, 10, 2.2, -1]];

  // ---- surfaces -----------------------------------------------------------------------------
  const STEP = 0.3;                 // the dog walks up onto anything this low
  const NOSTAND = { bar: 1, tree: 1, pole: 1, cone: 1, trash_bag: 1, wall: 1, traffic: 1, fence_tall: 1, pen: 1, npc: 1 };
  function topAt(o, x, z) {
    if (!o.ramp) return o.h;
    const along = o.ramp.axis === 'x' ? x - o.x : z - o.z, half = o.ramp.axis === 'x' ? o.hx : o.hz, y0 = o.ramp.y0 || 0;
    return y0 + (o.h - y0) * R.clamp((along * o.ramp.dir + half) / (2 * half), 0, 1);
  }

  // ---- streaming -----------------------------------------------------------------------------
  class World {
    constructor(scene) {
      this.scene = scene;
      this.cells = new Map();
      this.start = { x: HP, z: 0 };
      this.farCells = C.FAR_CELLS;
      this.nearR = 1;
      this.slice = 4;               // ms per frame for building blocks in the background
      this.dynamic = [];            // moving cars, refreshed every frame
    }
    static cellIndex(v) { return Math.round(v / P); }
    key(ci, cj) { return ci + ',' + cj; }

    // Streaming. Detailed ("near") blocks are built ahead of the dog, along where it is running,
    // a few milliseconds per frame, sent to the graphics card and only then swapped in, so the
    // street ahead is ready before it comes out of the haze and the game does not stutter.
    // The current cell is sticky: running down the middle of a street (which is a cell border)
    // does not flip a whole row of blocks back and forth.
    update(px, pz, budget, ax, az) {
      const R_ = this.farCells, urgentAll = budget >= 99;
      if (this.ci0 === undefined || urgentAll || Math.abs(px - this.ci0 * P) > HP + 8) this.ci0 = World.cellIndex(px);
      if (this.cj0 === undefined || urgentAll || Math.abs(pz - this.cj0 * P) > HP + 8) this.cj0 = World.cellIndex(pz);
      if (ax === undefined) { ax = px; az = pz; }
      const ci0 = this.ci0, cj0 = this.cj0, ai = World.cellIndex(ax), aj = World.cellIndex(az);
      const nearIn = this.nearR >= 1 ? 46 : 0, nearOut = nearIn + 16;
      const rectD = (ci, cj, x, z) => Math.hypot(Math.max(0, Math.abs(x - ci * P) - HP), Math.max(0, Math.abs(z - cj * P) - HP));
      const sync = [];
      let job = null;
      const i0 = Math.min(ci0, ai) - R_, i1 = Math.max(ci0, ai) + R_, j0 = Math.min(cj0, aj) - R_, j1 = Math.max(cj0, aj) + R_;
      for (let cj = j0; cj <= j1; cj++) for (let ci = i0; ci <= i1; ci++) {
        const cc = Math.max(Math.abs(ci - ci0), Math.abs(cj - cj0)), ca = Math.max(Math.abs(ci - ai), Math.abs(cj - aj));
        if (Math.min(cc, ca) > R_) continue;
        const d0 = rectD(ci, cj, px, pz), d = Math.min(d0, rectD(ci, cj, ax, az));
        const c = this.cells.get(this.key(ci, cj));
        // the 3x3 around the dog is always detailed (the games rely on it), plus blocks along the way ahead
        const near = cc <= this.nearR || (c && c.near ? d <= nearOut : d <= nearIn);
        if (c && c.near === near) continue;
        const urgent = urgentAll || (near && d0 < 12);
        if (!c || !near || urgent) sync.push({ ci, cj, near: near && urgent, d: d0 });       // missing / downgrade / needed now
        if (near && !urgent && (!job || d < job.d)) job = { ci, cj, d };                     // upgrade ahead, in slices
      }
      sync.sort((a, b) => a.d - b.d);
      for (let n = 0; n < sync.length && n < budget; n++) {
        const w = sync[n];
        if (this.job && this.job.k === this.key(w.ci, w.cj)) this.cancelJob();
        this.build(w.ci, w.cj, w.near);
      }
      // the background job: keep it while that block is still wanted, else start the next one
      if (this.job) {
        const j = this.job, c = this.cells.get(j.k);
        const jc = Math.max(Math.abs(j.ci - ci0), Math.abs(j.cj - cj0));
        if (!c || c.near || jc > this.nearR && rectD(j.ci, j.cj, px, pz) > nearOut && rectD(j.ci, j.cj, ax, az) > nearOut) this.cancelJob();
      }
      if (!this.job && job) this.job = { ci: job.ci, cj: job.cj, k: this.key(job.ci, job.cj), stage: 0 };
      if (this.job) this.stepJob(performance.now() + this.slice);
      for (const [k, c] of this.cells) {
        if (Math.min(Math.max(Math.abs(c.ci - ci0), Math.abs(c.cj - cj0)), Math.max(Math.abs(c.ci - ai), Math.abs(c.cj - aj))) > R_ + 1) this.drop(k, c);
      }
    }

    // the city worker (if the browser can run one): blocks are built there, the page only makes meshes
    startWorker() {
      if (this.worker !== undefined) return;
      this.worker = null;
      if (typeof Worker === 'undefined' || /[?&]noworker/.test(location.search)) return;
      try {
        const w = new Worker('js/cityworker.js');
        w.onmessage = e => this.onWorker(e.data);
        w.onerror = e => { console.warn('[runner] city worker off', e.message || e); this.worker = null; if (this.job && this.job.stage === 'wait') this.job.stage = 0; };
        w.postMessage({ type: 'lib', lib: R.assets.exportLib() });
        this.maps = new Map(R.assets.maps().map(m => [m.uuid, m]));
        this.worker = w; this.reqId = 0;
      } catch (e) { console.warn('[runner] city worker off', e); }
    }
    onWorker(m) {
      const j = this.job;
      if (m.type !== 'cell' || !j || j.id !== m.id) return;    // a block nobody waits for any more
      j.msg = m; j.stage = 'meshes';
    }

    stepJob(deadline) {
      const j = this.job;
      if (j.stage === 0 && this.worker) {
        j.id = ++this.reqId;
        this.worker.postMessage({ type: 'cell', id: j.id, ci: j.ci, cj: j.cj, near: true });
        j.stage = 'wait';
        return;
      }
      if (j.stage === 'wait') return;
      if (j.stage === 'meshes') {  // arrays from the worker -> meshes (quick), then upload as usual
        if (!j.group) { j.group = new THREE.Group(); j.n = 0; j.L = { type: j.msg.cellType }; j.r = j.msg.r; }
        const ps = j.msg.pieces;
        while (j.n < ps.length) {
          j.group.add(R.Batch.fromArrays(ps[j.n++], this.maps));
          if (performance.now() > deadline) return;
        }
        j.stage = 2;
      }
      if (j.stage === 0) {         // lay the block out (cheap: the geometry work is queued)
        j.L = layout(j.ci, j.cj);
        j.r = nearCell(j.ci, j.cj, R.rng(seedOf(j.ci, j.cj)), j.L);
        j.group = new THREE.Group();
        j.stage = 1;
      }
      if (j.stage === 1) {         // build and merge the meshes, a slice per frame
        if (!j.r.b.buildStep(j.group, undefined, deadline)) return;
        j.stage = 2;
        return;
      }
      if (j.stage === 2) {         // send it to the graphics card while it is still hidden, a piece per frame
        if (j.up === undefined) { this.addHalos(j.group, j.r.lamps); j.parts = j.group.children.slice(); j.up = 0; }
        while (j.up < j.parts.length) {
          this.upload(j.parts[j.up++]);
          if (performance.now() > deadline) return;
        }
        j.stage = 3;
      }
      // swap it in for the simple block
      const old = this.cells.get(j.k);
      if (old) this.drop(j.k, old);
      this.add(j.k, j.ci, j.cj, true, j.L, j.r, j.group);
      this.job = null;
    }
    cancelJob() {
      const j = this.job;
      if (j.group) j.group.traverse(o => { if (o.isMesh || o.isPoints) o.geometry.dispose(); });
      this.job = null;
    }
    // draw a new mesh once into a 1x1 target with a plain material: this uploads its buffers
    upload(obj) {
      const r = this.renderer;
      if (!r) return;
      if (!this.warm) {
        const sc = new THREE.Scene();
        sc.overrideMaterial = new THREE.MeshBasicMaterial();
        this.warm = { sc, rt: new THREE.WebGLRenderTarget(1, 1), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
      }
      const w = this.warm, parent = obj.parent;
      obj.frustumCulled = false;
      w.sc.add(obj);
      const prev = r.getRenderTarget();
      r.setRenderTarget(w.rt); r.render(w.sc, w.cam); r.setRenderTarget(prev);
      w.sc.remove(obj);
      if (parent) parent.add(obj);
      obj.frustumCulled = true;
    }

    build(ci, cj, near) {
      const k = this.key(ci, cj), old = this.cells.get(k);
      if (old) this.drop(k, old);
      const rnd = R.rng(seedOf(ci, cj)), L = layout(ci, cj);
      const r = near ? nearCell(ci, cj, rnd, L) : farCell(ci, cj, rnd, L);
      const group = new THREE.Group();
      r.b.build(group);
      if (near) this.addHalos(group, r.lamps);
      this.add(k, ci, cj, near, L, r, group);
    }
    addHalos(group, lamps) {
      if (!lamps.length) return;
      const pos = [];
      for (const l of lamps) pos.push(l.x, l.y, l.z);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const halos = new THREE.Points(g, R.mat('halo'));
      halos.renderOrder = 4;
      group.add(halos);
    }
    add(k, ci, cj, near, L, r, group) {
      this.scene.add(group);
      this.cells.set(k, { ci, cj, near, type: L.type, group, obstacles: r.obs, lamps: r.lamps, arcs: r.arcs || [], rings: r.rings || [], wires: r.wires || [] });
    }
    drop(k, c) {
      this.scene.remove(c.group);
      c.group.traverse(o => { if (o.isMesh || o.isPoints) o.geometry.dispose(); });
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
      for (const o of this.dynamic) {
        if (Math.abs(o.x - x) < range + o.hx && Math.abs(o.z - z) < range + o.hz) out.push(o);
      }
      return out;
    }
    // height of whatever is under (x, z) that something at height y can stand on
    groundAt(x, z, y) {
      let g = 0;
      for (const o of this.obstaclesNear(x, z, 0.2)) {
        if (NOSTAND[o.kind]) continue;
        if (Math.abs(x - o.x) > o.hx + 0.15 || Math.abs(z - o.z) > o.hz + 0.15) continue;
        if (o.r && Math.hypot(x - o.x, z - o.z) > o.r + 0.15) continue;
        const t = topAt(o, x, z);
        // on a ramp the dog may lag a little behind the slope at full speed: it still counts as on it
        if (t <= y + (o.ramp ? 0.9 : STEP) && t > g) { g = t; this.lastGround = o; }
      }
      if (g === 0) this.lastGround = null;
      return g;
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
        if (o.h > 1.5 && Math.abs(o.x - x) < o.hx + r && Math.abs(o.z - z) < o.hz + r && (!o.r || Math.hypot(o.x - x, o.z - z) < o.r + r)) return true;
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
    resolve(p, r, skip) {
      let hit = null;
      for (const o of this.obstaclesNear(p.x, p.z, r + 0.2)) {
        if (skip && skip[o.kind]) continue;
        if (o.low !== undefined && p.y + (p.bodyH || 1) <= o.low) continue;     // low enough to pass under (a barrier)
        let cx = R.clamp(p.x, o.x - o.hx, o.x + o.hx), cz = R.clamp(p.z, o.z - o.hz, o.z + o.hz);
        if (o.r) {
          // round obstacle: the closest point on the circle
          const ddx = p.x - o.x, ddz = p.z - o.z, dd = Math.hypot(ddx, ddz) || 1;
          if (dd <= o.r) { cx = p.x; cz = p.z; } else { cx = o.x + ddx / dd * o.r; cz = o.z + ddz / dd * o.r; }
          if (dd < o.r) {
            // inside the circle: push straight out through the rim
            if (NOSTAND[o.kind] ? p.y > o.h - 0.15 : p.y > o.h - STEP) continue;
            const nx = ddx / dd, nz = ddz / dd;
            p.x = o.x + nx * (o.r + r); p.z = o.z + nz * (o.r + r);
            hit = { nx, nz, h: o.h, kind: o.kind, ox: o.x, oz: o.z };
            continue;
          }
        }
        if (NOSTAND[o.kind] ? p.y > o.h - 0.15 : p.y > topAt(o, cx, cz) - (o.ramp ? 0.9 : (p.stepUp || STEP))) continue;
        let dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-5) { dx = p.x - o.x; dz = p.z - o.z; d = Math.hypot(dx, dz) || 1; }
        const nx = dx / d, nz = dz / d;
        p.x = cx + nx * r; p.z = cz + nz * r;
        hit = { nx, nz, h: o.h, kind: o.kind, ox: o.x, oz: o.z };
      }
      return hit;
    }
  }

  World.isOpen = isOpen;
  World.yard = yardWorld();
  R.World = World;
  R.worldGen = { nearCell, farCell, layout, seedOf };
})(window.R = window.R || {});
