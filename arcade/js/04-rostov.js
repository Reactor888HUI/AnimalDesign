// «Восьмёрка Баклажан» — Ростов из OpenStreetMap, рельеф правого берега, дома, дороги.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- Ростов: настоящий район из OpenStreetMap ---------- */
// Данные © участники OpenStreetMap (ODbL). Исходник arcade/refs/rostov-center.osm, конвертер tools/osm-to-game.py.
// Полоса 1 × 2,8 км повёрнута так, что Богатяновка примыкает к автобану, дальше набережная, Дон и левый берег.
// Координаты в данных — дециметры игры: [x, z, x, z, …].
const dm = a => { const p = []; for (let i = 0; i < a.length; i += 2) p.push([a[i] / 10, a[i + 1] / 10]); return p; };
const rectOf = b => { const [ax, az, bx, bz] = b.map(v => v / 10); return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz) }; };
const CORE = rectOf(OSM.bounds), STRIP = rectOf(OSM.clip || OSM.bounds);   // CORE — первая выгрузка (центр), STRIP — вместе с картой у Арены
const inStrip = (x, z) => x > STRIP.x0 && x < STRIP.x1 && z > STRIP.z0 && z < STRIP.z1;
const inWorldMap = (x, z) => z > STRIP.z0 && z < STRIP.z1;   // полоса карты и продолжение реки по сторонам
function inPoly(x, z, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, z0] = ring[j], [x1, z1] = ring[i];
    if ((z0 > z) !== (z1 > z) && x < x0 + (x1 - x0) * (z - z0) / (z1 - z0)) c = !c;
  }
  return c;
}
const inRings = (x, z, rings) => rings.reduce((c, r) => inPoly(x, z, r) ? !c : c, false);
function lineDist(x, z, pts, closed) {      // расстояние от точки до ломаной (или контура)
  let d = Infinity;
  for (let i = closed ? 0 : 1, j = closed ? pts.length - 1 : 0; i < pts.length; j = i++) {
    const [ax, az] = pts[j], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return d;
}
function bboxOf(pts) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  pts.forEach(([x, z]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); });
  return { x0, x1, z0, z1 };
}
const ROAD_W = [14, 10, 7, 4.5, 2.4];        // магистраль, улица, переулок, проезд, тротуар
const ROADS = OSM.r.map(r => [...r, OSM.n]).concat((WEST.r || []).map(r => [...r, WEST.n, true])).map(([c, n, br, a, names, west]) => {
  const p = dm(a);
  return { c, name: n >= 0 ? names[n] : "", br, pts: p, w: ROAD_W[c], west: !!west, ...bboxOf(p) };   // west — дорога западной сцены (рисуется, когда она подгружена)
});
function deckH(d, s, l = d.lc) {                 // концы — вровень с землёй (правый берег высокий, по ширине тоже), посередине — не ниже 13 м
  const ter = (t, w) => terrainH(d.cx + d.dx * t + d.nx * w, d.cz + d.dz * t + d.nz * w);
  if (d.Hm == null) d.Hm = Math.max(d.H, Math.max(ter(d.s0, d.lc), ter(d.s1, d.lc)) + 8);   // середина — на 8 м выше высокого берега (съезд на левом берегу проходит над улицей)
  const a = Math.min(1, (s - d.s0) / d.R), b = Math.min(1, (d.s1 - s) / d.R), ha = ter(d.s0, l), hb = ter(d.s1, l);
  const u = (s - d.s0) / (d.s1 - d.s0), arch = 2.5 * Math.max(0, 1 - ((u - .5) / .32) ** 2);   // над водой — лёгкая арка, как на фото
  const h = Math.min(ha + (d.Hm - ha) * smooth(Math.max(0, a)), hb + (d.Hm - hb) * smooth(Math.max(0, b))) + arch * Math.min(1, a, b);
  return Math.max(h, ter(s, l) + .05);                         // на склоне настил не уходит в землю
}
function deckAt(x, z, y) {                       // настил моста под точкой; ниже настила больше чем на 2,5 м — проезжаем под мостом
  for (const d of DECKS) {
    const ox = x - d.cx, oz = z - d.cz, s = ox * d.dx + oz * d.dz, l = ox * d.nx + oz * d.nz;
    if (s < d.s0 || s > d.s1 || Math.abs(l - d.lc) > d.hw) continue;
    const h = deckH(d, s, l); if (y < h - 2.5) continue;
    return { h, slope: Math.atan((deckH(d, s + .5, l) - deckH(d, s - .5, l))), rx: d.dx, rz: d.dz, d, s, edge: d.hw - Math.abs(l - d.lc) };
  }
  return null;
}
const WATER = OSM.a.filter(a => a[0] === "w").map(([, rs]) => { const rings = rs.map(dm); return { rings, ...bboxOf(rings[0]) }; })
  .concat((WEST.a || []).filter(a => a[0] === "w").map(([, rs]) => { const rings = rs.map(dm); return { rings, ...bboxOf(rings[0]), west: true }; }));   // Дон западной сцены — для логики сразу
// Дон за краями выгрузки: продолжаем реку до границ мира, чтобы левый берег не объезжали по пустырю
(() => {
  const span = x => { let a = Infinity, b = -Infinity; for (let z = -400; z > -1400; z -= 2) if (WATER.some(w => x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1 && inRings(x, z, w.rings))) { a = Math.min(a, z); b = Math.max(b, z); } return [b, a]; };
  // от края всей карты, а если там реки в выгрузке нет — от края центральной полосы
  [[STRIP.x0 + .5, CORE.x0 + .5, WORLD.x0 - 120], ...(WEST.a ? [] : [[STRIP.x1 - .5, CORE.x1 - .5, WORLD.x1 + 120]])].forEach(([xa, xb, far]) => {   // на запад Дон продолжает западная сцена
    let x = xa, [zTop, zBot] = span(x); if (!isFinite(zTop)) { x = xb; [zTop, zBot] = span(x); } if (!isFinite(zTop)) return;
    const ring = [[x, zTop], [far, zTop], [far, zBot], [x, zBot]];
    WATER.push({ rings: [ring], ...bboxOf(ring), outside: true });
  });
})();
const PIERS = OSM.p.map(dm);

