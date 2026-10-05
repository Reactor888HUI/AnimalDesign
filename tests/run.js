// Browser tests: serves the repository, opens the game in headless Chromium (software WebGL)
// and runs every tests/specs/*.js. Usage: npm test [-- name-filter]
const fs = require('fs'), path = require('path'), http = require('http');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('Playwright is missing: run "npm install" (and "npx playwright install chromium").'); process.exit(2); }

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };

function serve() {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    let f = path.join(ROOT, u);
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

(async () => {
  const filter = process.argv[2] || '';
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const files = fs.readdirSync(path.join(__dirname, 'specs')).filter(f => f.endsWith('.js') && f.includes(filter)).sort();
  let failed = 0;
  for (const file of files) {
    const spec = require(path.join(__dirname, 'specs', file));
    const t0 = Date.now(), checks = [], errors = [];
    const t = {
      base,
      ok(cond, what, info) { checks.push({ ok: !!cond, what, info }); },
      // open a page of the game; the frame loop is stopped unless live is set, so a test drives it frame by frame
      async open(url, o = {}) {
        const page = await browser.newPage({ viewport: o.viewport || { width: 800, height: 500 } });
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|favicon/.test(m.text())) errors.push(m.text()); });
        await page.route('**/fonts.g*/**', r => r.abort());
        await page.goto(base + url);
        if (o.game !== false) {
          await page.waitForFunction(() => window.__runner, null, { timeout: 120000 });
          if (!o.live) await page.evaluate(() => {
            window.requestAnimationFrame = () => 0;
            const i = window.__runner.input; i.poll = () => {}; i.dirMode = false;   // tank controls, set by the test
          });
        }
        return page;
      },
    };
    let crash = null;
    try { await spec.run(t); } catch (e) { crash = e; }
    const bad = checks.filter(c => !c.ok);
    const okAll = !crash && !bad.length && !errors.length;
    if (!okAll) failed++;
    console.log((okAll ? 'PASS ' : 'FAIL ') + file + '  (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
    for (const c of checks) console.log('   ' + (c.ok ? 'ok  ' : 'BAD ') + c.what + (c.info !== undefined ? '  ' + JSON.stringify(c.info) : ''));
    if (crash) console.log('   CRASH ' + (crash.stack || crash));
    for (const e of errors) console.log('   PAGE ERROR ' + e);
    for (const ctx of browser.contexts()) for (const p of ctx.pages()) await p.close();
  }
  await browser.close();
  srv.close();
  console.log(failed ? failed + ' of ' + files.length + ' failed' : 'all ' + files.length + ' passed');
  process.exit(failed ? 1 : 0);
})();
