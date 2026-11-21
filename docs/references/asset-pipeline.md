# Pumpworks assets

The sample pump housing and maintenance drone are original procedural geometry from `assets/source/export_samples.py`. There are no external meshes, textures or animations. Record origin, author, and license for any third-party asset before adding it, and use only assets licensed for the project.

Run this from the repository root with Blender 4.x on your PATH:

```sh
blender --background --factory-startup --python-exit-code 1 --python assets/source/export_samples.py
```

- Author in meters with Blender +Z up. GLB, the JSON manifest, the Babylon scene, and Rapier use +Y up in a right-handed coordinate system. The exporter maps Blender coordinates as `(x, z, -y)`.
- Keep a character's rig origin at its feet. The sample uses a single lower-case `root` bone and a looping `Idle` clip at 24 FPS. Prop transforms stay in the exported scene so the visual centers match the collider centers.
- The exporter writes separate GLBs for the prop and character. The manifest contains static box centers and half extents, surface tags, and navigation points. Both runtimes validate the same manifest and create their Rapier colliders from it.
- The export rejects GLBs over 128 KiB per sample. No compression is needed at this size. Generated files land in `apps/client/public/assets` and can be recreated from the script.
- The navigation points are metadata for future movement and bot work. The preview has no walking or dynamic character colliders.
