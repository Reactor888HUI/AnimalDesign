// «Восьмёрка Баклажан» — режим «Фото», кино-повтор, под водой, PRO-разгоны.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- режим качества «Фото»: тени, вода с отражением, крашеная сталь моста, ночная подсветка ---------- */
// Включается в «⋯» → «Качество: фото» (тяжелее для телефона: сцена рисуется ещё раз для отражения и для теней).
// Тени — в квадрате ±140 м вокруг машины; вода — зеркальная камера + крупные волны (шум) + мелкая рябь (текстура
// пользователя, бесшовная, 256×256, по яркости); сталь ж/д моста — краска, потёки ржавчины, грязь у воды; ночью —
// тёплые прожекторы снизу и цепочки огней по аркам, башням и верхней ферме (видны и в отражении).
// данные: arcade/data/photos.js (фото пользователя и CC0-фактуры, вручную)
const PHOTO = (() => {
  const st = { on: false, forced: false, bm: null, lamps: null, recvAt: -1e9 };
  const NOISE = `
    float ph(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float pn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(ph(i), ph(i + vec3(1, 0, 0)), f.x), mix(ph(i + vec3(0, 1, 0)), ph(i + vec3(1, 1, 0)), f.x), f.y),
                 mix(mix(ph(i + vec3(0, 0, 1)), ph(i + vec3(1, 0, 1)), f.x), mix(ph(i + vec3(0, 1, 1)), ph(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`;
  const uNight = { value: 0 };
  let steelM = null;
  const texOf = (src, rep) => { const t = new T.TextureLoader().load(src); t.wrapS = t.wrapT = rep || T.RepeatWrapping; return t; };
  function steelMat() {
    const m = new T.MeshStandardMaterial({ vertexColors: true, roughness: .62, metalness: .3, envMap: carEnv.rt ? carEnv.rt.texture : null, envMapIntensity: .15 });
    const tMetal = { value: DARK_STEEL }, tConc = { value: texOf(PHOTO_CONC, T.MirroredRepeatWrapping) }, tWood = { value: texOf(PHOTO_WOOD) }, tGravel = { value: texOf(PHOTO_GRAVEL) };
    const cOf = h => ({ value: new T.Color(h) });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { uNight, tMetal, tConc, tWood, tGravel, cWood: cOf(0x4a3a2c), cBall: cOf(0x6a625b), cRail: cOf(0x3a3634) });
      sh.vertexShader = "varying vec3 vWP;\n" + sh.vertexShader.replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = "varying vec3 vWP; uniform float uNight; uniform sampler2D tMetal, tConc, tWood, tGravel; uniform vec3 cWood, cBall, cRail;\n" + NOISE +
        "\nfloat tri(sampler2D t, vec3 p, vec3 w) { return texture2D(t, p.zy).r * w.x + texture2D(t, p.xz).r * w.y + texture2D(t, p.xy).r * w.z; }" +
        "\nvec3 tri3(sampler2D t, vec3 p, vec3 w) { return texture2D(t, p.zy).rgb * w.x + texture2D(t, p.xz).rgb * w.y + texture2D(t, p.xy).rgb * w.z; }" +
        "\nfloat isC(vec3 a, vec3 b) { return step(length(a - b), .012); }\n" + sh.fragmentShader
        .replace("#include <color_fragment>", `#include <color_fragment>
          float wood = isC(vColor, cWood), ball = isC(vColor, cBall), rail = isC(vColor, cRail);       // путь узнаём по точному цвету вершин
          float grey = (1.0 - smoothstep(.1, .16, max(vColor.r, max(vColor.g, vColor.b)) - min(vColor.r, min(vColor.g, vColor.b)))) * (1.0 - ball) * (1.0 - rail);   // серые — сталь и бетон, цветное (огни, знаки) не трогаем
          float n1 = pn(vWP * 1.3), n2 = pn(vWP * 7.0), streak = smoothstep(.58, .92, pn(vec3(vWP.x * 2.1, vWP.y * .09, vWP.z * 2.1)));
          vec3 rust = vec3(.42, .24, .13), dirt = vec3(.30, .30, .28);
          diffuseColor.rgb *= mix(1.0, .85, grey) * (.88 + .16 * n1 + .06 * n2);                     // краска темнее и неровная — «старая» сталь
          vec3 nW = normalize(cross(dFdx(vWP), dFdy(vWP))), bw = abs(nW); bw /= bw.x + bw.y + bw.z; float flat_ = bw.y > .5 ? 1.0 : 0.0;
          // фактуры по трём проекциям: сталь (голубовато-серая) — листы с заклёпками, тайл 2,5 м; бетон (тёплый серый) — тайл 4 м
          float cool = smoothstep(-.005, .02, vColor.b - vColor.r), con = 2.0 * tri(tConc, vWP / 4.0, bw);
          vec3 metC = 2.0 * tri3(tMetal, vWP / 3.0, bw); float met = dot(metC, vec3(.333)); metC = max(mix(vec3(met), metC, 1.6), 0.0);   // рыжина ярче
          diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(con), metC, cool), .75 * grey);                // сталь — листы с заклёпками и рыжими потёками
          diffuseColor.rgb = mix(diffuseColor.rgb, tri3(tWood, vWP / 1.6, bw) * vec3(.24, .2, .17), wood);   // шпалы — пропитанное тёмное дерево
          diffuseColor.rgb = mix(diffuseColor.rgb, tri3(tGravel, vWP / 1.5, bw) * .75, ball);       // щебень
          diffuseColor.rgb = mix(diffuseColor.rgb, rust * (.8 + .4 * n2), streak * .1 * grey * (1.0 - .85 * flat_));   // тёмная сталь — рыжие потёки едва заметны
          diffuseColor.rgb = mix(diffuseColor.rgb, dirt, (1.0 - smoothstep(-1.0, 9.0, vWP.y)) * .45);   // грязь и мокрый след у воды`)
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n roughnessFactor = clamp(roughnessFactor * (.75 + .55 * pn(vWP * 2.3)) * (1.25 - .25 * met * cool) * (1.0 - .6 * rail), .2, 1.0);   // царапины на листах и катаные рельсы блестят")
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          // прожекторы: тёплый свет на фермы снизу вверх (настил не заливаем), опоры подсвечены от воды, верх башен — холодный
          float h = vWP.y, flood = smoothstep(10.4, 11.4, h) * exp(-(h - 11.0) / 22.0) + .7 * (1.0 - smoothstep(7.0, 9.6, h)), top = smoothstep(30.0, 60.0, h);
          totalEmissiveRadiance += uNight * grey * (vec3(1.0, .7, .4) * (.03 + .32 * flood) + vec3(.35, .55, 1.0) * .22 * top) * (.7 + .3 * n1);`);
    };
    return m;
  }
  // огни: маленькие светящиеся кубики по поясам арок, рёбрам башен и верхней ферме — одна сетка
  function makeLamps() {
    const R = RAILB, g = [], add = p => g.push(new T.BoxGeometry(.5, .5, .5).translate(p.x, p.y, p.z));
    const archY = (s, sa, sb) => { const u = (s - sa) / (sb - sa); return R.Y0 + R.ARCH * 4 * u * (1 - u) + .2; };   // на внешней грани пояса, не внутри балки
    for (const [sa, sb] of [[0, R.A1], [R.A2, R.L]]) for (let s = sa + 2; s < sb - 1; s += 3.2) for (const k of [-1, 1]) { const p = R.at(s, k * (R.HW + .95)); p.y = archY(s, sa, sb); add(p); }
    const TW = R.HW + 1.8;
    for (const a of [R.A1, R.A2]) for (const ds of [-3.6, 3.6]) for (const k of [-1, 1]) for (let y = R.Y0 + 2; y < R.Y0 + R.TOW; y += 3) { const p = R.at(a + ds * 1.2, k * (TW + .7)); p.y = y; add(p); }
    for (let s = R.A1 + 3; s < R.A2 - 3; s += 3.2) for (const k of [-1, 1]) { const p = R.at(s, k * (TW + .7)); p.y = R.Y0 + R.TOW - .2; add(p); }
    const m = new T.Mesh(mergeGeos(g), new T.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false })); m.userData.dyn = true; m.visible = false; scene.add(m); return m;
  }
  // небо по фото: рисуем на свой холст купола (та же развёртка, что у skyDome), солнце фото — туда, где солнце игры; ночью — прежнее небо
  // варианты: full — полусфера целиком (фото от зенита); иначе фото от 2° до top°, выше — переход к цвету зенита; sun — где солнце на фото (доля ширины)
  const SKIES = {
    sunset: [{ name: "панорама", src: PHOTO_SKY_SUNSET, full: true, sun: .57 },
             { name: "над рекой", src: PHOTO_SKY_RIVER, top: 28, sun: .36, edge: "rgb(83,96,153)", zen: "#1d2350" },
             { name: "над морем", src: PHOTO_SKY_SEA, top: 36, sun: .35, edge: "rgb(109,89,90)", zen: "#2a2238" }],
    day: [{ name: "облака", src: PHOTO_SKY_DAY, top: 38, sun: .25, edge: "rgb(66,90,138)", zen: "#173a78", glow: true }],
  };
  const SKY = { c: document.createElement("canvas"), key: null, tex: null, orig: skyDome.material.map };
  SKY.c.width = 2048; SKY.c.height = 1024; SKY.tex = new T.CanvasTexture(SKY.c); SKY.tex.encoding = T.sRGBEncoding;
  Object.values(SKIES).flat().forEach(v => { v.img = new Image(); v.img.onload = () => { SKY.key = null; }; v.img.src = v.src; });
  const skyOf = key => { const l = SKIES[key]; return l && l[(save.skyV || {})[key] % l.length || 0]; };
  function paintSky(key) {
    const v = skyOf(key), im = v && v.img, W = 2048, H = 1024, g = SKY.c.getContext("2d");
    if (!im || !im.complete || !im.naturalWidth) return false;
    const haze = "#" + TIMES[key].haze.toString(16).padStart(6, "0");
    g.fillStyle = haze; g.fillRect(0, 0, W, H);
    let phi = Math.atan2(SUN_DIR.z, -SUN_DIR.x); if (phi < 0) phi += Math.PI * 2;
    const su = phi / (Math.PI * 2) * W, sv = Math.acos(SUN_DIR.y) / Math.PI * H;
    const el = d => H / 2 * (1 - d / 90);                 // строка холста на высоте d° над горизонтом
    const x0 = ((su - v.sun * W) % W + W) % W;           // солнце фото — туда, где солнце игры
    if (v.full) [x0 - W, x0].forEach(x => g.drawImage(im, x, 0, W, el(2)));
    else {
      const y0 = el(v.top), zen = g.createLinearGradient(0, 0, 0, y0 + 2);
      zen.addColorStop(0, v.zen); zen.addColorStop(1, v.edge); g.fillStyle = zen; g.fillRect(0, 0, W, y0 + 2);
      [x0 - W, x0].forEach(x => g.drawImage(im, x, y0, W, el(2) - y0));
      const fade = g.createLinearGradient(0, y0, 0, y0 + 50); fade.addColorStop(0, v.edge); fade.addColorStop(1, v.edge.replace("rgb", "rgba").replace(")", ",0)")); g.fillStyle = fade; g.fillRect(0, y0, W, 50);
    }
    if (v.glow) [-W, 0, W].forEach(o => { const rg = g.createRadialGradient(su + o, sv, 0, su + o, sv, 120); rg.addColorStop(0, "rgba(255,252,240,.95)"); rg.addColorStop(.15, "rgba(255,250,235,.5)"); rg.addColorStop(1, "rgba(255,245,225,0)"); g.fillStyle = rg; g.fillRect(su + o - 120, sv - 120, 240, 240); });
    const low = g.createLinearGradient(0, el(10), 0, H / 2);  // у горизонта — дымка
    low.addColorStop(0, haze + "00"); low.addColorStop(.75, haze + "cc"); low.addColorStop(1, haze); g.fillStyle = low; g.fillRect(0, el(10), W, H / 2 - el(10));
    SKY.tex.needsUpdate = true; return true;
  }
  function nextSky() {                                   // «⋯» → «Небо»: следующий вариант для текущего времени суток
    const l = SKIES[TIME]; if (!l) return null;
    save.skyV = save.skyV || {}; save.skyV[TIME] = ((save.skyV[TIME] || 0) + 1) % l.length; persist(); SKY.key = null; return skyOf(TIME).name;
  }
  function sky(on) {
    let photo = false;
    if (on && SKIES[TIME]) { if (SKY.key !== TIME) { if (paintSky(TIME)) SKY.key = TIME; } photo = SKY.key === TIME; }
    const map = photo ? SKY.tex : SKY.orig;
    if (skyDome.material.map !== map) { skyDome.material.map = map; paintCarEnv(); }   // отражения в кузове — с того же неба
  }
  // вода
  const det = new T.TextureLoader().load(PHOTO_WATER_TEX); det.wrapS = det.wrapT = T.RepeatWrapping;
  const RT = new T.WebGLRenderTarget(1024, 512), vcam = new T.PerspectiveCamera(), texM = new T.Matrix4();
  const LOOK = {                                       // по времени суток: цвет толщи, свет, цвет блика
    sunset: { deep: 0x1d3b3a, shallow: 0x3f5f55, light: 1, spec: 0xffdb99 },
    day: { deep: 0x1f4044, shallow: 0x46695f, light: 1.1, spec: 0xfff6e8 },
    night: { deep: 0x050b10, shallow: 0x0b1820, light: .25, spec: 0x9fb4ff },
  };
  const waterM = new T.ShaderMaterial({
    uniforms: { ...WAKE.u, uTimeI: DON_WATER.userData.u.uTime, tRefl: { value: RT.texture }, tDet: { value: det }, texM: { value: texM }, uTime: { value: 0 }, uDeep: { value: new T.Color() }, uShallow: { value: new T.Color() }, uSpec: { value: new T.Color() }, uLight: { value: 1 }, uCam: { value: new T.Vector3() }, sunDir: { value: SUN_DIR } },
    vertexShader: "uniform mat4 texM; varying vec4 vR; varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vR = texM * w; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `uniform sampler2D tRefl, tDet; uniform float uTime, uLight, uTimeI; ${WAKE.glsl} uniform vec3 uDeep, uShallow, uSpec, uCam, sunDir; varying vec4 vR; varying vec3 vW;
      ${NOISE}
      vec3 detH(vec2 uv) { const float e = 1.0 / 256.0; float h = texture2D(tDet, uv).r; return vec3(texture2D(tDet, uv + vec2(e, 0.0)).r - h, texture2D(tDet, uv + vec2(0.0, e)).r - h, h); }
      void main() {
        vec2 q = mod(vW.xz, 512.0);                       // хэш шума теряет точность на больших координатах
        float dist = length(uCam - vW), fine = 1.0 - smoothstep(30.0, 160.0, dist), near = 1.0 - smoothstep(15.0, 220.0, dist);
        vec2 rip = vec2(pn(vec3(q * .22, uTime * .4)) - .5, pn(vec3(q.yx * .2, uTime * .37 + 7.0)) - .5) + fine * .5 * vec2(pn(vec3(q * 1.1, uTime)) - .5, pn(vec3(q.yx * 1.2, uTime + 3.0)) - .5);
        // мелкая рябь — текстура в двух масштабах, плывут в разные стороны (повтор не виден)
        vec3 d1 = detH(vW.xz * .045 + vec2(uTime * .013, uTime * .006)), d2 = detH(vec2(vW.z, -vW.x) * .071 - vec2(uTime * .008, -uTime * .011));
        rip += near * 2.2 * (d1.xy + d2.xy);
        vec3 im = impacts(vW.xz, uTimeI); rip += im.xy * 2.5;                         // кольца от ударов
        vec3 V = normalize(uCam - vW), N = normalize(vec3(rip.x * .35, 1.0, rip.y * .35));
        float fres = .04 + .96 * pow(1.0 - max(dot(V, N), 0.0), 5.0);
        vec4 r = texture2DProj(tRefl, vR + vec4(rip * .014 * vR.w, 0.0, 0.0));
        vec3 base = mix(uShallow, uDeep, clamp(length(uCam.xz - vW.xz) / 600.0, 0.0, 1.0));
        base += uShallow * near * .55 * pow(d1.z * d2.z, 2.0);                        // светлые прожилки ряби
        vec3 col = mix(base, r.rgb * .8, clamp(fres * .9 + .2, 0.0, .7));
        float sp = pow(max(dot(reflect(-sunDir, N), V), 0.0), 220.0) * step(0.0, sunDir.y);
        gl_FragColor = vec4(col + uSpec * sp * 2.2 * uLight, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
  });
  const swaps = [], clip = [new T.Plane(new T.Vector3(0, 1, 0), -.12)], bias = new T.Matrix4().set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1), tgt = new T.Vector3();
  function reflect() {                                   // как Reflector из примеров three.js: зеркальная камера, без косой плоскости отсечения
    const cp = camera.position; tgt.set(0, 0, -1).applyQuaternion(camera.quaternion).add(cp);
    vcam.copy(camera); vcam.position.set(cp.x, -cp.y + .08, cp.z); vcam.up.set(0, -1, 0); vcam.lookAt(tgt.x, -tgt.y + .08, tgt.z); vcam.updateMatrixWorld(); vcam.projectionMatrix.copy(camera.projectionMatrix);
    texM.copy(bias).multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse);
    swaps.forEach(o => o.visible = false); const fog = scene.fog; scene.fog = null;
    renderer.clippingPlanes = clip; renderer.setRenderTarget(RT); renderer.clear(); renderer.render(scene, vcam); renderer.setRenderTarget(null); renderer.clippingPlanes = [];
    swaps.forEach(o => o.visible = true); scene.fog = fog;
    const L = LOOK[TIME] || LOOK.sunset, u = waterM.uniforms;
    u.uCam.value.copy(cp); u.uTime.value = performance.now() / 1000; u.uDeep.value.setHex(L.deep); u.uShallow.value.setHex(L.shallow); u.uSpec.value.setHex(L.spec); u.uLight.value = L.light;
  }
  // кто отбрасывает и принимает тень: всё непрозрачное принимает; плоские слои земли, вода и огромные плоскости не отбрасывают
  function shadowFlags(on) {
    scene.traverse(o => {
      if (!o.isMesh || o === skyDome || o.material.transparent) return;
      o.receiveShadow = on;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      o.castShadow = on && o.material.depthWrite !== false && o.material !== waterM && o.material.name !== "don-water" && o.geometry.boundingSphere.radius < 400;
    });
  }
  function bridge(on) {                                  // сталь моста; после перестройки западной сцены — заново
    const ms = RAILB && RAILB.st.loaded ? RAILB.st.meshes : null;
    if (on && ms && st.bm !== ms[0]) { steelM = steelM || steelMat(); ms.forEach(m => { m.userData.mat0 = m.material; m.material = steelM; }); st.bm = ms[0]; }
    if (!on && ms && st.bm === ms[0]) ms.forEach(m => { if (m.userData.mat0) m.material = m.userData.mat0; });
    if (!on || !ms) st.bm = null;
    if (on && ms && !st.lamps) st.lamps = makeLamps();
    if (st.lamps) st.lamps.visible = on && !!ms && TIME !== "day";
  }
  function enable(on) {
    st.on = on;
    renderer.shadowMap.enabled = on; renderer.shadowMap.type = T.PCFSoftShadowMap;
    sun.castShadow = on; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0005; sun.shadow.normalBias = .04;
    const sc = sun.shadow.camera; sc.left = sc.bottom = -140; sc.right = sc.top = 140; sc.near = 10; sc.far = 1400; sc.updateProjectionMatrix();
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    scene.add(sun.target);
    if (!on) { sun.target.position.set(0, 0, 0); sun.position.copy(SUN_DIR).multiplyScalar(400); }
    shadowFlags(on); bridge(on); sky(true);
    swaps.length = 0;
    scene.traverse(o => { if (o.isMesh && (o.material.name === "don-water" || o.material === waterM)) { o.userData.w0 = o.userData.w0 || o.material; o.material = on ? waterM : o.userData.w0; swaps.push(o); } });
  }
  function tick() {
    const want = st.forced || save.quality === "photo";
    if (want !== st.on) enable(want);
    sky(true);                                             // небо по фото — при любом качестве (это одна текстура купола)
    if (!st.on) return;
    if (performance.now() - st.recvAt > 1500) {            // новые сцены, суда, поток машин — раз в 1,5 с
      st.recvAt = performance.now(); shadowFlags(true);
      swaps.length = 0; scene.traverse(o => { if (o.isMesh && (o.material.name === "don-water" || o.material === waterM)) { o.userData.w0 = o.userData.w0 || o.material; o.material = waterM; swaps.push(o); } });
    }
    bridge(true); sky(true);
    uNight.value = { sunset: .35, day: 0, night: 1 }[TIME] || 0;
    if (st.lamps) st.lamps.material.color.setHex(TIME === "night" ? 0xffd9a0 : 0x8a7457);
    sun.target.position.set(Math.round(car.x / 8) * 8, 0, Math.round(car.z / 8) * 8);       // квадрат теней едет за машиной ступеньками — тени не дрожат
    sun.position.copy(SUN_DIR).multiplyScalar(600).add(sun.target.position);
    reflect();
  }
  return { tick, RT, waterM, st, nextSky, skyName: () => SKIES[TIME] ? skyOf(TIME).name : null, get on() { return st.on; }, force(on) { st.forced = on; } };
})();
/* ---------- кино-повтор трюков у ж/д моста ---------- */
// В полёте камера не скачет — играть удобно. После трюка у моста (бочка, штопор или полёт дольше 1,5 с) сам запускается
// повтор в замедлении: монтаж планов по 1,4 с — с воды у опоры, с крыши башни, изнутри фермы, телеобъектив, дрон, с арки,
// из-под пролёта. «Пропустить» — сразу назад в игру. Отключается: «⋯» → «Кино-повтор у моста».
const KINO = (() => {
  const st = { shot: null, t: 0, last: null, bars: null, prev: new T.Vector3(), vel: new T.Vector3() };
  const L = new T.Vector3(), SHOT = 1.4;
  function barsOn(on) {
    if (!st.bars) { st.bars = document.createElement("div"); st.bars.className = "kino-bars"; stage.appendChild(st.bars); }
    st.bars.classList.toggle("on", on); stage.classList.toggle("kino", on);   // в кадре — без спидометра и карты
  }
  // f(R, s, l, dir, side, t, a0) → [x, y, z, fov] или null (план сюда не подходит). Большинство планов — крупные, «привязаны» к машине
  // (камера летит вместе с ней: спереди навстречу, снизу на фоне неба, сбоку у колеса); общие — чтобы мост был огромным
  // (низко с воды и длинный объектив). План, в котором машину загораживают фермы или дома, не берётся; загородило по ходу — смена плана
  const H = new T.Vector3(), Sd = new T.Vector3();
  const rel = (ahead, side, up, fov) => [car.x + H.x * ahead + Sd.x * side, car.y + up, car.z + H.z * ahead + Sd.z * side, fov];
  const SHOTS = [
    { name: "навстречу", w: 3, move: 1, f: (R, s, l, dir, side, t) => rel(8.5 - 2.6 * t, 1.6 * side, -.6 + .5 * t, 42) },
    { name: "снизу, на фоне неба", w: 2, move: 1, f: (R, s, l, dir, side, t) => car.y < 4 ? null : rel(4.6 - 1.2 * t, 2.4 * side, -2.6, 64) },
    { name: "сбоку крупно", w: 2, move: 1, f: (R, s, l, dir, side, t) => rel(2.4 - 3.4 * t, 5.2 * side, .25, 38) },
    { name: "у колеса", w: 2, move: 1, f: (R, s, l, dir, side, t) => rel(1.9 - .6 * t, 2.5 * side, -.15, 72) },
    { name: "сверху", w: 1, move: 1, f: (R, s, l, dir, side, t) => rel(1.5 + t, .8 * side, 7.5 - t, 50) },
    { name: "облёт", w: 2, move: 1, f: (R, s, l, dir, side, t, a0) => { const a = Math.atan2(H.z, H.x) + side * (.5 + t * 1.1); return [car.x + Math.cos(a) * 6.2, car.y + 1.2 + .5 * t, car.z + Math.sin(a) * 6.2, 50]; } },
    { name: "с воды у опоры", w: 1, f: (R, s, l, dir, side) => { const pr = [0, R.A1, R.A2, R.L].reduce((a, b) => Math.abs(b - s) < Math.abs(a - s) ? b : a); if (Math.abs(pr - s) > 70) return null; const p = R.at(pr + dir * 6, side * (R.HW + 15), 1.4); return [p.x, p.y, p.z, 52]; } },
    { name: "телеобъектив с реки", w: 1, f: (R, s, l, dir, side) => { const p = R.at(s + dir * 30, side * 120, 2.5); return [p.x, p.y, p.z, 20]; } },
    { name: "из-под пролёта", w: 1, f: (R, s, l, dir, side) => { if (R.st.y < 12 || car.y > R.Y0 + R.st.y - 2) return null; const p = R.at((R.A1 + R.A2) / 2 - dir * 20, -side * 3, R.Y0 + R.st.y - 3); return [p.x, p.y, p.z, 66]; } },
  ];
  const near = (x, z) => { const R = RAILB; if (!R || !R.st.loaded) return false; const [s, l] = R.loc(x, z); return s > -60 && s < R.L + 60 && Math.abs(l) < 70; };
  // видно ли машину: идём по лучу от камеры к машине, всё твёрдое (фермы, башни, дома, земля) — помеха
  const clear = p => { const dx = car.x - p[0], dy = car.y + .5 - p[1], dz = car.z - p[2], d = Math.hypot(dx, dy, dz);
    if (p[1] < terrainH(p[0], p[2]) + .3 && !waterAt(p[0], p[2])) return false;
    for (let u = .3; u < d - 2.2; u += .35) { const k = u / d, x = p[0] + dx * k, y = p[1] + dy * k, z = p[2] + dz * k;
      if (hitSolid(x, z, y) || y < terrainH(x, z) - .2) return false;
      const gh = groundAt(x, z, y + .7).h; if (gh > y - .25 && gh < y + .7) return false; }       // сквозь настил, крышу или палубу
    return true; };
  function heading() {
    const v = Math.hypot(st.vel.x, st.vel.z); if (v > 2) H.set(st.vel.x / v, 0, st.vel.z / v); else H.set(Math.cos(car.yaw), 0, -Math.sin(car.yaw));
    Sd.set(-H.z, 0, H.x);
  }
  function cut(R) {
    heading();
    const [s, l] = R.loc(car.x, car.z), dir = (st.vel.x * R.dir.x + st.vel.z * R.dir.z) >= 0 ? 1 : -1, side = (st.cuts = (st.cuts || 0) + 1) % 2 ? 1 : -1;
    const ok = SHOTS.filter(sh => sh !== st.last && (() => { const p = sh.f(R, s, l, dir, side, 0, 0); return p && clear(p) && (!sh.move || clear(sh.f(R, s, l, dir, side, SHOT * .7, 0))); })());
    if (!ok.length) return;
    let r = Math.random() * ok.reduce((a, sh) => a + sh.w, 0), sh = ok[0]; for (const q of ok) { r -= q.w; if (r <= 0) { sh = q; break; } }
    st.shot = { sh, a0: 0, p: sh.f(R, s, l, dir, side, 0, 0), g: { s, l, dir, side } }; st.t = 0; st.last = sh;
  }
  function cam(dt) {                                     // повтор: вызывается вместо камеры повтора
    const R = RAILB; if (!R || !R.st.loaded) return false;
    if (dt > 0) { st.vel.subVectors(L.set(car.x, car.y, car.z), st.prev).divideScalar(dt); } st.prev.set(car.x, car.y, car.z);
    if (!st.shot || st.t > SHOT || (st.shot.sh.move && st.t > .25 && !st.ok)) cut(R);
    if (!st.shot) return false;
    st.t += dt; barsOn(true);
    const sh = st.shot, g = sh.g; if (sh.sh.move) heading();
    const p = (sh.sh.move && sh.sh.f(R, g.s, g.l, g.dir, g.side, st.t, sh.a0)) || sh.p;
    st.ok = !sh.sh.move || clear(p);
    camera.position.set(p[0], p[1], p[2]); camera.up.set(0, 1, 0);
    L.set(car.x + st.vel.x * .06, car.y + .45, car.z + st.vel.z * .06); camera.lookAt(L);
    camera.fov = sh.sh.move ? p[3] : Math.max(10, Math.min(p[3], 2 * Math.atan(4.5 / camera.position.distanceTo(L)) / DEG));   // общий план: зум держит машину крупно (кадр ~9 м)
    return true;
  }
  function end() { st.shot = null; st.last = null; barsOn(false); }
  return { cam, end, near, clear, get shot() { return st.shot ? st.shot.sh.name : null; } };
})();
/* ---------- под водой: дно, поверхность снизу, бирюзовый туман, приглушённый звук ---------- */
const UNDER = (() => {
  const bed = new T.Mesh(new T.PlaneGeometry(WORLD.x1 - WORLD.x0 + 400, WORLD.z1 - WORLD.z0 + 400).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ color: 0x34452f }));
  bed.position.set((WORLD.x0 + WORLD.x1) / 2, -7.6, (WORLD.z0 + WORLD.z1) / 2); bed.visible = false; bed.userData.dyn = true; scene.add(bed);
  const top = new T.Mesh(new T.PlaneGeometry(400, 400).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ color: 0x5fb6ae, transparent: true, opacity: .85, fog: false }));
  top.visible = false; top.userData.dyn = true; scene.add(top);
  const cover = new T.Mesh(new T.CircleGeometry(9, 28).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x2f7f8f, transparent: true, opacity: .6, depthWrite: false }));
  cover.renderOrder = 8; cover.visible = false; cover.userData.dyn = true; scene.add(cover);   // машина под водой, камера над водой: вода закрывает её
  const st = { on: false, keep: null };
  function set(on) {
    st.on = on; bed.visible = top.visible = on; skyDome.visible = !on; $("underwater").hidden = !on; sfx.under(on);
    if (on) { st.keep = [scene.fog.color.getHex(), scene.fog.near, scene.fog.far, scene.background.getHex()]; scene.fog.color.setHex(0x1f5a5c); scene.fog.near = 2; scene.fog.far = 46; scene.background.setHex(0x1f5a5c); }
    else if (st.keep) { const [c, n, f, b] = st.keep; scene.fog.color.setHex(c); scene.fog.near = n; scene.fog.far = f; scene.background.setHex(b); }
  }
  return { tick() { const p = camera.position, on = p.y < .03 && (phase === "fsink" || !!waterAt(p.x, p.z)); if (on !== st.on) set(on); if (on) top.position.set(p.x, .03, p.z);
    cover.visible = !on && mode === "free" && phase === "fsink" && car.y < .2; if (cover.visible) { cover.position.set(car.x, .06, car.z); cover.material.opacity = Math.min(.92, .35 - car.y * .2); } }, get on() { return st.on; } };
})();
// у домов Ростова настоящий контур: сначала грубая рамка, потом точка в многоугольнике или ближе pad к стене
const inBox = (b, x, z, pad) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad &&
  (!b.rings || inRings(x, z, b.rings) || (b.outer || b.rings).some(r => lineDist(x, z, r, true) < pad));   // outer — без края проёма (Арена)

