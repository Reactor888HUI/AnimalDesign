(async function (R) {
  const C = R.C, input = R.input;
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
  const lampLights = [0, 1].map(() => { const l = new THREE.PointLight(0xffb468, 0, 30, 1.6); scene.add(l); return l; });

  // ---- theme -----------------------------------------------------------------------------
  let themeName = 'night';
  try { themeName = localStorage.getItem('runner-theme') || 'night'; } catch (e) {}
  if (!R.THEMES[themeName]) themeName = 'night';

  function setTheme(name) {
    themeName = name;
    const T = R.THEMES[name];
    R.applyMaterialTheme(name);
    scene.background = R.skyTexture(name);
    scene.fog.color.setHex(T.fog); scene.fog.density = T.fogDensity;
    hemi.color.setHex(T.hemiSky); hemi.groundColor.setHex(T.hemiGround); hemi.intensity = T.hemiI;
    sun.color.setHex(T.sunColor); sun.intensity = T.sunI;
    renderer.toneMappingExposure = T.exposure;
    document.documentElement.dataset.theme = name;
    $('themeBtn').setAttribute('aria-label', name === 'night' ? 'Включить день' : 'Включить ночь');
    try { localStorage.setItem('runner-theme', name); } catch (e) {}
  }
  const toggleTheme = () => setTheme(themeName === 'night' ? 'day' : 'night');
  $('themeBtn').addEventListener('click', toggleTheme);
  input.onTheme = toggleTheme;

  // ---- load everything -------------------------------------------------------------------
  const loadText = $('loadText');
  const [, dogEnt, catEnt, chickenTpl] = await Promise.all([
    R.assets.load((d, n) => { loadText.textContent = 'Город ' + d + ' / ' + n; }),
    R.makeDog(), R.makeCat(), R.loadChicken(),
  ]);
  setTheme(themeName);

  const world = new R.World(scene);
  const fx = new R.FX(scene);
  const player = new R.Player(dogEnt);
  const cat = new R.Cat(catEnt);
  scene.add(player.root, cat.root);
  player.x = world.start.x; player.z = world.start.z;
  world.update(player.x, player.z, 99);
  cat.respawn(player, world, 24);
  const flock = chickenTpl ? new R.Flock(scene, chickenTpl, 7, world, player) : null;

  // soft blob shadows (used when real shadows are switched off)
  const blobTex = R.glowTexture();
  const blobs = [player, cat].concat(flock ? flock.birds : []).map((o, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 2;
    const sz = i === 0 ? 2.1 : i === 1 ? 1.4 : 0.9;
    m.scale.set(sz, sz, 1);
    scene.add(m);
    return { m, o };
  });

  const rig = new R.CameraRig(camera, world);
  rig.resize(innerWidth / innerHeight);
  rig.snap(player);

  // ---- quality governor ------------------------------------------------------------------
  let level = coarse ? 1 : 2;
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
  let dbgT = 0, dbgN = 0, dbgAcc = 0;

  // ---- HUD -------------------------------------------------------------------------------
  const el = {
    speedFill: $('speedFill'), speedNum: $('speedNum'), chaseFill: $('chaseFill'),
    score: $('score'), combo: $('combo'), banner: $('banner'), flash: $('flash'), lines: $('lines'),
    best: $('best'), arrow: $('arrow'), cdist: $('cdist'),
  };
  let score = 0, best = 0, combo = 0, comboT = 0, flashT = 0, bannerA = 0;
  try { best = +localStorage.getItem('runner-best') || 0; } catch (e) {}
  el.best.textContent = best;

  function caught() {
    comboT > 0 ? combo++ : (combo = 0);
    comboT = 8;
    const mult = Math.min(5, combo + 1);
    score += mult;
    if (score > best) { best = score; try { localStorage.setItem('runner-best', best); } catch (e) {} el.best.textContent = best; }
    el.score.textContent = score;
    el.combo.textContent = mult > 1 ? '×' + mult : '';
    el.combo.classList.toggle('on', mult > 1);
    flashT = 0.3;
    fx.emit(cat.x, 0.5, cat.z, { color: 0xffe27a, count: 12, speed: 6, up: 3, size: 0.25, opacity: 0.95, life: 0.6 });
    cat.respawn(player, world, 30);
  }

  let started = false;
  input.onFirst = () => { if (started) return; started = true; $('hint').classList.add('hide'); };
  $('loading').classList.add('hide');

  // ---- loop ------------------------------------------------------------------------------
  let last = -1;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = last < 0 ? 1 / 60 : R.clamp((now - last) / 1000, 0, 0.05);
    last = now;
    const T = R.THEMES[themeName];

    input.poll();
    player.update(dt, input, world, fx, T);
    cat.update(dt, player, world);
    if (flock) flock.update(dt, player, world);
    world.update(player.x, player.z, 1);
    fx.update(dt);
    rig.update(dt, player, now / 1000);

    if (cat.dist < 2.2 && player.y < 1.1) caught();
    if (comboT > 0) { comboT -= dt; if (comboT <= 0) { combo = 0; el.combo.textContent = ''; el.combo.classList.remove('on'); } }

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
      l.intensity = R.damp(l.intensity, T.lamps ? 5 : 0, 6, dt);
    }
    buddyLight.position.set(player.x - fwdX * 1.2, 2.4, player.z - fwdZ * 1.2);
    buddyLight.intensity = R.damp(buddyLight.intensity, T.lamps ? 2.4 : 0, 6, dt);

    for (const b of blobs) if (b.m.visible) b.m.position.set(b.o.x, 0.09, b.o.z);

    // HUD
    const v = player.vel, sf = R.clamp(v / C.MAX_SPEED, 0, 1);
    el.speedFill.style.transform = 'scaleX(' + sf.toFixed(3) + ')';
    el.speedNum.textContent = Math.round(v * 2.4);
    el.chaseFill.style.transform = 'scaleX(' + R.clamp(1 - cat.dist / C.CAT_RANGE, 0, 1).toFixed(3) + ')';
    el.lines.style.opacity = R.clamp((sf - 0.6) * 1.6, 0, 0.5).toFixed(2);
    bannerA = R.clamp(bannerA + (cat.dist < 14 ? 1 : -1) * dt * 3, 0, 1);
    el.banner.style.opacity = bannerA.toFixed(2);
    flashT = Math.max(0, flashT - dt);
    el.flash.style.opacity = (flashT / 0.3 * 0.35).toFixed(2);
    const rel = R.angDiff(rig.heading, Math.atan2(-(cat.x - player.x), -(cat.z - player.z)));
    el.arrow.style.transform = 'rotate(' + (-rel * 180 / Math.PI).toFixed(1) + 'deg)';
    el.cdist.textContent = Math.round(cat.dist) + ' м';

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

  window.__runner = { player, cat, world, flock, renderer, scene, camera, rig, setTheme, setLevel, input };
})(window.R);
