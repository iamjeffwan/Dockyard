import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, DatePicker, DatePickerInput } from '@carbon/react';
import '../../src/carbon.scss';

type Rect = { x: number; y: number; width: number; height: number };
const post = (type: string, element: HTMLElement, extra: Record<string, unknown> = {}) => {
  const r = element.getBoundingClientRect();
  window.parent.postMessage({ type, rect: { x: r.x, y: r.y, width: r.width, height: r.height } satisfies Rect, ...extra }, '*');
};

function Demo() {
  const [clicks, setClicks] = useState(0);
  const [date, setDate] = useState('2026-09-03');
  return <div style={{ display: 'flex', gap: 24, padding: 120, alignItems: 'flex-start' }}>
    <DragSurface component="carbon-button"><Button onClick={(e) => { if (e.altKey) return; const next = clicks + 1; setClicks(next); post('component-click', e.currentTarget, { component: 'carbon-button', clicks: next }); }}>Carbon Button ({clicks})</Button></DragSurface>
    <DragSurface component="carbon-date-picker"><DatePicker dateFormat="Y-m-d" datePickerType="single" value={date} onChange={(e) => { const next = e.target.value; setDate(next); post('date-change', e.target as HTMLElement, { component: 'carbon-date-picker', date: next }); }}><DatePickerInput id="demo-date" labelText="Date Picker" placeholder="yyyy-mm-dd" /></DatePicker></DragSurface>
  </div>;
}

function DragSurface({ component, children }: { component: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number }>();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const report = (type: string) => { if (ref.current) post(type, ref.current, { component }); };
  return <div ref={ref} style={{ transform: `translate(${position.x}px, ${position.y}px)`, cursor: 'grab' }}
    onPointerDown={(e) => { if (!e.altKey) return; e.preventDefault(); ref.current?.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, left: position.x, top: position.y }; }}
    onPointerMove={(e) => { if (!drag.current) return; setPosition({ x: drag.current.left + e.clientX - drag.current.x, y: drag.current.top + e.clientY - drag.current.y }); report('component-move'); }}
    onPointerUp={() => { if (drag.current) report('component-drop'); drag.current = undefined; }}
    onPointerCancel={() => { drag.current = undefined; }}>{children}</div>;
}

createRoot(document.getElementById('root')!).render(<Demo />);
window.parent.postMessage({ type: 'module-ready', module: 'carbon-static-module' }, '*');
