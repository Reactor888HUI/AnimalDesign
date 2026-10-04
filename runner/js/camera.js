(function (R) {
  const C = R.C, clamp = R.clamp, damp = R.damp;

  class CameraRig {
    constructor(camera, world) {
      this.cam = camera; this.world = world;
      this.heading = 0; this.fov = 68; this.baseFov = 68;
      this.pos = new THREE.Vector3(0, 1.4, 3.5);
      this.look = new THREE.Vector3();
      this.roll = 0; this.lookS = null; this.yS = 0;
    }
    snap(p) {
      this.heading = p.heading;
      this.pos.set(p.x + Math.sin(p.heading) * 2.8, 1.0, p.z + Math.cos(p.heading) * 2.8);
      this.cam.position.copy(this.pos);
      this.lookS = null; this.yS = p.y;
    }
    resize(aspect) {
      this.cam.aspect = aspect;
      this.baseFov = aspect < 1 ? 68 + (1 - aspect) * 26 : 68;
    }
    update(dt, p, time) {
      const sf = clamp(p.speed / C.MAX_SPEED, 0, 1);
      // the camera swings round after the dog a little late, which reads as smooth
      const lag = R.angDiff(this.heading, p.heading);
      this.heading += lag * (1 - Math.exp(-3.8 * dt));
      // follow jumps most of the way up, softly, so the dog stays in view without a bouncy picture
      this.yS = damp(this.yS, p.y, 7, dt);
      const dist = 2.8 + sf * 0.5;
      const h = 1.0 + sf * 0.3 + this.yS * 0.75;
      const bx = Math.sin(this.heading), bz = Math.cos(this.heading);
      // aim a little ahead by the dog's velocity: smooth like a lagging camera, but the dog stays close
      const K = 8;
      this.pos.x = damp(this.pos.x, p.x + bx * dist + p.vx / K, K, dt);
      this.pos.y = damp(this.pos.y, h, 5, dt);
      this.pos.z = damp(this.pos.z, p.z + bz * dist + p.vz / K, K, dt);
      this.world.pushOut(this.pos, 0.7);

      const cam = this.cam;
      cam.position.copy(this.pos);
      if (p.shake > 0) {
        const s = p.shake * 0.1;
        cam.position.x += Math.sin(time * 61) * s;
        cam.position.y += Math.cos(time * 53) * s;
      }
      this.look.set(p.x - bx * 5, 0.5 + this.yS * 0.8, p.z - bz * 5);
      if (!this.lookS) this.lookS = this.look.clone();
      const k = 1 - Math.exp(-14 * dt);
      this.lookS.x += (this.look.x - this.lookS.x) * k;
      this.lookS.y += (this.look.y - this.lookS.y) * k;
      this.lookS.z += (this.look.z - this.lookS.z) * k;
      cam.lookAt(this.lookS);
      const roll = -p.steerS * sf * 0.05 + lag * 0.35;
      this.roll = damp(this.roll, roll, 8, dt);
      cam.rotateZ(this.roll);

      this.fov = damp(this.fov, this.baseFov + sf * 9 + (p.air ? 2 : 0), 4, dt);
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
  R.CameraRig = CameraRig;
})(window.R = window.R || {});
