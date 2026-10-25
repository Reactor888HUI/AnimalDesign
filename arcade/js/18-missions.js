// «Восьмёрка Баклажан» — задания свободной езды.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- задания свободной езды ---------- */
const MISSIONS = [
  { id: "bus", t: "Перепрыгни автобусы в трюк-парке", pts: 500 },
  { id: "barrel2", t: "Две бочки за один прыжок", pts: 800 },
  { id: "rings3", t: "Три кольца подряд без аварий", pts: 600 },
  { id: "autobahn", t: "Автобан от старта до финиша за 30 с", pts: 700 },
  { id: "roof", t: "Сядь на площадку «H» на крыше в Ростове", pts: 900 },
  { id: "overpass", t: "Перелети автобан с трамплина", pts: 600 },
  { id: "eight", t: "Круг по «Восьмёрке» за 40 с", pts: 800 },
  { id: "bridge", t: "Переедь Дон по Ворошиловскому мосту из конца в конец", pts: 300 },
  { id: "wall", t: "Проедь 300 м по стене Арены на присосках", pts: 1000 },
  { id: "arenaLap", t: "Круг вокруг Ростов Арены быстрее 45 с", pts: 800 },
  { id: "arenaRoof", t: "Запрыгните на крышу Ростов Арены с мега-трамплина", pts: 600 },
  { id: "arenaJump", t: "С крыши Арены — с трамплина над главным входом, с бочкой", pts: 900 },
  { id: "aero", t: "Аэротруба «888»: поднимитесь выше крыши Арены", pts: 500 },
  { id: "slide", t: "Горка-труба: с крыши Арены до поля", pts: 500 },
  { id: "flow3", t: "Баклажановый поток: три круга", pts: 700 },
  { id: "flowShot", t: "Катапульта: 5 кругов в потоке быстрее 216 км/ч", pts: 1000 },
  { id: "eightShow", t: "Дрифт-трек 888: 3 круга, от 3000 очков", pts: 900 },
  { id: "slalom", t: "Аэро-слалом: восемь колец вокруг аэротрубы по порядку", pts: 800 },
  { id: "innerWin", t: "Гран-при Арены: выиграй гонку в 3 круга против трёх соперников", pts: 1200 },
  { id: "innerLap", t: "Гран-при Арены: круг быстрее 11 с", pts: 700 },
  // испытания ж/д моста
  { id: "rbArch", t: "Ж/д мост: по верхнему поясу арки — через колесо на вершине", pts: 500, rb: 1 },
  { id: "rbRails", t: "Ж/д мост: разгон по голубым рельсам и прыжок со «ступеньки» на пролёт", pts: 600, rb: 1 },
  { id: "rbTwo", t: "Ж/д мост: 3 секунды «на двух колёсах» — по перилам или поясу арки", pts: 500, rb: 1 },
  { id: "rbRailGap", t: "Ж/д мост: перила — прыжок через разрыв на балку", pts: 700, rb: 1 },
  { id: "rbLift", t: "Ж/д мост: подняться на «лифте» и вылететь в колесо", pts: 800, rb: 1 },
  { id: "rbTrain", t: "Ж/д мост: 10 секунд на крыше поезда", pts: 700, rb: 1 },
  { id: "rbBarge", t: "Ж/д мост: с моста — на палубу судна", pts: 900, rb: 1 },
  { id: "rbWheels", t: "Ж/д мост: все 11 колёс паровоза", pts: 1000, rb: 1 },
  { id: "rbTrainJump", t: "Ж/д мост: через кольцо-перекидку — прыжок на крышу поезда", pts: 800, rb: 1 },
  { id: "rbJet", t: "Ж/д мост: с колеса на вершине арки — реактивный бросок на поднятый пролёт", pts: 900, rb: 1 },
  { id: "rbOver", t: "Ж/д мост: поверху через весь мост — пояс северной арки, пролёт, пояс южной", pts: 900, rb: 1 }
];
const rbDone = () => MISSIONS.filter(m => m.rb && save.missions && save.missions[m.id]).length, rbAll = () => MISSIONS.filter(m => m.rb).length;
const toastQ = [];
function queueToast(text, kind, ms) { if (performance.now() > toastUntil) showToast(text, kind, ms); else toastQ.push([text, kind, ms]); }
function completeMission(id, extra = "") {
  if (window.TRAINER_) TRAINER_.done(id);            // тренажёр: испытание пройдено (и повторно) — траектория гаснет
  if (!save.missions) save.missions = {};
  if (save.missions[id]) return;
  const m = MISSIONS.find(m => m.id === id);
  save.missions[id] = true; free.score += m.pts; save.freeBest = Math.max(save.freeBest, free.score); persist();
  toastQ.push([`Задание выполнено: ${m.t}${extra}  +${m.pts}`, "good", 3200]); sfx.ring();
  if (m.rb) toastQ.push([rbDone() === rbAll() ? "Все испытания ж/д моста пройдены!" : `Испытания ж/д моста: ${rbDone()} из ${rbAll()}`, "good", 2200]);
}
// проверки, которые не привязаны к прыжку: заезд по автобану, мост, круг по «Восьмёрке»
function slalomTick() {          // аэро-слалом: кольца по порядку, время — вверху экрана
  const G = INNER.gates, S = free.slalom, near = i => Math.hypot(car.x - G[i].x, car.y + .6 - G[i].y, car.z - G[i].z) < 4.6;
  const paint = n => G.forEach((g, i) => g.m.material.color.setHex(i < n ? 0x6fdc8c : i === n ? 0xffe14d : 0x5a3b8a));
  if (!S) { if (near(0)) { free.slalom = { n: 1, t0: time }; paint(1); sfx.ring(); queueToast("Аэро-слалом", "good", 1300); } else if (!G.painted) { paint(0); G.painted = true; } return; }
  if (time - S.t0 > 90) { free.slalom = null; paint(0); queueToast("Слалом: время вышло", "", 1500); return; }
  if (!near(S.n)) return;
  S.n++; sfx.ring(); paint(S.n);
  if (S.n < G.length) return;
  const t = time - S.t0, pts = Math.max(300, Math.round(1500 - t * 40)); free.slalom = null; setTimeout(() => paint(0), 1500);
  free.score += pts; save.slalomBest = Math.min(save.slalomBest || 1e9, t); save.freeBest = Math.max(save.freeBest, free.score); persist();
  queueToast(`Аэро-слалом за ${t.toFixed(1)} с  +${pts}`, "good", 2600); completeMission("slalom");
}
// ---------- шоу «Восьмёрка»: 3 круга; очки за езду по трассе (множитель растёт, пока не съезжаешь) и за дрифт;
// закрутило (занос больше ~46°) или авария — все очки шоу сгорают; в конце — итог, рекорд, фейерверк и рёв трибун
const SHOW_LAPS = 3, SHOW_SPIN = .8, SHOW_DRIFT = .23;   // углы заноса, рад: дрифт от ~13°, срыв от ~46°
function onEightTrack(x, z) { return Math.min(Math.abs(Math.hypot(x - EIGHT.ax, z - EIGHT.z) - EIGHT.r), Math.abs(Math.hypot(x - EIGHT.bx, z - EIGHT.z) - EIGHT.r)) < EIGHT.hw + .6; }
function showBurn(why) {
  const s = free.show; if (!s) return;
  const lost = Math.round(s.clean + s.drift); s.clean = s.drift = 0; s.mult = 1; s.onT = 0; s.spins++;
  queueToast(`${why}! Очки шоу сгорели${lost ? ` (−${lost})` : ""}`, "bad", 2200);
}
function spinOut() {        // закрутило: машина крутится на месте, скорость гаснет
  free.spinT = .9; free.spinDir = Math.sign(car.vl || 1); car.v *= .35; car.vl = 0; sfx.crash(); dust(car.x, car.y, car.z, 10);
  showBurn("Закрутило");
}
function showCard(html, ms = 7000) {
  const el = $("showcard"); el.innerHTML = html; el.hidden = false; el.style.opacity = 1; requestAnimationFrame(() => el.classList.add("on"));
  clearTimeout(showCard.t); showCard.t = setTimeout(() => { el.style.opacity = 0; el.classList.remove("on"); setTimeout(() => { el.hidden = true; }, 450); }, ms);
}
function showFinish() {
  const s = free.show, total = Math.round(s.clean + s.drift), prev = save.eightShowBest || 0, rec = total > prev;
  free.show = null; free.showCd = time + 6; free.score += total; save.freeBest = Math.max(save.freeBest, free.score); if (rec) save.eightShowBest = total; persist();
  const stars = total >= 6000 ? 3 : total >= 3500 ? 2 : total >= 1500 ? 1 : 0;
  if (total >= 3000) completeMission("eightShow");
  showCard(`<div class="t">ДРИФТ-ТРЕК 888 · ${SHOW_LAPS} КРУГА</div><div class="big">${total.toLocaleString("ru")}</div>` +
    `<div class="row"><span>Чистая езда</span><b>${Math.round(s.clean).toLocaleString("ru")}</b></div><div class="row"><span>Дрифт</span><b>${Math.round(s.drift).toLocaleString("ru")}</b></div>` +
    `<div class="row"><span>Срывов</span><b>${s.spins}</b></div><div class="stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</div>` +
    (rec ? `<div class="rec">Новый рекорд! Было ${prev.toLocaleString("ru")}</div>` : `<div class="row"><span>Рекорд</span><b>${prev.toLocaleString("ru")}</b></div>`) +
    (save.badge888 ? "" : `<div class="rec">Награда: золотой номер «888»</div>`));
  SHOW.fireworks(stars * 5 + 6); sfx.cheer(1.2); PARTY.start();
  if (!save.badge888) { save.badge888 = true; persist(); applyLook(); queueToast("Награда: золотой номер «888» на крыше и дверях!", "good", 3200); }
  SHOW.drawBoard([`ИТОГ ${total.toLocaleString("ru")}  ${"★".repeat(stars)}`, `чисто ${Math.round(s.clean)} · дрифт ${Math.round(s.drift)}`, `рекорд ${(save.eightShowBest || 0).toLocaleString("ru")}`], true);
}
function eightShow() {
  const s = free.show, dt = Math.min(.1, Math.max(0, time - (free.showT ?? time))); free.showT = time;
  const near = (x, z) => Math.hypot(car.x - x, car.z - z) < 9;
  const hit = near(1010, EIGHT.z) ? "x" : near(EIGHT.ax - EIGHT.r, EIGHT.z) ? "a" : near(EIGHT.bx + EIGHT.r, EIGHT.z) ? "b" : null;
  if (!s) {
    if (hit === "x" && !free.air && Math.abs(car.v) > 5 && time > (free.showCd || 0)) {
      free.show = { lap: 0, seq: "x", last: "x", clean: 0, drift: 0, mult: 1, multShown: 1, onT: 0, offWarn: false, t0: time, spins: 0, boardT: 0 };
      queueToast(`Дрифт-трек 888: ${SHOW_LAPS} круга! Держи трассу, дрифтуй — не закрутись`, "good", 2600);
    }
    return;
  }
  if (Math.hypot(car.x - 1010, car.z - EIGHT.z) > 190 || time - s.t0 > 300) { free.show = null; queueToast("Шоу прервано — уехали с площадки", "bad", 2000); return; }
  if (hit && hit !== s.last) {      // круг: перекрёсток → дальние ворота одной петли → перекрёсток → другой → перекрёсток
    s.last = hit; s.seq = s.seq ? s.seq + hit : hit === "x" ? "x" : "";
    if (/^x[ab]x[ab]x$/.test(s.seq) && s.seq[1] !== s.seq[3]) {
      s.lap++; s.seq = "x"; sfx.cheer(.6);
      if (s.lap >= SHOW_LAPS) return showFinish();
      queueToast(`Круг ${s.lap} из ${SHOW_LAPS}!`, "good", 1500);
    } else if (!/^x([ab](x([ab]x?)?)?)?$/.test(s.seq)) s.seq = hit === "x" ? "x" : "";   // сбились с порядка ворот — круг заново, очки остаются
  }
  if ((s.boardT -= dt) <= 0) { s.boardT = .25; SHOW.drawBoard([`КРУГ ${Math.min(SHOW_LAPS, s.lap + 1)} / ${SHOW_LAPS}`, `ЧИСТО ${Math.round(s.clean)}  ×${s.mult}`, `ДРИФТ ${Math.round(s.drift)}`], s.mult >= 3); }
  if (phase !== "free" || free.air || free.spinT > 0) return;
  const v = Math.abs(car.v), slip = Math.atan2(Math.abs(car.vl || 0), v + .1);
  if (slip > SHOW_SPIN && Math.hypot(car.v, car.vl || 0) > 8) return spinOut();
  if (!onEightTrack(car.x, car.z)) {
    if (s.mult > 1 && !s.offWarn) queueToast("Вылет с трассы — множитель ×1", "bad", 1300);
    s.offWarn = true; s.mult = 1; s.multShown = 1; s.onT = 0; return;
  }
  s.offWarn = false;
  if (v < 5) return;
  s.onT += dt; s.mult = Math.min(5, 1 + Math.floor(s.onT / 5));
  if (slip > SHOW_DRIFT && v > 12) { s.drift += (12 + Math.abs(car.vl) * 4) * dt * s.mult; }
  else s.clean += v * dt * .5 * s.mult;
  if (s.mult > s.multShown) { s.multShown = s.mult; queueToast(`Держишь трассу — множитель ×${s.mult}`, "good", 1200); }
}
function missionTick() {
  if (INNER && phase === "free") slalomTick();
  if (mode === "free" && (phase === "free" || free.show)) eightShow();
  if (phase !== "free") return;
  // круг вокруг Арены: старт → все ворота по порядку в одну сторону → старт
  if (ARENA && !free.wall) {
    const G = ARENA.gates, gi = G.findIndex(g => Math.hypot(car.x - g.x, car.z - g.z) < 11), Lp = free.lap;
    if (Lp && time - Lp.t0 > 150) free.lap = null;
    if (gi >= 0 && !(Lp && gi === Lp.last)) {
      const fresh = () => gi === 0 ? { t0: time, last: 0, dir: 0, n: 0 } : null;
      if (!Lp) { free.lap = fresh(); if (free.lap) queueToast("Круг вокруг Арены: старт!", "", 1400); }
      else {
        if (!Lp.dir) Lp.dir = gi === 1 ? 1 : gi === G.length - 1 ? -1 : 0;
        if (Lp.dir && gi === (Lp.last + Lp.dir + G.length) % G.length) {
          Lp.last = gi; Lp.n++;
          if (gi === 0) {
            const t = time - Lp.t0; free.lap = null; save.arenaLap = Math.min(save.arenaLap || 1e9, t); persist();
            if (t <= 45) completeMission("arenaLap", ` (${t.toFixed(1)} с)`); else queueToast(`Круг за ${t.toFixed(1)} с — нужно быстрее 45 с`, "", 2400);
          }
        } else free.lap = fresh();          // сбились с порядка ворот — круг заново
      }
    }
  }
  if (Math.abs(car.z - ZA) > 18) free.ab = null;
  else if (!free.ab && car.x > -200 && car.x < -185 && car.v > 5) { free.ab = { t0: time }; queueToast("Заезд: время пошло", "", 1500); }
  else if (free.ab && car.x >= 1000) {
    const t = time - free.ab.t0; free.ab = null;
    if (t <= 30) completeMission("autobahn", ` (${t.toFixed(1)} с)`); else queueToast(`Автобан за ${t.toFixed(1)} с — нужно быстрее 30 с`, "bad", 2500);
  }
  {   // мост: въехали с одного конца настила и доехали до другого
    const dk = !free.air && deckAt(car.x, car.z, car.y + .5);
    if (dk) { const end = dk.s - dk.d.s0 < 40 ? 0 : dk.d.s1 - dk.s < 40 ? 1 : -1;
      if (end >= 0) { if (free.deckFrom && free.deckFrom.d === dk.d && free.deckFrom.end !== end) completeMission("bridge"); free.deckFrom = { d: dk.d, end }; } }
  }
  // «Восьмёрка»: перекрёсток → дальние ворота одной петли → перекрёсток → другой петли → перекрёсток
  const at = (x, z) => Math.hypot(car.x - x, car.z - z) < 9;
  const e = free.eight;
  const marks = [[1010, EIGHT.z, "x"], [EIGHT.ax - EIGHT.r, EIGHT.z, "a"], [EIGHT.bx + EIGHT.r, EIGHT.z, "b"]];
  const hit = marks.find(([x, z]) => at(x, z))?.[2];
  if (e && time - e.t0 > 60) free.eight = null;
  if (!hit || (e && e.last === hit)) return;
  if (!free.eight) { if (hit === "x") { free.eight = { t0: time, seq: "x", last: "x" }; queueToast("«Восьмёрка»: круг начался", "", 1500); } return; }
  e.seq += hit; e.last = hit;
  if (/^x[ab]x[ab]x$/.test(e.seq) && e.seq[1] !== e.seq[3]) {
    const t = time - e.t0; free.eight = null;
    if (t <= 40) completeMission("eight", ` (${t.toFixed(1)} с)`); else queueToast(`Круг за ${t.toFixed(1)} с — нужно быстрее 40 с`, "bad", 2500);
  } else if (!/^x([ab](x([ab]x?)?)?)?$/.test(e.seq)) free.eight = hit === "x" ? { t0: time, seq: "x", last: "x" } : null;
}

