"""Build the three starter plants and export public/models/plants.glb.

Run inside Blender (5.x). Deterministic. Conventions (ADR 0009):
- One empty per species, named by species id, at the plot anchor (soil top).
- Child meshes are named "<species>_<part>". Each object's origin is its pivot: where it attaches.
- glTF extras on each mesh drive growth in the game (src/render/plants/authored.ts):
    grow_start, grow_end  window of overall progress in which the part grows (0..1)
    attach                name of the part whose tip this part rides ("" = the soil)
    ripe                  true for the fruit material that warms up when ripe
    fly                   true for parts that fly to the crate when harvested
  Elongating bodies (stems, the Twistroot root) carry one shape key, "grow": basis is the seedling.
  Every other part scales up from its pivot, so attached parts never float away from their parent.
- Materials are palette paths.
"""
import bpy, bmesh, math, os, json
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.environ.get('PLANTS_GLB') or os.path.join(ROOT, 'public', 'models', 'plants.glb')
with open(os.path.join(ROOT, 'docs', 'art', 'palette.json')) as f:
    PAL = json.load(f)


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


def merge(target, source):
    """Append bmesh source into target."""
    me = bpy.data.meshes.new('tmp')
    source.to_mesh(me)
    source.free()
    target.from_mesh(me)
    bpy.data.meshes.remove(me)
    return target


def part(name, bm, material, parent, pivot, grow, attach='', ripe=False, fly=False):
    """Create a mesh object whose origin is the pivot. bm is in plant space; it is moved to pivot space."""
    pivot = Vector(pivot)
    bmesh.ops.translate(bm, vec=-pivot, verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat(material))
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.parent = parent
    o.location = pivot
    o['grow_start'], o['grow_end'] = grow
    o['attach'] = attach
    o['ripe'] = ripe
    o['fly'] = fly
    return o


def morph(o, collapse):
    """Fully grown geometry becomes the "grow" key; the basis becomes collapse(co) (object space)."""
    o.shape_key_add(name='Basis')
    o.shape_key_add(name='grow')
    basis = o.data.shape_keys.key_blocks['Basis']
    for i, v in enumerate(o.data.vertices):
        c = collapse(Vector(v.co))
        basis.data[i].co = c
        v.co = c


def tube(points, radii, sides=12, cap_top=True):
    bm = bmesh.new()
    rings = []
    prev_side = None
    for i, p in enumerate(points):
        p = Vector(p)
        d = (Vector(points[min(i + 1, len(points) - 1)]) - Vector(points[max(i - 1, 0)])).normalized()
        ref = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))
        side = prev_side if prev_side is not None else d.cross(ref)
        side = (side - d * side.dot(d)).normalized()  # keep frames continuous along the curve
        prev_side = side
        up = d.cross(side).normalized()
        rings.append([bm.verts.new(p + (side * math.cos(2 * math.pi * s / sides) + up * math.sin(2 * math.pi * s / sides))
                                   * radii[i]) for s in range(sides)])
    for a, b in zip(rings, rings[1:]):
        for s in range(sides):
            bm.faces.new((a[s], a[(s + 1) % sides], b[(s + 1) % sides], b[s]))
    bm.faces.new(list(reversed(rings[0])))
    if cap_top:
        tip = bm.verts.new(Vector(points[-1]) + (Vector(points[-1]) - Vector(points[-2])).normalized() * radii[-1] * 0.6)
        for s in range(sides):
            bm.faces.new((rings[-1][s], rings[-1][(s + 1) % sides], tip))
    else:
        bm.faces.new(rings[-1])
    return bm


def curve_points(p0, p1, p2, n):
    """Quadratic Bezier samples."""
    p0, p1, p2 = Vector(p0), Vector(p1), Vector(p2)
    return [((1 - t) ** 2) * p0 + 2 * (1 - t) * t * p1 + (t ** 2) * p2 for t in (i / (n - 1) for i in range(n))]


def leaf(length, width, cup=0.5, droop=0.1, tip=0.8, thickness=0.022, nu=14, nv=7, rounded=False):
    """A cupped, drooping leaf lying along +X from the origin, closed so it outlines cleanly."""
    bm = bmesh.new()
    grid = []
    for i in range(nu + 1):
        u = i / nu
        # Narrow petiole, wide rounded body, soft point at the tip.
        w = width * (math.sin(math.pi * min(1.0, u ** tip)) ** (0.45 if rounded else 0.85)) * (0.25 + 0.75 * min(1.0, u / 0.18))
        row = []
        for j in range(nv + 1):
            v = -1 + 2 * j / nv
            row.append(bm.verts.new((u * length, v * w,
                                     cup * (v * v) * w - droop * u * u * length
                                     + 0.05 * width * (1 - abs(v)) * math.sin(math.pi * u))))
        grid.append(row)
    for i in range(nu):
        for j in range(nv):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=thickness)
    return bm


