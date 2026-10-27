// «Восьмёрка Баклажан» — трюк-парк и трамплины.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- трюк-парк и трамплины ---------- */
function kicker(x, z, yaw, len, w, h, color = 0x3a3f58, curve = false, y0 = 0) {
  // curve — «четверть трубы»: профиль-парабола h·(u/len)², в конце крутизна atan(2h/len)
  // y0 — высота основания: трамплин может стоять на крыше
  const k = { x, z, yaw, len, w, h, curve, y0, roof: y0 > 0, fx: Math.cos(yaw), fz: -Math.sin(yaw) };
  kickers.push(k);
  const g = new T.Group();
  const slope = Math.atan(h / len), L2 = Math.hypot(len, h);
  if (curve) {
    const N = 12;
    for (let i = 0; i < N; i++) {
      const u0 = len * i / N, u1 = len * (i + 1) / N, y0 = h * (u0 / len) ** 2, y1 = h * (u1 / len) ** 2;
      const seg = new T.Mesh(new T.BoxGeometry(Math.hypot(u1 - u0, y1 - y0) + .05, .3, w), mat(color, { roughness: .6 }));
      seg.rotation.z = Math.atan2(y1 - y0, u1 - u0); seg.position.set((u0 + u1) / 2, (y0 + y1) / 2 - .15, 0); g.add(seg);
    }
  } else {
    const deck = new T.Mesh(new T.BoxGeometry(L2, .3, w), mat(color, { roughness: .6 }));
    deck.rotation.z = slope; deck.position.set(len / 2, h / 2 - .15, 0); g.add(deck);
  }
  const back = new T.Mesh(new T.BoxGeometry(.4, h, w), mat(0x2a2d3c)); back.position.set(len - .2, h / 2, 0); g.add(back);
  const sideM = mat(0x2a2d3c, { side: T.DoubleSide });
  [-1, 1].forEach(s => {
    const sh = new T.Shape(); sh.moveTo(0, 0); sh.lineTo(len, 0); sh.lineTo(len, h); sh.closePath();
    const side = new T.Mesh(new T.ShapeGeometry(sh), sideM); side.position.z = s * w / 2; g.add(side);
  });
  const stripe = new T.Mesh(new T.BoxGeometry(.6, .32, w + .02), mat(0xffb347)); stripe.rotation.z = slope; stripe.position.set(len - .4, h - .1, 0); g.add(stripe);
  g.position.set(x, y0, z); g.rotation.y = yaw; scene.add(g);
  return k;
}
const rings = [];
// оранжевые кольца: копятся при постройке мира, сетки — в первом кадре: экземпляры по квадратам карты (как chunked),
// у каждого кольца свой цвет экземпляра (взято — зелёное). Раньше каждое кольцо было отдельным вызовом отрисовки
const ringQ = [];
function ring(x, y, z, yaw = 0) {
  const r = { x, y, z, yaw, got: false, col: new T.Color(0xffb347), im: null, ii: 0 };
  r.m = { material: { color: { setHex(h) { r.col.setHex(h); if (r.im) { r.im.setColorAt(r.ii, r.col); r.im.instanceColor.needsUpdate = true; } } } } };
  ringQ.push(r); rings.push(r);
}
function buildRings() {
  if (!ringQ.length) return;
  const geo = new T.TorusGeometry(3.2, .28, 8, 28), mats = ringQ.map(r => M4(r.x, r.y, r.z, Math.PI / 2 + r.yaw)), n0 = CHUNKS.length, groups = new Map();
  chunked(geo, new T.MeshBasicMaterial(), mats, 1, ringQ.map(r => r.col));
  ringQ.forEach((r, j) => { const k = Math.floor(r.x / CHUNK) * 4096 + Math.floor(r.z / CHUNK); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
  [...groups.values()].forEach((list, gi) => list.forEach((r, i) => { r.im = CHUNKS[n0 + gi].obj; r.ii = i; }));
  ringQ.length = 0;
}
const N05 = testMark();                // трюк-парк — в сцене площадок (testGroup в конце)
(() => {
  flat(330, 100, under(0x8a8a86), 460, TZ + 15, .02);
  const s = new T.Mesh(new T.PlaneGeometry(14, 3.5), new T.MeshBasicMaterial({ map: textTex(["ТРЮК-ПАРК"], 512, 128, "#2b2438", "#9fe3ff"), side: T.DoubleSide }));
  s.position.set(310, 7, TZ - 30); s.rotation.y = Math.PI / 2; scene.add(s);
  kicker(320, TZ, 0, 10, 6, 3);           ring(352, 7, TZ);
  kicker(360, TZ + 30, 0, 16, 8, 6, 0x4a3f58); ring(400, 13, TZ + 30);
  for (let i = 0; i < 4; i++) {
    const bx = 392 + i * 12.5, bus = new T.Mesh(new T.BoxGeometry(11, 3.2, 2.6), mat(0xe0a83a, { roughness: .5 }));
    bus.position.set(bx, 1.9, TZ + 30); scene.add(bus);
    const win = new T.Mesh(new T.BoxGeometry(9.5, .8, 2.62), mat(0x1b2236)); win.position.set(bx, 2.5, TZ + 30); scene.add(win);
    addSolid(bx - 5.5, bx + 5.5, TZ + 28.7, TZ + 31.3, 3.5, "автобус");
  }
  kicker(470, TZ - 15, 0, 28, 9, 11, 0x5a3348); ring(530, 22, TZ - 15); ring(560, 16, TZ - 15);
  kicker(600, TZ + 50, Math.PI, 12, 6, 4); ring(565, 9, TZ + 50, Math.PI);
  kicker(700, ZA + 13.75, 0, 12, 3.2, 3.5);
  kicker(1100, ZA + 13.75, 0, 22, 3.2, 7);
  kicker(900, ZA - 13.75, Math.PI, 14, 3.2, 4.5);
  ring(760, 9, ZA + 13.75); ring(1190, 16, ZA + 13.75);
})();
testGroup(N05);
