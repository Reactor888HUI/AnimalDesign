(function (R) {
  const clamp = R.clamp;

  class Flock {
    constructor(scene, template, n, world, player) {
      this.world = world; this.birds = [];
      for (let i = 0; i < n; i++) {
        const e = template.spawn();
        scene.add(e.root);
        const b = { e, x: 0, z: 0, y: 0, vy: 0, h: Math.random() * 6.28, state: 'idle', t: Math.random() * 2, tx: 0, tz: 0, hop: 0 };
        this.respawn(b, player, 14 + Math.random() * 30);
        this.birds.push(b);
      }
    }
    respawn(b, player, d) {
      for (let i = 0; i < 20; i++) {
        const a = Math.random() * 6.28;
        const x = player.x + Math.cos(a) * d, z = player.z + Math.sin(a) * d;
        if (!this.world.solidAt(x, z, 1.0)) { b.x = x; b.z = z; break; }
      }
      b.state = 'idle'; b.t = Math.random() * 2; b.y = 0; b.vy = 0;
    }
    update(dt, player, world) {
      for (const b of this.birds) {
        const dx = b.x - player.x, dz = b.z - player.z, dist = Math.hypot(dx, dz);
        if (dist > 100) { this.respawn(b, player, 45 + Math.random() * 25); continue; }

        if (dist < 7 && b.state !== 'flee') { b.state = 'flee'; if (dist < 3.2 && b.y === 0) { b.vy = 3.4; } }
        if (b.state === 'flee' && dist > 14) { b.state = 'idle'; b.t = 1 + Math.random() * 2; }

        let speed = 0, anim = 'idle', ts = 1;
        if (b.state === 'flee') {
          const want = Math.atan2(-dx, -dz) + Math.sin(performance.now() * 0.004 + b.tx) * 0.5;
          b.h += R.angDiff(b.h, want) * (1 - Math.exp(-9 * dt));
          speed = 5.2; anim = 'walk'; ts = 2.6;
        } else if (b.state === 'walk') {
          const tx = b.tx - b.x, tz = b.tz - b.z, d = Math.hypot(tx, tz);
          if (d < 0.4) { b.state = 'idle'; b.t = 1 + Math.random() * 3; }
          else { b.h += R.angDiff(b.h, Math.atan2(-tx, -tz)) * (1 - Math.exp(-6 * dt)); speed = 1.1; anim = 'walk'; ts = 1.1; }
        } else {
          b.t -= dt;
          if (b.t <= 0) {
            const a = Math.random() * 6.28, d = 2 + Math.random() * 5;
            b.tx = b.x + Math.cos(a) * d; b.tz = b.z + Math.sin(a) * d;
            b.state = world.solidAt(b.tx, b.tz, 0.6) ? 'idle' : 'walk'; b.t = 1.5;
          }
        }
        b.x += -Math.sin(b.h) * speed * dt;
        b.z += -Math.cos(b.h) * speed * dt;
        if (b.vy !== 0 || b.y > 0) {
          b.vy -= 14 * dt; b.y = Math.max(0, b.y + b.vy * dt);
          if (b.y === 0) b.vy = 0;
        }
        const hit = world.resolve(b, 0.25);
        if (hit) { b.h = Math.atan2(hit.nx, hit.nz) + Math.PI + (Math.random() - 0.5); if (b.state === 'walk') b.state = 'idle'; }

        b.e.root.position.set(b.x, b.y, b.z);
        b.e.root.rotation.y = b.h;
        b.e.play(anim, ts);
        b.e.mixer.update(dt);
      }
    }
  }
  R.Flock = Flock;
})(window.R = window.R || {});
