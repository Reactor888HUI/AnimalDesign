(function (R) {
  const clamp = R.clamp;
  const input = {
    steer: 0,        // -1 left .. +1 right
    throttle: 0,     // -1 brake .. +1 gas
    jumpHeld: false,
    autoRun: false,
    touch: false,
    onTheme: null,
    onFirst: null,
    _jumpEdge: false, _barkEdge: false, _scentEdge: false, _biteEdge: false, _slideEdge: false, _boostEdge: false,
    // direction controls: where to run on the screen (x right, y up/away), 0..1 strength
    dirMode: false, mx: 0, my: 0, mag: 0,
    camTurn: 0,      // camera turned by the player: Z/X keys (-1..1) and drags (radians, applied once)
    camDrag: 0,
    // the camera locked to the dog (on the leash or on its head, the runner): gears set the pace
    // (0 stop, 1 walk, 2 trot, 3 run, 4 gallop, 5 super speed) and the right thumb steers
    camLock: false, gear: 0,
    _superOffEdge: false,
    _k: {},
    consumeJump() { const j = this._jumpEdge; this._jumpEdge = false; return j; },
    consumeBark() { const j = this._barkEdge; this._barkEdge = false; return j; },
    consumeScent() { const j = this._scentEdge; this._scentEdge = false; return j; },
    consumeBite() { const j = this._biteEdge; this._biteEdge = false; return j; },
    consumeSlide() { const j = this._slideEdge; this._slideEdge = false; return j; },
    consumeBoost() { const j = this._boostEdge; this._boostEdge = false; return j; },
    consumeSuperOff() { const j = this._superOffEdge; this._superOffEdge = false; return j; },
    // change gear; the top one asks for super speed at once, leaving it switches super speed off
    setGear(g, quiet) {
      g = clamp(Math.round(g), 0, 5);
      if (g === this.gear) return;
      if (g === 5) this._boostEdge = true;
      else if (this.gear === 5) this._superOffEdge = true;
      this.gear = g;
      if (gearBox) {
        gearBox.dataset.gear = g; gearBox.style.setProperty('--g', g);
        for (const b of gearBox.children) b.setAttribute('aria-checked', String(+b.dataset.g === g));
      }
      if (!quiet && navigator.vibrate) try { navigator.vibrate(g === 5 ? 18 : 8); } catch (e) {}
    },
  };
  // how fast each gear runs (of the top speed): a walk, a trot, a run, a gallop just under full
  // (full stick for a moment would switch super speed on by itself), super speed
  const GEAR_THR = [0, 0.085, 0.22, 0.52, 0.9, 1];

  // ---- keyboard ---------------------------------------------------------------------------
  const k = input._k;
  const gearBox = document.getElementById('gearBox');
  let gearKeyT = 0;
  const GAME_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
  addEventListener('keydown', e => {
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    // locked camera: W / up and S / down shift gears (held: one more every 0.2 s, up to a gallop;
    // super speed is one more press), 1-5 pick a gear, 0 stops
    if (input.camLock) {
      const up = e.code === 'KeyW' || e.code === 'ArrowUp', dn = e.code === 'KeyS' || e.code === 'ArrowDown';
      const now = performance.now();
      if ((up || dn) && (!e.repeat || now - gearKeyT > 200)) {
        if (!(e.repeat && up && input.gear >= 4)) { input.setGear(input.gear + (up ? 1 : -1)); gearKeyT = now; }
      }
      const dg = /^Digit([0-5])$/.exec(e.code);
      if (dg && !e.repeat) input.setGear(+dg[1]);
    }
    if (e.repeat) return;
    k[e.code] = true;
    if (e.code === 'Space') { input._jumpEdge = true; input.jumpHeld = true; }
    if (e.code === 'KeyN' && input.onTheme) input.onTheme();
    if (e.code === 'KeyF') input._barkEdge = true;
    if (e.code === 'KeyE') input._scentEdge = true;
    if (e.code === 'KeyG') input._biteEdge = true;
    if (e.code === 'KeyC' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') input._slideEdge = true;
    if (e.code === 'KeyQ' || e.code === 'KeyB') input._boostEdge = true;
    if (input.onFirst) input.onFirst();
  });
  addEventListener('keyup', e => {
    k[e.code] = false;
    if (e.code === 'Space') input.jumpHeld = false;
  });
  const releaseAll = () => {
    for (const c in k) k[c] = false;
    input.jumpHeld = false;
    T.id = null; T.x = 0; T.y = 0;      // declared below; this only runs on later events
    jumpId = null; dblId = null; S.id = null; input.setGear(0, true);   // the app put away: the dog does not run on by itself
    document.querySelectorAll('#stick.on, #jumpBtn.on').forEach(e => e.classList.remove('on'));
  };
  addEventListener('blur', () => releaseAll());
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  // ---- touch ------------------------------------------------------------------------------
  const stickZone = document.getElementById('stickZone');
  const jumpZone = document.getElementById('jumpZone');
  const stick = document.getElementById('stick');
  const knob = document.getElementById('knob');
  const jumpBtn = document.getElementById('jumpBtn');
  const autoBtn = document.getElementById('autoBtn');
  const touchUI = document.getElementById('touchUI');

  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  input.touch = isTouch;
  if (isTouch) {
    touchUI.hidden = false;
    document.body.classList.add('is-touch');
    input.autoRun = true;
  }
  autoBtn.setAttribute('aria-pressed', String(input.autoRun));

  const T = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const RADIUS = 56;

  // a double tap anywhere on the play area jumps (hold the second tap to jump higher), so one thumb
  // can run, steer and jump: tap, tap — without reaching for the jump button
  const TAP = { upT: -1e9, x: 0, y: 0, short: false, downT: 0, dx: 0, dy: 0 };
  let dblId = null;
  function tapDown(e) {
    const now = performance.now();
    const dbl = TAP.short && now - TAP.upT < 320 && Math.hypot(e.clientX - TAP.x, e.clientY - TAP.y) < 90;
    TAP.downT = now; TAP.dx = e.clientX; TAP.dy = e.clientY;
    if (dbl) { input._jumpEdge = true; input.jumpHeld = true; dblId = e.pointerId; TAP.short = false; TAP.upT = -1e9; }
    return dbl;
  }
  function tapUp(e) {
    const now = performance.now();
    if (e.pointerId === dblId) { dblId = null; input.jumpHeld = false; TAP.short = false; return; }
    TAP.short = now - TAP.downT < 260 && Math.hypot(e.clientX - TAP.dx, e.clientY - TAP.dy) < 20;
    TAP.upT = now; TAP.x = e.clientX; TAP.y = e.clientY;
  }

  function stickDown(e) {
    if (T.id !== null) return;
    T.id = e.pointerId; T.ox = e.clientX; T.oy = e.clientY; T.x = 0; T.y = 0;
    tapDown(e);
    stickZone.setPointerCapture(e.pointerId);
    stick.style.left = e.clientX + 'px';
    stick.style.top = e.clientY + 'px';
    stick.classList.add('on');
    knob.style.transform = 'translate(0,0)';
    if (input.onFirst) input.onFirst();
    e.preventDefault();
  }
  function stickMove(e) {
    if (e.pointerId !== T.id) return;
    let dx = e.clientX - T.ox, dy = e.clientY - T.oy;
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) { dx *= RADIUS / d; dy *= RADIUS / d; }
    T.x = dx / RADIUS; T.y = dy / RADIUS;
    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }
  function stickUp(e) {
    if (e.pointerId !== T.id) return;
    T.id = null; T.x = 0; T.y = 0;
    tapUp(e);
    stick.classList.remove('on');
  }
  stickZone.addEventListener('pointerdown', stickDown);
  stickZone.addEventListener('pointermove', stickMove);
  stickZone.addEventListener('pointerup', stickUp);
  stickZone.addEventListener('pointercancel', stickUp);

  // ---- the locked camera: the right thumb steers, the left hand has the gears, jump and slide -----
  // Right half: put a thumb down anywhere and slide it left or right — the further from where it
  // went down, the sharper the turn; let go and the dog runs straight. A quick flick up or down
  // shifts a gear. A double tap still jumps.
  const steerUI = document.getElementById('steerUI'), steerDot = steerUI && steerUI.firstElementChild;
  const S = { id: null, ox: 0, oy: 0, x: 0, dx: 0, dy: 0, t0: 0 }, STEER_R = 80;
  function steerDown(e) {
    if (S.id !== null) return;
    S.id = e.pointerId; S.ox = e.clientX; S.oy = e.clientY; S.x = 0; S.dx = 0; S.dy = 0; S.t0 = performance.now();
    if (steerUI) { steerUI.style.left = clamp(e.clientX, 102, innerWidth - 102) + 'px'; steerUI.style.top = e.clientY + 'px'; steerUI.classList.add('on'); steerDot.style.transform = ''; }
  }
  function steerMove(e) {
    if (e.pointerId !== S.id) return;
    S.dx = e.clientX - S.ox; S.dy = e.clientY - S.oy;
    S.x = clamp(S.dx / STEER_R, -1, 1);
    if (steerDot) steerDot.style.transform = 'translateX(' + (S.x * STEER_R) + 'px)';
  }
  function steerUp(e) {
    if (e.pointerId !== S.id) return;
    S.dx = e.clientX - S.ox; S.dy = e.clientY - S.oy;
    if (performance.now() - S.t0 < 400 && Math.abs(S.dy) > 45 && Math.abs(S.dy) > 1.5 * Math.abs(S.dx)) input.setGear(input.gear + (S.dy < 0 ? 1 : -1));
    S.id = null; S.x = 0;
    if (steerUI) steerUI.classList.remove('on');
  }
  // the gear lever: tap a step or slide along it
  if (gearBox) {
    let gid = null;
    const pick = e => {
      const r = gearBox.getBoundingClientRect();
      input.setGear(Math.floor((r.bottom - e.clientY) / r.height * 6));
    };
    gearBox.addEventListener('pointerdown', e => { if (input.onFirst) input.onFirst(); gid = e.pointerId; gearBox.setPointerCapture(e.pointerId); pick(e); e.preventDefault(); e.stopPropagation(); });
    gearBox.addEventListener('pointermove', e => { if (e.pointerId === gid) pick(e); });
    const gUp = e => { if (e.pointerId === gid) gid = null; };
    gearBox.addEventListener('pointerup', gUp); gearBox.addEventListener('pointercancel', gUp);
    gearBox.addEventListener('click', e => e.preventDefault());
  }
  // the jump button on the left (with the locked camera it has its own place, out of the steering)
  jumpBtn.addEventListener('pointerdown', e => {
    if (!input.camLock) return;
    if (input.onFirst) input.onFirst();
    input._jumpEdge = true; input.jumpHeld = true; jumpBtn.classList.add('on');
    jumpBtn.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation();
  });
  const jumpOff = () => { if (input.camLock) { input.jumpHeld = false; jumpBtn.classList.remove('on'); } };
  jumpBtn.addEventListener('pointerup', jumpOff); jumpBtn.addEventListener('pointercancel', jumpOff);

  let jumpId = null;
  // Right half (the free camera): a touch on (or near) the jump button jumps; a touch anywhere else there turns the
  // camera when it slides left or right — so the right thumb can look round while the left one runs.
  let camTouch = null, camTX = 0;
  jumpZone.addEventListener('pointerdown', e => {
    if (input.onFirst) input.onFirst();
    e.preventDefault();
    const r = jumpBtn.getBoundingClientRect(), pad = 34;
    const onJump = e.clientX > r.left - pad && e.clientX < r.right + pad && e.clientY > r.top - pad && e.clientY < r.bottom + pad;
    jumpZone.setPointerCapture(e.pointerId);
    if (input.camLock) { tapDown(e); steerDown(e); return; }
    if (onJump && jumpId === null) {
      jumpId = e.pointerId;
      input._jumpEdge = true; input.jumpHeld = true;
      jumpBtn.classList.add('on');
    } else {
      tapDown(e);
      if (camTouch === null) { camTouch = e.pointerId; camTX = e.clientX; }
    }
  });
  jumpZone.addEventListener('pointermove', e => {
    steerMove(e);
    if (e.pointerId !== camTouch || input.camLock) return;
    input.camDrag += (e.clientX - camTX) * 0.007; camTX = e.clientX;
  });
  const camTouchUp = e => { if (e.pointerId === S.id) steerUp(e); if (e.pointerId !== jumpId) tapUp(e); if (e.pointerId === camTouch) camTouch = null; };
  jumpZone.addEventListener('pointerup', camTouchUp);
  jumpZone.addEventListener('pointercancel', camTouchUp);
  const jumpUp = e => {
    if (e.pointerId !== jumpId) return;
    jumpId = null; input.jumpHeld = false; jumpBtn.classList.remove('on');
  };
  jumpZone.addEventListener('pointerup', jumpUp);
  jumpZone.addEventListener('pointercancel', jumpUp);

  for (const [id, key] of [['barkBtn', '_barkEdge'], ['scentBtn', '_scentEdge'], ['biteBtn', '_biteEdge'], ['noseBtn', '_scentEdge'], ['digBtn', '_biteEdge'], ['slideBtn', '_slideEdge'], ['boostBtn', '_boostEdge']]) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.addEventListener('pointerdown', e => { input[key] = true; btn.classList.add('on'); e.preventDefault(); e.stopPropagation(); });
    const off = () => btn.classList.remove('on');
    btn.addEventListener('pointerup', off); btn.addEventListener('pointercancel', off); btn.addEventListener('pointerleave', off);
  }

  autoBtn.addEventListener('click', () => {
    input.autoRun = !input.autoRun;
    autoBtn.setAttribute('aria-pressed', String(input.autoRun));
  });
  document.addEventListener('contextmenu', e => e.preventDefault());

  // ---- turning the camera by hand: drag on the open part of the screen --------------------
  let camId = null, camX = 0;
  addEventListener('pointerdown', e => {
    if (e.target.tagName !== 'CANVAS' || camId !== null) return;
    camId = e.pointerId; camX = e.clientX;
  });
  addEventListener('pointermove', e => {
    if (e.pointerId !== camId || input.camLock) return;
    input.camDrag += (e.clientX - camX) * 0.006; camX = e.clientX;
  });
  const camUp = e => { if (e.pointerId === camId) camId = null; };
  addEventListener('pointerup', camUp); addEventListener('pointercancel', camUp);

  // ---- per-frame read ---------------------------------------------------------------------
  input.poll = input._poll = function () {   // (_poll: the real one, for tests that stub poll)
    // direction: stick or keys, relative to the screen
    let mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    let my = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    let mag = Math.min(1, Math.hypot(mx, my));
    if (mag > 0) { const l = Math.hypot(mx, my); mx /= l; my /= l; }
    if (T.id !== null) {
      const d = Math.hypot(T.x, T.y);
      if (d > 0.12) {
        mx = T.x / d; my = -T.y / d;
        mag = Math.min(1, (d - 0.12) / 0.7);   // a light push walks, the edge gallops
      }
    }
    this.mx = mx; this.my = my; this.mag = mag; this.dirMode = true;
    // Z / X turn the camera (E, F, G are taken by the dogs' actions)
    this.camTurn = (k.KeyX ? 1 : 0) - (k.KeyZ ? 1 : 0);
    const ks = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const kt = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    let ts = 0, tt = 0;
    if (T.id !== null) {
      // a soft curve: small stick moves give fine turns, the edge gives a full turn
      const ax = Math.abs(T.x);
      ts = ax < 0.1 ? 0 : Math.sign(T.x) * Math.pow((ax - 0.1) / 0.9, 1.5);
      tt = T.y < -0.25 ? Math.min(1, (-T.y - 0.25) / 0.6) : (T.y > 0.45 ? -(T.y - 0.3) : 0);
    }
    if (this.camLock) {
      // gears set the pace (they stay set); the right thumb steers: a soft curve, fine near the
      // middle, a full turn at the edge; at a standstill the gear 0 brakes
      this.dirMode = false;
      ts = 0;
      if (S.id !== null) { const ax = Math.abs(S.x); ts = ax < 0.06 ? 0 : Math.sign(S.x) * Math.pow((ax - 0.06) / 0.94, 1.3); }
      this.steer = clamp(ks + ts, -1, 1);
      this.throttle = this.gear ? GEAR_THR[this.gear] : -0.6;
      return;
    } else if (input.autoRun && !k.KeyS && !k.ArrowDown && !(T.id !== null && T.y > 0.45) && kt === 0 && tt === 0) tt = 1;
    this.steer = clamp(ks + ts, -1, 1);
    this.throttle = clamp(kt + tt, -1, 1);
  };

  R.input = input;
})(window.R = window.R || {});
