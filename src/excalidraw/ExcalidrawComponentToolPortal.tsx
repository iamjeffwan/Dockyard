import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Component } from "lucide-react";
import {
  nativeExcalidrawToolForShortcut,
  type NativeExcalidrawTool,
} from "./component-tool-shortcuts.js";
import "./component-tool.css";

const toolbarSelector = ".excalidraw .App-toolbar > .Stack";
const hostAttribute = "data-dockyard-component-tool-host";
const componentToolTestId = "toolbar-component";
export const DOCKYARD_COMPONENT_TOOL = "dockyard-component";

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && (target.isContentEditable || Boolean(target.closest("input, textarea, select")));
}

function installHost(toolbar: HTMLElement) {
  const existing = toolbar.querySelector<HTMLElement>(`[${hostAttribute}]`);
  if (existing) return existing;
  const host = document.createElement("span");
  host.setAttribute(hostAttribute, "");
  host.className = "dockyard-component-tool-host";
  const extraTools = toolbar.querySelector<HTMLElement>(":scope > .App-toolbar__extra-tools-trigger");
  const divider = extraTools?.previousElementSibling;
  toolbar.insertBefore(host, divider?.classList.contains("App-toolbar__divider") ? divider : extraTools || null);
  return host;
}

export function ExcalidrawComponentToolPortal({
  active,
  onActivate,
  onCanvasToolActivate,
  onCanvasToolShortcut,
}: {
  active: boolean;
  onActivate: () => void;
  onCanvasToolActivate: () => void;
  onCanvasToolShortcut: (tool: NativeExcalidrawTool) => void;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    let current: HTMLElement | null = null;
    const findTarget = () => {
      const toolbar = document.querySelector<HTMLElement>(toolbarSelector);
      const next = toolbar ? installHost(toolbar) : null;
      if (next === current) return;
      current = next;
      setTarget(next);
    };
    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      current?.remove();
    };
  }, []);

  useLayoutEffect(() => {
    if (!active) return;
    const handleClick = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      if (!element?.closest(".App-toolbar-container")) return;
      if (element.closest(`[${hostAttribute}]`)) return;
      onCanvasToolActivate();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const tool = nativeExcalidrawToolForShortcut({
        key: event.key,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        editable: isEditableTarget(event.target),
      });
      if (tool) onCanvasToolShortcut(tool);
    };
    document.addEventListener("click", handleClick, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [active, onCanvasToolActivate, onCanvasToolShortcut]);

  if (!target) return null;
  return createPortal(
    <label className="ToolIcon Shape" title="组件交互">
      <input
        type="radio"
        name="editor-current-shape"
        className="ToolIcon_type_radio ToolIcon_size_medium"
        aria-label="组件交互"
        data-testid={componentToolTestId}
        checked={active}
        onChange={onActivate}
      />
      <span className="ToolIcon__icon">
        <Component size={20} aria-hidden="true" />
      </span>
    </label>,
    target,
  );
}
