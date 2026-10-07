// City worker: lays out and builds city blocks off the main thread, so the game never waits for them.
// It runs the same code as the page (world.js, assets.js) and sends back plain vertex arrays.
self.window = self;
importScripts('../vendor/three.min.js', '../vendor/BufferGeometryUtils.js', 'config.js', 'util.js', 'assets.js', 'world.js');

self.onmessage = e => {
  const m = e.data, R = self.R;
  if (m.type === 'lib') { R.assets.importLib(m.lib); return; }
  if (m.type === 'cell') {
    const G = R.worldGen, L = G.layout(m.ci, m.cj);
    const r = m.near ? G.nearCell(m.ci, m.cj, R.rng(G.seedOf(m.ci, m.cj)), L) : G.farCell(m.ci, m.cj, R.rng(G.seedOf(m.ci, m.cj)), L);
    const out = r.b.toArrays();
    self.postMessage({ type: 'cell', id: m.id, cellType: L.type,
      r: { obs: r.obs, lamps: r.lamps || [], arcs: r.arcs || [], rings: r.rings || [], wires: r.wires || [] }, pieces: out.pieces }, out.transfer);
  }
};
