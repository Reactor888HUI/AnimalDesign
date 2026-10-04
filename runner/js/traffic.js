(function (R) {
  const C = R.C, P = C.P, RH = C.ROAD / 2;
  const E = RH + 2.5;   // where a lane starts/ends before an intersection centre
  const LANE = 3;       // lane centre, metres right of the street centre line
  const DIRS = [{ x: 0, z: -1 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }];
  const right = d => ({ x: -d.z, z: d.x });
  const KEYS = ['car', 'car', 'car_b', 'suv', 'police_car', 'sports_car', 'pickup_truck', 'van', 'van', 'bus'];

  const I = (a, b) => ({ x: (a + 0.5) * P, z: (b + 0.5) * P });
  // is the street leaving intersection (a, b) in direction di a pedestrian zone?
  function isPed(a, b, di) {
    const open = R.World.isOpen;
    if (di === 0) return open(a, b) && open(a + 1, b);
    if (di === 2) return open(a, b + 1) && open(a + 1, b + 1);
    if (di === 1) return open(a + 1, b) && open(a + 1, b + 1);
    return open(a, b) && open(a, b + 1);
  }
  function seg(p0, c, p1) {
    const l = (Math.hypot(c.x - p0.x, c.z - p0.z) + Math.hypot(p1.x - c.x, p1.z - c.z) + Math.hypot(p1.x - p0.x, p1.z - p0.z)) / 2;
    return { p0, c, p1, len: Math.max(l, 0.1) };
  }
  function straight(a, b, di) {
    const A = I(a, b), d = DIRS[di], r = right(d);
    const p0 = { x: A.x + d.x * E + r.x * LANE, z: A.z + d.z * E + r.z * LANE };
    const p1 = { x: A.x + d.x * (P - E) + r.x * LANE, z: A.z + d.z * (P - E) + r.z * LANE };
    return seg(p0, { x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2 }, p1);
  }
  function turn(a, b, di, d2i) {
    const B = I(a, b), d = DIRS[di], d2 = DIRS[d2i], r = right(d), r2 = right(d2);
    const p0 = { x: B.x - d.x * E + r.x * LANE, z: B.z - d.z * E + r.z * LANE };
    const p1 = { x: B.x + d2.x * E + r2.x * LANE, z: B.z + d2.z * E + r2.z * LANE };
    let c;
    if (d2i === di) c = { x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2 };
    else if (d2i === (di + 2) % 4) c = { x: B.x + d.x * 3, z: B.z + d.z * 3 };
    else c = { x: B.x + (r.x + r2.x) * LANE, z: B.z + (r.z + r2.z) * LANE };
    return seg(p0, c, p1);
  }
  function at(s, t, out) {
    const u = 1 - t;
    out.x = u * u * s.p0.x + 2 * u * t * s.c.x + t * t * s.p1.x;
    out.z = u * u * s.p0.z + 2 * u * t * s.c.z + t * t * s.p1.z;
    out.tx = 2 * u * (s.c.x - s.p0.x) + 2 * t * (s.p1.x - s.c.x);
    out.tz = 2 * u * (s.c.z - s.p0.z) + 2 * t * (s.p1.z - s.c.z);
    const l = Math.hypot(out.tx, out.tz) || 1; out.tx /= l; out.tz /= l;
    return out;
  }

  class Traffic {
    constructor(scene, world, n) {
      this.world = world; this.cars = []; this.onHorn = null;
      for (let i = 0; i < n; i++) {
        const key = KEYS[i % KEYS.length], o = R.assets.object(key);
        if (!o) continue;
        scene.add(o.group);
        const car = { o, w: o.dims.w, l: o.dims.d, a: 0, b: 0, di: 0, mode: 'straight', s: null, t: 0, speed: 0,
          max: key === 'bus' ? 8 : 9 + Math.random() * 4, pos: { x: 0, z: 0, tx: 0, tz: -1 }, blocked: 0, hornCd: 0,
          obs: { x: 0, z: 0, hx: 1, hz: 1, h: 1.5, kind: 'traffic' } };
        this.cars.push(car);
      }
      this.placed = false;
    }

    spawn(car, px, pz, minD, maxD) {
      const a0 = Math.floor(px / P - 0.5), b0 = Math.floor(pz / P - 0.5);
      for (let tries = 0; tries < 40; tries++) {
        const a = a0 + Math.floor(Math.random() * 7) - 3, b = b0 + Math.floor(Math.random() * 7) - 3;
        const di = Math.floor(Math.random() * 4);
        if (isPed(a, b, di)) continue;
        const s = straight(a, b, di), t = Math.random();
        at(s, t, car.pos);
        const d = Math.hypot(car.pos.x - px, car.pos.z - pz);
        if (d < minD || d > maxD) continue;
        const nd = DIRS[di];
        Object.assign(car, { a: a + nd.x, b: b + nd.z, di, mode: 'straight', s, t, speed: car.max * 0.7 });
        return true;
      }
      return false;
    }

    next(car) {
      if (car.mode === 'straight') {
        const opts = [];
        const add = (di, w) => { if (!isPed(car.a, car.b, di)) opts.push([di, w]); };
        add(car.di, 0.6); add((car.di + 1) % 4, 0.2); add((car.di + 3) % 4, 0.2);
        let d2 = (car.di + 2) % 4;
        if (opts.length) {
          let r = Math.random() * opts.reduce((s, o) => s + o[1], 0);
          for (const [di, w] of opts) { if ((r -= w) <= 0) { d2 = di; break; } }
        }
        car.s = turn(car.a, car.b, car.di, d2); car.di = d2; car.mode = 'turn';
      } else {
        car.s = straight(car.a, car.b, car.di);
        const d = DIRS[car.di];
        car.a += d.x; car.b += d.z; car.mode = 'straight';
      }
      car.t = 0;
    }

    update(dt, player) {
      if (!this.placed) { for (const c of this.cars) this.spawn(c, player.x, player.z, 25, 150); this.placed = true; }
      const dyn = this.world.dynamic;
      dyn.length = 0;
      let nearest = 1e9, nearestSpeed = 0;
      for (const car of this.cars) {
        const p = car.pos;
        // brake for the dog and for cars ahead
        let target = car.max * (car.mode === 'turn' ? 0.6 : 1);
        const ahead = (x, z, len, side) => {
          const dx = x - p.x, dz = z - p.z, along = dx * p.tx + dz * p.tz, lat = Math.abs(dx * p.tz - dz * p.tx);
          return along > 0 && along < len && lat < side;
        };
        const dogAhead = player.y < 1.6 && ahead(player.x, player.z, 10, 2.3);
        if (dogAhead) target = 0;
        for (const o of this.cars) if (o !== car && ahead(o.pos.x, o.pos.z, car.l / 2 + o.l / 2 + 3, 1.6)) target = Math.min(target, o.speed * 0.8);
        car.speed = R.damp(car.speed, target, target < car.speed ? 5 : 1.2, dt);
        car.blocked = dogAhead && car.speed < 1 ? car.blocked + dt : 0;
        car.hornCd -= dt;
        if (car.blocked > 0.9 && car.hornCd <= 0) { car.hornCd = 4; if (this.onHorn) this.onHorn(p.x, p.z); }

        car.t += car.speed * dt / car.s.len;
        while (car.t >= 1) { const over = (car.t - 1) * car.s.len; this.next(car); car.t = over / car.s.len; }
        at(car.s, car.t, p);
        const g = car.o.group;
        g.position.set(p.x, 0, p.z);
        g.rotation.y = Math.atan2(p.tx, p.tz);

        const ob = car.obs;
        ob.x = p.x; ob.z = p.z;
        ob.hx = Math.abs(p.tx) * car.l / 2 + Math.abs(p.tz) * car.w / 2;
        ob.hz = Math.abs(p.tz) * car.l / 2 + Math.abs(p.tx) * car.w / 2;
        ob.h = car.o.dims.h;
        dyn.push(ob);

        const d = Math.hypot(p.x - player.x, p.z - player.z);
        if (d > 170) this.spawn(car, player.x, player.z, 90, 150);
        if (d < nearest) { nearest = d; nearestSpeed = car.speed; }
      }
      this.nearest = nearest; this.nearestSpeed = nearestSpeed;
    }
  }
  R.Traffic = Traffic;
})(window.R = window.R || {});
