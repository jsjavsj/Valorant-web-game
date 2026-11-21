type Vec3 = [number, number, number];

export interface AssetLayout {
  version: 1;
  prop: string;
  character: string;
  colliders: { center: Vec3; halfExtents: Vec3; surface: string }[];
  navigation: { id: string; position: Vec3 }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

function isGlbName(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]+\.glb$/.test(value);
}

export function parseAssetLayout(value: unknown): AssetLayout {
  if (!isRecord(value) || value.version !== 1 || !isGlbName(value.prop) ||
      !isGlbName(value.character) || !Array.isArray(value.colliders) ||
      value.colliders.length === 0 || !Array.isArray(value.navigation)) {
    throw new Error("Invalid asset manifest");
  }

  const colliders = value.colliders.map((entry: unknown) => {
    if (!isRecord(entry) || !isVec3(entry.center) || !isVec3(entry.halfExtents) ||
        !entry.halfExtents.every((size) => size > 0) || typeof entry.surface !== "string") {
      throw new Error("Invalid asset collider");
    }
    return { center: entry.center, halfExtents: entry.halfExtents, surface: entry.surface };
  });
  const navigation = value.navigation.map((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || !isVec3(entry.position)) {
      throw new Error("Invalid asset navigation point");
    }
    return { id: entry.id, position: entry.position };
  });
  return { version: 1, prop: value.prop, character: value.character, colliders, navigation };
}
