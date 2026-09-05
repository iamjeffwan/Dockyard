import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Checkbox, DatePicker, DatePickerInput, Dropdown, Toggle } from '@carbon/react';
import '../../src/carbon.scss';
import './module-runtime.css';
import { BUILTIN_STATIC_SOURCES, resolveStaticComponent, staticSourceRegistry } from './source-contract.js';
import { HostCommand, OverlayEvent, postOverlayMessage, rectOf, validateProtocolMessage } from './protocol.js';
import {
  beginTransformSession,
  updateTransformSession,
  type ComponentGeometry,
  type TransformKind,
  type TransformSession,
} from './transform-session.js';

type OverlayMode = 'canvas' | 'component';
type Viewport = { scrollX: number; scrollY: number; zoom: number };
type StaticInstance = {
  id: string;
  sourceId: string;
  protocolVersion: string;
  componentKey: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  naturalWidth?: number;
  naturalHeight?: number;
  rotation?: number;
  sequence?: string;
  variantKey?: string;
  props?: Record<string, unknown>;
};
const SOURCE_ID = new URLSearchParams(location.search).get('source') || BUILTIN_STATIC_SOURCES[0].id;
const SOURCE_REGISTRY = staticSourceRegistry(new URLSearchParams(location.search).get('fixtures') === '1');
const isEditableTarget = (target: EventTarget | null) => target instanceof HTMLElement
  && (target.isContentEditable || Boolean(target.closest('input, textarea, select')));

const readInstances = (): StaticInstance[] => {
  const params = new URLSearchParams(location.search);
  const raw = params.get('instances');
  if (raw) {
    try { return JSON.parse(raw) as StaticInstance[]; } catch { return []; }
  }
  return [{ id: 'prototype', sourceId: SOURCE_ID, protocolVersion: BUILTIN_STATIC_SOURCES[0].protocolVersion, componentKey: params.get('component') || 'carbon-button', x: 40, y: 40 }];
};

const send = (type: string, componentId: string, element: HTMLElement | null, extra: Record<string, unknown> = {}) => {
  postOverlayMessage(SOURCE_ID, type, { componentId, rect: element ? rectOf(element) : undefined, ...extra });
};

const acceptInstances = (values: StaticInstance[]) => values.filter((instance) => {
  const resolved = resolveStaticComponent(SOURCE_REGISTRY, instance);
  if (instance.sourceId === SOURCE_ID && resolved.ok) return true;
  const error = instance.sourceId !== SOURCE_ID
    ? { code: 'source-mismatch', message: `实例来源不匹配：${instance.sourceId || '(empty)'}` }
    : resolved.error;
  postOverlayMessage(SOURCE_ID, OverlayEvent.moduleError, { componentId: instance.id, phase: 'contract', error: `${error.code}: ${error.message}` });
  return false;
});

function Demo() {
  const [mode, setMode] = useState<OverlayMode>('canvas');
  const [viewport, setViewport] = useState<Viewport>({ scrollX: 0, scrollY: 0, zoom: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [instances, setInstances] = useState(() => acceptInstances(readInstances()));

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const validation = validateProtocolMessage(event.data, { sourceId: SOURCE_ID, direction: 'host' });
      if (!validation.ok) {
        postOverlayMessage(SOURCE_ID, OverlayEvent.moduleError, { phase: 'contract', error: `${validation.error.code}: ${validation.error.message}` });
        return;
      }
      if (event.data.type === HostCommand.setMode) {
        setMode(event.data.mode === 'component' ? 'component' : 'canvas');
        if (event.data.mode !== 'component') setSelectedId(null);
      }
      if (event.data.type === HostCommand.viewport) {
        setViewport({
          scrollX: Number(event.data.scrollX) || 0,
          scrollY: Number(event.data.scrollY) || 0,
          zoom: Math.max(0.01, Number(event.data.zoom) || 1),
        });
      }
      if (event.data.type === HostCommand.setInstances && Array.isArray(event.data.instances)) {
        setInstances(acceptInstances(event.data.instances as StaticInstance[]));
      }
    };
    window.addEventListener('message', receive);
    postOverlayMessage(SOURCE_ID, OverlayEvent.moduleReady, { module: 'carbon-static-module', moduleVersion: '0.1.0' });
    return () => window.removeEventListener('message', receive);
  }, []);

  useEffect(() => {
    if (mode !== 'component') return;
    const forwardNativeToolShortcut = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) return;
      postOverlayMessage(SOURCE_ID, OverlayEvent.nativeToolShortcut, { key: event.key });
    };
    window.addEventListener('keydown', forwardNativeToolShortcut, true);
    return () => window.removeEventListener('keydown', forwardNativeToolShortcut, true);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'component') return;
    const reportPointer = (event: PointerEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const interactive = Boolean(target && target !== document.body
        && !target.classList.contains('static-overlay-stage')
        && !target.classList.contains('static-overlay-runtime'));
      postOverlayMessage(SOURCE_ID, OverlayEvent.pointerPosition, {
        x: event.clientX,
        y: event.clientY,
        interactive,
      });
    };
    window.addEventListener('pointermove', reportPointer, true);
    return () => window.removeEventListener('pointermove', reportPointer, true);
  }, [mode]);

  return (
    <div className={`static-overlay-runtime is-${mode}`}>
      <div
        className="static-overlay-stage"
        style={{ transform: `translate3d(${viewport.scrollX * viewport.zoom}px, ${viewport.scrollY * viewport.zoom}px, 0) scale(${viewport.zoom})` }}
        onPointerDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}
      >
        {instances.map((instance) => (
          <InstanceView
            key={instance.id}
            instance={instance}
            mode={mode}
            zoom={viewport.zoom}
            selected={selectedId === instance.id}
            onSelect={() => setSelectedId(instance.id)}
          />
        ))}
      </div>
    </div>
  );
}

