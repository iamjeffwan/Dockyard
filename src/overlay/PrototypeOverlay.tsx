import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { staticSourceById, type StaticSourceDefinition } from "../static-components/registry.js";
import type { ComponentInstance } from "../types.js";
import type { OverlayMode } from "./mode.js";
import type { ViewportChannel, ViewportSnapshot } from "./viewport-channel.js";
import {
  isOverlayMessage,
  isRuntimeNativeToolShortcutMessage,
  isRuntimeReadyMessage,
  RuntimeCommand,
  RuntimeEvent,
  runtimeCommand,
} from "./runtime-protocol.js";
import "./styles.css";

type RuntimeInstance = {
  id: string;
  sourceId: string;
  protocolVersion: string;
  componentKey: string;
  variantKey?: string;
  props?: Record<string, unknown>;
  x: number;
  y: number;
  width?: number;
  height?: number;
  naturalWidth?: number;
  naturalHeight?: number;
  sizeMode?: "auto" | "manual";
  presentation?: ComponentInstance["presentation"];
  interactive?: boolean;
  rotation: number;
  sequence?: string;
};

type SourceGroup = {
  source: StaticSourceDefinition;
  components: ComponentInstance[];
};

type RuntimeFailure = NonNullable<ComponentInstance["staticError"]>;

export type PrototypeOverlayProps = {
  components: ComponentInstance[];
  viewport: ViewportChannel;
  mode: OverlayMode;
  onCommit: (instanceId: string, patch: Partial<ComponentInstance>) => void;
  onNativeToolShortcut: (key: string) => void;
  interactiveInstanceIds?: string[];
};

