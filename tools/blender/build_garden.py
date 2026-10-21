"""Build the Mutation Garden island scenery and export public/models/garden.glb.

Run inside Blender (5.x):  blender -b -P tools/blender/build_garden.py
or exec() it from a live session. Deterministic: the same script makes the same model.

Conventions (ADR 0009):
- Blender is Z-up; glTF export turns it Y-up. Game z = -Blender y.
- Every material is named after a palette.json path, e.g. "environment.grass.1".
  The game swaps it for its shared toon material; colours here are preview only.
- Meshes named "outline-<thickness>" are smooth hulls drawn with the ink outline material.
- Plot centres match src/render/garden.ts: x in {-1.05, 1.05}, game z in {2, 0, -2}.
"""
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(bpy.data.filepath or __file__), '..', '..')) \
    if '__file__' in dir() else None
OUT = os.environ.get('GARDEN_GLB') or os.path.join(ROOT or '.', 'public', 'models', 'garden.glb')
PALETTE = os.path.join(ROOT or '.', 'docs', 'art', 'palette.json')

GROUND = 0.48          # grass top (game y)
PLOT_XS = (-1.05, 1.05)
PLOT_YS = (-2.0, 0.0, 2.0)  # Blender y (= -game z)
BED = 1.75
SOIL_TOP = 0.63

rng = random.Random(7)

# ---------------------------------------------------------------- helpers

import json
with open(PALETTE) as f:
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
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    m.diffuse_color = (*lin, 1)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*lin, 1)
    bsdf.inputs['Roughness'].default_value = 1.0
    return m


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_obj(name, bm, material, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    me.materials.append(mat(material))
    return link(bpy.data.objects.new(name, me))


def prim(kind, material, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), smooth=True, **kw):
    getattr(bpy.ops.mesh, f'primitive_{kind}_add')(location=loc, rotation=rot, **kw)
    o = bpy.context.active_object
    o.scale = scale
    o.data.materials.clear()
    o.data.materials.append(mat(material))
    for p in o.data.polygons:
        p.use_smooth = smooth
    return o


def rounded_box(material, size, loc, radius=0.04, rot=(0, 0, 0), segments=2):
    o = prim('cube', material, loc=loc, rot=rot, smooth=True)
    o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    b = o.modifiers.new('bevel', 'BEVEL')
    b.width = min(radius, min(size) * 0.45)
    b.segments = segments
    b.limit_method = 'NONE'
    bpy.ops.object.modifier_apply(modifier=b.name)
    return o


def island_radius(theta):
    return 4.0 + 0.16 * math.sin(3 * theta + 0.8) + 0.10 * math.sin(5 * theta + 2.1) + 0.05 * math.sin(9 * theta)


def ring(bm, n, radius_fn, z_fn, jitter=0.0):
    verts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        r = radius_fn(t) * (1 + rng.uniform(-jitter, jitter))
        verts.append(bm.verts.new((r * math.cos(t), r * math.sin(t), z_fn(t))))
    return verts


def bridge(bm, a, b):
    n = len(a)
    for i in range(n):
        bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))


def in_plot_zone(x, y, pad=0.12):
    return abs(x) < BED / 2 + 1.05 + pad and abs(y) < 2 + BED / 2 + pad


hull_parts = {0.06: [], 0.035: []}


def outline(obj, thickness=0.035):
    hull_parts[thickness].append(obj)
    return obj

# ---------------------------------------------------------------- reset

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
    for item in list(coll):
        coll.remove(item)

# ---------------------------------------------------------------- grass cap

N = 96
bm = bmesh.new()
center = bm.verts.new((0, 0, GROUND))
top_inner = ring(bm, N, lambda t: island_radius(t) * 0.90, lambda t: GROUND)
for i in range(N):
    bm.faces.new((center, top_inner[i], top_inner[(i + 1) % N]))
lip_a = ring(bm, N, lambda t: island_radius(t) * 0.975, lambda t: GROUND - 0.01)
lip_b = ring(bm, N, lambda t: island_radius(t) * 1.0, lambda t: GROUND - 0.07)
side = ring(bm, N, lambda t: island_radius(t) * 1.0, lambda t: GROUND - 0.2)
# Scalloped drips of turf over the rock.
drip = ring(bm, N, lambda t: island_radius(t) * 0.985,
            lambda t: GROUND - 0.3 - 0.16 * max(0.0, math.sin(11 * t + 0.4)) ** 3)
