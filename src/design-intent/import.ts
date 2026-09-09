import type { SceneData } from "../types.js";

export type SceneImportResult = {
  scene: SceneData;
  isEnhanced: boolean;
  warning?: string;
  invalidReferences: string[];
};

export function importScene(value: unknown): SceneImportResult {
  if (!value || typeof value !== "object") throw new Error("不是有效的 Excalidraw 图稿");
  const parsed = value as Partial<SceneData>;
  if (parsed.type !== "excalidraw" || parsed.version !== 2 || !Array.isArray(parsed.elements)) throw new Error("不是有效的 Excalidraw v2 图稿");
  const elements = parsed.elements;
  const ids = new Set(elements.map((element) => element?.id).filter((id): id is string => typeof id === "string"));
  const enhanced = parsed.dockyard?.schemaVersion === 1;
  const invalidReferences = elements.flatMap((element) => {
    const data = element?.customData;
    if (!data || data.dockyardRole !== "component-binding") return [];
    return [data.targetElementId, data.cardElementId, data.previewElementId].filter((id): id is string => typeof id === "string" && !ids.has(id));
  });
  return {
    scene: {
      type: "excalidraw",
      version: 2,
      source: String(parsed.source || "imported-native"),
      elements,
      dockyard: enhanced ? { schemaVersion: 1 } : undefined,
      appState: parsed.appState || { viewBackgroundColor: "#ffffff" },
      files: parsed.files || {},
    },
    isEnhanced: enhanced,
    warning: parsed.dockyard && !enhanced ? "Dockyard 数据结构版本不受支持，已按普通画稿打开" : parsed.dockyard ? undefined : "这是普通画稿，未发现 Dockyard 关系数据",
    invalidReferences,
  };
}
