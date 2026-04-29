// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type CollisionLabel = {
  naturalX: number;
  naturalY: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export function resolveCalloutCollisions(
  labels: CollisionLabel[],
  bounds: { minY: number; maxY: number },
  gap: number,
): void {
  if (labels.length === 0) return;

  labels.sort((a, b) => a.naturalY - b.naturalY);

  let occupiedUntilY = bounds.minY;
  for (const label of labels) {
    label.y = Math.max(label.naturalY, occupiedUntilY);
    occupiedUntilY = label.y + label.height + gap;
  }

  const lastLabel = labels[labels.length - 1];
  const overflow = lastLabel.y + lastLabel.height - bounds.maxY;

  if (overflow > 0) {
    for (const label of labels) {
      label.y -= overflow;
    }
    const underflow = bounds.minY - labels[0].y;
    if (underflow > 0) {
      for (const label of labels) {
        label.y += underflow;
      }
    }
  }
}

export function resolveCentroidCollisions(
  labels: CollisionLabel[],
  maxIterations: number,
  maxDisplacement: number,
): void {
  if (labels.length < 2) return;

  for (let iter = 0; iter < maxIterations; iter++) {
    let moved = false;

    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i];
        const b = labels[j];

        const overlapX = Math.min(
          a.x + a.width / 2,
          b.x + b.width / 2,
        ) - Math.max(
          a.x - a.width / 2,
          b.x - b.width / 2,
        );
        const overlapY = Math.min(
          a.y + a.height / 2,
          b.y + b.height / 2,
        ) - Math.max(
          a.y - a.height / 2,
          b.y - b.height / 2,
        );

        if (overlapX > 0 && overlapY > 0) {
          const pushX = overlapX < overlapY;
          const pushAmount = (pushX ? overlapX : overlapY) / 2 + 1;

          if (pushX) {
            const dir = a.x < b.x ? -1 : 1;
            a.x += dir * pushAmount;
            b.x -= dir * pushAmount;
          } else {
            const dir = a.y < b.y ? -1 : 1;
            a.y += dir * pushAmount;
            b.y -= dir * pushAmount;
          }
          moved = true;
        }
      }
    }

    for (const label of labels) {
      const dx = label.x - label.naturalX;
      const dy = label.y - label.naturalY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxDisplacement) {
        const scale = maxDisplacement / dist;
        label.x = label.naturalX + dx * scale;
        label.y = label.naturalY + dy * scale;
      }
    }

    if (!moved) break;
  }
}
