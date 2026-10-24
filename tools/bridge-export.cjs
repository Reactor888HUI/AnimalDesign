// Выгрузка ж/д моста для проверки в Blender/Python: (1) видимая сталь — треугольники в координатах моста (s — вдоль от города,
// l — поперёк, y — высота) с цветом; (2) «твёрдость» — сетка 0,5 м, где hit0 даёт препятствие (имя), и поверхности, где ground
// держит машину; (3) траектории испытаний тренажёра (бот, как в bridge-trainer.cjs). Пролёт — внизу и поднятый.
// Запуск: PW=$(npm root -g)/playwright node tools/bridge-export.cjs папка_вывода
const { chromium } = require(process.env.PW || "playwright");
const fs = require("fs"), path = require("path");
const OUT = process.argv[2] || "bridge-out"; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const p = await (await b.newContext({ viewport: { width: 320, height: 200 } })).newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.addInitScript(() => localStorage.setItem("baklan3d-v1", JSON.stringify({ unlocked: 1, quality: "low", trained: true, partyFx: false, kino: false })));
  await p.clock.install(); await p.goto("file://" + path.resolve(__dirname, "../arcade/index.html") + "#test"); await p.clock.runFor(2500);
  await p.evaluate(() => { const R = __t.RAILB, a = R.at(R.L / 2, 0); __t.teleport(a.x, a.z, R.yaw, 10); __t.fast(true); });
  for (let i = 0; i < 10; i++) await p.clock.runFor(500);
  const st0 = await p.evaluate(() => ({ y: __t.RAILB.st.y, t: __t.RAILB.st.t }));
  const meta = await p.evaluate(() => { const R = __t.RAILB; return { L: R.L, A1: R.A1, A2: R.A2, Y0: R.Y0, HW: R.HW, LIFT: R.LIFT, TOW: R.TOW, loaded: R.st.loaded }; });
  console.log("мост", JSON.stringify(meta));
  for (const lift of process.env.SKIPGRID ? [] : [0, 1]) {
    // видимая сталь
    const tri = await p.evaluate(lift => {
      const R = __t.RAILB; R.st.y = lift ? R.LIFT : 0; R.st.t = lift ? 40 : 2; const ms = R.meshes(); if (ms[1]) ms[1].position.y = R.st.y;
      const out = [], v = new THREE.Vector3();
      for (const m of R.meshes()) { m.updateMatrixWorld(true); const g = m.geometry, pa = g.attributes.position, ca = g.attributes.color, n = g.index ? g.index.count : pa.count;
        for (let k = 0; k < n; k++) { const i = g.index ? g.index.getX(k) : k; v.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld); const [s, l] = R.loc(v.x, v.z); out.push(s, l, v.y, ca ? ca.getX(i) : .5, ca ? ca.getY(i) : .5, ca ? ca.getZ(i) : .5); } }
      return out;
    }, lift);
    fs.writeFileSync(path.join(OUT, `steel${lift}.f32`), Buffer.from(new Float32Array(tri).buffer));
    // твёрдость: сетка 0,5 м — индекс имени препятствия (0 — пусто), отдельно — поверхность под точкой (держит ли)
    const grid = await p.evaluate(lift => {
      const R = __t.RAILB; R.st.y = lift ? R.LIFT : 0; R.st.t = lift ? 40 : 2;
      const S0 = -10, S1 = R.L + 10, L0 = -10, L1 = 10, Y0 = 4, Y1 = R.Y0 + R.TOW + 10, d = .5, names = [""], id = {};
      const ns = Math.round((S1 - S0) / d), nl = Math.round((L1 - L0) / d), ny = Math.round((Y1 - Y0) / d), occ = new Uint8Array(ns * nl * ny), sup = new Uint8Array(ns * nl * ny);
      for (let a = 0; a < ns; a++) for (let c = 0; c < nl; c++) { const s = S0 + (a + .5) * d, l = L0 + (c + .5) * d, p = R.at(s, l);
        for (let e = 0; e < ny; e++) { const y = Y0 + (e + .5) * d, h = R.hit0(p.x, p.z, y), k = (a * nl + c) * ny + e;
          if (h) { if (!(h.name in id)) { id[h.name] = names.length; names.push(h.name); } occ[k] = id[h.name]; }
          const g = R.ground(p.x, p.z, y + d / 2); if (g && g.h > y - d / 2 - .01 && g.h <= y + d / 2 + .01) sup[k] = 1; } }
      return { S0, L0, Y0, d, ns, nl, ny, names, occ: Array.from(occ), sup: Array.from(sup) };
    }, lift);
    fs.writeFileSync(path.join(OUT, `grid${lift}.json`), JSON.stringify({ ...grid, occ: undefined, sup: undefined }));
    fs.writeFileSync(path.join(OUT, `occ${lift}.u8`), Buffer.from(Uint8Array.from(grid.occ))); fs.writeFileSync(path.join(OUT, `sup${lift}.u8`), Buffer.from(Uint8Array.from(grid.sup)));
    console.log(`пролёт ${lift ? "поднят" : "внизу"}: стали ${tri.length / 18} тр., сетка ${grid.ns}×${grid.nl}×${grid.ny}, препятствия: ${grid.names.slice(1).join(", ")}`);
  }
  // траектории испытаний тренажёра
  const ids = ["rbArch", "rbOver", "rbJet", "rbRails", "rbTwo", "rbRailGap", "rbLift", "rbTrain", "rbTrainJump", "rbBarge"], VM = { rbArch: 30, rbOver: 30, rbJet: 30, rbRails: 99, rbTwo: 16, rbRailGap: 22, rbLift: 30, rbTrain: 30, rbTrainJump: 30, rbBarge: 33 };
  const tr = {};
  await p.evaluate(s0 => { const R = __t.RAILB; R.st.y = s0.y; R.st.t = s0.t; R.st.v = 0; const ms = R.meshes(); if (ms[1]) ms[1].position.y = s0.y; }, st0);   // пролёт — как был до выгрузки
  for (const id of ids) {
    tr[id] = await p.evaluate(([id, vm]) => { __t.unmis(); const R = __t.RAILB; __t.trainer(id); const pts = [];
      for (let k = 0; k < 120 * 22 && !__t.done(id); k++) {
        const q = __t.car(), [s, l] = R.loc(q.x, q.z), onTrain = R.st.train.on && !q.air && Math.abs(q.y - R.Y0 - R.TRAIN.h) < .3;
        __t.input({ thrust: !onTrain && !q.air && q.v < vm && !(id === "rbLift" && R.st.y < R.LIFT - .5) }); __t.step(1 / 120);
        if (k % 6 === 0) pts.push([+s.toFixed(2), +l.toFixed(2), +q.y.toFixed(2), q.air ? 1 : 0, +(R.st.y).toFixed(2), q.phase === "free" ? 0 : 1, +q.yaw.toFixed(3)]);
      }
      __t.input({}); return { done: __t.done(id), pts }; }, [id, VM[id]]);
    console.log(`${tr[id].done ? "✓" : "✗"} ${id}: ${tr[id].pts.length} точек`);
  }
  fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify({ ...meta, trials: tr }));
  console.log("errors", errs.slice(0, 3)); await b.close();
})();
