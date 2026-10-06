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
    if (R.music) R.music.init(A);
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
  // A bark is a short, rough, noisy "woof": a buzzy voice with a rising-then-falling pitch,
  // distorted and shaped by mouth formants, plus a puff of breath.
  let shaper = null;
  function rough() {
    if (shaper) return shaper;
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; curve[i] = Math.tanh(x * 6) * 0.9; }
    shaper = curve;
    return curve;
  }
  function woof(delay, f0, vol) {
    const c = A.ctx, t = c.currentTime + delay, dur = 0.2;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    env.gain.setValueAtTime(vol, t + 0.05);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const out = c.createBiquadFilter(); out.type = 'lowpass'; out.frequency.value = 3800;
    env.connect(out); out.connect(A.master);

    const ws = c.createWaveShaper(); ws.curve = rough(); ws.oversample = '2x';
    const pre = c.createGain(); pre.gain.value = 1.4;
    for (const [type, mul, g] of [['sawtooth', 1, 0.6], ['square', 0.5, 0.35], ['sawtooth', 1.007, 0.4]]) {
      const o = c.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0 * 1.1 * mul, t);
      o.frequency.linearRampToValueAtTime(f0 * 1.35 * mul, t + 0.035);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.62 * mul, t + dur);
      const og = c.createGain(); og.gain.value = g;
      o.connect(og); og.connect(pre);
      o.start(t); o.stop(t + dur + 0.05);
    }
    // jitter makes it growly instead of a clean tone
    const lfo = c.createOscillator(); lfo.frequency.value = 38;
    const lg = c.createGain(); lg.gain.value = 0.35;
    lfo.connect(lg); lg.connect(pre.gain); lfo.start(t); lfo.stop(t + dur + 0.05);
    pre.connect(ws);
    for (const [f, q, g] of [[620, 2.5, 1.0], [1250, 3.5, 0.7], [2500, 4, 0.3]]) {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const bg = c.createGain(); bg.gain.value = g;
      ws.connect(bp); bp.connect(bg); bg.connect(env);
    }
    // breath
    const s = c.createBufferSource(); s.buffer = A.noise;
    const nb = c.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = 1700; nb.Q.value = 0.7;
    const ng = c.createGain(); ng.gain.value = 0.55;
    s.connect(nb); nb.connect(ng); ng.connect(env);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  // f0: voice pitch (a big dog is lower); two barks: "woof-woof"
  A.bark = f0 => {
    if (!ok()) return;
    f0 = f0 || 300;
    woof(0, f0, 0.5);
    woof(0.24, f0 * 0.94, 0.42);
  };
  A.snap = () => {
    if (!ok()) return;
    noise(2400, 0.9, 0.35, 0.05);
    tone('sine', [[0, 160], [0.08, 70]], 0.3, 0.09);
  };
  // continuous growl while the dog pulls at something
  A.growl = on => {
    if (!A.ctx) return;
    const c = A.ctx, t = c.currentTime;
    if (on && !A.gr) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 78;
      const am = c.createOscillator(); am.frequency.value = 23;
      const amg = c.createGain(); amg.gain.value = 0.12;
      const g = c.createGain(); g.gain.value = 0.0001;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
      const ws = c.createWaveShaper(); ws.curve = rough();
      am.connect(amg); amg.connect(g.gain);
      o.connect(ws); ws.connect(lp); lp.connect(g); g.connect(A.master);
      o.start(); am.start();
      g.gain.setTargetAtTime(A.muted ? 0 : 0.22, t, 0.05);
      A.gr = { o, am, g };
    } else if (!on && A.gr) {
      const gr = A.gr; A.gr = null;
      gr.g.gain.setTargetAtTime(0.0001, t, 0.05);
      gr.o.stop(t + 0.3); gr.am.stop(t + 0.3);
    }
  };
  // quick sniffs through the nose: "fff-fff-fff"
  A.sniff = () => {
    if (!ok()) return;
    for (let i = 0; i < 3; i++) noise(3200 + i * 300, 1.4, 0.11, 0.07, i * 0.11);
  };
  A.dig = () => { if (ok()) { noise(600, 0.8, 0.3, 0.12); noise(1800, 1, 0.12, 0.08, 0.05); } };
  A.meow = () => { if (ok()) tone('sawtooth', [[0, 520], [0.18, 840], [0.5, 560]], 0.2, 0.55, 0, 1100, 2.2); };
  A.cluck = () => {
    if (!ok()) return;
    for (const dl of [0, 0.1, 0.24]) tone('square', [[0, 720], [0.06, 470]], 0.07, 0.06, dl, 1200, 1.5);
  };
  A.thump = s => { if (ok()) tone('sine', [[0, 130], [0.18, 45]], 0.35 * Math.min(1, s === undefined ? 1 : s), 0.2); };
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
  // double jump: a quick rising "boing" with air
  A.hop2 = () => { if (ok()) { tone('sine', [[0, 420], [0.16, 980]], 0.16, 0.2); noise(1500, 0.8, 0.07, 0.2); } };
  // a bone picked up: notes rise with every bone of a run
  A.pick = n => { if (ok()) { const f = 660 * Math.pow(2, Math.min(n, 10) / 12); tone('triangle', [[0, f], [0.05, f * 1.5]], 0.14, 0.14); } };
  A.alarm = () => {
    if (!ok()) return;
    tone('square', [[0, 660], [0.18, 660]], 0.08, 0.18, 0, 1500, 0.8);
    tone('square', [[0, 440], [0.3, 380]], 0.08, 0.3, 0.2, 1200, 0.8);
  };
  // the wardrobe's voices: a duck's quack, a dog that meows, a squeaky toy; a bell on the collar
  A.quack = () => {
    if (!ok()) return;
    for (const d of [0, 0.2]) tone('sawtooth', [[0, 520], [0.04, 620], [0.16, 380]], 0.22, 0.17, d, 900, 2.5);
  };
  A.dogMeow = () => { if (ok()) { tone('sawtooth', [[0, 380], [0.12, 620], [0.4, 420]], 0.2, 0.45, 0, 900, 2); } };
  A.squeak = () => { if (ok()) for (const d of [0, 0.16]) tone('square', [[0, 1500], [0.05, 2300], [0.12, 1700]], 0.07, 0.12, d, 2000, 3); };
  A.jingle = v => { if (ok()) for (let i = 0; i < 2; i++) tone('triangle', [[0, 3100 + i * 900], [0.2, 3000 + i * 900]], 0.035 * (v || 1), 0.22, i * 0.03); };
  // a flock taking off: a quick ripple of wing claps
  A.flutter = v => { if (!ok() || v <= 0.02) return; for (let i = 0; i < 7; i++) noise(900 + Math.random() * 900, 0.9, 0.05 * v, 0.06, i * 0.045 + Math.random() * 0.03); };
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
