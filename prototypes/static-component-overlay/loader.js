import { STATIC_SOURCE_REGISTRY, resolveStaticComponent, validateStaticManifest } from './source-contract.js';
import { postOverlayMessage } from './protocol.js';

let activeSourceId = '';
const send = (type, details = {}) => postOverlayMessage(activeSourceId, type, details);

let lastRequest = null;
export async function loadStaticComponentModule(baseUrl = '.', selection = {}) {
  lastRequest = { baseUrl, selection };
  activeSourceId = selection.sourceId;
  send('module-loading');
  let manifest;
  try {
    const source = STATIC_SOURCE_REGISTRY.sourceById.get(selection.sourceId);
    if (!source) throw new Error(`unknown-source: ${selection.sourceId || '(empty)'}`);
    const moduleBase = new URL(`${baseUrl}/`, document.baseURI);
    const response = await fetch(new URL('manifest.json', moduleBase), { cache: 'no-store' });
    if (!response.ok) throw new Error(`manifest request failed (${response.status})`);
    manifest = await response.json();
    const manifestResult = validateStaticManifest(source, manifest);
    if (!manifestResult.ok) throw new Error(`${manifestResult.error.code}: ${manifestResult.error.message}`);
    const resolved = selection.componentKey ? resolveStaticComponent(STATIC_SOURCE_REGISTRY, selection) : null;
    if (resolved && !resolved.ok) throw new Error(`${resolved.error.code}: ${resolved.error.message}`);
    const component = resolved?.value.component;
    window.__DOCKYARD_STATIC_CONTEXT__ = { ...selection, component, manifest };
    for (const href of manifest.styles) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL(href, moduleBase).href;
      link.dataset.staticModule = manifest.name;
      document.head.append(link);
    }
    await import(new URL(manifest.entry, moduleBase).href);
    send('module-ready', { module: manifest.name, moduleVersion: manifest.version, componentKey: selection.componentKey, variantKey: selection.variantKey, defaults: manifest.defaults });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    send('module-error', { module: manifest?.name ?? 'unknown', moduleVersion: manifest?.version, error: message, phase: manifest ? 'entry' : 'manifest' });
    throw error;
  }
}

export function retryStaticComponentModule() {
  if (lastRequest) return loadStaticComponentModule(lastRequest.baseUrl, lastRequest.selection);
  return Promise.resolve();
}