under = ring(bm, N, lambda t: island_radius(t) * 0.9, lambda t: GROUND - 0.32)
bridge(bm, top_inner, lip_a)
bridge(bm, lip_a, lip_b)
bridge(bm, lip_b, side)
bridge(bm, side, drip)
bridge(bm, drip, under)
cap_top = mesh_obj('grass-top', bm, 'environment.grass.1', smooth=True)
# Lighter lip and darker sides as material slots on one mesh.
cap_top.data.materials.append(mat('environment.grass.0'))
cap_top.data.materials.append(mat('environment.grass.2'))
for p in cap_top.data.polygons:
    zs = [cap_top.data.vertices[v].co.z for v in p.vertices]
    rs = [cap_top.data.vertices[v].co.xy.length for v in p.vertices]
    if min(zs) < GROUND - 0.12:
        p.material_index = 2
    elif min(zs) < GROUND - 0.005:
        p.material_index = 1
outline(cap_top, 0.06)

# ---------------------------------------------------------------- rock strata

bands = [  # (top fraction, bottom fraction, top z, bottom z, palette index)
    (0.93, 0.80, GROUND - 0.30, -0.55, 0),
    (0.82, 0.64, -0.50, -1.25, 1),
    (0.66, 0.46, -1.20, -1.95, 2),
    (0.48, 0.26, -1.90, -2.60, 3),
    (0.28, 0.02, -2.55, -3.35, 4),
]
rock_objs = []
for bi, (ft, fb, zt, zb, pi) in enumerate(bands):
    n = 18 - bi * 2
    offs = [rng.uniform(-0.06, 0.06) for _ in range(n)]
    bm = bmesh.new()
    phase = rng.uniform(0, 1)
    top = [bm.verts.new(((island_radius(t) * ft * (1 + offs[i])) * math.cos(t),
                         (island_radius(t) * ft * (1 + offs[i])) * math.sin(t),
                         zt + rng.uniform(-0.05, 0.05)))
           for i, t in ((i, 2 * math.pi * (i + phase) / n) for i in range(n))]
    bot = [bm.verts.new(((island_radius(t) * fb * (1 + rng.uniform(-0.08, 0.08))) * math.cos(t),
                         (island_radius(t) * fb * (1 + rng.uniform(-0.08, 0.08))) * math.sin(t),
                         zb + rng.uniform(-0.08, 0.08)))
           for t in (2 * math.pi * (i + phase + 0.5) / n for i in range(n))]
    # Zig-zag triangles read as chiselled facets.
    for i in range(n):
        bm.faces.new((top[i], top[(i + 1) % n], bot[i]))
        bm.faces.new((top[(i + 1) % n], bot[(i + 1) % n], bot[i]))
    bm.faces.new(list(reversed(top)))
    bm.faces.new(bot)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_obj(f'rock-{bi}', bm, f'environment.island-rock.{pi}', smooth=False)
    rock_objs.append(o)
    outline(o, 0.06)

# Hanging roots from the turf.
for k in range(7):
    t = 2 * math.pi * (k + rng.uniform(-0.2, 0.2)) / 7 + 0.3
    r0 = island_radius(t) * 0.9
    pts = []
    length = rng.uniform(0.7, 1.4)
    for s in range(6):
        f = s / 5
        rr = r0 - 0.15 * f + 0.05 * math.sin(f * 7 + k)
        pts.append((rr * math.cos(t + 0.06 * math.sin(f * 5 + k)), rr * math.sin(t + 0.06 * math.sin(f * 5 + k)),
                    GROUND - 0.25 - length * f))
    cu = bpy.data.curves.new(f'root-{k}', 'CURVE')
    cu.dimensions = '3D'
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts):
        p.co = (*c, 1)
    cu.bevel_depth = 0.035
    cu.bevel_resolution = 2
    sp.use_smooth = True
    o = link(bpy.data.objects.new(f'root-{k}', cu))
    o.data.materials.append(mat('environment.wood-crate.2'))
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    # taper by scaling verts toward the tip
    for v in o.data.vertices:
        f = (GROUND - 0.25 - v.co.z) / length
    o.select_set(False)

# ---------------------------------------------------------------- beds

