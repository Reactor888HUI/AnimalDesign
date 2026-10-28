"""The body of the Knowledge Reactor, built in Blender (bpy) with its ambient occlusion baked in.

    env/bin/python tools/blender/make_reactor.py ark/models      # writes reactor.glb and ao_reactor.jpg

What is here: the stepped steel plinth, nine brass lamp sockets, the brass seat of the glass, six brass columns with
bands, the steel cap with the brass ring, the hopper (a funnel with thickness and a rim) held by three braces, a steel
pipe with flanges, an elbow and a pressure gauge. The glass tube, the glowing core, the rings, the particles and the
lamps stay in the page: they move and change colour.
Metres, the origin is the centre of the foot on the floor, the same measures as the primitives it replaces
(ark/js/build.js): the tube 0.78 radius, y 0.4..2.9; the hopper rim at y 3.65; the lamps at radius 1.08, y 0.5.
One object, two UV sets (UVMap: one unit per metre; UVLight: the atlas with the baked occlusion).
Materials are named <kind>.reactor: steel, brass, dark, dial.
"""
import math
import os
import sys

import bpy  # (first: it makes bmesh importable)
import bmesh
from mathutils import Matrix, Vector

OUT = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else 'ark/models'
os.makedirs(OUT, exist_ok=True)
SIZE = int(os.environ.get('AO_SIZE', '1024'))
SAMPLES = int(os.environ.get('AO_SAMPLES', '48'))
KINDS = ['steel', 'brass', 'dark', 'dial', 'pipe']
# the look follows the reference picture: polished chrome, warm bronze, graphite, pale glass tubes that glow blue
COLORS = {'steel': (0.8, 0.81, 0.84), 'brass': (0.86, 0.6, 0.3), 'dark': (0.08, 0.09, 0.11), 'dial': (0.95, 0.92, 0.82), 'pipe': (0.6, 0.85, 1.0)}
ROUGH = {'steel': 0.14, 'brass': 0.22, 'dark': 0.4, 'dial': 0.6, 'pipe': 0.05}
METAL = {'steel': 1.0, 'brass': 1.0, 'dark': 0.2, 'dial': 0.0, 'pipe': 0.0}
MI = {k: i for i, k in enumerate(KINDS)}

bpy.ops.wm.read_factory_settings(use_empty=True)
bm = bmesh.new()


def P(x, y, z):
    """page coordinates (x east, y up, z south) -> Blender (x, y north, z up)"""
    return Vector((x, -z, y))


def paint(verts, kind, smooth=True):
    for f in {f for v in verts if v.is_valid for f in v.link_faces}:
        f.material_index = MI[kind]
        f.smooth = smooth


def lathe(kind, profile, steps=48, closed=False, at=(0, 0, 0), smooth=True):
    """profile: (radius, height) points round the page's vertical axis"""
    before = set(bm.verts)
    verts = [bm.verts.new((r, 0.0, y)) for r, y in profile]
    edges = [bm.edges.new((a, b)) for a, b in zip(verts, verts[1:])]
    if closed:
        edges.append(bm.edges.new((verts[-1], verts[0])))
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=steps)
    new = [v for v in bm.verts if v not in before]
    bmesh.ops.remove_doubles(bm, verts=new, dist=1e-4)
    new = [v for v in new if v.is_valid]
    bmesh.ops.translate(bm, vec=P(*at), verts=new)
    paint(new, kind, smooth)
    return new


def torus(kind, big, tube, y, at=(0, 0, 0), seg=48, ring=8):
    prof = [(big + tube * math.cos(a), y + tube * math.sin(a)) for a in [i / ring * math.tau for i in range(ring)]]
    return lathe(kind, prof, seg, closed=True, at=at)


def rod(kind, a, b, radius, seg=12):
    """a cylinder between two page points"""
    pa, pb = P(*a), P(*b)
    d = pb - pa
    res = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=radius, radius2=radius, depth=d.length)
    verts = res['verts']
    rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((pa + pb) / 2) @ rot, verts=verts)
    paint(verts, kind)
    return verts


