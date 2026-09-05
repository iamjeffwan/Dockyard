import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  BUILTIN_STATIC_SOURCES,
  ContractErrorCode,
  HostCommand,
  OVERLAY_PROTOCOL,
  OVERLAY_PROTOCOL_VERSION,
  OverlayEvent,
  TEST_STATIC_SOURCES,
  createProtocolMessage,
  createStaticInstance,
  createStaticSourceRegistry,
  defineStaticSource,
  staticManifestForSource,
  staticSourceRegistry,
  validateProtocolMessage,
} from '../prototypes/static-component-overlay/source-contract.js';

const carbon = BUILTIN_STATIC_SOURCES[0];

test('唯一来源清单完整描述 Carbon 和五个组件', () => {
  assert.deepEqual(
    {
      id: carbon.id,
      name: carbon.name,
      manifestUrl: carbon.manifestUrl,
      runtimeUrl: carbon.runtimeUrl,
      protocolVersion: carbon.protocolVersion,
      trustLevel: carbon.trustLevel,
    },
    {
      id: 'carbon-react',
      name: 'Carbon React',
      manifestUrl: './static-component-overlay/manifest.json',
      runtimeUrl: './static-component-overlay/runtime.html',
      protocolVersion: OVERLAY_PROTOCOL_VERSION,
      trustLevel: 'bundled',
    },
  );
  assert.equal(carbon.components.length, 5);
  assert.equal(new Set(carbon.components.map((component) => component.key)).size, 5);
});

test('发布清单完全由来源清单生成', async () => {
  const manifest = JSON.parse(await readFile(new URL('../prototypes/static-component-overlay/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest, staticManifestForSource(carbon));
});

test('测试来源与内置来源共用同一种实例模型', () => {
  const testSource = defineStaticSource({
    ...carbon,
    id: 'test-source',
    name: 'Test Source',
    manifestUrl: 'https://fixtures.invalid/manifest.json',
    runtimeUrl: 'https://fixtures.invalid/runtime.html',
  });
  const registry = createStaticSourceRegistry([...BUILTIN_STATIC_SOURCES, testSource]);
  const local = createStaticInstance(registry, { sourceId: carbon.id, componentKey: 'carbon-button', instanceId: 'local-1' });
  const remote = createStaticInstance(registry, { sourceId: testSource.id, componentKey: 'carbon-button', instanceId: 'remote-1' });

  assert.equal(local.ok, true);
  assert.equal(remote.ok, true);
  assert.deepEqual(Object.keys(local.value), Object.keys(remote.value));
  assert.equal('manifestUrl' in local.value, false);
  assert.equal('runtimeUrl' in remote.value, false);
});

test('测试来源只在显式启用时加入注册表', () => {
  assert.equal(staticSourceRegistry().sourceById.has('fixture-stable'), false);
  const registry = staticSourceRegistry(true);
  assert.equal(registry.sourceById.get('fixture-stable'), TEST_STATIC_SOURCES[0]);
  assert.deepEqual(registry.sourceById.get('fixture-recovering').failureSequence, ['manifest', 'style', 'module']);
});

test('未知来源、组件、变体和协议版本返回明确错误', () => {
  const registry = createStaticSourceRegistry(BUILTIN_STATIC_SOURCES);
  assert.equal(createStaticInstance(registry, { sourceId: 'missing', componentKey: 'carbon-button', instanceId: 'x' }).error.code, ContractErrorCode.unknownSource);
  assert.equal(createStaticInstance(registry, { sourceId: carbon.id, componentKey: 'missing', instanceId: 'x' }).error.code, ContractErrorCode.unknownComponent);
  assert.equal(createStaticInstance(registry, { sourceId: carbon.id, componentKey: 'carbon-button', variantKey: 'missing', instanceId: 'x' }).error.code, ContractErrorCode.unknownVariant);
  assert.equal(validateProtocolMessage({ protocol: OVERLAY_PROTOCOL, version: '0', sourceId: carbon.id, type: HostCommand.viewport }, { sourceId: carbon.id, direction: 'host' }).error.code, ContractErrorCode.unsupportedProtocol);
});

test('跨页消息必须包含协议版本、来源和实例标识', () => {
  const base = { protocol: OVERLAY_PROTOCOL, version: OVERLAY_PROTOCOL_VERSION, sourceId: carbon.id };
  assert.equal(validateProtocolMessage({ ...base, type: OverlayEvent.moduleReady }, { sourceId: carbon.id, direction: 'runtime' }).ok, true);
  assert.equal(validateProtocolMessage({ ...base, type: OverlayEvent.componentBounds, componentId: 'instance-1' }, { sourceId: carbon.id, direction: 'runtime' }).ok, true);
  assert.equal(validateProtocolMessage({ ...base, type: OverlayEvent.pointerPosition, x: 10, y: 20 }, { sourceId: carbon.id, direction: 'runtime' }).ok, true);
  assert.equal(validateProtocolMessage({ protocol: OVERLAY_PROTOCOL, type: OverlayEvent.moduleReady }, { sourceId: carbon.id, direction: 'runtime' }).error.code, ContractErrorCode.unsupportedProtocol);
  assert.equal(validateProtocolMessage({ ...base, type: OverlayEvent.componentBounds }, { sourceId: carbon.id, direction: 'runtime' }).error.code, ContractErrorCode.missingInstance);
  assert.equal(validateProtocolMessage({ ...base, sourceId: 'other', type: HostCommand.viewport }, { sourceId: carbon.id, direction: 'host' }).error.code, ContractErrorCode.sourceMismatch);
  assert.deepEqual(
    createProtocolMessage(carbon.id, OverlayEvent.moduleReady, { version: '模块版本不能覆盖协议版本' }),
    { protocol: OVERLAY_PROTOCOL, version: OVERLAY_PROTOCOL_VERSION, sourceId: carbon.id, type: OverlayEvent.moduleReady },
  );
});