for x in PLOT_XS:
    for y in PLOT_YS:
        h = 0.26
        zc = GROUND + h / 2 - 0.04
        t = 0.13
        L = BED
        # Four planks with chunky corner posts.
        for dx, dy, sx, sy in ((0, L / 2 - t / 2, L - 0.1, t), (0, -L / 2 + t / 2, L - 0.1, t),
                               (L / 2 - t / 2, 0, t, L - 0.1), (-L / 2 + t / 2, 0, t, L - 0.1)):
            outline(rounded_box('environment.wood-crate.1', (sx, sy, h), (x + dx, y + dy, zc), 0.045))
        for cx in (-1, 1):
            for cy in (-1, 1):
                outline(rounded_box('environment.wood-crate.2', (0.19, 0.19, h + 0.06),
                                    (x + cx * (L / 2 - 0.08), y + cy * (L / 2 - 0.08), zc + 0.03), 0.05))
        # Soil fill, slightly domed.
        soil = rounded_box('environment.soil.1', (L - 0.2, L - 0.2, 0.2), (x, y, SOIL_TOP - 0.1), 0.06)
        # Three furrow ridges running across the bed (game x).
        for fy in (-0.45, 0, 0.45):
            rid = prim('cylinder', 'environment.soil.0', loc=(x, y + fy, SOIL_TOP), rot=(0, math.pi / 2, 0),
                       vertices=10, radius=0.11, depth=L - 0.36)
            rid.scale = (1, 1, 1)
            rid.scale.y = 0.55 / 0.11 * 0.11 / 0.11 * 0.5  # flatten
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            b = rid.modifiers.new('bevel', 'BEVEL'); b.width = 0.05; b.segments = 2
            bpy.ops.object.modifier_apply(modifier=b.name)
            for p in rid.data.polygons:
                p.use_smooth = True
        # Soil crumbs
        for _ in range(4):
            px, py = rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6)
            prim('ico_sphere', 'environment.soil.2', loc=(x + px, y + py, SOIL_TOP + 0.02),
                 scale=(0.045, 0.045, 0.03), subdivisions=1, smooth=False)

# ---------------------------------------------------------------- crate (harvest target)

CX, CY = 2.75, -0.75
CS = 0.66
for side in range(4):
    a = side * math.pi / 2
    for row in range(3):
        sl = rounded_box('environment.wood-crate.0' if row % 2 == 0 else 'environment.wood-crate.1',
                         (CS - 0.04, 0.06, 0.14), (0, 0, 0), 0.02)
        sl.location = (CX + math.sin(a) * (CS / 2 - 0.03), CY + math.cos(a) * (CS / 2 - 0.03),
                       GROUND + 0.1 + row * 0.19)
        sl.rotation_euler = (0, 0, -a)
        outline(sl)
for cx in (-1, 1):
    for cy in (-1, 1):
        outline(rounded_box('environment.wood-crate.2', (0.09, 0.09, 0.6),
                            (CX + cx * (CS / 2 - 0.03), CY + cy * (CS / 2 - 0.03), GROUND + 0.3), 0.025))
rounded_box('environment.wood-crate.2', (CS - 0.06, CS - 0.06, 0.05), (CX, CY, GROUND + 0.05), 0.02)
# A few fruit already in the crate.
for i, (fx, fy, path) in enumerate(((-0.1, 0.08, 'plants.sunny-sprout.fruit.1'),
                                    (0.12, -0.06, 'plants.bubble-berry.fruit.1'),
                                    (0.02, -0.14, 'plants.sunny-sprout.fruit.2'))):
    outline(prim('uv_sphere', path, loc=(CX + fx, CY + fy, GROUND + 0.55), scale=(0.13, 0.13, 0.12),
                 segments=16, ring_count=10))

# ---------------------------------------------------------------- pond

PX, PY = -2.85, -1.0
bm = bmesh.new()
bmesh.ops.create_circle(bm, cap_ends=True, segments=28, radius=0.62)
for v in bm.verts:
    v.co.x *= 1.0 + 0.08 * math.sin(3 * math.atan2(v.co.y, v.co.x))
    v.co.y *= 0.78
    v.co += Vector((PX, PY, GROUND + 0.012))
mesh_obj('pond', bm, 'environment.water.1', smooth=True)
bm = bmesh.new()
bmesh.ops.create_circle(bm, cap_ends=True, segments=28, radius=0.42)
for v in bm.verts:
    v.co.y *= 0.7
    v.co += Vector((PX + 0.06, PY + 0.04, GROUND + 0.016))
mesh_obj('pond-deep', bm, 'environment.water.2', smooth=True)
for k in range(11):
    t = 2 * math.pi * k / 11 + rng.uniform(-0.1, 0.1)
    rx, ry = 0.7 * math.cos(t), 0.55 * math.sin(t)
    s = rng.uniform(0.09, 0.15)
    outline(prim('ico_sphere', f'environment.island-rock.{rng.choice((0, 0, 1))}',
                 loc=(PX + rx, PY + ry, GROUND + 0.02), scale=(s * 1.3, s, s * 0.7), subdivisions=1, smooth=False))
