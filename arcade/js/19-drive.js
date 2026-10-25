// «Восьмёрка Баклажан» — физика свободной езды, езда по стене, PRO-полёт.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- физика свободной езды ---------- */
function groundAt(x, z, y = -1) {   // y — высота машины: крыша считается землёй, только если машина над ней
  let h = terrainH(x, z), slope = 0, roof = null;
  for (const k of kickers) {
    const dx = x - k.x, dz = z - k.z, u = dx * k.fx + dz * k.fz, w = -dx * k.fz + dz * k.fx;
    if (u >= 0 && u <= k.len && Math.abs(w) <= k.w / 2 && !(k.y0 && y < k.y0 - 1)) {
      const hh = k.y0 + (k.curve ? k.h * (u / k.len) ** 2 : k.h * u / k.len);
      if (hh > h) { h = hh; slope = k.curve ? Math.atan(2 * k.h * u / (k.len * k.len)) : Math.atan(k.h / k.len); }
    }
  }
  // крыша Арены «ловит» и с 4 м ниже: на выезде из чаши и при подлёте чуть ниже края
  if (y > .6) for (const b of solidsNear(x, z)) if (b.rings && b.h <= y + (b.arena ? 4 : .6) && b.h > h && inBox(b, x, z, 0)) { h = b.h; slope = 0; roof = b; }
  const dk = DECKS.length && deckAt(x, z, y);   // настил моста с пандусами
  let ex = RAILB && RAILB.ground(x, z, y); const sp = SHIPS.ground(x, z, y); if (sp && (!ex || sp.h > ex.h)) ex = sp;   // ж/д мост, суда
  if (ex && ex.h > h && (!dk || ex.h > dk.h)) return Object.assign(ex, { roof: null });
  if (dk && dk.h > h) return { h: dk.h, slope: dk.slope, roof: null, rx: dk.rx, rz: dk.rz, deck: true };
  if (!roof && h > 0 && slope === 0) {           // склон правого берега: уклон по ходу и крен поперёк — как на трибуне
    const [gx, gz] = terrainN(x, z), g = Math.hypot(gx, gz);
    if (g > 1e-3) return { h, slope: Math.atan(g), roof: null, rx: gx / g, rz: gz / g, hill: true };
  }
  const bw = ARENA && ARENA.bowl(x, z);   // чаша Арены: трибуны — рампа от поля до крыши
  if (bw && bw.h > h) return { h: bw.h, slope: bw.slope, roof: null, bowl: true, rx: bw.rx, rz: bw.rz };
  return { h, slope, roof };
}
function hitSolid(x, z, y) {
  const mv = SHIPS.hit(x, z, y) || (RAILB && RAILB.hit(x, z, y)); if (mv) return mv;   // рубки судов, башни и перила ж/д моста, поезд
  for (const d of DECKS) {                       // парапет моста — стенка на уровне настила
    const ox = x - d.cx, oz = z - d.cz, s = ox * d.dx + oz * d.dz, l = Math.abs(ox * d.nx + oz * d.nz - d.lc);
    if (s > d.s0 + 6 && s < d.s1 - 6 && l > d.hw - .5 && l < d.hw + 1) { const h = deckH(d, s); if (y > h - 1 && y < h + 1.1 && h - terrainH(x, z) > 1) return { name: "парапет моста", h: h + 1.05 }; }
  }
  for (const b of solidsNear(x, z)) if (y < b.h && inBox(b, x, z, 1.1)) return b;
  for (const b of rowSolids) if (y < b.h && inBox(b, x, z, 1.1)) return b;
  for (const c of traffic) if (y < c.H + .3 && Math.abs(x - c.x) < c.L / 2 + 2 && Math.abs(z - c.z) < 1.8) return { name: c.kind === "bus" ? "автобус" : c.kind === "van" ? "маршрутку" : "машину в потоке" };
  return null;
}

function applyLook() {                         // в PRO — баклажан с широким обвесом, иначе — как выбрано в «⋯»
  const pro = mode === "free" && free.pro;
  setPaint(pro ? -1 : paintIdx()); setTune(pro ? "pro" : save.tune || 0);
  if (SUV && SUV.on) VAZ_PARTS.forEach(o => { o.visible = false; });   // выбран внедорожник — «восьмёрку» (и её обвес) не показываем
}
// старт свободной езды — перед главным входом Арены, лицом к баннеру «Миша, с днём рождения!» (в автотестах — автобан, как раньше)
const START = ARENA && location.hash !== "#test" ? (() => { let best = ARENA.at(0); for (let s = 0; s < ARENA.len; s += 1) { const q = ARENA.at(s); if (q.x > best.x) best = q; }
  return { x: best.x + best.nx * 80, z: best.z + best.nz * 80, yaw: Math.atan2(best.nz, -best.nx) }; })() : SPAWN;
