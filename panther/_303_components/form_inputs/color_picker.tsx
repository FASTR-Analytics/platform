// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, createUniqueId, For, type JSX, Show } from "solid-js";
import { Color } from "../deps.ts";
import type { PopoverPosition } from "../special_state/popover_menu.tsx";

export type ColorSetName =
  | "standard"
  | "pastels"
  | "vivid"
  | "grays"
  | "tailwind"
  | "slideBackgrounds";

// Low-saturation colors optimized for slide/presentation backgrounds
// Light variants: ~92-95% luminance, ~25-35% saturation (visible hue, still muted)
// Dark variants: ~18-25% luminance, ~30-40% saturation (visible hue, still muted)
// Based on research: backgrounds should stay under 40% saturation for professional presentations
export const SLIDE_BACKGROUND_COLORS: string[][] = [
  // Cool gray (hue 220)
  ["#eef1f5", "#dde3eb", "#2d3444", "#1f2530"],
  // Warm gray (hue 35)
  ["#f5f3ef", "#ebe6dd", "#44392d", "#302820"],
  // Slate (hue 210)
  ["#edf2f7", "#dce5f0", "#2c3a4d", "#1e2836"],
  // Rose (hue 350)
  ["#f7eef1", "#f0dde3", "#4d2c36", "#361e25"],
  // Red (hue 5)
  ["#f7efee", "#f0dfdc", "#4d2f2c", "#36201e"],
  // Orange (hue 25)
  ["#f7f1ee", "#f0e3dc", "#4d382c", "#36271e"],
  // Amber (hue 40)
  ["#f7f4ee", "#f0e8dc", "#4d422c", "#362f1e"],
  // Yellow (hue 50)
  ["#f6f5ed", "#edead9", "#4a4728", "#33321c"],
  // Lime (hue 85)
  ["#f2f6ed", "#e4edd9", "#3d4a28", "#2a331c"],
  // Green (hue 145)
  ["#edf6f0", "#d9eddf", "#284a32", "#1c3323"],
  // Teal (hue 175)
  ["#edf5f4", "#d9ede9", "#284a45", "#1c3330"],
  // Cyan (hue 195)
  ["#edf4f6", "#d9eaed", "#28444a", "#1c3033"],
  // Blue (hue 220)
  ["#eef1f7", "#dce4f0", "#2c384d", "#1e2636"],
  // Indigo (hue 245)
  ["#f0eff7", "#e0ddf0", "#322c4d", "#231e36"],
  // Violet (hue 270)
  ["#f2eff7", "#e5ddf0", "#3c2c4d", "#291e36"],
  // Purple (hue 290)
  ["#f5eff7", "#eaddf0", "#452c4d", "#301e36"],
];

export const TAILWIND_COLORS: string[][] = [
  // Slate
  ["#f8fafc", "#e2e8f0", "#94a3b8", "#475569", "#1e293b"],
  // Gray
  ["#f9fafb", "#e5e7eb", "#9ca3af", "#4b5563", "#111827"],
  // Zinc
  ["#fafafa", "#e4e4e7", "#a1a1aa", "#52525b", "#18181b"],
  // Red
  ["#fef2f2", "#fecaca", "#f87171", "#dc2626", "#7f1d1d"],
  // Orange
  ["#fff7ed", "#fed7aa", "#fb923c", "#ea580c", "#7c2d12"],
  // Amber
  ["#fffbeb", "#fde68a", "#fbbf24", "#d97706", "#78350f"],
  // Yellow
  ["#fefce8", "#fef08a", "#facc15", "#ca8a04", "#713f12"],
  // Lime
  ["#f7fee7", "#d9f99d", "#a3e635", "#65a30d", "#365314"],
  // Green
  ["#f0fdf4", "#bbf7d0", "#4ade80", "#16a34a", "#14532d"],
  // Emerald
  ["#ecfdf5", "#a7f3d0", "#34d399", "#059669", "#064e3b"],
  // Teal
  ["#f0fdfa", "#99f6e4", "#2dd4bf", "#0d9488", "#134e4a"],
  // Cyan
  ["#ecfeff", "#a5f3fc", "#22d3ee", "#0891b2", "#164e63"],
  // Sky
  ["#f0f9ff", "#bae6fd", "#38bdf8", "#0284c7", "#0c4a6e"],
  // Blue
  ["#eff6ff", "#bfdbfe", "#60a5fa", "#2563eb", "#1e3a8a"],
  // Indigo
  ["#eef2ff", "#c7d2fe", "#818cf8", "#4f46e5", "#312e81"],
  // Violet
  ["#f5f3ff", "#ddd6fe", "#a78bfa", "#7c3aed", "#4c1d95"],
  // Purple
  ["#faf5ff", "#e9d5ff", "#c084fc", "#9333ea", "#581c87"],
  // Fuchsia
  ["#fdf4ff", "#f5d0fe", "#e879f9", "#c026d3", "#701a75"],
  // Pink
  ["#fdf2f8", "#fbcfe8", "#f472b6", "#db2777", "#831843"],
  // Rose
  ["#fff1f2", "#fecdd3", "#fb7185", "#e11d48", "#881337"],
];

