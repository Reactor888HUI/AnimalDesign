(function (R) {
  // [color, emissive, emissiveIntensity]
  const D = {
    road:    { day: [0x3d4048], night: [0x15171d] },
    side:    { day: [0xa4a29c], night: [0x20232e] },
    curb:    { day: [0xc2bfb6], night: [0x4a4c66] },
    dash:    { day: [0xeee8cf], night: [0x3a4160] },
    pole:    { day: [0x59606b], night: [0x5a5f78] },
    globe:   { day: [0xf2eccf], night: [0xffe9a0, 0xffc050, 0.95] },
    winLit:  { day: [0xa9cfe8], night: [0x2c200c, 0xffa828, 0.6] },
    winDark: { day: [0x6d8ba5], night: [0x0b0d16] },
    shop0:   { day: [0xb4dcee], night: [0x2a1c08, 0xffb040, 0.78] },
    shop1:   { day: [0xe6c9d8], night: [0x2a0c18, 0xff5a9a, 0.72] },
    shop2:   { day: [0xbfe0d8], night: [0x08262a, 0x40c8e8, 0.72] },
    awn0:    { day: [0xc84a3c], night: [0x6a2a28] },
    awn1:    { day: [0x2f7d8c], night: [0x1c3c48] },
    awn2:    { day: [0xe0a020], night: [0x6a5018] },
    trunk:   { day: [0x6b4a30], night: [0x2e2218] },
    foliage0:{ day: [0x4e9a3c], night: [0x1c3a24] },
    foliage1:{ day: [0x6cb450], night: [0x264a2c] },
    bench:   { day: [0x9a6a42], night: [0x3a2a1e] },
    bin:     { day: [0x4f6a60], night: [0x222c2e] },
    crate:   { day: [0xc29a5c], night: [0x4a3a24] },
    cone:    { day: [0xf26a1c], night: [0xb8480e, 0x401800, 0.3] },
    barrier: { day: [0xf0f0ea], night: [0xc8c8d0, 0x202028, 0.3] },
    car0:    { day: [0xc23a3a], night: [0x4a1c22] },
    car1:    { day: [0x3a68c2], night: [0x1c2a4a] },
    car2:    { day: [0xe6e2d6], night: [0x44444e] },
    carGlass:{ day: [0x384858], night: [0x0c1018] },
    tire:    { day: [0x1c1c20], night: [0x08080c] },
    rooftop: { day: [0x8c8f96], night: [0x2a2c38] },
  };
  const WALL = {
    day:   [0xeadbc0, 0xdcae9e, 0xbcd0da, 0xe6dba8, 0xcdb8a4, 0xaec8b6],
    night: [0x30344a, 0x3a3534, 0x2a3446, 0x38342c, 0x2e3a3a, 0x40344a],
  };
  const ROOF = {
    day:   [0x8a5a44, 0x6b7a86, 0x8c8470, 0x9a6a5a, 0x6f8a80],
    night: [0x38261a, 0x1c2c3c, 0x282620, 0x2e2020, 0x1e2c2a],
  };
  WALL.day.forEach((c, i) => { D['wall' + i] = { day: [c], night: [WALL.night[i]] }; });
  ROOF.day.forEach((c, i) => { D['roof' + i] = { day: [c], night: [ROOF.night[i]] }; });

  const cache = {};
  let theme = 'night';

  function paint(m, def) {
    const t = def[theme];
    m.color.setHex(t[0]);
    if (m.emissive) {
      m.emissive.setHex(t[1] || 0x000000);
      m.emissiveIntensity = t[2] || 0;
    }
  }

  R.mat = function (key) {
    if (cache[key]) return cache[key];
    let m;
    if (key === 'pool') {
      m = new THREE.MeshBasicMaterial({
        map: R.glowTexture(), color: 0xffb468, transparent: true,
        opacity: R.THEMES[theme].lamps ? 0.75 : 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      m.polygonOffset = true; m.polygonOffsetFactor = -2;
    } else {
      const def = D[key];
      if (!def) throw new Error('material key ' + key);
      m = new THREE.MeshLambertMaterial({ color: 0xffffff });
      paint(m, def);
    }
    cache[key] = m;
    return m;
  };

  R.applyMaterialTheme = function (name) {
    theme = name;
    for (const key in cache) {
      if (key === 'pool') cache[key].opacity = R.THEMES[name].lamps ? 0.75 : 0;
      else paint(cache[key], D[key]);
    }
  };
})(window.R = window.R || {});
