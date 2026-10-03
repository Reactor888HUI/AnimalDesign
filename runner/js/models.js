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

  // ---- GLB models ---------------------------------------------------------------------------
  const loader = () => new THREE.GLTFLoader();
  const load = url => new Promise(res => {
    if (!THREE.GLTFLoader) return res(null);
    fetch(url, { method: 'HEAD' }).then(r => {
      if (!r.ok) return res(null);
      loader().load(url, g => res(g), undefined, () => res(null));
    }).catch(() => res(null));
  });

  function fixMaterial(m) {
    if (m.map) { m.map.encoding = THREE.LinearEncoding; m.map.needsUpdate = true; }
    if ('metalness' in m) { m.metalness = 0; m.roughness = 0.9; }
  }

  // A model without a skeleton: the legs are swung in the vertex shader. The lower part of the
  // body is sheared back and forth, diagonal pairs in opposite phase (a trot).
  function legShader(mesh, cfg) {
    const geo = mesh.geometry;
    geo.computeBoundingBox();
    const bb = geo.boundingBox, len = bb.max.z - bb.min.z, wid = bb.max.x - bb.min.x, hgt = bb.max.y - bb.min.y;
    const u = {
      uPhase: { value: 0 }, uAmp: { value: 0 }, uLift: { value: 0 },
      uMidZ: { value: (bb.max.z + bb.min.z) / 2 + len * cfg.midShift }, uFA: { value: len * 0.05 }, uSA: { value: wid * 0.04 },
      uYMin: { value: bb.min.y }, uLegTop: { value: bb.min.y + hgt * cfg.legTop },
    };
    const m = mesh.material;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'uniform float uPhase,uAmp,uLift,uMidZ,uFA,uSA,uYMin,uLegTop;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        vec3 transformed = vec3( position );
        {
          float fa = smoothstep(-uFA, uFA, position.z - uMidZ);
          float sd = smoothstep(-uSA, uSA, position.x);
          float w = clamp(1.0 - (position.y - uYMin) / (uLegTop - uYMin), 0.0, 1.0);
          float ph = uPhase + (fa + sd) * 3.14159;
          transformed.z += sin(ph) * uAmp * w;
          transformed.y += max(0.0, cos(ph)) * uLift * w * w;
        }`);
    };
    m.customProgramCacheKey = () => 'legs' + cfg.name;
    return { u, len, hgt };
  }

  function makeStatic(gltf, targetLen, cfg) {
    const model = gltf.scene;
    let sh = null;
    model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      o.material = Array.isArray(o.material) ? o.material[0] : o.material;
      fixMaterial(o.material);
      if (!sh) sh = legShader(o, cfg);
    });
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const k = targetLen / Math.max(size.x, size.z);
    const inner = new THREE.Group();            // pitch / bob happen here
    model.position.set(-c.x, -box.min.y, -c.z);
    inner.add(model);
    inner.scale.setScalar(k);
    const pivot = new THREE.Group();
    pivot.rotation.y = C.MODEL_YAW;
    pivot.add(inner);
    const root = new THREE.Group();
    root.add(pivot);
    let phase = 0, ampS = 0, t = 0;
    return {
      kind: 'static', root,
      update(dt, s) {
        t += dt;
        const moving = s.speed01 > 0.04 && !s.air;
        phase += dt * (7 + s.speed01 * 15);
        ampS = R.damp(ampS, moving ? (0.35 + 0.65 * s.speed01) * cfg.amp * sh.len : 0, 14, dt);
        sh.u.uPhase.value = phase;
        sh.u.uAmp.value = ampS;
        sh.u.uLift.value = ampS * 0.7;
        const gallop = moving ? Math.sin(phase * 2) : 0;
        inner.position.y = R.damp(inner.position.y, (moving ? Math.abs(Math.sin(phase)) * 0.045 * s.speed01 : 0) * targetLen, 18, dt);
        inner.rotation.x = R.damp(inner.rotation.x, gallop * 0.07 * s.speed01 + (s.air ? -0.12 : 0), 14, dt);
        inner.scale.y = k * (1 + (moving ? 0 : Math.sin(t * 2.2) * 0.012));
      },
    };
  }

  const DOG_CFG = { name: 'dog', legTop: 0.46, amp: 0.22, midShift: 0.0 };
  const CAT_CFG = { name: 'cat', legTop: 0.34, amp: 0.2, midShift: 0.02 };

  R.makeDog = async function () {
    const g = await load('../models/dog_runner.glb');
    if (g) try { return makeStatic(g, C.DOG_LEN, DOG_CFG); } catch (e) { console.warn('[runner] dog model failed', e); }
    return makeProceduralDog();
  };
  R.makeCat = async function () {
    const g = await load('../models/cat.glb');
    if (g) try { return makeStatic(g, C.CAT_LEN, CAT_CFG); } catch (e) { console.warn('[runner] cat model failed', e); }
    return makeProceduralCat();
  };

  // Chicken: skinned model with its own animations, cloned per bird.
  R.loadChicken = async function () {
    const g = await load('../models/chicken.glb');
    if (!g) return null;
    g.scene.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { fixMaterial(m); m.color.multiplyScalar(1.7); m.emissive.setRGB(0.1, 0.1, 0.1); }); } });
    g.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g.scene);
    const size = box.getSize(new THREE.Vector3());
    const find = (re, not) => g.animations.find(a => re.test(a.name.toLowerCase()) && !(not && not.test(a.name.toLowerCase())));
    console.info('[runner] chicken clips:', g.animations.map(a => a.name).join(', '));
    return {
      scale: C.CHICKEN_H / size.y, minY: box.min.y,
      clips: { idle: find(/idle/), walk: find(/walk/), jump: find(/jump/) },
      spawn() {
        const scene = THREE.SkeletonUtils.clone(g.scene);
        const inner = new THREE.Group();
        scene.position.y = -this.minY;
        inner.add(scene);
        inner.scale.setScalar(this.scale);
        const pivot = new THREE.Group();
        pivot.rotation.y = C.MODEL_YAW;
        pivot.add(inner);
        const root = new THREE.Group();
        root.add(pivot);
        const mixer = new THREE.AnimationMixer(scene), acts = {};
        for (const k in this.clips) if (this.clips[k]) acts[k] = mixer.clipAction(this.clips[k]);
        let cur = null;
        return {
          root, mixer,
          play(name, ts) {
            const a = acts[name] || acts.idle;
            if (!a) return;
            a.timeScale = ts || 1;
            if (cur === a) return;
            a.reset().fadeIn(0.15).play();
            if (cur) cur.fadeOut(0.15);
            cur = a;
          },
        };
      },
    };
  };
})(window.R = window.R || {});
