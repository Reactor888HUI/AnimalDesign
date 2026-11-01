// «Восьмёрка Баклажан» — чужая машина: из редких поз с дрожанием по времени получаем плавное положение.
// Показываем машину чуть «из прошлого» (интерполяция между двумя позами); если новых поз нет — ненадолго продолжаем по скорости.
// Чистая логика, время подставляется (мс по своим часам прихода): проверяется tests/unit/remote.test.js. Соглашения игры: x += cos(курс)·v, z −= sin(курс)·v.
"use strict";
(function (root) {
  const KEEP = 8, TAU = Math.PI * 2;
  const NUMBERS = ["x", "y", "z", "yaw", "pitch", "roll", "v", "steer"];
  const lerp = (a, b, k) => a + (b - a) * k;
  const lerpAngle = (a, b, k) => a + (b - a - TAU * Math.round((b - a) / TAU)) * k;
  const isNewer = (seq, last) => { const d = (seq - last) & 0xffff; return d >= 1 && d <= 0x7fff; };      // с переходом через 65535 → 0
  const usable = p => p && Number.isInteger(p.seq) && NUMBERS.every(k => Number.isFinite(p[k]));

  function blend(a, b, k, snap) {
    const near = k < 0.5 ? a : b;
    const out = { seq: near.seq, t: near.t, flags: near.flags };
    NUMBERS.forEach(f => { out[f] = lerp(a[f], b[f], k); });
    ["yaw", "pitch", "roll"].forEach(f => { out[f] = lerpAngle(a[f], b[f], k); });
    if (snap) { out.x = near.x; out.y = near.y; out.z = near.z; }
    return out;
  }

  function createRemote({ delayMs = 120, extrapolateMs = 250, snapDistance = 150, staleMs = 2500 } = {}) {
    const samples = [];                                  // { rx, pose } по возрастанию времени прихода
    return {
      size: () => samples.length,
      push(pose, rx) {
        if (!usable(pose)) return;
        const last = samples[samples.length - 1];
        if (last && !isNewer(pose.seq, last.pose.seq)) return;
        samples.push({ rx, pose });
        if (samples.length > KEEP) samples.shift();
      },
      sample(now) {
        const last = samples[samples.length - 1];
        if (!last || now - last.rx > staleMs) return null;
        const target = now - delayMs;
        if (target <= samples[0].rx) return { ...samples[0].pose };
        if (target >= last.rx) {
          const dt = Math.min(target - last.rx, extrapolateMs) / 1000, p = { ...last.pose };
          p.x += Math.cos(p.yaw) * p.v * dt; p.z -= Math.sin(p.yaw) * p.v * dt;
          return p;
        }
        const i = samples.findIndex((s, n) => samples[n + 1] && target < samples[n + 1].rx);
        const a = samples[i], b = samples[i + 1];
        const snap = Math.hypot(b.pose.x - a.pose.x, b.pose.z - a.pose.z) > snapDistance;
        return blend(a.pose, b.pose, (target - a.rx) / (b.rx - a.rx), snap);
      },
    };
  }

  const api = { createRemote };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else Object.assign(root, api);
})(typeof globalThis !== "undefined" ? globalThis : this);
