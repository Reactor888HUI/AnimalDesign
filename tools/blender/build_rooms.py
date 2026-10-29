"""The two rooms of the Ark, built in Blender (bpy): the architecture, with its ambient occlusion baked in.

    python3 -m venv env && env/bin/pip install bpy          # Blender as a Python module (Python 3.11)
    env/bin/python tools/blender/build_rooms.py ark/models  # writes rooms.glb, ao_main.jpg, ao_hall.jpg

What is here: floors, ceilings with beams / ribs / coffers, walls, skirting boards and cornices, the door frames,
the steel frames of the glass (the glass itself, the furniture, the books, the artifacts and the reactor stay in the
page), the end wall of the hall with its pilasters and the frame of the round window.
Everything is in the same metres as the page's walking rules (ark/js/build.js, world.js): x east, z south, y up,
the main room x -7..7, z -5..5, 3.8 high; the hall x 7.2..29, z -6.5..6.5, 4.6 high; the doorway |z| < 1.3.

Each room is one object with two UV sets: UVMap (one unit per metre, for the tiling textures that the page paints) and
UVLight (an atlas), on which the ambient occlusion is baked with Cycles. Materials are named <kind>.<room>
(plaster.main, marble.hall ...); the page gives each kind its own look and puts the baked map on every one of them.
"""
import math
import os
import sys

import bpy  # (first: it makes bmesh importable)
import bmesh
from mathutils import Matrix

OUT = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else 'ark/models'
os.makedirs(OUT, exist_ok=True)
SIZE = int(os.environ.get('AO_SIZE', '2048'))
SAMPLES = int(os.environ.get('AO_SAMPLES', '48'))
KINDS = ['plaster', 'wood_floor', 'marble', 'ceiling', 'beam', 'steel', 'brass', 'trim_wood', 'light_panel']
COLORS = {'plaster': (0.9, 0.87, 0.8), 'wood_floor': (0.55, 0.35, 0.18), 'marble': (0.9, 0.88, 0.84), 'ceiling': (0.95, 0.93, 0.88),
          'beam': (0.62, 0.45, 0.3), 'steel': (0.23, 0.25, 0.28), 'brass': (0.79, 0.64, 0.29), 'trim_wood': (0.3, 0.18, 0.1), 'light_panel': (1.0, 0.94, 0.8)}

bpy.ops.wm.read_factory_settings(use_empty=True)


def P(x, y, z):
    """page coordinates (x east, y up, z south) -> Blender (x, y north, z up)"""
    return (x, -z, y)


class Room:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mi = {k: i for i, k in enumerate(KINDS)}

    def box(self, kind, cx, cy, cz, sx, sy, sz, bevel=0.0):
        bm = self.bm
        verts = bmesh.ops.create_cube(bm, size=1.0)['verts']
        bmesh.ops.scale(bm, vec=(sx, sz, sy), verts=verts)
        bmesh.ops.translate(bm, vec=P(cx, cy, cz), verts=verts)
        faces = {f for v in verts for f in v.link_faces}
        for f in faces:
            f.material_index = self.mi[kind]
        if bevel:
            edges = list({e for v in verts for e in v.link_edges})
            bmesh.ops.bevel(bm, geom=edges, offset=bevel, offset_type='OFFSET', segments=1, profile=0.5, affect='EDGES')

    def column(self, kind, cx, cy, cz, radius, height, seg=28):
        bm = self.bm
        res = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=radius, radius2=radius, depth=height)
        verts = res['verts']
        bmesh.ops.translate(bm, vec=P(cx, cy, cz), verts=verts)
        for f in {f for v in verts for f in v.link_faces}:
            f.material_index = self.mi[kind]
            f.smooth = True

    def ring(self, kind, cx, cy, cz, big, tube, axis='x', seg=64):
        """a torus lying in a wall: its axis along x (a wall facing east / west) or z"""
        bm = self.bm
        before = set(bm.verts)
        prof = [bm.verts.new((big + tube * math.cos(a), 0.0, tube * math.sin(a))) for a in [i / 10 * math.tau for i in range(10)]]
        edges = [bm.edges.new((prof[i], prof[(i + 1) % 10])) for i in range(10)]
        bmesh.ops.spin(bm, geom=prof + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=seg)
        new = [v for v in bm.verts if v not in before]
        bmesh.ops.remove_doubles(bm, verts=new, dist=1e-4)
        new = [v for v in new if v.is_valid]
        # the torus is round the Blender z axis; turn it so the axis points along the page's x (Blender x) or z (Blender y)
        rot = Matrix.Rotation(math.pi / 2, 3, 'Y') if axis == 'x' else Matrix.Rotation(math.pi / 2, 3, 'X')
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=rot, verts=new)
        bmesh.ops.translate(bm, vec=P(cx, cy, cz), verts=new)
        for f in {f for v in new for f in v.link_faces}:
            f.material_index = self.mi[kind]
            f.smooth = True

    def finish(self):
        """world-scale UVs (one unit per metre) in UVMap; an empty second set for the light map"""
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        uv = bm.loops.layers.uv.new('UVMap')
        bm.loops.layers.uv.new('UVLight')
        for f in bm.faces:
            n = f.normal
            ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
            for l in f.loops:
                x, y, z = l.vert.co.x, l.vert.co.y, l.vert.co.z      # Blender axes: z is up
                if az >= ax and az >= ay:
                    l[uv].uv = (x, -y)       # floors and ceilings
                elif ax >= ay:
                    l[uv].uv = (-y, z)       # walls facing east / west
                else:
                    l[uv].uv = (x, z)        # walls facing north / south
        mesh = bpy.data.meshes.new(self.name)
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(obj)
        for k in KINDS:
            m = bpy.data.materials.new(k + '.' + self.name.split('_')[1])
            m.use_nodes = True
            b = m.node_tree.nodes['Principled BSDF']
            b.inputs['Base Color'].default_value = (*COLORS[k], 1)
            b.inputs['Roughness'].default_value = 0.6
            if k in ('steel', 'brass'):
                b.inputs['Metallic'].default_value = 0.9
            if k == 'light_panel':
                b.inputs['Emission Color'].default_value = (*COLORS[k], 1)
                b.inputs['Emission Strength'].default_value = 1.0
            obj.data.materials.append(m)
        for p in mesh.polygons:
            p.use_smooth = p.use_smooth
        self.obj = obj
        return obj


