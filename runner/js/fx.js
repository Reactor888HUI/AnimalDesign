(function (R) {
  class FX {
    constructor(scene) {
      const tex = R.glowTexture();
      this.pool = [];
      for (let i = 0; i < 64; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
        s.visible = false;
        s.userData = { life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 1, s1: 1, o: 1 };
        scene.add(s);
        this.pool.push(s);
      }
      this.next = 0;
    }
    emit(x, y, z, o) {
      const n = o.count || 1;
      for (let i = 0; i < n; i++) {
        const s = this.pool[this.next]; this.next = (this.next + 1) % this.pool.length;
        const u = s.userData, sp = o.speed || 1;
        s.position.set(x + (Math.random() - 0.5) * (o.spread || 0.3), y, z + (Math.random() - 0.5) * (o.spread || 0.3));
        u.vx = (Math.random() - 0.5) * sp; u.vz = (Math.random() - 0.5) * sp; u.vy = (o.up || 0.5) * (0.5 + Math.random());
        u.life = u.max = (o.life || 0.6) * (0.7 + Math.random() * 0.6);
        u.s0 = o.size || 0.4; u.s1 = u.s0 * (o.grow || 2.2); u.o = o.opacity || 0.5;
        s.material.color.setHex(o.color);
        s.material.opacity = u.o;
        s.scale.set(u.s0, u.s0, 1);
        s.visible = true;
      }
    }
    update(dt) {
      for (const s of this.pool) {
        const u = s.userData;
        if (u.life <= 0) continue;
        u.life -= dt;
        if (u.life <= 0) { s.visible = false; continue; }
        const t = 1 - u.life / u.max;
        s.position.x += u.vx * dt; s.position.y += u.vy * dt; s.position.z += u.vz * dt;
        const sz = u.s0 + (u.s1 - u.s0) * t;
        s.scale.set(sz, sz, 1);
        s.material.opacity = u.o * (1 - t);
      }
    }
  }
  R.FX = FX;
})(window.R = window.R || {});