function startFree(toast = true, pro = false) {
  mode = "free"; stopReplay(); hideLesson();
  $("ov-menu").hidden = $("ov-res").hidden = true;
  L = FREE; buildLevel(); freshCar();
  car.x = START.x; car.z = START.z; car.yaw = START.yaw;
  if (/^#(side|rear|front|corner)(-pro)?$/.test(location.hash)) { car.x = -400; car.z = 180; if (/-pro$/.test(location.hash)) pro = true; }   // чертёжные виды — на пустом месте
  Object.assign(free, { air: false, airT: 0, cork: false, ringBonus: 0, safe: { ...START }, safeT: 0, gh: 0, hopLock: false, wall: null, aero: null, tube: null, lap: null, pro, proA: null });
  proGroup.visible = pro; applyLook();
  assistOn = save.assist;
  phase = "free";
  if (toast) showToast(pro ? "PRO ∞ · Бесконечный Безлимит" : "Свободная езда", "", 1800);
}
/* ---------- присоски: езда по стене Ростов Арены ---------- */
// С разгона (больше 10 м/с) въезжаете в стену — турбины переходят на всасывание, машина едет по фасаду.
// Газ — скорость, тормоз — медленнее, джойстик влево — вверх, вправо — вниз. Присоски тянут газ из баллонов:
// кончился газ или скорость упала — машина отваливается. ПРЫГ — оттолкнуться от стены.
function wallAttach() {
  const A = ARENA, nr = A.nearest(car.x, car.z), p = A.at(nr.s);
  const fx = Math.cos(car.yaw), fz = -Math.sin(car.yaw), along = fx * p.tx + fz * p.tz;
  free.wall = { s: nr.s, y: Math.max(1.2, Math.min(A.H - 2, car.y + WHEEL)), v: Math.max(12, Math.abs(car.v) * Math.max(.75, Math.abs(along))), dir: along >= 0 ? 1 : -1,
    th: free.air ? Math.max(-.5, Math.min(.5, Math.atan2(car.vy || 0, Math.abs(car.v) + 1))) : .3, dist: 0, paid: 0, p };
  free.air = false; car.vy = 0; car.roll = 0; car.om = 0; car.pitch = 0; car.vl = 0; car.bodyRoll = car.bodyPitch = 0;
  sfx.burst(); queueToast("Присоски!", "good", 1400);
}
function stepWall(dt) {
  const w = free.wall, A = ARENA, th = thr(), bk = brk(), st = turn();
  w.v = Math.max(0, Math.min(VMAXF, w.v + (th * 12 - bk * 20) * dt - w.v * .015 * dt));
  w.th = Math.max(-.8, Math.min(.8, w.th - st * 1.0 * dt));
  if (Math.abs(st) < .05) w.th *= Math.pow(.45, dt);              // без руля едем горизонтально
  gas = Math.max(0, gas - 6 * dt);
  const sag = w.v < 15 && !free.pro ? (15 - w.v) * .9 : 0, vs = w.v * Math.cos(w.th), vy = w.v * Math.sin(w.th) - sag;
  w.s += w.dir * vs * dt; w.y += vy * dt; w.dist += vs * dt;
  if (w.y > A.H - 1.2) { w.y = A.H - 1.2; if (w.th > 0) w.th = 0; }
  const p = w.p = A.at(w.s);
  car.x = p.x + p.nx * WHEEL; car.z = p.z + p.nz * WHEEL; car.y = w.y - WHEEL; car.v = w.v;
  car.yaw = Math.atan2(-p.tz * w.dir, p.tx * w.dir);
  for (const r of rings) if (!r.got && Math.hypot(car.x - r.x, w.y - r.y, car.z - r.z) < 4.2) {
    r.got = true; r.m.material.color.setHex(0x6fdc8c); free.score += 300; showToast("Кольцо на стене +300", "good", 1200); sfx.ring();
    free.ringStreak = (free.ringStreak || 0) + 1; if (free.ringStreak >= 3) completeMission("rings3");
  }
  const jump = input.hop || free.hopReq; free.hopReq = false;
  if (!input.hop) free.hopLock = false;
  if (w.y <= .7 && vy <= 0) return wallLeave("ground");
  if (jump && !free.hopLock) { free.hopLock = true; return wallLeave("jump"); }
  if (!free.pro && (gas <= 0 || w.v < 6)) return wallLeave("fall");   // в PRO присоски держат сколько угодно
}
function wallLeave(how) {
  const w = free.wall, p = w.p; free.wall = null;
  const out = how === "jump" ? 9 : how === "fall" ? 3 : 0, tx = p.tx * w.dir, tz = p.tz * w.dir, vx = tx * w.v + p.nx * out, vz = tz * w.v + p.nz * out;
  car.yaw = Math.atan2(-vz, vx); car.v = Math.hypot(vx, vz); car.x = p.x + p.nx * 2.3; car.z = p.z + p.nz * 2.3; car.roll = 0; car.om = 0;
  if (w.dist > 25) {
    const pts = Math.round(w.dist * 2); free.score += pts; save.freeBest = Math.max(save.freeBest, free.score); persist();
    queueToast(`Присоски: ${Math.round(w.dist)} м по стене  +${pts}`, "good", 2200);
    if (w.dist >= 300) completeMission("wall");
  }
  if (how === "ground") { car.y = 0; free.air = false; return; }
  car.y = Math.max(0, w.y - WHEEL); takeoff(false); car.vy = how === "jump" ? 6 : 0;
}
/* ---------- PRO: полёт как в аэротрубе по всей карте ---------- */
// Газ — вперёд, тормоз — назад, руль — поворот, ПРЫГ (держать) — вверх, отпустили — плавно вниз до посадки.
// Баллоны не кончаются; о дома машина не бьётся, а отскакивает; в стену Арены — присоски.
function stepProAir(dt) {
  const th = thr(), bk = brk(), st = turn(), A = free.proA || (free.proA = { alt: car.y + Math.max(0, car.vy) ** 2 / (2 * G) * .9, boost: 0 });
  free.airT += dt; gas = 100;
  car.yaw -= st * 1.9 * dt;
  const cruise = A.boost > 0 ? 52 : 32; A.boost = Math.max(0, A.boost - dt);
  if (th) car.v += (cruise * th - car.v) * Math.min(1, dt * 1.2);
  else if (bk) car.v += (-12 * bk - car.v) * Math.min(1, dt * 1.4);
  else car.v *= Math.pow(A.boost > 0 ? .97 : .85, dt);
  if (input.hop || free.hopReq) A.alt = Math.min(160, Math.max(A.alt, car.y) + 12 * dt); else A.alt -= 4 * dt;
  free.hopReq = false;
  const g = groundAt(car.x, car.z, car.y), floor = g.h + (waterAt(car.x, car.z) ? 2 : 0);
  if (A.alt < floor) A.alt = floor - .6;
  car.vy += ((A.alt - car.y) * 2.2 - car.vy) * Math.min(1, dt * 2.5);
  const yPrev = car.y, nx = car.x + Math.cos(car.yaw) * car.v * dt, nz = car.z - Math.sin(car.yaw) * car.v * dt;
  car.y += car.vy * dt;
  const sol = hitSolid(nx, nz, car.y);
  if (sol && sol.arena && car.y < ARENA.H - 2 && Math.abs(car.v) > 4) { free.proA = null; return wallAttach(); }
  if (sol || nx < WORLD.x0 || nx > WORLD.x1 || nz < WORLD.z0 || nz > WORLD.z1) {
    car.v = -car.v * .3; if (!free.bumpCd) { showToast("Бум!", "bad", 900); sfx.thump(.4); free.bumpCd = 1; }
  } else { car.x = nx; car.z = nz; }
  free.bumpCd = Math.max(0, (free.bumpCd || 0) - dt);
  car.roll += (st * 28 - car.roll) * Math.min(1, dt * 4);
  car.pitch += (-(th - bk) * .12 + car.vy * .012 - car.pitch) * Math.min(1, dt * 4);
  if (Math.random() < .6) {
    const ang = car.yaw + Math.floor(Math.random() * 4) * Math.PI / 2, dx = Math.cos(ang), dz = -Math.sin(ang);
    puff(new T.Vector3(car.x + dx * 1.9, car.y + .5, car.z + dz * 1.9), new T.Vector3(dx * 7, -5, dz * 7), .35, .25);
  }
  for (const r of rings) if (!r.got && Math.hypot(car.x - r.x, car.y + .6 - r.y, car.z - r.z) < 2.9) { r.got = true; r.m.material.color.setHex(0x6fdc8c); free.ringBonus += 300; showToast("Кольцо +300", "good", 1200); sfx.ring(); }
  proBoost(true);
  const gl = groundAt(car.x, car.z, yPrev);
  if (car.y <= gl.h) {                              // посадка — дальше обычная «восьмёрка»; на руле — сразу в занос
    free.proA = null; car.roll = 0; car.pitch = 0; car.vy = Math.max(car.vy, -3);
    landFree(gl);
    if (!free.air && phase === "free" && Math.abs(st) > .3 && car.v > 12 && brk() > .4) car.vl = st * Math.min(6, car.v * .2);   // занос с посадки — только если держать тормоз
  }
}