# ====================================================== the main room =============================================
RH = 3.8
main = Room('room_main')
main.box('wood_floor', 0, -0.05, 0, 14, 0.1, 10)
main.box('ceiling', 0, RH + 0.05, 0, 14, 0.1, 10)
for x in (-6, -3, 3, 6):
    main.box('beam', x, RH - 0.11, 0, 0.3, 0.22, 10, bevel=0.012)
for x in (-3, 3):
    main.box('light_panel', x, RH - 0.23, 0, 1.6, 0.03, 0.34)
main.box('plaster', 0, RH / 2, 5.15, 14.6, RH, 0.3)                                    # south wall
for z in (-3.15, 3.15):
    main.box('plaster', 7.0, 2.3, z, 0.4, 4.6, 3.7)                                    # east wall, both sides of the doorway
main.box('plaster', 7.0, 3.65, 0, 0.4, 1.9, 2.6)                                       # over the doorway
for z in (-1.34, 1.34):
    main.box('brass', 6.78, 1.35, z, 0.06, 2.7, 0.08, bevel=0.006)                      # the door frame
main.box('brass', 6.78, 2.72, 0, 0.06, 0.06, 2.76, bevel=0.006)
main.box('trim_wood', 0, 0.08, 4.985, 14, 0.16, 0.03, bevel=0.006)                      # skirting boards
for z in (-3.2, 3.2):
    main.box('trim_wood', 6.785, 0.08, z, 0.03, 0.16, 3.6, bevel=0.006)
main.box('trim_wood', 0, RH - 0.07, 4.975, 14, 0.14, 0.05, bevel=0.008)                 # cornices
for z in (-3.2, 3.2):
    main.box('trim_wood', 6.775, RH - 0.07, z, 0.05, 0.14, 3.6, bevel=0.008)
# the steel frames of the glass: north wall z = -5 (6 panes), west wall x = -7 (4 panes)
main.box('steel', 0, RH - 0.09, -5, 14, 0.18, 0.2, bevel=0.01)
main.box('steel', 0, 0.05, -5, 14, 0.1, 0.16, bevel=0.008)
for i in range(7):
    main.box('steel', -7 + 14 / 6 * i, RH / 2, -5, 0.09, RH, 0.13, bevel=0.008)
main.box('steel', -7, RH - 0.09, 0, 0.2, 0.18, 10, bevel=0.01)
main.box('steel', -7, 0.05, 0, 0.16, 0.1, 10, bevel=0.008)
for i in range(5):
    main.box('steel', -7, RH / 2, -5 + 2.5 * i, 0.13, RH, 0.09, bevel=0.008)
main.finish()

# ====================================================== the library hall ===========================================
HX0, HX1, HZ, HH = 7.2, 29.0, 6.5, 4.6
cx, L = (HX0 + HX1) / 2, HX1 - HX0
hall = Room('room_hall')
hall.box('marble', cx, -0.05, 0, L, 0.1, 13)
for z in (-6.15, 6.15):
    hall.box('brass', cx, 0.004, z, L - 0.4, 0.008, 0.04)                               # inlaid lines in the floor
