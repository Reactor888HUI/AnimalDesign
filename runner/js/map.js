(function (R) {
  // ===================================================================================================
  //  DISTRICT MAP
  //   - a round minimap in the corner: the streets and blocks round the dog, turned with the camera
  //     (up on the map = forward on the screen, like the stick), the dog in the middle, the cat or the
  //     quest target as a dot, places worth a visit as small icons;
  //   - a tap on it (or K) opens the big map: 9 x 9 blocks, north up, every place marked, a legend.
  //     In the runner a tap on a marked place takes the dog straight there ("бежать сюда").
  //  Everything is drawn from the city's layout function, so the map shows blocks that are not built yet.
  // ===================================================================================================
  const C = R.C, P = C.P, HP = P / 2, PADH = C.B / 2 + C.SW;
  const TYPE = {
    city:    { fill: '#8b7f75', name: 'Жилой квартал' },
    park:    { fill: '#5f9a4c', name: 'Парк' },
    square:  { fill: '#cbb894', name: 'Площадь с фонтаном', icon: 'fountain' },
    plaza:   { fill: '#b9a079', name: 'Паркур-площадка', icon: 'parkour' },
    garages: { fill: '#9a8f86', name: 'Гаражи с трамплинами', icon: 'garages' },
    yard:    { fill: '#7d7a72', name: 'Склад' },
  };
  // where the dog appears when it travels to a place (local to the block), and which way it looks
  const SPOT = {
    garages: { x: -21.6, z: -12, h: -Math.PI / 2 },   // at the foot of the ramp up to the first roofs (the camera on the sidewalk)
    plaza:   { x: -21.6, z: -10, h: -Math.PI / 2 },   // at the foot of the container run
    square:  { x: 0, z: 15, h: 0 },                    // facing the fountain
    park:    { x: 0, z: PADH - 2, h: 0 },
  };

  function icon(g, kind, x, y, s) {
    g.save(); g.translate(x, y);
    g.lineWidth = Math.max(1.5, s * 0.14); g.strokeStyle = '#1b1712'; g.fillStyle = '#fff6e0';
    g.beginPath(); g.arc(0, 0, s * 0.62, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#1b1712';
    if (kind === 'garages') {         // a ramp and a dot flying off it
      g.beginPath(); g.moveTo(-s * 0.4, s * 0.25); g.lineTo(s * 0.15, s * 0.25); g.lineTo(s * 0.15, -s * 0.05); g.closePath(); g.fill();
      g.beginPath(); g.arc(s * 0.3, -s * 0.28, s * 0.11, 0, Math.PI * 2); g.fill();
    } else if (kind === 'parkour') {  // two boxes
      g.fillRect(-s * 0.38, -s * 0.05, s * 0.3, s * 0.32); g.fillRect(s * 0.02, -s * 0.3, s * 0.34, s * 0.57);
    } else if (kind === 'fountain') { // a drop
      g.beginPath(); g.moveTo(0, -s * 0.38); g.quadraticCurveTo(s * 0.32, s * 0.05, 0, s * 0.3); g.quadraticCurveTo(-s * 0.32, s * 0.05, 0, -s * 0.38); g.fill();
    }
    g.restore();
  }

  class DistrictMap {
    constructor(ctx, opts) {
      this.ctx = ctx; this.opts = opts || {};
      this.mini = document.getElementById('minimap'); this.big = document.getElementById('bigmap');
      this.mc = this.mini.querySelector('canvas'); this.bc = this.big.querySelector('canvas.map');
      this.open = false; this.t = 0; this.hit = [];
      this.mini.hidden = false;
      this.mini.addEventListener('click', () => this.toggle(true));
      this.big.querySelector('.close').addEventListener('click', () => this.toggle(false));
      this.bc.addEventListener('click', e => this.tap(e));
      addEventListener('keydown', e => {
        if (e.repeat) return;
        if (e.code === 'KeyK') this.toggle(!this.open);
        else if (e.code === 'Escape' && this.open) this.toggle(false);
      });
      this.big.querySelector('.travel').hidden = !this.opts.travel;
      for (const c of this.big.querySelectorAll('.legend canvas')) { c.width = c.height = 32; icon(c.getContext('2d'), c.dataset.icon, 16, 16, 24); }
    }
    toggle(on) {
      this.open = on; this.big.hidden = !on;
      this.ctx.paused = on;
      if (on) this.drawBig();
    }
    // ---- the ground of one block, in world metres, onto a canvas transform ----
    block(g, ci, cj, detail) {
      const L = R.worldGen.layout(ci, cj), ox = ci * P, oz = cj * P, T = TYPE[L.type] || TYPE.city;
      // sidewalk pad, then the block
      g.fillStyle = L.type === 'city' ? '#c9c1b5' : '#d8cdb5';
      g.fillRect(ox - PADH, oz - PADH, PADH * 2, PADH * 2);
      g.fillStyle = T.fill;
      const inset = L.type === 'city' ? C.B / 2 : PADH - 1.5;
      g.fillRect(ox - inset, oz - inset, inset * 2, inset * 2);
      if (L.type === 'city' && detail) {       // the houses round the edge, a courtyard in the middle
        g.fillStyle = '#6c6159'; g.fillRect(ox - inset, oz - inset, inset * 2, inset * 2);
        g.fillStyle = '#a99d8e'; g.fillRect(ox - inset + 9, oz - inset + 9, inset * 2 - 18, inset * 2 - 18);
      }
      if (L.type === 'park' && detail) {       // paths
        g.fillStyle = '#d6c79e'; g.fillRect(ox - 1.5, oz - inset, 3, inset * 2); g.fillRect(ox - inset, oz - 1.5, inset * 2, 3);
      }
      // pedestrian streets on this block's sides
      g.fillStyle = '#d8cdb5';
      [[0, 1], [1, 0], [0, -1], [-1, 0]].forEach(([nx, nz], i) => {
        if (!L.ped[i]) return;
        if (nz) g.fillRect(ox - PADH, oz + nz * PADH - (nz < 0 ? HP - PADH : 0), PADH * 2, HP - PADH);
        else g.fillRect(ox + nx * PADH - (nx < 0 ? HP - PADH : 0), oz - PADH, HP - PADH, PADH * 2);
      });
      return L;
    }
    markers() { return this.opts.markers ? this.opts.markers() : []; }

    // ---- minimap: round, turned with the camera ----
    update(dt) {
      this.t -= dt;
      if (this.t > 0 || this.open) return;
      this.t = 0.12;
      const cv = this.mc, S = cv.width, g = cv.getContext('2d'), p = this.ctx.player, R_ = 95;   // metres from the centre to the edge
      const k = S / 2 / R_, rig = this.ctx.rig;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, S, S);
      g.save();
      g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); g.clip();
      g.fillStyle = '#3c3f47'; g.fillRect(0, 0, S, S);              // the streets
      // world -> map: the dog in the middle, the camera's forward up
      const h = rig.heading;
      g.translate(S / 2, S / 2); g.scale(k, k); g.rotate(h); g.translate(-p.x, -p.z);
      const ci0 = Math.round(p.x / P), cj0 = Math.round(p.z / P), icons = [];
      for (let cj = cj0 - 2; cj <= cj0 + 2; cj++) for (let ci = ci0 - 2; ci <= ci0 + 2; ci++) {
        const L = this.block(g, ci, cj, true);
        if (TYPE[L.type] && TYPE[L.type].icon) icons.push([TYPE[L.type].icon, ci * P, cj * P]);
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      const toMap = (x, z) => {
        const dx = x - p.x, dz = z - p.z, c = Math.cos(h), s = Math.sin(h);
        return [S / 2 + (dx * c - dz * s) * k, S / 2 + (dx * s + dz * c) * k];
      };
      for (const [kind, x, z] of icons) { const [mx, my] = toMap(x, z); icon(g, kind, mx, my, S * 0.09); }
      // markers (the cat, the client ...): on the edge, pointing, when they are off the map
      for (const m of this.markers()) {
        let [mx, my] = toMap(m.x, m.z);
        const dx = mx - S / 2, dy = my - S / 2, d = Math.hypot(dx, dy), rim = S / 2 - 8;
        const off = d > rim;
        if (off) { mx = S / 2 + dx / d * rim; my = S / 2 + dy / d * rim; }
        g.fillStyle = m.color || '#ff4d6d'; g.strokeStyle = '#fff'; g.lineWidth = 2;
        g.beginPath(); g.arc(mx, my, off ? 4.5 : 5.5, 0, Math.PI * 2); g.fill(); g.stroke();
      }
      g.restore();
      // the dog: an arrow in the middle, pointing where it runs (relative to the camera)
      g.save(); g.translate(S / 2, S / 2); g.rotate(-(p.heading - h));
      g.fillStyle = '#ffd36a'; g.strokeStyle = '#1b1712'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.stroke();
      g.restore();
      // "N" on the rim: where north is
      const nx = S / 2 + Math.sin(-h) * -(S / 2 - 9), ny = S / 2 - Math.cos(-h) * (S / 2 - 9);
      g.fillStyle = '#fff'; g.font = '700 11px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('С', nx, ny);
    }

    // ---- the big map: north up, 9 x 9 blocks round the dog ----
    drawBig() {
      // a square canvas as wide as the frame
      const cv = this.bc, dpr = Math.min(2, devicePixelRatio || 1), W = this.big.querySelector('.frame').clientWidth - 24, H = W;
      cv.style.height = W + 'px';
      cv.width = W * dpr; cv.height = H * dpr;
      const g = cv.getContext('2d'), p = this.ctx.player, N = 4;
      const ci0 = Math.round(p.x / P), cj0 = Math.round(p.z / P);
      const span = (2 * N + 1) * P, k = Math.min(W, H) * dpr / span, cx = cv.width / 2, cy = cv.height / 2;
      const X = x => cx + (x - ci0 * P) * k, Y = z => cy + (z - cj0 * P) * k;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#2b2d33'; g.fillRect(0, 0, cv.width, cv.height);
      g.setTransform(k, 0, 0, k, cx - ci0 * P * k, cy - cj0 * P * k);
      this.hit = [];
      const places = [];
      for (let cj = cj0 - N; cj <= cj0 + N; cj++) for (let ci = ci0 - N; ci <= ci0 + N; ci++) {
        const L = this.block(g, ci, cj, true);
        if (SPOT[L.type]) places.push([L.type, ci, cj]);
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      const s = Math.max(16, P * k * 0.28);
      for (const [type, ci, cj] of places) {
        const x = X(ci * P), y = Y(cj * P);
        if (TYPE[type].icon) icon(g, TYPE[type].icon, x, y, s);
        this.hit.push({ type, ci, cj, x: x / dpr, y: y / dpr, r: P * k / dpr / 2 });
      }
      for (const m of this.markers()) {
        g.fillStyle = m.color || '#ff4d6d'; g.strokeStyle = '#fff'; g.lineWidth = 2 * dpr;
        g.beginPath(); g.arc(X(m.x), Y(m.z), 6 * dpr, 0, Math.PI * 2); g.fill(); g.stroke();
      }
      // the dog
      g.save(); g.translate(X(p.x), Y(p.z)); g.rotate(-p.heading);
      g.fillStyle = '#ffd36a'; g.strokeStyle = '#1b1712'; g.lineWidth = 2 * dpr; const a = 11 * dpr;
      g.beginPath(); g.moveTo(0, -a); g.lineTo(a * 0.7, a * 0.7); g.lineTo(0, a * 0.35); g.lineTo(-a * 0.7, a * 0.7); g.closePath(); g.fill(); g.stroke();
      g.restore();
      this.big.querySelector('.place').textContent = '';
    }
    tap(e) {
      if (!this.opts.travel) return;
      const r = this.bc.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const h = this.hit.find(q => Math.abs(q.x - x) < q.r && Math.abs(q.y - y) < q.r);
      if (h) this.travel(h.ci, h.cj, h.type);
    }
    // take the dog to a place: in front of the ramp, the containers, the fountain ...
    travel(ci, cj, type) {
      const p = this.ctx.player, w = this.ctx.world, s = SPOT[type] || SPOT.park;
      let x = ci * P + s.x, z = cj * P + s.z;
      w.update(x, z, 99);
      // a free spot (no lamp post or bench right there)
      const blocked = (x, z) => w.obstaclesNear(x, z, 0.6).some(o => !o.ramp && o.h > 0.3 && Math.abs(x - o.x) < o.hx + 0.6 && Math.abs(z - o.z) < o.hz + 0.6);
      for (let i = 0; i < 24 && blocked(x, z); i++) { const a = i * 2.4, d = 0.6 + i * 0.3; x = ci * P + s.x + Math.cos(a) * d; z = cj * P + s.z + Math.sin(a) * d; }
      Object.assign(p, { x, z, y: w.groundAt(x, z, 0.5), vy: 0, vx: 0, vz: 0, speed: 0, heading: s.h, air: false, crash: -1, slide: -1 });
      p.ground = p.y;
      this.ctx.rig.snap(p);
      this.toggle(false);
      this.ctx.say(TYPE[type].name);
      if (this.opts.onTravel) this.opts.onTravel(x, z);
    }
  }
  DistrictMap.TYPE = TYPE; DistrictMap.SPOT = SPOT;
  R.DistrictMap = DistrictMap;
})(window.R = window.R || {});
