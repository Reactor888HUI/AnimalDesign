(function (R) {
  R.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  R.lerp = (a, b, t) => a + (b - a) * t;
  R.damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  R.angDiff = (a, b) => {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  R.rng = function (seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  };

  let glow = null;
  R.glowTexture = function () {
    if (glow) return glow;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    glow = new THREE.CanvasTexture(c);
    return glow;
  };

  // a soft puffy cloud: a few overlapping blurred blobs
  let cloud = null;
  R.cloudTexture = function () {
    if (cloud) return cloud;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    const rnd = R.rng(7);
    for (let i = 0; i < 9; i++) {
      const x = 50 + rnd() * 156, y = 62 + (rnd() - 0.4) * 30, r = 26 + rnd() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)');
      gr.addColorStop(0.6, 'rgba(255,255,255,0.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 128);
    }
    cloud = new THREE.CanvasTexture(c);
    return cloud;
  };

  const skyCache = {};
  R.skyTexture = function (name) {
    if (skyCache[name]) return skyCache[name];
    const T = R.THEMES[name];
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, T.skyTop);
    gr.addColorStop(0.32, T.skyMid);
    gr.addColorStop(0.52, T.horizon);
    gr.addColorStop(1, T.horizon);
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 512);
    if (T.stars) {
      const rnd = R.rng(99);
      for (let i = 0; i < 110; i++) {
        const x = rnd() * 512, y = rnd() * 190, s = rnd() < 0.15 ? 1.8 : 1;
        g.fillStyle = 'rgba(255,255,255,' + (0.35 + rnd() * 0.6) + ')';
        g.fillRect(x, y, s, s);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    skyCache[name] = tex;
    return tex;
  };
})(window.R = window.R || {});
