// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createMemo, type JSX, Match, Show, Switch } from "solid-js";
import { SelectionCircle } from "../list_selection/selection_circle.tsx";

// Clickable cards signal at the frame, not the fill: a card is a container of
// arbitrary content, so repainting its ground on hover reads badly. The
// selected pin stays distinguishable from hover because only selection
// carries the wash. The clickable variant stays a <div> (role="button" +
// keyboard wiring, as frames.tsx collapsed panes) — a <button> permits only
// phrasing content, and a card body is flow content. The link variant is a
// real <a> (Button's href arm is the precedent) so middle-click/new-tab/native
// keyboard behavior survive.
//
// Selection: `onSelectToggle` puts the card in multi-select marking mode — a
// SelectionCircle overlay (hover/focus-revealed via the group/card name), and
// selected renders border-only (no wash: these cards hold previews the wash
// would tint). The wash pin remains the single-choice accent-select look.
// Selection state stays controlled — pair with createSelectionController in
// app code (DOC_LIST_SELECTION); the circle owns its propagation guard.
const BORDER_TRANSITION = {
  transition: "border-color var(--ui-dur-fast) var(--ui-ease)",
};

type CardPropsBase = {
  children: JSX.Element;
  header?: string | JSX.Element;
  headerRight?: JSX.Element;
  footer?: JSX.Element;
  pad?: "sm" | "md" | "none";
  shaded?: boolean;
  selected?: boolean;
  onSelectToggle?: (evt?: MouseEvent) => void;
  onContextMenu?: (evt: MouseEvent) => void;
  // Positioning only (width/grid/margin) — never skin overrides. Interactive
  // cards size like any block: pass w-full / w-* here (never hardcoded).
  class?: string;
};

type CardPropsClickable = CardPropsBase & {
  onClick?: (evt?: MouseEvent) => void;
  href?: never;
};

type CardPropsLink = CardPropsBase & {
  href: string;
  onClick?: never;
};

type CardProps = CardPropsClickable | CardPropsLink;

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

  const interactive = () => !!p.onClick || p.href !== undefined;
  const washPinned = () => !!p.selected && p.onSelectToggle === undefined;

  // overflow-clip is enforced: flush content must not paint over the rounded
  // corners. Safe for every kit flyout — popovers/menus are top-layer
  // (Popover API) and tooltips are fixed, so ancestor clipping never cuts
  // them.
  const rootClass = (extra: string) =>
    ["overflow-clip rounded border", extra, p.class].filter(Boolean).join(" ");

  const rootClassList = () => ({
    "border-primary bg-primary-subtle": washPinned(),
    "border-primary": !!p.selected && !washPinned(),
    "bg-base-200": !washPinned() && !!p.shaded,
    "bg-base-100": !washPinned() && !p.shaded,
    "group/card relative": p.onSelectToggle !== undefined,
    "ui-focusable cursor-pointer": interactive(),
    "hover:border-primary": !p.selected && interactive(),
  });

  // Actions in headerRight/footer must not also fire the card. For the link
  // arm, any click inside the anchor navigates, so it needs preventDefault
  // too (accepted edge: this also cancels native defaults of controls placed
  // in those regions of a link card).
  const guardRegion = (evt: MouseEvent) => {
    if (interactive()) {
      evt.stopPropagation();
      if (p.href !== undefined) {
        evt.preventDefault();
      }
    }
  };

  const inner = () => (
    <>
      <Show when={p.onSelectToggle} keyed>
        {(keyedOnSelectToggle) => (
          <SelectionCircle
            isSelected={!!p.selected}
            onClick={keyedOnSelectToggle}
          />
        )}
      </Show>
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
              <div class="flex-none" onClick={guardRegion}>
                {keyedHeaderRight}
              </div>
            )}
          </Show>
        </div>
      </Show>
      <div class={bodyPad()}>{p.children}</div>
      <Show when={p.footer} keyed>
        {(keyedFooter) => (
          <div class={`${rowPad()} border-t`} onClick={guardRegion}>
            {keyedFooter}
          </div>
        )}
      </Show>
    </>
  );

  return (
    <Switch>
      <Match when={p.href !== undefined}>
        <a
          href={p.href}
          class={rootClass("block no-underline")}
          classList={rootClassList()}
          style={BORDER_TRANSITION}
          aria-current={p.selected ? "true" : undefined}
          onContextMenu={(evt) => p.onContextMenu?.(evt)}
        >
          {inner()}
        </a>
      </Match>
      <Match when={p.onClick !== undefined}>
        <div
          class={rootClass("")}
          classList={rootClassList()}
          style={BORDER_TRANSITION}
          role="button"
          tabindex="0"
          aria-pressed={p.selected !== undefined ? p.selected : undefined}
          onClick={(evt) => p.onClick?.(evt)}
          onContextMenu={(evt) => p.onContextMenu?.(evt)}
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
          {inner()}
        </div>
      </Match>
      <Match when={p.onClick === undefined && p.href === undefined}>
        <div
          class={rootClass("")}
          classList={rootClassList()}
          style={BORDER_TRANSITION}
          onContextMenu={(evt) => p.onContextMenu?.(evt)}
        >
          {inner()}
        </div>
      </Match>
    </Switch>
  );
}
