# Руль внедорожника в Blender (запуск без интерфейса):
#   blender -b --factory-startup --python tools/blender/wheel.py -- out.bin
# Пропорции сняты с фото руля в лоб (доли наружного диаметра обода 0,362 м). Оси Blender: X — вправо, Z — вверх, Y — к панели
# (водитель со стороны −Y). Детали: обод (перфорация по бокам и внизу, тёмная кромка), подушка-«подушечка» со строчкой,
# шильдик без надписи, сенсорные блоки с круглым переключателем и хромированным кантом, лепестки, спицы светлой кожи,
# нижняя хромированная рамка. Затенение в углах (AO) запекается Cycles в цвет вершин. Выход — простой двоичный файл:
# заголовок JSON + по материалу: позиции, нормали, AO, UV, индексы (float32/uint32), его пакует tools/build-wheel.py.
import bpy, bmesh, math, sys, json, struct
from mathutils import Vector
out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
MAT = {}
def mat(name):
    if name not in MAT: MAT[name] = bpy.data.materials.new(name)
    return MAT[name]
objs = []
def finish(o, m):
    o.data.materials.append(mat(m)); objs.append(o); return o
def mesh_obj(name, bm):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o); return o
def bevel(o, w, seg=3):
    m = o.modifiers.new("b", "BEVEL"); m.width = w; m.segments = seg; m.limit_method = "ANGLE"
def smooth(o):
    for p in o.data.polygons: p.use_smooth = True
def apply_all(o):
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    o.select_set(False)
OD = .362; s = OD / 710                       # метров на пиксель фото (×2), центр руля на фото — (400, 392)
px = lambda x: (x - 400) * s; pz = lambda y: (392 - y) * s
# ---- обод: тор, сплюснут по глубине; материалы по углу и по внешней кромке
RC, RT = .1675, .0138
bpy.ops.mesh.primitive_torus_add(major_radius=RC, minor_radius=RT, major_segments=128, minor_segments=20, rotation=(math.pi / 2, 0, 0))
rim = bpy.context.active_object; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bm = bmesh.new(); bm.from_mesh(rim.data)
for v in bm.verts: v.co.y *= 1.3
for m in ("ivory", "perf", "edge"): rim.data.materials.append(mat(m))
for f in bm.faces:
    c = f.calc_center_median(); a = math.degrees(math.atan2(c.z, c.x)); r = math.hypot(c.x, c.z)
    side = abs(a) < 62 or abs(a) > 118 or (-150 < a < -30)          # бока и низ — перфорация, верх — гладкий
    f.material_index = 2 if r > RC + RT * .62 else (1 if side else 0)
bm.to_mesh(rim.data); bm.free(); smooth(rim); objs.append(rim)
# ---- подушка: «скругленный квадрат» (суперэллипс), низ уже, выпуклая; задняя часть уходит к ступице
AX, AZ, AC = (555 - 258) / 2 * s, (600 - 283) / 2 * s, pz((283 + 600) / 2)
def outline(th):
    c, sn = math.cos(th), math.sin(th); n = 3.2
    x = AX * math.copysign(abs(c) ** (2 / n), c); z = AZ * math.copysign(abs(sn) ** (2 / n), sn)
    x *= 1 - .07 * max(0, -z / AZ); return x, z + AC
NT, NR = 96, 14
bm = bmesh.new(); rings = []
prof = [(t / NR, -.031 - .013 * (1 - (t / NR) ** 2.4)) for t in range(NR + 1)] + [(1.035, -.024), (1.05, -.013), (1.05, .004), (.8, .02)]
for (t, y) in prof:
    ring = []
    for i in range(NT):
        x, z = outline(i / NT * 2 * math.pi); ring.append(bm.verts.new(((x) * t, y, (z - AC) * t + AC)))
    rings.append(ring)
for a, b in zip(rings[1:], rings[2:]):
    for i in range(NT): bm.faces.new((a[i], a[(i + 1) % NT], b[(i + 1) % NT], b[i]))
c0 = bm.verts.new((0, prof[0][1], AC))
for i in range(NT): bm.faces.new((c0, rings[1][(i + 1) % NT], rings[1][i]))
bm.normal_update()
for f in bm.faces:
    if f.normal.y > 0 and f.calc_center_median().y < -.02: f.normal_flip()
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bag = finish(mesh_obj("bag", bm), "ivory"); smooth(bag)
# строчка по контуру подушки (тонкая тёмная трубка на поверхности)
def surf_y(t): return -.031 - .013 * (1 - t ** 2.4)
pts = []
for i in range(97):
    x, z = outline(i / 96 * 2 * math.pi); t = .9; pts.append((x * t, surf_y(t) - .0009, (z - AC) * t + AC))
