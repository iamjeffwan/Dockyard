import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILTIN_STATIC_SOURCES, staticManifestForSource } from '../prototypes/static-component-overlay/source-contract.js';

const manifestPath = join(process.cwd(), 'prototypes', 'static-component-overlay', 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(staticManifestForSource(BUILTIN_STATIC_SOURCES[0]), null, 2)}\n`);
