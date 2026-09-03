import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const footerActionsSelector = ".excalidraw .layer-ui__wrapper__footer-right > div";

export function ExcalidrawFooterPortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const findTarget = () => {
      const next = document.querySelector<HTMLElement>(footerActionsSelector);
      if (next === targetRef.current) return;
      targetRef.current?.classList.remove("dockyard-footer-actions-host");
      next?.classList.add("dockyard-footer-actions-host");
      targetRef.current = next;
      setTarget(next);
    };

    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      targetRef.current?.classList.remove("dockyard-footer-actions-host");
      targetRef.current = null;
    };
  }, []);

  return target ? createPortal(children, target) : null;
}
