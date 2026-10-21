"""Build the three starter plants and export public/models/plants.glb.

Run inside Blender (5.x). Deterministic. Conventions (ADR 0009):
- One empty per species, named by species id, at the plot anchor (soil top) origin.
- Child meshes are named "<species>_<channel>[_<n>]". Channel is stem, leaf, fruit or cap.
  The game drives one morph influence per channel, so parts grow with overlapping timing.
- Each mesh has one shape key, "grow": the basis is the seedling pose, "grow" is fully grown.
- Materials are palette paths. Fruit meshes get a per-plant material in game for the ripe warm-up.
"""
import bpy, bmesh, math, os, random, json
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.environ.get('PLANTS_GLB') or os.path.join(ROOT, 'public', 'models', 'plants.glb')
with open(os.path.join(ROOT, 'docs', 'art', 'palette.json')) as f:
    PAL = json.load(f)
rng = random.Random(11)


def hex_of(path):
    node = PAL
    for key in path.split('.'):
        node = node[int(key)] if isinstance(node, list) else node[key]
    return node


def mat(path):
    m = bpy.data.materials.get(path)
    if m:
        return m
    m = bpy.data.materials.new(path)
    h = hex_of(path).lstrip('#')
    lin = [(lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)(int(h[i:i + 2], 16) / 255)
           for i in (0, 2, 4)]
    m.diffuse_color = (*lin, 1)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*lin, 1)
    bsdf.inputs['Roughness'].default_value = 1.0
    return m


def obj_from_bm(name, bm, material, parent, smooth=True):
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    me.materials.append(mat(material))
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.parent = parent
    return o


def growable(o, collapse):
    """Fully grown geometry becomes the "grow" key; the basis becomes collapse(co)."""
    o.shape_key_add(name='Basis')
    o.shape_key_add(name='grow')
    basis = o.data.shape_keys.key_blocks['Basis']
    for i, v in enumerate(o.data.vertices):
        c = collapse(Vector(v.co))
        basis.data[i].co = c
        v.co = c
    return o


def scale_about(pivot, sx, sy=None, sz=None):
    sy = sx if sy is None else sy
    sz = sx if sz is None else sz
    return lambda co: Vector((pivot.x + (co.x - pivot.x) * sx, pivot.y + (co.y - pivot.y) * sy,
                              pivot.z + (co.z - pivot.z) * sz))


def sphere_bm(radius, center=(0, 0, 0), scale=(1, 1, 1), segments=24, rings=16, ribs=0, rib_depth=0.0):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    for v in bm.verts:
        if ribs:
            a = math.atan2(v.co.y, v.co.x)
            k = 1 + rib_depth * math.cos(a * ribs)
            v.co.x *= k
            v.co.y *= k
        v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2])) + Vector(center)
    return bm


