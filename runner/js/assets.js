(function (R) {
  // fit: which dimension `size` (meters) refers to: w = width (x), h = height (y), l = length (z)
  const MANIFEST = {
    // facades: baked at width 1, the world scales them to fit a slot
    building_red:        { fit: 'w', size: 1 },
    building_green:      { fit: 'w', size: 1 },
    gb_blank:            { fit: 'w', size: 1 },
    rb_blank:            { fit: 'w', size: 1 },
    brown_building:      { fit: 'w', size: 1 },
    big_building:        { fit: 'w', size: 1 },
    pizza_corner:        { fit: 'w', size: 1 },
    building_red_corner: { fit: 'w', size: 1 },
    // vehicles (nose = +Z)
    car:          { fit: 'l', size: 4.3 },
    car_b:        { fit: 'l', size: 3.7 },
    suv:          { fit: 'l', size: 4.5 },
    police_car:   { fit: 'l', size: 4.5 },
    sports_car:   { fit: 'l', size: 4.3 },
    pickup_truck: { fit: 'l', size: 5.2 },
    van:          { fit: 'l', size: 5.0 },
    bus:          { fit: 'l', size: 11 },
    motorcycle:   { fit: 'l', size: 2.1 },
    // street furniture
    bench:          { fit: 'w', size: 1.8 },
    trash_can:      { fit: 'h', size: 1.0 },
    dumpster:       { fit: 'h', size: 1.5 },
    cone:           { fit: 'h', size: 0.75 },
    fire_hydrant:   { fit: 'h', size: 0.9 },
    fence_piece:    { fit: 'h', size: 1.0 },
    fence_end:      { fit: 'h', size: 1.0 },
    traffic_light:  { fit: 'h', size: 6.2 },
    stop_sign:      { fit: 'h', size: 2.6 },
    bus_stop_sign:  { fit: 'h', size: 3.2 },
    bus_stop:       { fit: 'w', size: 4.6 },
    mailbox:        { fit: 'h', size: 1.15 },
    power_box:      { fit: 'h', size: 1.1 },
    planter_bushes: { fit: 'w', size: 2.1 },
    flower_pot:     { fit: 'h', size: 1.4 },
    tree:           { fit: 'h', size: 6.5 },
    box:            { fit: 'h', size: 0.85 },
    trash_bag:      { fit: 'h', size: 0.65 },
    manhole_cover:  { fit: 'w', size: 0.95 },
    debris_papers:  { fit: 'w', size: 1.4 },
    atm:            { fit: 'h', size: 2.1 },
  };

  const lib = {};
  const V = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), M = new THREE.Matrix4();
  const UP = new THREE.Vector3(0, 1, 0);

  // Collects geometry and merges it into one mesh per kind: solid, glass, facade, pool and one per texture.
  // buildings get the wall detail (bricks / plaster) in the solid material
  const WALLS = new Set(['building_red', 'building_green', 'gb_blank', 'rb_blank', 'brown_building', 'big_building', 'pizza_corner', 'building_red_corner']);

  const CHUNK = 40000;
  function aoGeo(P, D) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aDark', new THREE.Float32BufferAttribute(D, 1));
    return g;
  }
  // smaller vertex data for the graphics card: normals and colours in bytes, the surface id as a byte
  function compact(g) {
    const nr = g.attributes.normal, col = g.attributes.color, sf = g.attributes.aSurf;
    if (nr && nr.array instanceof Float32Array) {
      const a = nr.array, b = new Int8Array(a.length);
      for (let i = 0; i < a.length; i++) b[i] = Math.round(Math.max(-1, Math.min(1, a[i])) * 127);
      g.setAttribute('normal', new THREE.BufferAttribute(b, 3, true));
    }
    if (col && col.array instanceof Float32Array) {
      const a = col.array; let ok = true;
      for (let i = 0; i < a.length; i++) if (a[i] > 1 || a[i] < 0) { ok = false; break; }
      if (ok) {
        const b = new Uint8Array(a.length);
        for (let i = 0; i < a.length; i++) b[i] = Math.round(a[i] * 255);
        g.setAttribute('color', new THREE.BufferAttribute(b, col.itemSize, true));
      }
    }
    if (sf && sf.array instanceof Float32Array) g.setAttribute('aSurf', new THREE.BufferAttribute(Uint8Array.from(sf.array), 1));
  }

  class Batch {
    constructor() { this.solid = []; this.glass = []; this.facade = []; this.pool = []; this.ao = []; this.tex = new Map(); this.surf = 0; this.ops = []; this.opi = 0; }

    // The geometry work is queued, not done at once: the world builds a city block a few
    // milliseconds per frame (run / buildStep) instead of freezing for one long frame.
    _op(fn) { this.ops.push(fn); }
    run(deadline) {
      while (this.opi < this.ops.length) {
        if (performance.now() > deadline) return false;
        this.ops[this.opi++]();
      }
      this.ops.length = 0; this.opi = 0;
      return true;
    }

    addPart(kind, geo, map) {
      // every solid piece carries its surface type (they are merged, so all need the attribute)
      if (kind === 'solid' && !geo.attributes.aSurf) geo.setAttribute('aSurf', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(this.surf), 1));
      else if (kind !== 'solid' && geo.attributes.aSurf) geo.deleteAttribute('aSurf');
      if (kind === 'tex') {
        let e = this.tex.get(map.uuid);
        if (!e) { e = { map, list: [] }; this.tex.set(map.uuid, e); }
        e.list.push(geo);
      } else {
        if (kind === 'glass' && !geo.attributes.aRand) geo.setAttribute('aRand', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(1), 1));
        this[kind].push(geo);
      }
    }

    // ---- procedural helpers (vertex coloured) ----
    _color(geo, col, uv) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      const n = g.attributes.position.count, c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2]; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      if (!uv) g.deleteAttribute('uv');
      // the surface type comes from the colour (asphalt, slabs, grass ...), see world.js
      const s = (R.SURF && R.SURF.get(col)) || 0;
      g.setAttribute('aSurf', new THREE.BufferAttribute(new Float32Array(n).fill(s), 1));
      return g;
    }
    box(col, cx, cy, cz, sx, sy, sz, kind) { this._op(() => {
      const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(cx, cy, cz);
      this.addPart(kind || 'solid', this._color(g, col));
    }); }
    rect(col, cx, cz, w, d, y) { this._op(() => {
      const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); g.translate(cx, y || 0, cz);
      this.addPart('solid', this._color(g, col));
    }); }
    cyl(col, cx, cy, cz, rt, rb, h, seg, kind) { this._op(() => {
      const g = new THREE.CylinderGeometry(rt, rb, h, seg || 8); g.translate(cx, cy, cz);
      this.addPart(kind || 'solid', this._color(g, col));
    }); }
    sph(col, cx, cy, cz, r, kind) { this._op(() => {
      const g = new THREE.SphereGeometry(r, 8, 6); g.translate(cx, cy, cz);
      this.addPart(kind || 'solid', this._color(g, col));
    }); }
    cone(col, cx, cy, cz, r, h) { this._op(() => {
      const g = new THREE.ConeGeometry(r, h, 8); g.translate(cx, cy, cz);
      this.addPart('solid', this._color(g, col));
    }); }
    // textured far-away facade box; uv repeats with the wall size so windows keep their scale
    facadeBox(col, cx, cy, cz, sx, sy, sz) { this._op(() => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      const uv = g.attributes.uv, nrm = g.attributes.normal;
      for (let i = 0; i < uv.count; i++) {
        const horiz = Math.abs(nrm.getY(i)) > 0.5;
        const wide = Math.abs(nrm.getX(i)) > 0.5 ? sz : sx;
        uv.setXY(i, uv.getX(i) * (horiz ? 1 : wide / 6), uv.getY(i) * (horiz ? 1 : sy / 6));
      }
      g.translate(cx, cy, cz);
      this.addPart('facade', this._color(g, col, true));
    }); }
    // wedge rising along `axis` towards `dir`
    ramp(col, cx, cz, len, wid, h, axis, dir, y0) { this._op(() => {
      const g = new THREE.BoxGeometry(axis === 'x' ? len : wid, h, axis === 'x' ? wid : len);
      g.translate(0, h / 2, 0);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const a = axis === 'x' ? pos.getX(i) : pos.getZ(i);
        if (pos.getY(i) > h / 2 && a * dir < 0) pos.setY(i, 0.02);
      }
      g.translate(cx, y0 || 0, cz);
      const cg = this._color(g, col);
      cg.computeVertexNormals();
      this.addPart('solid', cg);
    }); }
    // a thin wire from a to b (three-sided, low-poly), sagging by `sag` in the middle
    wire(col, a, b, sag, r, segs) { this._op(() => {
      const n = segs || 6, A = new THREE.Vector3(), B = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
      const at = (t, v) => v.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t);
      for (let i = 0; i < n; i++) {
        at(i / n, A); at((i + 1) / n, B);
        const d = B.clone().sub(A), len = d.length();
        const g = new THREE.CylinderGeometry(r || 0.025, r || 0.025, len * 1.02, 3, 1, true);
        q.setFromUnitVectors(up, d.normalize());
        g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q)); g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
        this.addPart('solid', this._color(g, col));
      }
    }); }
    poolDecal(x, z, size) { this._op(() => {
      const g = new THREE.PlaneGeometry(size, size); g.rotateX(-Math.PI / 2); g.translate(x, 0.07, z);
      this.pool.push(g);
    }); }

    // ambient occlusion on the ground: a dark patch (aDark 1) under a footprint, fading out over m metres
    aoRect(cx, cz, hx, hz, m, a) { this._op(() => {
      const y = 0.075, ix = [cx - hx, cx + hx], iz = [cz - hz, cz + hz], ox = [cx - hx - m, cx + hx + m], oz = [cz - hz - m, cz + hz + m];
      const P = [], D = [];
      const quad = (p, d) => { for (const k of [0, 1, 2, 0, 2, 3]) { P.push(p[k][0], y, p[k][1]); D.push(d[k]); } };
      quad([[ix[0], iz[0]], [ix[0], iz[1]], [ix[1], iz[1]], [ix[1], iz[0]]], [a, a, a, a]);
      quad([[ox[0], oz[0]], [ox[0], oz[1]], [ix[0], iz[1]], [ix[0], iz[0]]], [0, 0, a, a]);   // west
      quad([[ix[1], iz[0]], [ix[1], iz[1]], [ox[1], oz[1]], [ox[1], oz[0]]], [a, a, 0, 0]);   // east
      quad([[ox[0], oz[0]], [ix[0], iz[0]], [ix[1], iz[0]], [ox[1], oz[0]]], [0, a, a, 0]);   // north
      quad([[ix[0], iz[1]], [ox[0], oz[1]], [ox[1], oz[1]], [ix[1], iz[1]]], [a, 0, 0, a]);   // south
      this.ao.push(aoGeo(P, D));
    }); }
    aoDisc(cx, cz, r0, r1, a, seg) { this._op(() => {
      const y = 0.075, n = seg || 14, P = [], D = [];
      for (let i = 0; i < n; i++) {
        const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
        const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        P.push(cx, y, cz, cx + c1 * r0, y, cz + s1 * r0, cx + c0 * r0, y, cz + s0 * r0); D.push(a, a, a);
        P.push(cx + c0 * r0, y, cz + s0 * r0, cx + c1 * r0, y, cz + s1 * r0, cx + c1 * r1, y, cz + s1 * r1); D.push(a, a, 0);
        P.push(cx + c0 * r0, y, cz + s0 * r0, cx + c1 * r1, y, cz + s1 * r1, cx + c0 * r1, y, cz + s0 * r1); D.push(a, 0, 0);
      }
      this.ao.push(aoGeo(P, D));
    }); }

    // all at once (far cells, start-up) ...
    build(group, o) { this.run(Infinity); while (!this.buildStep(group, o, Infinity)); }
    // ... or a step at a time: true when the last mesh is in the group
    buildStep(group, o, deadline) {
      if (!this.run(deadline)) return false;
      this._lists(o);
      while (this.lists.length) {
        if (performance.now() > deadline) return false;
        const p = this._piece();
        if (p) group.add(Batch.mesh(p));
      }
      return true;
    }
    // ... or as plain arrays (in the city worker), to be turned into meshes on the page
    toArrays(o) {
      this.run(Infinity);
      this._lists(o);
      const pieces = [], transfer = new Set();
      let p;
      while ((p = this._piece())) {
        const attrs = {};
        for (const n in p.geo.attributes) {
          const at = p.geo.attributes[n];
          attrs[n] = { array: at.array, itemSize: at.itemSize, normalized: at.normalized };
          transfer.add(at.array.buffer);
        }
        pieces.push({ kind: p.kind, map: p.map ? p.map.uuid : null, cast: p.cast, recv: p.recv, attrs });
      }
      return { pieces, transfer: [...transfer] };
    }
    static fromArrays(piece, maps) {
      const g = new THREE.BufferGeometry();
      for (const n in piece.attrs) { const a = piece.attrs[n]; g.setAttribute(n, new THREE.BufferAttribute(a.array, a.itemSize, a.normalized)); }
      g.computeBoundingSphere();
      return Batch.mesh({ geo: g, kind: piece.kind, map: maps.get(piece.map), cast: piece.cast, recv: piece.recv });
    }
    static mesh(p) {
      const mesh = new THREE.Mesh(p.geo, p.kind === 'tex' ? R.texMat(p.map) : R.mat(p.kind));
      mesh.castShadow = p.cast; mesh.receiveShadow = p.recv;
      mesh.matrixAutoUpdate = false;
      return mesh;
    }
    _lists(o) {
      if (this.lists) return;
      const cast = !o || o.cast !== false;
      this.lists = [[this.solid, 'solid', null, cast, true], [this.glass, 'glass', null, false, false],
        [this.facade, 'facade', null, false, false], [this.pool, 'pool', null, false, false], [this.ao, 'ao', null, false, false]];
      for (const e of this.tex.values()) this.lists.push([e.list, 'tex', e.map, cast, true]);
    }
    // the next merged piece: up to ~40k vertices (a short step, and a small upload)
    _piece() {
      while (this.lists.length) {
        const [list, kind, map, cast, recv] = this.lists[0];
        if (!list.length) { this.lists.shift(); continue; }
        let n = 0, k = 0;
        while (k < list.length && (k === 0 || n + list[k].attributes.position.count <= CHUNK)) n += list[k++].attributes.position.count;
        const part = list.splice(0, k);
        const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(part, false);
        part.forEach(g => g.dispose());
        if (!merged) continue;
        compact(merged);
        return { geo: merged, kind, map, cast, recv };
      }
      return null;
    }
  }

  R.Batch = Batch;

  // every connected piece of glass (a window, a shop front) gets its own random number
  function componentRandom(g) {
    const pos = g.attributes.position, nTri = pos.count / 3, parent = new Int32Array(nTri);
    for (let i = 0; i < nTri; i++) parent[i] = i;
    const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const seen = new Map();
    for (let v = 0; v < pos.count; v++) {
      const k = Math.round(pos.getX(v) * 1e5) + ',' + Math.round(pos.getY(v) * 1e5) + ',' + Math.round(pos.getZ(v) * 1e5);
      const t = (v / 3) | 0, o = seen.get(k);
      if (o === undefined) seen.set(k, t); else parent[find(t)] = find(o);
    }
    const rnd = new Map(), out = new Float32Array(pos.count);
    for (let v = 0; v < pos.count; v++) {
      const root = find((v / 3) | 0);
      if (!rnd.has(root)) rnd.set(root, Math.random());
      out[v] = rnd.get(root);
    }
    return out;
  }

  function bake(spec, gltf) {
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const dim = spec.fit === 'w' ? size.x : spec.fit === 'h' ? size.y : size.z;
    const k = spec.size / dim;
    const pre = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
    const parts = [];
    root.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      let g = o.geometry.clone();
      g.applyMatrix4(pre.clone().multiply(o.matrixWorld));
      if (g.index) g = g.toNonIndexed();
      if (!g.attributes.normal) g.computeVertexNormals();
      const ng = new THREE.BufferGeometry();
      ng.setAttribute('position', g.attributes.position);
      ng.setAttribute('normal', g.attributes.normal);
      if (m.map && g.attributes.uv) {
        ng.setAttribute('uv', g.attributes.uv);
        parts.push({ kind: 'tex', geo: ng, map: m.map });
      } else {
        const n = g.attributes.position.count, col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { col[i * 3] = m.color.r; col[i * 3 + 1] = m.color.g; col[i * 3 + 2] = m.color.b; }
        ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const glass = /glass/i.test(m.name);
        const light = /headlight|taillight|brakelight|bluelights|whitelights/i.test(m.name);
        parts.push({ kind: glass ? 'glass' : 'solid', geo: ng, rand: glass ? componentRandom(ng) : null, light });
      }
    });
    return { parts, dims: { w: size.x * k, h: size.y * k, d: size.z * k } };
  }

  R.assets = {
    has: key => !!lib[key],
    // the baked models as plain arrays, for the city worker ...
    exportLib() {
      const out = {};
      for (const k in lib) out[k] = { dims: lib[k].dims, parts: lib[k].parts.map(p => {
        const attrs = {};
        for (const n in p.geo.attributes) attrs[n] = { array: p.geo.attributes[n].array, itemSize: p.geo.attributes[n].itemSize };
        return { kind: p.kind, map: p.map ? p.map.uuid : null, rand: p.rand, light: p.light, attrs };
      }) };
      return out;
    },
    // ... and back (in the worker; a texture is only its id there)
    importLib(data) {
      for (const k in data) lib[k] = { dims: data[k].dims, parts: data[k].parts.map(p => {
        const geo = new THREE.BufferGeometry();
        for (const n in p.attrs) geo.setAttribute(n, new THREE.BufferAttribute(p.attrs[n].array, p.attrs[n].itemSize));
        return { kind: p.kind, map: p.map ? { uuid: p.map } : null, rand: p.rand, light: p.light, geo };
      }) };
    },
    // every texture the models use (to upload them all at start)
    maps() {
      const out = new Map();
      for (const k in lib) for (const p of lib[k].parts) if (p.map) out.set(p.map.uuid, p.map);
      return [...out.values()];
    },
    dims: key => lib[key] && lib[key].dims,

    load(onProgress) {
      const keys = Object.keys(MANIFEST);
      let done = 0;
      const loader = new THREE.GLTFLoader();
      return Promise.all(keys.map(key => new Promise(resolve => {
        loader.load('../models/city/' + key + '.glb', gltf => {
          try { lib[key] = bake(MANIFEST[key], gltf); } catch (e) { console.warn('[runner] bad model', key, e); }
          onProgress && onProgress(++done, keys.length); resolve();
        }, undefined, () => { onProgress && onProgress(++done, keys.length); resolve(); });
      })));
    },

    // a standalone, movable copy of a model (merged into one mesh per material, cached per key)
    object(key) {
      const a = lib[key];
      if (!a) return null;
      if (!a.merged) {
        const groups = { solid: [], light: [] }, tex = new Map();
        for (const p of a.parts) {
          if (p.kind === 'tex') { if (!tex.has(p.map.uuid)) tex.set(p.map.uuid, { map: p.map, list: [] }); tex.get(p.map.uuid).list.push(p.geo); }
          else groups[p.light ? 'light' : 'solid'].push(p.geo);
        }
        a.merged = [];
        const merge = list => THREE.BufferGeometryUtils.mergeBufferGeometries(list, false);
        if (groups.solid.length) a.merged.push({ geo: merge(groups.solid), mat: () => R.mat('solid') });
        if (groups.light.length) a.merged.push({ geo: merge(groups.light), mat: () => R.mat('light') });
        for (const e of tex.values()) a.merged.push({ geo: merge(e.list), mat: () => R.texMat(e.map) });
      }
      const g = new THREE.Group();
      for (const m of a.merged) {
        const mesh = new THREE.Mesh(m.geo, m.mat());
        mesh.castShadow = true;
        g.add(mesh);
      }
      return { group: g, dims: a.dims };
    },

    // put a model into a batch; returns its collision footprint
    place(batch, key, x, z, yaw, s, sy, y) {
      const a = lib[key];
      if (!a) return null;
      s = s || 1; sy = sy || 1; yaw = yaw || 0;
      M.compose(V.set(x, y || 0, z), Q.setFromAxisAngle(UP, yaw), S.set(s, s * sy, s));
      const inst = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1, mat = M.clone(), surf = WALLS.has(key) ? 5 : 0;
      batch._op(() => {
      batch.surf = surf;
      for (const p of a.parts) {
        const g = p.geo.clone();
        g.applyMatrix4(mat);
        if (p.rand) {
          const r = new Float32Array(p.rand.length);
          for (let i = 0; i < r.length; i++) r[i] = (p.rand[i] + Math.abs(inst)) % 1;
          g.setAttribute('aRand', new THREE.BufferAttribute(r, 1));
        }
        batch.addPart(p.kind, g, p.map);
      }
      batch.surf = 0;
      });
      const w = a.dims.w * s, d = a.dims.d * s;
      const turned = Math.abs(Math.sin(yaw)) > 0.7071;
      return { x, z, hx: (turned ? d : w) / 2, hz: (turned ? w : d) / 2, h: a.dims.h * s * sy };
    },
  };
})(window.R = window.R || {});
