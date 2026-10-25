// «Восьмёрка Баклажан» — трафик.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- трафик ---------- */
const traffic = [];
const LANES = [[ZA + 3.35, 1], [ZA + 6.85, 1], [ZA + 10.35, 1], [ZA - 3.35, -1], [ZA - 6.85, -1], [ZA - 10.35, -1]];
const TRAFFIC_N = 18;
// данные: arcade/data/vehicles.js (tools/obj-to-game.py)
function modelGeo(part) {      // данные из obj-to-game.py → геометрия с плоскими нормалями, цветами (линейными) и признаком свечения
  const dec = (b, A) => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new A(u.buffer); };
  const p = dec(part.p, Int16Array), idx = dec(part.i, Uint16Array), ci = dec(part.c, Uint8Array), n = p.length / 3;
  const pos = new Float32Array(p.length), col = new Float32Array(p.length), gl = new Float32Array(n), c = new T.Color(), glows = new Set(part.gl || []);
  for (let i = 0; i < p.length; i++) pos[i] = p[i] / 1000;
  for (let v = 0; v < n; v++) { c.set("#" + part.pal[ci[v]]).convertSRGBToLinear(); col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; gl[v] = glows.has(ci[v]) ? 1 : 0; }
  const g = new T.BufferGeometry(); g.setAttribute("position", new T.BufferAttribute(pos, 3)); g.setAttribute("color", new T.BufferAttribute(col, 3)); g.setAttribute("glow", new T.BufferAttribute(gl, 1)); g.setIndex(new T.BufferAttribute(idx, 1));
  const out = g.toNonIndexed(); out.computeVertexNormals(); return out;
}
// поток на автобане: седаны (своя модель), автобусы и маршрутки (готовые модели). У каждого вида — кузов «в цвет машины»
// (цвет экземпляра) и детали со светящимися огнями: по два вызова отрисовки на вид
const TRAFFIC_KINDS = (() => {
  const prof = (pts, w, bevel) => { const sh = new T.Shape(pts.map(([x, y]) => new T.Vector2(x, y))); const g = new T.ExtrudeGeometry(sh, { depth: w, bevelEnabled: bevel, bevelSize: .06, bevelThickness: .06, bevelSegments: 1 }); g.translate(0, 0, -w / 2); return g; };   // ExtrudeGeometry и так без индекса
  const tint = (geo, hex, glow = 0) => { const g = geo.index ? geo.toNonIndexed() : geo, c = new T.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } g.setAttribute("color", new T.BufferAttribute(a, 3)); g.setAttribute("glow", new T.BufferAttribute(new Float32Array(n).fill(glow), 1)); if (g.attributes.uv) g.deleteAttribute("uv"); return g; };
  // седан: кузов профилем (капот, лобовое, крыша, заднее стекло); детали — стёкла, колёса, бамперы, фары и фонари
  const body = prof([[-2.2, .32], [2.2, .32], [2.27, .72], [1.25, .86], [.62, 1.36], [-1.0, 1.38], [-1.72, .95], [-2.26, .84]], 1.62, true);
  body.deleteAttribute("uv"); body.computeVertexNormals();
  const parts = [tint(prof([[1.29, .84], [.63, 1.42], [-1.03, 1.42], [-1.79, .93]], 1.7, false), 0x1f2838)];
  [[1.33, .78], [1.33, -.78], [-1.38, .78], [-1.38, -.78]].forEach(([x, z]) => parts.push(tint(new T.CylinderGeometry(.33, .33, .24, 12).rotateX(Math.PI / 2).translate(x, .33, z), 0x15161a)));
  [-1, 1].forEach(sd => {
    parts.push(tint(new T.BoxGeometry(.06, .16, .42).translate(2.29, .64, sd * .55), 0xfff1d0, 1));
    parts.push(tint(new T.BoxGeometry(.06, .16, .4).translate(-2.3, .74, sd * .56), 0xd8262c, 1));
  });
  parts.push(tint(new T.BoxGeometry(.18, .18, 1.66).translate(2.28, .38, 0), 0x2a2c31), tint(new T.BoxGeometry(.18, .18, 1.66).translate(-2.29, .4, 0), 0x2a2c31));
  const fix = mergeGeos(parts); fix.computeVertexNormals();
  const K = {
    car: { n: TRAFFIC_N, L: 4.5, H: 1.42, v: [20, 32], body, fix, cols: [0x7f8fa8, 0xc9cfdb, 0x3a4a6a, 0x9aa1a8, 0x5d6b85, 0xe8ecf5, 0x6a2a35] },
    bus: { n: 3, L: VEHICLE_MODELS.bus.L, H: VEHICLE_MODELS.bus.H, v: [15, 19], body: modelGeo(VEHICLE_MODELS.bus.tint), fix: modelGeo(VEHICLE_MODELS.bus.fix), cols: [0xf3f1e8, 0xf2c230, 0x8cc63e], right: true },
    van: { n: 3, L: VEHICLE_MODELS.van.L, H: VEHICLE_MODELS.van.H, v: [19, 26], body: modelGeo(VEHICLE_MODELS.van.tint), fix: modelGeo(VEHICLE_MODELS.van.fix), cols: [0xf4f4f0, 0xf2d43a, 0xf4f4f0] },
  };
  Object.values(K).forEach(k => {
    k.meshes = [new T.InstancedMesh(k.body, new T.MeshStandardMaterial({ vertexColors: true, roughness: .45, metalness: .2 }), k.n), new T.InstancedMesh(k.fix, glowMat(), k.n)];
    k.meshes.forEach(im => scene.add(im));
  });
  return K;
})();
(() => {
  const lanes = LANES, c = new T.Color();
  let hs = 31; const hr = () => (hs = (hs * 16807) % 2147483647) / 2147483647;   // автобусы и маршрутки — своё зерно: общий rnd() не сдвигаем
  Object.entries(TRAFFIC_KINDS).forEach(([kind, K]) => {
    for (let i = 0; i < K.n; i++) {
      const [z, dir] = K.right ? lanes[i % 2 ? 5 : 2] : lanes[i % lanes.length];   // автобусы — в крайних правых полосах (по ходу движения)
      const r1 = kind === "car" ? rnd() : hr(), v = K.v[0] + r1 * (K.v[1] - K.v[0]), x = -580 + (kind === "car" ? rnd() : hr()) * 1960;
      traffic.push({ kind, k: i, L: K.L, H: K.H, x, z, zt: z, dir, v, v0: v, lc: 0, wreck: 0 });
      K.meshes[0].setColorAt(i, c.setHex(K.cols[i % K.cols.length]));
    }
  });
})();
const tq = new T.Quaternion(), tmat = new T.Matrix4(), tpos = new T.Vector3(), tone = new T.Vector3(1, 1, 1), yUp = new T.Vector3(0, 1, 0);
const teul = new T.Euler();
function tickTraffic(dt) {
  const pl = mode === "free" && !free.air && phase === "free" && Math.abs(car.z - ZA) < 18;   // игрок на автобане
  traffic.forEach((c, i) => {
    if (c.wreck > 0) {                     // разбитая машина стоит с дымом, потом уезжает «на эвакуаторе»
      c.wreck -= dt;
      if (Math.random() < dt * 8) puff(new T.Vector3(c.x, 1.6, c.z), new T.Vector3(0, 2.5, 0), 1.1, .35);
      if (c.wreck <= 0) { c.x = c.dir > 0 ? -590 : 1390; c.v = c.v0; }
    } else {
      // кто впереди в той же полосе: машина потока или игрок
      let gap = Infinity, vAhead = c.v0;
      // дистанция — между бамперами (у автобуса 10 м), приведённая к прежней «от центра до центра» для седанов
      for (const o of traffic) if (o !== c && o.dir === c.dir && Math.abs(o.z - c.z) < 2) { const d = (o.x - c.x) * c.dir; if (d > 0 && d - (o.L + c.L) / 2 + 4.5 < gap) { gap = d - (o.L + c.L) / 2 + 4.5; vAhead = o.wreck > 0 ? 0 : o.v; } }
      if (pl && Math.abs(car.z - c.z) < 2.3) { const d = (car.x - c.x) * c.dir; if (d > 0 && d < gap) { gap = d; vAhead = Math.max(0, car.v * Math.cos(car.yaw) * c.dir); } }
      let want = c.v0;
      if (gap < 45 && vAhead < c.v - 1) {
        if (c.lc <= 0) for (const [z, dir] of LANES) {      // обгон: соседняя полоса того же направления, если там пусто
          if (dir !== c.dir || Math.abs(Math.abs(z - c.zt) - 3.5) > .1) continue;
          const ahead = x => (x - c.x) * c.dir;           // в чужой полосе нужно 60 м свободных впереди и 15 сзади
          const busy = traffic.some(o => o !== c && Math.abs(o.zt - z) < 1 && ahead(o.x) > -15 && ahead(o.x) < 60) || (pl && Math.abs(car.z - z) < 2.6 && ahead(car.x) > -10 && ahead(car.x) < 70);
          if (!busy) { c.zt = z; c.lc = 3; break; }
        }
        if (gap < 38) want = Math.min(want, vAhead + Math.max(0, gap - 10) * .6);   // не успел перестроиться — тормозит
      }
      c.lc -= dt;
      c.v += Math.max((gap < 16 ? -30 : -14) * dt, Math.min(4 * dt, Math.max(0, want) - c.v));
      c.x += c.dir * c.v * dt;
      c.z += (c.zt - c.z) * Math.min(1, dt * 1.6);
      if (c.x > 1390) c.x = -590; if (c.x < -590) c.x = 1390;
    }
    tq.setFromEuler(teul.set(c.wreck > 0 ? .25 : 0, (c.dir > 0 ? 0 : Math.PI) + (c.zt - c.z) * .06 * c.dir, 0, "YXZ"));
    tpos.set(c.x, 0, c.z); tmat.compose(tpos, tq, tone); TRAFFIC_KINDS[c.kind].meshes.forEach(im => im.setMatrixAt(c.k, tmat));
  });
  Object.values(TRAFFIC_KINDS).forEach(K => K.meshes.forEach(im => { im.instanceMatrix.needsUpdate = true; }));
}

