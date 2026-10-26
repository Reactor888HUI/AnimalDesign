(function (A) {
  // ===================================================================================================
  //  THE WORLD: renderer, the walking person, looking, what is in front of the eyes (the prompt), the
  //  landscapes that slowly change behind the glass, books taken from and put on shelves.
  //  Comfort: no head bob, no roll, no camera shake, no zoom: the view only turns and slides.
  // ===================================================================================================
  const T = THREE, TX = A.tex, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const SKY = {
    dawn: [0x26336a, 0xffdca4, 0x1b2147], sea: [0x2b2152, 0xffd27a, 0x14173a], aurora: [0x02050f, 0x12354a, 0x050c18],
    forest: [0xa9cde8, 0xfbeed0, 0x3a2a18], desert: [0x4f9cee, 0xfcebc4, 0xad7438], space: [0x02030a, 0x02030a, 0x080a14],
  };
  const SPOTS = {
    room: { x: 3.4, z: 2.8, look: [0, -0.6] }, reactor: { x: 2.7, z: 2.3, look: [0, -0.6] }, desk: { x: -3.5, z: -1.2, look: [-7, -0.4] },
    mine: { x: -4.6, z: 1.9, look: [-4.6, 5] }, hall: { x: 8.6, z: 0.6, look: [29, 0.6] }, books: { x: 15, z: -3.9, look: [15, -6.5] },
    search: { x: 8.9, z: 1.6, look: [10.4, 1.6] }, conveyor: { x: 4.7, z: 0.7, look: [0, 2.6] }, artifacts: { x: 10, z: 3.2, look: [18, 6.5] }, output: { x: 1.0, z: 2.9, look: [0, 4.4] },
  };
  A.SPOTS = SPOTS;

  A.World = function (canvas, hooks) {
    hooks = hooks || {};
    const W = { hooks, enabled: true, running: true, time: 0, prompt: null, zone: 'room', joy: { x: 0, y: 0 } };
    const coarse = matchMedia('(pointer: coarse)').matches;
    const renderer = new T.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance' });
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2));
    const scene = new T.Scene(); scene.background = new T.Color(0x0b0f18);
    const camera = new T.PerspectiveCamera(68, 1, 0.05, 400); camera.rotation.order = 'YXZ';
    if (T.RoomEnvironment) { const pm = new T.PMREMGenerator(renderer); scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture; pm.dispose(); }
    const B = W.B = A.build(scene);
    // the environment gives soft reflections; not so much that the lamps stop mattering
    scene.environmentIntensity = 0.5;
    W.renderer = renderer; W.scene = scene; W.camera = camera;
    // models built in Blender (tools/blender/*.py -> ark/models/*.glb) replace the primitives that stand in for them
    const loader = T.GLTFLoader ? new T.GLTFLoader() : null;
    W.loadModel = (url, place, done) => {
      if (!loader) return;
      loader.load(url, g => {
        g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        place(g.scene); scene.add(g.scene); if (done) done(g.scene);
      }, undefined, () => console.warn('model not loaded: ' + url));
    };
    // the rooms built in Blender, with their baked ambient occlusion: they take over from the primitives when they have loaded
    {
      const tl = new T.TextureLoader(), ao = url => new Promise((res, rej) => tl.load(url, t => { t.flipY = false; t.colorSpace = T.NoColorSpace; t.channel = 1; res(t); }, undefined, rej));
      Promise.all([ao('models/ao_main.jpg'), ao('models/ao_hall.jpg')]).then(([m, h]) => W.loadModel('models/rooms.glb', root => B.useRooms(root, { main: m, hall: h }), root => { B.roomsRoot = root; }))
        .catch(() => console.warn('the rooms from Blender did not load: the primitives stay'));
    }
    W.loadModel('models/desk_lamp.glb', m => m.position.set(-5.4, 0.79, -1.0), m => { B.blenderLamp = m; for (const o of B.deskLampOld || []) o.visible = false; });

    // ---- the sky colours and the light of the landscape ----------------------------------------------------
    const skyPos = B.sky.geometry.attributes.position, skyCol = B.sky.geometry.attributes.color, c1 = new T.Color(), c2 = new T.Color();
    function setSky(top, mid) {
      c1.set(top); c2.set(mid);
      // above the painted picture the sky goes on in the colour of the picture's top row, so there is no seam
      for (let i = 0; i < skyPos.count; i++) skyCol.setXYZ(i, c1.r, c1.g, c1.b);
      skyCol.needsUpdate = true;
    }
    const mood = { sun: new T.Color(), hemiS: new T.Color(), hemiG: new T.Color(), top: new T.Color(), mid: new T.Color(), ground: new T.Color(), sunI: 1, hemiI: 0.5, dir: new T.Vector3() };
    const moodOf = id => { const L = A.LANDSCAPES.find(l => l.id === id), s = SKY[id]; return { sun: new T.Color(L.sun), hemiS: new T.Color(L.hemi[0]), hemiG: new T.Color(L.hemi[1]), top: new T.Color(s[0]), mid: new T.Color(s[1]), ground: new T.Color(s[2]), sunI: L.sunI, hemiI: L.hemiI, dir: new T.Vector3(...L.dir) }; };
    function applyMood(a, b, k) {          // a -> b by k (0..1)
      const L = (x, y) => x + (y - x) * k;
      mood.sun.copy(a.sun).lerp(b.sun, k); mood.hemiS.copy(a.hemiS).lerp(b.hemiS, k); mood.hemiG.copy(a.hemiG).lerp(b.hemiG, k);
      mood.top.copy(a.top).lerp(b.top, k); mood.mid.copy(a.mid).lerp(b.mid, k); mood.ground.copy(a.ground).lerp(b.ground, k);
      B.lights.sun.color.copy(mood.sun); B.lights.sun.intensity = L(a.sunI, b.sunI) * 1.6 * Math.PI * 0.5; B.lights.hemi.color.copy(mood.hemiS); B.lights.hemi.groundColor.copy(mood.hemiG); B.lights.hemi.intensity = L(a.hemiI, b.hemiI) * Math.PI * 0.8;
      mood.dir.copy(a.dir).lerp(b.dir, k); B.lights.sun.position.copy(mood.dir);
      B.ground.material.color.copy(mood.ground); setSky(mood.top.getHex(), mood.mid.getHex());
    }
    // ---- the landscape series: the current one, the next one prepared in the background -----------------
    const land = W.land = { index: 0, textures: {}, fade: -1, next: -1, timer: 0, auto: true, mood: null };
    const mkTex = canvasEl => { const t = new T.CanvasTexture(canvasEl); t.colorSpace = T.SRGBColorSpace; t.wrapS = T.RepeatWrapping; t.repeat.x = -1; t.offset.x = 1; t.anisotropy = 4; return t; };
    const ids = A.LANDSCAPES.map(l => l.id);
    function prepare(i) {
      if (land.textures[i] || land.textures[i] === 0) return;
      land.textures[i] = 0;                                   // in progress
      TX.paintAsync(ids[i]).then(c => { land.textures[i] = mkTex(c); });
    }
    {
      land.textures[0] = mkTex(TX.paintNow(ids[0]));
      B.landA.material.map = land.textures[0]; B.landA.material.needsUpdate = true;
      land.mood = moodOf(ids[0]); applyMood(land.mood, land.mood, 0);
      setTimeout(() => prepare(1), 300);
    }
    W.landscapeName = () => A.LANDSCAPES[land.index].name;
    // jump straight to a landscape (a link ?land=3, or a test)
    W.setLandscape = function (i) {
      i = ((i % ids.length) + ids.length) % ids.length;
      const tx = mkTex(TX.paintNow(ids[i]));
      for (const k in land.textures) if (land.textures[k] && land.textures[k].dispose) land.textures[k].dispose();
      land.textures = {}; land.textures[i] = tx; B.landA.material.map = tx; B.landA.material.needsUpdate = true; B.landB.visible = false;
      land.index = i; land.fade = -1; land.timer = 0; land.mood = moodOf(ids[i]); applyMood(land.mood, land.mood, 0);
      setTimeout(() => prepare((i + 1) % ids.length), 600);
      if (hooks.onLandscape) hooks.onLandscape(W.landscapeName());
    };
    // switch to another landscape (a soft 4 s dissolve; waits until it is painted)
    W.nextLandscape = function (to) {
      if (land.fade >= 0) return false;
      const n = to === undefined ? (land.index + 1) % ids.length : to;
      if (!(land.textures[n] instanceof T.Texture)) { prepare(n); return false; }
      land.next = n; land.fade = 0; B.landB.material.map = land.textures[n]; B.landB.material.needsUpdate = true; B.landB.material.opacity = 0; B.landB.visible = true;
      land.from = land.mood; land.to = moodOf(ids[n]); return true;
    };
    function landUpdate(dt) {
      land.timer += dt;
      if (land.fade >= 0) {
        land.fade += dt / 4; const k = Math.min(1, land.fade), e = k * k * (3 - 2 * k);
        B.landB.material.opacity = e; applyMood(land.from, land.to, e);
        if (land.fade >= 1) {
          const old = land.textures[land.index]; B.landA.material.map = land.textures[land.next]; B.landA.material.needsUpdate = true; B.landB.visible = false;
          land.index = land.next; land.mood = land.to; land.fade = -1; land.timer = 0;
          if (old && old.dispose && land.index !== 0) { /* keep the first one; drop the rest, they are painted again on demand */ }
          for (const k2 in land.textures) if (+k2 !== land.index && land.textures[k2] && land.textures[k2].dispose) { land.textures[k2].dispose(); delete land.textures[k2]; }
          if (hooks.onLandscape) hooks.onLandscape(W.landscapeName());
          setTimeout(() => prepare((land.index + 1) % ids.length), 600);
        }
      } else if (land.auto && land.timer > 50) { if (!W.nextLandscape()) land.timer = 45; }
    }

    // ---- books on the shelves ------------------------------------------------------------------------------------
    const hallItems = [], mineItems = [], zero = new T.Matrix4().makeScale(0, 0, 0), tmpM = new T.Matrix4();
    W.setCatalog = items => { hallItems.length = 0; items.forEach((it, i) => { it.slot = i; hallItems.push(it); }); };
    W.hallCount = () => B.hallSlots.length;
    W.mineItems = mineItems;
    W.setMine = items => { mineItems.length = 0; for (const it of items.slice(0, B.mineSlots.length)) mineItems.push(it); B.mineBooks.count = mineItems.length; };
    W.addMine = item => { if (mineItems.length >= B.mineSlots.length) return false; mineItems.push(item); B.mineBooks.count = mineItems.length; return true; };
    W.removeMine = item => { const i = mineItems.indexOf(item); if (i < 0) return false; mineItems.splice(i, 1); B.mineBooks.count = mineItems.length; return true; };
    W.takeHall = item => { if (item.slot === undefined) return; item.taken = true; B.hallBooks.setMatrixAt(item.slot, zero); B.hallBooks.instanceMatrix.needsUpdate = true; };
    W.putHall = item => { if (item.slot === undefined) return; item.taken = false; B.hallBooks.setMatrixAt(item.slot, B.hallSlots[item.slot].m); B.hallBooks.instanceMatrix.needsUpdate = true; };
    // show a book: pull it out a little and put a marker over it
    const marker = new T.Group(); marker.visible = false; scene.add(marker);
    { const cone = new T.Mesh(new T.ConeGeometry(0.07, 0.2, 10), new T.MeshBasicMaterial({ color: 0xffd36a, toneMapped: false })); cone.rotation.x = Math.PI; marker.add(cone);
      const spr = new T.Sprite(new T.SpriteMaterial({ map: TX.plate('', { bg: 'none', w: 8, h: 8 }), color: 0xffd36a, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); spr.scale.set(0.001, 0.001, 1); marker.add(spr);
      const ring = new T.Mesh(new T.RingGeometry(0.12, 0.16, 24), new T.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.8, side: T.DoubleSide, toneMapped: false })); ring.position.y = -0.12; ring.rotation.x = -Math.PI / 2; marker.add(ring); marker.userData.ring = ring; }
    let shown = null;
    function unshow() { if (!shown) return; const s = shown; shown = null; marker.visible = false; if (s.mesh === B.hallBooks) { if (!s.item.taken) { B.hallBooks.setMatrixAt(s.idx, B.hallSlots[s.idx].m); B.hallBooks.instanceMatrix.needsUpdate = true; } } else { B.mineBooks.setMatrixAt(s.idx, B.mineSlots[s.idx].m); B.mineBooks.instanceMatrix.needsUpdate = true; } }
    W.showBook = function (item) {
      unshow();
      let mesh, idx, dz, slot;
      if (item.slot !== undefined && hallItems[item.slot] === item) { mesh = B.hallBooks; idx = item.slot; slot = B.hallSlots[idx]; dz = 0.09; }
      else { idx = mineItems.indexOf(item); if (idx < 0) return null; mesh = B.mineBooks; slot = B.mineSlots[idx]; dz = -0.09; }
      tmpM.copy(slot.m); tmpM.elements[14] += dz; mesh.setMatrixAt(idx, tmpM); mesh.instanceMatrix.needsUpdate = true;
      const p = new T.Vector3().setFromMatrixPosition(slot.m); marker.position.set(p.x, p.y + slot.h / 2 + 0.28, p.z + dz * 3); marker.visible = true; marker.userData.t = 0;
      shown = { mesh, idx, item, until: W.time + 12 };
      return { x: p.x, y: p.y, z: p.z, hall: mesh === B.hallBooks };
    };
    W.hideBook = unshow;

    // ---- the person ---------------------------------------------------------------------------------------------------
    const P = W.player = { x: SPOTS.room.x, z: SPOTS.room.z, yaw: Math.PI / 4, pitch: -0.04, vx: 0, vz: 0, eye: 1.62 };
    const keys = W.keys = {};
    const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); };
    addEventListener('keydown', e => {
      if (typing()) return;
      keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && W.enabled) e.preventDefault();
      if (!W.enabled) return;
      if ((e.code === 'KeyE' || e.code === 'Enter') && !e.repeat) W.interact();
      if (e.code === 'KeyL' && !e.repeat) W.nextLandscape();
    });
    addEventListener('keyup', e => { keys[e.code] = false; });
    addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
    W.look = (dx, dy) => { P.yaw -= dx; P.pitch = clamp(P.pitch - dy, -1.25, 1.25); };
    // mouse: click to capture (desktop), or drag; touch: drag to look
    let drag = null;
    canvas.addEventListener('pointerdown', e => {
      if (!W.enabled) return;
      if (e.pointerType === 'mouse') { if (document.pointerLockElement !== canvas && canvas.requestPointerLock) { try { canvas.requestPointerLock(); } catch (er) {} } drag = { id: e.pointerId, x: e.clientX, y: e.clientY, mouse: true, moved: 0 }; }
      else drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
      try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
    });
    canvas.addEventListener('pointermove', e => {
      if (!W.enabled) return;
      if (document.pointerLockElement === canvas && e.pointerType === 'mouse') { W.look(e.movementX * 0.0022, e.movementY * 0.0022); return; }
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      W.look(dx * (drag.mouse ? 0.0026 : 0.0042), dy * (drag.mouse ? 0.0026 : 0.0042));
    });
    const endDrag = e => { if (drag && e.pointerId === drag.id) { if (!drag.mouse && drag.moved < 8 && performance.now() - drag.t < 350 && W.prompt) W.interact(); drag = null; } };
    canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);

    // collision: the walkable floor is the main room, the doorway and the hall; furniture is a set of boxes
    const free = (x, z) => {
      const door = B.door;
      const inA = x > -6.55 && x < 6.35 && z > -4.6 && z < 4.6;
      const inD = x >= 6.3 && x <= 7.5 && Math.abs(z) < 1.0 && door.open > 0.85;
      const inB = x > 7.45 && x < 28.5 && z > -5.5 && z < 5.0;
      if (!(inA || inD || inB)) return false;
      for (const c of B.colliders) { if (c.off) continue; if (x > c.x0 - 0.3 && x < c.x1 + 0.3 && z > c.z0 - 0.3 && z < c.z1 + 0.3) return false; }
      return true;
    };
    W.free = free;
    function move(dt) {
      let f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - W.joy.y, s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + W.joy.x;
      const t = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0); if (t) P.yaw += t * 1.6 * dt;
      const mag = Math.min(1, Math.hypot(f, s)); if (mag > 1e-3) { f /= Math.max(1, Math.hypot(f, s)); s /= Math.max(1, Math.hypot(f, s)); }
      const sp = (keys.ShiftLeft || keys.ShiftRight ? 4.2 : 2.7) * (W.enabled ? 1 : 0);
      const sn = Math.sin(P.yaw), cs = Math.cos(P.yaw);
      const tvx = (-sn * f + cs * s) * sp, tvz = (-cs * f - sn * s) * sp, k = 1 - Math.exp(-9 * dt);
      P.vx += (tvx - P.vx) * k; P.vz += (tvz - P.vz) * k;
      const nx = P.x + P.vx * dt, nz = P.z + P.vz * dt;
      if (free(nx, P.z)) P.x = nx; else P.vx = 0;
      if (free(P.x, nz)) P.z = nz; else P.vz = 0;
    }
    // ---- what is in front of the eyes ---------------------------------------------------------------------------------
    const ray = new T.Raycaster(), fwd = new T.Vector3(), ctr = new T.Vector2(0, 0);
    let pickT = 0;
    function pick() {
      camera.updateMatrixWorld(); ray.setFromCamera(ctr, camera); ray.far = 5.0; camera.getWorldDirection(fwd);   // (the big screen is seen from further than a book can be reached)
      const hits = ray.intersectObjects([B.hallBooks, B.mineBooks, B.monitor.screen].concat(B.artMeshes), false);
      for (const h of hits) {
        if (h.object === B.monitor.screen) { if (B.monitor.k > 0.3) return { type: 'monitor', text: 'Монитор · задачи и сообщения', act: 'открыть' }; continue; }
        if (h.distance > 3.6) continue;
        if (h.object === B.hallBooks || h.object === B.mineBooks) {
          const item = (h.object === B.hallBooks ? hallItems : mineItems)[h.instanceId];
          if (!item || item.taken) continue;
          return { type: 'book', item, mine: h.object === B.mineBooks, text: item.title, sub: item.author || '', act: h.object === B.mineBooks ? 'взять в сумку' : 'взять книгу' };
        }
        if (h.object.userData.art) { const a = A.ARTIFACTS.find(x => x.id === h.object.userData.art); if (a) return { type: 'artifact', art: a, text: a.name, act: 'осмотреть' }; }
      }
      let best = null, bd = 1e9;
      for (const t of B.targets) {
        if (t.passive) continue;
        const dx = t.x - P.x, dz = t.z - P.z, d = Math.hypot(dx, dz);
        if (d > t.r) continue;
        if ((dx * fwd.x + dz * fwd.z) / (d || 1) < 0.15 && d > 1.3) continue;
        if (t.key === 'output' && !(hooks.hasOutput && hooks.hasOutput())) continue;
        if (d < bd) { bd = d; best = t; }
      }
      return best ? { type: best.key, text: best.text, act: best.key === 'output' ? 'забрать результат' : 'открыть' } : null;
    }
    W.setMonitor = on => { B.monitor.want = on ? 1 : 0; };
    W.monitorDraw = d => B.monitor.draw(d);
    W.interact = function () { if (!W.enabled || !W.prompt) return false; if (hooks.onInteract) hooks.onInteract(W.prompt); return true; };
    W.teleport = function (name, fromX, fromZ) {
      const s = SPOTS[name]; if (!s) return false;
      P.x = fromX !== undefined ? fromX : s.x; P.z = fromZ !== undefined ? fromZ : s.z; P.vx = P.vz = 0;
      P.yaw = Math.atan2(-(s.look[0] - P.x), -(s.look[1] - P.z)); P.pitch = name === 'books' || name === 'mine' ? 0.12 : camera.aspect < 1 ? -0.14 : -0.04;   // (upright: a little more floor than ceiling)
      if (P.x > 6 && P.x < 7.6) B.door.want = 1;
      return true;
    };
    W.faceTo = (x, z) => { P.yaw = Math.atan2(-(x - P.x), -(z - P.z)); };
    W.sectionAt = () => { if (P.x < 9.5 || P.z < 2.4) return -1; return clamp(Math.floor((P.x - 9.5) / 3), 0, 5); };

    // ---- the frame ---------------------------------------------------------------------------------------------------------
    let lastPrompt = '';
    W.step = function (dt) {
      W.time += dt;
      move(dt);
      camera.position.set(P.x, P.eye, P.z); camera.rotation.set(P.pitch, P.yaw, 0);
      // the shelf-door opens when someone comes near it, from either side
      const dd = Math.hypot(P.x - 6.5, P.z), D = B.door;
      if (dd < 3.4) D.want = 1; else if (dd > 4.8 && !(P.x > 6.2 && P.x < 7.6)) D.want = 0;
      B.update(dt, W.time, camera);
      landUpdate(dt);
      if (shown) { marker.userData.t += dt; marker.position.y += Math.sin(W.time * 4) * 0.0015; marker.userData.ring.scale.setScalar(1 + 0.25 * Math.sin(W.time * 5)); if (W.time > shown.until) unshow(); }
      pickT -= dt; if (pickT <= 0) {
        pickT = 0.1; const p = W.enabled ? pick() : null, key = p ? p.type + (p.text || '') : '';
        if (key !== lastPrompt) { lastPrompt = key; W.prompt = p; if (hooks.onPrompt) hooks.onPrompt(p); }
        else if (p) W.prompt = p;
        const z = P.x > 7.3 ? 'hall' : 'room'; if (z !== W.zone) { W.zone = z; if (hooks.onZone) hooks.onZone(z); }
      }
      renderer.render(scene, camera);
    };
    let last = performance.now();
    W.loop = function (now) { if (!W.running) return; requestAnimationFrame(W.loop); const dt = clamp((now - last) / 1000, 0, 0.05); last = now; W.step(dt); };
    W.resize = function (w, h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 1 ? 78 : 68; camera.updateProjectionMatrix(); };
    W.start = () => { last = performance.now(); requestAnimationFrame(W.loop); };
    return W;
  };
})(globalThis.Ark = globalThis.Ark || {});