def place(bm, matrix):
    bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    return bm


def fruit_sphere(radius, center, segments=36, rings=24, ribs=0, rib_depth=0.0, squash=1.0, dimple=0.0):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    for v in bm.verts:
        a = math.atan2(v.co.y, v.co.x)
        polar = math.acos(max(-1, min(1, v.co.z / radius)))  # 0 at the top, pi at the bottom
        k = 1 + rib_depth * math.cos(a * ribs) * math.sin(polar) if ribs else 1
        v.co.x *= k
        v.co.y *= k
        v.co.z *= squash
        # Dimples at the poles where the stem and blossom end meet.
        v.co.z -= dimple * radius * (math.exp(-(polar / 0.45) ** 2) - math.exp(-((math.pi - polar) / 0.5) ** 2))
        v.co += Vector(center)
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

# ---------------------------------------------------------------- Sunny Sprout: a cheerful lollipop

root = species_root('sunny-sprout', -2.2)
P = 'plants.sunny-sprout'
STEM_H = 0.86
stem_pts = curve_points((0, 0, 0), (0.09, 0.02, 0.45), (0, 0, STEM_H), 12)
stem = part('sunny-sprout_stem', tube(stem_pts, [0.085 - 0.022 * i / 11 for i in range(12)], 12, cap_top=False),
            f'{P}.stem.1', root, (0, 0, 0), (0.0, 0.62))
morph(stem, lambda co: Vector((co.x * 0.7, co.y * 0.7, co.z * 0.09)))
# Two round leaves low on the stem, narrower together than the fruit (style guide 5).
leaves = bmesh.new()
for side, (length, width, height, lift) in ((-1, (0.33, 0.2, 0.1, 24)), (1, (0.3, 0.18, 0.16, 30))):
    merge(leaves, place(leaf(length, width, cup=0.55, droop=0.1, tip=0.75, rounded=True),
                        Matrix.Translation((0.03 * side, 0, height)) @ Matrix.Rotation(math.radians(90 - 90 * side + 8), 4, 'Z')
                        @ Matrix.Rotation(math.radians(-lift), 4, 'Y')))
part('sunny-sprout_leaf', leaves, f'{P}.leaf.1', root, (0, 0, 0.12), (0.06, 0.58))
# Fruit on top and wider than the leaves, with 8 shallow ribs (style guide 5).
FR = 0.36
fruit_center = Vector((0, 0, STEM_H + FR * 0.8))
part('sunny-sprout_fruit', fruit_sphere(FR, fruit_center, segments=48, rings=28, ribs=8, rib_depth=0.045, squash=0.86,
                                        dimple=0.16),
     f'{P}.fruit.1', root, (0, 0, STEM_H), (0.32, 1.0), attach='sunny-sprout_stem', ripe=True, fly=True)
cap = bmesh.new()
top = fruit_center + Vector((0, 0, FR * 0.86 - FR * 0.16))
for k in range(5):
    merge(cap, place(leaf(0.15, 0.06, cup=0.3, droop=0.25, tip=0.7, thickness=0.014, nu=8, nv=4),
                     Matrix.Translation(top) @ Matrix.Rotation(2 * math.pi * k / 5 + 0.3, 4, 'Z')
                     @ Matrix.Rotation(math.radians(-8), 4, 'Y')))
merge(cap, tube(curve_points(top, top + Vector((0, 0, 0.08)), top + Vector((0.06, 0, 0.13)), 6),
                [0.028, 0.026, 0.024, 0.022, 0.02, 0.018], 8))
part('sunny-sprout_cap', cap, f'{P}.leaf.2', root, (0, 0, STEM_H), (0.32, 1.0), attach='sunny-sprout_stem', fly=True)

# ---------------------------------------------------------------- Bubble Berry: a low dome of bouncy berries

