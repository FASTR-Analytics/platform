// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createUniqueId, For, type JSX, Show } from "solid-js";
import type { PopoverPosition } from "../special_state/popover_menu.tsx";

export type ColorSetName = "standard" | "pastels" | "vivid" | "grays";

export const COLOR_SETS: Record<ColorSetName, string[]> = {
  standard: [
    "#e3f2fd",
    "#90caf9",
    "#42a5f5",
    "#1e88e5",
    "#1565c0",
    "#0d47a1",
    "#ffcdd2",
    "#ef9a9a",
    "#ef5350",
    "#e53935",
    "#ff7043",
    "#ff9800",
    "#c8e6c9",
    "#81c784",
    "#4caf50",
    "#2e7d32",
    "#ffee58",
    "#fdd835",
    "#e1bee7",
    "#ab47bc",
    "#7b1fa2",
    "#9e9e9e",
    "#424242",
    "#000000",
  ],
  pastels: [
    "#e8f4f8",
    "#b3e0f2",
    "#87ceeb",
    "#add8e6",
    "#b0c4de",
    "#a7c7e7",
    "#ffe4e1",
    "#ffb6c1",
    "#f4a6a6",
    "#f8b4b4",
    "#ffcba4",
    "#ffd1a4",
    "#e8f5e9",
    "#c8e6c9",
    "#a8d5a2",
    "#b5d99c",
    "#fff9c4",
    "#fff59d",
    "#f3e5f5",
    "#e1bee7",
    "#ce93d8",
    "#e0e0e0",
    "#bdbdbd",
    "#9e9e9e",
  ],
  vivid: [
    "#00bcd4",
    "#00acc1",
    "#0097a7",
    "#2196f3",
    "#1976d2",
    "#0d47a1",
    "#f44336",
    "#e91e63",
    "#d32f2f",
    "#c62828",
    "#ff5722",
    "#ff9100",
    "#4caf50",
    "#43a047",
    "#2e7d32",
    "#00c853",
    "#ffeb3b",
    "#ffc107",
    "#9c27b0",
    "#7b1fa2",
    "#6a1b9a",
    "#673ab7",
    "#212121",
    "#000000",
  ],
  grays: [
    "#ffffff",
    "#fafafa",
    "#f5f5f5",
    "#eeeeee",
    "#e0e0e0",
    "#d6d6d6",
    "#cccccc",
    "#bdbdbd",
    "#b0b0b0",
    "#a3a3a3",
    "#9e9e9e",
    "#8a8a8a",
    "#757575",
    "#666666",
    "#5c5c5c",
    "#525252",
    "#424242",
    "#3d3d3d",
    "#333333",
    "#292929",
    "#212121",
    "#1a1a1a",
    "#121212",
    "#000000",
  ],
};

export type ColorPickerProps = {
  value: string;
  onChange: (color: string) => void;
  colors?: string[];
  colorSet?: ColorSetName;
  position?: PopoverPosition;
  disabled?: boolean;
  size?: "default" | "sm";
  fullWidth?: boolean;
  label?: string;
};

const POSITION_STYLE: Record<
  PopoverPosition,
  { top?: string; bottom?: string; left?: string; right?: string }
> = {
  "bottom-start": { top: "anchor(bottom)", left: "anchor(left)" },
  bottom: { top: "anchor(bottom)", left: "anchor(center)" },
  "bottom-end": { top: "anchor(bottom)", right: "anchor(right)" },
  "top-start": { bottom: "anchor(top)", left: "anchor(left)" },
  top: { bottom: "anchor(top)", left: "anchor(center)" },
  "top-end": { bottom: "anchor(top)", right: "anchor(right)" },
  left: { top: "anchor(center)", right: "anchor(left)" },
  right: { top: "anchor(center)", left: "anchor(right)" },
};

export function ColorPicker(props: ColorPickerProps) {
  const id = createUniqueId();
  const popoverId = `color-picker-${id}`;
  const anchorName = `--color-picker-anchor-${id}`;
  let popoverRef: HTMLDivElement | undefined;

  function handleColorSelect(color: string) {
    props.onChange(color);
    popoverRef?.hidePopover();
  }

  const colors = () => props.colors ?? COLOR_SETS[props.colorSet ?? "standard"];
  const position = () => props.position ?? "bottom-start";
  const padClass = () => props.size === "sm" ? "ui-form-pad-sm" : "ui-form-pad";
  const textSizeClass = () =>
    props.size === "sm" ? "ui-form-text-size-sm" : "ui-form-text-size";

  return (
    <div>
      <Show when={props.label}>
        <label class="ui-label">{props.label}</label>
      </Show>
      <button
        type="button"
        class={`ui-hoverable rounded border ${padClass()}`}
        classList={{ "w-full": props.fullWidth, block: !!props.label }}
        style={{
          "anchor-name": anchorName,
          "background-color": props.value,
          "border-color": props.value,
        } as JSX.CSSProperties}
        disabled={props.disabled}
        title={props.value}
        // @ts-ignore - popovertarget is valid HTML
        popovertarget={popoverId}
      >
        <span
          class={`block ${textSizeClass()}`}
          classList={{
            "h-[1.25em] w-12": !props.fullWidth,
            "h-[1.25em]": props.fullWidth,
          }}
        />
      </button>
      <div
        ref={popoverRef}
        id={popoverId}
        // @ts-ignore - popover is valid HTML
        popover
        style={{
          position: "absolute",
          "position-anchor": anchorName,
          margin: "6px",
          background: "transparent",
          border: "none",
          padding: "0",
          ...POSITION_STYLE[position()],
        } as JSX.CSSProperties}
      >
        <div class="bg-base-100 grid grid-cols-6 gap-1 overflow-hidden rounded-md border p-2 shadow-lg">
          <For each={colors()}>
            {(color) => (
              <button
                type="button"
                class="ui-hoverable h-6 w-6 rounded-sm border border-black/10"
                style={{ "background-color": color }}
                onClick={() => handleColorSelect(color)}
                title={color}
              />
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
