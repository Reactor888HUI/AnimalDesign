// «Восьмёрка Баклажан» — состояние, физика полигона.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- состояние ---------- */
let L, row = [], car, gas, phase = "free", tPhase = 0, landing, totalRoll = 0, time = 0, result, assistOn = true, camMode = ["chase", "far", "cockpit"].includes(save.cam) ? save.cam : "chase";
let mode = "free", di = 0, zoneMesh = null, flashT = 0, flashMsg = "", briefPhase = "run", briefTimer = null;
let rec = [], simT = 0, replay = null;
let free = { score: 0, air: false, airT: 0, cork: false, ringBonus: 0, safe: { ...SPAWN }, safeT: 0, gh: 0, hopLock: false };
const input = { thrust: false, rl: false, rr: false, brake: false, hop: false };

function freshCar() {
  car = { x: 0, y: 0, z: 0, yaw: 0, v: 0, vx: 0, vy: 0, roll: 0, om: 0, pitch: 0, spin: 0, floor: 0 };
  gas = 100; tPhase = 0; landing = null; totalRoll = 0; result = null; rec = []; simT = 0; replay = null; free.gh = 0;
  if (zoneMesh) { scene.remove(zoneMesh); zoneMesh = null; }
}
function zone(y0, y1) {
  const geo = new T.BoxGeometry(14, y1 - y0, 7);
  zoneMesh = new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0x6fdc8c, transparent: true, opacity: .14, depthWrite: false }));
  zoneMesh.add(new T.LineSegments(new T.EdgesGeometry(geo), new T.LineBasicMaterial({ color: 0x6fdc8c })));
  zoneMesh.position.set(car.x, (y0 + y1) / 2, 0); scene.add(zoneMesh);
}
function reset(li) {
  L = LEVELS[li]; L.i = li; buildLevel();
  freshCar();
  assistOn = save.assist && !L.noAssist;
  phase = "run";
}
const rollErr = r => ((r % 360) + 540) % 360 - 180;
const timeToGround = (gh = 0) => { const h = Math.max(0, car.y - gh); return (car.vy + Math.sqrt(Math.max(0, car.vy * car.vy + 2 * G * h))) / G; };
const nozzle = (lx, ly) => new T.Vector3(lx, ly, 0).applyEuler(carObj.rotation).add(carObj.position);

