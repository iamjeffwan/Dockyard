import { useLayoutEffect, useRef, useState } from "react";
import { Copy, Minus, PanelsTopLeft } from "lucide-react";
import { Button } from "@excalidraw/excalidraw";
import type { ComponentInstance } from "../types";

export function ComponentInventory({
  components,
  onRemove,
  onCopyImage,
  onCopy,
}: {
  components: ComponentInstance[];
  onRemove: (instanceId: string) => void;
  onCopyImage: () => void;
  onCopy: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const panelId = "dockyard-current-components";

  useLayoutEffect(() => {
    const updatePosition = () => {
      const container = containerRef.current;
      const help = helpRef.current || document.querySelector<HTMLElement>(".excalidraw .help-icon");
      if (!container || !help) return;
      helpRef.current = help;
      observer?.observe(help);
      mutationObserver?.disconnect();
      const containerRect = container.parentElement?.getBoundingClientRect();
      const helpRect = help.getBoundingClientRect();
      if (!containerRect) return;
      setAnchor((current) => {
        const next = {
          left: helpRect.left - containerRect.left - 48,
          top: helpRect.top - containerRect.top,
        };
        return current && Math.abs(current.left - next.left) < 0.5 && Math.abs(current.top - next.top) < 0.5
          ? current
          : next;
      });
    };
    const scheduleUpdate = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        updatePosition();
      });
    };
    const host = containerRef.current?.parentElement;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleUpdate);
    if (host) observer?.observe(host);
    if (helpRef.current) observer?.observe(helpRef.current);
    const mutationObserver = host ? new MutationObserver(() => {
      if (helpRef.current) {
        mutationObserver?.disconnect();
        return;
      }
      scheduleUpdate();
      const help = host.querySelector<HTMLElement>(".excalidraw .help-icon");
      if (help) {
        helpRef.current = help;
        observer?.observe(help);
        mutationObserver?.disconnect();
      }
    }) : null;
    if (host && !helpRef.current) mutationObserver?.observe(host, { childList: true, subtree: true });
    const onScroll = () => scheduleUpdate();
    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate);
    host?.addEventListener("scroll", onScroll, true);
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      observer?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      host?.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="component-inventory"
      style={anchor ? { left: anchor.left, top: anchor.top, right: "auto", bottom: "auto" } : undefined}
    >
      <Button
        type="button"
        className="component-inventory-trigger"
        aria-label="查看所用组件"
        aria-expanded={open}
        aria-controls={panelId}
        onSelect={() => setOpen((value) => !value)}
      >
        <PanelsTopLeft size={18} aria-hidden="true" />
      </Button>
      {open && (
        <aside id={panelId} className="component-inventory-panel" aria-label="所用组件">
          <div className="component-inventory-header">
            <strong>全部</strong>
          </div>
          <div className="component-inventory-list">
            {components.length ? components.map((item, index) => (
              <div className="component-inventory-item storybook-story" key={item.instanceId}>
                <span className="component-sequence">{item.sequence || String(index + 1)}</span>
                <span className="component-inventory-copy">
                  <strong>{item.name}</strong>
                  <small>{item.storyName || item.storyId || item.library}</small>
                </span>
                <button type="button" className="component-remove-button" aria-label={`移除${item.name}`} onClick={() => onRemove(item.instanceId)}>
                  <Minus size={14} aria-hidden="true" />
                </button>
              </div>
            )) : <p className="component-inventory-empty">暂无组件</p>}
          </div>
          <div className="component-inventory-actions">
            <button type="button" onClick={onCopyImage} title="复制当前页面图片" aria-label="复制当前页面图片"><Copy size={15} aria-hidden="true" /></button>
            <button type="button" onClick={onCopy} disabled={!components.length} title="复制组件信息" aria-label="复制组件信息"><Copy size={15} aria-hidden="true" /><span>信息</span></button>
          </div>
        </aside>
      )}
    </div>
  );
}
