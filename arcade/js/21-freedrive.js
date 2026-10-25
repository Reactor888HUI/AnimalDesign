// «Восьмёрка Баклажан» — свободная езда: шаг физики stepFree, взлёт и посадка, авария и возврат, утопление.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
function respawn() {
  free.wall = null; free.aero = null; free.tube = null;
  car.x = free.safe.x; car.z = free.safe.z; car.yaw = free.safe.yaw; car.y = groundAt(car.x, car.z, (RAILB && RAILB.onLift(car.x, car.z) ? RAILB.Y0 + RAILB.st.y : free.safe.y ?? -1) + .5).h;   // на той высоте, где была точка: на мосту — на настил, а не под него; на подъёмном пролёте — туда, где он сейчас
  car.v = 0; car.vy = 0; car.vl = 0; car.spin = 0; car.roll = 0; car.om = 0; car.pitch = 0; car.bodyRoll = car.bodyPitch = car.slopeRoll = 0; free.air = false; phase = "free";
  free.driftT = 0; free.grace = 2;                                   // боковая скорость заноса тоже в ноль, 2 с без аварий — не биться об ту же стену по кругу
  camPos.set(car.x - Math.cos(car.yaw) * 8, car.y + 3, car.z + Math.sin(car.yaw) * 8);   // камера сразу за машиной (не тянется из-под воды)
}
function sink(w) {                           // заехали или упали в воду: машина тонет, камера уходит под воду
  free.ringStreak = 0; free.ab = null;
  const name = ZONES.find(z => inPoly(car.x, car.z, z.ring) && /Дон|канал|Акватор|Темерник|ковш/.test(z.name))?.name || "Дон";
  splash(car.x, car.z);
  for (let i = 0; i < 26; i++) { const a = Math.random() * 6.3, r = Math.random() * 2.5; puff(new T.Vector3(car.x + Math.cos(a) * r, .4, car.z + Math.sin(a) * r), new T.Vector3(Math.cos(a) * 3, 9 + Math.random() * 9, Math.sin(a) * 3), 1.6, .45 + Math.random() * .3, 13); }   // столб брызг
  sfx.thump(1); sfx.whoosh(); sfx.glug(); sfx.stall(); sfx.broken(12);   // вытащат на берег — мотор после воды ещё долго чихает
  phase = "fsink"; tPhase = 0; free.air = false; car.vy = Math.min(-1.5, car.vy * .15); car.v *= .35; car.spin = 0;
  showToast(`Утонули: ${name}. Сейчас вытащим на берег`, "bad", 2600);
}
function sinkStep(dt) {                     // под водой: медленно вниз, нос клюёт, покачивание, пузыри
  car.vy += (-1.7 - car.vy) * Math.min(1, dt * 1.5); car.y = Math.max(-7.2, car.y + car.vy * dt);
  car.v *= Math.pow(.35, dt); car.x += Math.cos(car.yaw) * car.v * dt; car.z -= Math.sin(car.yaw) * car.v * dt;
  car.pitch += (-.45 - car.pitch) * Math.min(1, dt * 1.2); car.roll += Math.sin(tPhase * 2.3) * 14 * dt;
  if (Math.random() < .55) puff(new T.Vector3(car.x + (Math.random() - .5) * 2.2, car.y + .9, car.z + (Math.random() - .5) * 2.2), new T.Vector3(0, 2.2, 0), 2.4, .14 + Math.random() * .14, -2.5);
}
function freeCrash(reason) {
  if (free.show) showBurn("Авария");
  sfx.crash(); sfx.stall(); sfx.broken(8); free.ringStreak = 0; free.ab = null;
  phase = "fcrash"; tPhase = 0; free.air = false;
  car.floor = groundAt(car.x, car.z, car.y + .3).h; car.vy = Math.abs(car.vy || 3) * .3; car.spin = 360 * (Math.random() < .5 ? -1 : 1);
  dust(car.x, car.y, car.z, 16);
  showToast(reason, "bad", 2600);
}
function takeoff(cork) {
  free.onBeam = 0; car.vl = 0; car.bodyRoll = car.bodyPitch = 0; car.slopeRoll = 0;
  const ok = kickers.find(k => k.id === "overpass");
  free.fromOverpass = !!ok && Math.hypot(car.x - (ok.x + ok.fx * ok.len), car.z - (ok.z + ok.fz * ok.len)) < 6;
  const kEnd = (k, r) => Math.hypot(car.x - (k.x + k.fx * k.len), car.z - (k.z + k.fz * k.len)) < r;
  free.fromRoof = !!ARENA && car.y > ARENA.H && kEnd(ARENA.roofKick, 6);      // трамплин на крыше над главным входом
  free.fromMega = !!ARENA && ARENA.megas.some(m => kEnd(m.k, 7));
  if (free.fromMega && car.v > 12) {
    // мега-трамплин — катапульта: подбирает дугу так, чтобы сесть на крышу; быстрее разгон — дальше по крыше
    const A = ARENA, r = A.ray(car.x, car.z), f = .25 + .5 * Math.max(0, Math.min(1, (car.v - 18) / 18));
    const dist = (r.L - r.D) + (1 - A.KR) * r.D * f, vy = Math.max(car.vy, Math.sqrt(2 * G * (A.H + 9 - car.y)));
    const T = (vy + Math.sqrt(vy * vy - 2 * G * (A.H - car.y))) / G;
    car.vy = vy; car.v = dist / T;
  }
  free.overBus = false; free.takeoffT = time; free.steel = 0;
  free.fromRB = RAILB && RAILB.st.loaded && KINO.near(car.x, car.z) && car.y > 4;   // взлёт с ж/д моста (для испытаний)
  free.air = true; free.airT = 0; free.cork = cork; free.ringBonus = 0; totalRoll = 0;
  rings.forEach(r => { r.got = false; r.m.material.color.setHex(0xffb347); });
  phase = "free";
}
function stepFree(dt) {
  time += dt; tPhase += dt;
  if (phase === "fcrash") { tumble(dt); if (tPhase > 1.6) respawn(); return; }
  if (phase === "fsink") { sinkStep(dt); if (tPhase > 3.6) { respawn(); showToast("Вытащили на берег. Обсохли — поехали", "", 1800); } return; }
  if (phase === "fcork") {   // штопор полигона
    const t = (car.x - RS) / RL, ang = Math.atan(2 * RH * t / RL);
    car.v -= G * Math.sin(ang) * dt;
    if (car.v <= .5) { car.x = RS - 3; car.v = 0; car.y = 0; car.roll = 0; car.pitch = 0; phase = "free"; showToast("Не хватило скорости на штопор", "bad"); return; }
    car.x += car.v * Math.cos(ang) * dt;
    const t2 = Math.min(1, (car.x - RS) / RL);
    car.y = rampY(t2); car.pitch = ang; car.roll = 180 * smooth(t2);
    if (car.x >= RX) {
      const a = Math.atan(2 * RH / RL);
      car.vy = car.v * Math.sin(a); car.v = car.v * Math.cos(a);
      car.roll = 180; car.om = 180 / timeToGround();
      takeoff(true);
    }
    return;
  }
  if (free.pro) gas = 100;                          // PRO: баллоны не кончаются
  if (free.wall) return stepWall(dt);
  if (free.aero) return stepAero(dt);
  if (free.tube) return stepTube(dt);
  if (INNER) {                                      // знаки на поле и вход в горку на крыше
    const d8 = Math.hypot(car.x - INNER.pad.x, car.z - INNER.pad.z), dE = Math.hypot(car.x - INNER.padE.x, car.z - INNER.padE.z);
    if (d8 > 9 && dE > 9) free.aeroLock = false;
    if (!free.aeroLock && d8 < INNER.pad.r && car.y < 60) { free.aeroLock = true; return aeroStart(false); }
    if (!free.aeroLock && dE < INNER.padE.r && car.y < 3) { free.aeroLock = true; return tubeStart(INNER.flow, true); }
    const m = INNER.slide.frame(0);
    if (car.y > ARENA.H - 1 && car.y < ARENA.H + 3 && Math.hypot(car.x - m.p.x, car.z - m.p.z) < INNER.slide.R + .6 &&
      Math.cos(car.yaw) * m.T.x - Math.sin(car.yaw) * m.T.z > .2) return tubeStart(INNER.slide, false);
  }
  if (!free.air) {
    BURST.ready = true; BURST.t = 0;
    if (free.pro) proBoost(false);
    const th = thr(), bk = brk();
    if (th) car.v += 10 * th * (1 - .7 * Math.max(0, car.v) / VMAXF) * dt;
    if (bk) car.v = car.v > .5 ? car.v - 16 * bk * dt : Math.max(-9 * bk, car.v - 5 * bk * dt);
    if (!th && !bk) car.v -= Math.sign(car.v) * Math.min(Math.abs(car.v), (1.2 + car.v * car.v * .0006) * dt);
    car.v = Math.max(-9, Math.min(VMAXF, car.v));
    if (free.spinT > 0) {                          // закрутило: вращение на месте, скорость гаснет
      free.spinT -= dt; car.yaw += free.spinDir * 11 * dt * Math.min(1, free.spinT / .5 + .25); car.v *= Math.pow(.15, dt); car.vl = 0;
      if (Math.random() < .4) [-1, 1].forEach(sd => puff(nozzle(-1.25, -.5).add(new T.Vector3(0, 0, sd * .7).applyAxisAngle(yUp, car.yaw)), new T.Vector3(0, 1, 0), .7, .3));
    }
    const steer = -turn();
    // упёрлись в стену на газу — машину всё равно можно немного довернуть, чтобы выехать вдоль неё
    const yawRate = steer * 2.1 * Math.min(1, Math.max(Math.abs(car.v) / 5, th * .3)) / (1 + Math.abs(car.v) / 20) * (car.v < -.5 ? -1 : 1);
    car.yaw += yawRate * dt;
    // занос: кузов поворачивает сразу, а скорость догоняет его настолько, насколько держат шины.
    // Тормоз на скорости в повороте срывает заднюю ось; на песке сцепление хуже.
    const sand = isSand(car.x, car.z);
    const grip = (bk > .4 && Math.abs(car.v) > 14 ? 5 : 19) * (sand ? .7 : 1) * (free.pro ? 1.45 : free.driftKit ? 1.3 : 1);   // PRO / широкая резина трека 888 на широких колёсах держит дорогу лучше; занос — только тормозом в повороте
    car.vl = (car.vl || 0) - car.v * yawRate * dt;
    car.vl -= Math.sign(car.vl) * Math.min(Math.abs(car.vl), grip * dt);
    if (Math.abs(car.vl) > 1) car.v -= Math.sign(car.v) * Math.abs(car.vl) * .12 * dt;
    // крен кузова в повороте и «клевок» при разгоне / торможении — только визуально
    const ay = Math.max(-14, Math.min(14, car.v * yawRate)), ax = (car.v - (free.vPrev ?? car.v)) / dt;
    free.vPrev = car.v;
    car.bodyRoll = (car.bodyRoll || 0) + ((free.onBeam ? -free.onBeam * 30 : ay * .45) - (car.bodyRoll || 0)) * Math.min(1, dt * 6);
    car.bodyPitch = (car.bodyPitch || 0) + (Math.max(-5, Math.min(4, ax * .35)) - (car.bodyPitch || 0)) * Math.min(1, dt * 5);
    // очки за занос
    if (Math.abs(car.vl) > 4 && Math.abs(car.v) > 12) {
      free.driftT = (free.driftT || 0) + dt;
      if (Math.random() < .18) [-1, 1].forEach(sd => puff(nozzle(-1.25, -.5).add(new T.Vector3(0, 0, sd * .7).applyAxisAngle(yUp, car.yaw)), new T.Vector3(0, 1, 0), .6, .22));
    } else if ((free.driftT || 0) > 0 && Math.abs(car.vl) < 2) {
      if (free.driftT > 1) { const pts = Math.round(free.driftT * 120); free.score += pts; save.freeBest = Math.max(save.freeBest, free.score); persist(); showToast(`Занос ${free.driftT.toFixed(1)} с  +${pts}`, "good", 1800); }
      free.driftT = 0;
    }
    const nfx = Math.cos(car.yaw), nfz = -Math.sin(car.yaw), lfx = -Math.sin(car.yaw), lfz = -Math.cos(car.yaw);
    const nx = car.x + (nfx * car.v + lfx * car.vl) * dt, nz = car.z + (nfz * car.v + lfz * car.vl) * dt;
    const g0 = groundAt(nx, nz, car.y);
    if (g0.roof && g0.roof.arena && g0.h > car.y) car.y = g0.h;          // с трибуны — на крышу
    const out = nx < WORLD.x0 || nx > WORLD.x1 || nz < WORLD.z0 || nz > WORLD.z1;
    const stuckInside = hitSolid(car.x, car.z, car.y + .2);            // если уже внутри препятствия — даём выехать
    if (stuckInside && stuckInside.wall) for (const sg of [1, -1]) {   // оказались в стенке моста (край пандуса, бок трамплина) — выталкивает вбок, наружу
      const px = car.x - stuckInside.wall.z * sg * .3, pz = car.z + stuckInside.wall.x * sg * .3;
      if (!hitSolid(px, pz, car.y + .2) && Math.abs(groundAt(px, pz, car.y).h - car.y) < .3) { car.x = px; car.z = pz; break; }
    }
    const solid = stuckInside ? null : hitSolid(nx, nz, car.y + .2);
    if (solid && solid.arena && Math.abs(car.v) > 10 && gas > 10) return wallAttach();   // присоски
    // вдоль стенки моста (ферма, перила, бок пандуса): удар по касательной — скользим вдоль, разбиваемся только при ударе «в лоб»
    const wv = solid && solid.wall ? (nfx * car.v + lfx * car.vl) * solid.wall.x + (nfz * car.v + lfz * car.vl) * solid.wall.z : 0;
    const vn = solid && solid.wall ? Math.sqrt(Math.max(0, car.v * car.v + car.vl * car.vl - wv * wv)) : 99;
    if (solid && solid.wall && vn < 11) {
      const ax = car.x + solid.wall.x * wv * dt, az = car.z + solid.wall.z * wv * dt;
      if (!hitSolid(ax, az, car.y + .2) && groundAt(ax, az, car.y).h - car.y <= .7) {
        const gS = groundAt(ax, az, car.y); car.x = ax; car.z = az; if (gS.h <= car.y + .7 && gS.h >= car.y - .25) car.y = gS.h;
        car.vl = 0; car.v *= Math.pow(.55, dt);
        const sg = Math.sign(wv) || 1, ty = Math.atan2(-solid.wall.z * sg, solid.wall.x * sg); let d = ty - car.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); car.yaw += d * Math.min(1, dt * 4);   // нос доворачивает вдоль стенки
        if (vn > 5 && !free.bumpCd) { sfx.thump(.3); free.bumpCd = 1; dust(car.x, car.y, car.z, 3); }
        return;
      }
      for (const sg of [1, -1]) {                       // вдоль не проехать (угол, торец) — чуть отталкивает от стенки в свободную сторону
        const px = car.x - solid.wall.z * sg * .25, pz = car.z + solid.wall.x * sg * .25;
        if (!hitSolid(px, pz, car.y + .2) && Math.abs(groundAt(px, pz, car.y).h - car.y) < .3) { car.x = px; car.z = pz; car.v *= .5; car.vl = 0; return; }
      }
    }
    if (solid && Math.hypot(car.v, car.vl) > 22 && !(free.grace > 0) && !(solid.wall && vn < 11)) return freeCrash(`Авария: врезались в ${solid.name}. Возвращаем на дорогу`);
    const blocked = (x, z) => x < WORLD.x0 || x > WORLD.x1 || z < WORLD.z0 || z > WORLD.z1 || (!stuckInside && hitSolid(x, z, car.y + .2)) || groundAt(x, z, car.y).h - car.y > (g0.bowl ? 3 : .7);
    if (out || solid || g0.h - car.y > (g0.bowl ? 3 : .7)) {   // по трибунам чаши можно въехать круто
      // скольжение вдоль препятствия: пробуем сдвинуться только по одной оси, чтобы не застревать у стен и края
      // скользим только если сдвиг по оси заметен (≥ 30% шага), иначе — отскок
      const step = Math.hypot(nx - car.x, nz - car.z) + 1e-9;
      const slideX = Math.abs(nx - car.x) > .3 * step && !blocked(nx, car.z);
      const slideZ = Math.abs(nz - car.z) > .3 * step && !blocked(car.x, nz);
      if (Math.abs(car.v) > 8 && !free.bumpCd) { showToast(out ? "Край карты — разворачивайтесь" : "Бум!", "bad", 1200); free.bumpCd = 1; sfx.thump(.5); if (!out && Math.abs(car.v) > 14) sfx.broken(4); }
      car.vl = 0;
      if (slideX || slideZ) {
        if (slideX && (!slideZ || Math.abs(nx - car.x) >= Math.abs(nz - car.z))) car.x = nx; else car.z = nz;
        car.v *= Math.pow(.35, dt);
      } else car.v = -car.v * .25;
    } else if (car.y < .3 && waterAt(nx, nz)) {
      car.x = nx; car.z = nz; return sink();
    } else {
      if (Math.abs(nz) < 1.8 && nx >= RS - .3 && nx <= RS + 1.5 && nfx > .85 && car.v > 6) {
        car.x = RS; car.z = 0; car.yaw = 0; car.y = 0; phase = "fcork"; return;
      }
      const crest = g0.hump && car.v > 6 && car.pitch > .08 && Math.atan(Math.tan(g0.slope) * (nfx * g0.rx + nfz * g0.rz)) < -.05;   // гребень трамплина-горба: нос ещё вверх, дальше скат — отрыв
      if (crest) { car.x = nx; car.z = nz; car.vy = car.v * Math.sin(car.pitch); car.v = car.v * Math.cos(car.pitch); takeoff(false); return; }
      if (g0.h < car.y - (g0.bowl ? 1.5 : .25)) {   // съехали с трамплина — взлёт (по трибунам чаши — вниз без отрыва)
        car.x = nx; car.z = nz;
        car.vy = car.v * Math.sin(car.pitch); car.v = car.v * Math.cos(car.pitch);
        takeoff(false); return;
      }
      car.x = nx; car.z = nz; car.y = g0.h;
      if (g0.vx !== undefined) { car.x += g0.vx * dt; car.z += g0.vz * dt; }                          // палуба судна, крыша поезда везут машину
      if (g0.pad && car.v > 2) car.v = Math.max(car.v, g0.pad);                                       // разгон (арка, перила ж/д моста)
      if (g0.pull) { const k = Math.min(1, dt * 2.5); car.x += (g0.pull.x - car.x) * k; car.z += (g0.pull.z - car.z) * k; }   // узкая балка держит машину
      // путь на мосту: на рельсах (машина вдоль моста, центр над путём) — притягивает к рельсам, ровно и с разгоном; на шпалах — трясёт и тормозит
      free.onRails = false;
      if (g0.track && Math.abs(car.v) > 2) {
        const along = nfx * g0.rx + nfz * g0.rz, dP = Math.hypot(car.x - g0.track.p.x, car.z - g0.track.p.z);
        if (Math.abs(along) > .97 && dP < .6) {
          const k = Math.min(1, dt * 5); car.x += (g0.track.p.x - car.x) * k; car.z += (g0.track.p.z - car.z) * k; car.vl = 0; free.onRails = true;
          car.v += Math.sign(car.v) * 3 * dt;                                         // по рельсам — накат без сопротивления
          if (g0.track.boost && Math.sign(along * car.v) === g0.track.boost && Math.abs(car.v) < 34) {   // разгонный участок
            car.v = Math.sign(car.v) * Math.max(Math.abs(car.v), 34);
            if (!free.railBoost) { free.railBoost = true; sfx.jet(); queueToast("Разгон по рельсам!", "good", 1200); }
          }
        } else {
          const amp = Math.min(1, Math.abs(car.v) / 18);                               // шпалы: тряска, «тук-тук», торможение
          car.bodyPitch = (car.bodyPitch || 0) + (Math.random() - .5) * 3.2 * amp; car.bodyRoll = (car.bodyRoll || 0) + (Math.random() - .5) * 2 * amp;
          car.v -= car.v * .35 * dt; free.shake = .12 * amp;
          free.tukT = (free.tukT || 0) - dt; if (free.tukT <= 0) { free.tukT = Math.max(.07, .8 / Math.abs(car.v)); sfx.thump(.05 + .05 * amp); }
        }
      }
      if (!free.onRails) free.railBoost = false; else if (free.railBoost) free.railBoostT = time;
      free.steel = g0.rb ? 1 : 0;                                         // для звука: едем по стали моста
      if (free.onRails) { free.joint = (free.joint || 0) + Math.abs(car.v) * dt; if (free.joint > 12.5) { free.joint = 0; sfx.clack(Math.min(1, Math.abs(car.v) / 25)); } }   // стыки рельсов через 12,5 м
      free.trainT = g0.train ? (free.trainT || 0) + dt : 0; if (free.trainT > 10) completeMission("rbTrain");
      // на узкой балке — «на двух колёсах»: кузов кренится на 30° наружу, очки за время на балке
      free.onBeam = g0.pull ? (Math.sign(nfx * g0.rx + nfz * g0.rz) || 1) * g0.pull.k : 0;
      if (g0.pull) {                                    // на узкой балке нос мягко доворачивает вдоль неё — не соскальзываешь от лёгкого руля
        const al = nfx * g0.rx + nfz * g0.rz, sg = Math.sign(al) || 1, ty = Math.atan2(-g0.rz * sg, g0.rx * sg); let d = ty - car.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(al) > .8 && Math.abs(turn()) < .5) car.yaw += d * Math.min(1, dt * 3);
        const [ps, pl] = RAILB ? RAILB.loc(car.x, car.z) : [0, 0];
        if (RAILB && Math.abs(Math.abs(pl) - RAILB.HW) < .8 && car.y > RAILB.Y0 + 6) {   // поверху через весь мост: пояс северной арки → край пролёта → пояс южной (или обратно)
          if (ps < RAILB.A1 - 20) { free.overN = time; if (time - (free.overS || -99) < 14) completeMission("rbOver"); }
          else if (ps > RAILB.A2 + 20) { free.overS = time; if (time - (free.overN || -99) < 14) completeMission("rbOver"); } }
      }
      if (free.onBeam && car.v > 3) { free.beamT = (free.beamT || 0) + dt; if (free.beamT > 3) completeMission("rbTwo"); }
      else if (free.beamT > 1.2) { const pts = Math.round(free.beamT * 90); free.score += pts; save.freeBest = Math.max(save.freeBest, free.score); persist(); showToast(`На двух колёсах ${free.beamT.toFixed(1)} с  +${pts}`, "good", 1800); free.beamT = 0; }
      else free.beamT = 0;
      const gs = g0.rx !== undefined ? Math.atan(Math.tan(g0.slope) * (nfx * g0.rx + nfz * g0.rz)) : g0.slope;   // чаша, мост: вверх или вниз по ходу
      car.pitch += (gs - car.pitch) * Math.min(1, dt * 12);
      const sr = g0.bowl || g0.hill ? Math.atan(Math.tan(g0.slope) * (lfx * g0.rx + lfz * g0.rz)) / DEG : 0;   // поперёк трибуны — крен по склону
      car.slopeRoll = (car.slopeRoll || 0) + (sr - (car.slopeRoll || 0)) * Math.min(1, dt * 12);
    }
    const wantHop = (input.hop || free.hopReq) && !free.hopLock; free.hopReq = false;
    if (wantHop && gas >= 20) {
      gas -= 20; car.vy = 10; free.hopLock = true; dust(car.x, car.y, car.z, 6); sfx.whoosh(); takeoff(false); return;
    }
    if (!input.hop) free.hopLock = false;
    gas = Math.min(100, gas + 6 * dt);
    free.bumpCd = Math.max(0, (free.bumpCd || 0) - dt);
    // «застрял» — жмём газ или тормоз, а машина за секунду почти не сдвинулась
    free.prog = free.prog || { x: car.x, z: car.z, t: 0 };
    free.prog.t += dt;
    if (free.prog.t >= 1) {
      const moved = Math.hypot(car.x - free.prog.x, car.z - free.prog.z);
      free.stuckT = (th > .5 || bk > .5) && moved < 1.5 ? (free.stuckT || 0) + 1 : 0;
      free.prog = { x: car.x, z: car.z, t: 0 };
    }
    if (free.stuckT >= 3 && time - (free.stuckHintAt ?? -99) > 20) {   // не чаще раза в 20 секунд
      free.stuckHintAt = time; free.stuckT = 0;
      showToast("Застряли? «⋯» → «Куда ехать»", "", 2500);
    }
    free.safeT += dt; if (free.grace > 0) free.grace -= dt;
    if (free.safeT > 1 && car.y < terrainH(car.x, car.z) + .05 && Math.abs(car.v) > 1 && Math.abs(car.vl || 0) < 3 && !hitSolid(car.x, car.z, car.y + .2)
      && ![[4, 0], [-4, 0], [0, 4], [0, -4]].some(([ox, oz]) => hitSolid(car.x + ox, car.z + oz, car.y + .2))) { free.safe = { x: car.x, z: car.z, yaw: car.yaw, y: car.y }; free.safeT = 0; }   // точка возврата — без заноса и не у стены
    if (Math.abs(car.v) > 3 && thr() > .3 && Math.random() < .08) puff(nozzle(-2.1, -.35), new T.Vector3(0, .5, 0), .4, .12);
    return;
  }
  // воздух
  if (free.pro) return stepProAir(dt);
  free.airT += dt;
  car.vy -= G * dt;
  free.gh = groundAt(car.x, car.z, car.y).h;
  if (free.cat && car.vy < -12 && car.y - free.gh < 45) {   // баклажановая подушка после катапульты: плавно гасит падение
    car.vy = Math.min(-12, car.vy + 32 * dt); car.v *= Math.pow(car.y - free.gh < 20 ? .03 : .3, dt);   // и вперёд тормозим — садимся у выбранного места, у земли почти без хода
    if (Math.random() < .5) puff(new T.Vector3(car.x, car.y - .6, car.z), new T.Vector3(0, -6, 0), .5, .45);
  }
  if (!(time < free.autoUntil)) airControls(dt, false);           // бросок соплами (на пролёт, на поезд) — дугу ведёт автоматика, газ в воздухе её не ломает
  // баллон смотрит и вперёд по ходу полёта: если там крыша, тормозить надо до неё, а не до улицы
  const ahead = t => groundAt(car.x + Math.cos(car.yaw) * car.v * t, car.z - Math.sin(car.yaw) * car.v * t, car.y).h;
  landingReserve(dt, Math.max(free.gh, ahead(.3), ahead(.6)));
  const fx = Math.cos(car.yaw), fz = -Math.sin(car.yaw), yPrev = car.y;
  car.x += fx * car.v * dt; car.z += fz * car.v * dt; car.y += car.vy * dt;
  if (car.y > 3.6 && car.x > 386 && car.x < 448 && Math.abs(car.z - 30) < 3.5) free.overBus = true;
  if (car.vy < 0 && car.y > .9) for (const c of traffic) if (!(c.wreck > 0) && car.y < c.H + 1 && Math.abs(car.x - c.x) < c.L / 2 + .4 && Math.abs(car.z - c.z) < 1.4) {
    c.wreck = 6; c.v = 0; dust(c.x, c.H, c.z, 12); sfx.crash();     // прыгнули на крышу машины в потоке: она встаёт, мы отскакиваем
    const big = c.kind !== "car", pts = c.kind === "bus" ? 700 : big ? 500 : 400;
    car.vy = 7; car.y = c.H + 1; free.score += pts; save.freeBest = Math.max(save.freeBest, free.score); persist();
    queueToast(`${c.kind === "bus" ? "По крыше автобуса" : c.kind === "van" ? "По крыше маршрутки" : "По крыше машины"}! Авария в потоке  +${pts}`, "good", 1800); break;
  }
  car.pitch += (Math.atan2(car.vy, Math.abs(car.v) + .1) * .35 - car.pitch) * Math.min(1, dt * 4);
  for (const r of rings) if (!r.got && Math.hypot(car.x - r.x, car.y + .6 - r.y, car.z - r.z) < 2.9) {
    r.got = true; r.m.material.color.setHex(0x6fdc8c); free.ringBonus += 300; showToast("Кольцо +300", "good", 1200); sfx.ring();
    free.ringStreak = (free.ringStreak || 0) + 1; if (free.ringStreak >= 3) completeMission("rings3");
  }
  if (car.x < WORLD.x0 || car.x > WORLD.x1 || car.z < WORLD.z0 || car.z > WORLD.z1) car.v = -car.v * .3;
  const g = groundAt(car.x, car.z, yPrev);
  if (car.y <= g.h) return landFree(g);
  const s = hitSolid(car.x, car.z, car.y);
  if (s && s.arena && car.v > 8 && gas > 10 && car.y < ARENA.H - 2) return wallAttach();
  if (s) return freeCrash(`Авария: влетели в ${s.name}`);
}
function landFree(g) {
  const err = Math.abs(rollErr(car.roll)), vImp = -car.vy; free.cat = null;
  car.y = g.h; free.air = false;
  if (g.h < .1 && waterAt(car.x, car.z)) return sink();
  const q = err <= CLEAN_ROLL && vImp <= CLEAN_V ? "clean" : err <= HARD_ROLL && vImp <= HARD_V ? "hard" : null;
  if (!q) return freeCrash(err > HARD_ROLL ? `Приземлились на ${err > 110 ? "крышу" : "бок"}. Возвращаем на дорогу` : `Слишком жёстко: ${vImp.toFixed(0)} м/с. Держите ГАЗ у земли`);
  dust(car.x, g.h, car.z, 8); sfx.thump(Math.min(1, vImp / 14));
  if (g.ship) {                                                   // плюхнулись на палубу — судно качнулось: брызги из-под бортов и волна
    const sh = g.ship; WAKE.add(sh.x, sh.z, .3);
    for (let i = 0; i < 30; i++) { const k = i % 2 ? 1 : -1, u = (Math.random() - .5) * 70; puff(new T.Vector3(sh.x + sh.cs * u - sh.sn * k * 6.4, .4, sh.z + sh.sn * u + sh.cs * k * 6.4), new T.Vector3(-sh.sn * k * 4, 4 + Math.random() * 4, sh.cs * k * 4), 1.2, .5, 7); }
  }
  car.vy = 0; car.roll = 0; car.om = 0;
  if (g.train && RAILB) {                                         // на крышу поезда: нос — вдоль вагонов, скорость — относительно поезда (он везёт сам)
    const along = car.v * (Math.cos(car.yaw) * RAILB.dir.x - Math.sin(car.yaw) * RAILB.dir.z); car.yaw = RAILB.yaw; car.v = Math.max(0, along - Math.hypot(g.vx, g.vz)) * .4; car.vl = 0;
  }
  if (g.roof && g.roof.pad && Math.hypot(car.x - g.roof.pad.x, car.z - g.roof.pad.z) < 6) {   // точно на площадку «H»
    free.score += 300; save.freeBest = Math.max(save.freeBest, free.score); persist();
    queueToast("Посадка на площадку «H»  +300", "good", 2000); completeMission("roof");
  }
  if (g.roof && g.roof.arena) {
    free.score += 500; save.freeBest = Math.max(save.freeBest, free.score); persist();
    queueToast(free.fromMega ? "С мега-трамплина на крышу Арены!  +500" : "На крыше Арены  +500", "good", 2200); completeMission("arenaRoof");
  }
  if (free.overBus) completeMission("bus");
  if (free.fromRB && free.airT > .3 && RAILB) {                                   // испытания ж/д моста
    if (g.ship) completeMission("rbBarge");
    if (g.lift && time - (free.railBoostT || -99) < 4) completeMission("rbRails");
    if (g.lift && time - (free.jetRB || -99) < 6) completeMission("rbJet");
    if (g.train && time - (free.jetTrain || -99) < 5) completeMission("rbTrainJump");
    if (g.pull && free.airT > .5) { const [ls] = RAILB.loc(car.x, car.z); if (ls > RAILB.A2 + 9 && ls < RAILB.GAP0 + 1) completeMission("rbRailGap"); }
  }
  if (free.fromOverpass && car.z < ZA - 19) completeMission("overpass");
  const trickRoll = totalRoll + (free.cork ? 180 : 0), turns = Math.floor((trickRoll + 40) / 360);
  if (free.airT < .6 && !turns) return;
  const parts = [];
  let pts = Math.round(free.airT * 120);
  if (free.cork) { parts.push("Штопор"); pts += 400; }
  const barrels = free.cork ? turns - 1 : turns;
  if (barrels > 0) { parts.push(barrels > 1 ? `Бочка ×${barrels}` : "Бочка"); pts += barrels * 600; }
  if (barrels >= 2) completeMission("barrel2");
  if (free.fromRoof && !g.roof) { parts.push("С крыши Арены"); pts += 500; if (barrels > 0 || free.cork) completeMission("arenaJump"); }
  parts.push(`${free.airT.toFixed(1)} с в воздухе`);
  if (q === "clean") { pts += 200; parts.push("чисто"); } else pts = Math.round(pts * .6);
  pts += free.ringBonus;
  free.score += pts;
  save.freeBest = Math.max(save.freeBest, free.score); save.trickBest = Math.max(save.trickBest, pts); persist();
  showToast(`${parts.join(" · ")}  +${pts}`, q === "clean" ? "good" : "", 2600);
  const kinoWill = save.kino !== false && !free.pro && KINO.near(car.x, car.z) && (barrels > 0 || free.cork || free.airT > 1.5) && !free.kinoPend;
  // у моста сначала кино-повтор: песня играет под повтор (как в фильме) и без паузы переходит в праздник после него
  if (barrels > 0 || free.cork || pts >= 800) { SHOW.salute(car.x, car.y + 10, car.z, Math.min(5, 2 + barrels)); if ((barrels > 0 || free.cork || !free.pro) && !kinoWill) PARTY.start(); }   // в PRO долгий полёт — дёшево: вечеринка только за бочку и штопор   // праздник: салют над крутым трюком и минута вечеринки 888
  if (pts > (free.bestPts || 0) && !free.pend) free.pend = { pts, from: free.takeoffT - 1, until: time + .8 };
  if (kinoWill)   // трюк у моста — кино-повтор
    free.kinoPend = { pts, from: free.takeoffT - .4, until: time + .6, label: parts[0], party: barrels > 0 || free.cork || pts >= 800 };   // лучший трюк — сохраним для повтора
}

