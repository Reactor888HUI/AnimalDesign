// «Восьмёрка Баклажан» — суда на Дону.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- суда на Дону: сухогруз и теплоход — по ним можно ездить и на них можно приземляться ---------- */
// Фарватер — середина реки по всей карте (от железнодорожного моста до восточного края), через подъёмный пролёт.
// У моста судно ждёт, пока пролёт поднимется. На краю карты разворачивается и идёт обратно.
const SHIPS = (() => {
  const raw = []; let zc = null;
  for (let x = WORLD.x1 - 40; x >= WORLD.x0 + 60; x -= 40) {
    const runs = []; let run = null;
    for (let z = -320; z >= -2840; z -= 8) { const w = waterAt(x, z); if (w && !run) run = [z, z]; else if (w) run[1] = z; else if (run) { runs.push(run); run = null; } }
    if (run) runs.push(run);
    const ok = runs.filter(r => r[0] - r[1] > 90); if (!ok.length) continue;
    const pick = zc == null ? ok.reduce((a, r) => r[0] - r[1] > a[0] - a[1] ? r : a) : ok.reduce((a, r) => Math.abs((r[0] + r[1]) / 2 - zc) < Math.abs((a[0] + a[1]) / 2 - zc) ? r : a);
    const c = (pick[0] + pick[1]) / 2; if (zc != null && Math.abs(c - zc) > 160) continue;
    raw.push([x, c]); zc = c;
  }
  if (raw.length < 4) return { list: [], tick() {}, ground: () => null, hit: () => null };
  let pts = raw.map((p, i) => { let z = 0, n = 0; for (let k = -3; k <= 3; k++) { const q = raw[i + k]; if (q) { z += q[1]; n++; } } return [p[0], z / n]; });
  if (RAILB) {                                          // через подъёмный пролёт — по перпендикуляру к мосту
    const C = RAILB.C, n = RAILB.nrm; let k0 = 0, bd = Infinity; pts.forEach((p, i) => { const d = Math.hypot(p[0] - C.x, p[1] - C.z); if (d < bd) { bd = d; k0 = i; } });
    const a = pts[Math.max(0, k0 - 3)], b = pts[Math.min(pts.length - 1, k0 + 3)], sg = Math.sign((b[0] - a[0]) * n.x + (b[1] - a[1]) * n.z) || 1;
    const line = []; for (let k = -200; k <= 200; k += 25) line.push([C.x + n.x * k * sg, C.z + n.z * k * sg]);
    pts = pts.filter(p => Math.hypot(p[0] - C.x, p[1] - C.z) > 230);
    const cut = pts.findIndex(p => (p[0] - C.x) * n.x * sg + (p[1] - C.z) * n.z * sg > 0); pts.splice(cut < 0 ? pts.length : cut, 0, ...line);
  }
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const LEN = cum[cum.length - 1];
  const pos = d => { d = Math.max(0, Math.min(LEN, d)); let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const k = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]; };
  // модели: коробки «x0 x1 z0 z1 y0 y1 цвет»; верх коробки, на которую можно встать, — площадка; бока выше палубы — препятствие
  const colorize = (g, hex) => { g = g.toNonIndexed(); const c = new T.Color(hex), a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } g.setAttribute("color", new T.BufferAttribute(a, 3)); g.deleteAttribute("uv"); return g; };
  const KINDS = {
    // сухогруз «ВАДИМ»: ярко-жёлтый корпус, красная ватерлиния, белая полоса под палубой, синие крышки трюма, белая рубка, красная труба
    barge: { name: "сухогруз «Вадим»", v: 6, title: "ВАДИМ", boxes: [
      [-42, 40, -6, 6, -3, 1.5, 0xffc21a, 1], [40, 46, -4, 4, -3, 1.5, 0xffc21a, 1], [46, 48, -2, 2, -2, 1.5, 0xffc21a, 1],                // корпус, нос
      [-42.1, 46.1, -6.12, 6.12, -.05, .55, 0xd8322c, 0], [-42.05, 46.05, -6.08, 6.08, 1.05, 1.5, 0xf6f6f2, 0],                          // ватерлиния, белая полоса
      [40, 46.5, -4.25, -3.95, 1.5, 2.5, 0xf6f6f2, 0], [40, 46.5, 3.95, 4.25, 1.5, 2.5, 0xf6f6f2, 0],                                     // фальшборт на носу
      [-14, 38, -4.7, 4.7, 1.5, 4, 0x1e7ad8, 1], ...[-8, 4, 16, 28].map(x => [x, x + .5, -4.75, 4.75, 1.5, 4.08, 0x0f4f9a, 0]),         // крышки трюма с рёбрами
      [-40, -31, -5, 5, 1.5, 7.5, 0xf6f6f2, 1], [-39.5, -32.5, -5.6, 5.6, 7.5, 10, 0xffffff, 1], [-39.6, -32.4, -5.7, 5.7, 10, 10.35, 0xff7a1a, 0],   // рубка, крыша
      [-33.4, -32.4, -4.5, 4.5, 8, 9.4, 0x1f4f7a, 0], [-40, -31, -5.05, 5.05, 4, 5, 0x1f4f7a, 0],                                        // окна
      [-38.2, -35.4, -1.3, 1.3, 10.35, 14, 0xd8322c, 0], [-38.25, -35.35, -1.35, 1.35, 12.6, 13.2, 0xffc21a, 0],                         // труба с жёлтой полосой
      [-36.5, -36, -.25, .25, 10, 16, 0x6c7074, 0]] },
    liner: { name: "теплоход", v: 5, boxes: [
      [-36, 34, -6.5, 6.5, -2.5, 1.5, 0xf2f4f5, 1], [34, 39, -4.5, 4.5, -2.5, 1.5, 0xf2f4f5, 1], [-36, 39, -6.6, 6.6, -.2, .3, 0x1f4f7a, 0],
      [-30, 28, -5.6, 5.6, 1.5, 4.5, 0xeef0f2, 1], [-30.2, 28.2, -5.7, 5.7, 2.6, 3.6, 0x2b3a4a, 0],
      [-20, 18, -5, 5, 4.5, 7.3, 0xf6f7f8, 1], [-20.2, 18.2, -5.1, 5.1, 5.4, 6.5, 0x2b3a4a, 0], [12, 18.6, -4, 4, 7.3, 8.5, 0x6c7f94, 0]] },
  };
  // название на бортах (и на корме): крупные буквы с обводкой на прозрачном фоне
  const nameTex = t => { const c = document.createElement("canvas"); c.width = 1024; c.height = 256; const g = c.getContext("2d");
    g.font = "900 190px Golos Text, Arial Black, Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 22; g.strokeStyle = "#ffffff"; g.strokeText(t, 512, 136); g.fillStyle = "#0f2a5a"; g.fillText(t, 512, 136);
    const tx = new T.CanvasTexture(c); tx.encoding = T.sRGBEncoding; return tx; };
  const addName = (m, k) => {
    const t = KINDS[k].title; if (!t) return;
    const mat = new T.MeshLambertMaterial({ map: nameTex(t), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    [[30, -.7, 6.13, 0], [30, -.7, -6.13, Math.PI], [-42.13, -.2, 0, -Math.PI / 2]].forEach(([x, y, z, ry], i) => {
      const n = new T.Mesh(new T.PlaneGeometry(i < 2 ? 15 : 9, i < 2 ? 3.75 : 2.25), mat); n.position.set(x, y, z); n.rotation.y = ry; m.add(n); });
  };
  const mk = k => { const g = mergeGeos(KINDS[k].boxes.map(([x0, x1, z0, z1, y0, y1, c]) => colorize(new T.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), c))); const m = new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: true })); m.userData.dyn = true; scene.add(m); addName(m, k); return m; };
  const list = [{ kind: "barge", d: 60, dir: 1 }, { kind: "liner", d: LEN * .55, dir: -1 }].map(sh => Object.assign(sh, { m: mk(sh.kind), x: 0, z: 0, yaw: 0, cs: 1, sn: 0, v: 0, vx: 0, vz: 0, vn: 0, spray: 0, turn: 0 }));
  function place(sh) {
    const [x, z] = pos(sh.d), [x2, z2] = pos(sh.d + sh.dir * 6);
    const hx = x2 - x, hz = z2 - z, L = Math.hypot(hx, hz) || 1;
    sh.x = x; sh.z = z; sh.cs = hx / L; sh.sn = hz / L; sh.yaw = Math.atan2(-hz, hx);
    sh.m.position.set(x, .2 + Math.sin(performance.now() / 1250 + sh.d * .01) * .08, z); sh.m.rotation.y = sh.yaw;
  }
  function tick(dt) {
    for (const sh of list) {
      let v = KINDS[sh.kind].v;
      if (RAILB) {                                     // у ж/д моста ждём, пока пролёт поднимется
        const C = RAILB.C, n = RAILB.nrm, dn = (sh.x - C.x) * n.x + (sh.z - C.z) * n.z, vdir = sh.cs * n.x + sh.sn * n.z;
        sh.vn = vdir * v; if (dn * vdir < 0 && Math.abs(dn) < 130 && Math.abs(dn) > 45 && RAILB.st.y < RAILB.LIFT - 2) v = 0;
        if (Math.abs(dn) < 32) v = 2;                                  // под пролётом — малым ходом: можно успеть спрыгнуть с моста на палубу
        sh.under = Math.abs(dn) < 32;
        // у моста: гудок на подходе (и короткий, если ждёт пролёт), под пролётом — подруливает, пена и волна сильнее
        const k = Math.max(0, 1 - Math.hypot(sh.x - camera.position.x, sh.z - camera.position.z) / 650);
        if (dn * vdir < 0 && Math.abs(dn) < 170 && !sh.horn) { sh.horn = true; if (k > 0) sfx.shipHorn(k); }
        if (v === 0 && !sh.horn2) { sh.horn2 = true; if (k > 0) sfx.shipHorn(k * .8, 1); }
        if (Math.abs(dn) > 260) sh.horn = sh.horn2 = false;
        sh.steer = Math.abs(dn) < 200 ? Math.sin(performance.now() / 2600 + sh.d * .01) * .03 * Math.min(1, sh.v / 2) : 0;
      }
      sh.v += (v - sh.v) * Math.min(1, dt * .5);
      sh.d += sh.dir * sh.v * dt;
      if (sh.d > LEN - 1 || sh.d < 1) { sh.dir = -sh.dir; sh.d = Math.max(1, Math.min(LEN - 1, sh.d)); }
      const px = sh.x, pz = sh.z; place(sh); sh.vx = (sh.x - px) / dt; sh.vz = (sh.z - pz) / dt; sh.m.rotation.y += sh.steer || 0;
      if (Math.hypot(sh.x - camera.position.x, sh.z - camera.position.z) < 450 && sh.v > 1) {   // пена у носа и за кормой
        sh.wake = (sh.wake || 0) - dt; if (sh.wake <= 0) { sh.wake = sh.under ? .5 : 1.1; const bx = KINDS[sh.kind].boxes[0][1] + 5, sx = KINDS[sh.kind].boxes[0][0] - 3;
          WAKE.add(sh.x + sh.cs * bx, sh.z + sh.sn * bx, sh.under ? .2 : .12); if (sh.under) WAKE.add(sh.x + sh.cs * sx, sh.z + sh.sn * sx, .16); }   // под пролётом — и бурун за кормой   // волна от носа
        sh.spray -= dt; if (sh.spray <= 0) { sh.spray = sh.under ? .05 : .12; const bx = KINDS[sh.kind].boxes[0][1] + 4; [-1, 1].forEach(k => puff(new T.Vector3(sh.x + sh.cs * bx - sh.sn * k * 4, .4, sh.z + sh.sn * bx + sh.cs * k * 4), new T.Vector3(-sh.sn * k * 3 + sh.vx * .5, 1.2, sh.cs * k * 3 + sh.vz * .5), 1.2, .45, 4)); }
      }
    }
  }
  const toLocal = (sh, x, z) => { const ox = x - sh.x, oz = z - sh.z; return [ox * sh.cs + oz * sh.sn, -ox * sh.sn + oz * sh.cs]; };   // ось корабля: вперёд и вбок
  function ground(x, z, y) {
    let best = null;
    for (const sh of list) {
      if (Math.abs(x - sh.x) > 60 || Math.abs(z - sh.z) > 60) continue;
      const [u, w] = toLocal(sh, x, z);
      for (const b of KINDS[sh.kind].boxes) {
        if (!b[7] || u < b[0] || u > b[1] || w < b[2] || w > b[3]) continue;
        const h = b[5] + .2; if (y < h - 1.2 || (best && h <= best.h)) continue;
        best = { h, slope: 0, deck: true, rx: sh.cs, rz: -sh.sn, vx: sh.vx, vz: sh.vz, ship: sh };
      }
    }
    return best;
  }
  function hit(x, z, y) {
    for (const sh of list) {
      if (Math.abs(x - sh.x) > 60 || Math.abs(z - sh.z) > 60) continue;
      const [u, w] = toLocal(sh, x, z);
      for (const b of KINDS[sh.kind].boxes) if (b[7] && b[4] > 0 && u > b[0] - .8 && u < b[1] + .8 && w > b[2] - .8 && w < b[3] + .8 && y > b[4] - .3 && y < b[5] + .2 - .4) return { name: KINDS[sh.kind].name, h: b[5] + .2 };
    }
    return null;
  }
  list.forEach(place);
  return { list, tick, ground, hit, LEN, pts, name: sh => KINDS[sh.kind].name };
})();
