// «Восьмёрка Баклажан» — запечённые тени домов, сетка склона.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- запечённые тени домов: один прозрачный слой над землёй, перерисовывается при смене времени суток ---------- */
const bakeShadows = (() => {
  const PX = .6, R = STRIP, W = Math.ceil((R.x1 - R.x0) * PX), Hh = Math.ceil((R.z1 - R.z0) * PX);
  const c = document.createElement("canvas"); c.width = W; c.height = Hh; const g = c.getContext("2d"), t = new T.CanvasTexture(c); t.anisotropy = 4;
  const m = new T.Mesh(new T.PlaneGeometry(R.x1 - R.x0, R.z1 - R.z0).rotateX(-Math.PI / 2), nightReg(new T.MeshBasicMaterial({ map: t, transparent: true, opacity: .4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), "opacity", { sunset: .4, day: .34, night: .14 }));
  m.position.set((R.x0 + R.x1) / 2, .03, (R.z0 + R.z1) / 2); m.userData.dyn = true; scene.add(m);
  return () => {
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, Hh); g.setTransform(PX, 0, 0, PX, -R.x0 * PX, -R.z0 * PX); g.fillStyle = "#000";
    const sx = -SUN_DIR.x / SUN_DIR.y, sz = -SUN_DIR.z / SUN_DIR.y;        // сдвиг тени на 1 м высоты
    solids.forEach(b => {
      if (!b.rings || b.h < 2) return;
      const ring = b.arena ? b.outer[0] : b.rings[0], len = Math.min(b.h, 22), n = Math.max(2, Math.ceil(len * Math.hypot(sx, sz) / 3));
      for (let k = 0; k <= n; k++) {                                       // «протягиваем» контур вдоль тени
        const d = len * k / n; g.beginPath();
        ring.forEach(([x, z], i) => i ? g.lineTo(x + sx * d, z + sz * d) : g.moveTo(x + sx * d, z + sz * d)); g.closePath(); g.fill();
      }
    });
    t.needsUpdate = true;
  };
})();
bakeShadows();
/* ---------- склон правого берега: сетка рельефа, на которой нарисована земля (площади, улицы, рельсы, тени) ---------- */
// Сетка идёт рядами от линии берега до автобана, поэтому край набережной совпадает с гранитной стенкой.
// Земля на склоне — одна текстура 1,4 пикс/м (цвета те же, что у плоских слоёв, пересчитаны в sRGB).
const HILL = (() => {
  const NX = Math.ceil((TX1 - TX0) / 15), NZ = 50, zb0 = BANK.find(v => v != null) ?? -560;
  const bankAt = x => terLerp(BANK, Math.min(TX1 - TER.step, Math.max(TX0, x))) ?? zb0;
  const zMin = Math.min(...BANK.filter(v => v != null)) - 2, X0 = TX0, X1 = TX1, Z1 = -82;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= NX; i++) {
    const x = X0 + (X1 - X0) * i / NX, zb = bankAt(x) + .05;
    for (let j = 0; j <= NZ; j++) { const z = zb + (Z1 - zb) * j / NZ; pos.push(x, terrainH(x, z) + .02, z); uv.push((x - X0) / (X1 - X0), 1 - (z - zMin) / (Z1 - zMin)); }
  }
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) { const a = i * (NZ + 1) + j, b = a + NZ + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }   // лицом вверх (иначе сверху сетку не видно)
  const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const PX = 1.4, W = Math.ceil((X1 - X0) * PX), Hh = Math.ceil((Z1 - zMin) * PX), c = document.createElement("canvas"); c.width = W; c.height = Hh;
  const cx = c.getContext("2d"), tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding; tex.anisotropy = 8;
  const css = hex => "#" + new T.Color(hex).convertLinearToSRGB().getHexString();      // цвет материала (линейный) → цвет на холсте
  const hm = new T.MeshLambertMaterial({ map: tex });
  hm.onBeforeCompile = sh => {             // то же зерно асфальта по мировым координатам — холст 1,4 пикс/м вблизи не «мыльный»
    sh.uniforms.uGrain = { value: grainTex };
    sh.vertexShader = "varying vec2 vGxz;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vGxz = position.xz / 7.0;");
    sh.fragmentShader = "uniform sampler2D uGrain;\nvarying vec2 vGxz;\n" + sh.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\n diffuseColor.rgb *= texture2D(uGrain, vGxz).rgb * 1.06;");
  };
  const mesh = new T.Mesh(g, hm); mesh.userData.dyn = true; scene.add(mesh);
  const AREA = { c: 0xa59b87, b: 0xd8c89d, g: 0x4a7d2e, f: 0x3b6a28, s: 0x447f35, k: 0x9c9a93, w: 0x3d6f86 }, RC = [0x404246, 0x45474b, 0x4b4d51, 0x55575b, 0xa8a59e];
  const shadowA = { sunset: .4, day: .34, night: .14 };
  function paint() {
    cx.setTransform(PX, 0, 0, PX, -X0 * PX, -zMin * PX);
    cx.fillStyle = css(0x9d9585); cx.fillRect(X0, zMin, X1 - X0, Z1 - zMin);
    // склон зеленее: чем круче, тем больше травы — как на фото правого берега
    for (let x = X0; x < X1; x += 8) for (let z = zMin; z < Z1; z += 8) {
      const [gx, gz] = terrainN(x + 4, z + 4), k = Math.min(1, Math.hypot(gx, gz) / .14);
      if (k > .05) { cx.fillStyle = `rgba(92,128,62,${(.55 * k).toFixed(2)})`; cx.fillRect(x, z, 8, 8); }
    }
    const poly = rs => { cx.beginPath(); rs.forEach(r => r.forEach(([x, z], i) => i ? cx.lineTo(x, z) : cx.moveTo(x, z))); cx.fill("evenodd"); };
    // набережная — плитка (тёпло-бежевая с рисунком), полоса 16 м вдоль воды
    if (!paint.tile) { const t = document.createElement("canvas"); t.width = t.height = 16; const g = t.getContext("2d"); g.fillStyle = css(0xc9ab90); g.fillRect(0, 0, 16, 16); g.fillStyle = css(0xb08f78); g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8); g.fillStyle = "rgba(0,0,0,.12)"; g.fillRect(0, 7, 16, 1); g.fillRect(7, 0, 1, 16); paint.tile = cx.createPattern(t, "repeat"); }
    cx.beginPath();
    for (let x = X0; x <= X1; x += 10) cx.lineTo(x, bankAt(x)); for (let x = X1; x >= X0; x -= 10) cx.lineTo(x, bankAt(x) + 16);
    cx.closePath(); cx.fillStyle = paint.tile; cx.fill();
    ["c", "b", "g", "f", "s", "k", "w"].forEach(k => { cx.fillStyle = css(AREA[k]); OSM.a.forEach(([kk, rs]) => { if (kk === k) poly(rs.map(dm)); }); });
    cx.lineCap = cx.lineJoin = "round";
    OSM.l.forEach(([, a]) => { const pts = dm(a); cx.strokeStyle = "#3b3936"; cx.lineWidth = 1.8; cx.beginPath(); pts.forEach(([x, z], i) => i ? cx.lineTo(x, z) : cx.moveTo(x, z)); cx.stroke(); });
    [4, 3, 2, 1, 0].forEach(cl => { cx.strokeStyle = css(RC[cl]); ROADS.forEach(r => { if (r.c !== cl || r.deck) return; cx.lineWidth = r.w; cx.beginPath(); r.pts.forEach(([x, z], i) => i ? cx.lineTo(x, z) : cx.moveTo(x, z)); cx.stroke(); }); });
    // тени домов под текущим солнцем
    cx.fillStyle = `rgba(0,0,0,${shadowA[TIME]})`; const sx = -SUN_DIR.x / SUN_DIR.y, sz = -SUN_DIR.z / SUN_DIR.y;
    cx.beginPath();
    solids.forEach(b => { if (!b.rings || b.arena || b.z1 < zMin || b.z0 > Z1) return; const ring = b.rings[0], len = Math.min(b.h - terrainH((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2), 22), n = Math.max(2, Math.ceil(len * Math.hypot(sx, sz) / 3));
      if (len < 2) return; for (let k = 0; k <= n; k++) { const d = len * k / n; ring.forEach(([x, z], i) => i ? cx.lineTo(x + sx * d, z + sz * d) : cx.moveTo(x + sx * d, z + sz * d)); cx.closePath(); } });
    cx.fill("nonzero");
    tex.needsUpdate = true;
  }
  // гранитная набережная по фото: стенка к воде, чёрная кованая ограда между белыми столбиками, фонари-шары
  const wall = [], fence = [], fuv = [], q = (A, a, b, c2, d) => A.push(...a, ...b, ...c2, ...a, ...c2, ...d), posts = [], globes = [];
  let run = 0, lastLamp = -99, benchAt = -99; const benches = [];
  for (let i = 0; i < NX * 3; i++) {
    const xa = X0 + (X1 - X0) * i / (NX * 3), xb = X0 + (X1 - X0) * (i + 1) / (NX * 3), za = bankAt(xa) + .05, zb = bankAt(xb) + .05, ha = terrainH(xa, za + .1), hb = terrainH(xb, zb + .1);
    if (ha < .5 && hb < .5) continue;
    q(wall, [xa, -1.5, za], [xb, -1.5, zb], [xb, hb, zb], [xa, ha, za]);
    const L = Math.hypot(xb - xa, zb - za);
    q(fence, [xa, ha, za + .15], [xb, hb, zb + .15], [xb, hb + 1.05, zb + .15], [xa, ha + 1.05, za + .15]);
    fuv.push(run / 2, 0, (run + L) / 2, 0, (run + L) / 2, 1, run / 2, 0, (run + L) / 2, 1, run / 2, 1);
    if (Math.floor((run + L) / 5) > Math.floor(run / 5)) posts.push(M4(xb, hb + .6, zb + .15, Math.atan2(-(zb - za), xb - xa)));        // белые столбики через 5 м
    if (run - lastLamp > 32 && !onCarriageway(xb, zb + 3.2)) { lastLamp = run; const nz = zb + 3.2; globes.push([xb, terrainH(xb, nz), nz]); }   // фонари-шары через ~32 м, не на проезжей части
    else if (run - lastLamp > 15 && benchAt < lastLamp && !onCarriageway(xb, zb + 2.4, 1)) { benchAt = run; const nz = zb + 2.4; benches.push(M4(xb, terrainH(xb, nz), nz, Math.atan2(-(zb - za), xb - xa))); }   // скамейка с урной между фонарями
    run += L;
  }
  const mkG = (P, m, uv) => { const gg = new T.BufferGeometry(); gg.setAttribute("position", new T.Float32BufferAttribute(P, 3)); if (uv) gg.setAttribute("uv", new T.Float32BufferAttribute(uv, 2)); gg.computeVertexNormals(); scene.add(new T.Mesh(gg, m)); };
  mkG(wall, new T.MeshStandardMaterial({ color: 0x6f6a64, roughness: .85, side: T.DoubleSide }));
  const fc = document.createElement("canvas"); fc.width = 64; fc.height = 32; const fg = fc.getContext("2d");
  fg.fillStyle = "#16171a"; fg.fillRect(0, 0, 64, 3); fg.fillRect(0, 28, 64, 4); for (let x = 2; x < 64; x += 6) fg.fillRect(x, 0, 2, 32);   // поручень, низ, прутья
  fg.strokeStyle = "#16171a"; fg.lineWidth = 2; fg.beginPath(); fg.arc(32, 16, 7, 0, 7); fg.stroke();                                  // кованый узор
  const ft = new T.CanvasTexture(fc); ft.wrapS = T.RepeatWrapping;
  mkG(fence, new T.MeshStandardMaterial({ map: ft, alphaTest: .5, transparent: false, side: T.DoubleSide, roughness: .5, metalness: .4 }), fuv);
  chunked(new T.BoxGeometry(.5, 1.2, .5), mat(0xeeece6), posts, .6);
  const gm = nightReg(new T.MeshBasicMaterial({ color: 0xe8e8e2 }), "color", { sunset: 0xe8e8e2, day: 0xe8e8e2, night: 0xfff4d6 });
  chunked(new T.CylinderGeometry(.07, .1, 4, 6).translate(0, 2, 0), mat(0x2a2c30), globes.map(([x, y, z]) => M4(x, y, z)), .5);
  chunked(new T.SphereGeometry(.32, 10, 8).translate(0, 4.2, 0), gm, globes.map(([x, y, z]) => M4(x, y, z)), .5);
  {   // скамейка (дерево, чугунные ножки) и урна — одна сетка с цветами по вершинам, спинкой к городу
    const part = (geo, hex) => { const g = geo.toNonIndexed(), c = new T.Color(hex), n = g.attributes.position.count; g.setAttribute("color", new T.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => c.toArray()[i % 3]), 3)); g.deleteAttribute("uv"); return g; };
    const wood = 0x6b4426, iron = 0x24262a;
    const bench = mergeGeos([
      part(new T.BoxGeometry(1.8, .07, .42).translate(0, .45, 0), wood), part(new T.BoxGeometry(1.8, .36, .05).translate(0, .74, .22), wood),
      part(new T.BoxGeometry(.06, .45, .46).translate(-.78, .23, .02), iron), part(new T.BoxGeometry(.06, .45, .46).translate(.78, .23, .02), iron),
      part(new T.CylinderGeometry(.22, .19, .7, 8).translate(1.45, .35, 0), iron),
    ]);
    if (benches.length) chunked(bench, new T.MeshStandardMaterial({ vertexColors: true, roughness: .8 }), benches, .35);
  }
  paint();
  return { paint, mesh };
})();
kickers.forEach(festKicker);                         // праздничные лампочки и вымпелы на всех трамплинах
if (FEST.geos.length) { scene.add(new T.Mesh(mergeGeos(FEST.geos), FEST_M)); FEST.geos = []; }
freeze(scene);   // вся неподвижная геометрия мира — несколько склеенных мешей
// мелкая склеенная статика (вывески, указатели — у каждой своя текстура) издалека не нужна: в отсечение участков
scene.children.forEach(o => {
  if (!o.isMesh || o.isInstancedMesh || o.userData.dyn || o.geometry.attributes.position.count > 96) return;
  o.geometry.computeBoundingSphere(); const sph = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld);
  if (sph.radius < 25) CHUNKS.push({ obj: o, s: sph, far: .8 });
});
// сетка 40 м для препятствий: домов сотни, проверять все на каждом шаге физики дорого
const SGRID = 40, sgrid = new Map(), skey = (i, j) => i * 4096 + j, STREET = {};
solids.forEach(b => {
  for (let i = Math.floor((b.x0 - 2) / SGRID); i <= Math.floor((b.x1 + 2) / SGRID); i++)
    for (let j = Math.floor((b.z0 - 2) / SGRID); j <= Math.floor((b.z1 + 2) / SGRID); j++) {
      const k = skey(i, j); if (!sgrid.has(k)) sgrid.set(k, []); sgrid.get(k).push(b);
    }
});
const solidsNear = (x, z) => sgrid.get(skey(Math.floor(x / SGRID), Math.floor(z / SGRID))) || [];
const sgridAdd = b => {                                   // препятствие, появившееся после старта (дома подгруженной сцены)
  for (let i = Math.floor((b.x0 - 2) / SGRID); i <= Math.floor((b.x1 + 2) / SGRID); i++)
    for (let j = Math.floor((b.z0 - 2) / SGRID); j <= Math.floor((b.z1 + 2) / SGRID); j++) { const k = skey(i, j); if (!sgrid.has(k)) sgrid.set(k, []); sgrid.get(k).push(b); }
};

