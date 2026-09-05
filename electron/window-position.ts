export type Point = { x: number; y: number };
export type WorkArea = Point & { width: number; height: number };

export const BAR_SIZE = { width: 452, height: 64 } as const;
const barMargin = { right: 24, bottom: 32 } as const;

function overlapArea(position: Point, workArea: WorkArea) {
  const left = Math.max(position.x, workArea.x);
  const top = Math.max(position.y, workArea.y);
  const right = Math.min(
    position.x + BAR_SIZE.width,
    workArea.x + workArea.width,
  );
  const bottom = Math.min(
    position.y + BAR_SIZE.height,
    workArea.y + workArea.height,
  );
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function distanceToWorkArea(position: Point, workArea: WorkArea) {
  const centerX = position.x + BAR_SIZE.width / 2;
  const centerY = position.y + BAR_SIZE.height / 2;
  const dx = Math.max(
    workArea.x - centerX,
    0,
    centerX - (workArea.x + workArea.width),
  );
  const dy = Math.max(
    workArea.y - centerY,
    0,
    centerY - (workArea.y + workArea.height),
  );
  return dx * dx + dy * dy;
}

function nearestWorkArea(position: Point, workAreas: WorkArea[]) {
  return workAreas.reduce((best, candidate) => {
    const candidateOverlap = overlapArea(position, candidate);
    const bestOverlap = overlapArea(position, best);
    if (candidateOverlap !== bestOverlap)
      return candidateOverlap > bestOverlap ? candidate : best;
    return distanceToWorkArea(position, candidate) <
      distanceToWorkArea(position, best)
      ? candidate
      : best;
  });
}

function clampToWorkArea(position: Point, workArea: WorkArea) {
  const maxX = Math.max(
    workArea.x,
    workArea.x + workArea.width - BAR_SIZE.width,
  );
  const maxY = Math.max(
    workArea.y,
    workArea.y + workArea.height - BAR_SIZE.height,
  );
  return {
    x: Math.max(workArea.x, Math.min(position.x, maxX)),
    y: Math.max(workArea.y, Math.min(position.y, maxY)),
  };
}

export function resolveBarPosition({
  saved,
  primaryWorkArea,
  workAreas,
}: {
  saved?: Point;
  primaryWorkArea: WorkArea;
  workAreas: WorkArea[];
}) {
  const hasSavedPosition =
    Number.isFinite(saved?.x) && Number.isFinite(saved?.y);
  if (!hasSavedPosition) {
    return clampToWorkArea(
      {
        x:
          primaryWorkArea.x +
          primaryWorkArea.width -
          BAR_SIZE.width -
          barMargin.right,
        y:
          primaryWorkArea.y +
          primaryWorkArea.height -
          BAR_SIZE.height -
          barMargin.bottom,
      },
      primaryWorkArea,
    );
  }
  const position = saved as Point;
  const availableWorkAreas = workAreas.length ? workAreas : [primaryWorkArea];
  return clampToWorkArea(
    position,
    nearestWorkArea(position, availableWorkAreas),
  );
}
