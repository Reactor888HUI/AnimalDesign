// Прямое соединение: коды приглашения и ответа, сокет поверх двух каналов, хозяин и гость. WebRTC — поддельный (tests/helpers/fake-rtc.js).
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { FakePC, FakeChannel, sdp } = require("../helpers/fake-rtc.js");
const direct = require("../../arcade/lib/direct.js");
const { createRoomClient } = require("../../arcade/lib/net-client.js");
const { FLAG } = require("../../arcade/lib/pose.js");

const { encodeCode, decodeCode, CodeError, ChannelSocket, createDirectHost, createDirectGuest } = direct;
const WORLD = { x0: -580, x1: 3640, z0: -3800, z1: 260, y0: -20, y1: 220 };
const POSE = { x: 100, y: 5, z: -300, yaw: 1, pitch: 0, roll: 0, v: 20, steer: 0.5, flags: FLAG.AIR };
const flush = (ms = 15) => new Promise(r => setTimeout(r, ms));
const until = async (cond, ms = 1000) => { for (const end = Date.now() + ms; Date.now() < end; await flush(2)) if (cond()) return true; return false; };
test.beforeEach(() => FakePC.reset());

const GOOD = sdp(7, "offer", ["ctl", "pose"]);
const b64 = text => Buffer.from(text).toString("base64url");

test("код туда и обратно: приглашение и ответ различаются, текст SDP сохраняется до байта", () => {
  const offer = encodeCode("O", GOOD), answer = encodeCode("A", GOOD);
  assert.match(offer, /^BK1\.O\.[A-Za-z0-9_-]+$/); assert.match(answer, /^BK1\.A\./);
  assert.equal(decodeCode(offer, "O"), GOOD); assert.equal(decodeCode(answer, "A"), GOOD);
});

test("код читается, даже если мессенджер добавил пробелы, переносы и кавычки по краям", () => {
  const code = encodeCode("O", GOOD), mangled = ` «\n${code.slice(0, 20)}\n  ${code.slice(20, 60)} \r\n${code.slice(60)}\t» `;
  assert.equal(decodeCode(mangled, "O"), GOOD);
});

test("плохой код отклоняется понятной ошибкой, а не падением", () => {
  const good = encodeCode("O", GOOD);
  const bad = {
    "пусто": "", "не строка": 42, "без префикса": good.slice(4), "чужой префикс": "XX1." + good.slice(4), "это ответ, а нужно приглашение": encodeCode("A", GOOD),
    "знаки не из алфавита": good + "!!!", "обрезан": good.slice(0, good.length - 7), "слишком длинный": "BK1.O." + "A".repeat(9000),
    "не начинается с v=0": "BK1.O." + b64("hello\r\nm=application 9\r\n"),
    "есть звук": "BK1.O." + b64(GOOD + "m=audio 9 RTP/AVP 0\r\n"), "есть видео": "BK1.O." + b64(GOOD + "m=video 9 RTP/AVP 96\r\n"),
    "нет канала данных": "BK1.O." + b64("v=0\r\ns=-\r\nt=0 0\r\n"), "не-ASCII": "BK1.O." + b64(GOOD + "a=x:я\r\n"),
    "строка без «=»": "BK1.O." + b64(GOOD + "мусор\r\n"), "ASCII-строка без «=»": "BK1.O." + b64(GOOD + "garbage\r\n"),
    "управляющий символ": "BK1.O." + b64(GOOD + "a=x:\x01\r\n"), "знак вне ASCII (é)": "BK1.O." + b64(GOOD + "a=x:\u00e9\r\n"),
    "до v=0 есть строка": "BK1.O." + b64("a=x\r\n" + GOOD), "без перевода строки в конце": "BK1.O." + b64(GOOD.slice(0, -2)),
    "длинная строка (SDP больше 6000 знаков)": "BK1.O." + b64(GOOD + "a=" + "x".repeat(6200) + "\r\n"), "слишком много строк": "BK1.O." + b64(GOOD + "a=x\r\n".repeat(250)),
  };
  for (const [name, code] of Object.entries(bad)) assert.throws(() => decodeCode(code, "O"), e => e instanceof CodeError && /[а-яё]/i.test(e.message), name);
});

test("тексты ошибок указывают, что перепутано: ответ вместо приглашения и наоборот", () => {
  assert.throws(() => decodeCode(encodeCode("A", GOOD), "O"), /ответ.*нужно приглашение/);
  assert.throws(() => decodeCode(encodeCode("O", GOOD), "A"), /приглашение.*нужен ответ/);
});

