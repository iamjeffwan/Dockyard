import type { SceneData } from "../types.js";

const DOCKYARD_KEYS = new Set(["dockyard", "dockyardRole", "dockyardType", "dockyardNodeId", "dockyardRelationId", "relationType", "relationId", "nodeId", "nodeRole", "bindingId", "componentRefId", "sourceId", "componentKey", "variantKey", "targetElementId", "cardElementId", "previewElementId", "status", "role"]);

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

export function createDesignIntentSummary(scene: SceneData) {
  const nodes = scene.elements.filter((element) => element?.customData?.dockyardRole === "design-node").map((element) => ({ elementId: element.id, ...element.customData }));
  const interactions = scene.elements.filter((element) => element?.customData?.dockyardRole === "interaction").map((element) => ({ elementId: element.id, ...element.customData }));
  const componentBindings = scene.elements.filter((element) => element?.customData?.dockyardRole === "component-binding").map((element) => ({ elementId: element.id, ...element.customData }));
  return { format: "dockyard-design-intent", schemaVersion: 1, nodes, interactions, componentBindings };
}
