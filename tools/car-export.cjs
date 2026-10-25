// Выгрузка машины игрока из игры для Blender: видимые сетки carObj в координатах машины (x — вперёд, y — вверх, z — вправо),
// с цветами вершин, UV, материалами (цвет, металл, шероховатость, прозрачность, свечение) и текстурами (PNG).
// Запуск: PW=$(npm root -g)/playwright node tools/car-export.cjs <vaz|suv> <папка>   → <папка>/car.json + tex-*.png
// Дальше: blender -b --factory-startup --python tools/blender/car-review.py -- <папка> <выход> [before|after]
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PW || 'playwright');
const [veh, out] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 400, height: 820 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(v => { try { localStorage.setItem('baklan3d-v1', JSON.stringify({ unlocked: 1, best: {}, quality: 'high', vehicle: v })); } catch (e) {} }, veh);
  await p.goto('file://' + path.resolve(process.env.HTML || path.join(__dirname, '../arcade/index.html')) + '#test');
  await p.waitForFunction(() => window.__t, null, { timeout: 120000 });
  await p.evaluate(v => window.__t.suv(v === 'suv'), veh);
  await p.evaluate(() => window.__t.teleport(15, 0, 0)); await p.waitForTimeout(2500);
  const data = await p.evaluate(() => {
    const root = carObj; root.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(root.matrixWorld).invert(), m = new T.Matrix4(), nm = new T.Matrix3(), v = new T.Vector3();
    const vis = o => { for (let x = o; x; x = x.parent) { if (!x.visible) return false; if (x === root) return true; } return true; };
    const texs = new Map(), meshes = [];
    const tex = t => {
      if (!t || !t.image) return null; if (texs.has(t)) return texs.get(t);
      let url = null; try { const im = t.image, c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); url = c.toDataURL('image/png'); } catch (e) {}
      const id = url ? 'tex-' + texs.size : null; texs.set(t, id ? { id, url, rep: [t.repeat.x, t.repeat.y], off: [t.offset.x, t.offset.y] } : null); return texs.get(t);
    };
    const matOf = mt => ({
      name: mt.name || mt.type, type: mt.type, color: mt.color ? mt.color.getHexString() : 'ffffff', vc: !!mt.vertexColors,
      metal: mt.metalness ?? 0, rough: mt.roughness ?? .8, opacity: mt.opacity, transparent: !!mt.transparent,
      clearcoat: mt.clearcoat || 0, ccRough: mt.clearcoatRoughness || 0, emissive: mt.emissive ? mt.emissive.getHexString() : '000000',
      emI: mt.emissiveIntensity ?? 1, map: tex(mt.map), emap: tex(mt.emissiveMap), side: mt.side, glass: !!mt.userData?.glass || /glass|стекл/i.test(mt.name || ''),
    });
    root.traverse(o => {
      if (!o.isMesh || !vis(o)) return;
      const g = o.geometry, pos = g.attributes.position; if (!pos) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const groups = g.groups.length ? g.groups : [{ start: 0, count: g.index ? g.index.count : pos.count, materialIndex: 0 }];
      const n = o.isInstancedMesh ? o.count : 1;
      for (let k = 0; k < n; k++) {
        m.copy(inv).multiply(o.matrixWorld); if (o.isInstancedMesh) { const im = new T.Matrix4(); o.getMatrixAt(k, im); m.multiply(im); }
        nm.getNormalMatrix(m);
        const P = [], N = [], C = [], U = [];
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m); P.push(+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4));
          if (g.attributes.normal) { v.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(nm).normalize(); N.push(+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)); }
          if (g.attributes.color) { const c = g.attributes.color; C.push(+c.getX(i).toFixed(3), +c.getY(i).toFixed(3), +c.getZ(i).toFixed(3)); }
          if (g.attributes.uv) { const u = g.attributes.uv; U.push(+u.getX(i).toFixed(4), +u.getY(i).toFixed(4)); }
        }
        const idx = g.index ? Array.from(g.index.array) : [...Array(pos.count).keys()];
        for (const gr of groups) {
          const mt = mats[gr.materialIndex ?? 0]; if (!mt || mt.visible === false) continue;
          meshes.push({ name: (o.name || o.parent?.name || 'part') + (n > 1 ? '#' + k : ''), mat: matOf(mt), P, N, C, U, I: idx.slice(gr.start, gr.start + gr.count) });
        }
      }
    });
    let tris = 0; meshes.forEach(x => tris += x.I.length / 3);
    return { meshes, tris, textures: [...texs.values()].filter(Boolean) };
  });
  for (const t of data.textures) fs.writeFileSync(path.join(out, t.id + '.png'), Buffer.from(t.url.split(',')[1], 'base64'));
  data.meshes.forEach(x => { for (const k of ['map', 'emap']) if (x.mat[k]) delete x.mat[k].url; });
  fs.writeFileSync(path.join(out, 'car.json'), JSON.stringify({ veh, tris: data.tris, meshes: data.meshes }));
  console.log(JSON.stringify({ veh, parts: data.meshes.length, tris: data.tris, textures: data.textures.length, errs }));
  await b.close();
})();
