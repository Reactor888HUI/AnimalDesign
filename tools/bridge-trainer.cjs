// Тренажёр испытаний ж/д моста: бот запускает каждое испытание с кнопки ▶ (старт, пролёт/поезд/судно) и проходит его
// газом без руля (газ — только на земле и до своей скорости). Запуск: PW=$(npm root -g)/playwright node tools/bridge-trainer.cjs [id,id]
const { chromium } = require(process.env.PW || "playwright");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const p = await (await b.newContext({ viewport: { width: 320, height: 200 } })).newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => localStorage.setItem("baklan3d-v1", JSON.stringify({ unlocked: 1, quality: "low", trained: true, partyFx: false, kino: false })));
  await p.clock.install(); await p.goto("file://" + require("path").resolve(__dirname, "../arcade/index.html") + "#test"); await p.clock.runFor(2500);
  await p.evaluate(() => { const R = __t.RAILB, a = R.at(R.L / 2, 0); __t.teleport(a.x, a.z, R.yaw, 10); __t.fast(true); });
  for (let i = 0; i < 8; i++) await p.clock.runFor(500);
  const ids = (process.argv[2] || "rbArch,rbOver,rbJet,rbRails,rbTwo,rbRailGap,rbLift,rbTrain,rbTrainJump,rbBarge").split(",");
  let fails = 0;
  for (const id of ids) {
    const VM = { rbArch: 30, rbOver: 30, rbJet: 30, rbRails: 99, rbTwo: 16, rbRailGap: 22, rbLift: 30, rbTrain: 30, rbTrainJump: 30, rbBarge: 33 };
    const r = await p.evaluate(([id, vm]) => { __t.unmis(); const R = __t.RAILB; __t.trainer(id); const ev = []; let ph = __t.car().phase, onT = 0;
      for (let k = 0; k < 120 * 22 && !__t.done(id); k++) {
        const q = __t.car(), [s, l] = R.loc(q.x, q.z), g = __t.ground(q.x, q.z, q.y + .1);
        const onTrain = R.st.train.on && !q.air && Math.abs(q.y - R.Y0 - R.TRAIN.h) < .3;
        __t.input({ thrust: !onTrain && !q.air && q.v < vm && !(id === "rbLift" && R.st.y < R.LIFT - .5) }); __t.step(1 / 120);
        if (q.phase !== ph) { ev.push(`${q.phase} s${s.toFixed(0)} l${l.toFixed(1)} y${q.y.toFixed(1)} ${__t.toast().slice(0, 50)}`); ph = q.phase; }
        if (k % 240 === 0) ev.push(`· s${s.toFixed(0)} l${l.toFixed(1)} y${q.y.toFixed(1)} v${q.v.toFixed(0)}${q.air ? ' A' : ''}`);
      }
      __t.input({}); return [__t.done(id), ev.join(' | ')]; }, [id, VM[id] || 30]);
    if (!r[0]) fails++;
    console.log((r[0] ? "✓ " : "✗ ") + id, r[0] ? "" : r[1].slice(0, 900));
  }
  console.log("errors", errs.slice(0, 3)); await b.close(); process.exit(fails || errs.length ? 1 : 0);
})();
