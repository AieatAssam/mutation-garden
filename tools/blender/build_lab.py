"""Build the Mutation Laboratory set and the two M6 plant models."""
import bpy
import os
from math import radians

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

def material(name, color, roughness=0.65):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1)
    value.roughness = roughness
    return value

glass = material("environment.water.1", (0.55, 0.78, 0.78), 0.22)
wood = material("environment.wood-crate.1", (0.48, 0.29, 0.18))
ink = material("ink.press-ink", (0.12, 0.16, 0.18))

bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.72, depth=1.28, location=(0, 0, 0.82))
jar = bpy.context.object
jar.name = "laboratory_jar"
jar.data.materials.append(glass)
bevel = jar.modifiers.new("Rounded glass edges", "BEVEL")
bevel.width = 0.08
bevel.segments = 3
jar.modifiers.new("Weighted glass normals", "WEIGHTED_NORMAL")
jar["asset_role"] = "glass jar for specimen collisions"

bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.75, depth=0.12, location=(0, 0, 1.5))
rim = bpy.context.object
rim.name = "jar_rim"
rim.data.materials.append(ink)

bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -0.08))
shelf = bpy.context.object
shelf.name = "laboratory_shelf"
shelf.dimensions = (3.2, 1.8, 0.24)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
shelf.data.materials.append(wood)
shelf.modifiers.new("Soft shelf corners", "BEVEL").width = 0.12
shelf.modifiers.new("Shelf normals", "WEIGHTED_NORMAL")

for obj in (jar, rim, shelf):
    obj.rotation_euler[2] = radians(-4)
    obj.select_set(True)
bpy.context.view_layer.objects.active = jar
bpy.ops.export_scene.gltf(filepath="public/models/lab.glb", export_format="GLB", use_selection=True)

# Plant meshes are separate so the old garden GLB continues to load without them.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

def plant_part(root, name, material_name, color, location, scale, ripe=False, fly=False):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, location=location)
    part = bpy.context.object
    part.name = name
    part.parent = root
    part.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    part.data.materials.append(material(material_name, color, 0.7))
    part["grow_start"], part["grow_end"] = (0.25, 1.0)
    part["attach"] = ""
    part["ripe"] = ripe
    part["fly"] = fly
    part.shape_key_add(name="Basis")
    grown = part.shape_key_add(name="grow")
    for point in grown.data:
        point.co.z *= 1.15
    return part

def lab_plant(name, fruit_color, leaf_color, shape):
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    if shape == "fig":
        plant_part(root, f"{name}_fruit", f"plants.{name}.fruit.1", fruit_color, (0, 0, 0.72), (0.3, 0.32, 0.38), True, True)
        plant_part(root, f"{name}_facet", f"plants.{name}.accent.facet", (1.0, 0.9, 0.68), (0, -0.26, 0.75), (0.07, 0.035, 0.28))
    else:
        for index, angle in enumerate(range(0, 360, 60)):
            bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.12, radius2=0.0, depth=0.45,
                                             location=(0, 0, 0.82))
            ray = bpy.context.object
            ray.name = f"{name}_ray_{index}"
            ray.parent = root
            ray.rotation_euler[1] = radians(angle)
            ray.data.materials.append(material(f"plants.{name}.fruit.1", fruit_color))
            ray["grow_start"], ray["grow_end"] = (0.25, 1.0)
            ray["attach"], ray["ripe"], ray["fly"] = "", True, True
        plant_part(root, f"{name}_core", f"plants.{name}.accent.rays", leaf_color, (root.location.x, -0.1, 0.82), (0.24, 0.24, 0.24), True, True)
    plant_part(root, f"{name}_leaf", f"plants.{name}.leaf.1", leaf_color, (0, 0.18, 0.38), (0.36, 0.12, 0.18))
    return root

lab_plant("prism-fig", (0.55, 0.28, 0.58), (1.0, 0.9, 0.68), "fig")
lab_plant("sunburst", (1.0, 0.62, 0.16), (0.94, 0.76, 0.29), "sun")
bpy.ops.object.select_all(action="DESELECT")
for obj in bpy.context.scene.objects:
    if obj.name.startswith(("prism-fig", "sunburst")):
        obj.select_set(True)
os.makedirs("public/models", exist_ok=True)
bpy.ops.export_scene.gltf(filepath="public/models/lab-plants.glb", export_format="GLB", use_selection=True,
                           export_morph=True, export_extras=True, export_materials="EXPORT")
