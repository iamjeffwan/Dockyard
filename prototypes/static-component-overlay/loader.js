import { postOverlayMessage } from './protocol.js';

const send = (type, details = {}) => postOverlayMessage(type, details);

export async function loadStaticComponentModule(baseUrl = '.') {
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
    for (const href of manifest.styles) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL(href, moduleBase).href;
      link.dataset.staticModule = manifest.name;
      document.head.append(link);
    }
    await import(new URL(manifest.entry, moduleBase).href);
    send('module-ready', { module: manifest.name, version: manifest.version, defaults: manifest.defaults });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    send('module-error', { module: manifest?.name ?? 'unknown', version: manifest?.version, error: message, phase: manifest ? 'entry' : 'manifest' });
    throw error;
  }
}
