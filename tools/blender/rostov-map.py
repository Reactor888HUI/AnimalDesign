# Low-poly карта центра Ростова-на-Дону для браузерной игры (Three.js): OpenStreetMap → Blosm → Blender → .glb (Draco).
#   blender -b --python tools/blender/rostov-map.py -- карта.osm выход.glb [радиус_м=1500] [мин_площадь_дома_м²=80]
#   карта.osm — выгрузка api.openstreetmap.org + tools/osm-add-relations.py (Дон целиком); просмотр — tools/rostov-map-view.html
# Нужен установленный и включённый аддон Blosm (расширение; см. docs/HANDOFF.md). Шаги:
#  1) импорт Blosm: здания (экструзия по height / building:levels), дороги и рельсы, вода, лес/зелень, пешеходные зоны;
#     упрощение контуров — straightAngleThreshold (почти прямые вершины выкидываются); без дозагрузки с Overpass;
#  2) обрезка по кругу радиуса R от центра (площади — разрезами плоскостями: Дон — одна огромная грань); очистка: пустышки, профили дорог, кривые, объекты без граней;
#  3) дороги — свои плоские ленты по точкам кривых Blosm (упрощение Дугласа—Пекера), поперёк 4 вершины: асфальт | разметка | асфальт;
#     разметка (белая осевая) — цветом вершин; уровни по классу дорог, чтобы не мерцали на перекрёстках;
#  4) здания: растворение копланарных граней (меньше треугольников), цвет фасада и крыши на здание — цвет вершин;
#  5) вода, парки, площади, подложка — плоские сетки своего цвета;
#  6) один общий материал (цвет вершин, без текстур), плоское затенение: нормали не пишутся — по стандарту glTF движок считает
#     плоские нормали сам (в Three.js: flatShading); сетки режутся по сетке квадратов, ≤ 65 535 вершин на объект (16-бит индексы);
#  7) экспорт .glb, +Y вверх, модификаторы применены, Draco.
import bpy, bmesh, math, sys, os, time, random, json
from mathutils import Vector
args = sys.argv[sys.argv.index("--") + 1:]
OSM, OUT = args[0], args[1]; R = float(args[2]) if len(args) > 2 else 1500.0
MINFOOT = float(args[3]) if len(args) > 3 else 80.0     # постройки меньше (м² в плане) — сараи, гаражи, будки — не берём
KEY = [k for k in bpy.context.preferences.addons.keys() if "blosm" in k][0]
bpy.ops.wm.read_homefile(use_empty=True)
prefs = bpy.context.preferences.addons[KEY].preferences; prefs.dataDir = os.path.join(os.path.dirname(OUT), "blosm-data"); os.makedirs(prefs.dataDir, exist_ok=True)
b = bpy.context.scene.blosm
b.mode = "3Dsimple"; b.dataType = "osm"; b.osmSource = "file"; b.osmFilepath = OSM; b.loadMissingMembers = False
b.buildings = True; b.highways = True; b.railways = True; b.water = True; b.forests = True; b.vegetation = True
b.singleObject = True; b.straightAngleThreshold = 168.0          # упрощение контуров: углы ≥ 168° считаются прямой
t0 = time.time(); bpy.ops.blosm.import_data(); print(f"Blosm: {time.time() - t0:.1f} с")
CLR = lambda h: ((h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255)
# ---------- 3) дороги: свои ленты ----------
ROAD = {  # класс: (ширина, цвет асфальта, разметка, уровень)
    "roads_primary": (14, 0x4a4c50, True, .10), "roads_secondary": (11, 0x505256, True, .09), "roads_tertiary": (9, 0x56585c, True, .08),
    "roads_unclassified": (6, 0x5c5e62, False, .07), "roads_residential": (6.5, 0x5c5e62, False, .07), "roads_service": (4, 0x66686b, False, .06),
    "roads_pedestrian": (6, 0xb9b2a6, False, .05), "paths_footway": (2.2, 0xc4bdb1, False, .04), "paths_cycleway": (2.2, 0xa7616a, False, .045),
    "paths_steps": (2, 0xb0a99c, False, .04), "railways": (3.6, 0x5a4a3e, False, .055)}
def rdp(P, eps):
    if len(P) < 3: return P
    a, b2 = P[0], P[-1]; ab = b2 - a; L = ab.length or 1e-9; dmax, idx = 0, 0
    for i in range(1, len(P) - 1):
        d = (ab.cross(P[i] - a)).length / L if L > 1e-9 else (P[i] - a).length
        if d > dmax: dmax, idx = d, i
    return rdp(P[:idx + 1], eps)[:-1] + rdp(P[idx:], eps) if dmax > eps else [a, b2]
road_bm = bmesh.new(); rcol = road_bm.loops.layers.color.new("Col")
nroads = 0
for o in list(bpy.data.objects):
    if o.type != "CURVE" or o.name.startswith("profile"): continue
    cls = next((k for k in ROAD if o.name.endswith(k)), None)
    if not cls: continue
    W, hexc, mark, lvl = ROAD[cls]; ca, cm = (*CLR(hexc), 1), (.95, .95, .92, 1)
    M = o.matrix_world
    for sp in o.data.splines:
        pts = [M @ Vector(p.co[:3]) for p in (sp.points if sp.type == "POLY" else sp.bezier_points)]
        pts = [Vector((p.x, p.y, 0)) for p in pts]
        # обрезка кругом R
        segs, cur = [], []
        for p in pts:
            if p.length <= R: cur.append(p)
            elif cur: segs.append(cur); cur = []
        if cur: segs.append(cur)
        for P in segs:
            P = rdp(P, 1.0)
            if len(P) < 2: continue
            nroads += 1; prev = None
            offs = [-W / 2, -.12, .12, W / 2] if mark else [-W / 2, W / 2]
            for i, p in enumerate(P):
                d0 = (p - P[i - 1]).normalized() if i > 0 else None; d1 = (P[i + 1] - p).normalized() if i < len(P) - 1 else None
                t = (d0 + d1).normalized() if d0 and d1 and (d0 + d1).length > 1e-6 else (d0 or d1)
                n = Vector((-t.y, t.x, 0)); k = 1.0
                if d0 and d1: k = min(2.0, 1 / max(.3, n.dot(Vector((-d0.y, d0.x, 0)))))   # стык: немного шире на поворотах
                row = [road_bm.verts.new(p + n * o_ * k + Vector((0, 0, lvl))) for o_ in offs]
                if prev:
                    for j in range(len(row) - 1):
                        f = road_bm.faces.new((prev[j], row[j], row[j + 1], prev[j + 1]))   # нормаль вверх
                        c = cm if (mark and j == 1) else ca
                        for l in f.loops: l[rcol] = c
                prev = row
print("дорог (отрезков):", nroads)
rm = bpy.data.meshes.new("roads"); road_bm.to_mesh(rm); road_bm.free(); roads = bpy.data.objects.new("roads", rm); bpy.context.scene.collection.objects.link(roads)
# ---------- 2) очистка ----------
for o in list(bpy.data.objects):
    if o.type != "MESH" or (o.type == "MESH" and len(o.data.polygons) == 0): bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.curves): bpy.data.curves.remove(c)
