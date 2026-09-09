import type { SceneData } from "../types.js";

const DOCKYARD_KEYS = new Set(["dockyard", "dockyardRole", "dockyardType", "dockyardNodeId", "dockyardRelationId", "relationType", "bindingId", "componentRefId", "sourceId", "componentKey", "variantKey", "targetElementId", "cardElementId", "previewElementId", "status", "role"]);

export function createEnhancedScene(scene: SceneData): SceneData {
  return { ...scene, dockyard: { schemaVersion: 1 }, elements: scene.elements.map((element) => ({ ...element, customData: element.customData ? { ...element.customData } : undefined })) };
}

export function createNativeScene(scene: SceneData): SceneData {
  return { ...scene, dockyard: undefined, elements: scene.elements.map((element) => {
    if (!element.customData) return element;
    const customData = Object.fromEntries(Object.entries(element.customData).filter(([key]) => !DOCKYARD_KEYS.has(key)));
    return { ...element, customData: Object.keys(customData).length ? customData : undefined };
  }) };
}

export function serializeScene(scene: SceneData, kind: "enhanced" | "native") {
  return JSON.stringify(kind === "enhanced" ? createEnhancedScene(scene) : createNativeScene(scene), null, 2);
}
