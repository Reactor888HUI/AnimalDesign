// «Восьмёрка Баклажан» — звук.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
"use strict";
/* ---------- звук: мотор и эффекты синтезируются на лету; песня вечеринки — файл игрока ---------- */
// песня вечеринки — 8 с из трека игрока (arcade/refs/music/party.mp3); в офлайн-сборке встроена в файл (data:)
const PARTY_MUSIC = "refs/music/party.mp3";   /*PARTY-MUSIC*/
// данные: arcade/data/sounds.js (tools/v8synth.py)
const sfx = (() => {
  let ac = null, master, lp, eng, eng2, engF, engG, jetG, skidG, noise;
  const on = () => save.sound !== false;
  function init() {
    if (ac || !on()) return;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; return; }
    master = ac.createGain(); master.gain.value = .9; lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 22000; master.connect(lp).connect(ac.destination);   // под водой звук глухой
    const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noise = buf;
    const loopNoise = (type, f, q) => { const src = ac.createBufferSource(); src.buffer = noise; src.loop = true; const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ac.createGain(); g.gain.value = 0; src.connect(fl).connect(g).connect(master); src.start(); return g; };
    // мотор: две пилы через фильтр
    eng = ac.createOscillator(); eng.type = "sawtooth"; eng2 = ac.createOscillator(); eng2.type = "square";
    engF = ac.createBiquadFilter(); engF.type = "lowpass"; engF.frequency.value = 700; engG = ac.createGain(); engG.gain.value = 0;
    const g2 = ac.createGain(); g2.gain.value = .35;
    eng.connect(engF); eng2.connect(g2).connect(engF); engF.connect(engG).connect(master); eng.start(); eng2.start();
    loadEngine();
    // внедорожник: суб-бас V8 — треугольник на 2-й гармонике коленвала и пила на частоте вспышек через резонансный фильтр
    // ~160 Гц; «бульканье» крестового вала — модуляция громкости с частотой распредвала
    SUB.g = ac.createGain(); SUB.g.gain.value = 0; SUB.lp = ac.createBiquadFilter(); SUB.lp.type = "lowpass"; SUB.lp.frequency.value = 165; SUB.lp.Q.value = 2.2;
    SUB.tri = ac.createOscillator(); SUB.tri.type = "triangle"; SUB.saw = ac.createOscillator(); SUB.saw.type = "sawtooth"; const sg = ac.createGain(); sg.gain.value = .45;
    SUB.tri.connect(SUB.lp); SUB.saw.connect(sg).connect(SUB.lp); SUB.lp.connect(SUB.g).connect(master);
    SUB.lfo = ac.createOscillator(); SUB.lfo.frequency.value = 6; SUB.lfoG = ac.createGain(); SUB.lfoG.gain.value = 0; SUB.lfo.connect(SUB.lfoG).connect(SUB.g.gain);
    [SUB.tri, SUB.saw, SUB.lfo].forEach(o => o.start());
    jetG = loopNoise("bandpass", 1400, .8);                   // шипение сопел
    skidG = loopNoise("bandpass", 650, 4);                    // визг шин
    // мост: гул стали под колёсами (низкий шум + тон пролёта), мотор подъёма (низкая пила) и скрип тросов/шестерён
    BR.hum = loopNoise("bandpass", 140, 1.4); BR.ring = loopNoise("bandpass", 420, 9);
    BR.motor = ac.createGain(); BR.motor.gain.value = 0; const mo = ac.createOscillator(), mf = ac.createBiquadFilter(); mo.type = "sawtooth"; mo.frequency.value = 48; mf.type = "lowpass"; mf.frequency.value = 260;
    mo.connect(mf).connect(BR.motor).connect(master); mo.start(); BR.mo = mo;
    BR.creak = loopNoise("bandpass", 1150, 14);
    loadMusic();
  }
  const unlock = () => { init(); if (ac && ac.state === "suspended") ac.resume(); };
  // звук разрешается только «жестом»: на сенсорном экране это отпускание пальца (pointerup/touchend/click), а не касание
  ["pointerdown", "pointerup", "touchend", "click", "keydown"].forEach(e => addEventListener(e, unlock, true));
  document.addEventListener("visibilitychange", () => { if (ac) document.hidden ? ac.suspend() : on() && ac.resume(); });
  let jet = 0; const BR = {}, SUB = { rpm: 800 };
  const set = (p, v, t = .06) => p.setTargetAtTime(v, ac.currentTime, t);
  // песня вечеринки — только файл игрока. Встроенную (data:) раскодируем сами, без fetch: в окне артефакта сеть закрыта
  let song = null, music = null, musicP = null;
  function loadMusic() {
    if (musicP || !ac) return;
    let bytes;
    if (PARTY_MUSIC.startsWith("data:")) { const bin = atob(PARTY_MUSIC.slice(PARTY_MUSIC.indexOf(",") + 1)); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
    else if (location.protocol === "file:") return;                                     // без сборки браузер не даёт прочитать файл с диска
    musicP = (bytes ? Promise.resolve(bytes.buffer) : fetch(PARTY_MUSIC).then(r => r.arrayBuffer()))
      .then(b => new Promise((ok, no) => ac.decodeAudioData(b, ok, no))).then(b => { music = b; }).catch(e => console.warn("музыка вечеринки", e));
  }
  // мотор по записи: три петли (холостые, средние, высокие) играют всё время, громкость — по близости оборотов к «родным»
  // оборотам петли, тон — playbackRate. «Восьмёрка» — выше и тоньше (мелкий мотор), PRO — ниже и с басом. Пока не загрузилось — синтез.
  const ENG = { ready: false, loops: [], bus: null, hp: null, low: null, stall: null };
  const unb64 = src => { const bin = atob(src.slice(src.indexOf(",") + 1)), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  const decode = src => new Promise((ok, no) => ac.decodeAudioData(unb64(src), ok, no));
  function loadEngine() {
    Promise.all([...ENGINE_SND.v8.map(l => decode(l.src)), decode(ENGINE_SND.stall)]).then(bufs => {
      const st = bufs.pop();
      ENG.bus = ac.createGain(); ENG.hp = ac.createBiquadFilter(); ENG.hp.type = "highpass"; ENG.hp.frequency.value = 40;
      ENG.low = ac.createBiquadFilter(); ENG.low.type = "lowshelf"; ENG.low.frequency.value = 160; ENG.low.gain.value = 0;
      ENG.bus.connect(ENG.hp).connect(ENG.low).connect(master);
      ENG.lp = ac.createBiquadFilter(); ENG.lp.type = "lowpass"; ENG.lp.frequency.value = 1500; ENG.lp.Q.value = .9;   // газ открывает «рык»
      ENG.lp.connect(ENG.bus);
      ENG.loops = ENGINE_SND.v8.map(({ rpm, L }, i) => {
        const src = ac.createBufferSource(), g = ac.createGain(); src.buffer = bufs[i]; src.loop = true; src.loopStart = L; src.loopEnd = 2 * L;
        g.gain.value = 0; src.connect(g).connect(ENG.lp); src.start(0, L); return { src, g, rpm };
      });
      ENG.stall = st; ENG.ready = true;
    }).catch(e => console.warn("звук мотора", e));
  }
  function engineSamples(e, amp, pro, thr) {                     // e — обороты мотора, об/мин
    const le = Math.log2(e), L = ENG.loops.map(l => Math.log2(l.rpm));
    ENG.loops.forEach((l, i) => {
      let w = 0;                                                  // треугольные веса между соседними петлями
      if (i === 0 && le <= L[0]) w = 1; else if (i === L.length - 1 && le >= L[i]) w = 1;
      else { if (i > 0 && le > L[i - 1] && le <= L[i]) w = (le - L[i - 1]) / (L[i] - L[i - 1]); if (i < L.length - 1 && le >= L[i] && le < L[i + 1]) w = 1 - (le - L[i]) / (L[i + 1] - L[i]); }
      set(l.g.gain, amp * Math.sqrt(w), .04); set(l.src.playbackRate, Math.max(.5, Math.min(2, e / l.rpm)), .04);
    });
    set(ENG.lp.frequency, 500 + thr * 4200 + e * .5, .08);         // сброс газа — глуше, газ в пол — открытый выхлоп
    set(ENG.hp.frequency, 28, .2); set(ENG.low.gain, pro ? 7 : 4, .2);
  }
  // поломанный двигатель (после аварии, жёсткого удара, утопления): мотор «чихает» — провалы и рывки оборотов, стук, хлопки
  const brk = { t: 0, cut: 0, cutT: 0, knock: 0 };
  function tick(dt, st) {
    if (!ac) return;
    jet = Math.max(0, jet - dt * 6);
    const v = Math.abs(st.speed), gear = Math.min(5, Math.floor(v / 12)), within = (v - gear * 12) / 12;
    let f = 48 + gear * 9 + within * 70 + st.throttle * 12, g = 1;  // «передачи»: тон растёт и проседает при переключении
    if (brk.t > 0) {
      brk.t -= dt; const k = Math.min(1, brk.t / 2);             // к концу поломки — всё ровнее
      if ((brk.cutT -= dt) <= 0) { brk.cut = Math.random() < .4 * k ? 1 : 0; brk.cutT = .06 + Math.random() * .2; }
      f *= .78 + .12 * Math.sin(ac.currentTime * 23) * k; g = brk.cut ? .12 : 1 + .4 * k;
      if ((brk.knock -= dt) <= 0 && !brk.cut) { brk.knock = .22 + Math.random() * .25; blip(t => { const o = ac.createOscillator(), gg = ac.createGain(); o.type = "square"; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(60, t + .05); gg.gain.setValueAtTime(.12 * k, t); gg.gain.exponentialRampToValueAtTime(.001, t + .07); o.connect(gg).connect(master); o.start(t); o.stop(t + .08); }); }
      if (Math.random() < dt * .9 * k) pop();
    }
    set(eng.frequency, f); set(eng2.frequency, f * .5);
    set(engF.frequency, 380 + st.throttle * 900 + v * 8);
    if (ENG.ready) {                                              // запись: «восьмёрка» крутится выше, PRO — ниже и басовитее
      let rpm = Math.max(780, 800 + (f - 48) / 127 * 6000) * (st.pro ? .88 : 1) * (brk.t > 0 ? .93 : 1);   // f — «обороты» игры 48…175 с проседаниями на передачах
      if (st.suv) { rpm = Math.max(700, rpm * .8); SUB.rpm += (rpm - SUB.rpm) * Math.min(1, dt / (rpm > SUB.rpm ? .16 : .32)); rpm = SUB.rpm; }   // большой V8: ниже обороты, тяжёлый маховик
      engineSamples(rpm, on() ? g * (st.air ? .35 : .5 + st.throttle * .35 + Math.min(.12, v * .003)) : 0, st.pro, st.air ? .2 : st.throttle);
      if (st.suv) set(ENG.low.gain, 8, .2);
      set(engG.gain, 0);
    } else set(engG.gain, on() ? g * (st.air ? .02 : .035 + st.throttle * .05 + Math.min(.03, v * .001)) : 0, brk.t > 0 ? .015 : .06);
    if (SUB.g) {
      const r = st.suv ? SUB.rpm : 800, k = on() && st.suv ? g * (st.air ? .1 : .16 + st.throttle * .2) : 0;
      set(SUB.tri.frequency, r / 30); set(SUB.saw.frequency, r / 15); set(SUB.lfo.frequency, r / 120);
      set(SUB.g.gain, k, .08); set(SUB.lfoG.gain, k * Math.max(.1, .5 - r / 9000), .08); set(SUB.lp.frequency, 150 + st.throttle * 30, .1);
    }
    set(jetG.gain, on() ? jet * .18 : 0, .03);
    set(skidG.gain, on() ? Math.min(.12, Math.max(0, st.skid - 3) * .02) : 0, .05);
  }
  function blip(fn) { if (ac && on()) fn(ac.currentTime); }
  function pop() { blip(t => {                                  // хлопок в глушителе
    const n = ac.createBufferSource(), g = ac.createGain(), fl = ac.createBiquadFilter(); n.buffer = noise; fl.type = "lowpass"; fl.frequency.value = 900;
    g.gain.setValueAtTime(.45, t); g.gain.exponentialRampToValueAtTime(.001, t + .12); n.connect(fl).connect(g).connect(master); n.start(t); n.stop(t + .15);
  }); }
  return {
    tick, unlock,
    broken(sec) { if (sec === undefined) return brk.t; brk.t = Math.max(brk.t, sec); },
    engReady: () => ENG.ready,
    stall: () => blip(t => {                                    // мотор глохнет (запись), на это время петли почти молчат
      if (!ENG.ready) return; const src = ac.createBufferSource(), g = ac.createGain(); src.buffer = ENG.stall; g.gain.value = .8;
      src.connect(g).connect(master); src.start(t); brk.cut = 1; brk.cutT = 1.6;
    }),
    jet() { jet = 1; },
    // звуки моста: hum — гул стали под колёсами 0…1, motor — мотор подъёма 0…1 (уже с учётом расстояния), creak — скрип 0…1
    bridge(hum, motor, creak) {
      if (!ac || !BR.hum) return; const ok = on() ? 1 : 0;
      set(BR.hum.gain, .55 * hum * ok, .12); set(BR.ring.gain, .12 * hum * ok, .2);
      set(BR.motor.gain, .16 * motor * ok, .3); BR.mo.frequency.setTargetAtTime(40 + 14 * motor, ac.currentTime, .4);
      set(BR.creak.gain, .05 * creak * ok * (.4 + .6 * Math.abs(Math.sin(ac.currentTime * 2.3) * Math.sin(ac.currentTime * .7))), .08);   // скрип — волнами
    },
    clack: (k = 1) => blip(t => {                              // стык рельсов: «тук-тук» двумя колёсными парами
      [0, .085].forEach((d, i) => { const n = ac.createBufferSource(), g = ac.createGain(), fl = ac.createBiquadFilter(); n.buffer = noise; fl.type = "bandpass"; fl.frequency.value = i ? 1700 : 2300; fl.Q.value = 3;
        g.gain.setValueAtTime(.0001, t + d); g.gain.exponentialRampToValueAtTime(.32 * k, t + d + .004); g.gain.exponentialRampToValueAtTime(.0001, t + d + .07);
        n.connect(fl).connect(g).connect(master); n.start(t + d); n.stop(t + d + .09); });
    }),
    clunk: (k = 1) => blip(t => {                              // пролёт встал: тяжёлый удар и звон стали
      const o = ac.createOscillator(), g = ac.createGain(); o.type = "sine"; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(48, t + .5);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.7 * k, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + .7); o.connect(g).connect(master); o.start(t); o.stop(t + .75);
      [312, 497, 803].forEach((f, i) => { const r = ac.createOscillator(), rg = ac.createGain(); r.type = "triangle"; r.frequency.value = f; rg.gain.setValueAtTime(.0001, t); rg.gain.exponentialRampToValueAtTime(.06 * k / (i + 1), t + .01); rg.gain.exponentialRampToValueAtTime(.0001, t + 1.6); r.connect(rg).connect(master); r.start(t); r.stop(t + 1.7); });
    }),
    shipHorn: (k = 1, len = 2.2) => blip(t => {                // гудок судна: низкий, два тона
      [98, 147].forEach(f => { const o = ac.createOscillator(), g = ac.createGain(), fl = ac.createBiquadFilter(); o.type = "sawtooth"; o.frequency.value = f; fl.type = "lowpass"; fl.frequency.value = 520;
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.16 * k, t + .15); g.gain.setValueAtTime(.16 * k, t + len - .3); g.gain.exponentialRampToValueAtTime(.0001, t + len);
        o.connect(fl).connect(g).connect(master); o.start(t); o.stop(t + len + .05); });
    }),
    burst: () => blip(t => {                                    // посадочный баллон: резкое «пш-ш» со спадом тона
      const n = ac.createBufferSource(), g = ac.createGain(), fl = ac.createBiquadFilter(); n.buffer = noise; fl.type = "bandpass"; fl.Q.value = .7;
      fl.frequency.setValueAtTime(2800, t); fl.frequency.exponentialRampToValueAtTime(420, t + .65);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.6, t + .03); g.gain.exponentialRampToValueAtTime(.001, t + .75);
      n.connect(fl).connect(g).connect(master); n.start(t); n.stop(t + .8);
    }),
    thump: (k = 1) => blip(t => {                              // удар / посадка
      const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + .25);
      g.gain.setValueAtTime(.5 * k, t); g.gain.exponentialRampToValueAtTime(.001, t + .35); o.connect(g).connect(master); o.start(t); o.stop(t + .4);
      const n = ac.createBufferSource(), ng = ac.createGain(), fl = ac.createBiquadFilter(); n.buffer = noise; fl.type = "lowpass"; fl.frequency.value = 500;
      ng.gain.setValueAtTime(.25 * k, t); ng.gain.exponentialRampToValueAtTime(.001, t + .25); n.connect(fl).connect(ng).connect(master); n.start(t); n.stop(t + .3);
    }),
    ring: () => blip(t => [880, 1320, 1760].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * .06); g.gain.linearRampToValueAtTime(.12, t + i * .06 + .01); g.gain.exponentialRampToValueAtTime(.001, t + i * .06 + .35);
      o.connect(g).connect(master); o.start(t + i * .06); o.stop(t + i * .06 + .4);
    })),
    crash: () => blip(t => {
      const n = ac.createBufferSource(), g = ac.createGain(), fl = ac.createBiquadFilter(); n.buffer = noise; fl.type = "lowpass"; fl.frequency.setValueAtTime(2500, t); fl.frequency.exponentialRampToValueAtTime(200, t + .8);
      g.gain.setValueAtTime(.6, t); g.gain.exponentialRampToValueAtTime(.001, t + .9); n.connect(fl).connect(g).connect(master); n.start(t); n.stop(t + 1);
    }),
    whoosh: () => blip(t => {
      const n = ac.createBufferSource(), g = ac.createGain(), fl = ac.createBiquadFilter(); n.buffer = noise; fl.type = "bandpass"; fl.Q.value = 1.2;
      fl.frequency.setValueAtTime(400, t); fl.frequency.exponentialRampToValueAtTime(2200, t + .35);
      g.gain.setValueAtTime(.3, t); g.gain.exponentialRampToValueAtTime(.001, t + .45); n.connect(fl).connect(g).connect(master); n.start(t); n.stop(t + .5);
    }),
    cheer: (k = 1) => blip(t => {                              // рёв трибун: шум «голосов» с дрожащей громкостью + свист
      const dur = 1.6 + k * 1.4, n = ac.createBufferSource(), g = ac.createGain(), fl = ac.createBiquadFilter(), lfo = ac.createOscillator(), lg = ac.createGain();
      n.buffer = noise; n.loop = true; fl.type = "bandpass"; fl.frequency.value = 950; fl.Q.value = .55;
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.32 * k, t + .25); g.gain.setValueAtTime(.32 * k, t + dur * .45); g.gain.exponentialRampToValueAtTime(.001, t + dur);
      lfo.frequency.value = 7; lg.gain.value = .1 * k; lfo.connect(lg).connect(g.gain);
      n.connect(fl).connect(g).connect(master); n.start(t); n.stop(t + dur + .1); lfo.start(t); lfo.stop(t + dur + .1);
      for (let i = 0; i < Math.round(1 + k * 2); i++) {
        const o = ac.createOscillator(), og = ac.createGain(), s0 = t + .2 + i * .35 + Math.random() * .2; o.type = "sine";
        o.frequency.setValueAtTime(1700 + Math.random() * 400, s0); o.frequency.exponentialRampToValueAtTime(2600 + Math.random() * 500, s0 + .25); o.frequency.exponentialRampToValueAtTime(1900, s0 + .45);
        og.gain.setValueAtTime(.0001, s0); og.gain.exponentialRampToValueAtTime(.05, s0 + .05); og.gain.exponentialRampToValueAtTime(.001, s0 + .5);
        o.connect(og).connect(master); o.start(s0); o.stop(s0 + .55);
      }
    }),
    ooh: () => blip(t => {                                      // «у-у-у» трибун: тёмный шум с опускающимся тоном
      const n = ac.createBufferSource(), g = ac.createGain(), fl = ac.createBiquadFilter(); n.buffer = noise; n.loop = true; fl.type = "bandpass"; fl.Q.value = 2.5;
      fl.frequency.setValueAtTime(700, t); fl.frequency.exponentialRampToValueAtTime(320, t + 1.4);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.28, t + .2); g.gain.exponentialRampToValueAtTime(.001, t + 1.6);
      n.connect(fl).connect(g).connect(master); n.start(t); n.stop(t + 1.7);
    }),
    song(play) {
      if (!ac) return;
      if (play && !song && on() && partyMus()) {
        const g = ac.createGain(), t0 = ac.currentTime + .03; g.gain.value = .85; g.connect(master);
        if (!music) { g.disconnect(); return; }                                         // песня ещё не готова — вечеринка без музыки
        const src = ac.createBufferSource(); src.buffer = music; src.connect(g); src.start(t0); song = { g, src, t0 };
        src.loop = true; src.loopEnd = Math.min(music.duration, 5 * 4 * PARTY_BEAT);   // по кругу ровно по 5 тактов: песня тянется через весь кино-повтор и праздник
      } else if (!play && song) { const { g, src } = song; g.gain.setTargetAtTime(0, ac.currentTime, .25); setTimeout(() => { try { src && src.stop(); } catch (e) {} g.disconnect(); }, 1500); song = null; }
    },
    under(on) { if (ac) lp.frequency.setTargetAtTime(on ? 650 : 22000, ac.currentTime, .08); },
    glug: () => blip(t => {                                    // бульканье: пузыри с поднимающимся тоном
      for (let i = 0; i < 9; i++) { const o = ac.createOscillator(), g = ac.createGain(), s0 = t + .15 + i * .17 + Math.random() * .08, f = 180 + Math.random() * 220; o.type = "sine";
        o.frequency.setValueAtTime(f, s0); o.frequency.exponentialRampToValueAtTime(f * 2.6, s0 + .09); g.gain.setValueAtTime(.0001, s0); g.gain.exponentialRampToValueAtTime(.22, s0 + .015); g.gain.exponentialRampToValueAtTime(.0001, s0 + .12);
        o.connect(g).connect(master); o.start(s0); o.stop(s0 + .14); }
    }),
    horn: () => blip(t => {                                    // гудок тепловоза
      [196, 247].forEach(f => { const o = ac.createOscillator(), g = ac.createGain(); o.type = "sawtooth"; o.frequency.value = f; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.08, t + .08); g.gain.setValueAtTime(.08, t + 1.1); g.gain.exponentialRampToValueAtTime(.0001, t + 1.5); o.connect(g).connect(master); o.start(t); o.stop(t + 1.6); });
    }),
    songPos: () => song && ac && ac.state === "running" ? ac.currentTime - song.t0 : null,
    partyLen: () => PARTY_LEN,
    musicReady: () => !!music, playing: () => !!song,
    state: () => ac ? ac.state : "off"
  };
})();

