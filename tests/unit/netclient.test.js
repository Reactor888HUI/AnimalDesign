// Клиент комнаты: что уходит на сервер и что из пришедшего принимается. Сокет — подделка, управляемая тестом.
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { createRoomClient } = require("../../arcade/lib/net-client.js");
const { encodePose, decodePose, FLAG } = require("../../arcade/lib/pose.js");

const WORLD = { x0: -580, x1: 3640, z0: -3800, z1: 260, y0: -20, y1: 220 };
const POSE = { x: 100, y: 5, z: -3300, yaw: 1, pitch: 0, roll: 0, v: 20, steer: 0.5, flags: FLAG.AIR };

class FakeSocket {
  constructor(url) { this.url = url; this.sent = []; this.readyState = 0; this.binaryType = "blob"; FakeSocket.last = this; }
  send(d) { this.sent.push(d); }
  close() { this.readyState = 3; this.onclose && this.onclose({ code: 1000 }); }
  open() { this.readyState = 1; this.onopen && this.onopen({}); }
  text(obj) { this.onmessage({ data: typeof obj === "string" ? obj : JSON.stringify(obj) }); }
  bin(bytes) { this.onmessage({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }); }
}
const ROOM = { op: "room", code: "ABCD", you: 0, host: 0, token: "t".repeat(22), players: [{ slot: 0, name: "Аня", online: true }] };

async function connected(over = {}) {
  let t = 1000;
  const c = createRoomClient({ url: "ws://x/ws", world: WORLD, WebSocketImpl: FakeSocket, now: () => t, ...over });
  const p = c.connect(); FakeSocket.last.open(); await p;
  const ws = FakeSocket.last;
  return { c, ws, tick: ms => { t += ms; }, events: record(c) };
}
function record(c) {
  const log = [];
  for (const name of ["room", "pose", "error", "pong", "close"]) c.on(name, (...a) => log.push([name, ...a]));
  return log;
}
const sentJson = ws => ws.sent.filter(s => typeof s === "string").map(JSON.parse);

test("соединение просит бинарные кадры как ArrayBuffer и готово после открытия", async () => {
  const { c, ws } = await connected();
  assert.equal(ws.url, "ws://x/ws"); assert.equal(ws.binaryType, "arraybuffer"); assert.equal(c.state.open, true);
});

test("создать и войти: уходят ровно те сообщения, которые ждёт сервер", async () => {
  const { c, ws } = await connected();
  c.create("Аня"); c.join("abcd", "Боря"); c.join("ABCD", "Боря", "x".repeat(22)); c.leave(); c.ping();
  assert.deepEqual(sentJson(ws), [{ op: "create", name: "Аня" }, { op: "join", code: "abcd", name: "Боря" },
    { op: "join", code: "ABCD", name: "Боря", token: "x".repeat(22) }, { op: "leave" }, { op: "ping", t: 1000 }]);
});

test("состояние комнаты принимается, запоминается и сообщается; токен нужен для возврата", async () => {
  const { c, ws, events } = await connected();
  ws.text(ROOM);
  assert.deepEqual(events[0], ["room", { code: "ABCD", you: 0, host: 0, players: ROOM.players }]);
  assert.equal(c.state.room.code, "ABCD"); assert.equal(c.state.token, ROOM.token);
  ws.text({ ...ROOM, token: undefined, host: 1 });                       // обновление без токена не стирает свой
  assert.equal(c.state.token, ROOM.token); assert.equal(c.state.room.host, 1);
});

test("кривые сообщения сервера отбрасываются и считаются, но не ломают клиент", async () => {
  const { c, ws, events } = await connected();
  const eight = Array.from({ length: 8 }, (_, i) => ({ slot: i % 7, name: "p" + i, online: true }));
  const bad = ["не json", "[]", "null", { op: 5 }, { op: "room" }, { ...ROOM, you: 9 }, { ...ROOM, code: "abc" }, { ...ROOM, code: "ABC" }, { ...ROOM, code: "AB1D" }, { ...ROOM, players: "x" },
    { ...ROOM, players: [{ slot: 0, name: 5, online: true }] }, { ...ROOM, players: [{ slot: 0, name: "я".repeat(17), online: true }] }, { ...ROOM, players: eight },
    { ...ROOM, token: "короткий" }, { ...ROOM, token: 12345 }, { op: "error", code: 7 }, { op: "pong", t: "now" }, { op: "unknown" }];
  for (const m of bad) ws.text(m);
  assert.equal(events.length, 0); assert.equal(c.dropped, bad.length);
  assert.equal(c.state.room, null);
});

