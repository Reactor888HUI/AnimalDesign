(function (R) {
  const C = {
    ROAD_W: 7, CURB_W: 1.4, CHUNK: 52, INT: 9, SIDE_LEN: 18,
    MAX_SPEED: 16, ACCEL: 24, BRAKE: 32, COAST: 5,
    TURN_RATE: 2.3, GRIP_LOW: 12, GRIP_HIGH: 4.2,
    JUMP_V: 7.4, GRAVITY: 19,
    CAT_BASE: 7.5, CAT_FLEE: 14.2, CAT_RANGE: 24,
    CHUNK_RADIUS: 5,
    DOG_LEN: 2.2,
    MODEL_YAW: Math.PI,
  };
  C.BLDG_X = C.ROAD_W / 2 + C.CURB_W;
  C.MAIN_LIMIT = C.ROAD_W / 2 + C.CURB_W - 0.35;
  C.SIDE_LIMIT = C.BLDG_X + C.SIDE_LEN - 0.7;
  R.C = C;

  R.THEMES = {
    night: {
      skyTop: '#04060d', skyMid: '#0d1428', horizon: '#1b2342', fog: 0x1b2342, fogDensity: 0.019,
      hemiSky: 0x3a4c9a, hemiGround: 0x10121c, hemiI: 1.0,
      sunColor: 0x7d94ff, sunI: 0.6, sunOffset: [-26, 48, 30],
      exposure: 0.95, lamps: true, stars: true, dust: 0x8a8fa8,
    },
    day: {
      skyTop: '#4d9be0', skyMid: '#8cc4ee', horizon: '#d6e9f5', fog: 0xd6e9f5, fogDensity: 0.0105,
      hemiSky: 0xd8ecff, hemiGround: 0x8c8272, hemiI: 1.05,
      sunColor: 0xfff0d2, sunI: 1.9, sunOffset: [34, 60, 22],
      exposure: 1.05, lamps: false, stars: false, dust: 0xcfc6b4,
    },
  };
})(window.R = window.R || {});
