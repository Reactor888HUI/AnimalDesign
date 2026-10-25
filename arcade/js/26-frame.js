// «Восьмёрка Баклажан» — кадр (главный цикл), ручки для тестов.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- кадр ---------- */
const camPos = new T.Vector3(SPAWN.x - 10, 4, SPAWN.z), look = new T.Vector3();
// уроки и уровни полигона считают высоту от его земли (0), а полигон стоит на плато: на время отрисовки машина — на PLAT выше
let RYO = 0;
function render(dt) { RYO = mode === "free" ? 0 : PLAT; car.y += RYO; try { renderAt(dt); } finally { car.y -= RYO; } }
function renderAt(dt) {
  carObj.position.set(car.x, car.y + WHEEL, car.z);
  const lean = SUV && SUV.on ? SUV.LEAN : { roll: 1, pitch: 1 };   // внедорожник кренится мягче
  carObj.rotation.set((car.roll + (car.bodyRoll || 0) * lean.roll + (car.slopeRoll || 0)) * DEG, car.yaw, car.pitch + (car.bodyPitch || 0) * lean.pitch * DEG, "YZX");
  if (mode === "free" && free.wall && !replay) {          // на стене: «верх» машины — наружу от фасада
    const w = free.wall, p = w.p, c = Math.cos(w.th), sn = Math.sin(w.th);
    wallBasis.f.set(p.tx * w.dir * c, sn, p.tz * w.dir * c); wallBasis.n.set(p.nx, 0, p.nz); wallBasis.z.crossVectors(wallBasis.f, wallBasis.n);
    wallBasis.m.makeBasis(wallBasis.f, wallBasis.n, wallBasis.z); carObj.quaternion.setFromRotationMatrix(wallBasis.m);
    carObj.position.set(p.x + p.nx * WHEEL, w.y, p.z + p.nz * WHEEL);
  }
  if (mode === "free" && free.tube && !replay) {          // в трубе: «верх» машины — к оси трубы
    const t = free.tube; wallBasis.z.crossVectors(t.f, t.n); wallBasis.m.makeBasis(t.f, t.n, wallBasis.z);
    carObj.quaternion.setFromRotationMatrix(wallBasis.m); carObj.position.set(car.x + t.n.x * WHEEL, car.y + t.n.y * WHEEL, car.z + t.n.z * WHEEL);
  }
  if (CINE.q) { carObj.quaternion.copy(CINE.q); if (CINE.up) carObj.position.set(car.x + CINE.up.x * WHEEL, car.y + CINE.up.y * WHEEL, car.z + CINE.up.z * WHEEL); }   // съёмка ролика: поза машины задана сценарием
  if (INNER) INNER.anim(dt);
  if (ringQ.length) buildRings();
  DON_WATER.userData.u.uTime.value += dt; DON_WATER.userData.u.uFlow.value = perf.q >= 1 ? 1 : 0;   // рябь — на среднем и высоком качестве
  {   // колёса крутятся по скорости, передние поворачивают; стоп-сигналы горят при торможении
    const U = carObj.userData, v = replay ? 0 : mode === "free" ? (free.aero || free.air ? 0 : car.v) : (car.vx || 0);
    U.wa = ((U.wa || 0) + v * dt / .288) % (Math.PI * 2);
    U.st = (U.st || 0) + ((phase === "free" && !free.air ? -turn() * .45 : 0) - (U.st || 0)) * Math.min(1, dt * 8);
    U.wheels.forEach(w => { w.spin.rotation.z = -U.wa; w.steer.rotation.y = w.front ? U.st : 0; });
    U.redM.emissiveIntensity = PARTY.on ? PARTY.red : !replay && brk() > .1 ? 2.4 : .55;
  }
  const gh = mode === "free" ? groundAt(car.x, car.z, car.y + .5).h : RYO;   // в уроках земля полигона — на плато
  const hgt = Math.max(0, car.y - gh);
  shadow.visible = !(mode === "free" && (free.wall || free.tube)) && !CINE.noShadow;
  shadow.position.set(car.x, gh + .15, car.z); shadow.rotation.z = car.yaw;
  shadow.material.opacity = .35 * Math.max(.15, 1 - hgt / 25); shadow.scale.set(2.6 * (1 + hgt / 30), 1.2 * (1 + hgt / 30), 1);
  marker.visible = !replay && (phase === "air" || (mode === "free" && free.air));
  if (marker.visible) {
    const t = timeToGround(gh), fwd = mode === "free" ? car.v : car.vx;
    const lx = car.x + Math.cos(car.yaw) * fwd * t, lz = car.z - Math.sin(car.yaw) * fwd * t;
    const okX = mode === "free" ? !hitSolid(lx, lz, .5) : lx > row[row.length - 1].x1 + HALF;
    marker.position.set(lx, groundAt(lx, lz).h + .18, lz); marker.material.color.setHex(okX ? 0x6fdc8c : 0xff6b5e);
  }
  camera.near = .5;
  const dh = location.hash.replace("-pro", ""), dbg = dh === "#side" ? [0, 0, 1] : dh === "#rear" ? [-1, 0, 0] : dh === "#front" ? [1, 0, 0] : dh === "#corner" ? [-.7, .25, .7] : null;
  if (dbg) {   // чертёжные виды для сверки с чертежом
    carObj.visible = true;
    camera.position.set(car.x + dbg[0] * 80, car.y + .05 + dbg[1] * 80, car.z + dbg[2] * 80); camera.up.set(0, 1, 0);
    camera.lookAt(car.x, car.y + .05, car.z); camera.fov = 3.4;
  } else if (performance.now() < garageUntil) {
    carObj.visible = true;
    const a = performance.now() * .0005 + 2.2;
    camera.position.set(car.x + Math.cos(a) * 6.2, car.y + 1.7, car.z + Math.sin(a) * 6.2); camera.up.set(0, 1, 0);
    camera.lookAt(car.x, car.y + .7, car.z); camera.fov = 45; camPos.copy(camera.position);
  } else if (replay && replay.kino && KINO.cam(dt * (replay.rate || .8))) {
    carObj.visible = true;
  } else if (replay) {
    carObj.visible = true;
    const eye = replay.eye || new T.Vector3(TRIB.x - 4, PLAT + 5, TRIB.z - 3);
    camPos.copy(eye); camera.position.copy(eye); camera.up.set(0, 1, 0);
    look.set(car.x, car.y + .6, replay.free ? car.z : 0); camera.lookAt(look);
    camera.fov = Math.max(14, Math.min(55, 2 * Math.atan(12 / eye.distanceTo(look)) / DEG));
  } else if (camMode === "cockpit" && phase !== "drill" && phase !== "brief") {
    const suv = SUV && SUV.on; carObj.visible = suv; if (suv) SUV.cockpit(true);   // внедорожник: виден салон, руль, приборы, капот
    const tall = suv && camera.aspect < 1;                         // телефон вертикально: взгляд чуть правее и шире — виден экран-навигатор
    const eye = (suv ? SUV.eye.clone().add(SUV.head(dt)).add(new T.Vector3(0, 0, tall ? .08 : 0)) : new T.Vector3(.1, .55, -.3)).applyEuler(carObj.rotation).add(carObj.position);
    const fwd = new T.Vector3(10, .4, tall ? 1.35 : 0).applyEuler(carObj.rotation).add(carObj.position);
    const up = new T.Vector3(0, 1, 0).applyEuler(carObj.rotation); if (suv) up.lerp(new T.Vector3(0, 1, 0), .35).normalize();   // голова держит горизонт чуть ровнее кузова
    camera.position.copy(eye); camera.up.copy(up); camera.lookAt(fwd);
    camera.fov = suv ? (tall ? 80 : 68) : 75; camPos.copy(eye); camera.near = suv ? .08 : .5;   // из кабины зеркало и стойки ближе полуметра
  } else {
    carObj.visible = true; if (SUV && SUV.on) SUV.cockpit(false);
    const air = phase === "air" || phase === "crash" || phase === "fcrash" || phase === "drill" || (phase === "brief" && briefPhase === "drill") || (phase === "lesson-done" && car.y - RYO > .5) || (mode === "free" && (free.air || free.aero));
    const fx = Math.cos(car.yaw), fz = -Math.sin(car.yaw);
    let want, tight = false;
    if (mode === "free") {
      const rev = !air && car.v < -1;                                   // задний ход: камера выше и ближе, видно, куда едем
      const back = air ? 10 : rev ? 6.5 : 7.2 + Math.abs(car.v) * .045;          // ближе — машина на экране крупнее
      want = new T.Vector3(car.x - fx * back, car.y + (free.aero ? 3 : air ? 4.3 : rev ? 4.8 : 2.7), car.z - fz * back);
      if (free.wall) { const p = free.wall.p; want.set(car.x - fx * 9 + p.nx * 6, free.wall.y + 2.5, car.z - fz * 9 + p.nz * 6); }   // на стене — сбоку-сзади
      if (free.tube && !free.tube.lift) { const t = free.tube, c = t.path.at(Math.max(0, t.s - 9)); want.set(c.p.x, c.p.y + 1.2, c.p.z); }   // в трубе — по оси сзади
      if (phase === "fsink") want.set(car.x - fx * 6.5, Math.min(car.y + 2.2, 1.6 - tPhase * 1.6), car.z - fz * 6.5);   // тонем: камера ныряет следом
      if (free.cat && free.air) {                                         // катапульта: панорама — камера облетает машину, отходя всё дальше
        const e = Math.min(1, (time - free.cat.t0) / Math.max(1, free.cat.end - free.cat.t0)), a = free.cat.a0 + (time - free.cat.t0) * .55, R = 12 + 16 * Math.sin(Math.PI * Math.min(1, e * 1.1));
        want.set(car.x + Math.cos(a) * R, car.y + 3 + 6 * Math.sin(Math.PI * e), car.z - Math.sin(a) * R);
      }
      // не залезать в дома: ищем первое здание на отрезке «машина → камера», ставим камеру перед ним
      // и смотрим подальше вперёд — если дом прямо за машиной, получается вид поверх капота
      const from = new T.Vector3(car.x, car.y + 1.2, car.z);
      for (let i = 1; i <= 12 && !free.wall && !free.tube && !free.aero && !(free.cat && free.air); i++) {
        const p = from.clone().lerp(want, i / 12);
        const hit = solidsNear(p.x, p.z).find(b => b.h > p.y && inBox(b, p.x, p.z, .6));
        if (!hit) continue;
        if (hit.h < car.y + 6) { want.y = Math.max(want.y, hit.h + 1.5); continue; }   // низкий дом — камера просто поднимается над крышей
        want.copy(from.lerp(want, Math.max(.05, (i - 1.5) / 12))); want.y = Math.max(want.y + 1.2, car.y + 2.6); tight = true; break;
      }
    }
    else if (phase === "drill" || (phase === "brief" && briefPhase === "drill")) want = new T.Vector3(car.x - 14, car.y + 3, 9);
    else want = new T.Vector3(car.x - (air ? 11 : 9), car.y + (air ? 4.5 : 3), air ? 5 : 3.5);
    if (mode === "free" && camMode === "far") want.set(car.x - fx * 15, want.y + 4, car.z - fz * 15);    // дальний вид
    camPos.lerp(want, mode === "free" && free.tube ? 1 : Math.min(1, dt * (mode === "free" ? (free.cat && free.air ? 3 : 5) : 4)));
    if (mode === "free" && ARENA && !free.tube) { const bw = ARENA.bowl(camPos.x, camPos.z); if (bw && camPos.y < bw.h + 2.2) camPos.y = bw.h + 2.2; }   // не под трибуной
    camera.position.copy(camPos); camera.up.set(0, 1, 0);
    if (mode === "free" && free.cat && free.air) look.set(car.x, car.y + .5, car.z);                 // панорама: смотрим на саму машину
    else if (mode === "free") look.set(car.x + fx * (tight ? 14 : 6), car.y + .8 - (air && !free.aero ? Math.min(3, hgt * .25) : 0), car.z + fz * (tight ? 14 : 6));
    else look.set(car.x + (air ? 6 : 5), car.y + .6 - (air ? Math.min(3, (car.y - RYO) * .25) : 0), 0);
    camera.lookAt(look); camera.fov = 60 + (mode === "free" ? Math.min(14, Math.abs(car.v) * .25) : 0);
    const orb = mode === "free" && !replay && PARTY.orbit();
    if (orb) {                                             // вечеринка: облёт камеры — один плавный пролёт, как дроном: 225° вокруг машины,
      const k = Math.min(1, orb.t / orb.T), e = k * k * (3 - 2 * k), up = Math.sin(Math.PI * k);   // мягкий старт и остановка, вверх и вниз по дуге
      const a = orb.a0 + e * Math.PI * 1.25;
      let r = 7.2 + 2.6 * up, h = 1.5 + 3.4 * up; const ly = .7 + .3 * up, fov = 54 - 6 * up;
      while (r > 3 && !KINO.clear([car.x + Math.cos(a) * r, car.y + h, car.z + Math.sin(a) * r])) r -= .6;   // не залетать в дома и не прятать машину за фермой
      camPos.set(car.x + Math.cos(a) * r, car.y + h, car.z + Math.sin(a) * r); camera.position.copy(camPos);
      look.set(car.x, car.y + ly, car.z); camera.lookAt(look); camera.fov = fov;
    }
  }
  if (mode === "free" && free.air && !replay && car.y < 7 && car.y > -.2 && waterAt(car.x, car.z)) {   // низко над водой: воздух из сопел рвёт воду — брызги и волны
    const k = 1 - car.y / 7;
    if (Math.random() < dt * 30 * k) puff(new T.Vector3(car.x + (Math.random() - .5) * 2, .3, car.z + (Math.random() - .5) * 2), new T.Vector3((Math.random() - .5) * 5, 3 + 4 * k, (Math.random() - .5) * 5), 1, .4, 8);
    free.wakeT = (free.wakeT || 0) - dt; if (free.wakeT <= 0) { free.wakeT = .35; WAKE.add(car.x, car.z, .14 * k); }
  }
  if (mode === "free" && phase === "free" && sfx.broken() > 0 && Math.random() < dt * 7) {   // поломка: дымок из-под капота
    const fx = Math.cos(car.yaw), fz = -Math.sin(car.yaw); puff(new T.Vector3(car.x + fx * 1.6, car.y + 1.1, car.z + fz * 1.6), new T.Vector3(fx * .3, 1.4, fz * .3), 1.8, .35, -.2, 3);
  }
  if (free.shake > 0 && mode === "free" && !replay) { camera.position.x += (Math.random() - .5) * free.shake; camera.position.y += (Math.random() - .5) * free.shake; free.shake = Math.max(0, free.shake - dt * .8); }   // тряска на шпалах
  camera.updateProjectionMatrix();
  if (window.__camOv) { const o = window.__camOv; camera.position.set(o[0], o[1], o[2]); camera.up.set(0, 1, 0); camera.lookAt(o[3], o[4], o[5]); camera.fov = o[6] || 40; camera.updateProjectionMatrix(); }   // только автотесты: снимок с заданной точки
  cullChunks(); tickSky(); UNDER.tick(); PHOTO.tick();
  renderer.render(scene, camera);
  drawStat.calls = renderer.info.render.calls; drawStat.tris = renderer.info.render.triangles;
}
// Плоские слои у земли (асфальт, газоны, вода, разметка, «зебры») лежат в миллиметрах друг над другом.
// На телефонах точности буфера глубины не хватает, и вдали они мерцают («рябит асфальт»).
// Поэтому такие слои рисуются первыми, строго снизу вверх и без записи глубины — порядок решает, кто сверху.
function layerGround() {
  const flatOnes = [], box = new T.Box3(), m4 = new T.Matrix4();
  scene.updateMatrixWorld(true);
  scene.children.forEach(o => {
    if (!o.isMesh || o.material.transparent) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    box.copy(o.geometry.boundingBox);
    if (o.isInstancedMesh) { if (!o.count) return; o.getMatrixAt(0, m4); box.applyMatrix4(m4); }
    box.applyMatrix4(o.matrixWorld);
    if (box.max.y - box.min.y < .06 && box.max.y < .25 && box.min.y > -.05) flatOnes.push([box.max.y, o]);
  });
  flatOnes.sort((a, b) => a[0] - b[0]).forEach(([, o], i) => {
    if (o.material !== DON_WATER) o.material = o.material.clone();   // у воды свой шейдер — копия его потеряла бы
    o.material.depthWrite = false; o.material.polygonOffset = false; o.renderOrder = -1000 + i;
  });
  return flatOnes.length;
}
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  stage.style.setProperty("--stage-h", h + "px");          // меню «⋯» не длиннее поля игры, остальное прокручивается
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener("resize", resize);

