(function (R) {
  const C = R.C, clamp = R.clamp;
  const LIMIT = C.ROAD_W / 2 - 0.6;

  class Cat {
    constructor(entity) {
      this.ent = entity;
      this.root = new THREE.Group();
      this.root.add(entity.root);
      this.x = 0.8; this.z = -22; this.y = 0; this.vy = 0;
      this.heading = Math.PI; this.speed = C.CAT_BASE;
      this.t = Math.random() * 10; this.tired = 0; this.nextTired = 5 + Math.random() * 3;
      this.dist = 99; this.air = false;
    }

    respawn(player, ahead) {
      const fx = -Math.sin(player.heading), fz = -Math.cos(player.heading);
      this.x = clamp(player.x + fx * ahead + (Math.random() - 0.5) * 3, -LIMIT, LIMIT);
      this.z = player.z + fz * ahead;
      this.heading = Math.atan2(-fx, -fz);
      this.speed = C.CAT_BASE; this.tired = 0; this.y = 0; this.vy = 0;
    }

    update(dt, player, world) {
      this.t += dt;
      const dx = this.x - player.x, dz = this.z - player.z;
      const dist = this.dist = Math.hypot(dx, dz);
      const near = clamp(1 - dist / C.CAT_RANGE, 0, 1);
      const fleeing = near > 0;

      // stamina: now and then the cat gets tired, which gives the dog a chance
      this.nextTired -= dt;
      if (this.nextTired <= 0) { this.tired = 1.4; this.nextTired = 5 + Math.random() * 4; }
      this.tired = Math.max(0, this.tired - dt);

      let target = fleeing ? R.lerp(C.CAT_BASE, C.CAT_FLEE, near) : C.CAT_BASE;
      if (this.tired > 0) target *= 0.55;
      this.speed = R.damp(this.speed, target, 3, dt);

      // run away from the dog but keep going down the street
      let ax = dx, az = dz;
      const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
      const tx = ax * 0.9, tz = az * 0.9 - 0.7;
      let want = Math.atan2(-tx, -tz) + Math.sin(this.t * 1.7) * (fleeing ? 0.55 : 0.25);
      if (Math.abs(this.x) > LIMIT - 0.4) want = Math.atan2(-(-Math.sign(this.x)) * 0.8, -tz);
      this.heading += R.angDiff(this.heading, want) * (1 - Math.exp(-6 * dt));

      this.x += -Math.sin(this.heading) * this.speed * dt;
      this.z += -Math.cos(this.heading) * this.speed * dt;
      this.x = clamp(this.x, -LIMIT, LIMIT);

      // hop over obstacles
      if (!this.air) {
        const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
        for (const o of world.obstaclesNear(this.x + fx * 1.3, this.z + fz * 1.3, 0.5)) {
          if (o.h < 3) { this.vy = 7.4; this.air = true; break; }
        }
      }
      if (this.air) {
        this.vy -= 19 * dt; this.y += this.vy * dt;
        if (this.y <= 0) { this.y = 0; this.vy = 0; this.air = false; }
      }

      if (dist > 90) this.respawn(player, 30);

      this.root.position.set(this.x, this.y, this.z);
      this.root.rotation.y = this.heading;
      this.ent.update(dt, { speed01: clamp(this.speed / C.CAT_FLEE, 0, 1), air: this.air });
    }
  }

  R.Cat = Cat;
})(window.R = window.R || {});
