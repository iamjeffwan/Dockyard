import type { ComponentInstance } from "../types";

export function ComponentInventory({
  components,
  onCopy,
}: {
  components: ComponentInstance[];
  onCopy: () => void;
}) {
  if (!components.length) return null;
  return (
    <aside className="component-inventory" aria-label="当前稿件所用组件">
      <div className="component-inventory-header">
        <strong>当前稿件所用组件</strong>
        <button type="button" onClick={onCopy}>复制组件信息</button>
      </div>
      {components.map((item) => (
        <div className="component-inventory-item" key={item.instanceId}>
          <span className="component-sequence">{item.sequence || "未编号"}</span>
          <span>
            <strong>{item.name}</strong>
            <small>{item.storyName || item.storyId || item.library}</small>
          </span>
        </div>
      ))}
    </aside>
  );
}
