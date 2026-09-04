import assert from 'node:assert/strict';
import test from 'node:test';
import { STATIC_COMPONENTS, STATIC_SOURCES, staticComponentByKey } from '../src/static-components/registry.ts';

test('静态目录提供五个唯一的 Carbon 组件标识', () => {
  assert.equal(STATIC_SOURCES[0].id, 'carbon-react');
  assert.equal(STATIC_COMPONENTS.length, 5);
  assert.equal(new Set(STATIC_COMPONENTS.map((component) => component.key)).size, 5);
});

test('静态组件标识直接解析目录定义，不依赖名称猜测', () => {
  assert.equal(staticComponentByKey('carbon-date-picker')?.name, 'DatePicker');
  assert.equal(staticComponentByKey('button'), undefined);
});
