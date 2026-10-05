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
    _jumpEdge: false, _barkEdge: false, _scentEdge: false, _biteEdge: false, _slideEdge: false,
    // direction controls: where to run on the screen (x right, y up/away), 0..1 strength
    dirMode: false, mx: 0, my: 0, mag: 0,
    camTurn: 0,      // camera turned by the player: Z/X keys (-1..1) and drags (radians, applied once)
    camDrag: 0,
    _k: {},
    consumeJump() { const j = this._jumpEdge; this._jumpEdge = false; return j; },
    consumeBark() { const j = this._barkEdge; this._barkEdge = false; return j; },
    consumeScent() { const j = this._scentEdge; this._scentEdge = false; return j; },
    consumeBite() { const j = this._biteEdge; this._biteEdge = false; return j; },
    consumeSlide() { const j = this._slideEdge; this._slideEdge = false; return j; },
  };

  // ---- keyboard ---------------------------------------------------------------------------
  const k = input._k;
  const GAME_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
  addEventListener('keydown', e => {
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    k[e.code] = true;
    if (e.code === 'Space') { input._jumpEdge = true; input.jumpHeld = true; }
    if (e.code === 'KeyN' && input.onTheme) input.onTheme();
    if (e.code === 'KeyF') input._barkEdge = true;
    if (e.code === 'KeyE') input._scentEdge = true;
    if (e.code === 'KeyG') input._biteEdge = true;
    if (e.code === 'KeyC' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') input._slideEdge = true;
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
    jumpId = null;
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

  function stickDown(e) {
    if (T.id !== null) return;
    T.id = e.pointerId; T.ox = e.clientX; T.oy = e.clientY; T.x = 0; T.y = 0;
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
    stick.classList.remove('on');
  }
  stickZone.addEventListener('pointerdown', stickDown);
  stickZone.addEventListener('pointermove', stickMove);
  stickZone.addEventListener('pointerup', stickUp);
  stickZone.addEventListener('pointercancel', stickUp);

  let jumpId = null;
  // Right half: a touch on (or near) the jump button jumps; a touch anywhere else there turns the
  // camera when it slides left or right — so the right thumb can look round while the left one runs.
  let camTouch = null, camTX = 0;
  jumpZone.addEventListener('pointerdown', e => {
    if (input.onFirst) input.onFirst();
    e.preventDefault();
    const r = jumpBtn.getBoundingClientRect(), pad = 34;
    const onJump = e.clientX > r.left - pad && e.clientX < r.right + pad && e.clientY > r.top - pad && e.clientY < r.bottom + pad;
    jumpZone.setPointerCapture(e.pointerId);
    if (onJump && jumpId === null) {
      jumpId = e.pointerId;
      input._jumpEdge = true; input.jumpHeld = true;
      jumpBtn.classList.add('on');
    } else if (camTouch === null) { camTouch = e.pointerId; camTX = e.clientX; }
  });
  jumpZone.addEventListener('pointermove', e => {
    if (e.pointerId !== camTouch) return;
    input.camDrag += (e.clientX - camTX) * 0.007; camTX = e.clientX;
  });
  const camTouchUp = e => { if (e.pointerId === camTouch) camTouch = null; };
  jumpZone.addEventListener('pointerup', camTouchUp);
  jumpZone.addEventListener('pointercancel', camTouchUp);
  const jumpUp = e => {
    if (e.pointerId !== jumpId) return;
    jumpId = null; input.jumpHeld = false; jumpBtn.classList.remove('on');
  };
  jumpZone.addEventListener('pointerup', jumpUp);
  jumpZone.addEventListener('pointercancel', jumpUp);

  for (const [id, key] of [['barkBtn', '_barkEdge'], ['scentBtn', '_scentEdge'], ['biteBtn', '_biteEdge'], ['noseBtn', '_scentEdge'], ['digBtn', '_biteEdge'], ['slideBtn', '_slideEdge']]) {
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
    if (e.pointerId !== camId) return;
    input.camDrag += (e.clientX - camX) * 0.006; camX = e.clientX;
  });
  const camUp = e => { if (e.pointerId === camId) camId = null; };
  addEventListener('pointerup', camUp); addEventListener('pointercancel', camUp);

  // ---- per-frame read ---------------------------------------------------------------------
  input.poll = function () {
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
    if (input.autoRun && !k.KeyS && !k.ArrowDown && !(T.id !== null && T.y > 0.45) && kt === 0 && tt === 0) tt = 1;
    this.steer = clamp(ks + ts, -1, 1);
    this.throttle = clamp(kt + tt, -1, 1);
  };

  R.input = input;
})(window.R = window.R || {});
