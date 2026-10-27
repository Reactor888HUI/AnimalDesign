// «Восьмёрка Баклажан» — земля, полигон, автобан.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- земля и полигон ---------- */
// земля до западной сцены: южная часть (город, левый берег, площадки) — на нуле, за Садовой — плато PLAT
flat(5600, 4218, new T.MeshLambertMaterial({ color: 0xa79d7a, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 }), 1100, -2191, 0);   // свой материал: под слоями воды и газонов
const groundM = new T.MeshLambertMaterial({ color: 0xa79d7a, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 });   // плато и склоны к нему (отдельно от южной земли)
flat(5600, 1432, groundM, 1100, 634, PLAT / 3);
const N03 = testMark();                   // дальше — площадки-макеты (testGroup в конце файла)
flat(360, 10, under(0x45474b), 120, TZ, .02);
const markM = new T.MeshBasicMaterial({ color: 0xbfc4d0 });
for (let x = -20; x < 300; x += 6) flat(2.5, .2, markM, x, TZ, .03);
function groundLabel(text, x, z) {
  const c = document.createElement("canvas"); c.width = 128; c.height = 64;
  const g = c.getContext("2d"); g.fillStyle = "#e8ecf5"; g.font = "bold 40px JetBrains Mono, monospace"; g.textAlign = "center"; g.fillText(text, 64, 46);
  const m = new T.Mesh(new T.PlaneGeometry(4, 2), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.PI / 2; m.position.set(x, .12, z); scene.add(m);
}
for (let m = 10; m <= 120; m += 10) groundLabel(`${m} м`, RX + m, TZ + 6.5);
const tower = new T.Mesh(new T.BoxGeometry(2, 30, 2), mat(0x2b2438)); tower.position.set(110, 15, TZ - 28); scene.add(tower);
addSolid(109, 111, TZ - 29, TZ - 27, 30, "башню");
const beacon = new T.Mesh(new T.BoxGeometry(.8, .8, .8), new T.MeshBasicMaterial({ color: 0xff5a4a })); beacon.position.set(110, 30.6, TZ - 28); scene.add(beacon);
for (let i = 0; i < 9; i++) {
  const w = 40 + (i * 37) % 50, h = 22 + (i * 13) % 26;
  const mtn = new T.Mesh(new T.CylinderGeometry(w * .45, w * .6, h, 6), mat(0x8d9a8a, { flatShading: true }));
  mtn.position.set(-300 + i * 190, h / 2, TZ - 330 - (i * 53) % 120);   // за автобаном, с дальней от города стороны scene.add(mtn);
}

/* трибуна */
const TRIB = { x: ROW0 + 14, z: TZ + 22 };
(() => {
  for (let k = 0; k < 4; k++) { const s = new T.Mesh(new T.BoxGeometry(26, 1, 2), mat(0x1c2033)); s.position.set(TRIB.x, .5 + k, TRIB.z + k * 2); scene.add(s); }
  const roof = new T.Mesh(new T.BoxGeometry(28, .3, 10), mat(0x2b2438)); roof.position.set(TRIB.x, 7.5, TRIB.z + 3); scene.add(roof);
  const cols = [0xffd6b0, 0x9fe3ff, 0xffb347, 0xe8ecf5, 0xff6b5e];
  const fan = new T.InstancedMesh(new T.BoxGeometry(.5, .9, .5), new T.MeshBasicMaterial(), 80), m4 = new T.Matrix4(), c = new T.Color();
  for (let i = 0; i < 80; i++) {
    const k = i % 4; m4.makeTranslation(TRIB.x - 12 + Math.floor(i / 4) * 1.25 + (k % 2) * .4, 1.45 + k, TRIB.z + k * 2);
    fan.setMatrixAt(i, m4); fan.setColorAt(i, c.setHex(cols[i % cols.length]));
  }
  scene.add(fan);
  addSolid(TRIB.x - 13, TRIB.x + 13, TRIB.z - 1, TRIB.z + 8, 8, "трибуну");
})();

/* рампа-штопор */
const smooth = t => t * t * (3 - 2 * t);
const lerp = (a, b, k) => a + (b - a) * k;
const rampY = t => RH * t * t;
(() => {
  const N = 48, rampMat = mat(0x3a3f58, { side: T.DoubleSide }), railA = mat(0xffb347), railB = mat(0x9fe3ff);
  for (let i = 0; i < N; i++) {
    const t = (i + .5) / N, roll = 180 * smooth(t) * DEG;
    const seg = new T.Group();
    seg.position.set(RS + RL * t, rampY(t) + WHEEL, TZ);
    seg.rotation.set(roll, 0, Math.atan(2 * RH * t / RL), "ZYX");
    const deck = new T.Mesh(new T.BoxGeometry(RL / N * 1.35, .15, 3.2), rampMat); deck.position.y = -WHEEL - .08; seg.add(deck);
    [-1.65, 1.65].forEach((z, k) => { const r = new T.Mesh(new T.BoxGeometry(RL / N * 1.35, .3, .12), k ? railA : railB); r.position.set(0, -WHEEL + .05, z); seg.add(r); });
    scene.add(seg);
    if (i % 7 === 3) {
      seg.updateMatrixWorld();
      const p = new T.Vector3(0, -WHEEL - .1, 0).applyMatrix4(seg.matrixWorld);
      if (p.y > .3) { const post = new T.Mesh(new T.CylinderGeometry(.12, .12, p.y, 6), mat(0x454a63)); post.position.set(p.x, p.y / 2, p.z); scene.add(post); }
    }
  }
})();

/* ---------- автобан ---------- */
(() => {
  const len = 2000, cx = 400;
  flat(len, 36, under(0x404246), cx, ZA, .02);
  const white = new T.MeshBasicMaterial({ color: 0xd9dde6 });
  [ZA + 17.5, ZA + 1.6, ZA - 1.6, ZA - 17.5].forEach(z => flat(len, .25, white, cx, z, .03));
  const dash = new T.InstancedMesh(new T.PlaneGeometry(6, .2), white, 1020), m4 = new T.Matrix4();
  const q = new T.Quaternion().setFromEuler(new T.Euler(-Math.PI / 2, 0, 0)), one = new T.Vector3(1, 1, 1);
  let k = 0;
  [5.1, 8.6, 12.1].forEach(o => [ZA + o, ZA - o].forEach(z => {
    for (let x = -590; x < 1390 && k < 1020; x += 12) { m4.compose(new T.Vector3(x, .09, z), q, one); dash.setMatrixAt(k++, m4); }
  }));
  dash.count = k; scene.add(dash);
  const concrete = mat(0x9a9aa4), rail = mat(0xb8bcc6, { metalness: .5, roughness: .4 });
  const segs = (x0, x1, gaps) => {
    const out = []; let s = x0;
    gaps.sort((a, b) => a[0] - b[0]).forEach(([g0, g1]) => { if (g0 > s) out.push([s, g0]); s = Math.max(s, g1); });
    if (s < x1) out.push([s, x1]); return out;
  };
  segs(-600, 1400, [[193, 207], [593, 607], [993, 1007]]).forEach(([a, b]) => {
    const m = new T.Mesh(new T.BoxGeometry(b - a, .9, .6), concrete); m.position.set((a + b) / 2, .45, ZA); scene.add(m);
    walls.push({ x0: a, x1: b, z0: ZA - .5, z1: ZA + .5, h: .9 });
  });
  segs(-600, 1400, []).forEach(([a, b]) => {
    const m = new T.Mesh(new T.BoxGeometry(b - a, .8, .2), rail); m.position.set((a + b) / 2, .55, ZA - 18.2); scene.add(m);
    walls.push({ x0: a, x1: b, z0: ZA - 18.6, z1: ZA - 17.8, h: .8 });
  });
  segs(-600, 1400, [[-40, 640], [868, 892]]).forEach(([a, b]) => {
    const m = new T.Mesh(new T.BoxGeometry(b - a, .8, .2), rail); m.position.set((a + b) / 2, .55, ZA + 18.2); scene.add(m);
    walls.push({ x0: a, x1: b, z0: ZA + 17.8, z1: ZA + 18.6, h: .8 });
  });
  const pole = new T.InstancedMesh(new T.CylinderGeometry(.12, .15, 10, 6), mat(0x6b6f7c), 40);
  const lamp = new T.InstancedMesh(new T.BoxGeometry(1.6, .25, .5), new T.MeshBasicMaterial({ color: 0xffe2a8 }), 40);
  let n = 0;
  for (let x = -580; x < 1400 && n < 40; x += 50, n++) {
    m4.makeTranslation(x, 5, ZA); pole.setMatrixAt(n, m4);
    m4.makeTranslation(x, 10, ZA); lamp.setMatrixAt(n, m4);
  }
  pole.count = lamp.count = n; scene.add(pole, lamp);
  const gantry = (x, lines) => {
    const g = new T.Group(), post = mat(0x6b6f7c);
    [ZA - 18.8, ZA + 18.8].forEach(z => { const p = new T.Mesh(new T.BoxGeometry(.4, 8, .4), post); p.position.set(0, 4, z); g.add(p); });
    const beam = new T.Mesh(new T.BoxGeometry(.4, .5, 38), post); beam.position.set(0, 7.8, ZA); g.add(beam);
    const sign = new T.Mesh(new T.PlaneGeometry(14, 3.5), new T.MeshBasicMaterial({ map: textTex(lines, 512, 128), side: T.DoubleSide }));
    sign.rotation.y = -Math.PI / 2; sign.position.set(-.3, 6, ZA + 9); g.add(sign);
    g.position.x = x; scene.add(g);
  };
  gantry(-200, ["СТАРТ ЗАЕЗДА · 30 с", "Полигон → 200 м"]);
  gantry(1000, ["ФИНИШ ЗАЕЗДА", "1200 м от старта"]);
  gantry(250, ["Ростов ← налево", "Трюк-парк → направо"]);
  gantry(650, ["Трамплин на крайней", "правой полосе"]);
})();
/* ---------- дорога из города к площадкам: от южного края карты (у середины) на юг до автобана ---------- */
(() => {
  const x = 880, z0 = -2840, z1 = ZA + 18, L = z0 - z1;            // южный край карты — z −2844; середина (x ~760) — протока, x 880 — ближайшая суша
  flat(10, L, under(0x404246), x, (z0 + z1) / 2, .02);
  const white = new T.MeshBasicMaterial({ color: 0xd9dde6 });
  [-4.7, 4.7].forEach(o => flat(.2, L, white, x + o, (z0 + z1) / 2, .03));
  for (let z = z1 + 3; z < z0 - 3; z += 12) flat(.2, 6, white, x, z + 3, .03);
  const sign = new T.Mesh(new T.PlaneGeometry(9, 2.6), new T.MeshBasicMaterial({ map: textTex(["ПОЛИГОН · ТРЮК-ПАРК", "«Восьмёрка» · автобан ↓"], 512, 148), side: T.DoubleSide }));
  sign.position.set(x + 9, 3.6, z0 - 12); scene.add(sign);
  [-3.8, 3.8].forEach(o => { const p = new T.Mesh(new T.BoxGeometry(.2, 3.6, .2), mat(0x6b6f7c)); p.position.set(x + 9 + o, 1.8, z0 - 12); scene.add(p); });
})();
testGroup(N03);
