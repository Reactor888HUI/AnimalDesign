(function (R) {
  // A handful of shared materials. Almost the whole city is vertex-coloured, so one
  // cell costs only a few draw calls.
  const cache = {};
  let theme = 'night';

  // ---- surface detail: small grey textures drawn in code, laid in world space -----------------
  // 1 asphalt, 2 sidewalk slabs, 3 paving bricks, 4 grass, 5 building walls, 6 gravel path, 7 concrete.
  // The texture only darkens/lightens the existing colour (mid grey = no change).
  const SZ = 256;
  function canvasTex(draw) {
    const c = document.createElement('canvas'); c.width = c.height = SZ;
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(160,160,160)'; g.fillRect(0, 0, SZ, SZ);
    draw(g, R.rng(draw.length * 7919 + 13));
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return t;
  }
  const speck = (g, rnd, n, lo, hi, smin, smax) => {
    for (let i = 0; i < n; i++) {
      const v = Math.round(lo + rnd() * (hi - lo)), s = smin + rnd() * (smax - smin);
      g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      const x = rnd() * SZ, y = rnd() * SZ;
      g.fillRect(x, y, s, s); g.fillRect(x - SZ, y, s, s); g.fillRect(x, y - SZ, s, s);
    }
  };
  let surf = null;
  R.surfaceTextures = function () {
    if (surf) return surf;
    surf = {
      asph: canvasTex((g, rnd) => {
        speck(g, rnd, 9000, 128, 192, 1, 2.2);
        for (let i = 0; i < 6; i++) { // darker repairs
          g.fillStyle = 'rgba(120,120,120,0.18)'; g.fillRect(rnd() * SZ, rnd() * SZ, 20 + rnd() * 60, 10 + rnd() * 40);
        }
        g.strokeStyle = 'rgba(95,95,95,0.7)'; g.lineWidth = 1.2;
        for (let i = 0; i < 3; i++) { // cracks
          let x = rnd() * SZ, y = rnd() * SZ; g.beginPath(); g.moveTo(x, y);
          for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 30; y += rnd() * 18; g.lineTo(x, y); }
          g.stroke();
        }
      }),
      slab: canvasTex((g, rnd) => {
        speck(g, rnd, 5000, 140, 182, 1, 2);
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { // each slab a touch different
          const v = 150 + Math.round(rnd() * 22);
          g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.35)'; g.fillRect(i * 128 + 3, j * 128 + 3, 122, 122);
        }
        g.fillStyle = 'rgb(108,108,108)';
        g.fillRect(0, 0, SZ, 4); g.fillRect(0, 126, SZ, 4); g.fillRect(0, 0, 4, SZ); g.fillRect(126, 0, 4, SZ);
      }),
      pave: canvasTex((g, rnd) => {
        const bw = 64, bh = 32;
        for (let row = 0; row < SZ / bh; row++) for (let col = -1; col < SZ / bw + 1; col++) {
          const x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh, v = 145 + Math.round(rnd() * 34);
          g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        }
        speck(g, rnd, 2500, 135, 185, 1, 2);
        g.fillStyle = 'rgba(100,100,100,1)';
        for (let row = 0; row <= SZ / bh; row++) g.fillRect(0, row * bh - 2, SZ, 3);
      }),
      grass: canvasTex((g, rnd) => {
        speck(g, rnd, 2500, 120, 200, 3, 9);
        for (let i = 0; i < 7000; i++) { // blades
          const v = Math.round(115 + rnd() * 95), x = rnd() * SZ, y = rnd() * SZ;
          g.strokeStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 3, y - 2 - rnd() * 4); g.stroke();
        }
      }),
      brick: canvasTex((g, rnd) => {
        const bw = 64, bh = 21.33;
        g.fillStyle = 'rgb(125,125,125)'; g.fillRect(0, 0, SZ, SZ);
        for (let row = 0; row < 12; row++) for (let col = -1; col < 5; col++) {
          const x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh, v = 150 + Math.round(rnd() * 34);
          g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        }
        speck(g, rnd, 3000, 140, 185, 1, 2);
      }),
      gravel: canvasTex((g, rnd) => { speck(g, rnd, 6000, 115, 205, 2, 4.5); }),
      conc: canvasTex((g, rnd) => {
        speck(g, rnd, 7000, 140, 182, 1, 2.5);
        for (let i = 0; i < 10; i++) { const v = 145 + Math.round(rnd() * 25); g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.3)'; g.fillRect(rnd() * SZ, rnd() * SZ, 30 + rnd() * 80, 30 + rnd() * 80); }
      }),
    };
    return surf;
  };

  // the city's main material with the surface detail added in the fragment shader
  function solidMaterial() {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    const T = R.surfaceTextures();
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, {
        tAsph: { value: T.asph }, tSlab: { value: T.slab }, tPave: { value: T.pave }, tGrass: { value: T.grass },
        tBrick: { value: T.brick }, tGravel: { value: T.gravel }, tConc: { value: T.conc },
      });
      sh.vertexShader = 'attribute float aSurf;\nvarying float vSurf;\nvarying vec3 vWPos;\nvarying vec3 vWNorm;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vSurf = aSurf;
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vWNorm = normalize(mat3(modelMatrix) * objectNormal);`);
      sh.fragmentShader = 'uniform sampler2D tAsph, tSlab, tPave, tGrass, tBrick, tGravel, tConc;\nvarying float vSurf;\nvarying vec3 vWPos;\nvarying vec3 vWNorm;\n' +
        sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          if (vSurf > 0.5) {
            float s = floor(vSurf + 0.5), d = 0.627;
            vec2 g = vWPos.xz;
            // a second, much larger lookup breaks the repeat of the ground textures
            float macro = texture2D(tConc, g / 41.0 + 0.37).r * 1.595;
            if (s < 1.5) d = texture2D(tAsph, g / 5.0).r * macro;
            else if (s < 2.5) d = texture2D(tSlab, g / 2.0).r;
            else if (s < 3.5) d = texture2D(tPave, g / 1.6).r;
            else if (s < 4.5) d = texture2D(tGrass, g / 3.0).r * macro;
            else if (s < 5.5) {
              // walls: bricks on red-brown walls, a fine plaster grain on the others; roofs stay plain
              if (abs(vWNorm.y) < 0.5) {
                vec2 w = vec2(abs(vWNorm.x) > abs(vWNorm.z) ? vWPos.z : vWPos.x, vWPos.y);
                float red = smoothstep(0.04, 0.14, vColor.r - vColor.g);
                d = mix(mix(0.627, texture2D(tConc, w / 3.0).r, 0.6), texture2D(tBrick, w / 2.2).r, red);
              }
            }
            else if (s < 6.5) d = texture2D(tGravel, g / 2.0).r;
            else d = texture2D(tConc, g / 3.0).r;
            diffuseColor.rgb *= d * 1.595;
          }`);
    };
    m.customProgramCacheKey = () => 'solid-surf';
    return m;
  }

  const mk = {
    solid: solidMaterial,
    glass: () => {
      const m = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x000000 });
      // every window gets a random on/off from its position in the world
      m.onBeforeCompile = sh => {
        sh.vertexShader = 'attribute float aRand;\nvarying float vRand;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRand = aRand;');
        sh.fragmentShader = 'varying float vRand;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance *= smoothstep(0.26, 0.3, vRand) * (0.8 + 0.2 * fract(vRand * 9.0));`);
      };
      return m;
    },
    facade: () => new THREE.MeshLambertMaterial({ vertexColors: true, map: R.facadeTexture() }),
    // car lights: glow in their own colour at night
    light: () => {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffffff });
      mat.onBeforeCompile = sh => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= vColor * 2.4;');
      };
      return mat;
    },
    // soft halos round street lamps at night (one Points object per block)
    halo: () => new THREE.PointsMaterial({
      map: R.glowTexture(), color: 0xffc27a, size: 3.4, sizeAttenuation: true, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }),
    pool: () => {
      const m = new THREE.MeshBasicMaterial({
        map: R.glowTexture(), color: 0xffb468, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      m.polygonOffset = true; m.polygonOffsetFactor = -2;
      return m;
    },
  };

  function paint(key, m) {
    const T = R.THEMES[theme];
    if (key === 'glass') {
      m.color.setHex(T.lamps ? 0x303038 : 0xffffff);
      m.emissive.setHex(0xff9a3c);
      m.emissiveIntensity = T.lamps ? 1.35 : 0;   // bright enough for the night glow (bloom)
    } else if (key === 'light') {
      m.emissiveIntensity = T.lamps ? 1 : 0;
    } else if (key === 'halo') {
      m.opacity = T.lamps ? 0.75 : 0;
    } else if (key === 'pool') {
      m.opacity = T.lamps ? 0.6 : 0;
    }
  }

  R.mat = function (key) {
    if (!cache[key]) { cache[key] = mk[key](); paint(key, cache[key]); }
    return cache[key];
  };

  // textured parts of the model pack (tree, bus, ...): one lambert material per texture
  R.texMat = function (map) {
    const key = 'tex:' + map.uuid;
    if (!cache[key]) {
      map.encoding = THREE.LinearEncoding; // the renderer outputs linear, so show the texture as authored
      map.needsUpdate = true;
      cache[key] = new THREE.MeshLambertMaterial({ map });
    }
    return cache[key];
  };

  R.applyMaterialTheme = function (name) {
    theme = name;
    for (const key in cache) paint(key, cache[key]);
  };

  // far-off city on the horizon: building silhouettes (white, tinted per theme) and their lit windows
  R.skylineTextures = function (seed, lo, hi) {
    const W = 2048, H = 256, rnd = R.rng(seed);
    const body = document.createElement('canvas'), win = document.createElement('canvas');
    body.width = win.width = W; body.height = win.height = H;
    const b = body.getContext('2d'), w = win.getContext('2d');
    b.fillStyle = '#fff'; w.fillStyle = '#ffd9a0';
    let x = 0;
    while (x < W) {
      const bw = 18 + rnd() * 70, bh = H * (lo + (hi - lo) * Math.pow(rnd(), 1.6));
      const top = H - bh;
      b.fillRect(x, top, bw + 1, bh);
      if (rnd() < 0.3) b.fillRect(x + bw * 0.3, top - bh * 0.12, bw * 0.4, bh * 0.12 + 1);   // a step on the roof
      if (rnd() < 0.15) b.fillRect(x + bw * 0.5, top - 14, 2, 14);                               // an antenna
      for (let wy = top + 6; wy < H - 6; wy += 7) for (let wx = x + 4; wx < x + bw - 4; wx += 6) {
        if (rnd() < 0.22) w.fillRect(wx, wy, 3, 3);
      }
      x += bw + (rnd() < 0.2 ? rnd() * 20 : 0);
    }
    const mk = c => { const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
    return { body: mk(body), win: mk(win) };
  };

  // window pattern for far-away blocks (white wall, dark windows; tinted by vertex colour)
  let ft = null;
  R.facadeTexture = function () {
    if (ft) return ft;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#3d4658';
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.fillRect(8 + x * 32, 10 + y * 32, 16, 20);
    ft = new THREE.CanvasTexture(c);
    ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
    ft.encoding = THREE.LinearEncoding;
    return ft;
  };
})(window.R = window.R || {});
