import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const source = JSON.parse(readFileSync(resolve(root, 'design/project-tokens.json'), 'utf8'));
const supported = new Set(['color', 'font-family', 'font-size', 'length', 'duration', 'easing', 'opacity']);
const lines = ['/* Generated from design/project-tokens.json. Do not edit manually. */', ':root {'];

for (const token of source.tokens) {
  if (!supported.has(token.type)) continue;
  lines.push(`  --${token.path.replaceAll('.', '-')}: ${token.value};`);
}

lines.push('}', '');
writeFileSync(resolve(root, 'design/tokens.css'), lines.join('\n'), 'utf8');
