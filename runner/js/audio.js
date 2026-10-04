(function (R) {
  // All sounds are synthesised with Web Audio, so there are no sound files to load.
  const A = { ctx: null, master: null, muted: false, started: false };
  try { A.muted = localStorage.getItem('runner-muted') === '1'; } catch (e) {}

  A.start = function () {
    if (A.started) { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = A.ctx = new AC();
    A.started = true;
    A.master = c.createGain();
    A.master.gain.value = A.muted ? 0 : 0.8;
    A.master.connect(c.destination);

    const n = c.sampleRate * 2;
    A.noise = c.createBuffer(1, n, c.sampleRate);
    const d = A.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;

    // distant city rumble (brown noise)
    const brown = c.createBuffer(1, n, c.sampleRate), bd = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
    const src = c.createBufferSource(); src.buffer = brown; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    A.amb = c.createGain(); A.amb.gain.value = 0.2;
    src.connect(lp); lp.connect(A.amb); A.amb.connect(A.master); src.start();

    // engine of the nearest car
    A.eng = c.createOscillator(); A.eng.type = 'sawtooth'; A.eng.frequency.value = 50;
    const elp = c.createBiquadFilter(); elp.type = 'lowpass'; elp.frequency.value = 240;
    A.engG = c.createGain(); A.engG.gain.value = 0;
    A.eng.connect(elp); elp.connect(A.engG); A.engG.connect(A.master); A.eng.start();
  };

  A.setMuted = function (m) {
    A.muted = m;
    try { localStorage.setItem('runner-muted', m ? '1' : '0'); } catch (e) {}
    if (A.master) A.master.gain.setTargetAtTime(m ? 0 : 0.8, A.ctx.currentTime, 0.05);
  };

  const ok = () => A.ctx && A.ctx.state === 'running' && !A.muted;

  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  }
  function noise(freq, q, peak, dur, delay, type) {
    const c = A.ctx, t = c.currentTime + (delay || 0);
    const s = c.createBufferSource(); s.buffer = A.noise;
    const f = c.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); env(g, t, 0.004, peak, dur);
    s.connect(f); f.connect(g); g.connect(A.master);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  // pitch path: [[time, freq], ...]
  function tone(type, path, peak, dur, delay, bp, q) {
    const c = A.ctx, t = c.currentTime + (delay || 0);
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(path[0][1], t);
    for (const [pt, f] of path.slice(1)) o.frequency.linearRampToValueAtTime(f, t + pt);
    const g = c.createGain(); env(g, t, 0.01, peak, dur);
    let node = o;
    if (bp) { const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bp; f.Q.value = q || 1.2; o.connect(f); node = f; }
    node.connect(g); g.connect(A.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  A.step = v => { if (ok()) noise(350 + v * 500, 1.1, 0.05 + v * 0.1, 0.045); };
  A.bark = () => {
    if (!ok()) return;
    for (const dl of [0, 0.19]) {
      tone('sawtooth', [[0, 470], [0.05, 520], [0.13, 270]], 0.28, 0.13, dl, 950, 1.6);
      noise(1300, 1.4, 0.12, 0.09, dl);
    }
  };
  A.meow = () => { if (ok()) tone('sawtooth', [[0, 520], [0.18, 840], [0.5, 560]], 0.2, 0.55, 0, 1100, 2.2); };
  A.cluck = () => {
    if (!ok()) return;
    for (const dl of [0, 0.1, 0.24]) tone('square', [[0, 720], [0.06, 470]], 0.07, 0.06, dl, 1200, 1.5);
  };
  A.thump = s => { if (ok()) tone('sine', [[0, 130], [0.18, 45]], 0.35 * Math.min(1, s), 0.2); };
  A.yelp = () => { if (ok()) tone('triangle', [[0, 900], [0.08, 1500], [0.2, 1100]], 0.25, 0.22, 0, 1400, 1); };
  A.horn = vol => {
    if (!ok()) return;
    for (const f of [392, 494]) tone('square', [[0, f], [0.4, f]], 0.1 * vol, 0.4, 0, 1000, 0.7);
  };
  A.chime = () => {
    if (!ok()) return;
    tone('sine', [[0, 880], [0.3, 880]], 0.12, 0.3);
    tone('sine', [[0, 1320], [0.4, 1320]], 0.09, 0.4, 0.07);
  };
  A.whoosh = () => { if (ok()) noise(700, 0.6, 0.08, 0.25); };
  A.alarm = () => {
    if (!ok()) return;
    tone('square', [[0, 660], [0.18, 660]], 0.08, 0.18, 0, 1500, 0.8);
    tone('square', [[0, 440], [0.3, 380]], 0.08, 0.3, 0.2, 1200, 0.8);
  };
  A.alert = () => { if (ok()) tone('triangle', [[0, 520], [0.1, 900]], 0.08, 0.12); };

  // continuous sounds follow the game state
  A.update = function (s) {
    if (!A.ctx || A.ctx.state !== 'running') return;
    const t = A.ctx.currentTime;
    const near = Math.max(0, 1 - s.carDist / 32);
    A.engG.gain.setTargetAtTime(near * near * 0.09, t, 0.1);
    A.eng.frequency.setTargetAtTime(42 + s.carSpeed * 5, t, 0.2);
    A.amb.gain.setTargetAtTime(s.night ? 0.12 : 0.2, t, 0.5);
  };

  R.audio = A;
})(window.R = window.R || {});
