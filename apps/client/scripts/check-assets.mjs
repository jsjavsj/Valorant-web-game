import { readFile } from "node:fs/promises";

const assetDir = new URL("../public/assets/", import.meta.url);
const exportCommand = "blender --background --factory-startup --python-exit-code 1 --python assets/source/export_samples.py";

try {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", assetDir), "utf8"));
  for (const name of [manifest?.prop, manifest?.character]) {
    if (typeof name !== "string" || !/^[a-z0-9-]+\.glb$/.test(name)) {
      throw new Error("The manifest must name both the prop and character GLBs.");
    }
    const data = await readFile(new URL(name, assetDir));
    if (data.length < 20 || data.toString("ascii", 0, 4) !== "glTF" ||
        data.readUInt32LE(4) !== 2 || data.readUInt32LE(8) !== data.length) {
      throw new Error(`${name} is not a complete GLB v2 file.`);
    }
  }
} catch (error) {
  console.error(`Client asset export is missing or invalid. ${error.message}`);
  console.error(`From the repository root, run:\n${exportCommand}`);
  process.exitCode = 1;
}
