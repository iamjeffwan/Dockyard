export type OverlayViewport = { zoom: number; scrollX: number; scrollY: number };

export type DragMode = "move" | "resize" | "rotate";

export type DragSession = {
  id: string;
  mode: DragMode;
  corner?: "nw" | "ne" | "sw" | "se";
  startX: number;
  startY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export function resizeFromCorner(session: DragSession, dx: number, dy: number) {
  const left = session.corner?.includes("w");
  const top = session.corner?.includes("n");
  const width = Math.max(48, session.width + (left ? -dx : dx));
  const height = Math.max(36, session.height + (top ? -dy : dy));
  return {
    x: left ? session.x + (session.width - width) : session.x,
    y: top ? session.y + (session.height - height) : session.y,
    width,
    height,
  };
}

export function snapRotation(angle: number, shiftPressed: boolean) {
  return shiftPressed ? Math.round(angle / (Math.PI / 12)) * (Math.PI / 12) : angle;
}
