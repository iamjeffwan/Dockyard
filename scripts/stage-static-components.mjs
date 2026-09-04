import { copyFileSync, cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();
const sourceRoot = join(projectRoot, 'prototypes', 'static-component-overlay');
const targetRoot = join(projectRoot, 'public', 'static-component-overlay');

mkdirSync(targetRoot, { recursive: true });
for (const name of ['loader.js', 'manifest.json', 'protocol.js', 'runtime.html']) {
  copyFileSync(join(sourceRoot, name), join(targetRoot, name));
}
cpSync(join(sourceRoot, 'dist'), join(targetRoot, 'dist'), { recursive: true, force: true });
