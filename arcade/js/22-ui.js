// «Восьмёрка Баклажан» — результаты, меню, уроки, повтор, рекорды, «⋯», карта.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- результат уровня ---------- */
function showResult() {
  if (mode === "train") return trainJumpResult();
  $("r-replay").hidden = rec.length < 10;
  const ok = !landing.fail;
  const dist = ok ? Math.max(0, landing.x - RX) : 0;
  const extraTurns = Math.max(0, Math.floor((totalRoll - 180 + 30) / 360));
  let score = 0, rows = [], padOk = null;
  if (ok) {
    const sD = Math.round(dist * 10), sL = landing.q === "clean" ? 500 : 150, sG = Math.round(gas * 5), sS = extraTurns * 400;
    score = sD + sL + sG + sS;
    rows.push(["Дальность", `${dist.toFixed(1)} м`, sD], ["Посадка", landing.q === "clean" ? `чистая, крен ${Math.round(landing.err)}°` : `жёсткая, ${landing.vImp.toFixed(1)} м/с`, sL],
      ["Газ в баллонах", `${Math.round(gas)}%`, sG], ["Лишние обороты", `${extraTurns}`, sS]);
    if (L.padX != null) { padOk = landing.x >= L.padX && landing.x <= L.padX + L.pad.w; score += padOk ? 800 : 0; rows.push(["Площадка", padOk ? "в точку" : "мимо", padOk ? 800 : 0]); }
  }
  const passed = ok && padOk !== false, prev = save.best[L.i] || 0;
  if (passed) { if (score > prev) save.best[L.i] = score; save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, L.i + 2)); persist(); }
  result = { ok, passed, score };
  const t = $("r-title");
  t.textContent = !ok ? "Авария" : !passed ? "Мимо площадки" : landing.q === "clean" ? "Чисто" : "Жёстко, но на колёсах";
  t.className = !ok ? "verdict-bad" : passed && landing.q === "clean" ? "verdict-ok" : "verdict-mid";
  $("r-reason").textContent = !ok ? landing.fail : !passed ? "Машина цела, но села не на площадку." : `Уровень «${L.name}» пройден.${score > prev ? " Новый рекорд." : ""}`;
  $("r-list").innerHTML = ok ? rows.map(([a, b, s]) => `<dt>${a}: ${b}</dt><dd>+${s}</dd>`).join("") +
    `<dt class="total">Итого</dt><dd class="total">${score}</dd><dt>Рекорд уровня</dt><dd>${Math.max(prev, passed ? score : 0)}</dd>` : "";
  $("r-next").hidden = !(passed && L.i < LEVELS.length - 1);
  $("r-next").textContent = "Следующий уровень"; $("r-again").textContent = "Ещё раз";
  $("ov-res").hidden = false; $("coach").hidden = true;
}

/* ---------- меню режимов ---------- */
function renderMenu() {
  $("levels").innerHTML = `
    <button class="lvl alt" type="button" data-i="free"><span class="no">⌂</span>
      <span><span class="nm">Свободная езда: Ростов, автобан, трюки</span><span class="ds">Трюк-парк, трамплин через автобан, «Восьмёрка», задания. Рекорд: ${save.freeBest}</span></span><span class="best"></span></button>
    <button class="lvl alt pro" type="button" data-i="pro"><span class="no">∞</span>
      <span><span class="nm">PRO: Бесконечный Безлимит 🍆</span><span class="ds">Вся карта, баллоны не кончаются: летите как в аэротрубе сколько держите ПРЫГ, присоски — сколько угодно. Баклажановые разгоны перед трамплинами и на крышах.</span></span><span class="best"></span></button>
    <button class="lvl alt" type="button" data-i="train"><span class="no">◎</span>
      <span><span class="nm">Полигон управления</span><span class="ds">Пять коротких уроков: газ, подушка, переворот, посадка, прыжок.</span></span>
      <span class="best">${save.trained ? "пройден" : ""}</span></button>` +
    LEVELS.map((l, i) => `
    <button class="lvl" type="button" data-i="${i}">
      <span class="no">${i + 1}</span>
      <span><span class="nm">${l.name}</span><span class="ds">${l.desc}</span></span>
      <span class="best">${save.best[i] ? "рекорд " + save.best[i] : ""}</span>
    </button>`).join("");
}
$("levels").addEventListener("click", e => {
  const b = e.target.closest(".lvl"); if (!b || b.disabled) return;
  const v = b.dataset.i;
  v === "free" ? startFree() : v === "pro" ? startFree(true, true) : v === "train" ? startTraining(0) : start(+v);
});
function openMenu() { closeDock(); renderMenu(); $("ov-menu").hidden = false; }
$("menu-close").onclick = () => { $("ov-menu").hidden = true; };
function hideLesson() { $("lesson").hidden = true; $("ov-brief").hidden = true; clearInterval(briefTimer); }
function start(i) {
  mode = "level"; hideLesson(); stopReplay(); applyLook(); reset(i); $("ov-menu").hidden = true; $("ov-res").hidden = true;
  showToast(`Уровень ${i + 1}: ${LEVELS[i].name}. ${LEVELS[i].desc}`, "", 3000);
}
$("r-again").onclick = () => mode === "train" ? startTraining(DRILLS.length - 1) : start(L.i);
$("r-next").onclick = () => mode === "train" ? startFree() : start(L.i + 1);
$("r-menu").onclick = () => { $("ov-res").hidden = true; openMenu(); };
$("r-replay").onclick = startReplay;
$("rp-skip").onclick = () => endReplay();

