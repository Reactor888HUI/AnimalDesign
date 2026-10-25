# Кузов «восьмёрки» (нижняя часть до линии окон) в Blender по заводскому чертежу ВАЗ-2108 — вместо простой протяжки в игре.
#   blender -b --factory-startup --python tools/blender/vaz-body.py -- body.bin && python3 -I tools/build-vaz-body.py body.bin
# Таблицы (yTop, yBot, halfW, taper, оси и радиусы колёс) — те же, что в arcade/js/14-car.js (makeVaz2108): стёкла, стойки,
# фары, бамперы, молдинг остаются от игры и встают на своё место. Что лучше прежней протяжки:
#  · сечение из 12 точек вместо 6: подворот к порогу, лёгкая выпуклость двери (4 мм), ребро по плечу (760 мм), завал борта к окнам,
#    выпуклость капота по середине;
#  · арки — трапеция со скруглёнными углами (как на чертеже и фото) и отбортовкой: край арки выдавлен наружу на ~12 мм;
#  · затенение (AO) с землёй и колёсами запекается Cycles в цвет вершин — темнее в арках и у порога.
# Оси: строим сразу в осях игры (x — вперёд, y — вверх, z — вправо) в Blender как (X, −Z… см. G) и пишем в осях игры.
# Выход: JSON-заголовок + треугольники «paint» (x, y, z, nx, ny, nz, ao, 0, 0) float32 — формат tools/build-wheel.py.
import bpy, bmesh, math, sys, json, struct
from mathutils import Vector
out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)       # без стандартного кубика: он внутри кузова и затенял борта при запекании
H = lambda mm: mm / 1000 - .65                    # высота по чертежу → игра (земля на −0,65)
X = lambda mm: 2.003 - mm / 1000                  # «от переднего бампера» → x игры
def tab(t, x):
    if x <= t[0][0]: return t[0][1]
    for i in range(1, len(t)):
        if x <= t[i][0]:
            (x0, y0), (x1, y1) = t[i - 1], t[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return t[-1][1]
XF, XR, RF, RR, YW = X(785), X(3245), .372, .352, H(288)
TOP = [[X(4006), H(570)], [X(3963), H(585)], [X(3942), H(832)], [X(3884), H(945)], [X(2954), H(955)], [X(1120), H(985)],
       [X(951), H(952)], [X(737), H(922)], [X(451), H(877)], [X(215), H(825)], [X(150), H(810)], [X(86), H(720)], [X(43), H(622)], [X(0), H(592)]]
BOT = [[X(4006), H(300)], [X(3640), H(300)], [X(3560), H(180)], [X(560), H(180)], [X(480), H(337)], [X(0), H(337)]]
HALF = [[X(4006), .77], [X(3940), .81], [X(3800), .825], [X(250), .825], [X(110), .79], [X(0), .70]]
TAPER = [[X(3884), .95], [X(3500), .985], [X(2900), 1], [X(1700), 1], [X(1120), .87]]
yTop = lambda x: tab(TOP, x); halfW = lambda x: tab(HALF, x); taper = lambda x: tab(TAPER, x)
def arch(x):
    """Высота верха арки над точкой x (или None вне арки): трапеция чертежа со скруглёнными углами."""
    for c, r in ((XF, RF), (XR, RR)):
        d = abs(x - c); top, a, b = YW + r * 1.02, r * .55, r * 1.12
        if d < b:
            if d < a: return top
            t = (d - a) / (b - a); s = t * t * (3 - 2 * t) * .35 + t * .65         # скругление верхних углов
            return top - s * (top - YW - .02)
    return None
def yBot(x):
    y = tab(BOT, x); a = arch(x)
    return max(y, a) if a is not None else y
def crown(x):                                      # выпуклость капота: от лобового (1120) до передка (150), середина +22 мм
    if X(1120) > x > X(150): t = (X(1120) - x) / (X(1120) - X(150)); return .022 * math.sin(math.pi * min(1, t * 1.15))
    return 0
def bulge(x):                                      # выпуклость двери/боковины между арками: до 4 мм в середине (молдинг и щели в игре — на 6 мм снаружи)
    if XR + RR * 1.2 < x < XF - RF * 1.2: t = (x - (XR + RR * 1.2)) / ((XF - RF * 1.2) - (XR + RR * 1.2)); return .004 * math.sin(math.pi * t)
    return 0
def section(x):
    """Правая половина сечения снизу вверх: (z, y). Порог → борт → ребро плеча → завал к окнам → верх (капот/пояс)."""
    yb, yt, w = yBot(x), yTop(x), halfW(x); yt = max(yt, yb + .03)
    ySh = min(max(H(760), yb + .07), yt - .025)
    wt = min(w - .04, taper(x) * .762 + .01)
    pts = [(0, yb), (w - .07, yb), (w - .028, yb + .01), (w - .007, yb + .038), (w, yb + .075),
           (w + bulge(x), (yb + .075 + ySh) / 2), (w + .001, ySh - .012), (w + .004, ySh),
           (wt + (w - wt) * .45, ySh + (yt - ySh) * .55), (wt, yt), (wt * .55, yt + crown(x) * .8), (0, yt + crown(x))]
    for i in range(1, len(pts)):                   # высоты не убывают (у арок нижняя часть сжимается)
        if pts[i][1] < pts[i - 1][1] + .002 and i <= 8: pts[i] = (pts[i][0], pts[i - 1][1] + .002)
    return pts
# x — гуще у арок (видно скругление), иначе ~3 см
xs, x = [], X(4006)
while x < X(0):
    xs.append(x); near = min(abs(x - XF), abs(x - XR)) < .5
    x += .012 if near else .03
xs.append(X(0))
G = lambda x, y, z: (x, -z, y)                     # игра → Blender
bm = bmesh.new(); rings = []
for x in xs:
    half = section(x); ring = [bm.verts.new(G(x, y, z)) for z, y in half] + [bm.verts.new(G(x, y, -z)) for z, y in reversed(half[1:-1])]
    rings.append(ring)
n = len(rings[0])
for k in range(len(rings) - 1):
    A, B = rings[k], rings[k + 1]
    for i in range(n):
        j = (i + 1) % n; bm.faces.new((A[i], A[j], B[j], B[i]))
for R in (rings[0], rings[-1]):
    c = bm.verts.new(sum((v.co for v in R), Vector()) / len(R))
    for i in range(n): bm.faces.new((c, R[i], R[(i + 1) % n]) if R is rings[-1] else (c, R[(i + 1) % n], R[i]))
# отбортовка арок: точки борта рядом с краем арки выдавливаются наружу (до 12 мм), к 6 см от края — на нет
for R, x in zip(rings, xs):
    a = arch(x)
    for v in R:
        gx, gy, gz = v.co.x, v.co.z, -v.co.y
        if abs(gz) < halfW(x) - .03: continue
        ds = []
        for c, r in ((XF, RF), (XR, RR)):
            for k in range(41):
                px = c - r * 1.12 + 2 * r * 1.12 * k / 40; py = arch(px)
                if py is not None: ds.append(math.hypot(gx - px, gy - py))
        d = min(ds) if ds else 9
        if d < .06 and gy >= (a if a is not None else -9) - .001: v.co.y += -math.copysign(.012 * (1 - d / .06) ** 1.5, gz)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new("body"); bm.to_mesh(me); bm.free()
body = bpy.data.objects.new("body", me); bpy.context.scene.collection.objects.link(body)
for p in me.polygons: p.use_smooth = True
try: me.set_sharp_from_angle(angle=math.radians(38))
except Exception: pass
mat = bpy.data.materials.new("paint"); mat.use_nodes = True; me.materials.append(mat)
# сцена для затенения: земля и колёса (их в вывод не берём)
bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, -.65)); ground = bpy.context.active_object
wheels = []
for c, z in ((XF, .7), (XF, -.7), (XR, .685), (XR, -.685)):
    bpy.ops.mesh.primitive_cylinder_add(radius=.288, depth=.165, vertices=24, location=G(c, YW, z), rotation=(math.pi / 2, 0, 0)); wheels.append(bpy.context.active_object)
