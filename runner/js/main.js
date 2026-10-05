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

  // ---- post-processing: bloom (lamps, windows, sparks glow), colour grade and vignette ---------
  const GRADE = {
    uniforms: { tDiffuse: { value: null }, uSat: { value: 1 }, uVib: { value: 0 }, uContrast: { value: 1 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uShadow: { value: new THREE.Vector3(1, 1, 1) }, uHigh: { value: new THREE.Vector3(1, 1, 1) }, uVig: { value: 0.2 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uSat, uVib, uContrast, uVig; uniform vec3 uTint, uShadow, uHigh; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb;
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
    if (heavy) {
      drawSky(T);
      scene.traverse(o => { if (o.material && o.material.userData && o.material.userData.env) o.material.envMapIntensity = T.envI; });
      document.documentElement.dataset.theme = T.lampK > 0.5 ? 'night' : 'day';
    }
  }
  const skylineCol = new THREE.Color();
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
  const showMute = () => { muteBtn.setAttribute('aria-pressed', String(au.muted)); muteBtn.setAttribute('aria-label', au.muted ? 'Включить звук' : 'Выключить звук'); };
  muteBtn.addEventListener('click', () => { au.start(); au.setMuted(!au.muted); showMute(); });
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
  const rig = new R.CameraRig(camera, world);

  const blobs = [];
  const blobTex = R.glowTexture();
  const toast = $('toast');
  let toastT = 0;
  const ctx = {
    scene, camera, renderer, world, fx, traffic, rig, input, au, $, coarse,
    theme: () => daytime.live || daytime.update(0),
    setTheme, daytime, lockTheme(name) { setTheme(name, true); themeLocked = true; },
    say(text, kind) {
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
    else if (name === 'walljump') { au.thump(0.4); au.hop2(); }
    else if (name === 'crash') { au.yelp(); au.thump(1); ctx.say('Неудачное приземление! Лапа болит', 'bad'); }
    else if (name === 'healed') { au.chime(); ctx.say('Лапа зажила, можно бежать галопом'); }
  };
  traffic.onHorn = (x, z) => au.horn(Math.max(0.2, 1 - Math.hypot(x - player.x, z - player.z) / 40));

  // ---- quality governor ------------------------------------------------------------------
  function setLevel(l) {
    level = l;
    sun.castShadow = l >= 2;
    world.nearR = l >= 1 ? 1 : 0;
    renderer.setPixelRatio(l === 0 ? 1 : Math.min(devicePixelRatio, coarse ? 1.5 : 1.75));
    renderer.setSize(innerWidth, innerHeight);
    sizeComposer();
    for (const b of blobs) b.m.visible = l < 2;
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
    $('hint').classList.add('hide');
    // the guard's and sniffer's key lists stay a little longer: there are more keys to learn
    setTimeout(() => { for (const id of ['ghint', 'shint']) $(id).classList.add('hide'); }, 25000);
  };
  $('loading').classList.add('hide');
  if (coarse) setTimeout(() => ctx.say('Стик — куда бежать. Веди пальцем справа — повернуть камеру', 'long'), 2500);

  // ---- where the stick points, in the world ------------------------------------------------
  // The stick is read relative to the camera. While it is held steadily one way, the reference
  // is kept, so the dog does not curve when the camera slowly comes round behind it.
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

    input.poll();
    worldDir();
    traffic.update(dt, player);
    mode.update(dt, ctx);
    const [ax, az] = ahead();
    world.update(player.x, player.z, 1, ax, az);
    fx.update(dt);
    rig.update(dt, player, now / 1000, input);

    const gait = R.clamp(player.vel / C.MAX_SPEED, 0, 1);
    if (!player.air && player.vel > 0.8) {
      stepT -= dt;
      if (stepT <= 0) { stepT = 0.34 - 0.2 * gait; au.step(gait); }
    }
    au.update({ carDist: traffic.nearest || 99, carSpeed: traffic.nearestSpeed || 0, night: T.lampK > 0.5 });
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) toast.classList.remove('on'); }

    sky.position.set(camera.position.x, 0, camera.position.z);
    if (T.cloudK > 0.02) for (const c of clouds) {
      const u = c.userData; u.a += dt * 0.0035;
      c.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r);
    }
    const o = T.sunOffset;
    sun.position.set(player.x + o[0], o[1], player.z + o[2]);
    sun.target.position.set(player.x, 0, player.z);

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
    lines.style.opacity = R.clamp((gait - 0.7) * 1.2, 0, 0.22).toFixed(2);   // subtle: strong speed lines made people dizzy

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

  window.__runner = Object.assign({ mode: modeName, player, world, traffic, renderer, scene, camera, rig, setTheme, setLevel, input, ctx, worldDir, ahead, daytime }, mode.debug ? mode.debug() : {});
})(window.R);
