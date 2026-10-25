// «Восьмёрка Баклажан» — сцены с подгрузкой, западная сцена.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- сцены: районы карты строятся, когда к ним подъезжаешь, и выгружаются вдали ---------- */
// Сцена — коробка мира и генератор постройки. Ближе near — начинаем строить: каждый кадр генератор делает
// следующий кусок (участок домов, дороги, мост) в пределах нескольких миллисекунд, чтобы картинка не дёргалась.
// Дальше far — сцена спрятана; дальше drop — выгружена из видеопамяти. Данные для логики (дороги, вода, мосты,
// названия) загружены сразу и лёгкие; препятствия-дома появляются вместе со сценой.
const SCENES = [];
function addScene(sc) { return SCENES.push(Object.assign({ near: 900, far: 1500, drop: 2200, state: "none", group: null, gen: null, d: Infinity, chunks: [], solids: [] }, sc)), sc; }
const sceneDist = (sc, x, z) => Math.hypot(Math.max(sc.box.x0 - x, 0, x - sc.box.x1), Math.max(sc.box.z0 - z, 0, z - sc.box.z1));
function sceneRun(sc, budget) {
  if (sc.state === "none") {
    sc.group = new T.Group(); sc.group.userData.dyn = true; scene.add(sc.group);
    sc.gen = sc.build(sc); sc.state = "loading"; sc.t0 = performance.now(); sc.work = 0;
  }
  const t0 = performance.now();
  while (sc.state === "loading" && performance.now() - t0 < budget) if (sc.gen.next().done) { sc.state = "ready"; sc.ms = Math.round(performance.now() - sc.t0); }
  sc.work += performance.now() - t0;
}
function sceneDrop(sc) {                                  // выгрузка: сетки и текстуры сцены — из памяти; общие материалы остаются
  sc.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  scene.remove(sc.group); const ch = new Set(sc.chunks); for (let i = CHUNKS.length - 1; i >= 0; i--) if (ch.has(CHUNKS[i])) CHUNKS.splice(i, 1);
  if (sc.onDrop) sc.onDrop(sc);
  Object.assign(sc, { state: "none", group: null, gen: null, chunks: [] });
}
function tickScenes(force = false) {
  for (const sc of SCENES) {
    sc.d = Math.min(sceneDist(sc, car.x, car.z), sceneDist(sc, camera.position.x, camera.position.z));
    if (sc.state !== "ready" && (sc.d < sc.near || force && sc.d < sc.far)) sceneRun(sc, force || sc.d < 80 ? 1e9 : 7);   // уже внутри — достраиваем сразу
    if (sc.state === "ready") sc.group.visible = sc.d < sc.far;
    if (sc.state !== "none" && sc.d > sc.drop) sceneDrop(sc);
  }
}
// куски сцены, которые прячутся по расстоянию и полю зрения (как дома участков): регистрируем в CHUNKS и в сцене
const sceneChunk = (sc, obj, far) => { obj.geometry.computeBoundingSphere(); const ch = { obj, s: obj.geometry.boundingSphere.clone().applyMatrix4(obj.matrixWorld), far }; CHUNKS.push(ch); sc.chunks.push(ch); return obj; };
// плоские слои у земли — как layerGround(): без записи глубины, порядок по высоте
const sceneFlat = (sc, geo, m, y) => { const mm = m.clone(); mm.depthWrite = false; mm.polygonOffset = false; const o = new T.Mesh(geo, mm); o.renderOrder = -1000 + Math.round(y * 400); sc.group.add(o); return o; };