def ball(kind, c, radius):
    res = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=radius)
    bmesh.ops.translate(bm, vec=P(*c), verts=res['verts'])
    paint(res['verts'], kind)


def polar(r, deg):
    a = math.radians(deg)
    return r * math.cos(a), r * math.sin(a)       # page x, z


# ---- plinth: steel, stepped, with a brass seat for the glass --------------------------------------------------------
lathe('steel', [(0, 0), (1.30, 0), (1.30, 0.04), (1.24, 0.08), (1.24, 0.26), (1.15, 0.30), (1.12, 0.34), (0.95, 0.34), (0.95, 0.40), (0, 0.40)], 64)
lathe('brass', [(0.78, 0.40), (0.96, 0.40), (0.96, 0.43), (0.90, 0.47), (0.84, 0.50), (0.78, 0.50)], 64, closed=True)
torus('brass', 1.27, 0.018, 0.17)                                                            # a thin band round the plinth
# nine lamp sockets where the lamps are (angle -36 deg .. 270 deg, radius 1.08), the ring of each one a little brass cup
for i in range(9):
    a = -36 + i / 9 * 306
    x, z = polar(1.08, a)
    lathe('brass', [(0.0, 0.34), (0.075, 0.34), (0.075, 0.43), (0.062, 0.45), (0.0, 0.45)], 20, at=(x, 0, z))

# ---- six brass columns round the glass, each with a foot and a cap, and three bands -------------------------------
for i in range(6):
    x, z = polar(0.82, i * 60)
    rod('brass', (x, 0.45, z), (x, 2.92, z), 0.035)
    ball('brass', (x, 0.45, z), 0.05)
    ball('brass', (x, 2.92, z), 0.05)
for y in (0.9, 1.65, 2.4):
    torus('brass', 0.815, 0.016, y)

# ---- cap and hopper ---------------------------------------------------------------------------------------------------
lathe('steel', [(0.30, 2.90), (0.92, 2.90), (0.92, 3.00), (0.86, 3.08), (0.30, 3.08)], 64, closed=True)
lathe('brass', [(0.30, 3.08), (0.84, 3.08), (0.84, 3.14), (0.30, 3.14)], 64, closed=True)
lathe('dark', [(0.30, 3.14), (0.30, 3.30), (0.34, 3.30), (0.34, 3.14)], 48, closed=True)                      # a collar at the funnel's throat
lathe('steel', [(0.34, 3.12), (0.97, 3.65), (0.93, 3.67), (0.30, 3.14)], 64, closed=True, smooth=False)         # the funnel: a wall with thickness
torus('brass', 0.955, 0.04, 3.665)                                                                # the rim
for deg in (30, 150, 270):
    x1, z1 = polar(0.96, deg)
    x0, z0 = polar(0.86, deg)
    rod('steel', (x0, 3.05, z0), (x1, 3.62, z1), 0.022, 8)                                            # braces from the cap to the rim
    ball('brass', (x1, 3.64, z1), 0.04)
for deg in range(0, 360, 30):                                                                      # rivets round the cap
    x, z = polar(0.88, deg)
    ball('brass', (x, 3.0, z), 0.018)

# ---- a steel pipe on the quiet side (angle 315 deg) with flanges, an elbow and a pressure gauge -------------------
px, pz = polar(1.12, 315)
rod('steel', (px, 0.34, pz), (px, 2.95, pz), 0.055, 16)
for y in (0.5, 1.4, 2.3):
    lathe('brass', [(0.055, y - 0.03), (0.085, y - 0.03), (0.085, y + 0.03), (0.055, y + 0.03)], 20, closed=True, at=(px, 0, pz))
