import {
  HostCommand as SharedHostCommand,
  OVERLAY_PROTOCOL,
  OVERLAY_PROTOCOL_VERSION,
  OverlayEvent,
  createProtocolMessage,
  validateProtocolMessage,
} from "../../prototypes/static-component-overlay/source-contract.js";

export { OVERLAY_PROTOCOL, OVERLAY_PROTOCOL_VERSION };
export const RuntimeEvent = OverlayEvent;
export const RuntimeCommand = SharedHostCommand;

export function validateRuntimeMessage(value: unknown, sourceId: string) {
  return validateProtocolMessage(value, { sourceId, direction: "runtime" });
}

export function isOverlayMessage(value: unknown, sourceId: string): value is Record<string, unknown> {
  return validateRuntimeMessage(value, sourceId).ok;
}

export function isRuntimeReadyMessage(value: unknown, sourceId: string) {
  return isOverlayMessage(value, sourceId) && value.type === RuntimeEvent.moduleReady;
}

export function isRuntimeNativeToolShortcutMessage(
  value: unknown,
  sourceId: string,
): value is Record<string, unknown> & { key: string } {
  return isOverlayMessage(value, sourceId)
    && value.type === RuntimeEvent.nativeToolShortcut
    && typeof value.key === "string";
}

export function runtimeCommand(sourceId: string, type: string, payload: Record<string, unknown> = {}) {
  return createProtocolMessage(sourceId, type, payload);
}