root = species_root('bubble-berry', 0.0)
P = 'plants.bubble-berry'
for shade, count, base_z, lift, length, window, offset in (
        ('1', 4, 0.04, -14, 0.44, (0.0, 0.5), 0.0), ('2', 3, 0.07, -24, 0.38, (0.08, 0.55), 0.5)):
    rosette = bmesh.new()
    for k in range(count):
        merge(rosette, place(leaf(length, 0.22, cup=0.5, droop=0.2, tip=0.7, nu=16, nv=10, rounded=True),
                             Matrix.Translation((0, 0, base_z)) @ Matrix.Rotation(offset + 2 * math.pi * k / count, 4, 'Z')
                             @ Matrix.Rotation(math.radians(lift), 4, 'Y')))
    part(f'bubble-berry_leaf_{shade}', rosette, f'{P}.leaf.{shade}', root, (0, 0, 0.04), window)
berries = [((0.0, 0.0, 0.5), 0.19), ((0.2, 0.1, 0.41), 0.15), ((-0.19, 0.11, 0.42), 0.145), ((0.05, -0.2, 0.4), 0.15),
           ((-0.11, -0.13, 0.62), 0.12), ((0.13, 0.03, 0.64), 0.11)]
stalks = bmesh.new()
for (c, r) in berries:
    c = Vector(c)
    merge(stalks, tube(curve_points((0, 0, 0.05), (c.x * 0.3, c.y * 0.3, c.z * 0.75), c - Vector((0, 0, r * 0.7)), 7),
                       [0.035, 0.032, 0.03, 0.028, 0.026, 0.024, 0.022], 7))
st = part('bubble-berry_stem', stalks, f'{P}.stem.1', root, (0, 0, 0.05), (0.3, 0.75))
morph(st, lambda co: Vector((co.x * 0.3, co.y * 0.3, co.z * 0.2)))
CLUSTER = Vector((0, 0, 0.36))
fruit = bmesh.new()
dots = bmesh.new()
# Highlight dots face the key light as seen from the game camera (front right, above).
light = Vector((0.3, -0.6, 0.74)).normalized()
for (c, r) in berries:
    merge(fruit, fruit_sphere(r, c, 24, 16, squash=0.97))
    d = fruit_sphere(r * 0.28, (0, 0, 0), 12, 8, squash=0.4)
    place(d, Matrix.Translation(Vector(c) + light * r * 0.94) @ light.to_track_quat('Z', 'Y').to_matrix().to_4x4())
    merge(dots, d)
part('bubble-berry_fruit', fruit, f'{P}.fruit.1', root, CLUSTER, (0.38, 1.0), ripe=True, fly=True)
part('bubble-berry_cap', dots, f'{P}.accent.highlight', root, CLUSTER, (0.38, 1.0), fly=True)

# ---------------------------------------------------------------- Twistroot: a corkscrew root with a sage crown

root = species_root('twistroot', 2.2)
P = 'plants.twistroot'
mound = fruit_sphere(0.34, (0, 0, -0.03), 24, 12, squash=0.32)
for v in mound.verts:
    v.co.z = max(v.co.z, -0.03)
part('twistroot_mound', mound, 'environment.soil.0', root, (0, 0, 0), (0.0, 0.18))
H = 1.12
turns = 2.2
bm = bmesh.new()
rings = []
N, sides = 48, 20
for i in range(N + 1):
    t = i / N
    # A fat root that swells just above the soil and tapers to a blunt neck under the crown.
    r = 0.06 + 0.2 * math.sin(math.pi * min(1.0, 0.18 + t * 0.95)) ** 1.2 * (1 - t) ** 0.35
    # The whole body leans in a gentle corkscrew; two shallow spiral grooves carry the twist.
    sway = 0.09 * math.sin(math.pi * t)
    cx, cy = sway * math.sin(2 * math.pi * turns * t), sway * math.cos(2 * math.pi * turns * t) - sway * 0.4
    twist = 2 * math.pi * turns * t
    ring = []
    for s in range(sides):
        a = 2 * math.pi * s / sides
        groove = 1 - 0.16 * max(0.0, math.cos(2 * (a - twist))) ** 4
        ring.append(bm.verts.new((cx + math.cos(a) * r * groove, cy + math.sin(a) * r * groove, t * H)))
    rings.append(ring)
for a, b in zip(rings, rings[1:]):
    for s in range(sides):
        bm.faces.new((a[s], a[(s + 1) % sides], b[(s + 1) % sides], b[s]))