/* ---------- уроки ---------- */
let lessonOpenUntil = 0;
function startTraining(i) {
  mode = "train"; di = i; stopReplay(); applyLook();
  $("ov-menu").hidden = true; $("ov-res").hidden = true;
  L = { name: "Полигон", cars: 0, i: -1 }; buildLevel(); freshCar();
  assistOn = save.assist;
  const d = DRILLS[di]; d.t = 0; d.p = 0; d.done = false;
  d.setup.call(d);
  $("lesson").hidden = false;
  $("ls-title").textContent = d.title; $("ls-step").textContent = `${di + 1}/${DRILLS.length}`;
  $("ls-text").textContent = d.short; $("ls-bar").style.width = "0"; $("ls-msg").textContent = "";
  briefPhase = phase; phase = "brief";
  $("br-step").textContent = `Урок ${di + 1} из ${DRILLS.length}`;
  $("br-title").textContent = d.title;
  $("br-text").textContent = joyMode() ? d.text + " На телефоне: джойстик вверх — ГАЗ, влево и вправо — ◀ ▶." : d.text;
  $("ov-brief").hidden = false;
  let left = 4; $("br-go").textContent = `Начать · ${left}`;
  clearInterval(briefTimer);
  briefTimer = setInterval(() => { left--; if (left <= 0) beginLesson(); else $("br-go").textContent = `Начать · ${left}`; }, 1000);
}
function beginLesson() {
  clearInterval(briefTimer);
  if ($("ov-brief").hidden) return;
  $("ov-brief").hidden = true; phase = briefPhase; lessonOpenUntil = performance.now() + 3000;
}
$("br-go").onclick = beginLesson;
$("br-menu").onclick = () => { hideLesson(); openMenu(); };
$("ls-skip").onclick = e => { e.stopPropagation(); di + 1 < DRILLS.length ? startTraining(di + 1) : startFree(); };
$("lesson").onclick = () => { lessonOpenUntil = performance.now() + 3000; };
function flash(m) { flashMsg = m; flashT = 3; lessonOpenUntil = performance.now() + 3000; }
function trainTick() {
  const d = DRILLS[di];
  $("lesson").classList.toggle("min", performance.now() > lessonOpenUntil);
  if (di === DRILLS.length - 1) { const c = coachHint(); $("ls-msg").textContent = c ? c.t : ""; return; }
  const p = d.tick ? (d.p || 0) : d.check.call(d);
  $("ls-bar").style.width = `${Math.round(p * 100)}%`;
  $("ls-msg").textContent = phase === "lesson-done" ? "Готово!" : flashT > 0 ? flashMsg : "";
  if (p >= 1 && phase !== "lesson-done" && phase !== "brief") {
    phase = "lesson-done"; lessonOpenUntil = performance.now() + 1500;
    const from = di;
    setTimeout(() => { if (mode === "train" && phase === "lesson-done" && di === from) startTraining(from + 1); }, 1000);
  }
}
function trainJumpResult() {
  const ok = !landing.fail, t = $("r-title");
  $("r-replay").hidden = rec.length < 10;
  if (ok) {
    save.trained = true; persist();
    t.textContent = "Полигон пройден"; t.className = "verdict-ok";
    $("r-reason").textContent = "Вы умеете разгоняться, держать подушку, крутить машину и садиться. Дальше — город и трюк-парк.";
    $("r-next").hidden = false; $("r-next").textContent = "В город";
  } else {
    t.textContent = "Почти"; t.className = "verdict-mid";
    $("r-reason").textContent = landing.fail + " Попробуйте ещё раз.";
    $("r-next").hidden = true;
  }
  $("r-again").textContent = ok ? "Ещё раз" : "Повторить прыжок";
  $("r-list").innerHTML = ""; result = { ok };
  hideLesson(); $("ov-res").hidden = false; $("coach").hidden = true;
}