function runtimeUrl(source: StaticSourceDefinition) {
  const url = window.dockyard
    ? "dockyard-static://components/runtime.html"
    : new URL(source.runtimeUrl.replace(/^\.\//, "/"), window.location.origin).href;
  const params = new URLSearchParams({ source: source.id, moduleVersion: source.module.version });
  if (source.testOnly) params.set("fixtures", "1");
  return `${url}${url.includes("?") ? "&" : "?"}${params}`;
}

function toRuntimeInstance(item: ComponentInstance, source: StaticSourceDefinition, interactive: boolean): RuntimeInstance {
  return {
    id: item.instanceId,
    sourceId: source.id,
    protocolVersion: item.staticModule?.protocolVersion || source.protocolVersion,
    componentKey: item.staticModule?.componentKey || item.componentKey || "",
    variantKey: item.variantKey,
    props: item.props,
    x: Number(item.x) || 0,
    y: Number(item.y) || 0,
    width: Number(item.width) || undefined,
    height: Number(item.height) || undefined,
    naturalWidth: Number(item.naturalWidth) || undefined,
    naturalHeight: Number(item.naturalHeight) || undefined,
    sizeMode: item.sizeMode,
    presentation: item.presentation,
    interactive,
    rotation: Number(item.rotation) || 0,
    sequence: item.sequence,
  };
}

function viewportPayload(viewport: ViewportSnapshot) {
  return {
    scrollX: viewport.scrollX,
    scrollY: viewport.scrollY,
    zoom: viewport.zoom,
    width: viewport.width,
    height: viewport.height,
  };
}

function errorPatch(sourceId: string, phase: RuntimeFailure["phase"], reason: string) {
  return { loadStatus: "unavailable" as const, staticError: { sourceId, phase, reason } };
}

function errorStyle(item: ComponentInstance, viewport: ViewportSnapshot) {
  const zoom = viewport.zoom;
  return {
    left: (Number(item.x) + viewport.scrollX) * zoom,
    top: (Number(item.y) + viewport.scrollY) * zoom,
    width: Math.max(1, Number(item.width) || Number(item.naturalWidth) || 160) * zoom,
    height: Math.max(1, Number(item.height) || Number(item.naturalHeight) || 48) * zoom,
    transform: `rotate(${Number(item.rotation) || 0}rad)`,
  };
}

function SourceRuntimeLayer({
  group,
  viewport,
  mode,
  active,
  onPointerPosition,
  onCommit,
  onNativeToolShortcut,
  interactiveInstanceIds,
}: {
  group: SourceGroup;
  viewport: ViewportChannel;
  mode: OverlayMode;
  active: boolean;
  onPointerPosition: (sourceId: string, x: number, y: number, interactive: boolean) => void;
  onCommit: PrototypeOverlayProps["onCommit"];
  onNativeToolShortcut: PrototypeOverlayProps["onNativeToolShortcut"];
  interactiveInstanceIds?: string[];
}) {
  const { source, components } = group;
  const [viewportState, setViewportState] = useState(() => viewport.getSnapshot());
  const [runtimeStatus, setRuntimeStatus] = useState<"loading" | "ready" | "error">("loading");
  const [sourceFailure, setSourceFailure] = useState<RuntimeFailure | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const onCommitRef = useRef(onCommit);
  const onNativeToolShortcutRef = useRef(onNativeToolShortcut);
  const interactiveIdsKey = interactiveInstanceIds?.join("\0") || "";
  const instances = useMemo(() => {
    const interactiveIds = new Set(interactiveInstanceIds);
    return components.map((item) => toRuntimeInstance(item, source, interactiveIds.has(item.instanceId)));
  }, [components, interactiveIdsKey, source]);
  const frameSource = useMemo(() => runtimeUrl(source), [source]);

  const sendRuntimeState = useCallback(() => {
    const frameWindow = frameRef.current?.contentWindow;
    if (!frameWindow) return;
    frameWindow.postMessage(runtimeCommand(source.id, RuntimeCommand.viewport, viewportPayload(viewport.getSnapshot())), "*");
    frameWindow.postMessage(runtimeCommand(source.id, RuntimeCommand.setMode, { mode }), "*");
    frameWindow.postMessage(runtimeCommand(source.id, RuntimeCommand.setInstances, { instances }), "*");
  }, [instances, mode, source.id, viewport]);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    onNativeToolShortcutRef.current = onNativeToolShortcut;
  }, [onNativeToolShortcut]);

  useEffect(() => {
    let frame = 0;
    return viewport.subscribe(() => {
      const snapshot = viewport.getSnapshot();
      frame = requestAnimationFrame(() => {
        setViewportState(snapshot);
        frame = 0;
      });
      frameRef.current?.contentWindow?.postMessage(runtimeCommand(source.id, RuntimeCommand.viewport, viewportPayload(snapshot)), "*");
    });
  }, [source.id, viewport]);

  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage(runtimeCommand(source.id, RuntimeCommand.viewport, viewportPayload(viewportState)), "*");
  }, [source.id, viewportState]);

  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage(runtimeCommand(source.id, RuntimeCommand.setMode, { mode }), "*");
  }, [frameSource, mode, source.id]);

  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage(runtimeCommand(source.id, RuntimeCommand.setInstances, { instances }), "*");
  }, [instances, source.id]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || !isOverlayMessage(event.data, source.id)) return;
      if (isRuntimeReadyMessage(event.data, source.id)) {
        setRuntimeStatus("ready");
        setSourceFailure(null);
        sendRuntimeState();
        return;
      }
      if (isRuntimeNativeToolShortcutMessage(event.data, source.id)) {
        onNativeToolShortcutRef.current(event.data.key);
        return;
      }
      if (event.data.type === RuntimeEvent.pointerPosition) {
        onPointerPosition(
          source.id,
          Number(event.data.x) || 0,
          Number(event.data.y) || 0,
          Boolean(event.data.interactive),
        );
        return;
      }
      const instanceId = typeof event.data.componentId === "string" ? event.data.componentId : "";
      if (event.data.type === RuntimeEvent.moduleLoading) {
        setRuntimeStatus("loading");
        setSourceFailure(null);
        for (const item of components) onCommitRef.current(item.instanceId, { loadStatus: "loading", staticError: undefined });
        return;
      }
      if (event.data.type === RuntimeEvent.moduleError) {
        setRuntimeStatus("error");
        const phase = (["manifest", "style", "module", "contract"].includes(String(event.data.phase))
          ? event.data.phase
          : "module") as RuntimeFailure["phase"];
        const reason = String(event.data.error || "静态来源加载失败");
        const failure = { sourceId: source.id, phase, reason };
        if (!instanceId) setSourceFailure(failure);
        const affected = instanceId ? components.filter((item) => item.instanceId === instanceId) : components;
        for (const item of affected) {
          if (item.staticError?.phase !== phase || item.staticError?.reason !== reason) {
            onCommitRef.current(item.instanceId, errorPatch(source.id, phase, reason));
          }
        }
        return;
      }
      if (!instanceId) return;
      if (event.data.type === RuntimeEvent.componentBounds) {
        const naturalWidth = Number(event.data.naturalWidth ?? event.data.width);
        const naturalHeight = Number(event.data.naturalHeight ?? event.data.height);
        if (naturalWidth > 0 && naturalHeight > 0) {
          const current = components.find((item) => item.instanceId === instanceId);
          const patch: Partial<ComponentInstance> = {
            naturalWidth,
            naturalHeight,
            width: current?.sizeMode === "auto" ? naturalWidth : Number(current?.width) || naturalWidth,
            height: current?.sizeMode === "auto" ? naturalHeight : Number(current?.height) || naturalHeight,
            boundsSource: "story-dom",
            loadStatus: "ready",
            staticError: undefined,
          };
          if (current?.sizeMode === "auto" && current.boundsSource !== "story-dom") {
            patch.x = (Number(current.x) || 0) + ((Number(current.width) || naturalWidth) - naturalWidth) / 2;
            patch.y = (Number(current.y) || 0) + ((Number(current.height) || naturalHeight) - naturalHeight) / 2;
          }
          if (Object.entries(patch).some(([key, value]) => current?.[key as keyof ComponentInstance] !== value)) {
            onCommitRef.current(instanceId, patch);
          }
        }
        return;
      }
      if (event.data.type !== RuntimeEvent.componentDrop) return;
      const values = ["x", "y", "width", "height", "rotation", "naturalWidth", "naturalHeight"] as const;
      const patch: Partial<ComponentInstance> = {};
      for (const key of values) {
        const value = Number(event.data[key]);
        if (Number.isFinite(value)) patch[key] = value;
      }
      if (event.data.transformKind === "resize") patch.sizeMode = "manual";
      onCommitRef.current(instanceId, patch);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [components, onPointerPosition, sendRuntimeState, source.id]);

  const retry = () => {
    setRuntimeStatus("loading");
    setSourceFailure(null);
    frameRef.current?.contentWindow?.postMessage(runtimeCommand(source.id, RuntimeCommand.retry), "*");
  };

  const interactiveInstance = instances.find((item) => item.interactive);
  const interactionClipRects = interactiveInstance?.presentation ? instances.flatMap((instance) => {
    const p = instance.presentation;
    if (!p) return [];
    const overflow = instance.interactive ? 380 * viewportState.zoom : 0;
    const rawLeft = (p.viewportX + viewportState.scrollX) * viewportState.zoom - overflow;
    const rawTop = (p.viewportY + viewportState.scrollY) * viewportState.zoom - overflow;
    const rawRight = (p.viewportX + p.viewportWidth + viewportState.scrollX) * viewportState.zoom + overflow;
    const rawBottom = (p.viewportY + p.viewportHeight + viewportState.scrollY) * viewportState.zoom + overflow;
    const left = Math.max(0, rawLeft);
    const top = Math.max(0, rawTop);
    const right = Math.min(viewportState.width, rawRight);
    const bottom = Math.min(viewportState.height, rawBottom);
    return right > left && bottom > top ? [{ id: instance.id, x: left, y: top, width: right - left, height: bottom - top }] : [];
  }) : [];
  const interactionClipId = `dockyard-runtime-clip-${source.id.replace(/[^a-z0-9_-]/gi, "-")}`;
  const interactionClip = interactionClipRects.length ? `url(#${interactionClipId})` : undefined;
  return (
    <>
      {interactionClipRects.length > 0 && <svg className="prototype-overlay-clip-definitions" aria-hidden="true">
        <defs>
          <clipPath id={interactionClipId} clipPathUnits="userSpaceOnUse">
            {interactionClipRects.map((rect) => <rect key={rect.id} x={rect.x} y={rect.y} width={rect.width} height={rect.height} />)}
          </clipPath>
        </defs>
      </svg>}
      <div
        className={`prototype-overlay-layer prototype-overlay-shared${(active && mode === "component") || Boolean(interactionClip) ? " is-active" : ""}`}
        data-source-id={source.id}
        data-runtime-status={runtimeStatus}
        style={interactionClip ? { clipPath: interactionClip } : undefined}
      >
      <iframe
        ref={frameRef}
        title={`静态组件层：${source.name}`}
        data-source-id={source.id}
        src={frameSource}
        sandbox={window.dockyard ? "allow-scripts" : undefined}
        onLoad={sendRuntimeState}
        style={{ width: "100%", height: "100%", border: 0, background: "transparent" }}
      />
      {components.filter((item) => item.staticError).map((item) => (
        <div
          key={`error-${item.instanceId}`}
          className="prototype-overlay-error"
          data-component-id={item.instanceId}
          data-source-id={source.id}
          data-error-phase={item.staticError?.phase}
          style={errorStyle(item, viewportState)}
        >
          <strong>{source.name} · {item.staticError?.phase}</strong>
          <span>{item.staticError?.reason}</span>
          {sourceFailure && <button type="button" onClick={retry}>重试</button>}
        </div>
      ))}
      </div>
    </>
  );
}

