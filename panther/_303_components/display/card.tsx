// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createMemo, type JSX, Match, Show, Switch } from "solid-js";

// Clickable cards signal at the frame, not the fill: a card is a container of
// arbitrary content, so repainting its ground on hover reads badly. The
// selected pin stays distinguishable from hover because only selection
// carries the wash. The clickable variant stays a <div> (role="button" +
// keyboard wiring, as frames.tsx collapsed panes) — a <button> permits only
// phrasing content, and a card body is flow content.
const BORDER_TRANSITION = {
  transition: "border-color var(--ui-dur-fast) var(--ui-ease)",
};

type CardProps = {
  children: JSX.Element;
  header?: string | JSX.Element;
  headerRight?: JSX.Element;
  footer?: JSX.Element;
  pad?: "sm" | "md" | "none";
  shaded?: boolean;
  selected?: boolean;
  onClick?: () => void;
  // Positioning only (width/grid/margin) — never skin overrides.
  class?: string;
};

export function Card(p: CardProps) {
  // A JSX-element prop re-instantiates on every read; memo it so the header
  // fork below reads one instance.
  const header = createMemo(() => p.header);

  // pad governs the body; header/footer rows keep their structural padding
  // even at pad="none".
  const rowPad = () => (p.pad === "sm" ? "ui-pad-sm" : "ui-pad");

  const bodyPad = () => {
    const pad = p.pad ?? "md";
    return pad === "none" ? "" : pad === "sm" ? "ui-pad-sm" : "ui-pad";
  };

  // Actions in headerRight/footer must not also fire the card's onClick.
  const stopWhenClickable = (evt: MouseEvent) => {
    if (p.onClick) {
      evt.stopPropagation();
    }
  };

  return (
    <div
      class={["rounded border", p.class].filter(Boolean).join(" ")}
      classList={{
        "border-primary bg-primary-subtle": !!p.selected,
        "bg-base-200": !p.selected && !!p.shaded,
        "bg-base-100": !p.selected && !p.shaded,
        "ui-focusable cursor-pointer": !!p.onClick,
        "hover:border-primary": !p.selected && !!p.onClick,
      }}
      style={BORDER_TRANSITION}
      role={p.onClick ? "button" : undefined}
      tabindex={p.onClick ? "0" : undefined}
      aria-pressed={p.onClick && p.selected !== undefined
        ? p.selected
        : undefined}
      onClick={() => p.onClick?.()}
      onKeyDown={(evt) => {
        if (
          p.onClick &&
          evt.target === evt.currentTarget &&
          (evt.key === "Enter" || evt.key === " ")
        ) {
          evt.preventDefault();
          p.onClick();
        }
      }}
    >
      <Show when={header() !== undefined || p.headerRight !== undefined}>
        <div class={`${rowPad()} flex items-center gap-2 border-b`}>
          <div class="min-w-0 flex-1">
            <Switch>
              <Match when={typeof header() === "string"}>
                <div class="ui-text-heading">{header()}</div>
              </Match>
              <Match when={typeof header() !== "string"}>{header()}</Match>
            </Switch>
          </div>
          <Show when={p.headerRight} keyed>
            {(keyedHeaderRight) => (
              <div class="flex-none" onClick={stopWhenClickable}>
                {keyedHeaderRight}
              </div>
            )}
          </Show>
        </div>
      </Show>
      <div class={bodyPad()}>{p.children}</div>
      <Show when={p.footer} keyed>
        {(keyedFooter) => (
          <div class={`${rowPad()} border-t`} onClick={stopWhenClickable}>
            {keyedFooter}
          </div>
        )}
      </Show>
    </div>
  );
}
