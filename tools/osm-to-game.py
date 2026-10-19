"""Выгрузка OpenStreetMap (.osm) → данные карты для «Восьмёрки Баклан».

Запуск: python3 -I tools/osm-to-game.py arcade/refs/rostov-center.osm arcade/index.html
Пишет JSON между маркерами /*OSM-DATA*/ … /*/OSM-DATA*/ в index.html.

Координаты игры: метры, x — вдоль автобана, z — поперёк, «север» карты смотрит на автобан (+z).
Полоса карты повёрнута на 180°: старый центр примыкает к автобану, левый берег — дальше всего.
Данные © участники OpenStreetMap, лицензия ODbL.
"""
import sys, math, json, re, hashlib
import xml.etree.ElementTree as ET

SRC, DST = sys.argv[1], sys.argv[2]
X_CENTER, Z_TOP = 280.0, -82.0          # середина полосы по x и её «верхний» край у автобана

root = ET.parse(SRC).getroot()
bd = root.find("bounds").attrib
LA0, LA1, LO0, LO1 = (float(bd[k]) for k in ("minlat", "maxlat", "minlon", "maxlon"))
KX = 111320 * math.cos(math.radians((LA0 + LA1) / 2)); KY = 110574
W, H = (LO1 - LO0) * KX, (LA1 - LA0) * KY

def local(lat, lon): return ((lon - LO0) * KX, (lat - LA0) * KY)
def game(e, n): return (X_CENTER - (e - W / 2), Z_TOP - (H - n))

nodes = {n.get("id"): (local(float(n.get("lat")), float(n.get("lon"))), {t.get("k"): t.get("v") for t in n.findall("tag")}) for n in root.iter("node")}
ways = {}
for w in root.iter("way"):
    ways[w.get("id")] = ([x.get("ref") for x in w.findall("nd")], {t.get("k"): t.get("v") for t in w.findall("tag")})

# --- отсечение по рамке выгрузки
def clip_poly(pts):
    def clip(pts, inside, inter):
        out = []
        for i in range(len(pts)):
            a, b = pts[i - 1], pts[i]
            if inside(b):
                if not inside(a): out.append(inter(a, b))
                out.append(b)
            elif inside(a): out.append(inter(a, b))
        return out
    def ix(x0): return lambda a, b: (x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0]))
    def iy(y0): return lambda a, b: (a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0)
    for inside, inter in ((lambda p: p[0] >= 0, ix(0)), (lambda p: p[0] <= W, ix(W)), (lambda p: p[1] >= 0, iy(0)), (lambda p: p[1] <= H, iy(H))):
        if not pts: break
        pts = clip(pts, inside, inter)
    return pts

def clip_line(pts):
    """Отрезки полилинии внутри рамки (Лян — Барски по каждому отрезку)."""
    out, cur = [], []
    for a, b in zip(pts, pts[1:]):
        t0, t1, dx, dy = 0.0, 1.0, b[0] - a[0], b[1] - a[1]
        ok = True
        for p, q in ((-dx, a[0]), (dx, W - a[0]), (-dy, a[1]), (dy, H - a[1])):
            if p == 0:
                if q < 0: ok = False; break
            else:
                r = q / p
                if p < 0: t0 = max(t0, r)
                else: t1 = min(t1, r)
        if not ok or t0 > t1:
            if len(cur) > 1: out.append(cur)
            cur = []; continue
        A = (a[0] + dx * t0, a[1] + dy * t0); B = (a[0] + dx * t1, a[1] + dy * t1)
        if not cur: cur = [A]
        cur.append(B)
        if t1 < 1:
            out.append(cur); cur = []
    if len(cur) > 1: out.append(cur)
    return out

def pts_of(refs): return [nodes[r][0] for r in refs if r in nodes]
def enc(pts): return [round(v * 10) for p in (game(*q) for q in pts) for v in p]
def area(p): return abs(sum(p[i - 1][0] * p[i][1] - p[i][0] * p[i - 1][1] for i in range(len(p)))) / 2

def join_rings(refs_list):
    """Склеить куски мультиполигона в кольца по общим узлам; незамкнутые замыкаются прямой."""
    segs = [list(r) for r in refs_list if r]
    rings = []
    while segs:
        cur = segs.pop(0)
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]: cur += s[1:]
                elif s[-1] == cur[-1]: cur += s[::-1][1:]
                elif s[-1] == cur[0]: cur = s + cur[1:]
                elif s[0] == cur[0]: cur = s[::-1] + cur[1:]
                else: continue
                segs.pop(i); changed = True; break
        rings.append(cur)
    return rings

