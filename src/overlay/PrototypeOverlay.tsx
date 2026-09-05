import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function runtimeUrl(manifestUrl: string) {
  if (window.dockyard) return "dockyard-static://components/runtime.html";
  return manifestUrl.replace(/manifest\.json(?=\?|$)/, "runtime.html");
}

function toRuntimeInstance(item: ComponentInstance): RuntimeInstance {
  return {
    id: item.instanceId,
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
  const staticComponents = useMemo(
    () => components.filter((item) => item.staticModule?.manifestUrl && (item.staticModule.componentKey || item.componentKey)),
    [components],
  );
  const manifestUrl = staticComponents[0]?.staticModule?.manifestUrl;
  const instances = useMemo(() => staticComponents.map(toRuntimeInstance), [staticComponents]);
  const source = useMemo(() => manifestUrl ? runtimeUrl(manifestUrl) : "", [manifestUrl]);

  const sendRuntimeState = useCallback(() => {
    const frameWindow = frameRef.current?.contentWindow;
    if (!frameWindow) return;
    frameWindow.postMessage(runtimeCommand(RuntimeCommand.viewport, viewportPayload(viewport.getSnapshot())), "*");
    frameWindow.postMessage(runtimeCommand(RuntimeCommand.setMode, { mode }), "*");
    frameWindow.postMessage(runtimeCommand(RuntimeCommand.setInstances, { instances }), "*");
  }, [instances, mode, viewport]);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    onNativeToolShortcutRef.current = onNativeToolShortcut;
  }, [onNativeToolShortcut]);

  useEffect(() => viewport.subscribe(() => setViewportState(viewport.getSnapshot())), [viewport]);

  useEffect(() => {
    const frameWindow = frameRef.current?.contentWindow;
    frameWindow?.postMessage(runtimeCommand(RuntimeCommand.viewport, viewportPayload(viewportState)), "*");
  }, [viewportState]);

  useEffect(() => {
    const frameWindow = frameRef.current?.contentWindow;
    frameWindow?.postMessage(runtimeCommand(RuntimeCommand.setMode, { mode }), "*");
  }, [mode, source]);

  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage(runtimeCommand(RuntimeCommand.setInstances, { instances }), "*");
  }, [instances]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || !isOverlayMessage(event.data)) return;
      if (isRuntimeReadyMessage(event.data)) {
        sendRuntimeState();
        return;
      }
      if (isRuntimeNativeToolShortcutMessage(event.data)) {
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
  }, [sendRuntimeState, staticComponents]);

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
