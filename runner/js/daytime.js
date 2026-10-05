(function (R) {
  // Time of day: themes blend smoothly into each other. In "auto" the clock goes round
  // day -> sunset -> night -> dawn -> day in a few minutes; or a time is picked and kept.
  const COLORS = ['fog', 'hemiSky', 'hemiGround', 'sunColor', 'dust', 'spark', 'cloudCol', 'sunGlowCol'];
  const NUMS = ['fogDensity', 'hemiI', 'sunI', 'exposure', 'envI', 'lampK', 'starK', 'cloudK', 'sunGlowS'];
  const SKY = ['skyTop', 'skyMid', 'horizon'];
  const ca = new THREE.Color(), cb = new THREE.Color();
  const lerp = (a, b, k) => a + (b - a) * k;
  const mixHex = (a, b, k) => ca.setHex(a).lerp(cb.setHex(b), k).getHex();
  const mixArr = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
  const ONE = [1, 1, 1];

  R.mixTheme = function (a, b, k) {
    const o = { name: k < 0.5 ? a.name : b.name };
    for (const key of COLORS) o[key] = mixHex(a[key], b[key], k);
    for (const key of NUMS) o[key] = lerp(a[key], b[key], k);
    for (const key of SKY) o[key] = '#' + ca.set(a[key]).lerp(cb.set(b[key]), k).getHexString();
    o.sunOffset = mixArr(a.sunOffset, b.sunOffset, k);
    o.bloom = mixArr(a.bloom, b.bloom, k);
    const ga = a.grade, gb = b.grade;
    o.grade = {
      sat: lerp(ga.sat, gb.sat, k), vib: lerp(ga.vib || 0, gb.vib || 0, k), contrast: lerp(ga.contrast, gb.contrast, k), vig: lerp(ga.vig, gb.vig, k),
      tint: mixArr(ga.tint, gb.tint, k), shadow: mixArr(ga.shadow || ONE, gb.shadow || ONE, k), high: mixArr(ga.high || ONE, gb.high || ONE, k),
    };
    o.skyline = a.skyline.map((s, i) => { const t = b.skyline[i]; return [mixHex(s[0], t[0], k), lerp(s[1], t[1], k), lerp(s[2] || 0, t[2] || 0, k)]; });
    o.lamps = o.lampK > 0.5; o.stars = o.starK > 0.5; o.clouds = o.cloudK > 0.02;
    return o;
  };

  // the auto clock: [position in the cycle 0..1, theme]
  const AUTO = [[0, 'day'], [0.36, 'day'], [0.46, 'sunset'], [0.55, 'night'], [0.86, 'night'], [0.94, 'dawn'], [1, 'day']];
  const smooth = k => k * k * (3 - 2 * k);
  const MODES = ['auto', 'day', 'sunset', 'night'];

  class DayTime {
    constructor(mode) {
      this.mode = MODES.includes(mode) ? mode : 'auto';
      this.t = 0.3;                 // start in the afternoon: the first sunset comes soon
      this.cycle = 480;             // seconds for a whole day
      this.fade = null; this.live = null; this.fixed = {};
    }
    target() {
      if (this.mode !== 'auto') return this.fixed[this.mode] || (this.fixed[this.mode] = R.mixTheme(R.THEMES[this.mode], R.THEMES[this.mode], 0));
      let i = 0;
      while (i < AUTO.length - 2 && this.t >= AUTO[i + 1][0]) i++;
      const [t0, a] = AUTO[i], [t1, b] = AUTO[i + 1];
      return R.mixTheme(R.THEMES[a], R.THEMES[b], smooth(R.clamp((this.t - t0) / (t1 - t0), 0, 1)));
    }
    // pick a mode; the picture blends over from what is on screen now
    set(mode, instant) {
      this.mode = mode;
      this.fade = instant || !this.live ? null : { from: this.live, k: 0 };
      if (instant) this.live = null;
    }
    next() { return MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]; }
    update(dt) {
      if (this.mode === 'auto') this.t = (this.t + dt / this.cycle) % 1;
      let T = this.target();
      if (this.fade) {
        this.fade.k += dt / 1.6;
        if (this.fade.k >= 1) this.fade = null;
        else T = R.mixTheme(this.fade.from, T, smooth(this.fade.k));
      }
      this.live = T;
      return T;
    }
  }
  DayTime.MODES = MODES;
  R.DayTime = DayTime;
})(window.R = window.R || {});