for lx, ly in ((-0.15, 0.1), (0.2, -0.12)):
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=14, radius=0.11)
    bm.verts.ensure_lookup_table(); bmesh.ops.delete(bm, geom=[bm.verts[0]], context='VERTS')
    for v in bm.verts:
        v.co += Vector((PX + lx, PY + ly, GROUND + 0.022))
    mesh_obj('lily', bm, 'environment.grass.0', smooth=True)

# ---------------------------------------------------------------- fence along the back

for k in range(13):
    t = math.radians(52 + k * 6.3)
    r = island_radius(t) * 0.9
    px, py = r * math.cos(t), r * math.sin(t)
    if abs(px) < 2.15 and py < 3.2:
        continue
    picket = rounded_box('environment.wood-crate.0', (0.12, 0.07, 0.5), (px, py, GROUND + 0.25), 0.03)
    picket.rotation_euler = (0, 0, t + math.pi / 2)
    outline(picket)
for k in range(12):
    t0, t1 = math.radians(52 + k * 6.3), math.radians(52 + (k + 1) * 6.3)
    p0 = Vector((island_radius(t0) * 0.9 * math.cos(t0), island_radius(t0) * 0.9 * math.sin(t0)))
    p1 = Vector((island_radius(t1) * 0.9 * math.cos(t1), island_radius(t1) * 0.9 * math.sin(t1)))
    mid = (p0 + p1) / 2
    if abs(mid.x) < 2.15 and mid.y < 3.2:
        continue
    for hz in (0.18, 0.36):
        rail = rounded_box('environment.wood-crate.1', ((p1 - p0).length + 0.04, 0.05, 0.07),
                           (mid.x, mid.y + 0.02, GROUND + hz), 0.02)
        rail.rotation_euler = (0, 0, math.atan2(p1.y - p0.y, p1.x - p0.x))

# ---------------------------------------------------------------- tree (back right)

TX, TY = 2.75, 2.45
trunk = prim('cone', 'environment.wood-crate.2', loc=(TX, TY, GROUND + 0.55), vertices=10,
             radius1=0.2, radius2=0.12, depth=1.1)
outline(trunk)
for (dx, dy, dz, s, shade) in ((0, 0, 1.55, 0.62, 1), (-0.38, -0.12, 1.3, 0.45, 1), (0.36, 0.05, 1.32, 0.48, 2),
                               (0.05, -0.3, 1.25, 0.42, 0), (0.1, 0.25, 1.9, 0.42, 0)):
    outline(prim('ico_sphere', f'environment.grass.{shade}', loc=(TX + dx, TY + dy, GROUND + dz),
                 scale=(s, s, s * 0.92), subdivisions=3))

# ---------------------------------------------------------------- watering can (back left)

WX, WY = -2.75, 1.7
body = prim('cylinder', 'environment.water.2', loc=(WX, WY, GROUND + 0.2), vertices=20, radius=0.2, depth=0.4)
b = body.modifiers.new('bevel', 'BEVEL'); b.width = 0.05; b.segments = 3
bpy.ops.object.modifier_apply(modifier=b.name)
outline(body)
spout = prim('cylinder', 'environment.water.2', loc=(WX + 0.3, WY - 0.05, GROUND + 0.32), vertices=10,
             radius=0.035, depth=0.42, rot=(0, math.radians(55), -0.15))
outline(spout)
outline(prim('cylinder', 'environment.water.3', loc=(WX + 0.47, WY - 0.08, GROUND + 0.45), vertices=10,
             radius=0.06, depth=0.05, rot=(0, math.radians(55), -0.15)))
handle = prim('torus', 'environment.water.3', loc=(WX - 0.02, WY, GROUND + 0.43), major_radius=0.14,
              minor_radius=0.03, rot=(math.pi / 2, 0, 0))
outline(handle)
blob = prim('cylinder', 'environment.water.0', loc=(WX, WY, GROUND + 0.41), vertices=20, radius=0.17, depth=0.01)

# ---------------------------------------------------------------- edge rocks, tufts, flowers

def scatter_point(rmin, rmax):
    for _ in range(200):
        t = rng.uniform(0, 2 * math.pi)
        r = island_radius(t) * rng.uniform(rmin, rmax)
        x, y = r * math.cos(t), r * math.sin(t)
        if in_plot_zone(x, y):
            continue
        if math.hypot(x - PX, y - PY) < 0.85 or math.hypot(x - CX, y - CY) < 0.55:
            continue
        if math.hypot(x - TX, y - TY) < 0.35 or math.hypot(x - WX, y - WY) < 0.45:
            continue
        return x, y
    return None


