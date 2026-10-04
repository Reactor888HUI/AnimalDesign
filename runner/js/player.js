(function (R) {
  const C = R.C, clamp = R.clamp, damp = R.damp;
  const RADIUS = C.DOG_RADIUS;

  class Player {
    constructor(entity) {
      this.ent = entity;
      this.root = new THREE.Group();
      this.lean = new THREE.Group();
      this.root.add(this.lean);
      this.lean.add(entity.root);
      this.x = 0; this.z = 0; this.y = 0; this.vy = 0; this.ground = 0;
      this.heading = 0; this.speed = 0; this.vx = 0; this.vz = 0;
      this.steerS = 0; this.slip = 0;
      this.jumpBuf = 0; this.coyote = 0; this.air = false;
      this.shake = 0; this.hitCd = 0; this.dustT = 0;
      this.onEvent = null; // (name, value) => void, used for sounds
    }
    get vel() { return Math.hypot(this.vx, this.vz); }
    emit(name, v) { if (this.onEvent) this.onEvent(name, v); }

    update(dt, input, world, fx, theme) {
      const sf = clamp(this.speed / C.MAX_SPEED, 0, 1);
      this.steerS = damp(this.steerS, input.steer, 9, dt);

      // throttle
      if (input.throttle > 0) this.speed += C.ACCEL * input.throttle * (1 - 0.55 * sf) * dt;
      else if (input.throttle < 0) this.speed -= C.BRAKE * -input.throttle * (this.steerS * this.steerS > 0.09 ? 0.35 : 1) * dt;
      else this.speed -= C.COAST * dt;
      this.speed = clamp(this.speed, 0, C.MAX_SPEED);

      // steering: right turn lowers the heading (forward = -Z at heading 0).
      // Turning works standing still; braking while steering gives a tight sliding turn.
      const sliding = input.throttle < 0 && this.speed > 4 && Math.abs(this.steerS) > 0.3;
      const turnGain = (0.75 + 0.25 * Math.min(1, this.speed / 6)) * (1 - 0.15 * sf) * (this.air ? 0.45 : 1) * (sliding ? 1.5 : 1);
      this.heading -= this.steerS * C.TURN_RATE * turnGain * dt;

      // velocity chases the facing direction; low grip at speed makes the dog drift
      const fx_ = -Math.sin(this.heading), fz_ = -Math.cos(this.heading);
      const grip = this.air ? 1.2 : sliding ? 2.6 : R.lerp(C.GRIP_LOW, C.GRIP_HIGH, sf * sf);
      const k = 1 - Math.exp(-grip * dt);
      this.vx += (fx_ * this.speed - this.vx) * k;
      this.vz += (fz_ * this.speed - this.vz) * k;
      this.x += this.vx * dt; this.z += this.vz * dt;

      // collisions (anything we are not standing above)
      this.hitCd -= dt;
      const hit = world.resolve(this, RADIUS);
      if (hit) {
        const vn = this.vx * hit.nx + this.vz * hit.nz; // negative = moving into the obstacle
        if (vn < 0) {
          const impact = -vn;
          this.vx -= hit.nx * vn * 1.15; this.vz -= hit.nz * vn * 1.15;
          if (hit.kind === 'traffic' && this.hitCd <= 0) {
            this.speed *= 0.25; this.shake = 1; this.hitCd = 0.8;
            this.vx += hit.nx * 6; this.vz += hit.nz * 6; this.vy = Math.max(this.vy, 3.5);
            this.emit('hitCar', 1);
          } else if (impact > 2.5 && this.hitCd <= 0) {
            this.speed *= impact > 8 ? 0.35 : 0.6;
            this.shake = Math.min(1, impact / 11);
            this.hitCd = 0.35;
            fx.emit(this.x, this.y + 0.6, this.z, { color: 0xffd36a, count: 6, speed: 4, up: 1.5, size: 0.28, opacity: 0.9, life: 0.4 });
            this.emit('bump', impact);
          } else if (this.speed > 3) this.speed *= 1 - 1.5 * dt;
          if (hit.kind !== 'wall' && Math.abs(hit.nx) < 0.3) this.x += (this.x >= hit.ox ? 1 : -1) * 2.2 * dt;
        }
      }
      this.shake = Math.max(0, this.shake - dt * 2.2);

      // vertical: ground can be the street, a bench, a car roof, a container or a ramp
      const ground = this.ground = world.groundAt(this.x, this.z, this.y);
      if (input.consumeJump()) this.jumpBuf = 0.15;
      this.jumpBuf -= dt;
      const onGround = this.y <= ground + 0.03 && this.vy <= 0;
      this.coyote = onGround ? 0.1 : this.coyote - dt;
      if (this.jumpBuf > 0 && this.coyote > 0) {
        this.vy = C.JUMP_V * (1 + 0.1 * sf);
        this.y = ground + 0.03; this.jumpBuf = 0; this.coyote = 0;
        fx.emit(this.x, ground + 0.2, this.z, { color: theme.dust, count: 5, speed: 2, up: 0.8, size: 0.5, opacity: 0.45 });
        this.emit('jump', sf);
      }
      if (this.y > ground + 0.03 || this.vy > 0) {
        const g = C.GRAVITY * (this.vy > 0 && !input.jumpHeld ? 2.3 : 1);
        this.vy -= g * dt;
        this.y += this.vy * dt;
        if (this.y <= ground) {
          if (this.vy < -6) {
            this.shake = Math.max(this.shake, 0.25);
            fx.emit(this.x, ground + 0.2, this.z, { color: theme.dust, count: 7, speed: 3, up: 0.8, size: 0.55, opacity: 0.5 });
            this.emit('land', -this.vy);
          }
          this.y = ground; this.vy = 0;
        }
      } else {
        this.y = damp(this.y, ground, 30, dt); // small steps up and down
        this.vy = 0;
      }
      this.air = this.y > ground + 0.05;

      // dust while drifting or galloping
      const v = this.vel;
      if (!this.air && v > 4) {
        const dir = Math.hypot(this.vx, this.vz) || 1;
        this.slip = 1 - (this.vx * fx_ + this.vz * fz_) / dir;
        this.dustT -= dt;
        if (this.dustT <= 0 && (this.slip > 0.06 || v > 11)) {
          this.dustT = this.slip > 0.06 ? 0.035 : 0.09;
          fx.emit(this.x - fx_ * 0.6, this.y + 0.1, this.z - fz_ * 0.6, {
            color: theme.dust, count: 1, speed: 1.2, up: 0.5, size: 0.35, grow: 2.6,
            opacity: this.slip > 0.06 ? 0.45 : 0.22, life: 0.55,
          });
        }
      } else this.slip = 0;

      // visuals
      this.root.position.set(this.x, this.y, this.z);
      this.root.rotation.y = this.heading;
      this.lean.rotation.z = R.damp(this.lean.rotation.z, -this.steerS * sf * 0.2, 8, dt);
      this.lean.rotation.x = R.damp(this.lean.rotation.x, this.air ? clamp(this.vy * -0.03, -0.3, 0.3) : 0, 8, dt);
      this.ent.update(dt, { speed01: clamp(v / C.MAX_SPEED, 0, 1), air: this.air, vy: this.vy, sniff: this.sniff });
    }
  }

  R.Player = Player;
})(window.R = window.R || {});
