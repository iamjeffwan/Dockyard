export const OVERLAY_PROTOCOL = "dockyard-overlay";
export const OVERLAY_PROTOCOL_VERSION = "1";

export const RuntimeEvent = {
  moduleReady: "module-ready",
  componentBounds: "component-bounds",
  componentDrop: "component-drop",
  componentTransform: "component-transform",
} as const;

export const RuntimeCommand = {
  viewport: "viewport",
  setMode: "set-mode",
  setInstances: "set-instances",
} as const;

export function isOverlayMessage(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && (value as Record<string, unknown>).protocol === OVERLAY_PROTOCOL);
}

export function isRuntimeReadyMessage(value: unknown) {
  return isOverlayMessage(value) && value.type === RuntimeEvent.moduleReady;
}

export function runtimeCommand(type: string, payload: Record<string, unknown> = {}) {
  return { protocol: OVERLAY_PROTOCOL, version: OVERLAY_PROTOCOL_VERSION, type, ...payload };
}
