// «Восьмёрка Баклажан» — небо и свет, вода Дона (WAKE), праздничное оформление; общие помощники: mat, mergeGeos, bake, freeze, flat, addSolid.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- небо и свет: 16:30, низкое золотое солнце ---------- */
// Карта повёрнута: +x — запад, +z — север. В 16:30 солнце на юго-западе (азимут ~230°) на высоте ~18°.
const SUN_DIR = new T.Vector3(.73, .31, -.61).normalize();
renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .92;   // как у фотоаппарата: светлое не выгорает
const HAZE = 0xd6dcdb;
scene.background = new T.Color(HAZE);
scene.fog = new T.Fog(HAZE, 260, 900);
const hemi = new T.HemisphereLight(0xc4d8f2, 0x5e5646, .55); scene.add(hemi);
const sun = new T.DirectionalLight(0xffcf8f, 2.3); sun.position.copy(SUN_DIR).multiplyScalar(400); scene.add(sun);
// время суток: закат 16:30 (основное), день, ночь. Всё, что меняется ночью, регистрируется здесь и переключается в setTime
// Дон: голубая вода, рябь в шейдере по мировым координатам — бежит на запад (+x), по течению;
// блики солнца от волн, у горизонта отражает небо. На низком качестве рябь стоит (uFlow = 0).
const DON_WATER = new T.MeshStandardMaterial({ color: new T.Color("#2f86b4").convertSRGBToLinear(), roughness: .14, metalness: .05, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
DON_WATER.name = "don-water";                    // копии материала (сцены) узнаём по имени — для режима «Фото»
DON_WATER.userData.u = { uTime: { value: 0 }, uFlow: { value: 1 }, uSky: { value: new T.Color(0x9fc4e0) } };
// волны-кольца от ударов (брызги, посадка на судно, низкий пролёт над водой, нос судна): до 6 сразу, бегут ~6,5 м/с, гаснут за ~5 с
const WAKE = { u: { uImp: { value: [...Array(6)].map(() => new T.Vector4(0, 0, -99, 0)) } }, i: 0,
  add(x, z, s) { const q = this.u.uImp.value[this.i++ % 6]; q.set(x, z, DON_WATER.userData.u.uTime.value, s); },
  glsl: `uniform vec4 uImp[6];
  vec3 impacts(vec2 p, float tn) { vec3 r = vec3(0.); for (int i = 0; i < 6; i++) { vec4 q = uImp[i]; float dt = tn - q.z; if (dt < 0. || dt > 6.) continue;
    vec2 d = p - q.xy; float rr = length(d) + .001, fr = rr - 6.5 * dt, env = q.w * exp(-dt * .8) * exp(-fr * fr * .05) * smoothstep(0., 1.5, rr), ph = rr * 1.5 - dt * 9.;
    r.z += env * sin(ph); r.xy += env * 1.5 * cos(ph) * d / rr; } return r; }` };
DON_WATER.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, DON_WATER.userData.u, WAKE.u);
  sh.vertexShader = "varying vec3 vWP;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vWP = position;");
  sh.fragmentShader = "varying vec3 vWP; uniform float uTime, uFlow; uniform vec3 uSky;\n" + WAKE.glsl + "\n" + sh.fragmentShader
    .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
    vec2 p = vWP.xz; float t = uTime * uFlow; vec2 g = vec2(0.); float hh = 0.;
    // четыре системы волн, главная — вдоль течения (на запад); градиент считаем точно
    vec4 K = vec4(.21, .37, .62, 1.13), A = vec4(.15, .09, .05, .03);   // волны крупнее — видно, как ходит вода
    vec2 D0 = normalize(vec2(1., .25)), D1 = normalize(vec2(.8, -.6)), D2 = normalize(vec2(.3, 1.)), D3 = normalize(vec2(-.5, .9));
    float ph0 = dot(D0, p) * K.x - t * 1.3, ph1 = dot(D1, p) * K.y - t * 1.9, ph2 = dot(D2, p) * K.z - t * 2.6, ph3 = dot(D3, p) * K.w - t * 3.4;
    hh = A.x * sin(ph0) + A.y * sin(ph1) + A.z * sin(ph2) + A.w * sin(ph3);
    g = A.x * K.x * cos(ph0) * D0 + A.y * K.y * cos(ph1) * D1 + A.z * K.z * cos(ph2) * D2 + A.w * K.w * cos(ph3) * D3;
    vec3 im = impacts(p, uTime); g += im.xy; hh += im.z;   // кольца от ударов
    vec3 nW = normalize(vec3(-g.x * 3.5, 1., -g.y * 3.5));
    normal = normalize((viewMatrix * vec4(nW, 0.)).xyz);
    diffuseColor.rgb *= .9 + .9 * hh;                      // гребни светлее, впадины темнее — видна рябь
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.92, .96, 1.), smoothstep(.17, .3, hh) * .7);   // барашки на гребнях`)
    .replace("#include <output_fragment>", `float fr = pow(1. - max(dot(normal, normalize(vViewPosition)), 0.), 4.);
    outgoingLight = mix(outgoingLight, uSky, clamp(fr * .75, 0., .75));
    #include <output_fragment>`);
};
const TIMES = {
  sunset: { sun: [.73, .31, -.61], sunC: 0xffcf8f, sunI: 2.3, sky: 0xc4d8f2, gnd: 0x5e5646, hemiI: .55, haze: 0xd6dcdb, exp: .92, name: "закат" },
  day: { sun: [.32, .86, -.4], sunC: 0xfff3e2, sunI: 1.9, sky: 0xcfe2fa, gnd: 0x6b6250, hemiI: .6, haze: 0xcbd9e6, exp: .8, name: "день" },
  night: { sun: [-.45, .55, .7], sunC: 0x8ea6ff, sunI: .22, sky: 0x2a3a6a, gnd: 0x07080d, hemiI: .3, haze: 0x0b1324, exp: 1.1, name: "ночь" },
};
let TIME = "sunset";
const NIGHT = [];                                // [объект, свойство, {sunset, day, night}]
const nightReg = (o, k, v) => { NIGHT.push([o, k, v]); return o; };
// небесный купол: градиент, солнце с ореолом, лучи сквозь облака, кучевые облака; ночью — звёзды, луна, зарево города
const skyDome = (() => {
  const W = 1024, H = 512, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"), tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding;
  function paint(key) {
    const night = key === "night", day = key === "day", haze = "#" + TIMES[key].haze.toString(16).padStart(6, "0");
    g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, W, H);
    const gr = g.createLinearGradient(0, 0, 0, H / 2);
    if (night) { gr.addColorStop(0, "#02040b"); gr.addColorStop(.6, "#0a1530"); gr.addColorStop(.92, "#1c2440"); gr.addColorStop(1, "#3a2c38"); }
    else if (day) { gr.addColorStop(0, "#1f5fae"); gr.addColorStop(.55, "#5b94d2"); gr.addColorStop(.88, "#a7c8e6"); gr.addColorStop(1, "#cbd9e6"); }
    else { gr.addColorStop(0, "#22528f"); gr.addColorStop(.5, "#5f8fc4"); gr.addColorStop(.85, "#a9c3dc"); gr.addColorStop(1, "#d3dcdf"); }
    g.fillStyle = gr; g.fillRect(0, 0, W, H / 2); g.fillStyle = haze; g.fillRect(0, H / 2, W, H / 2);
    // где солнце (луна) на развёртке купола (SphereGeometry: x = −cos φ·sin θ, z = sin φ·sin θ)
    let phi = Math.atan2(SUN_DIR.z, -SUN_DIR.x); if (phi < 0) phi += Math.PI * 2;
    const su = phi / (Math.PI * 2) * W, sv = Math.acos(SUN_DIR.y) / Math.PI * H;
    let sd = 9137; const r01 = () => (sd = sd * 16807 % 2147483647) / 2147483647;
    if (night) {
      for (let i = 0; i < 700; i++) { const y = Math.pow(r01(), 1.6) * H * .47, a = .25 + r01() * .75; g.fillStyle = `rgba(255,255,255,${(a * (1 - y / (H * .5))).toFixed(2)})`; g.fillRect(r01() * W, y, r01() < .08 ? 2 : 1, r01() < .08 ? 2 : 1); }
      [-W, 0, W].forEach(o => { const rg = g.createRadialGradient(su + o, sv, 0, su + o, sv, 70); rg.addColorStop(0, "rgba(200,215,255,.35)"); rg.addColorStop(1, "rgba(200,215,255,0)"); g.fillStyle = rg; g.fillRect(su + o - 70, sv - 70, 140, 140);
        g.fillStyle = "#eef2ff"; g.beginPath(); g.arc(su + o, sv, 9, 0, 7); g.fill(); g.fillStyle = "#0a1530"; g.beginPath(); g.arc(su + o + 4, sv - 2, 8, 0, 7); g.fill(); });
      const cg = g.createLinearGradient(0, H * .4, 0, H / 2); cg.addColorStop(0, "rgba(255,150,90,0)"); cg.addColorStop(1, "rgba(255,150,90,.22)"); g.fillStyle = cg; g.fillRect(0, H * .4, W, H * .1);   // зарево города
    } else {
      const glow = (x, r, a) => { const rg = g.createRadialGradient(x, sv, 0, x, sv, r); rg.addColorStop(0, day ? `rgba(255,252,240,${a})` : `rgba(255,220,150,${a})`); rg.addColorStop(1, "rgba(255,230,180,0)"); g.fillStyle = rg; g.fillRect(x - r, sv - r, r * 2, r * 2); };
      [-W, 0, W].forEach(o => { glow(su + o, day ? 90 : 150, day ? .35 : .45); glow(su + o, day ? 24 : 40, .95); });
    }
    // кучевые облака: гроздья мягких кругов; на закате у солнца — золотой край, ночью — тёмные, едва видные
    for (let i = 0; i < 38; i++) {
      const cx = r01() * W, cy = H * (.3 + r01() * .16), n = 4 + Math.floor(r01() * 8), size = 10 + r01() * 20;
      const near = key === "sunset" ? Math.max(0, 1 - Math.min(Math.abs(cx - su), W - Math.abs(cx - su)) / 260) : 0;
      for (let k = 0; k < n; k++) {
        const x = cx + (r01() - .5) * size * 3, y = cy + (r01() - .6) * size * .7, rr = size * (.6 + r01() * .7);
        [-W, 0, W].forEach(o => {
          const rg = g.createRadialGradient(x + o, y, 0, x + o, y, rr);
          const top = night ? "rgba(70,80,110,.55)" : near > .2 ? `rgba(255,${Math.round(236 - near * 20)},${Math.round(205 - near * 60)},.95)` : "rgba(255,255,255,.95)";
          rg.addColorStop(0, top); rg.addColorStop(.6, night ? "rgba(40,48,70,.4)" : "rgba(236,240,244,.75)"); rg.addColorStop(1, night ? "rgba(40,48,70,0)" : "rgba(200,208,218,0)");   // ночью край — тот же тёмный цвет: без светлых колец
          g.fillStyle = rg; g.beginPath(); g.ellipse(x + o, y, rr, rr * (.55 + (y / H) * .5), 0, 0, Math.PI * 2); g.fill();
        });
      }
    }
    if (key === "sunset") {                                  // лучи от солнца вниз сквозь облака
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 9; i++) {
        const a = Math.PI / 2 + (i - 4) * .16 + (r01() - .5) * .08, len = H * .5, wdt = .025 + r01() * .03;
        g.fillStyle = `rgba(255,228,170,${.025 + r01() * .03})`;
        g.beginPath(); g.moveTo(su, sv); g.lineTo(su + Math.cos(a - wdt) * len * 2, sv + Math.sin(a - wdt) * len); g.lineTo(su + Math.cos(a + wdt) * len * 2, sv + Math.sin(a + wdt) * len); g.fill();
      }
      g.globalCompositeOperation = "source-over";
    }
    tex.needsUpdate = true;
  }
  paint("sunset");
  const m = new T.Mesh(new T.SphereGeometry(1, 48, 24), new T.MeshBasicMaterial({ map: tex, side: T.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  m.renderOrder = -2000; m.frustumCulled = false; m.userData.dyn = true; m.userData.paint = paint; scene.add(m); return m;   // dyn — не склеивать со статикой
})();
// столбы света в воздухе (только на высоком качестве и когда смотрим в сторону солнца)
const shafts = (() => {
  const c = document.createElement("canvas"); c.width = 32; c.height = 256;
  const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "rgba(255,226,170,0)"); gr.addColorStop(.25, "rgba(255,226,170,.9)"); gr.addColorStop(.75, "rgba(255,226,170,.25)"); gr.addColorStop(1, "rgba(255,226,170,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 32, 256);
  const side = g.createLinearGradient(0, 0, 32, 0); side.addColorStop(0, "rgba(0,0,0,1)"); side.addColorStop(.5, "rgba(0,0,0,0)"); side.addColorStop(1, "rgba(0,0,0,1)");
  g.globalCompositeOperation = "destination-out"; g.fillStyle = side; g.fillRect(0, 0, 32, 256);
  const tex = new T.CanvasTexture(c);
  return [0, 1, 2, 3, 4, 5].map(i => {
    const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false, toneMapped: false, side: T.DoubleSide }));
    m.userData = { d: 110 + i * 38, off: (i - 2.5) * 60 + (i % 2 ? 18 : -12), w: 14 + (i % 3) * 10, dyn: true };
    m.frustumCulled = false; m.renderOrder = 10; scene.add(m); return m;
  });
})();
const shaftTmp = { f: new T.Vector3(), r: new T.Vector3(), a: SUN_DIR.clone().negate(), p: new T.Vector3(), n: new T.Vector3(), x: new T.Vector3(), b: new T.Matrix4() };
function tickSky() {
  skyDome.position.copy(camera.position); skyDome.scale.setScalar(camera.far * .95);
  const S = shaftTmp, on = perf.q > 1 && !testFast && TIME === "sunset";
  camera.getWorldDirection(S.f); S.f.y = 0; S.f.normalize();
  const face = S.f.x * SUN_DIR.x + S.f.z * SUN_DIR.z, k = Math.max(0, Math.min(1, (face / Math.hypot(SUN_DIR.x, SUN_DIR.z) - .3) / .5));
  S.r.set(-S.f.z, 0, S.f.x);
  shafts.forEach(m => {
    m.visible = on && k > .02; if (!m.visible) return;
    const u = m.userData;
    S.p.copy(camera.position).addScaledVector(S.f, u.d).addScaledVector(S.r, u.off); S.p.y = 95;
    S.n.copy(camera.position).sub(S.p); S.n.addScaledVector(S.a, -S.n.dot(S.a)).normalize(); S.x.crossVectors(S.a, S.n);
    S.b.makeBasis(S.x, S.a, S.n); m.quaternion.setFromRotationMatrix(S.b); m.position.copy(S.p); m.scale.set(u.w, 260, 1);
    m.material.opacity = .16 * k;
  });
}
// одинаковые материалы — один объект: так статику можно склеить по материалу и рисовать меньшим числом вызовов
const matCache = new Map();
const mat = (c, o = {}) => {
  if (o.map || o.emissiveMap) return new T.MeshStandardMaterial(Object.assign({ color: c, roughness: .85, metalness: .05 }, o));
  const key = c + JSON.stringify(o);
  if (!matCache.has(key)) matCache.set(key, new T.MeshStandardMaterial(Object.assign({ color: c, roughness: .85, metalness: .05 }, o)));
  return matCache.get(key);
};
// светятся признаком в вершинах (glow): фары и фонари машин, лампочки праздничного оформления — ночью ярко, днём чуть,
// без отдельных сеток и вызовов отрисовки
const GLOW = { value: .3 }; nightReg(GLOW, "value", { sunset: .7, day: .25, night: 2.2 });
function glowMat() {
  const m = new T.MeshStandardMaterial({ vertexColors: true, roughness: .45, metalness: .1 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uGlow = GLOW;
    sh.vertexShader = "attribute float glow;\nvarying float vGlow;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vGlow = glow;");
    sh.fragmentShader = "uniform float uGlow;\nvarying float vGlow;\n" + sh.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * vGlow * uGlow;");
  };
  return m;
}
function mergeGeos(geos) {   // склейка непроиндексированных геометрий с общим набором атрибутов
  const out = new T.BufferGeometry();
  Object.keys(geos[0].attributes).filter(n => geos.every(g => g.attributes[n])).forEach(n => {
    const size = geos[0].attributes[n].itemSize, arr = new Float32Array(geos.reduce((a, g) => a + g.attributes[n].array.length, 0));
    let o = 0; geos.forEach(g => { arr.set(g.attributes[n].array, o); o += g.attributes[n].array.length; });
    out.setAttribute(n, new T.BufferAttribute(arr, size));
  });
  return out;
}
function bake(mesh, matrix) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  g.applyMatrix4(matrix); return g;
}
/* ---------- праздничное оформление: «парк аттракционов» для трюков ---------- */
// всё — один материал с цветами по вершинам, лампочки светятся (glow); перед freeze собирается в одну сетку — один вызов отрисовки
const FEST_M = glowMat(); FEST_M.side = T.DoubleSide;
const FEST_COLS = ["#ff3b6b", "#ffc93c", "#3ddc84", "#39b6ff", "#b46bff", "#ff7a2f"];
const FEST = { geos: [] };
function festPut(geo, hex, glow = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo, c = new T.Color(hex).convertSRGBToLinear(), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  if (g.attributes.uv) g.deleteAttribute("uv");
  if (!g.attributes.normal) g.computeVertexNormals();
  g.setAttribute("color", new T.BufferAttribute(a, 3)); g.setAttribute("glow", new T.BufferAttribute(new Float32Array(n).fill(glow), 1));
  FEST.geos.push(g);
}
const FEST_BULB = new T.OctahedronGeometry(.14, 0);
function festBulbs(pts, cols = FEST_COLS) { pts.forEach(([x, y, z], i) => festPut(FEST_BULB.clone().translate(x, y, z), cols[i % cols.length], 1)); }
function festPole(x, z, h, y0 = 0, hex = "#ece6da") { festPut(new T.CylinderGeometry(.06, .08, h, 6).translate(x, y0 + h / 2, z), hex); }
function festTri(a, b, c, hex, glow = 0) { const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute([...a, ...b, ...c], 3)); festPut(g, hex, glow); }
// плоский четырёхугольник лицом вверх (двусторонний материал переворачивает нормаль у «изнанки» — была бы чёрная)
function festQuadUp(a, b, c, d, hex) {
  const up = (p, q, r) => (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]) >= 0;
  const t1 = up(a, b, c) ? [a, b, c] : [a, c, b], t2 = up(a, c, d) ? [a, c, d] : [a, d, c];
  const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute([...t1.flat(), ...t2.flat()], 3));
  g.setAttribute("normal", new T.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3)); festPut(g, hex);
}
// гирлянда флажков между двумя точками с провисом: верёвка — тонкие бруски, флажки — треугольники по цветам
function festBunting(a, b, sag = .7, cols = FEST_COLS) {
  const L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(2, Math.round(L / .85));
  const at = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(Math.PI * t) * sag, a[2] + (b[2] - a[2]) * t];
  for (let i = 0; i < n; i++) {
    const p0 = at(i / n), p1 = at((i + .75) / n), tip = at((i + .37) / n); tip[1] -= .5;
    festTri(p0, p1, tip, cols[i % cols.length]);
    const q = at((i + 1) / n);                                          // верёвка: цилиндр вдоль отрезка
    festPut(new T.CylinderGeometry(.015, .015, Math.hypot(q[0] - p0[0], q[1] - p0[1], q[2] - p0[2]), 3).rotateX(Math.PI / 2)
      .lookAt(new T.Vector3(q[0] - p0[0], q[1] - p0[1], q[2] - p0[2])).translate((p0[0] + q[0]) / 2, (p0[1] + q[1]) / 2, (p0[2] + q[2]) / 2), "#3a3a40");
  }
}
// трамплин: лампочки по кромкам настила, столбики с вымпелами по углам вылета
function festKicker(k, i) {
  const toW = (u, y, w) => [k.x + u * k.fx - w * k.fz, k.y0 + y, k.z + u * k.fz + w * k.fx];
  const hAt = u => k.curve ? k.h * (u / k.len) ** 2 : k.h * u / k.len;
  for (const s of [-1, 1]) {
    const pts = []; for (let u = .5; u <= k.len - .1; u += 1.05) pts.push(toW(u, hAt(u) + .1, s * (k.w / 2 + .06)));
    festBulbs(pts, i % 2 ? FEST_COLS : FEST_COLS.slice().reverse());
    const [x, , z] = toW(k.len + .25, 0, s * (k.w / 2 + .35)), top = k.h + 2.6;
    festPole(x, z, top, k.y0);
    const back = Math.atan2(-(-k.fz), -k.fx);                          // вымпел «летит» назад, по ветру разгона
    for (let f = 0; f < 2; f++) festTri([x, k.y0 + top - f * .55, z], [x + Math.cos(back) * .95, k.y0 + top - .25 - f * .55, z - Math.sin(back) * .95], [x, k.y0 + top - .5 - f * .55, z], FEST_COLS[(i + f * 3 + (s > 0 ? 1 : 0)) % FEST_COLS.length]);
    festBulbs([[x, k.y0 + top + .2, z]], [FEST_COLS[(i + 2) % FEST_COLS.length]]);
  }
}
// заменить обычные меши внутри root склеенными по материалу; instanced-меши, линии и помеченные dyn не трогаем
function freeze(root, local = false) {
  const buckets = new Map(), victims = [];
  root.updateMatrixWorld(true);
  const inv = local ? root.matrixWorld.clone().invert() : null;
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.userData.dyn) return;
    for (let p = o; p && p !== root; p = p.parent) if (p.userData.dyn) return;
    const m = local ? inv.clone().multiply(o.matrixWorld) : o.matrixWorld;
    const key = o.material.uuid;
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, geos: [] });
    buckets.get(key).geos.push(bake(o, m)); victims.push(o);
  });
  victims.forEach(o => o.parent.remove(o));
  buckets.forEach(({ mat, geos }) => root.add(new T.Mesh(mergeGeos(geos), mat)));
}
const under = (color, f = 2) => new T.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: f });
const flat = (w, d, color, x, z, y = .01) => {
  const m = new T.Mesh(new T.PlaneGeometry(w, d), color.isMaterial ? color : new T.MeshLambertMaterial({ color }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y * 3, z); scene.add(m); return m;
};
function textTex(lines, w = 512, h = 128, bg = "#1f6b3a", fg = "#ffffff") {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
  let px = Math.floor(h / (lines.length + .6)); g.font = `bold ${px}px Golos Text, Arial, sans-serif`;
  const wide = Math.max(...lines.map(t => g.measureText(t).width)); if (wide > w - 36) { px = Math.floor(px * (w - 36) / wide); g.font = `bold ${px}px Golos Text, Arial, sans-serif`; }   // длинная надпись — мельче, но целиком
  lines.forEach((t, i) => g.fillText(t, w / 2, h * (i + 1) / (lines.length + 1)));
  const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding; return tex;
}

/* препятствия: стены (низкие, отбрасывают) и здания/объекты (высокие) */
const walls = [], solids = [], kickers = [];
const addSolid = (x0, x1, z0, z1, h, name) => solids.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), h, name });

