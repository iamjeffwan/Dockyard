import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Checkbox, DatePicker, DatePickerInput, Dropdown, Toggle } from '@carbon/react';
import '../../src/carbon.scss';
import './module-runtime.css';
import { HostCommand, OverlayEvent, postOverlayMessage, rectOf } from './protocol.js';

type OverlayMode = 'canvas' | 'component';
type Viewport = { scrollX: number; scrollY: number; zoom: number };
type StaticInstance = {
  id: string;
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
type Geometry = { x: number; y: number; width?: number; height?: number; rotation: number };

const readInstances = (): StaticInstance[] => {
  const params = new URLSearchParams(location.search);
  const raw = params.get('instances');
  if (raw) {
    try { return JSON.parse(raw) as StaticInstance[]; } catch { return []; }
  }
  return [{ id: 'prototype', componentKey: params.get('component') || 'carbon-button', x: 40, y: 40 }];
};

const send = (type: string, componentId: string, element: HTMLElement | null, extra: Record<string, unknown> = {}) => {
  postOverlayMessage(type, { componentId, rect: element ? rectOf(element) : undefined, ...extra });
};

function Demo() {
  const [mode, setMode] = useState<OverlayMode>('canvas');
  const [viewport, setViewport] = useState<Viewport>({ scrollX: 0, scrollY: 0, zoom: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [instances, setInstances] = useState(readInstances);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.protocol !== 'dockyard-overlay') return;
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
        setInstances(event.data.instances as StaticInstance[]);
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);

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
  const contentRef = useRef<HTMLDivElement>(null);
  const geometryRef = useRef<Geometry>({ x: instance.x ?? 0, y: instance.y ?? 0, width: instance.width, height: instance.height, rotation: instance.rotation ?? 0 });
  const [geometry, setGeometry] = useState(geometryRef.current);
  const [natural, setNatural] = useState({ width: instance.naturalWidth ?? 0, height: instance.naturalHeight ?? 0 });
  const dragRef = useRef<{ kind: 'move' | 'resize' | 'rotate'; startX: number; startY: number; initial: Geometry; centerX?: number; centerY?: number }>();
  const [clicks, setClicks] = useState(Number(instance.props?.clicks) || 0);
  const [date, setDate] = useState(String(instance.props?.value || '2026-09-03'));
  const [checked, setChecked] = useState(Boolean(instance.props?.checked));
  const [choice, setChoice] = useState(String(instance.props?.selectedItem || 'one'));
  const [toggled, setToggled] = useState(Boolean(instance.props?.toggled));

  useEffect(() => {
    if (dragRef.current) return;
    const next = { x: instance.x ?? 0, y: instance.y ?? 0, width: instance.width, height: instance.height, rotation: instance.rotation ?? 0 };
    geometryRef.current = next;
    setGeometry(next);
  }, [instance.x, instance.y, instance.width, instance.height, instance.rotation]);

  const updateGeometry = (next: Geometry) => {
    geometryRef.current = next;
    setGeometry(next);
  };
  const reportTransform = (type = OverlayEvent.componentTransform) => {
    const current = geometryRef.current;
    send(type, instance.id, surfaceRef.current, { ...current, naturalWidth: natural.width, naturalHeight: natural.height });
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
      if (event.source !== window.parent || event.data?.protocol !== 'dockyard-overlay' || event.data.type !== HostCommand.measure) return;
      send(OverlayEvent.componentBounds, instance.id, surfaceRef.current, { naturalWidth: natural.width, naturalHeight: natural.height });
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [instance.id, natural]);

  const width = geometry.width || natural.width || 1;
  const height = geometry.height || natural.height || 1;
  const scaleX = natural.width ? width / natural.width : 1;
  const scaleY = natural.height ? height / natural.height : 1;

  const begin = (event: React.PointerEvent, kind: 'move' | 'resize' | 'rotate') => {
    if (mode !== 'component' || (kind === 'move' && !event.altKey)) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect();
    event.currentTarget.setPointerCapture(event.pointerId);
    const initial = { ...geometryRef.current, width, height };
    const surfaceRect = surfaceRef.current?.getBoundingClientRect();
    dragRef.current = {
      kind,
      startX: event.clientX,
      startY: event.clientY,
      initial,
      centerX: surfaceRect ? surfaceRect.left + surfaceRect.width / 2 : undefined,
      centerY: surfaceRect ? surfaceRect.top + surfaceRect.height / 2 : undefined,
    };
  };
  const move = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / zoom;
    const dy = (event.clientY - drag.startY) / zoom;
    if (drag.kind === 'move') updateGeometry({ ...drag.initial, x: drag.initial.x + dx, y: drag.initial.y + dy });
    if (drag.kind === 'resize') updateGeometry({ ...drag.initial, width: Math.max(24, (drag.initial.width || width) + dx), height: Math.max(24, (drag.initial.height || height) + dy) });
    if (drag.kind === 'rotate' && drag.centerX !== undefined && drag.centerY !== undefined) {
      const rotation = Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX) + Math.PI / 2;
      updateGeometry({ ...drag.initial, rotation: event.shiftKey ? Math.round(rotation / (Math.PI / 12)) * (Math.PI / 12) : rotation });
    }
  };
  const finish = () => {
    if (!dragRef.current) return;
    dragRef.current = undefined;
    reportTransform(OverlayEvent.componentDrop);
  };

  const common = { component: instance.componentKey };
  const child = instance.componentKey === 'carbon-date-picker'
    ? <DatePicker dateFormat="Y-m-d" datePickerType="single" value={date} onChange={(event) => { const next = event.target.value; setDate(next); send('date-change', instance.id, event.target as HTMLElement, { ...common, date: next }); }}><DatePickerInput id={`date-${instance.id}`} labelText="Date Picker" placeholder="yyyy-mm-dd" /></DatePicker>
    : instance.componentKey === 'carbon-checkbox'
      ? <Checkbox id={`checkbox-${instance.id}`} labelText="Checkbox" checked={checked} onChange={(_, data) => { setChecked(data.checked); send('checkbox-change', instance.id, surfaceRef.current, { ...common, checked: data.checked }); }} />
      : instance.componentKey === 'carbon-dropdown'
        ? <Dropdown id={`dropdown-${instance.id}`} titleText="Dropdown" label="Choose an option" items={[{ id: 'one', text: 'Option One' }, { id: 'two', text: 'Option Two' }]} selectedItem={[{ id: 'one', text: 'Option One' }, { id: 'two', text: 'Option Two' }].find((item) => item.id === choice)} onChange={({ selectedItem }) => { if (selectedItem) { setChoice(selectedItem.id); send('dropdown-change', instance.id, surfaceRef.current, { ...common, choice: selectedItem.id }); } }} />
        : instance.componentKey === 'carbon-toggle'
          ? <Toggle id={`toggle-${instance.id}`} labelText="Toggle" toggled={toggled} onToggle={(next) => { setToggled(next); send('toggle-change', instance.id, surfaceRef.current, { ...common, toggled: next }); }} />
          : <Button kind={(instance.props?.kind || (instance.variantKey === 'danger' ? 'danger' : 'primary')) as 'primary'} onClick={(event) => { const next = clicks + 1; setClicks(next); send(OverlayEvent.componentClick, instance.id, event.currentTarget, { ...common, clicks: next }); }}>Carbon Button ({clicks})</Button>;

  return (
    <div
      ref={surfaceRef}
      data-component-id={instance.id}
      className={`component-surface${selected ? ' is-selected' : ''}`}
      style={{ width, height, transform: `translate3d(${geometry.x}px, ${geometry.y}px, 0) rotate(${geometry.rotation}rad)` }}
      onPointerDownCapture={(event) => { if (mode === 'component') onSelect(); if (event.altKey) begin(event, 'move'); }}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      <div className="component-content-scaler" style={{ width: natural.width || 'max-content', height: natural.height || 'max-content', transform: `scale(${scaleX}, ${scaleY})` }}>
        <div ref={contentRef} className="component-natural-content">{child}</div>
      </div>
      {instance.sequence && <span className="component-sequence">{instance.sequence}</span>}
      {selected && mode === 'component' && <>
        <button type="button" aria-label="旋转组件" className="component-rotate-handle" onPointerDown={(event) => begin(event, 'rotate')} onPointerMove={move} onPointerUp={finish} />
        <button type="button" aria-label="缩放组件" className="component-resize-handle" onPointerDown={(event) => begin(event, 'resize')} onPointerMove={move} onPointerUp={finish} />
      </>}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Demo />);
postOverlayMessage(OverlayEvent.moduleReady, { module: 'carbon-static-module', version: '0.1.0' });
