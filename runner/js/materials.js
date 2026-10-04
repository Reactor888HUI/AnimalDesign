(function (R) {
  // A handful of shared materials. Almost the whole city is vertex-coloured, so one
  // cell costs only a few draw calls.
  const cache = {};
  let theme = 'night';

  const mk = {
    solid: () => new THREE.MeshLambertMaterial({ vertexColors: true }),
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
      m.emissiveIntensity = T.lamps ? 1.05 : 0;
    } else if (key === 'light') {
      m.emissiveIntensity = T.lamps ? 1 : 0;
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
