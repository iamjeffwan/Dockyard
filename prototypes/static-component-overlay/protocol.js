export {
  HostCommand,
  OVERLAY_PROTOCOL,
  OVERLAY_PROTOCOL_VERSION,
  OverlayEvent,
  createProtocolMessage,
  validateProtocolMessage,
} from './source-contract.js';
import { createProtocolMessage, validateProtocolMessage } from './source-contract.js';

export function createOverlayMessage(sourceId, type, payload = {}) {
  return createProtocolMessage(sourceId, type, payload);
}

export function postOverlayMessage(sourceId, type, payload = {}) {
  window.parent.postMessage(createOverlayMessage(sourceId, type, payload), '*');
}

export function isHostCommand(data, sourceId) {
  return validateProtocolMessage(data, { sourceId, direction: 'host' }).ok;
}

export function rectOf(element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}
