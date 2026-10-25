// «Восьмёрка Баклажан» — управление, тренер, приборы.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- управление ---------- */
const joy = { id: null, x: 0, y: 0 }, JOY_R = 60;
const ctrl = () => save.ctrl || "joy";                       // joy | wheel | buttons
const joyMode = () => ctrl() !== "buttons";                 // любой сенсорный режим без кнопок
const wheel = { id: null, steer: 0, ox: 0 }, pedal = { id: null, gas: 0, brake: 0, oy: 0 };
// трек 888: управление двумя руками — левая половина экрана: дрифтовый руль (ведите пальцем влево-вправо, руль до ±120°),
// правая — педаль (газ, потянуть вниз — тормоз). Старый маленький руль и джойстик в зоне не появляются
const DRIFT_VIS = 120, dwheel = { ang: 0 };
const driftUI = () => mode === "free" && !!free.driftKit;
const driftHands = () => driftUI() && joyMode();
const dz = v => Math.abs(v) < .14 ? 0 : (v - Math.sign(v) * .14) / .86;
const thr = () => Math.max(input.thrust ? 1 : 0, dz(Math.max(0, joy.y)), pedal.gas, tilt.on ? Math.max(0, tilt.y) : 0);          // газ / подушка 0…1
const brk = () => Math.max(input.brake ? 1 : 0, dz(Math.max(0, -joy.y)), pedal.brake, tilt.on ? Math.max(0, -tilt.y) : 0);        // тормоз 0…1
const turn = () => Math.max(-1, Math.min(1, (input.rr ? 1 : 0) - (input.rl ? 1 : 0) + dz(joy.x) + wheel.steer + (tilt.on ? tilt.x : 0)));   // вправо +
let joyHintUntil = performance.now() + 7000;
stage.addEventListener("pointerdown", e => {
  if (!joyMode() || e.target.closest("button, .ov, .dock, .lesson")) return;
  const r = stage.getBoundingClientRect();
  if (driftHands()) {                                        // трек 888: левая рука — дрифтовый руль, правая — газ/тормоз
    joyHintUntil = 0;
    if (e.clientX - r.left < r.width / 2 && wheel.id === null) { wheel.id = e.pointerId; wheel.ox = e.clientX; }
    else if (e.clientX - r.left >= r.width / 2 && pedal.id === null) {
      pedal.id = e.pointerId; pedal.oy = e.clientY; pedal.gas = 1; pedal.brake = 0;
      const el = $("pedal"); el.style.left = `${e.clientX - r.left}px`; el.style.top = `${e.clientY - r.top}px`; el.hidden = false; el.textContent = "ГАЗ";
    } else return;
    stage.setPointerCapture?.(e.pointerId);
    return;
  }
  if (ctrl() === "wheel") {                                  // левая половина — руль, правая — педаль
    joyHintUntil = 0;
    if (e.clientX - r.left < r.width / 2 && wheel.id === null) {
      wheel.id = e.pointerId; wheel.ox = e.clientX;
      const el = $("wheel"); el.style.left = `${e.clientX - r.left}px`; el.style.top = `${e.clientY - r.top}px`; el.hidden = false;
    } else if (e.clientX - r.left >= r.width / 2 && pedal.id === null) {
      pedal.id = e.pointerId; pedal.oy = e.clientY; pedal.gas = 1; pedal.brake = 0;
      const el = $("pedal"); el.style.left = `${e.clientX - r.left}px`; el.style.top = `${e.clientY - r.top}px`; el.hidden = false; el.textContent = "ГАЗ";
    } else return;
    stage.setPointerCapture?.(e.pointerId);
    return;
  }
  if (joy.id !== null) return;
  joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joyHintUntil = 0;
  const el = $("joy"); el.style.left = `${e.clientX - r.left}px`; el.style.top = `${e.clientY - r.top}px`; el.hidden = false;
  stage.setPointerCapture?.(e.pointerId);
});
stage.addEventListener("pointermove", e => {
  if (e.pointerId === wheel.id) {
    wheel.steer = Math.max(-1, Math.min(1, (e.clientX - wheel.ox) / 70));
    if (!driftHands()) $("wheel").style.transform = `rotate(${wheel.steer * 100}deg)`;   // на треке 888 крутится дрифтовый руль
    return;
  }
  if (e.pointerId === pedal.id) {
    const dy = e.clientY - pedal.oy;                          // потянули вниз — тормоз, вверх или на месте — газ
    pedal.brake = dy > 28 ? Math.min(1, (dy - 28) / 50) : 0; pedal.gas = pedal.brake ? 0 : 1;
    $("pedal").textContent = pedal.brake ? "ТОРМОЗ" : "ГАЗ"; $("pedal").classList.toggle("brake", !!pedal.brake);
    return;
  }
  if (e.pointerId !== joy.id) return;
  let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const d = Math.hypot(dx, dy);
  if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
  joy.x = dx / JOY_R; joy.y = -dy / JOY_R;
  $("joy-knob").style.transform = `translate(${dx}px, ${dy}px)`;
});
const joyEnd = e => {
  if (e.pointerId === wheel.id) { wheel.id = null; wheel.steer = 0; $("wheel").hidden = true; $("wheel").style.transform = ""; return; }
  if (e.pointerId === pedal.id) { pedal.id = null; pedal.gas = pedal.brake = 0; $("pedal").hidden = true; $("pedal").classList.remove("brake"); return; }
  if (e.pointerId !== joy.id) return;
  joy.id = null; joy.x = joy.y = 0; $("joy").hidden = true; $("joy-knob").style.transform = "";
};
["pointerup", "pointercancel", "lostpointercapture"].forEach(ev => stage.addEventListener(ev, joyEnd));
$("m-ctrl").onclick = () => {
  const order = ["joy", "wheel", "buttons"]; save.ctrl = order[(order.indexOf(ctrl()) + 1) % order.length];
  persist(); syncDock(); setHintText(); joyHintUntil = joyMode() ? performance.now() + 5000 : 0;
};
function setHintText() {
  $("joy-hint").innerHTML = ctrl() === "wheel"
    ? "<b>Левая половина экрана</b> — руль: ведите пальцем влево и вправо.<br><b>Правая половина</b> — газ, потяните вниз — тормоз.<br>В воздухе руль крутит машину, газ держит подушку."
    : "Коснитесь экрана в любом месте и ведите пальцем:<br><b>вверх</b> — газ, <b>вниз</b> — тормоз, <b>влево / вправо</b> — руль.<br>В воздухе тот же джойстик крутит машину.";
}
const KEYS = { ArrowUp: "thrust", w: "thrust", "ц": "thrust", ArrowDown: "brake", s: "brake", "ы": "brake", ArrowLeft: "rl", a: "rl", "ф": "rl", ArrowRight: "rr", d: "rr", "в": "rr", " ": "hop" };
const keyOf = e => { let k = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key]; if (k === "hop" && mode !== "free") k = "thrust"; return k; };
addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.closest && e.target.closest("button")) return;
  const k = keyOf(e);
  if (k) { input[k] = true; e.preventDefault(); return; }
  const key = e.key.toLowerCase();
  if (key === "r" || key === "к") restart();
  if (key === "c" || key === "с") $("m-cam").click();
  if (key === "n" || key === "т") $("m-time").click();
  if (key === "m" || key === "ь") openMenu();
  if (e.key === "Escape") { closeDock(); $("ov-menu").hidden = true; }
});
addEventListener("keyup", e => { const k = keyOf(e); if (k) input[k] = false; if (e.key === " ") input.hop = input.thrust = false; });
addEventListener("blur", () => { for (const k in input) input[k] = false; });
function hold(id, key) {
  const el = $(id);
  el.addEventListener("pointerdown", e => { e.preventDefault(); input[key] = true; el.classList.add("on"); el.setPointerCapture?.(e.pointerId); });
  const off = () => { input[key] = false; el.classList.remove("on"); };
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(ev => el.addEventListener(ev, off));
  el.addEventListener("contextmenu", e => e.preventDefault());
}
hold("b-thrust", "thrust"); hold("b-left", "rl"); hold("b-right", "rr"); hold("b-brake", "brake"); hold("b-hop", "hop");
$("b-hop").addEventListener("pointerdown", () => { free.hopReq = true; });   // короткий тап тоже прыгает