/* ---------- PRO «Бесконечный Безлимит»: баклажановые разгоны ---------- */
// Видны и работают только в режиме PRO: дорожки перед трамплинами и на крышах больших домов, кольца над домами.
// Наехали на дорожку — скорость 50 м/с; пролетели сквозь кольцо — разгон в полёте.
const BOOSTS = [], proGroup = new T.Group();
proGroup.visible = false; proGroup.userData.dyn = true; scene.add(proGroup);
(() => {
  const ok = (x, z, y) => !waterAt(x, z) && !solidsNear(x, z).some(b => b.h > y + .5 && inBox(b, x, z, 1));
  kickers.forEach(k => { const x = k.x - k.fx * 11, z = k.z - k.fz * 11, y = k.y0 || 0; if (ok(x, z, y)) BOOSTS.push({ kind: "pad", x, z, y, yaw: k.yaw }); });
  // крыши: дорожка-разгон там, где помещается 8×5 м; кольца — над каждым третьим домом повыше. Не больше 40 и 40.
  const big = solids.filter(b => b.rings && !b.arena && b.h >= 5 && b.h <= 45 && b.x1 - b.x0 > 10 && b.z1 - b.z0 > 10);
  let nPad = 0, nRing = 0;
  big.forEach((b, i) => {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, yaw0 = b.x1 - b.x0 > b.z1 - b.z0 ? 0 : Math.PI / 2;
    if (i % 3 === 0 && nRing < 40 && inRings(cx, cz, b.rings)) { nRing++; BOOSTS.push({ kind: "ring", x: cx, z: cz, y: b.h + 11, yaw: (i * 1.7) % Math.PI }); }
    if (nPad >= 40 || (b.pad && Math.hypot(b.pad.x - cx, b.pad.z - cz) < 9)) return;
    const fx = Math.cos(yaw0), fz = -Math.sin(yaw0);
    const fits = [[-4.5, -3], [4.5, -3], [4.5, 3], [-4.5, 3], [0, 0]].every(([u, w]) => inRings(cx + fx * u - fz * w, cz + fz * u + fx * w, b.rings));
    if (fits && !solidsNear(cx, cz).some(o => o !== b && o.h > b.h && inBox(o, cx, cz, 1))) { nPad++; BOOSTS.push({ kind: "pad", x: cx, z: cz, y: b.h, yaw: i % 2 ? yaw0 : yaw0 + Math.PI }); }
  });
  const tex = (() => { const c = document.createElement("canvas"); c.width = 128; c.height = 192; const g = c.getContext("2d");
    g.fillStyle = "#2a1140"; g.fillRect(0, 0, 128, 192); g.strokeStyle = "#ff4fd8"; g.lineWidth = 6; g.shadowColor = "#ff4fd8"; g.shadowBlur = 14; g.strokeRect(6, 6, 116, 180);
    g.strokeStyle = "#c58cff"; g.lineWidth = 12; g.lineCap = "round"; for (let i = 0; i < 3; i++) { const y = 150 - i * 48; g.beginPath(); g.moveTo(24, y); g.lineTo(64, y - 34); g.lineTo(104, y); g.stroke(); }
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t; })();
  const padGeo = [], ringGeo = [], pg = new T.PlaneGeometry(4.5, 7).rotateX(-Math.PI / 2), tg = new T.TorusGeometry(3.6, .34, 5, 20);
  BOOSTS.forEach(o => {
    if (o.kind === "pad") padGeo.push(pg.toNonIndexed().applyMatrix4(M4(o.x, o.y + .06, o.z, o.yaw - Math.PI / 2)));
    else [0, Math.PI / 2].forEach(a => ringGeo.push(tg.toNonIndexed().applyMatrix4(M4(o.x, o.y, o.z, o.yaw + a))));   // два кольца крест-накрест — видно с любой стороны
    o.t = -9;
  });
  if (padGeo.length) proGroup.add(new T.Mesh(mergeGeos(padGeo), new T.MeshBasicMaterial({ map: tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })));
  if (ringGeo.length) proGroup.add(new T.Mesh(mergeGeos(ringGeo), new T.MeshBasicMaterial({ color: 0xc552ff, toneMapped: false })));
})();
function proBoost(airborne) {
  for (const o of BOOSTS) {
    if (time - o.t < 1.5) continue;
    const hit = o.kind === "pad" ? !airborne && Math.abs(car.y - o.y) < 1.5 && Math.hypot(car.x - o.x, car.z - o.z) < 3.6
      : Math.hypot(car.x - o.x, car.y + .6 - o.y, car.z - o.z) < 3.8;
    if (!hit) continue;
    o.t = time; car.v = Math.max(car.v, 50); if (free.proA) free.proA.boost = 2.5;
    free.score += 50; save.freeBest = Math.max(save.freeBest, free.score); persist();
    for (let i = 0; i < 10; i++) puff(new T.Vector3(car.x, car.y + .5, car.z), new T.Vector3((Math.random() - .5) * 6, 2 + Math.random() * 3, (Math.random() - .5) * 6), .6, .35);
    sfx.whoosh(); queueToast("🍆 Баклажановый разгон!  +50", "good", 1100);
  }
}