/* ---------- повтор с трибуны ---------- */
function recordFree() {
  const tr = free.track || (free.track = []);
  if (!tr.length || time - tr[tr.length - 1].t >= 1 / 30 || time < tr[tr.length - 1].t) {
    if (tr.length && time < tr[tr.length - 1].t) tr.length = 0;
    tr.push({ t: time, x: car.x, y: car.y, z: car.z, yaw: car.yaw, roll: car.roll + (car.bodyRoll || 0), pitch: car.pitch });
  }
  while (tr.length && tr[0].t < time - 14) tr.shift();
  if (free.pend && time >= free.pend.until) {
    free.bestRec = tr.filter(f => f.t >= free.pend.from && f.t <= free.pend.until); free.bestPts = free.pend.pts; free.pend = null;
    replayBtnUntil = performance.now() + 6000; syncDock();
  }
  if (free.kinoPend && time >= free.kinoPend.until) {
    const k = free.kinoPend; free.kinoPend = null;
    let fr = tr.filter(f => f.t >= k.from && f.t <= k.until);
    for (let i = fr.length - 1; i > 0; i--) if (Math.hypot(fr[i].x - fr[i - 1].x, fr[i].z - fr[i - 1].z) > 15) { fr = fr.slice(i); break; }   // без скачков (телепорт, возврат на дорогу)
    if (fr.length > 8 && phase === "free" && !free.air && !replay) {
      replay = { t: fr[0].t, end: fr[fr.length - 1].t - .3, final: { ...car }, frames: fr, free: true, kino: true, rate: .6, party: k.party && PARTY.ready() };
      if (replay.party) sfx.song(true);                                    // песня — с первого кадра повтора
      car.bodyRoll = car.bodyPitch = 0;
      closeDock(); $("replay").hidden = false; $("rp-label").textContent = `КИНО · ${k.label} +${k.pts}`; stage.classList.add("replaying");
    }
  }
}
let replayBtnUntil = 0;
function startFreeReplay() {
  const fr = free.bestRec; if (!fr || fr.length < 5) return;
  // «оператор» сбоку от середины траектории, чуть выше её верхней точки
  const a = fr[0], b = fr[fr.length - 1], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, top = Math.max(...fr.map(f => f.y)), base = Math.min(a.y, b.y);   // base — земля у взлёта/посадки (город на склоне, север на плато)
  const eye = new T.Vector3((a.x + b.x) / 2 - dz / L * (L * .55 + 14), base + Math.max(4, (top - base) * .6 + 3), (a.z + b.z) / 2 + dx / L * (L * .55 + 14));
  if (hitSolid(eye.x, eye.z, eye.y)) eye.y = Math.max(...solidsNear(eye.x, eye.z).map(s => s.h)) + 4;
  replay = { t: fr[0].t, end: fr[fr.length - 1].t - .8, final: { ...car }, frames: fr, eye, free: true };
  car.bodyRoll = car.bodyPitch = 0;
  closeDock(); $("replay").hidden = false; $("rp-label").textContent = `ПОВТОР · ЛУЧШИЙ ТРЮК +${free.bestPts}`; stage.classList.add("replaying");
}
function startReplay() {
  if (rec.length < 10) return;
  const from = rec.find(f => f.x >= RS - 30) || rec[0];
  replay = { t: from.t, end: rec[rec.length - 1].t, final: { ...car } };
  $("ov-res").hidden = true; $("replay").hidden = false; $("rp-label").textContent = "ПОВТОР · ТРИБУНА"; stage.classList.add("replaying");
}
function stopReplay() {
  if (!replay) return;
  Object.assign(car, replay.final); replay = null;
  $("replay").hidden = true; stage.classList.remove("replaying"); KINO.end();
}
function endReplay() { const f = replay && replay.free, party = replay && replay.party; stopReplay(); if (!f) $("ov-res").hidden = false; if (party) PARTY.start(false, true); }
function replayPose() {
  const fr = replay.frames || rec;
  let i = 1;
  while (i < fr.length - 1 && fr[i].t < replay.t) i++;
  const a = fr[i - 1], b = fr[i], k = Math.max(0, Math.min(1, (replay.t - a.t) / Math.max(1e-6, b.t - a.t)));
  car.x = a.x + (b.x - a.x) * k; car.y = a.y + (b.y - a.y) * k;
  car.roll = a.roll + (b.roll - a.roll) * k; car.pitch = a.pitch + (b.pitch - a.pitch) * k;
  if (a.z !== undefined) { car.z = a.z + (b.z - a.z) * k; car.yaw = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * k; }
}

/* ---------- общая таблица рекордов: база опубликованной игры ---------- */
// Каждый игрок пишет только свой документ scores/<id>, читают все. Хранятся только id и числа — имена берутся при показе.
// В локальном файле и в автотестах базы нет — раздел просто не показывается.
const board = { db: null, user: null, me: null, rows: [], sent: "", timer: 0, readOnly: false };
(async () => {
  try {
    if (typeof window.claude === "undefined" || !window.claude.use) return;
    const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
    if (!db) return;
    board.db = db; board.user = user; board.me = user ? await user.id() : null;
    if (!board.me) board.readOnly = true;
    db.collection("scores").orderBy("best", "desc").limit(10).onSnapshot(snap => {
      board.rows = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderBoard();
    }, () => { board.db = null; renderBoard(); });
    pushScore(); renderBoard();
  } catch (e) { board.db = null; }
})();
function pushScore() {                     // свой рекорд — не чаще раза в 4 с и только если он изменился
  // таймер не перезапускаем: иначе, пока очки растут чаще раза в 4 с, запись откладывалась бы бесконечно; строку собираем в момент отправки
  if (!board.db || !board.me || board.readOnly || !save.freeBest || board.timer) return;
  const rowNow = () => ({ best: save.freeBest, trick: save.trickBest || 0, missions: Object.keys(save.missions || {}).length });
  if (JSON.stringify(rowNow()) === board.sent) return;
  board.timer = setTimeout(async () => {
    const row = rowNow(), k = JSON.stringify(row);
    try { if (k !== board.sent) { await board.db.doc("scores/" + board.me).set({ ...row, at: Date.now() }); board.sent = k; } }
    catch (e) { if (e && (e.code === "invalid_argument" || e.code === "revoked" || e.code === "not_granted")) board.readOnly = true; }
    board.timer = 0; renderBoard();
    if (JSON.stringify(rowNow()) !== board.sent) pushScore();   // пока ждали ответа, рекорд мог вырасти
  }, 4000);
}
async function renderBoard() {
  const show = !!board.db;
  $("m-board-h").hidden = $("m-board").hidden = !show; $("m-board-note").hidden = !show || (!board.readOnly && board.rows.length > 0);
  if (!show) return;
  const ids = board.rows.map(r => r.id), ps = board.user && ids.length ? await board.user.profiles(ids) : {};
  const ol = $("m-board"); ol.textContent = "";
  board.rows.forEach(r => {
    const li = document.createElement("li"), sp = document.createElement("span"), nm = document.createElement("i"), b = document.createElement("b");
    nm.style.fontStyle = "normal";
    nm.textContent = (r.id === board.me ? "вы" : (ps[r.id] && ps[r.id].name) || "Игрок") + (r.missions ? ` · заданий ${Math.min(r.missions, MISSIONS.length)}` : "");
    b.textContent = Number(r.best || 0).toLocaleString("ru-RU");
    sp.append(nm, b); li.append(sp); if (r.id === board.me) li.className = "me"; ol.append(li);
  });
  $("m-board-note").textContent = board.readOnly ? "Ваш рекорд сюда не попадёт: у вас доступ только на просмотр." : "Пока пусто — сыграйте в свободной езде, рекорд появится здесь.";
}

