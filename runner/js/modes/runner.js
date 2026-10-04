(function (R) {
  const C = R.C;
  let dogEnt, catEnt, chickenTpl;
  let player, cat, flock, el;
  let score = 0, best = 0, combo = 0, comboT = 0, flashT = 0, bannerA = 0, cluckCd = 0, barkCd = 0, wasNear = false;

  // ---- bones to collect: lines along the street, arcs to jump through, on roofs of cars and containers ----
  const MAXB = 48;
  let bonesMesh, clusters = [], boneT = 0, bonesN = 0, runN = 0, runT = 0;
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S1 = new THREE.Vector3(1.35, 1.35, 1.35), P3 = new THREE.Vector3();
  function boneGeometry() {
    const parts = [new THREE.CylinderGeometry(0.055, 0.055, 0.42, 8).rotateZ(Math.PI / 2)];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) parts.push(new THREE.SphereGeometry(0.085, 8, 6).translate(sx * 0.22, sy * 0.06, 0));
    return THREE.BufferGeometryUtils.mergeBufferGeometries(parts, false);
  }
  const STAND = { car: 1, box: 1, dumpster: 1, prop: 1, planter_bushes: 1, bench: 1, container: 1, parkour: 1, fence_piece: 1 };
  // is a bone at this height stuck inside something (a parked car, a bench, a bin)?
  function inside(world, x, z, y) {
    for (const o of world.obstaclesNear(x, z, 0.5)) {
      if (o.kind === 'traffic' || o.h < 0.3) continue;
      if (Math.abs(x - o.x) < o.hx + 0.35 && Math.abs(z - o.z) < o.hz + 0.35 && y < o.h + 0.35) return true;
    }
    return false;
  }
  function spawnCluster(world) {
    const a = player.heading + (Math.random() - 0.5) * 1.2, d = 26 + Math.random() * 20;
    const cx = player.x - Math.sin(a) * d, cz = player.z - Math.cos(a) * d;
    const along = Math.abs(Math.sin(a)) > Math.abs(Math.cos(a)) ? { x: -Math.sign(Math.sin(a)), z: 0 } : { x: 0, z: -Math.sign(Math.cos(a)) };
    const pts = [];
    const r = Math.random();
    if (r < 0.35) {
      // on top of something you can climb: a parked car, a container, a bench
      const opts = world.obstaclesNear(cx, cz, 14).filter(o => STAND[o.kind] && !o.ramp && o.h > 0.5 && o.h < 3.4);
      if (opts.length) {
        const o = opts[Math.floor(Math.random() * opts.length)];
        const long = o.hx > o.hz, n = R.clamp(Math.round(Math.max(o.hx, o.hz) * 2 / 0.9), 1, 4);
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * Math.max(o.hx, o.hz) * 1.4;
          pts.push({ x: o.x + (long ? t : 0), y: o.h + 0.7, z: o.z + (long ? 0 : t) });
        }
      }
    }
    if (!pts.length) {
      // a line on the ground, or an arc you have to jump through (a high one needs the air jump)
      const kind = r < 0.6 ? 'line' : r < 0.9 ? 'arc' : 'high';
      const n = 7, peak = kind === 'high' ? 3.4 : kind === 'arc' ? 2.0 : 0;
      for (let i = 0; i < n; i++) {
        const t = (i - (n - 1) / 2) * 1.3, u = i / (n - 1);
        const x = cx + along.x * t, z = cz + along.z * t, y = 0.7 + peak * Math.sin(Math.PI * u);
        if (world.solidAt(x, z, 0.5) || inside(world, x, z, y)) return;
        pts.push({ x, y, z });
      }
    }
    clusters.push({ bones: pts.map(p => Object.assign(p, { alive: true, ph: Math.random() * 6 })), left: pts.length, total: pts.length });
  }
  function updateBones(dt, ctx) {
    const { world, fx, au } = ctx;
    boneT -= dt; runT -= dt;
    if (boneT <= 0) { boneT = 1.2; if (clusters.length < 4) spawnCluster(world); }
    let k = 0;
    const t = performance.now() / 1000, py = player.y + 0.45;
    for (let ci = clusters.length - 1; ci >= 0; ci--) {
      const c = clusters[ci];
      let far = true;
      for (const b of c.bones) {
        if (!b.alive) continue;
        const dx = b.x - player.x, dz = b.z - player.z, d = Math.hypot(dx, dz);
        if (d < 85) far = false;
        if (d < 1.05 && Math.abs(b.y - py) < 1.0) {
          b.alive = false; c.left--; bonesN++;
          runN = runT > 0 ? runN + 1 : 0; runT = 1.3;
          au.pick(runN);
          fx.emit(b.x, b.y, b.z, { color: 0xfff1b8, count: 5, speed: 2.5, up: 1.5, size: 0.22, opacity: 0.95, life: 0.45 });
          if (c.left === 0 && c.total >= 3) { bonesN += 5; ctx.say('Вся связка! +5'); au.chime(); }
          el.bonesN.textContent = bonesN;
          continue;
        }
        if (k < MAXB) {
          E.set(0.25, t * 2.4 + b.ph, 0);
          Q.setFromEuler(E);
          P3.set(b.x, b.y + Math.sin(t * 3 + b.ph) * 0.08, b.z);
          M4.compose(P3, Q, S1);
          bonesMesh.setMatrixAt(k++, M4);
        }
      }
      if (c.left === 0 || far) clusters.splice(ci, 1);
    }
    bonesMesh.count = k;
    bonesMesh.instanceMatrix.needsUpdate = true;
  }

  // ---- landing prediction: fly the dog's arc forward and mark where it meets the ground ----
  let landRing = null;
  function updateLanding(world) {
    const p = player;
    if (!p.air || p.y - p.ground < 0.8) { landRing.visible = false; return; }
    let x = p.x, z = p.z, y = p.y, vy = p.vy;
    const h = 1 / 30;
    for (let i = 0; i < 90; i++) {
      vy -= C.GRAVITY * h; x += p.vx * h; z += p.vz * h; y += vy * h;
      const g = world.groundAt(x, z, y);
      if (y <= g && vy < 0) {
        landRing.visible = true;
        landRing.position.set(x, g + 0.06, z);
        // red when this landing would hurt: too high a drop or an unfinished somersault
        const risky = -vy > 13.5 || (p.flip >= 0 && p.flip < 0.6);
        landRing.material.color.setHex(risky ? 0xff5a4a : 0x7dff9a);
        const s = 1 + 0.15 * Math.sin(performance.now() * 0.012);
        landRing.scale.set(s, s, 1);
        return;
      }
    }
    landRing.visible = false;
  }

  R.modes = R.modes || {};
  R.modes.runner = {
    title: 'Бегун',

    async load() {
      // the runner is the whippet, built and animated in code (js/whippet.js)
      [dogEnt, catEnt, chickenTpl] = await Promise.all([R.makeWhippet(), R.makeCat(), R.loadChicken()]);
    },

    start(ctx) {
      const { scene, world, $, au } = ctx;
      player = new R.Player(dogEnt);
      // the whippet steers well in the air, but a bad landing hurts
      player.airTurn = 1.0; player.airGrip = 3.2; player.canCrash = true; player.halfLen = 0.6;
      // where the dog will land: a ring on the ground while it is high in the air
      landRing = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 28), new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.8, depthWrite: false }));
      landRing.rotation.x = -Math.PI / 2; landRing.renderOrder = 3; landRing.visible = false;
      scene.add(landRing);
      cat = new R.Cat(catEnt);
      scene.add(player.root, cat.root);
      player.x = world.start.x; player.z = world.start.z;
      world.update(player.x, player.z, 99);
      cat.respawn(player, world, 24);
      flock = chickenTpl ? new R.Flock(scene, chickenTpl, 7, world, player) : null;
      if (flock) flock.onCluck = () => { if (cluckCd <= 0) { au.cluck(); cluckCd = 1.2; } };
      ctx.addBlob(player, 2.1); ctx.addBlob(cat, 1.4);
      if (flock) for (const b of flock.birds) ctx.addBlob(b, 0.9);

      bonesMesh = new THREE.InstancedMesh(boneGeometry(), new THREE.MeshLambertMaterial({ color: 0xf3ead2, emissive: 0x4a3c22 }), MAXB);
      bonesMesh.count = 0; bonesMesh.frustumCulled = false;
      scene.add(bonesMesh);
      el = {
        bonesN: $('bonesN'),
        speedFill: $('speedFill'), speedNum: $('speedNum'), chaseFill: $('chaseFill'),
        score: $('score'), combo: $('combo'), banner: $('banner'), flash: $('flash'),
        best: $('best'), arrow: $('arrow'), cdist: $('cdist'),
      };
      try { best = +localStorage.getItem('runner-best') || 0; } catch (e) {}
      el.best.textContent = best;
      return player;
    },

    update(dt, ctx) {
      const { world, fx, au, input } = ctx;
      const T = ctx.theme();
      player.update(dt, input, world, fx, T);
      cat.update(dt, player, world);
      if (flock) flock.update(dt, player, world);

      const addScore = n => {
        score += n;
        if (score > best) { best = score; try { localStorage.setItem('runner-best', best); } catch (e) {} el.best.textContent = best; }
        el.score.textContent = score;
      };
      if (cat.dist < 2.2 && Math.abs(player.y - cat.y) < 1.1) {
        comboT > 0 ? combo++ : (combo = 0);
        comboT = 8;
        const mult = Math.min(5, combo + 1);
        addScore(mult);
        ctx.say(mult > 1 ? '+' + mult + ' кот, комбо!' : '+1 кот');
        au.meow(); au.chime();
        if (dogEnt.trigger) dogEnt.trigger('attack');
        el.combo.textContent = mult > 1 ? '×' + mult : '';
        el.combo.classList.toggle('on', mult > 1);
        flashT = 0.3;
        fx.emit(cat.x, 0.5, cat.z, { color: 0xffe27a, count: 12, speed: 6, up: 3, size: 0.25, opacity: 0.95, life: 0.6 });
        cat.respawn(player, world, 30);
      }
      if (comboT > 0) { comboT -= dt; if (comboT <= 0) { combo = 0; el.combo.textContent = ''; el.combo.classList.remove('on'); } }
      if (flock) for (const b of flock.birds) {
        if (Math.hypot(b.x - player.x, b.z - player.z) < 1.3 && Math.abs(player.y - b.y) < 1) {
          addScore(1);
          ctx.say('+1 курица');
          fx.emit(b.x, 0.5, b.z, { color: 0xffffff, count: 14, speed: 5, up: 2.5, size: 0.22, opacity: 0.95, life: 0.8 });
          au.cluck(); au.chime();
          if (dogEnt.trigger) dogEnt.trigger('attack');
          flock.respawn(b, player, 45 + Math.random() * 25);
        }
      }

      cluckCd -= dt; barkCd -= dt;
      const near = cat.dist < 12;
      if (near && !wasNear && barkCd <= 0) { au.bark(); barkCd = 4; }
      wasNear = near;

      updateBones(dt, ctx);
      updateLanding(world);
      el.speedFill.style.background = player.limp > 0 ? '#ff6b6b' : '';

      // HUD
      const v = player.vel, sf = R.clamp(v / C.MAX_SPEED, 0, 1);
      el.speedFill.style.transform = 'scaleX(' + sf.toFixed(3) + ')';
      el.speedNum.textContent = Math.round(v * 2.4);
      el.chaseFill.style.transform = 'scaleX(' + R.clamp(1 - cat.dist / C.CAT_RANGE, 0, 1).toFixed(3) + ')';
      bannerA = R.clamp(bannerA + (cat.dist < 14 ? 1 : -1) * dt * 3, 0, 1);
      el.banner.style.opacity = bannerA.toFixed(2);
      flashT = Math.max(0, flashT - dt);
      el.flash.style.opacity = (flashT / 0.3 * 0.35).toFixed(2);
      const rel = R.angDiff(ctx.rig.heading, Math.atan2(-(cat.x - player.x), -(cat.z - player.z)));
      el.arrow.style.transform = 'rotate(' + (-rel * 180 / Math.PI).toFixed(1) + 'deg)';
      el.cdist.textContent = Math.round(cat.dist) + ' м';
    },

    debug() { return { player, cat, flock, bones: () => ({ clusters, bonesN }) }; },
  };
})(window.R = window.R || {});
