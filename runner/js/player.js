(function (R) {
  const C = R.C, clamp = R.clamp, damp = R.damp;
  const RADIUS = C.DOG_RADIUS;
  const STILL = { throttle: 0, steer: 0, jumpHeld: false, consumeJump: () => false };

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
      // air control: how fast the dog turns and how much the flight path follows the turn
      this.airTurn = 0.5; this.airGrip = 1.2;
      // bad landings (runner): a nose-dive, then a limp that heals with time
      this.canCrash = false; this.crash = -1; this.limp = 0; this.lastImpact = 0;
      // the body is long: besides the middle, the chest and the rump are kept out of things too
      this.halfLen = 0.45;
      this.maxSpeed = C.MAX_SPEED;      // a mode can ask for a calmer dog
      this.jumpBuf = 0; this.coyote = 0; this.air = false;
      this.shake = 0; this.hitCd = 0; this.dustT = 0;
      this.onEvent = null; // (name, value) => void, used for sounds
    }
    get vel() { return Math.hypot(this.vx, this.vz); }
    // keep the head end and the tail end of the body out of walls, boxes and fountains as well
    bodyResolve(world) {
      const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
      for (const k of [1, -1]) {
        const q = this.q || (this.q = { x: 0, y: 0, z: 0 });
        q.x = this.x + fx * this.halfLen * k; q.z = this.z + fz * this.halfLen * k; q.y = this.y; q.stepUp = this.stepUp;
        const ox = q.x, oz = q.z;
        if (world.resolve(q, 0.26)) {
          const dx = q.x - ox, dz = q.z - oz;
          this.x += dx; this.z += dz;
          // lose the speed going into the obstacle
          const d = Math.hypot(dx, dz);
          if (d > 1e-4) { const nx = dx / d, nz = dz / d, vn = this.vx * nx + this.vz * nz; if (vn < 0) { this.vx -= nx * vn; this.vz -= nz * vn; } }
        }
      }
    }
    emit(name, v) { if (this.onEvent) this.onEvent(name, v); }

    update(dt, input, world, fx, theme) {
      // while getting up after a crash the dog does not listen to the controls
      if (this.crash >= 0) {
        this.crash += dt / 1.4;
        if (this.crash >= 1) this.crash = -1;
        input.consumeJump();
        input = STILL;
      }
      if (this.limp > 0) {
        this.limp = Math.max(0, this.limp - dt / 14);
        if (this.limp === 0) this.emit('healed');
      }
      const sf = clamp(this.speed / C.MAX_SPEED, 0, 1);
      // Direction controls (the game): the stick says where to run on the screen; the dog turns
      // there itself and runs as fast as the stick is pushed. Let go and it stops.
      // Tank controls (tests, bots): throttle + steer.
      const dirMode = !!input.dirMode;
      let thr, diff = 0;
      if (dirMode) {
        const mag = input.dirMag || 0;
        if (mag > 0.05) {
          diff = R.angDiff(this.heading, Math.atan2(-input.dirX, -input.dirZ));
          // asked to go the other way at speed: brake into a skid first
          thr = Math.abs(diff) > 2.2 && this.speed > 7 ? -0.7 : mag;
        } else thr = this.speed > 0.5 ? -0.25 : 0;
      } else {
        thr = input.throttle;
        // steering builds up a little slower than it lets go: soft but responsive
        this.steerS = damp(this.steerS, input.steer, Math.abs(input.steer) > Math.abs(this.steerS) ? 7 : 12, dt);
      }
      // the gas pedal is smoothed, so starts and stops are not jerky
      this.thrS = damp(this.thrS, thr, thr > this.thrS ? 5 : 10, dt);

      // throttle: ease towards the speed asked for (half stick = half speed), brake hard, coast softly
      if (this.thrS > 0.02) {
        const target = this.maxSpeed * Math.min(1, this.thrS * 1.08);
        if (this.speed < target) this.speed += C.ACCEL * (0.35 + 0.65 * this.thrS) * (1 - 0.7 * sf * sf) * dt;
        else this.speed -= C.COAST * 1.4 * dt;
      } else if (thr < 0) this.speed -= C.BRAKE * -thr * (this.steerS * this.steerS > 0.09 ? 0.35 : 1) * dt;
      else this.speed -= C.COAST * (0.6 + sf) * dt;
      // a sore paw: no galloping until it gets better
      const cap = this.limp > 0 ? Math.min(this.maxSpeed * (1 - 0.62 * this.limp), this.limp > 0.4 ? 5.5 : this.maxSpeed) : this.maxSpeed;
      this.speed = clamp(this.speed, 0, cap);
      if (this.crash >= 0) this.speed *= Math.exp(-5 * dt);

      // steering: right turn lowers the heading (forward = -Z at heading 0).
      // Turning works standing still; braking while steering gives a tight sliding turn.
      // The turn rate itself is smoothed, so the dog swings into a turn instead of snapping.
      const sliding = thr < 0 && this.speed > 4 && Math.abs(this.steerS) > 0.3;
      if (dirMode) {
        // turn towards the stick: quick when slow, wider arcs at a gallop, a little in the air
        const maxRate = R.lerp(6.5, 3.6, sf) * (this.air ? this.airTurn * 0.85 : 1);
        this.yawRate = damp(this.yawRate, clamp(diff * 7, -maxRate, maxRate), 12, dt);
        this.steerS = clamp(-this.yawRate / C.TURN_RATE, -1, 1);
        // a sharp turn at speed costs some speed (paws skid)
        if (!this.air && Math.abs(diff) > 1 && this.speed > 6) this.speed *= 1 - 0.7 * dt;
      } else {
        const turnGain = (0.75 + 0.25 * Math.min(1, this.speed / 6)) * (1 - 0.1 * sf) * (this.air ? this.airTurn : 1) * (sliding ? 1.5 : 1);
        this.yawRate = damp(this.yawRate, -this.steerS * C.TURN_RATE * turnGain, 10, dt);
      }
      this.heading += this.yawRate * dt;

      // velocity chases the facing direction; low grip at speed makes the dog drift
      const fx_ = -Math.sin(this.heading), fz_ = -Math.cos(this.heading);
      const grip = this.air ? this.airGrip : sliding ? 2.6 : R.lerp(C.GRIP_LOW, C.GRIP_HIGH, sf * sf);
      const k = 1 - Math.exp(-grip * dt);
      this.vx += (fx_ * this.speed - this.vx) * k;
      this.vz += (fz_ * this.speed - this.vz) * k;
      this.x += this.vx * dt; this.z += this.vz * dt;

      // collisions (anything we are not standing above)
      this.hitCd -= dt;
      // coming up a ramp the dog steps onto the roof at its top even if it is a bit below it
      this.stepUp = this.onRamp ? 0.8 : 0;
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
      this.bodyResolve(world);
      this.shake = Math.max(0, this.shake - dt * 2.2);

      // vertical: ground can be the street, a bench, a car roof, a container or a ramp
      const ground = this.ground = world.groundAt(this.x, this.z, this.y);
      const under = world.lastGround;
      this.onRamp = !!(under && under.ramp);
      if (input.consumeJump()) this.jumpBuf = 0.15;
      this.jumpBuf -= dt;
      const onGround = this.y <= ground + 0.03 && this.vy <= 0;
      this.coyote = onGround ? 0.1 : this.coyote - dt;
      if (onGround) this.airJumps = this.maxAirJumps;
      const jv = C.JUMP_V * this.jumpMul * (1 - 0.35 * this.limp);
      if (this.jumpBuf > 0 && this.coyote > 0) {
        this.vy = jv * (1 + 0.08 * sf);
        this.y = ground + 0.03; this.jumpBuf = 0; this.coyote = 0;
        this.sqV += 7;                                         // stretch on take-off
        fx.ring(this.x, ground + 0.12, this.z, { color: theme.dust, count: 10, speed: 3.6, up: 0.4, size: 0.42, grow: 2.4, opacity: 0.5, life: 0.5 });
        this.emit('jump', sf);
        this.jumpedAt = performance.now();
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
          const impact = -this.vy;
          this.lastImpact = impact;
          // a bad landing: a huge drop, a somersault not finished, or landing sideways while turning hard
          const bad = this.canCrash && (impact > 13.5 || (this.flip >= 0 && this.flip < 0.8) || (impact > 8 && Math.abs(this.steerS) > 0.85 && this.speed > 10));
          if (bad) {
            this.crash = 0; this.limp = 1; this.flip = -1; this.lean.rotation.x = 0;
            this.vx *= 0.45; this.vz *= 0.45; this.speed *= 0.4; this.shake = 1;
            fx.ring(this.x, ground + 0.12, this.z, { color: theme.dust, count: 16, speed: 4, up: 0.8, size: 0.6, grow: 2.6, opacity: 0.6, life: 0.7 });
            this.emit('crash', impact);
          } else if (this.vy < -6) {
            this.shake = Math.max(this.shake, Math.min(0.45, impact / 30));
            this.sqV -= Math.min(9, impact * 0.7);              // squash on landing
            fx.ring(this.x, ground + 0.12, this.z, { color: theme.dust, count: Math.min(16, 6 + Math.round(impact)), speed: 2 + impact * 0.3, up: 0.5, size: 0.5, grow: 2.6, opacity: 0.55, life: 0.55 });
            this.emit('land', impact);
          }
          this.y = ground; this.vy = 0;
          if (this.flip >= 0) { this.flip = -1; this.lean.rotation.x = R.angDiff(0, this.lean.rotation.x); }
        }
      } else {
        // up a ramp or a step: stay on it (no lag); down small steps: ease down
        this.y = ground > this.y ? ground : damp(this.y, ground, 30, dt);
        this.vy = 0;
      }
      this.air = this.y > ground + 0.05;
      // a kicker (an orange ramp on a roof) throws the dog up when it runs off it, more the faster it goes
      const kk = this.kick;
      if (this.air && kk && this.vy > -2) {
        const along = (kk.ramp.axis === 'x' ? this.vx : this.vz) * kk.ramp.dir;
        if (along > 3) {
          const boost = Math.min(9.5, 4 + 0.32 * along) + (performance.now() - (this.jumpedAt || 0) < 200 ? 2.5 : 0);
          this.vy = Math.max(this.vy, boost);
          this.airJumps = this.maxAirJumps;
          fx.ring(this.x, this.y + 0.2, this.z, { color: theme.spark, count: 14, speed: 4, up: 0.4, size: 0.3, grow: 1.8, opacity: 0.9, life: 0.5 });
          this.emit('launch', along);
        }
      }
      this.kick = !this.air && under && under.kick ? under : null;

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
      this.ent.update(dt, {
        speed01: clamp(v / C.MAX_SPEED, 0, 1), speed: v, air: this.air, vy: this.vy, sniff: this.sniff,
        turn: this.yawRate, flip: this.flip, crash: this.crash, limp: this.limp, land: this.lastImpact,
      });
    }
  }

  R.Player = Player;
})(window.R = window.R || {});
