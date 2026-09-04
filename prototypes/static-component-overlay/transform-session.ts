export type ComponentGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type TransformKind = "move" | "resize" | "rotate";

type Point = { x: number; y: number };

export type TransformSession = {
  kind: TransformKind;
  pointerStart: Point;
  initial: ComponentGeometry;
  current: ComponentGeometry;
  center?: Point;
};

export function beginTransformSession(
  kind: TransformKind,
  initial: ComponentGeometry,
  pointerStart: Point,
  center?: Point,
): TransformSession {
  return {
    kind,
    pointerStart: { ...pointerStart },
    initial: { ...initial },
    current: { ...initial },
    center: center ? { ...center } : undefined,
  };
}

export function updateTransformSession(
  session: TransformSession,
  pointer: Point,
  options: { zoom: number; snapRotation?: boolean },
): ComponentGeometry {
  const zoom = Math.max(0.01, options.zoom);
  const dx = (pointer.x - session.pointerStart.x) / zoom;
  const dy = (pointer.y - session.pointerStart.y) / zoom;
  let next = session.current;

  if (session.kind === "move") {
    next = { ...session.initial, x: session.initial.x + dx, y: session.initial.y + dy };
  } else if (session.kind === "resize") {
    next = {
      ...session.initial,
      width: Math.max(24, session.initial.width + dx),
      height: Math.max(24, session.initial.height + dy),
    };
  } else if (session.center) {
    const rotation = Math.atan2(pointer.y - session.center.y, pointer.x - session.center.x) + Math.PI / 2;
    next = {
      ...session.initial,
      rotation: options.snapRotation
        ? Math.round(rotation / (Math.PI / 12)) * (Math.PI / 12)
        : rotation,
    };
  }

  session.current = next;
  return next;
}