/* ---------- западная сцена: набережные у Темерницкого и железнодорожного мостов, Дон, дома ---------- */
const WEST_BOX = WEST.clip ? rectOf(WEST.clip) : null;
const WESTSC = WEST_BOX && addScene({
  name: "Запад: мосты", box: WEST_BOX,
  *build(sc) {
    const C = CITY, g = sc.group, B = WEST_BOX;
    sceneFlat(sc, new T.PlaneGeometry(B.x1 - B.x0, B.z1 - B.z0).rotateX(-Math.PI / 2).translate((B.x0 + B.x1) / 2, .005, (B.z0 + B.z1) / 2), C.flatMat(0x9d9585, 3), .005);
    for (const [k, [color, y]] of Object.entries(C.AREA)) {
      const list = WEST.a.filter(a => a[0] === k).map(([, rs]) => rs.map(dm));
      if (list.length) sceneFlat(sc, C.fillGeo(list, y), C.flatMat(color, 2), y);
    }
    const wm = new T.Mesh(C.fillGeo(WATER.filter(w => w.west).map(w => w.rings), .035), DON_WATER); wm.renderOrder = -1000 + 14; g.add(wm);
    yield;
    const mine = ROADS.filter(r => r.west && !r.deck);
    sceneFlat(sc, C.stripGeo(mine.filter(r => r.c <= 2 && r.pts.some(([x, z]) => terrainH(x, z) < .3)).map(r => ({ pts: r.pts, w: r.w + .7 })), .045), C.flatMat(0xb4b1aa, 0), .045);
    [4, 3, 2, 1, 0].forEach((c, i) => { const list = mine.filter(r => r.c === c); if (list.length) { const m = C.flatMat(C.RC[c], 0); m.map = grainTex; sceneFlat(sc, C.stripGeo(list, .05 + i * .006), m, .05 + i * .006); } });
    const dashes = [];
    mine.filter(r => r.c <= 2).forEach(r => { let carry = 0; for (let i = 1; i < r.pts.length; i++) { const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i], L = Math.hypot(bx - ax, bz - az); for (let s = carry; s < L; s += 9) dashes.push(M4T(ax + (bx - ax) * s / L, .09, az + (bz - az) * s / L, Math.atan2(-(bz - az), bx - ax))); carry = (carry - L) % 9; if (carry < 0) carry += 9; } });
    if (dashes.length) chunked(new T.PlaneGeometry(3, .18).rotateX(-Math.PI / 2), C.white, dashes, .7, null, sc);
    const rails = WEST.l.map(([k, a]) => ({ k, pts: dm(a) }));
    if (rails.length) {
      sceneFlat(sc, C.stripGeo(rails.filter(r => r.k === 0).map(r => ({ pts: r.pts, w: 3.2 })), .04, false), C.flatMat(0x8a7f74, 1), .04);
      const lines = []; rails.forEach(({ pts }) => [-.72, .72].forEach(o => lines.push({ pts: pts.map(([x, z], i) => { const [ax, az] = pts[Math.max(0, i - 1)], [bx, bz] = pts[Math.min(pts.length - 1, i + 1)], L = Math.hypot(bx - ax, bz - az) || 1; return [x - (bz - az) / L * o, z + (bx - ax) / L * o]; }), w: .14 })));
      sceneFlat(sc, C.stripGeo(lines, .1, false), C.flatMat(0x2c2b33, 0), .1);
    }
    yield;
    // дома: по 60 за шаг, участки 400 м — отдельные сетки
    const lots = new Map(), LOT = 400, lotOf = (x, z) => { const k = Math.floor(x / LOT) * 4096 + Math.floor(z / LOT); if (!lots.has(k)) lots.set(k, { W: [], R: [] }); return lots.get(k); };
    const n0 = solids.length;
    for (let i = 0; i < WEST.b.length; i++) { C.house(WEST.b[i], i + 50000, WEST.n, lotOf); if (i % 60 === 59) yield; }
    sc.solids = solids.splice(n0);                         // дома сцены — в сетку препятствий (и обратно — при выгрузке)
    sc.solids.forEach(b => { solids.push(b); sgridAdd(b); });
    for (const lot of lots.values()) { if (!lot.W.length && !lot.R.length) continue; const m = new T.Mesh(C.lotGeo(lot), C.houseMat); g.add(m); sceneChunk(sc, m, 2.3); yield; }
    // деревья: из карты и в лесополосах
    const trees = dm(WEST.t), crowns = [], trunks = [], cols = [], GREENS = [0x58803a, 0x4c7534, 0x6a8f3f, 0x7d8f3c].map(h => new T.Color(h));
    let hs = 99; const hr = () => (hs = (hs * 16807) % 2147483647) / 2147483647;
    WEST.a.filter(a => a[0] === "f").forEach(([, rs]) => { const rings = rs.map(dm), b = bboxOf(rings[0]), n = Math.min(90, Math.round((b.x1 - b.x0) * (b.z1 - b.z0) / 380)); for (let i = 0; i < n; i++) { const x = b.x0 + hr() * (b.x1 - b.x0), z = b.z0 + hr() * (b.z1 - b.z0); if (inRings(x, z, rings) && !onCarriageway(x, z, 1) && !waterAt(x, z)) trees.push([x, z]); } });
    trees.forEach(([x, z], i) => { const s = .75 + hr() * .5, g0 = terrainH(x, z); crowns.push(M4(x, g0 + 3 + 2.1 * s, z, hr() * 6, s, s * 1.1, s)); trunks.push(M4(x, g0 + 1.5, z)); cols.push(GREENS[i % GREENS.length]); });
    if (crowns.length) { chunked(new T.IcosahedronGeometry(2.3, 0), mat(0xffffff, { flatShading: true, name: "crowns" }), crowns, .75, cols, sc); chunked(new T.CylinderGeometry(.18, .26, 3, 4, 1, true), mat(0x6b5444), trunks, .45, null, sc); }
    yield;
    if (typeof RAILB !== "undefined" && RAILB) yield* RAILB.build(sc);
  },
  onDrop(sc) { const set = new Set(sc.solids); for (let i = solids.length - 1; i >= 0; i--) if (set.has(solids[i])) solids.splice(i, 1); sgrid.forEach(list => { for (let i = list.length - 1; i >= 0; i--) if (set.has(list[i])) list.splice(i, 1); }); sc.solids = []; if (typeof RAILB !== "undefined" && RAILB) RAILB.drop(); },
});
