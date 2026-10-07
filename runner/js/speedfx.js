(function (R) {
  // ===================================================================================================
  //  SPEED TRAIL — at super speed and in an arrow flight, ribbons of warm light stream off the whippet
  //  like long-exposure streaks: three ribbons at different heights and twists (so one of them always
  //  faces the camera), bright at the dog and fading out behind. Additive, one draw call each.
  // ===================================================================================================
  const N = 26;
  const RIBS = [
    { h: 0.66, w: 0.09, twist: Math.PI / 2, side: 0, col: [1.0, 0.72, 0.32] },   // along the back, standing up (thin from behind)
    { h: 0.4, w: 0.07, twist: Math.PI / 3, side: 0.2, col: [1.0, 0.5, 0.22] },
    { h: 0.5, w: 0.07, twist: -Math.PI / 3, side: -0.2, col: [1.0, 0.85, 0.5] },
  ];

  class SpeedTrail {
    constructor(scene) {
      this.ribs = RIBS.map(r => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
        const idx = [];
        for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        g.setIndex(idx);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
        m.frustumCulled = false; m.renderOrder = 6; m.visible = false;
        scene.add(m);
        return { r, m, pts: [] };
      });
      this.t = 0;
    }
    update(dt, p, k, night) {
      this.t += dt;
      const fx = -Math.sin(p.heading), fz = -Math.cos(p.heading), rx = -fz, rz = fx;   // forward, right
      for (const R_ of this.ribs) {
        const r = R_.r, pts = R_.pts;
        // a new point at the dog every frame, with a little wave so the streaks are not ruler-straight
        const wave = Math.sin(this.t * 9 + r.twist * 3) * 0.05;
        pts.unshift({ x: p.x + rx * (r.side + wave) - fx * 0.35, y: p.y + r.h + wave * 0.5, z: p.z + rz * (r.side + wave) - fz * 0.35, a: r.twist + this.t * 0.6, fx, fz });
        if (pts.length > N) pts.length = N;
        R_.m.visible = k > 0.02 && pts.length > 2;
        if (!R_.m.visible) continue;
        const pos = R_.m.geometry.attributes.position, col = R_.m.geometry.attributes.color;
        for (let i = 0; i < N; i++) {
          const q = pts[Math.min(i, pts.length - 1)], fade = Math.pow(1 - i / (N - 1), 2.2) * k * Math.min(1, i / 3);   // soft at both ends
          // the ribbon's width direction: turned round the direction of travel by the twist
          const ca = Math.cos(q.a), sa = Math.sin(q.a), wx = -q.fz * ca, wz = q.fx * ca, wy = sa;
          const w = r.w * (1 + 1.5 * i / N);   // the streaks spread out behind
          pos.setXYZ(i * 2, q.x + wx * w, q.y + wy * w, q.z + wz * w);
          pos.setXYZ(i * 2 + 1, q.x - wx * w, q.y - wy * w, q.z - wz * w);
          const c = night ? [r.col[2] * 0.7 + 0.2, r.col[1] * 0.85, 1.0] : r.col;   // cooler at night
          for (const j of [0, 1]) col.setXYZ(i * 2 + j, c[0] * fade * 0.55, c[1] * fade * 0.55, c[2] * fade * 0.55);
        }
        pos.needsUpdate = true; col.needsUpdate = true;
      }
    }
  }
  R.SpeedTrail = SpeedTrail;
})(window.R = window.R || {});