const wallBasis = { f: new T.Vector3(), n: new T.Vector3(), z: new T.Vector3(), m: new T.Matrix4() };
const perf = { fps: 60, n: 0, acc: 0, low: 0, high: 0, q: MAXQ }, drawStat = { calls: 0, tris: 0 };
function setTime(key) { if (typeof SUV !== "undefined" && SUV) setTimeout(() => SUV.amb(), 0);                         // время суток: свет, небо, туман, тени, ночные огни
  const P = TIMES[key] || TIMES.sunset; TIME = TIMES[key] ? key : "sunset";
  SUN_DIR.set(...P.sun).normalize(); sun.position.copy(SUN_DIR).multiplyScalar(400); sun.color.setHex(P.sunC); sun.intensity = P.sunI;
  shaftTmp.a.copy(SUN_DIR).negate();
  hemi.color.setHex(P.sky); hemi.groundColor.setHex(P.gnd); hemi.intensity = P.hemiI;
  scene.background.setHex(P.haze); scene.fog.color.setHex(P.haze); renderer.toneMappingExposure = P.exp;
  skyDome.userData.paint(TIME); bakeShadows(); HILL.paint(); paintCarEnv();
  DON_WATER.userData.u.uSky.value.setHex({ sunset: 0xa8c6dc, day: 0xb4d6f0, night: 0x0f1c34 }[TIME]);
  NIGHT.forEach(([o, k, v]) => { const x = v[TIME]; if (o[k] && o[k].isColor) o[k].setHex(x); else o[k] = x; });
  save.time = TIME; persist();
}
function setQuality(q) {
  perf.q = q; renderer.setPixelRatio(q); resize();
  scene.fog.far = q < 1 ? 600 : 900; scene.fog.near = scene.fog.far * .3; camera.far = scene.fog.far + 80; camera.updateProjectionMatrix();
}
function trackPerf(raw) {
  perf.n++; perf.acc += raw;
  if (perf.acc < 1) return;
  perf.fps = perf.n / perf.acc; perf.n = 0; perf.acc = 0;
  if (!$("dock-panel").hidden) syncDock();           // цифры качества в «⋯» живые
  if ((save.quality || "auto") !== "auto") return;
  if (perf.fps < 38) { perf.high = 0; if (++perf.low >= 2 && perf.q > .75) { setQuality(Math.max(.75, perf.q - .25)); perf.low = 0; } }
  else if (perf.fps > 55) { perf.low = 0; if (++perf.high >= 5 && perf.q < MAXQ) { setQuality(Math.min(MAXQ, perf.q + .25)); perf.high = 0; } }
  else perf.low = perf.high = 0;
}
let last = performance.now();
let testFast = false, testFrame = 0;
const CINE = { on: false, q: null, up: null, noShadow: false };   // покадровая съёмка ролика (только #test)
function frame(now) {
  if (CINE.on) { last = now; requestAnimationFrame(frame); return; }
  // до 10 к/с игра идёт в реальном времени (физика всё равно считается шагами по 1/120 с), ниже — плавно замедляется
  const raw = (now - last) / 1000, dt = Math.min(.1, raw); last = now;
  trackPerf(raw);
  if (replay) {
    replay.t += dt * (replay.rate || .8); replayPose();
    if (replay.t >= replay.end + .8) endReplay();
  } else if (mode === "free") {
    const sim = dt * (free.air ? .9 : 1) * PARTY.slow, n = Math.ceil(sim / (1 / 120));   // вечеринка: 3 с замедления
    for (let i = 0; i < n; i++) stepFree(sim / n);
    missionTick(); recordFree();
  } else if (phase !== "done" && phase !== "brief" && phase !== "lesson-done") {
    const sim = dt * (phase === "air" ? AIR_SLOW : 1), n = Math.ceil(sim / (1 / 120));
    for (let i = 0; i < n; i++) step(sim / n);
    if (["run", "ramp", "air", "roll", "crash"].includes(phase) && !result && rec.length < 6000) rec.push({ t: simT, x: car.x, y: car.y, roll: car.roll, pitch: car.pitch });
  } else time += dt;
  if (mode === "train" && !replay && $("ov-res").hidden) trainTick();
  tickScenes(); tickTraffic(dt * PARTY.slow); if (RAILB) RAILB.tick(dt * PARTY.slow); SHIPS.tick(dt * PARTY.slow); tickPuffs(dt); tickSignals(performance.now() / 1000); SHOW.tick(dt); PARTY.tick(dt); driftKitTick(dt); TRAINER.tick(dt); if (SUV) SUV.tick(dt); if (INNER) INNER.race.tick(dt);
  const airNow = mode === "free" ? free.air : phase === "air" || phase === "drill";
  sfx.tick(dt, { speed: mode === "free" ? car.v : phase === "run" || phase === "ramp" ? car.v : phase === "roll" ? car.vx : 0, throttle: thr(), air: airNow, skid: mode === "free" && !free.air ? Math.abs(car.vl || 0) : 0, pro: mode === "free" && !!free.pro, suv: !!(SUV && SUV.on) });
  ui(); if (!testFast || ++testFrame % 20 === 0) render(dt);   // в быстрых автотестах рисуем редко — физика идёт в полную скорость
  requestAnimationFrame(frame);
}