export function PrototypeOverlay({ components, viewport, mode, onCommit, onNativeToolShortcut, interactiveInstanceIds = [] }: PrototypeOverlayProps) {
  const groups = useMemo(() => {
    const grouped = new Map<string, SourceGroup>();
    for (const item of components) {
      const sourceId = item.staticModule?.sourceId || item.sourceLibraryId;
      if (!sourceId) continue;
      const source = staticSourceById(sourceId);
      if (!source) continue;
      const current = grouped.get(sourceId) || { source, components: [] };
      current.components.push(item);
      grouped.set(sourceId, current);
    }
    return [...grouped.values()];
  }, [components]);
  const [activeSourceId, setActiveSourceId] = useState("");
  const [hoveredSourceId, setHoveredSourceId] = useState("");
  const viewportState = viewport.getSnapshot();
  const unknownComponents = components.filter((item) => {
    const sourceId = item.staticModule?.sourceId || item.sourceLibraryId;
    return Boolean(sourceId && !staticSourceById(sourceId));
  });

  useEffect(() => {
    if (!groups.some((group) => group.source.id === activeSourceId)) {
      setActiveSourceId(groups[0]?.source.id || "");
    }
  }, [activeSourceId, groups]);

  useEffect(() => {
    for (const item of unknownComponents) {
      const sourceId = item.staticModule?.sourceId || item.sourceLibraryId || "unknown";
      if (item.staticError?.phase !== "source") {
        onCommit(item.instanceId, errorPatch(sourceId, "source", `未知静态来源：${sourceId}`));
      }
    }
  }, [onCommit, unknownComponents]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (mode !== "canvas") { setHoveredSourceId(""); return; }
      const snapshot = viewport.getSnapshot();
      const x = event.clientX / snapshot.zoom - snapshot.scrollX;
      const y = event.clientY / snapshot.zoom - snapshot.scrollY;
      let hit = "";
      for (const group of groups) for (const item of group.components) {
        const p = item.presentation;
        const width = p?.viewportWidth || Number(item.width) || Number(item.naturalWidth) || 1;
        const height = p?.viewportHeight || Number(item.height) || Number(item.naturalHeight) || 1;
        const ix = p?.viewportX ?? Number(item.x); const iy = p?.viewportY ?? Number(item.y);
        if (x >= ix && x <= ix + width && y >= iy && y <= iy + height) hit = group.source.id;
      }
      setHoveredSourceId(hit);
    };
    window.addEventListener("pointermove", onMove, true);
    return () => window.removeEventListener("pointermove", onMove, true);
  }, [groups, mode, viewport]);

  const onPointerPosition = useCallback((sourceId: string, clientX: number, clientY: number, interactive: boolean) => {
    const snapshot = viewport.getSnapshot();
    const x = clientX / snapshot.zoom - snapshot.scrollX;
    const y = clientY / snapshot.zoom - snapshot.scrollY;
    for (const group of [...groups].reverse()) {
      for (const item of [...group.components].reverse()) {
        const presentation = item.presentation;
        const width = presentation?.viewportWidth || Number(item.width) || Number(item.naturalWidth) || 1;
        const height = presentation?.viewportHeight || Number(item.height) || Number(item.naturalHeight) || 1;
        const itemX = presentation?.viewportX ?? Number(item.x);
        const itemY = presentation?.viewportY ?? Number(item.y);
        const centerX = itemX + width / 2;
        const centerY = itemY + height / 2;
        const angle = -(Number(item.rotation) || 0);
        const dx = x - centerX;
        const dy = y - centerY;
        const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
        const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
        if (Math.abs(localX) <= width / 2 && Math.abs(localY) <= height / 2) {
          if (activeSourceId !== group.source.id) setActiveSourceId(group.source.id);
          return;
        }
      }
    }
    if (interactive && activeSourceId !== sourceId) setActiveSourceId(sourceId);
  }, [activeSourceId, groups, viewport]);

  return <>
    {groups.map((group) => (
      <SourceRuntimeLayer
        key={group.source.id}
        group={group}
        viewport={viewport}
        mode={mode}
        active={(mode === "component" && group.source.id === activeSourceId) || (mode === "canvas" && group.source.id === hoveredSourceId)}
        onPointerPosition={onPointerPosition}
        onCommit={onCommit}
        onNativeToolShortcut={onNativeToolShortcut}
        interactiveInstanceIds={interactiveInstanceIds}
      />
    ))}
    {unknownComponents.map((item) => (
      <div key={`unknown-${item.instanceId}`} className="prototype-overlay-error" style={errorStyle(item, viewportState)}>
        <strong>未知静态来源 · source</strong>
        <span>{item.staticError?.reason}</span>
      </div>
    ))}
  </>;
}
