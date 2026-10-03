(function (R) {
  const C = R.C;
  const P = C.P, B = C.B, HB = B / 2, SW = C.SW, HP = P / 2;
  const PADH = HB + SW;               // half size of the sidewalk pad
  const A = R.assets;
  const rad = d => d * Math.PI / 180;

  const COL = {
    asphalt: [0.20, 0.21, 0.24], sidewalk: [0.56, 0.54, 0.51], curb: [0.74, 0.72, 0.68],
    paint: [0.9, 0.88, 0.78], grass: [0.27, 0.5, 0.2], grass2: [0.34, 0.58, 0.25],
    paving: [0.68, 0.62, 0.54], path: [0.74, 0.68, 0.56], fill: [0.3, 0.27, 0.26],
    pole: [0.27, 0.29, 0.33], globe: [1.0, 0.92, 0.65],
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

  function cellType(ci, cj, rnd) {
    if (ci === 0 && cj === 0) return 'city';
    if (ci === 1 && cj === 0) return 'park';
    const h = rnd();
    return h < 0.64 ? 'city' : h < 0.86 ? 'park' : h < 0.95 ? 'plaza' : 'city';
  }

  // layout of the ring of buildings around a block (shared by near and far versions)
  function ringPlan(rnd) {
    const out = [], s = 5.8, L = B - 2 * s, slotW = L / 3;
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      const key = rnd() < 0.5 ? 'pizza_corner' : 'building_red_corner';
      const yaw = rad(CORNER_YAW[key][(sx > 0 ? 'p' : 'm') + (sz > 0 ? 'p' : 'm')]);
      out.push({ key, x: sx * (HB - s / 2), z: sz * (HB - s / 2), yaw, w: s, sy: 0.9 + rnd() * 0.3, corner: true });
    }
    for (const side of SIDES) {
      const r = rnd();
      const pattern = r < 0.45 ? ['s', 's', 's'] : r < 0.72 ? ['B', 's'] : ['s', 'B'];
      let pos = -L / 2;
      for (const kind of pattern) {
        const w = kind === 'B' ? slotW * 2 : slotW;
        const key = kind === 'B' ? 'big_building' : FACADES[Math.floor(rnd() * FACADES.length)];
        const sy = kind === 'B' ? 0.85 + rnd() * 0.25 : 0.85 + rnd() * 0.5;
        out.push({ key, side, t: pos + w / 2, w, sy, yaw: side.yaw, tint: Math.floor(rnd() * FAR_TINT.length) });
        pos += w;
      }
    }
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

  function lamp(b, obs, lamps, x, z, towardX, towardZ) {
    b.cyl(COL.pole, x, 2.5, z, 0.07, 0.1, 5, 6);
    b.box(COL.pole, x + towardX * 0.45, 5.0, z + towardZ * 0.45, towardX ? 0.9 : 0.07, 0.07, towardZ ? 0.9 : 0.07);
    b.sph(COL.globe, x + towardX * 0.9, 4.9, z + towardZ * 0.9, 0.3, 'glass');
    b.poolDecal(x + towardX * 2.2, z + towardZ * 2.2, 11);
    obs.push({ x, z, hx: 0.15, hz: 0.15, h: 5, kind: 'pole' });
    lamps.push({ x: x + towardX * 0.9, y: 4.9, z: z + towardZ * 0.9 });
  }

  function addObs(obs, fp, kind, minH) {
    if (fp && fp.h > (minH || 0.3)) { fp.kind = kind || 'prop'; obs.push(fp); }
  }

  function groundBase(b, ox, oz, padCol) {
    b.rect(COL.asphalt, ox, oz, P, P, 0);
    b.rect(padCol || COL.sidewalk, ox, oz, 2 * PADH, 2 * PADH, 0.03);
    for (const s of SIDES) {
      const [cx, cz] = pt(s, 0, PADH);
      b.box(COL.curb, ox + cx, 0.09, oz + cz, s.nz ? 2 * PADH : 0.28, 0.18, s.nx ? 2 * PADH : 0.28);
    }
    // centre lines and zebra crossings (drawn on this cell's half of each street)
    const seg = HP - C.ROAD / 2 - 4, zc = HP - C.ROAD / 2 - 2;
    for (let t = -seg; t < seg; t += 6) {
      b.box(COL.paint, ox + HP, 0.02, oz + t + 1.5, 0.16, 0.02, 3);
      b.box(COL.paint, ox + t + 1.5, 0.02, oz + HP, 3, 0.02, 0.16);
    }
    for (let k = 0; k < 3; k++) {
      const off = HP - 5.1 + k * 1.8;
      for (const s of [1, -1]) for (const q of [1, -1]) {
        b.box(COL.paint, ox + s * off, 0.02, oz + q * zc, 0.9, 0.02, 3);
        b.box(COL.paint, ox + q * zc, 0.02, oz + s * off, 3, 0.02, 0.9);
      }
    }
  }
  function farCell(ci, cj, rnd, type) {
    const ox = ci * P, oz = cj * P, b = new R.Batch(), obs = [];
    groundBase(b, ox, oz, type === 'plaza' ? COL.paving : COL.sidewalk);
    if (type === 'city') {
      b.box(COL.fill, ox, 5, oz, B - 12, 10, B - 12);
      for (const it of ringPlan(rnd)) {
        const pl = planPlace(it);
        if (!pl) continue;
        const w = it.w, tint = FAR_TINT[(it.tint || 0) % FAR_TINT.length];
        const turned = Math.abs(Math.sin(it.yaw)) > 0.7;
        b.facadeBox(tint, ox + pl.x, pl.h / 2, oz + pl.z, turned ? pl.d : w, pl.h, turned ? w : pl.d);
      }
      obs.push({ x: ox, z: oz, hx: HB, hz: HB, h: 99, kind: 'wall' });
    } else {
      b.rect(type === 'park' ? COL.grass : COL.paving, ox, oz, B, B, 0.05);
      if (type === 'park') for (let i = 0; i < 8; i++) {
        const x = (rnd() - 0.5) * (B - 6), z = (rnd() - 0.5) * (B - 6);
        b.cone([0.2, 0.42, 0.18], ox + x, 3.5, oz + z, 1.9, 6);
        b.cyl([0.35, 0.24, 0.15], ox + x, 0.8, oz + z, 0.15, 0.2, 1.6, 5);
      }
    }
    return { b, obs, lamps: [] };
  }

  function nearCell(ci, cj, rnd, type) {
    const ox = ci * P, oz = cj * P, b = new R.Batch(), obs = [], lamps = [];
    groundBase(b, ox, oz, type === 'plaza' ? COL.paving : COL.sidewalk);
    const place = (key, x, z, yaw, s, sy, y) => A.place(b, key, ox + x, oz + z, yaw, s, sy, y);
    const solid = (fp, kind, minH) => addObs(obs, fp, kind, minH);
    const rr = (a, c) => a + rnd() * (c - a);
    const pick = arr => arr[Math.floor(rnd() * arr.length)];

    // lamps and trees along the curb of every cell
    const lampT = [-11, 11];
    for (const side of SIDES) {
      for (const t of lampT) {
        const [x, z] = pt(side, t, PADH - 0.45);
        const l = [];
        lamp(b, l, lamps, ox + x, oz + z, -side.nx, -side.nz);
        obs.push(...l);
      }
      for (let t = -HB + 4; t < HB - 3; t += 8 + rnd() * 4) {
        if (Math.abs(Math.abs(t) - 11) < 3 || rnd() < 0.3) continue;
        const [x, z] = pt(side, t, PADH - 1.0);
        const fp = place('tree', x, z, rnd() * 6.28, rr(0.85, 1.2));
        if (fp) obs.push({ x: ox + x, z: oz + z, hx: 0.3, hz: 0.3, h: 7, kind: 'tree' });
      }
    }
    // traffic lights at the corners of the pad
    if (A.has('traffic_light')) {
      const w = A.dims('traffic_light').w;
      for (const sx of [1, -1]) for (const sz of [1, -1]) {
        const px = sx * (PADH - 0.6), pz = sz * (PADH - 0.6);
        place('traffic_light', px + sx * w / 2, pz, sx > 0 ? Math.PI : 0);
        obs.push({ x: ox + px, z: oz + pz, hx: 0.22, hz: 0.22, h: 6, kind: 'pole' });
      }
    }

    // parked cars + obstacles on the road
    const cars = ['car', 'car_b', 'suv', 'police_car', 'sports_car', 'pickup_truck', 'van', 'motorcycle'];
    for (const side of SIDES) {
      for (const t0 of [-14, 0, 14]) {
        if (rnd() < 0.5) continue;
        const t = t0 + rr(-3, 3);
        const key = rnd() < 0.08 ? 'bus' : pick(cars);
        const [x, z] = pt(side, t, PADH + 1.7);
        const along = side.nz ? 1 : 0;
        const yaw = (along ? rad(90) : 0) + (rnd() < 0.5 ? 0 : Math.PI);
        solid(place(key, x, z, yaw, 1), 'car', 0.5);
      }
      const n = 1 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        const t = rr(-HB + 5, HB - 5), off = PADH + rr(3.4, 5.2);
        const [x, z] = pt(side, t, off);
        if (Math.abs(ox + x - HP) < 8 && Math.abs(oz + z) < 24 && ci === 0 && cj === 0) continue;
        const k = pick(['cone', 'cone', 'box', 'trash_can', 'dumpster', 'planter_bushes', 'fence_piece', 'trash_bag']);
        if (k === 'cone') {
          for (let c = 0; c < 3; c++) solid(place('cone', x + (side.nz ? c * 1.0 : 0), z + (side.nz ? 0 : c * 1.0), 0, 1), 'cone');
        } else solid(place(k, x, z, rad(90) * Math.floor(rnd() * 4), 1), k);
      }
    }
    for (let i = 0; i < 3; i++) {
      const side = pick(SIDES), [x, z] = pt(side, rr(-HB, HB), PADH + rr(2, 5));
      place(rnd() < 0.5 ? 'manhole_cover' : 'debris_papers', x, z, rnd() * 6.28, 1, 1, 0.03);
    }

    if (type === 'city') {
      b.box(COL.fill, ox, 5, oz, B - 12, 10, B - 12);
      obs.push({ x: ox, z: oz, hx: HB, hz: HB, h: 99, kind: 'wall' });
      for (const it of ringPlan(rnd)) {
        const pl = planPlace(it);
        if (pl) A.place(b, it.key, ox + pl.x, oz + pl.z, it.yaw, it.w, pl.sy);
        else {
          // model missing: plain block instead
          const tint = FAR_TINT[(it.tint || 0) % FAR_TINT.length];
          const [x, z] = it.corner ? [it.x, it.z] : pt(it.side, it.t, HB - 3);
          b.box(tint, ox + x, 7, oz + z, 9, 14, 6);
        }
      }
      // furniture in front of the buildings
      for (const side of SIDES) {
        for (let t = -HB + 6; t < HB - 5; t += rr(6, 10)) {
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
        const [hx, hz] = pt(side, rr(-14, 14), PADH - 0.6);
        solid(place('fire_hydrant', hx, hz, 0, 1), 'prop');
      }
      if (rnd() < 0.5) {
        const side = pick(SIDES), [x, z] = pt(side, rr(-6, 6), PADH - 1.8);
        solid(place('bus_stop', x, z, side.yaw, 1), 'prop');
      }
    } else if (type === 'park') {
      b.rect(COL.grass, ox, oz, B, B, 0.05);
      b.rect(COL.grass2, ox, oz, B - 8, B - 8, 0.06);
      b.rect(COL.path, ox, oz, B, 3.2, 0.08);
      b.rect(COL.path, ox, oz, 3.2, B, 0.08);
      b.rect(COL.path, ox, oz, 9, 9, 0.09);
      const spots = [];
      const free = (x, z, d) => spots.every(s => Math.hypot(s[0] - x, s[1] - z) > d);
      for (let tries = 0; tries < 60 && spots.length < 15; tries++) {
        const x = rr(-HB + 3, HB - 3), z = rr(-HB + 3, HB - 3);
        if (Math.abs(x) < 3.6 || Math.abs(z) < 3.6 || !free(x, z, 6)) continue;
        spots.push([x, z]);
        place('tree', x, z, rnd() * 6.28, rr(0.9, 1.3));
        obs.push({ x: ox + x, z: oz + z, hx: 0.32, hz: 0.32, h: 8, kind: 'tree' });
      }
      for (const [bx, bz, yaw] of [[5, 2.8, 0], [-5, -2.8, Math.PI], [2.8, -6, rad(90)], [-2.8, 7, rad(270)], [12, 2.8, 0], [-12, -2.8, Math.PI]]) {
        solid(place('bench', bx, bz, yaw, 1), 'prop');
      }
      for (const [x, z] of [[7, 5], [-7, -5], [5, -9], [-9, 5]]) solid(place('planter_bushes', x, z, rad(90) * Math.floor(rnd() * 4), 1), 'prop');
      for (const [x, z] of [[4, 4], [-4, -4], [4, -4], [-4, 4]]) lamp(b, obs, lamps, ox + x, oz + z, -Math.sign(x), 0);
      solid(place('fire_hydrant', 3, 14, 0, 1), 'prop');
      solid(place('trash_can', 3.5, 8, 0, 1), 'prop');
      solid(place('trash_can', -3.5, -8, 0, 1), 'prop');
    } else {
      b.rect(COL.paving, ox, oz, B, B, 0.05);
      b.rect([0.6, 0.55, 0.48], ox, oz, B - 6, B - 6, 0.06);
      for (let i = 0; i < 9; i++) solid(place('cone', -16 + i * 4, (i % 2 ? 1.4 : -1.4), 0, 1), 'cone');
      for (let i = 0; i < 7; i++) solid(place('cone', 10 + (i % 2 ? 1.4 : -1.4), -18 + i * 5, 0, 1), 'cone');
      for (const [x, z] of [[-14, -14], [14, 14], [-14, 14], [14, -14]]) {
        solid(place('planter_bushes', x, z, 0, 1.2), 'prop');
        place('tree', x + 3, z + 3, rnd() * 6, 1);
        obs.push({ x: ox + x + 3, z: oz + z + 3, hx: 0.3, hz: 0.3, h: 8, kind: 'tree' });
      }
      for (let i = 0; i < 4; i++) solid(place('box', -4 + i * 2.2, 8, 0, 1), 'box');
      solid(place('box', -2.9, 8, 0, 1, 1, 0.85), 'box');
      for (const [x, z, yaw] of [[0, 17, Math.PI], [0, -17, 0], [17, 0, rad(90) + Math.PI]]) solid(place('bench', x, z, yaw, 1), 'prop');
      for (let i = 0; i < 5; i++) solid(place('fence_piece', 6 + i * 1.3, -8, 0, 1), 'fence');
    }
    return { b, obs, lamps };
  }

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
      const seed = ((ci * 73856093) ^ (cj * 19349663)) >>> 0;
      const rnd = R.rng(seed), type = cellType(ci, cj, rnd);
      const r = near ? nearCell(ci, cj, rnd, type) : farCell(ci, cj, rnd, type);
      const group = new THREE.Group();
      r.b.build(group);
      this.scene.add(group);
      this.cells.set(k, { ci, cj, near, type, group, obstacles: r.obs, lamps: r.lamps });
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
