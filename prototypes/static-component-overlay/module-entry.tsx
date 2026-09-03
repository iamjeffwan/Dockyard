import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Checkbox, DatePicker, DatePickerInput, Dropdown, Toggle } from '@carbon/react';
import '../../src/carbon.scss';
import { HostCommand, OverlayEvent, postOverlayMessage, rectOf } from './protocol.js';

const post = (type: string, element: HTMLElement, extra: Record<string, unknown> = {}) => {
  postOverlayMessage(type, { componentId: extra.component ?? 'unknown', rect: rectOf(element), ...extra });
};

function Demo() {
  const [clicks, setClicks] = useState(0);
  const [date, setDate] = useState('2026-09-03');
  const [checked, setChecked] = useState(false);
  const [choice, setChoice] = useState('one');
  const [toggled, setToggled] = useState(false);
  return <div style={{ display: 'flex', gap: 24, padding: 80, alignItems: 'flex-start', flexWrap: 'wrap' }}>
    <DragSurface component="carbon-button"><Button onClick={(e) => { if (e.altKey) return; const next = clicks + 1; setClicks(next); post('component-click', e.currentTarget, { component: 'carbon-button', clicks: next }); }}>Carbon Button ({clicks})</Button></DragSurface>
    <DragSurface component="carbon-date-picker"><DatePicker dateFormat="Y-m-d" datePickerType="single" value={date} onChange={(e) => { const next = e.target.value; setDate(next); post('date-change', e.target as HTMLElement, { component: 'carbon-date-picker', date: next }); }}><DatePickerInput id="demo-date" labelText="Date Picker" placeholder="yyyy-mm-dd" /></DatePicker></DragSurface>
    <DragSurface component="carbon-checkbox"><Checkbox id="demo-checkbox" labelText="Checkbox" checked={checked} onChange={(_, data) => { setChecked(data.checked); const el = document.getElementById('demo-checkbox')?.closest('.component-surface'); if (el) post('checkbox-change', el, { component: 'carbon-checkbox', checked: data.checked }); }} /></DragSurface>
    <DragSurface component="carbon-dropdown"><Dropdown id="demo-dropdown" titleText="Dropdown" label="Choose an option" items={[{ id: 'one', text: 'Option One' }, { id: 'two', text: 'Option Two' }]} selectedItem={{ id: choice, text: choice === 'one' ? 'Option One' : 'Option Two' }} onChange={({ selectedItem }) => { if (!selectedItem) return; setChoice(selectedItem.id); const el = document.getElementById('demo-dropdown')?.closest('.component-surface'); if (el) post('dropdown-change', el, { component: 'carbon-dropdown', choice: selectedItem.id }); }} /></DragSurface>
    <DragSurface component="carbon-toggle"><Toggle id="demo-toggle" labelText="Toggle" toggled={toggled} onToggle={(next) => { setToggled(next); const el = document.getElementById('demo-toggle')?.closest('.component-surface'); if (el) post('toggle-change', el, { component: 'carbon-toggle', toggled: next }); }} /></DragSurface>
  </div>;
}

function DragSurface({ component, children }: { component: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number }>();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const report = (type: string) => { if (ref.current) post(type, ref.current, { component }); };
  return <div ref={ref} className="component-surface" style={{ transform: `translate(${position.x}px, ${position.y}px)`, cursor: 'grab' }}
    onPointerDown={(e) => { if (!e.altKey) return; e.preventDefault(); ref.current?.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, left: position.x, top: position.y }; }}
    onPointerMove={(e) => { if (!drag.current) return; setPosition({ x: drag.current.left + e.clientX - drag.current.x, y: drag.current.top + e.clientY - drag.current.y }); report('component-move'); }}
    onPointerUp={() => { if (drag.current) report('component-drop'); drag.current = undefined; }}
    onPointerCancel={() => { drag.current = undefined; }}>{children}</div>;
}

createRoot(document.getElementById('root')!).render(<Demo />);
postOverlayMessage(OverlayEvent.moduleReady, { module: 'carbon-static-module', version: '0.1.0' });
window.addEventListener('message', (event) => {
  if (event.source !== window.parent || event.data?.protocol !== 'dockyard-overlay' || event.data.type !== HostCommand.measure) return;
  for (const [selector, component] of [['button', 'carbon-button'], ['.bx--date-picker', 'carbon-date-picker']] as const) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) post(OverlayEvent.componentBounds, element, { component });
  }
});
