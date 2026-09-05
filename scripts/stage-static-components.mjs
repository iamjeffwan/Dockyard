import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';

const projectRoot = process.cwd();
const sourceRoot = join(projectRoot, 'prototypes', 'static-component-overlay');
const buildRoot = join(projectRoot, '.tmp', 'static-component-overlay', 'dist');
const targetRoot = join(projectRoot, 'public', 'static-component-overlay');
const sourceFiles = ['loader.js', 'manifest.json', 'manifest.fixture-recovering.json', 'manifest.fixture-stable.json', 'protocol.js', 'runtime.html', 'source-contract.js'];
const expectedBuildFiles = ['carbon-static-module.js', 'dockyard.css'];

function listEntries(root) {
  const entries = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      const relativePath = relative(root, absolutePath).split(sep).join('/');
      if (entry.isDirectory()) {
        entries.push(`${relativePath}/`);
        visit(absolutePath);
      } else {
        entries.push(relativePath);
      }
    }
  };
  visit(root);
  return entries.sort();
}

const buildEntries = listEntries(buildRoot);
const unexpectedBuildFiles = buildEntries.filter((name) => !expectedBuildFiles.includes(name));
const missingBuildFiles = expectedBuildFiles.filter((name) => !buildEntries.includes(name));
if (unexpectedBuildFiles.length || missingBuildFiles.length) {
  throw new Error([
    '静态组件临时输出不符合预期，组件构建可能读取了主应用公开目录。',
    unexpectedBuildFiles.length ? `多余文件：${unexpectedBuildFiles.join(', ')}` : '',
    missingBuildFiles.length ? `缺少文件：${missingBuildFiles.join(', ')}` : '',
  ].filter(Boolean).join('\n'));
}

rmSync(targetRoot, { recursive: true, force: true });
mkdirSync(targetRoot, { recursive: true });
for (const name of sourceFiles) {
  copyFileSync(join(sourceRoot, name), join(targetRoot, name));
}
cpSync(buildRoot, join(targetRoot, 'dist'), { recursive: true, force: true });

// Hash the final bytes after staging; source manifests remain generated templates.
const resources = Object.fromEntries(listEntries(targetRoot)
  .filter((name) => !name.endsWith('/') && !name.startsWith('manifest'))
  .map((name) => [`./${name}`, createHash('sha256').update(readFileSync(join(targetRoot, name))).digest('hex')]));
for (const name of sourceFiles.filter((name) => name.startsWith('manifest'))) {
  const path = join(targetRoot, name);
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  writeFileSync(path, `${JSON.stringify({ ...manifest, integrity: { algorithm: 'sha256', resources } }, null, 2)}\n`);
}
