(function (R) {
  const C = {
    // city grid, meters: block + sidewalk + half of each neighbouring road = one cell
    B: 44, SW: 4, ROAD: 12,
    MAX_SPEED: 16, ACCEL: 24, BRAKE: 32, COAST: 5,
    TURN_RATE: 3.1, GRIP_LOW: 13, GRIP_HIGH: 4.6,
    JUMP_V: 7.4, GRAVITY: 19,
    CAT_BASE: 7, CAT_FLEE: 12.6, CAT_RANGE: 26,
    DOG_LEN: 1.15, CAT_LEN: 0.78, CHICKEN_H: 0.62,
    DOG_RADIUS: 0.4,
    MODEL_YAW: Math.PI,
    FAR_CELLS: 2,
  };
  C.P = C.B + 2 * C.SW + C.ROAD;
  R.C = C;

  R.THEMES = {
    night: {
      skyTop: '#04060d', skyMid: '#0d1428', horizon: '#1d2547', fog: 0x1d2547, fogDensity: 0.0125,
      hemiSky: 0x5a6cc0, hemiGround: 0x20222e, hemiI: 1.05,
      sunColor: 0x8aa0ff, sunI: 0.85, sunOffset: [-26, 48, 30],
      exposure: 1.0, lamps: true, stars: true, dust: 0x8a8fa8,
    },
    day: {
      skyTop: '#4d9be0', skyMid: '#8cc4ee', horizon: '#d6e9f5', fog: 0xd6e9f5, fogDensity: 0.0075,
      hemiSky: 0xd8ecff, hemiGround: 0x9a9080, hemiI: 1.0,
      sunColor: 0xfff0d2, sunI: 1.45, sunOffset: [34, 60, 22],
      exposure: 1.0, lamps: false, stars: false, dust: 0xcfc6b4,
    },
  };
})(window.R = window.R || {});
