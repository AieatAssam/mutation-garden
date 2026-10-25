"""Build the five M4 automation props into public/models/automation.glb.

Run inside Blender 5.x. Each prop is one palette-material mesh and one idle action,
so the models can stay at one draw call while the render layer adds its own effects.
"""
import bpy, bmesh, json, math, os
from mathutils import Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.environ.get('AUTOMATION_GLB') or os.path.join(ROOT, 'public', 'models', 'automation.glb')
with open(os.path.join(ROOT, 'docs', 'art', 'palette.json')) as f:
    PAL = json.load(f)


def hex_of(path):
    node = PAL
    for key in path.split('.'):
        node = node[int(key)] if isinstance(node, list) else node[key]
    return node


def mat(path):
    material = bpy.data.materials.get(path) or bpy.data.materials.new(path)
    h = hex_of(path).lstrip('#')
    linear = [((lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
               (int(h[i:i + 2], 16) / 255)) for i in (0, 2, 4)]
    material.diffuse_color = (*linear, 1)
    material.use_nodes = True
    bsdf = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*linear, 1)
    bsdf.inputs['Roughness'].default_value = 1.0
    return material


def box(bm, center, scale):
    geom = bmesh.ops.create_cube(bm, size=1)['verts']
    bmesh.ops.scale(bm, verts=geom, vec=scale)
    bmesh.ops.translate(bm, verts=geom, vec=center)


def sphere(bm, center, scale, segments=16, rings=10):
    geom = bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1)['verts']
    bmesh.ops.scale(bm, verts=geom, vec=scale)
    bmesh.ops.translate(bm, verts=geom, vec=center)


def cylinder(bm, center, radius, depth, axis='Z', segments=16):
    geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=segments,
                                 radius1=radius, radius2=radius, depth=depth)['verts']
    if axis != 'Z':
        bmesh.ops.rotate(bm, verts=geom, cent=(0, 0, 0),
                         matrix=Matrix.Rotation(math.pi / 2, 3, axis))
    bmesh.ops.translate(bm, verts=geom, vec=center)


def cone(bm, center, bottom, top, depth, segments=16):
    geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=segments,
                                 radius1=bottom, radius2=top, depth=depth)['verts']
    bmesh.ops.translate(bm, verts=geom, vec=center)


def idle(obj, action_name, kind):
    obj.animation_data_create()
    action = bpy.data.actions.new(action_name)
    obj.animation_data.action = action
    obj.rotation_mode = 'XYZ'
    if kind == 'swivel':
        for frame, angle in ((1, -0.22), (19, 0.22), (37, -0.22), (55, 0.22), (73, -0.22)):
            obj.rotation_euler.z = angle
            obj.keyframe_insert(data_path='rotation_euler', index=2, frame=frame, group='Idle')
    elif kind == 'rock':
        for frame, angle in ((1, -0.035), (19, 0.035), (37, -0.035), (55, 0.035), (73, -0.035)):
            obj.rotation_euler.y = angle
            obj.keyframe_insert(data_path='rotation_euler', index=1, frame=frame, group='Idle')
    else:
        for frame, angle in ((1, -0.025), (19, 0.025), (37, -0.025), (55, 0.025), (73, -0.025)):
            obj.rotation_euler.z = angle
            obj.keyframe_insert(data_path='rotation_euler', index=2, frame=frame, group='Idle')
    action['idle'] = True
    action['loop_start'], action['loop_end'] = 1, 73


