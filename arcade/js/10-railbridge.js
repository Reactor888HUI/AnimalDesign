// «Восьмёрка Баклажан» — ж/д разводной мост.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- железнодорожный разводной мост: стальной аттракцион (строится вместе с западной сценой) ---------- */
// По фото: две арки-фермы по краям (~130 м, верх арки на 24 м над настилом), посередине подъёмный пролёт ~75 м между
// двумя решётчатыми башнями (52 м над настилом, наверху домики механизмов, между ними верхняя ферма). Пролёт ходит
// вверх-вниз ровно, горизонтально: внизу по нему едут, наверху под ним проходят баржи.
// Аттракционы: северная арка (сторона города) — заезд по верхнему поясу арки, на вершине кольцо и разгон, рядом три
// кольца прыжка в Дон; южная (левый берег) — «перила»: узкие балки вдоль края с разрывом-прыжком; у подъёмного пролёта —
// трамплины-«ступеньки» с обеих арок и трамплины на самом пролёте: поднялся на «лифте» — и вылет над аркой.
// Время от времени по мосту идёт поезд: его крыши — тоже площадка.
// тёмная сталь ж/д моста (по референсу игрока): шлифованные листы с царапинами, стыки листов с тенью и ряды шестигранных
// болтов над стыками. Рисуется кодом (своя текстура, без чужих картинок), ложится на фермы по трём проекциям, тайл 2,4 м
const DARK_STEEL = (() => {
  const S = 512, c = document.createElement("canvas"); c.width = c.height = S; const g = c.getContext("2d");
  let sd = 4242; const r = () => (sd = sd * 16807 % 2147483647) / 2147483647;
  g.fillStyle = "#71787f"; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) { const x = r() * S, y = r() * S, rr = 60 + r() * 160, gr = g.createRadialGradient(x, y, 0, x, y, rr), d = r() < .5;   // пятна: светлее/темнее
    gr.addColorStop(0, d ? "rgba(40,46,54,.22)" : "rgba(170,178,186,.16)"); gr.addColorStop(1, "rgba(110,116,124,0)"); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  for (let i = 0; i < 2600; i++) { const y = r() * S, x = r() * S, l = 20 + r() * 140, a = .03 + r() * .07;   // шлифовка — тонкие штрихи вдоль листа
    g.fillStyle = r() < .5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`; g.fillRect(x, y, l, 1); g.fillRect(x + l - S, y, l, 1); }
  g.lineCap = "round";
  for (let i = 0; i < 420; i++) { const x = r() * S, y = r() * S, a = (r() < .6 ? -.9 : .5) + (r() - .5) * 1.4, l = 8 + Math.pow(r(), 2) * 150;   // царапины
    g.strokeStyle = `rgba(${r() < .8 ? "225,230,236" : "25,28,32"},${.08 + r() * .22})`; g.lineWidth = r() < .85 ? .7 : 1.4;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * .5 + (r() - .5) * 8, y + Math.sin(a) * l * .5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  [118, 374].forEach(y0 => {                                    // стыки листов: тёмная щель, светлая кромка и тень под ней
    const sh = g.createLinearGradient(0, y0, 0, y0 + 16); sh.addColorStop(0, "rgba(0,0,0,.45)"); sh.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = sh; g.fillRect(0, y0, S, 16);
    g.fillStyle = "#24282d"; g.fillRect(0, y0 - 3, S, 4); g.fillStyle = "rgba(220,226,232,.5)"; g.fillRect(0, y0 - 5, S, 1.5);
    for (let k = 0; k < 7; k++) { const x = 37 + k * 73, y = y0 - 22, R = 8.5;               // болты-шестигранники с бликом
      g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); for (let j = 0; j < 6; j++) g.lineTo(x + 2 + Math.cos(j * Math.PI / 3 + .52) * R, y + 3 + Math.sin(j * Math.PI / 3 + .52) * R); g.fill();
      const bg = g.createLinearGradient(x - R, y - R, x + R, y + R); bg.addColorStop(0, "#c3c9cf"); bg.addColorStop(.5, "#7c838a"); bg.addColorStop(1, "#3c4147");
      g.fillStyle = bg; g.beginPath(); for (let j = 0; j < 6; j++) g.lineTo(x + Math.cos(j * Math.PI / 3 + .52) * R, y + Math.sin(j * Math.PI / 3 + .52) * R); g.closePath(); g.fill();
      g.strokeStyle = "rgba(20,22,26,.8)"; g.lineWidth = 1.2; g.stroke(); g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(x - 3, y - 4, 4, 2); }
  });
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; t.encoding = T.sRGBEncoding; return t;
})();
// стальной материал моста (обычное качество): цвет вершин × текстура тёмной стали — только на холодно-серых (сталь), бетон и цветное не трогаем
function bridgeSteel(m) {
  m.extensions = { derivatives: true };
  m.onBeforeCompile = sh => {
    sh.uniforms.tSteel = { value: DARK_STEEL };
    sh.vertexShader = "varying vec3 vWP;\n" + sh.vertexShader.replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = "varying vec3 vWP; uniform sampler2D tSteel;\n" + sh.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      float spread = max(vColor.r, max(vColor.g, vColor.b)) - min(vColor.r, min(vColor.g, vColor.b));
      float steel = (1.0 - smoothstep(.1, .16, spread)) * smoothstep(-.005, .02, vColor.b - vColor.r);
      vec3 nW = normalize(cross(dFdx(vWP), dFdy(vWP))), bw = abs(nW); bw /= bw.x + bw.y + bw.z; vec3 p = vWP / 2.4;
      vec3 tx = texture2D(tSteel, p.zy).rgb * bw.x + texture2D(tSteel, p.xz).rgb * bw.y + texture2D(tSteel, p.xy).rgb * bw.z;
      diffuseColor.rgb *= mix(vec3(1.0), tx * 1.9, steel);`);
  };
  return m;
}
const RAILB = WEST.lb && WEST.lb.length ? (() => {
  const long = WEST.lb.map(([, a]) => dm(a)).filter(p => Math.hypot(p[p.length - 1][0] - p[0][0], p[p.length - 1][1] - p[0][1]) > 250);
  if (!long.length) return null;
  const N = [0, 0], S = [0, 0];                       // N — конец у города (больше z), S — левый берег
  long.forEach(p => { let a = p[0], b = p[p.length - 1]; if (a[1] < b[1]) [a, b] = [b, a]; N[0] += a[0] / long.length; N[1] += a[1] / long.length; S[0] += b[0] / long.length; S[1] += b[1] / long.length; });
  const L = Math.hypot(S[0] - N[0], S[1] - N[1]), dx = (S[0] - N[0]) / L, dz = (S[1] - N[1]) / L, nx = -dz, nz = dx;
  const Y0 = 10, HW = 5.5, A1 = L * .39, A2 = L * .61, ARCH = 24, TOW = 52, LIFT = 40, RAMP = 95, SPANL = A2 - A1;
  const at = (s, l, y = 0) => new T.Vector3(N[0] + dx * s + nx * l, y, N[1] + dz * s + nz * l);
  const loc = (x, z) => { const ox = x - N[0], oz = z - N[1]; return [ox * dx + oz * dz, ox * nx + oz * nz]; };   // → (s, l)
  const yaw = Math.atan2(-dz, dx), C = at((A1 + A2) / 2, 0);
  const KIND_NAME = sh => SHIPS.name(sh);
  const RING_ON = 0xd8322c;                              // невзятое колесо — красное, взятое — зелёное
  const st = { y: 0, v: 0, t: 0, up: false, loaded: false, train: { s: -9999, on: false }, rings: [], ringT: 0, lights: null };
  const archH = (s, sa, sb) => { const u = (s - sa) / (sb - sa); return Y0 + ARCH * 4 * u * (1 - u); };
  const archD = (s, sa, sb) => { const u = (s - sa) / (sb - sa); return ARCH * 4 * (1 - 2 * u) / (sb - sa); };
  // верх пояса арки (по нему едут): у опор — вровень с настилом, дальше — на толщину пояса (0,95 м) над осью
  const chordTop = (s, sa, sb) => archH(s, sa, sb) + .95 * Math.max(0, Math.min(1, (s - sa) / 6, (sb - s) / 6));
  const archOf = s => s <= A1 ? [0, A1] : s >= A2 ? [A2, L] : null;
  // контактная сеть: порталы поперёк пути под арками (где арка выше 9 м), провод над каждым путём на 5,4 м; служебные проходы снаружи ферм
  const PORT = []; for (const [sa, sb] of [[0, A1], [A2, L]]) for (let s = sa + 12; s < sb - 12; s += 24) if (Y0 + ARCH * 4 * ((s - sa) / (sb - sa)) * (1 - (s - sa) / (sb - sa)) - Y0 > 9) PORT.push(s);
  const WALK = HW + 1.15, RAILW = HW + 1.75, WIRE = 5.4;
  const ramp = (s, a, b, h0, h1) => h0 + (h1 - h0) * smooth(Math.max(0, Math.min(1, (s - a) / (b - a))));
  // ---------- поверхности (s — вдоль моста от города, l — поперёк) ----------
  // каждая: [s0, s1, l0, l1, h(s), slope(s), допуск снизу, разгон]
  const side = r => (r.side = true, r);                // жёлтый пандус: бока твёрдые
  // разгонные участки рельсов перед «ступеньками» (светятся): [s0, s1, куда разгоняют вдоль моста]
  const BOOST = [[A1 - 62, A1 - 30, 1], [A2 + 30, A2 + 62, -1]];
  const KS = 12, KH = 2.2, KB = 7;                       // трамплины: длина, высота, задний скат (горб — проезжается в обе стороны)
  // горб: с lo по hi подъём на KH (вылет на hi), за hi — пологий спуск KB м к back; поверх пролёта — вместе с ним (lift)
  const hump = (lo, hi, l0, l1, lift) => {
    const sg = Math.sign(hi - lo), back = hi + sg * KB, y0 = () => Y0 + (lift ? st.y : 0);
    const h = s => { const u = (s - lo) * sg; return y0() + (u <= KS ? KH * u / KS : KH * Math.max(0, 1 - (u - KS) / KB)); };
    const sl = s => ((s - lo) * sg <= KS ? sg * Math.atan(KH / KS) : -sg * Math.atan(KH / KB));
    return side([Math.min(lo, back), Math.max(lo, back), l0, l1, h, sl, 1.2, 0, !!lift, null, true]);   // true — гребень: с него отрыв; бока твёрдые — сбоку в трамплин не въехать
  };
  const HUMPS = [[A1 - 8 - KS, A1 - 8, -2.95, 2.95, false], [A2 + 8 + KS, A2 + 8, -2.95, 2.95, false],   // во всю ширину обоих путей: с рельсов — тоже на ступеньку   // «ступеньки» на арках к пролёту
                 [A1 + 8 + KS, A1 + 8, 2.4, 4.6, true], [A2 - 8 - KS, A2 - 8, -4.6, -2.4, true]];     // на самом пролёте
  const RL = HW - .9, RW = .6;                         // перила южной арки: ось лана и полуширина балки
  const GAP0 = A2 + (L - A2) * .44, GAP1 = A2 + (L - A2) * .58;
  const SURF = [
    [-RAMP, 0, -HW - .3, HW + .3, s => ramp(s, -RAMP, 0, 0, Y0), s => Y0 / RAMP * 1.2, 2.5],           // въезд от города (по ширине насыпи)
    [L, L + RAMP, -HW - .3, HW + .3, s => ramp(s, L, L + RAMP, Y0, 0), s => -Y0 / RAMP * 1.2, 2.5],             // въезд с левого берега
    [0, A1 - .4, -HW, HW, () => Y0, () => 0, 2.5],
    [A2 + .4, L, -HW, HW, () => Y0, () => 0, 2.5],
    [A1 - .45, A2 + .45, -HW, HW, () => Y0 + st.y, () => 0, 3, 0, true],                               // подъёмный пролёт (внизу закрывает стыки — не провалиться в щель)
    // верхние пояса арок с обеих сторон (на северной на подъёме — разгон); южные — тоже твёрдые сверху
    ...[-1, 1].map(k => [0, A1 - .4, k * HW - .75, k * HW + .75, s => chordTop(s, 0, A1), s => Math.atan(archD(s, 0, A1)), 1.2, 0, false, k * HW]),
    ...[-1, 1].map(k => [3, 11, k * HW - .75, k * HW + .75, s => chordTop(s, 0, A1) + .02, s => Math.atan(archD(s, 0, A1)), 1.2, 34, false, k * HW]),
    ...[-1, 1].map(k => [A2 + .4, L - 6, k * HW - .75, k * HW + .75, s => chordTop(s, A2, L), s => Math.atan(archD(s, A2, L)), 1.2, 0, false, k * HW]),   // с края пролёта — прямо на пояс южной арки
    // верхняя ферма между башнями и крыши домиков механизмов — на них можно сесть сверху
    [A1 + 3, A2 - 3, -HW - 2.2, HW + 2.2, () => Y0 + TOW - .55, () => 0, 1.2],
    ...[A1, A2].map(a => [a - 6, a + 6, -HW - 3, HW + 3, () => Y0 - .7, () => 0, 1.2]),   // шапки больших опор под разрывом: упал — встал на бетон, дальше в воду
    // служебные проходы снаружи ферм (на арочных пролётах) — сорвался с края, упал на проход
    ...[-1, 1].flatMap(k => [[0, A1], [A2, L]].map(([a, b]) => [a + 1, b - 1, Math.min(k * (HW + .5), k * (HW + 1.8)), Math.max(k * (HW + .5), k * (HW + 1.8)), () => Y0 - .06, () => 0, 1.2])),
    ...[A1, A2].map(a => [a - 3.6, a + 3.6, -HW - 1.8, HW + 1.8, () => Y0 + TOW + 5.65, () => 0, 1.2]),
    // южная арка: въезд на перила (жёлтые пандусы) и сами перила с разрывом
    // в разрыве перил — пандусы с настила на оба конца балки (машина у края не упирается в торец); у трамплина зазор 2,5 м — прыжок с перил не съедает
    ...[-1, 1].flatMap(k => [side([GAP1 - 12.5, GAP1 - 2.5, k * RL - RW, k * RL + RW, s => ramp(s, GAP1 - 12.5, GAP1 - 2.5, Y0, Y0 + 2.2), () => Math.atan(2.2 / 10), 1.2, 0, false, k * RL]),
                             side([GAP0, GAP0 + 8, k * RL - RW, k * RL + RW, s => ramp(s, GAP0 + 8, GAP0, Y0, Y0 + 1.4), () => -Math.atan(1.4 / 8), 1.2, 0, false, k * RL])]),
    ...[-1, 1].map(k => side([A2 + 1, A2 + 9, k * RL - RW - .25, k * RL + RW + .25, s => ramp(s, A2 + 1, A2 + 9, Y0, Y0 + 1.4), () => Math.atan(1.4 / 8), 1.2, 0, false, k * RL])),   // и с севера: с пролёта прямо на перила
    ...[-1, 1].map(k => side([L - 16, L - 8, k * RL - RW - .25, k * RL + RW + .25, s => ramp(s, L - 8, L - 16, Y0, Y0 + 1.4), () => -Math.atan(1.4 / 8), 1.2, 30])),
    ...[-1, 1].flatMap(k => [[GAP1, L - 16, k * RL - RW, k * RL + RW, s => Y0 + 1.4 + 1.2 * Math.max(0, 1 - (s - GAP1) / 6), s => s < GAP1 + 6 ? -Math.atan(1.2 / 6) : 0, 1.2, 0, false, k * RL], [A2 + 9, GAP0, k * RL - RW, k * RL + RW, () => Y0 + 1.4, () => 0, 1.2, 0, false, k * RL]]),   // перед разрывом — трамплинчик
    // «ступеньки»: трамплины по середине арок к подъёмному пролёту
    ...HUMPS.slice(0, 2).map(a => hump(...a)),
    // трамплины на самом пролёте (по краям): с поднятого пролёта — вылет над арками
    ...HUMPS.slice(2).map(a => hump(...a)),
  ];
  const TRAIN = { len: 62, l: -2.2, h: 4.4 };
  function ground(x, z, y) {                            // для groundAt: поверхность моста под точкой
    if (!st.loaded) return null;
    const [s, l] = loc(x, z); if (s < -RAMP - 2 || s > L + RAMP + 2 || Math.abs(l) > HW + 2.5) return null;
    let best = null;
    for (const f of SURF) {
      if (s < f[0] || s > f[1] || l < f[2] || l > f[3]) continue;
      const h = f[4](s); if (y < h - f[6] || (best && h <= best.h)) continue;
      best = { h, slope: f[5](s), rx: dx, rz: dz, deck: true, rb: true, pad: f[7] || 0, lift: !!f[8], pull: f[9] != null ? { x: N[0] + dx * s + nx * f[9], z: N[1] + dz * s + nz * f[9], dx, dz, k: Math.sign(f[9]) || 1 } : null, hump: !!f[10] };   // pull — ось узкой балки: машину мягко держит на ней
    }
    if (best && s > 0 && s < L && !best.hump && !best.pull) {          // на настиле или на пролёте над путём: шпалы или рельсы
      const deckY = Y0 + (s > A1 - .45 && s < A2 + .45 ? st.y : 0), d = Math.abs(Math.abs(l) - 2.2);
      if (Math.abs(best.h - deckY) < .02 && d < 1.3) {
        const tl = Math.sign(l) * 2.2, b = BOOST.find(b => s > b[0] && s < b[1]);
        best.track = { p: { x: N[0] + dx * s + nx * tl, z: N[1] + dz * s + nz * tl }, d, boost: b ? b[2] : 0 };
      }
    }
    const tr = st.train;                               // крыши поезда
    if (tr.on && s > tr.s - TRAIN.len && s < tr.s && Math.abs(l - TRAIN.l) < 1.6) { const h = Y0 + TRAIN.h; if (y >= h - 1.2 && (!best || h > best.h)) best = { h, slope: 0, rx: dx, rz: dz, deck: true, vx: dx * tr.v, vz: dz * tr.v, train: true }; }
    return best;
  }
  const BR = []; for (const [sa, sb] of [[0, A1], [A2, L]]) for (let i = 3; i < 14; i += 2) { const s0 = sa + (sb - sa) * i / 16, h = archH(s0, sa, sb) + .3; if (h - Y0 > 6) BR.push([s0, h]); }   // поперечные связи под арками
  const WALLS = new Set(["ферму моста", "ферму пролёта", "перила моста", "перила прохода", "пандус", "трамплин"]);
  function hit(x, z, y) {                               // длинные стенки вдоль моста помечены wall: по ним машина скользит, а не разбивается
    const r = hit0(x, z, y); if (r && WALLS.has(r.name)) r.wall = { x: dx, z: dz }; return r;
  }
  function hit0(x, z, y) {                              // препятствия: всё стальное твёрдое — фермы, башни, связи, перила, поезд, опоры
    if (!st.loaded) return null;
    const [s, l] = loc(x, z); if (s < -7 || s > L + 7 || Math.abs(l) > HW + 4) return null;
    const al = Math.abs(l), TW = HW + 1.8, bridge = n => ({ name: n, h: Y0 + TOW });
    for (const a of [A1, A2]) {
      if (Math.abs(s - a) < 4.2 && Math.abs(al - TW) < 1.1 && y < Y0 + TOW) return bridge("башню моста");               // ноги и боковые решётки башни
      if (Math.abs(Math.abs(s - a) - 3) < .7 && al < TW && y > Y0 + LIFT + 7 && y < Y0 + TOW) return bridge("башню моста");   // поперечные решётки выше пролёта
      if (Math.abs(s - a) < 3.3 && al < TW && y > Y0 + TOW + .6 && y < Y0 + TOW + 5.5) return bridge("домик механизма");
    }
    if (s > A1 + 3 && s < A2 - 3 && Math.abs(al - TW) < .6 && y > Y0 + TOW - 7.6 && y < Y0 + TOW - 1) return bridge("верхнюю ферму");
    const ar = archOf(s);
    if (ar) {
      const ct = chordTop(s, ar[0], ar[1]);
      if (Math.abs(al - HW) < .45 && y > Y0 - .5 && y < ct - .3 && ct - Y0 > .6) return bridge("ферму моста");            // раскосы и подвески
      if (Math.abs(al - HW) < .6 && y > ct - 2.2 && y < ct - .3 && ct - Y0 > 2.5) return bridge("пояс арки");            // пояс арки снизу
      for (const [s0, h] of BR) if (Math.abs(s - s0) < .6 && al < HW && y > h - 1.7 && y < h + .4) return bridge("связь фермы");
    } else if (s > A1 && s < A2) {
      const yl = Y0 + st.y;
      if (Math.abs(al - HW - .6) < .35 && y > yl - .5 && y < yl + 6.3) return bridge("ферму пролёта");   // фермы пролёта чуть шире настила: с пояса арки съезжаешь между ними
      if (al < HW && y > yl + 4.6 && y < yl + 6.4) for (let i = 0; i <= 5; i++) if (Math.abs(s - (A1 + .4 + (SPANL - .8) * i / 5)) < .6) return bridge("связь пролёта");
    }
    const gapOpen = st.y > 1 && s > A1 - .45 && s < A2 + .45;
    if (s > 0 && s < L && al < HW + .1 && y > Y0 - 2.2 && y < Y0 - .4 && !gapOpen) return bridge("настил моста");          // в торец настила снизу и сбоку
    for (const [p, big] of [[0, 0], [A1, 1], [A2, 1], [L, 0]]) {        // опоры — по модели: шапка (ригель) и столб; падающую сверху машину шапка принимает (SURF)
      if (Math.abs(s - p) < (big ? 6 : 3) && al < HW + (big ? 3 : 1) && y > Y0 - 2.9 && y < Y0 - 1.0) return bridge("опору моста");
      if (Math.abs(s - p) < (big ? 5.5 : 6.5) && al < (big ? 4.5 : 2.5) && y < Y0 - 2.9) return bridge("опору моста");   // концевые устои шире (как на модели)
    }
    for (const k of [-1, 1]) if (Math.abs(l - k * RL) < RW + .25 && y > Y0 - .5 && y < Y0 + 1.2 && ((s > GAP1 - 2.6 && s < L - 16) || (s > A2 + 9 && s < GAP0))) return { name: "перила моста", h: Y0 + 1.4 };   // и щель между пандусом и трамплином: снизу в неё не заехать
    if (Math.abs(al - RAILW) < .2 && y > Y0 - .5 && y < Y0 + 1.05 && archOf(s) && s > 1 && s < L - 1 && !(s > A1 - 1 && s < A2 + 1)) return { name: "перила прохода", h: Y0 + 1.1 };
    for (const sp of PORT) if (Math.abs(s - sp) < .4 && al < HW && y > Y0 + 6.2 && y < Y0 + 7.1) return bridge("портал контактной сети");
    for (const f of SURF) if (f.side && s > f[0] && s < f[1] && l > f[2] - .1 && l < f[3] + .1) { const h = f[4](s), y0 = Y0 + (f[8] ? st.y : 0); if (y > y0 - .5 && y < h - .5) return { name: f[10] ? "трамплин" : "пандус", h }; }   // бок жёлтого пандуса: сбоку не проехать сквозь
    const tr = st.train;
    if (tr.on && s > tr.s - TRAIN.len - 1 && s < tr.s + 1 && Math.abs(l - TRAIN.l) < 2.4 && y > Y0 - .5 && y < Y0 + TRAIN.h - .3) return { name: "поезд", h: Y0 + TRAIN.h };
    return null;
  }
  // ---------- модель: балки — вытянутые коробки с цветом вершин; всё неподвижное — одна сетка ----------
  const colorize = (g, hex) => { g = g.index ? g.toNonIndexed() : g; const c = new T.Color(hex), a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } g.setAttribute("color", new T.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute("uv"); return g; };
  const up0 = new T.Vector3(0, 1, 0), tmpM = new T.Matrix4(), X = new T.Vector3(), Yv = new T.Vector3(), Z = new T.Vector3();
  function beam(A, B, w, h, hex) {                      // коробка от A до B сечением w×h
    const len = A.distanceTo(B); if (len < .01) return null;
    X.subVectors(B, A).normalize(); Yv.copy(Math.abs(X.y) > .95 ? new T.Vector3(nx, 0, nz) : up0); Z.crossVectors(X, Yv).normalize(); Yv.crossVectors(Z, X);
    tmpM.makeBasis(X, Yv, Z).setPosition(A.clone().add(B).multiplyScalar(.5));
    return colorize(new T.BoxGeometry(len, h, w), hex).applyMatrix4(tmpM);
  }
  const STEEL = 0x8a929c, STEEL2 = 0x737c87, TOWC = 0x7d8690, CONC = 0x9c968c, RAILC = 0x3a3634, YEL = 0xffc93c, DARK = 0x2d3036, WOOD = 0x4a3a2c, BALLAST = 0x6a625b;
  // путь: щебёночная подушка, деревянные шпалы через 0,8 м, рельсы на шпалах (цвета WOOD/BALLAST/RAILC узнаёт шейдер «Фото»)
  // трамплин в полоску (как дорожный отбойник): от a (низ) к b (верх) и задний скат к c; полосы по 1,5 м
  function striped(push, a, b, c, l, w, cols) {
    [[a, b, Y0 + .02, Y0 + KH], [b, c, Y0 + KH, Y0 + .02]].forEach(([s0, s1, y0, y1], j) => {
      const n = Math.max(2, Math.round(Math.abs(s1 - s0) / 1.5));
      for (let i = 0; i < n; i++) push(beam(at(s0 + (s1 - s0) * i / n, l, y0 + (y1 - y0) * i / n), at(s0 + (s1 - s0) * (i + 1) / n, l, y0 + (y1 - y0) * (i + 1) / n), w, .3, cols[(i + j * n) % 2]));
    });
  }
  function track(push, sa, sb) {
    BOOST.forEach(([b0, b1]) => { const s0 = Math.max(sa, b0), s1 = Math.min(sb, b1); if (s1 > s0) [-2.2, 2.2].forEach(tl => [-.72, .72].forEach(o => push(beam(at(s0, tl + o, Y0 + .29), at(s1, tl + o, Y0 + .29), .1, .025, 0x39e6ff)))); });   // разгонные рельсы — голубые
    [-2.2, 2.2].forEach(tl => {
      push(beam(at(sa, tl, Y0 + .02), at(sb, tl, Y0 + .02), 3.4, .04, BALLAST));
      for (let s = sa + .4; s < sb - .2; s += .8) push(beam(at(s - .13, tl, Y0 + .07), at(s + .13, tl, Y0 + .07), 2.6, .1, WOOD));
      [-.72, .72].forEach(o => push(beam(at(sa, tl + o, Y0 + .2), at(sb, tl + o, Y0 + .2), .14, .16, RAILC)));
    });
  }
  function staticParts(push) {
    // опоры в воде и бетонные эстакады подъезда
    [0, A1, A2, L].forEach((s, i) => { const big = i === 1 || i === 2; push(beam(at(s - (big ? 6 : 3), 0, -8).setY(Y0 - 1.8), at(s + (big ? 6 : 3), 0, -8).setY(Y0 - 1.8), 2 * HW + (big ? 6 : 2), 2.2, CONC)); push(beam(at(s, 0, -6), at(s, 0, Y0 - 2.9), big ? 11 : 8, big ? 9 : 5, CONC)); });
    [[-RAMP, 0], [L, L + RAMP]].forEach(([a, b]) => {
      const n = 10; for (let i = 0; i < n; i++) { const s0 = a + (b - a) * i / n, s1 = a + (b - a) * (i + 1) / n, f = s => s <= 0 ? ramp(s, -RAMP, 0, 0, Y0) : ramp(s, L, L + RAMP, Y0, 0);
        push(beam(at(s0, 0, f(s0) - .6), at(s1, 0, f(s1) - .6), 2 * HW + .6, 1.2, CONC));
        [-HW, HW].forEach(l => push(beam(at(s0, l, f(s0) + .1), at(s1, l, f(s1) + .1), .25, .9, STEEL2)));
        const sm = (s0 + s1) / 2, hm = f(sm); if (hm > 1.5) push(beam(at(sm, 0, 0), at(sm, 0, hm - 1.2), 2.2, 2.2, CONC)); }
    });
    // пролёты-арки: нижние балки, настил, рельсы, арка, раскосы, подвески, связи
    [[0, A1], [A2, L]].forEach(([sa, sb], si) => {
      [-HW, HW].forEach(l => push(beam(at(sa, l, Y0 - .9), at(sb, l, Y0 - .9), .9, 1.8, STEEL)));
      push(beam(at(sa, 0, Y0 - .25), at(sb, 0, Y0 - .25), 2 * HW, .5, 0x5f5a55));
      track(push, sa, sb);
      [-1, 1].forEach(k => {                                          // служебный проход: решётчатый настил, стойки, два ряда перил
        push(beam(at(sa + 1, k * WALK, Y0 - .12), at(sb - 1, k * WALK, Y0 - .12), 1.3, .1, 0x6e6a64));
        [1.05, .55].forEach(h => push(beam(at(sa + 1, k * RAILW, Y0 + h), at(sb - 1, k * RAILW, Y0 + h), .06, .06, STEEL2)));
        for (let s = sa + 1; s <= sb - 1; s += 2.5) push(beam(at(s, k * RAILW, Y0 - .07), at(s, k * RAILW, Y0 + 1.08), .07, .07, STEEL2));
      });
      const ps = PORT.filter(p => p > sa && p < sb);
      ps.forEach(sp => { push(beam(at(sp, -HW, Y0 + 6.65), at(sp, HW, Y0 + 6.65), .22, .3, STEEL2));   // портал и подвесы к проводам
        [-2.2, 2.2].forEach(tl => push(beam(at(sp, tl, Y0 + 6.5), at(sp, tl, Y0 + WIRE), .07, .07, DARK))); });
      if (ps.length) [-2.2, 2.2].forEach(tl => push(beam(at(sa + 2, tl, Y0 + WIRE), at(sb - 2, tl, Y0 + WIRE), .05, .05, DARK)));   // контактный провод
      const n = 16;
      [-HW, HW].forEach(l => {
        for (let i = 0; i < n * 2; i++) { const s0 = sa + (sb - sa) * i / n / 2, s1 = sa + (sb - sa) * (i + 1) / n / 2; push(beam(at(s0, l, chordTop(s0, sa, sb) - .5), at(s1, l, chordTop(s1, sa, sb) - .5), 1.4, 1, STEEL)); }
        for (let i = 1; i < n; i++) { const s0 = sa + (sb - sa) * i / n; push(beam(at(s0, l, Y0), at(s0, l, archH(s0, sa, sb)), .35, .35, STEEL2));
          const s1 = sa + (sb - sa) * (i + (i < n / 2 ? 1 : -1)) / n; push(beam(at(s0, l, archH(s0, sa, sb)), at(s1, l, Y0), .3, .3, STEEL2));   // раскос в каждой панели: ферма твёрдая сплошь — и выглядит так
          if (archH(s0, sa, sb) - Y0 > 13) push(beam(at(s0, l, Y0), at(s1, l, archH(s1, sa, sb)), .26, .26, STEEL2)); }   // высокие панели — крестом
      });
      for (let i = 3; i < n - 2; i += 2) { const s0 = sa + (sb - sa) * i / n, h = archH(s0, sa, sb) + .3; if (h - Y0 > 6) push(beam(at(s0, -HW, h), at(s0, HW, h), .5, .5, STEEL2)); }
      if (si === 1) {                                     // южная: перила-балки (жёлтые) на стойках и пандусы на них
        [-1, 1].forEach(k => {
          push(beam(at(GAP1 + 6, k * RL, Y0 + 1.4), at(GAP1, k * RL, Y0 + 2.6), RW * 2 + .1, .3, 0xd8322c));   // трамплинчик перед разрывом
          [[A2 + 9, GAP0], [GAP1, L - 16]].forEach(([a, b]) => { push(beam(at(a, k * RL, Y0 + 1.2), at(b, k * RL, Y0 + 1.2), RW * 2, .4, YEL)); for (let s = a + 2; s < b; s += 6) push(beam(at(s, k * RL, Y0), at(s, k * RL, Y0 + 1), .18, .18, DARK)); });
          push(beam(at(L - 8, k * RL, Y0 + .02), at(L - 16, k * RL, Y0 + 1.2), RW * 2 + .5, .3, YEL));
          push(beam(at(A2 + 1, k * RL, Y0 + .02), at(A2 + 9, k * RL, Y0 + 1.2), RW * 2 + .5, .3, YEL));
          push(beam(at(GAP1 - 12.5, k * RL, Y0 + .02), at(GAP1 - 2.5, k * RL, Y0 + 2), RW * 2, .3, 0xd9a52e));
          push(beam(at(GAP0 + 8, k * RL, Y0 + .02), at(GAP0, k * RL, Y0 + 1.2), RW * 2, .3, 0xd9a52e));
        });
      }
    });
    // «ступеньки» — трамплины по середине арок к пролёту
    HUMPS.slice(0, 2).forEach(([a, b]) => striped(push, a, b, b + Math.sign(b - a) * KB, 0, 5.9, [0xffc21a, 0x1d1d1f]));   // «ступеньки» на арках — жёлто-чёрные
    // башни: четыре ноги, крест-накрест связи, площадки, домики механизмов, верхняя ферма
    [A1, A2].forEach(a => {
      const legs = [[-3, -HW - 1.8], [3, -HW - 1.8], [-3, HW + 1.8], [3, HW + 1.8]];
      legs.forEach(([o, l]) => push(beam(at(a + o, l, Y0 - 1), at(a + o, l, Y0 + TOW), 1.2, 1.2, TOWC)));
      for (let y = Y0 + 4; y < Y0 + TOW - 2; y += 8) {
        [[-HW - 1.8, -1], [HW + 1.8, 1]].forEach(([l]) => { push(beam(at(a - 3, l, y), at(a + 3, l, y + 8), .25, .25, STEEL2)); push(beam(at(a + 3, l, y), at(a - 3, l, y + 8), .25, .25, STEEL2)); push(beam(at(a - 3, l, y), at(a + 3, l, y), .35, .35, TOWC)); });
      }
      // поперёк пути решётки — только выше поднятого пролёта (там они твёрдые); ниже — проём: пролёт ходит, машина пролетает
      [a - 3, a + 3].forEach(s => { const y0 = Y0 + LIFT + 7, y1 = Y0 + TOW - .4;
        push(beam(at(s, -HW - 1.8, y0), at(s, HW + 1.8, y1), .25, .25, STEEL2)); push(beam(at(s, HW + 1.8, y0), at(s, -HW - 1.8, y1), .25, .25, STEEL2));
        push(beam(at(s, -HW - 1.8, y0), at(s, HW + 1.8, y0), .35, .35, TOWC)); });
      push(beam(at(a - 3.8, 0, Y0 + TOW + .3), at(a + 3.8, 0, Y0 + TOW + .3), 2 * HW + 5, .6, 0x8e959c));   // площадка
      push(beam(at(a - 3.2, 0, Y0 + TOW + .6), at(a + 3.2, 0, Y0 + TOW + .6), 2 * HW + 3, 5.2, 0xb9bfc4).translate(0, 2.6, 0));   // домик
      push(beam(at(a - 3.6, 0, Y0 + TOW + 5.4), at(a + 3.6, 0, Y0 + TOW + 5.4), 2 * HW + 3.6, .5, 0x6c7074));   // крыша
      [-1, 1].forEach(k => push(beam(at(a + k * 3.21, -2, Y0 + TOW + 2.2), at(a + k * 3.21, 2, Y0 + TOW + 2.2), .05, 1.6, 0x3b4a5c)));   // окна
    });
    [-HW - 1.8, HW + 1.8].forEach(l => {                     // верхняя ферма между башнями
      [Y0 + TOW - 7, Y0 + TOW - 1].forEach(y => push(beam(at(A1 + 3, l, y), at(A2 - 3, l, y), .7, .9, STEEL)));
      const n = 8; for (let i = 0; i < n; i++) { const s0 = A1 + 3 + (SPANL - 6) * i / n, s1 = A1 + 3 + (SPANL - 6) * (i + 1) / n; push(beam(at(s0, l, Y0 + TOW - 7), at(s1, l, Y0 + TOW - 1), .3, .3, STEEL2)); push(beam(at(s0, l, Y0 + TOW - 1), at(s0, l, Y0 + TOW - 7), .3, .3, STEEL2)); }
    });
    for (let i = 0; i <= 8; i++) { const s0 = A1 + 3 + (SPANL - 6) * i / 8; push(beam(at(s0, -HW - 1.8, Y0 + TOW - 1), at(s0, HW + 1.8, Y0 + TOW - 1), .35, .35, STEEL2)); }
  }
  function liftParts(push) {                             // подъёмный пролёт — своя сетка, двигается целиком (координаты от высоты 0)
    const sa = A1 + .4, sb = A2 - .4, H = 6;
    push(beam(at(sa, 0, Y0 - .25), at(sb, 0, Y0 - .25), 2 * HW, .5, 0x5f5a55));
    track(push, sa, sb);
    [-2.2, 2.2].forEach(tl => push(beam(at(sa, tl, Y0 + WIRE), at(sb, tl, Y0 + WIRE), .05, .05, DARK)));   // провод на пролёте — под его связями, едет вместе с ним
    [-HW - .6, HW + .6].forEach(l => {
      [Y0 - .7, Y0 + H].forEach(y => push(beam(at(sa, l, y), at(sb, l, y), .8, 1, STEEL)));
      const n = 10; for (let i = 0; i < n; i++) { const s0 = sa + (sb - sa) * i / n, s1 = sa + (sb - sa) * (i + 1) / n; push(beam(at(s0, l, Y0 - .2), at(s1, l, Y0 + H - .4), .3, .3, STEEL2)); push(beam(at(s1, l, Y0 - .2), at(s1, l, Y0 + H - .4), .3, .3, STEEL2)); }
    });
    for (let i = 0; i <= 5; i++) { const s0 = sa + (sb - sa) * i / 5;
      if (i % 5) push(beam(at(s0, -HW - .6, Y0 + H), at(s0, HW + .6, Y0 + H), .35, .35, STEEL2));
      else for (let j = 0; j < 8; j++) push(beam(at(s0, -HW - .6 + (2 * HW + 1.2) * j / 8, Y0 + H - .05), at(s0, -HW - .6 + (2 * HW + 1.2) * (j + 1) / 8, Y0 + H - .05), .45, .45, j % 2 ? 0xd8322c : 0xf4f4f0));   // «габаритные ворота» на въездах: низкая балка — видно издалека
    }
    HUMPS.slice(2).forEach(([a, b, l0, l1]) => striped(push, a, b, b + Math.sign(b - a) * KB, (l0 + l1) / 2, 2.2, [0xf4f4f0, 0xd8322c]));   // трамплины пролёта — бело-красные
  }
  const steelM = bridgeSteel(new T.MeshLambertMaterial({ vertexColors: true }));
  let liftMesh = null, lightM = null;
  function* build(sc) {
    const parts = []; staticParts(g => g && parts.push(g)); yield;
    const m = new T.Mesh(mergeGeos(parts), steelM); sc.group.add(m); st.statMesh = m; yield;
    const lp = []; liftParts(g => g && lp.push(g)); liftMesh = new T.Mesh(mergeGeos(lp), steelM); sc.group.add(liftMesh);
    // светофоры: внутри ферм арок, за 14 м до башни, у края настила над проездом (машина проходит под ними), кронштейн — к ферме;
    // головка с козырьком, верхний огонь — красный, нижний — зелёный
    lightM = new T.MeshBasicMaterial({ color: 0x3ddc84, toneMapped: false }); const redM = new T.MeshBasicMaterial({ color: 0x3a0c0a, toneMapped: false }); st.redM = redM;
    const hg = [], gl = [], rl = [], TWs = HW + 1.8;
    [[A1, -1], [A2, 1]].forEach(([a, k0]) => [-1, 1].forEach(k => {
      const s0 = a + k0 * 14, l0 = k * (HW - .45), y0 = Y0 + 5.2;
      hg.push(beam(at(s0, l0, y0 - 1), at(s0, l0, y0 + 1), .55, .7, 0x16181b), beam(at(s0 + k0 * .4, l0 - .3, y0 + .78), at(s0 + k0 * .4, l0 + .3, y0 + .78), .35, .06, 0x16181b));   // головка и козырёк
      hg.push(beam(at(s0, l0, y0 + .2), at(s0, k * (HW + .1), y0 + .2), .16, .16, 0x16181b));   // кронштейн к ферме
      const dot = y => new T.SphereGeometry(.2, 10, 8).translate(...at(s0 + k0 * .45, l0, y).toArray()).toNonIndexed();
      rl.push(dot(y0 + .45)); gl.push(dot(y0 - .45));
    }));
    sc.group.add(new T.Mesh(mergeGeos(hg), steelM), new T.Mesh(mergeGeos(gl), lightM), new T.Mesh(mergeGeos(rl), redM));
    // огни на стыках поперёк пути (как на взлётной полосе): концы арок у разрыва и концы самого пролёта (едут с ним);
    // зелёные — путь сплошной, мигают красные — пролёт движется или поднят: край, дальше обрыв
    st.edgeM = new T.MeshBasicMaterial({ color: 0x3ddc84, toneMapped: false });
    const eg = [], lg2 = [];
    [[A1 - .8, eg], [A2 + .8, eg], [A1 + .8, lg2], [A2 - .8, lg2]].forEach(([s0, arr]) => { for (let l = -HW + .45; l <= HW - .4; l += .9) arr.push(new T.BoxGeometry(.32, .1, .32).translate(...at(s0, l, Y0 + .2).toArray()).toNonIndexed()); });
    st.liftLamps = new T.Mesh(mergeGeos(lg2), st.edgeM);
    sc.group.add(new T.Mesh(mergeGeos(eg), st.edgeM), st.liftLamps);
    // вывески
    // таблички — два листа спина к спине: надпись читается с обеих сторон, а не зеркально
    const sign = (lines, bg, fg, s, l, y, w) => { const m = new T.MeshBasicMaterial({ map: textTex(lines, 1024, 256, bg, fg) }); [0, Math.PI].forEach(r => { const sgn = new T.Mesh(new T.PlaneGeometry(w, w / 4), m); sgn.position.copy(at(s, l, y)); sgn.rotation.y = yaw + Math.PI / 2 + r; sc.group.add(sgn); }); };
    sign(["НА АРКУ ↗"], "#d8322c", "#ffffff", -10, -HW - 2.5, Y0 + 4, 7); sign(["НА АРКУ ↗"], "#d8322c", "#ffffff", -10, HW + 2.5, Y0 + 4, 7);
    sign(["ПЕРИЛА"], "#2c0a44", "#ffc93c", L + 10, 0, Y0 + 5.5, 8);
    sign(["С ВЕРШИНЫ ВПРАВО ИЛИ ВЛЕВО:", "3 КОЛЕСА → ДОН"], "#1f4f7a", "#ffffff", A1 / 2 - 16, HW + 2.8, chordTop(A1 / 2 - 16, 0, A1) + 3, 10);
    sign(["ЗЕЛЁНЫЙ: ПОЯС → ПРОЛЁТ → ЮЖНАЯ АРКА", "ПОДНЯТ: КОЛЕСО НА ВЕРШИНЕ БРОСИТ НА ПРОЛЁТ"], "#1d6b3a", "#ffffff", A1 / 2 - 16, -HW - 2.8, chordTop(A1 / 2 - 16, 0, A1) + 3, 12);
    [[A1 - 4, 1], [A2 + 4, -1]].forEach(([s0, k]) => sign(["С ЛИФТА — В КОЛЕСО ↑"], "#d8322c", "#ffffff", s0, k * (HW + 2.4), Y0 + LIFT - 6, 8));
    sign(["ЖЕЛЕЗНОДОРОЖНЫЙ МОСТ"], "#1f4f7a", "#ffffff", -RAMP - 12, HW + 6, 6, 14);
    // кольца: на вершине северной арки (обе стороны) и три — прыжок в Дон
    // цели — колёса паровоза: красный обод (невзято) / зелёный (взято), стальной бандаж, короткие спицы у обода — центр свободен, сквозь него и летим
    const ringM = () => new T.MeshBasicMaterial({ color: RING_ON }), tyreM = new T.MeshLambertMaterial({ color: 0x8a9096 });
    const tyreG = new T.TorusGeometry(3.55, .2, 6, 32).toNonIndexed(), tyres = [];   // бандажи всех колёс — одна сетка
    const rimG = mergeGeos([new T.TorusGeometry(3.2, .3, 8, 32).toNonIndexed(), ...[...Array(10)].map((_, i) => new T.BoxGeometry(.9, .22, .16).translate(2.6, 0, 0).rotateZ(i / 10 * Math.PI * 2).toNonIndexed())]);
    const addRing = (p, ry, boost) => {
      const m = new T.Mesh(rimG, ringM()); m.position.copy(p); m.rotation.y = ry; sc.group.add(m); m.updateMatrix();
      tyres.push(tyreG.clone().applyMatrix4(m.matrix)); st.rings.push({ m, p: p.clone(), got: false, boost });
    };
    [-1, 1].forEach(k => addRing(at(A1 / 2, k * HW, Y0 + ARCH + 3), yaw + Math.PI / 2, 40));
    // «прыжок в Дон»: с вершины северной арки (правый пояс) уводишь машину вправо — три колеса по дуге полёта, дальше — в реку
    [-1, 1].forEach(k => [[34, 11.6, 31.5], [55, 14.8, 24], [75, 17.8, 13.5]].forEach(([ds, l0, y]) => addRing(at(A1 / 2 + ds, k * l0, y), yaw + Math.PI / 2 - k * .15, 0)));   // и вправо, и влево
    [[A1 - 10, 3.5], [A2 + 10, -3.5]].forEach(([s0, l0]) => { addRing(at(s0, l0, Y0 + LIFT + 3.6), yaw + Math.PI / 2, 0); st.rings[st.rings.length - 1].lift = true; });   // вылет с трамплина поднятого пролёта
    addRing(at(30, -TRAIN.l, Y0 + 3.4), yaw + Math.PI / 2, 0); st.rings[st.rings.length - 1].train = true;   // кольцо-перекидка на поезд (над свободным путём)
    sc.group.add(new T.Mesh(mergeGeos(tyres), tyreM));
    // табло на башнях — над путём, лицом к подъездам (обе таблички — одна сетка, одна текстура)
    { const c = document.createElement("canvas"); c.width = 512; c.height = 128; const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding; tex.anisotropy = 4;
      const gs = [[A1 - 3.9, -Math.PI / 2], [A2 + 3.9, Math.PI / 2]].map(([s0, r]) => new T.PlaneGeometry(12, 3).rotateY(yaw + r).translate(...at(s0, 0, Y0 + TOW - 13).toArray()));
      st.board = { c, tex, key: "" }; sc.group.add(new T.Mesh(mergeGeos(gs.map(q => q.toNonIndexed())), new T.MeshBasicMaterial({ map: tex, toneMapped: false }))); drawBoard(); }
    // подсветка вечером и ночью: светодиодные ленты по поясам арок (голубой → фиолетовый к вершине), по ногам башен (тёплый белый),
    // по верхней ферме; на пролёте — своя лента, едет с ним: зелёная — путь свободен, красная — пролёт поднят или идёт
    { const lg = [], ll = [], C1 = new T.Color(0x39d6ff), C2 = new T.Color(0xb46bff), cc = new T.Color();
      [[0, A1], [A2, L]].forEach(([sa, sb]) => [-1, 1].forEach(k => { const n = 28; for (let i = 0; i < n; i++) { const s0 = sa + (sb - sa) * i / n, s1 = sa + (sb - sa) * (i + 1) / n;
        cc.copy(C1).lerp(C2, 1 - Math.abs(1 - 2 * (i + .5) / n)); lg.push(beam(at(s0, k * (HW + .74), chordTop(s0, sa, sb) - .55), at(s1, k * (HW + .74), chordTop(s1, sa, sb) - .62), .14, .3, cc.getHex())); } }));
      [A1, A2].forEach(a => [[-3, -1], [3, -1], [-3, 1], [3, 1]].forEach(([o, k]) => lg.push(beam(at(a + o, k * (HW + 2.45), Y0), at(a + o, k * (HW + 2.45), Y0 + TOW), .35, .35, 0xffd27a))));
      [-1, 1].forEach(k => lg.push(beam(at(A1 + 3, k * (HW + 2.2), Y0 + TOW - 7.5), at(A2 - 3, k * (HW + 2.2), Y0 + TOW - 7.5), .35, .35, 0x39d6ff)));
      [-1, 1].forEach(k => [Y0 - 1.25, Y0 + 6.55].forEach(y => ll.push(beam(at(A1 + .6, k * (HW + 1.05), y), at(A2 - .6, k * (HW + 1.05), y), .25, .3, 0xffffff))));
      const night = () => TIME !== "day";
      st.ledM = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); st.liftLedM = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
      [st.ledM, st.liftLedM].forEach(m => { nightReg(m, "visible", { sunset: true, day: false, night: true }); m.visible = night(); });
      st.led = new T.Mesh(mergeGeos(lg), st.ledM); st.liftLed = new T.Mesh(mergeGeos(ll), st.liftLedM);
      sc.group.add(st.led, st.liftLed); }
    // поезд: локомотив и три вагона — одна сетка
    const tp = [], T0 = Y0 + .2;
    for (let i = 0; i < 4; i++) { const s0 = -i * 15.5, c = i ? 0x5d6b52 : 0xb5462f;
      tp.push(beam(new T.Vector3(s0 - 14.5, T0 + 2.4, 0), new T.Vector3(s0, T0 + 2.4, 0), 3.1, 3.6, c));
      tp.push(beam(new T.Vector3(s0 - 14.5, T0 + 4.3, 0), new T.Vector3(s0, T0 + 4.3, 0), 2.9, .25, 0x8d9096));
      if (!i) tp.push(beam(new T.Vector3(-.2, T0 + 3.1, -.8), new T.Vector3(.1, T0 + 3.1, -.8), .7, .5, 0xfff1c8), beam(new T.Vector3(-.2, T0 + 3.1, .8), new T.Vector3(.1, T0 + 3.1, .8), .7, .5, 0xfff1c8)); }
    st.trainMesh = new T.Mesh(mergeGeos(tp.filter(Boolean)), steelM); st.trainMesh.visible = false; sc.group.add(st.trainMesh);
    st.meshes = [m, liftMesh]; st.loaded = true;
  }
  function drop() { st.loaded = false; st.rings = []; liftMesh = null; st.trainMesh = null; }
  // ---------- работа моста: пролёт, поезд, кольца, разгоны ----------
  // колесо на вершине северной арки при поднятом пролёте — реактивный бросок: сопла подбирают дугу так, чтобы машина прошла
  // под верхними связями башни и села на середину поднятого пролёта (как мега-трамплин у арены)
  function jetToLift() {
    const [cs, cl] = loc(car.x, car.z), T2 = 2.4, yT = Y0 + Math.min(LIFT, st.y + 4.4 * T2), apex = yT + 3;
    const vy = Math.sqrt(2 * G * Math.max(1, apex - car.y)), T = vy / G + Math.sqrt(2 * (apex - yT) / G);
    const dS = A1 + 22 - cs, dL = Math.sign(cl || 1) * 3.2 - cl, wx = dx * dS + nx * dL, wz = dz * dS + nz * dL;
    car.yaw = Math.atan2(-wz, wx); takeoff(false); car.vy = vy; car.v = Math.hypot(dS, dL) / T; free.jetRB = time; free.autoUntil = time + T; sfx.jet();
  }
  // табло на башнях: когда пролёт поднимется / опустится (по расписанию, поезду и судам)
  const trainWait = () => { const m = Math.floor(st.t / 60); return (m % 2 ? m + 2 : m + 1) * 60 - st.t + (RAMP + 70) / 22; };
  // кольцо-перекидка на свободном пути у въезда: пролетел сквозь него, когда рядом идёт поезд, — сопла бросают машину на крышу
  // вагона (дуга считается с упреждением: где окажется поезд через время полёта); поезда рядом нет — просто колесо
  function jetToTrain() {
    const tr = st.train; if (!tr.on) return false;
    const [cs, cl] = loc(car.x, car.z), roof = Y0 + TRAIN.h, y0 = car.y; let best = null;
    const Tmin = Math.sqrt(2 * (3 + roof - y0) / G) + Math.sqrt(6 / G);   // дуга не ниже 3 м над крышей — над боком вагона пролетаем с запасом
    for (let T = Tmin; T <= Tmin + 1.2; T += .05) {
      const f = tr.s + tr.v * T, lo = f - TRAIN.len + 4, hi = f - 4, sT = Math.max(lo, Math.min(hi, cs + car.v * T)), vS = (sT - cs) / T;
      if (vS < 6 || vS > 48) continue; const sc = Math.abs(vS - car.v); if (!best || sc < best.sc) best = { T, sT, vS, sc };
    }
    if (!best) return false;
    let h0 = .3, h1 = 30; for (let i = 0; i < 30; i++) { const h = (h0 + h1) / 2, Tf = Math.sqrt(2 * (h + roof - y0) / G) + Math.sqrt(2 * h / G); if (Tf > best.T) h1 = h; else h0 = h; }   // высота дуги под время полёта
    const apex = roof + h0, vy = Math.sqrt(2 * G * Math.max(.5, apex - y0)), dS = best.sT - cs, dL = TRAIN.l - cl, wx = dx * dS + nx * dL, wz = dz * dS + nz * dL;
    car.yaw = Math.atan2(-wz, wx); takeoff(false); car.vy = vy; car.v = Math.hypot(dS, dL) / best.T; free.jetTrain = time; free.autoUntil = time + best.T; sfx.jet(); return true;
  }
  function liftInfo() {
    const cyc = st.t % 60, tr = st.train;
    if (shipNear()) return ["СУДНО НА РЕКЕ", st.y > LIFT - 1 ? "ПРОЛЁТ ПОДНЯТ" : "ПОДНИМАЕТСЯ", 1];
    if (tr.on && tr.s - TRAIN.len < L + 10) return ["ИДЁТ ПОЕЗД", "ПРОЛЁТ ВНИЗУ", 2];
    const tw = trainWait();                                // поезд: выходит в начале каждой второй минуты, к мосту — через ~8 с
    if (st.up) return ["ПРОЛЁТ ПОДНЯТ", `ВНИЗ ЧЕРЕЗ ${Math.max(1, Math.ceil(54 - cyc))} с`, 1];
    if (st.y > .05) return ["ПРОЛЁТ", "ОПУСКАЕТСЯ", 1];
    const lw = Math.ceil(cyc < 34 ? 34 - cyc : 94 - cyc);
    return tw < lw ? [`ПРОЛЁТ ВНИЗУ · ВВЕРХ ЧЕРЕЗ ${lw} с`, `ПОЕЗД ЧЕРЕЗ ${Math.max(1, Math.ceil(tw))} с`, 2] : ["ПРОЛЁТ ВНИЗУ", `ВВЕРХ ЧЕРЕЗ ${lw} с`, 0];
  }
  function drawBoard() {
    const B = st.board, [a, b, c] = liftInfo(), key = a + b; if (B.key === key) return; B.key = key;
    const g = B.c.getContext("2d"), col = ["#3ddc84", "#ff3b30", "#ffc93c"][c];
    g.fillStyle = "#0b0d10"; g.fillRect(0, 0, 512, 128); g.strokeStyle = "#3a3f46"; g.lineWidth = 8; g.strokeRect(4, 4, 504, 120);
    g.fillStyle = col; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "bold 34px Golos Text, Arial, sans-serif"; g.fillText(a, 256, 36, 480);
    g.font = "900 54px Golos Text, Arial, sans-serif"; g.fillText(b, 256, 88, 490);
    g.fillStyle = "rgba(0,0,0,.35)"; for (let x = 0; x < 512; x += 4) g.fillRect(x, 0, 1, 128); for (let y = 0; y < 128; y += 4) g.fillRect(0, y, 512, 1);   // точки светодиодов
    B.tex.needsUpdate = true;
  }
  const shipNear = () => typeof SHIPS !== "undefined" && SHIPS.list.some(sh => { const ox = sh.x - C.x, oz = sh.z - C.z, dn = ox * nx + oz * nz, ds = ox * dx + oz * dz; return Math.abs(ds) < 120 && Math.abs(dn) < 300 && (Math.abs(dn) < 70 || dn * sh.vn < 0); });
  function tick(dt) {
    st.t += dt;
    const tr = st.train, ship = shipNear();
    // поезд: в начале каждой второй минуты, пока пролёт внизу (проходит мост за ~34 с — до подъёма по расписанию)
    const cyc = st.t % 60;
    if (!tr.on) { if (cyc < 1 && Math.floor(st.t / 60) % 2 === 1 && st.y < .05 && !ship) { tr.on = true; tr.s = -RAMP - 70; tr.v = 22; if (st.loaded && Math.hypot(car.x - C.x, car.z - C.z) < 450) sfx.horn(); } }
    else { tr.s += tr.v * dt; if (tr.s > L + RAMP + 140) tr.on = false; }
    if (tr.on && st.loaded && mode === "free" && phase === "free") {   // поезд сбивает машину на своём пути (и стоящую тоже)
      const [cs, cl] = loc(car.x, car.z);
      if (cs > tr.s - TRAIN.len - .5 && cs < tr.s + 1.2 && Math.abs(cl - TRAIN.l) < 2.3 && car.y > Y0 - 1 && car.y < Y0 + TRAIN.h - .4) {
        car.yaw = yaw + (Math.random() < .5 ? .6 : -.6); return freeCrash("Сбил поезд! На путях не стоять");
      }
    }
    // пролёт: поднят для судна или по расписанию (цикл 60 с), но не пока по мосту идёт поезд
    const sched = cyc > 34 && cyc < 54, trainOn = tr.on && tr.s > -RAMP - 20 && tr.s - TRAIN.len < L + 10;
    st.up = !trainOn && (ship || sched);
    const target = st.up ? LIFT : 0, sp = st.up ? 4.4 : 5.5;
    st.v = Math.sign(target - st.y) * Math.min(sp, Math.abs(target - st.y) / Math.max(dt, 1e-4)); st.y += st.v * dt;   // dt = 0 (пауза) не даёт NaN
    if (!st.loaded) { if (st.snd !== 0) { sfx.bridge(0, 0, 0); st.snd = 0; } return; } st.snd = 1;
    liftMesh.position.y = st.y;
    const free_ = st.y < .05 && !st.up, blink = (st.t * 2 | 0) % 2;
    lightM.color.setHex(free_ ? 0x3ddc84 : 0x0b2a16); st.redM.color.setHex(free_ ? 0x3a0c0a : blink ? 0xff3b30 : 0x7a1410);
    st.edgeM.color.setHex(free_ ? 0x3ddc84 : blink ? 0xff3b30 : 0x5a0f0c); st.liftLamps.position.y = st.y;
    st.boardT = (st.boardT || 0) - dt; if (st.boardT <= 0 && Math.hypot(car.x - C.x, car.z - C.z) < 900) { st.boardT = .25; drawBoard(); }
    st.liftLed.position.y = st.y;
    {   // звук: гул стали под машиной, мотор и скрип пролёта (тише с расстоянием), удар, когда пролёт встал
      const dC = Math.hypot(camera.position.x - C.x, camera.position.y - Y0 - st.y, camera.position.z - C.z), prox = Math.max(0, Math.min(1, 1 - (dC - 40) / 380)), moving = Math.abs(st.v) > .05;
      sfx.bridge(mode === "free" && free.steel && !free.air && !replay ? Math.min(1, Math.abs(car.v) / 26) : 0, moving ? prox : 0, moving ? prox : 0);
      if (st.wasMoving && !moving && prox > 0) sfx.clunk(prox); st.wasMoving = moving;
    }
    if (st.ledM.visible) { st.liftLedM.color.setHex(free_ ? 0x3ddc84 : blink ? 0xff3b30 : 0x8a1810); st.ledM.color.setScalar(.75 + .25 * Math.sin(st.t * 1.6)); }   // ленты медленно «дышат»   // зелёный — путь свободен, мигает красный — пролёт идёт/поднят
    st.trainMesh.visible = tr.on; if (tr.on) { const p = at(tr.s, TRAIN.l); st.trainMesh.position.set(p.x, 0, p.z); st.trainMesh.rotation.y = yaw; }
    st.ringT = Math.max(0, st.ringT - dt);
    const shU = typeof SHIPS !== "undefined" && SHIPS.list.find(sh => sh.under);
    if (shU && !shU.hinted && mode === "free" && Math.hypot(car.x - C.x, car.z - C.z) < 200) { shU.hinted = true; queueToast(`Под мостом идёт ${KIND_NAME(shU)} — прыгай на палубу!`, "good", 2600); }
    if (!shU) SHIPS.list.forEach(sh => sh.hinted = false);
    if (!st.hello && mode === "free" && Math.hypot(car.x - C.x, car.z - C.z) < 260) {   // первый подъезд за игру — сколько испытаний пройдено
      st.hello = true; queueToast(`Ж/д мост: испытания ${rbDone()} из ${rbAll()} — список в «⋯»`, "good", 2600);
    }
    // подсказки: едем по настилу к разрыву при поднятом пролёте; машина на «лифте» поехала вверх
    st.warnT = Math.max(0, (st.warnT || 0) - dt);
    if (mode === "free" && phase === "free" && !free.air && !st.warnT) {
      const [cs, cl] = loc(car.x, car.z), vs = car.v * (Math.cos(car.yaw) * dx - Math.sin(car.yaw) * dz), onDeck = Math.abs(cl) < HW && Math.abs(car.y - Y0) < 1.5;
      const dist = cs < A1 && vs > 3 ? A1 - cs : cs > A2 && vs < -3 ? cs - A2 : -1;
      const onChord = Math.abs(Math.abs(cl) - HW) < .8 && car.y > Y0 + 3 && (cs < A1 ? vs > 3 && cs > A1 / 2 : cs > A2 && vs < -3 && cs < (A2 + L) / 2);   // на поясе арки, едем вниз к пролёту
      if (onDeck && st.y > 1 && dist > 5 && dist < 70) { queueToast("Пролёт поднят — впереди разрыв! Тормози или прыгай", "bad", 1600); st.warnT = 6; }
      else if (onChord && st.y > 1) { queueToast(cs < A1 ? "Пролёт поднят — пояс уходит в обрыв! Уводи вправо или влево: 3 колеса и в Дон" : "Пролёт поднят — пояс уходит в обрыв! Тормози", "bad", 2200); st.warnT = 7; }
      else if (Math.abs(Math.abs(cl) - HW) < .8 && car.y > Y0 + 3 && cs < A1 / 2 - 8 && vs > 3 && st.up && st.y > 20) { queueToast("Пролёт поднят — колесо на вершине бросит тебя прямо на пролёт!", "good", 2200); st.warnT = 9; }
      else if (onChord && st.y < .05 && !st.up) { queueToast("Огни зелёные — по поясу прямо на пролёт и дальше на другую арку!", "good", 2000); st.warnT = 12; }
      else if (cs > A1 && cs < A2 && Math.abs(cl) < HW + .5 && st.v > .5 && Math.abs(car.y - Y0 - st.y) < 1.5 && st.y > 1 && st.y < 6) { queueToast("Лифт! Пролёт поднимает машину на 40 м — с трамплина наверху вылет в кольцо", "good", 2200); st.warnT = 20; }
    }
    for (const r of st.rings) if (!r.got && Math.hypot(car.x - r.p.x, car.y + .6 - r.p.y, car.z - r.p.z) < 3.2) {
      r.got = true; r.m.material.color.setHex(0x6fdc8c); free.score += 300; save.freeBest = Math.max(save.freeBest, free.score); persist();
      const vsR = car.v * (Math.cos(car.yaw) * dx - Math.sin(car.yaw) * dz);
      if (r.train && vsR > 5 && jetToTrain()) queueToast("Перекидка — на крышу поезда!", "good", 1600);
      else if (r.train) queueToast("Поезд далеко — смотри время на табло башни", "", 1800);
      if (r.boost && st.up && st.y > 28 && !free.air && vsR > 5) { jetToLift(); completeMission("rbArch"); }
      else if (r.boost) { car.v = Math.max(car.v, r.boost); sfx.jet(); completeMission("rbArch"); }
      if (r.lift) completeMission("rbLift");
      if (st.rings.every(q => q.got)) completeMission("rbWheels");
      queueToast(free.jetRB === time ? "Реактивный бросок — на поднятый пролёт!  +300" : r.boost ? "Вершина арки! Колесо паровоза и разгон  +300" : "Колесо паровоза  +300", "good", 1600); sfx.ring();
    }
    if (st.rings.length && st.rings.every(r => r.got) && Math.hypot(car.x - C.x, car.z - C.z) > 500) st.rings.forEach(r => { r.got = false; r.m.material.color.setHex(RING_ON); });   // уехали — кольца снова горят
  }
  // для тренажёра: верх пояса арки, перила, поезд; пролёт вниз/вверх «по расписанию» (минута без поезда), пустить поезд
  const top = s => s <= A1 ? chordTop(s, 0, A1) : s >= A2 ? chordTop(s, A2, L) : Y0;
  const onLift = (x, z) => { const [s, l] = loc(x, z); return s > A1 - .45 && s < A2 + .45 && Math.abs(l) < HW; };
  function setLift(up) { const base = Math.ceil(st.t / 120) * 120; st.t = base + (up ? 36 : 2); st.y = up ? LIFT : 0; st.v = 0; st.train.on = false; }
  function startTrain(s0) { const tr = st.train; tr.on = true; tr.s = s0; tr.v = 22; }
  return { build, drop, tick, ground, hit, hit0, meshes: () => [st.statMesh, liftMesh].filter(Boolean), LIFT, TOW, SPANL, st, C, at, loc, L, A1, A2, Y0, HW, top, setLift, startTrain, onLift, RL, TRAIN, KS, KB, KH, N: { x: N[0], z: N[1] }, S: { x: S[0], z: S[1] }, dir: { x: dx, z: dz }, nrm: { x: nx, z: nz }, yaw, RAMP, LIFT, ARCH, TOW, GAP0, GAP1 };
})() : null;
