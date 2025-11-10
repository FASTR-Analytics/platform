// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export function generateEvenTicks(
  count: number,
  min: number,
  max: number,
): number[] {
  if (count < 2) return [];
  return Array.from(
    { length: count },
    (_, i) => min + (i / (count - 1)) * (max - min),
  );
}

export function generateMinorsBetweenMajors(
  majors: number[],
  minorCount: number,
): number[] {
  const minors: number[] = [];
  for (let i = 0; i < majors.length - 1; i++) {
    const start = majors[i];
    const end = majors[i + 1];
    for (let j = 1; j <= minorCount; j++) {
      minors.push(start + (j / (minorCount + 1)) * (end - start));
    }
  }
  return minors;
}

export function tickPosition(value: number, min: number, max: number): number {
  if (max === min) return 0;
  const pos = ((value - min) / (max - min)) * 100;
  return Math.round(pos * 100) / 100;
}

export function removeDuplicates(values: number[]): number[] {
  return Array.from(new Set(values));
}
