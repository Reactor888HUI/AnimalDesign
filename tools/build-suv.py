"""Внедорожник для игры — второй машиной. Из GLB параллельной версии (range-rover-race.glb, v10: чёрный глянец, салон
слоновой кости, руль, приборы) собирает компактный игровой ассет и встраивает его в arcade/index.html (блок SUV-DATA).

Что делает:
  • мировые матрицы узлов; поворот на 180° (у модели перёд к −X, в игре — к +X), масштаб 0,92 (длина ≈4,1 м, как у
    игровой формы столкновений), низ шин — на уровень земли машины (y = −0,65);
  • группы: кузов, 4 колеса (свои оси), «dash» — старая панель кузова (видна только снаружи: из кабины её заменяет
    салон, нарисованный в игре кодом); салон водителя и руль исходника не берём — от руля нужна только его ось (глаз водителя);
  • убирает надписи-логотипы марки (буквы на двери багажника и на капоте, эмблемы, надпись на руле) — в игре марки
    не пишем;
  • склеивает всё по материалам внутри группы, упрощает тяжёлые сетки (квадрики, fast_simplification) и пересчитывает
    нормали с сохранением рёбер (излом > 38°);
  • упаковка: позиции int16 (по габаритам группы), нормали int8, индексы uint16/uint32; без UV и текстур — фактуры
    (кожа, плёнка стёкол) рисуются в игре кодом.

Запуск: python3 -I tools/build-suv.py путь/к/range-rover-race.glb   (нужны numpy и fast_simplification)
"""
import base64, json, os, struct, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import suv_glb
import fast_simplification

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]
S = .92
j, prims, world, parent = suv_glb.read(SRC)
MATS = [m['name'] for m in j['materials']]

def to_game(P):                                   # модель → игра: 180° вокруг Y и масштаб
    return np.c_[-P[:, 0], P[:, 1], -P[:, 2]] * S
def tf(p, M):
    return (np.c_[p, np.ones(len(p))] @ M.T)[:, :3]

# низ шин — земля
tyre = np.concatenate([tf(p['pos'], p['M']) for p in prims if p['name'].endswith('__rubber')])
Y0 = tyre[:, 1].min()

def group_of(p):
    ch = p['chain']
    for n in ch:
        if n.startswith('wheel_') and '__' not in n: return n
    if 'driver_steering.001' in ch: return 'steer'
    if p['name'].startswith('driver_'): return 'driver'
    return 'body'
node_idx = {n.get('name', ''): i for i, n in enumerate(j['nodes'])}

def comps(P, idx):                               # связные куски (по совпадающим вершинам)
    q = np.round(P * 1e4).astype(np.int64); key = {}; vid = np.array([key.setdefault(tuple(k), len(key)) for k in q])
    par = list(range(len(key)))
    def f(a):
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    for t in idx:
        a = f(vid[t[0]]); par[f(vid[t[1]])] = a; par[f(vid[t[2]])] = a
    return np.array([f(vid[t[0]]) for t in idx])

def is_logo(c, ext, mat):                         # координаты модели: перёд −X, верх +Y
    if ext.max() > .14: return False
    x, y, z = c
    if mat not in ('trim_metal', 'trim_black', 'driver_chrome'): return False
    if x > 2.12 and .88 < y < 1.2 and abs(z) < .65: return True         # буквы, эмблема и значок модели на двери багажника
    if x < -2.15 and .86 < y < 1.08 and abs(z) < .5: return True        # буквы на кромке капота
    if x > 2.2 and .7 < y < .8 and abs(z) < .5 and ext.max() < .1: return True          # надпись марки над задним номером
    if x < -2.24 and .74 < y < .92 and abs(z) < .32 and ext.max() > .05: return True   # эмблема в решётке
    return False

