# Ж/д мост в Blender: модель стали (выгрузка tools/bridge-export.cjs), проблемные места (tools/bridge-check.py → report.json,
# красные — «видно, но не твёрдое») и траектории испытаний тренажёра (цветные трубки, в полёте — толще). Рендер Cycles (CPU):
# вид сбоку (ортографический), сверху и с высоты у пролёта. Оси Blender: X — вдоль моста (s), Y — поперёк (l), Z — высота.
#   blender -b --factory-startup --python tools/blender/bridge.py -- папка_выгрузки папка_траекторий выход
import bpy, bmesh, json, math, os, sys, struct
import numpy as np
a = sys.argv[sys.argv.index("--") + 1:]; D, DT, OUT = a[0], a[1], a[2]; os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
meta = json.load(open(os.path.join(DT, "meta.json"))); rep = json.load(open(os.path.join(D, "report.json")))
def mat(name, rgb, emit=0, alpha=1):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = .6
    if emit: b.inputs["Emission Color"].default_value = (*rgb, 1); b.inputs["Emission Strength"].default_value = emit
    if alpha < 1: b.inputs["Alpha"].default_value = alpha; m.blend_method = "BLEND"
    return m
# сталь (цвет вершин)
T = np.fromfile(os.path.join(D, "steel0.f32"), np.float32).reshape(-1, 3, 6); T = T[np.isfinite(T).all(axis=(1, 2))]
me = bpy.data.meshes.new("steel"); V = T[:, :, :3].reshape(-1, 3); me.from_pydata(V.tolist(), [], [(i * 3, i * 3 + 1, i * 3 + 2) for i in range(len(T))])
col = me.color_attributes.new("c", "FLOAT_COLOR", "POINT"); cs = T[:, :, 3:6].reshape(-1, 3)
for i, c in enumerate(cs): col.data[i].color = (*[float(x) ** 2.2 for x in c], 1)
ob = bpy.data.objects.new("steel", me); sc.collection.objects.link(ob)
ms = bpy.data.materials.new("vc"); ms.use_nodes = True; nt = ms.node_tree; at = nt.nodes.new("ShaderNodeVertexColor"); at.layer_name = "c"
nt.links.new(at.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"]); nt.nodes["Principled BSDF"].inputs["Roughness"].default_value = .55; me.materials.append(ms)
# вода и проблемные места
bpy.ops.mesh.primitive_plane_add(size=1, location=(meta["L"] / 2, 0, 0)); w = bpy.context.active_object; w.scale = (meta["L"] + 300, 260, 1); w.data.materials.append(mat("water", (.08, .2, .26)))
bad = mat("bad", (1, .05, .05), emit=3)
for r in rep["states"]["0"]["A_visible_not_solid"]:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(r["s"], r["l"], r["y"])); c = bpy.context.active_object; c.scale = [max(.6, e) for e in r["ext"]]; c.data.materials.append(bad)
# траектории
PAL = {"rbArch": (1, .8, .1), "rbOver": (.2, .9, .3), "rbJet": (1, .3, .9), "rbRails": (.2, .8, 1), "rbTwo": (1, .55, .1), "rbRailGap": (.6, .4, 1),
       "rbLift": (1, 1, 1), "rbTrain": (.9, .2, .2), "rbTrainJump": (.3, .5, 1), "rbBarge": (.1, 1, .8)}
for tid, t in meta["trials"].items():
    P = [(p[0], p[1], p[2] + .7, p[3]) for p in t["pts"]]
    if len(P) < 2: continue
    cu = bpy.data.curves.new(tid, "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = .45; cu.bevel_resolution = 2
    sp = cu.splines.new("POLY"); sp.points.add(len(P) - 1)
    for q, (s, l, y, air) in zip(sp.points, P): q.co = (s, l, y, 1); q.radius = 1.6 if air else .7
    o = bpy.data.objects.new(tid, cu); sc.collection.objects.link(o); o.data.materials.append(mat("m" + tid, PAL.get(tid, (1, 1, 1)), emit=2.5))
# свет и мир
sc.world = bpy.data.worlds.new("w"); sc.world.use_nodes = True; sc.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.55, .65, .78, 1); sc.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .8
bpy.ops.object.light_add(type="SUN", rotation=(math.radians(50), math.radians(10), math.radians(30))); bpy.context.active_object.data.energy = 3.5
sc.render.engine = "CYCLES"; sc.cycles.samples = 24; sc.cycles.use_denoising = False; sc.cycles.device = "CPU"
L = meta["L"]
def shot(name, loc, rot, ortho=None, res=(1800, 620), lens=35):
    cd = bpy.data.cameras.new(name); cd.lens = lens
    if ortho: cd.type = "ORTHO"; cd.ortho_scale = ortho
    cam = bpy.data.objects.new(name, cd); sc.collection.objects.link(cam); cam.location = loc; cam.rotation_euler = [math.radians(v) for v in rot]
    sc.camera = cam; sc.render.resolution_x, sc.render.resolution_y = res; sc.render.filepath = os.path.join(OUT, name + ".png"); bpy.ops.render.render(write_still=True)
    return cd
shot("side", (L / 2, -260, 34), (90, 0, 0), ortho=L + 40)                                  # сбоку (с востока)
shot("top", (L / 2, 0, 300), (0, 0, 0), ortho=L + 40, res=(1800, 420))                       # сверху
shot("span", (meta["A1"] - 55, -48, 62), (62, 0, -48), res=(1600, 900), lens=24)              # с высоты у пролёта
json.dump({"L": L, "side": {"cx": L / 2, "cz": 34, "scale": L + 40, "res": [1800, 620]}, "top": {"cx": L / 2, "cy": 0, "scale": L + 40, "res": [1800, 420]}}, open(os.path.join(OUT, "cams.json"), "w"))
print("RENDERED")