bm.faces.new(list(reversed(rings[0])))
tip = bm.verts.new((sum(v.co.x for v in rings[-1]) / sides, sum(v.co.y for v in rings[-1]) / sides, H + 0.02))
for s in range(sides):
    bm.faces.new((rings[-1][s], rings[-1][(s + 1) % sides], tip))
tip_point = Vector(tip.co)
rt = part('twistroot_root', bm, f'{P}.fruit.1', root, (0, 0, 0), (0.0, 1.0), ripe=True, fly=True)
# Seedling: a short fat nub; the twist rises out of the soil as it grows.
morph(rt, lambda co: Vector((co.x * 0.62, co.y * 0.62, co.z * 0.13)))
crown = bmesh.new()
for k in range(8):
    length = 0.4 + 0.08 * (k % 3)
    merge(crown, place(leaf(length, 0.07, cup=0.5, droop=0.55, tip=0.6, thickness=0.018, nu=14, nv=4),
                       Matrix.Translation(tip_point - Vector((0, 0, 0.04))) @ Matrix.Rotation(2 * math.pi * k / 8 + 0.2, 4, 'Z')
                       @ Matrix.Rotation(math.radians(-72 + 9 * (k % 3)), 4, 'Y')))
# Growth rings: cream bands around the root, which make it read as a root rather than a swirl.
bands = bmesh.new()
for t in (0.22, 0.4, 0.58):
    ring_r = (0.06 + 0.2 * math.sin(math.pi * min(1.0, 0.18 + t * 0.95)) ** 1.2 * (1 - t) ** 0.35) * 1.015
    sway = 0.09 * math.sin(math.pi * t)
    c = Vector((sway * math.sin(2 * math.pi * turns * t), sway * math.cos(2 * math.pi * turns * t) - sway * 0.4, t * H))
    band = bmesh.new()
    bmesh.ops.create_cone(band, cap_ends=False, segments=24, radius1=ring_r, radius2=ring_r * 0.97, depth=0.022)
    bmesh.ops.solidify(band, geom=band.faces[:], thickness=0.012)
    place(band, Matrix.Translation(c) @ Matrix.Rotation(math.radians(8 * math.sin(6 * t)), 4, 'X'))
    merge(bands, band)
bd = part('twistroot_bands', bands, f'{P}.accent.growth-ring', root, (0, 0, 0), (0.0, 1.0), fly=True)
# Same seedling collapse and window as the root, so the bands stay on its surface while it grows.
morph(bd, lambda co: Vector((co.x * 0.62, co.y * 0.62, co.z * 0.13)))
part('twistroot_crown', crown, f'{P}.leaf.1', root, tip_point, (0.2, 1.0), attach='twistroot_root', fly=True)

# ---------------------------------------------------------------- Puffcap: a broad, spotted mushroom
root = species_root('puffcap', 4.4)
P = 'plants.puffcap'
stem_bm = bmesh.new()
bmesh.ops.create_cone(stem_bm, segments=24, radius1=0.20, radius2=0.16, depth=0.92)
for v in stem_bm.verts: v.co.z += 0.46
stem = part('puffcap_stem', stem_bm, f'{P}.stem.1', root, (0, 0, 0), (0.0, 0.72))
morph(stem, lambda co: Vector((co.x * 0.72, co.y * 0.72, co.z * 0.16)))
cap_center = (0, 0, 0.91)
part('puffcap_cap', fruit_sphere(0.66, cap_center, 48, 28, squash=0.54), f'{P}.fruit.1', root,
     (0, 0, 0.55), (0.35, 1.0), attach='puffcap_stem', ripe=True, fly=True)
spots = bmesh.new()
for x, y, z, r in ((-.27, -.20, 1.15, .09), (.23, -.26, 1.18, .075), (.02, .20, 1.22, .08), (-.42, .02, 1.12, .06), (.42, .03, 1.11, .06)):
    merge(spots, fruit_sphere(r, (x, y, z), 16, 10))
part('puffcap_spots', spots, f'{P}.accent.spots', root, (0, 0, .55), (.35, 1.0), attach='puffcap_stem', ripe=True, fly=True)

print('objects', len(bpy.data.objects),
      'tris', sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))
if os.environ.get('PLANTS_NO_EXPORT') != '1':
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=False, export_materials='EXPORT',
                              export_normals=True, export_texcoords=False, export_morph=True, export_extras=True,
                              export_morph_normal=True, export_cameras=False, export_lights=False, export_yup=True)
    print('exported', OUT, os.path.getsize(OUT))
