// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { JSX } from "solid-js";

export type SelectionCircleProps = {
  isSelected: boolean;
  onClick: (e: MouseEvent) => void;
};

export function SelectionCircle(p: SelectionCircleProps): JSX.Element {
  return (
    <div
      class="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full opacity-0 group-hover:opacity-100"
      classList={{
        "bg-primary text-primary-content opacity-100": p.isSelected,
        "border border-base-300 bg-transparent hover:bg-base-300 hover:text-white [&:not(:hover)]:text-transparent":
          !p.isSelected,
      }}
      onClick={p.onClick}
    >
      <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
        <path
          fill-rule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clip-rule="evenodd"
        />
      </svg>
    </div>
  );
}
