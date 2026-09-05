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
): TransformSession;

export function updateTransformSession(
  session: TransformSession,
  pointer: Point,
  options: { zoom: number; snapRotation?: boolean },
): ComponentGeometry;
