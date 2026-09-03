import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Checkbox, DatePicker, DatePickerInput, Dropdown, Toggle } from '@carbon/react';
import '../../src/carbon.scss';
import { HostCommand, OverlayEvent, postOverlayMessage, rectOf } from './protocol.js';

const post = (type: string, element: HTMLElement, extra: Record<string, unknown> = {}) => {
  postOverlayMessage(type, { componentId: extra.componentId ?? extra.component ?? 'unknown', rect: rectOf(element), ...extra });
};

type StaticInstance = { id: string; componentKey: string; x?: number; y?: number; variantKey?: string; props?: Record<string, unknown> };

function Demo() {
  const [clicks, setClicks] = useState(0);
  const [date, setDate] = useState('2026-09-03');
  const [checked, setChecked] = useState(false);
  const [choice, setChoice] = useState('one');
  const [toggled, setToggled] = useState(false);
  const raw = new URLSearchParams(location.search).get('instances');
  const instances: StaticInstance[] = raw ? JSON.parse(raw) : [{ id: 'prototype', componentKey: new URLSearchParams(location.search).get('component') || 'carbon-button' }];
  return <div style={{ position: 'relative', width: '100%', height: '100%' }}>{instances.map((instance) => <InstanceView key={instance.id} instance={instance} clicks={clicks} setClicks={setClicks} date={date} setDate={setDate} checked={checked} setChecked={setChecked} choice={choice} setChoice={setChoice} toggled={toggled} setToggled={setToggled} />)}</div>;
}

function InstanceView({ instance, ...state }: { instance: StaticInstance; clicks: number; setClicks: React.Dispatch<React.SetStateAction<number>>; date: string; setDate: React.Dispatch<React.SetStateAction<string>>; checked: boolean; setChecked: React.Dispatch<React.SetStateAction<boolean>>; choice: string; setChoice: React.Dispatch<React.SetStateAction<string>>; toggled: boolean; setToggled: React.Dispatch<React.SetStateAction<boolean>> }) {
  const id = instance.id;
  const common = { componentId: id, component: instance.componentKey };
  const child = instance.componentKey === 'carbon-date-picker' ? <DatePicker dateFormat="Y-m-d" datePickerType="single" value={state.date} onChange={(e) => { const next = e.target.value; state.setDate(next); post('date-change', e.target as HTMLElement, { ...common, date: next }); }}><DatePickerInput id={`date-${id}`} labelText="Date Picker" placeholder="yyyy-mm-dd" /></DatePicker> : instance.componentKey === 'carbon-checkbox' ? <Checkbox id={`checkbox-${id}`} labelText="Checkbox" checked={state.checked} onChange={(_, data) => { state.setChecked(data.checked); const el = document.getElementById(`checkbox-${id}`); if (el) post('checkbox-change', el, { ...common, checked: data.checked }); }} /> : instance.componentKey === 'carbon-dropdown' ? <Dropdown id={`dropdown-${id}`} titleText="Dropdown" label="Choose an option" items={[{ id: 'one', text: 'Option One' }, { id: 'two', text: 'Option Two' }]} onChange={({ selectedItem }) => { if (selectedItem) { state.setChoice(selectedItem.id); post('dropdown-change', document.getElementById(`dropdown-${id}`)!, { ...common, choice: selectedItem.id }); } }} /> : instance.componentKey === 'carbon-toggle' ? <Toggle id={`toggle-${id}`} labelText="Toggle" toggled={state.toggled} onToggle={(next) => { state.setToggled(next); post('toggle-change', document.getElementById(`toggle-${id}`)!, { ...common, toggled: next }); }} /> : <Button onClick={(e) => { const next = state.clicks + 1; state.setClicks(next); post('component-click', e.currentTarget, { ...common, clicks: next }); }}>Carbon Button ({state.clicks})</Button>;
  return <DragSurface componentId={id} component={instance.componentKey} x={instance.x || 40} y={instance.y || 40}>{child}</DragSurface>;
}

function DragSurface({ componentId, component, x, y, children }: { componentId: string; component: string; x: number; y: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number }>();
  const [position, setPosition] = useState({ x, y });
  const report = (type: string) => { if (ref.current) post(type, ref.current, { componentId, component, x: position.x, y: position.y }); };
  return <div ref={ref} data-component-id={componentId} data-component={component} className="component-surface" style={{ position: 'absolute', transform: `translate(${position.x}px, ${position.y}px)`, cursor: 'grab' }}
    onPointerDown={(e) => { if (!e.altKey) return; e.preventDefault(); ref.current?.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, left: position.x, top: position.y }; }}
    onPointerMove={(e) => { if (!drag.current) return; setPosition({ x: drag.current.left + e.clientX - drag.current.x, y: drag.current.top + e.clientY - drag.current.y }); report('component-move'); }}
    onPointerUp={() => { if (drag.current) report('component-drop'); drag.current = undefined; }}
    onPointerCancel={() => { drag.current = undefined; }}>{children}</div>;
}

createRoot(document.getElementById('root')!).render(<Demo />);
postOverlayMessage(OverlayEvent.moduleReady, { module: 'carbon-static-module', version: '0.1.0' });
window.addEventListener('message', (event) => {
  if (event.source !== window.parent || event.data?.protocol !== 'dockyard-overlay' || event.data.type !== HostCommand.measure) return;
  document.querySelectorAll<HTMLElement>('.component-surface').forEach((element) => {
    post(OverlayEvent.componentBounds, element, { componentId: element.dataset.componentId, component: element.dataset.component });
  });
});