ball('steel', (px, 2.95, pz), 0.07)
cx, cz = polar(0.9, 315)
rod('steel', (px, 2.95, pz), (cx, 2.95, cz), 0.045, 12)
# the gauge sits on a stub at y 1.15, facing outwards: a lathe round the vertical, then laid down to point along the radius
sx, sz = polar(1.12 + 0.07, 315)
rod('dark', (px, 1.15, pz), (sx, 1.15, sz), 0.03, 10)
gv = []
gv += lathe('brass', [(0.0, 0.0), (0.105, 0.0), (0.105, 0.04), (0.0, 0.04)], 32)                       # the case
gv += lathe('dial', [(0.0, 0.041), (0.088, 0.041), (0.088, 0.044), (0.0, 0.044)], 32)                  # the face
gv += torus('brass', 0.098, 0.011, 0.045, seg=32, ring=6)                                           # the bezel
needle = bmesh.ops.create_cube(bm, size=1.0)['verts']
bmesh.ops.scale(bm, vec=(0.006, 0.07, 0.003), verts=needle)
bmesh.ops.translate(bm, vec=(0.012, 0.0, 0.0475), verts=needle)
bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-35), 3, 'Z'), verts=needle)
paint(needle, 'dark', False)
gv += needle
bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'), verts=gv)            # the face looks along +x (Blender)
bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-315 + 0), 3, 'Z'), verts=gv)  # ... then along the radius at 315 deg
gx, gz = polar(1.12 + 0.07, 315)
bmesh.ops.translate(bm, vec=P(gx, 1.15, gz), verts=gv)

# ---- glass pipes with elbows on both sides, as in the reference: they glow, they do not touch the floor ----------------
def pipe(points, radius=0.05):
    for a, b in zip(points, points[1:]):
        rod('pipe', a, b, radius, 12)
    for p in points:
        ball('pipe', p, radius * 1.35)


def at(r, deg, y):
    x, z = polar(r, deg)
    return (x, y, z)


for deg in (150, 30):
    pipe([at(0.95, deg, 1.95), at(1.7, deg, 1.95), at(2.1, deg, 1.5), at(2.1, deg, 1.05)])

# ---- finish: normals, UVs, object, materials -------------------------------------------------------------------------
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
uv = bm.loops.layers.uv.new('UVMap')
bm.loops.layers.uv.new('UVLight')
for f in bm.faces:
    for l in f.loops:
        x, y, z = l.vert.co.x, l.vert.co.y, l.vert.co.z
        l[uv].uv = (math.atan2(y, x) / math.tau * 3.0, z)
mesh = bpy.data.meshes.new('reactor')
bm.to_mesh(mesh)
obj = bpy.data.objects.new('reactor', mesh)
bpy.context.collection.objects.link(obj)
for k in KINDS:
    m = bpy.data.materials.new(k + '.reactor')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*COLORS[k], 1)
    b.inputs['Roughness'].default_value = ROUGH[k]
    b.inputs['Metallic'].default_value = METAL[k]
    if k == 'pipe':
        b.inputs['Emission Color'].default_value = (0.3, 0.75, 1.0, 1)
        b.inputs['Emission Strength'].default_value = 1.0
    obj.data.materials.append(m)

# ---- ambient occlusion on the atlas -----------------------------------------------------------------------------------
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
mesh.uv_layers.active = mesh.uv_layers['UVLight']
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004, scale_to_bounds=True)
bpy.ops.object.mode_set(mode='OBJECT')
img = bpy.data.images.new('ao_reactor', SIZE, SIZE, alpha=False)
img.colorspace_settings.name = 'Non-Color'
for m in mesh.materials:
    node = m.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = img
    m.node_tree.nodes.active = node
    node.select = True
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = SAMPLES
sc.render.bake.margin = 6
sc.world = bpy.data.worlds.new('w')
sc.world.light_settings.distance = 1.2
bpy.ops.object.bake(type='AO', use_clear=True)
img.filepath_raw = os.path.join(OUT, 'ao_reactor.jpg')
img.file_format = 'JPEG'
sc.render.image_settings.quality = 88
img.save()
for m in mesh.materials:
    for n in [n for n in m.node_tree.nodes if n.bl_idname == 'ShaderNodeTexImage']:
        m.node_tree.nodes.remove(n)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'reactor.glb'), export_format='GLB', export_apply=True, export_texcoords=True, export_normals=True)
print('exported reactor.glb', len(mesh.polygons), 'faces; baked', SIZE, 'x', SIZE)
