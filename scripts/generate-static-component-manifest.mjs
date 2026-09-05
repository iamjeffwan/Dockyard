import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILTIN_STATIC_SOURCES, TEST_STATIC_SOURCES, staticManifestForSource } from '../prototypes/static-component-overlay/source-contract.js';

const manifestPath = join(process.cwd(), 'prototypes', 'static-component-overlay', 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(staticManifestForSource(BUILTIN_STATIC_SOURCES[0]), null, 2)}\n`);
for (const source of TEST_STATIC_SOURCES) {
  const fixtureManifestPath = join(process.cwd(), 'prototypes', 'static-component-overlay', `manifest.${source.id}.json`);
  writeFileSync(fixtureManifestPath, `${JSON.stringify(staticManifestForSource(source), null, 2)}\n`);
}
