export type ViewportSnapshot = {
  zoom: number;
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
};

export interface ViewportChannel {
  getSnapshot(): ViewportSnapshot;
  publish(snapshot: ViewportSnapshot): void;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export function createViewportChannel(initial: ViewportSnapshot): ViewportChannel {
  let latest = initial;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => latest,
    publish: (snapshot) => {
      latest = snapshot;
      // iframe 运行页需要与原生画板使用同一帧视口数据；
      // 视觉状态由订阅方自行合并，通道本身不再额外等待一帧。
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: () => {
      listeners.clear();
    },
  };
}

export function viewportFromAppState(
  appState: { zoom?: unknown; scrollX?: unknown; scrollY?: unknown },
  bounds: { width: number; height: number },
): ViewportSnapshot {
  const zoomValue = appState.zoom as { value?: unknown } | number | undefined;
  const zoom = Number(typeof zoomValue === "object" && zoomValue !== null ? zoomValue.value : zoomValue);
  return {
    zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 1,
    scrollX: Number.isFinite(Number(appState.scrollX)) ? Number(appState.scrollX) : 0,
    scrollY: Number.isFinite(Number(appState.scrollY)) ? Number(appState.scrollY) : 0,
    width: Math.max(0, bounds.width),
    height: Math.max(0, bounds.height),
  };
}
