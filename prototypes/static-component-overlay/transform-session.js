export function beginTransformSession(kind, initial, pointerStart, center) {
  return {
    kind,
    pointerStart: { ...pointerStart },
    initial: { ...initial },
    current: { ...initial },
    center: center ? { ...center } : undefined,
  };
}

export function updateTransformSession(session, pointer, options) {
  const zoom = Math.max(0.01, options.zoom);
  const dx = (pointer.x - session.pointerStart.x) / zoom;
  const dy = (pointer.y - session.pointerStart.y) / zoom;
  let next = session.current;

  if (session.kind === "move") {
    next = { ...session.initial, x: session.initial.x + dx, y: session.initial.y + dy };
  } else if (session.kind === "resize") {
    const cos = Math.cos(session.initial.rotation);
    const sin = Math.sin(session.initial.rotation);
    const localDx = dx * cos + dy * sin;
    const localDy = -dx * sin + dy * cos;
    next = {
      ...session.initial,
      width: Math.max(24, session.initial.width + localDx),
      height: Math.max(24, session.initial.height + localDy),
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