# ---------- 4–5) цвет вершин по слоям, обрезка, упрощение ----------
WALLS = [0xe8dcc4, 0xe2c99a, 0xd9b48f, 0xcfc6b8, 0xefe9dc, 0xd7b3a3, 0xc9d0d3, 0xe6d3a3]
ROOFS = [0x7a3e30, 0x6a6f74, 0x8c4f3a, 0x5d6b5f, 0x8a8f94, 0x9b5a40]
AREA = {"water": 0x3a6f94, "forest": 0x4d7a3c, "vegetation": 0x6a9a50, "areas_pedestrian": 0xc9c1b3, "areas_footway": 0xc9c1b3}
def colorize(o, fn):
    me = o.data
    for a in list(me.color_attributes): me.color_attributes.remove(a)        # у Blosm свои атрибуты цвета — иначе имя «Col» занято
    bm = bmesh.new(); bm.from_mesh(me); cl = bm.loops.layers.color.new("Col"); fn(bm, cl); bm.to_mesh(me); bm.free()
    for uv in list(me.uv_layers): me.uv_layers.remove(uv)
    me.materials.clear()
def clip_circle(bm, Rc, n=64):
    """Обрезка кругом: 64 разреза плоскостями с отбросом внешней части (Дон — одна огромная грань, по центру её не отрезать)."""
    for i in range(n):
        a = (i + .5) / n * 2 * math.pi; d = Vector((math.cos(a), math.sin(a), 0))
        g = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=g, dist=1e-4, plane_co=d * Rc * math.cos(math.pi / n), plane_no=d, clear_outer=True)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
