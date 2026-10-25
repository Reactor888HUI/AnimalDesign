# Осмотр машины игрока в Blender: 8 видов (tools/car-views.json) с одинаковым светом — «до» (материалы как в игре)
# и «после» (прогноз улучшений, которые переносятся в игру: фаски и сглаженные нормали, запечённая тень AO,
# лак с прозрачным слоем, металл дисков против резины шин, закрытые дыры сетки, белые фары вместо голубых колец).
#   blender -b --factory-startup --python tools/blender/car-review.py -- <папка car-export> <выход> <before|after>
# Вход — tools/car-export.cjs (car.json + tex-*.png). Выход — <выход>/<режим>-1.png … -8.png (800×600, Cycles).
import bpy, bmesh, json, math, os, sys
from mathutils import Vector
args = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT, MODE = args[0], args[1], args[2]
AFTER = MODE == "after"
os.makedirs(OUT, exist_ok=True)
D = json.load(open(os.path.join(SRC, "car.json")))
VEH = D["veh"]
VIEWS = json.load(open(os.environ.get("CAR_VIEWS") or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "car-views.json")))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
G = lambda x, y, z: Vector((x, -z, y))           # игра (x вперёд, y вверх, z вправо) → Blender (X вперёд, Z вверх, −Y вправо)
lin = lambda h: tuple((c / 255) ** 2.2 for c in bytes.fromhex(h))   # sRGB → линейный (приближённо)

