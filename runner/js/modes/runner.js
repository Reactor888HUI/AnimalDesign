(function (R) {
  const C = R.C;
  let dogEnt, catEnt, chickenTpl;
  let player, cat, flock, el;
  let score = 0, best = 0, combo = 0, comboT = 0, flashT = 0, bannerA = 0, cluckCd = 0, barkCd = 0, wasNear = false;

  R.modes = R.modes || {};
  R.modes.runner = {
    title: 'Бегун',

    async load() {
      [dogEnt, catEnt, chickenTpl] = await Promise.all([R.makeDog(), R.makeCat(), R.loadChicken()]);
    },

    start(ctx) {
      const { scene, world, $, au } = ctx;
      player = new R.Player(dogEnt);
      cat = new R.Cat(catEnt);
      scene.add(player.root, cat.root);
      player.x = world.start.x; player.z = world.start.z;
      world.update(player.x, player.z, 99);
      cat.respawn(player, world, 24);
      flock = chickenTpl ? new R.Flock(scene, chickenTpl, 7, world, player) : null;
      if (flock) flock.onCluck = () => { if (cluckCd <= 0) { au.cluck(); cluckCd = 1.2; } };
      ctx.addBlob(player, 2.1); ctx.addBlob(cat, 1.4);
      if (flock) for (const b of flock.birds) ctx.addBlob(b, 0.9);

      el = {
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

    debug() { return { player, cat, flock }; },
  };
})(window.R = window.R || {});
