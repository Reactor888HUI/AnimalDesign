#!/usr/bin/env python3
"""Готовые модели (CC0) → компактные данные для игры, пишутся в arcade/data/vehicles.js между маркерами /*MODELS-DATA*/.

Запуск: python3 -I tools/obj-to-game.py arcade/data/vehicles.js

Модели лежат в arcade/refs/models/ (лицензия CC0, см. README.txt там же):
  quaternius-bus.obj  — «LowPoly Public Transport», Quaternius (opengameart.org/content/lowpoly-public-transport)
  kenney-van.obj      — «Car Kit», Kenney (kenney.nl/assets/car-kit), цвета — из палитры kenney-colormap.png

Что делает:
  * ставит модель длиной вдоль +x (перед — +x), колёсами на y = 0, по центру;
  * масштабирует до нужной ширины и удлиняет только середину между осями (колёса остаются круглыми),
    у маршрутки поднимает крышу — как у высоких микроавтобусов;
  * цвет каждой вершины — из таблицы материалов или из палитры-текстуры (текстура в игре не нужна);
  * части «в цвет машины» (tint) отдельно — их цвет задаётся цветом экземпляра;
  * позиции — Int16 в миллиметрах, индексы — Uint16, всё в base64.
"""
import base64, json, os, re, struct, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, "arcade", "refs", "models")

MODELS = {
    # городской автобус: двухцветный — верх в цвет машины, низ — тёмная полоса; удлинён до ~10,5 м
    "bus": dict(src="quaternius-bus.obj", fwd=("x", -1), width=2.5, stretch=4.4, pillars=True, wheels=("Material", 1.8), mats={
        "Top": "tint", "Bottom": 0x2f3d55, "Windows": 0x1d2838, "Bumper": 0x2a2c31, "Details": 0x8d939b,
        "Lights": 0xfff0a8, "Material": 0x15161a}, rear=(0xfff0a8, 0xd8262c)),
    # маршрутка: микроавтобус с высокой крышей, ~6 м
    # кузов — все синие оттенки палитры (в них запечены тени): идут в «цвет машины» со своей яркостью;
    # у грузового фургона нет окон салона — добавляем тёмные стёкла по бортам (три окна)
    "van": dict(src="kenney-van.obj", fwd=("z", 1), width=2.05, stretch=1.7, raise_roof=(0.55, 0.45), palette="kenney-colormap.png",
                tint_if=lambda r, g, b: b - r > 40, recolor=lambda r, g, b: 0x55677c if r > 200 and g > 220 and b > 230 else None, windows=[(-2.25, -1.35), (-1.25, -.35), (-.25, .62)], win_y=(1.3, 1.86), win_col=0x253042),
}


def load_obj(path):
    V, VT, F = [], [], []          # F: (material, [(vi, vti), ...])
    cur = None
    for line in open(path, encoding="utf8", errors="ignore"):
        if line.startswith("v "):
            V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("vt "):
            VT.append([float(x) for x in line.split()[1:3]])
        elif line.startswith("usemtl"):
            cur = line.split()[1]
        elif line.startswith("f "):
            pts = []
            for t in line.split()[1:]:
                s = t.split("/")
                pts.append((int(s[0]) - 1, int(s[1]) - 1 if len(s) > 1 and s[1] else -1))
            F.append((cur, pts))
    return V, VT, F


def ear_clip(poly):
    """Триангуляция плоского (возможно невыпуклого) многоугольника: проекция на плоскость нормали и «отрезание ушей»."""
    n = len(poly)
    if n == 3:
        return [[0, 1, 2]]
    nx = ny = nz = 0.0                                      # нормаль по Ньюэллу
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1])
    ax = max(range(3), key=lambda i: abs((nx, ny, nz)[i]))
    u, v = [i for i in range(3) if i != ax]
    sgn = 1 if (nx, ny, nz)[ax] > 0 else -1
    if ax == 1:
        sgn = -sgn                                          # (z, x) вместо (x, z) — правая тройка
    pts = [(p[u], p[v]) for p in poly]
    def cross(o, a, b):
        return ((a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])) * sgn
    def inside(p, a, b, c):
        return cross(a, b, p) >= -1e-12 and cross(b, c, p) >= -1e-12 and cross(c, a, p) >= -1e-12
    idx, out, guard = list(range(n)), [], 0
    while len(idx) > 3 and guard < 10000:
        guard += 1
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            a, b, c = pts[i0], pts[i1], pts[i2]
            if cross(a, b, c) <= 1e-12:
                continue
            if any(inside(pts[j], a, b, c) for j in idx if j not in (i0, i1, i2)):
                continue
            out.append([i0, i1, i2]); idx.pop(k); break
        else:
            break                                           # вырожденный остаток — веером
    for k in range(1, len(idx) - 1):
        out.append([idx[0], idx[k], idx[k + 1]])
    return out


