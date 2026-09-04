import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentInstance } from "../types.js";
import type { ViewportChannel, ViewportSnapshot } from "./viewport-channel.js";
import "./styles.css";

const OVERLAY_PROTOCOL = "dockyard-overlay";

type OverlayMode = "canvas" | "component";

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
  interactionEnabled: boolean;
  onCommit: (instanceId: string, patch: Partial<ComponentInstance>) => void;
};

function runtimeUrl(manifestUrl: string) {
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

export function PrototypeOverlay({ components, viewport, interactionEnabled, onCommit }: PrototypeOverlayProps) {
  const [mode, setMode] = useState<OverlayMode>("canvas");
  const [viewportState, setViewportState] = useState(() => viewport.getSnapshot());
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const onCommitRef = useRef(onCommit);
  const staticComponents = useMemo(
    () => components.filter((item) => item.staticModule?.manifestUrl && (item.staticModule.componentKey || item.componentKey)),
    [components],
  );
  const manifestUrl = staticComponents[0]?.staticModule?.manifestUrl;
  const instances = useMemo(() => staticComponents.map(toRuntimeInstance), [staticComponents]);
  const source = useMemo(() => manifestUrl ? runtimeUrl(manifestUrl) : "", [manifestUrl]);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => viewport.subscribe(() => setViewportState(viewport.getSnapshot())), [viewport]);

  useEffect(() => {
    const frameWindow = frameRef.current?.contentWindow;
    frameWindow?.postMessage({ protocol: OVERLAY_PROTOCOL, version: "1", type: "viewport", ...viewportPayload(viewportState) }, "*");
  }, [viewportState]);

  useEffect(() => {
    const frameWindow = frameRef.current?.contentWindow;
    frameWindow?.postMessage({ protocol: OVERLAY_PROTOCOL, version: "1", type: "set-mode", mode }, "*");
  }, [mode, source]);

  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage({ protocol: OVERLAY_PROTOCOL, version: "1", type: "set-instances", instances }, "*");
  }, [instances]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.data?.protocol !== OVERLAY_PROTOCOL) return;
      const instanceId = typeof event.data.componentId === "string" ? event.data.componentId : "";
      if (!instanceId) return;
      if (event.data.type === "component-bounds") {
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
      if (event.data.type !== "component-drop" && event.data.type !== "component-transform") return;
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
  }, [staticComponents]);

  if (!source) return null;

  const sendInitialState = () => {
    const frameWindow = frameRef.current?.contentWindow;
    frameWindow?.postMessage({ protocol: OVERLAY_PROTOCOL, version: "1", type: "viewport", ...viewportPayload(viewport.getSnapshot()) }, "*");
    frameWindow?.postMessage({ protocol: OVERLAY_PROTOCOL, version: "1", type: "set-mode", mode }, "*");
    frameWindow?.postMessage({ protocol: OVERLAY_PROTOCOL, version: "1", type: "set-instances", instances }, "*");
  };

  return (
    <>
      {interactionEnabled && (
        <div className="prototype-overlay-mode-switch" role="group" aria-label="画板操作模式">
          <button type="button" className={mode === "canvas" ? "is-selected" : ""} aria-pressed={mode === "canvas"} onClick={() => setMode("canvas")}>画板模式</button>
          <button type="button" className={mode === "component" ? "is-selected" : ""} aria-pressed={mode === "component"} onClick={() => setMode("component")}>组件交互模式</button>
        </div>
      )}
      <div className={`prototype-overlay-layer prototype-overlay-shared${mode === "component" ? " is-active" : ""}`}>
        <iframe
          ref={frameRef}
          title="共享静态组件层"
          src={source}
          onLoad={sendInitialState}
          style={{ width: "100%", height: "100%", border: 0, background: "transparent" }}
        />
      </div>
    </>
  );
}
