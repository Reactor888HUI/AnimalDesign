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
      exposure: 1.0, lampK: 1, starK: 1, cloudK: 0, wet: 0.85, sunGlare: 0, rimK: 0.4, shadowK: 0.3, rays: 0, rayT: 0.8, dust: 0x8a8fa8, spark: 0x9fd4ff,
      cloudCol: 0x8890b0, sunGlowCol: 0xe6eeff, sunGlowS: 34,
      // post-processing: glow of lamps and windows, colour grade (cool shadows, warm lights), reflections on the dog's coat
      bloom: [0.5, 0.4, 0.86], grade: { sat: 1.02, vib: 0.3, contrast: 1.08, tint: [0.98, 0.98, 1.02], shadow: [0.95, 0.98, 1.06], high: [1.1, 1.01, 0.9], vig: 0.3 }, envI: 0.18,
      // far skyline: [colour, how much of it over the haze, lit windows]
      skyline: [[0x0c1122, 0.55, 0.35], [0x080b17, 0.8, 0.55]],
    },
    day: {
      skyTop: '#3586de', skyMid: '#83bdf0', horizon: '#d2e6f5', fog: 0xd2e6f5, fogDensity: 0.0068,
      hemiSky: 0xcfe5ff, hemiGround: 0x8c806a, hemiI: 0.78,
      sunColor: 0xffebc8, sunI: 1.45, sunOffset: [34, 60, 22],
      exposure: 1.0, lampK: 0, starK: 0, cloudK: 1, wet: 0.08, sunGlare: 0.15, rimK: 0.12, shadowK: 0.55, rays: 0.25, rayT: 0.82, dust: 0xcfc6b4, spark: 0xffe9a8,
      cloudCol: 0xffffff, sunGlowCol: 0xfff1c8, sunGlowS: 70,
      bloom: [0.22, 0.35, 0.9], grade: { sat: 1.08, vib: 0.4, contrast: 1.08, tint: [1.02, 1.0, 0.97], shadow: [0.94, 0.98, 1.06], high: [1.05, 1.01, 0.95], vig: 0.16 }, envI: 0.65,
      skyline: [[0x8aa2bc, 0.16], [0x7890ab, 0.27]],
    },
    // the sun low in the west: long shadows, warm light, pink and orange sky; the lamps come on
    sunset: {
      skyTop: '#2a3a7a', skyMid: '#c9708a', horizon: '#ffad6b', fog: 0xe9a477, fogDensity: 0.0085,
      hemiSky: 0xffbf9a, hemiGround: 0x4f3a3a, hemiI: 0.72,
      sunColor: 0xff9550, sunI: 1.55, sunOffset: [-72, 15, 18],
      exposure: 1.0, lampK: 0.65, starK: 0.1, cloudK: 1, wet: 0.55, sunGlare: 1, rimK: 0.95, shadowK: 0.5, rays: 1, rayT: 0.4, dust: 0xd9b094, spark: 0xffd27a,
      cloudCol: 0xffae94, sunGlowCol: 0xffa060, sunGlowS: 110,
      bloom: [0.38, 0.4, 0.84], grade: { sat: 1.1, vib: 0.35, contrast: 1.08, tint: [1.05, 0.98, 0.93], shadow: [0.92, 0.95, 1.08], high: [1.1, 1.0, 0.88], vig: 0.24 }, envI: 0.5,
      skyline: [[0x6a4060, 0.3, 0.12], [0x40283f, 0.55, 0.25]],
    },
    // early morning: cool blue above, peach at the horizon, the sun low in the east
    dawn: {
      skyTop: '#4a6fb8', skyMid: '#b9a4c8', horizon: '#ffd3ad', fog: 0xf1d0b6, fogDensity: 0.0085,
      hemiSky: 0xd8d4f0, hemiGround: 0x6a6058, hemiI: 0.78,
      sunColor: 0xffc8a0, sunI: 1.2, sunOffset: [70, 16, -20],
      exposure: 1.0, lampK: 0.3, starK: 0.15, cloudK: 0.8, wet: 0.5, sunGlare: 0.8, rimK: 0.55, shadowK: 0.42, rays: 0.7, rayT: 0.66, dust: 0xd8c8b8, spark: 0xffe4b0,
      cloudCol: 0xffd6dc, sunGlowCol: 0xffc8a0, sunGlowS: 95,
      bloom: [0.3, 0.38, 0.86], grade: { sat: 1.06, vib: 0.35, contrast: 1.05, tint: [1.02, 0.99, 0.98], shadow: [0.95, 0.97, 1.06], high: [1.06, 1.0, 0.94], vig: 0.2 }, envI: 0.55,
      skyline: [[0x8a86a8, 0.22, 0.08], [0x6e6a8e, 0.34, 0.15]],
    },
  };
  for (const k in R.THEMES) {
    const T = R.THEMES[k];
    T.name = k; T.lamps = T.lampK > 0.5; T.stars = T.starK > 0.5; T.clouds = T.cloudK > 0.02;
  }
})(window.R = window.R || {});
