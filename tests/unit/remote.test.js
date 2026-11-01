// Чужая машина: из редких поз с дрожанием по времени — плавное положение в нужный момент. Соглашения игры: x += cos(курс)·v, z −= sin(курс)·v.
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { createRemote } = require("../../arcade/lib/remote.js");

const P = (over = {}) => ({ seq: 0, t: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, v: 0, steer: 0, flags: 0, ...over });
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} против ${b}`);
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const D = 120;                                                          // задержка показа по умолчанию, мс

test("пока поз нет — показывать нечего", () => {
  assert.equal(createRemote().sample(1000), null);
});

test("между двумя позами положение, скорость и руль считаются по доле времени", () => {
  const r = createRemote(); r.push(P({ seq: 1, x: 0, z: 10, v: 10, steer: -1 }), 1000); r.push(P({ seq: 2, x: 10, z: 30, v: 20, steer: 1 }), 1100);
  const s = r.sample(1050 + D);
  near(s.x, 5, 1e-9, "x"); near(s.z, 20, 1e-9, "z"); near(s.v, 15, 1e-9, "v"); near(s.steer, 0, 1e-9, "руль");
});

test("углы идут кратчайшим путём через ±π, а не через ноль", () => {
  const r = createRemote(); r.push(P({ seq: 1, yaw: 3.0, pitch: 3.0, roll: -3.0 }), 1000); r.push(P({ seq: 2, yaw: -3.0, pitch: -3.0, roll: 3.0 }), 1100);
  const s = r.sample(1050 + D);
  near(Math.abs(angleDiff(s.yaw, Math.PI)), 0, 1e-9, "курс"); near(Math.abs(angleDiff(s.pitch, Math.PI)), 0, 1e-9, "тангаж"); near(Math.abs(angleDiff(s.roll, Math.PI)), 0, 1e-9, "крен");
});

test("старые и повторные позы отбрасываются, счётчик через 65535 → 0 принимается", () => {
  const r = createRemote(); r.push(P({ seq: 10, x: 1 }), 1000); r.push(P({ seq: 10, x: 99 }), 1010); r.push(P({ seq: 9, x: 98 }), 1020);
  assert.equal(r.sample(1020 + D + 5000 / 1000).x, 1);
  const w = createRemote(); w.push(P({ seq: 65535, x: 0 }), 1000); w.push(P({ seq: 0, x: 10 }), 1100);
  near(w.sample(1050 + D).x, 5, 1e-9, "после переполнения");
});

test("если новых поз нет, машина продолжает ехать по скорости, но не дольше 250 мс", () => {
  const r = createRemote(); r.push(P({ seq: 1, x: 100, z: 50, v: 20, yaw: 0 }), 1000);
  near(r.sample(1000 + D + 100).x, 102, 1e-9, "100 мс");
  near(r.sample(1000 + D + 2000).x, 105, 1e-9, "предел 250 мс");
  const q = createRemote(); q.push(P({ seq: 1, x: 0, z: 0, v: 20, yaw: Math.PI / 2 }), 1000);
  const s = q.sample(1000 + D + 100); near(s.x, 0, 1e-9, "x"); near(s.z, -2, 1e-9, "z уменьшается при курсе π/2");
});

test("задний ход: назад по курсу", () => {
  const r = createRemote(); r.push(P({ seq: 1, x: 0, v: -10, yaw: 0 }), 1000);
  near(r.sample(1000 + D + 100).x, -1, 1e-9, "x");
});

test("давно молчащий игрок пропадает (null)", () => {
  const r = createRemote(); r.push(P({ seq: 1 }), 1000);
  assert.notEqual(r.sample(1000 + 2000), null);
  assert.equal(r.sample(1000 + 2600), null);
});

test("прыжок дальше 150 м (возрождение) — без «пролёта» через карту", () => {
  const r = createRemote(); r.push(P({ seq: 1, x: 0 }), 1000); r.push(P({ seq: 2, x: 1000 }), 1100);
  assert.equal(r.sample(1025 + D).x, 0); assert.equal(r.sample(1075 + D).x, 1000);
  r.push(P({ seq: 3, x: 1100 }), 1200);                                    // обычное движение (100 м) — интерполируется
  near(r.sample(1150 + D).x, 1050, 1e-9, "обычный шаг");
});

test("запрос ровно в момент прихода последней позы даёт её, а не ошибку", () => {
  const r = createRemote(); r.push(P({ seq: 1, x: 0 }), 1000); r.push(P({ seq: 2, x: 10 }), 1100);
  assert.equal(r.sample(1100 + D).x, 10);
});

test("возрождение определяется по расстоянию на карте: скачок только по z — тоже скачок", () => {
  const r = createRemote(); r.push(P({ seq: 1, z: 0 }), 1000); r.push(P({ seq: 2, z: 1000 }), 1100);
  assert.equal(r.sample(1025 + D).z, 0); assert.equal(r.sample(1075 + D).z, 1000);
});

test("флаги берутся от ближайшей по времени позы", () => {
  const r = createRemote(); r.push(P({ seq: 1, flags: 1 }), 1000); r.push(P({ seq: 2, flags: 4 }), 1100);
  assert.equal(r.sample(1040 + D).flags, 1); assert.equal(r.sample(1060 + D).flags, 4);
});

test("хранится ограниченное число поз; запрос раньше самой старой хранимой даёт её", () => {
  const r = createRemote();
  for (let i = 0; i < 30; i++) r.push(P({ seq: i, x: i }), 1000 + i * 100);
  assert.equal(r.size(), 8);
  assert.equal(r.sample(1000 + D).x, 22);                                    // осталось с 22-й
});

test("позы с одним временем прихода не дают деления на ноль", () => {
  const r = createRemote(); r.push(P({ seq: 1, x: 0 }), 1000); r.push(P({ seq: 2, x: 10 }), 1000);
  const s = r.sample(1000 + D); assert.ok(Number.isFinite(s.x));
});

test("не-числа в позе отбрасываются на входе", () => {
  const r = createRemote(); r.push(P({ seq: 1, x: NaN }), 1000); r.push(P({ seq: 2, v: Infinity }), 1010); r.push(null, 1020); r.push({}, 1030);
  r.push(P({ seq: NaN }), 1040); r.push(P({ seq: 1.5 }), 1050); r.push(P({ seq: "1" }), 1060);
  assert.equal(r.size(), 0); assert.equal(r.sample(2000), null);
});

test("настройки: другая задержка и предел экстраполяции", () => {
  const r = createRemote({ delayMs: 0, extrapolateMs: 50 }); r.push(P({ seq: 1, x: 0, v: 100 }), 1000);
  near(r.sample(1000 + 1000).x, 5, 1e-9, "предел 50 мс при скорости 100");
});
