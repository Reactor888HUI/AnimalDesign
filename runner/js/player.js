(function (R) {
  const C = R.C, clamp = R.clamp, damp = R.damp;
  const RADIUS = C.DOG_RADIUS;

  class Player {
    constructor(entity) {
      this.ent = entity;
      this.root = new THREE.Group();
      // lean pivots round the middle of the body (for tilts, squash and the air flip)
      this.lean = new THREE.Group();
      this.lean.position.y = 0.35;
      entity.root.position.y = -0.35;
      this.root.add(this.lean);
      this.lean.add(entity.root);
      this.x = 0; this.z = 0; this.y = 0; this.vy = 0; this.ground = 0;
      this.heading = 0; this.speed = 0; this.vx = 0; this.vz = 0;
      this.steerS = 0; this.slip = 0; this.thrS = 0; this.yawRate = 0;
      this.jumpMul = 1; this.airJumps = 0; this.maxAirJumps = 1; this.flip = -1; this.sq = 0; this.sqV = 0; this.trailT = 0;
      this.jumpBuf = 0; this.coyote = 0; this.air = false;
      this.shake = 0; this.hitCd = 0; this.dustT = 0;
      this.onEvent = null; // (name, value) => void, used for sounds
    }
    get vel() { return Math.hypot(this.vx, this.vz); }
    emit(name, v) { if (this.onEvent) this.onEvent(name, v); }

    update(dt, input, world, fx, theme) {
      const sf = clamp(this.speed / C.MAX_SPEED, 0, 1);
      // steering builds up a little slower than it lets go: soft but responsive
      this.steerS = damp(this.steerS, input.steer, Math.abs(input.steer) > Math.abs(this.steerS) ? 7 : 12, dt);
      // the gas pedal is smoothed too, so starts and stops are not jerky
      const thr = input.throttle;
      this.thrS = damp(this.thrS, thr, thr > this.thrS ? 5 : 10, dt);

      // throttle: ease towards the speed asked for (half stick = half speed), brake hard, coast softly
      if (this.thrS > 0.02) {
        const target = C.MAX_SPEED * Math.min(1, this.thrS * 1.08);
        if (this.speed < target) this.speed += C.ACCEL * (0.35 + 0.65 * this.thrS) * (1 - 0.7 * sf * sf) * dt;
        else this.speed -= C.COAST * 1.4 * dt;
      } else if (thr < 0) this.speed -= C.BRAKE * -thr * (this.steerS * this.steerS > 0.09 ? 0.35 : 1) * dt;
      else this.speed -= C.COAST * (0.6 + sf) * dt;
      this.speed = clamp(this.speed, 0, C.MAX_SPEED);

      // steering: right turn lowers the heading (forward = -Z at heading 0).
      // Turning works standing still; braking while steering gives a tight sliding turn.
      // The turn rate itself is smoothed, so the dog swings into a turn instead of snapping.
      const sliding = thr < 0 && this.speed > 4 && Math.abs(this.steerS) > 0.3;
      const turnGain = (0.75 + 0.25 * Math.min(1, this.speed / 6)) * (1 - 0.2 * sf) * (this.air ? 0.5 : 1) * (sliding ? 1.5 : 1);
      this.yawRate = damp(this.yawRate, -this.steerS * C.TURN_RATE * turnGain, 10, dt);
      this.heading += this.yawRate * dt;

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
          // glance off a small obstacle hit head-on: slip round it on the side the dog is already on
          if (hit.kind !== 'wall') {
            if (Math.abs(hit.nx) < 0.3) this.x += (this.x >= hit.ox ? 1 : -1) * 2.2 * dt;
            else if (Math.abs(hit.nz) < 0.3) this.z += (this.z >= hit.oz ? 1 : -1) * 2.2 * dt;
          }
        }
      }
      this.shake = Math.max(0, this.shake - dt * 2.2);

      // vertical: ground can be the street, a bench, a car roof, a container or a ramp
      const ground = this.ground = world.groundAt(this.x, this.z, this.y);
      if (input.consumeJump()) this.jumpBuf = 0.15;
      this.jumpBuf -= dt;
      const onGround = this.y <= ground + 0.03 && this.vy <= 0;
      this.coyote = onGround ? 0.1 : this.coyote - dt;
      if (onGround) this.airJumps = this.maxAirJumps;
      const jv = C.JUMP_V * this.jumpMul;
      if (this.jumpBuf > 0 && this.coyote > 0) {
        this.vy = jv * (1 + 0.08 * sf);
        this.y = ground + 0.03; this.jumpBuf = 0; this.coyote = 0;
        this.sqV += 7;                                         // stretch on take-off
        fx.ring(this.x, ground + 0.12, this.z, { color: theme.dust, count: 10, speed: 3.6, up: 0.4, size: 0.42, grow: 2.4, opacity: 0.5, life: 0.5 });
        this.emit('jump', sf);
      } else if (this.jumpBuf > 0 && this.airJumps > 0 && this.y > ground + 0.6 && this.vy < 5) {
        // second jump in the air: a smaller boost and a somersault
        this.airJumps--; this.jumpBuf = 0;
        this.vy = jv * 0.8;
        this.flip = 0; this.sqV += 5;
        fx.ring(this.x, this.y + 0.4, this.z, { color: theme.spark, count: 12, speed: 4.5, up: 0.2, size: 0.3, grow: 1.6, opacity: 0.9, life: 0.45 });
        this.emit('jump2', sf);
      }
      if (this.y > ground + 0.03 || this.vy > 0) {
        // short hop when the button is let go early; a little hang time at the top of the arc
        let g = C.GRAVITY * (this.vy > 0 && !input.jumpHeld ? 2.3 : 1);
        if (Math.abs(this.vy) < 2.4 && input.jumpHeld) g *= 0.55;
        this.vy -= g * dt;
        this.y += this.vy * dt;
        if (this.y <= ground) {
          if (this.vy < -6) {
            const impact = -this.vy;
            this.shake = Math.max(this.shake, Math.min(0.45, impact / 30));
            this.sqV -= Math.min(9, impact * 0.7);              // squash on landing
            fx.ring(this.x, ground + 0.12, this.z, { color: theme.dust, count: Math.min(16, 6 + Math.round(impact)), speed: 2 + impact * 0.3, up: 0.5, size: 0.5, grow: 2.6, opacity: 0.55, life: 0.55 });
            this.emit('land', impact);
          }
          this.y = ground; this.vy = 0;
          if (this.flip >= 0) { this.flip = -1; this.lean.rotation.x = R.angDiff(0, this.lean.rotation.x); }
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
      this.lean.rotation.z = R.damp(this.lean.rotation.z, -this.steerS * sf * 0.24, 6, dt);
      if (this.flip >= 0) {
        // somersault forward over 0.55 s
        this.flip = Math.min(1, this.flip + dt / 0.55);
        const e = this.flip < 0.5 ? 2 * this.flip * this.flip : 1 - Math.pow(-2 * this.flip + 2, 2) / 2;
        this.lean.rotation.x = -e * Math.PI * 2;
        if (this.flip >= 1) { this.flip = -1; this.lean.rotation.x = 0; }
      } else {
        // nose up when climbing, down when falling; a slight dip when speeding up
        const pitch = this.air ? clamp(this.vy * -0.035, -0.35, 0.35) : -clamp((this.thrS - sf) * 0.08, -0.05, 0.08);
        this.lean.rotation.x = R.damp(this.lean.rotation.x, pitch, 7, dt);
      }
      // squash and stretch spring
      this.sqV += (-170 * this.sq - 13 * this.sqV) * dt;
      this.sq = clamp(this.sq + this.sqV * dt, -0.25, 0.22);
      const sy = 1 + this.sq, sxz = 1 / Math.sqrt(sy);
      this.lean.scale.set(sxz, sy, sxz);
      // a trail of sparkles while high in the air
      if (this.air && this.y - ground > 0.5) {
        this.trailT -= dt;
        if (this.trailT <= 0) {
          this.trailT = 0.035;
          // the sparkles keep most of the dog's speed, so they trail just behind it and not into the camera
          fx.emit(this.x, this.y + 0.45, this.z, { color: theme.spark, count: 1, speed: 0.4, up: -0.2, size: 0.18, grow: 0.3, opacity: 0.7, life: 0.4, vx: this.vx * 0.8, vz: this.vz * 0.8 });
        }
      }
      this.ent.update(dt, { speed01: clamp(v / C.MAX_SPEED, 0, 1), air: this.air, vy: this.vy, sniff: this.sniff });
    }
  }

  R.Player = Player;
})(window.R = window.R || {});
