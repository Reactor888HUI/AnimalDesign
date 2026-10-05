(function (R) {
  const C = {
    // city grid, meters: block + sidewalk + half of each neighbouring road = one cell
    B: 44, SW: 5, ROAD: 20,
    MAX_SPEED: 16, ACCEL: 24, BRAKE: 32, COAST: 5,
    TURN_RATE: 3.8, GRIP_LOW: 14, GRIP_HIGH: 7.5,
    JUMP_V: 9.4, GRAVITY: 22,
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
      skyTop: '#03050c', skyMid: '#0c1328', horizon: '#1f2748', fog: 0x1f2748, fogDensity: 0.0115,
      // a less saturated blue fill, so the warm lamp pools and windows stand out against it
      hemiSky: 0x5a6488, hemiGround: 0x26252b, hemiI: 1.0,
      sunColor: 0xb0bde8, sunI: 0.8, sunOffset: [-26, 48, 30],
      exposure: 1.0, lamps: true, stars: true, dust: 0x8a8fa8, spark: 0x9fd4ff,
      // post-processing: glow of lamps and windows, colour grade (cool shadows, warm lights), reflections on the dog's coat
      bloom: [0.5, 0.4, 0.86], grade: { sat: 1.02, vib: 0.3, contrast: 1.08, tint: [0.98, 0.98, 1.02], shadow: [0.95, 0.98, 1.06], high: [1.1, 1.01, 0.9], vig: 0.3 }, envI: 0.18,
      // far skyline: [colour, how much of it over the haze, lit windows]
      skyline: [[0x0c1122, 0.55, 0.35], [0x080b17, 0.8, 0.55]],
    },
    day: {
      skyTop: '#3586de', skyMid: '#83bdf0', horizon: '#d2e6f5', fog: 0xd2e6f5, fogDensity: 0.0068,
      hemiSky: 0xcfe5ff, hemiGround: 0x8c806a, hemiI: 0.78,
      sunColor: 0xffebc8, sunI: 1.45, sunOffset: [34, 60, 22],
      exposure: 1.0, lamps: false, stars: false, dust: 0xcfc6b4, spark: 0xffe9a8, clouds: true,
      bloom: [0.22, 0.35, 0.9], grade: { sat: 1.08, vib: 0.4, contrast: 1.08, tint: [1.02, 1.0, 0.97], shadow: [0.94, 0.98, 1.06], high: [1.05, 1.01, 0.95], vig: 0.16 }, envI: 0.65,
      skyline: [[0x8aa2bc, 0.16], [0x7890ab, 0.27]],
    },
  };
})(window.R = window.R || {});
