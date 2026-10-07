(function (R) {
  const C = R.C, clamp = R.clamp, damp = R.damp;

  // A comfortable chase camera (the usual advice against motion sickness):
  //  - it never rolls, never shakes, never bobs and does not zoom with speed;
  //  - it comes round behind the running dog by itself, softly, with a lag and at most ~24 deg/s
  //    (no snapping after every little turn), so the stick's "up" soon means "where the dog runs" again;
  //  - the player can turn it too (drag / Z, X), as in most games: the finger or mouse to the right
  //    looks right; after that it waits a moment before it comes round again;
  //  - or (the runner's default) it is on "the leash": fixed close behind the dog, see leash();
  //  - or "GoPro": on the dog's head, see onHead();
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
      this.locked = false;   // on the leash behind the dog (the runner's default) or free (turned by hand)
      this.gopro = false;    // locked and on the dog's head instead of behind it (the "GoPro" view)
      this.hideDog = false;  // the GoPro view in a flip or a crash: the head would sweep through the picture
    }
    snap(p) {
      this.heading = p.heading;
      this.pos.set(p.x + Math.sin(p.heading) * 4.6, 2.6, p.z + Math.cos(p.heading) * 4.6);
      this.cam.position.copy(this.pos);
      this.lookS = null; this.yS = p.y; this.yG = p.ground || 0; this.yawRate = 0;
      if (this.locked) { this.hS = null; this.hO = this.hP = undefined; this[this.gopro ? 'onHead' : 'leash'](0, p); }
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
    // "the leash" (the runner's default): fixed about a metre behind the collar and a little above the
    // dog's head, as if tied to it — it turns and moves with the dog at once. Only an instant turn (a wall
    // jump) is eased over a few frames, and the gallop's bounce is softened a little, so it never jumps.
    leash(dt, p) {
      const err = R.angDiff(this.heading, p.heading);
      this.yawRate = clamp(err * 25, -6, 6);
      this.heading += this.yawRate * dt;
      this.yS = damp(this.yS, p.y, 25, dt);
      // in the air the dog's body tips up into the view: go up and back a little with it
      this.airK = damp(this.airK || 0, p.air ? 1 : 0, p.air ? 8 : 4, dt);
      const bx = Math.sin(this.heading), bz = Math.cos(this.heading);
      const BACK = 0.6 + 0.5 * this.airK, UP = 1.45 + 0.45 * this.airK;   // the collar is ~0.4 m ahead of the centre: ~1 m behind it
      this.pos.set(p.x + bx * BACK, this.yS + UP, p.z + bz * BACK);
      this.world.pushOut(this.pos, 0.25);
      const cam = this.cam;
      cam.position.copy(this.pos);
      this.look.set(p.x - bx * 8, this.yS + 0.45, p.z - bz * 8);
      cam.lookAt(this.look);
      this.lookS = null; this.yG = p.ground || 0;
      const fov = this.baseFov + 6;          // a little wider this close: more of the street in view
      if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    }
    // "GoPro": on the dog's forehead, looking ahead; only the muzzle shows at the bottom.
    // The head bobs ~25 cm at a gallop: the camera keeps to the top of that bob (it rises with the head
    // at once and sinks back slowly), so the head only moves below it and the picture stays steady;
    // forward it follows where the head is on average. It never rolls and keeps a fixed downward tilt.
    onHead(dt, p) {
      const err = R.angDiff(this.heading, p.heading);
      this.yawRate = clamp(err * 25, -6, 6);
      this.heading += this.yawRate * dt;
      this.yS = damp(this.yS, p.y, 25, dt);
      const bx = Math.sin(this.heading), bz = Math.cos(this.heading);
      // where the head is relative to the dog (forward, up); not in a flip or a crash, when it turns over
      const B = p.ent && p.ent.bones, flip = p.flip >= 0 || p.crash >= 0;
      if (!this.hS) this.hS = { f: 0.57, y: 0.92 };
      if (B && B.head && !flip) {
        const v = B.head.getWorldPosition(this.look);
        const f = clamp(-(v.x - p.x) * bx - (v.z - p.z) * bz, 0.3, 0.8), y = clamp(v.y - p.y, 0.4, 1.05);
        this.hS.f = damp(this.hS.f, f, 2, dt);
        // (the nose to the ground: it goes down with the head, quicker)
        this.hS.y = y > this.hS.y ? damp(this.hS.y, y, 14, dt) : Math.max(y, this.hS.y - (p.sniff ? 0.5 : 0.06) * dt);
      }
      // ...and the little saw of that (up with each stride, down slowly) is smoothed away
      this.hO = this.hO === undefined || !dt ? this.hS.y : damp(this.hO, this.hS.y, 2.5, dt);
      this.hideDog = flip;
      if (B && B.head && !flip && dt) this.holdHead(B.head, p, dt, bx, bz);
      const F = this.hS.f - 0.04, UP = this.hO + 0.24;   // above the forehead, a little behind the eyes
      this.pos.set(p.x - bx * F, this.yS + UP, p.z - bz * F);
      this.world.pushOut(this.pos, 0.2);
      const cam = this.cam;
      cam.position.copy(this.pos);
      // sniffing: it looks a little further down, at the threads by the nose
      this.sniffK = damp(this.sniffK || 0, p.sniff ? 1 : 0, 2, dt);
      this.look.set(this.pos.x - bx * 10, this.pos.y - 2.4 - 1.4 * this.sniffK, this.pos.z - bz * 10);
      cam.lookAt(this.look);
      this.lookS = null; this.yG = p.ground || 0;
      // wide, like an action camera (upright the picture is tall already: a little narrower, less muzzle)
      const fov = this.baseFov + (cam.aspect >= 1 ? 8 : -8);
      if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    }
    // ...and the head itself is held steady in front of the camera (after the animation has posed it):
    // where it is on average, with 15 % of its bob left for life, at its average tilt, never rolled. Only
    // the muzzle is in the picture, so the gallop does not make it jump about at the bottom of the screen.
    holdHead(head, p, dt, bx, bz) {
      const T = this._t || (this._t = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), s: new THREE.Vector3(), e: new THREE.Euler(0, 0, 0, 'YXZ'), f: new THREE.Vector3() });
      head.updateWorldMatrix(true, false);
      head.matrixWorld.decompose(T.v, T.q, T.s);
      // its tilt and its turn (it looks into turns) now, from the way the muzzle points
      T.f.set(0, 0, -1).applyQuaternion(T.q);
      const pitch = Math.asin(clamp(T.f.y, -1, 1)), yaw = R.angDiff(this.heading, Math.atan2(-T.f.x, -T.f.z));
      if (this.hP === undefined) { this.hP = pitch; this.hYaw = yaw; }
      this.hP = damp(this.hP, pitch, 2, dt); this.hYaw = damp(this.hYaw, yaw, 4, dt);
      const K = 0.15;
      T.v.set(
        p.x - bx * this.hS.f + (T.v.x - (p.x - bx * this.hS.f)) * K,
        this.yS + this.hO + (T.v.y - (this.yS + this.hO)) * K,
        p.z - bz * this.hS.f + (T.v.z - (p.z - bz * this.hS.f)) * K);
      T.e.set(this.hP + (pitch - this.hP) * K, this.heading + this.hYaw, 0);
      T.q.setFromEuler(T.e);
      T.m.compose(T.v, T.q, T.s);
      // into the neck's frame
      head.matrix.copy(head.parent.matrixWorld).invert().multiply(T.m);
      head.matrix.decompose(head.position, head.quaternion, head.scale);
      head.updateMatrixWorld(true);
    }
    update(dt, p, time, input) {
      if (input) { if (!this.locked) this.turn(input.camDrag || 0, input.camTurn || 0, dt); input.camDrag = 0; }
      this.hideDog = false;
      if (this.locked) { if (this.gopro) this.onHead(dt, p); else this.leash(dt, p); return; }
      const sf = clamp(p.speed / C.MAX_SPEED, 0, 1);
      // free: coming round behind the running dog, a soft spring with a small dead zone, never faster than
      // ~24 deg/s (the comfort limit: a faster swing made the player dizzy), and not while the dog is
      // still in a turn, so the picture does not whip round after it
      const err = R.angDiff(this.heading, p.heading);
      const turning = Math.abs(p.yawRate || 0) > 0.6;
      this.steady = p.speed < 2.5 ? Math.min(this.steady, 0) : Math.min(1.5, this.steady + dt);
      let want = 0;
      if (this.autoAlign && this.steady > 0.4 && Math.abs(err) > 0.12) want = Math.sign(err) * Math.min(0.42, (Math.abs(err) - 0.12) * 1.1) * (0.3 + 0.7 * sf) * (turning ? 0 : 1);
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
