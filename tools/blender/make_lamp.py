"""The desk lamp of the Ark, built in Blender (bpy) and exported as glTF binary.

    python3 -m venv env && env/bin/pip install bpy          # Blender as a Python module (Python 3.11)
    env/bin/python tools/blender/make_lamp.py ark/models/desk_lamp.glb

Metres, Y up in the file (the exporter turns Blender's Z up into glTF's Y up), the origin is the foot of the lamp.
Two materials: brass (the stand) and a green glass shade that glows (emission kept at 1.0 or less: the page's
glTF loader is r128, which does not know the newer emissive-strength extension).
"""
import bpy  # (first: it makes bmesh importable)
import bmesh, math, sys

out = sys.argv[-1] if sys.argv[-1].endswith('.glb') else 'desk_lamp.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)


def lathe(name, profile, steps=40, closed=True):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0.0, z)) for r, z in profile]
    for a, b in zip(verts, verts[1:]):
        bm.edges.new((a, b))
    bmesh.ops.spin(bm, geom=bm.verts[:] + bm.edges[:], cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=steps)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    return obj


def material(name, color, metallic, roughness, emission=None, double_sided=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = roughness
    if emission:
        b.inputs['Emission Color'].default_value = (*emission, 1)
        b.inputs['Emission Strength'].default_value = 1.0
    m.use_backface_culling = not double_sided
    return m


stand = lathe('stand', [(0.0, 0.0), (0.085, 0.0), (0.085, 0.012), (0.06, 0.02), (0.016, 0.04), (0.012, 0.16), (0.016, 0.17), (0.012, 0.18), (0.012, 0.27), (0.024, 0.285), (0.0, 0.285)])
stand.data.materials.append(material('brass', (0.79, 0.64, 0.29), 1.0, 0.28))
shade = lathe('shade', [(0.03, 0.27), (0.045, 0.30), (0.075, 0.345), (0.125, 0.40), (0.13, 0.405)])
shade.data.materials.append(material('green_glass', (0.12, 0.55, 0.32), 0.1, 0.12, emission=(0.35, 0.95, 0.55), double_sided=True))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True)
print('exported', out, 'stand', len(stand.data.polygons), 'faces, shade', len(shade.data.polygons), 'faces')
