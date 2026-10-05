(function (R) {
  // Music, synthesised like the other sounds. One loop in A minor at 100 BPM, in layers:
  // a soft pad is always there; a plucked arpeggio, a bass line and drums come in as the game
  // gets tense (a chase, a thief), and drop out again when things calm down.
  // At night the pad is darker. Notes are scheduled a little ahead on the audio clock.
  const BPM = 100, STEP = 60 / BPM / 4;            // one step = a 16th note
  const N = n => 440 * Math.pow(2, (n - 69) / 12);  // midi note -> Hz
  // chords as midi notes; calm and tense progressions, two bars each chord
  const CALM = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];      // Am F C G
  const TENSE = [[57, 60, 64], [57, 60, 64], [50, 53, 57], [52, 56, 59]];     // Am Am Dm E
  const ARP = [0, 1, 2, 1, 0, 2, 1, 2];                                       // which chord tone, per 8th / 16th

  const M = { on: true, level: 0.2, want: 0.2, night: false, ready: false };
  try { M.on = localStorage.getItem('runner-music') !== '0'; } catch (e) {}

  M.init = function (A) {
    if (M.ready) return;
    const c = A.ctx;
    M.A = A; M.c = c;
    M.bus = c.createGain(); M.bus.gain.value = M.on ? 0.3 : 0;
    M.bus.connect(A.master);
    // a soft echo for the plucks
    M.echo = c.createDelay(1); M.echo.delayTime.value = STEP * 3;
    const fb = c.createGain(); fb.gain.value = 0.28;
    const elp = c.createBiquadFilter(); elp.type = 'lowpass'; elp.frequency.value = 2200;
    M.echo.connect(elp); elp.connect(fb); fb.connect(M.echo);
    const ew = c.createGain(); ew.gain.value = 0.35; elp.connect(ew); ew.connect(M.bus);
    // a gain per layer, faded by the level
    M.g = {};
    for (const k of ['pad', 'arp', 'bass', 'drums']) { M.g[k] = c.createGain(); M.g[k].gain.value = 0; M.g[k].connect(M.bus); }
    M.g.arp.connect(M.echo);
    M.padLP = c.createBiquadFilter(); M.padLP.type = 'lowpass'; M.padLP.frequency.value = 900;
    M.padLP.connect(M.g.pad);
    M.step = 0; M.next = c.currentTime + 0.1; M.chord = null;
    M.ready = true;
  };

  M.setOn = function (on) {
    M.on = on;
    try { localStorage.setItem('runner-music', on ? '1' : '0'); } catch (e) {}
    if (M.ready) M.bus.gain.setTargetAtTime(on ? 0.3 : 0, M.c.currentTime, 0.3);
  };

  function voice(type, f, t, a, hold, r, peak, dest, detune) {
    const c = M.c, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = f; if (detune) o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + a + hold + r + 0.05);
  }
  function hit(t, kind) {
    const c = M.c, A = M.A;
    if (kind === 'kick') {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g); g.connect(M.g.drums); o.start(t); o.stop(t + 0.3);
      return;
    }
    const s = c.createBufferSource(); s.buffer = A.noise;
    const f = c.createBiquadFilter(), g = c.createGain();
    if (kind === 'snare') { f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8; g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); }
    else { f.type = 'highpass'; f.frequency.value = 7000; g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04); }
    s.connect(f); f.connect(g); g.connect(M.g.drums);
    s.start(t, Math.random()); s.stop(t + 0.2);
  }

  function schedule(i, t) {
    const bar = Math.floor(i / 16), s = i % 16;
    // a new chord every two bars; the tense progression when the game is tense
    if (i % 32 === 0) {
      const prog = M.level > 0.6 ? TENSE : CALM;
      M.chord = prog[(bar / 2) % prog.length | 0];
      for (const n of M.chord) for (const d of [-7, 7]) voice('sawtooth', N(n), t, 0.9, STEP * 32 - 1.2, 1.4, 0.035, M.padLP, d);
    }
    const ch = M.chord || CALM[0];
    // arpeggio: 8ths when calm, 16ths when tense, an octave up
    if (M.level > 0.15 && (s % 2 === 0 || M.level > 0.7)) {
      const n = ch[ARP[(s >> (M.level > 0.7 ? 0 : 1)) % ARP.length]] + 12;
      voice('triangle', N(n), t, 0.005, 0.02, 0.22, 0.12, M.g.arp);
    }
    // bass: the root on the beats, pushing 8ths when tense
    if (M.level > 0.35 && (s % 4 === 0 || (M.level > 0.65 && s % 2 === 0))) voice('sawtooth', N(ch[0] - 24), t, 0.01, STEP * 1.2, 0.12, 0.22, M.g.bass);
    // drums
    if (M.level > 0.5) {
      if (s === 0 || s === 8 || (M.level > 0.75 && s === 10)) hit(t, 'kick');
      if (s === 4 || s === 12) hit(t, 'snare');
      if (s % 2 === 0 || M.level > 0.8) hit(t, 'hat');
    }
  }

  // the game says how tense it is (0..1) and whether it is night; a timer (not the frames, which
  // can stall) schedules the notes and lets the music follow the level over a couple of seconds
  M.update = function (level, night) { M.want = level; M.night = night; };
  function tick() {
    if (!M.ready || M.c.state !== 'running') return;
    const c = M.c, now = c.currentTime, dt = Math.min(1, now - (M.lastT || now));
    M.lastT = now;
    M.level += (M.want - M.level) * (1 - Math.exp(-dt / 2.2));
    M.padLP.frequency.setTargetAtTime(M.night ? 650 : 1100, now, 1.5);
    const L = M.level, fade = (g, v) => g.gain.setTargetAtTime(v, now, 0.8);
    fade(M.g.pad, 0.9 - 0.3 * L);
    fade(M.g.arp, L > 0.15 ? 0.6 : 0);
    fade(M.g.bass, L > 0.35 ? 0.55 : 0);
    fade(M.g.drums, L > 0.5 ? 0.5 : 0);
    if (M.next < now - 0.5) M.next = now + 0.05;         // the tab was asleep: start again
    while (M.next < now + 0.25) { if (M.on) schedule(M.step, M.next); M.step++; M.next += STEP; }
  }
  setInterval(tick, 50);

  R.music = M;
})(window.R = window.R || {});