hall.box('brass', HX1 - 0.35, 0.004, 0, 0.04, 0.008, 12.3)
hall.box('brass', HX0 + 0.55, 0.004, 0, 0.04, 0.008, 12.3)
hall.box('ceiling', cx, HH + 0.05, 0, L, 0.1, 13)
hall.box('plaster', cx, HH / 2, HZ + 0.15, L, HH, 0.3)                                  # south wall
hall.box('plaster', cx, HH / 2, -HZ - 0.15, L, HH, 0.3)                                 # north wall
hall.box('plaster', HX1 + 0.15, HH / 2, 0, 0.3, HH, 13)                                 # the end wall
x = 9.0
while x < HX1:
    hall.box('beam', x, HH - 0.15, 0, 0.28, 0.3, 13, bevel=0.012)                       # ribs
    for s in (-1, 1):
        hall.box('beam', x, HH - 0.55, s * (HZ - 0.15), 0.3, 0.9, 0.3, bevel=0.01)      # corbels
    x += 3.6
for z in (-3.2, 3.2):
    hall.box('beam', cx, HH - 0.1, z, L, 0.2, 0.18, bevel=0.01)                         # the long beams: coffers between them
x = 10.8
while x < HX1:
    hall.box('light_panel', x, HH - 0.32, 0, 1.6, 0.03, 0.4)
    x += 3.6
for z in (-1.34, 1.34):
    hall.box('brass', 7.22, 1.35, z, 0.06, 2.7, 0.08, bevel=0.006)                      # the doorway, hall side
hall.box('brass', 7.22, 2.72, 0, 0.06, 0.06, 2.76, bevel=0.006)
hall.box('trim_wood', HX1 - 0.03, 0.55, 0, 0.06, 1.1, 12.6, bevel=0.006)                # the panelling of the end wall
hall.box('trim_wood', HX1 - 0.05, 1.12, 0, 0.1, 0.06, 12.8, bevel=0.008)
for s in (-1, 1):                                                                     # the pilasters beside the round window
    z = s * 3.4
    hall.box('brass', HX1 - 0.3, 0.06, z, 0.5, 0.12, 0.5, bevel=0.01)
    hall.column('marble', HX1 - 0.3, 2.05, z, 0.17, 3.9)
    hall.box('brass', HX1 - 0.3, 4.04, z, 0.5, 0.12, 0.5, bevel=0.01)
hall.ring('brass', HX1 - 0.03, 2.8, 0, 1.75, 0.07, 'x')                                 # the frame of the round window
hall.ring('trim_wood', HX1 - 0.03, 2.8, 0, 1.95, 0.05, 'x')
for z in (-HZ + 0.03, HZ - 0.03):
    hall.box('trim_wood', cx, HH - 0.08, z, L, 0.16, 0.06, bevel=0.008)                 # the cornice of the long walls
hall.box('trim_wood', HX1 - 0.03, HH - 0.08, 0, 0.06, 0.16, 13, bevel=0.008)
hall.finish()


# ====================================================== ambient occlusion on its own atlas =============================
def unwrap_and_bake(room):
    obj = room.obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    mesh = obj.data
    mesh.uv_layers.active = mesh.uv_layers['UVLight']
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    tag = room.name.split('_')[1]
    img = bpy.data.images.new('ao_' + tag, SIZE, SIZE, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    for m in obj.data.materials:
        node = m.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = img
        m.node_tree.nodes.active = node
        node.select = True
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = SAMPLES
    sc.render.bake.margin = 6
    world = bpy.data.worlds.new('w')
    sc.world = world
    world.light_settings.distance = 2.2
    bpy.ops.object.bake(type='AO', use_clear=True)
    img.filepath_raw = os.path.join(OUT, 'ao_%s.jpg' % tag)
    img.file_format = 'JPEG'
    sc.render.image_settings.quality = 88
    img.save()
    # the page does not need the bake nodes: drop them so the exporter writes only the real materials
    for m in obj.data.materials:
        for n in [n for n in m.node_tree.nodes if n.bl_idname == 'ShaderNodeTexImage']:
            m.node_tree.nodes.remove(n)
    print('baked', tag, SIZE, 'x', SIZE, 'samples', SAMPLES)


unwrap_and_bake(main)
unwrap_and_bake(hall)
mesh_info = [(r.name, len(r.obj.data.polygons)) for r in (main, hall)]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'rooms.glb'), export_format='GLB', export_apply=True, export_texcoords=True, export_normals=True)
print('exported rooms.glb', mesh_info)