cu = bpy.data.curves.new("st", "CURVE"); cu.dimensions = "3D"; sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1)
for p, q in zip(sp.points, pts): p.co = (*q, 1)
cu.bevel_depth = .0007; cu.bevel_resolution = 1
st = bpy.data.objects.new("stitch", cu); bpy.context.collection.objects.link(st); bpy.context.view_layer.objects.active = st; st.select_set(True); bpy.ops.object.convert(target="MESH"); st.select_set(False)
finish(st, "piano")
# ---- шильдик: хромированная пластина, внутри — тёмная полоса (без надписи)
def box(name, size, loc, m, bev=0, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o = bpy.context.active_object; o.name = name; o.scale = size
    if rot: o.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if bev: bevel(o, bev); apply_all(o)
    return finish(o, m)
by = surf_y(0) - .0012
box("badge", (.085, .003, .0112), (0, by, pz(399)), "chrome", .0012)
box("badgeIn", (.079, .002, .0066), (0, by - .0016, pz(399)), "piano")
# ---- сенсорные блоки: скругл. прямоугольник 0,045×0,088, хромированный кант, наверху круглый переключатель
def rrect_obj(name, w, h, depth, r, loc, m, bev=.002):
    bm = bmesh.new(); seg = 6; pts = []
    for cx, cz, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for k in range(seg + 1): a = math.radians(a0 + 90 * k / seg); pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    f = bm.faces.new([bm.verts.new((x, 0, z)) for x, z in pts]); ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in ext["geom"]:
        if isinstance(v, bmesh.types.BMVert): v.co.y += depth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_obj(name, bm); o.location = loc; bpy.context.view_layer.objects.active = o; o.select_set(True); bpy.ops.object.transform_apply(location=True); o.select_set(False)
    if bev: bevel(o, bev, 3); apply_all(o)
    return finish(o, m)
pads = []
for k in (-1, 1):
    cx, cz = k * abs(px(208)), pz(405)
    rrect_obj("podRim", .049, .092, .008, .018, (cx, -.024, cz), "chrome", .0015)
    rrect_obj("pod", .045, .088, .012, .016, (cx, -.034, cz), "piano", .0025)
    # лицевая плоскость со значками (UV: левый блок — левая половина текстуры)
    bm = bmesh.new(); w, h = .04, .082; vs = [bm.verts.new((cx + x, -.0392, cz + z)) for x, z in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]
    f = bm.faces.new(vs); uvl = bm.loops.layers.uv.new("UVMap")
    for l, (u, v) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): l[uvl].uv = ((u + (1 if k > 0 else 0)) / 2, v)
    pads.append(finish(mesh_obj("pad", bm), "pad"))
    bpy.ops.mesh.primitive_torus_add(major_radius=.0175, minor_radius=.0019, major_segments=40, minor_segments=8, location=(cx, -.0396, cz + .02), rotation=(math.pi / 2, 0, 0)); smooth(bpy.context.active_object); finish(bpy.context.active_object, "chrome")
    box("paddle", (.03, .004, .062), (k * .138, .022, pz(330)), "chrome", .0015, (0, k * .45, 0))
# ---- спицы светлой кожи: боковые (за блоками) и нижняя, скруглённые фаской
for k in (-1, 1): box("spoke", (.1, .022, .078), (k * .118, -.002, -.006), "ivory", .008)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -.004, pz(560) - .03)); lo = bpy.context.active_object; lo.scale = (.14, .022, .1); bpy.ops.object.transform_apply(scale=True)
bm = bmesh.new(); bm.from_mesh(lo.data)
for v in bm.verts:
    if v.co.z < pz(560) - .03: v.co.x *= .82                      # нижняя спица сужается к ободу
bm.to_mesh(lo.data); bm.free(); bevel(lo, .01); apply_all(lo); finish(lo, "ivory")
# нижняя рамка: хромированное «окно» со скруглённым низом, внутри тёмная вставка
fx0, fx1, fz0, fz1 = px(300), px(520), pz(690), pz(585)
fw, fh, fcz = fx1 - fx0, fz1 - fz0, (fz0 + fz1) / 2
rrect_obj("frame", fw, fh, .008, .014, (0, -.024, fcz), "chrome", .0015)
rrect_obj("frameIn", fw - .016, fh - .014, .006, .009, (0, -.0255, fcz), "piano", 0)
# ступица сзади (тёмный кожух к колонке)
bpy.ops.mesh.primitive_cylinder_add(radius=.06, depth=.05, vertices=32, location=(0, .03, -.01), rotation=(math.pi / 2, 0, 0)); finish(bpy.context.active_object, "piano")
# ---- AO: объединяем и запекаем в цвет вершин
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join(); W = bpy.context.active_object
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
W.data.color_attributes.new("ao", "FLOAT_COLOR", "CORNER"); W.data.attributes.active_color_name = "ao"
sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.samples = 48; sc.cycles.device = "CPU"
sc.render.bake.target = "VERTEX_COLORS"; sc.world = bpy.data.worlds.new("w"); sc.world.color = (1, 1, 1)
for m in W.data.materials: m.use_nodes = True
bpy.ops.object.bake(type="AO")
# ---- вывод: по материалу — треугольники с нормалями (угловыми), AO, UV
me = W.data; me.calc_loop_triangles()
try: me.calc_normals_split()
except Exception: pass
ao = me.color_attributes["ao"].data; uvl = me.uv_layers[0].data if me.uv_layers else None
groups = {}
for tri in me.loop_triangles:
    g = groups.setdefault(me.materials[tri.material_index].name, [])
    for li in tri.loops:
        l = me.loops[li]; v = me.vertices[l.vertex_index].co; n = l.normal; c = ao[li].color; uv = uvl[li].uv if uvl else (0, 0)
        g.append((v.x, v.y, v.z, n.x, n.y, n.z, c[0], uv[0], uv[1]))
hdr = {k: len(v) for k, v in groups.items()}
with open(out, "wb") as f:
    h = json.dumps(hdr).encode(); f.write(struct.pack("<I", len(h))); f.write(h)
    for k, v in groups.items():
        for row in v: f.write(struct.pack("<9f", *row))
print("WHEEL", hdr)
