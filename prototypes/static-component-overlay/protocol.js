export const OVERLAY_PROTOCOL_VERSION = '1';

export const OverlayEvent = Object.freeze({
  moduleLoading: 'module-loading',
  moduleReady: 'module-ready',
  moduleError: 'module-error',
  nativeToolShortcut: 'native-tool-shortcut',
  componentClick: 'component-click',
  dateChange: 'date-change',
  componentMove: 'component-move',
  componentDrop: 'component-drop',
  componentTransform: 'component-transform',
  componentBounds: 'component-bounds',
});

export const HostCommand = Object.freeze({ measure: 'measure', retry: 'retry', viewport: 'viewport', setMode: 'set-mode', setInstances: 'set-instances' });

export function createOverlayMessage(type, payload = {}) {
  return { protocol: 'dockyard-overlay', version: OVERLAY_PROTOCOL_VERSION, type, ...payload };
}

export function postOverlayMessage(type, payload = {}) {
  window.parent.postMessage(createOverlayMessage(type, payload), '*');
}

export function isHostCommand(data) {
  return data?.protocol === 'dockyard-overlay' && Object.values(HostCommand).includes(data.type);
}

export function rectOf(element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}
