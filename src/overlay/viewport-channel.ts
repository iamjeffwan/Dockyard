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

type FrameHandle =
  | { kind: "raf"; id: number }
  | { kind: "timeout"; id: ReturnType<typeof globalThis.setTimeout> };

function scheduleFrame(callback: () => void) {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    return { kind: "raf" as const, id: window.requestAnimationFrame(callback) };
  }
  return { kind: "timeout" as const, id: globalThis.setTimeout(callback, 16) };
}

function cancelFrame(frame: FrameHandle) {
  if (frame.kind === "raf" && typeof window !== "undefined") {
    window.cancelAnimationFrame(frame.id);
  } else {
    globalThis.clearTimeout(frame.id);
  }
}

export function createViewportChannel(initial: ViewportSnapshot): ViewportChannel {
  let latest = initial;
  let frame: FrameHandle | null = null;
  const listeners = new Set<() => void>();

  const flush = () => {
    frame = null;
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot: () => latest,
    publish: (snapshot) => {
      latest = snapshot;
      if (frame) return;
      frame = scheduleFrame(flush);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: () => {
      if (frame) cancelFrame(frame);
      frame = null;
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