def faces_up(bm):
    bm.normal_update()
    for f in bm.faces:
        if f.normal.z < -.5: f.normal_flip()          # стены (z≈0) не трогаем
for o in list(bpy.data.objects):
    if o.name == "roads": continue
    o.data.transform(o.matrix_world); o.matrix_world.identity()
    kind = next((k for k in AREA if o.name.endswith(k)), None)
    if o.name.endswith("buildings"):
        def fb(bm, cl):
            bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(2), verts=bm.verts, edges=bm.edges, delimit={"NORMAL"})
            # острова = здания; удаляем за кругом и совсем мелкие
            seen, isl = set(), []
            for f in bm.faces:
                if f.index in seen: continue
                st_, grp = [f], []
                seen.add(f.index)
                while st_:
                    g = st_.pop(); grp.append(g)
                    for e in g.edges:
                        for h in e.link_faces:
                            if h.index not in seen: seen.add(h.index); st_.append(h)
                isl.append(grp)
            dead = []
            for grp in isl:
                c = sum((g.calc_center_median() for g in grp), Vector()) / len(grp)
                ext = max(v.co.z for g in grp for v in g.verts)
                foot = sum(g.calc_area() * g.normal.z for g in grp if g.normal.z > .3)          # площадь крыши в плане
                if Vector((c.x, c.y)).length > R or foot < MINFOOT: dead += grp; continue
                rnd = random.Random(int(c.x * 7 + c.y * 13)); w = (*CLR(WALLS[rnd.randrange(len(WALLS))]), 1); r = (*CLR(ROOFS[rnd.randrange(len(ROOFS))]), 1)
                for g in grp:
                    cc = r if g.normal.z > .3 else w
                    if g.normal.z < -.9: cc = (.3, .3, .3, 1)
                    for l in g.loops: l[cl] = cc
            bmesh.ops.delete(bm, geom=dead, context="FACES")
            bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < -.9], context="FACES")     # днища зданий не видны
        colorize(o, fb)
    elif kind:
        col = (*CLR(AREA[kind]), 1); z = {"water": -.45, "forest": -.3, "vegetation": -.2}.get(kind, -.1)
        def fa(bm, cl, col=col, z=z):
            clip_circle(bm, R + 60)
            bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1), verts=bm.verts, edges=bm.edges)
            for v in bm.verts: v.co.z = z
            faces_up(bm)
            for f in bm.faces:
                for l in f.loops: l[cl] = col
        colorize(o, fa)
    else:
        bpy.data.objects.remove(o, do_unlink=True)
