// «Восьмёрка Баклажан» — фонари, светофоры, «зебры».
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- улицы Ростова: фонари, светофоры, «зебры» ---------- */
const SIGNALS = { A: [], B: [] };          // материалы сигналов двух направлений перекрёстка
(() => {
  const m4 = new T.Matrix4(), q = new T.Quaternion(), V = (x, y, z) => new T.Vector3(x, y, z), one = V(1, 1, 1);
  const yawOf = (dx, dz) => Math.atan2(-dz, dx);
  const geo = (...parts) => mergeGeos(parts.map(([g, x, y, z]) => { const n = g.toNonIndexed(); n.translate(x, y, z); return n; }));
  // перекрёстки — общие вершины разных улиц; «ноги» — направления выходящих из них отрезков
  const vmap = new Map(), key = (x, z) => Math.round(x * 2) + "," + Math.round(z * 2);
  ROADS.forEach((r, ri) => { if (r.c > 2 || r.deck || r.west) return; r.pts.forEach((pt, i) => { const k = key(...pt); if (!vmap.has(k)) vmap.set(k, []); vmap.get(k).push([ri, i]); }); });
  const cross = [];
  vmap.forEach(list => {
    if (new Set(list.map(l => l[0])).size < 2) return;
    const [x, z] = ROADS[list[0][0]].pts[list[0][1]];
    if (!inStrip(x, z) || z > -86) return;
    const legs = [];
    list.forEach(([ri, i]) => { const r = ROADS[ri]; [i - 1, i + 1].forEach(j => { if (j < 0 || j >= r.pts.length) return; const [px, pz] = r.pts[j], L = Math.hypot(px - x, pz - z); if (L > 1) legs.push({ dx: (px - x) / L, dz: (pz - z) / L, w: r.w, c: r.c, L }); }); });
    if (legs.length >= 3) cross.push({ x, z, legs, major: Math.min(...legs.map(l => l.c)), wmax: Math.max(...legs.map(l => l.w)) });
  });
  // «зебры»: полосы вдоль дороги шириной 0,5 м с шагом 1 м поперёк неё, за краем перекрёстка
  const zeb = [];
  cross.forEach(cr => cr.legs.forEach(l => {
    const d = cr.wmax / 2 + 2.5; if (l.L < d + 4) return;
    const cx = cr.x + l.dx * d, cz = cr.z + l.dz * d, yaw = yawOf(l.dx, l.dz);
    for (let o = -l.w / 2 + .6; o <= l.w / 2 - .5; o += 1) zeb.push([cx - l.dz * o, cz + l.dx * o, yaw]);
  }));
  chunked(new T.PlaneGeometry(3, .5).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xeeeae0 }), zeb.slice(0, 5000).map(([x, z, yaw]) => M4T(x, .095, z, yaw)), .6);
  // светофоры на перекрёстках улиц и магистралей: по столбу на каждую «ногу», смотрят навстречу подъезжающим
  const tl = [];
  // столб — у края своей «ноги»; если там другая проезжая часть (двойная магистраль, косой перекрёсток) — отодвигаем до 6 м, иначе не ставим
  cross.filter(cr => cr.major <= 1).slice(0, 70).forEach(cr => cr.legs.slice(0, 4).forEach(l => {
    const d = cr.wmax / 2 + 1.5; let off = l.w / 2 + 1.2, x, z;
    for (; off < l.w / 2 + 7; off += .5) { x = cr.x + l.dx * d - l.dz * off; z = cr.z + l.dz * d + l.dx * off; if (!onCarriageway(x, z)) break; }
    if (off >= l.w / 2 + 7) return;
    if (solidsNear(x, z).some(b => b.h > .5 && inBox(b, x, z, 1.1))) return;
    tl.push([x, z, yawOf(l.dx, l.dz), Math.abs(l.dx) > Math.abs(l.dz) ? "A" : "B"]);
  }));
  chunked(geo([new T.CylinderGeometry(.07, .08, 3.2, 6), 0, 1.6, 0], [new T.BoxGeometry(.3, 1.05, .34), .05, 3.6, 0]), mat(0x2b2d33), tl.map(([x, z, yaw]) => M4(x, terrainH(x, z), z, yaw)), .6);
  ["A", "B"].forEach(grp => {
    const mine = tl.filter(t => t[3] === grp);
    [[3.92, 0xff3b30], [3.6, 0xffc400], [3.28, 0x3ddc84]].forEach(([y, c]) => {
      const m = new T.MeshBasicMaterial({ color: c }); m.userData.on = new T.Color(c); m.userData.off = new T.Color(c).multiplyScalar(.18);
      chunked(new T.CircleGeometry(.12, 8).rotateY(Math.PI / 2).translate(.205, y, 0), m, mine.map(([x, z, yaw]) => M4(x, terrainH(x, z), z, yaw)), .6);
      SIGNALS[grp].push(m);
    });
  });
  // фонари вдоль улиц: через 34 м, по очереди с разных сторон, не в домах и не в воде.
  // По просьбе заказчика в городе их нет — только у стадиона (в 280 м от Арены); и никогда — на проезжей части.
  const lamps = [], taken = new Set();
  const onRoad = (x, z) => onCarriageway(x, z, .3);
  ROADS.forEach(r => {
    if (r.c > 2 || r.deck || r.west) return;
    let side = 1, acc = 12;
    for (let i = 1; i < r.pts.length && lamps.length < 800; i++) {
      const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i], L = Math.hypot(bx - ax, bz - az); if (L < .1) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L, off = r.w / 2 + 1;
      for (; acc < L; acc += 34) {
        const ox = -uz * off * side, oz = ux * off * side, x = ax + ux * acc + ox, z = az + uz * acc + oz;
        side = -side;
        const k = Math.round(x / 15) + "," + Math.round(z / 15);
        if (taken.has(k) || !inStrip(x, z) || z > -86 || solidsNear(x, z).some(b => b.h > .5 && inBox(b, x, z, 1.1)) || waterAt(x, z)) continue;
        if (!ARENA || Math.hypot(x - ARENA.C[0], z - ARENA.C[1]) > 280 || onRoad(x, z)) continue;
        taken.add(k); lamps.push([x, z, yawOf(-ox, -oz)]);
      }
      acc -= L;
    }
  });
  const pool = document.createElement("canvas"); pool.width = pool.height = 64;
  const pg = pool.getContext("2d"), gr = pg.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,214,150,.55)"); gr.addColorStop(1, "rgba(255,214,150,0)"); pg.fillStyle = gr; pg.fillRect(0, 0, 64, 64);
  const lampParts = [
    [geo([new T.CylinderGeometry(.07, .09, 7, 5), 0, 3.5, 0], [new T.BoxGeometry(1.6, .08, .08), .8, 7, 0]), mat(0x5c606b)],
    [new T.BoxGeometry(.55, .1, .24).translate(1.5, 6.92, 0), nightReg(new T.MeshBasicMaterial({ color: 0xffe2a0 }), "color", { sunset: 0xd9d2bf, day: 0xd9d2bf, night: 0xfff0c0 })],
    [new T.PlaneGeometry(13, 13).rotateX(-Math.PI / 2).translate(1.5, .14, 0), nightReg(new T.MeshBasicMaterial({ map: new T.CanvasTexture(pool), transparent: true, depthWrite: false, blending: T.AdditiveBlending, visible: false }), "visible", { sunset: false, day: false, night: true })]   // фонари горят ночью
  ];
  lampParts.forEach(([g, m], k) => chunked(g, m, lamps.map(([x, z, yaw]) => M4(x, terrainH(x, z) + (k === 2 ? .2 : 0), z, yaw)), k === 2 ? .5 : .8));
  STREET.lamps = lamps.length; STREET.signals = tl.length; STREET.zebras = zeb.length; STREET.crossings = cross.length;
})();
function tickSignals(t) {                  // цикл 16 с: у одного направления зелёный, у другого красный
  const ph = t % 16, a = ph < 6 ? 2 : ph < 8 ? 1 : 0, b = ph < 8 ? 0 : ph < 14 ? 2 : 1;   // 0 красный, 1 жёлтый, 2 зелёный
  [["A", a], ["B", b]].forEach(([grp, on]) => SIGNALS[grp].forEach((m, k) => m.color.copy(k === 2 - on ? m.userData.on : m.userData.off)));
}

