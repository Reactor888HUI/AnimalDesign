// «Восьмёрка Баклажан» — поза машины для сети: 24 байта. Чистая логика, без доступа к игре; проверяется tests/unit/pose.test.js.
// Работает и в игре (классический скрипт, имена попадают в общую область), и в Node (module.exports). Подключение к игре — этап 3 плана (docs/ROADMAP.md).
"use strict";
(function (root) {
  const POSE_BYTES = 24, POSE_TYPE = 1, VMAX = 120;
  const FLAG = Object.freeze({ AIR: 1, BRAKE: 2, SKID: 4, WALL: 8, TUBE: 16, PRO: 32 });
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const wrap = a => a - TAU * Math.floor((a + Math.PI) / TAU);          // угол → [−π, π)
  const toU16 = (v, lo, hi) => Math.round((clamp(v, lo, hi) - lo) / (hi - lo) * 65535);
  const fromU16 = (n, lo, hi) => lo + n / 65535 * (hi - lo);
  const FIELDS = ["x", "y", "z", "yaw", "pitch", "roll", "v", "steer"];

  function encodePose(p, w) {
    for (const k of FIELDS) if (!Number.isFinite(p[k])) throw new RangeError(`поза: поле ${k} не число (${p[k]})`);
    const b = new Uint8Array(POSE_BYTES), d = new DataView(b.buffer);
    d.setUint8(0, POSE_TYPE); d.setUint16(1, p.seq & 0xffff);
    d.setUint16(3, toU16(p.x, w.x0, w.x1)); d.setUint16(5, toU16(p.y, w.y0, w.y1)); d.setUint16(7, toU16(p.z, w.z0, w.z1));
    d.setUint16(9, toU16(wrap(p.yaw), -Math.PI, Math.PI)); d.setUint16(11, toU16(wrap(p.pitch), -Math.PI, Math.PI)); d.setUint16(13, toU16(wrap(p.roll), -Math.PI, Math.PI));
    d.setInt16(15, Math.round(clamp(p.v, -VMAX, VMAX) / VMAX * 32767)); d.setInt8(17, Math.round(clamp(p.steer, -1, 1) * 127));
    d.setUint8(18, p.flags & 0xff); d.setUint32(19, p.t >>> 0);
    return b;
  }

  function decodePose(bytes, w) {
    if (!(bytes instanceof Uint8Array) || bytes.length !== POSE_BYTES || bytes[0] !== POSE_TYPE) return null;   // граница: чужие байты не проходят дальше
    const d = new DataView(bytes.buffer, bytes.byteOffset, POSE_BYTES);
    return {
      seq: d.getUint16(1), t: d.getUint32(19), flags: d.getUint8(18),
      x: fromU16(d.getUint16(3), w.x0, w.x1), y: fromU16(d.getUint16(5), w.y0, w.y1), z: fromU16(d.getUint16(7), w.z0, w.z1),
      yaw: fromU16(d.getUint16(9), -Math.PI, Math.PI), pitch: fromU16(d.getUint16(11), -Math.PI, Math.PI), roll: fromU16(d.getUint16(13), -Math.PI, Math.PI),
      v: d.getInt16(15) / 32767 * VMAX, steer: d.getInt8(17) / 127,
    };
  }

  const api = { POSE_BYTES, FLAG, encodePose, decodePose };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else Object.assign(root, api);
})(typeof globalThis !== "undefined" ? globalThis : this);
