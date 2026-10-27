// «Восьмёрка Баклажан» — частицы, вечеринка 888, ряд машин на полигоне.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- частицы ---------- */
// дым, пар и пыль — клубы: одна система точек, один вызов отрисовки на все. Текстура — атлас 2×2 из четырёх разных клубов
// (каждый собран из десятков мягких шариков: края рваные, внутри — светлые и тёмные завитки); у каждой частицы свой клуб
// и свой поворот, клуб медленно вращается и растёт — дым не выглядит «пятнами». Свет сверху: верх клуба светлее низа
const SMOKE_TEX = (() => {
  const S = 128, c = document.createElement("canvas"); c.width = c.height = S * 2; const g = c.getContext("2d");
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let t = 0; t < 4; t++) {
    const ox = (t % 2) * S, oy = (t >> 1) * S;
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2, d = Math.pow(rnd(), .7) * S * .3, x = ox + S / 2 + Math.cos(a) * d, y = oy + S / 2 + Math.sin(a) * d * .9, r = S * (.07 + rnd() * .13);
      const lum = Math.round(170 + 85 * Math.max(0, Math.min(1, .55 - (y - oy - S / 2) / S * 1.6 + (rnd() - .5) * .5)));   // верх светлее
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${lum},${lum},${lum},${.22 + rnd() * .2})`); gr.addColorStop(1, `rgba(${lum},${lum},${lum},0)`);
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  const t = new T.CanvasTexture(c); t.generateMipmaps = true; return t;
})();
// общий кусок шейдера: поворот клуба, выбор клуба из атласа, свет сверху
const SMOKE_FRAG = `uniform sampler2D smokeMap;
  vec4 smoke(float rot, float tile) {
    vec2 q = gl_PointCoord - .5; float cs = cos(rot), sn = sin(rot); q = vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y) + .5;
    if (q.x < 0. || q.y < 0. || q.x > 1. || q.y > 1.) return vec4(0.);
    vec4 t = texture2D(smokeMap, (q + vec2(mod(tile, 2.), floor(tile / 2.))) * .5);
    return vec4(vec3(mix(.62, 1.08, t.r) * mix(1.06, .86, gl_PointCoord.y)), t.a);
  }`;
const PUFFN = 260, pool = [], puffPos = new Float32Array(PUFFN * 3), puffSize = new Float32Array(PUFFN), puffAlpha = new Float32Array(PUFFN), puffRot = new Float32Array(PUFFN), puffTile = new Float32Array(PUFFN);
const puffGeo = new T.BufferGeometry();
puffGeo.setAttribute("position", new T.BufferAttribute(puffPos, 3)); puffGeo.setAttribute("size", new T.BufferAttribute(puffSize, 1)); puffGeo.setAttribute("alpha", new T.BufferAttribute(puffAlpha, 1));
puffGeo.setAttribute("rot", new T.BufferAttribute(puffRot, 1)); puffGeo.setAttribute("tile", new T.BufferAttribute(puffTile, 1));
const puffMat = new T.ShaderMaterial({
  uniforms: { smokeMap: { value: SMOKE_TEX }, scale: { value: 500 }, color: { value: new T.Color(0xe9f3fb) } },
  vertexShader: "attribute float size, alpha, rot, tile; varying float vA, vR, vT; uniform float scale;\n" +
    "void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = alpha * clamp((-mv.z - 1.5) / 6.0, 0.0, 1.0); vR = rot; vT = tile; gl_PointSize = min(400.0, size * scale / max(.5, -mv.z)); gl_Position = projectionMatrix * mv; }",
  fragmentShader: "uniform vec3 color; varying float vA, vR, vT;\n" + SMOKE_FRAG +
    "\nvoid main() { vec4 s = smoke(vR, vT); float a = s.a * vA * 1.5; if (a < .01) discard; gl_FragColor = vec4(color * s.rgb, min(a, 1.)); }",
  transparent: true, depthWrite: false,
});
const puffPts = new T.Points(puffGeo, puffMat); puffPts.frustumCulled = false; puffPts.renderOrder = 5; puffPts.userData.dyn = true; scene.add(puffPts);
for (let i = 0; i < PUFFN; i++) { pool.push({ p: new T.Vector3(), on: false, t: 0, life: 0, v: new T.Vector3(), s: 0, r: 0, w: 0 }); puffTile[i] = i % 4; }
let pi = 0;
function puff(p, v, life, s, g = 0, grow = 2) {       // g — тяжесть (брызги падают обратно), grow — во сколько раз облачко разрастается
  const q = pool[pi++ % pool.length];
  q.p.copy(p); q.v.copy(v).add(new T.Vector3((Math.random() - .5) * 2, (Math.random() - .5) * 2, (Math.random() - .5) * 2));
  q.t = 0; q.life = life; q.s = s; q.g = g; q.grow = grow; q.on = true; q.r = Math.random() * 6.3; q.w = (Math.random() - .5) * 1.4;
}
// всплеск в Дону: капли вверх и в стороны + расходящееся пенное кольцо на воде
const splashRing = new T.Mesh(new T.RingGeometry(.86, 1, 40).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xf2f8fb, transparent: true, opacity: 0, depthWrite: false }));
splashRing.visible = false; splashRing.renderOrder = 4; splashRing.userData.dyn = true; scene.add(splashRing);
function splash(x, z) {
  for (let i = 0; i < 44; i++) { const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 5; puff(new T.Vector3(x + Math.cos(a), .3, z + Math.sin(a)), new T.Vector3(Math.cos(a) * r, 6 + Math.random() * 7, Math.sin(a) * r), 1.3, .3 + Math.random() * .25, 14); }
  splashRing.position.set(x, .12, z); splashRing.userData.t = 0; splashRing.visible = true;
  WAKE.add(x, z, .35);
}
function dust(x, y, z, n) { for (let i = 0; i < n; i++) puff(new T.Vector3(x, y + .3, z), new T.Vector3((Math.random() - .5) * 6, 2, (Math.random() - .5) * 6), .8, .3); }
function tickPuffs(dt) {
  puffMat.uniforms.scale.value = renderer.domElement.height / (2 * Math.tan(camera.fov * DEG / 2));
  pool.forEach((q, i) => {
    if (q.on) { q.t += dt; if (q.t >= q.life) q.on = false; }
    if (!q.on) { puffAlpha[i] = 0; puffSize[i] = 0; return; }
    q.p.addScaledVector(q.v, dt); q.v.multiplyScalar(Math.pow(.086, dt)); if (q.g) { q.v.y -= q.g * dt; if (q.g > 0 ? q.p.y < .1 : q.p.y > .05) q.t = q.life; }   // брызги падают в воду, пузыри лопаются у поверхности
    const k = q.t / q.life;
    puffPos[i * 3] = q.p.x; puffPos[i * 3 + 1] = q.p.y; puffPos[i * 3 + 2] = q.p.z;
    puffSize[i] = 2.6 * q.s * (1 + k * q.grow); puffAlpha[i] = .6 * Math.pow(1 - k, 1.4) * Math.min(1, q.t * 10); puffRot[i] = q.r + q.w * q.t;
  });
  puffGeo.attributes.position.needsUpdate = puffGeo.attributes.size.needsUpdate = puffGeo.attributes.alpha.needsUpdate = puffGeo.attributes.rot.needsUpdate = true;
  if (splashRing.visible) {
    const t = splashRing.userData.t += dt, k = t / 1.6;
    if (k >= 1) splashRing.visible = false;
    else { splashRing.scale.setScalar(1.5 + 7 * Math.sqrt(k)); splashRing.material.opacity = .75 * (1 - k); }
  }
}

/* ---------- вечеринка 888: 8 секунд «чуда» после трюка — под удар песни игрока ---------- */
// 0–7 с: замедление времени и облёт камеры — три круга по-разному: низко у земли, сверху, сбоку с пролётом над крышей; на ударе — ударная волна по земле, лучи из машины
// во все стороны, голограмма «888» поднимается над крышей, залп цветных пушек и салют. Всё время — неон снизу, фары и
// фонари мигают в такт, мощные струи дыма из вращающихся сопел (клубы улетают далеко и расходятся). Конец — вместе с музыкой.
// Кнопка «✨» у «ВИД» выключает спецэффекты, «Музыка вечеринки» — в «⋯».
const PARTY_BEAT = 60 / 172, PARTY_LEN = 8, PARTY_ORBIT = 7.2, PARTY_COOL = 45;   // темп песни (замерен по файлу); длина; облёт — три круга; не чаще раза в 45 с
const partyFx = () => save.partyFx !== false, partyMus = () => save.partyMusic !== false;
const PARTY = (() => {
  const st = { on: false, t: 0, len: PARTY_LEN, smoke: 0, beat: -1, red: .55, head0: .25, a0: 0, orbit: false };
  const COLS = FEST_COLS.map(c => new T.Color(c).convertSRGBToLinear());
  const tmp = new T.Color();
  const colored = (geo, c) => { geo = geo.toNonIndexed(); const a = new Float32Array(geo.attributes.position.count * 3); for (let k = 0; k < a.length; k += 3) { a[k] = c.r; a[k + 1] = c.g; a[k + 2] = c.b; } geo.setAttribute("color", new T.BufferAttribute(a, 3)); geo.deleteAttribute("uv"); return geo; };
  const glowTex = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t; };
  const addMat = o => new T.MeshBasicMaterial({ transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, side: T.DoubleSide, ...o });
  // неон под машиной
  const spot = glowTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 2, 32, 32, 32); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(.55, "rgba(255,255,255,.45)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  const neonM = addMat({ map: spot, opacity: 1 });
  const neon = new T.Mesh(new T.PlaneGeometry(7.5, 4.4).rotateX(-Math.PI / 2), neonM); neon.position.y = -.6; neon.visible = false; neon.userData.dyn = true; carObj.add(neon);
  const grp = new T.Group(); grp.visible = false; grp.userData.dyn = true; scene.add(grp);
  // дымовые струи (как пушки на концертах): узкие цветные струи в такт — то вправо, то влево, из передних и задних сопел;
  // каждая струя летит полосой, расширяется и тает. Свои частицы: цвет и размер у каждой
  const JN = 900, jpos = new Float32Array(JN * 3), jcol = new Float32Array(JN * 3), jsz = new Float32Array(JN), jal = new Float32Array(JN), jv = new Float32Array(JN * 3), jt = new Float32Array(JN).fill(9), jl = new Float32Array(JN).fill(1);
  const jrot = new Float32Array(JN).map(() => Math.random() * 6.3), jtile = new Float32Array(JN).map((_, i) => i % 4), jw = new Float32Array(JN).map(() => (Math.random() - .5) * 2.4);
  const jgeo = new T.BufferGeometry(); jgeo.setAttribute("position", new T.BufferAttribute(jpos, 3)); jgeo.setAttribute("color", new T.BufferAttribute(jcol, 3));
  jgeo.setAttribute("aSize", new T.BufferAttribute(jsz, 1)); jgeo.setAttribute("aAlpha", new T.BufferAttribute(jal, 1)); jgeo.setAttribute("aRot", new T.BufferAttribute(jrot, 1)); jgeo.setAttribute("aTile", new T.BufferAttribute(jtile, 1));
  const jetM = new T.ShaderMaterial({ uniforms: { uScale: { value: 400 }, smokeMap: { value: SMOKE_TEX } }, transparent: true, depthWrite: false, vertexColors: true,
    vertexShader: "attribute float aSize, aAlpha, aRot, aTile; uniform float uScale; varying vec3 vC; varying float vA, vR, vT; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = min(500., aSize * uScale / -mv.z); gl_Position = projectionMatrix * mv; vC = color; vR = aRot; vT = aTile; vA = aAlpha * smoothstep(2.5, 6., -mv.z); }   // у самой камеры струя тает — облёт не «влетает» в дым",
    fragmentShader: "varying vec3 vC; varying float vA, vR, vT;\n" + SMOKE_FRAG + "\nvoid main() { vec4 s = smoke(vR, vT); float a = s.a * vA * 1.6; if (a < .01) discard; gl_FragColor = vec4(vC * s.rgb * 1.15, min(a, 1.)); }" });
  const jets = new T.Points(jgeo, jetM); jets.frustumCulled = false; jets.userData.dyn = true; jets.visible = false; scene.add(jets);
  let ji = 0;
  function jet(fx, sx, col, dtE) {                     // fx: перед/зад (+1/−1), sx: вправо/влево (+1/−1); dtE — сколько времени выпускаем
    v3.set(fx * 1.3, -.1, sx * .85).applyMatrix4(carObj.matrixWorld);
    const n = Math.min(40, Math.ceil(dtE * 260));       // частиц — по времени, а не по кадрам: струя сплошная при любой частоте кадров
    for (let k = 0; k < n; k++) {
      const i = ji++ % JN, sp = 20 + Math.random() * 5, spr = .06, age = Math.random() * dtE;   // каждая — как будто вылетела в свой момент внутри кадра
      const dx = side.x * sx + up.x * .32 + (Math.random() - .5) * spr, dy = side.y * sx + up.y * .32 + (Math.random() - .5) * spr, dz = side.z * sx + up.z * .32 + (Math.random() - .5) * spr;
      jpos.set([v3.x + dx * sp * age, v3.y + dy * sp * age, v3.z + dz * sp * age], i * 3); jv.set([dx * sp + vel.x, dy * sp, dz * sp + vel.z], i * 3);
      jcol.set([col.r * .7 + .3, col.g * .7 + .3, col.b * .7 + .3], i * 3); jt[i] = age; jl[i] = 1.4 + Math.random() * .5;   // дым подсвечен цветом, но остаётся дымом — не краской
    }
    jets.visible = true;
  }
  function jetTick(dt) {
    let alive = 0;
    for (let i = 0; i < JN; i++) {
      if (jt[i] >= jl[i]) { jal[i] = 0; continue; }
      alive++; jt[i] += dt; const k = jt[i] / jl[i], dr = Math.exp(-dt * 2.2);
      for (let c = 0; c < 3; c++) { jv[i * 3 + c] *= dr; jpos[i * 3 + c] += jv[i * 3 + c] * dt; } jv[i * 3 + 1] += .6 * dt;   // тормозится воздухом, чуть всплывает
      jsz[i] = .5 + 3.4 * Math.pow(k, .6); jal[i] = .34 * Math.pow(1 - k, 1.6) * Math.min(1, jt[i] * 10); jrot[i] += jw[i] * dt;   // узкая у сопла, к концу клубится и расходится
    }
    jetM.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(camera.fov * DEG / 2));
    jgeo.attributes.position.needsUpdate = jgeo.attributes.aSize.needsUpdate = jgeo.attributes.aAlpha.needsUpdate = jgeo.attributes.color.needsUpdate = jgeo.attributes.aRot.needsUpdate = true;
    if (!alive) jets.visible = false;
  }
  // ударная волна по земле: два кольца, радуга по кругу
  const ringTex = glowTex(256, 16, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); FEST_COLS.concat(FEST_COLS[0]).forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c)); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, "rgba(0,0,0,1)"); v.addColorStop(.5, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,1)"); g.globalCompositeOperation = "destination-out"; g.fillStyle = v; g.fillRect(0, 0, w, h); });
  const waves = [0, 1].map(() => { const m = new T.Mesh(new T.RingGeometry(.82, 1, 64, 1).rotateX(-Math.PI / 2), addMat({ map: ringTex })); m.frustumCulled = false; grp.add(m); return m; });
  // голограмма «888»: неоновые цифры поднимаются над крышей и всегда смотрят в камеру
  const holoTex = glowTex(512, 256, (g, w, h) => {
    g.font = "900 190px Golos Text, Arial Black, Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    const gr = g.createLinearGradient(60, 0, 452, 0); gr.addColorStop(0, "#ff3b6b"); gr.addColorStop(.5, "#ffc93c"); gr.addColorStop(1, "#39e6ff");
    g.shadowColor = "#b46bff"; g.shadowBlur = 40; g.lineWidth = 14; g.strokeStyle = "#b46bff"; g.strokeText("888", 256, 136);
    g.shadowBlur = 18; g.fillStyle = gr; g.fillText("888", 256, 136); g.shadowBlur = 0; g.lineWidth = 3; g.strokeStyle = "rgba(255,255,255,.9)"; g.strokeText("888", 256, 136);
    for (let y = 0; y < h; y += 6) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(0, y, w, 2); }   // строки голограммы
  });
  const holoM = addMat({ map: holoTex, blending: T.NormalBlending });   // обычное смешивание — цифры цветные и на ярком небе
  const holo = new T.Mesh(new T.PlaneGeometry(7, 3.5), holoM); holo.frustumCulled = false; grp.add(holo);
  // искры: залп цветных пушек из углов
  const CN = 500, cpos = new Float32Array(CN * 3), ccol = new Float32Array(CN * 3), cv = new Float32Array(CN * 3), clife = new Float32Array(CN), cbase = new Float32Array(CN * 3);
  const cgeo = new T.BufferGeometry(); cgeo.setAttribute("position", new T.BufferAttribute(cpos, 3)); cgeo.setAttribute("color", new T.BufferAttribute(ccol, 3));
  const cpts = new T.Points(cgeo, new T.PointsMaterial({ size: .3, map: spot, alphaTest: .12, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
  cpts.frustumCulled = false; cpts.userData.dyn = true; cpts.visible = false; scene.add(cpts);
  let ci = 0;
  const v3 = new T.Vector3(), fwd = new T.Vector3(), side = new T.Vector3(), up = new T.Vector3(), vel = new T.Vector3();
  function cannon(fx, sx, col, n = 40) {
    v3.set(fx * 1.6, .1, sx * .8).applyMatrix4(carObj.matrixWorld);
    for (let k = 0; k < n; k++) {
      const i = ci++ % CN, sp = 13 + Math.random() * 7, dx = side.x * sx * .55 + fwd.x * fx * .25 + up.x, dy = side.y * sx * .55 + fwd.y * fx * .25 + up.y, dz = side.z * sx * .55 + fwd.z * fx * .25 + up.z;
      cpos.set([v3.x, v3.y, v3.z], i * 3); cv.set([(dx + (Math.random() - .5) * .4) * sp + vel.x, (dy + (Math.random() - .5) * .3) * sp, (dz + (Math.random() - .5) * .4) * sp + vel.z], i * 3);
      cbase.set([col.r * 1.3, col.g * 1.3, col.b * 1.3], i * 3); clife[i] = 1.3 + Math.random() * .7;
    }
  }
  const lightsOff = () => { const U = carObj.userData; U.headM.emissiveIntensity = st.head0; U.amberM.emissiveIntensity = .5; st.red = .55; };
  function start(calm = false, force = false) {
    if (st.on || (!force && performance.now() / 1000 - (st.end || -1e9) < PARTY_COOL)) { SHOW.salute(car.x, car.y + 10, car.z, 2); return; }   // идёт или была недавно — только салют
    if (!partyFx() && !partyMus()) return;
    st.on = true; st.t = 0; st.beat = -1; st.smoke = 0; st.head0 = carObj.userData.headM.emissiveIntensity; st.hit = st.w2 = st.w3 = false; st.calm = calm;
    st.pos0 = sfx.songPos() || 0; st.len = Math.min(PARTY_LEN, sfx.partyLen()); sfx.song(true);   // если песня уже играет под кино-повтор — продолжается, отсчёт праздника — с этого момента
    st.a0 = Math.atan2(camera.position.z - car.z, camera.position.x - car.x);  // облёт начинается оттуда, где стоит камера
  }
  const orbT = () => Math.min(PARTY_ORBIT, st.len - .6);                 // облёт кончается до конца праздника (короче, если песня уже шла под повтор)
  function stop() {
    if (!st.on) return; st.on = false; st.end = performance.now() / 1000; neon.visible = grp.visible = false; lightsOff(); sfx.song(false);
    puffMat.uniforms.color.value.setHex(0xe9f3fb);
  }
  function tick(dt) {
    let alive = 0;
    for (let i = 0; i < CN; i++) {
      if (clife[i] <= 0) { ccol[i * 3] = ccol[i * 3 + 1] = ccol[i * 3 + 2] = 0; continue; }
      alive++; clife[i] -= dt; cv[i * 3 + 1] -= 9 * dt; for (let k = 0; k < 3; k++) { cv[i * 3 + k] *= 1 - dt * .9; cpos[i * 3 + k] += cv[i * 3 + k] * dt; }
      const f = Math.max(0, Math.min(1, clife[i] / .6)); for (let k = 0; k < 3; k++) ccol[i * 3 + k] = cbase[i * 3 + k] * f;
    }
    if (alive) { cgeo.attributes.position.needsUpdate = cgeo.attributes.color.needsUpdate = true; } else cpts.visible = false;
    if (jets.visible) jetTick(dt);
    if (!st.on) return;
    const pos = sfx.songPos(); st.t = pos != null ? Math.max(st.t, pos - st.pos0) : st.t + dt;   // время — по музыке: эффект кончается вместе с ней
    if (st.t >= st.len) return stop();
    const fx = partyFx(), U = carObj.userData, t = st.t;
    neon.visible = grp.visible = fx;
    if (!fx) { lightsOff(); puffMat.uniforms.color.value.setHex(0xe9f3fb); return; }
    const bt = t / PARTY_BEAT, beat = Math.floor(bt), ph = bt - beat;
    const fade = Math.min(1, (st.len - t) / 1.2, t * 8);
    const col = COLS[Math.floor(beat / 2) % COLS.length], col2 = COLS[(Math.floor(beat / 2) + 2) % COLS.length];
    tmp.copy(col).lerp(col2, .5 + .5 * Math.sin(t * 6)); neonM.color.copy(tmp).multiplyScalar((1.2 + .9 * (1 - ph)) * fade);
    neon.scale.setScalar(1 + .15 * (1 - ph));
    U.headM.emissiveIntensity = beat % 2 === 0 ? st.head0 + 5 * (1 - ph) * fade : st.head0;
    U.amberM.emissiveIntensity = .5 + (beat % 2 ? 3 * fade : 0);
    st.red = beat % 2 ? 1.2 + 3.5 * (1 - ph) * fade : 1.2;
    carObj.updateMatrixWorld(); fwd.set(1, 0, 0).transformDirection(carObj.matrixWorld); side.set(0, 0, 1).transformDirection(carObj.matrixWorld); up.set(0, 1, 0).transformDirection(carObj.matrixWorld);
    vel.set(Math.cos(car.yaw) * car.v, 0, -Math.sin(car.yaw) * car.v);
    const gy = mode === "free" ? (free.gh || 0) : 0;
    grp.position.set(car.x, car.y + WHEEL, car.z);
    // удар: волна, залп, салют
    if (!st.hit) { st.hit = true; cannon(1, 1, COLS[0]); cannon(-1, -1, COLS[1]); cannon(1, -1, COLS[3]); cannon(-1, 1, COLS[4]); cpts.visible = true; SHOW.salute(car.x, car.y + 14, car.z, 4); }
    const tw = t < 2.4 ? t : t < 4.8 ? t - 2.4 : t - 4.8;          // волна — на каждом круге облёта
    if (t >= 2.4 && !st.w2) { st.w2 = true; SHOW.salute(car.x, car.y + 12, car.z, 3); } if (t >= 4.8 && !st.w3) { st.w3 = true; SHOW.salute(car.x, car.y + 16, car.z, 4); }
    waves.forEach((w, i) => { const k = Math.max(0, (tw - i * .45) / 1.4); w.visible = k > 0 && k < 1; w.scale.setScalar(2 + 46 * Math.sqrt(k)); w.position.y = gy - car.y - WHEEL + .15; w.material.opacity = .9 * (1 - k); });
    const hk = Math.min(1, t / 3), hf = Math.min(1, t * 4) * Math.max(0, 1 - Math.max(0, t - 6.2) / 1.3);
    holo.position.set(0, 2 + 6 * smooth(hk), 0); holo.quaternion.copy(camera.quaternion); holo.scale.setScalar((.6 + .4 * smooth(hk)) * (1 + .08 * (1 - ph)));
    holoM.opacity = hf * (.75 + .25 * Math.sin(t * 40) * Math.sin(t * 7));      // мерцает, как голограмма
    if (beat !== st.beat) { st.beat = beat; if (beat % 4 === 2 && st.len - t > 1.2) { const j = beat / 2; cannon(j % 2 ? 1 : -1, 1, COLS[j % COLS.length], 24); cannon(j % 2 ? -1 : 1, -1, COLS[(j + 2) % COLS.length], 24); cpts.visible = true; } }
    // дымовые струи в такт: первая половина доли — струя, чётная доля — вправо, нечётная — влево; цвет — по кругу
    if (ph < .55 && st.len - t > .9) {
      const sx = beat % 2 ? -1 : 1, c1 = COLS[beat % COLS.length], c2 = COLS[(beat + 3) % COLS.length];
      jet(1, sx, c1, dt); jet(-1, sx, c2, dt);
    }
  }
  return {
    start, stop, tick, get on() { return st.on; }, get red() { return st.red; },
    // замедление и облёт камеры — первые 3 с, если эффекты включены
    get slow() { const T = orbT(); return st.on && !st.calm && partyFx() && st.t < T ? .35 + .65 * smooth(Math.max(0, (st.t - T + .8) / .8)) : 1; },
    orbit: () => st.on && !st.calm && partyFx() && st.t < orbT() ? { t: st.t, a0: st.a0, T: orbT() } : null,
    ready: () => !st.on && performance.now() / 1000 - (st.end || -1e9) >= PARTY_COOL && (partyFx() || partyMus()),
    state: () => ({ on: st.on, t: st.t, len: st.len, fx: partyFx() }),
  };
})();

/* ---------- ряд машин на полигоне ---------- */
let levelObjs = [], rowSolids = [];
function buildLevel() {
  levelObjs.forEach(o => scene.remove(o)); levelObjs = [];
  row = []; let x = ROW0;
  for (let i = 0; i < L.cars; i++) { const m = MODELS[i % MODELS.length]; row.push({ ...m, x0: x, x1: x + m.len }); x += m.len + GAP; }
  rowSolids = row.map(c => ({ x0: c.x0, x1: c.x1, z0: TZ - 1, z1: TZ + 1, h: c.h, name: c.n }));
  row.forEach(c => {
    const g = new T.Group(), len = c.len;
    const lower = new T.Mesh(new T.BoxGeometry(len, c.h * .5, 1.9), mat(c.c, { roughness: .5 })); lower.position.y = c.h * .25 + .25; g.add(lower);
    const upper = new T.Mesh(new T.BoxGeometry(c.n === "тягач" ? len * .68 : len * .5, c.h * .45, 1.75), mat(c.n === "тягач" ? 0xc9cfdb : 0x2a3348, { roughness: .4 }));
    upper.position.set(c.n === "тягач" ? -len * .14 : -len * .05, c.h * .72 + .2, 0); g.add(upper);
    [-.32, .32].forEach(f => [.95, -.95].forEach(z => { const t = new T.Mesh(new T.CylinderGeometry(.36, .36, .26, 12), mat(0x0b0e17)); t.rotation.x = Math.PI / 2; t.position.set(len * f, .36, z); g.add(t); }));
    g.position.set((c.x0 + c.x1) / 2, 0, TZ); scene.add(g); levelObjs.push(g);
  });
  L.padX = L.pad ? row[row.length - 1].x1 + L.pad.off : null;
  if (L.padX != null) levelObjs.push(flat(L.pad.w, 8, new T.MeshBasicMaterial({ color: 0xffb347 }), L.padX + L.pad.w / 2, TZ, .05));
}

