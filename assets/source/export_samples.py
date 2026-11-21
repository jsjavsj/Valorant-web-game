"""Generate original Pumpworks samples and their runtime assets with Blender."""
import json
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "apps" / "client" / "public" / "assets"
LIMIT_BYTES = 128 * 1024


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    scene.render.fps = 24


def box(name, center, size):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def export_glb(name, animated=False):
    path = OUTPUT / name
    result = bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", export_yup=True,
        export_animations=animated, export_apply=False,
    )
    if result != {"FINISHED"} or not 0 < path.stat().st_size <= LIMIT_BYTES:
        raise RuntimeError(f"Export failed or exceeded {LIMIT_BYTES} bytes: {path.name}")


def gltf_axes(vector):
    x, y, z = vector
    return [x, z, -y]


def export_prop():
    reset()
    prop = box("Pump housing", (-1, 0, 0.5), (1, 1, 1))
    prop["surface"] = "painted-metal"
    marker = bpy.data.objects.new("Pump approach", None)
    bpy.context.collection.objects.link(marker)
    marker.location = (-1, -1.25, 0)
    export_glb("pump.glb")
    return {
        "prop": "pump.glb",
        "colliders": [{
            "center": gltf_axes(prop.location),
            "halfExtents": [abs(value) / 2 for value in gltf_axes(prop.dimensions)],
            "surface": prop["surface"],
        }],
        "navigation": [{"id": marker.name, "position": gltf_axes(marker.location)}],
    }


def export_character():
    reset()
    model = box("Maintenance drone", (1, 0, 0.9), (0.65, 0.65, 1.8))
    armature = bpy.data.armatures.new("Drone skeleton")
    rig = bpy.data.objects.new("Drone rig", armature)
    bpy.context.collection.objects.link(rig)
    rig.location.x = 1
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bone = armature.edit_bones.new("root")
    bone.head = (0, 0, 0)
    bone.tail = (0, 0, 1)
    bpy.ops.object.mode_set(mode="OBJECT")

    group = model.vertex_groups.new(name="root")
    group.add(list(range(len(model.data.vertices))), 1.0, "REPLACE")
    modifier = model.modifiers.new("Drone skin", "ARMATURE")
    modifier.object = rig

    pose = rig.pose.bones["root"]
    pose.rotation_mode = "XYZ"
    for frame, angle in ((1, -0.12), (13, 0.12), (25, -0.12)):
        pose.rotation_euler.x = angle
        pose.keyframe_insert(data_path="rotation_euler", frame=frame)
    rig.animation_data.action.name = "Idle"
    bpy.context.scene.frame_set(1)
    export_glb("drone.glb", animated=True)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = {"version": 1, **export_prop(), "character": "drone.glb"}
    export_character()
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
