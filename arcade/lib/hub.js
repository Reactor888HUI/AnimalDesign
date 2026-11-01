// «Восьмёрка Баклажан» — комната-хозяин внутри страницы игры (прямое соединение без сервера).
// Говорит на том же протоколе, что сервер игроков (docs/PROTOCOL.md), но комната одна: код «DRCT», место 0 — хозяин, возврата по токену нет.
// Чистая логика: связь (send/close) и часы подставляются; проверяется tests/unit/hub.test.js и общими образцами tests/vectors/control.json.
"use strict";
(function (root) {
  const CODE = "DRCT", MAX_PLAYERS = 7, MAX_STRIKES = 5, MAX_CONTROL_CHARS = 512, POSE_BYTES = 24, POSE_TYPE = 1;
  const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/, TOKEN_RE = /^[A-Za-z0-9_-]{22}$/, CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

  const cleanName = v => (typeof v === "string" ? Array.from(v.replace(CONTROL_CHARS, "").trim()).slice(0, 16).join("").trim() : "") || "Игрок";
  const finiteNumber = v => Number.isFinite(v);                         // не приводит типы: строка и true — не числа

  function parseJoin(d) {
    if (typeof d.code !== "string" || !CODE_RE.test(d.code.toUpperCase())) return null;
    const out = { op: "join", code: d.code.toUpperCase(), name: cleanName(d.name) };
    if ("token" in d) {
      if (typeof d.token !== "string" || !TOKEN_RE.test(d.token)) return null;
      out.token = d.token;
    }
    return out;
  }

  const PARSERS = {
    create: d => ({ op: "create", name: cleanName(d.name) }),
    join: parseJoin,
    leave: () => ({ op: "leave" }),
    ping: d => (finiteNumber(d.t) ? { op: "ping", t: d.t } : null),
  };

  // Текст игрока → нормализованное сообщение или null (то же, что server/protocol.py: parse_control).
  function parseControl(text) {
    if (typeof text !== "string" || Array.from(text).length > MAX_CONTROL_CHARS) return null;
    let d;
    try { d = JSON.parse(text); } catch (e) { return null; }
    const parser = d && typeof d === "object" && typeof d.op === "string" && Object.prototype.hasOwnProperty.call(PARSERS, d.op) ? PARSERS[d.op] : null;
    return parser ? parser(d) : null;
  }

  // Не больше rate сообщений в секунду, пачкой не больше burst; долгая тишина запас не копит. now — секунды.
  class RateLimiter {
    constructor(rate, burst, now) { this.rate = rate; this.burst = burst; this.now = now; this.tokens = burst; this.last = now(); }
    allow() {
      const t = this.now();
      this.tokens = Math.min(this.burst, this.tokens + (t - this.last) * this.rate);
      this.last = t;
      if (this.tokens < 1) return false;
      this.tokens -= 1;
      return true;
    }
  }

  const asBytes = d => (d instanceof Uint8Array ? d : d instanceof ArrayBuffer ? new Uint8Array(d) : null);
  const validPose = b => b && b.length === POSE_BYTES && b[0] === POSE_TYPE;

  function createHub({ send, close, now = () => Date.now() }) {
    const conns = new Map();              // id → { slot|null, strikes, text, pose }
    let room = null;                      // Map слот → { id, name } или null, пока хозяин не создал комнату
    const seconds = () => now() / 1000;
    const sendJson = (id, m) => send(id, JSON.stringify(m));
    const members = () => (room ? [...room.entries()].sort((a, b) => a[0] - b[0]) : []);
    const state = you => ({ op: "room", code: CODE, you, host: 0, players: members().map(([slot, p]) => ({ slot, name: p.name, online: true })) });
    const broadcast = () => members().forEach(([slot, p]) => sendJson(p.id, state(slot)));
    const error = (id, code) => sendJson(id, { op: "error", code });

    function seat(id, slot, name) {
      room.set(slot, { id, name });
      conns.get(id).slot = slot;
      broadcast();
    }
    function unseat(id) {
      const c = conns.get(id);
      if (!room || c.slot === null) return;
      room.delete(c.slot);
      c.slot = null;
      broadcast();
    }
    function closeRoom() {
      const guests = members().filter(([slot]) => slot !== 0).map(([, p]) => p.id);
      room = null;
      guests.forEach(id => { conns.delete(id); close(id); });
    }

    function strike(id) {
      const c = conns.get(id);
      if (++c.strikes >= MAX_STRIKES) { hub.disconnect(id); close(id); return; }
      error(id, "bad_msg");
    }

    function create(id, c, msg) {
      if (c.slot !== null) return error(id, "already_in_room");
      if (room) return error(id, "not_allowed");
      room = new Map();
      seat(id, 0, msg.name);
    }
    function join(id, c, msg) {
      if (c.slot !== null) return msg.code === CODE ? sendJson(id, state(c.slot)) : error(id, "already_in_room");
      if (!room || msg.code !== CODE) return error(id, "no_room");
      const free = [...Array(MAX_PLAYERS).keys()].find(s => !room.has(s));                // место 0 занято хозяином, пока комната есть
      if (free === undefined) return error(id, "full");
      seat(id, free, msg.name);
    }
    const handlers = {
      create, join,
      leave: id => unseat(id),
      ping: (id, c, msg) => sendJson(id, { op: "pong", t: msg.t, srv: now() }),
    };

    function onText(id, c, text) {
      const msg = c.text.allow() ? parseControl(text) : null;
      if (!msg) return strike(id);
      c.strikes = 0;
      handlers[msg.op](id, c, msg);
    }
    function onPose(id, c, bytes) {
      if (c.slot === null || !validPose(bytes) || !c.pose.allow()) return;
      const frame = new Uint8Array(POSE_BYTES + 1);
      frame[0] = c.slot; frame.set(bytes, 1);
      members().forEach(([slot, p]) => { if (slot !== c.slot) send(p.id, frame); });
    }

    const hub = {
      connect(id) { conns.set(id, { slot: null, strikes: 0, text: new RateLimiter(5, 10, seconds), pose: new RateLimiter(60, 30, seconds) }); },
      receive(id, data) {
        const c = conns.get(id);
        if (!c) return;
        if (typeof data === "string") onText(id, c, data);
        else onPose(id, c, asBytes(data));
      },
      disconnect(id) {
        const c = conns.get(id);
        if (!c) return;
        if (c.slot === 0) closeRoom();
        else unseat(id);
        conns.delete(id);
      },
      slotOf(id) { const c = conns.get(id); return c ? c.slot : null; },
    };
    return hub;
  }

  const api = { createHub, parseControl, RateLimiter, HUB_CODE: CODE };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else Object.assign(root, api);
})(typeof globalThis !== "undefined" ? globalThis : this);
