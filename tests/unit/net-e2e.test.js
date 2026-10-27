// Две «страницы» через настоящий сервер: Python-сервер запускается процессом, клиенты — createRoomClient на встроенном в Node WebSocket.
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { spawn } = require("node:child_process"), path = require("node:path");
const { createRoomClient } = require("../../arcade/lib/net-client.js");
const { FLAG } = require("../../arcade/lib/pose.js");

const WORLD = { x0: -580, x1: 3640, z0: -3800, z1: 260, y0: -20, y1: 220 };
const POSE = { x: 1010, y: 3, z: -3160, yaw: 0.5, pitch: 0.1, roll: -0.1, v: 25, steer: 0.25, flags: FLAG.SKID };
const sleep = ms => new Promise(r => setTimeout(r, ms));

let proc, url;
test.before(async () => {
  proc = spawn("python3", ["-m", "server", "--port", "0"], { cwd: path.resolve(__dirname, "../.."), stdio: ["ignore", "pipe", "inherit"] });
  url = await new Promise((resolve, reject) => {
    proc.stdout.once("data", d => { const m = /ws:\/\/[\d.]+:(\d+)\/ws/.exec(String(d)); m && +m[1] ? resolve(`ws://127.0.0.1:${m[1]}/ws`) : reject(new Error("сервер не назвал порт: " + d)); });
    proc.once("exit", c => reject(new Error("сервер завершился: " + c)));
  });
});
test.after(() => { proc && proc.kill(); });

async function client() {
  const c = createRoomClient({ url, world: WORLD }), log = { rooms: [], poses: [], errors: [] };
  c.on("room", r => log.rooms.push(r)); c.on("pose", (slot, p) => log.poses.push({ slot, p, at: Date.now() })); c.on("error", e => log.errors.push(e));
  await c.connect();
  return { c, log };
}
const until = async (cond, ms = 2000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(10)) if (cond()) return true; return false; };

test("двое в одной комнате видят друг друга и обмениваются позами", async () => {
  const a = await client(), b = await client();
  a.c.create("Аня"); assert.ok(await until(() => a.log.rooms.length));
  const code = a.log.rooms[0].code;
  b.c.join(code, "Боря"); assert.ok(await until(() => b.log.rooms.length && a.log.rooms.length > 1));
  assert.deepEqual(a.log.rooms.at(-1).players.map(p => p.name), ["Аня", "Боря"]);
  assert.equal(b.log.rooms[0].you, 1);

  assert.equal(a.c.sendPose(POSE), true);
  assert.ok(await until(() => b.log.poses.length));
  const got = b.log.poses[0];
  assert.equal(got.slot, 0); assert.ok(Math.abs(got.p.x - POSE.x) < 0.1 && Math.abs(got.p.z - POSE.z) < 0.1);
  assert.equal(got.p.flags, FLAG.SKID);
  assert.equal(a.log.poses.length, 0);                                 // себя не слышим
  b.c.sendPose(POSE); assert.ok(await until(() => a.log.poses.length)); assert.equal(a.log.poses[0].slot, 1);
});

test("обрыв связи: остальные видят «не в сети», а вернувшийся с токеном получает прежнее место", async () => {
  const a = await client(), b = await client();
  a.c.create("Аня"); await until(() => a.log.rooms.length);
  b.c.join(a.log.rooms[0].code, "Боря"); await until(() => b.log.rooms.length);
  const token = b.c.state.token, code = b.c.state.room.code;
  assert.ok(token);
  b.log.rooms.length = 0; a.log.rooms.length = 0;
  b.c.close();                                                          // обрыв
  assert.ok(await until(() => a.log.rooms.some(r => r.players.some(p => p.slot === 1 && !p.online))));
  const b2 = await client();
  b2.c.join(code, "Боря", token);
  assert.ok(await until(() => b2.log.rooms.length));
  assert.equal(b2.log.rooms[0].you, 1);
  assert.ok(await until(() => a.log.rooms.at(-1).players.every(p => p.online)));
});

test("в комнате не больше семи; восьмой получает ошибку «full»", async () => {
  const host = await client(); host.c.create("Хозяин"); await until(() => host.log.rooms.length);
  const code = host.log.rooms[0].code, guests = [];
  for (let i = 1; i < 7; i++) { const g = await client(); g.c.join(code, "Г" + i); guests.push(g); }
  assert.ok(await until(() => guests.every(g => g.log.rooms.length)));
  const late = await client(); late.c.join(code, "Лишний");
  assert.ok(await until(() => late.log.errors.length)); assert.deepEqual(late.log.errors, ["full"]);
});

test("30 поз с частотой 50 в секунду доходят все, задержка на одной машине мала", async () => {
  const a = await client(), b = await client();
  a.c.create("Аня"); await until(() => a.log.rooms.length);
  b.c.join(a.log.rooms[0].code, "Боря"); await until(() => b.log.rooms.length);
  for (let i = 0; i < 30; i++) { a.c.sendPose({ ...POSE, x: 1000 + i }); await sleep(20); }
  assert.ok(await until(() => b.log.poses.length >= 30, 3000), `дошло ${b.log.poses.length} из 30`);
  const delays = b.log.poses.map(g => ((g.at >>> 0) - g.p.t + 2 ** 32) % 2 ** 32).sort((x, y) => x - y);
  assert.ok(delays[Math.floor(delays.length / 2)] <= 100, `медиана задержки ${delays[Math.floor(delays.length / 2)]} мс`);
  assert.deepEqual(b.log.poses.map(g => g.p.seq), [...b.log.poses.map(g => g.p.seq)].sort((x, y) => x - y));   // по порядку
});