def node_mat(name, m, part_tris, wheel=0):
    M = bpy.data.materials.new(name); M.use_nodes = True; nt = M.node_tree; N = nt.nodes; L = nt.links
    bs = N["Principled BSDF"]; out = N["Material Output"]
    col = (*lin(m["color"]), 1); alpha_out = None
    base = N.new("ShaderNodeRGB"); base.outputs[0].default_value = col
    c_out = base.outputs[0]
    if m["vc"]:
        a = N.new("ShaderNodeAttribute"); a.attribute_name = "Col"
        mul = N.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.inputs[0].default_value = 1
        L.new(c_out, mul.inputs[6]); L.new(a.outputs[0], mul.inputs[7]); c_out = mul.outputs[2]
    if m.get("map") and os.path.exists(os.path.join(SRC, m["map"]["id"] + ".png")):
        t = N.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(os.path.join(SRC, m["map"]["id"] + ".png"))
        mul = N.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.inputs[0].default_value = 1
        L.new(c_out, mul.inputs[6]); L.new(t.outputs[0], mul.inputs[7]); c_out = mul.outputs[2]
        if m["transparent"] or m["type"] == "MeshLambertMaterial": alpha_out = t.outputs[1]   # наклейки с прозрачными углами
    dark = sum(lin(m["color"])) < .02
    glass = m["type"] == "MeshPhysicalMaterial" and m["rough"] < .1 and dark and m["clearcoat"] == 0
    lens = m["opacity"] < .6 and m["transparent"]
    emis = m["emissive"] != "000000"
    if m["type"] == "MeshBasicMaterial":                 # в игре — без света (номера, наклейки): чистое свечение
        em = N.new("ShaderNodeEmission"); L.new(c_out, em.inputs[0])
        em.inputs[1].default_value = 1.0 if m.get("map") else .15        # свечение сопел под машиной — в игре едва видно
        if alpha_out is not None or not m.get("map"):
            tr = N.new("ShaderNodeBsdfTransparent"); mx = N.new("ShaderNodeMixShader")
            if alpha_out is not None: L.new(alpha_out, mx.inputs[0])
            else: mx.inputs[0].default_value = .35
            L.new(tr.outputs[0], mx.inputs[1]); L.new(em.outputs[0], mx.inputs[2]); L.new(mx.outputs[0], out.inputs[0]); M.blend_method = "BLEND"
        else: L.new(em.outputs[0], out.inputs[0])
        return M
    metal, rough = m["metal"], m["rough"]
    if AFTER and not glass and not lens and not emis and not m.get("map"):
        # прогноз: запечённая тень (AO) — темнее в арках, щелях, снизу; в игре — цвет вершин, как у руля
        ao = N.new("ShaderNodeAmbientOcclusion"); ao.inputs["Distance"].default_value = .35; ao.samples = 8
        mix = N.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"; mix.inputs[0].default_value = .85
        L.new(c_out, mix.inputs[6]); L.new(ao.outputs["AO"], mix.inputs[7]); c_out = mix.outputs[2]
        if wheel:                                        # колесо: внутри обода — диск (металл), снаружи — шина (резина)
            tc = N.new("ShaderNodeTexCoord"); sx = N.new("ShaderNodeSeparateXYZ"); L.new(tc.outputs["Object"], sx.inputs[0])
            vx = N.new("ShaderNodeCombineXYZ"); L.new(sx.outputs[0], vx.inputs[0]); L.new(sx.outputs[2], vx.inputs[2])
            ln = N.new("ShaderNodeVectorMath"); ln.operation = "LENGTH"; L.new(vx.outputs[0], ln.inputs[0])
            k = N.new("ShaderNodeMath"); k.operation = "LESS_THAN"; k.inputs[1].default_value = wheel * (.6 if VEH == "vaz" else .68)
            L.new(ln.outputs["Value"], k.inputs[0])
            rimc = N.new("ShaderNodeRGB"); rimc.outputs[0].default_value = (.13, .13, .14, 1) if VEH == "suv" else (.62, .64, .66, 1)
            tyre = N.new("ShaderNodeRGB"); tyre.outputs[0].default_value = (.022, .022, .024, 1)
            cm = N.new("ShaderNodeMix"); cm.data_type = "RGBA"; L.new(k.outputs[0], cm.inputs[0]); L.new(tyre.outputs[0], cm.inputs[6]); L.new(rimc.outputs[0], cm.inputs[7])
            ao2 = N.new("ShaderNodeAmbientOcclusion"); ao2.inputs["Distance"].default_value = .12
            mx2 = N.new("ShaderNodeMix"); mx2.data_type = "RGBA"; mx2.blend_type = "MULTIPLY"; mx2.inputs[0].default_value = .9
            L.new(cm.outputs[2], mx2.inputs[6]); L.new(ao2.outputs["AO"], mx2.inputs[7]); c_out = mx2.outputs[2]
            L.new(k.outputs[0], bs.inputs["Metallic"])
            rr = N.new("ShaderNodeMapRange"); rr.inputs[3].default_value = .88; rr.inputs[4].default_value = .3
            L.new(k.outputs[0], rr.inputs[0]); L.new(rr.outputs[0], bs.inputs["Roughness"])
            metal = rough = None
        if VEH == "vaz" and m["emissive"] == "fff1c8":   # фары «восьмёрки»: рифлёное стекло вместо плоского белого
            m = dict(m, emI=m["emI"] * .25); bs.inputs["Base Color"].default_value = (.85, .86, .88, 1); bs.inputs["Roughness"].default_value = .08
            vo = N.new("ShaderNodeTexVoronoi"); vo.inputs["Scale"].default_value = 60
            bp = N.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = .35; L.new(vo.outputs["Distance"], bp.inputs["Height"]); L.new(bp.outputs[0], bs.inputs["Normal"])
        if m["clearcoat"] > 0:                           # лак: прозрачный слой гладкий, основа чуть матовее
            bs.inputs["Coat Weight"].default_value = 1; bs.inputs["Coat Roughness"].default_value = .03
            rough = max(rough, .35)
    if metal is not None: bs.inputs["Metallic"].default_value = metal
    if rough is not None: bs.inputs["Roughness"].default_value = rough
    if not AFTER and m["clearcoat"] > 0:
        bs.inputs["Coat Weight"].default_value = m["clearcoat"]; bs.inputs["Coat Roughness"].default_value = max(m["ccRough"], .03)
    L.new(c_out, bs.inputs["Base Color"])
    if alpha_out is not None: L.new(alpha_out, bs.inputs["Alpha"]); M.blend_method = "BLEND"
    if glass:                                            # стекло: прозрачное с тонировкой (в игре — по Френелю, ~60 % пропускания)
        bs.inputs["Transmission Weight"].default_value = 1; bs.inputs["Roughness"].default_value = .02; bs.inputs["IOR"].default_value = 1.5
        bs.inputs["Base Color"].default_value = (.32, .38, .42, 1) if not AFTER else (.55, .6, .62, 1)
        for l in list(L):
            if l.to_socket == bs.inputs["Base Color"]: L.remove(l)
    elif lens:
        bs.inputs["Alpha"].default_value = max(m["opacity"], .25); bs.inputs["Roughness"].default_value = .05
        if AFTER and VEH == "suv" and m["color"].startswith("99cc"):   # стекло фар — прозрачное, без голубого оттенка
            for l in list(L):
                if l.to_socket == bs.inputs["Base Color"]: L.remove(l)
            bs.inputs["Base Color"].default_value = (.92, .93, .94, 1); bs.inputs["Alpha"].default_value = .12
    if emis:
        ec = lin(m["emissive"])
        if AFTER and VEH == "suv" and m["emissive"].startswith("c6e7"):   # «ангельские глазки» — голубые кольца → белые светодиоды
            ec = (1, .97, .9); bs.inputs["Base Color"].default_value = (.85, .85, .85, 1)
        bs.inputs["Emission Color"].default_value = (*ec, 1); bs.inputs["Emission Strength"].default_value = m["emI"] * (1.5 if not AFTER else 1.0)
    if lens: M.blend_method = "BLEND"
    return M