/* ---------- рельеф правого берега ---------- */
// Правый берег Ростова — высокий склон: у воды гранитная набережная (2 м над Доном), за Береговой улицей город
// поднимается в гору по настоящим высотам (data/height.js: Copernicus GLO-30, ×0,85) до ~40–50 м у Садовой,
// последние 400 м плавно сходятся к плато PLAT за Садовой (там пока пусто; площадки-макеты — южнее карты, TZ).
// За краями карты по x — ровный придуманный склон к плато: на западе от −760 (западная сцена и ж/д мост ниже −835 — на нуле),
// на востоке от −420 (Дон там доходит до −506).
// Левый берег, Арена и площадки-макеты — на нуле, как раньше.
const TER = { Q: 2, grade: .18, top: 400, edge: 240, step: 10, sideW: -760, sideE: -420 };
const DEM = (() => {                              // сетка высот: строки по z, шаг HEIGHT.step, высота = байт × 0,25 м
  if (typeof HEIGHT === "undefined") return null;
  const b = atob(HEIGHT.q), a = new Float32Array(b.length);
  for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i) * .25;
  return { ...HEIGHT, a };
})();
const demH = (x, z) => {                          // билинейно, за краем сетки — край
  const D = DEM, fx = Math.max(0, Math.min(D.nx - 1.001, (x - D.x0) / D.step)), fz = Math.max(0, Math.min(D.nz - 1.001, (z - D.z0) / D.step));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, A = D.a, n = D.nx, k = j * n + i;
  return (A[k] * (1 - u) + A[k + 1] * u) * (1 - v) + (A[k + n] * (1 - u) + A[k + n + 1] * u) * v;
};
const TX0 = STRIP.x0 - TER.edge, TX1 = STRIP.x1 + TER.edge;   // холм сходит на нет уже за краем карты, а не на её улицах
const BANK = [], FOOT = [];                       // для x с шагом 10 м: z северного берега Дона и подножия склона
(() => {
  const isW = (x, z) => WATER.some(w => x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1 && inRings(x, z, w.rings));
  const ber = ROADS.filter(r => r.name === "Береговая улица").flatMap(r => r.pts).sort((a, b) => a[0] - b[0]);
  const berZ = x => { if (!ber.length) return null; if (x <= ber[0][0]) return ber[0][1]; for (let i = 1; i < ber.length; i++) if (x <= ber[i][0]) { const [x0, z0] = ber[i - 1], [x1, z1] = ber[i]; return z0 + (z1 - z0) * (x - x0) / (x1 - x0 || 1); } return ber[ber.length - 1][1]; };
  const raw = [];
  for (let x = TX0; x <= TX1 + TER.step; x += TER.step) { let zb = null; for (let z = -420; z > -1500; z -= 3) if (isW(x, z)) { zb = z; break; } raw.push(zb); }
  for (let i = 0; i < raw.length; i++) { let s = 0, n = 0; for (let k = -4; k <= 4; k++) { const v = raw[i + k]; if (v != null) { s += v; n++; } } BANK.push(n ? s / n : null); }
  BANK.forEach((zb, i) => { const bz = berZ(TX0 + i * TER.step); FOOT.push(zb == null ? null : Math.max(zb + 30, bz == null ? zb + 40 : bz + 18)); });
})();
const terLerp = (A, x) => { const f = (x - TX0) / TER.step, i = Math.floor(f); if (i < 0 || i >= A.length - 1 || A[i] == null || A[i + 1] == null) return null; return A[i] + (A[i + 1] - A[i]) * (f - i); };
const clamp01 = t => Math.max(0, Math.min(1, t));
const sideZ = x => x < (TX0 + TX1) / 2 ? TER.sideE : TER.sideW;
const sideH = (x, z) => PLAT * smooth(clamp01((z - sideZ(x)) / (-82 - sideZ(x))));   // придуманный склон за краями карты
function terrainH(x, z) {
  if (z > -82) return PLAT;
  if (x < TX0 || x > TX1) return sideH(x, z);
  const zb = terLerp(BANK, x); if (zb != null && z <= zb) return 0;
  const e = smooth(clamp01((x - TX0) / TER.edge)) * smooth(clamp01((TX1 - x) / TER.edge));
  const side = sideH(x, z) * (zb == null ? 1 : smooth(clamp01((z - zb) / 80)));
  if (e <= 0 || !DEM) return side;
  const ft = terLerp(FOOT, x) ?? zb ?? -1e4;
  // от подножия (за Береговой) склон не круче 18 %: настоящие высоты, срезанные линией подъёма (мягкий минимум, без излома)
  // последние TER.top метров к автобану настоящие высоты плавно сходятся к плато
  const d = demH(x, z), a = Math.max(TER.Q, d + (PLAT - d) * smooth(clamp01((z + 82 + TER.top) / TER.top)));
  const b = TER.Q + TER.grade * Math.max(0, z - ft), k = clamp01(.5 + .5 * (b - a) / 4);
  const h = Math.max(TER.Q, b + (a - b) * k - 4 * k * (1 - k));
  return h * e + side * (1 - e);
}
const surfaceH = (x, z) => { const dk = DECKS.length && deckAt(x, z, 1e3); return Math.max(terrainH(x, z), dk ? dk.h : 0); };   // земля или настил моста
const terrainN = (x, z) => { const gx = (terrainH(x + 1, z) - terrainH(x - 1, z)) / 2, gz = (terrainH(x, z + 1) - terrainH(x, z - 1)) / 2; return [gx, gz]; };
// матрица экземпляра, «положенного» на склон: верх — по нормали рельефа
const M4T = (x, y, z, yaw = 0) => {
  const h = terrainH(x, z), [gx, gz] = terrainN(x, z), n = new T.Vector3(-gx, 1, -gz).normalize();
  const q = new T.Quaternion().setFromUnitVectors(yUp0, n).multiply(new T.Quaternion().setFromAxisAngle(yUp0, yaw));
  return new T.Matrix4().compose(new T.Vector3(x, h + y, z), q, new T.Vector3(1, 1, 1));
};
// Большие мосты над рекой из OSM (Ворошиловский): все пути моста с одним именем — один настил над Доном.
// Ось — по самой широкой проезжей части, ширина — по крайним путям (проезжие части и тротуары).
// Высота: 0 на берегах, плавные пандусы, посередине 13 м над водой — под мостом проходят катера.
const DECKS = [];
(() => {
  const groups = {};
  ROADS.forEach(r => { if (r.br && r.name) (groups[r.name] = groups[r.name] || []).push(r); });
  Object.entries(groups).forEach(([name, rs]) => {
    const all = rs.flatMap(r => r.pts), bb = bboxOf(all);
    if (Math.hypot(bb.x1 - bb.x0, bb.z1 - bb.z0) < 150) return;
    const xm = (bb.x0 + bb.x1) / 2, zm = (bb.z0 + bb.z1) / 2, [fx, fz] = rs[0].pts[0], [gx, gz] = rs[0].pts[rs[0].pts.length - 1];
    let wet = 0; for (let k = 1; k < 20; k++) if (waterAt(fx + (gx - fx) * k / 20, fz + (gz - fz) * k / 20)) wet++;
    if (wet < 6) return;                         // только мосты над рекой: эстакады и путепроводы остаются на земле
    const main = rs.reduce((a, r) => r.w > a.w ? r : a), [ax, az] = main.pts[0], [bx, bz] = main.pts[main.pts.length - 1], L = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx;
    const cx = all.reduce((a, p) => a + p[0], 0) / all.length, cz = all.reduce((a, p) => a + p[1], 0) / all.length;
    let s0 = Infinity, s1 = -Infinity, l0 = Infinity, l1 = -Infinity;
    rs.forEach(r => r.pts.forEach(([x, z]) => { const s = (x - cx) * dx + (z - cz) * dz, l = (x - cx) * nx + (z - cz) * nz; s0 = Math.min(s0, s); s1 = Math.max(s1, s); l0 = Math.min(l0, l - r.w / 2); l1 = Math.max(l1, l + r.w / 2); }));
    rs.forEach(r => { r.deck = true; });
    DECKS.push({ name, cx, cz, dx, dz, nx, nz, s0, s1, lc: (l0 + l1) / 2, hw: (l1 - l0) / 2 + .6, H: 13, R: Math.min(170, (s1 - s0) * .3) });
  });
  // стыки: конец моста подключён, если от него по сети улиц можно уехать хотя бы на 300 м. Если рядом только обрывок
  // (выгрузка карты кончается) — строим съезд от конца обрывка к ближайшей улице другой сети (так на левом берегу
  // с Левобережной выезжают на мост). Съезд — плавная дуга, продолжающая направление обрывка.
  const plen = r => r.pts.reduce((a, p, i) => i ? a + Math.hypot(p[0] - r.pts[i - 1][0], p[1] - r.pts[i - 1][1]) : 0, 0);
  const touches = (r, q) => q.x0 < r.x1 + 3 && q.x1 > r.x0 - 3 && q.z0 < r.z1 + 3 && q.z1 > r.z0 - 3 && r.pts.some(a => q.pts.some(b => Math.hypot(a[0] - b[0], a[1] - b[1]) < 3));
  function network(starts) {                      // связная сеть улиц от данных путей: длина (до 400 м) и состав
    const seen = new Set(starts), queue = [...starts]; let len = 0;
    while (queue.length && len < 400) { const r = queue.shift(); len += plen(r); ROADS.forEach(q => { if (!seen.has(q) && !q.deck && q.c <= 2 && touches(r, q)) { seen.add(q); queue.push(q); } }); }
    return { len, seen };
  }
  DECKS.forEach(d => [[d.s0, -1], [d.s1, 1]].forEach(([se, sg]) => {
    const ex = d.cx + d.dx * se + d.nx * d.lc, ez = d.cz + d.dz * se + d.nz * d.lc;
    const near = ROADS.filter(r => !r.deck && r.c <= 2 && r.pts.some(([x, z]) => Math.hypot(x - ex, z - ez) < 15));
    const net = network(near); if (near.length && net.len >= 300) return;
    let from = [ex, ez], fd = 0;                   // конец обрывка — самая дальняя от моста точка его сети
    net.seen.forEach(r => r.pts.forEach(p => { const dd = Math.hypot(p[0] - ex, p[1] - ez); if (dd > fd) { fd = dd; from = p; } }));
    let best = null, bd = 260;
    ROADS.forEach(r => { if (r.deck || r.c > 2 || net.seen.has(r)) return; r.pts.forEach(([x, z]) => { const dd = Math.hypot(x - from[0], z - from[1]); if (dd < bd && dd > 15) { bd = dd; best = [x, z]; } }); });
    if (!best) return;
    const ux = fd > 1 ? (from[0] - ex) / fd : d.dx * sg, uz = fd > 1 ? (from[1] - ez) / fd : d.dz * sg;
    const p1 = [from[0] + ux * 15, from[1] + uz * 15], c = [p1[0] + ux * bd * .45, p1[1] + uz * bd * .45], pts = [from, p1];
    for (let k = 1; k <= 8; k++) { const t = k / 8, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), e = t * t; pts.push([a * p1[0] + b * c[0] + e * best[0], a * p1[1] + b * c[1] + e * best[1]]); }
    ROADS.push({ c: 1, name: "Съезд с " + d.name.replace("мост", "моста"), br: 0, pts, w: ROAD_W[1], link: true, ...bboxOf(pts) });
  }));
})();
// проезжая часть (улицы, магистрали, проезды; не тротуары): столбы, фонари, скамейки сюда не ставим никогда
function onCarriageway(x, z, pad = .4) {
  return ROADS.some(q => q.c <= 3 && x > q.x0 - 14 && x < q.x1 + 14 && z > q.z0 - 14 && z < q.z1 + 14 && lineDist(x, z, q.pts, false) < q.w / 2 + pad);
}
const ZONES = OSM.z.map(z => [...z, OSM.n]).concat((WEST.z || []).map(z => [...z, WEST.n])).map(([n, a, names]) => { const ring = dm(a); return { name: names[n], ring, ...bboxOf(ring), area: (() => { let s = 0; ring.forEach(([x, z], i) => { const [x2, z2] = ring[(i + 1) % ring.length]; s += x * z2 - x2 * z; }); return Math.abs(s / 2); })() }; }).sort((a, b) => a.area - b.area);
function waterAt(x, z) {                    // вода под точкой (с учётом моста и причалов)
  if (!inWorldMap(x, z)) return null;
  const w = WATER.find(w => x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1 && inRings(x, z, w.rings));
  if (!w || PIERS.some(p => lineDist(x, z, p, false) < 1.8)) return null;
  return w;
}
function roadPoint(name) {                  // середина самого длинного отрезка улицы и курс вдоль неё
  let best = null, bl = 0;
  ROADS.forEach(r => { if (r.name === name) for (let i = 1; i < r.pts.length; i++) { const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i], l = Math.hypot(bx - ax, bz - az); if (l > bl) { bl = l; best = [(ax + bx) / 2, (az + bz) / 2, Math.atan2(-(bz - az), bx - ax)]; } } });
  return best;
}
function placeName(x, z) {
  const w = waterAt(x, z);
  if (w) return ZONES.find(zn => inPoly(x, z, zn.ring) && WATER.some(v => v === w))?.name || "Дон";
  let best = null, bd = Infinity;
  for (const r of ROADS) {
    if (!r.name || r.c > 3 || x < r.x0 - 12 || x > r.x1 + 12 || z < r.z0 - 12 || z > r.z1 + 12) continue;
    const d = lineDist(x, z, r.pts, false) - r.w / 2;
    if (d < 4 && d < bd) { bd = d; best = r.name; }
  }
  if (best) return best;
  const zn = ZONES.find(zn => x > zn.x0 && x < zn.x1 && z > zn.z0 && z < zn.z1 && inPoly(x, z, zn.ring));
  if (zn) return zn.name;
  return z > -520 ? "Богатяновка" : z > -1100 ? "Набережная" : "Левый берег";
}

