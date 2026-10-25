// «Восьмёрка Баклажан» — параметры, уроки, сохранение, случайность, сцена, куски мира.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
const $ = id => document.getElementById(id);
// если что-то сломается, показываем текст ошибки прямо на экране игры — по нему можно понять причину
function showFatal(msg) {
  let el = $("fatal");
  if (!el) { el = document.createElement("div"); el.id = "fatal"; el.className = "loading fatal"; $("stage").appendChild(el); }
  el.textContent = "Ошибка: " + msg + ". Пришлите этот текст разработчику.";
}
// игра остановлена при запуске (нет 3D) — ошибки следующих файлов игры не показываем, на экране остаётся понятная причина
let halted = false;
const halt = msg => { $("loading").textContent = msg; halted = true; throw new Error(msg); };
addEventListener("error", e => { if (!halted) showFatal(`${e.message || "неизвестная"}${e.lineno ? ` (${(e.filename || "").split("/").pop()}, строка ${e.lineno})` : ""}`); });
addEventListener("unhandledrejection", e => showFatal(String(e.reason && (e.reason.message || e.reason.code) || e.reason)));
if (!window.THREE) halt("Не удалось загрузить 3D-движок. Обновите страницу.");
const T = THREE, DEG = Math.PI / 180;

/* ---------- параметры полигона ---------- */
const G = 14, ACC = 8, DRAG = 2, VMAX = 30;
const RS = 70, RL = 14, RH = 5, RX = RS + RL;
const ROW0 = RX + 8, GAP = 0.8, HALF = 2.2, WHEEL = 0.65;
const AIR_SLOW = 0.8;
const CLEAN_ROLL = 20, CLEAN_V = 16, HARD_ROLL = 45, HARD_V = 24;
/* ---------- параметры города ---------- */
const ZA = -60;                       // ось автобана
const PLAT = 42;                      // высота плато севера (z > −82: автобан, трюк-парк, полигон, «Восьмёрка») — верх города у Садовой (ТЗ, раздел 9)
const VMAXF = 55;                     // ~200 км/ч
const WORLD = { x0: -580, x1: 3640, z0: -2860, z1: 260 };   // до x 3640 — западная сцена: Темерницкий и железнодорожный мосты
const SPAWN = { x: -60, z: ZA + 13.75, yaw: 0 };
// данные: arcade/data/osm-main.js (tools/osm-to-game.py)
// данные: arcade/data/osm-west.js (MARK=WEST-DATA tools/osm-to-game.py)
const yUp0 = new T.Vector3(0, 1, 0), one0 = new T.Vector3(1, 1, 1);

const MODELS = [
  { n: "седан", len: 4.7, h: 1.45, c: 0x7f8fa8 },
  { n: "кроссовер", len: 4.75, h: 1.7, c: 0xa7b2c4 },
  { n: "пикап", len: 5.6, h: 1.95, c: 0x9aa1a8 },
  { n: "тягач", len: 6.2, h: 3.4, c: 0x5d6b85 },
  { n: "робо-такси", len: 4.2, h: 1.5, c: 0xc9cfdb }
];
const LEVELS = [
  { name: "Первый прыжок", desc: "Три машины. Держите ГАЗ до рампы, у земли — снова ГАЗ.", cars: 3, coach: true },
  { name: "Весь ряд", desc: "Шесть машин, включая тягач.", cars: 6, coach: true },
  { name: "Встречный ветер", desc: "Порывы тормозят машину в воздухе.", cars: 6, wind: -3, gust: true },
  { name: "С бодуна", desc: "Боковые сопла перепутаны, ассистент выключен.", cars: 5, invert: true, noAssist: true },
  { name: "На точку", desc: "Семь машин и посадка точно на площадку у трибуны.", cars: 7, pad: { off: 7, w: 10 } }
];
const FREE = { name: "Ростов", cars: 0, free: true, i: -2 };

