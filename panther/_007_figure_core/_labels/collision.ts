// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Pure box arithmetic over label rectangles — no figure knowledge. Shared by
// every figure that places labels (map regions, pie slices).
export type CollisionLabel = {
  naturalX: number;
  naturalY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  // Where this label should stack, when that is not its own natural Y — the
  // sort key AND the position the greedy starts it from. Absent, which it is
  // for every caller that has not opted in, leaves both exactly `naturalY`, so
  // the stack is bit-for-bit what it always was.
  //
  // A caller supplies this to CHOOSE the order. Sorting by natural Y only
  // guarantees non-crossing leaders when the anchors share an x — true of a
  // pie's slices, false of a map's regions (DOC_FIGURE_ARCHITECTURE, "Outside
  // placement"). It has to displace the natural Y rather than merely re-sort
  // against it: leaving `naturalY` as
  // the greedy's floor means a label handed a slot ABOVE its own anchor cannot
  // take it, so the column grows taller than the one it replaced and the
  // content shrinks to make room. Measured on Kenya adm1 at 47 labels: the map
  // lost 5% of its width to a re-order that was supposed to be free.
  stackY?: number;
};

// Outside labels: sort by natural Y, push down greedily, then shift the whole
// stack back up if it overflows the band.
export function resolveOutsideCollisions(
  labels: CollisionLabel[],
  bounds: { minY: number; maxY: number },
  gap: number,
): void {
  if (labels.length === 0) return;

  const wants = (label: CollisionLabel) => label.stackY ?? label.naturalY;
  labels.sort((a, b) => wants(a) - wants(b));

  let occupiedUntilY = bounds.minY;
  for (const label of labels) {
    label.y = Math.max(wants(label), occupiedUntilY);
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

// Inside labels: iterative 2-D push-apart, clamped to a maximum displacement
// from each label's natural anchor.
export function resolveInsideCollisions(
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
