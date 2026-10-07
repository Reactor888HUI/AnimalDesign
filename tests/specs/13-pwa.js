// Install and offline: the manifest and icons are right, the service worker keeps every file
// of the game, and with the network off the game still opens and loads its models.
const fs = require('fs'), path = require('path');
const list = require('../../tools/make-sw-list.js');
exports.run = async t => {
  // the list in sw.js is up to date (node tools/make-sw-list.js)
  const sw = fs.readFileSync(path.join(__dirname, '../../runner/sw.js'), 'utf8');
  const inSw = [...sw.matchAll(/^  '([^']+)',$/gm)].map(m => m[1]);
  const want = list(), missing = want.filter(f => !inSw.includes(f));
  t.ok(!missing.length && inSw.length === want.length, 'sw.js lists every file of the game', missing.slice(0, 5));

  const page = await t.open('runner/index.html', { game: false, sw: true });
  const man = await page.evaluate(async () => {
    const m = await (await fetch('manifest.webmanifest')).json();
    const icons = [];
    for (const i of m.icons) { const img = new Image(); img.src = i.src; await img.decode(); icons.push(img.naturalWidth + 'x' + img.naturalHeight === i.sizes); }
    return { name: m.short_name, display: m.display, icons, maskable: m.icons.some(i => i.purpose === 'maskable') };
  });
  t.ok(man.name && man.icons.length >= 2 && man.icons.every(Boolean) && man.maskable, 'manifest with icons of the right sizes', man);
  const cached = await page.evaluate(async n => {
    await navigator.serviceWorker.ready;
    const c = await caches.open('dogs-v1');
    for (let i = 0; i < 100 && (await c.keys()).length < n; i++) await new Promise(ok => setTimeout(ok, 300));
    return { files: (await c.keys()).length, status: document.getElementById('offline').textContent };
  }, want.length);
  t.ok(cached.files >= want.length, 'the whole game is kept on the device', cached);

  // network off: open the runner from the copy
  await page.context().setOffline(true);
  await page.goto(t.base + 'runner/index.html?offline#runner');
  const off = await page.waitForFunction(() => window.__runner && window.R.assets.has('car') && window.__runner.world.cells.size > 0, null, { timeout: 120000 })
    .then(() => page.evaluate(() => ({ dog: !!window.__runner.player, cells: window.__runner.world.cells.size, worker: !!window.__runner.world.worker })))
    .catch(e => ({ error: e.message }));
  t.ok(off.dog && off.cells > 0, 'with the network off the game still starts, models and all', off);
  await page.context().setOffline(false);
};
