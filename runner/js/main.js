(async function (R) {
  const C = R.C, input = R.input, au = R.audio;
  const $ = id => document.getElementById(id);
  const coarse = input.touch;

  // ---- renderer / scene / camera ---------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: !coarse, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1b2342, 0.012);
  const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 320);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = !coarse;
  const sm = coarse ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera;
  sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 170;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target);

  const buddyLight = new THREE.PointLight(0xffe2b0, 0, 12, 1.4);
  scene.add(buddyLight);
  const lampLights = [0, 1].map(() => { const l = new THREE.PointLight(0xffb468, 0, 22, 2); scene.add(l); return l; });

  // ---- sky: clouds by day, the moon at night (they ride along with the camera, far away) -----
  const sky = new THREE.Group();
  scene.add(sky);
  const clouds = [];
  {
    const rnd = R.rng(31), tex = R.cloudTexture();
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.75 + rnd() * 0.2 }));
      const w = 60 + rnd() * 70;
      s.scale.set(w, w * 0.42, 1);
      s.userData = { a: rnd() * Math.PI * 2, r: 190 + rnd() * 60, y: 55 + rnd() * 50, op: s.material.opacity };
      sky.add(s); clouds.push(s);
    }
  }
  // stars on the dome (they fade in at dusk)
  const stars = (() => {
    const rnd = R.rng(99), pos = [];
    for (let i = 0; i < 700; i++) {
      const a = rnd() * Math.PI * 2, e = 0.1 + Math.pow(rnd(), 1.8) * 1.3, r = 260;   // more of them low, where the camera looks
      pos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
    m.renderOrder = -5; m.frustumCulled = false;
    sky.add(m);
    return m;
  })();
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: R.glowTexture(), color: 0xe6eeff, transparent: true, depthWrite: false, fog: false }));
  moon.scale.set(34, 34, 1); moon.material.transparent = true; moon.position.set(-150, 150, -160);
  sky.add(moon);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: R.glowTexture(), color: 0xfff1c8, transparent: true, depthWrite: false, fog: false }));
  sunGlow.scale.set(70, 70, 1);
  sky.add(sunGlow);

  // ---- skyline: two rings of far-off houses on the horizon, so a long street never ends in a void ----
  const skyline = [];
  for (const [rad, h, seed, lo, hi] of [[275, 56, 7, 0.22, 0.9], [235, 36, 12, 0.18, 0.75]]) {
    const geo = new THREE.CylinderGeometry(rad, rad, h, 72, 1, true);
    geo.translate(0, h / 2 - 4, 0);
    const t = R.skylineTextures(seed, lo, hi);
    t.body.repeat.x = t.win.repeat.x = 3;
    const body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t.body, transparent: true, depthWrite: false, fog: false, side: THREE.BackSide, toneMapped: false }));
    const win = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t.win, transparent: true, depthWrite: false, fog: false, side: THREE.BackSide, toneMapped: false, blending: THREE.AdditiveBlending }));
    body.renderOrder = win.renderOrder = -3 + skyline.length;
    body.frustumCulled = win.frustumCulled = false;
    sky.add(body, win);
    skyline.push({ body, win });
  }

  // ---- dust in the air: tiny motes drifting round the camera, they catch the low sun ----------
  const motes = (() => {
    const N = 260, pos = new Float32Array(N * 3), rnd = R.rng(77);
    for (let i = 0; i < N; i++) { pos[i * 3] = (rnd() - 0.5) * 36; pos[i * 3 + 1] = rnd() * 7; pos[i * 3 + 2] = (rnd() - 0.5) * 36; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffe2b0, map: R.glowTexture(), size: 4, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));   // a few pixels at any distance (no big squares right at the lens)
    m.frustumCulled = false; m.renderOrder = 5;
    scene.add(m);
    return m;
  })();

  // ---- post-processing: bloom (lamps, windows, sparks glow), colour grade and vignette ---------
  const GRADE = {
    uniforms: { tDiffuse: { value: null }, uSat: { value: 1 }, uVib: { value: 0 }, uContrast: { value: 1 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uShadow: { value: new THREE.Vector3(1, 1, 1) }, uHigh: { value: new THREE.Vector3(1, 1, 1) }, uVig: { value: 0.2 },
      // god rays: the sun's place on the screen, strength, colour, number of samples, aspect
      uSunUV: { value: new THREE.Vector2(0.5, 0.8) }, uRays: { value: 0 }, uRayCol: { value: new THREE.Color(1, 0.8, 0.6) }, uRayN: { value: 20 }, uAspect: { value: 1 }, uRayT: { value: 0.4 }, uSpeed: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uSat, uVib, uContrast, uVig; uniform vec3 uTint, uShadow, uHigh; varying vec2 vUv;
      uniform vec2 uSunUV; uniform float uRays, uRayN, uAspect, uRayT, uSpeed; uniform vec3 uRayCol;
      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        // super speed: the edges of the picture smear outwards from the middle (the centre, where the dog
        // is, stays sharp, so it does not make anyone dizzy)
        if (uSpeed > 0.01) {
          vec2 dc = vUv - vec2(0.5, 0.55);
          float e = smoothstep(0.18, 0.62, length(dc * vec2(uAspect, 1.0) / uAspect));
          vec3 acc = c;
          for (int i = 1; i < 7; i++) acc += texture2D(tDiffuse, vUv - dc * float(i) * 0.012 * uSpeed * e).rgb;
          c = mix(c, acc / 7.0, e);
        }
        // god rays: march from this pixel towards the sun and gather the bright sky on the way; houses,
        // trees and the far skyline in between are dark, so they cut the light into beams
        if (uRays > 0.003) {
          vec2 dir = uSunUV - vUv;
          float dist = length(dir * vec2(uAspect, 1.0));
          vec2 stepv = dir / uRayN * 0.85;
          float jit = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
          vec2 uv = vUv + stepv * jit;
          float acc = 0.0, decay = 1.0;
          for (int i = 0; i < 24; i++) {
            if (float(i) >= uRayN) break;
            uv += stepv;
            vec3 sm = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb;
            acc += max(0.0, dot(sm, vec3(0.3, 0.59, 0.11)) - uRayT) * decay;   // only what is brighter than the sky round it
            decay *= 0.965;
          }
          acc /= uRayN;
          c += min(vec3(0.6), uRayCol * acc * uRays * 8.0 * (1.0 - smoothstep(0.1, 1.5, dist)));
        }
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        // vibrance: dull colours gain more saturation than already bright ones (no garish skin/sky)
        float s = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
        c = mix(vec3(l), c, uSat + uVib * (1.0 - s));
        c = (c - 0.5) * uContrast + 0.5;
        // split toning: shadows and highlights get their own tint
        c *= uTint * mix(uShadow, uHigh, smoothstep(0.08, 0.75, l));
        vec2 d = (vUv - 0.5) * vec2(1.0, 0.8);
        c *= mix(1.0 - uVig, 1.0, smoothstep(0.75, 0.2, length(d)));
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`,
  };
  let composer = null, bloomPass = null, gradePass = null;
  function makeComposer() {
    if (!THREE.EffectComposer || !THREE.UnrealBloomPass) return;
    const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    // anti-aliasing inside the composer needs WebGL2 multisampling (desktop)
    const rt = renderer.capabilities.isWebGL2 && !coarse && THREE.WebGLMultisampleRenderTarget
      ? new THREE.WebGLMultisampleRenderTarget(sz.x, sz.y, { format: THREE.RGBAFormat }) : undefined;
    composer = new THREE.EffectComposer(renderer, rt);
    if (!rt) composer.setPixelRatio(renderer.getPixelRatio());
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(sz.x, sz.y), 0.5, 0.5, 0.8);
    composer.addPass(bloomPass);
    gradePass = new THREE.ShaderPass(GRADE);
    composer.addPass(gradePass);
    sizeComposer();
  }
  function sizeComposer() {
    if (!composer) return;
    if (composer.renderTarget1.isWebGLMultisampleRenderTarget) {
      const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
      composer.setSize(sz.x, sz.y);
    } else composer.setSize(innerWidth, innerHeight);
  }
  function applyPost(T) {
    if (!bloomPass || !T.bloom) return;
    bloomPass.strength = T.bloom[0]; bloomPass.radius = T.bloom[1]; bloomPass.threshold = T.bloom[2];
    const g = T.grade, u = gradePass.uniforms;
    u.uSat.value = g.sat; u.uVib.value = g.vib || 0; u.uContrast.value = g.contrast; u.uTint.value.set(g.tint[0], g.tint[1], g.tint[2]); u.uVig.value = g.vig;
    const sh = g.shadow || [1, 1, 1], hi = g.high || [1, 1, 1];
    u.uShadow.value.set(sh[0], sh[1], sh[2]); u.uHigh.value.set(hi[0], hi[1], hi[2]);
  }
  let postOn = !/[?&]nopost/.test(location.search);
  try { makeComposer(); } catch (e) { console.warn('[runner] post-processing off', e); composer = null; }

  // ---- time of day ---------------------------------------------------------------------------
  // auto: day -> sunset -> night -> dawn, a few minutes each round; or a fixed time picked with the button
  let themeLocked = false, mode0 = 'auto';
  try { mode0 = localStorage.getItem('runner-theme') || 'auto'; } catch (e) {}
  const daytime = new R.DayTime(mode0);
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 2; skyCanvas.height = 256;
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  scene.background = skyTex;
  let skyKey = '', heavyT = 0;
  function drawSky(T) {
    const key = T.skyTop + T.skyMid + T.horizon;
    if (key === skyKey) return;
    skyKey = key;
    const g = skyCanvas.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, T.skyTop); gr.addColorStop(0.32, T.skyMid); gr.addColorStop(0.52, T.horizon); gr.addColorStop(1, T.horizon);
    g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
    skyTex.needsUpdate = true;
  }
  // everything that follows the time of day; `heavy` (a few times a second) also does the slow parts
  function applyLive(T, heavy) {
    R.applyMaterialTheme(T);
    scene.fog.color.setHex(T.fog); scene.fog.density = T.fogDensity;
    hemi.color.setHex(T.hemiSky); hemi.groundColor.setHex(T.hemiGround); hemi.intensity = T.hemiI;
    sun.color.setHex(T.sunColor); sun.intensity = T.sunI;
    renderer.toneMappingExposure = T.exposure;
    for (const c of clouds) { c.visible = T.cloudK > 0.02; c.material.opacity = c.userData.op * T.cloudK; c.material.color.setHex(T.cloudCol); }
    skyline.forEach((l, i) => {
      // the far ring is lost in the haze more than the near one
      const sl = T.skyline[i];
      l.body.material.color.setHex(T.fog).lerp(skylineCol.setHex(sl[0]), sl[1]);
      l.win.visible = sl[2] > 0.01; l.win.material.opacity = sl[2];
    });
    moon.visible = stars.visible = T.starK > 0.02;
    moon.material.opacity = stars.material.opacity = T.starK;
    sunGlow.visible = T.starK < 0.98;
    sunGlow.material.opacity = 1 - T.starK; sunGlow.material.color.setHex(T.sunGlowCol); sunGlow.scale.set(T.sunGlowS, T.sunGlowS, 1);
    { const o = T.sunOffset, l = Math.hypot(o[0], o[1], o[2]); sunGlow.position.set(o[0] / l * 240, o[1] / l * 240, o[2] / l * 240); }
    applyPost(T);
    // wet streets: how wet, the lamps' share, the low sun's glare path and the sky's sheen
    const W = R.wet;
    W.uWet.value = window.__quality === 0 ? 0 : T.wet;      // the lowest quality skips it (slow phones)
    W.uLampK.value = T.lampK; W.uGlare.value = T.sunGlare;
    { const o = T.sunOffset, l = Math.hypot(o[0], o[1], o[2]); W.uSunDir.value.set(o[0] / l, o[1] / l, o[2] / l); }
    // the sheen: the sky by day; at night the glow of the city (warmer, brighter than the dark fog)
    W.uSunCol.value.setHex(T.sunGlowCol); W.uSky.value.setHex(T.fog).multiplyScalar(0.5).add(skyGlow.copy(W.uLampCol.value).multiplyScalar(0.12 * T.lampK));   // kept under the glow threshold
    if (heavy) {
      drawSky(T);
      scene.traverse(o => { if (o.material && o.material.userData && o.material.userData.env) o.material.envMapIntensity = T.envI; });
      document.documentElement.dataset.theme = T.lampK > 0.5 ? 'night' : 'day';
    }
  }
  let superHinted = false, noBoostT = 0;
  const now0 = () => performance.now();
  const skylineCol = new THREE.Color(), skyGlow = new THREE.Color(), lampDir = new THREE.Vector3();
  const rayV = new THREE.Vector3(), rayD = new THREE.Vector3(), rayP = new THREE.Vector3();
  const TOD_NAMES = { auto: 'авто (день, закат, ночь, рассвет)', day: 'день', sunset: 'закат', night: 'ночь' };
  function showMode() {
    const b = $('themeBtn');
    b.dataset.tod = daytime.mode;
    b.setAttribute('aria-label', 'Время суток: ' + TOD_NAMES[daytime.mode] + '. Переключить');
  }
  // tests and modes: set a time of day at once
  function setTheme(name, keep) {
    daytime.set(name === 'auto' || R.THEMES[name] ? name : 'night', true);
    applyLive(daytime.update(0), true);
    showMode();
    if (!keep) try { localStorage.setItem('runner-theme', daytime.mode); } catch (e) {}
  }
  const toggleTheme = () => {
    if (themeLocked) return;
    daytime.set(daytime.next());
    showMode();
    try { localStorage.setItem('runner-theme', daytime.mode); } catch (e) {}
    try { ctx.say('Время суток: ' + TOD_NAMES[daytime.mode]); } catch (e) {}
  };
  $('themeBtn').addEventListener('click', toggleTheme);
  input.onTheme = toggleTheme;

  // ---- sound -----------------------------------------------------------------------------
  const unlock = () => au.start();
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev => addEventListener(ev, unlock, { passive: true }));
  const muteBtn = $('muteBtn');
  // three states: sound and music -> sound only -> silence -> ...
  const music = R.music;
  const showMute = () => {
    muteBtn.setAttribute('aria-pressed', String(au.muted));
    muteBtn.dataset.music = String(!au.muted && music.on);
    muteBtn.setAttribute('aria-label', au.muted ? 'Звук выключен. Включить звук и музыку' : music.on ? 'Звук и музыка. Выключить музыку' : 'Только звук. Выключить всё');
  };
  muteBtn.addEventListener('click', () => {
    au.start();
    if (au.muted) { au.setMuted(false); music.setOn(true); }
    else if (music.on) music.setOn(false);
    else au.setMuted(true);
    showMute();
    try { ctx.say(au.muted ? 'Тишина' : music.on ? 'Звук и музыка' : 'Только звук, без музыки'); } catch (e) {}
  });
  addEventListener('keydown', e => { if (e.code === 'KeyM' && !e.repeat) { au.start(); music.setOn(!music.on); showMute(); try { ctx.say(music.on ? 'Музыка включена' : 'Музыка выключена'); } catch (er) {} } });
  showMute();
  $('menuBtn').addEventListener('click', () => { location.hash = ''; location.reload(); });

  // ---- menu: which dog -------------------------------------------------------------------
  const loadText = $('loadText');
  let assetsDone = 0, assetsTotal = 1;
  const assetsReady = R.assets.load((d, n) => { assetsDone = d; assetsTotal = n; loadText.textContent = 'Город ' + d + ' / ' + n; });

  let modeName = location.hash.slice(1);
  if (!R.modes[modeName]) {
    const menu = $('menu');
    menu.hidden = false;
    $('loading').classList.add('hide');
    modeName = await new Promise(res => {
      menu.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => res(b.dataset.mode)));
    });
    menu.hidden = true;
    $('loading').classList.remove('hide');
  }
  history.replaceState(null, '', '#' + modeName);
  const mode = R.modes[modeName];
  document.body.classList.add('mode-' + modeName);
  document.title = mode.title;
  loadText.textContent = assetsDone >= assetsTotal ? 'Собака…' : loadText.textContent;
  // soft reflections for shiny materials (the whippet's coat)
  if (THREE.RoomEnvironment) {
    const pm = new THREE.PMREMGenerator(renderer);
    R.envTexture = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    pm.dispose();
  }
  await Promise.all([assetsReady, mode.load()]);

  // ---- world -----------------------------------------------------------------------------
  const world = new R.World(scene);
  world.renderer = renderer;
  world.startWorker();
  const fx = new R.FX(scene);
  const traffic = new R.Traffic(scene, world, 9);
  const life = new R.StreetLife(scene, world, au);
  const speedTrail = new R.SpeedTrail(scene);
  if (modeName === 'runner') life.addPeople(coarse ? 3 : 5);
  const rig = new R.CameraRig(camera, world);

  const blobs = [];
  const blobTex = R.glowTexture();
  const toast = $('toast');
  let toastT = 0;
  const ctx = {
    scene, camera, renderer, world, fx, traffic, rig, input, au, $, coarse, get life() { return life; }, get map() { return map; },
    theme: () => daytime.live || daytime.update(0),
    setTheme, daytime, lockTheme(name) { setTheme(name, true); themeLocked = true; },
    // the runner's screen stays clean: while running, messages only go to the log in the ⋮ menu
    // ("Забег"); with a panel open (the menu, the map, the wardrobe) they show as usual
    log: [],
    // a panel open (the menu, the map, the wardrobe): the game waits; the page knows it (body.ui-open)
    _paused: false,
    get paused() { return this._paused; },
    set paused(v) { this._paused = !!v; document.body.classList.toggle('ui-open', !!v); },
    say(text, kind) {
      ctx.log.unshift(text); if (ctx.log.length > 5) ctx.log.length = 5;
      if (modeName === 'runner' && !ctx.paused) return;
      toast.textContent = text;
      toast.className = 'ui on' + (kind ? ' ' + kind : '');
      toastT = kind === 'long' ? 3.6 : kind === 'bad' ? 2.2 : 1.4;
    },
    addBlob(o, size) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.scale.set(size, size, 1);
      scene.add(m);
      blobs.push({ m, o, size });
      m.visible = level < 2;
    },
  };
  if (!themeLocked) setTheme(daytime.mode, true);

  let level = coarse ? 1 : 2;
  const player = ctx.player = mode.start(ctx);
  // the district map (not in the guard's yard: one yard, nothing to find)
  // daily quests and the wardrobe (the runner): the panel, the dog's outfit, toasts when a quest is done
  let quests = null, wardrobe = null, questPanel = null;
  if (modeName === 'runner' && R.Quests) {
    quests = ctx.quests = new R.Quests();
    wardrobe = ctx.wardrobe = new R.Wardrobe();
    wardrobe.attach(player.ent, au);
    questPanel = new R.QuestPanel(ctx, quests, wardrobe);
    quests.onDone = (q, bonus) => {
      au.chime(); setTimeout(() => au.pick(10), 180);
      ctx.say(bonus ? 'Все задания дня! +2 ★' : 'Задание выполнено! +' + q.stars + ' ★', 'long');
      const b = $('moreBtn'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop', 'new');
    };
  }
  const map = mode.mapMarkers ? new R.DistrictMap(ctx, { markers: () => mode.mapMarkers(), travel: modeName === 'runner' }) : null;

  // ---- the camera: on the leash behind the dog (the runner's default), on its head ("GoPro") or free ---
  const CAMS = ['lock', 'gopro', 'free'], CAM_NAME = { lock: 'поводок', gopro: 'на морде', free: 'свободная' };
  let camMode = 'lock';
  try { const c = localStorage.getItem('runner-cam'); if (CAMS.includes(c)) camMode = c; } catch (e) {}
  function setCam(m, keep) {
    camMode = CAMS.includes(m) ? m : 'lock';
    rig.locked = input.camLock = modeName === 'runner' && camMode !== 'free';
    rig.gopro = rig.locked && camMode === 'gopro';
    if (rig.locked) rig.snap(player);
    input.cruise = 0;
    $('hint').innerHTML = rig.locked
      ? '<kbd>W</kbd> бежать &nbsp;·&nbsp; <kbd>A</kbd> <kbd>D</kbd> / стрелки — поворот &nbsp;·&nbsp; <kbd>S</kbd> стоп &nbsp;·&nbsp; <kbd>Пробел</kbd> прыжок (в воздухе ещё раз — сальто, у стены — отскок) &nbsp;·&nbsp; <kbd>Shift</kbd> / <kbd>C</kbd> подкат &nbsp;·&nbsp; <kbd>Q</kbd> рывок &nbsp;·&nbsp; <kbd>V</kbd> камера &nbsp;·&nbsp; <kbd>K</kbd> карта &nbsp;·&nbsp; <kbd>J</kbd> задания &nbsp;·&nbsp; <kbd>N</kbd> время суток'
      : '<kbd>W A S D</kbd> / стрелки — куда бежать &nbsp;·&nbsp; <kbd>Пробел</kbd> прыжок (в воздухе ещё раз — сальто, у стены — отскок) &nbsp;·&nbsp; <kbd>Shift</kbd> / <kbd>C</kbd> подкат &nbsp;·&nbsp; держи <kbd>W</kbd> на галопе или <kbd>Q</kbd> — рывок &nbsp;·&nbsp; мышь или <kbd>Z</kbd> <kbd>X</kbd> — повернуть камеру &nbsp;·&nbsp; <kbd>V</kbd> камера &nbsp;·&nbsp; <kbd>N</kbd> время суток &nbsp;·&nbsp; <kbd>K</kbd> карта &nbsp;·&nbsp; <kbd>J</kbd> задания';
    if (modeName === 'runner') $('stickHint').textContent = rig.locked ? 'бег и поворот' : 'куда бежать';
    const cb = $('camBtn'); if (cb) { cb.dataset.view = camMode; cb.setAttribute('aria-label', 'Камера: ' + CAM_NAME[camMode]); }
    if (!keep) try { localStorage.setItem('runner-cam', camMode); } catch (e) {}
  }
  const nextCam = () => { setCam(CAMS[(CAMS.indexOf(camMode) + 1) % CAMS.length]); ctx.say('Камера: ' + CAM_NAME[camMode]); };
  if (modeName === 'runner') {
    $('camBtn').hidden = false;
    $('camBtn').addEventListener('click', e => { e.stopPropagation(); nextCam(); });
    addEventListener('keydown', e => { if (e.code === 'KeyV' && !e.repeat && !ctx.paused) nextCam(); });
  }
  setCam(camMode, true);

  // the GoPro view: a hat or glasses would sit on the lens; the dog is hidden in a flip or a crash
  // (its head would sweep through the picture). The wardrobe's own camera shows everything.
  function camDress() {
    if (!player.ent || !player.ent.anchors) return;
    const onHead = rig.locked && rig.gopro && !(questPanel && questPanel.open && questPanel.tab === 'wardrobe');
    const A = player.ent.anchors; A.crown.visible = A.face.visible = !onHead;
    player.ent.mesh.visible = !(onHead && rig.hideDog);
  }

  // ---- one menu button in the corner: everything that is not running is behind it ----------------
  const more = $('more'), moreBtn = $('moreBtn');
  const TOD_SHORT = { auto: 'авто', day: 'день', sunset: 'закат', dawn: 'рассвет', night: 'ночь' };
  more.querySelector('[data-act="map"]').hidden = !map;
  function fullOn() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function goFull(on) {
    const de = document.documentElement;
    try {
      if (on) {
        const req = de.requestFullscreen || de.webkitRequestFullscreen;
        const pr = req && req.call(de, { navigationUI: 'hide' });
        // a phone: on its side (only possible in full screen; not on every phone)
        if (pr && pr.then) pr.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {});
      } else if (fullOn()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } catch (e) {}
  }
  const canFull = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  more.querySelector('[data-act="full"]').hidden = !(canFull && coarse);
  const runDD = k => more.querySelector('.run [data-k="' + k + '"]');
  function moreLabels() {
    if (modeName === 'runner') {
      runDD('speed').textContent = $('speedNum').textContent + ' км/ч';
      runDD('boost').textContent = Math.round((player.energy || 0) * 100) + ' %';
      runDD('bones').textContent = $('bonesN').textContent;
      runDD('jump').textContent = $('jumpLast').textContent + ' м · рекорд ' + $('jumpBest').textContent;
      runDD('caught').textContent = $('score').textContent + ($('combo').textContent ? ' ' + $('combo').textContent : '') + ' · рекорд ' + $('best').textContent;
      runDD('cat').textContent = $('cdist').textContent;
      const log = more.querySelector('.run .log'); log.textContent = '';
      for (const t of ctx.log) { const li = document.createElement('li'); li.textContent = t; log.appendChild(li); }
      more.querySelector('.run .keys').innerHTML = coarse ? '' : $('hint').innerHTML;
    }
    more.querySelector('.v.full').textContent = fullOn() ? 'вкл' : 'выкл';
    const q = $('questBtn').querySelector('.stars');
    more.querySelector('.v.stars').textContent = q ? '★ ' + q.textContent : '';
    more.querySelector('.v.cam').textContent = CAM_NAME[camMode];
    more.querySelector('.v.sound').textContent = au.muted ? 'выключен' : music.on ? 'звук и музыка' : 'без музыки';
    more.querySelector('.v.time').textContent = TOD_SHORT[daytime.mode] || daytime.mode;
  }
  function showMore(on) {
    if (on === !more.hidden) return;
    more.hidden = !on; moreBtn.setAttribute('aria-expanded', String(on));
    ctx.paused = on;   // the game waits while the menu is open
    if (on) { moreBtn.classList.remove('new'); moreLabels(); }
  }
  moreBtn.addEventListener('click', e => { e.stopPropagation(); showMore(more.hidden); });
  more.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    e.stopPropagation();
    const act = b.dataset.act;
    if (act === 'sound') { $('muteBtn').click(); moreLabels(); return; }
    if (act === 'time') { toggleTheme(); moreLabels(); return; }
    if (act === 'full') { goFull(!fullOn()); setTimeout(moreLabels, 300); return; }
    if (act === 'cam') { nextCam(); moreLabels(); return; }
    showMore(false);
    if (act === 'map') $('minimap').click();
    else if (act === 'quests') $('questBtn').click();
    else if (act === 'dogs') $('menuBtn').click();
  });
  // a tap anywhere else closes it
  addEventListener('pointerdown', e => { if (!more.hidden && !more.contains(e.target) && e.target !== moreBtn && !moreBtn.contains(e.target)) showMore(false); }, true);
  addEventListener('keydown', e => { if (e.code === 'Escape' && !more.hidden) showMore(false); });
  if (themeLocked === false) setTheme(daytime.mode, true);
  world.update(player.x, player.z, 99);
  rig.resize(innerWidth / innerHeight);
  rig.snap(player);
  // send every texture and shader to the graphics card now, not the first time a block shows them
  for (const map of R.assets.maps()) renderer.initTexture(R.texMat(map).map);
  renderer.compile(scene, camera);
  world.upload(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1)));   // compiles the upload shader too
  // where the dog will be in a couple of seconds: the city is built ahead of that point
  function ahead() {
    const v = Math.hypot(player.vx || 0, player.vz || 0);
    const dx = v > 2 ? player.vx / v : -Math.sin(player.heading), dz = v > 2 ? player.vz / v : -Math.cos(player.heading);
    const d = 18 + Math.min(42, v * 2.6);
    return [player.x + dx * d, player.z + dz * d];
  }

  player.onEvent = (name, v) => {
    if (name === 'land') au.thump(v / 12);
    else if (name === 'bump') au.thump(0.6);
    else if (name === 'hitCar') { au.yelp(); au.thump(1); }
    else if (name === 'jump') au.whoosh();
    else if (name === 'jump2') au.hop2();
    else if (name === 'launch') { au.whoosh(); au.hop2(); }
    else if (name === 'slide') au.whoosh();
    else if (name === 'noboost') { if (!noBoostT || now0() - noBoostT > 2500) { noBoostT = now0(); ctx.say('Рывок ещё не накопился', 'bad'); } }
    else if (name === 'super') { if (au.boost) au.boost(!!v); if (v && !superHinted) { superHinted = true; ctx.say('Суперскорость!', 'long'); } }
    else if (name === 'walljump') { au.thump(0.4); au.hop2(); }
    else if (name === 'crash') { au.yelp(); au.thump(1); ctx.say('Неудачное приземление! Лапа болит', 'bad'); }
    else if (name === 'healed') { au.chime(); ctx.say('Лапа зажила, можно бежать галопом'); }
  };
  traffic.onHorn = (x, z) => au.horn(Math.max(0.2, 1 - Math.hypot(x - player.x, z - player.z) / 40));

  // ---- the dog's own soft shadow on phones (no shadow maps there): the dog is drawn from the sun into
  // a small texture every frame and that texture is laid on the ground under it, so the shadow has
  // the dog's shape (legs, tail; long at sunset) instead of a round blob. Desktop keeps real shadows.
  const pShadow = (() => {
    const N = 96, rt = new THREE.WebGLRenderTarget(N, N, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const sc = new THREE.Scene();
    sc.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, skinning: true });
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
    cam.up.set(0, 0, -1);
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, alphaMap: rt.texture, depthWrite: false, opacity: 0.4 });
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -6;
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat);
    decal.renderOrder = 3; decal.visible = false;
    scene.add(decal);
    const S = new THREE.Matrix4(), V = new THREE.Matrix4(), cc = new THREE.Color();
    return {
      decal, rt, on: false,
      update(p, T) {
        if (!this.on || !p.root || !p.root.parent) { decal.visible = false; return; }
        const o = T.sunOffset, l = Math.hypot(o[0], o[1], o[2]);
        const Ly = Math.max(0.2, o[1] / l), sx = -(o[0] / l) / Ly, sz = -(o[2] / l) / Ly;   // ground shift per metre of height
        const at = p.root.position;          // where the dog is drawn
        const gy = p.ground || 0, H = 1.4;
        const cx = at.x + sx * H * 0.5, cz = at.z + sz * H * 0.5, hs = 1.25 + 0.5 * H * Math.hypot(sx, sz);
        cam.left = cam.bottom = -hs; cam.right = cam.top = hs;
        cam.position.set(cx, gy + 30, cz); cam.lookAt(cx, gy, cz);
        cam.updateMatrixWorld(); cam.updateProjectionMatrix();
        // shear the dog along the sun's rays onto the ground plane (projection * view * shear * view^-1)
        S.set(1, sx, 0, -sx * gy, 0, 1, 0, 0, 0, sz, 1, -sz * gy, 0, 0, 0, 1);
        V.copy(cam.matrixWorldInverse);
        cam.projectionMatrix.multiply(V).multiply(S).multiply(V.clone().invert());
        const parent = p.root.parent;
        sc.add(p.root);
        renderer.getClearColor(cc); const ca = renderer.getClearAlpha();
        renderer.setClearColor(0x000000, 1); renderer.setRenderTarget(rt);
        renderer.render(sc, cam);
        renderer.setRenderTarget(null); renderer.setClearColor(cc, ca);
        parent.add(p.root);
        decal.position.set(cx, gy + 0.06, cz); decal.scale.set(2 * hs, 1, 2 * hs);
        // softer and fainter as the dog goes up
        mat.opacity = T.shadowK * (1 - Math.min(0.6, Math.max(0, (p.y || 0) - gy) * 0.22));
        decal.visible = !(p.hidden || p.root.visible === false);
      },
    };
  })();

  // ---- quality governor ------------------------------------------------------------------
  function setLevel(l) {
    level = l;
    sun.castShadow = l >= 2;
    world.nearR = l >= 1 ? 1 : 0;
    renderer.setPixelRatio(l === 0 ? 1 : Math.min(devicePixelRatio, coarse ? 1.5 : 1.75));
    renderer.setSize(innerWidth, innerHeight);
    sizeComposer();
    pShadow.on = l < 2;
    for (const b of blobs) b.m.visible = l < 2 && b.o !== player;      // the dog has its own shadow then
    window.__quality = l;
  }
  setLevel(level);
  let qFrames = 0, qStart = performance.now() + 5000, qNext = qStart + 3000, qLow = 0;
  const dbg = /[?&]fps/.test(location.search) ? $('dbg') : null;
  if (dbg) dbg.hidden = false;
  let dbgN = 0, dbgAcc = 0;

  let started = false;
  input.onFirst = () => {
    au.start();
    if (started) return;
    started = true;
    // a phone: the whole screen for the game (no browser bars), from the first touch
    if (coarse && modeName === 'runner') goFull(true);
    $('hint').classList.add('hide');
    // the guard's and sniffer's key lists stay a little longer: there are more keys to learn
    setTimeout(() => { for (const id of ['ghint', 'shint']) $(id).classList.add('hide'); }, 25000);
  };
  $('loading').classList.add('hide');
  if (coarse) setTimeout(() => ctx.say(rig.locked ? 'Стик: вверх — бежать, в стороны — поворот, назад — стоп. Двойной тап — прыжок' : 'Стик — куда бежать. Веди пальцем справа — повернуть камеру. Двойной тап — прыжок', 'long'), 2500);

  // ---- where the stick points, in the world ------------------------------------------------
  // The stick is read relative to the camera. While it is held steadily one way, the reference
  // is kept, so the dog does not curve when the camera comes round behind it by itself. A turn of
  // the camera by hand takes the reference along: stick up + a drag to the right = the dog turns
  // right with the camera, both thumbs steer the same way.
  let refYaw = 0, lockAng = null;
  function worldDir() {
    if (!(input.mag > 0)) { lockAng = null; input.dirMag = 0; return; }
    const a = Math.atan2(input.mx, input.my);
    if (lockAng === null || Math.abs(R.angDiff(lockAng, a)) > 0.5 || input.camDrag || input.camTurn) { lockAng = a; refYaw = rig.heading; }
    const h = refYaw, s = Math.sin(h), c = Math.cos(h);
    input.dirX = -s * input.my + c * input.mx;
    input.dirZ = -c * input.my - s * input.mx;
    input.dirMag = input.mag;
  }

  // ---- loop ------------------------------------------------------------------------------
  const lines = $('lines');
  let last = -1, stepT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = last < 0 ? 1 / 60 : R.clamp((now - last) / 1000, 0, 0.05);
    last = now;
    const T = daytime.update(dt);
    heavyT -= dt;
    applyLive(T, heavyT <= 0);
    if (heavyT <= 0) heavyT = 0.35;

    // the big map open: the game stands still (the picture behind it keeps drawing)
    if (!ctx.paused) {
      input.poll();
      worldDir();
      traffic.update(dt, player);
      life.update(dt, player, T);
      mode.update(dt, ctx);
      const [ax, az] = ahead();
      world.update(player.x, player.z, 1, ax, az);
      fx.update(dt);
      rig.update(dt, player, now / 1000, input);
    }
    if (map) map.update(dt);
    if (wardrobe && !ctx.paused) wardrobe.update(dt, player, fx, T.lampK > 0.5);
    // the wardrobe open: the camera comes round to the front of the dog and slowly circles it
    if (questPanel && questPanel.open && questPanel.tab === 'wardrobe') {
      const a = player.heading + Math.PI * 0.72 + Math.sin(now / 2600) * 0.35, wide = innerWidth > 600;
      camera.position.set(player.x - Math.sin(a) * 2.5, (player.y || 0) + 1.15, player.z - Math.cos(a) * 2.5);
      // keep the dog clear of the panel (right on wide screens, bottom on phones)
      const side = wide ? 0.9 : 0, rx = Math.cos(a) * side, rz = -Math.sin(a) * side;
      camera.lookAt(player.x - rx, (player.y || 0) + (wide ? 0.75 : 0.35), player.z - rz);
    }
    camDress();
    camera.updateMatrixWorld();
    { const o = T.sunOffset, D = R.dogLight; if (D) { D.uRimDir.value.set(o[0], o[1], o[2]).normalize().transformDirection(camera.matrixWorldInverse); D.uRimCol.value.setHex(T.sunColor); D.uRimK.value = T.rimK; } }
    pShadow.update(player, T);
    // super speed and arrow flights: light streaks, the wind, smeared edges
    const zoom = Math.max(player.superK || 0, player.arrowK || 0);
    if (!ctx.paused) speedTrail.update(dt, player, zoom, T.lampK > 0.85);
    if (au.setWind) au.setWind(ctx.paused ? 0 : zoom * R.clamp(player.vel / C.MAX_SPEED, 0, 1.4));
    if (gradePass) gradePass.uniforms.uSpeed.value = zoom * R.clamp((player.vel - 12) / 10, 0, 1) * (level >= 2 ? 1 : 0.7);
    // god rays: where the sun is on the screen (it may be off the screen: the beams still reach in),
    // none when it is behind the camera; dust motes follow the camera and drift
    if (gradePass) {
      const u = gradePass.uniforms, o = T.sunOffset;
      rayV.set(o[0], o[1], o[2]).normalize();
      const facing = rayV.dot(camera.getWorldDirection(rayD));
      rayP.copy(camera.position).addScaledVector(rayV, 200).project(camera);
      u.uSunUV.value.set(rayP.x * 0.5 + 0.5, rayP.y * 0.5 + 0.5);
      // phones: only at sunset and dawn (the faint daytime rays are not worth the samples there)
      u.uRays.value = (level >= 2 || (T.rays || 0) >= 0.3 ? (T.rays || 0) : 0) * R.clamp((facing + 0.15) / 0.5, 0, 1);
      u.uRayT.value = T.rayT || 0.5;
      u.uRayCol.value.setHex(T.sunGlowCol);
      u.uRayN.value = level >= 2 ? 22 : 12;
      u.uAspect.value = camera.aspect;
    }
    motes.position.set(Math.round(camera.position.x / 36) * 36, 0, Math.round(camera.position.z / 36) * 36);
    motes.material.opacity = 0.75 * (T.rays || 0);
    motes.visible = (T.rays || 0) > 0.05;
    if (motes.visible) {
      const a = motes.geometry.attributes.position, t = now / 1000;
      for (let i = 0; i < a.count; i += 7) a.setY(i, (a.getY(i) + dt * 0.08) % 7);
      motes.rotation.y = Math.sin(t * 0.05) * 0.2;
      a.needsUpdate = true;
    }

    const gait = R.clamp(player.vel / C.MAX_SPEED, 0, 1);
    if (!player.air && player.vel > 0.8) {
      stepT -= dt;
      if (stepT <= 0) { stepT = 0.34 - 0.2 * gait; au.step(gait); }
    }
    au.update({ carDist: traffic.nearest || 99, carSpeed: traffic.nearestSpeed || 0, night: T.lampK > 0.5 });
    music.update(R.clamp(0.08 + 0.22 * gait + 0.75 * (mode.tension ? mode.tension() : 0.2), 0, 1), T.lampK > 0.5);
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) toast.classList.remove('on'); }

    sky.position.set(camera.position.x, 0, camera.position.z);
    if (T.cloudK > 0.02) for (const c of clouds) {
      const u = c.userData; u.a += dt * 0.0035;
      c.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r);
    }
    const o = T.sunOffset;
    sun.position.set(player.x + o[0], o[1], player.z + o[2]);
    sun.target.position.set(player.x, 0, player.z);

    R.wet.uCam.value.copy(camera.position);
    // the street lamps nearest the camera shine on the wet asphalt
    if (T.wet > 0.01 && T.lampK > 0.01) {
      // the ones ahead of the camera: those are the reflections you can see
      const cp = camera.position, cd = camera.getWorldDirection(lampDir);
      const near = world.lampsNear(cp.x + cd.x * 25, cp.z + cd.z * 25, R.wet.count);
      const U = R.wet.uLamps.value;
      for (let i = 0; i < U.length; i++) { const l = near[i]; if (l) U[i].set(l.x, l.y, l.z); else U[i].set(0, -1e4, 0); }
    }
    const fwdX = -Math.sin(player.heading), fwdZ = -Math.cos(player.heading);
    const lamps = world.lampsNear(player.x + fwdX * 10, player.z + fwdZ * 10, 2);
    for (let i = 0; i < 2; i++) {
      const l = lampLights[i], lp = lamps[i];
      if (lp) {
        l.position.x = R.damp(l.position.x, lp.x, 6, dt);
        l.position.y = lp.y;
        l.position.z = R.damp(l.position.z, lp.z, 6, dt);
      }
      l.intensity = R.damp(l.intensity, 3.2 * T.lampK, 6, dt);
    }
    buddyLight.position.set(player.x - fwdX * 1.2, 2.4, player.z - fwdZ * 1.2);
    buddyLight.intensity = R.damp(buddyLight.intensity, 0.9 * T.lampK, 6, dt);

    for (const b of blobs) {
      if (!b.m.visible) continue;
      const hidden = b.o.hidden || (b.o.root && b.o.root.visible === false);
      // the shadow shrinks and fades as the animal goes up
      const up = Math.max(0, (b.o.y || 0) - (b.o.ground || 0));
      const ss = b.size * (1 - Math.min(0.5, up * 0.18));
      b.m.scale.set(ss, ss, 1);
      b.m.material.opacity = hidden ? 0 : 0.55 * (1 - Math.min(0.6, up * 0.22));
      b.m.position.set(b.o.x, (b.o.ground || 0) + 0.09, b.o.z);
    }
    lines.style.opacity = Math.max(R.clamp((gait - 0.7) * 1.2, 0, 0.22), 0.5 * (player.superK || 0)).toFixed(2);   // subtle: strong speed lines made people dizzy

    if (composer && postOn && level >= 1) composer.render(dt);
    else renderer.render(scene, camera);

    if (dbg) {
      dbgAcc += dt; dbgN++;
      if (dbgAcc > 0.5) {
        const i = renderer.info.render;
        dbg.textContent = Math.round(dbgN / dbgAcc) + ' fps · качество ' + level + (composer && postOn && level >= 1 ? ' · эффекты' : '') + ' · ' + i.calls + ' выз · ' + Math.round(i.triangles / 1000) + 'k тр';
        dbgAcc = 0; dbgN = 0;
      }
    }
    if (now >= qStart) qFrames++;
    if (now > qNext) {
      const fps = qFrames / ((now - qStart) / 1000);
      window.__fps = fps;
      qLow = fps < 36 ? qLow + 1 : 0;
      if (qLow >= 2 && level > 0) { setLevel(level - 1); qLow = 0; }
      qFrames = 0; qStart = now; qNext = now + 3000;
    }
  }
  requestAnimationFrame(frame);

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    sizeComposer();
    rig.resize(innerWidth / innerHeight);
  });

  window.__runner = Object.assign({ mode: modeName, player, world, traffic, renderer, scene, camera, rig, setCam, camDress, setTheme, setLevel, input, ctx, worldDir, ahead, daytime, pShadow, life, map, speedTrail, get quests() { return quests; }, get wardrobe() { return wardrobe; } }, mode.debug ? mode.debug() : {});
})(window.R);
