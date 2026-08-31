import { useEffect, useRef, useState } from "react";
import type { ComponentInstance } from "../types";
import { resizeFromCorner, snapRotation, type DragSession, type OverlayViewport } from "./geometry";
import "./styles.css";

const FALLBACK_WIDTH = 230;
const FALLBACK_HEIGHT = 120;

type MeasuredBounds = {
  width: number;
  height: number;
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
};

export type PrototypeOverlayProps = {
  components: ComponentInstance[];
  viewport: OverlayViewport;
  interactionEnabled: boolean;
  onCommit: (instanceId: string, patch: Partial<ComponentInstance>) => void;
};

function storyEmbedUrl(value: string | undefined) {
  if (!value) return "about:blank";
  try {
    const url = new URL(value);
    url.searchParams.set("shortcuts", "false");
    url.searchParams.set("singleStory", "true");
    return url.toString();
  } catch {
    return value;
  }
}

export function PrototypeOverlay({ components, viewport, interactionEnabled, onCommit }: PrototypeOverlayProps) {
  const [altPressed, setAltPressed] = useState(false);
  const [shiftPressed, setShiftPressed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localComponents, setLocalComponents] = useState(components);
  const drag = useRef<DragSession | null>(null);
  const frames = useRef(new Map<string, HTMLIFrameElement>());

  useEffect(() => { if (!drag.current) setLocalComponents(components); }, [components]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => { if (event.key === "Alt") { event.preventDefault(); setAltPressed(true); } if (event.key === "Shift") setShiftPressed(true); };
    const up = (event: KeyboardEvent) => { if (event.key === "Alt") setAltPressed(false); if (event.key === "Shift") setShiftPressed(false); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  useEffect(() => {
    const receiveBounds = (event: MessageEvent) => {
      if (event.data?.type !== "dockyard:component-bounds") return;
      const entry = [...frames.current.entries()].find(([, frame]) => frame.contentWindow === event.source);
      if (!entry) return;
      const item = localComponents.find((candidate) => candidate.instanceId === entry[0]);
      const width = Number(event.data.width); const height = Number(event.data.height);
      if (!item || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
      const patch = { width, height, x: (item.x || 0) + ((item.width || FALLBACK_WIDTH) - width) / 2, y: (item.y || 0) + ((item.height || FALLBACK_HEIGHT) - height) / 2, intrinsicWidth: width, intrinsicHeight: height, frameViewportWidth: Number(event.data.viewportWidth) || width, frameViewportHeight: Number(event.data.viewportHeight) || height, contentOffsetX: Number(event.data.x) || 0, contentOffsetY: Number(event.data.y) || 0, boundsSource: "story-dom" as const, loadStatus: "ready" as const };
      setLocalComponents((current) => current.map((candidate) => candidate.instanceId === item.instanceId ? { ...candidate, ...patch } : candidate));
      onCommit(item.instanceId, patch);
    };
    window.addEventListener("message", receiveBounds);
    return () => window.removeEventListener("message", receiveBounds);
  }, [localComponents, onCommit]);

  const begin = (item: ComponentInstance, event: React.PointerEvent, mode: DragSession["mode"], corner?: DragSession["corner"]) => {
    if (!interactionEnabled || !altPressed) return;
    event.preventDefault(); event.stopPropagation();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* embedded views may not support capture */ }
    setSelectedId(item.instanceId);
    drag.current = { id: item.instanceId, mode, corner, startX: event.clientX, startY: event.clientY, x: item.x || 0, y: item.y || 0, width: item.width || FALLBACK_WIDTH, height: item.height || FALLBACK_HEIGHT, rotation: item.rotation || 0 };
  };
  const finish = () => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    onCommit(active.id, { x: active.x, y: active.y, width: active.width, height: active.height, rotation: active.rotation });
  };
  const move = (event: React.PointerEvent) => {
    const active = drag.current;
    if (!active) return;
    const dx = (event.clientX - active.startX) / viewport.zoom;
    const dy = (event.clientY - active.startY) / viewport.zoom;
    if (active.mode === "move") { active.x += dx; active.y += dy; active.startX = event.clientX; active.startY = event.clientY; }
    else if (active.mode === "resize") { Object.assign(active, resizeFromCorner(active, dx, dy)); active.startX = event.clientX; active.startY = event.clientY; }
    else { const centerX = (active.x + active.width / 2 + viewport.scrollX) * viewport.zoom; const centerY = (active.y + active.height / 2 + viewport.scrollY) * viewport.zoom; active.rotation = snapRotation(Math.atan2(event.clientY - centerY, event.clientX - centerX) + Math.PI / 2, event.shiftKey || shiftPressed); }
    setLocalComponents((current) => current.map((item) => item.instanceId === active.id ? { ...item, x: active.x, y: active.y, width: active.width, height: active.height, rotation: active.rotation } : item));
  };
  const stories = localComponents.filter((item) => item.sourceType === "storybook" && item.storyUrl);
  if (!stories.length) return null;
  return <div className={`prototype-overlay-layer${altPressed && interactionEnabled ? " is-active" : ""}`} onPointerUp={finish} onPointerCancel={finish}>
    {stories.map((item) => {
      const width = item.width || FALLBACK_WIDTH; const height = item.height || FALLBACK_HEIGHT;
      const intrinsicWidth = item.intrinsicWidth || width; const intrinsicHeight = item.intrinsicHeight || height;
      const frameWidth = item.frameViewportWidth || intrinsicWidth; const frameHeight = item.frameViewportHeight || intrinsicHeight;
      return <div key={item.instanceId} className={`prototype-overlay-item${selectedId === item.instanceId ? " is-selected" : ""}`} style={{ left: `${((item.x || 0) + viewport.scrollX) * viewport.zoom}px`, top: `${((item.y || 0) + viewport.scrollY) * viewport.zoom}px`, width: `${width * viewport.zoom}px`, height: `${height * viewport.zoom}px`, transform: `rotate(${item.rotation || 0}rad)` }} onPointerDown={(event) => begin(item, event, "move")} onPointerMove={move}>
        <div className="prototype-overlay-scaler" style={{ width: intrinsicWidth, height: intrinsicHeight, transform: `scale(${(width * viewport.zoom) / intrinsicWidth}, ${(height * viewport.zoom) / intrinsicHeight})` }}><iframe ref={(frame) => { if (frame) frames.current.set(item.instanceId, frame); else frames.current.delete(item.instanceId); }} title={item.storyName || item.storyId || item.name} src={storyEmbedUrl(item.storyUrl)} scrolling="no" onLoad={(event) => event.currentTarget.contentWindow?.postMessage({ type: "dockyard:measure-component" }, "*")} style={{ width: frameWidth, height: frameHeight, transform: `translate(${-Number(item.contentOffsetX || 0)}px, ${-Number(item.contentOffsetY || 0)}px)` }} /></div>
        {item.sequence && <span className="prototype-overlay-sequence">{item.sequence}</span>}
        {item.boundsSource === "fallback" && <span className="prototype-overlay-fallback-size">{Math.round(width)} × {Math.round(height)}</span>}
        {altPressed && interactionEnabled && selectedId === item.instanceId && <><span className="prototype-overlay-rotate" onPointerDown={(event) => begin(item, event, "rotate")} />{(["nw", "ne", "sw", "se"] as const).map((corner) => <span key={corner} className={`prototype-overlay-handle ${corner}`} onPointerDown={(event) => begin(item, event, "resize", corner)} />)}</>}
      </div>;
    })}
  </div>;
}
