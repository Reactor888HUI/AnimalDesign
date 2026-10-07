(function (R) {
  // ===================================================================================================
  //  "SEARCH" (the runner): at a walk or a trot the whippet can put its nose to the ground. Then thin
  //  see-through glowing threads show on the ground — scent trails in all the colours of the rainbow and
  //  brown, branching like little fractals, leading off in different directions. Each colour is a smell
  //  and leads somewhere:
  //    tangled clews of glowing threads by the bins (any rainbow colour, a puff of smoke of the same
  //    colour rises over each) — sniff one for a moment to untangle it;
  //    yellow: a lost ball;  brown: a sausage;  blue: another dog's mark (sniff it);  violet: the cat.
  //  Speed up to a run and the threads fade. Cheap for a phone: the threads are flat ribbons in one
  //  mesh, rebuilt only when a trail changes; one shader makes them shimmer and flow towards the find.
  // ===================================================================================================
  const C = R.C, clamp = R.clamp, damp = R.damp;
  const COLORS = {
    red: [0xff4040, 'красный'], orange: [0xff9a2a, 'оранжевый'], yellow: [0xffe43a, 'жёлтый'], green: [0x4be36e, 'зелёный'],
    cyan: [0x3fd8ff, 'голубой'], blue: [0x4a6dff, 'синий'], violet: [0xbb55ff, 'фиолетовый'], brown: [0xb0703a, 'коричневый'],
  };
  const RAINBOW = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet'];
  const Y = 0.07;                         // the threads lie just over the ground (the sidewalk is 3 cm up)
  const MAX_TRAIL = 85;                   // a find further than this: no thread to it
  const SLOW = 6.6;                       // above this (a gallop) the nose comes up

  // ---- the threads' look: flat ribbons, brighter near the dog, a soft glow across, pulses flowing
  // along towards the find, a little flicker ----------------------------------------------------------
  function threadMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uDog: { value: new THREE.Vector2() }, uNight: { value: 0 } },
      vertexShader: `
        attribute vec3 color; attribute float aT; attribute float aA; attribute float aSide;
        varying vec3 vC; varying float vT, vA, vSide, vD;
        uniform vec2 uDog;
        void main() {
          vC = color; vT = aT; vA = aA; vSide = aSide;
          vD = distance(position.xz, uDog);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vC; varying float vT, vA, vSide, vD;
        uniform float uTime, uK, uNight;
        void main() {
          float edge = 1.0 - abs(vSide);
          float core = smoothstep(0.45, 1.0, edge);            // a bright thin core in a soft glow
          float flow = 0.6 + 0.4 * sin(vT * 1.7 - uTime * 3.2);
          float flick = 0.88 + 0.12 * sin(vT * 13.0 + uTime * 9.0);
          float near = 1.0 - smoothstep(6.0, 34.0, vD);
          float a = uK * vA * (0.3 * edge + 0.9 * core) * flow * flick * near * (1.25 + 0.5 * uNight);
          // (normal blending, so a thread shows on light paving in the sun too; it glows at night anyway)
          gl_FragColor = vec4(min(vC * (1.15 + 0.35 * core) + 0.12 * core, vec3(1.0)), min(a * 0.95, 0.95));
        }`,
      transparent: true, depthWrite: false,
    });
  }

  // ---- shapes ------------------------------------------------------------------------------------
  // a wobbly line from a to b: the middle pushed sideways, then the halves, and so on (a fractal)
  function wobble(a, b, amp, depth, rnd, out) {
    if (depth === 0) { out.push(b); return; }
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, o = (rnd() * 2 - 1) * amp;
    const m = { x: (a.x + b.x) / 2 - dz / l * o, z: (a.z + b.z) / 2 + dx / l * o };
    wobble(a, m, amp * 0.55, depth - 1, rnd, out);
    wobble(m, b, amp * 0.55, depth - 1, rnd, out);
  }
  const P = C.P, roadLine = v => (Math.round(v / P - 0.5) + 0.5) * P;
  // the way along the streets (not through the houses): along the street the dog is in, round the
  // corner into the street of the find
  function route(a, t) {
    if (Math.hypot(t.x - a.x, t.z - a.z) < 14) return [a, t];
    const ax = roadLine(a.x), az = roadLine(a.z), tx = roadLine(t.x), tz = roadLine(t.z);
    const aVert = Math.abs(a.x - ax) < Math.abs(a.z - az), tVert = Math.abs(t.x - tx) < Math.abs(t.z - tz);
    if (aVert && tVert) {
      if (Math.abs(ax - tx) < 1) return [a, t];
      const zc = roadLine((a.z + t.z) / 2);
      return [a, { x: a.x, z: zc }, { x: t.x, z: zc }, t];
    }
    if (!aVert && !tVert) {
      if (Math.abs(az - tz) < 1) return [a, t];
      const xc = roadLine((a.x + t.x) / 2);
      return [a, { x: xc, z: a.z }, { x: xc, z: t.z }, t];
    }
    return aVert ? [a, { x: a.x, z: t.z }, t] : [a, { x: t.x, z: a.z }, t];
  }
  // a trail: the wobbly way plus side branches (and branches of those) that fade out
  function trail(a, t, rnd) {
    const way = route(a, t), main = [way[0]];
    for (let i = 1; i < way.length; i++) {
      const l = Math.hypot(way[i].x - way[i - 1].x, way[i].z - way[i - 1].z);
      wobble(way[i - 1], way[i], Math.min(2.4, l * 0.16), clamp(Math.round(Math.log2(l / 0.7)), 1, 7), rnd, main);
    }
    const lines = [{ pts: main, w: 0.16, tip: false }];
    let along = 0, next = 2 + rnd() * 3;
    for (let i = 1; i < main.length - 2; i++) {
      along += Math.hypot(main[i].x - main[i - 1].x, main[i].z - main[i - 1].z);
      if (along < next) continue;
      next = along + 2.5 + rnd() * 4;
      const dx = main[i + 1].x - main[i].x, dz = main[i + 1].z - main[i].z, h = Math.atan2(dx, dz) + (rnd() < 0.5 ? -1 : 1) * (0.45 + rnd() * 0.8);
      const len = 1.5 + rnd() * 4, end = { x: main[i].x + Math.sin(h) * len, z: main[i].z + Math.cos(h) * len };
      const br = [main[i]]; wobble(main[i], end, len * 0.25, 4, rnd, br);
      lines.push({ pts: br, w: 0.1, tip: true, t0: along });
      if (rnd() < 0.5) {
        const k = br[Math.floor(br.length / 2)], h2 = h + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), l2 = len * 0.5;
        const sub = [k]; wobble(k, { x: k.x + Math.sin(h2) * l2, z: k.z + Math.cos(h2) * l2 }, l2 * 0.3, 3, rnd, sub);
        lines.push({ pts: sub, w: 0.07, tip: true, t0: along + len / 2 });
      }
    }
    return { main, lines };
  }

  function glowSprite(color, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: R.glowTexture(), color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.set(size, size, 1);
    return s;
  }
  // a tangled clew: a few closed loops of glowing thread round a ball
  function clewMesh(color, rnd) {
    const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    for (let k = 0; k < 4; k++) {
      const pts = [];
      for (let i = 0; i < 8; i++) {
        const u = rnd() * Math.PI * 2, v = Math.acos(rnd() * 2 - 1), r = 0.2 + rnd() * 0.1;
        pts.push(new THREE.Vector3(Math.sin(v) * Math.cos(u) * r, Math.cos(v) * r * 0.8, Math.sin(v) * Math.sin(u) * r));
      }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, 0.011, 3, true), mat));
    }
    // a few loose ends trailing on the ground
    for (let k = 0; k < 3; k++) {
      const h = rnd() * Math.PI * 2, pts = [new THREE.Vector3(0, -0.15, 0)];
      for (let i = 1; i < 4; i++) pts.push(new THREE.Vector3(Math.sin(h + i * 0.3) * i * 0.2, -0.26, Math.cos(h + i * 0.3) * i * 0.2));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.008, 3, false), mat));
    }
    g.add(glowSprite(color, 1.3));
    return g;
  }
  function ballMesh() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd8f03a, roughness: 0.8 }));
    b.position.y = 0.11; b.castShadow = true; g.add(b);
    const s = glowSprite(COLORS.yellow[0], 0.8); s.position.y = 0.12; g.add(s);
    return g;
  }
  function sausageMesh() {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x9a4426, roughness: 0.5 });
    const nap = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.9 }));
    nap.rotation.x = -Math.PI / 2; nap.position.y = 0.035; g.add(nap);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.26, 8), m);
    body.rotation.z = Math.PI / 2; body.position.y = 0.08; g.add(body);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), m); e.position.set(s * 0.13, 0.08, 0); g.add(e); }
    const s = glowSprite(COLORS.brown[0], 0.8); s.position.y = 0.1; g.add(s);
    return g;
  }
  function markMesh() {
    const g = new THREE.Group();
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.42, 18), new THREE.MeshBasicMaterial({ map: R.glowTexture(), color: COLORS.blue[0], transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    d.rotation.x = -Math.PI / 2; d.position.y = 0.06; g.add(d);
    return g;
  }

  // ---- smoke over the clews: one set of points, each puff rises, spreads and fades ---------------
  const PUFFS = 12;
  class Smoke {
    constructor(scene, max) {
      this.max = max;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * PUFFS * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * PUFFS * 3), 3));
      this.pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.1, map: R.glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
      this.pts.frustumCulled = false; this.pts.renderOrder = 4;
      scene.add(this.pts);
      this.age = new Float32Array(max * PUFFS).map(() => Math.random());
      this.drift = new Float32Array(max * PUFFS * 2).map(() => Math.random() * 2 - 1);
      this.col = new THREE.Color();
    }
    update(dt, clews, boost) {
      const pos = this.pts.geometry.attributes.position, col = this.pts.geometry.attributes.color;
      for (let c = 0; c < this.max; c++) {
        const t = clews[c];
        for (let i = 0; i < PUFFS; i++) {
          const k = c * PUFFS + i;
          if (!t) { pos.setXYZ(k, 0, -50, 0); col.setXYZ(k, 0, 0, 0); continue; }
          this.age[k] += dt / (2.6 - 0.8 * (t.untangle || 0));
          if (this.age[k] > 1) { this.age[k] -= 1; this.drift[k * 2] = Math.random() * 2 - 1; this.drift[k * 2 + 1] = Math.random() * 2 - 1; }
          const a = this.age[k], spread = 0.15 + a * 0.6;
          pos.setXYZ(k, t.x + this.drift[k * 2] * spread + a * 0.4, 0.35 + a * 2.6, t.z + this.drift[k * 2 + 1] * spread);
          const f = Math.sin(Math.PI * a) * (0.28 + 0.25 * boost + 0.4 * (t.untangle || 0));
          this.col.setHex(t.color);
          col.setXYZ(k, this.col.r * f, this.col.g * f, this.col.b * f);
        }
      }
      pos.needsUpdate = true; col.needsUpdate = true;
    }
  }

  // ---- the search ------------------------------------------------------------------------------------
  R.Search = class {
    constructor(scene, world, au, fx) {
      this.scene = scene; this.world = world; this.au = au; this.fx = fx;
      this.on = false; this.k = 0; this.sniffT = 0; this.time = 0; this.noseT = 0;
      this.targets = []; this.respawnT = {}; this.rnd = Math.random;
      this.mat = threadMaterial();
      this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
      this.mesh.frustumCulled = false; this.mesh.renderOrder = 3; this.mesh.visible = false;
      scene.add(this.mesh);
      this.smoke = new Smoke(scene, 3);
      this.decoys = []; this.dirty = true; this.checkT = 0; this.seenColor = () => [];
      this.quest = () => {}; this.say = () => {};
    }
    // where to put a find: by a bin, a tree, a pole... 18-75 m away, not next to another find
    spot(px, pz, kinds, out) {
      const cands = [];
      this.world.each3x3(px, pz, c => {
        for (const o of c.obstacles) {
          if (!kinds.includes(o.kind)) continue;
          const d = Math.hypot(o.x - px, o.z - pz);
          if (d < 18 || d > 75) continue;
          if (this.targets.some(t => Math.hypot(t.x - o.x, t.z - o.z) < 12)) continue;
          cands.push(o);
        }
      });
      if (!cands.length) return false;
      const o = cands[Math.floor(this.rnd() * cands.length)];
      // out from the middle of the block (towards the street), clear of the thing itself
      const cx = Math.round(o.x / P) * P, cz = Math.round(o.z / P) * P;
      let dx = o.x - cx, dz = o.z - cz;
      if (Math.abs(dx) > Math.abs(dz)) { dx = Math.sign(dx); dz = 0; } else { dz = Math.sign(dz); dx = 0; }
      const off = Math.max(o.hx, o.hz) + out;
      return { x: o.x + dx * off, z: o.z + dz * off };
    }
    add(kind, px, pz) {
      const rnd = this.rnd;
      let t = null;
      if (kind === 'clew') {
        const seen = this.seenColor(), left = RAINBOW.filter(c => !seen.includes(c) && !this.targets.some(x => x.colorId === c));
        const cid = (left.length ? left : RAINBOW)[Math.floor(rnd() * (left.length || RAINBOW.length))];
        const at = this.spot(px, pz, ['trash_can', 'dumpster'], 0.7);
        if (at) { t = { kind, colorId: cid, ...at, obj: clewMesh(COLORS[cid][0], rnd), untangle: 0 }; t.obj.position.set(t.x, 0.46, t.z); t.obj.scale.setScalar(1.5); }
      } else if (kind === 'ball') {
        const at = this.spot(px, pz, ['tree'], 0.6);
        if (at) { t = { kind, colorId: 'yellow', ...at, obj: ballMesh() }; t.obj.position.set(t.x, 0, t.z); }
      } else if (kind === 'sausage') {
        const at = this.spot(px, pz, ['prop'], 0.7);
        if (at) { t = { kind, colorId: 'brown', ...at, obj: sausageMesh() }; t.obj.position.set(t.x, 0, t.z); t.obj.rotation.y = rnd() * 6; }
      } else if (kind === 'mark') {
        const at = this.spot(px, pz, ['pole'], 0.35);
        if (at) { t = { kind, colorId: 'blue', ...at, obj: markMesh(), sniff: 0 }; t.obj.position.set(t.x, 0, t.z); }
      }
      if (!t) return null;
      t.color = COLORS[t.colorId][0];
      this.scene.add(t.obj);
      this.targets.push(t); this.dirty = true;
      return t;
    }
    remove(t) { this.scene.remove(t.obj); t.obj.traverse(o => { if (o.geometry) o.geometry.dispose(); }); this.targets.splice(this.targets.indexOf(t), 1); this.dirty = true; }
    // a found thing: a puff of its colour; its colour counts for the rainbow; a new one later elsewhere
    found(t, ev, text, player) {
      this.fx.emit(t.x, 0.5, t.z, { color: t.color, count: 18, speed: 4, up: 3, size: 0.3, opacity: 0.95, life: 0.9 });
      this.au.chime(); setTimeout(() => this.au.pick(8), 160);
      this.quest(ev);
      if (this.k > 0.2 || this.on) this.quest('rainbow', 1, t.colorId);
      this.say(text);
      this.respawnT[t.kind] = 6;
      this.remove(t);
      void player;
    }
    // the threads: one trail to each find within reach (and the cat), plus a few loose threads of other
    // smells leading off; rebuilt from where the dog is when it starts sniffing or wanders off a trail
    rebuild(px, pz, cat) {
      const rnd = this.rnd, lines = [];
      const from = { x: px, z: pz };
      for (const t of this.targets) {
        if (Math.hypot(t.x - px, t.z - pz) > MAX_TRAIL) { t.trail = null; continue; }
        if (!t.trail || t.trailFar) { t.trail = trail(from, { x: t.x, z: t.z }, rnd); t.trailFar = false; }
        for (const l of t.trail.lines) lines.push({ ...l, color: t.color });
      }
      if (cat) {
        if (!this.catTrail || this.catTrail.far || Math.hypot(this.catTrail.end.x - cat.x, this.catTrail.end.z - cat.z) > 5) {
          this.catTrail = Math.hypot(cat.x - px, cat.z - pz) < MAX_TRAIL ? { ...trail(from, { x: cat.x, z: cat.z }, rnd), end: { x: cat.x, z: cat.z } } : null;
        }
        if (this.catTrail) for (const l of this.catTrail.lines) lines.push({ ...l, color: COLORS.violet[0] });
      }
      if (!this.decoys.length || this.decoyFar) {
        this.decoyFar = false;
        this.decoys = [];
        for (let i = 0; i < 4; i++) {
          const h = rnd() * Math.PI * 2, len = 7 + rnd() * 12, s = { x: px + Math.sin(h) * 1.5, z: pz + Math.cos(h) * 1.5 };
          const pts = [s]; wobble(s, { x: s.x + Math.sin(h) * len, z: s.z + Math.cos(h) * len }, len * 0.2, 5, rnd, pts);
          const cid = Object.keys(COLORS)[Math.floor(rnd() * 8)];
          this.decoys.push({ pts, w: 0.11, tip: true, t0: 0, color: COLORS[cid][0] });
        }
      }
      for (const d of this.decoys) lines.push(d);
      this.build(lines);
      this.origin = from; this.dirty = false;
    }
    build(lines) {
      const P3 = [], CC = [], T = [], A = [], S = [], col = new THREE.Color();
      for (const l of lines) {
        const pts = l.pts, n = pts.length;
        let along = l.t0 || 0, total = 0;
        for (let i = 1; i < n; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        col.setHex(l.color);
        let run = 0;
        for (let i = 1; i < n; i++) {
          const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1e-3;
          const nx = -dz / len * l.w / 2, nz = dx / len * l.w / 2;
          // a branch fades out towards its tip; a trail is brightest close to the find
          const fa = l.tip ? 0.85 * (1 - run / total) : 0.75 + 0.25 * run / total, fb = l.tip ? 0.85 * (1 - (run + len) / total) : 0.75 + 0.25 * (run + len) / total;
          const q = [[a.x - nx, a.z - nz, along, fa, -1], [a.x + nx, a.z + nz, along, fa, 1], [b.x + nx, b.z + nz, along + len, fb, 1],
            [a.x - nx, a.z - nz, along, fa, -1], [b.x + nx, b.z + nz, along + len, fb, 1], [b.x - nx, b.z - nz, along + len, fb, -1]];
          for (const v of q) { P3.push(v[0], Y, v[1]); CC.push(col.r, col.g, col.b); T.push(v[2]); A.push(v[3]); S.push(v[4]); }
          along += len; run += len;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P3, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(CC, 3));
      g.setAttribute('aT', new THREE.Float32BufferAttribute(T, 1));
      g.setAttribute('aA', new THREE.Float32BufferAttribute(A, 1));
      g.setAttribute('aSide', new THREE.Float32BufferAttribute(S, 1));
      this.mesh.geometry.dispose();
      this.mesh.geometry = g;
      this.segments = P3.length / 18;
    }
    // is the dog still near this trail? (every 4th point is enough)
    static near(tr, px, pz, r) {
      if (!tr) return true;
      for (let i = 0; i < tr.main.length; i += 4) if (Math.abs(tr.main[i].x - px) < r && Math.abs(tr.main[i].z - pz) < r) return true;
      return false;
    }
    setOn(v) {
      v = !!v;
      if (v === this.on) return;
      this.on = v;
      if (v) { this.sniffT = 0; this.dirty = true; } else this.decoys = [];
    }
    update(dt, player, cat, input, night) {
      this.time += dt;
      const px = player.x, pz = player.z, slow = player.vel < SLOW;
      // the nose: E / the nose button. Only at a walk or a trot: from a faster gear it drops to a trot;
      // shifting up to a run (or galloping off) lifts the nose
      if (input.consumeScent()) {
        if (!this.on && input.camLock && input.gear > 2) input.setGear(2);
        this.setOn(!this.on);
        if (this.on) this.au.sniff();
      }
      if (this.on && ((input.camLock && input.gear > 2) || (!input.camLock && !slow) || player.air && player.vel > SLOW)) this.setOn(false);
      player.sniff = this.on;
      this.k = damp(this.k, this.on ? 1 : 0, this.on ? 2.2 : 3.5, dt);
      if (this.on) {
        this.sniffT -= dt;
        if (this.sniffT <= 0) { this.sniffT = 1.1 + Math.random() * 0.6; this.au.sniff(); }
        this.noseT += dt;
        if (this.noseT >= 1) { this.noseT -= 1; this.quest('nose', 1); }
      }
      // keep finds round the dog: three clews, a ball, a sausage, a mark; far ones go, new ones come
      for (const t of [...this.targets]) if (Math.hypot(t.x - px, t.z - pz) > 140) this.remove(t);
      for (const [kind, n] of [['clew', 3], ['ball', 1], ['sausage', 1], ['mark', 1]]) {
        if (this.respawnT[kind] > 0) { this.respawnT[kind] -= dt; continue; }
        if (this.targets.filter(t => t.kind === kind).length < n && this.add(kind, px, pz) === null) this.respawnT[kind] = 2;
      }
      // finding things
      for (const t of [...this.targets]) {
        const d = Math.hypot(t.x - px, t.z - pz);
        if (t.kind === 'clew') {
          // sniff it for a moment (at a walk or standing) and it comes untangled
          const close = d < 1.8 && this.on;
          t.untangle = clamp((t.untangle || 0) + (close ? dt / 1.6 : -dt / 2), 0, 1);
          t.obj.rotation.y += dt * (0.4 + 5 * t.untangle);
          t.obj.scale.setScalar(1.5 * (1 - 0.45 * t.untangle));   // (a clew is half a metre across)
          if (t.untangle >= 1) this.found(t, 'clew', 'Клубок распутан! ' + cap(COLORS[t.colorId][1]) + ' след', player);
        } else if (t.kind === 'ball' && d < 1.3 && player.y < 1) this.found(t, 'ball', 'Мячик нашёлся!', player);
        else if (t.kind === 'sausage' && d < 1.2 && player.y < 1) { if (player.ent && player.ent.trigger) player.ent.trigger('eat'); this.found(t, 'sausage', 'Колбаска! Ням', player); }
        else if (t.kind === 'mark') {
          t.sniff = clamp(t.sniff + (d < 1.6 && this.on ? dt / 1.0 : -dt), 0, 1);
          if (t.sniff >= 1) this.found(t, 'mark', 'Чужая метка: обнюхал и оставил свою', player);
        }
        if (t.obj && t.obj.children) for (const c of t.obj.children) if (c.isSprite) c.material.opacity = 0.35 + 0.45 * this.k + 0.1 * Math.sin(this.time * 3 + t.x);
      }
      // the cat in hiding: creep up to it along the violet thread, at a walk or a trot
      if (cat) {
        if (cat.dist > 20) this.stalked = false;
        if (!this.stalked && this.k > 0.3 && cat.dist < 3.5 && slow) { this.stalked = true; this.quest('stalk'); this.quest('rainbow', 1, 'violet'); this.say('Подкрался к коту!'); }
      }
      this.smoke.update(dt, this.targets.filter(t => t.kind === 'clew'), this.k);
      // the threads
      if (this.k > 0.01) {
        this.checkT -= dt;
        if (this.on && this.checkT <= 0) {
          this.checkT = 1;
          for (const t of this.targets) if (t.trail && !R.Search.near(t.trail, px, pz, 10)) { t.trailFar = true; this.dirty = true; }
          if (this.catTrail && (!R.Search.near(this.catTrail, px, pz, 10) || Math.hypot(this.catTrail.end.x - cat.x, this.catTrail.end.z - cat.z) > 5)) { this.catTrail.far = true; this.dirty = true; }
          if (!this.catTrail && cat && cat.dist < MAX_TRAIL) this.dirty = true;
          if (this.origin && Math.hypot(this.origin.x - px, this.origin.z - pz) > 14) { this.decoyFar = true; this.dirty = true; }
          if (this.targets.some(t => !t.trail && Math.hypot(t.x - px, t.z - pz) < MAX_TRAIL)) this.dirty = true;
        }
        if (this.dirty && this.on) this.rebuild(px, pz, cat);
      }
      this.mesh.visible = this.k > 0.01;
      const U = this.mat.uniforms;
      U.uTime.value = this.time; U.uK.value = this.k; U.uDog.value.set(px, pz); U.uNight.value = night || 0;
    }
    debug() { return { targets: this.targets, segments: this.segments || 0, catTrail: this.catTrail }; }
  };
  const cap = s => s[0].toUpperCase() + s.slice(1);
  R.Search.COLORS = COLORS;
  R.Search.RAINBOW = RAINBOW;
})(window.R = window.R || {});
