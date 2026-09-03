import type { StorybookSource, StorybookStory } from "../types.js";

export type StorybookSourceGroup = {
  sourceId: string;
  sourceName: string;
  categories: Array<[string, StorybookStory[]]>;
};

export function groupStoriesBySource(
  sources: StorybookSource[],
  selectedSourceIds: string[],
  storyGroups: Array<[string, StorybookStory[]]>,
): StorybookSourceGroup[] {
  const groupMap = new Map<string, Map<string, StorybookStory[]>>();
  for (const [title, stories] of storyGroups) {
    for (const story of stories) {
      const sourceId = story.sourceId;
      if (!sourceId) continue;
      const categories = groupMap.get(sourceId) || new Map<string, StorybookStory[]>();
      categories.set(title, [...(categories.get(title) || []), story]);
      groupMap.set(sourceId, categories);
    }
  }

  return sources
    .filter((source) => selectedSourceIds.includes(source.id))
    .map((source) => {
      const categories = groupMap.get(source.id);
      return {
        sourceId: source.id,
        sourceName: source.name,
        categories: categories
          ? [...categories.entries()].sort(([a], [b]) => a.localeCompare(b))
          : [],
      };
    })
    .filter((group) => group.categories.length > 0);
}