let CITY = null;
(() => {
  const DS = T.DoubleSide;
  const flatMat = (color, f) => new T.MeshLambertMaterial({ color, side: DS, polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: f });
  // плоские слои двусторонние: у треугольника «изнанкой» вверх three переворачивает нормаль вниз, и он выходит почти чёрным
  // (те самые чёрные пятна на перекрёстках — круглые стыки дорог шли по часовой). Разворачиваем все треугольники лицом вверх.
  function faceUp(P) {
    for (let i = 0; i < P.length; i += 9) {
      if ((P[i + 5] - P[i + 2]) * (P[i + 6] - P[i]) - (P[i + 3] - P[i]) * (P[i + 8] - P[i + 2]) >= 0) continue;   // y нормали ≥ 0 — уже лицом вверх
      for (let k = 0; k < 3; k++) { const t = P[i + 3 + k]; P[i + 3 + k] = P[i + 6 + k]; P[i + 6 + k] = t; }
    }
    return P;
  }
  function fillGeo(list, y) {               // многоугольники с дырами → треугольники на высоте y
    const P = [];
    list.forEach(rings => {
      const c = rings[0].map(([x, z]) => new T.Vector2(x, z)), hs = rings.slice(1).map(r => r.map(([x, z]) => new T.Vector2(x, z)));
      const all = c.concat(...hs);
      T.ShapeUtils.triangulateShape(c, hs).forEach(t => t.forEach(i => P.push(all[i].x, y, all[i].y)));
    });
    faceUp(P);
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(P, 3));
    g.setAttribute("normal", new T.Float32BufferAttribute(P.map((_, i) => i % 3 === 1 ? 1 : 0), 3)); return g;
  }
  function stripGeo(lines, y, joins = true) {  // ломаные заданной ширины: прямоугольники на отрезках + круглые стыки
    const P = [];
    lines.forEach(({ pts, w }) => {
      const h = w / 2;
      for (let i = 1; i < pts.length; i++) {
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / L * h, nz = (bx - ax) / L * h;
        P.push(ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz, ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz);
      }
      if (joins && w > 3) pts.forEach(([x, z], i) => {
        if (i > 0 && i < pts.length - 1) {          // на почти прямом изломе стык не нужен
          const [ax, az] = pts[i - 1], [bx, bz] = pts[i + 1];
          const d = Math.abs(Math.atan2(z - az, x - ax) - Math.atan2(bz - z, bx - x)) % (Math.PI * 2);
          if (Math.min(d, Math.PI * 2 - d) < .12) return;
        }
        for (let k = 0; k < 6; k++) {
          const a0 = k / 6 * Math.PI * 2, a1 = (k + 1) / 6 * Math.PI * 2;
          P.push(x, y, z, x + Math.cos(a0) * h, y, z + Math.sin(a0) * h, x + Math.cos(a1) * h, y, z + Math.sin(a1) * h);
        }
      });
    });
    faceUp(P);
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(P, 3));
    g.setAttribute("normal", new T.Float32BufferAttribute(P.map((_, i) => i % 3 === 1 ? 1 : 0), 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(P.filter((_, i) => i % 3 !== 1).map(v => v / 7), 2)); return g;   // uv по миру: плитка фактуры 7 м
  }
  const add = (geo, m) => { const mesh = new T.Mesh(geo, m); scene.add(mesh); return mesh; };

  // земля полосы и площади: газоны, лес, спортплощадки, пляж, парковки, стройки
  flat(STRIP.x1 - STRIP.x0, STRIP.z1 - STRIP.z0, flatMat(0x9d9585, 3), (STRIP.x0 + STRIP.x1) / 2, (STRIP.z0 + STRIP.z1) / 2, .005);
  const AREA = { c: [0xa59b87, .02], b: [0xd8c89d, .022], g: [0x4a7d2e, .025], f: [0x3b6a28, .027], s: [0x447f35, .03], k: [0x9c9a93, .032] };   // цвета по фото: плитка, газон, песок
  Object.entries(AREA).forEach(([k, [color, y]]) => {
    const list = OSM.a.filter(a => a[0] === k).map(([, rs]) => rs.map(dm));
    if (list.length) add(fillGeo(list, y), flatMat(color, 2));
  });
  add(fillGeo(WATER.filter(w => !w.west).map(w => w.rings), .035), DON_WATER);

  // дороги: чем крупнее, тем выше слой — на перекрёстках главная дорога лежит сверху
  const RC = [0x404246, 0x45474b, 0x4b4d51, 0x55575b, 0xa8a59e];   // серый асфальт, светлая плитка тротуаров
  // бордюр: светлая кайма 0,35 м под всеми дорогами — видна только там, где рядом нет другой дороги
  // (на склоне дороги нарисованы на его текстуре — там бордюр не нужен, лишняя перерисовка)
  add(stripGeo(ROADS.filter(r => r.c <= 2 && !r.deck && !r.west && r.pts.some(([x, z]) => terrainH(x, z) < .3)).map(r => ({ pts: r.pts, w: r.w + .7 })), .045), flatMat(0xb4b1aa, 0));
  [4, 3, 2, 1, 0].forEach((c, i) => {
    const list = ROADS.filter(r => r.c === c && !r.deck && !r.west);       // мосты — отдельной моделью над водой; запад — в своей сцене
    if (list.length) { const m = flatMat(RC[c], 0); m.map = grainTex; add(stripGeo(list, .05 + i * .006), m); }
  });
  // разметка: прерывистая ось на улицах и магистралях
  const white = new T.MeshBasicMaterial({ color: 0xf2efe6 }), dashes = [];
  ROADS.filter(r => r.c <= 2 && !r.deck && !r.west).forEach(r => {   // осевая на всех улицах
    let carry = 0;
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i], L = Math.hypot(bx - ax, bz - az);
      for (let s = carry; s < L; s += 9) dashes.push([ax + (bx - ax) * s / L, az + (bz - az) * s / L, Math.atan2(-(bz - az), bx - ax)]);
      carry = (carry - L) % 9; if (carry < 0) carry += 9;
    }
  });
  const m4 = new T.Matrix4(), q = new T.Quaternion();
  chunked(new T.PlaneGeometry(3, .18).rotateX(-Math.PI / 2), white, dashes.map(([x, z, yaw]) => M4T(x, .09, z, yaw)), .7);   // M4T — по склону
  // железная дорога и трамвай
  const rails = OSM.l.map(([k, a]) => ({ k, pts: dm(a) }));
  add(stripGeo(rails.filter(r => r.k === 0).map(r => ({ pts: r.pts, w: 3.2 })), .04, false), flatMat(0x8a7f74, 1));
  const railLines = [];
  rails.forEach(({ pts }) => [-.72, .72].forEach(o => {
    const off = pts.map(([x, z], i) => { const [ax, az] = pts[Math.max(0, i - 1)], [bx, bz] = pts[Math.min(pts.length - 1, i + 1)], L = Math.hypot(bx - ax, bz - az) || 1; return [x - (bz - az) / L * o, z + (bx - ax) / L * o]; });
    railLines.push({ pts: off, w: .14 });
  }));
  add(stripGeo(railLines, .1, false), flatMat(0x2c2b33, 0));
  {   // контактная сеть трамвая: столбы у края улицы (никогда на проезжей части), провод над путём на 6 м, поперечные растяжки
    const onRoad = (x, z) => onCarriageway(x, z, .6);
    const poles = [], W = [], wy = (x, z) => surfaceH(x, z) + 6;
    rails.filter(r => r.k === 1).forEach(({ pts }) => {
      let carry = 0, side = 1;
      for (let i = 1; i < pts.length; i++) {
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az); if (L < .1) continue;
        const nx = -(bz - az) / L, nz = (bx - ax) / L;
        W.push(ax, wy(ax, az), az, bx, wy(bx, bz), bz);
        for (let s = carry; s < L; s += 32) {
          const x = ax + (bx - ax) * s / L, z = az + (bz - az) * s / L;
          let off = 4; while (off < 13 && onRoad(x + nx * off * side, z + nz * off * side)) off += 1;
          if (off < 13) { const px = x + nx * off * side, pz = z + nz * off * side, g = surfaceH(px, pz); poles.push(M4(px, g, pz)); W.push(px, g + 6.6, pz, x, wy(x, z), z); }
          side = -side;
        }
        carry = (carry - L) % 32; if (carry < 0) carry += 32;
      }
    });
    if (poles.length) {
      chunked(new T.CylinderGeometry(.09, .13, 7, 6).translate(0, 3.5, 0), mat(0x2e3135), poles, .5);
      const wg = new T.BufferGeometry(); wg.setAttribute("position", new T.Float32BufferAttribute(W, 3));
      const wires = new T.LineSegments(wg, new T.LineBasicMaterial({ color: 0x1d1f22 })); wires.userData.dyn = true; scene.add(wires);
    }
  }
  // причалы
  add(stripGeo(PIERS.map(pts => ({ pts, w: 3.4 })), .12, false), flatMat(0x9c7b58, 0));

  // Ворошиловский мост по фото (после реконструкции): тонкая плита с белыми кромками, под ней узкая коробчатая балка,
  // металлические перила, опоры — по четыре колонны на общем ростверке, фонари с синими флажками, у правого берега —
  // белая решётчатая башня-лестница. Над водой настил чуть выгнут аркой.
  DECKS.forEach(d => {
    const N = Math.ceil((d.s1 - d.s0) / 6), top = [], edge = [], box = [], line = [], rails = [], marks = [];
    const P = (s, l, y) => [d.cx + d.dx * s + d.nx * l, y, d.cz + d.dz * s + d.nz * l], quad = (A, a, b, c, e) => A.push(...a, ...b, ...c, ...a, ...c, ...e);
    const L0 = d.lc - d.hw, L1 = d.lc + d.hw, SL = .7, BW = d.hw * .55, BD = 2.6, yaw = Math.atan2(-d.dz, d.dx);
    for (let i = 0; i < N; i++) {
      const sa = d.s0 + (d.s1 - d.s0) * i / N, sb = d.s0 + (d.s1 - d.s0) * (i + 1) / N, H = (t, l) => deckH(d, t, l) + .06;
      quad(top, P(sa, L0, H(sa, L0)), P(sa, L1, H(sa, L1)), P(sb, L1, H(sb, L1)), P(sb, L0, H(sb, L0)));
      [L0, L1].forEach((l, k) => {
        const li = l + (k ? -.4 : .4), ha = H(sa, l), hb = H(sb, l);
        quad(edge, P(sa, l, ha - SL), P(sb, l, hb - SL), P(sb, l, hb + .45), P(sa, l, ha + .45));         // белая кромка и бортик
        quad(edge, P(sa, li, ha), P(sb, li, hb), P(sb, li, hb + .45), P(sa, li, ha + .45));
        quad(edge, P(sa, l, ha + .45), P(sb, l, hb + .45), P(sb, li, hb + .45), P(sa, li, ha + .45));
        quad(edge, P(sa, l, ha - SL), P(sb, l, hb - SL), P(sb, li, hb - SL), P(sa, li, ha - SL));
        quad(rails, P(sa, l, ha + 1.05), P(sb, l, hb + 1.05), P(sb, l, hb + 1.15), P(sa, l, ha + 1.15));   // поручень
        line.push(...P(sa, l, ha + .45), ...P(sa, l, ha + 1.1));                          // стойки перил
      });
      const hc = H(sa, d.lc), hd = H(sb, d.lc);
      if (hc - terrainH(...P(sa, d.lc, 0).filter((_, q) => q !== 1)) > 4) {                                  // балка — там, где мост высоко
        [-BW, BW].forEach(o => quad(box, P(sa, d.lc + o, hc - SL), P(sb, d.lc + o, hd - SL), P(sb, d.lc + o, hd - SL - BD), P(sa, d.lc + o, hc - SL - BD)));
        quad(box, P(sa, d.lc - BW, hc - SL - BD), P(sb, d.lc - BW, hd - SL - BD), P(sb, d.lc + BW, hd - SL - BD), P(sa, d.lc + BW, hc - SL - BD));
      }
      quad(box, P(sa, L0, H(sa, L0) - SL), P(sb, L0, H(sb, L0) - SL), P(sb, L1, H(sb, L1) - SL), P(sa, L1, H(sa, L1) - SL));   // низ плиты
      [-.2, .2].forEach(o => quad(marks, P(sa, d.lc + o - .08, hc + .02), P(sa, d.lc + o + .08, hc + .02), P(sb, d.lc + o + .08, hd + .02), P(sb, d.lc + o - .08, hd + .02)));   // двойная осевая
    }
    const mk = (pos, m) => { const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); add(g, m); };
    mk(top, new T.MeshStandardMaterial({ color: 0x1c1d20, roughness: .9, side: DS }));
    mk(edge, new T.MeshStandardMaterial({ color: 0xe4e1d8, roughness: .7, side: DS })); mk(box, new T.MeshStandardMaterial({ color: 0xb9b5aa, roughness: .85, side: DS }));
    mk(rails, new T.MeshStandardMaterial({ color: 0x9aa0a6, roughness: .4, metalness: .5, side: DS })); mk(marks, new T.MeshBasicMaterial({ color: 0xf2efe6, side: DS }));
    const lg = new T.BufferGeometry(); lg.setAttribute("position", new T.Float32BufferAttribute(line, 3)); scene.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0x8d9399 })));
    // опоры: ростверк, четыре колонны поперёк, ригель под балкой
    const pierM = mat(0xc4c0b5, { roughness: .9 });
    for (let s = d.s0 + d.R * .45; s < d.s1 - d.R * .4; s += 58) {
      const top2 = deckH(d, s) - SL - BD, gb = terrainH(...P(s, d.lc, 0).filter((_, i) => i !== 1)); if (top2 - gb < 3) continue;
      const [x, , z] = P(s, d.lc, 0), base = gb > .5 ? gb - .3 : -1;
      const foot = new T.Mesh(new T.BoxGeometry(5, 2.2, BW * 2.6), pierM); foot.position.set(x, base + 1.1 - .9, z); foot.rotation.y = yaw; scene.add(foot);
      [-1.5, -.5, .5, 1.5].forEach(f => {
        const [cx, , cz] = P(s, d.lc + f * BW * .62, 0), col = new T.Mesh(new T.BoxGeometry(1.7, top2 - base, 1.7), pierM);
        col.position.set(cx, (top2 + base) / 2, cz); col.rotation.y = yaw; scene.add(col);
        solids.push({ x0: cx - 1, x1: cx + 1, z0: cz - 1, z1: cz + 1, h: top2, name: "опору моста" });
      });
      const cap = new T.Mesh(new T.BoxGeometry(2.4, 1.2, BW * 2.5), pierM); cap.position.set(x, top2 - .6, z); cap.rotation.y = yaw; scene.add(cap);
    }
    // фонари: высокий столб, кронштейн над дорогой, синий флажок; ночью — пятна света на настиле
    const poleM = mat(0xc9ccd0), flagM = new T.MeshStandardMaterial({ color: new T.Color("#2f5fb3").convertSRGBToLinear(), side: DS }), headM = nightReg(new T.MeshBasicMaterial({ color: 0xd9d2bf }), "color", { sunset: 0xd9d2bf, day: 0xd9d2bf, night: 0xfff0c0 }), poolPts = [];
    for (let s = d.s0 + 12; s < d.s1 - 6; s += 32) [L0 + .9, L1 - .9].forEach((l, k) => {
      const h = deckH(d, s, l) + .06, [x, , z] = P(s, l, h), sg = k ? -1 : 1;
      const pole = new T.Mesh(new T.CylinderGeometry(.11, .16, 11, 6), poleM); pole.position.set(x, h + 5.5, z); scene.add(pole);
      const arm = new T.Mesh(new T.BoxGeometry(.12, .12, 3), poleM); arm.position.set(x + d.nx * sg * 1.4, h + 10.9, z + d.nz * sg * 1.4); arm.rotation.y = yaw; scene.add(arm);
      const lamp = new T.Mesh(new T.BoxGeometry(1, .2, .45), headM); lamp.position.set(x + d.nx * sg * 2.8, h + 10.8, z + d.nz * sg * 2.8); lamp.rotation.y = yaw; scene.add(lamp);
      const flag = new T.Mesh(new T.PlaneGeometry(.9, .55), flagM); flag.position.set(x - d.nx * sg * .5, h + 8.6, z - d.nz * sg * .5); flag.rotation.y = yaw; scene.add(flag);
      poolPts.push(M4(x + d.nx * sg * 3.4, h + .1, z + d.nz * sg * 3.4));
    });
    const pc = document.createElement("canvas"); pc.width = pc.height = 64; const pg = pc.getContext("2d"), gr = pg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,214,150,.6)"); gr.addColorStop(1, "rgba(255,214,150,0)"); pg.fillStyle = gr; pg.fillRect(0, 0, 64, 64);
    chunked(new T.PlaneGeometry(14, 14).rotateX(-Math.PI / 2), nightReg(new T.MeshBasicMaterial({ map: new T.CanvasTexture(pc), transparent: true, depthWrite: false, blending: T.AdditiveBlending, visible: false }), "visible", { sunset: false, day: false, night: true }), poolPts, .6);
    // белая решётчатая башня у правого берега — там, где мост выходит на набережную
    let sb = null; for (let t = d.s0; t < d.s1; t += 2) { const [x, , z] = P(t, L1 + 4, 0); if (BANK.length && terrainH(x, z) > 1 && !waterAt(x, z) && waterAt(...P(t + (d.dz < 0 ? 6 : -6), L1 + 4, 0).filter((_, i) => i !== 1))) { sb = t; break; } }
    if (sb != null) {
      const [x, , z] = P(sb, L1 + 4.5, 0), g0 = terrainH(x, z), hTop = deckH(d, sb) + 6, wM = mat(0xf2f2ee), tw = new T.Group();
      [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]].forEach(([a, c]) => { const p = new T.Mesh(new T.BoxGeometry(.3, hTop - g0, .3), wM); p.position.set(a, (hTop + g0) / 2, c); tw.add(p); });
      const br = [];
      for (let y = g0 + 3; y < hTop; y += 3) { [[-1.6, -1.6, 1.6, -1.6], [1.6, -1.6, 1.6, 1.6], [1.6, 1.6, -1.6, 1.6], [-1.6, 1.6, -1.6, -1.6]].forEach(([a, b, c, e]) => { br.push(a, y, b, c, y, e, a, y - 3, b, c, y, e); }); }
      const bg = new T.BufferGeometry(); bg.setAttribute("position", new T.Float32BufferAttribute(br, 3)); tw.add(new T.LineSegments(bg, new T.LineBasicMaterial({ color: 0xf6f6f2 })));
      tw.position.set(x, 0, z); tw.rotation.y = yaw; scene.add(tw);
      solids.push({ x0: x - 2.2, x1: x + 2.2, z0: z - 2.2, z1: z + 2.2, h: hTop, name: "башню у моста" });
    }
  });

  // дома: стены с окнами (жилые, общественные) и без (склады, стадион), плоские крыши
  // атлас фасадов — 4 плитки 64×64 (6 м × 6,4 м, два этажа) столбиком: 0 обычный, 1 панелька, 2 старый город, 3 стекло.
  // Столбиком — чтобы по горизонтали работал обычный повтор текстуры; стык мип-уровней остаётся только горизонтальный (раз в два этажа)
  const winC = document.createElement("canvas"), emC = document.createElement("canvas"); winC.width = emC.width = 64; winC.height = emC.height = 256;
  const wg = winC.getContext("2d"), eg = emC.getContext("2d");
  wg.fillStyle = "#fff"; wg.fillRect(0, 0, 64, 256); eg.fillStyle = "#000"; eg.fillRect(0, 0, 64, 256);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    const lit = rnd() < .4;
    wg.fillStyle = lit ? "#c9a46e" : "#4c5b6b"; wg.fillRect(c * 32 + 9, r * 32 + 8, 14, 16);   // днём окна — тёмное стекло
    if (lit) { eg.fillStyle = "#ffcf7a"; eg.fillRect(c * 32 + 9, r * 32 + 8, 14, 16); }
  }
  { let hs = 99; const hr = () => (hs = (hs * 16807) % 2147483647) / 2147483647;   // своё зерно — общий rnd() не сдвигаем
    const win = (x, y, w, h, day, lit, glow = "#ffcf7a") => { wg.fillStyle = lit ? "#c9a46e" : day; wg.fillRect(x, y, w, h); if (lit) { eg.fillStyle = glow; eg.fillRect(x, y, w, h); } };
    const tile = k => [wg, eg].forEach(g => g.setTransform(1, 0, 0, 1, -64 * k, 64 * k));   // рисуем плитку k в координатах x 64k…, кладём в строку k
    // 1 — панелька: швы плит, широкие окна, тёмная полоса лоджий
    tile(1);
    wg.fillStyle = "#b9b9b9"; wg.fillRect(64, 0, 64, 1); wg.fillRect(64, 32, 64, 1); wg.fillRect(64, 0, 1, 64); wg.fillRect(96, 0, 1, 64);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { win(64 + c * 32 + 7, r * 32 + 9, 18, 13, "#4f5e6c", hr() < .45); wg.fillStyle = "#d6d6d6"; wg.fillRect(64 + c * 32 + 5, r * 32 + 23, 22, 3); }
    tile(2);
    // 2 — старый город: светлые наличники, высокие окна с полукруглым верхом, междуэтажный карниз
    wg.fillStyle = "#e0e0e0"; wg.fillRect(128, 0, 64, 64);
    for (let r = 0; r < 2; r++) {
      wg.fillStyle = "#ffffff"; wg.fillRect(128, r * 32 + 29, 64, 3);
      for (let c = 0; c < 2; c++) {
        const x = 128 + c * 32 + 10, y = r * 32 + 6, lit = hr() < .4;
        wg.fillStyle = "#ffffff"; wg.fillRect(x - 2, y + 2, 16, 19); wg.beginPath(); wg.arc(x + 6, y + 5, 8, Math.PI, 0); wg.fill();
        win(x, y + 4, 12, 16, "#475562", lit); wg.fillStyle = lit ? "#c9a46e" : "#475562"; wg.beginPath(); wg.arc(x + 6, y + 5, 6, Math.PI, 0); wg.fill();
        if (lit) { eg.fillStyle = "#ffcf7a"; eg.beginPath(); eg.arc(x + 6, y + 5, 6, Math.PI, 0); eg.fill(); }
      }
    }
    tile(3);
    // 3 — стекло: панели в рамах, светлый блик сверху вниз, этажные пояса
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const g = wg.createLinearGradient(0, r * 16, 0, r * 16 + 16); g.addColorStop(0, "#9fb6c8"); g.addColorStop(1, "#56708a");
      wg.fillStyle = g; wg.fillRect(192 + c * 16 + 1, r * 16 + 2, 14, 13);
      if (hr() < .35) { eg.fillStyle = "#e8f0ff"; eg.fillRect(192 + c * 16 + 1, r * 16 + 2, 14, 13); }
    }
    wg.fillStyle = "#d8dde2"; for (let r = 0; r < 4; r++) wg.fillRect(192, r * 16, 64, 2);
    tile(0);
  }
  const mk = c => { const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; return t; };
  const winTex = mk(winC), emTex = mk(emC); if (location.hash === "#test") window.__atlas = [winC, emC];
  const PAL = [[0xd9cfbf, 0xc9b8a0, 0xe0d8c8, 0xbfa58a, 0xd2c4ae, 0xa45a42], [0x9aa0a6, 0xb2b4b0, 0x8e9499], [0xc8d0d8, 0xd6d6d2, 0xaeb9c2], [0xc98f6b, 0xb9775a, 0xd9b08c], [0xeceef0]];
  const ROOFS = [0x5d5f63, 0x6b6e72, 0x7a5a48, 0x8f9397];
  // старый Ростов на холме — как с левого берега: охра, кремовый, светло-жёлтый, терракота; крыши ржаво-красные, зелёные, серые
  const lin = h => new T.Color(h).convertSRGBToLinear(), GLASS = lin("#e4ecf2"), PANEL = ["#dcd8cf", "#cfd2d4", "#e4dccb", "#d2cbc0"].map(lin);
  const OLD_TOWN = { walls: ["#e9dcc0", "#e2c78c", "#d8a676", "#c98a68", "#efe7d4", "#dcb89e", "#e8d49a"].map(lin), roofs: ["#7d3a2b", "#8c4a33", "#536e52", "#6e5f52", "#62666a"].map(lin), brick: lin("#9a4e36"), concrete: lin("#cfcac0") };
  // дома разложены по участкам 400×400 м (по середине дома): каждый участок — одна сетка, рисуется только в поле зрения и ближе тумана
  const LOT = 400, lots = new Map(), col = new T.Color(), rcol = new T.Color();
  const lotOf = (x, z) => { const k = Math.floor(x / LOT) * 4096 + Math.floor(z / LOT); if (!lots.has(k)) lots.set(k, { W: [], R: [] }); return lots.get(k); };
  const arenaSrc = OSM.b.find(b => b[1] === 4), arenaRing = arenaSrc ? dm(arenaSrc[2][0]) : null;
  function house([hd, kind, rs, nameI], bi, names, lotOf) {          // дом из данных карты → стены и крыша в сетку участка, препятствие
    const rings = rs.map(dm), h = hd / 10, plain = kind === 1 || kind === 4;
    if (kind === 4) { solids.push({ ...bboxOf(rings[0]), h: 29, name: "стену стадиона", rings, arena: true }); return; }   // Ростов Арена — отдельная модель
    if (arenaRing) {                     // площадь у Арены расчищена под трассу и мега-трамплины: павильоны и кассы в полосе 70 м убираем
      const c = bboxOf(rings[0]), cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
      if (!inPoly(cx, cz, arenaRing) && lineDist(cx, cz, arenaRing, true) < 70) return;
    }
    { const c = bboxOf(rings[0]), cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;            // под настилом моста домов нет
      if (DECKS.some(d => { const ox = cx - d.cx, oz = cz - d.cz, sd = ox * d.dx + oz * d.dz, l = ox * d.nx + oz * d.nz; return sd > d.s0 - 4 && sd < d.s1 + 4 && Math.abs(l - d.lc) < d.hw + 3; })) return; }
    const pal = PAL[kind]; col.setHex(pal[bi % pal.length]); rcol.setHex(ROOFS[(bi * 7) % ROOFS.length]);
    // на склоне: дом стоит на отметке середины, стены уходят до низа склона под ним
    const bb0 = bboxOf(rings[0]), gc = terrainH((bb0.x0 + bb0.x1) / 2, (bb0.z0 + bb0.z1) / 2), gmin = Math.min(gc, ...rings[0].map(([x, z]) => terrainH(x, z))) - .4;
    const nm = nameI >= 0 ? names[nameI] : "";
    if (/Парамонов/.test(nm)) { col.copy(OLD_TOWN.brick); rcol.copy(OLD_TOWN.roofs[0]); }          // кирпичные Парамоновские склады
    else if (/зерновых складов/.test(nm)) { col.copy(OLD_TOWN.concrete); rcol.copy(OLD_TOWN.roofs[4]); }
    else if (gc > 3 && kind !== 1) { col.copy(OLD_TOWN.walls[bi % OLD_TOWN.walls.length]); rcol.copy(OLD_TOWN.roofs[(bi * 3) % OLD_TOWN.roofs.length]); }   // старый город на холме: охра, кремовый, терракота
    // тип фасада: стекло — высокие общественные, панелька — высокие жилые, старый город — исторические и дома на холме
    const fac = plain ? -1 : kind === 2 && h >= 18 ? 3 : kind === 3 || (gc > 3 && h < 18) ? 2 : kind === 0 && h >= 15 ? 1 : 0;
    if (fac === 3) col.copy(GLASS); else if (fac === 1) col.copy(PANEL[bi % PANEL.length]);
    const lot = lotOf((bb0.x0 + bb0.x1) / 2, (bb0.z0 + bb0.z1) / 2), W = lot.W, win = fac + 1, roofY = gc + h, P = h >= 4 ? .35 : 0;   // P — парапет над крышей (низкий: по крыше ездят, а он не твёрдый)
    rings.forEach((ring, ri) => {
      let s = 0; for (let i = 0; i < ring.length; i++) s += ring[i][0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * ring[i][1];
      const out = (s > 0) === (ri === 0) ? 1 : -1;           // наружная нормаль для внешнего кольца и для дыр
      let u = 0;
      for (let i = 0; i < ring.length; i++) {
        const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length], L = Math.hypot(bx - ax, bz - az);
        if (L < .05) continue;
        const nx = -(bz - az) / L * out, nz = (bx - ax) / L * out, u1 = u + L / 6, top = roofY + P, v0 = (gmin - gc) / 6.4, v = (h + P) / 6.4;
        const ga = terrainH(ax, az), gb = terrainH(bx, bz);           // земля под углами стены — для затенения у основания
        W.push([ax, gmin, az, u, v0, ga], [bx, gmin, bz, u1, v0, gb], [bx, top, bz, u1, v, gb], [ax, gmin, az, u, v0, ga], [bx, top, bz, u1, v, gb], [ax, top, az, u, v, ga]);
        W[W.length - 1].n = W[W.length - 2].n = W[W.length - 3].n = W[W.length - 4].n = W[W.length - 5].n = W[W.length - 6].n = [nx, 0, nz];
        for (let k = 0; k < 6; k++) { W[W.length - 1 - k].c = [col.r, col.g, col.b]; W[W.length - 1 - k].w = win; W[W.length - 1 - k].t = roofY; }
        if (P) {                                   // внутренняя сторона парапета
          const pv = [[ax, roofY, az], [bx, roofY, bz], [bx, top, bz], [ax, roofY, az], [bx, top, bz], [ax, top, az]].map(([x, y, z]) => Object.assign([x, y, z, 0, 0, -99], { n: [-nx, 0, -nz], c: [col.r * .8, col.g * .8, col.b * .8], w: 0, t: roofY }));
          W.push(...pv);
        }
        u = u1;
      }
    });
    const c2 = rings[0].map(([x, z]) => new T.Vector2(x, z)), hs = rings.slice(1).map(r => r.map(([x, z]) => new T.Vector2(x, z))), all = c2.concat(...hs);
    T.ShapeUtils.triangulateShape(c2, hs).forEach(t => t.forEach(i => lot.R.push(all[i].x, gc + h, all[i].y, rcol.r, rcol.g, rcol.b)));
    const name = kind === 4 ? "стену стадиона" : "дом";
    const sb = { ...bboxOf(rings[0]), h: gc + h, name, rings };
    // посадочная площадка: плоская крыша, где помещается квадрат 7×7 м вокруг середины, высота 3–45 м
    const cx = (sb.x0 + sb.x1) / 2, cz = (sb.z0 + sb.z1) / 2;
    if (kind !== 4 && h >= 3 && h <= 45 && [[0, 0], [3.5, 3.5], [-3.5, 3.5], [3.5, -3.5], [-3.5, -3.5]].every(([dx, dz]) => inRings(cx + dx, cz + dz, rings)))
      sb.pad = { x: cx, z: cz };
    solids.push(sb);
    // машинное помещение лифта на крыше высоких домов: бетонная будка 3×3×2,4 м ближе к углу (середина — под площадку и разгон), твёрдая
    if (!plain && h >= 15) {
      const pick = [[.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7], [.7, 0], [-.7, 0]].map(([kx, kz]) => [cx + (sb.x1 - sb.x0) / 2 * kx, cz + (sb.z1 - sb.z0) / 2 * kz])
        .find(([x, z]) => Math.hypot(x - cx, z - cz) > 9 && [[-2.5, -2.5], [2.5, -2.5], [2.5, 2.5], [-2.5, 2.5]].every(([dx, dz]) => inRings(x + dx, z + dz, rings)));
      if (pick) {
        const [x, z] = pick, b0 = roofY, b1 = roofY + 2.4, k = .82, cc = [col.r * k, col.g * k, col.b * k];
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([nx, nz]) => {
          const tx = -nz, tz = nx, fx = x + nx * 1.5, fz = z + nz * 1.5, A = [fx - tx * 1.5, fz - tz * 1.5], B = [fx + tx * 1.5, fz + tz * 1.5];
          [[A, b0], [B, b0], [B, b1], [A, b0], [B, b1], [A, b1]].forEach(([[px, pz], y]) => W.push(Object.assign([px, y, pz, 0, 0, b0], { n: [nx, 0, nz], c: cc, w: 0, t: b1 + 9 })));
        });
        [[-1.5, -1.5], [1.5, -1.5], [1.5, 1.5], [-1.5, -1.5], [1.5, 1.5], [-1.5, 1.5]].forEach(([dx, dz]) => lot.R.push(x + dx, b1, z + dz, rcol.r, rcol.g, rcol.b));
        solids.push({ x0: x - 1.5, x1: x + 1.5, z0: z - 1.5, z1: z + 1.5, h: b1, name: "будку на крыше" });
      }
    }
    return sb;
  }
  OSM.b.forEach((b, bi) => house(b, bi, OSM.n, lotOf));
  // стены с окнами, глухие стены и крыши — в одной сетке участка; win: 0 — без окон, 1–4 — плитка атласа фасадов;
  // aoBase = (земля под стеной, отметка крыши): у земли темнее, выше крыши — светлый карниз-парапет без окон
  const lotGeo = ({ W, R }) => {
    const P = [], N = [], U = [], C = [], B = [], Wn = [];
    W.forEach(v => { P.push(v[0], v[1], v[2]); U.push(v[3], v[4]); N.push(...v.n); C.push(...v.c); B.push(v[5], v.t); Wn.push(v.w); });
    for (let i = 0; i < R.length; i += 6) { P.push(R[i], R[i + 1], R[i + 2]); U.push(0, 0); N.push(0, 1, 0); C.push(R[i + 3], R[i + 4], R[i + 5]); B.push(-99, 999); Wn.push(0); }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(P, 3)); g.setAttribute("normal", new T.Float32BufferAttribute(N, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(U, 2)); g.setAttribute("color", new T.Float32BufferAttribute(C, 3));
    g.setAttribute("aoBase", new T.Float32BufferAttribute(B, 2)); g.setAttribute("win", new T.Float32BufferAttribute(Wn, 1));
    g.computeBoundingSphere(); return g;
  };
  // затенение у основания стен — в шейдере по высоте (стены уже в мировых координатах): нижние 2,6 м темнеют к земле
  const houseMat = new T.MeshStandardMaterial({ map: winTex, emissive: 0xffe2b0, emissiveMap: emTex, emissiveIntensity: .12, vertexColors: true, roughness: .9, metalness: 0, side: DS });
  houseMat.onBeforeCompile = sh => {
    sh.vertexShader = "attribute vec2 aoBase;\nattribute float win;\nvarying float vWY;\nvarying float vTop;\nvarying float vWin;\nvarying float vFac;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vWY = position.y - aoBase.x; vTop = position.y - aoBase.y; vWin = min(win, 1.0); vFac = max(win - 1.0, 0.0);");
    // плитка атласа: по u — обычный повтор, по v — fract внутри своей строки (canvas сверху вниз, текстура перевёрнута)
    const atlas = m => `vec4 ${m} = texture2D(${m === "sampledDiffuseColor" ? "map" : "emissiveMap"}, vec2(vUv.x, (fract(vUv.y) + 3.0 - floor(vFac + .5)) * .25));`;
    sh.fragmentShader = "varying float vWY;\nvarying float vTop;\nvarying float vWin;\nvarying float vFac;\n" + sh.fragmentShader
      // куски шейдера в onBeforeCompile ещё не развёрнуты — подставляем их сами с правками
      .replace("#include <map_fragment>", T.ShaderChunk.map_fragment
        .replace("vec4 sampledDiffuseColor = texture2D( map, vUv );", atlas("sampledDiffuseColor"))
        .replace("diffuseColor *= sampledDiffuseColor;", "diffuseColor *= mix(vec4(1.0), sampledDiffuseColor, vWin * (1.0 - step(-.02, vTop)));"))
      .replace("#include <emissivemap_fragment>", T.ShaderChunk.emissivemap_fragment
        .replace("vec4 emissiveColor = texture2D( emissiveMap, vUv );", atlas("emissiveColor"))
        .replace("totalEmissiveRadiance *= emissiveColor.rgb;", "totalEmissiveRadiance *= emissiveColor.rgb * vWin * (1.0 - step(-.02, vTop));"))
      .replace("#include <color_fragment>", "#include <color_fragment>\n diffuseColor.rgb *= mix(.5, 1.0, smoothstep(0.0, 2.6, vWY)) * mix(1.0, 1.14, step(-.02, vTop));");
  };
  nightReg(houseMat, "emissiveIntensity", { sunset: .12, day: .03, night: 1.5 });
  lots.forEach(lot => {
    if (!lot.W.length && !lot.R.length) return;
    const g = lotGeo(lot), mesh = add(g, houseMat);
    mesh.userData.dyn = true; mesh.userData.lot = true;              // freeze не склеивает участки обратно
    CHUNKS.push({ obj: mesh, s: g.boundingSphere.clone(), far: 2.3 });  // дальность ≈ туман: 690/990/1330 м
  });

  // зелёные площадки «H» на крышах, куда можно садиться
  const pads = solids.filter(b => b.pad), pc = document.createElement("canvas"); pc.width = pc.height = 128;
  const pg = pc.getContext("2d");
  pg.strokeStyle = "#3ddc84"; pg.lineWidth = 12; pg.beginPath(); pg.arc(64, 64, 54, 0, Math.PI * 2); pg.stroke();
  pg.fillStyle = "rgba(61,220,132,.25)"; pg.fill();
  pg.fillStyle = "#ffffff"; pg.font = "bold 72px Arial, sans-serif"; pg.textAlign = "center"; pg.textBaseline = "middle"; pg.fillText("H", 64, 68);
  const padMat = new T.MeshBasicMaterial({ map: new T.CanvasTexture(pc), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  chunked(new T.PlaneGeometry(7, 7).rotateX(-Math.PI / 2), padMat, pads.map(b => M4(b.pad.x, b.h + .04, b.pad.z)));
  // деревья: из карты (отдельные и аллеи) + россыпь в лесополосах
  const trees = dm(OSM.t);
  OSM.a.filter(a => a[0] === "f").forEach(([, rs]) => {
    const rings = rs.map(dm), b = bboxOf(rings[0]), n = Math.min(120, Math.round((b.x1 - b.x0) * (b.z1 - b.z0) / 320));
    for (let i = 0; i < n; i++) { const x = b.x0 + rnd() * (b.x1 - b.x0), z = b.z0 + rnd() * (b.z1 - b.z0); if (inRings(x, z, rings)) trees.push([x, z]); }
  });
  // зелёный склон правого берега: деревья там, где круто и нет домов, улиц и воды
  {
    const near = new Set(), key = (x, z) => Math.floor(x / 6) + "," + Math.floor(z / 6);
    ROADS.forEach(r => { if (r.deck || r.west) return; for (let i = 1; i < r.pts.length; i++) { const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i], L = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t <= L; t += 3) { const x = ax + (bx - ax) * t / L, z = az + (bz - az) * t / L; for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) near.add(key(x + dx * (r.w / 2 + 2), z + dz * (r.w / 2 + 2))); } } });
    let n = 0;
    for (let k = 0; k < 9000 && n < 900; k++) {
      const x = STRIP.x0 + rnd() * (STRIP.x1 - STRIP.x0), z = -82 - rnd() * 920, h = terrainH(x, z); if (h < 3) continue;
      const [gx, gz] = terrainN(x, z); if (Math.hypot(gx, gz) < .07 || near.has(key(x, z)) || waterAt(x, z) || solids.some(b => x > b.x0 - 2 && x < b.x1 + 2 && z > b.z0 - 2 && z < b.z1 + 2)) continue;
      trees.push([x, z]); n++;
    }
  }
  const crowns = [], trunks = [], crownCol = [];
  // три вида: крона-шар, тополь (высокий узкий), куст без ствола; оттенок — от места, общий rnd() не трогаем
  const GREENS = [0x58803a, 0x4c7534, 0x6a8f3f, 0x7d8f3c, 0x3f6a34].map(h => new T.Color(h));
  const hash = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
  // деревья не растут на проезжей части и под настилом моста
  const asphalt = (x, z) => ROADS.some(q => q.c <= 3 && x > q.x0 - 9 && x < q.x1 + 9 && z > q.z0 - 9 && z < q.z1 + 9 && lineDist(x, z, q.pts, false) < q.w / 2 + 1.2);
  const underDeck = (x, z) => DECKS.some(d => { const ox = x - d.cx, oz = z - d.cz, s = ox * d.dx + oz * d.dz, l = ox * d.nx + oz * d.nz; return s > d.s0 - 6 && s < d.s1 + 6 && Math.abs(l - d.lc) < d.hw + 4; });
  for (let i = trees.length - 1; i >= 0; i--) if (asphalt(...trees[i]) || underDeck(...trees[i])) trees.splice(i, 1);
  trees.forEach(([x, z]) => {
    if (arenaRing && (inPoly(x, z, arenaRing) || lineDist(x, z, arenaRing, true) < 66)) return;   // и деревья там же
    const s = .75 + rnd() * .55;
    const g0 = terrainH(x, z), yaw = rnd() * 6, hv = hash(x, z), kind = hv < .2 ? 1 : hv < .34 ? 2 : 0;
    if (kind === 1) { crowns.push(M4(x, g0 + 2.6 + 4.6 * s, z, yaw, s * .55, s * 2.1, s * .55)); trunks.push(M4(x, g0 + 1.5, z)); crownCol.push(GREENS[4]); }
    else if (kind === 2) { crowns.push(M4(x, g0 + .9, z, yaw, s * .9, s * .5, s * .9)); crownCol.push(GREENS[(hv * 97 | 0) % 2 + 2]); }
    else { crowns.push(M4(x, g0 + 3 + 2.1 * s, z, yaw, s, s * 1.1, s)); trunks.push(M4(x, g0 + 1.5, z)); crownCol.push(GREENS[(hv * 131 | 0) % 4]); }
  });
  chunked(new T.IcosahedronGeometry(2.3, 0), mat(0xffffff, { flatShading: true, name: "crowns" }), crowns, .75, crownCol);
  chunked(new T.CylinderGeometry(.18, .26, 3, 4, 1, true), mat(0x6b5444), trunks, .45);   // стволы вдали не видны

  // въездной знак
  const s = new T.Mesh(new T.PlaneGeometry(18, 4.5), new T.MeshBasicMaterial({ map: textTex(["РОСТОВ-НА-ДОНУ", "Богатяновка"], 512, 128, "#1f4f7a", "#ffffff"), side: DS }));
  s.position.set(240, 9, -84); scene.add(s);
  const sp = new T.Mesh(new T.BoxGeometry(.4, 9, .4), mat(0x6b6f7c)); sp.position.set(240, 4.5, -84.2); scene.add(sp);
  DECKS.forEach(d => [[d.s0 - 8, Math.PI], [d.s1 + 8, 0]].forEach(([s, r]) => {        // синие указатели у въездов на мост
    const b = new T.Mesh(new T.PlaneGeometry(13, 3), new T.MeshBasicMaterial({ map: textTex([d.name.toUpperCase()], 512, 118, "#1f4f7a", "#ffffff"), side: DS }));
    b.position.set(d.cx + d.dx * s + d.nx * (d.lc + d.hw + 4), 6, d.cz + d.dz * s + d.nz * (d.lc + d.hw + 4)); b.rotation.y = Math.atan2(d.dx, d.dz) + r; scene.add(b);
  }));
  CITY = { fillGeo, stripGeo, flatMat, house, lotGeo, houseMat, RC, AREA, white, faceUp };   // для сцен, которые строятся позже (западная и следующие)
})();

