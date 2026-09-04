export type StaticComponentVariant = {
  key: string;
  name: string;
  props?: Record<string, unknown>;
};

export type StaticComponentDefinition = {
  key: string;
  name: string;
  categoryPath: string[];
  defaultWidth: number;
  defaultHeight: number;
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

export const STATIC_COMPONENTS: StaticComponentDefinition[] = [
  { key: "carbon-button", name: "Button", categoryPath: ["actions", "button"], defaultWidth: 160, defaultHeight: 48, variants: [{ key: "default", name: "Default" }, { key: "danger", name: "Danger", props: { kind: "danger" } }] },
  { key: "carbon-date-picker", name: "DatePicker", categoryPath: ["forms", "date-picker"], defaultWidth: 288, defaultHeight: 64, variants: [{ key: "default", name: "Default" }] },
  { key: "carbon-checkbox", name: "Checkbox", categoryPath: ["forms", "checkbox"], defaultWidth: 140, defaultHeight: 24, variants: [{ key: "default", name: "Default" }] },
  { key: "carbon-dropdown", name: "Dropdown", categoryPath: ["forms", "dropdown"], defaultWidth: 300, defaultHeight: 64, variants: [{ key: "default", name: "Default" }] },
  { key: "carbon-toggle", name: "Toggle", categoryPath: ["forms", "toggle"], defaultWidth: 104, defaultHeight: 48, variants: [{ key: "default", name: "Default" }] },
];

export function staticComponentByKey(key: string) {
  return STATIC_COMPONENTS.find((component) => component.key === key);
}

export function isStaticComponentSelection(value: unknown): value is StaticComponentSelection {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.sourceLibraryId === "string" && typeof candidate.componentKey === "string";
}
