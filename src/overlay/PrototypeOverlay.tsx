import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentInstance } from "../types.js";
import { staticComponentByKey, staticSourceById } from "../static-components/registry.js";
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
  rotation: number;
  sequence?: string;
};

export type PrototypeOverlayProps = {
  components: ComponentInstance[];
  viewport: ViewportChannel;
  mode: OverlayMode;
  onCommit: (instanceId: string, patch: Partial<ComponentInstance>) => void;
  onNativeToolShortcut: (key: string) => void;
};

function runtimeUrl(sourceId: string, configuredUrl: string) {
  const url = window.dockyard ? "dockyard-static://components/runtime.html" : configuredUrl;
  return `${url}${url.includes("?") ? "&" : "?"}source=${encodeURIComponent(sourceId)}`;
}

function toRuntimeInstance(item: ComponentInstance, sourceId: string, protocolVersion: string): RuntimeInstance {
  return {
    id: item.instanceId,
    sourceId,
    protocolVersion,
    componentKey: item.staticModule?.componentKey || item.componentKey || "",
    variantKey: item.variantKey,
    props: item.props,
    x: Number(item.x) || 0,
    y: Number(item.y) || 0,
    width: Number(item.width) || undefined,
    height: Number(item.height) || undefined,
    naturalWidth: Number(item.naturalWidth) || undefined,
    naturalHeight: Number(item.naturalHeight) || undefined,
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

export function PrototypeOverlay({ components, viewport, mode, onCommit, onNativeToolShortcut }: PrototypeOverlayProps) {
  const [viewportState, setViewportState] = useState(() => viewport.getSnapshot());
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const onCommitRef = useRef(onCommit);
  const onNativeToolShortcutRef = useRef(onNativeToolShortcut);
  const sourceId = components.find((item) => item.staticModule || item.sourceLibraryId)?.staticModule?.sourceId
    || components.find((item) => item.staticModule || item.sourceLibraryId)?.sourceLibraryId
    || "";
  const sourceDefinition = staticSourceById(sourceId);
  const staticComponents = useMemo(
    () => sourceDefinition ? components.filter((item) => {
      const itemSourceId = item.staticModule?.sourceId || item.sourceLibraryId;
      const componentKey = item.staticModule?.componentKey || item.componentKey;
      return itemSourceId === sourceDefinition.id && Boolean(componentKey && staticComponentByKey(componentKey, itemSourceId));
    }) : [],
    [components, sourceDefinition],
  );
  const instances = useMemo(
    () => sourceDefinition ? staticComponents.map((item) => toRuntimeInstance(item, sourceDefinition.id, sourceDefinition.protocolVersion)) : [],
    [sourceDefinition, staticComponents],
  );
  const source = useMemo(
    () => sourceDefinition ? runtimeUrl(sourceDefinition.id, sourceDefinition.runtimeUrl) : "",
    [sourceDefinition],
  );

  const sendRuntimeState = useCallback(() => {
    const frameWindow = frameRef.current?.contentWindow;
    if (!frameWindow) return;
    if (!sourceDefinition) return;
    frameWindow.postMessage(runtimeCommand(sourceDefinition.id, RuntimeCommand.viewport, viewportPayload(viewport.getSnapshot())), "*");
    frameWindow.postMessage(runtimeCommand(sourceDefinition.id, RuntimeCommand.setMode, { mode }), "*");
    frameWindow.postMessage(runtimeCommand(sourceDefinition.id, RuntimeCommand.setInstances, { instances }), "*");
  }, [instances, mode, sourceDefinition, viewport]);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    onNativeToolShortcutRef.current = onNativeToolShortcut;
  }, [onNativeToolShortcut]);

  useEffect(() => viewport.subscribe(() => setViewportState(viewport.getSnapshot())), [viewport]);

  useEffect(() => {
    const frameWindow = frameRef.current?.contentWindow;
    if (sourceDefinition) frameWindow?.postMessage(runtimeCommand(sourceDefinition.id, RuntimeCommand.viewport, viewportPayload(viewportState)), "*");
  }, [sourceDefinition, viewportState]);

  useEffect(() => {
    const frameWindow = frameRef.current?.contentWindow;
    if (sourceDefinition) frameWindow?.postMessage(runtimeCommand(sourceDefinition.id, RuntimeCommand.setMode, { mode }), "*");
  }, [mode, source, sourceDefinition]);

  useEffect(() => {
    if (sourceDefinition) frameRef.current?.contentWindow?.postMessage(runtimeCommand(sourceDefinition.id, RuntimeCommand.setInstances, { instances }), "*");
  }, [instances, sourceDefinition]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || !sourceDefinition || !isOverlayMessage(event.data, sourceDefinition.id)) return;
      if (isRuntimeReadyMessage(event.data, sourceDefinition.id)) {
        sendRuntimeState();
        return;
      }
      if (isRuntimeNativeToolShortcutMessage(event.data, sourceDefinition.id)) {
        onNativeToolShortcutRef.current(event.data.key);
        return;
      }
      const instanceId = typeof event.data.componentId === "string" ? event.data.componentId : "";
      if (!instanceId) return;
      if (event.data.type === RuntimeEvent.componentBounds) {
        const naturalWidth = Number(event.data.naturalWidth ?? event.data.width);
        const naturalHeight = Number(event.data.naturalHeight ?? event.data.height);
        if (naturalWidth > 0 && naturalHeight > 0) {
          const current = staticComponents.find((item) => item.instanceId === instanceId);
          onCommitRef.current(instanceId, {
            naturalWidth,
            naturalHeight,
            width: Number(current?.width) || naturalWidth,
            height: Number(current?.height) || naturalHeight,
            boundsSource: "story-dom",
            loadStatus: "ready",
          });
        }
        return;
      }
      if (event.data.type !== RuntimeEvent.componentDrop) return;
      const values = ["x", "y", "width", "height", "rotation"] as const;
      const patch: Partial<ComponentInstance> = {};
      for (const key of values) {
        const value = Number(event.data[key]);
        if (Number.isFinite(value)) patch[key] = value;
      }
      onCommitRef.current(instanceId, patch);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [sendRuntimeState, sourceDefinition, staticComponents]);

  if (!source) return null;

  return (
    <div className={`prototype-overlay-layer prototype-overlay-shared${mode === "component" ? " is-active" : ""}`}>
      <iframe
        ref={frameRef}
        title="共享静态组件层"
        src={source}
        sandbox="allow-scripts"
        onLoad={sendRuntimeState}
        style={{ width: "100%", height: "100%", border: 0, background: "transparent" }}
      />
    </div>
  );
}
