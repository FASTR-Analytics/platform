// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { JSX } from "solid-js";
import { t3 } from "../deps.ts";

export type SelectionCircleProps = {
  isSelected: boolean;
  // Mouse passes the MouseEvent so selection controllers can read modifiers;
  // keyboard toggling passes nothing (a plain toggle).
  onClick: (evt?: MouseEvent) => void;
};

// The multi-select marking circle. Hidden until its `group/card` parent is
// hovered (or the circle itself is focused); always visible when selected.
// Owns its propagation guard: a circle interaction must never also fire the
// card's own click.
export function SelectionCircle(p: SelectionCircleProps): JSX.Element {
  return (
    <div
      class="ui-focusable absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full opacity-0 focus-visible:opacity-100 group-hover/card:opacity-100"
      classList={{
        // Selected: a solid primary fill takes its own intent's states.
        "ui-hoverable-primary text-primary-content opacity-100": p.isSelected,
        // Unselected: an opaque quiet interactive of the card surface; the
        // check previews in muted on hover.
        "ui-hoverable-base-100 border text-transparent hover:text-base-content-muted":
          !p.isSelected,
      }}
      role="checkbox"
      aria-checked={p.isSelected}
      aria-label={t3({
        en: "Select",
        fr: "Sélectionner",
        pt: "Selecionar",
      })}
      tabindex="0"
      onClick={(evt) => {
        evt.stopPropagation();
        p.onClick(evt);
      }}
      onKeyDown={(evt) => {
        if (evt.key === " ") {
          evt.preventDefault();
          evt.stopPropagation();
          p.onClick();
        }
      }}
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
