(function (R) {
  const C = R.C, clamp = R.clamp;
  const CAND = [0, 0.35, -0.35, 0.75, -0.75, 1.2, -1.2, 1.8, -1.8, 2.6, -2.6, Math.PI];

  class Cat {
    constructor(entity) {
      this.ent = entity;
      this.root = new THREE.Group();
      this.root.add(entity.root);
      this.x = 0; this.z = 0; this.y = 0; this.vy = 0;
      this.heading = Math.PI; this.speed = C.CAT_BASE; this.goal = this.heading;
      this.t = Math.random() * 10; this.tired = 0; this.nextTired = 3 + Math.random() * 3;
      this.look = 0; this.dist = 99; this.air = false;
    }

    respawn(player, world, ahead) {
      const base = player.heading;
      for (let i = 0; i < 24; i++) {
        const a = base + (i === 0 ? 0 : (Math.random() - 0.5) * (1 + i * 0.12) * 2.4);
        const d = ahead * (0.8 + Math.random() * 0.5);
        const x = player.x - Math.sin(a) * d, z = player.z - Math.cos(a) * d;
        if (!world.solidAt(x, z, 1.2)) { this.x = x; this.z = z; this.heading = this.goal = a; break; }
      }
      this.speed = C.CAT_BASE; this.tired = 0; this.y = 0; this.vy = 0; this.look = 0;
    }

    // look around for the way out that leads away from the dog and is not blocked
    steer(player, world, fleeing) {
      const dx = this.x - player.x, dz = this.z - player.z;
      const base = fleeing ? Math.atan2(-dx, -dz) : this.heading;
      let best = base, bestScore = -1e9;
      for (const off of CAND) {
        const h = base + off;
        let score = Math.cos(off) * 1.2 - Math.abs(off) * 0.1;
        for (const d of [1.8, 4, 7, 11]) {
          if (world.solidAt(this.x - Math.sin(h) * d, this.z - Math.cos(h) * d, 0.5)) { score -= 6 / d + 1; break; }
        }
        if (!fleeing) score += Math.cos(R.angDiff(h, this.heading)) * 0.5;
        if (score > bestScore) { bestScore = score; best = h; }
      }
      this.goal = best;
    }

    update(dt, player, world) {
      this.t += dt;
      const dx = this.x - player.x, dz = this.z - player.z;
      const dist = this.dist = Math.hypot(dx, dz);
      const near = clamp(1 - dist / C.CAT_RANGE, 0, 1);
      const fleeing = near > 0;

      this.look -= dt;
      if (this.look <= 0) { this.look = 0.12; this.steer(player, world, fleeing); }

      this.nextTired -= dt;
      if (this.nextTired <= 0) { this.tired = 1.7; this.nextTired = 4 + Math.random() * 3; }
      this.tired = Math.max(0, this.tired - dt);

      let target = fleeing ? R.lerp(C.CAT_BASE, C.CAT_FLEE, near) : C.CAT_BASE * 0.55;
      if (this.tired > 0) target *= 0.5;
      this.speed = R.damp(this.speed, target, 3, dt);

      const want = this.goal + Math.sin(this.t * 1.7) * (fleeing ? 0.28 : 0.12);
      this.heading += R.angDiff(this.heading, want) * (1 - Math.exp(-7 * dt));

      const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
      this.x += fx * this.speed * dt;
      this.z += fz * this.speed * dt;

      // hop over low things, bump off tall ones
      if (!this.air) {
        for (const o of world.obstaclesNear(this.x + fx * 1.1, this.z + fz * 1.1, 0.3)) {
          if (o.h < 1.7 && Math.abs(o.x - (this.x + fx * 1.1)) < o.hx + 0.3 && Math.abs(o.z - (this.z + fz * 1.1)) < o.hz + 0.3) {
            this.vy = 6.4; this.air = true; break;
          }
        }
      }
      if (this.air) {
        this.vy -= 19 * dt; this.y += this.vy * dt;
        if (this.y <= 0) { this.y = 0; this.vy = 0; this.air = false; }
      }
      const hit = world.resolve(this, 0.3);
      if (hit) { this.goal = Math.atan2(hit.nx, hit.nz) + Math.PI + (Math.random() - 0.5) * 0.8; this.look = 0.3; }

      if (dist > 110) this.respawn(player, world, 36);

      this.root.position.set(this.x, this.y, this.z);
      this.root.rotation.y = this.heading;
      this.ent.update(dt, { speed01: clamp(this.speed / C.CAT_FLEE, 0, 1), air: this.air });
    }
  }

  R.Cat = Cat;
})(window.R = window.R || {});