def convert(name, spec):
    V, VT, F = load_obj(os.path.join(REF, spec["src"]))
    ax, sg = spec["fwd"]
    # в систему игры: x — вперёд, y — вверх, z — вбок
    def tr(p):
        x, y, z = p
        if ax == "x":
            return [x * sg, y, z * sg]
        return [z * sg, y, -x * sg]
    P = [tr(p) for p in V]
    xs = [p[0] for p in P]; ys = [p[1] for p in P]; zs = [p[2] for p in P]
    cx, cz, y0 = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2, min(ys)
    k = spec["width"] / (max(zs) - min(zs))
    P = [[(p[0] - cx) * k, (p[1] - y0) * k, (p[2] - cz) * k] for p in P]
    H0 = max(p[1] for p in P)
    # удлинение середины: всё, что впереди центра, сдвигаем вперёд, всё сзади — назад
    st = spec.get("stretch", 0)
    for p in P:
        p[0] += st / 2 if p[0] > 0 else -st / 2 if p[0] < 0 else 0
    # высокая крыша: всё выше доли h от высоты поднимаем на dh метров
    if spec.get("raise_roof"):
        h, dh = spec["raise_roof"]
        for p in P:
            if p[1] > H0 * h:
                p[1] += dh
    # колёса крупнее (у модели автобуса они игрушечные): каждое — вокруг своего центра, нижней точкой на земле
    if spec.get("wheels"):
        wm, f = spec["wheels"]
        groups = {}
        for mat, pts in F:
            if mat != wm:
                continue
            for v, _ in pts:
                groups.setdefault((P[v][0] > 0, P[v][2] > 0), set()).add(v)
        for vs in groups.values():
            xs_ = [P[v][0] for v in vs]; ys_ = [P[v][1] for v in vs]; zs_ = [P[v][2] for v in vs]
            c = [(min(xs_) + max(xs_)) / 2, (min(ys_) + max(ys_)) / 2, (min(zs_) + max(zs_)) / 2]
            r = (max(ys_) - min(ys_)) / 2
            for v in vs:
                P[v] = [c[0] + (P[v][0] - c[0]) * f, r * f + (P[v][1] - c[1]) * f, c[2] + (P[v][2] - c[2]) * min(f, 1.25)]
    # цвета
    pal_img = None
    if spec.get("palette"):
        from PIL import Image
        pal_img = Image.open(os.path.join(REF, spec["palette"])).convert("RGB")
    def color_of(mat, vt):
        if pal_img is not None:
            u, v = VT[vt]
            w, h = pal_img.size
            r, g, b = pal_img.getpixel((min(w - 1, max(0, int(u * w))), min(h - 1, max(0, int((1 - v) * h)))))
            return (r << 16) | (g << 8) | b
        return spec["mats"].get(mat, 0x808080)
    tris = []                      # (цвет, [3 позиции])
    def recol(c):
        r = spec.get("recolor") and spec["recolor"](c >> 16, (c >> 8) & 255, c & 255)
        return r if r is not None and r is not False else c
    for mat, pts in F:
        cols = [recol(color_of(mat, t)) for _, t in pts]
        if spec.get("rear") and cols[0] == spec["rear"][0] and sum(P[v][0] for v, _ in pts) < 0:
            cols = [spec["rear"][1]] * len(pts)              # задние огни — красные
        for idx in ear_clip([V[v] for v, _ in pts]):        # n-угольники из Blender бывают невыпуклыми — «веером» нельзя
            tris.append((cols[0], [P[pts[j][0]] for j in idx]))
    # части «в цвет машины»: цвет вершины — серый (яркость оттенка), цвет экземпляра задаёт окраску
    is_tint = lambda c: c == "tint" or (spec.get("tint_if") and spec["tint_if"](c >> 16, (c >> 8) & 255, c & 255))
    lum = lambda c: .3 * (c >> 16) + .59 * ((c >> 8) & 255) + .11 * (c & 255)
    tl = [lum(c) for c, _ in tris if c != "tint" and is_tint(c)]
    lmax = max(tl) if tl else 1
    def grey(c):
        if c == "tint":
            return 0xffffff
        g = max(0, min(255, round(255 * (.35 + .65 * lum(c) / lmax))))   # тени оттенков сохраняем, но мягче — белый кузов не сереет
        return (g << 16) | (g << 8) | g
    def side_quads(x0, x1, y0, y1, col, eps=.012):     # прямоугольник на обоих бортах, по месту борта
        zs = [abs(p[2]) for p in P if x0 - .2 < p[0] < x1 + .2 and y0 - .2 < p[1] < y1 + .2]
        z = (max(zs) if zs else spec["width"] / 2) + eps
        for sd in (-1, 1):
            a, b, c2, d = [x0, y0, sd * z], [x1, y0, sd * z], [x1, y1, sd * z], [x0, y1, sd * z]
            tris.append((col, [a, b, c2] if sd > 0 else [a, c2, b])); tris.append((col, [a, c2, d] if sd > 0 else [a, d, c2]))
    for x0, x1 in spec.get("windows", []):
        side_quads(x0, x1, *spec["win_y"], spec["win_col"])
    if spec.get("pillars"):                                # растянутое окно автобуса — стойки через ~1,25 м, в цвет кузова
        wy = [p[1] for c, t in tris if c == spec["mats"]["Windows"] for p in t]
        y0, y1 = min(wy), max(wy); n = round(st / 1.15)
        for k in range(1, n):
            x = -st / 2 + st * k / n
            side_quads(x - .06, x + .06, y0, y1, "tint", .02)
    out = {"L": round(max(p[0] for p in P) - min(p[0] for p in P), 2), "H": round(max(p[1] for p in P), 2), "W": spec["width"]}
    for part in ("tint", "fix"):
        verts, index, vmap, pal = [], [], {}, []
        for c, tri in tris:
            if bool(is_tint(c)) != (part == "tint"):
                continue
            cc = grey(c) if part == "tint" else c
            if cc not in pal:
                pal.append(cc)
            ci = pal.index(cc)
            for p in tri:
                key = (round(p[0] * 1000), round(p[1] * 1000), round(p[2] * 1000), ci)
                if key not in vmap:
                    vmap[key] = len(verts); verts.append(key)
                index.append(vmap[key])
        b64 = lambda fmt, arr: base64.b64encode(struct.pack("<%d%s" % (len(arr), fmt), *arr)).decode()
        d = {"p": b64("h", [c for v in verts for c in v[:3]]), "i": b64("H", index), "c": b64("B", [v[3] for v in verts]), "pal": ["%06x" % c for c in pal],
             "gl": [i for i, c in enumerate(pal) if part == "fix" and (c >> 16) > 200 and (c & 255) < 180]}   # фары и фонари светятся
        out[part] = d
        print(f"{name}.{part}: вершин {len(verts)}, треугольников {len(index) // 3}", file=sys.stderr)
    print(f"{name}: {out['L']} × {out['W']} × {out['H']} м", file=sys.stderr)
    return out


def main():
    html = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "arcade", "data", "vehicles.js")
    data = {n: convert(n, s) for n, s in MODELS.items()}
    js = "const VEHICLE_MODELS = " + json.dumps(data, separators=(",", ":")) + ";"
    src = open(html, encoding="utf8").read()
    new, n = re.subn(r"/\*MODELS-DATA\*/.*?/\*MODELS-DATA\*/", lambda m: "/*MODELS-DATA*/" + js + "/*MODELS-DATA*/", src, flags=re.S)
    if not n:
        sys.exit("нет маркеров /*MODELS-DATA*/ в " + html)
    open(html, "w", encoding="utf8").write(new)
    print(f"вшито {len(js) // 1024} КБ", file=sys.stderr)


if __name__ == "__main__":
    main()
