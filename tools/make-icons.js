// Renders the app icons from the whippet model (runner/whippet.html): the dog at full gallop
// against a sunset. Usage: node tools/make-icons.js [base-url]   (needs Playwright, a local server)
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const OUT = path.join(__dirname, '..', 'runner', 'icons');
const base = process.argv[2] || 'http://localhost:8765/';

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await page.goto(base + 'runner/whippet.html');
  await page.waitForFunction(() => window.__lab, null, { timeout: 60000 });
  await page.addStyleTag({ content: '#ui, #info { display: none !important; }' });
  // size: how much of the picture the dog takes (a maskable icon keeps it inside the middle 80 %)
  const shot = async (file, size, dogScale) => {
    await page.evaluate(dogScale => {
      const L = window.__lab; L.stop();
      let scene = L.dog.root; while (scene.parent) scene = scene.parent;
      if (!window.__bg) {
        const c = document.createElement('canvas'); c.width = c.height = 512;
        const g = c.getContext('2d');
        const sky = g.createLinearGradient(0, 0, 0, 512);
        sky.addColorStop(0, '#26336e'); sky.addColorStop(0.55, '#c9708a'); sky.addColorStop(0.78, '#ffad6b'); sky.addColorStop(1, '#2a1f33');
        g.fillStyle = sky; g.fillRect(0, 0, 512, 512);
        const sun = g.createRadialGradient(256, 300, 10, 256, 300, 160);
        sun.addColorStop(0, 'rgba(255,236,170,1)'); sun.addColorStop(0.45, 'rgba(255,190,110,.85)'); sun.addColorStop(1, 'rgba(255,160,90,0)');
        g.fillStyle = sun; g.fillRect(0, 0, 512, 512);
        g.fillStyle = '#1b1426'; g.fillRect(0, 404, 512, 108);          // the ground line
        window.__bg = new THREE.CanvasTexture(c);
      }
      scene.background = window.__bg; scene.fog = null;
      scene.traverse(o => { if (o.isMesh && o.geometry.type === 'PlaneGeometry') o.visible = false; });
      // full gallop, caught in the extended flight
      L.S.target = L.S.speed = 16;
      for (let i = 0; i < 400 && !(i > 60 && Math.abs(L.dog.phase - 0.3) < 0.02); i++) L.step(1 / 120);
      // side on, the body in the middle of the picture
      L.view([3.9 / dogScale, 0.52, -0.12, 0, 0.5, -0.12]);
      L.render();
    }, dogScale);
    const buf = await page.screenshot({ type: 'png' });
    const png = size === 512 ? buf : await page.evaluate(async ([b64, size]) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = c.height = size;
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, size, size);
      return c.toDataURL('image/png').split(',')[1];
    }, [buf.toString('base64'), size]).then(s => Buffer.from(s, 'base64'));
    fs.writeFileSync(path.join(OUT, file), png);
    console.log('wrote', file);
  };
  await shot('icon-512.png', 512, 1.15);
  await shot('icon-192.png', 192, 1.15);
  await shot('apple-touch-icon.png', 180, 1.1);
  await shot('icon-maskable-512.png', 512, 0.92);
  await browser.close();
})();