DASH_MATS = ('cabin_charcoal', 'interior', 'leather_ivory', 'trim_black', 'trim_metal')
parts = {}                                        # (группа, материал) → [позиции, нормали-исходные, индексы]
removed = 0
for p in prims:
    if p['mesh'] == 'Text.001': removed += len(p['idx']); continue   # надпись марки на руле
    g = group_of(p); mat = MATS[p['mat']]
    if g in ('driver', 'steer'): continue                              # салон и руль — кодом в игре
    P = tf(p['pos'], p['M']); idx = p['idx']
    if g == 'body' and mat in ('trim_metal', 'trim_black'):
        lab = comps(P, idx); keep = np.ones(len(idx), bool)
        for L in np.unique(lab):
            m = lab == L; V = P[idx[m].reshape(-1)]; mn, mx = V.min(0), V.max(0)
            if is_logo((mn + mx) / 2, mx - mn, mat): keep[m] = False
        removed += int((~keep).sum()); idx = idx[keep]
    Pg = to_game(P); Pg[:, 1] -= Y0 * S; Pg[:, 1] -= .65
    if g.startswith('wheel_') or g == 'steer':                         # в свои оси
        piv = to_game(world(node_idx[g if g != 'steer' else 'driver_steering.001'])[:3, 3][None])[0]; piv[1] -= Y0 * S + .65
        Pg = Pg - piv
    if g == 'body' and mat in DASH_MATS:                               # панель приборов кузова → своя группа
        c = Pg[idx].mean(1); m = (c[:, 0] > .3) & (c[:, 0] < .92) & (np.abs(c[:, 2]) < .77) & (c[:, 1] > -.15) & (c[:, 1] < .6)
        if m.any(): parts.setdefault(('dash', mat), []).append((Pg, idx[m]))
        idx = idx[~m]
    parts.setdefault((g, mat), []).append((Pg, idx))

pivots = {}
for g in ['wheel_front_left', 'wheel_front_right', 'wheel_rear_left', 'wheel_rear_right', 'steer']:
    piv = to_game(world(node_idx[g if g != 'steer' else 'driver_steering.001'])[:3, 3][None])[0]; piv[1] -= Y0 * S + .65; pivots[g] = [round(float(v), 4) for v in piv]

def weld(P, idx, eps=1e-4):
    q = np.round(P / eps).astype(np.int64); _, first, inv = np.unique(q, axis=0, return_index=True, return_inverse=True)
    return P[first], inv.reshape(-1)[idx]

def crease_normals(P, F, ang=38):
    a, b, c = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]; fn = np.cross(b - a, c - a); area = np.linalg.norm(fn, axis=1) + 1e-12; fu = fn / area[:, None]
    inc = [[] for _ in range(len(P))]
    for fi, t in enumerate(F):
        for v in t: inc[v].append(fi)
    cs = np.cos(np.radians(ang)); outP, outN, key, newF = [], [], {}, np.zeros_like(F)
    for fi, t in enumerate(F):
        for k, v in enumerate(t):
            acc = np.zeros(3)
            for g2 in inc[v]:
                if fu[g2] @ fu[fi] >= cs: acc += fn[g2]
            n = acc / (np.linalg.norm(acc) + 1e-12); kq = (v, *np.round(n * 60).astype(int))
            if kq not in key: key[kq] = len(outP); outP.append(P[v]); outN.append(n)
            newF[fi, k] = key[kq]
    src = np.zeros(len(outP), np.int64)
    for (v, *_), i in key.items(): src[i] = v
    return np.array(outP), np.array(outN), newF, src

def refine(P, F, L=.13):                          # стекло: делим длинные рёбра (общие середины — без щелей), чтобы кайма
    P = [tuple(v) for v in P]; F = [tuple(t) for t in F]   # с точками по расстоянию до края ложилась ровно, а не треугольниками
    while True:
        mid, out, hit = {}, [], False
        def m(a, b):
            k = (min(a, b), max(a, b))
            if k not in mid: mid[k] = len(P); P.append(tuple((np.array(P[a]) + np.array(P[b])) / 2))
            return mid[k]
        long = lambda a, b: np.linalg.norm(np.array(P[a]) - np.array(P[b])) > L
        marks = {}
        for t in F:
            for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
                if long(a, b): marks[(min(a, b), max(a, b))] = True
        if not marks: return np.array(P), np.array(F)
        for a, b, c in F:
            e = [(min(x, y), max(x, y)) in marks for x, y in ((a, b), (b, c), (c, a))]
            n = sum(e)
            if n == 0: out.append((a, b, c))
            elif n == 3: ab, bc, ca = m(a, b), m(b, c), m(c, a); out += [(a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)]
            else:
                while not e[0]: a, b, c = b, c, a; e = e[1:] + e[:1]            # первое отмеченное ребро — a-b
                ab = m(a, b)
                if n == 1: out += [(a, ab, c), (ab, b, c)]
                elif e[1]: bc = m(b, c); out += [(a, ab, c), (ab, b, bc), (ab, bc, c)]
                else: ca = m(c, a); out += [(a, ab, ca), (ab, b, c), (ab, c, ca)]
        F = out

