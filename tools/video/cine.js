// Сценарий ролика «Восьмёрка Баклажан · 888»: поза машины и камера на каждый момент времени t (с).
// Работает внутри страницы игры (#test): window.CINE_SCRIPT = { T, frame(t) → { p, cam, cap, ev } }.
(() => {
  const T = THREE, A = __t.ARENA, I = __t.INNER, [cx, cz] = A.C, H = A.H, L = A.trackLen, C3 = new T.Vector3(cx, 0, cz);
  const V = (x, y, z) => new T.Vector3(x, y, z), UP = V(0, 1, 0);
  const sm = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  const lerp = (a, b, k) => a + (b - a) * k;
  const gy = (x, z) => __t.ground(x, z, 3).h;
  const wrap = s => ((s % L) + L) % L;
  // трасса вокруг Арены: точка с боковым смещением lat (+ наружу)
  const trk = (s, lat = 0) => { const [x, z, tx, tz] = A.along(wrap(s)); let nx = -tz, nz = tx; if (nx * (x - cx) + nz * (z - cz) < 0) { nx = -nx; nz = -nz; } return { p: V(x + nx * lat, 0, z + nz * lat), n: V(nx, 0, nz), t: V(tx, 0, tz) }; };
  // ломаная с длиной дуги
  function Poly(pts) {
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const len = cum[cum.length - 1];
    const pos = d => { d = Math.max(0, Math.min(len, d)); let lo = 0, hi = pts.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; } const k = (d - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]); return pts[lo].clone().lerp(pts[hi], k); };
    return { len, pos, dir: (d, w = 2.5) => { const a = pos(d - w), b = pos(d + w); return b.sub(a).normalize(); } };
  }
  const curve = (pts, n) => new T.CatmullRomCurve3(pts, false, "centripetal").getSpacedPoints(n);
  const ground = pts => pts.map(p => V(p.x, gy(p.x, p.z), p.z));
  const drive = (tau, T0, v0, v1) => v0 * tau + (v1 - v0) * tau * tau / (2 * T0);     // путь при равноускоренном движении
  // ориентация: вперёд f, верх u, + крен (бочка) вокруг f и разворот вокруг u
  const qOf = (f, u) => { f = f.clone().normalize(); u = u.clone().addScaledVector(f, -f.dot(u)).normalize(); const z = new T.Vector3().crossVectors(f, u); return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(f, u, z)); };
  const rollQ = a => new T.Quaternion().setFromAxisAngle(V(1, 0, 0), a), yawQ = a => new T.Quaternion().setFromAxisAngle(V(0, 1, 0), a);
  const pose = (p, q, v, o = {}) => ({ p, q, v, ...o });
  const fwdOf = q => V(1, 0, 0).applyQuaternion(q), upOf = q => V(0, 1, 0).applyQuaternion(q), sideOf = q => V(0, 0, 1).applyQuaternion(q);

  /* ---------- ЧАСТЬ 1: к стадиону, номер 888 крупно, трюк → вечеринка ---------- */
  const s1 = .3 * L, K1 = trk(s1), kf = trk(s1 + 6).p.sub(trk(s1 - 6).p).normalize();
  // подъезд: с площади к северу от Арены, вливаемся в трассу за 110 м до трамплина
  const sJ = s1 - 110, J = trk(sJ), Jf = trk(sJ + 3).p.sub(trk(sJ - 3).p).normalize();
  const appr = curve([J.p.clone().addScaledVector(J.n, 120).addScaledVector(Jf, -70), J.p.clone().addScaledVector(J.n, 60).addScaledVector(Jf, -25), J.p.clone().addScaledVector(J.n, 14).addScaledVector(Jf, -4), J.p.clone()], 160);
  const onTrk = []; for (let s = sJ + 2; s <= s1 + 160; s += 2) onTrk.push(trk(s).p);
  const P1pts = ground(appr.concat(onTrk));
  // путь до трамплина должен быть ровно D1K — по скоростям: 0–9 с 20 м/с, 9–11 с 20→3, 11–16 с 3, 16–19.5 3→33
  const D1K = 20 * 9 + drive(2, 2, 20, 3) + 3 * 5 + drive(3.5, 3.5, 3, 33);
  let P1 = Poly(P1pts); const dK = (() => { let best = 0, bd = 1e9; for (let d = 0; d < P1.len; d += .25) { const q = P1.pos(d), e = Math.hypot(q.x - K1.p.x, q.z - K1.p.z); if (e < bd) { bd = e; best = d; } } return best; })();
  { const f0 = P1.dir(1), lead = D1K - dK; const pre = []; for (let k = Math.ceil(lead / 2); k >= 1; k--) pre.push(P1pts[0].clone().addScaledVector(f0, -k * lead / Math.ceil(lead / 2))); P1 = Poly(ground(pre).concat(P1pts)); }
  const vK = 33, ramp = Math.hypot(12, 3.6), ang = Math.atan2(3.6, 12), g = 13;
  const vy0 = vK * Math.sin(ang), vh = vK * Math.cos(ang), tAir1 = (vy0 + Math.sqrt(vy0 * vy0 + 2 * g * 3.6)) / g;
  const tK = 19.5, tR = tK + ramp / vK, tL1 = tR + tAir1;                            // въезд на трамплин, отрыв, посадка
  const dR = D1K + 12, dL1 = dR + vh * tAir1, tStop1 = tL1 + 3.4, dStop1 = dL1 + drive(3.4, 3.4, vh, 0);
  function car1(t) {
    let d, v;
    if (t < 9) { d = 20 * t; v = 20; }
    else if (t < 11) { d = 180 + drive(t - 9, 2, 20, 3); v = lerp(20, 3, (t - 9) / 2); }
    else if (t < 16) { d = 180 + drive(2, 2, 20, 3) + 3 * (t - 11); v = 3; }
    else if (t < tK) { d = D1K - drive(3.5, 3.5, 3, 33) + drive(t - 16, 3.5, 3, 33); v = lerp(3, 33, (t - 16) / 3.5); }
    else if (t < tR) { const k = (t - tK) / (tR - tK), p = P1.pos(D1K + 12 * k), f = P1.dir(D1K + 12 * k); p.y += 3.6 * k; const fu = f.clone(); fu.y = Math.tan(ang); return pose(p, qOf(fu, UP), vK); }
    else if (t < tL1) {                                                                       // полёт: бочка 360°
      const ta = t - tR, k = ta / tAir1, p = P1.pos(dR + vh * ta), f = P1.dir(dR + vh * ta); p.y += 3.6 + vy0 * ta - g * ta * ta / 2;
      const fu = f.clone(); fu.y = (vy0 - g * ta) / vh * .6; const q = qOf(fu, UP).multiply(rollQ(-Math.PI * 2 * sm(k)));
      return pose(p, q, vK, { air: true });
    }
    else if (t < tStop1) { d = dL1 + drive(t - tL1, 3.4, vh, 0); v = lerp(vh, 0, (t - tL1) / 3.4); }
    else { d = dStop1; v = 0; }
    const p = P1.pos(d), f = P1.dir(d); let q = qOf(f, UP);
    if (t > 26) q = yawQ(Math.PI * 2 * sm((t - 26) / 4.5)).multiply(q);                     // разворот на месте под музыку
    return pose(p, q, v);
  }
  function cam1(t, c) {
    const f = fwdOf(c.q), sd = sideOf(c.q), p = c.p;
    if (t < 4.5) { const k = t / 4.5; return [p.x - f.x * 13, p.y + lerp(7, 4, k), p.z - f.z * 13, p.x + f.x * 30, p.y + lerp(9, 11, k), p.z + f.z * 30, 55]; }
    if (t < 9) { const k = (t - 4.5) / 4.5; return [p.x + sd.x * 8 - f.x * lerp(4, -3, k), p.y + 1.3, p.z + sd.z * 8 - f.z * lerp(4, -3, k), p.x, p.y + .6, p.z, 45]; }
    if (t < 12.5) { const a = lerp(-1.9, .4, sm((t - 9) / 3.5)), r = 3.2; const ox = Math.cos(a) * f.x - Math.sin(a) * sd.x, oz = Math.cos(a) * f.z - Math.sin(a) * sd.z; return [p.x + ox * r, p.y + 4.6, p.z + oz * r, p.x, p.y + 1.2, p.z, 42]; }
    if (t < 16) { const k = sm((t - 12.5) / 3.5), s = -1; return [p.x - sd.x * s * 3.3 + f.x * lerp(-2.2, 1.6, k), p.y + .95, p.z - sd.z * s * 3.3 + f.z * lerp(-2.2, 1.6, k), p.x - sd.x * s * .8 - f.x * .2, p.y + .65, p.z - sd.z * s * .8 - f.z * .2, 40]; }
    if (t < tK - .3) { const b = P1.pos(Math.max(0, carD1(t) - 11)); return [b.x, b.y + 3.4, b.z, p.x + f.x * 8, p.y + 1, p.z + f.z * 8, 62]; }
    if (t < tL1 + 1.4) { const m = P1.pos(dR + vh * tAir1 * .5), mf = P1.dir(dR + vh * tAir1 * .5), ms = V(mf.z, 0, -mf.x); const side = ms.dot(m.clone().sub(C3)) > 0 ? 1 : -1; return [m.x + ms.x * side * 19 - mf.x * 6, m.y + 3.2, m.z + ms.z * side * 19 - mf.z * 6, p.x, p.y + 1.5, p.z, 50]; }
    if (t < 25.5) { const b = P1.pos(carD1(t) - 9); return [b.x, b.y + 3.2, b.z, p.x + f.x * 4, p.y + 1, p.z + f.z * 4, 58]; }
    const a = (t - 25.5) * .45 + 2.2, r = lerp(9, 13, sm((t - 25.5) / 6)); return [p.x + Math.cos(a) * r, p.y + lerp(2.2, 6, sm((t - 25.5) / 6)), p.z + Math.sin(a) * r, p.x, p.y + 1.4, p.z, 56];
  }
  function carD1(t) {                                                                        // пройденный путь (для камеры сзади)
    if (t < 16) return t < 9 ? 20 * t : t < 11 ? 180 + drive(t - 9, 2, 20, 3) : 180 + drive(2, 2, 20, 3) + 3 * (t - 11);
    if (t < tK) return D1K - drive(3.5, 3.5, 3, 33) + drive(t - 16, 3.5, 3, 33);
    if (t < tR) return D1K + 12 * (t - tK) / (tR - tK);
    if (t < tL1) return dR + vh * (t - tR);
    return t < tStop1 ? dL1 + drive(t - tL1, 3.4, vh, 0) : dStop1;
  }
  const END1 = 32;

  /* ---------- ЧАСТЬ 2: баннер, круг по трассе, стена + трюк, круг по крыше через кольца, Иммельман над баннером, в чашу ---------- */
  const t2 = END1;
  let sMain = 0; { let bx = -1e9; for (let s = 0; s < A.len; s += 1) { const q = A.at(s); if (q.x > bx) { bx = q.x; sMain = s; } } }
  const pm = A.at(sMain), PM = V(pm.x, 0, pm.z), PN = V(pm.nx, 0, pm.nz);
  // трасса: s у баннера, обход трамплинов по внешней стороне
  let sB = 0; { let bd = 1e9; for (let s = 0; s < L; s += .5) { const q = trk(s).p, e = Math.hypot(q.x - pm.x - pm.nx * 28, q.z - pm.z - pm.nz * 28); if (e < bd) { bd = e; sB = s; } } }
  const kick = [.3 * L, .72 * L], lat = s => kick.reduce((a, k) => { let d = wrap(s) - k; if (d > L / 2) d -= L; if (d < -L / 2) d += L; return a + 5.3 * (1 - sm((Math.abs(d) - 14) / 30)) * (d > -60 && d < 60 ? 1 : 0); }, 0);
  const sStart = sB - 190, sWall = sB + L + 70;                      // от подъезда к баннеру — круг — к стене
  const P2pts = []; for (let s = sStart; s <= sWall + 2; s += 2) { const q = trk(s, lat(s)); P2pts.push(q.p); }
  const P2 = Poly(ground(P2pts)), dB = sB - sStart;
  const tB0 = t2, tB1 = t2 + 4.4, tDec = 2.8, decel = 30 * tDec / 2, tLap0 = t2 + 9;   // подъезд 30 м/с → торможение у баннера → стоим → старт круга
  const tA1 = tLap0 + 4, vLap = 72, dA1 = dB + drive(4, 4, 0, vLap);
  const dWall0 = P2.len - 2, tLapEnd = tA1 + (dWall0 - 60 - dA1) / vLap;          // за 60 м до конца — сброс до 40 м/с
  const tTurnEnd = tLapEnd + 2 * 60 / (vLap + 40);
  function d2(t) {
    if (t < tB1) return dB - decel - 30 * (tB1 - t);
    if (t < tB1 + tDec) return dB - decel + drive(t - tB1, tDec, 30, 0);
    if (t < tLap0) return dB;
    if (t < tA1) return dB + drive(t - tLap0, 4, 0, vLap);
    if (t < tLapEnd) return dA1 + vLap * (t - tA1);
    return Math.min(P2.len, dA1 + vLap * (tLapEnd - tA1) + drive(Math.min(t, tTurnEnd) - tLapEnd, tTurnEnd - tLapEnd, vLap, 40));
  }
  // стена: от трассы — дуга к стене, въезд на фасад, вертикально вверх, трюк над кромкой, посадка на крышу
  const endT = trk(sWall), wN = A.nearest(endT.p.x, endT.p.z), WS = wN.s + 6, Wq = A.at(WS), WP = V(Wq.x, 0, Wq.z), WN = V(Wq.nx, 0, Wq.nz), WT = V(Wq.tx, 0, Wq.tz);
  const lapDirSign = Math.sign(WT.dot(trk(sWall + 3).p.sub(trk(sWall - 3).p))) || 1;     // направление круга по крыше = как по трассе
  const Rq = 2.5, toWall = curve([P2.pos(P2.len - 6), P2.pos(P2.len), WP.clone().addScaledVector(WN, 13).addScaledVector(WT, -lapDirSign * 2), WP.clone().addScaledVector(WN, Rq + 4), WP.clone().addScaledVector(WN, Rq)], 80);
  const PW = Poly(ground(toWall)), vW = 32, tW0 = tTurnEnd, tW1 = tW0 + PW.len / 36, tW2 = tW1 + (Math.PI / 2 * Rq) / vW, tW3 = tW2 + (H - Rq) / vW;
  const vyT = 19, gT = 13, tTr = 2 * vyT / gT + .05, inward = 21, tLand2 = tW3 + tTr;
  const roofK = A.roofK || .85, rp = s => { const q = A.at(s); return V(cx + (q.x - cx) * roofK, H, cz + (q.z - cz) * roofK); };
  const sRoof0 = WS, sRoofEnd = lapDirSign > 0 ? (sMain - 30 < WS ? sMain - 30 + A.len : sMain - 30) : (sMain + 30 > WS ? sMain + 30 - A.len : sMain + 30);
  const roofPts = []; for (let s = sRoof0; lapDirSign > 0 ? s <= sRoofEnd : s >= sRoofEnd; s += lapDirSign * 2) roofPts.push(rp(s));
  // в конце круга по крыше — к трамплину «ПРЫЖОК С КРЫШИ» над баннером (стоит на 15 м внутрь, смотрит наружу)
  const KS = PM.clone().addScaledVector(PN, -15), KE = PM.clone().addScaledVector(PN, -2);
  const last = roofPts[roofPts.length - 1], lastF = last.clone().sub(roofPts[roofPts.length - 2]).normalize();
  const toKick = curve([last, last.clone().addScaledVector(lastF, 12), KS.clone().addScaledVector(PN, -14).addScaledVector(lastF, 4), KS.clone().addScaledVector(PN, -5), KS], 60).map(p => V(p.x, H, p.z));
  const PR = Poly(roofPts.concat(toKick.slice(1))), vRoof = 50, tR0 = tLand2, tRa = tR0 + 2.5, dRa = drive(2.5, 2.5, 12, vRoof);
  const tRend = tRa + (PR.len - dRa) / vRoof;
  // Иммельман над баннером: трамплин → полупетля назад над фасадом → полубочка → пике в чашу на знак «888»
  const tKk = tRend, tKe = tKk + Math.hypot(13, 4) / vRoof, RL = 24;
  const LC = KE.clone().addScaledVector(PN, 0); LC.y = H + 4 + RL;                // центр полупетли
  const tLoop = Math.PI * RL / 30, tIm = tKe + tLoop, tDive = 3.6, tLand3 = tIm + tDive;
  const top = LC.clone(); top.y += RL;
  const padP = V(I.pad.x + PN.x * 2, .08, I.pad.z + PN.z * 2);
  function car2(t) {
    if (t < tW0) {                                                                               // баннер и круг по трассе
      const d = d2(t), p = P2.pos(d), f = P2.dir(d), v = t < tB1 ? 30 : t < tB1 + tDec ? lerp(30, 0, (t - tB1) / tDec) : t < tLap0 ? 0 : t < tA1 ? lerp(0, vLap, (t - tLap0) / 4) : t < tLapEnd ? vLap : lerp(vLap, 40, (t - tLapEnd) / (tTurnEnd - tLapEnd));
      let q = qOf(f, UP); const bank = f.clone().cross(P2.dir(d + 8)).y; q = q.multiply(rollQ(Math.max(-.12, Math.min(.12, bank * 1.5))));
      return pose(p, q, v);
    }
    if (t < tW1) { const d = (t - tW0) * 36, p = PW.pos(d), f = PW.dir(d, 1.5); return pose(p, qOf(f, UP), 36); }
    if (t < tW2) {                                                                               // дуга на стену: из горизонта в вертикаль
      const th = (t - tW1) / (tW2 - tW1) * Math.PI / 2, f = WN.clone().multiplyScalar(-Math.cos(th)).add(V(0, Math.sin(th), 0)), u = WN.clone().multiplyScalar(Math.sin(th)).add(V(0, Math.cos(th), 0));
      const p = WP.clone().addScaledVector(WN, Rq - Rq * Math.sin(th)); p.y = Rq - Rq * Math.cos(th); return pose(p, qOf(f, u), vW, { up: u, noShadow: true });
    }
    if (t < tW3) { const p = WP.clone(); p.y = Rq + (t - tW2) * vW; return pose(p, qOf(UP, WN), vW, { up: WN, noShadow: true }); }
    if (t < tLand2) {                                                                            // трюк: свечка над кромкой, сальто к центру + бочка, посадка вдоль круга
      const ta = t - tW3, k = ta / tTr, p = WP.clone().addScaledVector(WN, -inward * sm(k)); p.y = H + vyT * ta - gT * ta * ta / 2; if (k > .98) p.y = H;
      p.y = Math.max(H, p.y);
      const q0 = qOf(UP, WN), q1 = qOf(WT.clone().multiplyScalar(lapDirSign), UP), q = q0.clone().slerp(q1, sm(Math.min(1, k * 1.15))).multiply(rollQ(-Math.PI * 2 * sm(Math.min(1, k * 1.2))));
      return pose(p, q, vW, { air: true });
    }
    if (t < tRend) {                                                                             // круг по крыше через кольца
      const d = t < tRa ? drive(t - tR0, 2.5, 12, vRoof) : dRa + (t - tRa) * vRoof, p = PR.pos(d), f = PR.dir(d);
      return pose(p, qOf(f, UP), t < tRa ? lerp(12, vRoof, (t - tR0) / 2.5) : vRoof);
    }
    if (t < tKe) { const k = (t - tKk) / (tKe - tKk), p = KS.clone().lerp(KE, k); p.y = H + 4 * k; const f = PN.clone(); f.y = 4 / 13; return pose(p, qOf(f, UP), vRoof); }
    if (t < tIm) {                                                                               // полупетля назад над баннером
      const k = (t - tKe) / tLoop, a = -Math.PI / 2 + Math.PI * k, p = LC.clone().addScaledVector(PN, Math.cos(a) * RL); p.y = LC.y + Math.sin(a) * RL;
      const f = PN.clone().multiplyScalar(-Math.sin(a)).add(V(0, Math.cos(a), 0)), u = PN.clone().multiplyScalar(-Math.cos(a)).add(V(0, -Math.sin(a), 0));
      const q = qOf(f, u).multiply(rollQ(Math.PI * sm((k - .55) / .45)));                                         // в верхней точке — полубочка
      return pose(p, q, 30, { air: true });
    }
    if (t < tLand3) {                                                                            // пике в чашу: ещё одна бочка, плавный выход на знак «888»
      const k = (t - tIm) / tDive, e = sm(k), p = top.clone().lerp(padP, k); p.y = lerp(top.y, padP.y, Math.pow(k, 1.6));
      const dir = padP.clone().sub(top).setY(0).normalize(), f = dir.clone(); f.y = -lerp(.05, .5, k) * (1 - sm((k - .85) / .15));
      const q = qOf(f, UP).multiply(rollQ(-Math.PI * 2 * sm((k - .1) / .6)));
      return pose(p, q, 30, { air: true });
    }
    const dir = padP.clone().sub(top).setY(0).normalize(), k = t - tLand3;
    const p = padP.clone().addScaledVector(dir, 14 * (1 - Math.exp(-k * 1.4))), q = yawQ(Math.PI * 2 * sm((k - 2) / 4)).multiply(qOf(dir, UP));
    return pose(p, q, Math.max(0, 20 * Math.exp(-k * 1.4)));
  }
  function cam2(t, c) {
    const f = fwdOf(c.q), sd = sideOf(c.q), p = c.p;
    const chase = (back, up, look, fov, lag = 0) => { const d = Math.max(0, d2(t - lag) - back), b = P2.pos(d); return [b.x, b.y + up, b.z, p.x + f.x * look, p.y + 1, p.z + f.z * look, fov]; };
    if (t < tB1 + .5) { const k = sm((t - t2) / 5), o = PM.clone().addScaledVector(PN, 95).addScaledVector(WT, 28); return [o.x, lerp(5, 9, k), o.z, lerp(p.x, pm.x, .5), lerp(5, 13, k), lerp(p.z, pm.z, .5), 50]; }
    if (t < tLap0 + .6) { const b = p.clone().addScaledVector(f, -8).addScaledVector(PN, 6); return [b.x, 2.2, b.z, lerp(p.x, pm.x, .55), 8, lerp(p.z, pm.z, .55), 62]; }
    if (t < tLap0 + 4.5) return chase(9, 2.6, 8, lerp(60, 72, sm((t - tLap0) / 4)));
    if (t < tLap0 + 8.5) { const n = p.clone().sub(C3).setY(0).normalize(); return [p.x + n.x * 40 - f.x * 12, 22, p.z + n.z * 40 - f.z * 12, p.x + f.x * 6, p.y + 1, p.z + f.z * 6, 50]; }
    if (t < tLap0 + 12) { const b = P2.pos(d2(t) + 14); return [b.x + sd.x * 1.2, 1.3, b.z + sd.z * 1.2, p.x, p.y + .8, p.z, 55]; }
    if (t < tLapEnd - 1) { const a = Math.atan2(p.z - cz, p.x - cx) - .35; return [cx + Math.cos(a) * 230, 60, cz + Math.sin(a) * 230, p.x, 0, p.z, 26]; }
    if (t < tW2) { const o = WP.clone().addScaledVector(WN, 34).addScaledVector(WT, -lapDirSign * 16); return [o.x, 4, o.z, p.x, p.y + 2, p.z, 50]; }
    if (t < tW3 + .2) { const o = WP.clone().addScaledVector(WN, 17).addScaledVector(WT, -lapDirSign * 8); return [o.x, lerp(4, 14, sm((t - tW2) / (tW3 - tW2))), o.z, p.x, p.y + 1, p.z, 55]; }
    if (t < tLand2 + .8) { const o = WP.clone().addScaledVector(WN, -30).addScaledVector(WT, -lapDirSign * 22); return [o.x, H + 6, o.z, p.x, p.y + 1, p.z, 50]; }
    if (t < tR0 + 4.5) { const b = PR.pos(Math.max(0, (t < tRa ? drive(t - tR0, 2.5, 12, vRoof) : dRa + (t - tRa) * vRoof) - 9)); return [b.x, H + 3.2, b.z, p.x + f.x * 6, H + 1, p.z + f.z * 6, 62]; }
    if (t < tR0 + 8.5) { const s = sRoof0 + lapDirSign * 380, a = rp(s), b = rp(s - lapDirSign * 2), tt = a.clone().sub(b).normalize(), o = a.clone().addScaledVector(tt, 18).addScaledVector(V(tt.z, 0, -tt.x), 4); return [o.x, H + 1.4, o.z, p.x, p.y + 1.5, p.z, 50]; }
    if (t < tRend - 1.2) { const b = PR.pos(Math.max(0, dRa + (t - tRa) * vRoof - 10)); return [b.x, H + 4, b.z, p.x + f.x * 6, H + 1, p.z + f.z * 6, 64]; }
    if (t < tIm + .3) { const o = PM.clone().addScaledVector(PN, 58).addScaledVector(WT, 18); return [o.x, 24, o.z, lerp(pm.x + PN.x * 6, p.x, .5), lerp(46, p.y, .5), lerp(pm.z + PN.z * 6, p.z, .5), 66]; }
    if (t < tLand3 + .4) { const dir = padP.clone().sub(top).setY(0).normalize(), k = sm((t - tIm) / tDive); return [p.x - dir.x * 15 + WT.x * 4, p.y + lerp(7, 3.5, k), p.z - dir.z * 15 + WT.z * 4, p.x + dir.x * 12, p.y - lerp(4, 0, k), p.z + dir.z * 12, 62]; }
    const k = t - tLand3, a = Math.atan2(PN.z, PN.x) + .5 + k * .22, r = lerp(12, 18, sm(k / 6)); return [p.x + Math.cos(a) * r, lerp(5, 9, sm(k / 6)), p.z + Math.sin(a) * r, p.x - PN.x * 4, lerp(-1, 2, sm(k / 6)), p.z - PN.z * 4, 60];
  }
  const END = tLand3 + 9;
  // события (раз за кадр, на котором t их переходит) и титры
  const EV = [
    [tL1, () => { __t.salute(K1.p.x, 12, K1.p.z, 3); __t.party(true); }],
    [END1 - .01, () => __t.party(false)],
    [tLand2, () => { __t.salute(WP.x - WN.x * 20, H + 14, WP.z - WN.z * 20, 4); __t.party(true); }],
    [tIm - 1.2, () => __t.salute(LC.x + PN.x * 10, LC.y + 22, LC.z, 4)],
    [tLand3, () => { __t.salute(padP.x, 18, padP.z, 5); __t.party(true); }],
    [tLand3 + 2.5, () => __t.salute(padP.x - PN.x * 20, 26, padP.z, 5)],
    [tLand3 + 5, () => __t.salute(padP.x + WT.x * 20, 30, padP.z + WT.z * 20, 5)],
  ];
  const CAPS = [
    [0, 3.6, "ВОСЬМЁРКА БАКЛАЖАН<small>ролик 1 · к стадиону</small>"],
    [9.3, 12.4, "888 НА КРЫШЕ"], [12.7, 15.8, "888 НА ДВЕРЯХ<small>гоночный номер на обоих бортах</small>"],
    [tR - .2, tL1 + .3, "БОЧКА 360°"],
    [tL1 + 1.5, tL1 + 5.5, "ВЕЧЕРИНКА 888<small>неон · мигалки · пар · цветные пушки · лазеры · песня — минута</small>"],
    [t2, t2 + 3.4, "РОЛИК 2<small>Миша, с днём рождения!</small>"],
    [tLap0 + .2, tLap0 + 3, "КРУГ ПО ТРАССЕ ВОКРУГ АРЕНЫ"],
    [tW1, tW3 + .4, "НА СТЕНУ СТАДИОНА"],
    [tW3 + .4, tLand2 + .3, "СВЕЧКА · САЛЬТО · БОЧКА"],
    [tR0 + 1.2, tR0 + 4.4, "КРУГ ПО КРЫШЕ ЧЕРЕЗ КОЛЬЦА"],
    [tKe + .2, tIm + .5, "ИММЕЛЬМАН НАД БАННЕРОМ"],
    [tLand3 + 1, END, "С ДНЁМ РОЖДЕНИЯ, МИША!<small>парк развлечений Арены · вечеринка 888</small>"],
  ];
  const parts = [[0, END1, car1, cam1], [END1, END, car2, cam2]];
  window.CINE_SCRIPT = {
    T: END, marks: { tL1, END1, tLap0, tW0, tW3, tLand2, tR0, tRend, tKe, tIm, tLand3, END, lapLen: P2.len, roofLen: PR.len, dK, D1K },
    partyOn: [[tL1, END1], [tLand2, END]],
    frame(t, prevT) {
      const [, , cf, mf] = parts.find(([a, b]) => t < b) || parts[1];
      const c = cf(t), cam = mf(t, c);
      const evs = EV.filter(([te]) => te > prevT && te <= t).map(([, fn]) => fn);
      const cap = CAPS.find(([a, b]) => t >= a && t < b);
      return { c, cam, evs, cap: cap ? cap[2] : "" };
    },
  };
})();