test("длина SDP ограничена: слишком длинное описание не принимается и не создаётся", () => {
  assert.throws(() => encodeCode("O", GOOD + "a=" + "x".repeat(6200) + "\r\n"), CodeError);
  assert.throws(() => encodeCode("O", "v=0\r\n" + "a=x\r\n".repeat(2000)), CodeError);
});

function pair() {
  const ctl = new FakeChannel("ctl"), pose = new FakeChannel("pose"), pctl = new FakeChannel("ctl"), ppose = new FakeChannel("pose");
  ctl.peer = pctl; pctl.peer = ctl; pose.peer = ppose; ppose.peer = pose;
  return { a: new ChannelSocket({ ctl, pose }), b: new ChannelSocket({ ctl: pctl, pose: ppose }), ctl, pose, pctl, ppose };
}

test("сокет открывается, когда открылись оба канала; обработчик, поставленный позже, всё равно узнает об открытии", async () => {
  const { a, ctl, pose } = pair(); let opened = 0;
  assert.equal(a.readyState, 0);
  ctl.open(); await flush(); assert.equal(a.readyState, 0);
  pose.open(); assert.equal(a.readyState, 1);
  a.onopen = () => opened++; await flush(); assert.equal(opened, 1);
  pose.open(); ctl.open(); await flush(); assert.equal(opened, 1);                // повторные «открыто» от каналов не дублируют открытие
});

test("текст идёт по надёжному каналу, байты — по ненадёжному; на приёме сообщения приходят как у WebSocket", async () => {
  const { a, b, ctl, pose, pctl, ppose } = pair();
  [ctl, pose, pctl, ppose].forEach(c => c.open());
  const got = []; b.onmessage = e => got.push(e.data);
  a.send("привет"); a.send(Uint8Array.from([1, 2, 3]));
  await flush();
  assert.deepEqual(ctl.sent, ["привет"]); assert.equal(pose.sent.length, 1);
  assert.deepEqual(got.map(d => typeof d === "string" ? d : Array.from(new Uint8Array(d))), ["привет", [1, 2, 3]]);
  assert.equal(a.binaryType, "arraybuffer"); assert.equal(ctl.binaryType, "arraybuffer"); assert.equal(pose.binaryType, "arraybuffer");
});

test("закрытие любого канала закрывает сокет один раз; отправка в закрытый сокет молча игнорируется", async () => {
  const { a, ctl, pose, pctl, ppose } = pair(); [ctl, pose, pctl, ppose].forEach(c => c.open());
  let closed = 0; a.onclose = () => closed++;
  pctl.close(); await flush(); assert.equal(a.readyState, 3); assert.equal(closed, 1);
  assert.doesNotThrow(() => a.send("x")); a.close(); assert.equal(closed, 1);
});

test("отправка до открытия не падает и не уходит", () => {
  const { a, ctl } = pair();
  assert.doesNotThrow(() => a.send("рано")); assert.deepEqual(ctl.sent, []);
});

async function connectedPair(over = {}) {
  const host = createDirectHost({ RTC: FakePC, gatherMs: 50, ...over }), guest = createDirectGuest({ RTC: FakePC, gatherMs: 50 });
  const invite = await host.invite();
  const answer = await guest.join(invite);
  await host.accept(answer);
  const guestSocket = await guest.ready;
  const hc = createRoomClient({ url: "local", world: WORLD, WebSocketImpl: host.Socket }), gc = createRoomClient({ url: "x", world: WORLD, WebSocketImpl: guest.Socket });
  const log = { h: [], g: [] };
  hc.on("room", r => log.h.push(["room", r])); hc.on("pose", (s, p) => log.h.push(["pose", s, p])); hc.on("error", e => log.h.push(["error", e]));
  gc.on("room", r => log.g.push(["room", r])); gc.on("pose", (s, p) => log.g.push(["pose", s, p])); gc.on("error", e => log.g.push(["error", e]));
  await hc.connect(); await gc.connect();
  return { host, guest, hc, gc, log, guestSocket, invite, answer };
}

