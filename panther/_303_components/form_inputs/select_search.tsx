// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { batch, createEffect, createMemo, For, type JSX, Show } from "solid-js";
import { t3 } from "../deps.ts";
import { hideTooltip, showTooltip } from "../special_state/tooltip.tsx";
import type { SelectOption } from "./types.ts";
import { CheckSvg } from "./_internal/check_glyphs.tsx";
import {
  ComboBoxFrame,
  createComboBoxPanel,
  getSearchText,
} from "./_internal/combo_box.tsx";

type SelectSearchProps<T extends string> = {
  value: T | undefined;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  label?: string | JSX.Element;
  placeholder?: string;
  fullWidth?: boolean;
  size?: "sm";
  mono?: boolean;
  disabled?: boolean;
  invalidMsg?: string;
};

// Combo-box single-select: the searchable peer of Select, sharing the panel
// mechanism and chrome with MultiSelectSearch via ComboBoxFrame. What is
// specific to the single-select case lives here: the closed-state label, the
// filter, and rows that commit-and-close on click.
//
// Options keep their given order — pinning the one selected option to the top
// (what the multi peer does with its N selections) would buy nothing and
// destroy the ordering the user navigates by, so the selection is scrolled
// into view instead, which is what a native <select> does.
export function SelectSearch<T extends string>(p: SelectSearchProps<T>) {
  const panel = createComboBoxPanel();
  let listRef: HTMLDivElement | undefined;
  let selectedRowRef: HTMLDivElement | undefined;
  let closedLabelRef: HTMLSpanElement | undefined;

  const selectedOption = createMemo(() =>
    p.options.find((opt) => opt.value === p.value)
  );

  const selectedText = createMemo(() => {
    const opt = selectedOption();
    return opt ? getSearchText(opt) : undefined;
  });

  const filteredOptions = createMemo(() => {
    const q = panel.query().trim().toLowerCase();
    if (!q) {
      return p.options;
    }
    return p.options.filter((opt) =>
      getSearchText(opt).toLowerCase().includes(q)
    );
  });

  function selectValue(value: T) {
    batch(() => {
      p.onChange(value);
      panel.closePanel();
    });
  }

  // Keeps the selected row visible without delegating to scrollIntoView, whose
  // "nearest" walk climbs every ancestor scrolling box up to the viewport —
  // from inside a top-layer popover that means scrolling the page behind it
  // (which moves the anchor, so the panel follows and the row still never
  // comes into view). Scrolling the list box itself is the whole intent.
  function scrollSelectedRowIntoView() {
    if (!listRef || !selectedRowRef || !selectedRowRef.isConnected) {
      return;
    }
    const list = listRef.getBoundingClientRect();
    const row = selectedRowRef.getBoundingClientRect();
    if (row.top < list.top) {
      listRef.scrollTop += row.top - list.top;
    } else if (row.bottom > list.bottom) {
      listRef.scrollTop += row.bottom - list.bottom;
    }
  }

  // Re-runs on every change to the visible list, not just at open: filtering
  // the selected option out and back in re-creates its row with the list
  // scrolled to the top, so a one-shot-at-open scroll would leave the
  // selection off-screen. rAF (not a microtask) so the anchored panel has been
  // laid out before the rects are read.
  createEffect(() => {
    const isOpen = panel.open();
    const opts = filteredOptions();
    if (isOpen && opts.length > 0) {
      requestAnimationFrame(scrollSelectedRowIntoView);
    }
  });

  return (
    <ComboBoxFrame
      panel={panel}
      displayText={selectedText()}
      overlay={
        <span ref={closedLabelRef} class="min-w-0 truncate">
          {selectedText()}
        </span>
      }
      label={p.label}
      placeholder={p.placeholder}
      fullWidth={p.fullWidth}
      size={p.size}
      mono={p.mono}
      disabled={p.disabled}
      invalidMsg={p.invalidMsg}
      onTriggerMouseEnter={(e) => {
        const text = selectedText();
        if (
          text && closedLabelRef &&
          closedLabelRef.scrollWidth > closedLabelRef.clientWidth
        ) {
          showTooltip({
            anchor: e.currentTarget.getBoundingClientRect(),
            content: text,
            position: "right",
            size: "sm",
          });
        }
      }}
    >
      <div
        ref={listRef}
        role="listbox"
        class="flex-1 overflow-y-auto overscroll-contain p-1"
      >
        <For each={filteredOptions()}>
          {(opt) => {
            let labelRef: HTMLSpanElement | undefined;
            const isSelected = () => opt.value === p.value;
            return (
              <div
                ref={(el) => {
                  if (isSelected()) {
                    selectedRowRef = el;
                  }
                }}
                role="option"
                aria-selected={isSelected()}
                class="ui-hoverable-base-100 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm"
                onClick={() => selectValue(opt.value)}
                onMouseEnter={(e) => {
                  if (labelRef && labelRef.scrollWidth > labelRef.clientWidth) {
                    showTooltip({
                      anchor: e.currentTarget.getBoundingClientRect(),
                      content: getSearchText(opt),
                      position: "right",
                      size: "sm",
                    });
                  }
                }}
                onMouseLeave={hideTooltip}
              >
                {
                  /* A bare check, not the multi peer's check square: a square is
                    a checkbox affordance (it can be un-checked), and a
                    single-select row cannot be un-picked. The gutter is sized
                    to match the peer's square so labels align across both. */
                }
                <span class="relative h-4 w-4 flex-none">
                  <Show when={isSelected()}>
                    <CheckSvg class="text-base-content pointer-events-none absolute inset-0 m-auto h-3 w-3" />
                  </Show>
                </span>
                <span
                  ref={labelRef}
                  class="flex-1 select-none truncate data-[mono=true]:font-mono data-[mono=true]:text-xs"
                  data-mono={p.mono}
                >
                  {opt.label}
                </span>
              </div>
            );
          }}
        </For>
        <Show when={filteredOptions().length === 0}>
          <div class="text-base-content-muted px-2 py-1 text-sm">
            {t3({
              en: "No matching options",
              fr: "Aucune option correspondante",
              pt: "Sem opções correspondentes",
            })}
          </div>
        </Show>
      </div>
    </ComboBoxFrame>
  );
}
