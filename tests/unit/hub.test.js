// Хозяин комнаты в браузере (прямое соединение): тот же протокол, что у сервера игроков, одна комната «DRCT», место 0 — хозяин.
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { createHub, parseControl, RateLimiter } = require("../../arcade/lib/hub.js");

const POSE = Uint8Array.from([1, ...Array.from({ length: 23 }, (_, i) => i + 1)]);

function setup(opts = {}) {
  const log = [], closed = [], clock = { t: 0 };
  const hub = createHub({ send: (id, data) => log.push({ id, data }), close: id => closed.push(id), now: () => clock.t, ...opts });
  const to = id => log.filter(m => m.id === id && typeof m.data === "string").map(m => JSON.parse(m.data));
  const bin = id => log.filter(m => m.id === id && typeof m.data !== "string").map(m => m.data);
  const say = (id, msg) => hub.receive(id, typeof msg === "string" ? msg : JSON.stringify(msg));
  return { hub, log, closed, clock, to, bin, say };
}
function started(n = 2) {
  const s = setup();
  s.hub.connect("h"); s.say("h", { op: "create", name: "Хозяин" });
  for (let i = 1; i < n; i++) { s.hub.connect("g" + i); s.say("g" + i, { op: "join", code: "DRCT", name: "Г" + i }); }
  s.log.length = 0;
  return s;
}

test("общие образцы разбора сообщений — те же, что проверяет сервер на Python", () => {
  const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, "../vectors/control.json"), "utf8"));
  assert.ok(vectors.length > 30);
  for (const v of vectors) assert.deepEqual(parseControl(v.input), v.expected, v.name);
});

test("хозяин создаёт комнату: место 0, он же хозяин, код DRCT, токена нет", () => {
  const s = setup(); s.hub.connect("h"); s.say("h", { op: "create", name: "Аня" });
  assert.deepEqual(s.to("h"), [{ op: "room", code: "DRCT", you: 0, host: 0, players: [{ slot: 0, name: "Аня", online: true }] }]);
});

test("гость входит: получает место 1, а хозяин и гость видят двух игроков", () => {
  const s = started(1); s.hub.connect("g"); s.say("g", { op: "join", code: "drct", name: "Боря" });
  const g = s.to("g").at(-1), h = s.to("h").at(-1);
  assert.equal(g.you, 1); assert.deepEqual(g.players.map(p => p.name), ["Хозяин", "Боря"]); assert.equal(h.players.length, 2);
});

test("войти до создания комнаты или с чужим кодом нельзя", () => {
  const s = setup(); s.hub.connect("g");
  s.say("g", { op: "join", code: "DRCT", name: "x" });
  assert.deepEqual(s.to("g"), [{ op: "error", code: "no_room" }]);
  s.hub.connect("h"); s.say("h", { op: "create", name: "H" }); s.log.length = 0;
  s.say("g", { op: "join", code: "ABCD", name: "x" });
  assert.deepEqual(s.to("g"), [{ op: "error", code: "no_room" }]);
});

test("создать комнату может только первый; повторное создание из комнаты — ошибка", () => {
  const s = started(1); s.hub.connect("g");
  s.say("g", { op: "create", name: "Самозванец" });
  assert.deepEqual(s.to("g"), [{ op: "error", code: "not_allowed" }]);
  s.log.length = 0; s.say("h", { op: "create", name: "ещё раз" });
  assert.deepEqual(s.to("h"), [{ op: "error", code: "already_in_room" }]);
});

test("в комнате не больше семи; восьмой получает «full»", () => {
  const s = started(7); s.hub.connect("late"); s.say("late", { op: "join", code: "DRCT", name: "L" });
  assert.deepEqual(s.to("late"), [{ op: "error", code: "full" }]);
  assert.equal(7, 1 + [1, 2, 3, 4, 5, 6].filter(i => s.hub.slotOf("g" + i) === i).length);
});

test("повторный вход тем же гостем не дублирует его", () => {
  const s = started(2); s.say("g1", { op: "join", code: "DRCT", name: "Г1" });
  assert.equal(s.to("g1").at(-1).players.length, 2); assert.equal(s.to("g1").at(-1).you, 1);
  s.say("g1", { op: "join", code: "ABCD", name: "Г1" });
  assert.deepEqual(s.to("g1").at(-1), { op: "error", code: "already_in_room" });
});

test("выход и обрыв освобождают место; следующий гость занимает наименьшее свободное (но не 0)", () => {
  const s = started(4);
  s.say("g1", { op: "leave" }); s.hub.disconnect("g2");
  const v = s.to("g3").at(-1);
  assert.deepEqual(v.players.map(p => p.slot), [0, 3]);
  s.hub.connect("n"); s.say("n", { op: "join", code: "DRCT", name: "Н" });
  assert.equal(s.to("n").at(-1).you, 1);
  assert.equal(s.hub.slotOf("g2"), null); assert.doesNotThrow(() => s.hub.disconnect("g2")); assert.doesNotThrow(() => s.say("g1", { op: "leave" }));
});

