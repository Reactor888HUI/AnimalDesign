// «Восьмёрка Баклажан» — Ростов Арена снаружи и внутри.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- Ростов Арена: белая чаша с треугольным узором, козырёк, мачты; трасса вокруг ---------- */
// Контур — из OpenStreetMap; высота и облик — по фотографиям: стеклянный цоколь ~7 м, белый фасад до ~29 м,
// белая мембрана крыши с мачтами по краю, синие трибуны и зелёное поле видны в проёме.
const ARENA = (() => {
  const src = solids.find(b => b.arena); if (!src) return null;
  const P = src.rings[0].filter((p, i, a) => Math.hypot(p[0] - a[(i + 1) % a.length][0], p[1] - a[(i + 1) % a.length][1]) > .05);
  const C = P.reduce((a, [x, z]) => [a[0] + x / P.length, a[1] + z / P.length], [0, 0]);
  const seg = [], cum = [0];
  P.forEach(([ax, az], i) => {
    const [bx, bz] = P[(i + 1) % P.length], L = Math.hypot(bx - ax, bz - az);
    let nx = (bz - az) / L, nz = -(bx - ax) / L;
    if (nx * ((ax + bx) / 2 - C[0]) + nz * ((az + bz) / 2 - C[1]) < 0) { nx = -nx; nz = -nz; }   // нормаль наружу
    seg.push({ ax, az, tx: (bx - ax) / L, tz: (bz - az) / L, nx, nz, L }); cum.push(cum[i] + L);
  });
  const len = cum[P.length];
  const at = s => { s = ((s % len) + len) % len; let i = 0; while (cum[i + 1] < s) i++; const g = seg[i], t = s - cum[i]; return { x: g.ax + g.tx * t, z: g.az + g.tz * t, tx: g.tx, tz: g.tz, nx: g.nx, nz: g.nz }; };
  const nearest = (x, z) => { let best = 0, bd = Infinity; seg.forEach((g, i) => { const t = Math.max(0, Math.min(g.L, (x - g.ax) * g.tx + (z - g.az) * g.tz)), d = Math.hypot(x - g.ax - g.tx * t, z - g.az - g.tz * t); if (d < bd) { bd = d; best = cum[i] + t; } }); return { s: best, d: bd }; };
  // вершинные нормали для колец со смещением (трасса, мачты)
  const vn = P.map((_, i) => { const a = seg[(i - 1 + P.length) % P.length], b = seg[i], x = a.nx + b.nx, z = a.nz + b.nz, L = Math.hypot(x, z) || 1; return [x / L, z / L]; });
  // крыша — плоское кольцо на 29 м от стены до проёма (KR от центра), в проёме чаша: трибуны-рампа от поля (K0) до края крыши
  const H = 29, KR = .64, K0 = .34;
  const ray = (x, z) => {            // расстояние от центра до стены по лучу через точку
    const dx = x - C[0], dz = z - C[1], L = Math.hypot(dx, dz) || 1e-6, ux = dx / L, uz = dz / L; let D = Infinity;
    for (const g of seg) {
      const ex = g.tx * g.L, ez = g.tz * g.L, den = ux * ez - uz * ex; if (Math.abs(den) < 1e-9) continue;
      const ax = g.ax - C[0], az = g.az - C[1], t = (ax * ez - az * ex) / den, u = (ax * uz - az * ux) / den;
      if (t > 0 && u >= 0 && u <= 1 && t < D) D = t;
    }
    return { L, D, ux, uz };
  };
  const bowl = (x, z) => {
    if (x < src.x0 || x > src.x1 || z < src.z0 || z > src.z1) return null;
    const r = ray(x, z), k = r.L / r.D; if (k >= KR) return null;
    const u = Math.max(0, (k - K0) / (KR - K0));
    return { h: H * u * u, slope: Math.atan(2 * H * u / ((KR - K0) * r.D)), rx: r.ux, rz: r.uz };
  };
  return { src, P, C, len, at, nearest, vn, H, KR, K0, ray, bowl, gates: [], megas: [] };
})();
if (ARENA) (() => {
  const { P, C, vn } = ARENA, DS = T.DoubleSide;
  const scaled = k => P.map(([x, z]) => [C[0] + (x - C[0]) * k, C[1] + (z - C[1]) * k]);
  const offset = d => P.map(([x, z], i) => [x + vn[i][0] * d, z + vn[i][1] * d]);
  function band(A, ya, B, yb, m, period = 0) {     // лента между двумя кольцами (одинаковое число точек)
    const pos = [], uv = []; let u = 0;
    for (let i = 0; i < A.length; i++) {
      const j = (i + 1) % A.length, du = Math.hypot(A[j][0] - A[i][0], A[j][1] - A[i][1]) / (period || 1);
      const a0 = [A[i][0], ya, A[i][1]], a1 = [A[j][0], ya, A[j][1]], b0 = [B[i][0], yb, B[i][1]], b1 = [B[j][0], yb, B[j][1]];
      pos.push(...a0, ...a1, ...b1, ...a0, ...b1, ...b0); uv.push(u, 0, u + du, 0, u + du, 1, u, 0, u + du, 1, u, 1); u += du;
    }
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    scene.add(new T.Mesh(g, m));
  }
  const canvasTex = (w, h, draw, rep = true) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; if (rep) t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; return t; };
  const { H, KR, K0 } = ARENA;
  ARENA.src.rings = [P, scaled(KR)]; ARENA.src.outer = [P];   // по крыше можно ехать, в проёме — чаша
  // цоколь: тёмное стекло с белыми колоннами
  const glass = canvasTex(64, 64, (g, w, h) => { g.fillStyle = "#3d4a56"; g.fillRect(0, 0, w, h); g.fillStyle = "#e9ecee"; g.fillRect(0, 0, 8, h); g.fillRect(0, 0, w, 6); });
  band(scaled(.985), 0, scaled(.985), 7, new T.MeshStandardMaterial({ map: glass, roughness: .25, metalness: .3 }), 9);
  // фасад как у макета: белые перфорированные панели, рама из наклонных стоек — ромбы и «V», перфорация гуще к низу ромба
  const facade = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#f0f1f1"; g.fillRect(0, 0, w, h);
    const inDia = (x, y) => { const a = Math.abs((x % 128) - 64) / 64, b = Math.abs(y - h / 2) / (h / 2); return a + b; };   // 0 — центр ромба
    for (let y = 3; y < h; y += 6) for (let x = (y / 6 % 2) * 3 + 2; x < w; x += 6) {
      const d = inDia(x, y); if (d > 1) continue;
      g.fillStyle = `rgba(120,132,142,${(.22 + .5 * (1 - d) * (y / h)).toFixed(2)})`; g.beginPath(); g.arc(x, y, 1.6, 0, 6.3); g.fill();
    }
    g.strokeStyle = "#a9b1b8"; g.lineWidth = 5; g.lineCap = "round";
    for (let x0 = -128; x0 <= w; x0 += 128) { g.beginPath(); g.moveTo(x0, h); g.lineTo(x0 + 64, h / 2); g.lineTo(x0 + 128, h); g.moveTo(x0, 0); g.lineTo(x0 + 64, h / 2); g.lineTo(x0 + 128, 0); g.stroke(); }
    g.strokeStyle = "#c3c9ce"; g.lineWidth = 2; for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.fillStyle = "#d9dde0"; g.fillRect(0, 0, w, 7); g.fillRect(0, h - 5, w, 5);
  });
  band(scaled(.985), 7, P, 7.4, new T.MeshStandardMaterial({ color: 0xe9ecee, roughness: .5, side: DS }));
  // ночью фасад светится, как на фото макета: ромбы и «V» тёплым, фиолетовым и голубым
  const facadeGlow = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
    ["#7b3cff", "#ff4fb8", "#3cb8ff"].forEach((c, i) => { g.strokeStyle = c; g.lineWidth = 9; g.shadowColor = c; g.shadowBlur = 18;
      const x0 = -128 + i * 43; g.beginPath(); g.moveTo(x0, h); g.lineTo(x0 + 64, h / 2); g.lineTo(x0 + 128, h); g.moveTo(x0 + 128, 0); g.lineTo(x0 + 192, h / 2); g.lineTo(x0 + 256, 0); g.stroke(); });
    g.shadowBlur = 0; g.fillStyle = "rgba(255,226,170,.55)"; g.fillRect(0, h - 10, w, 10);
  });
  band(P, 7.4, P, H, nightReg(new T.MeshStandardMaterial({ map: facade, roughness: .45, side: DS, emissive: 0xffffff, emissiveMap: facadeGlow, emissiveIntensity: 0 }), "emissiveIntensity", { sunset: 0, day: 0, night: 1.2 }), 24);
  // крыша: белая мембрана с ромбической сеткой тросов; плоская на 29 м — по ней ездят
  const membrane = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#f4f5f6"; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(175,185,195,.25)"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#b9c1c8"; g.lineWidth = 3;
    for (let x0 = -w; x0 <= w; x0 += 64) { g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + w, h); g.moveTo(x0 + w, 0); g.lineTo(x0, h); g.stroke(); }
  });
  membrane.repeat.set(1, 3);
  band(P, H, P, H + .6, new T.MeshStandardMaterial({ color: 0xe4e7ea, roughness: .5, side: DS }));            // бортик
  band(P, H, scaled(KR), H, new T.MeshStandardMaterial({ map: membrane, roughness: .6, side: DS }), 26);
  band(scaled(KR), H, scaled(KR), H - .8, new T.MeshStandardMaterial({ color: 0x9aa3ab, roughness: .6, side: DS }));
  // трибуны — синие ряды кресел; профиль четверть-трубы H·u², как в физике чаши
  // ряды — полосы двух оттенков синего без мелкой текстуры: на телефонах мелкие линии рябили; посередине — белый проход-кольцо
  const seatM = [0x0b2874, 0x071c58].map(c => new T.MeshStandardMaterial({ color: c, roughness: .85, side: DS })), aisleM = new T.MeshStandardMaterial({ color: 0xdfe3e6, roughness: .7, side: DS }), NB = 16;
  for (let i = 0; i < NB; i++) { const u0 = 1 - i / NB, u1 = 1 - (i + 1) / NB; band(scaled(K0 + (KR - K0) * u0), H * u0 * u0, scaled(K0 + (KR - K0) * u1), H * u1 * u1, i === 8 ? aisleM : seatM[i % 2]); }
  const fieldTex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = "#4c9a3a"; g.fillRect(0, 0, w, h); g.fillStyle = "#57a842"; g.fillRect(0, 0, w / 2, h); });
  fieldTex.repeat.set(1 / 12, 1 / 12);
  const fieldPts = scaled(K0 + .005).map(([x, z]) => new T.Vector2(x, z)), fp = [], fu = [];
  T.ShapeUtils.triangulateShape(fieldPts, []).forEach(t => t.forEach(i => { fp.push(fieldPts[i].x, .05, fieldPts[i].y); fu.push(fieldPts[i].x, fieldPts[i].y); }));
  const fg = new T.BufferGeometry(); fg.setAttribute("position", new T.Float32BufferAttribute(fp, 3)); fg.setAttribute("uv", new T.Float32BufferAttribute(fu, 2));
  fg.setAttribute("normal", new T.Float32BufferAttribute(fp.map((_, i) => i % 3 === 1 ? 1 : 0), 3));
  scene.add(new T.Mesh(fg, new T.MeshLambertMaterial({ map: fieldTex, side: DS })));
  // главный вход — сторона, обращённая к площади (самая западная, +x): на крыше трамплин наружу, с него — прыжок с трюком
  let sMain = 0; for (let s = 0, bx = -Infinity; s < ARENA.len; s += 2) { const q = ARENA.at(s); if (q.x > bx) { bx = q.x; sMain = s; } }
  const pm = ARENA.at(sMain);
  const rk = kicker(pm.x - pm.nx * 15, pm.z - pm.nz * 15, Math.atan2(-pm.nz, pm.nx), 13, 7, 4, 0xd8322c, false, H);
  rk.id = "arenaRoof"; ARENA.roofKick = rk;
  // баннер «Миша, с днём рождения!» — снаружи над главным входом и внутри чаши под кромкой крыши напротив; ночью светится
  {
    const c = document.createElement("canvas"); c.width = 1536; c.height = 260; const g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 1536, 0); gr.addColorStop(0, "#5a1b8c"); gr.addColorStop(.5, "#c42a8a"); gr.addColorStop(1, "#5a1b8c");
    g.fillStyle = gr; g.fillRect(0, 0, 1536, 260);
    let hs = 5; const hr = () => (hs = (hs * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 140; i++) { g.fillStyle = ["#ffc93c", "#3ddc84", "#39b6ff", "#ffffff", "#ff7a2f"][i % 5]; g.save(); g.translate(hr() * 1536, hr() * 260); g.rotate(hr() * 3); g.fillRect(-5, -2.5, 10, 5); g.restore(); }   // конфетти
    g.lineWidth = 12; g.strokeStyle = "#ffc93c"; g.strokeRect(8, 8, 1520, 244);
    g.textAlign = "center"; g.textBaseline = "middle"; g.font = "900 118px Golos Text, Arial, sans-serif";
    g.lineWidth = 14; g.strokeStyle = "#2c0a44"; g.strokeText("МИША, С ДНЁМ РОЖДЕНИЯ!", 768, 136, 1300); g.fillStyle = "#fff6d8"; g.fillText("МИША, С ДНЁМ РОЖДЕНИЯ!", 768, 136, 1300);   // ужать под ширину между шариками
    [[80, 70], [1456, 70]].forEach(([x, y], i) => { g.fillStyle = i ? "#3ddc84" : "#ffc93c"; g.beginPath(); g.ellipse(x, y, 26, 32, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y + 32); g.quadraticCurveTo(x + 10, y + 70, x - 4, y + 110); g.stroke(); });   // шарики
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4;
    const bm = new T.MeshBasicMaterial({ map: t, toneMapped: false });
    const hang = (x, y, z, nx, nz, w) => { const m = new T.Mesh(new T.PlaneGeometry(w, w * 260 / 1536), bm); m.position.set(x, y, z); m.rotation.y = Math.atan2(nx, nz); scene.add(m); };
    hang(pm.x + pm.nx * .8, 16.5, pm.z + pm.nz * .8, pm.nx, pm.nz, 44);                                   // снаружи, над главным входом
    const q = ARENA.at((sMain + ARENA.len / 2) % ARENA.len), k = .6;                                       // внутри: напротив, под кромкой крыши, лицом к полю
    hang(ARENA.C[0] + (q.x - ARENA.C[0]) * k, H - 4.5, ARENA.C[1] + (q.z - ARENA.C[1]) * k, ARENA.C[0] - q.x, ARENA.C[1] - q.z, 36);
  }
  const chevM = new T.MeshBasicMaterial({ color: 0xffb347, side: DS, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const chev = new T.Shape(); chev.moveTo(0, -3); chev.lineTo(2.2, 0); chev.lineTo(0, 3); chev.lineTo(-1.2, 3); chev.lineTo(1, 0); chev.lineTo(-1.2, -3); chev.closePath();
  for (let i = 1; i <= 4; i++) {
    const m = new T.Mesh(new T.ShapeGeometry(chev).rotateX(Math.PI / 2), chevM);
    m.position.set(pm.x - pm.nx * (15 + i * 6), H + .03, pm.z - pm.nz * (15 + i * 6)); m.rotation.y = Math.atan2(-pm.nz, pm.nx); scene.add(m);
  }
  const rs = new T.Mesh(new T.PlaneGeometry(12, 2.4), new T.MeshBasicMaterial({ map: textTex(["ПРЫЖОК С КРЫШИ"], 512, 96, "#d8322c", "#ffffff"), side: DS }));
  rs.position.set(pm.x - pm.nx * 8 + pm.tx * 9, H + 2.6, pm.z - pm.nz * 8 + pm.tz * 9); rs.rotation.y = Math.atan2(-pm.nx, -pm.nz); scene.add(rs);
  // мачты: вертикальные белые по краю крыши, от вершины ванты к крыше — как на макете; у трамплина мачт нет
  const mastM = new T.MeshStandardMaterial({ color: 0xf6f7f8, roughness: .4 }), mastG = new T.CylinderGeometry(.25, .42, 22, 6), cab = [];
  for (let i = 0; i < 34; i++) {
    const sm = sMain + (i + .5) / 34 * ARENA.len, p = ARENA.at(sm), x = p.x - p.nx * 2, z = p.z - p.nz * 2;
    const m = new T.Mesh(mastG, mastM); m.position.set(x, H + 11, z); scene.add(m);
    [-6, 6].forEach(o => cab.push(x, H + 22, z, x - p.nx * 18 + p.tx * o, H + .1, z - p.nz * 18 + p.tz * o));
    cab.push(x, H + 22, z, x + p.nx * 1.5, H + .4, z + p.nz * 1.5);
  }
  const cg = new T.BufferGeometry(); cg.setAttribute("position", new T.Float32BufferAttribute(cab, 3));
  const cables = new T.LineSegments(cg, new T.LineBasicMaterial({ color: 0x8a939b })); cables.userData.dyn = true; scene.add(cables);
  // трасса вокруг: асфальтовое кольцо 13 м в 28 м от стены, по краям красно-белые поребрики
  const O = offset(28), Oi = offset(21.5), Oo = offset(34.5);
  const tp = [];
  for (let i = 0; i < O.length; i++) { const j = (i + 1) % O.length; tp.push(Oi[i][0], .085, Oi[i][1], Oi[j][0], .085, Oi[j][1], Oo[j][0], .085, Oo[j][1], Oi[i][0], .085, Oi[i][1], Oo[j][0], .085, Oo[j][1], Oo[i][0], .085, Oo[i][1]); }
  const tg = new T.BufferGeometry(); tg.setAttribute("position", new T.Float32BufferAttribute(tp, 3)); tg.setAttribute("normal", new T.Float32BufferAttribute(tp.map((_, i) => i % 3 === 1 ? 1 : 0), 3));
  scene.add(new T.Mesh(tg, new T.MeshLambertMaterial({ color: 0x3a3c40, side: DS })));
  const curbR = [], curbW = [];
  [Oi, Oo].forEach(E => { let acc = 0, k = 0; for (let i = 0; i < E.length; i++) { const j = (i + 1) % E.length, L = Math.hypot(E[j][0] - E[i][0], E[j][1] - E[i][1]), yaw = Math.atan2(-(E[j][1] - E[i][1]), E[j][0] - E[i][0]); for (; acc < L; acc += 3, k++) (k % 2 ? curbW : curbR).push(M4(E[i][0] + (E[j][0] - E[i][0]) * acc / L, .095, E[i][1] + (E[j][1] - E[i][1]) * acc / L, yaw)); acc -= L; } });
  const curbG = new T.PlaneGeometry(3, .8).rotateX(-Math.PI / 2);
  chunked(curbG, new T.MeshBasicMaterial({ color: 0xd8322c }), curbR, .7); chunked(curbG, new T.MeshBasicMaterial({ color: 0xf2f2ee }), curbW, .7);
  // ворота: 10 штук по кругу, первые — «Старт / финиш»
  const len = O.reduce((a, p, i) => a + Math.hypot(O[(i + 1) % O.length][0] - p[0], O[(i + 1) % O.length][1] - p[1]), 0);
  const along = s => { for (let i = 0; i < O.length; i++) { const j = (i + 1) % O.length, L = Math.hypot(O[j][0] - O[i][0], O[j][1] - O[i][1]); if (s <= L) return [O[i][0] + (O[j][0] - O[i][0]) * s / L, O[i][1] + (O[j][1] - O[i][1]) * s / L, (O[j][0] - O[i][0]) / L, (O[j][1] - O[i][1]) / L]; s -= L; } return [O[0][0], O[0][1], 1, 0]; };
  const postM = mat(0xd8322c), bannerTex = n => textTex([n === 0 ? "СТАРТ · ФИНИШ" : `ВОРОТА ${n}`], 512, 96, n === 0 ? "#111111" : "#d8322c", "#ffffff");
  for (let n = 0; n < 10; n++) {
    const [x, z, tx, tz] = along(n / 10 * len), g = new T.Group(), nx = -tz, nz = tx;
    [-7.5, 7.5].forEach(o => { const p = new T.Mesh(new T.BoxGeometry(.5, 6, .5), postM); p.position.set(nx * o, 3, nz * o); g.add(p); });
    const bn = new T.Mesh(new T.PlaneGeometry(15.5, 1.6), new T.MeshBasicMaterial({ map: bannerTex(n), side: DS })); bn.position.y = 5.8; bn.rotation.y = Math.atan2(-tz, tx) + Math.PI / 2; g.add(bn);
    g.position.set(x, 0, z); scene.add(g);
    ARENA.gates.push({ x, z, tx, tz });
  }
  ARENA.trackLen = len; ARENA.along = along;
  {   // шахматная линия старта поперёк трассы
    const ck = canvasTex(128, 16, (g, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? "#111" : "#f4f4f0"; g.fillRect(i * 8, j * 8, 8, 8); } }, false);
    const [x, z, tx, tz] = along(0), m = new T.Mesh(new T.PlaneGeometry(13, 1.6).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: ck, side: DS }));
    m.position.set(x, .1, z); m.rotation.y = Math.atan2(-tz, tx) + Math.PI / 2; scene.add(m);
  }
  // трамплины на трассе — пролететь мимо стадиона; кольца у стены — для прыжков и езды на присосках
  [.3, .72].forEach(f => { const [x, z, tx, tz] = along(f * len); kicker(x, z, Math.atan2(-tz, tx), 12, 7, 3.6, 0xd8322c); });
  for (let i = 0; i < 8; i++) { const p = ARENA.at((i + .5) / 8 * ARENA.len); ring(p.x + p.nx * 3.5, 9 + (i % 3) * 5, p.z + p.nz * 3.5, Math.atan2(-p.tz, p.tx)); }
  {   // круг по крыше: 10 неоновых арок-колец (одна сетка), каждое — +300, как обычные кольца
    const g = [], torus = new T.TorusGeometry(3.4, .3, 8, 28).toNonIndexed(), C = ARENA.C, k = ARENA.roofK = .85;
    for (let i = 0; i < 10; i++) {
      const p = ARENA.at(sMain + (i + .5) / 10 * ARENA.len), x = C[0] + (p.x - C[0]) * k, z = C[1] + (p.z - C[1]) * k, y = H + 2.6, yaw = Math.atan2(-p.tz, p.tx);
      g.push(torus.clone().applyMatrix4(M4(x, y, z, Math.PI / 2 + yaw)));
      rings.push({ m: { material: { color: new T.Color() } }, x, y, z, got: false, roof: true });
    }
    const m = new T.Mesh(mergeGeos(g), new T.MeshBasicMaterial({ color: 0x39e6ff, toneMapped: false })); m.userData.dyn = true; scene.add(m);
  }
  // мега-трамплины «НА КРЫШУ»: четверть-трубы 14 м за трассой, смотрят на стадион. Ставим там, где для разгона
  // свободно дольше всего (без домов и воды), и не у главного входа — туда прилетают с крыши
  const pdist = (a, b) => { const d = Math.abs(a - b) % ARENA.len; return Math.min(d, ARENA.len - d); };
  const clearRun = s => { const q = ARENA.at(s); let d = 60; for (; d < 170; d += 5) { const x = q.x + q.nx * d, z = q.z + q.nz * d; if (x < WORLD.x0 + 5 || x > WORLD.x1 - 5 || z < WORLD.z0 + 5 || waterAt(x, z) || solids.some(b => !b.arena && b.h > .5 && x > b.x0 - 3 && x < b.x1 + 3 && z > b.z0 - 3 && z < b.z1 + 3)) break; } return d - 60; };
  const cand = []; for (let i = 0; i < 36; i++) { const s = i / 36 * ARENA.len; if (pdist(s, sMain) > 140) cand.push({ s, run: clearRun(s) }); }
  cand.sort((a, b) => b.run - a.run);
  const megaSign = textTex(["НА КРЫШУ", "АРЕНЫ"], 512, 160, "#4a2f6a", "#ffe2a6");
  for (const c of cand) {
    if (ARENA.megas.length >= 3 || c.run < 60) break;
    if (ARENA.megas.some(m => pdist(m.s, c.s) < ARENA.len / 5)) continue;
    const q = ARENA.at(c.s), k = kicker(q.x + q.nx * 60, q.z + q.nz * 60, Math.atan2(q.nz, -q.nx), 22, 9, 14, 0x4a2f6a, true);
    k.id = "mega"; ARENA.megas.push({ s: c.s, run: c.run, k, x: q.x + q.nx * 60, z: q.z + q.nz * 60, yaw: Math.atan2(q.nz, -q.nx) });
    const sg = new T.Mesh(new T.PlaneGeometry(9, 2.8), new T.MeshBasicMaterial({ map: megaSign, side: DS }));
    sg.position.set(q.x + q.nx * 85 + q.tx * 8, 4.5, q.z + q.nz * 85 + q.tz * 8); sg.rotation.y = Math.atan2(q.nx, q.nz); scene.add(sg);
    const sp = new T.Mesh(new T.BoxGeometry(.3, 3.2, .3), mat(0x6b6f7c)); sp.position.set(q.x + q.nx * 85.2 + q.tx * 8, 1.6, q.z + q.nz * 85.2 + q.tz * 8); scene.add(sp);
  }
})();

