import { useState } from "react";
import { Copy, Minus, PanelsTopLeft } from "lucide-react";
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
  const panelId = "dockyard-current-components";
  return (
    <div className="component-inventory">
      <button
        type="button"
        className="component-inventory-trigger"
        aria-label="查看所用组件"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <PanelsTopLeft size={18} aria-hidden="true" />
      </button>
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
