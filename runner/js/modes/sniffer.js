(function (R) {
  const C = R.C, P = C.P;
  const LINE = 24.3;               // the sniffing line: the middle of the sidewalk round a block
  const STEP = 1.2;                // metres between scent puffs
  const NOSE_SPEED = 7;            // nose to the ground: no galloping
  const SEE = 26;                  // how far the nose reaches

  // scent colours: [hex, "по ... следу"]
  const COLORS = [[0xff5fd2, 'розовому'], [0x4fd8ff, 'голубому'], [0xffd84a, 'жёлтому'], [0xa77bff, 'фиолетовому'], [0x6dff7a, 'зелёному'], [0xff8a3c, 'оранжевому']];
  const DECOY_TEXT = ['Тут прошёл соседский кот. Не то!', 'Пахнет колбасой… Не отвлекайся!', 'Это другая собака метила столбик', 'Фу, мусорный бак!', 'Здесь пробежал ёжик. Не наш запах'];

  const PEOPLE = {
    grandma: { colors: { Shirt: 0x7a4a9a, Pants: 0x4a3a5a, Hair: 0xd8d8d8, Socks: 0x6a6a6a }, scale: 0.92 },
    boy:     { colors: { Shirt: 0xd23a2a, Pants: 0x2a4a8a, Hair: 0x3a2414 }, scale: 0.7 },
    girl:    { colors: { Shirt: 0xf08ab0, Pants: 0x5a7ac0, Hair: 0xa0601c }, scale: 0.76 },
    baker:   { colors: { Shirt: 0xf2f2ee, Pants: 0x8a8a8a, Hair: 0x2a1a10 }, scale: 1 },
  };
  const CASES = [
    { who: 'grandma', title: 'Ключи бабушки', clue: 'glove', clueName: 'перчатку', item: 'keys', find: 'dig',
      hello: 'Бабушка: «Ох, потеряла ключи! Понюхай мою перчатку, найди их»', got: 'Ключи! Неси бабушке', thanks: 'Бабушка: «Вот умница! Держи косточку»' },
    { who: 'boy', title: 'Мячик Пети', clue: 'cap', clueName: 'кепку', item: 'ball', find: 'grab',
      hello: 'Петя: «Мой мячик укатился! Вот кепка, она пахнет как он»', got: 'Мячик! Неси Пете', thanks: 'Петя: «Ура! Ты лучший нюхач»' },
    { who: 'girl', title: 'Котёнок Маши', clue: 'bow', clueName: 'бантик', item: 'kitten', find: 'kitten',
      hello: 'Маша: «Котёнок Пушок убежал! Понюхай его бантик»', got: 'Пушок нашёлся! Веди его к Маше, не беги быстро', thanks: 'Маша: «Пушок! Спасибо, пёсик!»' },
    { who: 'baker', title: 'Пирожки пекаря', clue: 'tray', clueName: 'противень', item: 'basket', find: 'fox',
      hello: 'Пекарь: «Кто-то утащил корзину пирожков! Понюхай противень»', got: 'Корзина у тебя! Неси пекарю', thanks: 'Пекарь: «Пирожки спасены! Держи косточки»' },
  ];
  const ITEM_NAME = { keys: 'ключи', ball: 'мячик', basket: 'корзину', kitten: 'котёнка' };

  let dogEnt, humanTpl, foxEnt, kitEnt;
  let player, el, S = null, scentMat;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---- little props -----------------------------------------------------------------------
  const lam = c => new THREE.MeshLambertMaterial({ color: c });
  function thing(kind) {
    const g = new THREE.Group();
    const add = (geo, c, x, y, z) => { const m = new THREE.Mesh(geo, lam(c)); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; g.add(m); return m; };
    if (kind === 'glove') { add(new THREE.BoxGeometry(0.26, 0.06, 0.16), 0xb0303a, 0, 0.03); add(new THREE.BoxGeometry(0.07, 0.05, 0.12), 0xb0303a, 0.15, 0.03, -0.04); }
    else if (kind === 'cap') { const m = add(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xd23a2a); add(new THREE.BoxGeometry(0.18, 0.02, 0.14), 0xd23a2a, 0, 0.01, 0.17); m.position.y = 0; }
    else if (kind === 'bow') { add(new THREE.TorusGeometry(0.08, 0.035, 6, 10), 0xff7ab8, -0.08, 0.05).rotation.x = Math.PI / 2; add(new THREE.TorusGeometry(0.08, 0.035, 6, 10), 0xff7ab8, 0.08, 0.05).rotation.x = Math.PI / 2; }
    else if (kind === 'tray') { add(new THREE.BoxGeometry(0.5, 0.04, 0.36), 0x8a8f96, 0, 0.02); }
    else if (kind === 'keys') {
      const r = add(new THREE.TorusGeometry(0.07, 0.015, 6, 12), 0xd8c24a, 0, 0.02); r.rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(0.03, 0.015, 0.14), 0xd8c24a, 0.04, 0.02, 0.1); add(new THREE.BoxGeometry(0.03, 0.015, 0.12), 0xb8b8c0, -0.04, 0.02, 0.09);
    }
    else if (kind === 'ball') { add(new THREE.SphereGeometry(0.17, 14, 10), 0xe23b3b, 0, 0.17); add(new THREE.TorusGeometry(0.171, 0.02, 4, 16), 0xffffff, 0, 0.17); }
    else if (kind === 'basket') {
      add(new THREE.CylinderGeometry(0.22, 0.18, 0.18, 10), 0x9a6a34, 0, 0.09);
      for (let i = 0; i < 4; i++) add(new THREE.SphereGeometry(0.07, 8, 6), 0xd9a04e, Math.cos(i * 1.6) * 0.1, 0.19, Math.sin(i * 1.6) * 0.1).scale.set(1.3, 0.8, 1);
    }
    else if (kind === 'mound') {
      add(new THREE.CylinderGeometry(0.9, 1.0, 0.06, 12), 0x5a3f28, 0, 0.03);
      add(new THREE.SphereGeometry(0.45, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x6e4b2e, 0.1, 0.04).scale.set(1, 0.45, 0.8);
    }
    return g;
  }

  // ---- the city as a graph of sidewalk corners ---------------------------------------------------
  const corner = (ci, cj, sx, sz) => ({ ci, cj, sx, sz, x: ci * P + sx * LINE, z: cj * P + sz * LINE, key: ci + ',' + cj + ',' + sx + ',' + sz });
  const around = n => [
    corner(n.ci, n.cj, -n.sx, n.sz), corner(n.ci, n.cj, n.sx, -n.sz),       // along the block
    corner(n.ci + n.sx, n.cj, -n.sx, n.sz), corner(n.ci, n.cj + n.sz, n.sx, -n.sz), // across the street
  ];
  // a sidewalk spot near (x, z): on the side of the block closest to it
  function sideSpot(x, z, along) {
    const ci = Math.round(x / P), cj = Math.round(z / P), lx = x - ci * P, lz = z - cj * P;
    const t = R.clamp((Math.abs(lx) > Math.abs(lz) ? lz : lx) + (along || 0), -16, 16);
    if (Math.abs(lx) > Math.abs(lz)) { const s = Math.sign(lx) || 1; return { ci, cj, ax: 'x', s, x: ci * P + s * LINE, z: cj * P + t, nx: s, nz: 0 }; }
    const s = Math.sign(lz) || 1; return { ci, cj, ax: 'z', s, x: ci * P + t, z: cj * P + s * LINE, nx: 0, nz: s };
  }
  // polyline -> puffs every STEP metres, swaying a little side to side like a real nose path
  function sample(poly, sway) {
    const out = [];
    let s = 0;
    const ph = Math.random() * 6;
    for (let i = 0; i + 1 < poly.length; i++) {
      const a = poly[i], b = poly[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L < 0.01) continue;
      const ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
      for (let d = (i === 0 ? 0 : (STEP - (s % STEP)) % STEP); d < L; d += STEP) {
        const w = Math.sin((s + d) * 0.33 + ph) * sway * Math.min(1, d / 3, (L - d) / 3);
        out.push({ x: a.x + ux * d - uz * w, z: a.z + uz * d + ux * w });
      }
      s += L;
    }
    out.push({ x: poly[poly.length - 1].x, z: poly[poly.length - 1].z });
    return out;
  }
  // a trail from the clue: to a corner, a few blocks round the city, then part way along a side
  function makeTrail(start, edges, decoys) {
    const first = start.ax === 'x' ? corner(start.ci, start.cj, start.s, Math.random() < 0.5 ? 1 : -1)
                                   : corner(start.ci, start.cj, Math.random() < 0.5 ? 1 : -1, start.s);
    const path = [first], used = new Set([first.key]);
    // the other end of the clue's side stays free so no trail doubles back over the start
    used.add((start.ax === 'x' ? corner(start.ci, start.cj, start.s, -first.sz) : corner(start.ci, start.cj, -first.sx, start.s)).key);
    for (let e = 0; e < edges; e++) {
      const cur = path[path.length - 1];
      let best = null, bs = -1e9;
      for (const n of around(cur)) {
        if (used.has(n.key)) continue;
        const sc = Math.hypot(n.x - start.x, n.z - start.z) * 0.6 + Math.random() * 40;
        if (sc > bs) { bs = sc; best = n; }
      }
      if (!best) break;
      path.push(best); used.add(best.key);
    }
    // the hiding place: part way along a side next to the last corner (not the side we came along)
    const last = path[path.length - 1], prev = path[path.length - 2] || { x: start.x, z: start.z };
    // turn the corner: never back along the way we came
    const goX = !(Math.abs(prev.z - last.z) < 1);
    const d = rnd(7, 17);
    const end = goX ? { x: last.x - last.sx * d, z: last.z } : { x: last.x, z: last.z - last.sz * d };
    const poly = [{ x: start.x, z: start.z }, ...path, end];
    const pts = sample(poly, 0.55);
    // a swirl of scent where the thing is
    const swirl = pts.length;
    for (let i = 0; i < 14; i++) { const a = i * 0.9, r = 0.4 + (i % 4) * 0.25; pts.push({ x: end.x + Math.cos(a) * r, z: end.z + Math.sin(a) * r }); }
    let len = 0;
    for (let i = 1; i < poly.length; i++) len += Math.hypot(poly[i].x - poly[i - 1].x, poly[i].z - poly[i - 1].z);

    // false trails branch off at corners on the way
    const fakes = [];
    const spots = path.slice(0, -1).map((n, i) => i).sort(() => Math.random() - 0.5).slice(0, decoys);
    for (const i of spots) {
      const node = path[i];
      const opts = around(node).filter(n => !used.has(n.key));
      if (!opts.length) continue;
      const to = opts[Math.floor(Math.random() * opts.length)];
      used.add(to.key);
      const ux = to.x - node.x, uz = to.z - node.z, L = Math.hypot(ux, uz);
      const f = rnd(0.55, 0.95);
      const a = { x: node.x + ux / L * 1.6, z: node.z + uz / L * 1.6 }, b = { x: node.x + ux * f, z: node.z + uz * f };
      fakes.push({ pts: sample([a, b], 0.7), end: b, text: DECOY_TEXT[Math.floor(Math.random() * DECOY_TEXT.length)] });
    }
    return { pts, end, len, fakes, swirl };
  }

  // The trail is laid on the sidewalk line before the far blocks are built. Once a block is built in
  // detail, puffs that ended up inside something (a bus stop, a kiosk) step aside, and so does the hiding place.
  function blocked(world, x, z) {
    for (const o of world.obstaclesNear(x, z, 0.6)) {
      if (o.kind === 'traffic' || o.h < 0.45) continue;
      if (Math.abs(x - o.x) < o.hx + 0.5 && Math.abs(z - o.z) < o.hz + 0.5) return true;
    }
    return false;
  }
  const builtAt = (world, x, z) => { const cell = world.cells.get(Math.round(x / P) + ',' + Math.round(z / P)); return cell && cell.near; };
  const SHIFTS = [0.8, 1.6, 2.4, 3.2, 4];
  function settle(c, world) {
    const tr = c.trail;
    let changed = false;
    if (!c.endOk && builtAt(world, tr.end.x, tr.end.z)) {
      c.endOk = true;
      if (blocked(world, tr.end.x, tr.end.z)) {
        let spot = null;
        for (let r = 1; r <= 5 && !spot; r += 0.8) for (let a = 0; a < 6.28 && !spot; a += 0.52) {
          const x = tr.end.x + Math.cos(a) * r, z = tr.end.z + Math.sin(a) * r;
          if (!blocked(world, x, z)) spot = { x, z };
        }
        if (spot) {
          const dx = spot.x - tr.end.x, dz = spot.z - tr.end.z;
          tr.end.x = spot.x; tr.end.z = spot.z;
          for (let i = tr.swirl; i < tr.pts.length; i++) { tr.pts[i].x += dx; tr.pts[i].z += dz; tr.pts[i].ok = true; }
          if (c.mound) c.mound.position.set(spot.x, 0, spot.z);
          if (c.thing && c.thing.parent && c.thing.parent.isScene) c.thing.position.set(spot.x, 0, spot.z);
          if (c.kitten && c.kitten.state === 'hide') { c.kitten.x = spot.x; c.kitten.z = spot.z; }
          if (c.fox && c.foxState === 'eat') { c.fox.x = spot.x; c.fox.z = spot.z; }
          changed = true;
        }
      }
    }
    const sets = [{ pts: tr.pts, base: 0 }];
    let base = tr.pts.length;
    for (const f of tr.fakes) { sets.push({ pts: f.pts, base }); base += f.pts.length; }
    const pos = c.points.geometry.attributes.position;
    for (const st of sets) {
      const Q = st.pts;
      const put = (k, x, z) => { Q[k].x = x; Q[k].z = z; pos.setXYZ(st.base + k, x, 0, z); changed = true; };
      let i = 0;
      while (i < Q.length) {
        const p = Q[i];
        if (p.ok || !builtAt(world, p.x, p.z)) { i++; continue; }
        p.ok = true;
        if (!blocked(world, p.x, p.z)) { i++; continue; }
        // a run of puffs inside the same thing: move the whole run to one side, by one distance
        let j = i;
        while (j + 1 < Q.length && !Q[j + 1].ok && builtAt(world, Q[j + 1].x, Q[j + 1].z) && blocked(world, Q[j + 1].x, Q[j + 1].z)) { j++; Q[j].ok = true; }
        const a = Q[Math.max(0, i - 1)], b = Q[Math.min(Q.length - 1, j + 1)];
        let ux = b.x - a.x, uz = b.z - a.z;
        const L = Math.hypot(ux, uz);
        if (L < 0.01) { ux = 1; uz = 0; } else { ux /= L; uz /= L; }
        let best = null;
        for (const d of SHIFTS) {
          for (const sg of [1, -1]) {
            let free = true;
            for (let k = i; k <= j && free; k++) if (blocked(world, Q[k].x - uz * d * sg, Q[k].z + ux * d * sg)) free = false;
            if (free) { best = { ox: -uz * d * sg, oz: ux * d * sg }; break; }
          }
          if (best) break;
        }
        if (best) {
          for (let k = i; k <= j; k++) put(k, Q[k].x + best.ox, Q[k].z + best.oz);
          // ease into and out of the detour
          for (const [k, f] of [[i - 1, 0.6], [i - 2, 0.3], [j + 1, 0.6], [j + 2, 0.3]]) {
            if (k < 0 || k >= Q.length) continue;
            const x = Q[k].x + best.ox * f, z = Q[k].z + best.oz * f;
            if (!blocked(world, x, z)) put(k, x, z);
          }
        }
        i = j + 1;
      }
    }
    if (changed) {
      tr.pts.forEach((p, i) => pos.setXYZ(i, p.x, 0, p.z));
      pos.needsUpdate = true;
    }
  }

  // ---- scent puffs: one Points object for the real trail and the false ones ----------------------
  function scentMaterial() {
    return new THREE.ShaderMaterial({
      // normal blending: additive glow is lost on a sunny sidewalk
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uNose: { value: 0 }, uProg: { value: 0 }, uDog: { value: new THREE.Vector3() }, uScale: { value: 400 }, uSee: { value: SEE } },
      vertexShader: `
        attribute vec3 color; attribute float aIdx; attribute float aKind; attribute float aGone;
        uniform float uTime, uNose, uProg, uScale, uSee; uniform vec3 uDog;
        varying vec3 vCol; varying float vA;
        void main() {
          vec3 p = position;
          float ph = aIdx * 0.37 + aKind * 3.1;
          p.y = 0.22 + 0.22 * (0.5 + 0.5 * sin(uTime * 1.7 + ph));
          p.x += 0.14 * sin(uTime * 1.3 + ph * 2.1);
          p.z += 0.14 * cos(uTime * 1.1 + ph * 1.7);
          float d = distance(p.xz, uDog.xz);
          float a = uNose * (1.0 - smoothstep(uSee * 0.55, uSee, d)) * (1.0 - aGone);
          // a wave running towards the end of the trail shows the way
          a *= 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * 5.0 - aIdx * 0.55));
          if (aKind < 0.5 && aIdx < uProg - 8.0) a *= 0.3;
          vA = a; vCol = color;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uScale * 0.42 / max(0.5, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vCol; varying float vA;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float a = vA * smoothstep(1.0, 0.25, r) * 0.9;
          if (a < 0.01) discard;
          gl_FragColor = vec4(mix(vCol, vec3(1.0), smoothstep(0.45, 0.0, r) * 0.55), a);
        }`,
    });
  }
  function scentPoints(trails) {
    const pos = [], col = [], idx = [], kind = [];
    for (const tr of trails) {
      const c = new THREE.Color(tr.color);
      tr.pts.forEach((p, i) => { pos.push(p.x, 0, p.z); col.push(c.r, c.g, c.b); idx.push(i); kind.push(tr.kind); });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aIdx', new THREE.Float32BufferAttribute(idx, 1));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
    g.setAttribute('aGone', new THREE.Float32BufferAttribute(new Float32Array(idx.length), 1));
    const pts = new THREE.Points(g, scentMat);
    pts.frustumCulled = false; pts.renderOrder = 3;
    return pts;
  }

  // a kitten slips under benches, bins and parked cars
  const KIT_SKIP = { prop: 1, box: 1, trash_can: 1, trash_bag: 1, cone: 1, planter_bushes: 1, fence_piece: 1, pole: 1, tree: 1, car: 1, flower_pot: 1 };
  // ---- the kitten that follows the dog home -----------------------------------------------------
  class Kitten {
    constructor(ent) {
      this.ent = ent; this.root = new THREE.Group(); this.root.add(ent.root); this.root.scale.setScalar(0.62);
      this.x = 0; this.z = 0; this.y = 0; this.h = 0; this.speed = 0; this.state = 'hide'; this.meowT = 2;
      this.crumbs = [];   // where the dog has been: the kitten walks the same way (round corners, not through walls)
    }
    follow() { this.state = 'follow'; this.crumbs = [{ x: player.x, z: player.z }]; }
    update(dt, world, au, say) {
      const d = Math.hypot(player.x - this.x, player.z - this.z);
      this.meowT -= dt;
      if (this.state === 'hide' || this.state === 'lost') {
        this.speed = 0;
        if (this.meowT <= 0 && d < 28) { this.meowT = rnd(2.5, 4); au.meow(); }
        if (this.state === 'lost' && d < 3) { this.follow(); say('Пушок снова с тобой'); }
      } else if (this.state === 'follow') {
        const cr = this.crumbs, last = cr[cr.length - 1];
        if (!player.air && Math.hypot(player.x - last.x, player.z - last.z) > 0.7) cr.push({ x: player.x, z: player.z });
        while (cr.length > 1 && Math.hypot(cr[0].x - this.x, cr[0].z - this.z) < 0.6) cr.shift();
        // too far behind along the dog's path: it sits down and waits
        let behind = Math.hypot(cr[0].x - this.x, cr[0].z - this.z);
        for (let i = 1; i < cr.length; i++) behind += Math.hypot(cr[i].x - cr[i - 1].x, cr[i].z - cr[i - 1].z);
        if (behind > 24) { this.state = 'lost'; this.meowT = 0.3; say('Пушок отстал! Вернись за ним', 'bad'); }
        // catch up along the crumbs, keep a little gap to the dog
        const q = cr[0], ex = q.x - this.x, ez = q.z - this.z, e = Math.hypot(ex, ez);
        const want = d < 1.6 ? 0 : R.clamp(behind * 1.6, 2, 10);
        this.speed = R.damp(this.speed, want, 6, dt);
        if (e > 0.05) this.h += R.angDiff(this.h, Math.atan2(-ex, -ez)) * (1 - Math.exp(-10 * dt));
        this.x += -Math.sin(this.h) * this.speed * dt; this.z += -Math.cos(this.h) * this.speed * dt;
        world.resolve(this, 0.25, KIT_SKIP);
      }
      this.root.position.set(this.x, this.y, this.z);
      this.root.rotation.y = this.h;
      this.ent.update(dt, { speed01: R.clamp(this.speed / 11, 0, 1), air: false });
    }
  }

  // ---- edge markers (same look as the guard's) ----------------------------------------------------
  const V = new THREE.Vector3();
  function mark(elm, x, y, z, camera, kind, text) {
    V.set(x, y, z).project(camera);
    let sx = V.x, sy = V.y;
    const behind = V.z > 1;
    if (behind) { sx = -sx; sy = -sy; }
    const edge = behind || Math.abs(sx) > 0.9 || Math.abs(sy) > 0.85;
    if (edge) { const m = Math.max(Math.abs(sx) / 0.9, Math.abs(sy) / 0.85); sx /= m; sy /= m; }
    elm.style.transform = 'translate(' + ((sx * 0.5 + 0.5) * innerWidth).toFixed(0) + 'px,' + ((-sy * 0.5 + 0.5) * innerHeight).toFixed(0) + 'px)';
    elm.className = 'mk ' + kind + (edge ? ' edge' : '');
    elm.firstChild.style.transform = 'rotate(' + Math.atan2(-sy, sx).toFixed(2) + 'rad)';
    elm.lastChild.textContent = text;
    elm.hidden = false;
  }

  // ---- a case -------------------------------------------------------------------------------------
  function clearCase(ctx) {
    if (!S || !S.c) return;
    const c = S.c, sc = ctx.scene;
    for (const o of [c.npc && c.npc.root, c.clue, c.thing, c.mound, c.points, c.kitten && c.kitten.root, c.fox && c.fox.root]) if (o) sc.remove(o);
    if (c.carried) player.lean.remove(c.carried);
    if (c.points) c.points.geometry.dispose();
    S.c = null;
  }

  function newCase(ctx, near) {
    clearCase(ctx);
    const def = CASES[S.k % CASES.length];
    const lvl = S.solved;
    // the client stands on the nearest sidewalk, a little ahead of the dog
    const spot = sideSpot(near.x, near.z, rnd(-6, 6));
    const c = { def, state: 'meet', t: 0, lvl, spot, dug: 0, decoysSeen: new Set() };
    const tpl = PEOPLE[def.who];
    c.npc = humanTpl.spawn(tpl.colors);
    c.npc.root.scale.setScalar(tpl.scale);
    // a step off the line, facing the street
    c.npc.root.position.set(spot.x - spot.nx * 1.3, 0, spot.z - spot.nz * 1.3);
    c.npc.root.rotation.y = Math.atan2(spot.nx, spot.nz) + Math.PI;
    c.npc.play('idle');
    c.home = { x: spot.x, z: spot.z };
    // what the dog has to sniff, lying on the sidewalk
    c.clue = thing(def.clue);
    c.clue.position.set(spot.x + spot.nx * 0.2, 0, spot.z + spot.nz * 0.2);
    ctx.scene.add(c.npc.root, c.clue);
    // the trail is laid now, shown once the scent is learnt
    const col = COLORS[(S.k * 2 + 1) % COLORS.length];
    c.color = col;
    const tr = makeTrail(spot, 3 + Math.min(lvl, 5), Math.min(1 + Math.floor(lvl / 2), 4));
    c.trail = tr;
    // freshness only runs out while the dog is off the trail (following it keeps the scent fresh)
    c.freshMax = Math.round(Math.max(16, 28 - Math.min(lvl, 8) * 1.5));
    c.lastGot = 0;
    c.fresh = c.freshMax;
    const others = COLORS.filter(x => x !== col);
    tr.fakes.forEach((f, i) => { f.color = others[(i + S.k) % others.length]; });
    c.points = scentPoints([{ pts: tr.pts, color: col[0], kind: 0 }].concat(tr.fakes.map((f, i) => ({ pts: f.pts, color: f.color[0], kind: 1 + i }))));
    c.points.visible = false;
    ctx.scene.add(c.points);
    // the lost thing
    const e = tr.end;
    if (def.find === 'dig') { c.mound = thing('mound'); c.mound.position.set(e.x, 0, e.z); ctx.scene.add(c.mound); }
    else if (def.find === 'grab') { c.thing = thing(def.item); c.thing.position.set(e.x, 0, e.z); ctx.scene.add(c.thing); }
    else if (def.find === 'kitten') { c.kitten = new Kitten(kitEnt); c.kitten.x = e.x; c.kitten.z = e.z; ctx.scene.add(c.kitten.root); c.kitten.update(0, ctx.world, ctx.au, ctx.say); }
    else if (def.find === 'fox' && foxEnt) {
      c.fox = new R.Cat(foxEnt); c.fox.x = e.x; c.fox.z = e.z; c.fox.heading = Math.random() * 6.28;
      c.fox.root.position.set(e.x, 0, e.z);
      c.thing = thing('basket'); c.thing.position.set(0, 0.35, -0.5); c.fox.root.add(c.thing);
      c.foxState = 'eat';
      ctx.scene.add(c.fox.root);
    } else { c.thing = thing('basket'); c.thing.position.set(e.x, 0, e.z); ctx.scene.add(c.thing); }
    S.c = c;
    el.caseN.textContent = S.k + 1; el.caseT.textContent = def.title;
    el.chip.style.background = '#' + col[0].toString(16).padStart(6, '0');
    S.nose = false;
  }

  function carry(ctx, kind) {
    const c = S.c;
    const m = thing(kind);
    m.position.set(0, kind === 'basket' ? -0.17 : -0.09, -0.62);   // lean pivots 0.35 m up
    m.scale.setScalar(kind === 'basket' ? 0.8 : kind === 'keys' ? 1.8 : 1);
    player.lean.add(m);
    c.carried = m;
  }

  function finish(ctx, ok) {
    const c = S.c;
    c.state = 'over'; c.t = ok ? 3 : 3.5;
    if (ok) {
      const bonus = 10 + Math.round(10 * c.fresh / c.freshMax) + c.lvl * 2;
      S.bones += bonus; S.solved++;
      if (S.bones > S.best) { S.best = S.bones; try { localStorage.setItem('sniffer-best', S.best); } catch (e) {} }
      ctx.say(c.def.thanks + '  +' + bonus, 'long');
      ctx.au.chime(); ctx.au.bark(380);
      if (dogEnt.trigger) dogEnt.trigger('attack');
      c.npc.play('clapping');
      if (c.carried) { player.lean.remove(c.carried); c.carried = null; }
      ctx.fx.emit(player.x, 1, player.z, { color: 0xffe27a, count: 14, speed: 5, up: 3, size: 0.25, opacity: 0.95, life: 0.7 });
    } else {
      ctx.say('Запах выветрился… ' + c.def.title + ': не нашли', 'bad');
      ctx.au.alert && ctx.au.alert();
      c.points.visible = false;
    }
    S.nose = false;
  }

  // ---- scent you pick up like coins: experience, levels of the nose -------------------------------
  // level n -> n+1 costs 100, 160, 220, ... puffs
  function levelOf(xp) { let L = 1, need = 100; while (xp >= need) { xp -= need; L++; need += 60; } return { L, xp, need }; }
  function perk() {
    const L = levelOf(S.xp).L - 1;
    return { see: SEE * Math.min(1.6, 1 + 0.08 * L), drain: Math.max(0.5, 1 - 0.07 * L), reach: Math.min(2.4, 1.7 + 0.1 * L) };
  }
  function collect(c, ctx) {
    if (S.noseA < 0.5) return;
    const pts = c.trail.pts, gone = c.points.geometry.attributes.aGone, reach = perk().reach;
    let got = 0;
    for (let i = 0; i < c.trail.swirl; i++) {
      const p = pts[i];
      if (p.got || Math.abs(p.x - player.x) > reach || Math.abs(p.z - player.z) > reach) continue;
      if (Math.hypot(p.x - player.x, p.z - player.z) > reach) continue;
      p.got = true; gone.setX(i, 1); got++;
      ctx.fx.emit(p.x, 0.35, p.z, { color: c.color[0], count: 2, speed: 1.2, up: 1.6, size: 0.18, opacity: 0.9, life: 0.35 });
    }
    if (!got) return;
    gone.needsUpdate = true;
    const before = levelOf(S.xp).L;
    S.xp += got; c.lastGot = S.time;
    c.fresh = Math.min(c.freshMax, c.fresh + 0.5 * got);
    S.streak = S.time - (S.lastPick || 0) < 1.2 ? (S.streak || 0) + got : 0;
    S.lastPick = S.time;
    ctx.au.pick(S.streak % 12);
    const after = levelOf(S.xp).L;
    if (after > before) { ctx.say('Нюх стал сильнее! Уровень ' + after, 'long'); ctx.au.chime(); }
    try { localStorage.setItem('sniffer-xp', S.xp); } catch (e) {}
  }
  // with the nose down near the trail, the dog follows it by itself unless steered hard
  function noseAssist(input) {
    const c = S.c;
    if (!c || c.state !== 'track' || S.noseA < 0.5) return;
    if (input.dirMode ? !(input.dirMag > 0.15) : Math.abs(input.steer) > 0.5) return;
    const pts = c.trail.pts;
    let best = -1, bd = 1e9;
    for (let i = Math.max(0, c.prog - 3); i < Math.min(c.trail.swirl, c.prog + 12); i++) {
      if (pts[i].got) continue;
      const d = Math.hypot(pts[i].x - player.x, pts[i].z - player.z);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0 || bd > 4) return;
    const q = pts[Math.min(c.trail.swirl - 1, best + 2)];
    const want = Math.atan2(-(q.x - player.x), -(q.z - player.z));
    if (input.dirMode) {
      // the stick points roughly along the trail: the nose keeps the dog exactly on it
      const stick = Math.atan2(-input.dirX, -input.dirZ);
      if (Math.abs(R.angDiff(stick, want)) > 1.0) return;
      input.dirX = -Math.sin(want); input.dirZ = -Math.cos(want);
      return;
    }
    const d = R.angDiff(player.heading, want);
    input.steer = R.clamp(input.steer - d * 1.6, -1, 1);
  }

  R.modes = R.modes || {};
  R.modes.sniffer = {
    title: 'Нюхач',

    async load() {
      [dogEnt, humanTpl, foxEnt, kitEnt] = await Promise.all([
        R.makeShiba(), R.loadSkinned('../models/man.glb', { height: 1.8 }),
        R.makeAnimal('../models/fox.glb', 1.05), R.makeCat(),
      ]);
    },

    start(ctx) {
      const { scene, world, $ } = ctx;
      ctx.lockTheme('day');
      // sniffing needs a careful pace: no auto-run by default
      if (ctx.input.touch) { ctx.input.autoRun = false; const ab = $('autoBtn'); if (ab) ab.setAttribute('aria-pressed', 'false'); }
      player = new R.Player(dogEnt);
      player.halfLen = 0.33;
      scene.add(player.root);
      ctx.addBlob(player, 1.8);
      // the shiba lives by the park east of the runner's start
      player.x = P - LINE; player.z = -4; player.heading = 0;
      world.update(player.x, player.z, 99);
      scentMat = scentMaterial();
      el = {
        caseN: $('sCaseN'), caseT: $('sCaseT'), task: $('sTask'), fresh: $('sFresh'), bones: $('sBones'), best: $('sBest'),
        warm: $('sWarm'), warmBar: $('sWarmBar'), chip: $('sChip'), marks: $('marks'), noseFx: $('noseFx'),
        noseBtn: $('noseBtn'), digBtn: $('digBtn'), lvl: $('sLvl'), xp: $('sXp'), xpBar: $('sXpBar'),
      };
      const d = document.createElement('div'); d.className = 'mk'; d.hidden = true; d.innerHTML = '<i></i><b>!</b>';
      el.marks.appendChild(d); el.mark = d;
      let best = 0;
      try { best = +localStorage.getItem('sniffer-best') || 0; } catch (e) {}
      let xp = 0;
      try { xp = +localStorage.getItem('sniffer-xp') || 0; } catch (e) {}
      S = { k: 0, solved: 0, bones: 0, best, nose: false, noseA: 0, sniffT: 0, c: null, time: 0, xp, streak: 0, lastPick: 0 };
      el.best.textContent = best;
      newCase(ctx, { x: player.x, z: player.z - 10 });
      ctx.say('Нюхач. Помогай соседям: ищи по запаху', 'long');
      return player;
    },

    update(dt, ctx) {
      const { world, fx, au, input, camera } = ctx;
      const T = ctx.theme();
      const c = S.c;
      S.time += dt;

      // nose on / off
      if (input.consumeScent() && c && c.state !== 'over') { S.nose = !S.nose; if (S.nose) au.sniff(); }
      S.noseA = R.damp(S.noseA, S.nose ? 1 : 0, 6, dt);
      const cap = R.lerp(C.MAX_SPEED, NOSE_SPEED, S.noseA);
      if (player.speed > cap) player.speed = cap;
      player.sniff = S.nose;
      noseAssist(input);
      player.update(dt, input, world, fx, T);
      const v = player.vel;
      if (v > cap) { player.vx *= cap / v; player.vz *= cap / v; }
      if (S.nose) { S.sniffT -= dt; if (S.sniffT <= 0) { S.sniffT = rnd(1.1, 1.7); au.sniff(); } }
      const digging = input.consumeBite();

      scentMat.uniforms.uTime.value = S.time;
      scentMat.uniforms.uNose.value = S.noseA;
      scentMat.uniforms.uDog.value.set(player.x, 0, player.z);
      scentMat.uniforms.uSee.value = perk().see;
      scentMat.uniforms.uScale.value = ctx.renderer.getContext().drawingBufferHeight / (2 * Math.tan(camera.fov * Math.PI / 360));
      el.noseFx.style.opacity = (S.noseA * 0.9).toFixed(2);
      el.noseBtn.setAttribute('aria-pressed', String(S.nose));

      let task = '', markAt = null, markKind = 'unk', markText = '!', warm = -1;
      if (c) {
        const dHome = Math.hypot(player.x - c.home.x, player.z - c.home.z);
        c.npc.update(dt);
        // the client turns to the dog when it is close
        if (dHome < 8) c.npc.root.rotation.y = Math.atan2(c.npc.root.position.x - player.x, c.npc.root.position.z - player.z);
        if (c.clue) c.clue.rotation.y += dt * 0.6;

        if (c.state === 'meet') {
          task = 'Тебя ждут: беги к «!»';
          markAt = c.npc.root.position;
          if (dHome < 4.5) { c.state = 'clue'; ctx.say(c.def.hello, 'long'); au.bark(380); }
        } else if (c.state === 'clue') {
          task = 'Понюхай ' + c.def.clueName + ': подойди и включи нюх (' + (ctx.coarse ? 'кнопка «Нюх»' : 'E') + ')';
          markAt = c.clue.position; markKind = 'friend'; markText = '?';
          const dc = Math.hypot(player.x - c.clue.position.x, player.z - c.clue.position.z);
          if (dc < 2.4 && S.noseA > 0.5) {
            c.state = 'track'; c.points.visible = true; c.prog = 0;
            ctx.say('Запомнил запах! Иди по ' + c.color[1] + ' следу', 'long'); au.sniff(); au.chime();
            ctx.scene.remove(c.clue); c.clue = null;
          }
        } else if (c.state === 'track') {
          // the scent fades only while the dog is away from it
          if (S.time - c.lastGot > 2.5) c.fresh -= dt * perk().drain;
          settle(c, world);
          collect(c, ctx);
          task = 'Иди по ' + c.color[1] + ' следу. Нюх: ' + (ctx.coarse ? '«Нюх»' : 'E');
          // how far along the trail the dog has got, and how warm it is
          const pts = c.trail.pts;
          let dmin = 1e9;
          for (let i = 0; i < pts.length; i++) {
            const d = Math.hypot(pts[i].x - player.x, pts[i].z - player.z);
            if (d < 4.5 && i > c.prog) c.prog = i;
            if (i >= c.prog - 4 && d < dmin) dmin = d;
          }
          warm = dmin;
          scentMat.uniforms.uProg.value = c.prog;
          // false trails
          c.trail.fakes.forEach((f, i) => {
            if (!c.decoysSeen.has(i) && S.noseA > 0.5 && Math.hypot(f.end.x - player.x, f.end.z - player.z) < 3) {
              c.decoysSeen.add(i); ctx.say(f.text, 'bad'); au.sniff();
            }
          });
          const e = c.trail.end, dEnd = Math.hypot(e.x - player.x, e.z - player.z);
          const f = c.def.find;
          if (f === 'dig' && dEnd < 2.4) {
            task = 'Здесь! Рой: ' + (ctx.coarse ? 'жми «Рыть»' : 'жми G');
            if (!c.digHint) { c.digHint = true; ctx.say('Пахнет отсюда! Рой', 'long'); }
            if (digging) {
              c.dug++; au.dig();
              if (dogEnt.trigger) dogEnt.trigger('eat');
              fx.emit(e.x, 0.3, e.z, { color: 0x6e4b2e, count: 8, speed: 3, up: 2, size: 0.3, opacity: 0.8, life: 0.6 });
              c.mound.scale.y = Math.max(0.2, 1 - c.dug * 0.2);
              if (c.dug >= 4) { ctx.scene.remove(c.mound); c.mound = null; carry(ctx, c.def.item); c.state = 'back'; ctx.say(c.def.got, 'long'); au.chime(); }
            }
          } else if (f === 'grab' && dEnd < 1.8) {
            ctx.scene.remove(c.thing); c.thing = null; carry(ctx, c.def.item); c.state = 'back'; ctx.say(c.def.got, 'long'); au.chime();
          } else if (f === 'kitten' && dEnd < 2.6 && c.kitten.state === 'hide') {
            c.kitten.follow(); c.state = 'back'; ctx.say(c.def.got, 'long'); au.meow(); au.chime();
          } else if (f === 'fox' && c.foxState === 'eat' && dEnd < 13) {
            c.foxState = 'run'; c.state = 'chase'; S.nose = false;
            ctx.say('Лиса с корзиной! Догони её', 'long'); au.yelp();
          }
          if (c.state === 'track' && c.fresh <= 0) finish(ctx, false);
        } else if (c.state === 'chase') {
          task = 'Догони лису!';
          if (c.foxState === 'run') { markAt = c.fox.root.position; markKind = 'foe'; }
          if (c.foxState === 'run' && c.fox.dist < 2.0 && Math.abs(player.y - c.fox.y) < 1.1 && c.foxState === 'run') {
            // the fox lets go of the basket and runs off
            c.fox.root.remove(c.thing);
            c.thing.position.set(c.fox.x, 0, c.fox.z); ctx.scene.add(c.thing);
            c.foxState = 'gone'; c.foxT = 5;
            if (dogEnt.trigger) dogEnt.trigger('attack');
            au.yelp(); ctx.say('Лиса бросила корзину!');
            fx.emit(c.fox.x, 0.8, c.fox.z, { color: 0xffe27a, count: 10, speed: 5, up: 2.5, size: 0.25, opacity: 0.95, life: 0.6 });
          }
          if (c.foxState === 'gone') {
            markAt = c.thing.position; markKind = 'friend';
            task = 'Подбери корзину';
            if (Math.hypot(c.thing.position.x - player.x, c.thing.position.z - player.z) < 1.8) {
              ctx.scene.remove(c.thing); c.thing = null; carry(ctx, 'basket'); c.state = 'back'; ctx.say(c.def.got, 'long'); au.chime();
            }
          }
        } else if (c.state === 'back') {
          task = c.def.got;
          markAt = c.npc.root.position; markKind = 'friend'; markText = '♥';
          const kit = c.kitten;
          if (kit && kit.state === 'lost') { task = 'Пушок отстал! Вернись за ним'; markAt = kit.root.position; markKind = 'foe'; markText = '!'; }
          if (dHome < 3.2 && (!kit || kit.state === 'follow')) finish(ctx, true);
        } else if (c.state === 'over') {
          c.t -= dt;
          if (c.kitten && c.kitten.state === 'follow') c.kitten.state = 'home';
          if (c.t <= 0) { S.k++; newCase(ctx, { x: player.x - Math.sin(player.heading) * 14, z: player.z - Math.cos(player.heading) * 14 }); }
        }
        // the fox: eats in its hiding place, runs once found, vanishes after dropping the basket
        if (c && c.fox) {
          if (c.foxState === 'eat') { c.fox.root.position.set(c.fox.x, 0, c.fox.z); c.fox.root.rotation.y = c.fox.heading; foxEnt.update(dt, { speed01: 0, air: false }); }
          else if (c.foxState === 'run' || c.foxState === 'gone') {
            c.fox.update(dt, player, world);
            if (c.foxState === 'gone') { c.foxT -= dt; if (c.foxT <= 0) { ctx.scene.remove(c.fox.root); c.fox = null; } }
          }
        }
        if (c && c.kitten) c.kitten.update(dt, world, au, ctx.say);
      }

      // HUD
      const cc = S.c;
      el.task.textContent = task;
      el.bones.textContent = S.bones;
      const lv = levelOf(S.xp);
      el.lvl.textContent = lv.L; el.xp.textContent = lv.xp + ' / ' + lv.need;
      el.xpBar.style.transform = 'scaleX(' + (lv.xp / lv.need).toFixed(3) + ')';
      el.best.textContent = S.best;
      const fr = cc && (cc.state === 'track' || cc.state === 'clue' || cc.state === 'meet') ? cc.fresh / cc.freshMax : cc && cc.state !== 'over' ? 1 : 0;
      el.fresh.style.transform = 'scaleX(' + R.clamp(fr, 0, 1).toFixed(3) + ')';
      el.fresh.classList.toggle('low', fr < 0.25);
      if (warm >= 0) {
        const w = R.clamp(1 - (warm - 2) / 22, 0, 1);
        el.warm.textContent = warm < 3 ? 'горячо' : warm < 8 ? 'тепло' : warm < 16 ? 'прохладно' : 'холодно';
        el.warmBar.style.transform = 'scaleX(' + w.toFixed(3) + ')';
      } else { el.warm.textContent = '—'; el.warmBar.style.transform = 'scaleX(0)'; }
      if (markAt) mark(el.mark, markAt.x, (markAt.y || 0) + 2.2, markAt.z, camera, markKind, markText);
      else el.mark.hidden = true;
      el.digBtn.classList.toggle('hot', !!(cc && cc.state === 'track' && cc.def.find === 'dig' && Math.hypot(cc.trail.end.x - player.x, cc.trail.end.z - player.z) < 2.4));
    },

    // the map: the client to visit (or bring the find back to), the clue to sniff
    mapMarkers() {
      const c = S && S.c, out = [];
      if (!c) return out;
      if (c.npc && (c.state === 'meet' || c.state === 'back')) out.push({ x: c.npc.root.position.x, z: c.npc.root.position.z, color: '#45d483', label: 'хозяин' });
      if (c.clue && c.state === 'clue') out.push({ x: c.clue.position.x, z: c.clue.position.z, color: '#ffd36a', label: 'улика' });
      return out;
    },
    // music: quiet while walking about, a little more on the trail, a chase is tense
    tension() { const c = S && S.c; return !c ? 0.15 : c.state === 'chase' ? 0.85 : c.state === 'track' ? 0.32 : 0.15; },
    debug() { return { sniff: () => S }; },
  };
})(window.R = window.R || {});
