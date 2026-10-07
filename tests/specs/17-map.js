// District map: the minimap draws the streets round the dog; K opens the big map and the game stands
// still; a tap on the garages takes the dog to the foot of the ramp, from where a run reaches the
// kicker; the sniffer has a map with the client marked; the guard (one yard) has none.
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker&nopost#runner', { live: true });
  await page.evaluate(() => { const i = window.__runner.input; i.poll = () => {}; i.dirMode = false; });
  await page.waitForTimeout(800);
  const mini = await page.evaluate(() => {
    const c = document.querySelector('#minimap canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let filled = 0, colors = new Set(); for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 0) { filled++; colors.add(d[i] >> 4 << 8 | d[i + 1] >> 4 << 4 | d[i + 2] >> 4); }
    return { visible: !document.getElementById('minimap').hidden, filled, colors: colors.size };
  });
  t.ok(mini.visible && mini.filled > 1000 && mini.colors > 4, 'the minimap shows the district', mini);
  await page.keyboard.press('KeyK');
  await page.waitForTimeout(300);
  const paused = await page.evaluate(async () => {
    const p = window.__runner.player, x0 = p.x; window.__runner.input.throttle = 1;
    await new Promise(ok => setTimeout(ok, 600));
    return { open: !document.getElementById('bigmap').hidden, moved: Math.abs(p.x - x0) + Math.abs(window.__runner.player.z - p.z), places: window.__runner.map.hit.length };
  });
  t.ok(paused.open && paused.moved < 0.01 && paused.places > 10, 'K opens the big map, places marked, the game stands still', paused);
  const g = await page.evaluate(() => window.__runner.map.hit.find(h => h.type === 'garages' && h.ci === 0 && h.cj === 1));
  const box = await page.locator('#bigmap canvas.map').boundingBox();
  await page.mouse.click(box.x + g.x, box.y + g.y);
  const r = await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    const R_ = window.__runner, p = R_.player, M = window.R.modes.runner, ctx = R_.ctx, inp = R_.input, ev = [];
    const at = { x: +(p.x - 0).toFixed(1), z: +(p.z - 74).toFixed(1), open: !document.getElementById('bigmap').hidden };
    const on0 = p.onEvent; p.onEvent = (n, v) => { ev.push(n); on0 && on0(n, v); };
    p.speed = 0;
    for (let i = 0; i < 150; i++) { inp.throttle = 1; inp.steer = 0; M.update(1 / 30, ctx); R_.world.update(p.x, p.z, 2); }
    p.onEvent = on0;
    return { at, launched: ev.includes('launch'), y: +p.y.toFixed(2) };
  });
  t.ok(!r.at.open && Math.abs(r.at.x + 21.6) < 1.5 && Math.abs(r.at.z + 12) < 1.5, 'a tap on the garages takes the dog to the foot of the ramp', r.at);
  t.ok(r.launched, 'and a run from there reaches the kicker', r);
  const sn = await t.open('runner/index.html?noworker&nopost#sniffer');
  const s = await sn.evaluate(() => ({ map: !!window.__runner.map, markers: window.R.modes.sniffer.mapMarkers().map(m => m.label), travel: !document.querySelector('#bigmap .travel').hidden }));
  t.ok(s.map && s.markers.includes('хозяин') && !s.travel, 'sniffer: a map with the client marked, no travel', s);
  const gd = await t.open('runner/index.html?noworker&nopost#guard');
  const gm = await gd.evaluate(() => ({ map: !!window.__runner.map, mini: !document.getElementById('minimap').hidden }));
  t.ok(!gm.map && !gm.mini, 'guard: no map', gm);
};