test("когда уходит хозяин, комната закрывается: всех гостей отключают", () => {
  const s = started(3); s.hub.disconnect("h");
  assert.deepEqual(s.closed.sort(), ["g1", "g2"]);
  s.hub.connect("x"); s.say("x", { op: "join", code: "DRCT", name: "x" });
  assert.deepEqual(s.to("x"), [{ op: "error", code: "no_room" }]);
});

test("ping получает pong с тем же временем и временем хозяина", () => {
  const s = setup(); s.clock.t = 777; s.hub.connect("a"); s.say("a", { op: "ping", t: 5.5 });
  assert.deepEqual(s.to("a"), [{ op: "pong", t: 5.5, srv: 777 }]);
});

test("поза уходит остальным с номером места отправителя; себе — нет", () => {
  const s = started(3); s.hub.receive("g1", POSE);
  assert.deepEqual(s.bin("g1"), []);
  assert.deepEqual(Array.from(s.bin("h")[0]), [1, ...POSE]); assert.deepEqual(Array.from(s.bin("g2")[0]), [1, ...POSE]);
});

test("не позы не пересылаются: неверная длина, тип, чужие без комнаты", () => {
  const s = started(2); s.hub.connect("stray");
  s.hub.receive("g1", POSE.slice(0, 23)); s.hub.receive("g1", Uint8Array.from([2, ...POSE.slice(1)])); s.hub.receive("g1", Uint8Array.from([...POSE, 0]));
  s.hub.receive("stray", POSE);
  assert.equal(s.bin("h").length, 0);
  s.say("stray", { op: "ping", t: 1 }); assert.equal(s.to("stray")[0].op, "pong");           // посторонний остался на связи
});

test("поток поз режется по ограничителю (пачка 30, потом 60 в секунду)", () => {
  const s = started(2);
  for (let i = 0; i < 100; i++) s.hub.receive("g1", POSE);
  assert.equal(s.bin("h").length, 30);
  s.clock.t = 1000; for (let i = 0; i < 100; i++) s.hub.receive("g1", POSE);      // прошла секунда: ограничитель снова даёт пачку
  assert.equal(s.bin("h").length, 60);
});

test("пять плохих сообщений подряд — отключение; хорошее между ними счётчик сбрасывает", () => {
  const s = setup(); s.hub.connect("a");
  for (let i = 0; i < 4; i++) s.say("a", "{плохо");
  s.say("a", { op: "ping", t: 1 });
  for (let i = 0; i < 4; i++) s.say("a", "{плохо");
  assert.deepEqual(s.closed, []);
  assert.equal(s.to("a").filter(m => m.op === "error").length, 8);
  s.clock.t = 100; for (let i = 0; i < 5; i++) s.say("a", "{плохо");
  assert.deepEqual(s.closed, ["a"]);
});

test("порог ровно пять: четыре плохих подряд — ещё на связи, пятое — отключение, и место освобождается", () => {
  const s = started(2);
  for (let i = 0; i < 4; i++) s.say("g1", "{плохо");
  assert.deepEqual(s.closed, []); assert.equal(s.hub.slotOf("g1"), 1);
  s.say("g1", "{плохо");
  assert.deepEqual(s.closed, ["g1"]); assert.equal(s.hub.slotOf("g1"), null);
  assert.equal(s.to("h").at(-1).players.length, 1);                              // хозяин видит, что гость ушёл
});

test("повторный выход ничего никому не рассылает", () => {
  const s = started(3); s.say("g1", { op: "leave" }); s.log.length = 0;
  s.say("g1", { op: "leave" });
  assert.deepEqual(s.log, []);
});

test("поза в виде ArrayBuffer (так её отдаёт канал WebRTC) пересылается так же, как Uint8Array", () => {
  const s = started(2); s.hub.receive("g1", POSE.buffer.slice(POSE.byteOffset, POSE.byteOffset + POSE.byteLength));
  assert.deepEqual(Array.from(s.bin("h")[0]), [1, ...POSE]);
});

test("поток текста режется по ограничителю: лишнее считается плохим", () => {
  const s = setup(); s.hub.connect("a");
  for (let i = 0; i < 30; i++) s.say("a", { op: "ping", t: i });
  const ops = s.to("a").map(m => m.op);
  assert.ok(ops.filter(o => o === "pong").length >= 10 && ops.filter(o => o === "pong").length < 30); assert.ok(ops.includes("error"));
});

test("ничего не отправляется тем, кто уже отключён", () => {
  const s = started(3); s.hub.disconnect("g1");
  s.hub.receive("h", POSE); s.say("g2", { op: "leave" });
  assert.ok(s.log.every(m => m.id !== "g1"));
});

test("ограничитель: пачка, потом ровная частота, долгая тишина запас не копит", () => {
  let t = 0; const rl = new RateLimiter(10, 3, () => t);
  assert.deepEqual([1, 2, 3, 4, 5].map(() => rl.allow()), [true, true, true, false, false]);
  t = 0.1; assert.deepEqual([1, 2, 3].map(() => rl.allow()), [true, false, false]);
  t = 100; assert.equal([...Array(10)].filter(() => rl.allow()).length, 3);
});
