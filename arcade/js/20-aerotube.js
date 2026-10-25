// «Восьмёрка Баклажан» — аэротруба, горка-труба и «Баклажановый поток» внутри Арены.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- аэротруба и трубы внутри Арены ---------- */
// Аэротруба: магниты держат машину над чашей, газ не кончается. Газ / тормоз — вперёд / назад, руль — поворот,
// ПРЫГ — вверх; отпустили — машина медленно опускается. Опустились низко в стороне от «888» — магниты отпускают.
// Вылетели выше крыши за край проёма — садитесь на крышу.
function aeroStart(fromTube) {
  free.aero = { alt: Math.max(car.y + 6, 12), vf: fromTube ? Math.min(24, Math.abs(car.v)) : 0, t: 0 };
  free.air = false; car.vy = fromTube ? 4 : 7; car.om = 0; car.roll = 0; car.vl = 0; car.bodyRoll = car.bodyPitch = 0;
  sfx.burst(); queueToast("Аэротруба «888»", "good", 1500);
}
function stepAero(dt) {
  const a = free.aero, A = ARENA, th = thr(), bk = brk(), st = turn();
  gas = 100; a.t += dt;
  car.yaw -= st * 1.9 * dt;
  a.vf += ((th - bk * .8) * 24 - a.vf) * Math.min(1, dt * 1.4);
  if (input.hop || free.hopReq) a.alt = Math.min(75, a.alt + 10 * dt); else a.alt = Math.max(1.2, a.alt - 3 * dt);
  free.hopReq = false;
  car.vy += ((a.alt - car.y) * 2.2 - car.vy) * Math.min(1, dt * 2.5);
  let nx = car.x + Math.cos(car.yaw) * a.vf * dt, nz = car.z - Math.sin(car.yaw) * a.vf * dt, ny = car.y + car.vy * dt;
  const r = A.ray(nx, nz), k = r.L / r.D;
  if (ny > A.H + 2 && k > A.KR + .03) {             // вылетели над крышей — магниты отпускают
    car.x = nx; car.z = nz; car.y = ny; car.v = Math.min(a.vf, 12); free.aero = null; car.roll = 0;   // медленно — чтобы сесть на крышу, а не перелететь
    const vy = car.vy; takeoff(false); car.vy = Math.max(vy, 2); queueToast("Из аэротрубы — на крышу!", "good", 1800); return;
  }
  const lim = ny > A.H + 2 ? 9 : .56;               // ниже края крыши магниты не выпускают из чаши
  if (k > lim) { nx = A.C[0] + r.ux * lim * r.D; nz = A.C[1] + r.uz * lim * r.D; a.vf *= Math.pow(.15, dt); }
  const floor = (A.bowl(nx, nz)?.h || 0) + .4;
  if (ny < floor) { ny = floor; car.vy = Math.max(0, car.vy); }
  car.x = nx; car.z = nz; car.y = ny; car.v = a.vf;
  car.roll += (st * 28 - car.roll) * Math.min(1, dt * 4);
  car.pitch += (-(th - bk) * .12 + car.vy * .012 - car.pitch) * Math.min(1, dt * 4);
  if (car.y > A.H + 6) completeMission("aero");
  // сжатый воздух во все четыре стороны
  if (Math.random() < .7) {
    const i = Math.floor(Math.random() * 4), ang = car.yaw + i * Math.PI / 2, dx = Math.cos(ang), dz = -Math.sin(ang);
    puff(new T.Vector3(car.x + dx * 1.9, car.y + .5, car.z + dz * 1.9), new T.Vector3(dx * 7, -5, dz * 7), .35, .25);
  }
  const dPad = Math.hypot(car.x - INNER.pad.x, car.z - INNER.pad.z);
  if (a.alt <= 1.3 && car.y < floor + 1.4 && dPad > 8 && a.t > 1.5) {
    free.aero = null; car.roll = 0; car.v = a.vf; takeoff(false); car.vy = 0; queueToast("Магниты отпустили", "", 1500);
  }
}
// Трубы: машина едет по стенке трубы. Газ — быстрее, тормоз — медленнее, руль — по кругу стенки (полный круг — бочка).
// Горка кончается на поле; из потока выход — ПРЫГ (в аэрополёт) или сам после 5 кругов: разогнался до 216 км/ч — катапульта над крышей.
const tubeV = { r: new T.Vector3() }, FLOW_LAPS = 5, FLOW_FAST = 60;
function tubeStart(path, lift) {
  const s0 = lift ? path.nearest(car.x, car.y, car.z) : 0;
  free.tube = { path, s: s0, v: Math.max(path.flow ? 30 : 14, Math.abs(car.v)), th: 0, spin: 0, laps: 0, dist: 0, f: new T.Vector3(1, 0, 0), n: new T.Vector3(0, 1, 0),
    lift: lift ? { t: 0, x: car.x, y: car.y, z: car.z } : null };
  free.air = false; car.vy = 0; car.roll = 0; car.om = 0; car.vl = 0; car.bodyRoll = car.bodyPitch = 0;
  sfx.burst(); queueToast(path.flow ? "Баклажановый поток 🍆" : "Горка-труба", "good", 1500);
}
function stepTube(dt) {
  const t = free.tube, P = t.path, th = thr(), bk = brk(), st = turn();
  gas = Math.min(100, gas + 20 * dt);
  let q = P.at(t.s);
  if (t.lift) {                                     // магниты поднимают машину со знака в трубу
    t.lift.t += dt / 1.3; const e = smooth(Math.min(1, t.lift.t)), b = q.p.clone().addScaledVector(q.U, -P.R);
    car.x = t.lift.x + (b.x - t.lift.x) * e; car.y = t.lift.y + (b.y - t.lift.y) * e; car.z = t.lift.z + (b.z - t.lift.z) * e;
    car.yaw = Math.atan2(-q.T.z, q.T.x); car.v = 0; t.f.copy(q.T); t.n.copy(q.U);
    if (Math.random() < .5) puff(new T.Vector3(car.x, car.y, car.z), new T.Vector3(0, -3, 0), .5, .35);
    if (t.lift.t >= 1) t.lift = null;
    return;
  }
  if (P.flow) t.v = Math.max(18, Math.min(85, t.v + (th * 16 - bk * 24 + (40 - t.v) * .3) * dt));
  else t.v = Math.max(10, Math.min(60, t.v + (-G * q.T.y * .8 + th * 5 - bk * 14) * dt));
  t.s += t.v * dt; t.dist += t.v * dt;
  if (P.closed && t.s >= P.len) {
    t.s -= P.len; t.laps++; free.score += 300; save.freeBest = Math.max(save.freeBest, free.score); persist();
    if (t.laps >= 3) completeMission("flow3");
    if (t.laps >= FLOW_LAPS) return flowFinale();
    queueToast(t.laps === FLOW_LAPS - 1 ? "Последний круг — разгоняйтесь: чем быстрее, тем выше и дальше катапульта!" : `Круг в потоке ${t.laps}  +300`, "good", 1800);
  }
  if (!P.closed && t.s >= P.len - .2) return tubeExit();
  q = P.at(t.s);
  // куда «стекает» машина: тяжесть плюс центробежная сила; руль уводит по стенке
  const k = P.curv(t.s), v2 = t.v * t.v, ax = -v2 * k.x, ay = -G - v2 * k.y, az = -v2 * k.z;
  const want = Math.atan2(ax * q.S.x + ay * q.S.y + az * q.S.z, -(ax * q.U.x + ay * q.U.y + az * q.U.z));
  if (Math.abs(st) > .05) { t.th += st * 3.4 * dt; t.spin += st * 3.4 * dt; }
  else t.th += Math.atan2(Math.sin(want - t.th), Math.cos(want - t.th)) * Math.min(1, dt * 2.5);
  if (Math.abs(t.spin) >= Math.PI * 2) {
    t.spin -= Math.sign(t.spin) * Math.PI * 2; free.score += 400; save.freeBest = Math.max(save.freeBest, free.score); persist();
    queueToast("Бочка в трубе  +400", "good", 1300); sfx.ring();
  }
  const r = tubeV.r.copy(q.U).multiplyScalar(-Math.cos(t.th)).addScaledVector(q.S, Math.sin(t.th));
  car.x = q.p.x + r.x * P.R; car.y = q.p.y + r.y * P.R; car.z = q.p.z + r.z * P.R; car.v = t.v;
  car.yaw = Math.atan2(-q.T.z, q.T.x); car.pitch = Math.asin(q.T.y); car.roll = t.th / DEG;
  t.f.copy(q.T); t.n.copy(r).negate();
  if (Math.random() < .25) puff(new T.Vector3(car.x, car.y, car.z).addScaledVector(t.n, .4).addScaledVector(q.T, -2), q.T.clone().multiplyScalar(-4), .4, .2);
  const jump = (input.hop || free.hopReq) && !free.hopLock; free.hopReq = false;
  if (!input.hop) free.hopLock = false;
  if (P.flow && jump) {                              // из потока — в аэрополёт посреди чаши
    free.hopLock = true; tubeScore(); free.tube = null;
    car.x = q.p.x; car.y = q.p.y; car.z = q.p.z; car.roll = 0; car.pitch = 0; car.v = t.v; aeroStart(true);
  }
}
// финал потока — «Баклажановая катапульта», всегда: чем быстрее разогнались в потоке, тем выше и дальше (апогей ~70…120 м,
// посадка в 90…200 м за стеной Арены). Направление — где внизу земля, а не Дон и не дом. В полёте — тройная бочка
// (помощник выравнивания на это время выключен, к посадке доворачивает до целого оборота), камера облетает машину панорамой,
// у земли баклажановая подушка плавно гасит падение
function flowFinale() {
  const t = free.tube, A = ARENA, k = Math.max(0, Math.min(1, (t.v - 30) / 55)), fast = t.v >= FLOW_FAST;
  tubeScore(); free.tube = null; free.hopLock = true; car.roll = 0; car.pitch = 0;
  const y0 = car.y, apex = A.H + 40 + 50 * k, dist0 = 90 + 110 * k;
  const r0 = A.ray(car.x, car.z), base = Math.atan2(r0.uz, r0.ux);
  let pick = null;
  for (const j of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 8, -8, 10, -10, 12, -12, 15]) {
    const a = base + j * 12 * DEG, ux = Math.cos(a), uz = Math.sin(a), wall = A.ray(A.C[0] + ux, A.C[1] + uz).D;
    const toWall = wall - ((car.x - A.C[0]) * ux + (car.z - A.C[1]) * uz);
    for (const dist of [dist0, dist0 * .75, dist0 * .55]) {
      const lx = car.x + ux * (toWall + dist), lz = car.z + uz * (toWall + dist);
      if (lx < WORLD.x0 + 20 || lx > WORLD.x1 - 20 || lz < WORLD.z0 + 20 || lz > WORLD.z1 - 20) continue;
      let bad = false;                                    // свободно в радиусе ~28 м: точка посадки «гуляет» на 10–20 м
      for (let dx = -28; dx <= 28 && !bad; dx += 7) for (let dz = -28; dz <= 28 && !bad; dz += 7) bad = !!(hitSolid(lx + dx, lz + dz, 3) || waterAt(lx + dx, lz + dz));
      if (bad) continue;
      pick = { ux, uz, d: toWall + dist, toWall }; break;
    }
    if (pick) break;
  }
  if (!pick) pick = { ux: r0.ux, uz: r0.uz, d: r0.D - r0.L + 60, toWall: r0.D - r0.L };
  if (location.hash === "#test") window.__cat = { ...pick, from: [car.x, car.z], to: [car.x + pick.ux * pick.d, car.z + pick.uz * pick.d] };
  const vy = Math.sqrt(2 * G * Math.max(1, apex - y0)), tf = (vy + Math.sqrt(vy * vy + 2 * G * Math.max(0, y0))) / G, v = pick.d / tf;
  car.yaw = Math.atan2(-pick.uz, pick.ux); car.v = v; car.vy = vy;
  takeoff(false); gas = 100; car.om = 1080 / (tf * .9);
  free.cat = { until: time + tf * .82, t0: time, end: time + tf + 1, a0: car.yaw + Math.PI * .75 };
  const pts = Math.round(1500 + 1500 * k); free.score += pts; save.freeBest = Math.max(save.freeBest, free.score); persist();
  if (fast) completeMission("flowShot");
  queueToast(`Баклажановая катапульта! Тройная бочка над городом  +${pts}`, "good", 2800); sfx.burst(); sfx.whoosh();
  for (let i = 0; i < 40; i++) puff(new T.Vector3(car.x, car.y, car.z), new T.Vector3((Math.random() - .5) * 14, -5 - Math.random() * 8, (Math.random() - .5) * 14), 1.1, .5);
  SHOW.salute(car.x, car.y + 6, car.z, 4); PARTY.start(true);   // в полёте катапульты — без замедления и облёта: там своя панорама
}
function tubeScore() {
  const t = free.tube, pts = Math.round(t.dist);
  if (pts < 20) return;
  free.score += pts; save.freeBest = Math.max(save.freeBest, free.score); persist();
  queueToast(`${t.path.flow ? "Баклажановый поток" : "Горка-труба"}: ${Math.round(t.dist)} м  +${pts}`, "good", 2000);
}
function tubeExit() {                               // конец горки — на поле
  const t = free.tube, q = t.path.at(t.path.len - .2);
  tubeScore(); free.tube = null; completeMission("slide");
  car.x = q.p.x; car.z = q.p.z; car.y = groundAt(car.x, car.z).h;
  car.yaw = Math.atan2(-q.T.z, q.T.x); car.v = t.v; car.roll = 0; car.pitch = 0; car.om = 0; free.air = false; sfx.whoosh();
}