/* ---------- «⋯», тосты, карта ---------- */
let dockCloseAt = 0;
function openDock() { $("dock-panel").hidden = false; $("dock-btn").setAttribute("aria-expanded", "true"); dockCloseAt = performance.now() + 8000; syncDock(); }
function closeDock() { $("dock-panel").hidden = true; $("dock-btn").setAttribute("aria-expanded", "false"); }
$("dock-btn").onclick = () => $("dock-panel").hidden ? openDock() : closeDock();
$("dock-panel").addEventListener("pointerdown", () => { dockCloseAt = performance.now() + 8000; });
$("dock-panel").addEventListener("scroll", () => { dockCloseAt = performance.now() + 8000; }, { passive: true });
stage.addEventListener("pointerdown", e => { if (!e.target.closest(".dock")) closeDock(); });
function syncDock() {
  $("m-cam").textContent = `Камера: ${CAMS[camMode]}`;
  $("m-time").textContent = `Время суток: ${TIMES[TIME].name}`;
  $("m-photo").textContent = `Режим «Фото» (облака, тени, отражения): ${save.quality === "photo" ? "вкл" : "выкл"}`;
  const skyN = save.quality === "photo" && PHOTO.skyName(); $("m-sky").hidden = !skyN; if (skyN) $("m-sky").textContent = `Небо: ${skyN}`;   // выбор неба — только в «Фото»
  $("m-tilt").textContent = !tilt.on ? "Наклон телефона: выкл" : !tilt.seen ? "Наклон: вкл · датчик молчит" :
    `Наклон: вкл · руль ${tilt.x >= 0 ? "+" : ""}${tilt.x.toFixed(1)} · газ ${tilt.y >= 0 ? "+" : ""}${tilt.y.toFixed(1)}`;
  const cur = mode === "free" ? (free.pro ? "pro" : "free") : mode === "train" ? "train" : "";
  document.querySelectorAll("#m-mode button[data-m]").forEach(b => b.classList.toggle("on", b.dataset.m === cur));
  $("m-assist").textContent = `Ассистент переворота: ${save.assist ? "вкл" : "выкл"}`;
  $("m-q").textContent = `Качество: ${QUALS[save.quality || "auto"][0]} · ${Math.round(perf.fps)} к/с · ${Math.round(drawStat.tris / 1000)} тыс. △ · ${drawStat.calls} выз.`;
  $("m-snd").textContent = `Звук: ${save.sound === false ? "выкл" : "вкл"}`;
  $("snd-btn").textContent = save.sound === false ? "🔇" : "🔊"; $("snd-btn").classList.toggle("off", save.sound === false);
  $("m-pmus").textContent = `Музыка вечеринки: ${partyMus() ? "вкл" : "выкл"}`;
  $("m-pfx").textContent = `Спецэффекты вечеринки: ${partyFx() ? "вкл" : "выкл"}`;
  $("m-kino").textContent = `Кино-повтор у моста: ${save.kino === false ? "выкл" : "вкл"}`;
  $("fx-btn").classList.toggle("off", !partyFx());
  $("m-full").textContent = `Экран: ${save.full === false ? "с заголовком" : "во весь"}`;
  $("m-mini").textContent = `Мини-карта: ${save.mini === false ? "выкл" : "вкл"}`;
  $("m-ctrl").textContent = `Управление: ${{ joy: "джойстик", wheel: "руль + педаль", buttons: "кнопки" }[ctrl()]}`;
  $("m-veh").textContent = `Машина: ${SUV && SUV.on ? "внедорожник" : "ВАЗ-2108"}`; $("m-veh").hidden = !SUV;
  $("m-amb").hidden = !(SUV && SUV.on); if (SUV) $("m-amb").textContent = `Подсветка салона: ${SUV.ambName}`;
  $("m-paint").textContent = `Цвет: ${PAINTS[paintIdx() % PAINTS.length].n}`; $("m-paint").hidden = $("m-tune").hidden = !!(SUV && SUV.on);
  $("m-tune").textContent = `Обвес: ${TUNES[save.tune || 0]}`;
  const done = MISSIONS.filter(m => save.missions && save.missions[m.id]).length;
  $("m-mis-h").textContent = `Задания · ${done} из ${MISSIONS.length}`;
  $("m-mis").innerHTML = MISSIONS.map(m => { const ok = save.missions && save.missions[m.id]; return `<li class="${ok ? "done" : ""}"><span>${ok ? "✓" : "○"}</span><span>${m.t}</span><b>+${m.pts}</b>${window.TRAINER_ && TRAINER_.has(m.id) ? `<button type="button" class="tr-go" data-tr="${m.id}" title="Тренажёр: на старт">▶</button>` : ""}</li>`; }).join("");
  $("m-replay").hidden = !(mode === "free" && free.bestRec);
  if (free.bestPts) $("m-replay").textContent = `▶ Повтор лучшего трюка (+${free.bestPts})`;
  $("m-stat").textContent = mode === "free" ? `Очки ${free.score} · рекорд ${save.freeBest} · лучший трюк ${save.trickBest}`
    : mode === "train" ? `Полигон · урок ${di + 1}` : `Уровень ${L.i + 1}: ${L.name}`;
}
$("m-modes").onclick = openMenu;
$("m-mode").addEventListener("click", e => {          // быстрый выбор режима
  const m = e.target.closest("button[data-m]")?.dataset.m; if (!m) return;
  closeDock(); m === "pro" ? startFree(true, true) : m === "free" ? startFree() : startTraining(0);
});
$("m-tune").onclick = () => { save.tune = ((save.tune || 0) + 1) % TUNES.length; persist(); setTune(save.tune); syncDock(); };
$("m-replay").onclick = startFreeReplay;
$("b-replay").onclick = () => { replayBtnUntil = 0; startFreeReplay(); };
const CAMS = { chase: "сзади", far: "дальняя", cockpit: "из кабины" };
function nextCam() { const k = Object.keys(CAMS); camMode = k[(k.indexOf(camMode) + 1) % k.length]; save.cam = camMode; persist(); syncDock(); showToast(`Вид: ${CAMS[camMode]}`, "", 1000); }
$("m-cam").onclick = nextCam; $("cam-btn").onclick = nextCam;
$("m-photo").onclick = () => {                     // «Фото» — то же, что качество «фото»; выключение возвращает прежнее качество
  if (save.quality === "photo") save.quality = save.qPrev && save.qPrev !== "photo" ? save.qPrev : "auto"; else { save.qPrev = save.quality || "auto"; save.quality = "photo"; showToast("Фото: облака, тени, отражения в Дону, подсветка моста ночью. Тяжелее для телефона", "", 2600); }
  persist(); setQuality(QUALS[save.quality][1]); syncDock();
};
$("m-sky").onclick = () => { const n = PHOTO.nextSky(); syncDock(); if (n) showToast(`Небо: ${n}`, "", 1000); };
$("m-time").onclick = () => { const k = ["sunset", "night", "day"]; setTime(k[(k.indexOf(TIME) + 1) % k.length]); syncDock(); showToast(`Время суток: ${TIMES[TIME].name}`, "", 1000); };
// наклон телефона: влево / вправо — руль, от себя — газ (в полёте — вперёд), на себя — тормоз. Положение при включении — ноль.
const tilt = { on: false, x: 0, y: 0, y0: null, seen: 0, src: "", tOri: 0 };
const dzt = (v, d) => Math.abs(v) < d ? 0 : Math.max(-1, Math.min(1, (v - Math.sign(v) * d) / (1 - d)));
const scrAngle = () => { const a = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0; return ((a % 360) + 360) % 360; };
function tiltSet(x, y, src) {                       // x — наклон вбок (вправо +, ~1 при 24°), y — от себя / на себя
  if (tilt.y0 == null || tilt.src !== src) tilt.y0 = y;
  tilt.src = src; tilt.x = dzt(x, .08); tilt.y = dzt(tilt.y0 - y, .12); tilt.seen++;
}
// основной источник — ориентация (углы), запасной — акселерометр с гравитацией: он есть почти на всех Android
addEventListener("deviceorientation", e => {
  if (!tilt.on || e.beta == null || e.gamma == null) return;
  const a = scrAngle(), x = a === 90 ? e.beta : a === 270 ? -e.beta : e.gamma, y = a === 90 ? -e.gamma : a === 270 ? e.gamma : e.beta;
  tilt.tOri = performance.now(); tiltSet(x / 24, y / 18, "ori");
});
addEventListener("devicemotion", e => {
  const g = e.accelerationIncludingGravity;
  if (!tilt.on || !g || g.x == null || performance.now() - tilt.tOri < 600) return;
  const k = /iPhone|iPad|iPod/.test(navigator.userAgent) ? -1 : 1, gx = k * g.x / 9.8, gy = k * g.y / 9.8, a = scrAngle();
  const x = a === 90 ? gy : a === 270 ? -gy : -gx, y = a === 90 ? gx : a === 270 ? -gx : gy;      // вправо вниз — руль вправо
  tiltSet(x / .4, y / .3, "acc");
});
async function setTilt(on) {
  if (on && typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
    try { if (await DeviceOrientationEvent.requestPermission() !== "granted") on = false; } catch (e) { on = false; }
    try { if (typeof DeviceMotionEvent !== "undefined" && DeviceMotionEvent.requestPermission) await DeviceMotionEvent.requestPermission(); } catch (e) {}
  }
  Object.assign(tilt, { on, x: 0, y: 0, y0: null, seen: 0, src: "" }); save.tilt = on; persist(); syncDock();
  if (!on) return;
  showToast("Наклон включён", "", 1200);
  setTimeout(() => { if (tilt.on && !tilt.seen) showToast("Датчик наклона молчит — откройте игру в браузере Chrome", "bad", 3000); }, 2500);
}
$("m-tilt").onclick = () => setTilt(!tilt.on);
$("m-assist").onclick = () => { save.assist = !save.assist; persist(); assistOn = save.assist && !(L && L.noAssist); syncDock(); };
$("m-restart").onclick = () => { closeDock(); restart(); };
let garageUntil = location.hash === "#garage" ? Infinity : 0;
$("m-garage").onclick = () => { closeDock(); garageUntil = performance.now() + 8000; showToast("Осмотр: 8 секунд", "", 1500); };
$("m-amb").onclick = () => { if (!SUV) return; save.amb = ((save.amb || 0) + 1) % 5; persist(); showToast(`Подсветка салона: ${SUV.amb(save.amb)} — видно из кабины`); syncDock(); };
$("m-veh").onclick = () => { if (!SUV) return; save.vehicle = SUV.on ? "vaz" : "suv"; persist(); SUV.select(save.vehicle === "suv"); syncDock(); showToast(SUV.on ? "Внедорожник · чёрный глянец, салон «слоновая кость»" : "ВАЗ-2108 «восьмёрка»", "good", 1800); };
$("m-paint").onclick = () => { save.paint = (paintIdx() + 1) % PAINTS.length; persist(); setPaint(save.paint); syncDock(); };
function restart() {
  if (mode === "free") { free.score = 0; startFree(false, free.pro); }
  else if (mode === "train") startTraining(di);
  else start(L.i);
}
let toastUntil = 0;
function showToast(text, kind = "", ms = 3000) {
  const t = $("toast"); t.textContent = text; t.className = "toast" + (kind ? " " + kind : ""); t.hidden = false;
  toastUntil = performance.now() + ms;
}
const mapC = $("map"), mg = mapC.getContext("2d");
// Ростов рисуем на карту один раз — в отдельный холст, 1 пиксель ≈ 1,3 м
const MAPS = .75, mapImg = (() => {
  const c = document.createElement("canvas"); c.width = Math.ceil((STRIP.x1 - STRIP.x0) * MAPS); c.height = Math.ceil((STRIP.z1 - STRIP.z0) * MAPS);
  const g = c.getContext("2d"); g.setTransform(MAPS, 0, 0, MAPS, -STRIP.x0 * MAPS, -STRIP.z0 * MAPS);
  g.fillStyle = "#ddd3bf"; g.fillRect(STRIP.x0, STRIP.z0, STRIP.x1 - STRIP.x0, STRIP.z1 - STRIP.z0);
  const poly = rings => { g.beginPath(); rings.forEach(r => r.forEach(([x, z], i) => i ? g.lineTo(x, z) : g.moveTo(x, z))); g.fill("evenodd"); };
  const AC = { c: "#d3c6ae", b: "#efdcaa", g: "#b5d29a", f: "#9cc483", s: "#a7cf8c", k: "#c4beb7" };
  OSM.a.forEach(([k, rs]) => { if (AC[k]) { g.fillStyle = AC[k]; poly(rs.map(dm)); } });
  g.fillStyle = "#86bddb"; WATER.forEach(w => poly(w.rings));
  g.lineCap = g.lineJoin = "round";
  [4, 3, 2, 1, 0].forEach(c => {
    g.strokeStyle = c === 4 ? "#f4efe5" : c >= 2 ? "#8b8790" : "#6c6875";
    ROADS.filter(r => r.c === c).forEach(r => { g.lineWidth = r.w; g.beginPath(); r.pts.forEach(([x, z], i) => i ? g.lineTo(x, z) : g.moveTo(x, z)); g.stroke(); });
  });
  g.fillStyle = "#6c6875"; DECKS.forEach(d => { g.beginPath(); [[d.s0, -1], [d.s1, -1], [d.s1, 1], [d.s0, 1]].forEach(([s, k], i) => { const l = d.lc + k * d.hw, x = d.cx + d.dx * s + d.nx * l, z = d.cz + d.dz * s + d.nz * l; i ? g.lineTo(x, z) : g.moveTo(x, z); }); g.fill(); });
  g.fillStyle = "#c39c7c"; OSM.b.forEach(([, k, rs]) => { g.fillStyle = k === 4 ? "#e4e5ea" : k === 1 ? "#a9b1bf" : "#c39c7c"; poly(rs.map(dm)); });
  g.fillStyle = "#3ddc84"; solids.forEach(b => { if (b.pad) { g.beginPath(); g.arc(b.pad.x, b.pad.z, 5, 0, Math.PI * 2); g.fill(); } });   // площадки «H»
  return c;
})();
// западная сцена на карте — свой холст (данные лёгкие, рисуем сразу; 1 пиксель — 2 м)
const westImg = WEST_BOX && (() => {
  const B = WEST_BOX, S = .5, c = document.createElement("canvas"); c.width = Math.ceil((B.x1 - B.x0) * S); c.height = Math.ceil((B.z1 - B.z0) * S);
  const g = c.getContext("2d"); g.setTransform(S, 0, 0, S, -B.x0 * S, -B.z0 * S); g.fillStyle = "#ddd3bf"; g.fillRect(B.x0, B.z0, B.x1 - B.x0, B.z1 - B.z0);
  const poly = rings => { g.beginPath(); rings.forEach(r => r.forEach(([x, z], i) => i ? g.lineTo(x, z) : g.moveTo(x, z))); g.fill("evenodd"); };
  const AC = { c: "#d3c6ae", b: "#efdcaa", g: "#b5d29a", f: "#9cc483", s: "#a7cf8c", k: "#c4beb7" };
  WEST.a.forEach(([k, rs]) => { if (AC[k]) { g.fillStyle = AC[k]; poly(rs.map(dm)); } });
  g.fillStyle = "#86bddb"; WATER.filter(w => w.west).forEach(w => poly(w.rings));
  g.lineCap = g.lineJoin = "round";
  [4, 3, 2, 1, 0].forEach(c => { g.strokeStyle = c === 4 ? "#f4efe5" : c >= 2 ? "#8b8790" : "#6c6875"; ROADS.filter(r => r.west && r.c === c).forEach(r => { g.lineWidth = r.w; g.beginPath(); r.pts.forEach(([x, z], i) => i ? g.lineTo(x, z) : g.moveTo(x, z)); g.stroke(); }); });
  g.strokeStyle = "#5b5560"; g.lineWidth = 6; WEST.lb.forEach(([, a]) => { const p = dm(a); g.beginPath(); p.forEach(([x, z], i) => i ? g.lineTo(x, z) : g.moveTo(x, z)); g.stroke(); });   // железнодорожный мост
  WEST.b.forEach(([, k, rs]) => { g.fillStyle = k === 1 ? "#a9b1bf" : "#c39c7c"; poly(rs.map(dm)); });
  return c;
})();
function paintWorld(g, px) {   // всё в метрах, px — сколько метров в одном пикселе
  g.drawImage(mapImg, STRIP.x0, STRIP.z0, STRIP.x1 - STRIP.x0, STRIP.z1 - STRIP.z0);
  if (westImg) g.drawImage(westImg, WEST_BOX.x0, WEST_BOX.z0, WEST_BOX.x1 - WEST_BOX.x0, WEST_BOX.z1 - WEST_BOX.z0);
  g.fillStyle = "#86bddb"; WATER.forEach(w => { if (w.outside) g.fillRect(w.x0, w.z0, w.x1 - w.x0, w.z1 - w.z0); });
  g.fillStyle = "#6c6679"; g.fillRect(-600, ZA - 18, 2000, 36);
  g.fillStyle = "#cfd3dc"; g.fillRect(-600, ZA - .6, 2000, 1.2); g.fillRect(-600, ZA - 18, 2000, Math.max(.8, px)); g.fillRect(-600, ZA + 17.2, 2000, Math.max(.8, px));
  g.fillStyle = "#6a6271"; g.fillRect(295, -35, 330, 100); g.fillRect(625, -35, 130, 100); g.fillRect(846, -6, 8, 170);
  g.strokeStyle = "#6a6271"; g.lineWidth = 10; [EIGHT.ax, EIGHT.bx].forEach(cx => { g.beginPath(); g.arc(cx, EIGHT.z, EIGHT.r, 0, Math.PI * 2); g.stroke(); });
  g.fillStyle = "#5a5463"; g.fillRect(-20, -5, 320, 10);
  g.fillStyle = "#9fe3ff"; g.fillRect(RS, -1.6, RL, 3.2);
  g.fillStyle = "#e0a83a"; solids.forEach(b => { if (b.name === "автобус") g.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0); });
  kickers.forEach(k => {
    g.save(); g.translate(k.x, k.z); g.rotate(-k.yaw); g.fillStyle = "#ffb347"; g.fillRect(0, -k.w / 2, k.len, k.w); g.restore();
  });
}
const arenaB = bboxOf(dm(OSM.b.find(b => b[1] === 4)?.[2][0] || [0, 0])), zoneC = n => { const z = ZONES.find(z => z.name === n); return z ? [(z.x0 + z.x1) / 2, (z.z0 + z.z1) / 2] : [0, 0]; };
const PLACES = [["Богатяновка", -150, -300], ["Дон", 140, -800], ["Ростов Арена", -150, (arenaB.z0 + arenaB.z1) / 2], ["Акватория", -150, zoneC("Акватория")[1]],
  ["Трюк-парк", 330, 90], ["Полигон", -10, 30], ["Автобан", -560, ZA - 26], ["Восьмёрка", 930, EIGHT.z + 80]];
