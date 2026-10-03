(function (R) {
  const C = R.C;
  const lam = c => new THREE.MeshLambertMaterial({ color: c });
  const glow = (c, i) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: i });

  function part(parent, geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  const bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const sp = r => new THREE.SphereGeometry(r, 10, 8);

  // leg that swings around its hip (local Z axis; the model looks along +X)
  function leg(parent, x, y, z, len, w, mat, pawMat) {
    const hip = new THREE.Group();
    hip.position.set(x, y, z);
    part(hip, bx(w, len, w), mat, 0, -len / 2, 0);
    part(hip, bx(w * 1.15, len * 0.2, w * 1.35), pawMat, w * 0.12, -len + len * 0.1, 0);
    parent.add(hip);
    return hip;
  }

  // Both procedural animals are built facing +X, then turned so that the entity faces -Z (heading 0).
  function wrap(model) {
    const root = new THREE.Group();
    model.rotation.y = Math.PI / 2;
    root.add(model);
    return root;
  }

  function makeProceduralDog() {
    const m = new THREE.Group();
    const fur = lam(0xC8A05A), furL = lam(0xD9B26E), dark = lam(0x8F6A38), black = lam(0x111111);
    part(m, bx(1.4, 0.7, 0.8), fur, 0, 0.85, 0);
    part(m, bx(0.7, 0.66, 0.7), furL, 0.88, 1.12, 0);
    part(m, bx(0.46, 0.32, 0.46), dark, 1.34, 0.98, 0);
    part(m, sp(0.1), black, 1.6, 1.03, 0);
    for (const s of [-1, 1]) {
      part(m, bx(0.16, 0.5, 0.24), dark, 0.74, 1.0, s * 0.4);
      part(m, sp(0.07), black, 1.24, 1.24, s * 0.27);
    }
    part(m, bx(0.2, 0.12, 0.72), lam(0xB8323C), 0.58, 0.98, 0); // collar
    const tail = new THREE.Group();
    tail.position.set(-0.72, 1.0, 0);
    tail.rotation.z = 0.7;
    part(tail, bx(0.56, 0.15, 0.15), fur, -0.28, 0, 0);
    m.add(tail);
    const legs = [
      leg(m, 0.52, 0.5, 0.28, 0.5, 0.2, fur, dark),
      leg(m, 0.52, 0.5, -0.28, 0.5, 0.2, fur, dark),
      leg(m, -0.52, 0.5, 0.28, 0.5, 0.2, fur, dark),
      leg(m, -0.52, 0.5, -0.28, 0.5, 0.2, fur, dark),
    ];
    const root = wrap(m);
    let ph = 0;
    return {
      kind: 'procedural', root,
      update(dt, s) {
        ph += dt * (s.speed01 > 0.02 ? 5 + s.speed01 * 13 : 0);
        const amp = 0.25 + s.speed01 * 0.8;
        if (s.air) {
          legs[0].rotation.z = legs[1].rotation.z = 0.9;
          legs[2].rotation.z = legs[3].rotation.z = -0.9;
        } else if (s.speed01 > 0.02) {
          legs[0].rotation.z = Math.sin(ph) * amp;
          legs[1].rotation.z = Math.sin(ph + 0.5) * amp;
          legs[2].rotation.z = Math.sin(ph + Math.PI) * amp;
          legs[3].rotation.z = Math.sin(ph + Math.PI + 0.5) * amp;
        } else {
          for (const l of legs) l.rotation.z *= 0.85;
        }
        m.position.y = s.air ? 0 : Math.abs(Math.sin(ph)) * 0.07 * s.speed01;
        tail.rotation.y = Math.sin(performance.now() * 0.012 * (1 + s.speed01)) * 0.55;
      },
    };
  }

  function makeProceduralCat() {
    const m = new THREE.Group();
    const fur = lam(0xD9722A), furD = lam(0xB85A1E), belly = lam(0xF2E2C8), black = lam(0x111111);
    part(m, bx(0.95, 0.46, 0.46), fur, 0, 0.62, 0);
    part(m, bx(0.46, 0.42, 0.46), fur, 0.62, 0.84, 0);
    part(m, bx(0.2, 0.16, 0.3), belly, 0.88, 0.76, 0);
    part(m, sp(0.045), lam(0xE07088), 1.0, 0.82, 0);
    for (const s of [-1, 1]) {
      const ear = part(m, new THREE.ConeGeometry(0.11, 0.26, 4), furD, 0.6, 1.15, s * 0.16);
      ear.rotation.y = Math.PI / 4;
      part(m, sp(0.075), glow(0x66ff66, 1.0), 0.84, 0.92, s * 0.14);
    }
    const tail = new THREE.Group();
    tail.position.set(-0.5, 0.7, 0);
    part(tail, bx(0.12, 0.62, 0.12), fur, -0.1, 0.28, 0).rotation.z = 0.35;
    part(tail, bx(0.12, 0.3, 0.12), furD, -0.28, 0.66, 0).rotation.z = -0.2;
    m.add(tail);
    const legs = [
      leg(m, 0.32, 0.4, 0.17, 0.4, 0.13, fur, furD),
      leg(m, 0.32, 0.4, -0.17, 0.4, 0.13, fur, furD),
      leg(m, -0.34, 0.4, 0.17, 0.4, 0.13, fur, furD),
      leg(m, -0.34, 0.4, -0.17, 0.4, 0.13, fur, furD),
    ];
    const root = wrap(m);
    let ph = 0;
    return {
      kind: 'procedural', root,
      update(dt, s) {
        ph += dt * (s.speed01 > 0.02 ? 6 + s.speed01 * 14 : 0);
        const amp = 0.3 + s.speed01 * 0.7;
        if (s.air) {
          legs[0].rotation.z = legs[1].rotation.z = 0.9;
          legs[2].rotation.z = legs[3].rotation.z = -0.9;
        } else {
          legs[0].rotation.z = Math.sin(ph) * amp;
          legs[1].rotation.z = Math.sin(ph + 0.5) * amp;
          legs[2].rotation.z = Math.sin(ph + Math.PI) * amp;
          legs[3].rotation.z = Math.sin(ph + Math.PI + 0.5) * amp;
        }
        tail.rotation.y = Math.sin(performance.now() * 0.01) * 0.4;
      },
    };
  }

  // ---- GLB models (Quaternius etc.) -------------------------------------------------------
  function classify(clips) {
    const find = (re, not) => clips.find(c => re.test(c.name.toLowerCase()) && !(not && not.test(c.name.toLowerCase())));
    return {
      idle: find(/^idle$/) || find(/idle|stand/, /eat|attack|death|hit/) || clips[0],
      walk: find(/walk/),
      run: find(/gallop|run|trot/, /jump/) || find(/walk/),
      jump: find(/jump/, /toidle/) || find(/jump/),
    };
  }

  function wrapGLB(gltf, targetLen) {
    const model = gltf.scene;
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const k = targetLen / Math.max(size.x, size.z, 0.0001);
    model.scale.setScalar(k);
    box.setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.set(-c.x, -box.min.y, -c.z);
    const pivot = new THREE.Group();
    pivot.rotation.y = C.MODEL_YAW;
    pivot.add(model);
    const root = new THREE.Group();
    root.add(pivot);

    const clips = gltf.animations || [];
    console.info('[runner] GLB clips:', clips.map(c => c.name).join(', ') || '(none)');
    const mixer = clips.length ? new THREE.AnimationMixer(model) : null;
    const map = mixer ? classify(clips) : {};
    const actions = {};
    if (mixer) for (const key in map) if (map[key]) actions[key] = mixer.clipAction(map[key]);
    let cur = null;
    function play(name, scale) {
      const a = actions[name] || actions.idle;
      if (!a) return;
      a.timeScale = scale || 1;
      if (cur === a) return;
      a.reset().fadeIn(0.18).play();
      if (cur) cur.fadeOut(0.18);
      cur = a;
    }
    return {
      kind: 'glb', root,
      update(dt, s) {
        if (!mixer) return;
        if (s.air && actions.jump) play('jump', 1);
        else if (s.speed01 > 0.5) play('run', 0.8 + s.speed01 * 0.7);
        else if (s.speed01 > 0.06) play('walk', 0.6 + s.speed01 * 1.4);
        else play('idle', 1);
        mixer.update(dt);
      },
    };
  }

  function loadGLB(url, targetLen) {
    return new Promise(resolve => {
      if (!THREE.GLTFLoader) return resolve(null);
      fetch(url, { method: 'HEAD' }).then(r => {
        if (!r.ok) return resolve(null);
        new THREE.GLTFLoader().load(url, g => {
          try { resolve(wrapGLB(g, targetLen)); } catch (e) { console.warn('[runner] GLB setup failed', e); resolve(null); }
        }, undefined, () => resolve(null));
      }).catch(() => resolve(null));
    });
  }

  R.makeDog = async function () {
    return (await loadGLB('../models/dog_runner.glb', C.DOG_LEN)) || makeProceduralDog();
  };
  R.makeCat = async function () {
    return (await loadGLB('../models/cat.glb', 1.3)) || makeProceduralCat();
  };
})(window.R = window.R || {});
