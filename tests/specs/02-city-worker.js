// The city worker builds exactly the same blocks as the page.
exports.run = async t => {
  const page = await t.open('runner/index.html?nopost#runner');
  const res = await page.evaluate(async () => {
    const r = window.__runner, w = r.world, R = window.R;
    if (!w.worker) return { worker: false };
    const out = { worker: true, cells: [] };
    for (const [ci, cj] of [[3, 5], [0, 1], [-2, 4], [5, -3], [0, -1]]) {
      const id = 9000 + out.cells.length;
      const m = await new Promise(ok => {
        const prev = w.worker.onmessage;
        w.worker.onmessage = e => { if (e.data.id === id) { w.worker.onmessage = prev; ok(e.data); } else prev(e); };
        w.worker.postMessage({ type: 'cell', id, ci, cj, near: true });
      });
      const G = R.worldGen, L = G.layout(ci, cj), loc = G.nearCell(ci, cj, R.rng(G.seedOf(ci, cj)), L), g = new THREE.Group();
      loc.b.build(g);
      let vl = 0; g.traverse(o => { if (o.isMesh) vl += o.geometry.attributes.position.array.length; });
      const vw = m.pieces.reduce((a, p) => a + p.attrs.position.array.length, 0);
      out.cells.push({ type: L.type, same: vw === vl && m.r.obs.length === loc.obs.length && m.r.lamps.length === loc.lamps.length });
    }
    return out;
  });
  t.ok(res.worker, 'the worker starts');
  for (const c of res.cells || []) t.ok(c.same, 'worker block = page block (' + c.type + ')');
};