/* ---------- физика полигона (уровни и уроки) ---------- */
function step(dt) {
  if (phase !== "air") { BURST.ready = true; BURST.t = 0; }
  time += dt; tPhase += dt; simT += dt; flashT = Math.max(0, flashT - dt);
  if (mode === "train") gas = 100;
  if (phase === "run") {
    car.v = Math.max(0, Math.min(VMAX, car.v + (thr() > .05 ? ACC * thr() : -DRAG) * dt));
    car.x += car.v * dt; car.y = 0; car.pitch = 0;
    if (mode === "train" && di === 0) car.x = Math.min(car.x, RS - 15);
    if (car.x >= RS) { phase = "ramp"; tPhase = 0; }
  } else if (phase === "ramp") {
    const t = (car.x - RS) / RL, ang = Math.atan(2 * RH * t / RL);
    car.v -= G * Math.sin(ang) * dt;
    if (car.v <= .5) return crash("Не хватило скорости, чтобы выехать с рампы. Держите ГАЗ до самой рампы.");
    car.x += car.v * Math.cos(ang) * dt;
    const t2 = Math.min(1, (car.x - RS) / RL);
    car.y = rampY(t2); car.pitch = ang; car.roll = 180 * smooth(t2);
    if (car.x >= RX) {
      const a = Math.atan(2 * RH / RL);
      car.vx = car.v * Math.cos(a); car.vy = car.v * Math.sin(a);
      car.roll = 180; car.om = 180 / timeToGround();
      phase = "air"; tPhase = 0;
    }
  } else if (phase === "air") {
    let w = L.wind || 0;
    if (L.gust) w *= .6 + .4 * Math.sin(time * 1.7) + .3 * Math.sin(time * 4.3);
    car.vx = Math.max(2, car.vx + w * dt);
    car.vy -= G * dt;
    airControls(dt, L.invert);
    landingReserve(dt, 0);
    car.x += car.vx * dt; car.y += car.vy * dt;
    car.pitch += (Math.atan2(car.vy, car.vx) * .35 - car.pitch) * Math.min(1, dt * 4);
    for (const c of row) if (car.x + HALF > c.x0 && car.x - HALF < c.x1 && car.y <= c.h)
      return crash(`Посадка на крышу машины в ряду (${c.n}). Держите ГАЗ в воздухе, чтобы лететь дальше.`);
    if (car.y <= 0) land();
  } else if (phase === "drill") {
    const d = DRILLS[di];
    if (d.noGrav) car.vy = 0; else car.vy -= G * dt;
    if (thr() > .05) cushion(dt, thr());
    const r = turn();
    if (Math.abs(r) > .05) sideJet(r, dt);
    if (d.noGrav) car.om *= Math.pow(.5, dt);
    car.roll += car.om * dt;
    car.x += car.vx * dt; car.y += car.vy * dt;
    if (zoneMesh) zoneMesh.position.x = car.x;
    if (car.y <= 0) d.ground ? d.ground.call(d) : (car.y = 0, car.vy = 0);
    if (d.tick) d.p = d.tick.call(d, dt);
  } else if (phase === "roll") {
    car.vx = Math.max(0, car.vx - 9 * dt); car.x += car.vx * dt;
    car.pitch *= .9;
    if (car.vx <= 0) { phase = "done"; showResult(); }
  } else if (phase === "crash") {
    tumble(dt);
    if (tPhase > 1.5 && !result) showResult();
  }
}
function cushion(dt, k = 1) {
  sfx.jet();
  car.vy += (car.vy < -1 ? G + 9 : G * .8) * dt * Math.min(1, k * 1.25);
  if (Math.random() < .6) puff(nozzle(0, -.5), new T.Vector3(0, -7, 0), .7, .35);
}
// Посадочный запас: отдельный баллон сжатого воздуха на одну посадку за прыжок. Срабатывает сам у земли,
// даже если основной газ кончился: гасит падение до мягких 4 м/с и держит так до касания, ставит машину на колёса (если крен не больше 120°)
// и выпускает облака пара. Запас снова готов, как только машина коснулась земли.
const BURST = { ready: true, t: 0, used: 0 }, BURST_BRAKE = 40, BURST_V = 4;   // торможение баллона, м/с², и скорость касания, м/с
function landingReserve(dt, gh) {
  const h = car.y - gh, upright = Math.round(car.roll / 360) * 360;
  if (BURST.t > 0) {
    BURST.t -= dt;
    car.vy = car.vy < -BURST_V ? Math.min(-BURST_V, car.vy + (BURST_BRAKE + G) * dt) : -BURST_V;   // тормозим, потом держим 4 м/с
    if (Math.abs(car.roll - upright) < 120) { car.roll += (upright - car.roll) * Math.min(1, dt * 7); car.om *= Math.pow(.02, dt); }
    if (Math.random() < .35) puff(nozzle((Math.random() - .5) * 3, -.5), new T.Vector3((Math.random() - .5) * 5, -4, (Math.random() - .5) * 5), 1.1, .5);
    return;
  }
  if (!BURST.ready || car.vy > -6.5 || h < .05) return;
  // включаемся на высоте, где баллону как раз хватит пути погасить скорость (+ 0,8 м запаса)
  if (h <= (car.vy * car.vy - BURST_V * BURST_V) / (2 * BURST_BRAKE) + .8) {
    BURST.ready = false; BURST.t = 4; BURST.used++; sfx.burst();
    for (let i = 0; i < 20; i++) {                 // кольцо пара во все стороны
      const a = i / 20 * Math.PI * 2;
      puff(new T.Vector3(car.x, Math.max(gh + .4, car.y - .3), car.z), new T.Vector3(Math.cos(a) * 10, -1.5 + Math.random() * 2, Math.sin(a) * 10), 1.3, .6);
    }
  }
}
function sideJet(r, dt) {
  sfx.jet();
  car.om += r * 260 * dt;
  if (Math.random() < .5) puff(nozzle(0, .2), new T.Vector3(0, 0, r * 5).applyAxisAngle(new T.Vector3(0, 1, 0), car.yaw), .4, .25);
}
function airControls(dt, invert) {
  if (thr() > .05 && gas > 0) { cushion(dt, thr()); gas -= 20 * dt * Math.min(1, thr() * 1.25); }
  let r = turn();
  if (invert) r = -r;
  if (Math.abs(r) > .05 && gas > 0) { sideJet(r, dt); gas -= 5 * Math.abs(r) * dt; }
  else if (assistOn && !(free.cat && time < free.cat.until)) {   // во время катапульты бочку не гасим
    const target = Math.ceil((car.roll - 10) / 360) * 360;
    const want = (target - car.roll) / Math.max(.3, timeToGround(mode === "free" ? free.gh : 0));
    car.om += (want - car.om) * Math.min(1, dt * 2.5);
  }
  gas = Math.max(0, gas);
  car.roll += car.om * dt; totalRoll += Math.abs(car.om * dt);
}
function tumble(dt) {
  car.vx *= Math.pow(.2, dt); car.v *= Math.pow(.2, dt); car.vy -= G * dt;
  const fwd = mode === "free" ? car.v : car.vx;
  car.x += Math.cos(car.yaw) * fwd * dt; car.z -= Math.sin(car.yaw) * fwd * dt;
  if (mode === "free") { const yN = car.y + car.vy * dt, g = groundAt(car.x, car.z, Math.max(car.y, yN) + .3); car.floor = g.h; }   // кувырок после аварии падает на то, что под машиной: настил, пролёт, проход, а не сквозь мост
  car.y = Math.max(car.floor, car.y + car.vy * dt);
  if (car.y === car.floor) car.vy = Math.abs(car.vy) * .3;
  car.roll += car.spin * dt; car.spin *= Math.pow(.4, dt);
}
function land() {
  const err = Math.abs(rollErr(car.roll)), vImp = -car.vy;
  if (car.x < row[0].x0) return crash("Недолёт: машина села перед рядом. Держите ГАЗ на разгоне до самой рампы и в воздухе.");
  const q = err <= CLEAN_ROLL && vImp <= CLEAN_V ? "clean" : err <= HARD_ROLL && vImp <= HARD_V ? "hard" : null;
  if (!q) {
    let why = err > 110 ? "Посадка на крышу." : err > HARD_ROLL ? `Посадка на бок, крен ${Math.round(err)}°.` : `Слишком жёстко: ${vImp.toFixed(1)} м/с.`;
    why += err > HARD_ROLL ? " Смотрите на прибор крена: колёса должны смотреть на зелёную линию." : " Держите ГАЗ перед землёй.";
    return crash(why);
  }
  dust(car.x, 0, 0, 10); sfx.thump(Math.min(1, vImp / 14));
  landing = { x: car.x, err, vImp, q };
  car.y = 0; car.vy = 0; car.roll = 0; car.om = 0;
  phase = "roll"; tPhase = 0;
}
function crash(reason) {
  sfx.crash();
  phase = "crash"; tPhase = 0;
  const on = row.find(c => car.x + HALF > c.x0 && car.x - HALF < c.x1);
  car.floor = car.y > 0 && on ? on.h : 0;
  car.vy = Math.abs(car.vy || 4) * .25; car.spin = 400 * (Math.random() < .5 ? -1 : 1);
  dust(car.x, car.y, car.z, 16);
  result = null; landing = { fail: reason };
}

