// «Восьмёрка Баклажан» — игра с друзьями: меню «Друзья» (прямое соединение кодами), поза своей машины, чужие машины на дороге.
// Код игры разбит на файлы arcade/js/NN-*.js; они грузятся по порядку номеров и делят общие имена (docs/ARCHITECTURE.md).
// Логика связи — в arcade/lib (pose, net-client, hub, direct, remote: чистые модули под тестами); здесь только склейка с игрой и экраном.
"use strict";
/* ---------- игра с друзьями ---------- */
// Чужие машины — только картинка: физику каждый считает у себя, столкновений нет. Все чужие машины — один вызов отрисовки (InstancedMesh).
const LINK = (() => {
  const NET_WORLD = { x0: WORLD.x0, x1: WORLD.x1, z0: WORLD.z0, z1: WORLD.z1, y0: -20, y1: 220 };
  // цвет игрока по месту: css — для кружков и табличек, tint — для кузова (в r149 hex на экране светлее, поэтому темнее)
  const PALETTE = [["#ff5a4a", "#a8120c"], ["#ff9a3c", "#d42800"], ["#6fdc8c", "#1e9a45"], ["#39b6ff", "#1f6fd0"], ["#c552ff", "#9a2fd8"], ["#ff8ef0", "#d03a9e"], ["#e8ecf5", "#a9aebb"]]
    .map(([css, tint]) => ({ css, tint: new T.Color(tint) }));
  const SEND_MS = 40, PING_MS = 2000, MAX_REMOTE = 6, FAR = 500;
  const st = { role: null, host: null, guest: null, client: null, rtt: null, sent: 0, received: 0, sendAt: 0, pingAt: 0 };
  const remotes = new Map();                                       // место → { remote, name, color, tag, x, y, z, v, visible }
  const api = { hideRemotes: false };

  // ---- чужая машина: одна склеенная сетка с цветами вершин (белое красится цветом игрока, тёмное остаётся тёмным) ----
  function carGeometry() {
    const pos = [], nor = [], col = [];
    const box = (x0, x1, y0, y1, z0, z1, c) => {
      const g = new T.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).toNonIndexed();
      pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
      for (let i = 0; i < g.attributes.position.count; i++) col.push(c, c, c);
    };
    const g0 = -WHEEL;                                              // земля под колёсами
    box(-2.0, 2.0, g0 + .28, g0 + .86, -.82, .82, 1);                // кузов
    box(-1.05, .85, g0 + .86, g0 + 1.36, -.72, .72, 1);             // салон
    box(-.95, .75, g0 + .92, g0 + 1.3, -.74, .74, .12);             // стёкла
    for (const x of [-1.25, 1.25]) for (const z of [-.8, .8]) box(x - .31, x + .31, g0, g0 + .58, z - .12, z + .12, .06);   // колёса
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new T.Float32BufferAttribute(nor, 3)); g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
    return g;
  }
  const mesh = new T.InstancedMesh(carGeometry(), new T.MeshLambertMaterial({ vertexColors: true }), MAX_REMOTE);
  mesh.setColorAt(0, PALETTE[0].tint);                                    // цвета экземпляров нужны ДО первого кадра: в Three.js r149 шейдер выбирается один раз
  mesh.count = 0; mesh.frustumCulled = false; mesh.userData.dyn = true; scene.add(mesh);
  api.mesh = mesh;

  // ---- поза своей машины: то, что нарисовано (положение и поворот модели), в тех же углах, что у чужих ----
  const euler = new T.Euler();
  function poseNow() {
    const p = carObj.position, U = carObj.userData;
    euler.setFromQuaternion(carObj.quaternion, "YZX");                                                   // как в render(): rotation.set(крен, курс, тангаж, "YZX")
    const flags = (free.air ? FLAG.AIR : 0) | (brk() > .1 ? FLAG.BRAKE : 0) | (Math.abs(car.vl || 0) > 3 ? FLAG.SKID : 0) | (free.wall ? FLAG.WALL : 0) | (free.tube ? FLAG.TUBE : 0) | (free.pro ? FLAG.PRO : 0);
    return { x: p.x, y: p.y - WHEEL, z: p.z, yaw: euler.y, pitch: euler.z, roll: euler.x, v: car.v || 0, steer: Math.max(-1, Math.min(1, (U.st || 0) / .45)), flags };
  }

  // ---- табличка с именем над машиной ----
  const tagsBox = $("link-tags");
  function makeTag(css) {
    const el = document.createElement("div"); el.className = "link-tag"; el.hidden = true;
    const dot = document.createElement("i"); dot.style.background = css; el.append(dot, document.createElement("span"));
    tagsBox.appendChild(el);
    return el;
  }

  // ---- комната ----
  function syncRemotes(room) {
    const here = new Set();
    for (const p of room.players) {
      if (p.slot === room.you) continue;
      here.add(p.slot);
      let r = remotes.get(p.slot);
      if (!r) { const c = PALETTE[p.slot % PALETTE.length]; r = { remote: createRemote(), color: c.tint, tag: makeTag(c.css), name: p.name, visible: false }; remotes.set(p.slot, r); showToast(`${p.name} в игре`, "good", 1800); }
      r.name = p.name;
    }
    for (const [slot, r] of remotes) if (!here.has(slot)) { r.tag.remove(); remotes.delete(slot); }
  }
  function renderPlayers(room) {
    const ul = $("lk-players"); ul.textContent = "";
    for (const p of room.players) {
      const li = document.createElement("li"), dot = document.createElement("i");
      dot.style.background = PALETTE[p.slot % PALETTE.length].css;
      li.append(dot, `${p.name}${p.slot === room.you ? " (вы)" : ""}${p.slot === 0 ? " · хозяин" : ""}`);
      ul.appendChild(li);
    }
  }
  const status = (text, bad = false) => { const el = $("lk-status"); el.textContent = text; el.classList.toggle("bad", bad); };
  const nick = () => (($("lk-nick").value || "").trim() || "Игрок").slice(0, 16);

  function makeClient(Socket) {
    const c = createRoomClient({ url: "link", world: NET_WORLD, WebSocketImpl: Socket });
    c.on("room", room => {
      syncRemotes(room); renderPlayers(room); status(room.players.length > 1 ? "Вы в одной игре" : "Ждём друзей…");
      if (st.role === "guest") {                                               // соединились: коды больше не нужны
        ["lk-out-l", "lk-in-t", "lk-in", "lk-act"].forEach(id => { $(id).hidden = true; });
        $("lk-help").textContent = "Готово! Закройте окно и поезжайте — друзья видны на дороге. Свободная езда у всех.";
      }
    });
    c.on("pose", (slot, pose) => { const r = remotes.get(slot); if (r) { r.remote.push(pose, performance.now()); st.received++; } });
    c.on("error", code => status(code === "full" ? "В игре уже 7 человек" : `Ошибка: ${code}`, true));
    c.on("pong", ms => { st.rtt = Math.round(ms); });
    c.on("close", () => { if (st.client === c) { status("Связь разорвана", true); clearRemotes(); } });
    return c;
  }
  function clearRemotes() { for (const r of remotes.values()) r.tag.remove(); remotes.clear(); }

  const fail = e => status(e instanceof CodeError ? e.message : `Не удалось соединиться: ${e && e.message ? e.message : e}`, true);
  const textFor = role => role === "host"
    ? { help: "1. Отправьте другу код приглашения. 2. Когда друг пришлёт ответ — вставьте его ниже и нажмите «Подключить друга».", out: "Код приглашения — отправьте другу", inp: "Ответ друга — вставьте сюда", act: "Подключить друга" }
    : { help: "1. Вставьте код, который прислал хозяин, и нажмите «Получить ответ». 2. Отправьте ответ хозяину и подождите соединения.", out: "Ваш ответ — отправьте хозяину", inp: "Код хозяина — вставьте сюда", act: "Получить ответ" };
  function showRoomView(role) {
    const t = textFor(role);
    $("lk-start").hidden = true; $("lk-room").hidden = false;
    $("lk-help").textContent = t.help; $("lk-out-t").textContent = t.out; $("lk-in-t").textContent = t.inp; $("lk-act").textContent = t.act;
    $("lk-more").hidden = role !== "host"; $("lk-out").value = ""; $("lk-in").value = ""; $("lk-players").textContent = "";
    $("lk-out-l").hidden = role !== "host";
  }
  function showStart() { $("lk-start").hidden = false; $("lk-room").hidden = true; status(""); }
  const settings = () => ({ stun: $("lk-stun").checked });

  async function newInvite() {
    try { status("Создаём приглашение…"); $("lk-out").value = await st.host.invite(); status("Приглашение готово — отправьте его другу"); }
    catch (e) { fail(e); }
  }
  async function startHost() {
    stop(); save.nick = nick(); persist();
    try {
      st.role = "host";
      st.host = createDirectHost({ ...settings(), onState: text => { status(text); if (st.host && st.host.guests().length) $("lk-more").hidden = false; } });
      st.client = makeClient(st.host.Socket); await st.client.connect(); st.client.create(nick());
      showRoomView("host"); await newInvite();
    } catch (e) { fail(e); }
  }
  function startGuest() { stop(); save.nick = nick(); persist(); st.role = "guest"; st.guest = createDirectGuest(settings()); showRoomView("guest"); $("lk-out-l").hidden = true; status("Вставьте код хозяина"); }

  async function act() {
    try {
      if (st.role === "host") { await st.host.accept($("lk-in").value); $("lk-in").value = ""; status("Подключаем друга…"); return; }
      if ($("lk-out").value) return;                                    // ответ уже выдан — ждём соединения
      $("lk-out").value = await st.guest.join($("lk-in").value); $("lk-out-l").hidden = false; status("Отправьте ответ хозяину — и ждите соединения…");
      await st.guest.ready;
      st.client = makeClient(st.guest.Socket); await st.client.connect(); st.client.join(HUB_CODE, nick());
    } catch (e) { fail(e); }
  }
  function stop() {
    const { client, host, guest } = st;
    Object.assign(st, { role: null, host: null, guest: null, client: null, rtt: null });
    if (client) client.close(); if (host) host.close(); if (guest) guest.close();
    clearRemotes();
  }

  // ---- каждый кадр ----
  api.tick = () => {
    const c = st.client;
    if (!c || !c.state.open || !c.state.room) return;
    const now = performance.now();
    if (mode === "free" && !replay && now - st.sendAt >= SEND_MS) { st.sendAt = now; if (c.sendPose(poseNow())) st.sent++; }
    if (now - st.pingAt >= PING_MS) { st.pingAt = now; c.ping(); if (st.rtt !== null) status(`Связь: ${st.rtt} мс`); }
  };
  const mat = new T.Matrix4(), quat = new T.Quaternion(), pos = new T.Vector3(), one = new T.Vector3(1, 1, 1), proj = new T.Vector3();
  api.draw = () => {
    const live = !api.hideRemotes && mode === "free" && !replay && st.client && st.client.state.open;
    const now = performance.now(), rect = tagsBox.getBoundingClientRect();
    let n = 0;
    camera.updateMatrixWorld();
    for (const r of remotes.values()) {
      const p = live && n < MAX_REMOTE ? r.remote.sample(now) : null;
      r.visible = !!p;
      if (!p) { r.tag.hidden = true; continue; }
      euler.set(p.roll, p.yaw, p.pitch, "YZX"); quat.setFromEuler(euler); pos.set(p.x, p.y + WHEEL, p.z);
      mesh.setMatrixAt(n, mat.compose(pos, quat, one)); mesh.setColorAt(n, r.color); n++;
      Object.assign(r, { x: p.x, y: p.y, z: p.z, v: p.v });
      proj.set(p.x, p.y + 0.9, p.z).project(camera); r.nx = proj.x; r.ny = proj.y;                 // середина кузова на экране (для проверки в тестах)
      proj.set(p.x, p.y + 1.9, p.z).project(camera);
      const near = camera.position.distanceTo(pos) < FAR && proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1;
      r.tag.hidden = !near;
      if (near) {
        r.tag.style.left = `${(proj.x * .5 + .5) * rect.width}px`; r.tag.style.top = `${(-proj.y * .5 + .5) * rect.height}px`;
        r.tag.lastChild.textContent = `${r.name} · ${Math.round(Math.abs(p.v) * 3.6)} км/ч`;
      }
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  api.stop = stop;
  api.debug = () => ({ role: st.role, open: !!(st.client && st.client.state.open), room: st.client && st.client.state.room, rtt: st.rtt, sent: st.sent, received: st.received,
    remotes: [...remotes.values()].map(r => ({ name: r.name, visible: r.visible, x: r.x, y: r.y, z: r.z, v: r.v, nx: r.nx, ny: r.ny })) });

  // ---- экран ----
  const open = () => { closeDock(); $("lk-nick").value = save.nick || ""; $("ov-link").hidden = false; };
  $("m-link").onclick = open;
  $("lk-close").onclick = () => { $("ov-link").hidden = true; };
  $("lk-host").onclick = startHost;
  $("lk-guest").onclick = startGuest;
  $("lk-act").onclick = act;
  $("lk-more").onclick = newInvite;
  $("lk-stop").onclick = () => { stop(); showStart(); };
  $("lk-copy").onclick = async () => {
    const text = $("lk-out").value;
    try { await navigator.clipboard.writeText(text); status("Скопировано"); }
    catch (e) { $("lk-out").select(); status(document.execCommand && document.execCommand("copy") ? "Скопировано" : "Выделите код и скопируйте вручную", false); }
  };
  if (navigator.share) { $("lk-share").hidden = false; $("lk-share").onclick = () => navigator.share({ text: $("lk-out").value }).catch(() => {}); }
  return api;
})();