def prop(name, material, build, action_kind):
    bm = bmesh.new()
    build(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for face in mesh.polygons:
        face.use_smooth = True
    mesh.materials.append(mat(material))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj['automation_id'] = name
    obj['idle_action'] = name.replace('-', '_') + '_idle'
    idle(obj, obj['idle_action'], action_kind)
    return obj


def sprinkler(bm):
    # A tripod and raised rotating crown make its watering radius read at island scale.
    cylinder(bm, (0, 0, 0.16), 0.13, 0.18, segments=12)
    cylinder(bm, (0, 0, 0.48), 0.055, 0.52, segments=10)
    for a in (0, 2 * math.pi / 3, 4 * math.pi / 3):
        x, y = math.cos(a), math.sin(a)
        box(bm, (x * 0.23, y * 0.23, 0.08), (0.44, 0.075, 0.09))
    cylinder(bm, (0, 0, 0.79), 0.14, 0.14, segments=12)
    box(bm, (0, 0, 0.91), (0.42, 0.13, 0.14))
    for x in (-0.23, 0.23):
        cone(bm, (x, 0, 0.85), 0.035, 0.012, 0.12, segments=8)


def hive(bm):
    # Stacked rounded tiers and a flared roof give the hive a beehive silhouette.
    for z, radius, depth in ((0.22, 0.35, 0.28), (0.47, 0.30, 0.26), (0.70, 0.24, 0.22)):
        sphere(bm, (0, 0, z), (radius, radius * 0.88, depth / 2), 20, 12)
    cone(bm, (0, 0, 0.92), 0.34, 0.08, 0.25, segments=20)
    cylinder(bm, (0, -0.265, 0.13), 0.075, 0.035, axis='Y', segments=16)
    box(bm, (0, -0.20, 0.045), (0.38, 0.2, 0.07))


def hopper(bm):
    box(bm, (0, 0, 0.36), (0.5, 0.42, 0.62))
    cone(bm, (0, 0, 0.79), 0.37, 0.23, 0.28, segments=12)
    box(bm, (0, 0, 0.96), (0.48, 0.48, 0.07))
    cone(bm, (0, -0.27, 0.21), 0.22, 0.10, 0.28, segments=10)
    box(bm, (0, -0.39, 0.10), (0.34, 0.2, 0.08))
    # One seed packet resting on the chute identifies the output.
    box(bm, (0, -0.37, 0.22), (0.16, 0.035, 0.20))


def helper(bm):
    # A low, four-legged garden beetle with raised feelers and a fruit pannier.
    sphere(bm, (0, 0, 0.38), (0.34, 0.25, 0.23), 20, 12)
    sphere(bm, (0.27, -0.01, 0.46), (0.19, 0.18, 0.17), 16, 10)
    for side in (-1, 1):
        for x in (-0.20, 0.18):
            leg = box(bm, (x, side * 0.23, 0.19), (0.10, 0.12, 0.32))
            bmesh.ops.rotate(bm, verts=leg, cent=(x, side * 0.23, 0.35),
                             matrix=Matrix.Rotation(math.radians(side * 12), 3, 'X'))
        cylinder(bm, (0.31, side * 0.09, 0.64), 0.018, 0.27, axis='Y', segments=8)
    box(bm, (-0.22, 0, 0.68), (0.24, 0.28, 0.20))


def cart(bm):
    box(bm, (0, 0, 0.42), (0.74, 0.50, 0.23))
    for y in (-0.23, 0.23):
        box(bm, (0, y, 0.59), (0.74, 0.045, 0.22))
    for x in (-0.38, 0.38):
        box(bm, (x, 0, 0.59), (0.045, 0.50, 0.22))
    for x in (-0.25, 0.25):
        for y in (-0.30, 0.30):
            cylinder(bm, (x, y, 0.20), 0.17, 0.10, axis='Y', segments=20)
            cylinder(bm, (x, y * 1.18, 0.20), 0.07, 0.025, axis='Y', segments=12)
    for y in (-0.12, 0.12):
        box(bm, (0.61, y, 0.42), (0.44, 0.055, 0.055))


# Remove the startup cube, camera, and light so the export contains only these props.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)

objects = [
    prop('sprinkler', 'environment.water.2', sprinkler, 'swivel'),
    prop('bee-hive', 'environment.wood-crate.0', hive, 'rock'),
    prop('seed-hopper', 'environment.stall.wood.0', hopper, 'bob'),
    prop('harvest-helper', 'environment.grass.2', helper, 'rock'),
    prop('delivery-cart', 'environment.wood-crate.1', cart, 'rock'),
]
assert len(objects) == 5 and all(obj.type == 'MESH' and len(obj.data.polygons) for obj in objects)
assert len({obj.name for obj in objects}) == 5
assert all(len(obj.data.materials) == 1 for obj in objects)
assert all(obj.animation_data and obj.animation_data.action for obj in objects)

scene = bpy.context.scene
scene.frame_start, scene.frame_end = 1, 73
print('objects', len(objects), 'triangles', sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objects))
if os.environ.get('AUTOMATION_NO_EXPORT') != '1':
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=False, export_materials='EXPORT',
                              export_normals=True, export_texcoords=False, export_animations=True,
                              export_extras=True, export_cameras=False, export_lights=False, export_yup=True)
    print('exported', OUT, os.path.getsize(OUT))
