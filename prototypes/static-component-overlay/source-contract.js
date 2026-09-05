export const STATIC_SOURCE_SCHEMA_VERSION = '1';
export const OVERLAY_PROTOCOL = 'dockyard-overlay';
export const OVERLAY_PROTOCOL_VERSION = '1';

export const OverlayEvent = Object.freeze({
  moduleLoading: 'module-loading',
  moduleReady: 'module-ready',
  moduleError: 'module-error',
  nativeToolShortcut: 'native-tool-shortcut',
  componentClick: 'component-click',
  dateChange: 'date-change',
  checkboxChange: 'checkbox-change',
  dropdownChange: 'dropdown-change',
  toggleChange: 'toggle-change',
  componentMove: 'component-move',
  componentDrop: 'component-drop',
  componentBounds: 'component-bounds',
});

export const HostCommand = Object.freeze({
  measure: 'measure',
  retry: 'retry',
  viewport: 'viewport',
  setMode: 'set-mode',
  setInstances: 'set-instances',
});

export const ContractErrorCode = Object.freeze({
  invalidSource: 'invalid-source',
  unknownSource: 'unknown-source',
  unknownComponent: 'unknown-component',
  unknownVariant: 'unknown-variant',
  unsupportedProtocol: 'unsupported-protocol',
  sourceMismatch: 'source-mismatch',
  unknownMessage: 'unknown-message',
  missingInstance: 'missing-instance',
});

const componentEvents = new Set([
  OverlayEvent.componentClick,
  OverlayEvent.dateChange,
  OverlayEvent.checkboxChange,
  OverlayEvent.dropdownChange,
  OverlayEvent.toggleChange,
  OverlayEvent.componentMove,
  OverlayEvent.componentDrop,
  OverlayEvent.componentBounds,
]);

const fail = (code, message) => ({ ok: false, error: { code, message } });

export function defineStaticSource(source) {
  const required = ['id', 'name', 'manifestUrl', 'runtimeUrl', 'protocolVersion', 'trustLevel', 'module'];
  const missing = required.find((key) => !source?.[key]);
  if (missing || !Array.isArray(source?.components)) {
    throw new TypeError(`静态来源定义无效：缺少 ${missing || 'components'}`);
  }
  return Object.freeze({ ...source, components: Object.freeze(source.components.map((component) => Object.freeze(component))) });
}

const carbonComponents = [
  { key: 'carbon-button', name: 'Button', categoryPath: ['actions', 'button'], defaultWidth: 160, defaultHeight: 48, variants: [{ key: 'default', name: 'Default' }, { key: 'danger', name: 'Danger', props: { kind: 'danger' } }] },
  { key: 'carbon-date-picker', name: 'DatePicker', categoryPath: ['forms', 'date-picker'], defaultWidth: 288, defaultHeight: 64, variants: [{ key: 'default', name: 'Default' }] },
  { key: 'carbon-checkbox', name: 'Checkbox', categoryPath: ['forms', 'checkbox'], defaultWidth: 140, defaultHeight: 24, variants: [{ key: 'default', name: 'Default' }] },
  { key: 'carbon-dropdown', name: 'Dropdown', categoryPath: ['forms', 'dropdown'], defaultWidth: 300, defaultHeight: 64, variants: [{ key: 'default', name: 'Default' }] },
  { key: 'carbon-toggle', name: 'Toggle', categoryPath: ['forms', 'toggle'], defaultWidth: 104, defaultHeight: 48, variants: [{ key: 'default', name: 'Default' }] },
];

export const BUILTIN_STATIC_SOURCES = Object.freeze([
  defineStaticSource({
    schemaVersion: STATIC_SOURCE_SCHEMA_VERSION,
    id: 'carbon-react',
    name: 'Carbon React',
    manifestUrl: './static-component-overlay/manifest.json',
    runtimeUrl: './static-component-overlay/runtime.html',
    protocolVersion: OVERLAY_PROTOCOL_VERSION,
    trustLevel: 'bundled',
    module: {
      name: 'carbon-static-module',
      version: '0.1.0',
      entry: './dist/carbon-static-module.js',
      styles: ['./dist/dockyard.css'],
    },
    components: carbonComponents,
  }),
]);

export function createStaticSourceRegistry(sources) {
  const sourceById = new Map();
  for (const source of sources) {
    if (sourceById.has(source.id)) throw new TypeError(`静态来源标识重复：${source.id}`);
    sourceById.set(source.id, source);
  }
  return Object.freeze({ sources: Object.freeze([...sources]), sourceById });
}

export const STATIC_SOURCE_REGISTRY = createStaticSourceRegistry(BUILTIN_STATIC_SOURCES);

