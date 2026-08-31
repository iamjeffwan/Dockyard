import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { ComponentInstance } from "../types";
import { resizeFromCorner, snapRotation, type DragSession } from "./geometry";
import type { ViewportChannel, ViewportSnapshot } from "./viewport-channel";
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

type RuntimePosition = Pick<ComponentInstance, "x" | "y" | "width" | "height" | "rotation"> & {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type PrototypeOverlayProps = {
  components: ComponentInstance[];
  viewport: ViewportChannel;
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

function toRuntimePosition(item: ComponentInstance): RuntimePosition {
  return {
    x: Number(item.x) || 0,
    y: Number(item.y) || 0,
    width: Number(item.width) || FALLBACK_WIDTH,
    height: Number(item.height) || FALLBACK_HEIGHT,
    rotation: Number(item.rotation) || 0,
  };
}

function frame(callback: () => void) {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }
  return globalThis.setTimeout(callback, 16) as unknown as number;
}

function cancelFrame(id: number) {
  if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(id);
  } else {
    globalThis.clearTimeout(id);
  }
}

function rotatePoint(x: number, y: number, centerX: number, centerY: number, angle: number) {
  const dx = x - centerX;
  const dy = y - centerY;
  return {
    x: centerX + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: centerY + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

export function PrototypeOverlay({ components, viewport, interactionEnabled, onCommit }: PrototypeOverlayProps) {
  const [altPressed, setAltPressed] = useState(false);
  const [shiftPressed, setShiftPressed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragSession | null>(null);
  const componentsRef = useRef(components);
  const onCommitRef = useRef(onCommit);
  const positionsRef = useRef(new Map(components.map((item) => [item.instanceId, toRuntimePosition(item)])));
  const framesRef = useRef(new Map<string, HTMLIFrameElement>());
  const shellNodesRef = useRef(new Map<string, HTMLDivElement>());
  const frameNodesRef = useRef(new Map<string, HTMLDivElement>());
  const scalerNodesRef = useRef(new Map<string, HTMLDivElement>());
  const labelNodesRef = useRef(new Map<string, HTMLSpanElement>());
  const viewportRef = useRef<ViewportSnapshot>(viewport.getSnapshot());
  const scheduledFrameRef = useRef<number | null>(null);

  const applyPosition = useCallback((item: ComponentInstance, position: RuntimePosition) => {
    const shell = shellNodesRef.current.get(item.instanceId);
    if (shell) {
      shell.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
    }
    const frameNode = frameNodesRef.current.get(item.instanceId);
    if (frameNode) {
      frameNode.style.width = `${position.width}px`;
      frameNode.style.height = `${position.height}px`;
      frameNode.style.transform = `rotate(${position.rotation}rad)`;
    }
    const scaler = scalerNodesRef.current.get(item.instanceId);
    if (scaler) {
      const intrinsicWidth = Number(item.intrinsicWidth) || position.width;
      const intrinsicHeight = Number(item.intrinsicHeight) || position.height;
      scaler.style.width = `${intrinsicWidth}px`;
      scaler.style.height = `${intrinsicHeight}px`;
      scaler.style.transform = `scale(${position.width / intrinsicWidth}, ${position.height / intrinsicHeight})`;
    }
    const label = labelNodesRef.current.get(item.instanceId);
    if (label) {
      const anchor = rotatePoint(-30, -17, position.width / 2, position.height / 2, position.rotation);
      label.style.transform = `translate3d(${anchor.x}px, ${anchor.y}px, 0)`;
    }
  }, []);

  const applyVisuals = useCallback(() => {
    scheduledFrameRef.current = null;
    const root = rootRef.current;
    if (root) {
      const current = viewportRef.current;
      root.style.transform = `translate3d(${current.scrollX * current.zoom}px, ${current.scrollY * current.zoom}px, 0) scale(${current.zoom})`;
    }
    componentsRef.current.forEach((item) => {
      const position = positionsRef.current.get(item.instanceId);
      if (position) applyPosition(item, position);
    });
  }, [applyPosition]);

  const scheduleVisuals = useCallback(() => {
    if (scheduledFrameRef.current !== null) return;
    scheduledFrameRef.current = frame(applyVisuals);
  }, [applyVisuals]);

  useLayoutEffect(() => {
    const updateViewport = () => {
      viewportRef.current = viewport.getSnapshot();
      scheduleVisuals();
    };
    updateViewport();
    const unsubscribe = viewport.subscribe(updateViewport);
    return () => {
      unsubscribe();
      if (scheduledFrameRef.current !== null) cancelFrame(scheduledFrameRef.current);
      scheduledFrameRef.current = null;
    };
  }, [scheduleVisuals, viewport]);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    componentsRef.current = components;
    components.forEach((item) => {
      if (drag.current?.id === item.instanceId) return;
      positionsRef.current.set(item.instanceId, toRuntimePosition(item));
    });
    const validIds = new Set(components.map((item) => item.instanceId));
    positionsRef.current.forEach((_, id) => { if (!validIds.has(id)) positionsRef.current.delete(id); });
    scheduleVisuals();
  }, [components, scheduleVisuals]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "Alt") { event.preventDefault(); setAltPressed(true); }
      if (event.key === "Shift") setShiftPressed(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === "Alt") setAltPressed(false);
      if (event.key === "Shift") setShiftPressed(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const finish = useCallback(() => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    onCommit(active.id, { x: active.x, y: active.y, width: active.width, height: active.height, rotation: active.rotation });
  }, [onCommit]);

  useEffect(() => {
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [finish]);

  useEffect(() => {
    const receiveBounds = (event: MessageEvent) => {
      if (event.data?.type !== "dockyard:component-bounds") return;
      const entry = [...framesRef.current.entries()].find(([, frameElement]) => frameElement.contentWindow === event.source);
      if (!entry) return;
      const item = componentsRef.current.find((candidate) => candidate.instanceId === entry[0]);
      const width = Number(event.data.width);
      const height = Number(event.data.height);
      if (!item || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
      applyMeasuredBounds(item, { width, height, x: Number(event.data.x) || 0, y: Number(event.data.y) || 0, viewportWidth: Number(event.data.viewportWidth) || width, viewportHeight: Number(event.data.viewportHeight) || height }, "story-dom");
    };
    window.addEventListener("message", receiveBounds);
    return () => window.removeEventListener("message", receiveBounds);
  }, []);

  const begin = (item: ComponentInstance, event: ReactPointerEvent, mode: DragSession["mode"], corner?: DragSession["corner"]) => {
    if (!interactionEnabled || !altPressed) return;
    event.preventDefault();
    event.stopPropagation();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* embedded views may not support capture */ }
    const position = positionsRef.current.get(item.instanceId) || toRuntimePosition(item);
    positionsRef.current.set(item.instanceId, position);
    setSelectedId(item.instanceId);
    drag.current = { id: item.instanceId, mode, corner, startX: event.clientX, startY: event.clientY, x: position.x, y: position.y, width: position.width, height: position.height, rotation: position.rotation };
  };

  const move = (event: ReactPointerEvent) => {
    const active = drag.current;
    if (!active) return;
    const currentViewport = viewport.getSnapshot();
    const dx = (event.clientX - active.startX) / currentViewport.zoom;
    const dy = (event.clientY - active.startY) / currentViewport.zoom;
    if (active.mode === "move") {
      active.x += dx;
      active.y += dy;
      active.startX = event.clientX;
      active.startY = event.clientY;
    } else if (active.mode === "resize") {
      Object.assign(active, resizeFromCorner(active, dx, dy));
      active.startX = event.clientX;
      active.startY = event.clientY;
    } else {
      const hostRect = rootRef.current?.parentElement?.getBoundingClientRect();
      const originX = hostRect?.left || 0;
      const originY = hostRect?.top || 0;
      const centerX = originX + (active.x + active.width / 2 + currentViewport.scrollX) * currentViewport.zoom;
      const centerY = originY + (active.y + active.height / 2 + currentViewport.scrollY) * currentViewport.zoom;
      active.rotation = snapRotation(Math.atan2(event.clientY - centerY, event.clientX - centerX) + Math.PI / 2, event.shiftKey || shiftPressed);
    }
    positionsRef.current.set(active.id, { x: active.x, y: active.y, width: active.width, height: active.height, rotation: active.rotation });
    scheduleVisuals();
  };

  const applyMeasuredBounds = (item: ComponentInstance, measured: MeasuredBounds, source: "story-dom" | "electron-web-frame-main" | "fallback") => {
    const current = positionsRef.current.get(item.instanceId) || toRuntimePosition(item);
    const isDragging = drag.current?.id === item.instanceId;
    const next = {
      x: isDragging ? current.x : current.x + (current.width - measured.width) / 2,
      y: isDragging ? current.y : current.y + (current.height - measured.height) / 2,
      width: measured.width,
      height: measured.height,
      rotation: current.rotation,
    };
    positionsRef.current.set(item.instanceId, next);
    applyPosition(item, next);
    onCommitRef.current(item.instanceId, { width: measured.width, height: measured.height, x: next.x, y: next.y, intrinsicWidth: measured.width, intrinsicHeight: measured.height, frameViewportWidth: measured.viewportWidth, frameViewportHeight: measured.viewportHeight, contentOffsetX: measured.x, contentOffsetY: measured.y, boundsSource: source, loadStatus: "ready" });
  };

  const measureWithElectron = (item: ComponentInstance) => {
    const request = window.dockyard?.storybookMeasureFrame;
    if (!request || !item.storyUrl) return;
    const delays = [0, 250, 750, 1500];
    void (async () => {
      for (const delay of delays) {
        if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
        try {
          const measured = await request(storyEmbedUrl(item.storyUrl));
          if (measured.width > 0 && measured.height > 0) { applyMeasuredBounds(item, measured, "electron-web-frame-main"); return; }
        } catch { /* continue retrying until fallback */ }
      }
      applyMeasuredBounds(item, { width: FALLBACK_WIDTH, height: FALLBACK_HEIGHT, x: 0, y: 0, viewportWidth: FALLBACK_WIDTH, viewportHeight: FALLBACK_HEIGHT }, "fallback");
    })();
  };

  const stories = components.filter((item) => item.sourceType === "storybook" && item.storyUrl);
  if (!stories.length) return null;
  const initialViewport = viewport.getSnapshot();
  return <div ref={rootRef} className={`prototype-overlay-layer${altPressed && interactionEnabled ? " is-active" : ""}`} style={{ transform: `translate3d(${initialViewport.scrollX * initialViewport.zoom}px, ${initialViewport.scrollY * initialViewport.zoom}px, 0) scale(${initialViewport.zoom})` }}>
    {stories.map((item) => {
      const position = positionsRef.current.get(item.instanceId) || toRuntimePosition(item);
      const intrinsicWidth = Number(item.intrinsicWidth) || position.width;
      const intrinsicHeight = Number(item.intrinsicHeight) || position.height;
      const frameWidth = Number(item.frameViewportWidth) || intrinsicWidth;
      const frameHeight = Number(item.frameViewportHeight) || intrinsicHeight;
      const labelAnchor = rotatePoint(-30, -17, position.width / 2, position.height / 2, position.rotation);
      return <div key={item.instanceId} ref={(node) => { if (node) shellNodesRef.current.set(item.instanceId, node); else shellNodesRef.current.delete(item.instanceId); }} className="prototype-overlay-shell" style={{ left: 0, top: 0, width: position.width, height: position.height, transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}>
        <div ref={(node) => { if (node) frameNodesRef.current.set(item.instanceId, node); else frameNodesRef.current.delete(item.instanceId); }} className={`prototype-overlay-item${selectedId === item.instanceId ? " is-selected" : ""}`} style={{ width: position.width, height: position.height, transform: `rotate(${position.rotation}rad)` }} onPointerDown={(event) => begin(item, event, "move")} onPointerMove={move}>
          <div ref={(node) => { if (node) scalerNodesRef.current.set(item.instanceId, node); else scalerNodesRef.current.delete(item.instanceId); }} className="prototype-overlay-scaler" style={{ width: intrinsicWidth, height: intrinsicHeight, transform: `scale(${position.width / intrinsicWidth}, ${position.height / intrinsicHeight})` }}><iframe ref={(frameElement) => { if (frameElement) framesRef.current.set(item.instanceId, frameElement); else framesRef.current.delete(item.instanceId); }} title={item.storyName || item.storyId || item.name} src={storyEmbedUrl(item.storyUrl)} scrolling="no" onLoad={(event) => { event.currentTarget.contentWindow?.postMessage({ type: "dockyard:measure-component" }, "*"); measureWithElectron(item); }} onError={() => applyMeasuredBounds(item, { width: FALLBACK_WIDTH, height: FALLBACK_HEIGHT, x: 0, y: 0, viewportWidth: FALLBACK_WIDTH, viewportHeight: FALLBACK_HEIGHT }, "fallback")} style={{ width: frameWidth, height: frameHeight, transform: `translate(${-Number(item.contentOffsetX || 0)}px, ${-Number(item.contentOffsetY || 0)}px)` }} /></div>
          {item.boundsSource === "fallback" && <span className="prototype-overlay-fallback-size">{Math.round(position.width)} × {Math.round(position.height)}</span>}
          {altPressed && interactionEnabled && selectedId === item.instanceId && <><span className="prototype-overlay-rotate" onPointerDown={(event) => begin(item, event, "rotate")} />{(["nw", "ne", "sw", "se"] as const).map((corner) => <span key={corner} className={`prototype-overlay-handle ${corner}`} onPointerDown={(event) => begin(item, event, "resize", corner)} />)}</>}
        </div>
        {item.sequence && <span ref={(node) => { if (node) labelNodesRef.current.set(item.instanceId, node); else labelNodesRef.current.delete(item.instanceId); }} className="prototype-overlay-sequence" style={{ transform: `translate3d(${labelAnchor.x}px, ${labelAnchor.y}px, 0)` }}>{item.sequence}</span>}
      </div>;
    })}
  </div>;
}
