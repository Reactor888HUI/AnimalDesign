(function (R) {
  const C = R.C;
  const SHADOW_CAST = /^(wall|roof|bench|bin|crate|cone|barrier|car|trunk|foliage|pole|rooftop)/;
  const NO_RECEIVE = /^(pool|globe|win|shop)/;
  const TOTAL = C.CHUNK - C.INT; // length of the building zone inside one chunk

  class Batch {
    constructor() { this.g = {}; }
    add(key, geo) { (this.g[key] = this.g[key] || []).push(geo); }
    box(key, cx, cy, cz, sx, sy, sz) {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      g.translate(cx, cy, cz); this.add(key, g);
    }
    plane(key, cx, cy, cz, w, h, rx, ry) {
      const g = new THREE.PlaneGeometry(w, h);
      if (rx) g.rotateX(rx);
      if (ry) g.rotateY(ry);
      g.translate(cx, cy, cz); this.add(key, g);
    }
    cyl(key, cx, cy, cz, rt, rb, h, seg, rz) {
      const g = new THREE.CylinderGeometry(rt, rb, h, seg || 8);
      if (rz) g.rotateZ(rz);
      g.translate(cx, cy, cz); this.add(key, g);
    }
    sph(key, cx, cy, cz, r) {
      const g = new THREE.SphereGeometry(r, 8, 6);
      g.translate(cx, cy, cz); this.add(key, g);
    }
    cone(key, cx, cy, cz, r, h) {
      const g = new THREE.ConeGeometry(r, h, 8);
      g.translate(cx, cy, cz); this.add(key, g);
    }
    build(group) {
      for (const key in this.g) {
        const list = this.g[key];
        const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(list, false);
        list.forEach(g => g.dispose());
        const mesh = new THREE.Mesh(merged, R.mat(key));
        mesh.castShadow = SHADOW_CAST.test(key);
        mesh.receiveShadow = !NO_RECEIVE.test(key);
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
      }
    }
  }

  // grid of windows on a wall; (ox,oz) = start of the wall line, (ux,uz) = direction along it, theta = facing
  function windows(b, rnd, ox, oz, ux, uz, len, theta, h) {
    const n = Math.max(1, Math.floor((len - 1.2) / 2.4));
    const step = len / n;
    const rows = Math.floor((h - 3.4) / 2.6);
    const nx = Math.sin(theta) * 0.03, nz = Math.cos(theta) * 0.03;
    for (let r = 0; r < rows; r++) {
      const y = 4.0 + r * 2.6;
      for (let c = 0; c < n; c++) {
        const t = (c + 0.5) * step;
        const g = new THREE.PlaneGeometry(0.95, 1.35);
        g.rotateY(theta);
        g.translate(ox + ux * t + nx, y, oz + uz * t + nz);
        b.add(rnd() > 0.3 ? 'winLit' : 'winDark', g);
      }
    }
  }

  function buildChunk(i) {
    const rnd = R.rng(i * 7919 + 101);
    const b = new Batch();
    const obstacles = [], lamps = [];
    const zTop = -i * C.CHUNK;
    const Z = lz => zTop - lz;
    const RW = C.ROAD_W, BX = C.BLDG_X, W = C.SIDE_LEN;

    // road, sidewalks, side street, markings
    b.plane('road', 0, 0, Z(C.CHUNK / 2), RW, C.CHUNK, -Math.PI / 2);
    const swLen = BX + W - RW / 2;
    for (const s of [-1, 1]) {
      b.plane('side', s * (RW / 2 + C.CURB_W / 2), 0.004, Z(TOTAL / 2), C.CURB_W, TOTAL, -Math.PI / 2);
      b.box('curb', s * (RW / 2 + 0.05), 0.04, Z(TOTAL / 2), 0.1, 0.08, TOTAL);
      b.plane('road', s * (RW / 2 + swLen / 2), 0.002, Z(TOTAL + C.INT / 2), swLen, C.INT, -Math.PI / 2);
    }
    for (let lz = 1; lz < TOTAL - 3; lz += 6) b.plane('dash', 0, 0.012, Z(lz + 1.5), 0.14, 3, -Math.PI / 2);
    for (const lz0 of [TOTAL + 1.4, C.CHUNK - 1.4]) {
      for (let k = 0; k < 8; k++) b.box('dash', -3.0 + k * 0.86, 0.012, Z(lz0), 0.5, 0.02, 1.3);
    }

    // buildings on both sides
    for (const side of [-1, 1]) {
      const facing = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      let lz = 0;
      while (TOTAL - lz > 5.5) {
        let d = 7 + rnd() * 7;
        if (TOTAL - lz - d < 7) d = TOTAL - lz;
        const h = 5 + rnd() * 14;
        const wi = Math.floor(rnd() * 6), ri = Math.floor(rnd() * 5);
        const cx = side * (BX + W / 2), cz = Z(lz + d / 2);
        b.box('wall' + wi, cx, h / 2, cz, W, h, d);
        b.box('roof' + ri, cx, h + 0.2, cz, W + 0.3, 0.4, d + 0.3);
        if (rnd() < 0.6) b.box('rooftop', side * (BX + 1.6), h + 1.0, cz + (rnd() - 0.5) * d * 0.5, 1.8, 1.2, 1.6);
        if (rnd() < 0.5) b.cyl('rooftop', side * (BX + 4), h + 1.5, cz + (rnd() - 0.5) * d * 0.5, 0.05, 0.05, 2.2, 5);

        windows(b, rnd, side * BX, Z(lz), 0, -1, d, facing, h);
        if (lz === 0) windows(b, rnd, side * BX, Z(0), side, 0, W, 0, h);
        if (lz + d >= TOTAL - 0.01) windows(b, rnd, side * BX, Z(TOTAL), side, 0, W, Math.PI, h);

        if (d > 8) {
          for (const f of [0.27, 0.73]) {
            const k = Math.floor(rnd() * 3);
            const zz = Z(lz + d * f);
            const g = new THREE.PlaneGeometry(3.2, 2.1);
            g.rotateY(facing);
            g.translate(side * BX - side * 0.03, 1.35, zz);
            b.add('shop' + k, g);
            b.box('awn' + k, side * (BX - 0.5), 2.75, zz, 1.0, 0.16, 3.7);
          }
        }
        lz += d;
      }
      // dead end of the side street
      const hd = 6 + rnd() * 6;
      b.box('wall' + Math.floor(rnd() * 6), side * (BX + W + 3), hd / 2, Z(TOTAL + C.INT / 2), 6, hd, C.INT);
      windows(b, rnd, side * (BX + W), Z(TOTAL), 0, -1, C.INT, facing, hd);
    }

    // street lamps (every 15 m, alternating sides)
    for (let k = 0; k < 3; k++) {
      const lz = 5 + k * 15;
      const side = ((i * 3 + k) & 1) ? 1 : -1;
      const x = side * (RW / 2 + 0.35), z = Z(lz);
      b.cyl('pole', x, 2.3, z, 0.07, 0.1, 4.6, 6);
      b.box('pole', x - side * 0.3, 4.55, z, 0.6, 0.07, 0.07);
      b.sph('globe', x - side * 0.6, 4.5, z, 0.27);
      b.plane('pool', x - side * 2.2, 0.03, z, 9, 9, -Math.PI / 2);
      lamps.push({ x: x - side * 0.6, y: 4.5, z });
    }

    // sidewalk trees (solid)
    for (const lz of [12, 28]) {
      for (const side of [-1, 1]) {
        if (rnd() > 0.55) continue;
        const x = side * (RW / 2 + C.CURB_W * 0.55), z = Z(lz + (rnd() - 0.5) * 3);
        b.cyl('trunk', x, 1.1, z, 0.13, 0.19, 2.2, 6);
        b.sph('foliage0', x, 3.3, z, 1.35);
        b.sph('foliage1', x, 4.1, z, 1.0);
        obstacles.push({ x, z, hx: 0.35, hz: 0.35, h: 4, kind: 'tree' });
      }
    }

    // parked cars (one side at most)
    if (rnd() < 0.7) {
      const side = rnd() < 0.5 ? -1 : 1;
      const lz = 9 + rnd() * (TOTAL - 18);
      const x = side * (RW / 2 - 0.95), z = Z(lz), ck = 'car' + Math.floor(rnd() * 3);
      b.box(ck, x, 0.6, z, 1.8, 0.75, 4.2);
      b.box(ck, x, 1.2, z + 0.2, 1.55, 0.55, 2.2);
      b.box('carGlass', x, 1.22, z + 0.2, 1.58, 0.4, 2.0);
      for (const wx of [-0.88, 0.88]) for (const wz of [-1.35, 1.35]) b.cyl('tire', x + wx, 0.33, z + wz, 0.33, 0.33, 0.24, 8, Math.PI / 2);
      obstacles.push({ x, z, hx: 0.95, hz: 2.1, h: 1.45, kind: 'car' });
    }

    // obstacles in the lane
    const count = 3 + Math.floor(rnd() * 3);
    for (let n = 0; n < count; n++) {
      const lz = 6 + rnd() * (TOTAL - 12);
      if (i === 0 && lz < 24) continue; // keep the start clear
      const x = (rnd() - 0.5) * 5.2, z = Z(lz);
      const t = rnd();
      if (t < 0.3) {
        b.cone('cone', x, 0.28, z, 0.3, 0.56);
        obstacles.push({ x, z, hx: 0.28, hz: 0.28, h: 0.56, kind: 'cone' });
      } else if (t < 0.55) {
        b.box('crate', x, 0.45, z, 0.95, 0.9, 0.95);
        obstacles.push({ x, z, hx: 0.5, hz: 0.5, h: 0.9, kind: 'crate' });
      } else if (t < 0.8) {
        b.box('barrier', x, 0.55, z, 2.6, 0.2, 0.28);
        b.box('barrier', x, 0.25, z, 2.6, 0.2, 0.28);
        b.box('pole', x - 1.1, 0.35, z, 0.1, 0.7, 0.1);
        b.box('pole', x + 1.1, 0.35, z, 0.1, 0.7, 0.1);
        obstacles.push({ x, z, hx: 1.3, hz: 0.18, h: 0.75, kind: 'barrier' });
      } else {
        b.cyl('bin', x, 0.5, z, 0.42, 0.36, 1.0, 10);
        obstacles.push({ x, z, hx: 0.4, hz: 0.4, h: 1.0, kind: 'bin' });
      }
    }

    const group = new THREE.Group();
    b.build(group);
    return { idx: i, group, obstacles, lamps };
  }

  class World {
    constructor(scene) {
      this.scene = scene;
      this.chunks = new Map();
    }
    static index(z) { return Math.floor(-z / C.CHUNK); }

    update(z, budget) {
      const c = World.index(z), r = C.CHUNK_RADIUS;
      for (const [i, ch] of this.chunks) {
        if (i < c - r - 1 || i > c + r + 1) this.remove(i, ch);
      }
      let built = 0;
      for (let d = 0; d <= r; d++) {
        for (const i of d === 0 ? [c] : [c - d, c + d]) {
          if (this.chunks.has(i) || built >= budget) continue;
          const ch = buildChunk(i);
          this.chunks.set(i, ch);
          this.scene.add(ch.group);
          built++;
        }
      }
    }
    remove(i, ch) {
      this.scene.remove(ch.group);
      ch.group.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      this.chunks.delete(i);
    }
    near(z, fn) {
      const c = World.index(z);
      for (let i = c - 1; i <= c + 1; i++) {
        const ch = this.chunks.get(i);
        if (ch) fn(ch);
      }
    }
    obstaclesNear(x, z, range) {
      const out = [];
      this.near(z, ch => {
        for (const o of ch.obstacles) {
          if (Math.abs(o.x - x) < range + o.hx && Math.abs(o.z - z) < range + o.hz) out.push(o);
        }
      });
      return out;
    }
    lampsNear(x, z, n) {
      const all = [];
      this.near(z, ch => { for (const l of ch.lamps) all.push(l); });
      all.sort((a, b) => ((a.x - x) ** 2 + (a.z - z) ** 2) - ((b.x - x) ** 2 + (b.z - z) ** 2));
      return all.slice(0, n);
    }
    inIntersection(z) {
      const i = World.index(z);
      return (-z - i * C.CHUNK) >= TOTAL;
    }

    // keep p inside the street and push it out of obstacles; returns the obstacle hit (or null)
    resolve(p, prevX, r) {
      const i = World.index(p.z), lz = -p.z - i * C.CHUNK, zTop = -i * C.CHUNK;
      const ax = Math.abs(p.x), sx = Math.sign(p.x) || 1;
      let bump = false;
      if (lz >= TOTAL) {
        if (ax > C.SIDE_LIMIT) { p.x = sx * C.SIDE_LIMIT; bump = true; }
      } else if (ax > C.MAIN_LIMIT) {
        if (Math.abs(prevX) > C.MAIN_LIMIT + 0.15) {
          p.z = lz < TOTAL / 2 ? zTop + 0.45 : zTop - (TOTAL + 0.45);
        } else {
          p.x = sx * C.MAIN_LIMIT;
        }
        bump = true;
      }
      let hit = bump ? { nx: -sx, nz: 0, h: 99, kind: 'wall' } : null;
      for (const o of this.obstaclesNear(p.x, p.z, r + 0.2)) {
        if (p.y > o.h - 0.15) continue;
        const cx = R.clamp(p.x, o.x - o.hx, o.x + o.hx);
        const cz = R.clamp(p.z, o.z - o.hz, o.z + o.hz);
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
