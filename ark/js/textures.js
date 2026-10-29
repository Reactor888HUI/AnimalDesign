(function (A) {
  // ===================================================================================================
  //  Everything the Ark looks like is drawn here, in code: floors, walls, plaques, the landscapes behind
  //  the windows. No picture files: the page is one self-contained piece of work (Blender is not
  //  connected to this session, so models are built from primitives in build.js).
  // ===================================================================================================
  const T = THREE, R = A.rng, TX = A.tex = {};
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const tex = (c, rep, srgb) => {
    const t = new T.CanvasTexture(c);
    if (srgb !== false) t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    return t;
  };
  TX.canvas = canvas; TX.tex = tex;

  TX.wood = rep => {
    const c = canvas(512, 512), g = c.getContext('2d'), r = R(5);
    for (let i = 0; i < 8; i++) {
      const x = i * 64;
      g.fillStyle = 'hsl(' + (26 + r() * 7) + ',' + (42 + r() * 12) + '%,' + (30 + r() * 10) + '%)'; g.fillRect(x, 0, 64, 512);
      for (let k = 0; k < 24; k++) {
        g.strokeStyle = 'rgba(50,25,8,' + (0.05 + r() * 0.08) + ')'; g.beginPath(); const y = r() * 512;
        g.moveTo(x, y); g.bezierCurveTo(x + 20, y + r() * 30 - 15, x + 40, y + r() * 30 - 15, x + 64, y + r() * 20 - 10); g.stroke();
      }
      g.fillStyle = 'rgba(25,12,4,.55)'; g.fillRect(x, 0, 2, 512);
      for (let k = 0; k < 2; k++) g.fillRect(x, r() * 512, 64, 2);
    }
    return tex(c, rep);
  };
  TX.plaster = (rep, base) => {
    const c = canvas(256, 256), g = c.getContext('2d'), r = R(9);
    g.fillStyle = base || '#e9e1d2'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1800; i++) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '255,255,255' : '120,100,80') + ',' + (0.02 + r() * 0.04) + ')'; g.fillRect(r() * 256, r() * 256, 2 + r() * 5, 2 + r() * 5); }
    return tex(c, rep);
  };
  TX.marble = rep => {
    const c = canvas(512, 512), g = c.getContext('2d'), r = R(21);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? '#d9d4c8' : '#f1ece0'; g.fillRect(x * 256, y * 256, 256, 256);
      g.save(); g.beginPath(); g.rect(x * 256, y * 256, 256, 256); g.clip();
      for (let k = 0; k < 7; k++) { g.strokeStyle = 'rgba(110,105,95,' + (0.08 + r() * 0.12) + ')'; g.lineWidth = 0.6 + r() * 1.2; g.beginPath(); let px = x * 256 + r() * 256, py = y * 256; g.moveTo(px, py); for (let s = 0; s < 8; s++) { px += r() * 40 - 20; py += 34; g.lineTo(px, py); } g.stroke(); }
      g.restore();
    }
    g.strokeStyle = 'rgba(60,55,45,.5)'; g.lineWidth = 2; g.strokeRect(0, 0, 512, 512); g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 512); g.moveTo(0, 256); g.lineTo(512, 256); g.stroke();
    return tex(c, rep);
  };
  TX.rug = (c1, c2) => {
    const c = canvas(512, 512), g = c.getContext('2d');
    g.fillStyle = c1; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = c2; g.lineWidth = 10; g.strokeRect(14, 14, 484, 484); g.lineWidth = 3; g.strokeRect(34, 34, 444, 444);
    g.fillStyle = c2; g.globalAlpha = 0.5;
    for (let i = 0; i < 5; i++) { const s = 200 - i * 36; g.save(); g.translate(256, 256); g.rotate(Math.PI / 4); g.strokeStyle = c2; g.lineWidth = 3; g.strokeRect(-s / 2, -s / 2, s, s); g.restore(); }
    g.beginPath(); g.arc(256, 256, 48, 0, 7); g.fill();
    return tex(c);
  };
  // letters on a plate (plaques, signs, screens): returns a texture of the given pixel size
  TX.plate = (text, o) => {
    o = o || {};
    const w = o.w || 512, h = o.h || 128, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = o.bg || '#b8913c'; g.fillRect(0, 0, w, h);
    if (o.bg !== 'none') {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,.25)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,.25)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(60,40,10,.7)'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    } else g.clearRect(0, 0, w, h);
    g.fillStyle = o.fg || '#2a1c08'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = String(text).split('\n'), fs = o.size || Math.min(h / (lines.length + 0.6), 60);
    g.font = (o.weight || '700') + ' ' + fs + 'px ' + (o.font || 'Georgia, "Times New Roman", serif');
    lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * fs * 1.15));
    return tex(c);
  };
  TX.spine = () => {
    const c = canvas(64, 128), g = c.getContext('2d');
    g.fillStyle = '#d6d6d6'; g.fillRect(0, 0, 64, 128);
    g.fillStyle = '#ffffff'; g.fillRect(0, 10, 64, 5); g.fillRect(0, 113, 64, 5); g.fillRect(0, 24, 64, 2); g.fillRect(0, 102, 64, 2);
    g.fillStyle = '#f4f4f4'; g.fillRect(16, 42, 32, 4); g.fillRect(20, 52, 24, 3);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, 3, 128);
    return tex(c);
  };
  TX.globe = () => {
    const c = canvas(512, 256), g = c.getContext('2d'), r = R(77);
    let gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#2a6fb0'); gr.addColorStop(0.5, '#1f5f9f'); gr.addColorStop(1, '#2a6fb0'); g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#5fa04a';
    for (let i = 0; i < 14; i++) { const x = r() * 512, y = 40 + r() * 170; g.beginPath(); for (let k = 0; k < 9; k++) { const a = k / 9 * 6.283, rr = 14 + r() * 36; g.lineTo(x + Math.cos(a) * rr * 1.5, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }
    g.fillStyle = '#eef3f7'; g.fillRect(0, 0, 512, 14); g.fillRect(0, 242, 512, 14);
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1; for (let x = 0; x < 512; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); } for (let y = 0; y < 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
    return tex(c);
  };
  // the poster of the Ark: a net of nodes (knowledge) on dark paper
  TX.poster = () => {
    const c = canvas(512, 768), g = c.getContext('2d'), r = R(31);
    g.fillStyle = '#16233a'; g.fillRect(0, 0, 512, 768);
    const pts = []; for (let i = 0; i < 46; i++) pts.push([40 + r() * 432, 120 + r() * 560]);
    g.strokeStyle = 'rgba(160,200,255,.35)'; g.lineWidth = 1.2;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) < 110) { g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[j][0], pts[j][1]); g.stroke(); }
    for (const p of pts) { g.fillStyle = r() < 0.2 ? '#ffd36a' : '#bcd8ff'; g.beginPath(); g.arc(p[0], p[1], 3 + r() * 5, 0, 7); g.fill(); }
    g.fillStyle = '#ffd36a'; g.textAlign = 'center'; g.font = '700 54px Georgia, serif'; g.fillText('КОВЧЕГ', 256, 78); g.font = '24px Georgia, serif'; g.fillStyle = '#bcd8ff'; g.fillText('карта знаний', 256, 112);
    g.strokeStyle = '#b8913c'; g.lineWidth = 6; g.strokeRect(10, 10, 492, 748);
    return tex(c);
  };
  TX.stars = () => {
    const c = canvas(512, 512), g = c.getContext('2d'), r = R(41);
    g.fillStyle = '#0d1630'; g.fillRect(0, 0, 512, 512);
    for (let k = 0; k < 6; k++) { const st = []; const cx = 60 + r() * 390, cy = 60 + r() * 390; for (let i = 0; i < 5; i++) st.push([cx + r() * 120 - 60, cy + r() * 120 - 60]); g.strokeStyle = 'rgba(180,210,255,.5)'; g.beginPath(); st.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); for (const p of st) { g.fillStyle = '#fff'; g.beginPath(); g.arc(p[0], p[1], 3, 0, 7); g.fill(); } }
    g.strokeStyle = '#b8913c'; g.lineWidth = 8; g.strokeRect(4, 4, 504, 504);
    return tex(c);
  };
  TX.belt = () => {
    const c = canvas(64, 128), g = c.getContext('2d');
    g.fillStyle = '#2a2d33'; g.fillRect(0, 0, 64, 128); g.fillStyle = '#3d424b'; for (let y = 0; y < 128; y += 16) g.fillRect(0, y, 64, 8);
    g.fillStyle = '#ffd36a'; g.fillRect(0, 0, 4, 128); g.fillRect(60, 0, 4, 128);
    return tex(c, [1, 6]);
  };
  TX.glass = () => {   // the stained glass at the end of the hall
    const c = canvas(512, 512), g = c.getContext('2d'), r = R(61);
    g.fillStyle = '#1b2440'; g.fillRect(0, 0, 512, 512);
    const cols = ['#d94a4a', '#e8b83a', '#4aa86a', '#3a82d9', '#a45ad9', '#e87a3a'];
    for (let ring = 0; ring < 4; ring++) for (let k = 0; k < 8 + ring * 4; k++) {
      const a0 = k / (8 + ring * 4) * 6.283, a1 = (k + 1) / (8 + ring * 4) * 6.283, r0 = 40 + ring * 54, r1 = r0 + 50;
      g.fillStyle = cols[Math.floor(r() * cols.length)]; g.beginPath(); g.arc(256, 256, r1, a0, a1); g.arc(256, 256, r0, a1, a0, true); g.closePath(); g.fill();
      g.strokeStyle = '#10152a'; g.lineWidth = 5; g.stroke();
    }
    g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(256, 256, 34, 0, 7); g.fill();
    return tex(c);
  };
  TX.pegboard = () => {
    const c = canvas(256, 256), g = c.getContext('2d');
    g.fillStyle = '#7a5a3a'; g.fillRect(0, 0, 256, 256); g.fillStyle = 'rgba(30,18,8,.55)';
    for (let y = 8; y < 256; y += 16) for (let x = 8; x < 256; x += 16) { g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
    return tex(c, [3, 2]);
  };

  // ---- the landscapes behind the windows: 3072 x 768, horizon at 62 % -------------------------------------
  // each painter is a generator: it paints one layer, yields, paints the next (so a frame is never stalled long)
  const HY = 0.62;
  function ridge(g, w, h, y0, amp, seed, fill, rough) {
    const r = R(seed), ph = [r() * 6, r() * 6, r() * 6, r() * 6];
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) {
      const t = x / w * Math.PI * 2, v = Math.sin(t * 3 + ph[0]) * 0.5 + Math.sin(t * 7 + ph[1]) * 0.3 + Math.sin(t * 17 + ph[2]) * 0.15 * rough + Math.sin(t * 41 + ph[3]) * 0.07 * rough;
      g.lineTo(x, y0 - amp * (v * 0.5 + 0.5));
    }
    g.lineTo(w, h); g.closePath(); g.fillStyle = fill; g.fill();
  }
  function glow(g, x, y, r, c0, c1) { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, c0); rg.addColorStop(1, c1 || 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); }
  function mirror(g, w, h, hy, alpha) { g.save(); g.translate(0, hy * 2); g.scale(1, -1); g.globalAlpha = alpha; g.drawImage(g.canvas, 0, 0, w, hy, 0, 0, w, hy); g.restore(); }
  function stars(g, w, y1, n, seed, a) { const r = R(seed); for (let i = 0; i < n; i++) { g.fillStyle = 'rgba(255,255,255,' + (a * (0.2 + r() * 0.8)) + ')'; const s = r() < 0.04 ? 3 : r() < 0.2 ? 2 : 1; g.fillRect(r() * w, r() * y1, s, s); } }
  function lin(g, x0, y0, x1, y1, stops) { const gr = g.createLinearGradient(x0, y0, x1, y1); for (const s of stops) gr.addColorStop(s[0], s[1]); return gr; }

  const P = TX.paint = {};
  P.dawn = function* (g, w, h) {
    const hy = h * HY, r = R(101);
    g.fillStyle = lin(g, 0, 0, 0, hy, [[0, '#26336a'], [0.45, '#7a69a8'], [0.8, '#f0a3a0'], [1, '#ffdca4']]); g.fillRect(0, 0, w, hy + 1);
    stars(g, w, hy * 0.45, 260, 3, 0.5);
    glow(g, w * 0.56, hy - 8, w * 0.2, 'rgba(255,244,210,.95)', 'rgba(255,170,120,0)'); yield;
    for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(255,' + (150 + r() * 70) + ',' + (140 + r() * 60) + ',' + (0.1 + r() * 0.18) + ')'; g.beginPath(); g.ellipse(r() * w, hy * (0.25 + r() * 0.6), 80 + r() * 260, 5 + r() * 12, 0, 0, 7); g.fill(); } yield;
    ridge(g, w, h, hy, h * 0.14, 11, '#a58fba', 1); ridge(g, w, h, hy, h * 0.19, 23, '#74679b', 1.2); yield;
    ridge(g, w, h, hy, h * 0.15, 37, '#443f6e', 1.4);
    g.fillStyle = lin(g, 0, hy, 0, h, [[0, '#f2b9a2'], [0.35, '#8083b3'], [1, '#222a52']]); g.fillRect(0, hy, w, h - hy); yield;
    mirror(g, w, h, hy, 0.4);
    g.fillStyle = lin(g, 0, hy, 0, h, [[0, 'rgba(255,200,160,.35)'], [1, 'rgba(20,24,60,.7)']]); g.fillRect(0, hy, w, h - hy);
    for (let i = 0; i < 120; i++) { g.fillStyle = 'rgba(255,230,190,' + (0.06 + r() * 0.14) + ')'; g.fillRect(w * 0.56 + (r() - 0.5) * w * 0.12 * (i / 60), hy + 6 + r() * (h - hy) * 0.8, 20 + r() * 80, 2); } yield;
    for (let i = 0; i < 90; i++) { const x = r() < 0.5 ? r() * w * 0.12 : w - r() * w * 0.12, hh = 40 + r() * 140, ww = 10 + hh * 0.22, y = h - 4; g.fillStyle = '#10142c'; g.beginPath(); g.moveTo(x - ww, y); g.lineTo(x, y - hh); g.lineTo(x + ww, y); g.closePath(); g.fill(); }
  };
  P.sea = function* (g, w, h) {
    const hy = h * HY, r = R(202);
    g.fillStyle = lin(g, 0, 0, 0, hy, [[0, '#2b2152'], [0.5, '#b04a6c'], [0.85, '#ff8a4a'], [1, '#ffd27a']]); g.fillRect(0, 0, w, hy + 1);
    stars(g, w, hy * 0.3, 120, 8, 0.4);
    glow(g, w * 0.5, hy - 14, w * 0.3, 'rgba(255,220,150,.9)', 'rgba(255,120,60,0)'); yield;
    for (let i = 0; i < 22; i++) { g.fillStyle = (i % 3 ? 'rgba(255,110,80,' : 'rgba(60,30,80,') + (0.18 + r() * 0.2) + ')'; g.beginPath(); g.ellipse(r() * w, hy * (0.3 + r() * 0.62), 180 + r() * 420, 4 + r() * 10, 0, 0, 7); g.fill(); } yield;
    g.fillStyle = lin(g, 0, hy - 90, 0, hy, [[0, '#fff0c0'], [1, '#ffb050']]); g.beginPath(); g.arc(w * 0.5, hy - 12, h * 0.075, 0, 7); g.fill();
    ridge(g, w * 0.25, h, hy + 4, h * 0.04, 51, '#4a2a55', 1.5);
    g.fillStyle = lin(g, 0, hy, 0, h, [[0, '#ff9a5a'], [0.2, '#c0587a'], [0.6, '#3b2a58'], [1, '#14173a']]); g.fillRect(0, hy, w, h - hy); yield;
    for (let i = 0; i < 700; i++) { const t = r(), y = hy + 4 + t * (h - hy) * 0.9, sp = 20 + t * w * 0.07; g.fillStyle = 'rgba(255,' + (200 + r() * 40) + ',140,' + (0.12 + r() * 0.35 * (1 - t * 0.5)) + ')'; g.fillRect(w * 0.5 + (r() - 0.5) * sp, y, 6 + r() * 30 * (0.3 + t), 1 + t * 2); }
    for (let i = 0; i < 160; i++) { g.fillStyle = 'rgba(20,18,60,' + (0.08 + r() * 0.12) + ')'; g.fillRect(r() * w, hy + 10 + r() * (h - hy), 40 + r() * 160, 2); } yield;
    // a palm on the left
    g.strokeStyle = '#120a1c'; g.lineWidth = 9; g.beginPath(); g.moveTo(w * 0.04, h); g.bezierCurveTo(w * 0.045, h * 0.8, w * 0.06, h * 0.62, w * 0.075, h * 0.5); g.stroke();
    for (let k = 0; k < 8; k++) { const a = -0.3 + k * 0.55 - 0.9; g.lineWidth = 5; g.beginPath(); g.moveTo(w * 0.075, h * 0.5); g.quadraticCurveTo(w * 0.075 + Math.cos(a) * 90, h * 0.5 + Math.sin(a) * 60 - 50, w * 0.075 + Math.cos(a) * 190, h * 0.5 + Math.sin(a) * 100 + 30); g.stroke(); }
  };
  P.aurora = function* (g, w, h) {
    const hy = h * HY, r = R(303);
    g.fillStyle = lin(g, 0, 0, 0, hy, [[0, '#02050f'], [0.7, '#081a2e'], [1, '#12354a']]); g.fillRect(0, 0, w, hy + 1);
    stars(g, w, hy * 0.95, 900, 13, 0.9); yield;
    g.globalCompositeOperation = 'lighter';
    const cols = [[70, 255, 160], [60, 220, 255], [170, 110, 255]];
    for (let b = 0; b < 4; b++) {
      const c = cols[b % 3], x0 = w * (0.08 + b * 0.04), len = w * (0.5 + r() * 0.3), ph = r() * 6, amp = hy * (0.06 + r() * 0.08), base = hy * (0.55 + r() * 0.1);
      for (let x = 0; x < len; x += 3) {
        const t = x / len, y = base - hy * 0.2 * Math.sin(t * 3.1 + ph) - amp * Math.sin(t * 9 + ph * 2), top = y - hy * (0.22 + 0.2 * Math.sin(t * 5 + ph)), env = Math.sin(Math.PI * t);
        const gr = g.createLinearGradient(0, top, 0, y); gr.addColorStop(0, 'rgba(' + c.join(',') + ',0)'); gr.addColorStop(0.7, 'rgba(' + c.join(',') + ',' + 0.22 * env + ')'); gr.addColorStop(1, 'rgba(' + c.join(',') + ',' + 0.4 * env + ')');
        g.fillStyle = gr; g.fillRect(x0 + x, top, 3, y - top);
      }
    }
    g.globalCompositeOperation = 'source-over'; yield;
    ridge(g, w, h, hy, h * 0.17, 61, '#1d3350', 1.4); ridge(g, w, h, hy, h * 0.13, 73, '#122238', 1.2); ridge(g, w, h, hy + 6, h * 0.08, 91, '#0a1424', 1.5);
    for (let i = 0; i < 200; i++) { g.fillStyle = 'rgba(220,235,255,' + (0.05 + r() * 0.2) + ')'; const x = r() * w; g.fillRect(x, hy - h * (0.04 + r() * 0.16), 6 + r() * 14, 2); } yield;
    g.fillStyle = lin(g, 0, hy, 0, h, [[0, '#0f2f45'], [1, '#050c18']]); g.fillRect(0, hy, w, h - hy);
    mirror(g, w, h, hy, 0.3); g.fillStyle = 'rgba(4,10,22,.35)'; g.fillRect(0, hy, w, h - hy);
  };
  P.forest = function* (g, w, h) {
    const hy = h * HY, r = R(404);
    g.fillStyle = lin(g, 0, 0, 0, hy, [[0, '#a9cde8'], [0.7, '#e6eadb'], [1, '#fbeed0']]); g.fillRect(0, 0, w, hy + 1);
    glow(g, w * 0.3, hy * 0.5, w * 0.25, 'rgba(255,248,215,.55)', 'rgba(255,248,215,0)');
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.15 + r() * 0.25) + ')'; g.beginPath(); g.ellipse(r() * w, hy * (0.15 + r() * 0.5), 120 + r() * 320, 10 + r() * 24, 0, 0, 7); g.fill(); } yield;
    ridge(g, w, h, hy, h * 0.1, 111, '#a9b896', 1); ridge(g, w, h, hy + 6, h * 0.09, 123, '#c7a066', 1.2);
    g.fillStyle = 'rgba(250,240,220,.5)'; g.fillRect(0, hy - 24, w, 30); yield;
    g.fillStyle = lin(g, 0, hy, 0, h, [[0, '#8a6a3a'], [1, '#3a2a18']]); g.fillRect(0, hy + 4, w, h - hy);
    const AUT = ['#d9822b', '#c4452d', '#e8b83a', '#8b3a1f', '#7a8a2e', '#e07a30', '#b8a030'];
    for (let l = 0; l < 4; l++) {
      const by = hy + [6, 22, 60, 130][l], n = [260, 190, 120, 60][l], rad = [9, 15, 26, 46][l];
      for (let i = 0; i < n; i++) {
        const x = r() * w, y = by + r() * 14, rr = rad * (0.7 + r() * 0.7);
        g.fillStyle = '#3a2412'; g.fillRect(x - 1.5, y, 3 + l, rr * 1.4);
        g.fillStyle = AUT[Math.floor(r() * AUT.length)]; g.beginPath(); g.arc(x, y, rr, 0, 7); g.arc(x - rr * 0.5, y + rr * 0.3, rr * 0.7, 0, 7); g.arc(x + rr * 0.5, y + rr * 0.3, rr * 0.7, 0, 7); g.fill();
      }
      yield;
    }
    for (let i = 0; i < 700; i++) { g.fillStyle = AUT[Math.floor(r() * AUT.length)]; g.fillRect(r() * w, hy + 90 + r() * (h - hy - 90), 3 + r() * 5, 2 + r() * 3); }
  };
  P.desert = function* (g, w, h) {
    const hy = h * HY, r = R(505);
    g.fillStyle = lin(g, 0, 0, 0, hy, [[0, '#4f9cee'], [0.6, '#bfe0ff'], [1, '#fcebc4']]); g.fillRect(0, 0, w, hy + 1);
    glow(g, w * 0.62, hy * 0.36, w * 0.22, 'rgba(255,255,240,.95)', 'rgba(255,250,220,0)');
    g.fillStyle = '#fffbe8'; g.beginPath(); g.arc(w * 0.62, hy * 0.36, h * 0.04, 0, 7); g.fill(); yield;
    ridge(g, w, h, hy, h * 0.05, 131, '#e3c79a', 1);
    g.fillStyle = '#d4b184'; g.beginPath(); g.moveTo(w * 0.2, hy); g.lineTo(w * 0.235, hy - h * 0.1); g.lineTo(w * 0.27, hy); g.fill(); g.beginPath(); g.moveTo(w * 0.26, hy); g.lineTo(w * 0.28, hy - h * 0.06); g.lineTo(w * 0.3, hy); g.fill(); yield;
    const D = [['#ebc47e', '#c9964e'], ['#dca95c', '#b07a38'], ['#c98f46', '#9a6428'], ['#ad7438', '#7c4c1c']];
    for (let l = 0; l < 4; l++) {
      ridge(g, w, h, hy + [6, 36, 86, 160][l], h * [0.07, 0.09, 0.12, 0.16][l], 140 + l, D[l][0], 0.5);
      g.save(); g.globalAlpha = 0.22; g.translate(w * 0.012, 0); ridge(g, w, h, hy + [6, 36, 86, 160][l] + 3, h * [0.07, 0.09, 0.12, 0.16][l], 140 + l, D[l][1], 0.5); g.restore(); yield;
    }
    g.fillStyle = 'rgba(255,240,200,.35)'; g.fillRect(0, hy - 10, w, 24);
  };
  P.space = function* (g, w, h) {
    const hy = h * HY, r = R(606);
    g.fillStyle = '#02030a'; g.fillRect(0, 0, w, h);
    const NB = [['106,47,168', 0.28], ['29,122,154', 0.22], ['190,70,130', 0.16], ['60,80,200', 0.2]];
    for (let i = 0; i < 9; i++) { const n = NB[i % 4]; glow(g, r() * w, r() * hy, w * (0.1 + r() * 0.12), 'rgba(' + n[0] + ',' + n[1] + ')', 'rgba(' + n[0] + ',0)'); } yield;
    stars(g, w, hy, 1600, 17, 1); for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * hy; glow(g, x, y, 14, 'rgba(255,255,255,.7)', 'rgba(255,255,255,0)'); } yield;
    const px = w * 0.3, py = hy * 0.58, pr = h * 0.2;
    g.save(); g.beginPath(); g.arc(px, py, pr, 0, 7); g.clip();
    g.fillStyle = lin(g, px - pr, py - pr, px + pr, py + pr, [[0, '#f0c488'], [0.5, '#c07a48'], [1, '#6a3220']]); g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(' + (i % 2 ? '255,230,190' : '90,40,20') + ',' + (0.12 + r() * 0.18) + ')'; g.fillRect(px - pr, py - pr + i * pr / 6 + r() * 8, pr * 2, 6 + r() * 14); }
    glow(g, px + pr * 0.6, py + pr * 0.4, pr * 1.9, 'rgba(0,0,0,0)', 'rgba(0,0,10,.8)'); g.restore();
    g.strokeStyle = 'rgba(230,200,150,.55)'; g.lineWidth = 10; g.beginPath(); g.ellipse(px, py, pr * 1.7, pr * 0.32, -0.25, Math.PI, Math.PI * 2); g.stroke();
    g.lineWidth = 5; g.beginPath(); g.ellipse(px, py, pr * 1.45, pr * 0.27, -0.25, Math.PI, Math.PI * 2); g.stroke();
    g.fillStyle = lin(g, w * 0.78, hy * 0.2, w * 0.82, hy * 0.3, [[0, '#9ac8ff'], [1, '#1a3a7a']]); g.beginPath(); g.arc(w * 0.78, hy * 0.25, h * 0.045, 0, 7); g.fill(); yield;
    g.fillStyle = lin(g, 0, hy, 0, h, [[0, '#3a4058'], [1, '#080a14']]); g.fillRect(0, hy, w, h - hy);
    for (let i = 0; i < 70; i++) { const x = r() * w, y = hy + 8 + r() * (h - hy - 10), s = 14 + (y - hy) * 0.5 * r(); g.fillStyle = 'rgba(8,10,20,.6)'; g.beginPath(); g.ellipse(x, y, s, s * 0.28, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(160,180,220,.28)'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, s, s * 0.28, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    ridge(g, w, h, hy + 2, h * 0.025, 77, '#2a2f45', 1.5);
  };
  TX.landscapeSize = [3072, 768];
  // paints a landscape on a canvas in slices (one timeout per layer); resolves with the canvas
  TX.paintAsync = id => new Promise(done => {
    const c = canvas(TX.landscapeSize[0], TX.landscapeSize[1]), g = c.getContext('2d'), it = P[id](g, c.width, c.height);
    const step = () => { if (it.next().done) done(c); else setTimeout(step, 8); };
    setTimeout(step, 0);
  });
  TX.paintNow = id => { const c = canvas(TX.landscapeSize[0], TX.landscapeSize[1]), it = P[id](c.getContext('2d'), c.width, c.height); while (!it.next().done); return c; };
  TX.horizon = HY;
})(globalThis.Ark = globalThis.Ark || {});
