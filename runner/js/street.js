(function (R) {
  // ===================================================================================================
  //  STREET LIFE — the things that make the city feel alive around the dog:
  //   - pigeons: small flocks peck about on squares and sidewalks; when the dog runs at them the whole
  //     flock bursts up, flaps off to the wires (or away) and comes back a while later. They roost at night.
  //   - leaves: fallen leaves lie round the trees; a running dog kicks them up and they flutter down
  //     again; now and then one falls from a tree.
  //   - pedestrians (runner): a few people walk round the blocks on the sidewalks; they stop and look
  //     when the dog dashes past, and the dog bumps into them like into anything else.
  //  All birds are one instanced mesh (plus two for the wings), all leaves one more: a few draw calls.
  // ===================================================================================================
  const C = R.C, P = C.P, HB = C.B / 2, PADH = HB + C.SW;
  const TAU = Math.PI * 2;
  const clamp = R.clamp;

  // ---- shapes ----------------------------------------------------------------------------------
  function colored(g, col) {
    g = g.index ? g.toNonIndexed() : g;
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    if (g.attributes.uv) g.deleteAttribute('uv');
    return g;
  }
  function join(list) {
    const g = new THREE.BufferGeometry();
    for (const n of ['position', 'color']) g.setAttribute(n, new THREE.Float32BufferAttribute(list.flatMap(x => Array.from(x.attributes[n].array)), 3));
    g.computeVertexNormals();
    return g;
  }
  // a pigeon about 32 cm long, facing -Z; its origin is between the feet
  function pigeonBody() {
    const grey = new THREE.Color(0x8a8f9c), dark = new THREE.Color(0x4d5260), neck = new THREE.Color(0x4e7a6a), beak = new THREE.Color(0x2a2522), leg = new THREE.Color(0xc0605a);
    const part = (geo, col, sc, pos, rx) => { geo.scale(sc[0], sc[1], sc[2]); if (rx) geo.rotateX(rx); geo.translate(pos[0], pos[1], pos[2]); return colored(geo, col); };
    return join([
      part(new THREE.IcosahedronGeometry(0.1, 0), grey, [0.75, 0.7, 1.25], [0, 0.13, 0.01], 0.15),   // body
      part(new THREE.IcosahedronGeometry(0.055, 0), neck, [0.9, 1.1, 1], [0, 0.2, -0.085]),           // neck (green sheen)
      part(new THREE.IcosahedronGeometry(0.045, 0), dark, [0.9, 1, 1.05], [0, 0.245, -0.11]),        // head
      part(new THREE.ConeGeometry(0.012, 0.035, 4), beak, [1, 1, 1], [0, 0.24, -0.16], -Math.PI / 2),  // beak
      part(new THREE.ConeGeometry(0.045, 0.13, 4), dark, [1, 1, 0.45], [0, 0.13, 0.15], Math.PI / 2 + 0.25), // tail
      part(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 3), leg, [1, 1, 1], [0.025, 0.035, 0.01]),
      part(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 3), leg, [1, 1, 1], [-0.025, 0.035, 0.01]),
    ]);
  }
  // one wing (the right one; the left is mirrored by its matrix): pivot at the shoulder
  function pigeonWing() {
    const g = new THREE.BufferGeometry();
    const v = [0, 0, -0.05, 0.2, 0, -0.01, 0.17, 0, 0.06, 0, 0, 0.07];
    g.setAttribute('position', new THREE.Float32BufferAttribute([...v.slice(0, 9), ...v.slice(0, 3), ...v.slice(6, 12)], 3));
    const col = new THREE.Color(0x737886), c = [];
    for (let i = 0; i < 6; i++) c.push(col.r, col.g, col.b);
    // dark wing bars at the tip
    for (const i of [1]) { c[i * 3] = 0.3; c[i * 3 + 1] = 0.31; c[i * 3 + 2] = 0.35; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    g.computeVertexNormals();
    return g;
  }
  function leafGeo() {
    const g = new THREE.BufferGeometry();
    // a small pointed leaf lying flat (two triangles, a little folded along the middle)
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.07, 0.04, 0.008, 0, 0, 0.004, 0.05, 0, 0, -0.07, 0, 0.004, 0.05, -0.04, 0.008, 0], 3));
    g.computeVertexNormals();
    return g;
  }

  const M4 = new THREE.Matrix4(), M5 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3(), CC = new THREE.Color();
  const LEAF_COLS = [0xc9842e, 0xd9a234, 0xa8572a, 0x8f6a2e, 0xb8a43a, 0x7f8f35, 0xc46a2a];

  class StreetLife {
    constructor(scene, world, au) {
      this.scene = scene; this.world = world; this.au = au;
      this.onScare = null;                // (flock) => void: the game may reward scaring a flock
      // pigeons
      this.MAXB = 72;
      const bmat = new THREE.MeshLambertMaterial({ vertexColors: true });
      const wmat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      this.bodies = new THREE.InstancedMesh(pigeonBody(), bmat, this.MAXB);
      this.wings = new THREE.InstancedMesh(pigeonWing(), wmat, this.MAXB * 2);
      for (const m of [this.bodies, this.wings]) { m.count = 0; m.frustumCulled = false; m.castShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
      this.flocks = new Map();            // cell key -> [flock]
      // leaves
      this.MAXL = 420;
      this.leafMesh = new THREE.InstancedMesh(leafGeo(), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), this.MAXL);
      this.leafMesh.count = 0; this.leafMesh.frustumCulled = false; this.leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.leafMesh.renderOrder = 1;
      // colours per leaf (sized for all leaves: setColorAt would size it by the current count, 0)
      this.leafMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.MAXL * 3).fill(1), 3);
      this.leafMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      scene.add(this.leafMesh);
      this.leafSets = new Map();          // cell key -> [leaf]
      this.leafSlots = 0; this.dropT = 1;
      this.t = 0;
    }

    // ---- which cells have life: flocks and leaves are made when a detailed block appears ----
    syncCells(night) {
      const w = this.world, seen = new Set();
      for (const [k, c] of w.cells) {
        if (!c.near) continue;
        seen.add(k);
        if (!this.flocks.has(k)) this.flocks.set(k, this.makeFlocks(c));
        if (!this.leafSets.has(k)) this.leafSets.set(k, this.makeLeaves(c));
      }
      for (const k of [...this.flocks.keys()]) if (!seen.has(k)) this.flocks.delete(k);
      for (const k of [...this.leafSets.keys()]) if (!seen.has(k)) this.leafSets.delete(k);
    }
    makeFlocks(c) {
      if (c.type === 'yard' || c.type === 'garages') return [];
      const rnd = R.rng(R.worldGen.seedOf(c.ci, c.cj) * 7 + 3), ox = c.ci * P, oz = c.cj * P, out = [];
      const n = c.type === 'city' ? 1 : 2;
      for (let f = 0; f < n; f++) {
        let hx = 0, hz = 0, ok = false;
        for (let tries = 0; tries < 20 && !ok; tries++) {
          if (c.type === 'city') {
            // on the sidewalk, between the houses and the trees
            const side = Math.floor(rnd() * 4), t = (rnd() * 2 - 1) * (HB - 6), off = HB + 2.2;
            [hx, hz] = side === 0 ? [t, off] : side === 1 ? [off, t] : side === 2 ? [t, -off] : [-off, t];
          } else { const a = rnd() * TAU, d = 4 + rnd() * 13; hx = Math.cos(a) * d; hz = Math.sin(a) * d; }
          hx += ox; hz += oz;
          ok = !this.world.solidAt(hx, hz, 1.6) && this.world.groundAt(hx, hz, 0.5) < 0.2;
        }
        if (!ok) continue;
        const fl = { hx, hz, birds: [], scared: 0, cd: 0, wires: c.wires || [] };
        const k = 5 + Math.floor(rnd() * 5);
        for (let i = 0; i < k; i++) {
          const a = rnd() * TAU, d = Math.sqrt(rnd()) * 1.8;
          fl.birds.push({ x: hx + Math.cos(a) * d, z: hz + Math.sin(a) * d, y: 0, vx: 0, vy: 0, vz: 0, h: rnd() * TAU, state: 'ground', t: rnd() * 2, flap: rnd() * TAU, bob: rnd() * TAU, tx: 0, ty: 0, tz: 0, delay: 0 });
        }
        out.push(fl);
      }
      return out;
    }
    makeLeaves(c) {
      const rnd = R.rng(R.worldGen.seedOf(c.ci, c.cj) * 13 + 5), out = [];
      const trees = c.obstacles.filter(o => o.kind === 'tree');
      const per = trees.length > 24 ? 6 : 9;
      for (const tr of trees) for (let i = 0; i < per; i++) {
        const a = rnd() * TAU, d = 0.5 + Math.sqrt(rnd()) * 2.4, x = tr.x + Math.cos(a) * d, z = tr.z + Math.sin(a) * d;
        out.push({ x, z, y: 0, h: rnd() * TAU, tilt: 0, vx: 0, vy: 0, vz: 0, spin: 0, air: false, col: LEAF_COLS[Math.floor(rnd() * LEAF_COLS.length)], sc: 1.4 + rnd() * 0.8, tree: tr, ph: rnd() * TAU });
      }
      return out;
    }

    // ---- per frame ----
    update(dt, player, T) {
      this.t += dt;
      const night = T.lampK > 0.6;
      this.syncCells(night);
      this.updatePigeons(dt, player, night);
      this.updateLeaves(dt, player);
      this.updatePeople(dt, player);
    }

    updatePigeons(dt, player, night) {
      const pv = Math.hypot(player.vx || 0, player.vz || 0);
      let n = 0;
      for (const list of this.flocks.values()) for (const fl of list) {
        const fd = Math.hypot(fl.hx - player.x, fl.hz - player.z);
        if (fd > 70) continue;
        fl.cd -= dt;
        // scare: the dog close, or coming fast, or landing near them
        let scare = false;
        for (const b of fl.birds) {
          if (b.state !== 'ground') continue;
          const d = Math.hypot(b.x - player.x, b.z - player.z);
          if (d < 3.2 || (d < 9 && pv > 7) || (d < 6 && player.air && player.vy < -3)) { scare = true; break; }
        }
        if (scare) this.scare(fl, player);
        if (fl.scared > 0) {
          fl.scared -= dt;
          // back home when the dog is gone
          if (fl.scared <= 0) {
            if (fd > 14) for (const b of fl.birds) { const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * 1.8; b.state = 'return'; b.tx = fl.hx + Math.cos(a) * d; b.tz = fl.hz + Math.sin(a) * d; b.ty = 0; }
            else fl.scared = 3;
          }
        }
        for (const b of fl.birds) {
          this.stepBird(b, dt);
          if (night && b.state === 'ground') continue;      // roosting at night
          if (n < this.MAXB) this.drawBird(b, n++);
        }
      }
      this.bodies.count = n; this.wings.count = n * 2;
      this.bodies.instanceMatrix.needsUpdate = true; this.wings.instanceMatrix.needsUpdate = true;
    }
    scare(fl, player) {
      if (fl.cd > 0) return;
      fl.cd = 4; fl.scared = 14 + Math.random() * 8;
      const perch = fl.wires.length ? fl.wires[Math.floor(Math.random() * fl.wires.length)] : null;
      for (const b of fl.birds) {
        const ax = b.x - player.x, az = b.z - player.z, al = Math.hypot(ax, az) || 1;
        b.state = 'up'; b.delay = Math.random() * 0.25;
        b.vx = ax / al * 3 + (Math.random() - 0.5) * 2; b.vz = az / al * 3 + (Math.random() - 0.5) * 2; b.vy = 4 + Math.random() * 2;
        if (perch) {
          // a spot on the wire (its sag)
          const t = 0.15 + Math.random() * 0.7, s = perch.sag * 4 * t * (1 - t);
          b.tx = perch.a[0] + (perch.b[0] - perch.a[0]) * t; b.tz = perch.a[2] + (perch.b[2] - perch.a[2]) * t; b.ty = perch.a[1] + (perch.b[1] - perch.a[1]) * t - s + 0.02;
        } else { const a = Math.atan2(az, ax) + (Math.random() - 0.5); b.tx = b.x + Math.cos(a) * 22; b.tz = b.z + Math.sin(a) * 22; b.ty = 0; }
      }
      if (this.au && this.au.flutter) this.au.flutter(Math.max(0, 1 - Math.hypot(fl.hx - player.x, fl.hz - player.z) / 25));
      if (this.onScare) this.onScare(fl);
    }
    stepBird(b, dt) {
      if (b.state === 'ground') {
        // peck about: short walks, the head bobs
        b.t -= dt; b.bob += dt * 9;
        if (b.t <= 0) { b.t = 0.6 + Math.random() * 2.2; b.h += (Math.random() - 0.5) * 2.5; b.walk = Math.random() < 0.6 ? 0.5 + Math.random() * 0.5 : 0; }
        if (b.walk) { b.walk -= dt; b.x -= Math.sin(b.h) * 0.35 * dt; b.z -= Math.cos(b.h) * 0.35 * dt; }
        b.y = 0; return;
      }
      if (b.state === 'perch') { b.y = b.ty; b.flap = 0; return; }
      if (b.delay > 0) { b.delay -= dt; return; }
      b.flap += dt * (b.vy > -0.5 ? 26 : 14);
      // fly to the target: up first, then on; slow down near it
      const dx = b.tx - b.x, dy = b.ty - b.y, dz = b.tz - b.z, d = Math.hypot(dx, dz), d3 = Math.hypot(dx, dy, dz);
      const cruise = b.ty + Math.min(3, d * 0.3) + (b.ty > 0.5 ? 0 : Math.min(0.5, d * 0.5));
      const sp = Math.min(7.5, 1.5 + d3 * 1.2);
      const wx = d > 0.01 ? dx / d * sp : 0, wz = d > 0.01 ? dz / d * sp : 0, wy = clamp((cruise - b.y) * 2.2, -4, 5);
      const k = 1 - Math.exp(-2.5 * dt);
      b.vx += (wx - b.vx) * k; b.vz += (wz - b.vz) * k; b.vy += (wy - b.vy) * k;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (Math.hypot(b.vx, b.vz) > 0.3) b.h = Math.atan2(-b.vx, -b.vz);
      if (d3 < 0.35) {
        b.x = b.tx; b.y = b.ty; b.z = b.tz; b.vx = b.vy = b.vz = 0;
        b.state = b.ty > 0.5 ? 'perch' : 'ground'; b.t = 1;
        if (b.state === 'perch') b.h += Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1);   // sit across the wire
      }
      if (b.y < 0) b.y = 0;
    }
    drawBird(b, i) {
      const flying = b.state !== 'ground' && b.state !== 'perch' && b.delay <= 0;
      const peck = !flying && b.state === 'ground' && !b.walk ? Math.max(0, Math.sin(b.bob)) * 0.35 : 0;
      const pitch = flying ? clamp(-b.vy * 0.06, -0.35, 0.35) : peck;
      E.set(pitch, b.h, 0, 'YXZ'); Q.setFromEuler(E);
      M4.compose(V.set(b.x, b.y, b.z), Q, S.set(1, 1, 1));
      this.bodies.setMatrixAt(i, M4);
      // wings: folded along the body on the ground, flapping in the air
      const fold = flying ? 0.25 + Math.sin(b.flap) * 0.95 : -1.35;
      for (const side of [1, -1]) {
        E.set(0, 0, side * fold); Q.setFromEuler(E);
        M5.compose(V.set(side * 0.045, 0.16, 0), Q, S.set(side * (flying ? 1 : 0.7), 1, flying ? 1 : 1.3));
        M5.premultiply(M4);
        this.wings.setMatrixAt(i * 2 + (side > 0 ? 0 : 1), M5);
      }
    }

    updateLeaves(dt, player) {
      const pv = Math.hypot(player.vx || 0, player.vz || 0), sliding = player.slide >= 0;
      let n = 0;
      // now and then a leaf falls from a tree near the dog
      this.dropT -= dt;
      const near = [];
      for (const list of this.leafSets.values()) for (const l of list) {
        const dd = (l.x - player.x) ** 2 + (l.z - player.z) ** 2;
        if (dd > 55 * 55 || n >= this.MAXL) continue;
        if (!l.air && this.dropT <= 0 && dd < 30 * 30 && Math.random() < 0.02) near.push(l);
        // kicked up by the running (or sliding) dog
        if (!l.air && dd < (sliding ? 2.2 : 1.5) ** 2 && (pv > 3 || sliding) && player.y - (player.ground || 0) < 0.4) {
          const k = sliding ? 0.55 : 0.35;
          l.air = true; l.vx = (player.vx || 0) * k + (Math.random() - 0.5) * 2.5; l.vz = (player.vz || 0) * k + (Math.random() - 0.5) * 2.5; l.vy = 1.5 + Math.random() * 2.5 + pv * 0.12;
          l.spin = (Math.random() - 0.5) * 14;
        }
        if (l.air) this.stepLeaf(l, dt);
        this.drawLeaf(l, n++);
      }
      if (this.dropT <= 0 && near.length) {
        const l = near[Math.floor(Math.random() * near.length)];
        l.air = true; l.y = 3.5 + Math.random() * 2; l.x = l.tree.x + (Math.random() - 0.5) * 3; l.z = l.tree.z + (Math.random() - 0.5) * 3;
        l.vx = l.vz = 0; l.vy = 0; l.spin = (Math.random() - 0.5) * 6;
        this.dropT = 0.4 + Math.random() * 1.2;
      } else if (this.dropT <= 0) this.dropT = 0.5;
      this.leafMesh.count = n;
      this.leafMesh.instanceMatrix.needsUpdate = true;
      if (this.leafMesh.instanceColor) this.leafMesh.instanceColor.needsUpdate = true;
    }
    stepLeaf(l, dt) {
      // a falling leaf: strong air drag, a slow terminal speed, sways from side to side
      l.ph += dt * 3.2;
      const drag = Math.exp(-2.4 * dt);
      l.vx = l.vx * drag + Math.cos(l.ph) * 1.4 * dt * 3; l.vz = l.vz * drag + Math.sin(l.ph * 0.8) * 1.4 * dt * 3;
      l.vy = Math.max(-0.9, l.vy * Math.exp(-1.2 * dt) - 9.8 * dt);
      l.x += l.vx * dt; l.y += l.vy * dt; l.z += l.vz * dt;
      l.h += l.spin * dt; l.spin *= Math.exp(-0.8 * dt);
      l.tilt = Math.sin(l.ph * 1.7) * 0.9;
      const g = this.world.groundAt(l.x, l.z, l.y + 0.1);
      if (l.y <= g && l.vy < 0) { l.y = g; l.air = false; l.tilt = 0; l.vx = l.vy = l.vz = 0; }
    }
    drawLeaf(l, i) {
      E.set(l.tilt, l.h, l.tilt * 0.6, 'YXZ'); Q.setFromEuler(E);
      // lying leaves sit just above the ground marks (sidewalk 0.03, soft shadows 0.075)
      M4.compose(V.set(l.x, l.y + 0.085, l.z), Q, S.set(l.sc, l.sc, l.sc));
      this.leafMesh.setMatrixAt(i, M4);
      this.leafMesh.setColorAt(i, CC.setHex(l.col));
    }

    // ---- pedestrians (runner only: the other games have their own people) ----
    async addPeople(n) {
      const tpl = await R.loadSkinned('../models/man.glb', { height: 1.75 });
      if (!tpl) return;
      const SHIRTS = [0x8a3b3b, 0x2f5f8a, 0xc9a23a, 0x4a7a4a, 0x6a4a8a, 0xd0d0d0, 0x2a2a30, 0xb85a2a];
      const PANTS = [0x2a3448, 0x3a3a3a, 0x5a4632, 0x1e2a3a, 0x6a6a72];
      const HAIR = [0x1a1410, 0x5a3a20, 0x8a6a3a, 0x2a2a2a, 0xbfa070];
      this.people = [];
      for (let i = 0; i < n; i++) {
        const pick = a => a[Math.floor(Math.random() * a.length)];
        const e = tpl.spawn({ Shirt: pick(SHIRTS), Pants: pick(PANTS), Hair: pick(HAIR), Socks: 0x222222 });
        e.root.traverse(o => { if (o.isMesh) o.castShadow = false; });
        e.root.visible = false;
        this.scene.add(e.root);
        this.people.push({ e, cell: null, side: 0, t: 0, dir: 1, speed: 1.1 + Math.random() * 0.4, look: 0, x: 0, z: 0, h: 0, wait: Math.random() * 3 });
      }
    }
    // a walk round a city block on the sidewalk: the four sides of a square of half size W
    placePerson(m, player) {
      const W = HB + 2.3, cells = [...this.world.cells.values()].filter(c => c.near && c.type === 'city');
      for (let tries = 0; tries < 12 && cells.length; tries++) {
        const c = cells[Math.floor(Math.random() * cells.length)];
        const side = Math.floor(Math.random() * 4), t = (Math.random() * 2 - 1) * W;
        const [x, z] = this.onLoop(c, side, t, W);
        const d = Math.hypot(x - player.x, z - player.z);
        if (d < 18 || d > 60 || this.world.solidAt(x, z, 0.5)) continue;
        Object.assign(m, { cell: c, side, t, dir: Math.random() < 0.5 ? 1 : -1, x, z, look: 0 });
        return true;
      }
      m.cell = null;
      return false;
    }
    onLoop(c, side, t, W) {
      const ox = c.ci * P, oz = c.cj * P;
      return side === 0 ? [ox + t, oz + W] : side === 1 ? [ox + W, oz - t] : side === 2 ? [ox - t, oz - W] : [ox - W, oz + t];
    }
    updatePeople(dt, player) {
      if (!this.people) return;
      const W = HB + 2.3, pv = Math.hypot(player.vx || 0, player.vz || 0);
      // the lowest quality (slow phones) has no people; far ones are not drawn (6 draw calls each)
      const low = this.world.nearR === 0;
      for (const m of this.people) {
        if (low) { m.e.root.visible = false; continue; }
        if (m.cell && (!this.world.cells.has(m.cell.ci + ',' + m.cell.cj) || !this.world.cells.get(m.cell.ci + ',' + m.cell.cj).near || Math.hypot(m.x - player.x, m.z - player.z) > 75)) m.cell = null;
        if (!m.cell) { m.wait -= dt; m.e.root.visible = false; if (m.wait <= 0) { m.wait = 1; this.placePerson(m, player); } continue; }
        const dd = Math.hypot(m.x - player.x, m.z - player.z);
        // a dog dashing past: stop and look at it for a moment
        if (dd < 5 && pv > 6) m.look = 2.2;
        let anim = 'walk';
        if (m.look > 0) {
          m.look -= dt; anim = 'idle';
          m.h += R.angDiff(m.h, Math.atan2(-(player.x - m.x), -(player.z - m.z))) * (1 - Math.exp(-6 * dt));
        } else {
          // along the side; at a corner round onto the next side
          const ox = m.x, oz = m.z;
          m.t += m.dir * m.speed * dt;
          if (m.t > W) { m.side = (m.side + 1) % 4; m.t -= 2 * W; }
          if (m.t < -W) { m.side = (m.side + 3) % 4; m.t += 2 * W; }
          const [x, z] = this.onLoop(m.cell, m.side, m.t, W);
          // something in the way (a bench, a bus stop): turn back
          const ahead = this.world.obstaclesNear(x, z, 0.3).find(o => o.kind !== 'npc' && o.kind !== 'traffic' && o.h > 0.4 && Math.abs(x - o.x) < o.hx + 0.3 && Math.abs(z - o.z) < o.hz + 0.3);
          if (ahead) {
            m.dir = -m.dir; m.t -= m.dir * m.speed * dt * -1;
            // boxed in (something on both sides): walk on somewhere else
            if ((m.blocked = (m.blocked || 0) + 1) > 6) { m.cell = null; m.blocked = 0; m.e.root.visible = false; continue; }
          } else { m.x = x; m.z = z; m.blocked = Math.max(0, (m.blocked || 0) - 0.05); }
          const dx = m.x - ox, dz = m.z - oz;
          if (Math.hypot(dx, dz) > 1e-4) m.h += R.angDiff(m.h, Math.atan2(-dx, -dz)) * (1 - Math.exp(-8 * dt));
        }
        m.e.root.visible = dd < 45;
        m.e.root.position.set(m.x, 0.03, m.z);
        m.e.root.rotation.y = m.h;
        m.e.play(anim, anim === 'walk' ? m.speed * 0.9 : 1);
        m.e.mixer.update(dt);
        // the dog bumps into people like into anything else
        this.world.dynamic.push({ x: m.x, z: m.z, hx: 0.28, hz: 0.28, h: 1.75, kind: 'npc' });
      }
    }

    // for tests and the debug view
    stats() {
      let flocks = 0, birds = 0, up = 0, leaves = 0, air = 0;
      for (const list of this.flocks.values()) for (const f of list) { flocks++; for (const b of f.birds) { birds++; if (b.state !== 'ground') up++; } }
      for (const list of this.leafSets.values()) for (const l of list) { leaves++; if (l.air) air++; }
      const people = this.people ? this.people.filter(m => m.cell).length : 0;
      return { flocks, birds, up, leaves, air, drawnBirds: this.bodies.count, drawnLeaves: this.leafMesh.count, people };
    }
  }
  R.StreetLife = StreetLife;
})(window.R = window.R || {});
