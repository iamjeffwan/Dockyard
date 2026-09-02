import { DismissibleTag, MultiSelect } from "@carbon/react";
import { useLayoutEffect, useRef, useState } from "react";
import type { StorybookSource } from "../types.js";

function firstWord(value: string) {
  return value.trim().split(/\s+/)[0] || value;
}

export function StorybookSourceMultiSelect({
  sources,
  selectedSources,
  onChange,
}: {
  sources: StorybookSource[];
  selectedSources: StorybookSource[];
  onChange: (sourceIds: string[]) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const measure = measureRef.current;
    if (!root || !measure) return;
    const update = () => {
      const box = root.querySelector<HTMLElement>(".cds--multi-select");
      if (!box) return;
      const available = box.getBoundingClientRect().width - 46;
      const required = measure.scrollWidth;
      setCompact(required > available + 0.5);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [selectedSources]);

  return (
    <div ref={rootRef} className={`storybook-source-control storybook-multiselect-shell${compact ? " is-compact" : ""}`}>
      <MultiSelect
        id="storybook-source-filter"
        titleText="组件来源"
        label={selectedSources.length > 0 ? "" : "（可多选）"}
        items={sources}
        itemToString={(item) => firstWord(item?.name || "")}
        selectedItems={selectedSources}
        onChange={({ selectedItems }) => onChange((selectedItems || []).map((source) => source.id))}
      />
      <div className="storybook-selected-source-tags" aria-label="已选组件来源">
        {selectedSources.map((source) => (
          <DismissibleTag
            key={source.id}
            size="sm"
            type="high-contrast"
            text={firstWord(source.name)}
            title="移除来源"
            dismissTooltipLabel="移除来源"
            onClose={() => onChange(selectedSources.filter((item) => item.id !== source.id).map((item) => item.id))}
          />
        ))}
      </div>
      {compact && <span className="storybook-source-count-tag" aria-label={`已选择 ${selectedSources.length} 个组件来源`}>{selectedSources.length} ×</span>}
      <div ref={measureRef} className="storybook-source-tags-measure" aria-hidden="true">
        {selectedSources.map((source) => <span key={source.id}>{firstWord(source.name)} ×</span>)}
      </div>
    </div>
  );
}