for k in range(12):
    t = 2 * math.pi * k / 12 + rng.uniform(-0.15, 0.15)
    r = island_radius(t) * 0.94
    x, y = r * math.cos(t), r * math.sin(t)
    if in_plot_zone(x, y, 0.2):
        continue
    s = rng.uniform(0.13, 0.24)
    outline(prim('ico_sphere', f'environment.island-rock.{rng.choice((0, 1, 1, 2))}',
                 loc=(x, y, GROUND + s * 0.2), scale=(s * 1.25, s, s * 0.75), subdivisions=1, smooth=False,
                 rot=(0, 0, rng.uniform(0, 3))))

for k in range(70):
    p = scatter_point(0.15, 0.97)
    if not p:
        continue
    x, y = p
    blades = rng.randint(4, 6)
    shade = rng.choice(('environment.grass.0', 'environment.grass.2', 'environment.grass.0'))
    for bl in range(blades):
        a = 2 * math.pi * bl / blades + rng.uniform(-0.3, 0.3)
        h = rng.uniform(0.14, 0.26)
        tilt = rng.uniform(0.25, 0.5)
        prim('cone', shade, loc=(x + 0.03 * math.cos(a), y + 0.03 * math.sin(a), GROUND + h / 2 - 0.01),
             vertices=4, radius1=0.035, radius2=0, depth=h, rot=(tilt * math.sin(a) * -1, tilt * math.cos(a), 0),
             smooth=False)

flower_colours = ('plants.bubble-berry.fruit.0', 'ink.paper-white', 'plants.twistroot.fruit.0',
                  'plants.bubble-berry.fruit.1')
for k in range(16):
    p = scatter_point(0.3, 0.95)
    if not p:
        continue
    x, y = p
    h = rng.uniform(0.16, 0.26)
    prim('cylinder', 'plants.sunny-sprout.stem.1', loc=(x, y, GROUND + h / 2), vertices=6, radius=0.018, depth=h)
    colour = rng.choice(flower_colours)
    for pk in range(5):
        a = 2 * math.pi * pk / 5
        prim('uv_sphere', colour, loc=(x + 0.055 * math.cos(a), y + 0.055 * math.sin(a), GROUND + h),
             scale=(0.05, 0.05, 0.025), segments=8, ring_count=5)
    prim('uv_sphere', 'plants.sunny-sprout.fruit.1', loc=(x, y, GROUND + h + 0.012), scale=(0.035, 0.035, 0.03),
         segments=8, ring_count=5)

# ---------------------------------------------------------------- join by material, build hulls

if os.environ.get('GARDEN_STOP_BEFORE_JOIN') == '1':
    raise SystemExit('stopped before join')

bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.objects:
    if o.type == 'MESH':
        for m in o.modifiers:
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier=m.name)

# Hulls: smooth duplicates of outlined objects, merged per thickness.
for thickness, objs in hull_parts.items():
    dupes = []
    for o in objs:
        d = o.copy(); d.data = o.data.copy(); link(d)
        d.data.materials.clear()
        bm = bmesh.new(); bm.from_mesh(d.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002)
        bm.to_mesh(d.data); bm.free()
        for p in d.data.polygons:
            p.use_smooth = True
        dupes.append(d)
    if not dupes:
        continue
    bpy.ops.object.select_all(action='DESELECT')
    for d in dupes:
        d.select_set(True)
    bpy.context.view_layer.objects.active = dupes[0]
    bpy.ops.object.join()
    hull = bpy.context.active_object
    hull.name = f'outline-{thickness}'
    hull.data.name = hull.name
    hull.data.materials.append(mat('ink.press-ink'))
    # Flat normals would crack the hull: force smooth normals through the exporter.
    hull.data.shade_smooth()

# Split every non-hull mesh by material, then join per material.
by_mat = {}
for o in [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('outline-')]:
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if len(o.data.materials) > 1:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.separate(type='MATERIAL')
        bpy.ops.object.mode_set(mode='OBJECT')
for o in [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('outline-')]:
    by_mat.setdefault(o.active_material.name, []).append(o)
for name, objs in by_mat.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    j = bpy.context.active_object
    j.name = name
    j.data.name = name
    # Clear unused material slots left over from joins.
    keep = [m for m in j.data.materials if m and m.name == name]
    j.data.materials.clear()
    j.data.materials.append(keep[0] if keep else mat(name))
    for p in j.data.polygons:
        p.material_index = 0

print('meshes', len([o for o in bpy.data.objects if o.type == 'MESH']),
      'tris', sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))

if os.environ.get('GARDEN_NO_EXPORT') != '1':
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_apply=True,
                              export_materials='EXPORT', export_normals=True, export_texcoords=False,
                              export_cameras=False, export_lights=False, export_yup=True)
    print('exported', OUT, os.path.getsize(OUT))