/* ---------- внутри Арены: синий трек, аэротруба «888», горка-труба, «Баклажановый поток» ---------- */
// На знаке «888» в центре поля машину подхватывают магниты и воздух: безопасный 3D-полёт, газ не кончается.
// Горка-труба — с крыши по спирали к полю, как в аквапарке. «Баклажановый поток» — бесконечное кольцо-труба
// с турбо-потоком и баклажановыми подушками с неоновой подсветкой; въезд — знак с баклажаном на поле.
function tubePath(pts, closed, R) {
  const curve = new T.CatmullRomCurve3(pts, closed, "centripetal"), len = curve.getLength(), n = Math.ceil(len / 1.5), ds = len / n;
  const P = curve.getSpacedPoints(n), TT = [], U = [], S = [], up = new T.Vector3(0, 1, 0);
  for (let i = 0; i <= n; i++) {
    const t = curve.getTangentAt(Math.min(1, i / n)).normalize(), u = up.clone().addScaledVector(t, -t.y).normalize();
    TT.push(t); U.push(u); S.push(new T.Vector3().crossVectors(t, u));
  }
  const idx = s => { const i = Math.max(0, Math.min(n - 1, Math.floor(s / ds))); return [i, Math.max(0, Math.min(1, s / ds - i))]; };
  return {
    curve, len, R, closed, n, P,
    at(s) { const [i, f] = idx(s); return { p: P[i].clone().lerp(P[i + 1], f), T: TT[i], U: U[i], S: S[i] }; },
    curv(s) { const [i] = idx(s), a = TT[Math.max(0, i - 2)], b = TT[Math.min(n, i + 2)], d = (Math.min(n, i + 2) - Math.max(0, i - 2)) * ds; return b.clone().sub(a).multiplyScalar(1 / d); },
    nearest(x, y, z) { let best = 0, bd = Infinity; P.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = i; } }); return best * ds; },
    frame: i => ({ p: P[i], T: TT[i], U: U[i], S: S[i] }),
  };
}
const INNER = ARENA && (() => {
  const DS = T.DoubleSide, C = ARENA.C, H = ARENA.H, R = 3.2, n0 = scene.children.length;
  const rimAt = a => ARENA.ray(C[0] + Math.cos(a) * 10, C[1] + Math.sin(a) * 10).D;     // от центра до стены по направлению a
  const ptK = (a, k, y) => { const d = rimAt(a) * k; return new T.Vector3(C[0] + Math.cos(a) * d, y, C[1] + Math.sin(a) * d); };
  const ctex = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t; };
  const neon = c => new T.MeshBasicMaterial({ color: c, toneMapped: false, fog: false });
  // синий внутренний трек по краю поля с белыми линиями
  const ringK = (k0, k1, y, m) => {
    const A = ARENA.P.map(([x, z]) => [C[0] + (x - C[0]) * k0, C[1] + (z - C[1]) * k0]), B = ARENA.P.map(([x, z]) => [C[0] + (x - C[0]) * k1, C[1] + (z - C[1]) * k1]), p = [];
    for (let i = 0; i < A.length; i++) { const j = (i + 1) % A.length; p.push(A[i][0], y, A[i][1], B[j][0], y, B[j][1], A[j][0], y, A[j][1], A[i][0], y, A[i][1], B[i][0], y, B[i][1], B[j][0], y, B[j][1]); }
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(p, 3)); g.setAttribute("normal", new T.Float32BufferAttribute(p.map((_, i) => i % 3 === 1 ? 1 : 0), 3));
    scene.add(new T.Mesh(g, m));
  };
  // знак «888» в центре поля и аэротруба над ним
  const pad = { x: C[0], z: C[1], r: 5 };
  const sign = (draw, bg) => ctex(256, 256, (g, w, h) => { g.fillStyle = bg; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill(); draw(g); });
  const t888 = sign(g => {
    g.strokeStyle = "#39e6ff"; g.lineWidth = 10; g.shadowColor = "#39e6ff"; g.shadowBlur = 24; g.beginPath(); g.arc(128, 128, 110, 0, 7); g.stroke();
    g.fillStyle = "#bff6ff"; g.font = "bold 92px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("888", 128, 134);
  }, "#0f1c3a");
  const p8 = new T.Mesh(new T.CircleGeometry(6, 40).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: t888, side: DS })); p8.position.set(pad.x, .08, pad.z); p8.rotation.y = Math.PI / 2; scene.add(p8);
  const flowTex = (w, h, draw, rx, ry) => { const t = ctex(w, h, draw); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry); return t; };
  const airT = flowTex(32, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "rgba(140,235,255,0)"); gr.addColorStop(.5, "rgba(170,240,255,.9)"); gr.addColorStop(1, "rgba(140,235,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, 10, 4);
  const air = new T.Mesh(new T.CylinderGeometry(7, 7, 50, 28, 1, true), new T.MeshBasicMaterial({ map: airT, transparent: true, opacity: .15, blending: T.AdditiveBlending, depthWrite: false, side: DS, toneMapped: false }));
  air.position.set(pad.x, 25, pad.z); air.userData.dyn = true; scene.add(air);
  [.25, 50].forEach((y, i) => { const m = new T.Mesh(new T.TorusGeometry(7.1, i ? .14 : .3, 6, 48), neon(i % 2 ? 0xff4fd8 : 0x39e6ff)); m.rotation.x = Math.PI / 2; m.position.set(pad.x, y, pad.z); m.userData.dyn = true; scene.add(m); });
  // горка-труба: вход на крыше напротив главного входа, нырок в проём и полторы спирали к полю
  const a0 = Math.PI, yc = H + R - .4, sp = [ptK(a0, .78, yc), ptK(a0, .68, yc - .2), ptK(a0, .54, yc - 1), ptK(a0, .42, yc - 2), ptK(a0, .31, yc - 3.4)];
  const NS = 16;
  for (let j = 1; j <= NS + 2; j++) { const e = Math.min(1, j / NS); sp.push(ptK(a0 + j * Math.PI / 6, .21, R + (yc - 6 - R) * (1 - smooth(e)))); }
  const slide = tubePath(sp, false, R);
  // «Баклажановый поток»: кольцо-волна над нижними рядами трибун — внизу у поля, наверху над рядами
  const fp = []; for (let j = 0; j < 30; j++) { const a = j / 30 * Math.PI * 2, s3 = Math.sin(3 * a); fp.push(ptK(a, .37 + .07 * s3, 14 + 8 * s3)); }   // низ волны — 6 м: под ней проходит гоночная трасса
  const flow = tubePath(fp, true, R); flow.flow = true;
  // трубы: прозрачное стекло, неоновые кольца; в потоке — бегущие фиолетовые полосы и подушки
  const glass = c => new T.MeshStandardMaterial({ color: c, transparent: true, opacity: .2, roughness: .08, metalness: .2, side: DS, depthWrite: false });
  [[slide, 0x9fe6ff], [flow, 0xb98ce8]].forEach(([P, c]) => { const m = new T.Mesh(new T.TubeGeometry(P.curve, Math.ceil(P.n / 2), R, 9, P.closed), glass(c)); m.userData.dyn = true; scene.add(m); });
  const stripes = flowTex(64, 8, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "rgba(255,80,220,0)"); gr.addColorStop(.7, "rgba(190,90,255,.95)"); gr.addColorStop(1, "rgba(255,80,220,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, Math.round(flow.len / 9), 3);
  const stream = new T.Mesh(new T.TubeGeometry(flow.curve, Math.ceil(flow.n / 2), R * .97, 8, true), new T.MeshBasicMaterial({ map: stripes, transparent: true, opacity: .55, blending: T.AdditiveBlending, depthWrite: false, side: T.BackSide, toneMapped: false }));
  stream.userData.dyn = true; scene.add(stream);
  const torus = new T.TorusGeometry(R + .12, .1, 3, 12), q = new T.Quaternion(), zA = new T.Vector3(0, 0, 1), one = new T.Vector3(1, 1, 1);
  const ringsAlong = (P, step, cols) => cols.forEach((c, ci) => { const ms = []; for (let i = ci * step; i < P.n; i += step * cols.length) { const f = P.frame(i); ms.push(new T.Matrix4().compose(f.p, q.clone().setFromUnitVectors(zA, f.T), one)); } chunked(torus, neon(c), ms, .6); });
  ringsAlong(slide, 10, [0x39e6ff]); ringsAlong(flow, 14, [0xff4fd8]);   // по одному цвету на трубу — не рябит
  // подушки баклажанового цвета под трубой потока и неоновые нити по бокам
  const pil = [], pilG = new T.SphereGeometry(1, 8, 5), bs = new T.Matrix4(), rr = new T.Vector3(), up = new T.Vector3();
  for (let i = 0; i < flow.n; i += 5) {
    const f = flow.frame(i);
    [-.75, .75].forEach(th => {
      rr.copy(f.U).multiplyScalar(-Math.cos(th)).addScaledVector(f.S, Math.sin(th)); up.copy(rr).negate();
      bs.makeBasis(f.T, up, new T.Vector3().crossVectors(f.T, up)); const qq = new T.Quaternion().setFromRotationMatrix(bs);
      pil.push(new T.Matrix4().compose(f.p.clone().addScaledVector(rr, R + .7), qq, new T.Vector3(2.6, .75, 1.7)));
    });
  }
  chunked(pilG, new T.MeshStandardMaterial({ color: 0x2e0d4a, emissive: 0x4a1282, emissiveIntensity: .3, roughness: .3, metalness: .1 }), pil, .7);
  {   // неоновые нити по бокам потока — две нити одной сеткой (цвет по вершинам)
    const gs = [-1.1, 1.1].map((th, k) => {
      const pts = []; for (let i = 0; i < flow.n; i += 3) { const f = flow.frame(i); pts.push(f.p.clone().addScaledVector(f.U, -Math.cos(th) * (R + .05)).addScaledVector(f.S, Math.sin(th) * (R + .05))); }
      const g = new T.TubeGeometry(new T.CatmullRomCurve3(pts, true), pts.length * 2, .14, 5, true).toNonIndexed(), c = new T.Color(k ? 0xff4fd8 : 0xa45bff), col = [];
      for (let i = 0; i < g.attributes.position.count; i++) col.push(c.r, c.g, c.b); g.setAttribute("color", new T.Float32BufferAttribute(col, 3)); return g;
    });
    const m = new T.Mesh(mergeGeos(gs), new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false })); m.userData.dyn = true; scene.add(m);
  }
  // знак с баклажаном — въезд в поток
  const padE = { x: C[0] + Math.cos(-Math.PI / 2) * 17, z: C[1] + Math.sin(-Math.PI / 2) * 17, r: 5 };
  const tE = sign(g => {
    g.strokeStyle = "#ff4fd8"; g.lineWidth = 10; g.shadowColor = "#ff4fd8"; g.shadowBlur = 24; g.beginPath(); g.arc(128, 128, 110, 0, 7); g.stroke(); g.shadowBlur = 0;
    g.save(); g.translate(128, 138); g.rotate(-.6); g.fillStyle = "#7a2bc4"; g.beginPath(); g.ellipse(0, 10, 36, 62, 0, 0, 7); g.fill();
    g.fillStyle = "#b780ff"; g.beginPath(); g.ellipse(-12, -6, 9, 26, 0, 0, 7); g.fill();
    g.fillStyle = "#4caf50"; g.beginPath(); g.moveTo(-30, -44); g.lineTo(30, -44); g.lineTo(8, -60); g.lineTo(0, -82); g.lineTo(-8, -60); g.closePath(); g.fill(); g.restore();
  }, "#2a1140");
  const pE = new T.Mesh(new T.CircleGeometry(6, 40).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: tE, side: DS })); pE.position.set(padE.x, .08, padE.z); scene.add(pE);
  // вывески
  const board = (lines, bg, fg, p, yaw, w = 12) => { const m = new T.Mesh(new T.PlaneGeometry(w, w / 4), new T.MeshBasicMaterial({ map: textTex(lines, 512, 128, bg, fg), side: DS, toneMapped: false })); m.position.copy(p); m.rotation.y = yaw; scene.add(m); };
  const m0 = slide.frame(0);
  board(["ГОРКА-ТРУБА"], "#0f1c3a", "#9fe6ff", m0.p.clone().add(new T.Vector3(0, R + 2.2, 0)), Math.atan2(-m0.T.x, -m0.T.z));
  board(["БАКЛАЖАНОВЫЙ ПОТОК"], "#2a1140", "#ff8ef0", new T.Vector3(padE.x, 4, padE.z - 9), 0, 14);
  [-1, 1].forEach(sd => board(["АЭРОТРУБА 888"], "#0f1c3a", "#9fe6ff", new T.Vector3(pad.x, 2.4, pad.z + sd * 10), sd > 0 ? 0 : Math.PI, 12));   // у основания, по бокам
  // аэро-слалом: 8 нумерованных колец спиралью вокруг аэротрубы — вверх против часовой. Следующее — жёлтое.
  const gates = [], numG = [], numT = ctex(1024, 128, (g, w, h) => { g.fillStyle = "#2a1140"; g.fillRect(0, 0, w, h); g.fillStyle = "#ffe14d"; g.font = "bold 96px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; for (let j = 0; j < 8; j++) g.fillText(String(j + 1), j * 128 + 64, 68); });
  for (let j = 0; j < 8; j++) {
    const a = j * Math.PI / 4 + Math.PI / 8, x = C[0] + Math.cos(a) * 17, z = C[1] + Math.sin(a) * 17, y = 9 + j * 4.5;
    const m = new T.Mesh(new T.TorusGeometry(4.6, .32, 6, 32), new T.MeshBasicMaterial({ color: 0x5a3b8a, toneMapped: false }));
    m.position.set(x, y, z); m.rotation.y = -a; m.userData.dyn = true; scene.add(m);
    const ng = new T.PlaneGeometry(1.6, 1.6).toNonIndexed(), uv = ng.attributes.uv;     // номера — одна сетка с общей текстурой
    for (let i = 0; i < uv.count; i++) uv.setX(i, (j + uv.getX(i)) / 8);
    numG.push(ng.applyMatrix4(M4(x, y + 5.6, z, -a)));
    gates.push({ x, y, z, m });
  }
  const nums = new T.Mesh(mergeGeos(numG), new T.MeshBasicMaterial({ map: numT, side: DS, toneMapped: false })); nums.userData.dyn = true; scene.add(nums);
  // ---- «Гран-при Арены»: гоночное кольцо по краю поля (~8 м шириной, ~270 м круг): асфальт, белые кромки, поребрики,
  // стартовое поле на 4 машины, шахматная линия, портал со стартовыми огнями; три соперника; 3 круга, места, лучший круг.
  // Всё полотно с порталом — одна сетка с цветом по вершинам, огни — одна, соперники — одна (экземпляры): 4 вызова
  const race = (() => {
    const N = 240, KI = .282, KO = .338, KC = .31, LAPS = 3;
    const th = [], Dk = [], cs = [0]; for (let i = 0; i <= N; i++) { th.push(i / N * Math.PI * 2); Dk.push(rimAt(th[i] % (Math.PI * 2))); }
    const P = (i, k) => [C[0] + Math.cos(th[i]) * Dk[i] * k, C[1] + Math.sin(th[i]) * Dk[i] * k];
    for (let i = 0; i < N; i++) { const a = P(i, KC), b = P(i + 1, KC); cs.push(cs[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const L = cs[N];
    const iAt = s => { s = ((s % L) + L) % L; let lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cs[m] <= s) lo = m; else hi = m; } return [lo, (s - cs[lo]) / (cs[lo + 1] - cs[lo])]; };
    const at = (s, lane = 0) => {                       // точка трассы: s — по осевой, lane — метры от осевой (+ наружу)
      const [i, f] = iAt(s), a = th[i] + (th[i + 1] - th[i]) * f, D = Dk[i] + (Dk[i + 1] - Dk[i]) * f, k = KC + lane / D;
      const x = C[0] + Math.cos(a) * D * k, z = C[1] + Math.sin(a) * D * k, [j, g] = iAt(s + 1), a2 = th[j] + (th[j + 1] - th[j]) * g, D2 = Dk[j] + (Dk[j + 1] - Dk[j]) * g;
      const x2 = C[0] + Math.cos(a2) * D2 * (KC + lane / D2), z2 = C[1] + Math.sin(a2) * D2 * (KC + lane / D2), tl = Math.hypot(x2 - x, z2 - z) || 1;
      return { x, z, tx: (x2 - x) / tl, tz: (z2 - z) / tl, D };
    };
    const sOf = (x, z) => {                               // проекция машины на трассу: s, отступ от осевой (м), доля радиуса
      let a = Math.atan2(z - C[1], x - C[0]); if (a < 0) a += Math.PI * 2; const fi = a / (Math.PI * 2) * N, i = Math.min(N - 1, Math.floor(fi)), f = fi - i;
      const D = Dk[i] + (Dk[i + 1] - Dk[i]) * f, r = Math.hypot(x - C[0], z - C[1]); return { s: cs[i] + (cs[i + 1] - cs[i]) * f, lane: r - D * KC, k: r / D };
    };
    // полотно: асфальт, кромки, поребрики, шахматная линия, рамки стартового поля, портал — одна сетка с цветом по вершинам
    const pos = [], col = [], nor = [], cc = new T.Color();
    const Q = (p0, p1, p2, p3, y, hex) => { cc.setHex(hex); for (const p of [p0, p1, p2, p0, p2, p3]) { pos.push(p[0], y, p[1]); nor.push(0, 1, 0); col.push(cc.r, cc.g, cc.b); } };
    const band = (k0, k1, y, hex, i0 = 0, i1 = N, vary = 0) => { for (let i = i0; i < i1; i++) Q(P(i, k0), P(i + 1, k0), P(i + 1, k1), P(i, k1), y, vary && i % 2 ? vary : hex); };
    band(KI, KO, .07, 0x2a2c30);                                                      // асфальт
    band(KI + .0035, KI + .0060, .075, 0xf2f2ee); band(KO - .0060, KO - .0035, .075, 0xf2f2ee);   // белые кромки
    for (let i = 0; i < N; i += 1) { const red = (i >> 0) % 2 ? 0xd8322c : 0xf4f4f0; Q(P(i, KI - .006), P(i + 1, KI - .006), P(i + 1, KI + .0015), P(i, KI + .0015), .09, red); Q(P(i, KO - .0015), P(i + 1, KO - .0015), P(i + 1, KO + .006), P(i, KO + .006), .09, red); }   // поребрики
    const S0 = 0, lineAt = (s, l) => { const q = at(s, l); return [q.x, q.z]; };
    {   // шахматная линия: 2 ряда × 12 клеток
      const W = (KO - KI) * at(S0).D, n = 12;
      for (let r = 0; r < 2; r++) for (let c = 0; c < n; c++) { const l0 = -W / 2 + c * W / n, l1 = l0 + W / n, s0 = S0 + r * .7, s1 = s0 + .7;
        Q(lineAt(s0, l0), lineAt(s1, l0), lineAt(s1, l1), lineAt(s0, l1), .08, (r + c) % 2 ? 0x111214 : 0xf4f4f0); }
    }
    const GRID = [0, 1, 2, 3].map(i => ({ s: S0 - 7 - (i >> 1) * 9 - (i % 2) * 3, lane: i % 2 ? 1.9 : -1.9 }));   // «ёлочка» стартового поля
    GRID.forEach(g => { const w = 1.15; Q(lineAt(g.s + 2.4, g.lane - w), lineAt(g.s + 2.7, g.lane - w), lineAt(g.s + 2.7, g.lane + w), lineAt(g.s + 2.4, g.lane + w), .08, 0xf4f4f0);
      [-w, w].forEach(o => Q(lineAt(g.s + .9, o + g.lane - .08), lineAt(g.s + 2.7, o + g.lane - .08), lineAt(g.s + 2.7, o + g.lane + .08), lineAt(g.s + .9, o + g.lane + .08), .08, 0xf4f4f0)); });
    const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); geo.setAttribute("normal", new T.Float32BufferAttribute(nor, 3)); geo.setAttribute("color", new T.Float32BufferAttribute(col, 3));
    // портал над стартом: две опоры и балка (тёмный металл) — тоже в общую сетку
    const g0 = at(S0), nx = -g0.tz, nz = g0.tx, Wd = (KO - KI) * g0.D / 2 + 1.2, yaw0 = Math.atan2(-g0.tz, g0.tx), parts = [geo];
    const boxG = (w, h, d, x, y, z, hex) => { const b = new T.BoxGeometry(w, h, d).toNonIndexed(); b.rotateY(yaw0); b.translate(x, y, z); const c2 = new T.Color(hex), cl = []; for (let i = 0; i < b.attributes.position.count; i++) cl.push(c2.r, c2.g, c2.b); b.setAttribute("color", new T.Float32BufferAttribute(cl, 3)); b.deleteAttribute("uv"); parts.push(b); };
    [-1, 1].forEach(k => boxG(.5, 6.4, .5, g0.x + nx * Wd * k, 3.2, g0.z + nz * Wd * k, 0x2b2e33));
    boxG(.7, .9, Wd * 2 + .6, g0.x, 6.2, g0.z, 0x1d2024);
    const deck = new T.Mesh(mergeGeos(parts), new T.MeshLambertMaterial({ vertexColors: true, side: DS })); scene.add(deck);
    // табло на балке (с двух сторон)
    const ban = new T.Mesh(new T.PlaneGeometry(Wd * 2 - 1, .8), new T.MeshBasicMaterial({ map: textTex(["ГРАН-ПРИ АРЕНЫ · 3 КРУГА"], 1024, 96, "#111214", "#ffd23a"), side: DS, toneMapped: false }));
    ban.position.set(g0.x - g0.tx * .37, 7.08, g0.z - g0.tz * .37); ban.rotation.y = yaw0 + Math.PI / 2; scene.add(ban);
    // стартовые огни: 5 пар под балкой, лицом к стартовому полю — цвет по вершинам меняем на ходу
    const lp = []; for (let j = 0; j < 5; j++) for (const dy of [0, -.42]) { const c = new T.CircleGeometry(.17, 12).toNonIndexed(); c.rotateY(yaw0 - Math.PI / 2); c.translate(g0.x - g0.tx * .37 + nx * (j - 2) * .62, 5.6 + dy, g0.z - g0.tz * .37 + nz * (j - 2) * .62); lp.push(c); }
    const lg = mergeGeos(lp), lc = new Float32Array(lg.attributes.position.count * 3); lg.setAttribute("color", new T.BufferAttribute(lc, 3));
    const lights = new T.Mesh(lg, new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: DS })); lights.userData.dyn = true; scene.add(lights);
    const setLights = (n, green) => { const per = lc.length / 10; for (let j = 0; j < 5; j++) for (let r = 0; r < 2; r++) { const on = green ? 1 : j < n, c = green ? [.15, 1, .35] : on ? [1, .08, .04] : [.12, .02, .02];
      for (let v = 0; v < per / 3; v++) lc.set(c, ((j * 2 + r) * per) + v * 3); } lg.attributes.color.needsUpdate = true; };
    setLights(0);
    // соперники: одна низкая гоночная машина (кузов, кабина, антикрыло, колёса), три экземпляра своих цветов
    const cp = [], car3 = (w, h, d, x, y, z, hex) => { const b = new T.BoxGeometry(w, h, d).toNonIndexed(); b.translate(x, y, z); const c2 = new T.Color(hex), cl = []; for (let i = 0; i < b.attributes.position.count; i++) cl.push(c2.r, c2.g, c2.b); b.setAttribute("color", new T.Float32BufferAttribute(cl, 3)); b.deleteAttribute("uv"); cp.push(b); };
    car3(4.1, .5, 1.85, 0, .5, 0, 0xffffff); car3(1.9, .42, 1.5, -.25, .96, 0, 0x30343a); car3(1.4, .12, 1.52, -.25, 1.2, 0, 0xffffff);
    car3(.35, .08, 1.9, -1.95, 1.08, 0, 0x16181b); [-.7, .7].forEach(z => car3(.1, .32, .1, -1.95, .88, z, 0x16181b)); car3(.3, .14, 1.8, 2.0, .3, 0, 0x16181b);
    [[1.35, .9], [1.35, -.9], [-1.3, .9], [-1.3, -.9]].forEach(([x, z]) => { const w = new T.CylinderGeometry(.34, .34, .28, 12).toNonIndexed(); w.rotateX(Math.PI / 2); w.translate(x, .34, z); const cl = []; for (let i = 0; i < w.attributes.position.count; i++) cl.push(.05, .05, .055); w.setAttribute("color", new T.Float32BufferAttribute(cl, 3)); w.deleteAttribute("uv"); cp.push(w); });
    const rivals = new T.InstancedMesh(mergeGeos(cp), new T.MeshLambertMaterial({ vertexColors: true }), 3); rivals.userData.dyn = true; rivals.frustumCulled = false; scene.add(rivals);
    const AI = [0xd8322c, 0x2f7de1, 0xf2b630].map((c, i) => { rivals.setColorAt(i, new T.Color(c)); return { s: GRID[i].s, lane: GRID[i].lane, want: GRID[i].lane, v: 0, vt: 23.2 + i * .9, prog: GRID[i].s, done: false, name: ["красная", "синяя", "жёлтая"][i] }; });
    const m4 = new T.Matrix4(), qq = new T.Quaternion(), up = new T.Vector3(0, 1, 0), one = new T.Vector3(1, 1, 1), pv = new T.Vector3();
    const place = () => AI.forEach((a, i) => { const q = at(a.s, a.lane); m4.compose(pv.set(q.x, 0, q.z), qq.setFromAxisAngle(up, Math.atan2(-q.tz, q.tx)), one); rivals.setMatrixAt(i, m4); });
    const toGrid = () => AI.forEach((a, i) => Object.assign(a, { s: GRID[i].s, lane: GRID[i].lane, want: GRID[i].lane, v: 0, prog: GRID[i].s, done: false }));
    place(); rivals.instanceMatrix.needsUpdate = true;
    // игра
    const R0 = { st: "idle", t: 0, hold: 0, lap: 0, prog: 0, last: 0, cp: 0, lapT0: 0, t0: 0, best: 0, hint: 0, out: 0, place: 0 };
    const hud = () => document.getElementById("race");
    const show = html => { const h = hud(); if (!h) return; h.hidden = !html; if (html) h.innerHTML = html; };
    const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
    const myProg = () => R0.lap * L + ((R0.last - S0 + L) % L);
    function abort(msg) { R0.st = "idle"; R0.t = 0; setLights(0); toGrid(); show(""); if (msg) queueToast(msg, "bad", 2200); }
    function tick(dt) {
      if (!ARENA) return;
      const inField = mode === "free" && phase === "free", me = sOf(car.x, car.z), slot = GRID[3], sq = at(slot.s, slot.lane), dSlot = Math.hypot(car.x - sq.x, car.z - sq.z);
      if (R0.st === "idle") {
        if (inField && !free.air && car.y < 1 && dSlot < 3.2 && Math.abs(car.v) < 1.5) { if ((R0.hold += dt) > .8) { R0.st = "count"; R0.t = 0; queueToast("Гран-при Арены: ждите, пока погаснут огни", "", 1800); } }
        else R0.hold = 0;
        if (inField && dSlot < 30 && dSlot >= 3.2 && time > R0.hint) { R0.hint = time + 14; queueToast("Гран-при Арены: встаньте в пустую рамку на старте и остановитесь", "", 2600); }
      } else if (R0.st === "count") {
        R0.t += dt; const n = Math.min(5, Math.floor(R0.t / .75) + 1); setLights(n);
        show(`<b>ГРАН-ПРИ</b> <span class="rl">${"●".repeat(n)}${"○".repeat(5 - n)}</span>`);
        if (!R0.go) R0.go = 3.75 + .3 + Math.random() * .8;
        if (dSlot > 2.6) { R0.go = 0; abort("Фальстарт! Вернитесь в рамку"); return; }
        if (R0.t >= R0.go) { R0.go = 0; R0.st = "race"; R0.t0 = R0.lapT0 = time; R0.lap = -1; R0.cp = 3; R0.last = me.s; R0.place = 4; setLights(0, true); sfx.ring(); queueToast("СТАРТ!", "", 900); }
      } else if (R0.st === "race") {
        // круг: проходим четверти по порядку, финишная линия — после всех четвертей
        const ds = ((me.s - R0.last + L * 1.5) % L) - L / 2; if (Math.abs(ds) < 25) { const q0 = Math.floor(((R0.last - S0 + L) % L) / (L / 4)), q1 = Math.floor(((me.s - S0 + L) % L) / (L / 4));
          if (ds > 0 && q1 === (q0 + 1) % 4) { if (q1 === 0) { if (R0.cp === 3) { R0.lap++; const lt = time - R0.lapT0; R0.lapT0 = time;
              if (R0.lap === 0) { R0.cp = 0; R0.last = me.s; return; }                  // со стартового поля пересекли линию — пошёл 1-й круг
              R0.best = R0.best ? Math.min(R0.best, lt) : lt; save.innerLap = Math.min(save.innerLap || 1e9, lt); persist();
              if (lt <= LAPTARGET) completeMission("innerLap", ` (${lt.toFixed(1)} с)`);
              if (R0.lap >= LAPS) { finish(); return; } queueToast(`Круг ${R0.lap + 1}/${LAPS} · ${lt.toFixed(1)} с`, "", 1300); }
              R0.cp = 0; } else if (q1 === R0.cp + 1) R0.cp = q1; }
          R0.last = me.s; }
        const off = me.k < .2 || me.k > .42 || free.air && car.y > 12 || mode !== "free"; R0.out = off ? R0.out + dt : 0;
        if (R0.out > 4) return abort("Гонка прервана — вы ушли с трассы");
        R0.place = 1 + AI.filter(a => a.prog > myProg()).length;
        show(`<b>ГРАН-ПРИ</b> · круг ${Math.max(1, Math.min(LAPS, R0.lap + 1))}/${LAPS} · <b>${R0.place}-й</b> из 4 · ${fmt(time - R0.t0)}${R0.best ? ` · лучший ${R0.best.toFixed(1)}` : ""}`);
      } else if (R0.st === "done") { if ((R0.t += dt) > 6) { R0.st = "idle"; toGrid(); show(""); } }
      // соперники
      if (R0.st === "race" || R0.st === "done") {
        const mp = myProg();
        AI.forEach((a, i) => {
          if (a.done && R0.st === "done") { a.v = Math.max(0, a.v - dt * 8); }
          else { const gap = mp - a.prog, vt = a.vt + Math.max(-2.5, Math.min(3, gap / 18)); a.v += Math.max(-9 * dt, Math.min(6.5 * dt, vt - a.v)); }
          // обгон: впереди машина в том же ряду — уходим в другой
          const ahead = [...AI.filter(b => b !== a).map(b => ({ s: b.s, lane: b.lane })), { s: me.s, lane: me.lane }].find(b => { const d = ((b.s - a.s + L * 1.5) % L) - L / 2; return d > 0 && d < 9 && Math.abs(b.lane - a.lane) < 2; });
          if (ahead) a.want = ahead.lane > 0 ? -1.9 : 1.9; else if (Math.random() < dt * .2) a.want = (i - 1) * 1.6;
          a.lane += Math.max(-1.6 * dt, Math.min(1.6 * dt, a.want - a.lane));
          a.s += a.v * dt; a.prog += a.v * dt;
          if (!a.done && a.prog >= LAPS * L) a.done = true;
          // касание с игроком — расталкиваемся
          const q = at(a.s, a.lane), dx = car.x - q.x, dz = car.z - q.z, d = Math.hypot(dx, dz);
          if (d < 2.3 && d > .01 && !free.air) { const k = (2.3 - d) / d; car.x += dx * k * .7; car.z += dz * k * .7; a.lane -= Math.sign(me.lane - a.lane || 1) * .3; car.v *= .985; a.v *= .985; }
        });
        place(); rivals.instanceMatrix.needsUpdate = true;
      }
    }
    function finish() {
      const pl = 1 + AI.filter(a => a.done).length, t = time - R0.t0; R0.st = "done"; R0.t = 0; setLights(0);
      show(`<b>ФИНИШ</b> · <b>${pl}-й</b> из 4 · ${fmt(t)} · лучший круг ${R0.best.toFixed(1)} с`);
      if (pl === 1) completeMission("innerWin", ` (${fmt(t)})`); else queueToast(`Гран-при: ${pl}-е место. Победа — задание!`, "", 2600);
    }
    const LAPTARGET = 11;
    return { tick, at, sOf, L, GRID, AI, state: () => ({ ...R0, L, ai: AI.map(a => ({ s: a.s, lane: a.lane, v: a.v, prog: a.prog, done: a.done })) }), abort };
  })();
  // вся начинка чаши — в одной группе: издалека её не видно за фасадом, а вызовов отрисовки она стоит ~30 (см. cullChunks)
  const group = new T.Group(); scene.children.slice(n0).forEach(o => group.add(o)); scene.add(group);
  return { group, pad, padE, slide, flow, gates, race, anim(dt) { airT.offset.y -= dt * 1.6; stripes.offset.x -= dt * (free.tube && free.tube.path === flow ? free.tube.v / 9 : 3); } };
})();