/* ---------- уроки ---------- */
const DRILLS = [
  { title: "Газ", short: "Держите ГАЗ до 60 км/ч.",
    text: "Зажмите и держите кнопку ГАЗ (на клавиатуре — стрелка ↑). Машина разгонится. Нужно 60 км/ч.",
    setup() { phase = "run"; },
    check() { return Math.min(1, car.v / 16.7); }, hint: () => "thrust" },
  { title: "Подушка", short: "Держите ГАЗ, чтобы машина не выпала из зелёной зоны 4 с.",
    text: "Машина висит в воздухе и падает. В воздухе ГАЗ работает как подушка: пока держите, она падает медленно. Удержите машину в зелёной зоне 4 секунды.",
    setup() { phase = "drill"; car.y = 8; zone(3, 10); },
    tick(dt) { if (car.y >= 3 && car.y <= 10) this.t += dt; return Math.min(1, this.t / 4); },
    ground() { car.y = 8; car.vy = 0; flash("Упала. Держите ГАЗ дольше."); this.t = 0; },
    hint: () => car.vy < -1.5 || car.y < 5 ? "thrust" : null },
  { title: "Переворот", short: "◀ ▶ — поставьте машину колёсами вниз и остановите.",
    text: "Машина висит вверх колёсами. В воздухе кнопки ◀ и ▶ крутят её. Поверните колёсами вниз и остановите — прибор крена станет зелёным.",
    setup() { phase = "drill"; car.y = 6; car.roll = 180; this.noGrav = true; },
    tick(dt) {
      const e = Math.abs(rollErr(car.roll));
      if (e <= 15 && Math.abs(car.om) < 60) this.t += dt; else this.t = Math.max(0, this.t - dt);
      return Math.min(1, this.t / 1.5);
    },
    hint() { const e = rollErr(car.roll); if (Math.abs(car.om) > 100) return car.om > 0 ? "rl" : "rr"; return Math.abs(e) <= 15 ? null : e > 0 ? "rl" : "rr"; } },
  { title: "Мягкая посадка", short: "Ниже 7 м держите ГАЗ. Касание медленнее 16 м/с.",
    text: "Машина падает с 14 метров. Когда она опустится ниже 7 м, зажмите ГАЗ, чтобы затормозить. Коснуться земли нужно медленнее 16 м/с.",
    setup() { phase = "drill"; car.y = 14; car.vx = 3; },
    tick() { return this.done ? 1 : 0; },
    ground() {
      const v = -car.vy;
      car.y = 0; car.vy = 0;
      if (v <= CLEAN_V) { this.done = true; dust(car.x, 0, car.z, 8); return; }
      flash(`Слишком жёстко: ${v.toFixed(0)} м/с. Нажмите ГАЗ раньше.`); car.y = 14;
    },
    hint: () => car.y < 7 && car.y > .1 ? "thrust" : null },
  { title: "Полный прыжок", short: "ГАЗ до рампы, дальше слушайте подсказки.",
    text: "Всё вместе: держите ГАЗ до рампы, в воздухе следите за прибором крена и кольцом на земле, у земли снова ГАЗ. Перелетите две машины.",
    setup() { L = { name: "Полигон", cars: 2, coach: true, i: -1 }; buildLevel(); phase = "run"; },
    check() { return 0; } }
];

/* ---------- сохранение ---------- */
let save = { unlocked: 1, best: {}, assist: true, trained: false, freeBest: 0, trickBest: 0, missions: {} };
try { const s = JSON.parse(localStorage.getItem("baklan3d-v1")); if (s && s.unlocked) save = Object.assign(save, s); } catch (e) {}
const persist = () => { try { localStorage.setItem("baklan3d-v1", JSON.stringify(save)); } catch (e) {} setTimeout(pushScore, 0); };

