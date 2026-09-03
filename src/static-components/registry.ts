export type StaticComponentVariant = {
  key: string;
  name: string;
  props?: Record<string, unknown>;
};

export type StaticComponentDefinition = {
  key: string;
  name: string;
  categoryPath: string[];
  variants?: StaticComponentVariant[];
};

export type StaticSourceDefinition = {
  id: string;
  name: string;
  manifestUrl: string;
  version: string;
};

export type StaticComponentSelection = {
  sourceLibraryId: string;
  componentKey: string;
  variantKey?: string;
  props?: Record<string, unknown>;
};

export const STATIC_SOURCES: StaticSourceDefinition[] = [
  { id: "carbon-react", name: "Carbon React", manifestUrl: "/prototypes/static-component-overlay/manifest.json", version: "0.1.0" },
];

export function isStaticComponentSelection(value: unknown): value is StaticComponentSelection {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.sourceLibraryId === "string" && typeof candidate.componentKey === "string";
}