setHintText();
resize();
if ((save.quality || "auto") !== "auto") setQuality(QUALS[save.quality][1]);
setPaint(paintIdx());
setTune(save.tune || 0);
layerGround();
setTime(save.time || "sunset");
startFree();
if (save.tilt) setTilt(true);
if (location.hash === "#test") window.__t = { carObj, suv: on => { if (on !== undefined) { save.vehicle = on ? "suv" : "vaz"; SUV.select(on); } return !!(SUV && SUV.on); },
  trainer: id => { TRAINER.go(id); return TRAINER.id; }, done: id => !!(save.missions && save.missions[id]), unmis: () => { save.missions = {}; },
  step(dt) { stepFree(dt); if (RAILB) RAILB.tick(dt); SHIPS.tick(dt); },   // аудит моста: физика без отрисовки
  input(o) { Object.assign(input, { thrust: false, brake: false, rl: false, rr: false }, o); },
  crash(r) { freeCrash(r); }, toast: () => $("toast").textContent, free: () => free,   // крючок для автотестов
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, fps: perf.fps, pr: renderer.getPixelRatio(), chunks: `${chunkStat.shown}/${chunkStat.total}` }),
  car: () => ({ x: car.x, z: car.z, y: car.y, yaw: car.yaw, v: car.v, vy: car.vy, pitch: car.pitch, roll: car.roll, air: free.air, phase, fromRoof: !!free.fromRoof, fromMega: !!free.fromMega }),
  heading: () => car.yaw,
  simTime: () => time,
  drift: () => ({ vl: car.vl || 0, bodyRoll: car.bodyRoll || 0, bodyPitch: car.bodyPitch || 0, score: free.score }),
  sound: () => sfx.state(), music: () => ({ ready: sfx.musicReady(), playing: sfx.playing() }),
  cam: () => { const c = camera.position; return { x: c.x, y: c.y, z: c.z, inside: solidsNear(c.x, c.z).some(b => b.h > c.y && inBox(b, c.x, c.z, 0)) }; },
  houses: () => solids.filter(b => b.h > 8).map(b => ({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, h: b.h })),
  roads: () => ROADS.filter(r => r.c <= 3).map(r => r.pts),
  layers: () => scene.children.filter(o => o.renderOrder < -900).length,
  street: () => ({ ...STREET }),
  tune: n => { save.tune = n; setTune(n); },
  signals: () => ["A", "B"].map(g => SIGNALS[g].map(m => m.color.getHexString())),
  place: n => roadPoint(n),
  missions: () => ({ ...(save.missions || {}) }),
  burst: () => ({ ...BURST }),
  setGas: v => { gas = v; },
  vy: () => ({ vy: car.vy, air: free.air }),
  carY: () => car.y,
  scene: () => scene, camera: () => camera,
  roofs: () => solids.filter(b => b.rings && b.h > 3 && b.h < 14 && b.x1 - b.x0 > 14 && b.z1 - b.z0 > 14).map(b => ({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, h: b.h, ok: inRings((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, b.rings) && !hitSolid((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, b.h + .3) })).filter(b => b.ok),
  pads: () => solids.filter(b => b.pad && !hitSolid(b.pad.x, b.pad.z, b.h + .3)).map(b => ({ x: b.pad.x, z: b.pad.z, h: b.h })),
  fast: on => { testFast = on; },
  draw: () => render(0),
  spin: r => { totalRoll = r; },
  best: () => ({ pts: free.bestPts || 0, frames: free.bestRec ? free.bestRec.length : 0, replay: !!replay }),
  traffic: () => traffic.map(c => ({ x: c.x, z: c.z, zt: c.zt, v: c.v, wreck: c.wreck })),
  trafficKinds: () => traffic.map(c => c.kind),
  setCar(o) { Object.assign(car, o); if (o.air !== undefined) { free.air = o.air; if (o.air) takeoff(false); } },
  water: (x, z) => !!waterAt(x, z),
  zone: () => zoneName(car.x, car.z),
  solidAt: (x, z) => { const b = hitSolid(x, z, .2); return b ? b.name : ""; },
  // путь для тестового «водителя»: поиск в ширину по сетке 3 м, препятствия — дома, вода, машины; цель — автобан
  path(x, z, pad = 2.6) {
    const C = 3, i0 = Math.floor((STRIP.x0 - 30) / C), i1 = Math.ceil((STRIP.x1 + 30) / C), j0 = Math.floor((STRIP.z0 - 30) / C), j1 = Math.ceil((ZA - 15) / C);
    const W = i1 - i0 + 1, H = j1 - j0 + 1, prev = new Int32Array(W * H).fill(-2), blk = new Int8Array(W * H).fill(-1);
    const ctr = k => [(k % W + i0 + .5) * C, (Math.floor(k / W) + j0 + .5) * C];
    const dkc = new Map(), deck = k => { if (!dkc.has(k)) { const [cx, cz] = ctr(k), d = DECKS.length && deckAt(cx, cz, 1e3); dkc.set(k, d && d.edge > 5 ? d.h - terrainH(cx, cz) : null); } return dkc.get(k); };   // высота настила над землёй; края — не для пути
    const bad = k => { if (blk[k] < 0) { const [cx, cz] = ctr(k), dk = deck(k) != null; blk[k] = (!dk && solidsNear(cx, cz).some(b => b.h > .2 && inBox(b, cx, cz, pad))) || (waterAt(cx, cz) && !dk) ? 1 : 0; } return blk[k]; };
    const s = (Math.floor(z / C) - j0) * W + (Math.floor(x / C) - i0), q = [s]; prev[s] = -1;
    for (let h = 0; h < q.length; h++) {
      const k = q[h], ci = k % W, cj = Math.floor(k / W);
      if (cj + j0 >= j1 - 1) { const path = []; for (let v = k; v >= 0; v = prev[v]) path.unshift([(v % W + i0 + .5) * C, (Math.floor(v / W) + j0 + .5) * C]); return path.filter((_, n) => n % 3 === 0 || n === path.length - 1); }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const n = nj * W + ni; if (prev[n] !== -2 || bad(n)) continue;
        { const a = deck(n), b = deck(k); if ((a == null) !== (b == null) && Math.abs((a ?? 0) - (b ?? 0)) > 1.2) continue; }   // на мост и с моста — только у концов, где он вровень с землёй
        if (di && dj && (bad(cj * W + ni) || bad(nj * W + ci))) continue;
        prev[n] = k; q.push(n);
      }
    }
    return pad > 1.2 ? this.path(x, z, 1.2) : null;     // в узком месте — с меньшим запасом
  },
  arena: () => ARENA && { megas: ARENA.megas.map(m => [m.x, m.z, m.yaw, m.run]), roofKick: [ARENA.roofKick.x, ARENA.roofKick.z, ARENA.roofKick.yaw], gates: ARENA.gates.map(g => [g.x, g.z, g.tx, g.tz]), trackLen: ARENA.trackLen, len: ARENA.len, C: ARENA.C, wall: free.wall && { s: free.wall.s, y: free.wall.y, v: free.wall.v, dist: free.wall.dist } },
  lap: () => free.lap && { ...free.lap },
  hop: () => { free.hopReq = true; free.hopLock = false; },
  key: (k, v) => { input[k] = v; },
  pro: on => startFree(false, on),
  time: k => { if (k) setTime(k); return TIME; },
  links: () => ROADS.filter(r => r.link).map(r => ({ name: r.name, pts: r.pts })),
  roadsAll: () => ROADS.map(r => ({ name: r.name, c: r.c, w: r.w, deck: !!r.deck, pts: r.pts })),
  // проверка дорог и высот: ступеньки вдоль улиц (машина не проедет больше 0,7 м за шаг), стыки мостов, склон лицом вверх,
  // предметы на склоне — на земле
  audit() {
    const out = { roads: 0, samples: 0, steps: [], deckEnds: [], hillUp: 0, items: { checked: 0, off: 0 }, poles: { checked: 0, onRoad: 0, where: [] } };
    ROADS.forEach(r => {
      if (r.c > 2) return; out.roads++;
      let prev = null, py = null;
      for (let i = 1; i < r.pts.length; i++) {
        const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i], L = Math.hypot(bx - ax, bz - az);
        for (let t = 0; t < L; t += 2) {
          const x = ax + (bx - ax) * t / L, z = az + (bz - az) * t / L; if (!inStrip(x, z) || waterAt(x, z) && !(DECKS.length && deckAt(x, z, 1e3))) { prev = null; continue; }
          if (solidsNear(x, z).some(b => b.h > (py ?? 0) + .7 && inBox(b, x, z, 0))) { prev = null; continue; }   // улица уходит под дом — это не яма дороги
          const h = groundAt(x, z, (py ?? surfaceH(x, z)) + .6).h; out.samples++;
          if (prev && Math.abs(h - py) > .7 && out.steps.length < 30) out.steps.push([r.name || "без имени", Math.round(x), Math.round(z), +(h - py).toFixed(2)]);
          prev = [x, z]; py = h;
        }
      }
    });
    DECKS.forEach(d => [d.s0, d.s1].forEach(se => { const x = d.cx + d.dx * se + d.nx * d.lc, z = d.cz + d.dz * se + d.nz * d.lc; out.deckEnds.push(+(deckH(d, se) - terrainH(x, z)).toFixed(2)); }));
    const nrm = HILL.mesh.geometry.attributes.normal; let up = 0; for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) > 0) up++; out.hillUp = +(up / nrm.count).toFixed(3);
    const m4 = new T.Matrix4(), v = new T.Vector3();
    scene.traverse(o => {      // столбы (высокие узкие экземпляры: светофоры, фонари, опоры трамвая) — не на проезжей части
      if (!o.isInstancedMesh) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox;
      if (bb.max.y - bb.min.y < 2.5 || Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) > 1.2) return;
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); v.setFromMatrixPosition(m4); out.poles.checked++; if (onCarriageway(v.x, v.z, 0)) { out.poles.onRoad++; if (out.poles.where.length < 10) out.poles.where.push([Math.round(v.x), Math.round(v.z)]); } }
    });
    scene.traverse(o => { if (!o.isInstancedMesh) return; o.updateMatrixWorld(); for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); v.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld); const t = terrainH(v.x, v.z); if (t < 1) continue; out.items.checked++; if (v.y < t - .5) out.items.off++; } });
    return out;
  },
  ground: (x, z, y) => { const g = groundAt(x, z, y); return { h: g.h, deck: !!g.deck, hill: !!g.hill, ter: terrainH(x, z), solid: (hitSolid(x, z, y + .2) || {}).name || "" }; },
  decks: () => DECKS.map(d => ({ name: d.name, cx: d.cx, cz: d.cz, dx: d.dx, dz: d.dz, nx: d.nx, nz: d.nz, s0: d.s0, s1: d.s1, lc: d.lc, hw: d.hw, H: d.H })),
  wheels: () => { const U = carObj.userData; return { wa: U.wa || 0, st: U.st || 0, brake: U.redM.emissiveIntensity }; },
  puffs: () => pool.filter(q => q.on).length,
  ctl: () => ({ thr: thr(), brk: brk(), turn: turn(), tilt: { ...tilt }, cam: camMode }),
  slalom: () => ({ gates: INNER.gates.map(g => [g.x, g.y, g.z]), s: free.slalom && { ...free.slalom } }),
  setPos: (x, y, z) => { car.x = x; car.y = y; car.z = z; },
  bowlH: (x, z) => { const b = ARENA && ARENA.bowl(x, z); return b ? b.h : null; },
  slopeRoll: () => car.slopeRoll || 0,
  boosts: () => BOOSTS.map(o => ({ kind: o.kind, x: o.x, z: o.z, y: o.y, yaw: o.yaw })),
  proState: () => ({ pro: !!free.pro, flying: !!free.proA, gas, alt: free.proA && free.proA.alt }),
  show: () => free.show && { lap: free.show.lap, clean: free.show.clean, drift: free.show.drift, mult: free.show.mult, spins: free.show.spins, seq: free.show.seq },
  showBest: () => save.eightShowBest || 0,
  camSet: (...a) => { window.__camOv = a.length ? a : null; },
  party: on => on === false ? PARTY.stop() : on ? PARTY.start(false, true) : PARTY.state(),
  ARENA, INNER, EIGHT, salute: (x, y, z, n) => SHOW.salute(x, y, z, n), puff: (x, y, z, vx, vy, vz, life, s) => puff(new T.Vector3(x, y, z), new T.Vector3(vx, vy, vz), life, s),
  setTime: k => setTime(k), paint: i => setPaint(i),
  RAILB, SHIPS, UNDER, KINO, WAKE, snd: () => ({ src: ENGINE_SND, ready: sfx.engReady(), broken: sfx.broken() }), photo: on => (PHOTO.force(on !== false), true), PHOTO,
  scenes: () => SCENES.map(sc => ({ name: sc.name, state: sc.state, d: Math.round(sc.d), ms: sc.ms, work: Math.round(sc.work || 0), chunks: sc.chunks.length, solids: sc.solids.length })),
  cine(on, cap) {                // съёмка: игра стоит, кадр рисуется по cineStep; интерфейс спрятан, поле — на весь экран
    CINE.on = !!on; document.body.classList.toggle("cine", CINE.on);
    if (!$("cinecap")) { const d = document.createElement("div"); d.id = "cinecap"; d.className = "cinecap"; stage.appendChild(d); }
    resize();
  },
  cineCap(html) { const d = $("cinecap"); d.innerHTML = html || ""; d.style.opacity = html ? 1 : 0; },
  cineStep(dt, p, cam, skip) {         // p: { x, y, z, yaw, pitch, roll (°), v, air, q: [x,y,z,w], up: [x,y,z] }; cam: [x,y,z, lx,ly,lz, fov]
    car.x = p.x; car.y = p.y; car.z = p.z; car.yaw = p.yaw || 0; car.pitch = p.pitch || 0; car.roll = p.roll || 0; car.v = p.v || 0;
    car.bodyRoll = car.bodyPitch = car.slopeRoll = 0; free.air = !!p.air; free.wall = free.tube = free.aero = null; free.cat = null;
    CINE.q = p.q ? new T.Quaternion().fromArray(p.q) : null; CINE.up = p.up ? new T.Vector3().fromArray(p.up) : null; CINE.noShadow = !!p.noShadow;
    window.__camOv = cam; time += dt;
    tickScenes(); tickTraffic(dt); if (RAILB) RAILB.tick(dt); SHIPS.tick(dt); tickPuffs(dt); tickSignals(performance.now() / 1000); SHOW.tick(dt); PARTY.tick(dt);
    if (!skip) render(dt);
  },
  showSet: o => { if (free.show) Object.assign(free.show, o); },
  driftKit: () => ({ on: !!free.driftKit, ui: driftUI(), ang: dwheel.ang, badge: !!save.badge888, wheels: carObj.userData.wheels.map(w => w.drift.visible) }),
  flowSet: (laps, v) => { if (free.tube) { free.tube.laps = laps; free.tube.v = v; } },
  irace: () => INNER && INNER.race.state(), iraceAt: (s, lane) => INNER.race.at(s, lane),
  inner: () => INNER && { pad: INNER.pad, padE: INNER.padE, slide0: INNER.slide.frame(0), slideLen: INNER.slide.len, flowLen: INNER.flow.len, aero: free.aero && { ...free.aero }, tube: free.tube && { s: free.tube.s, v: free.tube.v, laps: free.tube.laps, flow: !!free.tube.path.flow, lift: !!free.tube.lift } },
  teleport(x, z, yaw, y = 0) { car.x = x; car.z = z; car.yaw = yaw; tickScenes(true); car.y = Math.max(y, surfaceH(x, z)); car.v = 0; car.vy = 0; car.roll = car.om = car.pitch = 0; car.vl = car.bodyRoll = car.bodyPitch = 0; free.air = false; free.wall = null; free.aero = null; free.tube = null; free.lap = null; phase = "free"; camPos.set(x, car.y + 4, z); zoneAt = -1; free.safe = { x, z, yaw, y: car.y }; }
};
requestAnimationFrame(frame);
