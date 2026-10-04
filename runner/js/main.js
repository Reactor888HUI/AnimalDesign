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
      s.userData = { a: rnd() * Math.PI * 2, r: 190 + rnd() * 60, y: 55 + rnd() * 50 };
      sky.add(s); clouds.push(s);
    }
  }
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: R.glowTexture(), color: 0xe6eeff, transparent: true, depthWrite: false, fog: false }));
  moon.scale.set(34, 34, 1); moon.position.set(-150, 150, -160);
  sky.add(moon);

  // ---- theme -----------------------------------------------------------------------------
  let themeName = 'night', themeLocked = false;
  try { themeName = localStorage.getItem('runner-theme') || 'night'; } catch (e) {}
  if (!R.THEMES[themeName]) themeName = 'night';

  function setTheme(name, keep) {
    themeName = name;
    const T = R.THEMES[name];
    R.applyMaterialTheme(name);
    scene.background = R.skyTexture(name);
    scene.fog.color.setHex(T.fog); scene.fog.density = T.fogDensity;
    hemi.color.setHex(T.hemiSky); hemi.groundColor.setHex(T.hemiGround); hemi.intensity = T.hemiI;
    sun.color.setHex(T.sunColor); sun.intensity = T.sunI;
    renderer.toneMappingExposure = T.exposure;
    for (const c of clouds) c.visible = !!T.clouds;
    moon.visible = !!T.stars;
    document.documentElement.dataset.theme = name;
    $('themeBtn').setAttribute('aria-label', name === 'night' ? 'Включить день' : 'Включить ночь');
    if (!keep) try { localStorage.setItem('runner-theme', name); } catch (e) {}
  }
  const toggleTheme = () => { if (!themeLocked) setTheme(themeName === 'night' ? 'day' : 'night'); };
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
  await Promise.all([assetsReady, mode.load()]);

  // ---- world -----------------------------------------------------------------------------
  const world = new R.World(scene);
  const fx = new R.FX(scene);
  const traffic = new R.Traffic(scene, world, 9);
  const rig = new R.CameraRig(camera, world);

  const blobs = [];
  const blobTex = R.glowTexture();
  const toast = $('toast');
  let toastT = 0;
  const ctx = {
    scene, camera, renderer, world, fx, traffic, rig, input, au, $, coarse,
    theme: () => R.THEMES[themeName],
    setTheme, lockTheme(name) { setTheme(name, true); themeLocked = true; },
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
  if (!themeLocked) setTheme(themeName);

  let level = coarse ? 1 : 2;
  const player = ctx.player = mode.start(ctx);
  if (themeLocked === false) setTheme(themeName);
  world.update(player.x, player.z, 99);
  rig.resize(innerWidth / innerHeight);
  rig.snap(player);

  player.onEvent = (name, v) => {
    if (name === 'land') au.thump(v / 12);
    else if (name === 'bump') au.thump(0.6);
    else if (name === 'hitCar') { au.yelp(); au.thump(1); }
    else if (name === 'jump') au.whoosh();
    else if (name === 'jump2') au.hop2();
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

  // ---- loop ------------------------------------------------------------------------------
  const lines = $('lines');
  let last = -1, stepT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = last < 0 ? 1 / 60 : R.clamp((now - last) / 1000, 0, 0.05);
    last = now;
    const T = R.THEMES[themeName];

    input.poll();
    traffic.update(dt, player);
    mode.update(dt, ctx);
    world.update(player.x, player.z, 1);
    fx.update(dt);
    rig.update(dt, player, now / 1000);

    const gait = R.clamp(player.vel / C.MAX_SPEED, 0, 1);
    if (!player.air && player.vel > 0.8) {
      stepT -= dt;
      if (stepT <= 0) { stepT = 0.34 - 0.2 * gait; au.step(gait); }
    }
    au.update({ carDist: traffic.nearest || 99, carSpeed: traffic.nearestSpeed || 0, night: !!T.lamps });
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) toast.classList.remove('on'); }

    sky.position.set(camera.position.x, 0, camera.position.z);
    if (T.clouds) for (const c of clouds) {
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
      l.intensity = R.damp(l.intensity, T.lamps ? 3.2 : 0, 6, dt);
    }
    buddyLight.position.set(player.x - fwdX * 1.2, 2.4, player.z - fwdZ * 1.2);
    buddyLight.intensity = R.damp(buddyLight.intensity, T.lamps ? 1.4 : 0, 6, dt);

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
    lines.style.opacity = R.clamp((gait - 0.6) * 1.6, 0, 0.5).toFixed(2);

    renderer.render(scene, camera);

    if (dbg) {
      dbgAcc += dt; dbgN++;
      if (dbgAcc > 0.5) {
        const i = renderer.info.render;
        dbg.textContent = Math.round(dbgN / dbgAcc) + ' fps · качество ' + level + ' · ' + i.calls + ' выз · ' + Math.round(i.triangles / 1000) + 'k тр';
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
    rig.resize(innerWidth / innerHeight);
  });

  window.__runner = Object.assign({ mode: modeName, player, world, traffic, renderer, scene, camera, rig, setTheme, setLevel, input, ctx }, mode.debug ? mode.debug() : {});
})(window.R);