/* ---------- случайность с зерном: город всегда одинаковый ---------- */
let seed = 742;
const rnd = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/* ---------- сцена ---------- */
const stage = $("stage");
let renderer;
try { renderer = new T.WebGLRenderer({ antialias: save.quality !== "low" }); }   // на «низком» без MSAA (вступает после перезапуска)
catch (e) { halt("Браузер не дал включить 3D (WebGL). Попробуйте другой браузер или закройте лишние вкладки."); }
renderer.domElement.addEventListener("webglcontextlost", ev => { ev.preventDefault(); showFatal("видеокарта сбросила 3D — вероятно, не хватило памяти телефона"); });
const MAXQ = Math.min(devicePixelRatio || 1, 1.6);   // потолок плотности пикселей; авто-качество опускает его при тормозах
renderer.setPixelRatio(MAXQ);
renderer.outputEncoding = T.sRGBEncoding;
renderer.domElement.className = "gl";
stage.insertBefore(renderer.domElement, stage.firstChild);
$("loading").remove();
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(60, 1, 0.5, 980);
/* ---------- куски мира: мелкие объекты по квадратам 200 м, рисуем только видимые ---------- */
// InstancedMesh в three r149 сам не отсекается (frustumCulled = false): деревья, фонари и разметка рисовались
// все и всегда, даже за спиной. Здесь они разложены по квадратам; каждый кадр квадрат показывается, только
// если он в поле зрения и ближе дальности, которая зависит от качества (perf.reach).
const CHUNKS = [], CHUNK = 200, chunkP = new T.Vector3();
function chunked(geo, mat, mats, far = 1, cols = null, sc = null) {   // mats — матрицы экземпляров; far — доля дальности тумана; cols — цвета экземпляров; sc — сцена-владелец
  geo.computeBoundingSphere();
  const gr = geo.boundingSphere.center.length() + geo.boundingSphere.radius, groups = new Map();
  mats.forEach((m, j) => { chunkP.setFromMatrixPosition(m); const k = Math.floor(chunkP.x / CHUNK) * 4096 + Math.floor(chunkP.z / CHUNK); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(j); });
  groups.forEach(list => {
    const im = new T.InstancedMesh(geo, mat, list.length), box = new T.Box3(), sph = new T.Sphere();
    list.forEach((j, i) => { const m = mats[j]; im.setMatrixAt(i, m); if (cols) im.setColorAt(i, cols[j]); box.expandByPoint(chunkP.setFromMatrixPosition(m)); });
    box.getBoundingSphere(sph); sph.radius += gr * 1.6;              // запас на размер и масштаб экземпляра
    const ch = { obj: im, s: sph, far }; (sc ? sc.group : scene).add(im); CHUNKS.push(ch); if (sc) sc.chunks.push(ch);
  });
}
const chunkFrustum = new T.Frustum(), chunkPV = new T.Matrix4(), chunkStat = { shown: 0, total: 0 };
function cullChunks() {
  camera.updateMatrixWorld();
  chunkPV.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); chunkFrustum.setFromProjectionMatrix(chunkPV);
  const reach = perf.q <= .75 ? 300 : perf.q <= 1 ? 430 : 580;      // дальность мелочей, м
  let n = 0;
  for (const ch of CHUNKS) {
    ch.obj.visible = camera.position.distanceTo(ch.s.center) - ch.s.radius < reach * ch.far && chunkFrustum.intersectsSphere(ch.s);
    if (ch.obj.visible) n++;
  }
  chunkStat.shown = n; chunkStat.total = CHUNKS.length;
  if (INNER) INNER.group.visible = Math.hypot(camera.position.x - ARENA.C[0], camera.position.z - ARENA.C[1]) < 560;   // начинка Арены — только вблизи
}
// фактура асфальта: мелкое зерно и пятна заплаток; с мипмапами — вдали сглаживается, не рябит
const grainTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"); let hs = 7;
  const hr = () => (hs = (hs * 16807) % 2147483647) / 2147483647;
  g.fillStyle = "#ececec"; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 9; i++) { const x = hr() * 128, y = hr() * 128, r = 10 + hr() * 22, gr = g.createRadialGradient(x, y, 0, x, y, r), v = hr() < .5 ? "215,215,215" : "250,250,250";
    gr.addColorStop(0, `rgba(${v},.7)`); gr.addColorStop(1, `rgba(${v},0)`); g.fillStyle = gr; [-128, 0, 128].forEach(ox => [-128, 0, 128].forEach(oy => g.fillRect(x - r + ox, y - r + oy, r * 2, r * 2))); }
  for (let i = 0; i < 3200; i++) { const v = 195 + hr() * 60 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(hr() * 128 | 0, hr() * 128 | 0, 1, 1); }
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.encoding = T.sRGBEncoding; return t;
})();
const M4 = (x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromAxisAngle(yUp0, yaw), new T.Vector3(sx, sy, sz));