/* ---------- тренер и приборы ---------- */
function coachHint() {
  if (phase === "run") return car.x < RS - 2 ? { t: "Держите ГАЗ до рампы", k: "thrust" } : null;
  if (phase !== "air") return null;
  const pe = rollErr(car.roll + car.om * timeToGround());
  if (Math.abs(pe) > 15 && !assistOn) return pe > 0 ? { t: "Перекручивает — жмите ◀", k: "rl" } : { t: "Недокручивает — жмите ▶", k: "rr" };
  if (car.vy < 0 && car.x + car.vx * timeToGround() < row[row.length - 1].x1 + HALF) return { t: "Не долетаете — держите ГАЗ", k: "thrust" };
  if (car.y < 8 && -car.vy > CLEAN_V - 2) return { t: "Земля близко — держите ГАЗ", k: "thrust" };
  return { t: "Летим ровно", k: null };
}
const btnFor = { thrust: $("b-thrust"), rl: $("b-left"), rr: $("b-right") };
let lastHint = "", lastCoach = "", coachSince = 0, lastGasShown = -1;
// трек 888: на площадке «Восьмёрки» — дрифтовый руль, широкая резина и дрифтовые диски; уехал — всё как было
function driftKitTick(dt) {
  const want = mode === "free" && !free.pro && !replay && Math.abs(car.x - 1010) < 140 && Math.abs(car.z - EIGHT.z) < 95;
  if (want !== !!free.driftKit) {
    free.driftKit = want; applyLook(); dwheel.ang = 0;
    if (want) queueToast(joyMode() ? "Трек 888: левая рука — руль (влево-вправо), правая — газ, вниз — тормоз" : "Трек 888: широкая резина и дрифтовые диски — держат лучше", "good", 3000);
    if (joy.id !== null) { joy.id = null; joy.x = joy.y = 0; $("joy").hidden = true; }   // джойстик, если держали, отпускаем — в зоне управление двумя руками
  }
  const el = $("dwheel"), show = driftUI();
  if (el.hidden === show) el.hidden = !show;
  if (!show) return;
  dwheel.ang += (turn() * DRIFT_VIS - dwheel.ang) * Math.min(1, dt * 14);      // руль показывает поворот — быстро, без оборотов
  el.firstElementChild.style.transform = `rotate(${dwheel.ang.toFixed(1)}deg)`;
}
const speedFx = { el: null, o: 0, a: 0 };
function speedLines() {          // от ~140 км/ч; в потоке и в катапульте — сильнее, в PRO и потоке — баклажановые
  const el = speedFx.el || (speedFx.el = $("speedfx")); if (!el) return;
  const v = mode !== "free" || replay ? 0 : free.tube ? free.tube.v : free.cat ? 60 : Math.hypot(car.v, free.air ? car.vy : 0);
  const o = Math.max(0, Math.min(.75, (v - 38) / 40));
  if (Math.abs(o - speedFx.o) > .02) { speedFx.o = o; el.style.opacity = o.toFixed(2); }
  if (o > 0) { speedFx.a = (speedFx.a + 2.3) % 9; el.style.transform = `rotate(${speedFx.a.toFixed(1)}deg)`; }   // лучи «бегут»
  el.classList.toggle("pro", !!(free.pro || free.tube));
}
function ui() {
  const now = performance.now(); speedLines();
  const inAir = phase === "air" || phase === "ramp" || phase === "drill" || phase === "fcork" || (mode === "free" && free.air);
  const speed = mode === "free" ? Math.abs(car.v) : phase === "run" || phase === "ramp" ? car.v : Math.hypot(car.vx, phase === "air" ? car.vy : 0);
  $("h-speed").textContent = Math.round(speed * 3.6);
  $("h-alt").textContent = inAir ? `высота ${Math.max(0, car.y - (mode === "free" ? free.gh : 0)).toFixed(1)} м` : "";
  if (Math.round(gas) !== lastGasShown) { $("h-gas").style.width = `${gas}%`; $("h-gas").style.background = gas > 25 ? "var(--gas)" : "var(--bad)"; lastGasShown = Math.round(gas); }
  $("h-top").textContent = replay ? "" : mode === "free" ? (free.show ? `888 · круг ${Math.min(SHOW_LAPS, free.show.lap + 1)}/${SHOW_LAPS} · чисто ${Math.round(free.show.clean)} ×${free.show.mult} · дрифт ${Math.round(free.show.drift)}` : free.tube && free.tube.path.flow ? `Поток · круг ${Math.min(FLOW_LAPS, free.tube.laps + 1)}/${FLOW_LAPS} · ${Math.round(free.tube.v * 3.6)} км/ч${free.tube.v >= FLOW_FAST ? " 🚀" : ""} · ПРЫГ — выход` : free.slalom ? `Слалом ${(time - free.slalom.t0).toFixed(1)} с · кольцо ${free.slalom.n + 1}/8` : free.lap ? `Круг ${(time - free.lap.t0).toFixed(1)} с · ворота ${free.lap.n}/${ARENA.gates.length}` : `${free.pro ? "PRO ∞ · " : ""}Очки ${free.score}`) : mode === "train" ? "" : `${L.i + 1}. ${L.name}`;
  const freeGround = mode === "free" && !free.air;
  const jm = joyMode();
  $("b-left").hidden = $("b-right").hidden = $("b-thrust").hidden = jm;
  $("b-brake").hidden = jm || mode !== "free";
  $("b-hop").hidden = mode !== "free";
  $("b-hop").classList.toggle("hop-big", jm);
  $("joy-hint").hidden = mode === "free" || !jm || now > joyHintUntil || !$("dock-panel").hidden || !$("ov-menu").hidden || !$("ov-brief").hidden || !$("ov-res").hidden;
  $("l-sub").textContent = $("r-sub").textContent = freeGround ? "руль" : "крутить";
  $("thrust-sub").textContent = (mode === "free" ? !free.air : phase === "run" || (phase === "brief" && briefPhase === "run")) ? "разгон" : "подушка";
  $("h-air").classList.toggle("off", !inAir);
  if (inAir) {
    const err = rollErr(car.roll);
    $("d-car").setAttribute("transform", `rotate(${err.toFixed(1)})`);
    const pe = (phase === "air" || free.air) ? rollErr(car.roll + car.om * timeToGround(mode === "free" ? free.gh : 0)) : err;
    $("d-ghost").setAttribute("transform", `rotate(${pe.toFixed(1)})`);
    $("d-arrow").textContent = Math.abs(car.om) > 25 ? (car.om > 0 ? "↻" : "↺") : "";
    const ae = Math.abs(err);
    $("d-cap").textContent = `крен ${Math.round(ae)}°`;
    $("d-cap").style.color = ae <= CLEAN_ROLL ? "var(--ok)" : ae <= HARD_ROLL ? "var(--amber)" : "var(--bad)";
    const vs = -car.vy;
    $("h-fall").textContent = vs > 0 ? `падение ${vs.toFixed(0)} м/с` : "";
    $("h-fall").style.color = vs > HARD_V ? "var(--bad)" : vs > CLEAN_V ? "var(--amber)" : "var(--ok)";
  }
  let c = null;
  if (mode === "train") {
    const d = DRILLS[di];
    if (phase !== "brief" && phase !== "lesson-done" && $("ov-res").hidden) c = { t: "", k: di === DRILLS.length - 1 ? (coachHint() || {}).k : (d.hint ? d.hint.call(d) : null) };
  } else if (mode === "level" && L.coach && $("ov-res").hidden && $("ov-menu").hidden && !replay) c = coachHint();
  // в свободной езде подсказок на экране нет — всё в «⋯» → «Как играть»
  const JOYTXT = ctrl() === "wheel" ? { thrust: "Правая половина — газ", rl: "Руль влево", rr: "Руль вправо" } : { thrust: "Джойстик вверх — газ", rl: "Джойстик влево", rr: "Джойстик вправо" };
  const hk = c ? c.k : null;
  let ct = c ? c.t : "";
  if (jm && hk && !ct) ct = JOYTXT[hk];
  if (jm && ct && ctrl() === "joy") ct = ct.replace("жмите ◀", "джойстик влево").replace("жмите ▶", "джойстик вправо").replace("держите ГАЗ", "джойстик вверх").replace("Держите ГАЗ", "Джойстик вверх");
  if (jm && ct && ctrl() === "wheel") ct = ct.replace("жмите ◀", "руль влево").replace("жмите ▶", "руль вправо");
  if (hk !== lastHint) { Object.entries(btnFor).forEach(([k, el]) => el.classList.toggle("hint", k === hk)); lastHint = hk; }
  if (ct !== lastCoach) { lastCoach = ct; coachSince = now; $("coach").textContent = ct; }
  $("coach").hidden = !ct || now - coachSince > 3000;
  if (now > toastUntil && toastQ.length) showToast(...toastQ.shift());
  $("toast").classList.toggle("moving", mode === "free" && (Math.abs(car.v) > 3 || free.air || !!free.aero || !!free.tube || !!free.wall));
  if (!$("toast").hidden && now > toastUntil) $("toast").hidden = true;
  $("b-replay").hidden = !(mode === "free" && !replay && now < replayBtnUntil && free.bestRec);
  if (!$("dock-panel").hidden) { if (now > dockCloseAt) closeDock(); else { drawMap(); syncDock(); } }
  const showMini = mode === "free" && save.mini !== false && !replay;
  $("mini-wrap").hidden = !showMini;
  if (showMini) drawMini();
}

