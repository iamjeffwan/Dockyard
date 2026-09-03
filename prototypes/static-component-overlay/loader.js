import { postOverlayMessage } from './protocol.js';

const send = (type, details = {}) => postOverlayMessage(type, details);

let lastRequest = null;
export async function loadStaticComponentModule(baseUrl = '.', selection = {}) {
  lastRequest = { baseUrl, selection };
  send('module-loading');
  let manifest;
  try {
    const moduleBase = new URL(`${baseUrl}/`, document.baseURI);
    const response = await fetch(new URL('manifest.json', moduleBase), { cache: 'no-store' });
    if (!response.ok) throw new Error(`manifest request failed (${response.status})`);
    manifest = await response.json();
    if (!manifest.name || !manifest.version || !manifest.entry || !Array.isArray(manifest.styles)) {
      throw new Error('manifest must include name, version, entry and styles');
    }
    const component = selection.componentKey ? manifest.components?.find((item) => item.key === selection.componentKey) : undefined;
    if (selection.componentKey && !component) throw new Error(`component not found: ${selection.componentKey}`);
    if (selection.variantKey && !component?.variants?.some((item) => item.key === selection.variantKey)) throw new Error(`variant not found: ${selection.variantKey}`);
    window.__DOCKYARD_STATIC_CONTEXT__ = { ...selection, component, manifest };
    for (const href of manifest.styles) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL(href, moduleBase).href;
      link.dataset.staticModule = manifest.name;
      document.head.append(link);
    }
    await import(new URL(manifest.entry, moduleBase).href);
    send('module-ready', { module: manifest.name, version: manifest.version, componentKey: selection.componentKey, variantKey: selection.variantKey, defaults: manifest.defaults });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    send('module-error', { module: manifest?.name ?? 'unknown', version: manifest?.version, error: message, phase: manifest ? 'entry' : 'manifest' });
    throw error;
  }
}

export function retryStaticComponentModule() {
  if (lastRequest) return loadStaticComponentModule(lastRequest.baseUrl, lastRequest.selection);
  return Promise.resolve();
}
