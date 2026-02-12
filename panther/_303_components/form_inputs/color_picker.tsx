// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createUniqueId, For, type JSX, Show } from "solid-js";
import { Color } from "../deps.ts";
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
    "#4e342e",
    "#e0e0e0",
    "#bdbdbd",
    "#9e9e9e",
    "#757575",
    "#424242",
    "#212121",
    "#ffffff",
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
    "#d7ccc8",
    "#f5f5f5",
    "#e0e0e0",
    "#d6d6d6",
    "#c0c0c0",
    "#bdbdbd",
    "#9e9e9e",
    "#ffffff",
    "#000000",
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
    "#9e9e9e",
    "#757575",
    "#546e7a",
    "#37474f",
    "#424242",
    "#212121",
    "#ffffff",
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
    "#0a0a0a",
    "#050505",
    "#000000",
    "#f8f0e3",
    "#d2c4b0",
    "#a69280",
    "#6d5c50",
  ],
};

export type ColorPickerProps = {
  value: string;
  onChange: (color: string) => void;
  colors?: string[];
  colorSet?: ColorSetName;
  extraColors?: string[];
  position?: PopoverPosition;
  disabled?: boolean;
  size?: "default" | "sm";
  fullWidth?: boolean;
  label?: string;
  showCheckeredBackground?: boolean;
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

function ColorSwatch(props: {
  color: string;
  selected: boolean;
  onClick: (color: string) => void;
}) {
  const checkColor = () =>
    new Color(props.color).isLight() ? "#000000" : "#ffffff";

  return (
    <button
      type="button"
      class="ui-hoverable relative h-6 w-6 rounded-sm border border-black/10"
      style={{ "background-color": props.color }}
      onClick={() => props.onClick(props.color)}
      title={props.color}
    >
      <Show when={props.selected}>
        <svg
          class="absolute inset-0 m-auto h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke={checkColor()}
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </Show>
    </button>
  );
}

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
  const padClass = () => (props.size === "sm" ? "ui-form-pad-sm" : "p-1.5");
  const textSizeClass = () =>
    props.size === "sm" ? "ui-form-text-size-sm" : "ui-form-text-size";

  return (
    <div>
      <Show when={props.label}>
        <label class="ui-label">{props.label}</label>
      </Show>
      <button
        type="button"
        class={`ui-hoverable border-base-300 rounded border ${padClass()}`}
        classList={{ "w-full": props.fullWidth, block: !!props.label }}
        style={{
          "anchor-name": anchorName,
          "background-image":
            "repeating-conic-gradient(#f0f0f0 0% 25%, white 0% 50%)",
          "background-size": "16px 16px",
        } as JSX.CSSProperties}
        disabled={props.disabled}
        title={props.value}
        // @ts-ignore - popovertarget is valid HTML
        popovertarget={popoverId}
      >
        <span
          class={`block rounded ${textSizeClass()}`}
          classList={{
            "h-[1.25em] w-12": !props.fullWidth,
            "h-[1.25em]": props.fullWidth,
          }}
          style={{ "background-color": props.value }}
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
        <div class="bg-base-100 overflow-hidden rounded-md border p-2 shadow-lg">
          <div class="grid grid-cols-6 gap-1">
            <For each={colors()}>
              {(color) => (
                <ColorSwatch
                  color={color}
                  selected={props.value != null &&
                    color.toLowerCase() === props.value.toLowerCase()}
                  onClick={handleColorSelect}
                />
              )}
            </For>
          </div>
          <Show when={props.extraColors && props.extraColors.length > 0}>
            <div class="border-base-300 my-1.5 border-t" />
            <div class="grid grid-cols-6 gap-1">
              <For each={props.extraColors}>
                {(color) => (
                  <ColorSwatch
                    color={color}
                    selected={props.value != null &&
                      color.toLowerCase() === props.value.toLowerCase()}
                    onClick={handleColorSelect}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