def polys(outer_refs, inner_refs=()):
    """Внешние и внутренние кольца → отсечённые многоугольники (локальные метры)."""
    outs = [clip_poly(pts_of(r[:-1] if r[0] == r[-1] else r)) for r in outer_refs]
    ins = [clip_poly(pts_of(r[:-1] if r[0] == r[-1] else r)) for r in inner_refs]
    return [p for p in outs if len(p) > 2 and area(p) > 1], [p for p in ins if len(p) > 2 and area(p) > 1]

def inside(pt, poly):
    x, y, c = pt[0], pt[1], False
    for i in range(len(poly)):
        (x0, y0), (x1, y1) = poly[i - 1], poly[i]
        if (y0 > y) != (y1 > y) and x < x0 + (x1 - x0) * (y - y0) / (y1 - y0): c = not c
    return c

def seed(s): return int(hashlib.md5(s.encode()).hexdigest()[:8], 16) / 0xffffffff

# --- мультиполигоны: переносим их теги на «сборные» объекты
areas_src = []   # (tags, outer_ref_rings, inner_ref_rings, id)
used_ways = set()
for rel in root.iter("relation"):
    t = {x.get("k"): x.get("v") for x in rel.findall("tag")}
    if t.get("type") != "multipolygon": continue
    outer = [ways[m.get("ref")][0] for m in rel.findall("member") if m.get("type") == "way" and m.get("ref") in ways and m.get("role") != "inner"]
    inner = [ways[m.get("ref")][0] for m in rel.findall("member") if m.get("type") == "way" and m.get("ref") in ways and m.get("role") == "inner"]
    if not outer: continue
    for m in rel.findall("member"):
        if m.get("type") == "way" and m.get("ref") in ways and not {k for k in ways[m.get("ref")][1] if k not in ("source", "note")}: used_ways.add(m.get("ref"))
    areas_src.append((t, join_rings(outer), join_rings(inner), "r" + rel.get("id")))
for wid, (refs, t) in ways.items():
    if len(refs) > 3 and refs[0] == refs[-1] and wid not in used_ways: areas_src.append((t, [refs], [], "w" + wid))
# река Дон: в выгрузке только часть контура — незамкнутый край замыкается по рамке при отсечении
for wid, (refs, t) in ways.items():
    if t.get("natural") == "water" and refs[0] != refs[-1]: areas_src.append((t, [refs], [], "w" + wid))

LEVEL_H = 3.2
def building_h(t, ring, key):
    try:
        if "height" in t: return max(3, float(re.sub(r"[^\d.]", "", t["height"]) or 0))
    except ValueError: pass
    if "building:levels" in t:
        try: return float(t["building:levels"]) * LEVEL_H + 1
        except ValueError: pass
    b, a, j = t.get("building", "yes"), area(ring), seed(key)
    if b in ("garage", "garages", "shed", "kiosk", "hut", "toilets", "roof", "carport", "gatehouse"): return 3 + j
    if b in ("industrial", "warehouse", "service", "hangar", "transformer_tower"): return 7 + 5 * j
    if b in ("apartments", "residential"): return (5 + round(j * 4)) * LEVEL_H + 1
    if b == "stadium": return 32
    if a < 60: return 3.5 + j
    if a < 250: return (2 + round(j * 2)) * LEVEL_H + 1
    if a < 900: return (3 + round(j * 3)) * LEVEL_H + 1
    return (4 + round(j * 5)) * LEVEL_H + 1

def bkind(t):
    b = t.get("building", "yes")
    if b in ("industrial", "warehouse", "service", "garage", "garages", "shed", "hangar"): return 1
    if b in ("commercial", "retail", "office", "school", "university", "public", "kindergarten", "hotel", "civic"): return 2
    if b == "stadium": return 4
    if "name" in t or "historic" in t or "heritage" in t: return 3
    return 0

