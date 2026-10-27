// «Восьмёрка Баклажан» — клиент комнаты: связь с сервером игроков (server/), позы машин туда и обратно.
// Чистая логика с подставляемым сокетом и часами: проверяется tests/unit/netclient.test.js, работает и в игре, и в Node.
// Всё, что пришло от сервера, разбирается здесь один раз; кривое отбрасывается и считается (client.dropped). Подключение к игре — этап «Сеть».
"use strict";
(function (root) {
  const pose = typeof require !== "undefined" ? require("./pose.js") : root;
  const MAX_SLOT = 6, CODE = /^[A-Z2-9]{4}$/, TOKEN = /^[A-Za-z0-9_-]{22}$/;
  const isSlot = n => Number.isInteger(n) && n >= 0 && n <= MAX_SLOT;
  const isPlayer = p => p && isSlot(p.slot) && typeof p.name === "string" && p.name.length <= 16 && typeof p.online === "boolean";

  function parseRoom(m) {
    const ok = CODE.test(m.code) && isSlot(m.you) && isSlot(m.host) && Array.isArray(m.players) && m.players.length <= MAX_SLOT + 1 && m.players.every(isPlayer)
      && (m.token === undefined || TOKEN.test(m.token));
    return ok ? { type: "room", room: { code: m.code, you: m.you, host: m.host, players: m.players }, token: m.token } : null;
  }

  // Текст сервера → {type, …} или null (отброшено).
  function parseServerText(text) {
    let m;
    try { m = JSON.parse(text); } catch (e) { return null; }
    if (!m || typeof m !== "object") return null;
    if (m.op === "room") return parseRoom(m);
    if (m.op === "error" && typeof m.code === "string") return { type: "error", code: m.code };
    if (m.op === "pong" && Number.isFinite(m.t)) return { type: "pong", t: m.t };
    return null;
  }

  // Бинарный кадр сервера: номер места отправителя + 24 байта позы → {slot, pose} или null.
  function parsePoseFrame(buffer, world, myslot) {
    if (!(buffer instanceof ArrayBuffer)) return null;                        // длину и тип позы проверяет decodePose
    const bytes = new Uint8Array(buffer), slot = bytes[0];
    if (!isSlot(slot) || slot === myslot) return null;
    const p = pose.decodePose(bytes.subarray(1), world);
    return p ? { slot, pose: p } : null;
  }

  function createRoomClient({ url, world, WebSocketImpl = globalThis.WebSocket, now = () => Date.now() }) {
    const handlers = {}, state = { open: false, room: null, token: null };
    const client = { state, dropped: 0 };
    let socket = null, seq = 0;
    const emit = (name, ...args) => (handlers[name] || []).forEach(fn => fn(...args));
    const drop = () => { client.dropped++; };
    const sendJson = msg => { socket.send(JSON.stringify(msg)); };

    function onText(text) {
      const m = parseServerText(text);
      if (!m) return drop();
      if (m.type === "room") {
        state.room = m.room;
        if (m.token) state.token = m.token;
        emit("room", m.room);
      } else if (m.type === "error") emit("error", m.code);
      else emit("pong", now() - m.t);
    }

    function onBinary(buffer) {
      const f = state.room && parsePoseFrame(buffer, world, state.room.you);
      if (!f) return drop();
      emit("pose", f.slot, f.pose);
    }

    client.on = (name, fn) => { (handlers[name] = handlers[name] || []).push(fn); return () => { handlers[name] = handlers[name].filter(h => h !== fn); }; };
    client.connect = () => new Promise((resolve, reject) => {
      socket = new WebSocketImpl(url);
      socket.binaryType = "arraybuffer";
      socket.onopen = () => { state.open = true; resolve(client); };
      socket.onmessage = e => (typeof e.data === "string" ? onText(e.data) : onBinary(e.data));
      socket.onclose = () => {
        const wasOpen = state.open;
        state.open = false; state.room = null;
        if (wasOpen) emit("close"); else reject(new Error("соединение не открылось"));
      };
    });
    client.close = () => { if (socket) socket.close(); };
    client.create = name => sendJson({ op: "create", name });
    client.join = (code, name, token) => sendJson(token ? { op: "join", code, name, token } : { op: "join", code, name });
    client.leave = () => { sendJson({ op: "leave" }); state.room = null; state.token = null; };
    client.ping = () => sendJson({ op: "ping", t: now() });
    client.sendPose = p => {
      if (!state.open || !state.room) return false;
      let bytes;
      try { bytes = pose.encodePose({ ...p, seq: seq++, t: now() }, world); } catch (e) { return false; }   // ошибка физики — не в сеть
      socket.send(bytes);
      return true;
    };
    return client;
  }

  const api = { createRoomClient, parseServerText, parsePoseFrame };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else Object.assign(root, api);
})(typeof globalThis !== "undefined" ? globalThis : this);
