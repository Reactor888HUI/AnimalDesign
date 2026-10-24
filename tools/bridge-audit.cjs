// Аудит ж/д моста: бот проезжает и роняет машину по всем элементам моста с разных сторон, под разными углами и на разных
// скоростях (физика игры шагами 1/120 с, без отрисовки) и ищет «дыры»: провал сквозь настил / пролёт / проход / перила,
// падение кувырком после аварии сквозь мост, застревание. Печатает сводку и все подозрительные случаи.
// Запуск: PW=$(npm root -g)/playwright node tools/bridge-audit.cjs [фильтр]
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const p = await (await b.newContext({ viewport: { width: 320, height: 200 } })).newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.addInitScript(() => localStorage.setItem("baklan3d-v1", JSON.stringify({ unlocked: 1, quality: "low", trained: true, partyFx: false, kino: false })));
  await p.clock.install();
  await p.goto("file://" + path.resolve(__dirname, "../arcade/index.html") + "#test");
  await p.clock.runFor(2500);
  await p.evaluate(() => { const R = __t.RAILB, a = R.at(R.L / 2, 0); __t.teleport(a.x, a.z, R.yaw, 10); __t.fast(true); });
  for (let i = 0; i < 8; i++) await p.clock.runFor(500);
  const G = await p.evaluate(() => { const R = __t.RAILB; return { L: R.L, A1: R.A1, A2: R.A2, Y0: R.Y0, HW: R.HW, GAP0: R.GAP0, GAP1: R.GAP1, ARCH: R.ARCH }; });
  const { L, A1, A2, HW, GAP0, GAP1 } = G, RL = HW - .9;
  // сценарии: [имя, s, l, y (null — по поверхности), курс относительно моста (рад, 0 — к югу +s, π — к городу), скорость, руль (−1…1) с момента t, газ, пролёт поднят, время]
  const sc = [];
  const add = (name, s, l, y, yaw, v, steer = 0, steerT = 0, lift = 0, T = 6, thr = 1) => sc.push({ name, s, l, y, yaw, v, steer, steerT, lift, T, thr });
  for (const lift of [0, 1]) {
    // 1. по настилу вдоль всего моста в обе стороны, по разным полосам
    for (const l of [-4.6, -2.2, 0, 2.2, 4.6]) for (const v of [14, 30]) { add(`настил→ l${l} v${v} lift${lift}`, -20, l, null, 0, v, 0, 0, lift, 14); add(`настил← l${l} v${v} lift${lift}`, L + 20, l, null, Math.PI, v, 0, 0, lift, 14); }
    // 2. жёлтые пандусы и перила: правильный заезд, с «обратной» стороны, со смещением, под углом, с рулём в сторону ферм и к середине
    const ramps = [["пандус у пролёта", A2 + 1 - 14, 0], ["пандус у разрыва (север)", GAP0 + 22, Math.PI], ["пандус к разрыву", GAP1 - 26, 0], ["пандус с юга", L - 2 + 0, Math.PI], ["перила середина ←", GAP1 + 20, Math.PI], ["перила середина →", A2 + 14, 0]];
    for (const [nm, s0, yaw] of ramps) for (const k of [-1, 1]) for (const dl of [-.9, -.4, 0, .4, .9]) for (const da of [-.25, 0, .25]) for (const st of [0, 1, -1]) for (const v of [12, 26])
      add(`${nm} k${k} dl${dl} a${da} руль${st} v${v} lift${lift}`, s0, k * (RL + dl), null, yaw + da, v, st * .5, 1.2, lift, 5);
    // 3. пояса арок: заезд с города и с края пролёта, руль в стороны (соскальзывание)
    for (const k of [-1, 1]) for (const st of [0, .4, -.4, 1, -1]) { add(`пояс север k${k} руль${st} lift${lift}`, -30, k * HW, null, 0, 24, st, 2.5, lift, 9); add(`пояс юг с пролёта k${k} руль${st} lift${lift}`, A2 - 30, k * HW, lift ? 50 : null, 0, 26, st, 2.5, lift, 9); }
    // 4. трамплины-«ступеньки» и трамплины пролёта
    for (const l of [-1.5, 0, 1.5]) for (const v of [20, 34]) { add(`ступенька север l${l} v${v} lift${lift}`, A1 - 70, l, null, 0, v, 0, 0, lift, 6); add(`ступенька юг l${l} v${v} lift${lift}`, A2 + 70, l, null, Math.PI, v, 0, 0, lift, 6); }
  }
  // 5. сбросы с высоты над всем мостом: машина падает (как после неудачного трюка) — должна сесть на что-то или разбиться, но не провалиться
  for (let s = -6; s <= L + 6; s += 3) for (const l of [-7.4, -6.6, -6, -5.5, -5, -4.6, -3, 0, 3, 4.6, 5, 5.5, 6, 6.6, 7.4]) for (const lift of [0, 1]) add(`сброс s${s.toFixed(0)} l${l} lift${lift}`, s, l, 30, 0, 4, 0, 0, lift, 4, 0);
  // 6. авария на ходу (кувырок) — должна лечь на мост
  for (let s = 10; s < L - 5; s += 9) for (const l of [-5.6, -4.6, 0, 4.6, 5.6]) for (const lift of [0, 1]) add(`кувырок s${s.toFixed(0)} l${l} lift${lift}`, s, l, "crash", 0, 10, 0, 0, lift, 2, 0);
  const filt = process.argv[2]; const list = filt ? sc.filter(c => c.name.includes(filt)) : sc;
  const bad = [], crashes = new Map(); let n = 0;
  for (let i = 0; i < list.length; i += 40) {
    const res = await p.evaluate(batch => batch.map(c => {
      const R = __t.RAILB, st = R.st, dt = 1 / 120, F = __t.free();
      st.t = c.lift ? 40 : 2; st.y = c.lift ? R.LIFT : 0; st.train.on = false;
      const a = R.at(c.s, c.l), yaw = R.yaw - c.yaw * 0 + (c.yaw ? 0 : 0);   // курс считаем ниже
      const hdg = Math.atan2(-(R.dir.z * Math.cos(c.yaw) + R.nrm.z * Math.sin(c.yaw)), R.dir.x * Math.cos(c.yaw) + R.nrm.x * Math.sin(c.yaw));
      const crashAt = c.y === "crash";
      __t.teleport(a.x, a.z, hdg, crashAt ? 0 : c.y == null ? 0 : c.y);
      if (c.y == null || crashAt) { const g = R.ground(a.x, a.z, (c.lift && c.s > R.A1 - 1 && c.s < R.A2 + 1 ? R.Y0 + R.LIFT : R.Y0) + 3); __t.teleport(a.x, a.z, hdg, g ? g.h : 0); }   // на настил (пролёт), а не на верхнюю ферму
      const car = __t.car(); __t.setCar({ v: c.v, yaw: hdg });
      if (typeof c.y === "number") __t.setCar({ air: true, vy: 0, v: c.v, yaw: hdg });
      if (crashAt) { __t.setCar({ y: __t.car().y + 1.2 }); __t.crash("тест"); }
      const log = [], out = { name: c.name, ev: [] }; let py = __t.car().y, prevPhase = __t.car().phase, still = 0;
      const deckH = (s, l) => { const lifted = s > R.A1 - .45 && s < R.A2 + .45; if (s < 1 || s > R.L - 1 || Math.abs(l) > R.HW - .3) return null; return lifted ? R.Y0 + st.y : R.Y0; };
      for (let k = 0; k < c.T * 120; k++) {
        const t = k * dt; __t.input({ thrust: c.thr > 0, rr: c.steer > 0 && t > c.steerT, rl: c.steer < 0 && t > c.steerT, half: Math.abs(c.steer) < 1 });
        __t.step(dt);
        const q = __t.car(), [s, l] = R.loc(q.x, q.z);
        if (q.phase !== prevPhase) { out.ev.push(`${prevPhase}→${q.phase} s${s.toFixed(1)} l${l.toFixed(2)} y${q.y.toFixed(1)} ${__t.toast()}`); prevPhase = q.phase; }
        if (Math.hypot(q.x - a.x, q.z - a.z) > 900) break;   // вернули на дорогу
        const dh = deckH(s, l);
        if (dh != null && py >= dh - .15 && q.y < dh - .9) { out.fall = `сквозь настил s${s.toFixed(1)} l${l.toFixed(2)} ${py.toFixed(1)}→${q.y.toFixed(1)} ${q.phase}`; break; }
        if (q.phase === "free" && !q.air && Math.abs(q.v) < .3 && c.thr) still += dt; else still = 0;
        if (still > 2) { out.stuck = `стоит s${s.toFixed(1)} l${l.toFixed(2)} y${q.y.toFixed(1)}`; break; }
        py = q.y;
      }
      __t.input({}); return out;
    }), list.slice(i, i + 40));
    for (const r of res) {
      n++;
      if (r.fall || r.stuck) bad.push(r);
      for (const e of r.ev) if (/fcrash/.test(e) && /→fcrash/.test(e)) { const why = e.replace(/.*y[-\d.]+ /, ""); crashes.set(why, (crashes.get(why) || 0) + 1); }
    }
    process.stdout.write(`\r${n}/${list.length}  проблем: ${bad.length}   `);
  }
  console.log(`\nсценариев: ${n}, провалов/застреваний: ${bad.length}`);
  for (const r of bad.slice(0, 60)) console.log("  ✗", r.name, "—", r.fall || r.stuck, "|", r.ev.slice(0, 3).join(" ; "));
  console.log("аварии по причинам:"); [...crashes].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v} × ${k}`));
  console.log("errors", errs.slice(0, 3));
  await b.close(); process.exit(bad.length || errs.length ? 1 : 0);
})();