me.color_attributes.new("ao", "FLOAT_COLOR", "CORNER"); me.attributes.active_color_name = "ao"
sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.samples = 64; sc.cycles.device = "CPU"
sc.render.bake.target = "VERTEX_COLORS"; sc.world = bpy.data.worlds.new("w"); sc.world.color = (1, 1, 1)
sc.render.bake.use_selected_to_active = False
for o in bpy.data.objects: o.select_set(False)
body.select_set(True); bpy.context.view_layer.objects.active = body
bpy.ops.object.bake(type="AO")
# вывод: треугольники с угловыми нормалями и AO — в осях игры
me.calc_loop_triangles()
try: me.calc_normals_split()
except Exception: pass
ao = me.color_attributes["ao"].data; rows = []
for tri in me.loop_triangles:
    for li in tri.loops:
        l = me.loops[li]; v = me.vertices[l.vertex_index].co; nn = l.normal
        rows.append((v.x, v.z, -v.y, nn.x, nn.z, -nn.y, ao[li].color[0], 0, 0))
with open(out, "wb") as f:
    h = json.dumps({"paint": len(rows)}).encode(); f.write(struct.pack("<I", len(h))); f.write(h)
    for r in rows: f.write(struct.pack("<9f", *r))
print("КУЗОВ", len(rows) // 3, "треугольников, сечений", len(xs), "точек в кольце", n)