# подложка — круг земли
bm = bmesh.new(); cl = bm.loops.layers.color.new("Col"); n = 48
vs = [bm.verts.new((math.cos(i / n * 2 * math.pi) * (R + 60), math.sin(i / n * 2 * math.pi) * (R + 60), -.6)) for i in range(n)]
f = bm.faces.new(vs)
for l in f.loops: l[cl] = (*CLR(0xb8b09c), 1)
gm = bpy.data.meshes.new("ground"); bm.to_mesh(gm); bm.free(); g = bpy.data.objects.new("ground", gm); bpy.context.scene.collection.objects.link(g)
# ---------- 6) общий материал, слияние и нарезка ≤ 65 535 вершин ----------
mat = bpy.data.materials.new("VC_Flat"); mat.use_nodes = True; nt = mat.node_tree; bs = nt.nodes["Principled BSDF"]
ca = nt.nodes.new("ShaderNodeVertexColor"); ca.layer_name = "Col"; nt.links.new(ca.outputs["Color"], bs.inputs["Base Color"]); bs.inputs["Roughness"].default_value = 1
for o in bpy.data.objects:
    me = o.data; me.materials.clear(); me.materials.append(mat)
    for p in me.polygons: p.use_smooth = False
    me.color_attributes.active_color = me.color_attributes["Col"]
# все слои — в один набор, потом квадратами по 600 м, внутри квадрата — порциями до 65 535 вершин (по углам граней)
for o in bpy.data.objects: print("СЛОЙ", o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), "тр.")
bpy.ops.object.select_all(action="SELECT"); bpy.context.view_layer.objects.active = bpy.data.objects[0]; bpy.ops.object.join()
ALL = bpy.context.active_object; bm = bmesh.new(); bm.from_mesh(ALL.data); bmesh.ops.triangulate(bm, faces=bm.faces); faces_up(bm); cl = bm.loops.layers.color["Col"]
TILE = 1000; buckets = {}
for f in bm.faces:
    c = f.calc_center_median(); buckets.setdefault((math.floor(c.x / TILE), math.floor(c.y / TILE)), []).append(f)
pieces = []
for key, faces in sorted(buckets.items()):
    chunk, keys = [], set()
    def flush():
        if not chunk: return
        nb = bmesh.new(); ncl = nb.loops.layers.color.new("Col"); vm = {}
        for f in chunk:
            vv = []
            for l in f.loops:
                k = (l.vert.index, tuple(round(x, 3) for x in l[cl]))
                if k not in vm: vm[k] = nb.verts.new(l.vert.co)
                vv.append(vm[k])
            try:
                nf = nb.faces.new(vv)
                for nl, l in zip(nf.loops, f.loops): nl[ncl] = l[cl]
            except ValueError: pass
        me = bpy.data.meshes.new(f"map_{key[0]}_{key[1]}_{len(pieces)}"); nb.to_mesh(me); nb.free(); me.materials.append(mat)
        ob = bpy.data.objects.new(me.name, me); bpy.context.scene.collection.objects.link(ob); pieces.append(ob)
    for f in faces:
        add = {(l.vert.index, tuple(round(x, 3) for x in l[cl])) for l in f.loops} - keys
        if len(keys) + len(add) > 65000: flush(); chunk, keys = [], set(); add = {(l.vert.index, tuple(round(x, 3) for x in l[cl])) for l in f.loops}
        chunk.append(f); keys |= add
    flush()
bm.free(); bpy.data.objects.remove(ALL, do_unlink=True)
tris = sum(len(o.data.polygons) for o in pieces); verts = sum(len(o.data.vertices) for o in pieces)
print(f"объектов: {len(pieces)}, треугольников: {tris}, вершин: {verts}, макс. вершин в объекте: {max(len(o.data.vertices) for o in pieces)}")
# ---------- 7) экспорт ----------
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True, export_normals=False, export_texcoords=False,
    export_materials="EXPORT", export_vertex_color="ACTIVE", export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
    export_draco_position_quantization=14, export_draco_color_quantization=8)
print(f"GLB: {os.path.getsize(OUT) / 1024 / 1024:.2f} МБ → {OUT}")
json.dump({"objects": len(pieces), "tris": tris, "verts": verts, "bytes": os.path.getsize(OUT)}, open(OUT + ".json", "w"))
