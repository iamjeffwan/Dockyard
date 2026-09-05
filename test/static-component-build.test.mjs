import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputRoot = join(projectRoot, 'public', 'static-component-overlay');
const expectedEntries = [
  'dist/',
  'dist/carbon-static-module.js',
  'dist/dockyard.css',
  'loader.js',
  'manifest.json',
  'protocol.js',
  'runtime.html',
  'source-contract.js',
];

function buildStaticComponents() {
  const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'pnpm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'pnpm run build:static-components']
    : ['run', 'build:static-components'];
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    `静态组件构建失败\n${result.stdout}\n${result.stderr}`,
  );
}

function outputInventory(root) {
  const inventory = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        inventory.push({
          path: `${relative(root, absolutePath).split(sep).join('/')}/`,
          kind: 'directory',
        });
        visit(absolutePath);
        continue;
      }
      const contents = readFileSync(absolutePath);
      inventory.push({
        path: relative(root, absolutePath).split(sep).join('/'),
        kind: 'file',
        bytes: contents.length,
        sha256: createHash('sha256').update(contents).digest('hex'),
      });
    }
  };
  visit(root);
  return inventory.sort((left, right) => left.path.localeCompare(right.path));
}

test('连续两次静态组件构建保持干净且产物完全一致', { timeout: 120_000 }, () => {
  buildStaticComponents();
  const first = outputInventory(outputRoot);

  writeFileSync(join(outputRoot, 'stale-output.txt'), '旧产物不应保留');
  buildStaticComponents();
  const second = outputInventory(outputRoot);

  const recursiveCopies = second
    .map((entry) => entry.path)
    .filter((path) => path.includes('static-component-overlay/'));
  assert.deepEqual(
    recursiveCopies,
    [],
    `检测到递归复制的静态组件目录：${recursiveCopies.join(', ')}`,
  );
  assert.deepEqual(
    second.map((entry) => entry.path),
    expectedEntries,
    '静态组件构建只能发布清单、运行页、协议、样式和组件模块等预期资源',
  );
  assert.deepEqual(second, first, '连续构建的目录结构、文件数量或关键产物摘要不一致');
});
