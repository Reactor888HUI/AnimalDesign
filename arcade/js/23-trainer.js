// «Восьмёрка Баклажан» — тренажёр ж/д моста.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- тренажёр испытаний ж/д моста ---------- */
// «⋯» → «Задания» → ▶ у испытания моста: машину ставит на старт с нужной скоростью, пролёт / поезд / судно — в нужном
// положении, на мосту загорается траектория-подсказка (голубые огоньки), внизу — что делать. Пройдено — траектория гаснет
const TRAINER = (() => {
  const R = RAILB; if (!R) return { has: () => false, go() {}, tick() {}, done() {} };
  const { A1, A2, L, Y0, HW, LIFT, GAP0, GAP1, RL, KS, KB, KH } = R, MID = (A1 + A2) / 2;
  const tex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(.3, "rgba(160,240,255,.9)"); r.addColorStop(1, "rgba(60,200,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c); })();
  const mat = new T.PointsMaterial({ size: 1.1, map: tex, color: 0x7fe9ff, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, fog: false });
  const st = { id: null, pts: null, t: 0 };
  const line = (s0, s1, l0, l1, y) => [0, .5, 1].map(k => [s0 + (s1 - s0) * k, l0 + (l1 - l0) * k, typeof y === "function" ? y(s0 + (s1 - s0) * k) : y]);
  const chord = (s0, s1, l) => Array.from({ length: 9 }, (_, i) => { const s = s0 + (s1 - s0) * i / 8; return [s, l, R.top(s) + .5]; });
  const arc = (a, b, h) => Array.from({ length: 9 }, (_, i) => { const k = i / 8; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k + h * 4 * k * (1 - k)]; });
  const ramp = s => Y0 * Math.min(1, Math.max(0, (s + R.RAMP) / R.RAMP));
  const D = Y0 + .5;
  // старт: [s, l, курс (+1 — к югу, −1 — к городу), скорость]; prep — пролёт/поезд/судно; path — точки [s, l, y]
  const TR = {
    rbArch: { start: [-40, HW, 1, 22], lift: 0, hint: "По жёлтому краю — на пояс арки и через колесо на вершине", path: () => [...line(-40, -2, HW, HW, s => ramp(s) + .5), ...chord(0, A1 / 2 + 8, HW)] },
    rbOver: { start: [-40, -HW, 1, 24], lift: 0, hint: "Поверху: пояс северной арки → край пролёта → пояс южной. Огни зелёные", path: () => [...line(-40, -2, -HW, -HW, s => ramp(s) + .5), ...chord(0, A1, -HW), ...line(A1 + 1, A2 - 1, -HW, -HW, D), ...chord(A2, L - 8, -HW)] },
    rbJet: { start: [-40, HW, 1, 24], lift: 1, hint: "Пролёт поднят: по поясу к колесу на вершине — реактивный бросок на пролёт", path: () => [...line(-40, -2, HW, HW, s => ramp(s) + .5), ...chord(0, A1 / 2, HW), ...arc([A1 / 2, HW, R.top(A1 / 2) + .5], [A1 + 22, 3.2, Y0 + LIFT + .5], 18)] },
    rbRails: { start: [A1 - 110, -2.2, 1, 16], lift: 0, hint: "По рельсам (голубой участок разгоняет) — со «ступеньки» на пролёт", path: () => [...line(A1 - 110, A1 - 8 - KS, -2.2, -2.2, D), ...line(A1 - 8 - KS, A1 - 8, -2.2, -2.2, s => D + KH * (s - A1 + 8 + KS) / KS), ...arc([A1 - 8, -2.2, D + KH], [A1 + 26, -2.2, D], 3)] },
    rbTwo: { start: [A2 + .6, RL, 1, 14], lift: 0, hint: "Заезжай на жёлтые перила и держись 3 секунды — «на двух колёсах»", path: () => [...line(A2 + .6, A2 + 1, RL, RL, D), ...line(A2 + 1, A2 + 9, RL, RL, s => D + 1.4 * (s - A2 - 1) / 8), ...line(A2 + 9, GAP0, RL, RL, D + 1.4)] },
    rbRailGap: { start: [L - 2, RL, -1, 22], lift: 0, hint: "С юга по перилам, с красного трамплинчика — через разрыв на балку", path: () => [...line(L - 2, L - 8, RL, RL, D), ...line(L - 8, L - 16, RL, RL, s => D + 1.4 * (L - 8 - s) / 8), ...line(L - 16, GAP1 + 6, RL, RL, D + 1.4), ...line(GAP1 + 6, GAP1, RL, RL, s => D + 1.4 + 1.2 * (GAP1 + 6 - s) / 6), ...arc([GAP1, RL, D + 2.6], [GAP0 - 6, RL, D + 1.4], 2.5)] },
    rbLift: { start: [A1 + 45, 3.5, -1, 0], lift: 1, y: Y0 + LIFT, hint: "Ты на поднятом пролёте: газ к бело-красному трамплину — в колесо над краем", path: () => [...line(A1 + 45, A1 + 8 + KS, 3.5, 3.5, D + LIFT), ...line(A1 + 8 + KS, A1 + 8, 3.5, 3.5, s => D + LIFT + KH * (A1 + 8 + KS - s) / KS), ...arc([A1 + 8, 3.5, D + LIFT + KH], [A1 - 14, 3.5, Y0 + LIFT + 2], 4)] },
    rbTrain: { start: [-6, -R.TRAIN.l, 1, 24], lift: 0, train: 52, hint: "Поезд рядом: сквозь кольцо над свободным путём — на крышу, держись 10 с", path: () => [...line(-6, 30, -R.TRAIN.l, -R.TRAIN.l, D), ...arc([30, -R.TRAIN.l, D + .3], [62, R.TRAIN.l, Y0 + R.TRAIN.h + .5], 3)] },
    rbTrainJump: { start: [-6, -R.TRAIN.l, 1, 24], lift: 0, train: 52, hint: "Газ по свободному пути и сквозь кольцо — перекидка на крышу поезда", path: () => [...line(-6, 30, -R.TRAIN.l, -R.TRAIN.l, D), ...arc([30, -R.TRAIN.l, D + .3], [62, R.TRAIN.l, Y0 + R.TRAIN.h + .5], 3)] },
    rbBarge: { start: [A1 - 85, -4, 1, 32], lift: 1, ship: true, hint: "Под пролётом идёт сухогруз: на полном ходу с края моста — на палубу", path: () => [...line(A1 - 85, A1, -4, -4, D), ...arc([A1, -4, D], [MID, -4, 2.2], 1.5)] },
  };
  function shipUnder() {                                // сухогруз — под середину пролёта, малым ходом
    const sh = SHIPS.list.find(q => q.kind === "barge"); if (!sh) return; let best = 0, bd = 1e9;
    for (let d = 0; d < SHIPS.LEN; d += 4) { sh.d = d; SHIPS.tick(0.0001); const k = Math.hypot(sh.x - R.C.x, sh.z - R.C.z); if (k < bd) { bd = k; best = d; } }
    sh.d = best - sh.dir * 6; sh.v = 2; SHIPS.tick(0.0001);
  }
  function show(pts3) {
    if (st.pts) { scene.remove(st.pts); st.pts.geometry.dispose(); st.pts = null; }
    if (!pts3) return;
    const curve = new T.CatmullRomCurve3(pts3.map(([s, l, y]) => R.at(s, l, y))), n = Math.max(8, Math.round(curve.getLength() / 1.3));
    st.pts = new T.Points(new T.BufferGeometry().setFromPoints(curve.getSpacedPoints(n)), mat); st.pts.frustumCulled = false; st.pts.userData.dyn = true; scene.add(st.pts);
  }
  function go(id) {
    const c = TR[id]; if (!c) return;
    if (mode !== "free") startFree(false, false);
    free.proA = null; if (replay) stopReplay(); if (PARTY.on) PARTY.stop();
    const [s0, l0, d, v] = c.start, p = R.at(s0, l0), yaw = Math.atan2(-R.dir.z * d, R.dir.x * d);
    car.x = p.x; car.z = p.z; car.yaw = yaw; tickScenes(true);
    R.setLift(!!c.lift); if (c.train != null) R.startTrain(c.train); if (c.ship) shipUnder();
    const g = R.ground(p.x, p.z, (c.y ?? ramp(s0)) + 1.5); car.y = g ? g.h : c.y ?? Y0;
    car.v = v; car.vy = 0; car.vl = 0; car.roll = car.om = car.pitch = 0; car.bodyRoll = car.bodyPitch = 0;
    free.air = false; free.wall = null; free.aero = null; free.tube = null; free.lap = null; free.safe = { x: p.x, z: p.z, yaw, y: car.y }; free.grace = 1.5; phase = "free";
    camPos.set(car.x - Math.cos(yaw) * 9, car.y + 3.2, car.z + Math.sin(yaw) * 9); zoneAt = -1; closeDock();
    R.st.rings.forEach(r => { r.got = false; r.m.material.color.setHex(0xd8322c); });
    st.id = id; st.t = 0; show(c.path()); showToast(`Тренажёр: ${c.hint}`, "good", 4200);
  }
  function tick(dt) {
    if (!st.id) return; st.t += dt;
    if (st.pts) st.pts.material.opacity = .65 + .35 * Math.sin(st.t * 4);
    if (st.t > 90 || Math.hypot(car.x - R.C.x, car.z - R.C.z) > 600) { st.id = null; show(null); }
  }
  function done(id) { if (id === st.id) { st.id = null; show(null); } }
  return { has: id => !!TR[id], go, tick, done, get id() { return st.id; } };
})();
window.TRAINER_ = TRAINER;   // syncDock и completeMission вызываются и до этой строки — обращаются через window
$("m-mis").addEventListener("click", e => { const b = e.target.closest("[data-tr]"); if (b) { e.stopPropagation(); TRAINER.go(b.dataset.tr); } });
const QUALS = { auto: ["авто", MAXQ], low: ["низкое", .75], mid: ["среднее", 1], high: ["высокое", MAXQ], photo: ["фото", MAXQ] };
$("m-q").onclick = () => {
  const order = ["auto", "low", "mid", "high", "photo"], next = order[(order.indexOf(save.quality || "auto") + 1) % order.length];
  save.quality = next; persist(); setQuality(QUALS[next][1]); syncDock();
  if (next === "photo") showToast("Фото: тени, отражения в Дону, подсветка моста ночью. Тяжелее для телефона", "", 2600);
};
$("m-snd").onclick = $("snd-btn").onclick = () => { save.sound = save.sound === false; persist(); sfx.unlock(); if (save.sound === false) sfx.song(false); syncDock(); };
$("m-pmus").onclick = () => { save.partyMusic = !partyMus(); persist(); if (!partyMus()) sfx.song(false); syncDock(); };
$("m-kino").onclick = () => { save.kino = save.kino === false; persist(); syncDock(); };
$("m-pfx").onclick = $("fx-btn").onclick = () => { save.partyFx = !partyFx(); persist(); syncDock(); showToast(`Спецэффекты: ${partyFx() ? "вкл" : "выкл"}`, "", 1200); };
// во весь экран: игра занимает всё окно (шапки нет, меню — «⋯» сверху); на телефоне ещё и прячем панели браузера
function goFull(on) {
  document.body.classList.toggle("full", on); resize();
  try { const d = document, fs = d.fullscreenElement || d.webkitFullscreenElement;
    if (on && !fs) (d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen || (() => {})).call(d.documentElement)?.catch?.(() => {});
    else if (!on && fs) (d.exitFullscreen || d.webkitExitFullscreen).call(d)?.catch?.(() => {}); } catch (e) {}
}
$("m-full").onclick = () => { save.full = save.full === false; persist(); goFull(save.full !== false); syncDock(); };
document.body.classList.toggle("full", save.full !== false); $("fx-btn").classList.toggle("off", !partyFx()); $("snd-btn").textContent = save.sound === false ? "🔇" : "🔊"; $("snd-btn").classList.toggle("off", save.sound === false);
let fullAsked = false;
stage.addEventListener("pointerdown", () => { if (fullAsked || save.full === false || !matchMedia("(pointer: coarse)").matches) return; fullAsked = true; goFull(true); }, true);   // первое касание — без панелей браузера
addEventListener("fullscreenchange", () => resize());   // resize — в 26-frame.js, к загрузке этого файла её ещё нет
$("m-mini").onclick = () => { save.mini = save.mini === false; persist(); syncDock(); };

