import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./overlay-portal.css";

const canvasSelector = ".excalidraw-wrap > .excalidraw";
const hostAttribute = "data-dockyard-overlay-host";

function installHost(canvas: HTMLElement) {
  const existing = canvas.querySelector<HTMLElement>(`:scope > [${hostAttribute}]`);
  if (existing) return existing;
  const host = document.createElement("div");
  host.setAttribute(hostAttribute, "");
  host.className = "dockyard-overlay-host";
  canvas.append(host);
  return host;
}

export function ExcalidrawOverlayPortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    let current: HTMLElement | null = null;
    const findTarget = () => {
      const canvas = document.querySelector<HTMLElement>(canvasSelector);
      const next = canvas ? installHost(canvas) : null;
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

  return target ? createPortal(children, target) : null;
}
