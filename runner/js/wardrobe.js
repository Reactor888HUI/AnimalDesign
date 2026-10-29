(function (R) {
  // ===================================================================================================
  //  WARDROBE — rewards for the daily quests: things the whippet can wear and do. Bought with stars,
  //  one item per slot worn at a time. Everything is built in code, low-poly like the dog.
  //   collar: red (own), gold with a bell (jingles on the run), rainbow LED (glows, best at night),
  //           punk spikes, a bandana
  //   head:   aviator glasses, a propeller cap (spins with the speed), a top hat, a crown, a party hat
  //   coat:   fawn (own), brindle, black and white, blue, gold (shines)
  //   trail:  paw prints, stars, hearts, soap bubbles, fire, a rainbow
  //   voice:  the bark (own), a duck's quack, a meow (the cat is shocked), a squeaky toy
  // ===================================================================================================
  const ITEMS = [
    { id: 'collar-red', slot: 'collar', name: 'Красный ошейник', cost: 0, own: true },
    { id: 'collar-gold', slot: 'collar', name: 'Золотой с колокольчиком', cost: 3, desc: 'звенит на бегу' },
    { id: 'collar-led', slot: 'collar', name: 'Светодиодный', cost: 5, desc: 'переливается радугой, ночью светится' },
    { id: 'collar-punk', slot: 'collar', name: 'Панк с шипами', cost: 4 },
    { id: 'collar-bandana', slot: 'collar', name: 'Бандана', cost: 2, desc: 'как у ковбоя' },
    { id: 'head-none', slot: 'head', name: 'Без шапки', cost: 0, own: true },
    { id: 'head-aviators', slot: 'head', name: 'Очки-авиаторы', cost: 3, desc: 'для скорости' },
    { id: 'head-propeller', slot: 'head', name: 'Кепка с пропеллером', cost: 6, desc: 'крутится от скорости' },
    { id: 'head-tophat', slot: 'head', name: 'Цилиндр', cost: 4, desc: 'джентльмен' },
    { id: 'head-party', slot: 'head', name: 'Праздничный колпак', cost: 2 },
    { id: 'head-crown', slot: 'head', name: 'Корона', cost: 9, desc: 'королева района' },
    { id: 'coat-fawn', slot: 'coat', name: 'Палевый', cost: 0, own: true },
    { id: 'coat-brindle', slot: 'coat', name: 'Тигровый', cost: 4, coat: { fawn: 0xa36a35, stripes: 1 } },
    { id: 'coat-black', slot: 'coat', name: 'Чёрно-белый', cost: 4, coat: { fawn: 0x24221f } },
    { id: 'coat-blue', slot: 'coat', name: 'Голубой', cost: 5, desc: 'дымчатый, как у породы', coat: { fawn: 0x56637a } },
    { id: 'coat-gold', slot: 'coat', name: 'Золотой', cost: 10, desc: 'блестит', coat: { fawn: 0xd8a73a, white: 0xfff0c8, metal: 1 } },
    { id: 'trail-none', slot: 'trail', name: 'Без следа', cost: 0, own: true },
    { id: 'trail-paws', slot: 'trail', name: 'Светящиеся лапки', cost: 2, fx: { map: 'paw', color: 0x9fe8ff, ground: true } },
    { id: 'trail-stars', slot: 'trail', name: 'Звёздочки', cost: 3, fx: { map: 'star', color: 0xffe066 } },
    { id: 'trail-hearts', slot: 'trail', name: 'Сердечки', cost: 4, fx: { map: 'heart', color: 0xff6b9a } },
    { id: 'trail-bubbles', slot: 'trail', name: 'Мыльные пузыри', cost: 5, fx: { map: 'bubble', color: 0xbfe9ff, float: true } },
    { id: 'trail-fire', slot: 'trail', name: 'Огонь', cost: 7, fx: { map: 'flame', color: 0xffd23a, fire: true } },
    { id: 'trail-rainbow', slot: 'trail', name: 'Радуга', cost: 8, fx: { map: null, rainbow: true } },
    { id: 'voice-bark', slot: 'voice', name: 'Лай', cost: 0, own: true },
    { id: 'voice-quack', slot: 'voice', name: 'Кря', cost: 2, desc: 'собака-утка' },
    { id: 'voice-meow', slot: 'voice', name: 'Мяу', cost: 3, desc: 'кот в шоке' },
    { id: 'voice-squeak', slot: 'voice', name: 'Пищалка', cost: 2, desc: 'как резиновая игрушка' },
  ];
  let BAND_Z = -0.065;   // the bandana's tip: down the front of the chest (collar space)
  const SLOTS = [['collar', 'Ошейник'], ['head', 'На голову'], ['coat', 'Окрас'], ['trail', 'След'], ['voice', 'Голос']];
  const byId = Object.fromEntries(ITEMS.map(i => [i.id, i]));

  // ---- little low-poly meshes ---------------------------------------------------------------------
  // metal needs something to reflect: the room environment the game made for the dog's coat
  const std = (c, o) => { const m = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.55, metalness: 0, flatShading: true }, o || {})); if (m.metalness > 0 && R.envTexture) { m.envMap = R.envTexture; m.envMapIntensity = 1.4; } return m; };
  const mesh = (g, m, f) => { const x = new THREE.Mesh(g, m); x.castShadow = true; if (f) f(x); return x; };
  function build(id) {
    const g = new THREE.Group();
    if (id === 'head-aviators') {
      // two teardrop lenses in a thin gold frame, sitting on the muzzle in front of the eyes
      const lens = std(0x1d2a3a, { roughness: 0.1, metalness: 0.6 }), frame = std(0xd8b14a, { metalness: 0.8, roughness: 0.3 });
      for (const s of [-1, 1]) {
        const l = mesh(new THREE.CylinderGeometry(0.019, 0.016, 0.004, 8), lens, m => { m.rotation.z = Math.PI / 2; m.rotation.y = s * 0.55; m.scale.set(1, 1, 0.8); m.position.set(s * 0.034, 0, -0.006); });
        g.add(l);
      }
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.004, 0.004), frame, m => m.position.set(0, 0.012, -0.022)));
      for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.003, 0.003, 0.05), frame, m => m.position.set(s * 0.045, 0.006, 0.02)));
    } else if (id === 'head-propeller') {
      const cap = std(0xe23b3b), stripe = std(0xf6d23a), pole = std(0x222222);
      g.add(mesh(new THREE.SphereGeometry(0.034, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), cap, m => m.scale.set(1, 0.7, 1.1)));
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.004, 0.024), stripe, m => m.position.set(0, 0.002, -0.035)));        // the peak
      g.add(mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.03, 4), pole, m => m.position.y = 0.035));
      const prop = new THREE.Group(); prop.position.y = 0.05; prop.name = 'spin';
      for (const [c, a] of [[0x3fa7ff, 0], [0x45d483, Math.PI]]) prop.add(mesh(new THREE.BoxGeometry(0.07, 0.003, 0.014), std(c), m => { m.position.x = Math.cos(a) * 0.035; m.rotation.x = 0.35 * (a ? -1 : 1); }));
      g.add(prop);
    } else if (id === 'head-tophat') {
      const black = std(0x16151a, { roughness: 0.35 }), band = std(0xb02a2a);
      g.add(mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.004, 10), black));
      g.add(mesh(new THREE.CylinderGeometry(0.025, 0.026, 0.055, 10), black, m => m.position.y = 0.03));
      g.add(mesh(new THREE.CylinderGeometry(0.0262, 0.0262, 0.01, 10), band, m => m.position.y = 0.01));
      g.rotation.z = 0.18;                       // at a jaunty angle
    } else if (id === 'head-party') {
      const cone = mesh(new THREE.ConeGeometry(0.024, 0.07, 7), std(0x7a5cff), m => m.position.y = 0.035);
      g.add(cone);
      g.add(mesh(new THREE.IcosahedronGeometry(0.01, 0), std(0xffe066, { emissive: 0x554400 }), m => m.position.y = 0.073));
      g.rotation.z = -0.25;
    } else if (id === 'head-crown') {
      const gold = std(0xf2c14e, { metalness: 0.9, roughness: 0.25, emissive: 0x3a2a00 });
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.028, 0.018, 10, 1, true), gold, m => { m.position.y = 0.009; m.material.side = THREE.DoubleSide; }));
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        g.add(mesh(new THREE.ConeGeometry(0.008, 0.024, 4), gold, m => m.position.set(Math.cos(a) * 0.029, 0.028, Math.sin(a) * 0.029)));
        g.add(mesh(new THREE.IcosahedronGeometry(0.0055, 0), std([0xe0245e, 0x2fb5ff, 0x45d483, 0xe0245e, 0x2fb5ff][i], { roughness: 0.1, metalness: 0.3 }), m => m.position.set(Math.cos(a) * 0.031, 0.012, Math.sin(a) * 0.031)));
      }
    }
    return g;
  }

  class Wardrobe {
    constructor() {
      this.owned = new Set(ITEMS.filter(i => i.own).map(i => i.id));
      this.worn = { collar: 'collar-red', head: 'head-none', coat: 'coat-fawn', trail: 'trail-none', voice: 'voice-bark' };
      try {
        const s = JSON.parse(localStorage.getItem('runner-wardrobe') || '{}');
        for (const id of s.owned || []) if (byId[id]) this.owned.add(id);
        for (const k in s.worn || {}) if (byId[s.worn[k]] && this.owned.has(s.worn[k])) this.worn[k] = s.worn[k];
      } catch (e) {}
      this.dog = null; this.t = 0; this.stepT = 0; this.hue = 0;
    }
    save() { try { localStorage.setItem('runner-wardrobe', JSON.stringify({ owned: [...this.owned], worn: this.worn })); } catch (e) {} }
    has(id) { return this.owned.has(id); }
    buy(id, quests) {
      const it = byId[id];
      if (!it || this.owned.has(id) || !quests.spend(it.cost)) return false;
      this.owned.add(id); this.save();
      return true;
    }
    wear(id) {
      const it = byId[id];
      if (!it || !this.owned.has(id)) return false;
      this.worn[it.slot] = id; this.save();
      if (this.dog) this.apply();
      return true;
    }
    // put it all on the dog (the whippet entity from whippet.js)
    attach(dog, au) { this.dog = dog; this.au = au; this.apply(); }
    apply() {
      const d = this.dog, A = d.anchors;
      // head: one item on the crown (glasses on the face)
      if (this.headObj) { this.headObj.parent.remove(this.headObj); this.headObj = null; }
      const h = this.worn.head;
      // a little bigger than life, so it reads from the chase camera (a cartoon dog, a cartoon hat)
      if (h !== 'head-none') { this.headObj = build(h); this.headObj.scale.multiplyScalar(h === 'head-aviators' ? 1.15 : 1.6); (h === 'head-aviators' ? A.face : A.crown).add(this.headObj); }
      // collar: recolour the strap, add the bell / spikes / bandana
      if (this.collarObj) { this.collarObj.parent.remove(this.collarObj); this.collarObj = null; }
      const c = this.worn.collar, strap = A.collar.material;
      strap.emissive = strap.emissive || new THREE.Color(); strap.emissive.setHex(0); strap.metalness = 0; strap.roughness = 0.5;
      A.tag.visible = true; A.collar.visible = true;
      const extra = new THREE.Group();
      if (c === 'collar-red') strap.color.setHex(0x6b2a1e);
      else if (c === 'collar-gold') {
        strap.color.setHex(0xe0b54a); strap.metalness = 0.85; strap.roughness = 0.25; A.tag.visible = false;
        if (R.envTexture) { strap.envMap = R.envTexture; strap.envMapIntensity = 1.4; strap.needsUpdate = true; }
        extra.add(mesh(new THREE.IcosahedronGeometry(0.016, 1), std(0xf2c94c, { metalness: 0.9, roughness: 0.2 }), m => m.position.set(0, -0.074, -0.022)));
      } else if (c === 'collar-led') { strap.color.setHex(0x222222); A.tag.visible = false; }
      else if (c === 'collar-punk') {
        strap.color.setHex(0x1b1b1f); A.tag.visible = false;
        const spike = std(0xcfd3da, { metalness: 0.9, roughness: 0.25 });
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * Math.PI * 2;
          extra.add(mesh(new THREE.ConeGeometry(0.007, 0.026, 4), spike, m => { m.position.set(Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0); m.rotation.z = a - Math.PI / 2; }));
        }
      } else if (c === 'collar-bandana') {
        A.collar.visible = false; A.tag.visible = false;
        const cloth = std(0xc0392b, { side: THREE.DoubleSide, roughness: 0.8 });
        const tri = new THREE.BufferGeometry();
        tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.062, -0.05, 0.006, 0.062, -0.05, 0.006, 0, -0.1, BAND_Z], 3));
        tri.computeVertexNormals();
        extra.add(mesh(tri, cloth));
        extra.add(mesh(new THREE.TorusGeometry(0.058, 0.011, 4, 12), cloth));
      }
      if (extra.children.length) { A.collar.parent.add(extra); extra.position.copy(A.collar.position); extra.rotation.copy(A.collar.rotation); extra.scale.copy(A.collar.scale); this.collarObj = extra; }
      // coat
      const it = byId[this.worn.coat];
      d.setCoat(it.coat || null);
    }
    // the voice for the bark
    bark() {
      const v = this.worn.voice, au = this.au;
      if (!au) return;
      if (v === 'voice-quack') au.quack(); else if (v === 'voice-meow') au.dogMeow(); else if (v === 'voice-squeak') au.squeak(); else au.bark();
    }
    // every frame: the propeller, the LED, the bell, the trail
    update(dt, player, fx, night) {
      if (!this.dog) return;
      this.t += dt;
      const v = player.vel || 0;
      if (this.headObj) { const sp = this.headObj.getObjectByName('spin'); if (sp) sp.rotation.y += dt * (4 + v * 3.2); }
      if (this.worn.collar === 'collar-led') {
        this.hue = (this.hue + dt * 0.35) % 1;
        const m = this.dog.anchors.collar.material;
        m.emissive.setHSL(this.hue, 1, 0.5); m.emissiveIntensity = night ? 2.2 : 0.9;
      }
      // footsteps: the bell jingles; the trail: a steady stream while the dog moves (more when fast)
      if (!player.air && v > 1.5) {
        this.stepT -= dt;
        if (this.stepT <= 0) {
          this.stepT = Math.max(0.12, 0.36 - v * 0.016);
          if (this.worn.collar === 'collar-gold' && this.au && this.au.jingle) this.au.jingle(Math.min(1, v / 10));
        }
      }
      if (v > 1.5) {
        this.trailT = (this.trailT || 0) - dt;
        if (this.trailT <= 0) { this.trailT = byId[this.worn.trail].fx && byId[this.worn.trail].fx.ground ? Math.max(0.1, 0.3 - v * 0.013) : Math.max(0.03, 0.08 - v * 0.003); this.mark(player, fx, player.air); }
      }
    }
    mark(p, fx, air) {
      const it = byId[this.worn.trail];
      if (!it || !it.fx) return;
      const f = it.fx, back = 0.5, x = p.x + Math.sin(p.heading) * back, z = p.z + Math.cos(p.heading) * back;
      const side = (Math.random() < 0.5 ? -1 : 1) * 0.12, sx = Math.cos(p.heading) * side, sz = -Math.sin(p.heading) * side;
      const y = (air ? p.y + 0.5 : (p.ground || 0) + 0.06);
      if (f.rainbow) {
        this.hue = (this.hue + 0.09) % 1;
        const c = new THREE.Color().setHSL(this.hue, 0.9, 0.6).getHex();
        fx.emit(x, y + (air ? 0 : 0.35), z, { color: c, count: 1, speed: 0.05, up: 0.02, spread: 0.05, size: 0.55, grow: 1.15, opacity: 0.9, life: 1.2 });
        return;
      }
      if (f.fire) fx.emit(x + sx, y + 0.3, z + sz, { color: 0xff6a10, count: 1, speed: 0.4, up: 1.2, size: 0.55, grow: 0.5, opacity: 0.8, life: 0.55 });   // the glow under the flames
      if (f.ground && !air) fx.emit(x + sx, y, z + sz, { map: R.shapeTexture(f.map), color: f.color, count: 1, speed: 0, up: 0, spread: 0, size: 0.34, grow: 1, opacity: 0.95, life: 2.4 });
      else fx.emit(x + sx, y + (f.float ? 0.4 : 0.3), z + sz, { map: R.shapeTexture(f.map), color: f.color, count: 1, speed: f.float ? 0.4 : 0.5, up: f.float ? 0.7 : f.fire ? 1.4 : 0.6, size: f.float ? 0.36 : f.fire ? 0.42 : 0.32, grow: f.fire ? 0.35 : 1.4, opacity: 0.95, life: f.float ? 1.6 : 0.9 });
    }
  }
  Wardrobe.ITEMS = ITEMS; Wardrobe.setBandZ = z => { BAND_Z = z; }; Wardrobe.SLOTS = SLOTS; Wardrobe.byId = byId;
  R.Wardrobe = Wardrobe;
})(window.R = window.R || {});
