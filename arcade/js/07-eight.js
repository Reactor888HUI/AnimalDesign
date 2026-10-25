// «Восьмёрка Баклажан» — дрифт-трек «Восьмёрка».
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
const N07 = northMark();               // всё в файле — на плато (northLift в конце)
/* ---------- дрифт-трек 888 (шоу «Восьмёрка»): праздничная площадка — бордюры, стрелки и шевроны, арка, гирлянды, шары, табло, фейерверк ---------- */
const SHOW = (() => {
  const { ax, bx, z: cz, r, hw } = EIGHT, X0 = 1010, crossD = (x, z) => Math.hypot(x - X0, z - cz);
  const ringD = (x, z) => Math.min(Math.abs(Math.hypot(x - ax, z - cz) - r), Math.abs(Math.hypot(x - bx, z - cz) - r));
  // красно-белые бордюры по кромкам петель; у перекрёстка — разрыв, чтобы не перечёркивать соседнюю петлю
  [ax, bx].forEach(cx => [r - hw - .2, r + hw + .2].forEach(rr => {
    const N = 140;
    for (let i = 0; i < N; i++) {
      const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, P = (a, d) => [cx + Math.cos(a) * (rr + d), .075, cz + Math.sin(a) * (rr + d)];
      const m = P((a0 + a1) / 2, 0); if (crossD(m[0], m[2]) < 30 || ringD(m[0], m[2]) < hw - .5) continue;   // петли касаются: асфальт у перекрёстка общий
      festQuadUp(P(a0, -.5), P(a0, .5), P(a1, .5), P(a1, -.5), i % 2 ? "#f4f2ec" : "#e2323c");
    }
  }));
  // шахматная линия старта на перекрёстке — во всю ширину
  for (let i = 0; i < 25; i++) for (let j = 0; j < 2; j++) {
    const x = X0 - hw + i * .6, z = cz - .6 + j * .6;
    festQuadUp([x, .08, z], [x + .6, .08, z], [x + .6, .08, z + .6], [x, .08, z + .6], (i + j) % 2 ? "#111114" : "#f4f2ec");
  }
  // указатели: белые стрелки-шевроны на асфальте по ходу (петля A — против часовой, петля B — по часовой)
  const arrow = (x, z, dx, dz) => {        // шеврон «>» длиной 3 м поперёк дороги 4 м
    const nx = -dz, nz = dx, A = (u, w) => [x + dx * u + nx * w, .085, z + dz * u + nz * w];
    festQuadUp(A(-.8, -2.2), A(-.2, -2.2), A(1.2, 0), A(.6, 0), "#f4f2ec");
    festQuadUp(A(.6, 0), A(1.2, 0), A(-.2, 2.2), A(-.8, 2.2), "#f4f2ec");
  };
  [[ax, 1], [bx, -1]].forEach(([cx, dir]) => {
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2 + Math.PI / 12, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (crossD(x, z) < 30) continue;
      arrow(x, z, -Math.sin(a) * dir, Math.cos(a) * dir);
    }
  });
  // шевроны на внешней стороне петель — жёлто-чёрные щиты «поворот» по ходу движения
  [[ax, 1], [bx, -1]].forEach(([cx, dir]) => {
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2, x = cx + Math.cos(a) * (r + hw + 2.6), z = cz + Math.sin(a) * (r + hw + 2.6);
      if (crossD(x, z) < 34 || ringD(x, z) < hw + 1.5) continue;
      const tx = -Math.sin(a) * dir, tz = Math.cos(a) * dir, nx = -Math.cos(a), nz = -Math.sin(a);   // ход и нормаль к центру петли
      const P = (u, y) => [x + tx * u + nx * .02, y, z + tz * u + nz * .02];
      festPole(x - tx * .9, z - tz * .9, 2.4); festPole(x + tx * .9, z + tz * .9, 2.4);
      festPut(new T.BoxGeometry(2.4, 1, .06).lookAt(new T.Vector3(nx, 0, nz)).translate(x, 1.9, z), "#ffc93c");
      for (const o of [-.6, .2]) { festTri(P(o - .35, 2.3), P(o + .25, 1.9), P(o - .35, 1.5), "#151517"); festTri(P(o - .35, 2.3), P(o - .05, 2.3), P(o + .25, 1.9), "#151517"); festTri(P(o - .35, 1.5), P(o + .25, 1.9), P(o - .05, 1.5), "#151517"); }
    }
  });
  // арка из лампочек над стартовыми воротами (столбы ворот — ±9 м по x, перекладина на 5 м)
  { const pts = []; for (let k = 0; k <= 52; k++) { const a = Math.PI * k / 52; pts.push([X0 + Math.cos(a) * 9, 5.3 + Math.sin(a) * 5.2, cz]); } festBulbs(pts); }
  { const pts = []; for (let y = .6; y <= 5; y += .55) [-9, 9].forEach(o => pts.push([X0 + o, y, cz + .25])); festBulbs(pts, ["#ffc93c", "#ff3b6b"]); }
  // гирлянды флажков на столбах вокруг петель (не у перекрёстка и не на асфальте соседней петли)
  [ax, bx].forEach(cx => {
    const poles = []; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, x = cx + Math.cos(a) * (r + hw + 5), z = cz + Math.sin(a) * (r + hw + 5); if (crossD(x, z) > 30 && ringD(x, z) > hw + 3) poles.push([x, z]); }
    poles.forEach(([x, z]) => festPole(x, z, 5.2));
    for (let k = 1; k < poles.length; k++) { const [x0, z0] = poles[k - 1], [x1, z1] = poles[k]; if (Math.hypot(x1 - x0, z1 - z0) < 30) festBunting([x0, 5, z0], [x1, 5, z1]); }
  });
  // воздушные шары у дальних ворот
  [[ax - r, cz], [bx + r, cz]].forEach(([gx, gz], gi) => [-9, 9].forEach(o => {
    for (let b = 0; b < 4; b++) {
      const x = gx + (b % 2 - .5) * .7, y = 6.2 + b * .55 + (b % 2) * .3, z = gz + o + (b > 1 ? .5 : -.5);
      festPut(new T.SphereGeometry(.5, 8, 6).scale(1, 1.2, 1).translate(x, y, z), FEST_COLS[(b + gi * 2 + (o > 0 ? 1 : 0)) % FEST_COLS.length]);
      festPut(new T.CylinderGeometry(.01, .01, y - 5, 3).translate((x + gx) / 2, (y + 5) / 2 - .5, z), "#e9e6df");
    }
  }));
  // табло на столбах за северной петлёй: живой счёт и рекорд
  const bc = document.createElement("canvas"); bc.width = 512; bc.height = 192; const bg = bc.getContext("2d"), btex = new T.CanvasTexture(bc); btex.encoding = T.sRGBEncoding;
  const board = new T.Mesh(new T.PlaneGeometry(16, 6), new T.MeshBasicMaterial({ map: btex, toneMapped: false, side: T.DoubleSide }));
  const BZ = cz + r + hw + 9;
  board.position.set(X0, 9.8, BZ); board.userData.dyn = true; scene.add(board);
  festPole(X0 - 7.5, BZ + .1, 7, 0, "#3a3a40"); festPole(X0 + 7.5, BZ + .1, 7, 0, "#3a3a40");
  let boardKey = "";
  function drawBoard(lines, hot) {
    const k = lines.join("|") + hot; if (k === boardKey) return; boardKey = k;
    bg.fillStyle = "#14121c"; bg.fillRect(0, 0, 512, 192);
    bg.strokeStyle = hot ? "#ffc93c" : "#b46bff"; bg.lineWidth = 8; bg.strokeRect(6, 6, 500, 180);
    bg.textAlign = "center"; bg.textBaseline = "middle";
    lines.forEach((t, i) => { bg.fillStyle = i ? "#ffffff" : "#ffc93c"; bg.font = `bold ${i ? 40 : 34}px Golos Text, Arial, sans-serif`; bg.fillText(t, 256, 40 + i * 52); });
    btex.needsUpdate = true;
  }
  drawBoard(["ДРИФТ-ТРЕК 888", "3 круга: трасса + дрифт", "рекорд " + (save.eightShowBest || 0)], false);
  // фейерверк: точки с цветами, вспышки над трибунами
  const FN = 360, fpos = new Float32Array(FN * 3), fcol = new Float32Array(FN * 3), fv = new Float32Array(FN * 3), flife = new Float32Array(FN), fbase = new Float32Array(FN * 3);
  const fg = new T.BufferGeometry(); fg.setAttribute("position", new T.BufferAttribute(fpos, 3)); fg.setAttribute("color", new T.BufferAttribute(fcol, 3));
  const fdot = document.createElement("canvas"); fdot.width = fdot.height = 32; { const q = fdot.getContext("2d"), r = q.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, "#fff"); r.addColorStop(.3, "rgba(255,255,255,.95)"); r.addColorStop(1, "rgba(255,255,255,0)"); q.fillStyle = r; q.fillRect(0, 0, 32, 32); }
  const fw = new T.Points(fg, new T.PointsMaterial({ size: 1.1, map: new T.CanvasTexture(fdot), alphaTest: .1, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
  fw.frustumCulled = false; fw.userData.dyn = true; fw.visible = false; scene.add(fw);
  let fi = 0, fwT = 0, fwQueue = 0;
  function burst(at) {
    const x = at ? at[0] : X0 + (Math.random() - .5) * 120, y = at ? at[1] : 22 + Math.random() * 14, z = at ? at[2] : cz + (Math.random() < .5 ? -1 : 1) * (r + 14 + Math.random() * 10);
    const col = new T.Color(FEST_COLS[Math.floor(Math.random() * FEST_COLS.length)]).convertSRGBToLinear();
    for (let k = 0; k < 60; k++) {
      const i = fi++ % FN, a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1), sp = 9 + Math.random() * 4;
      fpos.set([x, y, z], i * 3); fv.set([Math.sin(b) * Math.cos(a) * sp, Math.cos(b) * sp, Math.sin(b) * Math.sin(a) * sp], i * 3);
      fbase.set([col.r * 2, col.g * 2, col.b * 2], i * 3); flife[i] = 1.8;
    }
    fw.visible = true;
  }
  return {
    drawBoard,
    fireworks(n = 8) { fwQueue += n; },
    salute(x, y, z, n = 3) { for (let i = 0; i < n; i++) burst([x + (Math.random() - .5) * 12, y + Math.random() * 5, z + (Math.random() - .5) * 12]); },   // салют над крутым трюком где угодно
    tick(dt) {
      board.visible = Math.hypot(camera.position.x - X0, camera.position.z - cz) < 500;   // табло — только вблизи
      if (fwQueue > 0 && (fwT -= dt) <= 0) { burst(); fwQueue--; fwT = .35 + Math.random() * .3; }
      if (!fw.visible) return;
      let alive = 0;
      for (let i = 0; i < FN; i++) {
        if (flife[i] <= 0) { fcol[i * 3] = fcol[i * 3 + 1] = fcol[i * 3 + 2] = 0; continue; }
        alive++; flife[i] -= dt; fv[i * 3 + 1] -= 6 * dt;
        for (let k = 0; k < 3; k++) { fv[i * 3 + k] *= Math.pow(.4, dt); fpos[i * 3 + k] += fv[i * 3 + k] * dt; fcol[i * 3 + k] = fbase[i * 3 + k] * Math.max(0, flife[i] / 1.8); }
      }
      fg.attributes.position.needsUpdate = fg.attributes.color.needsUpdate = true;
      if (!alive && fwQueue <= 0) fw.visible = false;
    }
  };
})();
northLift(N07);
