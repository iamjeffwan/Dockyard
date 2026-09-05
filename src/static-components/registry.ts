import {
  BUILTIN_STATIC_SOURCES,
  STATIC_SOURCE_REGISTRY,
  resolveStaticComponent,
  type StaticComponentDefinition,
  type StaticSourceDefinition,
} from "../../prototypes/static-component-overlay/source-contract.js";

export type { StaticComponentDefinition, StaticSourceDefinition };

export type StaticComponentSelection = {
  sourceLibraryId: string;
  componentKey: string;
  variantKey?: string;
  props?: Record<string, unknown>;
};

export const STATIC_SOURCES = [...BUILTIN_STATIC_SOURCES];
export const STATIC_COMPONENTS = [...STATIC_SOURCES[0].components];

export function staticSourceById(id: string) {
  return STATIC_SOURCE_REGISTRY.sourceById.get(id);
}

export function staticComponentByKey(key: string, sourceId = STATIC_SOURCES[0].id) {
  const result = resolveStaticComponent(STATIC_SOURCE_REGISTRY, { sourceId, componentKey: key });
  return result.ok ? result.value.component : undefined;
}

export function isStaticComponentSelection(value: unknown): value is StaticComponentSelection {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.sourceLibraryId === "string" && typeof candidate.componentKey === "string";
}