/* новые трюк-зоны: четверть трубы, стена с кольцом, трамплин через автобан, трасса «Восьмёрка» */
const EIGHT = { ax: 960, bx: 1060, z: 170, r: 50, hw: 7.5 };      // две петли, перекрёсток в (1010, 170); hw — полуширина асфальта (15 м)
(() => {
  flat(130, 100, under(0x8a8a86), 690, 15, .02);
  kicker(645, 10, 0, 11, 7, 8, 0x6b4a8a, true); ring(672, 19, 10);
  kicker(690, 45, 0, 10, 6, 6, 0x4a3f58); ring(715, 11, 45);
  const wall = new T.Mesh(new T.BoxGeometry(1.2, 7, 9), mat(0x8a3b4a)); wall.position.set(715, 3.5, 45); scene.add(wall);
  addSolid(714.4, 715.6, 40.5, 49.5, 7, "стену");
  const ws = new T.Mesh(new T.PlaneGeometry(9, 1.6), new T.MeshBasicMaterial({ map: textTex(["СКВОЗЬ КОЛЬЦО"], 512, 96, "#8a3b4a", "#ffe2a6"), side: T.DoubleSide }));
  ws.rotation.y = Math.PI / 2; ws.position.set(714.3, 5.6, 45); scene.add(ws);
  // трамплин через автобан: разгон с пустыря на север, перелёт над всеми полосами
  flat(8, 170, under(0x2f2c35), 850, 79, .02);
  kicker(850, -6, Math.PI / 2, 16, 7, 6, 0xc8323c).id = "overpass";
  const os = new T.Mesh(new T.PlaneGeometry(13, 3.4), new T.MeshBasicMaterial({ map: textTex(["ТРАМПЛИН", "через автобан"], 512, 128, "#c8323c", "#ffffff"), side: T.DoubleSide }));
  os.position.set(860, 6, 24); scene.add(os);
  // «Восьмёрка»: две асфальтовые петли, ворота на дальних точках и старт на перекрёстке
  const ringM = under(0x34313a);
  [EIGHT.ax, EIGHT.bx].forEach(cx => { const m = new T.Mesh(new T.RingGeometry(EIGHT.r - EIGHT.hw, EIGHT.r + EIGHT.hw, 96), ringM); m.rotation.x = -Math.PI / 2; m.position.set(cx, .05, EIGHT.z); scene.add(m); });
  const gate = (x, z, rot) => {
    const g = new T.Group(), post = mat(0xffb347);
    [-9, 9].forEach(o => { const p = new T.Mesh(new T.BoxGeometry(.4, 5, .4), post); p.position.set(o, 2.5, 0); g.add(p); });
    const bar = new T.Mesh(new T.BoxGeometry(18.4, .5, .4), post); bar.position.y = 5; g.add(bar);
    g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
  };
  gate(EIGHT.ax - EIGHT.r, EIGHT.z, 0); gate(EIGHT.bx + EIGHT.r, EIGHT.z, 0); gate(1010, EIGHT.z, 0);
  // вывеска над стартом (на арке из лампочек), видна с обеих сторон
  const esM = new T.MeshBasicMaterial({ map: textTex(["ДРИФТ-ТРЕК 888", "3 круга · держи трассу · дрифт"], 512, 128, "#2b2438", "#ffc93c") });
  [0, Math.PI].forEach(ry => { const es = new T.Mesh(new T.PlaneGeometry(13, 3.2), esM); es.position.set(1010, 13.2, EIGHT.z); es.rotation.y = ry; scene.add(es); });   // две стороны — без зеркального текста
  // асфальт петель — тёмный, с зерном (было бледно-сиреневым)
  ringM.color.setHex(0x2b2a30); { const g = grainTex.clone(); g.repeat.set(16, 16); g.needsUpdate = true; ringM.map = g; }
})();