if (RAILB) PLACES.push(["Ж/д мост", RAILB.C.x + 60, RAILB.C.z + 40]);
function drawMap() {
  const W = mapC.width, H = mapC.height, sc = Math.min(W / (WORLD.x1 - WORLD.x0 + 40), H / (WORLD.z1 - WORLD.z0 + 40));
  mg.setTransform(1, 0, 0, 1, 0, 0); mg.fillStyle = "#1a1626"; mg.fillRect(0, 0, W, H);
  mg.setTransform(sc, 0, 0, sc, (20 - WORLD.x0) * sc, (20 - WORLD.z0) * sc);
  paintWorld(mg, 1 / sc);
  mg.setTransform(1, 0, 0, 1, 0, 0);
  mg.fillStyle = "#e8ecf5"; mg.strokeStyle = "#1a1626"; mg.lineWidth = 4; mg.font = "bold 15px Golos Text, sans-serif";
  PLACES.forEach(([t, x, z]) => { mg.strokeText(t, (x - WORLD.x0 + 20) * sc, (z - WORLD.z0 + 20) * sc); mg.fillText(t, (x - WORLD.x0 + 20) * sc, (z - WORLD.z0 + 20) * sc); });
  mg.font = "11px Golos Text, sans-serif"; mg.fillText("© участники OpenStreetMap", 6, H - 6);
  const cx = (car.x - WORLD.x0 + 20) * sc, cz = (car.z - WORLD.z0 + 20) * sc;
  mg.save(); mg.translate(cx, cz); mg.rotate(-car.yaw);
  mg.fillStyle = "#ff6b5e"; mg.strokeStyle = "#fff"; mg.lineWidth = 2;
  mg.beginPath(); mg.moveTo(13, 0); mg.lineTo(-8, -8); mg.lineTo(-4, 0); mg.lineTo(-8, 8); mg.closePath(); mg.fill(); mg.stroke();
  mg.restore();
}
// мини-карта: всегда «нос вверх», радиус ~140 м
const mini = $("mini"), mn = mini.getContext("2d");
function zoneName(x, z) {
  if (Math.abs(z - ZA) < 19) return "Автобан";
  if (x > 290 && x < 755 && z > -36 && z < 66) return "Трюк-парк";
  if (Math.abs(x - 850) < 8 && z > -24 && z < 165) return "Трамплин через автобан";
  if (x > EIGHT.ax - EIGHT.r - 10 && x < EIGHT.bx + EIGHT.r + 10 && Math.abs(z - EIGHT.z) < EIGHT.r + 10) return "Восьмёрка";
  if (x > -25 && x < 300 && z > -40 && z < 40) return "Полигон";
  { const dk = deckAt(x, z, 99); if (dk) return dk.d.name; }
  if (inStrip(x, z)) return placeName(x, z);
  if (waterAt(x, z)) return "Дон";
  return "Пустырь";
}
const isSand = (x, z) => !inStrip(x, z) && Math.abs(z - ZA) > 19 && !(x > -25 && x < 755 && z > -40 && z < 66);
let zoneAt = 0;
function drawMini() {
  const W = mini.width, R = W / 2, sc = R / 140;
  mn.setTransform(1, 0, 0, 1, 0, 0); mn.fillStyle = "#3a2d2a"; mn.fillRect(0, 0, W, W);
  mn.setTransform(1, 0, 0, 1, R, R); mn.rotate(car.yaw - Math.PI / 2); mn.scale(sc, sc); mn.translate(-car.x, -car.z);
  paintWorld(mn, 1 / sc);
  mn.setTransform(1, 0, 0, 1, R, R);
  mn.fillStyle = "#ff6b5e"; mn.strokeStyle = "#fff"; mn.lineWidth = 3;
  mn.beginPath(); mn.moveTo(0, -16); mn.lineTo(11, 12); mn.lineTo(0, 6); mn.lineTo(-11, 12); mn.closePath(); mn.fill(); mn.stroke();
  // стрелки-указатели к местам за краем мини-карты
  mn.font = "bold 20px Golos Text, sans-serif"; mn.textAlign = "center"; mn.textBaseline = "middle";
  [["Т", 460, 15, "#ffb347"], ["Р", 280, -290, "#e8ecf5"], ["П", 70, 0, "#9fe3ff"], ...DECKS.map(d => ["М", d.cx, d.cz, "#6fdc8c"]), ["8", 1010, EIGHT.z, "#ffb347"]].forEach(([t, x, z, c]) => {
    const dx = x - car.x, dz = z - car.z; if (Math.hypot(dx, dz) < 130) return;
    const ang = Math.atan2(dz, dx) + (car.yaw - Math.PI / 2);
    mn.fillStyle = c; mn.fillText(t, Math.cos(ang) * (R - 16), Math.sin(ang) * (R - 16));
  });
  if (Math.abs(time - zoneAt) > .25) { zoneAt = time; $("zone").textContent = zoneName(car.x, car.z); }   // поиск улицы — 4 раза в секунду
}
const GO = [["Арена · баннер", START.x, START.z, START.yaw], ["Автобан", SPAWN.x, SPAWN.z, 0], ["Трюк-парк", 296, 0, 0], ["Полигон · штопор", 15, 0, 0],
  ["Богатяновка", ...roadPoint("улица Седова")], ["Набережная", ...roadPoint("Береговая улица")],
  ["Ростов Арена", ...roadPoint("улица Бориса Слюсаря")], ["Левобережная", ...roadPoint("Левобережная улица")],
  ["«Восьмёрка»", 1010, EIGHT.z + 8, -Math.PI / 2], ["Трамплин через автобан", 850, 150, Math.PI / 2],
  ...(ARENA ? [["Трасса у Арены", ARENA.gates[0].x, ARENA.gates[0].z, Math.atan2(-ARENA.gates[0].tz, ARENA.gates[0].tx)]] : []),
  ...(ARENA && ARENA.megas.length ? [["Мега-трамплин к Арене", ARENA.megas[0].x - Math.cos(ARENA.megas[0].yaw) * Math.min(ARENA.megas[0].run - 5, 75), ARENA.megas[0].z + Math.sin(ARENA.megas[0].yaw) * Math.min(ARENA.megas[0].run - 5, 75), ARENA.megas[0].yaw]] : []),
  ...(RAILB ? [["Железнодорожный мост", RAILB.at(-RAILB.RAMP - 30, 0).x, RAILB.at(-RAILB.RAMP - 30, 0).z, RAILB.yaw]] : []),
  ...(INNER ? [["Внутри Арены: аэротруба и поток", INNER.pad.x - 26, INNER.pad.z, 0]] : []),
  ...DECKS.map(d => { const s = d.dz < 0 ? d.s0 - 30 : d.s1 + 30, k = d.dz < 0 ? 1 : -1;     // с правого берега (север, +z) — на мост
    return [d.name, d.cx + d.dx * s + d.nx * d.lc, d.cz + d.dz * s + d.nz * d.lc, Math.atan2(-d.dz * k, d.dx * k)]; })];
$("m-go").innerHTML = GO.map(([n], i) => `<button type="button" data-g="${i}">${n}</button>`).join("");
$("m-go").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const [n, x, z, yaw] = GO[+b.dataset.g];
  if (mode !== "free") startFree(false, false);
  free.proA = null;
  car.x = x; car.z = z; car.yaw = yaw; tickScenes(true); car.y = surfaceH(x, z); car.v = 0; car.vy = 0; car.roll = car.om = car.pitch = 0;   // сцену там — достроить сразу
  free.air = false; free.wall = null; free.aero = null; free.tube = null; free.lap = null; free.safe = { x, z, yaw, y: car.y }; phase = "free"; camPos.set(x - 9, car.y + 3.2, z);
  zoneAt = -1; closeDock(); showToast(`${n}. Джойстик вверх — поехали`, "good", 2500);
});