export const COLOR_SETS: Record<ColorSetName, string[]> = {
  tailwind: TAILWIND_COLORS.flat().concat(["#ffffff", "#000000"]),
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
  slideBackgrounds: SLIDE_BACKGROUND_COLORS.flat().concat(["#ffffff", "#000000"]),
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
  allowCustomHex?: boolean;
};

function isValidHex(hex: string): boolean {
  return /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex);
}

function normalizeHex(hex: string): string {
  let h = hex.trim();
  if (!h.startsWith("#")) {
    h = "#" + h;
  }
  if (h.length === 4) {
    h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  }
  return h.toLowerCase();
}


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

  const [hexInput, setHexInput] = createSignal<string | null>(null);

  function handleColorSelect(color: string) {
    props.onChange(color);
    popoverRef?.hidePopover();
  }

  function handleHexInput(value: string) {
    setHexInput(value);
    if (isValidHex(value)) {
      props.onChange(normalizeHex(value));
    }
  }

  const displayHex = () => hexInput() ?? props.value ?? "";
  const hexIsValid = () => {
    const h = hexInput();
    return h === null || h === "" || isValidHex(h);
  };

  const isTailwind = () => props.colorSet === "tailwind" && !props.colors;
  const isSlideBackgrounds = () => props.colorSet === "slideBackgrounds" && !props.colors;
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
        class="ui-popover"
        data-position={position()}
        style={{ "position-anchor": anchorName } as JSX.CSSProperties}
      >
        <div class="bg-base-100 overflow-hidden rounded-md border p-2 shadow-lg">
          <Show
            when={isTailwind() || isSlideBackgrounds()}
            fallback={
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
            }
          >
            <div class="flex gap-0.5">
              <For each={isTailwind() ? TAILWIND_COLORS : SLIDE_BACKGROUND_COLORS}>
                {(col) => (
                  <div class="flex flex-col gap-0.5">
                    <For each={col}>
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
                )}
              </For>
              <div class="flex flex-col gap-0.5">
                <ColorSwatch
                  color="#ffffff"
                  selected={props.value?.toLowerCase() === "#ffffff"}
                  onClick={handleColorSelect}
                />
                <ColorSwatch
                  color="#000000"
                  selected={props.value?.toLowerCase() === "#000000"}
                  onClick={handleColorSelect}
                />
              </div>
            </div>
          </Show>
          <Show when={props.extraColors && props.extraColors.length > 0}>
            <div class="border-base-300 my-1.5 border-t" />
            <div class="flex gap-1">
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
          <Show when={props.allowCustomHex}>
            <div class="border-base-300 my-1.5 border-t" />
            <input
              type="text"
              class="border-base-300 w-full rounded border px-2 py-1 font-mono text-xs"
              classList={{ "border-red-500": !hexIsValid() }}
              placeholder="#hex"
              value={displayHex()}
              onInput={(e) => handleHexInput(e.currentTarget.value)}
              onFocus={() => setHexInput(props.value ?? "")}
              onBlur={() => setHexInput(null)}
            />
          </Show>
        </div>
      </div>
    </div>
  );
}
