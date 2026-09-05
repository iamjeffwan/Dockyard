import {
  BUILTIN_STATIC_SOURCES,
  resolveStaticComponent,
  staticSourceRegistry,
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
const fixturesEnabled = typeof window !== "undefined"
  && new URLSearchParams(window.location.search).get("staticFixtures") === "1";
const runtimeSourceRegistry = staticSourceRegistry(fixturesEnabled);

export function staticSourceById(id: string) {
  return runtimeSourceRegistry.sourceById.get(id);
}

export function staticComponentByKey(key: string, sourceId = STATIC_SOURCES[0].id) {
  const result = resolveStaticComponent(runtimeSourceRegistry, { sourceId, componentKey: key });
  return result.ok ? result.value.component : undefined;
}

export function isStaticComponentSelection(value: unknown): value is StaticComponentSelection {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.sourceLibraryId === "string" && typeof candidate.componentKey === "string";
}
