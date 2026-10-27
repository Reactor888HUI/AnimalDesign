// Поза машины для сети: 24 байта туда и обратно. Тесты зовут код так же, как сеть: encodePose → байты → decodePose.
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { encodePose, decodePose, POSE_BYTES, FLAG } = require("../../arcade/lib/pose.js");

const WORLD = { x0: -580, x1: 3640, z0: -3800, z1: 260, y0: -20, y1: 220 };
const base = { seq: 7, t: 123456, x: 1010.5, y: 12.25, z: -3160.75, yaw: 1.2, pitch: -0.3, roll: 0.4, v: 31.7, steer: -0.5, flags: FLAG.AIR | FLAG.SKID };
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} против ${b}`);
const sameAngle = (a, b, tol, what) => near(Math.atan2(Math.sin(a - b), Math.cos(a - b)), 0, tol, what);

test("поза занимает ровно 24 байта", () => {
  const bytes = encodePose(base, WORLD);
  assert.equal(POSE_BYTES, 24);
  assert.equal(bytes.length, 24);
});

test("туда и обратно: положение, углы, скорость и флаги сохраняются с точностью до ширины шага", () => {
  const p = decodePose(encodePose(base, WORLD), WORLD);
  near(p.x, base.x, 0.07, "x"); near(p.y, base.y, 0.01, "y"); near(p.z, base.z, 0.07, "z");
  sameAngle(p.yaw, base.yaw, 0.001, "курс"); sameAngle(p.pitch, base.pitch, 0.001, "тангаж"); sameAngle(p.roll, base.roll, 0.001, "крен");
  near(p.v, base.v, 0.01, "скорость"); near(p.steer, base.steer, 0.01, "руль");
  assert.equal(p.flags, base.flags); assert.equal(p.seq, base.seq); assert.equal(p.t, base.t);
});

test("крен после нескольких бочек (больше полного оборота) приходит тем же положением машины", () => {
  const p = decodePose(encodePose({ ...base, roll: 3 * Math.PI + 0.4 }, WORLD), WORLD);
  sameAngle(p.roll, Math.PI + 0.4, 0.001, "крен");
});

test("положение за границами мира прижимается к границе, а не заворачивается на другой край", () => {
  const out = decodePose(encodePose({ ...base, x: 99999, z: -99999, y: 5000 }, WORLD), WORLD);
  near(out.x, WORLD.x1, 0.07, "x"); near(out.z, WORLD.z0, 0.07, "z"); near(out.y, WORLD.y1, 0.01, "y");
});

test("скорость и руль за пределами прижимаются к допустимому", () => {
  const p = decodePose(encodePose({ ...base, v: 9999, steer: -9 }, WORLD), WORLD);
  assert.ok(p.v <= 120 && p.v > 100, `скорость ${p.v}`); near(p.steer, -1, 0.01, "руль");
});

test("чужие байты не доходят до игры: неверная длина и неверный тип дают null", () => {
  const good = encodePose(base, WORLD);
  assert.equal(decodePose(good.slice(0, 23), WORLD), null);
  assert.equal(decodePose(new Uint8Array(25), WORLD), null);
  const wrongType = good.slice(); wrongType[0] = 99;
  assert.equal(decodePose(wrongType, WORLD), null);
  assert.equal(decodePose(null, WORLD), null);
  assert.equal(decodePose("строка", WORLD), null);
});

test("ошибка в физике (не число) не уходит в сеть молча: кодирование падает с понятной ошибкой", () => {
  assert.throws(() => encodePose({ ...base, x: NaN }, WORLD), /x/);
  assert.throws(() => encodePose({ ...base, v: Infinity }, WORLD), /v/);
});

test("пакет длиннее 24 байт не принимается, даже если начало верное", () => {
  const long = new Uint8Array(25); long.set(encodePose(base, WORLD));
  assert.equal(decodePose(long, WORLD), null);
});

test("все флаги, включая старшие (стена/труба/PRO), доходят без потерь", () => {
  const all = FLAG.AIR | FLAG.BRAKE | FLAG.SKID | FLAG.WALL | FLAG.TUBE | FLAG.PRO;
  assert.equal(decodePose(encodePose({ ...base, flags: all }, WORLD), WORLD).flags, all);
});

test("руль до упора приходит ровно как ±1 и 0 как 0", () => {
  const steer = s => decodePose(encodePose({ ...base, steer: s }, WORLD), WORLD).steer;
  assert.equal(steer(1), 1); assert.equal(steer(-1), -1); assert.equal(steer(0), 0);
});
