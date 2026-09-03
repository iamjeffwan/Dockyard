import type { ComponentInstance } from "../types.js";

export function storyBoundsCacheKey(item: Pick<ComponentInstance, "id" | "sourceId" | "storyId" | "storyUrl" | "version">) {
  return [item.sourceId || "", item.storyId || item.id || "", item.storyUrl || "", item.version || ""].join("::");
}

export function hasReusableStoryBounds(item: ComponentInstance) {
  return item.boundsSource !== undefined && item.boundsSource !== "fallback"
    && item.boundsCacheKey === storyBoundsCacheKey(item)
    && Number(item.intrinsicWidth) > 0
    && Number(item.intrinsicHeight) > 0
    && Number(item.frameViewportWidth) > 0
    && Number(item.frameViewportHeight) > 0;
}