function InstanceView({ instance, mode, zoom, selected, onSelect }: { instance: StaticInstance; mode: OverlayMode; zoom: number; selected: boolean; onSelect: () => void }) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const committedGeometry: ComponentGeometry = {
    x: instance.x ?? 0,
    y: instance.y ?? 0,
    width: instance.width ?? instance.naturalWidth ?? 0,
    height: instance.height ?? instance.naturalHeight ?? 0,
    rotation: instance.rotation ?? 0,
  };
  const geometryRef = useRef<ComponentGeometry>(committedGeometry);
  const [natural, setNatural] = useState({ width: instance.naturalWidth ?? 0, height: instance.naturalHeight ?? 0 });
  const naturalRef = useRef(natural);
  const dragRef = useRef<TransformSession>();
  const frameRef = useRef<number>();
  const [clicks, setClicks] = useState(Number(instance.props?.clicks) || 0);
  const [date, setDate] = useState(String(instance.props?.value || '2026-09-03'));
  const [checked, setChecked] = useState(Boolean(instance.props?.checked));
  const [choice, setChoice] = useState(String(instance.props?.selectedItem || 'one'));
  const [toggled, setToggled] = useState(Boolean(instance.props?.toggled));

  useEffect(() => {
    if (dragRef.current) return;
    const next: ComponentGeometry = {
      x: instance.x ?? 0,
      y: instance.y ?? 0,
      width: instance.width ?? instance.naturalWidth ?? (naturalRef.current.width || 1),
      height: instance.height ?? instance.naturalHeight ?? (naturalRef.current.height || 1),
      rotation: instance.rotation ?? 0,
    };
    geometryRef.current = next;
  }, [instance.x, instance.y, instance.width, instance.height, instance.naturalWidth, instance.naturalHeight, instance.rotation]);

  useEffect(() => {
    naturalRef.current = natural;
  }, [natural]);

  useEffect(() => () => {
    if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
  }, []);

  const applyGeometry = (next: ComponentGeometry) => {
    const surface = surfaceRef.current;
    const scaler = scalerRef.current;
    if (!surface || !scaler) return;
    const naturalWidth = naturalRef.current.width || 1;
    const naturalHeight = naturalRef.current.height || 1;
    surface.style.width = `${next.width}px`;
    surface.style.height = `${next.height}px`;
    surface.style.transform = `translate3d(${next.x}px, ${next.y}px, 0) rotate(${next.rotation}rad)`;
    scaler.style.transform = `scale(${next.width / naturalWidth}, ${next.height / naturalHeight})`;
  };

  const scheduleGeometry = (next: ComponentGeometry) => {
    geometryRef.current = next;
    if (frameRef.current !== undefined) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = undefined;
      applyGeometry(geometryRef.current);
    });
  };

  const flushGeometry = (next: ComponentGeometry) => {
    if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    frameRef.current = undefined;
    geometryRef.current = next;
    applyGeometry(next);
  };
  const reportTransform = () => {
    const current = geometryRef.current;
    send(OverlayEvent.componentDrop, instance.id, surfaceRef.current, { ...current, naturalWidth: natural.width, naturalHeight: natural.height });
  };

  useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const measure = () => {
      const width = Math.max(1, node.offsetWidth);
      const height = Math.max(1, node.offsetHeight);
      setNatural((current) => current.width === width && current.height === height ? current : { width, height });
      send(OverlayEvent.componentBounds, instance.id, surfaceRef.current, { naturalWidth: width, naturalHeight: height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [instance.id]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || !validateProtocolMessage(event.data, { sourceId: SOURCE_ID, direction: 'host' }).ok || event.data.type !== HostCommand.measure) return;
      send(OverlayEvent.componentBounds, instance.id, surfaceRef.current, { naturalWidth: natural.width, naturalHeight: natural.height });
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [instance.id, natural]);

  const width = committedGeometry.width || natural.width || 1;
  const height = committedGeometry.height || natural.height || 1;
  const scaleX = natural.width ? width / natural.width : 1;
  const scaleY = natural.height ? height / natural.height : 1;

  const begin = (event: React.PointerEvent, kind: TransformKind) => {
    if (mode !== 'component') return;
    event.preventDefault();
    event.stopPropagation();
    onSelect();
    event.currentTarget.setPointerCapture(event.pointerId);
    const initial = { ...geometryRef.current, width, height };
    const surfaceRect = surfaceRef.current?.getBoundingClientRect();
    dragRef.current = beginTransformSession(
      kind,
      initial,
      { x: event.clientX, y: event.clientY },
      surfaceRect ? { x: surfaceRect.left + surfaceRect.width / 2, y: surfaceRect.top + surfaceRect.height / 2 } : undefined,
    );
  };
  const move = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    scheduleGeometry(updateTransformSession(
      drag,
      { x: event.clientX, y: event.clientY },
      { zoom, snapRotation: event.shiftKey },
    ));
  };
  const finish = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = undefined;
    flushGeometry(drag.current);
    reportTransform();
  };
  const cancel = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = undefined;
    flushGeometry(drag.initial);
  };

  const common = { component: instance.componentKey };
  const child = instance.componentKey === 'carbon-date-picker'
    ? <DatePicker dateFormat="Y-m-d" datePickerType="single" value={date} onChange={(event) => { const next = event.target.value; setDate(next); send('date-change', instance.id, event.target as HTMLElement, { ...common, date: next }); }}><DatePickerInput id={`date-${instance.id}`} labelText="Date Picker" placeholder="yyyy-mm-dd" /></DatePicker>
    : instance.componentKey === 'carbon-checkbox'
      ? <Checkbox id={`checkbox-${instance.id}`} labelText="Checkbox" checked={checked} onChange={(_, data) => { setChecked(data.checked); send('checkbox-change', instance.id, surfaceRef.current, { ...common, checked: data.checked }); }} />
      : instance.componentKey === 'carbon-dropdown'
        ? <Dropdown id={`dropdown-${instance.id}`} titleText="Dropdown" label="Choose an option" items={[{ id: 'one', text: 'Option One' }, { id: 'two', text: 'Option Two' }]} itemToString={(item) => item?.text || ''} selectedItem={[{ id: 'one', text: 'Option One' }, { id: 'two', text: 'Option Two' }].find((item) => item.id === choice)} onChange={({ selectedItem }) => { if (selectedItem) { setChoice(selectedItem.id); send('dropdown-change', instance.id, surfaceRef.current, { ...common, choice: selectedItem.id }); } }} />
        : instance.componentKey === 'carbon-toggle'
          ? <Toggle id={`toggle-${instance.id}`} labelText="Toggle" toggled={toggled} onToggle={(next) => { setToggled(next); send('toggle-change', instance.id, surfaceRef.current, { ...common, toggled: next }); }} />
          : instance.componentKey === 'carbon-button'
            ? <Button kind={(instance.props?.kind || (instance.variantKey === 'danger' ? 'danger' : 'primary')) as 'primary'} onClick={(event) => { const next = clicks + 1; setClicks(next); send(OverlayEvent.componentClick, instance.id, event.currentTarget, { ...common, clicks: next }); }}>Carbon Button ({clicks})</Button>
            : null;

  return (
    <div
      ref={surfaceRef}
      data-component-id={instance.id}
      data-component-key={instance.componentKey}
      data-source-id={instance.sourceId}
      className={`component-surface${selected ? ' is-selected' : ''}`}
      style={{ width, height, transform: `translate3d(${committedGeometry.x}px, ${committedGeometry.y}px, 0) rotate(${committedGeometry.rotation}rad)` }}
      onPointerDownCapture={() => { if (mode === 'component') onSelect(); }}
    >
      <div ref={scalerRef} className="component-content-scaler" style={{ width: natural.width || 'max-content', height: natural.height || 'max-content', transform: `scale(${scaleX}, ${scaleY})` }}>
        <div ref={contentRef} className="component-natural-content">{child}</div>
      </div>
      {instance.sequence && (
        <button
          type="button"
          aria-label={`移动组件 ${instance.sequence}`}
          className="component-sequence"
          onPointerDown={(event) => begin(event, 'move')}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={cancel}
          onLostPointerCapture={finish}
        >
          {instance.sequence}
        </button>
      )}
      {selected && mode === 'component' && <>
        <button type="button" aria-label="旋转组件" className="component-rotate-handle" onPointerDown={(event) => begin(event, 'rotate')} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={finish} />
        <button type="button" aria-label="缩放组件" className="component-resize-handle" onPointerDown={(event) => begin(event, 'resize')} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={finish} />
      </>}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Demo />);