test("полный путь: приглашение → ответ → оба в комнате, видят друг друга и обмениваются позами", async () => {
  const { hc, gc, log } = await connectedPair();
  hc.create("Аня"); assert.ok(await until(() => log.h.some(e => e[0] === "room")));
  assert.equal(log.h[0][1].code, "DRCT");
  gc.join("DRCT", "Боря"); assert.ok(await until(() => log.g.some(e => e[0] === "room")));
  assert.deepEqual(log.g.at(-1)[1].players.map(p => p.name), ["Аня", "Боря"]); assert.equal(log.g.at(-1)[1].you, 1);
  assert.ok(await until(() => log.h.at(-1)[1].players.length === 2));

  assert.equal(gc.sendPose(POSE), true); assert.ok(await until(() => log.h.some(e => e[0] === "pose")));
  const got = log.h.find(e => e[0] === "pose"); assert.equal(got[1], 1); assert.ok(Math.abs(got[2].x - 100) < 0.1); assert.equal(got[2].flags, FLAG.AIR);
  assert.equal(hc.sendPose({ ...POSE, x: 200 }), true); assert.ok(await until(() => log.g.some(e => e[0] === "pose")));
  assert.equal(log.g.find(e => e[0] === "pose")[1], 0);
});

test("принять ответ можно только после приглашения и только ответ, а не приглашение", async () => {
  const host = createDirectHost({ RTC: FakePC, gatherMs: 50 }), guest = createDirectGuest({ RTC: FakePC, gatherMs: 50 });
  await assert.rejects(host.accept(encodeCode("A", GOOD)), e => e instanceof CodeError && /приглашени/i.test(e.message));
  const invite = await host.invite();
  await assert.rejects(host.accept(invite), CodeError);                  // приглашение вместо ответа
  await assert.rejects(guest.join(encodeCode("A", GOOD)), CodeError);    // ответ вместо приглашения
});

test("новое приглашение отменяет прежнее, ещё не принятое", async () => {
  const host = createDirectHost({ RTC: FakePC, gatherMs: 50 });
  await host.invite(); const first = FakePC.all[0];
  await host.invite();
  assert.equal(first.closed, true); assert.equal(FakePC.all[1].closed, false);
});

test("не принятое вовремя приглашение устаревает и закрывается", async () => {
  const host = createDirectHost({ RTC: FakePC, gatherMs: 50, inviteTtlMs: 40 }), guest = createDirectGuest({ RTC: FakePC, gatherMs: 50 });
  const answer = await guest.join(await host.invite());
  await flush(80);
  assert.equal(FakePC.all[0].closed, true);
  await assert.rejects(host.accept(answer), e => e instanceof CodeError && /устарел/i.test(e.message));
});

test("если сбор адресов не завершился, приглашение всё равно создаётся по истечении срока", async () => {
  FakePC.neverGather = true;
  const host = createDirectHost({ RTC: FakePC, gatherMs: 30 });
  const t0 = Date.now(), code = await host.invite();
  const took = Date.now() - t0;
  assert.ok(took >= 25 && took < 400, `ждали ${took} мс`); assert.match(code, /^BK1\.O\./);
});

test("если адреса уже есть, а «сбор завершён» не приходит, ждём только тишины после последнего, а не весь срок", async () => {
  FakePC.neverGather = true; FakePC.candidateTimes = [0];
  const host = createDirectHost({ RTC: FakePC, gatherMs: 2000, quietMs: 40 });
  const t0 = Date.now(); await host.invite(); const took = Date.now() - t0;
  assert.ok(took >= 35 && took < 500, `ждали ${took} мс`);
});

test("каждый новый адрес продлевает тишину; последний адрес — точка отсчёта", async () => {
  FakePC.neverGather = true; FakePC.candidateTimes = [0, 30, 60];
  const host = createDirectHost({ RTC: FakePC, gatherMs: 2000, quietMs: 50 });
  const t0 = Date.now(); await host.invite(); const took = Date.now() - t0;
  assert.ok(took >= 100 && took < 600, `ждали ${took} мс`);
});

test("конец списка адресов (пустой кандидат) завершает ожидание сразу", async () => {
  FakePC.neverGather = true; FakePC.candidateTimes = [];
  const origSet = FakePC.prototype.setLocalDescription;
  FakePC.prototype.setLocalDescription = async function (d) { await origSet.call(this, d); setTimeout(() => this.onicecandidate({ candidate: null }), 10); };
  try {
    const host = createDirectHost({ RTC: FakePC, gatherMs: 2000, quietMs: 1500 });
    const t0 = Date.now(); await host.invite(); assert.ok(Date.now() - t0 < 400);
  } finally { FakePC.prototype.setLocalDescription = origSet; }
});

