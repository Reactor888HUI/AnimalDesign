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
  class Batch {
    constructor() { this.solid = []; this.glass = []; this.facade = []; this.pool = []; this.tex = new Map(); }

    addPart(kind, geo, map) {
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
      return g;
    }
    box(col, cx, cy, cz, sx, sy, sz, kind) {
      const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(cx, cy, cz);
      this.addPart(kind || 'solid', this._color(g, col));
    }
    rect(col, cx, cz, w, d, y) {
      const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); g.translate(cx, y || 0, cz);
      this.addPart('solid', this._color(g, col));
    }
    cyl(col, cx, cy, cz, rt, rb, h, seg, kind) {
      const g = new THREE.CylinderGeometry(rt, rb, h, seg || 8); g.translate(cx, cy, cz);
      this.addPart(kind || 'solid', this._color(g, col));
    }
    sph(col, cx, cy, cz, r, kind) {
      const g = new THREE.SphereGeometry(r, 8, 6); g.translate(cx, cy, cz);
      this.addPart(kind || 'solid', this._color(g, col));
    }
    cone(col, cx, cy, cz, r, h) {
      const g = new THREE.ConeGeometry(r, h, 8); g.translate(cx, cy, cz);
      this.addPart('solid', this._color(g, col));
    }
    // textured far-away facade box; uv repeats with the wall size so windows keep their scale
    facadeBox(col, cx, cy, cz, sx, sy, sz) {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      const uv = g.attributes.uv, nrm = g.attributes.normal;
      for (let i = 0; i < uv.count; i++) {
        const horiz = Math.abs(nrm.getY(i)) > 0.5;
        const wide = Math.abs(nrm.getX(i)) > 0.5 ? sz : sx;
        uv.setXY(i, uv.getX(i) * (horiz ? 1 : wide / 6), uv.getY(i) * (horiz ? 1 : sy / 6));
      }
      g.translate(cx, cy, cz);
      this.addPart('facade', this._color(g, col, true));
    }
    // wedge rising along `axis` towards `dir`
    ramp(col, cx, cz, len, wid, h, axis, dir, y0) {
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
    }
    poolDecal(x, z, size) {
      const g = new THREE.PlaneGeometry(size, size); g.rotateX(-Math.PI / 2); g.translate(x, 0.07, z);
      this.pool.push(g);
    }

    build(group, o) {
      const add = (list, mat, cast, recv) => {
        if (!list.length) return;
        const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(list, false);
        list.forEach(g => g.dispose());
        if (!merged) return;
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = cast; mesh.receiveShadow = recv;
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
      };
      add(this.solid, R.mat('solid'), !o || o.cast !== false, true);
      add(this.glass, R.mat('glass'), false, false);
      add(this.facade, R.mat('facade'), false, false);
      add(this.pool, R.mat('pool'), false, false);
      for (const e of this.tex.values()) add(e.list, R.texMat(e.map), !o || o.cast !== false, true);
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
      const inst = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
      for (const p of a.parts) {
        const g = p.geo.clone();
        g.applyMatrix4(M);
        if (p.rand) {
          const r = new Float32Array(p.rand.length);
          for (let i = 0; i < r.length; i++) r[i] = (p.rand[i] + Math.abs(inst)) % 1;
          g.setAttribute('aRand', new THREE.BufferAttribute(r, 1));
        }
        batch.addPart(p.kind, g, p.map);
      }
      const w = a.dims.w * s, d = a.dims.d * s;
      const turned = Math.abs(Math.sin(yaw)) > 0.7071;
      return { x, z, hx: (turned ? d : w) / 2, hz: (turned ? w : d) / 2, h: a.dims.h * s * sy };
    },
  };
})(window.R = window.R || {});