def tube_bm(points, radii, sides=10):
    """A smooth tube along points with per-point radius, capped at both ends."""
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(points):
        p = Vector(p)
        d = (Vector(points[min(i + 1, len(points) - 1)]) - Vector(points[max(i - 1, 0)])).normalized()
        side = d.cross(Vector((0, 1, 0))) if abs(d.y) < 0.9 else d.cross(Vector((1, 0, 0)))
        side.normalize()
        up = side.cross(d).normalized()
        ring = []
        for s in range(sides):
            a = 2 * math.pi * s / sides
            ring.append(bm.verts.new(p + (side * math.cos(a) + up * math.sin(a)) * radii[i]))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for s in range(sides):
            bm.faces.new((a[s], a[(s + 1) % sides], b[(s + 1) % sides], b[s]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    return bm


def leaf_bm(length, width, thickness=0.05, cup=0.25, segments=10):
    """A rounded, slightly cupped leaf lying along +X from the origin."""
    bm = sphere_bm(1, segments=segments * 2, rings=segments)
    for v in bm.verts:
        x, y, z = v.co
        # Teardrop: pointed tip at +X.
        t = max(0.0, min(1.0, (x + 1) / 2))
        w = math.sin(math.pi * min(1, t ** 0.8)) * width
        v.co = Vector((t * length, y * w, z * thickness + cup * (y * y) * width))
    return bm


def transform(bm, matrix):
    bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    return bm


for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials):
    for item in list(coll):
        coll.remove(item)


def species_root(name, x):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.location = (x, 0, 0)  # spread out for previewing; the game reads each subtree relative to its root
    return e

# ---------------------------------------------------------------- Sunny Sprout: lollipop

root = species_root('sunny-sprout', -2.0)
P = 'plants.sunny-sprout'
stem_pts = [(0, 0, 0), (0.02, 0, 0.2), (0.0, 0, 0.42), (-0.03, 0, 0.62), (0, 0, 0.8)]
stem = obj_from_bm('sunny-sprout_stem', tube_bm(stem_pts, [0.085, 0.08, 0.075, 0.07, 0.065]), f'{P}.stem.1', root)
growable(stem, scale_about(Vector((0, 0, 0)), 0.6, 0.6, 0.08))
for i, side in enumerate((-1, 1)):
    bm = leaf_bm(0.42, 0.2, 0.045, 0.6)
    transform(bm, Matrix.Translation((0, 0, 0.16)) @ Matrix.Rotation(math.radians(90 - 90 * side), 4, 'Z')
              @ Matrix.Rotation(math.radians(-28), 4, 'Y'))
    lf = obj_from_bm(f'sunny-sprout_leaf_{i}', bm, f'{P}.leaf.1', root)
    growable(lf, scale_about(Vector((0, 0, 0.05)), 0.25))
fruit_center = Vector((0, 0, 0.8 + 0.27))
bm = sphere_bm(0.31, fruit_center, (1, 1, 0.88), 32, 20, ribs=8, rib_depth=0.07)
fr = obj_from_bm('sunny-sprout_fruit', bm, f'{P}.fruit.1', root)
growable(fr, lambda co: Vector((0, 0, 0.12)) + (co - fruit_center) * 0.12)
# Little calyx star on top of the fruit.
bm = bmesh.new()
for k in range(5):
    sub = leaf_bm(0.13, 0.05, 0.025, 0.2, 6)
    transform(sub, Matrix.Translation(fruit_center + Vector((0, 0, 0.25))) @ Matrix.Rotation(2 * math.pi * k / 5, 4, 'Z')
              @ Matrix.Rotation(math.radians(-20), 4, 'Y'))
    me = bpy.data.meshes.new('tmp'); sub.to_mesh(me); sub.free(); bm.from_mesh(me); bpy.data.meshes.remove(me)
cap = obj_from_bm('sunny-sprout_cap', bm, f'{P}.leaf.2', root)
growable(cap, lambda co: Vector((0, 0, 0.15)) + (co - fruit_center) * 0.12)

# ---------------------------------------------------------------- Bubble Berry: low dome of berries

root = species_root('bubble-berry', 0.0)
P = 'plants.bubble-berry'
for k in range(7):
    bm = leaf_bm(0.4, 0.26, 0.04, 0.45)
    a = 2 * math.pi * k / 7 + 0.2
    transform(bm, Matrix.Translation((0, 0, 0.06)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(math.radians(-12), 4, 'Y'))
    lf = obj_from_bm(f'bubble-berry_leaf_{k}', bm, f'{P}.leaf.1' if k % 2 else f'{P}.leaf.2', root)
    growable(lf, scale_about(Vector((0, 0, 0.04)), 0.2))
berries = [((0.0, 0.0, 0.52), 0.2), ((0.21, 0.1, 0.42), 0.16), ((-0.19, 0.12, 0.43), 0.15),
           ((0.06, -0.21, 0.42), 0.15), ((-0.12, -0.14, 0.62), 0.12), ((0.14, 0.04, 0.66), 0.11)]
stalk = bmesh.new()
for (c, r) in berries:
    sub = tube_bm([(0, 0, 0.05), (c[0] * 0.5, c[1] * 0.5, c[2] * 0.6), (c[0], c[1], c[2] - r * 0.6)],
                  [0.04, 0.032, 0.028], 8)
    me = bpy.data.meshes.new('tmp'); sub.to_mesh(me); sub.free(); stalk.from_mesh(me); bpy.data.meshes.remove(me)
st = obj_from_bm('bubble-berry_stem', stalk, f'{P}.stem.1', root)
growable(st, scale_about(Vector((0, 0, 0.05)), 0.3, 0.3, 0.15))
cluster = Vector((0, 0, 0.5))
fruit = bmesh.new()
dots = bmesh.new()
for (c, r) in berries:
    sub = sphere_bm(r, c, (1, 1, 1), 20, 14)
    me = bpy.data.meshes.new('tmp'); sub.to_mesh(me); sub.free(); fruit.from_mesh(me); bpy.data.meshes.remove(me)
    # Cream highlight dot facing the key light (upper left, front).
    d = Vector((-0.45, -0.55, 0.7)).normalized()
    sub = sphere_bm(r * 0.22, Vector(c) + d * r * 0.93, (1, 1, 0.45), 10, 6)
    transform(sub, Matrix.Translation(Vector(c) + d * r * 0.93) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
              @ Matrix.Translation(-(Vector(c) + d * r * 0.93)))
    me = bpy.data.meshes.new('tmp'); sub.to_mesh(me); sub.free(); dots.from_mesh(me); bpy.data.meshes.remove(me)
fr = obj_from_bm('bubble-berry_fruit', fruit, f'{P}.fruit.1', root)
growable(fr, lambda co: Vector((0, 0, 0.12)) + (co - cluster) * 0.15)
ds = obj_from_bm('bubble-berry_cap', dots, f'{P}.accent.highlight', root)
growable(ds, lambda co: Vector((0, 0, 0.12)) + (co - cluster) * 0.15)

# ---------------------------------------------------------------- Twistroot: corkscrew root

root = species_root('twistroot', 2.0)
P = 'plants.twistroot'
# Soil bulge at the base.
bm = sphere_bm(0.32, (0, 0, -0.02), (1, 1, 0.35), 20, 10)
for v in bm.verts:
    if v.co.z < -0.02:
        v.co.z = -0.02
bulge = obj_from_bm('twistroot_stem', bm, 'environment.soil.0', root)
growable(bulge, scale_about(Vector((0, 0, -0.02)), 0.5, 0.5, 0.3))
# The root: a fat tapered body with a twisted cross-section and a corkscrew centre line.
H = 1.05
turns = 2.5
bm = bmesh.new()
rings = []
N = 40
sides = 14
for i in range(N + 1):
    t = i / N
    z = t * H
    r = 0.24 * (1 - t) ** 0.85 + 0.012
    cx = 0.07 * math.sin(2 * math.pi * turns * t) * (1 - t * 0.6)
    cy = 0.07 * math.cos(2 * math.pi * turns * t) * (1 - t * 0.6)
    twist = 2 * math.pi * turns * t
    ring = []
    for s in range(sides):
        a = 2 * math.pi * s / sides
        lobe = 1 + 0.18 * math.cos(3 * (a - twist))  # three twisted flutes
        ring.append(bm.verts.new((cx + math.cos(a) * r * lobe, cy + math.sin(a) * r * lobe, z)))
    rings.append(ring)
for a, b in zip(rings, rings[1:]):
    for s in range(sides):
        bm.faces.new((a[s], a[(s + 1) % sides], b[(s + 1) % sides], b[s]))
bm.faces.new(list(reversed(rings[0])))
tip = bm.verts.new((rings[-1][0].co.x * 0 + 0, 0, H + 0.04))
for s in range(sides):
    bm.faces.new((rings[-1][s], rings[-1][(s + 1) % sides], tip))
fr = obj_from_bm('twistroot_fruit', bm, f'{P}.fruit.1', root)
# Seedling: a short, fat nub. Scaling keeps the flutes, so growth reads as the twist rising out of the soil.
def untwist(co):
    return Vector((co.x * 0.6, co.y * 0.6, co.z * 0.14))
growable(fr, untwist)
# Spiky sage tuft at the tip.
tuft = bmesh.new()
for k in range(7):
    sub = leaf_bm(0.34 + 0.08 * (k % 2), 0.06, 0.03, 0.1, 6)
    transform(sub, Matrix.Translation((0, 0, H - 0.04)) @ Matrix.Rotation(2 * math.pi * k / 7, 4, 'Z')
              @ Matrix.Rotation(math.radians(-62 - 10 * (k % 3)), 4, 'Y'))
    me = bpy.data.meshes.new('tmp'); sub.to_mesh(me); sub.free(); tuft.from_mesh(me); bpy.data.meshes.remove(me)
tf = obj_from_bm('twistroot_leaf', tuft, f'{P}.leaf.1', root)
growable(tf, lambda co: Vector((0, 0, H * 0.12)) + (co - Vector((0, 0, H - 0.04))) * 0.35)

print('objects', len(bpy.data.objects))
if os.environ.get('PLANTS_NO_EXPORT') != '1':
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=False, export_materials='EXPORT',
                              export_normals=True, export_texcoords=False, export_morph=True,
                              export_morph_normal=True, export_cameras=False, export_lights=False, export_yup=True)
    print('exported', OUT, os.path.getsize(OUT))