test("серверы STUN подключаются только по желанию", async () => {
  await createDirectHost({ RTC: FakePC, gatherMs: 20 }).invite();
  await createDirectHost({ RTC: FakePC, gatherMs: 20, stun: true }).invite();
  assert.deepEqual(FakePC.all[0].config.iceServers, []);
  assert.deepEqual(FakePC.all[1].config.iceServers, [{ urls: "stun:stun.l.google.com:19302" }]);
});

test("каналы создаются как надо: «ctl» надёжный, «pose» без порядка и повторов", async () => {
  await createDirectHost({ RTC: FakePC, gatherMs: 20 }).invite();
  const [ctl, pose] = FakePC.all[0].channels;
  assert.equal(ctl.label, "ctl"); assert.equal(ctl.opts, undefined);
  assert.equal(pose.label, "pose"); assert.deepEqual(pose.opts, { ordered: false, maxRetransmits: 0 });
});

test("гость ушёл — хозяин видит, что в комнате остался один; место освобождается для следующего", async () => {
  const { hc, gc, log, guestSocket } = await connectedPair();
  hc.create("Аня"); gc.join("DRCT", "Боря");
  assert.ok(await until(() => log.h.at(-1)?.[1].players?.length === 2));
  guestSocket.close();
  assert.ok(await until(() => log.h.at(-1)[1].players.length === 1));
});

test("хозяин закрыл — гости отключены", async () => {
  const { host, gc, log, guestSocket } = await connectedPair();
  let closed = false; gc.on("close", () => { closed = true; });
  host.close();
  assert.ok(await until(() => closed)); assert.equal(guestSocket.readyState, 3);
});

test("комната полная — приглашение не создаётся", async () => {
  const host = createDirectHost({ RTC: FakePC, gatherMs: 20, maxGuests: 0 });
  await assert.rejects(host.invite(), e => e instanceof CodeError && /заполнен/i.test(e.message));
});

test("несколько гостей по очереди: у каждого своё место", async () => {
  const host = createDirectHost({ RTC: FakePC, gatherMs: 20 }), hc = createRoomClient({ url: "l", world: WORLD, WebSocketImpl: host.Socket }), rooms = [];
  hc.on("room", r => rooms.push(r)); await hc.connect(); hc.create("Хозяин");
  const slots = [];
  for (let i = 1; i <= 3; i++) {
    const guest = createDirectGuest({ RTC: FakePC, gatherMs: 20 });
    await host.accept(await guest.join(await host.invite())); await guest.ready;
    const gc = createRoomClient({ url: "x", world: WORLD, WebSocketImpl: guest.Socket }); await gc.connect();
    const mine = []; gc.on("room", r => mine.push(r.you)); gc.join("DRCT", "Г" + i);
    assert.ok(await until(() => mine.length > 0)); slots.push(mine[0]);
  }
  assert.deepEqual(slots, [1, 2, 3]); assert.ok(await until(() => rooms.at(-1).players.length === 4));
});

test("после ухода гостя место освобождается: список гостей пуст и новое приглашение снова возможно", async () => {
  const host = createDirectHost({ RTC: FakePC, gatherMs: 20, quietMs: 10, maxGuests: 1 }), guest = createDirectGuest({ RTC: FakePC, gatherMs: 20, quietMs: 10 });
  await host.accept(await guest.join(await host.invite()));
  assert.ok(await until(() => host.guests().length === 1));
  await assert.rejects(host.invite(), /заполнен/);
  guest.close();
  assert.ok(await until(() => host.guests().length === 0));
  await assert.doesNotReject(host.invite());
});

test("хозяин закрыл собственный сокет (клиент вышел) — комната закрывается, гости отключены", async () => {
  const { hc, gc } = await connectedPair(); let closed = false;
  gc.on("close", () => { closed = true; });
  hc.close();
  assert.ok(await until(() => closed));
});

test("закрытие хозяина отменяет и ещё не принятое приглашение", async () => {
  const host = createDirectHost({ RTC: FakePC, gatherMs: 20, quietMs: 10 });
  await host.invite(); const pc = FakePC.all[0];
  host.close();
  assert.equal(pc.closed, true);
});

test("гость закрыл соединение сам: его сокет и соединение закрыты", async () => {
  const { guest, guestSocket } = await connectedPair();
  const pc = FakePC.all.at(-1);
  guest.close();
  assert.equal(guestSocket.readyState, 3); assert.equal(pc.closed, true);
});