objs = []
for k, part in enumerate(D["meshes"]):
    P, I = part["P"], part["I"]
    me = bpy.data.meshes.new(f"p{k}")
    verts = [G(P[i], P[i + 1], P[i + 2]) for i in range(0, len(P), 3)]
    faces = [tuple(I[i:i + 3]) for i in range(0, len(I), 3)]
    me.from_pydata(verts, [], faces)
    if part["C"]:
        ca = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT"); C = part["C"]
        for i in range(len(verts)): ca.data[i].color = (C[3 * i], C[3 * i + 1], C[3 * i + 2], 1)
    if part["U"]:
        uv = me.uv_layers.new(name="UVMap"); U = part["U"]
        for poly in me.polygons:
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index; uv.data[li].uv = (U[2 * vi], U[2 * vi + 1])
    if part["N"]:
        Nn = part["N"]; me.normals_split_custom_set_from_vertices([G(Nn[3 * i], Nn[3 * i + 1], Nn[3 * i + 2]).normalized() for i in range(len(verts))])
    ob = bpy.data.objects.new(part["name"] + f".{k}", me); sc.collection.objects.link(ob); objs.append((ob, part))
    xs, ys, zs = zip(*verts); dx, dy, dz = max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)
    wheel = dx / 2 if (AFTER and part["C"] and abs(dx - dz) < .06 and .45 < dx < .95 and dy < .45) else 0
    if wheel:                                                                  # начало координат — в центр колеса
        c = Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, (max(zs) + min(zs)) / 2))
        me.transform(__import__("mathutils").Matrix.Translation(-c)); ob.location = c
    me.materials.append(node_mat(f"m{k}", part["mat"], len(faces), wheel))

