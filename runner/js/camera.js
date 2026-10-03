(function (R) {
  const C = R.C, clamp = R.clamp, damp = R.damp;

  class CameraRig {
    constructor(camera, world) {
      this.cam = camera; this.world = world;
      this.heading = 0; this.fov = 68; this.baseFov = 68;
      this.pos = new THREE.Vector3(0, 1.4, 3.5);
      this.look = new THREE.Vector3();
      this.roll = 0;
    }
    snap(p) {
      this.heading = p.heading;
      this.pos.set(p.x + Math.sin(p.heading) * 2.8, 1.0, p.z + Math.cos(p.heading) * 2.8);
      this.cam.position.copy(this.pos);
    }
    resize(aspect) {
      this.cam.aspect = aspect;
      this.baseFov = aspect < 1 ? 68 + (1 - aspect) * 26 : 68;
    }
    update(dt, p, time) {
      const sf = clamp(p.speed / C.MAX_SPEED, 0, 1);
      const lag = R.angDiff(this.heading, p.heading);
      this.heading += lag * (1 - Math.exp(-4.5 * dt));
      const dist = 2.8 + sf * 1.0;
      const h = 1.0 + sf * 0.3 + p.y * 0.45;
      const bx = Math.sin(this.heading), bz = Math.cos(this.heading);
      this.pos.x = damp(this.pos.x, p.x + bx * dist, 11, dt);
      this.pos.y = damp(this.pos.y, h, 7, dt);
      this.pos.z = damp(this.pos.z, p.z + bz * dist, 11, dt);
      this.world.pushOut(this.pos, 0.7);

      const cam = this.cam;
      cam.position.copy(this.pos);
      if (p.shake > 0) {
        const s = p.shake * 0.1;
        cam.position.x += Math.sin(time * 61) * s;
        cam.position.y += Math.cos(time * 53) * s;
      }
      this.look.set(p.x - bx * 5, 0.5 + p.y * 0.4, p.z - bz * 5);
      cam.lookAt(this.look);
      const roll = -p.steerS * sf * 0.05 + lag * 0.35;
      this.roll = damp(this.roll, roll, 8, dt);
      cam.rotateZ(this.roll);

      this.fov = damp(this.fov, this.baseFov + sf * 16, 5, dt);
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
  R.CameraRig = CameraRig;
})(window.R = window.R || {});
