import { DismissibleTag, MultiSelect } from "@carbon/react";
import type { StorybookSource } from "../types";

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
  return (
    <div className="storybook-source-control storybook-multiselect-shell">
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
    </div>
  );
}