def edge_dist(P, F):                              # стекло: расстояние каждой вершины до края панели (для чёрной каймы с точками)
    from collections import Counter
    E = Counter(tuple(sorted(e)) for t in F for e in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])))
    B = np.array([e for e, n in E.items() if n == 1])
    if not len(B): return np.full(len(P), 9.0)
    A, Bv = P[B[:, 0]], P[B[:, 1]]; d = Bv - A; L2 = np.maximum((d * d).sum(1), 1e-12)
    out = np.empty(len(P))
    for i, v in enumerate(P):
        t = np.clip(((v - A) * d).sum(1) / L2, 0, 1); out[i] = np.sqrt((((A + d * t[:, None]) - v) ** 2).sum(1)).min()
    return out

# сколько треугольников оставить: крупные «оболочки» кузова и колёс — проще, мелочь — как есть
TARGET = {'trim_metal': .42, 'paint_obsidian_black': .5, 'rubber': .3, 'interior': .3, 'leather_ivory': .45, 'light_lens': .4, 'trim_black': .6, 'cabin_charcoal': .6}
blob, header, total = bytearray(), {'mats': [], 'groups': {}, 'pivots': pivots}, 0
mat_used = sorted({m for (_, m) in parts})
header['mats'] = mat_used
for (g, mat), lst in sorted(parts.items()):
    lst = [q for q in lst if len(q[1])]
    if not lst: continue
    P = np.concatenate([q[0] for q in lst]); off = np.cumsum([0] + [len(q[0]) for q in lst])[:-1]
    F = np.concatenate([q[1] + o for q, o in zip(lst, off)])
    P, F = weld(P, F); F = F[(F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])]
    keep = TARGET.get(mat, 1)
    if g.startswith('wheel_'): keep = min(keep, .32)
    if keep < 1 and len(F) > 600:
        P2, F2 = fast_simplification.simplify(P.astype(np.float32), F.astype(np.int64), target_reduction=1 - keep)
        if len(F2) > 50: P, F = P2.astype(np.float64), F2.astype(np.int64)
    if mat == 'glass_tinted': P, F = refine(P, F)
    ed = edge_dist(P, F) if mat == 'glass_tinted' else None
    P, N, F, src = crease_normals(P, F)
    mn, mx = P.min(0), P.max(0); sc = np.maximum(mx - mn, 1e-6)
    qp = np.round((P - mn) / sc * 65535 - 32768).astype(np.int16)
    qn = np.round(N * 127).astype(np.int8)
    big = len(P) > 65535; qi = F.astype(np.uint32 if big else np.uint16).reshape(-1)
    rec = {'m': mat_used.index(mat), 'n': len(P), 'i': len(qi), 'big': big, 'mn': [round(float(v), 5) for v in mn], 'sc': [round(float(v), 6) for v in sc]}
    arrs = [qp, qn, qi]
    if ed is not None: rec['ed'] = 1; arrs.append(np.minimum(255, np.round(ed[src] * 500)).astype(np.uint8))   # шаг 2 мм, до 51 см
    for arr in arrs:
        while len(blob) % 4: blob.append(0)
        rec.setdefault('o', []).append(len(blob)); blob += arr.tobytes()
    header['groups'].setdefault(g, []).append(rec); total += len(F)
hj = json.dumps(header, separators=(',', ':')).encode()
data = struct.pack('<I', len(hj)) + hj
while len(data) % 4: data += b'\0'
out = data + bytes(blob)
print(f'треугольников {total}, убрано логотипов {removed} тр., ассет {len(out) / 1024:.0f} КБ, base64 {len(out) * 4 / 3 / 1024:.0f} КБ')
for g, rs in header['groups'].items(): print(' ', g, sum(r['i'] // 3 for r in rs), [mat_used[r['m']] for r in rs])
b64 = base64.b64encode(out).decode()
html = os.path.join(ROOT, 'arcade', 'index.html'); s = open(html, encoding='utf-8').read()
import re
s2, n = re.subn(r'const SUV_DATA = "[^"]*";', 'const SUV_DATA = "%s";' % b64, s)
if n != 1: sys.exit('нет метки const SUV_DATA = "…"; в index.html')
open(html, 'w', encoding='utf-8').write(s2); print('встроено в', html)
