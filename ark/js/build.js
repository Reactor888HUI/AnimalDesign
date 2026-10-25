(function (A) {
  // ===================================================================================================
  //  THE ARK, BUILT FROM PRIMITIVES: the main room (panoramic glass, desk, shelf-door, the Reactor with
  //  its conveyor), the library hall (books on the left wall, artifacts on the right), the landscapes.
  //  Axes: x east, z south, y up. The main room is x -7..7, z -5..5; the hall is x 7.4..29, z -6.5..6.5.
  //  The glass is the north (z = -5) and west (x = -7) walls of the main room.
  // ===================================================================================================
  const T = THREE, TX = A.tex, R = A.rng;
  const M = (c, r, m, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: r === undefined ? 0.8 : r, metalness: m || 0 }, o || {}));

  A.build = function (scene) {
    const B = { colliders: [], targets: [], bookSets: [], artMeshes: [], updaters: [], lights: {} };
    const shadowed = o => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };
    const mesh = (parent, geo, mat, x, y, z, o) => { const m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); if (o) { if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz; if (o.name) m.name = o.name; } parent.add(m); return m; };
    const box = (p, w, h, d, mat, x, y, z, o) => mesh(p, new T.BoxGeometry(w, h, d), mat, x, y, z, o);
    const cyl = (p, rt, rb, h, mat, x, y, z, seg, o) => mesh(p, new T.CylinderGeometry(rt, rb, h, seg || 20), mat, x, y, z, o);
    const solid = (x0, x1, z0, z1, tag) => { const c = { x0, x1, z0, z1, tag }; B.colliders.push(c); return c; };

    // ---- materials ---------------------------------------------------------------------------------------
    const wood = M(0xffffff, 0.7, 0, { map: TX.wood([5, 3.5]) }), woodFloorMat = M(0xffffff, 0.55, 0, { map: TX.wood([7, 5]) });
    const darkWood = M(0x4a2e1a, 0.6), brass = M(0xc9a24a, 0.28, 0.85), steel = M(0x3a3f48, 0.4, 0.8), enamel = M(0x1f2229, 0.5, 0.3);
    const plaster = M(0xffffff, 0.95, 0, { map: TX.plaster([4, 2]) }), plasterWarm = M(0xffffff, 0.95, 0, { map: TX.plaster([4, 2], '#d8cdb8') });
    const cream = M(0xece4d0, 0.9), velvetRed = M(0x6a1424, 1), velvetGreen = M(0x143a2c, 1), velvetBlue = M(0x142a4a, 1), velvetDark = M(0x16212c, 1);
    const glassMat = new T.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.07, side: T.DoubleSide, depthWrite: false });
    const caseMat = new T.MeshStandardMaterial({ color: 0xdff0ff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.14, side: T.DoubleSide, depthWrite: false });
    const emis = (c, k) => new T.MeshBasicMaterial({ color: c, toneMapped: false });

    // ======================================================== MAIN ROOM =====================================
    const room = new T.Group(); scene.add(room);
    const RH = 3.8;
    const floorA = mesh(room, new T.PlaneGeometry(14, 10), woodFloorMat, 0, 0, 0, { rx: -Math.PI / 2 }); floorA.receiveShadow = true;
    mesh(room, new T.PlaneGeometry(14, 10), M(0xf2ecdf, 1), 0, RH, 0, { rx: Math.PI / 2 });
    for (const i of [-2, -1, 1, 2]) box(room, 0.3, 0.22, 10, plasterWarm, i * 3, RH - 0.11, 0);                       // beams
    for (const x of [-3, 3]) box(room, 1.6, 0.03, 0.34, emis(0xfff0d0), x, RH - 0.23, 0);
    // south and east walls
    box(room, 14.6, RH, 0.3, plaster, 0, RH / 2, 5.15).receiveShadow = true;
    const east = x => { const w = box(room, 0.4, 4.6, 3.7, plaster, 7.0, 2.3, x); w.receiveShadow = true; w.castShadow = true; return w; };
    east(-3.15); east(3.15); box(room, 0.4, 1.9, 2.6, plaster, 7.0, 3.65, 0);
    box(room, 0.06, 2.7, 0.08, brass, 6.78, 1.35, 1.34); box(room, 0.06, 2.7, 0.08, brass, 6.78, 1.35, -1.34);   // door frame
    // glass: north and west walls
    function glassWall(axis, fixed, a, b) {
      const len = b - a, n = Math.round(len / 2.3), c = (a + b) / 2;
      const along = (l, h, d, mat, off, y) => axis === 'x' ? box(room, l, h, d, mat, off, y, fixed) : box(room, d, h, l, mat, fixed, y, off);
      along(len, 0.18, 0.2, steel, c, RH - 0.09).castShadow = true; along(len, 0.1, 0.16, steel, c, 0.05);
      for (let i = 0; i <= n; i++) { const o = a + (len / n) * i; along(0.09, RH, 0.13, steel, o, RH / 2).castShadow = true; }
      const pane = mesh(room, new T.PlaneGeometry(len, RH), glassMat, axis === 'x' ? c : fixed, RH / 2, axis === 'x' ? fixed : c, axis === 'x' ? {} : { ry: Math.PI / 2 });
      pane.renderOrder = 5;
    }
    glassWall('x', -5, -7, 7); glassWall('z', -7, -5, 5);

    // ---- the monitor: the west glass behind the desk (two panes wide) turns into a neon screen ------------------------
    // the messages and the tasks of the project are written on it in a large, plain monospace font
    const MW = 4.8, MH = 1.75, CW = 1536, CH = 560;
    const mon = B.monitor = { want: 1, k: 0, flash: 0, canvas: TX.canvas(CW, CH) };
    mon.ctx = mon.canvas.getContext('2d'); mon.tex = TX.tex(mon.canvas); mon.tex.anisotropy = 8;
    const MG = new T.Group(); MG.position.set(-6.93, 2.2, 0); MG.rotation.y = Math.PI / 2; room.add(MG);
    mon.screen = mesh(MG, new T.PlaneGeometry(MW, MH), new T.MeshBasicMaterial({ map: mon.tex, transparent: true, opacity: 0, toneMapped: false }), 0, 0, 0); mon.screen.renderOrder = 8;
    mon.mats = [];
    const frame = (w, h, x, y, c, op) => { const m = new T.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: 0, blending: op < 1 ? T.AdditiveBlending : T.NormalBlending, depthWrite: false }); const b = box(MG, w, h, 0.03, m, x, y, 0.005); b.renderOrder = 9; mon.mats.push({ m, op }); };
    for (const [c, th, op] of [[0x35e6ff, 0.04, 1], [0x35e6ff, 0.18, 0.16]]) { frame(MW + 0.06 + th, th, 0, MH / 2 + th / 2, c, op); frame(MW + 0.06 + th, th, 0, -MH / 2 - th / 2, c, op); }
    for (const [c, th, op] of [[0xff3df0, 0.04, 1], [0xff3df0, 0.18, 0.16]]) { frame(th, MH + 0.06 + th, -MW / 2 - th / 2 - 0.03, 0, c, op); frame(th, MH + 0.06 + th, MW / 2 + th / 2 + 0.03, 0, c, op); }
    mon.light = new T.PointLight(0x40e0ff, 0, 7, 2); mon.light.position.set(-5.4, 2.3, 0); scene.add(mon.light);
    const MONO = '"DejaVu Sans Mono", Consolas, Menlo, "Liberation Mono", monospace';
    const neonText = (g, txt, x, y, c, size, glow) => { g.font = '700 ' + size + 'px ' + MONO; g.shadowColor = c; g.shadowBlur = glow === undefined ? 14 : glow; g.fillStyle = c; g.fillText(txt, x, y); g.shadowBlur = 0; };
    const clip = (g, txt, w) => { if (g.measureText(txt).width <= w) return txt; while (txt.length > 1 && g.measureText(txt + '…').width > w) txt = txt.slice(0, -1); return txt + '…'; };
    const hhmm = ts => { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    // d: { tasks: [{ text, done }], msgs: [{ ts, text, kind }], version, pending, hint }
    mon.draw = function (d) {
      const g = mon.ctx, KC = { ok: '#7dffb0', warn: '#ffd36a', bad: '#ff8686', info: '#d6f2ff' };
      g.clearRect(0, 0, CW, CH); g.fillStyle = '#04060d'; g.fillRect(0, 0, CW, CH);
      g.fillStyle = 'rgba(80,200,255,.05)'; for (let y = 0; y < CH; y += 4) g.fillRect(0, y, CW, 1);
      g.textBaseline = 'alphabetic'; g.textAlign = 'left';
      neonText(g, 'КОВЧЕГ · ПРОЕКТ', 28, 52, '#35e6ff', 42); g.textAlign = 'right'; neonText(g, hhmm(Date.now()), CW - 28, 52, '#ff3df0', 42); g.textAlign = 'left';
      g.fillStyle = '#35e6ff'; g.fillRect(28, 70, CW - 56, 3);
      const open = d.tasks.filter(t => !t.done), done = d.tasks.filter(t => t.done), list = open.concat(done);
      neonText(g, 'ЗАДАЧИ ' + open.length + (done.length ? ' · готово ' + done.length : ''), 28, 118, '#ff3df0', 30, 10);
      g.font = '700 33px ' + MONO;
      if (!list.length) neonText(g, 'пока пусто', 28, 176, '#7f90a8', 33, 0);
      list.slice(0, 7).forEach((t, i) => { const y = 174 + i * 51; neonText(g, t.done ? '▣' : '▢', 28, y, t.done ? '#7dffb0' : '#ff3df0', 33, 8); g.font = '700 33px ' + MONO; g.fillStyle = t.done ? '#7dffb0' : '#ffffff'; g.globalAlpha = t.done ? 0.7 : 1; g.fillText(clip(g, t.text, 650), 76, y); g.globalAlpha = 1; });
      g.fillStyle = '#35e6ff'; g.fillRect(760, 92, 3, 390);
      neonText(g, 'СООБЩЕНИЯ', 796, 118, '#35e6ff', 30, 10);
      d.msgs.slice(0, 7).forEach((m, i) => { const y = 174 + i * 51, c = KC[m.kind] || KC.info; g.font = '700 25px ' + MONO; g.fillStyle = '#8aa0bd'; g.fillText(hhmm(m.ts), 796, y); g.font = '700 31px ' + MONO; g.fillStyle = c; g.shadowColor = c; g.shadowBlur = i === 0 ? 9 : 0; g.fillText(clip(g, m.text, 600), 892, y); g.shadowBlur = 0; });
      g.fillStyle = '#0b1830'; g.fillRect(0, CH - 66, CW, 66); g.fillStyle = '#35e6ff'; g.fillRect(0, CH - 66, CW, 3);
      g.font = '700 28px ' + MONO; g.fillStyle = '#a6eaff'; g.fillText(clip(g, d.hint || 'E у экрана: добавить задачу', 900), 28, CH - 24);
      g.textAlign = 'right'; g.fillStyle = '#ff9af5'; g.fillText('реактор v' + (d.version || '1.0') + (d.pending ? ' · ждут решения: ' + d.pending : ''), CW - 28, CH - 24); g.textAlign = 'left';
      mon.tex.needsUpdate = true; mon.flash = 1;
    };
    mon.draw({ tasks: [], msgs: [{ ts: Date.now(), text: 'Монитор включается…', kind: 'info' }] });

        // the terrace outside
    const deck = M(0xffffff, 0.8, 0, { map: TX.wood([5, 3]) });
    mesh(room, new T.PlaneGeometry(21, 8), deck, -3.5, -0.02, -9, { rx: -Math.PI / 2 }).receiveShadow = true;
    mesh(room, new T.PlaneGeometry(8, 10), deck, -11, -0.02, 0, { rx: -Math.PI / 2 }).receiveShadow = true;
    for (const [x, z] of [[-9, -8], [3, -8.6], [-11.5, 4]]) { cyl(room, 0.3, 0.24, 0.5, M(0x8a5a3a, 0.9), x, 0.25, z); mesh(room, new T.IcosahedronGeometry(0.5, 1), M(0x3f7a3f, 0.9, 0, { flatShading: true }), x, 0.9, z); }
    for (const x of [-2, 1.2]) { box(room, 0.7, 0.08, 1.7, M(0xe8e0d0, 0.9), x - 1, 0.32, -7.4, { ry: 0.2 }); box(room, 0.7, 0.4, 0.08, M(0xe8e0d0, 0.9), x - 1.2, 0.5, -6.6, { ry: 0.2 }); }

    // a rug under the reactor, plants, the poster on the south wall
    mesh(room, new T.PlaneGeometry(7.2, 7.2), M(0xffffff, 1, 0, { map: TX.rug('#5a1f2a', '#d9b45a') }), 0, 0.012, 0.5, { rx: -Math.PI / 2 }).receiveShadow = true;
    for (const [x, z] of [[-6.3, 4.2], [6.15, -4.3], [-6.3, 2.3]]) { cyl(room, 0.28, 0.22, 0.42, M(0xb87040, 0.9), x, 0.21, z); mesh(room, new T.IcosahedronGeometry(0.42, 1), M(0x3a8040, 0.9, 0, { flatShading: true }), x, 0.82, z).castShadow = true; solid(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 'plant'); }
    box(room, 1.8, 2.4, 0.04, M(0xffffff, 0.6, 0, { map: TX.poster() }), 3.6, 1.9, 4.97, { ry: Math.PI }); box(room, 1.9, 2.5, 0.05, brass, 3.6, 1.9, 4.95);

    // ---- the desk (the Human Gate): by the west glass ---------------------------------------------------
    const desk = new T.Group(); desk.position.set(-5.7, 0, -1.6); room.add(desk);
    box(desk, 0.85, 0.06, 1.7, wood, 0, 0.76, 0);
    for (const [x, z] of [[-0.38, -0.78], [0.38, -0.78], [-0.38, 0.78], [0.38, 0.78]]) box(desk, 0.06, 0.74, 0.06, darkWood, x, 0.37, z);
    box(desk, 0.8, 0.2, 0.04, darkWood, 0, 0.62, 0.8);
    const lap = new T.Group(); lap.position.set(0.05, 0.79, -0.2); lap.rotation.y = Math.PI / 2; desk.add(lap);
    box(lap, 0.34, 0.02, 0.24, steel, 0, 0, 0); const scr = box(lap, 0.34, 0.22, 0.015, enamel, 0, 0.12, -0.11, { rx: -0.25 });
    B.deskScreen = mesh(lap, new T.PlaneGeometry(0.3, 0.18), new T.MeshBasicMaterial({ map: TX.plate('ЧЕЛОВЕЧЕСКИЙ\nГЕЙТ', { w: 256, h: 160, bg: '#10243a', fg: '#7fe0b0', font: 'Arial, sans-serif', size: 30 }), toneMapped: false }), 0, 0.12, -0.1, { rx: -0.25 });
    // (a lamp from primitives; when the one built in Blender has loaded, world.js hides these three)
    B.deskLampOld = [cyl(desk, 0.05, 0.07, 0.03, brass, 0.3, 0.8, 0.6), cyl(desk, 0.01, 0.01, 0.3, brass, 0.3, 0.95, 0.6), cyl(desk, 0.02, 0.12, 0.12, M(0x1e6a46, 0.4, 0.2), 0.28, 1.15, 0.6, 16)];
    for (let i = 0; i < 4; i++) box(desk, 0.22 - i * 0.01, 0.035, 0.16, M(R(i + 3)() * 0xffffff | 0x404040, 0.8), -0.2, 0.815 + i * 0.036, 0.55, { ry: i * 0.3 });
    cyl(desk, 0.04, 0.035, 0.09, M(0xe8e0d0, 0.5), -0.25, 0.83, -0.5, 14);
    const chair = new T.Group(); chair.position.set(-4.7, 0, -1.6); room.add(chair);
    box(chair, 0.5, 0.07, 0.5, M(0x6a2a2a, 0.7), 0, 0.5, 0); box(chair, 0.06, 0.55, 0.5, M(0x6a2a2a, 0.7), 0.24, 0.8, 0); cyl(chair, 0.03, 0.03, 0.46, steel, 0, 0.25, 0, 8);
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; box(chair, 0.3, 0.03, 0.04, steel, Math.cos(a) * 0.15, 0.03, Math.sin(a) * 0.15, { ry: -a }); }
    shadowed(desk); shadowed(chair);
    solid(-6.15, -5.25, -2.5, -0.7, 'desk'); solid(-5.1, -4.4, -1.95, -1.25, 'chair');
    B.targets.push({ id: 'desk', x: -5.0, z: -1.6, r: 2.3, text: 'Стол · Человеческий гейт', key: 'desk' });

    // ---- the shelf-door on the east wall ---------------------------------------------------------------
    const doorShelf = new T.Group(); doorShelf.position.set(6.2, 0, 0); room.add(doorShelf);
    const shelfFrame = (parent, len, h, levels, depth, axis) => {      // a bookcase frame along z (axis 'z') or x
      const L = (l, hh, d, y, o) => axis === 'z' ? box(parent, d, hh, l, darkWood, 0, y, o) : box(parent, l, hh, d, darkWood, o, y, 0);
      for (let k = 0; k <= levels; k++) L(len, 0.04, depth, 0.1 + k * (h - 0.2) / levels, 0);
      return L;
    };
    box(doorShelf, 0.04, 3.1, 3.2, darkWood, 0.2, 1.55, 0);
    for (const s of [-1, 1]) box(doorShelf, 0.42, 3.1, 0.05, darkWood, 0, 1.55, s * 1.6);
    for (let k = 0; k <= 5; k++) box(doorShelf, 0.42, 0.04, 3.2, darkWood, 0, 0.1 + k * 0.58, 0);
    box(doorShelf, 0.44, 0.1, 3.3, brass, 0, 3.14, 0);
    shadowed(doorShelf);
    // the same on both sides of the door, fixed to the wall
    for (const s of [-1, 1]) {
      const g = new T.Group(); g.position.set(6.78, 0, s * 3.25); room.add(g);
      box(g, 0.04, 3.1, 3.0, darkWood, 0.2, 1.55, 0); for (const e of [-1, 1]) box(g, 0.42, 3.1, 0.05, darkWood, 0, 1.55, e * 1.5);
      for (let k = 0; k <= 5; k++) box(g, 0.42, 0.04, 3.0, darkWood, 0, 0.1 + k * 0.58, 0);
      B['wallShelf' + (s > 0 ? 'S' : 'N')] = g; shadowed(g);
    }
    solid(6.55, 7.0, 1.7, 5, 'shelfS'); solid(6.55, 7.0, -5, -1.7, 'shelfN');
    B.door = { group: doorShelf, open: 0, want: 0, block: solid(5.95, 6.5, -1.7, 1.7, 'door') };

    // ---- my library: a bookcase on the south wall --------------------------------------------------------
    const mine = new T.Group(); room.add(mine);
    box(mine, 4.2, 3.0, 0.04, darkWood, -4.6, 1.5, 4.96);
    for (let k = 0; k <= 5; k++) box(mine, 4.2, 0.04, 0.5, darkWood, -4.6, 0.1 + k * 0.58, 4.72);
    for (const x of [-6.7, -2.5]) box(mine, 0.05, 3.0, 0.5, darkWood, x, 1.5, 4.72);
    box(mine, 4.3, 0.1, 0.56, brass, -4.6, 3.05, 4.72);
    B.mineSign = mesh(mine, new T.PlaneGeometry(1.6, 0.26), new T.MeshBasicMaterial({ map: TX.plate('МОЯ БИБЛИОТЕКА', { w: 512, h: 84 }), toneMapped: false }), -4.6, 3.3, 4.7, { ry: Math.PI });
    shadowed(mine);
    solid(-6.75, -2.45, 4.4, 5.1, 'mine');
    B.targets.push({ id: 'mine', x: -4.6, z: 3.3, r: 3.2, text: 'Моя библиотека', key: 'mine', passive: true });

    // ======================================================== THE REACTOR ===================================
    const rx = 0, rz = -0.6;
    const rg = new T.Group(); rg.position.set(rx, 0, rz); room.add(rg);
    cyl(rg, 1.15, 1.25, 0.3, steel, 0, 0.15, 0, 40); cyl(rg, 1.0, 1.05, 0.1, brass, 0, 0.35, 0, 40);
    const tubeMat = new T.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, side: T.DoubleSide, depthWrite: false });
    const tube = cyl(rg, 0.78, 0.78, 2.5, tubeMat, 0, 1.65, 0, 40, {}); tube.renderOrder = 6;
    cyl(rg, 0.9, 0.9, 0.18, steel, 0, 2.99, 0, 40); cyl(rg, 0.82, 0.82, 0.08, brass, 0, 3.1, 0, 40);
    const hopper = mesh(rg, new T.CylinderGeometry(0.95, 0.32, 0.5, 32, 1, true), M(0x59616e, 0.35, 0.85, { side: T.DoubleSide }), 0, 3.4, 0);
    mesh(rg, new T.TorusGeometry(0.95, 0.03, 8, 40), brass, 0, 3.65, 0, { rx: Math.PI / 2 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; cyl(rg, 0.035, 0.035, 2.5, brass, Math.cos(a) * 0.8, 1.65, Math.sin(a) * 0.8, 8); }
    const coreMat = new T.MeshBasicMaterial({ color: 0x6fd3ff, toneMapped: false }), core = mesh(rg, new T.IcosahedronGeometry(0.3, 1), coreMat, 0, 1.65, 0);
    const wireMat = new T.MeshBasicMaterial({ color: 0x6fd3ff, wireframe: true, transparent: true, opacity: 0.5, toneMapped: false }), wire = mesh(rg, new T.IcosahedronGeometry(0.46, 1), wireMat, 0, 1.65, 0);
    const ringMat = new T.MeshBasicMaterial({ color: 0x6fd3ff, toneMapped: false }), rings = [];
    [[0.56, 0], [0.5, Math.PI / 2.4], [0.63, -Math.PI / 3]].forEach(([r, t], i) => { const g = new T.Group(); g.position.set(0, 1.65, 0); g.rotation.x = t; rg.add(g); const m = mesh(g, new T.TorusGeometry(r, 0.014, 6, 64), ringMat); rings.push({ g, m, s: 1 + i * 0.6 }); });
    const rlight = new T.PointLight(0x6fd3ff, 1.2, 8, 2); rlight.position.set(0, 1.65, 0); rg.add(rlight); B.lights.reactor = rlight;
    const lampMats = [], lamps = [];
    for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.2 + i / 9 * Math.PI * 1.7, m = new T.MeshBasicMaterial({ color: 0x2a3340, toneMapped: false }); lampMats.push(m); lamps.push(mesh(rg, new T.SphereGeometry(0.05, 12, 8), m, Math.cos(a) * 1.08, 0.5, Math.sin(a) * 1.08)); }
    const N = 260, pg = new T.BufferGeometry(), pp = new Float32Array(N * 3), pd = [];
    const pr = R(7); for (let i = 0; i < N; i++) pd.push({ a: pr() * 6.283, r: 0.1 + pr() * 0.6, y: 0.5 + pr() * 2.2, v: 0.4 + pr() * 1.2 });
    pg.setAttribute('position', new T.BufferAttribute(pp, 3));
    const pmat = new T.PointsMaterial({ color: 0x6fd3ff, size: 0.05, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
    const pts = new T.Points(pg, pmat); pts.frustumCulled = false; pts.position.y = 0; rg.add(pts);
    shadowed(rg); tube.castShadow = false; core.castShadow = false;
    solid(-1.3, 1.3, -1.9, 0.7, 'reactor');
    B.targets.push({ id: 'reactor', x: rx, z: rz, r: 3.0, text: 'Знаниевый Реактор', key: 'reactor' });

    // the conveyor from the reactor to the output table
    const cv = new T.Group(); room.add(cv);
    const beltTex = TX.belt(), beltMat = M(0xffffff, 0.7, 0.2, { map: beltTex });
    box(cv, 0.8, 0.1, 3.1, steel, 0, 0.62, 2.4); const belt = box(cv, 0.66, 0.02, 3.0, beltMat, 0, 0.685, 2.4);
    for (const x of [-0.37, 0.37]) { box(cv, 0.04, 0.14, 3.1, brass, x, 0.72, 2.4); for (const z of [1.0, 3.8]) box(cv, 0.05, 0.62, 0.05, steel, x, 0.31, z); }
    cyl(cv, 0.35, 0.4, 0.2, steel, 0, 0.58, 0.85, 12).rotation.x = Math.PI / 2; // the outlet pipe
    shadowed(cv);
    // the output table
    const tbl = new T.Group(); tbl.position.set(0, 0, 4.45); room.add(tbl);
    box(tbl, 1.3, 0.06, 0.8, wood, 0, 0.72, 0); for (const [x, z] of [[-0.58, -0.34], [0.58, -0.34], [-0.58, 0.34], [0.58, 0.34]]) box(tbl, 0.06, 0.7, 0.06, darkWood, x, 0.35, z); shadowed(tbl);
    const card = new T.Mesh(new T.PlaneGeometry(0.46, 0.64), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, toneMapped: false })); card.position.set(0, 0.8, 4.42); card.rotation.set(-1.2, Math.PI, 0); card.renderOrder = 7; room.add(card);
    solid(-0.5, 0.5, 0.9, 3.95, 'conveyor'); solid(-0.7, 0.7, 4.05, 4.95, 'table');
    B.targets.push({ id: 'output', x: 0, z: 3.9, r: 1.7, text: 'Результат реактора', key: 'output' });

    const stations = []; let stationRoot = new T.Group(); cv.add(stationRoot);
    const pack = new T.Group(); pack.visible = false; cv.add(pack);
    box(pack, 0.34, 0.14, 0.26, cream, 0, 0.1, 0); box(pack, 0.05, 0.145, 0.27, M(0xc03030, 0.6), 0, 0.1, 0); box(pack, 0.35, 0.145, 0.05, M(0xc03030, 0.6), 0, 0.1, 0);
    const Rx = B.reactor = {
      group: rg, stage: -1, lit: 0, pulse: 0, color: new T.Color(0x6fd3ff), target: new T.Color(0x6fd3ff), speed: 1, tspeed: 1, tokens: [], beltRun: 0, card, pack, stations,
      hopper: new T.Vector3(rx, 3.55, rz),
      setStage(i, hex, speed) { this.stage = i; if (hex !== undefined) this.target.setHex(hex); this.tspeed = speed || 1; },
      setLamps(n) { this.lit = n; },
      kick(v) { this.pulse = Math.max(this.pulse, v === undefined ? 1 : v); },
      // books flying into the hopper: each token has a colour; done() when the last one is in
      feed(colors, from, done) {
        colors.forEach((c, i) => {
          const m = new T.Mesh(new T.BoxGeometry(0.06, 0.2, 0.15), new T.MeshBasicMaterial({ color: c, toneMapped: false }));
          m.userData = { t: -i * 0.16, from: from.clone(), last: i === colors.length - 1, done }; m.visible = false; scene.add(m); this.tokens.push(m);
        });
        if (!colors.length && done) done();
      },
      clearStations() { while (stationRoot.children.length) { const c = stationRoot.children.pop(); c.traverse(o => { if (o.material && o.material.map) o.material.map.dispose(); }); } stations.length = 0; pack.visible = false; this.beltRun = 0; },
      setStations(names) {
        this.clearStations();
        names.forEach((nm, i) => {
          const z = 1.5 + (names.length > 1 ? i * (2.2 / (names.length - 1)) : 1), g = new T.Group(); g.position.z = z; stationRoot.add(g);
          for (const x of [-0.46, 0.46]) box(g, 0.07, 0.55, 0.1, steel, x, 1.0, 0);
          const top = box(g, 1.0, 0.09, 0.14, M(0x303640, 0.5, 0.5), 0, 1.3, 0), lm = emis(0x44525f), lamp = box(g, 0.6, 0.03, 0.04, lm, 0, 1.24, 0.08);
          const spr = new T.Sprite(new T.SpriteMaterial({ map: TX.plate((i + 1) + '. ' + nm, { w: 512, h: 96, bg: '#1b2430', fg: '#9fe8ff', font: 'Arial, sans-serif' }), toneMapped: false })); spr.scale.set(0.95, 0.18, 1); spr.position.set(0, 1.5, 0); g.add(spr);
          stations.push({ z, g, lm, glow: 0 });
        });
      },
      lightStation(i, v) { if (stations[i]) stations[i].glow = v === undefined ? 1 : v; },
      put(t) { pack.visible = true; pack.position.set(0, 0.7, 1.0 + t * 2.8); },
      printCard(title, lines) {
        const c = TX.canvas(512, 704), g = c.getContext('2d');
        g.fillStyle = '#f6f0e0'; g.fillRect(0, 0, 512, 704); g.strokeStyle = '#b8913c'; g.lineWidth = 8; g.strokeRect(8, 8, 496, 688);
        g.fillStyle = '#1d2a3a'; g.font = '700 30px Georgia, serif'; g.textAlign = 'center';
        const wrap = (txt, x, y, w, lh, font) => { g.font = font; const words = txt.split(' '); let line = ''; for (const wd of words) { const t = line + wd + ' '; if (g.measureText(t).width > w && line) { g.fillText(line, x, y); line = wd + ' '; y += lh; } else line = t; } g.fillText(line, x, y); return y + lh; };
        let y = wrap(title, 256, 60, 440, 36, '700 30px Georgia, serif'); g.textAlign = 'left'; g.fillStyle = '#33404f';
        for (const l of lines) { if (y > 660) break; y = wrap(l, 36, y + 6, 440, 24, '19px Georgia, serif'); }
        if (card.material.map) card.material.map.dispose();
        card.material.map = TX.tex(c); card.material.color.setHex(0xffffff); card.material.needsUpdate = true; card.userData.t = 0; card.visible = true;
      },
      clearCard() { card.material.opacity = 0; },
    };

    // ======================================================== THE LIBRARY HALL =============================
    const hall = new T.Group(); scene.add(hall);
    const HX0 = 7.2, HX1 = 29, HZ = 6.5, HH = 4.6;
    mesh(hall, new T.PlaneGeometry(HX1 - HX0, HZ * 2), M(0xffffff, 0.3, 0.05, { map: TX.marble([5.5, 6.5]) }), (HX0 + HX1) / 2, 0, 0, { rx: -Math.PI / 2 }).receiveShadow = true;
    mesh(hall, new T.PlaneGeometry(HX1 - HX0, HZ * 2), M(0xf0e8d6, 1), (HX0 + HX1) / 2, HH, 0, { rx: Math.PI / 2 });
    box(hall, HX1 - HX0, HH, 0.3, plasterWarm, (HX0 + HX1) / 2, HH / 2, HZ + 0.15);           // south wall
    box(hall, HX1 - HX0, HH, 0.3, plasterWarm, (HX0 + HX1) / 2, HH / 2, -HZ - 0.15);          // north wall
    box(hall, 0.3, HH, HZ * 2, plasterWarm, HX1 + 0.15, HH / 2, 0);                            // the end wall
    for (let x = 9; x < HX1; x += 3.6) { box(hall, 0.28, 0.3, HZ * 2, darkWood, x, HH - 0.15, 0); box(hall, 0.3, 0.9, 0.3, darkWood, x, HH - 0.55, HZ - 0.15); box(hall, 0.3, 0.9, 0.3, darkWood, x, HH - 0.55, -HZ + 0.15); }
    for (let x = 10.8; x < HX1; x += 3.6) box(hall, 1.6, 0.03, 0.4, emis(0xfff0cc), x, HH - 0.32, 0);
    // the stained glass window and the name of the Ark on the end wall
    mesh(hall, new T.CircleGeometry(1.7, 48), new T.MeshBasicMaterial({ map: TX.glass(), toneMapped: false }), HX1 - 0.01, 2.8, 0, { ry: -Math.PI / 2 });
    mesh(hall, new T.TorusGeometry(1.75, 0.07, 8, 48), brass, HX1 - 0.03, 2.8, 0, { ry: Math.PI / 2 });
    mesh(hall, new T.PlaneGeometry(4, 0.62), new T.MeshBasicMaterial({ map: TX.plate('БИБЛИОТЕКА «КОВЧЕГ»', { w: 1024, h: 160, size: 80 }), toneMapped: false }), HX1 - 0.02, 0.9, 0, { ry: -Math.PI / 2 });
    // the aisle carpet and the reading tables
    mesh(hall, new T.PlaneGeometry(HX1 - HX0 - 3, 2.6), M(0xffffff, 1, 0, { map: TX.rug('#1f3a5a', '#d9b45a') }), 18, 0.012, 2.2, { rx: -Math.PI / 2 });
    const table = x => {
      const g = new T.Group(); g.position.set(x, 0, -2.5); hall.add(g);
      box(g, 3.2, 0.07, 1.1, wood, 0, 0.76, 0); for (const sx of [-1.45, 1.45]) for (const sz of [-0.45, 0.45]) box(g, 0.08, 0.74, 0.08, darkWood, sx, 0.37, sz);
      for (const lx of [-0.8, 0.8]) { cyl(g, 0.07, 0.09, 0.02, brass, lx, 0.8, 0, 14); cyl(g, 0.012, 0.012, 0.28, brass, lx, 0.95, 0, 8); box(g, 0.34, 0.12, 0.16, M(0x1e7a4a, 0.4, 0.1), lx, 1.12, 0); }
      for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) { const c = new T.Group(); c.position.set(sx * 0.95, 0, sz * 0.8); g.add(c); box(c, 0.44, 0.06, 0.44, M(0x6a2a2a, 0.7), 0, 0.46, 0); box(c, 0.44, 0.5, 0.05, M(0x6a2a2a, 0.7), 0, 0.72, sz * 0.2); for (const [a, b] of [[-0.18, -0.18], [0.18, 0.18], [-0.18, 0.18], [0.18, -0.18]]) box(c, 0.04, 0.44, 0.04, darkWood, a, 0.22, b); }
      for (let i = 0; i < 3; i++) box(g, 0.28, 0.04, 0.2, M(0x30406a + i * 0x2a1010, 0.8), 0.3 + i * 0.5, 0.82 + i * 0.001, 0.1, { ry: 0.2 * i });
      solid(x - 1.7, x + 1.7, -3.2, -1.8, 'table'); return g;
    };
    [13, 19, 25].forEach(table);
    // a rolling ladder against the books
    { const g = new T.Group(); g.position.set(15, 0, -5.55); hall.add(g); for (const x of [-0.25, 0.25]) box(g, 0.05, 3.0, 0.05, darkWood, x, 1.5, 0.15, { rx: -0.12 }); for (let k = 0; k < 9; k++) box(g, 0.5, 0.04, 0.06, darkWood, 0, 0.3 + k * 0.32, 0.15 - k * 0.012); cyl(g, 0.04, 0.04, 0.5, brass, 0, 3.0, -0.0, 8).rotation.z = Math.PI / 2; }

    // ---- the books (left wall): one instanced mesh, every book is a catalogue entry --------------------------
    const spineTex = TX.spine();
    const bookGeo = new T.BoxGeometry(1, 1, 1), bookMat = new T.MeshStandardMaterial({ map: spineTex, roughness: 0.75, metalness: 0 });
    const HUES = [0.0, 0.02, 0.06, 0.1, 0.12, 0.33, 0.38, 0.55, 0.6, 0.66, 0.78, 0.9];
    function bookColor(r, c) { const k = r(); if (k < 0.12) return c.setHSL(0.11, 0.25, 0.72); if (k < 0.2) return c.setHSL(0, 0, 0.18 + r() * 0.1); return c.setHSL(HUES[Math.floor(r() * HUES.length)] + (r() - 0.5) * 0.03, 0.35 + r() * 0.25, 0.22 + r() * 0.2); }
    // a row of book slots along x (ax 'x') or along z (ax 'z'); front = the plane the spines are on; away = +1 / -1 into the shelf
    function row(out, ax, a, b, y, front, away, r) {
      let p = a;
      for (;;) {
        const w = 0.04 + r() * 0.055, h = 0.24 + r() * 0.2, d = 0.17 + r() * 0.1;
        if (p + w > b) break;
        const c = p + w / 2, tilt = r() < 0.03 ? (r() - 0.5) * 0.3 : 0;
        out.push({ ax, c, y: y + h / 2, f: front + away * d / 2, w, h, d, tilt });
        p += w + 0.002 + (r() < 0.03 ? 0.1 : 0);
      }
    }
    function makeBooks(slots, parent, seed, pos) {
      const mesh = new T.InstancedMesh(bookGeo, bookMat, slots.length), r = R(seed), m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), p = new T.Vector3(), col = new T.Color();
      slots.forEach((b, i) => {
        if (b.ax === 'x') { p.set(b.c, b.y, b.f); s.set(b.w, b.h, b.d); e.set(0, 0, b.tilt); } else { p.set(b.f, b.y, b.c); s.set(b.d, b.h, b.w); e.set(b.tilt, 0, 0); }
        if (pos) p.add(pos); q.setFromEuler(e); m.compose(p, q, s); mesh.setMatrixAt(i, m); mesh.setColorAt(i, bookColor(r, col));
        b.m = m.clone();
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
      parent.add(mesh); return mesh;
    }
    // decorative books on the shelf-door and its neighbours
    {
      const dr = R(55);
      const sl = []; for (let k = 0; k < 5; k++) row(sl, 'z', -1.55, 1.55, 0.14 + k * 0.58, -0.17, 1, dr);
      makeBooks(sl, doorShelf, 56);
      for (const s of [-1, 1]) { const sl2 = []; for (let k = 0; k < 5; k++) row(sl2, 'z', -1.45, 1.45, 0.14 + k * 0.58, -0.17, 1, dr); makeBooks(sl2, B['wallShelf' + (s > 0 ? 'S' : 'N')], 57 + s); }
    }
    {
      const mr = R(33), slots = []; for (let k = 0; k < 5; k++) row(slots, 'x', -6.55, -2.65, 0.12 + k * 0.58, 4.5, 1, mr);
      B.mineSlots = slots; B.mineBooks = makeBooks(slots, mine, 34); B.mineBooks.count = 0;
    }
    // the hall: north wall, six levels
    const hallSlots = [], hr = R(88);
    {
      const g = new T.Group(); hall.add(g);
      for (let k = 0; k <= 6; k++) box(g, 19.2, 0.04, 0.58, darkWood, 18, 0.1 + k * 0.58, -HZ + 0.29);
      for (let x = 8.4; x <= 27.7; x += 2.4) box(g, 0.06, 3.9, 0.58, darkWood, x, 1.95, -HZ + 0.29);
      box(g, 19.6, 0.22, 0.74, brass, 18, 3.98, -HZ + 0.34); box(g, 19.2, 3.9, 0.03, M(0x2a1c12, 0.9), 18, 1.95, -HZ + 0.02);
      for (let k = 0; k < 6; k++) row(hallSlots, 'x', 8.6, 27.4, 0.12 + k * 0.58, -HZ + 0.56, -1, hr);
      B.hallBooks = makeBooks(hallSlots, hall, 89); B.hallSlots = hallSlots;
      solid(8.3, 27.8, -6.6, -5.9, 'books');
    }
    // the sign over the books and over the artifacts
    mesh(hall, new T.PlaneGeometry(3.2, 0.5), new T.MeshBasicMaterial({ map: TX.plate('К Н И Г И', { w: 768, h: 120, size: 70 }), toneMapped: false }), 18, 4.3, -HZ + 0.3);
    mesh(hall, new T.PlaneGeometry(3.6, 0.5), new T.MeshBasicMaterial({ map: TX.plate('А Р Т Е Ф А К Т Ы', { w: 768, h: 100, size: 58 }), toneMapped: false }), 18, 4.3, HZ - 0.3, { ry: Math.PI });

    // ---- the artifacts (right wall): six sections, 3 m each -----------------------------------------------
    const SECX = [11, 14, 17, 20, 23, 26], AZ = 5.75, artifacts = [];
    const gem = (kind, scale) => {
      const prof = { diamond: [[0, -0.1], [0.06, -0.01], [0.078, 0.012], [0.052, 0.044], [0, 0.044]], emerald: [[0, -0.07], [0.04, -0.035], [0.056, 0], [0.056, 0.04], [0.04, 0.062], [0, 0.062]], ruby: [[0, -0.09], [0.055, -0.01], [0.07, 0.02], [0.04, 0.05], [0, 0.05]] }[kind];
      const seg = kind === 'diamond' ? 8 : kind === 'emerald' ? 8 : 6;
      const m = new T.Mesh(new T.LatheGeometry(prof.map(p => new T.Vector2(p[0], p[1])), seg), new T.MeshStandardMaterial({ color: { diamond: 0xbfe6ff, emerald: 0x05803a, ruby: 0x9a0626 }[kind], emissive: { diamond: 0x10202e, emerald: 0x02330f, ruby: 0x4a0010 }[kind], roughness: 0.08, metalness: kind === 'diamond' ? 0.1 : 0.15, flatShading: true, envMapIntensity: 0.9, toneMapped: false }));
      m.scale.setScalar(scale || 1); return m;
    };
    const makeArt = {
      globe() {
        const g = new T.Group();
        cyl(g, 0.17, 0.2, 0.05, brass, 0, 0.025, 0, 24); cyl(g, 0.02, 0.03, 0.26, brass, 0, 0.17, 0, 12);
        const tilt = new T.Group(); tilt.position.y = 0.46; tilt.rotation.z = 0.4; g.add(tilt);
        const ball = mesh(tilt, new T.SphereGeometry(0.27, 32, 20), M(0xffffff, 0.45, 0.05, { map: TX.globe() }), 0, 0, 0); ball.userData.spin = 0.25;
        const mer = mesh(tilt, new T.TorusGeometry(0.295, 0.012, 8, 48), brass, 0, 0, 0, { ry: Math.PI / 2 });
        B.updaters.push((dt) => { ball.rotation.y += dt * 0.25; }); g.userData.hit = [ball, mer]; return g;
      },
      microscope() {
        const g = new T.Group(), bm = M(0x1c1f26, 0.35, 0.5);
        box(g, 0.2, 0.03, 0.26, bm, 0, 0.015, 0); cyl(g, 0.022, 0.022, 0.26, brass, 0, 0.15, -0.08, 12);
        box(g, 0.14, 0.012, 0.12, steel, 0, 0.14, 0.02); cyl(g, 0.035, 0.035, 0.012, brass, 0, 0.065, 0.02, 16).rotation.x = 0.5;
        const tb = new T.Group(); tb.position.set(0, 0.3, -0.03); tb.rotation.x = 0.45; g.add(tb);
        cyl(tb, 0.03, 0.036, 0.26, brass, 0, 0, 0, 16); cyl(tb, 0.022, 0.022, 0.1, bm, 0, 0.17, 0, 12); cyl(tb, 0.014, 0.022, 0.07, steel, 0, -0.16, 0, 10);
        box(g, 0.04, 0.2, 0.04, bm, 0, 0.19, -0.1);
        g.userData.hit = g.children.slice(); return g;
      },
      magnifier() {
        const g = new T.Group(), L = new T.Group(); L.rotation.x = -1.0; L.position.y = 0.17; g.add(L);
        mesh(L, new T.TorusGeometry(0.1, 0.012, 8, 32), brass, 0, 0.1, 0); mesh(L, new T.CircleGeometry(0.1, 28), new T.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.35, roughness: 0.02, side: T.DoubleSide }), 0, 0.1, 0);
        cyl(L, 0.014, 0.018, 0.17, darkWood, 0, -0.07, 0, 10);
        box(g, 0.2, 0.025, 0.14, darkWood, 0, 0.012, 0.03); box(g, 0.2, 0.1, 0.02, darkWood, 0, 0.06, -0.04, { rx: -0.2 });
        g.userData.hit = g.children.slice(); return g;
      },
      telescope() {
        const g = new T.Group();
        for (let i = 0; i < 3; i++) { const a = i / 3 * 6.283; const leg = cyl(g, 0.012, 0.02, 1.3, darkWood, Math.cos(a) * 0.17, 0.66, Math.sin(a) * 0.17, 8); leg.rotation.set(Math.sin(a) * 0.14, 0, -Math.cos(a) * 0.14); }
        const tb = new T.Group(); tb.position.set(0, 1.32, 0); tb.rotation.set(0.5, 0, 0); g.add(tb);
        cyl(tb, 0.065, 0.055, 0.95, M(0x1b3a5a, 0.35, 0.4), 0, 0, 0, 24); for (const y of [-0.4, 0, 0.4]) mesh(tb, new T.TorusGeometry(0.066, 0.01, 6, 24), brass, 0, y, 0, { rx: Math.PI / 2 });
        cyl(tb, 0.08, 0.065, 0.14, brass, 0, -0.52, 0, 24); mesh(tb, new T.CircleGeometry(0.07, 20), new T.MeshStandardMaterial({ color: 0x9fd0ff, roughness: 0.05, metalness: 0.2 }), 0, -0.595, 0, { rx: Math.PI / 2 });
        cyl(tb, 0.03, 0.025, 0.1, brass, 0, 0.52, 0, 12); cyl(tb, 0.014, 0.014, 0.4, steel, 0.1, 0.1, 0, 8);
        cyl(g, 0.04, 0.04, 0.06, brass, 0, 1.3, 0, 12); g.userData.hit = g.children.slice(); return g;
      },
      tools() {
        const g = new T.Group(), hm = M(0x8a6a44, 0.7), st = M(0x9aa4b0, 0.3, 0.9);
        const ham = new T.Group(); ham.position.set(-0.55, 0, 0); g.add(ham); cyl(ham, 0.014, 0.016, 0.34, hm, 0, 0, 0, 8); box(ham, 0.11, 0.05, 0.05, st, 0, 0.17, 0);
        const wr = new T.Group(); wr.position.set(-0.2, 0.0, 0); g.add(wr); box(wr, 0.035, 0.32, 0.012, st, 0, 0, 0); mesh(wr, new T.TorusGeometry(0.035, 0.012, 6, 14, 5), st, 0, 0.17, 0); mesh(wr, new T.TorusGeometry(0.028, 0.012, 6, 14, 5), st, 0, -0.17, 0, { rz: Math.PI });
        const cp = new T.Group(); cp.position.set(0.15, 0.03, 0); g.add(cp); box(cp, 0.014, 0.3, 0.008, st, -0.045, 0, 0, { rz: 0.15 }); box(cp, 0.014, 0.3, 0.008, st, 0.045, 0, 0, { rz: -0.15 }); mesh(cp, new T.SphereGeometry(0.02, 8, 6), brass, 0, 0.15, 0);
        const ch = new T.Group(); ch.position.set(0.45, 0, 0); g.add(ch); cyl(ch, 0.02, 0.02, 0.12, hm, 0, 0.1, 0, 8); box(ch, 0.03, 0.2, 0.008, st, 0, -0.06, 0);
        const sw = new T.Group(); sw.position.set(-0.4, -0.38, 0); g.add(sw); box(sw, 0.5, 0.07, 0.008, st, 0, 0, 0); mesh(sw, new T.TorusGeometry(0.04, 0.012, 6, 14), hm, 0.3, 0, 0);
        g.children.forEach(c => { c.position.z = 0.02; }); g.userData.hit = g.children.slice(); return g;
      },
      finds() {
        const g = new T.Group(), r = R(9);
        const pts = []; for (let i = 0; i < 60; i++) { const a = i * 0.18, rr = 0.006 + i * 0.0009; pts.push(new T.Vector3(Math.cos(a) * rr * 4, Math.sin(a) * rr * 4, 0)); }
        const am = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 90, 0.016, 8), M(0xb89a6a, 0.8)); am.position.set(-0.55, 0.06, 0); am.scale.setScalar(1.4); g.add(am);
        const sh = new T.Shape(); sh.moveTo(0, 0.1); sh.lineTo(0.05, 0.02); sh.lineTo(0.035, 0.0); sh.lineTo(0.05, -0.06); sh.lineTo(0, -0.04); sh.lineTo(-0.05, -0.06); sh.lineTo(-0.035, 0); sh.lineTo(-0.05, 0.02); sh.closePath();
        const ar = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false }), M(0x5a606a, 0.55, 0.1)); ar.position.set(-0.18, 0.04, 0); ar.rotation.set(-0.2, 0.3, 0.5); g.add(ar);
        const mg = new T.IcosahedronGeometry(0.07, 1); const pa = mg.attributes.position; for (let i = 0; i < pa.count; i++) { const k = 1 + (r() - 0.5) * 0.3; pa.setXYZ(i, pa.getX(i) * k, pa.getY(i) * k, pa.getZ(i) * k); } mg.computeVertexNormals();
        const me = new T.Mesh(mg, M(0x30343a, 0.45, 0.85, { flatShading: true })); me.position.set(0.2, 0.05, 0); g.add(me);
        cyl(g, 0.05, 0.05, 0.008, M(0xd9b44a, 0.25, 0.9), 0.5, 0.01, 0.02, 24).rotation.x = -1.2;
        const shell = new T.Mesh(new T.SphereGeometry(0.06, 14, 10), M(0xf0d8d0, 0.5, 0.1)); shell.scale.set(1, 0.6, 1.3); shell.position.set(0.0, 0.03, 0.12); g.add(shell);
        g.userData.hit = g.children.slice(); return g;
      },
      unique() {
        const g = new T.Group(), k = new T.Mesh(new T.TorusKnotGeometry(0.13, 0.04, 140, 16, 3, 5), new T.MeshStandardMaterial({ color: 0xdde8ff, emissive: 0x1a2a55, roughness: 0.1, metalness: 1, envMapIntensity: 2 }));
        k.position.y = 0.3; g.add(k); B.updaters.push(dt => { k.rotation.y += dt * 0.5; k.rotation.x += dt * 0.2; }); g.userData.hit = [k]; return g;
      },
      gems(kind) {
        const g = new T.Group(), r = R(kind.length * 17), cushion = { diamond: velvetBlue, emerald: velvetRed, ruby: velvetDark }[kind];
        cyl(g, 0.3, 0.3, 0.04, cushion, 0, 0.02, 0, 28);
        const n = 4; for (let i = 0; i < n; i++) { const m = gem(kind, 0.8 + r() * 1.1); const a = i / n * 6.283 + 0.4; m.position.set(Math.cos(a) * 0.14 + (n === 1 ? 0 : 0), 0.09, Math.sin(a) * 0.14); m.rotation.y = r() * 3; g.add(m); B.updaters.push(dt => { m.rotation.y += dt * 0.3; }); }
        const c = gem(kind, 2.2); c.position.set(0, 0.12, 0); g.add(c);
        g.userData.hit = g.children.slice(1); return g;
      },
    };
    const dome = (p, x, y, z, r) => { const d = mesh(p, new T.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), caseMat, x, y, z); d.renderOrder = 6; cyl(p, r + 0.02, r + 0.03, 0.04, brass, x, y + 0.02, z, 28); return d; };
    const sectionPlate = (p, x, txt) => mesh(p, new T.PlaneGeometry(2.4, 0.28), new T.MeshBasicMaterial({ map: TX.plate(txt, { w: 768, h: 90, size: 40 }), toneMapped: false }), x, 3.55, AZ - 0.2, { ry: Math.PI });
    const place = (id, x, y, z, rot, scale, parent) => {
      const g = typeof id === 'string' ? makeArt[id.split(':')[0]](id.split(':')[1]) : id; const aid = typeof id === 'string' ? id.split(':')[1] || id : '';
      g.position.set(x, y, z); if (rot) g.rotation.y = rot; if (scale) g.scale.setScalar(scale); (parent || hall).add(g);
      return g;
    };
    const tagArt = (g, id) => { (g.userData.hit || []).forEach(m => m.traverse(o => { if (o.isMesh) { o.userData.art = id; B.artMeshes.push(o); } })); shadowed(g); };
    const pedestal = (p, x, y, z, w, h, tex) => { const g = new T.Group(); box(g, w, h, w, M(0xe6e0d0, 0.5), 0, h / 2, 0); box(g, w + 0.08, 0.05, w + 0.08, brass, 0, h + 0.025, 0); box(g, w + 0.08, 0.07, w + 0.08, brass, 0, 0.035, 0); g.position.set(x, y, z); p.add(g); return g; };
    SECX.forEach((x, s) => {
      const sec = new T.Group(); hall.add(sec);
      box(sec, 3.0, 3.4, 0.05, [velvetDark, velvetBlue, velvetDark, M(0x2a2018, 1), velvetGreen, velvetRed][s], x, 1.7, HZ - 0.04);
      for (const e of [-1.5, 1.5]) box(sec, 0.06, 3.4, 1.0, brass, x + e, 1.7, HZ - 0.5);
      box(sec, 3.1, 0.18, 1.1, brass, x, 3.5, HZ - 0.5); box(sec, 3.0, 0.03, 1.0, emis(0xfff2c8), x, 3.4, HZ - 0.5);
      box(sec, 3.0, 0.06, 1.0, M(0x2a2018, 0.6), x, 0.03, HZ - 0.5);
      sectionPlate(sec, x, A.SECTIONS[s]);
      solid(x - 1.5, x + 1.5, 5.3, 6.6, 'art' + s);
      B.targets.push({ id: 'sec' + s, x, z: 4.2, r: 1.9, text: A.SECTIONS[s], key: 'section', passive: true, sec: s });
    });
    const A_ = (id, s, ox, y, scale, rot, ped) => { const x = SECX[s] + ox; if (ped) pedestal(hall, x, 0, AZ, ped[0], ped[1]); const g = place(id, x, ped ? ped[1] + 0.05 : y, AZ, rot || Math.PI, scale); tagArt(g, id.split(':')[0] === 'gems' ? id.split(':')[1] : id.split(':')[0]); return g; };
    A_('globe', 0, 0, 0, 1.25, 0, [0.7, 0.95]);
    box(hall, 1.0, 0.04, 0.4, darkWood, SECX[0] - 0.0, 2.1, AZ - 0.15);
    for (const [dx, dy] of [[-0.14, 2.19], [0.14, 2.19], [0, 2.36]]) cyl(hall, 0.07, 0.07, 0.8, cream, SECX[0] + dx, dy, AZ - 0.15, 14, { rz: Math.PI / 2 });
    A_('microscope', 1, -0.75, 0, 1.4, 0.4, [0.5, 1.0]); A_('magnifier', 1, 0.75, 0, 2.0, Math.PI, [0.5, 0.9]);
    A_('telescope', 2, 0, 0, 1.05, Math.PI);
    mesh(hall, new T.PlaneGeometry(1.5, 1.5), new T.MeshBasicMaterial({ map: TX.stars(), toneMapped: false }), SECX[2], 2.55, HZ - 0.08, { ry: Math.PI });
    mesh(hall, new T.PlaneGeometry(3.0, 3.4), M(0xffffff, 1, 0, { map: TX.pegboard() }), SECX[3], 1.7, HZ - 0.07, { ry: Math.PI });
    { const g = A_('tools', 3, 0, 1.55, 1.7, Math.PI); g.position.z = HZ - 0.14; }
    // finds on glass shelves, the unique knot in a dome in front
    for (const [y, ox] of [[1.0, -0.8], [1.7, 0.8], [2.4, -0.8]]) { box(hall, 1.1, 0.03, 0.4, caseMat, SECX[4] + ox, y, AZ + 0.1); }
    A_('finds', 4, 0, 1.05, 1.25, Math.PI);
    pedestal(hall, SECX[4], 0, AZ - 0.7, 0.55, 0.85); A_('unique', 4, 0, 0, 1.0, 0); hall.children[hall.children.length - 1].position.set(SECX[4], 0.9, AZ - 0.7);
    dome(hall, SECX[4], 0.9, AZ - 0.7, 0.33);
    ['diamond', 'emerald', 'ruby'].forEach((k, i) => { const x = SECX[5] + (i - 1) * 0.95, ph = [0.75, 0.95, 0.8][i]; pedestal(hall, x, 0, AZ - 0.1, 0.5, ph); const g = makeArt.gems(k); g.position.set(x, ph + 0.05, AZ - 0.1); hall.add(g); tagArt(g, k); dome(hall, x, ph + 0.05, AZ - 0.1, 0.33); });
    // the placement for 'unique' above used place(); make sure it is tagged once
    // the search pedestal at the entrance of the reading room
    const ped = new T.Group(); ped.position.set(10.4, 0, 1.6); hall.add(ped);
    box(ped, 0.7, 0.9, 0.7, M(0xe6e0d0, 0.5), 0, 0.45, 0); box(ped, 0.78, 0.06, 0.78, brass, 0, 0.93, 0);
    const sg = new T.Group(); sg.position.set(0, 1.25, 0); sg.rotation.y = -Math.PI / 2; ped.add(sg);
    box(sg, 0.62, 0.42, 0.04, enamel, 0, 0, 0, { rx: -0.35 });
    B.searchScreen = mesh(sg, new T.PlaneGeometry(0.56, 0.36), new T.MeshBasicMaterial({ map: TX.plate('ПОИСК\nкниги · новости · заметки', { w: 512, h: 320, bg: '#0f2a44', fg: '#9fe8ff', font: 'Arial, sans-serif', size: 44 }), toneMapped: false }), 0, 0, 0.022, { rx: -0.35 });
    const lens = mesh(ped, new T.TorusGeometry(0.2, 0.02, 8, 32), brass, 0, 1.9, 0, {}); B.updaters.push((dt, t) => { lens.rotation.y += dt * 0.8; lens.position.y = 1.9 + Math.sin(t * 1.5) * 0.05; });
    shadowed(ped);
    solid(10.0, 10.8, 1.2, 2.0, 'search');
    B.targets.push({ id: 'search', x: 10.4, z: 1.6, r: 2.2, text: 'Читальный зал · поиск', key: 'search' });
    // section targets for artifacts are by ray; passive targets only name the place

    // ---- the landscapes, the light of the sun, the sky ----------------------------------------------------------
    const sky = new T.Mesh(new T.SphereGeometry(140, 24, 16), new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, toneMapped: false }));
    { const c = []; const p = sky.geometry.attributes.position; for (let i = 0; i < p.count; i++) c.push(1, 1, 1); sky.geometry.setAttribute('color', new T.Float32BufferAttribute(c, 3)); }
    sky.renderOrder = -10; scene.add(sky);
    const ground = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshBasicMaterial({ color: 0x223344, toneMapped: false })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.4; scene.add(ground);
    const R0 = 48, H0 = 34, arc = (5 * Math.PI) / 4, len = 4.0;
    const cylGeo = new T.CylinderGeometry(R0, R0, H0, 96, 1, true, arc - len / 2, len);
    const mkLand = () => { const m = new T.Mesh(cylGeo, new T.MeshBasicMaterial({ transparent: true, side: T.BackSide, depthWrite: false, toneMapped: false, fog: false, opacity: 1 })); m.position.y = 1.4 + (TX.horizon - 0.5) * H0; m.renderOrder = -5; scene.add(m); return m; };
    B.landA = mkLand(); B.landB = mkLand(); B.landB.renderOrder = -4; B.landB.material.opacity = 0; B.landB.visible = false;
    B.sky = sky; B.ground = ground;
    // the sun: a spot light from outside the north-west; it reaches the main room and fades before the hall
    const sun = new T.SpotLight(0xffd9a0, 1.2, 24, 0.95, 0.65, 1.6); sun.position.set(-9, 3.0, -14); sun.target.position.set(-0.5, 0, -0.5);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0006; sun.shadow.camera.near = 6; sun.shadow.camera.far = 26;
    scene.add(sun, sun.target); B.lights.sun = sun;
    const hemi = new T.HemisphereLight(0xb7c4ee, 0x8a7a70, 0.55); scene.add(hemi); B.lights.hemi = hemi;
    const lampA = new T.PointLight(0xffe2b0, 0.5, 11, 2); lampA.position.set(-3.5, 3.2, 1.2); scene.add(lampA);
    const lampB = new T.PointLight(0xffe2b0, 0.45, 11, 2); lampB.position.set(3.5, 3.2, -1.8); scene.add(lampB);
    const hl = [[11, 0], [17.5, 0], [24, 0], [27, 2]].map(([x, z]) => { const l = new T.PointLight(0xffe6c0, 0.9, 14, 2); l.position.set(x, 4.0, z); scene.add(l); return l; });
    B.lights.hall = hl; B.lights.lampA = lampA; B.lights.lampB = lampB;

    // ---- per-frame --------------------------------------------------------------------------------------------------
    const tmp = new T.Vector3(), up = new T.Vector3();
    B.update = function (dt, t, cam) {
      for (const u of B.updaters) u(dt, t);
      // the monitor: the pane turns into a screen and back
      { const k0 = mon.k; mon.k += (mon.want - mon.k) * (1 - Math.exp(-2.2 * dt)); if (Math.abs(mon.want - mon.k) < 0.002) mon.k = mon.want; mon.flash *= Math.exp(-2.5 * dt);
        if (mon.k !== k0 || mon.flash > 0.01) { mon.screen.material.opacity = Math.min(1, mon.k * 1.15); for (const f of mon.mats) f.m.opacity = mon.k * f.op * (f.op < 1 ? 1 + mon.flash * 1.5 : 1); mon.light.intensity = mon.k * (0.7 + 0.8 * mon.flash); mon.screen.visible = mon.k > 0.01; } }
      // the shelf-door
      const D = B.door; D.open += (D.want - D.open) * (1 - Math.exp(-2.4 * dt));
      D.group.position.z = D.open * 3.3; D.block.z0 = -1.7 + D.open * 3.3; D.block.z1 = 1.7 + D.open * 3.3; D.block.off = D.open > 0.9;
      // the reactor
      Rx.color.lerp(Rx.target, 1 - Math.exp(-3 * dt)); Rx.speed += (Rx.tspeed - Rx.speed) * (1 - Math.exp(-2 * dt)); Rx.pulse *= Math.exp(-2.2 * dt);
      coreMat.color.copy(Rx.color); wireMat.color.copy(Rx.color); ringMat.color.copy(Rx.color); pmat.color.copy(Rx.color); rlight.color.copy(Rx.color);
      const pls = 1 + 0.07 * Math.sin(t * 3 * Rx.speed) + 0.25 * Rx.pulse; core.scale.setScalar(pls); core.rotation.y += dt * Rx.speed; wire.rotation.y -= dt * 0.6 * Rx.speed; wire.rotation.x += dt * 0.3 * Rx.speed; wire.scale.setScalar(1 + 0.12 * Rx.pulse);
      rlight.intensity = 0.9 + 0.5 * Rx.speed + 1.6 * Rx.pulse;
      for (const r of rings) { r.g.rotation.y += dt * r.s * Rx.speed * 1.4; r.g.rotation.z += dt * 0.5 * r.s * Rx.speed; }
      lamps.forEach((m, i) => { const on = i < Rx.lit; lampMats[i].color.setHex(on ? 0xffe27a : 0x2a3340).multiplyScalar(on ? 1 : 1); if (on && i === Rx.lit - 1) lampMats[i].color.setHex(0xfff6c0); });
      for (let i = 0; i < N; i++) { const d = pd[i]; d.a += dt * d.v * Rx.speed * 1.5; d.y += dt * d.v * 0.25 * Rx.speed; if (d.y > 2.75) d.y = 0.5; const rr = d.r * (0.8 + 0.2 * Math.sin(t + i)); pp[i * 3] = Math.cos(d.a) * rr; pp[i * 3 + 1] = d.y; pp[i * 3 + 2] = Math.sin(d.a) * rr; }
      pg.attributes.position.needsUpdate = true;
      // books flying into the hopper
      for (let i = Rx.tokens.length - 1; i >= 0; i--) {
        const k = Rx.tokens[i], u = k.userData; u.t += dt / 1.1;
        if (u.t < 0) continue; k.visible = true;
        const s = Math.min(1, u.t); tmp.copy(u.from).lerp(Rx.hopper, s * s * (3 - 2 * s)); tmp.y += Math.sin(s * Math.PI) * 1.4; k.position.copy(tmp); k.rotation.set(s * 7, s * 5, 0); k.scale.setScalar(1 - 0.5 * s * s);
        if (u.t >= 1) { scene.remove(k); k.geometry.dispose(); k.material.dispose(); Rx.tokens.splice(i, 1); Rx.kick(0.6); if (u.last && u.done) u.done(); }
      }
      // the belt, the stations
      beltTex.offset.y -= dt * 0.35 * (Rx.beltRun || 0);
      for (const s of stations) { s.glow = Math.max(0, s.glow - dt * 0.6); s.lm.color.setHex(0x44525f).lerp(new T.Color(0x7dffb0), Math.min(1, s.glow)); }
      if (card.userData.t !== undefined && card.visible) { card.userData.t += dt; card.material.opacity = Math.min(1, card.userData.t * 1.5); card.position.y = 0.8 + Math.min(0.25, card.userData.t * 0.4) * 0.5; }
    };
    return B;
  };
})(globalThis.Ark = globalThis.Ark || {});
