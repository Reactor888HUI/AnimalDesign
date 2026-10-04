(function (R) {
  const C = R.C, clamp = R.clamp, damp = R.damp;

  class CameraRig {
    constructor(camera, world) {
      this.cam = camera; this.world = world;
      this.heading = 0; this.fov = 68; this.baseFov = 68;
      this.pos = new THREE.Vector3(0, 1.4, 3.5);
      this.look = new THREE.Vector3();
      this.lookS = null; this.yS = 0; this.yawRate = 0;
    }
    snap(p) {
      this.heading = p.heading;
      this.pos.set(p.x + Math.sin(p.heading) * 2.8, 1.0, p.z + Math.cos(p.heading) * 2.8);
      this.cam.position.copy(this.pos);
      this.lookS = null; this.yS = p.y; this.yawRate = 0;
    }
    resize(aspect) {
      this.cam.aspect = aspect;
      this.baseFov = aspect < 1 ? 68 + (1 - aspect) * 26 : 68;
    }
    // A calm chase camera. It does not chase every wiggle of the dog:
    //  - small heading changes (a dead zone) do not turn it at all;
    //  - beyond that it turns at a capped speed that builds up and settles softly;
    //  - no roll, almost no zoom, no bounce on landings.
    // The camera always stands behind the dog's position, so the dog stays in the middle of the
    // picture; when it turns sharply you see it turn, and the view comes round after it.
    update(dt, p, time) {
      const sf = clamp(p.speed / C.MAX_SPEED, 0, 1);
      const err = R.angDiff(this.heading, p.heading), ae = Math.abs(err);
      const DEAD = 0.17;                                    // ~10 degrees
      const MAX = ae > 1.75 ? 1.2 : 0.6;                    // ~35 deg/s, ~70 when the dog turned right round
      const want = ae < DEAD ? 0 : Math.sign(err) * Math.min(MAX, (ae - DEAD) * 1.1);
      this.yawRate = damp(this.yawRate || 0, want, 2.5, dt);
      this.heading += this.yawRate * dt;
      this.yS = damp(this.yS, p.y, 3, dt);
      const dist = 3.0 + sf * 0.4;
      const h = 1.15 + sf * 0.2 + this.yS * 0.6;
      const bx = Math.sin(this.heading), bz = Math.cos(this.heading);
      const K = 7;
      this.pos.x = damp(this.pos.x, p.x + bx * dist + p.vx / K, K, dt);
      this.pos.y = damp(this.pos.y, h, 3, dt);
      this.pos.z = damp(this.pos.z, p.z + bz * dist + p.vz / K, K, dt);
      this.world.pushOut(this.pos, 0.7);

      const cam = this.cam;
      cam.position.copy(this.pos);
      if (p.shake > 0.5) {                                  // only real knocks (a car) shake the view
        const s = (p.shake - 0.5) * 0.06;
        cam.position.x += Math.sin(time * 41) * s;
        cam.position.y += Math.cos(time * 37) * s;
      }
      // look along the camera's own (slow) direction, at a fixed tilt
      this.look.set(this.pos.x - bx * 6, 0.55 + this.yS * 0.7, this.pos.z - bz * 6);
      if (!this.lookS) this.lookS = this.look.clone();
      const k = 1 - Math.exp(-6 * dt);
      this.lookS.x += (this.look.x - this.lookS.x) * k;
      this.lookS.y += (this.look.y - this.lookS.y) * k;
      this.lookS.z += (this.look.z - this.lookS.z) * k;
      cam.lookAt(this.lookS);

      this.fov = damp(this.fov, this.baseFov + sf * 5, 1.5, dt);
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
  R.CameraRig = CameraRig;
})(window.R = window.R || {});
