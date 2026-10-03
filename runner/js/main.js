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
  scene.fog = new THREE.FogExp2(0x1b2342, 0.02);
  const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 280);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  const sm = coarse ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera;
  sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 160;
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);

  const buddyLight = new THREE.PointLight(0xffe2b0, 0, 11, 1.4);
  scene.add(buddyLight);

  const lampLights = [0, 1].map(() => {
    const l = new THREE.PointLight(0xffb468, 0, 26, 1.7);
    scene.add(l);
    return l;
  });

  // ---- world + actors --------------------------------------------------------------------
  const world = new R.World(scene);
  const fx = new R.FX(scene);

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
  setTheme(themeName);
  const toggleTheme = () => setTheme(themeName === 'night' ? 'day' : 'night');
  $('themeBtn').addEventListener('click', toggleTheme);
  input.onTheme = toggleTheme;

  const [dogEnt, catEnt] = await Promise.all([R.makeDog(), R.makeCat()]);
  const player = new R.Player(dogEnt);
  const cat = new R.Cat(catEnt);
  scene.add(player.root, cat.root);
  player.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  cat.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  cat.respawn(player, 24);

  world.update(player.z, 99);
  const rig = new R.CameraRig(camera, world);
  rig.resize(innerWidth / innerHeight);
  rig.snap(player);

  // ---- HUD -------------------------------------------------------------------------------
  const el = {
    speedFill: $('speedFill'), speedNum: $('speedNum'), chaseFill: $('chaseFill'),
    score: $('score'), combo: $('combo'), banner: $('banner'), flash: $('flash'), lines: $('lines'),
    best: $('best'),
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
    fx.emit(cat.x, 0.9, cat.z, { color: 0xffe27a, count: 12, speed: 6, up: 3, size: 0.4, opacity: 0.95, life: 0.6 });
    cat.respawn(player, 26);
  }

  let started = false;
  input.onFirst = () => {
    if (started) return;
    started = true;
    $('hint').classList.add('hide');
  };

  $('loading').classList.add('hide');

  // ---- loop ------------------------------------------------------------------------------
  let last = performance.now();
  const lampTarget = [new THREE.Vector3(), new THREE.Vector3()];
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    const T = R.THEMES[themeName];

    input.poll();
    player.update(dt, input, world, fx, T);
    cat.update(dt, player, world);
    world.update(player.z, 1);
    fx.update(dt);
    rig.update(dt, player, now / 1000);

    // catch
    if (cat.dist < 1.7 && !player.air) caught();
    else if (cat.dist < 1.7 && player.y < 0.9) caught();
    if (comboT > 0) { comboT -= dt; if (comboT <= 0) { combo = 0; el.combo.textContent = ''; el.combo.classList.remove('on'); } }

    // sun / moon + shadow follow the player
    const o = T.sunOffset;
    sun.position.set(player.x + o[0], o[1], player.z + o[2]);
    sun.target.position.set(player.x, 0, player.z);

    // two real lights glide between the nearest street lamps (night only)
    const fwdX = -Math.sin(player.heading), fwdZ = -Math.cos(player.heading);
    const lamps = world.lampsNear(player.x + fwdX * 8, player.z + fwdZ * 8, 2);
    for (let i = 0; i < 2; i++) {
      const l = lampLights[i], lp = lamps[i];
      if (lp) {
        lampTarget[i].set(lp.x, lp.y, lp.z);
        l.position.x = R.damp(l.position.x, lp.x, 6, dt);
        l.position.y = lp.y;
        l.position.z = R.damp(l.position.z, lp.z, 6, dt);
      }
      l.intensity = R.damp(l.intensity, T.lamps ? 5 : 0, 6, dt);
    }

    buddyLight.position.set(player.x - fwdX * 1.6, 2.6, player.z - fwdZ * 1.6);
    buddyLight.intensity = R.damp(buddyLight.intensity, T.lamps ? 2.2 : 0, 6, dt);

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

    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    rig.resize(innerWidth / innerHeight);
  });

  window.__runner = { player, cat, world, renderer, scene, camera, setTheme, input };
})(window.R);
