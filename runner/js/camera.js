(function (R) {
  const C = R.C, clamp = R.clamp, damp = R.damp;

  // A comfortable chase camera (the usual advice against motion sickness):
  //  - it never rolls, never shakes, never bobs and does not zoom with speed;
  //  - it comes round behind the running dog by itself, softly, with a lag and at most ~28 deg/s
  //    (no snapping after every little turn), so the stick's "up" soon means "where the dog runs" again;
  //  - the player can turn it too (drag / Z, X), as in most games: the finger or mouse to the right
  //    looks right; after that it waits a moment before it comes round again;
  //  - it sits a little higher and further back, so the street is a steady reference
  //    and the dog stays in the middle of the picture.
  class CameraRig {
    constructor(camera, world) {
      this.cam = camera; this.world = world;
      this.heading = 0; this.baseFov = 62;
      this.pos = new THREE.Vector3(0, 2.6, 4.6);
      this.look = new THREE.Vector3();
      this.lookS = null; this.yS = 0; this.yawRate = 0; this.steady = 0;
      this.autoAlign = true;
    }
    snap(p) {
      this.heading = p.heading;
      this.pos.set(p.x + Math.sin(p.heading) * 4.6, 2.6, p.z + Math.cos(p.heading) * 4.6);
      this.cam.position.copy(this.pos);
      this.lookS = null; this.yS = p.y; this.yG = p.ground || 0; this.yawRate = 0;
    }
    resize(aspect) {
      this.cam.aspect = aspect;
      // a phone held upright sees more around the dog
      this.baseFov = aspect < 1 ? 62 + (1 - aspect) * 30 : 62;
      this.cam.fov = this.baseFov;
      this.cam.updateProjectionMatrix();
    }
    // turn by the player: radians now (a drag) and a held key (-1..1)
    // (a right turn lowers the heading, like the dog's)
    turn(rad, hold, dt) {
      this.heading -= rad + hold * 1.6 * dt;
      if (rad || hold) this.steady = -0.8;   // after a manual turn, wait before re-aligning
    }
    update(dt, p, time, input) {
      if (input) { this.turn(input.camDrag || 0, input.camTurn || 0, dt); input.camDrag = 0; }
      const sf = clamp(p.speed / C.MAX_SPEED, 0, 1);
      // coming round behind the running dog: a soft spring with a small dead zone, never faster than
      // ~28 deg/s (the comfort limit: a faster swing made the player dizzy), slower while the dog is
      // still in a turn, so the picture does not whip round after it
      const err = R.angDiff(this.heading, p.heading);
      const turning = Math.abs(p.yawRate || 0) > 0.6;
      this.steady = p.speed < 2.5 ? Math.min(this.steady, 0) : Math.min(1.5, this.steady + dt);
      let want = 0;
      if (this.autoAlign && this.steady > 0.3 && Math.abs(err) > 0.1) want = Math.sign(err) * Math.min(0.49, (Math.abs(err) - 0.1) * 1.2) * (0.4 + 0.6 * sf) * (turning ? 0.2 : 1);
      this.yawRate = damp(this.yawRate, want, 2, dt);
      this.heading += this.yawRate * dt;

      // rise with the ground the dog stands on (a garage roof) fully, with its jumps only half way
      this.yG = damp(this.yG || 0, p.ground || 0, 3, dt);
      this.yS = damp(this.yS, p.y, 2.5, dt);
      const lift = this.yG + Math.max(0, this.yS - this.yG) * 0.5;
      const dist = 4.6, h = 2.6 + lift;
      const bx = Math.sin(this.heading), bz = Math.cos(this.heading);
      // follow the dog's position softly, aiming a little ahead so it does not drift off-centre
      // (above the normal top speed the look-ahead stops growing: at super speed the dog stays in the
      // same place on the screen and the camera falls a little behind, which reads as more speed)
      const K = 6, vk = Math.min(1, C.MAX_SPEED / Math.max(1e-3, Math.hypot(p.vx, p.vz))), vx = p.vx * vk, vz = p.vz * vk;
      this.pos.x = damp(this.pos.x, p.x + bx * dist + vx / K, K, dt);
      this.pos.y = damp(this.pos.y, h, 3, dt);
      this.pos.z = damp(this.pos.z, p.z + bz * dist + vz / K, K, dt);
      this.world.pushOut(this.pos, 0.7);
      const cam = this.cam;
      cam.position.copy(this.pos);
      // look at a point just ahead of the dog, at a fixed downward tilt
      this.look.set(p.x - bx * 2.2 + vx / K, 0.5 + this.yG + Math.max(0, this.yS - this.yG) * 0.6, p.z - bz * 2.2 + vz / K);
      if (!this.lookS) this.lookS = this.look.clone();
      const k = 1 - Math.exp(-8 * dt);
      this.lookS.x += (this.look.x - this.lookS.x) * k;
      this.lookS.y += (this.look.y - this.lookS.y) * k;
      this.lookS.z += (this.look.z - this.lookS.z) * k;
      cam.lookAt(this.lookS);
      if (cam.fov !== this.baseFov) { cam.fov = this.baseFov; cam.updateProjectionMatrix(); }
      void sf; void time;
    }
  }
  R.CameraRig = CameraRig;
})(window.R = window.R || {});