test("ошибка сервера и ответ на ping доходят до игры; задержка считается по своим часам", async () => {
  const { c, ws, tick, events } = await connected();
  ws.text({ op: "error", code: "full" });
  c.ping(); tick(35); ws.text({ op: "pong", t: 1000, srv: 5 });
  assert.deepEqual(events, [["error", "full"], ["pong", 35]]);
});

test("поза уходит только из комнаты, 24 байта, с номером и временем по порядку", async () => {
  const { c, ws, tick } = await connected();
  assert.equal(c.sendPose(POSE), false); assert.equal(ws.sent.length, 0);   // ещё не в комнате
  ws.text(ROOM);
  assert.equal(c.sendPose(POSE), true); tick(40); assert.equal(c.sendPose(POSE), true);
  const [a, b] = ws.sent;
  assert.equal(a.length, 24); assert.equal(decodePose(a, WORLD).seq, 0); assert.equal(decodePose(b, WORLD).seq, 1);
  assert.equal(decodePose(a, WORLD).t, 1000); assert.equal(decodePose(b, WORLD).t, 1040);
  assert.equal(decodePose(a, WORLD).flags, FLAG.AIR);
});

test("ошибка физики (не число) не уходит в сеть и не роняет клиент", async () => {
  const { c, ws } = await connected();
  ws.text(ROOM);
  assert.equal(c.sendPose({ ...POSE, x: NaN }), false); assert.equal(ws.sent.length, 0);
});

test("чужая поза принимается: номер места отправителя + 24 байта; всё остальное отбрасывается", async () => {
  const { c, ws, events } = await connected();
  ws.text(ROOM); events.length = 0;
  const body = encodePose({ ...POSE, seq: 3, t: 77 }, WORLD), frame = (slot, b = body) => Uint8Array.from([slot, ...b]);
  ws.bin(frame(2));
  assert.equal(events.length, 1); assert.equal(events[0][0], "pose"); assert.equal(events[0][1], 2);
  assert.equal(events[0][2].seq, 3); assert.ok(Math.abs(events[0][2].x - 100) < 0.1);
  const before = c.dropped;
  ws.bin(frame(7)); ws.bin(frame(0)); ws.bin(Uint8Array.from([1, ...body.slice(0, 20)])); ws.bin(Uint8Array.from([1, 9, ...body.slice(1)])); ws.bin(new Uint8Array(0));
  ws.bin(Uint8Array.from([1, ...body, 0]));
  assert.equal(events.length, 1); assert.equal(c.dropped, before + 6);      // слот 7 вне комнаты, слот 0 — это мы сами, обрезок, неверный тип, пустой, лишний байт
});

test("выход очищает комнату и токен; закрытие связи сообщается, очищает комнату, и поза больше не уходит", async () => {
  const { c, ws, events } = await connected();
  ws.text(ROOM); c.leave();
  assert.equal(c.state.room, null); assert.equal(c.state.token, null);
  ws.text(ROOM); ws.close();
  assert.equal(events.at(-1)[0], "close"); assert.equal(c.state.open, false); assert.equal(c.state.room, null);
  assert.equal(c.sendPose(POSE), false);
});

test("close закрывает сокет: клиент сообщает о закрытии, поза больше не уходит; повторный close безвреден", async () => {
  const { c, ws, events } = await connected();
  ws.text(ROOM); c.close();
  assert.equal(ws.readyState, 3); assert.equal(events.at(-1)[0], "close"); assert.equal(c.sendPose(POSE), false);
  assert.doesNotThrow(() => c.close());
  const never = createRoomClient({ url: "ws://x/ws", world: WORLD, WebSocketImpl: FakeSocket, now: () => 0 });
  assert.doesNotThrow(() => never.close());                                  // close до connect
});

test("чужая поза до входа в комнату отбрасывается, а не роняет клиент", async () => {
  const { c, ws, events } = await connected();
  const frame = Uint8Array.from([1, ...encodePose({ ...POSE, seq: 1, t: 1 }, WORLD)]);
  assert.doesNotThrow(() => ws.bin(frame));
  assert.equal(events.length, 0); assert.equal(c.dropped, 1);
});

test("подключение, которое не открылось, отклоняется понятной ошибкой", async () => {
  const c = createRoomClient({ url: "ws://x/ws", world: WORLD, WebSocketImpl: FakeSocket, now: () => 0 }), events = record(c);
  const p = c.connect(); FakeSocket.last.onerror && FakeSocket.last.onerror({}); FakeSocket.last.close();
  await assert.rejects(p, /соединени/);
  assert.equal(events.length, 0);                                           // «закрыто» говорим только о том, что было открыто
});
