"""Проверка ж/д моста по выгрузке tools/bridge-export.cjs: видимое ↔ твёрдое и зазоры трюков.
  A — «видимая сталь без твёрдости»: машина пролетит сквозь нарисованную балку (не считаются рельсы, шпалы, щебень, разгонные
      полосы, провода — по цвету вершин; и поверхности, которые держат машину);
  B — «невидимая стена»: hit0 даёт препятствие, а рядом (1 м) нет нарисованной стали;
  C — зазоры: для каждой траектории тренажёра в полёте — расстояние от центра машины до ближайшей стали минус полугабарит (1,1 м).
Запуск: python3 -I tools/bridge-check.py папка_выгрузки  → report.json, печатает сводку
"""
import json, os, sys
import numpy as np
from scipy import ndimage
D = sys.argv[1]
meta = json.load(open(os.path.join(D, 'meta.json')))
DRESS = [0x3a3634, 0x4a3a2c, 0x6a625b, 0x39e6ff]          # рельсы, шпалы, щебень, разгонные полосы — лежат на настиле
def hexrgb(h): return np.array([(h >> 16 & 255), (h >> 8 & 255), (h & 255)]) / 255
rep = {'meta': {k: meta[k] for k in ('L', 'A1', 'A2', 'Y0', 'HW', 'LIFT', 'TOW')}, 'states': {}, 'trials': {}}
grids = {}
for lift in (0, 1):
    G = json.load(open(os.path.join(D, f'grid{lift}.json'))); ns, nl, ny, d = G['ns'], G['nl'], G['ny'], G['d']
    occ = np.fromfile(os.path.join(D, f'occ{lift}.u8'), np.uint8).reshape(ns, nl, ny); sup = np.fromfile(os.path.join(D, f'sup{lift}.u8'), np.uint8).reshape(ns, nl, ny)
    T = np.fromfile(os.path.join(D, f'steel{lift}.f32'), np.float32).reshape(-1, 3, 6)
    col = T[:, 0, 3:6]; dress = np.zeros(len(T), bool)
    for h in DRESS: dress |= np.abs(col - hexrgb(h)).max(1) < .03
    # поверхность треугольников → ячейки (точки на треугольнике с шагом ≤ 0,15 м)
    steel = np.zeros((ns, nl, ny), bool); dmask = np.zeros_like(steel)
    for tri, isd in ((T[~dress], False), (T[dress], True)):
        P = tri[:, :, :3].astype(np.float64); e = np.maximum(np.linalg.norm(P[:, 1] - P[:, 0], axis=1), np.linalg.norm(P[:, 2] - P[:, 0], axis=1))
        e = np.nan_to_num(e); kk = np.clip(np.ceil(e / .15), 1, 60).astype(int)
        for k in np.unique(kk):
            sel = kk == k; Q = P[sel]
            u, v = np.meshgrid(np.arange(k + 1) / k, np.arange(k + 1) / k); m = u + v <= 1; u, v = u[m], v[m]
            pts = Q[:, None, 0] + (Q[:, None, 1] - Q[:, None, 0]) * u[None, :, None] + (Q[:, None, 2] - Q[:, None, 0]) * v[None, :, None]
            pts = pts.reshape(-1, 3); ia = ((pts[:, 0] - G['S0']) / d).astype(int); ic = ((pts[:, 1] - G['L0']) / d).astype(int); ie = ((pts[:, 2] - G['Y0']) / d).astype(int)
            ok = (ia >= 0) & (ia < ns) & (ic >= 0) & (ic < nl) & (ie >= 0) & (ie < ny)
            (dmask if isd else steel)[ia[ok], ic[ok], ie[ok]] = True
    solid = occ > 0; near = lambda m, r: ndimage.binary_dilation(m, iterations=r)
    held = near(sup > 0, 2)                                     # рядом поверхность, на которой стоят (настил, пояса, пандусы)
    A = steel & ~near(solid, 1) & ~held                         # видимая сталь, сквозь которую можно пролететь
    B = solid & ~near(steel | dmask, 2)                         # твёрдое без видимой стали в метре
    def clusters(M, names=None):
        lab, n = ndimage.label(M, structure=np.ones((3, 3, 3))); out = []
        for i, sl in enumerate(ndimage.find_objects(lab)):
            cnt = int((lab[sl] == i + 1).sum())
            if cnt < 6: continue
            idx = np.argwhere(lab == i + 1); c = idx.mean(0)
            nm = ''
            if names is not None: vals = occ[tuple(idx.T)]; nm = G['names'][np.bincount(vals[vals > 0]).argmax()] if (vals > 0).any() else ''
            out.append({'s': round(float(G['S0'] + (c[0] + .5) * d), 1), 'l': round(float(G['L0'] + (c[1] + .5) * d), 1), 'y': round(float(G['Y0'] + (c[2] + .5) * d), 1),
                        'ext': [round(float((idx[:, j].max() - idx[:, j].min() + 1) * d), 1) for j in range(3)], 'n': cnt, 'name': nm})
        return sorted(out, key=lambda r: -r['n'])
    rep['states'][lift] = {'A_visible_not_solid': clusters(A), 'B_solid_not_visible': clusters(B, True)}
    grids[lift] = (G, steel, held)
    print(f"пролёт {'поднят' if lift else 'внизу'}: сталь {steel.sum()} яч., твёрдое {solid.sum()} яч.; A (сквозь видимое): {len(rep['states'][lift]['A_visible_not_solid'])} мест, B (невидимое твёрдое): {len(rep['states'][lift]['B_solid_not_visible'])} мест")
    for r in rep['states'][lift]['A_visible_not_solid'][:12]: print('   A', r)
    for r in rep['states'][lift]['B_solid_not_visible'][:12]: print('   B', r)
# зазоры трюков: расстояние до стали (по сетке), в полёте
dist = {k: ndimage.distance_transform_edt(~(v[1] & ~v[2])) * v[0]['d'] for k, v in grids.items()}   # до стали, кроме опорных поверхностей (с них взлетают)
for tid, t in meta['trials'].items():
    worst = None
    for s, l, y, air, ly, crash, yaw in t['pts']:
        if not air: continue
        G = grids[1 if ly > 20 else 0][0]; a, c, e = int((s - G['S0']) / G['d']), int((l - G['L0']) / G['d']), int((y + .7 - G['Y0']) / G['d'])
        if not (0 <= a < G['ns'] and 0 <= c < G['nl'] and 0 <= e < G['ny']): continue
        cl = dist[1 if ly > 20 else 0][a, c, e] - 1.1
        if worst is None or cl < worst[0]: worst = (round(float(cl), 2), round(s, 1), round(l, 1), round(y, 1))
    rep['trials'][tid] = {'done': t['done'], 'min_clear': worst}
    print(f"  {tid:12s} {'✓' if t['done'] else '✗'} мин. зазор в полёте: {worst}")
json.dump(rep, open(os.path.join(D, 'report.json'), 'w'), ensure_ascii=False, indent=1)
