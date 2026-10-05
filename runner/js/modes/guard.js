(function (R) {
  const C = R.C;
  const NIGHT_LEN = 150;            // seconds until dawn
  const BARK_R = 11, BARK_CD = 1.4, SCENT_CD = 9, SCENT_T = 4;
  const BITE_CD = 0.6, BITE_R = 2.3, LUNGE_T = 0.3;   // bite: reach and the short leap forward
  const AIM_R = 7;                                      // a bite press leaps at a foe this close
  let aimRing = null;
  const TUG_HIT = 0.12, TUG_MAX_T = 6;                // tug of war over a box
  const ROLE = {
    thief:   { Shirt: 0x141519, Pants: 0x0c0c0f, Hair: 0x0a0a0a, Socks: 0x1a1a1a },
    postman: { Shirt: 0x2b50aa, Pants: 0x1c2a52, Socks: 0xd8c040, Hair: 0x3a2a1a },
    owner:   { Shirt: 0x3d7a36, Pants: 0x5a4632, Hair: 0x6a4a2a },
  };
  const FOE = { thief: 1, fox: 1, cat: 1 };
  const NAME = { thief: 'вор', fox: 'лиса', cat: 'кот', owner: 'хозяин', postman: 'почтальон' };

  let dogEnt, humanTpl, foxTpl, catEnt, chickenTpl;
  let player, Y, coop, el, beacons;
  let G = null; // state of the current night

  // ---- small helpers ---------------------------------------------------------------------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const inside = (x, z, m) => Math.abs(x - Y.ox) < Y.fence - (m || 0) && Math.abs(z - Y.oz) < Y.fence - (m || 0);
  // the closest point just inside (sgn = -1) or outside (sgn = 1) the fence from (x, z)
  function fencePoint(x, z, off) {
    const lx = x - Y.ox, lz = z - Y.oz, F = Y.fence;
    const dx = F - Math.abs(lx), dz = F - Math.abs(lz);
    if (dx < dz) {
      const sx = Math.sign(lx) || 1;
      return { x: Y.ox + sx * (F + off), z: Y.oz + R.clamp(lz, -F + 2, F - 2), nx: sx, nz: 0 };
    }
    const sz = Math.sign(lz) || 1;
    let px = R.clamp(lx, -F + 2, F - 2);
    if (sz > 0 && Math.abs(px) < Y.gateHalf + 1) px = (Math.sign(px) || 1) * (Y.gateHalf + 2);
    return { x: Y.ox + px, z: Y.oz + sz * (F + off), nx: 0, nz: sz };
  }

  // open spots in the yard (yard-local metres) used to walk round the warehouse, coop and kiosk
  const NODES = [[-2, 1], [-14, 1], [-9, -5], [2, -5], [-19.5, -6], [-19.5, 12], [8, 3], [0, 15], [13, -6], [19.5, -5], [19.5, 12], [13, 8], [-10, 13]];
  // is the straight line a-b free of tall things?
  function clear(ax, az, bx, bz, skip) {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, half = Math.hypot(bx - ax, bz - az) / 2;
    for (const o of G.world.obstaclesNear(mx, mz, half + 1)) {
      if ((skip && skip[o.kind]) || o.h < 1 || o.kind === 'traffic' || o.kind === 'fence_tall' || o.kind === 'npc') continue;
      const hx = o.hx + 0.45, hz = o.hz + 0.45;
      let t0 = 0, t1 = 1;
      const dx = bx - ax, dz = bz - az;
      for (const [p, dp, lo, hi] of [[ax, dx, o.x - hx, o.x + hx], [az, dz, o.z - hz, o.z + hz]]) {
        if (Math.abs(dp) < 1e-6) { if (p < lo || p > hi) { t0 = 2; break; } continue; }
        let u0 = (lo - p) / dp, u1 = (hi - p) / dp;
        if (u0 > u1) [u0, u1] = [u1, u0];
        t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
        if (t0 > t1) break;
      }
      if (t0 <= t1) return false;
    }
    return true;
  }
  // shortest walk from a to b through the open spots
  function route(ax, az, bx, bz, skip) {
    if (clear(ax, az, bx, bz, skip)) return [{ x: bx, z: bz }];
    const pts = NODES.map(([x, z]) => ({ x: Y.ox + x, z: Y.oz + z }));
    const n = pts.length, dist = new Array(n).fill(1e9), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
    for (let i = 0; i < n; i++) if (clear(ax, az, pts[i].x, pts[i].z, skip)) dist[i] = Math.hypot(pts[i].x - ax, pts[i].z - az);
    let best = -1, bestLen = 1e9;
    for (let k = 0; k < n; k++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < 1e9 && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0) break;
      done[u] = true;
      if (clear(pts[u].x, pts[u].z, bx, bz, skip)) {
        const L = dist[u] + Math.hypot(bx - pts[u].x, bz - pts[u].z);
        if (L < bestLen) { bestLen = L; best = u; }
      }
      for (let v = 0; v < n; v++) {
        if (done[v]) continue;
        const L = dist[u] + Math.hypot(pts[v].x - pts[u].x, pts[v].z - pts[u].z);
        if (L < dist[v] && clear(pts[u].x, pts[u].z, pts[v].x, pts[v].z, skip)) { dist[v] = L; prev[v] = u; }
      }
    }
    if (best < 0) return null;
    const path = [{ x: bx, z: bz }];
    for (let u = best; u >= 0; u = prev[u]) path.unshift(pts[u]);
    return path;
  }
  const gateIn = () => ({ x: Y.ox, z: Y.oz + Y.fence - 2.5 });
  const gateOut = () => ({ x: Y.ox, z: Y.oz + Y.fence + 3 });
  // along the sidewalk, away from the gate (the road has parked cars and traffic)
  const street = () => ({ x: Y.ox + (Math.random() < 0.5 ? -1 : 1) * 32, z: Y.oz + Y.fence + 2 });
  // a 1 m mesh fence does not stop people, cats or foxes; people do not bump into themselves
  const PEN = { pen: 1, npc: 1 };
  const OVER = { fence_tall: 1, npc: 1 };
  const STILL = { input: { throttle: 0, steer: 0, jumpHeld: false, consumeJump: () => false } };

  class Npc {
    constructor(kind) {
      this.kind = kind;
      this.foe = !!FOE[kind];
      if (kind === 'cat') { this.ent = catEnt; this.root = new THREE.Group(); this.root.add(catEnt.root); }
      else {
        this.ent = (kind === 'fox' ? foxTpl : humanTpl).spawn(kind === 'fox' ? null : ROLE[kind]);
        this.root = this.ent.root;
      }
      G.scene.add(this.root);
      this.x = 0; this.z = 0; this.y = 0; this.h = 0; this.ground = 0;
      this.state = 'approach'; this.t = 0; this.speed = 0; this.side = 0; this.sideT = 0;
      this.loot = null; this.marked = false; this.flagged = {};
      this.walk = kind === 'fox' ? 2.6 : kind === 'cat' ? 3.4 : 2.2;
      this.run = kind === 'fox' ? 8.8 : kind === 'cat' ? 11 : 7;
      this.sight = kind === 'thief' ? 9 : kind === 'fox' ? 7.5 : 6;
      this.spawn();
    }

    spawn() {
      if (!this.foe) {
        const s0 = street(); this.x = s0.x; this.z = s0.z;
        this.state = 'enter'; this.goal = this.kind === 'owner' ? Y.doghouse : Y.door;
        const gi = gateIn();
        this.path = [gateOut(), gi].concat((route(gi.x, gi.z, this.goal.x, this.goal.z, PEN) || [this.goal]));
        return;
      }
      // climb in somewhere away from the dog, with room on the other side and a way to the goal
      this.target = this.kind === 'thief' ? Y.crates : this.kind === 'fox' ? Y.coop : Y.stall;
      let best = null, bd = -1;
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * Math.PI * 2;
        const px = Y.ox + Math.cos(a) * 40, pz = Y.oz + Math.sin(a) * 40;
        const land = fencePoint(px, pz, -1.0);
        if (G.world.solidAt(land.x, land.z, 1.6)) continue;
        if (!route(land.x, land.z, this.target.x, this.target.z, PEN)) continue;
        if (this.kind === 'fox' && Math.hypot(land.x - Y.coop.x, land.z - Y.coop.z) > 26) continue;
        const d = Math.hypot(land.x - player.x, land.z - player.z) + Math.random() * 8;
        if (d > bd) { bd = d; best = [px, pz]; }
      }
      if (!best) best = [Y.ox - 40, Y.oz + 6];
      const fp = fencePoint(best[0], best[1], 4);
      this.x = fp.x; this.z = fp.z;
      this.cross = fencePoint(best[0], best[1], 0.8);
      this.state = 'approach';
    }

    play(name, ts, once) {
      if (this.kind === 'cat') return;
      const map = this.kind === 'fox'
        ? { idle: 'idle', walk: 'walk', run: 'gallop', jump: 'gallop_jump', steal: 'eating', sit: 'idle_hitreact_left', greet: 'idle' }
        : { idle: 'idle', walk: 'walk', run: 'run', jump: 'jump', steal: 'punch', sit: 'sitting', greet: 'clapping' };
      this.ent.play(map[name] || name, ts, once);
    }

    // steer to a point: pulled by the goal, pushed away from nearby obstacles (sliding round corners);
    // if no progress is made for a while, take a detour to one side
    moveTo(tx, tz, speed, dt, skip) {
      const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
      if (d < 0.05) { this.speed = 0; return d; }
      if (this.mtx === undefined || Math.hypot(tx - this.mtx, tz - this.mtz) > 0.5) {
        this.mtx = tx; this.mtz = tz; this.lastD = undefined; this.progT = 0; this.detourT = 0;
      }
      let gx = dx / d, gz = dz / d;
      if (this.detourT > 0) {
        this.detourT -= dt;
        gx = this.detour.x - this.x; gz = this.detour.z - this.z;
        const l = Math.hypot(gx, gz) || 1; gx /= l; gz /= l;
      }
      let ax = gx, az = gz;
      for (const o of G.world.obstaclesNear(this.x, this.z, 2.2)) {
        if (skip && skip[o.kind]) continue;
        if (o.h < 0.5 || o.kind === 'traffic' || o.kind === 'fence_tall') continue;
        const cx = R.clamp(this.x, o.x - o.hx, o.x + o.hx), cz = R.clamp(this.z, o.z - o.hz, o.z + o.hz);
        let rx = this.x - cx, rz = this.z - cz;
        const rd = Math.hypot(rx, rz);
        if (rd > 2.2 || rd < 1e-4) continue;
        rx /= rd; rz /= rd;
        const w = (2.2 - rd) / 2.2;
        // push out, plus slide along the obstacle on the side of the goal
        const side = (gx * rz - gz * rx) > 0 ? 1 : -1;
        ax += rx * w * 1.6 + (-rz * side) * w * 1.4;
        az += rz * w * 1.6 + (rx * side) * w * 1.4;
      }
      const want = Math.atan2(-ax, -az);
      this.h += R.angDiff(this.h, want) * (1 - Math.exp(-9 * dt));
      const step = Math.min(d, speed * dt);
      this.x += -Math.sin(this.h) * step; this.z += -Math.cos(this.h) * step;
      G.world.resolve(this, 0.35, skip);
      this.speed = speed;
      // stuck check
      this.progT = (this.progT || 0) + dt;
      if (this.progT > 1.5) {
        if (this.lastD !== undefined && this.lastD - d < 0.6 && (this.detourT || 0) <= 0) {
          const s = Math.random() < 0.5 ? 1 : -1;
          this.detour = { x: this.x + (-dz / d) * s * 5 - dx / d * 2, z: this.z + (dx / d) * s * 5 - dz / d * 2 };
          this.detourT = 1.3;
        }
        this.lastD = d; this.progT = 0;
      }
      return d;
    }

    // walk along this.path; returns true when the last point is reached
    follow(speed, dt, skip) {
      while (this.path && this.path.length > 1 && Math.hypot(this.path[0].x - this.x, this.path[0].z - this.z) < 0.8) this.path.shift();
      if (!this.path || !this.path.length) return true;
      const p = this.path[0];
      const d = this.moveTo(p.x, p.z, speed, dt, skip);
      if (this.path.length === 1 && d < 0.5) { this.path.length = 0; return true; }
      return false;
    }
    // leave through the gate: to the gate, out, down the street
    leaveByGate() {
      const gi = gateIn();
      this.path = (inside(this.x, this.z, -0.5) ? (route(this.x, this.z, gi.x, gi.z, PEN) || [gi]) : []).concat([gateOut(), street()]);
      this.state = 'leave';
    }

    // jump the fence (or slip under it) towards the other side
    hop(dt, from, to, dur, height) {
      this.t += dt / dur;
      const t = Math.min(1, this.t);
      this.x = R.lerp(from.x, to.x, t); this.z = R.lerp(from.z, to.z, t);
      this.y = Math.sin(Math.PI * t) * height;
      this.h = Math.atan2(-(to.x - from.x), -(to.z - from.z));
      return t >= 1;
    }

    dropLoot(back) {
      if (!this.loot) return;
      this.root.remove(this.loot.mesh);
      if (back && this.kind === 'thief') {
        // the box stays on the ground for a moment, then it is back in the stack
        const m = this.loot.mesh;
        m.position.set(this.x + Math.sin(this.h) * 0.8, 0.28, this.z + Math.cos(this.h) * 0.8);
        m.rotation.set(0, this.h + 0.4, 0);
        G.scene.add(m); G.props.push({ m, t: 4 });
      }
      if (this.loot.bird) { this.loot.bird.stolen = false; this.loot.bird.e.root.visible = true; if (back) coop.respawn(this.loot.bird, player, 0); }
      this.loot = null;
    }
    takeLoot() {
      let mesh, bird = null;
      if (this.kind === 'thief') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.55), new THREE.MeshLambertMaterial({ color: 0x8c6236 }));
        mesh.position.set(0, 1.1, -0.42);   // held in front
      } else if (this.kind === 'fox') {
        bird = coop.birds.find(b => !b.stolen);
        if (bird) { bird.stolen = true; bird.e.root.visible = false; }
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
        mesh.position.set(0, 0.45, -0.62);
      } else {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.35, 6), new THREE.MeshLambertMaterial({ color: 0x9a2a1c }));
        mesh.rotation.z = Math.PI / 2; mesh.position.set(0, 0.42, -0.5);
      }
      this.root.add(mesh);
      this.loot = { mesh, bird };
    }

    seesDog() { return Math.hypot(player.x - this.x, player.z - this.z) < this.sight && player.y < 2.4; }

    flee() {
      if (['flee', 'out', 'caught', 'leave', 'gone', 'approach', 'climb', 'tug', 'retreat'].includes(this.state)) return;
      const skip = PEN;
      let best = null;
      for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const px = sx ? Y.ox + sx * 50 : this.x, pz = sz ? Y.oz + sz * 50 : this.z;
        const ex = fencePoint(px, pz, -0.8), ou = fencePoint(px, pz, 3);
        const path = route(this.x, this.z, ex.x, ex.z, skip);
        if (!path) continue;
        let len = 0, lx = this.x, lz = this.z;
        for (const q of path) { len += Math.hypot(q.x - lx, q.z - lz); lx = q.x; lz = q.z; }
        // avoid running past the dog
        const dd = Math.hypot(ex.x - player.x, ex.z - player.z);
        const score = len + (dd < len ? (len - dd) * 2 : 0);
        if (!best || score < best.score) best = { score, path, out: ou };
      }
      this.state = 'flee';
      if (!best) { const ex = fencePoint(this.x, this.z, -0.8); best = { path: [ex], out: fencePoint(this.x, this.z, 3) }; }
      this.path = best.path; this.out = best.out;
    }

    update(dt) {
      const d2dog = Math.hypot(player.x - this.x, player.z - this.z);
      switch (this.state) {
        case 'approach':
          this.play('walk', 1);
          if (this.moveTo(this.cross.x, this.cross.z, this.walk, dt, OVER) < 0.3) {
            this.state = 'climb'; this.t = 0;
            this.from = { x: this.x, z: this.z };
            this.to = { x: this.x - this.cross.nx * 1.8, z: this.z - this.cross.nz * 1.8 };
            this.play('jump', 1, true);
            if (this.kind === 'fox') G.au.dig && G.au.dig();
          }
          break;
        case 'climb':
          if (this.hop(dt, this.from, this.to, this.kind === 'thief' ? 1.2 : 0.8, this.kind === 'fox' ? 0.05 : 2.7)) {
            this.y = 0; this.state = 'sneak';
            this.path = route(this.x, this.z, this.target.x, this.target.z, PEN) || [this.target];
          }
          break;
        case 'sneak':
          this.play('walk', 0.9);
          if (this.seesDog()) { this.flee(); G.alert(this); break; }
          if (this.follow(this.walk, dt, PEN)) { this.state = 'steal'; this.t = 0; }
          break;
        case 'steal':
          this.play('steal', 1);
          this.t += dt;
          if (this.seesDog() && d2dog < this.sight * 0.6) { this.flee(); G.alert(this); break; }
          if (this.t > (this.kind === 'thief' ? 3 : 2.5)) { this.takeLoot(); this.flee(); }
          break;
        case 'frozen':
          this.play('idle', 1);
          this.t -= dt;
          if (this.t <= 0) { this.state = 'sneak'; this.flee(); }
          break;
        case 'flee':
          this.play('run', this.kind === 'thief' ? 1.1 : 1.3);
          if (this.follow(this.run * (this.loot && this.kind === 'thief' ? 0.85 : 1), dt, PEN)) {
            this.state = 'out'; this.t = 0; this.from = { x: this.x, z: this.z };
            this.to = { x: this.out.x, z: this.out.z };
            this.play('jump', 1, true);
          }
          break;
        case 'out':
          if (this.hop(dt, this.from, this.to, this.kind === 'thief' ? 1.3 : 0.7, this.kind === 'fox' ? 0.05 : 2.7)) {
            this.y = 0; this.state = 'gone';
            if (this.loot) G.lose(this.kind === 'thief' ? 'Вор унёс ящик!' : this.kind === 'fox' ? 'Лиса утащила курицу!' : 'Кот утащил колбасу!');
            else G.scared++;
            this.dropLoot(false);
          }
          break;
        case 'tug':
          // the mode holds him in place; he backs off pulling the box
          this.play('walk', -1.4);
          break;
        case 'caught':
          this.play('sit', 1, true);
          this.t -= dt;
          if (this.t <= 0) this.leaveByGate();
          break;
        case 'retreat':
          // scared off by a bark before climbing the fence: runs back down the street
          this.play('run', 1.1);
          if (this.follow(this.run, dt, OVER)) { this.state = 'gone'; G.scared++; }
          break;
        case 'leave':
          // walk out through the gate, nobody stops them
          this.play('walk', 1);
          if (this.follow(this.foe ? 2.6 : 1.8, dt, PEN)) this.state = 'gone';
          break;
        // ---- friends ----
        case 'enter':
          this.play('walk', 1);
          if (this.follow(1.8, dt, PEN)) { this.state = 'visit'; this.t = 5; }
          break;
        case 'visit':
          this.play(this.kind === 'owner' && d2dog < 3 ? 'greet' : 'idle', 1);
          this.t -= dt;
          if (this.t <= 0) this.leaveByGate();
          break;
      }
      this.root.position.set(this.x, this.y, this.z);
      this.root.rotation.y = this.h;
      if (this.kind === 'cat') this.ent.update(dt, { speed01: R.clamp(this.speed / 11, 0, 1) * (this.state === 'steal' || this.state === 'visit' || this.state === 'frozen' ? 0 : 1), air: this.y > 0.1 });
      else this.ent.update(dt);
      this.speed = 0;
    }

    remove() {
      this.dropLoot(false);
      G.scene.remove(this.root);
      if (this.kind === 'cat') this.root.remove(catEnt.root);
    }
  }

  // ---- the night -----------------------------------------------------------------------------
  function plan(n) {
    const ev = [];
    const add = (kind, k) => { for (let i = 0; i < k; i++) ev.push({ kind }); };
    add('thief', n === 1 ? 2 : n + 1);
    if (n >= 2) add('fox', n - 1);
    add('cat', n >= 3 ? 2 : 1);
    add('friend', n >= 3 ? 2 : 1);
    for (let i = ev.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ev[i], ev[j]] = [ev[j], ev[i]]; }
    if (n === 1) { const i = ev.findIndex(e => e.kind === 'thief'); [ev[0], ev[i]] = [ev[i], ev[0]]; }
    const span = NIGHT_LEN - 40;
    ev.forEach((e, i) => { e.t = 7 + span * (i + (i ? Math.random() * 0.6 : 0)) / ev.length; });
    return ev;
  }

  function newNight(ctx, n) {
    const hinted = G ? G.hinted : false;
    if (G) { for (const npc of G.npcs) npc.remove(); for (const p of G.props) ctx.scene.remove(p.m); }
    ctx.au.growl && ctx.au.growl(false);
    G = {
      n, time: NIGHT_LEN, stars: 3, caught: 0, scared: 0, saved: 0, npcs: [], props: [], events: plan(n), over: false,
      scene: ctx.scene, world: ctx.world, au: ctx.au, ctx,
      barkCd: 0, scentCd: 0, scentT: 0, vig: 0.6,
      biteCd: 0, lunge: 0, daze: 0, tug: null, hinted,
      lose(text) {
        this.stars--; ctx.say(text, 'bad'); ctx.au.alarm();
        el.stars.dataset.n = Math.max(0, this.stars);
        if (this.stars <= 0) endNight(ctx, false);
      },
      alert(npc) { if (!npc.alerted) { npc.alerted = true; if (npc.foe) ctx.au.alert && ctx.au.alert(); } },
    };
    for (const b of coop.birds) { b.stolen = false; b.e.root.visible = true; }
    player.x = Y.dogStart.x; player.z = Y.dogStart.z; player.heading = 0; player.speed = 0; player.vx = player.vz = 0; player.y = 0;
    ctx.rig.snap(player);
    el.stars.dataset.n = 3;
    el.night.textContent = n;
    el.result.hidden = true;
    ctx.say(n === 1 ? 'Ночь 1. Охраняй склад до рассвета' : 'Ночь ' + n);
  }

  function endNight(ctx, ok) {
    if (G.over) return;
    G.over = true;
    if (G.tug) { G.tug.n.state = 'caught'; G.tug.n.t = 99; G.tug = null; }
    ctx.au.growl && ctx.au.growl(false);
    el.tug.hidden = true;
    for (const m of el.pool) m.hidden = true;
    let best = 0;
    try { best = +localStorage.getItem('guard-best') || 0; } catch (e) {}
    if (ok && G.n > best) { best = G.n; try { localStorage.setItem('guard-best', G.n); } catch (e) {} }
    el.resTitle.textContent = ok ? 'Рассвет! Ночь ' + G.n + ' пройдена' : 'Хозяин недоволен';
    el.resText.textContent = (ok ? 'Звёзды доверия: ' + '★'.repeat(G.stars) + '☆'.repeat(3 - G.stars) + '. ' : '') +
      'Поймано: ' + G.caught + ', прогнано: ' + G.scared + (G.saved ? ', отбито ящиков: ' + G.saved : '') + '.' +
      (best ? ' Рекорд: ' + best + '-я ночь.' : '');
    el.resNext.textContent = ok ? 'Следующая ночь' : 'Ещё раз';
    el.resNext.onclick = () => newNight(ctx, ok ? G.n + 1 : G.n);
    el.result.hidden = false;
    if (ok) ctx.au.chime();
  }

  // ---- bite and tug of war ---------------------------------------------------------------------
  // can the dog get its teeth into n right now?
  function biteable(n) {
    if (!n.foe) return n.state !== 'gone' && inside(n.x, n.z) && Math.abs(n.y - player.y) < 1.3;
    if (n.released || ['gone', 'leave', 'caught', 'approach', 'tug', 'retreat'].includes(n.state)) return false;
    // half way over the fence he can still be pulled down by the legs
    if (n.state === 'climb') return n.t > 0.4;
    if (n.state === 'out') return n.t < 0.6;
    return Math.abs(n.y - player.y) < 1.3;
  }
  // whoever is closest in front of the dog
  function biteTarget(range, foes, cone) {
    const fx = -Math.sin(player.heading), fz = -Math.cos(player.heading);
    let best = null, bs = 1e9;
    for (const n of G.npcs) {
      if ((foes && !n.foe) || !biteable(n)) continue;
      const dx = n.x - player.x, dz = n.z - player.z, d = Math.hypot(dx, dz);
      if (d > range) continue;
      const dot = d > 1e-3 ? (dx * fx + dz * fz) / d : 1;
      if (dot < (cone === undefined ? 0.25 : cone) && d > 1.1) continue;
      const score = d * (1.6 - dot);
      if (score < bs) { bs = score; best = n; }
    }
    return best;
  }
  // a fox or a cat lets go of the loot and runs
  function catchCritter(n, ctx) {
    if (n.released) return;
    n.released = true;
    n.dropLoot(true);
    G.caught++;
    if (n.state !== 'flee') { n.state = 'sneak'; n.flee(); }
    ctx.say(n.kind === 'fox' ? 'Лиса удрала без курицы' : 'Кот удрал без колбасы');
    if (n.kind === 'fox') ctx.au.yelp(); else ctx.au.meow();
    ctx.fx.emit(n.x, 1, n.z, { color: 0xffe27a, count: 10, speed: 5, up: 2.5, size: 0.25, opacity: 0.95, life: 0.6 });
  }
  function bite(n, ctx) {
    if (dogEnt.trigger) dogEnt.trigger('attack');
    ctx.au.snap();
    ctx.fx.emit(n.x, Math.max(0.6, n.y + 0.8), n.z, { color: 0xffffff, count: 6, speed: 4, up: 1.5, size: 0.22, opacity: 0.9, life: 0.35 });
    if (!n.foe) {
      if (!n.flagged.bite) { n.flagged.bite = n.flagged.grab = true; G.lose('Это ' + NAME[n.kind] + '! Своих не кусают'); }
      return;
    }
    // pull him off the fence, back into the yard
    if (n.state === 'climb' || n.state === 'out') {
      const p = n.state === 'climb' ? n.to : n.from;
      n.x = p.x; n.z = p.z; n.y = 0; n.state = 'sneak';
      if (n.kind === 'thief') ctx.say('Стянул с забора!');
    }
    if (n.kind !== 'thief') { catchCritter(n, ctx); return; }
    if (n.loot) { startTug(n, ctx); return; }
    n.released = true; n.state = 'caught'; n.t = 2.6; n.path = null;
    G.caught++; ctx.say('Вор сдался!'); ctx.au.chime();
    ctx.fx.emit(n.x, 1, n.z, { color: 0xffe27a, count: 10, speed: 5, up: 2.5, size: 0.25, opacity: 0.95, life: 0.6 });
  }
  // the thief holds on to the box: whoever pulls harder gets it
  function startTug(n, ctx) {
    let px = n.x - player.x, pz = n.z - player.z;
    const l = Math.hypot(px, pz);
    if (l < 0.2) { px = -Math.sin(player.heading); pz = -Math.cos(player.heading); } else { px /= l; pz /= l; }
    G.tug = { n, m: 0.45, t: 0, px, pz, cx: n.x, cz: n.z };
    n.state = 'tug'; n.path = null;
    n.loot.mesh.position.set(0, 0.7, -0.62);
    ctx.au.growl(true);
    ctx.say(ctx.coarse ? 'Тяни! Жми «Кусь» быстро!' : 'Тяни! Жми G быстро!');
    el.tug.hidden = false;
  }
  function endTug(won, ctx) {
    const T = G.tug, n = T.n;
    G.tug = null;
    ctx.au.growl(false);
    el.tug.hidden = true;
    n.state = 'sneak';
    if (won) {
      n.dropLoot(true);
      G.saved++; ctx.say('Отбил ящик!'); ctx.au.chime();
      ctx.fx.emit(n.x, 1, n.z, { color: 0xffe27a, count: 12, speed: 5, up: 2.5, size: 0.25, opacity: 0.95, life: 0.6 });
    } else {
      n.loot.mesh.position.set(0, 1.1, -0.42);
      G.daze = 0.8;
      player.vx = -T.px * 6; player.vz = -T.pz * 6;
      ctx.say('Вор вырвался!', 'bad'); ctx.au.thump(1);
    }
    n.flee();
  }
  // the pair drifts towards whoever is winning; the dog faces the thief
  function holdTug(dt) {
    const T = G.tug, n = T.n;
    T.t += dt;
    T.m -= (0.4 + 0.04 * G.n) * dt;
    const off = (0.5 - T.m) * 1.6 + Math.sin(T.t * 17) * 0.06;
    n.x = T.cx + T.px * off; n.z = T.cz + T.pz * off;
    G.world.resolve(n, 0.35, PEN);
    n.h = Math.atan2(T.px, T.pz);
    player.x = n.x - T.px * 1.3; player.z = n.z - T.pz * 1.3;
    player.heading = Math.atan2(-T.px, -T.pz);
    player.vx = player.vz = player.speed = 0;
  }

  // ---- markers at the screen edge -------------------------------------------------------------
  const V = new THREE.Vector3();
  function mark(elm, x, y, z, camera, kind) {
    V.set(x, y, z).project(camera);
    let sx = V.x, sy = V.y;
    const behind = V.z > 1;
    if (behind) { sx = -sx; sy = -sy; }
    let edge = behind || Math.abs(sx) > 0.9 || Math.abs(sy) > 0.85;
    if (edge) { const m = Math.max(Math.abs(sx) / 0.9, Math.abs(sy) / 0.85); sx /= m; sy /= m; }
    const px = (sx * 0.5 + 0.5) * innerWidth, py = (-sy * 0.5 + 0.5) * innerHeight;
    elm.style.transform = 'translate(' + px.toFixed(0) + 'px,' + py.toFixed(0) + 'px)';
    elm.className = 'mk ' + kind + (edge ? ' edge' : '');
    elm.firstChild.style.transform = 'rotate(' + Math.atan2(-sy, sx).toFixed(2) + 'rad)';
    elm.hidden = false;
  }

  R.modes = R.modes || {};
  R.modes.guard = {
    title: 'Охранник',

    async load() {
      [dogEnt, humanTpl, foxTpl, catEnt, chickenTpl] = await Promise.all([
        R.makeGuardDog(), R.loadSkinned('../models/man.glb', { height: 1.8 }),
        R.loadSkinned('../models/fox.glb', { len: 1.05 }), R.makeCat(), R.loadChicken(),
      ]);
    },

    start(ctx) {
      const { scene, world, $ } = ctx;
      Y = R.World.yard;
      ctx.lockTheme('night');
      // a guard stays on post: no auto-run by default
      if (ctx.input.touch) { ctx.input.autoRun = false; const ab = $('autoBtn'); if (ab) ab.setAttribute('aria-pressed', 'false'); }
      player = new R.Player(dogEnt);
      // a guard dog jumps lower and has no air jump: the 2.4 m fence must hold it
      player.jumpMul = 0.86; player.maxAirJumps = 0;
      // the yard is small: a calmer top speed, so the dog does not overshoot whoever it chases
      player.maxSpeed = 12.5; player.halfLen = 0.42;
      // a red ring under whoever the dog can go for right now
      aimRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 28), new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.85, depthWrite: false }));
      aimRing.rotation.x = -Math.PI / 2; aimRing.renderOrder = 3; aimRing.visible = false;
      scene.add(aimRing);
      scene.add(player.root);
      ctx.addBlob(player, 2.1);
      player.x = Y.dogStart.x; player.z = Y.dogStart.z;
      world.update(player.x, player.z, 99);
      coop = chickenTpl ? new R.Flock(scene, chickenTpl, 5, world, player, { bounds: Y.pen, calm: true }) : { birds: [], update() {}, respawn() {} };

      beacons = Y.checkpoints.map(p => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: R.glowTexture(), color: 0x66ff88, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        s.position.set(p.x, 1.45, p.z); s.scale.set(1.3, 1.3, 1);
        scene.add(s);
        return { s, x: p.x, z: p.z, fresh: 0 };
      });

      el = {
        night: $('gNight'), time: $('gTime'), stars: $('gStars'), vig: $('gVig'), caught: $('gCaught'),
        marks: $('marks'), result: $('result'), resTitle: $('resTitle'), resText: $('resText'), resNext: $('resNext'),
        barkBtn: $('barkBtn'), scentBtn: $('scentBtn'), biteBtn: $('biteBtn'), tug: $('tug'), tugFill: $('tugFill'),
      };
      el.pool = [];
      for (let i = 0; i < 8; i++) {
        const d = document.createElement('div'); d.className = 'mk'; d.hidden = true;
        d.innerHTML = '<i></i><b>!</b>';
        el.marks.appendChild(d); el.pool.push(d);
      }
      $('resMenu').onclick = () => { location.hash = ''; location.reload(); };
      newNight(ctx, 1);
      return player;
    },

    update(dt, ctx) {
      const { world, fx, au, input, camera } = ctx;
      const T = ctx.theme();
      // people are solid for the dog
      for (const n of G.npcs) {
        if (n.kind === 'fox' || n.kind === 'cat' || ['gone', 'climb', 'out', 'tug'].includes(n.state)) continue;
        world.dynamic.push({ x: n.x, z: n.z, hx: 0.3, hz: 0.3, h: 1.8, kind: 'npc' });
      }
      for (let i = G.props.length - 1; i >= 0; i--) {
        if ((G.props[i].t -= dt) <= 0) { G.scene.remove(G.props[i].m); G.props.splice(i, 1); }
      }
      if (G.over) {
        input.consumeBark(); input.consumeScent(); input.consumeBite();
        aimRing.visible = false;
        player.update(dt, input, world, fx, T);
        return;
      }

      // bite: a short leap at whoever is in front; while tugging, every bite pulls the box
      G.biteCd -= dt; G.lunge = Math.max(0, G.lunge - dt); G.daze = Math.max(0, G.daze - dt);
      const biting = input.consumeBite();
      if (G.tug) {
        if (biting && G.biteCd <= 0) {
          G.biteCd = 0.07; G.tug.m += TUG_HIT;
          if (dogEnt.trigger) dogEnt.trigger('attack');
          au.snap();
        }
        if (G.tug.m >= 1) endTug(true, ctx);
        else if (G.tug.m <= 0 || G.tug.t > TUG_MAX_T) endTug(false, ctx);
        else holdTug(dt);
      } else if (biting && G.biteCd <= 0 && G.daze <= 0) {
        G.biteCd = BITE_CD;
        let n = biteTarget(BITE_R);
        let d = 9;
        const far = !n && biteTarget(AIM_R, true, -0.2);
        if (far) {
          // a foe a few metres away: leap at him and bite on contact
          G.lunge = Math.min(0.6, Math.hypot(far.x - player.x, far.z - player.z) / 14 + 0.15); G.lungeAt = far;
          if (dogEnt.trigger) dogEnt.trigger('attack');
          au.snap(); n = null; d = 0;
        } else if (n) {
          d = Math.hypot(n.x - player.x, n.z - player.z);
          if (d > 0.05) player.heading = Math.atan2(-(n.x - player.x), -(n.z - player.z));
          bite(n, ctx);
        } else if (!far) {
          G.lunge = LUNGE_T; G.lungeAt = null;
          if (dogEnt.trigger) dogEnt.trigger('attack');
          au.snap();
        }
        if (!G.tug && d > 1.2) {
          const fx_ = -Math.sin(player.heading), fz_ = -Math.cos(player.heading);
          player.speed = Math.max(player.speed, 9);
          player.vx = fx_ * Math.max(player.vel, 11); player.vz = fz_ * Math.max(player.vel, 11);
          if (!player.air) player.vy = Math.max(player.vy, 3);
        }
      }
      // the leap homes in on its target
      if (G.lunge > 0 && G.lungeAt && !G.tug) {
        const t = G.lungeAt, dx = t.x - player.x, dz = t.z - player.z, dd = Math.hypot(dx, dz) || 1;
        player.heading = Math.atan2(-dx, -dz);
        player.speed = Math.max(player.speed, 12);
        player.vx = dx / dd * 14; player.vz = dz / dd * 14;
        if (!biteable(t)) G.lunge = 0;
      }
      if (G.tug || G.daze > 0) {
        input.consumeJump();
        player.update(dt, STILL.input, world, fx, T);
      } else {
        const v0 = player.vel;
        player.update(dt, input, world, fx, T);
        G.hitVel = Math.max(v0, player.vel);
      }
      if (G.daze > 0 && Math.random() < dt * 10) {
        fx.emit(player.x, player.y + 1.1, player.z, { color: 0xffe27a, count: 1, speed: 1, up: 0.6, size: 0.2, opacity: 0.9, life: 0.5 });
      }
      // the leap itself catches whoever it lands on
      if (G.lunge > 0 && !G.tug) {
        const t = G.lungeAt;
        const n = t ? (Math.hypot(t.x - player.x, t.z - player.z) < 1.7 && biteable(t) ? t : null) : biteTarget(1.4);
        if (n) { G.lunge = 0; G.lungeAt = null; bite(n, ctx); }
      }
      coop.update(dt, player, world);

      // the night goes on
      G.time -= dt;
      if (G.time <= 0) { endNight(ctx, true); return; }
      const elapsed = NIGHT_LEN - G.time;
      const active = G.npcs.filter(n => n.foe && n.state !== 'gone').length;
      for (const e of G.events) {
        if (e.done || elapsed < e.t) continue;
        if (e.kind !== 'friend' && active >= 3) { e.t += 5; continue; }
        e.done = true;
        const kind = e.kind === 'friend' ? (Math.random() < 0.5 ? 'owner' : 'postman') : e.kind;
        if (kind === 'cat' && G.npcs.some(n => n.kind === 'cat' && n.state !== 'gone')) { e.done = false; e.t += 6; continue; }
        G.npcs.push(new Npc(kind));
      }

      // patrol posts keep the dog alert
      G.vig = Math.max(0, G.vig - dt / 45);
      for (const b of beacons) {
        b.fresh = Math.max(0, b.fresh - dt);
        if (b.fresh <= 0 && Math.hypot(player.x - b.x, player.z - b.z) < 2.2) {
          b.fresh = 25; G.vig = Math.min(1, G.vig + 0.34); au.chime();
          fx.emit(b.x, 1.4, b.z, { color: 0x66ff88, count: 8, speed: 2, up: 2, size: 0.3, opacity: 0.9, life: 0.6 });
        }
        b.s.material.color.setHex(b.fresh > 0 ? 0x2f6b3a : 0x66ff88);
        b.s.scale.setScalar(b.fresh > 0 ? 0.7 : 1.1 + Math.sin(performance.now() * 0.006) * 0.25);
      }

      // bark
      G.barkCd -= dt;
      if (input.consumeBark() && G.barkCd <= 0) {
        G.barkCd = BARK_CD; au.bark(240);
        if (dogEnt.trigger) dogEnt.trigger('attack');
        for (const n of G.npcs) {
          const d = Math.hypot(n.x - player.x, n.z - player.z);
          if (d > BARK_R || n.state === 'gone' || n.state === 'tug') continue;
          if (n.foe) {
            if (n.kind !== 'thief' && n.loot) { n.dropLoot(true); G.scared++; ctx.say(n.kind === 'fox' ? 'Лиса бросила курицу!' : 'Кот бросил колбасу!'); }
            if (n.state === 'approach') {
              // still outside: a bark is enough to make anyone think twice
              n.state = 'retreat'; n.path = [{ x: n.x + n.cross.nx * 14, z: n.z + n.cross.nz * 14 }];
              ctx.say(n.kind === 'thief' ? 'Вор передумал лезть!' : n.kind === 'fox' ? 'Лиса убежала от забора' : 'Кот передумал');
            } else if (n.kind === 'thief' && ['sneak', 'steal', 'flee', 'frozen'].includes(n.state)) { n.state = 'frozen'; n.t = 1.4; ctx.say('Вор замер!'); }
            else n.flee();
          } else if (inside(n.x, n.z) && d < 7 && !n.flagged.bark) {
            n.flagged.bark = true; G.lose('Это ' + NAME[n.kind] + '! Своих не облаивают');
          }
        }
      }
      // scent
      G.scentCd -= dt; G.scentT = Math.max(0, G.scentT - dt);
      if (input.consumeScent() && G.scentCd <= 0) { G.scentCd = SCENT_CD; G.scentT = SCENT_T; au.whoosh(); }

      // NPCs, catching, friends
      const detect = 14 + G.vig * 30;
      let mi = 0;
      for (const n of G.npcs) {
        if (n.state === 'gone') continue;
        n.update(dt);
        const d = Math.hypot(n.x - player.x, n.z - player.z);
        // a fox or a cat is caught just by running into it; a thief has to be bitten
        if (n.foe && n.kind !== 'thief' && !n.released && d < 1.45 && Math.abs(player.y - n.y) < 1.3 && ['sneak', 'steal', 'flee', 'frozen'].includes(n.state)) {
          if (dogEnt.trigger) dogEnt.trigger('attack');
          catchCritter(n, ctx);
        }
        if (n.kind === 'thief' && !G.hinted && !n.released && d < 4 && inside(n.x, n.z) && ['sneak', 'steal', 'flee', 'frozen'].includes(n.state)) {
          G.hinted = true; ctx.say(ctx.coarse ? 'Жми «Кусь»!' : 'Жми G — кусь!');
        }
        if (!n.foe && inside(n.x, n.z)) {
          if (d < 1.25 && G.hitVel > 6 && !n.flagged.grab) { n.flagged.grab = true; G.lose('Это ' + NAME[n.kind] + '! Нельзя бросаться на своих'); }
          if (d < 2.6 && player.vel < 3 && !n.flagged.hello) { n.flagged.hello = true; ctx.say('Свой. Хороший пёс!'); au.chime(); }
        }
        if (n.y > 0.05 || n.state === 'climb') n.ground = n.y;
        // highlight while sniffing
        if (n.ent.highlight) n.ent.highlight(n.foe ? 0xff2222 : 0x22ff66, G.scentT > 0 ? 0.55 : 0);
        // marker
        const showIt = G.scentT > 0 ? d < 70 : (d < detect && (inside(n.x, n.z, -3) || n.state === 'approach'));
        if (showIt && mi < el.pool.length) {
          mark(el.pool[mi++], n.x, n.y + 2.1, n.z, camera, G.scentT > 0 ? (n.foe ? 'foe' : 'friend') : 'unk');
        }
      }
      for (; mi < el.pool.length; mi++) el.pool[mi].hidden = true;
      G.npcs = G.npcs.filter(n => { if (n.state === 'gone') { n.remove(); return false; } return true; });

      // HUD
      const s = Math.max(0, Math.ceil(G.time)), mm = Math.floor(s / 60), ss = s % 60;
      el.time.textContent = mm + ':' + (ss < 10 ? '0' : '') + ss;
      el.vig.style.transform = 'scaleX(' + G.vig.toFixed(3) + ')';
      el.caught.textContent = G.caught;
      el.barkBtn.style.setProperty('--cd', Math.max(0, G.barkCd / BARK_CD).toFixed(2));
      el.scentBtn.style.setProperty('--cd', Math.max(0, G.scentCd / SCENT_CD).toFixed(2));
      el.biteBtn.style.setProperty('--cd', G.tug ? '0' : Math.max(0, G.biteCd / BITE_CD).toFixed(2));
      const aim = !G.tug && (biteTarget(BITE_R + 0.5, true) || biteTarget(AIM_R, true, -0.2));
      el.biteBtn.classList.toggle('hot', !!G.tug || !!aim);
      aimRing.visible = !!aim;
      if (aim) {
        aimRing.position.set(aim.x, (aim.y || 0) + 0.05, aim.z);
        const k = 1 + 0.12 * Math.sin(performance.now() * 0.012);
        aimRing.scale.set(k, k, 1);
      }
      if (G.tug) el.tugFill.style.transform = 'scaleX(' + R.clamp(G.tug.m, 0, 1).toFixed(3) + ')';
    },

    // music: calm while the yard is quiet, tense with a thief or a fox about, most when near one
    tension() {
      if (!G) return 0.15;
      let t = 0.15;
      for (const n of G.npcs) {
        if (!n.foe || ['gone', 'out'].includes(n.state)) continue;
        t = Math.max(t, n.state === 'steal' || n.state === 'tug' || Math.hypot(n.x - player.x, n.z - player.z) < 14 ? 0.9 : 0.55);
      }
      return t;
    },
    debug() { return { guard: () => G, Y: () => Y, aim: () => biteTarget(AIM_R, true, -0.2), ring: () => aimRing }; },
  };
})(window.R = window.R || {});
