import { resolveStaticComponent, staticSourceRegistry, validateStaticManifest } from './source-contract.js';
import { postOverlayMessage } from './protocol.js';

let activeSourceId = '';
const send = (type, details = {}) => postOverlayMessage(activeSourceId, type, details);
let attempt = 0;

let lastRequest = null;
export async function loadStaticComponentModule(baseUrl = '.', selection = {}) {
  lastRequest = { baseUrl, selection };
  activeSourceId = selection.sourceId;
  send('module-loading');
  let manifest;
  let phase = 'manifest';
  try {
    const registry = staticSourceRegistry(Boolean(selection.includeTestSources));
    const source = registry.sourceById.get(selection.sourceId);
    if (!source) throw new Error(`unknown-source: ${selection.sourceId || '(empty)'}`);
    const moduleBase = new URL(`${baseUrl}/`, document.baseURI);
    const manifestName = source.manifestUrl.split('/').pop() || 'manifest.json';
    const failure = source.failureSequence?.[attempt];
    attempt += 1;
    const requestedManifest = failure === 'manifest' ? 'missing-manifest.json' : manifestName;
    const response = await fetch(new URL(requestedManifest, moduleBase), { cache: 'no-store' });
    if (!response.ok) throw new Error(`manifest request failed (${response.status})`);
    manifest = await response.json();
    const manifestResult = validateStaticManifest(source, manifest);
    if (!manifestResult.ok) throw new Error(`${manifestResult.error.code}: ${manifestResult.error.message}`);
    const resolved = selection.componentKey ? resolveStaticComponent(registry, selection) : null;
    if (resolved && !resolved.ok) throw new Error(`${resolved.error.code}: ${resolved.error.message}`);
    const component = resolved?.value.component;
    window.__DOCKYARD_STATIC_CONTEXT__ = { ...selection, component, manifest };
    phase = 'style';
    document.querySelectorAll('link[data-static-module]').forEach((link) => link.remove());
    const styles = failure === 'style' ? ['./dist/missing-styles.css'] : manifest.styles;
    for (const href of styles) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL(href, moduleBase).href;
      link.dataset.staticModule = manifest.name;
      document.head.append(link);
      await new Promise((resolve, reject) => {
        link.addEventListener('load', resolve, { once: true });
        link.addEventListener('error', () => reject(new Error(`style request failed: ${href}`)), { once: true });
      });
    }
    phase = 'module';
    const entry = failure === 'module' ? './dist/missing-module.js' : manifest.entry;
    await import(new URL(entry, moduleBase).href);
    send('module-ready', { module: manifest.name, moduleVersion: manifest.version, componentKey: selection.componentKey, variantKey: selection.variantKey, defaults: manifest.defaults });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    send('module-error', { module: manifest?.name ?? 'unknown', moduleVersion: manifest?.version, error: message, phase });
    throw error;
  }
}

export function retryStaticComponentModule() {
  if (lastRequest) return loadStaticComponentModule(lastRequest.baseUrl, lastRequest.selection);
  return Promise.resolve();
}