AREA_KIND = [
    ("w", lambda t: t.get("natural") == "water" or "water" in t or t.get("waterway") == "riverbank"),
    ("b", lambda t: t.get("natural") in ("beach", "sand")),
    ("f", lambda t: t.get("natural") in ("wood", "scrub") or t.get("landuse") == "forest"),
    ("s", lambda t: t.get("leisure") in ("pitch", "track", "playground", "fitness_station")),
    ("g", lambda t: t.get("landuse") in ("grass", "flowerbed", "meadow", "village_green") or t.get("natural") == "grassland" or t.get("leisure") in ("park", "garden")),
    ("k", lambda t: t.get("amenity") == "parking" or t.get("highway") == "pedestrian" or t.get("place") == "square"),
    ("c", lambda t: t.get("landuse") in ("construction", "industrial", "railway", "brownfield")),
]
out = {"b": [], "a": [], "r": [], "l": [], "t": [], "z": [], "p": [], "n": [], "bounds": [round(v * 10) for v in game(0, 0) + game(W, H)]}
names = {}
def name_idx(n):
    if n not in names: names[n] = len(names); out["n"].append(n)
    return names[n]

for t, outer, inner, key in areas_src:
    outs, ins = polys(outer, inner)
    if not outs: continue
    if "building" in t or "building:part" in t:
        if t.get("building") in ("no",) : continue
        for p in outs:
            h = building_h(t, p, key)
            holes = [q for q in ins if inside(q[0], p)]
            out["b"].append([round(h * 10), bkind(t), [enc(p)] + [enc(q) for q in holes], name_idx(t["name"]) if "name" in t else -1])
        continue
    for k, f in AREA_KIND:
        if f(t):
            for p in outs: out["a"].append([k, [enc(p)] + [enc(q) for q in ins if inside(q[0], p)]])
            break
    nm = t.get("name")
    if nm and (t.get("leisure") or t.get("natural") == "water" or t.get("landuse") or t.get("place") or t.get("natural") == "beach") and len(nm) < 40:
        for p in outs:
            if area(p) > 4000: out["z"].append([name_idx(nm), enc(p)])

ROAD = {"primary": 0, "secondary": 0, "trunk": 0, "primary_link": 0, "secondary_link": 0, "trunk_link": 0, "tertiary": 1, "tertiary_link": 1,
        "residential": 2, "unclassified": 2, "living_street": 2, "service": 3, "track": 3, "raceway": 3,
        "footway": 4, "path": 4, "pedestrian": 4, "steps": 4, "cycleway": 4}
for wid, (refs, t) in ways.items():
    h = t.get("highway")
    if h in ROAD and not (refs[0] == refs[-1] and t.get("area") == "yes"):
        for seg in clip_line(pts_of(refs)):
            out["r"].append([ROAD[h], name_idx(t["name"]) if "name" in t else -1, 1 if t.get("bridge") else 0, enc(seg)])
    elif t.get("railway") in ("rail", "tram", "light_rail"):
        for seg in clip_line(pts_of(refs)): out["l"].append([0 if t["railway"] == "rail" else 1, enc(seg)])
    elif t.get("man_made") == "pier" and refs[0] != refs[-1]:
        for seg in clip_line(pts_of(refs)): out["p"].append(enc(seg))
    elif t.get("natural") == "tree_row":
        for seg in clip_line(pts_of(refs)):
            for a, b in zip(seg, seg[1:]):
                L = math.dist(a, b)
                for i in range(int(L // 7) + 1):
                    k = i * 7 / L if L else 0
                    out["t"] += enc([(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k)])
for (p, t) in nodes.values():
    if t.get("natural") == "tree" and 0 <= p[0] <= W and 0 <= p[1] <= H: out["t"] += enc([p])

js = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
html = open(DST, encoding="utf8").read()
new = re.sub(r"/\*OSM-DATA\*/.*?/\*/OSM-DATA\*/", lambda m: "/*OSM-DATA*/" + js + "/*/OSM-DATA*/", html, count=1, flags=re.S)
assert new != html or "/*OSM-DATA*/" + js in html, "в index.html нет маркеров /*OSM-DATA*/ … /*/OSM-DATA*/"
open(DST, "w", encoding="utf8").write(new)
print(f"полоса {W:.0f}×{H:.0f} м: домов {len(out['b'])}, дорог {len(out['r'])}, площадей {len(out['a'])}, деревьев {len(out['t']) // 2}, зон {len(out['z'])}, {len(js) // 1024} КБ")