export function resolveStaticComponent(registry, selection) {
  const source = registry.sourceById.get(selection?.sourceId);
  if (!source) return fail(ContractErrorCode.unknownSource, `未知静态来源：${selection?.sourceId || '(empty)'}`);
  if (selection.protocolVersion && selection.protocolVersion !== source.protocolVersion) {
    return fail(ContractErrorCode.unsupportedProtocol, `静态来源 ${source.id} 不支持协议版本 ${selection.protocolVersion}`);
  }
  const component = source.components.find((item) => item.key === selection?.componentKey);
  if (!component) return fail(ContractErrorCode.unknownComponent, `静态来源 ${source.id} 中不存在组件：${selection?.componentKey || '(empty)'}`);
  if (selection.variantKey && !component.variants?.some((item) => item.key === selection.variantKey)) {
    return fail(ContractErrorCode.unknownVariant, `组件 ${component.key} 不存在变体：${selection.variantKey}`);
  }
  return { ok: true, value: { source, component } };
}

export function createStaticInstance(registry, input) {
  const resolved = resolveStaticComponent(registry, input);
  if (!resolved.ok) return resolved;
  if (!input.instanceId) return fail(ContractErrorCode.missingInstance, '静态组件实例缺少 instanceId');
  return {
    ok: true,
    value: {
      instanceId: input.instanceId,
      sourceId: resolved.value.source.id,
      componentKey: resolved.value.component.key,
      protocolVersion: resolved.value.source.protocolVersion,
      ...(input.variantKey ? { variantKey: input.variantKey } : {}),
      ...(input.props ? { props: input.props } : {}),
    },
  };
}

export function staticManifestForSource(source) {
  return {
    schemaVersion: source.schemaVersion,
    sourceId: source.id,
    name: source.module.name,
    version: source.module.version,
    protocolVersion: source.protocolVersion,
    trustLevel: source.trustLevel,
    entry: source.module.entry,
    styles: [...source.module.styles],
    components: source.components.map((component) => ({
      key: component.key,
      name: component.name,
      categoryPath: [...component.categoryPath],
      variants: component.variants?.map((variant) => ({ ...variant })),
    })),
  };
}

export function validateStaticManifest(source, manifest) {
  if (!manifest || typeof manifest !== 'object') return fail(ContractErrorCode.invalidSource, '静态来源清单不是对象');
  if (manifest.sourceId !== source.id) return fail(ContractErrorCode.sourceMismatch, `清单来源不匹配：${manifest.sourceId || '(empty)'}`);
  if (manifest.protocolVersion !== source.protocolVersion) return fail(ContractErrorCode.unsupportedProtocol, `清单协议版本不受支持：${manifest.protocolVersion || '(empty)'}`);
  if (manifest.schemaVersion !== STATIC_SOURCE_SCHEMA_VERSION) return fail(ContractErrorCode.invalidSource, `清单结构版本不受支持：${manifest.schemaVersion || '(empty)'}`);
  if (!manifest.name || !manifest.version || !manifest.entry || !Array.isArray(manifest.styles) || !Array.isArray(manifest.components)) {
    return fail(ContractErrorCode.invalidSource, '清单缺少模块名称、版本、入口、样式或组件列表');
  }
  return { ok: true, value: manifest };
}

export function createProtocolMessage(sourceId, type, payload = {}) {
  return { ...payload, protocol: OVERLAY_PROTOCOL, version: OVERLAY_PROTOCOL_VERSION, sourceId, type };
}

export function validateProtocolMessage(value, options) {
  if (!value || typeof value !== 'object' || value.protocol !== OVERLAY_PROTOCOL || value.version !== OVERLAY_PROTOCOL_VERSION) {
    return fail(ContractErrorCode.unsupportedProtocol, '消息协议或版本不受支持');
  }
  if (value.sourceId !== options.sourceId) {
    return fail(ContractErrorCode.sourceMismatch, `消息来源不匹配：${value.sourceId || '(empty)'}`);
  }
  const allowed = options.direction === 'host' ? Object.values(HostCommand) : Object.values(OverlayEvent);
  if (!allowed.includes(value.type)) return fail(ContractErrorCode.unknownMessage, `未知消息类型：${value.type || '(empty)'}`);
  if (options.direction === 'runtime' && componentEvents.has(value.type) && typeof value.componentId !== 'string') {
    return fail(ContractErrorCode.missingInstance, `消息 ${value.type} 缺少 componentId`);
  }
  if (options.direction === 'runtime' && value.type === OverlayEvent.nativeToolShortcut && typeof value.key !== 'string') {
    return fail(ContractErrorCode.unknownMessage, '工具快捷键消息缺少 key');
  }
  if (options.direction === 'host' && value.type === HostCommand.setInstances) {
    if (!Array.isArray(value.instances) || value.instances.some((item) => typeof item?.id !== 'string')) {
      return fail(ContractErrorCode.missingInstance, '实例同步消息包含缺少 id 的实例');
    }
  }
  return { ok: true, value };
}
