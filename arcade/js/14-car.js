// «Восьмёрка Баклажан» — машины игрока: «восьмёрка» и внедорожник.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- машина игрока ---------- */
/* ВАЗ-2108 по референсам: длина 4.0 м, ширина 1.64, высота 1.4, база 2.46, колея 1.4 */
const paintIdx = () => save.paint ?? 4;            // по умолчанию — красная
const PAINTS = [
  { n: "белая", c: 0xe6dfcb }, { n: "мокрый асфальт", c: 0x46524d }, { n: "серебро", c: 0xa9a99d },
  { n: "вишня", c: 0x7a1c28 }, { n: "красная", c: 0x9c0c16 }
];
// гладкие нормали для непроиндексированной сетки: в каждой вершине — среднее нормалей соседних граней (по площади),
// но только тех, что повёрнуты не больше чем на crease° — рёбра (линия плеча, край капота) остаются чёткими
// автостекло без лишнего прохода отрисовки (настоящее преломление — transmission — на телефоне слишком дорогое):
// прозрачность по Френелю — в лоб стекло прозрачное и тонированное, под острым углом становится зеркалом неба;
// смешивание «отражение + ослабленный фон» (ONE, 1−α), чтобы отражение не тускнело от прозрачности; солнцезащитная
// полоса сверху лобового; чёрная керамическая кайма по краю с полутоновыми точками (если у сетки есть атрибут «ed» —
// расстояние до края); изнутри — слабые отражения и отсвет панели внизу лобового
function glassify(m, o = {}) {
  const U = m.userData.gl = { uT: { value: o.T ?? .62 }, uRefl: { value: o.refl ?? 1 }, uShade: { value: new T.Vector3(...(o.shade || [9, 9, 9])) },
    uIn: { value: 0 }, uGlare: { value: new T.Vector3(...(o.glare || [9, 9, 9])) }, uTint: { value: new T.Color(o.tint ?? 0x0a1a22) }, uPriv: { value: new T.Vector2(...(o.priv || [-9, 0])) } };
  m.transparent = true; m.depthWrite = false; m.opacity = 1; m.color.multiplyScalar(.2);   // рассеяния у стекла почти нет — цвет даёт тонировка
  m.blending = T.CustomBlending; m.blendSrc = T.OneFactor; m.blendDst = T.OneMinusSrcAlphaFactor; m.blendEquation = T.AddEquation;
  if (o.edge) m.defines = { ...(m.defines || {}), GLASS_EDGE: 1 };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vGl; varying vec2 vGu;\n#ifdef GLASS_EDGE\nattribute float ed; varying float vEd;\n#endif")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGl = position; vGu = uv / 3.0;\n#ifdef GLASS_EDGE\nvEd = ed / 500.0;\n#endif");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vGl; varying vec2 vGu; uniform float uT, uRefl, uIn; uniform vec3 uShade, uGlare, uTint; uniform vec2 uPriv;\n#ifdef GLASS_EDGE\nvarying float vEd;\n#endif")
      .replace("#include <output_fragment>", `
        float NdV = abs(dot(normal, normalize(vViewPosition)));
        float F = .04 + .96 * pow(1. - NdV, 5.);
        float T = (vGl.x > uPriv.x ? uT : uPriv.y) * (1. - F);         // задние стёкла — тёмная «приватная» тонировка
        vec3 col = outgoingLight * uRefl + uTint * (1. - T) * .1;
        float sh = smoothstep(uShade.x, uShade.y, vGl.y) * step(uShade.z, vGl.x);
        T *= 1. - .55 * sh; col += vec3(.0, .015, .03) * sh;
        col += vec3(.06, .055, .048) * uIn * smoothstep(uGlare.y, uGlare.x, vGl.y) * step(uGlare.z, vGl.x);
        #ifdef GLASS_EDGE
          float solid = 1. - smoothstep(.016, .02, vEd);
          float t = clamp((vEd - .02) / .035, 0., 1.), r = .5 * (1. - t);
          vec2 cell = fract(vGu * 110.) - .5; float dots = (1. - smoothstep(r - .08, r + .02, length(cell))) * step(vEd, .055);
          float frit = max(solid, dots) * max(step(.25, vGl.x), step(vGl.x, -1.5));   // кайма — только у вклеенных лобового и заднего
          col = mix(col, col * .35 + vec3(.006), frit); T *= 1. - frit;
        #endif
        gl_FragColor = vec4(col, 1. - T);`);
  };
  return m;
}
function smoothNormals(geo, crease = 30) {
  const P = geo.attributes.position.array, n = P.length / 9, F = new Float32Array(n * 3), map = new Map(), cs = Math.cos(crease * DEG);
  const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), keys = [];
  for (let t = 0; t < n; t++) {
    a.fromArray(P, t * 9); b.fromArray(P, t * 9 + 3).sub(a); c.fromArray(P, t * 9 + 6).sub(a); b.cross(c);   // длина — удвоенная площадь
    F[t * 3] = b.x; F[t * 3 + 1] = b.y; F[t * 3 + 2] = b.z;
    for (let k = 0; k < 3; k++) { const i = t * 9 + k * 3, key = Math.round(P[i] * 1e4) + "," + Math.round(P[i + 1] * 1e4) + "," + Math.round(P[i + 2] * 1e4); let l = map.get(key); if (!l) map.set(key, l = []); l.push(t); keys.push(key); }
  }
  const N = new Float32Array(P.length), u = new T.Vector3(), w = new T.Vector3();
  for (let v = 0; v < n * 3; v++) {
    const t = v / 3 | 0; u.fromArray(F, t * 3); const ul = u.length() || 1; w.set(0, 0, 0);
    for (const f of map.get(keys[v])) { c.fromArray(F, f * 3); const cl = c.length() || 1; if (c.dot(u) / (cl * ul) >= cs) w.add(c); }
    if (w.lengthSq() < 1e-20) w.copy(u); w.normalize(); N[v * 3] = w.x; N[v * 3 + 1] = w.y; N[v * 3 + 2] = w.z;
  }
  geo.setAttribute("normal", new T.BufferAttribute(N, 3)); return geo;
}
// колесо одним материалом, но резина и металл раздельно: по яркости цвета вершин (тёмное — шина: без металла, матовая;
// светлое — колпак, диск, спицы: металл с бликом и отражением неба). Вызовов отрисовки не прибавляет
function rubberMetal(m, lo, hi, metal = .85) {
  m.metalness = 0; m.roughness = 1; m.userData.carShiny = true; m.userData.envI = .9;
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <roughnessmap_fragment>", `float rmW = smoothstep(${lo.toFixed(3)}, ${hi.toFixed(3)}, dot(vColor.rgb, vec3(.299, .587, .114)));\nfloat roughnessFactor = mix(.9, .3, rmW);`)
      .replace("#include <metalnessmap_fragment>", `float metalnessFactor = mix(0., ${metal.toFixed(2)}, rmW);`);
  };
  m.customProgramCacheKey = () => "rubberMetal" + lo + "/" + hi + "/" + metal;
  return m;
}
function makeVaz2108() {
  // Размеры сняты с заводского чертежа ВАЗ-2108 (мм → м). Система: x вперёд, земля на y = −0.65.
  // Длина 4006, база 2460 (перед 785, зад 761), высота 1402, ширина 1650, колея 1400/1370, клиренс 160.
  const g = new T.Group();
  // глубокий лак: цветной слой полуматовый (цвет не выцветает), сверху — гладкий прозрачный (clearcoat): узкий яркий блик солнца
  // и отражение неба по френелю — сильное только на скользящих углах. Нормали сглажены (см. smoothNormals) — блик бежит по
  // изгибу кузова, а не заливает целую грань
  const paint = new T.MeshPhysicalMaterial({ color: PAINTS[0].c, roughness: .42, metalness: .02, clearcoat: 1, clearcoatRoughness: .07, side: T.DoubleSide });
  paint.userData.carShiny = true; paint.userData.envI = .65;
  const black = mat(0x15171d, { roughness: .7, side: T.DoubleSide });
  // стекло: прозрачное тонированное, с отражением неба; внутри виден салон
  const glassM = new T.MeshPhysicalMaterial({ color: 0x14262e, roughness: .03, metalness: 0, transparent: true, opacity: .55, depthWrite: false, side: T.DoubleSide });   // тонировка темнее — как на фото: стекло тёмное, в нём небо
  glassM.userData.carShiny = true; glassM.userData.envI = 1.3; glassify(glassM, { T: .6, tint: 0x0c1c24, shade: [.52, .62, .25] });
  const H = mm => mm / 1000 - .65, X = mm => 2.003 - mm / 1000;          // высота и «от переднего бампера» по чертежу
  const tab = (t, x) => {
    if (x <= t[0][0]) return t[0][1];
    for (let i = 1; i < t.length; i++) if (x <= t[i][0]) { const [x0, y0] = t[i - 1], [x1, y1] = t[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
    return t[t.length - 1][1];
  };
  const XF = X(785), XR = X(3245), RF = .372, RR = .352, YW = H(288);
  // верх нижней части: перед → капот → линия окон 955 мм → задняя панель
  const yTop = x => tab([[X(4006), H(570)], [X(3963), H(585)], [X(3942), H(832)], [X(3884), H(945)], [X(2954), H(955)], [X(1120), H(985)],
    [X(951), H(952)], [X(737), H(922)], [X(451), H(877)], [X(215), H(825)], [X(150), H(810)], [X(86), H(720)], [X(43), H(622)], [X(0), H(592)]], x);
  // низ: свесы — по бамперам, между колёс — пороги (клиренс ~180)
  const yBot = x => {
    let y = tab([[X(4006), H(300)], [X(3640), H(300)], [X(3560), H(180)], [X(560), H(180)], [X(480), H(337)], [X(0), H(337)]], x);
    // арки трапециевидные, как на чертеже: плоский верх ±0,55 r, скошенные стороны до уровня оси
    for (const [c, r] of [[XF, RF], [XR, RR]]) {
      const d = Math.abs(x - c), top = YW + r * 1.02, a = r * .55, b = r * 1.12;
      if (d < b) y = Math.max(y, d < a ? top : top - (d - a) / (b - a) * (top - YW - .02));
    }
    return y;
  };
  // полуширина по плечу: 825, к носу и корме — скосы углов
  const halfW = x => tab([[X(4006), .77], [X(3940), .81], [X(3800), .825], [X(250), .825], [X(110), .79], [X(0), .70]], x);
  // крыша по чертежу: лобовое под 30°, крыша 1395–1402, плавный перелом, стекло двери багажника
  const yRoof = x => tab([[X(3884), H(945)], [X(3085), H(1385)], [X(2980), H(1398)], [X(2400), H(1402)], [X(1900), H(1398)], [X(1840), H(1390)], [X(1120), H(985)]], x);
  // поперечное сечение «теплицы» с вида сзади: 1650 на плече → 1524 на линии окон → 956 по крыше
  const gw = t => tab([[0, .762], [.25, .716], [.5, .667], [.75, .604], [.94, .565], [1, .478]], t);
  // низ лобового по чертежу (вид спереди) ~1290 мм — у основания стекла «теплица» уже, чем на линии окон
  const taper = x => tab([[X(3884), .95], [X(3500), .985], [X(2900), 1], [X(1700), 1], [X(1120), .87]], x);
  const ghB = x => yTop(x) - .02;
  // сечение «теплицы» — по абсолютной высоте от линии окон до полной крыши 1402 и срезано по стеклу (лобовое, стекло двери):
  // иначе всё сужение сжималось в низкое сечение у лобового — стекло выходило узким, а по бокам — широкие «щёки»
  const yFull = H(1402);
  const tAbs = (x, y) => { const yb = ghB(x); return Math.max(0, Math.min(1, (y - yb) / (yFull - yb))); };
  const gp = (x, t) => { const yb = ghB(x), yr = Math.max(yRoof(x), yb + .01), tt = Math.min(t, (yr - yb) / (yFull - yb)); return [taper(x) * gw(tt), yb + (yFull - yb) * tt]; };
  const sideZ = (x, y) => taper(x) * gw(tAbs(x, y));

  function loft(xs, section, m) {
    const rings = xs.map(x => {
      const half = section(x), ring = half.map(([z, y]) => [x, y, z]);
      for (let i = half.length - 2; i >= 1; i--) ring.push([x, half[i][1], -half[i][0]]);
      return ring;
    });
    const pos = [], tri = (a, b, c) => pos.push(...a, ...b, ...c);
    for (let k = 0; k < rings.length - 1; k++) {
      const A = rings[k], B = rings[k + 1], n = A.length;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(A[i], B[i], B[j]); tri(A[i], B[j], A[j]); }
    }
    [rings[0], rings[rings.length - 1]].forEach(R => {
      const c = R.reduce((a, p) => [a[0] + p[0] / R.length, a[1] + p[1] / R.length, a[2] + p[2] / R.length], [0, 0, 0]);
      for (let i = 0; i < R.length; i++) tri(c, R[i], R[(i + 1) % R.length]);
    });
    const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); smoothNormals(geo, 32);
    const mesh = new T.Mesh(geo, m); g.add(mesh); return mesh;
  }
  const span = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
  // нижняя часть кузова
  loft(span(X(4006), X(0), 110), x => {
    const yb = yBot(x), yt = Math.max(yTop(x), yb + .02), w = halfW(x);
    const ySh = Math.min(Math.max(H(760), yb + .06), yt - .02);
    return [[0, yb], [w - .04, yb], [w, yb + .05], [w, ySh], [Math.min(w - .04, taper(x) * .762 + .01), yt], [0, yt]];
  }, paint);
  // стекло
  loft(span(X(3884), X(1120), 60), x => {
    const yb = ghB(x), yr = Math.max(yRoof(x), yb + .01);
    return [[0, yb], ...[0, .25, .5, .75, .94, 1].map(t => gp(x, t)), [0, yr]];
  }, glassM);
  // крыша в цвет кузова: от верхней кромки боковых окон (1282 мм)
  loft(span(X(3060), X(1860), 14), x => {
    const yr = yRoof(x), t0 = Math.min(.95, tAbs(x, H(1282))), q = ([z, y], dy = 0) => [z * 1.012, y + dy];
    return [[0, yr - .03], q(gp(x, t0)), q(gp(x, .94)), q(gp(x, 1), .006), [0, yr + .006]];
  }, paint);
  // «шкура» на изогнутом борту стекла: стойки и рамки
  function skin(poly, m, sd, off = .014) {
    const pos = [], N = 8;
    for (let k = 1; k < poly.length - 1; k++) {
      const C = [poly[0], poly[k], poly[k + 1]];
      const pt = (i, j) => { const a = i / N, b = j / N, c = 1 - a - b; const x = C[0][0] * c + C[1][0] * a + C[2][0] * b, y = C[0][1] * c + C[1][1] * a + C[2][1] * b; return [x, y, sd * (sideZ(x, y) + off)]; };
      for (let i = 0; i < N; i++) for (let j = 0; j < N - i; j++) {
        pos.push(...pt(i, j), ...pt(i + 1, j), ...pt(i, j + 1));
        if (j < N - i - 1) pos.push(...pt(i + 1, j), ...pt(i + 1, j + 1), ...pt(i, j + 1));
      }
    }
    const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); smoothNormals(geo, 32);
    g.add(new T.Mesh(geo, m));
  }
  const yWin = H(1282), yBelt = H(955);
  const wsY = x => H(985) + (X(1120) - x) * .57;                                   // лобовое
  [-1, 1].forEach(sd => {
    skin([[X(1120), H(985)], [X(1840), H(1390)], [X(1880), yWin + .04], [X(1250), yBelt]], paint, sd);  // стойка A
    skin([[X(2454), yBelt], [X(2604), yBelt], [X(2620), yWin], [X(2470), yWin]], black, sd);              // стойка B, 150 мм
    // стойка C по чертежу: заднее боковое стекло доходит внизу до ~3490 мм, вверху — до ~3075 мм (скруглённый угол)
    skin([[X(3490), yBelt], [X(3150), H(1250)], [X(3075), yWin], [X(3085), H(1385)], [X(3884), H(945)]], paint, sd); // стойка C
    skin([[X(1250), yBelt - .01], [X(3490), yBelt - .01], [X(3490), yBelt + .025], [X(1250), yBelt + .025]], black, sd, .016); // уплотнитель
    skin([[X(1880), yWin], [X(3075), yWin], [X(3075), yWin + .03], [X(1880), yWin + .03]], black, sd, .016);   // рамка сверху
  });
  const box = (w, h, d, m, x, y, z, ry = 0, rz = 0) => { const b = new T.Mesh(new T.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.set(0, ry, rz); g.add(b); return b; };
  // фары по чертежу: голубоватое стекло днём, ночью горят
  // стекло фары — рифлёное (призмы-полоски), за ним светлый отражатель: маленькая текстура вместо плоского белого
  const lensT = (() => { const c = document.createElement("canvas"); c.width = 64; c.height = 32; const q = c.getContext("2d");
    q.fillStyle = "#cfd8df"; q.fillRect(0, 0, 64, 32);
    for (let x = 0; x < 64; x += 4) { q.fillStyle = "rgba(255,255,255,.55)"; q.fillRect(x, 0, 1, 32); q.fillStyle = "rgba(60,70,80,.25)"; q.fillRect(x + 2, 0, 1, 32); }
    for (let y = 0; y < 32; y += 8) { q.fillStyle = "rgba(60,70,80,.18)"; q.fillRect(0, y, 64, 1); }
    q.strokeStyle = "rgba(255,255,255,.5)"; q.lineWidth = 2; q.strokeRect(1, 1, 62, 30);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t; })();
  const headM = nightReg(new T.MeshStandardMaterial({ color: 0xffffff, map: lensT, emissive: 0xfff1c8, emissiveIntensity: .25, roughness: .1, metalness: .2 }), "emissiveIntensity", { sunset: .35, day: .2, night: 1.3 });
  const amberM = new T.MeshStandardMaterial({ color: 0xff9a2a, emissive: 0xff8a1a, emissiveIntensity: .5 });
  const redM = new T.MeshStandardMaterial({ color: 0x6a0206, emissive: 0x9a0008, emissiveIntensity: .55, roughness: .3 });   // насыщенный красный, не розовый
  // стекло задних фонарей: цвет и (для стоп-сигнала) свечение только красных секций
  const tailTex = (mask) => { const c = document.createElement("canvas"); c.width = 512; c.height = 160; const q = c.getContext("2d");
    q.fillStyle = mask ? "#000" : "#2a2c30"; q.fillRect(0, 0, 512, 160);
    // как на настоящей «восьмёрке» (фото сзади): у номера — красная секция, в середине красная сверху и белый задний ход снизу,
    // снаружи — оранжевый поворотник во всю высоту
    const sec = [[8, 196, 14, 146, "#a00810", "#ff2a2a", 1], [202, 346, 14, 84, "#a00810", "#ff2a2a", 1], [202, 346, 88, 146, "#c9ced2", "#ffffff", 0], [352, 504, 14, 146, "#d8650c", "#ff9a30", 0]];
    sec.forEach(([a, b, y0, y1, c0, c1, red]) => {
      if (mask) { q.fillStyle = red ? "#fff" : "#000"; q.fillRect(a, y0, b - a, y1 - y0); return; }
      const gr = q.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, c1); gr.addColorStop(.5, c0); gr.addColorStop(1, red ? "#4a0408" : c0); q.fillStyle = gr; q.fillRect(a, y0, b - a, y1 - y0);
      q.fillStyle = "rgba(255,255,255,.14)"; for (let y = y0 + 6; y < y1; y += 12) q.fillRect(a + 2, y, b - a - 4, 3);   // рёбра-призмы рассеивателя
      for (let x = a + 9; x < b - 4; x += 18) { q.fillStyle = "rgba(0,0,0,.16)"; q.fillRect(x, y0, 2, y1 - y0); }
      const hl = q.createLinearGradient(0, y0, 0, y0 + 30); hl.addColorStop(0, "rgba(255,255,255,.4)"); hl.addColorStop(1, "rgba(255,255,255,0)"); q.fillStyle = hl; q.fillRect(a, y0, b - a, 30);   // блик по верху стекла
    });
    if (!mask) { q.fillStyle = "#151515"; [199, 349].forEach(x => q.fillRect(x - 3, 10, 6, 140)); q.fillRect(202, 84, 144, 4); q.strokeStyle = "#1a1a1a"; q.lineWidth = 6; q.strokeRect(3, 10, 506, 140); }   // тёмные перегородки и рамка
    const t = new T.CanvasTexture(c); t.encoding = mask ? T.LinearEncoding : T.sRGBEncoding; t.anisotropy = 4; return t; };
  const tailM = new T.MeshStandardMaterial({ map: tailTex(false), emissive: 0xff1a12, emissiveMap: tailTex(true), emissiveIntensity: .55, roughness: .12, metalness: .1 });
  tailM.userData.carShiny = true; tailM.userData.envI = .8;
  const plateM = mat(0xf2f2f2);
  // перед: наклонная панель фар и решётки (наклон ~30° от вертикали)
  const nose = Math.atan2(X(43) - X(150), H(810) - H(622));
  const nx = (X(43) + X(150)) / 2 + .012, ny = (H(622) + H(810)) / 2;
  [-1, 1].forEach(sd => {
    box(.03, .17, .4, headM, nx, ny, sd * .43, 0, nose);
    box(.03, .17, .07, amberM, nx - .002, ny, sd * .665, 0, nose);              // оранжевая секция у внешнего края фары
    box(.03, .17, .14, amberM, nx - .1, ny, sd * .745, -sd * .7, nose);        // поворотник на скосе угла
  });
  box(.03, .17, .4, black, nx + .004, ny, 0, 0, nose);
  [-.04, .03].forEach(dy => box(.034, .022, .4, paint, nx + .006 - dy * Math.tan(nose), ny + dy, 0, 0, nose));
  box(.02, .05, .05, mat(0x8fb0ff, { metalness: .8, roughness: .2 }), nx + .02, ny, 0, 0, nose);
  // бамперы 255 мм высотой, с заходом на крылья
  const bumpY = (H(337) + H(592)) / 2, bumpH = H(592) - H(337);
  // бамперы — пластик: основной брус, выступающий верхний профиль с резиновой вставкой, загибы на крылья, катафоты сзади
  const plast = mat(0x26282b, { roughness: .82, side: T.DoubleSide }), rubber = black;   // резина — тем же чёрным: меньше материалов — меньше вызовов отрисовки
  // в плане — «П» со скруглёнными углами (заходит на крылья), по высоте два яруса: нижний брус и выступающий верхний профиль
  // с резиновой вставкой; рёбра скруглены фаской — по ним бежит блик
  const ubar = (x0, dir, y0, hgt, W, wrap, thick, r, m, bev = .012) => {
    const xb = x0, pts = [], arc = (cx, cz, rr, a0, a1, out) => { for (let i = 0; i <= 6; i++) { const a = a0 + (a1 - a0) * i / 6; out.push([cx + Math.cos(a) * rr * dir, cz + Math.sin(a) * rr]); } };
    const contour = (w, xo, rr) => { const o = [[xo - dir * (wrap - (W - w)), -w]]; arc(xo - dir * rr, -w + rr, rr, -Math.PI / 2, 0, o); arc(xo - dir * rr, w - rr, rr, 0, Math.PI / 2, o); o.push([xo - dir * (wrap - (W - w)), w]); return o; };
    const outer = contour(W, xb, r), inner = contour(W - thick, xb - dir * thick, Math.max(.02, r - thick)).reverse();
    const sh = new T.Shape(outer.concat(inner).map(([x, z]) => new T.Vector2(x, -z)));
    const geo = new T.ExtrudeGeometry(sh, { depth: hgt - 2 * bev, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 1 }).rotateX(-Math.PI / 2).translate(0, y0 + bev, 0);
    const mesh = new T.Mesh(smoothNormals(geo.index ? geo.toNonIndexed() : geo, 50), m); g.add(mesh); return mesh;
  };
  const bumper = (x0, dir, y0, y1) => {                // dir: +1 — передний (наружу +x), −1 — задний
    const h = y1 - y0, yP = y0 + h * .6;
    ubar(x0 + dir * .06, dir, y0, h * .62, .8, .4, .11, .2, plast);                   // нижний брус
    ubar(x0 + dir * .09, dir, yP, h * .4, .815, .42, .13, .22, plast, .018);          // верхний профиль — выступает, кромка круглая
    ubar(x0 + dir * .112, dir, yP + h * .17, .036, .822, .4, .02, .22, rubber, 0);    // резиновая вставка по профилю
    ubar(x0 + dir * .066, dir, y0 + h * .56, .02, .806, .38, .03, .2, rubber, 0);     // тень-канавка между ярусами
    if (dir < 0) [-1, 1].forEach(sd => box(.012, .045, .14, redM, x0 - .074, y0 + h * .34, sd * .58));   // катафоты
  };
  bumper(X(0) - .045, 1, H(337), H(592));
  box(.02, .11, .52, plateM, X(0) + .022 + .02, bumpY, 0);
  bumper(X(4006) + .045, -1, H(300), H(585));
  [-1, 1].forEach(sd => {
    // задние фонари по чертежу: стекло-рассеиватель одной текстурой (у номера — жёлтый поворотник, белый задний ход, снаружи —
    // красный с рёбрами и хромовой рамкой), за стеклом — тёмный корпус; с заходом на бок
    box(.03, .18, .5, black, X(3952) - .004, H(715), sd * .555, 0, .08);
    { const q = new T.PlaneGeometry(.49, .17).rotateY(-Math.PI / 2), uv = q.attributes.uv; if (sd < 0) for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
      const m = new T.Mesh(q, tailM); m.position.set(X(3952) - .021, H(715), sd * .555); m.rotation.z = .08; g.add(m); }
    box(.1, .16, .03, amberM, X(3935), H(715), sd * .79, -sd * .5, .08);   // поворотник заходит на бок
    // двери, молдинг, ручка, зеркало
    [X(1180), X(2600)].forEach(x => box(.008, yBelt - .02 - yBot(X(2000)), .004, black, x, (yBelt - .02 + yBot(X(2000))) / 2, sd * .828));
    box(X(1130) - X(2915), .06, .012, black, (X(1130) + X(2915)) / 2, H(430), sd * .832);   // молдинг — только между арками, как на чертеже
    box(.13, .03, .015, black, X(2370), H(800), sd * .832);
    // зеркало по фото: чёрный треугольный «парус» в углу стекла и выступающий корпус, чуть отклонённый назад
    box(.13, .075, .022, black, X(1380), H(1005), sd * .838);
    box(.07, .095, .12, black, X(1380) - .045, H(1040), sd * .91, sd * -.12);
    box(.07, .035, .01, amberM, X(1066), H(700), sd * .829);                    // повторитель поворота на крыле, как на чертеже
    box(.06, .03, .1, black, X(1360), H(990), sd * .8);
    box(.02, .015, .46, black, X(1080), H(1000), sd * .1 - .22, .18);         // дворники
  });
  box(.02, .05, .05, mat(0x8fb0ff, { metalness: .8, roughness: .2 }), X(3952) - .012, H(815), 0, 0, .08);   // значок и замок над номером
  // салон — виден через прозрачные стёкла: передние кресла с подголовниками, задний диван, торпедо, руль (слева), рычаг КПП, полка багажника
  { const seatM = mat(0x2e2a28, { roughness: .95 }), darkM = plast;
    [-.37, .37].forEach(z => {
      box(.5, .12, .48, seatM, X(2180), H(470), z);
      box(.12, .6, .48, seatM, X(2440), H(790), z, 0, .22);
      box(.08, .18, .28, seatM, X(2530), H(1160), z, 0, .22);
    });
    box(.5, .13, 1.28, seatM, X(3020), H(470), 0); box(.12, .52, 1.28, seatM, X(3300), H(740), 0, 0, .25);
    box(.42, .2, 1.5, darkM, X(1460), H(905), 0); box(.3, .08, 1.48, darkM, X(1620), H(990), 0, 0, -.35);   // торпедо и козырёк приборов
    const wh = new T.Mesh(new T.TorusGeometry(.19, .022, 6, 20), darkM); wh.position.set(X(1850), H(950), -.37); wh.rotation.set(0, Math.PI / 2, 0); wh.rotateX(.55); g.add(wh);   // руль
    box(.04, .26, .04, darkM, X(1950), H(560), 0, 0, -.3);                      // рычаг КПП
    box(.5, .02, 1.36, darkM, X(3680), H(905), 0, 0, .05);                     // полка багажника
    box(X(1900) - X(3060), .015, 1.26, seatM, (X(1900) + X(3060)) / 2, H(1372), 0);   // обивка потолка — сквозь стёкла виден серый потолок, а не изнанка крыши
  }
  box(.03, .13, .54, black, X(3952) - .006, H(712), 0, 0, .08);                                              // ниша номера между фонарями
  box(.04, .045, 1.36, black, X(3884) - .03, H(948), 0);                                                     // уплотнитель под стеклом двери
  // стекло двери багажника: чёрная резиновая рамка по краям (как на настоящей — широкая), сверху — козырёк, на стекле — нити обогрева
  { const pos = [], quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    const edge = x => { const [zw, yr] = gp(x, 1); return [zw, yr]; };
    const xs = span(X(3884) + .01, X(3100), 18);
    for (let i = 0; i < xs.length - 1; i++) { const [za, ya] = edge(xs[i]), [zb, yb] = edge(xs[i + 1]);
      [-1, 1].forEach(sd => quad([xs[i], ya + .006, sd * (za - .065)], [xs[i + 1], yb + .006, sd * (zb - .065)], [xs[i + 1], yb - .004, sd * (zb + .016)], [xs[i], ya - .004, sd * (za + .016)])); }
    { const x0 = X(3115), x1 = X(3045), [z0, y0] = edge(x0), y1 = yRoof(x1); quad([x0, y0 + .007, -z0 - .01], [x0, y0 + .007, z0 + .01], [x1, y1 + .014, z0 + .01], [x1, y1 + .014, -z0 - .01]); }   // верхняя кромка — к крыше
    for (let k = 1; k <= 8; k++) { const x = X(3884) + .06 + (X(3150) - X(3884) - .1) * k / 9, [zw, yr] = edge(x), w = zw - .1;   // нити обогрева
      quad([x - .004, yr + .004, -w], [x - .004, yr + .004, w], [x + .004, yr + .004 + (yRoof(x + .004) - yRoof(x - .004)), w], [x + .004, yr + .004 + (yRoof(x + .004) - yRoof(x - .004)), -w]); }
    const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals(); g.add(new T.Mesh(geo, black)); }
  box(.34, .014, .02, black, X(3330), yRoof(X(3330)) + .014, .1, .5, .5);                                     // задний дворник — ось вверху по центру стекла, как на фото                                                // задний дворник — лежит на стекле (уклон ~29°)
  { const fc = new T.Mesh(new T.CylinderGeometry(.06, .06, .008, 14).rotateX(Math.PI / 2), paint); fc.position.set(X(3420), H(830), .829); g.add(fc);   // лючок бензобака справа
    const ex = new T.Mesh(new T.CylinderGeometry(.03, .032, .22, 10).rotateZ(Math.PI / 2), mat(0x3b3d42, { roughness: .5, metalness: .6 })); ex.position.set(X(4006) + .02, H(240), .42); g.add(ex); }   // выхлоп справа под бампером
  // номерные знаки: вымышленный номер, буквы — только те, что бывают на номерах
  const pc = document.createElement("canvas"); pc.width = 512; pc.height = 112;
  const pg = pc.getContext("2d");
  pg.fillStyle = "#f4f4f0"; pg.fillRect(0, 0, 512, 112); pg.strokeStyle = "#111"; pg.lineWidth = 6; pg.strokeRect(4, 4, 504, 104);
  pg.beginPath(); pg.moveTo(390, 6); pg.lineTo(390, 106); pg.stroke();
  pg.fillStyle = "#111"; pg.textBaseline = "middle"; pg.textAlign = "center";
  pg.font = "bold 74px Arial, sans-serif"; pg.fillText("В 888 ВК", 197, 60);
  pg.font = "bold 50px Arial, sans-serif"; pg.fillText("161", 450, 46);
  pg.font = "bold 18px Arial, sans-serif"; pg.fillText("RUS", 450, 90);
  const plateTex = new T.CanvasTexture(pc); plateTex.encoding = T.sRGBEncoding; plateTex.anisotropy = 4;
  const plateFace = new T.MeshBasicMaterial({ map: plateTex });
  [[X(0) + .034, bumpY, Math.PI / 2, 0], [X(3952) - .028, H(712), -Math.PI / 2, 0]].forEach(([x, y, ry, rz]) => {
    const m = new T.Mesh(new T.PlaneGeometry(.5, .11), plateFace); m.position.set(x, y, 0); m.rotation.set(0, ry, rz, "YXZ"); g.add(m);
  });
  // обвес по выбору (не склеивается со статикой — его включают и выключают): брызговики, ветровики
  const opt = { flaps: new T.Group(), visors: new T.Group() };
  Object.values(opt).forEach(o => { o.userData.dyn = true; g.add(o); });
  // колёса 13": шина Ø576, колея 1400 / 1370. Отдельные узлы: передние поворачиваются, все крутятся.
  // Каждое колесо целиком — одна сетка с цветами по вершинам (один вызов отрисовки); диски — штампованные, литые, PRO
  const wheelM = rubberMetal(new T.MeshStandardMaterial({ vertexColors: true }), .1, .3, .45);   // колпак — светлый, металла меньше
  const part = (geo, hex) => { const q = geo.index ? geo.toNonIndexed() : geo, c = new T.Color(hex), a = new Float32Array(q.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } q.setAttribute("color", new T.BufferAttribute(a, 3)); q.deleteAttribute("uv"); return q; };
  const cylG = (r, w, n, dz = 0) => new T.CylinderGeometry(r, r, w, n).rotateX(Math.PI / 2).translate(0, 0, dz);
  const wheelMesh = parts => new T.Mesh(mergeGeos(parts.map(([geo, hex]) => part(geo, hex))), wheelM);
  const wheels = [];
  [[XF, .7], [XF, -.7], [XR, .685], [XR, -.685]].forEach(([x, z]) => {
    const sd = Math.sign(z), steer = new T.Group(), spin = new T.Group(), w = { steer, spin, front: x > 0 };
    steer.position.set(x, YW, z); steer.userData.dyn = true; steer.add(spin); g.add(steer);
    const tire = [[cylG(.288, .165, 20), 0x08090a], [cylG(.055, .185, 8), 0x2a2d36]];
    // штампованный стальной диск 13" по фото: серебристый, обод меньше шины (видна высокая боковина 175/70), выпуклое кольцо,
    // шесть отверстий, центр с четырьмя болтами (видно, что крутится)
    const face = sd * .0885, hole = a => new T.CylinderGeometry(.021, .021, .006, 8).rotateX(Math.PI / 2).translate(Math.cos(a) * .132, Math.sin(a) * .132, face);
    w.stock = wheelMesh([...tire, [cylG(.178, .168, 24), 0xa9aeb4], [cylG(.166, .176, 24), 0xd5d9de], [cylG(.108, .18, 20), 0xc3c8ce],
      ...[0, 1, 2, 3, 4, 5].map(k => [hole(k / 6 * Math.PI * 2 + .26), 0x17181b]), [cylG(.05, .186, 12), 0xb4b9bf],
      ...[0, 1, 2, 3].map(k => [new T.BoxGeometry(.018, .018, .02).translate(Math.cos(k * Math.PI / 2 + .78) * .072, Math.sin(k * Math.PI / 2 + .78) * .072, sd * .095), 0x3a3d43])]);
    w.alloy = wheelMesh([...tire, [cylG(.19, .172, 20), 0x3b3f48],
      ...[0, 1, 2, 3, 4].map(k => [new T.BoxGeometry(.045, .3, .02).rotateZ(k / 5 * Math.PI * 2).translate(0, 0, sd * .09), 0xd8dbe2])]);   // пять спиц
    spin.add(w.stock, w.alloy);
    wheels.push(w);
    const f = new T.Mesh(new T.BoxGeometry(.012, .2, .2), black); f.position.set(x - (x > 0 ? RF : RR) * 1.08, YW - .07, z * 1.02); opt.flaps.add(f);
  });
  const visorM = new T.MeshStandardMaterial({ color: 0x0e1218, roughness: .2, metalness: .3, transparent: true, opacity: .78, side: T.DoubleSide });
  [-1, 1].forEach(sd => {
    const xm = (X(1880) + X(2454)) / 2, v = new T.Mesh(new T.BoxGeometry(X(1880) - X(2454) + .06, .075, .008), visorM);
    v.position.set(xm, yWin - .005, sd * (sideZ(xm, yWin) + .035)); v.rotation.x = -sd * .45; opt.visors.add(v);
  });
  // PRO: широкий обвес в цвет кузова, широкие колёса с хромовыми дисками и фиолетовой серединой, спойлер, неон снизу
  const pro = opt.pro = new T.Group(); pro.userData.dyn = true; g.add(pro);
  [[XF, .74, RF], [XF, -.74, RF], [XR, .725, RR], [XR, -.725, RR]].forEach(([x, z, r], i) => {
    const w = wheels[i], dz = z - Math.sign(z) * (i < 2 ? .7 : .685);           // широкие колёса стоят чуть шире
    w.pro = wheelMesh([[cylG(.3, .25, 22, dz), 0x08090a], [cylG(.205, .258, 22, dz), 0xd8dce4], [cylG(.12, .262, 6, dz), 0xf0a0ff]]); w.spin.add(w.pro);
    const fl = new T.Mesh(new T.CylinderGeometry(r * 1.16, r * 1.16, .16, 14, 1, true, Math.PI / 2, Math.PI), paint);   // расширитель арки
    fl.rotation.x = Math.PI / 2; fl.position.set(x, YW, Math.sign(z) * .86); pro.add(fl);
  });
  // дрифт-трек 888: широкая резина и дрифтовые диски — полированная глубокая полка, бронзовые спицы, фиолетовый колпачок
  wheels.forEach((w, i) => {
    const sd = i % 2 ? -1 : 1, dz = sd * .035, face = sd * .142 + dz;
    w.drift = wheelMesh([[cylG(.302, .27, 22, dz), 0x0a0a0b], [cylG(.222, .276, 22, dz), 0xdfe2e8], [cylG(.205, .28, 20, dz), 0x26282e],
      ...[0, 1, 2, 3, 4, 5].map(k => [new T.BoxGeometry(.05, .37, .02).rotateZ(k / 6 * Math.PI).translate(0, 0, face), 0xb8893e]),
      [cylG(.055, .29, 8, dz), 0x9b4dff]]);
    w.drift.visible = false; w.spin.add(w.drift);
  });
  // гоночный номер «888» на базовой машине: крупно на крыше и на обеих дверях — одна сетка, одна текстура.
  // Награда за дрифт-трек 888 — «золотой» номер (та же сетка, другая текстура)
  {
    const num = gold => { const c = document.createElement("canvas"); c.width = c.height = 256; const q = c.getContext("2d");
      q.fillStyle = gold ? "#ffc93c" : "#111"; q.beginPath(); q.arc(128, 128, 126, 0, 7); q.fill();
      q.fillStyle = gold ? "#2c0a44" : "#f6f6f2"; q.beginPath(); q.arc(128, 128, 112, 0, 7); q.fill();
      q.font = "900 104px Golos Text, Arial Black, Arial, sans-serif"; q.textAlign = "center"; q.textBaseline = "middle";
      if (gold) { q.lineWidth = 10; q.strokeStyle = "#ff3b6b"; q.strokeText("888", 128, 136, 200); }
      q.fillStyle = gold ? "#ffc93c" : "#111"; q.fillText("888", 128, 136, 200);
      const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t; };
    const tex = [num(false), num(true)], numM = new T.MeshLambertMaterial({ map: tex[0], alphaTest: .5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const xr = (X(1950) + X(2950)) / 2, roofG = new T.PlaneGeometry(.86, .86).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2).translate(xr, H(1402) + .006, 0);   // читается с камеры сзади
    const doorG = sd => { const gg = new T.PlaneGeometry(.44, .44); if (sd < 0) gg.rotateY(Math.PI); return gg.translate(X(1800), H(690), sd * .842); };
    const badge = new T.Mesh(mergeGeos([roofG, doorG(1), doorG(-1)].map(q => q.toNonIndexed())), numM);
    badge.userData.dyn = true; badge.userData.tex = tex; opt.badge = badge; g.add(badge);
  }
  [-1, 1].forEach(sd => { const sk = new T.Mesh(new T.BoxGeometry(XF - XR - (RF + RR) * 1.15, .14, .1), paint); sk.position.set((XF + XR) / 2 + (RR - RF) * .5, H(215), sd * .86); pro.add(sk); });
  // спойлер на кромке крыши: крыло в цвет кузова с приподнятой задней кромкой и чёрными торцевыми пластинами
  const sp = new T.Mesh(new T.BoxGeometry(.3, .028, 1.16), paint); sp.position.set(X(3120), H(1430), 0); sp.rotation.z = -.14; pro.add(sp);
  const lip = new T.Mesh(new T.BoxGeometry(.03, .05, 1.16), black); lip.position.set(X(3120) - .15, H(1430) + .035, 0); pro.add(lip);
  [-1, 1].forEach(sd => { const st = new T.Mesh(new T.BoxGeometry(.36, .1, .022), black); st.position.set(X(3120), H(1410), sd * .59); pro.add(st); });
  const gc = document.createElement("canvas"); gc.width = gc.height = 64; const gg = gc.getContext("2d"), rg = gg.createRadialGradient(32, 32, 4, 32, 32, 32);
  rg.addColorStop(0, "rgba(176,64,255,.85)"); rg.addColorStop(.6, "rgba(150,40,240,.45)"); rg.addColorStop(1, "rgba(150,40,240,0)"); gg.fillStyle = rg; gg.fillRect(0, 0, 64, 64);
  const glow = new T.Mesh(new T.PlaneGeometry(4.4, 2.4).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: new T.CanvasTexture(gc), transparent: true, depthWrite: false, toneMapped: false }));
  glow.position.y = -.62; pro.add(glow);
  g.userData.plateFace = plateFace;
  g.userData.opt = opt; g.userData.wheels = wheels; g.userData.redM = tailM; g.userData.headM = headM; g.userData.amberM = amberM;
  // сопла снизу — это всё-таки испытательная «восьмёрка»
  const glowM = new T.MeshBasicMaterial({ color: 0x9fe3ff });
  [[1.5, .42], [1.5, -.42], [-1.5, .42], [-1.5, -.42]].forEach(([x, z]) => { const n = new T.Mesh(new T.CylinderGeometry(.11, .11, .05, 10), glowM); n.position.set(x, H(150), z); g.add(n); });
  box(3.3, .05, 1.3, mat(0x22252e), 0, H(200), 0);   // днище — выше низа порогов, сбоку не видно
  // тёмные фартуки под бамперами: на чертеже спереди и сзади под бампером не кузов, а тень днища
  box(.03, H(345) - H(185), 1.3, black, X(470), (H(345) + H(185)) / 2, 0);
  box(.03, H(310) - H(185), 1.3, black, X(3600), (H(310) + H(185)) / 2, 0);
  freeze(g, true);
  g.userData.paint = paint;
  return g;
}
const carObj = makeVaz2108(); scene.add(carObj);
// данные: arcade/data/suv.js (tools/build-suv.py)
// данные: arcade/data/wheel.js (tools/blender/wheel.py → tools/build-wheel.py)
const VAZ_PARTS = [...carObj.children];            // всё, что относится к «восьмёрке» (прячется, когда выбран внедорожник)
const SUV = SUV_DATA ? (() => {
  const raw = Uint8Array.from(atob(SUV_DATA), c => c.charCodeAt(0)), dv = new DataView(raw.buffer), hl = dv.getUint32(0, true);
  const H = JSON.parse(new TextDecoder().decode(raw.subarray(4, 4 + hl))), base = (4 + hl + 3) & ~3;
  // группа → [{ mat, pos (Float32), nor (Float32), idx }]
  const parts = {};
  for (const [g, recs] of Object.entries(H.groups)) parts[g] = recs.map(r => {
    const q = new Int16Array(raw.buffer, base + r.o[0], r.n * 3), qn = new Int8Array(raw.buffer, base + r.o[1], r.n * 3), qi = new (r.big ? Uint32Array : Uint16Array)(raw.buffer, base + r.o[2], r.i);
    const pos = new Float32Array(r.n * 3), nor = new Float32Array(r.n * 3), ed = r.ed ? Float32Array.from(new Uint8Array(raw.buffer, base + r.o[3], r.n)) : null;
    for (let k = 0; k < r.n * 3; k++) { const a = k % 3; pos[k] = r.mn[a] + (q[k] + 32768) / 65535 * r.sc[a]; nor[k] = qn[k] / 127; }
    return { mat: H.mats[r.m], pos, nor, ed, idx: Uint32Array.from(qi) };
  });
  // материалы → «вёдра»: похожие склеиваются в одну сетку с цветом по вершинам (меньше вызовов отрисовки)
  const C = { paint_obsidian_black: [.012, .014, .02], glass_tinted: [.06, .11, .15], light_lens: [.9, .92, .94], rear_lens: [.18, .002, .006], optic_led: [.92, .93, .95], rear_led_rings: [.7, .002, .008],
    interior: [.35, .36, .37], leather_ivory: [.62, .5, .33], cabin_charcoal: [.012, .014, .018], trim_black: [.018, .022, .026], rubber: [.012, .014, .016], trim_metal: [.03, .035, .045],
    optic_reflector: [.42, .47, .5], optic_projector: [.07, .18, .25], rear_projector: [.13, .003, .008],
    driver_charcoal: [.012, .014, .018], driver_soft_black: [.025, .028, .032], driver_premium_ivory: [.66, .52, .34], driver_ivory: [.62, .49, .32], driver_walnut: [.13, .035, .012], driver_chrome: [.42, .46, .5], driver_screen: [.006, .025, .032], driver_gauge: [.02, .04, .045] };
  const BUCKET = { paint_obsidian_black: "paint", glass_tinted: "glass", light_lens: "lens", rear_lens: "rlens", optic_led: "head", rear_led_rings: "tail", driver_screen: "screen", driver_gauge: "screen",
    trim_metal: "metal", optic_reflector: "metal", optic_projector: "metal", rear_projector: "metal", driver_chrome: "metal", driver_walnut: "metal",
    leather_ivory: "ivory", driver_premium_ivory: "ivory", driver_ivory: "ivory" };   // остальное — «matte»
  // кожа «слоновая кость»: зерно наппы, перфорация, двойная строчка — рисуется кодом (карта и рельеф), UV — проекцией по нормали
  const leather = (() => { const cv = document.createElement("canvas"), bm = document.createElement("canvas"); cv.width = cv.height = bm.width = bm.height = 256;
    const g = cv.getContext("2d"), b = bm.getContext("2d"); g.fillStyle = "#e9d7b0"; g.fillRect(0, 0, 256, 256); b.fillStyle = "#808080"; b.fillRect(0, 0, 256, 256);
    let sd = 27; const r = () => (sd = sd * 16807 % 2147483647) / 2147483647;
    for (let i = 0; i < 2600; i++) { const x = r() * 256, y = r() * 256, rr = .5 + r() * 1.6, a = r() * 3.14; g.strokeStyle = `rgba(110,80,44,${.06 + r() * .1})`; g.lineWidth = .5; g.beginPath(); g.ellipse(x, y, rr, rr * .6, a, 0, 7); g.stroke(); b.strokeStyle = r() < .5 ? "#9a9a9a" : "#666"; b.lineWidth = .7; b.beginPath(); b.ellipse(x, y, rr, rr * .6, a, 0, 7); b.stroke(); }
    for (let y = 40; y < 216; y += 9) for (let x = 40 + (y / 9 % 2) * 4.5; x < 216; x += 9) { g.fillStyle = "rgba(70,50,28,.55)"; g.beginPath(); g.arc(x, y, 1.3, 0, 7); g.fill(); b.fillStyle = "#2a2a2a"; b.beginPath(); b.arc(x, y, 1.4, 0, 7); b.fill(); }   // перфорация в центре
    [[30, 0], [226, 0]].forEach(([x]) => { g.setLineDash([4, 3]); g.strokeStyle = "rgba(95,66,36,.5)"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); g.setLineDash([]); b.fillStyle = "#555"; b.fillRect(x - 1, 0, 2, 256); });   // строчка
    const t = new T.CanvasTexture(cv), tb = new T.CanvasTexture(bm); [t, tb].forEach(x => { x.wrapS = x.wrapT = T.RepeatWrapping; x.anisotropy = 4; }); t.encoding = T.sRGBEncoding; return { t, tb }; })();
  const M = {
    paint: new T.MeshPhysicalMaterial({ color: new T.Color(...C.paint_obsidian_black), metalness: .35, roughness: .32, clearcoat: 1, clearcoatRoughness: .05, side: T.DoubleSide }),
    glass: new T.MeshPhysicalMaterial({ color: new T.Color(...C.glass_tinted), roughness: .03, metalness: 0, transparent: true, opacity: .5, depthWrite: false, side: T.DoubleSide }),
    lens: new T.MeshPhysicalMaterial({ color: new T.Color(...C.light_lens), roughness: .08, transparent: true, opacity: .14, depthWrite: false, side: T.DoubleSide }),
    rlens: new T.MeshPhysicalMaterial({ color: new T.Color(...C.rear_lens), roughness: .12, transparent: true, opacity: .45, depthWrite: false, side: T.DoubleSide }),
    head: new T.MeshStandardMaterial({ color: new T.Color(...C.optic_led), emissive: 0xfff4e8, emissiveIntensity: .35, roughness: .2 }),
    tail: new T.MeshStandardMaterial({ color: new T.Color(...C.rear_led_rings), emissive: 0xff0310, emissiveIntensity: .55, roughness: .24 }),
    screen: new T.MeshStandardMaterial({ vertexColors: true, emissive: 0x2a9bd0, emissiveIntensity: .8, roughness: .25 }),
    metal: new T.MeshStandardMaterial({ vertexColors: true, metalness: .85, roughness: .22 }),
    matte: new T.MeshStandardMaterial({ vertexColors: true, metalness: .05, roughness: .75, side: T.DoubleSide }),
    ivory: new T.MeshStandardMaterial({ vertexColors: true, map: leather.t, bumpMap: leather.tb, bumpScale: .005, roughness: .75, metalness: 0, side: T.DoubleSide }),
  };
  [M.paint, M.glass, M.lens, M.rlens, M.metal].forEach(m => { m.userData.carShiny = true; m.userData.envI = m === M.paint ? 1.1 : m === M.glass ? 1.05 : .8; });
  // колёса — свой материал: шина резиновая (матовая, без металла), диск — графит с полировкой (раньше всё колесо было чёрным металлом)
  M.wheel = rubberMetal(new T.MeshStandardMaterial({ vertexColors: true }), .03, .09);
  const graphiteRims = g => { const c = g.attributes.color.array, r = C.rubber;
    for (let i = 0; i < c.length; i += 3) if (Math.abs(c[i] - r[0]) + Math.abs(c[i + 1] - r[1]) + Math.abs(c[i + 2] - r[2]) > 1e-4) { c[i] = c[i + 1] = .16; c[i + 2] = .17; } };
  glassify(M.glass, { T: .62, tint: 0x0b1c26, edge: true, shade: [.76, .86, .25], glare: [.58, .44, .3], priv: [-.35, .26] });
  nightReg(M.head, "emissiveIntensity", { sunset: .5, day: .3, night: 1.6 });
  function mesh(list) {                                // склейка частей одного ведра: позиции, нормали, цвет, UV (для кожи), индексы
    let n = 0, ni = 0; list.forEach(p => { n += p.pos.length / 3; ni += p.idx.length; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint32Array(ni); let o = 0, oi = 0;
    for (const p of list) {
      const c = C[p.mat] || [.5, .5, .5], k = p.pos.length / 3; pos.set(p.pos, o * 3); nor.set(p.nor, o * 3);
      for (let i = 0; i < k; i++) { col.set(c, (o + i) * 3); const x = p.pos[i * 3], y = p.pos[i * 3 + 1], z = p.pos[i * 3 + 2], ax = Math.abs(p.nor[i * 3]), ay = Math.abs(p.nor[i * 3 + 1]), az = Math.abs(p.nor[i * 3 + 2]);
        const u = ax > ay && ax > az ? [z, y] : ay > az ? [x, z] : [x, y]; uv[(o + i) * 2] = u[0] * 3; uv[(o + i) * 2 + 1] = u[1] * 3; }   // кожа: тайл ~33 см
      for (let i = 0; i < p.idx.length; i++) idx[oi + i] = p.idx[i] + o; o += k; oi += p.idx.length;
    }
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.BufferAttribute(pos, 3)); g.setAttribute("normal", new T.BufferAttribute(nor, 3)); g.setAttribute("color", new T.BufferAttribute(col, 3)); g.setAttribute("uv", new T.BufferAttribute(uv, 2)); g.setIndex(new T.BufferAttribute(idx, 1));
    if (list.every(p => p.ed)) { const e = new Float32Array(n); let q = 0; list.forEach(p => { e.set(p.ed, q); q += p.ed.length; }); g.setAttribute("ed", new T.BufferAttribute(e, 1)); }
    g.computeBoundingSphere(); return g;
  }
  function build(g, single) {                          // группа → сетки по вёдрам (single — колесо одной сеткой)
    const by = {}; (parts[g] || []).forEach(p => (by[single ? "matte" : BUCKET[p.mat] || "matte"] ||= []).push(p));
    return Object.entries(by).map(([b, l]) => { const m = new T.Mesh(mesh(l), b === "matte" && single ? M.metal : M[b]); m.renderOrder = b === "glass" || b === "lens" || b === "rlens" ? 2 : 0; return m; });
  }
  {   // дворники на стоянке у основания лобового стекла (видны и снаружи, и из салона)
    [[.18, .56, .03], [-.4, .52, -.03]].forEach(([z, L, a]) => { const b = new T.BoxGeometry(.016, .012, L); b.rotateY(a); b.translate(.958, .452, z);
      parts.body.push({ mat: "rubber", pos: b.attributes.position.array, nor: b.attributes.normal.array, ed: null, idx: Uint32Array.from(b.index.array) }); });
  }
  {   // моторный отсек пустой — сквозь решётку виднелась панель салона: закрываем тёмной коробкой (в общее «ведро» — без лишних вызовов)
    const b = new T.BoxGeometry(.7, .74, 1.1); b.translate(1.58, -.1, 0);
    parts.body.push({ mat: "rubber", pos: b.attributes.position.array, nor: b.attributes.normal.array, ed: null, idx: Uint32Array.from(b.index.array) });
  }
  {   // подкрылки: у исходной модели арки пустые — сквозь них просвечивал фон (светлые «разрывы»). Тёмная полукруглая стенка
      // над колесом (радиус 0,44 — с запасом на ход подвески) и щиток с внутренней стороны; в то же «ведро», без новых вызовов
    ["wheel_front_left", "wheel_front_right", "wheel_rear_left", "wheel_rear_right"].forEach(n => {
      const [x, y, z] = H.pivots[n], s = Math.sign(z), z0 = s * .6, z1 = s * .88, w = Math.abs(z1 - z0);
      const arch = new T.CylinderGeometry(.44, .44, w, 14, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(x, y, (z0 + z1) / 2);
      const wall = new T.CircleGeometry(.44, 14, 0, Math.PI).translate(x, y, z0);
      [arch, wall].forEach(g => parts.body.push({ mat: "rubber", pos: g.attributes.position.array, nor: g.attributes.normal.array, ed: null, idx: Uint32Array.from(g.index.array) }));
    });
  }
  const root = new T.Group(); root.name = "внедорожник"; root.userData.dyn = true; root.visible = false;
  const body = new T.Group(); build("body").forEach(m => body.add(m)); root.add(body);
  const dash = new T.Group(); build("dash").forEach(m => dash.add(m)); root.add(dash);   // панель кузова — видна снаружи сквозь стёкла
  const sp = H.pivots.steer, eye = new T.Vector3(sp[0] - .65, sp[1] + .27, sp[2]);   // глаз водителя — позади руля и выше
  const wheels = ["wheel_front_left", "wheel_front_right", "wheel_rear_left", "wheel_rear_right"].map(n => {
    const st = new T.Group(), spin = new T.Group(); st.position.set(...H.pivots[n]); st.add(spin); build(n, true).forEach(m => { m.material = M.wheel; graphiteRims(m.geometry); spin.add(m); }); root.add(st);
    return { steer: st, spin, front: n.includes("front"), y0: st.position.y };
  });
  M.metal.vertexColors = true; M.metal.roughness = .4;   // колёса: резина, диск, тормоз — цвет по вершинам
  [[2.262, Math.PI / 2], [-2.19, -Math.PI / 2]].forEach(([x, ry]) => {   // номера — те же, что у «восьмёрки» (вымышленные)
    const m = new T.Mesh(new T.PlaneGeometry(.5, .11), carObj.userData.plateFace); m.position.set(x, -.15, 0); m.rotation.y = ry; root.add(m); });
  carObj.add(root);
  const outside = [...body.children.filter(m => [M.head, M.tail, M.lens, M.rlens].includes(m.material)), ...root.children.filter(m => m.isMesh)];
  // ---- салон (только вид из кабины) — весь кодом: панель с орехом и хромом, приборы со стрелками, экран с картой, руль,
  // кожаные стойки, потолок с козырьками и зеркалом, двери, консоль, контурная подсветка (цвет — в меню), пыль в лучах
  const cab = new T.Group(); cab.visible = false; root.add(cab);
  const cvs = (w, h, f) => { const c = document.createElement("canvas"); c.width = w; c.height = h; f(c.getContext("2d"), w, h); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t; };
  let sd2 = 91; const rnd = () => (sd2 = sd2 * 16807 % 2147483647) / 2147483647;
  const woodT = cvs(512, 64, (g, w, h) => { g.fillStyle = "#3b1b0c"; g.fillRect(0, 0, w, h);   // орех: волокна вдоль и «свиль»
    for (let i = 0; i < 70; i++) { const y = rnd() * h, a = .05 + rnd() * .16; g.strokeStyle = rnd() < .5 ? `rgba(120,62,26,${a})` : `rgba(20,8,3,${a})`; g.lineWidth = .6 + rnd() * 2.2; g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * .013 + i) * 3 + Math.sin(x * .05 + i * 3) * 1.2); g.stroke(); } });
  const clothT = cvs(128, 128, (g, w, h) => { g.fillStyle = "#e3d6bf"; g.fillRect(0, 0, w, h);   // потолок: мелкий ворс алькантары
    for (let i = 0; i < 2600; i++) { g.fillStyle = rnd() < .5 ? "rgba(255,250,240,.16)" : "rgba(120,100,70,.12)"; g.fillRect(rnd() * w, rnd() * h, 1, 1); } });
  clothT.wrapS = clothT.wrapT = T.RepeatWrapping; clothT.repeat.set(5, 5);
  const nappaT = cvs(256, 256, (g, w, h) => { g.fillStyle = "#ecdfc6"; g.fillRect(0, 0, w, h);   // гладкая кожа панели и дверей — только зерно
    for (let i = 0; i < 3000; i++) { const x = rnd() * w, y = rnd() * h, r = .4 + rnd() * 1.1; g.strokeStyle = `rgba(120,92,60,${.04 + rnd() * .06})`; g.lineWidth = .5; g.beginPath(); g.ellipse(x, y, r, r * .6, rnd() * 3, 0, 7); g.stroke(); } });
  nappaT.wrapS = nappaT.wrapT = T.RepeatWrapping; nappaT.repeat.set(6, 6);
  const CM = {
    black: new T.MeshStandardMaterial({ color: 0x1a1b1f, roughness: .6, bumpMap: leather.tb, bumpScale: .0015 }),
    piano: new T.MeshStandardMaterial({ color: 0x050607, roughness: .2, metalness: .2 }),
    ivory: new T.MeshStandardMaterial({ color: 0xf2e6d2, map: nappaT, roughness: .66 }),
    cloth: new T.MeshStandardMaterial({ color: 0xffffff, map: clothT, roughness: .95, side: T.DoubleSide }),
    wood: new T.MeshStandardMaterial({ map: woodT, roughness: .22, metalness: .05 }),
    chrome: new T.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 1, roughness: .16 }),
    led: new T.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }),
  };
  [CM.piano, CM.wood, CM.chrome].forEach(m => { m.userData.carShiny = true; m.userData.envI = m === CM.chrome ? 1.2 : m === CM.piano ? .35 : .6; });
  const add = (geo, mat, x, y, z, par = cab) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); par.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, par) => add(new T.BoxGeometry(w, h, d), mat, x, y, z, par);
  const ext = (pts, depth, mat, z0, bevel = .008) => {                   // профиль (x, y) вытянут поперёк машины
    const sh = new T.Shape(); pts.forEach((p, i) => p.length === 4 ? sh.quadraticCurveTo(...p) : i ? sh.lineTo(...p) : sh.moveTo(...p));
    const g = new T.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 }); g.translate(0, 0, z0); return add(g, mat, 0, 0, 0); };
  const bar = (a, b, r1, r2, mat, par = cab) => {                         // овальная стойка от точки a к точке b
    const A = new T.Vector3(...a), B = new T.Vector3(...b), d = B.clone().sub(A), m = add(new T.CylinderGeometry(1, 1, d.length(), 12), mat, 0, 0, 0, par);
    m.position.copy(A).add(B).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); m.scale.set(r1, 1, r2); return m; };
  // панель: верх — тёмная кожа со скруглённым краем, полоса ореха с хромом, низ — светлая кожа; ширина — между дверями
  const W = 1.5, Z0 = -W / 2;
  ext([[.99, .432], [.68, .452], [.55, .456, .532, .41], [.548, .392], [.99, .392]], W, CM.black, Z0);
  ext([[.548, .39], [.556, .352], [.99, .352], [.99, .39]], W, CM.wood, Z0, .003);
  ext([[.556, .352], [.566, .25], [.99, .25], [.99, .352]], W, CM.ivory, Z0);
  ext([[.566, .25], [.59, .15, .68, .12], [.99, .1], [.99, .25]], W, CM.black, Z0);
  box(.006, .005, W, CM.chrome, .556, .353, 0); box(.004, .004, W - .02, CM.led, .546, .392, 0);
  // приборы: козырёк над экраном и сам экран (две стрелки: скорость и обороты, посередине — цифры и передача)
  const clus = new T.Group(); clus.position.set(.556, .452, sp[2]); clus.rotation.z = -.2; cab.add(clus);
  // приборы и центральный экран — одна текстура на двоих (один вызов отрисовки): приборы сверху, экран снизу
  const aC = document.createElement("canvas"); aC.width = 512; aC.height = 512; const aX = aC.getContext("2d"), aT = new T.CanvasTexture(aC); aT.encoding = T.sRGBEncoding;
  const scrM = new T.MeshBasicMaterial({ map: aT, toneMapped: false, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
  const atlasPlane = (w, h, x0, y0, cw, ch) => { const g = new T.PlaneGeometry(w, h).rotateY(-Math.PI / 2), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * cw) / 512, 1 - (y0 + (1 - uv.getY(i)) * ch) / 512); return g; };
  const gC = document.createElement("canvas"); gC.width = 512; gC.height = 176; const gX = gC.getContext("2d");
  add(atlasPlane(.34, .117, 0, 0, 512, 176), scrM, 0, 0, 0, clus);
  box(.03, .13, .37, CM.piano, .016, -.004, 0, clus);
  ext([[.548, .548], [.575, .568, .68, .562], [.74, .53], [.6, .526]], .42, CM.black, sp[2] - .21, .01);
  // центральный экран: карта (с мини-карты игры), курс, подсветка
  const sC = document.createElement("canvas"); sC.width = 384; sC.height = 216; const sX = sC.getContext("2d");
  const scr = new T.Group(); scr.position.set(.512, .315, .02); scr.rotation.z = -.3; cab.add(scr);
  add(atlasPlane(.3, .169, 0, 184, 384, 216), scrM, 0, 0, 0, scr);
  box(.02, .185, .32, CM.piano, .011, 0, 0, scr);
  // нижний сенсорный экран климата и два хромированных регулятора по бокам (двухэкранная консоль)
  const clim = new T.Group(); clim.position.set(.558, .166, .02); clim.rotation.z = -.5; cab.add(clim);
  add(atlasPlane(.27, .076, 0, 404, 384, 108), scrM, 0, 0, 0, clim); box(.018, .1, .38, CM.piano, .01, 0, 0, clim);
  [-1, 1].forEach(k => { add(new T.CylinderGeometry(.024, .026, .03, 28).rotateZ(Math.PI / 2), CM.chrome, -.012, 0, k * .165, clim); add(new T.CylinderGeometry(.017, .017, .032, 20).rotateZ(Math.PI / 2), CM.piano, -.014, 0, k * .165, clim); });
  // дефлекторы: центральные — над экраном, боковые — у дверей; хромированные рамки, тёмные ламели
  const vent = (x, y, z, w, h, rz, vert) => { const v = new T.Group(); v.position.set(x, y, z); v.rotation.z = rz; cab.add(v);
    box(.01, h, w, CM.chrome, 0, 0, 0, v); box(.012, h - .008, w - .008, CM.piano, -.002, 0, 0, v);
    if (vert) for (let i = -2; i <= 2; i++) box(.004, h - .012, .003, CM.chrome, -.008, 0, i * w / 6, v); else for (let i = -1; i <= 1; i++) box(.004, .0025, w - .014, CM.chrome, -.008, i * h / 4, 0, v); };
  vent(.534, .417, -.075, .13, .03, -.1, true); vent(.534, .417, .115, .13, .03, -.1, true);
  vent(.565, .372, -.665, .1, .055, -.08, false); vent(.565, .372, .665, .1, .055, -.08, false);
  // верх панели: щель обдува стекла и решётка центрального динамика
  box(.03, .004, 1.25, CM.piano, .935, .439, 0); box(.1, .004, .17, CM.piano, .8, .447, 0);
  // за зеркалом — блок датчиков на стекле
  box(.022, .045, .075, CM.black, .282, .862, 0);
  const hC = document.createElement("canvas"); hC.width = 160; hC.height = 112; const hX = hC.getContext("2d"), hT = new T.CanvasTexture(hC); hT.encoding = T.sRGBEncoding;
  { const h = add(new T.PlaneGeometry(.2, .14).rotateY(-Math.PI / 2), new T.MeshBasicMaterial({ map: hT, transparent: true, depthWrite: false, toneMapped: false }), .62, .585, sp[2] + .03); h.rotation.z = .25; h.renderOrder = 3; h.userData.dyn = true; }   // проекция на стекло — над капотом
  // руль — по фото руля этой марки (поколение со светлой кожей): большая подушка светлой кожи, шире кверху, с хромированной
  // планкой (без надписи); по бокам — вытянутые глянцевые сенсорные блоки со значками и круглым переключателем наверху;
  // спицы светлой кожи; внизу — спица с хромированной рамкой-прорезью; обод светлый перфорированный. Руль меньше прежнего
  const podT = cvs(256, 256, (g, w, h) => { g.fillStyle = "#030405"; g.fillRect(0, 0, w, h); g.strokeStyle = g.fillStyle = "rgba(235,240,245,.85)"; g.lineWidth = 5; g.lineCap = "round"; g.lineJoin = "round";
    g.font = "bold 22px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    // левый блок: колесо «меню» (рисует кольцо — само колесо в хроме), стрелки, «ромб», трубка, голос
    g.font = "bold 15px sans-serif"; g.fillText("МЕНЮ", 64, 64); g.font = "bold 22px sans-serif"; [[24, 64], [104, 64]].forEach(([x, y], i) => { g.beginPath(); g.moveTo(x + (i ? -6 : 6), y - 9); g.lineTo(x + (i ? 4 : -4), y); g.lineTo(x + (i ? -6 : 6), y + 9); g.stroke(); });
    g.beginPath(); g.moveTo(64, 120); g.lineTo(76, 134); g.lineTo(64, 148); g.lineTo(52, 134); g.closePath(); g.stroke();
    g.beginPath(); g.arc(44, 196, 13, Math.PI * .25, Math.PI * 1.1); g.stroke(); g.fillRect(28, 192, 8, 6);
    g.beginPath(); g.roundRect ? g.roundRect(80, 180, 12, 22, 6) : g.rect(80, 180, 12, 22); g.stroke(); g.beginPath(); g.arc(86, 196, 11, 0, Math.PI); g.stroke();
    // правый блок: SET / RES, «−» «+», отмена, ограничитель
    g.font = "bold 15px sans-serif"; g.fillText("SET+", 192, 56); g.fillText("RES", 192, 74); g.font = "bold 30px sans-serif"; g.fillText("−", 160, 130); g.fillText("+", 224, 130); g.font = "bold 20px sans-serif";
    g.fillText("CANCEL", 192, 176); g.beginPath(); g.arc(192, 214, 14, Math.PI * .8, Math.PI * 2.2); g.stroke(); g.fillText("LIM", 192, 242);
    g.fillStyle = "rgba(235,240,245,.2)"; g.fillRect(127, 0, 2, h); });
  const PADM = new T.MeshStandardMaterial({ map: podT, emissiveMap: podT, emissive: 0xffffff, emissiveIntensity: .32, roughness: .1, metalness: .2 }); PADM.userData.carShiny = true; PADM.userData.envI = .55;
  const steer = new T.Group(); steer.position.set(sp[0] + .01, sp[1] + .01, sp[2]); steer.rotation.z = -.36; cab.add(steer);
  const wheelS = new T.Group(); wheelS.userData.dyn = true; steer.add(wheelS);
  // сам руль — модель из Blender (tools/blender/wheel.py → tools/build-wheel.py): пропорции сняты с фото, фаски, строчка,
  // затенение в углах (AO) запечено в цвет вершин; материалы — кожа, перфорация, тёмная кромка обода, глянец, хром, сенсорные панели
  {
    const raw = Uint8Array.from(atob(WHEEL_DATA), c => c.charCodeAt(0)), hl = new DataView(raw.buffer).getUint32(0, true);
    const recs = JSON.parse(new TextDecoder().decode(raw.subarray(4, 4 + hl))), base = (4 + hl + 3) & ~3;
    const ao = m => { const c = m.clone(); c.vertexColors = true; return c; };
    const WM = { ivory: ao(CM.ivory), perf: ao(new T.MeshStandardMaterial({ color: 0xf6ead6, map: leather.t, bumpMap: leather.tb, bumpScale: .003, roughness: .7 })),
      edge: ao(new T.MeshStandardMaterial({ color: 0x55504a, roughness: .62 })), piano: ao(CM.piano), chrome: ao(CM.chrome), pad: PADM };
    [WM.piano, WM.chrome].forEach((m, i) => { m.userData.carShiny = true; m.userData.envI = i ? 1.2 : .35; });
    for (const r of recs) {
      const q = new Int16Array(raw.buffer, base + r.o[0], r.n * 3), qn = new Int8Array(raw.buffer, base + r.o[1], r.n * 3), qa = new Uint8Array(raw.buffer, base + r.o[2], r.n),
        qu = new Uint16Array(raw.buffer, base + r.o[3], r.n * 2), qi = new (r.big ? Uint32Array : Uint16Array)(raw.buffer, base + r.o[4], r.i);
      const pos = new Float32Array(r.n * 3), nor = new Float32Array(r.n * 3), col = new Float32Array(r.n * 3), uv = new Float32Array(r.n * 2);
      for (let k = 0; k < r.n * 3; k++) { const a = k % 3; pos[k] = r.mn[a] + (q[k] + 32768) / 65535 * r.sc[a]; nor[k] = qn[k] / 127; }
      for (let k = 0; k < r.n; k++) { const v = .35 + .65 * qa[k] / 255; col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = v; uv[k * 2] = qu[k * 2] / 65535; uv[k * 2 + 1] = qu[k * 2 + 1] / 65535; }
      if (r.m === "perf" || r.m === "ivory") for (let k = 0; k < r.n; k++) { uv[k * 2] = pos[k * 3 + 2] * 7; uv[k * 2 + 1] = (pos[k * 3 + 1] + pos[k * 3] * .5) * 7; }   // кожа: проекция на плоскость руля
      const g = new T.BufferGeometry(); g.setAttribute("position", new T.BufferAttribute(pos, 3)); g.setAttribute("normal", new T.BufferAttribute(nor, 3));
      g.setAttribute("color", new T.BufferAttribute(col, 3)); g.setAttribute("uv", new T.BufferAttribute(uv, 2)); g.setIndex(new T.BufferAttribute(Uint32Array.from(qi), 1));
      add(g, WM[r.m] || WM.piano, 0, 0, 0, wheelS);
    }
  }
  add(new T.CylinderGeometry(.042, .052, .2, 16).rotateZ(Math.PI / 2), CM.black, .12, 0, 0, steer);
  // стойки (кожа), потолок (ворс), козырьки, плафон и зеркало
  [-1, 1].forEach(k => bar([.95, .43, k * .73], [.31, .885, k * .65], .066, .042, CM.cloth));
  const roof = new T.PlaneGeometry(1.7, 1.4, 10, 6).rotateX(Math.PI / 2), rp = roof.attributes.position;
  for (let i = 0; i < rp.count; i++) { const z = rp.getZ(i) / .7; rp.setY(i, .025 * (1 - z * z) - .004 * rp.getX(i)); }
  roof.computeVertexNormals(); add(roof, CM.cloth, -.52, .884, 0);
  [-1, 1].forEach(k => box(.17, .018, .34, CM.cloth, .2, .866, k * .37));
  box(.16, .03, .28, CM.black, .17, .872, 0); bar([.28, .875, 0], [.265, .81, 0], .008, .008, CM.black);
  box(.024, .056, .2, CM.black, .262, .79, 0);
  // двери: подоконник, светлая вставка, орех, подсветка, подлокотник, ручка
  [-1, 1].forEach(k => { const z = k * .755;
    box(1.5, .045, .08, CM.black, .1, .432, z); box(1.42, .11, .03, CM.ivory, .1, .36, z + k * .01);
    box(1.42, .026, .032, CM.wood, .1, .292, z + k * .006); box(1.4, .004, .006, CM.led, .1, .277, z - k * .012);
    box(1.42, .22, .03, CM.black, .1, .16, z + k * .012); box(.52, .04, .1, CM.ivory, -.12, .245, z - k * .04); box(.09, .018, .02, CM.chrome, .36, .33, z - k * .008); });
  // консоль между сиденьями: глянец, хром, светлый подлокотник, селектор
  box(.76, .2, .24, CM.black, -.08, .14, 0); box(.36, .006, .2, CM.piano, .08, .243, 0); box(.76, .005, .245, CM.chrome, -.08, .242, 0); box(.2, .1, .24, CM.black, .4, .06, 0);   // консоль; спереди ниже — виден экран климата box(.42, .05, .23, CM.ivory, -.27, .27, 0);
  add(new T.CylinderGeometry(.03, .034, .045, 20), CM.chrome, .14, .265, 0); [-1, 1].forEach(k => box(.9, .004, .004, CM.led, .08, .236, k * .124));
  freeze(cab, true); freeze(wheelS, true);                               // салон — по сетке на материал: ~12 вызовов отрисовки
  // контурная подсветка: цвет — в меню; днём тусклее
  const AMB = [{ n: "слоновая кость", c: 0xffd9a0 }, { n: "лёд", c: 0x7fd8ff }, { n: "аметист", c: 0xb07cff }, { n: "изумруд", c: 0x4dffb0 }, { n: "выкл", c: 0 }];
  let ambI = 0;
  function amb(i) { if (i !== undefined) ambI = (i % AMB.length + AMB.length) % AMB.length; const a = AMB[ambI], k = TIME === "night" ? 1 : TIME === "sunset" ? .8 : .55;
    CM.led.color.setHex(a.c || 0x000000).multiplyScalar(k); CM.led.visible = !!a.c; return a.n; }
  // приборы и экраны: рисуем ~20 раз в секунду (экран — 5), только когда виден салон. Материал экранов — сложение света:
  // чёрное «не светится», под ним глянцевая рамка — поэтому на той же текстуре живёт и проекция на лобовое стекло
  const accent = () => AMB[ambI].c ? "#" + AMB[ambI].c.toString(16).padStart(6, "0") : "#d8c7a4";
  const F = (w, px) => `${w} ${px}px system-ui,-apple-system,Segoe UI,Roboto,sans-serif`;
  function dial(g, cx, cy, r, val, max, step, red, lab) {
    const a0 = Math.PI * .75, sw = Math.PI * 1.5, k = Math.min(1, Math.max(0, val / max)); g.lineCap = "round";
    const ring = g.createLinearGradient(cx, cy - r, cx, cy + r); ring.addColorStop(0, "#f2f5f7"); ring.addColorStop(.45, "#7d868d"); ring.addColorStop(.55, "#3a4046"); ring.addColorStop(1, "#c9d1d6");
    g.strokeStyle = ring; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, r + 1, 0, 7); g.stroke();   // хромированный ободок циферблата
    g.strokeStyle = "rgba(255,255,255,.07)"; g.lineWidth = 9; g.beginPath(); g.arc(cx, cy, r - 9, a0, a0 + sw); g.stroke();
    if (red) { g.strokeStyle = "rgba(255,60,50,.85)"; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, r - 9, a0 + sw * red, a0 + sw); g.stroke(); }
    const ac = accent(); g.save(); g.shadowColor = ac; g.shadowBlur = 10; g.strokeStyle = ac; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, r - 9, a0, a0 + sw * k); g.stroke(); g.restore();
    g.fillStyle = "#e9edf0"; g.font = F(600, 14); g.textAlign = "center"; g.textBaseline = "middle";
    for (let v = 0; v <= max + 1e-6; v += step) { const a = a0 + sw * v / max, big = lab(v) !== "";
      g.strokeStyle = big ? "#dfe6eb" : "rgba(200,210,218,.55)"; g.lineWidth = big ? 2.4 : 1.4; g.beginPath(); g.moveTo(cx + Math.cos(a) * (r - 16), cy + Math.sin(a) * (r - 16)); g.lineTo(cx + Math.cos(a) * (r - (big ? 26 : 22)), cy + Math.sin(a) * (r - (big ? 26 : 22))); g.stroke();
      if (big) g.fillText(lab(v), cx + Math.cos(a) * (r - 40), cy + Math.sin(a) * (r - 40)); }
    const a = a0 + sw * Math.min(1.02, val / max); g.save(); g.shadowColor = "#ff7a2a"; g.shadowBlur = 12; g.strokeStyle = "#ff8a3d"; g.lineWidth = 4;
    g.beginPath(); g.moveTo(cx - Math.cos(a) * 12, cy - Math.sin(a) * 12); g.lineTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14)); g.stroke(); g.restore();
    const hub = g.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, 11); hub.addColorStop(0, "#5d656c"); hub.addColorStop(1, "#14171b"); g.fillStyle = hub; g.beginPath(); g.arc(cx, cy, 10, 0, 7); g.fill();
  }
  const clock = () => { const base = TIME === "night" ? 23 * 60 + 20 : TIME === "day" ? 13 * 60 + 5 : 19 * 60 + 40, m = Math.floor(base + performance.now() / 6000) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
  const gauge = { t: 0, rpm: 800, s: 0, trip: 0 };
  function drawGauges(kmh, rpm, gear, air, alt) {
    const g = gX; g.clearRect(0, 0, 512, 176); g.fillStyle = "#000"; g.fillRect(0, 0, 512, 176);
    const bg = g.createRadialGradient(256, 40, 10, 256, 88, 300); bg.addColorStop(0, "rgba(40,60,75,.45)"); bg.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = bg; g.fillRect(0, 0, 512, 176);
    dial(g, 90, 92, 80, kmh, 260, 20, 0, v => v % 40 ? "" : v); dial(g, 422, 92, 80, rpm / 1000, 7, .5, 6 / 7, v => v % 1 ? "" : v);
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "#8f9aa3"; g.font = F(500, 12); g.fillText(clock(), 256, 16);
    if (air) { g.fillStyle = accent(); g.font = F(700, 13); g.fillText("ПОЛЁТ", 256, 40); g.fillStyle = "#f5f1e8"; g.font = F(700, 40); g.fillText(`${Math.round(alt)}`, 256, 76); g.fillStyle = "#9aa4ad"; g.font = F(500, 12); g.fillText("м над землёй", 256, 104); }
    else { g.fillStyle = "#f5f1e8"; g.font = F(700, 48); g.fillText(Math.round(kmh), 256, 70); g.fillStyle = "#9aa4ad"; g.font = F(500, 12); g.fillText("км/ч", 256, 100); }
    g.fillStyle = accent(); g.font = F(700, 18); g.fillText(gear, 256, 126);
    const gp = Math.max(0, Math.min(1, (typeof gas === "number" ? gas : 100) / 100));      // запас сопел
    g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(206, 146, 100, 5); g.fillStyle = gp > .25 ? accent() : "#ff5a4a"; g.fillRect(206, 146, 100 * gp, 5);
    g.fillStyle = "#8f9aa3"; g.font = F(500, 10); g.fillText(`СОПЛА  ·  ${gauge.trip.toFixed(1)} км`, 256, 162);
    if (sfx.broken() > 0) { g.fillStyle = "#ffb020"; g.font = F(700, 12); g.fillText("⚠ ДВИГАТЕЛЬ", 160, 160); }
    g.fillStyle = "#8f9aa3"; g.font = F(500, 10); g.fillText("км/ч", 90, 160); g.fillText("×1000 об/мин", 422, 160);
    aX.drawImage(gC, 0, 0); aT.needsUpdate = true;
  }
  const mini = document.getElementById("mini");
  function carIcon(g, cx, cy, ang, side) {                   // силуэт машины сзади (крен) или сбоку (тангаж)
    g.save(); g.translate(cx, cy); g.rotate(ang); g.fillStyle = "#e9e3d6"; g.strokeStyle = "#e9e3d6"; g.lineWidth = 2;
    if (side) { g.beginPath(); g.moveTo(-30, 6); g.lineTo(-30, -6); g.lineTo(-20, -8); g.lineTo(-12, -18); g.lineTo(16, -18); g.lineTo(24, -8); g.lineTo(31, -6); g.lineTo(31, 6); g.closePath(); g.fill();
      g.fillStyle = "#11161b"; [-18, 18].forEach(x => { g.beginPath(); g.arc(x, 7, 6.5, 0, 7); g.fill(); g.stroke(); }); }
    else { g.beginPath(); g.moveTo(-24, 6); g.lineTo(-24, -6); g.lineTo(-17, -20); g.lineTo(17, -20); g.lineTo(24, -6); g.lineTo(24, 6); g.closePath(); g.fill();
      g.fillStyle = "#11161b"; g.fillRect(-13, -17, 26, 8); [-17, 17].forEach(x => g.fillRect(x - 5, 5, 10, 9)); }
    g.restore();
  }
  const cC = document.createElement("canvas"); cC.width = 384; cC.height = 108; const cX = cC.getContext("2d");
  function drawClimate() {                                   // климат: температуры по зонам, вентилятор, подогрев сидений, AUTO
    const g = cX; g.fillStyle = "#000"; g.fillRect(0, 0, 384, 108); g.textBaseline = "middle"; const ac = accent();
    g.fillStyle = "#f3efe6"; g.font = F(600, 30); g.textAlign = "left"; g.fillText("21.5°", 50, 54); g.textAlign = "right"; g.fillText("22.0°", 334, 54);
    g.textAlign = "center"; g.fillStyle = ac; g.font = F(700, 14); g.fillText("AUTO", 192, 28);
    g.strokeStyle = "#c9d0d6"; g.lineWidth = 2; for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(192, 64, 4, 13, i * Math.PI / 3, 0, 7); g.stroke(); }
    for (let i = 0; i < 5; i++) { g.fillStyle = i < 3 ? ac : "rgba(255,255,255,.15)"; g.fillRect(160 + i * 14, 88, 10, 4); }
    [[120, 1], [264, 1]].forEach(([x]) => { g.strokeStyle = "#ff8a3d"; g.lineWidth = 2; for (let j = 0; j < 3; j++) { g.beginPath(); g.moveTo(x - 8 + j * 8, 80); g.quadraticCurveTo(x - 4 + j * 8, 72, x - 8 + j * 8, 64); g.stroke(); } });
    aX.drawImage(cC, 0, 404);
  }
  function drawScreen() {
    const g = sX; g.fillStyle = "#000"; g.fillRect(0, 0, 384, 216);
    const air = mode === "free" && free.air, roll = carObj.rotation.x, pitch = carObj.rotation.z;
    g.save(); g.beginPath(); g.roundRect ? g.roundRect(8, 8, 200, 200, 14) : g.rect(8, 8, 200, 200); g.clip();
    if (air) {                                                 // в полёте — авиагоризонт
      g.translate(108, 108); g.rotate(-roll); const off = Math.max(-90, Math.min(90, pitch * 180));
      g.fillStyle = "#2c6f9c"; g.fillRect(-200, -200 + off, 400, 200); g.fillStyle = "#6b4a2b"; g.fillRect(-200, off, 400, 200);
      g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.moveTo(-200, off); g.lineTo(200, off); g.stroke();
      g.font = F(500, 10); g.fillStyle = "#fff"; g.textAlign = "center";
      for (const d of [-20, -10, 10, 20]) { const y = off - d * 3; g.beginPath(); g.moveTo(-18, y); g.lineTo(18, y); g.stroke(); g.fillText(d, 30, y + 3); }
      g.setTransform(1, 0, 0, 1, 0, 0); g.strokeStyle = accent(); g.lineWidth = 4; g.beginPath(); g.moveTo(68, 108); g.lineTo(96, 108); g.lineTo(108, 118); g.lineTo(120, 108); g.lineTo(148, 108); g.stroke();
    } else if (mini) { g.drawImage(mini, 8, 8, 200, 200); g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(8, 8, 200, 200); g.drawImage(mini, 8, 8, 200, 200); }
    g.restore(); g.strokeStyle = "rgba(255,255,255,.12)"; g.lineWidth = 1; g.strokeRect(8.5, 8.5, 199, 199);
    const deg = ((90 - car.yaw / DEG) % 360 + 360) % 360, dirs = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"];
    g.textAlign = "left"; g.textBaseline = "alphabetic";
    if (air) {
      const alt = Math.max(0, car.y - (free.gh || 0)), vy = car.vy || 0;
      g.fillStyle = "#9aa4ad"; g.font = F(500, 12); g.fillText("ВЫСОТА", 222, 30); g.fillStyle = "#f3efe6"; g.font = F(700, 30); g.fillText(`${alt.toFixed(1)} м`, 222, 62);
      g.fillStyle = "#9aa4ad"; g.font = F(500, 12); g.fillText("ВЕРТИКАЛЬ", 222, 92); g.fillStyle = vy < -12 ? "#ff6a5a" : "#f3efe6"; g.font = F(700, 22); g.fillText(`${vy > 0 ? "↑" : "↓"} ${Math.abs(vy).toFixed(1)} м/с`, 222, 118);
      g.fillStyle = "#9aa4ad"; g.font = F(500, 12); g.fillText("КРЕН / ТАНГАЖ", 222, 148); g.fillStyle = "#f3efe6"; g.font = F(600, 18); g.fillText(`${Math.round(roll / DEG)}° / ${Math.round(pitch / DEG)}°`, 222, 172);
    } else {
      g.fillStyle = "#9aa4ad"; g.font = F(500, 12); g.fillText("КУРС", 222, 28); g.fillStyle = "#f3efe6"; g.font = F(700, 26); g.fillText(`${dirs[Math.round(deg / 45) % 8]} ${Math.round(deg)}°`, 222, 56);
      carIcon(g, 254, 104, -roll, false); carIcon(g, 334, 104, -pitch, true);   // кренометр, как на внедорожниках
      g.fillStyle = "#f3efe6"; g.font = F(600, 14); g.textAlign = "center"; g.fillText(`${Math.abs(Math.round(roll / DEG))}°`, 254, 140); g.fillText(`${Math.abs(Math.round(pitch / DEG))}°`, 334, 140);
      g.fillStyle = "#9aa4ad"; g.font = F(500, 10); g.fillText("КРЕН", 254, 154); g.fillText("УКЛОН", 334, 154); g.textAlign = "left";
    }
    g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(216, 178, 160, 1);
    g.fillStyle = accent(); g.beginPath(); g.arc(224, 196, 4, 0, 7); g.fill(); g.fillStyle = "#c9d0d6"; g.font = F(500, 12); g.fillText($("zone") ? $("zone").textContent : "", 234, 200);
    aX.drawImage(sC, 0, 184); drawClimate(); aT.needsUpdate = true;
  }
  // проекция на лобовое стекло: скорость и стрелка курса — цветом подсветки
  // проекция на лобовое стекло: цифры цветом подсветки (ивори — бирюзой, как у настоящих проекторов) с тёмным ореолом —
  // читаются и на светлом небе
  function drawHud(kmh, air, alt) {
    const g = hX; g.clearRect(0, 0, 160, 112); const ac = AMB[ambI].c && ambI ? accent() : "#6ff3d6";
    g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
    const txt = (t, y, px, w) => { g.font = F(w, px); g.strokeStyle = "rgba(0,8,12,.55)"; g.lineWidth = px * .22; g.strokeText(t, 80, y); g.fillStyle = ac; g.fillText(t, 80, y); };
    txt(String(air ? Math.round(alt) : Math.round(kmh)), 44, 46, 700); txt(air ? "м · полёт" : "км/ч", 80, 14, 600);
    const st = carObj.userData.st || 0; g.fillStyle = ac; g.beginPath(); g.moveTo(80 - st * 34, 94); g.lineTo(72, 106); g.lineTo(88, 106); g.closePath(); g.fill(); hT.needsUpdate = true;
  }
  // подвеска: кузов кренится мягче «восьмёрки» (пневма), колёса остаются на дороге — у каждого свой ход
  const LEAN = { roll: 1.12, pitch: 1.25 };
  // голова водителя: пружина с затуханием — отклоняется при разгоне, торможении и в поворотах, вздрагивает на посадке,
  // мелко дрожит от дороги на скорости
  const hd = { p: new T.Vector3(), v: new T.Vector3(), pv: 0, pyaw: 0, air: false, vy: 0, t: 0, off: new T.Vector3() };
  function head(dt) {
    dt = Math.max(1e-3, Math.min(.05, dt)); const v = car.v, ax = (v - hd.pv) / dt, dy = ((car.yaw - hd.pyaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI, ay = v * dy / dt;
    hd.pv = v; hd.pyaw = car.yaw;
    const air = mode === "free" && free.air; if (air) hd.vy = car.vy; else if (hd.air) hd.v.y -= Math.min(1.4, Math.abs(hd.vy) * .09);   // посадка — голова «проседает»
    hd.air = air; const F = new T.Vector3(Math.max(-.035, Math.min(.035, -ax * .0022)), 0, Math.max(-.03, Math.min(.03, ay * .0016)));
    for (const k of ["x", "y", "z"]) { const a = 70 * (F[k] - hd.p[k]) - 10 * hd.v[k]; hd.v[k] += a * dt; hd.p[k] += hd.v[k] * dt; }
    hd.t += dt * (2 + Math.abs(v) * .6); const sh = air ? 0 : .0008 + Math.min(.004, Math.abs(v) * .00007);
    hd.off.set(hd.p.x, hd.p.y + sh * (Math.sin(hd.t * 7.3) + .6 * Math.sin(hd.t * 13.1 + 1)), hd.p.z + sh * .5 * Math.sin(hd.t * 9.7 + 2)); return hd.off;
  }
  let on = false, inCab = false;
  function select(want) {
    on = !!want; root.visible = on; VAZ_PARTS.forEach(o => { o.visible = !on; });
    const U = carObj.userData; U.wheels = on ? wheels : U.vazWheels; U.redM = on ? M.tail : U.vazRed; U.headM = on ? M.head : U.vazHead;
    if (!on) applyLook();
  }
  function cockpit(c) {
    c = !!(c && on); if (c === inCab) return; inCab = c; cab.visible = c; dash.visible = !c; wheels.forEach(w => w.steer.visible = !c);
    outside.forEach(m => m.visible = !c);                                   // фары, фонари и номера изнутри не видны — не рисуем
    const gl = M.glass.userData.gl; gl.uT.value = c ? .9 : .62; gl.uPriv.value.y = c ? .55 : .26; gl.uRefl.value = c ? .3 : 1; gl.uIn.value = c ? 1 : 0; if (c) amb();   // изнутри: стекло светлее, отражения слабые, отсвет панели
  }
  function tick(dt) {
    if (!on) return; const U = carObj.userData;
    wheelS.rotation.x += (-(U.st || 0) * 2.3 - wheelS.rotation.x) * Math.min(1, dt * 12);   // руль крутится за передними колёсами
    const r = (car.bodyRoll || 0) * LEAN.roll * DEG, p = (car.bodyPitch || 0) * LEAN.pitch * DEG;
    wheels.forEach(w => { const q = w.steer.position; q.y = w.y0 - Math.max(-.09, Math.min(.09, q.x * Math.sin(p) - q.z * Math.sin(r))); });
    if (!inCab) return;
    if ((gauge.t -= dt) <= 0) {
      const v = Math.abs(car.v), gear = Math.min(5, Math.floor(v / 12)), within = (v - gear * 12) / 12, step = 1 / 20 - gauge.t; gauge.t = 1 / 20;
      const f = 48 + gear * 9 + within * 70 + (input.thrust ? 12 : 0), want = Math.max(750, 800 + (f - 48) / 127 * 6000) * .8;
      gauge.rpm += (want - gauge.rpm) * Math.min(1, (want > gauge.rpm ? 5 : 2.5) / 20); gauge.trip += v * step / 1000;
      const air = mode === "free" && free.air, alt = Math.max(0, car.y - (free.gh || 0));
      drawGauges(v * 3.6, gauge.rpm, car.v < -.5 ? "R" : v < .5 ? "N" : "D" + (gear + 1), air, alt); drawHud(v * 3.6, air, alt);
      if ((gauge.s -= 1) <= 0) { gauge.s = 4; drawScreen(); }
    }
  }
  return { select, cockpit, tick, head, amb, eye, LEAN, get on() { return on; }, get ambName() { return AMB[ambI].n; }, M };
})() : null;
carObj.userData.vazWheels = carObj.userData.wheels; carObj.userData.vazRed = carObj.userData.redM; carObj.userData.vazHead = carObj.userData.headM;
if (SUV) SUV.amb(save.amb || 0);
if (SUV && save.vehicle === "suv") SUV.select(true);
{   // ночью — свет фар на дороге: веер тёплого света перед машиной (без настоящего источника — дёшево)
  const c = document.createElement("canvas"); c.width = 256; c.height = 128; const g = c.getContext("2d");
  const lg = g.createLinearGradient(0, 0, 256, 0); lg.addColorStop(0, "rgba(255,240,205,.95)"); lg.addColorStop(.35, "rgba(255,236,196,.55)"); lg.addColorStop(1, "rgba(255,230,190,0)");
  g.fillStyle = lg; g.beginPath(); g.moveTo(0, 50); g.lineTo(256, 0); g.lineTo(256, 128); g.lineTo(0, 78); g.closePath(); g.fill();
  const beam = new T.Mesh(new T.PlaneGeometry(20, 10).rotateX(-Math.PI / 2).translate(12, -.6, 0), nightReg(new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false, blending: T.AdditiveBlending, visible: false, toneMapped: false }), "visible", { sunset: false, day: false, night: true }));
  carObj.add(beam);
}
const TUNES = ["заводской", "брызговики и ветровики", "+ литые диски"];
function setTune(n) {                          // n = "pro" — широкий обвес режима PRO; на дрифт-треке 888 — широкая резина и дрифтовые диски
  const o = carObj.userData.opt, pro = n === "pro", dk = !pro && mode === "free" && !!free.driftKit;
  o.flaps.visible = o.visors.visible = pro || n >= 1; o.pro.visible = pro; o.badge.material.map = o.badge.userData.tex[save.badge888 ? 1 : 0];
  (carObj.userData.vazWheels || carObj.userData.wheels).forEach(w => { w.stock.visible = !pro && !dk && n < 2; w.alloy.visible = !pro && !dk && n >= 2; w.pro.visible = pro; w.drift.visible = dk; });
}
const EGGPLANT = { n: "баклажан", c: 0x2c0a44 };
// отражения неба в стёклах машины: небо-купол текущего времени суток → PMREM
const carEnv = { pmrem: null, rt: null };
function paintCarEnv() {
  try {
    if (!carEnv.pmrem) carEnv.pmrem = new T.PMREMGenerator(renderer);
    const sc = new T.Scene(), parent = skyDome.parent, pos = skyDome.position.clone(), sc0 = skyDome.scale.x;
    sc.add(skyDome); skyDome.position.set(0, 0, 0); skyDome.scale.setScalar(50);
    // внизу — тёмная земля до горизонта: на боках кузова отражается чёткая линия горизонта (небо сверху, асфальт снизу) —
    // форма читается, цвет не выцветает от светлой дымки
    if (!carEnv.gnd) carEnv.gnd = new T.Mesh(new T.CircleGeometry(48, 48).rotateX(-Math.PI / 2).translate(0, -1.6, 0), new T.MeshBasicMaterial({ color: 0x2b2a28 }));
    carEnv.gnd.material.color.setHex(TIME === "night" ? 0x050608 : TIME === "day" ? 0x3a3936 : 0x2e2b28); sc.add(carEnv.gnd);
    const rt = carEnv.pmrem.fromScene(sc, 0, .1, 200);
    if (parent) parent.add(skyDome); skyDome.position.copy(pos); skyDome.scale.setScalar(sc0);
    if (carEnv.rt) carEnv.rt.dispose(); carEnv.rt = rt;
    const seen = new Set();
    carObj.traverse(o => {
      const m = o.material; if (!m || !m.isMeshStandardMaterial || seen.has(m)) return; seen.add(m);
      if (m.userData.carShiny) { m.envMap = rt.texture; m.envMapIntensity = m.userData.envI ?? 1; m.needsUpdate = true; }   // кузов без отражений: на телефоне они дороги на большой площади
    });
  } catch (e) { console.warn("env", e); }
}
function setPaint(i) {                         // i < 0 — баклажан режима PRO
  const p = i < 0 ? EGGPLANT : PAINTS[i % PAINTS.length];
  carObj.userData.paint.color.setHex(p.c).multiplyScalar(i < 0 ? 1 : .82);   // «глубина» лака — тон чуть темнее
  const P = carObj.userData.paint; P.roughness = i < 0 ? .7 : .42; P.metalness = i < 0 ? .05 : .02; P.clearcoat = i < 0 ? .35 : 1; P.clearcoatRoughness = i < 0 ? .3 : .07;   // баклажан — матовый: блик мягкий и узкий
  const hex = "#" + p.c.toString(16).padStart(6, "0");
  document.querySelectorAll("#d-car .paint").forEach(el => el.setAttribute(el.tagName === "path" ? "stroke" : "fill", hex));
}
const shadow = new T.Mesh(new T.CircleGeometry(1, 24), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .35, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
const marker = new T.Mesh(new T.RingGeometry(1.2, 1.6, 32), new T.MeshBasicMaterial({ color: 0x6fdc8c, transparent: true, opacity: .85, side: T.DoubleSide }));
marker.rotation.x = -Math.PI / 2; scene.add(marker);