tris_after = 0
if AFTER:
    for ob, part in objs:
        m = part["mat"]; me = ob.data
        if m["type"] == "MeshBasicMaterial" or len(me.polygons) < 20: tris_after += len(me.polygons); continue
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=.0008)              # сварка: в игре грани часто не связаны
        if VEH == "suv" and m["clearcoat"] > 0:                               # мелкие дыры краски от упрощения (светлые «разрывы» в арках)
            edges = [e for e in bm.edges if e.is_boundary]
            bmesh.ops.holes_fill(bm, edges=edges, sides=6)
        bm.to_mesh(me); bm.free()
        if me.has_custom_normals: bpy.context.view_layer.objects.active = ob; ob.select_set(True); bpy.ops.mesh.customdata_custom_splitnormals_clear(); ob.select_set(False)
        is_body = m["clearcoat"] > 0 or (VEH == "vaz" and m["color"] in ("15171d", "2e2a28", "3b3d42"))
        if VEH == "vaz" and is_body:                                          # фаски по острым рёбрам кузова и бамперов
            bv = ob.modifiers.new("фаска", "BEVEL"); bv.width = .024; bv.segments = 2; bv.limit_method = "ANGLE"; bv.angle_limit = math.radians(32); bv.harden_normals = True
        for p in me.polygons: p.use_smooth = True
        if VEH == "vaz" and ob.location.length > 0:                          # шины «восьмёрки»: сглаживание, резкие рёбра профиля сохранены
            bm = bmesh.new(); bm.from_mesh(me); cr = bm.edges.layers.float.get("crease_edge") or bm.edges.layers.float.new("crease_edge")
            for e in bm.edges:
                if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(50): e[cr] = 1.0
            bm.to_mesh(me); bm.free()
            sd = ob.modifiers.new("сглаживание", "SUBSURF"); sd.levels = sd.render_levels = 1
        wn = ob.modifiers.new("нормали", "WEIGHTED_NORMAL"); wn.keep_sharp = True; wn.weight = 50
        try: me.set_sharp_from_angle(angle=math.radians(38 if VEH == "suv" else 34))
        except Exception: pass
        dg = bpy.context.evaluated_depsgraph_get(); tris_after += sum(len(p.vertices) - 2 for p in ob.evaluated_get(dg).data.polygons)

# земля, небо, солнце
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -0.652))
gm = bpy.data.materials.new("асфальт"); gm.use_nodes = True; gb = gm.node_tree.nodes["Principled BSDF"]
gb.inputs["Base Color"].default_value = (.16, .16, .165, 1); gb.inputs["Roughness"].default_value = .92
bpy.context.object.data.materials.append(gm)
w = bpy.data.worlds.new("небо"); sc.world = w; w.use_nodes = True        # нейтральный свет: светлое небо-градиент + белое солнце
wn = w.node_tree.nodes; grad = wn.new("ShaderNodeTexGradient"); tcw = wn.new("ShaderNodeTexCoord"); sepw = wn.new("ShaderNodeSeparateXYZ")
ramp = wn.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].color = (.42, .44, .46, 1); ramp.color_ramp.elements[1].color = (.55, .68, .9, 1)
w.node_tree.links.new(tcw.outputs["Generated"], sepw.inputs[0]); w.node_tree.links.new(sepw.outputs[2], ramp.inputs[0])
w.node_tree.links.new(ramp.outputs[0], wn["Background"].inputs[0]); wn["Background"].inputs[1].default_value = .9
sunl = bpy.data.objects.new("солнце", bpy.data.lights.new("солнце", "SUN")); sc.collection.objects.link(sunl)
sunl.data.energy = 3.2; sunl.data.angle = math.radians(2); sunl.rotation_euler = (math.radians(42), 0, math.radians(-145))
sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = 48; sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 800, 600
sc.view_settings.view_transform = "AgX"; sc.view_settings.look = "AgX - Medium High Contrast"; sc.view_settings.exposure = -.2
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.sensor_fit = "VERTICAL"
for i, (name, v) in enumerate(VIEWS):
    cam.location = G(v[0], v[1], v[2]); cam.data.angle = math.radians(v[6])
    d = G(v[3], v[4], v[5]) - cam.location; cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = os.path.join(OUT, f"{MODE}-{i + 1}.png"); bpy.ops.render.render(write_still=True)
json.dump({"tris_in": D["tris"], "tris_out": tris_after or D["tris"]}, open(os.path.join(OUT, f"{MODE}.json"), "w"))
print("готово", MODE, VEH, "треугольников", D["tris"], "→", tris_after or D["tris"])
